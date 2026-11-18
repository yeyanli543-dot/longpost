# LongPost 界面设计与验证要点

LongPost 有两套独立的渲染层：`desktop/renderer/` 服务于桌面和 Android 写作台，`client/` 服务于网页端。两者使用相同的产品语言，但不假定组件或样式可以直接互换。

## 设计原则

- **内容优先**：以标题、正文和主要操作建立清晰层级；次要工具收进有名称的菜单，保留必要的保存状态。
- **一致而可辨**：极简与专业工作区保留不同的信息密度，颜色、文字、边框、焦点和交互状态遵循同一语义。应用使用 LongPost 自己的标识，不模拟系统窗口控制。
- **适应真实空间**：桌面工具栏根据可用宽度折叠；手机端为底部导航和系统安全区留出空间。在极窄屏幕，工作区切换仍可从列表或设置进入。
- **可阅读、可操作**：浅色和深色都使用语义颜色；为重要图标操作提供名称、焦点提示，尊重系统减少动态效果的设置，并允许页面缩放。
- **状态诚实**：加载、无结果、失败和未登录分别呈现；分享链接应能直接打开相应内容。

## 实现约定

桌面与 Android 的界面覆盖层位于 `desktop/renderer/style-refined.css`，它在既有基础样式、移动样式和随包第三方样式之后加载。用户选择的主题、皮肤和字号仍通过原有设置保存。网页使用 `client/src/tailwind-theme.css` 的语义变量，页面优先使用 `background`、`foreground`、`muted`、`border` 和 `primary` 等令牌，避免把深色页面的字色直接用于浅色背景。视频会议房间等有明确独立场景的界面可以保留专用颜色。

网页生产构建包含 Tailwind 入口，并在构建结束后检查基础布局、响应式和主题工具类。服务端提供的资源基路径必须是同源绝对路径；文章和动态深层链接从相同基路径加载脚本及样式。

## 回归检查

在项目根目录运行 `npm test`、`npm run lint` 和 `npm run build`。桌面目录安装依赖后，可运行以下隔离界面检查：

```sh
cd desktop
npx electron scripts/verify-workspace-ui.cjs
npx electron scripts/probe-layout.js --mode=all --assert
npx electron scripts/verify-save.cjs
```

网页构建完成后，可从 `desktop/` 运行 `npx electron scripts/verify-web-ui.cjs`。它启动本机模拟服务，检查主题、响应式导航、搜索、阅读、分享和部分次级页面，不读取真实账号或文章。实际设备的系统字体、安全区、输入法及辅助功能仍应在对应平台上验收。
