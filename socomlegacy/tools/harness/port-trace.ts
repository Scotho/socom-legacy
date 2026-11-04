/**
 * The browser client's headless recorder (plan PH-3, PH.R7).
 *
 *   npx tsx tools/harness/port-trace.ts --scenario tools/harness/scenarios/synthetic-walk.json
 *
 * Run it from `socomlegacy/`. It steps the same `Walker` the page steps, two ticks a game frame, and writes
 * `port.s2t`, `inputs.txt` and `manifest.json` under `socomlegacy/logs/harness/<scenario>/<stamp>/` (git-ignored).
 * No browser window and no disc are required for `synthetic-flat` and `synthetic-crate`. A disc map skips,
 * and says so, when the fixtures are absent. `walk-from-slot` is not run (H278).
 *
 * This trace is the port. It is not a retail console capture.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildGrid, type CollisionOwner, type GridParams, type WorldPoly } from '@s2u/scene';
import { FsAssetSource } from '@s2u/archive/node';
import { fixture, FIXTURES_ABSENT } from '../../packages/archive/test/fixtures';
import { readPortSample, type PortPad } from '../../packages/viewer/src/harness/portTrace';
import { GrenadeThrower } from '../../packages/viewer/src/grenade';
import { clipsFromPack, motionTableFromArchive } from '../../packages/viewer/src/motionTable';
import { moverSnapshot, TICK, Walker, type PlaySnapshot, type WalkInput } from '../../packages/viewer/src/mover';
import { loadMap } from '../../packages/viewer/src/loadMap';
import { groundGrid, groundPolygons } from '../../packages/viewer/src/walk';
import { Traversal, TRAVERSAL_CLIPS } from '../../packages/viewer/src/traversal';
import { outputRefusal } from '../outputRefusal';
import { PAD_PLACE, PAD_X } from './schema';
import { eventFires, formatPadLog, padAt, parseScenario, type PadState, type Scenario, ScenarioRefusal } from './scenario';
import { formatTrace, manifestOf, referenceFor, type Trace, type TraceFrame } from './trace';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export interface RunResult {
  /** Set when the scenario was not played. The process exits 0. */
  skipped?: string;
  /** Set when the scenario was played and did not meet its own script. The process exits 1. */
  error?: string;
  trace?: Trace;
  traceText?: string;
  inputsText?: string;
  outDir?: string;
}

function quad(pts: number[], ditype: number, appflags = 0): WorldPoly {
  return {
    modelName: 'worldmodel', path: 'worldmodel/q', region: 0, ditype, material: 25, ptcount: 4,
    cameratype: 0, appflags, points: Float32Array.from(pts),
  };
}

function floorPoly(x0: number, z0: number, x1: number, z1: number, y: number): WorldPoly {
  return quad([x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1], 3);
}

function scene(polys: WorldPoly[]): { walker: Walker; traversal: Traversal } {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 500, cellsX: 4, cellsZ: 4, originX: -1000, originZ: -1000 };
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1, flags: 0x1001 }));
  const grid = buildGrid(params, [], [], polys, owners);
  const walker = new Walker(grid);
  const traversal = new Traversal(grid, polys);
  walker.driver = traversal;
  return { walker, traversal };
}

/**
 * The synthetic crate in `climbInterrupt.parity.test.ts` (a 12-high box, appflags 4). No disc.
 * The grid is that test's: cellDim 100, origin -200. A coarser cell does not offer the climb prompt.
 */
function crateWorld(): { walker: Walker; traversal: Traversal } {
  const box = (x0: number, z0: number, x1: number, z1: number, h: number): WorldPoly[] => [
    quad([x0, 0, z1, x1, 0, z1, x1, h, z1, x0, h, z1], 2, 4),
    quad([x0, 0, z0, x1, 0, z0, x1, h, z0, x0, h, z0], 2, 4),
    quad([x0, 0, z0, x0, 0, z1, x0, h, z1, x0, h, z0], 2, 4),
    quad([x1, 0, z0, x1, 0, z1, x1, h, z1, x1, h, z0], 2, 4),
    floorPoly(x0, z0, x1, z1, h),
  ];
  const polys = [floorPoly(-100, -100, 100, 100, 0), ...box(-10, -30, 10, 0, 12)];
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  const grid = buildGrid(params, [], [], polys, owners);
  const walker = new Walker(grid);
  const traversal = new Traversal(grid, polys);
  walker.driver = traversal;
  return { walker, traversal };
}

function flatWorld(): { walker: Walker; traversal: Traversal } {
  return scene([floorPoly(-500, -500, 500, 500, 0)]);
}

function fixturesDir(): string {
  if (process.env.S2U_TEST_FIXTURES) return resolve(process.env.S2U_TEST_FIXTURES);
  const fixturesFile = fileURLToPath(new URL('../../packages/archive/test/fixtures.ts', import.meta.url));
  return resolve(dirname(fixturesFile), '../../../test-fixtures');
}

function portCommit(): string | null {
  try {
    const hash = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: resolve(WEB, '..'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return /^[0-9a-f]{40}$/.test(hash) ? hash : null;
  } catch {
    return null;
  }
}

function walkOf(pad: PadState): WalkInput {
  const axis = (n: number): number => Math.max(-1, Math.min(1, n));
  return { forward: axis((128 - pad.ly) / 128), right: axis((pad.lx - 128) / 128), boost: false };
}

async function openWorld(scenario: Scenario): Promise<{ walker: Walker; traversal: Traversal; mapHash: string | null } | { skipped: string }> {
  if (scenario.spawn.how === 'walk-from-slot') {
    return { skipped: 'walk-from-slot needs the slot-8 savestate (H278). This recorder teleports only.' };
  }
  if (scenario.map === 'synthetic-flat') return { ...flatWorld(), mapHash: null };
  if (scenario.map === 'synthetic-crate') return { ...crateWorld(), mapHash: null };
  const mapFile = `RUN/${scenario.map}.ZDB`;
  const mapBytes = fixture(mapFile);
  if (!mapBytes || !fixture('RUN/MOTION_P.ZAR')) return { skipped: `${FIXTURES_ABSENT} (${mapFile})` };
  // The plan's §2.2: the header names the map's hash -- the file read, so two traces of different discs never pair.
  const mapHash = `sha256:${createHash('sha256').update(mapBytes).digest('hex')}`;
  const map = await loadMap(new FsAssetSource(fixturesDir()), mapFile);
  if (!map.ground) return { skipped: `${scenario.map} has no ground in the fixture` };
  const grid = groundGrid(map.ground);
  const polys = groundPolygons(map.ground);
  const walker = new Walker(grid);
  const traversal = new Traversal(grid, polys);
  const pack = fixture('RUN/MOTION_P.ZAR');
  const readers = fixture('RUN/READERC.ZAR');
  if (pack) traversal.setClips(clipsFromPack(pack, [...TRAVERSAL_CLIPS]), readers ? motionTableFromArchive(readers) : null);
  walker.driver = traversal;
  return { walker, traversal, mapHash };
}

/** The thrower's view of the walker: the page's own snapshot (`moverSnapshot`, as `WalkMode.snapshot` makes it). */
function snapshotOf(walker: Walker, traversal: Traversal): PlaySnapshot {
  return moverSnapshot(walker, traversal, 0, 0);
}

function play(scenario: Scenario, walker: Walker, traversal: Traversal): { trace: Trace; inputs: PadState[]; error?: string } {
  if (!walker.place(scenario.spawn.x, scenario.spawn.y, scenario.spawn.z)) {
    return { trace: emptyTrace(scenario), inputs: [], error: `place failed at ${scenario.spawn.x}, ${scenario.spawn.y}, ${scenario.spawn.z}` };
  }
  walker.state.yaw = scenario.spawn.yaw;
  const fired: Record<string, number> = {};
  const inputs: PadState[] = [];
  const frames: TraceFrame[] = [];
  let feetYClimb: number | null = null;
  let prevB = 0;
  // PH-3: the grenade page, wired as the page wires it (`matchThrow.ts`): the place button is the kit's fire with the
  // Claymore up, and the thrower's `throwStart` holds its placing clip on the body. No disc records: the baked ones.
  const grenade = new GrenadeThrower({ grid: () => walker.grid, view: () => 'third', snapshot: () => snapshotOf(walker, traversal) });
  grenade.setKit([null, 'Claymore', null]);
  grenade.select('Claymore');
  grenade.on('throwStart', ({ hold }) => { walker.hold(hold); });
  const page = () => {
    const g = grenade.stats();
    return { placing: g.placing, timer: grenade.placingClock(), placed: g.placed };
  };
  const dt = 2 * TICK;
  for (let frame = 0; frame < scenario.stop.orFrames; frame++) {
    const before = readPortSample({
      walker, traversal, grenade: page(), pad: { b: prevB, lx: 128, ly: 128, rx: 128, ry: 128 },
      frame, tGuest: frame * dt, dt, feetYClimb,
    });
    for (const [name, expr] of Object.entries(scenario.events)) {
      if (fired[name] === undefined && eventFires(expr, before.signals)) fired[name] = frame;
    }
    if (scenario.stop.after !== undefined && fired[scenario.stop.after] !== undefined && fired[scenario.stop.after]! < frame) break;
    const pad = padAt(scenario, frame, fired);
    inputs.push(pad);
    const rising = (bit: number): boolean => (pad.b & bit) !== 0 && (prevB & bit) === 0;
    if (rising(PAD_X)) traversal.action();
    traversal.holdAction((pad.b & PAD_X) !== 0);
    if (rising(PAD_PLACE)) grenade.pull();
    const input = walkOf(pad);
    walker.tick(input);
    walker.tick(input);
    grenade.update(dt);
    prevB = pad.b;
    if (traversal.state().kind === 'climb') feetYClimb = walker.state.y;
    const sample = readPortSample({
      walker, traversal, grenade: page(), pad, frame, tGuest: frame * dt, dt, feetYClimb,
    });
    frames.push(toFrame(frame, pad, sample.fields, dt));
  }
  const missed = scenario.pad
    .map((k) => (typeof k.frame === 'string' ? /^([A-Za-z][A-Za-z0-9_]*)/.exec(k.frame)?.[1] : undefined))
    .filter((name): name is string => name !== undefined && fired[name] === undefined);
  const error = missed.length ? `event ${[...new Set(missed)].join(', ')} did not fire within ${scenario.stop.orFrames} frames` : undefined;
  return { trace: { header: header(scenario, null), frames }, inputs, ...(error ? { error } : {}) };
}

function emptyTrace(scenario: Scenario): Trace {
  return { header: header(scenario, null), frames: [] };
}

function header(scenario: Scenario, mapHash: string | null): Trace['header'] {
  const commit = portCommit();
  return {
    schema: 1, kind: 'header', side: 'port', scenario: scenario.name, fieldSet: scenario.fields,
    revision: scenario.revision, mapHash, build: { ...(commit ? { commit } : {}) },
    env: {
      recorder: 'headless',
      step: 'two mover ticks a frame',
      tick: String(TICK),
      frameHz: String(scenario.frameHz),
    },
    reference: referenceFor('port'),
  };
}

function toFrame(frame: number, pad: PortPad, fields: Record<string, number | string | null>, dt: number): TraceFrame {
  return {
    schema: 1, kind: 'frame', frame, masked: false, pad: { b: pad.b, lx: pad.lx, ly: pad.ly, rx: pad.rx, ry: pad.ry },
    fields: { ...fields, frame, dt, 'pad.b': pad.b, 'pad.lx': pad.lx, 'pad.ly': pad.ly, 'pad.rx': pad.rx, 'pad.ry': pad.ry },
  };
}

/** Plays one scenario on the headless client. Does not write unless `outDir` is set. */
export async function runScenario(scenario: Scenario, opt: { outDir?: string; scenarioText?: string } = {}): Promise<RunResult> {
  const opened = await openWorld(scenario);
  if ('skipped' in opened) return { skipped: opened.skipped };
  const played = play(scenario, opened.walker, opened.traversal);
  played.trace.header.mapHash = opened.mapHash;
  const traceText = formatTrace(played.trace);
  const inputsText = formatPadLog(scenario, played.inputs);
  const result: RunResult = { trace: played.trace, traceText, inputsText, ...(played.error ? { error: played.error } : {}) };
  if (!opt.outDir || played.trace.frames.length === 0) return result;
  const dir = resolve(opt.outDir);
  const refusal = outputRefusal(resolve(dir, 'port.s2t'));
  if (refusal) return { ...result, error: refusal };
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'port.s2t'), traceText);
  writeFileSync(resolve(dir, 'inputs.txt'), inputsText);
  const manifest = manifestOf({
    scenarioName: scenario.name,
    scenarioText: opt.scenarioText ?? JSON.stringify(scenario),
    traceText, traceFile: 'port.s2t', inputsFile: 'inputs.txt',
    portCommit: played.trace.header.build.commit ?? null,
    mapHash: opened.mapHash,
    note: 'headless browser client. Not a retail console capture.',
  });
  writeFileSync(resolve(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return { ...result, outDir: dir };
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function main(argv: string[]): Promise<number> {
  const args = [...argv];
  const take = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    if (i < 0) return undefined;
    const v = args[i + 1];
    args.splice(i, 2);
    return v;
  };
  const scenarioPath = take('--scenario');
  const out = take('--out');
  if (!scenarioPath || args.length > 0) {
    console.error('usage: npx tsx tools/harness/port-trace.ts --scenario <json> [--out <dir>]');
    console.error('from socomlegacy/: npx tsx tools/harness/port-trace.ts --scenario tools/harness/scenarios/synthetic-walk.json');
    return 2;
  }
  const scenarioText = readFileSync(scenarioPath, 'utf8');
  let scenario: Scenario;
  try {
    scenario = parseScenario(scenarioText);
  } catch (e) {
    if (e instanceof ScenarioRefusal) { console.error(e.message); return 2; }
    throw e;
  }
  const outDir = out ?? resolve(WEB, 'logs/harness', scenario.name, stamp());
  const result = await runScenario(scenario, { outDir, scenarioText });
  if (result.skipped) {
    console.log(`SKIP: ${result.skipped}`);
    return 0;
  }
  if (result.error) {
    console.error(result.error);
    return 1;
  }
  console.log(`trace: ${result.outDir}/port.s2t`);
  console.log(`inputs: ${result.outDir}/inputs.txt`);
  console.log(`${result.trace?.frames.length ?? 0} frame(s); headless browser client, not a retail console`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await main(process.argv.slice(2));
}
