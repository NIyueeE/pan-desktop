# Windows troubleshooting: hotkeys, focus, IME

> English | [简体中文](windows-troubleshooting.zh.md)

Field notes from debugging a chain of Windows-only failures during the
rebuild: **hotkey registered but never fires → main thread blocked → focus
oscillation / self-closing window / IME breakage**. Every conclusion below
was verified against the tao / global-hotkey / tauri-plugin sources in the
local cargo registry. Check here first, then read the sources again.

## 1. Symptom → root cause map

| Symptom                                                                                                     | Root cause                                                                                                                                                                | Fix                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Hotkey registers fine (success toast, `Registered global shortcut` in the log) but pressing it does nothing | main thread blocked by a synchronous tauri command: WM_HOTKEY is dispatched by the main WndProc and the handler also runs there; a frozen event loop starves every hotkey | heavy commands must be `#[tauri::command(async)]`; WinRT work moves to background threads with `CoInitializeEx(MTA)` (`system_ocr.rs`) |
| Translate window focus flickers every second (`[native] translate window focused: true/false` alternating)  | (a) infinite render loop (fresh-array effect deps re-running setState), (b) redundant `setFocus` calls                                                                    | content-key effect deps + once-guard; focus collapses to a single on-demand call                                                       |
| Cannot type (IME composition breaks mid-word)                                                               | tao `force_window_active` injects synthetic ALT keystrokes when `SetForegroundWindow` is refused                                                                          | focus on demand, once; never `.focused(true)` on hidden window creation                                                                |
| Window disappears while typing                                                                              | close-on-blur timer fired on a WebView2 phantom blur                                                                                                                      | 800 ms programmatic-focus grace (`focus.ts`) + `isFocused()` recheck before confirming                                                 |
| "System OCR" shows a broken image                                                                           | plugin-os v2 returns lowercase os types, unnormalized                                                                                                                     | `normalizeOsType()` in `src/lib/utils/env.svelte.ts`                                                                                   |
| `HotKey already registered` (some hotkeys)                                                                  | two app instances coexist                                                                                                                                                 | exit the old instance from the tray before testing a new build                                                                         |
| `Command watch not found`                                                                                   | plugin command gated behind a cargo feature (`tauri-plugin-fs` `watch`)                                                                                                   | enable the feature (see triage order, AGENTS.md §7)                                                                                    |
| `bun run tauri build` says "command not found" on CI                                                        | missing `@tauri-apps/cli` devDependency, or runner without Node                                                                                                           | keep the devDependency; CI sets up Node 22                                                                                             |

## 2. Dual-layer logging method (add logs before guessing)

- **Native layer**: `main.rs` `on_window_event` logs
  `[native] translate window focused: <bool>` for the translate window. tao
  emits Focused on WM_NCACTIVATE and WM_SETFOCUS/WM_KILLFOCUS, so this is the
  direct record of Win32 activation state.
- **Webview layer**: the translate app logs `Focus` / `Blur` /
  `Blur ignored (grace)` / `Confirm Blur` / `Cancel Close`.
- **Interpretation rules**:
    - native flickers, webview silent → Win32-layer problem (window styles,
      skip-taskbar, another process stealing the foreground);
    - both layers flicker in sync → the event is real; find the "opponent"
      window that wins activation;
    - `Blur ignored (grace)` repeating periodically → `markProgrammaticFocus`
      is being called repeatedly → `handleNewText` runs repeatedly → hunt the
      churning effect dependency (this was the actual culprit once).
- Log file: `%LOCALAPPDATA%\com.pan.desktop\logs\pan.log` (**not**
  %APPDATA%), local timestamps (`TimezoneStrategy::UseLocal`).

## 3. Source-verified conclusions (cargo registry, Windows targets)

- `tao` `set_focus()` → `force_window_active()` → on `SetForegroundWindow`
  refusal it **`SendInput`s a synthetic ALT down/up** before retrying (its own
  comment calls it a hack); `set_skip_taskbar` uses ITaskbarList
  DeleteTab/AddTab.
- `tao` event loop: Focused is driven by **WM_NCACTIVATE together with
  WM_SETFOCUS/WM_KILLFOCUS** — a WebView2 child focus change can make the
  top level report Focused(false) while the window is still active.
- `global-hotkey` (Windows): WM_HOTKEY → `GlobalHotKeyEvent::send` → the
  plugin's handler runs **synchronously inside the WndProc**; Released is
  detected by a dedicated thread polling `GetAsyncKeyState` every 50 ms.
- `tauri-plugin-global-shortcut`: register/unregister go through
  `run_main_thread!` (main-thread + channel `recv()`); `on_shortcut` returning
  Ok means the OS-level registration succeeded.
- `tauri-plugin-store`: `StoreBuilder::build()` auto-loads from disk; the same
  path returns the same instance (Rust and JS share the in-memory state);
  Rust-side `set()` needs an explicit `save()`.
- `tauri-plugin-fs`: the `watch` command is `#[cfg(feature = "watch")]` —
  off by default.
- `windows` crate: `CoInitializeEx` lives in `Win32::System::Com` (feature
  `Win32_System_Com`); WinRT async objects block safely on MTA threads, freeze
  the loop on the STA main thread.
- `@tauri-apps/plugin-os`: `type()` returns lowercase `'windows' | 'macos' |
'linux'` (v1 names are `Windows_NT`/`Darwin`/`Linux`).

## 4. Test and verification discipline

- **Mocks must be honest**: a mock returns what the real plugin returns
  (plugin-os gives `'windows'`, not `'Windows_NT'`), or tests stay green while
  the real machine fails — an osType bug once hid behind an old mock for an
  entire migration.
- **Revert the fix, watch the test fail**: stash the fix and confirm the new
  regression case actually catches it, then pop the stash back.
- Windows-only code (`#[cfg(target_os = "windows")]`) never compiles under
  Linux clippy/cargo check: verify API signatures against the crate sources
  in `~/.cargo/registry/` and watch the CI Windows jobs. Don't attempt
  `cargo check --target x86_64-pc-windows-msvc` locally — `ring` blocks it.
- Local `cargo test` needs the tauri system libraries
  (`libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev
librsvg2-dev libxdo-dev patchelf pkg-config`); missing libraries fail with
  linker errors — prove it is environment-only by reproducing on a clean
  stash.
- Windows installers can only be produced by CI (no MSVC cross-build from
  Linux): push main, then `gh run download <run-id> --repo NIyueeE/pan-desktop
--name windows_x86_64-pc-windows-msvc -D ./ci-artifacts`.
- Debugging a user report: **ask for the log first**, then guess.
