import type { RecognizeRequestOptions } from '../types';

export const info = { name: 'tesseract', icon: 'logo/tesseract.png' };

export const Language: Record<string, string> = {
    auto: 'eng',
    zh_cn: 'chi_sim',
    zh_tw: 'chi_tra',
    en: 'eng',
    yue: 'chi_sim',
    ja: 'jpn',
    ko: 'kor',
    fr: 'fra',
    es: 'spa',
    ru: 'rus',
    de: 'deu',
    it: 'ita',
    tr: 'tur',
    pt_pt: 'por',
    pt_br: 'por',
    vi: 'vie',
    id: 'ind',
    th: 'tha',
    ms: 'msa',
    ar: 'ara',
    hi: 'hin',
    uk: 'ukr',
    he: 'heb',
};

// worker/core assets are bundled in public/ (tesseract.js v5, matching the
// pinned dependency); trained language data comes from the upstream CDN.
const TESSERACT_OPTIONS = {
    workerPath: '/worker.min.js',
    corePath: '/tesseract-core-simd-lstm.wasm.js',
    langPath: 'https://pub-f6afb74f13c64cd89561b4714dca1c27.r2.dev',
} as const;

export async function recognize(base64: string, language: string, _options?: RecognizeRequestOptions): Promise<string> {
    // Loaded on demand: tesseract.js is heavy and must not be parsed at
    // window boot.
    const Tesseract = (await import('tesseract.js')).default;
    const {
        data: { text },
    } = await Tesseract.recognize('data:image/png;base64,' + base64, Language[language] ?? language, TESSERACT_OPTIONS);
    if (language === 'zh_cn' || language === 'zh_tw') {
        return text.replaceAll(' ', '').trim();
    }
    return text.trim();
}
