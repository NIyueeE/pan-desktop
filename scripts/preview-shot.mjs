#!/usr/bin/env node
/**
 * Screenshot driver for the browser preview harness (dev-only).
 *
 * Boots `preview.html` through the vite dev server inside the locally cached
 * Playwright Chromium (headless, CDP-driven) and captures PNG screenshots of
 * arbitrary window states. The Tauri backend is mocked by src/preview/mock.ts.
 *
 * Usage:
 *   node scripts/preview-shot.mjs --out-dir /tmp/pan-shots --shot '{"name":"input-empty","query":"label=translate&lang=en"}'
 *
 * Each --shot accepts: name (required), query, width, height, wait (ms after
 * load), evals: string[] (JS run in the page, in order, before the capture).
 * The dev server and browser are started on demand and torn down on exit.
 */

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const PORT = 1420;
// vite binds `localhost` (this box resolves it to ::1); `/` 404s by design —
// any HTTP response proves the server is up.
const URL_BASE = 'http://localhost:1420';
const CHROME =
    process.env.PAN_PREVIEW_CHROME ??
    join(process.env.HOME ?? '', '.cache/ms-playwright/chromium-1234/chrome-linux64/chrome');
const REPO_ROOT = new URL('..', import.meta.url).pathname;

function parseArgs(argv) {
    const shots = [];
    let outDir = '/tmp/pan-shots';
    for (let i = 0; i < argv.length; i++) {
        const value = argv[i + 1] ?? '';
        switch (argv[i]) {
            case '--shot':
                shots.push(JSON.parse(value));
                i++;
                break;
            case '--out-dir':
                outDir = value;
                i++;
                break;
            default:
                throw new Error(`Unknown argument: ${argv[i]}`);
        }
    }
    if (shots.length === 0) {
        throw new Error('No --shot given');
    }
    return { shots, outDir };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function ensureDevServer() {
    try {
        await fetch(`${URL_BASE}/`);
        return null;
    } catch {
        // not running yet
    }
    const child = spawn(join(REPO_ROOT, 'node_modules/.bin/vite'), ['--port', String(PORT), '--strictPort'], {
        cwd: REPO_ROOT,
        stdio: ['ignore', 'ignore', 'inherit'],
    });
    for (let i = 0; i < 120; i++) {
        await sleep(500);
        try {
            await fetch(`${URL_BASE}/`);
            return child;
        } catch {
            // keep waiting
        }
    }
    child.kill('SIGTERM');
    throw new Error('vite dev server did not come up');
}

async function launchChrome() {
    const child = spawn(
        CHROME,
        [
            '--headless=new',
            '--no-sandbox',
            '--disable-gpu',
            '--disable-dev-shm-usage',
            '--hide-scrollbars',
            '--remote-debugging-port=0',
            `--user-data-dir=/tmp/pan-preview-profile-${Date.now()}`,
            'about:blank',
        ],
        { stdio: ['ignore', 'ignore', 'pipe'] }
    );
    const stderr = child.stderr;
    const endpoint = await new Promise((resolve, reject) => {
        let buffer = '';
        const onData = (chunk) => {
            buffer += chunk.toString();
            const match = /ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/[\w-]+/.exec(buffer);
            if (match) {
                stderr.off('data', onData);
                resolve(match[0]);
            }
        };
        stderr.on('data', onData);
        child.once('exit', () => reject(new Error(`chrome exited early:\n${buffer}`)));
        setTimeout(() => reject(new Error(`chrome devtools endpoint timeout:\n${buffer}`)), 30000);
    });
    return { child, endpoint };
}

class CdpSession {
    constructor(ws) {
        this.ws = ws;
        this.nextId = 1;
        this.pending = new Map();
        this.eventWaiters = [];
        ws.addEventListener('message', (event) => {
            const message = JSON.parse(String(event.data));
            if (message.id !== undefined && this.pending.has(message.id)) {
                const { resolve, reject } = this.pending.get(message.id);
                this.pending.delete(message.id);
                if (message.error) {
                    reject(new Error(`${message.error.message} (${message.error.data ?? ''})`));
                } else {
                    resolve(message.result);
                }
            } else if (message.method) {
                this.eventWaiters = this.eventWaiters.filter((waiter) => {
                    if (waiter.method === message.method && message.sessionId === waiter.sessionId) {
                        waiter.resolve(message.params);
                        return false;
                    }
                    return true;
                });
            }
        });
    }

    send(method, params = {}, sessionId) {
        const id = this.nextId++;
        const payload = { id, method, params };
        if (sessionId) {
            payload.sessionId = sessionId;
        }
        this.ws.send(JSON.stringify(payload));
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            setTimeout(() => {
                if (this.pending.has(id)) {
                    this.pending.delete(id);
                    reject(new Error(`CDP timeout: ${method}`));
                }
            }, 20000);
        });
    }

    waitForEvent(method, sessionId, timeoutMs = 20000) {
        return new Promise((resolve, reject) => {
            const waiter = { method, sessionId, resolve };
            this.eventWaiters.push(waiter);
            setTimeout(() => {
                const index = this.eventWaiters.indexOf(waiter);
                if (index >= 0) {
                    this.eventWaiters.splice(index, 1);
                    reject(new Error(`CDP event timeout: ${method}`));
                }
            }, timeoutMs);
        });
    }
}

async function connectPage(endpoint) {
    const res = await fetch(`${endpoint.replace('ws://', 'http://').split('/devtools/browser/')[0]}/json/new`, {
        method: 'PUT',
    });
    const target = await res.json();
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
        ws.addEventListener('open', resolve, { once: true });
        ws.addEventListener('error', () => reject(new Error('page ws error')), { once: true });
    });
    return new CdpSession(ws);
}

async function captureShot(cdp, shot, outDir) {
    const width = shot.width ?? 350;
    const height = shot.height ?? 420;
    const url = `${URL_BASE}/preview.html?${shot.query ?? ''}`;

    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: false,
    });
    const loaded = cdp.waitForEvent('Page.loadEventFired');
    await cdp.send('Page.navigate', { url });
    await loaded;
    await sleep(shot.wait ?? 1500);

    for (const snippet of shot.evals ?? []) {
        const result = await cdp.send('Runtime.evaluate', {
            expression: snippet,
            awaitPromise: true,
            returnByValue: true,
        });
        if (shot.print) {
            console.log(`[${shot.name}] eval =>`, JSON.stringify(result.result?.value ?? result.result));
        }
        await sleep(shot.evalWait ?? 400);
    }

    for (const [x, y] of shot.clicks ?? []) {
        for (const type of ['mousePressed', 'mouseReleased']) {
            await cdp.send('Input.dispatchMouseEvent', {
                type,
                x,
                y,
                button: 'left',
                buttons: type === 'mousePressed' ? 1 : 0,
                clickCount: 1,
            });
        }
        await sleep(shot.evalWait ?? 400);
    }

    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const out = join(outDir, `${shot.name}.png`);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, Buffer.from(data, 'base64'));
    console.log(`captured ${shot.name} -> ${out}`);
}

const { shots, outDir } = parseArgs(process.argv.slice(2));
const server = await ensureDevServer();
const chrome = await launchChrome();
try {
    for (const shot of shots) {
        const cdp = await connectPage(chrome.endpoint);
        try {
            await captureShot(cdp, shot, outDir);
        } finally {
            cdp.ws.close();
        }
    }
} finally {
    chrome.child.kill('SIGKILL');
    if (server) {
        server.kill('SIGTERM');
    }
}
