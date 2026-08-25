# Pot (Lite)

> A trimmed fork of [pot-app/pot-desktop](https://github.com/pot-app/pot-desktop).

This fork keeps only three translation entry points:

-   **Selection translate**: translate selected text via global shortcut
-   **Input translate**: open the input window from the tray or a global shortcut
-   **OCR translate**: capture a screenshot, recognize text with local OCR, then translate

The only translation backend is the **OpenAI Chat Completions compatible protocol**, the most widely supported model API format. Any provider with a compatible endpoint can be used by configuring a custom request URL, model, API key and prompt.

The `pot` brand name is intentionally unchanged for now.

## Scope

### Kept

-   Selection / input / OCR translation
-   OpenAI Chat Completions compatible API
    -   Custom `Base URL` or full `/chat/completions` endpoint
    -   Custom model, API key and System/User/Assistant prompts
    -   Streaming output and custom request arguments
-   Local OCR: system OCR and Tesseract
-   **WebDAV backup & sync**: one-click backup/restore of the whole configuration with optional automatic backups (see below)
-   Auto copy, always on top, window position/size memory, proxy, autostart, theme/font, i18n

### Removed

-   All other built-in translation services (DeepL, Bing, Google, Ollama, etc.)
-   Other cloud OCR services
-   TTS, collection/flashcards, history
-   Plugin system, local HTTP server, clipboard monitor
-   Standalone OCR window and the built-in updater

## Tech stack

-   Tauri 2.11
-   Rust 2024 Edition (`rust-toolchain.toml` tracks latest stable)
-   React 18 + Vite 5
-   pnpm

## Development

### Requirements

-   Node.js >= 22
-   pnpm >= 9
-   Latest stable Rust (read from `rust-toolchain.toml`)
-   Tauri 2 system dependencies on Ubuntu/Debian:

```bash
sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev \
    libayatana-appindicator3-dev librsvg2-dev patchelf
```

### Commands

```bash
pnpm install

# Run in development
pnpm tauri dev

# Build installers
pnpm tauri build

# Frontend build
pnpm build

# Format check / fix
pnpm format
pnpm format:fix

# Strict lint (zero ESLint warnings + Clippy deny warnings)
pnpm lint
pnpm lint:fix

# Full check
pnpm check
```

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

Config → **Backup** lets you back up the entire application configuration (translation services, hotkeys, UI settings, …) to any WebDAV service (Jianguoyun, Nextcloud, Alist, etc.).

1. Enter the WebDAV URL (e.g. `https://dav.jianguoyun.com/dav/`), username and app password
2. Click **Test Connection** to verify
3. **Backup** uploads your `config.json` as a single JSON document (default name `pot-config.json`, customizable)
4. **Restore** downloads the remote backup and overwrites local settings; restart the app for everything to take effect

With **Auto Backup** enabled, the resident background process uploads at most once per hour while the app is running; on other machines use **Restore** to sync the same configuration.

> Backups contain application settings only. WebDAV credentials are stored in the local configuration — keep your device safe.

## CI/CD

`.github/workflows/package.yml` runs formatting, ESLint, Clippy, the frontend build and `cargo check` on PRs; pushes to main or tags build macOS, Windows and Linux installers and publish them to a Release.

-   Manual runs via `workflow_dispatch`
-   Superseded builds on the same branch are cancelled automatically (concurrency)
-   pnpm store and Rust dependency caching (Swatinem/rust-cache) for much faster builds
-   All jobs have timeout limits to avoid burning minutes on hangs

## License

[GPL-3.0-only](./LICENSE)
