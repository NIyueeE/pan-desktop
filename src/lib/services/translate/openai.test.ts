import { describe, expect, it } from 'vitest';

import { DEFAULT_PROMPT_LIST, buildTranslateMessages, createSseDeltaParser, Language } from './openai';

describe('buildTranslateMessages', () => {
    it('substitutes $text/$from/$to/$detect placeholders', () => {
        const messages = buildTranslateMessages(
            [
                { role: 'system', content: 'Translate $text from $from to $to. Detected: $detect' },
                { role: 'user', content: '$text' },
            ],
            'Hello',
            Language.en,
            Language.zh_cn,
            'en'
        );
        expect(messages).toEqual([
            { role: 'system', content: 'Translate Hello from English to Simplified Chinese. Detected: English' },
            { role: 'user', content: 'Hello' },
        ]);
    });

    it('falls back to a readable hint for unknown detected languages', () => {
        const messages = buildTranslateMessages(DEFAULT_PROMPT_LIST, 'Hi', Language.auto, Language.en, 'xx');
        expect(messages[1]?.content ?? '').toContain('Translate into English');
    });
});

describe('createSseDeltaParser', () => {
    it('accumulates deltas from complete data lines', () => {
        const deltas: string[] = [];
        const parser = createSseDeltaParser((d) => deltas.push(d));
        parser('data: {"choices":[{"delta":{"content":"Hel"}}]}\n');
        parser('data: {"choices":[{"delta":{"content":"lo"}}]}\n');
        parser('data: [DONE]\n');
        expect(deltas).toEqual(['Hel', 'lo']);
    });

    it('buffers a partial line across chunk boundaries', () => {
        const deltas: string[] = [];
        const parser = createSseDeltaParser((d) => deltas.push(d));
        parser('data: {"choices":[{"del');
        parser('ta":{"content":"Hi"}}]}\n');
        expect(deltas).toEqual(['Hi']);
    });

    it('skips malformed lines and keep-alives instead of throwing', () => {
        const deltas: string[] = [];
        const parser = createSseDeltaParser((d) => deltas.push(d));
        parser(': keep-alive\n');
        parser('data: not-json\n');
        parser('data: {"choices":[{"delta":{"content":"ok"}}]}\n');
        expect(deltas).toEqual(['ok']);
    });

    it('ignores delta frames without content', () => {
        const deltas: string[] = [];
        const parser = createSseDeltaParser((d) => deltas.push(d));
        parser('data: {"choices":[{"delta":{}}]}\n');
        expect(deltas).toEqual([]);
    });
});
