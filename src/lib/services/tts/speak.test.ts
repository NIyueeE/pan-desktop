// Regression net for the speak chain: instances switched off in the service
// settings are skipped, failures fall through, and total failure rejects.
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fakeConfigFile } from '../../../test/tauri-state';
import { initConfigStore } from '../../config/store.svelte';
import { ttsServices } from '../index';
import type { TtsService } from '../types';
import { speakText } from './speak';

function spyTts(): {
    system: ReturnType<typeof vi.spyOn>;
    openai: ReturnType<typeof vi.spyOn>;
} {
    return {
        system: vi.spyOn(ttsServices.system as TtsService, 'speak'),
        openai: vi.spyOn(ttsServices.openai as TtsService, 'speak'),
    };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('speakText', () => {
    it('skips instances switched off via enable:false and falls through', async () => {
        const { system, openai } = spyTts();
        fakeConfigFile.set('tts_service_list', ['system@1', 'openai@1']);
        fakeConfigFile.set('system@1', { enable: false });
        await initConfigStore();

        // system is off: the chain must not even call it.
        openai.mockResolvedValue(undefined);
        await expect(speakText('hello', 'en')).resolves.toBeUndefined();
        expect(system).not.toHaveBeenCalled();
        expect(openai).toHaveBeenCalledTimes(1);
    });

    it('keeps calling enabled instances in priority order', async () => {
        const { system, openai } = spyTts();
        fakeConfigFile.set('tts_service_list', ['system@1', 'openai@1']);
        await initConfigStore();

        system.mockResolvedValue(undefined);
        await expect(speakText('hello', 'en')).resolves.toBeUndefined();
        expect(system).toHaveBeenCalledTimes(1);
        expect(openai).not.toHaveBeenCalled();
    });

    it('explicit enable:true is of course active too', async () => {
        const { system } = spyTts();
        fakeConfigFile.set('tts_service_list', ['system@1']);
        fakeConfigFile.set('system@1', { enable: true });
        await initConfigStore();

        system.mockResolvedValue(undefined);
        await expect(speakText('hello', 'en')).resolves.toBeUndefined();
        expect(system).toHaveBeenCalledTimes(1);
    });

    it('rejects when every enabled instance failed', async () => {
        const { openai } = spyTts();
        fakeConfigFile.set('tts_service_list', ['system@1', 'openai@1']);
        fakeConfigFile.set('system@1', { enable: false });
        await initConfigStore();

        openai.mockRejectedValue(new Error('no key'));
        await expect(speakText('hello', 'en')).rejects.toThrow('All TTS services failed');
    });
});
