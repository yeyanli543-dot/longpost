# LongPost Bridge（Obsidian 插件）

把 LongPost 桌面版里最近的网页剪藏导入 Obsidian。

## 安装

1. 在 vault 下建目录 `.obsidian/plugins/longpost-bridge/`
2. 把本目录的 `manifest.json` 与 `main.js` 复制进去
3. Obsidian → 设置 → 第三方插件 → 关闭安全模式 → 启用 **LongPost Bridge**

## 使用

- 左侧 Ribbon 图标，或命令面板 →「导入最近的剪藏」
- 会把 LongPost 最近 5 条剪藏写成 markdown，放在 vault 根目录的 `LongPost/` 下
- 已存在的同名文件会跳过

每条笔记带 frontmatter：

```yaml
---
source: https://example.com/post
captured: 2026-10-19T03:12:00.000Z
---
```

## 依赖

- LongPost 桌面版正在运行，且「Chrome 剪藏 → 开启本地桥」是打开的
- 插件读 `%APPDATA%\LongPost\bridge.json` 拿端口与令牌，不需要手动配对
