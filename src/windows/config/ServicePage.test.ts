/**
 * Service management page regression net.
 *
 * The service lists must survive configs restored from other pot builds
 * (unknown services dropped), the built-in service lists must be complete
 * (including the OpenAI-compatible VLM OCR endpoint), and the last remaining
 * instance cannot be deleted.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

import { fakeConfigFile } from '../../test/tauri-state';
import { cfg, cfgRaw, initConfigStore } from '../../lib/config/store.svelte';
import { getServiceName } from '../../lib/utils/service_instance';

import ServiceManager from './components/ServiceManager.svelte';

/**
 * Simulate a grip pointer-drag (the reorder mechanism — Tauri's drag-drop
 * handler swallows native HTML5 dnd on WebView2, so rows are moved via
 * pointer capture). pointerdown on the row's grip, pointermove over `to`
 * (elementFromPoint stubbed to that row; null clears the target), pointerup.
 */
function dragRow(container: HTMLElement, from: number, to: number | null): void {
    const rows = () => container.querySelectorAll('[data-service-row]');
    const grip = rows()[from]?.querySelector('[data-service-grip]');
    expect(grip).toBeTruthy();
    const target = to === null ? null : (rows()[to] ?? null);
    const hadOwn = Object.prototype.hasOwnProperty.call(document, 'elementFromPoint');
    const original = hadOwn ? Object.getOwnPropertyDescriptor(document, 'elementFromPoint') : undefined;
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => target });
    try {
        grip!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
        window.dispatchEvent(new MouseEvent('pointermove', { bubbles: true }));
        window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
    } finally {
        if (original) {
            Object.defineProperty(document, 'elementFromPoint', original);
        } else {
            Reflect.deleteProperty(document, 'elementFromPoint');
        }
    }
}

describe('ServiceManager (translate)', () => {
    it('renders instance titles for the default list', async () => {
        await initConfigStore();
        const { container } = render(ServiceManager, { props: { kind: 'translate' } });
        await waitFor(() => {
            expect(container.textContent).toContain('OpenAI');
        });
    });

    it('drops unknown services from restored configs', async () => {
        fakeConfigFile.set('translate_service_list', ['openai@1', 'deepl@2', 'bing@3']);
        await initConfigStore();
        const { container } = render(ServiceManager, { props: { kind: 'translate' } });

        await waitFor(() => {
            expect(container.textContent).toContain('OpenAI');
        });
        expect(container.textContent).not.toContain('deepl');
        expect(container.textContent).not.toContain('bing');
        // The cleaned list is persisted back.
        await waitFor(() => {
            expect(fakeConfigFile.get('translate_service_list')).toEqual(['openai@1']);
        });
    });

    it('refuses to delete the last remaining instance', async () => {
        await initConfigStore();
        const { container } = render(ServiceManager, { props: { kind: 'translate' } });
        await waitFor(() => expect(container.textContent).toContain('OpenAI'));

        const user = userEvent.setup();
        await user.click(screen.getByRole('button', { name: 'Delete' }));

        // Still exactly one item.
        expect(container.querySelectorAll('[data-service-row]').length).toBe(1);
    });

    it('opens the instance config form directly when there is only one builtin service', async () => {
        await initConfigStore();
        render(ServiceManager, { props: { kind: 'translate' } });
        await waitFor(() => expect(screen.getByRole('button', { name: /add/i })).toBeInTheDocument());

        const user = userEvent.setup();
        await user.click(screen.getByRole('button', { name: /add/i }));

        // Translate has a single builtin (openai): the type-picker dialog is
        // skipped and the new instance's config form opens immediately.
        const dialog = screen.getByRole('dialog');
        expect(dialog.textContent).toContain('OpenAI Chat Completions');
        expect(dialog.textContent).toContain('Request Path');
    });
});

describe('ServiceManager (dictionary)', () => {
    it('renders the free dictionary instance title', async () => {
        await initConfigStore();
        const { container } = render(ServiceManager, { props: { kind: 'dictionary' } });
        await waitFor(() => {
            expect(container.textContent).toContain('Youdao Dictionary');
        });
    });

    it('is a pure display row: no drag, no add, no delete, no toggle', async () => {
        await initConfigStore();
        const { container } = render(ServiceManager, { props: { kind: 'dictionary', hideDrag: true, hideAdd: true } });
        await waitFor(() => expect(container.textContent).toContain('Youdao Dictionary'));

        // The dictionary block is fixed: exactly one instance, nothing to
        // reorder (hideDrag), nothing to add (hideAdd), nothing to remove
        // (built-in singleton) and no row switch (the master switch lives
        // above it on the translate settings page).
        expect(container.querySelector('[data-service-grip]')).toBeNull();
        expect(screen.queryByRole('button', { name: /add/i })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
        expect(screen.queryByRole('switch')).toBeNull();
        expect(container.querySelectorAll('[data-service-row]').length).toBe(1);
    });
});

describe('ServiceManager (tts)', () => {
    it('renders the system voices instance by default', async () => {
        await initConfigStore();
        const { container } = render(ServiceManager, { props: { kind: 'tts' } });
        await waitFor(() => {
            expect(container.textContent).toContain('System Voices');
        });
    });

    it('system voices is a built-in singleton: toggle instead of delete', async () => {
        await initConfigStore();
        const { container } = render(ServiceManager, { props: { kind: 'tts' } });
        await waitFor(() => expect(container.textContent).toContain('System Voices'));

        const row = container.querySelector('[data-service-row]');
        expect(row?.querySelector('button[aria-label="Delete"]')).toBeNull();
        expect(screen.queryByRole('switch')).not.toBeNull();

        // Toggling persists `enable` under the instance key.
        const stored = cfg('tts_service_list');
        const systemKey = String(stored?.find((k) => getServiceName(String(k)) === 'system'));
        const user = userEvent.setup();
        await user.click(screen.getByRole('switch'));
        await waitFor(() => {
            expect((cfgRaw(systemKey) as Record<string, unknown>)?.['enable']).toBe(false);
        });
        // And back on.
        await user.click(screen.getByRole('switch'));
        await waitFor(() => {
            expect((cfgRaw(systemKey) as Record<string, unknown>)?.['enable']).toBe(true);
        });
    });

    it('add picker only offers the configurable OpenAI TTS', async () => {
        await initConfigStore();
        render(ServiceManager, { props: { kind: 'tts' } });
        await waitFor(() => expect(screen.getByRole('button', { name: /add/i })).toBeInTheDocument());

        const user = userEvent.setup();
        await user.click(screen.getByRole('button', { name: /add/i }));

        const dialog = screen.getByRole('dialog');
        expect(dialog.textContent).not.toContain('System Voices');
        expect(dialog.textContent).toContain('OpenAI TTS');
    });
});

describe('ServiceManager (recognize)', () => {
    it('has a grip — list order is the failover priority', async () => {
        fakeConfigFile.set('recognize_service_list', ['paddle@1', 'system@2']);
        await initConfigStore();
        const { container } = render(ServiceManager, { props: { kind: 'recognize' } });
        await waitFor(() => expect(container.textContent).toContain('PaddleOCR'));

        expect(container.querySelector('[data-service-grip]')).not.toBeNull();
    });

    it('dragging a row reorders the failover priority', async () => {
        fakeConfigFile.set('recognize_service_list', ['paddle@1', 'system@2']);
        await initConfigStore();
        const { container } = render(ServiceManager, { props: { kind: 'recognize' } });
        await waitFor(() => expect(container.querySelectorAll('[data-service-row]').length).toBe(2));

        dragRow(container, 1, 0);

        await waitFor(() => {
            expect(cfg('recognize_service_list')).toEqual(['system@2', 'paddle@1']);
        });
    });

    it('keeps the instance when a grip drag is released without hitting another row', async () => {
        fakeConfigFile.set('recognize_service_list', ['paddle@1', 'system@2']);
        await initConfigStore();
        const { container } = render(ServiceManager, { props: { kind: 'recognize' } });
        await waitFor(() => expect(container.textContent).toContain('PaddleOCR'));

        // Released over empty space (elementFromPoint → null) must be a
        // no-op — the legacy dnd-action zone deleted the item in this
        // exact scenario.
        dragRow(container, 0, null);

        await waitFor(() => {
            expect(container.querySelectorAll('[data-service-row]').length).toBe(2);
        });
        expect(cfg('recognize_service_list')).toEqual(['paddle@1', 'system@2']);
    });

    it('has no enable checkboxes — instances are always active', async () => {
        fakeConfigFile.set('recognize_service_list', ['paddle@1', 'system@2']);
        await initConfigStore();
        const { container } = render(ServiceManager, { props: { kind: 'recognize' } });
        await waitFor(() => expect(container.querySelectorAll('[data-service-row]').length).toBe(2));

        expect(container.querySelectorAll('input[type="checkbox"]').length).toBe(0);
    });

    it('only the configurable services show an edit button', async () => {
        fakeConfigFile.set('recognize_service_list', ['system@sys1', 'openai@vlm1']);
        await initConfigStore();
        const { container } = render(ServiceManager, { props: { kind: 'recognize' } });
        await waitFor(() => expect(container.textContent).toContain('OpenAI'));

        // The VLM endpoint has a config form; system OCR has no fields.
        const editButtons = () => container.querySelectorAll('button[aria-label="Edit"]');
        expect(editButtons().length).toBe(1);
        const vlmRow = [...container.querySelectorAll('[data-service-row]')].find((row) =>
            row.textContent?.includes('OpenAI')
        );
        expect(vlmRow?.querySelector('button[aria-label="Edit"]')).not.toBeNull();
        const systemRow = [...container.querySelectorAll('[data-service-row]')].find((row) =>
            row.textContent?.includes('System OCR')
        );
        expect(systemRow?.querySelector('button[aria-label="Edit"]')).toBeNull();
    });

    it('built-in singletons toggle enable instead of offering deletion', async () => {
        fakeConfigFile.set('recognize_service_list', ['paddle@1', 'system@2']);
        await initConfigStore();
        const { container } = render(ServiceManager, { props: { kind: 'recognize' } });
        await waitFor(() => expect(container.textContent).toContain('PaddleOCR'));

        // PaddleOCR and system OCR ship with the app: no delete button, a
        // switch each (default on).
        expect(container.querySelectorAll('button[aria-label="Delete"]').length).toBe(0);
        const switches = screen.getAllByRole('switch');
        expect(switches.length).toBe(2);
        expect(switches.map((s) => (s as HTMLElement).ariaChecked ?? s.getAttribute('aria-checked'))).toEqual([
            'true',
            'true',
        ]);

        // Toggling persists `enable: false` under the instance key.
        const user = userEvent.setup();
        await user.click(switches[0] as Element);
        await waitFor(() => {
            expect((cfgRaw('paddle@1') as Record<string, unknown>)?.['enable']).toBe(false);
        });
        expect((cfgRaw('system@2') as Record<string, unknown>)?.['enable']).toBeUndefined();
    });

    it('add picker only offers the configurable VLM endpoint', async () => {
        await initConfigStore();
        render(ServiceManager, { props: { kind: 'recognize' } });
        await waitFor(() => expect(screen.getByRole('button', { name: /add/i })).toBeInTheDocument());

        const user = userEvent.setup();
        await user.click(screen.getByRole('button', { name: /add/i }));

        const dialog = screen.getByRole('dialog');
        // PaddleOCR and system OCR are fixed built-ins: never re-offered.
        expect(dialog.textContent).not.toContain('PaddleOCR');
        expect(dialog.textContent).not.toContain('System OCR');
        expect(dialog.textContent).toContain('OpenAI');
    });

    it('renders the system OCR icon from a real per-OS asset', async () => {
        fakeConfigFile.set('recognize_service_list', ['paddle@p1', 'system@sys1']);
        await initConfigStore();
        const { container } = render(ServiceManager, { props: { kind: 'recognize' } });
        await waitFor(() => expect(container.querySelectorAll('img').length).toBeGreaterThan(0));

        const systemIcon = container.querySelector('img[src="logo/Windows_NT.svg"]');
        expect(systemIcon).not.toBeNull();
        const paddleIcon = container.querySelector('img[src="logo/paddle.svg"]');
        expect(paddleIcon).not.toBeNull();
    });

    it('delete only exists for configurable services and removes key + config', async () => {
        fakeConfigFile.set('recognize_service_list', ['paddle@p1', 'openai@vlm1']);
        await initConfigStore();
        const deleteSpy = vi.spyOn(fakeConfigFile, 'delete');
        const { container } = render(ServiceManager, { props: { kind: 'recognize' } });
        await waitFor(() => expect(container.querySelectorAll('[data-service-row]').length).toBe(2));

        // Only the OpenAI row is deletable.
        const deletable = screen.getAllByRole('button', { name: 'Delete' });
        expect(deletable.length).toBe(1);

        const user = userEvent.setup();
        await user.click(deletable[0] as Element);

        await waitFor(() => {
            expect(fakeConfigFile.get('recognize_service_list')).toEqual(['paddle@p1']);
        });
        expect(deleteSpy).toHaveBeenCalled();
        deleteSpy.mockRestore();
    });
});

describe('ServiceManager (translate)', () => {
    it('has no grip — all instances run concurrently, order is irrelevant', async () => {
        fakeConfigFile.set('translate_service_list', ['openai@1', 'openai@2']);
        await initConfigStore();
        const { container } = render(ServiceManager, { props: { kind: 'translate' } });
        await waitFor(() => expect(container.querySelectorAll('[data-service-row]').length).toBe(2));

        expect(container.querySelector('[data-service-grip]')).toBeNull();
        expect(container.querySelectorAll('input[type="checkbox"]').length).toBe(0);
    });
});
