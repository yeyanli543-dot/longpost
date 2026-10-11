# Android 固定签名密钥（debug 型）

这个目录里放的是 LongPost 手机版的 **固定的 debug 签名密钥**，用于 CI 出包。

| 文件 | 说明 |
| --- | --- |
| `debug.keystore.b64` | 密钥库的 base64 文本编码（**不是**二进制）。CI 里 `base64 -d` 还原成 `$HOME/.android/debug.keystore`。 |

> 为什么是 base64 文本：把二进制直接塞进仓库/连接器会被破坏（换行、编码转换），base64 是纯 ASCII，逐字节可还原。改动前请务必回验 sha256。

## 这是公开密钥，不是机密

- 这是一把 **debug 型**证书，口令用的是安卓自己的公开约定值：

  | 项 | 值 |
  | --- | --- |
  | storepass | `android` |
  | keypass | `android` |
  | alias | `androiddebugkey` |
  | storetype | `JKS` |
  | 主题 | `CN=Android Debug,O=Android,C=US` |
  | 密钥 | RSA 2048，有效期 10000 天 |

- 口令是公开的，所以**把密钥库本身放进公开仓库不会泄露任何东西**——任何人拿到它也只能签出"调试包"，无法冒充正式发布者。
- 它**只能用于 debug 包**。正式发布（上架 Google Play）必须换成私密保管的正式发布密钥，见下文。

## 为什么必须固定它

安卓按 **签名证书** 判定"新包能不能覆盖旧包"：

- 证书不同 → 系统按**签名冲突**直接拒绝覆盖安装。用户必须先卸载旧版，**本地数据（IndexedDB）会一起没掉**。
- 之前这条流水线每次构建都由 runner 现场随机生成 debug 证书，于是**每个新包签名都不同**，每次升级都要先卸载 → "新包装不上手机"。
- 固定成同一把密钥后，只要 `applicationId` 不变、版本号递增，新包就能直接覆盖安装，数据保留。

## 怎么还原 / 怎么用

```bash
# 还原（CI 里就是这么做的）
mkdir -p "$HOME/.android"
base64 -d mobile/signing/debug.keystore.b64 > "$HOME/.android/debug.keystore"

# 核对指纹
keytool -list -v -keystore "$HOME/.android/debug.keystore" -storepass android -alias androiddebugkey
```

Android Gradle 插件在 `assembleDebug` 时默认就找 `$HOME/.android/debug.keystore`，口令与别名也正好是上表那几个值，所以**不需要改 `build.gradle`** 的签名配置，放对位置就生效。

## 当前密钥指纹（用于核对）

```
keystore sha256 : 5ebeb6b9d8da6dff88722e49773a2b69de860179e9f6485ce24747d93d0902c3
证书 SHA-256    : 59:52:6E:4E:27:9A:A0:CB:29:6F:FF:94:8C:20:B9:00:43:A7:E1:51:FB:BE:FA:79:FC:04:02:CC:20:F1:F9:F2
证书 SHA-1      : 39:AF:5D:54:F7:FF:81:EB:21:FB:9B:6C:DB:8F:0A:FF:59:AF:AC:2C
有效期至        : 2054-02-26
```

改完密钥后请把上面的指纹一起更新，否则下次没法判断"到底换没换"。

## 今后怎么轮换

密钥 **一旦发布出去就不能随便换**：换了就等于"换了一个签名者"，所有已安装的用户都会被签名冲突挡住，必须卸载重装、丢数据。所以只在下面两种情况轮换：

1. **证书临近过期**（当前到 2054-02-26；距离到期还有 28 年，暂时不用管）。生成时给的有效期是 10000 天，安卓官方文档的 debug 密钥就是这么写的；Android Studio 自己生成的 debug 密钥用的是 30 年。若哪天 Gradle 提示剩余有效期不足，直接把 `-validity` 提到 `10950` 重新生成即可。
2. **确认密钥泄露后造成实际风险**——对这把口令公开的 debug 密钥来说，风险本来就只限于"别人能签一个调试包"，所以这条基本不会触发。

轮换步骤：

```bash
# 1) 备份旧的（万一要回滚）
cp mobile/signing/debug.keystore.b64 mobile/signing/debug.keystore.b64.bak

# 2) 生成新密钥（参数必须与本文档一致：JKS / 口令 android / 别名 androiddebugkey）
keytool -genkeypair -v -keystore debug.keystore -storetype JKS \
  -alias androiddebugkey -storepass android -keypass android \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=Android Debug,O=Android,C=US"

# 3) 转 base64 文本入库，并回验 sha256 与解码后一致
base64 -w 0 debug.keystore > mobile/signing/debug.keystore.b64

# 4) 更新本文档里的三个指纹，然后在 Release 说明里提醒用户：本次必须卸载重装
```

## 上架 Google Play 前必须做的事

**当前这把密钥绝对不能用于 Google Play。** 上架前必须：

1. **换成正式发布密钥**（release key）：口令不公开、不进任何仓库，用 GitHub Secrets / 密钥管理服务注入到 CI。
2. **启用 Play App Signing**：把上传密钥交给 Google 托管，Google 持有最终的应用签名密钥。这样才能在丢了上传密钥后由 Google 协助重置，也不会因为换密钥而让用户被迫卸载。
3. 在 `build.gradle` 里给 `release` 构建类型配好 `signingConfig`（改 `applicationId` 时也要同步改，因为 Play 上 `applicationId` 一旦发布不可更改）。

在完成上面三步之前，本流水线产出的都是 **debug 包**，只适合内部安装测试，不要上传到任何应用商店。
