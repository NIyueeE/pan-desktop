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

export interface DictionaryRequestOptions {
    config: ServiceInstanceConfig;
}

export interface DictionaryDefinition {
    definition: string;
    example: string;
}

export interface DictionaryMeaning {
    partOfSpeech: string;
    definitions: DictionaryDefinition[];
}

/** A bilingual example sentence pair (source sentence + its translation). */
export interface DictionaryExample {
    source: string;
    target: string;
}

/** Normalised result of a single-word dictionary lookup. */
export interface DictionaryResult {
    word: string;
    /** Best-effort display phonetic ('' when the API has none). */
    phonetic: string;
    /** First entry audio URL ('' when none) — the human pronunciation. */
    audioUrl: string;
    meanings: DictionaryMeaning[];
    /** Bilingual example sentences (absent/empty = none). */
    examples?: DictionaryExample[];
    /** First source URL ('' when none), e.g. the dictionary page. */
    sourceUrl: string;
}

export interface DictionaryService {
    info: ServiceInfo;
    /** Look a single word up; resolves null when the word is not found. */
    lookup(word: string, language: string, options: DictionaryRequestOptions): Promise<DictionaryResult | null>;
}

export interface TtsRequestOptions {
    config: ServiceInstanceConfig;
}

export interface TtsService {
    info: ServiceInfo;
    /** Speak the text aloud in the given language; resolves when playback
     * finishes (or rejects when synthesis/playback failed). */
    speak(text: string, language: string, options: TtsRequestOptions): Promise<void>;
}
