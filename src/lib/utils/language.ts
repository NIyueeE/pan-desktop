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
