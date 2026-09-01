<script lang="ts">
    import {
        Blocks,
        CloudUpload,
        Info,
        Keyboard,
        Languages,
        LayoutGrid,
        ScanText,
        X,
        Minus,
        Square,
    } from '@lucide/svelte';
    import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
    import { listen } from '@tauri-apps/api/event';

    import { cfg, trackConfigKeys } from '../../lib/config/store.svelte';
    import { openDevtools } from '../../lib/ipc/commands';
    import { appEnv } from '../../lib/utils/env.svelte';
    import { t } from '../../lib/i18n/i18n.svelte';

    import About from './pages/About.svelte';
    import Backup from './pages/Backup.svelte';
    import General from './pages/General.svelte';
    import Hotkey from './pages/Hotkey.svelte';
    import Recognize from './pages/Recognize.svelte';
    import Service from './pages/Service.svelte';
    import Translate from './pages/Translate.svelte';

    const appWindow = getCurrentWebviewWindow();
    const isMac = $derived(appEnv.osType === 'Darwin');
    const isLinux = $derived(appEnv.osType === 'Linux');

    const pages = {
        general: { label: 'config.general.label', icon: LayoutGrid, component: General },
        translate: { label: 'config.translate.label', icon: Languages, component: Translate },
        recognize: { label: 'config.recognize.label', icon: ScanText, component: Recognize },
        hotkey: { label: 'config.hotkey.label', icon: Keyboard, component: Hotkey },
        service: { label: 'config.service.label', icon: Blocks, component: Service },
        backup: { label: 'config.backup.label', icon: CloudUpload, component: Backup },
        about: { label: 'config.about.label', icon: Info, component: About },
    } as const;

    type PageKey = keyof typeof pages;

    let page = $state<PageKey>('general');
    let isMaximized = $state(false);

    void trackConfigKeys(['app_font', 'app_font_size', 'transparent']);

    // Live typography settings (root font scales every rem-based utility).
    $effect(() => {
        const font = cfg('app_font');
        document.documentElement.style.fontFamily = `"${font === 'default' ? 'sans-serif' : font}", sans-serif`;
        document.documentElement.style.fontSize = `${cfg('app_font_size')}px`;
    });

    $effect(() => {
        // The window shows from the Rust side so it appears even when the
        // frontend fails to boot (legacy invariant) — just make sure the
        // maximized state tracks resizes for the control buttons.
        const promise = listen('tauri://resize', () => {
            void appWindow.isMaximized().then((v) => (isMaximized = v));
        });
        return () => {
            void promise.then((f) => f());
        };
    });

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

    const CurrentPage = $derived(pages[page].component);
</script>

<svelte:window onkeydown={onKeyDown} />

<div class="flex h-screen w-screen {isLinux ? 'rounded-[10px] border border-default-100' : ''}">
    <nav
        class="float-left h-screen w-[230px] shrink-0 border-r border-default-100 select-none {isLinux
            ? 'rounded-l-[10px]'
            : ''} {cfg('transparent') ? 'bg-background/85' : 'bg-content1'}"
    >
        <div class="h-[35px] p-[5px]" data-tauri-drag-region="true">
            <div class="h-full w-full"></div>
        </div>
        <div class="p-[5px]">
            <div data-tauri-drag-region="true">
                <img alt="pan logo" src="/icon.svg" class="mb-[30px] mx-auto h-[60px] w-[60px]" draggable="false" />
            </div>
        </div>
        <div class="mx-[12px] overflow-y-auto">
            {#each Object.entries(pages) as [key, page_def] (key)}
                {@const active = page === key}
                <button
                    type="button"
                    class="mb-[5px] flex h-[40px] w-full items-center gap-3 rounded-lg px-3 text-sm {active
                        ? 'bg-content2 font-medium text-foreground'
                        : 'text-default-400 hover:bg-content2/60 hover:text-foreground'}"
                    onclick={() => (page = key as PageKey)}
                >
                    <page_def.icon class="size-[20px]" />
                    {t(page_def.label)}
                </button>
            {/each}
        </div>
    </nav>
    <main
        class="h-screen w-full select-none {isLinux ? 'rounded-r-[10px]' : ''} {cfg('transparent')
            ? 'bg-background/85'
            : 'bg-content1'}"
    >
        <!-- Same pattern as the translate window: the row itself is the drag
             region; a fixed overlay above the window buttons swallowed their
             clicks on WebView2. -->
        <div class="flex h-[35px] items-center justify-between" data-tauri-drag-region="true">
            <h2 class="ml-[10px] font-medium" data-tauri-drag-region="true">{t(`config.${page}.title`)}</h2>
            {#if !isMac}
                <div class="flex">
                    <button
                        type="button"
                        class="flex h-[35px] w-[40px] items-center justify-center text-default-400 hover:bg-content2 hover:text-foreground"
                        aria-label="Minimize"
                        onclick={() => void appWindow.minimize()}
                    >
                        <Minus class="size-[16px]" />
                    </button>
                    <button
                        type="button"
                        class="flex h-[35px] w-[40px] items-center justify-center text-default-400 hover:bg-content2 hover:text-foreground"
                        aria-label={isMaximized ? 'Restore' : 'Maximize'}
                        onclick={() => (isMaximized ? void appWindow.unmaximize() : void appWindow.maximize())}
                    >
                        <Square class="size-[14px]" />
                    </button>
                    <button
                        type="button"
                        class="flex h-[35px] w-[40px] items-center justify-center text-default-400 hover:bg-[#c42b1c] hover:text-white {isLinux
                            ? 'rounded-tr-[10px]'
                            : ''}"
                        aria-label="Close"
                        onclick={() => void appWindow.close()}
                    >
                        <X class="size-[16px]" />
                    </button>
                </div>
            {/if}
        </div>
        <div class="h-px bg-divider"></div>
        <div class="overflow-y-auto p-[10px] {isLinux ? 'h-[calc(100vh-38px)]' : 'h-[calc(100vh-36px)]'}">
            <CurrentPage />
        </div>
    </main>
</div>
