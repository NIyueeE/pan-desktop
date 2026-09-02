import { fetch } from '@tauri-apps/plugin-http';

import type { ServiceInfo, TtsRequestOptions } from '../types';

export const info: ServiceInfo = { name: 'openai', icon: '' };

export interface OpenAiTtsConfig {
    [key: string]: unknown;
    requestPath?: string;
    apiKey?: string;
    model?: string;
    voice?: string;
}

const DEFAULT_REQUEST_PATH = 'https://api.openai.com/v1/audio/speech';
const DEFAULT_MODEL = 'tts-1';
const DEFAULT_VOICE = 'alloy';

export function buildSpeechRequest(
    config: OpenAiTtsConfig,
    text: string
): { url: string; headers: Record<string, string>; body: Record<string, unknown> } {
    const url = ((config.requestPath ?? '').trim() || DEFAULT_REQUEST_PATH).replace(/\/+$/, '');
    return {
        url,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey ?? ''}`,
        },
        body: {
            model: config.model?.trim() || DEFAULT_MODEL,
            voice: config.voice?.trim() || DEFAULT_VOICE,
            input: text,
            response_format: 'mp3',
        },
    };
}

/** Speak through an OpenAI-compatible `/v1/audio/speech` endpoint. The voice
 * carries the language, so the spoken language parameter is unused here. */
export async function speak(text: string, _language: string, options: TtsRequestOptions): Promise<void> {
    const { url, headers, body } = buildSpeechRequest((options.config ?? {}) as OpenAiTtsConfig, text);
    const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        throw new Error(`TTS API error: ${response.status}`);
    }
    const blob = await response.blob();
    await new Promise<void>((resolve, reject) => {
        const audioUrl = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl);
        audio.onended = () => {
            URL.revokeObjectURL(audioUrl);
            resolve();
        };
        audio.onerror = () => {
            URL.revokeObjectURL(audioUrl);
            reject(new Error('Failed to play TTS audio'));
        };
        void audio.play().catch((e: unknown) => {
            URL.revokeObjectURL(audioUrl);
            reject(e instanceof Error ? e : new Error(String(e)));
        });
    });
}
