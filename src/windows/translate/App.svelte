<script lang="ts">
    import { Pin, PinOff, X } from '@lucide/svelte';
    import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
    import { currentMonitor } from '@tauri-apps/api/window';
    import { listen } from '@tauri-apps/api/event';
    import { info } from '@tauri-apps/plugin-log';
    import { Toaster } from 'svelte-sonner';

    import { cfg, cfgRaw, setConfig, trackConfigKeys, writeThrough } from '../../lib/config/store.svelte';
    import { applyReorder } from '../../lib/utils/reorder';
    import { openDevtools } from '../../lib/ipc/commands';
    import { getBase64 } from '../../lib/ipc/commands';
    import { appEnv } from '../../lib/utils/env.svelte';
    import { themeState } from '../../lib/utils/theme.svelte';
    import {
        BUILTIN_RECOGNIZE_SERVICES,
        BUILTIN_TRANSLATE_SERVICES,
        DEFAULT_RECOGNIZE_SERVICE_LIST,
        DEFAULT_TRANSLATE_SERVICE_LIST,
        firstSuccessful,
        getServiceName,
        isInstanceEnabled,
        sanitizeServiceInstanceList,
        type ServiceInstanceConfig,
    } from '../../lib/utils/service_instance';
    import { getText } from '../../lib/ipc/commands';
    import { onNewText } from '../../lib/ipc/events';
    import detect from '../../lib/utils/lang_detect';
    import { recognizeServices, type RecognizeServiceName } from '../../lib/services';

    import { markProgrammaticFocus, shouldIgnoreBlur } from './focus';
    import { translateState } from './state.svelte';
    import LanguageBar from './LanguageBar.svelte';
    import DictionaryCard from './DictionaryCard.svelte';
    import ResultCard from './ResultCard.svelte';
    import SourceCard from './SourceCard.svelte';

    const appWindow = getCurrentWebviewWindow();

    void trackConfigKeys([
        'translate_close_on_blur',
        'translate_always_on_top',
        'translate_window_position',
        'translate_remember_window_size',
        'translate_service_list',
        'recognize_service_list',
        'translate_layout',
        'translate_opacity',
    ]);

    // Non-macOS windows draw their own CSS border + rounding (macOS keeps
    // the native rounded chrome via the overlay title bar style).
    // Window opacity in percent (100 = opaque). color-mix keeps the theme
    // color; the class below stays as the base paint for engines without
    // color-mix support.
    const windowOpacity = $derived(cfg('translate_opacity'));

    // The dictionary explains the committed word (only after a translation
    // is triggered — typing alone never opens it) in the TARGET language:
    // a Chinese target explains English words via Youdao, other targets get
    // the Wiktionary section written in that language.
    const dictionaryWord = $derived(translateState.sourceText.trim());
    const dictionaryEnabled = $derived(cfg('dictionary_enabled'));
    const dictionaryLanguage = $derived(cfg('translate_target_language'));

    // Sanitized instance list: configs restored from other pot builds may
    // reference removed services; never let them reach the render tree.
    const translateInstances = $derived(
        sanitizeServiceInstanceList(
            cfg('translate_service_list'),
            BUILTIN_TRANSLATE_SERVICES,
            DEFAULT_TRANSLATE_SERVICE_LIST
        )
    );
    const hideSource = $derived(cfg('translate_layout') === 'hide_source' || cfg('translate_layout') === 'compact');
    const hideLanguage = $derived(cfg('translate_layout') === 'hide_language' || cfg('translate_layout') === 'compact');

    // Pointer-based drag reorder for the result cards. Native HTML5 dnd dies
    // the moment the pointer crosses the result textarea (editable targets
    // cancel the operation), so the grip captures the pointer and hit-tests
    // cards itself.
    let cardDragFrom = $state<number | null>(null);
    let cardDragTo = $state<number | null>(null);

    function commitCardReorder(from: number, to: number): void {
        setConfig('translate_service_list', applyReorder(translateInstances, from, to));
    }

    function handleCardGripPointerDown(index: number, e: PointerEvent): void {
        if (e.button !== 0) {
            return;
        }
        cardDragFrom = index;
        cardDragTo = index;
        e.preventDefault();
        const grip = e.currentTarget as HTMLElement;
        // Pointer capture keeps move/up events flowing even when the cursor
        // travels across textareas and other drop-hostile elements.
        grip.setPointerCapture?.(e.pointerId);
        const onMove = (ev: PointerEvent): void => {
            const card = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-card-index]');
            const to = card === null || card === undefined ? Number.NaN : Number(card.getAttribute('data-card-index'));
            if (!Number.isNaN(to)) {
                cardDragTo = to;
            }
        };
        const onUp = (ev: PointerEvent): void => {
            grip.releasePointerCapture?.(ev.pointerId);
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
            const from = cardDragFrom;
            const to = cardDragTo;
            cardDragFrom = null;
            cardDragTo = null;
            if (from !== null && to !== null && from !== to) {
                commitCardReorder(from, to);
            }
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
    }

    // ── Source text orchestration ────────────────────────────────────────

    function commitSourceText(text: string): void {
        translateState.sourceText = text;
        translateState.commitEpoch += 1;
    }

    async function commitAfterDetect(text: string): Promise<void> {
        translateState.detectLanguage = await detect(text);
        commitSourceText(text);
    }

    function applyTextTransforms(text: string): string {
        if (!cfg('translate_delete_newline')) {
            return text;
        }
        return text.replace(/-\s+/g, '').replace(/\s+/g, ' ');
    }

    function handleRecognizeResult(value: string): void {
        let newText = applyTextTransforms(value.trim());
        if (cfg('incremental_translate')) {
            newText = translateState.sourceText ? `${translateState.sourceText} ${newText}` : newText;
        }
        translateState.draftText = newText;
        void commitAfterDetect(newText);
    }

    async function handleNewText(raw: string): Promise<void> {
        const text = raw.trim();
        if (cfg('translate_hide_window')) {
            await appWindow.hide();
        } else {
            // Exactly ONE programmatic focus per interaction — and only when
            // actually needed: tao's set_focus injects a synthetic ALT keypress
            // whenever SetForegroundWindow is denied, so redundant calls break
            // the IME and fight for the foreground (legacy invariant).
            const [visible, focused] = await Promise.all([appWindow.isVisible(), appWindow.isFocused()]);
            if (!visible) {
                markProgrammaticFocus();
                await appWindow.show();
            }
            if (!focused) {
                markProgrammaticFocus();
                await appWindow.setFocus();
            }
        }
        translateState.detectLanguage = '';
        if (text === '[INPUT_TRANSLATE]') {
            translateState.windowType = 'INPUT';
            translateState.draftText = '';
            commitSourceText('');
        } else if (text === '[IMAGE_TRANSLATE]') {
            translateState.windowType = 'IMAGE';
            const base64 = await getBase64();
            const recognizeList = sanitizeServiceInstanceList(
                cfg('recognize_service_list'),
                BUILTIN_RECOGNIZE_SERVICES,
                DEFAULT_RECOGNIZE_SERVICE_LIST
            );
            const recognizeLanguage = cfg('recognize_language');
            // Priority failover: the first instance that recognizes wins; an
            // unknown service, an unsupported language, a row switched off in
            // the service settings, or an error all fall through to the next
            // one.
            const recognized = await firstSuccessful(recognizeList, async (instanceKey) => {
                if (!isInstanceEnabled(instanceKey)) {
                    return undefined;
                }
                const service = recognizeServices[getServiceName(instanceKey) as RecognizeServiceName];
                if (service === undefined || !(recognizeLanguage in service.Language)) {
                    return undefined;
                }
                const config = (cfgRaw(instanceKey) as ServiceInstanceConfig | undefined) ?? {};
                const value = await service.recognize(base64, recognizeLanguage, { config });
                return value === '' ? undefined : value;
            });
            if (recognized === undefined) {
                const message = 'OCR failed';
                translateState.draftText = message;
                commitSourceText(message);
            } else {
                handleRecognizeResult(recognized);
            }
        } else {
            translateState.windowType = 'SELECTION';
            let newText = applyTextTransforms(text);
            if (cfg('incremental_translate')) {
                newText = translateState.sourceText ? `${translateState.sourceText} ${newText}` : newText;
            }
            translateState.draftText = newText;
            void commitAfterDetect(newText);
        }
    }

    // ── Window lifecycle: new_text, close-on-blur, persistence, keys ─────

    $effect(() => {
        const unsubs: (() => void)[] = [];
        let alive = true;
        const track = (promise: Promise<() => void>) => {
            void promise.then((f) => {
                if (alive) {
                    unsubs.push(f);
                } else {
                    f();
                }
            });
        };

        // close-on-blur must not react to the spurious focus/blur oscillations
        // that WebView2 emits right after a programmatic focus (focus.ts).
        const BLUR_CLOSE_DELAY_MS = 300;
        let blurTimeout: ReturnType<typeof setTimeout> | null = null;
        let moveTimeout: ReturnType<typeof setTimeout> | null = null;
        let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
        const cancelBlurClose = () => {
            if (blurTimeout) {
                clearTimeout(blurTimeout);
                blurTimeout = null;
            }
        };

        track(
            listen('tauri://blur', () => {
                if (translateState.pinned || !cfg('translate_close_on_blur')) {
                    return;
                }
                if (shouldIgnoreBlur()) {
                    void info('Blur ignored (grace)');
                    return;
                }
                cancelBlurClose();
                void info('Blur');
                blurTimeout = setTimeout(() => {
                    void (async () => {
                        // Re-check before closing: WebView2 focus churn can
                        // re-focus the window within the delay; a self-close
                        // during that churn used to make typing impossible.
                        try {
                            if (await appWindow.isFocused()) {
                                void info('Blur stale, window refocused');
                                return;
                            }
                        } catch {
                            // isFocused unavailable: fall through and close.
                        }
                        void info('Confirm Blur');
                        dismissWindow();
                    })();
                }, BLUR_CLOSE_DELAY_MS);
            })
        );

        track(
            listen('tauri://focus', () => {
                cancelBlurClose();
            })
        );

        // Persist window position (opt-in); move events fire at high rate —
        // debounced, and never logged per event.
        track(
            listen('tauri://move', () => {
                cancelBlurClose();
                if (cfg('translate_window_position') !== 'pre_state') {
                    return;
                }
                if (moveTimeout) {
                    clearTimeout(moveTimeout);
                }
                moveTimeout = setTimeout(() => {
                    void (async () => {
                        const position = await appWindow.outerPosition();
                        const monitor = await currentMonitor();
                        if (!monitor) {
                            return;
                        }
                        const logical = position.toLogical(monitor.scaleFactor);
                        await writeThrough('translate_window_position_x', parseInt(String(logical.x)));
                        await writeThrough('translate_window_position_y', parseInt(String(logical.y)));
                    })();
                }, 100);
            })
        );

        track(
            listen('tauri://resize', () => {
                if (!cfg('translate_remember_window_size')) {
                    return;
                }
                if (resizeTimeout) {
                    clearTimeout(resizeTimeout);
                }
                resizeTimeout = setTimeout(() => {
                    void (async () => {
                        const size = await appWindow.outerSize();
                        const monitor = await currentMonitor();
                        if (!monitor) {
                            return;
                        }
                        const logical = size.toLogical(monitor.scaleFactor);
                        await writeThrough('translate_window_height', parseInt(String(logical.height)));
                        await writeThrough('translate_window_width', parseInt(String(logical.width)));
                    })();
                }, 100);
            })
        );

        track(onNewText((text) => void handleNewText(text)));

        // The initial text arrives via command; with the snapshot store every
        // config value is already settled at mount, so it is safe to load
        // exactly once here. An empty payload means the resident window was
        // pre-built at startup: stay hidden until a real hotkey event shows
        // it, instead of popping an empty window on launch.
        void getText().then((text) => {
            if (text !== '') {
                void handleNewText(text);
            }
        });

        return () => {
            alive = false;
            unsubs.forEach((f) => f());
            cancelBlurClose();
            if (moveTimeout) {
                clearTimeout(moveTimeout);
            }
            if (resizeTimeout) {
                clearTimeout(resizeTimeout);
            }
        };
    });

    // Startup pin default; pin toggling stays per-session (legacy behavior).
    $effect(() => {
        if (cfg('translate_always_on_top')) {
            translateState.pinned = true;
            void appWindow.setAlwaysOnTop(true);
        }
    });

    function togglePin(): void {
        const next = !translateState.pinned;
        translateState.pinned = next;
        void appWindow.setAlwaysOnTop(next);
    }

    /** Resident mode (`translate_keep_alive`) keeps the pre-built window
     * alive hidden between invocations — re-showing a warm webview is what
     * makes the hotkey feel instant; only opt-out mode destroys it. */
    function dismissWindow(): void {
        void (cfg('translate_keep_alive') ? appWindow.hide() : appWindow.close());
    }

    function onKeyDown(event: KeyboardEvent): void {
        if (event.key === 'Escape') {
            dismissWindow();
        }
        // Devtools in development builds only (no user-facing toggle).
        if (import.meta.env.DEV && event.key === 'F12') {
            void openDevtools();
        }
        if (event.key.startsWith('F') && event.key.length > 1) {
            event.preventDefault();
        }
    }
</script>

<svelte:window onkeydown={onKeyDown} />

<div
    class="h-screen w-screen bg-background {appEnv.osType === 'Darwin'
        ? ''
        : 'rounded-[10px] border border-default-200'}"
    style:background-color={`color-mix(in srgb, var(--color-background) ${windowOpacity}%, transparent)`}
>
    <!-- The header row itself is the drag region: clicking empty space targets
         the row (drags), clicking a button targets the button (no drag). A
         separate overlay div here sits above the buttons and swallows their
         clicks on WebView2. -->
    <div class="h-[35px] w-full flex justify-between" data-tauri-drag-region="true">
        <button
            type="button"
            class="my-auto ml-[5px] flex h-[28px] w-[28px] items-center justify-center rounded-md text-default-400 hover:bg-content2 hover:text-foreground"
            aria-label={translateState.pinned ? 'Unpin window' : 'Pin window'}
            onclick={togglePin}
        >
            {#if translateState.pinned}
                <Pin class="text-primary size-[18px]" />
            {:else}
                <PinOff class="size-[18px]" />
            {/if}
        </button>
        <button
            type="button"
            class="my-auto mr-[5px] flex h-[28px] w-[28px] items-center justify-center rounded-md text-default-400 hover:bg-content2 hover:text-foreground"
            aria-label="Close window"
            onclick={dismissWindow}
        >
            <X class="size-[20px]" />
        </button>
    </div>
    <div class="px-[8px] {appEnv.osType === 'Darwin' ? 'h-[calc(100vh-35px)]' : 'h-[calc(100vh-37px)]'}">
        <div class="h-full overflow-y-auto">
            {#if !hideSource || translateState.windowType === 'INPUT'}
                <SourceCard />
            {/if}
            {#if !hideLanguage}
                <LanguageBar />
            {/if}
            <section class="w-full">
                {#each translateInstances as instanceKey, index (instanceKey)}
                    <ResultCard
                        {instanceKey}
                        instances={translateInstances}
                        isFirst={index === 0}
                        {index}
                        dragFrom={cardDragFrom}
                        dragTo={cardDragTo}
                        onGripPointerDown={handleCardGripPointerDown}
                    />
                {/each}
            </section>
            <!-- The dictionary card is always the last card; it appears only
                 once a translation was triggered (a committed word) and the
                 master switch is on. -->
            {#if dictionaryEnabled && dictionaryWord !== ''}
                <DictionaryCard
                    word={dictionaryWord}
                    language={dictionaryLanguage}
                    epoch={translateState.commitEpoch}
                />
            {/if}
        </div>
    </div>
    <Toaster theme={themeState.resolved} position="bottom-right" richColors />
</div>
