/**
 * Regression tests for the 「服务设置」 (Service) config page.
 *
 * Covers: fresh config, stale service instance keys (e.g. restored from a
 * WebDAV backup taken with a different pot version that had more services),
 * missing per-instance config, and the add-service modal.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

import { store, initStore } from '../../../../utils/store';
import { initEnv } from '../../../../utils/env';
import Config from '../../../../window/Config';

async function bootConfig(initialEntry = '/service') {
    await initEnv();
    return render(
        <MemoryRouter initialEntries={[initialEntry]}>
            <Config />
        </MemoryRouter>
    );
}

beforeEach(async () => {
    await initStore();
    // Default store state mirrors a sane config
    await store.set('app_language', 'en');
    await store.set('translate_service_list', ['openai']);
    await store.set('recognize_service_list', ['system', 'tesseract']);
    await store.set('openai', {
        service: 'openai',
        requestPath: 'https://api.openai.com/v1/chat/completions',
        model: 'gpt-4o-mini',
        apiKey: 'sk-test',
        stream: false,
        enable: true,
    });
});

describe('Service page', () => {
    it('renders with a fresh config (openai on the translate tab)', async () => {
        const { container } = await bootConfig('/service');
        await waitFor(() => {
            expect(screen.getByText('OpenAI')).toBeInTheDocument();
        });
        expect(container.textContent).not.toContain('页面出错了');

        // Recognize services live on the second tab
        await userEvent.setup().click(screen.getByRole('tab', { name: /Recognize/i }));
        await waitFor(() => {
            expect(screen.getByText('System OCR')).toBeInTheDocument();
            expect(screen.getByText('Tesseract.js')).toBeInTheDocument();
        });
    });

    it('does NOT crash when the service list contains removed/unknown services (restored backup)', async () => {
        // Simulate a config restored from an old full pot backup.
        await store.set('translate_service_list', ['openai@abc123', 'deepl@legacy', 'bing@old', 'google@older']);
        await store.set('recognize_service_list', ['tesseract@rec1', 'baidu_ocr@legacy']);
        await store.set('openai@abc123', { service: 'openai', apiKey: 'sk-test' });
        await store.set('tesseract@rec1', { service: 'tesseract' });

        const { container } = await bootConfig('/service');

        // The page must still render the known services…
        await waitFor(() => {
            expect(screen.getByText('OpenAI')).toBeInTheDocument();
        });
        // …and must not wipe out the whole React tree with an error.
        expect(container.textContent).not.toContain('页面出错了');
        // Unknown entries are dropped (they cannot work anyway) but the rest stays usable.
        expect(screen.queryByText(/deepl/i)).not.toBeInTheDocument();
    });

    it('does NOT crash when an instance key has no stored config', async () => {
        await store.set('translate_service_list', ['openai@ghost']);
        // no 'openai@ghost' entry in the store

        const { container } = await bootConfig('/service');
        await waitFor(() => {
            expect(screen.getByText('OpenAI')).toBeInTheDocument();
        });
        expect(container.textContent).not.toContain('页面出错了');
    });

    it('shows an error boundary instead of a white window if a page throws', async () => {
        await store.set('translate_service_list', 'not-an-array');
        const { container } = await bootConfig('/service');
        await waitFor(() => {
            // Error boundary message is present (non-empty, non-white page)
            expect(container.textContent.trim().length).toBeGreaterThan(0);
        });
    });

    it('add-service modal opens and lists builtin services only', async () => {
        const user = userEvent.setup();
        await bootConfig('/service');
        await waitFor(() => {
            expect(screen.getByText('OpenAI')).toBeInTheDocument();
        });
        await user.click(screen.getByText('Add Builtin Service'));
        const dialog = await screen.findByRole('dialog');
        await waitFor(() => {
            // exactly one entry inside the modal list
            expect(within(dialog).getAllByText('OpenAI').length).toBe(1);
        });
    });

    it('config modal renders a fully populated form for a brand-new instance', async () => {
        const user = userEvent.setup();
        await bootConfig('/service');
        await waitFor(() => {
            expect(screen.getByText('OpenAI')).toBeInTheDocument();
        });
        await user.click(screen.getByText('Add Builtin Service'));
        const dialog = await screen.findByRole('dialog');
        await user.click(within(dialog).getAllByText('OpenAI')[0]);

        // every input must be populated (no uncontrolled/undefined fields)
        await waitFor(() => {
            expect(screen.getByLabelText('Request Path')).toHaveValue('https://api.openai.com/v1/chat/completions');
            expect(screen.getByLabelText('Model')).toHaveValue('gpt-3.5-turbo');
        });
    });

    it('system OCR row references an existing per-OS logo asset (no broken image)', async () => {
        const { container } = await bootConfig('/service');
        await waitFor(() => {
            expect(screen.getByText('OpenAI')).toBeInTheDocument();
        });
        await userEvent.setup().click(screen.getByRole('tab', { name: /Recognize/i }));
        await waitFor(() => {
            expect(screen.getByText('System OCR')).toBeInTheDocument();
        });
        // plugin-os v2 reports 'windows'; env.js must normalise it so the row
        // points at the shipped asset — `logo/windows.svg` does not exist and
        // used to render a broken image icon.
        expect(container.querySelector('img[src="logo/Windows_NT.svg"]')).not.toBeNull();
        expect(container.querySelector('img[src="logo/windows.svg"]')).toBeNull();
    });
});
