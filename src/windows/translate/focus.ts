/**
 * Shared focus bookkeeping for the translate window.
 *
 * Windows + WebView2 (transparent, undecorated, skip-taskbar) can produce a
 * burst of spurious tauri://blur ↔ tauri://focus oscillations right after the
 * window is shown / programmatically focused. The close-on-blur feature must
 * not treat those as "the user clicked away", otherwise the window closes
 * itself while the user is trying to type into it.
 *
 * Every programmatic focus marks a timestamp; blur handling is suppressed for
 * a short grace window after it. Real user click-aways (happening later) still
 * close the window.
 */

export const BLUR_GRACE_MS = 800;

export const focusState = { lastProgrammaticFocus: 0 };

export function markProgrammaticFocus(now: number = Date.now()): void {
    focusState.lastProgrammaticFocus = now;
}

export function shouldIgnoreBlur(now: number = Date.now()): boolean {
    return now - focusState.lastProgrammaticFocus < BLUR_GRACE_MS;
}
