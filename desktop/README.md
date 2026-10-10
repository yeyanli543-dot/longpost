# LongPost 桌面版

一个**完全离线**的写作工具：写 Markdown、插图表、放附件，一键导出成可以随手转发的网页。
所有内容都保存在你自己的电脑上 —— 不联网、不注册、不上传。

它是 `longpost/desktop` 目录下的独立 Electron 应用，和同仓库里的 Web 版互不影响，
可以单独拿出来跑、单独打包。

---

## 它长什么样

左边文章列表，右边左边写 Markdown、右边实时预览。图表不是图片，是插在正文里的一段结构化数据，
所以同一篇稿子导出成网页以后，图表还是活的（能 hover 看数值）。

---

## 为什么是桌面应用，而不是网页

最开始这需求是「在 X 上贴个链接，别人点开就能读长文」，那需要一台对公网开放、且不拦游客的服务器。
这条路在上面那个 Web 版里被平台限制挡住了（平台会在请求到达应用前跳登录页）。

桌面版换了个思路：**不要服务器**。数据在你本机，导出的 HTML 是自包含文件，
发给别人（微信、邮件、X 私信都行）双击就能看。代价是每次要手动发一次文件，
好处是零成本、零备案、零运维，也不会因为服务器欠费而打不开。

---

## 跑起来

```bash
cd desktop
npm install
npm start
```

要求 Node.js 18+（开发时用的是 22）。

> **有三样东西不在仓库里，`npm install` 时会自动生成**（见 `package.json` 的 `prepare`）：
>
> | 生成物 | 来源 | 为什么不进仓库 |
> | --- | --- | --- |
> | `renderer/vendor/echarts.min.js` | `node_modules` 里的 echarts | 1.1 MB 的压缩产物，不该进版本库 |
> | `resources/icon.png` | `scripts/make-icon.js` 现场画 | 二进制文件，能确定性地生成 |
> | `package-lock.json` | npm 安装时生成 | 子应用锁文件随平台变化；依赖版本已在 `package.json` 里钉死为精确版本 |
>
> 所以 `npm ci` 之前请先确认 `echarts` 能装上 —— 它是桌面版自己的 `dependencies`。
> 需要单独重跑生成：`npm run vendor`、`npm run icon`。

## 打包成安装包

```bash
npm run dist:win     # Windows：.exe 安装版 + 免安装版
npm run dist:mac     # macOS：.dmg
npm run dist:linux   # Linux：.AppImage
```

产物在 `desktop/release/`。

> 在 Linux 上交叉打 Windows 包需要额外装 wine，比较折腾。
> 仓库里配了 GitHub Actions（`.github/workflows/desktop-release.yml`），
> 推代码上去它会分别在 Windows / macOS / Linux 三台机器上各打一份，
> 打完的安装包可以直接从 Actions 页面或 Release 页面下载 —— 这是最省事的取 .exe 方式。

---

## 数据放在哪

| 平台 | 路径 |
| --- | --- |
| Windows | `%APPDATA%\LongPost\data` |
| macOS | `~/Library/Application Support/LongPost/data` |
| Linux | `~/.config/LongPost/data` |

目录里是三样东西：

```
data/
├── articles.json    所有文章（标题、正文、标签）
├── settings.json    界面设置
└── files/           导入的图片和附件
```

**卸载应用不会删掉这个目录**，重装之后文章还在。换电脑直接把这个目录拷过去就行。
界面上左下角的「数据目录」按钮可以直接打开它。

---

## 功能

- **Markdown 写作**：标题、加粗、斜体、删除线、行内代码、代码块、有序/无序列表、
  引用、表格、分隔线、链接、图片
- **图表**：柱状图 / 折线图 / 面积图 / 饼图，七种颜色自动配色，高度可调
- **附件**：任意文件或图片，导入时复制进数据目录，不会因为原始文件被删掉而失效
- **实时预览**：边写边看，图表即时绘制
- **自动保存**：停止输入约 1 秒后自动存盘，`Ctrl/Cmd + S` 立即保存
- **导出**：导出自包含 HTML（图表运行库内联、附件同目录落盘）、导出 Markdown
- **搜索**：在标题和正文里搜

### 快捷键

| 按键 | 作用 |
| --- | --- |
| `Ctrl/Cmd + S` | 立即保存 |
| `Ctrl/Cmd + N` | 新建文章 |
| `Esc` | 关闭弹窗 |
| `F12` | 开发者工具（排查问题用） |

---

## 图表怎么写

图表在正文里就是一个 ```chart 围栏，内容是 JSON：

````markdown
```chart
{
  "type": "bar",
  "title": "每月发布篇数",
  "xAxis": ["3月", "4月", "5月", "6月"],
  "series": [{ "name": "发布", "data": [4, 7, 5, 9] }],
  "height": 320
}
```
````

- `type`：`bar` / `line` / `area` / `pie`
- `xAxis`：类目轴（饼图不用）
- `series`：可多条，`{ name, data }`
- 饼图用 `data: [{ name, value }]`
- `height`：200–800，可省略（默认 360）

一般不用手写，点工具栏「图表」按钮，在弹窗里填数就行，弹窗里有实时预览。

这个格式和 Web 版共用的 `shared/chart-card.ts` 完全一致，
所以同一篇文章在网页端和桌面端渲染出来的图表是一样的。

---

## 自检

```bash
npm test              # 纯逻辑自检：Markdown 渲染、安全性、图表解析、导出组装、语法检查
npm run verify:export # 端到端：造一篇文章导出，再真的打开它，检查图表和图片有没有出来
npm run verify:ui     # 启动界面模拟一次真实写作，截图存到 .verify/ui.png
```

`verify:ui` 和 `verify:export` 需要图形环境。无头机器上可以套一层：

```bash
xvfb-run -a npm run verify:ui
```

主进程还有个自检开关，手动排查时也能用：

```bash
electron . --smoke=/tmp/shot.png                      # 启动后截图再退出
electron . --smoke=/tmp/shot.png --smoke-script=x.js  # 截图前先在界面里跑一段脚本
```

---

## 目录结构

```
desktop/
├── main.js                  Electron 主进程：建窗口、读写数据、导入附件、导出
├── preload.js               渲染层能用的全部能力（contextBridge）
├── lib/
│   ├── store.js             本地存储：articles.json / settings.json / files/
│   ├── markdown.js          Markdown 渲染器（纯函数，预览和导出共用）
│   ├── chart.js             图表卡片：```chart 解析 + ECharts option 组装
│   └── export-html.js       导出自包含 HTML
├── renderer/
│   ├── index.html
│   ├── style.css
│   ├── app.js               界面逻辑
│   └── vendor/echarts.min.js   （生成物，不入库）
├── resources/icon.png       应用图标（生成物，不入库）
└── scripts/
    ├── make-icon.js         生成图标
    ├── sync-vendor.js       从 node_modules 复制 echarts 到 renderer/vendor
    ├── smoke-test.js        逻辑自检
    ├── ui-scenario.js       界面场景脚本
    └── verify-export.js     导出链路的端到端验证
```

---

## 已知边界

- **没有多设备同步**。数据只在本机。想要同步得自己搭服务，或者手动拷数据目录。
- **没有 iOS / Android 版**。要出手机版得另做（Android 可行，iOS 需要 Mac + Xcode，且上架要年费）。
- **导出的 HTML 是「一篇文章 + 一个同目录附件文件夹」**。发的时候记得把 `.files` 文件夹一起发，
  只发 `.html` 的话图片会缺。
- 免费 Apple ID 签名的 macOS 应用有有效期限制；Windows 上首次运行可能被 SmartScreen 拦一下
  （因为没有买代码签名证书），点「更多信息 → 仍要运行」即可。

---

## 许可证

MIT，见仓库根目录的 `LICENSE`。
