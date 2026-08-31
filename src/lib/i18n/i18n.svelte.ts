import i18next from 'i18next';

/**
 * i18next with per-locale lazy loading: only `en` plus the current language
 * are ever parsed, instead of the legacy static import of all 21 locales.
 * Bundle keys use the config language codes ('zh_cn', 'pt_pt', …) so stored
 * configs and fallback chains stay compatible.
 */

export const APP_LANGUAGES = {
    en: 'English',
    zh_cn: '简体中文',
    zh_tw: '繁體中文',
    ja: '日本語',
    ko: '한국어',
    fr: 'Français',
    es: 'Español',
    ru: 'Русский',
    de: 'Deutsch',
    it: 'Italiano',
    tr: 'Türkçe',
    pt_pt: 'Português',
    pt_br: 'Português (Brasil)',
    nb_no: 'Norsk Bokmål',
    nn_no: 'Norsk Nynorsk',
    fa: 'فارسی',
    uk: 'Українська',
    ar: 'العربية',
    he: 'עִבְרִית',
    ta: 'தமிழ்',
    tk: 'Türkmen',
} as const;

export type AppLanguage = keyof typeof APP_LANGUAGES;

const LOCALE_FILES: Record<AppLanguage, string> = {
    en: 'en_US',
    zh_cn: 'zh_CN',
    zh_tw: 'zh_TW',
    ja: 'ja_JP',
    ko: 'ko_KR',
    fr: 'fr_FR',
    es: 'es_ES',
    ru: 'ru_RU',
    de: 'de_DE',
    it: 'it_IT',
    tr: 'tr_TR',
    pt_pt: 'pt_PT',
    pt_br: 'pt_BR',
    nb_no: 'nb_NO',
    nn_no: 'nn_NO',
    fa: 'fa_IR',
    uk: 'uk_UA',
    ar: 'ar_AE',
    he: 'he_IL',
    ta: 'ta_IN',
    tk: 'tk_TM',
};

const FALLBACK_CHAINS = {
    zh_tw: ['zh_cn'],
    zh_cn: ['zh_tw'],
    pt_pt: ['pt_br'],
    pt_br: ['pt_pt'],
    nb_no: ['nn_no'],
    nn_no: ['nb_no'],
    default: ['en'],
} as const;

// Deliberately non-reactive bookkeeping.
// eslint-disable-next-line svelte/prefer-svelte-reactivity
const loaded = new Set<string>();

export const i18nState = $state({
    language: 'en' as string,
    ready: false,
});

export async function loadLanguage(language: string): Promise<void> {
    if (loaded.has(language)) {
        return;
    }
    const file = LOCALE_FILES[language as AppLanguage];
    if (!file) {
        return;
    }
    const mod = await import(`./locales/${file}.json`);
    // The locale files keep the legacy i18next shape `{ translation: {...} }`
    // — unwrap the namespace before registering it.
    const payload = (mod.default as Record<string, unknown>) ?? {};
    const bundle = 'translation' in payload ? (payload['translation'] as object) : payload;
    i18next.addResourceBundle(language, 'translation', bundle, true, true);
    loaded.add(language);
}

export async function initI18n(language: string): Promise<void> {
    await i18next.init({
        lng: language,
        fallbackLng: FALLBACK_CHAINS,
        debug: false,
        interpolation: { escapeValue: false },
        returnEmptyString: false,
        resources: {},
    });
    // The fallback language must exist before anything renders, otherwise
    // missing keys render as raw keys in every locale.
    await loadLanguage('en');
    if (language !== 'en') {
        await loadLanguage(language);
    }
    i18nState.language = language;
    i18nState.ready = true;
}

export async function changeAppLanguage(language: string): Promise<void> {
    await loadLanguage(language);
    await i18next.changeLanguage(language);
    i18nState.language = language;
}

/**
 * Reactive translator. Reading `i18nState.language` inside the template
 * expression registers the dependency, so every `t()` call site re-renders
 * when the language changes.
 */
export function t(key: string, options?: Record<string, unknown>): string {
    void i18nState.language;
    return String(i18next.t(key, options ?? {}));
}
