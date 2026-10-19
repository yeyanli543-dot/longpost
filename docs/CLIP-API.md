# 剪藏 API（本地桥）

LongPost 桌面版在 `127.0.0.1` 上开了一个只接受本机请求的小接口，
任何脚本、扩展、快捷指令都可以把内容送进来。

## 开启

设置 → **Chrome 剪藏** → 打开「开启本地桥」（v3.1.1 起默认开启）。
端口随机，页面上会显示形如 `127.0.0.1:52341` 的地址。

## 认证

每个请求都要带令牌：

```http
X-LongPost-Token: <令牌>
```

令牌在设置里点「复制配对码」获取，格式 `lp1:<port>:<token>`。
令牌等同密码，泄露等于任何人都能往你的文章库写东西；怀疑泄露就点「轮换令牌」。

## 接口

### POST /clip

```bash
curl -X POST http://127.0.0.1:52341/clip \
  -H "Content-Type: application/json" \
  -H "X-LongPost-Token: <token>" \
  -d '{"title":"标题","url":"https://example.com/p","content":"正文"}'
```

请求体：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `title` | 否 | 缺省为「未命名剪藏」 |
| `url` | 否 | 只接受 http(s)；会作为来源写在正文最前面 |
| `content` | 否* | 正文；超过 200 KB 会被截断 |
| `selection` | 否* | 只有选区时使用；`content` 为空则用它 |

* `content` 与 `selection` 至少给一个，否则 400。

响应：

| 状态码 | 含义 |
| --- | --- |
| 200 | 已写入 |
| 400 | 请求体不合法 / 地址不是 http(s) / 内容为空 |
| 401 | 令牌错误 |
| 413 | 超过 512 KB |
| 429 | 60 秒内超过 40 次 |
| 404 | 路径不对 |

### 跨域

服务端放行 `Access-Control-Allow-Origin: *` 与
`Access-Control-Allow-Private-Network: true` —— 后者是 Chrome 的
Private Network Access 要求，没有它，https 页面访问 127.0.0.1 会被拦在预检。

## 最小示例（Node / Python / PowerShell）

```js
await fetch('http://127.0.0.1:52341/clip', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-LongPost-Token': token },
  body: JSON.stringify({ title: '来自脚本', url: 'https://a.com', content: '正文' }),
});
```

```python
import requests
requests.post('http://127.0.0.1:52341/clip',
    json={'title': '来自脚本', 'url': 'https://a.com', 'content': '正文'},
    headers={'X-LongPost-Token': token}, timeout=5)
```

## 安全边界

- 只监听回环地址，局域网内的其它机器连不上；
- 令牌恒定时间比较；
- 60 秒 40 次限流，防止被当成写入管道；
- 关闭开关会真正关掉监听（不是只把界面藏起来）。
