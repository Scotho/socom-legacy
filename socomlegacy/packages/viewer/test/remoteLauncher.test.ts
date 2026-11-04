// test/remoteLauncher.test.ts -- PAR-84 (research 230 section 5.2.10, build step 7) and NU-6 R1 + P3 (research 324 §4,
// §6): what another page draws of a body under the launcher's raise or still lower. The real `RemotePlayers` runs; only
// the body's view and `Play` are stand-ins (the snapshot each frame plays, the firearms hung, the launcher's and the
// hand's nodes and the stowed rifle are recorded), as in `remoteDeath.test.ts`.
import { describe, expect, it, vi } from 'vitest';
import { Group, PerspectiveCamera, Scene, type Object3D } from 'three';
import { firstLauncher, RemotePlayers, remoteBodyAction, type HeldRef, type SideKit } from '../src/remotePlayers';
import * as remotePlayers from '../src/remotePlayers';
import type { LoadedMap } from '../src/loadMap';
import type { PlayClips } from '../src/play';
import { groundGrid, LAUNCHER_RAISE_NETWORK_LOG_READING, packGround, Walker, type GroundData, type MoverAction, type PlaySnapshot } from '../src/mover';
import { MoverSim } from '../src/net/moverSim';
import { bodyOf } from '../src/net/body';
import { decodeSnapshot, encodeSnapshot } from '../src/net/codec';
import { ACTION_CODES, BodyFlag, Button, type BodyState, type Command } from '../src/net/protocol';
import { DEFAULT_LIGHTING } from '../src/lighting';

/** NU-6 F2: the stub callback's `launcher` -- the kit's first rocket launcher's model, named for its id, or null. */
const launcherRef = (k: readonly number[]): HeldRef | null => {
  const id = firstLauncher(k);
  if (id === null) return null;
  const g = new Group(); g.name = `model${id}`;
  return { object: g, points: [] };
};

const output = vi.hoisted(() => ({
  snapshots: [] as PlaySnapshot[], weapons: [] as (object | null)[], stowed: [] as boolean[],
  plays: [] as { launcher: Object3D; hand: Object3D }[],
}));
vi.mock('../src/bodyView', () => ({ buildBody: () => ({ group: new Group(), dispose: () => {} }) }));
vi.mock('../src/play', async () => { const { Group: G } = await import('three'); return { Play: class {
  launcher = Object.assign(new G(), { name: 'launcher' });
  hand = Object.assign(new G(), { name: 'rifle' });
  constructor() { output.plays.push(this); }
  launcherNode() { return this.launcher; }
  heldNode() { return this.hand; }
  setRifleStowed(on: boolean) { output.stowed.push(on); }
  stopVictory() {}
  setBody() {} setFlyToggle() {} setClips() {} setWeaponInput() {} setItem() {} setMounts() {} setAnimSet() {}
  setWeapon(o: object | null) { output.weapons.push(o); } setSidearm() {} addPoseLayer() {} motionSource() { return null; } onEvent() {}
  frame(_dt: number, walk: { snapshot(): PlaySnapshot }) { output.snapshots.push(walk.snapshot()); }
} }; });

/** A living body standing still, its action the wire's code `action` (0 none), `reversed` its direction. */
const state = (action: number, reversed = false): BodyState => ({
  id: 2, feet: [0, 0, 0], yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0,
  flags: BodyFlag.Alive | (reversed ? BodyFlag.ActionReversed : 0), stance: 0, landing: 0, jumps: 0,
  ground: 0, groundForward: 0, groundRight: 0, groundCls: -1, stickSnaps: 0,
  action, actionSerial: 4, actionT: 0.3, actionSeconds: 1.4155,
  overlay: 0, overlayT: 0, overlaySeconds: 0, turnRate: 0,
  trav: 0, travFrame: 0, travRootY: Number.NaN, travBlend: 0, travBlendWeight: 0, peek: 0, weapon: 255, slot: 0,
});
const code = (name: MoverAction['name']): number => ACTION_CODES.indexOf(name) + 1;

/** A held model per item id, named for it (the stub `SideKit`: each firearm slot's model by its id). */
const ref = (id: number): HeldRef => { const g = new Group(); g.name = `model${id}`; return { object: g, points: [] }; };
const kitOf: SideKit = (_team, kit) => {
  const k = kit ?? [54, 15, 145, 185, 255];
  return { rifle: ref(k[0]!), pistol: ref(k[1]!), loadout: k, ids: [k[0]!, k[1]!], launcher: launcherRef(k) };
};

function rig() {
  for (const list of Object.values(output)) list.length = 0;
  const remote = new RemotePlayers(new Scene()), camera = new PerspectiveCamera();
  remote.setMap({ body: {} } as LoadedMap, DEFAULT_LIGHTING, null);
  remote.setClips({ clips: [], table: null } as unknown as PlayClips);
  const frame = (b: BodyState): PlaySnapshot => { remote.frame(1 / 60, [b], camera); return output.snapshots.at(-1)!; };
  return { frame };
}

/**
 * PAR-84: the original sends the raise's push to the others only when its type's anim-set row carries `network_log`
 * (`FUN_002bbaf0` D:L160789-160790; the loader's bit, D:L496507-496511), and `Rifle -> Launcher` / `Pistol -> Launcher`
 * carry none on the disc (`roomStillReloadJump.test.ts`, "PAR-84"): no Push Blend is sent -- that reading stands.
 *
 * NU-6 R1 (research 324 §4, the gameplay controller's ruling of 2026-10-14 after its review): each copy plays the raise
 * and the still lower itself, from the character message's item -- `FUN_005c8a20` -> `FUN_005c50b0` class 4 -> the
 * copy's `FUN_005c1660` -> `FUN_005a64c0` -> `FUN_005a6d30` (D:L461886, D:L462105-462116), the lower by `FUN_005a6b70`
 * (D:L461875) -- so another page draws the two codes the room's body carries, as it draws the swap's.
 * Was (PAR-84's pins, until NU-6 R1): "remoteBodyAction drops the two codes, either way, and keeps every other action"
 * (`remoteBodyAction({ name, ... })` null for both, raised and lowered) and "a remote body carrying rifleToLauncher (21)
 * or pistolToLauncher (22), raised or lowered, plays no action -- its ground, idle; a swap's code (the control) plays".
 */
describe("NU-6 R1: another page draws the launcher's raise and still lower from the body's action (research 324 §4; was PAR-84's drop)", () => {
  it('no Push Blend (LAUNCHER_RAISE_NETWORK_LOG_READING false, unchanged) -- and remoteBodyAction keeps the two codes, either way, and every other action', () => {
    expect(LAUNCHER_RAISE_NETWORK_LOG_READING).toBe(false);
    for (const name of ['rifleToLauncher', 'pistolToLauncher'] as const) {
      for (const reversed of [false, true]) {
        const a: MoverAction = { name, serial: 1, t: 0.2, seconds: 1.4, reversed };
        expect(remoteBodyAction(a), `${name} ${reversed}`).toBe(a);
      }
    }
    const swap: MoverAction = { name: 'swapStand', serial: 1, t: 0.2, seconds: 1.2, reversed: false };
    expect(remoteBodyAction(swap)).toBe(swap);
    expect(remoteBodyAction(null)).toBeNull();
  });

  it('a remote body carrying rifleToLauncher (21) or pistolToLauncher (22), raised or lowered, plays the action, not its ground; a swap\'s code (the control) plays', () => {
    const { frame } = rig();
    for (const name of ['rifleToLauncher', 'pistolToLauncher'] as const) {
      for (const reversed of [false, true]) {
        const s = frame(state(code(name), reversed));
        expect(s.action?.name, `${name} ${reversed}`).toBe(name);
        expect(s.action?.reversed).toBe(reversed);
      }
    }
    expect(frame(state(code('swapStand'))).action?.name).toBe('swapStand');
  });
});

/**
 * NU-6 R1 + P2 + P3 on one command (research 324 §6, the review's F2; PTW.R3): the room's mover lays the raise and the
 * still lower (`room.ts` `raiseLauncher` / `launcherDown`: the clip kept on `MoverSim.launcherClips` from the event's
 * command + 1, the body's item the launcher's id from the raise's event, the firearm's from the lower's), the body
 * crosses the wire (`bodyOf` -> codec), and another page's `RemotePlayers` draws it: the raise and the lower played, the
 * launcher in the hand from the raise (`FUN_005a6d30` D:L462120-462126) through the still lower to its clip's end
 * (`FUN_005a6b70` re-parents nothing, D:L462045-462092; `FUN_00582540` D:L443057-443071 -> `FUN_005a60d0(.., 4)`
 * D:L461769-461820) and back on `spinehi` after (`REMOTE_LAUNCHER_HAND_READING`), the firearm stowed meanwhile, the
 * kit never written (P3) and no firearm hung again -- from the rifle (21) and from the pistol (22).
 */
describe('NU-6 R1 + P3: the room\'s raise and still lower drawn on another page, the kit kept (research 324 §6)', () => {
  const GROUND: GroundData = packGround(
    { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 },
    [{
      modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
      points: Float32Array.from([-200, 0, -200, 200, 0, -200, 200, 0, 200, -200, 0, 200]),
    }],
    [{ modelName: 'worldmodel', path: 'worldmodel/floor', first: 0, count: 1 }],
  );
  const KIT = [54, 15, 145, 185, 255];

  function bridge() {
    for (const list of Object.values(output)) list.length = 0;
    const walker = new Walker(groundGrid(GROUND));
    walker.place(0, 30, 0);
    const sim = new MoverSim(walker, null);
    const remote = new RemotePlayers(new Scene()), camera = new PerspectiveCamera();
    remote.setMap({ body: {} } as LoadedMap, DEFAULT_LIGHTING, kitOf);
    remote.setClips({ clips: [], table: null } as unknown as PlayClips);
    remote.setKit(2, KIT);                                       // the spawn's kit (protocol 7)
    let seq = 0, held: number | null = null;
    /** One command run by the room's mover, the body over the wire, the page's frame: what it drew. */
    const tick = (buttons = 0, weapon: 0 | 1 = sim.weapon) => {
      const cmd: Command = { seq: ++seq, forward: 0, right: 0, yaw: 0, pitch: 0, turn: 0, buttons, stance: 0, weapon };
      sim.apply(cmd);
      const wire = decodeSnapshot(encodeSnapshot({
        tick: seq, own: null,
        bodies: [bodyOf(2, sim.body(), { alive: true, weapon: sim.weapon, item: held ?? KIT[sim.weapon]!, aiming: false, trigger: false, boost: false })],
      })).bodies[0]!;
      remote.frame(1 / 60, [wire], camera);
      const play = output.plays.at(-1)!;
      return {
        action: output.snapshots.at(-1)!.action, inHand: play.hand.children.map((o) => o.name),
        carried: play.launcher.children.map((o) => o.name), stowed: output.stowed.at(-1) ?? false,
      };
    };
    /** `room.ts` `raiseLauncher` / `launcherDown` on the event after command `seq`: the item, then the clip. */
    const raise = (): void => { held = 145; sim.launcherClips.keep({ name: sim.weapon === 1 ? 'pistolToLauncher' : 'rifleToLauncher', reversed: false, at: seq + 1 }); };
    const lower = (): void => { held = null; sim.launcherClips.keep({ name: sim.weapon === 1 ? 'pistolToLauncher' : 'rifleToLauncher', reversed: true, at: seq + 1 }); };
    return { tick, raise, lower, remote, sim, walker };
  }

  /** Runs the raise, a held second, the still lower and a settle, checking each frame as it goes. */
  function raiseAndLower(b: ReturnType<typeof bridge>, name: 'rifleToLauncher' | 'pistolToLauncher'): void {
    const hangs = output.weapons.length;
    expect(b.tick().carried).toEqual(['model145']);              // carried on the back before (P2)
    b.raise();
    let raising = 0;
    for (let i = 0; i < 90; i++) {
      const d = b.tick();
      if (d.action?.name === name && !d.action.reversed) raising++;
      expect(d.inHand, `raise ${i}`).toEqual(['model145']);       // in the hand from the raise's push
      expect(d.carried).toEqual([]);
      expect(d.stowed).toBe(true);
    }
    expect(raising).toBeGreaterThan(60);                         // R1: the raise's clip drawn, not dropped
    b.lower();
    let lowering = 0, back = -1;
    for (let i = 0; i < 120; i++) {
      const d = b.tick();
      if (d.action?.name === name && d.action.reversed) {
        lowering++;
        expect(d.inHand, `lower ${i}`).toEqual(['model145']);     // held through the still lower's clip
        expect(d.stowed).toBe(true);
      } else if (back < 0) back = i;
      if (back >= 0) {
        expect(d.inHand, `after ${i}`).toEqual([]);
        expect(d.carried).toEqual(['model145']);                 // back on spinehi at the clip's end
        expect(d.stowed).toBe(false);
      }
    }
    expect(lowering).toBeGreaterThan(60);                        // R1: the lower's clip drawn
    expect(back).toBeGreaterThan(60);
    expect(b.remote.playerKit(2)).toEqual(KIT);                  // P3: the kit never written
    expect(output.weapons).toHaveLength(hangs);                  // and no firearm hung again
  }

  it('from the rifle (21): the raise played, the LAW in the hand, the still lower played, the LAW back on the back; the kit unchanged', () => {
    const b = bridge();
    for (let i = 0; i < 5; i++) b.tick();
    raiseAndLower(b, 'rifleToLauncher');
  });

  it('from the pistol (22): the same, the pistol stowed while the LAW is in the hand', () => {
    const b = bridge();
    for (let i = 0; i < 5; i++) b.tick();
    b.tick(Button.Swap, 1);
    for (let i = 0; i < 240 && b.walker.swapProgress() !== null; i++) b.tick();
    for (let i = 0; i < 5; i++) b.tick();
    expect(b.sim.weapon).toBe(1);
    raiseAndLower(b, 'pistolToLauncher');
  });

  it('REMOTE_LAUNCHER_HAND_READING names the rule', () => {
    expect((remotePlayers as unknown as Record<string, unknown>).REMOTE_LAUNCHER_HAND_READING).toBe('the item, and through the still lower');
  });
});

/**
 * NU-5 X1 and research 324 P2's page half (research 323 §1.5; research 324 §1.4 step 3; the online seat's terms): the
 * pick-up's `Swap rifle` rides the body's action under two codes. The exchange's (`swapRifleExchange`) is pushed on the
 * taker's own console only (`FUN_0059f0c0` D:L458199-458211: a copy with a model on the node takes the other branch,
 * D:L458217-458235) and sent to no other (SOLDIER's `Swap rifle` row carries no `network_log`, read over the tracked
 * `READERC.ZAR` in `roomPickups.test.ts`; `FUN_002bbaf0` D:L160789-160790): another page drops it and draws the body's
 * ground. The launcher claim's (`swapRifleClaim`) is pushed by every console itself (the launcher node holds no model,
 * D:L458199-458206): another page draws it on the taker's remote body.
 */
describe("NU-5: another page drops the exchange's Swap rifle and draws the launcher claim's (research 323 X1, 324 P2)", () => {
  it('remoteBodyAction drops swapRifleExchange and keeps swapRifleClaim; a remote body carrying code 24 plays Swap rifle, one carrying 23 plays its ground', () => {
    const ex: MoverAction = { name: 'swapRifleExchange', serial: 1, t: 0.2, seconds: 1.06, reversed: false };
    const claim: MoverAction = { name: 'swapRifleClaim', serial: 1, t: 0.2, seconds: 1.06, reversed: false };
    expect(remoteBodyAction(ex)).toBeNull();
    expect(remoteBodyAction(claim)).toBe(claim);
    const { frame } = rig();
    expect(code('swapRifleClaim')).toBe(24);
    expect(frame(state(code('swapRifleClaim'))).action?.name).toBe('swapRifleClaim');
    expect(code('swapRifleExchange')).toBe(23);
    expect(frame(state(code('swapRifleExchange'))).action ?? null).toBeNull();
  });
});
