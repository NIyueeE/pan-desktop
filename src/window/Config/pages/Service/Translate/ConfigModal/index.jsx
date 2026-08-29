import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Spacer } from '@nextui-org/react';
import { useTranslation } from 'react-i18next';
import React from 'react';

import * as builtinServices from '../../../../../../services/translate';
import { getServiceName } from '../../../../../../utils/service_instance';

export default function ConfigModal(props) {
    const { serviceInstanceKey, isOpen, onOpenChange, updateServiceInstanceList } = props;

    const serviceName = getServiceName(serviceInstanceKey);
    const service = builtinServices[serviceName];

    const { t } = useTranslation();
    const ConfigComponent = service?.Config;

    return (
        <Modal
            isOpen={isOpen}
            onOpenChange={onOpenChange}
            scrollBehavior='inside'
        >
            <ModalContent className='max-h-[75vh]'>
                {(onClose) => (
                    <>
                        <ModalHeader>
                            {service !== undefined && (
                                <img
                                    src={service.info.icon}
                                    className='h-[24px] w-[24px] my-auto'
                                    draggable={false}
                                />
                            )}
                            <Spacer x={2} />
                            {t(`services.translate.${serviceName}.title`)}
                        </ModalHeader>
                        <ModalBody>
                            {service !== undefined ? (
                                <ConfigComponent
                                    name={serviceName}
                                    instanceKey={serviceInstanceKey}
                                    updateServiceList={updateServiceInstanceList}
                                    onClose={onClose}
                                />
                            ) : (
                                <></>
                            )}
                        </ModalBody>
                        <ModalFooter>
                            <Button
                                color='danger'
                                variant='light'
                                onPress={onClose}
                            >
                                {t('common.cancel')}
                            </Button>
                        </ModalFooter>
                    </>
                )}
            </ModalContent>
        </Modal>
    );
}
