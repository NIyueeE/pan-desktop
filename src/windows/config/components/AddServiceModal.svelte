<script lang="ts">
    import { Dialog } from 'bits-ui';

    import { t } from '../../../lib/i18n/i18n.svelte';
    import { appEnv } from '../../../lib/utils/env.svelte';
    import { recognizeRegistry, translateRegistry, type RecognizeServiceName, type TranslateServiceName } from './registry';

    let {
        kind,
        serviceNames,
        onClose,
        onPick,
    }: {
        kind: 'translate' | 'recognize';
        serviceNames: readonly string[];
        onClose: () => void;
        onPick: (serviceName: string) => void;
    } = $props();

    let open = $state(true);

    function serviceIcon(serviceName: string): string {
        if (kind === 'recognize' && serviceName === 'system') {
            return `logo/${appEnv.osType}.svg`;
        }
        const icon =
            kind === 'translate'
                ? translateRegistry[serviceName as TranslateServiceName]?.info.icon
                : recognizeRegistry[serviceName as RecognizeServiceName]?.info.icon;
        return icon ?? '';
    }

    function serviceLabel(serviceName: string): string {
        return t(`services.${kind}.${serviceName}.title`);
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
            class="fixed top-1/2 left-1/2 z-50 max-h-[80vh] w-[420px] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-content1 p-4 shadow-xl"
        >
            <Dialog.Title class="mb-3 font-medium">{t('config.service.add_service')}</Dialog.Title>
            {#each serviceNames as serviceName (serviceName)}
                <button
                    type="button"
                    class="mb-2 flex h-[40px] w-full items-center gap-3 rounded-lg bg-content2 px-3 text-sm hover:bg-content3"
                    onclick={() => onPick(serviceName)}
                >
                    <img
                        src={serviceIcon(serviceName)}
                        alt=""
                        class="h-[24px] w-[24px]"
                        draggable="false"
                    />
                    {serviceLabel(serviceName)}
                </button>
            {/each}
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
