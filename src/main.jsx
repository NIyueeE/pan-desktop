import { ThemeProvider as NextThemesProvider } from 'next-themes';
import { NextUIProvider } from '@nextui-org/react';
import ReactDOM from 'react-dom/client';
import React from 'react';
import { error as logError, warn as logWarn } from '@tauri-apps/plugin-log';

import { initStore } from './utils/store';
import { initEnv } from './utils/env';
import App from './App';
if (import.meta.env.PROD) {
    document.addEventListener('contextmenu', (e) => {
        e.preventDefault();
    });
}

// Report a fatal boot failure to the log file and show it on screen,
// otherwise the window stays invisible/blank with no way to diagnose it.
const formatFailure = (e) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e));

const logFailure = async (message, e) => {
    try {
        await logError(`${message}: ${formatFailure(e)}`);
    } catch {
        // logging itself unavailable; nothing else to do
    }
};

const reportFatal = async (message, e) => {
    await logFailure(message, e);
    document.body.style.cssText =
        'background:#1a1a1a;color:#ff6b6b;font-family:monospace;padding:16px;white-space:pre-wrap;';
    document.body.textContent = `${message}: ${formatFailure(e)}`;
};

// Log runtime errors without disturbing the running UI.
window.addEventListener('error', (e) => {
    void logFailure('Unhandled error', e.error ?? e.message);
});
window.addEventListener('unhandledrejection', (e) => {
    void logWarn(`Unhandled rejection: ${e.reason}`).catch(() => {});
});

async function boot() {
    try {
        await initStore();
        await initEnv();
        const rootElement = document.getElementById('root');
        const root = ReactDOM.createRoot(rootElement);
        root.render(
            <NextUIProvider>
                <NextThemesProvider attribute='class'>
                    <App />
                </NextThemesProvider>
            </NextUIProvider>
        );
    } catch (e) {
        await reportFatal('Frontend failed to start', e);
    }
}

void boot();
