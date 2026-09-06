import { describe, expect, it, vi } from 'vitest';

import {
    DEFAULT_PROMPT_LIST,
    buildTranslateMessages,
    createSseDeltaParser,
    Language,
    stallGuard,
    translate,
} from './openai';

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/plugin-http', () => ({ fetch: fetchMock }));

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

describe('translate — missing api key', () => {
    it('rejects immediately on a public endpoint without any request', async () => {
        fetchMock.mockImplementation(() => new Promise(() => {}));

        await expect(
            translate('Hello', Language.auto, Language.zh_cn, { config: { model: 'gpt-4o-mini' } })
        ).rejects.toThrow('API key is not configured');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('still sends the request for keyless local endpoints', async () => {
        fetchMock.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ choices: [{ message: { content: '"你好"' } }] }),
        });

        await expect(
            translate('Hello', Language.auto, Language.zh_cn, {
                config: { requestPath: 'http://127.0.0.1:11434/v1/chat/completions', model: 'llama3' },
            })
        ).resolves.toBe('你好');
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('sends the request for private-range keyless endpoints', async () => {
        fetchMock.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ choices: [{ message: { content: 'bonjour' } }] }),
        });

        await expect(
            translate('Hello', Language.auto, Language.fr, {
                config: { requestPath: 'http://192.168.1.20:11434/v1/chat/completions', model: 'llama3' },
            })
        ).resolves.toBe('bonjour');
    });
});

describe('stallGuard', () => {
    it('rejects with the given message and aborts the controller at the deadline', async () => {
        vi.useFakeTimers();
        try {
            const controller = new AbortController();
            const guard = stallGuard(controller, 60_000, 'Response timed out');
            const outcome = guard.promise.then(
                () => 'resolved' as const,
                (e: unknown) => `rejected:${(e as Error).message}`
            );

            await vi.advanceTimersByTimeAsync(59_999);
            expect(controller.signal.aborted).toBe(false);

            await vi.advanceTimersByTimeAsync(1);
            expect(await outcome).toBe('rejected:Response timed out');
            expect(controller.signal.aborted).toBe(true);
        } finally {
            vi.useRealTimers();
        }
    });

    it('never settles when cancelled before the deadline', async () => {
        vi.useFakeTimers();
        try {
            const controller = new AbortController();
            const guard = stallGuard(controller, 60_000, 'Response timed out');
            let settled = false;
            void guard.promise.then(
                () => (settled = true),
                () => (settled = true)
            );
            guard.cancel();
            await vi.advanceTimersByTimeAsync(120_000);
            expect(settled).toBe(false);
            expect(controller.signal.aborted).toBe(false);
        } finally {
            vi.useRealTimers();
        }
    });
});
