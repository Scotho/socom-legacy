/**
 * The enemy-raise O-runs' placement (agent-mail/evidence/enemy-raise/CAPTURE-JOB.md "Tonight's subset", O1-O5; SCOPE.md
 * s2.1). Product track (OT.R53): a validation instrument, an adaptation, never in a build and never changing the game.
 *
 * What it does, from `socomlegacy/`:
 *   EPH_RUN_DIR=<run dir> SOCOM_PC_ROOT=<desktop> node --import tsx tools/eph/place.ts --placement <json> --out <dir>
 * boots the run dir's PCSX2 (r0004 per the file) from the file's `fromState`, reads the player's start, computes the
 * spot `factor x reach` from the file's still enemy post on the post -> start line (the first factor first), walks
 * there with the stick (a closed loop re-aiming every 150 ms; never a teleport), turns to face the post, holds still and
 * reads the identified-enemy count (ctrl+0xc0, ./raise; -1 while the gate byte is 0) for one second of guest clock: all
 * 0, it saves the state to `saveSlot` and stops; else it tries the next factor. Health is read before and after and
 * never written; a change voids the placement. Writes <out>/place.log and <out>/place.json (the spot, yaw, counts,
 * health). `--scout "dx,dz;..." [--hold <s>]` instead walks to each offset from the start and holds there reading the
 * count (cover found by the count; main's scout block).
 *
 * `--teleport` is refused (the batch review of fb1a34b4c, F1): the rig's position write is seven copies -- actor+0x1c/
 * 0x20/0x24, the model block's m+0x30/0x34/0x38 and the fall-height copy actor+0x2e4 -- and a destination needs its
 * ground height; until both are carried, a half write risks a fall or a snap back, so the placement walks.
 *
 * Adapted from the 2026-11-01 capture rig's M51 walker (scratch, seat ac, `walk-mp51-barricade.ts` as staged for this
 * job: its boot through ./run's planBoot/hostDeps, the yaw calibration from slot 5's facing and one right-stick tap, the
 * `goto` and `turnTo` loops; its `tp` is not carried, above). The owner's ruling of 2026-11-02 holds, and no guest
 * memory is written here at all: health never, no code patched, the walker's death-test word not touched.
 */
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import type { RaiseColumn } from './raise';
import type { InjectorLike } from './run';

export interface XZ { readonly x: number; readonly z: number }
export interface Placement {
  readonly map: string;
  readonly build: 'r0001' | 'r0004';
  readonly fromState: number;
  readonly saveSlot: number;
  readonly target: { readonly id: string; readonly x: number; readonly y: number; readonly z: number };
  readonly reach: number;
  readonly factors: readonly number[];
}

/** The spot `factor x reach` from `target` along the line target -> start (beyond the start when it lies inside). */
export function placeOnLine(target: XZ, start: XZ, reach: number, factor: number): XZ {
  const dx = start.x - target.x, dz = start.z - target.z, d = Math.hypot(dx, dz);
  if (!(d > 1e-6)) throw new Error('placeOnLine: the start is on the target, no line');
  const r = reach * factor;
  return { x: target.x + (dx / d) * r, z: target.z + (dz / d) * r };
}

/** The EPH yaw (degrees, 0..360) that faces `to` from `from`: atan2(-dx, -dz), the rig walker's `goto` bearing. */
export function bearingYaw(from: XZ, to: XZ): number {
  const dx = to.x - from.x, dz = to.z - from.z;
  const deg = (Math.atan2(-dx, -dz) * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}

/** `--scout "dx,dz;dx,dz"`: the candidate offsets from the start, each a pair of finite numbers. */
export function parseScout(spec: string): { dx: number; dz: number }[] {
  return spec.split(';').map((part) => {
    const [a, b, extra] = part.split(',').map((v) => v.trim());
    const dx = Number(a), dz = Number(b);
    if (extra !== undefined || a === undefined || b === undefined || a === '' || b === '' || !Number.isFinite(dx) || !Number.isFinite(dz)) throw new Error(`--scout: "${part}" is not dx,dz`);
    return { dx, dz };
  });
}

/** A second out of reach: at least one eligible row, and every one reads the identified-enemy count 0. */
export const outOfReach = (counts: readonly number[]): boolean => counts.length > 0 && counts.every((c) => c === 0);

/** The usage line (main's switches). */
export const PLACE_USAGE = 'usage: place.ts --placement <json> --out <dir> [--scout "dx,dz;dx,dz..." [--hold <s>]]';

export interface PlaceArgs {
  readonly file: string;
  readonly out: string;
  /** `--scout`'s offsets as given (checked by parseScout), or null for the factor placement. */
  readonly scout: string | null;
  /** `--hold`: seconds of guest clock each scout candidate holds, in (0, 80] (default 7). */
  readonly holdS: number;
}

/** main's switches; `--teleport` is refused before anything else (the batch review F1: the header). */
export function parsePlaceArgs(argv: readonly string[]): PlaceArgs {
  if (argv.includes('--teleport')) throw new Error("--teleport: not supported: the rig's seven-copy write and a destination ground height are owed; walk instead");
  const arg = (k: string): string | undefined => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  const file = arg('--placement'), out = arg('--out');
  if (!file || !out) throw new Error(PLACE_USAGE);
  const scout = arg('--scout') ?? null;
  if (scout !== null) parseScout(scout);
  const holdS = Number(arg('--hold') ?? 7);
  if (!(holdS > 0 && holdS <= 80)) throw new Error('--hold: seconds in (0, 80] (a trial stays under ~100 s of guest clock)');
  return { file, out, scout, holdS };
}

/** What identifiedCount reads: a word and a byte of guest memory. */
export interface CountReads {
  read32(a: number): Promise<number>;
  read8(a: number): Promise<number>;
}

/**
 * The identified-enemy count ctrl+0xc0 (./raise RAISE_ADDRESSES), or -1 when it is not a live count: the gate byte reads
 * 0 (FUN_005970b0 then skips FUN_005c9b30, D:L454091-454093, so the count is stale -- a pause, a results screen;
 * analyzeRaise's eligibility, the batch review F2), or the body or controller pointer is 0. -1 never passes outOfReach.
 */
export async function identifiedCount(g: CountReads, R: Pick<RaiseColumn, 'localBody' | 'gate' | 'bodyCtrl' | 'ctrlCount'>): Promise<number> {
  if (((await g.read8(R.gate)) & 0xff) === 0) return -1;
  const b = await g.read32(R.localBody);
  if (!b) return -1;
  const c = await g.read32(b + R.bodyCtrl);
  if (!c) return -1;
  return (await g.read32(c + R.ctrlCount)) | 0;
}

/** The PINE calls main uses (./pine PineClient fits). */
interface PlacePine {
  read32(a: number): Promise<number>;
  read8(a: number): Promise<number>;
  saveState(s: number): Promise<void>;
  loadState(s: number): Promise<void>;
  close(): void;
}

export function parsePlacement(text: string): Placement {
  const o = JSON.parse(text) as Partial<Placement>;
  if (!o.target || typeof o.target.x !== 'number' || typeof o.target.z !== 'number') throw new Error('placement: target {id,x,y,z} is required');
  if (typeof o.reach !== 'number' || !(o.reach > 0)) throw new Error('placement: reach is required');
  if (!Array.isArray(o.factors) || !o.factors.length) throw new Error('placement: factors is required');
  if (o.build !== 'r0001' && o.build !== 'r0004') throw new Error('placement: build r0001 or r0004 is required');
  if (typeof o.fromState !== 'number' || typeof o.saveSlot !== 'number') throw new Error('placement: fromState and saveSlot are required');
  return o as Placement;
}

const wrap = (a: number): number => ((a + 540) % 360) - 180;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function main(argv: string[]): Promise<void> {
  const { file, out, scout: scoutArg, holdS } = parsePlaceArgs(argv);
  const P = parsePlacement(readFileSync(file, 'utf8'));
  mkdirSync(out, { recursive: true });
  const LOG = join(out, 'place.log');
  const log = (s: string): void => { const l = `${new Date().toISOString()} ${s}`; console.log(l); appendFileSync(LOG, l + '\n'); };

  const { PCSX2_WINDOW, hostContext, hostDeps, parseRunArgs, planBoot, pcsx2Argv } = await import('./run');
  const { PCSX2_VK, PCSX2_WINDOW_TITLE } = await import('./keys');
  const { GUEST_ADDRESSES, f32 } = await import('./sampler');
  const { RAISE_ADDRESSES } = await import('./raise');
  const C = GUEST_ADDRESSES[P.build];
  const R = RAISE_ADDRESSES[P.build];

  const deps = hostDeps();
  const plan = planBoot(parseRunArgs(['--boot-to-mission', '--build', P.build, '--state', String(P.fromState)]), hostContext());
  deps.prepareHost(plan);
  const child = deps.spawnPcsx2(pcsx2Argv(plan.layout.exe, plan.iso, P.fromState));
  const ctl = new AbortController();
  let done = false;
  const stop = (): void => { if (done) return; done = true; try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ } deps.closeWindows(); };
  process.on('SIGINT', () => { stop(); process.exit(130); });
  const result: Record<string, unknown> = { placement: P };
  let injector: InjectorLike | null = null;
  let raw: PlacePine | null = null;
  try {
    const hwnd = await deps.findWindow(PCSX2_WINDOW_TITLE, child.pid!, ctl.signal);
    await sleep(6000);
    await deps.placeWindow(hwnd, PCSX2_WINDOW, ctl.signal);
    await deps.topmostWindow(hwnd, ctl.signal);
    const inj = deps.injector(hwnd, (e: Error) => log(`injector failed: ${e.message}`));
    injector = inj;
    const pr = await deps.connectPine(ctl.signal) as unknown as PlacePine;
    raw = pr;
    let q: Promise<unknown> = Promise.resolve();
    const one = <T>(f: () => Promise<T>): Promise<T> => { const r = q.then(f, f); q = r.catch(() => undefined); return r; };
    const pine = { read32: (a: number) => one(() => pr.read32(a)), read8: (a: number) => one(() => pr.read8(a)), saveState: (s: number) => one(() => pr.saveState(s)), loadState: (s: number) => one(() => pr.loadState(s)) };
    const actor = (): Promise<number> => pine.read32(C.playerActor);
    const clock = async (): Promise<number> => f32(await pine.read32(C.guestClock));
    // Wait `sec` of guest clock; the clock standing still for 3 s of wall time (a results screen, a pause, the mission
    // ended -- the first live run walked out of M51's area and sat on MISSION FAILURE) ends the run instead of hanging.
    const waitClock = async (sec: number): Promise<void> => {
      const t0 = await clock(); let last = t0, lastWall = Date.now();
      for (;;) { const t = await clock(); if (t - t0 >= sec) return; if (t !== last) { last = t; lastWall = Date.now(); } else if (Date.now() - lastWall > 3000) throw new Error(`the guest clock stopped at ${t.toFixed(2)} (a results screen or a pause): the run ends`); await sleep(15); }
    };
    const pos = async (): Promise<{ x: number; y: number; z: number; q: number }> => {
      const a = await actor(); const f = async (o: number): Promise<number> => f32(await pine.read32(a + o));
      const qy = await f(0x50 + 4), qw = await f(0x50 + 12);
      return { x: await f(0x1c), y: await f(0x20), z: await f(0x24), q: (2 * Math.atan2(qy, qw) * 180) / Math.PI };
    };
    const count = (): Promise<number> => identifiedCount(pine, R);
    const health = async (): Promise<number[]> => { const a = await actor(); const h: number[] = []; for (let i = 0; i < 6; i++) h.push(await pine.read32(a + 0xffc + 4 * i)); return h; };

    await sleep(2500);
    const p0 = await pos();
    inj.down(PCSX2_VK.rleft); await sleep(350); inj.up(PCSX2_VK.rleft); await sleep(400);
    const p1 = await pos();
    const sign = wrap(p1.q - p0.q) >= 0 ? 1 : -1;
    const yawOf = (qa: number): number => (((180 + sign * wrap(qa - p0.q)) % 360) + 360) % 360;
    const hp0 = await health();
    log(`start (${p0.x.toFixed(1)},${p0.y.toFixed(1)},${p0.z.toFixed(1)}) yaw sign ${sign}; count ${await count()}; health ${hp0.map((b) => f32(b).toFixed(1)).join('/')}`);
    result.start = { x: p0.x, y: p0.y, z: p0.z };
    const turnTo = async (target: number): Promise<number> => {
      for (let i = 0; i < 14; i++) {
        const err = wrap(target - yawOf((await pos()).q));
        if (Math.abs(err) < 3) return err;
        const k = err > 0 ? PCSX2_VK.rleft : PCSX2_VK.rright;
        inj.down(k); await sleep(Math.max(40, Math.min(1500, (Math.abs(err) / 128) * 1000 + (Math.abs(err) > 18 ? 150 : 60)))); inj.up(k); await sleep(250);
      }
      return wrap(target - yawOf((await pos()).q));
    };
    const goto = async (tx: number, tz: number, tol = 6): Promise<number> => {
      let p = await pos(), best = Infinity, since = Date.now(), running = false;
      for (let i = 0; i < 6000; i++) {
        const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
        if (d < tol) break;
        const bearing = bearingYaw(p, { x: tx, z: tz });
        const err = wrap(bearing - yawOf(p.q));
        if (Math.abs(err) > 25) { if (running) { inj.up(PCSX2_VK.lup); running = false; await sleep(150); } await turnTo(bearing); }
        else if (Math.abs(err) > 4) { const k = err > 0 ? PCSX2_VK.rleft : PCSX2_VK.rright; inj.down(k); await sleep(Math.max(30, (Math.abs(err) / 128) * 1000)); inj.up(k); }
        if (!running) { inj.down(PCSX2_VK.lup); running = true; }
        await sleep(120);
        p = await pos();
        if (d < best - 1) { best = d; since = Date.now(); }
        if (Date.now() - since > 4000) { log(`goto (${tx.toFixed(1)},${tz.toFixed(1)}): stuck at (${p.x.toFixed(1)},${p.z.toFixed(1)}), ${d.toFixed(1)} short`); break; }
      }
      if (running) inj.up(PCSX2_VK.lup);
      await sleep(500);
      p = await pos();
      return Math.hypot(tx - p.x, tz - p.z);
    };

    if (scoutArg !== null) {
      // --scout "dx,dz;dx,dz;...": per candidate, slot fromState restored (the clock goes back, then 1 s), a walk to
      // start + (dx, dz), then 7 s of guest clock holding still with the count read throughout: where it first reads 0,
      // and whether it reads 0 over the last 2 s. Cover is found by the count, not by a guess at the geometry.
      const scout: unknown[] = [];
      for (const c of parseScout(scoutArg)) {
        const t0 = await clock();
        await pine.loadState(P.fromState);
        { const w = Date.now(); while (Date.now() - w < 15000) { if ((await clock()) < t0 - 0.5) break; await sleep(20); } }
        await waitClock(1.0);
        const s0 = await pos();
        const tx = s0.x + c.dx, tz = s0.z + c.dz;
        const short = await goto(tx, tz, 3);
        const hold: { t: number; c: number }[] = [];
        { const h0 = await clock(); let lw = Date.now(), lt = h0;
          for (;;) { const t = await clock(); if (t - h0 >= holdS) break; if (t !== lt) { lt = t; lw = Date.now(); } else if (Date.now() - lw > 3000) throw new Error('the guest clock stopped while scouting'); hold.push({ t: t - h0, c: await count() }); await sleep(15); } }
        const first0 = hold.find((h) => h.c === 0)?.t ?? null;
        const last2 = hold.filter((h) => h.t >= holdS - 2);
        const first1After0 = first0 === null ? null : (hold.find((h) => h.t > first0 && h.c > 0)?.t ?? null);
        const p = await pos();
        const row = { dx: c.dx, dz: c.dz, at: { x: p.x, y: p.y, z: p.z }, short, holdS, startCount: hold[0]?.c ?? null, first0, first1After0, zeroLast2s: outOfReach(last2.map((h) => h.c)), reads: hold.length };
        scout.push(row);
        log(`scout (${c.dx},${c.dz}) hold ${holdS} s: at (${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}) ${short.toFixed(1)} short; count first 0 at ${first0 === null ? 'never' : first0.toFixed(2) + ' s'}; back above 0 at ${first1After0 === null ? 'never' : first1After0.toFixed(2) + ' s'}; 0 over the last 2 s: ${row.zeroLast2s}`);
      }
      result.scout = scout;
      result.ok = scout.some((r) => (r as { zeroLast2s: boolean }).zeroLast2s);
      return;
    }
    const tries: unknown[] = [];
    for (const factor of P.factors) {
      const spot = placeOnLine(P.target, p0, P.reach, factor);
      const short = await goto(spot.x, spot.z);
      const yaw = bearingYaw(await pos(), P.target);
      const yawErr = await turnTo(yaw);
      await waitClock(1.0);   // settle a second
      const counts: number[] = [];
      { const c0 = await clock(); let lw = Date.now(), lt = c0;
        for (;;) { const t = await clock(); if (t - c0 >= 1.0) break; if (t !== lt) { lt = t; lw = Date.now(); } else if (Date.now() - lw > 3000) throw new Error('the guest clock stopped while reading the count'); counts.push(await count()); await sleep(15); } }
      const p = await pos();
      const at = { factor, spot, reached: { x: p.x, y: p.y, z: p.z }, short, yaw, yawErr, dist: Math.hypot(p.x - P.target.x, p.z - P.target.z), countsMax: Math.max(...counts), counts: counts.length };
      tries.push(at);
      log(`factor ${factor}: at (${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}) ${at.dist.toFixed(1)} from the post (${short.toFixed(1)} short of the spot), yaw ${yaw.toFixed(1)} (err ${yawErr.toFixed(1)}); count over 1 s max ${at.countsMax} (${counts.length} reads)`);
      if (outOfReach(counts)) {
        const hp1 = await health();
        const same = hp1.every((b, i) => b === hp0[i]);
        result.health = { before: hp0.map(f32), after: hp1.map(f32), same };
        if (!same) { log('health changed: the placement is void'); result.ok = false; break; }
        await pine.saveState(P.saveSlot);
        await sleep(1500);
        log(`saved slot ${P.saveSlot} at factor ${factor}`);
        result.ok = true; result.saved = P.saveSlot; result.chosen = at;
        break;
      }
    }
    result.tries = tries;
    if (result.ok === undefined) { result.ok = false; log('no factor gave a second at count 0'); }
    await deps.topmostWindow(hwnd, ctl.signal);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'gdigrab', '-offset_x', String(PCSX2_WINDOW.x), '-offset_y', String(PCSX2_WINDOW.y), '-video_size', `${PCSX2_WINDOW.width}x${PCSX2_WINDOW.height}`, '-i', 'desktop', '-frames:v', '1', join(out, 'placed.png')], { stdio: 'ignore' });
  } finally {
    writeFileSync(join(out, 'place.json'), JSON.stringify(result, null, 2));
    // The key injector's PowerShell child and PINE closed beside the stop, on every path (the batch review F7).
    try { injector?.close(); } catch { /* gone */ }
    try { raw?.close(); } catch { /* gone */ }
    stop();
  }
}

if (process.argv[1] && /place\.ts$/.test(process.argv[1])) {
  // An explicit exit: the key injector's PowerShell child and the window helper keep node's loop alive past main
  // (the first scout ran out its 900 s timeout after its last row).
  main(process.argv.slice(2)).then(() => process.exit(0), (e) => { console.error(String(e)); process.exit(1); });
}
