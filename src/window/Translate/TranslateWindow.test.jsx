/**
 * Reproduction: the translate window language dropdowns render
 * `t(`languages.${sourceLanguage}`)` while the jotai atoms are still
 * `undefined` (atom() with no initial value), so the buttons can show
 * "languages.undefined" until the config load completes.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';

import { store, initStore } from '../../utils/store';
import { initEnv } from '../../utils/env';
import Translate from './index';

function findUndefined(container) {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const hits = [];
    while (walker.nextNode()) {
        const text = walker.currentNode.textContent ?? '';
        if (text.includes('undefined')) {
            hits.push(text.trim());
        }
    }
    return hits;
}

async function bootTranslate() {
    await initEnv();
    const result = render(<Translate />);
    // first committed DOM, before any async config load resolves
    const firstPaintHits = findUndefined(result.container);
    await new Promise((resolve) => setTimeout(resolve, 400));
    const settledHits = findUndefined(result.container);
    return { result, firstPaintHits, settledHits };
}

beforeEach(async () => {
    await initStore();
    await store.set('app_language', 'en');
    await store.set('translate_service_list', ['openai']);
    await store.set('recognize_service_list', ['system', 'tesseract']);
    await store.set('openai', { service: 'openai', apiKey: 'x', model: 'gpt-4o-mini' });
});

describe('translate window language dropdowns', () => {
    it('never shows "undefined", not even on first paint (atoms need defaults)', async () => {
        const { firstPaintHits, settledHits } = await bootTranslate();
        expect({ firstPaintHits, settledHits }).toEqual({ firstPaintHits: [], settledHits: [] });
    });
});
