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

    it('keeps the instance when a drag ends without a valid drop', async () => {
        fakeConfigFile.set('translate_service_list', ['openai@1']);
        await initConfigStore();
        const { container } = render(ServiceManager, { props: { kind: 'translate' } });
        await waitFor(() => expect(container.textContent).toContain('OpenAI'));

        // Native HTML5 dnd: dragstart followed by dragend with no drop in
        // between (released outside any row) must be a no-op — the legacy
        // dnd-action zone deleted the item in this exact scenario.
        const row = container.querySelector('[data-service-row="0"]');
        expect(row).not.toBeNull();
        row!.dispatchEvent(new Event('dragstart', { bubbles: true }));
        row!.dispatchEvent(new Event('dragend', { bubbles: true }));

        await waitFor(() => {
            expect(container.querySelectorAll('[data-service-row]').length).toBe(1);
        });
        expect(cfg('translate_service_list')).toEqual(['openai@1']);
    });
});

describe('ServiceManager (recognize)', () => {
    it('persists a legitimate drag reorder', async () => {
        fakeConfigFile.set('recognize_service_list', ['system@1', 'tesseract@2']);
        await initConfigStore();
        const { container } = render(ServiceManager, { props: { kind: 'recognize' } });
        await waitFor(() => expect(container.textContent).toContain('Tesseract'));

        const rows = () => container.querySelectorAll('[data-service-row]');
        expect(rows().length).toBe(2);
        (rows()[0] as HTMLElement).dispatchEvent(new Event('dragstart', { bubbles: true }));
        (rows()[1] as HTMLElement).dispatchEvent(new Event('dragover', { bubbles: true }));
        (rows()[1] as HTMLElement).dispatchEvent(new Event('drop', { bubbles: true }));
        (rows()[1] as HTMLElement).dispatchEvent(new Event('dragend', { bubbles: true }));

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
