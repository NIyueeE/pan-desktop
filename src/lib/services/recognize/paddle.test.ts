// Vitest suite for the local PaddleOCR service wrapper.
import { describe, expect, it } from 'vitest';

import { invokeCalls, setInvokeHandler } from '../../../test/tauri-state';
import { initEnv } from '../../utils/env.svelte';

import * as paddle from './paddle';

describe('paddle recognize service', () => {
    it('invokes the paddle_ocr command and trims the result', async () => {
        await initEnv();
        setInvokeHandler('paddle_ocr', () => '  recognized text  ');
        const out = await paddle.recognize('aGVsbG8=', 'en');
        expect(out).toBe('recognized text');
    });

    it('strips CJK spurious spaces for a CJK recognition language', async () => {
        await initEnv();
        setInvokeHandler('paddle_ocr', () => '你 好 世 界');
        expect(await paddle.recognize('aGVsbG8=', 'zh_cn')).toBe('你好世界');
        expect(await paddle.recognize('aGVsbG8=', 'ja')).toBe('你好世界');
    });

    it('keeps spaces for latin results under the auto language', async () => {
        await initEnv();
        setInvokeHandler('paddle_ocr', () => 'plain english text');
        expect(await paddle.recognize('aGVsbG8=', 'auto')).toBe('plain english text');
    });

    it('maps every built-in recognize language key so the runner accepts the instance', async () => {
        // The translate-window OCR runner requires `recognizeLanguage in
        // service.Language` — the map must at least cover the system map's
        // keys, including `auto`.
        for (const key of [
            'auto',
            'zh_cn',
            'zh_tw',
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
            'uk',
            'he',
        ]) {
            expect(key in paddle.Language, `missing language key: ${key}`).toBe(true);
        }
    });

    it('surfaces backend failures so the chain degrades to the next engine', async () => {
        await initEnv();
        setInvokeHandler('paddle_ocr', () => {
            throw new Error('PaddleOCR runtime library not found');
        });
        await expect(paddle.recognize('aGVsbG8=', 'auto')).rejects.toThrow('runtime library');
    });

    it('forwards the configured language through the tauri invoke bridge', async () => {
        await initEnv();
        setInvokeHandler('paddle_ocr', () => 'x');
        invokeCalls.length = 0;
        await paddle.recognize('aGVsbG8=', 'zh_tw');
        expect(invokeCalls.at(-1)).toEqual(['paddle_ocr', { lang: 'zh' }]);
    });
});
