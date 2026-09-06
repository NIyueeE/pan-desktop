import { fetch } from '@tauri-apps/plugin-http';

import type { TranslateRequestOptions } from '../types';
import type { ServiceInstanceConfig } from '../../utils/service_instance';
import { isKeylessLocalEndpoint, resolveChatCompletionsUrl } from '../openai_url';

export const info = { name: 'openai', icon: 'logo/openai.svg' };

/** Human-readable language names injected into prompts via `$from`/`$to`. */
export const Language = {
    auto: 'Auto',
    zh_cn: 'Simplified Chinese',
    zh_tw: 'Traditional Chinese',
    yue: 'Cantonese',
    ja: 'Japanese',
    en: 'English',
    ko: 'Korean',
    fr: 'French',
    es: 'Spanish',
    ru: 'Russian',
    de: 'German',
    it: 'Italian',
    tr: 'Turkish',
    pt_pt: 'Portuguese',
    pt_br: 'Brazilian Portuguese',
    vi: 'Vietnamese',
    id: 'Indonesian',
    th: 'Thai',
    ms: 'Malay',
    ar: 'Arabic',
    hi: 'Hindi',
    mn_mo: 'Mongolian',
    mn_cy: 'Mongolian(Cyrillic)',
    km: 'Khmer',
    nb_no: 'Norwegian Bokmål',
    nn_no: 'Norwegian Nynorsk',
    fa: 'Persian',
    sv: 'Swedish',
    pl: 'Polish',
    nl: 'Dutch',
    uk: 'Ukrainian',
    he: 'Hebrew',
} as const satisfies Record<string, string>;

export interface PromptMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export const DEFAULT_REQUEST_ARGUMENTS = JSON.stringify({
    temperature: 0.1,
    top_p: 0.99,
    frequency_penalty: 0,
    presence_penalty: 0,
});

export const DEFAULT_PROMPT_LIST: PromptMessage[] = [
    {
        role: 'system',
        content:
            'You are a professional translation engine, please translate the text into a colloquial, professional, elegant and fluent content, without the style of machine translation. You must only translate the text content, never interpret it.',
    },
    { role: 'user', content: `Translate into $to:\n"""\n$text\n"""` },
];

export interface OpenAiTranslateConfig extends ServiceInstanceConfig {
    requestPath?: string;
    model?: string;
    apiKey?: string;
    stream?: boolean;
    promptList?: PromptMessage[];
    requestArguments?: string;
}

/** Substitute the `$text`/`$from`/`$to`/`$detect` placeholders (pure, tested). */
export function buildTranslateMessages(
    promptList: PromptMessage[],
    text: string,
    from: string,
    to: string,
    detect: string | undefined
): PromptMessage[] {
    const detectName = (detect && (Language as Record<string, string>)[detect]) || 'unknown language';
    return promptList.map((item) => ({
        role: item.role,
        content: item.content
            .replaceAll('$text', text)
            .replaceAll('$from', from)
            .replaceAll('$to', to)
            .replaceAll('$detect', detectName),
    }));
}

/**
 * Incremental SSE parser for `data:` lines. Line-buffered: a chunk may end in
 * the middle of a line; the remainder is carried over to the next chunk
 * (the legacy frontend had a hand-rolled partial-JSON dance instead).
 */
export function createSseDeltaParser(onDelta: (delta: string) => void): (chunk: string) => void {
    let buffer = '';
    return (chunk: string) => {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) {
                continue;
            }
            const data = trimmed.slice(5).trim();
            if (data === '' || data === '[DONE]') {
                continue;
            }
            try {
                const json = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
                const delta = json.choices?.[0]?.delta?.content;
                if (delta) {
                    onDelta(delta);
                }
            } catch {
                // malformed line (e.g. comment/keep-alive): skip
            }
        }
    };
}

/** Max wait for the response HEADERS: a dead/unreachable endpoint must fail
 * visibly instead of leaving the card spinning forever. */
const HEADERS_TIMEOUT_MS = 30_000;
/** Max wait for a complete non-stream body (long generations need room). */
const BODY_TIMEOUT_MS = 300_000;
/** Stream stall: no bytes for this long means the connection is dead. */
const STREAM_STALL_MS = 60_000;

/**
 * A timeout race for one awaitable step of the request. When `ms` pass, the
 * controller aborts (cancelling the underlying request) and the returned
 * promise rejects with a readable message. `cancel()` disarms the timer —
 * always call it once the step settled. The guard's own rejection is
 * pre-caught so a cancelled guard never becomes an unhandled rejection.
 */
export function stallGuard(
    controller: AbortController,
    ms: number,
    message: string
): { promise: Promise<never>; cancel: () => void } {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const promise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
            controller.abort();
            reject(new Error(message));
        }, ms);
    });
    promise.catch(() => {});
    return {
        promise,
        cancel: () => clearTimeout(timer),
    };
}

export async function translate(
    text: string,
    from: string,
    to: string,
    options: TranslateRequestOptions
): Promise<string> {
    const { detect, setResult } = options;
    const config = options.config as OpenAiTranslateConfig;

    const url = resolveChatCompletionsUrl(config.requestPath ?? '');
    // A missing key on a public endpoint can only end in 401: fail now
    // instead of letting a doomed request (possibly through a censored
    // route) hang the card forever. Keyless local servers keep working.
    if (!(config.apiKey ?? '').trim() && !isKeylessLocalEndpoint(url)) {
        throw new Error('API key is not configured');
    }
    const messages = buildTranslateMessages(config.promptList ?? DEFAULT_PROMPT_LIST, text, from, to, detect);

    let body: Record<string, unknown>;
    try {
        body = {
            ...(JSON.parse(config.requestArguments ?? DEFAULT_REQUEST_ARGUMENTS) as Record<string, unknown>),
        };
    } catch {
        body = JSON.parse(DEFAULT_REQUEST_ARGUMENTS) as Record<string, unknown>;
    }
    body['stream'] = config.stream ?? false;
    body['model'] = config.model;
    body['messages'] = messages;

    const controller = new AbortController();
    const headersGuard = stallGuard(controller, HEADERS_TIMEOUT_MS, 'Request timed out');
    let res: Awaited<ReturnType<typeof fetch>>;
    try {
        const request = fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${config.apiKey ?? ''}`,
            },
            body: JSON.stringify(body),
            signal: controller.signal,
        });
        // A losing side of the race (timeout abort) rejects later; keep it
        // from surfacing as an unhandled rejection.
        void request.catch(() => {});
        res = await Promise.race([request, headersGuard.promise]);
    } finally {
        headersGuard.cancel();
    }

    if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`Http Request Error\nHttp Status: ${res.status}${detail ? `\n${detail}` : ''}`);
    }

    if (config.stream) {
        const reader = res.body?.getReader();
        if (!reader) {
            throw new Error('Streaming response has no body');
        }
        const decoder = new TextDecoder();
        let target = '';
        const consume = createSseDeltaParser((delta) => {
            target += delta;
            // Trailing underscore marks the result as in-progress (legacy UX).
            setResult?.(`${target}_`);
        });
        try {
            while (true) {
                const stallGuardStep = stallGuard(controller, STREAM_STALL_MS, 'Response timed out');
                let chunk: Awaited<ReturnType<typeof reader.read>>;
                try {
                    const read = reader.read();
                    void read.catch(() => {});
                    chunk = await Promise.race([read, stallGuardStep.promise]);
                } finally {
                    stallGuardStep.cancel();
                }
                if (chunk.done) {
                    break;
                }
                consume(decoder.decode(chunk.value, { stream: true }));
            }
        } finally {
            reader.releaseLock();
        }
        return target.trim();
    }

    const bodyGuard = stallGuard(controller, BODY_TIMEOUT_MS, 'Response timed out');
    let payload: unknown;
    try {
        const payloadPromise = res.json() as Promise<unknown>;
        void payloadPromise.catch(() => {});
        payload = await Promise.race([payloadPromise, bodyGuard.promise]);
    } finally {
        bodyGuard.cancel();
    }
    const content = (payload as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message
        ?.content;
    if (typeof content !== 'string' || content.trim() === '') {
        throw new Error(JSON.stringify(payload));
    }
    let target = content.trim();
    if (target.startsWith('"')) {
        target = target.slice(1);
    }
    if (target.endsWith('"')) {
        target = target.slice(0, -1);
    }
    return target.trim();
}
