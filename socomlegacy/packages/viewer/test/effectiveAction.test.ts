// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Scene } from 'three';
import { buildGrid, DEFAULT_RIFLE, HAND_ANIMS, type CollisionOwner, type Grid, type GridParams, type WeaponRecord, type WorldPoly } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { FlyCamera } from '../src/camera';
import { Hud } from '../src/hud';
import { PlayerLoadout } from '../src/loadout';
import { mountFirearm } from '../src/matchFirearm';
import { Play } from '../src/play';
import { RemotePlayers } from '../src/remotePlayers';
import { GrenadeThrower, type GrenadeEvents } from '../src/grenade';
import { Fire, RELOAD_DELAY, reloadEndOfBody, type FireEvent } from '../src/fire';
import { throwPoseEnds, ThrowPose } from '../src/throwPose';
import { SEAL_ANIMS } from '../src/locomotion';
import {
  ACTION_FAMILY, HOLD_CLIPS, moverSnapshot, PENDING_STANCE_RETRY_READING, TICK, Walker, type ActionEnd, type MoverActionName, type WalkInput,
} from '../src/mover';
import { clipsFromPack, motionTableFromArchive } from '../src/motionTable';
import { MoverSim } from '../src/net/moverSim';
import { Button, HOLD_SHIFT, STANCE_CODES, type Command } from '../src/net/protocol';
import { Traversal } from '../src/traversal';
import { packGround, WalkMode, type PlaySnapshot } from '../src/walk';

/**
 * PAR-19 (ruling PAR.R2; research 251): ONE effective-action life model on the mover -- the body's owner, the overlay,
 * the pending stance and the end reason -- asked by the stance gate (`FUN_00552ec0`), the jump (`FUN_0057e1b0`) and the
 * dive (`FUN_00584b00`). Research 230's probes (`./parity/actionStack`, `explosives`, `movement`) hold the four stance
 * cases and the moving-swap dive; these hold the controls and the request's life: taken when the one-shot ends, kept
 * across an obstacle, forgotten on no headroom, the transitions' own exceptions, the end reasons, and the real `WalkMode`
 * coordinator with the room's `MoverSim` on the same commands. Source-contract tests, not a capture of the original.
 */

const STILL: WalkInput = { forward: 0, right: 0, boost: false };
const FORWARD: WalkInput = { forward: 1, right: 0, boost: false };

function floor(minX: number, minZ: number, maxX: number, maxZ: number, y: number, ditype = 3): WorldPoly {
  return {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([minX, y, minZ, maxX, y, minZ, maxX, y, maxZ, minX, y, maxZ]),
  };
}
function wallX(x: number, z0: number, z1: number, y0: number, y1: number): WorldPoly {
  return {
    modelName: 'worldmodel', path: 'worldmodel/wall', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([x, y0, z0, x, y0, z1, x, y1, z1, x, y1, z0]),
  };
}
const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
const ownersOf = (polys: WorldPoly[]): CollisionOwner[] => polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
const world = (polys: WorldPoly[]): Grid => buildGrid(PARAMS, [], [], polys, ownersOf(polys));
const PLAIN = [floor(-200, -200, 200, 200, 0)];
/** The yaw, in degrees, facing from (x, z) toward (tx, tz) (the camera looks down its own -z). */
const facing = (x: number, z: number, tx: number, tz: number): number => Math.atan2(-(tx - x), -(tz - z)) * 180 / Math.PI;

function walker(polys: WorldPoly[] = PLAIN, at: [number, number] = [0, 0]): Walker {
  const w = new Walker(world(polys));
  expect(w.place(at[0], 2, at[1])).toBe(true);
  return w;
}
/** Ticks until `done` (at most `max`): the tick it turned true on, 1-based, or -1. */
function until(w: Walker, done: () => boolean, input: WalkInput = STILL, max = 600): number {
  for (let i = 1; i <= max; i++) { w.tick(input); if (done()) return i; }
  return -1;
}
/** A walker at speed `v` (units a second) along its facing, as the dive and the moving swap need. */
function moving(v = 45): Walker {
  const w = walker();
  w.state.yaw = -90;
  w.state.vx = v;
  return w;
}

const reader = fixture('RUN/READERC.ZAR');
describe.skipIf(!reader)(`PAR-19: the body owners on the disc${reader ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it('every walk action and kit hold is a one-shot on the disc (motion.rdr looped 0), the idle a loop', () => {
    const table = motionTableFromArchive(reader!)!;
    const clipOf = (name: MoverActionName): string => (name === 'fall' ? SEAL_ANIMS.inAir : SEAL_ANIMS[name]);
    for (const name of Object.keys(ACTION_FAMILY) as MoverActionName[]) expect(table.get(clipOf(name))?.looped, name).toBe(false);
    for (const clip of Object.keys(HOLD_CLIPS)) expect(table.get(clip)?.looped, clip).toBe(false);
    expect(table.get(SEAL_ANIMS.stand)?.looped).toBe(true);
    expect(table.get(SEAL_ANIMS.swapMoving)?.blendOverlay).toBe(true);                    // the second channel's, not the stack's
  });
});

describe('PAR-19: the effective-action life model (research 251)', () => {

  it('a stance press while the crouched reload owns the body waits and is taken when the reload ends (FUN_00552ec0 D:L418927-418930, FUN_00552d60)', () => {
    const w = walker();
    w.stance = 'crouch';
    expect(w.hold('seal_crouch_reload', 1.9)).toBe(true);
    expect(w.effectiveAction().body).toMatchObject({ source: 'hold', name: 'seal_crouch_reload', family: 'reload' });
    expect(w.stanceGate('stand')).toBe('owned');
    w.changeStance('stand');
    expect(w.stance).toBe('crouch');
    expect(w.pendingStance).toBe('stand');
    expect(w.effectiveAction().pendingStance).toBe('stand');
    let stoodAt = -1;
    const holdEnd = until(w, () => { if (stoodAt < 0 && w.stance === 'stand') stoodAt = -2; return w.holding === null; });
    expect(holdEnd).toBeGreaterThan(60);                                                  // the 1.64 s clip ran
    expect(PENDING_STANCE_RETRY_READING).toBe('afterClocks');
    expect(stoodAt).toBe(-2);                                                             // taken on the tick the hold came off
    expect(w.stance).toBe('stand');
    expect(w.pendingStance).toBeNull();
    expect(w.action).toMatchObject({ name: 'standToCrouch', reversed: true });            // the get-up clip, on the floor
  });

  it('the request survives the whole one-shot: a full-body swap then prone, taken at the swap\'s end and not before', () => {
    const w = walker();
    expect(w.swapWeapon('pistol')?.action).toBe('swapStand');
    w.changeStance('prone');
    expect(w.stanceGate('prone')).toBe('owned');
    const seen: string[] = [];
    until(w, () => { seen.push(w.stance); return w.action?.name !== 'swapStand'; });
    expect(seen.slice(0, -1).every((s) => s === 'stand')).toBe(true);
    expect(w.stance).toBe('prone');
    expect(w.action?.name).toBe('standToProne');
  });

  it('a press back to the stance held takes the request back (the press writes actor+0x374 whole)', () => {
    const w = walker();
    w.stance = 'crouch';
    w.hold('seal_crouch_reload', 1.9);
    w.changeStance('stand');
    expect(w.pendingStance).toBe('stand');
    w.changeStance('crouch');
    expect(w.pendingStance).toBeNull();
    until(w, () => w.holding === null);
    for (let i = 0; i < 10; i++) w.tick(STILL);
    expect(w.stance).toBe('crouch');
  });

  it('an obstacle keeps the request: prone refused 11 short of a wall is taken once the SEAL turns along it (D:L418935-418940)', () => {
    const w = walker([...PLAIN, wallX(50, -150, 150, 0, 30)], [39, 0]);
    w.state.yaw = facing(39, 0, 100, 0);
    expect(w.stanceGate('prone')).toBe('kept');
    w.changeStance('prone');
    for (let i = 0; i < 30; i++) w.tick(STILL);
    expect(w.stance).toBe('stand');
    expect(w.pendingStance).toBe('prone');                                                // asked again every tick
    w.state.yaw = facing(39, 0, 39, -100);                                                // along the wall: both segments clear
    w.tick(STILL);
    expect(w.stance).toBe('prone');
    expect(w.pendingStance).toBeNull();
  });

  it('no headroom forgets the request: a stand refused under a roof is not taken once the SEAL walks out (D:L419007-419011)', () => {
    const roofed = (): Walker => {
      const w = walker([...PLAIN, floor(-20, -20, 20, 20, 10, 2)]);
      w.state.yaw = facing(0, 0, 100, 0);
      w.stance = 'crouch';
      return w;
    };
    const w = roofed();
    expect(w.stanceGate('stand')).toBe('reset');
    w.changeStance('stand');
    expect(w.stance).toBe('crouch');
    expect(w.pendingStance).toBeNull();
    until(w, () => w.state.x > 40, FORWARD);                                              // crouch-walked out from under it
    for (let i = 0; i < 10; i++) w.tick(STILL);
    expect(w.stance).toBe('crouch');
    const open = roofed();                                                                // the control: out from under it first
    until(open, () => open.state.x > 40, FORWARD);
    for (let i = 0; i < 10; i++) open.tick(STILL);
    open.changeStance('stand');
    expect(open.stance).toBe('stand');
  });

  it('a stance transition on top refuses only the stance it does not share (FUN_00588080 D:L445716-445734; D:L418932, D:L418953, D:L418995)', () => {
    const cases = [
      ['stand', 'crouch', 'standToCrouch', 'prone', 'stand'],      // 0x11 refuses prone
      ['crouch', 'prone', 'crouchToProne', 'stand', 'crouch'],     // 0x13 refuses stand
      ['stand', 'prone', 'standToProne', 'crouch', 'stand'],       // 0x19 refuses crouch
    ] as const;
    for (const [from, to, clip, refused, taken] of cases) {
      const w = walker();
      w.stance = from;
      w.changeStance(to);
      expect(w.action?.name, `${from} -> ${to}`).toBe(clip);
      expect(w.effectiveAction().body?.family).toBe('transition');
      expect(w.stanceGate(refused), `${clip} refuses ${refused}`).toBe('owned');
      expect(w.stanceGate(taken), `${clip} takes ${taken}`).toBe('open');
    }
    const w = walker();
    w.changeStance('crouch');
    w.changeStance('prone');                                                              // 0x11 on top: kept, then taken
    expect(w.stance).toBe('crouch');
    until(w, () => w.action?.name !== 'standToCrouch');
    expect(w.stance).toBe('prone');
  });

  it('the moving swap\'s overlay owns no body: a stance press under it is taken at once (FUN_005551a0: the top is the looped locomotion)', () => {
    const w = moving();
    expect(w.swapWeapon('pistol')?.overlay).toBe(true);
    expect(w.effectiveAction()).toMatchObject({ body: null, overlay: { clip: SEAL_ANIMS.swapMoving, family: 'swap' } });
    expect(w.stanceGate('crouch')).toBe('open');
    w.changeStance('crouch');
    expect(w.stance).toBe('crouch');
  });

  it('a swap owns the actor for the dive -- the full-body clip and the moving overlay, not a hold -- and with none the run dives (FUN_00584b00 D:L443995-444001, FUN_005a7980 D:L462471-462506)', () => {
    const still = walker();
    still.swapWeapon('pistol');
    expect(still.swapping()).toBe(true);
    const overlay = moving();
    overlay.swapWeapon('pistol');
    expect(overlay.swapping()).toBe(true);
    expect(new Traversal(overlay.grid, PLAIN).dive(overlay)).toBe(false);
    const reload = walker();
    reload.stance = 'prone';
    expect(reload.hold('seal_prone_reload')).toBe(true);
    expect(reload.swapping()).toBe(false);                                                 // a reload is no swap
    const free = moving();
    expect(free.swapping()).toBe(false);
    expect(new Traversal(free.grid, PLAIN).dive(free)).toBe(true);
  });

  it('the jump asks the same body owner: refused under the crouched reload, a throw and the full-body swap, taken when free (FUN_0057e1b0 D:L440805-440810)', () => {
    const reload = walker();
    reload.stance = 'crouch';
    reload.hold('seal_crouch_reload', 1.9);
    expect(reload.jump()).toBe(false);
    const thrown = walker();
    thrown.hold('seal_throwgrenade');
    expect(thrown.jump()).toBe(false);
    const swap = walker();
    swap.swapWeapon('pistol');
    expect(swap.jump()).toBe(false);
    expect(walker().jump()).toBe(true);
  });

  it('each end is heard once with its reason (onActionEnd): complete, cut, replaced, knock, completed', () => {
    const heard = (w: Walker): ActionEnd[] => { const out: ActionEnd[] = []; w.onActionEnd((e) => out.push(e)); return out; };
    const done = walker(), a = heard(done);
    done.hold('seal_throwgrenade');
    until(done, () => done.holding === null);
    expect(a).toEqual([{ body: { source: 'hold', name: 'seal_throwgrenade', family: 'throw', serial: 1 }, overlay: null, reason: 'complete' }]);
    expect(done.effectiveAction().lastEnd).toEqual(a[0]);
    const cut = walker(), b = heard(cut);
    cut.stance = 'crouch';
    cut.hold('seal_crouch_reload', 1.9);
    until(cut, () => cut.holding === null, FORWARD);
    expect(b.map((e) => [e.body?.family, e.reason])).toEqual([['reload', 'cut']]);
    const jumped = walker(), c = heard(jumped);
    jumped.jump();
    jumped.setAirborne(true);
    expect(c[0]).toMatchObject({ body: { name: 'jump', family: 'jump' }, reason: 'replaced' });
    const knocked = walker(), d = heard(knocked);
    knocked.hold('seal_throwgrenade');
    knocked.knock([0, 15, -5], 'fallBackwards');
    expect(d.map((e) => [e.body?.family, e.reason])).toEqual([['throw', 'knock']]);
    const swapped = moving(), e = heard(swapped);
    swapped.swapWeapon('pistol');
    expect(swapped.completeSwap()).toBe(true);
    expect(e).toEqual([{ body: null, overlay: { clip: SEAL_ANIMS.swapMoving, family: 'swap', serial: expect.any(Number) }, reason: 'completed' }]);
    const off = walker(), f: ActionEnd[] = [];
    const stop = off.onActionEnd((x) => f.push(x));
    stop();
    off.hold('seal_throwgrenade');
    until(off, () => off.holding === null);
    expect(f).toEqual([]);
  });
});

describe('PAR-19 through the real WalkMode coordinator and the room (research 251 section 2)', () => {
  const GROUND = packGround(PARAMS, PLAIN, ownersOf(PLAIN));
  const made: WalkMode[] = [];
  afterEach(() => { for (const m of made.splice(0)) m.unbindKey(); });

  function rig() {
    const c = document.createElement('canvas');
    c.setPointerCapture = () => undefined;
    c.releasePointerCapture = () => undefined;
    c.hasPointerCapture = () => false;
    const fly = new FlyCamera(c);
    const walk = new WalkMode(fly);
    made.push(walk);
    walk.setGround(GROUND, [0, 0, 0]);
    fly.setPose({ x: 5, y: 40, z: 6, yaw: 0, pitch: 0 });
    walk.setMode('walk');
    fly.groundWish = () => STILL;
    const sent: Omit<Command, 'seq'>[] = [];
    const stances: string[] = [];
    walk.setNetTap((cmd) => { sent.push(cmd); stances.push((walk as unknown as { walker: Walker }).walker.stance); });
    const frame = (): void => walk.frame(1 / 60);
    for (let i = 0; i < 10; i++) frame();
    return { walk, fly, sent, stances, frame, walker: (): Walker => (walk as unknown as { walker: Walker }).walker };
  }

  it('WalkMode: a stance press during the crouched reload rides the command, waits on the page and in the room, and both take it on the same tick', () => {
    const { walk, sent, stances, frame, walker } = rig();
    walk.setStance('crouch');
    for (let i = 0; i < 60; i++) frame();                                                 // the transition runs out
    const page = walker();
    expect(page.stance).toBe('crouch');
    const room = new MoverSim(new Walker(page.grid), null);
    room.walker.place(page.state.x, page.state.y + 2, page.state.z);
    room.walker.state.yaw = page.state.yaw;
    room.walker.stance = 'crouch';
    const from = sent.length;
    expect(walk.holdReload(1.9)).toBe(true);
    expect(walk.setStance('stand')).toBe(true);
    expect(walk.stance()).toBe('crouch');                                                 // waits on the page
    expect(walk.stanceIntent()).toBe('stand');
    for (let i = 0; i < 150; i++) frame();
    const cmds = sent.slice(from), seen = stances.slice(from);
    expect(cmds[0]!.buttons & Button.Stance).toBe(Button.Stance);
    expect(STANCE_CODES[cmds[0]!.stance]).toBe('stand');
    expect((cmds[0]!.buttons >> HOLD_SHIFT) & 0xf).not.toBe(0);                           // the hold on the same command
    const roomSeen: string[] = [];
    cmds.forEach((cmd, i) => { room.apply({ ...cmd, seq: i + 1 }); roomSeen.push(room.walker.stance); });
    expect(roomSeen[0]).toBe('crouch');                                                   // the room waits too
    const pageAt = seen.indexOf('stand'), roomAt = roomSeen.indexOf('stand');
    expect(pageAt).toBeGreaterThan(90);                                                   // after the 1.64 s reload, not before
    expect(roomAt).toBe(pageAt);
    expect(walk.stance()).toBe('stand');
  });

  it('WalkMode: the C key\'s second tap during the crouched reload takes the first back -- the press toggles from the request (FUN_00594cf0 D:L453351-453354)', () => {
    const { walk, frame } = rig();
    walk.bindKey();
    const tap = (): void => {
      globalThis.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyC' }));
      globalThis.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyC' }));
      frame(); frame();
    };
    tap();
    for (let i = 0; i < 60; i++) frame();
    expect(walk.stance()).toBe('crouch');
    expect(walk.holdReload(1.9)).toBe(true);
    tap();
    expect(walk.stance()).toBe('crouch');
    expect(walk.stanceIntent()).toBe('stand');
    tap();
    expect(walk.stanceIntent()).toBe('crouch');                                           // the request taken back
    for (let i = 0; i < 150; i++) frame();
    expect(walk.stance()).toBe('crouch');
  });

  it('WalkMode with the firearm: a reload under way on the run puts no hold on the mover, and the full press dives (research 230 section 1.1: the moving reload\'s overlay is no swap)', () => {
    const { walk, fly, frame, walker } = rig();
    let moves: Traversal | null = null;
    walk.useTraversal((w) => (moves = new Traversal(w.grid, PLAIN)));
    const scene = new Scene();
    const firearm = mountFirearm({
      scene, fly, walk, play: new Play(), remote: new RemotePlayers(scene), hud: new Hud(), loadouts: new PlayerLoadout(),
      view: () => null, map: () => null, body: () => null, net: () => null, blocked: () => false, refreshFog: () => {},
    });
    const fire = firearm.fire;
    for (let i = 0; i < 3; i++) { fire.shoot(); fire.update(0.2); }
    fly.groundWish = () => FORWARD;
    for (let i = 0; i < 60; i++) frame();
    expect(Math.hypot(walker().state.vx, walker().state.vz)).toBeGreaterThan(30);
    expect(fire.reload()).toBe(true);
    for (let i = 0; i < 30 && !fire.state().magazine.reloading; i++) { fire.update(1 / 60); frame(); }
    expect(fire.state().magazine.reloading).toBe(true);                                   // the reload under way, on the run
    expect(walker().effectiveAction()).toMatchObject({ body: null, overlay: null });       // no hold: the overlay is the pose's
    expect(Math.hypot(walker().state.vx, walker().state.vz)).toBeGreaterThan(30);
    expect(walk.setStance('prone')).toBe(true);
    expect(moves!.state().kind).toBe('dive');                                             // the dive itself (FUN_0057e540)
    expect(walker().action).toBeNull();                                                   // not the stance's transition clip
    expect(fire.state().magazine.reloading).toBe(true);
  });
});

describe("PAR-19 D07: the grenade's wind-up gives way to an eligible shoulder selection (research 251 section 4.1)", () => {
  // FUN_00594cf0 D:L453288-453310 asks the shoulder press of the kit's gates whatever the trigger holds; FUN_005c4b10
  // drops the wind-up on another slot (D:L478905-478915: bit 0x40 cleared at D:L478914, the power +0x11c zeroed by
  // FUN_00592d40 at D:L478915 -> D:L451964) and changes nothing on the same one.
  const snap = (): PlaySnapshot => ({
    feet: [100, 50, 200], yaw: 90, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: false, stance: 'stand', landing: null, jumps: 0,
  } as PlaySnapshot);
  function thrower() {
    const g = new GrenadeThrower({ grid: (): Grid | null => null, snapshot: snap, view: () => 'third' });
    const thrown: Parameters<GrenadeEvents['throw']>[0][] = [];
    g.on('throw', (t) => thrown.push(t));
    const windUp = (seconds = 0.3): void => {
      g.select('M67');
      g.pull();
      for (let t = 0; t < seconds - 1e-9; t += TICK) g.update(TICK);
      expect(g.phase()).toBe('holding');
      expect(g.stats().power).toBeGreaterThan(0.15);
    };
    const letGo = (): void => { g.release(); for (let t = 0; t < 2; t += TICK) g.update(TICK); };
    return { g, thrown, windUp, letGo };
  }

  it('an eligible selection during the wind-up takes the slot and drops the pressure: nothing spent, nothing thrown', () => {
    const toRifle = thrower();
    toRifle.windUp();
    const left = toRifle.g.stats().leftByItem;
    expect(toRifle.g.select('rifle')).toBe(true);
    expect(toRifle.g.equipped()).toBe(false);
    expect(toRifle.g.stats().power).toBe(0);
    toRifle.letGo();
    expect(toRifle.thrown).toEqual([]);
    expect(toRifle.g.stats().leftByItem).toEqual(left);
    const toSmoke = thrower();
    toSmoke.windUp();
    expect(toSmoke.g.select('AN-M8')).toBe(true);
    expect(toSmoke.g.held()).toBe('AN-M8');
    expect(toSmoke.g.phase()).toBe('ready');
    toSmoke.letGo();
    expect(toSmoke.thrown).toEqual([]);
  });

  it('an ineligible selection during the wind-up is refused and the wind-up goes on to its throw; the item in the hand changes nothing', () => {
    const f = thrower();
    f.windUp();
    expect(f.g.select('Detonator')).toBe(false);                                         // no charge down (FUN_005bdc30)
    expect(f.g.select('nothing' as 'rifle')).toBe(false);                                  // no such slot
    expect(f.g.select('M67')).toBe(true);                                                // the same slot: no change
    expect(f.g.phase()).toBe('holding');
    expect(f.g.stats().power).toBeGreaterThan(0.15);
    f.letGo();
    expect(f.thrown).toHaveLength(1);
  });

  it('after the release the selection is refused: the throw is under way and its grenade flies (the post-release control)', () => {
    const f = thrower();
    f.windUp();
    f.g.release();
    f.g.update(TICK);
    expect(f.g.phase()).toBe('throwing');
    expect(f.g.select('rifle')).toBe(false);
    expect(f.g.select('AN-M8')).toBe(false);
    for (let t = 0; t < 2; t += TICK) f.g.update(TICK);
    expect(f.thrown).toHaveLength(1);
  });

  it("the browser menu's cancel stays its own: the held trigger dropped, the slot kept (the control)", () => {
    const f = thrower();
    f.windUp();
    f.g.cancelMenuHold();
    expect(f.g.phase()).toBe('ready');
    expect(f.g.held()).toBe('M67');
    f.letGo();
    expect(f.thrown).toEqual([]);
  });
});

describe('PAR-19 D04/D08: one end reason for the clocks that outlive the mover\'s (research 251 section 4.2)', () => {
  it('a reload ends with one reason: complete, cancelled and a knock keep the magazine, rejected undoes it, replaced on a new hand', () => {
    const grid = world(PLAIN);
    /** A fresh rifle, three rounds fired (27), a reload begun: the magazine it selected at its start in (30). */
    const begun = () => {
      const fire = new Fire({ grid: () => grid, aim: () => ({ eye: [0, 20, 0], far: [0, 20, -1000] }) }, DEFAULT_RIFLE, undefined, () => 0.5);
      const ends: FireEvent[] = [];
      fire.subscribe((e) => { if (e.type === 'reloadEnd') ends.push(e); });
      for (let i = 0; i < 3; i++) { fire.shoot(); fire.update(0.2); }
      expect(fire.state().magazine.rounds).toBe(27);
      expect(fire.reload()).toBe(true);
      fire.update(RELOAD_DELAY + 0.001);
      expect(fire.state().magazine).toMatchObject({ rounds: 30, reloading: true });
      expect(ends).toEqual([]);
      return { fire, ends };
    };
    const done = begun();
    for (let t = 0; t < 4 && done.fire.state().magazine.reloading; t += TICK) done.fire.update(TICK);
    expect(done.ends).toEqual([expect.objectContaining({ completed: true, reason: 'complete' })]);
    const cancelled = begun();
    expect(cancelled.fire.cancelReload()).toBe(true);
    expect(cancelled.ends).toEqual([expect.objectContaining({ completed: false, reason: 'cancelled' })]);
    expect(cancelled.fire.state().magazine).toMatchObject({ rounds: 30, reloading: false });   // kept: an accepted cancel
    const knocked = begun();
    expect(knocked.fire.cancelReload('knock')).toBe(true);
    expect(knocked.ends).toEqual([expect.objectContaining({ completed: false, reason: 'knock' })]);
    expect(knocked.fire.state().magazine).toMatchObject({ rounds: 30, reloading: false });
    const rejected = begun();
    expect(rejected.fire.undoReload()).toBe(true);
    expect(rejected.ends).toEqual([expect.objectContaining({ completed: false, reason: 'rejected' })]);
    expect(rejected.fire.state().magazine).toMatchObject({ rounds: 27, reloading: false });   // the journal undone: the room's
    const swapped = begun();
    swapped.fire.setWeapon({ ...DEFAULT_RIFLE, name: 'other' });
    expect(swapped.ends).toEqual([expect.objectContaining({ completed: false, reason: 'replaced' })]);
  });

  it('a knock on the still reload\'s hold ends the page\'s reload as a knock, the magazine kept; the stick\'s cut and the clip\'s end do not (reloadEndOfBody)', () => {
    const run = (end: (w: Walker) => void) => {
      const w = walker();
      w.stance = 'prone';
      const fire = new Fire({ grid: () => w.grid, aim: () => ({ eye: [0, 20, 0], far: [0, 20, -1000] }) }, DEFAULT_RIFLE, undefined, () => 0.5);
      const reasons: string[] = [];
      fire.subscribe((e) => { if (e.type === 'reloadEnd') reasons.push(e.reason); });
      // The wave-4 wiring (research 251 section 8): the walk's ends to the reload.
      w.onActionEnd((e) => { const r = reloadEndOfBody(e); if (r) fire.cancelReload(r); });
      fire.shoot(); fire.update(0.2);
      expect(fire.state().magazine.rounds).toBe(29);
      fire.reload();
      fire.update(RELOAD_DELAY + 0.001);
      expect(fire.state().magazine).toMatchObject({ rounds: 30, reloading: true });
      expect(w.hold('seal_prone_reload')).toBe(true);
      end(w);
      return { fire, reasons };
    };
    const knocked = run((w) => w.knock([0, 15, -5], 'fallBackwards'));
    expect(knocked.reasons).toEqual(['knock']);
    expect(knocked.fire.state().magazine).toMatchObject({ rounds: 30, reloading: false });
    const cut = run((w) => { for (let i = 0; i < 90 && w.holding; i++) w.tick(FORWARD); });
    expect(cut.reasons).toEqual([]);                                                      // the cut is the reload's own path
    expect(reloadEndOfBody({ body: { source: 'hold', name: 'seal_prone_reload', family: 'reload', serial: 1 }, overlay: null, reason: 'complete' })).toBeNull();
    expect(reloadEndOfBody({ body: { source: 'hold', name: 'seal_throwgrenade', family: 'throw', serial: 1 }, overlay: null, reason: 'knock' })).toBeNull();
  });

  it('a still reload\'s hold replaced off the floor ends no reload at the take-off, as the room ends none there: the fall covers the clip and its lock holds in the air (PAR-28 end 4, research 251 s12.3: the landing ends it, `onStackPop`); a hold over it is refused and ends nothing (PAR-29, s11)', () => {
    const run = (end: (w: Walker) => void, ends: string[]) => {
      const w = walker();
      w.stance = 'prone';
      const fire = new Fire({ grid: () => w.grid, aim: () => ({ eye: [0, 20, 0], far: [0, 20, -1000] }) }, DEFAULT_RIFLE, undefined, () => 0.5);
      const reasons: string[] = [];
      fire.subscribe((e) => { if (e.type === 'reloadEnd') reasons.push(e.reason); });
      const bodyEnds: string[] = [];
      w.onActionEnd((e) => { if (e.body?.family === 'reload') bodyEnds.push(e.reason); const r = reloadEndOfBody(e); if (r) fire.cancelReload(r); });
      fire.shoot(); fire.update(0.2);
      fire.reload();
      fire.update(RELOAD_DELAY + 0.001);
      expect(w.hold('seal_prone_reload')).toBe(true);
      end(w);
      expect(bodyEnds).toEqual(ends);                                                      // off the floor: a replacement
      return { fire, reasons };
    };
    const over = (w: Walker) => { expect(w.hold('seal_prone_reload')).toBe(false); expect(w.holding?.clip).toBe('seal_prone_reload'); };
    for (const [end, ends] of [[(w: Walker) => w.setAirborne(true), ['replaced']], [over, []]] as const) {
      const { fire, reasons } = run(end, [...ends]);
      expect(reasons).toEqual([]);
      expect(fire.state().magazine).toMatchObject({ rounds: 30, reloading: true });           // the lock runs on, as the room's does (to the landing)
    }
    expect(reloadEndOfBody({ body: { source: 'hold', name: 'seal_crouch_reload', family: 'reload', serial: 1 }, overlay: null, reason: 'replaced' })).toBeNull();
  });

  it('PAR-28 end 1: a knock during a bolt\'s after-shot clip ends its lock and clip, the knock\'s end (the pop, FUN_0058a4d0 D:L440997, with the kit\'s timer 0, D:L476550-476560; the room\'s endStillReload the same)', () => {
    const w = walker();
    w.stance = 'prone';
    const bolt: WeaponRecord = { ...DEFAULT_RIFLE, name: 'M40A1', id: 102, fireModes: [1], maxFireMode: 1, fireWait: 0.5, magazine: 25, mags: 1, reloadAfterShot: true, reloadDelayAfterShot: 0.5 };
    const fire = new Fire({ grid: () => w.grid, aim: () => ({ eye: [0, 20, 0], far: [0, 20, -1000] }), reloadSeconds: () => 2.2 }, bolt, undefined, () => 0.5);
    const events: FireEvent[] = [];
    fire.subscribe((e) => events.push(e));
    w.onActionEnd((e) => { const r = reloadEndOfBody(e); if (r) fire.cancelReload(r); });    // 8.2's wiring
    expect(fire.shoot()).not.toBeNull();
    fire.update(0.501);                                                                    // the bolt's lock out: its clip
    expect(events.some((e) => e.type === 'afterShot')).toBe(true);
    expect(w.hold('seal_prone_reload')).toBe(true);                                        // the hold matchFirearm lays for it
    w.knock([0, 15, -5], 'fallBackwards');
    expect(fire.state().afterShot).toBe(false);
    expect(events.flatMap((e) => (e.type === 'reloadEnd' ? [e.reason] : []))).toEqual(['knock']);
    fire.update(0.6);                                                                      // the bolt's rate
    expect(fire.shoot()).not.toBeNull();                                                   // free, as the room frees it
  });

  // PAR-85 B3 (research 251 section 12.9): a throw pops at its hold's end, its own end too. Was titled "the throw's pose ends
  // on a cut, a knock or a replacement of its hold, not on the hold's own end (throwPoseEnds)". NU-8b B3 (research 326
  // section 6 B3, D6): a placing is the stack's top too, popped at its hold's end whatever the reason -- its own end on
  // the hold's clock (PAR-74, PAR-75). Was titled "...; a placing's on a cut, a knock or a replacement, not on its own end
  // (throwPoseEnds)", and its own end answered false.
  it("the throw's and the placing's pose end with their hold whatever the reason, the hold's own end too (throwPoseEnds)", () => {
    const throwHold = { source: 'hold' as const, name: 'seal_throwgrenade' as const, family: 'throw' as const, serial: 1 };
    expect(throwPoseEnds({ body: throwHold, overlay: null, reason: 'cut' })).toBe(true);
    expect(throwPoseEnds({ body: throwHold, overlay: null, reason: 'knock' })).toBe(true);
    expect(throwPoseEnds({ body: { ...throwHold, name: 'seal_place_claymore', family: 'place' }, overlay: null, reason: 'replaced' })).toBe(true);
    expect(throwPoseEnds({ body: throwHold, overlay: null, reason: 'complete' })).toBe(true);
    expect(throwPoseEnds({ body: { ...throwHold, name: 'seal_place_claymore', family: 'place' }, overlay: null, reason: 'complete' })).toBe(true);   // NU-8b B3; was false
    expect(throwPoseEnds({ body: { ...throwHold, name: 'seal_put_onwall', family: 'place' }, overlay: null, reason: 'complete' })).toBe(true);
    expect(throwPoseEnds({ body: { ...throwHold, name: 'seal_place_claymore', family: 'place' }, overlay: null, reason: 'cut' })).toBe(true);
    expect(throwPoseEnds({ body: { ...throwHold, name: 'seal_crouch_reload', family: 'reload' }, overlay: null, reason: 'cut' })).toBe(false);
    expect(throwPoseEnds({ body: { source: 'action', name: 'jump', family: 'jump', serial: 2 }, overlay: null, reason: 'cut' })).toBe(false);
  });

  it('WalkMode.onActionEnd hears the walk\'s mover, a respawn\'s new one too, and stops at the unsubscribe', () => {
    const c = document.createElement('canvas');
    c.setPointerCapture = () => undefined;
    c.releasePointerCapture = () => undefined;
    c.hasPointerCapture = () => false;
    const fly = new FlyCamera(c);
    const walk = new WalkMode(fly);
    walk.setGround(packGround(PARAMS, PLAIN, ownersOf(PLAIN)), [0, 0, 0]);
    fly.setPose({ x: 5, y: 40, z: 6, yaw: 0, pitch: 0 });
    walk.setMode('walk');
    fly.groundWish = () => STILL;
    const heard: ActionEnd[] = [];
    const stop = walk.onActionEnd((e) => heard.push(e));
    expect(walk.hold('seal_throwgrenade')).toBe(true);
    for (let i = 0; i < 120; i++) walk.frame(1 / 60);
    expect(heard.map((e) => [e.body?.name, e.reason])).toEqual([['seal_throwgrenade', 'complete']]);
    expect(walk.respawn([0, 0, 0], 0)).toBe(true);
    expect(walk.hold('seal_throwgrenade')).toBe(true);
    for (let i = 0; i < 120; i++) walk.frame(1 / 60);
    expect(heard).toHaveLength(2);
    stop();
    expect(walk.hold('seal_throwgrenade')).toBe(true);
    for (let i = 0; i < 120; i++) walk.frame(1 / 60);
    expect(heard).toHaveLength(2);
    walk.unbindKey();
  });

  // The grenade follows its throw's hold through the snapshot it reads (`PlaySnapshot.hold`, `holdSerial`).
  function throwOn(w: Walker | null) {
    const snapshot = (): PlaySnapshot => (w ? { ...moverSnapshot(w, null, 0, 0), feet: [w.state.x, w.state.y, w.state.z] } as PlaySnapshot : ({
      feet: [0, 0, 0], yaw: 0, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: false, stance: 'stand', landing: null, jumps: 0,
    } as PlaySnapshot));
    const g = new GrenadeThrower({ grid: () => w?.grid ?? null, snapshot, view: () => 'third' });
    const thrown: unknown[] = [];
    g.on('throw', (t) => thrown.push(t));
    g.on('throwStart', (e) => { w?.hold(e.hold); });
    g.select('M67');
    const left = g.stats().leftByItem.M67!;
    g.pull();
    const step = (input: WalkInput = STILL): void => { w?.tick(input); g.update(TICK); };
    for (let i = 0; i < 36; i++) step();
    g.release();
    step();
    expect(g.phase()).toBe('throwing');
    return { g, thrown, left, step };
  }

  it('the throw\'s busy tail ends with its hold\'s cut: the grenade in the air and the spent one stay (D08)', () => {
    const w = walker();
    const f = throwOn(w);
    let t = 0, holdEnd = -1;
    while (f.g.phase() === 'throwing' && t < 240) { f.step(FORWARD); t++; if (holdEnd < 0 && !w.holding) holdEnd = t; }
    expect(holdEnd).toBeGreaterThan(0);
    expect(t - holdEnd).toBeLessThanOrEqual(1);                                           // ended with the hold's cut
    const own = throwOn(null);
    let n = 0;
    while (own.g.phase() === 'throwing' && n < 240) { own.step(); n++; }
    expect(t).toBeLessThan(n - 20);                                                       // not the clip's own tail
    expect(f.g.phase()).toBe('ready');
    expect(f.thrown).toHaveLength(1);
    expect(f.g.stats().leftByItem.M67).toBe(f.left - 1);                                  // spent, not refunded
    expect(f.g.stats().live).toHaveLength(1);                                             // flying
  });

  it('uncut, the busy tail runs to the clip\'s end with the hold; with no hold on the body it keeps its own clock (the controls)', () => {
    const w = walker();
    const f = throwOn(w);
    let ticks = 0, holdEnd = -1;
    while (f.g.phase() === 'throwing' && ticks < 240) { f.step(); ticks++; if (holdEnd < 0 && !w.holding) holdEnd = ticks; }
    for (let i = 0; holdEnd < 0 && i < 240; i++) { f.step(); if (!w.holding) holdEnd = ticks + i + 1; }
    expect(f.thrown).toHaveLength(1);
    expect(ticks).toBeGreaterThan(60);                                                    // the clip played out
    expect(Math.abs(holdEnd - ticks)).toBeLessThanOrEqual(3);                             // with the hold's own end
    const none = throwOn(null);
    let own = 0;
    while (none.g.phase() === 'throwing' && own < 240) { none.step(); own++; }
    expect(none.thrown).toHaveLength(1);
    expect(Math.abs(own - ticks)).toBeLessThanOrEqual(2);                                 // the same clip's length either way
  });
});

const pack = fixture('RUN/MOTION_P.ZAR');
describe.skipIf(!reader || !pack)(`PAR-19 D08: the throw's pose on the disc's clip${reader && pack ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  // PAR-85 B1/B3 (research 251 section 12.9): the cut pops the throw (the stack's top). Was titled "a cut stops the throw's
  // clip where it is and fades the layer out from the cut; uncut it plays to its end" (a 0.4 s linear fade from the cut).
  it("a cut pops the throw's clip where it is, asking the body's cross-fade over the play beneath's BlendTime; held uncut, it stays at 1 past its last key", () => {
    const table = motionTableFromArchive(reader!)!;
    const clips = new Map(clipsFromPack(pack!, HAND_ANIMS.map((a) => a.clip)).map((c) => [c.name, c]));
    const anim = HAND_ANIMS.find((a) => a.clip === 'seal_throwgrenade')!;
    const cut = new ThrowPose(() => ({ clips, table })), whole = new ThrowPose(() => ({ clips, table }));
    expect(cut.start(anim, true)).toBe(true);
    expect(whole.start(anim, true)).toBe(true);
    const under = { clip: clips.get(anim.clip)!, frame: 0, phase: 0 };                   // the play beneath (no BlendTime: 0.4)
    for (let i = 0; i < 60; i++) { cut.step(TICK); whole.step(TICK); cut.layer.sample(under); whole.layer.sample(under); }
    const at = cut.stats().phase;
    cut.cut();
    cut.step(TICK);
    whole.step(TICK);
    expect(cut.playing()).toBe(false);                                                    // popped at the cut
    expect(cut.stats().phase).toBeCloseTo(at, 9);                                         // where the body left it
    expect(cut.layer.sample(under)).toEqual({ parts: [], weight: 0, crossFade: 0.4, crossFadeRun: TICK });
    expect(cut.layer.sample(under)).toBeNull();                                           // dropped: one cross-fade
    expect(whole.stats().phase).toBeGreaterThan(at);
    expect(whole.stats().weight).toBe(1);
    for (let i = 0; i < 60; i++) whole.step(TICK);                                        // past its last key
    expect(whole.playing()).toBe(true);                                                   // held: off at its hold's end
    expect(whole.stats().weight).toBe(1);
  });
});

/**
 * D02 (research 251 section 6; research 230 section 1.1 "Still reload, then jump"): reproduced through the real
 * coordinator -- `WalkMode` with the one firearm (`mountFirearm`), as both pages mount it. A reload begun standing still
 * puts no hold on the mover (`reloadHold` names none standing: `seal_reload` gives way to the first push), so the jump
 * press starts the standing Jump while `Fire` still reloads. In the original `seal_reload` is a one-shot on the stack
 * (`motion.rdr` looped 0, not `BlendOverlay`) and `FUN_0057e1b0` refuses the jump unless the top is looped
 * (D:L440805-440810). PARITY-1 D02 (research 251 section 6): the walk asks the still clip's life on its command clock
 * (`./stillReloadLife`, the room's `reloadLife` rule), wired by `mountFirearm` over the page's clips -- so the page here
 * carries the disc's clips (without them no life is held: the named gap). Setup and its checks run in `beforeAll`.
 */
describe.skipIf(!reader || !pack)(`PAR-19 D02: the standing reload and the jump through the real WalkMode and firearm (research 251 section 6)${reader && pack ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  let jumped = true;
  beforeAll(() => {
    const scene = new Scene();
    const c = document.createElement('canvas');
    c.setPointerCapture = () => undefined;
    c.releasePointerCapture = () => undefined;
    c.hasPointerCapture = () => false;
    const fly = new FlyCamera(c);
    const walk = new WalkMode(fly);
    walk.setGround(packGround(PARAMS, PLAIN, ownersOf(PLAIN)), [0, 0, 0]);
    fly.setPose({ x: 5, y: 40, z: 6, yaw: 0, pitch: 0 });
    walk.setMode('walk');
    fly.groundWish = () => STILL;
    const play = new Play();
    const table = motionTableFromArchive(reader!)!;
    play.setClips({ clips: clipsFromPack(pack!, ['seal_reload', 'seal_mv_reload']), table: [...table] });
    const firearm = mountFirearm({
      scene, fly, walk, play, remote: new RemotePlayers(scene), hud: new Hud(), loadouts: new PlayerLoadout(),
      view: () => null, map: () => null, body: () => null, net: () => null, blocked: () => false, refreshFog: () => {},
    });
    for (let i = 0; i < 10; i++) walk.frame(1 / 60);
    const fire = firearm.fire;
    for (let i = 0; i < 3; i++) { fire.shoot(); fire.update(0.2); }
    expect(fire.reload()).toBe(true);
    for (let i = 0; i < 30; i++) { fire.update(1 / 60); walk.frame(1 / 60); }
    expect(fire.state().magazine.reloading).toBe(true);                                   // a still standing reload under way
    expect(walk.mover()?.airborne).toBe(false);
    jumped = walk.jump();
    walk.unbindKey();
  });
  // FUN_0057e1b0 D:L440805-440810: the standing still reload's one-shot on top refuses the jump.
  it('a still standing reload refuses the jump (FUN_0057e1b0 D:L440805-440810)', () => expect(jumped).toBe(false));
});

describe('PARITY-1 close: the victory dance in the effective-action model (research 251 section 9; research 303 section 3)', () => {
  // Synthetic metadata only (as `packages/central/test/victory.test.ts`): `victory_funky`'s 85 keys and 2.5 s playback off
  // research 303 section 2; the root's X keys `stride` a key, so the dance carries the mover along its facing.
  type DanceClip = Parameters<Walker['setVictoryMotion']>[0];
  const dance = (stride = 0): DanceClip => {
    const t = new Float32Array(85 * 3);
    for (let i = 0; i < 85; i++) t[3 * i] = i * stride;
    return { name: 'victory_funky', frameCount: 85, parts: [{ name: 'skel_root', translations: t }] } as unknown as DanceClip;
  };
  const MOTION = { playback: 2.5, noFire: 1 };
  const heard = (w: Walker): ActionEnd[] => { const out: ActionEnd[] = []; w.onActionEnd((e) => out.push(e)); return out; };
  const dancing = (w: Walker = walker(), stride = 0): Walker => { w.setVictoryMotion(dance(stride), MOTION); expect(w.victoryMotion).not.toBeNull(); return w; };
  const VICTORY = { source: 'victory', name: 'victory', family: 'victory' } as const;

  it('(a) the dance is the body owner, of its own family -- its own action type pushed on the stack as the jump\'s are (FUN_0057dcc0 D:L440588; FUN_0057e1b0 D:L440820, D:L440843)', () => {
    const w = dancing();
    expect(w.bodyOwner()).toEqual({ ...VICTORY, serial: 1 });
    expect(w.effectiveAction().body).toEqual({ ...VICTORY, serial: 1 });
    expect(w.effectiveAction().overlay).toBeNull();
    const again = dancing(walker());
    again.stopVictoryMotion();
    dancing(again);
    expect(again.bodyOwner()?.serial).toBe(2);                                             // each start counts once
  });

  it('(b) a stance press under the dance waits as the request and is taken when the dance ends (FUN_00552ec0 D:L418927-418930: a looped(0) top, no transition)', () => {
    const w = dancing(), ends = heard(w);
    expect(w.stanceGate('crouch')).toBe('owned');
    w.changeStance('crouch');
    expect(w.stance).toBe('stand');
    expect(w.pendingStance).toBe('crouch');
    expect(w.victoryMotion).not.toBeNull();                                                // the press did not take the body
    const off = until(w, () => w.victoryMotion === null);
    expect(off).toBeGreaterThan(140);                                                      // 2.5 x (84/85)^2 = 2.44 s
    expect(ends[0]).toMatchObject({ body: VICTORY, reason: 'complete' });
    expect(w.stance).toBe('crouch');
    expect(w.pendingStance).toBeNull();
    expect(w.action).toMatchObject({ name: 'standToCrouch' });
  });

  it('(c) the swap is refused under the dance; the full press dives out of it at a run\'s speed, the dance replaced (FUN_00594cf0 D:L453387-453389, FUN_0057e540 D:L440882-440897)', () => {
    const still = dancing();
    expect(still.bodyOwner()?.family).toBe('victory');
    expect(still.swapRefused(false)).toBe(true);
    expect(still.swapWeapon('pistol')).toBeNull();
    expect(still.victoryMotion).not.toBeNull();
    // The dance's first tick: the run's velocity is still the actor's (FUN_00584b00's 900 at D:L443998; VICTORY_DIVE_READING).
    const w = moving(), ends = heard(w);
    dancing(w);
    w.state.vx = 45;
    expect(new Traversal(w.grid, PLAIN).dive(w)).toBe(true);
    expect(w.stance).toBe('prone');
    expect(w.victoryMotion).toBeNull();
    expect(ends.map((e) => [e.body?.family, e.reason])).toEqual([['victory', 'replaced']]);
    const slow = dancing(walker());                                                        // under 30 a second: no dive
    expect(new Traversal(slow.grid, PLAIN).dive(slow)).toBe(false);
    expect(slow.victoryMotion).not.toBeNull();
  });

  it('(f) the dance\'s start clears a jump under way on the page (replaced) and the dance plays; a hold under way wins, as on the room (FUN_0057dcc0 D:L440586, FUN_0058a4d0)', () => {
    const w = walker(), ends = heard(w);
    expect(w.jump()).toBe(true);
    expect(w.action?.name).toBe('jump');
    dancing(w);
    expect(ends.map((e) => [e.body?.name, e.reason])).toEqual([['jump', 'replaced']]);
    expect(w.action).toBeNull();
    expect(w.bodyOwner()).toMatchObject(VICTORY);
    for (let i = 0; i < 10; i++) w.tick(STILL);
    expect(w.victoryMotion).not.toBeNull();                                                // still dancing
    expect(ends).toHaveLength(1);
    // A hold the page has when it hears the dance came from a command after the dance's seq (the room starts a dance only
    // on a free body, `victoryStatus`): the room ran that command's hold over the dance (`MoverSim.apply`'s `w.hold`,
    // `Walker.hold`'s `endVictory`), so the hold wins on the page too -- the dance counts and ends at once, replaced.
    for (const [clip, family, period] of [['seal_throwgrenade', 'throw', undefined], ['seal_crouch_reload', 'reload', 1.9]] as const) {
      const held = walker(), h = heard(held);
      expect(held.hold(clip, period)).toBe(true);
      const starts = held.holdStarts, at = [held.state.x, held.state.z];
      held.setVictoryMotion(dance(4), MOTION);
      expect(h.map((e) => [e.body?.family, e.reason])).toEqual([['victory', 'replaced']]);
      expect(held.victoryMotion).toBeNull();
      expect(held.holding?.clip).toBe(clip);
      expect(held.holdStarts).toBe(starts);
      expect(held.bodyOwner()).toMatchObject({ source: 'hold', name: clip, family });
      held.advanceVictory(3);                                                               // no dance: no root travel
      expect([held.state.x, held.state.z]).toEqual(at);
    }
  });

  it('(g) a port invariant for page/room agreement, not the original\'s behaviour: a stance transition the page started after the dance\'s seq comes off as the room never ran it: the stance back, the press the request, taken by the gate at the dance\'s end (FUN_0058a4d0 D:L440586; FUN_00552ec0 D:L418927-418930; FUN_00552d60 D:L418867-418908)', () => {
    // The room starts a dance only on a free body (`victoryStatus`: `!w.action`), so a transition on the page's mover when
    // it hears the dance rode a command after the dance's `seq`: the room ran that press under the dance, where the gate
    // kept it as the request (case (b)). The page's mover ends in the room's state: the stance before the transition, the
    // press pending, the dance playing; at the dance's end the gate takes the press with its transition, as the room's.
    const w = walker(), ends = heard(w);
    w.changeStance('crouch');
    expect(w.stance).toBe('crouch');                                                       // the page took it at once
    expect(w.action).toMatchObject({ name: 'standToCrouch', reversed: false });
    for (let i = 0; i < 3; i++) w.tick(STILL);                                            // the clip under way
    dancing(w);
    expect(ends.map((e) => [e.body?.name, e.reason])).toEqual([['standToCrouch', 'replaced']]);
    expect(w.action).toBeNull();
    expect(w.stance).toBe('stand');
    expect(w.pendingStance).toBe('crouch');
    expect(w.bodyOwner()).toMatchObject(VICTORY);
    expect(w.stanceGate('crouch')).toBe('owned');
    for (let i = 0; i < 10; i++) w.tick(STILL);
    expect(w.victoryMotion).not.toBeNull();                                                // the dance plays on
    expect(w.stance).toBe('stand');
    const off = until(w, () => w.victoryMotion === null);
    expect(off).toBeGreaterThan(130);                                                      // 2.44 s less the 10 ticks above
    expect(ends.slice(1).map((e) => [e.body?.family, e.reason])).toEqual([['victory', 'complete']]);
    expect(w.stance).toBe('crouch');                                                       // the gate took it, with its clip
    expect(w.pendingStance).toBeNull();
    expect(w.action).toMatchObject({ name: 'standToCrouch', reversed: false });
    // Each transition and its reversal; a press the transition refused (still the request) or took (the word changed, no
    // new clip) during it ends as the room's last press left it: pending, or nothing pending.
    const cases: [start: 'stand' | 'crouch' | 'prone', presses: ('stand' | 'crouch' | 'prone')[], clip: MoverActionName, back: string, pending: string | null][] = [
      ['crouch', ['stand'], 'standToCrouch', 'crouch', 'stand'],
      ['crouch', ['prone'], 'crouchToProne', 'crouch', 'prone'],
      ['prone', ['crouch'], 'crouchToProne', 'prone', 'crouch'],
      ['stand', ['prone'], 'standToProne', 'stand', 'prone'],
      ['prone', ['stand'], 'standToProne', 'prone', 'stand'],
      ['stand', ['crouch', 'prone'], 'standToCrouch', 'stand', 'prone'],                   // 0x11 refuses prone: pending
      ['stand', ['crouch', 'stand'], 'standToCrouch', 'stand', null],                      // the press back: nothing pending
    ];
    for (const [start, presses, clip, back, pending] of cases) {
      const m = walker();
      m.stance = start;
      for (const p of presses) m.changeStance(p);
      expect(m.action?.name).toBe(clip);
      dancing(m);
      expect([m.stance, m.pendingStance, m.action]).toEqual([back, pending, null]);
      until(m, () => m.victoryMotion === null);
      expect(m.stance).toBe(pending ?? back);
      expect(m.pendingStance).toBeNull();
    }
  });

  it('(d) the jump asks the same body owner: refused under the dance, taken once it ended (FUN_0057e1b0 D:L440810)', () => {
    const w = dancing(), ends = heard(w);
    expect(w.bodyOwner()?.family).toBe('victory');
    expect(w.jump()).toBe(false);
    until(w, () => w.victoryMotion === null);
    expect(ends.map((e) => [e.body?.family, e.reason])).toEqual([['victory', 'complete']]);
    expect(w.jump()).toBe(true);
  });

  it('(e) each end of the dance is heard once with its reason: stopped (its owner), complete, cut, death, knock, replaced and off the floor', () => {
    const stopped = dancing(), a = heard(stopped);
    stopped.stopVictoryMotion();
    expect(a).toEqual([{ body: { ...VICTORY, serial: 1 }, overlay: null, reason: 'stopped' }]);
    expect(stopped.effectiveAction()).toMatchObject({ body: null, lastEnd: a[0] });
    stopped.stopVictoryMotion();
    expect(a).toHaveLength(1);
    const cut = dancing(), b = heard(cut);
    cut.tick(FORWARD);
    expect(b.map((e) => [e.body?.family, e.reason])).toEqual([['victory', 'cut']]);
    const dead = dancing(), c = heard(dead);
    dead.dead = true;
    dead.tick(STILL);
    expect(c.map((e) => [e.body?.family, e.reason])).toEqual([['victory', 'death']]);
    const knocked = dancing(), d = heard(knocked);
    knocked.knock([0, 15, -5], 'fallBackwards');
    expect(d.map((e) => [e.body?.family, e.reason])).toEqual([['victory', 'knock']]);
    const replaced = dancing(), e = heard(replaced);
    replaced.setAirborne(true);
    expect(e.map((x) => [x.body?.family, x.reason])).toEqual([['victory', 'replaced']]);
    const held = dancing(), f = heard(held);
    expect(held.hold('seal_throwgrenade')).toBe(true);                                    // a hold's push clears the stack first
    expect(f.map((x) => [x.body?.family, x.reason])).toEqual([['victory', 'replaced']]);
    expect(held.victoryMotion).toBeNull();
    // Off the floor: the dance's own root carries the SEAL over a 30-unit drop (the take-off), the fall's clip takes over.
    const ledge = [floor(-200, -200, 10, 200, 0), floor(10, -200, 200, 200, -30)];
    const off = dancing(walker(ledge), 1), g = heard(off);
    off.state.yaw = 0;                                                                     // the root's X keys along +x
    expect(until(off, () => off.airborne, STILL, 120)).toBeGreaterThan(0);
    expect(g.map((x) => [x.body?.family, x.reason])).toEqual([['victory', 'replaced']]);
    expect(off.action?.name).toBe('fall');
  });

  it('(e) the page and the room end it through the model: WalkMode.syncVictoryMotion(null) is the dance\'s own stop', () => {
    const c = document.createElement('canvas');
    c.setPointerCapture = () => undefined;
    c.releasePointerCapture = () => undefined;
    c.hasPointerCapture = () => false;
    const fly = new FlyCamera(c);
    const walk = new WalkMode(fly);
    walk.setGround(packGround(PARAMS, PLAIN, ownersOf(PLAIN)), [0, 0, 0]);
    fly.setPose({ x: 5, y: 40, z: 6, yaw: 0, pitch: 0 });
    walk.setMode('walk');
    fly.groundWish = () => STILL;
    for (let i = 0; i < 10; i++) walk.frame(1 / 60);
    const ends: ActionEnd[] = [];
    walk.onActionEnd((e) => ends.push(e));
    walk.syncVictoryMotion({ serial: 1, elapsed: 0 }, dance(), MOTION);
    expect(walk.victoryMotionActive()).toBe(true);
    expect(walk.jump()).toBe(false);                                                       // the page's press refused on its mover
    walk.syncVictoryMotion(null);
    expect(walk.victoryMotionActive()).toBe(false);
    expect(ends.map((e) => [e.body?.family, e.reason])).toEqual([['victory', 'stopped']]);
    walk.unbindKey();
  });
});
