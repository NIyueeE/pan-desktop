<script lang="ts">
    import { toast, Toaster } from 'svelte-sonner';

    import { cfg, setConfig, trackConfigKeys, writeThrough } from '../../../lib/config/store.svelte';
    import { isRegistered } from '@tauri-apps/plugin-global-shortcut';
    import { registerShortcut, type ShortcutName } from '../../../lib/ipc/commands';
    import { t } from '../../../lib/i18n/i18n.svelte';
    import { appEnv } from '../../../lib/utils/env.svelte';
    import { themeState } from '../../../lib/utils/theme.svelte';
    import Section from '../../../lib/ui/Section.svelte';
    import SettingRow from '../../../lib/ui/SettingRow.svelte';
    import HotkeyInput from '../components/HotkeyInput.svelte';

    void trackConfigKeys(['hotkey_selection_translate', 'hotkey_input_translate', 'hotkey_ocr_translate']);

    const fields = $derived([
        {
            name: 'hotkey_selection_translate' as ShortcutName,
            label: t('config.hotkey.selection_translate'),
            value: cfg('hotkey_selection_translate'),
        },
        {
            name: 'hotkey_input_translate' as ShortcutName,
            label: t('config.hotkey.input_translate'),
            value: cfg('hotkey_input_translate'),
        },
        {
            name: 'hotkey_ocr_translate' as ShortcutName,
            label: t('config.hotkey.ocr_translate'),
            value: cfg('hotkey_ocr_translate'),
        },
    ]);

    function applyHotkey(name: ShortcutName, key: string, restore: () => void): void {
        const submit = () =>
            // The Rust side unregisters the previous binding of this action,
            // registers the new one (or clears it) and persists.
            registerShortcut(name, key).then(
                () => {
                    void writeThrough(name, key);
                    toast.success(key === '' ? t('config.hotkey.cleared') : t('config.hotkey.success'));
                },
                (e: unknown) => {
                    // Registration failed; the previous binding is still
                    // active, so put it back into the field.
                    toast.error(typeof e === 'string' ? e : String(e));
                    restore();
                }
            );
        if (key === '') {
            submit();
            return;
        }
        isRegistered(key)
            .then((registered) => {
                if (registered) {
                    toast.error(t('config.hotkey.is_register'));
                    return;
                }
                submit();
            })
            .catch((e: unknown) => {
                toast.error(String(e));
            });
    }

    function onDraftChange(name: ShortcutName, value: string): void {
        setConfig(name, value);
    }
</script>

<Toaster theme={themeState.resolved} position="bottom-right" richColors />

<Section>
    {#each fields as field (field.name)}
        <SettingRow label={field.label}>
            <HotkeyInput
                value={field.value}
                osType={appEnv.osType}
                placeholder={t('config.hotkey.set_hotkey')}
                onDraft={(v) => onDraftChange(field.name, v)}
                onApply={(key, restore) => applyHotkey(field.name, key, restore)}
            />
        </SettingRow>
    {/each}
</Section>
