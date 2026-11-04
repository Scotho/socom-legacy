/**
 * The recomp's side of the parity harness (plan `2026-10-11-web-parity-harness.md`, PH-4; PH-1's run environment).
 *
 * `recompEnv` writes the `PS2X_*` environment a run of the recomp needs for one field set, from the schema's re-read
 * offsets (research 366 section 2) -- not the plan's wave-1 string of section 3.1, which predates the re-read (it
 * dumped `+0x87c`, the charge object's, on the actor). `parseRecompLog` reads that run's log into an `s2t` trace.
 * The row shapes are the desktop runtime's at desktop@be557831: `[call]`, `[ret]`, `[ret-unwound]` and `[ret-dump]`
 * (`third_party/ps2recomp/ps2xRuntime/src/lib/game_overrides_socom2.cpp:843`, `:897`, `:907`, `:962`),
 * `[socom2-input]` (`third_party/ps2recomp/ps2xRuntime/src/lib/socom2_host_input.cpp:538`, on stderr) and `[peek]`
 * (`third_party/ps2recomp/ps2xRuntime/include/runtime/socom2_peek.h:6`).
 *
 * The port never launches the recomp: the run, the lock and the keys are the owner's (PH-1). This file only writes the
 * environment and reads the log. The reference it makes is an emulated recompilation, never a retail console.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { outputRefusal } from '../outputRefusal';
import { parseScenario, ScenarioRefusal, type Scenario } from './scenario';
import { fieldSet, RECOMP_ADDRESSES, recompOffset, SchemaRefusal, type Revision } from './schema';
import { formatTrace, referenceFor, type Trace, type TraceFrame, type TracePad } from './trace';

/** The traced call's name in the log, and the player's tick per revision (`FUN_0057a330`, research 366 section 2). */
const TICK_NAME = 'SealTick';
const TICK_ADDRESS: Readonly<Record<Revision, number | null>> = { r0001: 0x0057a330, r0004: null };

const hex = (n: number): string => `0x${n.toString(16)}`;

/** One `[ret-dump]` item: a chain from the tick's `a0` (the actor) and its word count. */
interface DumpItem { chain: string; words: number }

/**
 * The dumps a field set needs, actor-relative. The two chained reads (`root.y`, `matrix.y`) dump their pointer word
 * too, so the converter can tell which printed address is which: a `[ret-dump]` row names only the final address.
 */
function dumpItems(fields: ReadonlySet<string>, revision: Revision): DumpItem[] {
  const off = (name: string): number => {
    const o = recompOffset(name, revision);
    if (o === null) throw new SchemaRefusal(`${name} has no ${revision} offset established`);
    return o;
  };
  const items: DumpItem[] = [];
  const add = (chain: string, words = 1): void => { if (!items.some((i) => i.chain === chain)) items.push({ chain, words }); };
  if (fields.has('pos.x')) add(`a0+${hex(off('pos.x'))}`, 3);
  if (fields.has('vel.local.x')) add(`a0+${hex(off('vel.local.x'))}`, 3);
  // feetY.climb is not dumped: its read is +0x2e4 as of the last climb frame, and which motions are a climb is unread
  // (research 366 section 2, "Owed"), so the converter would have nothing to choose it by.
  if (fields.has('dt')) add('a0+0x2e0');                                         // the tick's dt (FUN_0057a330 D:L439135)
  if (fields.has('action.current')) add(`a0+${hex(off('action.current'))}`);
  if (fields.has('action.depth')) add(`a0+${hex(off('action.depth'))}`);
  if (fields.has('flags.e1bit4')) add(`a0+${hex(off('flags.e1bit4') & ~3)}`);       // the word holding the byte
  if (fields.has('flags.0x200')) add(`a0+${hex(off('flags.0x200'))}`);
  if (fields.has('stance.wished')) add(`a0+${hex(off('stance.wished'))}`);
  if (fields.has('health')) add(`a0+${hex(off('health'))}`);
  if (fields.has('alive')) add(`a0+${hex(off('alive') & ~3)}`);
  if (fields.has('moveScale')) add(`a0+${hex(off('moveScale'))}`);
  if (fields.has('root.y')) { add(`a0+${hex(off('root.y'))}`); add(`a0+${hex(off('root.y'))}*+0x4`); }
  if (fields.has('matrix.y')) { add('a0+0x28'); add('a0+0x28*+0x34'); }
  if (fields.has('floor.y')) add('a0+0x404');
  return items;
}

/**
 * PH-1's run environment for one field set on one revision: the player's tick traced on every call, its re-read
 * fields dumped at its return, the actor pointer and the guest clock peeked, the pad's changes logged, no host pad.
 * Refused on a revision whose tick address is not established (r0004 today).
 */
export function recompEnv(revision: Revision, setName: string): Record<string, string> {
  const tick = TICK_ADDRESS[revision];
  if (tick === undefined || tick === null) throw new SchemaRefusal(`the player's tick has no ${revision} address established`);
  const names = new Set(fieldSet(setName).map((f) => f.name));
  const dumps = dumpItems(names, revision).map((d) => `${TICK_NAME}:${d.chain}:${d.words}`);
  return {
    PS2X_CALL_TRACE: `0x${tick.toString(16).padStart(8, '0')}:${TICK_NAME}`,
    PS2X_CALL_TRACE_EVERY: '1',
    PS2X_CALL_TRACE_DUMP: dumps.join(','),
    PS2X_PEEK: `${hex(RECOMP_ADDRESSES.player_actor[revision])}:1,${hex(RECOMP_ADDRESSES.guest_clock[revision])}:1`,
    PS2X_PC_SAMPLER: '0.25',
    PS2X_SOCOM2_INPUT_TRACE: '1',
    PS2X_HOST_GAMEPAD: '0',
  };
}

export interface RecompLogOptions {
  scenario: string;
  fieldSet: string;
  revision: Revision;
  /** The environment the run was launched with (`recompEnv`'s), for the header. */
  env?: Record<string, string>;
  build?: { exeSha256?: string; desktopCommit?: string };
}

interface Call { n: number; pad: TracePad; actor: number; actorChanged: boolean; unwound: boolean; returned: boolean; words: Map<number, number> }

const CALL = new RegExp(`^\\[call\\] [\\d.]+s ${TICK_NAME} #(\\d+) a0=0x([0-9a-f]+)\\b`);
const RET = new RegExp(`^\\[ret\\] ${TICK_NAME} #(\\d+)\\b`);
const UNWOUND = new RegExp(`^\\[ret-unwound\\] ${TICK_NAME} #(\\d+)\\b`);
const DUMP = new RegExp(`^\\[ret-dump\\] ${TICK_NAME} #(\\d+) @([0-9a-f]+):(.*)$`);
const INPUT = /^\[socom2-input\] state buttons=([0-9a-f]+) rx=([0-9a-f]+) ry=([0-9a-f]+) lx=([0-9a-f]+) ly=([0-9a-f]+)/;
const MASK = 0x1ffffff;

function f32(word: number): number {
  const v = new DataView(new ArrayBuffer(4));
  v.setUint32(0, word >>> 0, true);
  return v.getFloat32(0, true);
}

/** The `[peek]` row's word at the player-actor static, or null when the row has none or it is 0. */
function peekedActor(line: string, revision: Revision): number | null {
  if (!line.startsWith('[peek]')) return null;
  const m = new RegExp(`@0*${RECOMP_ADDRESSES.player_actor[revision].toString(16)}: ([0-9a-f]{8})`).exec(line);
  return m && parseInt(m[1]!, 16) !== 0 ? parseInt(m[1]!, 16) & MASK : null;
}

/**
 * The log of a run under `recompEnv` into an `s2t` trace: the player's tick calls (its `a0` the peeked actor) are the
 * frames, numbered in order; the pad is the last `[socom2-input]` state logged before the call (log order: the input
 * rows are stderr's, so the join is as good as the two streams' interleave); `dt` is the call's `f12`. An unwound call
 * is a masked frame with no readings. A field whose source meaning the harness has not mapped (research 366 section 2's
 * "Owed") is recorded as the raw value with its kind named (`motion:0x2a`, `stance:1`), or null where nothing is read.
 */
export function parseRecompLog(text: string, opts: RecompLogOptions): Trace {
  const lines = text.split(/\r?\n/);
  // review-ph-4 F3: the actor is the latest peek before each call (a round's restart may make another); a change masks the
  // first frame after it. Calls before any peek are not the player's to tell.
  if (!lines.some((l) => peekedActor(l, opts.revision) !== null)) {
    throw new SchemaRefusal('no actor pointer peeked (PS2X_PEEK of the player-actor static): the player\'s rows cannot be told apart');
  }
  let actor: number | null = null;
  let changed = false;
  const calls = new Map<number, Call>();
  const order: Call[] = [];
  let pad: TracePad = { b: 0, lx: 0x80, ly: 0x80, rx: 0x80, ry: 0x80 };
  for (const l of lines) {
    const peeked = peekedActor(l, opts.revision);
    if (peeked !== null) { if (actor !== null && peeked !== actor) changed = true; actor = peeked; continue; }
    let m = INPUT.exec(l);
    if (m) { pad = { b: parseInt(m[1]!, 16), rx: parseInt(m[2]!, 16), ry: parseInt(m[3]!, 16), lx: parseInt(m[4]!, 16), ly: parseInt(m[5]!, 16) }; continue; }
    m = CALL.exec(l);
    if (m) {
      if (actor === null || (parseInt(m[2]!, 16) & MASK) !== actor) continue;
      const call: Call = { n: Number(m[1]), pad: { ...pad }, actor, actorChanged: changed, unwound: false, returned: false, words: new Map() };
      changed = false;
      calls.set(call.n, call);
      order.push(call);
      continue;
    }
    m = UNWOUND.exec(l);
    if (m) { const c = calls.get(Number(m[1])); if (c) c.unwound = true; continue; }
    m = RET.exec(l);
    if (m) { const c = calls.get(Number(m[1])); if (c) c.returned = true; continue; }
    m = DUMP.exec(l);
    if (m) {
      const c = calls.get(Number(m[1]));
      if (!c) continue;
      const base = parseInt(m[2]!, 16) & MASK;
      const words = [...m[3]!.matchAll(/([0-9a-f]{8})\(/g)].map((w) => parseInt(w[1]!, 16));
      words.forEach((w, i) => c.words.set(base + i * 4, w));
    }
  }
  const off = (name: string): number => recompOffset(name, opts.revision) ?? NaN;
  const frames: TraceFrame[] = [];
  order.forEach((c, frame) => {
    const actor = c.actor;
    const at = (addr: number): number | null => c.words.get(addr & MASK) ?? null;
    const word = (o: number): number | null => at(actor + o);
    const float = (o: number): number | null => { const w = word(o); return w === null ? null : f32(w); };
    const byteAt = (o: number): number | null => { const w = word(o & ~3); return w === null ? null : (w >>> ((o & 3) * 8)) & 0xff; };
    const chained = (ptrOff: number, add: number): number | null => { const p = word(ptrOff); if (p === null || (p & MASK) === 0) return null; const w = at((p & MASK) + add); return w === null ? null : f32(w); };
    // review-ph-4 F1: the tick's dt is its actor's +0x2e0 (D:L439135); the guest clock is peeked only at the sampler's
    // period, so t_guest has no per-frame reading here.
    const masked = c.unwound || !c.returned || c.actorChanged;
    const dt = masked ? null : float(0x2e0);
    const base: Record<string, number | string | null> = {
      frame, t_guest: null, dt,
      'pad.b': c.pad.b, 'pad.lx': c.pad.lx, 'pad.ly': c.pad.ly, 'pad.rx': c.pad.rx, 'pad.ry': c.pad.ry,
    };
    const fields: Record<string, number | string | null> = { ...base };
    for (const f of fieldSet(opts.fieldSet)) if (!(f.name in fields)) fields[f.name] = null;
    if (!masked) {
      const motion = word(off('action.current'));
      const depth = word(off('action.depth'));
      const e1 = byteAt(off('flags.e1bit4'));
      const rootH = chained(off('root.y'), 4);
      const posY = float(off('pos.y'));
      Object.assign(fields, {
        'pos.x': float(off('pos.x')), 'pos.y': posY, 'pos.z': float(off('pos.z')),
        'vel.local.x': float(off('vel.local.x')), 'vel.local.y': float(off('vel.local.y')), 'vel.local.z': float(off('vel.local.z')),
        'action.current': motion === null ? null : (motion & 0xffff) === 0xffff ? 'none' : `motion:${hex(motion & 0xffff)}`,
        'action.depth': depth === null ? null : (depth | 0) + 1,
        'flags.e1bit4': e1 === null ? null : (e1 & 0x10) !== 0 ? 1 : 0,
        'flags.0x200': byteAt(off('flags.0x200')),
        'stance.wished': ((s) => (s === null ? null : `stance:${s}`))(byteAt(off('stance.wished'))),
        health: float(off('health')),
        alive: byteAt(off('alive')),
        moveScale: float(off('moveScale')),
        'root.y': rootH === null || posY === null ? null : posY + rootH,
        'matrix.y': chained(0x28, 0x34),
        'floor.y': float(0x404),
      });
    }
    const maskWhy = c.unwound ? `the tick call #${c.n} unwound ([ret-unwound]): no reading is its result`
      : !c.returned ? `the tick call #${c.n} has no [ret] row: it is not known to have returned`
        : c.actorChanged ? `the actor pointer changed before call #${c.n} (a restart?): the first frame on it is not compared` : null;
    frames.push({
      schema: 1, kind: 'frame', frame, masked,
      ...(maskWhy ? { maskWhy } : {}),
      pad: c.pad, fields,
    });
  });
  return {
    header: {
      schema: 1, kind: 'header', side: 'recomp', scenario: opts.scenario, fieldSet: opts.fieldSet, revision: opts.revision,
      mapHash: null, build: { ...(opts.build ?? {}) }, env: { ...(opts.env ?? {}) }, reference: referenceFor('recomp'),
    },
    frames,
  };
}

/** `recompEnv` as shell lines, single-quoted, for the owner's launch (`eval "$(... env ...)"`, or pasted). */
export function envLines(env: Readonly<Record<string, string>>): string[] {
  return Object.entries(env).map(([k, v]) => `export ${k}='${v.replace(/'/g, `'\\''`)}'`);
}

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * `env --scenario <json>`: the run's environment for the scenario's revision and field set.
 * `convert --log <path> --scenario <json> [--out <dir>]`: the run's log into `recomp.s2t` (default
 * `logs/harness/<scenario>/<stamp>/`, git-ignored), the environment it was given recorded in the header.
 */
export function main(argv: string[]): number {
  const args = [...argv];
  const sub = args.shift();
  const take = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    if (i < 0) return undefined;
    const v = args[i + 1];
    args.splice(i, 2);
    return v;
  };
  const scenarioPath = take('--scenario');
  const logPath = sub === 'convert' ? take('--log') : undefined;
  const out = sub === 'convert' ? take('--out') : undefined;
  const fi = args.indexOf('--force');
  const force = fi >= 0;
  if (force) args.splice(fi, 1);
  if (!scenarioPath || args.length > 0 || (sub !== 'env' && sub !== 'convert') || (sub === 'convert' && !logPath)) {
    console.error('usage: npx tsx tools/harness/recomp-trace.ts env --scenario <json>');
    console.error('       npx tsx tools/harness/recomp-trace.ts convert --log <run log> --scenario <json> [--out <dir>] [--force]');
    return 2;
  }
  let scenario: Scenario;
  try {
    scenario = parseScenario(readFileSync(scenarioPath, 'utf8'));
  } catch (e) {
    if (e instanceof ScenarioRefusal) { console.error(e.message); return 2; }
    throw e;
  }
  const revision = scenario.revision as Revision;
  try {
    const env = recompEnv(revision, scenario.fields);
    if (sub === 'env') { console.log(envLines(env).join('\n')); return 0; }
    const trace = parseRecompLog(readFileSync(logPath!, 'utf8'), { scenario: scenario.name, fieldSet: scenario.fields, revision, env });
    const dir = out ?? resolve(WEB, 'logs/harness', scenario.name, new Date().toISOString().replace(/[:.]/g, '-'));
    const file = resolve(dir, 'recomp.s2t');
    const refusal = outputRefusal(file);
    if (refusal) { console.error(refusal); return 2; }
    if (existsSync(file) && !force) { console.error(`${file} exists: pass --force to replace it`); return 2; }
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, formatTrace(trace));
    const masked = trace.frames.filter((f) => f.masked).length;
    console.log(`trace: ${file}`);
    console.log(`${trace.frames.length} frame(s), ${masked} masked; an emulated Unzipped recompilation, not a retail console`);
    return 0;
  } catch (e) {
    if (e instanceof SchemaRefusal) { console.error(e.message); return 2; }
    throw e;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
