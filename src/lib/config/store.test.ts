import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeConfigFile, listenerCount } from '../../test/tauri-state';
import { onConfigChanged } from '../ipc/events';
import {
    cfg,
    cfgRaw,
    hasConfig,
    initConfigStore,
    migrateLegacyKeys,
    setConfig,
    setConfigRaw,
    writeThrough,
    __resetConfigStoreForTests,
} from './store.svelte';

async function flushMicrotasks(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
}

describe('config store', () => {
    beforeEach(() => {
        __resetConfigStoreForTests();
    });

    it('boots a snapshot with one entries() call and applies catalog defaults on read', async () => {
        fakeConfigFile.set('app_font_size', 18);
        await initConfigStore();

        expect(cfg('app_font_size')).toBe(18);
        // Unset keys fall back to the catalog default without touching the
        // snapshot.
        expect(cfg('app_theme')).toBe('system');
        expect(hasConfig('app_theme')).toBe(false);
        expect(cfgRaw('unknown-service@key')).toBeUndefined();
    });

    it('applies the legacy hide_source/hide_language migration', async () => {
        fakeConfigFile.set('hide_source', true);
        fakeConfigFile.set('hide_language', true);
        await initConfigStore();

        expect(cfg('translate_layout')).toBe('compact');
    });

    it('migration does not overwrite an existing translate_layout', async () => {
        fakeConfigFile.set('hide_source', true);
        fakeConfigFile.set('translate_layout', 'full');
        await initConfigStore();

        expect(cfg('translate_layout')).toBe('full');
    });

    it('applies the legacy transparent=false migration to full opacity', async () => {
        fakeConfigFile.set('transparent', false);
        await initConfigStore();

        expect(cfg('translate_opacity')).toBe(100);
    });

    it('legacy transparent=true keeps the default opacity', async () => {
        fakeConfigFile.set('transparent', true);
        await initConfigStore();

        expect(cfg('translate_opacity')).toBe(85);
    });

    it('setConfig updates the snapshot immediately and persists debounced', async () => {
        vi.useFakeTimers();
        try {
            await initConfigStore();
            const seen: unknown[] = [];
            const unlisten = await onConfigChanged('app_font_size', (v) => seen.push(v));

            setConfig('app_font_size', 20);
            // Immediate UI visibility…
            expect(cfg('app_font_size')).toBe(20);
            // …but nothing persisted or broadcast yet.
            expect(fakeConfigFile.has('app_font_size')).toBe(false);
            expect(seen).toEqual([]);

            await vi.advanceTimersByTimeAsync(500);
            await flushMicrotasks();

            expect(fakeConfigFile.get('app_font_size')).toBe(20);
            expect(seen).toEqual([20]);
            unlisten();
        } finally {
            vi.useRealTimers();
        }
    });

    it('never writes undefined or null into the store', async () => {
        await initConfigStore();
        setConfigRaw('app_font_size', undefined);
        setConfigRaw('app_font_size', null);

        expect(hasConfig('app_font_size')).toBe(false);
        expect(listenerCount('app_font_size_changed')).toBe(0);
    });

    it('writeThrough persists immediately and cancels the pending debounce for its key', async () => {
        vi.useFakeTimers();
        try {
            await initConfigStore();
            setConfig('app_theme', 'light');
            await writeThrough('app_theme', 'dark');

            expect(fakeConfigFile.get('app_theme')).toBe('dark');
            // The debounced write for the same key must have been dropped, not
            // flushed later over the fresher value.
            await vi.advanceTimersByTimeAsync(1000);
            await flushMicrotasks();
            expect(fakeConfigFile.get('app_theme')).toBe('dark');
        } finally {
            vi.useRealTimers();
        }
    });

    it('migrateLegacyKeys is a no-op without legacy keys', async () => {
        await initConfigStore();
        migrateLegacyKeys();
        expect(hasConfig('translate_layout')).toBe(false);
    });

    it('emits a cross-window sync event with the legacy event naming', async () => {
        vi.useFakeTimers();
        try {
            await initConfigStore();
            const seen: unknown[] = [];
            const unlisten = await onConfigChanged('openai@abc123', (v) => seen.push(v));

            setConfigRaw('openai@abc123', { enable: false });
            // Not yet persisted (debounced) — the event only fires after save.
            expect(seen).toEqual([]);

            await vi.advanceTimersByTimeAsync(500);
            await flushMicrotasks();
            expect(seen).toEqual([{ enable: false }]);
            unlisten();
        } finally {
            vi.useRealTimers();
        }
    });
});
