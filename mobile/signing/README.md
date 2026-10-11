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
  | 密钥 | RSA 2048 |
  | 有效期 | 36500 天（100 年） |

- 口令是公开的，所以**把密钥库本身放进公开仓库不会泄露任何东西**——任何人拿到它也只能签出"调试包"，无法冒充正式发布者。
- 它**只能用于 debug 包**。正式发布（上架 Google Play）必须换成私密保管的正式发布密钥，见下文。

## 为什么必须固定它

安卓按 **签名证书** 判定"新包能不能覆盖旧包"：

- 证书不同 → 系统按**签名冲突**直接拒绝覆盖安装。用户必须先卸载旧版，**本地数据（IndexedDB）会一起没掉**。
- 之前这条流水线每次构建都由 runner 现场随机生成 debug 证书，于是**每个新包签名都不同**，每次升级都要先卸载 → "新包装不上手机"。
- 固定成同一把密钥后，只要 `applicationId` 不变、版本号递增，新包就能直接覆盖安装，数据保留。

## 两个容易踩的坑（都是实测踩出来的）

### 坑 1：有效期不到 30 年 → AGP 会把你的密钥换掉

第一版密钥生成出来了、也还原到了 `$HOME/.android/debug.keystore`，但打出来的 APK 依旧是被 **构建期新建的证书** 签的：从 APK 里解出来的签名证书 `notBefore` 正好等于构建那一刻，有效期恰好 **10950 天（30 年）**——也就是说 AGP 自己重造了一把，把仓库里那把晾在一边。

原因是**有效期**：安卓给 debug 证书定的约定寿命就是 **30 年**（官方文档：*"调试证书的有效期为 30 年，从其创建日期算起"*），AGP 8.13.0 在 `ValidateSigningTask.createDefaultDebugKeystoreIfNeeded` / `GradleKeystoreHelper` 里默认创建的也是 30 年。

第一版按安卓文档里给 **发布密钥** 用的那条命令写了 `-validity 10000`（10000 天 ≈ 27.4 年），**不到 30 年**，于是没通过检查、被 AGP 换成了它自己现造的。现在改成 `-validity 36500`（100 年），远超 30 年，留足余量，不会再被替换。

> 记一笔：`-validity 10000` 是官方"命令行构建"文档里给 **release key** 的参数，不是给 debug keystore 的；两者别混。

### 坑 2：别名大小写

AGP 默认 debug 签名配置里的别名写作 `AndroidDebugKey`（能在 AGP 的 `GradleKeystoreHelper` / `SigningConfigData` 里看到），而文档和本仓库用的是全小写 `androiddebugkey`。**JKS 方言里别名不分大小写**（SUN 的 JKS 实现把别名转小写存储），实测 `keytool -list -alias AndroidDebugKey` 与 `-alias androiddebugkey` 指向同一条目、同一张证书。所以这里保持小写即可，不必为大小写再折腾。

## 怎么还原 / 怎么用

```bash
# 还原（CI 里就是这么做的）
mkdir -p "$HOME/.android"
base64 -d mobile/signing/debug.keystore.b64 > "$HOME/.android/debug.keystore"

# 核对指纹
keytool -list -v -keystore "$HOME/.android/debug.keystore" -storepass android -alias androiddebugkey
```

Android Gradle 插件在 `assembleDebug` 时默认就找 `$HOME/.android/debug.keystore`，口令与别名也正好是上表那几个值，所以**不需要改 `build.gradle`** 的签名配置，放对位置就生效。

> runner 上如果设了 `ANDROID_USER_HOME` / `ANDROID_PREFS_ROOT` / `ANDROID_SDK_HOME`，AGP 找的目录会跟着变。GitHub 的 `ubuntu-latest` 只设了 `ANDROID_HOME` 和 `ANDROID_SDK_ROOT`，所以默认位置就是 `$HOME/.android`。工作流里的签名步骤会把这几个变量打出来，方便哪天出问题一眼看到。

## 当前密钥指纹（用于核对）

```
keystore sha256 : 8edd43e2d3dc0e19865c81a68525b23a76ae94147b878552a1506ff5e6f4458e
证书 SHA-256    : 72:73:8C:20:5C:80:FC:A6:98:6D:0F:A5:F6:8B:DF:34:10:D4:21:3F:16:A3:A3:A7:4B:33:06:45:52:77:2D:CD
证书 SHA-1      : 18:8E:26:77:BE:96:1D:A8:86:AA:8C:2C:CE:6A:C7:18:8B:57:F2:83
有效期至        : 2126-09-17（36500 天）
```

改完密钥后请把上面的指纹一起更新，否则下次没法判断"到底换没换"。

工作流里还有一步 **`核对 APK 的签名证书指纹`**：把 APK 实际的签名证书 SHA-256（去掉冒号、转小写）和上面这个 64 位十六进制值比对，**不一致就直接 `exit 1`**。这样"密钥放进去了但没被采用"这类事不会再静默发出去——宁可 CI 红。

## 今后怎么轮换

密钥 **一旦发布出去就不能随便换**：换了就等于"换了一个签名者"，所有已安装的用户都会被签名冲突挡住，必须卸载重装、丢数据。所以只在下面两种情况轮换：

1. **证书临近过期**（当前到 2126-09-17，还早）。生成时给 36500 天（100 年）就是为了彻底躲开有效期检查——**不要改成小于 30 年的值**，否则 AGP 会重造一把，签名又会每次都不一样。
2. **确认密钥泄露后造成实际风险**——对这把口令公开的 debug 密钥来说，风险本来就只限于"别人能签一个调试包"，所以这条基本不会触发。

轮换步骤：

```bash
# 1) 备份旧的（万一要回滚）
cp mobile/signing/debug.keystore.b64 mobile/signing/debug.keystore.b64.bak

# 2) 生成新密钥（参数必须与本文档一致：JKS / 口令 android / 别名 androiddebugkey / 有效期 > 30 年）
keytool -genkeypair -v -keystore debug.keystore -storetype JKS -alias androiddebugkey -storepass android -keypass android -keyalg RSA -keysize 2048 -validity 36500 -dname "CN=Android Debug,O=Android,C=US"

# 3) 转 base64 文本入库，并回验 sha256 与解码后一致
base64 -w 0 debug.keystore > mobile/signing/debug.keystore.b64

# 4) 更新本文档里的三个指纹 + 工作流核对步骤里的 EXPECTED，然后在 Release 说明里提醒用户：本次必须卸载重装
```

## 上架 Google Play 前必须做的事

**当前这把密钥绝对不能用于 Google Play。** 上架前必须：

1. **换成正式发布密钥**（release key）：口令不公开、不进任何仓库，用 GitHub Secrets / 密钥管理服务注入到 CI。
2. **启用 Play App Signing**：把上传密钥交给 Google 托管，Google 持有最终的应用签名密钥。这样才能在丢了上传密钥后由 Google 协助重置，也不会因为换密钥而让用户被迫卸载。
3. 在 `build.gradle` 里给 `release` 构建类型配好 `signingConfig`（改 `applicationId` 时也要同步改，因为 Play 上 `applicationId` 一旦发布不可更改）。

在完成上面三步之前，本流水线产出的都是 **debug 包**，只适合内部安装测试，不要上传到任何应用商店。
