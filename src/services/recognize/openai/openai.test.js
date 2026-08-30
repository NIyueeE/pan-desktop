/**
 * Unit tests for the OpenAI-compatible VLM OCR service (services/recognize/openai).
 *
 * Covers the pure request builder only — no network. The endpoint string must
 * follow the same completion rules as the translate service (bare domain or
 * /v1 root is completed to /chat/completions, full URLs pass through), and the
 * payload must carry the screenshot as an image_url data URL.
 */
import { describe, expect, it } from 'vitest';

import { DEFAULT_OCR_PROMPT, buildOcrRequest, resolveChatCompletionsUrl } from './index';

const BASE_CONFIG = {
    requestPath: 'https://api.example.com/v1',
    apiKey: 'sk-test',
    model: 'vision-model',
    prompt: '',
};

describe('resolveChatCompletionsUrl', () => {
    it.each([
        ['https://api.example.com', 'https://api.example.com/v1/chat/completions'],
        ['https://api.example.com/', 'https://api.example.com/v1/chat/completions'],
        ['https://api.example.com/v1', 'https://api.example.com/v1/chat/completions'],
        ['https://api.example.com/v1/', 'https://api.example.com/v1/chat/completions'],
        ['https://api.example.com/v1/chat/completions', 'https://api.example.com/v1/chat/completions'],
        ['api.example.com', 'https://api.example.com/v1/chat/completions'],
        ['https://gateway.local/api/v1', 'https://gateway.local/api/v1/chat/completions'],
    ])('completes %j to %j', (input, expected) => {
        expect(resolveChatCompletionsUrl(input)).toBe(expected);
    });
});

describe('buildOcrRequest', () => {
    it('builds a chat completions payload with the image as a data URL', () => {
        const request = buildOcrRequest(BASE_CONFIG, 'QUJD', 'English');
        expect(request.url).toBe('https://api.example.com/v1/chat/completions');
        expect(request.headers.Authorization).toBe('Bearer sk-test');
        expect(request.headers['Content-Type']).toBe('application/json');
        expect(request.body.model).toBe('vision-model');
        expect(request.body.stream).toBe(false);

        const [textPart, imagePart] = request.body.messages[0].content;
        expect(textPart.type).toBe('text');
        expect(imagePart.type).toBe('image_url');
        expect(imagePart.image_url.url).toBe('data:image/png;base64,QUJD');
    });

    it('replaces $lang with the resolved language name', () => {
        const config = { ...BASE_CONFIG, prompt: 'Extract $lang text' };
        const request = buildOcrRequest(config, 'QQ==', 'Japanese');
        expect(request.body.messages[0].content[0].text).toBe('Extract Japanese text');
    });

    it('falls back to the default prompt when none is configured', () => {
        for (const prompt of [undefined, '', '   ']) {
            const request = buildOcrRequest({ ...BASE_CONFIG, prompt }, 'QQ==', '');
            expect(request.body.messages[0].content[0].text).toBe(
                DEFAULT_OCR_PROMPT.replace('$lang', 'any language (detect it automatically)')
            );
        }
    });

    it('auto language maps to a detect hint', () => {
        const request = buildOcrRequest({ ...BASE_CONFIG, prompt: 'lang=$lang' }, 'QQ==', '');
        expect(request.body.messages[0].content[0].text).toBe('lang=any language (detect it automatically)');
    });
});
