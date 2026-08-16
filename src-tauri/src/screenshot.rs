use log::info;

#[tauri::command]
pub fn screenshot(x: i32, y: i32) {
    use crate::APP;
    use dirs::cache_dir;
    use screenshots::Screen;
    use std::fs;
    info!("Screenshot screen with position: x={x}, y={y}");
    let screens = Screen::all().unwrap();
    for screen in screens {
        let info = screen.display_info;
        info!("Screen: {info:?}");
        if info.x == x && info.y == y {
            let handle = APP.get().unwrap();
            let mut app_cache_dir_path = cache_dir().expect("Get Cache Dir Failed");
            app_cache_dir_path.push(&handle.config().identifier);
            if !app_cache_dir_path.exists() {
                // 创建目录
                fs::create_dir_all(&app_cache_dir_path).expect("Create Cache Dir Failed");
            }
            app_cache_dir_path.push("pot_screenshot.png");

            let image = screen.capture().unwrap();
            let (width, height) = (image.width(), image.height());
            let buffer = image.into_raw();
            image::save_buffer(
                &app_cache_dir_path,
                &buffer,
                width,
                height,
                image::ExtendedColorType::Rgba8,
            )
            .unwrap();
            break;
        }
    }
}
