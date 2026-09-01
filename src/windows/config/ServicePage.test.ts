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
import { cfg, initConfigStore } from '../../lib/config/store.svelte';

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

    it('keeps the instance when a grip drag is released without hitting another row', async () => {
        fakeConfigFile.set('translate_service_list', ['openai@1']);
        await initConfigStore();
        const { container } = render(ServiceManager, { props: { kind: 'translate' } });
        await waitFor(() => expect(container.textContent).toContain('OpenAI'));

        // Released over empty space (elementFromPoint → null) must be a
        // no-op — the legacy dnd-action zone deleted the item in this
        // exact scenario.
        dragRow(container, 0, null);

        await waitFor(() => {
            expect(container.querySelectorAll('[data-service-row]').length).toBe(1);
        });
        expect(cfg('translate_service_list')).toEqual(['openai@1']);
    });
});

describe('ServiceManager (recognize)', () => {
    it('persists a legitimate grip reorder', async () => {
        fakeConfigFile.set('recognize_service_list', ['system@1', 'tesseract@2']);
        await initConfigStore();
        const { container } = render(ServiceManager, { props: { kind: 'recognize' } });
        await waitFor(() => expect(container.textContent).toContain('Tesseract'));

        const rows = () => container.querySelectorAll('[data-service-row]');
        expect(rows().length).toBe(2);
        dragRow(container, 0, 1);

        await waitFor(() => {
            expect(cfg('recognize_service_list')).toEqual(['tesseract@2', 'system@1']);
        });
        expect(rows().length).toBe(2);
    });

    it('offers every built-in recognize service in the add modal, including the VLM endpoint', async () => {
        await initConfigStore();
        const { container } = render(ServiceManager, { props: { kind: 'recognize' } });
        await waitFor(() => expect(container.textContent).toBeTruthy());

        const user = userEvent.setup();
        await user.click(screen.getByRole('button', { name: /add/i }));

        const dialog = screen.getByRole('dialog');
        expect(dialog.textContent).toContain('System OCR');
        expect(dialog.textContent).toContain('Tesseract');
        expect(dialog.textContent).toContain('OpenAI');
    });

    it('renders the system OCR icon from a real per-OS asset', async () => {
        fakeConfigFile.set('recognize_service_list', ['system@sys1', 'tesseract@t1']);
        await initConfigStore();
        const { container } = render(ServiceManager, { props: { kind: 'recognize' } });
        await waitFor(() => expect(container.querySelectorAll('img').length).toBeGreaterThan(0));

        const systemIcon = container.querySelector('img[src^="logo/"]');
        expect(systemIcon).not.toBeNull();
        expect(systemIcon?.getAttribute('src')).toBe('logo/Windows_NT.svg');
    });

    it('toggling enable persists the instance config', async () => {
        fakeConfigFile.set('recognize_service_list', ['tesseract@t1']);
        await initConfigStore();
        const { container } = render(ServiceManager, { props: { kind: 'recognize' } });
        await waitFor(() => expect(container.querySelectorAll('input[type="checkbox"]').length).toBe(1));

        const user = userEvent.setup();
        await user.click(container.querySelector('input[type="checkbox"]') as HTMLInputElement);

        await waitFor(() => {
            expect(fakeConfigFile.get('tesseract@t1')).toEqual({ enable: false });
        });
    });

    it('delete removes the instance key and its stored config', async () => {
        fakeConfigFile.set('recognize_service_list', ['system@sys1', 'tesseract@t1']);
        await initConfigStore();
        const deleteSpy = vi.spyOn(fakeConfigFile, 'delete');
        const { container } = render(ServiceManager, { props: { kind: 'recognize' } });
        await waitFor(() => expect(container.querySelectorAll('[data-service-row]').length).toBe(2));

        const user = userEvent.setup();
        await user.click(screen.getAllByRole('button', { name: 'Delete' })[0] as Element);

        await waitFor(() => {
            expect(fakeConfigFile.get('recognize_service_list')).toEqual(['tesseract@t1']);
        });
        expect(deleteSpy).toHaveBeenCalled();
        deleteSpy.mockRestore();
    });
});
