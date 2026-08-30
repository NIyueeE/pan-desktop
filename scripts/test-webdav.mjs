#!/usr/bin/env node
/**
 * WebDAV backup client — smoke tests & edge cases.
 *
 * Runs the REAL src/utils/webdav.js against a local mock WebDAV server.
 * The only stubbed parts are the two Tauri-side imports (plugin-http fetch
 * is mapped to Node's global fetch; appVersion is a constant).
 *
 * Zero dependencies:  node scripts/test-webdav.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const AUTH_OK = 'Basic dXNlcjpwYXNz'; // user:pass
let passed = 0;
const section = (name) => console.log(`\n== ${name}`);

// ---------------------------------------------------------------------------
// Mock WebDAV server
// ---------------------------------------------------------------------------

class MockDav {
    constructor() {
        this.files = new Map(); // url -> string body
        this.dirs = new Set(['/dav']); // existing collections
        this.requireAuth = true;
        this.validAuths = new Set([AUTH_OK]); // accepted Authorization headers
        this.enforceDirs = false; // PUT returns 409 until parent MKCOL'd
        this.putStatus = null; // force status override
        this.getBody = null; // force body override
        this.hangMs = 0; // delay every response
        this.requests = [];
        const self = this;

        this.server = http.createServer((req, res) => {
            let body = '';
            req.on('data', (c) => (body += c));
            req.on('end', () => {
                self.requests.push({ method: req.method, url: req.url, auth: req.headers.authorization ?? '' });
                self.handle(req, res, body);
            });
        });
    }

    handle(req, res, body) {
        const respond = (status, payload = '') => {
            const send = () => {
                res.writeHead(status);
                res.end(payload);
            };
            if (this.hangMs > 0) setTimeout(send, this.hangMs);
            else send();
        };

        if (this.requireAuth && !this.validAuths.has(req.headers.authorization ?? '')) return respond(401);

        if (req.method === 'PROPFIND') return respond(207, '<multistatus/>');

        if (req.method === 'MKCOL') {
            if (this.files.has(req.url)) return respond(405);
            if (!this.dirs.has(req.url)) {
                // parents must exist
                const parent = req.url.replace(/\/[^/]*$/, '');
                if (parent && !this.dirs.has(parent)) return respond(409);
                this.dirs.add(req.url);
            }
            return respond(201);
        }

        if (req.method === 'PUT') {
            if (this.putStatus !== null) return respond(this.putStatus);
            const parent = req.url.replace(/\/[^/]*$/, '');
            if (this.enforceDirs && !this.dirs.has(parent)) return respond(409);
            this.files.set(req.url, body);
            return respond(201);
        }

        if (req.method === 'GET') {
            if (this.files.has(req.url)) return respond(200, this.getBody ?? this.files.get(req.url));
            return respond(404);
        }

        return respond(405);
    }

    listen() {
        return new Promise((resolve) => this.server.listen(0, '127.0.0.1', resolve));
    }
    get origin() {
        return `http://127.0.0.1:${this.server.address().port}`;
    }
    close() {
        return new Promise((resolve) => this.server.close(resolve));
    }
}

// ---------------------------------------------------------------------------
// Load the real module with Tauri imports stubbed
// ---------------------------------------------------------------------------

async function loadModule() {
    const src = fs
        .readFileSync(path.resolve('src/utils/webdav.js'), 'utf8')
        .replace("import { fetch } from '@tauri-apps/plugin-http';", 'const fetch = globalThis.__fetch;')
        .replace("import { appVersion } from './env';", "const appVersion = 'test-0.0.0';")
        .replace(
            /import \{[^}]*\} from '\.\/service_instance';/s,
            `const BUILTIN_TRANSLATE_SERVICES = ['openai'];
const BUILTIN_RECOGNIZE_SERVICES = ['system', 'tesseract'];
const DEFAULT_TRANSLATE_SERVICE_LIST = ['openai'];
const DEFAULT_RECOGNIZE_SERVICE_LIST = ['system', 'tesseract'];`
        );
    assert.ok(!/from '@tauri-apps/.test(src), 'plugin-http import stripped');
    assert.ok(!/from '\.\/service_instance'/.test(src), 'service_instance import stripped');
    globalThis.__fetch = globalThis.fetch;
    return import(`data:text/javascript;base64,${Buffer.from(src).toString('base64')}`);
}

/** Fake store mirroring tauri-plugin-store semantics:
 *  mutations hit an in-memory map; save() persists to "disk";
 *  reload() discards memory and re-reads from "disk". */
function fakeStore(initial = {}) {
    const disk = new Map(Object.entries(initial));
    const kv = new Map(disk);
    let failSetOnKey = null;
    return {
        kv,
        set: async (k, v) => {
            if (k === failSetOnKey) throw new Error('simulated store failure');
            kv.set(k, v);
        },
        delete: async (k) => kv.delete(k),
        keys: async () => [...kv.keys()],
        entries: async () => [...kv.entries()],
        save: async () => {
            disk.clear();
            for (const [k, v] of kv) disk.set(k, v);
        },
        reload: async () => {
            kv.clear();
            for (const [k, v] of disk) kv.set(k, v);
        },
        failNextSetOn: (key) => (failSetOnKey = key),
    };
}

// ---------------------------------------------------------------------------

async function main() {
    const webdav = await loadModule();
    const dav = new MockDav();
    await dav.listen();
    const base = `${dav.origin}/dav`;
    const USER = 'user';
    const PASS = 'pass';

    try {
        // =================================================================
        section('SMOKE: full backup / restore cycle');
        // =================================================================
        const local = fakeStore({ app_language: 'zh_cn', 'openai@1_config': { model: 'gpt-4o', temperature: 0.3 } });
        await webdav.testConnection(base, USER, PASS);
        await webdav.uploadBackup(local, base, USER, PASS, 'pan-config.json');
        assert.ok(dav.files.has('/dav/pan-config.json'), 'file stored on server');
        const restored = await webdav.downloadBackup(base, USER, PASS, 'pan-config.json');
        const target = fakeStore({});
        await webdav.applyBackup(target, restored);
        assert.equal(target.kv.get('app_language'), 'zh_cn');
        assert.deepEqual(target.kv.get('openai@1_config'), { model: 'gpt-4o', temperature: 0.3 });
        passed++;
        console.log('upload → download → apply roundtrip OK');

        // =================================================================
        section('URL handling');
        // =================================================================
        for (const bad of ['', '   ', 'notaurl', 'ftp://x.com', '//example.com/dav']) {
            await assert.rejects(
                () => webdav.uploadBackup(fakeStore(), bad, USER, PASS),
                /Invalid WebDAV URL/,
                `upload must reject ${JSON.stringify(bad)}`
            );
            await assert.rejects(() => webdav.testConnection(bad, USER, PASS), /Invalid WebDAV URL/);
        }
        passed++;
        console.log('invalid URLs rejected (empty / scheme-less / ftp://) OK');

        assert.equal(webdav.backupFileUrl(`${base}///`, ''), `${base}/${webdav.DEFAULT_BACKUP_FILENAME}`);
        assert.equal(webdav.backupFileUrl(`  ${base}/  `, undefined), `${base}/pan-config.json`);
        assert.equal(webdav.backupFileUrl(base, null), `${base}/pan-config.json`);
        assert.equal(webdav.backupFileUrl(base, 'sub/dir/pan.json'), `${base}/sub/dir/pan.json`);
        passed++;
        console.log('trailing slashes trimmed, default filename fallback OK');

        // =================================================================
        section('Legacy pot backups still restore');
        // =================================================================
        // The pan rebrand must not orphan backups created by upstream pot:
        // validation is type-based, never on the `app` marker.
        dav.files.set(
            '/dav/legacy-pot.json',
            JSON.stringify({
                app: 'pot',
                type: 'config-backup',
                version: '4.1.3',
                timestamp: Date.now(),
                data: { app_language: 'zh_cn', 'openai@legacy_config': { model: 'gpt-4o' } },
            })
        );
        const legacyRestored = await webdav.downloadBackup(base, USER, PASS, 'legacy-pot.json');
        const legacyTarget = fakeStore({});
        await webdav.applyBackup(legacyTarget, legacyRestored);
        assert.equal(legacyTarget.kv.get('app_language'), 'zh_cn');
        assert.deepEqual(legacyTarget.kv.get('openai@legacy_config'), { model: 'gpt-4o' });
        passed++;
        console.log('backup with app: "pot" (upstream marker) downloads and applies OK');

        // =================================================================
        section('Filename safety & encoding');
        // =================================================================
        for (const evil of ['../evil.json', '../../etc/passwd', 'a/../../b', '.', '..//..', '\\\\server\\share']) {
            assert.throws(() => webdav.backupFileUrl(base, evil), /Invalid backup file name/, `rejects ${evil}`);
        }
        passed++;
        console.log('path traversal (../ .. \\ .) rejected OK');

        const unicodeName = webdav.backupFileUrl(base, '备份/配置 中文.json');
        assert.ok(unicodeName.includes('%E9%85%8D%E7%BD%AE'), 'unicode percent-encoded');
        assert.ok(!/\s/.test(unicodeName), 'no raw spaces in URL');
        passed++;
        console.log('unicode filename encoding OK');

        // =================================================================
        section('Authentication');
        // =================================================================
        dav.requireAuth = true;
        await assert.rejects(() => webdav.testConnection(base, USER, 'wrong-password'), /responded with 401/);
        await assert.rejects(() => webdav.uploadBackup(local, base, USER, 'nope'), /Upload failed with 401/);
        passed++;
        console.log('wrong password → 401 surfaced OK');

        dav.requests.length = 0;
        const anonStore = fakeStore({ k: 1 });
        // server has auth ON, so use a no-auth instance to check header absence:
        dav.requireAuth = false;
        await webdav.uploadBackup(anonStore, base, '', '', 'anon.json');
        const putReq = dav.requests.filter((r) => r.method === 'PUT').at(-1);
        assert.equal(putReq.auth, '', 'no Authorization header when credentials empty');
        passed++;
        console.log('empty credentials omit Authorization header OK');

        // =================================================================
        section('Server error mapping');
        // =================================================================
        dav.requireAuth = false;
        dav.putStatus = 500;
        await assert.rejects(() => webdav.uploadBackup(anonStore, base, '', '', 'x.json'), /Upload failed with 500/);
        dav.putStatus = 403;
        await assert.rejects(() => webdav.uploadBackup(anonStore, base, '', '', 'x.json'), /Upload failed with 403/);
        dav.putStatus = null;
        await assert.rejects(() => webdav.downloadBackup(base, '', '', 'missing.json'), /No backup found/);
        passed++;
        console.log('500 / 403 upload and 404 download mapped to clear errors OK');

        // =================================================================
        section('Malformed remote payloads');
        // =================================================================
        dav.files.set('/dav/broken.json', '{not json at all');
        await assert.rejects(() => webdav.downloadBackup(base, '', '', 'broken.json'), /not valid JSON/);

        dav.files.set('/dav/wrongtype.json', JSON.stringify({ type: 'something-else', data: {} }));
        await assert.rejects(() => webdav.downloadBackup(base, '', '', 'wrongtype.json'), /not a valid pan backup/);

        dav.files.set('/dav/nodata.json', JSON.stringify({ app: 'pot', type: 'config-backup' }));
        await assert.rejects(() => webdav.downloadBackup(base, '', '', 'nodata.json'), /not a valid pan backup/);

        dav.files.set('/dav/arraydata.json', JSON.stringify({ type: 'config-backup', data: [1, 2] }));
        await assert.rejects(() => webdav.downloadBackup(base, '', '', 'arraydata.json'), /not a valid pan backup/);

        dav.files.set('/dav/nullbody.json', 'null');
        await assert.rejects(() => webdav.downloadBackup(base, '', '', 'nullbody.json'), /not a valid pan backup/);
        passed++;
        console.log('non-JSON / wrong type / missing data / array data / null rejected OK');

        // =================================================================
        section('Missing directory → MKCOL retry');
        // =================================================================
        dav.enforceDirs = true;
        const nested = fakeStore({ nested: true });
        await webdav.uploadBackup(nested, base, '', '', 'auto/a/b/pan.json');
        assert.ok(dav.files.has('/dav/auto/a/b/pan.json'), 'file written after MKCOL chain');
        assert.ok(dav.dirs.has('/dav/auto/a/b'), 'parent dirs created');
        dav.enforceDirs = false;
        passed++;
        console.log('PUT 409 → MKCOL parents → retry succeeds OK');

        // =================================================================
        section('Boundary data shapes');
        // =================================================================
        const weird = {
            '': 'empty key',
            emoji: '🎉🚀 中文 ✅',
            multiline: 'line1\nline2\r\nline3',
            quotes: 'he said "hi" <b>&amp;</b>',
            'with.dot': 1,
            'with@at': true,
            nested: { deep: { list: [1, { x: null }], big: 9007199254740991 } },
            huge: 'A'.repeat(2 * 1024 * 1024), // 2 MB value
            number_zero: 0,
            boolean_false: false,
            null_value: null,
        };
        const weirdStore = fakeStore(weird);
        await webdav.uploadBackup(weirdStore, base, '', '', 'weird.json');
        const weirdPayload = await webdav.downloadBackup(base, '', '', 'weird.json');
        const weirdTarget = fakeStore({});
        await webdav.applyBackup(weirdTarget, weirdPayload);
        assert.equal(weirdTarget.kv.get('huge').length, 2 * 1024 * 1024, '2MB value intact');
        assert.deepEqual(weirdTarget.kv.get('nested'), weird.nested);
        assert.equal(weirdTarget.kv.get('number_zero'), 0);
        assert.equal(weirdTarget.kv.get('boolean_false'), false);
        assert.equal(weirdTarget.kv.get('null_value'), null);
        assert.equal(weirdTarget.kv.get('emoji'), '🎉🚀 中文 ✅');
        passed++;
        console.log('empty key, unicode, control chars, deep nesting, 2MB value, falsy values OK');

        // =================================================================
        section('Restore semantics: full replace + rollback');
        // =================================================================
        dav.files.set('/dav/small.json', JSON.stringify({ type: 'config-backup', data: { only: 'this' } }));
        const dirty = fakeStore({ stale_key: 'delete-me', keep: 'nope' });
        const smallPayload = await webdav.downloadBackup(base, '', '', 'small.json');
        await webdav.applyBackup(dirty, smallPayload);
        assert.ok(!dirty.kv.has('stale_key'), 'keys absent from backup removed');
        assert.deepEqual([...dirty.kv.keys()], ['only']);
        passed++;
        console.log('full-replace removes keys not present in backup OK');

        const rollbackStore = fakeStore({ original: 'value' });
        rollbackStore.failNextSetOn('boom');
        await assert.rejects(
            () =>
                webdav.applyBackup(rollbackStore, {
                    type: 'config-backup',
                    data: { a: 1, boom: 2 },
                }),
            /simulated store failure/
        );
        assert.deepEqual(
            [...rollbackStore.kv.entries()],
            [['original', 'value']],
            'memory rolled back to pre-apply disk state on failure'
        );
        passed++;
        console.log('apply failure rolls back in-memory state and rethrows OK');

        // =================================================================
        section('Restore sanitising: unknown services cannot crash the UI');
        // =================================================================
        const stalePayload = {
            type: 'config-backup',
            data: {
                translate_service_list: ['openai@keep', 'deepl@old', 'bing@older'],
                recognize_service_list: ['system', 'baidu_ocr@removed'],
            },
        };
        const sanitized = webdav.sanitizeRestoredData(stalePayload.data);
        assert.deepEqual(sanitized.translate_service_list, ['openai@keep'], 'unknown translate services dropped');
        assert.deepEqual(sanitized.recognize_service_list, ['system'], 'unknown recognize services dropped');

        const corrupted = webdav.sanitizeRestoredData({
            translate_service_list: 'not-an-array',
            recognize_service_list: { oops: true },
        });
        assert.deepEqual(corrupted.translate_service_list, ['openai'], 'non-array list → default');
        assert.deepEqual(corrupted.recognize_service_list, ['system', 'tesseract'], 'non-array list → default');

        const untouched = webdav.sanitizeRestoredData({ unrelated: 1 });
        assert.deepEqual(untouched, { unrelated: 1 }, 'keys without service lists untouched');

        // applyBackup runs the sanitiser too
        dav.files.set('/dav/stale.json', JSON.stringify({ type: 'config-backup', data: stalePayload.data }));
        const staleTarget = fakeStore({});
        await webdav.applyBackup(staleTarget, await webdav.downloadBackup(base, '', '', 'stale.json'));
        assert.deepEqual(staleTarget.kv.get('translate_service_list'), ['openai@keep']);
        assert.deepEqual(staleTarget.kv.get('recognize_service_list'), ['system']);
        passed++;
        console.log('stale / corrupted service lists sanitised on restore OK');

        // =================================================================
        section('Basic auth with non-Latin1 credentials');
        // =================================================================
        dav.requireAuth = true;
        // user:pässword (non-ASCII) must produce a UTF-8 Basic header
        const expectedToken = `Basic ${Buffer.from('user:pässword', 'utf8').toString('base64')}`;
        dav.validAuths.add(expectedToken);
        dav.requests.length = 0;
        await webdav.testConnection(base, 'user', 'pässword');
        assert.equal(dav.requests[0].auth, expectedToken, 'Authorization uses UTF-8 encoding');
        dav.validAuths.delete(expectedToken);
        passed++;
        console.log('non-ASCII password → UTF-8 Basic auth OK');

        // =================================================================
        section('Timeout');
        // =================================================================
        dav.hangMs = 1500;
        const t0 = Date.now();
        await assert.rejects(
            () => webdav.testConnection(base, '', '', { timeoutMs: 200 }),
            (e) => Date.now() - t0 < 1200
        );
        dav.hangMs = 0;
        passed++;
        console.log('hung server aborted by request timeout OK');

        console.log(`\nALL WEBDAV TESTS PASSED (${passed} sections)`);
        await dav.close();
        process.exit(0);
    } catch (e) {
        console.error('\nTEST FAILED:', e);
        await dav.close().catch(() => {});
        process.exit(1);
    }
}

main();
