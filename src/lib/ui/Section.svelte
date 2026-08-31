<script lang="ts">
    import type { Snippet } from 'svelte';

    let { children }: { children: Snippet } = $props();
</script>

<div class="bg-content2/50 mb-[10px] rounded-[12px] p-4">
    {@render children()}
</div>
