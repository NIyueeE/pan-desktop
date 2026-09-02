<script lang="ts">
    import { Plus, Trash2 } from '@lucide/svelte';
    import { toast, Toaster } from 'svelte-sonner';

    import { cfgRaw, writeThrough } from '../../../lib/config/store.svelte';
    import { t } from '../../../lib/i18n/i18n.svelte';
    import {
        DEFAULT_PROMPT_LIST,
        DEFAULT_REQUEST_ARGUMENTS,
        Language,
        translate as translateText,
    } from '../../../lib/services/translate/openai';
    import type { OpenAiTranslateConfig, PromptMessage } from '../../../lib/services/translate/openai';
    import { INSTANCE_NAME_CONFIG_KEY } from '../../../lib/utils/service_instance';
    import { themeState } from '../../../lib/utils/theme.svelte';
    import PSwitch from '../../../lib/ui/PSwitch.svelte';
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

    // Merge the stored instance over the defaults so partially stored configs
    // (e.g. restored backups) still populate every field. The modal remounts
    // per edited instance ({#if configModalOpen} in ServiceManager), so the
    // editable form is seeded from props exactly once, at mount.
    function seededConfig(): OpenAiTranslateConfig {
        return {
            [INSTANCE_NAME_CONFIG_KEY]: t('services.translate.openai.title'),
            requestPath: 'https://api.openai.com/v1/chat/completions',
            model: 'gpt-3.5-turbo',
            apiKey: '',
            stream: false,
            promptList: DEFAULT_PROMPT_LIST,
            requestArguments: DEFAULT_REQUEST_ARGUMENTS,
            ...((cfgRaw(instanceKey) as OpenAiTranslateConfig | undefined) ?? {}),
        };
    }

    const config = $state<OpenAiTranslateConfig>(seededConfig());

    let isLoading = $state(false);

    function promptRole(index: number): PromptMessage['role'] {
        return index === 0 ? 'system' : index % 2 !== 0 ? 'user' : 'assistant';
    }

    function addPrompt(): void {
        config.promptList = [
            ...(config.promptList ?? []),
            {
                role: (config.promptList?.length ?? 0) === 0 ? 'system' : promptRole(config.promptList?.length ?? 0),
                content: '',
            },
        ];
    }

    function removePrompt(index: number): void {
        config.promptList = (config.promptList ?? []).filter((_, i) => i !== index);
    }

    function save(): void {
        isLoading = true;
        // "hello" is translated as a connectivity test before persisting —
        // a failing endpoint must not be saved (legacy behavior).
        translateText('hello', Language.auto, Language.zh_cn, { config }).then(
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
    <SettingRow label={t('services.translate.openai.request_path')}>
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
    <SettingRow label={t('services.translate.openai.stream')}>
        <PSwitch checked={config.stream ?? false} onCheckedChange={(v) => (config.stream = v)} />
    </SettingRow>

    <h3 class="mt-2 mb-1 font-medium">Prompt List</h3>
    <p class="mb-2 text-[10px] text-default-400">{t('services.translate.openai.prompt_description')}</p>
    <div class="rounded-lg bg-content2/60 p-3">
        {#each config.promptList ?? [] as prompt, index (index)}
            <div class="mb-2">
                <label class="block">
                    <span class="mb-1 block text-xs text-default-400">{prompt.role}</span>
                    <textarea
                        value={prompt.content}
                        placeholder={`Input some ${prompt.role} prompt`}
                        class="w-full resize-y rounded-md bg-content2 p-2 text-sm outline-none select-text focus:bg-content3"
                        rows="2"
                        oninput={(e) => {
                            const list = config.promptList ?? [];
                            list[index] = { role: promptRole(index), content: e.currentTarget.value };
                            config.promptList = list;
                        }}></textarea>
                </label>
                <button
                    type="button"
                    class="mt-1 flex h-[26px] w-[26px] items-center justify-center rounded-md text-danger hover:bg-danger/10"
                    aria-label="Remove prompt"
                    onclick={() => removePrompt(index)}
                >
                    <Trash2 class="size-[15px]" />
                </button>
            </div>
        {/each}
        <button
            type="button"
            class="h-[32px] w-full rounded-md bg-content1 text-sm hover:bg-content3"
            onclick={addPrompt}
        >
            <Plus class="mr-1 inline size-[14px]" />
            {t('services.translate.openai.add')}
        </button>
    </div>

    <h3 class="mt-3 mb-1 font-medium">Request Arguments</h3>
    <textarea
        value={config.requestArguments ?? ''}
        placeholder="Input API request arguments (JSON)"
        class="w-full resize-y rounded-md bg-content2 p-2 font-mono text-xs outline-none select-text focus:bg-content3"
        rows="3"
        oninput={(e) => (config.requestArguments = e.currentTarget.value)}></textarea>

    <button
        type="submit"
        disabled={isLoading}
        class="mt-3 h-[34px] w-full rounded-lg bg-primary text-sm text-primary-foreground hover:opacity-90 disabled:opacity-60"
    >
        {t('common.save')}
    </button>
</form>
