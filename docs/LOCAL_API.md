# Orbit 本地 API 与批量编辑

在工作台「设置与说明」中开启本地 API、选择端口并保存，再到「本地 API」复制令牌。默认端口 50326，默认关闭。工作台退出时接口关闭。令牌不显示在常规页面，不写入示例；复制时若系统剪贴板不可用，会提供手动选择窗口。重置后旧令牌立即失效。

仅监听 `127.0.0.1`，不监听局域网。不支持 CORS 和带 Origin 的网页请求；供本机 Python、PowerShell 等脚本使用。所有接口需要 `Authorization: Bearer <令牌>`。JSON 请求使用 `Content-Type: application/json`，请求体最多 2 MB，同时最多处理 8 个请求。成功返回 `{ "ok": true, "data": ... }`，失败返回 `{ "ok": false, "error": { "code": "...", "message": "..." } }`；截图直接返回 PNG。

## 接口

| 方法与路径 | 参数 / 返回 |
|---|---|
| GET /api/v1/status | 版本、环境数、运行数 |
| GET /api/v1/profiles | 所有环境；不返回代理密码、生成的设备身份或 API 令牌 |
| GET /api/v1/profiles/{id} | 单个环境 |
| POST /api/v1/profiles | 新建：`{name, engine?, ...}`；默认 Camoufox。带 `id` 时部分更新 |
| PATCH /api/v1/profiles/{id} | 部分更新，省略字段保留；嵌套 proxy / fingerprint / viewport / native 同样合并 |
| DELETE /api/v1/profiles/{id} | 删除已停止环境及其浏览数据 |
| POST /api/v1/profiles/batch-edit | `{ids: [...], changes: {...}}`，最多 1000 个；整批先校验后保存 |
| POST /api/v1/browser/start | `{id}`，启动成功后返回；已运行则置前 |
| POST /api/v1/browser/stop | `{id}` |
| GET /api/v1/browser/tabs?id=... | 返回 `{index, url, title}` 数组 |
| POST /api/v1/browser/navigate | `{id, url, tab?}`，仅 HTTP/HTTPS |
| POST /api/v1/browser/click | `{id, selector, tab?}` |
| POST /api/v1/browser/fill | `{id, selector, value, tab?}` |
| POST /api/v1/browser/evaluate | `{id, expression, tab?}`，执行网页 JavaScript 表达式，返回可序列化结果 |
| GET /api/v1/browser/cookies?id=... | 读取运行中环境 Cookie |
| POST /api/v1/browser/cookies | `{id, cookies: [...]}`，Playwright Cookie JSON 格式 |
| GET /api/v1/browser/screenshot?id=...&tab=0&fullPage=true | PNG 长截图；fullPage 默认 false |

标签页 `tab` 从 0 开始，默认第一个标签页。脚本可以通过 navigate、click、fill、evaluate 控制页面；这不包含操作录制或任务调度。网页操作失败时返回简化错误，不返回可能含输入值的内部调用日志。启动环境会按原规则自动匹配已配置代理的出口地区；查询失败不回退直连。

常用错误状态：400 参数或网页操作错误，401 令牌无效，403 非本机脚本请求，404 环境/标签页/接口不存在，409 环境运行中或工作台忙，413 请求过大，415 Content-Type 错误，429 并发超限。

## PowerShell 示例

把从工作台复制的令牌填入第一行，然后运行：

```powershell
$token = '<你的令牌>'
$headers = @{ Authorization = "Bearer $token" }
$base = 'http://127.0.0.1:50326'
$profiles = Invoke-RestMethod -Uri "$base/api/v1/profiles" -Headers $headers
$profiles.data | Select-Object id, name, engine, running

$id = '<环境 ID>'
$body = @{ id = $id } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "$base/api/v1/browser/start" -Headers $headers -ContentType 'application/json' -Body $body

$body = @{ id = $id; url = 'https://www.google.com/' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "$base/api/v1/browser/navigate" -Headers $headers -ContentType 'application/json' -Body $body

Invoke-WebRequest -Uri "$base/api/v1/browser/screenshot?id=$id&fullPage=true" -Headers $headers -OutFile "$env:USERPROFILE\Desktop\orbit-screenshot.png"
```

也可使用同目录 `api_example.py`：`python api_example.py list`，或 `python api_example.py start <环境ID>`。令牌从环境变量 `ORBIT_API_TOKEN` 读取，未设置时安全询问，不写入源文件。

## 批量编辑

环境列表勾选多个已停止环境 →「批量编辑」。只有勾选的字段会修改，空值仅在相应字段被勾选时清空。标签支持替换、追加、移除；启动页面留空恢复 Google 默认页。可修改分组、备注、语言、时区、窗口、UA、配色、CPU、屏幕、Canvas、WebRTC，也可选已有 Camoufox 环境作为原生指纹参数模板。

模板仅复制原生设置，不复制浏览数据、生成的设备身份或其他环境的音频种子，不切换浏览器内核。模板与已有窗口尺寸不兼容时整批拒绝，需同时调整视口或屏幕。修改系统类型可能重新生成设备身份，网站可能要求验证。配置代理的环境，下次启动仍会自动覆盖语言与时区。

API 批量编辑示例：

```json
{
  "ids": ["环境ID1", "环境ID2"],
  "changes": {
    "group": "工作",
    "tags": ["项目A"],
    "tagsMode": "add",
    "fingerprint": { "native": { "cpuCores": 8 } }
  }
}
```

`changes` 支持 group、tags、tagsMode（replace/add/remove）、notes、startUrls、fingerprint，以及 fingerprintTemplateId。未勾选/未提供的字段不变；任一环境运行中或任一参数不合法时，整批不保存。
