# 使用:服务与备份

> [English](usage.md) | 简体中文

## OpenAI 兼容服务配置

1. 打开托盘菜单 → 偏好设置 → 服务 → 翻译
2. 编辑默认的 OpenAI 实例
3. 填写服务商的接口地址,以下写法均可:

| 填写内容                                  | 实际请求地址                                   |
| ----------------------------------------- | ---------------------------------------------- |
| `https://api.openai.com`                  | `https://api.openai.com/v1/chat/completions`   |
| `https://api.deepseek.com/v1`             | `https://api.deepseek.com/v1/chat/completions` |
| `https://example.com/api/v1/`             | `https://example.com/api/v1/chat/completions`  |
| `https://example.com/v1/chat/completions` | 原样使用                                       |

4. 填写模型名(如 `gpt-4o-mini`、`deepseek-chat`)和 API Key
5. 保存时会把配置写入 `config.json`

Prompt 中可使用 `$text`、`$from`、`$to`、`$detect` 变量。

## WebDAV 备份同步

偏好设置 → **备份** 页面可将全部应用配置(翻译服务、快捷键、界面设置等)
备份到任意 WebDAV 网盘(坚果云、Nextcloud、Alist 等)。

1. 填写 WebDAV 地址(如 `https://dav.jianguoyun.com/dav/`)、用户名和应用密码
2. 点击 **测试连接** 验证配置
3. **备份**:把当前 `config.json` 上传为远端的一个 JSON 文件(默认名
   `pan-config.json`,可自定义)
4. **恢复备份**:从远端下载并覆盖本地配置(**全量覆盖**:备份中不存在的键会被
   删除,操作前有确认提示),重启应用后完全生效

开启 **自动备份** 后,常驻后台进程会在应用运行期间每小时最多自动上传一次,
同一配置在多台设备间可手动「恢复备份」完成同步。

> 备份内容不包含历史数据库等文件,仅覆盖应用设置;WebDAV 凭据保存在本地配置
> 中,请确保设备安全。

上游 **pot** 生成的备份可以直接恢复 —— 恢复路径从未引入 `app` 字段校验,这是
兼容性红线而非巧合(见 [检查](checks.zh.md) 的 webdav 套件)。
