/**
 * Dictionary card regression net: a hit expands the definitions and example
 * sentences, the body folds away on demand, a clean miss keeps the header
 * with a not-found hint, a failed lookup surfaces the error with a retry,
 * it walks the instance list in priority order, and falls back to English
 * exactly once.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';

import { initConfigStore } from '../../lib/config/store.svelte';
import type { DictionaryResult } from '../../lib/services/types';

import DictionaryCard from './DictionaryCard.svelte';

const HIT: DictionaryResult = {
    word: 'hello',
    phonetic: '/həˈloʊ/',
    audioUrl: '',
    meanings: [{ partOfSpeech: 'interjection', definitions: [{ definition: 'A greeting.', example: '' }] }],
    examples: [{ source: 'Hello, everyone.', target: '大家好。' }],
    sourceUrl: '',
};

const lookupMock = vi.hoisted(() => vi.fn());

vi.mock('../../lib/services', async (importOriginal) => {
    const original = await importOriginal<typeof import('../../lib/services')>();
    return {
        ...original,
        dictionaryServices: { free_dictionary: { ...original.dictionaryServices.free_dictionary, lookup: lookupMock } },
    };
});

describe('DictionaryCard', () => {
    beforeEach(() => {
        lookupMock.mockClear();
    });

    it('renders expanded when the lookup hits', async () => {
        await initConfigStore();
        lookupMock.mockResolvedValue(HIT);
        const { container } = render(DictionaryCard, { props: { word: 'hello', language: 'en' } });

        await waitFor(() => {
            expect(container.textContent).toContain('A greeting.');
        });
        // The bilingual example pair renders below the definitions.
        expect(container.textContent).toContain('Hello, everyone.');
        expect(container.textContent).toContain('大家好。');
    });

    it('folds the body away on demand and expands it again', async () => {
        await initConfigStore();
        lookupMock.mockResolvedValue(HIT);
        const { container } = render(DictionaryCard, { props: { word: 'hello', language: 'en' } });

        await waitFor(() => {
            expect(container.textContent).toContain('A greeting.');
        });

        await fireEvent.click(screen.getByRole('button', { name: 'Collapse' }));
        expect(screen.getByRole('button', { name: 'Expand' })).toBeVisible();

        await fireEvent.click(screen.getByRole('button', { name: 'Expand' }));
        expect(container.textContent).toContain('A greeting.');
    });

    it('renders the collapsed header when every instance misses', async () => {
        await initConfigStore();
        lookupMock.mockResolvedValue(null);
        const { container } = render(DictionaryCard, { props: { word: 'xyzzy', language: 'en' } });

        await waitFor(() => {
            expect(lookupMock).toHaveBeenCalled();
        });
        // Header with the word, a not-found hint, no body, no phonetic.
        expect(container.textContent).toContain('xyzzy');
        expect(container.textContent).toContain('No definitions found');
        expect(container.textContent).not.toContain('/həˈloʊ/');
        expect(container.querySelector('li')).toBeNull();
    });

    it('does not query anything when the word is empty', async () => {
        await initConfigStore();
        render(DictionaryCard, { props: { word: '', language: 'en' } });
        await new Promise((resolve) => setTimeout(resolve, 400));

        expect(lookupMock).not.toHaveBeenCalled();
    });

    it('surfaces lookup failures with the reason and retries on demand', async () => {
        await initConfigStore();
        lookupMock.mockRejectedValue(new Error('Dictionary API error: 503'));
        const { container } = render(DictionaryCard, { props: { word: 'hello', language: 'en' } });

        // The failure is visible, not swallowed into a bare header.
        await waitFor(() => {
            expect(container.textContent).toContain('Lookup failed');
        });
        expect(container.textContent).toContain('Dictionary API error: 503');

        // Retry re-runs the chain and expands on the hit.
        lookupMock.mockResolvedValue(HIT);
        await fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
        await waitFor(() => {
            expect(container.textContent).toContain('A greeting.');
        });
        expect(lookupMock.mock.calls.length).toBe(2);
    });

    it('shows a miss without any card-level fallback (the service owns fallbacks)', async () => {
        await initConfigStore();
        lookupMock.mockResolvedValue(null);
        const { container } = render(DictionaryCard, { props: { word: 'bonjour', language: 'fr' } });

        await waitFor(() => {
            expect(container.textContent).toContain('No definitions found');
        });
        const queriedLanguages = lookupMock.mock.calls.map((call) => call[1]);
        expect(queriedLanguages).toEqual(['fr']);
    });

    it('keeps the previous result while a new lookup is pending (word prop change)', async () => {
        await initConfigStore();
        let resolveLookup: (entry: DictionaryResult | null) => void = () => {};
        lookupMock.mockImplementation(() => new Promise((resolve) => (resolveLookup = resolve)));
        const { container, rerender } = render(DictionaryCard, { props: { word: 'hello', language: 'en' } });

        // First lookup pending: collapsed, no body.
        await waitFor(() => expect(lookupMock).toHaveBeenCalled());
        expect(container.querySelector('li')).toBeNull();

        resolveLookup(HIT);
        await waitFor(() => expect(container.textContent).toContain('A greeting.'));

        // New word arrives: the card resets to collapsed until the next hit.
        lookupMock.mockImplementation(() => new Promise(() => {}));
        await rerender({ word: 'world', language: 'en' });
        await waitFor(() => expect(container.querySelector('li')).toBeNull());
        expect(container.textContent).toContain('world');
    });

    it('re-queries on a new commit epoch but keeps a user-collapsed card folded', async () => {
        await initConfigStore();
        lookupMock.mockResolvedValue(HIT);
        const { container, rerender } = render(DictionaryCard, {
            props: { word: 'hello', language: 'en', epoch: 0 },
        });

        await waitFor(() => {
            expect(container.textContent).toContain('A greeting.');
        });

        // The user folds the card away...
        await fireEvent.click(screen.getByRole('button', { name: 'Collapse' }));

        // ...and the same word is recommitted: re-lookup happens, but the
        // card stays folded (dynamic translate re-commits constantly — it
        // must not fight the user's collapse).
        await rerender({ word: 'hello', language: 'en', epoch: 1 });
        await waitFor(() => expect(lookupMock.mock.calls.length).toBe(2));
        expect(screen.getByRole('button', { name: 'Expand' })).toBeInTheDocument();

        // A NEW word expands the card again.
        await rerender({ word: 'world', language: 'en', epoch: 2 });
        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Collapse' })).toBeInTheDocument();
        });
        expect(container.textContent).toContain('world');
    });
});
