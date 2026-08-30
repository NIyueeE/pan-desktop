export const info = {
    name: 'openai',
    icon: 'logo/openai.svg',
};

// Mirrors the local OCR services' language sets. The value is a human readable
// language name injected into the OCR prompt via `$lang` (empty string for
// `auto` means "detect the language yourself").
export enum Language {
    auto = '',
    zh_cn = 'Simplified Chinese',
    zh_tw = 'Traditional Chinese',
    en = 'English',
    yue = 'Cantonese',
    ja = 'Japanese',
    ko = 'Korean',
    fr = 'French',
    es = 'Spanish',
    ru = 'Russian',
    de = 'German',
    it = 'Italian',
    tr = 'Turkish',
    pt_pt = 'Portuguese',
    pt_br = 'Portuguese (Brazil)',
    vi = 'Vietnamese',
    id = 'Indonesian',
    th = 'Thai',
    ms = 'Malay',
    ar = 'Arabic',
    hi = 'Hindi',
    uk = 'Ukrainian',
    he = 'Hebrew',
}
