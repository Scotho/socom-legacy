import type { Scene } from 'three';
import { itemClass, spawnsFor, type Loadout, type Side, type Spawns } from '@s2u/scene';
import { applyFog, ELF_DEFAULT_FOGCOL, type FogSettings } from './fog';
import type { Input } from './gamepad';
import { brightenOf, type Lighting } from './lighting';
import type { LoadedMap } from './loadMap';
import { BAKED_LOADOUT, kitRecords, slotModel, typeLoadout, wireLoadout } from './loadout';
import type { Team } from './net/protocol';
import type { HeldRef, RemotePlayers } from './remotePlayers';
import { openingStand } from './stand';
import { centre, type WorldView } from './world';

/**
 * ONE-WIRE (web research 222): the match's wiring that `/testroom` (`./main`) and the front end's page (`./matchMount`,
 * ONL-18c/d, research 166 §8) share -- written once here, where each page used to carry its own copy (the front end's
 * commented with its `./main` origin, line by line). Neither page's markup is read here, and nothing here imports
 * `./main` (OT.R12: the front end's bundle stays free of it): every part takes what it works on as arguments.
 *
 * The parts: the capabilities switch (what each page mounts), the side, the kit on the map shown (`heldRefOf`,
 * `sideLoadoutOf`, `setRemoteMap`), the map's fog and stand (`mapFog`, `liftFog`, `standOf`), the camera's lanes
 * (`feedCamera`); `./matchNet` the `NetPage` deps, `./matchLanes` the pad's game lanes, `./matchFirearm` the firearm,
 * `./matchSound` the sound, `./matchThrow` the throwables, the launcher and the R2 inventory.
 */

/**
 * What a page's match mounts, one switch a part (the sprint 30 design input, 2026-10-06): `/testroom` every part
 * (`TESTROOM_CAPABILITIES`), the front end today's set (`FRONT_END_CAPABILITIES`, pinned by `test/matchCore.test.ts`, so
 * a part is mounted there -- or dropped -- only on purpose). A part's hooks are asked for, and refused when given, by
 * the switch (`./matchNet` `matchNetDeps`): the front end's empty hooks are the switch's, not per-hook stand-ins.
 */
export interface MatchCapabilities {
  /** The firearm (`./matchFirearm`): the fire, the bloom, the view states, the kit's two slots, the reticle, the rounds' effects. */
  readonly firearm: boolean;
  /**
   * The throwables and charges flown on the page (`./grenade`): the room's projectiles (`remoteGrenade`), its own
   * (`ownProjectiles`), PF-36's pid for its own and a charge set off in the room (`tagOwnProjectile`, `detonateProjectile`).
   */
  readonly throwables: boolean;
  /** The LAW and the RPG-7 raised and flown on the page (`./rocket`); a round mode's round is the firearm's either way. */
  readonly launcher: boolean;
  /**
   * The world's dropped weapons and bundles (PF-34, research 234 s5, s6): their `NetPage` hooks (`drops`, `kitChanged`:
   * `./matchNet` `PART_DEPS`), the drops on the page (`./drops` `WorldDrops`) and the action part's pickup (`./matchActions`).
   */
  readonly worldDrops: boolean;
  /** The pre-round ARMORY on a seat (`./armory`, W5.R1-R4). */
  readonly armory: boolean;
  /** WEAPON EXCHANGE dead (`./weaponExchange`, M8/M9). */
  readonly exchange: boolean;
  /** The R2 inventory alive (`./inventoryMenu`). */
  readonly inventory: boolean;
  /** The doors (`./doorPage`). */
  readonly doors: boolean;
  /**
   * Sprint 27's action button and its pages: the switches, DEMOLITION's bomb, the turrets (`./matchActions`); on with the
   * doors and the traversal it picks among (ruling ACT.R1: the part cannot be mounted without them).
   */
  readonly actions: boolean;
  /** The traversal: ladders, climbs, the peek, the water (`./traversalPage`). */
  readonly traversal: boolean;
  /** The sound: the banks, the footfalls, the rounds' and the voices' (`./audio`), the round's cues. */
  readonly sound: boolean;
  /** The touch layer (`./touch`). */
  readonly touch: boolean;
  /** The tactical map (`./tacMap`). */
  readonly tacMap: boolean;
  /** The character shadow (`./charShadow`). */
  readonly shadow: boolean;
  /** The Chat menu's TAUNTS, sent and heard (`./matchTaunts`, web research 301). */
  readonly taunts: boolean;
  /**
   * HX-4a (research 239 s7; ruling HX.R8): the hostages' orders -- FOLLOW! / HOLD POSITION on the hostage under the
   * crosshair (`./hostagePage`), its `NetPage` hook (`hostageState`: `./matchNet` `PART_DEPS`), the action's `escortee`.
   */
  readonly hostages: boolean;
  /**
   * Sprint 20, SVC-20b-page (research 226 §3): the voice client -- the microphone at the first talk press, the frames up
   * while the room's floor entry names the page, the room's frames played at HEADSET VOLUME (`./voice/voiceClient`).
   */
  readonly voice: boolean;
  /** The Chat menu's TACTICAL ORDERS and MESSAGES, sent and heard (`./matchChat`, web research 302). */
  readonly chat: boolean;
  /**
   * PT-18 (W35.R5; spec 4.8; research 244 §1): the replay mode -- `?devmode&replay=<url>` on a development build plays a
   * recorded segment through `NetPage`'s watcher path, its client the `ReplayClient` (`NetPageDeps.client`: `./matchNet`
   * `PART_DEPS`). A browser adaptation with no original (REPLAY_ADAPTATION); the front end has none.
   */
  readonly replay: boolean;
}

/** `/testroom`'s match: every part. */
export const TESTROOM_CAPABILITIES = Object.freeze({
  voice: true,   // SVC-20b-page: the voice client (`./voice/voiceClient`)
  firearm: true, throwables: true, launcher: true, worldDrops: true, armory: true, exchange: true, inventory: true,
  doors: true, actions: true, traversal: true, sound: true, touch: true, tacMap: true, shadow: true, hostages: true, taunts: true, chat: true,
  replay: true,
} as const) satisfies MatchCapabilities;   // literal: the typecheck reads the parts on and off (`./matchNet` `PageDeps`)

/**
 * The front end's match (`MATCH_MOUNT_PARTS_PLACEHOLDER` lists the rest): the firearm, since MATCH-SOUND (research 222
 * §7) the sound, since MATCH-THROW (research 222 §8) the throwables, the launcher and the R2 inventory that takes them up
 * (`./matchThrow`), since ACT-1 (research 250) the doors, sprint 27's action part and the traversal (`./matchActions`), and
 * since ACT-5 (ruling ACT.R5, research 250 §6; HX.R8's row) the hostages' orders and marks -- unreachable from the lobby
 * until Desert Glory is listed (ruling ACT.R6), since TAUNTS (research 301) the Chat menu's taunts (`./matchTaunts`), and
 * since Chris's settings (research 302) its TACTICAL ORDERS and MESSAGES (`./matchChat`), and since PAR-1 (research 253)
 * WEAPON EXCHANGE and the dead's prompt (`./matchExchange`), since PAR-6 (research 255) the character shadow, and since
 * PAR-4 (research 234 s5-s6) the world drops and the action button's pickup on them (`./drops`), and since PAR-2 (OT.R43)
 * the seat ARMORY (`./matchArmory`), and since PAR-5 (research 222 §11) the touch layer (`./matchTouch`) -- of the switchable parts.
 */
export const FRONT_END_CAPABILITIES = Object.freeze({
  voice: true,   // SVC-20b-page (constraint 1, PF): the voice client, as on /testroom
  firearm: true, throwables: true, launcher: true, worldDrops: true, armory: true, exchange: true, inventory: true,   // PAR-2: the seat ARMORY
  doors: true, actions: true, traversal: true, sound: true, touch: true, tacMap: false, shadow: true, hostages: true, taunts: true,   // PAR-5: the touch layer
  chat: true, replay: false,
} as const) satisfies MatchCapabilities;

/**
 * The page's side in the match: the net client's team, else the lobby client's (the front end: `NetPage`'s constructor
 * replays the lobby's events -- a Terrorist seat's spawn among them -- before the page holds it; the ONL-18c review's
 * F1), else a SEAL (offline, before the welcome).
 */
export function matchSide(net: { client: { team: Team | null } } | null, client?: { team: Team | null } | null): Side {
  return net?.client.team ?? client?.team ?? 'seal';
}

/** A held model built off the map's weapons (`WorldView.held`, one object a model) with its points; none for no model. */
export function heldRefOf(view: WorldView | null, map: LoadedMap | null, model: string | null): HeldRef | null {
  const object = model ? view?.held(model) ?? null : null;
  return object && model ? { object, points: map?.weapons?.[model]?.points ?? [] } : null;
}

/** A type's kit on the map on screen (the others' kits until the room names each player's; SEAL 1 / TERRORIST 1 by default). */
export function sideLoadoutOf(map: LoadedMap | null, side: Side, type = 0): Loadout {
  return typeLoadout(map?.arsenal?.map ?? null, side, type) ?? BAKED_LOADOUT;
}

/**
 * The others on the map (MULTIPLAYER; a new map is a new match): each one's kit is its own when the room named it
 * (protocol 7), else its type's (protocol 9); its copies' scope nodes follow that kit (`cloneHeld`), not the page's.
 */
export function setRemoteMap(remote: Pick<RemotePlayers, 'setMap'>, map: LoadedMap, lighting: Lighting, view: () => WorldView | null): void {
  remote.setMap(map, lighting, (team, kit, type) => {
    const l = wireLoadout(kit) ?? sideLoadoutOf(map, team, type), table = map.arsenal?.table ?? null;
    const recs = kitRecords(table, l);
    const held = (model: string | null): HeldRef | null => heldRefOf(view(), map, model);
    const launcher = l.find((id) => itemClass(id) === 'rocketLauncher');   // NU-6 F2: the kit's first (FUN_005c6a40 D:L479823)
    return { rifle: held(slotModel(table, l, 0)), pistol: held(slotModel(table, l, 1)), loadout: l, ids: [recs[0].id, recs[1].id] as const, launcher: held(launcher === undefined ? null : table?.arsenal.items.get(launcher)?.model ?? null) };
  }, (team, type) => sideLoadoutOf(map, team, type));
}

/**
 * The map's own fog onto `fog`, before the world is built: `cameras/camera` in its `MP*.ZED` carries the colour, the
 * range and the enable bit the level was authored with (two of the twenty-two ship with it off, so the bit is honoured),
 * and on six maps the altitude band. False, `fog` untouched, for a map with no camera key.
 */
export function mapFog(fog: FogSettings, map: LoadedMap): boolean {
  const c = map.camera;
  if (!c) return false;
  fog.enabled = c.fogEnabled;
  fog.near = c.fogNear;
  fog.far = c.fogFar;
  fog.color = [...c.fogColor];
  fog.altitude = c.fogAltitude ? { top: c.fogTop, bottom: c.fogBottom } : null;
  return true;
}

/**
 * The fog on the scene and behind it. The brighten pass multiplies the whole frame, the fog colour and the cleared
 * background with it, so both are lifted by the same factor; with the goggles on, the camera's colour is the lens's
 * times the fog's (`FUN_005c1800`, `cam+0xd0`): `lens`, null without them.
 */
export function liftFog(scene: Scene, fog: FogSettings, lighting: Lighting, lens: readonly number[] | null, setClearColor: ((rgb: [number, number, number]) => void) | null | undefined): void {
  const gain = brightenOf(lighting);
  const l = lens ?? [1, 1, 1];
  const lift = (rgb: [number, number, number]): [number, number, number] =>
    [Math.min(255, rgb[0] * l[0]! * gain), Math.min(255, rgb[1] * l[1]! * gain), Math.min(255, rgb[2] * l[2]! * gain)];
  applyFog(scene, { ...fog, color: lift(fog.color) });
  setClearColor?.(lift(fog.enabled ? fog.color : ELF_DEFAULT_FOGCOL));
}

/** Where the camera opens on a map (`from`, looking at `to`) and the feet the walk stands on there (null: under the camera). */
export interface MapStand {
  spawn: Spawns | undefined;
  from: [number, number, number];
  to: [number, number, number];
  feet: [number, number, number] | null;
}

/**
 * W1.4b: the stand the worker worked out (`LoadedMap.stand`, `./stand`) at spawn A of the measured table
 * (`@s2u/scene`'s `spawnsFor`), looking at B, the walk at A's (x, z) on the stand's floor (A's recorded y where the probe
 * found none); a map with no measured spawns is looked at from off its own extent, at the middle of it.
 */
export function standOf(map: LoadedMap, view: Pick<WorldView, 'box'>): MapStand {
  const spawn = spawnsFor(map.name);
  const stand = spawn ? map.stand ?? openingStand(spawn.a, undefined) : null;
  if (spawn && stand) {
    return { spawn, from: [...stand.position] as [number, number, number], to: [...spawn.b] as [number, number, number], feet: [spawn.a[0], stand.floor ?? spawn.a[1], spawn.a[2]] };
  }
  const [cx, cy, cz] = centre(view.box as WorldView['box']);
  const reach = Math.max(view.box.max.x - view.box.min.x, view.box.max.z - view.box.min.z) || 1000;
  return { spawn, from: [cx, cy + reach * 0.4, cz + reach * 0.6], to: [cx, cy, cz], feet: null };
}

/** The camera's lanes a frame feeds (`./camera` `FlyCamera`). */
export interface CameraLanes {
  setStick(x: number, y: number): void;
  setLift(v: number): void;
  setStickBoost(on: boolean): void;
  setLook(x: number, y: number): void;
}

/**
 * The merged input into the camera's lanes, which the fly camera flies by and the walk's mover steps by
 * (`groundWish`): one mapping drives both (W2.R5). PF-31 (the review's gate): Triangle is the spectator's while the pad
 * is (`spectator`, `NetPage.spectatorCamera`, asked only while it is held), never the fly camera's "down".
 */
export function feedCamera(fly: CameraLanes, input: Input, spectator: () => boolean): void {
  fly.setStick(input.moveX, input.moveY);
  fly.setLift((input.jump ? 1 : 0) - (input.crouch || (input.stance && !spectator()) ? 1 : 0));
  fly.setStickBoost(input.boost);
  fly.setLook(input.lookX, input.lookY);
}
