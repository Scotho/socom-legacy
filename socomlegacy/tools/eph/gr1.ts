/**
 * GR-1, the GRENADE-RETHROW capture (research 326 s7 "GR-1"; the kit's path s7.1). Product track (OT.R53): a validation
 * instrument, an adaptation, never in a build and never changing the game -- PINE reads only, the pad by the harness's
 * key injector.
 *
 *   EPH_RUN_DIR=<run dir> SOCOM_PC_ROOT=<desktop> node --import tsx tools/eph/gr1.ts --legs <json> --out <dir>
 *     [--trials 3] [--only base,primary] [--menu r2,up,up,cross  (key[:hold ms])] [--discover] [--count-offset 0x...]
 *     [--kit-words 0x824,0x828]
 *
 * Per leg and trial: the save state restored (r0004 slot 5 by default), the throwable taken up through R2's inventory
 * (`--menu`: the original's menu as `inventoryMenu.ts` reads it -- R2 opens on the slot in the hand, d-pad Up the next
 * slot, Cross takes it up), a shot of the hand, then the leg's timed pad events played against the guest clock while
 * every game frame is logged: the controller's +0x170 (bits 0x40, 0x80), +0x118 (the edge), +0x11c (the power, a float),
 * the play stack's top and its +0x2c (the type), the kit's +0x818, +0x81c and +0x820 (a float), and `--count-offset`'s
 * word when given, and each of `--kit-words`' kit words as a column `kit<offset>` (LAST-GRENADE: the selected slot
 * `+0x824` and the remembered slot `+0x828`, DEEP-LAST-GRENADE's pass, research 326 s7.2's missing columns); a row whose guest clock moved while it was read is flagged torn. `--discover` snapshots the kit
 * block before and after the leg and lists the words that fell by exactly 1 (the throwable's count, the live check of
 * the inferred field). The local body is r0004 `0x44d648` (eph-raise `tools/eph/raise.ts` RAISE_ADDRESSES), the
 * controller `*(body+0xc0)`, the kit `body+0x5e0` (s7.1).
 */
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

export type Gr1Action = 'down' | 'up' | 'tap';
export interface Gr1Event { readonly t: number; readonly action: Gr1Action; readonly key: string; readonly ms: number }
export interface Gr1Leg { readonly name: string; readonly seconds: number; readonly menu?: boolean; readonly events: readonly Gr1Event[] }

const KEYS = ['cross', 'circle', 'square', 'triangle', 'start', 'select', 'l1', 'r1', 'l2', 'r2', 'l3', 'r3', 'up', 'down', 'left', 'right'] as const;

export function parseLegs(text: string): Gr1Leg[] {
  const o = JSON.parse(text) as { legs?: { name: string; seconds: number; menu?: boolean; events: [number, string, string, number?][] }[] };
  if (!Array.isArray(o.legs)) throw new Error('legs: { legs: [...] } is required');
  return o.legs.map((l) => {
    if (!(l.seconds > 0 && l.seconds <= 95)) throw new Error(`leg ${l.name}: seconds in (0, 95] (a trial stays under ~100 s of guest clock)`);
    let last = -Infinity;
    const events = l.events.map(([t, action, key, ms]) => {
      if (action !== 'down' && action !== 'up' && action !== 'tap') throw new Error(`leg ${l.name}: action "${action}" (down, up or tap)`);
      if (!(KEYS as readonly string[]).includes(key)) throw new Error(`leg ${l.name}: key "${key}"`);
      if (t < last) throw new Error(`leg ${l.name}: events out of order at ${t}`);
      last = t;
      return { t, action: action as Gr1Action, key, ms: ms ?? 0 };
    });
    return { name: l.name, seconds: l.seconds, ...(l.menu === false ? { menu: false } : {}), events };
  });
}

/** The word offsets (from `base`) whose value fell by exactly 1 from `before` to `after`. */
export function countCandidates(before: readonly number[], after: readonly number[], base: number): number[] {
  if (before.length !== after.length) throw new Error('countCandidates: the snapshots differ in length');
  const out: number[] = [];
  for (let i = 0; i < before.length; i++) if (((before[i]! - after[i]!) | 0) === 1) out.push(base + i * 4);
  return out;
}

/** The kit block GR-1 snapshots (0x380 words) and the kit words the rows always carry. */
const KIT_WORDS = 0x380;
const KIT_FIXED_COLUMNS = [0x818, 0x81c, 0x820];

/** `--kit-words`: word-aligned offsets inside the kit block, each once, none of the fixed columns nor `--count-offset`'s. */
export function parseKitWords(text: string | undefined, countOffset: number | null = null): number[] {
  if (text === undefined || text.trim() === '') return [];
  const out: number[] = [];
  for (const part of text.split(',').map((p) => p.trim())) {
    if (part === '') throw new Error('--kit-words: an empty part (a stray comma)');
    const o = Number(part);
    if (!Number.isInteger(o)) throw new Error(`--kit-words: "${part}" is not a number`);
    if (o % 4 !== 0) throw new Error(`--kit-words: 0x${o.toString(16)} is not word-aligned`);
    if (o < 0 || o >= KIT_WORDS * 4) throw new Error(`--kit-words: 0x${o.toString(16)} is not inside the kit block (0..0x${(KIT_WORDS * 4).toString(16)})`);
    if (KIT_FIXED_COLUMNS.includes(o) || o === countOffset) throw new Error(`--kit-words: 0x${o.toString(16)} is already a column`);
    if (out.includes(o)) throw new Error(`--kit-words: 0x${o.toString(16)} given twice`);
    out.push(o);
  }
  return out;
}

/** The CSV column names of the extra kit words. */
export function kitWordColumns(words: readonly number[]): string[] {
  return words.map((o) => `kit${o.toString(16)}`);
}

/** The play stack's top: `*(base + idx*4)`, none for a negative index (FUN_00555170 D:L419945-419956). */
export function stackTopAddress(base: number, idx: number, read: (a: number) => number): number | null {
  return idx < 0 ? null : read(base + idx * 4);
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const BODY_R0004 = 0x0044d648;
const KIT = 0x5e0;

async function main(argv: string[]): Promise<void> {
  const arg = (k: string): string | undefined => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  const legsFile = arg('--legs'), out = arg('--out');
  if (!legsFile || !out) throw new Error('usage: gr1.ts --legs <json> --out <dir> [--trials 3] [--only a,b] [--menu r2,up,up,cross] [--discover] [--count-offset 0x...] [--kit-words 0x824,0x828]');
  const trials = Number(arg('--trials') ?? 3);
  const only = arg('--only')?.split(',');
  const menu = (arg('--menu') ?? 'r2,up,up,cross').split(',');
  const discover = argv.includes('--discover');
  const countOffset = arg('--count-offset') ? Number(arg('--count-offset')) : null;
  const kitWords = parseKitWords(arg('--kit-words'), countOffset);
  const state = Number(arg('--state') ?? 5);
  const legs = parseLegs(readFileSync(legsFile, 'utf8')).filter((l) => !only || only.includes(l.name));
  mkdirSync(out, { recursive: true });
  const LOG = join(out, 'gr1.log');
  const log = (s: string): void => { const l = `${new Date().toISOString()} ${s}`; console.log(l); appendFileSync(LOG, l + '\n'); };

  const { PCSX2_WINDOW, hostContext, hostDeps, parseRunArgs, planBoot, pcsx2Argv } = await import('./run');
  const { PCSX2_VK, PCSX2_WINDOW_TITLE } = await import('./keys');
  const { GUEST_ADDRESSES, f32 } = await import('./sampler');
  const C = GUEST_ADDRESSES.r0004;
  const vk = (k: string): number => (PCSX2_VK as unknown as Record<string, number>)[k]!;

  const deps = hostDeps();
  const plan = planBoot(parseRunArgs(['--boot-to-mission', '--build', 'r0004', '--state', String(state)]), hostContext());
  deps.prepareHost(plan);
  const child = deps.spawnPcsx2(pcsx2Argv(plan.layout.exe, plan.iso, state));
  const ctl = new AbortController();
  let done = false;
  const stop = (): void => { if (done) return; done = true; try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ } deps.closeWindows(); };
  process.on('SIGINT', () => { stop(); process.exit(130); });
  const summary: unknown[] = [];
  try {
    const hwnd = await deps.findWindow(PCSX2_WINDOW_TITLE, child.pid!, ctl.signal);
    await sleep(6000);
    await deps.placeWindow(hwnd, PCSX2_WINDOW, ctl.signal);
    await deps.topmostWindow(hwnd, ctl.signal);
    const inj = deps.injector(hwnd, (e: Error) => log(`injector failed: ${e.message}`));
    const raw = await deps.connectPine(ctl.signal) as unknown as { read32(a: number): Promise<number>; loadState(s: number): Promise<void>; close(): void };
    let q: Promise<unknown> = Promise.resolve();
    const one = <T>(f: () => Promise<T>): Promise<T> => { const r = q.then(f, f); q = r.catch(() => undefined); return r; };
    const rd = (a: number): Promise<number> => one(() => raw.read32(a));
    const clock = async (): Promise<number> => f32(await rd(C.guestClock));
    const waitClock = async (sec: number): Promise<void> => {
      const t0 = await clock(); let last = t0, lw = Date.now();
      for (;;) { const t = await clock(); if (t - t0 >= sec) return; if (t !== last) { last = t; lw = Date.now(); } else if (Date.now() - lw > 3000) throw new Error(`the guest clock stopped at ${t.toFixed(2)}`); await sleep(10); }
    };
    const shot = (name: string): void => { execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'gdigrab', '-offset_x', String(PCSX2_WINDOW.x), '-offset_y', String(PCSX2_WINDOW.y), '-video_size', `${PCSX2_WINDOW.width}x${PCSX2_WINDOW.height}`, '-i', 'desktop', '-frames:v', '1', join(out, name)], { stdio: 'ignore' }); };
    const tap = async (k: string, ms = 120): Promise<void> => { inj.down(vk(k)); await sleep(ms); inj.up(vk(k)); };
    const snapKit = async (kit: number, words: number): Promise<number[]> => { const v: number[] = []; for (let i = 0; i < words; i++) v.push((await rd(kit + i * 4)) | 0); return v; };

    for (const leg of legs) {
      for (let tr = 1; tr <= trials; tr++) {
        const tLoad = await clock();
        await one(() => raw.loadState(state));
        { const w = Date.now(); while (Date.now() - w < 15000) { if ((await clock()) < tLoad - 0.5) break; await sleep(20); } }
        await waitClock(1.0);
        const body = await rd(BODY_R0004), ctrl = await rd(body + 0xc0), actor = await rd(C.playerActor), kit = body + KIT;
        const backOk = (await rd(kit + 0x830)) === body;
        if (!backOk) throw new Error(`the kit's back pointer *(body+0x5e0+0x830) != body (body 0x${body.toString(16)}): s7.1's path does not hold here`);
        if (leg.menu !== false) { for (const m of menu) { const [k, ms] = m.split(':'); await tap(k!, Number(ms ?? 120)); await sleep(260); } await waitClock(1.2); }
        await deps.topmostWindow(hwnd, ctl.signal);
        shot(`${leg.name}-t${tr}-held.png`);
        const before = discover ? await snapKit(kit, KIT_WORDS) : null;
        const csv = join(out, `${leg.name}-t${tr}.csv`);
        writeFileSync(csv, (arg('--item') ? `# item: ${arg('--item')}
` : '') + 't,clock,torn,ctrl170,b40,b80,edge118,power11c,top,topType,kit818,kit81c,kit820' + (countOffset !== null ? ',count' : '') + kitWordColumns(kitWords).map((c) => `,${c}`).join('') + ',event\n');
        const t0 = await clock(); let lastClock = -1, ei = 0; const held = new Set<string>();
        for (;;) {
          const c0 = await clock();
          const t = c0 - t0;
          let ev = '';
          while (ei < leg.events.length && leg.events[ei]!.t <= t) {
            const e = leg.events[ei++]!;
            if (e.action === 'down') { inj.down(vk(e.key)); held.add(e.key); } else if (e.action === 'up') { inj.up(vk(e.key)); held.delete(e.key); } else void tap(e.key, e.ms || 120);
            ev += `${e.action}:${e.key};`;
          }
          if (t >= leg.seconds) break;
          if (c0 === lastClock && !ev) { await sleep(2); continue; }
          lastClock = c0;
          const f170 = await rd(ctrl + 0x170), e118 = await rd(ctrl + 0x118), p11c = f32(await rd(ctrl + 0x11c));
          const sBase = await rd(actor + 0x1c0), sIdx = (await rd(actor + 0x1c0 + 8)) | 0;
          const top = sIdx < 0 ? null : await rd(sBase + sIdx * 4);
          const topType = top ? await rd(top + 0x2c) : null;
          const k818 = (await rd(kit + 0x818)) | 0, k81c = (await rd(kit + 0x81c)) | 0, k820 = f32(await rd(kit + 0x820));
          const cnt = countOffset !== null ? (await rd(kit + countOffset)) | 0 : null;
          const extra: number[] = []; for (const o of kitWords) extra.push((await rd(kit + o)) | 0);
          const c1 = await clock();
          appendFileSync(csv, [t.toFixed(4), c0.toFixed(4), c1 !== c0 ? 1 : 0, '0x' + (f170 >>> 0).toString(16), (f170 & 0x40) ? 1 : 0, (f170 & 0x80) ? 1 : 0, e118 | 0, p11c.toFixed(4), top === null ? '' : '0x' + top.toString(16), topType === null ? '' : '0x' + (topType >>> 0).toString(16), k818, k81c, k820.toFixed(4), ...(cnt !== null ? [cnt] : []), ...extra, ev].join(',') + '\n');
        }
        for (const k of held) inj.up(vk(k));
        const after = discover ? await snapKit(kit, KIT_WORDS) : null;
        const cands = before && after ? countCandidates(before, after, 0).map((o) => '0x' + o.toString(16)) : null;
        const row = { leg: leg.name, trial: tr, body: '0x' + body.toString(16), ctrl: '0x' + ctrl.toString(16), actor: '0x' + actor.toString(16), kitBackPointer: backOk, csv, countCandidates: cands };
        summary.push(row);
        log(`${leg.name} t${tr}: body 0x${body.toString(16)} ctrl 0x${ctrl.toString(16)} actor 0x${actor.toString(16)} kit back pointer ok${cands ? `; kit words that fell by 1: ${cands.join(' ') || 'none'}` : ''}`);
      }
    }
    raw.close();
  } finally {
    writeFileSync(join(out, 'gr1.json'), JSON.stringify({ item: arg('--item') ?? null, legs: legs.map((l) => l.name), trials, menu, countOffset, kitWords: kitWords.map((o) => '0x' + o.toString(16)), summary }, null, 2));
    stop();
  }
}

if (process.argv[1] && /gr1\.ts$/.test(process.argv[1])) {
  main(process.argv.slice(2)).then(() => process.exit(0), (e) => { console.error(String(e)); process.exit(1); });
}
