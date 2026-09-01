// Regression net for the first-run display-language detection: system
// locales (BCP-47 tags) must map onto the supported APP_LANGUAGES codes.
import { describe, expect, it } from 'vitest';

import { matchAppLanguage } from './i18n.svelte';

describe('matchAppLanguage', () => {
    it('maps chinese locales by script/region', () => {
        expect(matchAppLanguage('zh-CN')).toBe('zh_cn');
        expect(matchAppLanguage('zh')).toBe('zh_cn');
        expect(matchAppLanguage('zh_SG')).toBe('zh_cn');
        expect(matchAppLanguage('zh-Hans')).toBe('zh_cn');
        expect(matchAppLanguage('zh-TW')).toBe('zh_tw');
        expect(matchAppLanguage('zh_HK')).toBe('zh_tw');
        expect(matchAppLanguage('zh-MO')).toBe('zh_tw');
        expect(matchAppLanguage('zh-Hant')).toBe('zh_tw');
    });

    it('splits portuguese and norwegian variants', () => {
        expect(matchAppLanguage('pt-BR')).toBe('pt_br');
        expect(matchAppLanguage('pt')).toBe('pt_pt');
        expect(matchAppLanguage('pt-PT')).toBe('pt_pt');
        expect(matchAppLanguage('nb-NO')).toBe('nb_no');
        expect(matchAppLanguage('nn')).toBe('nn_no');
        // The macB-approved `no` macrolanguage lands on bokmål.
        expect(matchAppLanguage('no')).toBe('nb_no');
    });

    it('maps exact primary-subtag languages regardless of region', () => {
        expect(matchAppLanguage('en-US')).toBe('en');
        expect(matchAppLanguage('en_GB')).toBe('en');
        expect(matchAppLanguage('ja-JP')).toBe('ja');
        expect(matchAppLanguage('fr')).toBe('fr');
        expect(matchAppLanguage('uk-UA')).toBe('uk');
        expect(matchAppLanguage('fa-IR')).toBe('fa');
        expect(matchAppLanguage('he-IL')).toBe('he');
        expect(matchAppLanguage('tk-TM')).toBe('tk');
    });

    it('is case-insensitive and tolerates both separators', () => {
        expect(matchAppLanguage('ZH-cn')).toBe('zh_cn');
        expect(matchAppLanguage('FR_fr')).toBe('fr');
    });

    it('falls back to english for null, empty, and unknown locales', () => {
        expect(matchAppLanguage(null)).toBe('en');
        expect(matchAppLanguage('')).toBe('en');
        expect(matchAppLanguage('  ')).toBe('en');
        expect(matchAppLanguage('xx-YY')).toBe('en');
    });
});
