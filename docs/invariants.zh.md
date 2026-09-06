# 平台不变量

> [English](invariants.md) | 简体中文

代码库的承重墙规则。每一条都对应真实发生过的事故(窗口自关、热键饿死、输入
法失效、`languages.undefined` 泄漏)。改动相关路径前先读;所有条目都适用
"修代码,永不修规则"。

## 前端

| #   | 不变量                                                                                                                                                                                  | 原因                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 1   | `setConfig()` 防抖、批量并广播 `<key>_changed`;`writeThrough()` 立即落盘并取消同 key 挂起写                                                                                             | 窗口可能中途消失(热键绑定、服务实例模态保存/删除)—— 用 `setConfig()` 存热键会在窗口关闭后才落 |
| 2   | `setConfigRaw` 拒绝 `undefined` / `null`;禁止 `store.set(key, undefined)`                                                                                                               | 被清掉的键会经 `t('prefix.${value}')` 把 `prefix.undefined` 泄漏进下拉框                      |
| 3   | 服务列表必须过 `sanitizeServiceInstanceList`;所有消费方对未知服务名优雅降级                                                                                                             | 恢复的备份可能含已移除服务的键。内置名:`openai`(翻译)、`paddle` / `system` / `openai`(识别)   |
| 4   | 上游 pot 备份必须永远可恢复:备份校验只看 `type: 'config-backup'`,永不加 `app` 字段                                                                                                      | 兼容性红线;回归用例在 `scripts/test-webdav.ts`("Legacy pot backups still restore")            |
| 5   | `$effect` 同步追踪 —— 一次性加载走 `untrack(...)` 或 once-guard;非响应式簿记加 `// eslint-disable-next-line svelte/prefer-svelte-reactivity`(`src/windows/translate/App.svelte` 是范本) | 在 effect 里读每次新建的数组/对象会每帧重跑(fresh-array-deps 陷阱 —— 曾引发焦点抖动 bug)      |
| 6   | 用闭包函数(`seededConfig()`)从 props 播种 `$state`                                                                                                                                      | 构造期裸读 props 会触发 svelte-check `--fail-on-warnings`                                     |
| 7   | 测试必须调用 `unmount()`                                                                                                                                                                | `$effect` 不会跨 vitest 用例清理;`render()` 返回的 `unmount()` 是监听器/DOM 清理的唯一入口    |
| 8   | 新 i18n 键至少落 `en_US.json` / `zh_CN.json` / `zh_TW.json`;新 locale 在 `LOCALE_FILES`(`i18n.svelte.ts`)注册;键放 `common.*` 或业务命名空间                                            | 其它 locale 经 `FALLBACK_CHAINS` 回退;i18next 对缺失键原样输出                                |
| 9   | OS 分支比较 v1 名(`Windows_NT` / `Darwin` / `Linux`),唯一归一化点 `normalizeOsType()`(`src/lib/utils/env.svelte.ts`)                                                                    | plugin-os v2 返回小写 `'windows' \| 'macos' \| 'linux'`;未归一化曾弄破系统 OCR 图标           |
| 10  | `@tauri-apps/cli` 留在 devDependencies;PATH 上需 Node.js >= 22                                                                                                                          | `bun run` 外调 node-shebang bin(vite、vitest、svelte-check、tauri CLI)—— Bun 不会替跑         |

## 后端

| #   | 不变量                                                                                                                                                                                                                            | 原因                                                                                             |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1   | 所有可能超过 ~10ms 的 Tauri command(全屏截图、PNG 编码、WinRT OCR `block_on`、文件 IO)必须 `#[tauri::command(async)]`;后台 WinRT 线程先 `CoInitializeEx(COINIT_MULTITHREADED)`(主线程是 tao 持有的 STA —— `system_ocr.rs` 是范本) | WM_HOTKEY 由主线程 WndProc 分发;事件循环被阻塞 = 全局热键饿死("注册成功但按下无反应")            |
| 2   | 热键 / 托盘 / 窗口路径禁止 `unwrap()` —— 用 `let _ = ...` + `log::warn!`                                                                                                                                                          | DPI 异常、显示器枚举失败、窗口属性设置失败在 Windows 上真实存在,会让进程无声消失                 |
| 3   | 翻译窗口聚焦按需单次:先查 `isVisible()` / `isFocused()`;禁止创建隐藏窗口时链 `.focused(true)`                                                                                                                                     | tao `set_focus()` 在 `SetForegroundWindow` 被拒时注入合成 ALT 按键 —— 打断输入法组合并反复抢前台 |
| 4   | 翻译窗口 close-on-blur 三层防护是承重结构:800ms 程序性聚焦宽限(`focus.ts`)、Confirm 前复查 `isFocused()`、拖动/聚焦取消                                                                                                           | WebView2 在透明无边框窗口上自发焦点振荡;裸定时器会在用户打字时关窗                               |
| 5   | `tauri.windows.conf.json` 的 `additionalBrowserArgs` 与 `BROWSER_ARGS`(`window.rs`)保持一致;永不给 daemon 窗口加 `--disable-web-security`                                                                                         | WebView2 多窗口共享进程;缺 `Origin` 头时 IPC 层拒绝全部 invoke(白屏 `missing Origin header`)     |
| 6   | 插件命令"不存在"排查顺序:① `generate_handler!` 注册,② cargo feature gate(`tauri-plugin-fs` 的 `watch` 在非默认 feature),③ capabilities 是否覆盖窗口 label                                                                         | 三层都可能藏住命令                                                                               |
| 7   | `tauri-plugin-log` 保持 `TimezoneStrategy::UseLocal`                                                                                                                                                                              | 否则用户看到的日志时间差一个时区                                                                 |

## 测试基建速查

- 播种走 `fakeConfigFile` → `await initConfigStore()` → `render(Component)`;禁止 `setConfig()` 播种(防抖写入会让断言竞态)。
- **UndefinedSweep**:`render()` 后立即与稳定后各扫一遍 DOM 抓 `undefined` 泄漏(`src/windows/config/ConfigWindow.test.ts` 是范本)。
- **mock 必须诚实**:mock 返回值与真实插件一致(plugin-os 给 `'windows'` 而非 `'Windows_NT'`),否则测试全绿真机必挂。
- **撤销修复,看测试变红**(`git stash push <file>` … pop)—— 永不失败的回归测试不是测试。
- bits-ui Dialog 的 scroll-lock 会跨用例把 `pointer-events: none` 泄到 `document.body`;测试 setup 会清理 —— 遇到"幽灵 pointer-events"先怀疑跨用例泄漏,不是组件。

参见:[检查](checks.zh.md) · [Windows 排查手册](windows-troubleshooting.zh.md) · [AGENTS.md](../AGENTS.md)
