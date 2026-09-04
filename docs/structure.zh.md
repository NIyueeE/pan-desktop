# 项目结构

> [English](structure.md) | 简体中文

| 路径                                                                 | 用途                                                                                                    |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `translate.html` / `config.html` / `screenshot.html` / `daemon.html` | 四个 vite 入口;`window.rs` 按窗口 label 打开对应 `<label>.html`                                         |
| `src/lib/boot.ts`                                                    | `bootWindow(App)`:config snapshot → env → i18n → theme → `mount`;失败回落全屏错误页                     |
| `src/lib/config/`                                                    | 响应式配置快照 store:启动批量 `entries()` 读、防抖批量写、`cfg()` / `cfgRaw()` / `setConfig()`          |
| `src/lib/ipc/`                                                       | 类型化 `invoke` 包装 + 事件名常量                                                                       |
| `src/lib/i18n/`                                                      | i18next 实例 + 懒加载 locale(`locales/`、`FALLBACK_CHAINS`)                                             |
| `src/lib/services/`                                                  | 内置服务:OpenAI 翻译 / 识别 / TTS,有道 + Wiktionary 词典,URL 工具                                       |
| `src/lib/ui/`                                                        | 通用控件:`PSelect`、`PSwitch`、`Section`、`SettingRow`、`TextField`                                     |
| `src/lib/utils/`                                                     | `normalizeOsType` + env 注入、ISO 语言表、服务实例清洗、主题、webdav 客户端、语言检测、拖拽排序         |
| `src/windows/`                                                       | 每窗口一份 svelte 入口(`config`、`translate`、`screenshot`、`daemon`)                                   |
| `src/test/`                                                          | vitest 全局 setup + 内存 tauri mock 状态                                                                |
| `src/preview/` + `preview.html`                                      | 仅开发的浏览器预览 harness(不是构建入口)                                                                |
| `src-tauri/src/`                                                     | rust 后端:`main`、`cmd`、`config`、`hotkey`、`tray`、`window`、`system_ocr`、`paddle_ocr`、`screenshot` |
| `src-tauri/resources/`                                               | 版本管理内只有 OCR 词典;onnxruntime 与模型在构建期拉取                                                  |
| `scripts/`                                                           | `fetch-onnxruntime.sh`、`fetch-paddle-models.sh`、`test-webdav.ts`、`preview-shot.mjs`                  |
| `githooks/`                                                          | `pre-commit`(快门)、`pre-push`(重门)、`check-docs`、`check-secrets`                                     |
| `justfile`                                                           | `just setup` / `fmt` / `test` / `check`                                                                 |
| `deny.toml`                                                          | cargo-deny 策略(licenses / bans / advisories / sources)                                                 |
| `rust-toolchain.toml`                                                | `channel = "stable"` + clippy/rustfmt 组件                                                              |
| `.github/workflows/package.yml`                                      | 唯一流水线:lint 链 + 多平台构建 + 标签发布                                                              |
| `.github/actions/build-for-linux/`                                   | 构建 deb / rpm / AppImage 的 docker 复合 action                                                         |
| `CHANGELOG`                                                          | 发布说明来源(提取首个 `# X.Y.Z` 段)                                                                     |
| `com.pan.desktop.metainfo.xml`                                       | Linux 包管理器发布元数据                                                                                |
| `AGENTS.md` / `HANDOFF.md`                                           | 代理守则 / 工作状态                                                                                     |
| `docs/`                                                              | 模块化文档(本目录)+ `docs/rewrite/` 设计记录                                                            |

参见:[检查](checks.zh.md) · [Lint 策略](lint-policy.zh.md) · [发布](release.zh.md)
