// The serviceInstanceKey consists of the service name and it's id, separated by @
// In earlier versions, the @ separator and id were optional, so they all have only one instance.

// Canonical list of built-in services for this fork. Every consumer (config
// pages, translate window, backup restore sanitising) derives from these so a
// stale instance key can never resurrect a removed service.
export const BUILTIN_TRANSLATE_SERVICES = ['openai'];
// `openai` is the VLM (vision language model) OCR endpoint; it must stay in the
// builtin allowlist or the backup/service-list sanitisers would drop it.
export const BUILTIN_RECOGNIZE_SERVICES = ['system', 'tesseract', 'openai'];

export const DEFAULT_TRANSLATE_SERVICE_LIST = ['openai'];
// The VLM endpoint is opt-in: existing installs keep local OCR as the default.
export const DEFAULT_RECOGNIZE_SERVICE_LIST = ['system', 'tesseract'];

export function createServiceInstanceKey(serviceName: string): string {
    const randomId = Math.random().toString(36).substring(2);
    return `${serviceName}@${randomId}`;
}

// get built-in service name from instance key
export function getServiceName(serviceInstanceKey: string): string {
    return serviceInstanceKey.split('@')[0];
}

export function getDisplayInstanceName(instanceName: string, serviceNameSupplier: () => string): string {
    return instanceName || serviceNameSupplier();
}

/**
 * Keep only list entries whose service name is still built-in and unique.
 * Returns the fallback list when `list` is not an array or nothing survives.
 * This protects the UI against configs restored from backups created with a
 * different pot build that had more services (e.g. deepl/bing).
 */
export function sanitizeServiceInstanceList(list: unknown, builtinNames: string[], fallback: string[]): string[] {
    if (!Array.isArray(list)) {
        return [...fallback];
    }
    const cleaned = list.filter(
        (entry, index) =>
            typeof entry === 'string' &&
            entry.length > 0 &&
            builtinNames.includes(getServiceName(entry)) &&
            list.indexOf(entry) === index
    );
    return cleaned.length > 0 ? cleaned : [...fallback];
}

export const INSTANCE_NAME_CONFIG_KEY = 'instanceName';
