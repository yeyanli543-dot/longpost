<div align="center">

# 🪶 LongPost

**下一代长文创作与社交平台 · 🍏 Apple 极简 ↔ 🔷 Google 专业双工作区 · 交互式活数据图表 · 免登录公开阅读 · 零服务器离线工作台**

[![Version](https://img.shields.io/badge/version-2.9.0-blue.svg)](https://github.com/yeyanli543-dot/longpost/releases/tag/v2.9.0)
[![Build Desktop](https://github.com/yeyanli543-dot/longpost/actions/workflows/desktop-release.yml/badge.svg)](https://github.com/yeyanli543-dot/longpost/actions/workflows/desktop-release.yml)
[![Build Android](https://github.com/yeyanli543-dot/longpost/actions/workflows/android-release.yml/badge.svg)](https://github.com/yeyanli543-dot/longpost/actions/workflows/android-release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=black)](https://react.dev)
[![NestJS](https://img.shields.io/badge/NestJS-10-e0234e?logo=nestjs&logoColor=white)](https://nestjs.com)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38bdf8?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Electron](https://img.shields.io/badge/Electron-44-47848F?logo=electron&logoColor=white)](https://www.electronjs.org)
[![Capacitor](https://img.shields.io/badge/Capacitor-8-119EFF?logo=capacitor&logoColor=white)](https://capacitorjs.com)
[![ECharts](https://img.shields.io/badge/ECharts-6-AA344D?logo=apacheecharts&logoColor=white)](https://echarts.apache.org)

<p align="center">
  <a href="#-多端下载">📥 多端下载</a> •
  <a href="#-双模式工作区apple-极简--google-专业">☯️ 双模式工作区</a> •
  <a href="#-交互式图表卡片活数据可视化">📊 交互式图表</a> •
  <a href="#-杂志级排版美学与信息设计">📖 杂志级排版</a> •
  <a href="#-三端代码共享架构">🏛️ 三端共享架构</a> •
  <a href="#-安全加固与原生测试套件">🛡️ 安全与测试</a> •
  <a href="#-快速开始">🚀 快速开始</a> •
  <a href="#-开源协议">📜 开源协议</a>
</p>

---

</div>

## 💡 为什么选择 LongPost？

在传统内容平台上，长文阅读通常受限于繁琐的强制登录门槛、单一静态的图文表现形式以及平台对私域流量的拦截；而在去中心化环境中，又常常面临依赖云服务宕机、数据隐私不受控的痛点。

**LongPost 采用现代全平台架构与双轨制设计**：
1. **🌐 全功能 Web 社交平台**：发短帖引流挂长文，每篇长文生成独立短码免登录分享页（如 `/p/abc12345`）。**链接转发到微信、X/Twitter 等任意平台，外部访客无需注册、无需登录，点开即可阅读全文与交互式图表**；
2. **💻 桌面工作台 & 📱 移动端**：**完全不依赖任何外部服务器**，数据 100% 留存在你的本机设备中（Local-First）。支持正文内嵌交互式图表（ECharts），一键导出自包含单文件 HTML，发出去双击就能看；
3. **☯️ 深度场景化双工作区**：首创 **🍏 Apple 极简版（HIG 纯净心流）** 与 **🔷 Google 专业版（Material 3 知识工程）**，一键瞬切，满足不同心智状态下的创作与阅读需求。

---

## 📥 多端下载 (v2.9.0 最新全平台安装包)

所有安装包均通过 GitHub Actions 自动化 CI 构建并带有防篡改校验，即下即用：

| 平台 | 安装包格式 | 下载渠道 | 说明 |
| :--- | :--- | :--- | :--- |
| **🪟 Windows** | `.exe` 安装版 / 便携版 | [**下载安装版**](https://github.com/yeyanli543-dot/longpost/releases/download/v2.9.0/LongPost.Setup.2.9.0.exe) · [**免安装便携版**](https://github.com/yeyanli543-dot/longpost/releases/download/v2.9.0/LongPost.2.9.0.exe) | 支持 Windows 10/11，便携免安装版解压双击直接运行 |
| **🤖 Android** | `.apk` 手机安装包 | [**下载 LongPost-v2.9.0-android.apk**](https://github.com/yeyanli543-dot/longpost/releases/download/v2.9.0/LongPost-v2.9.0-android.apk) | 手机端离线写作，固定签名密钥支持无缝覆盖升级 |
| **🍎 macOS** | `.dmg` 镜像 | [**下载 LongPost-2.9.0-arm64.dmg**](https://github.com/yeyanli543-dot/longpost/releases/download/v2.9.0/LongPost-2.9.0-arm64.dmg) | 支持 Apple Silicon & Intel，首次打开右键放行 |
| **🐧 Linux** | `.AppImage` | [**下载 LongPost-2.9.0.AppImage**](https://github.com/yeyanli543-dot/longpost/releases/download/v2.9.0/LongPost-2.9.0.AppImage) | 赋予执行权限 `chmod +x` 后直接运行 |
| **📦 全部版本** | 全部 5 端安装产物 | [**GitHub Releases v2.9.0 (最新发布页)**](https://github.com/yeyanli543-dot/longpost/releases/tag/v2.9.0) | 包含所有平台的安装包、源码与校验哈希 |

---

## ☯️ 双模式工作区：Apple 极简 ↔ Google 专业

LongPost 拒绝粗暴的“换皮换色”，而是从 **apple.com 官方原始 CSS 声明** 与 **Google Material Design 3 (M3) 规范** 出发，在同一套底层代码中重构出两套并存的独立骨架，支持一键瞬切（快捷键 `Alt + M` 或点击底部切换器）：

```
┌───────────────────────────┬───────────────────────────────────┬───────────────────────────────────┐
│ 维度                      │ 🍏 简洁版 (对标 apple.com / HIG)   │ 🎨 专业版 (对标 google.com / M3)   │
├───────────────────────────┼───────────────────────────────────┼───────────────────────────────────┤
│ 布局形态 (Layout)         │ 零侧栏大留白 · 880px 居中画卷      │ M3 侧边抽屉栏 + 右侧探索与热帖栏    │
│ 导航中枢 (Navigation)     │ 底部悬浮毛玻璃灵动 Dock 独占导航   │ 顶部/侧边 M3 功能带 + 扩展 FAB 浮动 │
│ 字体栈 (Font Family)      │ SF Pro Display / Text, 苹方, 无衬线 │ Google Sans, Product Sans, Roboto │
│ 杂志排版 (Typography)     │ 首字下沉 (Drop Caps) + 标点挤压连字│ 严谨等宽字符 + 标点常规间隔        │
│ 大标题字距 (Tracking)     │ -.022em (负字距，紧凑有力)         │ 0 (标准字距)                      │
│ 正文字距 (Body Tracking)  │ -0.015em (OpenType palt/kern)     │ +0.03125em (+0.5px，透气易读)     │
│ 行高节奏 (Line Height)    │ 精密小数 (1.2352 / 1.2857 / 1.7)  │ 黄金比例 (1.4 / 1.6 / 1.8)        │
│ 容器层级表现              │ 背景色色阶台阶 (Tonal step)，不描边 │ 1px 细线描边 + 海拔双阴影 (Elevation)│
│ 圆角阶梯 (Border Radius)  │ 6 / 10 / 12 / 18 / 980px (大胶囊) │ 4 / 8 / 12 / 16 / 28 / 9999px (固定)│
│ 数据图表 (ECharts)        │ 莫兰迪高雅调色 · 顶部 6px 圆角柱体 │ 活力主题色阶 · 结构化双轴对比     │
│ 特殊质感 (Paper Texture)  │ 宣纸暖阳微噪点 (warm-paper 护眼纹理)│ 纯净冷色/深灰卡片 (M3 Surface)    │
│ 开关控件 (Switch)         │ iOS 系统绿 #34c759 (透明本体+白滑块)│ M3 Primary 轨道 + On-Primary 滑块 │
│ 对话框形态 (Modal)        │ 18px-20px 毛玻璃抽屉 (带抓手 Handle)│ 28px 超大圆角 M3 Tonal 卡片       │
│ 品牌徽记                  │ macOS 红黄绿交通灯 (Red/Yellow/Green)│ Google 4-Color 蓝红黄绿经典渐变光带│
└───────────────────────────┴───────────────────────────────────┴───────────────────────────────────┘
```

### 1. 🍏 Apple 极简版（Apple Zen）
- **大留白居中专注阅读**：隐藏左右全部侧边栏，取消主列右侧边框，正文单列 `max-w-[880px]` 居中展布，界面主动“退让隐形”，还原纸质书般纯粹心流；
- **macOS / iPadOS 悬浮毛玻璃灵动 Dock**：位于屏幕底部的胶囊 Dock 独占全局导航，集成首页、搜索、快速撰写、通知、私信以及**微型用户账户快捷菜单**；
- **排版质感**：集成杂志级首字下沉（Drop Caps）、标点挤压与连字（`palt`/`kern`）、以及宣纸暖阳（`warm-paper`）护眼微噪点底纹。

### 2. 🔷 Google 专业版（Google Pro Studio）
- **完整 Material 3 空间**：标准的 M3 侧边抽屉导航栏、右下角 Material You 扩展 FAB 浮动动作按钮（“撰写”）、右侧实时热榜与探索栏；
- **全功能格式工具带（Formatting Ribbon）**：Google Docs 风格的富文本编辑带与 LaTeX 数学公式即敲即显；
- **4 大本地离线杀手级生产力工具**：
  1. 🌐 **全库知识图谱（Knowledge Graph）**：基于 ECharts 力导向拓扑引擎，扫描全库标签网络与双向引用，点击节点无缝漫游；
  2. 🔬 **写作体检实验室（Writing Lab）**：10 维文本诊断，实时字数/词频透视与 5 项排版规范自检（标题跨级、代码块未闭合、冗余空行、超长段落预警、图片缺少 Alt）；
  3. 🔍 **Git 级版本差分器（Version Diff）**：快照逐行比较算法（Myers Diff），增删高亮，一键无损回滚；
  4. 🎨 **灵感白板草图（Inspiration Board）**：HTML5 Canvas 矢量涂鸦引擎，手绘草图一键转图插入正文。

> 📖 详见技术白皮书：**[LongPost 双模式设计分工与能力集成白皮书 (DESIGN-SPEC.md)](DESIGN-SPEC.md)**。

---

## 📊 交互式图表卡片（活数据可视化）

在 Markdown 正文中使用 ````chart` 围栏，即可内嵌 **柱状图 / 折线图 / 面积图 / 饼图**。图表不仅是截图，更是活生生的可交互数据：

```markdown
```chart
{
  "type": "bar",
  "title": "2026年全平台内容转化率对比",
  "height": 280,
  "xAxis": ["短视频引流", "图文资讯", "长文沉淀", "互动图表"],
  "series": [
    { "name": "留存率", "data": [18, 34, 76, 92] },
    { "name": "完读率", "data": [12, 28, 68, 88] }
  ]
}
```
```

### v2.9.0 视觉与交互升级亮点：
- **自适应现代调色板**：浅色模式采用高雅莫兰迪色系（`#2563eb`, `#7c3aed`, `#db2777`, `#059669`），深色模式采用柔和微光色系（`#38bdf8`, `#818cf8`, `#c084fc`, `#34d399`）；
- **柱状图现代圆角**：柱体顶部统一增加 `borderRadius: [6, 6, 0, 0]`，告别生硬切角；
- **环形图优雅间隙**：饼图与环形图引入 `borderRadius: 6` 及主题自适应微隙描边；
- **双端同构还原**：React 网页端渲染、服务端直出与导出的自包含单文件离线 HTML 完全一致，悬浮探针可实时读取数值。

---

## 📖 杂志级排版美学与信息设计

针对中文长文排版的痛点，LongPost 在 CSS 渲染管道层进行了系统性优化：

1. **首字下沉（Drop Caps）**：长文开篇首段第一个汉字或英文字母自动呈现 3.25 倍字号下沉排版（支持通过 `.article-drop-cap` 控制）；
2. **中英文标点挤压与连字（CJK Punctuation Kerning）**：应用 OpenType `font-feature-settings: "palt", "kern"` 与 `text-rendering: optimizeLegibility`，消除标点过度留白，视觉排版整齐紧凑；
3. **盘古之白排版算法（Pangu Spacing）**：智能在中英文、数字与百分比之间保持规范间距，并严格保护行内代码与代码块不被篡改；
4. **宣纸暖阳微纹理（Warm Paper）**：在暖纸模式下注入 `radial-gradient` 极微噪点底纹与柔和纸质背景色，彻底告别单调纯白，提供沉浸温润的阅读体验。

---

## 🏛️ 三端代码共享架构

同一个代码仓库，通过现代工程化解耦，完美支撑从**本地离线写作端**到**高并发公网社交平台**的全部场景：

```
┌────────────────────────────────────────────────────────────────────────┐
│                              LongPost 仓库                             │
├─────────────────────┬───────────────────────────┬──────────────────────┤
│    💻 桌面版 (desktop/)   │      📱 手机版 (mobile/)    │    🌐 Web版 (client+server)  │
├─────────────────────┼───────────────────────────┼──────────────────────┤
│ 运行时: Electron 44   │ 运行时: Capacitor 8 Android│ 运行时: Node 22 + React 19 │
│ 渲染层: dist/client   │ 渲染层: dist/client       │ 渲染层: dist/client (SSR)  │
│ 存储: 本地 JSON + 附件  │ 存储: 本地 IndexedDB       │ 存储: PostgreSQL + Drizzle │
│ 网络: 纯离线零联网    │ 网络: 纯离线零联网        │ 网络: JWT鉴权 + Socket.IO  │
│ 适用: 个人深度写作/归档 │ 适用: 随身速记/无障碍阅读 │ 适用: 团队社区/公网分发推广│
└─────────────────────┴───────────────────────────┴──────────────────────┘
```

- **单一前端真理源 (`dist/client`)**：桌面端 Electron 与移动端 Capacitor 直接复用现代 React 19 + Tailwind CSS 4 前端构建产物，**彻底移除了旧版冗余的 11,000+ 行独立模板代码**，实现多端能力 100% 同步；
- **极致轻量打包**：移动端通过 Capacitor 编译为原生 APK，桌面端由 electron-builder 产出自包含安装包与免安装便携版。

---

## 🛡️ 安全加固与原生测试套件

项目内置针对生产级网络攻击与边界场景的自动化安全防护，原生测试套件包含 **6 个专业套件、28 项测试用例全部通过（~440ms 极速验证）**：

```bash
npm test
# 运行 node --test test/*.test.mjs
```

1. **DFA 敏感词高速过滤与反伪装穿透**：基于确定有穷自动机（DFA），毫秒级扫描长文本，抵御空格、特殊符号混杂及同音变形穿透，支持平滑星号脱敏；
2. **CSV 导出公式注入阻断（Formula Injection / DDE）**：自动转义 `=`、`+`、`-`、`@` 等危险公式前缀，防止导出的表格在 Excel/WPS 中触发命令执行；
3. **复合键游标深度分页（Compound Keyset Cursor）**：基于 `(score, createdAt, id)` 构造防篡改 Base64 游标，彻底规避传统 Offset 分页的性能雪崩与浮点时间精度漂移；
4. **盘古之白排版算法回归保护**：严格保护多行代码块、行内反引号与 Markdown 图片链接不受文本美化算法干扰；
5. **异形屏安全区与前摄挖孔避让**：精确计算 Dynamic Island、前摄挖孔及横屏模式下的系统安全边距（`--custom-punch-hole-offset`）；
6. **防暴力破解与 JWT 瞬时吊销（Token Versioning）**：密码错误指数退避锁定，修改密码或登出时递增 `tokenVersion`，实现分布式无状态 JWT 的秒级即时失效。

---

## 🚀 快速开始

### 💻 方案 A：直接运行桌面写作端（零配置）

```bash
# 1. 编译前端产物
npm run build:client

# 2. 进入桌面目录并启动
cd desktop
npm install
npm start
```

---

### 🌐 方案 B：启动 Web 全栈开发服务

#### 运行前置条件
- **Node.js** >= 18（推荐 22+）
- **PostgreSQL** 数据库实例

```bash
# 1. 根目录安装依赖
npm install --ignore-scripts

# 2. 复制环境变量配置文件
cp .env.example .env
# 编辑 .env，填入 DATABASE_URL 与 JWT_SECRET

# 3. 运行自动化测试
npm test

# 4. 并行启动前端与后端开发服务器
npm run dev
```

---

### 📱 方案 C：构建 Android 手机端 APK

```bash
# 1. 构建前端现代产物
npm run build:client

# 2. 同步至 Capacitor Android 工程
cd mobile
npm install
npm run sync:android

# 3. 编译 Debug APK（需本机安装 JDK 与 Android SDK）
npm run apk
```

编译出的安装包位于：`mobile/android/app/build/outputs/apk/debug/app-debug.apk`。

---

## 🛠️ 技术栈总览

| 维度 | 技术栈方案 |
| :--- | :--- |
| **前端开发** | React 19 · TypeScript 5.9 · Vite 8 · Tailwind CSS 4 · Radix UI · Framer Motion · Lucide Icons |
| **后端开发** | NestJS 10 · TypeScript · Drizzle ORM · PostgreSQL · Socket.IO · SWC 编译器 |
| **图表引擎** | Apache ECharts 6 · 自适应莫兰迪色盘 · 同构 DSL 卡片解析器 |
| **桌面客户端** | Electron 44 · 独立本地文件存储与数据隔离 · electron-builder |
| **移动客户端** | Capacitor 8 (Android) · 挖孔屏自适应安全边距 · 独立离线密钥签名 |
| **测试与质量** | Node.js 原生 Test Runner (`node --test`) · 28 项安全与算法测试用例 |

---

## 📁 目录结构导览

```text
├── client/              # 前端 React 19 应用
│   ├── src/
│   │   ├── pages/       # 发现流、长文阅读、编辑器、搜索、设置、视频会议室等页面
│   │   ├── components/  # Layout 布局（Apple Dock / Google M3 Drawer）、ActionButtons、图表等
│   │   ├── hooks/       # 鉴权状态、工作区模式切换、主题切换 hooks
│   │   └── api/         # Axios 封装与后端 API 契约层
│   └── index.html       # 单页应用入口
├── server/              # 后端 NestJS 10 核心服务
│   ├── modules/         # 业务模块 (auth / articles / posts / meetings / admin ...)
│   ├── database/        # Drizzle ORM 数据模型 (schema.ts) 与迁移脚本
│   └── common/          # 安全过滤器、Markdown 与 XSS 防护解析器
├── desktop/             # Electron 桌面应用 (独立无后端写作端)
│   ├── main.js          # Electron 主进程入口（优先加载 dist/client 产物）
│   ├── preload.js       # 安全隔离的 Preload 桥接脚本
│   └── lib/             # 本地数据仓库、HTML 导出引擎
├── mobile/              # Capacitor 8 移动端安卓工程
│   └── capacitor.config.json # WebDir 指向 ../dist/client
├── shared/              # 前后端共享类型与图表卡片 DSL 规范 (chart-card.ts)
├── test/                # 28 项原生极速单元安全与算法测试套件
└── .github/workflows/   # 云端自动化 CI/CD (多端编译与 Release 发布)
```

---

## 📜 开源协议

本项目基于 [MIT 许可证](LICENSE) 开源。欢迎提交 Issue、Fork 并发起 Pull Request！

<div align="center">
  <sub>Built with ❤️ by yeyanli543-dot · 2026</sub>
</div>
