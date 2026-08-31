<script lang="ts">
    import { Select } from 'bits-ui';

    let {
        value = $bindable(''),
        items,
        triggerClass = '',
        contentClass = '',
        onValueChange,
    }: {
        value?: string;
        items: { value: string; label: string }[];
        triggerClass?: string;
        contentClass?: string;
        onValueChange?: (value: string) => void;
    } = $props();

    const selected = $derived(items.find((item) => item.value === value));
</script>

<Select.Root type="single" bind:value onValueChange={(v) => onValueChange?.(v)}>
    <Select.Trigger
        class={`flex h-[32px] min-w-[130px] items-center justify-between gap-2 rounded-md bg-content2 px-3 text-sm outline-none select-none hover:bg-content3 ${triggerClass}`}
    >
        {selected?.label ?? ''}
    </Select.Trigger>
    <Select.Portal>
        <Select.Content
            class={`z-50 max-h-[50vh] overflow-y-auto rounded-md border border-default-200 bg-content1 py-1 shadow-lg ${contentClass}`}
        >
            {#each items as item (item.value)}
                <Select.Item
                    value={item.value}
                    label={item.label}
                    class="cursor-pointer px-3 py-1.5 text-sm outline-none select-none data-[highlighted]:bg-content2"
                >
                    {item.label}
                </Select.Item>
            {/each}
        </Select.Content>
    </Select.Portal>
</Select.Root>
