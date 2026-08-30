/**
 * Regression tests for the environment bootstrap (src/utils/env.js).
 *
 * Covers the Tauri v2 migration bug: @tauri-apps/plugin-os `type()` returns
 * lowercase values ('windows' | 'macos' | 'linux'), while the app compares
 * against the Tauri v1 names ('Windows_NT' | 'Darwin' | 'Linux'). Without
 * normalisation the system OCR service rendered `logo/windows.svg`, an asset
 * that does not exist — the broken image icon on the 「服务设置 → 文字识别」
 * page — and the system OCR `switch (osType)` never matched any branch.
 */
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Feed the REAL plugin-os v2 values through a mutable holder so each test can
// simulate a different platform (the `mock` prefix keeps it accessible from the
// hoisted factory, vi.hoisted keeps it visible before the imports evaluate).
const mockOsType = vi.hoisted(() => ({ value: 'windows' }));

vi.mock('@tauri-apps/plugin-os', () => ({
    type: () => Promise.resolve(mockOsType.value),
    arch: () => Promise.resolve('x86_64'),
    version: () => Promise.resolve('10'),
}));

import { initEnv, normalizeOsType, osType } from './env';

describe('normalizeOsType', () => {
    it.each([
        ['windows', 'Windows_NT'],
        ['macos', 'Darwin'],
        ['linux', 'Linux'],
        // Unknown / future values pass through untouched instead of lying.
        ['freebsd', 'freebsd'],
        ['', ''],
    ])('maps plugin-os v2 %j to the canonical %j', (raw, expected) => {
        expect(normalizeOsType(raw)).toBe(expected);
    });

    it('never returns a prototype-inherited key', () => {
        expect(normalizeOsType('constructor')).toBe('constructor');
        expect(normalizeOsType('toString')).toBe('toString');
    });
});

describe('initEnv', () => {
    it.each(['windows', 'macos', 'linux'])('stores the canonical type for %s', async (raw) => {
        mockOsType.value = raw;
        await initEnv();
        expect(osType).toBe(normalizeOsType(raw));
    });

    it.each(['Windows_NT', 'Darwin', 'Linux'])('os type %s resolves to an existing logo asset', async (canonical) => {
        // The direct user-visible regression: `logo/${osType}.svg` must point
        // at a file that actually ships in public/, otherwise the recognize
        // service list renders a broken image icon.
        const publicLogoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/logo');
        const asset = path.join(publicLogoDir, `${canonical}.svg`);
        expect({ asset, exists: fs.existsSync(asset) }).toEqual({
            asset,
            exists: true,
        });
    });
});
