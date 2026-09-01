import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

// Test-only config. The app build keeps using ./vite.config.ts.
export default defineConfig({
    plugins: [svelte()],
    resolve: {
        // Svelte 5 client runtime must resolve to the browser build under jsdom.
        conditions: ['browser'],
    },
    test: {
        environment: 'jsdom',
        setupFiles: ['./src/test/setup.ts'],
        globals: false,
        include: ['src/**/*.test.{js,ts}'],
        // Keep heavy rendering tests from hanging forever on an async leak.
        testTimeout: 15000,
        hookTimeout: 15000,
    },
});
