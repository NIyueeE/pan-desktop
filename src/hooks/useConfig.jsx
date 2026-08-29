import { useCallback, useEffect } from 'react';
import { listen, emit } from '@tauri-apps/api/event';
import { useGetState } from './useGetState';
import { store } from '../utils/store';
import { debounce } from '../utils';

// `undefined` must never reach the store or the UI: components render
// `t(`prefix.${value}`)` directly, so an undefined value leaks
// "prefix.undefined" into dropdown labels. Treat it exactly like null.
const isUnset = (v) => v === null || v === undefined;

export const useConfig = (key, defaultValue = null, options = {}) => {
    const [property, setPropertyState, getProperty] = useGetState(null);
    const { sync = true } = options;

    // 同步到Store (State -> Store)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce() is intentionally stable
    const syncToStore = useCallback(
        debounce((v) => {
            store.set(key, v);
            store.save();
            const eventKey = key.replaceAll('.', '_').replaceAll('@', ':');
            emit(`${eventKey}_changed`, v);
        }),
        []
    );

    // 立即写入（无防抖）。用于保存关键配置（如快捷键），避免写入前窗口
    // 关闭或后续读取到过期值。
    const writeThrough = useCallback(
        (v) => {
            store.set(key, v);
            store.save();
            const eventKey = key.replaceAll('.', '_').replaceAll('@', ':');
            emit(`${eventKey}_changed`, v);
        },
        [key]
    );

    // 同步到State (Store -> State)
    const syncToState = useCallback(
        (v) => {
            if (!isUnset(v)) {
                setPropertyState(v);
            } else {
                store.get(key).then((stored) => {
                    if (isUnset(stored)) {
                        setPropertyState(defaultValue);
                        if (!isUnset(defaultValue)) {
                            store.set(key, defaultValue);
                            store.save();
                        }
                    } else {
                        setPropertyState(stored);
                    }
                });
            }
        },
        [defaultValue, key, setPropertyState]
    );

    const setProperty = useCallback(
        (v, forceSync = false) => {
            if (isUnset(v)) {
                // A component should never push undefined into the config;
                // ignore it instead of nulling the stored value.
                return;
            }
            setPropertyState(v);
            const isSync = forceSync || sync;
            if (isSync) {
                if (forceSync) {
                    writeThrough(v);
                    // Cancel any pending debounced write so it cannot later
                    // overwrite the fresh value with a stale one.
                    syncToStore.cancel?.();
                } else {
                    syncToStore(v);
                }
            }
        },
        [setPropertyState, sync, syncToStore, writeThrough]
    );

    // 初始化
    useEffect(() => {
        syncToState(null);
        const eventKey = key.replaceAll('.', '_').replaceAll('@', ':');
        const unlisten = listen(`${eventKey}_changed`, (e) => {
            syncToState(e.payload);
        });
        return () => {
            unlisten.then((f) => {
                f();
            });
        };
    }, [key, syncToState]);

    return [property, setProperty, getProperty];
};

export const deleteKey = (key) => {
    if (store.has(key)) {
        store.delete(key);
        store.save();
    }
};
