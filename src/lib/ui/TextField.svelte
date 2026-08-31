<script lang="ts">
    let {
        value = $bindable(''),
        type = 'text',
        placeholder = '',
        required = false,
        disabled = false,
        class: klass = '',
        onValueChange,
    }: {
        value?: string;
        type?: string;
        placeholder?: string;
        required?: boolean;
        disabled?: boolean;
        class?: string;
        onValueChange?: (value: string) => void;
    } = $props();

    function onInput(event: Event & { currentTarget: HTMLInputElement }): void {
        onValueChange?.(event.currentTarget.value);
    }
</script>

<input
    {type}
    {placeholder}
    {required}
    {disabled}
    bind:value
    oninput={onInput}
    class={`h-[32px] rounded-md bg-content2 px-3 text-sm outline-none select-text placeholder:text-default-400 focus:bg-content3 disabled:opacity-50 ${klass}`}
/>
