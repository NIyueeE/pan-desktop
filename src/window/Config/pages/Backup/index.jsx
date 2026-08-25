import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button, Card, CardBody, Input, Switch } from '@nextui-org/react';
import toast, { Toaster } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

import { useConfig, useToastStyle } from '../../../../hooks';
import { store } from '../../../../utils/store';
import {
    testConnection,
    uploadBackup,
    downloadBackup,
    applyBackup,
    DEFAULT_BACKUP_FILENAME,
} from '../../../../utils/webdav';

export default function Backup() {
    const [busy, setBusy] = useState(false);
    const [lastSynced, setLastSynced] = useState(null);
    const [webdavUrl, setWebdavUrl] = useConfig('webdav_url', '');
    const [webdavUsername, setWebdavUsername] = useConfig('webdav_username', '');
    const [webdavPassword, setWebdavPassword] = useConfig('webdav_password', '');
    const [webdavFilename, setWebdavFilename] = useConfig('webdav_filename', DEFAULT_BACKUP_FILENAME);
    const [webdavAutoSync, setWebdavAutoSync] = useConfig('webdav_auto_sync', false);
    const { t } = useTranslation();
    const toastStyle = useToastStyle();

    useEffect(() => {
        store.get('webdav_last_sync').then((v) => {
            if (v) {
                setLastSynced(new Date(v).toLocaleString());
            }
        });
    }, []);

    const ready = () => webdavUrl !== null && webdavUsername !== null && webdavPassword !== null;

    const showResult = (promise, successMessage) => {
        setBusy(true);
        promise
            .then(() => {
                toast.success(successMessage, { duration: 2000, style: toastStyle });
            })
            .catch((e) => {
                toast.error(String(e), { duration: 3000, style: toastStyle });
            })
            .finally(() => setBusy(false));
    };

    const markSynced = async () => {
        const now = Date.now();
        await store.set('webdav_last_sync', now);
        await store.save();
        setLastSynced(new Date(now).toLocaleString());
    };

    const onTest = () => {
        if (!ready()) {
            return;
        }
        showResult(testConnection(webdavUrl, webdavUsername, webdavPassword), t('config.backup.test_success'));
    };

    const onBackup = () => {
        if (!ready()) {
            return;
        }
        showResult(
            (async () => {
                await uploadBackup(store, webdavUrl, webdavUsername, webdavPassword, webdavFilename);
                await markSynced();
                await invoke('reload_store').catch(() => {});
            })(),
            t('config.backup.backup_success')
        );
    };

    const onRestore = () => {
        if (!ready()) {
            return;
        }
        showResult(
            (async () => {
                const payload = await downloadBackup(webdavUrl, webdavUsername, webdavPassword, webdavFilename);
                await applyBackup(store, payload);
                await invoke('reload_store');
                await markSynced();
            })(),
            t('config.backup.load_success')
        );
    };

    return (
        <>
            <Toaster />
            <Card className='mb-[10px]'>
                <CardBody className='flex flex-col gap-[10px]'>
                    <div className='config-item'>
                        <h3>{t('config.backup.webdav_url')}</h3>
                        {webdavUrl !== null && (
                            <Input
                                variant='bordered'
                                placeholder='https://dav.example.com/dav/'
                                value={webdavUrl}
                                onValueChange={setWebdavUrl}
                                className='max-w-[420px]'
                                isDisabled={busy}
                            />
                        )}
                    </div>
                    <div className='config-item'>
                        <h3>{t('config.backup.username')}</h3>
                        {webdavUsername !== null && (
                            <Input
                                variant='bordered'
                                value={webdavUsername}
                                onValueChange={setWebdavUsername}
                                className='max-w-[260px]'
                                isDisabled={busy}
                            />
                        )}
                    </div>
                    <div className='config-item'>
                        <h3>{t('config.backup.password')}</h3>
                        {webdavPassword !== null && (
                            <Input
                                type='password'
                                variant='bordered'
                                value={webdavPassword}
                                onValueChange={setWebdavPassword}
                                className='max-w-[260px]'
                                isDisabled={busy}
                            />
                        )}
                    </div>
                    <div className='config-item'>
                        <h3>{t('config.backup.filename')}</h3>
                        {webdavFilename !== null && (
                            <Input
                                variant='bordered'
                                value={webdavFilename}
                                onValueChange={setWebdavFilename}
                                className='max-w-[260px]'
                                isDisabled={busy}
                            />
                        )}
                    </div>
                    <Button
                        variant='bordered'
                        className='max-w-[200px]'
                        isDisabled={!ready()}
                        isLoading={busy}
                        onPress={onTest}
                    >
                        {t('config.backup.test')}
                    </Button>
                </CardBody>
            </Card>
            <Card className='mb-[10px]'>
                <CardBody className='flex flex-col gap-[10px]'>
                    <div className='config-item'>
                        <h3>{t('config.backup.auto_sync')}</h3>
                        {webdavAutoSync !== null && (
                            <Switch
                                isSelected={webdavAutoSync}
                                isDisabled={busy || !webdavUrl}
                                onValueChange={(v) => {
                                    setWebdavAutoSync(v);
                                    if (v && !webdavUrl) {
                                        toast.error(t('config.backup.need_url'), {
                                            duration: 3000,
                                            style: toastStyle,
                                        });
                                    }
                                }}
                            />
                        )}
                    </div>
                    <p className='text-xs text-default-500'>{t('config.backup.auto_sync_desc')}</p>
                    {lastSynced !== null && (
                        <p className='text-xs text-default-500'>
                            {t('config.backup.last_synced')}
                            {lastSynced}
                        </p>
                    )}
                </CardBody>
            </Card>
            <Card>
                <CardBody className='flex flex-row justify-start gap-[10px]'>
                    <Button
                        color='primary'
                        className='max-w-[200px]'
                        isDisabled={!ready()}
                        isLoading={busy}
                        onPress={onBackup}
                    >
                        {t('config.backup.backup')}
                    </Button>
                    <Button
                        color='warning'
                        variant='bordered'
                        className='max-w-[200px]'
                        isDisabled={!ready()}
                        isLoading={busy}
                        onPress={onRestore}
                    >
                        {t('config.backup.restore')}
                    </Button>
                </CardBody>
            </Card>
        </>
    );
}
