# LongPost · 长文发布平台

类 X / Twitter 的长文发布与社交平台。短帖受字数限制，短帖可以挂一条指向完整长文的链接；
长文自带**免登录分享页**——把链接贴到 X 等平台，任何人点开就能直接读完整篇，无需注册登录。

围绕这条链路，平台逐步长出了一整套社交能力：点赞、收藏、转发、评论、关注、通知、
话题标签、@提及、私信、站内视频会议与站长管理后台。

## 核心特性

| 能力 | 说明 |
|---|---|
| 短帖 | 受字数限制的轻量发布，支持 `#话题` 与 `@提及` 自动解析 |
| 长文 | 完整文章，支持配图与文件附件 |
| 免登录分享页 | 每篇长文生成短码链接，未登录访客可直接阅读全文 |
| 短帖挂长文 | 在短帖中挂载指向长文的链接，形成「短帖引流 + 长文阅读」 |
| 图表卡片 | 正文里可插入柱状 / 折线 / 面积 / 饼图，站内阅读与公开分享页同款渲染 |
| 文件附件 | 长文可挂附件，读者在分享页上直接下载 |
| 自建上传 | 图片、头像、附件走站点自己的上传接口，不依赖第三方存储 |

## 功能清单

**内容**
- 发短帖、发长文、短帖挂长文链接
- 长文配图、文件附件
- 长文正文插入图表卡片（柱状 / 折线 / 面积 / 饼图，可视化编辑 + 实时预览）
- 长文免登录分享页（短码）
- 话题标签聚合页、热门话题榜
- 全站搜索（全部 / 帖子 / 用户 / 话题）

**社交互动**
- 点赞、收藏、转发（含带评论的引用转发）
- 评论：楼中楼嵌套回复、评论点赞、按最新/最热排序、软删除
- 关注 / 取消关注、关注列表与粉丝列表
- 通知中心：点赞、转发、评论、新粉丝、被 @提及 共 5 类，未读红点

**私信**
- 一对一私信会话、未读计数

**会议**
- 会议预约（标题、时间、时长、参会人、是否公开）、6 位会议码分享
- 站内视频会议室：音视频、屏幕共享、会中聊天、在线参会人
- 会议纪要（创建人可编辑、参会人可查看）

**账号与权限**
- 邮箱 + 密码注册登录，JWT 鉴权
- Google OAuth 登录（配置凭据后启用）
- 访问码（团队通行码）登录
- 站长 / 管理员控制台

**其他**
- 个人主页、设置页
- 隐私政策 / 服务条款页
- PWA（可添加到主屏幕）

## 技术栈

| 层 | 选型 |
|---|---|
| 前端 | React 19 · TypeScript · Vite · Tailwind CSS · shadcn/ui · React Router v6 · Framer Motion |
| 后端 | NestJS 10 · TypeScript · Drizzle ORM · PostgreSQL · JWT · Socket.IO |
| 共享层 | `shared/api.interface.ts` 前后端类型契约 |
| 工程 | ESLint · Stylelint · Prettier · TypeScript 严格模式 |

## 目录结构

```
├── client/          前端 React 应用
│   └── src/
│       ├── pages/       页面（时间线 / 长文 / 发布 / 搜索 / 登录 / 个人中心 / 管理后台 / 会议 …）
│       ├── components/  公共组件
│       ├── hooks/       自定义 hook
│       ├── api/         API 调用层
│       └── utils/       工具函数
├── server/          后端 NestJS 应用
│   ├── modules/         业务模块（auth / posts / articles / comments / follows /
│   │                    notifications / hashtags / admin / meetings / dm / access-codes …）
│   ├── config/          配置
│   └── database/        Drizzle schema
├── shared/          前后端共享类型
├── scripts/         开发与构建脚本
└── .githooks/       Git 钩子
```

## 快速开始

**环境要求**：Node.js 18+、PostgreSQL。

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env
#    然后填入 JWT_SECRET（必需）等值

# 3. 启动开发环境（前后端同时）
npm run dev
```

> **Windows 用户注意**：项目脚本使用了 POSIX 风格的内联环境变量写法
> （如 `"build:server": "NODE_ENV=production nest build"`）以及 `.sh` 脚本，
> 在 Windows 的 cmd / PowerShell 下会报 `'NODE_ENV' is not recognized`，无法直接运行。
>
> 三种可行的做法：
> 1. 在 **Git Bash 或 WSL** 中执行；
> 2. 引入 `cross-env` 改写脚本，使其跨平台；
> 3.（临时）在 PowerShell 里先设置环境变量再执行底层命令，例如：
>    ```powershell
>    $env:NODE_ENV = 'production'; npx nest build
>    $env:NODE_ENV = 'development'; npx nest start --watch   # 后端
>    $env:NODE_ENV = 'development'; npx vite --config vite.config.ts   # 前端
>    ```
>
> `npm run type:check` 不依赖这套写法，可在 Windows 下直接运行。

**构建与运行**

```bash
npm run type:check   # 前后端类型检查
npm run lint         # 代码规范检查
npm run build:prod   # 构建前后端产物
npm run start        # 以生产模式运行
```

### 环境变量

| 变量 | 必需 | 说明 |
|---|---|---|
| `JWT_SECRET` | **是（生产）** | JWT 签名密钥。生产环境缺失会**直接拒绝启动**，避免用公开默认值签发令牌 |
| `OWNER_EMAIL` | **强烈建议** | 站长邮箱。命中该邮箱的账号（注册 / 登录 / Google 登录）自动成为 `admin`。不配置时系统会创建一个 `admin@longpost.com` 临时账号，密码随机生成、只在启动日志里出现一次 |
| `SUDA_DATABASE_URL` | 自由部署时必填 | PostgreSQL 连接串（也认标准名 `DATABASE_URL`）；平台部署由平台注入 |
| `UPLOAD_DIR` | 自由部署时必填 | 用户上传目录。**必须挂持久化卷**，否则重新部署会丢文件 |
| `CLIENT_BASE_PATH` | 否 | 客户端资源前缀。平台部署为 `/app/<appId>`，独立部署留空字符串 |
| `POSTGRES_SSL` | 否 | 托管数据库通常要求 SSL，填 `true` 开启 |
| `GOOGLE_CLIENT_ID` | 否 | Google OAuth 客户端 ID，与 secret 同时配置才启用 Google 登录 |
| `GOOGLE_CLIENT_SECRET` | 否 | Google OAuth 客户端密钥 |
| `GOOGLE_CALLBACK_URL` | 否 | Google OAuth 回调地址 |
| `LOG_DIR` / `LOG_REQUEST_BODY` / `LOG_RESPONSE_BODY` | 否 | 日志相关开关 |

完整清单见 [`.env.example`](.env.example)。

## 数据模型

主要数据表（`server/database/schema.ts`）：

- **用户**：`app_users`、`site_settings`
- **内容**：`posts`（短帖）、`articles`（长文）、`hashtags`、`content_hashtags`
- **互动**：`likes`、`bookmarks`、`reposts`、`comments`、`comment_likes`、`follows`、`notifications`
- **会议**：`meetings`、`meeting_participants`、`meeting_chat_messages`、`meeting_minutes`

## 部署说明

本项目派生自飞书 aPaaS（妙搭）全栈模板，`@lark-apaas/*` 系列包为其运行时依赖，
数据库连接由平台注入。

**关于"把链接贴到 X 上，别人点开就能读"**：这条链路要求公开分享页对**未登录访客**可访问。
平台侧会在请求到达应用之前就跳转到登录页（官方文档明确 AI-Coding 页面不支持公开访问），
因此要真正实现免登录阅读，必须把应用部署到自己的服务器 / 标准 Node 托管上，并自备 PostgreSQL。

已知的搬运工作量（尚未完成，欢迎 PR）：

1. 服务端 `server/` 下有若干文件从 `@lark-apaas/fullstack-nestjs-core` 引入
   `DRIZZLE_DATABASE` 等运行时对象，需要换成标准的 Drizzle + postgres-js 数据库模块；
2. 前端 `client/` 下约 70 余个文件使用了 `@lark-apaas/client-toolkit`
   （`logger` / `axiosForBackend` / `resolveAppUrl` / `UniversalLink` 等），需要替换为等价实现；
3. 数据库结构可直接由 `server/database/schema.ts` 用 `drizzle-kit` 生成建表 SQL。

数据库连接、上传目录、站长邮箱等外部部署所需的变量都已在
[`.env.example`](.env.example) 中列出，配置项本身已经就位。

## 许可证

[MIT](LICENSE) © 2026 yeyanli543-dot
