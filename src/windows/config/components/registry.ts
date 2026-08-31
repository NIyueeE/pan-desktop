import { recognizeServices, translateServices, type RecognizeServiceName, type TranslateServiceName } from '../../../lib/services';

/** Re-exported registries so config-window components can import both
 * service kinds from one place. */
export const translateRegistry = translateServices;
export const recognizeRegistry = recognizeServices;

export type { RecognizeServiceName, TranslateServiceName };
