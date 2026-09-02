<script lang="ts">
    import { BookOpen, ChevronDown, ChevronUp, RotateCw, Volume2 } from '@lucide/svelte';
    import { info } from '@tauri-apps/plugin-log';

    import { cfg, cfgRaw } from '../../lib/config/store.svelte';
    import { t } from '../../lib/i18n/i18n.svelte';
    import { dictionaryServices } from '../../lib/services';
    import type { DictionaryResult } from '../../lib/services/types';
    import {
        firstSuccessful,
        getServiceName,
        sanitizeServiceInstanceList,
        type ServiceInstanceConfig,
    } from '../../lib/utils/service_instance';

    const BUILTIN_DICTIONARY_SERVICES = ['free_dictionary'];

    const { word, language, epoch = 0 }: { word: string; language: string; epoch?: number } = $props();

    const instances = $derived(
        sanitizeServiceInstanceList(
            cfg('dictionary_service_list'),
            BUILTIN_DICTIONARY_SERVICES,
            BUILTIN_DICTIONARY_SERVICES
        )
    );

    let result = $state<DictionaryResult | null>(null);
    /** First failure message of the last lookup chain; null = clean miss. */
    let lookupError = $state<string | null>(null);
    /** True until the current lookup chain settles: the pending card must
     * not claim "not found" before the first answer arrives. */
    let lookupPending = $state(true);
    /** The card body folds away on demand; the header stays. */
    let open = $state(true);
    // Bumped by the retry button; read by the effect below to re-run.
    let retryNonce = $state(0);
    // Deliberately non-reactive bookkeeping: remembers the word the card was
    // last opened for, so a NEW word expands the card again.
    let lastWord: string | null = null;
    // Deliberately non-reactive player bookkeeping: imperatively recreated on
    // every play, nothing in the template reads it.
    let audio: HTMLAudioElement | null = null;

    $effect(() => {
        const target = word;
        const lang = language;
        // A new commit re-runs the lookup even for the same word.
        void epoch;
        void retryNonce;
        result = null;
        lookupError = null;
        lookupPending = true;
        if (target === '') {
            return;
        }
        if (target !== lastWord) {
            // A new word expands the card again; an explicitly collapsed
            // card stays collapsed while the same word re-queries.
            lastWord = target;
            open = true;
        }
        let cancelled = false;
        let firstError: string | null = null;
        // The word only changes when a translation is triggered, but dynamic
        // translate re-commits while typing: debounce so each commit does
        // not fire a lookup chain.
        const debounce = setTimeout(() => {
            void runLookup();
        }, 350);

        /** One pass over the instance chain in priority order; a miss (no
         * entry) in every instance resolves to null. Failures no longer stay
         * silent: the first error message is surfaced with a retry. */
        const lookup = async (queryLanguage: string): Promise<DictionaryResult | null> =>
            (await firstSuccessful(instances, (instance) => {
                const service = dictionaryServices[getServiceName(instance) as keyof typeof dictionaryServices];
                if (service === undefined) {
                    return Promise.resolve(undefined);
                }
                const instanceConfig = (cfgRaw(instance) as ServiceInstanceConfig | undefined) ?? {};
                return (
                    service
                        .lookup(target, queryLanguage, { config: instanceConfig })
                        // A lookup miss (404 / unsupported language) resolves null:
                        // fall through to the next instance.
                        .then((entry) => entry ?? undefined)
                        .catch((e: unknown) => {
                            const message = e instanceof Error ? e.message : String(e);
                            void info(`Dictionary lookup failed: ${message}`);
                            firstError ??= message;
                            return undefined;
                        })
                );
            })) ?? null;

        async function runLookup(): Promise<void> {
            // The service owns all fallbacks now: a Chinese target is served
            // by Youdao alone (an English-Wiktionary fallback used to mask
            // Youdao failures behind unrelated English definitions), other
            // targets fall back inside the Wiktionary path.
            const entry = await lookup(lang);
            if (cancelled) {
                return;
            }
            result = entry;
            lookupError = entry === null ? firstError : null;
            lookupPending = false;
        }

        return () => {
            cancelled = true;
            clearTimeout(debounce);
        };
    });

    function playAudio(): void {
        if (result === null || result.audioUrl === '') {
            return;
        }
        audio?.pause();
        audio = new Audio(result.audioUrl);
        void audio.play().catch(() => {
            void info('Failed to play dictionary audio');
        });
    }
</script>

<!-- Present whenever a translation was triggered: the header shows the word
     and folds the body on demand; a hit expands the definitions and example
     sentences, a clean miss keeps a not-found hint, a failed lookup shows
     the reason and a retry. -->
<div data-testid="dictionary-card" class="rounded-[10px] bg-content1 shadow-sm">
    <div class="flex h-[30px] items-center gap-2 rounded-t-[10px] bg-content2 px-2">
        <BookOpen class="size-[14px] shrink-0 text-default-400" />
        <span class="min-w-0 truncate text-sm font-medium"
            >{result?.word !== undefined && result.word !== '' ? result.word : word}</span
        >
        {#if result !== null && result.phonetic !== ''}
            <span class="shrink-0 text-xs text-default-400">{result.phonetic}</span>
        {/if}
        <div class="ml-auto flex shrink-0 items-center gap-1">
            {#if result !== null && result.audioUrl !== ''}
                <button
                    type="button"
                    class="flex h-[24px] w-[24px] items-center justify-center rounded-md text-primary hover:bg-content3"
                    aria-label="Play pronunciation"
                    onclick={playAudio}
                >
                    <Volume2 class="size-[16px]" />
                </button>
            {/if}
            <button
                type="button"
                class="flex h-[24px] w-[24px] items-center justify-center rounded-md text-default-400 hover:bg-content3 hover:text-foreground"
                aria-label={open ? 'Collapse' : 'Expand'}
                onclick={() => (open = !open)}
            >
                {#if open}
                    <ChevronUp class="size-[16px]" />
                {:else}
                    <ChevronDown class="size-[16px]" />
                {/if}
            </button>
        </div>
    </div>
    <div class="grid transition-[grid-template-rows] duration-150" style="grid-template-rows: {open ? '1fr' : '0fr'}">
        <div class="overflow-hidden">
            {#if result !== null}
                <div class="space-y-2 p-2">
                    {#each result.meanings.slice(0, 4) as meaning, meaningIndex (meaningIndex)}
                        <div>
                            {#if meaning.partOfSpeech !== ''}
                                <div class="text-xs text-default-400 italic">{meaning.partOfSpeech}</div>
                            {/if}
                            <ul class="list-disc pl-4">
                                {#each meaning.definitions.slice(0, 3) as definition, definitionIndex (definitionIndex)}
                                    <li class="text-sm">
                                        {definition.definition}
                                        {#if definition.example !== ''}
                                            <div class="text-xs text-default-400 italic">{definition.example}</div>
                                        {/if}
                                    </li>
                                {/each}
                            </ul>
                        </div>
                    {/each}
                    {#if result.examples !== undefined && result.examples.length > 0}
                        <div class="space-y-1 border-t border-default-200 pt-2">
                            {#each result.examples.slice(0, 2) as example, exampleIndex (exampleIndex)}
                                <div class="select-text text-sm">{example.source}</div>
                                {#if example.target !== ''}
                                    <div class="select-text text-xs text-default-400 italic">{example.target}</div>
                                {/if}
                            {/each}
                        </div>
                    {/if}
                </div>
            {:else if lookupError !== null}
                <div class="flex items-center gap-2 p-2">
                    <span class="min-w-0 flex-1 truncate text-xs text-danger"
                        >{t('translate.dictionary_error')}: {lookupError}</span
                    >
                    <button
                        type="button"
                        class="flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-md text-default-400 hover:bg-content3 hover:text-foreground"
                        aria-label={t('translate.retry')}
                        title={t('translate.retry')}
                        onclick={() => (retryNonce += 1)}
                    >
                        <RotateCw class="size-[14px]" />
                    </button>
                </div>
            {:else if !lookupPending}
                <div class="p-2 text-xs text-default-400">{t('translate.dictionary_not_found')}</div>
            {/if}
        </div>
    </div>
</div>
