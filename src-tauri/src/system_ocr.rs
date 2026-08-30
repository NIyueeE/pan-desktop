use dirs::cache_dir;
#[cfg(target_os = "macos")]
use tauri::Manager;

// MUST stay async: sync commands run on the main thread, and a WinRT
// `block_on` there freezes the whole event loop for the whole OCR duration
// (focus/activation goes stale, tray & global-shortcut events starve —
// WM_HOTKEY is dispatched by the main loop). The macOS/Linux variants are
// already `async`; Windows now matches and additionally moves the work onto a
// background thread with its own COM apartment (WinRT activation requires one,
// and freshly spawned threads start with none).
#[tauri::command(async)]
#[cfg(target_os = "windows")]
pub fn system_ocr(app_handle: tauri::AppHandle, lang: &str) -> Result<String, String> {
    let lang = lang.to_string();
    let worker = std::thread::spawn(move || {
        // SAFETY: CoInitializeEx on a thread that has no apartment yet. A
        // previous RPC_E_CHANGED_MODE would mean MTA is already active, which
        // is equally fine for the WinRT calls below.
        unsafe {
            let _ = windows::Win32::System::Com::CoInitializeEx(
                None,
                windows::Win32::System::Com::COINIT_MULTITHREADED,
            );
        }
        system_ocr_windows(&app_handle, &lang)
    });
    worker
        .join()
        .map_err(|_| "system_ocr worker panicked".to_string())?
}

#[cfg(target_os = "windows")]
fn system_ocr_windows(app_handle: &tauri::AppHandle, lang: &str) -> Result<String, String> {
    use windows::Globalization::Language;
    use windows::Graphics::Imaging::BitmapDecoder;
    use windows::Media::Ocr::OcrEngine;
    use windows::Storage::{FileAccessMode, StorageFile};
    use windows::core::HSTRING;

    let mut app_cache_dir_path = cache_dir().expect("Get Cache Dir Failed");
    app_cache_dir_path.push(&app_handle.config().identifier);
    app_cache_dir_path.push("pan_screenshot_cut.png");

    let path = app_cache_dir_path.to_string_lossy().replace("\\\\?\\", "");

    let (_file, bitmap) = tauri::async_runtime::block_on(async {
        let file = StorageFile::GetFileFromPathAsync(&HSTRING::from(path))
            .unwrap()
            .await
            .unwrap();

        let decoder = BitmapDecoder::CreateWithIdAsync(
            BitmapDecoder::PngDecoderId().unwrap(),
            &file.OpenAsync(FileAccessMode::Read).unwrap().await.unwrap(),
        )
        .unwrap()
        .await
        .unwrap();

        let bitmap = decoder.GetSoftwareBitmapAsync().unwrap().await.unwrap();
        (file, bitmap)
    });

    let engine = match lang {
        "auto" => OcrEngine::TryCreateFromUserProfileLanguages(),
        _ => {
            if let Ok(language) = Language::CreateLanguage(&HSTRING::from(lang)) {
                OcrEngine::TryCreateFromLanguage(&language)
            } else {
                return Err("Language Error".to_string());
            }
        }
    };

    match engine {
        Ok(v) => Ok(tauri::async_runtime::block_on(async {
            v.RecognizeAsync(&bitmap).unwrap().await.unwrap()
        })
        .Text()
        .unwrap()
        .to_string_lossy()),
        Err(e) => {
            if e.to_string().contains("0x00000000") {
                Err("Language package not installed!\n\nSee: https://learn.microsoft.com/zh-cn/windows/powertoys/text-extractor#supported-languages".to_string())
            } else {
                Err(e.to_string())
            }
        }
    }
}

#[tauri::command(async)]
#[cfg(target_os = "macos")]
pub fn system_ocr(app_handle: tauri::AppHandle, lang: &str) -> Result<String, String> {
    let mut app_cache_dir_path = cache_dir().expect("Get Cache Dir Failed");
    app_cache_dir_path.push(&app_handle.config().identifier);
    app_cache_dir_path.push("pan_screenshot_cut.png");

    let arch = std::env::consts::ARCH;
    let bin_path = match app_handle.path().resolve(
        format!("resources/ocr-{arch}-apple-darwin"),
        tauri::path::BaseDirectory::Resource,
    ) {
        Ok(v) => v,
        Err(_) => return Err("Failed to resolve ocr binary".to_string()),
    };

    match std::process::Command::new("chmod")
        .arg("+x")
        .arg(bin_path.to_str().unwrap())
        .output()
    {
        Ok(_) => {}
        Err(e) => return Err(e.to_string()),
    }

    let output = match std::process::Command::new(bin_path)
        .arg(app_cache_dir_path.to_str().unwrap())
        .arg(lang)
        .output()
    {
        Ok(v) => v,
        Err(e) => return Err(e.to_string()),
    };

    if output.status.success() {
        let content = String::from_utf8(output.stdout).unwrap_or_default();
        Ok(content)
    } else {
        let content = String::from_utf8(output.stderr).unwrap_or_default();
        Err(content)
    }
}

#[tauri::command(async)]
#[cfg(target_os = "linux")]
pub fn system_ocr(app_handle: tauri::AppHandle, lang: &str) -> Result<String, String> {
    let mut app_cache_dir_path = cache_dir().expect("Get Cache Dir Failed");
    app_cache_dir_path.push(&app_handle.config().identifier);
    app_cache_dir_path.push("pan_screenshot_cut.png");
    let args = if lang == "auto" {
        ["", ""]
    } else {
        ["-l", lang]
    };

    let output = match std::process::Command::new("tesseract")
        .arg(app_cache_dir_path.to_str().unwrap())
        .arg("stdout")
        .args(args)
        .output()
    {
        Ok(v) => v,
        Err(e) => {
            if e.to_string().contains("os error 2") {
                return Err("Tesseract not installed!".to_string());
            }
            return Err(e.to_string());
        }
    };
    if output.status.success() {
        let content = String::from_utf8(output.stdout).unwrap_or_default();
        Ok(content)
    } else {
        let content = String::from_utf8(output.stderr).unwrap_or_default();

        if content.contains("data") {
            if lang == "auto" {
                return Err(
                    "Language data not installed!\nPlease try install tesseract-ocr-eng"
                        .to_string(),
                );
            }
            return Err(format!(
                "Language data not installed!\nPlease try install tesseract-ocr-{lang}"
            ));
        }
        Err(content)
    }
}
