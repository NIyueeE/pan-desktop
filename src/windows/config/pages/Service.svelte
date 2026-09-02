<script lang="ts">
    import { t } from '../../../lib/i18n/i18n.svelte';
    import { cfg, setConfig, trackConfigKeys } from '../../../lib/config/store.svelte';
    import PSelect from '../../../lib/ui/PSelect.svelte';
    import PSwitch from '../../../lib/ui/PSwitch.svelte';
    import Section from '../../../lib/ui/Section.svelte';
    import SettingRow from '../../../lib/ui/SettingRow.svelte';
    import { languageList } from '../../../lib/utils/language';

    import ServiceManager from '../components/ServiceManager.svelte';

    let tab = $state<'translate' | 'recognize' | 'tts'>('translate');

    const tabs = ['translate', 'recognize', 'tts'] as const;

    // The recognition options live at the bottom of the OCR tab, below the
    // instance list and its add button.
    void trackConfigKeys(['recognize_language', 'recognize_delete_newline']);

    const languageItems = $derived([
        { value: 'auto', label: t('languages.auto') },
        ...languageList.map((code) => ({ value: code, label: t(`languages.${code}`) })),
    ]);
</script>

<div class="mb-3 flex justify-center gap-2">
    {#each tabs as item (item)}
        <button
            type="button"
            class="h-[32px] rounded-lg px-4 text-sm {tab === item
                ? 'bg-content2 font-medium'
                : 'text-default-400 hover:bg-content2/60'}"
            onclick={() => (tab = item)}
        >
            {t(`config.service.${item}`)}
        </button>
    {/each}
</div>

{#if tab === 'translate'}
    <ServiceManager kind="translate" hideHeading />
{:else if tab === 'recognize'}
    <ServiceManager kind="recognize" hideHeading />
    <Section title={t('config.recognize.options')}>
        <SettingRow label={t('config.recognize.language')} description={t('config.recognize.language_tip')}>
            <PSelect
                value={cfg('recognize_language')}
                items={languageItems}
                triggerClass="min-w-[160px]"
                onValueChange={(v) => setConfig('recognize_language', v)}
            />
        </SettingRow>
        <SettingRow label={t('config.recognize.delete_newline')}>
            <PSwitch
                checked={cfg('recognize_delete_newline')}
                onCheckedChange={(v) => setConfig('recognize_delete_newline', v)}
            />
        </SettingRow>
    </Section>
{:else}
    <ServiceManager kind="tts" hideHeading />
{/if}
