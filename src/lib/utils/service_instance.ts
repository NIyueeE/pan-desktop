// The serviceInstanceKey consists of the service name and an id, separated by
// `@`. In earlier versions the separator and id were optional.

import { cfgRaw } from '../config/store.svelte';

// Canonical list of built-in services for this fork. Every consumer (config
// pages, translate window, backup restore sanitising) derives from these so a
// stale instance key can never resurrect a removed service.
export const BUILTIN_TRANSLATE_SERVICES = ['openai'] as const;
// `openai` is the VLM (vision language model) OCR endpoint; it must stay in
// the builtin allowlist or the backup/service-list sanitisers would drop it.
// `paddle` replaced tesseract as the local OCR engine (PP-OCRv5 ONNX).
export const BUILTIN_RECOGNIZE_SERVICES = ['paddle', 'system', 'openai'] as const;

export const DEFAULT_TRANSLATE_SERVICE_LIST = ['openai'];
export const DEFAULT_RECOGNIZE_SERVICE_LIST = ['paddle', 'system'];

export function createServiceInstanceKey(serviceName: string): string {
    const randomId = Math.random().toString(36).substring(2);
    return `${serviceName}@${randomId}`;
}

// get built-in service name from instance key
export function getServiceName(serviceInstanceKey: string): string {
    return serviceInstanceKey.split('@')[0] ?? serviceInstanceKey;
}

/**
 * Keep only list entries whose service name is still built-in and unique.
 * Returns the fallback list when `list` is not an array or nothing survives.
 * This protects the UI against configs restored from backups created with a
 * different pot build that had more services (e.g. deepl/bing).
 */
export function sanitizeServiceInstanceList(
    list: unknown,
    builtinNames: readonly string[],
    fallback: string[]
): string[] {
    if (!Array.isArray(list)) {
        return [...fallback];
    }
    const cleaned = list.filter(
        (entry, index): entry is string =>
            typeof entry === 'string' &&
            entry.length > 0 &&
            builtinNames.includes(getServiceName(entry)) &&
            list.indexOf(entry) === index
    );
    return cleaned.length > 0 ? cleaned : [...fallback];
}

export const INSTANCE_NAME_CONFIG_KEY = 'instanceName';

/** Per-instance config stored under the instance key itself. */
export type ServiceInstanceConfig = Record<string, unknown>;

/** Whether an instance participates in its run chain. Built-in singletons
 * (PaddleOCR / system OCR / system voices) are toggled per row instead of
 * being removable, and the toggle persists as `enable` under the instance
 * key; anything without an explicit `false` is enabled (fresh lists, legacy
 * configs, restored backups). */
export function isInstanceEnabled(instanceKey: string): boolean {
    const config = cfgRaw(instanceKey) as ServiceInstanceConfig | undefined;
    return config?.['enable'] !== false;
}

/** Priority failover over a service instance list.
 *
 * Runs `attempt` against the instances in order and resolves with the first
 * defined outcome; `undefined` outcomes and rejections both mean "this
 * instance did not produce a result" and fall through to the next one.
 * Resolves `undefined` when every instance missed — the caller decides how
 * visible to make the total failure. */
export async function firstSuccessful<T>(
    instances: readonly string[],
    attempt: (instance: string) => Promise<T | undefined>
): Promise<T | undefined> {
    for (const instance of instances) {
        try {
            const outcome = await attempt(instance);
            if (outcome !== undefined) {
                return outcome;
            }
        } catch {
            // Failover: a broken instance must not block the next one.
        }
    }
    return undefined;
}
