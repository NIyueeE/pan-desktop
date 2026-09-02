<script lang="ts">
    import { t } from '../../../lib/i18n/i18n.svelte';
    import { cfg, setConfig, trackConfigKeys } from '../../../lib/config/store.svelte';
    import type { ConfigSchema } from '../../../lib/config/defaults';
    import { updateTray } from '../../../lib/ipc/commands';
    import PSelect from '../../../lib/ui/PSelect.svelte';
    import PSwitch from '../../../lib/ui/PSwitch.svelte';
    import Section from '../../../lib/ui/Section.svelte';
    import SettingRow from '../../../lib/ui/SettingRow.svelte';
    import { languageList } from '../../../lib/utils/language';
    import ServiceManager from '../components/ServiceManager.svelte';
    import {
        AUTO_COPY_MODES,
        TRANSLATE_LAYOUTS,
        type AutoCopyMode,
        type TranslateLayout,
    } from '../../../lib/config/defaults';

    void trackConfigKeys([
        'translate_source_language',
        'translate_target_language',
        'translate_second_language',
        'translate_auto_copy',
        'incremental_translate',
        'dynamic_translate',
        'translate_delete_newline',
        'translate_remember_language',
        'translate_layout',
        'translate_window_position',
        'translate_opacity',
        'translate_remember_window_size',
        'translate_close_on_blur',
        'translate_keep_alive',
        'translate_always_on_top',
        'translate_hide_window',
        'dictionary_enabled',
        'dictionary_service_list',
    ]);

    const languageItems = $derived([
        { value: 'auto', label: t('languages.auto') },
        ...languageList.map((code) => ({ value: code, label: t(`languages.${code}`) })),
    ]);
    const targetLanguageItems = $derived(languageList.map((code) => ({ value: code, label: t(`languages.${code}`) })));

    const layoutItems = $derived(
        TRANSLATE_LAYOUTS.map((layout) => ({ value: layout, label: t(`config.translate.layout_${layout}`) }))
    );
    const autoCopyItems = $derived(
        AUTO_COPY_MODES.map((mode) => ({ value: mode, label: t(`config.translate.${mode}`) }))
    );
    const positionItems = $derived([
        { value: 'mouse', label: t('config.translate.mouse') },
        { value: 'pre_state', label: t('config.translate.pre_state') },
    ]);

    function onAutoCopyChange(mode: string): void {
        setConfig('translate_auto_copy', mode as AutoCopyMode);
        void updateTray('', mode);
    }
</script>

<Section>
    <SettingRow label={t('config.translate.source_language')}>
        <PSelect
            value={cfg('translate_source_language')}
            items={languageItems}
            triggerClass="min-w-[160px]"
            onValueChange={(v) => setConfig('translate_source_language', v)}
        />
    </SettingRow>
    <SettingRow label={t('config.translate.target_language')}>
        <PSelect
            value={cfg('translate_target_language')}
            items={targetLanguageItems}
            triggerClass="min-w-[160px]"
            onValueChange={(v) => setConfig('translate_target_language', v)}
        />
    </SettingRow>
    <SettingRow label={t('config.translate.second_language')} description={t('config.translate.second_language_tip')}>
        <PSelect
            value={cfg('translate_second_language')}
            items={targetLanguageItems}
            triggerClass="min-w-[160px]"
            onValueChange={(v) => setConfig('translate_second_language', v)}
        />
    </SettingRow>
</Section>

<Section>
    <SettingRow label={t('config.translate.auto_copy')}>
        <PSelect
            value={cfg('translate_auto_copy')}
            items={autoCopyItems}
            triggerClass="min-w-[160px]"
            onValueChange={onAutoCopyChange}
        />
    </SettingRow>
    <SettingRow label={t('config.translate.incremental_translate')}>
        <PSwitch
            checked={cfg('incremental_translate')}
            onCheckedChange={(v) => setConfig('incremental_translate', v)}
        />
    </SettingRow>
    <SettingRow label={t('config.translate.dynamic_translate')}>
        <PSwitch checked={cfg('dynamic_translate')} onCheckedChange={(v) => setConfig('dynamic_translate', v)} />
    </SettingRow>
    <SettingRow label={t('config.translate.delete_newline')}>
        <PSwitch
            checked={cfg('translate_delete_newline')}
            onCheckedChange={(v) => setConfig('translate_delete_newline', v)}
        />
    </SettingRow>
    <SettingRow label={t('config.translate.remember_language')}>
        <PSwitch
            checked={cfg('translate_remember_language')}
            onCheckedChange={(v) => setConfig('translate_remember_language', v)}
        />
    </SettingRow>
</Section>

<Section>
    <SettingRow label={t('config.translate.layout')}>
        <PSelect
            value={cfg('translate_layout')}
            items={layoutItems}
            triggerClass="min-w-[160px]"
            onValueChange={(v) => setConfig('translate_layout', v as TranslateLayout)}
        />
    </SettingRow>
    <SettingRow label={t('config.translate.window_position')}>
        <PSelect
            value={cfg('translate_window_position')}
            items={positionItems}
            triggerClass="min-w-[160px]"
            onValueChange={(v) =>
                setConfig('translate_window_position', v as ConfigSchema['translate_window_position'])}
        />
    </SettingRow>
    <SettingRow label={t('config.translate.opacity')}>
        <div class="flex items-center gap-2">
            <input
                type="range"
                min="10"
                max="100"
                step="5"
                aria-label={t('config.translate.opacity')}
                value={cfg('translate_opacity')}
                oninput={(e) => setConfig('translate_opacity', Number(e.currentTarget.value))}
                class="w-[140px] accent-[var(--color-primary)]"
            />
            <span class="w-[40px] text-right text-xs text-default-400">{cfg('translate_opacity')}%</span>
        </div>
    </SettingRow>
    <SettingRow label={t('config.translate.remember_window_size')}>
        <PSwitch
            checked={cfg('translate_remember_window_size')}
            onCheckedChange={(v) => setConfig('translate_remember_window_size', v)}
        />
    </SettingRow>
    <SettingRow label={t('config.translate.close_on_blur')}>
        <PSwitch
            checked={cfg('translate_close_on_blur')}
            onCheckedChange={(v) => setConfig('translate_close_on_blur', v)}
        />
    </SettingRow>
    <SettingRow label={t('config.translate.keep_alive')} description={t('config.translate.keep_alive_tip')}>
        <PSwitch checked={cfg('translate_keep_alive')} onCheckedChange={(v) => setConfig('translate_keep_alive', v)} />
    </SettingRow>
    <SettingRow label={t('config.translate.always_on_top')}>
        <PSwitch
            checked={cfg('translate_always_on_top')}
            onCheckedChange={(v) => setConfig('translate_always_on_top', v)}
        />
    </SettingRow>
    <SettingRow label={t('config.translate.hide_window')}>
        <PSwitch
            checked={cfg('translate_hide_window')}
            onCheckedChange={(v) => setConfig('translate_hide_window', v)}
        />
    </SettingRow>
</Section>

<Section title={t('config.translate.dictionary')}>
    <SettingRow label={t('config.translate.dictionary_enabled')}>
        <PSwitch checked={cfg('dictionary_enabled')} onCheckedChange={(v) => setConfig('dictionary_enabled', v)} />
    </SettingRow>
    <!-- Free Dictionary is the only dictionary service and ships with the
         app: the row is pure display (no drag, no add, no delete), toggled
         by the master switch above. -->
    <ServiceManager kind="dictionary" hideHeading hideDrag hideAdd />
</Section>
