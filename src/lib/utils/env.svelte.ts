import { arch as archFn, type, version } from '@tauri-apps/plugin-os';
import { getVersion } from '@tauri-apps/api/app';

/**
 * plugin-os v2 returns lowercase types ('windows' | 'macos' | 'linux'), but
 * the whole app compares against the Tauri v1 names ('Windows_NT' | 'Darwin' |
 * 'Linux'): the system OCR switch, per-OS window layout and the per-OS logo
 * assets (`logo/${osType}.svg`). Normalize once here (legacy invariant).
 */
export type OsType = 'Windows_NT' | 'Darwin' | 'Linux';

const OS_TYPE_ALIASES: Record<string, OsType> = {
    windows: 'Windows_NT',
    macos: 'Darwin',
    linux: 'Linux',
};

export function normalizeOsType(raw: string): OsType {
    if (Object.prototype.hasOwnProperty.call(OS_TYPE_ALIASES, raw)) {
        return OS_TYPE_ALIASES[raw] as OsType;
    }
    return raw as OsType;
}

export const appEnv = $state({
    osType: '' as OsType | '',
    arch: '',
    osVersion: '',
    appVersion: '',
});

export async function initEnv(): Promise<void> {
    appEnv.osType = normalizeOsType(await type());
    appEnv.arch = await archFn();
    appEnv.osVersion = await version();
    appEnv.appVersion = await getVersion();
}
