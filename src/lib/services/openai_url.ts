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
