# LongPost — 长文发布平台

## 应用概述
类 X/Twitter 的长文发布平台。用户可以发布带字数限制的短帖，也可以发布完整长文；短帖可以挂载指向对应长文的链接，形成「短帖引流 + 长文阅读」的核心交互。

## 技术栈
- 后端：NestJS + Drizzle ORM + PostgreSQL
- 前端：React 19 + React Router v6 + Tailwind CSS + shadcn/ui
- 共享类型：shared/api.interface.ts

## 数据模型
- `posts` — 短帖表，类似 X 上的 tweet，有字数限制
- `articles` — 长文表，完整文章内容
- `app_users` — 用户表，邮箱+密码注册
- `likes` — 点赞表（content_type + content_id）
- `bookmarks` — 收藏表（文章）
- `reposts` — 转发表，支持引用转发（quote_content + is_quote）
- `comments` — 评论表，支持楼中楼（parent_id）和点赞（like_count）
- `comment_likes` — 评论点赞表
- `follows` — 关注关系表
- `notifications` — 通知表
- `hashtags` — 话题标签表
- `content_hashtags` — 内容-话题关联表
- `site_settings` — 站点设置表
- `meetings` — 会议表（预约/进行中/已结束/已取消）
- `meeting_participants` — 会议参会人表（状态：invited/online/offline/left）
- `meeting_chat_messages` — 会中聊天消息表
- `meeting_minutes` — 会议纪要表

## 核心页面
1. `/` 首页 — 时间线，三视图（全部/关注/热门），无限滚动
2. `/article/:id` — 长文阅读页
3. `/compose` — 发布页（短帖、长文、短帖挂长文）
4. `/search` — 搜索页，分类（全部/帖子/用户/话题）
5. `/login` — 登录页（邮箱+密码+Google OAuth）
6. `/register` — 注册页
7. `/me` — 我的内容页（帖子/文章/收藏）
8. `/notifications` — 通知中心
9. `/hashtag/:tag` — 话题聚合页
10. `/user/:id` — 用户公开主页
11. `/user/:id/following` / `/user/:id/followers` — 关注/粉丝列表
12. `/settings` — 设置页（6 Tab）
13. `/oauth/callback` — OAuth 第三方登录回调
14. `/meetings` — 会议列表页（我的会议，状态筛选）
15. `/meetings/:id` — 会议详情页（信息、参会人、纪要、管理）
16. `/meetings/:id/room` — 视频会议室（音视频+屏幕共享+聊天+参会人）

## 用户账号体系
- 自建账号系统：`app_users` 表，邮箱+密码注册登录，JWT 鉴权
- Google OAuth 登录：已完整实现，配置 GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET 即可启用
- 微信登录框架：已预留，填入凭证后可继续开发
- 鉴权方式：前端 localStorage 存 token，axios 请求头 `Authorization: Bearer <token>`
- 阅读侧免登录：时间线、文章详情、搜索等读接口无需鉴权，公开访问
- 发布侧需登录：写接口加 JwtAuthGuard，仅登录用户可发布和管理自己的内容
- 作者信息：昵称、头像从 app_users 表关联查询

## 社交功能

### 关注系统
- 关注/取消关注
- 个人主页显示关注数、粉丝数
- 关注列表、粉丝列表页
- 首页时间线「关注的人」视图

### 通知中心
- 导航栏铃铛入口，未读红点
- 5 种通知类型：点赞、转发、评论、新粉丝、被@提及
- 通知列表页，无限滚动
- 全部标记已读

### 话题标签
- 发帖正文 #话题 自动解析为可点击链接
- 话题聚合页：展示该话题下的帖子和文章
- 热门话题榜单（右侧侧栏）

### @提及
- 发帖 @用户名 自动解析为可点击链接
- 被提及者收到通知

### 评论系统
- 楼中楼回复（嵌套评论）
- 评论点赞
- 排序：最新 / 最热
- 软删除，作者/管理员可删

### 引用转发
- 转发时可选附带评论文字
- 原内容以卡片形式展示

### 搜索
- 分类搜索：全部 / 帖子 / 用户 / 话题
- 用户结果含关注按钮
- 话题结果可跳转

## 设计规范

### 视觉风格
- 极简深色风格，接近 X / Medium 的阅读体验
- 主色：蓝色系 `#1d9bf0`，用于链接、按钮高亮
- 背景：`#000` 纯黑主背景，`#16181c` 次级背景
- 文字：主文字 `#e7e9ea`，次文字 `#71767b`
- 边框 / 分割线：`#2f3336`

### 排版
- 标题：text-2xl font-bold，文章标题 text-3xl
- 正文：text-base leading-relaxed，长文用 serif 字体增强阅读感
- 辅助文字：text-sm text-gray-500
- 帖子正文：text-lg leading-relaxed

### 间距
- 页面最大内容宽度：700px（类 X 单列时间线宽度）
- 卡片内边距：p-4
- 卡片间距：0（时间流式，卡片之间用 1px 边框分隔）
- 段落间距：长文段落间 mb-4

### 布局
- 三栏布局：左侧导航（275px） + 中间内容流（600px） + 右侧话题侧栏
- 移动端：仅中间内容流，顶部导航栏
- 时间线卡片：无边框圆角，仅底部 1px 分割线，hover 时浅灰背景

### 组件区块标记
- 帖子卡片：`data-ai-section-type="card-list"`
- 发布按钮：`data-ai-section-type="button"`

## 会议功能
- 会议预约：标题、描述、开始时间、时长、参会人、是否公开
- 会议状态：scheduled（即将开始）/ ongoing（进行中）/ ended（已结束）/ cancelled（已取消）
- 会议码：6位大写字母，可通过链接分享加入
- 站内视频会议：摄像头/麦克风开关、屏幕共享、会中聊天、在线参会人列表
- 会议纪要：创建人可编辑，参会人可查看
- 参会人邀请通知：站内通知类型 meeting_invite
- 权限：公开会议匿名可浏览详情，创建/加入/聊天需登录


## 仓库结构与工程约定（v2.9.7 起）

### 目录职责
| 目录 | 职责 | 参与构建 |
| :--- | :--- | :--- |
| `client/` | React 19 前端；`@` → `client/src` | ✅ Vite |
| `server/` | NestJS 后端；`sourceRoot` = `server` | ✅ nest build |
| `shared/` | 前后端共享的纯函数与类型（无 DOM / 无 Nest 依赖） | ✅ 两端 |
| `desktop/` | Electron 独立子应用（自带 renderer 与 vendor） | ✅ electron-builder |
| `mobile/` | Capacitor 壳 | ✅ Gradle |
| `test/` | Node 原生测试 `node --test` | ✅ npm test |
| `archive/` | 历史原型归档，**不参与任何构建**，见 `archive/README.md` | ❌ |

> 禁止再新增与上表平行的"影子目录"（例如根目录再放一个 `src/` 或 `backend/`）。
> 2026-10 的 argon 交接就是因为放了 `src/`、`backend/`、`electron/` 三个并行实现，
> 全部没有被任何构建工具引用，导致改了等于没改。

### 版本号
- 唯一事实来源：`shared/version.ts` 的 `APP_VERSION`
- `package.json` / `desktop/package.json` / `mobile/package.json` 需同步
- 设置页、RSS/Atom 的 `<generator>` 一律从 `APP_VERSION` 读取，不要写死
- 桌面端渲染层是纯 JS，各自保留常量，发版时同步（`desktop/renderer/platform.js`）

### 测试怎么写
- 测试必须 **import 生产代码**，不允许把算法抄一遍再断言。
- Node 24 原生擦除 TS 类型，可直接 `import { x } from '../shared/foo.ts'`。
- 别名（`@/` `@shared/` `@client/`）由 `test/register-aliases.mjs` 在解析期映射，
  已通过 `npm test` 的 `--import` 参数自动加载，写测试时直接用别名即可。

### 同步协议
- 裁决逻辑：`shared/sync/three-way-merge.ts`（纯函数，可单测）
- 传输与编排：`client/src/lib/sync/sync-coordinator.ts`
- 协议格式：`shared/sync/sync-protocol.ts`
- 改动裁决矩阵时，先改纯函数 + 补 `test/sync-protocol-and-coordinator.test.mjs` 场景

### 出站请求安全
- 任何"由服务端替用户发请求"的能力都必须经过
  `server/common/security/outbound-host-guard.ts`
  （协议白名单 + 主机名黑名单 + DNS 解析期内网拦截 + 连接期 lookup 复核）
