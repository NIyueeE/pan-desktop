<script lang="ts">
    import { Switch } from 'bits-ui';

    let {
        checked = $bindable(false),
        disabled = false,
        label = '',
        onCheckedChange,
    }: {
        checked?: boolean;
        disabled?: boolean;
        label?: string;
        onCheckedChange?: (checked: boolean) => void;
    } = $props();
</script>

<Switch.Root
    bind:checked
    {disabled}
    aria-label={label || undefined}
    title={label || undefined}
    onCheckedChange={(v) => onCheckedChange?.(v)}
    class="data-[state=checked]:bg-primary data-[state=unchecked]:bg-content3 relative inline-flex h-[22px] w-[40px] shrink-0 items-center rounded-full outline-none transition-colors"
>
    <Switch.Thumb
        class="pointer-events-none block size-[18px] translate-x-[2px] rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[20px]"
    />
</Switch.Root>
