import type { ServiceInstanceConfig } from '../utils/service_instance';

export interface ServiceInfo {
    name: string;
    icon: string;
}

export interface TranslateRequestOptions {
    config: ServiceInstanceConfig;
    detect?: string;
    /** Streaming callback: called with the partial result while translating. */
    setResult?: (value: string) => void;
}

export interface RecognizeRequestOptions {
    config?: ServiceInstanceConfig;
}

export interface TranslateService {
    info: ServiceInfo;
    Language: Record<string, string>;
    translate(text: string, from: string, to: string, options: TranslateRequestOptions): Promise<string>;
}

export interface RecognizeService {
    info: ServiceInfo;
    Language: Record<string, string>;
    recognize(base64: string, language: string, options?: RecognizeRequestOptions): Promise<string>;
}
