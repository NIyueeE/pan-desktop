import { Component } from 'react';
import { Button, Card, CardBody } from '@nextui-org/react';
import { useTranslation } from 'react-i18next';

import { error as logError } from '@tauri-apps/plugin-log';

/**
 * Keeps a rendering error inside one page/window visible instead of wiping the
 * whole webview to a white screen (no devtools in release builds).
 */
class ErrorBoundaryInner extends Component {
    constructor(props) {
        super(props);
        this.state = { error: null };
    }

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, info) {
        void logError(`UI render error: ${error}\n${info.componentStack ?? ''}`).catch(() => {});
    }

    render() {
        const { error } = this.state;
        const { children, t, resetKey } = this.props;
        if (error) {
            return (
                <Card className='m-[10px]'>
                    <CardBody className='gap-[10px]'>
                        <h2 className='text-xl font-bold'>{t('common.error_boundary_title')}</h2>
                        <p className='text-default-500'>{t('common.error_boundary_desc')}</p>
                        <pre className='text-xs text-danger-500 whitespace-pre-wrap max-h-[40vh] overflow-auto'>
                            {String(error)}
                        </pre>
                        <div className='flex gap-[10px]'>
                            <Button
                                color='primary'
                                onPress={() => {
                                    this.setState({ error: null });
                                }}
                            >
                                {t('common.error_boundary_retry')}
                            </Button>
                        </div>
                    </CardBody>
                </Card>
            );
        }
        // resetKey lets the parent clear a stale error on navigation.
        return resetKey !== undefined ? <div key={resetKey}>{children}</div> : children;
    }
}

export default function ErrorBoundary(props) {
    const { t } = useTranslation();
    const { children, resetKey } = props;
    return (
        <ErrorBoundaryInner
            t={t}
            resetKey={resetKey}
        >
            {children}
        </ErrorBoundaryInner>
    );
}
