/**
 * ResultCard visibility regression net: failures must be *visible*. The
 * header stays interactive while the body collapses to `0fr`, so plain
 * textContent assertions pass even when the user sees nothing — assert the
 * expand/collapse toggle instead (it flips only when the card is revealed).
 */
import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';

import { fakeConfigFile } from '../../test/tauri-state';
import { initConfigStore } from '../../lib/config/store.svelte';

import ResultCard from './ResultCard.svelte';
import { translateState } from './state.svelte';

/** translateState is a module singleton: clear what earlier tests committed. */
function resetTranslateState(): void {
    translateState.sourceText = '';
    translateState.draftText = '';
    translateState.detectLanguage = '';
}

describe('ResultCard', () => {
    it('expands the collapsed card when the service call rejects', async () => {
        fakeConfigFile.set('translate_service_list', ['openai@test1']);
        resetTranslateState();
        await initConfigStore();

        const { unmount } = render(ResultCard, {
            instanceKey: 'openai@test1',
            instances: ['openai@test1'],
        });

        // Collapsed at boot: the toggle advertises "Expand".
        expect(screen.getByRole('button', { name: 'Expand' })).toBeInTheDocument();

        translateState.sourceText = 'Hello world';

        // plugin-http is mocked to reject in tests: the card must expand and
        // show the error, never strand the user with a silent header.
        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Collapse' })).toBeInTheDocument();
            expect(screen.getByText(/network disabled in tests/)).toBeInTheDocument();
        });
        unmount();
    });

    it('keeps the empty card collapsed when no translation ran', async () => {
        resetTranslateState();
        await initConfigStore();

        const { unmount } = render(ResultCard, { instanceKey: 'openai', instances: ['openai'] });

        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(screen.getByRole('button', { name: 'Expand' })).toBeInTheDocument();
        unmount();
    });
});
