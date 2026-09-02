/**
 * Translate-window regression net: the language dropdowns must never leak
 * `languages.undefined`, a `new_text` event must reach the source card, and
 * the translation pipeline must run end-to-end (service call → error surface
 * when the network is unavailable, as in the test environment).
 */
import { describe, expect, it } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

import {
    fakeConfigFile,
    emitTestEvent,
    setCurrentWindowLabel,
    setInvokeHandler,
    windowState,
} from '../../test/tauri-state';
import { __resetConfigStoreForTests, initConfigStore } from '../../lib/config/store.svelte';

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

    it('clears every card when the input is emptied', async () => {
        fakeConfigFile.set('translate_service_list', ['openai@test1']);
        translateState.sourceText = '';
        translateState.draftText = '';
        translateState.detectLanguage = '';
        await initConfigStore();
        const { container, unmount } = render(App);
        await new Promise((resolve) => setTimeout(resolve, 20));

        emitTestEvent('new_text', 'Hello world');
        await waitFor(
            () => {
                expect(container.textContent).toContain('network disabled in tests');
            },
            { timeout: 5000 }
        );

        // Emptied by hand (no commit): card state must follow immediately —
        // error content gone, every card folded back, dictionary card gone.
        const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
        textarea.value = '';
        textarea.dispatchEvent(new Event('input', { bubbles: true }));

        await waitFor(() => {
            expect(container.querySelector('[aria-label="Collapse"]')).toBeNull();
        });
        expect(container.textContent).not.toContain('network disabled in tests');
        expect(container.querySelector('[data-testid="dictionary-card"]')).toBeNull();
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

    it('shows the dictionary card only after a translation is committed, as the last card', async () => {
        // translateState is module-level and survives across tests in this
        // file: clear whatever a previous test left behind.
        translateState.draftText = '';
        translateState.sourceText = '';
        translateState.detectLanguage = '';
        await initConfigStore();
        const { container, unmount } = render(App);
        await new Promise((resolve) => setTimeout(resolve, 20));

        // Typing alone never opens the card — it follows the COMMITTED text.
        const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
        textarea.value = 'test';
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 450));
        expect(container.querySelector('[data-testid="dictionary-card"]')).toBeNull();

        // Committing a translation (new_text) surfaces it, below the result
        // cards. The lookup itself fails in the test environment (plugin-http
        // is mocked to reject) — the header still carries the word.
        emitTestEvent('new_text', 'test');
        await waitFor(
            () => {
                const card = container.querySelector('[data-testid="dictionary-card"]');
                expect(card).not.toBeNull();
                expect(card?.textContent).toContain('test');
                const section = container.querySelector('section');
                expect(section).not.toBeNull();
                expect(section?.nextElementSibling).toBe(card);
            },
            { timeout: 2000 }
        );
        unmount();
    });

    it('hides the dictionary card when the master switch is off', async () => {
        translateState.draftText = '';
        translateState.sourceText = '';
        translateState.detectLanguage = '';
        fakeConfigFile.set('dictionary_enabled', false);
        await initConfigStore();
        const { container, unmount } = render(App);
        await new Promise((resolve) => setTimeout(resolve, 20));

        emitTestEvent('new_text', 'test');
        await waitFor(() => {
            const textarea = container.querySelector('textarea');
            expect(textarea?.value).toBe('test');
        });
        await new Promise((resolve) => setTimeout(resolve, 450));
        expect(container.querySelector('[data-testid="dictionary-card"]')).toBeNull();
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

    it('paints the window root with the configured opacity', async () => {
        fakeConfigFile.set('translate_opacity', 70);
        await initConfigStore();
        const { container, unmount } = render(App);
        await waitFor(() => {
            // color-mix keeps the theme color and blends it down to the
            // configured opacity; the class stays as the base paint.
            expect(container.firstElementChild?.getAttribute('style')).toContain(
                'color-mix(in srgb, var(--color-background) 70%, transparent)'
            );
            expect(container.firstElementChild?.classList.contains('bg-background')).toBe(true);
        });
        unmount();

        __resetConfigStoreForTests();
        fakeConfigFile.delete('translate_opacity');
        await initConfigStore();
        const { container: defaultContainer, unmount: defaultUnmount } = render(App);
        await waitFor(() => {
            expect(defaultContainer.firstElementChild?.getAttribute('style')).toContain('85%');
        });
        defaultUnmount();
    });

    it('resident boot: empty pending text keeps the pre-built window hidden', async () => {
        setCurrentWindowLabel('translate');
        await initConfigStore();
        const { unmount } = render(App);

        // Let the initial get_text round-trip settle: with an empty payload
        // (startup pre-build) the window must NOT show itself.
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(windowState.calls).not.toContain('show');
        unmount();
    });

    it('boot with pending text shows the window and renders it', async () => {
        setCurrentWindowLabel('translate');
        setInvokeHandler('get_text', () => Promise.resolve('Hello world'));
        await initConfigStore();
        const { container, unmount } = render(App);

        await waitFor(() => {
            expect(windowState.calls).toContain('show');
        });
        await waitFor(() => {
            expect(container.querySelector('textarea')?.value).toBe('Hello world');
        });
        unmount();
    });

    it('Escape hides the resident window instead of destroying it', async () => {
        setCurrentWindowLabel('translate');
        await initConfigStore();
        const { unmount } = render(App);
        await new Promise((resolve) => setTimeout(resolve, 20));

        const user = userEvent.setup();
        await user.keyboard('{Escape}');

        expect(windowState.calls).toContain('hide');
        expect(windowState.calls).not.toContain('close');
        unmount();
    });

    it('Escape destroys the window when keep_alive is off', async () => {
        setCurrentWindowLabel('translate');
        fakeConfigFile.set('translate_keep_alive', false);
        await initConfigStore();
        const { unmount } = render(App);
        await new Promise((resolve) => setTimeout(resolve, 20));

        const user = userEvent.setup();
        await user.keyboard('{Escape}');

        expect(windowState.calls).toContain('close');
        expect(windowState.calls).not.toContain('hide');
        unmount();
    });
});
