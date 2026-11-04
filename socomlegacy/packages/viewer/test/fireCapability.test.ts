import { describe, expect, it } from 'vitest';
import type { CollisionOwner, GridParams, WorldPoly } from '@s2u/scene';
import { groundGrid, packGround } from '../src/sim';
import { readMotionTable, type MotionTable } from '../src/motionTable';
import { ACTION_CLIPS, HOLD_CLIPS, TICK, Walker, type TraversalHooks } from '../src/mover';
import { FLINCH_CLIPS } from '../src/net/deaths';
import { NOFIRE_STATE_READING, Traversal } from '../src/traversal';
import { GATE_MOTION_RECORDS } from './helpers/gateTable';
import { fireAllowed, fireCapability, motionOf, NOFIRE_LEAF_AGGREGATE_READING, type PlayingMotion } from '../src/net/fireCapability';

/**
 * PF-17 (research 194 A02, 218 s1; ruling PF.R36): the motion's `NoFire` and the fire's permission from the body's
 * playing motion. `FUN_005a7de0` (D:L462612-462705) answers for a firearm by the playing motion's phase against each leaf's
 * `+0x2c` through `FUN_0058a8c0` (D:L446897-446915): forward `phase > NoFire`, reversed `phase < 1 - NoFire`, both strict.
 *
 * The table is `motion.rdr`'s records as the file writes them (`./helpers/gateTable` `GATE_MOTION_RECORDS`),
 * carrying the values research 194 A02's table reads off the disc; `motionTable.test.ts` pins each against the tracked
 * fixture's `motion.rdr`. The flinches carry no `NoFire` (194 A02; pinned there too).
 */

const TABLE: MotionTable = readMotionTable(GATE_MOTION_RECORDS);

const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
const FLOOR: WorldPoly = {
  modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
};
const OWNERS: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
const GRID = groundGrid(packGround(PARAMS, [FLOOR], OWNERS));
const STILL = { forward: 0, right: 0, boost: false };

/** A walker standing on the flat floor, settled. */
function standing(stance: 'stand' | 'crouch' | 'prone' = 'stand'): Walker {
  const w = new Walker(GRID);
  w.place(0, 0, 0);
  w.stance = stance;
  for (let i = 0; i < 5; i++) w.tick(STILL);
  return w;
}

/** Each tick's motion and permission until the walker's action ends (or `max` ticks). */
function run(w: Walker, max = 240, moves: TraversalHooks | null = null): { motion: PlayingMotion | null; fire: boolean; action: string | null }[] {
  const out: { motion: PlayingMotion | null; fire: boolean; action: string | null }[] = [];
  for (let i = 0; i < max; i++) {
    w.tick(STILL);
    const c = fireCapability(w, moves, false, TABLE);
    out.push({ ...c, action: w.action?.name ?? w.holding?.clip ?? null });
    if (!w.action && !w.holding && !w.airborne) break;
  }
  return out;
}

const at = (clip: string, phase: number, reversed = false): PlayingMotion => ({ clip, phase, reversed });

describe('the fire permission from the playing motion (PF-17; research 194 A02, PF.R36)', () => {
  it('forward play fires strictly past NoFire: seal_crouch2prone at phase 0.8 refused, 0.8001 allowed; reverse play strictly under 1 - NoFire (FUN_005a7de0 L462695-462705)', () => {
    expect(TABLE.get('seal_crouch2prone')!.noFire).toBe(0.8);
    expect(fireAllowed(at('seal_crouch2prone', 0.8), TABLE)).toBe(false);
    expect(fireAllowed(at('seal_crouch2prone', 0.8001), TABLE)).toBe(true);
    expect(fireAllowed(at('seal_crouch2prone', 0.5), TABLE)).toBe(false);
    // reversed (prone -> crouch): the phase runs back from 1; fire only under 1 - 0.8, strict
    expect(fireAllowed(at('seal_crouch2prone', 0.2, true), TABLE)).toBe(false);
    expect(fireAllowed(at('seal_crouch2prone', 0.1999, true), TABLE)).toBe(true);
    expect(fireAllowed(at('seal_crouch2prone', 0.9, true), TABLE)).toBe(false);

    // On the mover: Crouch -> Prone's phase is the stack's (`t / (playback x (n-1)/n)`, as `NoInterrupt`'s through
    // FUN_00587c20 D:L445553-445570): the first tick allowed is the first past 0.8, the tick before it at or under.
    const c = ACTION_CLIPS.crouchToProne, period = c.playback * ((c.frames - 1) / c.frames);
    const w = standing('crouch');
    w.changeStance('prone');
    expect(w.action?.name).toBe('crouchToProne');
    const ticks = run(w);
    const first = ticks.findIndex((x) => x.fire);
    expect(first).toBeGreaterThan(0);
    expect(ticks[first]!.action).toBe('crouchToProne');
    expect(ticks[first]!.motion!.phase).toBeGreaterThan(0.8);
    expect(ticks[first - 1]!.motion!.phase).toBeLessThanOrEqual(0.8);
    expect(ticks[first]!.motion!.phase).toBeCloseTo(((first + 1) * TICK) / period, 9);
    expect(ticks.slice(0, first).every((x) => !x.fire && x.motion!.clip === 'seal_crouch2prone')).toBe(true);

    // Prone -> crouch plays it backwards: the phase from (n - 1) / n down (the port's `clipVelocity` convention: end -
    // run), fire once under 0.2 -- the first tick k with 32/33 - (k + 1) TICK / period < 0.2.
    const back = standing('prone');
    back.changeStance('crouch');
    expect(back.action).toMatchObject({ name: 'crouchToProne', reversed: true });
    const up = run(back);
    const open = up.findIndex((x) => x.fire);
    expect(up[open]!.motion).toMatchObject({ clip: 'seal_crouch2prone', reversed: true });
    expect(up[open]!.motion!.phase).toBeLessThan(0.2);
    expect(up[open - 1]!.motion!.phase).toBeGreaterThanOrEqual(0.2);
    const end = (c.frames - 1) / c.frames;
    expect(up[0]!.motion!.phase).toBeCloseTo(end - TICK / period, 9);
    expect(open).toBe(Math.floor(((end - 0.2) * period) / TICK));
  });

  it('bare NoFire refuses through phase 1: stand -> prone, the hang, the ladder slide, the claymore\'s placing never fire', () => {
    for (const clip of ['seal_stand2prone', 'seal_hang', 'seal_ladderslide', 'seal_place_claymore']) {
      expect(TABLE.get(clip)!.noFire, clip).toBe(1);
      for (let k = 0; k <= 20; k++) {
        expect(fireAllowed(at(clip, k / 20), TABLE), `${clip} ${k / 20}`).toBe(false);
        expect(fireAllowed(at(clip, k / 20, true), TABLE), `${clip} reversed ${k / 20}`).toBe(false);
      }
    }
    // On the mover: every tick of Stand -> Prone (the rifle's clip and the pistol's), and of the claymore's placing.
    const w = standing();
    w.changeStance('prone');
    const down = run(w);
    expect(down.filter((x) => x.action === 'standToProne').length).toBeGreaterThan(30);
    expect(down.filter((x) => x.action === 'standToProne').every((x) => !x.fire)).toBe(true);
    const p = standing();
    p.changeStance('prone');
    p.tick(STILL);
    expect(motionOf(p, null, true)!.clip).toBe('seal_p_stand2prone');
    expect(fireCapability(p, null, true, TABLE).fire).toBe(false);
    const placing = standing();
    expect(placing.hold('seal_place_claymore')).toBe(true);
    const h = HOLD_CLIPS.seal_place_claymore;
    const held = run(placing);
    expect(held.length).toBeGreaterThan(h.playback * 60 * 0.9);
    expect(held.filter((x) => x.action === 'seal_place_claymore').every((x) => !x.fire && x.motion!.clip === 'seal_place_claymore')).toBe(true);
    // The hang on the moves: its looped clip, and its state (4) refused whatever the clip (NOFIRE_STATE_READING).
    const t = new Traversal(GRID, []);
    (t as unknown as { kind_: string }).kind_ = 'hang';
    expect(t.clip()).toMatchObject({ clip: 'seal_hang', reversed: false, stateRefused: true });
    expect(NOFIRE_STATE_READING).toContain('hang');
    const hanging = standing();
    expect(fireCapability(hanging, t, false, TABLE)).toMatchObject({ fire: false, motion: { clip: 'seal_hang' } });
    expect(fireCapability(hanging, t, false, null).fire).toBe(false);          // no table: the state alone refuses
    // The ladder's "180" carries no NoFire; its state (5) refuses it.
    (t as unknown as { kind_: string }).kind_ = 'none';
    expect(t.clip()).toBeNull();
    const turn: TraversalHooks = Object.assign(Object.create(t) as Traversal, { busy: () => true, clip: () => ({ clip: 'seal_180', phase: 0.5, reversed: false, stateRefused: true }) });
    expect(fireAllowed(at('seal_180', 0.5), TABLE)).toBe(true);
    expect(fireCapability(hanging, turn, false, TABLE).fire).toBe(false);
  });

  it("the running jump's launch refuses to its phase 0.2 (0.2 x 2.4 x 24/25 = 0.461 s) and then fires; the standing jump and the soft landing are open throughout", () => {
    expect(TABLE.get('seal_runningjump_launch')!.noFire).toBe(0.2);
    // A run, then the jump at 15 a second or more: `Jump launch` (FUN_0057e1b0), its clip's NoFire 0.2.
    const w = standing();
    for (let i = 0; i < 90; i++) w.tick({ forward: 1, right: 0, boost: true });
    expect(w.jump()).toBe(true);
    expect(w.action?.name).toBe('launch');
    const c = ACTION_CLIPS.launch, period = c.playback * ((c.frames - 1) / c.frames);
    const ticks: { fire: boolean; phase: number; action: string | null; air: boolean }[] = [];
    for (let i = 0; i < 120 && (w.action?.name === 'launch' || w.airborne); i++) {
      w.tick({ forward: 1, right: 0, boost: true });
      const k = fireCapability(w, null, false, TABLE);
      ticks.push({ fire: k.fire, phase: k.motion?.phase ?? -1, action: w.action?.name ?? null, air: w.airborne });
    }
    const launch = ticks.filter((x) => x.action === 'launch');
    const open = launch.findIndex((x) => x.fire);
    expect(open).toBeGreaterThan(0);
    expect(launch.slice(0, open).every((x) => !x.fire && x.phase <= 0.2)).toBe(true);
    expect(launch[open]!.phase).toBeGreaterThan(0.2);
    expect(open).toBe(Math.floor((0.2 * period) / TICK));          // 0.461 s: tick 27 of the launch
    expect(launch.slice(open).every((x) => x.fire)).toBe(true);
    expect(launch.slice(0, open).some((x) => x.air)).toBe(true);    // refused while airborne too: the clip's, not the air's
    // The pistol's launch: its own clip, the same 0.2.
    const p = standing();
    for (let i = 0; i < 90; i++) p.tick({ forward: 1, right: 0, boost: true });
    expect(p.jump()).toBe(true);
    p.tick({ forward: 1, right: 0, boost: true });
    expect(fireCapability(p, null, true, TABLE)).toMatchObject({ fire: false, motion: { clip: 'seal_p_runningjump_launch' } });
    // The standing jump and the soft landing: every tick open.
    const j = standing();
    expect(j.jump()).toBe(true);
    expect(run(j).every((x) => x.fire)).toBe(true);
    const soft = standing();
    soft.state.y = 6;
    soft.setAirborne(true);
    const s = run(soft);
    expect(s.filter((x) => x.action === 'land').length).toBeGreaterThan(10);
    expect(s.every((x) => x.fire)).toBe(true);
  });

  it('seal_land_hard locks the fire to phase 0.3 only, not the clip; the jump, the soft landing and the six short flinches never lock it (no blanket airborne or action rule)', () => {
    expect(NOFIRE_LEAF_AGGREGATE_READING).toBe('top');
    // The hard landing: refused at and under 0.3, then open while the clip still plays.
    expect([0, 0.3, 0.30001, 0.9].map((ph) => fireAllowed(at('seal_land_hard', ph), TABLE))).toEqual([false, false, true, true]);
    const hard = standing();
    hard.state.y = 40;
    hard.setAirborne(true);
    const fall = run(hard);
    expect(fall.filter((x) => x.action === null || x.action === 'fall').every((x) => x.fire)).toBe(true);   // in the air: open
    const landing = fall.filter((x) => x.action === 'landHard');
    expect(landing.length).toBeGreaterThan(20);
    const opens = landing.findIndex((x) => x.fire);
    expect(landing[opens]!.motion!.phase).toBeGreaterThan(0.3);
    expect(landing.slice(0, opens).every((x) => !x.fire && x.motion!.phase <= 0.3)).toBe(true);
    expect(landing.slice(opens).every((x) => x.fire)).toBe(true);

    // The standing jump: its whole clip open.
    const jumper = standing();
    expect(jumper.jump()).toBe(true);
    const jump = run(jumper);
    expect(jump.filter((x) => x.action === 'jump').length).toBeGreaterThan(30);
    expect(jump.every((x) => x.fire)).toBe(true);
    // The soft landing: a short drop with the stick at rest -- open throughout, in the air and on the clip.
    const soft = standing();
    soft.state.y = 6;
    soft.setAirborne(true);
    const s = run(soft);
    expect(s.some((x) => x.action === 'land')).toBe(true);
    expect(s.every((x) => x.fire)).toBe(true);
    // The six short multiplayer flinches carry no NoFire: open at every phase, either way.
    expect(FLINCH_CLIPS).toHaveLength(6);
    for (const clip of FLINCH_CLIPS) {
      expect(TABLE.get(clip)!.noFire, clip).toBeNull();
      for (let k = 0; k <= 10; k++) expect(fireAllowed(at(clip, k / 10), TABLE) && fireAllowed(at(clip, k / 10, true), TABLE), clip).toBe(true);
    }
    // No motion, or no table: nothing refuses.
    expect(fireAllowed(null, TABLE)).toBe(true);
    expect(fireAllowed(at('seal_stand2prone', 0.5), null)).toBe(true);
  });
});
