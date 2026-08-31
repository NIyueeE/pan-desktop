import type { AppTheme } from '../config/defaults';

/**
 * Hand-rolled theme handling (replaces next-themes): resolves
 * system/light/dark to a `.dark` class on <html> that the Tailwind palette
 * tokens react to.
 */

const systemDark = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

export const themeState = $state({
    resolved: 'light' as 'light' | 'dark',
});

function apply(pref: AppTheme): void {
    const dark = pref === 'dark' || (pref === 'system' && (systemDark?.matches ?? false));
    themeState.resolved = dark ? 'dark' : 'light';
    document.documentElement.classList.toggle('dark', dark);
}

export function initTheme(pref: AppTheme): void {
    apply(pref);
    if (pref === 'system') {
        try {
            systemDark?.addEventListener('change', () => apply('system'));
        } catch {
            // matchMedia change listener unavailable: static theme is fine.
        }
    }
}

/** Re-apply after the preference changes live in the config window. */
export function applyTheme(pref: AppTheme): void {
    apply(pref);
}
