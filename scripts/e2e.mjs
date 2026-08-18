#!/usr/bin/env node
/**
 * dsh-vibeos e2e: boot a THROWAWAY dsh profile with `aiStub` on a free random
 * port and assert the plugin's whole boot path — the web app serves, the client
 * bundle is served, and the WebSocket gateway completes the boot handshake.
 *
 *   node scripts/e2e.mjs [profile]        # profile defaults to "vibeostest"
 *
 * The profile must already exist with dsh-vibeos installed:
 *
 *   dsh plugin --profile vibeostest add file:$PWD
 *
 * A temp $DSH_HOME copy is deliberately NOT attempted: a profile's node_modules
 * is a pnpm store rooted at $DSH_HOME/profiles, so copying it elsewhere breaks
 * resolution. Use a disposable profile — this script boots it for real and it
 * writes to its storage domains. Other dsh instances are never touched: the
 * port is a free one picked at runtime and only the spawned child is killed.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';

const PROFILE = process.argv[2] ?? 'vibeostest';
const BOOT_TIMEOUT_MS = 120_000;
const WS_TIMEOUT_MS = 20_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (msg) => console.log(`ok   ${msg}`);

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function waitForHttp(base) {
  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(base, { signal: AbortSignal.timeout(3000) });
      if (res.ok) return;
    } catch {
      // not listening yet
    }
    await sleep(500);
  }
  throw new Error(`web app did not serve ${base} within ${BOOT_TIMEOUT_MS}ms`);
}

function bootHandshake(base) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${base.replace('http', 'ws')}/vibeos/ws`);
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error(`no s2c.boot.state within ${WS_TIMEOUT_MS}ms`));
    }, WS_TIMEOUT_MS);
    const done = (err, value) => {
      clearTimeout(timer);
      ws.close();
      err ? reject(err) : resolve(value);
    };
    ws.on('error', (err) => done(err));
    ws.on('open', () => {
      ok('WS /vibeos/ws upgraded');
      ws.send(JSON.stringify({ v: 1, id: 'e2e', ts: Date.now(), type: 'c2s.boot.hello', payload: {} }));
    });
    ws.on('message', (raw) => {
      let env;
      try {
        env = JSON.parse(String(raw));
      } catch {
        return done(new Error(`non-JSON frame: ${String(raw).slice(0, 80)}`));
      }
      if (env.type !== 's2c.boot.state') return;
      if (env.v !== 1 || env.payload?.phase !== 'ready') {
        return done(new Error(`bad boot.state envelope: ${JSON.stringify(env).slice(0, 200)}`));
      }
      done(null, env.payload);
    });
  });
}

const dir = await mkdtemp(join(tmpdir(), 'vibeos-e2e-'));
const patch = join(dir, 'aistub.patch.yml');
await writeFile(patch, '- id: vibeos\n  config:\n    aiStub: true\n    agents:\n      enabled: false\n');
const port = await freePort();
const base = `http://127.0.0.1:${port}`;
const child = spawn(
  process.env.DSH_BIN ?? 'dsh',
  ['--profile', PROFILE, '--patch', patch, '--host', '127.0.0.1', '--port', String(port)],
  { stdio: ['ignore', 'pipe', 'pipe'] },
);
let log = '';
child.stdout.on('data', (d) => (log += d));
child.stderr.on('data', (d) => (log += d));
child.on('exit', (code) => (log += `\n[dsh exited early with code ${code}]`));

try {
  console.log(`--   profile=${PROFILE} port=${port} pid=${child.pid}`);
  await waitForHttp(base);
  ok(`web serves ${base}`);

  const bundle = await fetch(`${base}/plugins/dsh-vibeos/client.js`);
  const body = await bundle.text();
  if (!bundle.ok) throw new Error(`client.js: HTTP ${bundle.status}`);
  if (!body.includes('__ModuleLoader__')) throw new Error('client.js is not a module-loader bundle');
  ok(`/plugins/dsh-vibeos/client.js 200 (${body.length} bytes)`);

  const state = await bootHandshake(base);
  ok(`c2s.boot.hello -> s2c.boot.state (boot #${state.bootCount}, ${state.apps.length} apps, ${state.skins.length} skins)`);
  console.log('PASS');
} catch (err) {
  console.error(`FAIL ${err.message}`);
  console.error(log.split('\n').slice(-40).join('\n'));
  process.exitCode = 1;
} finally {
  if (child.exitCode === null) {
    child.kill('SIGTERM');
    for (let i = 0; i < 50 && child.exitCode === null; i++) await sleep(100);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
  await rm(dir, { recursive: true, force: true });
}
