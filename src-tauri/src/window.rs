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
use log::{info, warn};
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
#[cfg(target_os = "windows")]
pub const BROWSER_ARGS: &str =
    "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --disable-web-security";
#[cfg(not(target_os = "windows"))]
pub const BROWSER_ARGS: &str = "--disable-web-security";

// Get daemon window instance
fn get_daemon_window() -> WebviewWindow {
    let app_handle = APP.get().unwrap();
    app_handle.get_webview_window("daemon").unwrap_or_else(|| {
        warn!("Daemon window not found, create new daemon window!");
        WebviewWindowBuilder::new(app_handle, "daemon", WebviewUrl::App("daemon.html".into()))
            .title("Daemon")
            .additional_browser_args(BROWSER_ARGS)
            .visible(false)
            .build()
            .unwrap()
    })
}

// Get monitor where the mouse is currently located
fn get_current_monitor(x: i32, y: i32) -> Monitor {
    info!("Mouse position: {x}, {y}");
    let daemon_window = get_daemon_window();
    let monitors = daemon_window.available_monitors().unwrap();

    for m in monitors {
        let size = m.size();
        let position = m.position();

        if x >= position.x
            && x <= (position.x + size.width as i32)
            && y >= position.y
            && y <= (position.y + size.height as i32)
        {
            info!("Current Monitor: {m:?}");
            return m;
        }
    }
    warn!("Current Monitor not found, using primary monitor");
    daemon_window.primary_monitor().unwrap().unwrap()
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
            let mut builder =
                WebviewWindowBuilder::new(app_handle, label, WebviewUrl::App("index.html".into()))
                    .position(position.x.into(), position.y.into())
                    .additional_browser_args(BROWSER_ARGS)
                    .use_https_scheme(true)
                    .focused(true)
                    .title(title)
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
            let window = builder.build().unwrap();
            let _ = window.current_monitor();
            (window, false)
        },
        |v| {
            info!("Window existence: {label}");
            v.set_focus().unwrap();
            (v, true)
        },
    )
}

pub fn config_window() {
    let (window, _exists) = build_window("config", "Config");
    window
        .set_min_size(Some(tauri::LogicalSize::new(800, 400)))
        .unwrap();
    window.set_size(tauri::LogicalSize::new(800, 600)).unwrap();
    window.center().unwrap();
    // Show from the Rust side so the window appears even when the frontend
    // fails to boot (it also calls `show()` once React mounted).
    let _ = window.show();
    let _ = window.set_focus();
}

fn translate_window() -> WebviewWindow {
    use mouse_position::mouse_position::{Mouse, Position};
    // Mouse physical position
    let mut mouse_position = match Mouse::get_mouse_position() {
        Mouse::Position { x, y } => Position { x, y },
        Mouse::Error => {
            warn!("Mouse position not found, using (0, 0) as default");
            Position { x: 0, y: 0 }
        }
    };
    let (window, exists) = build_window("translate", "Translate");
    if exists {
        return window;
    }
    window.set_skip_taskbar(true).unwrap();
    // Get Translate Window Size
    let width = get("translate_window_width").map_or_else(
        || {
            set("translate_window_width", 350);
            350
        },
        |v| v.as_i64().unwrap(),
    );
    let height = get("translate_window_height").map_or_else(
        || {
            set("translate_window_height", 420);
            420
        },
        |v| v.as_i64().unwrap(),
    );

    let monitor = window.current_monitor().unwrap().unwrap();
    let dpi = monitor.scale_factor();

    window
        .set_size(tauri::PhysicalSize::new(
            (width as f64) * dpi,
            (height as f64) * dpi,
        ))
        .unwrap();

    let position_type = get("translate_window_position")
        .map_or_else(|| "mouse".to_string(), |v| v.as_str().unwrap().to_string());

    if position_type.as_str() == "mouse" {
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

        window
            .set_position(tauri::PhysicalPosition::new(
                mouse_position.x,
                mouse_position.y,
            ))
            .unwrap();
    } else {
        let position_x = get("translate_window_position_x").map_or(0, |v| v.as_i64().unwrap());
        let position_y = get("translate_window_position_y").map_or(0, |v| v.as_i64().unwrap());
        window
            .set_position(tauri::PhysicalPosition::new(
                (position_x as f64) * dpi,
                (position_y as f64) * dpi,
            ))
            .unwrap();
    }

    window
}

pub fn selection_translate() {
    use selection::get_text;
    // Get Selected Text
    let text = get_text();
    if !text.trim().is_empty() {
        let app_handle = APP.get().unwrap();
        // Write into State
        let state: tauri::State<StringWrapper> = app_handle.state();
        state.0.lock().unwrap().replace_range(.., &text);
    }

    let window = translate_window();
    window.emit("new_text", text).unwrap();
}

pub fn input_translate() {
    let app_handle = APP.get().unwrap();
    // Clear State
    let state: tauri::State<StringWrapper> = app_handle.state();
    state
        .0
        .lock()
        .unwrap()
        .replace_range(.., "[INPUT_TRANSLATE]");
    let window = translate_window();
    let position_type = get("translate_window_position")
        .map_or_else(|| "mouse".to_string(), |v| v.as_str().unwrap().to_string());
    if position_type == "mouse" {
        window.center().unwrap();
    }

    window.emit("new_text", "[INPUT_TRANSLATE]").unwrap();
}

pub fn image_translate() {
    let app_handle = APP.get().unwrap();
    let state: tauri::State<StringWrapper> = app_handle.state();
    state
        .0
        .lock()
        .unwrap()
        .replace_range(.., "[IMAGE_TRANSLATE]");
    let window = translate_window();
    window.emit("new_text", "[IMAGE_TRANSLATE]").unwrap();
}

#[cfg(not(target_os = "macos"))]
fn screenshot_window() -> WebviewWindow {
    let (window, _exists) = build_window("screenshot", "Screenshot");

    window.set_skip_taskbar(true).unwrap();
    #[cfg(not(target_os = "macos"))]
    window.set_fullscreen(true).unwrap();

    window.set_always_on_top(true).unwrap();
    window
}

pub fn ocr_translate() {
    #[cfg(target_os = "macos")]
    {
        let app_handle = APP.get().unwrap();
        let mut app_cache_dir_path = cache_dir().expect("Get Cache Dir Failed");
        app_cache_dir_path.push(&app_handle.config().identifier);
        if !app_cache_dir_path.exists() {
            // 创建目录
            fs::create_dir_all(&app_cache_dir_path).expect("Create Cache Dir Failed");
        }
        app_cache_dir_path.push("pot_screenshot_cut.png");

        let path = app_cache_dir_path.to_string_lossy().replace("\\\\?\\", "");
        println!("Screenshot path: {}", path);
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
}
