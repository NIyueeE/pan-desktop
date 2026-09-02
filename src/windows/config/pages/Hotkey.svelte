<script lang="ts">
    import { toast, Toaster } from 'svelte-sonner';

    import { cfg, trackConfigKeys, writeThrough } from '../../../lib/config/store.svelte';
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

    /** Unsaved captures per action; a capture equal to the stored binding is
     * not a modification. Config is only written on Save (writeThrough), so
     * an abandoned draft never registers or persists anything. */
    let drafts = $state<Partial<Record<ShortcutName, string>>>({});
    let saving = $state(false);

    const modifiedFields = $derived(
        fields.filter((field) => {
            const draft = drafts[field.name];
            return draft !== undefined && draft !== field.value;
        })
    );

    function onDraft(name: ShortcutName, value: string): void {
        drafts[name] = value;
    }

    /** Register one binding through the backend and persist it. The Rust
     * side unregisters the previous binding of this action, registers the
     * new one (or clears it). Resolves false on failure. */
    async function applyOne(name: ShortcutName, key: string): Promise<boolean> {
        const submit = () =>
            registerShortcut(name, key).then(
                () => {
                    void writeThrough(name, key);
                    return true;
                },
                (e: unknown) => {
                    toast.error(typeof e === 'string' ? e : String(e));
                    return false;
                }
            );
        if (key === '') {
            return submit();
        }
        try {
            if (await isRegistered(key)) {
                toast.error(t('config.hotkey.is_register'));
                return false;
            }
        } catch (e) {
            toast.error(String(e));
            return false;
        }
        return submit();
    }

    /** Apply every modified row once. Rows are applied sequentially (the
     * plugin serializes registrations on the main thread anyway); a failed
     * row keeps its draft so the button stays and it can be retried. */
    async function saveAll(): Promise<void> {
        if (saving) {
            return;
        }
        // Snapshot before awaiting: clearing drafts below mutates the
        // derived list mid-loop otherwise.
        const batch = modifiedFields.map((field) => ({ name: field.name, key: drafts[field.name] ?? '' }));
        if (batch.length === 0) {
            return;
        }
        saving = true;
        try {
            let allOk = true;
            for (const { name, key } of batch) {
                if (await applyOne(name, key)) {
                    drafts[name] = undefined;
                } else {
                    allOk = false;
                }
            }
            if (allOk) {
                toast.success(
                    batch.some(({ key }) => key === '') ? t('config.hotkey.cleared') : t('config.hotkey.success')
                );
            }
        } finally {
            saving = false;
        }
    }
</script>

<Toaster theme={themeState.resolved} position="bottom-right" richColors />

<Section>
    {#each fields as field (field.name)}
        <SettingRow label={field.label}>
            <HotkeyInput
                value={field.value}
                draft={drafts[field.name] ?? null}
                osType={appEnv.osType}
                placeholder={t('config.hotkey.set_hotkey')}
                onDraft={(v) => onDraft(field.name, v)}
            />
        </SettingRow>
    {/each}
</Section>

{#if modifiedFields.length > 0}
    <div class="mt-3 flex justify-end">
        <button
            type="button"
            disabled={saving}
            class="h-[32px] rounded-md bg-primary px-4 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-60"
            onclick={() => void saveAll()}
        >
            {t('common.save')}
        </button>
    </div>
{/if}
