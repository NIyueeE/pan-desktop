import { describe, expect, it, vi } from 'vitest';

import { speak, speechLang } from './system';

describe('speechLang', () => {
    it('maps our codes to BCP-47 tags', () => {
        expect(speechLang('en')).toBe('en-US');
        expect(speechLang('zh_cn')).toBe('zh-CN');
        expect(speechLang('pt_br')).toBe('pt-BR');
        expect(speechLang('nb_no')).toBe('nb-NO');
    });

    it('passes bare detector codes through, empty becomes en-US', () => {
        expect(speechLang('zh')).toBe('zh');
        expect(speechLang('xx')).toBe('xx');
        expect(speechLang('')).toBe('en-US');
    });
});

describe('speak (system voices)', () => {
    function stubSpeech(): { speak: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn> } {
        const speakFn = vi.fn();
        const cancelFn = vi.fn();
        vi.stubGlobal(
            'speechSynthesis',
            Object.defineProperties(
                {},
                {
                    speak: { value: speakFn },
                    cancel: { value: cancelFn },
                }
            ) as SpeechSynthesis
        );
        vi.stubGlobal(
            'SpeechSynthesisUtterance',
            class {
                lang = '';
                text = '';
                onend: (() => void) | null = null;
                onerror: ((event: { error: string }) => void) | null = null;
                constructor(text: string) {
                    this.text = text;
                }
            }
        );
        return { speak: speakFn, cancel: cancelFn };
    }

    it('cancels the queue and speaks with the mapped language', async () => {
        const synth = stubSpeech();
        const promise = speak('hello', 'zh_cn');
        expect(synth.cancel).toHaveBeenCalled();
        expect(synth.speak).toHaveBeenCalled();
        const utterance = synth.speak.mock.calls[0]?.[0] as unknown as { lang: string; onend?: () => void };
        expect(utterance.lang).toBe('zh-CN');
        utterance.onend?.();
        await expect(promise).resolves.toBeUndefined();
        vi.unstubAllGlobals();
    });

    it('rejects when synthesis is unavailable', async () => {
        vi.stubGlobal('speechSynthesis', undefined);
        await expect(speak('hello', 'en')).rejects.toThrow('Speech synthesis is not available');
        vi.unstubAllGlobals();
    });
});
