import {
    Card,
    CardBody,
    CardHeader,
    CardFooter,
    Button,
    ButtonGroup,
    Dropdown,
    DropdownItem,
    DropdownMenu,
    DropdownTrigger,
    Tooltip,
} from '@nextui-org/react';
import { BiCollapseVertical, BiExpandVertical } from 'react-icons/bi';
import { sendNotification } from '@tauri-apps/plugin-notification';
import React, { useEffect, useState, useRef } from 'react';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import PulseLoader from 'react-spinners/PulseLoader';
import { TbTransformFilled } from 'react-icons/tb';
import { semanticColors } from '@nextui-org/theme';
import { MdContentCopy } from 'react-icons/md';
import { useTranslation } from 'react-i18next';
import { GiCycle } from 'react-icons/gi';
import { useTheme } from 'next-themes';
import { useAtomValue } from 'jotai';
import { nanoid } from 'nanoid';
import { useSpring, animated } from '@react-spring/web';
import useMeasure from 'react-use-measure';

import { sourceLanguageAtom, targetLanguageAtom } from '../LanguageArea';
import { useConfig } from '../../../../hooks';
import { sourceTextAtom, detectLanguageAtom } from '../SourceArea';
import * as builtinServices from '../../../../services/translate';

import { info, error as logError } from '@tauri-apps/plugin-log';
import { INSTANCE_NAME_CONFIG_KEY, getDisplayInstanceName, getServiceName } from '../../../../utils/service_instance';

const translateID = [];

export default function TargetArea(props) {
    const { index, name, translateServiceInstanceList, serviceInstanceConfigMap, ...drag } = props;

    const [currentTranslateServiceInstanceKey, setCurrentTranslateServiceInstanceKey] = useState(name);
    const [appFontSize] = useConfig('app_font_size', 16);
    const [translateSecondLanguage] = useConfig('translate_second_language', 'en');
    const [isLoading, setIsLoading] = useState(false);
    const [hide, setHide] = useState(true);

    const [result, setResult] = useState('');
    const [error, setError] = useState('');

    const sourceText = useAtomValue(sourceTextAtom);
    const sourceLanguage = useAtomValue(sourceLanguageAtom);
    const targetLanguage = useAtomValue(targetLanguageAtom);
    const [autoCopy] = useConfig('translate_auto_copy', 'disable');
    const [hideWindow] = useConfig('translate_hide_window', false);

    const detectLanguage = useAtomValue(detectLanguageAtom);
    const { t } = useTranslation();
    const textAreaRef = useRef();
    const theme = useTheme();

    function getInstanceName(instanceKey, serviceNameSupplier) {
        const instanceConfig = serviceInstanceConfigMap[instanceKey] ?? {};
        return getDisplayInstanceName(instanceConfig[INSTANCE_NAME_CONFIG_KEY], serviceNameSupplier);
    }

    useEffect(() => {
        if (error) {
            logError(`[${currentTranslateServiceInstanceKey}]happened error: ` + error);
        }
    }, [error, currentTranslateServiceInstanceKey]);

    // 当前实例被删除时回退到第一个实例
    useEffect(() => {
        if (
            translateServiceInstanceList &&
            !translateServiceInstanceList.includes(currentTranslateServiceInstanceKey)
        ) {
            setCurrentTranslateServiceInstanceKey(translateServiceInstanceList[0]);
        }
    }, [translateServiceInstanceList, currentTranslateServiceInstanceKey]);

    // listen to translation
    useEffect(() => {
        setResult('');
        setError('');
        if (sourceText.trim() !== '' && sourceLanguage && targetLanguage && autoCopy !== null && hideWindow !== null) {
            if (autoCopy === 'source') {
                writeText(sourceText).then(() => {
                    if (hideWindow) {
                        sendNotification({ title: t('common.write_clipboard'), body: sourceText });
                    }
                });
            }
            translate();
        }
    }, [sourceText, sourceLanguage, targetLanguage, autoCopy, hideWindow, currentTranslateServiceInstanceKey]); // eslint-disable-line react-hooks/exhaustive-deps -- translate() is recreated each render; adding it would re-trigger the request

    function invokeOnce(fn) {
        let isInvoke = false;

        return (...args) => {
            if (isInvoke) {
                return;
            } else {
                fn(...args);
                isInvoke = true;
            }
        };
    }

    const translate = async () => {
        const id = nanoid();
        translateID[index] = id;

        const translateServiceName = getServiceName(currentTranslateServiceInstanceKey);
        const LanguageEnum = builtinServices[translateServiceName].Language;
        if (sourceLanguage in LanguageEnum && targetLanguage in LanguageEnum) {
            let newTargetLanguage = targetLanguage;
            if (sourceLanguage === 'auto' && targetLanguage === detectLanguage) {
                newTargetLanguage = translateSecondLanguage;
            }
            setIsLoading(true);
            setHide(true);
            const instanceConfig = serviceInstanceConfigMap[currentTranslateServiceInstanceKey] ?? {};
            const setHideOnce = invokeOnce(setHide);
            builtinServices[translateServiceName]
                .translate(sourceText.trim(), LanguageEnum[sourceLanguage], LanguageEnum[newTargetLanguage], {
                    config: instanceConfig,
                    detect: detectLanguage,
                    setResult: (v) => {
                        if (translateID[index] !== id) {
                            return;
                        }
                        setResult(v);
                        setHideOnce(false);
                    },
                })
                .then(
                    (v) => {
                        info(`[${currentTranslateServiceInstanceKey}]resolve:` + v);
                        if (translateID[index] !== id) {
                            return;
                        }
                        const target = typeof v === 'string' ? v.trim() : String(v);
                        setResult(target);
                        setIsLoading(false);
                        if (target !== '') {
                            setHideOnce(false);
                        }
                        if (index === 0) {
                            switch (autoCopy) {
                                case 'target':
                                    writeText(target).then(() => {
                                        if (hideWindow) {
                                            sendNotification({ title: t('common.write_clipboard'), body: target });
                                        }
                                    });
                                    break;
                                case 'source_target':
                                    writeText(sourceText.trim() + '\n\n' + target).then(() => {
                                        if (hideWindow) {
                                            sendNotification({
                                                title: t('common.write_clipboard'),
                                                body: sourceText.trim() + '\n\n' + target,
                                            });
                                        }
                                    });
                                    break;
                                default:
                                    break;
                            }
                        }
                    },
                    (e) => {
                        info(`[${currentTranslateServiceInstanceKey}]reject:` + e);
                        if (translateID[index] !== id) {
                            return;
                        }
                        setError(e.toString());
                        setIsLoading(false);
                    }
                );
        } else {
            setError('Language not supported');
        }
    };

    // hide empty textarea
    useEffect(() => {
        if (textAreaRef.current !== null) {
            textAreaRef.current.style.height = '0px';
            if (result !== '') {
                textAreaRef.current.style.height = textAreaRef.current.scrollHeight + 'px';
            }
        }
    }, [result]);

    const [boundRef, bounds] = useMeasure({ scroll: true });
    const springs = useSpring({
        from: { height: 0 },
        to: { height: hide ? 0 : bounds.height },
    });

    return (
        <Card
            shadow='none'
            className='rounded-[10px]'
        >
            <CardHeader
                className={`flex justify-between py-1 px-0 bg-content2 h-[30px] ${hide ? 'rounded-[10px]' : 'rounded-t-[10px]'}`}
                {...drag}
            >
                <div className='flex'>
                    <Dropdown>
                        <DropdownTrigger>
                            <Button
                                size='sm'
                                variant='solid'
                                className='bg-transparent'
                                startContent={
                                    <img
                                        src={
                                            builtinServices[getServiceName(currentTranslateServiceInstanceKey)].info
                                                .icon
                                        }
                                        className='h-[20px] my-auto'
                                    />
                                }
                            >
                                <div className='my-auto'>
                                    {getInstanceName(currentTranslateServiceInstanceKey, () =>
                                        t(
                                            `services.translate.${getServiceName(currentTranslateServiceInstanceKey)}.title`
                                        )
                                    )}
                                </div>
                            </Button>
                        </DropdownTrigger>
                        <DropdownMenu
                            aria-label='translate service'
                            className='max-h-[40vh] overflow-y-auto'
                            onAction={(key) => {
                                setCurrentTranslateServiceInstanceKey(key);
                            }}
                        >
                            {translateServiceInstanceList.map((instanceKey) => {
                                return (
                                    <DropdownItem
                                        key={instanceKey}
                                        startContent={
                                            <img
                                                src={builtinServices[getServiceName(instanceKey)].info.icon}
                                                className='h-[20px] my-auto'
                                            />
                                        }
                                    >
                                        <div className='my-auto'>
                                            {getInstanceName(instanceKey, () =>
                                                t(`services.translate.${getServiceName(instanceKey)}.title`)
                                            )}
                                        </div>
                                    </DropdownItem>
                                );
                            })}
                        </DropdownMenu>
                    </Dropdown>
                    <PulseLoader
                        loading={isLoading}
                        color={theme === 'dark' ? semanticColors.dark.default[500] : semanticColors.light.default[500]}
                        size={8}
                        cssOverride={{
                            display: 'inline-block',
                            margin: 'auto',
                            marginLeft: '20px',
                        }}
                    />
                </div>
                <div className='flex'>
                    <Button
                        size='sm'
                        isIconOnly
                        variant='light'
                        className='h-[20px] w-[20px]'
                        onPress={() => setHide(!hide)}
                    >
                        {hide ? (
                            <BiExpandVertical className='text-[16px]' />
                        ) : (
                            <BiCollapseVertical className='text-[16px]' />
                        )}
                    </Button>
                </div>
            </CardHeader>
            <animated.div style={{ ...springs }}>
                <div ref={boundRef}>
                    <CardBody className={`p-[12px] pb-0 ${hide && 'h-0 p-0'}`}>
                        <textarea
                            ref={textAreaRef}
                            className={`text-[${appFontSize}px] h-0 resize-none bg-transparent select-text outline-none`}
                            readOnly
                            value={result}
                        />
                        {error !== '' ? (
                            error.split('\n').map((v, i) => {
                                return (
                                    <p
                                        key={i}
                                        className={`text-[${appFontSize}px] text-red-500`}
                                    >
                                        {v}
                                    </p>
                                );
                            })
                        ) : (
                            <></>
                        )}
                    </CardBody>
                    <CardFooter
                        className={`bg-content1 rounded-none rounded-b-[10px] flex px-[12px] p-[5px] ${hide && 'hidden'}`}
                    >
                        <ButtonGroup>
                            <Tooltip content={t('translate.copy')}>
                                <Button
                                    isIconOnly
                                    variant='light'
                                    size='sm'
                                    isDisabled={result === ''}
                                    onPress={() => {
                                        writeText(result);
                                    }}
                                >
                                    <MdContentCopy className='text-[16px]' />
                                </Button>
                            </Tooltip>
                            <Tooltip content={t('translate.translate_back')}>
                                <Button
                                    isIconOnly
                                    variant='light'
                                    size='sm'
                                    isDisabled={result === ''}
                                    onPress={async () => {
                                        setError('');
                                        let newTargetLanguage = sourceLanguage;
                                        if (sourceLanguage === 'auto') {
                                            newTargetLanguage = detectLanguage;
                                        }
                                        let newSourceLanguage = targetLanguage;
                                        if (sourceLanguage === 'auto') {
                                            newSourceLanguage = 'auto';
                                        }
                                        const translateServiceName = getServiceName(currentTranslateServiceInstanceKey);
                                        const LanguageEnum = builtinServices[translateServiceName].Language;
                                        if (newSourceLanguage in LanguageEnum && newTargetLanguage in LanguageEnum) {
                                            setIsLoading(true);
                                            setHide(true);
                                            const instanceConfig =
                                                serviceInstanceConfigMap[currentTranslateServiceInstanceKey] ?? {};
                                            const setHideOnce = invokeOnce(setHide);
                                            builtinServices[translateServiceName]
                                                .translate(
                                                    result.trim(),
                                                    LanguageEnum[newSourceLanguage],
                                                    LanguageEnum[newTargetLanguage],
                                                    {
                                                        config: instanceConfig,
                                                        detect: newSourceLanguage,
                                                        setResult: (v) => {
                                                            setResult(v);
                                                            setHideOnce(false);
                                                        },
                                                    }
                                                )
                                                .then(
                                                    (v) => {
                                                        const target = typeof v === 'string' ? v.trim() : String(v);
                                                        setResult(target === result ? target + ' ' : target);
                                                        setIsLoading(false);
                                                        if (target !== '') {
                                                            setHideOnce(false);
                                                        }
                                                    },
                                                    (e) => {
                                                        setError(e.toString());
                                                        setIsLoading(false);
                                                    }
                                                );
                                        } else {
                                            setError('Language not supported');
                                        }
                                    }}
                                >
                                    <TbTransformFilled className='text-[16px]' />
                                </Button>
                            </Tooltip>
                            <Tooltip content={t('translate.retry')}>
                                <Button
                                    isIconOnly
                                    variant='light'
                                    size='sm'
                                    className={`${error === '' && 'hidden'}`}
                                    onPress={() => {
                                        setError('');
                                        setResult('');
                                        translate();
                                    }}
                                >
                                    <GiCycle className='text-[16px]' />
                                </Button>
                            </Tooltip>
                        </ButtonGroup>
                    </CardFooter>
                </div>
            </animated.div>
        </Card>
    );
}
