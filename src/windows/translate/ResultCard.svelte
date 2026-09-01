<script lang="ts">
    import { ArrowRightLeft, ChevronDown, ChevronUp, Copy, GripVertical, RefreshCw } from '@lucide/svelte';
    import { DropdownMenu } from 'bits-ui';
    import { writeText } from '@tauri-apps/plugin-clipboard-manager';
    import { sendNotification } from '@tauri-apps/plugin-notification';
    import { info } from '@tauri-apps/plugin-log';
    import { untrack } from 'svelte';

    import { cfg, cfgRaw } from '../../lib/config/store.svelte';
    import { t } from '../../lib/i18n/i18n.svelte';
    import { translateServices } from '../../lib/services';
    import { getServiceName, type ServiceInstanceConfig } from '../../lib/utils/service_instance';

    import { translateState } from './state.svelte';

    const {
        instanceKey,
        instances,
        isFirst = false,
        index = 0,
        dragFrom = null,
        dragTo = null,
        onGripPointerDown,
    }: {
        instanceKey: string;
        instances: string[];
        isFirst?: boolean;
        index?: number;
        dragFrom?: number | null;
        dragTo?: number | null;
        onGripPointerDown?: (index: number, e: PointerEvent) => void;
    } = $props();

    // ResultCard is keyed by instanceKey in the {#each} block, so it remounts
    // when the card's instance changes — seeding the selection once is fine.
    // svelte-ignore state_referenced_locally
    let selectedKey = $state(instanceKey);
    let result = $state('');
    let errorText = $state('');
    let isLoading = $state(false);
    let hidden = $state(true);

    // The service this card currently translates with; falls back to the
    // first instance when the selected one disappears from the list.
    const service = $derived(translateServices[getServiceName(selectedKey) as keyof typeof translateServices]);
    $effect(() => {
        if (!instances.includes(selectedKey)) {
            selectedKey = instances[0] ?? selectedKey;
        }
    });

    const instanceItems = $derived(
        instances.map((key) => {
            const name = getServiceName(key);
            const instanceName = (cfgRaw(key) as ServiceInstanceConfig | undefined)?.instanceName;
            return {
                value: key,
                label: (typeof instanceName === 'string' && instanceName) || t(`services.translate.${name}.title`),
            };
        })
    );
    const selectedItem = $derived(instanceItems.find((item) => item.value === selectedKey));

    let generation = 0;
    let hideOnceDone = false;

    function revealOnce(): void {
        if (!hideOnceDone) {
            hideOnceDone = true;
            hidden = false;
        }
    }

    /** Record a failure. The card must expand for errors: the retry button
     * lives inside the body, so a collapsed card would strand the user with
     * a silent header and no way to see or recover from the failure. */
    function setError(message: string): void {
        errorText = message;
        revealOnce();
    }

    /** Run one translation attempt for this card. */
    function translateCard(text: string, from: string, to: string, appendIfSameAs?: string): void {
        generation += 1;
        const gen = generation;
        hideOnceDone = false;

        if (service === undefined) {
            setError(`Unknown service: ${getServiceName(selectedKey)}`);
            return;
        }
        let targetLanguage = to;
        // auto → the detected language would translate into itself: redirect
        // to the configured second language (live read, not a dependency).
        if (from === 'auto' && to !== '' && to === untrack(() => translateState.detectLanguage)) {
            targetLanguage = cfg('translate_second_language');
        }
        if (!(from in service.Language) || !(targetLanguage in service.Language)) {
            setError('Language not supported');
            return;
        }

        isLoading = true;
        hidden = true;
        const instanceConfig = (untrack(() => cfgRaw(selectedKey)) as ServiceInstanceConfig | undefined) ?? {};

        service
            .translate(
                text.trim(),
                service.Language[from] ?? from,
                service.Language[targetLanguage] ?? targetLanguage,
                {
                    config: instanceConfig,
                    detect: untrack(() => translateState.detectLanguage),
                    setResult: (value: string) => {
                        if (gen !== generation) {
                            return;
                        }
                        result = value;
                        revealOnce();
                    },
                }
            )
            .then(
                (value: string) => {
                    if (gen !== generation) {
                        return;
                    }
                    void info(`[${selectedKey}]resolve`);
                    const target = typeof value === 'string' ? value.trim() : String(value);
                    result = appendIfSameAs !== undefined && target === appendIfSameAs ? `${target} ` : target;
                    isLoading = false;
                    if (result !== '') {
                        revealOnce();
                    }
                    if (isFirst) {
                        void handleAutoCopy(target, text);
                    }
                },
                (e: unknown) => {
                    if (gen !== generation) {
                        return;
                    }
                    void info(`[${selectedKey}]reject`);
                    setError(e instanceof Error ? e.message : String(e));
                    isLoading = false;
                }
            );
    }

    async function handleAutoCopy(target: string, sourceText: string): Promise<void> {
        const mode = cfg('translate_auto_copy');
        const hideWindow = cfg('translate_hide_window');
        const notify = (body: string): void => {
            if (hideWindow) {
                void sendNotification({ title: t('common.write_clipboard'), body });
            }
        };
        if (mode === 'target') {
            await writeText(target);
            notify(target);
        } else if (mode === 'source_target') {
            const combined = `${sourceText.trim()}\n\n${target}`;
            await writeText(combined);
            notify(combined);
        }
    }

    // Translation trigger: commits to sourceText are the only way cards fire.
    $effect(() => {
        const text = translateState.sourceText;
        const from = translateState.sourceLanguage;
        const to = translateState.targetLanguage;
        const copyMode = cfg('translate_auto_copy');
        void selectedKey;
        void service;

        result = '';
        errorText = '';
        if (text.trim() === '' || !from || !to) {
            return;
        }
        if (copyMode === 'source') {
            void writeText(text).then(() => {
                if (cfg('translate_hide_window')) {
                    void sendNotification({ title: t('common.write_clipboard'), body: text });
                }
            });
        }
        translateCard(text, from, to);
    });

    // Grow the result textarea with its content.
    let resultEl: HTMLTextAreaElement | undefined = $state();
    $effect(() => {
        const el = resultEl;
        if (!el) {
            return;
        }
        void result;
        el.style.height = '0px';
        if (result !== '') {
            el.style.height = `${el.scrollHeight}px`;
        }
    });

    function onCopy(): void {
        void writeText(result);
    }

    function onTranslateBack(): void {
        errorText = '';
        if (service === undefined) {
            setError(`Unknown service: ${getServiceName(selectedKey)}`);
            return;
        }
        let newTarget = translateState.sourceLanguage;
        let newSource = translateState.targetLanguage;
        if (translateState.sourceLanguage === 'auto') {
            newTarget = translateState.detectLanguage || 'en';
            newSource = 'auto';
        }
        translateCard(result, newSource, newTarget, result);
    }

    function onRetry(): void {
        errorText = '';
        result = '';
        translateCard(translateState.sourceText, translateState.sourceLanguage, translateState.targetLanguage);
    }

    function onServiceSelect(key: string): void {
        selectedKey = key;
    }
</script>

<div class="rounded-[10px] bg-content1 shadow-sm" data-card-index={index}>
    <!-- Pointer-based drag reorder (see App.svelte): the grip captures the
         pointer, so crossing the result textarea mid-drag cannot cancel it.
         Buttons inside the header stay clickable. -->
    <div
        class={`flex h-[30px] items-center justify-between bg-content2 px-1 ${hidden ? 'rounded-[10px]' : 'rounded-t-[10px]'} ${dragFrom === index ? 'opacity-40' : ''} ${dragTo === index && dragFrom !== null && dragFrom !== index ? 'ring-2 ring-primary' : ''}`}
    >
        <div class="flex items-center">
            <span
                aria-hidden="true"
                class="flex h-[26px] w-[22px] cursor-grab touch-none items-center justify-center text-default-400"
                onpointerdown={(e) => onGripPointerDown?.(index, e)}
            >
                <GripVertical class="size-[16px]" />
            </span>
            <DropdownMenu.Root>
                <DropdownMenu.Trigger
                    class="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm outline-none select-none hover:bg-content3"
                >
                    <img
                        src={service?.info?.icon ?? ''}
                        alt={selectedItem?.label ?? ''}
                        class="my-auto h-[18px] w-[18px]"
                        draggable="false"
                    />
                    {selectedItem?.label ?? ''}
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                    <DropdownMenu.Content
                        class="z-50 max-h-[40vh] overflow-y-auto rounded-md border border-default-200 bg-content1 py-1 shadow-lg"
                    >
                        {#each instanceItems as item (item.value)}
                            <DropdownMenu.Item
                                class="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm outline-none select-none data-[highlighted]:bg-content2"
                                onSelect={() => onServiceSelect(item.value)}
                            >
                                <img
                                    src={translateServices[getServiceName(item.value) as keyof typeof translateServices]
                                        ?.info?.icon ?? ''}
                                    alt=""
                                    class="h-[18px] w-[18px]"
                                    draggable="false"
                                />
                                {item.label}
                            </DropdownMenu.Item>
                        {/each}
                    </DropdownMenu.Content>
                </DropdownMenu.Portal>
            </DropdownMenu.Root>
            {#if isLoading}
                <span class="ml-[20px] flex items-center gap-[3px]" aria-label="loading">
                    <span class="size-[6px] animate-bounce rounded-full bg-default-400 [animation-delay:0ms]"></span>
                    <span class="size-[6px] animate-bounce rounded-full bg-default-400 [animation-delay:150ms]"></span>
                    <span class="size-[6px] animate-bounce rounded-full bg-default-400 [animation-delay:300ms]"></span>
                </span>
            {/if}
        </div>
        <button
            type="button"
            class="flex h-[24px] w-[24px] items-center justify-center rounded-md text-default-400 hover:bg-content3 hover:text-foreground"
            aria-label={hidden ? 'Expand' : 'Collapse'}
            onclick={() => (hidden = !hidden)}
        >
            {#if hidden}
                <ChevronDown class="size-[16px]" />
            {:else}
                <ChevronUp class="size-[16px]" />
            {/if}
        </button>
    </div>
    <div class="grid transition-[grid-template-rows] duration-150" style="grid-template-rows: {hidden ? '0fr' : '1fr'}">
        <div class="overflow-hidden">
            <div class="p-[12px] pb-0">
                <textarea
                    bind:this={resultEl}
                    readonly
                    value={result}
                    class="h-0 w-full resize-none bg-transparent outline-none select-text"
                    style="font-size: 1rem"></textarea>
                {#if errorText !== ''}
                    {#each errorText.split('\n') as line, i (i)}
                        <p class="select-text text-[14px] text-danger">{line}</p>
                    {/each}
                {/if}
            </div>
            <div class={`flex px-[12px] py-[5px] ${hidden ? 'hidden' : ''}`}>
                <div class="flex gap-[2px]">
                    <button
                        type="button"
                        class="flex h-[26px] w-[26px] items-center justify-center rounded-md text-default-400 hover:bg-content2 hover:text-foreground disabled:opacity-40"
                        aria-label={t('translate.copy')}
                        title={t('translate.copy')}
                        disabled={result === ''}
                        onclick={onCopy}
                    >
                        <Copy class="size-[15px]" />
                    </button>
                    <button
                        type="button"
                        class="flex h-[26px] w-[26px] items-center justify-center rounded-md text-default-400 hover:bg-content2 hover:text-foreground disabled:opacity-40"
                        aria-label={t('translate.translate_back')}
                        title={t('translate.translate_back')}
                        disabled={result === ''}
                        onclick={onTranslateBack}
                    >
                        <ArrowRightLeft class="size-[15px]" />
                    </button>
                    {#if errorText !== ''}
                        <button
                            type="button"
                            class="flex h-[26px] w-[26px] items-center justify-center rounded-md text-default-400 hover:bg-content2 hover:text-foreground"
                            aria-label={t('translate.retry')}
                            title={t('translate.retry')}
                            onclick={onRetry}
                        >
                            <RefreshCw class="size-[15px]" />
                        </button>
                    {/if}
                </div>
            </div>
        </div>
    </div>
    <div class="h-[8px]"></div>
</div>
