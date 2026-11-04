import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { cpus, totalmem } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { LOBBY_STATE, UI_TICK_SECONDS, type LobbyService } from '@s2u/ui';
import { pinnedMatchSocket } from '../src/connectHost';
import type { PageUiTextures } from '../src/frontEndAssets';
import { FrontEndSession, type FrontEndDisc } from '../src/frontEnd';
import type { WebSocketLike } from '../src/net/client';
import type { ServerEvent } from '../src/net/protocol';
import { UiQuadRasterCache, type UiCanvasTarget } from '../src/uiCompositorView';

/**
 * CPS-1 (a), plan CPS hypothesis H1 (a measurement instrument; product track: nothing the game does changes). The front
 * end's cost a tick on the game lobby (`dlgGameLobby.rdr`), at scale 1, in Node: (1) the session's `advance` for one
 * UI tick -- the lobby's and the socket's frames, the dialog machine's frame, the draw list rebuilt -- and (2) its
 * `render` -- `rasterizeUiDrawList` and `presentUiFrame` onto a cheap fake canvas target -- once with an empty roster
 * (the seat welcomed, no `gameLobby` view yet) and once with a full one (16 seats, their clans and medals, the chat panel
 * filled past its `GAME_LOBBY_CHAT_LINES`). The seats reach the screen as the page's do: the game socket's server events
 * (`gameLobby`, `seatClans`, `seatTold`, `chat`) through `GameSocketHost` on a fake socket, after a fake account's login
 * (the `frontEndMatch.test.ts` rig). The bitmaps as the page's `mountFrontEnd` reads them: the disc through
 * `readFrontEndDisc` and `withMenuArt` (its default dialogs), the banks through `pageUiTextures` with each built dialog's
 * lazy banks read (`dialogBuilt` -> `need`), all in before the measured ticks. No server is contacted (R293). Names, clans
 * and lines are invented.
 *
 * It asserts SHAPE only (finite numbers, a non-empty draw list, the full roster drawing more than the empty one); no
 * millisecond threshold is asserted (CPS.R1 / PRF.R2: no invented number). It prints one `LOBBY_TICK_COST {...}` line
 * and writes the same JSON to `socomlegacy/logs/perf/lobby-tick-cost-<UTC>.json` (git-ignored). Disc-backed: skipped,
 * with the reason printed, without `SOCOM_DISC`.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const REDOTCOM = resolve(HERE, '../../..');
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : '';
const HAVE_DISC = DISC !== '' && existsSync(join(DISC, 'RUN/UI/READERC.ZAR'));
if (!HAVE_DISC) {
  console.info(`LOBBY_TICK_COST skipped: ${DISC === '' ? 'SOCOM_DISC is unset' : `no RUN/UI/READERC.ZAR under SOCOM_DISC (${DISC})`}`);
}

const WARM = 200, MEASURED = 300;
/** One UI tick of wall time, ms (29.97 Hz): each `advance` below runs exactly one tick. */
const TICK_MS = UI_TICK_SECONDS * 1000;
const PINNED = pinnedMatchSocket('', { protocol: 'https:', host: 'site.test', origin: 'https://site.test' }, false);
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
type Sock = WebSocketLike & { sent: string[] };

/** The held game, as a join holds it (16 players, classic on Frostfire): `frontEndMatch.test.ts`'s FBA-2 record. */
function heldGame() {
  const b = new Uint8Array(256); b[0] = 0x44; b[1] = 5; b[2] = 6; b[4] = 8; b[8] = 2;
  return { mediusWorldId: 7, gameName: 'g$~A', maxPlayers: 16, rulesSet: 1, gameStats: [...b].map((v) => v.toString(16).padStart(2, '0')).join('') };
}

/** A fake canvas target: one image buffer kept per size, so the copy is measured and no allocation is. */
function fakeTarget(): UiCanvasTarget {
  let img: { width: number; height: number; data: Uint8ClampedArray } | null = null;
  return {
    createImageData: (width, height) => {
      if (!img || img.width !== width || img.height !== height) img = { width, height, data: new Uint8ClampedArray(width * height * 4) };
      return img;
    },
    putImageData: () => {},
  };
}

interface Stats { p50: number; p95: number; max: number; mean: number; n: number }
function stats(xs: number[]): Stats {
  const a = [...xs].sort((p, q) => p - q);
  const at = (q: number): number => a[Math.min(a.length - 1, Math.max(0, Math.ceil(q * a.length) - 1))]!;
  const r = (v: number): number => Math.round(v * 1000) / 1000;
  return { p50: r(at(0.5)), p95: r(at(0.95)), max: r(a[a.length - 1]!), mean: r(a.reduce((s, v) => s + v, 0) / a.length), n: a.length };
}

const SIDES = ['seal', 'terrorist'] as const;
/** The full roster: 16 seats, 8 a side, the welcomed seat (id 2) among them; id 1 the host; every other seat READY. */
const FULL_SEATS = Array.from({ length: 16 }, (_, i) => ({
  id: i + 1, name: `Operator_${String(i + 1).padStart(2, '0')}x`, team: SIDES[i % 2]!, ready: i % 2 === 0, host: i === 0, readyIn: 0,
}));

interface Scenario {
  roster: 'empty' | 'full';
  dialog: string | null;
  advance: Stats; render: Stats;
  /** `advance` calls that ran a tick count other than one (excluded from the samples). */
  offTick: number;
  items: number; byKind: Record<string, number>; glyphQuads: number;
  /** What the last render could not draw: the count, and its distinct reasons (at most 8). */
  undrawn: number; undrawnReasons: string[];
  quadCache: { size: number; byteLength: number; maxBytes: number };
}

async function measure(disc: FrontEndDisc, banks: PageUiTextures, roster: 'empty' | 'full'): Promise<Scenario> {
  const account: LobbyService = {
    login: () => Promise.resolve({ status: 0, ticket: 'tkt' }), register: () => Promise.resolve({ status: 0 }),
    logout: () => Promise.resolve({ status: 0 }), keepAlive: () => Promise.resolve(true),
  };
  const socks: Sock[] = [];
  const needs: Promise<string[]>[] = [];
  const s = new FrontEndSession({
    disc, startDialog: 'dlgGameLobby.rdr', account, matchSocket: PINNED, textures: banks.textures,
    dialogBuilt: (d) => { needs.push(banks.need(d)); },        // the page's FE-SWEEP wiring (`mountFrontEnd`)
    gameSocket: () => {
      const sent: string[] = [];
      const k = { binaryType: '', readyState: 1, sent, send: (d: string) => { sent.push(d); }, close: () => {} } as unknown as Sock;
      socks.push(k);
      return k;
    },
  });
  try {
    s.gameLobby.commands.enterGameLobby(heldGame());
    let now = 0;
    s.advance(now);
    const tick = async (): Promise<number> => { const n = s.advance(now += TICK_MS); await flush(); return n; };
    s.lobby!.connect('localhost', 10075);
    for (let i = 0; i < 3; i++) await tick();
    s.lobby!.login('socomc', 'pw');
    for (let i = 0; i < 6; i++) await tick();
    expect(s.lobby!.state()).toBe(LOBBY_STATE.LOGGED_IN);
    const say = (ev: unknown): void => { socks.at(-1)!.onmessage?.({ data: JSON.stringify(ev as ServerEvent) }); };
    s.gameLobby.socket!.open(7);
    socks.at(-1)!.onopen?.({});
    say({ type: 'welcome', id: 2, version: 9, map: 'MP2', tick: 0, role: 'player', team: 'terrorist', queue: 0, name: 'Operator_02x', players: [], rules: 'classic', round: 0, rounds: 11, ghost: false });
    if (roster === 'full') {
      say({ type: 'gameLobby', seats: FULL_SEATS, countdown: null, launched: false });
      say({ type: 'seatClans', seats: FULL_SEATS.map((x) => ({ id: x.id, clan: `C${String(x.id).padStart(2, '0')}` })) });
      say({ type: 'seatTold', seats: FULL_SEATS.map((x) => ({ id: x.id, rating: 1500 + x.id, medal: 1 + (x.id % 5) })) });
      for (let i = 0; i < 24; i++) {                               // past the panel's 21 lines; each text at the relay's 63
        const from = FULL_SEATS[i % 16]!;
        say({ type: 'chat', sender: from.id, name: from.name, text: `line ${String(i).padStart(2, '0')} `.padEnd(63, 'abcdefghij'), ...(i % 3 === 0 ? { team: true } : {}) });
      }
    }

    const quadCache = new UiQuadRasterCache();                    // the default cache's own budget (32 MiB), held here to be read
    const target = fakeTarget();
    const adv: number[] = [], ren: number[] = [];
    let offTick = 0, undrawn: string[] = [];
    for (let i = 0; i < WARM + MEASURED; i++) {
      if (i === WARM) await Promise.all(needs);                  // every lazy bank in before the measured ticks
      const t0 = performance.now();
      const n = s.advance(now += TICK_MS);
      const t1 = performance.now();
      const r = s.render(target, undefined, { scale: 1, quadCache });
      const t2 = performance.now();
      undrawn = r.undrawn;
      if (i >= WARM) {
        if (n === 1) { adv.push(t1 - t0); ren.push(t2 - t1); } else offTick++;
      }
      await flush();
    }
    const byKind: Record<string, number> = {};
    let glyphQuads = 0;
    for (const it of s.last) {
      byKind[it.kind] = (byKind[it.kind] ?? 0) + 1;
      if (it.kind === 'glyphs') glyphQuads += it.quads.length;
    }
    return {
      roster, dialog: s.machine.shell()?.currentName ?? null,
      advance: stats(adv), render: stats(ren), offTick,
      items: s.last.length, byKind, glyphQuads, undrawn: undrawn.length, undrawnReasons: [...new Set(undrawn)].slice(0, 8),
      quadCache: { size: quadCache.size, byteLength: quadCache.byteLength, maxBytes: quadCache.maxBytes },
    };
  } finally {
    s.close();
  }
}

function gitHead(): string {
  try { return execSync('git rev-parse HEAD', { cwd: REDOTCOM, encoding: 'utf8' }).trim(); } catch { return 'unknown'; }
}

describe.skipIf(!HAVE_DISC)('CPS-1 (a): the front end\'s tick on the game lobby (dlgGameLobby.rdr), advance and render apart', () => {
  const results: Scenario[] = [];
  let rig: { disc: FrontEndDisc; banks: PageUiTextures; notRead: string[] } | null = null;

  afterAll(() => {
    if (results.length !== 2) return;
    const stamp = new Date().toISOString();
    const report = {
      task: 'CPS-1a', screen: 'dlgGameLobby.rdr', scale: 1, warmTicks: WARM, measuredTicks: MEASURED, tickMs: TICK_MS,
      machine: { cpu: cpus()[0]?.model ?? 'unknown', cores: cpus().length, totalMemBytes: totalmem(), node: process.version, platform: process.platform },
      head: gitHead(), utc: stamp, notRead: rig?.notRead ?? [], results,
    };
    const line = JSON.stringify(report);
    console.info(`LOBBY_TICK_COST ${line}`);
    const dir = join(REDOTCOM, 'logs', 'perf');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `lobby-tick-cost-${stamp.replace(/[:.]/g, '-')}.json`), `${line}\n`);
  });

  for (const roster of ['empty', 'full'] as const) {
    it(`${roster} roster: ${WARM} warm ticks, then ${MEASURED} measured, advance and render timed apart`, async () => {
      if (!rig) {
        const { FsAssetSource } = await import('@s2u/archive/node');
        const { readFrontEndDisc } = await import('../src/frontEnd');
        const { withMenuArt } = await import('../src/menuArt');
        const { pageUiTextures } = await import('../src/frontEndAssets');
        const source = new FsAssetSource(DISC);
        const disc = await withMenuArt(source, await readFrontEndDisc(source));   // as `mountFrontEnd` reads it
        const banks = pageUiTextures(source);
        rig = { disc, banks, notRead: [...disc.missing, ...(await banks.ready)] };
      }
      const r = await measure(rig.disc, rig.banks, roster);
      results.push(r);
      expect(r.dialog).toBe('dlgGameLobby.rdr');
      expect(r.advance.n + r.offTick).toBe(MEASURED);
      expect(r.advance.n).toBeGreaterThan(0);
      for (const v of [r.advance.p50, r.advance.p95, r.advance.max, r.render.p50, r.render.p95, r.render.max]) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
      }
      expect(r.items).toBeGreaterThan(0);
      // The page's bitmaps are in (run 1 of this instrument timed a raster that skipped every bitmap: `undrawn` 372 / 1770).
      expect(r.undrawnReasons.filter((x) => x.includes('no bitmap'))).toEqual([]);
      if (roster === 'full') {
        const empty = results.find((x) => x.roster === 'empty');
        expect(empty, 'the empty roster measured first').toBeDefined();
        expect(r.items).toBeGreaterThan(empty!.items);
      }
    }, 300_000);
  }
});
