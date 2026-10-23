# 国内下载地址

GitHub Releases 在国内经常很慢甚至连不上。这里给出几个可用的加速镜像。

> 镜像都是**第三方公益服务**，不保证长期可用，也不经过我们控制。
> 安装前请核对下面的 sha256；不确定时用官方地址。

## v3.8.1

### Windows 安装版（推荐）

```
https://ghproxy.net/https://github.com/yeyanli543-dot/longpost/releases/download/v3.8.1/LongPost.Setup.3.8.1.exe
https://gh-proxy.com/https://github.com/yeyanli543-dot/longpost/releases/download/v3.8.1/LongPost.Setup.3.8.1.exe
https://ghfast.top/https://github.com/yeyanli543-dot/longpost/releases/download/v3.8.1/LongPost.Setup.3.8.1.exe
https://gh.llkk.cc/https://github.com/yeyanli543-dot/longpost/releases/download/v3.8.1/LongPost.Setup.3.8.1.exe
```

### 其他平台

| 平台 | 文件名 | 换镜像前缀即可 |
| --- | --- | --- |
| Windows 便携版 | `LongPost.3.8.1.exe` | 是 |
| macOS (Apple Silicon) | `LongPost-3.8.1-arm64.dmg` | 是 |
| Linux | `LongPost-3.8.1.AppImage` | 是 |
| Android | `LongPost-android.apk` | 是 |

## 校验

```
9bbc44c1d36137bb491b16489d372e96bbda58e5c3c389e4158c1703b9eda87e  LongPost.Setup.3.8.1.exe
8bcc188bfe0c6346644c0dc9c49105694acffdde933283202f52db22c81ffeec  LongPost.3.8.1.exe
229ed732027132d2241144d03a7b06d1864bc7ee12be0a4e9918ca3ad4929d8e  LongPost-3.8.1-arm64.dmg
1cc388d1597828a6f910f4ed3342e509f91a7778cd5064bc334c012ce58fa942  LongPost-3.8.1.AppImage
```

Windows 上核对：

```powershell
Get-FileHash ".\LongPost.Setup.3.8.1.exe" -Algorithm SHA256
```

## 生成新版本的链接

```bash
node scripts/cn-mirrors.cjs          # 用 package.json 里的版本
node scripts/cn-mirrors.cjs 3.9.0    # 指定版本
```
