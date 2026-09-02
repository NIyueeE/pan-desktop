import type { OsType } from '../../../lib/utils/env.svelte';

const KEY_MAP: Record<string, string> = {
    Backquote: '`',
    Backslash: '\\',
    BracketLeft: '[',
    BracketRight: ']',
    Comma: ',',
    Equal: '=',
    Minus: '-',
    Plus: 'PLUS',
    Period: '.',
    Quote: "'",
    Semicolon: ';',
    Slash: '/',
    Backspace: 'Backspace',
    CapsLock: 'Capslock',
    ContextMenu: 'Contextmenu',
    Space: 'Space',
    Tab: 'Tab',
    Convert: 'Convert',
    Delete: 'Delete',
    End: 'End',
    Help: 'Help',
    Home: 'Home',
    PageDown: 'Pagedown',
    PageUp: 'Pageup',
    Escape: 'Esc',
    PrintScreen: 'Printscreen',
    ScrollLock: 'Scrolllock',
    Pause: 'Pause',
    Insert: 'Insert',
    Suspend: 'Suspend',
};

const MODIFIER_KEYS = ['Control', 'Shift', 'Alt', 'Meta'];

export interface HotkeyKeyEvent {
    keyCode: number;
    ctrlKey: boolean;
    shiftKey: boolean;
    metaKey: boolean;
    altKey: boolean;
    key: string;
    code: string;
}

/**
 * Format a keyboard event into the shortcut string accepted by
 * `register_shortcut_by_frontend`. Returns '' when Backspace clears the
 * binding and null while only modifiers are held (not a hotkey yet).
 */
export function formatHotkeyEvent(e: HotkeyKeyEvent, osType: OsType | ''): string | null {
    if (e.keyCode === 8) {
        // Backspace clears the binding.
        return '';
    }
    let modifiers = '';
    if (e.ctrlKey) {
        modifiers = 'Ctrl';
    }
    if (e.shiftKey) {
        modifiers = `${modifiers}${modifiers.length > 0 ? '+' : ''}Shift`;
    }
    if (e.metaKey) {
        modifiers = `${modifiers}${modifiers.length > 0 ? '+' : ''}${osType === 'Darwin' ? 'Command' : 'Super'}`;
    }
    if (e.altKey) {
        modifiers = `${modifiers}${modifiers.length > 0 ? '+' : ''}Alt`;
    }
    let code = e.code || '';
    if (code.startsWith('Key')) {
        code = code.substring(3);
    } else if (code.startsWith('Digit')) {
        code = code.substring(5);
    } else if (code.startsWith('Numpad')) {
        code = 'Num' + code.substring(6);
    } else if (code.startsWith('Arrow')) {
        code = code.substring(5);
    } else if (code.startsWith('Intl')) {
        code = code.substring(4);
    } else if (KEY_MAP[code] !== undefined) {
        code = KEY_MAP[code] ?? '';
    } else {
        code = '';
    }
    // A modifier alone (e.g. the first Ctrl of a combo) is not a hotkey yet.
    if (code === '' || MODIFIER_KEYS.includes(e.key)) {
        return null;
    }
    return `${modifiers}${modifiers.length > 0 && code.length > 0 ? '+' : ''}${code}`;
}
