/**
 * Resolves the Chat Completions endpoint from a user supplied request path:
 * bare domains and /v1 roots are completed, full /chat/completions URLs pass
 * through. Shared by the translate and the OCR services so users can reuse
 * the same endpoint string.
 */
export function resolveChatCompletionsUrl(requestPath: string): string {
    let raw = String(requestPath ?? '').trim();
    // Unset endpoint: fall back to the OpenAI default rather than throwing.
    if (raw === '') {
        raw = 'https://api.openai.com/v1/chat/completions';
    }
    if (!/^https?:\/\/.+/.test(raw)) {
        raw = `https://${raw}`;
    }
    const apiUrl = new URL(raw);
    let pathname = apiUrl.pathname.replace(/\/+$/, '');
    if (!pathname.endsWith('/chat/completions')) {
        pathname = pathname.endsWith('/v1') ? `${pathname}/chat/completions` : `${pathname}/v1/chat/completions`;
    }
    apiUrl.pathname = pathname;
    return apiUrl.href;
}

/**
 * True when the endpoint points at a machine-local address (loopback,
 * `.local` mDNS names, RFC1918 private ranges). Local inference servers
 * (Ollama, LM Studio, one-api on a NAS, …) are the common keyless case, so
 * a missing API key is not automatically an error there.
 */
export function isKeylessLocalEndpoint(url: string): boolean {
    try {
        // IPv6 hostnames keep their brackets in URL.hostname — strip them.
        const host = new URL(url).hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
        if (host === 'localhost' || host === '::1' || host.endsWith('.local')) {
            return true;
        }
        const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
        if (ipv4 !== null) {
            const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
            if (a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31)) {
                return true;
            }
        }
        return false;
    } catch {
        return false;
    }
}
