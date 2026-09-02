<script lang="ts">
    import type { Snippet } from 'svelte';

    const { title, children }: { title?: string; children: Snippet } = $props();
</script>

<div class="bg-content2/50 mb-[10px] rounded-[12px] p-4">
    {#if title}
        <h3 class="mb-2 text-sm font-medium">{title}</h3>
    {/if}
    {@render children()}
</div>
