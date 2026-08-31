import { info as openaiTranslateInfo, translate as openaiTranslate, Language as openaiTranslateLanguage } from './translate/openai';
import type { RecognizeService, TranslateService } from './types';
import * as systemOcr from './recognize/system';
import * as tesseractOcr from './recognize/tesseract';
import * as openaiOcr from './recognize/openai';

/** Registries of built-in services; the keys double as the sanitize
 * allowlist (mirrored on the Rust side — see config.rs). */

export const translateServices = {
    openai: {
        info: openaiTranslateInfo,
        Language: openaiTranslateLanguage,
        translate: openaiTranslate,
    } satisfies TranslateService,
} as const;

export type TranslateServiceName = keyof typeof translateServices;

export const recognizeServices = {
    system: { info: systemOcr.info, Language: systemOcr.Language, recognize: systemOcr.recognize } satisfies RecognizeService,
    tesseract: {
        info: tesseractOcr.info,
        Language: tesseractOcr.Language,
        recognize: tesseractOcr.recognize,
    } satisfies RecognizeService,
    openai: { info: openaiOcr.info, Language: openaiOcr.Language, recognize: openaiOcr.recognize } satisfies RecognizeService,
} as const;

export type RecognizeServiceName = keyof typeof recognizeServices;
