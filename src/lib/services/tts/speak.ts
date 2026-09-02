import { cfg, cfgRaw } from '../../config/store.svelte';
import {
    firstSuccessful,
    getServiceName,
    isInstanceEnabled,
    sanitizeServiceInstanceList,
    type ServiceInstanceConfig,
} from '../../utils/service_instance';
import { ttsServices } from '../index';

const BUILTIN_TTS_SERVICES = ['system', 'openai'];

/** Speak text through the TTS instance list in priority order: the first
 * instance that synthesizes (and plays) wins, failures fall through to the
 * next one. Instances switched off in the service settings (built-in
 * singletons toggle `enable` under their key) are skipped. Rejects only when
 * every instance failed — callers decide how visible to make the failure. */
export async function speakText(text: string, language: string): Promise<void> {
    const trimmed = text.trim();
    if (trimmed === '') {
        return;
    }
    const instances = sanitizeServiceInstanceList(cfg('tts_service_list'), BUILTIN_TTS_SERVICES, BUILTIN_TTS_SERVICES);
    const succeeded = await firstSuccessful(instances, async (instance) => {
        if (!isInstanceEnabled(instance)) {
            return undefined;
        }
        const service = ttsServices[getServiceName(instance) as keyof typeof ttsServices];
        if (service === undefined) {
            return undefined;
        }
        const config = (cfgRaw(instance) as ServiceInstanceConfig | undefined) ?? {};
        await service.speak(trimmed, language, { config });
        return true;
    });
    if (succeeded !== true) {
        throw new Error('All TTS services failed');
    }
}
