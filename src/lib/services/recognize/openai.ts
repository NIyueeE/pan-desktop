import { fetch } from '@tauri-apps/plugin-http';

import type { RecognizeRequestOptions } from '../types';
import type { ServiceInstanceConfig } from '../../utils/service_instance';
import { resolveChatCompletionsUrl } from '../openai_url';

export const info = { name: 'openai', icon: 'logo/openai.svg' };

export const DEFAULT_OCR_PROMPT =
    'You are a professional OCR engine. Extract ALL text from the image exactly as it is written, ' +
    'preserving the original reading order. Output ONLY the extracted text without any commentary. ' +
    'If the image contains no text, output an empty string. Target language: $lang.';

export interface OpenAiOcrConfig extends ServiceInstanceConfig {
    requestPath?: string;
    model?: string;
    apiKey?: string;
    prompt?: string;
}

// Human-readable language names injected into the OCR prompt via `$lang`
// (empty for `auto` = "detect it yourself").
export const Language: Record<string, string> = {
    auto: '',
    zh_cn: 'Simplified Chinese',
    zh_tw: 'Traditional Chinese',
    en: 'English',
    yue: 'Cantonese',
    ja: 'Japanese',
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

/** Pure request builder (unit tested): Chat Completions payload with one
 * image_url content part carrying the screenshot as a data URL. */
export function buildOcrRequest(config: OpenAiOcrConfig | undefined, base64: string, languageName: string) {
    const prompt = String(config?.prompt ?? '').trim() || DEFAULT_OCR_PROMPT;
    const langHint = languageName || 'any language (detect it automatically)';
    return {
        url: resolveChatCompletionsUrl(config?.requestPath ?? ''),
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config?.apiKey ?? ''}`,
        },
        body: {
            model: config?.model,
            stream: false,
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: prompt.replaceAll('$lang', langHint),
                        },
                        {
                            type: 'image_url',
                            image_url: {
                                url: `data:image/png;base64,${base64}`,
                            },
                        },
                    ],
                },
            ],
        },
    };
}

export async function recognize(base64: string, language: string, options?: RecognizeRequestOptions): Promise<string> {
    const config = (options?.config ?? {}) as OpenAiOcrConfig;
    const { url, headers, body } = buildOcrRequest(config, base64, Language[language] ?? language ?? '');

    const res = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`OpenAI OCR failed with ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`);
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string') {
        throw new Error('Malformed response from OpenAI-compatible OCR endpoint');
    }
    return text.trim();
}
