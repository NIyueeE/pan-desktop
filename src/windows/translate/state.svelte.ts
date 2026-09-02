/**
 * Shared reactive state for the translate window (replaces the legacy jotai
 * atoms). The source textarea keeps a local draft; `translateState.sourceText`
 * is only updated on commit (Enter, translate button, dynamic-translate
 * debounce, OCR result, `new_text`), which is what triggers the result cards.
 */

type TranslateWindowType = 'SELECTION' | 'INPUT' | 'IMAGE';

export const translateState = $state({
    sourceText: '',
    /** Draft shown in the textarea; committed to sourceText on translate. */
    draftText: '',
    detectLanguage: '',
    windowType: 'SELECTION' as TranslateWindowType,
    sourceLanguage: 'auto',
    targetLanguage: 'zh_cn',
    pinned: false,
    /** Bumped by EVERY commit (Enter, translate button, dynamic-translate
     * debounce, OCR result, new_text, input emptied): recommitted identical
     * text must re-run the services, and superseded in-flight attempts must
     * be discarded. */
    commitEpoch: 0,
});
