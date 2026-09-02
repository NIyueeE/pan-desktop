import {
    dictionaryServices,
    recognizeServices,
    translateServices,
    ttsServices,
    type DictionaryServiceName,
    type RecognizeServiceName,
    type TranslateServiceName,
    type TtsServiceName,
} from '../../../lib/services';
import { appEnv } from '../../../lib/utils/env.svelte';

/** Re-exported registries so config-window components can import all three
 * service kinds from one place. */
export const translateRegistry = translateServices;
export const recognizeRegistry = recognizeServices;
export const dictionaryRegistry = dictionaryServices;
export const ttsRegistry = ttsServices;

export type { DictionaryServiceName, RecognizeServiceName, TranslateServiceName, TtsServiceName };

export type ServiceKind = 'translate' | 'recognize' | 'dictionary' | 'tts';

/** Whether a service instance has a configuration form at all: only the
 * OpenAI-compatible endpoints (translate / VLM OCR / TTS) expose editable
 * fields, so only those rows get an edit button. */
export function serviceConfigurable(kind: ServiceKind, serviceName: string): boolean {
    return serviceName === 'openai' && kind !== 'dictionary';
}

/** Built-in capabilities that ship with the app and cannot be removed: they
 * stay in the list forever and are enabled/disabled with a row switch
 * instead. Dictionary is also fixed, but its on/off lives in the section's
 * master switch, so its row is pure display (see {@link hasToggle}). */
export function isBuiltinSingleton(kind: ServiceKind, serviceName: string): boolean {
    return (
        (kind === 'recognize' && (serviceName === 'paddle' || serviceName === 'system')) ||
        (kind === 'tts' && serviceName === 'system') ||
        (kind === 'dictionary' && serviceName === 'free_dictionary')
    );
}

/** Whether a row renders the enable/disable switch: the undeletable built-ins
 * minus the dictionary row, whose master switch lives above it on the
 * translate settings page. */
export function hasToggle(kind: ServiceKind, serviceName: string): boolean {
    return isBuiltinSingleton(kind, serviceName) && kind !== 'dictionary';
}

/** Row/picker icon for a service: system OCR renders the current OS logo,
 * everything else falls back to its registry icon. The OpenAI vendor logo is
 * intentionally not shown next to instance titles (text-only row) — an empty
 * string means "no icon". */
export function serviceIcon(kind: ServiceKind, serviceName: string): string {
    if (kind === 'recognize' && serviceName === 'system') {
        return `logo/${appEnv.osType}.svg`;
    }
    if (serviceName === 'openai') {
        return '';
    }
    const icon =
        kind === 'translate'
            ? translateRegistry[serviceName as TranslateServiceName]?.info.icon
            : kind === 'recognize'
              ? recognizeRegistry[serviceName as RecognizeServiceName]?.info.icon
              : kind === 'dictionary'
                ? dictionaryRegistry[serviceName as DictionaryServiceName]?.info.icon
                : ttsRegistry[serviceName as TtsServiceName]?.info.icon;
    return icon ?? '';
}
