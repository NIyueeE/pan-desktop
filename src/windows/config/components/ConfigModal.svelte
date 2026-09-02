<script lang="ts">
    import { Dialog } from 'bits-ui';

    import { t } from '../../../lib/i18n/i18n.svelte';
    import { getServiceName } from '../../../lib/utils/service_instance';
    import { serviceIcon, type ServiceKind } from './registry';

    import NoConfigNeeded from './NoConfigNeeded.svelte';
    import OpenAiOcrConfig from './OpenAiOcrConfig.svelte';
    import OpenAiTranslateConfig from './OpenAiTranslateConfig.svelte';
    import OpenAiTtsConfig from './OpenAiTtsConfig.svelte';

    const {
        kind,
        instanceKey,
        onClose,
        onSaved,
    }: {
        kind: ServiceKind;
        instanceKey: string;
        onClose: () => void;
        onSaved: (instanceKey: string) => void;
    } = $props();

    let open = $state(true);

    const serviceName = $derived(getServiceName(instanceKey));
    // Text-only services (e.g. the OpenAI rows) have no icon — render no
    // placeholder image at all.
    const icon = $derived(serviceIcon(kind, serviceName));
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
                {#if icon}
                    <img src={icon} alt="" class="h-[24px] w-[24px]" draggable="false" />
                {/if}
                {t(`services.${kind}.${serviceName}.title`)}
            </Dialog.Title>
            {#if serviceName === 'openai' && kind === 'translate'}
                <OpenAiTranslateConfig {instanceKey} {onSaved} {onClose} />
            {:else if serviceName === 'openai' && kind === 'recognize'}
                <OpenAiOcrConfig {instanceKey} {onSaved} {onClose} />
            {:else if serviceName === 'openai' && kind === 'tts'}
                <OpenAiTtsConfig {instanceKey} {onSaved} {onClose} />
            {:else}
                <NoConfigNeeded {instanceKey} {onSaved} {onClose} />
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
