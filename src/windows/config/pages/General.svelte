<script lang="ts">
    import { disable as disableAutostart, enable as enableAutostart, isEnabled } from '@tauri-apps/plugin-autostart';
    import { onMount } from 'svelte';

    import { cfg, setConfig, trackConfigKeys } from '../../../lib/config/store.svelte';
    import type { ConfigSchema } from '../../../lib/config/defaults';
    import { fontList, updateTray } from '../../../lib/ipc/commands';
    import { changeAppLanguage, t, APP_LANGUAGES } from '../../../lib/i18n/i18n.svelte';
    import PSelect from '../../../lib/ui/PSelect.svelte';
    import PSwitch from '../../../lib/ui/PSwitch.svelte';
    import Section from '../../../lib/ui/Section.svelte';
    import SettingRow from '../../../lib/ui/SettingRow.svelte';
    import { appEnv } from '../../../lib/utils/env.svelte';
    import { applyTheme } from '../../../lib/utils/theme.svelte';

    void trackConfigKeys(['app_language', 'app_theme', 'app_font', 'app_font_size', 'transparent', 'tray_click_event']);

    let fonts = $state<string[]>([]);
    let autoStart = $state(false);

    onMount(() => {
        void isEnabled().then((v) => (autoStart = v));
        void fontList().then((v) => (fonts = v));
    });

    const languageItems = $derived(Object.entries(APP_LANGUAGES).map(([code, name]) => ({ value: code, label: name })));
    const themeItems = $derived([
        { value: 'system', label: t('config.general.theme.system') },
        { value: 'light', label: t('config.general.theme.light') },
        { value: 'dark', label: t('config.general.theme.dark') },
    ]);
    const trayEventItems = $derived([
        { value: 'config', label: t('config.general.event.config') },
        { value: 'translate', label: t('config.general.event.translate') },
        { value: 'ocr_translate', label: t('config.general.event.ocr_translate') },
        { value: 'disable', label: t('config.general.event.disable') },
    ]);
    const fontSizeItems = [10, 12, 14, 16, 18, 20, 24].map((size) => ({ value: String(size), label: `${size} px` }));
    const fontItems = $derived([
        { value: 'default', label: t('config.general.default_font') },
        ...fonts.map((font) => ({ value: font, label: font })),
    ]);

    const isWindows = $derived(appEnv.osType === 'Windows_NT');
    const isMac = $derived(appEnv.osType === 'Darwin');

    function onLanguageChange(code: string): void {
        setConfig('app_language', code);
        void changeAppLanguage(code);
        void updateTray(code, '');
    }

    function onThemeChange(theme: string): void {
        setConfig('app_theme', theme as ConfigSchema['app_theme']);
        applyTheme(theme as ConfigSchema['app_theme']);
    }

    function onAutostartChange(checked: boolean): void {
        autoStart = checked;
        if (checked) {
            void enableAutostart();
        } else {
            void disableAutostart();
        }
    }
</script>

<Section>
    <SettingRow label={t('config.general.auto_start')}>
        <PSwitch checked={autoStart} onCheckedChange={onAutostartChange} />
    </SettingRow>
</Section>

<Section>
    <SettingRow label={t('config.general.app_language')}>
        <PSelect
            value={cfg('app_language')}
            items={languageItems}
            triggerClass="min-w-[160px]"
            onValueChange={onLanguageChange}
        />
    </SettingRow>
    <SettingRow label={t('config.general.app_theme')}>
        <PSelect
            value={cfg('app_theme')}
            items={themeItems}
            triggerClass="min-w-[120px]"
            onValueChange={onThemeChange}
        />
    </SettingRow>
    <SettingRow label={t('config.general.app_font')}>
        <PSelect
            value={cfg('app_font')}
            items={fontItems}
            triggerClass="min-w-[200px]"
            onValueChange={(v) => setConfig('app_font', v)}
        />
    </SettingRow>
    <SettingRow label={t('config.general.font_size.title')}>
        <PSelect
            value={String(cfg('app_font_size'))}
            items={fontSizeItems}
            triggerClass="min-w-[100px]"
            onValueChange={(v) => setConfig('app_font_size', parseInt(v))}
        />
    </SettingRow>
    {#if isWindows}
        <SettingRow label={t('config.general.tray_click_event')}>
            <PSelect
                value={cfg('tray_click_event')}
                items={trayEventItems}
                triggerClass="min-w-[140px]"
                onValueChange={(v) => setConfig('tray_click_event', v as ConfigSchema['tray_click_event'])}
            />
        </SettingRow>
    {/if}
    {#if !isMac}
        <SettingRow label={t('config.general.transparent')}>
            <PSwitch checked={cfg('transparent')} onCheckedChange={(v) => setConfig('transparent', v)} />
        </SettingRow>
    {/if}
</Section>
