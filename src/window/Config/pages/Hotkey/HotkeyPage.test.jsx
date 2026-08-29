/**
 * Tests for the hotkey settings page.
 *
 * Locks in the reworked flow: focusing the field must NOT kill the saved
 * hotkey, leaving without OK restores the previous value, OK applies through
 * the backend (which unregisters the old binding), and Backspace clears
 * immediately.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

import { store, initStore } from '../../../../utils/store';
import { initEnv } from '../../../../utils/env';
import { setInvokeHandler, invokeCalls, globalShortcutCalls } from '../../../../test/tauri-state';
import { formatHotkeyEvent } from './index';

import Hotkey from './index';

const keyEvent = (overrides) => ({
    keyCode: 0,
    ctrlKey: false,
    shiftKey: false,
    metaKey: false,
    altKey: false,
    key: '',
    code: '',
    preventDefault: () => {},
    ...overrides,
});

// Three fields each render an (CSS-hidden) OK button; scope lookups to the
// container of the field under test.
function fieldContainer(input) {
    let node = input;
    while (node && !node.className.includes('config-item')) {
        node = node.parentElement;
    }
    return node;
}

async function bootHotkey() {
    await initStore();
    await initEnv();
    return render(
        <MemoryRouter initialEntries={['/hotkey']}>
            <Hotkey />
        </MemoryRouter>
    );
}

beforeEach(async () => {
    await initStore();
    await store.set('app_language', 'en');
    setInvokeHandler('register_shortcut_by_frontend', () => undefined);
});

describe('formatHotkeyEvent', () => {
    it('formats Ctrl+Alt+T', () => {
        expect(formatHotkeyEvent(keyEvent({ ctrlKey: true, altKey: true, key: 't', code: 'KeyT' }))).toBe('Ctrl+Alt+T');
    });

    it('formats plain letters, digits and mapped keys', () => {
        expect(formatHotkeyEvent(keyEvent({ key: 'a', code: 'KeyA' }))).toBe('A');
        expect(formatHotkeyEvent(keyEvent({ key: '5', code: 'Digit5' }))).toBe('5');
        expect(formatHotkeyEvent(keyEvent({ key: 'PageDown', code: 'PageDown' }))).toBe('Pagedown');
        expect(formatHotkeyEvent(keyEvent({ key: 'ArrowUp', code: 'ArrowUp' }))).toBe('Up');
    });

    it('returns null for a lone modifier press', () => {
        expect(formatHotkeyEvent(keyEvent({ ctrlKey: true, key: 'Control', code: 'ControlLeft' }))).toBeNull();
        expect(formatHotkeyEvent(keyEvent({ shiftKey: true, key: 'Shift', code: 'ShiftLeft' }))).toBeNull();
    });

    it('returns empty string for Backspace (keyCode 8)', () => {
        expect(formatHotkeyEvent(keyEvent({ keyCode: 8 }))).toBe('');
    });

    it('maps Super on Windows', () => {
        expect(formatHotkeyEvent(keyEvent({ metaKey: true, key: 'k', code: 'KeyK' }))).toBe('Super+K');
    });
});

describe('Hotkey page', () => {
    it('shows the saved hotkey and keeps it when the field is focused and left', async () => {
        await store.set('hotkey_selection_translate', 'Ctrl+Alt+T');
        const user = userEvent.setup();
        await bootHotkey();

        const input = await screen.findByDisplayValue('Ctrl+Alt+T');
        await user.click(input);
        // Click elsewhere (blur) without pressing OK
        await user.click(document.body);

        await waitFor(() => {
            expect(screen.getByDisplayValue('Ctrl+Alt+T')).toBeInTheDocument();
        });
        // The old shortcut was NOT unregistered behind the user's back
        expect(globalShortcutCalls).toEqual([]);
        expect(invokeCalls).toEqual([]);
    });

    it('applies a new hotkey on OK and persists it immediately', async () => {
        await store.set('hotkey_selection_translate', 'Ctrl+Alt+T');
        const user = userEvent.setup();
        await bootHotkey();

        const input = await screen.findByDisplayValue('Ctrl+Alt+T');
        await user.click(input);
        fireEvent.keyDown(input, keyEvent({ ctrlKey: true, altKey: true, key: 'l', code: 'KeyL' }));
        expect(screen.getByDisplayValue('Ctrl+Alt+L')).toBeInTheDocument();

        await user.click(within(fieldContainer(input)).getByRole('button', { name: 'OK' }));

        await waitFor(() => {
            expect(invokeCalls).toContainEqual([
                'register_shortcut_by_frontend',
                { name: 'hotkey_selection_translate', shortcut: 'Ctrl+Alt+L' },
            ]);
        });
        await waitFor(async () => {
            expect(await store.get('hotkey_selection_translate')).toBe('Ctrl+Alt+L');
        });
    });

    it('clears a hotkey with Backspace immediately', async () => {
        await store.set('hotkey_selection_translate', 'Ctrl+Alt+T');
        const user = userEvent.setup();
        await bootHotkey();

        const input = await screen.findByDisplayValue('Ctrl+Alt+T');
        await user.click(input);
        fireEvent.keyDown(input, keyEvent({ keyCode: 8 }));

        await waitFor(() => {
            expect(invokeCalls).toContainEqual([
                'register_shortcut_by_frontend',
                { name: 'hotkey_selection_translate', shortcut: '' },
            ]);
        });
        await waitFor(async () => {
            expect(await store.get('hotkey_selection_translate')).toBe('');
        });
    });

    it('rejects a hotkey that is already registered elsewhere', async () => {
        globalShortcutCalls.push(['register', 'Ctrl+Alt+X']);
        const user = userEvent.setup();
        await bootHotkey();

        const input = (await screen.findAllByDisplayValue(''))[0];
        await user.click(input);
        fireEvent.keyDown(input, keyEvent({ ctrlKey: true, altKey: true, key: 'x', code: 'KeyX' }));
        expect(screen.getByDisplayValue('Ctrl+Alt+X')).toBeInTheDocument();

        await user.click(within(fieldContainer(input)).getByRole('button', { name: 'OK' }));

        await waitFor(() => {
            expect(screen.getByText('The hotkey is already registered')).toBeInTheDocument();
        });
        expect(invokeCalls).toEqual([]);
    });

    it('restores the previous value when registration fails', async () => {
        await store.set('hotkey_selection_translate', 'Ctrl+Alt+T');
        setInvokeHandler('register_shortcut_by_frontend', () => {
            throw new Error('AlreadyRegistered');
        });
        const user = userEvent.setup();
        await bootHotkey();

        const input = await screen.findByDisplayValue('Ctrl+Alt+T');
        await user.click(input);
        fireEvent.keyDown(input, keyEvent({ ctrlKey: true, altKey: true, key: 'l', code: 'KeyL' }));
        await user.click(within(fieldContainer(input)).getByRole('button', { name: 'OK' }));

        await waitFor(async () => {
            expect(await store.get('hotkey_selection_translate')).toBe('Ctrl+Alt+T');
        });
        expect(screen.getByDisplayValue('Ctrl+Alt+T')).toBeInTheDocument();
    });
});
