import {
    info as openaiTranslateInfo,
    translate as openaiTranslate,
    Language as openaiTranslateLanguage,
} from './translate/openai';
import type { DictionaryService, RecognizeService, TranslateService, TtsService } from './types';
import * as systemOcr from './recognize/system';
import * as paddleOcr from './recognize/paddle';
import * as openaiOcr from './recognize/openai';
import * as freeDictionary from './dictionary/free_dictionary';
import * as systemTts from './tts/system';
import * as openaiTts from './tts/openai';

/** Registries of built-in services; the keys double as the sanitize
 * allowlist (mirrored on the Rust side — see config.rs). */

export const translateServices: { openai: TranslateService } = {
    openai: {
        info: openaiTranslateInfo,
        Language: openaiTranslateLanguage,
        translate: openaiTranslate,
    } satisfies TranslateService,
} as const;

export type TranslateServiceName = keyof typeof translateServices;

export const recognizeServices: Record<string, RecognizeService> = {
    paddle: {
        info: paddleOcr.info,
        Language: paddleOcr.Language,
        recognize: paddleOcr.recognize,
    } satisfies RecognizeService,
    system: {
        info: systemOcr.info,
        Language: systemOcr.Language,
        recognize: systemOcr.recognize,
    } satisfies RecognizeService,
    openai: {
        info: openaiOcr.info,
        Language: openaiOcr.Language,
        recognize: openaiOcr.recognize,
    } satisfies RecognizeService,
} as const;

export type RecognizeServiceName = keyof typeof recognizeServices;

export const dictionaryServices: { free_dictionary: DictionaryService } = {
    free_dictionary: {
        info: freeDictionary.info,
        lookup: freeDictionary.lookup,
    } satisfies DictionaryService,
} as const;

export type DictionaryServiceName = keyof typeof dictionaryServices;

export const ttsServices: Record<string, TtsService> = {
    system: {
        info: systemTts.info,
        speak: systemTts.speak,
    } satisfies TtsService,
    openai: {
        info: openaiTts.info,
        speak: openaiTts.speak,
    } satisfies TtsService,
} as const;

export type TtsServiceName = keyof typeof ttsServices;
