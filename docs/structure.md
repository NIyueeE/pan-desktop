# Project structure

> English | [简体中文](structure.zh.md)

| Path                                                                 | Purpose                                                                                                                             |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `translate.html` / `config.html` / `screenshot.html` / `daemon.html` | the four vite entries; `window.rs` opens `<label>.html` per window label                                                            |
| `src/lib/boot.ts`                                                    | `bootWindow(App)`: config snapshot → env → i18n → theme → `mount`; full-screen error page on failure                                |
| `src/lib/config/`                                                    | reactive config snapshot store: batched `entries()` read, debounced writes, `cfg()` / `cfgRaw()` / `setConfig()`                    |
| `src/lib/ipc/`                                                       | typed `invoke` wrappers + event-name constants                                                                                      |
| `src/lib/i18n/`                                                      | i18next instance + lazy locale loading (`locales/`, `FALLBACK_CHAINS`)                                                              |
| `src/lib/services/`                                                  | built-in services: OpenAI translate / recognize / TTS, Youdao + Wiktionary dictionaries, URL helpers                                |
| `src/lib/ui/`                                                        | shared controls: `PSelect`, `PSwitch`, `Section`, `SettingRow`, `TextField`                                                         |
| `src/lib/utils/`                                                     | `normalizeOsType` + env injection, ISO language table, service-instance sanitize, theme, webdav client, language detection, reorder |
| `src/windows/`                                                       | one svelte entry per window (`config`, `translate`, `screenshot`, `daemon`)                                                         |
| `src/test/`                                                          | vitest global setup + in-memory tauri mock state                                                                                    |
| `src/preview/` + `preview.html`                                      | dev-only browser preview harness (not a build entry)                                                                                |
| `src-tauri/src/`                                                     | rust backend: `main`, `cmd`, `config`, `hotkey`, `tray`, `window`, `system_ocr`, `paddle_ocr`, `screenshot`                         |
| `src-tauri/resources/`                                               | versioned: OCR dictionary only; onnxruntime + models are fetched at build time                                                      |
| `scripts/`                                                           | `fetch-onnxruntime.sh`, `fetch-paddle-models.sh`, `test-webdav.ts`, `preview-shot.mjs`                                              |
| `githooks/`                                                          | `pre-commit` (fast gates), `pre-push` (heavy gates), `check-docs`, `check-secrets`                                                  |
| `justfile`                                                           | `just setup` / `fmt` / `test` / `check`                                                                                             |
| `deny.toml`                                                          | cargo-deny policy (licenses / bans / advisories / sources)                                                                          |
| `rust-toolchain.toml`                                                | `channel = "stable"` + clippy/rustfmt components                                                                                    |
| `.github/workflows/package.yml`                                      | the only pipeline: lint chain + platform builds + tag releases                                                                      |
| `.github/actions/build-for-linux/`                                   | docker composite action for deb / rpm / AppImage                                                                                    |
| `CHANGELOG`                                                          | release notes source (first `# X.Y.Z` section is extracted)                                                                         |
| `com.pan.desktop.metainfo.xml`                                       | Linux package-manager release metadata                                                                                              |
| `AGENTS.md` / `HANDOFF.md`                                           | agent rules / working state                                                                                                         |
| `docs/`                                                              | modular documentation (this directory) + `docs/rewrite/` design records                                                             |

See also: [Checks](checks.md) · [Lint policy](lint-policy.md) · [Release](release.md)
