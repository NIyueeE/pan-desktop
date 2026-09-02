import { describe, expect, it } from 'vitest';

import { buildSpeechRequest } from './openai';

describe('buildSpeechRequest', () => {
    it('defaults path, model and voice; sends the text as input', () => {
        const { url, headers, body } = buildSpeechRequest({ apiKey: 'sk-test' }, '你好');
        expect(url).toBe('https://api.openai.com/v1/audio/speech');
        expect(headers.Authorization).toBe('Bearer sk-test');
        expect(headers['Content-Type']).toBe('application/json');
        expect(body).toEqual({ model: 'tts-1', voice: 'alloy', input: '你好', response_format: 'mp3' });
    });

    it('honours overrides and trims whitespace', () => {
        const { url, body } = buildSpeechRequest(
            {
                requestPath: 'https://relay.example/v1/audio/speech/',
                apiKey: 'k',
                model: ' tts-1-hd ',
                voice: ' nova ',
            },
            'hi'
        );
        expect(url).toBe('https://relay.example/v1/audio/speech');
        expect(body).toEqual({ model: 'tts-1-hd', voice: 'nova', input: 'hi', response_format: 'mp3' });
    });
});
