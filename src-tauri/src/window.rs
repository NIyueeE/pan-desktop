#![allow(
    clippy::cast_possible_truncation,
    clippy::cast_possible_wrap,
    clippy::cast_precision_loss,
    clippy::cast_sign_loss
)]

#[cfg(target_os = "macos")]
use std::fs;

use crate::APP;
use crate::StringWrapper;
use crate::config::get;
use crate::config::set;
#[cfg(target_os = "macos")]
use dirs::cache_dir;
use log::{error, info, warn};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::Emitter;
#[cfg(not(target_os = "macos"))]
use tauri::Listener;
use tauri::Manager;
use tauri::Monitor;
use tauri::WebviewUrl;
use tauri::WebviewWindow;
use tauri::WebviewWindowBuilder;

// Must stay identical to the `additionalBrowserArgs` of every window declared in
// tauri.conf.json / tauri.windows.conf.json. On Windows all webviews share one
// WebView2 environment only while these arguments match, otherwise windows break.
//
// The `--disable-features` part restores the WebView2 defaults that wry applies
// when no custom args are set (see tauri-apps/tauri#13092); overriding
// `additional_browser_args` replaces those defaults entirely.
//
// Intentionally NOT including `--disable-web-security`: with that flag,
// WebView2 omits the `Origin` header on the IPC `fetch`, and tauri's IPC
// handler rejects the request with "missing Origin header" — which prevents
// the frontend from booting on Windows (see tauri-apps/tauri#9454).
// Cross-origin HTTP calls (e.g. Ollama streaming) must go through the
// `tauri-plugin-http` `fetch`, which runs on the Rust side and is unaffected
// by webview CORS.
#[cfg(target_os = "windows")]
pub const BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection";
#[cfg(not(target_os = "windows"))]
pub const BROWSER_ARGS: &str = "";

// Get daemon window instance
fn get_daemon_window() -> Option<WebviewWindow> {
    let app_handle = APP.get().unwrap();
    app_handle.get_webview_window("daemon").or_else(|| {
        warn!("Daemon window not found, create new daemon window!");
        WebviewWindowBuilder::new(app_handle, "daemon", WebviewUrl::App("daemon.html".into()))
            .title("Daemon")
            .additional_browser_args(BROWSER_ARGS)
            .visible(false)
            .build()
            .map_err(|e| warn!("Failed to create daemon window: {e:?}"))
            .ok()
    })
}

// Get monitor where the mouse is currently located
fn get_current_monitor(x: i32, y: i32) -> Monitor {
    info!("Mouse position: {x}, {y}");
    monitor_at_point(x, y).unwrap_or_else(|| {
        warn!("Current Monitor not found, using primary monitor");
        let daemon_window = get_daemon_window();
        // Unreachable in practice: a headless setup cannot open windows anyway.
        daemon_window
            .and_then(|daemon_window| daemon_window.primary_monitor().ok().flatten())
            .unwrap_or_else(|| panic!("No monitor available"))
    })
}

/// The monitor whose bounds contain the given physical point, if any.
fn monitor_at_point(x: i32, y: i32) -> Option<Monitor> {
    let daemon_window = get_daemon_window()?;
    let monitors = daemon_window.available_monitors().ok()?;
    monitors.into_iter().find(|m| {
        let size = m.size();
        let position = m.position();

        x >= position.x
            && x <= (position.x + size.width as i32)
            && y >= position.y
            && y <= (position.y + size.height as i32)
    })
}

// Creating a window on the mouse monitor
fn build_window(label: &str, title: &str) -> (WebviewWindow, bool) {
    use mouse_position::mouse_position::{Mouse, Position};

    let mouse_position = match Mouse::get_mouse_position() {
        Mouse::Position { x, y } => Position { x, y },
        Mouse::Error => {
            warn!("Mouse position not found, using (0, 0) as default");
            Position { x: 0, y: 0 }
        }
    };
    let current_monitor = get_current_monitor(mouse_position.x, mouse_position.y);
    let position = current_monitor.position();

    let app_handle = APP.get().unwrap();
    app_handle.get_webview_window(label).map_or_else(
        || {
            info!("Window not existence, Creating new window: {label}");
            // One HTML entry per window: every webview only parses and
            // executes the bundle it actually needs (translate/config/
            // screenshot are separate Vite inputs).
            let mut builder = WebviewWindowBuilder::new(
                app_handle,
                label,
                WebviewUrl::App(format!("{label}.html").into()),
            )
            .position(position.x.into(), position.y.into())
            .additional_browser_args(BROWSER_ARGS)
            .use_https_scheme(true)
            .title(title)
            // NO `.focused(true)`: the window is created hidden and the
            // frontend focuses it exactly once after showing it. tao's
            // set_focus injects a synthetic ALT keypress whenever
            // SetForegroundWindow is denied, so every extra focus call
            // risks breaking the IME and fighting for the foreground.
            .visible(false);

            #[cfg(target_os = "macos")]
            {
                builder = builder
                    .title_bar_style(tauri::TitleBarStyle::Overlay)
                    .hidden_title(true);
            }
            #[cfg(not(target_os = "macos"))]
            {
                builder = builder.transparent(true).decorations(false);
            }
            #[cfg(target_os = "windows")]
            {
                // Plain http scheme avoids WebView2 quirks with the custom
                // https://tauri.localhost protocol; it is still a trustworthy origin.
                builder = builder.use_https_scheme(false);
            }
            match builder.build() {
                Ok(window) => {
                    let _ = window.current_monitor();
                    (window, false)
                }
                Err(e) => {
                    // Hotkey flows run this on a background thread, where a
                    // panic only kills that task; the config/tray path still
                    // runs on the main thread, where it would take the app
                    // down.
                    error!("Failed to create window {label}: {e:?}");
                    panic!("Window build failed: {label}")
                }
            }
        },
        |v| {
            info!("Window existence: {label}");
            // No set_focus here: a hidden resident window must not be poked
            // (tao injects a synthetic ALT press when SetForegroundWindow is
            // denied), and every caller either shows first or has the
            // frontend spend its single programmatic focus.
            (v, true)
        },
    )
}

pub fn config_window() {
    let (window, _exists) = build_window("config", "Config");
    let _ = window.set_min_size(Some(tauri::LogicalSize::new(800, 400)));
    let _ = window.set_size(tauri::LogicalSize::new(800, 600));
    let _ = window.center();
    // Show from the Rust side so the window appears even when the frontend
    // fails to boot (it also calls `show()` once its mount completed).
    let _ = window.show();
    let _ = window.set_focus();
}

fn translate_window() -> WebviewWindow {
    let app_handle = APP.get().unwrap();
    if let Some(window) = app_handle.get_webview_window("translate") {
        // Resident window (`translate_keep_alive`): re-apply the geometry on
        // EVERY invocation and show it here, so the frontend's handleNewText
        // finds it visible and spends its single programmatic focus on
        // focusing. Skipping the geometry while the window is visible made
        // the position rule ("follow mouse" / remembered position) hold only
        // for the first invocation; the frontend persists user moves/resize
        // debounced, so re-applying is idempotent and never fights a drag.
        apply_translate_window_geometry(&window);
        if !window.is_visible().is_ok_and(|v| v) {
            let _ = window.show();
        }
        return window;
    }
    let window = build_translate_window();
    let _ = window.set_skip_taskbar(true);
    apply_translate_window_geometry(&window);
    window
}

fn build_translate_window() -> WebviewWindow {
    let (window, _exists) = build_window("translate", "Translate");
    window
}

/// Size + position of the translate window (persisted size, mouse-centered
/// or remembered position, clamped against the monitor the rule anchors to).
fn apply_translate_window_geometry(window: &WebviewWindow) {
    use mouse_position::mouse_position::{Mouse, Position};
    // Mouse physical position
    let mut mouse_position = match Mouse::get_mouse_position() {
        Mouse::Position { x, y } => Position { x, y },
        Mouse::Error => {
            warn!("Mouse position not found, using (0, 0) as default");
            Position { x: 0, y: 0 }
        }
    };

    // Get Translate Window Size
    let width = get("translate_window_width").map_or_else(
        || {
            set("translate_window_width", 350);
            350
        },
        |v| v.as_i64().unwrap_or(350),
    );
    let height = get("translate_window_height").map_or_else(
        || {
            set("translate_window_height", 420);
            420
        },
        |v| v.as_i64().unwrap_or(420),
    );

    let position_type = get("translate_window_position").map_or_else(
        || "mouse".to_string(),
        |v| v.as_str().unwrap_or("mouse").to_string(),
    );

    // "Follow mouse" must clamp against the monitor the mouse is on — not
    // the monitor the window currently sits on; on multi-monitor setups they
    // differ and the edge-flip would compute against the wrong screen.
    let monitor = if position_type == "mouse" {
        monitor_at_point(mouse_position.x, mouse_position.y)
            .or_else(|| window.current_monitor().ok().flatten())
    } else {
        window.current_monitor().ok().flatten()
    }
    .or_else(|| window.primary_monitor().ok().flatten());
    let Some(monitor) = monitor else {
        error!("No monitor found for translate window; using defaults");
        return;
    };
    let dpi = monitor.scale_factor();

    let _ = window.set_size(tauri::PhysicalSize::new(
        (width as f64) * dpi,
        (height as f64) * dpi,
    ));

    if position_type == "mouse" {
        // Adjust window position
        let monitor_size = monitor.size();
        let monitor_size_width = f64::from(monitor_size.width);
        let monitor_size_height = f64::from(monitor_size.height);
        let monitor_position = monitor.position();
        let monitor_position_x = f64::from(monitor_position.x);
        let monitor_position_y = f64::from(monitor_position.y);

        if (width as f64).mul_add(dpi, f64::from(mouse_position.x))
            > monitor_position_x + monitor_size_width
        {
            mouse_position.x -= (width as f64 * dpi) as i32;
            if f64::from(mouse_position.x) < monitor_position_x {
                mouse_position.x = monitor_position_x as i32;
            }
        }
        if (height as f64).mul_add(dpi, f64::from(mouse_position.y))
            > monitor_position_y + monitor_size_height
        {
            mouse_position.y -= (height as f64 * dpi) as i32;
            if f64::from(mouse_position.y) < monitor_position_y {
                mouse_position.y = monitor_position_y as i32;
            }
        }

        let _ = window.set_position(tauri::PhysicalPosition::new(
            mouse_position.x,
            mouse_position.y,
        ));
    } else {
        let position_x = get("translate_window_position_x").map_or(0, |v| v.as_i64().unwrap_or(0));
        let position_y = get("translate_window_position_y").map_or(0, |v| v.as_i64().unwrap_or(0));
        let _ = window.set_position(tauri::PhysicalPosition::new(
            (position_x as f64) * dpi,
            (position_y as f64) * dpi,
        ));
    }
}

pub fn translate_keep_alive_enabled() -> bool {
    get("translate_keep_alive")
        .and_then(|v| v.as_bool())
        .unwrap_or(true)
}

/// Create the resident translate window hidden at startup (opt-out via
/// `translate_keep_alive`). The webview boots without showing itself — the
/// frontend skips its mount-time show while the pending text is empty — so
/// the window stays invisible until the first hotkey press delivers text and
/// `translate_window` shows it. Pre-building removes the `WebView2` spawn cost
/// (~1s cold) from every hotkey invocation.
pub fn spawn_precreate_translate_window() {
    std::thread::spawn(|| {
        // Let setup (tray, shortcuts) finish first; window building itself
        // must run on the main thread.
        std::thread::sleep(std::time::Duration::from_millis(300));
        let Some(app_handle) = APP.get() else {
            return;
        };
        if let Err(e) = app_handle.run_on_main_thread(|| {
            if !translate_keep_alive_enabled()
                || APP.get().unwrap().get_webview_window("translate").is_some()
            {
                return;
            }
            info!("Pre-creating resident translate window");
            let window = build_translate_window();
            let _ = window.set_skip_taskbar(true);
            apply_translate_window_geometry(&window);
            // Deliberately no show(): it stays hidden until first use.
        }) {
            warn!("Failed to pre-create translate window: {e:?}");
        }
    });
}

/// One selection capture at a time: two concurrent invocations would race
/// their simulated Ctrl+C and clipboard reads against each other, so while a
/// capture is in flight further presses are ignored.
static SELECTION_IN_FLIGHT: AtomicBool = AtomicBool::new(false);

pub fn selection_translate() {
    // WM_HOTKEY dispatches this handler synchronously inside the main
    // thread's WndProc (AGENTS.md §8): everything blocking here — the
    // simulated Ctrl+C, the clipboard polling, and the webview spawn of a
    // cold translate window — would starve the event loop and with it every
    // other hotkey. Capture on a background thread instead; the window
    // calls below dispatch to the main thread internally.
    if SELECTION_IN_FLIGHT.swap(true, Ordering::SeqCst) {
        return;
    }
    std::thread::spawn(|| {
        // The monitor-lookup paths in `build_window` panic on exotic
        // failures; catch that so the in-flight flag can never wedge shut.
        let capture =
            std::panic::catch_unwind(std::panic::AssertUnwindSafe(capture_selection_text));
        SELECTION_IN_FLIGHT.store(false, Ordering::Release);
        if let Err(panic) = capture {
            let message = panic
                .downcast_ref::<&str>()
                .copied()
                .or_else(|| panic.downcast_ref::<String>().map(String::as_str))
                .unwrap_or("non-string panic payload");
            warn!("selection_translate background task panicked: {message}");
        }
    });
}

/// Capture the current selection and present it in the translate window.
///
/// Never opens the window on an empty or not-actually-copied selection: a
/// hotkey press with nothing selected must stay invisible, not resurface
/// whatever stale content already sits on the clipboard.
fn capture_selection_text() {
    #[cfg(target_os = "windows")]
    let clipboard_before = windows_clipboard_sequence();

    // Get Selected Text
    let text = selection::get_text();

    // Windows: the simulated Ctrl+C only produces a clipboard update when
    // something was actually copied. If the sequence number did not move,
    // the text above is stale clipboard content, not a selection.
    #[cfg(target_os = "windows")]
    if windows_clipboard_sequence() == clipboard_before {
        info!("Selection translate: no new clipboard content, skipping");
        return;
    }
    if text.trim().is_empty() {
        info!("Selection translate: empty selection, skipping");
        return;
    }

    let app_handle = APP.get().unwrap();
    // Write into State
    let state: tauri::State<StringWrapper> = app_handle.state();
    state.0.lock().unwrap().replace_range(.., &text);

    let window = translate_window();
    if let Err(e) = window.emit("new_text", text) {
        warn!("Failed to emit new_text: {e:?}");
    }
}

/// Monotonic counter bumped by every successful clipboard update; the way to
/// tell "the simulated Ctrl+C copied something" from "nothing happened".
#[cfg(target_os = "windows")]
fn windows_clipboard_sequence() -> u32 {
    use windows::Win32::System::DataExchange::GetClipboardSequenceNumber;
    // SAFETY: `GetClipboardSequenceNumber` has no preconditions and never
    // touches user-supplied memory.
    unsafe { GetClipboardSequenceNumber() }
}

pub fn input_translate() {
    // Same WndProc rationale as `selection_translate`: never block hotkey
    // dispatch on webview creation or window geometry.
    std::thread::spawn(|| {
        let app_handle = APP.get().unwrap();
        // Clear State
        let state: tauri::State<StringWrapper> = app_handle.state();
        state
            .0
            .lock()
            .unwrap()
            .replace_range(.., "[INPUT_TRANSLATE]");
        // `translate_window()` already applies the position rule ("follow
        // mouse" / remembered position) on every invocation; centering here
        // used to override it, making the window flash at the cursor and
        // then jump to the screen center.
        let window = translate_window();

        if let Err(e) = window.emit("new_text", "[INPUT_TRANSLATE]") {
            warn!("Failed to emit new_text: {e:?}");
        }
    });
}

pub fn image_translate() {
    // Reached from the screenshot flow and OCR completion (often while a
    // main-thread event handler is dispatching): keep the webview spawn off
    // the calling thread.
    std::thread::spawn(|| {
        let app_handle = APP.get().unwrap();
        let state: tauri::State<StringWrapper> = app_handle.state();
        state
            .0
            .lock()
            .unwrap()
            .replace_range(.., "[IMAGE_TRANSLATE]");
        let window = translate_window();
        if let Err(e) = window.emit("new_text", "[IMAGE_TRANSLATE]") {
            warn!("Failed to emit new_text: {e:?}");
        }
    });
}

#[cfg(not(target_os = "macos"))]
fn screenshot_window() -> WebviewWindow {
    let (window, _exists) = build_window("screenshot", "Screenshot");

    let _ = window.set_skip_taskbar(true);
    #[cfg(not(target_os = "macos"))]
    let _ = window.set_fullscreen(true);

    let _ = window.set_always_on_top(true);
    window
}

pub fn ocr_translate() {
    // The macOS path blocks on the interactive `screencapture` subprocess
    // and the rest creates windows: keep it all off the WndProc.
    std::thread::spawn(|| {
        #[cfg(target_os = "macos")]
        {
            let app_handle = APP.get().unwrap();
            let mut app_cache_dir_path = cache_dir().expect("Get Cache Dir Failed");
            app_cache_dir_path.push(&app_handle.config().identifier);
            if !app_cache_dir_path.exists() {
                // 创建目录
                fs::create_dir_all(&app_cache_dir_path).expect("Create Cache Dir Failed");
            }
            app_cache_dir_path.push("pan_screenshot_cut.png");

            let path = app_cache_dir_path.to_string_lossy().replace("\\\\?\\", "");
            info!("Screenshot path: {path}");
            if let Ok(_output) = std::process::Command::new("/usr/sbin/screencapture")
                .arg("-i")
                .arg("-r")
                .arg(path)
                .output()
            {
                image_translate();
            }
        }
        #[cfg(not(target_os = "macos"))]
        {
            let window = screenshot_window();
            let window_ = window.clone();
            window.listen("success", move |event| {
                image_translate();
                window_.unlisten(event.id());
            });
        }
    });
}
