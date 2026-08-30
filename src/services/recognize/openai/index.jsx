import { fetch } from '@tauri-apps/plugin-http';
import { Language } from './info';

export const DEFAULT_OCR_PROMPT =
    'You are a professional OCR engine. Extract ALL text from the image exactly as it is written, ' +
    'preserving the original reading order. Output ONLY the extracted text without any commentary. ' +
    'If the image contains no text, output an empty string. Target language: $lang.';

// Resolves the Chat Completions endpoint from a user supplied request path:
// bare domains and /v1 roots are completed, full /chat/completions URLs pass
// through. Identical rules to the translate service so users can reuse the
// same endpoint string.
export function resolveChatCompletionsUrl(requestPath) {
    let raw = String(requestPath ?? '').trim();
    if (!/https?:\/\/.+/.test(raw)) {
        raw = `https://${raw}`;
    }
    const apiUrl = new URL(raw);
    let pathname = apiUrl.pathname.replace(/\/+$/, '');
    if (!pathname.endsWith('/chat/completions')) {
        pathname = pathname.endsWith('/v1') ? `${pathname}/chat/completions` : `${pathname}/v1/chat/completions`;
    }
    apiUrl.pathname = pathname;
    return apiUrl.href;
}

// Pure request builder (unit tested): OpenAI Chat Completions payload with one
// image_url content part carrying the screenshot as a data URL.
export function buildOcrRequest(config, base64, languageName) {
    const prompt = String(config?.prompt ?? '').trim() || DEFAULT_OCR_PROMPT;
    const langHint = languageName || 'any language (detect it automatically)';
    return {
        url: resolveChatCompletionsUrl(config?.requestPath),
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

export async function recognize(base64, language, options) {
    const { config } = options ?? {};
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
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string') {
        throw new Error('Malformed response from OpenAI-compatible OCR endpoint');
    }
    return text.trim();
}

export * from './Config';
export * from './info';
