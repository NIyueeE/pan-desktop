<script lang="ts">
    import { onMount } from 'svelte';
    import { toast, Toaster } from 'svelte-sonner';

    import { cfg, getStoreInstance, setConfig, trackConfigKeys, writeThrough } from '../../../lib/config/store.svelte';
    import { reloadStore } from '../../../lib/ipc/commands';
    import { t } from '../../../lib/i18n/i18n.svelte';
    import { applyBackup, downloadBackup, testConnection, uploadBackup } from '../../../lib/utils/webdav';
    import { themeState } from '../../../lib/utils/theme.svelte';
    import PSwitch from '../../../lib/ui/PSwitch.svelte';
    import Section from '../../../lib/ui/Section.svelte';
    import SettingRow from '../../../lib/ui/SettingRow.svelte';
    import TextField from '../../../lib/ui/TextField.svelte';

    void trackConfigKeys(['webdav_url', 'webdav_username', 'webdav_password', 'webdav_filename', 'webdav_auto_sync']);

    let busy = $state(false);
    let lastSynced = $state<string | null>(null);

    onMount(() => {
        const store = getStoreInstance();
        if (!store) {
            return;
        }
        void store.get('webdav_last_sync').then((value) => {
            if (value) {
                lastSynced = new Date(Number(value)).toLocaleString();
            }
        });
    });

    const ready = $derived(cfg('webdav_url') !== '' && cfg('webdav_username') !== '' && cfg('webdav_password') !== '');

    async function markSynced(): Promise<void> {
        const now = Date.now();
        await writeThrough('webdav_last_sync', now);
        lastSynced = new Date(now).toLocaleString();
    }

    function run(promise: Promise<void>, successMessage: string): void {
        busy = true;
        promise
            .then(() => {
                toast.success(successMessage, { duration: 2000 });
            })
            .catch((e: unknown) => {
                toast.error(String(e), { duration: 3000 });
            })
            .finally(() => (busy = false));
    }

    const credentials = () => ({
        url: cfg('webdav_url'),
        username: cfg('webdav_username'),
        password: cfg('webdav_password'),
        filename: cfg('webdav_filename'),
    });

    function onTest(): void {
        if (!ready) {
            return;
        }
        const { url, username, password } = credentials();
        run(
            testConnection(url, username, password).then(() => undefined),
            t('config.backup.test_success')
        );
    }

    function onBackup(): void {
        if (!ready) {
            return;
        }
        const { url, username, password, filename } = credentials();
        const store = getStoreInstance();
        if (!store) {
            return;
        }
        run(
            (async () => {
                await uploadBackup(store, url, username, password, filename);
                await markSynced();
                await reloadStore();
            })(),
            t('config.backup.backup_success')
        );
    }

    function onRestore(): void {
        if (!ready) {
            return;
        }
        const { url, username, password, filename } = credentials();
        const store = getStoreInstance();
        if (!store) {
            return;
        }
        // Restoring overwrites every local setting — require explicit consent.
        if (!window.confirm(t('config.backup.restore_confirm'))) {
            return;
        }
        run(
            (async () => {
                const payload = await downloadBackup(url, username, password, filename);
                await applyBackup(store, payload);
                await reloadStore();
                await markSynced();
            })(),
            t('config.backup.load_success')
        );
    }
</script>

<Toaster theme={themeState.resolved} position="bottom-right" richColors />

<Section>
    <SettingRow label={t('config.backup.webdav_url')}>
        <TextField
            value={cfg('webdav_url')}
            placeholder="https://dav.example.com/dav/"
            class="w-[320px]"
            disabled={busy}
            onValueChange={(v) => void writeThrough('webdav_url', v)}
        />
    </SettingRow>
    <SettingRow label={t('config.backup.username')}>
        <TextField
            value={cfg('webdav_username')}
            class="w-[220px]"
            disabled={busy}
            onValueChange={(v) => void writeThrough('webdav_username', v)}
        />
    </SettingRow>
    <SettingRow label={t('config.backup.password')}>
        <TextField
            type="password"
            value={cfg('webdav_password')}
            class="w-[220px]"
            disabled={busy}
            onValueChange={(v) => void writeThrough('webdav_password', v)}
        />
    </SettingRow>
    <SettingRow label={t('config.backup.filename')}>
        <TextField
            value={cfg('webdav_filename')}
            class="w-[220px]"
            disabled={busy}
            onValueChange={(v) => void writeThrough('webdav_filename', v)}
        />
    </SettingRow>
    <button
        type="button"
        class="h-[32px] rounded-md border border-default-200 px-4 text-sm hover:bg-content2 disabled:opacity-50"
        disabled={!ready || busy}
        onclick={onTest}
    >
        {t('config.backup.test')}
    </button>
</Section>

<Section>
    <SettingRow label={t('config.backup.auto_sync')}>
        <PSwitch
            checked={cfg('webdav_auto_sync')}
            disabled={!cfg('webdav_url')}
            onCheckedChange={(v) => setConfig('webdav_auto_sync', v)}
        />
    </SettingRow>
    <p class="mb-2 text-xs text-default-400">{t('config.backup.auto_sync_desc')}</p>
    {#if lastSynced !== null}
        <p class="text-xs text-default-400">{t('config.backup.last_synced')}{lastSynced}</p>
    {/if}
</Section>

<Section>
    <div class="flex justify-start gap-[10px]">
        <button
            type="button"
            class="h-[32px] rounded-md bg-primary px-4 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
            disabled={!ready || busy}
            onclick={onBackup}
        >
            {t('config.backup.backup')}
        </button>
        <button
            type="button"
            class="h-[32px] rounded-md border border-danger/50 px-4 text-sm text-danger hover:bg-danger/10 disabled:opacity-50"
            disabled={!ready || busy}
            onclick={onRestore}
        >
            {t('config.backup.restore')}
        </button>
    </div>
</Section>
