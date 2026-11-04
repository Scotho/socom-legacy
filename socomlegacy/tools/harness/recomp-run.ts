/**
 * The recomp's pad driver (plan `2026-10-11-web-parity-harness.md`, PH-4's `recomp-run.ts`; research 366 section 1).
 *
 * Under a run of the recomp the owner launched (the desktop's `drive.py`, the lock and the keys are his: this never starts
 * the exe), it follows the run's log as it grows and writes the pad file the runtime samples (`PS2X_SOCOM2_INPUT_FILE`:
 * one line `b=<hex 16-bit mask> rx=<0-255> ry= lx= ly=`, desktop@be557831
 * `third_party/ps2recomp/ps2xRuntime/src/lib/socom2_host_input.cpp:496-520`). The scenario's frames are the player's tick
 * calls (`[call] SealTick` rows whose `a0` is the latest peeked actor, as `recomp-trace.ts` reads them): after `k` of
 * them the run is at frame `k`, and the pad is the scenario's for frame `k`. The game reads the file through a latch
 * sampled every 2 ms, so a write lands on the next frame or the one after; the comparison aligns the two traces on the
 * edge the log's `[socom2-input]` rows show, not on the frame this driver meant. That edge is the first X or place press
 * (PH.R3), or -- on a run with no such press, PH-1's holds -- the first stick change from neutral (`compare.ts`). The
 * driver's frame 0 may be before gameplay; the edge, not the count, is what lines the traces up.
 *
 * Only frame-numbered keyframes. A keyframe that waits on an event (`prompt+0`, `climb+17`) is refused: those events are
 * the port's signals, and the recomp's log shows neither the prompt nor which motions are a climb (research 366 section 2,
 * "Owed").
 *
 * On Windows the runtime's sampler opens the pad file every 2 ms, so a rename over it can be refused (EPERM, EACCES,
 * EBUSY): each write is retried for up to `RENAME_RETRY_MS`, then fails loudly. Whatever stops the run, the last write
 * is neutral (a `finally`), so the SEAL is never left walking.
 */
import { closeSync, existsSync, openSync, readFileSync, readSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { padAt, parseScenario, type PadState, type Scenario, ScenarioRefusal } from './scenario';
import { RECOMP_ADDRESSES, type Revision } from './schema';

const NEUTRAL: PadState = { b: 0, lx: 0x80, ly: 0x80, rx: 0x80, ry: 0x80 };
const MASK = 0x1ffffff;
const CALL = /^\[call\] [\d.]+s SealTick #\d+ a0=0x([0-9a-f]+)\b/;
/** How long a refused rename is retried, and the step between tries. */
const RENAME_RETRY_MS = 200;
const RENAME_STEP_MS = 1;
/** Each line held this long before the next, so the 2 ms sampler sees it (a one-frame press from one read). */
const HOLD_MS = 5;
const RETRYABLE = new Set(['EPERM', 'EACCES', 'EBUSY']);

/** One pad file line, the runtime's grammar. */
export function padFileLine(p: PadState): string {
  return `b=${(p.b & 0xffff).toString(16).padStart(4, '0')} rx=${p.rx} ry=${p.ry} lx=${p.lx} ly=${p.ly}\n`;
}

/** The scenario's pad, frame by frame, against the run's log fed as it grows. */
export class PadDriver {
  frame = 0;
  done = false;
  private actor: number | null = null;
  private rest = '';
  private last: string | null = null;
  private readonly peek: RegExp;

  constructor(private readonly scenario: Scenario, revision: Revision) {
    const at = (RECOMP_ADDRESSES.player_actor as Readonly<Record<string, number>>)[revision];
    if (at === undefined) throw new ScenarioRefusal(`no revision ${String(revision)}: the player-actor static is placed for r0001 and r0004 only`);
    const waits = [...new Set(scenario.pad.filter((k) => typeof k.frame === 'string').map((k) => String(k.frame)))];
    if (waits.length > 0) {
      throw new ScenarioRefusal(`keyframes wait on port-side events (${waits.join(', ')}): the recomp's log shows neither, so this driver takes frame numbers only`);
    }
    this.peek = new RegExp(`^\\[peek\\].*?@0*${at.toString(16)}: ([0-9a-f]{8})`);
  }

  private emit(p: PadState, out: string[]): void {
    const line = padFileLine(p);
    if (line !== this.last) { out.push(line); this.last = line; }
  }

  /** The log's new text; the pad file lines to write, in order (the last is the one that stands). */
  feed(text: string): string[] {
    const out: string[] = [];
    if (this.last === null) this.emit(padAt(this.scenario, 0, {}), out);
    if (this.done) return out;
    const lines = (this.rest + text).split('\n');
    this.rest = lines.pop() ?? '';
    for (const l of lines) {
      const p = this.peek.exec(l);
      if (p) { const a = parseInt(p[1]!, 16) & MASK; if (a !== 0) this.actor = a; continue; }
      const c = CALL.exec(l);
      if (!c || this.actor === null || (parseInt(c[1]!, 16) & MASK) !== this.actor) continue;
      this.frame++;
      if (this.frame >= this.scenario.stop.orFrames) {
        this.done = true;
        this.emit(NEUTRAL, out);
        break;
      }
      this.emit(padAt(this.scenario, this.frame, {}), out);
    }
    return out;
  }

  /** A shrunk log is a new one (the run restarted): its frames are counted afresh. */
  restart(): void {
    this.frame = 0;
    this.actor = null;
    this.rest = '';
    this.last = null;   // so a shrunk log re-emits the frame-0 neutral (review-ph-run-b.md; the test owed with PH-1's run)
    this.done = false;
  }
}

/** The file operations, injectable for a test. */
export interface PadIo {
  write(path: string, text: string): void;
  rename(from: string, to: string): void;
  /** A synchronous wait, in milliseconds. */
  sleep(ms: number): void;
  now?: () => number;
}

const SLEEPER = new Int32Array(new SharedArrayBuffer(4));
const nodeIo: PadIo = {
  write: (path, text) => writeFileSync(path, text),
  rename: (from, to) => renameSync(from, to),
  sleep: (ms) => { Atomics.wait(SLEEPER, 0, 0, ms); },
};

/**
 * The pad file replaced whole (a sibling renamed over it), so the sampler never reads half a line. A rename the
 * sampler's open file refuses is retried every `RENAME_STEP_MS` for `RENAME_RETRY_MS`, then throws naming the file.
 */
export function writePad(path: string, line: string, io: PadIo = nodeIo): void {
  const now = io.now ?? (() => Date.now());
  io.write(`${path}.tmp`, line);
  const until = now() + RENAME_RETRY_MS;
  for (;;) {
    try { io.rename(`${path}.tmp`, path); return; } catch (e) {
      const code = (e as NodeJS.ErrnoException).code ?? '';
      if (!RETRYABLE.has(code)) throw e;
      if (now() >= until) throw new Error(`the pad file ${path}: the rename was refused (${code}) for ${RENAME_RETRY_MS} ms`);
      io.sleep(RENAME_STEP_MS);
    }
  }
}

/**
 * `--log <the run's log> --pad <the PS2X_SOCOM2_INPUT_FILE path> --scenario <json> [--timeout <s>]`: follows the log
 * until the scenario's frames are done (exit 0) or the timeout (default 600 s; exit 1), and leaves the pad neutral
 * either way -- also when a write fails, which is then thrown.
 */
export async function main(argv: string[], io: PadIo = nodeIo): Promise<number> {
  const args = [...argv];
  const take = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    if (i < 0) return undefined;
    const v = args[i + 1];
    args.splice(i, 2);
    return v;
  };
  const logPath = take('--log'), padPath = take('--pad'), scenarioPath = take('--scenario');
  const timeout = Number(take('--timeout') ?? 600);
  if (!logPath || !padPath || !scenarioPath || args.length > 0 || !(timeout > 0)) {
    console.error('usage: npx tsx tools/harness/recomp-run.ts --log <run log> --pad <pad file> --scenario <json> [--timeout <s>]');
    return 2;
  }
  let driver: PadDriver;
  try {
    const scenario = parseScenario(readFileSync(scenarioPath, 'utf8'));
    driver = new PadDriver(scenario, scenario.revision as Revision);
  } catch (e) {
    if (e instanceof ScenarioRefusal) { console.error(e.message); return 2; }
    throw e;
  }
  const end = Date.now() + timeout * 1000;
  const put = (lines: readonly string[]): void => {
    lines.forEach((line, i) => {
      if (i > 0) io.sleep(HOLD_MS);                       // the line before held, so the sampler sees it
      writePad(padPath, line, io);
    });
  };
  let offset = 0;
  try {
    put(driver.feed(''));
    while (!driver.done && Date.now() < end) {
      if (existsSync(logPath)) {
        const size = statSync(logPath).size;
        if (size < offset) { offset = 0; driver.restart(); }      // the log shrank: a new run
        if (size > offset) {
          const fd = openSync(logPath, 'r');
          try {
            const buf = Buffer.alloc(size - offset);
            const got = readSync(fd, buf, 0, buf.length, offset);
            offset += got;
            put(driver.feed(buf.subarray(0, got).toString('utf8')));
          } finally { closeSync(fd); }
        }
      }
      await new Promise((r) => setTimeout(r, 2));
    }
  } finally {
    io.sleep(HOLD_MS);
    writePad(padPath, padFileLine(NEUTRAL), io);
  }
  console.log(driver.done ? `pad: ${driver.frame} frame(s) driven; left neutral` : `pad: stopped at the timeout on frame ${driver.frame}; left neutral`);
  return driver.done ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await main(process.argv.slice(2));
}
