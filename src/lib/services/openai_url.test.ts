import { describe, expect, it } from 'vitest';

import { isKeylessLocalEndpoint, resolveChatCompletionsUrl } from './openai_url';

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

describe('isKeylessLocalEndpoint', () => {
    it('accepts loopback, .local and private-range hosts (the keyless case)', () => {
        expect(isKeylessLocalEndpoint('http://localhost:11434/v1/chat/completions')).toBe(true);
        expect(isKeylessLocalEndpoint('http://127.0.0.1:8080/api/v1/chat/completions')).toBe(true);
        expect(isKeylessLocalEndpoint('http://[::1]:11434/v1/chat/completions')).toBe(true);
        expect(isKeylessLocalEndpoint('http://mypc.local:11434/v1/chat/completions')).toBe(true);
        expect(isKeylessLocalEndpoint('http://10.0.0.5/v1/chat/completions')).toBe(true);
        expect(isKeylessLocalEndpoint('http://192.168.1.20:11434/v1/chat/completions')).toBe(true);
        expect(isKeylessLocalEndpoint('http://172.16.3.9/v1/chat/completions')).toBe(true);
        expect(isKeylessLocalEndpoint('http://172.31.255.1/v1/chat/completions')).toBe(true);
    });

    it('rejects public hosts (a missing key there is always an error)', () => {
        expect(isKeylessLocalEndpoint('https://api.openai.com/v1/chat/completions')).toBe(false);
        expect(isKeylessLocalEndpoint('https://api.deepseek.com/v1/chat/completions')).toBe(false);
        expect(isKeylessLocalEndpoint('https://example.com/api/v1/chat/completions')).toBe(false);
        expect(isKeylessLocalEndpoint('http://172.32.0.1/v1/chat/completions')).toBe(false);
        expect(isKeylessLocalEndpoint('http://11.0.0.1/v1/chat/completions')).toBe(false);
        expect(isKeylessLocalEndpoint('not a url')).toBe(false);
    });
});
