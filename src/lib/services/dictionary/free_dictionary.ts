import { fetch } from '@tauri-apps/plugin-http';
import { info as logInfo } from '@tauri-apps/plugin-log';

import type { DictionaryExample, DictionaryMeaning, DictionaryResult } from '../types';

export const info = { name: 'free_dictionary', icon: '' };

const YOUDAO_BASE = 'https://dict.youdao.com/jsonapi';
const WIKT_BASE = 'https://en.wiktionary.org/api/rest_v1/page/definition';
const REQUEST_TIMEOUT_MS = 10_000;
const USER_AGENT = 'pan-desktop/4.3 (github.com/NIyueeE/pan-desktop)';

/** Target languages served by the Youdao web dictionary (the 英汉 `ec` dict
 * explains English words in Chinese, with bilingual examples). Every other
 * target falls back to the Wiktionary REST definitions written in the
 * target language. The language argument is the TRANSLATION TARGET. */
const YOUDAO_TARGETS = new Set(['zh_cn', 'zh_tw', 'zh']);

/** Our language codes → Wiktionary REST definition section keys. Languages
 * Wiktionary has no section namespace for resolve to null. */
const WIKT_CODES: Record<string, string> = {
    en: 'en',
    zh_cn: 'zh',
    zh_tw: 'zh',
    ja: 'ja',
    ko: 'ko',
    fr: 'fr',
    es: 'es',
    ru: 'ru',
    de: 'de',
    it: 'it',
    tr: 'tr',
    pt_pt: 'pt',
    pt_br: 'pt',
    vi: 'vi',
    ms: 'ms',
    ar: 'ar',
    hi: 'hi',
    fa: 'fa',
    sv: 'sv',
    pl: 'pl',
    nl: 'nl',
    uk: 'uk',
    nb_no: 'nb',
    nn_no: 'nn',
};

export function wiktionarySectionKey(language: string): string | null {
    const key = language.trim().toLowerCase();
    if (key === 'zh') {
        // The local detector (lingua) reports plain 'zh'.
        return 'zh';
    }
    return WIKT_CODES[key] ?? null;
}

/** A dictionary lookup makes sense only for a single word: anything with
 * inner whitespace is a phrase, and empty text is nothing to look up. */
export function isSingleWord(text: string): boolean {
    const trimmed = text.trim();
    return trimmed.length > 0 && !/\s/.test(trimmed);
}

export function buildYoudaoUrl(word: string): string {
    const dicts = JSON.stringify({ count: 99, dicts: [['ec'], ['blng_sents_part']] });
    return `${YOUDAO_BASE}?jsonversion=2&client=mobile&q=${encodeURIComponent(word)}&dicts=${encodeURIComponent(dicts)}`;
}

export function buildDefinitionsUrl(word: string): string {
    return `${WIKT_BASE}/${encodeURIComponent(word)}`;
}

/** Wiktionary definitions arrive as Parsoid HTML fragments (links, bold,
 * entity spans, transclusion wrappers): strip every tag, decode the handful
 * of raw entities that survive, collapse whitespace. */
export function htmlToText(html: string): string {
    return html
        .replace(/<[^>]*>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

interface RawDefinition {
    definition?: unknown;
    examples?: unknown;
}
interface RawSection {
    partOfSpeech?: unknown;
    definitions?: unknown;
}

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');

/** ── Youdao (target: Chinese) ────────────────────────────────────────────
 * The `ec` dict carries phonetics and POS-grouped Chinese definitions; the
 * `blng_sents_part` dict carries bilingual example sentences. */

interface RawInline {
    '#text'?: unknown;
}
interface RawL {
    l?: { i?: unknown };
}
interface RawTr {
    tr?: unknown;
}
interface RawEcWord {
    usphone?: unknown;
    ukphone?: unknown;
    usspeech?: unknown;
    ukspeech?: unknown;
    trs?: unknown;
}
interface RawSentencePair {
    sentence?: unknown;
    'sentence-translation'?: unknown;
}

/** One `ec` translation row: `tr[0].l.i` mixes plain strings with link
 * objects; concatenated it reads "n. 中文释义一；中文释义二". */
function youdaoTrText(tr: unknown): string {
    if (typeof tr !== 'object' || tr === null || !Array.isArray((tr as RawTr).tr)) {
        return '';
    }
    const rows = (tr as RawTr).tr as unknown[];
    const first = rows[0];
    if (typeof first !== 'object' || first === null) {
        return '';
    }
    const inner = (first as RawL).l?.i;
    if (!Array.isArray(inner)) {
        return '';
    }
    const text = inner
        .map((item) =>
            typeof item === 'string'
                ? item
                : typeof (item as RawInline)['#text'] === 'string'
                  ? ((item as RawInline)['#text'] as string)
                  : ''
        )
        .join('');
    return text.replace(/\s+/g, ' ').trim();
}

export function parseYoudao(payload: unknown, word: string): DictionaryResult | null {
    if (typeof payload !== 'object' || payload === null) {
        return null;
    }
    const box = payload as Record<string, unknown>;
    const ec = box['ec'];
    if (typeof ec !== 'object' || ec === null) {
        return null;
    }
    const words = (ec as Record<string, unknown>)['word'];
    if (!Array.isArray(words) || words.length === 0 || typeof words[0] !== 'object' || words[0] === null) {
        return null;
    }
    const entry = words[0] as RawEcWord;
    const meanings: DictionaryMeaning[] = Array.isArray(entry.trs)
        ? (entry.trs as unknown[]).flatMap((tr: unknown) => {
              const text = youdaoTrText(tr);
              // Strip the leading "n. " / "phr. " part-of-speech prefix.
              const match = /^([a-zA-Z]+\.)\s*(.+)$/.exec(text);
              const partOfSpeech = match?.[1] ?? '';
              const definition = match?.[2] ?? text;
              return definition === '' ? [] : [{ partOfSpeech, definitions: [{ definition, example: '' }] }];
          })
        : [];
    if (meanings.length === 0) {
        return null;
    }
    let examples: DictionaryExample[] | undefined;
    const blng = box['blng_sents_part'];
    if (
        typeof blng === 'object' &&
        blng !== null &&
        Array.isArray((blng as Record<string, unknown>)['sentence-pair'])
    ) {
        const pairs = (blng as Record<string, unknown>)['sentence-pair'] as unknown[];
        examples = pairs
            .map((pair) => {
                const source = asString((pair as RawSentencePair)?.sentence);
                const target = asString((pair as RawSentencePair)?.['sentence-translation']);
                return { source, target };
            })
            .filter((pair) => pair.source !== '');
        if (examples.length === 0) {
            examples = undefined;
        }
    }
    return {
        word,
        phonetic: asString(entry.usphone) || asString(entry.ukphone),
        audioUrl: asString(entry.usspeech) || asString(entry.ukspeech),
        meanings,
        ...(examples !== undefined ? { examples } : {}),
        sourceUrl: `https://dict.youdao.com/result?word=${encodeURIComponent(word)}&lang=en`,
    };
}

export async function lookupYoudao(word: string): Promise<DictionaryResult | null> {
    const response = await fetch(buildYoudaoUrl(word), {
        method: 'GET',
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
        throw new Error(`Youdao API error: ${response.status}`);
    }
    const payload: unknown = await response.json();
    const result = parseYoudao(payload, word);
    if (result === null) {
        // The endpoint answers 200 even when it serves no dictionary data;
        // log the shape so a remote miss is diagnosable from the log file.
        const shape = typeof payload === 'object' && payload !== null ? Object.keys(payload).join(',') : typeof payload;
        void logInfo(`Youdao lookup missed for "${word}" (payload keys: ${shape})`);
    }
    return result;
}

/** ── Wiktionary (every other target language) ─────────────────────────── */

/** Normalise one language's Wiktionary sections into our result shape. The
 * upstream payloads are defensively coerced: definitions that are pure
 * markup (usage labels) strip to empty and are dropped. Returns null when
 * the word has no entry in the requested language. */
export function parseSections(payload: unknown, language: string, word: string): DictionaryResult | null {
    if (typeof payload !== 'object' || payload === null) {
        return null;
    }
    const sections = (payload as Record<string, unknown>)[language];
    if (!Array.isArray(sections)) {
        return null;
    }
    const meanings: DictionaryMeaning[] = sections.flatMap((section: RawSection) => {
        if (typeof section !== 'object' || section === null || !Array.isArray(section.definitions)) {
            return [];
        }
        const partOfSpeech = asString(section.partOfSpeech);
        const definitions = section.definitions.flatMap((definition: RawDefinition) => {
            if (typeof definition !== 'object' || definition === null) {
                return [];
            }
            const text = htmlToText(asString(definition.definition));
            if (text === '') {
                return [];
            }
            const examples = Array.isArray(definition.examples)
                ? definition.examples.map((example) => htmlToText(asString(example))).filter((e) => e !== '')
                : [];
            return [{ definition: text, example: examples[0] ?? '' }];
        });
        // A section whose definitions are all pure markup (usage labels)
        // strips to nothing: drop it entirely so the word counts as a miss
        // in this language rather than rendering an empty body.
        return definitions.length === 0 ? [] : [{ partOfSpeech, definitions }];
    });
    if (meanings.length === 0) {
        return null;
    }
    return {
        word,
        // The definitions endpoint carries no phonetics or audio.
        phonetic: '',
        audioUrl: '',
        meanings,
        sourceUrl: `https://en.wiktionary.org/wiki/${encodeURIComponent(word)}`,
    };
}

export async function lookupWiktionary(word: string, language: string): Promise<DictionaryResult | null> {
    const section = wiktionarySectionKey(language);
    if (section === null) {
        return null;
    }
    const response = await fetch(buildDefinitionsUrl(word), {
        method: 'GET',
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.status === 404) {
        return null;
    }
    if (!response.ok) {
        throw new Error(`Wiktionary API error: ${response.status}`);
    }
    const payload: unknown = await response.json();
    return parseSections(payload, section, word);
}

/** Look a single word up, explained in the TARGET language. A clean miss
 * (Youdao without entries, Wiktionary 404 / missing section) resolves null
 * — an expected outcome, not an error. */
export async function lookup(word: string, language: string): Promise<DictionaryResult | null> {
    const target = language.trim().toLowerCase();
    if (YOUDAO_TARGETS.has(target)) {
        // Youdao owns the Chinese target outright: a miss or a failure is
        // surfaced as-is — silently substituting the English Wiktionary
        // section hid real failures behind unrelated English definitions.
        return lookupYoudao(word);
    }
    const direct = await lookupWiktionary(word, target);
    if (direct !== null || target === 'en') {
        return direct;
    }
    // The word often lacks a section in the target language: fall back to
    // the English section exactly once (Wiktionary's hub language).
    return lookupWiktionary(word, 'en');
}
