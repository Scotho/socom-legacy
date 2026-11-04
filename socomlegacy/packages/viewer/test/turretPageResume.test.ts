// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { TurretPlacement } from '@s2u/scene';
import { gunDelta, seatTurn, TURRET_HOLD_CLIP, type MountShape } from '../src/net/emplacement';
import { TICK_HZ, type ServerEvent } from '../src/net/protocol';
import * as turretPage from '../src/turretPage';
import { TurretPage } from '../src/turretPage';

/**
 * RESUME-MOUNTED on the page (OT.R59's follow-up; a labelled adaptation, product track): `TurretPage` follows the room's
 * `resume` -- a seat resumed on a turret (`resume.turret`) keeps its hold (the walk's lock re-applied, the prompt, the
 * pose) and, mid-steer (`resume.steer`), its mount clip and look turn resume at the room's tick, toward the room's facing
 * -- and takes the room's gun yaw off the wire (`gunYaw`, PB-2c's review F1, research 215 s7.1's open item) in place of
 * the yaw it last drew itself. No game data: a synthetic placement and the turret anim set's key counts.
 */

/** A level placement facing 0 with Vigilance's limits (+-70, +-45) (`turretPage.test.ts`' PLACE). */
const PLACE = {
  id: 0, name: 'synthetic', origin: [0, 13.5, 0], facing: 0, gunOrigin: [0, 13.5, 0], firepointOrigin: [0, 13.5, -9.7],
  limits: { yaw: [(-70 * Math.PI) / 180, (70 * Math.PI) / 180], pitch: [(-45 * Math.PI) / 180, (45 * Math.PI) / 180] },
  mountRange: 22, mountAngleCos: Math.cos((35 * Math.PI) / 180), parts: { turret: 't', gun: 'g', firepoint: 'f' },
} as unknown as TurretPlacement;
/** `oneShotSeconds(0.3, 26)`: the mount clip's run. */
const RUN_S = 0.3 * (25 / 26) ** 2;
/** PB-2c: the mount clip comes off after 16 of the room's 60 Hz ticks (`mountSteerTicks`). */
const STEER_TICKS = 16;
const TICK = 1 / TICK_HZ;

/** A page whose player is 1, looking `own`; the locks it asked (`setLocked`); the turret anim set's clips. */
function page(own: { yaw: number; pitch: number }, shape: MountShape | null = null) {
  let now = 0;
  const look = { ...own };
  const bodies = new Map<number, { yaw: number; pitch: number }>();
  const locks: boolean[] = [];
  const moved: [string, Float32Array][] = [];
  const p = new TurretPage({
    turrets: () => [PLACE], feet: () => [0, 0, 8.5], look: () => look, setLook: (yaw, pitch) => { look.yaw = yaw; look.pitch = pitch; },
    setLocked: (on) => { locks.push(on); }, bodyLook: (id) => bodies.get(id) ?? null, move: (path, delta) => { moved.push([path, delta]); },
    net: () => ({ role: 'player', id: 1, send: () => undefined, lastSeq: () => 1 }),
    clips: () => ({
      clips: [{ name: 'seal_stand2turret', frameCount: 26 }, { name: 'seal_p_stand2turret', frameCount: 26 }, { name: 'seal_turret_poses', frameCount: 3 }],
      table: [['seal_stand2turret', { playback: 0.3 }], ['seal_p_stand2turret', { playback: 0.3 }], ['seal_turret_poses', { playback: 1 }]],
    }),
    ...(shape ? { mountShape: () => shape } : {}),
    now: () => now,
  });
  return { page: p, look, locks, moved, bodies, advance: (s: number) => { now += s; } };
}

const ev = (e: Record<string, unknown>): ServerEvent => e as unknown as ServerEvent;
/** The room's `resume` for seat `id` (RECONNECT-GHOST's fields; this row's `turret` and `steer`). */
const resume = (over: Record<string, unknown> = {}): ServerEvent => ev({
  type: 'resume', id: 1, at: [0, 0, 8.5], yaw: 0, posture: 'stand', seq: 100, health: [], armour: [], loadout: [], rounds: [[], []],
  pouch: {}, weapon: 0, held: null, turret: null, ...over,
});

describe("PB-2c's F1: the room's gun yaw off the wire, taken in TurretPage.take (research 215 s7.1)", () => {
  it("the own mount onto a gun this page never drew turned: the look turns toward the turret event's gunYaw, not the placement's rest, and is laid on it at the clip's end", () => {
    const { page: p, look, advance } = page({ yaw: 50, pitch: 0 });
    p.event(ev({ type: 'turret', id: 0, occupant: 1, ammo: 750, gunYaw: 60 }));
    p.frame();
    for (let i = 0; i < 10; i++) { advance(TICK); p.frame(); }
    let yaw = 50;
    for (let i = 0; i < 10; i++) yaw = seatTurn(yaw, 60, TICK);
    expect(look.yaw).toBeGreaterThan(50);                            // toward 60, not toward the rest 0
    expect(look.yaw).toBeCloseTo(yaw, 9);
    advance(STEER_TICKS * TICK); p.frame();
    expect(look.yaw).toBe(60);
    expect(p.ownPose()!.clip).toBe(TURRET_HOLD_CLIP);
  });

  it("a late joiner's welcome naming a free gun left turned: the next own mount's steer turns toward that yaw", () => {
    const { page: p, look, advance } = page({ yaw: 50, pitch: 0 });
    p.event(ev({ type: 'welcome', turrets: [{ id: 0, occupant: null, ammo: 750, gunYaw: 60 }] }));
    expect(p.mounted()).toBeNull();
    expect(p.occupant(0)).toBeNull();
    p.event(ev({ type: 'turret', id: 0, occupant: 1, ammo: 750 }));   // an older room's event: no gunYaw, the page's own kept
    p.frame();
    advance((STEER_TICKS + 1) * TICK); p.frame();
    expect(look.yaw).toBe(60);
  });

  it("a welcome is the room's whole word: a gun this page drew turned before it, and the welcome does not list, is at its placement's rest -- the next own mount steers toward the rest", () => {
    const { page: p, look, advance } = page({ yaw: 30, pitch: 0 });
    p.event(ev({ type: 'turret', id: 0, occupant: 1, ammo: 750 }));
    advance(1); p.frame();                                           // in the hold
    look.yaw = 60; p.frame();                                        // the gun drawn turned to 60 by this page's look
    p.event(ev({ type: 'turret', id: 0, occupant: null, ammo: 750 }));
    p.event(ev({ type: 'welcome' }));                                // a new socket's room: nothing turned (none listed)
    look.yaw = 30;
    p.event(ev({ type: 'turret', id: 0, occupant: 1, ammo: 750 }));
    p.frame();
    advance((STEER_TICKS + 1) * TICK); p.frame();
    expect(look.yaw).toBe(PLACE.facing);
  });
});

describe('RESUME-MOUNTED: the resume re-applies the page\'s hold (OT.R59\'s follow-up)', () => {
  it('a seat resumed in the hold: the walk locked again after the resume, the turret held, the dismount prompt and the hold pose', () => {
    const { page: p, locks, advance } = page({ yaw: 20, pitch: 0 });
    p.event(ev({ type: 'welcome', turrets: [{ id: 0, occupant: 1, ammo: 750, gunYaw: 20 }] }));
    expect(locks).toEqual([true]);
    locks.length = 0;
    p.event(resume({ turret: 0, yaw: 20 }));
    expect(locks.at(-1)).toBe(true);                                 // whatever the client did first, the hold's lock stands
    expect(p.mounted()).toBe(0);
    advance(1.25);                                                   // LATER 151's review F1: a welcome's mount waits 1.25 s from its arrival
    expect(p.prompt()).toBe('turret_dismount');
    expect(p.ownPose()!.clip).toBe(TURRET_HOLD_CLIP);
  });

  it("a seat resumed mid-steer: the clip drawn from the room's tick, the look turned only by the ticks after it toward the room's facing, laid on it when the clip comes off", () => {
    const { page: p, look, advance } = page({ yaw: 50, pitch: 0 });
    p.event(ev({ type: 'welcome', turrets: [{ id: 0, occupant: 1, ammo: 750, gunYaw: 50 }] }));
    p.event(resume({ turret: 0, yaw: 50, steer: { ticks: 5, toward: 60 } }));
    const pose = p.ownPose()!;
    expect(pose.clip).toBe('seal_stand2turret');                     // not the hold: the clip at the room's tick 5
    expect(pose.frame).toBeCloseTo(((5 * TICK) / RUN_S) * 25, 6);
    p.frame();
    expect(look.yaw).toBe(50);                                       // the room's five ticks are in the resume's yaw
    advance(TICK); p.frame();
    expect(look.yaw).toBeCloseTo(seatTurn(50, 60, TICK), 9);         // one tick turned, toward the room's 60
    advance((STEER_TICKS - 6) * TICK - 1e-6); p.frame();
    expect(p.ownPose()!.clip).toBe('seal_stand2turret');
    expect(look.yaw).toBeLessThan(60);
    // The review's finding 2: while the resumed clip plays the hold places nothing (the room's steer moves the body).
    const mover = { state: { x: 1, y: 2, z: 3, yaw: 50, vx: 0, vz: 0 }, grid: null as never };
    expect(p.holdTick(mover)).toBe(false);
    expect(mover.state).toEqual({ x: 1, y: 2, z: 3, yaw: 50, vx: 0, vz: 0 });
    advance(2e-6); p.frame();
    expect(look.yaw).toBe(60);                                       // the clip's end: laid on the room's facing
    expect(p.ownPose()!.clip).toBe(TURRET_HOLD_CLIP);
  });

  /**
   * T81-4 (research 215 s7.9) with RESUME-MOUNTED (the online seat's condition): the page's own mount steer runs from a mount
   * this page saw start, and none from a resume mid-steer -- the room's steer (`SeatSteer.steered()` ticks, `toward`) carries
   * that body and the resume only re-dates the clip and the look's turn (the case above). A mover without its ground takes
   * the steer's move through its `glide` (here a spy).
   */
  it("T81-4: a mount this page saw start steers its own mover through the clip; a seat resumed mid-steer runs no own steer (the room's carries it)", () => {
    const keys = 26, root = new Float32Array(keys * 3);
    for (let k = 0; k < keys; k++) { const f = k / (keys - 1); root.set([0, 11 - f, -4 * f], k * 3); }
    const shape: MountShape = { clip: 'seal_stand2turret', refPt: [0, -2.5, 8], root, keys, seconds: RUN_S };
    const glides = (): { calls: number; mover: { state: { x: number; y: number; z: number; yaw: number; vx: number; vz: number }; grid: never; glide(dx: number, dz: number): void } } => {
      const out = { calls: 0, mover: null as never };
      const state = { x: 0, y: 0, z: 12, yaw: 0, vx: 0, vz: 0 };
      out.mover = { state, grid: null as never, glide: (dx: number, dz: number) => { out.calls++; state.x += dx; state.z += dz; } } as never;
      return out;
    };
    // Seen to start: the turret event, then the clip's ticks.
    const live = page({ yaw: 0, pitch: 0 }, shape), a = glides();
    live.page.event(ev({ type: 'turret', id: 0, occupant: 1, ammo: 750 }));
    for (let i = 0; i < 5; i++) { live.advance(TICK); live.page.holdTick(a.mover as never); }
    expect(a.calls, 'the own steer moved the mover').toBe(5);
    // Resumed mid-steer: no own steer.
    const resumed = page({ yaw: 50, pitch: 0 }, shape), b = glides();
    resumed.page.event(ev({ type: 'welcome', turrets: [{ id: 0, occupant: 1, ammo: 750, gunYaw: 50 }] }));
    resumed.page.event(resume({ turret: 0, yaw: 50, steer: { ticks: 5, toward: 60 } }));
    for (let i = 0; i < 5; i++) { resumed.advance(TICK); expect(resumed.page.holdTick(b.mover as never)).toBe(false); }
    expect(b.calls, 'no own steer from a resume').toBe(0);
    expect(b.mover.state).toEqual({ x: 0, y: 0, z: 12, yaw: 0, vx: 0, vz: 0 });
  });

  it('a seat resumed unmounted (turret null), or another seat\'s resume: nothing held, no lock asked', () => {
    const { page: p, locks } = page({ yaw: 0, pitch: 0 });
    p.event(ev({ type: 'welcome', turrets: [{ id: 0, occupant: 7, ammo: 750, gunYaw: 0 }] }));
    p.event(resume({ turret: null }));
    p.event(resume({ id: 7, turret: 0 }));
    expect(p.mounted()).toBeNull();
    expect(locks).toEqual([]);
  });
});

/** The placeholder, read loosely so the RED runs before it exists. */
const FREE_PITCH = (turretPage as unknown as { TURRET_FREE_GUN_PITCH_PLACEHOLDER?: number }).TURRET_FREE_GUN_PITCH_PLACEHOLDER;

describe("RESUME-MOUNTED: a free gun a welcome named left turned, drawn at the room's yaw (TURRET_FREE_GUN_PITCH_PLACEHOLDER)", () => {
  it('the stand-in pitch is level, 0: the room keeps no pitch (research 215 s4)', () => {
    expect(FREE_PITCH).toBe(0);
  });

  it("a welcome naming a free gun at 60: each frame draws it at the room's yaw and the stand-in pitch (gunDelta), until it is taken", () => {
    const { page: p, moved } = page({ yaw: 0, pitch: 0 });
    p.event(ev({ type: 'welcome', turrets: [{ id: 0, occupant: null, ammo: 750, gunYaw: 60 }] }));
    p.frame();
    expect(moved.map(([path]) => path)).toEqual(['g']);
    expect([...moved[0]![1]]).toEqual([...gunDelta(PLACE, 60, FREE_PITCH ?? NaN)]);
    p.frame();
    expect(moved).toHaveLength(2);                                   // drawn each frame while free
  });

  it("the edge: a welcome-named gun taken and released live leaves the welcome's draw at the occupation and stays where its occupant left it -- never redrawn at the stand-in pitch", () => {
    const { page: p, moved, bodies, advance } = page({ yaw: 0, pitch: 0 });
    p.event(ev({ type: 'welcome', turrets: [{ id: 0, occupant: null, ammo: 750, gunYaw: 60 }] }));
    p.frame();
    expect(moved).toHaveLength(1);
    bodies.set(7, { yaw: 30, pitch: -20 });
    p.event(ev({ type: 'turret', id: 0, occupant: 7, ammo: 750, gunYaw: 60 }));   // 7 takes it
    advance(1); p.frame();
    const left = moved.at(-1)![1];
    expect([...left]).toEqual([...gunDelta(PLACE, 30, -20)]);         // drawn at its occupant's aim
    p.event(ev({ type: 'turret', id: 0, occupant: null, ammo: 750, gunYaw: 30 }));   // released live
    const before = moved.length;
    p.frame(); p.frame();
    expect(moved).toHaveLength(before);                              // nothing redraws it: where 7 left it, pitch -20 included
  });
});

describe("the review's finding 1: a reconnect keeps a gun this page saw released as it drew it (the room's told yaw kept)", () => {
  /** A page that watched 7 take turret 0 (drawn at 30, -20) and release it live at the room's `gunYaw` 30, on map `MP72`. */
  const watched = () => {
    const r = page({ yaw: 0, pitch: 0 });
    r.page.event(ev({ type: 'welcome', map: 'MP72' }));
    r.bodies.set(7, { yaw: 30, pitch: -20 });
    r.page.event(ev({ type: 'turret', id: 0, occupant: 7, ammo: 750, gunYaw: 0 }));
    r.advance(1); r.page.frame();
    r.page.event(ev({ type: 'turret', id: 0, occupant: null, ammo: 750, gunYaw: 30 }));
    r.moved.length = 0;
    return r;
  };

  it('a reconnect\'s welcome naming it free at the yaw it was released at, 30: not redrawn (its -20 kept)', () => {
    const { page: p, moved } = watched();
    p.event(ev({ type: 'welcome', map: 'MP72', turrets: [{ id: 0, occupant: null, ammo: 750, gunYaw: 30 }] }));
    p.frame(); p.frame();
    expect(moved).toEqual([]);
  });

  it('turned while the page was away, the welcome names it at 45: drawn at 45 and the stand-in pitch', () => {
    const { page: p, moved } = watched();
    p.event(ev({ type: 'welcome', map: 'MP72', turrets: [{ id: 0, occupant: null, ammo: 750, gunYaw: 45 }] }));
    p.frame();
    expect(moved).toHaveLength(1);
    expect([...moved[0]![1]]).toEqual([...gunDelta(PLACE, 45, FREE_PITCH ?? NaN)]);
  });

  it('a welcome for another map: the told yaws let go (turret ids restart per map), so its free turned gun at 30 is drawn', () => {
    const { page: p, moved } = watched();
    p.event(ev({ type: 'welcome', map: 'MP6', turrets: [{ id: 0, occupant: null, ammo: 750, gunYaw: 30 }] }));
    p.frame();
    expect(moved).toHaveLength(1);
    expect([...moved[0]![1]]).toEqual([...gunDelta(PLACE, 30, FREE_PITCH ?? NaN)]);
  });
});
