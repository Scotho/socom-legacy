import { itemClass, surfaceMaterial, type WeaponRecord } from '@s2u/scene';
import { roundsPerPull } from './accuracy';
import { ActionSelection, isHoldContext, type ActionContext, type CancelCause } from './actionContext';
import { ActionPage } from './actionPage';
import {
  actionInputs, actionPromptOf, ActionWiring, fireTable, observeCommands, pageSources, RoomEvents, TurretTrigger, turretInterval,
  type SourcePages,
} from './actionWiring';
import { BombPage, type BombPageView } from './bombPage';
import { actionRayPick } from './equipment';
import type { FlyCamera } from './camera';
import type { Fire } from './fire';
import type { Input } from './gamepad';
import { ACTION_CAPTION_TEXT, type ActionEntry } from './hud';
import type { LoadedMap } from './loadMap';
import type { BoxMagazine } from './matchFirearm';
import type { PageHands } from './matchThrow';
import { Button, TICK_HZ, type Command } from './net/protocol';
import type { NetPage } from './netPage';
import type { Play, PlayClips } from './play';
import { mountShape, turretReloadCountdown } from './net/emplacement';
import type { RemotePlayers } from './remotePlayers';
import { TurretPage, turretWeapon, type TurretPageDeps } from './turretPage';
import type { TraversalPage } from './traversalPage';
import { VictoryActionInput, VictoryPage, type VictoryState } from './victory';
import type { WalkMode } from './walk';
import type { WorldView } from './world';
import type { WorldState } from './worldState';

/**
 * ONE-WIRE (web research 222): sprint 27's action button and the pages it acts on, as one part a page's match mounts --
 * `/testroom` (`./main`) does; the front end's match does not yet (`./matchCore` `FRONT_END_CAPABILITIES.actions`): it
 * has no doors, traversal, throwables or world state for the picker to ask. The room's events relayed to the pages that
 * follow them (`RoomEvents`), the map's switches (XR-04, `./actionPage`), the manual turrets and their trigger (MAP-10b,
 * `./turretPage`), DEMOLITION's bomb (XR-05, `./bombPage`), and the action button's one context, its hold and its
 * cancel (XR-06, `./actionWiring` `ActionWiring`), the list's rotation (research 303: Cross held, a d-pad side), and the
 * VICTORY DANCE (research 303, `./victory` `VictoryPage`: the room's offer in the picker, the request on the release, the
 * dance on the body and the mover, the trigger and the Action held off while it plays). Nothing here reads page markup
 * or imports `./main` (OT.R12).
 */

export interface MatchActionsDeps {
  walk: Pick<WalkMode, 'mode' | 'isDead' | 'isLocked' | 'feet' | 'fireAim' | 'lookAim' | 'setCamera' | 'setLocked' | 'setActionFilter' | 'setNetTap'
    | 'syncVictoryMotion' | 'stopVictoryMotionAfter' | 'victoryMotionActive'>
    & Partial<Pick<WalkMode, 'binoculars' | 'setTurretHold' | 'setTurretAim' | 'pickupClaimed' | 'mountTake' | 'mountUntake' | 'mountRekey' | 'mountRefused' | 'launcherSetOn' | 'traversal' | 'actionGateShut' | 'triggerHeld' | 'airAfter' | 'posture'>>;
  fly: Pick<FlyCamera, 'pose'>;
  /** The doors (`./doorPage`): their target under the reticle, their action. */
  doors: SourcePages['doors'] & { action(): boolean };
  /** The traversal (`./traversalPage`): its climb and ladder in the picker, its lanes, its hold let go at a cancel. */
  traversal: Pick<TraversalPage, 'cancelAction' | 'padLanes' | 'hudClimb' | 'traversal' | 'holdAllowed'> & Partial<Pick<TraversalPage, 'chaseAction'>>
    & Partial<Pick<TraversalPage, 'respawnInputActive' | 'pressRespawn'>>;
  /**
   * The throwables' C4 (`./grenade`): the destructible under the reticle, its plant; a held grenade cancelled (no throw).
   * RE-4 (research 249 §5): its `clearAir`, called at a replay's seek only (`ReplayClient.onSeek`, heard off the client
   * the pages follow) -- both pages hand the `GrenadeThrower` itself; absent, a seek clears nothing. RV-7 (research 276
   * §6): its `clearScorches` too, at the same seek only; absent, the scorches stay. RV-7c-1 (276 §6): its `clearSmokes`
   * (PAR-45's), at the same seek only, after the scorches; absent (a deps object without it, as a test's), nothing of
   * the smokes is stopped -- both pages hand the thrower, which has it.
   */
  grenade: {
    c4Target(): unknown; plantC4(): boolean; cancelMenuHold(): void; clearAir?(): void; clearScorches?(): void; clearSmokes?(): void;
    /** A1: a held or unreleased throw cancelled at the turret's take (`GrenadeThrower.mountTake`); absent, nothing. */
    /** LATER 532: the trigger's level under a wind-up kept (true held), null (or nothing) when no wind-up was kept. */
    mountTake?(): boolean | null | void;
    /**
     * LATER 526: the throw `mountTake` cancelled handed back at the room's refusal of the take, the trigger as held; absent,
     * nothing. LATER 532: `wait`, the wait's commands in order with the trigger's level each and the body off the floor
     * after the command before, for the wind-up's chase over them.
     */
    mountUntake?(held: boolean, wait?: readonly { held: boolean; air: boolean }[]): void;
  };
  /** Research 303: the page's body, which plays the VICTORY DANCE (`Play.startVictory`). */
  play: Pick<Play, 'startVictory' | 'stopVictory' | 'resetVictory' | 'victoryActive' | 'victoryState'> & Partial<Pick<Play, 'weaponStats'>>;
  /**
   * Research 303: the firearm -- its trigger let go as the dance takes the body (`MatchFirearm.held`), and its reload
   * heard: an accepted reload clears the dance (`FUN_005a86b4` -> `FUN_0058a4d0`), as the room's does.
   */
  firearm: { held(): void; fire: Pick<Fire, 'subscribe'> & Partial<Pick<Fire, 'state' | 'mountTake' | 'mountUntake' | 'reloadLocked'>> };
  net(): NetPage | null;
  /**
   * Chain Reaction's lever when there is no player match (`ActionPage` `offline`). The page pauses its own hooks.
   * Absent, that press is not taken. A player match does not use it.
   */
  craneToggle?: (valve: string) => boolean;
  /**
   * P8 (`SWITCH_PREDICT_ADAPTATION`): a player's own press predicted on the gates (`GatePage.press`) and the hooks
   * (`CranePage.press`); each true when the press is one of theirs. Absent, those presses follow the room alone.
   */
  gatePress?: (action: number, seq: number) => boolean;
  cranePress?: (valve: string, seq: number) => boolean;
  isCrane?: (valve: string) => boolean;
  map(): LoadedMap | null;
  view(): WorldView | null;
  /** The page's world state (`./worldState`, MAP-02), or null. */
  world(): WorldState | null;
  remote: Pick<RemotePlayers, 'teamOf' | 'feet'>;
  /**
   * What the bomb draws through (`BombPage`'s view: the cues, the HUD's marks and fuse, the satchel, the effects, the model).
   * LATER 160: its `roundAudio` -- the page's own `RoundAudioHost`, which both pages lend here -- is reset at a replay's
   * seek too (`followSeek`); one without `reset` (a test's), or none, is left as it is.
   */
  bombView: BombPageView & { roundAudio?: { reset?(): void } | null };
  /** The window whose blur cancels the hold; absent, none. */
  win?: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
  /**
   * PF-34 (research 234 s5, s6): the world drops' weapon in reach and ahead of the walk (`WorldDrops.promptAt`), its id or
   * null; absent (a page that does not mount the world drops, `./matchCore` `worldDrops`), never the pickup context.
   */
  drops?: {
    ahead(): number | null;
    /**
     * PAR-34 (`./drops` `PICKUP_HOLD_PER_CLASS_READING`): `FUN_00593da0`'s candidate classes in reach, 0-2
     * (`WorldDrops.holdCandidatesAt`), the times the weapon prompt's hold runs down a frame; absent, one while `ahead`.
     */
    candidates?(): number;
    /**
     * LkPaioX5 (c) (`FUN_00541d40` D:L409206-409267; research 87 §5): the second candidate's drop -- the nearest of the
     * class `FUN_00593da0` puts second (`PICKUP_HOLD_PER_CLASS_READING`'s pistol) -- for action 5's TAKE, its id or null;
     * absent, none (`ahead` is then the first candidate's alone).
     */
    second?(): number | null;
    /** LkPaioX5 (c): a drop's weapon item (`WorldDrops.itemOf`), for its TAKE's name; absent, no name and no caption. */
    item?(did: number): number | null;
  };
  /**
   * MAP-10b (research 215 s7): what the turrets' bodies and rounds draw with -- the mount's and release's sounds, the bodies'
   * feet and hands, the clips (`TurretPageDeps`), and this page's own round drawn (`MatchFirearm.turretRound`). Absent:
   * silent, no pose, the round undrawn. T81-4: `clips` whole (the pack's clips and `motion.rdr`, `RemotePlayers.playClips`):
   * the page's own mount steer reads the mount clip's root keys (`mountShape`).
   */
  turret?: Pick<TurretPageDeps, 'sound' | 'bodyFeet' | 'hand'> & {
    clips?(): PlayClips | null;
    round?(record: WeaponRecord, from: [number, number, number], dir: [number, number, number], frame: ArrayLike<number> | null, count: number): void;
  };
  /** HX-4a (research 239 s7): the hostages' part (`./hostagePage`): its offer the `escortee` input, its fire the press. */
  hostages?: { offer(): unknown; fire(): boolean };
}

export interface MatchActions {
  readonly roomEvents: RoomEvents;
  readonly actions: ActionPage;
  readonly turrets: TurretPage;
  readonly bomb: BombPage;
  readonly wiring: ActionWiring;
  /** Research 303: the page's VICTORY DANCE (`./victory`). */
  readonly victory: VictoryPage;
  /** The action button's context now: the head of the game's list (`FUN_0021d9d0`), as the d-pad turned it. */
  pick(): ActionContext;
  /** A cancel of the action button's hold (a port rule, research 214 s4): nothing fires, the release after it neither. */
  cancel(cause: CancelCause): void;
  /** Cross's edges to the lifecycle (the press, the hold, the release that fires the context), then the traversal's lanes. */
  lanes(before: Input, after: Input, dt: number): void;
  /** The contexts' prompts for the HUD, the picker's list with its head first (LkPaioX5 (a)); none off the walk or in reach. */
  prompt(walking: boolean): readonly ActionEntry[] | null;
  /** The trigger: mounted, the turret's; dancing, the dance's -- no round, no pin (true: taken). */
  trigger(down: boolean): boolean;
  /** Research 303: the page's dance, for the browser spec's hook. */
  victoryState(): VictoryState;
  /** The turret's trigger held (the room's view of the trigger, `NetPage.frame`). */
  triggerHeld(): boolean;
  mounted(): boolean;
  /** The weapon box's count while mounted -- the turret's rounds, never reloading -- or null. */
  hudAmmo(): BoxMagazine | null;
  /**
   * PAR-55 (research 215 s8): the hand's other owner both pages give the firearm (through `actionHands`): the
   * turret's trigger, and while mounted the weapon box -- the kit's, holding the turret's weapon: its magazines
   * (`hudAmmo`), its HUDW icon and its fire mode (`TurretPage.hudIcon`, `hudFireMode`) -- and the mount.
   */
  readonly pageHands: Required<PageHands>;
  /** The pages follow the page's client (or none). */
  follow(client: Parameters<RoomEvents['follow']>[0]): void;
  /** The turret's lock forgotten: the closed client gave the walk back unlocked (`NetClient.release`). */
  unlock(): void;
  /** The frame after the net's: `NetPage`'s reconnect replaced its client -- the pages follow the new one at once. */
  followNet(): void;
  /** The frame after the firearm's: the turret's trigger let go off the turret or dead, its rounds claimed at its cadence. */
  turretFrame(dt: number, dead: boolean): void;
  dispose(): void;
}

/**
 * PAR-55 (research 215 s8): the action part's hands (`MatchActions.pageHands`) for the firearm, which both pages make
 * before the part (`mountActions` takes the firearm): each call asks `of()` then, so the page hands
 * `throws.hands(actionHands(() => acts))` and the part owns the shape.
 */
export function actionHands(of: () => Pick<MatchActions, 'pageHands'>): Required<PageHands> {
  return {
    trigger: (down) => of().pageHands.trigger(down), magazine: () => of().pageHands.magazine(), mounted: () => of().pageHands.mounted(),
    icon: () => of().pageHands.icon(), fireMode: () => of().pageHands.fireMode(), weapon: () => of().pageHands.weapon(), reload: () => of().pageHands.reload(),
    thermal: () => of().pageHands.thermal(), turret: () => of().pageHands.turret(),
    mountTaken: () => of().pageHands.mountTaken(), commandSeq: () => of().pageHands.commandSeq(),
    heldPulls: () => of().pageHands.heldPulls(),                                                                              // TRIGGER-SWAP fold
  };
}

export function mountActions(d: MatchActionsDeps): MatchActions {
  const { walk, traversal, doors } = d;
  // RSP-8 (research 354): both mounts hand pad/touch and the development key route the same NetPage dead controller.
  const previousRespawnActive = traversal.respawnInputActive, previousRespawnPress = traversal.pressRespawn;
  const respawnActive = (): boolean => d.net()?.respawnInputActive?.() ?? false;
  const respawnPress = (): boolean => d.net()?.pressRespawn?.() ?? false;
  traversal.respawnInputActive = respawnActive;
  traversal.pressRespawn = respawnPress;
  /** The match's client while open (the switches', the turrets' and the drop's sends). */
  const openClient = () => { const net = d.net(); return net && net.client.state === 'open' ? net.client : null; };
  /**
   * Sprint 27 wave 4 (`./actionWiring` `RoomEvents`): the room's events to the pages that follow them -- the bomb, the
   * turrets, the switches -- one relay across the page's connections (each new client followed).
   */
  const roomEvents = new RoomEvents();
  /**
   * RE-4 (research 249 §5; 244 §7.2): the page's air cleared at a replay's seek -- the grenades, rounds and rockets in
   * flight at the old playhead and the charges the page holds from play -- before the seek's welcome lays the target's
   * charges (RE-1, the envelope's `projectiles`). The page's own `clearAir` (ROUND_START_PROJECTILES_READING: removed,
   * no blast, no sound, no mark), heard off the followed client's `onSeek` (`ReplayClient`'s, read as `NetPage` reads its
   * `dtScale` and `pageClock`); a live `NetClient` has none, so the live page clears only at its round hooks
   * (`./armoryGlue`). A browser adaptation (REPLAY_ADAPTATION): SOCOM II plays no recording back.
   * RV-7 (research 276 §6): the scorches go too (`clearScorches`), as a joiner's page holds none from before its join
   * (`GrenadeThrower.hydrateLive` lays no mark); the target's own are not laid. (RV-7 left the smokes pouring at the old
   * playhead, with no method that stopped them alone; RV-7c-1's call below stops them: 276 §6, "Not cleared".)
   * RV-7c-1 (276 §6): the call that stops them, `clearSmokes`, after the air and the scorches and before the welcome, so
   * the target's smoke the welcome lays is not stopped: PAR-45's `GrenadeThrower.clearSmokes`, which both pages hand
   * with the thrower itself; optional, so a deps object without it skips it. Never on play, a step on, or the live path.
   * LATER 160: the round's audio reset there too (`RoundAudioHost.reset`: nothing pending, the slot and the voices
   * stopped, the round undecided, its kill counts gone), as the live page's close resets it before a reconnect's welcome
   * (`NetPage.retry`), so the seek's welcome marks the target's hold by its own reason (LATER 155, `markDecided`) and a
   * target in play is undecided -- a joiner's page. Was: the old playhead's decision kept (`markDecided` does nothing
   * once decided), so a seek from MP61's time-out hold into an elimination hold played the time-out's live defuse.
   */
  let offSeek: (() => void) | null = null;
  const followSeek = (client: object | null): void => {
    offSeek?.();
    offSeek = null;
    const seeks = client as { onSeek?(listener: () => void): () => void } | null;
    if (typeof seeks?.onSeek === 'function') offSeek = seeks.onSeek(() => {
      d.grenade.clearAir?.(); d.grenade.clearScorches?.(); d.grenade.clearSmokes?.();
      d.bombView.roundAudio?.reset?.();   // LATER 160: before the welcome marks the target's hold
    });
  };
  /**
   * Research 303: the VICTORY DANCE -- the room's offer, the request on the action's release, this seat's dance on the
   * body and the mover; the others' are `./netPage`'s (`./remotePlayers`). A welcome (or a new client) resets it.
   */
  const victory = new VictoryPage({
    client: openClient, map: () => d.map(), play: d.play, walk,
    release: () => { d.firearm.held(); d.grenade.cancelMenuHold(); },
  });
  roomEvents.on((ev) => victory.event(ev));
  const offReload = d.firearm.fire.subscribe((e) => { if (e.type === 'reloadStart') victory.reloaded(); });   // PAR-37: the reload's command kept
  /** CPS collision step 3 (`switchArmed` below): what the switch page's deps last returned -- its ray, feet and world. */
  const castRead: { aim: ReturnType<typeof walk.lookAim> | null; feet: ReturnType<typeof walk.feet> | null; world: ReturnType<typeof d.world> } = { aim: null, feet: null, world: null };
  /**
   * XR-04 (`./actionPage`, research 213 s4): the map's switches -- Crossroads' call strikes -- under the reticle: the
   * press asked of the room, its `action` event played back on the page's world (sounds and effects only, PF.R26).
   */
  const actions = new ActionPage({
    world: () => (castRead.world = d.world()),
    feet: () => (castRead.feet = walk.feet()),
    aim: () => (castRead.aim = walk.lookAim()),     // the use prompt's ray (research 84 §19); its far point is the drawn reticle's, `aim()` (LATER 305's redo)
    net: openClient,
    offline: d.craneToggle,
    ...(d.gatePress ? { gatePress: d.gatePress } : {}),
    ...(d.cranePress ? { cranePress: d.cranePress } : {}),
    ...(d.isCrane ? { isCrane: d.isCrane } : {}),
  });
  roomEvents.on((ev) => actions.event(ev));
  /**
   * CPS collision step 3, 2026-11-03 (plan `2026-11-02-client-performance-sprint.md`, CPS.R9 (e)): `segmentHits` was 0.5 ms
   * a frame of self time in the 16-seat live cell, and the switch ray was cast 2-3 times a frame -- `prompt` samples it
   * (`ActionPage.sample`), then its pick asks the switch source, whose `ActionPage.armed()` cast the same `lookAim` ray
   * again. A CPU-side browser adaptation with no original, the same prompt and pick: within the one `prompt` call, while
   * the ray (eye and far, `Object.is`), the feet and the world (the object and its `revision`) are the ones the sample
   * read (`castRead`, what the page's own deps last returned), the pick takes the sample's answer -- `armed()` is
   * `target() !== null || shown !== null`, and the sample has just set `shown` from that very cast. What `target()` reads
   * besides is the world's grid, actions and valves, which nothing in a `prompt` call changes; the doors', gates' and
   * cranes' hull moves between frames, so nothing is kept past the call (the lanes' and the release's picks cast).
   */
  let promptCast: { key: number[]; world: ReturnType<typeof d.world>; revision: number; armed: boolean } | null = null;
  const castKey = (aim: ReturnType<typeof walk.lookAim> | null, feet: ReturnType<typeof walk.feet> | null): number[] => [
    aim ? 1 : 0, aim?.eye[0] ?? 0, aim?.eye[1] ?? 0, aim?.eye[2] ?? 0, aim?.far[0] ?? 0, aim?.far[1] ?? 0, aim?.far[2] ?? 0,
    feet ? 1 : 0, feet?.[0] ?? 0, feet?.[1] ?? 0, feet?.[2] ?? 0,
  ];
  const switchArmed = (): boolean => {
    const s = promptCast;
    if (s !== null) {
      const world = d.world(), key = castKey(walk.lookAim(), walk.feet());
      if (world === s.world && (world?.revision ?? 0) === s.revision && key.every((v, i) => Object.is(v, s.key[i]))) return s.armed;
    }
    return actions.armed();
  };
  /**
   * A1 (LATER 218; research 215 s8.6 "A1"): the command the kit's timer carried at the take ends on, in this page's numbering,
   * as the room's `mountKit` counts it (branch A). A reload's delay: from the press's command -- its window's end less the
   * delay's commands, as `./netPage` set the window (`seq + round(seconds x TICK_HZ)`) -- plus the kit-timer model's run of
   * the record's `ReloadDelay` (`./net/emplacement` `turretReloadCountdown`, `FUN_005c0fd0` D:L476549-476563: 61 commands
   * for 1 s). A bolt's or a pump's after-shot: its seconds left from M (MOUNT_CARRIED_AFTERSHOT_PLACEHOLDER's carry; the room
   * counts it on its own lock, `Player.lockTimer`). Either holds the turret's trigger only until the room's first tell of
   * the hold's magazines (`TurretPage.reloading`), which is the word.
   */
  const carriedEnd = (c: NonNullable<ReturnType<NonNullable<Fire['mountTake']>>>, m: number): number => {
    if (c.kind === 'reload' && c.until !== null) return c.until - Math.round(c.delay * TICK_HZ) + turretReloadCountdown(c.delay).commands;
    return m + Math.round(c.seconds * TICK_HZ);
  };
  /**
   * MAP-10b (`./turretPage`, research 215 s6): the manual turrets -- mount and dismount asked of the room, the walk locked
   * while mounted, the look held to the gun's limits, every occupied gun drawn turned to its occupant's aim. The lock is
   * shared with a death's (`setLocked`): the room releases the turret before it announces the kill, so the release's
   * unlock comes first; a release that finds the player dead (or a lock this page never took) unlocks nothing.
   */
  let turretLock = false;
  const turrets = new TurretPage({
    ...d.turret,
    turrets: () => d.map()?.turrets ?? [],
    feet: () => walk.feet(),
    look: () => { if (walk.mode() !== 'walk') return null; const p = d.fly.pose(); return { yaw: p.yaw, pitch: p.pitch }; },
    setLook: (yaw, pitch) => walk.setCamera({ yaw, pitch }),
    setLocked: (on) => {
      if (on) { turretLock = true; walk.setLocked(true); return; }
      if (!turretLock) return;
      turretLock = false;
      if (!walk.isDead()) walk.setLocked(false);
    },
    bodyLook: (id) => { const b = d.net()?.client.bodies().find((x) => x.id === id); return b ? { yaw: b.yaw, pitch: b.pitch } : null; },
    move: (path, delta) => { d.view()?.moveNode(path, delta); },
    net: openClient,
    weapon: (name) => turretWeapon(d.map()?.arsenal?.table, name),   // PAR-55: the box's (TURRET_AMMO_HUD_READING)
    // T81-4 (research 215 s7.9): the mount clip's shape for the page's own steer through the clip (`TurretPage.holdTick`).
    mountShape: (hand) => { const c = d.turret?.clips?.(); return mountShape(c?.clips ?? null, c?.table ? new Map(c.table) : null, hand); },
    replayed: (after) => { d.net()?.client.replayed(after); },   // LATER 96 (F2): the catch-up's commands not compared (NetClient.replayed)
    // LATER 175 (research 215 s8.6): no mount offered under the kit's lock (`FUN_005a7de0` -> `FUN_005a7ab0`, D:L462636).
    // LATER 221: at the ask's command `cmd` (`Fire.reloadLocked`: online the press's window in commands, the room's
    // `pressLock`, LATER 72; offline the timer), as the climb's offer reads it -- was `Fire.state`, the page's own clock.
    kitLocked: (cmd) => d.firearm.fire.reloadLocked?.(cmd) ?? false,
    // LATER 205 (research 215 §8.7): no mount offered under the launcher's set (`FUN_005b4340(actor, 10)` D:L469528-469531).
    launcherSet: () => walk.launcherSetOn?.() === true,
    // P37: no mount offered while a traversal move holds the mover -- the room's `p.sim.moves?.busy()` ('mount: busy').
    moveBusy: () => walk.traversal?.()?.busy() === true,
    // A1 (LATER 239, 217, 218, 243; research 215 s8.6 "A1"): this page's own take of its reserved turret, before the command
    // it names. Its refusal on the body comes first (`FUN_005463c0` D:L412134-412150); then the held throw is cancelled,
    // the kit's timer handed over (its end in this page's numbering) and the body popped and stood (`./net/blast`
    // `mountPop`) -- in that order: the throw before the pop, so the walker's 'replaced' end finds no throw to let go.
    takeRefused: () => walk.mountRefused?.() ?? walk.isDead(),
    took: (m) => {
      const level = d.grenade.mountTake?.();
      windUp = typeof level === 'boolean' ? { m, levels: [{ at: m - 1, held: level }] } : null;   // LATER 532: the level at M - 1
      const c = d.firearm.fire.mountTake?.() ?? null;
      walk.mountTake?.(m);                                         // LATER 524: M kept for a flinch event heard after the take
      return c === null ? null : carriedEnd(c, m);
    },
    // LATER 525, LATER 526 (research 215 s8.6 "A1"; `FUN_005463c0` refuses before its take's steps, D:L412131-412166): the
    // room refused the take -- undone in the reverse of the take's order: the body re-run as the room ran it on foot (its
    // pop and the hold's placement undone, the wait's predictions not compared: `NetClient.replayed`), its flinch back, M
    // cleared (`WalkMode.mountUntake`); then the kit's timer (`Fire.mountUntake`: the original keeps the reload, D:L412188
    // gating D:L412217-412218; LATER 526's review F5(D), the page's own record of what the take handed over, no wire field);
    // then the held throw handed back, the trigger as the walk's commands carry it.
    // LATER 532 (LATER 529's F4): a wind-up kept at the take is handed back with the trigger as this page's own record kept
    // it through the wait (`windUp`) -- not the walk's Trigger bit, which no wind-up sets (`./main`, `./matchMount`: the
    // firearm's or the turret's), so a trigger held from before the take reads let go there and was thrown at the refusal --
    // and the wait's commands, M through the last sent, each with its level and the body off the floor after the command
    // before as the re-run left it (`WalkMode.airAfter`), for the chase over them (`GrenadeThrower.mountUntake`).
    // LATER 525 (a) (research 215 s8.6 "A1"; `room.ts` `mountWord`, `resolveMounts`): the room took on a later command than
    // M -- the walk's M re-keyed to it, the flinch events heard since judged again (`WalkMode.mountRekey`). The windows it
    // returns are not re-told to `./netPage`'s reload undo: the page's reload is locked through the take (LATER 525 (c)).
    retook: (m) => { walk.mountRekey?.(m); },
    untook: () => {
      const wu = windUp;
      windUp = null;
      walk.mountUntake?.((after) => { d.net()?.client.replayed(after); });
      d.firearm.fire.mountUntake?.(walk.isDead());                // LATER 530: a death in the wait ends the clip the take kept (PAR-19)
      const last = openClient()?.lastSeq() ?? null;
      if (!wu) { d.grenade.mountUntake?.(walk.triggerHeld?.() ?? false); return; }
      const wait: { held: boolean; air: boolean }[] = [];
      if (last !== null) for (let seq = wu.m; seq <= last; seq++) wait.push({ held: windUpAt(wu, seq), air: walk.airAfter?.(seq - 1) === true });
      d.grenade.mountUntake?.(wu.levels.at(-1)!.held, wait);
    },
  });
  turrets.attach(roomEvents);
  walk.setTurretHold?.((w) => { turrets.holdTick(w); });   // PAR-44 (research 215 s7.5): the hold's place on the own mover, each tick
  walk.setTurretAim?.((yaw, pitch) => turrets.clampLook(yaw, pitch));   // T81-3 (research 215 s7.8): the walk's look held to the held turret before its gate, as room.ts onTurret
  /**
   * XR-06 (`./actionContext`, research 214 s4): the action button's one context, picked in the game's order
   * (`FUN_0021d9d0`) from the pages' answers, fired on the release edge (`ActionWiring`), its hold and its cancel kept
   * apart. M7 (research 94 §C5.1): a door before C4, as the picker's order has it. The bomb is made below: lent through
   * a closure, read at the press.
   */
  /** PF-34: the weapon drop the prompt would offer, the 3 s hold aside. */
  const dropAhead = (): number | null => d.drops?.ahead() ?? null;
  /** LkPaioX5 (c): the second candidate's drop (action 5), the 3 s hold aside. */
  const dropSecond = (): number | null => d.drops?.second?.() ?? null;
  /**
   * LkPaioX5 (c): a TAKE's weapon name -- the drop's record's `DisplayName` (`FUN_00220870` D:L74513-74520: the drop's
   * `+8` record's `+8`, `FUN_003d2830`, the parser's `DisplayName`: research 212 §4.1), UNKNOWN for a record the arsenal
   * lacks (D:L74515-74516); undefined when the page lends no item (no caption).
   */
  const takeName = (did: number | null): string | undefined => {
    const item = did === null ? null : d.drops?.item?.(did);
    if (item === undefined || item === null) return undefined;
    return d.map()?.arsenal?.table?.arsenal.items.get(item)?.displayName ?? ACTION_CAPTION_TEXT.unknown.text;
  };
  const actionSources = pageSources({
    walk, doors, actions: { target: () => actions.target(), armed: switchArmed }, turrets, traversal,   // CPS collision step 3
    bomb: { prompt: () => bomb.prompt() }, grenade: { c4Target: () => d.grenade.c4Target() },
    drops: { prompt: () => (wiring.lifecycle.pickupHeld() ? null : dropAhead()), second: () => (wiring.lifecycle.pickupHeld() ? null : dropSecond()) },   // PF-34: the weapon prompt, its 3 s hold; LkPaioX5 (c): the second's too
    ...(d.hostages ? { hostages: d.hostages } : {}),   // HX-4a: FOLLOW! / HOLD POSITION on the hostage under the crosshair
    victory: () => victory.offered(),                 // research 303: the room's offer, the body free
  });
  /**
   * Research 303: the picker's list as the original keeps it (`FUN_0021d9d0` D:L73332-73404) -- its head the action,
   * Cross held and a d-pad side turning it (`ActionSelection`); none while a dance is asked or plays (its NoFire gate,
   * `FUN_005a7de0`, holds the common actions off).
   */
  const selection = new ActionSelection();
  const pick = (): ActionContext => selection.pick(victory.busy() ? {} : actionInputs(actionSources));
  const wiring = new ActionWiring({
    pick,
    fire: fireTable({
      doors, actions, turrets, grenade: { plantC4: () => d.grenade.plantC4() },
      pickup: () => { const did = dropAhead(); const sent = did !== null && (d.net()?.pickup(did) ?? false); if (sent) walk.pickupClaimed?.(); return sent; },   // PF-34: the claim; NU-5 F3: its command noted
      pickup2: () => { const did = dropSecond(); const sent = did !== null && (d.net()?.pickup(did) ?? false); if (sent) walk.pickupClaimed?.(); return sent; },   // LkPaioX5 (c): the second candidate's claim, the same send
      escortee: () => d.hostages?.fire() ?? false,     // HX-4a: the order sent (`NetPage.hostageOrder`)
      victory: () => victory.fire(),                   // research 303: the dance asked of the room
      bombDrop: () => {                                // XR-05: the manual drop (action 6) asked of the room, a player's only
        const c = openClient();
        if (!c || c.role !== 'player') return false;
        c.send({ type: 'bombAction', seq: c.lastSeq(), action: 'drop' });
        return true;
      },
    }),
    cancel: () => traversal.cancelAction(),            // the traversal's hold let go, and the walk's next command holds nothing
  });
  walk.setActionFilter(() => victory.busy() || wiring.filter());   // research 303: no walk action under the dance
  // Research 303: the held action is the list's head -- a plant's or a defuse's hold only while that is it (the d-pad
  // may turn a one-shot to the head), the traversal's own, or none.
  traversal.holdAllowed = () => { const c = pick(); return c === null || c === 'traversal' || isHoldContext(c); };
  /** Research 303 (a browser safeguard): the Action held into a dance is the dance's until let go. */
  const victoryInput = new VictoryActionInput();
  /** The last frame's Action taken off by `victoryInput` (its release is no edge here). */
  let actionTaken = false;
  /** Research 303: the trigger pressed while a dance is asked or plays -- the dance's until let go (NoFire). */
  let triggerTaken = false;
  const cancel = (cause: CancelCause): void => wiring.cancel(cause);
  // XR-06: the window's blur cancels the hold (the keyup or the pointerup it swallows is no release).
  const onBlur = (): void => cancel('blur');
  d.win?.addEventListener('blur', onBlur);
  /** The last command the walk sent: the manual drop's stick and pitch (`BombPageDeps.look`, the room's `canDrop`), and its yaw (PLANT-AIM's reach point). */
  let lastCommand: Pick<Command, 'forward' | 'right' | 'pitch' | 'yaw'> | null = null;
  /**
   * XR-05/XR-06 (`./bombPage`, research 214 s1-s4): the bomb follows the room (`roomEvents`), predicts this page's hold
   * from the commands it sends (`observeCommands`), and draws through what the page lends (`bombView`).
   */
  const bomb: BombPage = new BombPage(roomEvents, {
    id: () => { const net = d.net(); return net?.client.role === 'player' ? net.client.id : null; },   // a spectator's seat is none
    team: () => { const net = d.net(); return net?.client.role === 'player' ? net.client.team : null; },
    alive: () => walk.mode() === 'walk' && !walk.isDead(),
    feet: () => walk.feet(),
    actions: () => d.map()?.meta?.actions ?? [],
    look: () => lastCommand && { forward: lastCommand.forward, right: lastCommand.right, pitch: lastCommand.pitch },
    serverTick: () => d.net()?.client.serverTick() ?? 0,
    teamOf: (id) => d.remote.teamOf(id),
    bodyAt: (id) => d.remote.feet(id),
    open: () => d.net()?.client.state === 'open',     // PB-1 review F2: a room lost, the own satchel off
    gateShut: () => walk.actionGateShut?.() ?? false,   // LATER 220: the hold behind the prompts' common gate (research 369 §2)
    // PLANT-AIM (research 214 §2, PLANT_REACH_READING): the action button's pick along the use prompt's ray, as the switches'
    // (`ActionPage`, `FUN_005aa6e0`), and its naming to the room, a player's only.
    pick: () => {
      const world = d.world(), a = walk.lookAim();
      if (!world || !a) return null;
      const p = actionRayPick(world.grid, a.eye, a.far, world.meta.actions, (n) => surfaceMaterial(n, ''));
      return p && { path: p.path, point: p.point, eye: [a.eye[0]!, a.eye[1]!, a.eye[2]!] };
    },
    body: () => (lastCommand && walk.posture ? { yaw: lastCommand.yaw, posture: walk.posture() } : null),
    aim: (claim) => {
      const c = openClient();
      if (c && c.role === 'player') c.send({ type: 'bombAction', seq: c.lastSeq(), action: 'aim', surface: claim?.surface ?? null, ...(claim?.eye ? { eye: claim.eye } : {}) });
    },
  }, d.bombView);
  observeCommands<Omit<Command, 'seq'>, [number, number, number]>(walk, (cmd) => {
    lastCommand = cmd;
    bomb.tick((cmd.buttons & Button.ActionHeld) !== 0);   // once a command: the hold predicted as the room counts it
  });
  /** MAP-10b: the trigger held while mounted (the turret's), and its cadence. */
  let turretHeld = false;
  /**
   * LATER 532 (LATER 529's F4; the dispatcher's word, 2026-10-27): a grenade wind-up kept at this page's send-time take
   * (`took`, `GrenadeThrower.mountTake`), with the trigger's level through the take's wait: the level at M - 1 as the
   * thrower held it, then each press and let-go heard while mounted (`trigger`) with the command it rides (`lastSeq() + 1`,
   * the command the frame builds next, as `./main` sets the Trigger bit before the walk builds it). Read at the room's
   * refusal (`untook`); dropped off the mount (`turretFrame`). **This is the page's own record of its hand, an undo
   * mechanism, not a game value**: the original's command (`Button.Trigger`) carries the trigger only as the firearm's or
   * the turret's (LATER 347), and no field of it carries a wind-up's level -- neither does this page's: the level never
   * goes on the wire. Kept here, beside the trigger's routing, rather than on the walk's kept commands (`KeptCommand`,
   * the record of what the wire carried, which the walk's re-run and reconcile read), so the command record stays the
   * wire's. Null: no wind-up kept, the refusal read, or off the mount (a granted take keeps it until then, unread).
   */
  let windUp: { m: number; levels: { at: number; held: boolean }[] } | null = null;
  /** LATER 532: the trigger's level on command `seq` -- the last press or let-go heard at or before it. */
  const windUpAt = (w: NonNullable<typeof windUp>, seq: number): boolean => {
    let held = w.levels[0]!.held;
    for (const l of w.levels) if (l.at <= seq) held = l.held;
    return held;
  };
  const turretTrigger = new TurretTrigger();
  /** PAR-56: the mounted turret's weapon's item id (the arsenal's, by its `WEAPON NAME`; a record or none), or null. */
  const turretItem = (): number | null => {
    const map = d.map();
    const id = turrets.mounted(), place = id !== null ? map?.turrets?.find((t) => t.id === id) : undefined;
    return (place?.weapon ? map?.arsenal?.table?.arsenal.byName.get(place.weapon)?.id : undefined) ?? null;
  };
  /** LATER 97: the mounted placement's definition's `THERMAL` (D:L301769-301771 -> `+0x298`, D:L300794); false with none. */
  const turretThermal = (): boolean => {
    const id = turrets.mounted();
    return id !== null && d.map()?.turrets?.find((t) => t.id === id)?.def?.thermal === true;
  };
  /**
   * The mounted turret's weapon record (the room's `turretRecord`: the arsenal's id of its `WEAPON NAME`; PAR-59, class 230's
   * `turret2Records` too -- MGL FRAG TURRET, whose round the room launches), or null.
   */
  const turretRecord = (): WeaponRecord | null => {
    const item = turretItem(), table = d.map()?.arsenal?.table;
    return item !== null ? table?.turretRecords?.get(item) ?? table?.turret2Records?.get(item) ?? null : null;
  };
  /**
   * PAR-59 (research 215 s8): the rounds this pull has claimed. The mounted slot fires as the kit's (`FUN_005c0ae0`): no
   * more than the slot's mode allows a pull (`FUN_005c0940`, `./accuracy` `roundsPerPull`: MGL FRAG TURRET's SINGLE 1,
   * PKM's and LMG's AUTO unbounded), counted from the trigger's let-go (`kit+0x818` zeroed, D:L476380-476382 and
   * D:L476398-476400; refused at the mode's count, D:L476439; a round counted, D:L475516), at most one each `FireWait`
   * (`kit+0x81c` set at the round, D:L475517; refused while it runs, D:L476446).
   */
  let turretPulled = 0;
  /**
   * TRIGGER-SWAP fold (research 211 §10; reading, pending review): the turret's pull count of a hold still held at the
   * dismount, handed to the rifle with the trigger (`pageHands.heldPulls`) -- the turret is a kit slot (the mount:
   * `FUN_005463c0` D:L412214-412218 -> `FUN_005c4b10`), each round raising the kit's count (`FUN_005be9a0`
   * D:L475514-475516), which the dismount's slot change leaves (`FUN_00545ee0`: `FUN_005c4b10` back to the slot kept at
   * the mount, +0xebc, D:L412005, then `FUN_005b9bb0` clearing the turret's slot, D:L412006 -- neither writes +0x818) and
   * only a let-go zeroes (`FUN_005c0ae0` D:L476380-476382, D:L476399-476400). 0 with none.
   */
  let handedPulls = 0;
  /**
   * MAP-10b: one mounted round claimed of the room (`fire` -> `turretRound`): the command it rides and, TURRET-CONE (research
   * 215 s8.2), the page's own round -- `TurretPage.round()` first, its muzzle and its line rolled on the turret's cone
   * (`setSpread`) -- as `from` and `dir`, the eye and the aim the camera's; the room bounds that line inside its own run of
   * the cone about its gun line and fires along it (TURRET_ROUND_LINE_READING). Drawn here on that line (the muzzle effect,
   * the tracer, the marks, the report), the round's bloom after the roll (`MatchFirearm.turretRound`: P1's review F2, the
   * original's `+0x74` at D:L475601 before the round's step at D:L475604). Whether the claim was sent: the pull is counted
   * only then (PAR-59's review; the original counts it when the round fires, `FUN_005c0ae0`'s caller D:L475516).
   */
  const sendTurretRound = (): boolean => {
    const c = openClient(), a = walk.fireAim();
    if (!c || c.role !== 'player' || !a) return false;
    const v = [a.far[0]! - a.eye[0]!, a.far[1]! - a.eye[1]!, a.far[2]! - a.eye[2]!], l = Math.hypot(v[0]!, v[1]!, v[2]!) || 1;
    const eye: [number, number, number] = [a.eye[0]!, a.eye[1]!, a.eye[2]!], dir: [number, number, number] = [v[0]! / l, v[1]! / l, v[2]! / l];
    // Research 215 s7: drawn here as the room fires it -- never a claim the room drops: the binoculars up (its command's
    // gate) or the count spent (`TurretPage.round` null), whose claim carries the eye's ray as before. The room's own
    // `shot` of this page's id plays nothing (`NetPage`).
    const record = turretRecord(), r = record && !walk.binoculars?.() ? turrets.round() : null;
    // NCW-17 (an instrument): the displayed tick beside the claim's view clock, both at one clock read (the review's F1:
    // two reads in a browser put a bracketed `shownTick` a hair off `viewTick`, and the room drops one above it).
    const now = performance.now(), viewTick = c.viewTick(now), shownTick = c.shownTick?.(now) ?? null;
    c.send({ type: 'fire', seq: turrets.claimSeq() ?? c.lastSeq(), from: r ? r.from : eye, dir: r ? r.dir : dir, weapon: 0, viewTick, eye, aim: dir, ...(shownTick !== null ? { shownTick } : {}) });
    if (record && r) d.turret?.round?.(record, r.from, r.dir, r.frame, r.count);
    return true;
  };

  const hudAmmo = (): BoxMagazine | null => { const a = turrets.hudAmmo(); return a && { ...a, reloading: false }; };   // TURRET_AMMO_HUD_READING
  const trigger = (down: boolean): boolean => {
    handedPulls = 0;                                     // TRIGGER-SWAP fold: a press or a let-go ends the dismount's count
    // MAP-10b: mounted, the trigger is the turret's (`turretTrigger`, the room fires its rounds), never the rifle's.
    if (turrets.mounted() !== null) {
      turretHeld = down;
      if (windUp) windUp.levels.push({ at: (openClient()?.lastSeq() ?? windUp.m - 1) + 1, held: down });   // LATER 532
      return true;
    }
    // LATER 109 (TURRET_RELEASE_ACTIONS_PLACEHOLDER, strict; the controller's call): through the own release's reversed clip
    // (`TurretPage.travelling`, the press through the end's command) a press fires nothing and pulls no pin -- the mount clips'
    // `NoFire`, its test on a reversed play unread; the room drops a claim then ('releasing') -- and stays the release's until
    // let go, as the dance's below.
    if (down && turrets.travelling()) { triggerTaken = true; return true; }
    // Research 303: the dance's NoFire (`FUN_005a7de0`): a press while it is asked or plays fires nothing and pulls no
    // pin, and stays the dance's until let go (the round's own gate is the mover's, `./net/fireCapability`).
    if (down && victory.busy()) { triggerTaken = true; return true; }
    if (!down && triggerTaken) { triggerTaken = false; return true; }
    return triggerTaken;
  };
  const isMounted = (): boolean => turrets.mounted() !== null;

  return {
    roomEvents, actions, turrets, bomb, wiring, victory, pick, cancel,
    lanes: (before, after, dt) => {
      if (respawnActive()) {
        // The dead controller reads only fresh Action presses; living contexts/holds never see this route.
        if (wiring.lifecycle.down()) cancel('death');
        traversal.padLanes(before, after);
        return;
      }
      // LATER 362: the action button's pressure chased this frame, before its release fires a door (`chaseAction`).
      traversal.chaseAction?.(after.action, dt);
      // Research 303: an Action held into or through a dance reaches nothing until let go (`VictoryActionInput`).
      const act = victoryInput.frame(after.action, victory.busy());
      const was = before.action && !actionTaken;
      actionTaken = after.action && !act;
      // Wave 4: Cross's edges to the action lifecycle -- the press, the hold, and the release that fires the page's
      // context now, before the traversal's lanes ask the walk's action (its filter then told what was taken).
      if (act && !was) wiring.press();
      else if (!act && was) wiring.release();
      wiring.hold(dt);                                   // while down (the pad's or the keyboard's): a site walked into holds
      wiring.lifecycle.elapse(dt, d.drops?.candidates?.() ?? (dropAhead() !== null));  // PF-34: the weapon prompt's 3 s hold runs down while one is in reach (PAR-34: once per candidate class)
      // Research 303: Cross held, a d-pad side's press turns the list (`FUN_00595320`: Left the head to the tail, Right the
      // tail to the head); the side used so is no peek until let go. A new head is the held action (`reselect`).
      const head = pick();
      const sides = selection.pad(act, after.leanLeft, after.leanRight);
      if (act && pick() !== head) wiring.lifecycle.reselect();
      // Research 86: Cross the action, the d-pad's sides the peek.
      traversal.padLanes({ ...before, action: was }, { ...after, action: act, leanLeft: sides.left, leanRight: sides.right });
    },
    // XR-06 (research 214 s4): the context's prompt, in the picker's order -- the bomb's plant, defuse or drop, a door
    // (FUN_005aa240), a switch (XR-04: its record's bitmap), C4's destructible (SUP-03; PF-13: once settled there 0.2 s and
    // plantable), the turret's mount or dismount (MAP-10b); the traversal's climb is its own feed.
    // Sample the reticle before the pick, so the icon and the press share one target (a later ray must not hide a press
    // the prompt is still showing, nor leave the icon up after the sample has moved off the lever).
    // LkPaioX5 part 2 (a) (research 87 §5, "The action list"): the picker's whole list, its head first, each context's
    // prompt -- the HUD draws the head and list[1], list[2] beside it (`FUN_0021f210` D:L73979-74032). The traversal's
    // entry is its own record's icon: the slide's on a ladder, else the climb's (the HUD's climb feed draws the same).
    prompt: (walking) => {
      actions.sample(walking);
      if (!walking) return null;
      // CPS collision step 3: the pick below, and the list's entries, reuse this sample's cast while what it read is
      // unchanged (`switchArmed`).
      const world = castRead.world;
      promptCast = { key: castKey(castRead.aim, castRead.feet), world, revision: world?.revision ?? 0, armed: actions.shownPrompt() !== null };
      try {
        if (pick() === null) return null;
        const pages = { switch: () => actions.shownPrompt(), turret: () => turrets.prompt() };
        const entries: ActionEntry[] = [];
        for (const c of selection.list()) {
          const p = c === 'traversal' ? (traversal.traversal()?.state().kind === 'ladder' ? 'ladder_slide' : 'climb') : actionPromptOf(c, pages);
          if (!p) continue;
          const e: ActionEntry = { prompt: p };
          // LkPaioX5 (b): a hostage's order is captioned with its own record's text (FOLLOW!, HOLD POSITION: `./hostagePage`).
          if (c === 'escortee') { const t = (d.hostages?.offer() as { text?: string } | null | undefined)?.text; if (t !== undefined) e.caption = t; }
          // LkPaioX5 (c): each TAKE captioned with its own candidate's weapon (`FUN_00220870`).
          const name = c === 'pickup' ? takeName(dropAhead()) : c === 'pickup2' ? takeName(dropSecond()) : undefined;
          if (name !== undefined) e.name = name;
          entries.push(e);
        }
        return entries.length ? entries : null;
      } finally {
        promptCast = null;
      }
    },
    trigger,
    victoryState: () => victory.state(),
    triggerHeld: () => turretHeld,
    mounted: isMounted,
    hudAmmo,
    pageHands: {
      trigger, magazine: hudAmmo, mounted: isMounted,
      icon: () => turrets.hudIcon(), fireMode: () => turrets.hudFireMode(), weapon: turretItem, reload: () => turrets.reload(),   // TURRET-AMMO: R mounted is the turret's
      thermal: turretThermal,                                                                                                   // LATER 97
      turret: () => turrets.mounted(),                                                                                          // LATER 165
      mountTaken: () => turrets.mountTaken(),                                                                                   // LATER 237
      commandSeq: () => openClient()?.lastSeq() ?? null,                                                                        // LATER 237
      // TRIGGER-SWAP fold: null while this part owns the trigger (mounted, its release clip, a press it keeps till let go --
      // the release's or the dance's, `triggerTaken`), else the hold's count
      heldPulls: () => (isMounted() || turrets.travelling() || triggerTaken ? null : turretHeld ? turretPulled : handedPulls),
    },
    follow: (client) => { roomEvents.follow(client); followSeek(client); },
    unlock: () => { turretLock = false; },
    followNet: () => {
      const net = d.net();
      if (net && roomEvents.following() !== net.client) { turretLock = false; roomEvents.follow(net.client); followSeek(net.client); }
    },
    turretFrame: (dt, dead) => {
      const mounted = turrets.mounted() !== null;
      if (!mounted || dead) {
        if (turretHeld && !mounted && !dead) handedPulls = turretPulled;   // TRIGGER-SWAP fold: held through the dismount
        turretHeld = false;
      }
      // OBF-31b (research 122 §14, `ROUND_SCREENS_STOP_ALL_READING`): under the round screens a held trigger is let go and
      // no press taken (`FUN_002ce9e0` D:L171877-171888, MPExitState alone ticked); the hands swallow every edge there, so
      // a trigger held into them is let go here by the turret's own release, before this frame's rounds
      if (turretHeld && (d.net()?.screenUp?.() ?? false)) trigger(false);
      if (!mounted) windUp = null;                         // LATER 532: off the mount, no take's wait to undo
      if (!turretHeld) turretPulled = 0;
      const mode = turrets.hudFireMode(), perPull = mode === null ? Infinity : roundsPerPull(mode);   // PAR-59: one a pull on SINGLE
      // LATER 180 (research 215 s8.3): a PKM or LMG TURRET (class 205, a bullet class; the MGL's 230 none, `FUN_003d1e20`)
      // under a body whose raise reads below 1 -- once lowered, its zero times keep it at 0 (`ZERO_RAISE_TIMES`).
      const item = turretItem(), lowered = item !== null && itemClass(item) === 'turret' && (d.play.weaponStats?.().raise.weight ?? 1) < 1;
      if (turretTrigger.frame(dt, turretHeld && turretPulled < perPull && !turrets.reloading(), mounted ? turretInterval(turretRecord()) : null, lowered, turrets.mountFireRefused())) {   // TURRET-AMMO: the trigger not read in ReloadDelay (FUN_005c0fd0 D:L476549-476567); LATER 191: the mount clip's NoFire, after the latch
        if (sendTurretRound()) turretPulled++;
      }
    },
    dispose: () => {
      d.win?.removeEventListener('blur', onBlur); offReload(); followSeek(null);
      if (traversal.respawnInputActive === respawnActive) traversal.respawnInputActive = previousRespawnActive;
      if (traversal.pressRespawn === respawnPress) traversal.pressRespawn = previousRespawnPress;
    },
  };
}
