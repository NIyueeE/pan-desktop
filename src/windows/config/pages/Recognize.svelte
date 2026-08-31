<script lang="ts">
    import { t } from '../../../lib/i18n/i18n.svelte';
    import { cfg, setConfig, trackConfigKeys } from '../../../lib/config/store.svelte';
    import PSelect from '../../../lib/ui/PSelect.svelte';
    import PSwitch from '../../../lib/ui/PSwitch.svelte';
    import Section from '../../../lib/ui/Section.svelte';
    import SettingRow from '../../../lib/ui/SettingRow.svelte';
    import { languageLabel, languageList } from '../../../lib/utils/language';

    void trackConfigKeys(['recognize_language', 'recognize_delete_newline']);

    const languageItems = $derived([
        { value: 'auto', label: t('languages.auto') },
        ...languageList.map((code) => ({ value: code, label: t(`languages.${code}`) })),
    ]);
</script>

<Section>
    <SettingRow label={t('config.recognize.language')}>
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
