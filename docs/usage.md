# Usage: services and backups

> English | [简体中文](usage.zh.md)

## OpenAI compatible service configuration

1. Open tray menu → Config → Service → Translate
2. Edit the default OpenAI instance
3. Enter your provider endpoint. All of these forms work:

| Entered value                             | Actual request URL                             |
| ----------------------------------------- | ---------------------------------------------- |
| `https://api.openai.com`                  | `https://api.openai.com/v1/chat/completions`   |
| `https://api.deepseek.com/v1`             | `https://api.deepseek.com/v1/chat/completions` |
| `https://example.com/api/v1/`             | `https://example.com/api/v1/chat/completions`  |
| `https://example.com/v1/chat/completions` | used as-is                                     |

4. Fill in the model (e.g. `gpt-4o-mini`, `deepseek-chat`) and API key
5. Save the configuration to `config.json`

Prompts support the `$text`, `$from`, `$to` and `$detect` variables.

## WebDAV backup & sync

Config → **Backup** backs up the entire application configuration
(translation services, hotkeys, UI settings, …) to any WebDAV service
(Jianguoyun, Nextcloud, Alist, etc.).

1. Enter the WebDAV URL (e.g. `https://dav.jianguoyun.com/dav/`), username
   and app password
2. Click **Test Connection** to verify
3. **Backup** uploads your `config.json` as a single JSON document (default
   name `pan-config.json`, customizable)
4. **Restore** downloads the remote backup and overwrites local settings
   (**full replace**: keys missing from the backup are removed; a
   confirmation is shown); restart the app for everything to take effect

With **Auto Backup** enabled, the resident background process uploads at most
once per hour while the app is running; on other machines use **Restore** to
sync the same configuration.

> Backups contain application settings only. WebDAV credentials are stored in
> the local configuration — keep your device safe.

Backups produced by upstream **pot** restore unchanged — the restore path
never gained an `app` field check, and that is a compatibility rule, not an
accident (see [Checks](checks.md), the webdav suite).
