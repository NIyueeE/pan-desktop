<script lang="ts">
    import { toast, Toaster } from 'svelte-sonner';

    import { cfgRaw, writeThrough } from '../../../lib/config/store.svelte';
    import { t } from '../../../lib/i18n/i18n.svelte';
    import { recognize } from '../../../lib/services/recognize/openai';
    import type { OpenAiOcrConfig } from '../../../lib/services/recognize/openai';
    import { INSTANCE_NAME_CONFIG_KEY } from '../../../lib/utils/service_instance';
    import { themeState } from '../../../lib/utils/theme.svelte';
    import SettingRow from '../../../lib/ui/SettingRow.svelte';
    import TextField from '../../../lib/ui/TextField.svelte';

    const {
        instanceKey,
        onSaved,
        onClose,
    }: {
        instanceKey: string;
        onSaved: (instanceKey: string) => void;
        onClose: () => void;
    } = $props();

    // A valid 1x1 PNG used to verify the endpoint/model/key combination; a
    // vision model resolves the request (possibly with empty text), which is
    // all the test needs to prove connectivity.
    const TEST_IMAGE_BASE64 =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

    // Merge the stored instance over the defaults so partially stored configs
    // (e.g. restored backups) still populate every field. The modal remounts
    // per edited instance ({#if configModalOpen} in ServiceManager), so the
    // editable form is seeded from props exactly once, at mount.
    function seededConfig(): OpenAiOcrConfig {
        return {
            [INSTANCE_NAME_CONFIG_KEY]: t('services.recognize.openai.title'),
            requestPath: 'https://api.openai.com/v1/chat/completions',
            model: 'gpt-4o-mini',
            apiKey: '',
            prompt: '',
            ...((cfgRaw(instanceKey) as OpenAiOcrConfig | undefined) ?? {}),
        };
    }

    const config = $state<OpenAiOcrConfig>(seededConfig());

    let isLoading = $state(false);

    function save(): void {
        isLoading = true;
        recognize(TEST_IMAGE_BASE64, 'auto', { config }).then(
            () => {
                isLoading = false;
                void writeThrough(instanceKey, { ...config });
                onSaved(instanceKey);
                onClose();
            },
            (e: unknown) => {
                isLoading = false;
                toast.error(`${t('config.service.test_failed')}${e instanceof Error ? e.message : String(e)}`);
            }
        );
    }
</script>

<Toaster theme={themeState.resolved} position="bottom-right" richColors />

<form
    onsubmit={(e) => {
        e.preventDefault();
        save();
    }}
>
    <SettingRow label={t('services.instance_name')}>
        <TextField
            value={String(config[INSTANCE_NAME_CONFIG_KEY] ?? '')}
            class="w-[240px]"
            onValueChange={(v) => (config[INSTANCE_NAME_CONFIG_KEY] = v)}
        />
    </SettingRow>
    <SettingRow label={t('services.recognize.openai.request_path')}>
        <TextField value={config.requestPath ?? ''} class="w-[240px]" onValueChange={(v) => (config.requestPath = v)} />
    </SettingRow>
    <SettingRow label={t('services.recognize.openai.api_key')}>
        <TextField
            type="password"
            value={config.apiKey ?? ''}
            class="w-[240px]"
            onValueChange={(v) => (config.apiKey = v)}
        />
    </SettingRow>
    <SettingRow label={t('services.recognize.openai.model')}>
        <TextField value={config.model ?? ''} class="w-[240px]" onValueChange={(v) => (config.model = v)} />
    </SettingRow>
    <label class="mb-2 block">
        <span class="mb-1 block text-sm">{t('services.recognize.openai.prompt')}</span>
        <textarea
            value={config.prompt ?? ''}
            class="w-full resize-y rounded-md bg-content2 p-2 text-sm outline-none select-text focus:bg-content3"
            rows="3"
            oninput={(e) => (config.prompt = e.currentTarget.value)}></textarea>
        <span class="text-[10px] text-default-400">{t('services.recognize.openai.prompt_description')}</span>
    </label>

    <button
        type="submit"
        disabled={isLoading}
        class="mt-2 h-[34px] w-full rounded-lg bg-primary text-sm text-primary-foreground hover:opacity-90 disabled:opacity-60"
    >
        {t('common.save')}
    </button>
</form>
