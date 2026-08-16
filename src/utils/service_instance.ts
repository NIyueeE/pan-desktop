// The serviceInstanceKey consists of the service name and it's id, separated by @
// In earlier versions, the @ separator and id were optional, so they all have only one instance.
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

export const INSTANCE_NAME_CONFIG_KEY = 'instanceName';
