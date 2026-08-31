import { tick } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';

import { formatHotkeyEvent } from './components/hotkey_format';
import HotkeyInput from './components/HotkeyInput.svelte';

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
            formatHotkeyEvent(
                { ...keyEvent({ key: 't', code: 'KeyT' }), ctrlKey: true, shiftKey: true },
                'Windows_NT'
            )
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

        expect(onDraft).toHaveBeenCalledWith('T');
        expect((input as HTMLInputElement).value).toBe('T');
    });

    it('OK applies the binding through the parent callback', async () => {
        const onApply = vi.fn();
        render(HotkeyInput, {
            props: { value: 'Ctrl+T', osType: 'Windows_NT', onApply },
        });
        await fireEvent.click(screen.getByRole('button', { name: 'OK' }));
        expect(onApply).toHaveBeenCalledWith('Ctrl+T', expect.any(Function));
    });

    it('backspace clears immediately', () => {
        const onApply = vi.fn();
        render(HotkeyInput, {
            props: { value: 'Ctrl+T', osType: 'Windows_NT', onApply },
        });
        fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Backspace', code: 'Backspace', keyCode: 8 });
        expect(onApply).toHaveBeenCalledWith('', expect.any(Function));
    });

    it('blur without OK reverts the draft to the stored binding', async () => {
        render(HotkeyInput, { props: { value: 'Ctrl+T', osType: 'Windows_NT' } });
        const input = screen.getByRole('textbox') as HTMLInputElement;

        fireEvent.keyDown(input, { key: 'r', code: 'KeyR', keyCode: 82, ctrlKey: true });
        await tick();
        expect(input.value).toBe('Ctrl+R');

        fireEvent.blur(input);
        await new Promise((resolve) => setTimeout(resolve, 200));
        await tick();
        expect(input.value).toBe('Ctrl+T');
    });
});
