import { useCallback, useEffect } from 'react';
import { listen, emit } from '@tauri-apps/api/event';
import { useGetState } from './useGetState';
import { store } from '../utils/store';
import { debounce } from '../utils';

export const useConfig = (key, defaultValue, options = {}) => {
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
            if (v !== null) {
                setPropertyState(v);
            } else {
                store.get(key).then((v) => {
                    if (v === null) {
                        setPropertyState(defaultValue);
                        store.set(key, defaultValue);
                        store.save();
                    } else {
                        setPropertyState(v);
                    }
                });
            }
        },
        [defaultValue, key, setPropertyState]
    );

    const setProperty = useCallback(
        (v, forceSync = false) => {
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
