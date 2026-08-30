/**
 * Regression tests for the 「关于应用」 (About) config page.
 *
 * The page was intentionally slimmed down during the pot → pan rebrand: it now
 * shows only the app name, version, a one-line introduction and a GitHub link.
 * These tests pin that surface so removed entries (website / feedback /
 * community popovers, log & config shortcuts) do not quietly come back, and
 * that the GitHub button points at this fork instead of upstream pot.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

const { open } = vi.hoisted(() => ({ open: vi.fn(() => Promise.resolve()) }));

vi.mock('@tauri-apps/plugin-shell', () => ({ open }));

import About from './index';
import i18n from '../../../../i18n';

describe('About page', () => {
    beforeEach(async () => {
        open.mockClear();
        await i18n.changeLanguage('en');
    });

    it('shows the Pan brand, version area and introduction', () => {
        render(<About />);
        expect(screen.getByRole('heading', { name: 'Pan' })).toBeInTheDocument();
        expect(screen.getByText(i18n.t('config.about.intro'))).toBeInTheDocument();
    });

    it('keeps exactly one action: the GitHub button pointing at this fork', async () => {
        const user = userEvent.setup();
        render(<About />);
        const button = screen.getByRole('button', { name: /GitHub/i });
        await user.click(button);
        expect(open).toHaveBeenCalledTimes(1);
        expect(open).toHaveBeenCalledWith('https://github.com/NIyueeE/pan-desktop');
    });

    it('no longer renders the removed entries (website / feedback / community / log / config)', () => {
        render(<About />);
        for (const removed of ['Website', 'Feedback', 'Community', 'Issue', 'Email', 'View Log', 'View Config']) {
            expect(screen.queryByText(removed)).not.toBeInTheDocument();
        }
        // The old community popovers carried icon-only buttons as well.
        expect(screen.queryAllByRole('button')).toHaveLength(1);
    });
});
