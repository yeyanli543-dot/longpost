# 📱 LongPost 移动端 (Android)

LongPost 手机版是一个**完全本地离线运行**的长文写作与阅读应用。数据全部保存在手机本地设备中（IndexedDB），不联网、不强制注册，随时随地记录灵感。

---

## 📥 获取与安装

### 1. 下载 APK
每次推送代码后，GitHub Actions 会自动编译并使用仓库固定的调试密钥完成签名验证，可以直接下载安装：

👉 **[下载最新版 LongPost-v3.0.0-android.apk](https://github.com/yeyanli543-dot/longpost/releases/tag/v3.0.0)** 或 **[查看全平台最新发布页](https://github.com/yeyanli543-dot/longpost/releases)**

> **安装提示**：
> 1. 下载后在手机文件管理器中点击打开，如果系统弹出未知来源警告，请选择「允许来自此来源的应用」；
> 2. 由于配置了固定的调试密钥指纹，新版本构建可以直接**覆盖安装**，无需卸载旧版本（保留本地历史文章）。

---

## 🛠️ 技术实现

- **外壳框架**：基于 [Capacitor 8](https://capacitorjs.com/) 深度定制；
- **渲染内核**：复用现代 React 19 + Tailwind CSS 4 构建产物 `dist/client`，完美支持 🍏 极简版与 🔷 专业版双工作区切换；
- **本地存储**：数据持久化于手机本地（IndexedDB/SQLite），无需网络请求；
- **异形屏适配**：深度集成 Punch-hole / Dynamic Island 前摄挖孔避让算法与横竖屏安全区（`viewport-fit=cover`）；
- **自适应设计**：
  - 针对窄屏专门优化底部悬浮胶囊导航与移动端视口；
  - 图标、交互式 ECharts 图表与富文本自适应缩放。

---

## 🚀 本地开发与构建指令

如果你希望在本地 Android Studio 或命令行中自定义构建：

```bash
# 1. 安装手机壳依赖
npm install

# 2. 从桌面端同步最新 vendor 与图标资源
npm run web

# 3. 生成或同步 Android 原生工程
npm run sync:android

# 4. 编译 Debug APK（需本机安装 JDK 与 Android SDK）
npm run apk
```

本地生成的 APK 位于：`android/app/build/outputs/apk/debug/app-debug.apk`。
