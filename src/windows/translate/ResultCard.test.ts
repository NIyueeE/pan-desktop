/**
 * ResultCard visibility + idempotency regression net: failures must be
 * *visible* (the header stays interactive while the body collapses to `0fr`,
 * so plain textContent assertions pass even when the user sees nothing —
 * assert the expand/collapse toggle instead), an emptied source must clear
 * the card, an empty payload is an error, and a superseded in-flight result
 * must never repaint the card.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';

import { fakeConfigFile } from '../../test/tauri-state';
import { initConfigStore } from '../../lib/config/store.svelte';

import ResultCard from './ResultCard.svelte';
import { translateState } from './state.svelte';

const translateMock = vi.hoisted(() => vi.fn());

vi.mock('../../lib/services', async (importOriginal) => {
    const original = await importOriginal<typeof import('../../lib/services')>();
    return {
        ...original,
        translateServices: {
            openai: { ...original.translateServices.openai, translate: translateMock },
        },
    };
});

beforeEach(() => {
    translateMock.mockReset();
    // Default matches the plugin-http mock: every service call rejects, so
    // unmocked tests exercise the error path.
    translateMock.mockRejectedValue(new Error('network disabled in tests'));
});

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

    it('clears and collapses when the committed source is emptied', async () => {
        translateMock.mockResolvedValue('你好，世界');
        resetTranslateState();
        await initConfigStore();

        const { unmount } = render(ResultCard, { instanceKey: 'openai', instances: ['openai'] });
        translateState.sourceText = 'Hello world';
        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Collapse' })).toBeInTheDocument();
        });

        // Emptied source: the content is gone and the card folds back to its
        // header instead of showing a blank body.
        translateState.sourceText = '';
        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Expand' })).toBeInTheDocument();
        });
        expect(translateMock.mock.calls.length).toBe(1);
        unmount();
    });

    it('surfaces an error instead of an empty body when the service resolves nothing', async () => {
        translateMock.mockResolvedValue('   ');
        resetTranslateState();
        await initConfigStore();

        const { unmount } = render(ResultCard, { instanceKey: 'openai', instances: ['openai'] });
        translateState.sourceText = 'Hello world';

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Collapse' })).toBeInTheDocument();
            expect(screen.getByText(/Service returned an empty result/)).toBeInTheDocument();
        });
        unmount();
    });

    it('discards an in-flight result once the source changed', async () => {
        let resolveFirst: (value: string) => void = () => {};
        translateMock.mockImplementationOnce(() => new Promise<string>((resolve) => (resolveFirst = resolve)));
        resetTranslateState();
        await initConfigStore();

        const { unmount } = render(ResultCard, { instanceKey: 'openai', instances: ['openai'] });

        // First commit starts a lookup that stays pending...
        translateState.sourceText = 'Hello world';
        await waitFor(() => expect(translateMock).toHaveBeenCalledTimes(1));

        // ...the source is emptied (invalidating the attempt)...
        translateState.sourceText = '';
        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Expand' })).toBeInTheDocument();
        });

        // ...and the stale resolve arrives late: it must not repaint.
        resolveFirst('STALE');
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(screen.getByRole('button', { name: 'Expand' })).toBeInTheDocument();
        expect(screen.queryByText('STALE')).toBeNull();
        unmount();
    });

    it('re-translates when the same text is recommitted', async () => {
        translateMock.mockResolvedValue('你好');
        resetTranslateState();
        await initConfigStore();

        const { unmount } = render(ResultCard, { instanceKey: 'openai', instances: ['openai'] });

        // First commit.
        translateState.sourceText = 'Hello world';
        translateState.commitEpoch += 1;
        await waitFor(() => expect(translateMock).toHaveBeenCalledTimes(1));

        // Selecting the very same text again: the value does not change, but
        // the commit epoch does — the services must run again.
        translateState.commitEpoch += 1;
        await waitFor(() => expect(translateMock).toHaveBeenCalledTimes(2));
        expect(translateMock.mock.calls[0]?.[0]).toBe(translateMock.mock.calls[1]?.[0]);
        unmount();
    });
});
