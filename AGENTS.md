# AGENTS.md

本仓库 (`pot`, pot-desktop 精简分支) 的代理/协作者工作指南。包括统一的本地开发与质量门禁、测试驱动的反馈修复流程、以及 GitHub Actions CI/CD 与本地工作的协调模式。

> 本指南中凡引用 `pnpm xxx` / `pnpm test:xxx` 的命令，必须使用仓库根目录的 `package.json` 中定义的脚本；CI 跑的就是同一套脚本，本地门禁与 CI 门禁完全对齐（见第 6 节）。

## 1. 项目概览

-   **定位**：`pot-app/pot-desktop` 的精简分支，**仅保留** 划词翻译、输入翻译、OCR 翻译三种入口，翻译服务只保留 **OpenAI Chat Completions 兼容 API**，OCR 只保留系统 OCR + Tesseract。
-   **技术栈**：Tauri 2.11（Rust 2024 stable + rustfmt + clippy）、React 18 + Vite 5、NextUI、react-beautiful-dnd、jotai、react-i18next、pnpm 9、Node 22。
-   **目录结构**（`/` 仓库根）：

    | 路径                                                                                | 作用                                                                                                                 |
    | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
    | `src/`                                                                              | 前端 React 源码                                                                                                      |
    | `src/window/{Config,Translate,Screenshot,components,hooks,utils,i18n}`              | 窗口/通用组件/工具/i18n                                                                                              |
    | `src/window/Config/pages/{General,Translate,Recognize,Hotkey,Service,Backup,About}` | 偏好设置各页面                                                                                                       |
    | `src/window/Config/pages/Service/{Translate,Recognize}/`                            | 服务列表 + 各项服务配置（`ServiceItem` / `SelectModal` / `ConfigModal`）                                             |
    | `src/services/{translate,recognize}/`                                               | 内置服务实现（`openai/`, `system/`, `tesseract/`）                                                                   |
    | `src/test/`                                                                         | 前端组件测试基础设施（`tauri-state.js`、`setup.js`、`tauri-mocks.js`）                                               |
    | `src-tauri/`                                                                        | Rust 后端（`main.rs`, `cmd.rs`, `config.rs`, `hotkey.rs`, `tray.rs`, `window.rs`, `system_ocr.rs`, `screenshot.rs`） |
    | `scripts/test-webdav.mjs`                                                           | WebDAV 客户端零依赖 Node 测试（mock WebDAV 服务器）                                                                  |
    | `.github/workflows/package.yml`                                                     | 唯一的 CI/CD 流程（lint + 构建矩阵 + 发布）                                                                          |
    | `.github/actions/build-for-linux/`                                                  | Linux 打包的 Docker 复合 Action                                                                                      |

## 2. 常用命令

| 用途                             | 命令                                                                                               |
| -------------------------------- | -------------------------------------------------------------------------------------------------- |
| 前端开发服务器                   | `pnpm dev`                                                                                         |
| 前端生产构建（仅 `dist/`）       | `pnpm build`                                                                                       |
| Tauri 开发 / 打包                | `pnpm tauri dev` / `pnpm tauri build`                                                              |
| 格式化检查 / 自动修复            | `pnpm format` / `pnpm format:fix`                                                                  |
| ESLint / Clippy（`-D warnings`） | `pnpm lint` / `pnpm lint:fix`                                                                      |
| WebDAV 客户端测试                | `pnpm test:webdav`                                                                                 |
| 前端组件测试（vitest）           | `pnpm test:ui`                                                                                     |
| Rust 单元测试                    | `pnpm test:rs`                                                                                     |
| **全量门禁（CI 等价）**          | `pnpm check`（prettier + fmt + lint + test:webdav + test:ui + test:rs + vite build + cargo check） |
| 全量测试（不含构建）             | `pnpm test`                                                                                        |

## 3. 测试反馈工作流（核心流程）

> **原则**：先复现、后修复、最后验证；测试**先于**代码改动，**先于**手动验证；任何修复都必须有对应的回归测试（除非是文档/纯配置变更）。

修复类任务的标准循环：

1. **理解症状**：在 Windows / macOS / Linux 中哪一端？热键？WebDAV？服务设置页？下拉框？记录**可观察**的现象（`Cannot read properties of undefined`、`.map is not a function`、按钮显示 `languages.undefined`、按热键后应用退出、…）。
2. **建/复用测试复现**：在 `src/window/**/` 或 `src/utils/` 旁加一个 `*.test.jsx`，复用 `src/test/setup.js` + `src/test/tauri-state.js` 的 Tauri 内存 mock。`store.entries()` 写入与生产同形状的数据，运行后看断言失败信息。
    - `UndefineSweep` 模式：在 `render()` 同步返回**之后**就立即遍历 DOM（首帧 / 稳定后两阶段），能抓"配置未加载完成时泄漏"这类问题。
3. **最小修复**：定位根因后改最小代码面；不要顺手"清理"无关代码（独立提交）。
4. **本机全量门禁**：`pnpm check` 须 exit 0。
5. **提交 + 推送**：`git commit -m "fix(...): ..."` 然后 `git push pan <branch>`；`pan` 是工作远端，`origin` 指上游 `pot-app/pot-desktop`（通常没有写权限）。
6. **CI 验证**：`gh run list --repo NIyueeE/pan-desktop --limit 2` 看刚才的 push 是否启动；只发 tag 才会触发上传到 Release（见第 6 节）。
7. **回归用例随修随加**：每修一个 bug，对应一个或多个测试用例纳入 `*.test.jsx`；这些用例就是后续的"防回归网"。

### 3.1 测试基础设施速查

-   `src/test/tauri-state.js`：纯状态模块，**无 imports**，被 `vi.mock` 的工厂函数通过 `await import('./tauri-state')` 延迟加载。导出：`fakeConfigFile`（Map）、`createFakeStore()`、`eventListeners`、`fakeInvoke(cmd, args)`、`globalShortcutCalls`、`windowState`、`resetTauriState()` 等。
-   `src/test/setup.js`：vitest 全局 setup；为所有 `@tauri-apps/*` 写 `vi.mock(...)`（路径必须字面量、工厂内通过动态 `import` 拿状态）；`react-beautiful-dnd` 用 passthrough mock 屏蔽 jsdom 中会触发的 dev 模式 invariant。
-   断言用 `@testing-library/jest-dom/vitest` 入口加载（不用 `jest-dom`，否则会在 globals: false 下报 `expect is not defined`）。
-   **vitest 2.x**（不是 3+），配套 Vite 5；用 `pnpm add -D vitest@^2.1.9` 锁定。
-   已覆盖的回归用例集（持续扩充）：
    -   `src/window/Config/UndefinedSweep.test.jsx` — 7 个配置页 × 3 种配置 × 首帧 + 稳定后扫描 `undefined`。
    -   `src/window/Config/pages/Service/ServicePage.test.jsx` — 新配置 / 过期服务实例键 / 缺实例配置 / 非法列表 / 错误边界 / 全新实例表单完整性。
    -   `src/window/Config/pages/Hotkey/HotkeyPage.test.jsx` — 焦点保留 / OK 应用 / 清空 / 冲突拒绝 / 失败还原。
    -   `src/window/Translate/TranslateWindow.test.jsx` — 翻译窗口语言下拉框 `undefined` 泄漏回归。
    -   `src-tauri/src/config.rs` 单测 — `sanitized_service_value` 纯函数。

### 3.2 添加新测试的最小步骤

1. 选最近的目录建 `Foo.test.jsx`；`expect`/`vi`/`describe`/`test` 全部从 `vitest` 显式 import（仓库 `vitest.config.js` 用 `globals: false`）。
2. 测试路径里的 `@testing-library/react` 用 `{ render, screen, waitFor, within }` 等。
3. `beforeEach` 里 `await initStore()` 并 `await store.set(...)` 写入与生产同形状的数据。
4. 涉及"快速连续点击 → 模态打开"的场景，用 `userEvent.setup()`，并把 `OK` 按钮的查找用 `within(fieldContainer(input))` 限定到目标字段容器里（同一页面通常有多个隐藏的 OK 按钮）。
5. `expect.extend(jestDom)` **不要**直接调 —— 用 `import '@testing-library/jest-dom/vitest'`（自动 extend），否则 globals: false 下 `expect is not defined`。
6. 跑 `pnpm test:ui path/to/foo.test.jsx` 单文件验证，再跑 `pnpm check` 全量。

## 4. 代码规范

-   **格式化**：`pnpm format`（prettier 4 空格 / `printWidth: 120` / `singleQuote: true` / `jsxSingleQuote: true` / `trailingComma: "es5"`）。
-   **JS/TS**：`pnpm lint:js`（`eslint src --max-warnings=0`；0 警告 0 错误是硬门槛）。
-   **Rust**：`pnpm lint:rs`（`cargo clippy --all-targets -- -D warnings`），**clippy 拒绝所有 warning**（lints.clippy: all/pedantic/nursery 都启用了 deny）。
-   **i18n**：在 `en_US.json` / `zh_CN.json` / `zh_TW.json` 至少加键；其它 locale 通过 `fallbackLng: default: ['en']` 自动回退到 en。新增键统一加到 `common.*` 或业务命名空间下，**不要**散落到非命名空间路径。
-   **提交信息**（参考 `git log` 已确立的风格）：
    -   `fix(scope): 中文一句话` — bug 修复，scope 写功能/窗口/文件名（`hotkey`、`webdav`、`ui`、`config`、`hotkey.rs`、`window.rs`）。
    -   `feat(scope): ...` — 新功能。
    -   `chore(release): vX.Y.Z — 一句话` — 版本号 bump。
    -   `test(...): ...`、`docs: ...`、`style: ...`。
-   **版本号 bump 仪式**（发版前必做）：
    1. `package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock` 同步到 `X.Y.Z`。
    2. `CHANGELOG` 顶部新增 `# X.Y.Z` 段；其它 locale 不需要改。
    3. 提交 `chore(release): vX.Y.Z — ...`；**先 push main**。

## 5. 已知陷阱（踩过记得绕开）

-   **不要**给 `daemon` window 在 `tauri.conf.json` / `tauri.windows.conf.json` 加 `--disable-web-security`：WebView2 会因此在 IPC `fetch` 中**不附 `Origin` 头**，Tauri 协议层会拒绝所有 invoke，前端直接白屏报错 `missing Origin header`（已知上游 tauri#9454）。跨域 HTTP 请改走 `@tauri-apps/plugin-http` 的 `fetch`。
-   `tauri.windows.conf.json` 与 `src-tauri/src/window.rs` 的 `BROWSER_ARGS` 必须一致（`--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection`），否则 WebView2 多窗口共享同一进程会破。
-   热键 / 托盘 / 窗口创建路径上**所有** `unwrap()` 都是 Windows 上会让进程消失的真凶（DPI 异常、显示器枚举失败、窗口属性设置失败）；改用 `let _ = ...` + `log::warn!`。
-   `useConfig(key, default)`：第二个参数**必须有**。`useConfig(key)` 会让 `setProperty(undefined)` 写入配置把键值清坏，并把 `undefined` 通过 `t('prefix.${value}')` 漏到下拉框标题里。Jotai 的 `atom()` / `atom(undefined)` 同理 —— 必须给一个**与配置默认值一致**的初值。
-   服务列表（`translate_service_list` / `recognize_service_list`）必须经过 `sanitizeServiceInstanceList` 清洗后再用；`ServiceItem` / `ConfigModal` / `TargetArea` / `SourceArea` 即使清洗漏了也要对未知服务名**降级**而不是崩。
-   `react-beautiful-dnd` 的开发模式 invariant 在 jsdom 里会因异步配置加载而触发 —— 测试里 mock 掉（见 `src/test/setup.js`），生产构建里 rbd 的 dev 检查被剔除，**真实用户不受影响**，只是测试噪声。
-   vitest 4 要求 Vite 7；本仓库用 Vite 5，所以 vitest 必须 `^2.1.9`，不要 `pnpm add vitest@latest`。
-   `cargo fmt` 与 `prettier --check` 在 `pnpm check` 里都会跑；改了 Rust/JS 任一边都要跑一遍 `pnpm format:fix`。

## 6. GitHub CI/CD 协调模式

`.github/workflows/package.yml` 是**唯一**的 CI/CD 流程。理解它如何与本机门禁协调，可以避免本地过了 CI 挂、或 CI 过了产物缺。

### 6.1 触发与并发

-   **触发**：`push: [main]` / `push: tags: ['*']` / `pull_request: [main]` / `workflow_dispatch`。
-   **并发**：`concurrency: ${{ github.workflow }}-${{ github.ref }}` + `cancel-in-progress: true`。**同一 ref 的旧运行会被取消**；main push 与 tag push 视为不同 ref，互不影响。
-   **权限**：全局 `contents: read`；build job 内 `contents: write`（只用于 tag 时上传到 Release）。

### 6.2 Job DAG 与依赖

```
lint ────────────────────────────────────────────────┐
                                                      │
change-version (only if push) ──┐                     │
                                ▼                     ▼
                          build-for-macos (×2)   build-for-windows (×3)   build-for-linux (×1)
                          (aarch64, x86_64)       (x64, i686, aarch64)
                                                  nsis 打包                 docker 复合 action
                                                                              deb / rpm / AppImage
```

-   `lint` 跑：`pnpm format` + `pnpm lint` + `pnpm test:webdav` + `pnpm test:ui` + `pnpm build` + `cargo check` + `cargo test`。**timeout 30 min**。
-   `change-version` 只在 `push` 事件触发（不跑 PR）：`git describe --tags --abbrev=0` 拿到最新 tag 去掉 `v/V` 作为版本号，否则退化到 `package.json` 的 version；用 `sed` 写回 `package.json` / `tauri.conf.json` / `Cargo.toml`（**Cargo.toml 的 sed 只匹配 `version = "0.0.0"`，仓库里实际是 `4.1.3`，所以 no-op；安装包版本号实际取自 `tauri.conf.json`**，新代码请保持 `tauri.conf.json` 是单一来源）。随后把整个 `source` 上传为 artifact。
-   `build-*` job 通过 `actions/download-artifact` 拉 `source` artifact 来构建，**不直接 checkout** —— 这意味着构建出来的产物使用 tag 决定的版本号，而不是 commit 时手填的。
-   矩阵：macOS 2 targets、windows 3 targets、linux 1 target。`fail-fast: false`，互相独立。

### 6.3 Release 何时真正生成

-   每个 build job 末尾都有 `Upload release` 步骤，**只在** `if: startsWith(github.ref, 'refs/tags/')` 才执行，用 `softprops/action-gh-release@v3`：
    -   `body_path: RELEASE_NOTES.md` —— `change-version` job 打包前用 awk 从 `CHANGELOG` 提取**首个 section**（到下一个 `# X.Y.Z` 为止），**去掉版本标题行**（Release 页顶部已有原生标题，正文重复会显示两级大标题），并去掉首尾空行，生成根级 `RELEASE_NOTES.md` 随 `source` artifact 下发；Release 描述只含最新一节正文（自 `## 修复` 等小节开始），不再使用整个 `CHANGELOG` 文件（2026-08 起，旧版曾整文件上传）。
    -   `files: ...` —— 把本 job 产出的安装包 `append` 到该 tag 对应的 Release。**多 job 追加到同一个 Release**，所以最终 8 个产物齐全。
-   所以：
    -   `push main` → 跑全部构建 → 7 个 artifact 但**不创建 Release**（验证性构建）。
    -   `push tag V*` → 跑全部构建 → 7 个 artifact + 自动创建/追加到 GitHub Release。
-   Tag 命名：仓库约定**大写 `V`**（commit `c16919c` 显式支持 `V`/`v` 两种），与上游 tag `V4.0.0 / V4.1.0 / V4.1.1 / V4.1.2` 一致。

### 6.4 本地 ↔ CI 对应

| 本机                                    | CI                                                           | 用途                     |
| --------------------------------------- | ------------------------------------------------------------ | ------------------------ |
| `pnpm check`                            | `lint` job（format + lint + 三套测试 + build + cargo check） | 提交前**必过**的本地门禁 |
| `git push pan main`                     | `lint` + 所有 `build-*`                                      | 验证性构建，不发布       |
| `git tag Vx.y.z && git push pan Vx.y.z` | 同上 + 各 job `Upload release` 步骤触发                      | **发布版本**             |

如果 `pnpm check` 挂了，CI 必挂；`pnpm check` 过了 CI 仍可能因为签名/cargo 网络/系统依赖而挂，但概率小。

### 6.5 发版流程（从零到 Release）

1. 修 bug、加测试、`pnpm check` 全过。
2. 改版本号 + `CHANGELOG` 新增段，**单独立一个提交**（`chore(release): v4.1.3 — ...`），便于回退。
3. `git push pan main`，等 CI 验证性构建跑完（lint 必须过；build 即使挂也不影响发布，按需调查）。
4. `git tag V4.1.3 && git push pan V4.1.3`，触发 tag 工作流。
5. 监控：`gh run watch <run-id> --repo NIyueeE/pan-desktop --exit-status --interval 30`；`gh run view` 看 job 进度。
6. 全部 build 完成且 Release 自动发布：`gh release view V4.1.3 --repo NIyueeE/pan-desktop --json assets --jq '.assets[].name'` 确认 8 个产物（macOS 2、windows 3、linux 3：deb/rpm/AppImage）。
7. 上次 V4.1.3 实测：lint 4m54s、macOS 6-7 min、windows 11-12 min、linux 17 min，总计约 26 分钟。超时上限 90 min。

### 6.6 签名 / 密钥

`build-for-macos` job 会消费以下 secret（如未配置则自动 `unset` 走未签名打包）：

-   `TAURI_PRIVATE_KEY` / `TAURI_KEY_PASSWORD`（tauri updater 签名，所有平台共用）。
-   `APPLE_CERTIFICATE` / `APPLE_CERTIFICATE_PASSWORD` / `APPLE_SIGNING_IDENTITY` / `APPLE_TEAM_ID` / `APPLE_API_ISSUER` / `APPLE_API_KEY` / `APPLE_ID` / `APPLE_PASSWORD`（macOS 公证/签名）。
-   `APPLE_CERTIFICATE` 不存在时显式 `unset` 全部 Apple 变量，未签名 DMG 仍可产出。

Windows / Linux 不消费 Apple 变量，缺 `TAURI_*` 时也能正常打包（只是没有 updater 签名）。

### 6.7 依赖更新

`.github/dependabot.yml` 每周合并更新：

-   `cargo`（目录 `/src-tauri`）
-   `npm`（目录 `/`）
-   `github-actions`（目录 `/`）

Dependabot 自动 PR 走的是同一条 `lint` job（含新加的 vitest 与 cargo 测试），不合规会被门禁拦下。

## 7. 提交 / 发布前自检清单

-   [ ] `pnpm check` 0 退出码（含 prettier / eslint / clippy / test:webdav / test:ui / test:rs / vite build / cargo check）。
-   [ ] 改动对应的 `*.test.jsx` 或 Rust 单测已新增/更新。
-   [ ] CHANGELOG 顶部 #X.Y.Z 段已写；i18n 新键已加到 en/zh_CN/zh_TW。
-   [ ] 若改 Rust：`src-tauri/Cargo.lock` 也更新（`cargo build` 后自动改）。
-   [ ] 提交信息遵循第 4 节风格；`fix`/`feat`/`chore(release)` 三种最常用。
-   [ ] 推 `pan` 远端（`origin` 指上游，通常不直接推）。
-   [ ] 若是发版：版本号三处一致、tag 名 `Vx.y.z`、已用 `gh release view` 确认 8 个产物到位。
