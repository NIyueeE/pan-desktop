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
        getServiceName,
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
        'transparent',
    ]);

    const isLinux = $derived(appEnv.osType === 'Linux');

    // Sanitized instance list: configs restored from other pot builds may
    // reference removed services; never let them reach the render tree.
    const translateInstances = $derived(
        sanitizeServiceInstanceList(
            cfg('translate_service_list'),
            BUILTIN_TRANSLATE_SERVICES,
            DEFAULT_TRANSLATE_SERVICE_LIST
        )
    );
    const enabledInstances = $derived(
        translateInstances.filter((key) => (cfgRaw(key) as ServiceInstanceConfig | undefined)?.enable !== false)
    );
    const hideSource = $derived(cfg('translate_layout') === 'hide_source' || cfg('translate_layout') === 'compact');
    const hideLanguage = $derived(cfg('translate_layout') === 'hide_language' || cfg('translate_layout') === 'compact');

    // Pointer-based drag reorder for the enabled result cards. Native HTML5
    // dnd dies the moment the pointer crosses the result textarea (editable
    // targets cancel the operation), so the grip captures the pointer and
    // hit-tests cards itself. Disabled entries keep their stored positions.
    let cardDragFrom = $state<number | null>(null);
    let cardDragTo = $state<number | null>(null);

    function commitCardReorder(from: number, to: number): void {
        const reordered = applyReorder(enabledInstances, from, to);
        // Rebuild the full stored list: enabled entries follow the new
        // order, disabled entries keep their positions.
        const queue = [...reordered];
        const next = translateInstances.map((key) => (reordered.includes(key) ? (queue.shift() ?? key) : key));
        setConfig('translate_service_list', next);
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
            translateState.sourceText = '';
        } else if (text === '[IMAGE_TRANSLATE]') {
            translateState.windowType = 'IMAGE';
            const base64 = await getBase64();
            const recognizeList = sanitizeServiceInstanceList(
                cfg('recognize_service_list'),
                BUILTIN_RECOGNIZE_SERVICES,
                DEFAULT_RECOGNIZE_SERVICE_LIST
            );
            const instanceKey = recognizeList[0] ?? 'system';
            const serviceName = getServiceName(instanceKey);
            const service = recognizeServices[serviceName as RecognizeServiceName];
            const recognizeLanguage = cfg('recognize_language');
            if (!service) {
                const message = `Unknown recognize service: ${serviceName}`;
                translateState.draftText = message;
                commitSourceText(message);
            } else if (recognizeLanguage in service.Language) {
                service
                    .recognize(base64, recognizeLanguage, {
                        config: (cfgRaw(instanceKey) as ServiceInstanceConfig | undefined) ?? {},
                    })
                    .then(handleRecognizeResult, (e: unknown) => {
                        const message = e instanceof Error ? e.message : String(e);
                        translateState.draftText = message;
                        commitSourceText(message);
                    });
            } else {
                translateState.draftText = 'Language not supported';
                commitSourceText('Language not supported');
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
                        await appWindow.close();
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
        // exactly once here.
        void getText().then((text) => void handleNewText(text));

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

    function onKeyDown(event: KeyboardEvent): void {
        if (event.key === 'Escape') {
            void appWindow.close();
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
    class="h-screen w-screen {cfg('transparent') ? 'bg-transparent' : 'bg-background'} {isLinux
        ? 'rounded-[10px] border border-default-100'
        : ''}"
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
            onclick={() => void appWindow.close()}
        >
            <X class="size-[20px]" />
        </button>
    </div>
    <div class="px-[8px] {isLinux ? 'h-[calc(100vh-37px)]' : 'h-[calc(100vh-35px)]'}">
        <div class="h-full overflow-y-auto">
            {#if !hideSource || translateState.windowType === 'INPUT'}
                <SourceCard />
            {/if}
            {#if !hideLanguage}
                <LanguageBar />
            {/if}
            <section class="w-full">
                {#each enabledInstances as instanceKey, index (instanceKey)}
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
        </div>
    </div>
    <Toaster theme={themeState.resolved} position="bottom-right" richColors />
</div>
