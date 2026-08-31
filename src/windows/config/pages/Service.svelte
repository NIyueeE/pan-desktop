<script lang="ts">
    import { t } from '../../../lib/i18n/i18n.svelte';

    import ServiceManager from '../components/ServiceManager.svelte';

    let tab = $state<'translate' | 'recognize'>('translate');
</script>

<div class="mb-3 flex justify-center gap-2">
    <button
        type="button"
        class="h-[32px] rounded-lg px-4 text-sm {tab === 'translate'
            ? 'bg-content2 font-medium'
            : 'text-default-400 hover:bg-content2/60'}"
        onclick={() => (tab = 'translate')}
    >
        {t('config.service.translate')}
    </button>
    <button
        type="button"
        class="h-[32px] rounded-lg px-4 text-sm {tab === 'recognize'
            ? 'bg-content2 font-medium'
            : 'text-default-400 hover:bg-content2/60'}"
        onclick={() => (tab = 'recognize')}
    >
        {t('config.service.recognize')}
    </button>
</div>

{#if tab === 'translate'}
    <ServiceManager kind="translate" />
{:else}
    <ServiceManager kind="recognize" />
{/if}
