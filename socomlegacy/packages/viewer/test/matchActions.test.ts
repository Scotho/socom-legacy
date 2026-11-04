import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { noInput, type Input } from '../src/gamepad';
import { actionHands, mountActions, type MatchActionsDeps } from '../src/matchActions';
import { PICKUP_PROMPT_COOLDOWN_READING } from '../src/net/pickupRules';
import type { FireEvent, FireListener, FireState } from '../src/fire';
import type { LoadedMap } from '../src/loadMap';
import { BOMB_STATE, type BombWire } from '../src/net/objective';
import type { ClientEvent } from '../src/net/protocol';
import { gunLine, muzzleAt, turretReloadCountdown } from '../src/net/emplacement';
import { groundGrid, packGround, TICK } from '../src/mover';
import { stepThrowPower, type CollisionOwner, type Grid, type GridParams, type MotionClip, type WorldPoly } from '@s2u/scene';
import * as scene from '@s2u/scene';
import { GrenadeThrower } from '../src/grenade';
import type { PlaySnapshot } from '../src/walk';
import { perturb } from '../src/accuracy';
import type { NetPage } from '../src/netPage';
import type { ReplayRecord } from '../../match/src/replay/format';
import { asNetClient, ReplayClient } from '../src/replay/replayClient';
import { ALPHA, BRAVO, body, header } from './replayFixture';

/**
 * ONE-WIRE (web research 222): sprint 27's action button and its pages -- the room's event relay, the switches (XR-04),
 * the turrets (MAP-10b) with their trigger, DEMOLITION's bomb (XR-05) and the action lifecycle (XR-06) -- as one part
 * (`./matchActions`) a page mounts, where `/testroom` built them inline.
 */

function rig(extra: Partial<MatchActionsDeps> = {}, aim: { eye: [number, number, number]; far: [number, number, number] } | null = null) {
  const calls: string[] = [];
  let filter: (() => boolean) | null = null;
  let turretAim: ((yaw: number, pitch: number) => { yaw: number; pitch: number }) | null = null;
  const walk = {
    mode: () => 'walk' as const, isDead: () => false, isLocked: () => false, feet: () => null, fireAim: () => aim, lookAim: () => aim,
    setCamera: () => true, setLocked: (on: boolean) => { calls.push(`locked:${on}`); },
    setActionFilter: (f: () => boolean) => { filter = f; }, setNetTap: () => {},
    syncVictoryMotion: (dance: { serial: number } | null, _clip?: unknown, _motion?: unknown, ahead = 0) => { calls.push(dance ? `walk.dance:${dance.serial}:${ahead}` : 'walk.dance:off'); },
    stopVictoryMotionAfter: () => { calls.push('walk.dance:off'); },  // PAR-37: the reload's stop
    victoryMotionActive: () => false,
    pickupClaimed: () => { calls.push('walk.pickupClaimed'); },   // NU-5 review F3: the claim's command noted
    setTurretAim: (clamp: typeof turretAim) => { turretAim = clamp; },   // T81-3: the walk's turret clamp, as wired
  };
  let reload: FireListener | null = null;
  const lanes: Input[] = [];
  let dancing: { serial: number; clip: string; elapsed: number; seconds: number; frames: number } | null = null;
  const play = {
    startVictory: (serial: number, clip: string) => { dancing = { serial, clip, elapsed: 0, seconds: 1, frames: 2 }; calls.push(`play.dance:${clip}`); return true; },
    stopVictory: () => { dancing = null; }, resetVictory: () => { dancing = null; },
    victoryActive: () => dancing !== null, victoryState: () => dancing,
  };
  const win = new EventTarget();
  const d: MatchActionsDeps = {
    walk, fly: { pose: () => ({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0 }) },
    doors: { target: () => null, action: () => false },
    traversal: {
      cancelAction: () => { calls.push('traversal.cancel'); }, padLanes: (_b: Input, a: Input) => { calls.push('traversal.lanes'); lanes.push(a); },
      hudClimb: () => null, traversal: () => null, holdAllowed: () => true,
    },
    grenade: { c4Target: () => null, plantC4: () => false, cancelMenuHold: () => { calls.push('grenade.cancel'); } },
    play, firearm: { held: () => { calls.push('trigger.release'); }, fire: { subscribe: (fn) => { reload = fn; return () => { reload = null; }; } } },
    net: () => null, map: () => null, view: () => null, world: () => null,
    remote: { teamOf: () => null, feet: () => null },
    bombView: {},
    win,
    ...extra,
  };
  const acts = mountActions(d);
  return { acts, calls, win, filter: () => filter, reload: () => reload, lanes, turretAim: () => turretAim, walk };
}
const cross = (down: boolean): Input => ({ ...noInput(), action: down });

// LATER 362b's review F3: the production order -- the frame's chase steps BEFORE the release fires the door, so the door
// reads the release frame's press (`matchActions` `lanes`: `traversal.chaseAction`, then `wiring.release()`).
describe('LATER 362b F3: the action press chased before the release fires the door', () => {
  it("the lanes' chase runs on the release's frame before the door's action", () => {
    const calls: string[] = [];
    const { acts } = rig({
      doors: { target: () => 0, action: () => { calls.push('door.action'); return true; } },
      traversal: {
        cancelAction: () => {}, padLanes: () => {}, hudClimb: () => null, traversal: () => null, holdAllowed: () => true,
        chaseAction: (held: boolean) => { calls.push(`chase:${held}`); },
      } as never,
    });
    acts.lanes(cross(false), cross(true), 1 / 60);
    acts.lanes(cross(true), cross(false), 1 / 60);
    expect(calls).toEqual(['chase:true', 'chase:false', 'door.action']);
  });
});

describe('mountActions: the action button and its pages, one part', () => {
  it('the walk\'s action filter is the wiring\'s', () => {
    const { filter } = rig();
    expect(filter()).not.toBeNull();
  });
  it('Cross\'s edges: the press and the release to the lifecycle, the hold, then the traversal\'s lanes', () => {
    const { acts, calls } = rig();
    acts.lanes(cross(false), cross(true), 1 / 60);
    expect(acts.wiring.lifecycle.down()).toBe(true);
    acts.lanes(cross(true), cross(false), 1 / 60);
    expect(acts.wiring.lifecycle.down()).toBe(false);
    expect(calls).toEqual(['traversal.lanes', 'traversal.lanes']);
  });
  it('the window\'s blur cancels the hold (XR-06), the traversal\'s too; dispose lets the window go', () => {
    const { acts, calls, win } = rig();
    acts.lanes(cross(false), cross(true), 1 / 60);
    win.dispatchEvent(new Event('blur'));
    expect(acts.wiring.lifecycle.down()).toBe(false);
    expect(calls).toContain('traversal.cancel');
    acts.dispose();
    acts.lanes(cross(false), cross(true), 1 / 60);
    win.dispatchEvent(new Event('blur'));
    expect(acts.wiring.lifecycle.down()).toBe(true);
  });
  it('unmounted: the trigger is not the turret\'s, no turret rounds held, no turret ammo, no prompt off the walk', () => {
    const { acts } = rig();
    expect(acts.trigger(true)).toBe(false);
    expect(acts.triggerHeld()).toBe(false);
    expect(acts.mounted()).toBe(false);
    expect(acts.hudAmmo()).toBeNull();
    expect(acts.prompt(false)).toBeNull();
    acts.turretFrame(1 / 60, false);
    expect(acts.triggerHeld()).toBe(false);
  });
  // LkPaioX5 part 2 (a) (research 87 §5, "The action list"): the HUD's feed is the picker's whole list, its head first,
  // each entry its prompt -- the HUD draws list[1] and list[2] beside the head (`FUN_0021f210` D:L73979-74032).
  it('LkPaioX5 (a): the prompt is the picker\'s list in its order, the d-pad\'s turn with it; none in reach, none', () => {
    const { acts } = rig({
      doors: { target: () => 0, action: () => false },
      grenade: { c4Target: () => ({}), plantC4: () => false, cancelMenuHold: () => {} },
    });
    expect(acts.prompt(true)).toEqual([{ prompt: 'door' }, { prompt: 'c4' }]);
    acts.lanes(cross(false), { ...cross(true), leanLeft: true }, 1 / 60);   // Cross held, Left: the head to the tail
    expect(acts.prompt(true)).toEqual([{ prompt: 'c4' }, { prompt: 'door' }]);
    expect(acts.prompt(false)).toBeNull();
    const none = rig().acts;
    expect(none.prompt(true)).toBeNull();
  });
  // LkPaioX5 part 2 (b): a hostage's order comes captioned with its record's text (`./hostagePage` ESCORTEE_PROMPTS).
  it('LkPaioX5 (b): the escortee entry carries its order\'s text for the caption', () => {
    const { acts } = rig({ hostages: { offer: () => ({ text: 'HOLD POSITION' }), fire: () => true } });
    expect(acts.prompt(true)).toEqual([{ prompt: 'escortee', caption: 'HOLD POSITION' }]);
  });
  // LkPaioX5 part 2 (c): a corpse's rifle and pistol are two TAKE entries, each its own claim and its weapon's name.
  it('LkPaioX5 (c): two TAKE entries, each captioned with its weapon, each claiming its own drop', () => {
    const claims: number[] = [];
    const items = new Map([[62, { displayName: 'M4A1' }], [10, { displayName: 'MK23' }]]);
    const { acts } = rig({
      drops: { ahead: () => 7, second: () => 8, item: (did: number) => (did === 7 ? 62 : did === 8 ? 10 : null), candidates: () => 2 },
      map: () => ({ arsenal: { table: { arsenal: { items } } } }) as unknown as LoadedMap,
      net: () => ({ pickup: (did: number) => { claims.push(did); return true; }, client: { role: 'player', lastSeq: () => 0 } }) as unknown as NetPage,
    });
    expect(acts.prompt(true)).toEqual([{ prompt: 'pickup', name: 'M4A1' }, { prompt: 'pickup2', name: 'MK23' }]);
    acts.lanes(cross(false), { ...cross(true), leanRight: true }, 1 / 60);   // Cross held, Right: the tail to the head
    acts.lanes({ ...cross(true), leanRight: true }, cross(false), 1 / 60);   // released: the pistol's claim
    expect(claims).toEqual([8]);
  });
  it('the room\'s events: followed and let go with the page\'s client', () => {
    const { acts } = rig();
    const client = { on: () => () => {} };
    acts.follow(client as never);
    expect(acts.roomEvents.following()).toBe(client);
    acts.follow(null);
    expect(acts.roomEvents.following()).toBeNull();
  });
  it('PTT-6 (research 244 §7): followNet follows the replay client too, so a seek past the plant draws the bomb planted', async () => {
    const planted = { state: BOMB_STATE.planted, pos: [5, 0, 5], carrier: null, planter: 2, plantingTeam: 'terrorist', defuser: null, detonateTick: 3000 } as BombWire;
    const h = header();
    const records: ReplayRecord[] = [{ kind: 'header', header: h }, { kind: 'players', tick: 0, players: [ALPHA, BRAVO] }];
    for (let tick = 0; tick <= 600; tick += 2) {
      if (tick === 300) records.push({ kind: 'event', tick, event: { type: 'bomb', ...planted } });
      records.push({ kind: 'snap', tick, bodies: [body(1, tick), body(2, -tick)] });
    }
    records.push({ kind: 'end', tick: 600, reason: 'closed' });
    const replay = new ReplayClient(Promise.resolve({ header: h, records, truncated: false }), { name: 'Watcher', map: 'MP2', now: () => 0 });
    const place = vi.fn();
    const net = { client: asNetClient(replay) } as unknown as NetPage;
    const { acts } = rig({ net: () => net, bombView: { worldBomb: { place } } });
    await replay.ready;
    acts.followNet();                                      // main.ts's frame: the pages follow the page's client, the replay's too
    expect(acts.roomEvents.following()).toBe(net.client);
    replay.seek(400);
    expect(acts.bomb.state()?.state).toBe(BOMB_STATE.planted);
    expect(place.mock.calls.at(-1)?.[0]).toEqual([5, 0, 5]);
  });
});

describe('T81-3 (research 215 s7.8): the walk held to the turret, through the part both pages mount', () => {
  it("the part hands the walk the held turret's clamp (WalkMode.setTurretAim <- TurretPage.clampLook): seated, a look past the turret's limits comes back at them; unseated, as given (room.ts onTurret's clampAim before its gate)", () => {
    const DEG = Math.PI / 180;
    const place = {
      id: 0, root: 'worldmodel/syn_turret', name: 'syn_turret', origin: [0, 0, 0], facing: 0,
      parts: { turret: 'syn/turret', gun: 'syn/turret/gun', firepoint: 'syn/turret/gun/firepoint' },
      gunOrigin: [0, 0, 0], firepointOrigin: [0, 0, -5], limits: { yaw: [-70 * DEG, 70 * DEG], pitch: [-25 * DEG, 10 * DEG] },
      mountRange: 22, mountAngleCos: Math.cos(35 * DEG), weapon: null, ammoInit: 72,
    };
    const map = { turrets: [place] } as unknown as LoadedMap;
    const client = { state: 'open', role: 'player', id: 1, send: () => {}, lastSeq: () => 0 };
    const { acts, turretAim } = rig({ map: () => map, net: () => ({ client }) as unknown as NetPage });
    let tell = null as ((ev: unknown) => void) | null;
    acts.follow({ on: (l: (ev: unknown) => void) => { tell = l; return () => {}; } } as never);
    const clamp = turretAim();
    expect(clamp, 'the walk given the turret clamp').not.toBeNull();
    expect(clamp!(120, -60)).toEqual({ yaw: 120, pitch: -60 });              // nothing held: the look as given
    tell!({ type: 'turret', id: 0, occupant: 1, ammo: 72 });
    const held = clamp!(120, -60);
    expect(held.yaw).toBeCloseTo(70, 6);                                   // the yaw stop
    expect(held.pitch).toBeCloseTo(-25, 6);                                // the pitch stop (MP10's MGL turret's -25..10)
    expect(clamp!(30, 5)).toEqual({ yaw: 30, pitch: 5 });                  // within them, as given
    tell!({ type: 'turret', id: 0, occupant: null, ammo: 72 });
    expect(clamp!(120, -60)).toEqual({ yaw: 120, pitch: -60 });            // released
  });
});

describe('PAR-55 (research 215 s8): the weapon box while mounted, through the part both pages mount', () => {
  it("the part's hands (main.ts's and matchMount.ts's `throws.hands(actionHands(() => acts))`): seated by the room, the box is the kit's holding the turret's weapon -- the 750 in PKM TURRET's magazines of 250, its HUDW icon, its AUTO -- and the firearm's again at the release", () => {
    const DEG = Math.PI / 180;
    const place = {
      id: 0, root: 'worldmodel/syn_turret', name: 'syn_turret', origin: [0, 0, 0], facing: 0,
      parts: { turret: 'syn/turret', gun: 'syn/turret/gun', firepoint: 'syn/turret/gun/firepoint' },
      gunOrigin: [0, 0, 0], firepointOrigin: [0, 0, -5], limits: { yaw: [-70 * DEG, 70 * DEG], pitch: [-45 * DEG, 45 * DEG] },
      mountRange: 22, mountAngleCos: Math.cos(35 * DEG), weapon: 'PKM TURRET', ammoInit: 750,
    };
    // The disc's PKM TURRET as `kitTableOf` reads it (research 215 s8; `test/turretPage.test.ts` reads the disc's own).
    const pkm = { id: 205, name: 'PKM TURRET', icon: 'Turret_RMG.tif' };
    const record = { id: 205, name: 'PKM TURRET', magazine: 250, mags: 3, fireWait: 0.12, maxFireMode: 3, fireModes: [3] };
    const map = {
      turrets: [place],
      arsenal: { table: { arsenal: { byName: new Map([['PKM TURRET', pkm]]), items: new Map([[205, pkm]]) }, records: new Map(), turretRecords: new Map([[205, record]]) } },
    } as unknown as LoadedMap;
    const client = { state: 'open', role: 'player', id: 1, send: () => {}, lastSeq: () => 0 };
    const { acts } = rig({ map: () => map, net: () => ({ client }) as unknown as NetPage });
    let tell = null as ((ev: unknown) => void) | null;                                     // the room's events to the part
    acts.follow({ on: (l: (ev: unknown) => void) => { tell = l; return () => {}; } } as never);
    const hands = actionHands(() => acts);                                                 // as both pages make it
    expect([hands.magazine?.(), hands.icon?.(), hands.fireMode?.(), hands.mounted?.()]).toEqual([null, null, null, false]);
    tell!({ type: 'turret', id: 0, occupant: 1, ammo: 750 });
    expect(hands.mounted?.()).toBe(true);
    expect(hands.magazine?.()).toEqual({ rounds: 250, capacity: 250, spare: 2, reloading: false });
    expect([hands.icon?.(), hands.fireMode?.()]).toEqual(['turret_rmg.tif', 3]);
    expect(hands.trigger?.(true)).toBe(true);                                              // the turret's trigger
    tell!({ type: 'turret', id: 0, occupant: 1, ammo: 711 });
    expect(hands.magazine?.()).toEqual({ rounds: 211, capacity: 250, spare: 2, reloading: false });   // the owner's 711
    tell!({ type: 'turret', id: 0, occupant: null, ammo: 711 });
    expect([hands.magazine?.(), hands.icon?.(), hands.fireMode?.(), hands.mounted?.()]).toEqual([null, null, null, false]);
  });
  it("PAR-56: the hands name the mounted turret's weapon by the arsenal's id of its WEAPON NAME -- MGL FRAG TURRET's 230, which has no firearm record (`kitTableOf` reads class 205's only) -- and none at the release", () => {
    const DEG = Math.PI / 180;
    const place = {
      id: 0, root: 'worldmodel/syn_turret', name: 'syn_turret', origin: [0, 0, 0], facing: 0,
      parts: { turret: 'syn/turret', gun: 'syn/turret/gun', firepoint: 'syn/turret/gun/firepoint' },
      gunOrigin: [0, 0, 0], firepointOrigin: [0, 0, -5], limits: { yaw: [-70 * DEG, 70 * DEG], pitch: [-45 * DEG, 45 * DEG] },
      mountRange: 22, mountAngleCos: Math.cos(35 * DEG), weapon: 'MGL FRAG TURRET', ammoInit: 24,
    };
    const mgl = { id: 230, name: 'MGL FRAG TURRET', icon: 'Turret_MGL.tif' };
    const map = {
      turrets: [place],
      arsenal: { table: { arsenal: { byName: new Map([['MGL FRAG TURRET', mgl]]), items: new Map([[230, mgl]]) }, records: new Map(), turretRecords: new Map() } },
    } as unknown as LoadedMap;
    const client = { state: 'open', role: 'player', id: 1, send: () => {}, lastSeq: () => 0 };
    const { acts } = rig({ map: () => map, net: () => ({ client }) as unknown as NetPage });
    let tell = null as ((ev: unknown) => void) | null;
    acts.follow({ on: (l: (ev: unknown) => void) => { tell = l; return () => {}; } } as never);
    const hands = actionHands(() => acts);
    expect(hands.weapon?.()).toBeNull();
    tell!({ type: 'turret', id: 0, occupant: 1, ammo: 24 });
    expect([hands.mounted?.(), hands.weapon?.()]).toEqual([true, 230]);
    tell!({ type: 'turret', id: 0, occupant: null, ammo: 24 });
    expect([hands.mounted?.(), hands.weapon?.()]).toEqual([false, null]);
  });
  it("LATER 97: the hands carry the mounted placement's THERMAL (its definition's, D:L301769-301771 -> +0x298) -- true on a THERMAL turret, false on a plain one and at the release", () => {
    const DEG = Math.PI / 180;
    for (const thermal of [true, false]) {
      const place = {
        id: 0, root: 'worldmodel/syn_turret', name: 'syn_turret', origin: [0, 0, 0], facing: 0,
        parts: { turret: 'syn/turret', gun: 'syn/turret/gun', firepoint: 'syn/turret/gun/firepoint' },
        gunOrigin: [0, 0, 0], firepointOrigin: [0, 0, -5], limits: { yaw: [-70 * DEG, 70 * DEG], pitch: [-45 * DEG, 45 * DEG] },
        mountRange: 22, mountAngleCos: Math.cos(35 * DEG), weapon: 'PKM TURRET', ammoInit: 750, def: { thermal },
      };
      const map = { turrets: [place] } as unknown as LoadedMap;
      const client = { state: 'open', role: 'player', id: 1, send: () => {}, lastSeq: () => 0 };
      const { acts } = rig({ map: () => map, net: () => ({ client }) as unknown as NetPage });
      let tell = null as ((ev: unknown) => void) | null;
      acts.follow({ on: (l: (ev: unknown) => void) => { tell = l; return () => {}; } } as never);
      const hands = actionHands(() => acts);
      expect([thermal, hands.thermal?.()]).toEqual([thermal, false]);
      tell!({ type: 'turret', id: 0, occupant: 1, ammo: 750 });
      expect([thermal, hands.thermal?.()]).toEqual([thermal, thermal]);
      tell!({ type: 'turret', id: 0, occupant: null, ammo: 750 });
      expect([thermal, hands.thermal?.()]).toEqual([thermal, false]);
    }
  });
});

describe("PAR-59 (research 215 s8): the MGL turret's trigger -- the claim the room launches from, one round a pull", () => {
  const DEG = Math.PI / 180;
  /** A seated page on a placement holding `weapon`, its firearm records as `kitTableOf` reads the disc's (research 215 s8). */
  const seated = (weapon: 'MGL FRAG TURRET' | 'PKM TURRET') => {
    const place = {
      id: 0, root: 'worldmodel/syn_turret', name: 'syn_turret', origin: [0, 0, 0], facing: 0,
      parts: { turret: 'syn/turret', gun: 'syn/turret/gun', firepoint: 'syn/turret/gun/firepoint' },
      gunOrigin: [0, 0, 0], firepointOrigin: [0, 0, -5], limits: { yaw: [-70 * DEG, 70 * DEG], pitch: [-25 * DEG, 10 * DEG] },
      mountRange: 22, mountAngleCos: Math.cos(35 * DEG), weapon, ammoInit: weapon === 'PKM TURRET' ? 750 : 72,
    };
    const mgl = { id: 230, name: 'MGL FRAG TURRET', icon: 'Turret_MGL.tif' }, pkm = { id: 205, name: 'PKM TURRET', icon: 'Turret_RMG.tif' };
    // MGL FRAG TURRET 230: FireWait 1, MaxFireMode 1 (SINGLE) -- class 230's record (`turret2Records`); PKM TURRET 205: 0.12, AUTO.
    const mglRecord = { id: 230, name: 'MGL FRAG TURRET', magazine: 24, mags: 3, fireWait: 1, maxFireMode: 1, fireModes: [1] };
    const pkmRecord = { id: 205, name: 'PKM TURRET', magazine: 250, mags: 3, fireWait: 0.12, maxFireMode: 3, fireModes: [3] };
    const map = {
      turrets: [place],
      arsenal: { table: {
        arsenal: { byName: new Map([['MGL FRAG TURRET', mgl], ['PKM TURRET', pkm]]), items: new Map([[230, mgl], [205, pkm]]) },
        records: new Map(), turretRecords: new Map([[205, pkmRecord]]), turret2Records: new Map([[230, mglRecord]]),
      } },
    } as unknown as LoadedMap;
    const sent: ClientEvent[] = [], drawn: number[] = [], order: string[] = [];
    const client = { state: 'open', role: 'player', id: 1, send: (ev: ClientEvent) => { sent.push(ev); }, lastSeq: () => 7, viewTick: () => 3 };
    const { acts } = rig({
      map: () => map, net: () => ({ client }) as unknown as NetPage,
      turret: { round: (record) => { drawn.push(record.id); order.push('bloom'); } },   // TURRET-CONE P1: the round's bloom
    }, { eye: [0, 10, 0], far: [0, 10, -100] });
    let tell = null as ((ev: unknown) => void) | null;
    acts.follow({ on: (l: (ev: unknown) => void) => { tell = l; return () => {}; } } as never);
    tell!({ type: 'turret', id: 0, occupant: 1, ammo: place.ammoInit });
    /** `s` seconds of frames at 60 Hz, the trigger `held`. */
    const run = (s: number, held: boolean): void => {
      acts.trigger(held);
      for (let i = 0; i < Math.round(s * 60); i++) acts.turretFrame(1 / 60, false);
    };
    return { sent, drawn, run, client, acts, place, order };
  };

  it("mounted on MGL FRAG TURRET, a press sends the turret's claim (the PKM's command) and draws the room's round of the 230 record; held, nothing more -- SINGLE, one round a pull (FUN_005c0940, FUN_005c0ae0 D:L476438-476439); a new pull waits out FireWait 1 s (D:L476446-476448)", () => {
    const { sent, drawn, run, place } = seated('MGL FRAG TURRET');
    run(1 / 60, true);
    // TURRET-CONE P2: the claim is the page's own round -- from the firepoint at the aim, down the gun's line (no spread set)
    // -- the eye and the aim the camera's (was: the eye's `from: [0, 10, 0], dir: [0, 0, -1]`, the line unused by the room).
    expect(sent).toEqual([{ type: 'fire', seq: 7, from: muzzleAt(place as never, 0, 0), dir: gunLine(0, 0), weapon: 0, viewTick: 3, eye: [0, 10, 0], aim: [0, 0, -1] }]);
    expect(drawn).toEqual([230]);
    run(3, true);                                                    // held 3 s: one a pull
    expect(sent).toHaveLength(1);
    run(1 / 60, false);
    run(1 / 60, true);                                               // a new pull, past the wait
    expect(sent).toHaveLength(2);
    run(1 / 60, false);
    run(0.5, true);                                                  // a pull inside FireWait: held, it fires at the wait's end
    expect(sent).toHaveLength(2);
    run(0.5, true);
    expect(sent).toHaveLength(3);
    expect(drawn).toEqual([230, 230, 230]);
  });

  it("a press on a frame that sends nothing (no open player client) spends no pull: still held, the claim goes once it can (the original counts the pull when the round fires, D:L475516) -- PAR-59's review", () => {
    const { sent, run, client } = seated('MGL FRAG TURRET');
    client.state = 'closed';
    run(1 / 60, true);
    expect(sent).toHaveLength(0);
    client.state = 'open';
    run(1.1, true);                                                  // held on, past the cadence's wait: the pull is still unspent
    expect(sent).toHaveLength(1);
  });

  // TURRET-CONE P2 (research 215 s8.2): the room bounds the claim's line inside the turret record's cone about its own gun
  // line (`room.ts` `turretRound`), so the page claims the round it draws: `TurretPage.round()` first -- its muzzle and its
  // line rolled on the cone (`setSpread`) -- then the claim carries `from: r.from, dir: r.dir`, the eye and the aim the
  // camera's as before. The roll is read before the round's bloom (`MatchFirearm.turretRound`): the original's `+0x74`
  // (D:L475601) before the round's step (D:L475604), P1's review F2.
  it("TURRET-CONE P2: the claim is the page's drawn round -- from its muzzle along its rolled line (r.from, r.dir), the eye and aim the camera's -- and the cone is rolled before the round's bloom (D:L475601 before D:L475604)", () => {
    const { sent, run, acts, place, order } = seated('PKM TURRET');
    const cone = { offsetX: 0.01, offsetY: -0.02, radius: 0 };
    acts.turrets.setSpread(() => { order.push('cone'); return cone; });
    run(1 / 60, true);
    expect(sent).toHaveLength(1);
    const ev = sent[0] as Extract<ClientEvent, { type: 'fire' }>;
    expect(ev.from).toEqual(muzzleAt(place as never, 0, 0));
    const line = perturb(gunLine(0, 0), cone), l = Math.hypot(...line);
    ev.dir.forEach((v, i) => expect(v).toBeCloseTo(line[i]! / l, 12));
    expect([ev.eye, ev.aim]).toEqual([[0, 10, 0], [0, 0, -1]]);
    expect(order).toEqual(['cone', 'bloom']);
  });

  it('PKM TURRET unchanged: held, AUTO claims at FireWait x 0.8 (`turretInterval`)', () => {
    const { sent, drawn, run } = seated('PKM TURRET');
    run(1, true);
    expect(sent.length).toBeGreaterThan(9);                          // 0.096 s apart: 11 in a second
    expect(new Set(drawn)).toEqual(new Set([205]));
  });
});

// OBF-31b (research 122 §14, `ROUND_SCREENS_STOP_ALL_READING`; reading, pending review): under the round screens MPExitState
// alone is ticked (`FUN_002ce9e0` D:L171877-171888), so the page takes no press and lets a held trigger go (OBF-31). The
// firearm's and the throwables' trigger swallow every edge there, so a turret trigger held into the screens never heard its
// release: the latch stayed held and its claims ran on under them. Its let-go is the turret's own release (`trigger(false)`).
describe("OBF-31b: a turret trigger held into the round screens is let go as a release lets it go", () => {
  const DEG = Math.PI / 180;
  const seated = (up: { v: boolean }, occupant: number | null = 1) => {
    const place = {
      id: 0, root: 'worldmodel/syn_turret', name: 'syn_turret', origin: [0, 0, 0], facing: 0,
      parts: { turret: 'syn/turret', gun: 'syn/turret/gun', firepoint: 'syn/turret/gun/firepoint' },
      gunOrigin: [0, 0, 0], firepointOrigin: [0, 0, -5], limits: { yaw: [-70 * DEG, 70 * DEG], pitch: [-25 * DEG, 10 * DEG] },
      mountRange: 22, mountAngleCos: Math.cos(35 * DEG), weapon: 'PKM TURRET', ammoInit: 750,
    };
    const pkm = { id: 205, name: 'PKM TURRET', icon: 'Turret_RMG.tif' };
    const pkmRecord = { id: 205, name: 'PKM TURRET', magazine: 250, mags: 3, fireWait: 0.12, maxFireMode: 3, fireModes: [3] };
    const map = {
      turrets: [place],
      arsenal: { table: { arsenal: { byName: new Map([['PKM TURRET', pkm]]), items: new Map([[205, pkm]]) }, records: new Map(), turretRecords: new Map([[205, pkmRecord]]) } },
    } as unknown as LoadedMap;
    const sent: ClientEvent[] = [];
    const client = { state: 'open', role: 'player', id: 1, send: (ev: ClientEvent) => { sent.push(ev); }, lastSeq: () => 7, viewTick: () => 3 };
    const { acts } = rig({ map: () => map, net: () => ({ client, screenUp: () => up.v }) as unknown as NetPage }, { eye: [0, 10, 0], far: [0, 10, -100] });
    let tell = null as ((ev: unknown) => void) | null;
    acts.follow({ on: (l: (ev: unknown) => void) => { tell = l; return () => {}; } } as never);
    tell!({ type: 'turret', id: 0, occupant, ammo: 750 });
    const frames = (s: number): void => { for (let i = 0; i < Math.round(s * 60); i++) acts.turretFrame(1 / 60, false); };
    return { acts, sent, frames };
  };

  it('mounted and living, held when the screens come up: not held, no claim under them, nothing held at the next round', () => {
    const up = { v: false };
    const { acts, sent, frames } = seated(up);
    expect(acts.trigger(true)).toBe(true);                           // the turret's trigger, pressed in the round
    frames(0.5);
    const inRound = sent.length;
    expect(inRound).toBeGreaterThan(0);                              // held: AUTO claims
    expect(acts.triggerHeld()).toBe(true);
    up.v = true;                                                     // the screens up; the button still down, no edge heard
    frames(1 / 60);
    expect(acts.triggerHeld()).toBe(false);                          // let go at the first screen frame
    frames(3);
    expect(sent.length).toBe(inRound);                               // no `sendTurretRound` under the screens
    up.v = false;                                                    // the next round's start, never pressed again
    frames(1);
    expect(acts.triggerHeld()).toBe(false);
    expect(sent.length).toBe(inRound);
    expect(acts.trigger(true)).toBe(true);                           // a new press there claims again
    frames(1 / 60);
    expect(sent.length).toBe(inRound + 1);
  });

  it('not mounted: unchanged -- the trigger is not the turret\'s, nothing held, before, under and after the screens', () => {
    const up = { v: false };
    const { acts, sent, frames } = seated(up, null);
    expect(acts.trigger(true)).toBe(false);
    up.v = true;
    frames(1);
    expect([acts.trigger(true), acts.triggerHeld(), sent.length]).toEqual([false, false, 0]);
    up.v = false;
    frames(1);
    expect([acts.trigger(false), acts.triggerHeld(), sent.length]).toEqual([false, false, 0]);
  });
});

describe('PF-34 (research 234 s5, s6): the weapon pickup in the action part', () => {
  /** A drop ahead (`did`, null for none) and a net whose `pickup` claims are heard. */
  function pickupRig(ahead: () => number | null) {
    const claims: number[] = [];
    const net = { pickup: (did: number) => { claims.push(did); return true; }, client: { role: 'player', state: 'open', id: 1, team: 'seal', serverTick: () => 0, bodies: () => [], lastSeq: () => 0 } };
    const r = rig({ drops: { ahead }, net: () => net as never });
    return { ...r, claims };
  }
  it('a weapon drop ahead is the pickup context; the release claims it of the room (NetPage.pickup with its did)', () => {
    const { acts, claims } = pickupRig(() => 7);
    expect(acts.pick()).toBe('pickup');
    acts.lanes(cross(false), cross(true), 1 / 60);
    acts.lanes(cross(true), cross(false), 1 / 60);
    expect(claims).toEqual([7]);
  });
  it("NU-5 review F3: a claim sent through the table notes the claim's command on the walk (WalkMode.pickupClaimed, PICKUP_SWAP_OWN_LAG_READING); a claim the net refuses notes none", () => {
    const { acts, claims, calls } = pickupRig(() => 7);
    acts.lanes(cross(false), cross(true), 1 / 60);
    acts.lanes(cross(true), cross(false), 1 / 60);
    expect(claims).toEqual([7]);
    expect(calls.filter((c) => c === 'walk.pickupClaimed')).toHaveLength(1);
    const net = { pickup: () => false, client: { role: 'player', state: 'open', id: 1, team: 'seal', serverTick: () => 0, bodies: () => [], lastSeq: () => 0 } };
    const off = rig({ drops: { ahead: () => 7 }, net: () => net as never });
    off.acts.lanes(cross(false), cross(true), 1 / 60);
    off.acts.lanes(cross(true), cross(false), 1 / 60);
    expect(off.calls.filter((c) => c === 'walk.pickupClaimed')).toEqual([]);
  });
  it('a chosen pickup holds the weapon prompt (PICKUP_PROMPT_COOLDOWN_READING), run down by the frames only while a drop is in reach', () => {
    let ahead: number | null = 7;
    const { acts } = pickupRig(() => ahead);
    acts.lanes(cross(false), cross(true), 1 / 60);
    acts.lanes(cross(true), cross(false), 1 / 60);
    expect(acts.wiring.lifecycle.pickupHeld()).toBe(true);
    expect(acts.pick()).toBeNull();
    ahead = null;
    acts.lanes(cross(false), cross(false), PICKUP_PROMPT_COOLDOWN_READING + 1);     // out of reach: the hold does not run
    expect(acts.wiring.lifecycle.pickupHeld()).toBe(true);
    ahead = 7;
    acts.lanes(cross(false), cross(false), PICKUP_PROMPT_COOLDOWN_READING);
    expect(acts.wiring.lifecycle.pickupHeld()).toBe(false);
    expect(acts.pick()).toBe('pickup');
  });
  it("PAR-34 (PICKUP_HOLD_PER_CLASS_READING): with the drops' candidate classes lent (a corpse's rifle and pistol: 2), the hold runs down twice a frame -- the 3 s ends after 1.5 s", () => {
    const claims: number[] = [];
    const net = { pickup: (did: number) => { claims.push(did); return true; }, client: { role: 'player', state: 'open', id: 1, team: 'seal', serverTick: () => 0, bodies: () => [], lastSeq: () => 0 } };
    const { acts } = rig({ drops: { ahead: () => 7, candidates: () => 2 }, net: () => net as never });
    acts.lanes(cross(false), cross(true), 1 / 60);
    acts.lanes(cross(true), cross(false), 1 / 60);
    expect(acts.wiring.lifecycle.pickupHeld()).toBe(true);
    acts.lanes(cross(false), cross(false), PICKUP_PROMPT_COOLDOWN_READING / 2 - 0.05);   // the release frame ran 2 x 1/60 already
    expect(acts.wiring.lifecycle.pickupHeld()).toBe(true);
    acts.lanes(cross(false), cross(false), 0.05);
    expect(acts.wiring.lifecycle.pickupHeld()).toBe(false);
  });
  it('no drops (a page without the world drops): never the pickup context, nothing claimed', () => {
    const claims: number[] = [];
    const net = { pickup: (did: number) => { claims.push(did); return true; }, client: { role: 'player', state: 'open', id: 1, team: 'seal', serverTick: () => 0, bodies: () => [], lastSeq: () => 0 } };
    const { acts } = rig({ net: () => net as never });
    const elapse = vi.spyOn(acts.wiring.lifecycle, 'elapse');
    expect(acts.pick()).toBeNull();
    acts.lanes(cross(false), cross(true), 1 / 60);
    acts.lanes(cross(true), cross(false), 1 / 60);
    expect(elapse.mock.calls).toEqual([[1 / 60, false], [1 / 60, false]]);   // never a drop in reach
    expect(acts.wiring.lifecycle.pickupHeld()).toBe(false);
    expect(claims).toEqual([]);
  });
});

describe('one action part: /testroom mounts it and builds none of its pages itself', () => {
  const src = (f: string): string => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src', f), 'utf-8');
  it('main.ts calls mountActions; no RoomEvents, ActionPage, TurretPage, BombPage, ActionWiring or TurretTrigger of its own', () => {
    expect(src('main.ts')).toMatch(/mountActions\(\{/);
    expect(src('main.ts')).not.toMatch(/new (RoomEvents|ActionPage|TurretPage|BombPage|ActionWiring|TurretTrigger)\(/);
  });
  it("PF-34: /testroom lends the action part its drops (the prompt's drop ahead), makes them once and clears them with the air; the prompt, the claim and the hold's frames are the part's", () => {
    expect(src('main.ts')).toMatch(/const drops = new WorldDrops\(dropModels\(/);
    expect(src('main.ts')).toMatch(/drops: \{ ahead: \(\) => drops\.promptAt\(walk\.feet\(\), walk\.snapshot\(\)\?\.yaw \?\? 0\), candidates: /);   // PAR-34 group 7: the count beside it
    expect(src('main.ts')).toMatch(/clearAir: \(\) => \{ throws\.roundStart\(\); drops\.reset\(\); startMenu\.roundStart\(\); regionCull\.reset\(\); \},/);   // LATER 12: the air through the throwables' round start (LATER 415 F2: the region cull's too)
    expect(src('matchActions.ts')).toMatch(/pickup: \(\) => \{ const did = dropAhead\(\); const sent = did !== null && \(d\.net\(\)\?\.pickup\(did\) \?\? false\); if \(sent\) walk\.pickupClaimed\?\.\(\); return sent; \},/);   // NU-5 review F3
    expect(src('matchActions.ts')).toMatch(/wiring\.lifecycle\.elapse\(dt, d\.drops\?\.candidates\?\.\(\) \?\? \(dropAhead\(\) !== null\)\);/);   // PAR-34: once per candidate class
    expect(src('main.ts')).not.toMatch(/pickup: \(\)|lifecycle\.elapse/);
  });
  // ACT-1 (ruling ACT.R1, research 250 s1): the front end mounts the same part with the same deps' shape -- `drops` since
  // PAR-4 (H120), after `win` as main.ts's; the `turret` block and `hostages` since ACT-2/ACT-5 -- and builds none of its pages itself either.
  it('matchMount.ts calls mountActions with the same deps shape main.ts does -- doors, traversal, grenade, remote, bombView\'s seven (PB-1: the own body and the sound lent), win -- and makes no RoomEvents, ActionPage, TurretPage, BombPage or ActionWiring of its own', () => {
    const shape = /mountActions\(\{\s+walk, fly, doors, traversal, grenade(?:: throws\.grenade)?, remote, play, firearm,[^\n]*\n\s+net: \(\) => net, map: \(\) => (?:loaded|map), view: \(\) => view, world: \(\) => [^\n]+\n\s+craneToggle: \(valve\) => cranes\.toggleLocal\(valve\),\n\s+gatePress: \(action, seq\) => gates\.press\(action, seq\), cranePress: \(valve, seq\) => cranes\.press\(valve, seq\),[^\n]*\n\s+bombView: \{\n\s+roundAudio(?:: sound\.roundAudio)?, hud, remotePlayers: remote, effects(?:: firearm\.effects)?, worldBomb: (?:throws\.)?grenade\.worldBomb\(\),\n\s+ownBody: ownBombBody\(play, (?:throws\.)?throwPose, walk, \(\) => firearm\.item\(\) === 'pistol'\),[^\n]*\n\s+sound: bombSound\((?:gameAudio|sound\.audio)\),[^\n]*\n\s+pulse: worldPulse\(\(\) => (?:pageWorld|world\?\.world \?\? null)\),[^\n]*\n\s+\},\n\s+win: /;
    // PB-9b (research 284 s8): an eighth, the bases' pulse on the page's world (`worldPulse`); the title keeps its registry name.
    // P8 (SWITCH_PREDICT_ADAPTATION): the gates' and the hooks' press lent beside the crane's offline toggle, in both.
    for (const f of ['main.ts', 'matchMount.ts']) {
      expect(src(f), f).toMatch(shape);
      expect(src(f), f).not.toMatch(/new (RoomEvents|ActionPage|TurretPage|BombPage|ActionWiring|TurretTrigger)\(/);
    }
  });
  it('PF-34 review: a map left clears the drops -- connectNet resets them where it closes the old net (WorldDrops.reset; offline no welcome replaces them)', () => {
    // #395 review F1: connectNet's teardown is `leaveRoom` (the test room's zombies stand the offline match down through it)
    expect(src('main.ts')).toMatch(/function connectNet\([^)]*\): void \{[\s\S]*?\n {2}leaveRoom\(\);[\s\S]*?const deps = matchNetDeps\(/);
    expect(src('main.ts')).toMatch(/function leaveRoom\(\): void \{[\s\S]*?net\?\.close\(\);[\s\S]*?\n {2}drops\.reset\(\);[\s\S]*?\n\}/);
  });
});

/**
 * Research 303: the VICTORY DANCE in the action part both pages mount -- the room's offer in the picker, the release's
 * one request, the room's answer on the body and the mover (the ticks the page ran past the room's start), the Action
 * and the trigger held off while it is asked or plays, a reload's stop, and the list turned by Cross and a d-pad side.
 */
describe('mountActions: the VICTORY DANCE (research 303)', () => {
  const dance = { name: 'victory_funky', weight: 1, clip: { name: 'victory_funky', frameCount: 85, parts: [] }, motion: { playback: 2.5, noFire: 1 } };
  function danceRig(extra: Partial<MatchActionsDeps> = {}) {
    const sent: ClientEvent[] = [];
    const client = { state: 'open', id: 1, role: 'player', send: (ev: ClientEvent) => { sent.push(ev); }, lastSeq: () => 10, bodies: () => [], serverTick: () => 0, on: () => () => {} };
    const r = rig({
      net: () => ({ client }) as unknown as NetPage,
      map: () => ({ victory: { variants: [dance], missing: [] } }) as unknown as LoadedMap,
      ...extra,
    });
    return { ...r, sent };
  }
  it('offered by the room, it is the head; the release asks the room once and lets the trigger and a held grenade go', () => {
    const { acts, sent, calls } = danceRig();
    expect(acts.pick()).toBeNull();
    acts.roomEvents.emit({ type: 'victoryOffer', status: 'available' });
    expect(acts.pick()).toBe('victory');
    expect(acts.prompt(true)).toEqual([{ prompt: 'victory' }]);   // LkPaioX5 (a): the list, its head first
    acts.lanes(cross(false), cross(true), 1 / 60);
    acts.lanes(cross(true), cross(false), 1 / 60);
    expect(sent).toEqual([{ type: 'victory', request: 1 }]);
    expect(calls).toContain('trigger.release');
    expect(calls).toContain('grenade.cancel');
    expect(acts.pick()).toBeNull();                                  // asked: nothing else offered meanwhile
    acts.lanes(cross(false), cross(true), 1 / 60);
    acts.lanes(cross(true), cross(false), 1 / 60);
    expect(sent).toHaveLength(1);                                    // one request until the room answers
    acts.roomEvents.emit({ type: 'victoryOffer', status: 'unsupported-order' });
    expect(acts.pick()).toBeNull();
  });
  it("the room's answer for this seat plays on the body and the mover, the ticks run past `seq`; another seat's is not this part's", () => {
    const { acts, calls } = danceRig();
    acts.roomEvents.emit({ type: 'victory', id: 2, serial: 4, clip: 'victory_funky', elapsed: 0, seq: 3 });
    expect(calls.filter((c) => c.startsWith('play.dance') || c.startsWith('walk.dance'))).toEqual([]);
    acts.roomEvents.emit({ type: 'victory', id: 1, serial: 5, clip: 'victory_funky', elapsed: 0, seq: 7 });
    expect(calls).toContain('play.dance:victory_funky');
    expect(calls).toContain('walk.dance:5:3');                         // lastSeq 10 - seq 7
    expect(acts.victoryState().playing?.clip).toBe('victory_funky');
    acts.roomEvents.emit({ type: 'victory', id: 1, serial: 5, clip: null, elapsed: 0 });
    expect(acts.victoryState().playing).toBeNull();
    expect(calls.at(-1)).toBe('walk.dance:off');
  });
  it('the trigger and the Action pressed while it plays are its own until let go; an accepted reload stops it', () => {
    const { acts, reload, filter } = danceRig();
    acts.roomEvents.emit({ type: 'victory', id: 1, serial: 1, clip: 'victory_funky', elapsed: 0 });
    expect(filter()!()).toBe(true);                                   // the walk's action filtered off
    expect(acts.trigger(true)).toBe(true);                            // no round, no pin
    acts.lanes(cross(false), cross(true), 1 / 60);
    expect(acts.wiring.lifecycle.down()).toBe(false);
    reload()!({ type: 'reloadStart' } as FireEvent);
    expect(acts.victoryState().playing).toBeNull();
    expect(acts.trigger(true)).toBe(true);                            // still held from the dance
    expect(acts.trigger(false)).toBe(true);
    expect(acts.trigger(true)).toBe(false);                           // a fresh press: the firearm's
    acts.lanes(cross(true), cross(true), 1 / 60);
    expect(acts.wiring.lifecycle.down()).toBe(false);                 // Cross held through it: nothing until let go
    acts.lanes(cross(true), cross(false), 1 / 60);
    acts.lanes(cross(false), cross(true), 1 / 60);
    expect(acts.wiring.lifecycle.down()).toBe(true);
  });
  it('Cross held and a d-pad side turn the list (FUN_00595320), the side no peek until let go; a welcome resets the offer', () => {
    const { acts, lanes } = danceRig({ doors: { target: () => ({}), action: () => false } });
    acts.roomEvents.emit({ type: 'victoryOffer', status: 'available' });
    expect(acts.pick()).toBe('door');
    acts.lanes(cross(false), cross(true), 1 / 60);
    expect(acts.wiring.lifecycle.heldContext()).toBe('door');
    acts.lanes(cross(true), { ...cross(true), leanLeft: true }, 1 / 60);
    expect(acts.pick()).toBe('victory');                              // Left: the head to the tail
    expect(acts.wiring.lifecycle.heldContext()).toBe('victory');
    expect(lanes.at(-1)!.leanLeft).toBe(false);                       // taken by the turn, not a peek
    acts.lanes({ ...cross(true), leanLeft: true }, { ...cross(true), leanLeft: true }, 1 / 60);
    expect(acts.pick()).toBe('victory');                              // a held side does not repeat
    acts.roomEvents.emit({ type: 'welcome' } as never);
    expect(acts.pick()).toBe('door');
  });
});

describe("PAR-34 group 7 (research 234 s7, PICKUP_HOLD_PER_CLASS_READING): both pages hand the drops' candidate count", () => {
  it("main.ts and matchMount.ts pass `candidates: () => drops.holdCandidatesAt(...)` beside `ahead`", () => {
    const src = (f: string): string => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src', f), 'utf-8');
    for (const f of ['main.ts', 'matchMount.ts']) {
      // LkPaioX5 (c): then the second candidate's drop and the drops' items (the TAKE entries' names).
      expect(src(f), f).toMatch(/drops: \{ ahead: \(\) => drops\.promptAt\(walk\.feet\(\), walk\.snapshot\(\)\?\.yaw \?\? 0\), candidates: \(\) => drops\.holdCandidatesAt\(walk\.feet\(\), walk\.snapshot\(\)\?\.yaw \?\? 0\), second: \(\) => drops\.promptAt\(walk\.feet\(\), walk\.snapshot\(\)\?\.yaw \?\? 0, 2\), item: \(did\) => drops\.itemOf\(did\) \}/);
    }
  });
});

/**
 * LATER 109 (the controller's call; TURRET_RELEASE_ACTIONS_PLACEHOLDER, strict): through the own release's reversed clip --
 * the commands above the dismount's seq through the end's, the 17th -- the trigger is the release's, as a dance's is: a
 * press there pulls nothing (the firearm draws no round and sends no fire, `matchFirearm` asking `trigger` first) and stays
 * the release's until let go; a fresh press after the clip is the firearm's. The mount clips carry `NoFire` (motion.rdr), its
 * test on a reversed play unread -- strict by the controller's rule. No game data: a synthetic clip and a flat floor.
 */
describe("LATER 109: the trigger held through the own release's reversed clip", () => {
  const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
  const FLOOR: WorldPoly = { modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]) };
  const OWNERS: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
  const DEG = Math.PI / 180, AFTER = 40;
  const clip = (name: string, keys: number): MotionClip => {
    const translations = new Float32Array(keys * 3);
    for (let k = 0; k < keys; k++) translations.set([0, 11 - k / 50, -0.8 - (3.4 * k) / Math.max(1, keys - 1)], k * 3);
    return { name, version: 0, duration: keys / 30, frameCount: keys, parts: [{ index: 0, name: 'skel_root', flags: 0x0c, translations, rotations: new Float32Array(keys * 4) }] } as unknown as MotionClip;
  };

  it("a press from the dismount through the end's command is the release's (no round, no fire), held until let go; after the clip a fresh press is the firearm's", () => {
    const place = {
      id: 0, root: 'worldmodel/syn_turret', name: 'syn_turret', origin: [0, 13.5, 0], facing: 0,
      parts: { turret: 'syn/turret', gun: 'syn/turret/gun', firepoint: 'syn/turret/gun/firepoint' },
      gunOrigin: [0, 13.5, 0], firepointOrigin: [0, 13.5, -9.7], limits: { yaw: [-70 * DEG, 70 * DEG], pitch: [-45 * DEG, 45 * DEG] },
      mountRange: 22, mountAngleCos: Math.cos(35 * DEG), weapon: 'PKM TURRET', ammoInit: 750,
    };
    const map = { turrets: [place] } as unknown as LoadedMap;
    let seq = AFTER;
    const sent: ClientEvent[] = [];
    const client = { state: 'open', role: 'player', id: 1, send: (ev: ClientEvent) => { sent.push(ev); }, lastSeq: () => seq, viewTick: () => 3 };
    const entry = { playback: 0.3, refPt: [-3.31, -2.526, 7.655] };
    const { acts } = rig({
      map: () => map, net: () => ({ client }) as unknown as NetPage,
      turret: { clips: () => ({ clips: [clip('seal_stand2turret', 26), clip('seal_p_stand2turret', 26), clip('seal_turret_poses', 3)], table: [['seal_stand2turret', entry], ['seal_p_stand2turret', entry], ['seal_turret_poses', { playback: 1 }]] as never }) },
    });
    let tell = null as ((ev: unknown) => void) | null;
    acts.follow({ on: (l: (ev: unknown) => void) => { tell = l; return () => {}; } } as never);
    tell!({ type: 'turret', id: 0, occupant: 1, ammo: 750, steer: { ticks: 0, after: AFTER } });
    const w = { state: { x: 0, y: 0, z: 8.5, yaw: 0, vx: 0, vz: 0, pitch: 0 }, grid: groundGrid(packGround(PARAMS, [FLOOR], OWNERS)) };
    const tick = (): void => { acts.turrets.holdTick(w); seq++; };
    while (seq < AFTER + 75) tick();                                  // LATER 151: past the release's wait
    expect(acts.turrets.ownPose()?.clip, 'held').toBe('seal_turret_poses');
    expect(acts.turrets.action(), 'the dismount sent').toBe(true);
    expect(acts.turrets.mounted(), 'released at the press').toBeNull();
    const dseq = seq;
    expect(acts.trigger(true), "a press at the dismount: the release's").toBe(true);
    expect(acts.trigger(false)).toBe(true);
    while (seq < dseq + 16) { tick(); expect(acts.trigger(true), `a press on dseq + ${seq - dseq}`).toBe(true); expect(acts.trigger(false)).toBe(true); }
    expect(acts.trigger(true), "a press for the end's command (dseq + 17)").toBe(true);
    tick();                                                          // dseq + 17: the end's command, the clip off
    expect(acts.trigger(true), "still the release's until let go").toBe(true);
    expect(acts.trigger(false)).toBe(true);
    expect(acts.trigger(true), "a fresh press after the clip: the firearm's").toBe(false);
    expect(sent.filter((e) => e.type === 'fire'), 'no fire sent by the part').toEqual([]);
  });
});

describe("LATER 175 (research 215 s8.6): the mount's kit lock wired from the firearm, through the part both pages mount", () => {
  it("TurretPageDeps.kitLocked from Fire.state: a reloading or after-shot firearm offers no mount (no target, no prompt), an idle one offers it; a firearm with no state never locks (was: offered under the lock)", () => {
    const DEG = Math.PI / 180;
    const place = {
      id: 0, root: 'worldmodel/syn_turret', name: 'syn_turret', origin: [0, 0, 0], facing: 0,
      parts: { turret: 'syn/turret', gun: 'syn/turret/gun', firepoint: 'syn/turret/gun/firepoint' },
      gunOrigin: [0, 0, 0], firepointOrigin: [0, 0, -5], limits: { yaw: [-70 * DEG, 70 * DEG], pitch: [-45 * DEG, 45 * DEG] },
      mountRange: 22, mountAngleCos: Math.cos(35 * DEG), weapon: null, ammoInit: 750,
    };
    const map = { turrets: [place] } as unknown as LoadedMap;
    let lock = { reloading: false, afterShot: false };
    const state = (): FireState => ({ magazine: { reloading: lock.reloading }, afterShot: lock.afterShot }) as unknown as FireState;
    const reloadLocked = (): boolean => lock.reloading || lock.afterShot;   // LATER 221: the wiring reads the command-dated lock
    const { acts, walk } = rig({
      map: () => map,
      firearm: { held: () => {}, fire: { subscribe: () => () => {}, state, reloadLocked } },
    });
    Object.assign(walk, { feet: () => [0, 0, 8.5] });                  // in reach, facing the gun's way
    expect(acts.turrets.target(), 'idle: offered').toBe(0);
    expect(acts.turrets.prompt()).toBe('turret_mount');
    lock = { reloading: true, afterShot: false };
    expect(acts.turrets.target(), "a reload's delay or clip: none").toBeNull();
    expect(acts.turrets.prompt()).toBeNull();
    lock = { reloading: false, afterShot: true };
    expect(acts.turrets.target(), "a bolt's or a pump's after-shot: none").toBeNull();
    expect(acts.turrets.prompt()).toBeNull();
    lock = { reloading: false, afterShot: false };
    expect(acts.turrets.target(), 'the lock over: offered again').toBe(0);
    // A firearm with no `state` (the dependency's optional half): never locked.
    const bare = rig({ map: () => map });
    Object.assign(bare.walk, { feet: () => [0, 0, 8.5] });
    expect(bare.acts.turrets.target()).toBe(0);
  });
  it("LATER 205: under the launcher's set no mount is offered (`FUN_005a88c0` -> `FUN_005b4340(actor, 10)` D:L463019, D:L469528-469531) -- no target, no prompt; the set gone, offered again (was: offered under the set)", () => {
    const DEG = Math.PI / 180;
    const place = {
      id: 0, root: 'worldmodel/syn_turret', name: 'syn_turret', origin: [0, 0, 0], facing: 0,
      parts: { turret: 'syn/turret', gun: 'syn/turret/gun', firepoint: 'syn/turret/gun/firepoint' },
      gunOrigin: [0, 0, 0], firepointOrigin: [0, 0, -5], limits: { yaw: [-70 * DEG, 70 * DEG], pitch: [-45 * DEG, 45 * DEG] },
      mountRange: 22, mountAngleCos: Math.cos(35 * DEG), weapon: null, ammoInit: 750,
    };
    const map = { turrets: [place] } as unknown as LoadedMap;
    let set = false;
    const { acts, walk } = rig({ map: () => map });
    Object.assign(walk, { feet: () => [0, 0, 8.5], launcherSetOn: () => set });
    expect(acts.turrets.target(), 'no set: offered').toBe(0);
    set = true;
    expect(acts.turrets.target(), "the launcher's set: none").toBeNull();
    expect(acts.turrets.prompt()).toBeNull();
    set = false;
    expect(acts.turrets.target(), 'the set given back: offered again').toBe(0);
  });
  it("P37 (the review's F3): the turret page's `moveBusy` reads the walk's traversal `busy()` -- a move holding the mover offers no mount, none or an idle one offers it (the room's 'mount: busy')", () => {
    const DEG = Math.PI / 180;
    const place = {
      id: 0, root: 'worldmodel/syn_turret', name: 'syn_turret', origin: [0, 0, 0], facing: 0,
      parts: { turret: 'syn/turret', gun: 'syn/turret/gun', firepoint: 'syn/turret/gun/firepoint' },
      gunOrigin: [0, 0, 0], firepointOrigin: [0, 0, -5], limits: { yaw: [-70 * DEG, 70 * DEG], pitch: [-45 * DEG, 45 * DEG] },
      mountRange: 22, mountAngleCos: Math.cos(35 * DEG), weapon: null, ammoInit: 750,
    };
    const map = { turrets: [place] } as unknown as LoadedMap;
    let busy = false;
    let moves: { busy(): boolean } | null = null;
    const { acts, walk } = rig({ map: () => map });
    Object.assign(walk, { feet: () => [0, 0, 8.5], traversal: () => moves });
    const deps = (acts.turrets as unknown as { deps: { moveBusy?(): boolean } }).deps;
    expect(deps.moveBusy, 'the dependency is wired').toBeTypeOf('function');
    expect(acts.turrets.target(), 'no moves on the mover: offered').toBe(0);
    moves = { busy: () => busy };
    expect(acts.turrets.target(), 'moves, none running: offered').toBe(0);
    busy = true;
    expect(deps.moveBusy?.()).toBe(true);
    expect(acts.turrets.target(), 'a move holds the mover: none').toBeNull();
    expect(acts.turrets.prompt()).toBeNull();
    busy = false;
    expect(acts.turrets.target(), 'the move over: offered again').toBe(0);
  });
  it("LATER 220 (head 2's re-look, low 1): the bomb page's hold asks the walk's prompts' common gate (BombPageDeps.gateShut)", () => {
    let shut = false;
    const { acts, walk } = rig();
    Object.assign(walk, { actionGateShut: () => shut });
    const deps = (acts.bomb as unknown as { deps: { gateShut?(): boolean } }).deps;
    expect(deps.gateShut?.()).toBe(false);
    shut = true;
    expect(deps.gateShut?.()).toBe(true);
  });

  it("LATER 221: the kit's lock is asked at the ask's command (`Fire.reloadLocked(cmd)`, LATER 72's press window, as the room's `mountKitLocked` counts it) -- a delay-only lock ended on the page's clock while the press window still covers the ask's command offers no mount (was: offered by `Fire.state`, the room refusing it 'mount: reload')", () => {
    const DEG = Math.PI / 180;
    const place = {
      id: 0, root: 'worldmodel/syn_turret', name: 'syn_turret', origin: [0, 0, 0], facing: 0,
      parts: { turret: 'syn/turret', gun: 'syn/turret/gun', firepoint: 'syn/turret/gun/firepoint' },
      gunOrigin: [0, 0, 0], firepointOrigin: [0, 0, -5], limits: { yaw: [-70 * DEG, 70 * DEG], pitch: [-45 * DEG, 45 * DEG] },
      mountRange: 22, mountAngleCos: Math.cos(35 * DEG), weapon: null, ammoInit: 750,
    };
    const map = { turrets: [place] } as unknown as LoadedMap;
    let seq = 15;
    const asked: (number | undefined)[] = [];
    const client = { state: 'open', role: 'player', id: 1, send: () => {}, lastSeq: () => seq };
    // The page's clock: the delay over, nothing reloading. The press window (the room's `pressLock`): to command 20.
    const state = (): FireState => ({ magazine: { reloading: false }, afterShot: false }) as unknown as FireState;
    const reloadLocked = (cmd?: number): boolean => { asked.push(cmd); return cmd !== undefined && cmd < 20; };
    const { acts, walk } = rig({
      map: () => map, net: () => ({ client }) as unknown as NetPage,
      firearm: { held: () => {}, fire: { subscribe: () => () => {}, state, reloadLocked } },
    });
    Object.assign(walk, { feet: () => [0, 0, 8.5] });
    expect(acts.turrets.target(), "the press window covers the ask's command 15: none").toBeNull();
    expect(acts.turrets.prompt()).toBeNull();
    expect(asked.at(-1), "asked at the command the ask names (`lastSeq()`)").toBe(15);
    seq = 20;
    expect(acts.turrets.target(), 'the window over at 20: offered').toBe(0);
  });
});

/**
 * A1, branch B (LATER 239, 217, 218, 243; research 215 s8.6 "A1"): the part's take of this page's own reserved turret,
 * before the command M it names. Its own refusal on the body first (`WalkMode.mountRefused`: dead, a knock-down fall);
 * then the held throw cancelled (`GrenadeThrower.mountTake`), the kit's timer handed over (`Fire.mountTake`) and the body
 * popped and stood (`WalkMode.mountTake`, `./net/blast` `mountPop`) -- the throw before the pop, so the walker's
 * 'replaced' end finds no throw to let go. A reload's delay carried ends where the room's `mountKit` ends it: the press's
 * command (the window's end less the delay's commands, as `netPage.ts` set it) + `turretReloadCountdown(ReloadDelay)`.
 */
describe('A1: the take of this page\'s own reservation, through the part both pages mount', () => {
  const DEG = Math.PI / 180;
  const seated = (o: { refused?: boolean; carried?: ReturnType<NonNullable<MatchActionsDeps['firearm']['fire']['mountTake']>>; grenade?: MatchActionsDeps['grenade'] } = {}) => {
    const place = {
      id: 0, root: 'worldmodel/syn_turret', name: 'syn_turret', origin: [0, 0, 0], facing: 0,
      parts: { turret: 'syn/turret', gun: 'syn/turret/gun', firepoint: 'syn/turret/gun/firepoint' },
      gunOrigin: [0, 0, 0], firepointOrigin: [0, 0, -5], limits: { yaw: [-70 * DEG, 70 * DEG], pitch: [-25 * DEG, 10 * DEG] },
      mountRange: 22, mountAngleCos: Math.cos(35 * DEG), weapon: 'PKM TURRET', ammoInit: 750,
    };
    const pkm = { id: 205, name: 'PKM TURRET', icon: 'Turret_RMG.tif' };
    const pkmRecord = { id: 205, name: 'PKM TURRET', magazine: 250, mags: 3, fireWait: 0.12, maxFireMode: 3, fireModes: [3] };
    const map = {
      turrets: [place],
      arsenal: { table: { arsenal: { byName: new Map([['PKM TURRET', pkm]]), items: new Map([[205, pkm]]) }, records: new Map(), turretRecords: new Map([[205, pkmRecord]]), turret2Records: new Map() } },
    } as unknown as LoadedMap;
    const sent: ClientEvent[] = [], order: string[] = [];
    let seq = 100;
    const client = { state: 'open', role: 'player', id: 1, send: (ev: ClientEvent) => { sent.push(ev); }, lastSeq: () => seq, viewTick: () => 3, replayed: () => undefined };
    const grenade = o.grenade ?? { c4Target: () => null, plantC4: () => false, cancelMenuHold: () => undefined, mountTake: () => { order.push('grenade.mountTake'); } };
    const fire = { subscribe: () => () => undefined, mountTake: () => { order.push('fire.mountTake'); return o.carried ?? null; } };
    const r = rig({
      map: () => map, net: () => ({ client }) as unknown as NetPage,
      grenade,
      firearm: { held: () => undefined, fire },
    }, { eye: [0, 10, 0], far: [0, 10, -100] });
    Object.assign(r.walk, {
      feet: () => [0, 0, 8.5],
      mountRefused: () => { order.push('walk.mountRefused'); return o.refused === true; },
      mountTake: () => { order.push('walk.mountTake'); },
    });
    let tell = null as ((ev: unknown) => void) | null;
    r.acts.follow({ on: (l: (ev: unknown) => void) => { tell = l; return () => {}; } } as never);
    return { ...r, sent, order, client, grenade, fire, tell: (ev: unknown) => tell!(ev), step: (n: number) => { seq += n; }, seq: () => seq };
  };

  it('the ask carries the word; the reservation heard, its refusal asked, then the throw, the kit and the body taken in that order, and the take named on M = lastSeq() + 1', () => {
    const s = seated();
    expect(s.acts.turrets.action()).toBe(true);
    expect(s.sent).toEqual([{ type: 'mount', seq: 100, turret: 0, word: true }]);
    s.step(4);
    s.tell({ type: 'turret', id: 0, occupant: 1, ammo: 750, reserved: true });
    expect(s.order).toEqual(['walk.mountRefused', 'grenade.mountTake', 'fire.mountTake', 'walk.mountTake']);
    expect(s.sent.at(-1)).toEqual({ type: 'mountTake', seq: 105, turret: 0 });
    expect(s.acts.mounted()).toBe(true);
    expect(s.acts.pageHands.mountTaken(), 'no re-derive on the word (LATER 237 kept for an older room)').toBeNull();
  });

  // LATER 524: the walk keeps the take's M, so a flinch event the room pushed before it, heard after, ends at it.
  it('RED: LATER 524 -- the walk is handed the take\'s M (lastSeq() + 1) with the body', () => {
    const s = seated(), got: (number | undefined)[] = [];
    Object.assign(s.walk, { mountTake: (m?: number) => { got.push(m); } });
    s.acts.turrets.action(); s.step(4);
    s.tell({ type: 'turret', id: 0, occupant: 1, ammo: 750, reserved: true });
    expect(got).toEqual([105]);                                                          // today: [undefined]
  });

  // LATER 525 (a): the room's take on a later command than M (a late word, the bound) re-keys the walk's M (`mountRekey`).
  it("RED: LATER 525 (a) -- the room's take broadcast after M (after 107, M 105): the walk re-keyed to 108", () => {
    const s = seated(), got: number[] = [];
    Object.assign(s.walk, { mountRekey: (m: number) => { got.push(m); return []; } });
    s.acts.turrets.action(); s.step(4);
    s.tell({ type: 'turret', id: 0, occupant: 1, ammo: 750, reserved: true });
    s.step(4);
    s.tell({ type: 'turret', id: 0, occupant: 1, ammo: 750, steer: { ticks: 0, after: 107 } });
    expect(got).toEqual([108]);                                                          // today: []
    expect(s.acts.mounted()).toBe(true);
  });

  // LATER 525: the room's refusal of the take (the turret freed before its take broadcast came) reaches the walk, which
  // hands back the flinch the take ended and clears M (`WalkMode.mountUntake`); a granted take's release does not.
  it("RED: LATER 525 -- the room refuses the take: the walk's take undone (mountUntake), the walk unlocked; a granted take's release undoes nothing", () => {
    const run = (granted: boolean) => {
      const s = seated();
      Object.assign(s.walk, { mountUntake: () => { s.order.push('walk.mountUntake'); } });
      s.acts.turrets.action(); s.step(4);
      s.tell({ type: 'turret', id: 0, occupant: 1, ammo: 750, reserved: true });
      if (granted) s.tell({ type: 'turret', id: 0, occupant: 1, ammo: 750, steer: { ticks: 0, after: 104 } });
      s.step(2);
      s.tell({ type: 'turret', id: 0, occupant: null, ammo: 750 });
      return { order: s.order, mounted: s.acts.mounted() };
    };
    expect(run(false)).toEqual({ order: ['walk.mountRefused', 'grenade.mountTake', 'fire.mountTake', 'walk.mountTake', 'walk.mountUntake'], mounted: false });   // today: no mountUntake
    expect(run(true)).toEqual({ order: ['walk.mountRefused', 'grenade.mountTake', 'fire.mountTake', 'walk.mountTake'], mounted: false });
  });

  // LATER 526: the refusal hands back the rest of the take too -- the walk's body re-run as the room ran it, the wait's
  // predictions not compared (`NetClient.replayed`), then the held throw (`GrenadeThrower.mountUntake`, the button as the
  // walk's commands carry it): the reverse of the take's order. The kit's timer too (review F5(D): the original keeps the reload).
  it("RED: LATER 526 -- the refusal hands the walk the client's replayed, then the kit's timer, then the throw back, the button as held", () => {
    const run = (granted: boolean) => {
      const s = seated(), got: number[] = [], held: boolean[] = [];
      Object.assign(s.walk, {
        mountUntake: (replayed?: (after: number) => void) => { s.order.push('walk.mountUntake'); replayed?.(104); },
        triggerHeld: () => true,
      });
      Object.assign(s.grenade, { mountUntake: (h: boolean) => { s.order.push('grenade.mountUntake'); held.push(h); } });
      Object.assign(s.fire, { mountUntake: () => { s.order.push('fire.mountUntake'); } });
      Object.assign(s.client, { replayed: (after: number) => { got.push(after); } });
      s.acts.turrets.action(); s.step(4);
      s.tell({ type: 'turret', id: 0, occupant: 1, ammo: 750, reserved: true });
      if (granted) s.tell({ type: 'turret', id: 0, occupant: 1, ammo: 750, steer: { ticks: 0, after: 104 } });
      s.step(2);
      s.tell({ type: 'turret', id: 0, occupant: null, ammo: 750 });
      return { order: s.order.slice(4), got, held };
    };
    expect(run(false)).toEqual({ order: ['walk.mountUntake', 'fire.mountUntake', 'grenade.mountUntake'], got: [104], held: [true] });   // today: no replayed, no throw
    expect(run(true)).toEqual({ order: [], got: [], held: [] });
  });

  // LATER 530: the kit is told whether the body died in the wait (`WalkMode.isDead`), for a death ends a reload's clip under
  // way and never a delay (PAR-19), so the clip the take kept does not come back to a dead body (`Fire.mountUntake(dead)`).
  it("RED: LATER 530 -- the refusal tells the kit whether the body is dead", () => {
    const run = (dead: boolean) => {
      const s = seated(), told: unknown[] = [];
      Object.assign(s.walk, { mountUntake: () => undefined, isDead: () => dead });
      Object.assign(s.fire, { mountUntake: (d?: boolean) => { told.push(d); } });
      s.acts.turrets.action(); s.step(4);
      s.tell({ type: 'turret', id: 0, occupant: 1, ammo: 750, reserved: true });
      s.step(2);
      s.tell({ type: 'turret', id: 0, occupant: null, ammo: 750 });
      return told;
    };
    expect(run(true)).toEqual([true]);                                                   // today: [undefined]
    expect(run(false)).toEqual([false]);
  });

  /**
   * LATER 532 (LATER 529's F4 and the dispatcher's word, 2026-10-27): a grenade wind-up held at the take, through the wait,
   * the room refusing the take. Through the page's real path as far as this rig reaches: a real `GrenadeThrower` as the
   * part's grenade, the trigger routed as `./matchThrow`'s `trigger` routes it (the part's `trigger` first -- mounted, the
   * turret's -- else the thrower's `pull`/`release`), the walk's Trigger bit false as `./main`'s `fire.triggerHeld() ||
   * acts.triggerHeld()` leaves it for a wind-up (LATER 529). `FUN_005463c0` refuses before its take's steps
   * (D:L412131-412166), so the original's chase (`FUN_00594cf0` D:L453508-453516) ran on through the wait.
   */
  const windUp = (o: { air?: (seq: number) => boolean } = {}) => {
    const events: string[] = [], starts: number[] = [];
    const snapshot = { feet: [100, 50, 200], yaw: 90, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: false, stance: 'stand', landing: null, jumps: 0 } as unknown as PlaySnapshot;
    const g = new GrenadeThrower({ grid: (): Grid | null => null, snapshot: () => snapshot, view: () => 'third' });
    g.on('throw', (t) => events.push(`throw ${t.item}`));
    g.on('throwStart', (t) => starts.push(t.power));
    const s = seated({ grenade: g });
    // The walk's lock as the page lays it (`./turretPage` `setHeld` -> `setLocked`, through `./matchActions`'s `setLocked`):
    // `WalkMode.hold` refuses while locked (walk.ts `hold`), so a throw started under the lock holds no body (LATER 532 review F1).
    let locked = false;
    const holds: boolean[] = [];
    Object.assign(s.walk, {
      triggerHeld: () => false, ...(o.air ? { airAfter: o.air } : {}),
      setLocked: (on: boolean) => { locked = on; },
    });
    g.on('throwStart', () => holds.push(!locked));                  // `./matchThrow`: `walk.hold(hold)` -> taken unless locked
    const press = (down: boolean): void => { if (s.acts.trigger(down)) return; if (down) g.pull(); else g.release(); };
    g.select('M67');
    press(true);
    for (let i = 0; i < 30; i++) g.update(1 / 60);
    const takePower = g.stats().power;
    s.acts.turrets.action(); s.step(4);
    s.tell({ type: 'turret', id: 0, occupant: 1, ammo: 750, reserved: true });   // M = 105
    expect([s.acts.mounted(), g.phase()], 'taken: the wind-up cancelled (`mountTake`)').toEqual([true, 'ready']);
    /** One command sent in the wait (the page's frame with it: the thrower's update, nothing to chase). */
    const command = (): void => { s.step(1); g.update(1 / 60); };
    const refuse = (): void => { s.tell({ type: 'turret', id: 0, occupant: null, ammo: 750 }); };
    return { ...s, g, events, starts, holds, isLocked: () => locked, press, command, refuse, takePower, snapshot };
  };
  /** The page's chase (`stepThrowPower`, `FUN_00594cf0` D:L453508-453516) over `levels`, one command (`TICK`) each, from `p`. */
  const chased = (p: number, levels: boolean[]): number => {
    for (const held of levels) { const st = stepThrowPower(p, held ? 1 : 0, TICK); if (st.release) break; p = st.power; }
    return p;
  };

  it('RED: LATER 532 (b) -- a wind-up held through the wait is not thrown at the refusal: it keeps winding, and its let-go throws once', () => {
    const s = windUp();
    for (let i = 0; i < 6; i++) s.command();                       // 105..110, the trigger held throughout
    s.refuse();
    expect(s.acts.mounted()).toBe(false);
    for (let i = 0; i < 3; i++) s.g.update(1 / 60);
    expect([s.g.phase(), s.starts], 'held from before the take: still winding').toEqual(['holding', []]);   // today: ['throwing', [take-time power]]
    const p = s.g.stats().power;
    s.g.update(1 / 60);
    expect(s.g.stats().power, 'it keeps winding').toBeGreaterThan(p);
    s.press(false);                                                // off the mount: the thrower's let-go
    for (let i = 0; i < 120; i++) s.g.update(1 / 60);
    expect(s.events).toEqual(['throw M67']);
  });

  it('RED: LATER 532 (c) -- a let-go during the wait throws at the refusal with the power the chase reached at the let-go, not the take-time power', () => {
    const s = windUp();
    for (let i = 0; i < 6; i++) s.command();                       // 105..110 held
    s.press(false);                                                // mounted: the turret's trigger; rides 111
    for (let i = 0; i < 4; i++) s.command();                       // 111..114 let go
    s.refuse();
    const want = chased(s.takePower, [true, true, true, true, true, true]);
    expect(want).toBeGreaterThan(s.takePower + 0.05);
    expect(s.isLocked(), 'the refusal unlocked the walk').toBe(false);
    const atRefusal = s.starts.length;
    s.g.update(1 / 60);
    expect(s.starts.length).toBe(1);
    expect(s.starts[0], "the let-go's power, not the take's").toBeCloseTo(want, 9);   // today: the take-time power
    expect(atRefusal, 'no throw at the refusal (the walk is still locked there, F1)').toBe(0);   // review F1: was 1 (the refusal itself)
    for (let i = 0; i < 120; i++) s.g.update(1 / 60);
    expect([s.events, s.starts.length]).toEqual([['throw M67'], 1]);
  });

  // LATER 532 review F1: `TurretPage` calls `untook` (the throw handed back) before `setHeld(null)` unlocks the walk, and
  // `WalkMode.hold` refuses while locked -- a throw started at the refusal held no body (no hold bits on the next command,
  // the clip unheld). The release found in the wait's stepping waits for the first update after the refusal, where the
  // walk is unlocked (`stepThrowPower` returns the power unchanged on a release, so it comes out at the same power).
  it("RED: LATER 532 review F1 -- a let-go in the wait: the throw's body hold is taken (the walk unlocked), at the first update after the refusal", () => {
    const s = windUp();
    for (let i = 0; i < 6; i++) s.command();
    s.press(false);
    for (let i = 0; i < 4; i++) s.command();
    expect(s.isLocked(), 'locked through the wait').toBe(true);
    s.refuse();
    expect([s.starts.length, s.holds], 'nothing thrown under the lock').toEqual([0, []]);   // today: [1, [false]]
    s.g.update(1 / 60);
    expect([s.starts.length, s.holds], 'the hold taken, the walk unlocked').toEqual([1, [true]]);
  });

  // LATER 530 (LATER 532's Open line, the dispatcher's word 2026-10-27; a pin of today's behaviour): the release the wait's
  // stepping found is left to the next update's chase (LATER 532's F1), and that chase runs only while the body was on the
  // floor at the update before (`GrenadeThrower.update`'s `airborneBefore`: `FUN_0059d830` answers only on the floor,
  // D:L453478-453480, D:L457369-457371). Off the floor at the refusal, the throw waits for the landing -- then starts at the
  // power the wait's chase reached.
  it("LATER 530 (a pin) -- a let-go in the wait, the body off the floor at the refusal: no throw until a frame after the landing, then at the wait's power", () => {
    const s = windUp();
    for (let i = 0; i < 6; i++) s.command();                       // 105..110 held
    s.press(false);                                                // rides 111
    (s.snapshot as { airborne: boolean }).airborne = true;         // off the floor through the last frames of the wait
    for (let i = 0; i < 4; i++) s.command();
    s.refuse();
    const want = chased(s.takePower, [true, true, true, true, true, true]);
    for (let i = 0; i < 5; i++) s.g.update(1 / 60);
    expect(s.starts, 'in the air: the chase stands, no throw').toEqual([]);
    (s.snapshot as { airborne: boolean }).airborne = false;
    s.g.update(1 / 60);
    expect(s.starts, 'the landing frame: the gate reads the frame before (in the air)').toEqual([]);
    s.g.update(1 / 60);
    expect(s.starts.length).toBe(1);
    expect(s.starts[0], "the power the wait's chase reached").toBeCloseTo(want, 9);
    expect(s.holds, 'the walk unlocked: the hold taken').toEqual([true]);
  });

  it('RED: LATER 532 (c, the floor) -- off the floor the chase stands (D:L453478-453480, D:L457369-457371): a command after one the body left the floor on is not stepped', () => {
    // The walk's re-run off the floor after 106..108 (`WalkMode.airAfter`): the chase skips 107..109.
    const s = windUp({ air: (seq) => seq >= 106 && seq <= 108 });
    for (let i = 0; i < 6; i++) s.command();                       // 105..110 held
    s.press(false);                                                // rides 111
    s.command();
    s.refuse();
    const want = chased(s.takePower, [true, true, true]);          // 105, 106, 110
    s.g.update(1 / 60);
    expect(s.starts.length).toBe(1);
    expect(s.starts[0]).toBeCloseTo(want, 9);
  });

  it('refused on its own body: the word sent, nothing taken', () => {
    const s = seated({ refused: true });
    s.acts.turrets.action(); s.step(2);
    s.tell({ type: 'turret', id: 0, occupant: 1, ammo: 750, reserved: true });
    expect(s.order).toEqual(['walk.mountRefused']);
    expect(s.sent.at(-1)).toEqual({ type: 'mountTake', seq: 103, turret: 0 });
    expect(s.acts.mounted()).toBe(false);
  });

  it("a reload's delay carried (1 s, pressed on 100 + 1 = 101: the window 161): the turret's trigger held through the room's own end, 101 + turretReloadCountdown(1) = 162, the round after it the turret's", () => {
    expect(turretReloadCountdown(1).commands).toBe(61);
    const s = seated({ carried: { kind: 'reload', seconds: 0.9, until: 161, delay: 1 } });
    s.acts.turrets.action(); s.step(4);
    s.tell({ type: 'turret', id: 0, occupant: 1, ammo: 750, reserved: true });
    expect(s.acts.turrets.reloading()).toBe(true);
    s.step(162 - 104);
    expect(s.acts.turrets.reloading(), 'through 162').toBe(true);
    s.step(1);
    expect(s.acts.turrets.reloading(), 'from 163').toBe(false);
  });

  it("fold 3: nothing carried (Fire.mountTake null: a swap, a ring replaced) -- the turret's trigger is not held at the take", () => {
    const s = seated({ carried: null });
    s.acts.turrets.action(); s.step(4);
    s.tell({ type: 'turret', id: 0, occupant: 1, ammo: 750, reserved: true });
    expect([s.acts.mounted(), s.acts.turrets.reloading()]).toEqual([true, false]);
  });

  it("a bolt's after-shot carried (0.5 s left at M): the trigger held 30 commands from M", () => {
    const s = seated({ carried: { kind: 'afterShot', seconds: 0.5, until: null, delay: 0.01 } });
    s.acts.turrets.action(); s.step(4);
    s.tell({ type: 'turret', id: 0, occupant: 1, ammo: 750, reserved: true });   // M = 105
    s.step(135 - 104);
    expect(s.acts.turrets.reloading()).toBe(true);
    s.step(1);
    expect(s.acts.turrets.reloading()).toBe(false);
  });

  it("a turret round in the take's own frame names M, never the command before it", () => {
    const s = seated();
    s.acts.turrets.action(); s.step(4);
    s.tell({ type: 'turret', id: 0, occupant: 1, ammo: 750, reserved: true });
    s.acts.trigger(true);
    s.acts.turretFrame(1 / 60, false);
    const fire = s.sent.filter((e) => e.type === 'fire');
    expect(fire.map((e) => e.seq)).toEqual([105]);
  });
});

/**
 * CPS collision step 3 (2026-11-03, plan `2026-11-02-client-performance-sprint.md`, CPS.R9 (e); a CPU-side browser
 * adaptation): the switch ray was cast 2-3 times a frame -- `prompt` sampled it (`ActionPage.sample`), then its pick asked
 * the switch source, whose `ActionPage.armed()` cast the same `lookAim` ray again. Within the one `prompt` call the pick
 * reuses the sample's answer while the ray (eye and far, exactly), the feet and the world (its object and revision) are
 * the ones the sample read; anything else casts as before. The same prompt, one cast.
 */
describe('CPS collision step 3: one switch cast per prompt', () => {
  const LEVER = 'worldmodel/lever';
  /** A wall across z 10 facing +z, owned by the lever's node, and one SWITCH record on it (in reach from the feet). */
  function leverWorld() {
    const wall: WorldPoly = {
      modelName: 'worldmodel', path: `${LEVER}/q`, region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0,
      points: Float32Array.from([-50, 0, 10, 50, 0, 10, 50, 50, 10, -50, 50, 10]),
    };
    const params: GridParams = { atomCount: 1024, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
    const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: LEVER, first: 0, count: 1 }];
    const grid = scene.buildGrid(params, [], [], [wall], owners);
    const record = {
      node: 'lever', path: LEVER, at: [0, 0, 10], type: 'SWITCH', typeCode: 2, valve: '', anims: [], team: null,
      range: 1000, elevation: -1, points: 0, bitmap: '',
    };
    return { grid, meta: { actions: [record] }, valve: () => 0, revision: 0 };
  }
  /** The rig on the lever's world, the feet at z 30, the look ray from each eye in turn (the last one kept) 30 along -z. */
  function lit(eyes: [number, number, number][], world: object = leverWorld()) {
    let calls = 0;
    const r = rig({ world: () => world as never });
    (r.walk as { lookAim: () => unknown }).lookAim = () => {
      const eye = eyes[Math.min(calls++, eyes.length - 1)]!;
      return { eye: [eye[0], eye[1], eye[2]], far: [eye[0], eye[1], eye[2] - 30] };
    };
    (r.walk as { feet: () => unknown }).feet = () => [0, 0, 30];
    return r;
  }
  afterEach(() => { vi.restoreAllMocks(); });

  it('prompt casts the switch ray once (its pick reuses the sample), and shows the switch as before', () => {
    const { acts } = lit([[0, 20, 30]]);
    const cast = vi.spyOn(scene, 'segmentHits');
    expect(acts.prompt(true)).toEqual([{ prompt: 'action' }]);
    expect(cast).toHaveBeenCalledTimes(1);
    // Outside a prompt the pick casts (the lanes' and the release's picks are not shared), and every prompt casts anew.
    expect(acts.pick()).toBe('switch');
    expect(cast).toHaveBeenCalledTimes(2);
    expect(acts.prompt(true)).toEqual([{ prompt: 'action' }]);
    expect(cast).toHaveBeenCalledTimes(3);
  });

  it('off the switch: one cast, nothing shown', () => {
    const { acts } = lit([[300, 20, 30]]);
    const cast = vi.spyOn(scene, 'segmentHits');
    expect(acts.prompt(true)).toBeNull();
    expect(cast).toHaveBeenCalledTimes(1);
  });

  it('an eye that moved between the sample and the pick casts again', () => {
    const { acts } = lit([[0, 20, 30], [0.5, 20, 30]]);
    const cast = vi.spyOn(scene, 'segmentHits');
    expect(acts.prompt(true)).toEqual([{ prompt: 'action' }]);
    expect(cast).toHaveBeenCalledTimes(2);
  });

  it('a world whose revision moved between the sample and the pick casts again', () => {
    const world = leverWorld();
    let reads = 0;
    Object.defineProperty(world, 'revision', { get: () => (reads++ === 0 ? 0 : 1) });   // one change in between
    const { acts } = lit([[0, 20, 30]], world);
    const cast = vi.spyOn(scene, 'segmentHits');
    expect(acts.prompt(true)).toEqual([{ prompt: 'action' }]);
    expect(cast).toHaveBeenCalledTimes(2);
  });
});
