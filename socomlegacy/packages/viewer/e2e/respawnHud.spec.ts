import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type {} from '../src/hook';
import { decodeCommands, decodeSnapshot } from '../src/net/codec';
import { Button, Frame } from '../src/net/protocol';
import { holdPad, installPadStub, PAD_BUTTON } from './padStub';
import { workerPort } from './ports';
import { TEST_ROOM } from './urls';

/**
 * RSP-6 browser instrument (research 351): the real room, grenade death, rendered corpse clock and HUD, on Frostfire.
 * The parked release entry stays off. This isolated loopback server uses the existing test-only respawnRules option;
 * a native-WebSocket send fixture changes only the hello's requested rules. It does not fabricate damage, spawn,
 * clock or HUD events, and retains native ping/pong handling. A standard gamepad stub supplies input. This checks the
 * browser implementation, not original-runtime parity.
 */
const WEB = fileURLToPath(new URL('../../..', import.meta.url));
const DISC = process.env['SOCOM_DISC'] || process.env['S2U_TEST_FIXTURES'] || join(WEB, 'test-fixtures');
const HAVE = ['MP2.ZDB', 'ZWEAPON.ZAR'].every((p) => existsSync(join(DISC, 'RUN', p)));
const PORT = workerPort('RESPAWN_MP_PORT', process.env['RESPAWN_MP_PORT'], 8858);
let server: ChildProcess | null = null;
let fixtureOutput = '';
let saveDiagnostics: (() => Promise<void>) | null = null;

test.skip(!HAVE, 'needs the original MP2.ZDB and ZWEAPON.ZAR through SOCOM_DISC or the test fixtures');

test.beforeAll(async () => {
  if (!HAVE) return;
  const script = `
    import { FsAssetSource } from '@s2u/archive/node';
    import { MatchServer } from './packages/match/src/server.ts';
    const server = new MatchServer({
      source: new FsAssetSource(process.env.SOCOM_DISC), host: '127.0.0.1',
      port: Number(process.env.RESPAWN_MP_PORT), maps: ['MP2'], room: {},
      rules: 'respawn', respawnRules: true,
      log: (e) => { if (e.level !== 'info' || ['joined', 'left', 'parked', 'refused', 'dropped'].includes(e.msg)) console.log(JSON.stringify(e)); },
    });
    // The same service clock as central/main.ts; without it the frame budget never resets.
    const rateClock = setInterval(() => server.resetRates(), 1000);
    await server.start();
    console.log('RESPAWN_HUD_READY');
    process.on('SIGTERM', async () => { clearInterval(rateClock); await server.stop(); process.exit(0); });
  `;
  server = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], {
    cwd: WEB, env: { ...process.env, SOCOM_DISC: DISC, RESPAWN_MP_PORT: String(PORT) }, stdio: 'pipe',
  });
  await new Promise<void>((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`respawn HUD fixture did not start: ${output}`)), 30_000);
    server!.stdout!.on('data', (chunk) => {
      output += String(chunk);
      fixtureOutput = output;
      if (output.includes('RESPAWN_HUD_READY')) { clearTimeout(timer); resolve(); }
    });
    server!.stderr!.on('data', (chunk) => { output += String(chunk); fixtureOutput = output; });
    server!.once('error', (error) => { clearTimeout(timer); reject(error); });
    server!.once('exit', (code) => { clearTimeout(timer); reject(new Error(`respawn HUD fixture exited ${code}: ${output}`)); });
  });
});

test.afterAll(async () => {
  if (!server || server.exitCode !== null) return;
  const exited = new Promise<void>((resolve) => server!.once('exit', () => resolve()));
  server.kill('SIGTERM');
  await exited;
});

test.afterEach(async () => {
  await saveDiagnostics?.();
  saveDiagnostics = null;
});

test('respawn help follows the rendered corpse, persists past ordinary help, and waits for a fresh Action', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  let connections = 0;
  let spawns = 0;
  const actions: number[] = [];
  const began = Date.now(), wire: unknown[] = [];
  const traffic = new Map<string, { frames: number; seq: number; ack: number; tick: number }>();
  const record = (kind: string, value: unknown) => wire.push({ ms: Date.now() - began, kind, value });
  saveDiagnostics = async () => {
    const final = await page.evaluate(() => ({
      network: window.__viewer?.net?.()?.state ?? null,
      gate: window.__viewer?.weaponSelect?.().gate ?? null,
      spectator: window.__viewer?.hud?.().model.spectator ?? null,
      closes: (window as unknown as { __respawnHudCloses?: unknown[] }).__respawnHudCloses ?? [],
    })).catch((error: unknown) => ({ evaluationError: String(error) }));
    record('final-view', { ...final, connections, errors });
    record('command-traffic', [...traffic]);
    record('fixture-output', fixtureOutput);
    const path = test.info().outputPath('respawn-input-wire.json');
    writeFileSync(path, JSON.stringify(wire, null, 2));
    await test.info().attach('respawn-input-wire', { path, contentType: 'application/json' });
  };
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('websocket', (socket) => {
    if (socket.url() !== `ws://127.0.0.1:${PORT}/ws`) return;
    const connection = ++connections, seen = new Set<number>();
    let lastButtons = -1;
    record('connection', connection);
    socket.on('close', () => record('connection-closed', connection));
    socket.on('framesent', ({ payload }) => {
      if (typeof payload === 'string' || payload[0] !== Frame.Commands) return;
      const batch = decodeCommands(new Uint8Array(payload));
      const key = `${connection}:${Math.floor((Date.now() - began) / 1000)}`;
      const bin = traffic.get(key) ?? { frames: 0, seq: 0, ack: 0, tick: 0 };
      bin.frames++; bin.seq = batch.commands.at(-1)?.seq ?? 0;
      traffic.set(key, bin);
      for (const command of batch.commands) {
        if (seen.has(command.seq)) continue;
        seen.add(command.seq);
        const buttons = command.buttons & (Button.Action | Button.ActionHeld);
        if ((buttons & Button.Action) !== 0) actions.push(command.seq);
        if (buttons !== lastButtons || (buttons & Button.Action) !== 0) {
          record('action-command', { connection, seq: command.seq, buttons, viewTick: batch.viewTick });
          lastButtons = buttons;
        }
      }
    });
    socket.on('framereceived', ({ payload }) => {
      if (typeof payload !== 'string') {
        if (payload[0] === Frame.Snapshot) {
          const snapshot = decodeSnapshot(new Uint8Array(payload));
          const key = `${connection}:${Math.floor((Date.now() - began) / 1000)}`;
          const bin = traffic.get(key) ?? { frames: 0, seq: 0, ack: 0, tick: 0 };
          bin.ack = snapshot.own?.ack ?? 0; bin.tick = snapshot.tick;
          traffic.set(key, bin);
        }
        return;
      }
      const event = JSON.parse(payload);
      if (event.type === 'spawn') spawns++;
      if (['welcome', 'kill', 'spawn', 'respawn', 'roundStart', 'error'].includes(event.type)) {
        record('event', { connection, type: event.type, id: event.id, victim: event.victim, tick: event.tick, rules: event.rules, phase: event.phase });
      }
    });
  });
  await page.setViewportSize({ width: 960, height: 672 });
  await installPadStub(page);
  await page.addInitScript(() => {
    localStorage.setItem('s2u.mp.name', 'RESPAWN HUD QA');
    localStorage.setItem('s2u.viewer.panelOpen', '0');
    const nativeSend = WebSocket.prototype.send;
    const closes: { code: number; reason: string; clean: boolean }[] = [];
    Object.defineProperty(window, '__respawnHudCloses', { value: closes });
    WebSocket.prototype.send = function (message) {
      if (typeof message === 'string') {
        const event = JSON.parse(message);
        if (event.type === 'hello') {
          this.addEventListener('close', (e) => closes.push({ code: e.code, reason: e.reason, clean: e.wasClean }));
          message = JSON.stringify({ ...event, rules: 'respawn' });
        }
      }
      nativeSend.call(this, message);
    };
  });
  await page.goto(`${TEST_ROOM}?mode=play&mp&server=ws://127.0.0.1:${PORT}/ws&map=MP2&devmode&noarmory`);
  await expect.poll(() => page.evaluate(() => window.__viewer?.net?.()?.state ?? null)).toBe('open');
  // Observe the transient banner when welcome starts it; loading may outlast its ordinary lifetime.
  await expect.poll(() => page.evaluate(() => window.__viewer.hud().model.banner.flatMap((b) => b.lines.map((l) => l.text))))
    .toContain('STARTING ROUND 1 OF 1');
  await expect.poll(() => page.evaluate(() => window.__viewer.loading().blocked), { timeout: 120_000 }).toBe(false);
  await page.getByRole('button', { name: 'Hide figures' }).click();

  const read = () => page.evaluate(() => {
    const h = window.__viewer.hud(), view = h.model.spectator, gate = window.__viewer.weaponSelect().gate;
    return {
      alive: gate.inMatch && gate.alive, inMatch: gate.inMatch, network: window.__viewer.net?.()?.state ?? null,
      help: view?.help ?? null, ready: view?.respawnReady ?? false,
      drawn: h.rects.help !== undefined, ordinaryAlpha: h.timing.help ?? 1,
      bodyVisible: window.__viewer.stats().body?.visible ?? null,
      closes: (window as unknown as { __respawnHudCloses: unknown[] }).__respawnHudCloses,
    };
  });
  await expect.poll(async () => (await read()).alive).toBe(true);
  expect(connections, 'one native connection reaches the loaded match').toBe(1);
  // Existing grenade test instrument: the weakest release lob, at the player's feet; no synthetic kill event.
  for (let i = 0; i < 6 && (await read()).alive; i++) {
    await page.evaluate(() => window.__viewer.throwGrenade(4 / 60, true));
    await expect.poll(async () => (await read()).help?.[0] ?? '', { timeout: 8_000 })
      .toContain('You have died.').catch(() => undefined);
  }
  expect((await read()).network).toBe('open');
  await expect.poll(async () => (await read()).help?.[0] ?? '').toContain('You have died.');
  const dead = await read();
  record('dead-view', dead);
  expect(dead.ready).toBe(false);
  expect(dead.help?.[0]).toContain('\u00be'); // original R2 glyph, fonts.rdr (research 351)
  expect(dead.help?.slice(1)).toEqual([' ', ' ', ' ', ' ', ' ']);
  await page.screenshot({ path: test.info().outputPath('respawn-death-help.png') });

  // Press too early, then hold: it must not queue a respawn at the eligibility boundary.
  record('before-held-cross', await read());
  await holdPad(page, { buttons: [PAD_BUTTON.CROSS] });
  let waitError: unknown;
  await expect.poll(async () => {
    const s = await read();
    return s.network !== 'open' || !s.inMatch || connections !== 1 || s.ready || s.alive;
  }, { timeout: 30_000 }).toBe(true)
    .catch((error) => { waitError = error; });
  const boundary = await read();
  record('boundary-view', { ...boundary, connections });
  if (waitError) throw waitError;
  expect({ ...boundary, connections }).toMatchObject({ ready: true, alive: false, bodyVisible: false, network: 'open', inMatch: true, connections: 1 });
  await expect.poll(async () => (await read()).ordinaryAlpha).toBe(0);
  const ready = await read();
  expect(ready.alive).toBe(false);
  expect(ready.bodyVisible).toBe(false);
  expect(ready.drawn, 'eligible line remains drawn after the ordinary help has faded').toBe(true);
  expect(ready.help?.[1]).toBe('Press the \u00a6 button to respawn.'); // original Cross glyph
  expect(actions, 'the early press and held frames send no respawn Action').toEqual([]);
  expect(spawns, 'only the initial life has spawned').toBe(1);
  await page.screenshot({ path: test.info().outputPath('respawn-ready-help.png') });

  await holdPad(page);
  await expect.poll(async () => (await read()).alive).toBe(false);
  expect(actions, 'releasing the early press sends no dead Action').toEqual([]);
  await holdPad(page, { buttons: [PAD_BUTTON.CROSS] });
  await expect.poll(async () => (await read()).alive).toBe(true);
  expect(actions, 'one fresh down edge sends one respawn Action before release').toHaveLength(1);
  expect(spawns, 'the same connection receives its new life').toBe(2);
  await expect.poll(async () => (await read()).help).toBeNull();
  await holdPad(page);
  expect(connections, 'native transport stays connected through the death and respawn').toBe(1);
  expect(errors).toEqual([]);
});
