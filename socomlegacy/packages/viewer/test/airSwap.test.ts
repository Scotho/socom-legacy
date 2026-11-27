// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { Scene } from 'three';
import { FlyCamera } from '../src/camera';
import { AIR_SWAP_OWNER_DIVERGENCE_ADAPTATION, RUNNING_JUMP_SPEED, groundGrid, packGround, Walker, WalkMode, type GroundData } from '../src/walk';
import { MoverSim } from '../src/net/moverSim';
import { Button, type Command } from '../src/net/protocol';
import { mountThrowables, type MatchThrowDeps } from '../src/matchThrow';
import { PlayerLoadout } from '../src/loadout';

/**
 * B-65 (OWNER-DECISIONS C2; MISSION OT.R151, pending seat-merge): the owner's INTENTIONAL DIVERGENCE -- "allow swapping
 * equipment while in the air everywhere. this includes nade swapping." The original refuses a swap pressed in the air
 * (`FUN_00594cf0`'s gate, `FUN_005a8cb0`: the body free -- alive, not in the air; `FUN_005b4340(actor, 4)` refuses under
 * the jump's launch and fall; research 201 §1, 211 §2); under `AIR_SWAP_OWNER_DIVERGENCE_ADAPTATION` the port takes it,
 * on the page and in the room alike (one mover, `Walker.swapRefused`). Everything else stands: the scope, a swap
 * playing, a knock-down, and a reload in the air (`FUN_005c2a90` D:L477395) are still refused.
 */

const canvas = (): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.setPointerCapture = () => undefined;
  c.releasePointerCapture = () => undefined;
  c.hasPointerCapture = () => false;
  return c;
};

const GROUND: GroundData = packGround(
  { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 },
  [{
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-200, 0, 200, 200, 0, 200, 200, 0, -200, -200, 0, -200]),
  }],
  [{ modelName: 'worldmodel', path: 'worldmodel/floor', first: 0, count: 1 }],
);

/** A wide floor (4000 u a side) for a run and a running jump. */
const WIDE: GroundData = packGround(
  { atomCount: 8192, posts: 16, cellDim: 400, cellsX: 10, cellsZ: 10, originX: -2000, originZ: -2000 },
  [{
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-2000, 0, 2000, 2000, 0, 2000, 2000, 0, -2000, -2000, 0, -2000]),
  }],
  [{ modelName: 'worldmodel', path: 'worldmodel/floor', first: 0, count: 1 }],
);

/** A page walking on the floor, and the room's mover fed every command it sends. `stick.forward` drives the page. */
function rig(ground: GroundData = GROUND) {
  const fly = new FlyCamera(canvas());
  const walk = new WalkMode(fly);
  walk.setGround(ground, [0, 0, 0]);
  fly.setPose({ x: 5, y: 40, z: 6, yaw: 0, pitch: 0 });
  walk.setMode('walk');
  const stick = { forward: 0 };
  fly.groundWish = () => ({ forward: stick.forward, right: 0, boost: false });
  const server = new MoverSim(new Walker(groundGrid(ground)), null);
  server.walker.place(5, 40 - 10, 6);
  let seq = 0;
  const sent: Omit<Command, 'seq'>[] = [];
  walk.setNetTap((cmd) => { sent.push(cmd); server.apply({ ...cmd, seq: ++seq }); });
  const tick = (): Omit<Command, 'seq'>[] => { const from = sent.length; walk.frame(1 / 60); return sent.slice(from); };
  for (let i = 0; i < 10; i++) tick();                           // settled on the floor
  const page = walk.ephWalker() as Walker;
  /** Both bodies thrown up at `vy` on the same command: the fall's action on top, in the air for some 40 ticks. */
  const launch = (vy = 300): void => { page.setAirborne(true, vy); server.walker.setAirborne(true, vy); tick(); };
  return { walk, page, server, tick, launch, stick, dispose: () => walk.unbindKey() };
}

describe("B-65: a swap pressed in the air is taken (the owner's divergence, AIR_SWAP_OWNER_DIVERGENCE_ADAPTATION)", () => {
  it('the divergence is on', () => {
    expect(AIR_SWAP_OWNER_DIVERGENCE_ADAPTATION).toBe(true);
  });

  it("the page's gate opens in the air and the swap starts as the moving overlay: the fall stays on top, the flight's carried velocity kept", () => {
    const { walk, page, launch, dispose } = rig();
    launch();
    expect(page.airborne).toBe(true);
    expect(page.action?.name).toBe('fall');
    expect(page.swapRefused()).toBe(false);                      // was: true (the original's in-air refusal)
    expect(walk.swapGate()).toBe(true);
    const vy = page.state.vy;
    const pick = walk.swapWeapon('pistol');
    expect(pick).not.toBeNull();
    expect(pick!.overlay).toBe(true);                            // never a full-body action in the air
    expect(pick!.action).toBeNull();
    expect(page.action?.name).toBe('fall');
    expect(page.airborne).toBe(true);
    expect(page.state.vy).toBe(vy);
    dispose();
  });

  it('still refused in the air: in the scope, and while a swap plays', () => {
    const { walk, page, launch, dispose } = rig();
    launch();
    expect(page.swapRefused(true)).toBe(true);                   // FUN_005c4fd0: zoom 4 and up
    expect(walk.swapWeapon('pistol')).not.toBeNull();
    expect(page.swapRefused()).toBe(true);                       // FUN_005a7980: a swap playing
    expect(walk.swapWeapon('rifle')).toBeNull();
    dispose();
  });

  it('the swap in the air outlives the landing: the overlay is on the second channel, so the landing keeps it and it runs to its end', () => {
    const { walk, page, tick, launch, dispose } = rig();
    launch(50);
    const ends: string[] = [];
    const off = page.onActionEnd((e) => { if (e.overlay) ends.push(e.reason); });
    expect(walk.swapWeapon('pistol')).not.toBeNull();
    let swappingAtLanding: boolean | null = null;
    for (let i = 0; i < 600 && (swappingAtLanding === null || page.swapping()); i++) {
      tick();
      if (swappingAtLanding === null && !page.airborne) swappingAtLanding = page.swapping();
    }
    expect(swappingAtLanding).toBe(true);                        // on the floor, the swap still playing
    expect(page.swapping()).toBe(false);
    expect(ends).toEqual(['complete']);                          // never cut ('replaced', 'knock')
    off();
    dispose();
  });

  it('the room takes the same swap on the same command: the Swap press sent, the room mover in the air takes the sidearm', () => {
    const { walk, server, tick, launch, dispose } = rig();
    launch();
    expect(server.walker.airborne).toBe(true);
    expect(walk.swapWeapon('pistol')).not.toBeNull();
    const [cmd] = tick();
    expect(cmd!.buttons & Button.Swap).toBe(Button.Swap);
    expect(cmd!.weapon).toBe(1);
    expect(server.weapon).toBe(1);                               // was: 0 (the room mover refused it in the air)
    expect(server.walker.swapping()).toBe(true);
    dispose();
  });

  it("a reload's hold in the air is still refused (the original's rule, FUN_005c2a90 D:L477395; not part of the divergence)", () => {
    const { page, launch, dispose } = rig();
    launch();
    expect(page.airborne).toBe(true);
    expect(page.hold('seal_crouch_reload')).toBe(false);
    dispose();
  });

  it("B-65 review F3: a RUNNING jump -- the swap pressed under `launch` is taken on the page and in the room, the flight's horizontal speed and path unchanged, the overlay not cut at the landing", () => {
    const run = (swap: boolean) => {
      const r = rig(WIDE);
      r.stick.forward = 1;
      for (let i = 0; i < 90; i++) r.tick();                      // up to speed
      expect(Math.hypot(r.page.state.vx, r.page.state.vz)).toBeGreaterThan(RUNNING_JUMP_SPEED);
      expect(r.walk.jump()).toBe(true);
      r.tick();
      expect(r.page.airborne).toBe(true);
      expect(r.page.action?.name).toBe('launch');
      expect(r.server.walker.action?.name).toBe('launch');
      const ends: string[] = [];
      const off = r.page.onActionEnd((e) => { if (e.overlay) ends.push(e.reason); });
      if (swap) {
        const vx = r.page.state.vx, vz = r.page.state.vz;
        expect(r.page.swapRefused()).toBe(false);                // was: true (the launch is the original's code-4 refusal)
        const pick = r.walk.swapWeapon('pistol');
        expect(pick?.overlay).toBe(true);
        expect([r.page.state.vx, r.page.state.vz]).toEqual([vx, vz]);
        expect(r.page.action?.name).toBe('launch');
      }
      r.tick();                                                  // the press's command, in both runs
      if (swap) expect(r.server.weapon).toBe(1);                 // the room's mover, airborne under its launch, took it
      const path: number[][] = [];
      let swappingAtLanding: boolean | null = null;
      for (let i = 0; i < 300 && swappingAtLanding === null; i++) {
        r.tick();
        path.push([r.page.state.x, r.page.state.z]);
        if (!r.page.airborne) swappingAtLanding = r.page.swapping();
      }
      for (let i = 0; i < 120; i++) r.tick();
      off();
      r.dispose();
      return { path, swappingAtLanding, ends };
    };
    const plain = run(false), swapped = run(true);
    expect(swapped.path.length).toBe(plain.path.length);          // the same flight, landed on the same tick
    for (let i = 0; i < plain.path.length; i++) {
      expect(swapped.path[i]![0]).toBeCloseTo(plain.path[i]![0]!, 6);
      expect(swapped.path[i]![1]).toBeCloseTo(plain.path[i]![1]!, 6);
    }
    expect(swapped.swappingAtLanding).toBe(true);
    expect(swapped.ends).toEqual(['complete']);
  });

  it("B-65 review F3: a knock-down's fall in the air still refuses (FUN_005b4340 code 4: the knock-downs; not part of the divergence)", () => {
    const { page, dispose } = rig();
    expect(page.knock([0, 200, 0], 'fallForward')).toBe(true);
    expect(page.airborne).toBe(true);
    expect(page.action?.name).toBe('fallForward');
    expect(page.swapRefused()).toBe(true);
    dispose();
  });
});

describe("B-65: the grenade menu's confirm in the air is taken (\"this includes nade swapping\")", () => {
  it("the R2 inventory opens and its confirm takes the slot with the walk's real gate in the air", () => {
    const { walk, page, launch, dispose } = rig();
    launch();
    expect(page.airborne).toBe(true);
    const scene = new Scene();
    const firearm = {
      shotRumble: () => {},
      fire: { release: () => {}, magazineOf: () => ({ rounds: 0, capacity: 0, spare: 0, reloading: false }) },
      zoom: { state: () => 1 },
      kit: { swapping: () => false, item: () => 'rifle', state: () => ({ swap: null }) },
      setZoom: () => {}, showFireMode: () => {},
      item: () => 'rifle', record: () => ({ name: 'M4A1' }), records: () => [{}, {}], icon: () => 'm4.tif',
      selectFirearm: () => true, shoulderGate: () => walk.swapGate(), kitFree: () => true,
    };
    const deps: MatchThrowDeps = {
      scene,
      walk: {
        grid: () => null, gridOfGround: () => null, view: () => ({}) as never, fireAim: () => null, feet: () => null, drawnFeet: () => null,
        snapshot: () => ({ feet: [0, 50, 0], yaw: 0, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: true, crouched: false, stance: 'stand', landing: null, jumps: 0 }),
        hold: () => {}, mode: () => 'walk', isDead: () => false, fireAllowed: () => true, swapGate: () => walk.swapGate(), onActionEnd: () => () => {},
        launcherRaised: () => {}, launcherLowered: () => {}, launcherCleared: () => {}, onLauncherStickLower: () => () => {},
      } as never,
      fly: { shakeScreen: () => {} },
      play: {
        partPoint: () => null, heldNode: () => null, itemNode: () => null, launcherNode: () => null, motionSource: () => null,
        setRifleStowed: () => {}, addPoseLayer: () => {},
      } as never,
      loadouts: new PlayerLoadout(),
      view: () => null, map: () => null,
      net: () => ({ throwEvent: () => {}, client: { bodies: () => [] } }) as never,
      firearm: () => firearm as never,
      audio: { onAnimCallback: () => null, onFire: () => null, play: () => {} } as never,
    };
    deps.loadouts.take([54, 15, 121, 121, 126]);
    const t = mountThrowables(deps);
    t.grenade.setKit(['M67', 'M67', 'HE']);
    expect(t.takeSlot(3)).toBe(true);                            // the shoulder press in the air: taken
    expect(t.inventoryCurrent()).toBe(3);
    expect(t.inventory.key('KeyI')).toBe(true);                  // R2 opens the menu (was: refused, the gate closed)
    for (let n = 0; n < 60; n++) t.inventory.frame({} as never, {} as never, 1 / 60);
    t.inventory.key('PageUp');
    t.inventory.key('Enter');                                    // the confirm takes the highlighted slot and closes
    expect(t.inventory.isOpen()).toBe(false);
    dispose();
  });
});

describe("B-65 extended to the STANDING jump (the owner, 2026-11-25: \"add it to the standing jump as well\")", () => {
  /** A standing jump from rest: the `jump` action (`seal_jump`), the feet on the floor; `swapAt` the tick of the press, or none. */
  const standingJump = (swapAt: number | null) => {
    const r = rig();
    expect(r.walk.jump()).toBe(true);
    expect(r.page.action?.name).toBe('jump');
    expect(r.page.airborne).toBe(false);                         // the standing jump never leaves the floor
    r.tick();                                                    // the press's command: the room's mover jumps too
    expect(r.server.walker.action?.name).toBe('jump');
    const ends: { what: string; reason: string }[] = [];
    const off = r.page.onActionEnd((e) => { ends.push({ what: e.overlay ? 'overlay' : e.body?.name ?? '?', reason: e.reason }); });
    const track: { action: string | null; y: number; rise: number }[] = [];
    let pick: ReturnType<WalkMode['swapWeapon']> = null;
    for (let i = 0; i < 150; i++) {
      if (i === swapAt) {
        expect(r.page.action?.name).toBe('jump');
        expect(r.page.swapRefused()).toBe(false);                // was: true (an action other than a stance transition)
        expect(r.walk.swapGate()).toBe(true);                    // so the grenade menu and the launcher take pass too
        pick = r.walk.swapWeapon('pistol');
      }
      r.tick();
      track.push({ action: r.page.action?.name ?? null, y: r.page.state.y, rise: r.page.carriedAir.rise });
    }
    off();
    return { r, ends, track, pick };
  };

  it("the page takes a swap pressed mid standing jump as the moving overlay; the jump keeps playing to its end, its rise and its timing unchanged", () => {
    const plain = standingJump(null), swapped = standingJump(20);
    expect(swapped.pick).not.toBeNull();
    expect(swapped.pick!.overlay).toBe(true);                    // never a full-body swap action that would cut the jump
    expect(swapped.pick!.action).toBeNull();
    expect(swapped.track.map((t) => t.action)).toEqual(plain.track.map((t) => t.action));
    for (let i = 0; i < plain.track.length; i++) {
      expect(swapped.track[i]!.y).toBeCloseTo(plain.track[i]!.y, 9);
      expect(swapped.track[i]!.rise).toBeCloseTo(plain.track[i]!.rise, 9);
    }
    expect(swapped.ends.filter((e) => e.what === 'jump')).toEqual([{ what: 'jump', reason: 'complete' }]);
    expect(swapped.ends.filter((e) => e.what === 'overlay')).toEqual([{ what: 'overlay', reason: 'complete' }]);
    plain.r.dispose(); swapped.r.dispose();
  });

  it("the room takes the same swap on the same command: the sidearm, the overlay, its jump not cut", () => {
    const r = rig();
    expect(r.walk.jump()).toBe(true);
    r.tick();
    for (let i = 0; i < 10; i++) r.tick();
    expect(r.server.walker.action?.name).toBe('jump');
    expect(r.walk.swapWeapon('pistol')?.overlay).toBe(true);
    const [cmd] = r.tick();
    expect(cmd!.buttons & Button.Swap).toBe(Button.Swap);
    expect(r.server.weapon).toBe(1);                             // was: 0 (the room's mover refused it under `jump`)
    expect(r.server.walker.swapping()).toBe(true);
    expect(r.server.walker.overlay).not.toBeNull();
    expect(r.server.walker.action?.name).toBe('jump');
    r.dispose();
  });

  it("a launcher clip asked under the standing jump starts no body clip (as in the air): the jump is not cut", () => {
    const r = rig();
    expect(r.walk.jump()).toBe(true);
    r.tick();
    expect(r.page.launcherClip('rifleToLauncher', false)).toBe(false);
    expect(r.page.action?.name).toBe('jump');
    r.dispose();
  });

  it("still refused under the standing jump: in the scope, and while a swap plays", () => {
    const r = rig();
    expect(r.walk.jump()).toBe(true);
    r.tick();
    expect(r.page.swapRefused(true)).toBe(true);
    expect(r.walk.swapWeapon('pistol')).not.toBeNull();
    expect(r.page.swapRefused()).toBe(true);
    r.dispose();
  });
});
