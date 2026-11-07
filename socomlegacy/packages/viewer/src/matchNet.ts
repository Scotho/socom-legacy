import type { Grid, Loadout, Side } from '@s2u/scene';
import type { FlyCamera } from './camera';
import type { LoadedMap } from './loadMap';
import { kitRecords, wireLoadout, type PlayerLoadout } from './loadout';
import type { MatchCapabilities } from './matchCore';
import { sideLoadoutOf } from './matchCore';
import type { MatchFirearm } from './matchFirearm';
import { STANCE_CODES, type Team } from './net/protocol';
import { rootY } from './mover';
import { GAME_ASPECT, INIT_AIM_PITCH, PlayerCamera } from './playerCamera';
import type { NetPageDeps } from './netPage';
import type { PlayClips } from './play';
import { scenicViews } from './spectatorView';

/**
 * ONE-WIRE (web research 222): the `NetPage` deps of a page's match, built once for both pages -- `/testroom`
 * (`./main` `connectNet`) and the front end's (`./matchMount` `join`). The shared hooks are written here, once; a page's
 * own additions ride on them (`MatchNetHooks`); every other dep is the page's own (`rest`), and one that would shadow a
 * shared hook is refused, so each hook lands in one place. The capabilities switch (`./matchCore`) decides which parts'
 * hooks a page may hand the room: a part that is off has its hooks refused when given, and its required hooks stand
 * empty (the front end's `remoteGrenade`); one that is on must be given them.
 */

/** What the shared deps read: the page's match parts. */
export interface MatchNetParts {
  caps: MatchCapabilities;
  walk: NetPageDeps['walk'];
  remote: NetPageDeps['remote'];
  hud: NetPageDeps['hud'];
  /** SPECTATOR-VIEW W6: `setMagnification` and `lookOptions` (INVERT PITCH) optional for the stand-ins with no projection. */
  fly: Pick<FlyCamera, 'setPose'> & Partial<Pick<FlyCamera, 'setMagnification' | 'lookOptions' | 'aspect'>>;
  loadouts: Pick<PlayerLoadout, 'picks' | 'type' | 'seated' | 'setType' | 'unseated' | 'roomAnswer'> & Partial<Pick<PlayerLoadout, 'setEquipmentLimit' | 'held'>>;
  firearm: Pick<MatchFirearm, 'records' | 'roundEffects' | 'roundImpact' | 'died' | 'spawnKit'> & Partial<Pick<MatchFirearm, 'hurt'>> & {
    /** NET-REFILL: `setNetRefill` optional for the stand-ins that build no `Fire`. */
    fire: Pick<MatchFirearm['fire'], 'undoReload' | 'restoreReload' | 'refundRound'> & Partial<Pick<MatchFirearm['fire'], 'setNetRefill' | 'setPressWindow'>>;
  };
  clips(): PlayClips | null;
  /** The map on screen (its arsenal, its scenic views); null before it. */
  map(): LoadedMap | null;
  /** The page's side (`./matchCore` `matchSide`). */
  side(): Side;
  /** The page's own body to the side's (`./teamBody`): the side now when no team is given. */
  followTeam(team?: Team | null): void;
  /**
   * The parts' round-start clear (the front end's: `./matchThrow` `roundStart`, the firearm's marks and footprints), run
   * as `newRound` and `abandoned` where the ARMORY is off, and ahead of the ARMORY's own two (`./matchArmory`: a pending
   * change dropped and the screen closed; a pending change sent) where it is on (PAR-2: the front end's). `/testroom`
   * hands none: its ARMORY's glue (`./armoryGlue`) carries the same clear with its own lines. Absent: none.
   */
  roundClear?(): void;
  /** A screen over the game (the loading screen's hold; `/testroom`'s WEAPON EXCHANGE and ARMORY). */
  menuOpen(): boolean;
}

/** A page's own additions to the shared hooks, each run after the shared line. */
export interface MatchNetHooks {
  /** The room's answer to a loadout request, as a loadout: WEAPON EXCHANGE shows the kit the room will spawn (`PART_HOOKS.exchange`). */
  answered?(kit: Loadout): void;
  /** After a respawn's kit and body (`/testroom`: the pouch refilled, WEAPON EXCHANGE closed over the kit). */
  respawned?(): void;
  /** After the page's own death (`/testroom`: the action button's hold cancelled, XR-06). */
  died?(): void;
}

/**
 * The `NetPage` deps each switchable part owns, listed once: a page whose switch has the part on owes every one of them
 * (in its own deps: the part is its), one whose switch has it off may hand none -- and a required one (`remoteGrenade`)
 * then stands empty here. A part's new hook is one line in its list (sprint 30 wave 4: PF-36's `tagOwnProjectile` and
 * `detonateProjectile` under the throwables, PF-34's `drops` and `kitChanged` under the world drops; research 234 s6,
 * 235 s5) -- optional in `NetPageDeps`, so a page with the part off is handed no stand-in.
 */
export const PART_DEPS = {
  /**
   * The room's projectiles flown on the page; its own told apart on a rejoin (PF-28); PF-36 (research 235 s4): the
   * room's pid for the page's own throw or charge (`placed`), a resting charge set off in the room (`detonate`).
   */
  throwables: ['remoteGrenade', 'ownProjectiles', 'staleThrow', 'tagOwnProjectile', 'detonateProjectile', 'whiteOut'],   // LOW-2 (research 223 s6): a stale throw's item back; P2: the room's white-out
  /** PF-34 (research 234 s5, s6): the room's drops on the page (a welcome's set too), the page's live kit after a pickup (`kit`). */
  worldDrops: ['drops', 'kitChanged'],
  sound: ['reloadSound', 'deathVoice', 'hurtVoice', 'ring', 'roundAudio', 'objective', 'escorteeVoice'],   // HX-4a: the escortee's YES
  taunts: ['taunt'],                                  // web research 301: the room's taunts heard (`./matchTaunts`)
  chat: ['communication'],                            // web research 302: the room's tactical orders and messages heard (`./matchChat`)
  voice: ['voiceFloor', 'voiceFrame'],                // SVC-20b-page: the page's floor entry and the room's voice frames (`./voice/voiceClient`)
  /** The seat's ARMORY, and its glue at the round's start and an abandon (`./armoryGlue`; note 222 §4, 12). */
  armory: ['armory', 'armoryOpen', 'joined', 'newRound', 'abandoned'],
  /** HX-4a (research 239 s7): a hostage's state for the orders' part (`./hostagePage` `state`). */
  hostages: ['hostageState'],
  replay: ['client'],                                 // PT-18 (W35.R5, research 244 §1): the replay's client factory; /testroom's null outside the mode
} as const satisfies Partial<Record<keyof MatchCapabilities, readonly (keyof NetPageDeps)[]>>;

/**
 * PAR-1 (research 253): the page's own additions (`MatchNetHooks`) a switchable part owns, listed as `PART_DEPS` lists
 * the deps -- owed by a page whose switch has the part on, refused from one that has it off, at run time and by the
 * typecheck (`PageHooks`). WEAPON EXCHANGE's `answered` (`./matchExchange` `netHooks`): the room's answer on the menu.
 */
export const PART_HOOKS = {
  exchange: ['answered'],
} as const satisfies Partial<Record<keyof MatchCapabilities, readonly (keyof MatchNetHooks)[]>>;

type PartDeps = typeof PART_DEPS;
/** The deps of the parts a switch has on (`true` as a literal): owed. */
type OnDeps<C extends MatchCapabilities> = { [K in keyof PartDeps]: C[K] extends true ? PartDeps[K][number] : never }[keyof PartDeps];
/** The deps of the parts a switch has off (`false` as a literal): refused. */
type OffDeps<C extends MatchCapabilities> = { [K in keyof PartDeps]: C[K] extends false ? PartDeps[K][number] : never }[keyof PartDeps];
/**
 * A page's own deps on its switch: the parts' it mounts owed, the parts' it does not refused -- checked by the typecheck
 * on a switch of literal booleans (`TESTROOM_CAPABILITIES`, `FRONT_END_CAPABILITIES`), and at run time on any switch.
 */
export type PageDeps<C extends MatchCapabilities> =
  Partial<NetPageDeps> & Required<Pick<NetPageDeps, OnDeps<C>>> & { [K in OffDeps<C>]?: never };
type PartHooks = typeof PART_HOOKS;
type OnHooks<C extends MatchCapabilities> = { [K in keyof PartHooks]: C[K] extends true ? PartHooks[K][number] : never }[keyof PartHooks];
type OffHooks<C extends MatchCapabilities> = { [K in keyof PartHooks]: C[K] extends false ? PartHooks[K][number] : never }[keyof PartHooks];
/** A page's own hooks on its switch: the parts' it mounts owed, the parts' it does not refused (`PageDeps`' rule). */
export type PageHooks<C extends MatchCapabilities> =
  MatchNetHooks & Required<Pick<MatchNetHooks, OnHooks<C>>> & { [K in OffHooks<C>]?: never };
/** The part-owned deps `NetPage` requires: an empty one stands in where the part is off. */
const PART_DEFAULTS: Partial<NetPageDeps> = { remoteGrenade: () => {} };

export function matchNetDeps<C extends MatchCapabilities>(p: MatchNetParts & { caps: C }, h: NoInfer<PageHooks<C>>, rest: NoInfer<PageDeps<C>>): NetPageDeps {
  const { caps, loadouts, firearm } = p;
  const defaults: Partial<NetPageDeps> = {};
  for (const [part, keys] of Object.entries(PART_DEPS) as [keyof MatchCapabilities, readonly (keyof NetPageDeps)[]][]) {
    for (const key of keys) {
      if (!caps[part] && key in rest) throw new Error(`matchNetDeps: ${key} is the ${part}'s, which this page does not mount`);
      if (caps[part] && !(key in rest)) throw new Error(`matchNetDeps: ${key} is owed: the ${part} is mounted`);
      if (!caps[part] && key in PART_DEFAULTS) Object.assign(defaults, { [key]: PART_DEFAULTS[key] });
    }
  }
  for (const [part, keys] of Object.entries(PART_HOOKS) as [keyof MatchCapabilities, readonly (keyof MatchNetHooks)[]][]) {
    for (const key of keys) {
      if (!caps[part] && key in h) throw new Error(`matchNetDeps: ${key} is the ${part}'s, which this page does not mount`);
      if (caps[part] && !(key in h)) throw new Error(`matchNetDeps: ${key} is owed: the ${part} is mounted`);
    }
  }
  // The round's decal and air clear (NetPage's `roundStart` and `abandoned`: CMPExitState L76084; the level left) is the
  // ARMORY's glue on `/testroom`; with the ARMORY off it is the parts' own (the MATCH-THROW review's finding 1), and with
  // it on and the parts' own handed (PAR-2: the front end's), the parts' first, then the ARMORY's two (below).
  if (!caps.armory && p.roundClear) {
    const clear = p.roundClear;
    defaults.newRound = () => { clear(); };
    defaults.abandoned = () => { clear(); };
  }
  // FUN_002998f0 kind 2 -> FUN_00296f10 -> FUN_0029bf70: a followed actor uses the same pass as a player.
  // Kept across frames; neither a target switch nor a different map inherits the previous obstruction (research 382 §2).
  let following: { id: number; grid: Grid | null; map: LoadedMap | null; camera: PlayerCamera } | null = null;
  const resetFollow = (): void => { following = null; };
  const shared: NetPageDeps = {
    walk: p.walk, remote: p.remote, hud: p.hud, clips: () => p.clips(),
    // The live kit's records for the page's own; another side's type's kit on the map for a team's.
    weapons: (team) => (team ? kitRecords(p.map()?.arsenal?.table ?? null, sideLoadoutOf(p.map(), team)) : firearm.records()),
    // Protocol 7: a shot's item by id; the side's picks for a (re)seat; the room's answer to a request (M9).
    // MAP-10b: a turret's round names its emplaced weapon (PKM TURRET 205, LMG TURRET 207: `turretRecords`), never a kit's.
    recordOf: (id) => { const t = p.map()?.arsenal?.table; return t?.records.get(id) ?? t?.turretRecords?.get(id) ?? null; },
    picks: (team) => loadouts.picks(team),
    equipmentLimit: (limit) => loadouts.setEquipmentLimit?.(limit),
    // Protocol 9: the page's type per side, for the hello and each request.
    types: () => ({ seal: loadouts.type('seal'), terrorist: loadouts.type('terrorist') }),
    // A seat taken: the room's type held (S2 round 3), the page's choice asked for again; a demotion ends a staging.
    seated: (team, char) => loadouts.seated(team, char),
    stageType: (side, type) => loadouts.setType(side, type, true),
    unseated: () => loadouts.unseated(),
    loadoutAnswer: (kit, refused, request, char) => {
      // Refused: back to the last list the room accepted (the kit it holds) and the type it holds (protocol 9); taken:
      // that list and type are the ones it holds. Each answer settles its own request (an older one's, a staged type's).
      loadouts.roomAnswer(p.side(), kit, refused, request, char);
      if (!h.answered) return;
      const l = wireLoadout(kit);
      if (l) h.answered(l);
    },
    // KIT-HELD: the room's held type, picks and kit for the side (`PlayerLoadout.held`), so WEAPON EXCHANGE opens on them.
    kitHeld: (team, char, picks, kit) => { loadouts.held?.(team, char, picks, kit); },
    menuOpen: () => p.menuOpen(),
    spectate: (pose) => { resetFollow(); if (pose) p.fly.setPose(pose); },
    spectateFollowReset: resetFollow,
    spectateFollow: (body, dt, ease) => {
      const grid = p.walk.gridOfGround?.() ?? null, map = p.map();
      if (!following || following.id !== body.id || following.grid !== grid || following.map !== map) {
        following = { id: body.id, grid, map, camera: new PlayerCamera(grid) };
      }
      const camera = following.camera;
      camera.ease = ease === true;   // INV-SPECTATE C: the dead player's teammate view only (`SpectatorView.followWatched`)
      camera.nearAspect = p.fly.aspect?.() ?? GAME_ASPECT;
      camera.peek = body.peek ?? 0;
      // The remote body was posed immediately before SpectatorView.frame. The no-mesh fallback is the player's
      // existing measured stance/traversal root, not the old fixed standing offset (FUN_0029a950, research 382 §2).
      const posed = p.remote.cameraRoot?.(body.id) ?? null;
      const traversal = body.travRootY;
      const root = posed ?? (traversal !== undefined && Number.isFinite(traversal) ? traversal : rootY(STANCE_CODES[body.stance ?? 0] ?? 'stand'));
      camera.tick(body.feet, body.yaw, body.pitch ?? INIT_AIM_PITCH, root, Math.max(0, dt), posed !== null);
      const view = camera.view(1), dx = view.target[0] - view.eye[0], dy = view.target[1] - view.eye[1], dz = view.target[2] - view.eye[2];
      p.fly.setPose({ x: view.eye[0], y: view.eye[1], z: view.eye[2],
        yaw: Math.atan2(-dx, -dz) * 180 / Math.PI, pitch: Math.atan2(dy, Math.hypot(dx, dz)) * 180 / Math.PI });
    },
    spectateMagnify: (m) => p.fly.setMagnification?.(m),   // W6: the scenic zoom on the page's projection (`FlyCamera.setMagnification`)
    spectatePitchSign: () => (p.fly.lookOptions?.().invertPitch ? -1 : 1),   // review B1: INVERT PITCH (DAT_003df198), the camera's own option
    scenicViews: () => scenicViews(p.map() ?? {}),   // PF-31: mission.rdr's Scenic_Views (the map may load after the page)
    // The parts' (`PART_DEPS`) come from the page that mounts them; a required one of a part it does not mount stands empty.
    remoteGrenade: () => {},
    roundEffects: firearm.roundEffects,              // another's round: its effects (and its report, where the sound is)
    roundImpact: firearm.roundImpact,                // INT-NET-2: the own round's blood, the room's body hit
    undoReload: () => { firearm.fire.undoReload(); },   // PF-18 (research 218 §2.1): the room dropped the page's reload in its flinch
    // LOW-2 (research 223 s6): the room refused the page's reload or round stale -- the magazine as the room has it.
    staleReload: (id) => { firearm.fire.restoreReload(id); },
    pressWindow: (until) => { firearm.fire.setPressWindow?.(until); },   // LATER 72: the delay window as the room counts it
    staleRound: (shot) => { firearm.fire.refundRound(shot); },
    netRefill: (rule) => { firearm.fire.setNetRefill?.(rule); },   // NET-REFILL (research 312 §5): the match's rule to the page's Fire
    died: () => { firearm.died(); h.died?.(); },     // MATCH-04: the view state to 0 at once (`./matchFirearm` `died`)
    ownHurt: () => { firearm.hurt?.(); },            // j5t3o2iU: the own body hurt and alive, FUN_00597b00's motors (`./matchFirearm` `hurt`)
    // The server's fresh kit at this spawn (room.ts, FUN_00599f00): the side's type's kit or its pick, the primary in the
    // hand, every magazine full. Protocol 9: the body follows the type the room rebuilt it as (after the kit, so the new
    // body is hung afresh).
    respawned: (kit, char) => { firearm.spawnKit(p.side(), kit ?? null, char ?? null); p.followTeam(); h.respawned?.(); },
    // The seat's side (welcome, promoted): the page's own body is the side's (`./teamBody`).
    teamChanged: (team) => p.followTeam(team),
  };
  const owned = new Set<string>(Object.values(PART_DEPS).flat());
  for (const key of Object.keys(rest)) {
    if (key in shared && !owned.has(key)) throw new Error(`matchNetDeps: ${key} is a shared hook (./matchNet); add to it, do not shadow it`);
  }
  const deps: NetPageDeps = { ...shared, ...defaults, ...rest };
  if (caps.armory && p.roundClear) {
    const clear = p.roundClear, newRound = deps.newRound, abandoned = deps.abandoned;
    deps.newRound = () => { clear(); newRound?.(); };
    deps.abandoned = () => { clear(); abandoned?.(); };
  }
  return deps;
}
