import { fetch } from '@tauri-apps/plugin-http';

import type { TranslateRequestOptions } from '../types';
import type { ServiceInstanceConfig } from '../../utils/service_instance';
import { resolveChatCompletionsUrl } from '../openai_url';

export const info = { name: 'openai', icon: 'logo/openai.svg' };

/** Human-readable language names injected into prompts via `$from`/`$to`. */
export const Language: Record<string, string> = {
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
};

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
    const detectName = (detect && Language[detect]) || 'unknown language';
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

export async function translate(text: string, from: string, to: string, options: TranslateRequestOptions): Promise<string> {
    const { detect, setResult } = options;
    const config = options.config as OpenAiTranslateConfig;

    const url = resolveChatCompletionsUrl(config.requestPath ?? '');
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

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey ?? ''}`,
        },
        body: JSON.stringify(body),
    });

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
                const { done, value } = await reader.read();
                if (done) {
                    break;
                }
                consume(decoder.decode(value, { stream: true }));
            }
        } finally {
            reader.releaseLock();
        }
        return target.trim();
    }

    const result = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = result?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.trim() === '') {
        throw new Error(JSON.stringify(result));
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
