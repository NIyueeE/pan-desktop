import { type, arch as archFn, version } from '@tauri-apps/plugin-os';
import { getVersion } from '@tauri-apps/api/app';

// plugin-os v2 returns lowercase types ('windows' | 'macos' | 'linux'), but the
// whole codebase compares against the Tauri v1 names ('Windows_NT' | 'Darwin' |
// 'Linux'): the system OCR switch in services/recognize/system, per-OS window
// layout, the hotkey modifier and the per-OS logo assets public/logo/*.svg
// (`logo/${osType}.svg`). Normalise once here so every consumer keeps working.
const OS_TYPE_ALIASES = {
    windows: 'Windows_NT',
    macos: 'Darwin',
    linux: 'Linux',
};

export function normalizeOsType(raw) {
    return Object.prototype.hasOwnProperty.call(OS_TYPE_ALIASES, raw) ? OS_TYPE_ALIASES[raw] : raw;
}

export let osType = '';
export let arch = '';
export let osVersion = '';
export let appVersion = '';

export async function initEnv() {
    osType = normalizeOsType(await type());
    arch = await archFn();
    osVersion = await version();
    appVersion = await getVersion();
}
