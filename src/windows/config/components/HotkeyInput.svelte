<script lang="ts">
    import type { OsType } from '../../../lib/utils/env.svelte';

    import { formatHotkeyEvent } from './hotkey_format';

    /**
     * Hotkey capture field (controlled). Keydown drafts a binding and only
     * reports it; the page-level Save button applies drafts through the
     * backend. No per-row apply, no blur restore: an unsaved draft stays
     * visible (highlighted) until saved or recaptured.
     */

    const {
        value = '',
        draft = null,
        osType = '' as OsType | '',
        placeholder = '',
        onDraft,
    }: {
        value?: string;
        draft?: string | null;
        osType?: OsType | '';
        placeholder?: string;
        onDraft?: (value: string) => void;
    } = $props();

    const display = $derived(draft ?? value);
    const modified = $derived(draft !== null && draft !== value);

    function onKeyDown(event: KeyboardEvent): void {
        event.preventDefault();
        const formatted = formatHotkeyEvent(event, osType);
        if (formatted === null) {
            return;
        }
        onDraft?.(formatted);
    }
</script>

<input
    type="text"
    readonly
    value={display}
    {placeholder}
    onkeydown={onKeyDown}
    class="h-[32px] w-[180px] rounded-md bg-content2 px-3 text-sm outline-none select-none focus:bg-content3 {modified
        ? 'ring-2 ring-primary'
        : ''}"
/>
