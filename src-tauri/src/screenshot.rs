use log::{error, info};

#[tauri::command]
pub fn screenshot(x: i32, y: i32) {
    use crate::APP;
    use dirs::cache_dir;
    use screenshots::Screen;
    use std::fs;
    info!("Screenshot screen with position: x={x}, y={y}");
    let Ok(screens) = Screen::all() else {
        error!("Failed to list screens");
        return;
    };
    for screen in screens {
        let display_info = screen.display_info;
        info!("Screen: {display_info:?}");
        if display_info.x == x && display_info.y == y {
            let Some(handle) = APP.get() else {
                error!("App handle not initialized");
                return;
            };
            let mut app_cache_dir_path = cache_dir().unwrap_or_else(|| {
                error!("Get Cache Dir Failed");
                std::env::temp_dir()
            });
            app_cache_dir_path.push(&handle.config().identifier);
            if !app_cache_dir_path.exists()
                && let Err(e) = fs::create_dir_all(&app_cache_dir_path)
            {
                error!("Create Cache Dir Failed: {e}");
                return;
            }
            app_cache_dir_path.push("pan_screenshot.png");

            match screen.capture() {
                Ok(image) => {
                    let (width, height) = (image.width(), image.height());
                    let buffer = image.into_raw();
                    if let Err(e) = image::save_buffer(
                        &app_cache_dir_path,
                        &buffer,
                        width,
                        height,
                        image::ExtendedColorType::Rgba8,
                    ) {
                        error!("Save screenshot failed: {e}");
                    }
                }
                Err(e) => error!("Capture screen failed: {e}"),
            }
            break;
        }
    }
}
