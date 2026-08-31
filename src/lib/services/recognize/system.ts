import { invoke } from '@tauri-apps/api/core';
import { appEnv } from '../../utils/env.svelte';
import detect from '../../utils/lang_detect';
import type { RecognizeRequestOptions } from '../types';

export const info = { name: 'system', icon: 'system' };

export const Language: Record<string, string> = {
    auto: 'auto',
    zh_cn: 'zh_cn',
    zh_tw: 'zh_tw',
    en: 'en',
    ja: 'ja',
    ko: 'ko',
    fr: 'fr',
    es: 'es',
    ru: 'ru',
    de: 'de',
    it: 'it',
    tr: 'tr',
    pt_pt: 'pt_pt',
    pt_br: 'pt_br',
    vi: 'vi',
    id: 'id',
    th: 'th',
    ms: 'ms',
    ar: 'ara',
    hi: 'hi',
    uk: 'uk',
    he: 'he',
};

const linuxLangMap: Record<string, string> = {
    auto: 'auto',
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

const windowsLangMap: Record<string, string> = {
    auto: 'auto',
    zh_cn: 'zh-CN',
    zh_tw: 'zh-TW',
    en: 'en-US',
    yue: 'zh-HK',
    ja: 'ja-JP',
    ko: 'ko-KR',
    fr: 'fr-FR',
    es: 'es-ES',
    ru: 'ru-RU',
    de: 'de-DE',
    it: 'it-IT',
    tr: 'tr-TR',
    pt_pt: 'pt-PT',
    pt_br: 'pt-BR',
    vi: 'vi-VN',
    id: 'id-ID',
    th: 'th-TH',
    ms: 'ms-MY',
    ar: 'ar-SA',
    hi: 'hi-IN',
    uk: 'uk-UA',
    he: 'he-IL',
};

const macOSLangMap: Record<string, string> = {
    auto: 'auto',
    zh_cn: 'zh-Hans',
    zh_tw: 'zh-Hant',
    en: 'en-US',
    yue: 'zh-Hans',
    ja: 'ja-JP',
    ko: 'ko-KR',
    fr: 'fr-FR',
    es: 'es-ES',
    ru: 'ru-RU',
    de: 'de-DE',
    it: 'it-IT',
    tr: 'tr-TR',
    pt_pt: 'pt-PT',
    pt_br: 'pt-BR',
    vi: 'vi-VN',
    id: 'id-ID',
    th: 'th-TH',
    ms: 'ms-MY',
    ar: 'ar-SA',
    hi: 'hi-IN',
    uk: 'uk-UA',
    he: 'he-IL',
};

/** CJK OCR results carry spurious spaces; strip them for CJK languages. */
function isCjkLanguage(language: string): boolean {
    return language === 'zh_cn' || language === 'zh_tw' || language === 'ja';
}

export async function recognize(_base64: string, language: string, _options?: RecognizeRequestOptions): Promise<string> {
    switch (appEnv.osType) {
        case 'Linux': {
            let result = await invoke<string>('system_ocr', { lang: linuxLangMap[language] ?? 'auto' });
            if ((language === 'auto' && (await detect(result)) === 'zh_cn') || isCjkLanguage(language)) {
                result = result.replaceAll(' ', '');
            }
            return result.trim();
        }
        case 'Darwin': {
            const result = await invoke<string>('system_ocr', { lang: macOSLangMap[language] ?? 'auto' });
            return result.trim();
        }
        case 'Windows_NT': {
            let result = await invoke<string>('system_ocr', { lang: windowsLangMap[language] ?? 'auto' });
            if ((language === 'auto' && (await detect(result)) === 'zh_cn') || isCjkLanguage(language)) {
                result = result.replaceAll(' ', '');
            }
            return result.trim();
        }
        default: {
            throw new Error(`System OCR is not available on ${appEnv.osType || 'this platform'}`);
        }
    }
}
