# AGENTS.md

本仓库（`pan`，`pan-desktop` — `pot-app/pot-desktop` 的精简分支，品牌已于 2026-08 由 pot 更名为 pan）的代理/协作者工作指南。本版随 **Svelte 5 + TypeScript + Bun** 重写同步更新（2026-08，v4.2.0-wip）：前端栈、Tauri command 之外的 IPC 契约、配置文件形态与上游 pot 备份兼容性都保持原状。包含统一的本地开发与质量门禁、测试驱动的反馈修复流程、GitHub Actions CI/CD 与本地工作的协调模式，以及 Windows 平台窗口/焦点/热键问题的深度排查手册（见第 8 节）。

> 本指南中凡引用 `bun run xxx` / `bun run test:xxx` 的命令，必须使用仓库根目录 `package.json` 中定义的脚本；CI 跑的就是同一套脚本，本地门禁与 CI 门禁完全对齐（见第 6 节）。
>
> **Bun / Node 双运行时**：`bun run <script>` 只是把脚本交给 shell 执行，脚本里出现的 `vite` / `vitest` / `svelte-check` / `tauri` 等都是 `node_modules/.bin/` 下的 node-shebang 二进制，**仍需 Node.js >= 22 作为运行时**。GitHub 托管 runner 自带 Node；Linux Docker 镜像（`build-for-linux`）需要在 entrypoint 手动下载 Node；本地开发者装 Bun 即可，但本机无 Node 时 `bun run build` / `bun run test:ui` 会以"command not found"或 shebang 失败挂掉。

## 1. 项目概览

- **定位**：`pot-app/pot-desktop` 的精简分支，品牌名 **pan**（应用标识 `com.pan.desktop`，可执行文件 `pan`）。**仅保留** 划词翻译、输入翻译、OCR 翻译三种入口，翻译服务只保留 **OpenAI Chat Completions 兼容 API**（显示名 "OpenAI Compatible"），OCR 保留系统 OCR + Tesseract + **OpenAI 兼容 VLM 视觉识别端点**（`src/lib/services/recognize/openai`，默认关闭、手动添加）。
- **兼容性红线**：上游 pot 生成的 WebDAV 备份（`app: 'pot'`）必须永远可以恢复 —— 备份校验只看 `type: 'config-backup'`，**不要**加 `app` 字段校验（有专门回归用例：`scripts/test-webdav.ts` 的 "Legacy pot backups still restore" 一节）。
- **技术栈**：
    - Tauri 2.11（Rust 2024 stable + `rustfmt` + `clippy`，`lints.clippy: all/pedantic/nursery` 全部 deny warnings）。
    - Svelte 5（runes）+ TypeScript strict（`noUncheckedIndexedAccess`、`verbatimModuleSyntax`、`isolatedModules`）+ Vite 8（多 HTML 入口）+ Tailwind CSS 4 + bits-ui + svelte-sonner + @lucide/svelte + i18next（服务列表拖拽排序用原生 HTML5 DnD，见 `ServiceManager.svelte`）。
    - **Bun**（包管理 / 脚本入口，`bun.lock` 锁定）+ **Node.js >= 22**（vite / vitest / svelte-check / tauri CLI 等依赖 bin 的运行时；见上文双运行时注）。
    - vitest 4 + @testing-library/svelte 5 + jsdom 30；ESLint 10 flat config + typescript-eslint + eslint-plugin-svelte + svelte-check。
- **目录结构**（`/` 仓库根）：

    | 路径                                                                                                     | 作用                                                                                                                             |
    | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
    | `translate.html` / `config.html` / `screenshot.html` / `daemon.html`                                     | 四个 vite 入口；`src-tauri/src/window.rs` 按窗口 label 打开对应文件（`WebviewUrl::App(format!("{label}.html"))`）                |
    | `src/lib/boot.ts`                                                                                        | `bootWindow(App)`：config snapshot → env → i18n → theme → `mount(App)`；失败回落到全屏错误页（legacy invariant）                 |
    | `src/lib/config/{defaults.ts, store.svelte.ts}`                                                          | 响应式配置快照 store；启动一次 `entries()` 批量读，写入防抖批量落盘 + 广播 `<key>_changed`；`cfg()` / `cfgRaw()` / `setConfig()` |
    | `src/lib/i18n/{i18n.svelte.ts, locales/}`                                                                | i18next 实例 + 懒加载 locale（`loadLanguage` 动态 import 当前语言 + 英文回退）；新增 locale 需在 `i18n.svelte.ts` 注册           |
    | `src/lib/ipc/{commands.ts, events.ts}`                                                                   | 类型化 `invoke` 包装 + 事件名常量                                                                                                |
    | `src/lib/services/{translate,recognize,openai_url.ts,index.ts,types.ts}`                                 | 内置服务实现（OpenAI 翻译 + 系统 OCR + Tesseract + OpenAI 兼容 VLM 视觉识别）                                                    |
    | `src/lib/ui/{PSelect,PSwitch,Section,SettingRow,TextField}.svelte`                                       | 通用控件                                                                                                                         |
    | `src/lib/utils/{env.svelte.ts,language.ts,service_instance.ts,theme.svelte.ts,webdav.ts,lang_detect.ts}` | 工具：`normalizeOsType()` / `appEnv` 注入、ISO 语言表、服务实例键/清洗、主题切换、WebDAV 客户端、语言检测                        |
    | `src/windows/{config,translate,screenshot,daemon}/`                                                      | 每窗口一份 Svelte 入口（`main.ts` → `bootWindow`）                                                                               |
    | `src/windows/config/{pages,components}/`                                                                 | 偏好设置各页（General/Translate/Recognize/Hotkey/Service/Backup/About）与控件                                                    |
    | `src/test/{setup.ts,tauri-state.ts}`                                                                     | vitest 全局 setup + Tauri 内存 mock 状态                                                                                         |
    | `scripts/test-webdav.ts`                                                                                 | WebDAV 客户端 17 节测试（`bun` 直接运行；零依赖）                                                                                |
    | `docs/rewrite/{design.md, contract.md}`                                                                  | Svelte 重写设计与契约记录（迁移前事实校对）                                                                                      |
    | `src-tauri/`                                                                                             | Rust 后端（`main.rs`、`cmd.rs`、`config.rs`、`hotkey.rs`、`tray.rs`、`window.rs`、`system_ocr.rs`、`screenshot.rs`）             |
    | `.github/workflows/package.yml`                                                                          | 唯一 CI/CD 流程（lint + 构建矩阵 + 发布）                                                                                        |
    | `.github/actions/build-for-linux/` + `.github/actions/build.sh`                                          | Linux 打包的 Docker 复合 action + 真正的构建脚本                                                                                 |

- 重写的设计与契约细节：详见 `docs/rewrite/design.md`（栈选型、目录、配置 store 模型、主题、i18n、简化控件、测试方案、后端改动）与 `docs/rewrite/contract.md`（IPC 契约、config key 目录、窗口行为不变项清单、简化决策）。改前端行为前先读 contract 确认不是不变项。

## 2. 常用命令

| 用途                       | 命令                                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 前端开发服务器             | `bun run dev`                                                                                                             |
| 前端生产构建（仅 `dist/`） | `bun run build`                                                                                                           |
| Tauri 开发 / 打包          | `bun run tauri dev` / `bun run tauri build`                                                                               |
| 格式化检查 / 自动修复      | `bun run format` / `bun run format:fix`（prettier + cargo fmt）                                                           |
| ESLint（`-D warnings`）    | `bun run lint:js` / `bun run lint`（含 clippy）                                                                           |
| Rust clippy                | `bun run lint:rs`（`cargo clippy --all-targets -- -D warnings`）                                                          |
| 类型检查（svelte-check）   | `bun run typecheck`                                                                                                       |
| WebDAV 客户端测试          | `bun run test:webdav`                                                                                                     |
| 前端组件测试（vitest）     | `bun run test:ui`                                                                                                         |
| Rust 单元测试              | `bun run test:rs`                                                                                                         |
| **全量门禁（CI 等价）**    | `bun run check`（`format` + `lint` + `typecheck` + `test:webdav` + `test:ui` + `test:rs` + `vite build` + `cargo check`） |
| 全量测试（不含构建）       | `bun run test`                                                                                                            |

> `bun run <script>` 调用的 node-shebang bin 仍需 Node.js >= 22；`typecheck` / `test:ui` / `build` 在没有 Node 的环境会以"command not found"或 shebang 失败挂掉。

## 3. 测试反馈工作流（核心流程）

> **原则**：先复现、后修复、最后验证；测试**先于**代码改动，**先于**手动验证；任何修复都必须有对应的回归测试（除非是文档/纯配置变更）。

修复类任务的标准循环：

1. **理解症状**：在 Windows / macOS / Linux 中哪一端？热键？WebDAV？服务设置页？下拉框？记录**可观察**的现象（`Cannot read properties of undefined`、`.map is not a function`、按钮显示 `languages.undefined`、按热键后应用退出、…）。
2. **建/复用测试复现**：在 `src/windows/<area>/` 或 `src/lib/<area>/` 旁加一个 `*.test.ts`（Svelte 5 组件）/ `*.test.ts`（纯函数），复用 `src/test/setup.ts` + `src/test/tauri-state.ts` 的 Tauri 内存 mock。往 `fakeConfigFile` 写入与生产同形状的数据 → `await initConfigStore()` → `render(Component)`，运行后看断言失败信息。
    - `UndefinedSweep` 模式：在 `render()` 同步返回**之后**就立即遍历 DOM（首帧 / 稳定后两阶段），能抓"配置未加载完成时泄漏"这类问题（见 `src/windows/config/ConfigWindow.test.ts` 的 sweep suite，7 配置页 × 3 配置形态）。
3. **最小修复**：定位根因后改最小代码面；不要顺手"清理"无关代码（独立提交）。
4. **本机全量门禁**：`bun run check` 须 exit 0。
5. **提交 + 推送**：`git commit -m "fix(...): ..."` 然后 `git push pan HEAD:main`；`pan` 是工作远端且**只有 `main` 一个分支**（远端特性分支已清理，不要重建），`origin` 指上游 `pot-app/pot-desktop`（通常没有写权限）。
6. **CI 验证**：`gh run list --repo NIyueeE/pan-desktop --limit 2` 看刚才的 push 是否启动；只发 tag 才会触发上传到 Release（见第 6 节）。
7. **回归用例随修随加**：每修一个 bug，对应一个或多个测试用例纳入 `*.test.ts`；这些用例就是后续的"防回归网"。

**界面类问题的"截屏 → 修改 → 截屏"负反馈循环**（无需 Tauri 后端 / 无需真机）：`preview.html` + `src/preview/mock.ts` 在普通浏览器里注入 `window.__TAURI_INTERNALS__` 内存 mock（config store、events、plugin-http 返回 canned 翻译、plugin-os 注入全局等），把真实窗口组件原样跑起来；`scripts/preview-shot.mjs` 用本机缓存的 Playwright Chromium 无头截屏（CDP 驱动，支持点击 / 注入文本 / 深浅色 / 多语言 / 任意窗口尺寸）。用法：`node scripts/preview-shot.mjs --out-dir /tmp/pan-shots --shot '{"name":"x","query":"label=translate&lang=en"}'`（`query` 走 `label/lang/theme/text/translation/config` 参数，详见脚本头注释）。该 harness 仅限开发：`vite build` 的 rollup input 不含 `preview.html`，产物永远只有四个窗口入口。注意：无头浏览器所在机器若无 CJK 字体，中文会显示 tofu，布局判断仍可用。

### 3.1 测试基础设施速查

- `src/test/tauri-state.ts`：纯状态模块，**无 imports**（避免被 vi.mock hoisting 抓取），被 `vi.mock` 的工厂函数通过 `await import('./tauri-state')` 延迟加载。导出：`fakeConfigFile`（Map，直接当键值配置源使用）、`storeInstances`、`createFakeStore()`、`eventListeners` + `emitTestEvent()` + `listenerCount()`、`invokeHandlers` + `setInvokeHandler()` + `invokeCalls` + `fakeInvoke(cmd, args)`、`windowState` + `setCurrentWindowLabel()`、`globalShortcutCalls`、`resetTauriState()`。
- `src/test/setup.ts`：vitest 全局 setup；为 `core` / `event` / `webviewWindow` / `window` 及 `plugin-{store,fs,log,os,http,global-shortcut,notification,autostart,shell,clipboard-manager}` 全套 `@tauri-apps/*` 写 `vi.mock(...)`（路径必须字面量、工厂内通过动态 `import` 拿状态）；**`await initI18n('en')` + `await initEnv()`** 顶层执行，让 `t()` / `osType` 在测试中能直接工作（生产代码由 `bootWindow` 串行执行）；注册 `unhandledrejection` 静默 logger；`beforeEach` 调 `resetTauriState()` + `__resetConfigStoreForTests()` + 清扫 body 残留内联样式，`afterEach` 调 `cleanup()` + 同样的样式清扫（原因见第 5 节 bits-ui scroll-lock 陷阱）。
- 断言用 `import '@testing-library/jest-dom/vitest'`（**不要**直接 `expect.extend(jestDom)`，否则在 `globals: false` 下 `expect is not defined`）。
- **vitest 4** 配套 **Vite 8** + **@testing-library/svelte 5** + **jsdom 30**：`vitest.config.ts` 设 `conditions: ['browser']`（Svelte 5 client runtime 在 jsdom 下解析到浏览器构建）、`testTimeout: 15000`、`hookTimeout: 15000`、`include: ['src/**/*.test.{js,ts}']`、`globals: false`（所有 vitest API 必须显式 import）。
- **回归网 96 用例 / 13 文件全绿**（持续扩充）：
    - `src/lib/config/store.test.ts` — 启动 `entries()` 批量读 / 防抖落盘 / `writeThrough` 取消挂起写 / `<key>_changed` 广播 / 旧键（`hide_source`+`hide_language`）迁移 / `setConfigRaw` 拒绝 `undefined|null`。
    - `src/lib/utils/env.test.ts` — `normalizeOsType` 小写值归一化（`'windows'|'macos'|'linux'` → `Windows_NT`/`Darwin`/`Linux`） + `initEnv` 装载 `appEnv`。
    - `src/lib/services/openai_url.test.ts` — `resolveChatCompletionsUrl` URL 补全规则。
    - `src/lib/services/translate/openai.test.ts` — `buildTranslateMessages` + `createSseDeltaParser`（逐行缓冲 + 跨 chunk 截断处理）。
    - `src/lib/services/recognize/openai.test.ts` — VLM OCR `buildOcrRequest`（URL 补全 / Bearer 头 / `image_url` data URL / `$lang` 替换 / 默认 prompt 回退）。
    - `src/lib/utils/reorder.test.ts` — `applyReorder` 拖拽排序语义：前移 / 后移、相同下标 no-op、越界不丢项、不 mutate 输入。
    - `src/windows/translate/focus.test.ts` — 失焦宽限簿记：程序性聚焦后 800ms 内的假 blur 被忽略、真 blur 仍关窗、标记刷新延长宽限。
    - `src/windows/translate/TranslateWindow.test.ts` — `new_text` 事件路由到源 textarea / 服务调用失败呈现 / 首帧无 `languages.undefined` 泄漏。
    - `src/windows/translate/ResultCard.test.ts` — 服务调用失败展开折叠卡片 / 未运行翻译时空卡片保持折叠。
    - `src/windows/config/ConfigWindow.test.ts` — UndefinedSweep（7 配置页 × empty/partial/restored-pot 三种配置 × 首帧 + 稳定后两阶段扫描 DOM 里的 `undefined`）。
    - `src/windows/config/ServicePage.test.ts` — 翻译 / 识别服务列表（旧备份清洗 / 缺实例配置降级 / 删除实例键与配置 / 模态完整性 / 系统 OCR 图标资产存在）。
    - `src/windows/config/HotkeyPage.test.ts` — `formatHotkeyEvent` 组合键格式化 / `HotkeyInput` 的 OK 应用 / 退格清空 / 失焦还原。
    - `src/windows/config/AboutPage.test.ts` — 关于页精简形态钉死（Pan 品牌 / 唯一 GitHub 按钮且指向本 fork / 已移除入口不得回归）。
    - `scripts/test-webdav.ts` — 17 节，含 "Legacy pot backups still restore"（上游备份向后兼容红线）。
    - `src-tauri/src/config.rs` 单测 — `sanitized_service_value` 纯函数。

### 3.2 添加新测试的最小步骤

1. 选最近的目录建 `Foo.test.ts`（Svelte 组件）或 `Foo.test.ts`（纯函数）；`expect` / `vi` / `describe` / `it` 全部从 `vitest` 显式 import（仓库 `vitest.config.ts` 用 `globals: false`）。
2. Svelte 组件测试用 `@testing-library/svelte` 的 `{ render, screen, waitFor, within }` 等；纯函数测试只需 `vitest`。
3. 组件测试的 seed 模式：`fakeConfigFile.set(key, value)` 写入与生产同形状的数据 → `await initConfigStore()` → `render(Component)`。不要直接 `setConfig()` / `setConfigRaw()` —— store 的写入通过防抖落盘，断言看的是当前 render 的输出，配置注入走 `fakeConfigFile`。
4. 涉及"快速连续点击 → 模态打开"的场景，用 `@testing-library/user-event` 的 `userEvent.setup()`，并把 `OK` 按钮的查找用 `within(fieldContainer(input))` 限定到目标字段容器里（同一页面通常有多个隐藏的 OK 按钮）。
5. `expect.extend(jestDom)` **不要**直接调 —— 用 `import '@testing-library/jest-dom/vitest'`（自动 extend），否则 `globals: false` 下 `expect is not defined`。
6. 跑 `bun run test:ui path/to/foo.test.ts`（vitest 接受位置过滤）单文件验证，再跑 `bun run check` 全量。

## 4. 代码规范

- **格式化**：`bun run format` = `prettier --check .` + `cargo fmt --check`；prettier 4 空格 / `printWidth: 120` / `singleQuote: true` / `trailingComma: "es5"`，并通过 `prettier-plugin-svelte` 处理 `*.svelte`。**prettier 会检查 `AGENTS.md` / `README*.md` / `CHANGELOG` 等 markdown 文件以及 `*.yml` / `*.json`**—— 改完任何一类文件都要跑一次 `bun run format:fix`（本轮 AGENTS.md 重写就是踩着这个坑过的）。
- **JS/TS**：`bun run lint:js`（`eslint . --max-warnings=0`；0 警告 0 错误是硬门槛）。`eslint.config.js` 是 flat config：JS 推荐 + `tseslint.configs.recommended` + `svelte.configs.recommended`；`*.svelte.ts` 显式回退到 TS parser；`*.svelte` 关闭 `prefer-const`（Svelte 5 的 `$props()` / `$state` 用 `let` 是 idiom）。`@typescript-eslint/no-explicit-any` 强制 error；`no-console` 在 `src/**` 强制 warn（`--max-warnings=0` 即 error）。
- **TypeScript**：`tsconfig.json` 走 strict 全开（`strict`、`noUncheckedIndexedAccess`、`verbatimModuleSyntax`、`isolatedModules`），`bun run typecheck` = `svelte-check --tsconfig tsconfig.json --fail-on-warnings`。**0 errors / 0 warnings 是硬门槛**（`--fail-on-warnings` 下任何一个新 warning 都会让 CI lint job 失败，与 eslint `--max-warnings=0`、clippy `-D warnings` 同一纪律）。
- **Rust**：`bun run lint:rs`（`cargo clippy --all-targets -- -D warnings`），**clippy 拒绝所有 warning**（`lints.clippy: all/pedantic/nursery` 都启用了 deny）。
- **i18n**：在 `src/lib/i18n/locales/en_US.json` / `zh_CN.json` / `zh_TW.json` 至少加键；其它 locale 通过 `fallbackLng`（`FALLBACK_CHAINS`）回退到 `en`，i18next 找不到键会原样输出。新增 locale 需在 `i18n.svelte.ts` 的 `LOCALE_FILES` 注册。**新增键统一加到 `common.*` 或业务命名空间下**，**不要**散落到非命名空间路径。
- **提交信息**（2026-08 起统一英文风格；参考 `git log`）：
    - `fix(scope): english one-liner` — bug 修复，scope 写功能/窗口/文件名（`hotkey`、`webdav`、`ui`、`config`、`env`、`translate`、`cmd`、`ci`）。
    - `feat(scope): ...` — 新功能。
    - `chore(release): vX.Y.Z — one-liner` — 版本号 bump。
    - `test(...): ...`、`docs: ...`、`style: ...`、`refactor(...): ...`。
- **版本号 bump 仪式**（发版前必做）：
    1.  `package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`（以及 `Cargo.lock` 若有更新）同步到 `X.Y.Z`。
    2.  `CHANGELOG` 顶部新增 `# X.Y.Z` 段；其它 locale 不需要改。
    3.  `com.pan.desktop.metainfo.xml` 的 `<releases>` 顶端加 `<release version="X.Y.Z" date="YYYY-MM-DD"><url type="details">https://github.com/NIyueeE/pan-desktop/releases</url></release>`（Linux 包管理器发布元数据，否则用户不会看到新版本）。
    4.  提交 `chore(release): vX.Y.Z — ...`；**先 push main**，再打 tag。

## 5. 已知陷阱（踩过记得绕开）

- **Bun 不会用自身运行时替换 node-shebang 的 bin**：`bun run build` / `bun run test:ui` / `bun run tauri build` 实际是 `bun shell` 执行脚本字符串，脚本里的 `vite` / `vitest` / `svelte-check` / `tauri` 走 `node_modules/.bin/` 的 node shebang，**仍然需要 Node 22 在 PATH**。在 Linux Docker 镜像里，**rust:bookworm 没有 Node**，必须显式下载 Node tarball（`build-for-linux/entrypoint.sh` 已有）；runner 预装 Node 22 是另一回事，本机开发装 Bun 也要确保有 Node 22。
- **`@tauri-apps/cli` 必须在 devDependencies**：本轮 Svelte 重写时遗漏，`bun run tauri build` 立即 "command not found"，所有平台的 build job 全挂。改用 `bun add -d @tauri-apps/cli@^2.11.4` 重新装回，提交 `package.json` + `bun.lock`。
- **`bun install --frozen-lockfile` 与 `bun.lock` 一致性**：改依赖必须 `bun add`（自动更新 lockfile），手动改 `package.json` 而不跑 `bun install` 会让 CI 报 "lockfile out of sync" 失败。**`package.json` 和 `bun.lock` 必须一起提交**。
- **不要**给 `daemon` window 在 `tauri.conf.json` / `tauri.windows.conf.json` 加 `--disable-web-security`：WebView2 会因此在 IPC `fetch` 中**不附 `Origin` 头**，Tauri 协议层会拒绝所有 invoke，前端直接白屏报错 `missing Origin header`（已知上游 tauri#9454）。跨域 HTTP 请改走 `@tauri-apps/plugin-http` 的 `fetch`。（2026-08 重写时已确认 `tauri.conf.json` 的 daemon 窗口不再带 `disableGpu` / `webSecurity` args；`tauri.windows.conf.json` 仅设 `additionalBrowserArgs` 关闭 WebView2 隐私 UI，**未引入 web-security 关闭**，红线守住。）
- `tauri.windows.conf.json` 的 daemon `additionalBrowserArgs` 与 `src-tauri/src/window.rs` 的 `BROWSER_ARGS` 必须一致（`--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection`），否则 WebView2 多窗口共享同一进程会破。
- 热键 / 托盘 / 窗口创建路径上**所有** `unwrap()` 都是 Windows 上会让进程消失的真凶（DPI 异常、显示器枚举失败、窗口属性设置失败）；改用 `let _ = ...` + `log::warn!`。
- **配置 store 调用纪律**：
    - `cfg(key)` 用于 catalog 键（`ConfigKey` 在 `defaults.ts` 定义），自带类型化默认值快照读；`cfgRaw(key)` 用于未 catalog 化的键（实例配置等）。
    - `setConfigRaw` 显式拒绝 `undefined` / `null` 写入（旧 invariant 保留）—— 不要绕过 store 直接 `store.set(key, undefined)`，会清坏键值并通过 `t('prefix.${value}')` 泄漏 `prefix.undefined` 到下拉框。
    - **两个写入通道**：`setConfig` 防抖批量落盘 + 广播 `<key>_changed`（适用于配置面板的所有字段）；`writeThrough` 立即落盘并取消同 key 的挂起写（仅用于**窗口可能立刻消失**的值：热键绑定、服务实例模态的保存/删除）。错用 `setConfig` 存热键会导致热键更新前窗口已关。
- **服务列表必须经过 `sanitizeServiceInstanceList`**：`translate_service_list` / `recognize_service_list` 是用户配置中的字符串数组（从老备份恢复时可能含已移除的服务实例键），`ServiceManager` / `ConfigModal` / 翻译目标/源下拉框即使清洗漏了也要对未知服务名**降级**而不是崩。`BUILTIN_TRANSLATE_SERVICES = ['openai']`、`BUILTIN_RECOGNIZE_SERVICES = ['system','tesseract','openai']`。
- **Svelte 5 响应式 effect 依赖陷阱**：`$effect` 同步追踪读取 —— 在 effect 里读每次新建的数组/对象属性会每帧重跑（旧 React fresh-array deps 陷阱的对应形态）；一次性加载用 `untrack(...)` 包一次性 IO 或 once-guard 布尔（`src/windows/translate/App.svelte` 顶部 `exactly once here` 注释是范本）；非响应式簿记用 `// eslint-disable-next-line svelte/prefer-svelte-reactivity`（如 `i18n.svelte.ts` 的 `loaded = new Set<string>()`）。
- **props seed 一次 / 构造期常量的正确姿势**（svelte-check `--fail-on-warnings` 下必须显式化）：
    - 弹窗表单从 props seed `$state`（如 `OpenAiOcrConfig` / `OpenAiTranslateConfig` 的 `cfgRaw(instanceKey)` 初值）：**首选把 seed 重构进闭包函数**（`seededConfig()` 范本 —— 正是编译器提示的 "reference it inside a closure instead"，svelte-check 与 eslint 都干净）。`// svelte-ignore state_referenced_locally` 是退路（Svelte 5.25+ 起脚本内支持），但 **ignore code 必须独占注释**（`-- 理由` 后缀会被 eslint-plugin-svelte 拆成多余的 ignore code 报错），且 eslint 的 `no-unused-svelte-ignore` 分析与编译器对"是否真的有 warning"判定存在分歧（函数参数引用处已实测），能用闭包重构就不要留 ignore。
    - `kind` 这类每个挂载实例固定、但编译器要求响应式传播的派生值，用 `$derived`（`ServiceManager.svelte` 范本），随副作用挪进 `$effect`。
    - 裸指针捕获面（截图遮罩）这类"无交互 role 适用"的元素，用 `<!-- svelte-ignore a11y_* -->` 标注，不要硬塞错误的 role。
- **测试中必须 `unmount()`**：Svelte 5 的 `$effect` 不会在测试跨用例自动清理；`@testing-library/svelte` 的 `render()` 返回的 `unmount()` 是清理监听器 + DOM 的唯一入口，否则跨用例泄漏 listener / `fakeConfigFile` / 事件总线。
- **vitest 4 + Vite 8 + @testing-library/svelte 5 配套**：`vitest.config.ts` 用 `conditions: ['browser']` 让 Svelte 5 client runtime 解析到浏览器构建；jsdom 30 + Tailwind 4 + bun runtime 都已知能跑通。**不要加回 `@testing-library/react` / `react` 等任何 React 测试栈**；`*.test.ts` 不用 JSX。
- **i18n 懒加载的兜底**：`loadLanguage` 内部用 `mod.default ?? {}` 解出 bundle，再识别 `{ translation: { ... } }` 命名空间（locale JSON 沿用上游 i18next 嵌套形态）；新增 locale 文件保持同结构。
- `cargo fmt` 与 `prettier --check` 在 `bun run check` 里都会跑；改了 Rust/JS 任一边都要跑一遍 `bun run format:fix`。
- **plugin-os v2 返回小写 OS 类型**：`@tauri-apps/plugin-os` 的 `type()` 给 `'windows' | 'macos' | 'linux'`，而全仓库按 Tauri v1 名（`Windows_NT`/`Darwin`/`Linux`）比较（系统 OCR 的 `switch (osType)`、每 OS 窗口布局、图标路径）。唯一归一化点在 `src/lib/utils/env.svelte.ts` 的 `normalizeOsType()`；新增 OS 分支判断一律用规范名。
- **重负载 Tauri command 必须 `#[tauri::command(async)]`**：同步命令在主线程执行，任何 >10ms 的工作（全屏截图、PNG 编码、WinRT OCR 的 `block_on`、文件读取）都会冻结事件循环 → **全局热键饿死**（WM_HOTKEY 由主线程 WndProc 分发，详见第 8 节）→ 表现为"注册成功但按下无反应"。WinRT 调用移到后台线程时必须先 `CoInitializeEx(COINIT_MULTITHREADED)`（主线程由 tao 初始化为 STA，后台线程没有 COM apartment；需要 `windows` crate 的 `Win32_System_Com` feature）。剪贴板类（arboard/selection）依赖 OLE，保持同步。
- **tao 的 `set_focus()` 在 `SetForegroundWindow` 被系统拒绝时会注入一对合成 ALT 按键**（`SendInput(VK_LMENU)`）：打断中文输入法组合（"打不了字"）并反复抢前台（"点其他区域焦点弹回"）。翻译窗口聚焦必须**按需单次**：先查 `isVisible()/isFocused()`，仅在需要时调用一次；**禁止**在创建隐藏窗口时链 `.focused(true)`。
- **翻译窗口 close-on-blur 三层防护不可拆**：程序性聚焦后 800ms 宽限期（`src/windows/translate/focus.ts`）、`Confirm Blur` 前复查 `isFocused()`、拖动/聚焦取消。Windows/WebView2（透明+无边框+skip-taskbar）会自发 Focus/Blur 振荡，裸定时器关窗会在用户打字时把窗口关掉。
- **`tauri-plugin-fs` 的 watch 命令在非默认 cargo feature 里**：`tauri-plugin-fs = { version = "...", features = ["watch"] }`。报 `Command watch not found` = 命令被 feature gate 编译掉了，**不是** ACL/权限问题。插件命令"不存在"类报错的排查顺序：① `generate_handler!` 是否注册；② cargo feature 是否 gate；③ capabilities 是否覆盖该 window label。
- **tauri-plugin-log 默认 UTC 时间戳**（用户看到的日志时间会差时区），已设 `TimezoneStrategy::UseLocal`；新日志排查先确认时间基准。
- **bits-ui Dialog 的 body scroll-lock 会跨测试泄漏 `pointer-events: none`**：锁样式经 `afterTick`（微任务）写到 `document.body` 上，靠**真实的 24ms `setTimeout`** 恢复；jsdom 里组件卸载后该定时器在 CI 高负载下可能迟到 100ms+，锁样式于是落进后续测试。`pointer-events` 是可继承属性，jsdom 会把继承值算给每个元素 → user-event 报 "Unable to perform pointer interaction as the element has `pointer-events: none`"（错误树只有目标元素一个，因为继承值在目标上就命中了）。`src/test/setup.ts` 的 `beforeEach`/`afterEach` 现在会清掉 body 内联样式；再遇到同类"幽灵 pointer-events"报错，先查跨测试泄漏的 DOM 全局状态，而不是怀疑组件本身。

## 6. GitHub CI/CD 协调模式

`.github/workflows/package.yml` 是**唯一**的 CI/CD 流程。理解它如何与本机门禁协调，可以避免本地过了 CI 挂、或 CI 过了产物缺。

### 6.1 触发与并发

- **触发**：`push: [main]` / `push: tags: ['*']` / `pull_request: [main]` / `workflow_dispatch`。
- **并发**：`concurrency: ${{ github.workflow }}-${{ github.ref }}` + `cancel-in-progress: true`。**同一 ref 的旧运行会被取消**；main push 与 tag push 视为不同 ref，互不影响。
- **权限**：全局 `contents: read`；build job 内 `contents: write`（只用于 tag 时上传到 Release）。

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

- 每个 build job 走：`actions/download-artifact` 拉 `source` → `oven-sh/setup-bun@v2`（latest）→ `actions/setup-node@v5`（22，**bin 运行时**）→ `dtolnay/rust-toolchain@stable`（带 `targets: ${{ matrix.target }}`）→ `Swatinem/rust-cache@v2` → `bun install --frozen-lockfile` → `bun run tauri build ...`（macOS/Windows 直接、Linux 走 docker action）。
- `lint` 跑：`bun run format` + `bun run lint`（含 clippy） + `bun run typecheck`（svelte-check） + `bun run test:webdav` + `bun run test:ui` + `bun run build` + `cargo check` + `cargo test`。**timeout 30 min**。
- `change-version` 只在 `push` / `workflow_dispatch` 事件触发（不跑 PR）：`git describe --tags --abbrev=0` 拿到最新 tag 去掉 `v/V` 作为版本号，否则退化到 `package.json` 的 version（用 `node -p` 解析；runner 自带 Node 22）。用 `sed` 写回 `package.json` / `tauri.conf.json` / `Cargo.toml`（**Cargo.toml 的 sed 只匹配 `version = "0.0.0"`，仓库里实际是 `4.1.3`，所以 no-op；安装包版本号实际取自 `tauri.conf.json`**，新代码请保持 `tauri.conf.json` 是单一来源）。随后 `awk` 从 `CHANGELOG` 提取最新一节（去掉版本标题行与首尾空行）生成 `RELEASE_NOTES.md`，把整个 `source` 上传为 artifact。
- `build-*` job 通过 `actions/download-artifact` 拉 `source` artifact 来构建，**不直接 checkout** —— 这意味着构建出来的产物使用 tag 决定的版本号，而不是 commit 时手填的。
- 矩阵：macOS 2 targets、windows 3 targets、linux 1 target。`fail-fast: false`，互相独立。
- **Linux Docker action（`build-for-linux`）**：`Dockerfile` 把 `oven/bun:1` 的 `/usr/local/bin/bun` 直接 COPY 进来（rust:bookworm 无 bun 也无 Node）；`entrypoint.sh` 继续下载 Node 22.14.0 tarball 放进 PATH（vite/tauri CLI 需要），**不再装 pnpm**；`build.sh` 调 `bun install --frozen-lockfile` + `bun run tauri build` + 可选 `-b deb rpm`（x86_64 默认出 deb/rpm/AppImage 三件）。

### 6.3 Release 何时真正生成

- 每个 build job 末尾都有 `Upload release` 步骤，**只在** `if: startsWith(github.ref, 'refs/tags/')` 才执行，用 `softprops/action-gh-release@v3`：
    - `body_path: RELEASE_NOTES.md` —— `change-version` job 打包前用 awk 从 `CHANGELOG` 提取**首个 section**（到下一个 `# X.Y.Z` 为止），**去掉版本标题行**（Release 页顶部已有原生标题，正文重复会显示两级大标题），并去掉首尾空行，生成根级 `RELEASE_NOTES.md` 随 `source` artifact 下发；Release 描述只含最新一节正文（自 `## 修复` 等小节开始），不再使用整个 `CHANGELOG` 文件（2026-08 起，旧版曾整文件上传）。
    - `files: ...` —— 把本 job 产出的安装包 `append` 到该 tag 对应的 Release。**多 job 追加到同一个 Release**，所以最终 8 个产物齐全。
- 所以：
    - `push main` → 跑全部构建 → 8 个 artifact 但**不创建 Release**（验证性构建）。
    - `push tag V*` → 跑全部构建 → 8 个 artifact + 自动创建/追加到 GitHub Release。
- Tag 命名：仓库约定**大写 `V`**（commit `c16919c` 显式支持 `V`/`v` 两种），与上游 tag `V4.0.0 / V4.1.0 / V4.1.1 / V4.1.2 / V4.1.3` 一致。

### 6.4 本地 ↔ CI 对应

| 本机                                    | CI                                                                       | 用途                     |
| --------------------------------------- | ------------------------------------------------------------------------ | ------------------------ |
| `bun run check`                         | `lint` job（format + lint + typecheck + 三套测试 + build + cargo check） | 提交前**必过**的本地门禁 |
| `git push pan main`                     | `lint` + 所有 `build-*`                                                  | 验证性构建，不发布       |
| `git tag Vx.y.z && git push pan Vx.y.z` | 同上 + 各 job `Upload release` 步骤触发                                  | **发布版本**             |

如果 `bun run check` 挂了，CI 必挂；`bun run check` 过了 CI 仍可能因为签名/cargo 网络/系统依赖而挂，但概率小。

### 6.5 发版流程（从零到 Release）

1.  修 bug、加测试、`bun run check` 全过。
2.  改版本号（`package.json` / `tauri.conf.json` / `Cargo.toml` + `Cargo.lock`）+ `CHANGELOG` 新增段 + `com.pan.desktop.metainfo.xml` 加 `<release>` 条目，**单独立一个提交**（`chore(release): vX.Y.Z — ...`），便于回退。
3.  `git push pan main`，等 CI 验证性构建跑完（lint 必须过；build 即使挂也不影响发布，按需调查）。
4.  `git tag VX.Y.Z && git push pan VX.Y.Z`，触发 tag 工作流。
5.  监控：`gh run watch <run-id> --repo NIyueeE/pan-desktop --exit-status --interval 30`；`gh run view` 看 job 进度。
6.  全部 build 完成且 Release 自动发布：`gh release view VX.Y.Z --repo NIyueeE/pan-desktop --json assets --jq '.assets[].name'` 确认 8 个产物（macOS 2、windows 3、linux 3：deb/rpm/AppImage）。
7.  上次 V4.1.3 实测：lint 4m54s、macOS 6-7 min、windows 11-12 min、linux 17 min，总计约 26 分钟。超时上限 90 min。

### 6.6 签名 / 密钥

`build-for-macos` job 会消费以下 secret（如未配置则自动 `unset` 走未签名打包）：

- `TAURI_PRIVATE_KEY` / `TAURI_KEY_PASSWORD`（tauri updater 签名，所有平台共用）。
- `APPLE_CERTIFICATE` / `APPLE_CERTIFICATE_PASSWORD` / `APPLE_SIGNING_IDENTITY` / `APPLE_TEAM_ID` / `APPLE_API_ISSUER` / `APPLE_API_KEY` / `APPLE_ID` / `APPLE_PASSWORD`（macOS 公证/签名）。
- `APPLE_CERTIFICATE` 不存在时显式 `unset` 全部 Apple 变量，未签名 DMG 仍可产出。

Windows / Linux 不消费 Apple 变量，缺 `TAURI_*` 时也能正常打包（只是没有 updater 签名）。

### 6.7 依赖更新

`.github/dependabot.yml` 每周合并更新：

- `cargo`（目录 `/src-tauri`）
- **`bun`（目录 `/`，**`package-ecosystem: "bun"`**，Dependabot 2025-02 GA 支持；旧 `npm` 条目在 Bun 仓库里已无效）**
- `github-actions`（目录 `/`）

Dependabot 自动 PR 走的是同一条 `lint` job（含 vitest 与 cargo 测试），不合规会被门禁拦下。改 `package.json` / `bun.lock` 引起的 PR 若 lint 失败，多半是 Bun 升级与 svelte-check / eslint-plugin-svelte 兼容性问题，看 PR 检查日志定位。

## 7. 提交 / 发布前自检清单

- [ ] `bun run check` 0 退出码（含 prettier / eslint / svelte-check / clippy / test:webdav / test:ui / test:rs / vite build / cargo check）。
- [ ] 改动对应的 `*.test.ts`（前端）或 Rust 单测已新增/更新；测试仍全绿（当前 96 用例 / 13 文件）或更多。
- [ ] `bun.lock` 同步提交（任何 `bun add` / `bun install` 后）。
- [ ] CHANGELOG 顶部 #X.Y.Z 段已写；i18n 新键已加到 en/zh_CN/zh_TW；新增 locale 已在 `i18n.svelte.ts` 的 `LOCALE_FILES` 注册。
- [ ] 若改 Rust：`src-tauri/Cargo.lock` 也更新（`cargo build` 后自动改）。
- [ ] 提交信息遵循第 4 节风格；`fix`/`feat`/`chore(release)` 三种最常用。
- [ ] 推 `pan` 远端（`origin` 指上游，通常不直接推）。
- [ ] 若是发版：版本号三处一致 + `com.pan.desktop.metainfo.xml` 加 release 条目 + tag 名 `VX.Y.Z` + 已用 `gh release view` 确认 8 个产物到位。

## 8. Windows 热键 / 焦点 / 输入排查手册（2026-08 实战沉淀）

本节是 pot→pan 改造期间一连串 Windows 独有问题的完整复盘。症状链：**热键注册成功但按下无反应 → 主线程阻塞 → 焦点抖动 / 窗口自关 / 输入法失效**。以下结论全部有源码级依据（本地 cargo registry 里的 tao / global-hotkey / tauri-plugin-\* 源码），排查同类问题时先来这里对照，再读源码验证。

### 8.1 症状 → 根因速查

| 症状                                                                         | 根因                                                                                                                                         | 修复位置                                                                                                      |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 热键注册成功（成功 toast / 日志 `Registered global shortcut`）但按下无反应   | 主线程被同步 Tauri command 阻塞：WM_HOTKEY 由主线程 WndProc（`global_hotkey_proc`）分发，handler 也在主线程同步执行；事件循环冻结 = 热键饿死 | 重负载命令全部 `#[tauri::command(async)]`；WinRT 移后台线程 + `CoInitializeEx(MTA)`（`system_ocr.rs` 有范本） |
| 翻译窗口焦点秒级抖动（`[native] translate window focused: true/false` 交替） | (a) 无限渲染循环（fresh-array effect deps，每圈 setState）；(b) 多余的 `setFocus` 调用                                                       | effect 依赖改内容键 + once-guard（`src/windows/translate/App.svelte` 顶部注释）；聚焦收敛为按需单次           |
| 打不了字（输入法组合被打断）                                                 | tao `force_window_active` 在 `SetForegroundWindow` 被拒时注入合成 ALT 按键                                                                   | 聚焦按需单次；移除创建时 `.focused(true)`                                                                     |
| 窗口在打字时自己消失                                                         | close-on-blur 定时器被 WebView2 假 blur 误触发                                                                                               | 聚焦 800ms 宽限（`src/windows/translate/focus.ts`）+ Confirm 前复查 `isFocused()`                             |
| 文字识别里"系统 OCR"显示破图                                                 | plugin-os v2 小写值未归一化（见第 5 节）                                                                                                     | `src/lib/utils/env.svelte.ts` 的 `normalizeOsType()`                                                          |
| `HotKey already registered`（部分热键）                                      | 新旧两个实例并存                                                                                                                             | 换构建前先托盘退出旧实例                                                                                      |
| `Command watch not found`                                                    | 插件命令被 cargo feature gate（fs 的 `watch`）                                                                                               | 启用对应 feature（见第 5 节）                                                                                 |
| `bun run tauri build` 在 CI "command not found"                              | 缺 devDependency `@tauri-apps/cli`（重写时遗漏）或 runner 无 Node（见第 5 节）                                                               | `bun add -d @tauri-apps/cli` + CI job 加 `actions/setup-node@v5`                                              |

### 8.2 双层日志定位法（先加日志再猜）

- **原生层**：`main.rs` 的 `.on_window_event` 对 translate 窗口记 `[native] translate window focused: <bool>`。tao 在 WM_NCACTIVATE / WM_SETFOCUS / WM_KILLFOCUS 上发 Focused 事件，所以这是 Win32 激活状态的直接记录。
- **webview 层**：`src/windows/translate/App.svelte` 记 `Focus` / `Blur` / `Blur ignored (grace)` / `Confirm Blur` / `Cancel Close`。
- **判读规则**：
    - native 抖而 webview 无事件 → Win32 层问题（查窗口样式 / skip-taskbar / 外部进程抢前台）；
    - 两层同步抖 → 事件真实，找激活的"对手窗口"；
    - `Blur ignored (grace)` 周期性出现 → `markProgrammaticFocus` 被反复调用 → **handleNewText 被反复执行 → 查 effect 依赖 churn**（本轮的真凶就是它）。
- 日志文件：Windows 在 `%LOCALAPPDATA%\com.pan.desktop\logs\pan.log`（**不是** %APPDATA%）；时间戳已切本地时区。

### 8.3 原生源码关键结论（`~/.cargo/registry/src/index.crates.io-*/` 下已核实）

- `tao-*/platform_impl/windows/window.rs`：`set_focus()` → `force_window_active()` → `SetForegroundWindow` 失败时 **`SendInput` 合成 ALT down/up** 再抢一次（注释自承认是 hack）；`set_skip_taskbar` 走 ITaskbarList 的 DeleteTab/AddTab。
- `tao-*/event_loop.rs`：Focused 事件由 **WM_NCACTIVATE 和 WM_SETFOCUS/WM_KILLFOCUS 共同驱动** → WebView2 子窗口的焦点迁移也会让顶层发 Focused(false)，"顶层失焦"不代表窗口真的不活跃。
- `global-hotkey-*/platform_impl/windows/mod.rs`：`WM_HOTKEY` → `GlobalHotKeyEvent::send` → 插件的 `set_event_handler` **在 WndProc 里同步执行业务 handler**；Released 靠独立线程每 50ms 轮询 `GetAsyncKeyState`。
- `tauri-plugin-global-shortcut-*/lib.rs`：注册/注销经 `run_main_thread!` 宏（`run_on_main_thread` + channel `recv()` 阻塞等待结果）；`on_shortcut` 返回 Ok = 系统级注册成功。
- `tauri-plugin-store-*/store.rs`：`StoreBuilder::build()` 会自动从磁盘 load；同路径返回同一实例 → Rust 与 JS 共享内存态，Rust `set()` 显式 `save()`。
- `tauri-plugin-fs-*/lib.rs`：watch 命令 `#[cfg(feature = "watch")]`，非默认。
- `windows-0.62.x`：`CoInitializeEx(Option<*const c_void>, COINIT)` 位于 `Win32::System::Com`（feature `Win32_System_Com`）；WinRT 异步对象在 MTA 线程上 `block_on` 安全，在 STA 主线程上会冻结事件循环。
- `@tauri-apps/plugin-os`：`type()` 返回小写 `'windows' | 'macos' | 'linux'`（v1 API 是 `Windows_NT`/`Darwin`/`Linux`）。

### 8.4 测试与验证纪律

- **mock 必须诚实**：mock 返回值与真实插件一致（plugin-os 返回 `'windows'` 而非 `'Windows_NT'`；`getName` 返回 `'pan'`），否则测试全绿但真机必挂——本轮 osType bug 被旧 mock 掩盖了整个 Tauri 2 迁移期。
- **"撤销修复 → 测试必须失败"**：修复落地后 `git stash push <fix-file>` 回退，确认回归网真的能抓（icon 修复验证过），再 pop 回来。
- **Windows-only 代码（`#[cfg(target_os = "windows")]`）在 Linux 上 clippy/cargo check 编译不到**：对照 `~/.cargo/registry/` 里 windows crate 源码核对 API 签名与 feature（如 `CoInitializeEx` 的参数与 `Win32_System_Com`），并盯 CI 的 build-for-windows job。`cargo check --target x86_64-pc-windows-msvc` 会被 `ring` 的构建脚本挡住，不要浪费时间尝试。
- **本机 Linux 跑 `cargo test`（链接 Tauri 二进制）需要系统库**：`sudo apt-get install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libxdo-dev patchelf pkg-config`（2026-08 已装）。缺失时报 `rust-lld: unable to find library -lxcb / -lgtk-3 / ...`，属环境问题——用 `git stash` 在未改动 HEAD 上复现同样错误来证明与改动无关。
- **Windows 安装包只能 CI 出**（tauri 无法从 Linux 交叉编译 MSVC 目标）：push main → 验证性构建 → `gh run download <run-id> --repo NIyueeE/pan-desktop --name windows_x86_64-pc-windows-msvc -D ./ci-artifacts`（注意是大写 `-D/--dir`）。**换构建前先托盘退出旧实例**（否则热键/单实例冲突，日志见 `HotKey already registered`）。
- **排查用户报障时先要日志再猜**：`%LOCALAPPDATA%\com.pan.desktop\logs\pan.log`；让用户复现一次后按行号区段截取。本轮两次"想当然"都被日志推翻，两次日志都直接改写了结论。
