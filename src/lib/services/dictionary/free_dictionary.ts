import { fetch } from '@tauri-apps/plugin-http';
import { info as logInfo } from '@tauri-apps/plugin-log';

import type { DictionaryExample, DictionaryMeaning, DictionaryResult } from '../types';

export const info = { name: 'free_dictionary', icon: '' };

const YOUDAO_BASE = 'https://dict.youdao.com/jsonapi';
const WIKT_BASE = 'https://en.wiktionary.org/api/rest_v1/page/definition';
const REQUEST_TIMEOUT_MS = 10_000;
/** Wikimedia asks tools for a descriptive contact-bearing UA (keep). */
const WIKT_USER_AGENT = 'pan-desktop/4.3 (github.com/NIyueeE/pan-desktop)';
/** Youdao's risk control 403s non-browser requests (a custom tool UA is a
 * strong bot signal), so the lookup masquerades as the site's own XHR. */
const YOUDAO_USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

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
    const dicts = JSON.stringify({
        count: 99,
        dicts: [['ec'], ['ee'], ['expand_ec'], ['blng_sents_part']],
    });
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
interface RawWfRow {
    wf?: { name?: unknown; value?: unknown };
}
interface RawEeRow {
    pos?: unknown;
    tr?: unknown;
}
interface RawEcWord {
    usphone?: unknown;
    ukphone?: unknown;
    usspeech?: unknown;
    ukspeech?: unknown;
    trs?: unknown;
    wfs?: unknown;
}
interface RawSentencePair {
    sentence?: unknown;
    'sentence-translation'?: unknown;
}

/** Flatten an inline mix of plain strings and link objects into one string. */
function inlineText(inner: unknown): string {
    if (typeof inner === 'string') {
        return inner;
    }
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
    return inlineText((first as RawL).l?.i);
}

/** `ec.word[0].wfs` → 词形变化 rows; the names arrive already localized
 * (复数 / 过去分词 / …), so they render as-is. */
function youdaoWordForms(entry: RawEcWord): Array<{ name: string; value: string }> {
    if (!Array.isArray(entry.wfs)) {
        return [];
    }
    return (entry.wfs as unknown[]).flatMap((row: unknown) => {
        const wf = typeof row === 'object' && row !== null ? (row as RawWfRow).wf : undefined;
        const name = typeof wf === 'object' && wf !== null ? asString(wf.name) : '';
        const value = typeof wf === 'object' && wf !== null ? asString(wf.value) : '';
        return name !== '' && value !== '' ? [{ name, value }] : [];
    });
}

/** `ee` (WordNet) → POS-grouped English senses. `tr[].l.i` is a string for
 * the ee dict; each sense may carry an `exam` example (not rendered). */
function youdaoEeMeanings(ee: unknown): DictionaryMeaning[] {
    if (typeof ee !== 'object' || ee === null) {
        return [];
    }
    const word = (ee as Record<string, unknown>)['word'];
    const trs = typeof word === 'object' && word !== null ? (word as Record<string, unknown>)['trs'] : undefined;
    if (!Array.isArray(trs)) {
        return [];
    }
    return trs.flatMap((row: unknown) => {
        if (typeof row !== 'object' || row === null) {
            return [];
        }
        const partOfSpeech = asString((row as RawEeRow).pos);
        const items = (row as RawEeRow).tr;
        if (!Array.isArray(items)) {
            return [];
        }
        const definitions = items.flatMap((item: unknown) => {
            const text = typeof item === 'object' && item !== null ? inlineText((item as RawL).l?.i) : '';
            return text === '' ? [] : [{ definition: text, example: '' }];
        });
        return definitions.length === 0 ? [] : [{ partOfSpeech, definitions }];
    });
}

/** `expand_ec` → deduplicated exam tags as lowercase display codes
 * (e.g. ['cet4', 'cet6']). */
function youdaoExamTags(expandEc: unknown): string[] {
    if (typeof expandEc !== 'object' || expandEc === null) {
        return [];
    }
    const words = (expandEc as Record<string, unknown>)['word'];
    if (!Array.isArray(words)) {
        return [];
    }
    const tags: string[] = [];
    for (const word of words) {
        const transList =
            typeof word === 'object' && word !== null ? (word as Record<string, unknown>)['transList'] : undefined;
        if (!Array.isArray(transList)) {
            continue;
        }
        for (const trans of transList) {
            const content =
                typeof trans === 'object' && trans !== null ? (trans as Record<string, unknown>)['content'] : undefined;
            const examType =
                typeof content === 'object' && content !== null
                    ? (content as Record<string, unknown>)['examType']
                    : undefined;
            if (!Array.isArray(examType)) {
                continue;
            }
            for (const tag of examType) {
                const code =
                    typeof tag === 'object' && tag !== null
                        ? asString((tag as Record<string, unknown>)['en'])
                              .trim()
                              .toLowerCase()
                        : '';
                if (code !== '' && !tags.includes(code)) {
                    tags.push(code);
                }
            }
        }
    }
    return tags;
}

/** The voice fields arrive as bare keys ("test&type=2"), not URLs — build
 * the playable dictvoice URL; a full URL passes through unchanged. */
function youdaoAudioUrl(word: string, voiceKey: unknown, type: 1 | 2): string {
    const key = asString(voiceKey);
    if (key === '') {
        return '';
    }
    if (/^https?:\/\//.test(key)) {
        return key;
    }
    return `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=${type}`;
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
    const englishMeanings = youdaoEeMeanings(box['ee']);
    const wordForms = youdaoWordForms(entry);
    const examTags = youdaoExamTags(box['expand_ec']);
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
        audioUrl: youdaoAudioUrl(word, entry.usspeech, 2) || youdaoAudioUrl(word, entry.ukspeech, 1),
        meanings,
        ...(englishMeanings.length > 0 ? { englishMeanings } : {}),
        ...(wordForms.length > 0 ? { wordForms } : {}),
        ...(examTags.length > 0 ? { examTags } : {}),
        ...(examples !== undefined ? { examples } : {}),
        sourceUrl: `https://dict.youdao.com/result?word=${encodeURIComponent(word)}&lang=en`,
    };
}

export async function lookupYoudao(word: string): Promise<DictionaryResult | null> {
    const response = await fetch(buildYoudaoUrl(word), {
        method: 'GET',
        headers: {
            Accept: 'application/json, text/plain, */*',
            'User-Agent': YOUDAO_USER_AGENT,
            Referer: `https://dict.youdao.com/result?word=${encodeURIComponent(word)}&lang=en`,
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
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
        headers: { Accept: 'application/json', 'User-Agent': WIKT_USER_AGENT },
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
