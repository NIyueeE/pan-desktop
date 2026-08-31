<script lang="ts">
    import type { OsType } from '../../../lib/utils/env.svelte';

    import { formatHotkeyEvent } from './hotkey_format';

    /**
     * Hotkey capture field. Keydown drafts a binding (persisted live by the
     * parent); OK applies it through the backend. Leaving the field without
     * pressing OK restores the previous binding after a short delay — delayed
     * so the OK click (which blurs the input first) can cancel it.
     */

    const {
        value = '',
        osType = '' as OsType | '',
        placeholder = '',
        onDraft,
        onApply,
    }: {
        value?: string;
        osType?: OsType | '';
        placeholder?: string;
        onDraft?: (value: string) => void;
        onApply?: (value: string, restore: () => void) => void;
    } = $props();

    let draft = $state<string | null>(null);
    let blurTimer: ReturnType<typeof setTimeout> | null = null;

    const display = $derived(draft ?? value);

    function cancelBlurRestore(): void {
        if (blurTimer) {
            clearTimeout(blurTimer);
            blurTimer = null;
        }
    }

    function restore(): void {
        cancelBlurRestore();
        draft = null;
    }

    function onKeyDown(event: KeyboardEvent): void {
        event.preventDefault();
        const formatted = formatHotkeyEvent(event, osType);
        if (formatted === null) {
            return;
        }
        if (formatted === '') {
            // Cleared explicitly: apply immediately so the old binding does
            // not stay registered until the next restart.
            draft = null;
            onApply?.('', restore);
            return;
        }
        cancelBlurRestore();
        draft = formatted;
        onDraft?.(formatted);
    }

    function onBlur(): void {
        if (draft === null) {
            return;
        }
        // Delayed restore: pressing OK moves focus out of the input, and the
        // restore must not clobber the new value before/while it is applied.
        blurTimer = setTimeout(() => {
            draft = null;
            blurTimer = null;
        }, 150);
    }

    function onApplyClick(): void {
        if (display === '') {
            return;
        }
        const key = display;
        draft = null;
        onApply?.(key, restore);
    }
</script>

<div class="flex items-center gap-1">
    <input
        type="text"
        readonly
        value={display}
        {placeholder}
        onkeydown={onKeyDown}
        onblur={onBlur}
        class="h-[32px] w-[180px] rounded-md bg-content2 px-3 text-sm outline-none select-none focus:bg-content3"
    />
    {#if display !== ''}
        <button
            type="button"
            class="h-[28px] rounded-md bg-content2 px-2 text-xs hover:bg-content3"
            onmousedown={(e) => e.preventDefault()}
            onclick={onApplyClick}
        >
            OK
        </button>
    {/if}
</div>
