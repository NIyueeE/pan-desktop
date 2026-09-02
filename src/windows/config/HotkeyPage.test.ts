import { tick } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';

import { formatHotkeyEvent } from './components/hotkey_format';
import HotkeyInput from './components/HotkeyInput.svelte';
import Hotkey from './pages/Hotkey.svelte';
import { initConfigStore } from '../../lib/config/store.svelte';
import { fakeConfigFile, setInvokeHandler } from '../../test/tauri-state';

function keyEvent(overrides: Partial<KeyboardEvent> & { key: string }): KeyboardEvent & { keyCode: number } {
    return {
        keyCode: overrides.key === 'Backspace' ? 8 : 0,
        ctrlKey: false,
        shiftKey: false,
        metaKey: false,
        altKey: false,
        code: '',
        ...overrides,
    } as KeyboardEvent & { keyCode: number };
}

describe('formatHotkeyEvent', () => {
    it('formats modifier combos', () => {
        expect(
            formatHotkeyEvent({ ...keyEvent({ key: 't', code: 'KeyT' }), ctrlKey: true, shiftKey: true }, 'Windows_NT')
        ).toBe('Ctrl+Shift+T');
    });

    it('maps the meta key per platform', () => {
        const base = { key: 'a', code: 'KeyA' };
        expect(formatHotkeyEvent({ ...keyEvent(base), metaKey: true }, 'Darwin')).toBe('Command+A');
        expect(formatHotkeyEvent({ ...keyEvent(base), metaKey: true }, 'Windows_NT')).toBe('Super+A');
    });

    it('backspace clears the binding', () => {
        expect(formatHotkeyEvent(keyEvent({ key: 'Backspace' }), 'Windows_NT')).toBe('');
    });

    it('returns null while only modifiers are held', () => {
        expect(formatHotkeyEvent(keyEvent({ key: 'Control', code: 'ControlLeft' }), 'Windows_NT')).toBeNull();
    });

    it('maps numpad and arrows', () => {
        expect(formatHotkeyEvent(keyEvent({ key: '1', code: 'Numpad1' }), 'Windows_NT')).toBe('Num1');
        expect(formatHotkeyEvent(keyEvent({ key: 'ArrowUp', code: 'ArrowUp' }), 'Windows_NT')).toBe('Up');
    });
});

describe('HotkeyInput', () => {
    it('drafts the formatted binding on keydown and reports it', async () => {
        const onDraft = vi.fn();
        render(HotkeyInput, { props: { osType: 'Windows_NT', onDraft } });
        const input = screen.getByRole('textbox');

        fireEvent.keyDown(input, { key: 't', code: 'KeyT', keyCode: 84 });
        await tick();

        // Controlled component: the field only reports; the parent feeds the
        // draft back through the `draft` prop (covered by the next test).
        expect(onDraft).toHaveBeenCalledWith('T');
    });

    it('shows the draft highlighted while it differs from the stored binding', async () => {
        const { container } = render(HotkeyInput, {
            props: { value: 'Ctrl+T', draft: 'Ctrl+R', osType: 'Windows_NT' },
        });
        await tick();

        expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('Ctrl+R');
        expect(container.querySelector('input')?.className).toContain('ring-primary');
    });

    it('backspace reports an empty draft instead of applying immediately', () => {
        const onDraft = vi.fn();
        render(HotkeyInput, { props: { value: 'Ctrl+T', osType: 'Windows_NT', onDraft } });
        fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Backspace', code: 'Backspace', keyCode: 8 });
        expect(onDraft).toHaveBeenCalledWith('');
    });

    it('blur keeps the unsaved draft (no per-row apply anymore)', async () => {
        render(HotkeyInput, { props: { value: 'Ctrl+T', draft: 'Ctrl+R', osType: 'Windows_NT' } });
        fireEvent.blur(screen.getByRole('textbox'));
        await tick();
        expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('Ctrl+R');
    });
});

describe('Hotkey page save flow', () => {
    it('hides the save button until a binding is captured', async () => {
        await initConfigStore();
        const { container, unmount } = render(Hotkey);

        expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();

        fireEvent.keyDown(container.querySelector('input') as HTMLInputElement, {
            key: 't',
            code: 'KeyT',
            keyCode: 84,
        });
        await tick();
        expect(screen.getByRole('button', { name: 'Save' })).toBeVisible();
        unmount();
    });

    it('save registers and persists the draft, then the button disappears', async () => {
        setInvokeHandler('register_shortcut_by_frontend', () => Promise.resolve());
        await initConfigStore();
        const { container, unmount } = render(Hotkey);

        fireEvent.keyDown(container.querySelector('input') as HTMLInputElement, {
            key: 't',
            code: 'KeyT',
            keyCode: 84,
        });
        await tick();
        await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

        await waitFor(() => {
            expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
        });
        expect(fakeConfigFile.get('hotkey_selection_translate')).toBe('T');
        unmount();
    });

    it('a failed registration keeps the draft and the save button', async () => {
        setInvokeHandler('register_shortcut_by_frontend', () => Promise.reject(new Error('register failed')));
        await initConfigStore();
        const { container, unmount } = render(Hotkey);

        fireEvent.keyDown(container.querySelector('input') as HTMLInputElement, {
            key: 't',
            code: 'KeyT',
            keyCode: 84,
        });
        await tick();
        await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(screen.getByRole('button', { name: 'Save' })).toBeVisible();
        expect((container.querySelector('input') as HTMLInputElement).value).toBe('T');
        // Never persisted: the key stays unset in the config file.
        expect(fakeConfigFile.get('hotkey_selection_translate') ?? '').toBe('');
        unmount();
    });

    it('backspace clears into a saveable empty binding', async () => {
        fakeConfigFile.set('hotkey_selection_translate', 'Ctrl+T');
        setInvokeHandler('register_shortcut_by_frontend', () => Promise.resolve());
        await initConfigStore();
        const { container, unmount } = render(Hotkey);

        fireEvent.keyDown(container.querySelector('input') as HTMLInputElement, {
            key: 'Backspace',
            code: 'Backspace',
            keyCode: 8,
        });
        await tick();
        expect((container.querySelector('input') as HTMLInputElement).value).toBe('');

        await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() => {
            expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
        });
        expect(fakeConfigFile.get('hotkey_selection_translate')).toBe('');
        unmount();
    });
});
