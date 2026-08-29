import { isRegistered } from '@tauri-apps/plugin-global-shortcut';
import toast, { Toaster } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { CardBody } from '@nextui-org/react';
import { Button } from '@nextui-org/react';
import { Input } from '@nextui-org/react';
import { Card } from '@nextui-org/react';
import React, { useRef, useState } from 'react';

import { useConfig } from '../../../../hooks/useConfig';
import { useToastStyle } from '../../../../hooks';
import { osType } from '../../../../utils/env';
import { invoke } from '@tauri-apps/api/core';

const keyMap = {
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

export function formatHotkeyEvent(e) {
    if (e.keyCode === 8) {
        // Backspace clears the binding.
        return '';
    }
    let newValue = '';
    if (e.ctrlKey) {
        newValue = 'Ctrl';
    }
    if (e.shiftKey) {
        newValue = `${newValue}${newValue.length > 0 ? '+' : ''}Shift`;
    }
    if (e.metaKey) {
        newValue = `${newValue}${newValue.length > 0 ? '+' : ''}${osType === 'Darwin' ? 'Command' : 'Super'}`;
    }
    if (e.altKey) {
        newValue = `${newValue}${newValue.length > 0 ? '+' : ''}Alt`;
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
    } else if (keyMap[code] !== undefined) {
        code = keyMap[code];
    } else {
        code = '';
    }
    // A modifier alone (e.g. the first Ctrl of a combo) is not a hotkey yet.
    if (code === '' || MODIFIER_KEYS.includes(e.key)) {
        return null;
    }
    return `${newValue}${newValue.length > 0 && code.length > 0 ? '+' : ''}${code}`;
}

export default function Hotkey() {
    const [selectionTranslate, setSelectionTranslate] = useConfig('hotkey_selection_translate', '');
    const [inputTranslate, setInputTranslate] = useConfig('hotkey_input_translate', '');
    const [ocrTranslate, setOcrTranslate] = useConfig('hotkey_ocr_translate', '');

    const { t } = useTranslation();
    const toastStyle = useToastStyle();
    // The value the field had before editing; leaving without pressing OK
    // restores it (previously focusing the field silently killed the
    // registered hotkey).
    const draftRef = useRef({});
    // Delayed blur restore: pressing OK moves focus out of the input, and the
    // restore must not clobber the new value before/while it is applied.
    const blurTimersRef = useRef({});
    const [, forceRender] = useState(0);

    const setters = {
        hotkey_selection_translate: setSelectionTranslate,
        hotkey_input_translate: setInputTranslate,
        hotkey_ocr_translate: setOcrTranslate,
    };

    function snapshot(name, value) {
        if (draftRef.current[name] === undefined) {
            draftRef.current[name] = value ?? '';
        }
    }

    function cancelBlurRestore(name) {
        if (blurTimersRef.current[name]) {
            clearTimeout(blurTimersRef.current[name]);
            delete blurTimersRef.current[name];
        }
    }

    function restoreDraft(name) {
        cancelBlurRestore(name);
        const previous = draftRef.current[name];
        delete draftRef.current[name];
        if (previous !== undefined) {
            setters[name](previous, true);
        }
        forceRender((n) => n + 1);
    }

    function applyHotkey(name, key) {
        const submit = () =>
            // The Rust side unregisters the previous binding of this action,
            // registers the new one (or clears it) and persists.
            invoke('register_shortcut_by_frontend', { name, shortcut: key }).then(
                () => {
                    setters[name](key, true);
                    delete draftRef.current[name];
                    cancelBlurRestore(name);
                    toast.success(key === '' ? t('config.hotkey.cleared') : t('config.hotkey.success'), {
                        style: toastStyle,
                    });
                },
                (e) => {
                    // Registration failed; the previous binding is still
                    // active, so put it back into the field.
                    toast.error(typeof e === 'string' ? e : String(e?.message ?? e), {
                        style: toastStyle,
                    });
                    restoreDraft(name);
                }
            );
        if (key === '') {
            submit();
            return;
        }
        isRegistered(key)
            .then((res) => {
                if (res) {
                    toast.error(t('config.hotkey.is_register'), { style: toastStyle });
                    return;
                }
                return submit();
            })
            .catch((e) => {
                toast.error(String(e), { style: toastStyle });
            });
    }

    function keyDown(name, value, e) {
        e.preventDefault();
        const formatted = formatHotkeyEvent(e);
        if (formatted === null) {
            return;
        }
        if (formatted === '') {
            // Cleared explicitly: apply immediately so the old binding does
            // not stay registered until the next restart.
            applyHotkey(name, '');
            return;
        }
        snapshot(name, value);
        setters[name](formatted);
    }

    const fields = [
        {
            name: 'hotkey_selection_translate',
            label: t('config.hotkey.selection_translate'),
            value: selectionTranslate,
        },
        {
            name: 'hotkey_input_translate',
            label: t('config.hotkey.input_translate'),
            value: inputTranslate,
        },
        {
            name: 'hotkey_ocr_translate',
            label: t('config.hotkey.ocr_translate'),
            value: ocrTranslate,
        },
    ];

    return (
        <Card>
            <Toaster />
            <CardBody>
                {fields.map((field) => (
                    <div
                        key={field.name}
                        className='config-item'
                    >
                        <h3 className='my-auto'>{field.label}</h3>
                        {field.value !== null && (
                            <Input
                                type='hotkey'
                                variant='bordered'
                                value={field.value}
                                label={t('config.hotkey.set_hotkey')}
                                className='max-w-[50%]'
                                onKeyDown={(e) => {
                                    keyDown(field.name, field.value, e);
                                }}
                                onBlur={() => {
                                    // Leaving the field without pressing OK
                                    // keeps the previous hotkey alive. The
                                    // restore is delayed so an OK click (which
                                    // blurs the input first) can cancel it.
                                    cancelBlurRestore(field.name);
                                    blurTimersRef.current[field.name] = setTimeout(() => {
                                        restoreDraft(field.name);
                                    }, 150);
                                }}
                                endContent={
                                    <Button
                                        size='sm'
                                        variant='flat'
                                        className={`${field.value === '' && 'hidden'}`}
                                        onPress={() => {
                                            cancelBlurRestore(field.name);
                                            applyHotkey(field.name, field.value);
                                        }}
                                    >
                                        {t('common.ok')}
                                    </Button>
                                }
                            />
                        )}
                    </div>
                ))}
            </CardBody>
        </Card>
    );
}
