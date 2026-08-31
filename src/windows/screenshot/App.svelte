<script lang="ts">
    import { appCacheDir, join } from '@tauri-apps/api/path';
    import { convertFileSrc } from '@tauri-apps/api/core';
    import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
    import { warn } from '@tauri-apps/plugin-log';
    import { onMount } from 'svelte';

    import { cutImage, screenshot } from '../../lib/ipc/commands';
    import { emitScreenshotSuccess } from '../../lib/ipc/events';

    const appWindow = getCurrentWebviewWindow();

    let imgurl = $state('');
    let isDown = $state(false);
    let isMoved = $state(false);
    let mouseDownX = $state(0);
    let mouseDownY = $state(0);
    let mouseMoveX = $state(0);
    let mouseMoveY = $state(0);
    let imgEl: HTMLImageElement | undefined = $state();

    onMount(() => {
        void (async () => {
            const monitor = await appWindow.currentMonitor();
            if (!monitor) {
                return;
            }
            await screenshot(monitor.position.x, monitor.position.y);
            const dir = await appCacheDir();
            const filePath = await join(dir, 'pan_screenshot.png');
            imgurl = convertFileSrc(filePath);
        })();
    });

    // Show only once the fullscreen snapshot is actually paintable.
    function onImageLoad(): void {
        if (imgurl !== '' && imgEl?.complete) {
            void appWindow.show();
            void appWindow.setFocus();
            void appWindow.setResizable(false);
        }
    }

    function onMouseDown(event: MouseEvent): void {
        if (event.buttons === 1) {
            isDown = true;
            mouseDownX = event.clientX;
            mouseDownY = event.clientY;
        } else {
            void appWindow.close();
        }
    }

    function onMouseMove(event: MouseEvent): void {
        if (isDown) {
            isMoved = true;
            mouseMoveX = event.clientX;
            mouseMoveY = event.clientY;
        }
    }

    async function onMouseUp(event: MouseEvent): Promise<void> {
        await appWindow.hide();
        isDown = false;
        isMoved = false;
        const imgWidth = imgEl?.naturalWidth ?? 0;
        const dpi = imgWidth / window.screen.width;
        const left = Math.floor(Math.min(mouseDownX, event.clientX) * dpi);
        const top = Math.floor(Math.min(mouseDownY, event.clientY) * dpi);
        const right = Math.floor(Math.max(mouseDownX, event.clientX) * dpi);
        const bottom = Math.floor(Math.max(mouseDownY, event.clientY) * dpi);
        const width = right - left;
        const height = bottom - top;
        if (width <= 0 || height <= 0) {
            void warn('Screenshot area is too small');
            await appWindow.close();
            return;
        }
        await cutImage({ left, top, width, height });
        await emitScreenshotSuccess();
        await appWindow.close();
    }
</script>

<img
    bind:this={imgEl}
    class="fixed top-0 left-0 w-full select-none"
    src={imgurl}
    draggable="false"
    onload={onImageLoad}
/>
<div
    class={`fixed border border-solid border-sky-500 bg-[#2080f020] ${!isMoved && 'hidden'}`}
    style:top="{Math.min(mouseDownY, mouseMoveY)}px"
    style:left="{Math.min(mouseDownX, mouseMoveX)}px"
    style:bottom="{window.screen.height - Math.max(mouseDownY, mouseMoveY)}px"
    style:right="{window.screen.width - Math.max(mouseDownX, mouseMoveX)}px"
></div>
<div
    class="fixed inset-0 cursor-crosshair select-none"
    onmousedown={onMouseDown}
    onmousemove={onMouseMove}
    onmouseup={(e) => void onMouseUp(e)}
></div>
