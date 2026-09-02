import type { ServiceInfo } from '../types';

export const info: ServiceInfo = { name: 'system', icon: '' };

/** Our language codes → BCP-47 tags for the platform voice picker. */
const BCP47: Record<string, string> = {
    en: 'en-US',
    zh_cn: 'zh-CN',
    zh_tw: 'zh-TW',
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
    fa: 'fa-IR',
    sv: 'sv-SE',
    pl: 'pl-PL',
    nl: 'nl-NL',
    uk: 'uk-UA',
    he: 'he-IL',
    nb_no: 'nb-NO',
    nn_no: 'nn-NO',
};

/** Best-effort BCP-47 tag: known codes map directly, bare/unknown codes
 * (including the local detector's 'zh'-style output) pass through as-is. */
export function speechLang(language: string): string {
    const key = language.trim().toLowerCase();
    const mapped = BCP47[key];
    if (mapped !== undefined) {
        return mapped;
    }
    return key === '' ? 'en-US' : key;
}

export function speak(text: string, language: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const synth = window.speechSynthesis;
        if (synth === undefined) {
            // WebKitGTK without speech-dispatcher, kioslaves, etc.
            reject(new Error('Speech synthesis is not available'));
            return;
        }
        synth.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = speechLang(language);
        utterance.onend = () => resolve();
        utterance.onerror = (event) => reject(new Error(`Speech synthesis failed: ${event.error}`));
        synth.speak(utterance);
    });
}
