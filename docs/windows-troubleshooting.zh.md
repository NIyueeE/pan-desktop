# Windows 排查手册:热键、焦点、输入法

> [English](windows-troubleshooting.md) | 简体中文

重建期间一连串 Windows 独有问题的实战沉淀。症状链:**热键注册成功但按下无
反应 → 主线程被阻塞 → 焦点抖动 / 窗口自关 / 输入法失效**。以下结论全部对
照本地 cargo registry 里的 tao / global-hotkey / tauri-plugin 源码核实过。
排查同类问题时先来这里对照,再读源码验证。

## 1. 症状 → 根因速查

| 症状                                                                       | 根因                                                                                                               | 修复                                                                                                       |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| 热键注册成功(成功 toast / 日志 `Registered global shortcut`)但按下无反应   | 主线程被同步 tauri command 阻塞:WM_HOTKEY 由主线程 WndProc 分发,handler 也在主线程同步执行;事件循环冻结 = 热键饿死 | 重负载命令全部 `#[tauri::command(async)]`;WinRT 移后台线程 + `CoInitializeEx(MTA)`(`system_ocr.rs` 有范本) |
| 翻译窗口焦点秒级抖动(`[native] translate window focused: true/false` 交替) | (a) 无限渲染循环(fresh-array effect deps,每圈 setState);(b) 多余的 `setFocus` 调用                                 | effect 依赖改内容键 + once-guard;聚焦收敛为按需单次                                                        |
| 打不了字(输入法组合被打断)                                                 | tao `force_window_active` 在 `SetForegroundWindow` 被拒时注入合成 ALT 按键                                         | 聚焦按需单次;禁止创建隐藏窗口时 `.focused(true)`                                                           |
| 窗口在打字时自己消失                                                       | close-on-blur 定时器被 WebView2 假 blur 误触发                                                                     | 聚焦 800ms 宽限(`focus.ts`)+ Confirm 前复查 `isFocused()`                                                  |
| 文字识别里"系统 OCR"显示破图                                               | plugin-os v2 小写值未归一化                                                                                        | `src/lib/utils/env.svelte.ts` 的 `normalizeOsType()`                                                       |
| `HotKey already registered`(部分热键)                                      | 新旧两个实例并存                                                                                                   | 换构建前先托盘退出旧实例                                                                                   |
| `Command watch not found`                                                  | 插件命令被 cargo feature gate(fs 的 `watch`)                                                                       | 启用对应 feature(见 AGENTS.md §7 的排查顺序)                                                               |
| `bun run tauri build` 在 CI "command not found"                            | 缺 devDependency `@tauri-apps/cli`,或 runner 无 Node                                                               | 保住 devDependency;CI 装 Node 22                                                                           |

## 2. 双层日志定位法(先加日志再猜)

- **原生层**:`main.rs` 的 `on_window_event` 对翻译窗口记
  `[native] translate window focused: <bool>`。tao 在 WM_NCACTIVATE 与
  WM_SETFOCUS/WM_KILLFOCUS 上发 Focused 事件,所以这是 Win32 激活状态的直接
  记录。
- **webview 层**:翻译窗口应用记 `Focus` / `Blur` / `Blur ignored (grace)` /
  `Confirm Blur` / `Cancel Close`。
- **判读规则**:
    - native 抖而 webview 无事件 → Win32 层问题(窗口样式 / skip-taskbar /
      外部进程抢前台);
    - 两层同步抖 → 事件真实,找赢得激活的"对手窗口";
    - `Blur ignored (grace)` 周期性出现 → `markProgrammaticFocus` 被反复调用
      → `handleNewText` 被反复执行 → 查 effect 依赖 churn(真凶就是它)。
- 日志文件:`%LOCALAPPDATA%\com.pan.desktop\logs\pan.log`(**不是**
  %APPDATA%),本地时区(`TimezoneStrategy::UseLocal`)。

## 3. 原生源码关键结论(cargo registry,Windows target)

- `tao` 的 `set_focus()` → `force_window_active()` → `SetForegroundWindow`
  被拒时先 **`SendInput` 合成一对 ALT down/up** 再抢一次(它自己的注释承认
  这是 hack);`set_skip_taskbar` 走 ITaskbarList 的 DeleteTab/AddTab。
- `tao` 事件循环:Focused 事件由 **WM_NCACTIVATE 与
  WM_SETFOCUS/WM_KILLFOCUS 共同驱动** —— WebView2 子窗口的焦点迁移会让顶层
  报 Focused(false),而窗口实际仍活跃。
- `global-hotkey`(Windows):WM_HOTKEY → `GlobalHotKeyEvent::send` → 插件的
  handler **在 WndProc 里同步执行**;Released 靠独立线程每 50ms 轮询
  `GetAsyncKeyState`。
- `tauri-plugin-global-shortcut`:注册/注销经 `run_main_thread!` 宏(主线程 +
  channel `recv()`);`on_shortcut` 返回 Ok = 系统级注册成功。
- `tauri-plugin-store`:`StoreBuilder::build()` 自动从磁盘 load;同路径返回
  同一实例(Rust 与 JS 共享内存态);Rust 侧 `set()` 需显式 `save()`。
- `tauri-plugin-fs`:`watch` 命令是 `#[cfg(feature = "watch")]` —— 默认关闭。
- `windows` crate:`CoInitializeEx` 在 `Win32::System::Com`(feature
  `Win32_System_Com`);WinRT 异步对象在 MTA 线程上 block 安全,在 STA 主线程
  上会冻结事件循环。
- `@tauri-apps/plugin-os`:`type()` 返回小写 `'windows' | 'macos' |
'linux'`(v1 名是 `Windows_NT`/`Darwin`/`Linux`)。

## 4. 测试与验证纪律

- **mock 必须诚实**:mock 返回值与真实插件一致(plugin-os 给 `'windows'` 而
  非 `'Windows_NT'`),否则测试全绿但真机必挂 —— 一个 osType bug 曾被旧 mock
  掩盖了整个迁移期。
- **撤销修复,看测试变红**:stash 修复文件,确认新回归用例真的能抓到,再
  pop 回来。永远不会失败的回归测试不是测试。
- Windows-only 代码(`#[cfg(target_os = "windows")]`)在 Linux 上
  clippy/cargo check 编译不到:对照 `~/.cargo/registry/` 里的 crate 源码核对
  API 签名,并盯 CI 的 Windows job。不要在本地尝试
  `cargo check --target x86_64-pc-windows-msvc` —— `ring` 会挡住它。
- 本地 `cargo test` 需要 tauri 系统库(`libwebkit2gtk-4.1-dev libgtk-3-dev
libayatana-appindicator3-dev librsvg2-dev libxdo-dev patchelf pkg-config`);
  缺库报链接错误 —— 用干净 stash 复现同样错误,证明与改动无关。
- Windows 安装包只能 CI 出(无法从 Linux 交叉编译 MSVC):推 main 后
  `gh run download <run-id> --repo NIyueeE/pan-desktop --name
windows_x86_64-pc-windows-msvc -D ./ci-artifacts`。
- 排查用户报障:**先要日志再猜**。
