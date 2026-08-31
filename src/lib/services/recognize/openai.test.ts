import { describe, expect, it } from 'vitest';

import { DEFAULT_OCR_PROMPT, buildOcrRequest, type OpenAiOcrConfig } from './openai';

describe('buildOcrRequest', () => {
    it('builds a Bearer-authenticated Chat Completions request with the image data URL', () => {
        const config: OpenAiOcrConfig = {
            requestPath: 'https://api.example.com/v1',
            apiKey: 'sk-test',
            model: 'gpt-4o-mini',
        };
        const request = buildOcrRequest(config, 'QUJD', 'English');

        expect(request.url).toBe('https://api.example.com/v1/chat/completions');
        expect(request.headers['Authorization']).toBe('Bearer sk-test');
        expect(request.headers['Content-Type']).toBe('application/json');
        expect(request.body.model).toBe('gpt-4o-mini');
        expect(request.body.stream).toBe(false);

        const content = request.body.messages[0]?.content;
        expect(content[0]?.type).toBe('text');
        expect(content[1]?.type).toBe('image_url');
        expect(content[1]?.image_url.url).toBe('data:image/png;base64,QUJD');
    });

    it('replaces the $lang placeholder with the language name', () => {
        const request = buildOcrRequest({ requestPath: 'https://api.example.com' }, 'QUJD', 'Japanese');
        const text = request.body.messages[0]?.content[0]?.text ?? '';
        expect(text).toContain('Target language: Japanese.');
    });

    it('falls back to the default prompt and an auto-detect hint', () => {
        const request = buildOcrRequest({}, 'QUJD', '');
        const text = request.body.messages[0]?.content[0]?.text ?? '';
        expect(text).toBe(DEFAULT_OCR_PROMPT.replaceAll('$lang', 'any language (detect it automatically)'));
    });

    it('uses a custom prompt when configured', () => {
        const request = buildOcrRequest({ prompt: 'Extract $lang text' }, 'QUJD', 'Korean');
        const text = request.body.messages[0]?.content[0]?.text ?? '';
        expect(text).toBe('Extract Korean text');
    });
});
