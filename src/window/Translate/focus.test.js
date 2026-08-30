/**
 * Tests for the translate-window focus grace bookkeeping.
 *
 * Windows + WebView2 fires a burst of spurious blur/focus events right after a
 * programmatic focus; close-on-blur must ignore blurs inside the grace window
 * while still closing on genuine (later) click-aways.
 */
import { describe, expect, it, beforeEach } from 'vitest';

import { BLUR_GRACE_MS, focusState, markProgrammaticFocus, shouldIgnoreBlur } from './focus';

describe('blur grace bookkeeping', () => {
    beforeEach(() => {
        focusState.lastProgrammaticFocus = 0;
    });

    it('ignores blurs inside the grace window after a programmatic focus', () => {
        markProgrammaticFocus(1000);
        expect(shouldIgnoreBlur(1000 + BLUR_GRACE_MS - 1)).toBe(true);
    });

    it('closes on genuine blurs after the grace window has passed', () => {
        markProgrammaticFocus(1000);
        expect(shouldIgnoreBlur(1000 + BLUR_GRACE_MS)).toBe(false);
        expect(shouldIgnoreBlur(1000 + BLUR_GRACE_MS + 5000)).toBe(false);
    });

    it('ignores blurs before any programmatic focus never happens (unmarked state closes)', () => {
        // Timestamp 0 with "now" far ahead: a blur without any prior programmatic
        // focus is a real blur and must close the window.
        expect(shouldIgnoreBlur(BLUR_GRACE_MS + 1)).toBe(false);
    });

    it('refreshing the mark extends the grace window', () => {
        markProgrammaticFocus(1000);
        markProgrammaticFocus(1000 + BLUR_GRACE_MS - 100);
        expect(shouldIgnoreBlur(1000 + BLUR_GRACE_MS + 100)).toBe(true);
        expect(shouldIgnoreBlur(1000 + 2 * BLUR_GRACE_MS)).toBe(false);
    });
});
