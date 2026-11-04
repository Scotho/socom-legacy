// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { InstancedMesh, Mesh, type Material } from 'three';
import { DEFAULT_GRID_PARAMS, type EffectOp, type EffectProgram } from '@s2u/scene';
import type { GsState } from '@s2u/gs';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { EffectRun, opacityTick, type EffectHost } from '../src/effectRunner';
import { WorldState } from '../src/worldState';
import { BASE_PULSE_JOIN_READING, BombPage, worldPulse } from '../src/bombPage';
import { bombPulses } from '../src/roundCues';
import { simMapFromBytes } from '../src/simMap';
import { BASE_PULSE_DRAW_READING, buildWorld } from '../src/world';
import type { LoadedMap, LoadedMesh } from '../src/loadMap';
import type { BombWire } from '../src/net/objective';
import type { ServerEvent, Team } from '../src/net/protocol';

/**
 * PB-9b (PARITY-2; research 284 s8 RED 2; ruling PB2.R5): the bases' pulse outlines on the page's world. The map's
 * `objectives` script (`bomb_pickup`) calls `pulse_terrorist` when a SEAL picks the bomb up (`bomb_owner` 1) and
 * `pulse_seal` for a Terrorist (2); `bomb_drop` stops both on `mp_bomb == 1` (research 284 s3, 213 s2.4). A pulse turns
 * its outline on and runs its opacity 0.2 -> 0.05 over 1 s and back over 0.2 s for ever (`FUN_0025f960` / `FUN_0025f880`,
 * D:L108804-108847); the stop runs its cleanup, which turns the outline off (`FUN_0026d870`, D:L118599). A plant, a defuse
 * and a detonation leave it; the round's reset hides it (`FUN_002232a0` D:L75851-75866). Presentation only: the
 * world's own state -- the wire's -- never carries it (`ROOM_SKIP_EFFECTS_READING`: the room runs nothing).
 */

const MP72 = fixture('RUN/MP72.ZDB');
const TERR = 'worldmodel/terrorist_base/crates_weapons=crates_weapons/terrorist_pulse';
const SEAL = 'worldmodel/seal_base/crates_hospital=crates_hospital/seal_pulse';

/** Research 284 s3's program, as `decodeEffectProgram` gives it on MP72 (`packages/scene/test/basePulse.test.ts`). */
const PULSE: EffectProgram = {
  name: 'pulse_terrorist', root: 1, flags: 0x32, nodes: ['NA', 'terrorist_base', 'terrorist_pulse'], cleanup: 1,
  sequences: [
    { name: 'NA', activation: 1, ops: [
      { op: 'active', node: 2, on: true }, { op: 'while', forever: true },
      { op: 'opacity', node: 2, from: 0.2, to: 0.05, rate: -0.15, seconds: 1 },
      { op: 'opacity', node: 2, from: 0.05, to: 0.2, rate: 0.75, seconds: 0.2 },
      { op: 'endWhile' },
    ] },
    { name: 'NA', activation: 2, ops: [{ op: 'active', node: 2, on: false }] },
  ],
};

/** A run on a host that logs the active commands and keeps the node's opacity. */
function hosted(program: EffectProgram): { run: EffectRun; log: string[]; opacity: () => number } {
  const log: string[] = [];
  let opacity = Number.NaN;
  const host: EffectHost = {
    random: () => 0.5,
    test: () => false,
    begin: (op: EffectOp) => {
      if (op.op === 'active') log.push(`${op.node} ${op.on ? 'on' : 'off'}`);
      if (op.op === 'opacity') return opacityTick(op, (f) => { opacity = f; });
      return undefined;
    },
  };
  return { run: new EffectRun(program, host), log, opacity: () => opacity };
}

describe('the run (`./effectRunner`): OBJECT_OPACITY_FROM_TO as FUN_0025f880 ticks it, and the cleanup sequence at the end', () => {
  it('from at the begin; rate x dt a tick; to when its time is spent, the rest of the tick carried to the next command', () => {
    const { run, opacity } = hosted(PULSE);
    run.update(0);
    expect(opacity()).toBeCloseTo(0.2, 6);
    run.update(0.5);
    expect(opacity()).toBeCloseTo(0.125, 6);
    run.update(0.5);
    expect(opacity()).toBeCloseTo(0.05, 6);
    run.update(0.2);                                   // the first's time spent (1.0 is not under 1.0), then 0.2 of the second
    expect(opacity()).toBeCloseTo(0.2, 6);
    run.update(0.1);                                   // the second done (0.2 under 0.3): `to`; END_WHILE ends the tick
    expect(opacity()).toBeCloseTo(0.2, 6);
    run.update(0.5);
    expect(opacity()).toBeCloseTo(0.125, 6);
    // One tick over the first command's end: 0.1 s of it carried into the second (0.05 + 0.75 x 0.1).
    const carried = hosted(PULSE);
    carried.run.update(0);
    carried.run.update(1.1);
    expect(carried.opacity()).toBeCloseTo(0.125, 6);
  });

  it('the cleanup sequence (Anim_Params\' fourth offset) never starts with the run; a stop runs it once (FUN_0026d870, D:L118599)', () => {
    const { run, log } = hosted(PULSE);
    run.update(0);
    for (let i = 0; i < 10; i++) run.update(0.25);
    expect(log).toEqual(['2 on']);
    expect(run.finished).toBe(false);
    run.stop();
    expect(log).toEqual(['2 on', '2 off']);
    expect(run.finished).toBe(true);
    run.stop();
    run.update(0.5);
    expect(log).toEqual(['2 on', '2 off']);
  });

  it('a run whose sequences all end runs its cleanup once at its end (FUN_0026ff20(5) from FUN_00270220)', () => {
    const once: EffectProgram = { ...PULSE, sequences: [
      { name: 'NA', activation: 1, ops: [{ op: 'active', node: 2, on: true }, { op: 'wait', seconds: 0.5, range: 0, frames: null }] },
      PULSE.sequences[1]!,
    ] };
    const { run, log } = hosted(once);
    run.update(0);
    expect(log).toEqual(['2 on']);
    expect(run.finished).toBe(false);
    run.update(0.5);
    expect(log).toEqual(['2 on', '2 off']);
    expect(run.finished).toBe(true);
    run.update(0.5);
    expect(log).toEqual(['2 on', '2 off']);
  });
});

/** The page's bomb on a world: the room's events through `emit`, the page a SEAL (id 2), id 3 a Terrorist. */
function page(world: WorldState): { emit: (ev: ServerEvent) => void; bomb: (b: Partial<BombWire>) => void; welcome: (objective: BombWire) => void } {
  const listeners = new Set<(ev: ServerEvent) => void>();
  const emit = (ev: ServerEvent): void => { for (const l of listeners) l(ev); };
  const team = (id: number): Team => (id === 3 ? 'terrorist' : 'seal');
  new BombPage({ on: (l) => { listeners.add(l); return () => listeners.delete(l); } }, {
    id: () => 2, team: () => 'seal', alive: () => true, feet: () => [0, 0, 0], actions: () => [],
    look: () => null, serverTick: () => 1000, teamOf: team,
  }, { pulse: worldPulse(() => world) });
  const base: BombWire = { state: 1, pos: [0, 0, 0], carrier: null, planter: null, plantingTeam: null, defuser: null, detonateTick: null, pickupAfterTick: 0 };
  const welcome = (objective: BombWire): void => emit({
    type: 'welcome', id: 2, version: 11, map: 'MP72', tick: 990, role: 'player', team: 'seal', queue: 0, name: 'S', players: [],
    rules: 'classic', round: 1, rounds: 11, ghost: false, env: { revision: 0, epoch: 1, states: [] }, epoch: 1, startTick: 900, objective,
  } as ServerEvent);
  return { emit, welcome, bomb: (b) => emit({ type: 'bomb', ...base, ...b } as ServerEvent) };
}

describe.skipIf(MP72 === null)(`MP72's page world: the pulse on the bomb's state${MP72 === null ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  const sim = MP72 ? simMapFromBytes(MP72, 'RUN/MP72.ZDB') : null;
  /** A page world on MP72's meta, its drawing and its opacities recorded (`WorldHooks.visible`, `.opacity`). */
  const world = (): { world: WorldState; drawn: Map<string, boolean>; alpha: Map<string, number> } => {
    const drawn = new Map<string, boolean>(), alpha = new Map<string, number>();
    const w = new WorldState(sim!.meta!, sim!.ground, sim!.grid, { visible: (p, on) => { drawn.set(p, on); }, opacity: (p, f) => { alpha.set(p, f); } });
    w.applyInitial();
    return { world: w, drawn, alpha };
  };

  it('the trigger is objectives\' own: bomb_pickup calls pulse_terrorist for bomb_owner 1 and pulse_seal for 2; bomb_drop stops both', () => {
    const { world: w } = world();
    expect(bombPulses(w.program('objectives')!.program)).toEqual({
      pickup: { seal: ['pulse_terrorist'], terrorist: ['pulse_seal'] }, drop: ['pulse_terrorist', 'pulse_seal'],
    });
    expect(sim!.meta!.instances.filter((i) => /_pulse$/.test(i.node)).map((i) => i.path).sort()).toEqual([SEAL, TERR]);
  });

  it('a SEAL pickup draws terrorist_pulse pulsing (0.2, 0.125, 0.05, 0.2 ...), seal_pulse off; a plant and a detonation keep it; the reset hides it', () => {
    const { world: w, drawn, alpha } = world();
    const p = page(w);
    expect([drawn.get(TERR), drawn.get(SEAL)]).toEqual([false, false]);   // zAnim's opening state (bit 31)
    p.welcome({ state: 1, pos: [0, 0, 0], carrier: null, planter: null, plantingTeam: null, defuser: null, detonateTick: null, pickupAfterTick: 0 });
    expect(drawn.get(TERR)).toBe(false);
    p.bomb({ state: 2, carrier: 2 });
    expect(drawn.get(TERR)).toBe(true);
    expect(drawn.get(SEAL)).toBe(false);
    expect(alpha.get(TERR)).toBeCloseTo(0.2, 6);
    expect(alpha.has(SEAL)).toBe(false);
    w.step(0.5);
    expect(alpha.get(TERR)).toBeCloseTo(0.125, 6);
    w.step(0.5);
    expect(alpha.get(TERR)).toBeCloseTo(0.05, 6);
    w.step(0.2);
    expect(alpha.get(TERR)).toBeCloseTo(0.2, 6);
    p.bomb({ state: 3, pos: [500, 14, 1500], planter: 2, plantingTeam: 'seal', detonateTick: 2800 });
    w.step(0.1);
    w.step(0.5);
    expect(drawn.get(TERR)).toBe(true);
    expect(alpha.get(TERR)).toBeCloseTo(0.125, 6);
    p.bomb({ state: 5, pos: [500, 14, 1500], planter: 2, plantingTeam: 'seal' });
    w.step(0.5);
    expect(drawn.get(TERR)).toBe(true);
    expect(alpha.get(TERR)).toBeCloseTo(0.05, 6);
    // Presentation only: the world's own state, the wire's, never holds the outline.
    expect(w.states().map((s) => s.path)).not.toContain(TERR);
    expect(w.isActive(TERR)).toBe(false);
    w.reset();
    expect(drawn.get(TERR)).toBe(false);
    const after = alpha.get(TERR);
    w.step(0.5);
    expect(alpha.get(TERR)).toBe(after);                                 // nothing runs after the reset
  });

  it('a Terrorist pickup draws seal_pulse; a drop puts it out; a defuse keeps the next one', () => {
    const { world: w, drawn, alpha } = world();
    const p = page(w);
    p.bomb({ state: 1 });
    p.bomb({ state: 2, carrier: 3 });
    expect([drawn.get(SEAL), drawn.get(TERR)]).toEqual([true, false]);
    expect(alpha.get(SEAL)).toBeCloseTo(0.2, 6);
    w.step(0.5);
    p.bomb({ state: 1, pos: [10, 0, 10] });
    expect(drawn.get(SEAL)).toBe(false);
    w.step(0.5);
    expect(alpha.get(SEAL)).toBeCloseTo(0.125, 6);                       // stopped: no further tick
    p.bomb({ state: 2, carrier: 2 });
    expect([drawn.get(TERR), drawn.get(SEAL)]).toEqual([true, false]);
    p.bomb({ state: 3, planter: 2, plantingTeam: 'seal', detonateTick: 2800 });
    p.bomb({ state: 4, planter: 2, plantingTeam: 'seal', defuser: 3 });
    expect(drawn.get(TERR)).toBe(true);
    // A carried bomb's new carrier with no state change (a takeover's rekey) is no pickup: nothing else lit.
    p.bomb({ state: 1 });
    p.bomb({ state: 2, carrier: 2 });
    p.bomb({ state: 2, carrier: 3 });
    expect([drawn.get(TERR), drawn.get(SEAL)]).toEqual([true, false]);
  });

  it('basePulse() (the hook\'s development read): the pulse running and its outline\'s opacity after a pickup; empty after a drop and a reset', () => {
    const { world: w } = world();
    const p = page(w);
    expect(w.basePulse()).toEqual({ running: [], opacity: {} });
    p.bomb({ state: 1 });
    p.bomb({ state: 2, carrier: 2 });                                    // a SEAL carries: the Terrorists' outline
    expect(w.basePulse().running).toEqual(['pulse_terrorist']);
    expect(Object.keys(w.basePulse().opacity)).toEqual([TERR]);
    expect(w.basePulse().opacity[TERR]).toBeCloseTo(0.2, 6);
    w.step(0.5);
    expect(w.basePulse().opacity[TERR]).toBeCloseTo(0.125, 6);
    p.bomb({ state: 1, pos: [10, 0, 10] });                               // the drop: both stopped, the outline off
    expect(w.basePulse()).toEqual({ running: [], opacity: {} });
    p.bomb({ state: 2, carrier: 3 });                                    // a Terrorist carries: the SEALs' outline
    expect(w.basePulse().running).toEqual(['pulse_seal']);
    expect(Object.keys(w.basePulse().opacity)).toEqual([SEAL]);
    p.bomb({ state: 3, planter: 3, plantingTeam: 'terrorist', detonateTick: 2800 });
    expect(w.basePulse().running).toEqual(['pulse_seal']);              // a plant leaves it
    w.reset();
    expect(w.basePulse()).toEqual({ running: [], opacity: {} });        // the round's reset stops it
  });

  it('BASE_PULSE_JOIN_READING: a welcome into a carried bomb lights the carrier\'s target as a pickup would; one into a planted bomb lights nothing', () => {
    expect(BASE_PULSE_JOIN_READING).toBe('welcome-carried');
    const carried = world();
    page(carried.world).welcome({ state: 2, pos: [0, 0, 0], carrier: 3, planter: null, plantingTeam: null, defuser: null, detonateTick: null, pickupAfterTick: 0 });
    expect([carried.drawn.get(SEAL), carried.drawn.get(TERR)]).toEqual([true, false]);
    const planted = world();
    page(planted.world).welcome({ state: 3, pos: [0, 0, 0], carrier: null, planter: 2, plantingTeam: 'seal', defuser: null, detonateTick: 2800, pickupAfterTick: 0 });
    expect([planted.drawn.get(SEAL), planted.drawn.get(TERR)]).toEqual([false, false]);
  });
});

/** A flat outline drawn apart at `path` with an additive ramp texture in the alpha pass (research 284 s1's draw). */
const outline = (path: string): LoadedMesh => ({
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]), uvs: new Float32Array(6), colors: new Float32Array(12).fill(1),
  normals: null, faceNormals: null, indices: new Uint32Array([0, 1, 2]), textureName: 'base_red.tif', fog: true, lit: false,
  order: 0, orderEnd: 0, cull: false, alternate: true, scroll: null, alphaPass: true, switchPath: path,
} as LoadedMesh);
const ADDITIVE = { blend: 'additive', alphaTest: null, depthTest: true, bilinear: true, mipmaps: false, levels: 0, wrapS: 'repeat', wrapT: 'repeat' } as unknown as GsState;
const synthetic = (): LoadedMap => ({
  archive: 'SYN', camera: null, path: 'SYN.ZDB', name: 'synthetic', world: [outline(TERR)], lines: null, props: [],
  textures: { 'base_red.tif': { data: new Uint8ClampedArray(16).fill(200), width: 2, height: 2 } },
  textureFlags: { 'base_red.tif': { bilinear: true, transparent: true, graded: true, opaque: false, gs: ADDITIVE } },
  metersPerUnit: 0.1, lightRig: null, origin: [0, 0, 0], detail: {}, grid: DEFAULT_GRID_PARAMS,
  collision: { positions: new Float32Array(0), colors: new Uint8Array(0), polygons: 0 },
  slots: [], diagnostics: [], loadMs: 0, timings: { fetch: 0, decode: 0, postedAt: 0 },
} as unknown as LoadedMap);

describe('WorldView.setNodeOpacity (BASE_PULSE_DRAW_READING): a node\'s opacity scales its draw at its texture\'s blend', () => {
  it('under 1 the placement draws with its material\'s faded twin -- additive, its alpha scaled -- and at 1 with its own', () => {
    expect(BASE_PULSE_DRAW_READING).toBe('alpha-times-opacity');
    const view = buildWorld(synthetic());
    for (const task of view.revealWorld) task();
    const mesh = view.group.children.find((c): c is Mesh => c instanceof Mesh && !(c instanceof InstancedMesh))!;
    const rest = mesh.material as Material;
    expect(view.setNodeActive(TERR, true)).toBe(1);
    expect(view.setNodeOpacity(TERR, 0.125)).toBe(1);
    const twin = mesh.material as Material;
    expect(twin).not.toBe(rest);
    expect([twin.blendSrc, twin.blendDst]).toEqual([rest.blendSrc, rest.blendDst]);   // the texture's own blend, additive
    expect(twin.depthWrite).toBe(false);
    expect(view.setNodeOpacity(TERR, 1)).toBe(1);
    expect(mesh.material).toBe(rest);
    expect(view.setNodeOpacity('worldmodel/nothing', 0.5)).toBe(0);
  });
});
