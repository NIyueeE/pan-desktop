// ISO-639-1 + Country Code (Option)
// https://zh.wikipedia.org/wiki/ISO_639-1%E4%BB%A3%E7%A0%81%E8%A1%A8
export const languageList = [
    'zh_cn',
    'zh_tw',
    'mn_mo',
    'en',
    'ja',
    'ko',
    'fr',
    'es',
    'ru',
    'de',
    'it',
    'tr',
    'pt_pt',
    'pt_br',
    'vi',
    'id',
    'th',
    'ms',
    'ar',
    'hi',
    'km',
    'mn_cy',
    'nb_no',
    'nn_no',
    'fa',
    'sv',
    'pl',
    'nl',
    'uk',
    'he',
] as const;

export type LanguageCode = (typeof languageList)[number];

// https://flagicons.lipis.dev/
export const LanguageFlag: Record<string, string> = {
    zh_cn: 'cn',
    zh_tw: 'cn',
    mn_mo: 'cn',
    en: 'gb',
    ja: 'jp',
    ko: 'kr',
    fr: 'fr',
    es: 'es',
    ru: 'ru',
    de: 'de',
    it: 'it',
    tr: 'tr',
    pt_pt: 'pt',
    pt_br: 'br',
    vi: 'vn',
    id: 'id',
    th: 'th',
    ms: 'ms',
    ar: 'ae',
    hi: 'in',
    km: 'kh',
    mn_cy: 'mn',
    nb_no: 'no',
    nn_no: 'no',
    fa: 'ir',
    sv: 'se',
    pl: 'pl',
    nl: 'nl',
    uk: 'ua',
    he: 'il',
    // app UI languages without translation targets
    ta: 'in',
    tk: 'tm',
};

type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * Label for a language code. Falls back to the raw code when no translation
 * exists (e.g. a code from an older config) and renders nothing at all for
 * unset values, so dropdown triggers can never show "languages.undefined".
 */
export const languageLabel = (t: Translate, code: string | null | undefined): string => {
    if (typeof code !== 'string' || code.length === 0) {
        return '';
    }
    return t(`languages.${code}`, { defaultValue: code });
};
