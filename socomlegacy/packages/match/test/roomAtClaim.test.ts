import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CollisionOwner, GridParams, SpawnSlot, WeaponRecord, WorldPoly } from '@s2u/scene';
import { Accuracy, depthRatio, fireInterval, perturb } from '../../viewer/src/accuracy';
import {
  Button, cameraLook, encodeCommands, EYE_HEIGHT, faceToward, groundGrid, packGround, PROTOCOL_VERSION, ringFor, ShotCone, TICK_HZ,
  type ClientEvent, type Command, type ServerEvent, type SimMap,
} from '../../viewer/src/sim';
import { AT_BODY_REACH_ADAPTATION, AT_SLACK_ADAPTATION, pointSegment } from '../../viewer/src/net/shotCone';
import { placeholderVolumes, type BoneBox, type StanceVolumes } from '../../viewer/src/net/hitVolumes';
import { HOSTAGE_ID_BASE } from '../src/extraction';
import { Room, type Conn } from '../src/room';

/**
 * LATER 1141 (way (a), protocol 19; research 441; reading, pending review): the room takes a round's aim point `at`.
 * The page rolls its cone at the firepoint about the line `from` -> `at` (`FUN_005aa6e0`, `FUN_00592260`), the offsets
 * x 1 / f and the climb's cap x f (`FUN_005bd100`, `FUN_005c3360`), f the depth ratio (`depthRatio`); it sends `aim` as
 * the bare look and `at` the point on it. The room works out the same f from the claim and judges the round in that
 * cone, and blooms it at f; what it checks of `at` is a browser adaptation (`AT_SLACK_ADAPTATION`). The harness is
 * ROOM-HAND's (`roomHandCone.test.ts`, LATER 326's before it): the page's `Accuracy`, one ordered socket.
 */

const PIN = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../scene/test/golden/weapon-records.json'), 'utf8')) as { records: Record<string, WeaponRecord> };
const byName = (name: string): WeaponRecord => Object.values(PIN.records).find((w) => w.name === name)!;
const M4A1 = byName('M4A1'), DE = PIN.records['7']!;
type V3 = [number, number, number];
type Fire = Extract<ClientEvent, { type: 'fire' }>;
const TICK_MS = 1000 / TICK_HZ;
const unitV = (a: readonly number[]): V3 => { const l = Math.hypot(a[0]!, a[1]!, a[2]!); return [a[0]! / l, a[1]! / l, a[2]! / l]; };
const STILL = { stance: 'stand' as const, rawStance: 'stand' as const, velocity: [0, 0, 0] as V3, airborne: false, yawRate: 0, pitchRate: 0, zoomState: 0, sticks: { forward: 0, right: 0, turn: 0, pitch: 0 } };

function flatMap(): SimMap {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
  const floor: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-1000, 0, 1000, 1000, 0, 1000, 1000, 0, -1000, -1000, 0, -1000]),
  };
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
  const ground = packGround(params, [floor], owners);
  const slot = (side: 0 | 1, index: number, x: number, z: number): SpawnSlot => ({
    side, index, position: [x, 0, z], onFloor: true, step: side === 0 ? 2 : 6, facing: side === 0 ? [1, 0] : [-1, 0], loc: { map: 0, x: 0, z: 0 },
  });
  const slots = [0, 1, 2, 3, 4, 5, 6, 7].flatMap((i) => [slot(0, i, -400, -200 + i * 50), slot(1, i, 400, -200 + i * 50)]);
  const respawns = [0, 1, 2].flatMap((i) => [slot(0, i, -600, -500 + i * 500), slot(1, i, 600, -500 + i * 500)]);
  return { stem: 'MP99', name: 'FLAT', ground, grid: groundGrid(ground), spawns: null, slots, respawns, notes: [] };
}

class Client implements Conn {
  readonly events: ServerEvent[] = [];
  send(frame: Uint8Array | string): void { if (typeof frame === 'string') this.events.push(JSON.parse(frame) as ServerEvent); }
  close(): void { /* not used */ }
}

/**
 * Two held pulls of the M4A1 standing still, each round's claim made by `claim` from the page's cone and the camera's
 * look at the warm-up; returns each judged round's outcome, and the room's and the page's knock after.
 */
type Base = { eye: V3; look: V3; from: V3 };
function shots(claim: (c: { eye: V3; look: V3; from: V3; kit: Accuracy }) => { at: V3 | null; aim: V3; dir: V3; depth?: number | null }, rounds = 6, times?: number[], o: { q?: V3; target?: V3; onBase?: (room: Room, base: Base) => void; killQAt?: number; lag?: number } = {}) {
  let now = 0, s = 1;
  const room = new Room(flatMap(), null, { now: () => now, random: () => { s = (s * 16807) % 2147483647; return s / 2147483647; }, launchCountdownS: 0 }, null, null);
  for (const id of [1, 2]) room.hello(id, new Client(), { type: 'hello', version: PROTOCOL_VERSION, name: '', map: 'MP99' }, `10.0.0.${id}`);
  room.step();
  const p = room.player(1)!, q = room.player(2)!;
  const P = p as unknown as { records: [WeaponRecord, WeaponRecord]; cone: ShotCone; mags: { rounds(): number }[] };
  P.records = [M4A1, DE]; P.cone = new ShotCone(M4A1); P.mags = [ringFor(M4A1), ringFor(DE)];
  // q on the look (the shooter faces +z): the honest burst's `at` stands on q's body, which the room knows (F2).
  p.sim.walker.place(0, 20, 0); q.sim.walker.place(...(o.q ?? [0, 20, 32]));
  const R = room as unknown as { fire: (pp: unknown, ev: Fire) => void };
  const orig = R.fire.bind(room);
  const outs: string[] = [];
  R.fire = (pp: unknown, ev: Fire): void => { room.takeDrops(); orig(pp, ev); const d = room.takeDrops(); outs.push(d ? Object.keys(d).join('+') : 'fired'); };
  const kit = new Accuracy(M4A1);
  const target: V3 = o.target ?? [0, 12, 300];
  let look = { yaw: 0, pitch: 0 }, seq = p.sim.seq, base: { eye: V3; look: V3; from: V3 } | null = null;
  const history: Command[] = [];
  let knocks: { room: number; page: number } | null = null;
  const warm = 120, gap = Math.ceil(M4A1.fireWait * TICK_HZ) + 2;
  const at = times ? times.map((t) => warm + t) : Array.from({ length: rounds }, (_, i) => warm + i * gap);
  for (let t = 0; t < at[at.length - 1]! + 20; t++) {
    if (t === 2) {
      const st = p.sim.walker.state;
      look = faceToward({ feet: [st.x, st.y, st.z], posture: p.sim.walker.posture }, target);
      p.sim.allowSnap();
    }
    if (t === warm - 4 && !base) {
      const f = p.cone.frame(p.sim.seq);
      if (f) { const c = cameraLook(f); base = { eye: c.eye as V3, look: c.look as V3, from: [f.feet[0] + 2, f.feet[1] + EYE_HEIGHT - 4, f.feet[2] + 9] }; o.onBase?.(room, base); }
    }
    if (o.killQAt !== undefined && t === o.killQAt) (q as unknown as { alive: boolean }).alive = false;   // killed in the room
    if (t === warm) kit.trigger();
    kit.update(1 / 60, STILL);
    const triggerOn = t >= warm;
    const cmd: Command = { seq: ++seq, forward: 0, right: 0, ...look, turn: 0, buttons: triggerOn ? Button.Trigger : 0, stance: 0, weapon: 0 };
    history.push(cmd);
    room.binary(1, encodeCommands({ viewTick: room.tick, commands: history.slice(-3) }));
    if (base && at.includes(t)) {
      const c = claim({ ...base, kit });
      kit.round(0, 'stand', undefined, c.depth);
      const ev = { type: 'fire', seq, from: base.from, dir: c.dir, eye: base.eye, aim: c.aim, weapon: 0, ...(c.at ? { at: c.at } : {}) } as const;
      room.text(1, { ...ev, viewTick: room.tick - (o.lag ?? 0) } as Fire);   // the page's playout clock, `lag` ticks behind
    }
    now += TICK_MS;
    room.step();
    // The knocks two commands after the last round (the room decides it once the command after has run): before the
    // return takes both to rest.
    if (t === at[at.length - 1]! + 2) knocks = { room: p.cone.state().offset[1], page: kit.state().offset[1] };
  }
  (room as unknown as { extraction: unknown }).extraction = null;   // a hostage stand-in out before the pages leave
  return { outs, roomKnock: knocks?.room ?? NaN, pageKnock: knocks?.page ?? NaN, roomBurst: p.cone.state().burst, pageBurst: kit.state().burst };
}

/** The honest page's 19 round: `at` `t` along the bare look, its cone at the corner (kx, ky) about from -> at, x 1 / f. */
const honest = (t: number, kx: number, ky: number) => ({ eye, look, from, kit }: { eye: V3; look: V3; from: V3; kit: Accuracy }) => {
  const at: V3 = [eye[0] + look[0] * t, eye[1] + look[1] * t, eye[2] + look[2] * t];
  const f = depthRatio(eye, look, at, from);
  const c = kit.cone(0, 1, f);
  const dir = unitV(perturb(unitV([at[0] - from[0], at[1] - from[1], at[2] - from[2]]), { offsetX: c.offsetX + c.radius * kx, offsetY: c.offsetY + c.radius * ky, radius: 0 }));
  return { at, aim: look, dir, depth: f };
};

describe('LATER 1141: the room takes the round\'s aim point `at` (protocol 19)', () => {
  it('an honest held burst at 60 u, each round at a corner of the cone about from -> at, is taken; the room\'s knock is the page\'s (cap x f)', () => {
    let i = 0;
    const corners: [number, number][] = [[1, 1], [-1, -1], [1, -1], [-1, 1], [0, 0], [0.9, -0.9]];
    const got = shots((c) => { const [kx, ky] = corners[i++ % corners.length]!; return honest(60, kx, ky)(c); });
    expect(got.outs).toEqual(['fired', 'fired', 'fired', 'fired', 'fired', 'fired']);
    expect(got.roomKnock).toBeCloseTo(got.pageKnock, 1);
  });

  it('a forged `at` off the bare look is refused `fire: cone: at`', () => {
    const got = shots((c) => {
      const h = honest(60, 0, 0)(c);
      const at: V3 = [h.at![0] + AT_SLACK_ADAPTATION * 10, h.at![1], h.at![2]];
      return { ...h, at, dir: unitV([at[0] - c.from[0], at[1] - c.from[1], at[2] - c.from[2]]) };
    }, 1);
    expect(got.outs[0]).toMatch(/cone: at/);
  });

  it('a round with no `at` (the eye\'s own, from the eye) is judged as before 19', () => {
    const got = shots(({ look }) => ({ at: null, aim: look, dir: look }), 1);
    // From the muzzle stand-in down the bare look with no `at`: the old rule's bind (the segment is not on the eye's ray).
    expect(got.outs[0]).toMatch(/cone: bind|fired/);
  });

  it('the re-review finding 1 (F3): a round refused one tick inside the cycle is bloomed at its own f, the room knock the page knock', () => {
    const cycle = Math.min(...M4A1.fireModes.filter((m) => m > 0).map((m) => fireInterval(M4A1.fireWait, m)), M4A1.fireWait) * TICK_HZ - 1;
    const gap = Math.ceil(M4A1.fireWait * TICK_HZ) + 2, near = Math.ceil(cycle) - 1;
    const times = [...Array.from({ length: 9 }, (_, i) => i * gap), 8 * gap + near];   // the climb past the cap x f first
    const got = shots((c) => honest(60, 0, 0)(c), 0, times);
    expect(got.outs.slice(0, 9).every((o) => o === 'fired')).toBe(true);
    expect(got.outs[9]).toMatch(/rate/);
    expect(got.roomBurst).toBe(got.pageBurst);                      // the refused round was bloomed (REFUSED_ROUND_CONE_ADAPTATION)
    expect(got.roomKnock).toBeCloseTo(got.pageKnock, 1);            // ... at its f: the cap x f, as the page's
  });

  it('F2 (the controller): a hostage vouches for a near `at` in open air as a player does -- within the reach taken, past it clamped', () => {
    const run = (gap: number) => shots((c) => honest(60, 0, 0)(c), 1, undefined, {
      q: [300, 20, -300],                                            // the other player off the look: only the hostage near
      onBase: (room, base) => {
        const at: V3 = [base.eye[0] + base.look[0] * 60, base.eye[1] + base.look[1] * 60, base.eye[2] + base.look[2] * 60];
        let x = at[0];
        const near = (fx: number): number => Math.min(...placeholderVolumes([fx, 0, at[2]], 0, 'stand').map((cap) => pointSegment(at, cap.a, cap.b) - cap.r));
        while (near(x) < gap) x += 0.01;
        const pose = { tick: room.tick, feet: [x, 0, at[2]] as V3, yaw: 0, posture: 'stand' as const, alive: true, tilt: null };
        // The stand-in of `rewindOutcome.test.ts`, its other calls a step makes (`remember`, ...) answered with nothing.
        const stand: Record<string | symbol, unknown> = { hostages: [{ id: HOSTAGE_ID_BASE + 1, character: 0, history: [pose] }], targetable: () => true };
        (room as unknown as { extraction: unknown }).extraction = new Proxy(stand, { get: (t, k) => (k in t ? t[k] : () => undefined) });
      },
    });
    expect(run(AT_BODY_REACH_ADAPTATION - 0.5).outs).toEqual(['fired']);
    expect(run(AT_BODY_REACH_ADAPTATION + 0.5).outs[0]).toMatch(/cone/);
  });

  it('the full review M1: a body killed in the room inside the page view lag still vouches -- the bodies as they stood at the rewound tick', () => {
    // The page draws q alive for RTT/2 + the interpolation delay after the room kills it; its round names that view
    // (`viewTick`, here 9 ticks = 150 ms behind). q killed 2 ticks before the second round: at the rewound tick q stood alive.
    const gap = Math.ceil(M4A1.fireWait * TICK_HZ) + 2;
    let i = 0;
    const corners: [number, number][] = [[1, 1], [-1, -1]];
    const lagged = shots((c) => { const [kx, ky] = corners[i++]!; return honest(60, kx, ky)(c); }, 2, [0, gap], { killQAt: 120 + gap - 2, lag: 9 });
    expect(lagged.outs).toEqual(['fired', 'fired']);
    expect(lagged.roomBurst).toBe(lagged.pageBurst);
    // A body already dead at the rewound tick (no lag: the page draws the corpse too) vouches for nothing: clamped, refused.
    i = 0;
    const seen = shots((c) => { const [kx, ky] = corners[i++]!; return honest(60, kx, ky)(c); }, 2, [0, gap], { killQAt: 120 + gap - 2, lag: 0 });
    expect(seen.outs).toEqual(['fired', 'fire: cone: cone'].map((x) => x));
  });

  it('S-1 (a) in the room (the delta re-read finding 3): q vouches on ITS OWN volumes at the rewound tick -- an arm box reaching the `at`, q 25 u off -- taken; on capsules alone, clamped', () => {
    // A stand-in skeleton for q alone (id 2; the shooter's own set empty): one extended arm box whose centre is the honest
    // `at`, placed in q's body frame (`rayBoneBox`'s inverse); q stands 25 u to the side, out of its capsules' reach.
    const run = (withBoxes: boolean): string[] => {
      let i = 0;
      const corners: [number, number][] = [[1, 1], [-1, -1]];
      return shots((c) => { const [kx, ky] = corners[i++]!; return honest(60, kx, ky)(c); }, 2, undefined, {
        onBase: (room, base) => {
          const at: V3 = [base.eye[0] + base.look[0] * 60, base.eye[1] + base.look[1] * 60, base.eye[2] + base.look[2] * 60];
          const q = room.player(2)!;
          q.sim.walker.place(at[0] + 25, 20, at[2]);
          const st = q.sim.walker.state, r = (st.yaw * Math.PI) / 180, cs = Math.cos(r), sn = Math.sin(r);
          const ex = at[0] - st.x, ez = at[2] - st.z;
          const local: V3 = [ex * cs - ez * sn, at[1] - st.y, ex * sn + ez * cs];
          expect(Math.min(...placeholderVolumes([st.x, st.y, st.z], st.yaw, 'stand').map((cap) => pointSegment(at, cap.a, cap.b) - cap.r))).toBeGreaterThan(AT_BODY_REACH_ADAPTATION);
          if (!withBoxes) return;
          const arm: BoneBox = { part: 5, bone: 0, box: Float32Array.from([-1, -1, -1, 1, 1, 1]), w: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, local[0], local[1], local[2], 1] };
          const set = (b: BoneBox[]): StanceVolumes => ({ stand: b, crouch: b, prone: b });
          const R = room as unknown as { volumesOf: (who: { id?: number }) => StanceVolumes | null };
          R.volumesOf = (who) => (who.id === 2 ? set([arm]) : set([]));
        },
      }).outs;
    };
    expect(run(true)).toEqual(['fired', 'fired']);
    expect(run(false)).toEqual(['fire: cone: cone', 'fire: cone: cone']);
  });

  it('the controller: the LARGEST camera cap on disc (MP81, MID 2500; +300 scoped) -- a 30-round open-sky burst is taken, the knocks equal', () => {
    // The room clamps only an `at` NEARER than its reference (`ShotCone.aimPoint`: min(hull or range, 550)); the page's
    // eyeEnd at 2500 or 2800 is past it, so the room takes it as sent: the same f, the same cap on its knock.
    for (const reach of [2500, 2800]) {
      const gap = Math.ceil(M4A1.fireWait * TICK_HZ) + 2;
      const times = Array.from({ length: 30 }, (_, i) => i * gap);
      let i = 0;
      const corners: [number, number][] = [[1, 1], [-1, 1], [1, -1], [-1, -1], [0, 0]];
      // Aimed up into open sky (no floor, no wall on the look within the cap), the other player well off the look.
      const got = shots((c) => { const [kx, ky] = corners[i++ % corners.length]!; return honest(reach, kx, ky)(c); }, 0, times, { q: [300, 20, -300], target: [0, 160, 300] });
      expect(got.outs.filter((o) => o === 'fired')).toHaveLength(30);
      expect(got.roomKnock).toBeCloseTo(got.pageKnock, 1);
    }
  });
});
