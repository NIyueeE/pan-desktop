import { describe, expect, it } from 'vitest';

import { resolveChatCompletionsUrl } from './openai_url';

describe('resolveChatCompletionsUrl', () => {
    it('completes a bare domain to /v1/chat/completions', () => {
        expect(resolveChatCompletionsUrl('api.openai.com')).toBe('https://api.openai.com/v1/chat/completions');
    });

    it('completes a /v1 root', () => {
        expect(resolveChatCompletionsUrl('https://api.example.com/v1')).toBe(
            'https://api.example.com/v1/chat/completions'
        );
    });

    it('completes a bare domain with a path', () => {
        expect(resolveChatCompletionsUrl('api.example.com/api/v1')).toBe(
            'https://api.example.com/api/v1/chat/completions'
        );
    });

    it('passes a full /chat/completions URL through unchanged', () => {
        expect(resolveChatCompletionsUrl('https://gateway.example.com/my/endpoint/chat/completions')).toBe(
            'https://gateway.example.com/my/endpoint/chat/completions'
        );
    });

    it('prepends https:// when the scheme is missing', () => {
        expect(resolveChatCompletionsUrl('localhost:1234/v1')).toBe('https://localhost:1234/v1/chat/completions');
    });

    it('trims whitespace and trailing slashes first', () => {
        expect(resolveChatCompletionsUrl('  https://api.example.com/v1/  ')).toBe(
            'https://api.example.com/v1/chat/completions'
        );
    });

    it('keeps an explicit http scheme', () => {
        expect(resolveChatCompletionsUrl('http://ollama.local:11434/v1')).toBe(
            'http://ollama.local:11434/v1/chat/completions'
        );
    });
});
