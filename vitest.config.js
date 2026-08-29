import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Test-only config. The app build keeps using ./vite.config.js.
export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
        setupFiles: ['./src/test/setup.js'],
        globals: false,
        include: ['src/**/*.test.{js,jsx,ts,tsx}', 'tests/**/*.test.{js,jsx}'],
        // Keep heavy rendering tests from hanging forever on an async leak.
        testTimeout: 15000,
        hookTimeout: 15000,
    },
});
