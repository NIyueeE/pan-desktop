<script lang="ts">
    import { t } from '../../../lib/i18n/i18n.svelte';

    let {
        instanceKey,
        onSaved,
        onClose,
    }: {
        instanceKey: string;
        onSaved: (instanceKey: string) => void;
        onClose: () => void;
    } = $props();

    function save(): void {
        onSaved(instanceKey);
        onClose();
    }
</script>

<p class="mb-3 text-sm text-default-400">{t('services.no_need')}</p>
<button
    type="button"
    class="h-[34px] w-full rounded-lg bg-primary text-sm text-primary-foreground hover:opacity-90"
    onclick={save}
>
    {t('common.save')}
</button>
