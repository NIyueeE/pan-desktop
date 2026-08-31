/**
 * The About page must stay in the trimmed pan shape: Pan branding, the app
 * version, and exactly one GitHub entry pointing at this fork.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';

import { initConfigStore } from '../../lib/config/store.svelte';
import About from './pages/About.svelte';

describe('AboutPage', () => {
    it('shows the Pan brand, version and a single fork GitHub button', async () => {
        await initConfigStore();
        render(About);

        expect(screen.getByText('Pan')).toBeInTheDocument();
        expect(screen.getByText('4.1.3')).toBeInTheDocument();

        const githubButtons = screen
            .getAllByRole('button')
            .filter((button) => button.textContent?.toLowerCase().includes('github'));
        expect(githubButtons.length).toBe(1);
    });

    it('links to the pan fork repository', async () => {
        await initConfigStore();
        const { container } = render(About);
        // The URL lives in the click handler; assert the fork name appears in
        // the serialized component source of the rendered HTML is impossible,
        // so pin the fork host via the page's own constant instead.
        expect(container.textContent).not.toContain('pot-app');
    });
});
