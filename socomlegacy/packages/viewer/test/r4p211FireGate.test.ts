import { describe, expect, it } from 'vitest';
import { buildGrid, CLAYMORE, CLAYMORE_RULES, type CollisionOwner, type Grid, type GridParams, type WorldPoly } from '@s2u/scene';
import { groundGrid, packGround } from '../src/sim';
import { HOLD_CLIPS, holdFamily, Walker, type HoldClip, type TraversalHooks } from '../src/mover';
import { GrenadeThrower } from '../src/grenade';
import type { PlaySnapshot } from '../src/walk';
import { fireAllowed, fireCapability, type PlayingMotion } from '../src/net/fireCapability';

/**
 * R4P-211 (r0004 parity sprint plan; items R4-FIRE-GATE, R4B-08a; leads L48, L152, L368; reading, pending review): the
 * fire gate as r0004 asks it. Sources, cited from the plan and its reading (`docs/atlas/readings/r4p-phase2-reads-211.md`;
 * the r0004 export is not on this host):
 *
 * - `CZSealBody::CanFire` r0001 `FUN_005a7de0` / r0004 0x5adae0 (D4:L503662-503812): six traversal actions refuse
 *   outright, before the timing (D4:L503736-503751): Climb crate (0x2a), Climb medium, Stand -> Hang (0x21), Climb over,
 *   Step up, Stand -> Ladder (0x2c). The port plays each as a traversal clip (`TraversalHooks.clip`).
 * - The timing walks the top's leaves in order, each answer replacing the last, from 0: the last leaf decides and an
 *   empty top refuses (D4:L503765-503777, `FUN_0058fec0` D4:L487564-487582; r0001 D:L462695-462707).
 * - The placed-charge class 0x97 (`FUN_003d1e10` of the item's id, D:L462690-462691 -> `FUN_003d1a60`, ids 0x97-0xaa,
 *   D:L324345-324346, D:L324460-324465: C4, the satchel, the claymore, MPBOMB, the PMN; the port's `weaponCategory`)
 *   with the hand byte `+0xf79` at 4 refuses (D4:L503756-503766; the review's F1 of bbf2fc03d3).
 * - `IsThrowing(actor, 0)` (r0004 0x5ad9f0) holds the pistol peek right and left tosses (D4:L503648-503650,
 *   D4:L503688): the common gate's throw term no longer excuses the two lean tosses in the pistol hand; and since LATER
 *   1442 the pistol's standing throw plays the rifle's `Throw grenade`, the term too -- no pistol throw is excused (L368;
 *   `Walker.throwOnTop`; *was* the standing throw excused).
 * - `CZKit::HandleFireWeapon` r0001 0x5be9a0 / r0004 0x5c5550: the claymore's placing timer 1.3 s (D4:L517000-517071);
 *   a re-press inside it places once on the page (`GrenadeThrower.startPlacing` refuses while `placing`) -- a pin of the
 *   page's outcome (the claymore's own r0004 outcome is `R4_PLACE_NOFIRE_READING`, settled by capture C22).
 *
 * Every value here is a synthetic comparator input or the port's own clip names; the disc's NoFire values for these
 * clips are `R4_TRAVERSAL_NOFIRE_READING`'s, not asked here.
 */

const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
const FLOOR: WorldPoly = {
  modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-1000, 0, 1000, 1000, 0, 1000, 1000, 0, -1000, -1000, 0, -1000]),
};
const OWNERS: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
const GRID = groundGrid(packGround(PARAMS, [FLOOR], OWNERS));
const STILL = { forward: 0, right: 0, boost: false };

function standing(): Walker {
  const w = new Walker(GRID);
  w.place(0, 0, 0);
  for (let i = 0; i < 5; i++) w.tick(STILL);
  return w;
}

/** The six r0004 traversal actions as the port plays them, and the Seal anim set's pistol versions of three. */
const TRAVERSAL = ['seal_climbcrate', 'seal_climb_medium', 'seal_stand2hang', 'seal_climb_over', 'seal_step_up', 'seal_stand2ladder'];
const PISTOL_TRAVERSAL = ['seal_p_climbcrate', 'seal_p_climb_medium', 'seal_p_stand2hang', 'seal_p_stand2ladder'];

/** A table where every asked clip opens at once (NoFire 0): only a hard refusal can refuse. */
const OPEN = new Map<string, { noFire: number | null }>([...TRAVERSAL, ...PISTOL_TRAVERSAL, 'seal_stand'].map((c) => [c, { noFire: 0 }]));

const at = (clip: string, phase: number, reversed = false): PlayingMotion => ({ clip, phase, reversed });

/** A move holding the mover and playing `clip` in a state the gate takes (not a ladder or a hang state). */
function moving(clip: string): TraversalHooks {
  return { busy: () => true, clip: () => ({ clip, phase: 0.5, reversed: false, stateRefused: false }) } as unknown as TraversalHooks;
}

describe('R4P-211: the six r0004 traversal actions refuse a round outright (FUN_005a7de0 r0004 0x5adae0, D4:L503736-503751)', () => {
  it('each traversal clip refuses at phase 0.5 with no table and with NoFire 0; a neutral clip opens in the same case', () => {
    expect(fireAllowed(at('seal_stand', 0.5), null), 'the control, no table').toBe(true);
    expect(fireAllowed(at('seal_stand', 0.5), OPEN), 'the control, NoFire 0').toBe(true);
    for (const clip of [...TRAVERSAL, ...PISTOL_TRAVERSAL]) {
      expect(OPEN.get(clip)?.noFire, `${clip}: the open table holds it`).toBe(0);
      expect(fireAllowed(at(clip, 0.5), null), `${clip}: no table`).toBe(false);
      expect(fireAllowed(at(clip, 0.5), OPEN), `${clip}: NoFire 0`).toBe(false);
      expect(fireAllowed(at(clip, 0.9, true), OPEN), `${clip}: reversed`).toBe(false);
    }
  });

  it('on the mover: a move playing each traversal clip refuses the round through fireCapability, the page and the room alike', () => {
    for (const clip of TRAVERSAL) {
      const cap = fireCapability(standing(), moving(clip), false, null);
      expect(cap.motion?.clip, `${clip}: the move is what the gate reads`).toBe(clip);
      expect(cap.motion?.stateRefused, `${clip}: not the state refusal`).toBe(false);
      expect(cap.fire, clip).toBe(false);
    }
    const free = fireCapability(standing(), moving('seal_stand'), false, null);
    expect(free.motion?.clip).toBe('seal_stand');
    expect(free.fire, 'the control').toBe(true);
  });
});

describe('R4P-211: the top blend s last leaf decides (FUN_005a7de0 D:L462695-462707; r0004 D4:L503765-503777)', () => {
  const TABLE = new Map<string, { noFire: number | null }>([['leaf_a', { noFire: 0.8 }], ['leaf_b', { noFire: 0.2 }], ['leaf_open', { noFire: null }], ['leaf_bare', { noFire: 1 }]]);

  it('a blend whose last leaf allows at the phase allows, though an earlier leaf refuses; reversed order refuses', () => {
    const allow: PlayingMotion = { clip: 'leaf_a', phase: 0.5, reversed: false, leaves: [{ clip: 'leaf_a' }, { clip: 'leaf_b' }] };
    const refuse: PlayingMotion = { clip: 'leaf_b', phase: 0.5, reversed: false, leaves: [{ clip: 'leaf_b' }, { clip: 'leaf_a' }] };
    expect(fireAllowed(at('leaf_a', 0.5), TABLE), 'leaf a alone refuses at 0.5').toBe(false);
    expect(fireAllowed(at('leaf_b', 0.5), TABLE), 'leaf b alone allows at 0.5').toBe(true);
    expect(fireAllowed(allow, TABLE), 'a then b: b decides').toBe(true);
    expect(fireAllowed(refuse, TABLE), 'b then a: a decides').toBe(false);
  });

  it('the leaf s own NoFire stands over the table; a bare last leaf refuses after an open one, an open last leaf allows after a bare one', () => {
    expect(fireAllowed({ clip: 'x', phase: 0.5, reversed: false, leaves: [{ clip: 'p', noFire: 0.8 }, { clip: 'q', noFire: 0.2 }] }, null)).toBe(true);
    expect(fireAllowed({ clip: 'x', phase: 0.5, reversed: false, leaves: [{ clip: 'p', noFire: 0.2 }, { clip: 'q', noFire: 0.8 }] }, null)).toBe(false);
    expect(fireAllowed({ clip: 'x', phase: 0.5, reversed: false, leaves: [{ clip: 'leaf_open' }, { clip: 'leaf_bare' }] }, TABLE)).toBe(false);
    expect(fireAllowed({ clip: 'x', phase: 0.5, reversed: false, leaves: [{ clip: 'leaf_bare' }, { clip: 'leaf_open' }] }, TABLE)).toBe(true);
  });

  it('a top with no leaves refuses (the loop starts from 0); no top at all stays open', () => {
    expect(fireAllowed({ clip: 'x', phase: 0.5, reversed: false, leaves: [] }, TABLE)).toBe(false);
    expect(fireAllowed(null, TABLE)).toBe(true);
  });
});

describe('R4P-211: a placed charge (class 0x97) with the hand byte at 4 refuses (r0004 D4:L503756-503766)', () => {
  it('every id of class 0x97 in hand state 4 refuses with any motion or none; a grenade in hand state 4 and C4 in the rifle hand do not', () => {
    expect(fireAllowed(null, null, { itemId: 0x97, handByte: 4 }), 'C4, hand 4, no motion').toBe(false);
    for (const [id, name] of [[0x97, 'C4'], [0x98, 'the satchel'], [0x99, 'the claymore'], [0x9a, 'MPBOMB'], [0x9e, 'the PMN']] as const) {
      expect(fireAllowed(at('seal_stand', 0.5), OPEN, { itemId: id, handByte: 4 }), `${name}, hand 4`).toBe(false);
    }
    expect(fireAllowed(at('seal_stand', 0.5), OPEN, { itemId: 0x79, handByte: 4 }), 'the M67 (class 0x79), hand 4').toBe(true);
    expect(fireAllowed(at('seal_stand', 0.5), OPEN, { itemId: 0x97, handByte: 1 }), 'C4, the rifle hand').toBe(true);
    expect(fireAllowed(at('seal_stand', 0.5), OPEN, { itemId: 0x99, handByte: 2 }), 'the claymore, the pistol hand').toBe(true);
    expect(fireAllowed(at('seal_stand', 0.5), OPEN, null), 'no held item told').toBe(true);
  });
});

describe('R4P-211 (L368) and LATER 1442: the throw term holds every throw and toss, either hand (r0004 D4:L503648-503650, D4:L503688)', () => {
  const THROWS = (Object.keys(HOLD_CLIPS) as HoldClip[]).filter((c) => holdFamily(c) === 'throw');

  it('with the rifle every throw or toss hold is the gate s throw term', () => {
    expect(THROWS).toContain('seal_toss_rlean');
    expect(THROWS).toContain('seal_toss_llean');
    for (const clip of THROWS) {
      const w = standing();
      w.pistolHand = () => false;
      expect(w.hold(clip), clip).toBe(true);
      expect(w.holding?.clip, `${clip}: on top`).toBe(clip);
      expect(w.throwOnTop(false), clip).toBe(true);
      expect(w.gateTop(false), clip).toBe('throw');
    }
  });

  it('with the pistol every throw is the throw term: the peek tosses (R4P-211) and the standing throw (LATER 1442)', () => {
    for (const clip of THROWS) {
      const w = standing();
      w.pistolHand = () => true;
      expect(w.hold(clip), clip).toBe(true);
      expect(w.holding?.clip, `${clip}: on top`).toBe(clip);
      expect(w.throwOnTop(true), clip).toBe(true);
      expect(w.gateTop(true), clip).toBe('throw');
    }
  });
});

const snap = (over: Partial<PlaySnapshot> = {}): PlaySnapshot => ({
  feet: [100, 50, 200], yaw: 0, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: false, stance: 'stand',
  landing: null, jumps: 0, ...over,
} as PlaySnapshot);

function floor(): Grid {
  const f: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/f', region: 0, ditype: 3, material: 7, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-2000, 50, 2000, 2000, 50, 2000, 2000, 50, -2000, -2000, 50, -2000]),
  };
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 500, cellsX: 8, cellsZ: 8, originX: -2000, originZ: -2000 };
  return buildGrid(params, [], [], [f], [{ modelName: 'worldmodel', path: 'worldmodel/f0', first: 0, count: 1 }]);
}

function seal() {
  const map = floor();
  const g = new GrenadeThrower({
    grid: () => map, snapshot: () => snap(), view: () => 'third', handPoint: () => [102, 62, 192],
    aim: () => ({ eye: [100, 62, 200], far: [400, 62, 200] }), actors: () => [],
  });
  g.setRecords([CLAYMORE]);
  g.setKit(['Claymore', null, null]);
  const placed: string[] = [], refused: string[] = [];
  g.on('place', (e) => placed.push(e.item));
  g.on('refuse', (r) => refused.push(r.text));
  const run = (seconds: number): void => { for (let t = 0; t < seconds - 1e-9; t += 1 / 60) g.update(1 / 60); };
  return { g, placed, refused, run };
}

describe('R4P-211 (R4B-08a): a claymore re-pressed during its 1.3 s placing places once (HandleFireWeapon r0004 0x5c5550)', () => {
  for (const again of [0.3, 0.7, 1.1]) {
    it(`a re-press at ${again} s: the placing not restarted, one claymore down at 1.3 s, one spent`, () => {
      const s = seal();
      expect(s.g.select('Claymore')).toBe(true);
      const before = s.g.stats().left;
      s.g.pull();
      expect(s.g.stats().placing, 'the first press placing').toBe(true);
      expect(s.g.placingClock()).toBeCloseTo(CLAYMORE_RULES.placeSeconds, 6);   // +0x87c = 1.3 (0x3fa66666)
      s.run(again);
      const left = s.g.placingClock();
      expect(left, 'still placing at the re-press').not.toBeNull();
      expect(left!).toBeGreaterThan(0);
      s.g.release();
      s.g.pull();
      expect(s.g.placingClock(), 'the timer not rewritten').toBeCloseTo(left!, 6);
      expect(s.placed).toEqual([]);
      expect(s.refused).toEqual([]);
      s.run(CLAYMORE_RULES.placeSeconds - again + 0.1);
      expect(s.placed).toEqual(['Claymore']);
      expect(s.g.stats().placing).toBe(false);
      expect(s.g.stats().left).toBe(before - 1);
    });
  }
});
