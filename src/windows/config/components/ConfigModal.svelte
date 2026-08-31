<script lang="ts">
    import { Dialog } from 'bits-ui';

    import { t } from '../../../lib/i18n/i18n.svelte';
    import { appEnv } from '../../../lib/utils/env.svelte';
    import { getServiceName } from '../../../lib/utils/service_instance';
    import { recognizeRegistry, translateRegistry, type RecognizeServiceName, type TranslateServiceName } from './registry';

    import NoConfigNeeded from './NoConfigNeeded.svelte';
    import OpenAiOcrConfig from './OpenAiOcrConfig.svelte';
    import OpenAiTranslateConfig from './OpenAiTranslateConfig.svelte';

    let {
        kind,
        instanceKey,
        onClose,
        onSaved,
    }: {
        kind: 'translate' | 'recognize';
        instanceKey: string;
        onClose: () => void;
        onSaved: (instanceKey: string) => void;
    } = $props();

    let open = $state(true);

    const serviceName = $derived(getServiceName(instanceKey));

    function serviceIcon(): string {
        if (kind === 'recognize' && serviceName === 'system') {
            return `logo/${appEnv.osType}.svg`;
        }
        const icon =
            kind === 'translate'
                ? translateRegistry[serviceName as TranslateServiceName]?.info.icon
                : recognizeRegistry[serviceName as RecognizeServiceName]?.info.icon;
        return icon ?? '';
    }
</script>

<Dialog.Root
    bind:open
    onOpenChange={(o) => {
        if (!o) {
            onClose();
        }
    }}
>
    <Dialog.Portal>
        <Dialog.Overlay class="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content
            class="fixed top-1/2 left-1/2 z-50 max-h-[75vh] w-[520px] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-content1 p-4 shadow-xl"
        >
            <Dialog.Title class="mb-3 flex items-center gap-2 font-medium">
                <img
                    src={serviceIcon()}
                    alt=""
                    class="h-[24px] w-[24px]"
                    draggable="false"
                />
                {t(`services.${kind}.${serviceName}.title`)}
            </Dialog.Title>
            {#if serviceName === 'openai' && kind === 'translate'}
                <OpenAiTranslateConfig
                    {instanceKey}
                    onSaved={onSaved}
                    onClose={onClose}
                />
            {:else if serviceName === 'openai' && kind === 'recognize'}
                <OpenAiOcrConfig
                    {instanceKey}
                    onSaved={onSaved}
                    onClose={onClose}
                />
            {:else}
                <NoConfigNeeded
                    {instanceKey}
                    onSaved={onSaved}
                    onClose={onClose}
                />
            {/if}
            <div class="mt-3 flex justify-end">
                <button
                    type="button"
                    class="h-[32px] rounded-md px-3 text-sm text-danger hover:bg-danger/10"
                    onclick={onClose}
                >
                    {t('common.cancel')}
                </button>
            </div>
        </Dialog.Content>
    </Dialog.Portal>
</Dialog.Root>
