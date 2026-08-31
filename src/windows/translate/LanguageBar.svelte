<script lang="ts">
    import { ArrowLeftRight } from '@lucide/svelte';

    import { cfg, setConfig, trackConfigKeys } from '../../lib/config/store.svelte';
    import { t } from '../../lib/i18n/i18n.svelte';
    import { languageLabel, languageList } from '../../lib/utils/language';
    import PSelect from '../../lib/ui/PSelect.svelte';

    import { translateState } from './state.svelte';

    void trackConfigKeys(['translate_remember_language']);

    const languageItems = $derived([
        { value: 'auto', label: t('languages.auto') },
        ...languageList.map((code) => ({ value: code, label: t(`languages.${code}`) })),
    ]);
    const targetItems = $derived(languageList.map((code) => ({ value: code, label: t(`languages.${code}`) })));

    // Seed the selectors from the configured defaults exactly once.
    let seeded = false;
    $effect(() => {
        if (seeded) {
            return;
        }
        translateState.sourceLanguage = cfg('translate_source_language');
        translateState.targetLanguage = cfg('translate_target_language');
        seeded = true;
    });

    // Persist the last used languages while remember is enabled.
    $effect(() => {
        if (!cfg('translate_remember_language')) {
            return;
        }
        const source = translateState.sourceLanguage;
        const target = translateState.targetLanguage;
        if (source && target) {
            setConfig('translate_source_language', source);
            setConfig('translate_target_language', target);
        }
    });

    function onSwap(): void {
        if (translateState.sourceLanguage !== 'auto') {
            const oldSource = translateState.sourceLanguage;
            translateState.sourceLanguage = translateState.targetLanguage;
            translateState.targetLanguage = oldSource;
            return;
        }
        // Source is auto: pick a sensible new target (detected language or
        // the configured second/default target), matching legacy behavior.
        if (translateState.detectLanguage !== '') {
            if (translateState.targetLanguage === cfg('translate_target_language')) {
                translateState.targetLanguage = translateState.detectLanguage;
            } else {
                translateState.targetLanguage = cfg('translate_target_language');
            }
        } else if (translateState.targetLanguage === cfg('translate_second_language')) {
            translateState.targetLanguage = cfg('translate_target_language');
        } else {
            translateState.targetLanguage = cfg('translate_second_language');
        }
    }
</script>

<div class="bg-content2 h-[35px] rounded-[10px]">
    <div class="flex h-full items-center justify-between px-[5px]">
        <div class="flex">
            <PSelect
                bind:value={translateState.sourceLanguage}
                items={languageItems}
                triggerClass="min-w-[100px] bg-transparent hover:bg-content3"
            />
        </div>
        <button
            type="button"
            class="flex h-[26px] w-[26px] items-center justify-center rounded-md text-default-400 hover:bg-content3 hover:text-foreground"
            aria-label="Swap languages"
            onclick={onSwap}
        >
            <ArrowLeftRight class="size-[16px]" />
        </button>
        <div class="flex">
            <PSelect
                bind:value={translateState.targetLanguage}
                items={targetItems}
                triggerClass="min-w-[100px] bg-transparent hover:bg-content3"
            />
        </div>
    </div>
</div>
<div class="h-[8px]"></div>
