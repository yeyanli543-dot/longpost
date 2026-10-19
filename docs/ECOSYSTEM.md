# 生态接入

LongPost 桌面版在本地开了剪藏接口，任何脚本都能把内容送进来。
端口与令牌自动写在 `%APPDATA%\LongPost\bridge.json`，不需要手动配置。

## 命令行（Windows / macOS / Linux）

```bash
# 直接写一段
node scripts/longpost-cli.cjs "今天想到的一句话"

# 带标题与标签
node scripts/longpost-cli.cjs --title "灵感" --tag 碎片 --tag 待读 "一段内容"

# 管道
echo "从别处管道进来的内容" | node scripts/longpost-cli.cjs
```

Windows 下可以直接用 `scripts\longpost.cmd`，把它所在目录加进 PATH 后就是一条 `longpost` 命令。

## Raycast（macOS）

新建 Script Command，模板选 Bash，脚本内容：

```bash
#!/bin/bash
# @raycast.title 保存到 LongPost
# @raycast.mode compact
# @raycast.argument1 { "type": "text", "placeholder": "内容" }

node "$HOME/Documents/longpost/scripts/longpost-cli.cjs" "$1"
```

## Alfred（macOS）

Workflow → Run Script（Bash）：

```bash
node "$HOME/Documents/longpost/scripts/longpost-cli.cjs" "{query}"
```

绑一个热键即可。

## PowerToys Run / Windows 快捷方式

新建快捷方式，目标填：

```
node "D:\antigravity\longpost\scripts\longpost-cli.cjs" --title "快速记录"
```

弹出窗口里输入内容（需要配一个可交互的包装脚本；简单场景建议直接用 Win+R 运行上面那条命令）。

## 任意语言

见 [剪藏 API](./CLIP-API.md)：一个 POST 请求即可。

## 排错

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 「找不到桌面版设置」 | LongPost 没启动过 | 先启动一次 |
| 「本地桥没开」 | 设置里关了 | 设置 → Chrome 剪藏 → 开启 |
| 「还没生成配对信息」 | 本地桥没起来 | 看设置里是否显示端口 |
| fetch failed | 端口变了（应用重启过） | 重新读 bridge.json（CLI 会自动读） |
