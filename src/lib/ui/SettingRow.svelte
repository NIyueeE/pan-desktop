<script lang="ts">
    import type { Snippet } from 'svelte';

    const { label, description = '', children }: { label: string; description?: string; children?: Snippet } = $props();
</script>

<div class="my-[10px] flex items-center justify-between gap-4">
    <div class="min-w-0">
        <h3 class="text-sm">{label}</h3>
        {#if description}
            <p class="mt-0.5 text-xs text-default-400">{description}</p>
        {/if}
    </div>
    {@render children?.()}
</div>
