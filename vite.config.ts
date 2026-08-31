import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// One HTML entry per window: every webview only parses the code it needs.
// The Rust side opens `<label>.html` (see src-tauri/src/window.rs).
export default defineConfig(async () => ({
    plugins: [tailwindcss(), svelte()],

    // prevent vite from obscuring rust errors
    clearScreen: false,
    // tauri expects a fixed port, fail if that port is not available
    server: {
        port: 1420,
        strictPort: true,
    },
    envPrefix: ['VITE_', 'TAURI_'],
    build: {
        rollupOptions: {
            input: {
                translate: import.meta.dirname + '/translate.html',
                config: import.meta.dirname + '/config.html',
                screenshot: import.meta.dirname + '/screenshot.html',
                daemon: import.meta.dirname + '/daemon.html',
            },
        },
        target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
        // don't minify for debug builds
        minify: !process.env.TAURI_DEBUG,
        // produce sourcemaps for debug builds
        sourcemap: !!process.env.TAURI_DEBUG,
    },
}));
