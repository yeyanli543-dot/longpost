# LongPost 全面体检与优化报告

> 日期：2026-10-18
> 基线：本地工作区（package.json 原为 2.9.5） + `longpost_v2_9_7_codebase_allinone.txt` 对照
> 结论版本：**v2.9.7**

---

## 一、先说结论：为什么你在 Gemini 里"看不到 argon 改出来的结果"

不是 Argon 没干活，是**它干的活从来没有接回主线**。

本地仓库里同时躺着三套并行实现：

```
longpost/
├── client/          ← 真正被 Vite 打包的前端（@ 别名指向 client/src）
├── server/          ← 真正被 nest build 编译的后端（sourceRoot = server）
├── shared/          ← 真正被两端共享的纯逻辑
├── src/             ← ❌ argon 影子前端（依赖 zustand/dexie，而这两个包根本没装）
├── backend/         ← ❌ argon 影子后端（sourceRoot 之外，永不编译）
└── electron/        ← ❌ argon 影子主进程（desktop/main.js 才是真的）
```

验证方式（任一条都能证明它们是死代码）：

| 工具 | 配置 | 结果 |
| :--- | :--- | :--- |
| Vite | `root: client`，`@` → `client/src` | 根 `src/` 不可达 |
| tsc (前端) | `include: ["client/**/*", "shared/**/*"]` | `src/` 不参与类型检查 |
| tsc (后端) | `include: ["server/**/*", "shared/**/*.ts"]` | `backend/`、`electron/` 不参与 |
| Nest | `sourceRoot: "server"` | `backend/` 不参与编译 |
| 测试 | `node --test test/*.test.mjs` | 没有任何测试 import 它们 |

`src/` 里 `import zustand`、`import Dexie` 而 `package.json` 里查无此包 —— 连 resolve 都过不去。

**已处理**：三个目录整体移入 `archive/`，并附 `archive/README.md` 逐文件对照"原型 → 主线最终实现"。
内容一字未删，想恢复直接移回来即可。

---

## 二、体检发现的问题（按严重度）

### 🔴 P0-1：SSRF —— 服务端会替任何人访问任意内网地址

`server/modules/sync/sync.controller.ts` 的 WebDAV 中继只挡了 `localhost` / `.local` / `.internal` 三个字符串：

```ts
if (hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal'))
```

于是 `http://127.0.0.1:8080`、`http://169.254.169.254/latest/meta-data`（云厂商元数据）、
`http://192.168.1.1`、`http://[::1]` **全部放行**。任何登录用户都能把它当内网跳板。

更糟的是：`test/webdav-ssrf.test.mjs` 里有一份 `isPrivateIp` 的**复制品**，测试全绿，
但它测的是测试文件里的那份，生产代码根本没调用 —— 虚假的安全感。

**修复**：新建 `server/common/security/outbound-host-guard.ts`，四层防护：

1. 协议白名单（仅 http/https）；
2. 主机名黑名单（localhost / *.local / *.internal / *.home.arpa / metadata）；
3. **DNS 解析期校验**：`resolvePublicHost()` 逐条检查 A/AAAA 记录，命中内网直接拒；
4. **连接期复核**：`createGuardedLookup()` 作为 `http.request` 的 `lookup` 回调，
   连接时再查一次 —— 这一层专门防 DNS rebinding（校验完再改解析结果）。
   IPv4-mapped IPv6（`::ffff:127.0.0.1`、`::ffff:7f00:1`）、CGNAT、NAT64 前缀都已覆盖。

附带加固：响应体 32MB 上限、拒绝 URL 内嵌账号密码、403 日志留痕。

### 🔴 P0-2：74 个测试，没有一个在测生产代码

16 个测试文件里，**每一个**只 import `node:test` / `node:assert` / `node:crypto` 等内置模块，
所有被测逻辑都是"抄一份到测试文件里"。典型：

```js
/** 冲突标题生成器（模拟 shared/sync/sync-protocol.ts） */
function formatConflictTitle(...) { ... }   // ← 抄的
```

后果：线上代码改坏了，测试照样全绿（P0-1 就是活证据）。

**修复**：

- 新增 `test/register-aliases.mjs`，用 Node 24 的 `module.registerHooks` 在解析期把
  `@/`、`@shared/`、`@client/` 映射回真实文件，`npm test` 通过 `--import` 自动加载；
- 测试直接 import 生产模块（Node 24 原生擦除 TS 类型，无需编译）；
- 已改造 5 个测试文件：SSRF 守卫、同步协议、三向裁决、盘古之白、RSS/Atom 生成器。

**测试数 74 → 91，且 100% 打在生产代码上。**

### 🔴 P0-3：同步裁决逻辑焊死在网络 IO 里，无法单测

`sync-coordinator.ts` 的 270 行里，裁决条件与 `client.getNote()` / `platform.saveArticleLocal()`
交错在一起，测不了，只能抄。

**修复**：抽出 `shared/sync/three-way-merge.ts`，纯函数 `decideThreeWayAction({ hasLocal, localChecksum, baseItem, remoteItem })`
返回 10 种动作之一。协调器改成 `switch`，IO 逻辑一行未改。

顺带发现并修掉一个**永不可达分支**：原代码 C2（仅本地修改）判断在 C5（首次上传）之前，
新文章必然命中 C2，`PUSH_NEW` 分支永远走不到。现在显式前置 `!remoteItem && !baseItem` 判断，
语义清晰且行为等价（两者最终 rev 都是 1）。

### 🟠 P1-4：构建产物只增不减，dist/client 堆了 114MB / 1381 个 chunk

`vite.config.ts` 写着 `emptyOutDir: false`。每次构建只新增不清理，多次构建后
`dist/client/assets` 里躺着 1381 个文件、114.71 MB，其中 8 个 `index-*.js` 各 2.5–8.6 MB（都是历史残留）。

**修复**：改 `emptyOutDir: true`，并清理现存垃圾。当前构建后：174 个 chunk / 7.52 MB。

### 🟠 P1-5：首屏 2.78MB 单包

`app.tsx` 把 20+ 页面全部静态 import，首页要一次性下载编辑器、图表、会议、后台全部代码。

**修复**：全部路由改 `React.lazy` + `Suspense` 占位。

| 指标 | 优化前 | 优化后 | 变化 |
| :--- | ---: | ---: | ---: |
| 入口 chunk | 2,776.86 kB | 392.70 kB | **−86%** |
| 入口 gzip | 847.38 kB | 123.78 kB | **−85%** |
| dist/client 体积 | 114.71 MB | 7.52 MB | **−93%** |
| dist/client 文件数 | 1381 | 174 | **−87%** |

### 🟡 P2-6：版本号散落 16 处，"界面一套、安装包另一套"

`package.json`、三个子包、README、RSS generator、设置页、桌面渲染层、打包脚本各写各的，
发版必漏。这也是你"记不清最后一位是几"的直接原因。

**修复**：新增 `shared/version.ts` 作为唯一事实源；设置页、RSS/Atom `<generator>` 改为读常量；
打包脚本改为从 `package.json` 读版本（`scripts/create-clean-zip.ps1`、`scripts/pack-for-argon.cjs`）；
CI workflow 的兜底 tag 统一到 v2.9.7。全库统一为 **2.9.7**。

### 🟡 P2-7：半截功能 / 小缺陷

| 问题 | 处理 |
| :--- | :--- |
| `desktop/preload.js` 暴露了 `saveExportImage`，主进程也有 `export:save-image` 处理器，但 `platform.ts` 没接 → 桌面端点"保存长图"没反应 | 补齐 `platform.saveExportImage()` |
| `client/src/types/models.ts` 内容是 `export * from '../../src/types/models'`（自引用到影子目录） | 删除（全库无人 import） |
| `client/src/services/` 空目录 | 删除 |
| `scripts/create-clean-zip.ps1` 写死 `C:\Users\14948\Desktop` 与 2.9.5 | 改为从脚本位置推导 + 读 package.json |
| 草稿保存无竞态保护，切文档可能互相覆盖 | 移植 `pendingDraftSnapshot` + `flushPendingSave()` 防抖锁 |
| Gemini 配置有 `customBaseUrl` 类型字段但 UI 不暴露 | 设置面板补上输入框 |

---

## 三、关于那份 `v2.9.7 all-in-one.txt`

**重要结论：它不能当作可信源码直接覆盖。**

它确实比本地新（多了 WebDAV 全量备份/恢复、长图落盘、草稿防抖锁、自定义网关），
但在经过聊天/导出管道时被**系统性破坏**：

| 破坏类型 | 实例 | 后果 |
| :--- | :--- | :--- |
| HTML 实体被解码 | `.replace(/&/g, '&amp;')` → `.replace(/&/g, '&')` | 转义函数直接失效 |
| 正则被实体化 | `VariantProps<typeof x>` → `VariantProps&lt;typeof x&gt;` | TSX 语法错误 |
| 链接被改写成搜索引擎跳转 | `https://github.com/...` → `https://www.google.com/search?q=...` | 文档/打包脚本里的 URL 全废 |
| **整行丢失** | `api_response_code.ts` 里 11 行状态码映射变成空白 | `Record<ResponseCode, number>` 缺键，编译失败 |
| Markdown 片段被吞 | `// Images: ![alt](url)` → `// Images: ` | 注释语义丢失 |

因此采取的策略是：**以本地可编译的代码为基线，只从 dump 中逐条甄别、手工移植确认为真的增量**。
已移植并验证：

1. WebDAV 全量备份 / 合并式恢复（`webdav-client.ts` + `SyncSettingsModal.tsx` 双按钮）
2. `platform.saveExportImage()`（补全 preload → main → 平台层链路）
3. `LocalFirstStore` 草稿防抖竞态锁
4. Gemini 自定义网关输入框

未采纳的项及原因：`api_response_code`（dump 丢行）、`wechat-formatter`/`epub-builder`/`ExportModal`
（dump 的实体转义已损坏，本地版本正确且更新）、`sync.controller` 的内存版 push/pull 接口
（数据存 `Map`，重启即丢，不具备生产价值）。

---

## 四、改动清单

**新增**
- `shared/version.ts` — 版本号唯一事实源
- `shared/sync/three-way-merge.ts` — 三向合并纯函数裁决引擎
- `shared/sync/basic-auth.ts` — RFC 7617 Basic Auth 生成
- `shared/text/pangu.ts` — 盘古之白排版（从组件中抽出）
- `server/common/security/outbound-host-guard.ts` — SSRF 四层守卫
- `test/register-aliases.mjs` — 测试期路径别名解析
- `archive/README.md` — 影子目录归档说明与对照表
- `docs/OPTIMIZATION-REPORT-2026-10.md` — 本文件

**修改**
- `server/modules/sync/sync.controller.ts` — 接入 SSRF 守卫、响应体上限、连接期 DNS 复核
- `client/src/lib/sync/sync-coordinator.ts` — 改用纯函数裁决（switch 重构）
- `client/src/lib/sync/webdav-client.ts` — 全量备份/恢复 + Basic Auth 抽离
- `client/src/components/sync/SyncSettingsModal.tsx` — 备份/恢复按钮
- `client/src/components/editor/ai/AiSettingsModal.tsx` — 自定义网关
- `client/src/components/editor/tools/WritingLab.tsx` — 改用 shared 版盘古
- `client/src/lib/platform.ts` — saveExportImage
- `client/src/lib/local-store.ts` — 防抖竞态锁
- `client/src/app.tsx` — 路由级代码分割
- `client/src/pages/SettingsPage/*` — 版本读常量
- `server/common/utils/rss-builder.ts` — 版本读常量
- `vite.config.ts` — emptyOutDir
- `package.json` / 子包 / README / workflows / 打包脚本 — 2.9.7
- `AGENTS.md` — 补充仓库结构与工程约定

**删除**
- `src/`、`backend/`、`electron/` → 移入 `archive/`
- `client/src/types/models.ts`（自引用死文件）
- `client/src/services/`（空目录）

---

## 五、验证结果

| 检查项 | 结果 |
| :--- | :--- |
| `tsc --noEmit`（client） | ✅ 0 错误 |
| `tsc --noEmit`（server） | ✅ 0 错误 |
| `npm test` | ✅ **91 / 91 通过**（原 74，全部改为真实 import） |
| `npm run build:server` | ✅ SWC 编译 104 文件 |
| `npm run build:client` | ✅ 174 chunks / 7.52 MB |
| 入口包体积 | ✅ 2,776 kB → 393 kB |

---

## 六、第二轮：把"假测试"全部换成真测试

第一轮只改造了 5 个测试文件。本轮把剩下 11 个全部处理完，判定标准只有一条：
**测试必须 import 生产代码，否则不算测试。**

### 6.1 处理结果

| 测试文件 | 原状态 | 处理方式 |
| :--- | :--- | :--- |
| `content-guard` | 抄了整个 DFA 类 | import 真实 `ContentGuard` |
| `webp-and-s3-uploader` | 抄了跳过规则/缩放/签名 | 抽出 `calculateScaledDimensions`、`extractImageUrls`，导出 SigV4 辅助函数后 import |
| `epub-and-presentation` | 抄了 CRC32/XHTML 清洗/幻灯片切分 | `splitSlides` 抽到 `shared/text/slides.ts` 后 import |
| `ecosystem-syndication` | 抄了 Obsidian/公众号导出 | import 真实导出器 |
| `hot-score` | 抄了加权分与游标 | 抽出 `server/common/utils/hot-score.ts`，服务端与测试共用 |
| `csv-escape` | 抄了转义函数 | 抽出 `server/common/utils/csv.ts` |
| `security` | 抄了通行码与 tokenVersion 判断 | 抽出 `access-code.ts` / `token-version.ts` 并接入守卫 |
| `jwt-auth-and-sync` | **在测试里定义函数再断言自己** | 抽出 `jwt-payload.ts`，改为真实验证 |
| `data-integrity-and-cascade` | 模拟一个假数据库再断言它 | 改为读取真实 Drizzle schema 校验唯一索引与级联规则 |
| `ai-and-editor-enhancements` | 抄了切词/表格/大纲/折叠 | 抽出 `markdown-table.ts`、`headings.ts` 后 import |
| `punch-hole-and-theme` | 在测试里定义常量再断言它 | 改为校验真实 `index.css` 与 `useTheme.ts` 的一致性 |
| `canvasRenderer` | 被测模块**根本不在发布代码里** | 删除（仅存在于 `archive/` 原型中） |

### 6.2 转换过程中发现并修掉的真 bug

| # | 问题 | 影响 | 状态 |
| :--- | :--- | :--- | :--- |
| 1 | `extractHeadings` 不跳过 Fenced 代码块 | 代码里的 `# 注释` 会被当成标题塞进编辑器大纲 | ✅ 已修（与测试期望对齐） |
| 2 | `buildWeChatHtml` 对正文原生 HTML 不做清理 | `<script>` / `onerror=` / `javascript:` 原样进入生成的富文本，复制他人文章再粘贴到公众号会连带注入 | ✅ 新增 `stripDangerousHtml()` |
| 3 | JWT 守卫只判断 `!payload`，不校验 `sub` | 无 `sub` 的令牌靠下游查库兜底，语义模糊且多一次 DB 往返 | ✅ 新增 `isAccessTokenPayloadUsable()` |
| 4 | `PUSH_NEW` 分支永不可达（第一轮发现） | 新文章走 `PUSH_UPDATE`，语义错位 | ✅ 已修 |

> 注意 1、2、3 的共同点：**旧测试里的"抄写版"是正确实现，生产代码才是错的**。
> 这正是"抄一份再测"最危险的地方 —— 测试绿着，坏的是线上。

### 6.3 本轮新增的可测试纯模块

```
shared/text/slides.ts           幻灯片切分
shared/text/markdown-table.ts   Markdown 表格解析/序列化
shared/text/headings.ts         文档大纲提取
server/common/utils/hot-score.ts        热度分与 keyset 游标
server/common/utils/csv.ts              CSV 公式注入转义
server/common/utils/access-code.ts      通行码生成（crypto.randomInt）
server/common/utils/token-version.ts    JWT 即时吊销判定
server/common/utils/jwt-payload.ts      Access Token 载荷校验
client/src/lib/markdown/image-extract.ts 正文图片链接提取
```

---

## 七、最终验证

| 检查项 | 结果 |
| :--- | :--- |
| `tsc --noEmit`（client） | ✅ 0 错误 |
| `tsc --noEmit`（server） | ✅ 0 错误 |
| `eslint . --quiet` | ✅ 0 错误 |
| `stylelint` | ✅ 通过 |
| `npm test` | ✅ **107 / 107 通过**（初始 74，全部真实 import） |
| `npm run build:server` | ✅ SWC 编译 112 文件 |
| `npm run build:client` | ✅ 构建 2.3s，入口 393 kB（gzip 124 kB） |

测试文件从「16 个全是抄写」变成「15 个全部 import 生产代码」（`canvasRenderer` 因被测模块不存在而删除），
测试数量 74 → 107，覆盖率从"0 行生产代码"变成"覆盖 shared/ 全部纯逻辑 + server 关键工具 + client 关键算法"。

---

## 八、仍建议后续处理

1. **死组件**：`SettingsPage/AdminContentCard.tsx`、`SettingsPage/SiteSettingsCard.tsx`、
   `ExamplePage/ExamplePage.tsx`、`components/HashtagText.tsx` 全库无引用（约 20KB），建议确认后清理或接回路由。
2. **服务端同步接口**：dump 里的内存版 `/api/sync/push|pull` 未采纳；若需要服务端同步，应基于 Drizzle 建表实现。
3. **Git 卫生**：工作区仍有大量未提交改动，建议按「安全修复 / 结构整理 / 性能优化」分批提交。
