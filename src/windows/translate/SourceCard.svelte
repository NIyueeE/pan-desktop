<script lang="ts">
    import { ArrowDownToLine, Copy, Languages, Trash2 } from '@lucide/svelte';
    import { writeText } from '@tauri-apps/plugin-clipboard-manager';

    import { cfg } from '../../lib/config/store.svelte';
    import { languageLabel } from '../../lib/utils/language';
    import { t } from '../../lib/i18n/i18n.svelte';
    import detect from '../../lib/utils/lang_detect';
    import { translateState } from './state.svelte';

    let textareaEl: HTMLTextAreaElement | undefined = $state();
    let dynamicTimer: ReturnType<typeof setTimeout> | null = null;

    // Auto-grow the textarea with its content.
    $effect(() => {
        const el = textareaEl;
        if (!el) {
            return;
        }
        void translateState.draftText;
        el.style.height = '50px';
        el.style.height = `${el.scrollHeight}px`;
    });

    function applyDeleteNewline(text: string): string {
        if (!cfg('translate_delete_newline')) {
            return text;
        }
        return text.replace(/-\s+/g, '').replace(/\s+/g, ' ');
    }

    function commitWithDetect(text: string): void {
        translateState.draftText = text;
        void detect(text).then((detected) => {
            translateState.detectLanguage = detected;
            translateState.sourceText = text;
        });
    }

    function onKeyDown(event: KeyboardEvent): void {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            commitWithDetect(translateState.draftText);
        }
    }

    function onInput(): void {
        if (!cfg('dynamic_translate')) {
            return;
        }
        if (dynamicTimer) {
            clearTimeout(dynamicTimer);
        }
        dynamicTimer = setTimeout(() => {
            commitWithDetect(applyDeleteNewline(translateState.draftText));
        }, 1000);
    }

    function onCopy(): void {
        void writeText(translateState.draftText);
    }

    function onDeleteNewline(): void {
        commitWithDetect(translateState.draftText.replace(/-\s+/g, '').replace(/\s+/g, ' '));
    }

    function onClear(): void {
        translateState.draftText = '';
        translateState.sourceText = '';
    }

    function onTranslate(): void {
        commitWithDetect(translateState.draftText);
    }
</script>

<div>
    <div class="bg-content1 mt-[1px] rounded-[10px] pb-0">
        <div class="max-h-[40vh] overflow-y-auto p-[12px] pb-0">
            <!-- svelte-ignore a11y_autofocus -->
            <textarea
                bind:this={textareaEl}
                bind:value={translateState.draftText}
                autofocus
                class="h-full w-full resize-none bg-content1 outline-none select-text"
                style="font-size: 1rem"
                onkeydown={onKeyDown}
                oninput={onInput}
            ></textarea>
        </div>
        <div class="flex items-center justify-between px-[12px] py-[5px]">
            <div class="flex justify-start">
                <div class="mr-[5px] flex">
                    <button
                        type="button"
                        class="flex h-[28px] w-[28px] items-center justify-center rounded-md text-default-400 hover:bg-content2 hover:text-foreground"
                        aria-label={t('translate.copy')}
                        title={t('translate.copy')}
                        onclick={onCopy}
                    >
                        <Copy class="size-[16px]" />
                    </button>
                    <button
                        type="button"
                        class="flex h-[28px] w-[28px] items-center justify-center rounded-md text-default-400 hover:bg-content2 hover:text-foreground"
                        aria-label={t('translate.delete_newline')}
                        title={t('translate.delete_newline')}
                        onclick={onDeleteNewline}
                    >
                        <ArrowDownToLine class="size-[16px]" />
                    </button>
                    <button
                        type="button"
                        class="flex h-[28px] w-[28px] items-center justify-center rounded-md text-default-400 hover:bg-content2 hover:text-foreground disabled:opacity-40"
                        aria-label={t('common.clear')}
                        title={t('common.clear')}
                        disabled={translateState.draftText === ''}
                        onclick={onClear}
                    >
                        <Trash2 class="size-[16px]" />
                    </button>
                </div>
                {#if translateState.detectLanguage !== ''}
                    <span class="text-secondary-foreground my-auto rounded-full bg-primary/20 px-2 py-0.5 text-xs">
                        {languageLabel(t, translateState.detectLanguage)}
                    </span>
                {/if}
            </div>
            <button
                type="button"
                class="flex h-[28px] w-[28px] items-center justify-center rounded-md text-primary hover:bg-content2"
                aria-label={t('translate.translate')}
                title={t('translate.translate')}
                onclick={onTranslate}
            >
                <Languages class="size-[16px]" />
            </button>
        </div>
    </div>
    <div class="h-[8px]"></div>
</div>
