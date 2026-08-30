import { Input, Button, Textarea } from '@nextui-org/react';
import toast, { Toaster } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import React, { useState } from 'react';

import { useConfig } from '../../../hooks/useConfig';
import { useToastStyle } from '../../../hooks';
import { recognize } from './index';
import { INSTANCE_NAME_CONFIG_KEY } from '../../../utils/service_instance';

// A valid 1x1 PNG used to verify the endpoint/model/key combination; a vision
// model resolves the request (possibly with empty text), which is all the test
// needs to prove connectivity.
const TEST_IMAGE_BASE64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

export function Config(props) {
    const { instanceKey, updateServiceList, onClose } = props;
    const { t } = useTranslation();
    const defaultOpenaiConfig = React.useMemo(
        () => ({
            [INSTANCE_NAME_CONFIG_KEY]: t('services.recognize.openai.title'),
            service: 'openai',
            requestPath: 'https://api.openai.com/v1/chat/completions',
            model: 'gpt-4o-mini',
            apiKey: '',
            prompt: '',
        }),
        [t]
    );
    const [storedOpenaiConfig, setStoredOpenaiConfig] = useConfig(instanceKey, defaultOpenaiConfig, {
        sync: false,
    });
    // Merge stored over defaults so partially stored configs (restored
    // backups) never leave an input uncontrolled. `null` = still loading.
    const openaiConfig = storedOpenaiConfig === null ? null : { ...defaultOpenaiConfig, ...storedOpenaiConfig };
    const setOpenaiConfig = setStoredOpenaiConfig;

    const [isLoading, setIsLoading] = useState(false);

    const toastStyle = useToastStyle();

    const setField = (key) => (value) => {
        setOpenaiConfig({
            ...openaiConfig,
            [key]: value,
        });
    };

    return (
        openaiConfig !== null && (
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    setIsLoading(true);
                    recognize(TEST_IMAGE_BASE64, 'auto', { config: openaiConfig }).then(
                        () => {
                            setIsLoading(false);
                            setOpenaiConfig(openaiConfig, true);
                            updateServiceList(instanceKey);
                            onClose();
                        },
                        (e) => {
                            setIsLoading(false);
                            toast.error(t('config.service.test_failed') + e.toString(), { style: toastStyle });
                        }
                    );
                }}
            >
                <Toaster />
                <div className='config-item'>
                    <Input
                        label={t('services.instance_name')}
                        labelPlacement='outside-left'
                        value={openaiConfig[INSTANCE_NAME_CONFIG_KEY]}
                        variant='bordered'
                        classNames={{
                            label: 'text-[length:--nextui-font-size-medium]',
                            mainWrapper: 'max-w-[50%]',
                        }}
                        onValueChange={setField(INSTANCE_NAME_CONFIG_KEY)}
                    />
                </div>
                <div className='config-item'>
                    <Input
                        label={t('services.recognize.openai.request_path')}
                        labelPlacement='outside-left'
                        value={openaiConfig['requestPath']}
                        variant='bordered'
                        classNames={{
                            label: 'text-[length:--nextui-font-size-medium]',
                            mainWrapper: 'max-w-[50%]',
                        }}
                        onValueChange={setField('requestPath')}
                    />
                </div>
                <div className='config-item'>
                    <Input
                        label={t('services.recognize.openai.api_key')}
                        labelPlacement='outside-left'
                        value={openaiConfig['apiKey']}
                        variant='bordered'
                        type='password'
                        classNames={{
                            label: 'text-[length:--nextui-font-size-medium]',
                            mainWrapper: 'max-w-[50%]',
                        }}
                        onValueChange={setField('apiKey')}
                    />
                </div>
                <div className='config-item'>
                    <Input
                        label={t('services.recognize.openai.model')}
                        labelPlacement='outside-left'
                        value={openaiConfig['model']}
                        variant='bordered'
                        classNames={{
                            label: 'text-[length:--nextui-font-size-medium]',
                            mainWrapper: 'max-w-[50%]',
                        }}
                        onValueChange={setField('model')}
                    />
                </div>
                <div className='config-item flex-col'>
                    <Textarea
                        label={t('services.recognize.openai.prompt')}
                        labelPlacement='outside'
                        value={openaiConfig['prompt']}
                        variant='bordered'
                        description={t('services.recognize.openai.prompt_description')}
                        onValueChange={setField('prompt')}
                    />
                </div>
                <div className='flex justify-center'>
                    <Button
                        isLoading={isLoading}
                        color='primary'
                        type='submit'
                    >
                        {t('common.save')}
                    </Button>
                </div>
            </form>
        )
    );
}
