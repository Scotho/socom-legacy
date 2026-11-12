import { describe, expect, it } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CollisionOwner, GridParams, SpawnSlot, WorldPoly } from '@s2u/scene';
import { FsAssetSource } from '@s2u/archive/node';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import {
  encodeCommands, fallDamageFraction, groundGrid, KNOCK_LANDING_SPEED_FACTOR, loadSimMap, MP_ARMOUR, MP_HEALTH, packGround, PROTOCOL_VERSION,
  probeLiftOf, type ServerEvent, type SimMap,
} from '../../viewer/src/sim';
import { PART } from '../../viewer/src/net/damage';
import { Room, type Conn } from '../src/room';

/**
 * Fall damage in the room (research 151; `FUN_005ac1f0` D:L464866-464960): the room runs every player's mover, so the
 * landing it measures -- its contact speed -- is the one quantity the fall's damage is read from, the same quantity the
 * page sounds the landing by. A landing over the light speed (170.70 a second: a 62-unit fall) takes `max x f` off
 * every part and tells the victim's page (`hurt`, the reaction's part 3 and cause 7: no flinch), one at or over the
 * deadly speed (237.49: 120 units) kills as a fall, and one under takes nothing and tells no one. The page sends nothing
 * for a fall: nothing it could forge. On a synthetic floor, as `roomBlast.test.ts`; and once on Frostfire's own ground
 * (the MP2 fixture), off a ledge found by scanning its collision for walkable edges over a 62-unit drop (research 151 §4).
 */

const FIXTURES = resolve(process.env.S2U_TEST_FIXTURES || resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures'));

const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
const FLOOR: WorldPoly = {
  modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
};

function map(): SimMap {
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
  const ground = packGround(PARAMS, [FLOOR], owners);
  const slot = (side: 0 | 1, index: number, x: number, z: number): SpawnSlot => ({
    side, index, position: [x, 0, z], onFloor: true, step: side === 0 ? 2 : 6, facing: side === 0 ? [1, 0] : [-1, 0], loc: { map: 0, x: 0, z: 0 },
  });
  const slots = [0, 1, 2, 3].flatMap((i) => [slot(0, i, -400, -200 + i * 50), slot(1, i, 400, -200 + i * 50)]);
  return { stem: 'MP99', name: 'FLAT', ground, grid: groundGrid(ground), spawns: null, slots, respawns: [], notes: [] };
}

class Client implements Conn {
  readonly events: ServerEvent[] = [];
  readonly frames: Uint8Array[] = [];
  send(frame: Uint8Array | string): void {
    if (typeof frame === 'string') this.events.push(JSON.parse(frame) as ServerEvent);
    else this.frames.push(frame);
  }
  close(): void { /* nothing */ }
  of<T extends ServerEvent['type']>(type: T): Extract<ServerEvent, { type: T }>[] {
    return this.events.filter((e) => e.type === type) as Extract<ServerEvent, { type: T }>[];
  }
}

/** Two players seated (a SEAL and a Terrorist: classic launches at once, the countdown off), stood on the floor. */
function setup(opts: ConstructorParameters<typeof Room>[2] = {}, m: SimMap = map()) {
  let now = 0, seed = 1;
  const room = new Room(m, null, { now: () => now, random: () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }, launchCountdownS: 0, ...opts });
  const join = (id: number): Client => {
    const c = new Client();
    room.hello(id, c, { type: 'hello', version: PROTOCOL_VERSION, name: `P${id}`, map: 'MP99' }, `10.0.0.${id}`);
    return c;
  };
  const a = join(1), b = join(2);
  /** Every player sends a command at rest -- `walking` holds its stick forward -- and the room steps, `n` times. */
  const settle = (n = 60, walking: number | null = null): void => {
    for (let i = 0; i < n; i++) {
      for (const id of [1, 2]) {
        const p = room.player(id);
        if (!p) continue;
        room.binary(id, encodeCommands({ viewTick: room.tick, commands: [{ seq: p.sim.seq + 1, forward: id === walking ? 1 : 0, right: 0, yaw: p.sim.walker.state.yaw, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 }] }));
      }
      room.step();
      now += 1000 / 60;
    }
  };
  settle(30);
  for (const c of [a, b]) c.events.length = 0;
  return { room, a, b, settle };
}

/** Lifts player `id` `height` over the floor and lets go: the room's mover falls as a walk-off does (`Walker.setAirborne`). */
function drop(room: Room, id: number, height: number): void {
  const w = room.player(id)!.sim.walker;
  w.state.y += height;
  w.setAirborne(true);
}

describe('a fall the room measures (research 151; FUN_005ac1f0 D:L464866-464960)', () => {
  it('a landing over the light speed takes max x f off every part and tells the victim\'s page with hurt, part 3 (BODY), no flinch', () => {
    const { room, a, b, settle } = setup();
    const p = room.player(1)!;
    expect(p.alive).toBe(true);
    // sqrt(2 x 235 x 85) = 199.9 a second, between the light and the heavy; the fall steps at the 30 Hz game frame
    // (PF-03, research 208), adding g x dt before it moves the height (`FUN_0059b440`): 25 frames cover 85.03, so the
    // contact is 25 x 235 x 525/15734 = 196.03 a second.
    drop(room, 1, 85);
    settle(90);
    const landing = p.sim.walker.landing!;
    expect(landing).not.toBeNull();
    expect(landing.cls).toBe(1);
    expect(landing.speed).toBeCloseTo(25 * 235 * (525 / 15734), 6);
    const f = fallDamageFraction(landing.speed);
    expect(f).toBeGreaterThan(0.37);                     // 0.379 at 196.03 (0.42-0.5 when the fall stepped at 60 Hz)
    expect(f).toBeLessThan(0.39);
    MP_HEALTH.forEach((max, i) => expect(p.health.hp[i], `part ${i}`).toBeCloseTo(max * (1 - f), 9));
    expect(p.health.armour).toEqual([...MP_ARMOUR]);
    expect(p.alive).toBe(true);
    const hurt = a.of('hurt');
    expect(hurt).toHaveLength(1);
    expect(hurt[0]!.part).toBe(PART.BODY);
    expect(hurt[0]!.health).toEqual(p.health.hp);
    const s = p.sim.walker.state;
    expect(hurt[0]!.from).toEqual([s.x, s.y, s.z]);
    expect(b.of('hurt')).toEqual([]);                    // another page never learns it
    expect(a.of('flinch')).toEqual([]);                  // cause 7: no flinch (FUN_005a54d0 L461402)
    expect(b.of('flinch')).toEqual([]);
    expect(a.of('kill')).toEqual([]);
  });

  // PF-10 fix round (B1): a fall's damage is a health drop as a round's is (`FUN_005a54d0(actor, 3, 7)` L464954 ->
  // `FUN_005477a0` -> `FUN_00597b00`): the hurt voice plays and the gate closes (`FUN_0053b710` D:L405268-405290). The
  // pages are told, the faller's own too: its page plays the hurt voice of its own type, and its landing adds none
  // (`GameAudio.onLand`; research 205 section 2.2).
  it('a landing that hurts and leaves the faller alive plays one hurt voice on every page (the faller too) and closes the gate', () => {
    const { room, a, b, settle } = setup();
    const p = room.player(1)!;
    drop(room, 1, 85);
    settle(90);
    expect(p.alive).toBe(true);
    expect(b.of('hurtVoice')).toEqual([{ type: 'hurtVoice', id: 1 }]);
    expect(a.of('hurtVoice')).toEqual([{ type: 'hurtVoice', id: 1 }]);
  });

  it('a landing under the light speed takes nothing and sends nothing', () => {
    const { room, a, settle } = setup();
    const p = room.player(1)!;
    drop(room, 1, 50);                                   // sqrt(2 x 235 x 50) = 153.3 a second: under 170.7
    settle(90);
    expect(p.sim.walker.landing).not.toBeNull();
    expect(p.sim.walker.landing!.cls).toBe(0);
    expect(p.health.hp).toEqual([...MP_HEALTH]);
    expect(a.of('hurt')).toEqual([]);
    expect(a.of('kill')).toEqual([]);
  });

  it('a landing at or over the deadly speed kills as a fall: every part 0, "%s falls to their death", a suicide\'s -2', () => {
    const { room, a, b, settle } = setup();
    const p = room.player(1)!;
    drop(room, 1, 130);                                  // sqrt(2 x 235 x 130) = 247.2 a second: over 237.5
    settle(120);
    expect(p.sim.walker.landing!.cls).toBe(3);
    expect(p.health.hp).toEqual([0, 0, 0, 0, 0, 0]);
    expect(p.alive).toBe(false);
    expect(p.score).toBe(-2);
    expect(a.of('hurt')).toHaveLength(1);
    expect(a.of('hurt')[0]!.health).toEqual([0, 0, 0, 0, 0, 0]);
    const kills = a.of('kill');
    expect(kills).toHaveLength(1);
    expect(kills[0]).toMatchObject({ killer: null, victim: 1, weapon: null, how: 'fall', cause: 7 });   // PF-10: a fall's cause
    expect(b.of('kill')).toHaveLength(1);
    // PF-10 (F2): a lethal landing plays no hurt voice -- FUN_005477a0's +0x54 runs only for a body left alive
    // (L412828-412838) -- but the death voice, its gate open (research 205 section 2.2).
    expect(a.of('hurtVoice')).toEqual([]);
    expect(b.of('hurtVoice')).toEqual([]);
    expect(kills[0]).toMatchObject({ voiced: true });
  });

  // FALL-DEATH-LAND (the owner's v0.4.18 report: "when players fall to their death their character just crouches where
  // they fell instead of being a dead body on the ground"). `FUN_005af590` runs the fall's damage `FUN_005ac1f0` FIRST
  // (D:L466656), whose `FUN_005a54d0(actor, 3, 7)` (D:L464954) kills a wounded body; the body's alive bit then clear,
  // the class is forced to 3 (D:L466658-466660), and class 3 pushes `Land forward` in the death state 8, no coin
  // (D:L466663-466664). So a wounded player killed by a light (62-91 units) or a heavy (91-120 units) drop lands as one
  // killed by a deadly drop: `Land forward`, held -- never `Jump land hard` or a hit, and never handed back to the ground.
  for (const [label, height, cls, left] of [['light (class 1)', 85, 1, 0.3], ['heavy (class 2)', 100, 2, 0.5]] as const) {
    it(`a wounded player killed by a ${label} drop lands in Land forward, held, and stays down (D:L466656-466664)`, () => {
      const { room, a, b, settle } = setup();
      const p = room.player(1)!;
      const w = p.sim.walker;
      p.health.hp = MP_HEALTH.map((m) => m * left);              // wounded: this drop's `max x f` takes the rest
      drop(room, 1, height);
      settle(90);
      const landing = w.landing!;
      expect(landing.cls).toBe(cls);                             // the speed's class: the landing's sound (D:L464896-464925)
      expect(fallDamageFraction(landing.speed)).toBeGreaterThan(left);
      expect(p.alive).toBe(false);
      expect(a.of('kill')).toHaveLength(1);
      expect(a.of('kill')[0]).toMatchObject({ victim: 1, how: 'fall', clip: null });   // no clip of its own: its landing is its pose
      expect(b.of('kill')).toHaveLength(1);
      expect(landing.clip).toBe('landDeath');                    // the class forced to 3 by the death (D:L466658-466660)
      expect(w.action?.name).toBe('landDeath');
      expect(w.action!.t).toBe(w.action!.seconds);               // held on its last key
      settle(120, 1);                                            // the stick held: nothing gets the corpse up
      expect(w.action?.name).toBe('landDeath');
      expect(w.action!.t).toBe(w.action!.seconds);
      expect(w.dead).toBe(true);
    });
  }

  it('one landing, one hurt: the ticks after the landing send nothing more, and a second fall is told again', () => {
    const { room, a, settle } = setup();
    const p = room.player(1)!;
    drop(room, 1, 80);
    settle(120);
    expect(a.of('hurt')).toHaveLength(1);
    const after = [...p.health.hp];
    drop(room, 1, 80);
    settle(120);
    expect(a.of('hurt')).toHaveLength(2);
    MP_HEALTH.forEach((max, i) => expect(p.health.hp[i]).toBeLessThan(after[i]!));
    expect(a.of('hurt')[1]!.health).toEqual(p.health.hp);
    expect(a.of('hurt')[1]!.health[PART.BODY]).toBeLessThan(after[PART.BODY]!);
    expect(a.of('hurt')[1]!.health[PART.BODY]).toBeGreaterThan(0);
    expect(p.alive).toBe(true);
    expect(sum(after) - sum(p.health.hp)).toBeGreaterThan(0);
  });

  it('a blast knock\'s landing is read at its speed x 1.2 (FUN_00580360 D:L441929): a 70-unit knock-down hurts as a 101-unit fall', () => {
    const { room, a, settle } = setup();
    const p = room.player(1)!;
    const w = p.sim.walker;
    w.state.y += 70;                                     // sqrt(2 x 235 x 70) = 181.4 a second; x 1.2 = 217.7
    expect(w.knock([0, 0, 0], 'fallForward')).toBe(true);
    settle(120);
    const landing = w.landing!;
    expect(landing.knocked).toBe(true);
    expect(landing.clip).toBe('landDeath');              // `Land forward`, the knock's landing clip (research 85 s12)
    const f = fallDamageFraction(landing.speed * KNOCK_LANDING_SPEED_FACTOR);
    expect(f).toBeGreaterThan(fallDamageFraction(landing.speed));
    expect(f).toBeGreaterThan(0.65);
    MP_HEALTH.forEach((m, i) => expect(p.health.hp[i], `part ${i}`).toBeCloseTo(m * (1 - f), 9));
    expect(a.of('hurt')).toHaveLength(1);
    expect(p.alive).toBe(true);
  });

  it('with the combat report on, the fall is reported to the faller alone: request fall, applied, the player its own attacker', () => {
    const { room, a, b, settle } = setup({ combatReport: true });
    const p = room.player(1)!;
    drop(room, 1, 90);
    settle(90);
    const reports = a.of('combat');
    expect(reports).toHaveLength(1);
    const r = reports[0]!;
    expect(r).toMatchObject({ request: 'fall', status: 'applied', reason: null, weapon: null, part: PART.BODY, killed: false, selfDamage: true, friendlyFire: false });
    expect(r.attacker).toEqual({ id: 1, team: p.team });
    expect(r.target).toEqual({ id: 1, team: p.team });
    expect(r.healthBefore).toEqual([...MP_HEALTH]);
    expect(r.healthAfter).toEqual(p.health.hp);
    expect(r.armourBefore).toEqual([...MP_ARMOUR]);
    expect(r.damageApplied).toBeCloseTo(MP_HEALTH.reduce((n, m) => n + m, 0) - p.health.hp.reduce((n, h) => n + h, 0), 9);
    expect(r.rawDamage).toBeCloseTo(r.damageApplied, 9);   // no armour in the step: the raw damage is what was taken
    expect(r.distance).toBeNull();
    expect(r.point).toEqual(a.of('hurt')[0]!.from);        // the feet at the landing (the hit clip's root motion moves them after)
    expect(r.point![1]).toBe(0);                           // on the floor
    expect(b.of('combat')).toEqual([]);
  });
});

describe('a fall on Frostfire (the MP2 fixture; research 151 §4)', () => {
  const MP2 = fixture('RUN/MP2.ZDB');
  // The ledge: the 202 level's west edge at x ~525, z 885-1065, over the 100 floor (a scan of the fixture's collision
  // for walkable edges over a 62-unit drop, 2026-10-03). A SEAL at (531, 202, 905) walking west leaves it at the 15th
  // tick and lands 102 lower at sqrt(2 x 235 x 102) = 219.0 (+ the tick's g x dt): class 2, between the heavy and the deadly.
  it.skipIf(!MP2)(`walking west off the 202 level at (531, 905) falls 102 onto the 100 floor: the room takes max x f and tells the page (${MP2 ? 'MP2' : FIXTURES_ABSENT})`, async () => {
    const m = await loadSimMap(new FsAssetSource(FIXTURES), 'RUN/MP2.ZDB');
    const { room, a, b, settle } = setup({}, m);
    const p = room.player(1)!;
    const w = p.sim.walker;
    expect(w.place(531, 202 + probeLiftOf('stand'), 905)).toBe(true);
    expect(w.state.y).toBe(202);
    w.state.yaw = 90;                                    // `Pose.yaw` faces (-sin yaw, -cos yaw): 90 degrees is -x, west
    settle(120, 1);
    expect(w.state.y).toBe(100);
    expect(w.state.x).toBeLessThan(525);
    const landing = w.landing!;
    expect(landing.cls).toBe(2);
    expect(landing.speed).toBeGreaterThan(219);
    expect(landing.speed).toBeLessThan(223);
    const f = fallDamageFraction(landing.speed);
    expect(f).toBeGreaterThan(0.72);
    expect(f).toBeLessThan(0.79);
    MP_HEALTH.forEach((max, i) => expect(p.health.hp[i], `part ${i}`).toBeCloseTo(max * (1 - f), 9));
    expect(p.alive).toBe(true);
    const hurt = a.of('hurt');
    expect(hurt).toHaveLength(1);
    expect(hurt[0]!.part).toBe(PART.BODY);
    expect(hurt[0]!.health).toEqual(p.health.hp);
    expect(hurt[0]!.from[1]).toBe(100);
    expect(b.of('hurt')).toEqual([]);
    expect(a.of('kill')).toEqual([]);
  });
});

function sum(hp: readonly number[]): number { return hp.reduce((n, h) => n + h, 0); }
