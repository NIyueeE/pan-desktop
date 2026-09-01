<script lang="ts">
    import { GripVertical, Pencil, Plus, Trash2 } from '@lucide/svelte';
    import { toast } from 'svelte-sonner';

    import {
        cfg,
        cfgRaw,
        deleteConfigKey,
        setConfig,
        trackConfigKeys,
        writeThrough,
    } from '../../../lib/config/store.svelte';
    import { t } from '../../../lib/i18n/i18n.svelte';
    import { applyReorder } from '../../../lib/utils/reorder';
    import type { RecognizeServiceName, TranslateServiceName } from './registry';
    import { recognizeRegistry, translateRegistry } from './registry';
    import {
        createServiceInstanceKey,
        getServiceName,
        sanitizeServiceInstanceList,
        type ServiceInstanceConfig,
    } from '../../../lib/utils/service_instance';
    import { appEnv } from '../../../lib/utils/env.svelte';

    import AddServiceModal from './AddServiceModal.svelte';
    import ConfigModal from './ConfigModal.svelte';

    const { kind }: { kind: 'translate' | 'recognize' } = $props();

    // `kind` is fixed per mounted instance (one manager per service page
    // section), but the compiler wants prop-derived values to stay reactive.
    const configKey = $derived(kind === 'translate' ? 'translate_service_list' : 'recognize_service_list');
    const labelNamespace = $derived(kind === 'translate' ? 'services.translate' : 'services.recognize');
    const defaultList = $derived(kind === 'translate' ? ['openai'] : ['system', 'tesseract']);

    $effect(() => {
        void trackConfigKeys([configKey]);
    });

    const serviceNames = $derived(
        kind === 'translate'
            ? (Object.keys(translateRegistry) as TranslateServiceName[])
            : (Object.keys(recognizeRegistry) as RecognizeServiceName[])
    );

    // Sanitized instance list: restored configs may reference removed
    // services; never let them reach the render tree.
    const instances = $derived(sanitizeServiceInstanceList(cfg(configKey), serviceNames, defaultList));

    // Persist the cleaned list when it differs from what is stored.
    $effect(() => {
        const stored = cfg(configKey);
        if (Array.isArray(stored) && stored.join('\u0000') !== instances.join('\u0000')) {
            setConfig(configKey, instances);
        }
    });

    // Native HTML5 drag-and-drop reorder. The library variant (svelte-dnd-
    // action) silently deleted items when a drag ended outside the zone and
    // desynced from runes state; a small fixed contract is safer: rows are
    // draggable, dragover marks the target, drop commits via applyReorder.
    // Nothing outside a successful drop can mutate the list.
    let reorderFrom = $state<number | null>(null);
    let reorderTo = $state<number | null>(null);

    function handleDragStart(index: number, e: DragEvent): void {
        reorderFrom = index;
        e.dataTransfer?.setData('text/plain', String(index));
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            const row = (e.currentTarget as HTMLElement).closest('[data-service-row]');
            if (row) {
                e.dataTransfer.setDragImage(row, 24, 16);
            }
        }
    }

    function handleDragOver(index: number, e: DragEvent): void {
        e.preventDefault();
        if (e.dataTransfer) {
            e.dataTransfer.dropEffect = 'move';
        }
        reorderTo = index;
    }

    function handleDrop(index: number, e: DragEvent): void {
        e.preventDefault();
        const from = reorderFrom;
        reorderFrom = null;
        reorderTo = null;
        if (from === null || from === index) {
            return;
        }
        setConfig(configKey, applyReorder(instances, from, index));
    }

    function handleDragEnd(): void {
        reorderFrom = null;
        reorderTo = null;
    }

    function deleteInstance(instanceKey: string): void {
        if (instances.length === 1) {
            toast.error(t('config.service.least'));
            return;
        }
        setConfig(
            configKey,
            instances.filter((key) => key !== instanceKey)
        );
        // Drop the instance's stored config along with the list entry.
        void deleteConfigKey(instanceKey);
    }

    function addInstance(instanceKey: string): void {
        if (instances.includes(instanceKey)) {
            return;
        }
        setConfig(configKey, [...instances, instanceKey]);
    }

    function serviceIcon(serviceName: string): string {
        if (kind === 'recognize' && serviceName === 'system') {
            return `logo/${appEnv.osType}.svg`;
        }
        const icon =
            kind === 'translate'
                ? translateRegistry[serviceName as TranslateServiceName]?.info.icon
                : recognizeRegistry[serviceName as RecognizeServiceName]?.info.icon;
        return icon ?? '';
    }

    function serviceTitle(instanceKey: string): string {
        const name = getServiceName(instanceKey);
        const instanceName = (cfgRaw(instanceKey) as ServiceInstanceConfig | undefined)?.instanceName;
        return (typeof instanceName === 'string' && instanceName) || t(`${labelNamespace}.${name}.title`);
    }

    // Modal state
    let addModalOpen = $state(false);
    let configModalOpen = $state(false);
    let editingKey = $state('');

    /** Only one builtin service (translate → openai): there is nothing to
     * pick, so the type-picker dialog is noise — jump straight to the new
     * instance's config form. Kinds with several builtins keep the picker. */
    function openAddFlow(): void {
        const only = serviceNames.length === 1 ? serviceNames[0] : undefined;
        if (only) {
            editingKey = createServiceInstanceKey(only);
            configModalOpen = true;
            return;
        }
        addModalOpen = true;
    }
</script>

<div>
    <h3 class="mb-2 text-sm font-medium">{t(`config.service.${kind}`)}</h3>
    <div data-service-zone={kind} role="list">
        {#each instances as item, index (item)}
            {@const config = (cfgRaw(item) as ServiceInstanceConfig | undefined) ?? {}}
            <div
                data-service-row={index}
                role="listitem"
                class="mb-[8px] flex items-center justify-between rounded-md bg-content2 px-[10px] py-[10px] {reorderFrom ===
                index
                    ? 'opacity-40'
                    : ''} {reorderTo === index && reorderFrom !== null && reorderFrom !== index
                    ? 'ring-2 ring-primary'
                    : ''}"
                draggable="true"
                ondragstart={(e) => handleDragStart(index, e)}
                ondragover={(e) => handleDragOver(index, e)}
                ondrop={(e) => handleDrop(index, e)}
                ondragend={handleDragEnd}
            >
                <div class="flex items-center gap-2">
                    <GripVertical class="size-[20px] shrink-0 cursor-grab text-default-400" />
                    <img src={serviceIcon(getServiceName(item))} alt="" class="h-[24px] w-[24px]" draggable="false" />
                    <span class="font-medium">{serviceTitle(item)}</span>
                </div>
                <div class="flex items-center gap-1">
                    <label class="flex items-center gap-1 text-xs text-default-400">
                        <input
                            type="checkbox"
                            checked={config.enable !== false}
                            onchange={(e) =>
                                void writeThrough(item, {
                                    ...config,
                                    enable: e.currentTarget.checked,
                                })}
                            class="accent-[var(--color-primary)]"
                        />
                        {t('config.service.enable')}
                    </label>
                    <button
                        type="button"
                        class="flex h-[28px] w-[28px] items-center justify-center rounded-md text-default-400 hover:bg-content3 hover:text-foreground"
                        aria-label="Edit"
                        onclick={() => {
                            editingKey = item;
                            configModalOpen = true;
                        }}
                    >
                        <Pencil class="size-[16px]" />
                    </button>
                    <button
                        type="button"
                        class="flex h-[28px] w-[28px] items-center justify-center rounded-md text-default-400 hover:bg-content3 hover:text-danger"
                        aria-label="Delete"
                        onclick={() => deleteInstance(item)}
                    >
                        <Trash2 class="size-[16px]" />
                    </button>
                </div>
            </div>
        {/each}
    </div>
    <button
        type="button"
        class="mt-2 flex h-[36px] w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm text-primary-foreground hover:opacity-90"
        onclick={() => openAddFlow()}
    >
        <Plus class="size-[16px]" />
        {t('config.service.add_builtin_service')}
    </button>
</div>

{#if addModalOpen}
    <AddServiceModal
        {kind}
        {serviceNames}
        onClose={() => (addModalOpen = false)}
        onPick={(serviceName) => {
            addModalOpen = false;
            editingKey = createServiceInstanceKey(serviceName);
            configModalOpen = true;
        }}
    />
{/if}

{#if configModalOpen}
    <ConfigModal
        {kind}
        instanceKey={editingKey}
        onClose={() => (configModalOpen = false)}
        onSaved={(key) => addInstance(key)}
    />
{/if}
