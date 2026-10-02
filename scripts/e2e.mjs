#!/usr/bin/env node
/** Boot the built plugin in an isolated DSH_HOME, with AI stubbed and agents
 * disabled. Uses the installed DSH runtime without copying its dependency
 * store. The child, profile, sessions and storage are all removed on exit.
 *
 *   pnpm build && pnpm test:e2e
 *   DSH_BIN=/path/to/dsh DSH_RUNTIME_MODULES=/path/to/node_modules pnpm test:e2e
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { cp, mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { WebSocket } from 'ws';

const PROFILE = 'web';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const command = process.env.DSH_BIN ?? 'dsh';
const binary = command.includes('/') || command.includes('\\')
  ? resolve(command)
  : process.env.PATH.split(delimiter).map(dir => join(dir, command)).find(existsSync);
if (!binary) throw new Error('dsh is not installed; set DSH_BIN');
const require = createRequire(await realpath(binary));
const modules = process.env.DSH_RUNTIME_MODULES
  ?? dirname(dirname(dirname(require.resolve('@deepseek-ai/dsh-base/package.json'))));
const runtimeVersion = JSON.parse(readFileSync(join(modules, '@deepseek-ai/dsh/package.json'), 'utf8')).version;
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
      if (spawnError) throw spawnError;
      if (child.exitCode !== null || child.signalCode !== null) throw new Error('dsh exited before serving');
      const launchUrl = log.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+/)?.[0];
      if (!launchUrl) {
        const res = await fetch(base, { signal: AbortSignal.timeout(3000) });
        if (res.ok) return { cookie: '', html: await res.text() };
        await sleep(100);
        continue;
      }
      const auth = await fetch(launchUrl, { redirect: 'manual', signal: AbortSignal.timeout(3000) });
      const cookie = auth.headers.get('set-cookie')?.split(';')[0];
      if (!cookie) throw new Error('DSH did not issue its browser cookie');
      const res = await fetch(base, { headers: { cookie }, signal: AbortSignal.timeout(3000) });
      if (res.ok) return { cookie, html: await res.text() };
    } catch (error) {
      if (spawnError || child.exitCode !== null || child.signalCode !== null) throw error;
    }
    await sleep(500);
  }
  throw new Error(`web app did not serve ${base} within ${BOOT_TIMEOUT_MS}ms`);
}

function bootHandshake(base, cookie) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${base.replace('http', 'ws')}/vibeos/ws`, { headers: { cookie, origin: base } });
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
let child;
let spawnError;
let log = '';
try {
  const profile = join(dir, 'profiles', PROFILE);
  const plugin = join(profile, 'node_modules', 'dsh-vibeos');
  await mkdir(plugin, { recursive: true });
  await symlink(modules, join(dir, 'profiles', 'node_modules'), 'junction');
  for (const path of ['lib', 'package.json', 'cordis.patch.yml']) {
    await cp(join(ROOT, path), join(plugin, path), { recursive: true });
  }
  await writeFile(join(profile, 'package.json'), JSON.stringify({
    name: 'vibeos-e2e-profile', private: true,
    dependencies: { 'dsh-vibeos': `file:${ROOT}` },
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'dsh-vibeos'] } },
  }));
  await writeFile(join(profile, 'cordis.patch.yml'),
    '- id: vibeos\n  config:\n    aiStub: true\n    agents: { enabled: false }\n');
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  child = spawn(binary,
    ['--profile', PROFILE, '--host', '127.0.0.1', '--port', String(port),
      ...(runtimeVersion.startsWith('0.1.') ? [] : ['--no-open'])],
    { cwd: dir, env: { ...process.env, DSH_HOME: dir, DSH_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  child.on('error', (error) => { spawnError = error; log += `\n${error.message}`; });
  child.on('exit', (code) => (log += `\n[dsh exited early with code ${code}]`));

  console.log(`--   profile=${PROFILE} port=${port} pid=${child.pid}`);
  const { cookie, html } = await waitForHttp(base);
  ok(`web serves ${base}`);

  const encodedGraph = html.match(/(?:globalThis\["__DSH_BOOT__"\]|window\.__DSH_BOOT__)\s*=\s*(\{.*?\})<\/script>/s)?.[1];
  if (!encodedGraph) throw new Error('HTML has no DSH boot manifest');
  const entry = JSON.parse(encodedGraph).entries.find(entry => entry.id === 'dsh-vibeos');
  if (!entry) throw new Error('VibeOS is missing from the DSH client graph');
  const bundle = await fetch(new URL(entry.url, `${base}/`), { headers: { cookie } });
  const body = await bundle.text();
  if (!bundle.ok) throw new Error(`client.js: HTTP ${bundle.status}`);
  if (!body.includes('__ModuleLoader__')) throw new Error('client.js is not a module-loader bundle');
  ok(`manifest client bundle 200 (${body.length} bytes)`);

  const state = await bootHandshake(base, cookie);
  ok(`c2s.boot.hello -> s2c.boot.state (boot #${state.bootCount}, ${state.apps.length} apps, ${state.skins.length} skins)`);
  console.log('PASS');
} catch (err) {
  console.error(`FAIL ${err.message}`);
  console.error(log.replace(/token=[^\s]+/g, 'token=[redacted]').split('\n').slice(-40).join('\n'));
  process.exitCode = 1;
} finally {
  if (child?.pid && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGTERM');
    for (let i = 0; i < 50 && child.exitCode === null && child.signalCode === null; i++) await sleep(100);
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
      await new Promise(resolve => child.once('exit', resolve));
    }
  }
  await rm(dir, { recursive: true, force: true });
}
