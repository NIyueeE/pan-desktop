import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    buildDefinitionsUrl,
    buildYoudaoUrl,
    htmlToText,
    isSingleWord,
    lookup,
    parseSections,
    parseYoudao,
} from './free_dictionary';

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/plugin-http', () => ({ fetch: fetchMock }));

function jsonOk(payload: unknown): { ok: boolean; status: number; json: () => Promise<unknown> } {
    return { ok: true, status: 200, json: async () => payload };
}

beforeEach(() => {
    fetchMock.mockReset();
});

describe('language routing', () => {
    it('routes Chinese targets to the Youdao web dictionary', async () => {
        fetchMock.mockResolvedValue(
            jsonOk({ ec: { word: [{ usphone: 'test', trs: [{ tr: [{ l: { i: ['n. 试验'] } }] }] }] } })
        );
        const result = await lookup('test', 'zh_cn');

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(String(fetchMock.mock.calls[0]?.[0])).toContain('dict.youdao.com/jsonapi');
        expect(result?.meanings).toEqual([{ partOfSpeech: 'n.', definitions: [{ definition: '试验', example: '' }] }]);
    });

    it('never falls back to English on a Youdao miss — the failure stays visible', async () => {
        // A Youdao miss (or failure) used to be masked by the English
        // Wiktionary section: the Chinese target must answer for itself.
        fetchMock.mockResolvedValue(jsonOk({ simple: { query: 'test' } }));
        await expect(lookup('test', 'zh_cn')).resolves.toBeNull();
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('sends browser-like headers to Youdao (the WAF 403s bot-shaped requests)', async () => {
        fetchMock.mockResolvedValue(jsonOk({ simple: { query: 'test' } }));
        await lookup('test', 'zh_cn');

        const init = (fetchMock.mock.calls[0]?.[1] ?? {}) as { headers: Record<string, string> };
        expect(init.headers['User-Agent']).toContain('Mozilla/5.0');
        expect(init.headers['Referer']).toContain('dict.youdao.com');
        expect(init.headers['Accept-Language']).toContain('zh-CN');
    });

    it('keeps the descriptive pan UA for Wiktionary (Wikimedia UA policy)', async () => {
        fetchMock.mockResolvedValue(jsonOk({ en: [{ partOfSpeech: 'Noun', definitions: [{ definition: 'x' }] }] }));
        await lookup('hello', 'en');

        const init = (fetchMock.mock.calls[0]?.[1] ?? {}) as { headers: Record<string, string> };
        expect(init.headers['User-Agent']).toContain('pan-desktop');
    });

    it('routes other targets to the Wiktionary section in that language', async () => {
        fetchMock.mockResolvedValue(
            jsonOk({ fr: [{ partOfSpeech: 'Interjection', definitions: [{ definition: 'bonjour' }] }] })
        );
        const result = await lookup('hello', 'fr');

        expect(String(fetchMock.mock.calls[0]?.[0])).toContain('wiktionary.org/api/rest_v1/page/definition');
        expect(result?.meanings).toEqual([
            { partOfSpeech: 'Interjection', definitions: [{ definition: 'bonjour', example: '' }] },
        ]);
    });

    it('falls back to the English section once when the target section is missing', async () => {
        fetchMock.mockResolvedValue(jsonOk({}));
        await expect(lookup('hello', 'fr')).resolves.toBeNull();
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(String(fetchMock.mock.calls[1]?.[0])).toBe(buildDefinitionsUrl('hello'));
    });

    it('falls back to the English section for languages without a Wiktionary section', async () => {
        fetchMock.mockResolvedValue(
            jsonOk({ en: [{ partOfSpeech: 'Noun', definitions: [{ definition: 'A greeting.' }] }] })
        );
        const result = await lookup('hello', 'klingon');

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(result?.meanings).toEqual([
            { partOfSpeech: 'Noun', definitions: [{ definition: 'A greeting.', example: '' }] },
        ]);
    });
});

describe('isSingleWord', () => {
    it('accepts a lone word and trims around it', () => {
        expect(isSingleWord('hello')).toBe(true);
        expect(isSingleWord('  hello  ')).toBe(true);
        expect(isSingleWord("don't")).toBe(true);
    });

    it('rejects phrases, whitespace-only and empty text', () => {
        expect(isSingleWord('hello world')).toBe(false);
        expect(isSingleWord('hello\nworld')).toBe(false);
        expect(isSingleWord('   ')).toBe(false);
        expect(isSingleWord('')).toBe(false);
    });
});

describe('buildYoudaoUrl', () => {
    it('encodes the word and requests the ec / ee / expand_ec / sentence dicts', () => {
        const url = buildYoudaoUrl('hello world');
        expect(url).toContain('https://dict.youdao.com/jsonapi?jsonversion=2&client=mobile&q=hello%20world&dicts=');
        const dicts = decodeURIComponent(/dicts=([^&]+)/.exec(url)?.[1] ?? '');
        expect(dicts).toContain('"ec"');
        expect(dicts).toContain('"ee"');
        expect(dicts).toContain('"expand_ec"');
        expect(dicts).toContain('"blng_sents_part"');
    });
});

describe('parseYoudao', () => {
    // Fixture mirrors the live jsonapi shape for "test" (usspeech arrives as
    // a bare voice key like "test&type=2", not a full URL).
    const PAYLOAD = {
        ec: {
            word: [
                {
                    usphone: 'test',
                    ukphone: 'test',
                    usspeech: 'test&type=2',
                    wfs: [
                        { wf: { name: '复数', value: 'tests' } },
                        { wf: { name: '过去分词', value: 'tested' } },
                        { wf: { name: '复数', value: '' } },
                    ],
                    trs: [
                        {
                            tr: [
                                {
                                    l: {
                                        i: [
                                            'n. （书面或口头的）测验，考试；检验，试验',
                                            { '#text': 'Test', '@action': 'link' },
                                        ],
                                    },
                                },
                            ],
                        },
                        { tr: [{ l: { i: ['v. 试验，测试；测验，考查'] } }] },
                        { tr: [{ l: { i: [] } }] },
                    ],
                },
            ],
        },
        ee: {
            source: { name: 'WordNet', url: 'https://wordnet.princeton.edu' },
            word: {
                trs: [
                    {
                        pos: 'n.',
                        tr: [
                            { l: { i: 'any standardized procedure for measuring sensitivity or memory' } },
                            { l: { i: 'a hard outer covering as of some amoebas and sea urchins' } },
                        ],
                    },
                    { pos: 'v.', tr: [{ l: { i: 'put to the test, as for its quality' } }] },
                ],
            },
        },
        expand_ec: {
            word: [
                {
                    transList: [
                        {
                            content: {
                                examType: [
                                    { en: 'CET4', zh: '四级' },
                                    { en: 'CET6', zh: '六级' },
                                    { en: 'CET4', zh: '四级' },
                                ],
                            },
                        },
                    ],
                },
            ],
        },
        blng_sents_part: {
            'sentence-pair': [
                { sentence: 'He failed his driving test.', 'sentence-translation': '他驾驶执照考试不及格。' },
                { sentence: '', 'sentence-translation': '无源句，丢弃' },
            ],
        },
    };

    it('normalises phonetics, audio, POS-prefixed definitions and bilingual examples', () => {
        const result = parseYoudao(PAYLOAD, 'test');

        expect(result).not.toBeNull();
        expect(result?.word).toBe('test');
        expect(result?.phonetic).toBe('test');
        // The bare voice key must become a playable dictvoice URL.
        expect(result?.audioUrl).toBe('https://dict.youdao.com/dictvoice?audio=test&type=2');
        expect(result?.meanings).toEqual([
            {
                partOfSpeech: 'n.',
                definitions: [{ definition: '（书面或口头的）测验，考试；检验，试验Test', example: '' }],
            },
            { partOfSpeech: 'v.', definitions: [{ definition: '试验，测试；测验，考查', example: '' }] },
        ]);
        expect(result?.examples).toEqual([{ source: 'He failed his driving test.', target: '他驾驶执照考试不及格。' }]);
        expect(result?.sourceUrl).toContain('dict.youdao.com/result?word=test');
    });

    it('extracts word forms, WordNet senses and deduplicated exam tags', () => {
        const result = parseYoudao(PAYLOAD, 'test');

        expect(result?.wordForms).toEqual([
            { name: '复数', value: 'tests' },
            { name: '过去分词', value: 'tested' },
        ]);
        expect(result?.englishMeanings).toEqual([
            {
                partOfSpeech: 'n.',
                definitions: [
                    { definition: 'any standardized procedure for measuring sensitivity or memory', example: '' },
                    { definition: 'a hard outer covering as of some amoebas and sea urchins', example: '' },
                ],
            },
            { partOfSpeech: 'v.', definitions: [{ definition: 'put to the test, as for its quality', example: '' }] },
        ]);
        expect(result?.examTags).toEqual(['cet4', 'cet6']);
    });

    it('omits the optional sections when the dicts are absent', () => {
        const result = parseYoudao(
            { ec: { word: [{ usphone: 'x', trs: [{ tr: [{ l: { i: ['n. 试验'] } }] }] }] } },
            'x'
        );
        expect(result?.wordForms).toBeUndefined();
        expect(result?.englishMeanings).toBeUndefined();
        expect(result?.examTags).toBeUndefined();
        // A UK-only voice key builds the type=1 dictvoice URL.
        const uk = parseYoudao(
            { ec: { word: [{ ukspeech: 'x&type=1', trs: [{ tr: [{ l: { i: ['n. 试验'] } }] }] }] } },
            'x'
        );
        expect(uk?.audioUrl).toBe('https://dict.youdao.com/dictvoice?audio=x&type=1');
    });

    it('passes a full audio URL through unchanged', () => {
        const result = parseYoudao(
            {
                ec: {
                    word: [
                        {
                            usspeech: 'https://dict.youdao.com/dictvoice?audio=x&type=2',
                            trs: [{ tr: [{ l: { i: ['n. 试验'] } }] }],
                        },
                    ],
                },
            },
            'x'
        );
        expect(result?.audioUrl).toBe('https://dict.youdao.com/dictvoice?audio=x&type=2');
    });

    it('is a miss without ec entries or without any usable translation', () => {
        expect(parseYoudao({}, 'test')).toBeNull();
        expect(parseYoudao({ ec: { word: [] } }, 'test')).toBeNull();
        expect(parseYoudao({ ec: { word: [{ trs: [{ tr: [{ l: { i: [] } }] }] }] } }, 'test')).toBeNull();
        expect(parseYoudao(null, 'test')).toBeNull();
    });
});

describe('wiktionary fallback', () => {
    it('builds the REST definitions URL', () => {
        expect(buildDefinitionsUrl('hello')).toBe('https://en.wiktionary.org/api/rest_v1/page/definition/hello');
        expect(buildDefinitionsUrl('你好 世界')).toBe(
            'https://en.wiktionary.org/api/rest_v1/page/definition/%E4%BD%A0%E5%A5%BD%20%E4%B8%96%E7%95%8C'
        );
    });

    it('strips Parsoid markup from real definition fragments', () => {
        expect(
            htmlToText(
                '<span class="use-with-mention" about="#mwt70" typeof="mw:Transclusion">A <a rel="mw:WikiLink" href="/wiki/greeting#English" title="greeting">greeting</a></span>'
            )
        ).toBe('A greeting');
        expect(htmlToText('<b>Hello</b><span typeof="mw:Entity">?</span> How may I help you')).toBe(
            'Hello? How may I help you'
        );
        expect(htmlToText('&quot;Hi&quot; &amp; &#39;bye&lt;tag&gt;')).toBe(`"Hi" & 'bye<tag>`);
    });

    it('normalises the requested language section and drops markup-only sections', () => {
        const payload = {
            en: [
                {
                    partOfSpeech: 'Interjection',
                    definitions: [
                        {
                            definition: '<span typeof="mw:Transclusion">A <a title="greeting">greeting</a></span>',
                            examples: ['<b>Hello</b>, everyone.'],
                        },
                        { definition: '<span class="usage-label-sense"></span>' },
                    ],
                },
                { partOfSpeech: 'Noun', definitions: [{ definition: '"<a>Hello</a>!" or an equivalent greeting.' }] },
            ],
            fr: [{ partOfSpeech: 'Interjection', definitions: [{ definition: '<i>bonjour</i>' }] }],
        };

        const result = parseSections(payload, 'en', 'hello');
        expect(result?.meanings).toEqual([
            {
                partOfSpeech: 'Interjection',
                definitions: [{ definition: 'A greeting', example: 'Hello, everyone.' }],
            },
            { partOfSpeech: 'Noun', definitions: [{ definition: '"Hello!" or an equivalent greeting.', example: '' }] },
        ]);
        expect(parseSections(payload, 'de', 'hello')).toBeNull();
        expect(
            parseSections({ sv: [{ partOfSpeech: 'Noun', definitions: [{ definition: '<i></i>' }] }] }, 'sv', 'x')
        ).toBeNull();
        expect(parseSections(null, 'en', 'x')).toBeNull();
        expect(parseSections('nope', 'en', 'x')).toBeNull();
    });
});
