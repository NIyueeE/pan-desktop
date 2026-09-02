<script lang="ts">
    import { Toaster } from 'svelte-sonner';

    import { cfgRaw, writeThrough } from '../../../lib/config/store.svelte';
    import { t } from '../../../lib/i18n/i18n.svelte';
    import type { OpenAiTtsConfig } from '../../../lib/services/tts/openai';
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

    // Seed from props once at mount (the modal remounts per instance); no
    // connectivity test on save — speaking a test clip out of a settings
    // window would be surprising. Bad configs surface on first use instead.
    function seededConfig(): OpenAiTtsConfig {
        return {
            [INSTANCE_NAME_CONFIG_KEY]: t('services.tts.openai.title'),
            requestPath: 'https://api.openai.com/v1/audio/speech',
            apiKey: '',
            model: 'tts-1',
            voice: 'alloy',
            ...((cfgRaw(instanceKey) as OpenAiTtsConfig | undefined) ?? {}),
        };
    }

    const config = $state<OpenAiTtsConfig>(seededConfig());

    function save(): void {
        void writeThrough(instanceKey, { ...config });
        onSaved(instanceKey);
        onClose();
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
    <SettingRow label={t('services.tts.openai.request_path')}>
        <TextField
            value={config.requestPath ?? ''}
            class="w-[240px]"
            required
            onValueChange={(v) => (config.requestPath = v)}
        />
    </SettingRow>
    <p class="mb-2 text-[10px] text-default-400">{t('services.translate.openai.compatible_hint')}</p>
    <SettingRow label={t('services.translate.openai.api_key')}>
        <TextField
            type="password"
            value={config.apiKey ?? ''}
            class="w-[240px]"
            onValueChange={(v) => (config.apiKey = v)}
        />
    </SettingRow>
    <SettingRow label={t('services.translate.openai.model')}>
        <TextField value={config.model ?? ''} class="w-[240px]" onValueChange={(v) => (config.model = v)} />
    </SettingRow>
    <SettingRow label={t('services.tts.openai.voice')}>
        <TextField value={config.voice ?? ''} class="w-[240px]" onValueChange={(v) => (config.voice = v)} />
    </SettingRow>

    <button
        type="submit"
        class="mt-3 h-[34px] w-full rounded-lg bg-primary text-sm text-primary-foreground hover:opacity-90"
    >
        {t('common.save')}
    </button>
</form>
