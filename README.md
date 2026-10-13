<div align="center">

# 🪶 LongPost

**下一代长文创作与社交平台 · 免登录公开阅读 · 交互式图表卡片 · 零服务器离线工作台**

[![Build Desktop](https://github.com/yeyanli543-dot/longpost/actions/workflows/desktop-release.yml/badge.svg)](https://github.com/yeyanli543-dot/longpost/actions/workflows/desktop-release.yml)
[![Build Android](https://github.com/yeyanli543-dot/longpost/actions/workflows/android-release.yml/badge.svg)](https://github.com/yeyanli543-dot/longpost/actions/workflows/android-release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=black)](https://react.dev)
[![NestJS](https://img.shields.io/badge/NestJS-10-e0234e?logo=nestjs&logoColor=white)](https://nestjs.com)
[![Electron](https://img.shields.io/badge/Electron-44-47848F?logo=electron&logoColor=white)](https://www.electronjs.org)
[![Capacitor](https://img.shields.io/badge/Capacitor-8-119EFF?logo=capacitor&logoColor=white)](https://capacitorjs.com)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38bdf8?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)

<p align="center">
  <a href="#-多端下载">📥 立即下载</a> •
  <a href="#-三端形态架构">🏛️ 三端形态</a> •
  <a href="#-核心特性">✨ 核心特性</a> •
  <a href="#-快速开始">🚀 快速开始</a> •
  <a href="#-系统架构">📐 系统架构</a> •
  <a href="#-开源协议">📜 开源协议</a>
</p>

---

</div>

## 💡 为什么选择 LongPost？

在传统内容平台上，长文阅读通常受限于繁琐的强制登录门槛与单一的图文表现形式；而在去中心化环境中，又常常面临依赖云服务宕机、数据隐私不受控的痛点。

**LongPost 采用双轨制设计**：
1. **🌐 Web 社交平台**：类 X / Twitter 平台。发短帖引流挂长文，每篇长文生成极简短码免登录分享页，**链接转发到任意社交媒体，任何人点开就能直接阅读全文**；
2. **💻 桌面工作台 & 📱 移动端**：**完全不依赖任何外部服务器**，数据 100% 留存在你的本机设备中。支持正文内嵌交互式图表（ECharts），一键导出自包含单文件 HTML，发出去双击就能看。

---

## 📥 多端下载

所有安装包均通过 GitHub Actions 自动化 CI 构建并带有防篡改校验，即下即用：

| 平台 | 安装包格式 | 下载渠道 | 说明 |
| :--- | :--- | :--- | :--- |
| **🪟 Windows** | `.exe` 安装版 / 便携版 | [**下载安装版**](https://github.com/yeyanli543-dot/longpost/releases/download/v2.7.2/LongPost.Setup.2.7.2.exe) · [**免安装便携版**](https://github.com/yeyanli543-dot/longpost/releases/download/v2.7.2/LongPost.2.7.2.exe) | 支持 Windows 10/11，免安装版解压双击直接运行 |
| **🤖 Android** | `.apk` 手机安装包 | [**下载 LongPost-v2.7.2-android.apk**](https://github.com/yeyanli543-dot/longpost/releases/download/v2.7.2/LongPost-v2.7.2-android.apk) | 手机端离线写作，固定签名密钥支持无缝覆盖升级 |
| **🍎 macOS** | `.dmg` 镜像 | [**下载 LongPost-2.7.2-arm64.dmg**](https://github.com/yeyanli543-dot/longpost/releases/download/v2.7.2/LongPost-2.7.2-arm64.dmg) | 支持 Apple Silicon & Intel，首次打开右键放行 |
| **🐧 Linux** | `.AppImage` | [**下载 LongPost-2.7.2.AppImage**](https://github.com/yeyanli543-dot/longpost/releases/download/v2.7.2/LongPost-2.7.2.AppImage) | 赋予执行权限 `chmod +x` 后直接运行 |
| **📦 全部版本** | 全部 5 端安装包与源码 | [**GitHub Releases v2.7.2 (最新发布页)**](https://github.com/yeyanli543-dot/longpost/releases/latest) | 包含所有平台的安装产物、校验码与发布日志 |

---

## 🏛️ 三端形态架构

同一个代码仓库，满足从**离线个人工作台**到**高并发云端社交站**的全部场景：

```
┌────────────────────────────────────────────────────────────────────────┐
│                              LongPost 仓库                             │
├─────────────────────┬───────────────────────────┬──────────────────────┤
│    💻 桌面版 (desktop/)   │      📱 手机版 (mobile/)    │    🌐 Web版 (client+server)  │
├─────────────────────┼───────────────────────────┼──────────────────────┤
│ 运行时: Electron 44   │ 运行时: Capacitor 8 Android│ 运行时: Node 22 + React 19 │
│ 存储: 本地 JSON + 附件  │ 存储: 本地 IndexedDB       │ 存储: PostgreSQL + Drizzle │
│ 网络: 纯离线零联网    │ 网络: 纯离线零联网        │ 网络: JWT鉴权 + Socket.IO  │
│ 适用: 个人深度写作/归档 │ 适用: 随身记录/灵感速记    │ 适用: 团队社区/公网长文分发│
└─────────────────────┴───────────────────────────┴──────────────────────┘
```

---

## ✨ 核心特性

### 0. ☯️ 双模式工作区：🍎 苹果极简版 ↔ 🎨 谷歌专业版（一键瞬切）
- **真正的深度场景分工**：非粗暴换肤，直接对标 apple.com 与 Google Material 3 官方原始设计令牌（包含精确字号阶梯、字距 Tracking、圆角规范与阴影层级）；
- **🍎 苹果极简版（Apple Zen）**：对标 Apple HIG 与 macOS/iOS 备忘录。单列 980px 纯净画卷、大留白、负字距、毛玻璃拟态、iOS 绿开关；彻底屏蔽技术噪音，专注心流写作；
- **🎨 谷歌专业版（Google Pro Studio）**：对标 Google Workspace 与 M3。提供全功能工具功能带（Formatting Ribbon）、M3 Tonal 表面、大药丸搜索、以及 **4 大本地离线杀手级生产力工具**：
  1. **🌐 全库知识图谱（Knowledge Graph）**：ECharts 力导向拓扑关系网，点击穿透漫游全库文章；
  2. **🔬 写作实验室（Writing Lab）**：10 维文本诊断，实时字数/词频透视与 5 项排版规范自检；
  3. **🔍 Git 级版本差分器（Version Diff）**：逐行比对历史快照，增删高亮，一键无损回滚；
  4. **🎨 灵感白板草图（Inspiration Board）**：HTML5 Canvas 手绘涂鸦，一键直插正文。
- 详情请查阅权威文档：👉 **[LongPost 双模式设计分工与能力集成白皮书 (DESIGN-SPEC.md)](DESIGN-SPEC.md)**。

### 1. 📊 交互式图表卡片（不仅是图片，而是活数据）
- 在 Markdown 正文任意位置使用 ````chart``` 围栏，即可内嵌 **柱状图 / 折线图 / 面积图 / 饼图**；
- 无论是本地预览、导出 HTML 还是公开分享页，图表均由 ECharts 渲染，读者可悬浮交互查看数值；
- 内置可视化图表编辑器与 7 套自适应深浅配色规范。

### 2. 🔗 短帖引流挂长文 + 免登录阅读链路
- 短帖受字数限制，支持自动解析 `#话题标签` 与 `@用户提及`；
- 短帖可一键挂载完整长文短链卡片，形成「短帖引流 + 长文深读」的最佳阅读路径；
- 每一篇长文均拥有独立的公开分享页（短码如 `/p/abc12345`），外部访客**无需注册、无需登录**即可阅读全文并下载附件。

### 3. 💬 完整社交生态圈
- **多维度互动**：点赞、收藏、转发、支持带评论的引用转发；
- **楼中楼评论系统**：无限级回复嵌套、评论独立点赞、最新/最热动态排序；
- **通知中心**：点赞、评论、新粉丝、提及等 5 大类事件，带实时未读红点感知；
- **私信系统**：基于会话的一对一站内即时沟通。

### 4. 🎥 站内视频会议室（WebRTC + 信令服务器）
- 预约会议、生成 6 位房间号极简分享；
- 站内视频通话、屏幕共享、会中即时文字聊天与实时在线成员状态；
- 会议创建人支持在线编写和归档会议纪要。

### 5. 🛡️ 严格生产级安全加固
- **协议级 XSS 防护**：Markdown 渲染管道引入 `safeUrl` 白名单协议过滤，彻底阻断 `javascript:` 伪协议注入；
- **实时封禁拦截**：JWT 守卫联动数据库，封禁与停用账号实时阻断写操作，避免无状态 Token 失控；
- **统一权限守卫**：内置 `AdminGuard` 守卫管道，对管理员后台全部接口实施系统级权限隔离。

---

## 🚀 快速开始

### 💻 方案 A：直接运行桌面写作端（零配置）

```bash
# 1. 进入桌面目录并安装依赖
cd desktop
npm install

# 2. 启动桌面应用
npm start

# 3. 运行完整功能自检（84项测试用例）
npm test
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

# 3. 并行启动前端与后端开发服务器
npm run dev
```

> **Windows 运行小贴士**：若在 Windows CMD/PowerShell 环境下运行单命令，可通过跨平台变量指定：
> ```powershell
> # 编译后端
> $env:NODE_ENV = 'production'; npx nest build
> # 编译前端
> $env:NODE_ENV = 'production'; npx vite build --config vite.config.ts
> ```

---

## 🛠️ 技术栈总览

| 维度 | 技术栈方案 |
| :--- | :--- |
| **前端开发** | React 19 · TypeScript 5.9 · Vite 8 · Tailwind CSS 4 · Radix UI · Framer Motion |
| **后端开发** | NestJS 10 · TypeScript · Drizzle ORM · PostgreSQL · Socket.IO · SWC |
| **桌面客户端** | Electron 44 · 原生隔离沙箱 · 自定义 `lp://` 本地协议 · electron-builder |
| **移动客户端** | Capacitor 8 (Android) · 原生 Webview 渲染 · 独立离线密钥签名 |
| **工程规范** | ESLint 9 · Prettier · 严格类型共享契约 (`shared/api.interface.ts`) |

---

## 📁 目录结构导览

```text
├── client/              # 前端 React 19 应用
│   └── src/
│       ├── pages/       # 时间线、长文阅读、发布器、搜索、会议室等页面
│       ├── components/  # 公共 UI 组件与图表卡片渲染器
│       ├── hooks/       # 鉴权状态、交互状态 hooks
│       └── api/         # Axios 封装与前后端 API 契约层
├── server/              # 后端 NestJS 10 核心服务
│   ├── modules/         # 业务模块 (auth / articles / posts / meetings / admin ...)
│   ├── config/          # 鉴权、文件落盘与安全配置
│   ├── database/        # Drizzle ORM 数据模型 (schema.ts)
│   └── common/          # 安全过滤器、Markdown 与 XSS 防护解析器
├── desktop/             # Electron 桌面应用 (独立无后端写作端)
│   ├── lib/             # 本地数据仓库、HTML 导出引擎
│   ├── renderer/        # 离线编辑与图表预览前端
│   └── scripts/         # 84项基线自检脚本与自动化打包工具
├── mobile/              # Capacitor 8 移动端安卓外壳
├── shared/              # 前后端共享类型与图表卡片 DSL 规范
└── .github/workflows/   # 云端自动化 CI/CD (多端编译与 Release 发布)
```

---

## 📜 开源协议

本项目基于 [MIT 许可证](LICENSE) 开源。欢迎 Star、Fork 并提交 Pull Request！

<div align="center">
  <sub>Built with ❤️ by yeyanli543-dot · 2026</sub>
</div>
