import { Divider, Button } from '@nextui-org/react';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/plugin-shell';
import { BsGithub } from 'react-icons/bs';
import React from 'react';

import { appVersion } from '../../../../utils/env';

const GITHUB_URL = 'https://github.com/NIyueeE/pan-desktop';

export default function About() {
    const { t } = useTranslation();

    return (
        <div className='h-full w-full py-[80px] px-[100px]'>
            <img
                src='icon.png'
                className='mx-auto h-[100px] mb-[5px]'
                draggable={false}
            />
            <div className='content-center'>
                <h1 className='font-bold text-2xl text-center'>Pan</h1>
                <p className='text-center text-sm text-gray-500 mb-[5px]'>{appVersion}</p>
                <Divider />
                <p className='text-center text-sm text-gray-500 my-[15px] px-[20px]'>{t('config.about.intro')}</p>
                <Divider />
                <div className='flex justify-center'>
                    <Button
                        variant='light'
                        className='my-[5px]'
                        size='sm'
                        startContent={<BsGithub />}
                        onPress={() => {
                            open(GITHUB_URL);
                        }}
                    >
                        {t('config.about.github')}
                    </Button>
                </div>
            </div>
        </div>
    );
}
