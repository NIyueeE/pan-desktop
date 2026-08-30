import { Button, Card, CardBody, CardFooter, ButtonGroup, Chip, Tooltip, Spacer } from '@nextui-org/react';
import React, { useEffect, useRef, useState } from 'react';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { listen } from '@tauri-apps/api/event';
import { MdContentCopy } from 'react-icons/md';
import { MdSmartButton } from 'react-icons/md';
import { useTranslation } from 'react-i18next';
import { HiTranslate } from 'react-icons/hi';
import { LuDelete } from 'react-icons/lu';
import { invoke } from '@tauri-apps/api/core';
import { atom, useAtom } from 'jotai';

import { getServiceName } from '../../../../utils/service_instance';
import { languageLabel } from '../../../../utils/language';
import { useConfig, useSyncAtom } from '../../../../hooks';
import * as recognizeServices from '../../../../services/recognize';
import detect from '../../../../utils/lang_detect';
import { markProgrammaticFocus } from '../../focus';
const appWindow = getCurrentWebviewWindow();

export const sourceTextAtom = atom('');
export const detectLanguageAtom = atom('');

let unlisten = null;
let sourceTextChangeTimer = null;

export default function SourceArea(props) {
    const { serviceInstanceConfigMap } = props;
    const [appFontSize] = useConfig('app_font_size', 16);
    const [sourceText, setSourceText, syncSourceText] = useSyncAtom(sourceTextAtom);
    const [detectLanguage, setDetectLanguage] = useAtom(detectLanguageAtom);
    const [incrementalTranslate] = useConfig('incremental_translate', false);
    const [dynamicTranslate] = useConfig('dynamic_translate', false);
    const [deleteNewline] = useConfig('translate_delete_newline', false);
    const [recognizeLanguage] = useConfig('recognize_language', 'auto');
    const [recognizeServiceList] = useConfig('recognize_service_list', ['system', 'tesseract']);
    const [hideWindow] = useConfig('translate_hide_window', false);
    const [hideSource] = useConfig('hide_source', false);
    const [windowType, setWindowType] = useState('[SELECTION_TRANSLATE]');
    const { t } = useTranslation();
    const textAreaRef = useRef();

    const detect_language = async (text) => {
        setDetectLanguage(await detect(text));
    };

    const handleRecognizeResult = (v) => {
        let newText = v.trim();
        if (deleteNewline) {
            newText = v.replace(/-\s+/g, '').replace(/\s+/g, ' ');
        }
        if (incrementalTranslate) {
            setSourceText((old) => {
                return old + ' ' + newText;
            });
        } else {
            setSourceText(newText);
        }
        detect_language(newText).then(() => {
            syncSourceText();
        });
    };

    const handleNewText = async (text) => {
        text = text.trim();
        if (hideWindow) {
            appWindow.hide();
        } else {
            // Exactly ONE programmatic focus per interaction — and only when
            // actually needed: tao's set_focus injects a synthetic ALT keypress
            // whenever SetForegroundWindow is denied, so redundant calls break
            // the IME and fight for the foreground. (window/Translate/focus.js
            // holds the grace period that suppresses the spurious blur burst
            // this can still cause right after focusing.)
            const [visible, focused] = await Promise.all([appWindow.isVisible(), appWindow.isFocused()]);
            if (!visible) {
                markProgrammaticFocus();
                appWindow.show();
            }
            if (!focused) {
                markProgrammaticFocus();
                appWindow.setFocus();
            }
        }
        // 清空检测语言
        setDetectLanguage('');
        if (text === '[INPUT_TRANSLATE]') {
            setWindowType('[INPUT_TRANSLATE]');
            setSourceText('', true);
            // DOM-level caret: keeps the caret in the textarea even when the
            // native window focus settles late (WebView2 on Windows).
            requestAnimationFrame(() => {
                textAreaRef.current?.focus();
            });
        } else if (text === '[IMAGE_TRANSLATE]') {
            setWindowType('[IMAGE_TRANSLATE]');
            const base64 = await invoke('get_base64');
            const serviceInstanceKey = recognizeServiceList[0];
            const serviceName = getServiceName(serviceInstanceKey);
            const instanceConfig = serviceInstanceConfigMap[serviceInstanceKey] ?? {};
            const recognizeService = recognizeServices[serviceName];
            if (recognizeService === undefined) {
                setSourceText(`Unknown recognize service: ${serviceName}`);
            } else if (recognizeLanguage in recognizeService.Language) {
                recognizeService
                    .recognize(base64, recognizeService.Language[recognizeLanguage], {
                        config: instanceConfig,
                    })
                    .then(handleRecognizeResult, (e) => {
                        setSourceText(e.toString());
                    });
            } else {
                setSourceText('Language not supported');
            }
        } else {
            setWindowType('[SELECTION_TRANSLATE]');
            let newText = text.trim();
            if (deleteNewline) {
                newText = text.replace(/-\s+/g, '').replace(/\s+/g, ' ');
            }
            if (incrementalTranslate) {
                setSourceText((old) => {
                    return old + ' ' + newText;
                });
            } else {
                setSourceText(newText);
            }
            detect_language(newText).then(() => {
                syncSourceText();
            });
        }
    };

    const keyDown = (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            detect_language(sourceText).then(() => {
                syncSourceText();
            });
        }
        if (event.key === 'Escape') {
            appWindow.close();
        }
    };

    useEffect(() => {
        if (hideWindow !== null) {
            if (unlisten) {
                unlisten.then((f) => {
                    f();
                });
            }
            unlisten = listen('new_text', (event) => {
                // Focusing happens exactly once inside handleNewText.
                handleNewText(event.payload);
            });
        }
    }, [hideWindow]); // eslint-disable-line react-hooks/exhaustive-deps -- listener re-registers only when hideWindow changes

    useEffect(() => {
        if (
            deleteNewline !== null &&
            incrementalTranslate !== null &&
            recognizeLanguage !== null &&
            recognizeServiceList !== null &&
            hideWindow !== null
        ) {
            invoke('get_text').then((v) => {
                handleNewText(v);
            });
        }
    }, [deleteNewline, incrementalTranslate, recognizeLanguage, recognizeServiceList, hideWindow]); // eslint-disable-line react-hooks/exhaustive-deps -- initial text is loaded once when OCR config is ready

    useEffect(() => {
        if (textAreaRef.current) {
            textAreaRef.current.style.height = '50px';
            textAreaRef.current.style.height = textAreaRef.current.scrollHeight + 'px';
        }
    }, [sourceText]);

    const changeSourceText = async (text) => {
        setDetectLanguage('');
        await setSourceText(text);
        if (dynamicTranslate) {
            if (sourceTextChangeTimer) {
                clearTimeout(sourceTextChangeTimer);
            }
            sourceTextChangeTimer = setTimeout(() => {
                detect_language(text).then(() => {
                    syncSourceText();
                });
            }, 1000);
        }
    };

    return (
        <div className={hideSource && windowType !== '[INPUT_TRANSLATE]' && 'hidden'}>
            <Card
                shadow='none'
                className='bg-content1 rounded-[10px] mt-[1px] pb-0'
            >
                <CardBody className='bg-content1 p-[12px] pb-0 max-h-[40vh] overflow-y-auto'>
                    <textarea
                        autoFocus
                        ref={textAreaRef}
                        className={`text-[${appFontSize}px] bg-content1 h-full resize-none outline-none`}
                        value={sourceText}
                        onKeyDown={keyDown}
                        onChange={(e) => {
                            const v = e.target.value;
                            changeSourceText(v);
                        }}
                    />
                </CardBody>

                <CardFooter className='bg-content1 rounded-none rounded-b-[10px] flex justify-between px-[12px] p-[5px]'>
                    <div className='flex justify-start'>
                        <ButtonGroup className='mr-[5px]'>
                            <Tooltip content={t('translate.copy')}>
                                <Button
                                    isIconOnly
                                    variant='light'
                                    size='sm'
                                    onPress={() => {
                                        writeText(sourceText);
                                    }}
                                >
                                    <MdContentCopy className='text-[16px]' />
                                </Button>
                            </Tooltip>
                            <Tooltip content={t('translate.delete_newline')}>
                                <Button
                                    isIconOnly
                                    variant='light'
                                    size='sm'
                                    onPress={() => {
                                        const newText = sourceText.replace(/-\s+/g, '').replace(/\s+/g, ' ');
                                        setSourceText(newText);
                                        detect_language(newText).then(() => {
                                            syncSourceText();
                                        });
                                    }}
                                >
                                    <MdSmartButton className='text-[16px]' />
                                </Button>
                            </Tooltip>
                            <Tooltip content={t('common.clear')}>
                                <Button
                                    variant='light'
                                    size='sm'
                                    isIconOnly
                                    isDisabled={sourceText === ''}
                                    onPress={() => {
                                        setSourceText('');
                                    }}
                                >
                                    <LuDelete className='text-[16px]' />
                                </Button>
                            </Tooltip>
                        </ButtonGroup>
                        {detectLanguage !== '' && (
                            <Chip
                                size='sm'
                                color='secondary'
                                variant='dot'
                                className='my-auto'
                            >
                                {languageLabel(t, detectLanguage)}
                            </Chip>
                        )}
                    </div>
                    <Tooltip content={t('translate.translate')}>
                        <Button
                            size='sm'
                            color='primary'
                            variant='light'
                            isIconOnly
                            className='text-[14px] font-bold'
                            startContent={<HiTranslate className='text-[16px]' />}
                            onPress={() => {
                                detect_language(sourceText).then(() => {
                                    syncSourceText();
                                });
                            }}
                        />
                    </Tooltip>
                </CardFooter>
            </Card>
            <Spacer y={2} />
        </div>
    );
}
