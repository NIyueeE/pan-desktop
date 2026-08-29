/**
 * Diagnostic sweep: render every config page under multiple store scenarios
 * and fail whenever the literal string "undefined" leaks into the UI —
 * checked on the very first committed frame (before any async config load
 * resolves) and after settling.
 */
import { describe, expect, test, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

import { store, initStore } from '../../utils/store';
import { initEnv } from '../../utils/env';
import Config from '../../window/Config';

const pages = ['/general', '/translate', '/recognize', '/hotkey', '/service', '/backup', '/about'];

function findUndefined(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const hits = [];
    while (walker.nextNode()) {
        const text = walker.currentNode.textContent ?? '';
        if (text.includes('undefined')) {
            hits.push(text.trim());
        }
    }
    return hits;
}

async function boot(initialEntry) {
    await initEnv();
    const result = render(
        <MemoryRouter initialEntries={[initialEntry]}>
            <Config />
        </MemoryRouter>
    );
    // First committed DOM, before any async useConfig load resolves.
    const firstPaintHits = findUndefined(result.container);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const settledHits = findUndefined(result.container);
    return { firstPaintHits, settledHits };
}

describe.each([
    ['fresh install (empty store)', () => {}],
    [
        'typical used config',
        async () => {
            await store.set('app_language', 'zh_cn');
            await store.set('app_theme', 'dark');
            await store.set('translate_source_language', 'auto');
            await store.set('translate_target_language', 'zh_cn');
            await store.set('translate_window_position', 'mouse');
            await store.set('translate_service_list', ['openai@abc']);
            await store.set('recognize_service_list', ['system', 'tesseract']);
            await store.set('openai@abc', { service: 'openai' });
        },
    ],
    [
        'config with nulled values (bad restore)',
        async () => {
            await store.set('app_language', 'zh_cn');
            await store.set('app_theme', null);
            await store.set('translate_auto_copy', null);
            await store.set('translate_window_position', null);
            await store.set('recognize_language', null);
        },
    ],
])('undefined sweep: %s', (_name, seed) => {
    beforeEach(async () => {
        await initStore();
        await seed();
    });

    test.each(pages)('%s has no literal "undefined"', async (page) => {
        const { firstPaintHits, settledHits } = await boot(page);
        expect({ firstPaintHits, settledHits }).toEqual({ firstPaintHits: [], settledHits: [] });
    });
});
