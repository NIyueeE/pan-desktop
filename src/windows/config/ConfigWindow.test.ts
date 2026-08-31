/**
 * UndefinedSweep: render every config page with three config shapes and scan
 * the DOM for leaked `undefined` — on the first synchronous frame and again
 * after the async config settles (the legacy regression class that motivated
 * the `useConfig` default-value discipline).
 */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';

import { fakeConfigFile } from '../../test/tauri-state';
import { initConfigStore } from '../../lib/config/store.svelte';

import General from './pages/General.svelte';
import Translate from './pages/Translate.svelte';
import Recognize from './pages/Recognize.svelte';
import Hotkey from './pages/Hotkey.svelte';
import Service from './pages/Service.svelte';
import Backup from './pages/Backup.svelte';
import About from './pages/About.svelte';

const EMPTY_CONFIG = {};

const PARTIAL_CONFIG = {
    app_language: 'zh_cn',
    app_font_size: 20,
    translate_target_language: 'en',
};

// A config restored from an upstream pot backup: unknown service instances,
// legacy layout keys, proxy fields.
const RESTORED_CONFIG = {
    translate_service_list: ['openai@1', 'deepl@2', 'bing@3'],
    recognize_service_list: ['system', 'tesseract', 'openai@x', 'baidu@y'],
    hide_source: true,
    hide_language: false,
    proxy_host: '127.0.0.1',
    proxy_port: 7890,
    webdav_url: 'https://dav.example.com/dav/',
    webdav_username: 'user',
    webdav_password: 'pass',
};

const PAGES = [
    ['General', General],
    ['Translate', Translate],
    ['Recognize', Recognize],
    ['Hotkey', Hotkey],
    ['Service', Service],
    ['Backup', Backup],
    ['About', About],
] as const;

describe.each([
    ['empty config', EMPTY_CONFIG],
    ['partial config', PARTIAL_CONFIG],
    ['restored pot config', RESTORED_CONFIG],
])('config pages sweep (%s)', (_name, config) => {
    it.each(PAGES)('%s never renders undefined (first frame + settled)', async (pageName, page) => {
        fakeConfigFile.clear();
        for (const [key, value] of Object.entries(config)) {
            fakeConfigFile.set(key, structuredClone(value));
        }
        await initConfigStore();

        const { container, unmount } = render(page);

        const scan = (): string[] =>
            Array.from(container.querySelectorAll('*'))
                .filter((el) => el.childElementCount === 0 && el.textContent?.includes('undefined'))
                .map((el) => `${pageName}: ${el.textContent}`);

        expect(scan()).toEqual([]);

        // Two microtask frames later: late-arriving config writes used to
        // leak `languages.undefined` / `prefix.undefined` labels.
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(scan()).toEqual([]);

        unmount();
    });
});
