// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readKitTable, type Grid } from '@s2u/scene';
import { fixture } from '../../archive/test/fixtures';
import { FlyCamera } from '../src/camera';
import { STEP_PROBE_LIFT_READING, WalkMode } from '../src/walk';
import { NetClient, type WebSocketLike } from '../src/net/client';
import { decodeCommands, encodeCommands, frameKind } from '../src/net/codec';
import { Frame, type ClientEvent } from '../src/net/protocol';
import { LoopbackMatch } from '../src/net/loopback';
import { simClipsFromBytes, simMapFromBytes } from '../src/simMap';
import { TurretPage } from '../src/turretPage';
import { holdPlace, mountRootVelocity, mountShape, SeatSteer } from '../src/net/emplacement';

/**
 * Issue #93 (PB-2, PB.R4): `e2e/turretMount.spec.ts`'s mounted hold, headless -- the page's real `WalkMode` and
 * `NetClient` against the loopback room on Vigilance (MP51, the disc), the walker stood 12 behind `mp51_turret01` as the
 * spec's teleport stands it, the mount asked through `TurretPage`, W held through the camera's keys for the spec's 600 ms.
 * The walk held is the hold's rule (research 215 s6: `onTurret` zeroes the stick in the room, `WalkMode.setLocked` on the
 * page); what moved the spec's feet was the mount's seat steer (`SeatSteer`, TURRET_SEAT_READING: its 16 steer ticks, the hold
 * placing the body on the 17th -- PB-2c, research 215 s7.1; was the clip's root carrying the feet ~2 u toward the gun and back
 * over 17 ticks, the root's x and z in the seat), measured because the spec's settle read the feet
 * twice in one frame (`expect.poll`'s first call is at once; research 250 s7 finding 8). The spec now waits 300 ms before
 * each read, as `menuVigilance.spec.ts` does. Disc-backed: skipped without `SOCOM_DISC` (MP51) and the fixtures.
 */

const DISC = process.env.SOCOM_DISC;

/** A1: the mount ask as an older room reads it -- its `word` ignored (taken off here, so that room takes the ask at once). */
const unworded = (ev: ClientEvent): ClientEvent => (ev.type === 'mount' ? { type: ev.type, seq: ev.seq, turret: ev.turret } : ev);
/** A1: the take's two hooks as `matchActions` wires them on a page with no firearm or thrower: the body's refusal and its pop. */
const taken = (walk: WalkMode) => ({
  takeRefused: () => walk.mountRefused(),
  took: () => { walk.mountTake(); return null; },
});
const READERC = fixture('RUN/READERC.ZAR'), ZWEAPON = fixture('RUN/ZWEAPON.ZAR'), PACK = fixture('RUN/MOTION_P.ZAR');
const HAVE = !!DISC && existsSync(resolve(DISC, 'RUN/MP51.ZDB')) && READERC !== null && ZWEAPON !== null && PACK !== null;
const flush = async (): Promise<void> => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
type V3 = [number, number, number];

/**
 * `olderRoom`: the `turret` event's `steer` taken off before the page hears it, as a room before LATER 91 sends it; `'after'`:
 * its `steer.after` alone taken off (`ticks` kept), as a room between LATER 91 and LATER 96 sends it. A1: either older room
 * also ignores the mount ask's `word` (taken off before it is sent), so it takes the ask at once, as before A1; the default,
 * today's room, reserves the worded ask and takes the body at this page's word (`mountTake`, research 215 s8.6 "A1").
 */
async function rig(olderRoom: boolean | 'after' = false) {
  const bytes = new Uint8Array(readFileSync(resolve(DISC!, 'RUN/MP51.ZDB')));
  const map = simMapFromBytes(bytes, 'RUN/MP51.ZDB', { table: readKitTable(ZWEAPON!), readerc: READERC! });
  const clips = simClipsFromBytes(PACK!, READERC);
  let now = 0, seed = 1;
  const random = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const match = new LoopbackMatch(map, clips, { auto: false, random, now: () => now, launchCountdownS: 0 });
  const c = document.createElement('canvas');
  c.setPointerCapture = () => undefined; c.releasePointerCapture = () => undefined; c.hasPointerCapture = () => false;
  const fly = new FlyCamera(c);
  const walk = new WalkMode(fly);
  walk.setGround(map.ground, null, map.grid);
  const client = new NetClient({ url: 'loopback:', map: 'MP51', name: 'Solo', socket: match.socket }, walk);
  const turrets = new TurretPage({
    turrets: () => map.turrets ?? [],
    feet: () => walk.feet(),
    look: () => { if (walk.mode() !== 'walk') return null; const p = fly.pose(); return { yaw: p.yaw, pitch: p.pitch }; },
    setLook: (yaw, pitch) => walk.setCamera({ yaw, pitch }),
    setLocked: (on) => walk.setLocked(on),
    bodyLook: () => null,
    move: () => undefined,
    net: () => (client.state === 'open' ? { role: client.role, id: client.id, send: (ev) => client.send(olderRoom ? unworded(ev) : ev), lastSeq: () => client.lastSeq() } : null),
    clips: () => ({ clips: clips.clips.map((x) => ({ name: x.name, frameCount: x.frameCount })), table: clips.table ? [...clips.table] : null }),
    mountShape: (hand) => mountShape(clips.clips, clips.table, hand),   // T81-4: the page's own steer (as matchActions wires it)
    now: () => now / 1000,
    ...taken(walk),                                                 // A1: the take's refusal and pop, as matchActions wires them
  });
  turrets.attach(olderRoom ? {
    on: (listener) => client.on((ev) => {
      if (ev.type !== 'turret' || !ev.steer) { listener(ev); return; }
      const { steer, ...rest } = ev;
      listener(olderRoom === 'after' ? { ...rest, steer: { ticks: steer.ticks } } : rest);
    }),
  } : client);
  await flush();
  /** `n` page frames of 1/60 s, the room stepped once after each (the page's frame, then the room's tick). */
  const run = async (n: number): Promise<void> => {
    for (let i = 0; i < n; i++) {
      fly.update(1 / 60); walk.frame(1 / 60); turrets.frame();
      now += 1000 / 60; match.step(); await flush();
    }
  };
  await run(120);
  const t = map.turrets!.find((p) => p.root === 'worldmodel/mp51_turret01')!;
  const player = () => match.room.player(client.id!)!;
  /** `main.ts` `teleport`: the page's mover stood as a spawn stands it, the room's at the same feet. */
  const teleport = (at: V3, yaw: number): boolean => {
    if (!walk.respawn(at, yaw)) return false;
    const body = player();
    body.sim.walker.place(at[0], at[1] + STEP_PROBE_LIFT_READING, at[2]);
    body.sim.walker.state.yaw = yaw;
    return true;
  };
  const feet = (): V3 => walk.feet()!;
  /** Whether the room's mount steer still runs (`Player.seat`, the room's private steer, as `roomTurrets.test.ts` reads it). */
  const steering = (): boolean => (player() as unknown as { seat: unknown }).seat !== null;
  const key = (code: string, down: boolean): void => { globalThis.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code === 'KeyW' ? 'w' : code })); };
  return { map, match, walk, fly, client, turrets, t, player, run, teleport, feet, steering, key, clips };
}

/** Stood 12 behind the gun on its line, facing its way, and X: the spec's lines 89-110, frame by frame. */
async function mounted(hold = false, olderRoom: boolean | 'after' = false) {
  const r = await rig(olderRoom);
  if (hold) r.walk.setTurretHold((w) => { r.turrets.holdTick(w); });   // as matchActions wires it (PAR-44, T81-4)
  const f = (r.t.facing * Math.PI) / 180;
  const stand: V3 = [r.t.origin[0] + 12 * Math.sin(f), r.t.origin[1], r.t.origin[2] + 12 * Math.cos(f)];
  expect(r.teleport(stand, r.t.facing)).toBe(true);
  await r.run(10);
  expect(r.turrets.target()).toBe(r.t.id);
  expect(r.turrets.action()).toBe(true);
  let frames = 0;
  // A1: on the word the page holds from its own take (`takeOwn`), the room from the command it names, a frame on: both.
  const roomHolds = (): boolean => (r.player() as unknown as { mounted: number | null }).mounted !== null;
  while ((r.turrets.mounted() === null || !roomHolds()) && frames < 30) { await r.run(1); frames++; }
  expect(r.turrets.mounted()).toBe(r.t.id);
  return r;
}

const moved = (a: V3, b: V3): number => Math.hypot(b[0] - a[0], b[2] - a[2]);

/**
 * The spec's settle (`turretMount.spec.ts` L117-123) with `gap` frames between two reads of the feet: still when two reads
 * `gap` frames apart moved under 0.01. The spec's `expect.poll` makes its first call at once -- two reads with no frame
 * between (`gap` 0) -- where `menuVigilance.spec.ts` waits 300 ms before each (research 250 s7, finding 8: 18 frames).
 */
async function settle(r: Awaited<ReturnType<typeof rig>>, gap: number): Promise<number> {
  let last = r.feet(), frames = 0;
  for (;;) {
    await r.run(gap); frames += gap;
    const now = r.feet(), m = moved(last, now);
    last = now;
    if (m < 0.01) return frames;
    if (frames > 600) throw new Error('never settled');
  }
}

/** W held through the camera's keys for the spec's 600 ms (36 frames at 60): the page's feet moved and the room's. */
async function holdW(r: Awaited<ReturnType<typeof rig>>): Promise<{ page: number; room: number }> {
  const before = r.feet(), s0 = r.player().sim.walker.state, room0: V3 = [s0.x, s0.y, s0.z];
  r.key('KeyW', true);
  await r.run(36);
  r.key('KeyW', false);
  const s1 = r.player().sim.walker.state;
  return { page: moved(before, r.feet()), room: moved(room0, [s1.x, s1.y, s1.z]) };
}

describe.skipIf(!HAVE)('issue #93: the mounted hold on Vigilance (MP51, mp51_turret01), headless', () => {
  it("the spec's settle as it stood: `held` seen on its poll's 100 ms interval, two reads with no frame between read still while the seat steer still runs (research 250 finding 8's trap)", { timeout: 180_000 }, async () => {
    const r = await mounted();
    await r.run(6);                                                   // `expect.poll`'s first interval, 100 ms
    const waited = await settle(r, 0);
    const steering = r.steering();
    const w = await holdW(r);
    console.log(`#93 settle at once: settled after ${waited} frames, steer ${steering ? 'running' : 'ended'}; W 600 ms: page ${w.page.toFixed(3)}, room ${w.room.toFixed(3)}`);
    expect(waited).toBe(0);
    expect(steering).toBe(true);
    expect(w.page, "the spec's old window measures the steer's path past its own 0.5").toBeGreaterThanOrEqual(0.5);
  });

  it("the spec's settle as fixed (each read 300 ms after the last, menuVigilance's): the steer ended, W held 600 ms moves the feet < 0.5 on the page and in the room", { timeout: 180_000 }, async () => {
    const r = await mounted();
    await r.run(6);
    const waited = await settle(r, 18);                               // 300 ms at 60 frames a second
    const steering = r.steering();
    const w = await holdW(r);
    console.log(`#93 settle 300 ms apart: settled after ${waited} frames, steer ${steering ? 'running' : 'ended'}; W 600 ms: page ${w.page.toFixed(3)}, room ${w.room.toFixed(3)}; locked ${r.walk.isLocked()}`);
    expect(steering).toBe(false);
    expect(r.walk.isLocked()).toBe(true);
    expect(w.page).toBeLessThan(0.01);                                // the spec's bar is 0.5; held here as nothing moves
    expect(w.room).toBeLessThan(0.01);
  });

  /**
   * T81-4 (research 215 s7.9; reading, pending review): with the hold wired as `matchActions` wires it, the page steers its
   * own mover through the clip (`TurretPage.holdTick` -> `SeatSteer`) and the room its (`room.ts`), both with no collision
   * (`TURRET_STEER_WALLS_READING`): by the clip's end the page's mover is on the room's (within 0.25), and the drawn body
   * steps no more than 0.35 a frame across the hold's start. Was: 2.96 apart at the clip's end, a drawn step of 3.07
   * (research 215 s7.9). Since LATER 91 the page starts its steer on the room's tick (the wire's `steer.ticks`), so in
   * this loopback it is on the room's through the clip (0.000; was a trail of up to one steer tick's travel, 0.90, when
   * the event carried no tick) -- measured and logged; the whole-clip bar is LATER 91's case below. The loopback is
   * lock-step; the network's bar is LATER 96's block below (the page keyed on the room's `steer.after`). *Was:* "on a real
   * network the page trails the room by about RTT x 60 steer ticks through the clip (LATER 96)".
   */
  it("T81-4: by the mount clip's end the page's own mover is within 0.25 of the room's, and the drawn body steps no more than 0.35 a frame across the hold's start", { timeout: 180_000 }, async () => {
    const r = await mounted(true);
    let apart = 0, atEnd = Infinity, across = 0, last = r.walk.drawnFeet()!, began = -1;
    const lines: string[] = [];
    for (let i = 0; i < 40; i++) {
      const before = r.turrets.ownPose()?.clip;
      await r.run(1);
      const s = r.player().sim.walker.state, f = r.feet(), d = r.walk.drawnFeet()!;
      const step = Math.hypot(d[0] - last[0], d[2] - last[2]);
      last = d;
      const now = r.turrets.ownPose()?.clip;
      if (now !== 'seal_turret_poses') { apart = Math.max(apart, Math.hypot(f[0] - s.x, f[2] - s.z)); atEnd = Math.hypot(f[0] - s.x, f[2] - s.z); }
      if (began < 0 && before !== 'seal_turret_poses' && now === 'seal_turret_poses') began = i;
      if (began >= 0 && i <= began + 2) across = Math.max(across, step);
      const h = holdPlace(r.t, s.yaw);
      lines.push(`${i} ${now}: page-room ${Math.hypot(f[0] - s.x, f[2] - s.z).toFixed(3)} room-hold ${Math.hypot(s.x - h[0], s.z - h[2]).toFixed(3)} drawn step ${step.toFixed(3)}`);
    }
    console.log(`T81-4 loopback: through the clip the page ${apart.toFixed(3)} from the room at most, ${atEnd.toFixed(3)} at its end; across the hold's start a drawn step of ${across.toFixed(3)}\n${lines.join('\n')}`);
    expect(began, 'the hold began').toBeGreaterThanOrEqual(0);
    expect(atEnd <= 0.25 && across <= 0.35, `page-room ${atEnd.toFixed(3)} at the clip's end (${apart.toFixed(3)} at most through it), the drawn step ${across.toFixed(3)} across the hold's start`).toBe(true);
  });

  /**
   * LATER 91, the page half (research 215 s7.9; reading, pending review): the room steps the mount's steer before the
   * command and lays its place again after the command's move (`room.ts`, `seated`), so the walker's push-out
   * (`Walker.pushOut`) never reaches the steer's place; the page steps its steer in the walk's post-tick hold
   * (`TurretPage.holdTick`), after the walker's move. Pinned here as the room's order: each clip tick's page steer starts
   * from the place its last step laid, whatever moved the mover between (the walker's push-out; the reconcile's nudges too,
   * as the hold's `holdStep` lays its place each tick), so its place is a reference `SeatSteer`'s step from there within
   * 1e-6. Was 0.189 off (the push-out in it). Logs the page-room distance at every tick of the clip. Since LATER 96 this
   * room's broadcast carries `after` and the page keys its steer on it; the first step starts from the place at `after`
   * (`TurretPage.trail`), which in this loopback (the body stood still before the mount) is the hook's entry place.
   */
  it("LATER 91: through the mount clip the page's own steer starts each tick from the place its last step laid, the walker's push-out undone as the room undoes it", { timeout: 180_000 }, async () => {
    const r = await mounted(true);
    const room = r.player() as unknown as { seat: { toward: number } | null };
    expect(room.seat, "the room's steer runs").not.toBeNull();
    const ref = SeatSteer.start(r.t, mountShape(r.clips.clips, r.clips.table, 0), undefined, room.seat!.toward)!;
    const ghost = { state: { x: 0, y: 0, z: 0, yaw: 0, vx: 0, vz: 0 }, grid: null as unknown as Grid };
    const own = r.turrets as unknown as { ownSteer: { steer: { steered(): number } | null } | null };
    // A1: on the word the page steps its own steer from M, the room from the same command, and `mounted` returns once both
    // hold -- so the page's steer has run its first step(s) already: the reference's phase is set to them (its place is laid
    // anew from the page's at each compared tick below).
    const pre = own.ownSteer?.steer?.steered() ?? 0, f0 = r.feet();
    const scratch = { state: { x: f0[0], y: f0[1], z: f0[2], yaw: 0, vx: 0, vz: 0 }, grid: (r.walk as unknown as { walker: { grid: Grid } }).walker.grid };
    for (let k = 0; k < pre; k++) ref.step(scratch, 1 / 60);
    const nudged: V3 = [0, 0, 0];
    const nudge = r.walk.nudge.bind(r.walk);
    r.walk.nudge = (dx, dy, dz) => { nudged[0] += dx; nudged[1] += dy; nudged[2] += dz; nudge(dx, dy, dz); };
    let exit: V3 | null = null, refOff = false, worst = 0, steps = 0, push = 0, nudges = 0;
    const off: string[] = [];
    r.walk.setTurretHold((w) => {
      const entry: V3 = [w.state.x, w.state.y, w.state.z], had = own.ownSteer?.steer ?? null, was = had?.steered() ?? 0;
      r.turrets.holdTick(w);
      const now = own.ownSteer?.steer ?? null, n = now ? now.steered() - (now === had ? was : 0) : 0;
      const stepped = !refOff && now !== null;
      if (stepped) {
        const from: V3 = had === null || !exit ? entry : exit;
        if (exit && had !== null) push = Math.max(push, Math.hypot(entry[0] - exit[0] - nudged[0], entry[2] - exit[2] - nudged[2]));
        if (had !== null) nudges = Math.max(nudges, Math.hypot(nudged[0], nudged[2]));
        Object.assign(ghost.state, { x: from[0], y: from[1], z: from[2], yaw: w.state.yaw, vx: 0, vz: 0 });
        (ghost as { grid: Grid }).grid = w.grid;
        let off_ = false;
        for (let k = 0; k < Math.max(1, n) && !off_; k++) off_ = ref.step(ghost, 1 / 60);
        if (off_) refOff = true;
        else {
          const d = Math.hypot(w.state.x - ghost.state.x, w.state.z - ghost.state.z);
          worst = Math.max(worst, d); steps++;
          off.push(d.toFixed(4));
        }
      }
      exit = [w.state.x, w.state.y, w.state.z]; nudged[0] = 0; nudged[1] = 0; nudged[2] = 0;
    });
    const lines: string[] = [];
    for (let i = 0; i < 24; i++) {
      await r.run(1);
      const s = r.player().sim.walker.state, f = r.feet();
      lines.push(`${i} ${r.turrets.ownPose()?.clip}: page-room ${Math.hypot(f[0] - s.x, f[2] - s.z).toFixed(3)}`);
    }
    console.log(`LATER 91 order: ${steps} steer ticks compared, the page's place off the room's order by ${worst.toFixed(4)} at most (the walker's push-out up to ${push.toFixed(4)} a tick, the reconcile's nudges up to ${nudges.toFixed(4)})\noff per tick: ${off.join(' ')}\n${lines.join('\n')}`);
    expect(steps, 'the page steered its own mover through the clip').toBeGreaterThanOrEqual(10);
    expect(worst, "the page's steer place off the room's order (what moved the mover between its steps in it)").toBeLessThan(1e-6);
  });

  /**
   * LATER 91 (research 215 s7.9; reading, pending review): the mount's start off the wire -- the `turret` event's
   * `steer.ticks` (0 from this room: its broadcast precedes the tick's commands), the page's mount dated
   * `(ticks + 1) / TICK_HZ` back and its own steer stepped to the room's count -- with the order above, the page's own
   * mover is on the room's within 0.25 at every tick of the mount clip and the hold's first, not only at the clip's end.
   * Was 0.928 at most (0.900 before the order; the start a tick late). Since LATER 96 this room's broadcast carries
   * `steer.after` too and the page keys its own mount on it: run both ways, the room's whole event (LATER 96's start) and
   * the event with `after` taken off (a room between the two: LATER 91's dating, `LATER91_TICK_OFFSET`, kept for it).
   */
  for (const older of [false, 'after'] as const) it(`LATER 91: the page's own mover follows the room's through the whole mount clip (${older ? "`ticks` alone: LATER 91's start" : "`ticks` and `after`: LATER 96's start"})`, { timeout: 180_000 }, async () => {
    const r = await mounted(true, older);
    let worst = 0, inClip = 0;
    const lines: string[] = [];
    for (let i = 0; i < 24; i++) {
      await r.run(1);
      const s = r.player().sim.walker.state, f = r.feet(), clip = r.turrets.ownPose()?.clip;
      const d = Math.hypot(f[0] - s.x, f[2] - s.z);
      worst = Math.max(worst, d);
      if (clip !== 'seal_turret_poses') inClip++;
      lines.push(`${i} ${clip}: page-room ${d.toFixed(3)}`);
    }
    console.log(`LATER 91 whole clip (${older ? '`ticks` alone' : '`ticks` and `after`'}): ${inClip} clip ticks, page-room ${worst.toFixed(3)} at most\n${lines.join('\n')}`);
    expect(inClip, 'the clip played').toBeGreaterThanOrEqual(10);
    expect(worst, 'page-room at every tick of the clip and the hold').toBeLessThanOrEqual(0.25);
  });

  /**
   * LATER 91: an older room sends no `steer` on the mount's broadcast -- the page's start is today's: its mount dated when
   * the event came, its own steer one step a tick from its first hold tick (so a tick behind the room's, 0.90 apart early).
   */
  it("LATER 91: from a room that sends no `steer`, the page's own steer starts as before -- one step a tick from the event's arrival", { timeout: 180_000 }, async () => {
    const r = await mounted(true, true);
    const own = r.turrets as unknown as { ownSteer: { steer: { steered(): number } | null } | null };
    const counts: number[] = [];
    let worst = 0;
    for (let i = 0; i < 6; i++) {
      await r.run(1);
      counts.push(own.ownSteer?.steer?.steered() ?? 0);
      const s = r.player().sim.walker.state, f = r.feet();
      worst = Math.max(worst, Math.hypot(f[0] - s.x, f[2] - s.z));
    }
    console.log(`LATER 91 older room: the page's steps after each of the first ticks ${counts.join(' ')}; page-room ${worst.toFixed(3)} at most`);
    expect(counts).toEqual([1, 2, 3, 4, 5, 6]);
    expect(worst, 'a tick behind the room, as before').toBeGreaterThan(0.85);
  });

  it("the control: unmounted, the same W through the camera's keys moves the walker on the page and in the room (the key reaches the mover)", { timeout: 180_000 }, async () => {
    const r = await rig();
    const f = (r.t.facing * Math.PI) / 180;
    expect(r.teleport([r.t.origin[0] + 12 * Math.sin(f), r.t.origin[1], r.t.origin[2] + 12 * Math.cos(f)], r.t.facing)).toBe(true);
    await r.run(10);
    expect(r.turrets.mounted()).toBeNull();
    const w = await holdW(r);
    expect(w.page).toBeGreaterThan(1);
    expect(w.room).toBeGreaterThan(1);
  });

  it("from the mount, W held moves the feet exactly as no W does over the spec's 600 ms: what moves them is the seat steer, not the stick", { timeout: 180_000 }, async () => {
    const runs: { page: number; room: number }[] = [];
    for (const held of [true, false]) {
      const r = await mounted();
      const before = r.feet(), s0 = r.player().sim.walker.state, room0: V3 = [s0.x, s0.y, s0.z];
      if (held) r.key('KeyW', true);
      await r.run(36);
      if (held) r.key('KeyW', false);
      const s1 = r.player().sim.walker.state;
      runs.push({ page: moved(before, r.feet()), room: moved(room0, [s1.x, s1.y, s1.z]) });
    }
    console.log(`#93 from the mount, 600 ms: W held page ${runs[0]!.page.toFixed(3)} room ${runs[0]!.room.toFixed(3)}; no W page ${runs[1]!.page.toFixed(3)} room ${runs[1]!.room.toFixed(3)}`);
    expect(runs[0]!.page).toBeCloseTo(runs[1]!.page, 6);
    expect(runs[0]!.room).toBeCloseTo(runs[1]!.room, 6);
  });
});

/**
 * LATER 96, the page half (research 215 s7.9; reading, pending review): the page and the room on a network -- the tree's
 * own latency injector (`NetOptions.simulate`, `net/client.ts`: each message delayed `latencyMs` one way, under the socket)
 * on fake timers, the page's frames at `hz` and the room's steps at 60 on one clock. The page's own body after each
 * command it sent (`pageAt`, after its hold tick) is compared with the room's after the same command (`roomAt`, the room's
 * `settle` at the end of each command it runs): the reconcile's own key. `lose` drops a command from every batch (the
 * redundancy's cover lost too), so the room passes it over after `GAP_WAIT`. The page half's review F2: the mover at a
 * command's END (`endAt`: the hold tick's place plus the reconcile's nudges after it) is measured too. `seam` (default on)
 * wires `TurretPageDeps.replayed` to `NetClient.replayed` as `matchActions` wires it (research 215 s7.9); off, a page with
 * no `replayed` dependency. `drawn` (default on) hands the page's hold the walker itself; off, a bare mover over the same
 * state, with no drawn offset to set (`TURRET_CATCHUP_DRAW_DECAY_ADAPTATION`): the simulation's identity check.
 */
async function netRig(o: {
  latencyMs: number; hz: number; lose?: (seq: number) => boolean; seam?: boolean; drawn?: boolean;
  /** A1: an older room -- the ask's `word` taken off (`unworded`): the room takes the ask at once, as before A1. */
  older?: boolean;
  /**
   * A1 (branch A's named limit, the late `reloadPress`): R pressed in the frame the page hears its own reservation -- the
   * press (`reloadPress`, named `lastSeq()`) sent before the take's word -- with the room's hand record's `ReloadDelay` 1 s,
   * so the room carries the delay onto the turret's slot when the press is there at the take (`room.ts` `mountKit`).
   */
  pressAtWord?: boolean;
  /**
   * A1 (the controller's pin, 2026-10-22): the room's take pinned to M - 1 + `pinWord` -- the take's word (`mountTake`) and a
   * `pressAtWord` press held out of the injector and handed to the room in send order (the press, then the word: one
   * TCP stream's) right after the room step on which it has run command M - 1 + `pinWord`, so it takes before M + `pinWord`
   * (`room.ts` `mountWord`: `max(m, sim.seq + 1)`). Why: the injector's reliable queue computes `due` on the real
   * `performance.now` while this rig fakes `setTimeout` alone (B129's seam), so a word queued behind the press landed a
   * timer late by however much real time the run took -- the take on M - 1 + 2 or + 3 at 50 ms between runs. Pinned, the
   * re-key runs the same way every run; the rest of the rig's traffic still rides the injector. 0 or absent: not pinned.
   */
  pinWord?: number;
}) {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const bytes = new Uint8Array(readFileSync(resolve(DISC!, 'RUN/MP51.ZDB')));
  const map = simMapFromBytes(bytes, 'RUN/MP51.ZDB', { table: readKitTable(ZWEAPON!), readerc: READERC! });
  const clips = simClipsFromBytes(PACK!, READERC);
  let now = 0, seed = 1;
  const random = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const match = new LoopbackMatch(map, clips, { auto: false, random, now: () => now, launchCountdownS: 0 });
  const c = document.createElement('canvas');
  c.setPointerCapture = () => undefined; c.releasePointerCapture = () => undefined; c.hasPointerCapture = () => false;
  const fly = new FlyCamera(c);
  const walk = new WalkMode(fly);
  walk.setGround(map.ground, null, map.grid);
  const socket = (url: string): WebSocketLike => {
    const s = match.socket(url);
    if (!o.lose) return s;
    const send = s.send.bind(s);
    s.send = (data) => {
      if (typeof data !== 'string' && frameKind(data) === Frame.Commands) {
        const b = decodeCommands(data), kept = b.commands.filter((x) => !o.lose!(x.seq));
        if (!kept.length) return;
        data = encodeCommands({ viewTick: b.viewTick, commands: kept });
      }
      send(data);
    };
    return s;
  };
  let mountSeq: number | null = null;                             // LATER 124: the seq the page's mount named
  let wordSeq: number | null = null;                              // A1: the command the page's take named (`mountTake`)
  let pressSeq: number | null = null;                             // A1: the press sent in the take's frame (`pressAtWord`)
  const replayedAt: number[] = [];                                // A1: the `replayed` seam's calls (none on the word)
  /** A1 (`pinWord`): the press and the word held for the room, the command after which they go, and the room's count then. */
  const heldMsgs: ClientEvent[] = [];
  let heldUntil: number | null = null, deliveredAt: number | null = null;
  const pinned = (o.pinWord ?? 0) > 0;
  const client = new NetClient({ url: 'loopback:', map: 'MP51', name: 'Solo', socket, simulate: { latencyMs: o.latencyMs, loss: 0 }, random }, walk);
  const turrets = new TurretPage({
    turrets: () => map.turrets ?? [],
    feet: () => walk.feet(),
    look: () => { if (walk.mode() !== 'walk') return null; const p = fly.pose(); return { yaw: p.yaw, pitch: p.pitch }; },
    setLook: (yaw, pitch) => walk.setCamera({ yaw, pitch }),
    setLocked: (on) => walk.setLocked(on),
    bodyLook: () => null,
    move: () => undefined,
    // LATER 124: the mount's own seq as the page sends it (`TurretPage.action`: `lastSeq()` at the press).
    net: () => (client.state === 'open' ? {
      role: client.role, id: client.id, lastSeq: () => client.lastSeq(),
      send: (ev) => {
        if (ev.type === 'mount') mountSeq = ev.seq;
        if (ev.type === 'mountTake') wordSeq = ev.seq;
        if (pinned && ev.type === 'mountTake') { heldMsgs.push(ev); heldUntil = ev.seq - 1 + o.pinWord!; return; }   // A1: the pin
        client.send(o.older ? unworded(ev) : ev);
      },
    } : null),
    clips: () => ({ clips: clips.clips.map((x) => ({ name: x.name, frameCount: x.frameCount })), table: clips.table ? [...clips.table] : null }),
    mountShape: (hand) => mountShape(clips.clips, clips.table, hand),
    now: () => now / 1000,
    ...(o.seam !== false ? { replayed: (a: number) => { replayedAt.push(a); client.replayed(a); } } : {}),   // F2: as matchActions wires it
    ...taken(walk),                                                 // A1: as matchActions wires them
  });
  // A1 (`pressAtWord`): heard before the page's own take runs -- R in the take's frame, its press sent ahead of the word.
  client.on((ev) => {
    if (!o.pressAtWord || pressSeq !== null || ev.type !== 'turret' || ev.occupant !== client.id || ev.reserved !== true) return;
    pressSeq = client.lastSeq();
    // Pinned, held with the word (this listener runs before the page's take: the press first, as sent).
    if (pinned) heldMsgs.push({ type: 'reloadPress', seq: pressSeq }); else client.send({ type: 'reloadPress', seq: pressSeq });
  });
  turrets.attach(client);
  const pageAt = new Map<number, V3>(), roomAt = new Map<number, V3>(), nudged = new Map<number, V3>(), drawnOff = new Map<number, number>();
  /** LATER 104: whether the room's seat held its turret after each command it ran (`Player.mounted`), by the command's number. */
  const roomMounted = new Map<number, boolean>();
  let knownFrom: number | null = null, after: number | null = null, pageHold: number | null = null;
  walk.setTurretHold((w) => {
    turrets.holdTick(o.drawn === false ? { state: w.state, grid: w.grid, get airborne() { return w.airborne; }, setAirborne: (on: boolean) => w.setAirborne(on) } : w);
    const s = client.lastSeq() + 1;                                  // the command this tick sends
    pageAt.set(s, [w.state.x, w.state.y, w.state.z]);
    drawnOff.set(s, Math.hypot(...w.drawOffset));                 // the drawn-only offset at the command's hold tick
    if (knownFrom === null && turrets.mounted() !== null) knownFrom = s;
    if (pageHold === null && turrets.mounted() !== null && turrets.ownPose()?.clip === 'seal_turret_poses') pageHold = s;
  });
  // F2 of the page half's review: the reconcile's nudges after the hold tick (`NetClient.tick`'s `applyCorrection`, and a
  // snap between ticks), by the command they follow -- the mover at a command's end is its hold-tick place plus these.
  const nudge = walk.nudge.bind(walk);
  walk.nudge = (dx, dy, dz) => {
    const n = nudged.get(client.lastSeq()) ?? [0, 0, 0];
    nudged.set(client.lastSeq(), [n[0] + dx, n[1] + dy, n[2] + dz]);
    nudge(dx, dy, dz);
  };
  const endAt = (s: number): V3 | undefined => {
    const p = pageAt.get(s), n = nudged.get(s) ?? [0, 0, 0];
    return p ? [p[0] + n[0], p[1] + n[1], p[2] + n[2]] : undefined;
  };
  client.on((ev) => { if (ev.type === 'turret' && ev.occupant === client.id && typeof ev.steer?.after === 'number') after = ev.steer.after; });
  const room = match.room as unknown as { settle(p: { id: number; sim: { seq: number; walker: { state: { x: number; y: number; z: number } } } }): void };
  const settle = room.settle.bind(match.room);
  room.settle = (p) => {
    settle(p);
    if (p.id !== client.id) return;
    const s = p.sim.walker.state;
    roomAt.set(p.sim.seq, [s.x, s.y, s.z]);
    roomMounted.set(p.sim.seq, (p as unknown as { mounted: number | null }).mounted !== null);
  };
  let t = 0, nextPage = 0, nextRoom = 0;
  const pageDt = 1000 / o.hz, roomDt = 1000 / 60;
  /** The drawn own body per page frame while `recording`: its step since the last frame (`drawnFeet`) and its clip. */
  const frames: { step: number; clip: string | null; cam: number; shift: number; off: number }[] = [];
  let recording = false, lastDrawn: V3 | null = null, lastCam: V3 | null = null;
  /** `ms` of the one clock: each page frame and room step at its time, the injector's timers fired up to it first. */
  const advance = async (ms: number): Promise<void> => {
    const end = t + ms;
    for (;;) {
      const page = nextPage <= nextRoom, at = Math.min(nextPage, nextRoom);
      if (at > end) break;
      vi.advanceTimersByTime(at - t); t = at; now = at; await flush();
      if (page) {
        fly.update(1 / o.hz); walk.frame(1 / o.hz); turrets.frame(); nextPage += pageDt;
        const d = walk.drawnFeet();
        const c = fly.pose(), cam: V3 = [c.x, c.y, c.z];               // the drawn view's eye (`WalkMode.follow` -> `placeView`)
        // The wall-pass gap: the drawn eye's distance from the placed (wall-passed) eye, and the walker's drawn offset now.
        const placed = walk.cameraState()?.eye, dOff = (walk as unknown as { walker: { drawOffset: V3 } | null }).walker?.drawOffset ?? [0, 0, 0];
        const shift = placed ? Math.hypot(cam[0] - placed[0], cam[1] - placed[1], cam[2] - placed[2]) : 0;
        if (recording && d && lastDrawn && lastCam) frames.push({ step: Math.hypot(d[0] - lastDrawn[0], d[2] - lastDrawn[2]), clip: turrets.ownPose()?.clip ?? null, cam: Math.hypot(cam[0] - lastCam[0], cam[2] - lastCam[2]), shift, off: Math.hypot(dOff[0], dOff[1], dOff[2]) });
        lastDrawn = d ? [d[0], d[1], d[2]] : null;
        lastCam = cam;
      }
      else {
        match.step(); nextRoom += roomDt;
        // A1 (`pinWord`): the held press and word to the room once it has run M - 1 + k, in their send order.
        const ranTo = match.room.player(client.id!)?.sim.seq ?? -1;
        if (heldUntil !== null && ranTo >= heldUntil) {
          deliveredAt = ranTo;
          for (const ev of heldMsgs.splice(0)) match.room.text(client.id!, ev);
          heldUntil = null;
        }
      }
      await flush();
    }
    vi.advanceTimersByTime(end - t); t = end; now = end; await flush();
  };
  await advance(2000);
  const tp = map.turrets!.find((p) => p.root === 'worldmodel/mp51_turret01')!;
  const player = () => match.room.player(client.id!)!;
  const teleport = (at: V3, yaw: number): boolean => {
    if (!walk.respawn(at, yaw)) return false;
    const body = player();
    body.sim.walker.place(at[0], at[1] + STEP_PROBE_LIFT_READING, at[2]);
    body.sim.walker.state.yaw = yaw;
    return true;
  };
  const steering = (): boolean => (player() as unknown as { seat: unknown }).seat !== null;
  const key = (code: string, down: boolean): void => { globalThis.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code === 'KeyW' ? 'w' : code })); };
  const f = (tp.facing * Math.PI) / 180;
  expect(teleport([tp.origin[0] + 12 * Math.sin(f), tp.origin[1], tp.origin[2] + 12 * Math.cos(f)], tp.facing)).toBe(true);
  await advance(1000);
  expect(turrets.target()).toBe(tp.id);
  /** The mount pressed (with `walking`, W held from the press until the room's answer); the frames until it comes. */
  const mount = async (walking = false): Promise<void> => {
    recording = true;
    if (walking) key('KeyW', true);
    expect(turrets.action()).toBe(true);
    // A1: on the word the page holds from its own take, the room's take broadcast (`after`) a round trip on: both heard.
    for (let i = 0; (turrets.mounted() === null || after === null) && i < 400; i++) await advance(pageDt);
    if (walking) key('KeyW', false);
    expect(turrets.mounted()).toBe(tp.id);
  };
  /** Page-room per command from the first the page sent knowing of the mount through `to` (the earlier ones logged apart). */
  const apart = (to: number): { worst: number; compared: number; line: string; blind: string } => {
    let worst = 0, compared = 0;
    const cells: string[] = [], blind: string[] = [];
    for (let s = after! + 1; s <= to; s++) {
      const p = pageAt.get(s), r = roomAt.get(s);
      if (!p || !r) continue;
      const d = Math.hypot(p[0] - r[0], p[2] - r[2]);
      if (s < knownFrom!) { blind.push(`${s - after!}:${d.toFixed(3)}`); continue; }
      worst = Math.max(worst, d); compared++;
      cells.push(`${s - after!}:${d.toFixed(3)}`);
    }
    return { worst, compared, line: cells.join(' '), blind: blind.join(' ') };
  };
  /** Page-room per command from `from` through `to`: at the hold tick's place (`pageAt`) and at the command's end (`endAt`). */
  const held = (from: number, to: number): { tick: number; end: number; compared: number; line: string } => {
    let tick = 0, end = 0, compared = 0;
    const cells: string[] = [];
    for (let s = from; s <= to; s++) {
      const p = pageAt.get(s), e = endAt(s), r = roomAt.get(s);
      if (!p || !e || !r) continue;
      const a = Math.hypot(p[0] - r[0], p[2] - r[2]), b = Math.hypot(e[0] - r[0], e[2] - r[2]);
      tick = Math.max(tick, a); end = Math.max(end, b); compared++;
      cells.push(`${s - after!}:${a.toFixed(3)}/${b.toFixed(3)}`);
    }
    return { tick, end, compared, line: cells.join(' ') };
  };
  /** The room's largest move in one command of its clip (`after + 1 .. after + 16`): one steer step at its largest. */
  const steerStep = (): number => {
    let m = 0;
    for (let s = after! + 2; s <= after! + 16; s++) {
      const a = roomAt.get(s - 1), b = roomAt.get(s);
      if (a && b) m = Math.max(m, Math.hypot(b[0] - a[0], b[2] - a[2]));
    }
    return m;
  };
  return {
    map, match, walk, client, turrets, t: tp, player, advance, mount, steering, key, pageAt, roomAt, roomMounted, endAt, drawnOff, apart, held, steerStep, frames, pageDt,
    after: () => after, knownFrom: () => knownFrom, pageHold: () => pageHold, mountSeq: () => mountSeq,
    wordSeq: () => wordSeq, pressSeq: () => pressSeq, replayedAt, deliveredAt: () => deliveredAt,
  };
}

/**
 * LATER 96 (the page half's review F1): the own mount clip's frames a page at 60 Hz draws at least, at every latency
 * (`N_CLIP_FRAMES_AT_60 x hz / 60` at another rate). The clip's own run is 16 steer steps, one a command -- 14 to 15 frames
 * drawn from the event at 60 Hz in this rig (the base's 14) -- and a catch-up of at most `TURRET_CATCHUP_STEPS_ADAPTATION`
 * (2) steps a command plays it in no fewer than 16 / 2 = 8 commands, the clip drawn on the frames before the 17th step's
 * (measured: 8 at 100 and 150 ms, 10 at 50, 15 at 0).
 */
const N_CLIP_FRAMES_AT_60 = 8;

/**
 * A1 (the fresh review's fold 1, decided (a) by the controller 2026-10-22: accepted and named; research 215 s8.6 "A1,
 * branch B", the re-key): the MEASURED lead of the page's own body over the room's through the mount clip when the room's
 * take lands later than the page's M -- not a tolerance. The page steps its clip from M and, re-keyed on the room's later
 * `steer.after`, pauses until the room's count passes its steps; the room steps from its take, so through the clip the page
 * leads by the steps it took before the re-key landed, and the two meet at the room's hold (0.0000 from `after` + 17).
 * Units of the world, by one-way latency, at the take's offset each case pins (REKEY_WORD_AT: + 3, + 6, + 9), the lead
 * measured at that offset on 2026-10-22 (dev-disc, `simulate` on fake timers) plus 1e-3: 50 ms 3.039 (+ 3; an unpinned
 * run's + 2 gave 2.099), 100 ms 5.224, 150 ms 6.882. Unpinned, the late take was the rig's own artefact, its offset set
 * by real elapsed time (the late word behind the press, B129's seam: the injector drains on `performance.now`, the rig
 * fakes `setTimeout` alone); pinned, each case re-keys alike every run. In a browser the late take arises only from the
 * 2 s bound or a lost command. LATER 311 owes the catch-up that would remove it (its RED: within 0.25 through the clip).
 */
const REKEY_CLIP_LEAD_BOUND: Readonly<Record<number, number>> = { 50: 3.04, 100: 5.225, 150: 6.883 };
/**
 * A1 (the controller's pin): the offset k each late-press case pins the room's take to (`netRig`'s `pinWord`: the take
 * before M + k, `after` = M - 1 + k), by one-way latency -- the offsets the unpinned runs landed on (+ 3 at 50 ms, its larger;
 * + 6; + 9), so REKEY_CLIP_LEAD_BOUND's values are the leads measured at these very offsets (3.039, 5.224, 6.882, each plus
 * 1e-3). 0 ms: none (no re-key; 0.25 through the clip). Confirmed pinned, two runs identical (3.0393, 5.2241, 6.8816).
 */
const REKEY_WORD_AT: Readonly<Record<number, number>> = { 0: 0, 50: 3, 100: 6, 150: 9 };

describe.skipIf(!HAVE)('LATER 96, the page half: the own mount steer keyed on the command sequence (MP51, mp51_turret01, `simulate`)', () => {
  afterEach(() => { vi.useRealTimers(); });

  /**
   * The bar (the brief's, with the page half's review F1-F2): one way 0 / 50 / 100 / 150 ms, the page at 30 / 60 / 144 Hz.
   * In the merge controller's order: (1) the own mount clip is drawn, at least `N_CLIP_FRAMES_AT_60` frames at 60 Hz
   * (scaled by the page's rate), compressed and never skipped; (2) the drawn own body (`walk.drawnFeet`) steps no more than
   * two of the room's largest steer steps a tick (`steerStep`; two ticks a frame at 30 Hz); (3) page-room 0.000 by the
   * page's own hold at the latest, at the hold tick's place, and within 0.25 at the command's end (after the reconcile's
   * nudges: F2) -- with the `replayed` seam wired (`netRig`'s `seam`, as `matchActions` wires it). The per-command
   * distances through the clip are logged: the catch-up is spread (`TURRET_CATCHUP_STEPS_ADAPTATION`), so the page trails
   * the room through it. Was (the page half as first built): the catch-up at once, page-room 0.000 at every command, the
   * drawn body stepping up to 8.449 in a frame and the clip not drawn at all from about 140 ms.
   */
  for (const latencyMs of [0, 50, 100, 150]) for (const hz of [30, 60, 144]) {
    it(`${latencyMs} ms one way, the page at ${hz} Hz: the own clip drawn, the drawn body's step within two steer steps a tick, page-room 0.000 by the page's hold`, { timeout: 180_000 }, async () => {
      const r = await netRig({ latencyMs, hz });
      const { h } = await drawnBar(r, latencyMs, hz, true);
      expect(h.end, `page-room at the command's end from the page's hold at ${latencyMs} ms, ${hz} Hz (F2)`).toBeLessThanOrEqual(0.25);
    });
  }

  /**
   * F2 without the seam -- a page with no `replayed` dependency: the clip and the hold tick's place as
   * above; the command's end is carried by the reconcile from the hold on (the catch-up's differences nudged in), logged
   * and pinned above 0.25 -- the measure the seam settles (research 215 s7.9).
   */
  for (const latencyMs of [100, 150]) {
    it(`${latencyMs} ms one way, 60 Hz, an older room (A1: the ask's word ignored), without the replayed seam (no replayed dependency): the hold tick on the room's, the command's end carried by the reconcile`, { timeout: 180_000 }, async () => {
      const r = await netRig({ latencyMs, hz: 60, seam: false, older: true });   // A1: the catch-up is an older room's take's
      const { h } = await drawnBar(r, latencyMs, 60, false);
      expect(h.end, 'the reconcile carries the catch-up into the hold without the seam').toBeGreaterThan(0.25);
    });
  }

  /**
   * The bar's measures for one run: the mount, then (1) the own clip's frames, (2) the drawn step when `stepBar`, (3) the
   * hold tick's place on the room's from the page's hold, asserted; the command's end returned for the caller (F2).
   */
  async function drawnBar(r: Awaited<ReturnType<typeof netRig>>, latencyMs: number, hz: number, stepBar: boolean) {
    {
      await r.mount();
      await r.advance(1000);
      const after = r.after(), known = r.knownFrom(), hold = r.pageHold();
      expect(after, "the mount's broadcast carried `steer.after`").not.toBeNull();
      // LATER 124 (ASK_AT_COMMAND_ADAPTATION): the room takes the mount once its own command has run, so `after` is at or
      // past the seq the page named (was: taken at the first step after its arrival, the command perhaps unrun).
      expect(r.mountSeq(), 'the page sent its mount').not.toBeNull();
      console.log(`LATER 124 ${latencyMs} ms ${hz} Hz: after - mountSeq = ${after! - r.mountSeq()!}`);
      expect(after! - r.mountSeq()!, "steer.after at or past the mount's own seq").toBeGreaterThanOrEqual(0);
      expect(known).not.toBeNull();
      expect(hold, "the page's own hold").not.toBeNull();
      const a = r.apart(Math.max(after! + 20, known! + 10)), h = r.held(hold!, hold! + 10);
      const steer = r.steerStep(), ticks = Math.max(1, Math.ceil(60 / hz)), bar = 2 * steer * ticks;
      const step = Math.max(...r.frames.map((f) => f.step)), at = r.frames.findIndex((f) => f.step === step);
      const around = r.frames.slice(Math.max(0, at - 3), at + 4).map((f) => `${f.step.toFixed(3)}${f.clip === 'seal_turret_poses' ? 'h' : f.clip ? 'c' : '-'}`).join(' ');
      const clip = r.frames.filter((f) => f.clip !== null && f.clip !== 'seal_turret_poses').length, need = Math.floor((N_CLIP_FRAMES_AT_60 * hz) / 60);
      console.log(`LATER 96 ${latencyMs} ms ${hz} Hz${stepBar ? '' : ' (no seam)'}: after ${after}, the page knew from after + ${known! - after!}, its hold from after + ${hold! - after!}; the drawn step ${step.toFixed(3)} at most (bar ${bar.toFixed(3)}: the steer step ${steer.toFixed(3)} x 2 x ${ticks}; around it, c the clip, h the hold: ${around}); own clip frames ${clip} (at least ${need}); from the page's hold page-room ${h.tick.toFixed(3)} at the hold tick, ${h.end.toFixed(3)} at the command's end; corrections ${JSON.stringify(r.client.corrections)}\n  through the clip (logged): ${a.line}\n  from the hold (tick/end): ${h.line}`);
      expect(clip, `own clip frames at ${latencyMs} ms, ${hz} Hz`).toBeGreaterThanOrEqual(need);
      if (stepBar) expect(step, `the drawn step at ${latencyMs} ms, ${hz} Hz`).toBeLessThanOrEqual(bar);
      expect(h.compared, 'commands compared from the hold').toBeGreaterThanOrEqual(6);
      expect(h.tick, `page-room from the page's hold at ${latencyMs} ms, ${hz} Hz`).toBeLessThanOrEqual(1e-3);
      return { h, step, clip };
    }
  }

  /**
   * N2 of the wire's review (binding): the room ran the commands after `after` MOUNTED (`onTurret` strips the stick), while
   * this page ran them walking toward the gun before the event came. The catch-up restarts from the body as it was at
   * `after` and replays the steer over the commands since: the body ends on the room's path, not offset by the walk.
   */
  /**
   * And the drawn body (the fold's re-review, FAIL high on this case): walking up to the gun and mounting is the common
   * path, so the restart from the body at `after` -- the simulation's, unchanged -- must not be seen as a jump back. The
   * largest drawn step (`walk.drawnFeet`) within the grid's bar, two of the room's largest steer steps a tick, at 50 / 100
   * / 150 ms and 30 / 60 / 144 Hz. Was (the fold as first built): 2.099 / 4.336 / 4.286 at 60 Hz -- the restart about five
   * frames of running in one -- against LATER 91's clock start 1.941 / 1.375 / 1.406.
   */
  for (const latencyMs of [50, 100, 150]) for (const hz of [30, 60, 144]) {
    it(`walked toward the gun before the event, an older room (A1: the ask's word ignored; ${latencyMs} ms one way, ${hz} Hz): the catch-up restarts from the body at \`after\`, the page on the room's path by its hold, the drawn body within the step bar`, { timeout: 180_000 }, async () => {
      const r = await netRig({ latencyMs, hz, older: true });
      await r.mount(true);
      await r.advance(1000);
      const after = r.after()!, known = r.knownFrom()!;
      console.log(`LATER 124 walked ${latencyMs} ms ${hz} Hz: after - mountSeq = ${after - r.mountSeq()!}`);
      expect(after - r.mountSeq()!, "LATER 124: steer.after at or past the mount's own seq").toBeGreaterThanOrEqual(0);
      const at = r.pageAt.get(after)!, last = r.pageAt.get(known - 1)!;
      const walked = Math.hypot(last[0] - at[0], last[2] - at[2]);
      const a = r.apart(after + 20), hold = r.pageHold()!, h = r.held(hold, hold + 10);
      const steer = r.steerStep(), ticks = Math.max(1, Math.ceil(60 / hz)), bar = 2 * steer * ticks;
      const step = Math.max(...r.frames.map((f) => f.step)), i = r.frames.findIndex((f) => f.step === step);
      const around = r.frames.slice(Math.max(0, i - 3), i + 4).map((f) => `${f.step.toFixed(3)}${f.clip === 'seal_turret_poses' ? 'h' : f.clip ? 'c' : '-'}`).join(' ');
      console.log(`LATER 96 walked ${latencyMs} ms ${hz} Hz: ${walked.toFixed(3)} walked over after + 1 .. after + ${known - 1 - after}; from the page's hold (after + ${hold - after}) page-room ${h.tick.toFixed(3)} at the hold tick, ${h.end.toFixed(3)} at the command's end; the drawn step ${step.toFixed(3)} at most (bar ${bar.toFixed(3)}; around it, c the clip, h the hold: ${around}); the drawn offset ${(r.drawnOff.get(known) ?? 0).toFixed(3)} at the restart, ${(r.drawnOff.get(hold) ?? 0).toFixed(3)} at the page's hold; the reconcile's corrections ${JSON.stringify(r.client.corrections)}\n  known: ${a.line}\n  before the event: ${a.blind}\n  from the hold (tick/end): ${h.line}`);
      expect(walked, 'the page walked before the event').toBeGreaterThan(0.5);
      expect(h.compared).toBeGreaterThanOrEqual(6);
      expect(h.tick, "the page's body on the room's by its hold").toBeLessThanOrEqual(1e-3);
      expect(h.end, "at the command's end too (F2, the seam wired)").toBeLessThanOrEqual(0.25);
      expect(step, `the drawn step, walked, at ${latencyMs} ms, ${hz} Hz`).toBeLessThanOrEqual(bar);
      expect(r.drawnOff.get(hold), "the drawn offset gone by the page's hold").toBe(0);
    });
  }

  /**
   * The drawn body's smoothing is drawn only: the walked case (100 ms, 60 Hz) run twice, the page's hold handed the walker
   * itself and then a bare mover over the same state (no drawn offset to set) -- the mover's place at each command's hold
   * tick and end, and the own pose's clip at each frame, identical; only the drawn steps differ.
   */
  /**
   * The camera on the drawn body (the walk.ts `follow()` hunk, cleared by the merge controller): the third-person view's
   * eye as placed each frame (`FlyCamera.placeView`, read back by `fly.pose()`) steps within the grid's bar a frame in the
   * walked case. Was (the drawn offset on the body alone): the camera kept the simulated feet and stepped the restart --
   * about 4.3 in a frame at 100 and 150 ms -- while the body glided.
   */
  for (const latencyMs of [100, 150]) {
    it(`walked, ${latencyMs} ms one way, 60 Hz: the camera's drawn view steps within the bar a frame`, { timeout: 180_000 }, async () => {
      const r = await netRig({ latencyMs, hz: 60 });
      await r.mount(true);
      await r.advance(1000);
      const bar = 2 * r.steerStep(), cam = Math.max(...r.frames.map((f) => f.cam)), i = r.frames.findIndex((f) => f.cam === cam);
      const around = r.frames.slice(Math.max(0, i - 3), i + 4).map((f) => `${f.cam.toFixed(3)}${f.clip === 'seal_turret_poses' ? 'h' : f.clip ? 'c' : '-'}`).join(' ');
      console.log(`LATER 96 camera, walked ${latencyMs} ms 60 Hz: the drawn view's largest step ${cam.toFixed(3)} a frame (bar ${bar.toFixed(3)}; around it: ${around}); the body's ${Math.max(...r.frames.map((f) => f.step)).toFixed(3)}`);
      expect(cam, `the camera's step, walked, at ${latencyMs} ms`).toBeLessThanOrEqual(bar);
      // The wall-pass gap (the adaptation's known cost): the third-person view is wall-passed at the simulated feet
      // (`PlayerCamera.tick`, `cameraPass`) and the drawn view shifted from it by the drawn offset, so the drawn eye may stand
      // past the pass's clear point by at most that shift -- bounded each frame by the offset's size (now or the tick
      // before: the drawn feet go between the two), falling 1 a tick to nothing; at most a tick's 1 on the hold's frames.
      let over = 0, worst = 0, held = 0;
      r.frames.forEach((f, k) => {
        const bound = Math.max(f.off, k > 0 ? r.frames[k - 1]!.off : 0);
        over = Math.max(over, f.shift - bound);
        worst = Math.max(worst, f.shift);
        if (f.clip === 'seal_turret_poses') held = Math.max(held, f.shift);
      });
      console.log(`  the drawn view off the wall-passed one: ${worst.toFixed(3)} at most, ${over.toFixed(6)} over the offset's bound; ${held.toFixed(3)} at most on the hold's frames, ${r.frames.at(-1)!.shift.toFixed(3)} at the end`);
      expect(over, "the drawn view's shift within the drawn offset's size").toBeLessThanOrEqual(1e-6);
      expect(held, "on the hold's frames at most the last tick's 1").toBeLessThanOrEqual(1 + 1e-6);
      expect(r.frames.at(-1)!.shift).toBe(0);
    });
  }

  it('walked, 100 ms, 60 Hz: the simulation and the pose are the same with and without the drawn smoothing', { timeout: 180_000 }, async () => {
    const runs: { tick: string; end: string; clips: string; step: number }[] = [];
    for (const drawn of [true, false]) {
      const r = await netRig({ latencyMs: 100, hz: 60, drawn });
      await r.mount(true);
      await r.advance(1000);
      const seqs = [...r.pageAt.keys()].sort((x, y) => x - y);
      runs.push({
        tick: seqs.map((s) => r.pageAt.get(s)!.join(',')).join(';'),
        end: seqs.map((s) => r.endAt(s)!.join(',')).join(';'),
        clips: r.frames.map((f) => f.clip ?? '-').join(','),
        step: Math.max(...r.frames.map((f) => f.step)),
      });
      vi.useRealTimers();
    }
    console.log(`LATER 96 drawn only: the largest drawn step ${runs[0]!.step.toFixed(3)} with the smoothing, ${runs[1]!.step.toFixed(3)} without`);
    expect(runs[0]!.tick, "the hold tick's place per command").toBe(runs[1]!.tick);
    expect(runs[0]!.end, "the command's end per command").toBe(runs[1]!.end);
    expect(runs[0]!.clips, 'the own clip per frame').toBe(runs[1]!.clips);
  });

  /**
   * One lost command (50 ms one way, 60 Hz): the room passes it over unrun, so its steer is a step behind the page's and comes
   * off on `after + 18`. A release the page sends on its second hold command (`seq` after + 18, past the mount's window
   * `after + 17` by the page's own count) is taken -- LATER 104 (`TURRET_RELEASE_SEQ_ADAPTATION`, research 215 s7.9): the
   * room judges the dismount on the page's numbering and takes it on the first command above its `seq`, after its own hold
   * -- and the page, whose own clip is off, predicts it at the press: page and room released from the same command, within
   * 0.25 through it. The control, nothing lost: the same release on the same command. *Was* (LATER 96, the lost case):
   * the release refused 'mounting' (the room's own steer still ran at the dismount's arrival), the page mounted and locked
   * until it sent the release again.
   */
  for (const lost of [true, false]) {
    const title = lost
      ? "one command lost: a release on the page's second hold command is taken on the first command after the room's hold, the page predicting it at the press (LATER 104; was refused 'mounting')"
      : "nothing lost (the control): the same release, on the page's second hold command, is taken on the command after it";
    it(title, { timeout: 180_000 }, async () => {
      // LATER 151 (TURRET_RELEASE_WAIT_READING, research 215 s7.11): a release is past the window only from after + 75 (the
      // release's wait), so the lost case now needs a long loss to keep the room's steer behind there: 59 of the steer's
      // commands lost (was one), its hold on after + 76, and the page's release on its second command past the wait,
      // after + 76 (was its second hold command, after + 18). The control loses none.
      let lose = -1;                                                   // the first of the 59 lost (none: -1)
      // A1: an older room's take (the ask's word ignored) -- on the word the lost commands hold the take itself back, a case
      // of its own (the A1 block below), not the steer behind the page's this measures.
      const r = await netRig({ latencyMs: 50, hz: 60, lose: (s) => lose >= 0 && s >= lose && s < lose + 59, older: true });
      if (lost) lose = r.client.lastSeq() + 4;                        // the steer's commands, from after the press
      await r.mount();
      for (let i = 0; r.client.lastSeq() < r.after()! + 76 && i < 400; i++) await r.advance(r.pageDt);
      const after = r.after()!;
      // The room's own record of the seat (fields the player type keeps to the room, read as the rig's `steering` does).
      const room = (): { mounted: number | null; signals: { refused: Record<string, number> } } =>
        r.player() as unknown as { mounted: number | null; signals: { refused: Record<string, number> } };
      const refused = (): number => room().signals.refused['dismount: mounting'] ?? 0;
      expect(r.turrets.ownPose()?.clip, "the page's own clip off (its hold)").toBe('seal_turret_poses');
      const dseq = r.client.lastSeq();
      expect(r.turrets.action(), 'the release sent').toBe(true);
      expect(r.turrets.mounted(), 'the page predicts its release at the press (its own clip off)').toBeNull();
      // LATER 109 (TURRET_RELEASE_STICK_PLACEHOLDER): the walk stays locked through the reversed clip and its end's command
      // (dseq + 17), let go after it. Was: 'unlocked at the press' (false), LATER 104's.
      expect(r.walk.isLocked(), "still locked at the press: the release's stick held (LATER 109)").toBe(true);
      await r.advance(500);
      expect(r.walk.isLocked(), "unlocked after the reversed clip's end (LATER 109)").toBe(false);
      const released = [...r.roomMounted].filter(([, m]) => !m).map(([s]) => s).filter((s) => s > after).sort((a, b) => a - b)[0];
      const apart: number[] = [];
      for (let s = dseq; s <= dseq + 20; s++) {
        const p = r.pageAt.get(s), q = r.roomAt.get(s);
        if (p && q) apart.push(Math.hypot(p[0] - q[0], p[2] - q[2]));
      }
      console.log(`LATER 104 ${lost ? `lost ${lose} (after + ${lose - after})` : 'nothing lost'}: dismount after + ${dseq - after}; refused 'mounting' ${refused()}; the room's first released command after + ${released! - after}; page-room from the dismount: ${apart.map((d) => d.toFixed(3)).join(' ')}`);
      expect(dseq, "the press on the page's second command past the wait (LATER 151)").toBe(after + 76);
      expect(refused(), "taken, not refused 'mounting'").toBe(0);
      expect(room().mounted, "the room's release").toBeNull();
      expect(r.turrets.mounted(), "the page's release").toBeNull();
      expect(released, 'the room releases before the first command above the dismount: after + 19, after its hold (after + 18 lost, after + 17 not)').toBe(dseq + 1);
      expect(apart.length).toBeGreaterThanOrEqual(15);
      expect(Math.max(...apart), 'page-room through the release').toBeLessThanOrEqual(0.25);
    });
  }
});

/**
 * A1, branch B (LATER 239, 217, 218, 243; research 215 s8.6 "A1"; reading, pending review): the mount's round trip on the
 * word. The room reserves the ask at its command K and tells this page; this page takes the turret on the next command it
 * sends, M, and names it (`mountTake`); the room runs this page's commands below M on foot, as this page ran them, and takes
 * the body before M (`steer.after` M - 1). The bar (the controller's): page = room through the trip and from M at every
 * command, at 0-150 ms one way and 30 / 60 / 144 Hz, with no catch-up -- the `replayed` seam never called (LATER 96's
 * zero); W held through the trip (the walk the room runs too). An older room is the blocks above (`older`).
 */
describe.skipIf(!HAVE)('A1: the mount on the word -- page = room through the trip and from M (MP51, mp51_turret01, `simulate`)', () => {
  afterEach(() => { vi.useRealTimers(); });

  for (const latencyMs of [0, 50, 100, 150]) for (const hz of [30, 60, 144]) {
    it(`${latencyMs} ms one way, ${hz} Hz: walked through the trip, page = room at every command from the ask to M + 40, the room's take on the page's M, no replayed call`, { timeout: 180_000 }, async () => {
      const r = await netRig({ latencyMs, hz });
      await r.mount(true);
      await r.advance(1000);
      const K = r.mountSeq()!, M = r.wordSeq(), after = r.after();
      expect(M, 'the page named its take').not.toBeNull();
      let worst = 0, compared = 0;
      const cells: string[] = [];
      for (let s = K + 1; s <= M! + 40; s++) {
        const p = r.pageAt.get(s), q = r.roomAt.get(s);
        if (!p || !q) continue;
        const d = Math.hypot(p[0] - q[0], p[2] - q[2]);
        worst = Math.max(worst, d); compared++;
        if (s <= M! + 2 || d > 1e-3) cells.push(`${s - K}:${d.toFixed(3)}`);
      }
      const roomMounted = [...r.roomMounted].filter(([, m]) => m).map(([s]) => s).sort((a, b) => a - b)[0];
      const walked = Math.hypot(r.pageAt.get(M! - 1)![0] - r.pageAt.get(K)![0], r.pageAt.get(M! - 1)![2] - r.pageAt.get(K)![2]);
      console.log(`A1 ${latencyMs} ms ${hz} Hz: K ${K}, M = K + ${M! - K}, after = M - 1 + ${after! - (M! - 1)}; the room mounted from K + ${roomMounted! - K}; walked ${walked.toFixed(3)} in the trip; page-room ${worst.toFixed(4)} at most over ${compared} commands (${cells.join(' ')}); replayed ${JSON.stringify(r.replayedAt)}; corrections ${JSON.stringify(r.client.corrections)}`);
      expect(after, "the room's take on the page's word: steer.after M - 1").toBe(M! - 1);
      expect(roomMounted, 'the room runs M mounted, the commands below it on foot').toBe(M);
      if (latencyMs > 0) expect(walked, 'the trip walked (W held)').toBeGreaterThan(0.5);   // at 0 ms the trip is a command or two
      expect(compared).toBeGreaterThanOrEqual(M! + 40 - K - 2);
      expect(worst, 'page = room through the trip and from M').toBeLessThanOrEqual(1e-3);
      expect(r.replayedAt, 'no catch-up: the seam never called').toEqual([]);
    });
  }

  /**
   * Branch A's named limit (research 215 s8.6 "A1", the transport): a `reloadPress` reaching the room after the take is not
   * carried (`room.ts` `reloadPress` returns for a mounted body). Met here under `?lag` (`simulate`): R pressed in the frame
   * this page hears its reservation, the press sent ahead of the take's word -- the injector keeps the page's reliable
   * messages in order (`client.ts` `pumpReliable`), so the press reaches the room before the word, and the room's take
   * (on the word, or on the next command run after a late word) finds it: the delay carried (`mountKit`). Said here,
   * measured: the limit is not met on the word path, at any latency below. Unpinned, the word came a one-way latency late
   * here (the take on M - 1 + 2 or + 3, + 6, + 9; the page re-keys) -- the injector drains its reliable queue on
   * `performance.now` while this rig fakes `setTimeout` alone, so a second reliable message queued behind the press waits a
   * timer more (B129's seam; HAZARDS, "tests"); on one clock the two leave together. Since the controller's pin the press
   * and the word go to the room in send order at a fixed command (`pinWord`, REKEY_WORD_AT), so each case re-keys alike
   * every run; the press's order ahead of the word -- what the case is about -- is TCP's, kept.
   */
  for (const latencyMs of [0, 50, 100, 150]) {
    it(`${latencyMs} ms one way, 60 Hz: R pressed in the take's frame (ReloadDelay 1 s), the press ahead of the word -- there at the take, carried (the late press not met)`, { timeout: 180_000 }, async () => {
      const k = REKEY_WORD_AT[latencyMs] ?? 0;
      const r = await netRig({ latencyMs, hz: 60, pressAtWord: true, pinWord: k });
      const room = r.player() as unknown as { records: { reloadDelay?: number }[]; sim: { weapon: number } };
      room.records[room.sim.weapon] = { ...room.records[room.sim.weapon]!, reloadDelay: 1 };   // the Spas 12's class of delay (1 s: the 870's)
      // The room's own decision at the take (`room.ts` `mountKit`, private; read here as the rig reads `settle`): the press's
      // window there and the carry it returned. This loopback's MP51 turret has no weapon record (`TurretState.mags` null),
      // so the carry's landing on the turret's slot is not observable here: `roomMountWord.test.ts` (branch A, RED 3) holds it.
      const kit: { seq: number; press: number | null; carry: unknown }[] = [];
      const ra = r.match.room as unknown as { mountKit(p: { pressLock: { from: number } | null }, seq: number, count: number): unknown };
      const mountKit = ra.mountKit.bind(ra);
      ra.mountKit = (p, seq, count) => { const press = p.pressLock?.from ?? null, carry = mountKit(p, seq, count); kit.push({ seq, press, carry }); return carry; };
      await r.mount();
      await r.advance(1000);                                         // past M + 40 at every latency here
      const M = r.wordSeq()!, P = r.pressSeq()!, after = r.after()!;
      // The fresh review's fold 1: the take re-keyed (from 50 ms, `after` past M - 1) -- the page's own steer, keyed on M - 1
      // until the room's take is heard, pauses there until the room's count passes its own steps (`keyedStep`), with no
      // restart from the room's body. Page against room after each command from the take through M + 40: through the clip
      // within 0.25 (T81-4's bar) on a take on M, within the measured lead on a re-keyed one (REKEY_CLIP_LEAD_BOUND, the
      // controller's call (a): accepted, named; LATER 311 owes its removal), and page-room 0.000 (1e-3) from the room's hold,
      // `after` + 17 (LATER 96's), every case.
      let clip = 0, held = 0, compared = 0;
      const cells: string[] = [];
      for (let s = after + 1; s <= M + 40; s++) {
        const p = r.pageAt.get(s), q = r.roomAt.get(s);
        if (!p || !q) continue;
        const d = Math.hypot(p[0] - q[0], p[2] - q[2]);
        if (s < after + 17) clip = Math.max(clip, d); else held = Math.max(held, d);
        compared++;
        cells.push(`${s - after}:${d.toFixed(3)}`);
      }
      console.log(`A1 late press ${latencyMs} ms: the press on ${P} (M - ${M - P}), the take after ${after} (M - 1 + ${after - (M - 1)}); at the take ${JSON.stringify(kit)}; page-room from the take ${clip.toFixed(4)} at most through the clip, ${held.toFixed(4)} from the room's hold, over ${compared} commands (k from after: ${cells.join(' ')}); replayed ${JSON.stringify(r.replayedAt)}`);
      expect(P, "R pressed in the take's frame: named M - 1").toBe(M - 1);
      expect(after - (M - 1), `the take pinned on M - 1 + ${k} (delivered after the room ran ${r.deliveredAt()})`).toBe(k);
      expect(kit, 'one take, the press there (its window from P), the delay carried').toEqual([{ seq: after + 1, press: P, carry: { until: expect.any(Number), lands: true } }]);
      expect(compared, 'every command from the take to M + 40 compared').toBe(M + 40 - after);
      const rekeyed = k > 0;
      const bar = rekeyed ? REKEY_CLIP_LEAD_BOUND[latencyMs]! : 0.25;
      expect(clip, rekeyed ? `page-room through the clip, within the measured re-key lead at ${latencyMs} ms (research 215 s8.6, LATER 311)` : 'page-room through the clip, within 0.25 (T81-4)').toBeLessThanOrEqual(bar);
      expect(held, "page-room from the room's hold (LATER 96: 0.000)").toBeLessThanOrEqual(1e-3);
    });
  }
});

/**
 * LATER 104 (research 215 s7.9; reading, pending review): the own release on a network. The room takes a dismount on the
 * first command above its `seq` (not at the message's arrival, which fell before the dismount's own command or the next
 * by the room's queue), and the page -- its own clip off by its own count -- predicts the release at the press: the lock,
 * the hold and the HUD let go from the command after the one the dismount names. The bar (the seat's brief): the page's own
 * body within 0.25 of the room's after each command from the dismount's through 60 more, at the hold tick's place and at
 * the command's end (the reconcile's nudges after it), at 0-150 ms one way and 30/60/144 Hz; the drawn own body's step a
 * frame no larger than the room's own move over the commands one frame runs (no network snap: the 2.431 the room's own
 * push-out off mp51_turret01's hull, at 0 ms too -- LATER 109's, not this row's). Was (today, measured by the read): held at
 * the hold's place for a round trip of commands, 2.431 apart, then the reconcile's corrections overshooting by as much
 * again -- 17 to 42 commands over 0.25 at 50-150 ms, the drawn step up to 2.836.
 */
describe.skipIf(!HAVE)('LATER 104: the own release on a network -- the page predicts it from the dismount it sent, the room takes it on the command (MP51, mp51_turret01, `simulate`)', () => {
  afterEach(() => { vi.useRealTimers(); });

  /** Mounted, held to after + 75 (LATER 151: past the release's wait), the dismount pressed; the page and the room per command and the drawn steps after it. */
  async function release(latencyMs: number, hz: number) {
    const r = await netRig({ latencyMs, hz });
    await r.mount();
    for (let i = 0; r.client.lastSeq() < r.after()! + 75 && i < 800; i++) await r.advance(r.pageDt);
    expect(r.turrets.ownPose()?.clip, 'held').toBe('seal_turret_poses');
    const dseq = r.client.lastSeq();
    r.frames.length = 0;
    expect(r.turrets.action(), 'the dismount sent').toBe(true);
    await r.advance(1500);
    let tick = 0, end = 0, over = 0;
    const cells: string[] = [];
    for (let s = dseq; s <= dseq + 60; s++) {
      const p = r.pageAt.get(s), e = r.endAt(s), q = r.roomAt.get(s);
      if (!p || !e || !q) continue;
      const a = Math.hypot(p[0] - q[0], p[2] - q[2]), b = Math.hypot(e[0] - q[0], e[2] - q[2]);
      tick = Math.max(tick, a); end = Math.max(end, b);
      if (b > 0.25) over++;
      if (s - dseq <= 30) cells.push(`${s - dseq}:${a.toFixed(3)}/${b.toFixed(3)}`);
    }
    // The room's own largest move over the commands one page frame runs (two at 30 Hz, one at 60 and 144).
    const ticks = Math.max(1, Math.ceil(60 / hz));
    let roomMove = 0;
    for (let s = dseq; s <= dseq + 60; s++) {
      const a = r.roomAt.get(s - ticks), b = r.roomAt.get(s);
      if (a && b) roomMove = Math.max(roomMove, Math.hypot(b[0] - a[0], b[2] - a[2]));
    }
    const step = Math.max(...r.frames.map((f) => f.step)), at = r.frames.findIndex((f) => f.step === step);
    const around = r.frames.slice(Math.max(0, at - 2), at + 3).map((f) => `${f.step.toFixed(3)}${f.clip === 'seal_turret_poses' ? 'h' : f.clip ? 'c' : '-'}`).join(' ');
    console.log(`LATER 104 ${latencyMs} ms ${hz} Hz: page-room from the dismount ${tick.toFixed(3)} at the hold tick, ${end.toFixed(3)} at the command's end, ${over} commands over 0.25; the drawn step ${step.toFixed(3)} at most (around it: ${around}), the room's own move ${roomMove.toFixed(3)} over ${ticks} command(s); corrections ${JSON.stringify(r.client.corrections)}\n  per command (k: tick/end): ${cells.join(' ')}`);
    return { tick, end, over, step, roomMove };
  }

  for (const latencyMs of [0, 50, 100, 150]) for (const hz of [30, 60, 144]) {
    it(`${latencyMs} ms one way, ${hz} Hz: the page's own body within 0.25 of the room's through the release`, { timeout: 180_000 }, async () => {
      const m = await release(latencyMs, hz);
      expect(m.tick, `page-room at the hold tick, ${latencyMs} ms ${hz} Hz`).toBeLessThanOrEqual(0.25);
      expect(m.end, `page-room at the command's end, ${latencyMs} ms ${hz} Hz`).toBeLessThanOrEqual(0.25);
    });
    it(`${latencyMs} ms one way, ${hz} Hz: the drawn own body steps no more than the room's own move through the release (no network snap)`, { timeout: 180_000 }, async () => {
      const m = await release(latencyMs, hz);
      expect(m.roomMove, "the room's own move (the push-out off the hull: LATER 109's)").toBeGreaterThan(0);
      expect(m.step, `the drawn step, ${latencyMs} ms ${hz} Hz`).toBeLessThanOrEqual(m.roomMove + 1e-3);
    });
  }
});

/**
 * LATER 109 (research 215 s7.9; reading, pending review): the release's reversed clip on the own page and in the room. The
 * original's release writes no place and plays the mount clip reversed in the turret set, so through its 16 ticks the walls
 * do not act and the clip root's velocity carries the body 3.165 back along the gun's line (`TURRET_RELEASE_TRAVEL_READING`),
 * the stick held (`TURRET_RELEASE_STICK_PLACEHOLDER`). The bar (the controller's): the page's own body within 0.25 of the
 * room's through the release at 0-150 ms one way and 30/60/144 Hz, and the drawn own body's step a frame no larger than the
 * read's largest tick of travel over the commands one frame runs -- no 2.431 push-out (was: the walk's push-out off the
 * hull on the release's command, 2.431 drawn in one frame at 30 and 60 Hz, LATER 104's measure).
 */
describe.skipIf(!HAVE)("LATER 109: the release's reversed clip on the own page and in the room (MP51, mp51_turret01, `simulate`)", () => {
  afterEach(() => { vi.useRealTimers(); });

  /** The read's largest tick of travel at 60 Hz on the disc's clip: minus the root's velocity at the reversed phase, x dt. */
  const largestTick = (): number => {
    const c = simClipsFromBytes(PACK!, READERC), shape = mountShape(c.clips, c.table, 0)!;
    const e = (shape.keys - 1) / shape.keys, P = shape.seconds / (e * e), dt = 1 / 60;
    let m = 0;
    for (let j = 1; j <= 16; j++) { const v = mountRootVelocity(shape, Math.max(0, e - (j * dt) / (P * e))); m = Math.max(m, Math.hypot(v[0], v[2]) * dt); }
    return m;
  };

  for (const latencyMs of [0, 50, 100, 150]) for (const hz of [30, 60, 144]) {
    it(`${latencyMs} ms one way, ${hz} Hz: page and room within 0.25 through the release, the room's body 3.165 back after 16 commands, the drawn step within the read's tick travel`, { timeout: 180_000 }, async () => {
      const r = await netRig({ latencyMs, hz });
      await r.mount();
      for (let i = 0; r.client.lastSeq() < r.after()! + 75 && i < 800; i++) await r.advance(r.pageDt);
      expect(r.turrets.ownPose()?.clip, 'held').toBe('seal_turret_poses');
      const dseq = r.client.lastSeq();
      r.frames.length = 0;
      expect(r.turrets.action(), 'the dismount sent').toBe(true);
      await r.advance(1500);
      let tick = 0, end = 0;
      for (let s = dseq; s <= dseq + 60; s++) {
        const p = r.pageAt.get(s), e = r.endAt(s), q = r.roomAt.get(s);
        if (!p || !e || !q) continue;
        tick = Math.max(tick, Math.hypot(p[0] - q[0], p[2] - q[2])); end = Math.max(end, Math.hypot(e[0] - q[0], e[2] - q[2]));
      }
      const at = r.roomAt.get(dseq)!, back = r.roomAt.get(dseq + 16)!;
      const bar = largestTick() * Math.max(1, Math.ceil(60 / hz)) + 1e-3;
      const step = Math.max(...r.frames.map((f) => f.step));
      console.log(`LATER 109 ${latencyMs} ms ${hz} Hz: page-room ${tick.toFixed(3)} / ${end.toFixed(3)}; the room's body ${Math.hypot(back[0] - at[0], back[2] - at[2]).toFixed(3)} back after 16; the drawn step ${step.toFixed(3)} (bar ${bar.toFixed(3)})`);
      expect(tick, 'page-room at the hold tick').toBeLessThanOrEqual(0.25);
      expect(end, "page-room at the command's end").toBeLessThanOrEqual(0.25);
      expect(Math.hypot(back[0] - at[0], back[2] - at[2]), "the room's body after 16 commands").toBeCloseTo(3.166, 1);
      expect(step, 'the drawn step').toBeLessThanOrEqual(bar);
    });
  }
});
