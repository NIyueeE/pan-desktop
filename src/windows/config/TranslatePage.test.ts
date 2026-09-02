/**
 * Translate settings page regression: the dictionary service block (master
 * switch + priority-ordered dictionary instances) lives at the bottom of the
 * page and must render without enable checkboxes.
 */
import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

import { fakeConfigFile } from '../../test/tauri-state';
import { cfg, initConfigStore } from '../../lib/config/store.svelte';

import Translate from './pages/Translate.svelte';

/** The bits-ui switch inside the row labelled `label`. */
function rowSwitch(label: string): HTMLElement {
    const heading = screen.getByText(label);
    const row = heading.closest('div.my-\\[10px\\]') ?? heading.parentElement?.parentElement;
    expect(row).toBeTruthy();
    const sw = row?.querySelector('[role="switch"]');
    expect(sw).toBeTruthy();
    return sw as HTMLElement;
}

describe('TranslatePage dictionary section', () => {
    it('renders the dictionary block with the master switch on by default', async () => {
        await initConfigStore();
        const { container } = render(Translate);

        await waitFor(() => {
            expect(screen.getByText('Dictionary Service')).toBeInTheDocument();
        });

        // The dictionary instance list renders (Youdao Dictionary) as a
        // pure display row: no grip, no add, no delete, no row switch.
        await waitFor(() => {
            expect(screen.getByText('Youdao Dictionary')).toBeInTheDocument();
        });
        expect(container.querySelector('[data-service-grip]')).toBeNull();
        expect(screen.queryByRole('button', { name: /add/i })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
        expect(container.querySelector('input[type="checkbox"]')).toBeNull();

        const sw = rowSwitch('Dictionary lookup');
        expect(sw.getAttribute('data-state')).toBe('checked');
    });

    it('toggling the master switch persists dictionary_enabled', async () => {
        await initConfigStore();
        render(Translate);
        await waitFor(() => expect(screen.getByText('Dictionary Service')).toBeInTheDocument());

        const user = userEvent.setup();
        await user.click(rowSwitch('Dictionary lookup'));

        await waitFor(() => {
            expect(cfg('dictionary_enabled')).toBe(false);
        });
    });

    it('honours a restored dictionary_enabled=false config', async () => {
        fakeConfigFile.set('dictionary_enabled', false);
        await initConfigStore();
        render(Translate);
        await waitFor(() => expect(screen.getByText('Dictionary Service')).toBeInTheDocument());

        expect(rowSwitch('Dictionary lookup').getAttribute('data-state')).toBe('unchecked');
    });
});
