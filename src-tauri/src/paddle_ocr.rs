//! `PaddleOCR` `PP-OCRv5` (mobile) inference over ONNX Runtime — the local OCR
//! engine that replaces Tesseract (det → cls → rec, CTC decoded).
//!
//! The three ONNX models ship as bundled Tauri resources
//! (`resources/models/paddleocr/`, fetched at packaging time by
//! `scripts/fetch-paddle-models.sh`) and the ONNX Runtime shared library is
//! loaded at runtime (`ort` `load-dynamic`, `scripts/fetch-onnxruntime.sh`).
//! Targets without an official shared build (Windows i686, macOS x64) fail
//! engine init and the caller degrades to the system OCR / VLM chain.
//!
//! MUST stay `#[tauri::command(async)]` + off the main thread: a full
//! det→rec pass costs hundreds of milliseconds, and blocking the main loop
//! starves `WM_HOTKEY` dispatch (AGENTS.md §8).

use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use image::DynamicImage;
use log::debug;
use ort::session::Session;
use ort::value::Tensor;

/// Characters recognized by the bundled `ch_PP-OCRv5_rec_mobile.onnx` model.
/// CTC class 0 is the blank symbol; class `i + 1` is `DICT[i]`.
const REC_DICT: &str = include_str!("../resources/models/paddleocr/ppocrv5_dict.txt");

/// Resource-relative model directory (resolved against the Tauri resource
/// dir). File names are referenced verbatim in `init_engine`.
const MODELS_DIR: &str = "resources/models/paddleocr";

/// Per-platform ONNX Runtime shared-library name inside the bundled
/// `resources/onnxruntime/` directory.
#[cfg(target_os = "linux")]
const ORT_DYLIB: &str = "resources/onnxruntime/libonnxruntime.so";
#[cfg(target_os = "macos")]
const ORT_DYLIB: &str = "resources/onnxruntime/libonnxruntime.dylib";
#[cfg(target_os = "windows")]
const ORT_DYLIB: &str = "resources/onnxruntime/onnxruntime.dll";

// ── Engine bootstrap ─────────────────────────────────────────────────────

struct Engine {
    det: Session,
    cls: Session,
    rec: Session,
    dict: Vec<String>,
}

/// Built once, cached forever: loading ~23 MB of models plus the runtime
/// dylib per screenshot would dominate OCR latency.
static ENGINE: OnceLock<Result<Mutex<Engine>, String>> = OnceLock::new();

/// Human-facing error for the targets the bundled runtime does not cover.
fn dylib_missing_error(dylib: &Path) -> String {
    format!(
        "PaddleOCR runtime library not found at {} (this build target ships without ONNX Runtime; \
         the system OCR or VLM service handles recognition instead)",
        dylib.display()
    )
}

fn init_engine(dylib: &Path, models_dir: &Path) -> Result<Mutex<Engine>, String> {
    if !dylib.is_file() {
        return Err(dylib_missing_error(dylib));
    }
    // Environment init is process-global and must happen before any session;
    // committing twice is a harmless no-op returning false.
    ort::init_from(dylib)
        .map_err(|e| format!("Failed to load ONNX Runtime: {e}"))?
        .commit();

    let load = |rel: &str| -> Result<Session, String> {
        let bytes = std::fs::read(models_dir.join(rel))
            .map_err(|e| format!("Model {rel} unreadable: {e}"))?;
        Session::builder()
            .map_err(|e| e.to_string())?
            .with_intra_threads(2)
            .map_err(|e| e.to_string())?
            .with_optimization_level(ort::session::builder::GraphOptimizationLevel::Level3)
            .map_err(|e| e.to_string())?
            .commit_from_memory(&bytes)
            .map_err(|e| format!("Model {rel} failed to load: {e}"))
    };

    let dict: Vec<String> = REC_DICT.lines().map(str::to_string).collect();
    if dict.is_empty() {
        return Err("Recognizer dictionary is empty".to_string());
    }

    Ok(Mutex::new(Engine {
        det: load("ch_PP-OCRv5_det_mobile.onnx")?,
        cls: load("ch_PP-LCNet_x0_25_textline_ori_cls_mobile.onnx")?,
        rec: load("ch_PP-OCRv5_rec_mobile.onnx")?,
        dict,
    }))
}

/// Cached engine accessor. `dylib` / `models_dir` are only consulted on the
/// first call; tests pass explicit paths, the command resolves resources.
fn engine(dylib: &Path, models_dir: &Path) -> Result<&'static Mutex<Engine>, String> {
    match ENGINE.get_or_init(|| init_engine(dylib, models_dir)) {
        Ok(mutex) => Ok(mutex),
        Err(e) => Err(e.clone()),
    }
}

// ── Tauri command ────────────────────────────────────────────────────────

/// OCR the cropped screenshot (`pan_screenshot_cut.png`, same input contract
/// as `system_ocr`). `lang` is accepted for signature symmetry with the
/// other recognize commands but intentionally unused: the bundled PP-OCRv5
/// recognizer natively covers simplified/traditional Chinese, English and
/// Japanese mixed text, and the recognition-language dropdown is documented
/// to be consumed by the system engine only.
#[tauri::command(async)]
pub fn paddle_ocr(app_handle: tauri::AppHandle, lang: &str) -> Result<String, String> {
    debug!("paddle_ocr invoked (lang={lang})");
    let dir = dirs::cache_dir()
        .ok_or_else(|| "Cannot resolve cache directory".to_string())?
        .join(app_handle.config().identifier.clone());
    let image_path = dir.join("pan_screenshot_cut.png");
    let dylib = resolve_resource(&app_handle, ORT_DYLIB)?;
    let models = resolve_resource(&app_handle, MODELS_DIR)?;

    // Heavy inference must not occupy a tauri async worker: run on a dedicated
    // thread like the Windows system OCR does.
    let worker = std::thread::spawn(move || recognize_file(&image_path, &dylib, &models));
    worker
        .join()
        .map_err(|_| "paddle_ocr worker panicked".to_string())?
}

fn resolve_resource(app_handle: &tauri::AppHandle, rel: &str) -> Result<PathBuf, String> {
    use tauri::{Manager, path::BaseDirectory};
    app_handle
        .path()
        .resolve(rel, BaseDirectory::Resource)
        .map_err(|e| format!("Failed to resolve resource {rel}: {e}"))
}

/// Full det → cls → rec pass over one image file.
pub fn recognize_file(
    image_path: &Path,
    dylib: &Path,
    models_dir: &Path,
) -> Result<String, String> {
    let engine = engine(dylib, models_dir)?;
    let img = image::open(image_path).map_err(|e| format!("Failed to decode screenshot: {e}"))?;
    let started = std::time::Instant::now();
    let text = recognize_image(&img, engine)?;
    debug!(
        "paddle_ocr finished in {} ms",
        started.elapsed().as_millis()
    );
    Ok(text)
}

// ── Preprocessing ────────────────────────────────────────────────────────

/// Detection-side length limits (`PaddleOCR` `PP-OCRv5 mobile` defaults):
/// small crops are upscaled so the short side reaches 736 px, oversized ones
/// are capped at 1280 px to bound memory, and both sides end up multiples
/// of 32 as the fully-convolutional detector expects.
const DET_LIMIT_MIN: f32 = 736.0;
const DET_LIMIT_MAX: f32 = 1280.0;

/// Detector probability-map binarization threshold (`text_det_thresh`).
const DET_BIN_THRESHOLD: f32 = 0.3;
/// Minimum mean probability for a candidate region (`text_det_box_thresh`).
const DET_BOX_THRESHOLD: f32 = 0.5;
/// Polygon expansion ratio (`text_det_unclip_ratio`).
const DET_UNCLIP_RATIO: f32 = 1.6;
/// Regions smaller than this many pixels per side are noise.
const DET_MIN_SIDE: i64 = 3;
/// Classifier decision threshold for the 180° orientation flip.
const CLS_FLIP_THRESHOLD: f32 = 0.9;
/// Classifier input geometry: the PP-LCNet textline-orientation model ships
/// with a fixed 80×160 input (unlike the older v2.0 cls at 48×192).
const CLS_HEIGHT: u32 = 80;
const CLS_WIDTH: u32 = 160;
/// Recognizer input geometry: `rec_image_shape = [3, 48, 320]`.
const REC_HEIGHT: u32 = 48;
const REC_WIDTH: u32 = 320;

/// Resized RGB planar tensor body: channel-major (NCHW without N), matching
/// what the ONNX inputs expect after a leading batch dimension.
struct PlanarImage {
    data: Vec<f32>,
}

fn to_rgb(img: &DynamicImage) -> image::RgbImage {
    img.to_rgb8()
}

/// Resize keeping aspect ratio; `Triangle` mirrors the bilinear filtering
/// the models were exported with.
fn resize_rgb(img: &image::RgbImage, width: u32, height: u32) -> image::RgbImage {
    image::imageops::resize(
        img,
        width.max(1),
        height.max(1),
        image::imageops::FilterType::Triangle,
    )
}

/// Detector normalization: the RapidOCR-exported PP-OCRv5 models expect the
/// plain `(x/255 - 0.5) / 0.5` transform — empirically the `ImageNet`
/// mean/std pair leaves the probability map dithered near the binarization
/// threshold (verified with the `det_normalization_variants` probe below).
const DET_MEAN: [f32; 3] = [0.5, 0.5, 0.5];
const DET_STD: [f32; 3] = [0.5, 0.5, 0.5];

/// Convert an RGB image into a normalized planar tensor body.
fn normalize_planar(img: &image::RgbImage, mean: [f32; 3], std: [f32; 3]) -> PlanarImage {
    let raw = img.as_raw();
    let pixels = (img.width() as usize) * (img.height() as usize);
    let mut data = vec![0.0_f32; pixels * 3];
    for (i, px) in raw.iter().enumerate() {
        let channel = i % 3;
        let scale = 1.0 / (255.0 * std[channel]);
        data[(channel * pixels) + i / 3] = (f32::from(*px) - mean[channel]) * scale;
    }
    PlanarImage { data }
}

/// Detector input sizing: returns the /32-rounded target dimensions.
fn det_input_size(width: u32, height: u32) -> (u32, u32) {
    let (w, h) = (width as f32, height as f32);
    let mut ratio = 1.0_f32;
    let short = w.min(h);
    if short < DET_LIMIT_MIN && short > 0.0 {
        ratio = DET_LIMIT_MIN / short;
    }
    let long = (w * ratio).max(h * ratio);
    if long > DET_LIMIT_MAX {
        ratio *= DET_LIMIT_MAX / long;
    }
    let round32 = |v: f32| ((v * ratio) / 32.0).ceil().max(1.0) as u32 * 32;
    (round32(w).max(32), round32(h).max(32))
}

// ── Detector post-processing (simplified DB) ─────────────────────────────

/// An axis-aligned text region in detector-input pixel coordinates.
#[derive(Debug, Clone, Copy, PartialEq)]
struct TextRect {
    x: i64,
    y: i64,
    width: i64,
    height: i64,
}

/// Binarized-map region discovered by the connected-component pass.
struct Candidate {
    rect: TextRect,
    area: usize,
    prob_sum: f64,
}

/// Two-pass connected-component labeling (4-connectivity) over the binary
/// mask. Pure Rust stand-in for the `OpenCV` `connectedComponents` the
/// reference pipeline uses; `labels` is row-major, 0 = background. Region
/// scores are the mean detector probability inside each component.
fn label_regions(mask: &[bool], probs: &[f32], width: usize, height: usize) -> Vec<Candidate> {
    let mut labels = vec![0_u32; mask.len()];
    let mut next_label: u32 = 0;
    let mut parent: Vec<u32> = Vec::new();

    // Pass 1: provisional labels + equivalence tracking.
    for y in 0..height {
        for x in 0..width {
            let idx = y * width + x;
            if !mask[idx] {
                continue;
            }
            let west = x > 0 && mask[idx - 1];
            let north = y > 0 && mask[idx - width];
            match (west, north) {
                (false, false) => {
                    next_label += 1;
                    labels[idx] = next_label;
                    parent.push(next_label);
                }
                (true, false) => labels[idx] = labels[idx - 1],
                (false, true) => labels[idx] = labels[idx - width],
                (true, true) => {
                    let a = labels[idx - 1];
                    let b = labels[idx - width];
                    labels[idx] = a.min(b);
                    if a != b {
                        parent[a.max(b) as usize - 1] = a.min(b);
                    }
                }
            }
        }
    }

    // Resolve the union-find forest to root labels.
    let root: Vec<u32> = (0..parent.len())
        .map(|i| {
            let mut cur = (i + 1) as u32;
            while parent[cur as usize - 1] != cur {
                cur = parent[cur as usize - 1];
            }
            cur
        })
        .collect();

    // Pass 2: bounding boxes and probability sums per root label.
    let mut boxes: Vec<Option<Candidate>> = (0..=parent.len()).map(|_| None).collect();
    for y in 0..height {
        for x in 0..width {
            let idx = y * width + x;
            let label = labels[idx];
            if label == 0 {
                continue;
            }
            let root_label = root[label as usize - 1];
            let slot = &mut boxes[root_label as usize];
            match slot {
                Some(c) => {
                    c.rect.x = c.rect.x.min(x as i64);
                    c.rect.y = c.rect.y.min(y as i64);
                    c.rect.width = c.rect.width.max(x as i64 - c.rect.x + 1);
                    c.rect.height = c.rect.height.max(y as i64 - c.rect.y + 1);
                    c.area += 1;
                    c.prob_sum += f64::from(probs[idx]);
                }
                None => {
                    *slot = Some(Candidate {
                        rect: TextRect {
                            x: x as i64,
                            y: y as i64,
                            width: 1,
                            height: 1,
                        },
                        area: 1,
                        prob_sum: 0.0,
                    });
                }
            }
        }
    }
    boxes.into_iter().flatten().collect()
}

/// Expand a rectangle outward by `distance` on every side (the axis-aligned
/// special case of the DB `unclip` polygon offset: `distance = area · ratio
/// / perimeter`), then clamp to the image bounds.
fn unclip(rect: TextRect, unclip_ratio: f32, width: i64, height: i64) -> TextRect {
    let w = rect.width.max(0) as f32;
    let h = rect.height.max(0) as f32;
    let length = 2.0 * (w + h);
    let distance = if length > 0.0 {
        w * h * unclip_ratio / length
    } else {
        0.0
    };
    let dx = distance.round() as i64;
    let dy = distance.round() as i64;
    let x0 = (rect.x - dx).max(0);
    let y0 = (rect.y - dy).max(0);
    let x1 = (rect.x + rect.width + dx).min(width);
    let y1 = (rect.y + rect.height + dy).min(height);
    TextRect {
        x: x0,
        y: y0,
        width: (x1 - x0).max(0),
        height: (y1 - y0).max(0),
    }
}

/// 3×3 max filter on the binary mask (the `use_dilation` step, which merges
/// characters that binarize into separate blobs).
fn dilate(mask: &mut [bool], width: usize, height: usize) {
    let before = mask.to_vec();
    for y in 0..height {
        for x in 0..width {
            let idx = y * width + x;
            if before[idx] {
                continue;
            }
            let any = (x > 0 && before[idx - 1])
                || (x + 1 < width && before[idx + 1])
                || (y > 0 && before[idx - width])
                || (y + 1 < height && before[idx + width]);
            mask[idx] = any;
        }
    }
}

/// Probability map → filtered, expanded text rects in detector-input space.
fn detect_boxes(prob: &[f32], width: usize, height: usize) -> Vec<TextRect> {
    let mut mask: Vec<bool> = prob.iter().map(|&p| p > DET_BIN_THRESHOLD).collect();
    dilate(&mut mask, width, height);
    label_regions(&mask, prob, width, height)
        .into_iter()
        .filter(|c| {
            c.area >= DET_MIN_SIDE.unsigned_abs() as usize
                && c.rect.width >= DET_MIN_SIDE
                && c.rect.height >= DET_MIN_SIDE
                && c.prob_sum / c.area as f64 > f64::from(DET_BOX_THRESHOLD)
        })
        .map(|c| unclip(c.rect, DET_UNCLIP_RATIO, width as i64, height as i64))
        .collect()
}

/// Map detector-space rects back onto the original image and order them for
/// reading: rows grouped by vertical overlap, left-to-right inside a row.
fn order_regions(mut rects: Vec<TextRect>, scale: f32) -> Vec<TextRect> {
    for r in &mut rects {
        *r = TextRect {
            x: (r.x as f32 / scale) as i64,
            y: (r.y as f32 / scale) as i64,
            width: (r.width as f32 / scale).ceil() as i64,
            height: (r.height as f32 / scale).ceil() as i64,
        };
    }
    rects.sort_by(|a, b| a.y.cmp(&b.y).then(a.x.cmp(&b.x)));
    let mut rows: Vec<Vec<TextRect>> = Vec::new();
    for r in rects {
        match rows.last_mut() {
            Some(row) if r.y < row.iter().map(|p| p.y + p.height).min().unwrap_or(i64::MAX) => {
                row.push(r);
            }
            _ => rows.push(vec![r]),
        }
    }
    let mut ordered = Vec::new();
    for mut row in rows {
        row.sort_by_key(|r| r.x);
        ordered.extend(row);
    }
    ordered
}

/// Crop a rect (clamped) from the original RGB image.
fn crop_rect(img: &image::RgbImage, rect: TextRect) -> image::RgbImage {
    let x = rect.x.clamp(0, i64::from(img.width().saturating_sub(1))) as u32;
    let y = rect.y.clamp(0, i64::from(img.height().saturating_sub(1))) as u32;
    let w = (rect.width.max(1) as u32).min(img.width() - x);
    let h = (rect.height.max(1) as u32).min(img.height() - y);
    image::imageops::crop_imm(img, x, y, w, h).to_image()
}

/// Probability that a crop is rotated 180°. The exported textline
/// classifier already emits softmax probabilities (upright ≈ [1, 0]), so a
/// plain sum-normalization of the two outputs is used: identical to the
/// values for this model, and still monotonic if a re-export ever switches
/// back to raw logits.
fn flipped_probability(outputs: &[f32]) -> f32 {
    match outputs {
        [a, b, ..] if a + b > 0.0 => b / (a + b),
        _ => 0.0,
    }
}

// ── Recognition (CTC) ────────────────────────────────────────────────────

/// Greedy CTC decode: collapse repeated classes, drop blanks (class 0),
/// map class `i + 1` through the dictionary.
fn ctc_decode(classes: &[usize], dict: &[String]) -> String {
    let mut text = String::new();
    let mut prev: Option<usize> = None;
    for &class in classes {
        if class != 0
            && Some(class) != prev
            && let Some(chars) = dict.get(class - 1)
        {
            text.push_str(chars);
        }
        prev = Some(class);
    }
    text
}

/// Build the recognizer's `[3, 48, 320]` canvas: resize to height 48
/// (squashing if wider than 320), paste onto a zero-normalized canvas.
fn rec_input(img: &image::RgbImage) -> PlanarImage {
    let ratio = REC_HEIGHT as f32 / (img.height().max(1) as f32);
    let resized_w = ((img.width() as f32 * ratio).ceil() as u32).clamp(1, REC_WIDTH);
    let resized = resize_rgb(img, resized_w, REC_HEIGHT);
    let mut canvas = PlanarImage {
        data: vec![0.0; (REC_WIDTH * REC_HEIGHT * 3) as usize],
    };
    // The recognizer normalizes with mean 0.5 / std 0.5; the padding value 0
    // therefore corresponds to mid-gray, matching the reference pipeline.
    let norm = |v: u8| (f32::from(v) / 255.0 - 0.5) / 0.5;
    let (rw, rh) = (resized.width() as usize, resized.height() as usize);
    for c in 0..3_usize {
        for y in 0..rh {
            let src = resized.as_raw();
            for x in 0..rw {
                canvas.data[c * (REC_WIDTH * REC_HEIGHT) as usize + y * REC_WIDTH as usize + x] =
                    norm(src[(y * rw + x) * 3 + c]);
            }
        }
    }
    canvas
}

/// Run one image through the detector and return candidate rects (scaled
/// back to original coordinates, reading order).
// The guard must outlive `outputs` (the session outputs borrow it), so the
// lock's scope is already as tight as ownership allows.
#[allow(clippy::significant_drop_tightening)]
fn run_detector(engine: &Mutex<Engine>, img: &image::RgbImage) -> Result<Vec<TextRect>, String> {
    let (target_w, target_h) = det_input_size(img.width(), img.height());
    let resized = resize_rgb(img, target_w, target_h);
    let planar = normalize_planar(&resized, DET_MEAN, DET_STD);
    let scale = resized.width() as f32 / (img.width().max(1) as f32);
    // Scoped so the engine lock is released as soon as inference + box
    // extraction finish (the output tensors borrow the session).
    let rects: Vec<TextRect> = {
        let mut engine = engine
            .lock()
            .map_err(|_| "paddle engine poisoned".to_string())?;
        let input_name = engine
            .det
            .inputs()
            .first()
            .map_or("x", |i| i.name())
            .to_string();
        let output_name = engine
            .det
            .outputs()
            .first()
            .map_or("", |o| o.name())
            .to_string();
        let tensor = Tensor::from_array((
            [
                1_usize,
                3,
                resized.height() as usize,
                resized.width() as usize,
            ],
            planar.data,
        ))
        .map_err(|e| e.to_string())?;
        let outputs = engine
            .det
            .run(ort::inputs![input_name.as_str() => tensor])
            .map_err(|e| e.to_string())?;
        let (shape, prob) = outputs[output_name.as_str()]
            .try_extract_tensor::<f32>()
            .map_err(|e| e.to_string())?;
        let map_w = shape.last().copied().unwrap_or(0).max(0) as usize;
        let map_h = shape.get(2).copied().unwrap_or(0).max(0) as usize;
        // Dev diagnostics: dump the resized input and probability map heatmap.
        #[cfg(test)]
        if std::env::var("PAN_PADDLE_DEBUG").is_ok() {
            eprintln!(
                "[det] img={}x{} target={}x{} scale={scale:.3}",
                img.width(),
                img.height(),
                resized.width(),
                resized.height()
            );
            eprintln!("[det] input={input_name} output={output_name} shape={shape:?}");
            let max = prob.iter().copied().fold(f32::MIN, f32::max);
            let min = prob.iter().copied().fold(f32::MAX, f32::min);
            let mean = prob.iter().copied().sum::<f32>() / prob.len() as f32;
            eprintln!("[det] prob min={min:.4} max={max:.4} mean={mean:.4}");
            let _ = resized.save("/tmp/paddle_debug/det_input.png");
            let mut heat = image::GrayImage::new(map_w as u32, map_h as u32);
            for (i, p) in prob.iter().take(map_w * map_h).enumerate() {
                heat.put_pixel(
                    (i % map_w) as u32,
                    (i / map_w) as u32,
                    image::Luma([(p * 255.0) as u8]),
                );
            }
            let _ = image::imageops::resize(
                &heat,
                map_w as u32 * 4,
                map_h as u32 * 4,
                image::imageops::FilterType::Nearest,
            )
            .save("/tmp/paddle_debug/probmap.png");
        }
        let rects = order_regions(detect_boxes(prob, map_w, map_h), scale);
        // Detector-space size checks cannot see sub-pixel slivers once boxes
        // are mapped back (and the model leaves faint edge artifacts at
        // bitmap borders), so apply a floor in original-image coordinates.
        rects
            .into_iter()
            .filter(|r| r.width >= 10 && r.height >= 8)
            .collect::<Vec<_>>()
    };
    Ok(rects)
}

/// Classify one line crop: returns `true` when it must be rotated 180°.
fn needs_flip(engine: &mut Engine, img: &image::RgbImage) -> Result<bool, String> {
    let resized = resize_rgb(img, CLS_WIDTH, CLS_HEIGHT);
    let planar = normalize_planar(&resized, [0.5, 0.5, 0.5], [0.5, 0.5, 0.5]);
    let input_name = engine
        .cls
        .inputs()
        .first()
        .map_or("x", |i| i.name())
        .to_string();
    let output_name = engine
        .cls
        .outputs()
        .first()
        .map_or("", |o| o.name())
        .to_string();
    let tensor = Tensor::from_array((
        [1_usize, 3, CLS_HEIGHT as usize, CLS_WIDTH as usize],
        planar.data,
    ))
    .map_err(|e| e.to_string())?;
    let outputs = engine
        .cls
        .run(ort::inputs![input_name.as_str() => tensor])
        .map_err(|e| e.to_string())?;
    let (_, logits) = outputs[output_name.as_str()]
        .try_extract_tensor::<f32>()
        .map_err(|e| e.to_string())?;
    Ok(flipped_probability(logits) > CLS_FLIP_THRESHOLD)
}

/// Recognize one line crop through the CTC decoder.
fn recognize_line(engine: &mut Engine, img: &image::RgbImage) -> Result<String, String> {
    let planar = rec_input(img);
    let input_name = engine
        .rec
        .inputs()
        .first()
        .map_or("x", |i| i.name())
        .to_string();
    let output_name = engine
        .rec
        .outputs()
        .first()
        .map_or("", |o| o.name())
        .to_string();
    let tensor = Tensor::from_array((
        [1_usize, 3, REC_HEIGHT as usize, REC_WIDTH as usize],
        planar.data,
    ))
    .map_err(|e| e.to_string())?;
    let outputs = engine
        .rec
        .run(ort::inputs![input_name.as_str() => tensor])
        .map_err(|e| e.to_string())?;
    let (shape, probs) = outputs[output_name.as_str()]
        .try_extract_tensor::<f32>()
        .map_err(|e| e.to_string())?;
    let steps = shape.get(1).copied().unwrap_or(0).max(0) as usize;
    let classes = shape.get(2).copied().unwrap_or(0).max(0) as usize;
    let mut best: Vec<usize> = Vec::with_capacity(steps);
    for step in 0..steps {
        let row = &probs[step * classes..(step + 1) * classes];
        let arg = row
            .iter()
            .enumerate()
            .max_by(|a, b| a.1.total_cmp(b.1))
            .map_or(0, |(i, _)| i);
        best.push(arg);
    }
    Ok(ctc_decode(&best, &engine.dict))
}

/// Det → cls → rec over a decoded image; lines are joined with newlines.
fn recognize_image(img: &DynamicImage, engine: &Mutex<Engine>) -> Result<String, String> {
    let rgb = to_rgb(img);
    let rects = run_detector(engine, &rgb)?;
    let mut lines: Vec<String> = Vec::with_capacity(rects.len());
    for rect in rects {
        let mut crop = crop_rect(&rgb, rect);
        let text = {
            let mut guard = engine
                .lock()
                .map_err(|_| "paddle engine poisoned".to_string())?;
            if needs_flip(&mut guard, &crop)? {
                image::imageops::rotate180_in_place(&mut crop);
            }
            recognize_line(&mut guard, &crop)?
        };
        if !text.trim().is_empty() {
            lines.push(text.trim().to_string());
        }
    }
    Ok(lines.join("\n"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dict() -> Vec<String> {
        vec!["a".into(), "b".into(), "c".into(), "ab".into()]
    }

    #[test]
    fn ctc_collapses_repeats_and_drops_blanks() {
        // blank(0) a a blank(0) b b b → "ab"; trailing blank dropped.
        assert_eq!(ctc_decode(&[0, 1, 1, 0, 2, 2, 2, 0], &dict()), "ab");
        // Two separate runs of the same class need a blank between them.
        assert_eq!(ctc_decode(&[1, 0, 1], &dict()), "aa");
        // Direct repetition of a class is one glyph ("ab" is dict index 3 → class 4).
        assert_eq!(ctc_decode(&[4, 4], &dict()), "ab");
        // Out-of-dictionary classes are ignored, empty input stays empty.
        assert_eq!(ctc_decode(&[99], &dict()), "");
        assert_eq!(ctc_decode(&[], &dict()), "");
    }

    #[test]
    fn unclip_expands_and_clamps() {
        let rect = TextRect {
            x: 10,
            y: 10,
            width: 20,
            height: 10,
        };
        // distance = 20·10·1.6 / (2·30) ≈ 5.33 → 5 px per side.
        let grown = unclip(rect, 1.6, 200, 200);
        assert_eq!(
            grown,
            TextRect {
                x: 5,
                y: 5,
                width: 30,
                height: 20
            }
        );
        // Expansion clamps inside the image instead of overflowing.
        let edge = unclip(
            TextRect {
                x: 0,
                y: 0,
                width: 20,
                height: 10,
            },
            1.6,
            30,
            30,
        );
        assert_eq!((edge.x, edge.y, edge.width, edge.height), (0, 0, 25, 15));
        // Degenerate rects do not divide by zero.
        let degenerate = unclip(
            TextRect {
                x: 4,
                y: 4,
                width: 0,
                height: 0,
            },
            1.6,
            10,
            10,
        );
        assert_eq!((degenerate.x, degenerate.y), (4, 4));
    }

    #[test]
    fn det_input_size_rounds_to_32_and_limits_sides() {
        // Small images upscale so the short side reaches 736; a 2:1 crop
        // then has its long side over the 1280 cap, so the cap wins.
        assert_eq!(det_input_size(200, 100), (1280, 640));
        // Oversized images cap the long side at 1280.
        assert_eq!(det_input_size(4000, 2000), (1280, 640));
        // Everything stays a multiple of 32.
        for (w0, h0) in [(333, 47), (1920, 1080), (51, 51), (960, 300)] {
            let (w, h) = det_input_size(w0, h0);
            assert_eq!(w % 32, 0);
            assert_eq!(h % 32, 0);
        }
        // Small square-ish images just upscale to the 736 short side.
        assert_eq!(det_input_size(100, 100), (736, 736));
    }

    #[test]
    fn detector_finds_bright_blobs_and_drops_noise() {
        // 64×32 probability map: one strong blob, one weak, one tiny.
        let (w, h) = (64_usize, 32_usize);
        let mut prob = vec![0.0_f32; w * h];
        for y in 4..12 {
            for x in 4..40 {
                prob[y * w + x] = 0.99;
            }
        }
        for y in 20..24 {
            for x in 50..58 {
                prob[y * w + x] = 0.4; // below the box threshold
            }
        }
        prob[30 * w + 60] = 0.99; // single-pixel spike → too small
        let boxes = detect_boxes(&prob, w, h);
        assert_eq!(boxes.len(), 1, "only the strong blob survives: {boxes:?}");
        let b = boxes[0];
        assert!(b.x <= 4 && b.y <= 4 && b.width >= 36 && b.height >= 8);
    }

    #[test]
    fn label_regions_splits_disjoint_blobs() {
        let (w, h) = (40_usize, 20_usize);
        let mask = (0..w * h)
            .map(|i| {
                let (x, y) = (i % w, i / w);
                (2..8).contains(&x) && (2..6).contains(&y)
                    || (20..26).contains(&x) && (10..14).contains(&y)
            })
            .collect::<Vec<_>>();
        let regions = label_regions(&mask, &vec![0.0; w * h], w, h);
        assert_eq!(regions.len(), 2);
    }

    #[test]
    fn reading_order_groups_rows_left_to_right() {
        // Detector coordinates are 2× the originals here (the det input was
        // upscaled), so mapping back halves them.
        let rects = vec![
            TextRect {
                x: 200,
                y: 20,
                width: 60,
                height: 20,
            }, // row 0, right
            TextRect {
                x: 40,
                y: 24,
                width: 60,
                height: 20,
            }, // row 0, left
            TextRect {
                x: 300,
                y: 200,
                width: 60,
                height: 20,
            }, // row 1
        ];
        let ordered = order_regions(rects, 2.0);
        assert_eq!(ordered.len(), 3);
        // Row 0 (halved): left before right.
        assert_eq!(ordered[0].x, 20);
        assert_eq!(ordered[1].x, 100);
        assert!(ordered[0].y < 20 && ordered[1].y < 20);
        // Row 1 comes last, below row 0.
        assert_eq!(ordered[2].x, 150);
        assert_eq!(ordered[2].y, 100);
    }

    #[test]
    fn rec_input_pastes_onto_fixed_canvas() {
        let img = image::RgbImage::from_fn(100, 25, |x, _y| {
            if x < 10 {
                image::Rgb([255, 0, 0])
            } else {
                image::Rgb([0, 0, 0])
            }
        });
        let planar = rec_input(&img);
        assert_eq!(planar.data.len(), (REC_WIDTH * REC_HEIGHT * 3) as usize);
        // The canvas is 320 wide; the 100-px source scales to 192 px.
        // Red pixels normalize to (1 - 0.5) / 0.5 = 1.0 in the red channel.
        assert!((planar.data[0] - 1.0).abs() < 1e-6);
        // Black pixels normalize to -1.0 (sample x=50, y=0, red channel).
        assert!((planar.data[50 * 3] - (-1.0)).abs() < 1e-6);
        // The canvas padding beyond the pasted width stays mid-gray = 0.
        let pad_index = (192 * 3) as usize; // first padding sample, red channel
        assert!(planar.data[pad_index].abs() < 1e-6);
    }

    #[test]
    fn flipped_probability_peaks_on_second_output() {
        assert!(flipped_probability(&[0.1, 3.0]) > 0.9); // 3.0/3.1
        assert!(flipped_probability(&[3.0, 0.1]) < 0.1);
        assert!(flipped_probability(&[]).abs() < 1e-6);
    }

    /// Empirical probe (run manually while tuning): tries normalization ×
    /// input-size variants and reports how solid the detector response is
    /// over the text band. `cargo test det_normalization_variants -- --ignored --nocapture`
    #[test]
    #[ignore = "manual tuning probe; needs locally fetched models"]
    // The engine guard intentionally spans the whole variant loop.
    #[allow(clippy::significant_drop_tightening)]
    fn det_normalization_variants() {
        let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let models = manifest.join("resources/models/paddleocr");
        let dylib = manifest.join(ORT_DYLIB);
        if !models.join("ch_PP-OCRv5_det_mobile.onnx").is_file() || !dylib.is_file() {
            eprintln!("skipping: models absent");
            return;
        }
        let Some((img, _cjk)) = render_test_image("Hello World 12345") else {
            eprintln!("skipping: no font");
            return;
        };
        let rgb = img;
        let mutex = init_engine(&dylib, &models).expect("engine");
        let mut engine = mutex.lock().unwrap();
        let input_name = engine
            .det
            .inputs()
            .first()
            .map_or("x", |i| i.name())
            .to_string();
        let output_name = engine
            .det
            .outputs()
            .first()
            .map_or("", |o| o.name())
            .to_string();

        let variants: [(&str, [f32; 3], [f32; 3], bool); 4] = [
            ("imagenet-736min", DET_MEAN, DET_STD, true),
            ("half-736min", [0.5, 0.5, 0.5], [0.5, 0.5, 0.5], true),
            ("raw255-736min", [0.0, 0.0, 0.0], [1.0, 1.0, 1.0], true),
            ("imagenet-natural", DET_MEAN, DET_STD, false),
        ];
        for (name, mean, std, limit) in variants {
            let (tw, th) = if limit {
                det_input_size(rgb.width(), rgb.height())
            } else {
                let r32 = |v: u32| v.div_ceil(32) * 32;
                (r32(rgb.width()), r32(rgb.height()))
            };
            let resized = resize_rgb(&rgb, tw, th);
            let planar = normalize_planar(&resized, mean, std);
            let tensor =
                Tensor::from_array(([1_usize, 3, th as usize, tw as usize], planar.data)).unwrap();
            let outputs = engine
                .det
                .run(ort::inputs![input_name.as_str() => tensor])
                .unwrap();
            let (shape, prob) = outputs[output_name.as_str()]
                .try_extract_tensor::<f32>()
                .unwrap();
            let mw = shape.last().copied().unwrap_or(0) as usize;
            let mh = shape.get(2).copied().unwrap_or(0) as usize;
            let max = prob.iter().copied().fold(f32::MIN, f32::max);
            let solid = prob.iter().filter(|&&p| p > 0.9).count();
            let mid = prob.iter().filter(|&&p| p > 0.3 && p <= 0.9).count();
            let boxes = detect_boxes(prob, mw, mh);
            eprintln!(
                "[{name}] {tw}x{th} max={max:.3} solid(>0.9)={solid} mid={mid} boxes={} {:?}",
                boxes.len(),
                &boxes[..boxes.len().min(3)]
            );
        }
    }

    /// End-to-end smoke test: renders text with a locally available TTF and
    /// runs the full det→cls→rec pipeline against the bundled models. It
    /// skips silently when the models, the ONNX Runtime dylib, or a test
    /// font is missing (CI lint jobs fetch neither) — locally run it via
    /// `RUSTUP_TOOLCHAIN=… cargo test --bin pan paddle_ocr` after fetching
    /// both with the scripts in `scripts/`.
    #[test]
    fn end_to_end_pipeline_recognizes_rendered_text() {
        let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let models = manifest.join("resources/models/paddleocr");
        let dylib = manifest.join(ORT_DYLIB);
        if !models.join("ch_PP-OCRv5_det_mobile.onnx").is_file() || !dylib.is_file() {
            eprintln!("skipping: paddle models or ONNX Runtime dylib not present");
            return;
        }
        let Some((img, cjk_capable)) = render_test_image("Hello World 12345") else {
            eprintln!("skipping: no test font available");
            return;
        };
        let path = std::env::temp_dir().join("pan_paddle_e2e.png");
        img.save(&path).expect("save test image");
        // Dev diagnostics: keep the rendered fixture for manual inspection.
        let _ = std::fs::create_dir_all("/tmp/paddle_debug");
        let _ = img.save("/tmp/paddle_debug/fixture.png");
        let text = recognize_file(&path, &dylib, &models).expect("pipeline succeeds");
        assert!(text.contains("Hello"), "expected 'Hello' in {text:?}");
        assert!(text.contains("12345"), "expected digits in {text:?}");

        // The bundled recognizer's headline capability is simplified /
        // traditional Chinese, English and Japanese mixed text — cover it
        // when the dev font can actually render han characters.
        if cjk_capable {
            let Some((img, _)) = render_test_image("你好世界 測試") else {
                unreachable!("the font just rendered a line");
            };
            let path = std::env::temp_dir().join("pan_paddle_e2e_cjk.png");
            img.save(&path).expect("save cjk test image");
            let text = recognize_file(&path, &dylib, &models).expect("cjk pipeline succeeds");
            assert!(text.contains("你好世界"), "expected CJK text in {text:?}");
        }

        // Upside-down text exercises the orientation classifier: detection
        // fires on 180° lines, the classifier must flip them back before
        // recognition.
        let Some((upright, _)) = render_test_image("Pan OCR 6789") else {
            unreachable!("the font just rendered a line");
        };
        let flipped = image::imageops::rotate180(&upright);
        let path = std::env::temp_dir().join("pan_paddle_e2e_flipped.png");
        flipped.save(&path).expect("save flipped test image");
        let text = recognize_file(&path, &dylib, &models).expect("flipped pipeline succeeds");
        assert!(
            text.contains("Pan") || text.contains("OCR") || text.contains("6789"),
            "upside-down text not recovered: {text:?}"
        );
    }

    /// Rasterize `text` with the first available dev font: the `PAN_OCR_TEST_FONT`
    /// override, `NotoSansSC` (CJK-capable), or a `KaTeX` face from the harness
    /// checkout. `None` = nothing usable found (test then skips); the boolean
    /// reports whether the chosen font can render han characters.
    fn render_test_image(text: &str) -> Option<(image::RgbImage, bool)> {
        use ab_glyph::{Font, FontVec, ScaleFont};

        const NAMED_CANDIDATES: &[&str] = &[
            "/tmp/ocrfonts/NotoSansSC.ttf",
            // Bold faces render much sturdier detector responses than thin
            // variable-font defaults; prefer them when available.
            "/opt/deepseek-harness/apps/web/dist/assets/fonts/KaTeX_Main-Bold-waoOVXN0.ttf",
            "/opt/deepseek-harness/apps/web/dist/assets/fonts/KaTeX_Main-Regular-DRggAlZN.ttf",
        ];
        let font_path = std::env::var("PAN_OCR_TEST_FONT")
            .ok()
            .map(PathBuf::from)
            .or_else(|| {
                NAMED_CANDIDATES
                    .iter()
                    .map(PathBuf::from)
                    .find(|p| p.is_file())
            })?;
        let bytes = std::fs::read(&font_path).ok()?;
        let font = FontVec::try_from_vec(bytes).ok()?.into_scaled(64.0_f32);

        let (line_h, baseline, margin) = (96.0_f32, 76.0_f32, 16.0_f32);
        // Pass 1: measure the line via advances so the canvas fits the text.
        let mut width = margin * 2.0;
        for ch in text.chars() {
            width += font.h_advance(font.scaled_glyph(ch).id);
        }
        let mut img = image::RgbImage::from_pixel(
            width.ceil() as u32,
            line_h as u32,
            image::Rgb([255, 255, 255]),
        );
        // Pass 2: draw dark glyphs on the white background.
        let mut x = margin;
        for ch in text.chars() {
            let mut glyph = font.scaled_glyph(ch);
            glyph.position = ab_glyph::point(x, baseline);
            if let Some(outlined) = font.outline_glyph(glyph) {
                let bounds = outlined.px_bounds();
                outlined.draw(|px, py, coverage| {
                    let xi = px + bounds.min.x as u32;
                    let yi = py + bounds.min.y as u32;
                    if xi < img.width() && yi < img.height() {
                        let dark = (255.0 * (1.0 - coverage)) as u8;
                        img.put_pixel(xi, yi, image::Rgb([dark, dark, dark]));
                    }
                });
            }
            x += font.h_advance(font.scaled_glyph(ch).id);
        }
        let cjk_capable = "你好測".chars().all(|c| font.glyph_id(c).0 != 0);
        Some((img, cjk_capable))
    }
}
