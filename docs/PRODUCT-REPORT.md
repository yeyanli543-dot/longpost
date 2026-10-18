# LongPost 产品报告

> 版本：**v2.9.8** · 更新日期：2026-10-18
> 面向对象：项目维护者、部署者、评估者
> 配套文档：[使用说明](./USER-GUIDE.md) · [优化报告](./OPTIMIZATION-REPORT-2026-10.md)

---

## 一、产品概览

### 1.1 一句话

LongPost 是一套**长文创作与社交发布**系统：短帖引流、长文沉淀，同一份代码同时支撑「联网的社区平台」与「完全离线的个人写作台」。

### 1.2 两条产品线

很多人第一次接触时会误以为桌面包是 Web 版的壳。实际不是——这是两条**各自独立**的渲染层，共享底层协议与算法，但不共享 UI 代码：

| 维度 | **Web 社交平台** | **本地写作台（桌面 / 安卓）** |
| :--- | :--- | :--- |
| 代码 | `client/`（React 19）+ `server/`（NestJS） | `desktop/renderer/`（原生 JS，无框架无打包器） |
| 运行时 | 浏览器 / Node 22 | Electron 44 / Capacitor 8 WebView |
| 数据 | PostgreSQL + Drizzle ORM | 本机 JSON 文件（桌面）/ IndexedDB（安卓） |
| 联网 | 必需 | 不需要；只有 AI、WebDAV、更新检查会联网 |
| 账号 | 邮箱密码、Google OAuth、通行码空间 | 无账号体系，用「通行码 / Google 邮箱 + 口令」隔离本地空间 |
| 定位 | 公开发布、社区互动、会议 | 私人写作、归档、导出 |
| 分发 | Docker / PM2 自建 | GitHub Releases 安装包 |

> 为什么不做成一套？社区要联网、要鉴权、要实时；写作台要求断网可用、数据 100% 在本机。硬揉成一套，两边都会做不好。

### 1.3 目标用户

- **个人写作者**：需要本地优先、可导出、不被平台锁定的长文工具；
- **小团队 / 社区**：想自建一个长文发布与讨论的地方，而不是寄居在内容平台；
- **重视数据主权的人**：希望文章存在自己电脑上，同步走自己的 WebDAV。

### 1.4 与同类产品的差异

| 能力 | LongPost | 典型博客系统 | 典型笔记软件 |
| :--- | :--- | :--- | :--- |
| 短帖 + 长文双形态 | ✅ | ❌ | ❌ |
| 免登录分享页 | ✅ | 部分 | ❌ |
| 完全离线可用 | ✅（桌面/安卓） | ❌ | ✅ |
| 正文内嵌交互式图表 | ✅（ECharts 活数据） | 插件 | 插件 |
| 自带 AI 写作助手 | ✅（三家模型 + 三级取用） | 插件 | 部分 |
| WebDAV 跨端同步 | ✅ | ❌ | 部分 |
| 双工作区（极简 / 专业） | ✅ | ❌ | ❌ |

---

## 二、功能全景

### 2.1 Web 社交平台

**内容**
- 短帖（限字数）与长文双形态；短帖可挂载指向长文的链接，形成「引流 → 阅读」闭环
- 长文自动生成免登录短链 `/p/<slug>`，外部访客无需注册即可阅读全文与图表
- Markdown 正文，支持 `chart` 围栏（柱/折线/面积/饼）、Mermaid 流程图、KaTeX 公式
- 封面、标签、话题（#）、@提及、附件与图床

**互动**
- 点赞、收藏、转发（含引用转发）
- 评论：楼中楼、评论点赞、按最新/最热排序、软删除
- 关注 / 粉丝、个人主页、关注流
- 通知中心：点赞、转发、评论、新粉丝、提及、会议邀请
- 站内私信（Socket.IO 实时）

**会议**
- 预约会议、6 位会议码、公开/私密
- 站内视频会议室：摄像头、麦克风、屏幕共享、会中聊天、在线名单
- 会议纪要：创建者可编辑，参会者可查看

**管理**
- 站长后台：用户、内容、举报处理、站点设置
- 通行码体系：一码一空间，独立文章库；支持批量生成与使用日志
- 内容风控：DFA 敏感词检测（可穿透「兼*职-刷_单」这类插字符伪装）

### 2.2 本地写作台

- **Markdown 编辑器**：双栏实时预览、大纲、查找替换、格式工具条、斜杠指令
- **增强渲染**：代码高亮（Prism）、数学公式（KaTeX）、6 种 Mermaid 图、ECharts 图表卡片
- **四大生产力工具**：知识图谱、写作体检实验室、版本差分器、灵感白板
- **演示模式**：Markdown 按 `---` 切页，全屏放映
- **导出**：HTML（自包含单文件）、Markdown、PDF、EPUB、分享长图
- **本地空间**：通行码 / Google 邮箱 + 口令隔离，互不可见
- **应用内更新**：启动自动检查，弹横幅，一键下载校验安装（v2.9.9 起生效）

### 2.3 跨端能力

| 能力 | 说明 |
| :--- | :--- |
| **AI 助手** | 划词 → 润色/精简/排版/续写；OpenAI 兼容 / Gemini / Ollama；三级取用（本机 Key → 账号托管 → 站点额度） |
| **WebDAV 同步** | 三向合并、墓碑删除、冲突自动另存备份；全量备份/合并式恢复 |
| **导出一致性** | 网页、桌面、导出的 HTML 用同一套渲染规则，观感一致 |

---

## 三、技术架构

### 3.1 目录职责

```
longpost/
├── client/      React 19 前端（@ → client/src）
├── server/      NestJS 12 后端（Express 5，sourceRoot = server）
├── shared/      前后端共享的纯逻辑与类型（无 DOM / 无 Nest 依赖）
├── desktop/     Electron 独立子应用（自带 renderer 与 vendor）
├── mobile/      Capacitor 安卓壳（webDir 指向 desktop/renderer）
├── test/        Node 原生测试（node --test，直连生产代码）
├── scripts/     开发、打包、seed 脚本
└── archive/     历史原型归档（不参与任何构建）
```

### 3.2 分层

```
浏览器 ── React SPA ──► NestJS REST /api ──► Drizzle ──► PostgreSQL
   │                        │
   │                        ├─ Socket.IO（私信 / 会议信令）
   │                        └─ AI 网关 /api/ai（SSE 流式代理）
   │
   └─ 静态：dist/client（NestJS 托管 + 阅读页直出）

桌面/安卓 ── 原生 JS renderer ──► LPPlatform 门面
                                   ├─ 桌面：IPC → 主进程（文件 / AI / WebDAV / 更新）
                                   └─ 安卓：IndexedDB + 浏览器 fetch
```

### 3.3 关键数据流

**阅读一篇长文（免登录）**
`GET /api/articles/:id` → 文章 + 作者 + 标签 → 客户端按 `chart` 围栏拆分渲染 → 图表懒加载 ECharts。

**跨端同步**
本地文章 + 基准快照 + 远端清单 → 三向裁决（`shared/sync/three-way-merge.ts`）→ 推送 / 拉取 / 墓碑 / 冲突另存。

**AI 调用**
编辑器划词 → `ai-router` 判定走本机 Key 还是服务端 → 服务端按「托管 Key → 站点额度」解析凭据 → 流式回传。

### 3.4 部署拓扑

```
Nginx（TLS / Upgrade 透传）
   └── Node（NestJS，单实例）
         ├── PostgreSQL
         ├── 上传目录（持久化卷）
         └── 出站：大模型 API / WebDAV
```

---

## 四、版本演进

| 版本 | 主题 | 关键变化 |
| :--- | :--- | :--- |
| v2.7.5 | 双工作区雏形 | 布局分叉、杂志排版、崩溃恢复 |
| v2.9.0 | 生态互通 | 微信公众号排版、RSS/Atom、Obsidian 导出、PWA Share Target |
| v2.9.5 | 分享修复 | 微信多场景分享、QQ 扫码、直达二维码 |
| v2.9.7 | 工程治理 | 三套影子目录归档、测试直连生产代码（74→91）、SSRF 修复、首屏 −86% |
| **v2.9.8** | 安全与体验 | 桌面/安卓接入 AI、AI 三级取用、**依赖漏洞 17 → 0**、登录节流、设置面板重构、设计令牌收敛、滚动揭示、应用内更新；框架升级 Nest 10 → 12（Express 5） |

---

## 五、工程质量

### 5.1 测试矩阵

| 套件 | 用例数 | 说明 |
| :--- | ---: | :--- |
| 单元测试（`test/*.test.mjs`） | **140** | 24 个套件，全部直连生产代码，不经编译 |
| 桌面自检（`smoke-test.js`） | **78** | 渲染、图表、导出、图标、主进程语法、AI 接线 |
| 移动端自检（`verify-mobile.js`） | **108** | 仓库层、Capacitor 配置、触摸目标、许可证、样式回归 |

单元测试覆盖：同步协议、三向合并、SSRF 守卫、登录节流、AI 加密与额度、LLM 流式解析、更新器、内容风控、CSV 注入、盘古排版、EPUB/XHTML、图表数据、热榜游标、Schema 约束。

### 5.2 质量门禁

```bash
npm run type:check   # 双端 TypeScript，0 错误
npm run eslint       # 0 error
npm test             # 140 / 140
npm run build        # server + client
cd desktop && npm test && node scripts/verify-mobile.js
```

### 5.3 构建产物

| 指标 | 数值 |
| :--- | :--- |
| 服务端编译 | 120 文件（SWC，约 0.3s） |
| 前端构建 | 约 2.3s |
| 入口 chunk | 约 393 kB（gzip 124 kB） |
| `dist/client` 总量 | 约 7.5 MB / 174 chunk |

---

## 六、安全与隐私

### 6.1 威胁模型与处置

| 风险 | 处置 | 状态 |
| :--- | :--- | :--- |
| **SSRF**（服务端代发 WebDAV 请求） | 四层守卫：协议白名单 → 主机名黑名单 → DNS 解析期内网拦截 → 连接期 lookup 复核（防 rebinding） | ✅ |
| **密码爆破** | 按「IP + 邮箱」计数，15 分钟 5 次失败锁 15 分钟，429 + retryAfter | ✅ |
| **JWT 泄露** | tokenVersion 即时吊销；改密码 / 踢下线后旧 token 立即失效 | ✅ |
| **托管 Key 泄露** | AES-256-GCM 加密入库，密钥由 `AI_KEY_SECRET` 派生；数据库泄露拿不到明文；界面只显示掩码 | ✅ |
| **弱密钥兜底** | 生产环境未配 secret 时**拒绝托管**，不再用固定常量加密 | ✅ |
| **上传攻击** | 文件名完全随机化（免疫路径穿越）、后缀白名单、**刻意不收 SVG**、图片统一 Sharp 重编码 | ✅ |
| **富文本注入** | 公众号导出前清理 `<script>` / `onerror=` / `javascript:` | ✅ |
| **依赖漏洞** | `npm audit` 从 17（3 critical）降到 **0**（生产依赖）；Nest 10 → 12、Express 5、file-type 22 一并升级 | ✅ |
| **登录 CSRF / XSS** | JWT 走 Authorization 头，不落 Cookie；React 默认转义 | ✅ |

### 6.2 残余风险

| 项 | 说明 | 建议 |
| :--- | :--- | :--- |
| 开发依赖漏洞（18 项） | 集中在构建工具链（webpack / @swc/cli / postcss 等），**不进入运行时产物** | 随工具链升级逐步消化 |
| 登录节流是进程内 | 多实例部署时各算各的 | 上多实例前换 Redis |
| 无代码签名 | macOS 首次打开需右键放行；Windows 可能触发 SmartScreen | 购买证书后接入签名 |
| 安卓 debug 签名 | 换版本需先卸载 | 正式发布前配置 release keystore |

### 6.3 数据隐私

- 桌面/安卓：正文、图片、附件**全部留在本机**，不上传；
- Web：文章存自建 PostgreSQL，不出站；
- AI：本机 Key 不经过服务端；托管 Key 加密存储；站点额度由部署者承担；
- 导出：HTML 自包含单文件，图片内联，不依赖任何服务器。

---

## 七、性能

| 场景 | 优化前 | 现在 |
| :--- | ---: | ---: |
| 入口 JS | 2,776 kB（gzip 847） | **393 kB（gzip 124）** |
| `dist/client` 体积 | 114.71 MB / 1381 chunk | **7.52 MB / 174 chunk** |
| 构建耗时 | — | 约 2.3s |
| 长文图表 | 首屏阻塞 | 路由级懒加载，进入文章才拉 ECharts |

手段：路由级 `React.lazy`、`emptyOutDir` 修正、Mermaid/KaTeX/ECharts 动态导入。

---

## 八、已知限制

1. **桌面 / 安卓不能用站点 AI 额度** —— 它们没有账号体系，只能本机填 Key。要用站点额度需走 Web 端。
2. **多实例需 Redis adapter** —— Socket.IO 的房间广播在无 adapter 时跨实例割裂，PM2 配置已锁单实例。
3. **应用内更新从 v2.9.9 起生效** —— v2.9.8 的安装包里还没有更新器。
4. **Web 端 UI 无自动化测试** —— 目前靠桌面/移动端自检与人工截图，React 组件层缺测试。
5. **开发依赖仍有 18 项告警** —— 均在构建工具链，`npm audit --omit=dev` 为 0。

---

## 九、建议的下一步

| 优先级 | 事项 | 理由 |
| :--- | :--- | :--- |
| ~~P0~~ | ~~升级 Nest 10 → 12~~ | ✅ 已完成（v2.9.8） |
| P1 | 桌面端支持「登录后使用站点额度」 | 补齐三端 AI 体验差距 |
| P1 | 多实例部署接入 Redis adapter | 支持水平扩容 |
| P2 | 加 `.gitattributes` 统一行尾 | 避免 CRLF/LF 混用造成巨型伪 diff |
| P2 | 补 React 组件层测试 | 目前 UI 回归靠人工 |
| P3 | 代码签名 + 安卓 release keystore | 消除安装时的安全提示 |

---

## 十、如何自行验证

```bash
# 1. 拉代码并装依赖
npm ci --legacy-peer-deps

# 2. 质量门禁
npm run type:check && npm run eslint && npm test

# 3. 起服务（需要 PostgreSQL）
cp .env.example .env      # 填 DATABASE_URL / JWT_SECRET / OWNER_EMAIL
npm run build && npm start

# 4. 桌面端自检
cd desktop && npm install
node scripts/smoke-test.js
node scripts/verify-mobile.js
```

部署方式（Docker / PM2 / 直接跑）见 [README 的部署章节](../README.md#-部署web-端)。
