/**
 * Translate-window regression net: the language dropdowns must never leak
 * `languages.undefined`, a `new_text` event must reach the source card, and
 * the translation pipeline must run end-to-end (service call → error surface
 * when the network is unavailable, as in the test environment).
 */
import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';

import { fakeConfigFile, emitTestEvent } from '../../test/tauri-state';
import { initConfigStore } from '../../lib/config/store.svelte';

import App from './App.svelte';
import { translateState } from './state.svelte';

describe('TranslateWindow', () => {
    it('boot without leaking undefined anywhere', async () => {
        await initConfigStore();
        const { container, unmount } = render(App);

        expect(container.textContent).not.toContain('languages.undefined');
        expect(container.textContent).not.toContain('undefined');

        unmount();
    });

    it('routes a new_text event into the source textarea', async () => {
        await initConfigStore();
        const { container, unmount } = render(App);

        // Let the initial get_text round-trip settle first — in production a
        // new_text event only arrives after the window booted (the initial
        // selection arrives via get_text).
        await new Promise((resolve) => setTimeout(resolve, 20));

        emitTestEvent('new_text', 'Hello world');

        await waitFor(() => {
            const textarea = container.querySelector('textarea');
            expect(textarea?.value).toBe('Hello world');
        });
        unmount();
    });

    it('runs the translation pipeline and surfaces service errors', async () => {
        fakeConfigFile.set('translate_service_list', ['openai@test1']);
        await initConfigStore();
        const { container, unmount } = render(App);

        emitTestEvent('new_text', 'Hello world');

        // plugin-http is mocked to reject: the card must show the error, not
        // hang or crash — proving event → state → trigger → service flow.
        await waitFor(
            () => {
                expect(container.textContent).toContain('network disabled in tests');
            },
            { timeout: 5000 }
        );
        unmount();
    });

    it('applies delete_newline to incoming selection text', async () => {
        fakeConfigFile.set('translate_delete_newline', true);
        await initConfigStore();
        const { container, unmount } = render(App);

        await new Promise((resolve) => setTimeout(resolve, 20));

        emitTestEvent('new_text', 'Some- text\nwith breaks');

        // Legacy transform: de-hyphenate wrapped words, then collapse whitespace.
        await waitFor(() => {
            const textarea = container.querySelector('textarea');
            expect(textarea?.value).toBe('Sometext with breaks');
        });
        unmount();
    });

    it('keeps the language selectors on configured defaults', async () => {
        fakeConfigFile.set('translate_source_language', 'auto');
        fakeConfigFile.set('translate_target_language', 'ja');
        await initConfigStore();
        const { container, unmount } = render(App);

        await waitFor(() => {
            expect(translateState.targetLanguage).toBe('ja');
        });
        expect(container.textContent).not.toContain('undefined');
        unmount();
    });
});
