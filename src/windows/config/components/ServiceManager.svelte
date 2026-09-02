<script lang="ts">
    import { GripVertical, Pencil, Plus, Trash2 } from '@lucide/svelte';
    import { toast } from 'svelte-sonner';

    import {
        cfg,
        cfgRaw,
        deleteConfigKey,
        setConfig,
        setConfigRaw,
        trackConfigKeys,
    } from '../../../lib/config/store.svelte';
    import type { ConfigSchema } from '../../../lib/config/defaults';
    import { t } from '../../../lib/i18n/i18n.svelte';
    import { applyReorder } from '../../../lib/utils/reorder';
    import type {
        DictionaryServiceName,
        RecognizeServiceName,
        ServiceKind,
        TranslateServiceName,
        TtsServiceName,
    } from './registry';
    import {
        dictionaryRegistry,
        hasToggle,
        isBuiltinSingleton,
        recognizeRegistry,
        serviceConfigurable,
        serviceIcon,
        translateRegistry,
        ttsRegistry,
    } from './registry';
    import {
        createServiceInstanceKey,
        getServiceName,
        isInstanceEnabled,
        sanitizeServiceInstanceList,
        type ServiceInstanceConfig,
    } from '../../../lib/utils/service_instance';

    import AddServiceModal from './AddServiceModal.svelte';
    import ConfigModal from './ConfigModal.svelte';
    import PSwitch from '../../../lib/ui/PSwitch.svelte';

    const {
        kind,
        hideHeading = false,
        hideDrag = false,
        hideAdd = false,
    }: { kind: ServiceKind; hideHeading?: boolean; hideDrag?: boolean; hideAdd?: boolean } = $props();

    // `kind` is fixed per mounted instance (one manager per service page
    // section), but the compiler wants prop-derived values to stay reactive.
    const configKey = $derived(`${kind}_service_list` as keyof ConfigSchema);
    const labelNamespace = $derived(`services.${kind}`);
    const defaultList = $derived(
        kind === 'translate'
            ? ['openai']
            : kind === 'recognize'
              ? ['paddle', 'system']
              : kind === 'dictionary'
                ? ['free_dictionary']
                : ['system']
    );

    $effect(() => {
        void trackConfigKeys([configKey]);
    });

    // Drag semantics per kind: translate services all run concurrently (one
    // result card each, list order irrelevant — no grip), while the OCR /
    // dictionary / TTS kinds run a priority chain (drag = failover order).
    // The dictionary block additionally opts out via `hideDrag` (a single
    // fixed service has nothing to reorder).
    const draggable = $derived(kind !== 'translate' && !hideDrag);

    const serviceNames = $derived.by(() => {
        switch (kind) {
            case 'translate':
                return Object.keys(translateRegistry) as TranslateServiceName[];
            case 'recognize':
                return Object.keys(recognizeRegistry) as RecognizeServiceName[];
            case 'dictionary':
                return Object.keys(dictionaryRegistry) as DictionaryServiceName[];
            case 'tts':
                return Object.keys(ttsRegistry) as TtsServiceName[];
        }
    });

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

    // Pointer-capture grip reorder. Tauri's drag-drop handler (enabled by
    // default for file drops) swallows native HTML5 drag events on WebView2,
    // so `draggable` rows never even fired dragstart there — the translate
    // window result cards hit the same wall. The proven pattern: the grip
    // captures the pointer, moves hit-test rows via elementFromPoint, and
    // pointerup commits through applyReorder. Nothing outside a completed
    // drag can mutate the list, and the row's checkbox/buttons stay clickable.
    let reorderFrom = $state<number | null>(null);
    let reorderTo = $state<number | null>(null);

    function handleGripPointerDown(index: number, e: PointerEvent): void {
        if (e.button !== 0) {
            return;
        }
        reorderFrom = index;
        reorderTo = index;
        e.preventDefault();
        const grip = e.currentTarget as HTMLElement;
        // Capture keeps move/up events flowing even when the cursor crosses
        // text, checkboxes, or buttons inside the rows.
        grip.setPointerCapture?.(e.pointerId);
        const onMove = (ev: PointerEvent): void => {
            const row = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-service-row]');
            const to = row === null || row === undefined ? Number.NaN : Number(row.getAttribute('data-service-row'));
            if (!Number.isNaN(to)) {
                reorderTo = to;
            }
        };
        const onUp = (ev: PointerEvent): void => {
            grip.releasePointerCapture?.(ev.pointerId);
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
            const from = reorderFrom;
            const to = reorderTo;
            reorderFrom = null;
            reorderTo = null;
            if (from !== null && to !== null && from !== to) {
                setConfig(configKey, applyReorder(instances, from, to));
            }
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
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

    function serviceTitle(instanceKey: string): string {
        const name = getServiceName(instanceKey);
        const instanceName = (cfgRaw(instanceKey) as ServiceInstanceConfig | undefined)?.instanceName;
        return (typeof instanceName === 'string' && instanceName) || t(`${labelNamespace}.${name}.title`);
    }

    /** Built-in singletons cannot be removed, only toggled. The toggle
     * persists under the instance key and the run chains skip disabled
     * instances (see `isInstanceEnabled`). */
    function setInstanceEnabled(instanceKey: string, enabled: boolean): void {
        const existing = (cfgRaw(instanceKey) as ServiceInstanceConfig | undefined) ?? {};
        setConfigRaw(instanceKey, { ...existing, enable: enabled });
    }

    // Services offered by the add flow: the always-configurable OpenAI
    // endpoints may be added any number of times, while built-in singletons
    // only appear while they are not in the list (they cannot be removed, so
    // once present they are hidden for good).
    const addableNames = $derived(
        serviceNames.filter(
            (name) => serviceConfigurable(kind, name) || !instances.some((key) => getServiceName(key) === name)
        )
    );

    // Modal state
    let addModalOpen = $state(false);
    let configModalOpen = $state(false);
    let editingKey = $state('');

    /** A single addable service skips the type-picker dialog; zero-config
     * builtins need no form either — add them straight away. */
    function openAddFlow(): void {
        const only = addableNames.length === 1 ? addableNames[0] : undefined;
        if (only !== undefined) {
            addOrConfigure(only);
            return;
        }
        addModalOpen = true;
    }

    /** Zero-config services are added immediately; configurable ones open
     * their form (new instance key) first. */
    function addOrConfigure(serviceName: string): void {
        const instanceKey = createServiceInstanceKey(serviceName);
        if (serviceConfigurable(kind, serviceName)) {
            editingKey = instanceKey;
            configModalOpen = true;
            return;
        }
        addInstance(instanceKey);
    }
</script>

<div>
    {#if !hideHeading}
        <h3 class="mb-2 text-sm font-medium">{t(`config.service.${kind}`)}</h3>
    {/if}
    <div data-service-zone={kind} role="list">
        {#each instances as item, index (item)}
            <div
                data-service-row={index}
                role="listitem"
                class="mb-[8px] flex items-center justify-between rounded-md bg-content2 px-[10px] py-[10px] {reorderFrom ===
                index
                    ? 'opacity-40'
                    : ''} {reorderTo === index && reorderFrom !== null && reorderFrom !== index
                    ? 'ring-2 ring-primary'
                    : ''}"
            >
                <div class="flex items-center gap-2">
                    {#if draggable}
                        <span
                            aria-hidden="true"
                            data-service-grip={index}
                            class="flex h-[24px] w-[20px] cursor-grab touch-none items-center justify-center text-default-400"
                            onpointerdown={(e) => handleGripPointerDown(index, e)}
                        >
                            <GripVertical class="size-[20px] shrink-0" />
                        </span>
                    {/if}
                    {#if serviceIcon(kind, getServiceName(item))}
                        <img
                            src={serviceIcon(kind, getServiceName(item))}
                            alt=""
                            class="h-[24px] w-[24px]"
                            draggable="false"
                        />
                    {/if}
                    <span class="font-medium">{serviceTitle(item)}</span>
                </div>
                <div class="flex items-center gap-1">
                    {#if serviceConfigurable(kind, getServiceName(item))}
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
                    {/if}
                    {#if hasToggle(kind, getServiceName(item))}
                        <PSwitch
                            checked={isInstanceEnabled(item)}
                            label={t('config.service.enable_toggle')}
                            onCheckedChange={(v) => setInstanceEnabled(item, v)}
                        />
                    {/if}
                    {#if !isBuiltinSingleton(kind, getServiceName(item))}
                        <button
                            type="button"
                            class="flex h-[28px] w-[28px] items-center justify-center rounded-md text-default-400 hover:bg-content3 hover:text-danger"
                            aria-label="Delete"
                            onclick={() => deleteInstance(item)}
                        >
                            <Trash2 class="size-[16px]" />
                        </button>
                    {/if}
                </div>
            </div>
        {/each}
    </div>
    {#if !hideAdd}
        <button
            type="button"
            class="mt-2 flex h-[36px] w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm text-primary-foreground hover:opacity-90 disabled:opacity-40"
            disabled={addableNames.length === 0}
            onclick={() => openAddFlow()}
        >
            <Plus class="size-[16px]" />
            {t('config.service.add_builtin_service')}
        </button>
    {/if}
</div>

{#if addModalOpen}
    <AddServiceModal
        {kind}
        serviceNames={addableNames}
        onClose={() => (addModalOpen = false)}
        onPick={(serviceName) => {
            addModalOpen = false;
            addOrConfigure(serviceName);
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
