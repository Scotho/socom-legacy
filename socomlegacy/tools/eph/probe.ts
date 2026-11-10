import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { seriesCsv } from './record';
import {
  type ChildLike, type HostPlan, type InjectorLike, type LiveDeps, type PineLike, KeyTranslator, PCSX2_WINDOW, RunArgsError,
  hostContext, hostDeps, hostPlan, parseRunArgs, pcsx2Argv,
} from './run';
import { PCSX2_WINDOW_TITLE } from './keys';
import { Sampler, detectRevision, describeReadings, f32, GUEST_ADDRESSES, ORIGIN_ADDRESSES, ORIGIN_EVIDENCE, ORIGIN_INFERRED, PAD_PROBE_ADDRESSES } from './sampler';
import { parseBuild, type Build } from './build';
import { parseScript, type ScriptEvent } from './script';
import { runTimeline } from './timeline';

/**
 * The PCSX2-only press probe (6d's two probes before the cancel reruns, 2026-11-01): PCSX2 alone from a save state, no
 * page. Each case's script is played on the guest clock through the key path -- one injector batch a moment -- and every
 * guest frame is sampled with the pad probe (the button bytes, the pressures, Triangle's peak, ./sampler
 * PAD_PROBE_ADDRESSES), the extra words (velocity) and the tilt/stick columns (posture, action, the stance request).
 * The state is reloaded by PINE before each case of each trial. Writes probe.csv (trial, case, ms on the guest clock
 * from the case's start, then the sampler row) and probe.json. Product track (OT.R53): an instrument, never in a build,
 * never changing the game.
 *
 *   node --import tsx tools/eph/probe.ts --build r0004 --state 5 --trials 3 --script a.txt [--script b.txt ...] --out <dir>
 *     [--tail-ms 2500] [--shots] [--save-after <slot>] [--origin]
 *
 * `--origin` adds the floor probe's origin columns (./sampler ORIGIN_ADDRESSES: the record FUN_005b0840 queues, its
 * origin over the feet; probeOriginStale when the queue skipped the player this frame), for the jump-air trace of
 * 2026-11-08. probe.json's `origin` holds their addresses, evidence, inferred list and overflow count (originBeyondCap).
 */

/** Guest ms the state runs after its load before a case starts (an adaptation: the load settles). */
export const PROBE_SETTLE_MS = 1000;
/** Wall ms a state load may take to land (an adaptation). */
export const LOAD_TIMEOUT_MS = 15_000;

export interface ProbeArgs {
  readonly build: Build;
  readonly state: number;
  readonly trials: number;
  readonly scripts: readonly string[];
  readonly out: string;
  readonly tailMs: number;
  /** A frame of the PCSX2 window after each case (the probe's own check that the game was in play). */
  readonly shots: boolean;
  /** Save the state to this slot once every case is played (a state made by a probe script, e.g. Help OFF). */
  readonly saveAfter: number | null;
  /**
   * Play the cases on wall ms instead of the guest clock: the pause menu stops the guest clock (it reads 0 there, the
   * live probe of 2026-11-01), so a menu script (probe-help-off.txt) cannot run on it.
   */
  readonly wallClock: boolean;
  /** The floor probe's origin columns (./sampler ORIGIN_ADDRESSES). */
  readonly origin: boolean;
}

export function parseProbeArgs(argv: readonly string[]): ProbeArgs {
  let build: Build | null = null, state: number | null = null, trials = 1, out: string | null = null, tailMs = 2500, shots = false;
  let saveAfter: number | null = null;
  let wallClock = false;
  let origin = false;
  const scripts: string[] = [];
  const int = (n: string, v: string | undefined, min: number): number => {
    const x = Number(v);
    if (v === undefined || !Number.isInteger(x) || x < min) throw new RunArgsError(`${n} takes an integer >= ${min}, not "${v ?? ''}"`);
    return x;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!, v = argv[i + 1];
    switch (a) {
      case '--build': build = parseBuild(v ?? ''); i++; break;
      case '--state': state = int(a, v, 0); i++; break;
      case '--trials': trials = int(a, v, 1); i++; break;
      case '--script': if (!v) throw new RunArgsError('--script takes a file'); scripts.push(v); i++; break;
      case '--out': if (!v) throw new RunArgsError('--out takes a directory'); out = v; i++; break;
      case '--tail-ms': tailMs = int(a, v, 0); i++; break;
      case '--shots': shots = true; break;
      case '--wall-clock': wallClock = true; break;
      case '--origin': origin = true; break;
      case '--save-after': saveAfter = int(a, v, 0); i++; break;
      default: throw new RunArgsError(`EPH probe: unknown switch ${a}`);
    }
  }
  if (build === null) throw new RunArgsError('EPH probe: --build r0001|r0004 is required');
  if (state === null) throw new RunArgsError('EPH probe: --state <slot> is required');
  if (scripts.length === 0) throw new RunArgsError('EPH probe: at least one --script');
  if (out === null) throw new RunArgsError('EPH probe: --out <dir> is required');
  return { build, state, trials, scripts, out, tailMs, shots, saveAfter, wallClock, origin };
}

/** A PINE client that can also load a state (./pine PineClient fits). */
export interface ProbePine extends PineLike {
  loadState(slot: number): Promise<void>;
}

export interface ProbeDeps extends Pick<LiveDeps, 'log' | 'prepareHost' | 'spawnPcsx2' | 'killTree' | 'findWindow' | 'placeWindow' | 'topmostWindow' | 'closeWindows' | 'writeFile' | 'sleep' | 'now'> {
  readonly injector: (hwnd: number, onFail: (err: Error) => void) => InjectorLike;
  readonly connectPine: (signal: AbortSignal) => Promise<ProbePine>;
  /** A frame of the PCSX2 window to `out` (a .png). */
  readonly shot: (out: string) => Promise<void>;
  readonly readText: (path: string) => string;
}

/**
 * One PINE call at a time: PCSX2 reads several requests that arrive together as one batch and answers them in one
 * reply, so pipelined calls desync the client (the live probe of 2026-11-01: "op 0x2 returned 1 bytes, expected 4").
 * The probe's sampling loop and its clock both read PINE, so every call goes through this queue.
 */
export function serialPine(p: ProbePine): ProbePine {
  let q: Promise<unknown> = Promise.resolve();
  const one = <T>(f: () => Promise<T>): Promise<T> => {
    const r = q.then(f, f);
    q = r.catch(() => undefined);
    return r;
  };
  return {
    read32: (a) => one(() => p.read32(a)),
    read8: (a) => one(() => p.read8(a)),
    version: () => one(() => p.version()),
    saveState: (s) => one(() => p.saveState(s)),
    loadState: (s) => one(() => p.loadState(s)),
    close: () => p.close(),
  };
}

const caseName = (path: string): string => basename(path).replace(/\.txt$/, '');

/** The probe: PCSX2 started once from `--state`, every case of every trial played from the reloaded state. */
export async function probeRun(a: ProbeArgs, host: HostPlan, d: ProbeDeps): Promise<void> {
  const ctl = new AbortController();
  const signal = ctl.signal;
  const cases = a.scripts.map((path) => ({ name: caseName(path), events: parseScript(d.readText(path)) }));
  d.prepareHost(host);
  let pcsx2: ChildLike | null = null;
  let pine: ProbePine | null = null;
  let injector: InjectorLike | null = null;
  try {
    pcsx2 = d.spawnPcsx2(pcsx2Argv(host.layout.exe, host.iso, a.state));
    if (pcsx2.pid === undefined) throw new Error('EPH probe: PCSX2 did not start');
    const hwnd = await d.findWindow(PCSX2_WINDOW_TITLE, pcsx2.pid, signal);
    await d.sleep(6000, signal);
    await d.placeWindow(hwnd, PCSX2_WINDOW, signal);
    await d.topmostWindow(hwnd, signal);
    injector = d.injector(hwnd, (err) => ctl.abort(err));
    pine = serialPine(await d.connectPine(signal));
    const det = await detectRevision(pine, { sleep: (ms) => d.sleep(ms, signal), now: d.now });
    if (det.revision !== a.build) throw new Error(`EPH probe: --build ${a.build} asked, but PCSX2 runs ${det.revision} (${describeReadings(det.readings)})`);
    d.log(`PCSX2 runs ${det.revision}`);
    const p = pine;
    const sampler = new Sampler(p, det.revision, { padProbe: true, extra: true, nearRadius: 30, nearRefreshRows: 1_000_000, origin: a.origin });
    const clock = async (): Promise<number> => f32(await p.read32(GUEST_ADDRESSES[det.revision].guestClock)) * 1000;
    const rows: Record<string, unknown>[] = [];
    for (let trial = 1; trial <= a.trials; trial++) {
      for (const c of cases) {
        // PINE answers the load before it lands (the live probe, 2026-11-01: the clock read straight after was still the
        // old one, and went back mid-case): the case waits for the clock to go back -- every state here was saved
        // earlier in guest time than the probe has run -- then lets it settle PROBE_SETTLE_MS.
        const before = await clock();
        await p.loadState(a.state);
        const waitFrom = d.now();
        let loaded = await clock();
        while (loaded >= before) {
          if (d.now() - waitFrom > LOAD_TIMEOUT_MS) throw new Error(`EPH probe: the state in slot ${a.state} did not load in ${LOAD_TIMEOUT_MS / 1000} s (the clock stood at or past ${before} ms)`);
          await d.sleep(5, signal);
          loaded = await clock();
        }
        while ((await clock()) - loaded < PROBE_SETTLE_MS) await d.sleep(5, signal);
        const t0 = await clock();
        d.log(`trial ${trial} ${c.name}: clock ${before.toFixed(0)} ms before the load, ${loaded.toFixed(0)} after, the case from ${t0.toFixed(0)}`);
        const w0 = d.now();
        const ms = async (): Promise<number> => (a.wallClock ? d.now() - w0 : (await clock()) - t0);
        const keys = new KeyTranslator();
        const moments: { t: number; line: number; events: ScriptEvent[] }[] = [];
        for (const e of c.events) {
          const last = moments[moments.length - 1];
          if (last && last.t === e.t) last.events.push(e);
          else moments.push({ t: e.t, line: e.line, events: [e] });
        }
        const end = (c.events.length ? c.events[c.events.length - 1]!.t : 0) + a.tailMs;
        let sampling = true;
        const sampled = (async () => {
          while (sampling) {
            const r = await sampler.sample();
            if (r) rows.push({ trial, case: c.name, ms: r.t * 1000 - t0, ...r });
            else await d.sleep(1, signal);
          }
        })();
        await runTimeline(moments, ms, async (m) => {
          await injector!.batch(m.events.flatMap((e) => keys.push(e)).map((k) => ({ action: k.action, vk: k.vk })));
        }, { signal, wait: () => d.sleep(1, signal) });
        while ((await ms()) < end) await d.sleep(5, signal);
        sampling = false;
        await sampled;
        if (a.shots) await d.shot(`${a.out}/t${trial}-${c.name}.png`);
      }
    }
    if (a.saveAfter !== null) {
      await p.saveState(a.saveAfter);
      await d.sleep(4000, signal);
    }
    d.writeFile(`${a.out}/probe.csv`, seriesCsv(rows));
    d.writeFile(`${a.out}/probe.json`, JSON.stringify({
      build: a.build, detected: det.revision, readings: det.readings, slot: a.state, trials: a.trials, cases: cases.map((c) => c.name),
      scripts: a.scripts, tailMs: a.tailMs, settleMs: PROBE_SETTLE_MS, padProbe: PAD_PROBE_ADDRESSES[det.revision],
      torn: sampler.torn, nullActor: sampler.nullActor, readErrors: sampler.tiltErrors + sampler.extraErrors, savedTo: a.saveAfter,
      origin: a.origin ? { addresses: ORIGIN_ADDRESSES[det.revision], evidence: ORIGIN_EVIDENCE[det.revision], inferred: ORIGIN_INFERRED[det.revision], readErrors: sampler.originErrors, originBeyondCap: sampler.originBeyondCap } : null,
    }, null, 2));
  } finally {
    try { injector?.close(); } catch { /* gone */ }
    try { pine?.close(); } catch { /* gone */ }
    if (pcsx2) d.killTree(pcsx2);
    d.closeWindows();
  }
}

/** The host's probe deps: the run's host pieces (Windows), PINE with load_state, a frame by ffmpeg's gdigrab. */
export function probeHostDeps(): ProbeDeps {
  const h = hostDeps();
  return {
    ...h,
    connectPine: h.connectPine as unknown as ProbeDeps['connectPine'],
    shot: async (out) => {
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'gdigrab', '-offset_x', String(PCSX2_WINDOW.x), '-offset_y', String(PCSX2_WINDOW.y),
        '-video_size', `${PCSX2_WINDOW.width}x${PCSX2_WINDOW.height}`, '-i', 'desktop', '-frames:v', '1', out], { stdio: 'ignore', windowsHide: true });
    },
    readText: (path) => readFileSync(path, 'utf8'),
  };
}

async function main(argv: string[]): Promise<void> {
  const a = parseProbeArgs(argv);
  const host = hostPlan(parseRunArgs(['--boot-to-mission', '--build', a.build, '--state', String(a.state)]), hostContext());
  mkdirSync(a.out, { recursive: true });
  await probeRun(a, host, probeHostDeps());
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void dirname(fileURLToPath(import.meta.url));
  main(process.argv.slice(2)).then(() => process.exit(0), (err: Error) => { console.error(err.message); process.exit(1); });
}
