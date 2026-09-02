import '../app.css';

import { error as logError, warn as logWarn } from '@tauri-apps/plugin-log';
import { locale } from '@tauri-apps/plugin-os';
import { mount, type Component } from 'svelte';

import { cfg, hasConfig, initConfigStore, setConfig } from './config/store.svelte';
import { initEnv } from './utils/env.svelte';
import { initTheme } from './utils/theme.svelte';
import { initI18n, matchAppLanguage } from './i18n/i18n.svelte';

const formatFailure = (e: unknown): string => (e instanceof Error ? `${e.name}: ${e.message}` : String(e));

const logFailure = async (message: string, e: unknown): Promise<void> => {
    try {
        await logError(`${message}: ${formatFailure(e)}`);
    } catch {
        // logging itself unavailable; nothing else to do
    }
};

/** Report a fatal boot failure to the log file and on screen — the window must
 * never stay invisible/blank with no way to diagnose it (legacy invariant). */
const reportFatal = async (message: string, e: unknown): Promise<void> => {
    await logFailure(message, e);
    document.body.style.cssText =
        'background:#1a1a1a;color:#ff6b6b;font-family:monospace;padding:16px;white-space:pre-wrap;';
    document.body.textContent = `${message}: ${formatFailure(e)}`;
};

/** Log runtime errors without disturbing the running UI. */
function registerGlobalErrorHandlers(): void {
    window.addEventListener('error', (e) => {
        void logFailure('Unhandled error', e.error ?? e.message);
    });
    window.addEventListener('unhandledrejection', (e) => {
        void logWarn(`Unhandled rejection: ${e.reason}`).catch(() => {});
    });
}

/**
 * Shared boot sequence for every Svelte window: config snapshot → env → i18n
 * → theme → mount. One bulk IPC round-trip each, in parallel where possible.
 */
export async function bootWindow(App: Component): Promise<void> {
    if (import.meta.env.PROD) {
        document.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    registerGlobalErrorHandlers();
    try {
        await initConfigStore();
        // First run only: derive the default display language from the system
        // locale. The detection writes the key, so it never runs again — a
        // later change in the OS language does not override the user's
        // explicit choice.
        if (!hasConfig('app_language')) {
            const detected = matchAppLanguage(await locale().catch(() => null));
            setConfig('app_language', detected);
        }
        await Promise.all([initEnv(), initI18n(cfg('app_language'))]);
        initTheme(cfg('app_theme'));
        const rootElement = document.getElementById('root');
        if (!rootElement) {
            throw new Error('Missing #root element');
        }
        mount(App, { target: rootElement });
    } catch (e) {
        await reportFatal('Frontend failed to start', e);
    }
}
