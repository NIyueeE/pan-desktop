import { invoke } from '@tauri-apps/api/core';
import detect from '../../utils/lang_detect';
import type { RecognizeRequestOptions } from '../types';

/** Local PaddleOCR (PP-OCRv5 mobile, ONNX) running in the Rust backend.
 * The bundled recognizer natively covers simplified/traditional Chinese,
 * English and Japanese mixed text, so like the system engine this service
 * only consumes the language for its CJK post-processing decisions. */
export const info = { name: 'paddle', icon: 'logo/paddle.svg' };

// The recognize runner requires the configured recognition language to be a
// known key before an instance may run (`recognizeLanguage in Language`).
// Values are backend-level labels only; the Rust command currently ignores
// them (one model covers zh/en/ja).
export const Language: Record<string, string> = {
    auto: 'auto',
    zh_cn: 'zh',
    zh_tw: 'zh',
    en: 'en',
    yue: 'zh',
    ja: 'ja',
    ko: 'ko',
    fr: 'fr',
    es: 'es',
    ru: 'ru',
    de: 'de',
    it: 'it',
    tr: 'tr',
    pt_pt: 'pt',
    pt_br: 'pt',
    vi: 'vi',
    id: 'id',
    th: 'th',
    ms: 'ms',
    ar: 'ar',
    hi: 'hi',
    uk: 'uk',
    he: 'he',
};

function isCjkLanguage(language: string): boolean {
    return language === 'zh_cn' || language === 'zh_tw' || language === 'ja';
}

export async function recognize(
    _base64: string,
    language: string,
    _options?: RecognizeRequestOptions
): Promise<string> {
    let result = await invoke<string>('paddle_ocr', { lang: Language[language] ?? language });
    // The recognizer inserts spaces between CJK glyphs; strip them for CJK
    // results (same rule as the system engine).
    if ((language === 'auto' && (await detect(result)) === 'zh_cn') || isCjkLanguage(language)) {
        result = result.replaceAll(' ', '');
    }
    return result.trim();
}
