import js from '@eslint/js';
import globals from 'globals';
import svelte from 'eslint-plugin-svelte';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    {
        ignores: [
            'dist/**',
            'node_modules/**',
            'src-tauri/target/**',
            'src-tauri/gen/**',
            'src/lib/i18n/locales/**',
            'public/**',
        ],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    ...svelte.configs.recommended,
    {
        // Svelte 5 module files (.svelte.ts) are plain TypeScript: restore the
        // TS parser (svelte.configs.recommended installs its own for these).
        files: ['**/*.svelte.ts', '**/*.svelte.js'],
        languageOptions: {
            parser: tseslint.parser,
        },
    },
    {
        files: ['**/*.svelte'],
        languageOptions: {
            parserOptions: {
                parser: tseslint.parser,
                extraFileExtensions: ['svelte'],
            },
        },
    },
    {
        // Svelte's idiomatic $props()/$state style uses let; prefer-const
        // fights it on every non-bindable prop.
        files: ['**/*.svelte'],
        rules: {
            'prefer-const': 'off',
        },
    },
    {
        // CLI scripts: console output is the report format.
        files: ['scripts/**/*.ts'],
        rules: {
            'no-console': 'off',
            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_',
                },
            ],
        },
    },
    {
        files: ['src/**/*.{ts,svelte}'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                ...globals.browser,
            },
        },
        rules: {
            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_',
                },
            ],
            '@typescript-eslint/no-explicit-any': 'error',
            'no-var': 'error',
            eqeqeq: ['error', 'always'],
            curly: ['error', 'all'],
            'no-console': 'warn',
            'no-debugger': 'error',
        },
    }
);
