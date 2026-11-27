import { seatKeptForUnload } from './seatKeep';
import type { PerspectiveCamera } from 'three';
import { DEFAULT_ARMORY_TYPE, GameFrameAccumulator, tracerKindFor, tracerRound, UNITS_PER_METRE, type AiMaps, type GameType, type Pick, type Side, type WeaponRecord } from '@s2u/scene';
import type { LoadoutRequest, PlayerLoadout } from './loadout';
import type { FireEvent, FireWeapon } from './fire';
import { FirearmWire } from './net/firearmWire';
import { ThrowWire } from './net/throwWire';
import type { EquipmentSlotState } from './equipmentSlots';
import type { KitExtras, TakenEquipment } from './takeKit';
import { NetClient, type NetOptions, type NetWalk, type Simulate, type WebSocketLike } from './net/client';
import {
  GAME_HELLO_WAIT_MS_ADAPTATION, GAME_RETOKEN_REASONS, GAME_RETOKEN_WAIT_MS_ADAPTATION, gameSeatOf, gameSeatOpen, isGameSeat, isRoomSeatOf, isSeatOf, matchSocketUrl,
  ROOM_REPASS_REASONS, roomRefusalLine, socketHost, type GameSeat, type GameSeatProvider, type Reseat, type RoomPass, type RoomSeat, type RoomSeatProvider,
} from './connectHost';
import type { DropWire, HostageStateWire, HostageWire, LoadoutRefusal, MatchStats, Rules, ScoreRow, ServerEvent, Team } from './net/protocol';
import { netEndingOf, setNetEnding, type NetEnding } from './net/netEnding';
import { RAISED_SINCE_PROTOCOL, SEAT_HOLD_MS_ADAPTATION, SERVER_CLOSING_REFUSAL, SERVER_CLOSING_RETRY_MS } from './net/protocol';
import { countdownLine, eliminationLines, MAX_ROUNDS } from './net/rules';
import { deathPose, flinchPose, type RemotePlayers } from './remotePlayers';
import { isDead, overall } from './net/damage';
import { flinchCutWindow, reloadInFlinch } from './net/flinchReload';
import type { NetRefillRule } from './net/netRefill';
import { RESPAWN_FADE_S, RESPAWN_PROMPT_S } from './net/deaths';
import { TICK_HZ } from './net/protocol';
import { pelletsOf } from './firearms';
import type { PlayClips } from './play';
import type { ScoreRowInfo } from './scoreboard';
import { botDisplayName, plainBotText } from './botPresentation';
import type { RoundScreen } from './roundScreens';
import { ENGINE_READ_S, roundScreenAt, roundScreensElapsed } from './roundPresentation';
import type { WalkMode } from './walk';
import type { OnlineStatus } from './online';
import { MESSAGE_SCALE, type CompassMark, type HudSpectatorView, type RoundInfo } from './hud';
import { killFeedLine, killFeedSubject } from './killFeed';
import { extractionPoints, hostageMarks } from './hostageMarks';
import type { RoundAudioHost } from './roundAudioHost';
import type { ObjectiveLine, RoundCues } from './roundCues';
import type { MatchGate } from './weaponExchange';
import { keyboardSite } from './keyboardTesting';
import { roundLineTakes } from './roundLineKeys';
import type { WorldState } from './worldState';
import type { Input } from './gamepad';
import type { VoiceDown } from './net/voiceWire';
import type { ScenicView } from './mapMeta';
import { cameraEye, SpectatorView, type SpectatorBody } from './spectatorView';
import { applyJoinState, type JoinSinks, type ProjectilePhase } from './joinState';
import { JoinLeaveLines } from './joinLeaveLine';
import { spectatorVoteLine, teamVoteLine, voteRowsOpen } from './spectatorVote';
import { SEAT_CLAIM_BUTTONS_ADAPTATION, SEAT_CLAIM_TAKEN_LINE_ADAPTATION, SeatClaimHold, seatClaimHeld, seatClaimLine, seatClaimOffer, seatClaimPulse, type SeatClaimDevice, type SeatClaimOffer } from './seatClaim';

/**
 * The page in a match (web sprint 3, M4-M8): the net client on the walk, the other players drawn (`./remotePlayers`),
 * their rounds' muzzles, impacts and sounds, the page's own rounds and reloads sent up, the game's kill lines in the
 * message window (research 91 section 10: "%s fragged %s with %s", "%s commits suicide with %s", "%s falls to their
 * death"), "TIME EXPIRED" and the round's clock (section 18), the scoreboard's rows. Behind `?redotcom&mp` (W3.R7).
 */

/**
 * WM-DATA (`DAMAGE_REPORT_ADAPTATION`, `match/src/room.ts`; a browser adaptation with no original -- the game shows a
 * player no damage numbers): one line of a damage report the page keeps for a later panel to draw. `id` the room's
 * (negative: a departed player, kept as it came), `name` the scoreboard's where the page knows it, else null.
 */
export interface DamageReportLine {
  id: number; name: string | null; hits: number; health: number;
  /**
   * WM-13 (`./damagePanel`): the page saw this kill -- on a `dealt` line, the page's player killed him (this round, or this
   * life for a life report); on a `taken` line, he killed the page's player. Absent otherwise (a departed player's id is
   * the room's negative one and never matches a kill the page saw).
   */
  kill?: true;
}
/** WM-DATA: a kept damage report -- the round's (`life` false) or, in a respawn room, the life just ended (`life` true). */
export interface DamageReport { round: number; life: boolean; taken: DamageReportLine[]; dealt: DamageReportLine[] }

export interface NetPageDeps {
  /**
   * PRS-888 (`./joinLeaveLine` `JOIN_LEAVE_LINE_ADAPTATION`, a browser adaptation): this browser's Join/leave lines
   * setting, read at the mount (`./matchMount`, `./main`). Absent or false, the page posts no join and no leave line --
   * the original posts none.
   */
  joinLeaveLines?: boolean;
  /**
   * LATER 359a F3 (`RESUME_RETRY_JITTER_MS_ADAPTATION`): a fast retry's random delay, ms, 0 to the bound -- the production
   * page's `Math.random() * RESUME_RETRY_JITTER_MS_ADAPTATION` (`./matchMount`); absent, none.
   */
  retryJitterMs?: () => number;
  /**
   * SHOT-LEDGER, an adaptation: a playtest instrument (B-16; it never changes the game): collect the page's own expectation
   * of each round it sends (one `RemotePlayers.aimFirst` cast and one `NetClient.notePageShot` entry) -- the `?devmode`
   * page's only (`main.ts` hands `DEV.tools`, the playtest report's own gate). Absent or false: nothing is cast or kept.
   */
  shotLedger?: boolean;
  taunt?(event: Extract<ServerEvent, { type: 'taunt' }>): void;
  communication?(event: Extract<ServerEvent, { type: 'communication' }>): void;
  /**
   * SVC-19 (web research 266 §3.4): another seat's game-session line heard in the match (the bridge's `chat`). The
   * console's receiver (`FUN_002ba9d0` D:L160117-160195, registered for the game's message at D:L159083) appends it to
   * the game lobby's panel (BCHATLISTVAR, PERMANENT) with no state test (D:L160135) and posts nothing on the HUD, so the
   * front end's match hands it to the lobby's `chatLine`; absent (`/testroom`, no lobby), it is dropped.
   */
  gameChat?(event: Extract<ServerEvent, { type: 'chat' }>): void;
  /**
   * RC-3 ROUND-CHAT (V21.R15a; a browser adaptation beside OT.R48 -- the original sends no open line in a round, research
   * 266 §3.1, §3.9): a relayed `chat` that carries `round` (RC.R2), a line the server relayed under the round's rule --
   * handed here for the HUD's message window (`./matchMessages` `roundChatPost`) and never to `gameChat`; absent, dropped.
   */
  roundChat?(event: Extract<ServerEvent, { type: 'chat' }>): void;
  /**
   * SA-43c RESTART-NOTICE, Part 2 (research 345 sections 1-2): the room's `system` event, the server's system message on
   * the game connection, handed on as heard -- the front end routes it as the original's `FUN_0030dce0` does
   * (`BriefingRoomChat.systemMessage`, Part 1's: in a round the HUD's line, kind 1); the page posts nothing itself.
   * Absent (`/testroom`, no front end), it is dropped.
   */
  systemMessage?(event: Extract<ServerEvent, { type: 'system' }>): void;
  /** Sprint 20, SVC-20b-relay: this member's own voice channel's floor entry (W20.R6); the voice client (SVC-20b-page) takes it. */
  voiceFloor?(event: Extract<ServerEvent, { type: 'voiceFloor' }>): void;
  /** Sprint 20, SVC-20b-page: a voice frame of the room's (`NetClient.onVoice`); the voice client (`./voice/voiceClient`) plays it. */
  voiceFrame?(down: VoiceDown): void;
  walk: WalkMode;
  remote: RemotePlayers;
  /** The HUD's message window and clock (`./hud`). */
  hud: {
    postMessage(text: string | { text: string; scale: number }[], scale?: number): void; setTimer(seconds: number): void; setHealth(health: number): void;
    /** OT.R59 (RECONNECT-GHOST (B)): a line held on the message window (`Hud.setNotice`), null to let it go; absent, none. */
    setNotice?(text: string | null): void;
    setScoreRows(rows: ScoreRowInfo[] | null, spectators: string[], wins?: { seal: number; terrorist: number }): void;
    setRoundScreen(screen: RoundScreen | null): void;
    /** RSP-6: release the dead/spectator help at a page close; absent on non-rendering stand-ins. */
    setSpectator?(view: HudSpectatorView | null): void;
    /** A round begins: the round start's banner, "STARTING ROUND r OF n" (`FUN_001fb420`), then the objective. */
    startRound(round: RoundInfo): void;
  };
  /**
   * RSP-6 (research 351 §3): the rendered own body's existing corpse expiry (`Play.ownCorpseExpired`), read after
   * its frame. Absent on non-rendering stand-ins: readiness remains false; there is no elapsed-time fallback.
   */
  ownCorpseExpired?(): boolean;
  /** RSP-8: additional input owner (the existing R2 inventory) for this dead press only; other menu reads are unchanged. */
  respawnInputBlocked?(): boolean;
  /** The clips (the death clips among them), once the worker has sent them. */
  clips(): PlayClips | null;
  /**
   * Another player's throw, flown on this page for its looks (`GrenadeThrower.launchRemote`); `owner` the thrower's id
   * (the `grenade` event's), whose Detonator alone sets his charges off (2026-10-02). `ageTicks` (LATER 643): the
   * event's `age`, the ticks the copy starts into its flight; passed only when the room told one.
   */
  remoteGrenade(kind: string, from: [number, number, number], velocity: [number, number, number], owner?: number, pid?: number, phase?: ProjectilePhase & { own?: boolean }, ageTicks?: number): void;
  /**
   * PF-28 (the integration review of sprint 29): whether the page flies projectiles of its own (`GrenadeThrower.ownLive`).
   * A rejoin's join envelope names the seat's own projectiles too (the room re-owns them to the new id before the
   * welcome); while the page still flies its own, those entries are skipped -- they carry no pid to replace the page's
   * copies by, and a second copy would blast twice. Absent (a page with no throwables): its own are hydrated.
   */
  ownProjectiles?(): boolean;
  /** PF-34 (research 234 s6): the world's drops (`./drops`): a `drop` placed, a `taken` removed, a welcome's set replacing all. */
  drops?: { place(d: DropWire, own?: boolean): void; remove(did: number): void; replaceAll(all: readonly DropWire[]): void } | null;
  /** PF-34: the page's own live kit after a pickup (`kit`; `./takeKit`): the loadout, the slot replaced, the rings, the slots filled. */
  kitChanged?(loadout: readonly number[], slot: 0 | 1 | null, rounds: [number[], number[]], filled?: [number[], number[]],
    /** OT.R59 (RECONNECT-GHOST): a resume's pouch by name and launcher held, as the room holds them (no refill); LATER 1129: or a take's equipment. */
    resumed?: KitExtras,
    /** The pour's amounts, slot for slot with `filled` (the `kit` event's `added`). */
    added?: [number[], number[]]): void;
  /** PF-36 (research 235 s4): the room's pid for this page's own throw or charge (`placed`; `GrenadeThrower.tagOwn`). */
  tagOwnProjectile?(kind: string, from: [number, number, number], pid: number): void;
  /** PF-36 (research 235 s4): the resting charge with this pid was damaged in the room and goes off (`detonateRemote`). */
  detonateProjectile?(pid: number): void;
  /** R4P-224: the room's `chargeGone` -- a placed charge's copy taken away with no blast (`GrenadeCore.removeRemote`). */
  removeProjectile?(pid: number): void;
  /** Research 386 §3.2 (LATER 63): a scene program's `FIRE_WEAPON` round the room set off at `at`, for its effects and sound. */
  sceneRound?(kind: string, at: [number, number, number]): void;
  /** The spectator's camera: the pose to stand the fly camera at (follow), or null to leave it free. */
  spectate(pose: { x: number; y: number; z: number; yaw: number; pitch: number } | null): void;
  /** WALL-CAM: actor follow uses the live map's shared player rig/pass (research 382 §2). */
  spectateFollow?(body: SpectatorBody, dt: number, ease?: boolean): void;
  spectateFollowReset?(): void;
  /**
   * PV-5b (the player's view, `./spectatorView` POV_VIEW_ADAPTATION; a browser adaptation, no original): draw the watched
   * body's own picture this frame (`./matchNet`); false when it cannot (PV.R6: the caller runs today's follow).
   * `spectatePovWarm`: the rig run with the pose discarded while the follow shows (nothing placed, nothing hidden);
   * `spectatePovReset`: the rig dropped, the command clock let go, the camera's near plane, offset and hide restored.
   */
  spectatePov?(body: SpectatorBody, dt: number, watched: boolean): boolean;
  spectatePovWarm?(body: SpectatorBody, dt: number, watched: boolean): void;
  spectatePovReset?(): void;
  /** PV-10a: the view drawn last frame was switched off since -- called before the frame's `bodies()` (`./matchNet`). */
  spectatePovIdle?(): void;
  /**
   * PV-6b (PV.R6): whether the page's client carries the player's view -- false on a replay recorded before protocol 16
   * (`ReplayClient.viewCarried`, `./matchNet`); absent, carried (a live `NetClient` at protocol 16 always carries it).
   */
  spectatePovCarried?(): boolean;
  /** SPECTATOR-VIEW W6 (`./spectatorView` SCENIC_ZOOM): the scenic view's magnification for the page's projection; 1 outside it. */
  spectateMagnify?(magnification: number): void;
  /** SPECTATOR-VIEW review B1: INVERT PITCH's sign for the scenic look (`DAT_003df198`: 1 off, -1 on); absent, 1. */
  spectatePitchSign?(): number;
  /** PF-31: the map's scenic views (`./spectatorView` `scenicViews(map)`), read when the spectator steps to one. */
  scenicViews?(): readonly ScenicView[];
  /** A round's effects and sound at a point (`Effects.onRound`, `GameAudio.onFire`). */
  roundEffects(e: Extract<FireEvent, { type: 'round' }>, muzzleOf: number): void;
  /**
   * INT-NET-2: the impact alone of the page's own round that the room found a body stopped (the `impact` event; the
   * PERSON material: `bullet_hit_person`, research 91 section 23) -- no muzzle, tracer or report: the page drew those.
   */
  roundImpact?(e: Extract<FireEvent, { type: 'round' }>): void;
  /**
   * The page's own mover placed by the server (a respawn, and every round's start in classic): the kit fresh as the
   * server's (`FUN_00598b90` -> `FUN_00599b60` -> `FUN_00599f00`, research 91 §4.3) -- every magazine full, the rifle
   * in the hand, the pouch refilled. Protocol 7: `kit`, the five item ids the room gave the body (its pick, R94.3).
   * Protocol 9: `char`, the character type the room rebuilt the body as (its body and kit follow it).
   */
  respawned(kit?: readonly number[] | null, char?: number | null): void;
  /**
   * The page's own death (MATCH-04): the view state to third person at once -- `FUN_00547af0` sets `body+0x200` to 0
   * (D:L413083, D:L413095) and puts the camera's projection at 1.0 (`FUN_0029b2f0`, D:L413084).
   */
  died?(): void;
  /**
   * j5t3o2iU, the page's own body hurt and alive (research 302 §10; reading, pending review): a `hurt` whose health is
   * below the last the page held and leaves the body alive (`isDead` false) -- `FUN_005477a0` (D:L412828-412838) calls
   * the controller's `+0x54`, `FUN_00597b00`, on the health's change, and its motors (`./rumble` `hurtRumble`) are not
   * behind the voice gate that `hurtVoice` is: every such hit, a bullet's, a blast's or a fall's. Absent: none.
   */
  ownHurt?(): void;
  /**
   * R4P-253 (the review's F2; a browser adaptation): the page's frame is held (`./ephPause`, PK-3) and `frame` runs no
   * game frame, so another player's shots are not queued for display but shown on arrival, as a hidden tab's are
   * (`displayIdle`). Absent: never held. NOT WIRED YET (review 2, finding 2): no page passes it (`./main`'s frame returns
   * early under PK-3 without telling the page; a filed follow-up), so only the hidden half of `displayIdle` is live.
   */
  displayHeld?(): boolean;
  /**
   * The seat's side, from the room's `welcome` (a player's) and `promoted` (2026-09-30): the page's own body follows it
   * (`./teamBody`), as the others' do (`RemotePlayers.setTeam`).
   */
  teamChanged?(team: Team): void;
  /**
   * A classic round begins: the decals of the last go. The game's round end runs CMPExitState (`FUN_00223970`), whose
   * L76084 `FUN_0031c880` ends in `FUN_003bf050(0x4b5030)` and `FUN_003bf050(0x4b5050)` (L219059-219060): both decal
   * pools emptied -- the marks and footprints, and the scorches. Never at a mid-round spawn.
   */
  newRound?(): void;
  /**
   * Repair 2 of the S3 review: the room abandoned the round (`abandoned`) -- the decals go as `newRound`'s, but the
   * room now waits, where a seat gets the ARMORY (ARMORY_SEAT_READING) and a change is taken: the screen stays open and
   * a pending change is sent, not dropped (ARMORY_ABANDON_READING). Absent: `newRound` stands in.
   */
  abandoned?(): void;
  /**
   * The two firearm slots' records (web sprint 4, `./loadout`): the page's own kit without a team; with one, the kit a
   * player of that side carries with no kit named -- SEAL 1's / TERRORIST 1's (R95.5); a named kit is `remote`'s.
   */
  weapons(team?: Team): readonly [WeaponRecord, WeaponRecord];
  /** Protocol 7: a firearm's record by item id (the kit table's), for another player's shot; null when the page has none. */
  recordOf?(id: number): WeaponRecord | null;
  /**
   * Another player's reload (`reloadSound`, 2026-10-02): the record's `ReloadSound` played at `at` (`GameAudio.onReload`;
   * REMOTE_RELOAD_SOUND_READING). Absent: the others' reloads are not heard.
   */
  reloadSound?(weapon: WeaponRecord, at: [number, number, number]): void;
  /** PF-18 (research 218 §2.1): the page's reload undone (`Fire.undoReload`) -- the room dropped it inside its own flinch. */
  undoReload?(): void;
  /** LOW-2 (research 223 s6): the room refused a reload of the page's stale -- by its journal id (`Fire.restoreReload`). */
  staleReload?(reload: number): void;
  /** LATER 72: the reload's delay window's end in commands, to the page's Fire (`Fire.setPressWindow`), as the room counts it. */
  pressWindow?(until: number): void;
  /** LOW-2: a round the room refused stale, given back to the magazine that fired it -- by its journal id (`Fire.refundRound`). */
  staleRound?(shot: number): void;
  /**
   * NET-REFILL (research 312 §5): the match's network refill rule for the page's own `Fire` (`Fire.setNetRefill`) --
   * `respawn` the room's respawn rules -- at the page's start and at each welcome; null at its close or release (no
   * match: offline) and for a page that only watches. Absent: the page's `Fire` keeps no rule.
   */
  netRefill?(rule: NetRefillRule | null): void;
  /**
   * SEAT_CLAIM_ADAPTATION (a fresh review's finding, 2026-11-25): the page cannot play a seat -- the map viewer's watcher
   * (`main.ts`'s page with the play mode off: no trigger, no lanes) -- so it is offered no claim, on its HUD or its
   * buttons: a claim would seat a body that walks and cannot fire. Absent: a page that plays (the test room's, a game's).
   */
  noSeatClaim?: boolean;
  /**
   * LOW-2: a throw the room refused stale, its item given back (the throwables' part, `./matchNet` `PART_DEPS`). LATER
   * 503: `shot`, a rocket's launch in the launcher's journal (`./rocket` `RocketLauncher.refund`).
   */
  staleThrow?(kind: string, slot?: number, shot?: number): void;
  /**
   * P2 (the online-parity sweep's TB-1; research 85 s9.5): the white-out at the level the room's gated blast resolved on
   * the page's own SEAL (`blast.flash`; `./flash` `WhiteOut.start`) -- the throwables' part (`./matchNet` `PART_DEPS`).
   */
  whiteOut?(level: 1 | 2 | 3): void;
  /**
   * ROUND_END_EFFECTS_READING (research 283 §9-§10): the effects playing stop -- every effect run but the map's ambient
   * ones, every particle, every grenade smoke -- at the engine's read, `ENGINE_READ_S` after the `roundOver`, once a
   * result (`sweepDrops`' moment): the original's round end runs `FUN_002aa910` 3 s after the result, before the round
   * screen (`FUN_002a9b30` D:L150617-150670). Absent: none (the `roundStart` clear stays the backstop).
   */
  roundEndEffects?(): void;
  /**
   * R4P-234b (`./zoom` ROUND_END_CAMERA_FOV_READING; research 84 §7.3): the page's own view drawn at zoom 1.0, its zoom
   * state kept and its steps refused till the next set-up -- at the same moment, after `roundEndEffects`: r0004's
   * mission end writes the camera's field of view at 1.0 (`FUN_0029c7f0(1.0, cam)`, D4:L159788; Q234C/Q234D, forced).
   * The moment: research 397 §3-§4 traced 0x2ac270 running at an online round's end (proven for a joiner and a
   * clock-ended classic round: about 3 s after the clock's zero, as ROUND COMPLETE comes up; the host's path, a won
   * round and the last round not measured). Absent: the view as it was.
   */
  roundEndZoom?(): void;
  /**
   * ROOM-HAND (LATER 652; the task-2 review's F1): the item in the hand now, as `handEvent` names it (`./matchThrow`
   * `handItemId`; the throwables' `netDeps`), re-told at a welcome and a resume, where the room's hand starts at null.
   */
  handItem?(): number | null;
  /** Protocol 7: the side's confirmed weapon-select picks (`./loadout` `PlayerLoadout.picks`), sent again at each seat. */
  picks?(team: Team): readonly Pick[];
  /** The server's CREATE GAME restriction, before any seat's picks are replayed (research 362 §3). */
  equipmentLimit?(limit: number): void;
  /**
   * Protocol 7: the room's answer to a `loadout` request -- the kit held for the next round, and the refusal if any.
   * Protocol 9: `char`, the character type held with it.
   */
  loadoutAnswer?(kit: readonly number[], refused: { reason: LoadoutRefusal; at: number } | null, request: LoadoutRequest | null, char?: number | null): void;
  /**
   * KIT-HELD: the room's `kitHeld` -- the side's type, the picks the room holds and their kit (`PlayerLoadout.held`).
   * Handed on only with no `loadout` request in flight: an answer still to come settles what the room holds.
   */
  kitHeld?(team: Team, char: number, picks: readonly Pick[], kit: readonly number[]): void;
  /**
   * A seat taken (the S2 review, rounds 2 and 3): a socket's welcome, a promotion. `team` the seat's side (null for a
   * spectator's welcome), `char` the type the room seated it as (the welcome's and the promotion's `char`; null from a
   * server before it): the page holds the room's type, a staging ends (`PlayerLoadout.seated`). Returns the type the page
   * had chosen when the room seated another, which the page asks for again (`stageType`), else null. Called before the
   * seat's re-send.
   */
  seated?(team: Team | null, char: number | null): number | null | void;
  /** The page's type for `side` staged for a request (`PlayerLoadout.setType(.., true)`): the ask after a seat. */
  stageType?(side: Team, type: number): boolean;
  /** A demotion (the S2 review, round 3): the seat's requests dropped, a staging ended (`PlayerLoadout.unseated`). */
  unseated?(): void;
  /**
   * Protocol 9 (web sprint 5 S2): the page's character type for each side -- the hello's (`NetOptions.types`) and each
   * `loadout` request's (`char`, the page's side's). Absent: the room's default (R95.5).
   */
  types?(): { seal: number; terrorist: number };
  /**
   * WEAPON EXCHANGE open (`./weaponExchange`): the controller's HUD mode 1 (`FUN_00597740(ctrl, 1, 0)` L88370) -- the
   * page's keys for the dead's teammate cycle and the spectator's camera do nothing (DEAD_CYCLE_WHILE_MENU_READING).
   */
  menuOpen?(): boolean;
  /**
   * Web sprint 5 S3 (W5.R1): a seat the room opens the ARMORY on (the welcome's or the promotion's `armory`: a first
   * seat, a ghost's, a waiting room's, a promotion's -- never a takeover's or a reconnect's, unless the page still shows
   * the screen; `ARMORY_SEAT_READING`) -- the screen opens before the seat's first spawn (`./armory`), which waits for
   * `armoryDone`. Called after the seat (`seated`), so the ARMORY opens on the room's type; not called when the screen
   * is open already (`armoryOpen`). The offline match's page opens it before it makes its room.
   */
  joined?(): void;
  /**
   * The round's streamed cues (INT.R7, research 124 §6 and §12): the team intro, the result line and the win music as
   * the map's `objectives` script plays them (`./roundAudioHost`, built once by the page). The room's `roundStart`,
   * `eliminated`, `timeExpired` and `roundOver` reach it as they arrive, `abandoned` and a close reset it, and the page's
   * frame runs it. Absent: the round is silent.
   */
  roundAudio?: { [K in 'roundStart' | 'eliminated' | 'timeExpired' | 'roundOver' | 'reset' | 'frame']: RoundAudioHost[K] }   // (`Pick` is the scene's here)
    // HX-5 (research 239 s6): the hostage one-shots' cues and the decided branches -- the same host's, optional on a fake.
    // LATER 155: and a welcome's decided hold, marked (`markDecided`: nothing played). LATER 131: ESCORT's in-round lines.
    & { hostage?: RoundAudioHost['hostage']; decided?: RoundAudioHost['decided']; markDecided?: RoundAudioHost['markDecided']; escort?: RoundAudioHost['escort'] };
  /**
   * PF-12 (research 192 s3.1): the map's objective lines by `player_team`, read off its `objectives` script with the
   * round's cues (`./roundCues` `RoundCues.objective`; a locale id's text filled from the map's `MPnnLOC` by the loader).
   * The round start posts the local seat's at the script's waits; absent or null (no script read): the banner alone.
   */
  objective?(): RoundCues['objective'] | null;
  /** The page opens the ARMORY on its seats (the hello's `armory`): the room holds their first spawn for it. */
  armory?: boolean;
  /**
   * The S3 repair: whether the page's ARMORY is open now. Each hello says so (`armoryOpen`), so a rejoin under the open
   * screen (a drop, a takeover) has its seat held as a first seat's (`ARMORY_SEAT_READING`); and a welcome or a
   * promotion that opens the ARMORY while it is already open calls no `joined` -- the screen stays as it is, and its own
   * close sends the `ready` (`armoryDone`).
   */
  armoryOpen?(): boolean;
  /**
   * The tab's session token (`./net/session` `PageSession`; S2 round 4): each hello's `session`, the room's key for
   * this page's record across a reload or a reconnect, and its takeover of a seat an unclean drop left behind. `renew`
   * when the room gave the seat to a newer connection of the same token (a duplicated tab): this page joins again as
   * a new joiner. Absent: hellos without one (a new joiner each time).
   */
  session?: { token(): string; renew(): string };
  /**
   * HARD-SEAT (research 169 measure 1, research 159 §1): a game's socket -- a room-service game the account holds a seat
   * in: the hello's `game` and the login's `ticket`; the socket opens `pinned` -- `pinnedMatchSocket`'s, the page's own
   * origin (measure 7), whatever URL NetPage is handed; any other refused at the construction (the review's (4)). `holds` is
   * connect's `lobby.socketHolds`: true at the accepted hello (the welcome), false at every close (research 157 §6).
   * `ended` is told once, with the dialog to show, when the seat ends for good: a close in `GAME_FINAL_CLOSES` (the
   * account's other tab took the seat, the game ended, the seat freed, the room failed) or a kick -- never retried.
   * A network drop retries as any (the server gives the account its seat back under its own room token).
   * Or (SA-6b, `GAME_DOOR_ADAPTATION`) a placed game's door (`pinnedGameDoor`) and its game `token` in place of the
   * ticket; the login bearer never goes to a door.
   * SA-6c (`GAME_RETOKEN_ADAPTATION`): with `reseat` -- the seat's one provider, the lobby's handed on -- every retry
   * awaits central's re-token before it opens (the backoff paused while it is out, one request at a time) and opens the
   * seat it answers; a refusal ends the seat as `SEAT_FREED_CLOSE` (4008) does, the signed-out path stops the retries and
   * leaves the session's own close to end the match, a failure goes back into the backoff. Without it, the seat above.
   */
  game?: GameSeat & {
    id: number; holds?(held: boolean): void; ended?(dialog: number): void;
    /** SA-6c: the seat's provider (`gameSeatProvider`, `GameLobbyHandOff.reseat`); absent, every retry reopens the seat above. */
    reseat?: GameSeatProvider;
    /**
     * ONL-18 (web research 166 §1): the game lobby's open client, handed on at the match's start (`GAME_LOBBY_MATCH_START`):
     * the page's first client is it -- no second socket, no second hello or ticket -- rebound to the match's walk, the
     * session already held by it (`holds` is told only its release), and the lobby's events so far (the welcome first)
     * replayed. A drop after it opens a new socket as any.
     */
    adopt?: { client: NetClient; events: readonly ServerEvent[] };
  };
  /**
   * SA-7h S5 (`./connectHost` `ROOM_DOOR_ADAPTATION`): a host-run standing room's seat -- the first pass's (`roomJoin`),
   * opened on its pinned door with its token; every reconnect asks `provider` a fresh pass first (the backoff paused while
   * it is out, `GAME_RETOKEN_WAIT_MS_ADAPTATION` its bound), a refused one stops the retries with its line, a failed one
   * waits the backoff -- on a reconnect a 404 or 503 too (a host restarting; the review's F2). A 4003 `no seat in that
   * room` or `not logged in` re-passes once between welcomes (F3). `session`, the session token kept for each door
   * (F4): each socket's hello carries its door's, so a pass to another host never carries this one's. Never with `game`.
   */
  room?: { seat: RoomSeat; provider: RoomSeatProvider; session?(door: string): { token(): string; renew(): string } };
  /** A socket for the tests (`NetClient`'s); the page's own `WebSocket` by default -- or the single-player room's. */
  socket?: (url: string) => WebSocketLike;
  /**
   * PT-18 (W35.R4; research 244 §1): the page's client made here instead of a `NetClient` -- the replay mode's
   * `ReplayClient` (`./replay/replayClient`), on the watcher's path -- handed the options and the walk a `NetClient` would
   * have been. The replay part's (`./matchNet` `PART_DEPS`); null or absent: the page's own `NetClient`, as before.
   * PT-19 (F2; research 244 §3): its client may carry `dtScale?()` (the replay's: 0 paused, its speed playing, 0 for a
   * seek's or a step's frame), read once a frame, the `dt` handed `remote.frame` multiplied by it; absent, 1.
   */
  client?: ((opts: NetOptions, walk: NetWalk) => NetClient) | null;
  /**
   * RE-3 (W38.R3; research 249 §4): the replay's clock, the replay mode's only: `now`, the replay's time in ms, which the
   * round timer, the launch countdown and the round screens read (`NetPage.now`); `stoppedFigure`, the timer's figure a
   * seek's welcome sets where no clock runs. Absent, the page takes its client's own (`pageClock?()`, the replay's
   * `ReplayClient.pageClock`, as PT-19's `dtScale?()` is read off it); a live `NetClient` has none, so the live page
   * runs on `performance.now` as before. A test's injection point.
   */
  replayClock?: { now(): number; stoppedFigure(): number | null };
  /** The offline match (`./net/loopback`): the panel reads "offline match", no reconnecting. */
  solo?: boolean;
  /**
   * The server is this machine's (Online = Local, `./online` `LOCAL_SERVER`; 2026-09-30): until it is first reached the
   * page retries on a short fixed wait (`LOCAL_RETRY_MS`), so it joins a few seconds after `npm start -w @s2u/central`,
   * and the panel's line says how to start it.
   */
  local?: boolean;
  /** A blast's ringing ears (`./net/blast`, `FUN_005a0e70` L459229-459235): the channels at `volume` for `seconds`, then the fade. */
  ring?(seconds: number, volume: number): void;
  /**
   * PF-10, a death's voice (`FUN_005979a0` D:L454473-454480): the kill's `cause`, the victim's side and character type
   * (both null for the page's own body: its seat's side and type are the page's own to say), and where its body is,
   * for the positional play at the actor (`FUN_005978a0` -> `FUN_0053b710`, D:L405290-405292). Called for the page's
   * own body's death (LATER 657, the `kill` case: a remote body's controller plays none) and, on the offline match's
   * page that runs the room (`solo`), for a bot's -- the AI's controller voices it on the console running it
   * (`FUN_005714b0` D:L433901-433907) -- with the bot's side, type and drawn feet. Absent: no death voice.
   */
  deathVoice?(cause: number, side: Team | null, type: number | null, at: [number, number, number] | null): void;
  /**
   * PF-10 fix round, a body's hurt voice (the room's `hurtVoice`: `FUN_00597b00`, 0x3b at 1.0 through the voice gate):
   * its side and type (both null for the page's own body) and where it is, as `deathVoice`'s. Absent: not heard.
   */
  hurtVoice?(side: Team | null, type: number | null, at: [number, number, number] | null): void;
  /**
   * HX-4a (research 239 s3; `./hostagePage` `HOSTAGE_YES_AUDIENCE_PLACEHOLDER`): an escortee's cue at its body -- the YES
   * (CHRSND 0x37, `^CO_0343` for mp_fem1-3) OnCommand cases 4 and 5 play (D:L450379, D:L450537), heard by every page
   * when the hostage's unit moves into or out of 17. The sound part's (`PART_DEPS.sound`, the wave-4 batch). Absent: not heard.
   * R4P-254: `character` is the placed character the room named for it (`HostageWire.character`, `mp_vip1` on MP82), whose
   * own `CHRSND_YES` group the sound plays; null for a hostage no welcome listed.
   */
  escorteeVoice?(id: number, cue: 'yes', at: [number, number, number] | null, character: string | null): void;
  /**
   * Protocol 10 (MAP-03; research 209 s11): the page's world (`./worldState`, on the walk's hull), which follows the
   * room's through the welcome's and the snapshots' environment (`./net/client` `applySnapshotWorld`, before the
   * correction) and is reset at each round's start. Absent or null: the room's world is followed by nothing (the
   * offline match follows its room directly, `./net/loopback`).
   */
  world?(): WorldState | null;
  /**
   * HX-1 (web sprint 31; research 237 s4, s5): a hostage's state as the room tells it (`hostageState`, on change), for
   * the `hostages` part's page module (HX-4a's `hostagePage`: the prompts, the marks). Optional; its `PART_DEPS` line is
   * the wave-4 batch's (HX-4a). Absent: the page keeps its own hostage map only (`NetPage.hostages`).
   */
  hostageState?(ev: Extract<ServerEvent, { type: 'hostageState' }>): void;
}

/** A departed thrower's name the server kept on an `orphan` kill (`killerName`); null on every other kill. */
function keptName(ev: Extract<ServerEvent, { type: 'kill' }>): string | null {
  const name = (ev as { killerName?: unknown }).killerName;
  return typeof name === 'string' ? name : null;
}

/**
 * DEAD_CYCLE_WHILE_MENU_READING: whether the dead's teammate cycle runs while WEAPON EXCHANGE is open. The menu sets the
 * controller's HUD mode 1 (`FUN_00597740(ctrl, 1, 0)` L88370), and mode != 0 blocks the respawn press (`FUN_00592560`
 * L451673-451675) and the spectator camera's buttons (`FUN_00295260` L139475); the cycle itself under mode 1 was not
 * traced (`FUN_005979a0` L454440-454500 reads no input) -- taken as blocked too [inferred] (research 94 §B3). The dead's
 * lines themselves are WEAPON EXCHANGE's prompt (`./weaponSelect` `promptLines`), drawn by the page's HUD overlay.
 */
export const DEAD_CYCLE_WHILE_MENU_READING = 'blocked' as const;

/**
 * KILL_AUTOCOMM_READING (PF-10, 2026-10-04; research 179 §6.14 corrected, research 91 §10): after a kill line the game
 * routes an automatic radio comm -- for a victim other than the local player, 0x27 (`CMD_MP_ENEMY_DEAD`) said by the
 * killer when the victim shares no team bit with the local player, else 0x28 (`CMD_MP_FRIEND_DEAD`) said by the victim
 * (`FUN_00547860` D:L412893-412909, `FUN_005e7f20`) -- and `FUN_005e7960` (D:L498028-498236) looks the comm up in the
 * speaker's own character's `multiplayer` list (`FUN_0053bbd0`, the record's `+0x3a0`, copied from its base at
 * D:L406773-406793). No character of `character.rdr` lists 0x27 or 0x28 (the `orders.rdr` table naming "%s : Enemy
 * Killed" / "%s : Man down" and `SND_ENEMY_DEAD` / `SND_FRIEND_DEAD` is not that list), so the row is not found, the
 * line formats empty (0x662798), its length 0 (`FUN_00199288`, D:L498217) posts nothing and no sound is looked up: the
 * page posts the kill line alone. The reading is the list `FUN_005e7960` walks; the console's own frames would prove it.
 */
export const KILL_AUTOCOMM_READING = 'none: no character lists comm 0x27 or 0x28' as const;

/**
 * REMOTE_RELOAD_SOUND_READING (2026-10-02, research 91 section 22.2; ported from Chris's browser-beta-v5, d578f347): the
 * others hear a player's reload. `FUN_005c2a90` plays the weapon's `ReloadSound` (`+0x98`) at the actor (`+0x1c`) as it
 * takes the magazine (477484-477537), inside the kit's frame (`FUN_005c0fd0`), which the actor update calls with no
 * test of the controller's locality (`FUN_005506a0` L417907; its one gate, the actor's `+0xf40` byte, L417822, unread).
 * How the reload reaches a remote actor's kit is not traced: the pad's request (`FUN_00594cf0` L453459-453463) reads
 * the local pad, the automatic one (`FUN_005c5340` L479316-479341) runs in the fire path, and the reload's motion is not
 * sent as the flinch's is (`FUN_005a82e0` starts it with `FUN_00588bc0` and no `FUN_00588ab0`). The room tells the other pages at the moment it takes the magazine (`reloadSound`)
 * and they play the sound at the body; the bolt's and pump's after-shot sound (`FUN_005c3000`) is not sent.
 */
export const REMOTE_RELOAD_SOUND_READING = 'room event at the take' as const;

/**
 * REMOTE_RELOAD_MOTION_READING (REMOTE-RELOAD, 2026-11-09; research 91 section 22.2, research 179's
 * REMOTE_RELOAD_SOUND_READING row): the others see a player's reload. `FUN_005c2a90` starts the reload's motion
 * (`FUN_005a82e0`, D:L477479) and plays the `ReloadSound` (D:L477484) in one step, so where the sound is heard the clip
 * is drawn; and the owner watched the original show another player's reload (Craig, 2026-11-09 ~20:55Z, a playtest
 * observation of the original running, not a capture: "the original does show reloads"), which settles research 179's
 * open "a manual reload may have no sender" in favour of one. What the original's wire carries for it is still unread
 * (the copy's record replay `FUN_002be150` calls no reload starter; the two-console capture, research 206 item 18 --
 * B's audio and B's view of A's body through the reload -- settles it). The room's `reloadSound` at the take carries the posture, moving, family and seconds its lock was set
 * from, and the page starts that body's clip (`RemotePlayers.reload`, `Play.remoteReload`). A reload under way at a
 * join or a replay seek is not caught up (the event is transient, `replay/fold.ts`); a turret's reload, a reload cut at
 * a worded take and the bolt's or pump's after-shot clip (LATER 810) send no take; a knock does not end the copy's
 * clip (LATER 811). RELOAD-HITPOSE F1 (ONE-CLOCK; a BROWSER ADAPTATION -- the page's interpolation delay has no original): the event comes
 * about one interpolation delay before the page draws the body at the take, and the room's poser is judged at the
 * shooter's drawn tick (`room.ts` `drawnPastOf`), so the clip starts on the DRAWN clock -- the event stamped with the
 * newest snapshot tick in hand when it came (`NetClient.heardTick`, as `markSpawn`), released once the drawn tick
 * (`NetClient.shownTick`) passes it and run on by the ticks past it (`RemotePlayers.frame`); a flinch's and a kill's end
 * of the clip likewise, in order. The residual: the phase within about -1 to +2 ticks of the room's judged pose, a mean
 * lead of about half a tick (the room's whole-snapshot staircase against this continuous drawn clock); the start and end
 * edges aligned. Was: started at the event, drawn 4.3-4.9 ticks ahead of the room's judged pose.
 */
export const REMOTE_RELOAD_MOTION_READING = 'room event at the take' as const;

/**
 * OWN_BLOOD_READING (INT-NET-2, 2026-10-02, research 91 section 23): the blood of the page's own round on a body is played
 * when the room's `shot` comes back, a round trip after the round. The original's console walks its own round at once
 * (`FUN_003c9b70` -> `FUN_003c8920`, the impact L319497-319500, in the round's tick), so its shooter sees the blood
 * at the shot; here the room alone knows the bodies where the shooter saw them (the rewind), and the page never
 * predicts a hit (Chris's rule, his browser-beta-v5, d578f347). The others' pages see it as the original's do: when
 * the round reaches them.
 */
export const OWN_BLOOD_READING = 'the room\'s shot, a round trip after' as const;

/**
 * `?mp` turns the match on; `?server=wss://host/ws` names the server (the page's own host at `/ws` by default). With
 * `bearer` -- a socket whose hello carries the login's ticket -- the URL is the page's own origin's whatever `server=`
 * says (`matchSocketUrl`, research 169 measure 7), `server=` only under `?devmode` on a development build; without it
 * (the maps' rooms, `/testroom`, development) `server=` is honoured as before.
 */
export function netSettings(
  search: string, location: { protocol: string; host: string; origin?: string }, bearer?: { devBuild: boolean },
): { url: string; simulate?: Simulate } | null {
  const q = new URLSearchParams(search);
  if (!q.has('mp') && !q.has('server')) return null;
  const url = bearer ? matchSocketUrl(search, location, bearer.devBuild) : q.get('server') || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  const lag = Number(q.get('lag') ?? '0'), loss = Number(q.get('loss') ?? '0');
  return { url, ...(lag > 0 || loss > 0 ? { simulate: { latencyMs: lag, jitterMs: lag / 5, loss: loss / 100 } } : {}) };
}

/**
 * TRACER_REMOTE_COUNT_READING (research 89 §19; #425's review): another player's every-fourth tracer round is counted on
 * the shots of that player this page has seen this round (`NetPage.tracerRounds`). The original counts the shooter's own
 * round number `+0xb8` (`FUN_003cabe0` D:L320537-320553); whether another console sees that number or counts its own is
 * unread. [reading]
 */
export const TRACER_REMOTE_COUNT_READING = 'the shots this page saw this round' as const;

/**
 * REMOTE_SHOT_QUEUE_CAP_READING (R4P-253, research 193 §13; reading, pending review): the most of another player's shots
 * the page holds back for display. The original carries no shot on the wire, only a fire counter (the SealObject's
 * `+0x8b`, body `+0x220`): IncrementalUpdateRemoteSeal `FUN_002be150` adds the byte's change to the copy's count
 * `+0x224` and clamps the sum to 1..10 (D:L162443-162455) -- a saturating clamp: shots past ten in the count are lost,
 * never shown later. One unit is a PULL, not a ray: `FUN_002bbf10` bumps the byte only on a pull's first pellet (the
 * kit's `+0x880` 0, D:L479495). The room's one `shot` event per ray is the port's own transport (an adaptation of the
 * wire, not of behaviour; the controller's ruling, R4P-253): the page groups a pull's rays into one entry (`queueShot`),
 * so the floor of 1 is never reached (it stands for a byte that wrapped), and a pull arriving while ten wait is dropped
 * with its rays -- no muzzle, tracer, impact or report. Which ten is the port's: the count has no paths, so the first
 * ten pulls the room sent are the ones kept. The damage is the room's (`hurt`, `kill`) and is not queued. [reading]
 */
export const REMOTE_SHOT_QUEUE_CAP_READING = 10;

/**
 * REMOTE_SHOT_DRAIN_PER_TICK_READING (R4P-253, research 193 §13; reading, pending review): another player's waiting
 * shots shown a game frame. CRemoteCtrl::PreTick `FUN_005e6400`, while the count `+0x224` is nonzero, takes one and
 * fires the copy's kit once (`FUN_005c6510` -> CZKit::Fire `FUN_005c5340`, D:L497481-497495): one a tick. The tick is the
 * page's game frame (`GAME_FRAME_DT` of `@s2u/scene`, 525/15734 s, run through a `GameFrameAccumulator` on the frame's
 * `dt` times the replay's scale) -- not the room's 60 Hz `TICK_HZ` and not the page's draw frame. The fire's report is
 * made inside the kit's fire, so the sound is shown with the shot, as before, at its display: CZKit::Fire calls
 * `FUN_003d2c50` (the close/medium/far pick by the listener's distance; research 81) only when the round's item differs
 * from the weapon's (the test at D:L479449, the call D:L479450), and the weapon's own fire is a virtual call of the
 * same function (D:L479493-479494; its target, which research 81's `FUN_003d2d70` distance pick suggests, not resolved
 * here). A count unit is a pull (`FUN_002bbf10` on the first pellet, D:L479495), so one report a pull. [reading]
 */
export const REMOTE_SHOT_DRAIN_PER_TICK_READING = 1;

export function fireWeaponOf(r: WeaponRecord): FireWeapon {
  const s = r.sounds;
  return { name: r.name, id: r.id, range: r.maximumRange * UNITS_PER_METRE, fireAnim: r.fireAnim ?? null, sounds: s ? { ...s } : { close: null, med: null, far: null, reload: null } };   // #425: the tracer's range
}

/**
 * The game's kill line (research 91 section 10), the names already resolved. `orphan` (review 2, m-13): a grenade whose
 * thrower left before its fuse ran out -- the server scores it as no one's and keeps the thrower's name
 * (`killerName`), so the line is the thrower's "fragged", never the victim's suicide. WM-DATA-FEED: the page posts it in
 * pieces (`./killFeed` `killFeedLine`, whose text a test holds equal to this one's for every branch).
 */
export function killLine(how: Extract<ServerEvent, { type: 'kill' }>['how'] | 'orphan', killer: string | null, victim: string, weapon: string | null): string {
  if (how === 'fall') return `${victim} falls to their death`;
  if (how === 'orphan') return `${killer ?? ''} fragged ${victim} with ${weapon ?? ''}`.trim();
  if (how === 'suicide' || killer === null || killer === victim) return `${victim} commits suicide with ${weapon ?? ''}`.trimEnd();
  return `${killer} fragged ${victim} with ${weapon ?? ''}`.trimEnd();
}

/**
 * The queue's line in the message window. QUEUE_TEXT_PLACEHOLDER: the game has no queue (its 17th joiner is refused,
 * research 91 section 7); the words are the viewer's, in the game's message style.
 */
export function queueLine(position: number): string {
  return `SPECTATING: YOU ARE NUMBER ${position} IN LINE`;
}

/**
 * The wait before the next attempt to join, ms. After a match was reached (PT195-4, LATER 329): at once, then -- LATER
 * 359, the owner's design (2026-11-18, relayed by the main controller: the page "retries every 1-2 s for ~25 s") --
 * `RESUME_FAST_RETRY_MS_ADAPTATION` apart for `RESUME_FAST_RETRIES_ADAPTATION` attempts (24 s), so a short drop resumes
 * inside the body's 20 s hold (match `room.ts` `RECONNECT_ALIVE_WINDOW_MS_ADAPTATION`); then 10 s apart, as before, to
 * the seat's hold (`RESUME_GIVE_UP_MS_ADAPTATION`). To a server never reached, 2, 4, 8 ... 60 s. The at-once attempt is
 * taken once in `QUICK_RECONNECT_WINDOW_MS_ADAPTATION` (`dropRetry`).
 */
export function retryDelayMs(attempts: number, reached: boolean, local = false): number {
  if (local && !reached) return LOCAL_RETRY_MS;
  if (!reached) return Math.min(60_000, 2000 * 2 ** attempts);
  if (attempts <= 0) return 0;
  if (attempts <= RESUME_FAST_RETRIES_ADAPTATION) return RESUME_FAST_RETRY_MS_ADAPTATION;
  return 10_000;
}

/** LATER 359 (a browser adaptation): the fast retries' spacing after a reached match's drop, ms ("every 1-2 s"). */
export const RESUME_FAST_RETRY_MS_ADAPTATION = 1500;
/** LATER 359: how many fast retries, 16 x 1.5 s = 24 s ("for ~25 s"); then the 10 s steps. */
export const RESUME_FAST_RETRIES_ADAPTATION = 16;

/**
 * RESUME_ATTEMPT_WAIT_MS_ADAPTATION (LATER 359a, the review's F2, folded on the main controller's word; a browser
 * adaptation): during the fast retries after a reached match's drop, the longest one attempt waits -- its re-token (the
 * page-side bound, in place of `GAME_RETOKEN_WAIT_MS_ADAPTATION`'s 10 s) and its socket's welcome (in place of
 * `GAME_HELLO_WAIT_MS_ADAPTATION`'s 30 s), ms. On a link that drops packets with no close, a request asked during the
 * outage never answers; at 10 s / 30 s one such attempt could outlast the body's 20 s hold, so a link back at 15-18 s
 * missed the owner's "back within ~20 s resumes". Past the fast retries the longer waits stand.
 */
export const RESUME_ATTEMPT_WAIT_MS_ADAPTATION = 3_000;

/**
 * RESUME_RETRY_JITTER_MS_ADAPTATION (LATER 359a, the review's F3, the main controller's word; a browser adaptation): the
 * most a fast retry is put off at random, ms, so a whole room's pages given up by one server stall (the 4 s silence) do
 * not all ask in the same instant. The production page draws it (`NetPageDeps.retryJitterMs`, `./matchMount`); without
 * the dep, none (the tests' timings exact).
 */
export const RESUME_RETRY_JITTER_MS_ADAPTATION = 500;

/**
 * When the next attempt is due. `0` is the unset sentinel (`reconnect.at`, `retryAt`), so a wait of 0 read at clock 0
 * is still due on the next frame rather than scheduled again forever.
 */
export function retryDueAt(now: number, delayMs: number): number {
  const at = now + delayMs;
  return at === 0 ? Number.MIN_VALUE : at;
}

/**
 * QUICK_RECONNECT_WINDOW_MS_ADAPTATION (PT195-4, the takeover review's F4; a browser adaptation, no game value -- the
 * game has no reconnect): a reached match's at-once reconnect is taken once in this window, ms. A welcome sets the
 * backoff's count back to 0, so a server that welcomes and then drops would otherwise be rejoined at once each time, a
 * tight loop; inside the window a drop's first wait is the backoff's next step, 1.5 s (`retryDelayMs(1, true)`; LATER 359).
 */
export const QUICK_RECONNECT_WINDOW_MS_ADAPTATION = 10_000;

/**
 * LINK_SILENCE_MS_ADAPTATION (NET-RES.R9, OT.R77; a browser adaptation, no game value): a welcomed socket the server
 * has sent nothing on for this long is given up -- closed with no `bye`, so the room holds the seat (NET-RES.R7) -- and
 * the retry taken, ms. The server sends 30 snapshots a second in a round and answers the page's ping each 2 s, so 4 s
 * of nothing (two pings unanswered) is a dead link, which the browser's TCP may otherwise sit on for minutes before it
 * closes the socket. LATER 359 (the owner's design, 2026-11-18: the page notices the silence "in 3-5 s"): 4 s, was 10 s.
 */
export const LINK_SILENCE_MS_ADAPTATION = 4_000;

/**
 * RESUME_GIVE_UP_MS_ADAPTATION (NET-RES.R9): how long after a reached match's drop the page goes on retrying, ms -- the
 * room's hold (`SEAT_HOLD_MS_ADAPTATION`) and one backoff step (10 s) more; past it the seat ends (#365 until NET-RES-3
 * names the case). A browser adaptation.
 */
export const RESUME_GIVE_UP_MS_ADAPTATION = SEAT_HOLD_MS_ADAPTATION + 10_000;

/**
 * A drop's first wait, ms, and the at-once reconnect's time to keep (`quickAt`, the page's clock; -Infinity before
 * any): `retryDelayMs`, except that the at-once attempt is taken only once in `QUICK_RECONNECT_WINDOW_MS_ADAPTATION`;
 * inside it, the 1.5 s step (LATER 359).
 */
export function dropRetry(attempts: number, reached: boolean, now: number, quickAt: number, local = false): { delayMs: number; quickAt: number } {
  const delayMs = retryDelayMs(attempts, reached, local);
  if (delayMs !== 0) return { delayMs, quickAt };
  if (now - quickAt < QUICK_RECONNECT_WINDOW_MS_ADAPTATION) return { delayMs: retryDelayMs(1, reached, local), quickAt };
  return { delayMs: 0, quickAt: now };
}

/**
 * The wait between attempts to a local server never reached (2026-09-30, the owner's play test: 8787 was down and the
 * page's 2, 4 ... 60 s backoff kept it away long after the server came up): a fixed 3 s -- the page's own choice, the
 * original has no such server. A local socket refused costs nothing, so the attempts need not thin out.
 */
export const LOCAL_RETRY_MS = 3000;


/**
 * The line a classic room waiting for both sides shows (2026-09-30): the original's lobby line for the same state,
 * "There must be players on both teams to launch" (`FUN_002c3cf0` L165325-165352, UIMnLOC 350 / 356; research 91
 * section 7). [reading: the original shows it in the lobby, whose launch it refuses; the page's waiting room
 * (`CLASSIC_WAITING_PLACEHOLDER`) is where the lobby would be, so the page posts it there, in place of the round's banner.]
 */
export const WAITING_LINE_READING = 'There must be players on both teams to launch';

/**
 * Two `countdown`s whose launch times lie within this of each other are the same countdown told twice (a welcome's,
 * then the room's broadcast): the page's own tolerance -- a socket's delivery jitter, well under the second the line
 * counts in -- so "GAME STARTS IN 10 SECONDS" is posted once (`NetPage.countdown`, the sprint-5 fix).
 */
export const COUNTDOWN_SAME_MS = 1000;

/**
 * REPLACED_LINE_READING (research 95 §8): the line a page posts when the room gave its seat to a newer connection of its
 * session token (a duplicated tab; `kicked` 'replaced') before it joins again as a new joiner. The game has no such
 * case (a departure is a leave, research 91 §17) and UIMnLOC no string for it: the viewer's words, in the message
 * window's style, in place of the lost connection's "CONNECTION LOST. RECONNECTING. . .".
 */
export const REPLACED_LINE_READING = 'OPENED IN ANOTHER WINDOW -- REJOINING';

/**
 * RECONNECT_GHOST_LINE_ADAPTATION (OT.R59, RECONNECT-GHOST (B); a labelled adaptation, no original -- the game has no
 * reconnect): the line a page holds on the message window (`Hud.setNotice`) when its own rejoin, past the room's window
 * (server `RECONNECT_ALIVE_WINDOW_MS_ADAPTATION`), was seated a ghost in a classic round in play -- until its next spawn,
 * its close, or a welcome that seats it otherwise. The viewer's words in the message window's style, as `REPLACED_LINE_READING`.
 */
export const RECONNECT_GHOST_LINE_ADAPTATION = 'RECONNECTED -- OUT UNTIL THE NEXT ROUND';

/**
 * HARD-SEAT: the closes that end a game's seat for good (`NetPageDeps.game`), never retried: 4006 the account's newer
 * socket took the seat (`SESSION_REPLACED_CLOSE`; two tabs would otherwise take it from each other for ever, the bridge
 * review's N-1), 4007 the game ended and 4008 the seat freed (the server's `GAME_ENDED_CLOSE`, `SEAT_FREED_CLOSE`),
 * 1011 the room itself failed (`stepRoom`; its game ended with it). A hello the server failed to answer closes 4010
 * (`JOIN_FAILED_CLOSE`), not 1011: the game may live, so it is retried as a drop. The transport's codes, ours.
 */
/** OBF-4: 4022 too (`SERVER_UPDATE_CLOSE`, the host's update at the match's end; an adaptation): never retried. */
export const GAME_FINAL_CLOSES: ReadonlySet<number> = new Set([4006, 4007, 4008, 1011, 4022]);

/**
 * The dialog a game's seat ended for good by the server shows (`GAME_FINAL_CLOSES` but 4007; a kick that is not a
 * vote): UIMnLOC 365 `_365_BeenDisconnected_MSG` "You have been disconnected from SOCOM Online.", the lobby's only
 * network-loss message (`MP_MEDIUS_ERROR -> OnNetError`). The original has no idle or lag kick, so a server's own kick
 * or limit close is a disconnect, not #539. The research wave's reading (card C7, `C7-audio-movie.md` §1.1, its
 * `FUN_`/`D:L` cites; cross-checked by C8, 2026-10-04), not re-read here. [reading]
 */
export const GAME_SOCKET_CLOSED_DIALOG_READING = 365;

/**
 * The dialog a game ended under the seat shows (4007, `GAME_ENDED_CLOSE`: the room service ended it -- its seats gone,
 * a side emptied with fewer than three players left, or its host gone before the launch -- or a leave left fewer than
 * three players, `ABANDON_BELOW_PLAYERS_READING`, while this seat is a late one not yet loaded, server
 * `ABANDON_LATE_JOINER_READING` (was: "fewer than three players left", for every seat; NU-17, 2026-10-15: only a late
 * seat not yet loaded, `FUN_002bc530` D:L161137-161141)): UIMnLOC 528
 * `_528_AllPlayersLeft_MSG`, `dlgNetAbandoned.rdr`'s popup (`FUN_002bc530` D:L161109-161146 among its three paths).
 * The research wave's reading (card C7 §1.1; C8); the host-gone case shares it unread. Not #529, which is the version
 * error's (`dlgNetAbort.rdr`). [reading]
 */
export const GAME_ENDED_DIALOG_READING = 528;

/**
 * LEAD_ONCE_READING (HX-5; research 239 s6): MP6's Lead1-3 are one-shots -- `WHILE forever: IF ai::INSTATE(HostageN, 9):
 * ^PH_0006, "A HOSTAGE IS BEING ESCORTED", STOP_SEQUENCE` (the fixture's `objectives`, 2026-10-06) -- so a hostage's
 * first state 9 of a round posts the line and plays the stream, and no later one; Rescue1-3 the same on its first 0x11
 * (the page's stand-in for the script's INREGION: `RESCUE_VALVE_READING`). Armed again at `roundStart` (the level's
 * reload restarts the sequences). [reading]
 */
export const LEAD_ONCE_READING = 'once per hostage a round';

/**
 * PF-27 (ruling PF.R48; research 231 s5): the line `/testroom` posts on the room's `abandoned` -- UIMnLOC 528
 * `_528_AllPlayersLeft_MSG`, the text `dlgNetAbandoned.rdr`'s ONSTART pops (`POPUPDIALOG` #528 after
 * `DisconnectFromGameServer`, then `ReturnToWorldOfSOCOM`; research 193 s12.7, `tools/test/onlineDialogs.pinned.json`
 * L12408-12450). A game ends on the dialog itself (`GAME_ENDED_DIALOG_READING`); `/testroom` has no dialog runtime, so
 * the page posts the string, the literal with its id (the page holds no UIMnLOC text table). Never "ABANDONED": no
 * such line exists in the original. [reading]
 */
export const ABANDON_LINE_READING = 'All players left the game before you were able to join. Please try again.';

/**
 * The dialog a vote kick from a game shows: UIMnLOC 539 `_539_YouveBeenKicked_MSG`, with 541 and 540, 4 s on
 * `dlgNetBanned.rdr` -- the original's only kick, the team-majority vote at the round-end screen (`FUN_002c3550`
 * D:L164913-165086). Reserved for that vote kick (`kicked` 'vote'); any other kick is #365. The research wave's
 * reading (card C7 §1.1; C8). [reading]
 */
export const GAME_KICKED_DIALOG_READING = 539;

/**
 * LATER 1242 (LATER 896's fresh review, F2): the seat kept for THIS pagehide -- pressed, and not a pagehide into the
 * back/forward cache (`persisted`: the page may come back, so it goes as any page does, its bye said). Read from the
 * event, not `seatKeptInThisUnload`: `onPageHideBye` is a capture listener added at the page's start, before
 * `./seatKeep`'s own (added at the press), so it runs before the unloading latch is set (`onPageHide`, a bubble
 * listener, runs after it; the event reads the same for both).
 */
function keptThisPageHide(e: Event | undefined): boolean {
  return seatKeptForUnload() && (e as PageTransitionEvent | undefined)?.persisted !== true;
}

/** R4P-253: another player's ray, as the room sends it (one `shot` a ray). */
type RemoteShot = Extract<ServerEvent, { type: 'shot' }>;

/**
 * R4P-253 (the review's F1): one pull of another player -- the copy's one count unit (`FUN_002bbf10` on its first
 * pellet, D:L479495) -- and its rays as they arrive: waiting in the queue, shown, or dropped past the clamp.
 */
interface ShotPull {
  weapon: number;
  from: readonly number[];
  pellets: number;
  rays: RemoteShot[];
  tick: number;
  state: 'waiting' | 'shown' | 'dropped';
}

/** R4P-253: two points equal component for component (one command's muzzle, as the room copies the page's `from`). */
function sameV3(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** R4P-253 (F2): the page's document, where there is one (a test without a DOM has none). */
function shotDocument(): { readonly hidden: Document['hidden']; addEventListener: Document['addEventListener']; removeEventListener: Document['removeEventListener'] } | undefined {   // not `Pick<>`: this file imports the scene's `Pick` type
  return (globalThis as { document?: Document }).document;
}

export class NetPage {
  client: NetClient;
  private readonly names = new Map<number, string>();
  /** Authored bot presentation follows trusted seat metadata, independently of callsigns and regional appearances. */
  private readonly bots = new Set<number>();
  private readonly teams = new Map<number, Team>();
  /** Another player's rounds this round, from 1 (the tracer's count, `tracerRound`; `TRACER_REMOTE_COUNT_READING`). Cleared with the round. */
  private readonly tracerRounds = new Map<number, number>();
  /**
   * R4P-253: another player's shots waiting to be shown, by shooter, at most `REMOTE_SHOT_QUEUE_CAP_READING` each (the
   * copy's count `+0x224`), drained `REMOTE_SHOT_DRAIN_PER_TICK_READING` a game frame by `frame` (`shotTicks`). Display only.
   */
  private readonly remoteShots = new Map<number, ShotPull[]>();
  /** R4P-253 (the review's F1): each shooter's newest pull, which the next ray of the same pull joins (`queueShot`). */
  private readonly openPulls = new Map<number, ShotPull>();
  /** R4P-253: the game frames the shot queue has drained (`drainShots`), the age a pull's rays are joined within. */
  private shotTick = 0;
  /** R4P-253 (the review's F2): on a hide, the shots still waiting shown at once (`flushShots`). */
  private readonly onShotVisibility = (): void => { if (this.displayIdle()) this.flushShots(); };
  /** R4P-253: the game frames the shot queue drains on (`GAME_FRAME_DT`; CRemoteCtrl::PreTick's once a tick). */
  private readonly shotTicks = new GameFrameAccumulator();
  /** HX-4a: each hostage's last unit told (`welcome.hostages`, `hostageState`), for the YES on a move into or out of 17; forgotten at a round's start. */
  private readonly escorteeUnits = new Map<number, number>();
  /** The round's end, in the page's clock's ms (`now`), or null between rounds. */
  private endsAt: number | null = null;
  /**
   * HX-1 (research 237 s4): EXTRACTION's hostages as the room tells them -- the welcome's list (`hostages`), then each
   * `hostageState` and a hostage's `kill`. Their bodies are the snapshot's (the shared `remote`), by these ids.
   */
  private readonly hostageMap = new Map<number, HostageWire | HostageStateWire>();
  /** HX-5: the hostages whose Lead (state 9) and Rescue (0x11) lines this round has posted (`LEAD_ONCE_READING`). */
  private readonly hostageSaid = { lead: new Set<number>(), rescued: new Set<number>() };
  /** HX-5: the extraction marks' points, kept for the map's AI maps they were read off (`hostageMarks`). */
  private zonesOf: { ai: AiMaps | null | undefined; points: [number, number, number][] } = { ai: null, points: [] };
  /** HX-5: the message window's post, as the round's audio hands a script line to it (`RoundAudio`'s `post`). */
  private readonly post = (text: string, scale: number): void => { this.deps.hud.postMessage(text, scale); };
  /** JOIN-LEAVE-LINE (a browser adaptation, `./joinLeaveLine`): a human player's join and leave, a line each on the message window. */
  private readonly joinLeave = new JoinLeaveLines((text) => { if (this.deps.joinLeaveLines === true) this.deps.hud.postMessage(text); });   // PRS-888: off, none
  /**
   * JOIN-LEAVE-LINE: whether the match is on, as the room tells the page -- its first round has started (a welcome's
   * `phase` past `waiting` and `loading`, or an older room's `startTick`; `roundStart`) and its last has not ended (a
   * `roundOver` with `matchOver`), nor the room gone back to waiting (`abandoned`; a launch `countdown`, which only a
   * waiting room sends). Only a join while it is on posts a line. PRS-888: a welcome in `over` (the end screens) is not
   * on -- it carries no `matchOver`, so a match's end reads as `roundOver`'s does, and the next `roundStart` turns it on.
   */
  private matchOn = false;
  /**
   * The owner's launch countdown (`./net/rules` `OWNER_LAUNCH_COUNTDOWN_S`, 2026-10-01): when the first round starts, in
   * the page's clock's ms (`now`), or null when none runs -- the HUD's clock counts it down (`frame`).
   */
  private launchAt: number | null = null;
  /** The last round's length (the room's `roundStart`; the create-game default until one): the clock a cancelled countdown leaves. */
  private roundSeconds = 6 * 60;
  /**
   * LATER 152 (LATER 148's review, finding 4; the page's own figure): the round's length as its `roundStart` named it --
   * what a called-off launch countdown shows; `roundSeconds` is the clock's total, which `roundTime` moves (a minute off,
   * a plant's fuse).
   */
  private roundLength = 6 * 60;
  /**
   * The room waits for both sides, or counts down to its first round (the welcome's and the promotion's `waiting` or
   * `countdown`, an abandon, the `countdown` events), until a round starts. The page's seat walks there, and the
   * Inventory button opens the ARMORY (`waitingRoom`; owner ruling, 2026-10-01).
   */
  private roomWaits = false;
  /** The match server's name, the welcome's (`server`; null before one, or from an older server): ARMORY_SERVER_NAME_READING. */
  private server: string | null = null;
  rows: ScoreRow[] = [];
  /**
   * WM-DATA (`DAMAGE_REPORT_ADAPTATION`): the latest round report (cleared at the next round's start) and the latest
   * life report (`life: true`; cleared at the page's own spawn or the next round's start), as they came, beside the
   * names the scoreboard held at their arrival (`damageReports` resolves those first: an id is reused).
   */
  private roundDamage: { ev: Extract<ServerEvent, { type: 'damageReport' }>; names: Map<number, string> } | null = null;
  private lifeDamage: { ev: Extract<ServerEvent, { type: 'damageReport' }>; names: Map<number, string> } | null = null;
  /**
   * WM-DATA-WIN (`DAMAGE_REPORT_AT_WIN_REASONS`, the room's; WM.R24): a round report came before the round's result --
   * the room's send at a win's decision -- so the damage window is open from it through the hold (`damageWindow`).
   * Cleared at the next round's start, `abandoned`, a (re)join's welcome and the page's close.
   */
  private damageAtWin = false;
  /**
   * WM-13 (`./damagePanel`, a browser adaptation): the kills the page saw that involve its player -- this round's and this
   * life's (since his own spawn) -- for the panel's KILL / KILLED YOU marks. Cleared with the reports.
   */
  private damageKills = { round: { mine: new Set<number>(), me: new Set<number>() }, life: { mine: new Set<number>(), me: new Set<number>() } };
  /** The page's own death edge (ms), and whether the current round still owns that death's help. */
  private dead: { at: number; help: boolean; atLoad?: true } | null = null;
  /** j5t3o2iU: the page's own body's health as its last `hurt`, spawn or resume left it (`overall`; 1 whole). */
  private ownHealth = 1;
  /** R4P-248: the own body's health drops that left it alive (`ownHurt`'s), counted from this page's start (`ownHurts`). */
  private ownHurts_ = 0;
  /** Shared command ordering and rollback; independent of this page's renderer. */
  private readonly firearmWire = new FirearmWire({
    client: () => this.client, sidearmId: () => this.deps.weapons()[1].id,
    pressWindow: until => this.deps.pressWindow?.(until),
    staleRound: shot => this.deps.staleRound?.(shot),
    staleReload: reload => this.deps.staleReload?.(reload),
    // SHOT-LEDGER, an adaptation: a playtest instrument (B-16; it never changes the game) -- each round sent, the page's own
    // expectation from its cast on the drawn bodies (`RemotePlayers.aimFirst`), kept by the client for the playtest report;
    // a `?devmode` page's only (`shotLedger`): without it nothing is cast or kept.
    sentRound: (seq, from, dir, reach) => {
      if (!this.deps.shotLedger) return;
      const hit = this.deps.remote.aimFirst?.(from, dir, reach) ?? null;
      this.client?.notePageShot?.({ seq, body: hit?.id ?? null, bone: hit?.bone ?? null, part: hit?.part ?? null, distance: hit?.distance ?? null });
    },
  });
  /** LOW-2 (research 223 s6): shared throw packet and item/slot refund journal. */
  private readonly throwWire = new ThrowWire({
    client: () => this.client, staleThrow: (...args) => this.deps.staleThrow?.(...args),
  });
  /**
   * A late joiner's seat in a classic round in play ("You are a ghost.", research 91 section 12): since when (ms), or
   * null. The ghost is not alive; WEAPON EXCHANGE opens for it as for the dead (§B2), with the ghost's prompt.
   */
  private ghostSince: number | null = null;
  /**
   * PF-31 (ruling PF.R51; `./spectatorView`): the spectator's camera (follow, free, the map's scenic views) and the
   * benched dead player's teammate cycle, on the pad's release and the keys' keyup; Space kept (the owner).
   */
  readonly spectator: SpectatorView;
  /**
   * PV-10a (finding 6, the exit side): `spectator.povShown` at the last frame's end -- the view drawn there. With it and
   * `povShown` now false the view was switched off since (the pad's hold, the strip's `setPov`, a reset); a page that
   * never draws the view pays one false test a frame, no call. Not `spectator.pov`: off, that getter reads the bodies.
   */
  private povShownLast = false;
  /** The room's rules and the game's round count (the welcome's; the page's choice until then). */
  private rules: Rules;
  private rounds = MAX_ROUNDS;
  /**
   * The vote to remove (W3.R13; research 91 section 17): the game's radio menu TEAMMATES > a player > "VOTE
   * RETAIN:REMOVE", toggled. Shared by matchChat's normal pad/touch menu and the developer K list.
   * RADIO_MENU_PLACEHOLDER: K's message-window list remains a developer adaptation.
   */
  private voteMenu = false;
  private readonly myVotes = new Set<number>();
  votingToRemove(id: number): boolean { return this.myVotes.has(id); }
  /** Research 263 section 5.2: FUN_0022f3c0 D:L81363-81370 (toggle); its row's enable FUN_0022f440 D:L81384-81396 (a
   * teammate selected; no life test), the row under TEAMMATES > PLAYER n (FUN_00232bc0 D:L83607-83631, TEAMMATES a root
   * outside FUN_0022f810's roots; AD-10). Recheck at activation: a menu can outlive a target or a connection. The server validates too.
   * R4B-08 (r0004): refused while the camera views a teammate (`VOTE_ROWS_CAMERA_GATE_READING`, r4 0x2d1710's prologue),
   * so the developer K list cannot pass the menu's gate; the room keeps accepting (the original's receive has no test). */
  toggleVote(id: number): boolean {
    const gate = this.gate();
    const refused = this.reconnect.stopped || !this.welcomed || !gate.inMatch ? 'not seated' : gate.spectator ? 'spectator'
      : !voteRowsOpen(gate) ? 'row closed' : !this.teammates().includes(id) ? 'target not a teammate' : null;
    // HOTFIX vote-roster (the review): a playtest instrument, an adaptation -- a refused press says why on the console.
    if (refused) { console.info(`[vote] refused: ${refused}`); return false; }
    const remove = !this.myVotes.has(id);
    this.client.send({ type: 'vote', target: id, remove });
    if (remove) this.myVotes.add(id); else this.myVotes.delete(id);
    return true;
  }
  /**
   * HOTFIX vote-roster (product track, an adaptation fix of the port's own wiring; the vote rule unchanged): the vote's
   * teammates are the rows the Chat menu's TEAMMATES draws (`./matchChat` `teammates`: the room's live `score` rows, each
   * with its id and side, `Room.scoreEvent`) -- one roster, as the original's PLAYER n rows and its vote come from one
   * actor walk (`FUN_0022f5b0` D:L81442-81473). Was: `this.teams`, filled from the one welcome the page heard at its own
   * join and the `joined` / `left` after the match page took over -- the lobby's between are not replayed at the
   * hand-off -- so a row could show VOTE REMOVE while its press sent nothing (the owner on live v0.4.14, 2026-11-08).
   */
  private teammates(): number[] {
    const mine = this.client.team;
    return this.rows.filter((r) => r.team === mine && r.id !== this.client.id).map((r) => r.id).sort((a, b) => a - b);
  }
  /**
   * HOTFIX vote-roster (the review's F3): every seat's side, for the dead player's teammate cycle (`./spectatorView`
   * `teammates`), the kill feed's hostage cue, the death and hurt voices and the remote weapons' side -- the live score
   * rows' (the vote's roster), and for a seat they do not name yet the welcome's and the `joined` heard (`this.teams`).
   */
  private rosterTeams(): ReadonlyMap<number, Team> {
    if (!this.rows.length) return this.teams;
    const out = new Map(this.teams);
    for (const r of this.rows) out.set(r.id, r.team);
    return out;
  }
  /** HOTFIX vote-roster (F3): one seat's side from the same roster as `rosterTeams`. */
  private sideOf(id: number): Team | undefined {
    return this.rows.find((r) => r.id === id)?.team ?? this.teams.get(id);
  }
  private showVoteMenu(): void {
    const lines = this.teammates().map((id, i) => `${i + 1} ${this.displayNameOf(id)}  VOTE ${this.votingToRemove(id) ? 'RETAIN' : 'REMOVE'}`);
    this.deps.hud.postMessage(['TEAMMATES', ...(lines.length ? lines : ['(none)'])].map((text) => ({ text, scale: 0.8 })));
  }
  private readonly onKey = (e: KeyboardEvent): void => {
    const target = e.target;
    if (typeof HTMLElement !== 'undefined' && target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'SELECT')) return;
    if (DEAD_CYCLE_WHILE_MENU_READING === 'blocked' && this.deps.menuOpen?.()) return;   // HUD mode 1: the menu's keys alone
    if (this.client.role === 'player' && !e.repeat) {
      if (e.code === 'KeyK') { this.voteMenu = !this.voteMenu; if (this.voteMenu) this.showVoteMenu(); return; }
      if (this.voteMenu && e.code === 'Escape') { this.voteMenu = false; return; }
      const digit = /^Digit([1-9])$/.exec(e.code);
      if (this.voteMenu && digit) {
        const id = this.teammates()[Number(digit[1]) - 1];
        if (id === undefined) return;
        this.toggleVote(id);
        this.showVoteMenu();
        e.preventDefault();
        return;
      }
    }
  };
  /** PF-31: the spectator's and the benched player's keys, on keyup (`./spectatorView`); the menu's keys alone while it is open. */
  private readonly onSpectatorKey = (e: KeyboardEvent): void => {
    const target = e.target;
    if (typeof HTMLElement !== 'undefined' && target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'SELECT')) return;
    if (e.code === SEAT_CLAIM_BUTTONS_ADAPTATION.key) return;   // SEAT_CLAIM: J is the claim's (`onClaimKey`), never the view's
    this.spectator.key(e, DEAD_CYCLE_WHILE_MENU_READING === 'blocked' && (this.deps.menuOpen?.() ?? false));
  };
  /**
   * SEAT_CLAIM_ADAPTATION: J held, not released -- on the window's CAPTURE phase (LATER 1604): a front-end match leaves the
   * front end's menu keys attached (`./menuInput` `MenuPageInput.attach`, the document's capture phase), which stop every
   * key's propagation there, so a listener on the window's bubble phase never heard J (record PR941-CAP-PC2).
   */
  private readonly onClaimKey = (e: KeyboardEvent): void => {
    if (e.code !== SEAT_CLAIM_BUTTONS_ADAPTATION.key) return;
    const target = e.target;
    if (typeof HTMLElement !== 'undefined' && target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'SELECT')) return;
    if (e.type === 'keydown' && roundLineTakes(e)) return;   // the round's open text line types the J (`./roundLineKeys`)
    // Never under a modifier (a fresh review's finding, 2026-11-25): a browser's own chord on the key (the console's
    // Ctrl+Shift+J / Cmd+Opt+J) sends its keydown here and its keyup to the browser -- the hold would run on unpressed.
    this.claimKeyDown = e.type === 'keydown' && !(e.ctrlKey || e.metaKey || e.altKey);
  };
  /** SEAT_CLAIM_ADAPTATION: the window lost the keys (a blur, another tab) -- J's keyup may never come, so it is let go. */
  private readonly onClaimKeyBlur = (): void => { this.claimKeyDown = false; };
  /** SEAT_CLAIM_ADAPTATION (`./seatClaim`): the claim's hold, on the pad's R1 and (a development build's) the J key. */
  private readonly claimHold = new SeatClaimHold();
  /** SEAT_CLAIM_ADAPTATION: J held (a development build's keys, OT.R29, as the spectator's own). */
  private claimKeyDown = false;
  /** SEAT_CLAIM_ADAPTATION: a seat promoted from watching -- its walk, flown as a spectator's, goes on foot at its spawn. */
  private walkAtSpawn = false;
  /** SEAT_CLAIM_ADAPTATION: when the standing offer began (its line's pulse) and which it is. */
  private claimOffered: { kind: SeatClaimOffer['kind']; since: number } | null = null;
  private unsubscribe: () => void;
  /** LATER 498: off the client's held-spawn signal (`NetClient.onSpawnHeld`). */
  private unsubscribeHeld: () => void = () => undefined;
  /**
   * M9: a dropped socket (a server restart, the network) is joined again at once, then 1.5 s apart for 24 s, then 10 s (LATER 359); a kick or a refusal
   * is not. The match gives a rejoiner a new place, as the game's lobby would. `quickAt`: the last at-once reconnect
   * (`dropRetry`, one in `QUICK_RECONNECT_WINDOW_MS_ADAPTATION`).
   */
  private reconnect = { attempts: 0, at: 0, stopped: false, quickAt: Number.NEGATIVE_INFINITY };
  /** NET-DRAIN: the last hello was refused 'server closing' (`SERVER_CLOSING_REFUSAL`): retried as a drop, not final. */
  private closing = false;
  /** NET-DRAIN: when the first 'server closing' refusal since the last welcome came (`SERVER_CLOSING_RETRY_MS`), or null. */
  private closingSince: number | null = null;
  /** Browser lifecycle (research 304 section 6): reset audio once for each disconnected client. */
  private audioResetClient: NetClient | null = null;
  /** The room gave this page's seat to a newer connection of its token (`kicked` 'replaced'): the next retry's line is REPLACED_LINE_READING. */
  private replaced = false;
  /** OT.R59 (RECONNECT-GHOST (B)): a socket of this page has been welcomed before: a later ghost welcome is its rejoin's. */
  private seatedBefore = false;
  /** RECONNECT-GHOST (B): the held line set or let go (OT.R59). */
  private notice(text: string | null): void { this.deps.hud.setNotice?.(text); }
  /**
   * Whether a socket of this page has ever been welcomed (the room's `welcome`; a client the lobby welcomed before the
   * hand-off, `game.adopt`): a server never reached is retried more slowly and silently. SA-57: was, set at a socket's
   * open with no welcome -- so a socket that opened and was never welcomed took the reached backoff.
   */
  private reached = false;
  /**
   * SA-57 (`GAME_HELLO_WAIT_MS_ADAPTATION`, `./connectHost`; SA-55's wait on the match's socket): when this page's socket
   * not yet welcomed was first seen by a frame after its open or its hand-off (`open`, `game.adopt`: 'next', the wait
   * starting at the next frame's own clock read, `retry`'s -- so the live path reads `performance.now` no more often than
   * before, RE-3's digest in `netPageClock.test.ts`), null once it is welcomed, for a client welcomed before the
   * hand-off, and on the paths with no server's hello (`solo`, the replay's `client`); `helloLapsed`, that socket given
   * up on past the wait (closed, its own close perhaps never heard); `helloHost`, its URL's host for the console line.
   */
  private helloSince: number | 'next' | null = null;
  private helloLapsed = false;
  private helloHost = '';
  /** The server's reason, when it refused. */
  private refusal: string | null = null;
  /**
   * The round's end on the game's screens (research 91 section 18; `./roundScreens`): after the engine reads the result
   * (3 s), each screen the server named for its seconds, counting down; cleared when the next round starts.
   */
  private screens: { start: number; list: { screen: RoundScreen['kind']; seconds: number }[]; winner: Team | null; wins: { seal: number; terrorist: number }; stats?: Record<number, MatchStats>;
    /** LATER 74's review F1: the room's own start when `start` was moved to a late page's (the next round is the room's: `nextRoundIn`). */
    roomStart?: number } | null = null;
  /** NU-4 D1 (research 317 R317.8): the screens the page's drops were swept for, once a result (`sweepDrops`). */
  private dropsSweptFor: object | null = null;
  private readonly joinedAt = performance.now();
  /** LATER 580: the round screens' hold this page lays on its walk (`WalkMode.setRoundHold`): its `screenUp`. */
  private readonly roundHold = (): boolean => this.screenUp();
  /** RE-3 (W38.R3): the replay's clock -- the dep, else the client's own (`pageClock`, PT-19's `dtScale` precedent) -- or null, live. */
  private replayClock(): NonNullable<NetPageDeps['replayClock']> | null {
    return this.deps.replayClock ?? (this.client as { pageClock?(): NonNullable<NetPageDeps['replayClock']> }).pageClock?.() ?? null;
  }
  /** RE-3 (W38.R3): the round timer's, the launch countdown's and the round screens' clock: the replay's in the replay mode, else `performance.now`. */
  private now(): number {
    const clock = this.replayClock();
    return clock ? clock.now() : performance.now();
  }

  /**
   * `watch` (the map viewer's Online setting): join as a spectator -- the walk is not driven, the camera follows the
   * living players (Space the next, V the free camera) as a queued spectator's does. SEAT_CLAIM_ADAPTATION: a page that
   * plays (the test room's `&spectate`) may take a seat from there and then plays (`promoted`); the map viewer's never
   * does (`NetPageDeps.noSeatClaim`).
   */
  constructor(private readonly deps: NetPageDeps, private readonly url: string, private readonly map: string, private name: string, private readonly simulate?: Simulate, private watch = false, rules: Rules = 'respawn') {
    // HARD-SEAT (the review's (4)): a socket that carries the ticket opens the pinned URL only (research 169 measure 7);
    // SA-6b (GAME_DOOR_ADAPTATION): a placed game's opens its pinned door with its token, never the ticket.
    if (deps.game && !isGameSeat(deps.game)) throw new TypeError('a game socket needs its pinned URL (pinnedMatchSocket) or its pinned door (pinnedGameDoor)');
    // SA-7h S5: a standing room's socket opens only a door `pinnedRoomDoor` made, for the provider's room, with a token.
    if (deps.room && (deps.game || !isRoomSeatOf(deps.room.seat, deps.room.provider?.room))) throw new TypeError('a standing room\'s socket needs its pinned room door (pinnedRoomDoor) and its pass\'s token');
    // LATER 580 (research 81 §13): the page's own walk held from the first screen frame to the next `roundStart`
    // (`WalkMode.setRoundHold`; the original ticks MPExitState alone there, `FUN_002ce9e0` D:L171877-171888).
    deps.walk.setRoundHold?.(this.roundHold);
    shotDocument()?.addEventListener?.('visibilitychange', this.onShotVisibility);   // R4P-253 (F2): a hide flushes the shot queue
    this.spectator = new SpectatorView({
      bodies: () => this.client.bodies(), spectate: (pose) => this.deps.spectate(pose), views: () => this.deps.scenicViews?.() ?? [],
      follow: deps.spectateFollow ? (body, dt, ease) => this.deps.spectateFollow!(body, dt, ease) : undefined,
      resetFollow: () => this.deps.spectateFollowReset?.(),
      // PV-6b (`./spectatorView` POV_VIEW_ADAPTATION): the rig's draw and its warm call (PV-5b's deps), each only when its
      // dep exists; the view offered only where a dep draws it and the client carries it (`spectatePovCarried`, PV.R6).
      pov: deps.spectatePov ? (body, dt, watched) => this.deps.spectatePov!(body, dt, watched) : undefined,
      povWarm: deps.spectatePovWarm ? (body, dt, watched) => this.deps.spectatePovWarm!(body, dt, watched) : undefined,
      povRelease: () => { this.deps.spectatePovReset?.(); },   // PV-7b F4: the followed or watched body gone, the view given back
      povCarried: () => this.deps.spectatePov !== undefined && (this.deps.spectatePovCarried?.() ?? true),
      magnify: (m) => this.deps.spectateMagnify?.(m), pitchSign: () => this.deps.spectatePitchSign?.() ?? 1,
      seat: () => ({ role: this.client.role, self: this.client.id, team: this.client.team, teams: this.rosterTeams(), rules: this.rules, ghost: this.ghostSince !== null }),
      leaveSelf: () => { this.deps.walk.setMode('fly'); },
      returnSelf: () => { this.deps.walk.resumeBody?.(); },     // DEAD-CYCLE (LATER 78): DEAD_CYCLE_OWN_VIEW_READING
      escortee: (id) => this.hostageMap.has(id),                // HX-1: the room's hostages (the welcome's list, `hostageState`)
    });
    this.rules = rules;
    this.asked = rules;
    this.tellRefill();                                           // NET-REFILL: the asked rules until the welcome's
    const adopt = deps.game?.adopt;
    // MATCH-GAPS review round (research 222 §9): an adopted client was opened without this page's world (the lobby's,
    // `./gameLobbyHost`); it is handed it here, so the snapshots' environment and the round's reset reach it (protocol 10).
    if (adopt) {
      adopt.client.rebind(deps.walk);
      if (deps.world) adopt.client.setWorld(() => deps.world!());
      this.client = adopt.client;
      this.held = true;
      // SA-57: a client the lobby welcomed (its seat id set) is never timed out by the hello wait, and has reached the
      // game; one handed on before any welcome is timed from here -- the replayed welcome, when it comes, clears it.
      const welcomedBefore = adopt.client.id !== 0;
      if (welcomedBefore) this.reached = true;
      this.helloSince = welcomedBefore || deps.solo || deps.client ? null : 'next';
      this.helloLapsed = false;
      this.helloHost = socketHost(deps.game!.pinned.url);
    } else this.client = this.open();
    this.unsubscribe = this.client.on((ev) => this.event(ev));
    // LATER 498: a client without the signal (a hand-off's or a test's) holds no spawn: nothing to wait for.
    this.unsubscribeHeld = this.client.onSpawnHeld?.(() => { if (this.heldSpawn) this.ownSpawn(this.heldSpawn); }) ?? (() => undefined);
    this.listenVoice();                                              // SVC-20b-page: the room's voice frames, on the same unsubscribe
    if (adopt) {                                                 // ONL-18: the lobby's events, the welcome first
      this.adopting = true;
      try { for (const ev of adopt.events) this.event(ev); } finally { this.adopting = false; }
    }
    if (import.meta.env.DEV) {                                       // OT.R29: the keys a development build's only
      keyboardSite('s2u-kb-net-page');
      globalThis.addEventListener?.('keydown', this.onKey);
      globalThis.addEventListener?.('keyup', this.onSpectatorKey);
      globalThis.addEventListener?.('keydown', this.onSpectatorKey);
      globalThis.addEventListener?.('keydown', this.onClaimKey, true);   // SEAT_CLAIM: J's hold starts on its keydown (capture: LATER 1604)
      globalThis.addEventListener?.('keyup', this.onClaimKey, true);
      globalThis.addEventListener?.('blur', this.onClaimKeyBlur);
    }
    if (!deps.solo) globalThis.addEventListener?.('pagehide', this.onPageHide);
    // OT.R59 (RECONNECT-GHOST step 2): `bye` first on a page going away -- a capture listener on the window, which runs
    // before the front end's own pagehide (its logout, NU-16b's PAGEHIDE_LOGOUT_ADAPTATION) closes anything.
    if (!deps.solo) globalThis.addEventListener?.('pagehide', this.onPageHideBye, true);
  }

  /**
   * The page going (a closed tab or window, a reload, a navigation away): the socket's close frame is sent at once
   * (`close`, 1000 'left'), so the room drops the seat on it -- not 20-25 s later when the heartbeat finds the socket
   * silent (`server.ts` `PEER_SILENCE_MS_PLACEHOLDER` over `HEARTBEAT_MS`, still the fallback for a close that never comes), during which a new pair's
   * launch countdown could start against a seat already gone (the sprint-5 finding). The offline room has no seat to
   * free. A page the browser keeps in its back-forward cache joins afresh when shown again (`main.ts`, `pageshow`).
   */
  private readonly onPageHide = (e?: Event): void => {
    this.leftPage = true;
    // LATER 896 part 2 (`./seatKeep`, SEAT_KEEP_ON_RELOAD_ADAPTATION): "Reload and rejoin" -- the socket dropped with no
    // `bye` (as a silent link's), so the room parks the seat for the account's next session; no reconnect from here.
    if (keptThisPageHide(e)) { this.reconnect.stopped = true; (this.client as { drop?(): void }).drop?.(); return; }
    this.close();
  };
  /** OT.R59: the match socket's `bye`, best effort, the first thing a page going away does (`NetClient.sayBye`) -- unless
   *  the seat is kept (LATER 896 part 2). */
  private readonly onPageHideBye = (e?: Event): void => { if (!keptThisPageHide(e)) (this.client as { sayBye?(): void }).sayBye?.(); };
  private leftPage = false;
  /** Whether the page's going closed this connection (`onPageHide`): a page shown again from its cache joins afresh. */
  closedByPage(): boolean { return this.leftPage; }

  /** The rules this page asked for (the hello's). */
  private readonly asked: Rules;

  private open(): NetClient {
    this.welcomed = false;
    this.sentTypes = null;
    // LOW-3 (research 223 s6): the load reported on the last socket goes again if the room still holds round 1 for it.
    const loaded = (this.client as NetClient | undefined)?.loadReported() === true;
    const game = this.deps.game;
    const seat = game ? gameSeatOpen(this.gameSeat ??= gameSeatOf(game), game.id) : null;   // SA-6b: the pinned URL and the ticket, or the door and the token; SA-6c: the last re-token's
    const room = this.deps.room ? (this.roomSeat ??= this.deps.room.seat) : null;           // SA-7h S5: the first pass's door and token, then each re-pass's
    this.openSession = room ? this.deps.room!.session?.(room.pinned.url) : this.deps.session;   // F4: the door's own; none without it, never the page origin's
    const url = seat ? seat.url : room ? room.pinned.url : this.url;
    // SA-57: the hello's wait from here -- none for the offline room or the replay's client, which no server answers.
    this.helloSince = this.deps.solo || this.deps.client ? null : 'next';
    this.helloLapsed = false;
    this.helloHost = socketHost(url);
    const opts: NetOptions = {
      url, map: this.map, name: this.name, rules: this.asked, ...(this.simulate ? { simulate: this.simulate } : {}), ...(this.watch ? { watch: true } : {}),
      ...(this.deps.socket ? { socket: this.deps.socket } : {}), ...(this.openSession ? { session: this.openSession.token() } : {}),
      ...(this.deps.types ? { types: () => { const t = this.deps.types!(); this.sentTypes = { ...t }; return t; } } : {}),
      ...(this.deps.armory && !this.watch ? { armory: true, ...(this.deps.armoryOpen ? { armoryOpen: () => this.deps.armoryOpen!() } : {}) } : {}),
      ...(seat ? { game: seat.game } : {}), ...(room ? { room: { token: room.token } } : {}),
      ...(this.deps.world ? { world: () => this.deps.world!() } : {}), ...(loaded ? { loaded: true } : {}),
    };
    return this.deps.client ? this.deps.client(opts, this.deps.walk) : new NetClient(opts, this.deps.walk);   // PT-18: the replay's factory
  }

  /** The session token the open socket's hello carried (`deps.session`; SA-7h S5's F4: a standing room's door's own). */
  private openSession: { token(): string; renew(): string } | undefined = undefined;
  /** SA-7h S5: the standing room's seat the next socket opens -- the first pass's, then each re-pass's. */
  private roomSeat: RoomSeat | null = null;
  /** SA-7h S5: a 4003 `no seat in that room` is being re-passed (the socket refused, the retry allowed); and whether it has been since the last welcome. */
  private roomRepass = false;
  private roomRepassed = false;
  /** SA-6c (`GAME_RETOKEN_ADAPTATION`): the game's seat the next socket opens -- the hand-off's, then each re-token's. */
  private gameSeat: GameSeat | null = null;
  /**
   * SA-41 (the release review's H7): a held hello's 4003 (`GAME_RETOKEN_REASONS`) is being re-tokened (the socket refused,
   * the retry allowed); and whether it has been since the last welcome.
   */
  private gameRetoken = false;
  private gameRetokened = false;
  /** SA-6c: a re-token is out: the backoff paused, no second request (`reseat`). */
  private asking = false;
  /** SA-6c: each re-token numbered, so an answer after the bound, or a stale one, is dropped. */
  private reseats = 0;
  /** HARD-SEAT: whether connect's lobby was last told a game socket holds the session (`NetPageDeps.game.holds`). */
  private held = false;
  private hold(held: boolean): void {
    if (!this.deps.game || this.held === held) return;
    this.held = held;
    this.deps.game.holds?.(held);
  }

  /** HARD-SEAT: a game's seat ended for good: no retry, the session released, `ended` told once with its dialog. */
  private gameEnded = false;
  /**
   * LATER 359b, NET-RES-3 (an intended divergence under OT.R77): `ending` names what ended the seat for #365's text
   * (`./net/netEnding`); the dialog, the errno and the flow are as before, and #528 / #539 / #529 take no line.
   */
  private endGame(dialog: number, reason: string, ending: NetEnding | null = null): void {
    if (!this.gameEnded) setNetEnding(dialog === GAME_SOCKET_CLOSED_DIALOG_READING ? ending : null);
    this.reconnect.stopped = true;
    this.refusal ??= reason;
    this.hold(false);
    if (this.gameEnded) return;
    this.gameEnded = true;
    this.deps.game?.ended?.(dialog);
  }

  /** This socket's welcome has come (its role is the room's, not the client's default). */
  private welcomed = false;
  /**
   * Protocol 9: the types the room holds for this connection to seat it as -- the hello's, then a spectator's ARMORY
   * choices (`typeChosen`) -- or null before the hello. A seat compares the page's type with it (`resendPicks`).
   */
  private sentTypes: { seal: number; terrorist: number } | null = null;

  /**
   * The ARMORY left (DONE, Triangle on character select, the round's start; W5.R1): the seat the room held for it takes
   * its first spawn (`ready`; `ARMORY_SEAT_READING`). A player's only, on an open socket; the room ignores it for a seat
   * it did not hold.
   */
  armoryDone(): void {
    if (this.client.state !== 'open' || !this.welcomed || this.client.role !== 'player') return;
    this.client.send({ type: 'ready' });
  }

  /** A seat the room holds for the ARMORY: the screen opened -- unless it is open already (a rejoin under it). */
  private armorySeat(): void {
    if (this.deps.armoryOpen?.()) return;
    this.deps.joined?.();
  }

  /** Whether a type chosen for `side` goes to the room as a request it answers: a player of that side, welcomed. */
  answersType(side: Team): boolean {
    return this.client.state === 'open' && this.welcomed && this.client.role === 'player' && this.client.team === side;
  }

  /**
   * Protocol 9: the page's ARMORY type for `side` changed (`chooseCharacterType`). A player of that side sends it with
   * the side's picks, a `loadout` request (the room answers it: `loadoutAnswer`); a spectator -- seated by a promotion
   * later, on a side the room chooses -- sends its types for both sides (`types`, not answered), so the seat is the type
   * chosen while it waited. Nothing before the welcome: the hello carries the types then.
   */
  typeChosen(side: Team): void {
    if (this.client.state !== 'open' || !this.welcomed) return;
    if (this.client.role === 'player') {
      if (this.client.team === side) this.requestLoadout(this.deps.picks?.(side) ?? []);
      return;
    }
    const t = this.deps.types?.();
    if (!t || this.watch) return;
    this.sentTypes = { ...t };
    this.client.send({ type: 'loadout', picks: [], types: { seal: t.seal, terrorist: t.terrorist } });
  }

  /**
   * Joins again after a drop, with the backoff: at once, then 1.5 s apart for 24 s, then 10 s (LATER 359) after a match that was reached (with the HUD's line),
   * and 2, 4, 8 ... 60 s, without a word in the HUD, to a server never reached (the shared one before it is up: a
   * browser logs each refused socket itself, so the attempts are kept few). SA-57: "reached" is a welcome, never an open
   * alone; a socket never welcomed past `GAME_HELLO_WAIT_MS_ADAPTATION` is a drop (`helloWait`).
   */
  private retry(): void {
    const now = performance.now();
    this.helloWait(now);
    this.linkWatch(now);                             // NET-RES-2d: a welcomed socket gone silent
    // Dropped while dead (MATCH-FIX review 2, finding 2): the client gave the walk back alive and unlocked
    // (`NetClient.release`), so its body is not left lying in the death clip through the retry window.
    if (this.client.state === 'closed' || this.client.state === 'refused' || this.helloLapsed) {
      if (this.audioResetClient !== this.client) {
        this.audioResetClient = this.client;
        this.deps.roundAudio?.reset();             // discard old queued cues before this frame can play them
      }
      this.deathOff();
      // HARD-SEAT: every close of a game's socket releases the session to the keep-alive; a final one ends the seat.
      this.hold(false);
      if (this.reached && this.droppedAt === null) this.droppedAt = now;   // NET-RES-2d: the drop's start, for the give-up
      const code = this.client.closeCode;
      if (this.deps.game && code !== null && GAME_FINAL_CLOSES.has(code)) {
        this.endGame(code === 4007 ? GAME_ENDED_DIALOG_READING : GAME_SOCKET_CLOSED_DIALOG_READING, code === 4007 ? 'game ended' : 'disconnected', netEndingOf(code));
      }
    }
    // NET-RES-2d (NET-RES.R9): a game seat's retries run through the room's hold and one step more, then the seat ends
    // (#365, its text NET-RES-3's 'lost': LATER 359b) -- never while the server says it is closing (NET-DRAIN's own bound).
    if (!this.reconnect.stopped && this.deps.game && !this.closing && this.droppedAt !== null && now - this.droppedAt > RESUME_GIVE_UP_MS_ADAPTATION) {
      console.warn(`match socket: game ${this.deps.game.id} not back within ${RESUME_GIVE_UP_MS_ADAPTATION} ms of its drop: the seat ended`);
      this.refusal ??= 'connection lost';
      this.endGame(GAME_SOCKET_CLOSED_DIALOG_READING, 'disconnected', 'lost');
      return;
    }
    if (this.reconnect.stopped || !this.retriable() || this.asking) return;   // SA-6c: while a re-token is out, the backoff paused
    if (this.reconnect.at === 0) {
      const wait = dropRetry(this.reconnect.attempts, this.reached, now, this.reconnect.quickAt, this.deps.local);
      this.reconnect.quickAt = wait.quickAt;
      this.reconnect.at = retryDueAt(now, wait.delayMs + this.resumeJitter());   // LATER 359a F3: a room's pages spread
      // Replaced by a newer connection of this page (a duplicated tab): its own line was posted, not a lost connection.
      if (this.reached && !this.replaced) this.deps.hud.postMessage('CONNECTION LOST. RECONNECTING. . .');
      this.replaced = false;
      return;
    }
    if (now < this.reconnect.at) return;
    this.reconnect.attempts++;
    this.reconnect.at = 0;
    const reseat = this.deps.game?.reseat;
    if (reseat) { this.reseat(reseat); return; }      // SA-6c (GAME_RETOKEN_ADAPTATION): no socket until central answers
    if (this.deps.room) { this.repass(this.deps.room.provider); return; }   // SA-7h S5: a fresh pass first, every time
    this.reopen();
  }

  /**
   * SA-57 (`GAME_HELLO_WAIT_MS_ADAPTATION`; SA-55's rule on the match's socket, a browser adaptation): the socket not
   * welcomed since its open (`helloSince`), its upgrade still `connecting` or `open` with no welcome, past the wait -- one
   * console line (what it was for: the game, the standing room or the server; the state it hung in; the wait; the
   * attempt, 1 the first socket since the open or the last welcome; the URL's host -- never a token, a ticket or a
   * session), then a drop as a close is: the socket closed, its late words heard no more (`NetClient.close`), and
   * `helloLapsed` standing for the close that may never come -- `retry` lets the hold go and takes the backoff, then the
   * re-token (SA-6c) or the re-pass (SA-7h S5) or the seat reopened. A welcomed socket is never timed out by it.
   */
  private helloWait(now: number): void {
    const c = this.client;
    if (this.helloSince === null || this.helloLapsed || this.reconnect.stopped) return;
    if (c.state !== 'connecting' && c.state !== 'open') return;
    if (this.helloSince === 'next') { this.helloSince = now; return; }   // the wait from this frame's clock read
    const bound = this.resumeAttempt() ? RESUME_ATTEMPT_WAIT_MS_ADAPTATION : GAME_HELLO_WAIT_MS_ADAPTATION;   // LATER 359a F2
    if (now - this.helloSince < bound) return;
    const state = c.state;
    const what = this.deps.game ? `game ${this.deps.game.id}` : this.deps.room ? `room ${this.deps.room.provider.room}` : 'the server';
    console.warn(`match socket: ${what} not welcomed within ${bound} ms, hung ${state} (${state === 'connecting' ? 'the upgrade never completed' : 'opened, no welcome'}) on ${this.helloHost}, attempt ${this.reconnect.attempts + 1}: dropped, retried after the backoff`);
    this.helloLapsed = true; this.helloSince = null;
    // LATER 359a re-review B1: a resume attempt's socket is given up with no `bye` (`NetClient.drop`), as `linkWatch` gives a
    // silent one up -- its hello may have seated it, and a `bye` reads as a leave that frees the seat; dropped, the room parks it.
    if (this.reached) c.drop(); else c.close();   // the B1 re-review's F1: any reached match's lapse, not the 3 s one alone
  }

  /** NET-RES-2d: when a reached match's socket last dropped (the page's clock), null since its last welcome. */
  private droppedAt: number | null = null;

  /**
   * NET-RES-2d (`LINK_SILENCE_MS_ADAPTATION`, NET-RES.R9; a browser adaptation): a welcomed socket the server has sent
   * nothing on for the bound is given up as SA-57's lapsed hello is (`helloLapsed`, so `retry` takes the backoff) --
   * closed with no `bye` (`NetClient.drop`), so the room holds the seat for its return (NET-RES.R7). Not the offline
   * room's or a replay's client, which no server feeds.
   *
   * LATER 574: the frame only suspects the silence; the verdict is a task's (a zero-delay timer), so it runs behind every
   * word the network queued for the page before it -- the frame alone cannot tell a dead link from words still waiting
   * behind the page's own work. On the seat box (2026-10-29, escortLines' [ESC] log) a joining page's frames ran on
   * while its tasks -- the socket's words, its timers -- waited ~17 s, and the frame gave a live link up; its retry's
   * second socket (`reopen`) read no team until its welcome. A word heard by the task's turn keeps the link; nothing heard
   * is a dead link, given up there. One verdict queued a client at a time (`linkVerdict`).
   */
  private linkWatch(now: number): void {
    const c = this.client;
    if (this.deps.solo || this.deps.client || this.helloLapsed || this.reconnect.stopped || c.state !== 'open' || c.id === 0) return;
    if (now - c.heardAt() < LINK_SILENCE_MS_ADAPTATION || this.linkVerdict === c) return;
    this.linkVerdict = c;
    const heard = c.heardAt();
    setTimeout(() => {
      if (this.linkVerdict === c) this.linkVerdict = null;
      if (this.client !== c || c.heardAt() !== heard || this.helloLapsed || this.reconnect.stopped || c.state !== 'open') return;
      console.warn(`match socket: nothing from the server for ${LINK_SILENCE_MS_ADAPTATION} ms on ${this.helloHost}: given up, retried after the backoff (no bye: the seat held)`);
      this.helloLapsed = true;
      c.drop();
    }, 0);
  }

  /** LATER 574: the client whose silence verdict is queued (`linkWatch`'s task), null when none is. */
  private linkVerdict: NetClient | null = null;

  /** The retry's new socket on the seat as it stands: the old client's listeners let go, the new one's taken on. */
  private reopen(): void {
    this.unsubscribe();
    this.unsubscribeHeld(); this.heldSpawn = null;            // LATER 498: no held spawn outlives its client
    this.deps.remote.clear();
    this.inFlight = [];                               // a new socket: the old one's answers will not come
    this.client = this.open();
    this.unsubscribe = this.client.on((ev) => this.event(ev));
    // LATER 498: a client without the signal (a hand-off's or a test's) holds no spawn: nothing to wait for.
    this.unsubscribeHeld = this.client.onSpawnHeld?.(() => { if (this.heldSpawn) this.ownSpawn(this.heldSpawn); }) ?? (() => undefined);
    this.listenVoice();                               // SVC-20b-page: the new socket's voice frames too
    for (const fn of this.clientListeners) fn(this.client);   // AD-12's review F1: the lobby match follows it at once
  }

  /**
   * SA-6c (`GAME_RETOKEN_ADAPTATION`; SA.R22 (5), (7)): the retry's re-token, awaited -- one at a time (`asking`), the
   * backoff paused while it is out. Its answer, unless the page closed, released or ended meanwhile (`reconnect.stopped`):
   * a seat opens at once (a placed game's door and fresh token, or a local game's pinned socket and the login ticket read
   * now); a refusal ends the seat as `SEAT_FREED_CLOSE` (4008) does (`retry`'s final close: #365); signed out, the retries
   * stop and the session's own close ends the match (`LobbyMatch.stop`); a failure waits the backoff's next step.
   */
  /** LATER 359a F2: whether the next attempt is one of a reached match's fast retries (`RESUME_ATTEMPT_WAIT_MS_ADAPTATION`). */
  private resumeAttempt(): boolean {
    return this.reached && this.reconnect.attempts <= RESUME_FAST_RETRIES_ADAPTATION + 1;   // the re-review's N1: the 17th rides the 16th's 1.5 s step
  }

  /** LATER 359a F3: a fast retry's random delay, ms (`RESUME_RETRY_JITTER_MS_ADAPTATION`); 0 without the dep or past the fast retries (the first 10 s step's wait, attempt 18's, still takes it: the B1 re-review's F2). */
  private resumeJitter(): number {
    const j = this.deps.retryJitterMs;
    if (!j || !this.resumeAttempt()) return 0;
    return Math.max(0, Math.min(RESUME_RETRY_JITTER_MS_ADAPTATION, j()));
  }

  private reseat(p: GameSeatProvider): void {
    const n = ++this.reseats;
    this.asking = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const answered = (r: Reseat): void => {
      if (n !== this.reseats || !this.asking) return;      // a late answer, after the bound, dropped
      clearTimeout(timer);
      this.asking = false;
      if (this.reconnect.stopped) return;                  // close()/release()/endGame set it
      if (r.kind === 'open') {
        if (!this.deps.game || !isSeatOf(r.seat, this.deps.game.id)) { this.endGame(GAME_SOCKET_CLOSED_DIALOG_READING, 'disconnected', 'seat-freed'); return; }   // a broken or another game's seat: as 4008
        this.gameSeat = r.seat; this.gameRetoken = false; this.reopen(); return;
      }
      if (r.kind === 'ended') { this.endGame(r.close === 4007 ? GAME_ENDED_DIALOG_READING : GAME_SOCKET_CLOSED_DIALOG_READING, r.close === 4007 ? 'game ended' : 'disconnected', r.why ?? netEndingOf(r.close)); return; }
      if (r.kind === 'signed-out') { this.reconnect.stopped = true; this.refusal ??= 'signed out'; return; }
      this.reconnect.at = retryDueAt(performance.now(), retryDelayMs(this.reconnect.attempts, this.reached, this.deps.local) + this.resumeJitter());
    };
    timer = setTimeout(() => { answered({ kind: 'backoff' }); }, this.resumeAttempt() ? RESUME_ATTEMPT_WAIT_MS_ADAPTATION : GAME_RETOKEN_WAIT_MS_ADAPTATION);   // the page-side bound (LATER 359a F2: 3 s in the fast retries)
    void p.reseat().then(answered, () => { answered({ kind: 'backoff' }); });
  }

  /**
   * SA-7h S5 (`ROOM_DOOR_ADAPTATION`): the retry's room pass, awaited as `reseat` awaits a re-token -- one at a time
   * (`asking`), the backoff paused, `GAME_RETOKEN_WAIT_MS_ADAPTATION` its bound. Its answer, unless the page closed
   * meanwhile: a seat of this room opens at once; refused (or a seat of another room), the retries stop with its line;
   * failed, the backoff's next step.
   */
  private repass(p: RoomSeatProvider): void {
    const n = ++this.reseats;
    this.asking = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const answered = (r: RoomPass): void => {
      if (n !== this.reseats || !this.asking) return;      // a late answer, after the bound, dropped
      clearTimeout(timer);
      this.asking = false;
      if (this.reconnect.stopped) return;
      if (r.kind === 'seat' && isRoomSeatOf(r.seat, p.room)) { this.roomSeat = r.seat; this.roomRepass = false; this.reopen(); return; }
      // The review's F2: a 404 or 503 on a reconnect is the backoff's (a host restarting is seconds); a 409, a rejected
      // pass (its re-check's fold 1), a name refused or a seat of another room is the end.
      const backoff = r.kind === 'failed' || (r.kind === 'refused' && (r.why === 'no room' || r.why === 'unavailable'));
      if (!backoff) {
        const line = roomRefusalLine(r.kind === 'refused' ? r.why : 'rejected');
        this.reconnect.stopped = true; this.roomRepass = false; this.refusal = line; this.deps.hud.postMessage(line);
        return;
      }
      this.reconnect.at = retryDueAt(performance.now(), retryDelayMs(this.reconnect.attempts, this.reached, this.deps.local) + this.resumeJitter());
    };
    timer = setTimeout(() => { answered({ kind: 'failed' }); }, this.resumeAttempt() ? RESUME_ATTEMPT_WAIT_MS_ADAPTATION : GAME_RETOKEN_WAIT_MS_ADAPTATION);   // LATER 359a F2
    void p.pass().then(answered, () => { answered({ kind: 'failed' }); });
  }

  /** AD-12's review F1: told of each new client at a retry, synchronously (`LobbyMatch` through `MatchHandle.net`). */
  private readonly clientListeners = new Set<(client: NetClient) => void>();
  /** AD-12's review F1: `fn` told the page's new client at each retry, before any word of the room's on it; the unsubscribe. */
  onClient(fn: (client: NetClient) => void): () => void {
    this.clientListeners.add(fn);
    return () => { this.clientListeners.delete(fn); };
  }

  /** SVC-20b-page (web sprint 20): the client's voice frames to the voice client's hook, let go with `unsubscribe`. */
  private listenVoice(): void {
    const events = this.unsubscribe;
    const voice = this.client.onVoice((down) => { this.deps.voiceFrame?.(down); });
    this.unsubscribe = () => { events(); voice(); };
  }

  /**
   * The client is down and may be opened again: closed, or refused 'server closing' with its socket gone (NET-DRAIN: the
   * server draining for a restart; the retry, on the drop's backoff, reaches the restarted one). SA-57: or given up on
   * past the hello's wait (`helloLapsed`), its close perhaps never heard.
   */
  private retriable(): boolean {
    return this.helloLapsed || this.client.state === 'closed' || ((this.closing || this.roomRepass || this.gameRetoken) && this.client.state === 'refused' && this.client.closeCode !== null);
  }

  /**
   * WM-DATA (`DAMAGE_REPORT_ADAPTATION`; a browser adaptation, it changes nothing the game does): the kept damage
   * reports, read-only copies, each id resolved to the scoreboard's name where the page knows it (the rows at the report's
   * arrival first -- the room reuses a departed player's id, `server.ts` `freeId` the lowest free -- else the current
   * rows, for an id that had no name then), null where it does not -- a negative (departed) id never has one.
   */
  damageReports(): { round: DamageReport | null; life: DamageReport | null } {
    const view = (kept: NetPage['roundDamage'], kills: { mine: Set<number>; me: Set<number> }): DamageReport | null => {
      if (!kept) return null;
      const name = (id: number): string | null => id < 0 ? null : kept.names.get(id) ?? this.rows.find((r) => r.id === id)?.name ?? null;
      const mark = (id: number, by: Set<number>): { kill?: true } => (id >= 0 && by.has(id) ? { kill: true } : {});
      const { ev } = kept;
      return {
        round: ev.round, life: (ev as { life?: true }).life === true,
        taken: ev.taken.map((t) => ({ id: t.from, name: name(t.from), hits: t.hits, health: t.health, ...mark(t.from, kills.me) })),
        dealt: ev.dealt.map((d) => ({ id: d.to, name: name(d.to), hits: d.hits, health: d.health, ...mark(d.to, kills.mine) })),
      };
    };
    return { round: view(this.roundDamage, this.damageKills.round), life: view(this.lifeDamage, this.damageKills.life) };
  }

  /**
   * WM-13 (the DAMAGE REPORT PANEL, `./damagePanel`; a browser adaptation, it changes nothing the game does): "the window"
   * the panel may open in, and its report -- the result window (the round's result in, `roundOver`, and no round screen up
   * yet: the `ENGINE_READ_S` before the first, in every room kind) with the round's report; WM-DATA-WIN (WM.R24): from a
   * round report that came before the result (the room's at a win's decision, `damageAtWin`) through the hold to that
   * same end, ROUND COMPLETE; else a respawn room's respawn wait (`respawnReady`, until the page's own spawn ends the
   * death) with the life's; null otherwise, and for a spectator. The report may be null (not come yet); it is the latest.
   */
  damageWindow(): { kind: 'round' | 'life'; report: DamageReport | null } | null {
    if (this.client.role !== 'player') return null;
    const elapsed = this.screensElapsed();
    if ((elapsed !== null && elapsed < 0) || (this.damageAtWin && elapsed === null)) return { kind: 'round', report: this.damageReports().round };
    if (this.respawnReady()) return { kind: 'life', report: this.damageReports().life };
    return null;
  }

  /** The connection as the panel's Online line shows it (`./online` `onlineLine`). */
  status(): OnlineStatus {
    const c = this.client;
    const base = { players: this.rows.length, retryIn: 0, watching: this.watch };
    if (this.deps.solo) return { ...base, state: 'offline' };
    const closing = !this.reconnect.stopped && (this.closing || this.roomRepass || this.gameRetoken) && c.state === 'refused';
    const down = c.state === 'closed' || this.helloLapsed;       // SA-57: a lapsed socket is down, its close perhaps never heard
    if ((c.state === 'refused' && !closing) || (this.reconnect.stopped && down)) return { ...base, state: 'refused', reason: this.refusal ?? 'closed by the server' };
    if (c.state === 'open' && c.id !== 0 && !this.helloLapsed) return { ...base, state: 'online' };
    if (down || closing) {
      const wait = this.reconnect.at > 0 ? (this.reconnect.at - performance.now()) / 1000 : retryDelayMs(this.reconnect.attempts, this.reached, this.deps.local) / 1000;
      return { ...base, state: 'retrying', retryIn: Math.max(0, wait), ...(this.deps.local && !this.reached ? { local: true } : {}) };
    }
    return { ...base, state: 'connecting' };
  }

  close(): void {
    this.reconnect.stopped = true;
    this.firearmWire.clearPending();                // LATER 347: no held round outlives the page
    this.clientListeners.clear();                  // AD-12's review F1: no lobby match follows a page that is gone
    this.deps.hud.setRoundScreen(null);
    this.deps.walk.setRoundHold?.(null, this.roundHold);   // LATER 580: no round hold outlives the page's match
    this.deps.hud.setScoreRows(null, []);
    this.notice(null);                             // OT.R59 (RECONNECT-GHOST (B)): no line outlives the page's match
    globalThis.removeEventListener?.('keydown', this.onKey);
    shotDocument()?.removeEventListener?.('visibilitychange', this.onShotVisibility);
    globalThis.removeEventListener?.('keyup', this.onSpectatorKey);
    globalThis.removeEventListener?.('keydown', this.onSpectatorKey);
    globalThis.removeEventListener?.('keydown', this.onClaimKey, true);
    globalThis.removeEventListener?.('keyup', this.onClaimKey, true);
    globalThis.removeEventListener?.('blur', this.onClaimKeyBlur);
    globalThis.removeEventListener?.('pagehide', this.onPageHide);
    globalThis.removeEventListener?.('pagehide', this.onPageHideBye, true);
    this.unsubscribe();
    this.unsubscribeHeld(); this.heldSpawn = null;            // LATER 498: no held spawn outlives its client
    this.client.close();
    this.deps.remote.clear();
    this.audioResetClient = this.client;
    this.deps.roundAudio?.reset();                 // INT.R7: nothing pending outlives the page's match, the slot stops
    this.deathOff();
    this.hold(false);                              // HARD-SEAT: the page's own close releases the session too
    this.deps.netRefill?.(null);                   // NET-REFILL: no match, offline
    this.deps.spectateMagnify?.(1);                // SPECTATOR-VIEW W6: the view's end, the page's camera back at 1
    this.damageAtWin = false;                      // WM-DATA-WIN: no damage window outlives the page
  }

  /** NET-REFILL (research 312 §5): the room's rules as the page's `Fire`'s network rule (`NetPageDeps.netRefill`). */
  private tellRefill(): void {
    this.deps.netRefill?.(this.watch ? null : { respawn: this.rules === 'respawn' });
  }

  /**
   * ONL-18c (web research 166 §8): the match's end -- the page lets go of its client without closing it, for the same
   * game's lobby to take back (`LobbyMatch.matchOver`, `GameSocketHost.adopt`): no retry, nothing of the match left on
   * the HUD, no listener of this page on it. An open client is answered, the session's hold passing with it (not told);
   * one no longer open is closed and answered null, the hold let go, as `close` does. SA-57 (and its review's low 1):
   * so is one given up on past the hello's wait, and one open but never welcomed (a reconnect's, its wait not yet run;
   * neither this page's `welcome` nor the lobby's seat id) -- the lobby reconnects on its own path, never holding it.
   */
  release(): NetClient | null {
    this.reconnect.stopped = true;
    this.clientListeners.clear();                  // AD-12's review F1: no lobby match follows a page that is gone
    this.deps.hud.setRoundScreen(null);
    this.deps.walk.setRoundHold?.(null, this.roundHold);   // LATER 580: no round hold outlives the page's match
    this.deps.hud.setScoreRows(null, []);
    this.notice(null);                             // OT.R59 (RECONNECT-GHOST (B)): no line outlives the page's match
    globalThis.removeEventListener?.('keydown', this.onKey);
    shotDocument()?.removeEventListener?.('visibilitychange', this.onShotVisibility);
    globalThis.removeEventListener?.('keyup', this.onSpectatorKey);
    globalThis.removeEventListener?.('keydown', this.onSpectatorKey);
    globalThis.removeEventListener?.('keydown', this.onClaimKey, true);
    globalThis.removeEventListener?.('keyup', this.onClaimKey, true);
    globalThis.removeEventListener?.('blur', this.onClaimKeyBlur);
    globalThis.removeEventListener?.('pagehide', this.onPageHide);
    globalThis.removeEventListener?.('pagehide', this.onPageHideBye, true);
    this.unsubscribe();
    this.unsubscribeHeld(); this.heldSpawn = null;            // LATER 498: no held spawn outlives its client
    this.deps.remote.clear();
    this.audioResetClient = this.client;
    this.deps.roundAudio?.reset();
    this.deps.spectateMagnify?.(1);                // SPECTATOR-VIEW W6: the view's end, the page's camera back at 1
    this.deathOff();
    this.deps.netRefill?.(null);                   // NET-REFILL: the match is over, the lobby has none
    const client = this.client;
    if (this.deps.world) client.setWorld(null);     // MATCH-GAPS: the match's world stays the match's (the lobby has none)
    const welcomed = this.welcomed || client.id !== 0;             // SA-57's review: the room's welcome, here or in the lobby
    if (client.state !== 'open' || this.helloLapsed || !welcomed) { client.close(); this.hold(false); return null; }
    this.held = false;                             // the hold passes with the client (`GameSocketHost.adopt`)
    return client;
  }

  /** Dead at a close or a drop: the free walk's body is not left in the death clip (the client gives the walk back alive). */
  private deathOff(): void {
    if (this.dead) { this.dead = null; this.deps.walk.setDeathPose(null); }
    this.deps.hud.setSpectator?.(null);
    // NU-11b F1: a ghost's dead walk given back too -- the client's `release` gives back only the walk its `kill` marked.
    if (this.ghostDead) { this.ghostDead = false; this.deps.walk.setDead?.(false); }
  }

  /** Existing public match interface; shared transport holds the shot timing and journals. */
  trigger(on: boolean): void {
    this.setTrigger(on);
    this.client.beginFrame?.(); // NCW-8: each round immediately after its own movement command.
  }
  private setTrigger(on: boolean): void {
    this.firearmWire.setTrigger(on);
    this.deps.walk.setTrigger(on);
  }
  roundSeq(own?: number): number | null { return this.firearmWire.roundSeq(own); }
  fireEvent(e: FireEvent): void { this.firearmWire.fireEvent(e); }

  /**
   * Protocol 7: the weapon select's picks, the side's whole list (`./loadout` `PlayerLoadout.confirm`), as the
   * `loadout` request -- a player's only (a spectator has no kit), on an open socket; the room answers (`loadout`).
   * Protocol 9: with the page's character type for its side (`deps.types`), which the picks replay from.
   */
  requestLoadout(picks: readonly Pick[]): void {
    if (this.client.state !== 'open' || this.client.role !== 'player') return;
    const list = picks.map((p) => ({ slot: p.slot, id: p.id }));
    const team = this.client.team, char = team ? this.deps.types?.()[team] : undefined;
    this.inFlight.push({ list, ...(char !== undefined ? { char } : {}) });
    this.client.send({ type: 'loadout', picks: list, ...(char !== undefined ? { char } : {}) });
  }
  /**
   * The `loadout` requests sent and not yet answered, oldest first (the answers come back in order on one socket): each
   * answer is handed its own request, its list and the type it named (`PlayerLoadout.roomAnswer`).
   */
  private inFlight: LoadoutRequest[] = [];

  /**
   * A seat taken (a join, a rejoin after a drop, a promotion): the side's picks sent again, so the new seat holds them.
   * The type rode the hello or the spectator's last choice (protocol 9, `sentTypes`): a seat with no picks sends nothing
   * unless the page's type for the side differs from it -- then a type-only request, so the seat takes the page's type.
   */
  private resendPicks(team: Team | null, char: number | null = null, again: number | null = null): void {
    if (!team) return;
    const picks = this.deps.picks?.(team) ?? [];
    if (char === null) {
      // A server without the seat's `char`: the room is taken to hold what the page last sent (`sentTypes`).
      const type = this.deps.types?.()[team];
      if (picks.length || (type !== undefined && type !== (this.sentTypes?.[team] ?? DEFAULT_ARMORY_TYPE[team]))) this.requestLoadout(picks);
      return;
    }
    // S2 round 3: the page holds the room's type now (`seated`). Its list for that type goes whole -- the room's record
    // may or may not have kept it, and the whole list lands the same either way (protocol 7) -- then, when the page had
    // chosen another type, a request for it, staged as a choice is: taken, the page's type; refused (`round` in a round,
    // `alive`, `type`), the room's stays, through the answer's normal path (`PlayerLoadout.roomAnswer`).
    if (picks.length) this.requestLoadout(picks);
    if (again !== null && again !== char && this.deps.stageType?.(team, again)) this.requestLoadout(this.deps.picks?.(team) ?? []);
  }

  /** The room's `char` off a welcome or a promotion: a whole number, else null (a server before it). */
  private static seatChar(ev: { char?: unknown }): number | null {
    return Number.isInteger(ev.char) ? ev.char as number : null;
  }

  /**
   * KIT-HELD (the review's F1): the lobby's events replayed into this page at the hand-off (`game.adopt`). The match
   * page's kit store is new then -- its types the defaults, chosen by no one -- so a seat it replays is the room's
   * as it stands: its type held, and no type of the page's asked for again (that ask, the default, reset a kept
   * non-default type and its picks with no confirm). Every other seat (a socket's own welcome, a promotion heard live)
   * is unchanged.
   */
  private adopting = false;

  /** A seat taken: the page holds the room's type (`deps.seated`) and sends what the seat needs (`resendPicks`). */
  private seat(team: Team | null, player: boolean, char: number | null): void {
    const again = this.deps.seated?.(player ? team : null, player ? char : null);
    if (player) this.resendPicks(team, char, typeof again === 'number' && !this.adopting ? again : null);
  }

  /**
   * WEAPON EXCHANGE's gate (`./weaponSelectState` `canOpen`; research 94 §B2): in the match, dead or a ghost, the camera
   * on oneself (not following a teammate), not a spectator. `cameraOnSelf` stays the camera's own answer (the vote
   * rows read it, `./spectatorVote`); `canOpen` opens the menu while following a teammate as well
   * (SPECTATE_KIT_CHANGE_OWNER).
   */
  gate(): MatchGate {
    const player = this.client.role === 'player';
    return {
      inMatch: this.client.state === 'open', alive: player && !this.dead && this.ghostSince === null,
      cameraOnSelf: this.spectator.watching === null, spectator: !player,
    };
  }

  /**
   * The dead player's help state (S1 / S1g / S1r, `FUN_001f97b0` D:L56978-57046; research 351), read every frame by
   * the shared HUD and WEAPON EXCHANGE. Classic/ghost keep their ordinary help clock. Respawn's second line also
   * requires elapsed > 5 and body alpha 0 (loaded r0004 0x1f9b80-0x1f9c68). The browser reads its actual existing
   * own-corpse expiry; there is no second body timer here. Partial-alpha rendering remains research 317's existing debt.
   * Null when there is none: alive, following a teammate (S6: the lines are `FUN_001f9f20`'s then), or a spectator (S7).
   * Respawn never gets classic's teammate-cycle text.
   */
  prompt(): { ghost: boolean; sinceDeath: number; respawnReady?: boolean } | null {
    if (this.client.role !== 'player' || this.spectator.watching !== null) return null;
    const now = performance.now();
    if (this.ghostSince !== null && this.rules === 'classic') return { ghost: true, sinceDeath: (now - this.ghostSince) / 1000 };
    if (this.dead?.help) {
      const sinceDeath = (now - this.dead.at) / 1000;
      return { ghost: false, sinceDeath, ...(this.rules === 'respawn'
        ? { respawnReady: this.respawnReady() } : {}) };
    }
    return null;
  }

  /** RSP-8 (research 354): the actual respawn dead path owns Action even before it becomes eligible. */
  respawnInputActive(): boolean {
    return this.rules === 'respawn' && this.dead !== null && this.client.role === 'player' && !this.watch
      && this.ghostSince === null && !this.ghostDead && !this.spectator.benched && this.spectator.watching === null;
  }

  /** The original help/input eligibility, apart from the input-only control/menu gate (research 352 §2-4, 354 §1). */
  private respawnReady(): boolean {
    return this.respawnInputActive() && this.dead?.help === true && this.client.state === 'open'
      && this.deps.walk.mode() === 'walk' && this.deps.walk.isDead()
      && (performance.now() - this.dead.at) / 1000 > RESPAWN_PROMPT_S
      && (this.dead.atLoad === true || this.deps.ownCorpseExpired?.() === true)
      && this.roomTakesPress(this.dead.atLoad === true);
  }

  /**
   * B138 (BTL.R8, run 1): the room's own gate on its clock (`room.ts` `respawnReady`: a load death strictly past
   * `RESPAWN_PRESS_S`, an ordinary one past max(5, `RESPAWN_FADE_S`)), read on the room's ticks as this page has heard
   * them (`NetClient.roomSecondsDead`, never ahead of the room). The original's prompt and press are one controller on
   * one clock (`FUN_00592560` D:L451699-451724); the room's loop drops a stall's ticks, so the page's own 5 s alone could
   * show the prompt to a press the room then ignores. With no snapshot heard (a page fed no frames) the page's clock alone.
   */
  private roomTakesPress(atLoad: boolean): boolean {
    const s = this.client.roomSecondsDead?.() ?? null;
    return s === null || (atLoad ? s > RESPAWN_PROMPT_S : s >= Math.max(RESPAWN_PROMPT_S, RESPAWN_FADE_S));
  }

  /**
   * B138's instrument (dev only, through `./matchMount`'s window hook): every term `respawnReady` reads, as it reads them.
   */
  respawnTerms(): Record<string, unknown> {
    return {
      rules: this.rules, role: this.client.role, state: this.client.state, watch: this.watch, dead: this.dead ? { ...this.dead } : null,
      ghostSince: this.ghostSince, ghostDead: this.ghostDead, benched: this.spectator.benched, watching: this.spectator.watching,
      walkMode: this.deps.walk.mode(), walkDead: this.deps.walk.isDead(),
      pageSeconds: this.dead ? (performance.now() - this.dead.at) / 1000 : null, roomSeconds: this.client.roomSecondsDead?.() ?? null,
      corpseExpired: this.deps.ownCorpseExpired?.() ?? null, inputActive: this.respawnInputActive(), ready: this.respawnReady(),
    };
  }

  /**
   * RSP-8 (research 354): state1/fresh Action press in the dead controller, never a held frame or release. r0004
   * FUN_00597d90 0x597e08-0x597e24 and 0x597ef0-0x59806c; its existing body-expiry substitution is research 351 §3.
   * Menus/loading block input separately from the ready help; both mounts supply their complete menuOpen gate.
   */
  pressRespawn(): boolean {
    if (!this.respawnReady() || this.deps.menuOpen?.() || this.deps.respawnInputBlocked?.()) return false;
    return this.deps.walk.queueRespawnAction();
  }

  /**
   * The page's own throw, to the server (`GrenadeThrower.on('throw')`). PF-13: C4's carries the plant's `target` and the
   * struck `surface` (`GrenadeThrower.on('place')`). LATER 503: `shot`, a rocket's launch id, journalled only (page-local).
   */
  throwEvent(
    kind: string, from: readonly number[], velocity: readonly number[],
    c4?: { target?: number; surface?: { path: string; point: readonly number[] }; eye?: readonly number[]; slot?: number },
    start?: number, slot?: number, shot?: number,
  ): void {
    this.throwWire.throwEvent(kind, from, velocity, c4, start, slot, shot);
  }

  /**
   * THROW-INTERRUPT (research 326 §2.4): a hand throwable's release request, on the page's last command; the seq it named,
   * which the `throw` echoes as `start`, or null when no room is open. LATER 1456: stamped with the last `hurt.n` heard.
   */
  throwStartEvent(kind: string, slot?: number): number | null {
    return this.throwWire.throwStartEvent(kind, slot, this.lastHurtN ?? undefined);
  }

  /**
   * LATER 1456 (research 85 §4.3; a network adaptation): the serial `n` of the last `hurt` this page heard, echoed on its
   * `throwStart` (`hurt`) so the room refuses a request sent before the page saw the hurt that cancelled it. 0 from its
   * own `spawn` heard (the room zeroes the serial there); null -- unstamped, kept by the room -- before a first spawn or
   * `hurt` and from a resume until the next `hurt` (the resume carries no serial: the named gap, research 85 §4.3).
   */
  private lastHurtN: number | null = null;

  /**
   * ROOM-HAND (LATER 652; ROOM_HAND_TRUST_ADAPTATION, `packages/match/src/room.ts`; reading, pending review): the
   * selected non-firearm, non-launcher item in the hand (`./matchThrow` `handItemId`), or null for the firearm, told to
   * the room on the last command sent (the room takes it from `seq + 1`) -- a player's only, and only when it changes
   * from the last told on THIS client: a new client (a reconnect, a resume, a hand-off) starts from null, as the room's
   * hand does at a join and a spawn (`Player.hand`), and a welcome and a resume tell the item up again (`retellHand`). The original carries the item every frame (`FUN_002bd640`,
   * D:L162059-162066); the port tells only its changes (the protocol's `hand` doc).
   */
  handEvent(item: number | null): void {
    // the review's F1: between a resumed welcome and its resume `NetClient.send` drops it -- not told, so not recorded
    if (this.client.state !== 'open' || this.client.role !== 'player' || this.client.awaitingResume?.() === true) return;
    const last = this.handTold?.client === this.client ? this.handTold.item : null;
    if (item === last) return;
    // the review's F2: never before this client's held press rounds (LATER 347, named at `max(after + 1, seq)` by
    // `flushPressRounds`), so the room reads no item at their commands ('fire: hand')
    const seq = this.firearmWire.handSeq(this.client, this.client.lastSeq());
    this.client.send({ type: 'hand', seq, item });
    this.handTold = { client: this.client, item };
  }
  /**
   * ROOM-HAND (the task-2 review's F1): the room's hand starts at null at a welcome (a new seat) and at a resume
   * (`room.ts`, "the new page tells its own hand"): the item up now told again (a resumed welcome's waits for its resume).
   */
  private retellHand(): void {
    this.handTold = null;
    this.handEvent(this.deps.handItem?.() ?? null);
  }
  /** ROOM-HAND: the item last told, and the client it was told on (another client's start is null). */
  private handTold: { client: NetClient; item: number | null } | null = null;

  /** PF-34 (research 234 s3): the action button's claim of a weapon drop, at the last command sent; a player's only. */
  pickup(did: number): boolean {
    if (this.client.state !== 'open' || this.client.role !== 'player') return false;
    this.client.send({ type: 'pickup', seq: this.client.lastSeq(), did });
    return true;
  }

  /**
   * HX-4a (research 239 s3; ruling HX.R7): the action button's order to a hostage -- FOLLOW! (4) or HOLD POSITION (5) --
   * with the page's aim as `fire` carries it (the walk's eye, the unit direction to its far point: `WalkMode.fireAim`),
   * at the last command sent; a player's only, with an aim. The room runs the issuer's console's test
   * (`./net/hostageOrder`) and answers in `hostageState`. LATER 853: with the page's playout clock (`viewTick`), the tick
   * it draws the hostages at, so the room's pick meets them there (the room's `ORDER_REWIND_ADAPTATION`).
   */
  hostageOrder(hostage: number, cmd: 4 | 5): boolean {
    if (this.client.state !== 'open' || this.client.role !== 'player') return false;
    const aim = this.deps.walk.fireAim?.();
    if (!aim) return false;
    const d = [aim.far[0] - aim.eye[0], aim.far[1] - aim.eye[1], aim.far[2] - aim.eye[2]];
    const l = Math.hypot(d[0]!, d[1]!, d[2]!);
    if (!(l > 0)) return false;
    this.client.send({
      type: 'hostageOrder', seq: this.client.lastSeq(), hostage, cmd,
      eye: [aim.eye[0], aim.eye[1], aim.eye[2]], dir: [d[0]! / l, d[1]! / l, d[2]! / l], viewTick: this.client.viewTick(),
    });
    return true;
  }

  /**
   * HX-4a: the YES at the body (`escorteeVoice`) when a hostage's unit moves into or out of the escortee unit 17 -- a
   * FOLLOW, a HOLD, the UnitTick's HOLD (OnCommand cases 4 and 5 say YES whenever they move it, D:L450379, D:L450537);
   * the welcome's list seeds the units; not on the first state a page sees of a hostage it was not told of, nor on a
   * round's reset (the units are forgotten at `roundStart`).
   */
  private escorteeYes(ev: Extract<ServerEvent, { type: 'hostageState' }>): void {
    const was = this.escorteeUnits.get(ev.id);
    this.escorteeUnits.set(ev.id, ev.unit);
    if (was === undefined || was === ev.unit || (was !== 17 && ev.unit !== 17)) return;
    const h = this.hostageMap.get(ev.id);
    this.deps.escorteeVoice?.(ev.id, 'yes', this.deps.remote.feet?.(ev.id) ?? null, h && 'character' in h ? h.character : null);
  }

  /**
   * Web sprint 5 S3 (W5.R1, `ARMORY_CLOCK_READING`): in the round-end interval, the seconds until the next round -- the
   * engine's read (3 s) and the screens the server named, counted from the `roundOver` -- else null (a round in play, the
   * waiting room). The ARMORY opens in it, and is pulled out 5 s before its end (`UiBackToLobby`, research 95 §4.1).
   * LATER 74's review F1: counted from the room's own start on a late page whose screens open at its own (`roomStart`):
   * the next round is the room's (`room.ts` `nextAt`, from its result).
   */
  nextRoundIn(): number | null {
    const sc = this.screens;
    if (!sc || this.client.role !== 'player') return null;
    const total = ENGINE_READ_S + sc.list.reduce((a, b) => a + b.seconds, 0);
    return Math.max(0, total - (this.now() - (sc.roomStart ?? sc.start)) / 1000);
  }

  /** The match server's name for the ARMORY's title bar (`MEDIUS_LOBBY_NAME`), or null before the welcome. */
  serverName(): string | null {
    return this.server;
  }

  /** PAR-91: the room's rules, the welcome's (the page's asked rules before one); the own corpse's rule reads them. */
  roomRules(): Rules {
    return this.rules;
  }

  /** PF-40: the room's game type, the welcome's (`NetClient.gameType`); null before one or when the server sent none. */
  gameType(): GameType | null {
    return this.client.gameType();
  }

  /**
   * HX-5 (research 239 s5, `./hostageMarks`): the compass marks of EXTRACTION now -- each living hostage that has not
   * entered 0x11 this round (`MARK_REMOVED_ON_RESCUE_READING`) where the shared `remote` draws it (else where the welcome
   * stood it), and each kind-1 zone's centre of `ai` (the loaded map's `AIMAPS.MPS`); none before a welcome's hostages.
   * The HUD takes them by `Hud.setHostageMarks` once a frame (the wave-4 line, research 239 s7.2).
   */
  hostageMarks(ai: AiMaps | null | undefined, extra: readonly (readonly number[])[] = []): CompassMark[] {
    if (!this.hostageMap.size) return [];
    if (ai !== this.zonesOf.ai) this.zonesOf = { ai, points: extractionPoints(ai) };
    const list = [...this.hostageMap.values()].flatMap((h) => {
      const at = this.deps.remote.feet(h.id) ?? ('at' in h ? h.at : null);
      return at ? [{ at, alive: h.alive, rescued: h.ai === 0x11 || this.hostageSaid.rescued.has(h.id) }] : [];
    });
    return hostageMarks(list, extra.length ? [...this.zonesOf.points, ...extra] : this.zonesOf.points);   // `extra`: a Forge layout's escort zones
  }

  /** HX-1: the hostages as the room last told them, by body id (the welcome's list, the `hostageState`s). */
  hostages(): ReadonlyMap<number, HostageWire | HostageStateWire> {
    return this.hostageMap;
  }

  /**
   * A player in a room no round has started in -- waiting alone for the other side, or in the launch countdown (the
   * hook's `net().waiting`). The owner's ruling of 2026-10-01 opened the ARMORY here with the Inventory button; the
   * owner's ruling of 2026-10-02 (INT.R3) retired that: in a match the ARMORY opens only on taking a seat, and the
   * room's rebuild of a waiting body on its close (`Room.rebuildWaiting`) stays, but no page of the product reopens the
   * ARMORY over a living waiting body now: the dev hook's `openArmory` does (grenadeSelfMp.spec). A spectator's never.
   */
  waitingRoom(): boolean {
    return this.client.role === 'player' && this.roomWaits;
  }

  /** The launch countdown started (`seconds`) or called off (null): the clock and the message window (OWNER_LAUNCH_COUNTDOWN_S). */
  private countdown(seconds: number | null): void {
    if (seconds === null) {
      if (this.launchAt === null) return;
      this.launchAt = null;
      this.deps.hud.setTimer(this.roundLength);
      if (this.client.role === 'player') this.deps.hud.postMessage(WAITING_LINE_READING);   // back to waiting for both sides
      return;
    }
    // The same countdown told again (a welcome's, then a broadcast: an older room, or one racing the seat) is not a new
    // one: the clock is set, the line is not posted twice (the sprint-5 fix). One called off and started again is new.
    const at = this.now() + seconds * 1000;
    const again = this.launchAt !== null && Math.abs(at - this.launchAt) < COUNTDOWN_SAME_MS;
    this.launchAt = at;
    if (!again) this.deps.hud.postMessage(countdownLine(seconds));
  }

  /** The welcome's or the promotion's `countdown` (seconds), else null. */
  private static countdownOf(ev: { countdown?: unknown }): number | null {
    return typeof ev.countdown === 'number' && Number.isFinite(ev.countdown) ? ev.countdown : null;
  }

  /**
   * R4P-248 (r0004's SetHealth, twin `0x0054c300`, D4:L453015): how many `hurt`s have left the own body alive with less
   * health -- the drops `ownHurt` is told of -- for the thrower's `GrenadeSource.hurts` (`./matchThrow`), which cancels a
   * release not yet out on each.
   */
  ownHurts(): number { return this.ownHurts_; }

  /** Whether one of the game's round screens is up (the page hides its reticle under it). */
  screenUp(): boolean {
    return this.roundScreen() !== null;
  }

  /** Seconds since the engine's read ended for the standing result (negative during it), else null: one clock read. */
  private screensElapsed(): number | null {
    const sc = this.screens;
    return sc ? roundScreensElapsed(sc, this.now()) : null;
  }

  /**
   * AD-12 (C07; LATER 52; research 315 §13): the last screen is held past the room's seconds -- `secondsLeft` 0
   * (ROUND COMPLETE's CountDown GO, P:L13741; GAME COMPLETE's client `CloseAndSwitch` and its watch loop,
   * P:L14616-14629), its `elapsed` running on -- until the room moves on: a client's `ReplayMission`
   * and `CloseAndSwitch` do nothing (`FUN_00280040` D:L127387-127393, `FUN_00281a70` D:L128114-128131; research 179
   * §6.18); the room's `roundStart` and `abandoned` clear `screens`, a rejoin's welcome sets them again, the return lets
   * the page go (`release`). A replay holds too, until the record's `roundStart`, `abandoned` or rejoin.
   */
  private roundScreen(elapsed = this.screensElapsed()): RoundScreen | null {
    const sc = this.screens;
    if (!sc || elapsed === null) return null;
    // Preserve the old clock-read boundary: no wall-clock read under the engine
    // delay or an empty list (the replay clock and page clock remain distinct).
    if (elapsed < 0 || !sc.list.length) return null;
    return roundScreenAt(sc, elapsed, this.rows, this.client.id, (performance.now() - this.joinedAt) / 1000);
  }

  /**
   * NU-4 D1 (research 317 R317.8, §5 D1; `DROP_SWEEP_AT_RESULT_READING`): the world drops emptied once a result, when
   * the engine's read ends -- `ENGINE_READ_S` after the `roundOver` (or a joiner's standing result, its clock started
   * in the past), the moment the round screens start (`roundScreen`). No wire event: the room sweeps its own set
   * `ENGINE_READ_S` after the tick it sent that `roundOver` on (`Room.step`, `lastResult.at`), so the page sweeps one
   * latency after the room, as the original's client sweeps on the host's state's arrival (`FUN_002aa490`
   * D:L151127-151131). No drop is laid meanwhile: a death lays none outside the round in play, a claim is refused
   * `'over'`. It takes the frame's own reading of the screens' clock (`screensElapsed`, the one `roundScreen` uses), so
   * the live path reads the clock no more often than before D1 (RE-3's digest, `netPageClock.test.ts`; was: a second
   * `this.now()` here, which moved the live outputs -- checkpoint 10's third cut).
   */
  private sweepDrops(elapsed: number | null): void {
    const sc = this.screens;
    if (!sc || elapsed === null || elapsed < 0 || this.dropsSweptFor === sc) return;
    this.dropsSweptFor = sc;
    this.deps.drops?.replaceAll([]);
    this.deps.roundEndEffects?.();                    // ROUND_END_EFFECTS_READING: the effects stop at the same moment
    this.deps.roundEndZoom?.();                       // ROUND_END_CAMERA_FOV_READING (R4P-234b): the view to zoom 1.0
  }

  /**
   * RELOAD-HITPOSE F1 (REMOTE_RELOAD_MOTION_READING): the mark an event on another body is heard under -- the newest
   * snapshot tick in hand (`NetClient.heardTick`) -- as the one argument to spread, or none before a snapshot (and on a
   * replay, whose `heardTick` names none): released at once then, as before.
   */
  private heardMark(): [] | [number] {
    const t = this.client.heardTick?.();
    return typeof t === 'number' ? [t] : [];
  }

  /** One frame; `real` the frame's real seconds (PAR-34, `./frameTime`; default `dt`), the bodies' timed fades' (`RemotePlayers.frame`). */
  frame(dt: number, camera: PerspectiveCamera, trigger: boolean, real = dt): void {
    this.retry();
    const elapsed = this.screensElapsed();
    this.deps.hud.setRoundScreen(this.roundScreen(elapsed));
    this.sweepDrops(elapsed);
    this.firearmWire.flushPressRounds();                       // LATER 347: a press's round, once the walk has sent its frame's commands
    this.setTrigger(trigger);
    const scale = (this.client as { dtScale?(): number }).dtScale?.() ?? 1;   // PT-19 (F2): the replay's speed, both clocks
    // PV-10a (finding 6): the view drawn last frame and switched off since (the pad runs after the frame in both pages'
    // loops): the body let go of the command clock before this read (`./matchNet` `spectatePovIdle`; only ever `false`).
    if (this.povShownLast && !this.spectator.povShown) this.deps.spectatePovIdle?.();
    this.deps.remote.setBound?.(this.spectator.boundId());   // LATER 1051: the footfall cap's listener off the own body (FUN_00551ec0 D:L418506-418507)
    // RELOAD-HITPOSE F1: the drawn tick, which releases the others' events heard under a mark (`RemotePlayers.frame`)
    this.deps.remote.frame(dt * scale, this.client.bodies(), camera, real * scale, this.client.shownTick?.());
    // R4P-253: another player's waiting shots, one a game frame each (FUN_005e6400 D:L497481), the bodies posed first.
    for (let t = this.shotTicks.advance(dt * scale); t > 0; t--) this.drainShots();
    this.joinLeave.frame(real);                    // JOIN-LEAVE-LINE: a leave's line, once no `joined` of its seat came
    this.deps.roundAudio?.frame();                 // INT.R7: the round's cues that are due
    this.spectator.frame(cameraEye(camera), real); // PF-31: the follow, the scenic view (W6: its look and zoom in real seconds), the watched teammate
    this.povShownLast = this.spectator.povShown;
    if (this.launchAt !== null) this.deps.hud.setTimer(Math.max(0, (this.launchAt - this.now()) / 1000));
    else if (this.endsAt !== null) this.deps.hud.setTimer(Math.max(0, (this.endsAt - this.now()) / 1000));
  }

  /**
   * PF-31: the pad, once a frame (`./main`'s and `./matchMount`'s pad frames): the spectator's and the benched player's
   * controls on release. PV-6b (POV_VIEW_ADAPTATION): while the scoreboard is up -- the pad's SELECT held, the state both
   * pages show it from (`./main`, `./matchMount`: `padMerged.scoreboard`; the keyboard's Tab counts there only while the
   * walk walks, where no body is followed) -- Cross's running hold is voided before the sample (so a hold reaching its
   * threshold on that very sample switches nothing) and after it (so one begun on it never does): its release is today's.
   */
  spectatorPad(input: Input, r1?: boolean): void {
    if (input.scoreboard) this.spectator.voidHold();
    const menu = DEAD_CYCLE_WHILE_MENU_READING === 'blocked' && (this.deps.menuOpen?.() ?? false);
    this.spectator.pad(input, menu);
    if (input.scoreboard) this.spectator.voidHold();
    // SEAT_CLAIM_ADAPTATION (`./seatClaim`): R1 (or J) held over an offer claims a seat, or leaves the line; never under the
    // menu or the scoreboard -- a hold they cover is void until the button's release (`SeatClaimHold`: an offer lost).
    const offer = this.seatClaimOffer();
    // `r1`: the R1 button held on the pad or the touch layer (the page's held buttons), whatever the layout's lanes
    const down = seatClaimHeld({ r1, fire: input.fire, key: this.claimKeyDown });
    const held = offer !== null && offer.kind !== 'coming' && !menu && !input.scoreboard ? offer : null;   // a held seat's line is no control
    if (this.claimHold.take(down, held !== null, performance.now()) && held) this.claimSeat(held);
  }

  /** SEAT_CLAIM_ADAPTATION: the claim this page's state offers now (`./seatClaim` `seatClaimOffer`), or null. */
  private seatClaimOffer(): SeatClaimOffer | null {
    // a page that cannot play is offered none (`NetPageDeps.noSeatClaim`)
    const offer = this.deps.noSeatClaim ? null
      : seatClaimOffer({ seats: this.client.seats, role: this.client.role === 'player' ? 'player' : 'spectator', queue: this.client.queue, coming: this.client.seatComing });
    const at = performance.now();
    if (offer === null) this.claimOffered = null;
    else if (this.claimOffered?.kind !== offer.kind) this.claimOffered = { kind: offer.kind, since: at };
    return offer;
  }

  /** SEAT_CLAIM_ADAPTATION: the hold's act -- a claim from watching (free or full), or the queue left. */
  private claimSeat(offer: SeatClaimOffer): void {
    this.client.seatClaim(offer.kind !== 'queued');
  }

  /**
   * SEAT_CLAIM_ADAPTATION: the offer's line for the HUD (`./hudLayout` `HudSpectatorView.claim`) on `device` -- its words,
   * its share of the help's alpha (a free seat's breath) and the hold's share done (the ring) -- or null with none.
   */
  seatClaimView(device: SeatClaimDevice): { line: string; at: number; share: number; hold?: number } | null {
    const offer = this.seatClaimOffer();
    if (offer === null) return null;
    const now = performance.now();
    const line = seatClaimLine(offer, device);
    const hold = line.at >= 0 ? this.claimHold.progress(now) : undefined;   // SEAT_CLAIM_NO_PAD_ADAPTATION: no button, no ring
    return { ...line, share: seatClaimPulse(offer, (now - (this.claimOffered?.since ?? now)) / 1000), ...(hold !== undefined ? { hold } : {}) };
  }

  /**
   * PF-31 (the review's gate): whether the pad is the spectator's -- a spectator, or a benched player (classic's dead, a
   * ghost) -- so `./main`'s and `./matchMount`'s fly camera leaves Triangle (`input.stance`, the jump to the visible
   * player) out of its lift: the original's free camera reads the sticks only (research 232 s5.7's risk).
   */
  spectatorCamera(): boolean {
    return this.client.role === 'spectator' || this.spectator.benched;
  }

  /** PF-28 (research 231 s4.3): where the welcome's join envelope goes on this page (`./joinState` `applyJoinState`). */
  private joinSinks(self: number): JoinSinks {
    // The page's own projectiles, named by a rejoin's envelope, are skipped while it still flies its own (`ownProjectiles`).
    const ownHeld = this.deps.ownProjectiles?.() === true;
    return {
      screens: (start, list, winner, wins, stats) => {
        this.endsAt = null;
        // LATER 74 (research 315 §16): a late console opens its round screens at its own level start -- its first Mission
        // tick finding the host's told 4 or 6 pushes the exit state at once (FUN_002aa490 D:L151127-151135) -- so a welcome's
        // standing result older than this page opens at the page's start (`joinedAt`: the screens open `ENGINE_READ_S`
        // after `start`, so `start` goes no earlier than that much before it); a replay keeps the record's clock.
        const opened = this.replayClock() ? start : Math.max(start, this.joinedAt - ENGINE_READ_S * 1000);
        this.screens = { start: opened, list, winner, wins, stats, ...(opened !== start ? { roomStart: start } : {}) };
      },
      projectile: (kind, from, velocity, owner, pid, phase) => {
        if (owner === self && ownHeld) return;
        // LATER 931: a reloaded page (none of its own held) lays the seat's own as its own (`GrenadeCore.hydrateLive`).
        this.deps.remoteGrenade(kind, from, velocity, owner, pid, owner === self ? { ...phase, own: true } : phase);
      },
      corpse: (id, clip, ageS) => this.deps.remote.hydrateCorpse(id, clip, ageS),
      ghost: (id) => this.deps.remote.markGhost(id),
      drops: (all) => this.deps.drops?.replaceAll(all),       // PF-34: the room's set replaces the page's (a rejoin)
    };
  }

  /** The game's round start on the HUD, for this round of this room. */
  private roundBanner(round: number): void {
    const team = this.localTeam(), code = team === 'seal' ? 0 : team === 'terrorist' ? 8 : 16;
    const lines: readonly ObjectiveLine[] = this.deps.objective?.()?.[code] ?? [];
    // A line whose text did not read (a locale id without its table) is left out, never shown as its id; its wait kept.
    const objective: { text: string; scale: number; waitBefore: number }[] = [];
    let carried = 0;
    for (const l of lines) {
      if (l.text === null) { carried += l.waitBefore; continue; }
      objective.push({ text: l.text, scale: l.scale, waitBefore: carried + l.waitBefore });
      carried = 0;
    }
    this.deps.hud.startRound({ round, rounds: this.rounds, objective });
  }

  /** Back in play (a spawn, a new round): the bench and its camera left. */
  private unbench(): void {
    this.spectator.reset();
  }

  /**
   * Seated as a ghost (a classic round in play): benched until the next round, WEAPON EXCHANGE's ghost prompt up.
   * NU-11b F1 (research 314 §4.3; NU-11's review F1): the walker in the dead state from the seat, as a classic dead
   * player's (`NetClient`'s `kill` -> `WalkMode.setDead`): the ghost set-up puts the local actor in the death state at its
   * spawn (`FUN_002b7d60` D:L158634-158638 -> `FUN_00543d50` D:L410437, state 8). The walk is already locked by the client
   * until a spawn (no stick, no jump); dead, it also refuses the look, the fire, the reload, the throw and the actions,
   * and takes the death camera (`FUN_00297410` D:L140893-140913: the player's actor in state 8; its mode 6 with no killer
   * named, `GHOST_DEATH_CAMERA_READING`). Alive again at its spawn (`NetClient.spawned`) or at the page's close or drop
   * (`deathOff`).
   */
  private seatGhost(): void {
    this.spectator.bench();
    this.ghostSince = performance.now();
    this.ghostDead = true;
    this.deps.walk.setDead?.(true);                  // test stand-ins carry none (netRules.test.ts's walk)
  }
  /** NU-11b F1: the walk made dead by `seatGhost`, not by the client's `kill` (whose `release` gives that one back). */
  private ghostDead = false;

  /**
   * NU-11b H2: the seat a late joiner's ghost until its spawn (`seatGhost`), for the mounts' `Play.frame` (its own body
   * unseen); false for a classic dead player, whose corpse PAR-91 keeps (the gameplay seat's condition 3). Not
   * `prompt()`'s `ghost`: the prompt is null while the ghost watches a teammate (S6). And only while its walk is the
   * ghost's dead one (`ghostDead`): a drop gives the walk back alive (`retry` -> `deathOff`), and a walk that moves is
   * drawn (the review's F1). LATER 266 uses the same render gate for a respawn seat dead at load: alpha zero already
   * (`FUN_00543d50` D:L410440; research 322 §5.3), with the ordinary dead prompt and Action path, no ghost input gate.
   */
  ghost(): boolean {
    return (this.ghostSince !== null && this.ghostDead) || (this.dead?.atLoad === true && this.client.state === 'open');
  }

  /** The local seat's side for the round's cues: a player's team, null for a spectator (`player_team` 16). */
  private localTeam(): Team | null {
    return this.client.role === 'player' ? this.client.team : null;
  }

  nameOf(id: number): string {
    return this.names.get(id) ?? `Player${id}`;
  }

  isBot(id: number): boolean { return this.bots.has(id); }
  displayNameOf(id: number): string { return botDisplayName(this.nameOf(id), this.isBot(id)); }
  private seatBot(id: number, bot?: true): void { if (bot === true) this.bots.add(id); else this.bots.delete(id); }

  /** LATER 498: an own spawn the client holds (`spawnPending`), run when its retried respawn stands (`onSpawnHeld`). */
  private heldSpawn: Extract<ServerEvent, { type: 'spawn' }> | null = null;

  /** This page's own spawn: the death and ghost states left, the HUD's health, the server's kit (at once, or held: 498). */
  private ownSpawn(ev: Extract<ServerEvent, { type: 'spawn' }>): void {
    const hud = this.deps.hud;
    this.heldSpawn = null;
    this.throwWire.clearPending();                      // a stale pre-spawn throw cannot refund the new kit
    this.dead = null; this.ghostSince = null; this.unbench(); hud.setHealth(1); this.deps.walk.setDeathPose(null);
    // HOTFIX spin-spectate: the seat's own spawn always stands the walk alive. A ghost welcome replayed after the client's
    // `spawned` already ran (the lobby's events, `adopt.events`: a spawn heard on the lobby's idle walk) left the walk dead
    // with nothing to revive it. `ownSpawn` runs only with no spawn held (LATER 498: a held one runs here once the
    // client's retry stands it), so this never overrides a respawn the walk refused.
    if (this.ghostDead) this.deps.walk.setDead?.(false);
    this.ghostDead = false;                                   // NU-11b F1: the client's `spawned` gave the walk back alive
    this.notice(null);                                        // OT.R59 (RECONNECT-GHOST (B)): the reconnect's line goes at its spawn
    this.deps.respawned(ev.kit ?? null, ev.char ?? null);   // the server's kit and type at this spawn (room.ts)
    // SEAT_CLAIM_ADAPTATION: the first spawn of a seat promoted from watching stands the flown camera on foot (the
    // spectator's welcome flew it, `spectatorWelcome`); a walk that cannot yet keeps the ask for the next spawn.
    if (this.walkAtSpawn && (this.deps.walk.mode() === 'walk' || this.deps.walk.setMode('walk'))) this.walkAtSpawn = false;
  }

  /** PF-31 / PAR-48: the map's scenic views as the spectator reads them (`NetPageDeps.scenicViews`), for the HUD's title. */
  scenicViews(): readonly ScenicView[] {
    return this.deps.scenicViews?.() ?? [];
  }

  private spectatorWelcome(position: number): void {
    this.deps.walk.setMode('fly');
    if (position > 0) this.deps.hud.postMessage(queueLine(position));   // a watcher is not in the line
  }

  /**
   * R4P-253: another player's ray into its queue for display, a PULL a count entry (the review's F1). The copy's count
   * `+0x224` gains one a pull: `FUN_002bbf10` bumps the fire byte only on a pull's first pellet (the kit's pellet index
   * `+0x880` 0, D:L479495; `FUN_005be9a0` sets and steps it per pellet, D:L475586, D:L475676). The room's `shot` names
   * no pull (no tick, seq or pellet index on the wire), so the page groups them: a ray joins its shooter's newest pull
   * when it names the same item from the same `from` (one command's muzzle), within one game frame of the pull's first
   * ray, while the pull holds fewer than the record's `NumProjectilesFired` (`pelletsOf`) -- a page-side grouping, the
   * room unchanged. A new pull is dropped at `REMOTE_SHOT_QUEUE_CAP_READING` waiting (`FUN_002be150`'s clamp,
   * D:L162443-162455), its later rays with it; while the page shows nothing (`displayIdle`) it is shown at once.
   */
  private queueShot(ev: RemoteShot): void {
    const open = this.openPulls.get(ev.id);
    if (open && open.weapon === ev.weapon && sameV3(open.from, ev.from) && open.rays.length < open.pellets && this.shotTick - open.tick <= 1) {
      open.rays.push(ev);
      if (open.state === 'shown') this.showRound(ev, false);   // the rest of a pull already shown: its impacts at once
      return;                                                  // waiting: shown with its pull; dropped: dropped with it
    }
    const pull: ShotPull = { weapon: ev.weapon, from: ev.from, pellets: pelletsOf(this.shotRecord(ev)), rays: [ev], tick: this.shotTick, state: 'waiting' };
    this.openPulls.set(ev.id, pull);
    if (this.displayIdle()) { this.flushShots(); this.showPull(pull); return; }
    const waiting = this.remoteShots.get(ev.id) ?? [];
    if (waiting.length < REMOTE_SHOT_QUEUE_CAP_READING) waiting.push(pull);
    else pull.state = 'dropped';
    this.remoteShots.set(ev.id, waiting);
  }

  /** R4P-253: one game frame of CRemoteCtrl::PreTick (`FUN_005e6400` D:L497481): each shooter's next waiting pulls shown. */
  private drainShots(): void {
    this.shotTick++;
    for (const [id, waiting] of this.remoteShots) {
      for (const pull of waiting.splice(0, REMOTE_SHOT_DRAIN_PER_TICK_READING)) this.showPull(pull);
      if (waiting.length === 0) this.remoteShots.delete(id);
    }
  }

  /** R4P-253 (the review's F2): every waiting pull shown now, in order -- at a hide, or a pull arriving while nothing is drawn. */
  private flushShots(): void {
    for (const waiting of this.remoteShots.values()) for (const pull of waiting) this.showPull(pull);
    this.remoteShots.clear();
  }

  /**
   * R4P-253 (the review's F1): a pull shown in one game frame -- its first ray whole (the muzzle, the tracer, the report,
   * the passing sound and the threat: the copy's one CZKit::Fire `FUN_005c5340` a pull, `FUN_005e6400` D:L497487-497493),
   * the others their impacts alone (`roundImpact`), so a remote shotgun pull plays one report.
   */
  private showPull(pull: ShotPull): void {
    pull.state = 'shown';
    pull.rays.forEach((ray, i) => { this.showRound(ray, i === 0); });
  }

  /**
   * R4P-253 (the review's F2; a browser adaptation): nothing is drawn -- the tab is hidden (as `./matchFirearm`'s
   * `pageHidden`, whose effect runs it skips while the reports still play) or the frame held (`displayHeld`, PK-3) -- so
   * no `frame` drains the queue, and another player's shots are shown on arrival instead.
   */
  private displayIdle(): boolean {
    return shotDocument()?.hidden === true || this.deps.displayHeld?.() === true;
  }

  /**
   * The record of a shot's item (protocol 7): its record by id (the kit table's), else the side's slot that holds it.
   * R4P-253 (review 2, finding 3): `queueShot` takes a pull's pellet count from it. Every page that builds a NetPage --
   * `./main`'s live, loopback and both replay pages and `./matchMount`'s lobby match -- spreads `./matchNet`
   * `matchNetDeps`, whose `recordOf` answers any item of the map's arsenal table by id (shotguns included), so the
   * slot fallback (one pellet: a pull's rays shown one a frame) is reached only before the map's table is loaded or by
   * a test page without the dep.
   */
  private shotRecord(ev: Extract<ServerEvent, { type: 'shot' | 'impact' }>): WeaponRecord {
    const side = this.deps.weapons(this.sideOf(ev.id) ?? 'seal');
    return this.deps.recordOf?.(ev.weapon) ?? side.find((r) => r.id === ev.weapon) ?? side[0];
  }

  /**
   * A round shown: another player's `shot` at its display (R4P-253), the page's own `impact` on arrival. `whole` false
   * (R4P-253, the review's F1): a pull's ray after its first -- its impact and through-surfaces alone, no muzzle, tracer
   * or report, and no step of the tracer count (the kit's `+0x878`, stepped once a CZKit::Fire, D:L479284, D:L479362).
   */
  private showRound(ev: Extract<ServerEvent, { type: 'shot' | 'impact' }>, whole = true): void {
    // INT-NET-2: the page's own round comes back only when a body stopped it (the room's hit, never predicted), as an
    // `impact`: its impact alone, once a shot (research 91 section 23; OWN_BLOOD_READING). A `shot` of its own id is
    // never the room's (review finding 1) and plays nothing: the page drew its own round.
    const own = ev.type === 'impact';
    if (ev.id === this.client.id ? !own : own) return;
    const w = this.shotRecord(ev);                 // protocol 7: the item that fired, by id
    const count = (this.tracerRounds.get(ev.id) ?? 0) + (whole ? 1 : 0);
    if (whole) this.tracerRounds.set(ev.id, count);
    const mine = this.localTeam();
    const theirs = this.sideOf(ev.id) ?? null;
    const e: Extract<FireEvent, { type: 'round' }> = {
      type: 'round', weapon: fireWeaponOf(w), from: ev.from, to: ev.to, hit: ev.normal !== null, rounds: 0,
      normal: ev.normal, material: ev.material,
      // The page's own round already drew its tracer. Another's uses the same every-fourth rule on the shots
      // this page has seen (research 89 §4, §19). P12b (match `room.ts` SHOT_EVENT_BODIES_READING): its tracer runs to
      // the round's end (`end`, when `to` is the first body), as the shooter's own does; the impact stays at `to`.
      // LATER 644: every round keeps that end, tracer or not -- the passing sound walks the whole path (research 81).
      ...(ev.type === 'shot' && whole && tracerRound(ev.weapon, count)
        ? { tracer: true as const, tracerKind: tracerKindFor(ev.weapon, mine !== null && theirs === mine) }
        : {}),
      ...(ev.type === 'shot' && ev.end ? { tracerTo: ev.end } : {}),
    };
    if (own) this.deps.roundImpact?.(e);
    else {
      if (whole) this.deps.roundEffects(e, ev.id);
      else this.deps.roundImpact?.({ ...e, tracer: undefined, tracerKind: undefined, tracerTo: undefined });   // R4P-253 (F1): a pull's later ray
      // P12 (SW-3; match `room.ts` SHOT_EVENT_THROUGH_READING): every other world surface the round struck, an impact
      // each -- no second muzzle, tracer or report (`roundImpact`, the impact alone), as the shooter's page plays its
      // own through-surfaces (`./matchFirearm`). Never on the page's own `impact`: its own walk drew them.
      for (const t of ev.type === 'shot' ? ev.through ?? [] : []) {
        this.deps.roundImpact?.({ ...e, to: t.point, normal: t.normal, material: t.material, hit: true, tracer: undefined, tracerKind: undefined, tracerTo: undefined });
      }
    }
  }

  private event(ev: ServerEvent): void {
    const { remote, hud } = this.deps;
    switch (ev.type) {
      case 'gameLobby': this.deps.equipmentLimit?.(this.client.eqLimit); break;
      case 'welcome':
        this.roomRepass = false; this.roomRepassed = false;   // SA-7h S5: a seat held, the re-pass may answer a later refusal again
        this.gameRetoken = false; this.gameRetokened = false; // SA-41: and the re-token a later held hello's refusal
        // A new seat has no standing votes; a resumed one keeps only still-present teammates' flags.
        if (!ev.resumed) this.myVotes.clear();
        else for (const id of this.myVotes) {
          if (!ev.players.some((p) => p.id === id && p.team === ev.team)) this.myVotes.delete(id);
        }
        this.voteMenu = false;
        this.teams.clear();
        this.bots.clear();
        this.joinLeave.clear();                          // JOIN-LEAVE-LINE: the roster is this welcome's
        this.matchOn = ev.phase !== undefined ? ev.phase !== 'waiting' && ev.phase !== 'loading' && ev.phase !== 'over' : ev.startTick !== undefined;
        this.welcomed = true;
        this.closing = false;                            // NET-DRAIN: rejoined
        this.closingSince = null;
        this.hold(true);                                 // HARD-SEAT: the accepted hello holds the session
        this.server = ev.server ?? null;
        this.deps.equipmentLimit?.(this.client.eqLimit);
        this.reconnect.attempts = 0;
        this.reached = true;                             // SA-57: at a welcome only
        this.droppedAt = null;                           // NET-RES-2d: back
        this.helloSince = null;                          // SA-57: welcomed, never timed out by the hello's wait
        this.escorteeUnits.clear();                     // HX-4a: a join sees each hostage's unit afresh (no YES)
        this.names.set(ev.id, ev.name);
        remote.setRaiseField?.(ev.version >= RAISED_SINCE_PROTOCOL);   // ER-2: a replay before 14 keeps the copies' inference
        if (ev.role === 'spectator') this.spectatorWelcome(ev.queue);
        for (const p of ev.players) {
          this.seatBot(p.id, p.bot);
          this.names.set(p.id, p.name); this.teams.set(p.id, p.team); remote.setTeam(p.id, p.team);
          remote.setCharacter?.(p.id, p.character ?? null);
          if (p.char !== undefined) remote.setType(p.id, p.char);     // protocol 9: each body's type, its model
          if (p.kit) remote.setKit(p.id, p.kit);                     // protocol 7: each body's kit, for its holsters
        }
        if (ev.team) this.teams.set(ev.id, ev.team);
        if (ev.role === 'player' && ev.team) this.deps.teamChanged?.(ev.team);
        this.rules = ev.rules ?? this.rules;
        remote.setRules?.(this.rules);                  // NU-4: the corpse rule's (research 317 s5 B1; test stand-ins carry none)
        this.tellRefill();                              // NET-REFILL: the room's rules to the page's `Fire`
        this.rounds = ev.rounds ?? MAX_ROUNDS;
        // AD-9's reset is the level's init (FUN_001ec480 D:L50946) and the turnover's; a replay seek's welcome is the
        // fold's carrier (W37.R4), no entry: the watcher's camera is kept (as RE-3 keeps the countdown, PAR-94d the banner).
        if (!this.replayClock()) this.unbench();
        // R4P-253: the port's own lifecycle, not read from the original (whether the copy's count `+0x224` survives a
        // round, a respawn or a rejoin is unread): a join's or a replay seek's state shows no shot sent before it.
        this.remoteShots.clear(); this.openPulls.clear();
        this.dead = null;
        this.ghostSince = null;
        // The ghost's lines are WEAPON EXCHANGE's prompt (S1g, `./weaponSelect` `promptLines`), drawn by the overlay.
        // Not launched: the waiting line, or the owner's launch countdown (2026-10-01) -- no round banner either way.
        const countdown = NetPage.countdownOf(ev);
        // RE-3 (research 249 §4), the replay mode's seek: a countdown the page already holds is kept, so the fold's welcome
        // into it posts no second line (`countdown`'s same-countdown test, on the replay's clock).
        if (!this.replayClock() || countdown === null) this.launchAt = null;
        this.roomWaits = ev.role === 'player' && !ev.ghost && (ev.waiting === true || countdown !== null);
        // GHOST-BANNER (LATER 81; research 322 s5.2): a late ghost's console sees the round's banner -- its load state makes
        // the ghost (`FUN_001f5e70` D:L55680-55681 -> `FUN_002b7d60` D:L158633-158638), then CoreState's init posts the
        // banner, no seat tested (`FUN_001ec480` D:L50946 -> `FUN_002a7d40` D:L149758 -> `FUN_001fb420` D:L57632-57649);
        // the ghost's lines are the help lines beside it (`FUN_001f97b0` D:L57112 keeps the message window shown).
        if (ev.role === 'player' && ev.ghost) { this.seatGhost(); this.roundBanner(ev.round ?? 1); }
        else if (ev.role === 'player' && ev.waiting) hud.postMessage(WAITING_LINE_READING);
        else if (countdown !== null) this.countdown(countdown);
        else if (ev.role === 'player' && !ev.resumed) this.roundBanner(ev.round ?? 1);   // OT.R59: a resumed seat's round goes on
        // PAR-94d (research 322 D7): a spectator welcomed into a round under way starts it, as its console's level init
        // does (`FUN_002a7d40` from CoreState's Init, D:L50946 -> `FUN_001fb420` D:L57632-57649, no seat tested); none in
        // a room no round has started in (`phase` 'waiting' or 'loading', or none told), nor for the replay's watcher,
        // whose welcome is a seek's (RE-3).
        else if (ev.role === 'spectator' && !this.replayClock() && ev.phase !== undefined && ev.phase !== 'waiting' && ev.phase !== 'loading') this.roundBanner(ev.round ?? 1);
        // OT.R59 (RECONNECT-GHOST (B)): a rejoin seated a ghost is told so, held until its next spawn.
        this.notice(ev.role === 'player' && ev.ghost && this.seatedBefore ? RECONNECT_GHOST_LINE_ADAPTATION : null);
        this.seatedBefore = true;
        // A rejoin asks for the name the room gave this page (the name is for display: the room knows the page's record
        // by its session token, S2 round 4, `deps.session`).
        this.name = ev.name;
        // Protocol 9: the page holds the type the room seated (`char`); protocol 7: a (re)join seats a new player, the
        // side's picks go again (a pick survives a reconnect).
        this.seat(ev.team, ev.role === 'player', NetPage.seatChar(ev));
        if (ev.role === 'player' && ev.armory) this.armorySeat();   // S3: the ARMORY opens on the seated type
        // OBF-7's review (F1): a live (re)join's screens are the welcome's alone -- cleared here and set again by the join
        // envelope's standing result (`joinSinks.screens`), so a page dropped under ROUND COMPLETE and back after the next
        // round's start holds no stale screens (`screenUp`, which silences the walk). A replay's seek keeps its own.
        if (!this.replayClock()) this.screens = null;
        this.damageAtWin = false;                       // WM-DATA-WIN: a (re)join's window is its own (`damageWindow`)
        if (ev.join) applyJoinState(ev.join, this.now(), ev.tick, this.joinSinks(ev.id), this.rules);
        // LATER 155: a welcome into a decided hold names what decided it -- the round's audio marked decided by it, silently
        // (`RoundAudio.markDecided`), so a plant or a defuse in the hold takes the hold's own rule. An older room's: unmarked.
        if (ev.phase === 'decided' && ev.decided) this.deps.roundAudio?.markDecided?.(ev.decided, this.localTeam());
        // HX-1: EXTRACTION's hostages for the joiner -- each body drawn as its escortee (HX-2's `setEscortee`, which also
        // keeps it out of the footfall cap), at its opacity (fading when rescued, 0x11), and a dead one laid as the join
        // envelope lays a corpse (`hydrateCorpse`, CORPSE_HYDRATE_READING: its clip at its age). NU-4 B4 (research 317
        // s1.7): at any age -- `FUN_005714b0` writes no alpha (`DEAD_IN_FADE_READING`); was: none past `BODY_FADE_S`.
        this.hostageMap.clear();
        const replay = this.replayClock();
        if (replay) {
          // RE-3, the replay mode's seek (research 249 §3-§4): the Lead and Rescue one-shots start empty, as a fresh
          // joiner's page does, so a seek back across a rescue puts its mark back; and where no clock runs at the target
          // the timer shows the figure the live page kept there.
          this.hostageSaid.lead.clear(); this.hostageSaid.rescued.clear();
          // LATER 31: the others' dances re-told from the fold (RE-1, after this welcome), not refused as seen before.
          remote.resetVictories?.();                    // (optional: the replay tests' stand-in drawers carry none)
          const figure = replay.stoppedFigure();
          if (figure !== null) hud.setTimer(figure);
        }
        for (const h of ev.hostages ?? []) {
          this.hostageMap.set(h.id, { ...h });
          this.escorteeUnits.set(h.id, h.unit);          // HX-4a: a joiner hears the YES on the first unit change
          remote.setEscortee(h.id, h.character);
          remote.setOpacity(h.id, h.opacity, h.ai === 0x11);
          if (!h.alive && typeof h.age === 'number') {
            const ageS = h.age / TICK_HZ;
            remote.hydrateCorpse(h.id, h.deathClip ?? null, ageS);
          }
        }
        this.retellHand();                              // ROOM-HAND (the review's F1): a new seat's hand starts at null
        break;
      case 'joined':
        // JOIN-LEAVE-LINE: before the maps below take the seat -- `seated` is what the page held until now.
        this.joinLeave.joined({ id: ev.id, name: ev.name, bot: ev.bot === true, self: ev.id === this.client.id, seated: this.teams.has(ev.id) && this.names.get(ev.id) === ev.name }, this.matchOn);
        this.seatBot(ev.id, ev.bot); this.names.set(ev.id, ev.name); this.teams.set(ev.id, ev.team); remote.setTeam(ev.id, ev.team); remote.setCharacter?.(ev.id, ev.character ?? null); break;
      case 'botCharacter': remote.setCharacter?.(ev.id, ev.character); break;
      case 'renamed': this.names.set(ev.id, ev.name); if (ev.id === this.client.id) this.name = ev.name; break;
      case 'left':
        // JOIN-LEAVE-LINE: before the maps below let the seat go -- the name is kept (a departed thrower's kill line reads it).
        this.joinLeave.left({ id: ev.id, name: this.names.get(ev.id) ?? '', bot: this.bots.has(ev.id), self: ev.id === this.client.id, seated: this.teams.has(ev.id) });
        this.remoteShots.delete(ev.id); this.openPulls.delete(ev.id); remote.forget(ev.id); this.teams.delete(ev.id); this.bots.delete(ev.id); this.myVotes.delete(ev.id); break;
      case 'deadAtLoad':
        if (ev.id === this.client.id && this.client.role === 'player' && this.rules === 'respawn') {
          // The load publishes a dead actor with alpha zero, not an ordinary visible death (research 322 §5.3).
          this.unbench();
          this.dead = { at: this.client.deadAtLoadAt() ?? performance.now() - Math.max(0, ev.age ?? 0) / TICK_HZ * 1000, help: true, atLoad: true };
          this.ghostSince = null;
          this.ghostDead = false;
          hud.setHealth(0);
          this.deps.died?.();
          this.deps.walk.setDeathPose(null);
          this.deps.walk.setDeathKiller(null);
          // B138 (the invite run): the load death's view is its own body's (LATER 90's reading for a promoted ghost,
          // `FUN_00599b60` D:L455701). A hand-off before the room's welcome replays the spectator's welcome, its promotion
          // and this death (`./lobbyMatch`'s kept events): the spectator's welcome flew the walk the client had placed
          // (`NetClient.rebind`), and no spawn follows a load death to give it back -- so it is given back here, where the
          // walker stands, and the respawn's ready (which reads the walk's mode) can hold.
          this.deps.walk.resumeBody?.();
        }
        break;
      case 'kill':
        if (ev.victimKind === 'hostage') {
          // HX-1 (HOSTAGE_KILL_LINE_READING; `FUN_00547860` D:L412863-412909's escortee `else`): no kill line; the body
          // plays its clip. The escortee's death voice (`.FEMALE_DEATH`) is HX-2's; the script's two lines HX-5's.
          const h = this.hostageMap.get(ev.victim);
          this.hostageMap.set(ev.victim, { ...(h ?? { id: ev.victim, ai: 0, leader: null, rescuer: null, opacity: 1, unit: 17 }), alive: false });
          remote.died(ev.victim, ev.clip, ...this.heardMark());   // RELOAD-HITPOSE F1: its reload stop on the drawn clock
          // HX-5 (research 239 s6): the script's SealKillN / HostKillN by the killer's side -- the stream, the line, WAIT 2,
          // the second line (`HOSTAGE_CUES_READING`, `PENALTY_LINE_READING`); none for a world kill (no valve moves).
          const side = ev.killer === null ? undefined : ev.killer === this.client.id ? this.localTeam() : this.sideOf(ev.killer);
          if (side) this.deps.roundAudio?.hostage?.(side === 'seal' ? 'killedBySeals' : 'killedByTerrorists', this.post);
          break;
        }
        // WM-13 (`damageKills`): the page's player's kills and his killer, for the panel's marks.
        if (ev.killer !== null && ev.killer !== ev.victim) {
          const k = this.damageKills;
          if (ev.killer === this.client.id) { k.round.mine.add(ev.victim); k.life.mine.add(ev.victim); }
          if (ev.victim === this.client.id) { k.round.me.add(ev.killer); k.life.me.add(ev.killer); }
        }
        {
          // A kept name is untrusted text (the area (c) re-read's finding 5): its marker bytes never draw a bot's gold initial (BNI.R1).
          const killerName = ev.killer === null ? plainBotText(keptName(ev) ?? '') || null : this.displayNameOf(ev.killer);
          // WM-DATA-FEED (look 3B2, INTAKE 47; a browser adaptation, `./killFeed`): `killLine`'s text in pieces, each name in
          // its side's colour (a seat the roster no longer holds, or a kept thrower's, colour 0), and the orange mark when the
          // line's subject is this seat or the player the view is bound to (`SpectatorView.boundId`, the view's one rule: a
          // spectator's followed player in follow, or the player's view over him; a benched watcher's teammate) -- decided by
          // id here, at the post, and kept by the line through an adopted seat's new id or a later spectate switch.
          const side = (id: number): Team | null => id === this.client.id ? this.localTeam() : this.sideOf(id) ?? null;
          const bound = this.spectator.boundId();
          const subject = killFeedSubject(ev.how, ev.killer, ev.victim);
          const marked = subject !== null && (subject === this.client.id || subject === bound);
          hud.postMessage([killFeedLine(ev.how, killerName === null ? null : { name: killerName, side: ev.killer === null ? null : side(ev.killer) },
            { name: this.displayNameOf(ev.victim), side: side(ev.victim) }, ev.weapon, marked, MESSAGE_SCALE)]);
        }
        // The room's voice gate (`FUN_0053b710`): a death within 3 s of the body's hurt voice comes `voiced: false`.
        // LATER 657: the death voice is the dying console's own -- the actor's +0x58 (`FUN_00547af0` D:L413024) reaches
        // its controller's +0x18, the local SEAL's `FUN_005979a0` (D:L454473-454480) playing 0x3c/0x3d, a remote body's
        // `FUN_005e6290` (D:L497312-497328) a valve clear and no voice -- so another's death plays none on this page. A
        // bot's is its AI controller's, on the console running it (`FUN_005714b0` D:L433901-433907): the offline match's
        // page runs the room (`solo`) and voices its bots; online the server runs them, and a page voices none.
        if (typeof ev.cause === 'number' && ev.voiced !== false && this.deps.deathVoice) {
          if (ev.victim === this.client.id) this.deps.deathVoice(ev.cause, null, null, this.deps.walk.feet());
          else if (this.deps.solo && this.isBot(ev.victim)) {
            this.deps.deathVoice(ev.cause, this.sideOf(ev.victim) ?? null, remote.playerType(ev.victim), remote.feet(ev.victim));
          }
        }
        if (ev.victim === this.client.id) {
          const at = performance.now(), clip = ev.clip;
          this.dead = { at, help: true };
          // Classic: benched; the dead's lines are WEAPON EXCHANGE's prompt (S1, `promptLines`), drawn by the overlay.
          if (this.rules === 'classic') this.spectator.bench();
          hud.setHealth(0);
          this.deps.died?.();                                       // FUN_00547af0: the zoom to 0, the camera at 1.0
          this.deps.walk.setDeathPose(clip ? () => deathPose(clip, (performance.now() - at) / 1000, this.deps.clips()) : null);
          // The death camera (`./deathCamera`): toward the killer (mode 3), or turning on its own for a death by no
          // other hand -- a suicide, a fall (mode 6; `FUN_002980d0` 141361-141375). The single-player match too
          // (`deps.solo`): SOLO_IS_NETWORK_READING (`./net/loopback`), never the offline mode 2.
          const killer = ev.killer;
          this.deps.walk.setDeathKiller(killer !== null && killer !== this.client.id ? () => {
            const b = this.client.bodies().find((x) => x.id === killer);
            return b ? [b.feet[0], b.feet[1], b.feet[2]] : null;
          } : null);
        } else remote.died(ev.victim, ev.clip, ...this.heardMark());   // RELOAD-HITPOSE F1: its reload stop on the drawn clock
        break;
      case 'spawn':
        this.seatBot(ev.id, ev.bot);
        if (ev.id === this.client.id) {
          // LATER 498 (a browser adaptation, LATER 496's page case: the original's spawn rebuild `FUN_00599b60` D:L455604
          // has no refusal): a spawn the walk refused waits for the client's retry -- the corpse keeps its death pose and
          // the HUD its health until the retried respawn stands it (`NetClient.onSpawnHeld`).
          // j5t3o2iU (the review's F2): the room made the body whole at this spawn, held or not -- the next hit is a drop
          // from full, a held spawn's window too.
          this.ownHealth = 1;
          this.lifeDamage = null;                         // WM-DATA: the life the report covered is over at his respawn
          this.damageKills.life = { mine: new Set(), me: new Set() };   // WM-13: and its kills
          // LATER 1456 (the review's F1): the room zeroed the seat's hurt serial at this spawn, so the page stamps 0 from
          // hearing it -- here, not at a held spawn's stand, which would overwrite a hurt heard in between.
          this.lastHurtN = 0;
          if (this.client.spawnPending?.() === true) this.heldSpawn = ev;
          else this.ownSpawn(ev);
        } else {
          remote.setCharacter?.(ev.id, ev.character ?? null);
          if (ev.char !== undefined) remote.setType(ev.id, ev.char);   // protocol 9: rebuilt as its type
          if (ev.kit) remote.setKit(ev.id, ev.kit);
        }
        break;
      // OT.R59 (RECONNECT-GHOST): the seat handed back alive -- the client stood the walk (`NetClient.resumed`); the page
      // lays the room's health, live kit and pouch (`kit`'s path: no refill) and leaves the death and ghost states.
      case 'resume':
        if (ev.id !== this.client.id) break;
        this.heldSpawn = null;                                  // LATER 498's review F3: this seat's resume stands it (another's never)
        this.throwWire.clearPending();                        // the authoritative snapshot supersedes predicted throw counts
        this.lastHurtN = null;                                // LATER 1456: no stamp until the resumed seat's next hurt
        this.dead = null; this.ghostSince = null; this.unbench(); this.deps.walk.setDeathPose(null); this.ghostDead = false;
        hud.setHealth(this.ownHealth = overall({ hp: ev.health, armour: ev.armour }));
        this.deps.kitChanged?.(ev.loadout, null, ev.rounds, undefined, {
          pouch: ev.pouch, held: ev.held, weapon: ev.weapon,
          ...(ev.equipmentSlots !== undefined ? { equipmentSlots: ev.equipmentSlots } : {}),
          ...(ev.detonator ? { detonator: true as const } : {}),   // LATER 1129: the room's kept Detonator
        });
        this.notice(null);
        this.retellHand();                              // ROOM-HAND (the review's F1): the room cleared the hand; after the kit
        break;
      case 'hurt': {
        // j5t3o2iU: a drop the body lives through rumbles the pad (`FUN_005477a0` -> `FUN_00597b00`), every one: the voice's
        // gate is the room's `hurtVoice`, not this. A lethal one is the death's rumble (`died`), no drop none.
        const health = overall({ hp: ev.health, armour: [] });
        if (typeof ev.n === 'number' && Number.isInteger(ev.n) && ev.n >= 0) this.lastHurtN = ev.n;   // LATER 1456: echoed on `throwStart`
        // R4P-248: the same drop is r0004's non-lethal SetHealth (D4:L453015), read by the thrower (`ownHurts`).
        if (health < this.ownHealth && !isDead({ hp: ev.health, armour: [] })) { this.ownHurts_++; this.deps.ownHurt?.(); }
        this.ownHealth = health;
        hud.setHealth(health);
        break;
      }
      // A player's flinch (the owner, 2026-10-02; `FUN_005a2690` -> `FUN_00588ab0`): its body plays the room's clip. The
      // page's own (MATCH-FIX-2: the game plays it on the victim's own actor first, `FUN_00588bc0` L460019) on its own
      // body, through the walk as its death clip is -- alive only; a second one starts over (`FUN_0058a4d0` pops the
      // first, L460018). In first person the body is not drawn and the eye is not the head's node (PLAT-36), but the
      // hidden body is posed: the muzzle the round leaves from and the posed root follow the clip (FLINCH_LAYER_PLACEHOLDER).
      // Research 303: another seat's VICTORY DANCE on its body (the room's variant, `elapsed` in for a joiner), or its stop;
      // the page's own is the action part's (`./matchActions`, `./victory` `VictoryPage`).
      case 'victory':
        if (ev.id !== this.client.id) remote.victory(ev.id, ev.serial, ev.clip, ev.elapsed);
        break;
      case 'flinch':
        if (ev.id !== this.client.id) remote.flinch(ev.id, ev.clip, ...this.heardMark());   // RELOAD-HITPOSE F1: its reload stop drawn
        else if (!this.dead) {
          let at = performance.now();
          const clip = ev.clip;
          // LATER 512: its clock settable (`PhasedPose.at`), so the walk draws it again from the phase a door push covered it at.
          const pose = Object.assign(() => flinchPose(clip, (performance.now() - at) / 1000, this.deps.clips()), {
            at: (seconds: number) => { at = performance.now() - seconds * 1000; },
          });
          // PAR-60: the room's window as the page's own stick cut it (the walk's commands already run; `room.ts` `flinchCut`).
          const cut = this.deps.walk.setFlinchPose(pose, flinchCutWindow(ev, clip, this.deps.clips())) ?? null;
          if (reloadInFlinch(this.firearmWire.reloadSeq, cut === null ? ev : { from: ev.from, until: cut })) this.deps.undoReload?.();   // PF-18: the room dropped it 'flinch'
        }
        break;
      // DOORS (research 92 section 2): a one-shot a map program pushed on a body -- the door's `ai::ANIMATE` `Open door`
      // on the presser, sent by `FUN_00588bc0`'s own Push Blend (D:L446413-446414) -- played as the flinch is: on another's
      // body whole (`pushMotion`), on the page's own through the walk with the room's cut window and no reload gate (the
      // push sets no motion flag 0x4). Additive: an older page ignores it, an older room never sends it.
      case 'motion':
        if (ev.id !== this.client.id) remote.pushMotion(ev.id, ev.clip);
        else if (!this.dead) {
          const at = performance.now(), clip = ev.clip, cut = flinchCutWindow(ev, clip, this.deps.clips());
          this.deps.walk.setFlinchPose(() => flinchPose(clip, (performance.now() - at) / 1000, this.deps.clips()),
            cut, { reloadGate: false, pushed: true, clip });
          // The door-open body hold (research 92 section 2, "The body under the door clip"; PTW.R3 with `room.ts`
          // `watchMoves`): the room's mover held the body from the window's start, a round trip ago -- the commands
          // this page ran since run again under it (`WalkMode.pushHeard`), their predictions the run's (`replayed`).
          this.deps.walk.pushHeard?.(cut, (after) => this.client.replayed(after));   // `?.`: a test page's stub walk
        }
        break;
      case 'blast':
        if (ev.ring) this.deps.ring?.(ev.ring.seconds, ev.ring.volume);   // the knock: `NetClient`
        if (ev.flash) this.deps.whiteOut?.(ev.flash);                      // P2: the room's level (FLASH_FRIENDLY_FIRE_READING)
        // PF-19 (research 218 §3): the room laid `Prone cover` after command `after` and drops a reload named past it
        // 'proneCover'; the page's, sent before this event arrived, is undone as a flinch's is (PF-18).
        if (ev.knock?.fall === 'proneCover' && this.firearmWire.reloadSeq !== null && this.firearmWire.reloadSeq > ev.after) this.deps.undoReload?.();
        break;
      // LOW-2 (research 223 s6): the room refused the page's own reload, round or throw stale. The last reload, named, is
      // put back as the room has it (`staleReload`, however long ago it ended); a round back to its weapon and a throw's
      // item back to the pouch, once a seq (a pull's rays share one).
      case 'stale': {
        if (ev.request === 'throw') { this.throwWire.stale(ev.seq); break; }
        this.firearmWire.stale(ev.request, ev.seq);
        break;
      }
      // LATER 876 (the owner's B2/S6, 2026-11-22; an adaptation): the room refused the page's own round for another reason
      // (`why`). Nothing given back -- the round stays spent, as the original spends every round it fires (S6) -- and
      // nothing drawn; the net client counts it for the playtest report (`./net/client` `case 'roundRefused'`).
      case 'roundRefused': break;
      case 'hurtVoice':
        if (ev.id === this.client.id) this.deps.hurtVoice?.(null, null, this.deps.walk.feet());
        else this.deps.hurtVoice?.(this.sideOf(ev.id) ?? null, remote.playerType(ev.id), remote.feet(ev.id));
        break;
      case 'taunt': this.deps.taunt?.(ev); break;
      case 'communication': this.deps.communication?.(ev); break;
      case 'chat':   // SVC-19: the game session's line, to the game lobby's panel (`FUN_002ba9d0`), never the HUD
        if (ev.round) this.deps.roundChat?.(ev); else this.deps.gameChat?.(ev);   // RC-3: a round line (RC.R2) to the HUD alone
        break;
      case 'system': this.deps.systemMessage?.(ev); break;   // SA-43c Part 2: the server's system message, routed by the front end (`FUN_0030dce0`)
      case 'voiceFloor': this.deps.voiceFloor?.(ev); break;
      case 'shot':
      case 'impact': {
        // R4P-253 (REMOTE_SHOT_QUEUE_CAP_READING, REMOTE_SHOT_DRAIN_PER_TICK_READING): another player's shot is SHOWN from
        // the copy's count, as the original replays it (FUN_002be150 D:L162443-162455, FUN_005e6400 D:L497481): held, at
        // most ten pulls, one pull shown a game frame (`frame`). The room's one event per ray stays -- a transport adaptation,
        // not one of behaviour. The page's own `impact` (and its own `shot`, which plays nothing) is not queued.
        if (ev.type === 'shot' && ev.id !== this.client.id) { this.queueShot(ev); break; }
        this.showRound(ev);
        break;
      }
      case 'reloadSound': {
        // REMOTE_RELOAD_SOUND_READING: the item's record by id (as a shot's, but no stand-in: another item's sound is
        // wrong), at the body as drawn -- the room's feet while it is not -- never the page's own (its reload played).
        if (ev.id === this.client.id) break;
        const side = this.deps.weapons(this.sideOf(ev.id) ?? 'seal');
        const w = this.deps.recordOf?.(ev.weapon) ?? side.find((r) => r.id === ev.weapon) ?? null;
        if (w) this.deps.reloadSound?.(w, remote.feet(ev.id) ?? ev.at);
        // REMOTE_RELOAD_MOTION_READING: the room's take starts the body's reload clip; an older room's event carries none
        // of it, and the copy starts none (the sound alone). RELOAD-HITPOSE F1: on the drawn clock, past the tick heard.
        remote.reload?.(ev.id, { posture: ev.posture, moving: ev.moving, family: ev.family, seconds: ev.seconds }, ...this.heardMark());
        break;
      }
      case 'grenade': {
        // LATER 643 (research 85 §6.1): the room's age for the throw, ticks from its release as the room flew it -- the
        // copy starts there (`GrenadeThrower.launchRemote`); a malformed one is none, and none keeps the call as before.
        const age = typeof ev.age === 'number' && Number.isFinite(ev.age) && ev.age > 0 ? ev.age : undefined;
        if (age !== undefined) this.deps.remoteGrenade(ev.kind, ev.from, ev.velocity, ev.id, ev.pid, undefined, age);
        else this.deps.remoteGrenade(ev.kind, ev.from, ev.velocity, ev.id, ev.pid);
        break;
      }
      case 'drop': this.deps.drops?.place(ev, ev.from === this.client.id); break;           // PF-34 (research 234 s6); OBF-15: own
      case 'taken': this.deps.drops?.remove(ev.did); if (ev.kit) remote.setKit(ev.by, ev.kit); break;
      case 'kit':
      {
        // LATER 1129: a take's equipment and the kept Detonator, with the kit, to the throwables (`TakenEquipment`).
        const taken: TakenEquipment | undefined = ev.equipment || ev.detonator
          ? { taken: true, equipment: ev.equipment ?? [], ...(ev.detonator ? { detonator: true as const } : {}) } : undefined;
        // With no take's equipment the call is the one it was before LATER 1129 (the gate's PF-34 call list).
        if (ev.added) this.deps.kitChanged?.(ev.loadout, ev.slot ?? null, ev.rounds, ev.filled, taken, ev.added);
        else if (taken) this.deps.kitChanged?.(ev.loadout, ev.slot ?? null, ev.rounds, ev.filled, taken);
        else this.deps.kitChanged?.(ev.loadout, ev.slot ?? null, ev.rounds, ev.filled);
      }
        break;
      case 'placed': this.deps.tagOwnProjectile?.(ev.kind, ev.from, ev.pid); break;
      case 'detonate': this.deps.detonateProjectile?.(ev.pid); break;
      case 'chargeGone': this.deps.removeProjectile?.(ev.pid); break;            // R4P-224: removed, no blast
      case 'sceneRound': this.deps.sceneRound?.(ev.kind, ev.at); break;          // research 386 §3.2: an outhouse's C4
      case 'timeExpired':
        hud.postMessage('TIME EXPIRED', 0.9); this.endsAt = this.now();
        this.deps.roundAudio?.timeExpired();           // `mission_timer2`'s cue: the SEALs' win music, no line (research 124 §5)
        break;
      case 'countdown': this.matchOn = false; this.countdown(ev.seconds); break;   // the owner's launch countdown (2026-10-01)
      case 'roundStart':
        // Protocol 10 (MAP-03): the round's epoch kept and the page's world reset as the level opened (`FUN_002ac0e0`,
        // as the room's `startRound` does) -- in `NetClient.newEpoch`, the one place, which does nothing when a snapshot
        // of this round already crossed the boundary; from now a state of an older round is not applied.
        if (typeof ev.epoch === 'number') this.client.newEpoch(ev.epoch);
        this.deps.newRound?.();                         // the last round's decals go (CMPExitState L76084)
        this.roundDamage = null; this.lifeDamage = null;   // WM-DATA: the last round's damage reports go with it
        this.damageAtWin = false;                       // WM-DATA-WIN: and the win's damage window
        this.damageKills = { round: { mine: new Set(), me: new Set() }, life: { mine: new Set(), me: new Set() } };   // WM-13: their kills
        this.escorteeUnits.clear();                     // HX-4a: the round's reset moves no hostage by an order (no YES)
        this.tracerRounds.clear();
        this.launchAt = null; this.roomWaits = false; this.roundSeconds = ev.seconds; this.roundLength = ev.seconds;
        this.matchOn = true;                            // JOIN-LEAVE-LINE: a round has started
        this.endsAt = this.now() + ev.seconds * 1000; this.screens = null;
        this.rounds = ev.rounds ?? this.rounds;
        // LATER 85: a seat the start passed by (its console still loading: no body) stays a ghost of the round; the rest
        // are spawned by it. A room that names none: every seat cleared, as before.
        if (ev.ghosts?.includes(this.client.id)) this.seatGhost();
        else { this.unbench(); this.ghostSince = null; }
        if (this.rules === 'respawn' && this.dead) this.dead.help = false; // RSP-6: clear old help; spawn still owns the body/kit reset
        // PAR-94d (research 322 D7): every console's round start posts the banner (`FUN_001fb420` D:L57632-57649, no seat
        // tested; a client pushes `CMPExitState` on the told game state alone, D:L151127-151134), a spectator's and the
        // replay's watcher's included. Was: the players' only (PAR-48), a spectator's view drawing it off the HUD's clock.
        this.roundBanner(ev.round);
        // INT.R7: the team intro, `start`'s (`start2`'s in a respawn room) WAIT then the local side's cue; a spectator's
        // is `player_team` 16's (research 124 §5).
        this.deps.roundAudio?.roundStart(this.localTeam(), this.rules === 'respawn');
        this.hostageSaid.lead.clear(); this.hostageSaid.rescued.clear();   // HX-5: the one-shots are armed again
        break;
      case 'roundTime':
        // HX-1 (research 237 s3): a SEAL's hostage kill took a minute off the round's total -- the clock is the new total
        // less the time elapsed (`FUN_002a6960`; the room's `PENALTY_MINUTE_READING`).
        if (this.endsAt !== null) this.endsAt -= (this.roundSeconds - ev.seconds) * 1000;
        this.roundSeconds = ev.seconds;
        if (this.endsAt !== null) hud.setTimer(Math.max(0, (this.endsAt - this.now()) / 1000));
        break;
      case 'hostageState': {
        // HX-1: the AI's state for every page's map, then the part's dep (HX-4a's page module).
        const state: HostageStateWire = { id: ev.id, alive: ev.alive, ai: ev.ai, leader: ev.leader, rescuer: ev.rescuer, opacity: ev.opacity, unit: ev.unit };
        this.hostageMap.set(ev.id, { ...this.hostageMap.get(ev.id), ...state });
        this.escorteeYes(ev);                           // HX-4a: the YES on a move into or out of unit 17 (research 239 s3)
        remote.setOpacity(ev.id, ev.opacity, ev.ai === 0x11);   // HX-2's fade runs it down on the page when rescued (238 s6)
        // HX-5 (research 239 s6): LeadN on its first state 9 a round (`LEAD_ONCE_READING`), RescueN on its first 0x11.
        const said = ev.ai === 9 ? this.hostageSaid.lead : ev.ai === 0x11 ? this.hostageSaid.rescued : null;
        if (said && ev.alive && !said.has(ev.id)) {
          said.add(ev.id);
          this.deps.roundAudio?.hostage?.(ev.ai === 9 ? 'lead' : 'rescued', this.post);
        }
        this.deps.hostageState?.(ev);
        break;
      }
      case 'eliminated': {
        // HX-5 (research 239 s6; RESCUE_WIN_LINES_READING): a hostage `reason` plays `start`'s branch for it -- its lines and
        // streams at its waits -- where the map's cues hold it; else (an older room, no cues yet) the elimination's.
        // LATER 125 (research 175 §4): on ESCORT a SEAL elimination is `start`'s line then `escort_success`'s (the
        // map's `decided.elimination`); LATER 130: on BREACH a Terrorist one is `start`'s line then `breach_success`'s
        // (`decided.terroristElimination`); a map without either posts the elimination's two lines as before.
        const reason = ev.reason === 'rescue' || ev.reason === 'hostageKills' ? ev.reason
          : ev.winner === 'seal' ? 'elimination' : ev.winner === 'terrorist' ? 'terroristElimination' : null;
        if (reason && this.deps.roundAudio?.decided?.(reason, this.localTeam(), this.post)) break;
        hud.postMessage(eliminationLines(ev.winner));
        this.deps.roundAudio?.eliminated(ev.winner, this.localTeam());   // the line both sides hear, the winner's music
        break;
      }
      // LATER 127 / 138: the clock's end won the round for a side on ESCORT or BREACH -- the map's `*_success` lines and
      // music (`decided.timeout`); a map without them posts nothing: never the elimination's lines (its own event).
      case 'timedOut':
        // The review's F2: no cues for it (not yet loaded, a hand-built map) -- nothing posted, the round's audio decided
        // still, so nothing of a round in play (a bomb's non-result cue) plays through the hold.
        if (!this.deps.roundAudio?.decided?.('timeout', this.localTeam(), this.post)) this.deps.roundAudio?.roundOver();
        break;
      // LATER 131 (research 175 §4): ESCORT's RescueN / VIPcheck / EndRescueN lines at the room's moments (`escort`).
      case 'escort': this.deps.roundAudio?.escort?.(ev.kind, ev.vip ?? null, this.localTeam(), this.post); break;
      // Protocol 7 (review 3 B2): the room abandoned the round (a side left empty; a departure is a leave: `FUN_002bc530`
      // D:L161109-161146, research 315 §3.3; `dlgNetAbandoned`). The original leaves the level, whose teardown empties
      // both decal pools (`FUN_0031af70` 218218-218219): the round's end on the page -- the decals, the timer, the
      // screens go, and the waiting room starts clean. A bare score with `timeLeft: null` is not one (the respawn hold).
      // PF-27 (ruling PF.R48; research 231 s5): in a game the match ends on dialog #528 (`dlgNetAbandoned.rdr`:
      // DisconnectFromGameServer, POPUP 528, ReturnToWorldOfSOCOM; FUN_002bc530 D:L161109-161146) through the lobby's
      // return; on /testroom UIMnLOC 528's text (ABANDON_LINE_READING). No "ABANDONED" line, in neither.
      case 'abandoned':
        if (this.deps.abandoned) this.deps.abandoned(); else this.deps.newRound?.();
        this.deps.roundAudio?.reset();                  // the level is left: nothing pending, the slot stopped
        this.endsAt = null; this.screens = null; this.launchAt = null; this.roomWaits = true;
        this.matchOn = false;                           // JOIN-LEAVE-LINE: the room waits again
        this.damageAtWin = false;                       // WM-DATA-WIN: the win's damage window goes with the level
        this.tracerRounds.clear();
        this.unbench();
        if (this.deps.game) { this.endGame(GAME_ENDED_DIALOG_READING, 'abandoned'); break; }   // the match is over: no waiting line
        hud.postMessage(ABANDON_LINE_READING);
        if (this.client.role === 'player') hud.postMessage(WAITING_LINE_READING);   // the room waits for both sides again
        break;
      case 'roundOver':
        this.deps.roundAudio?.roundOver();              // closes the round; `abort` and `success2` play nothing
        this.endsAt = null;
        if (ev.matchOver) this.matchOn = false;         // JOIN-LEAVE-LINE: the match's last round has ended
        this.screens = { start: this.now(), list: ev.screens, winner: ev.winner, wins: ev.wins, stats: ev.stats };
        break;
      // WM-DATA (`DAMAGE_REPORT_ADAPTATION`): kept for the panel; `life` is read optionally (the respawn room's report at
      // the player's death, from agent/wm-data-life -- this base's protocol may not carry the field yet).
      case 'damageReport': {
        const kept = { ev, names: new Map(this.rows.map((r) => [r.id, r.name] as const)) };
        if ((ev as { life?: true }).life === true) this.lifeDamage = kept; else this.roundDamage = kept;
        // WM-DATA-WIN (WM.R24): a round report before the round's result is the room's at a win's decision
        // (`DAMAGE_REPORT_AT_WIN_REASONS`, the room's alone): the window opens with it, through the hold.
        if ((ev as { life?: true }).life !== true && this.screens === null) this.damageAtWin = true;
        break;
      }
      case 'score':
        for (const row of ev.rows) this.seatBot(row.id, row.bot);
        this.rows = ev.rows;
        hud.setScoreRows(ev.rows.map((r) => ({ ...r, self: r.id === this.client.id })), ev.spectators, ev.wins);
        // LATER 152 (`DEFUSE_CLOCK_HELD_READING`): a held clock stops at its figure (a defuse); else it counts from `timeLeft`.
        if (ev.timeLeft !== null && ev.clockHeld) { this.endsAt = null; hud.setTimer(ev.timeLeft); }
        else if (ev.timeLeft !== null) this.endsAt = this.now() + ev.timeLeft * 1000;
        break;
      // SEAT_CLAIM_TAKE_DELAY_MS_ADAPTATION: a seat held for this page -- its player told first, the switch at `promoted`.
      case 'seatComing': hud.postMessage(SEAT_CLAIM_TAKEN_LINE_ADAPTATION); break;
      // SEAT_CLAIM_ADAPTATION: a page that asked from watching (`seats` told) reads its place on the HUD's claim line.
      case 'queue': if (ev.position > 0 && this.client.seats === null) hud.postMessage(queueLine(ev.position)); break;
      case 'promoted':
        // SEAT_CLAIM_ADAPTATION: a watcher's walk was never stood (its page flew from the welcome) -- stood now on the floor
        // under the spectator's camera, else spawn A's (`WalkMode.setMode`'s `stand`), so a ghost's own view (`resumeBody`
        // below) is there and not at an unplaced walker under the map; a walk that cannot yet stands at its first spawn.
        // SEAT_CLAIM_ADAPTATION: seated from watching -- the test room's watching hello, or the seat's own claim (a menu
        // game's watcher, whose page is built without the watch: its watch is the services' join type)
        const claimed = this.watch || this.client.seatedByClaim;
        if (claimed && !(this.deps.walk.mode() === 'walk' || this.deps.walk.setMode('walk'))) this.walkAtSpawn = true;
        if (this.watch) {                               // SEAT_CLAIM_ADAPTATION: a watcher seated plays now, a reconnect's hello too
          this.watch = false;
          this.tellRefill();                            // NET-REFILL: and its `Fire` takes the room's rule, told none while it watched
        }
        this.deps.spectate(null);
        this.deps.teamChanged?.(ev.team);
        this.unbench();
        // Protocol 5 (PL-8): seated in a classic round in play, a ghost until the next -- the welcome's lines.
        if (ev.ghost) {
          this.seatGhost();
          // LATER 90 (research 314 §4.3 item 4): the spectator's welcome left the walk in fly mode; the ghost's view is
          // its own dead body's, as a late joiner's (the camera bound to the own actor, `FUN_00599b60` D:L455701; state
          // 8's death camera, `FUN_00297410` D:L140893-140913) -- the walk given back where the walker stands, after
          // `seatGhost` made it dead (the death camera with it). No free camera left to a ghost (`FUN_00295260` D:L139465).
          this.deps.walk.resumeBody?.();
        } else if (!claimed) hud.postMessage('YOU ARE IN: A PLACE IS FREE');
        if (!ev.ghost && ev.waiting) hud.postMessage(WAITING_LINE_READING);
        {
          // The owner's launch countdown (2026-10-01): a promotion that completes both sides, or into a running one.
          const countdown = NetPage.countdownOf(ev);
          this.roomWaits = !ev.ghost && (ev.waiting === true || countdown !== null);
          if (!ev.ghost && countdown !== null) { this.launchAt = null; this.countdown(countdown); }
        }
        this.seat(ev.team, true, NetPage.seatChar(ev));   // the room's type; protocol 7: the new seat holds the side's picks
        if (ev.armory) this.armorySeat();                  // S3: the ARMORY opens on the promoted seat (ARMORY_SEAT_READING)
        break;
      // Protocol 5 (PL-8): moved out for idling (W3.R13) -- a spectator's view and the queue's line. S2 round 3: the room
      // dropped the seat and its requests unanswered (`Room.loadout`), so none is waited on, no type is staged, and the
      // page's choice goes as a spectator's types, for the seat a promotion gives (`typeChosen`).
      case 'demoted':
        this.spectatorWelcome(ev.position);
        this.inFlight = [];
        this.deps.unseated?.();
        if (!this.watch && this.deps.types) {
          const t = this.deps.types();
          this.sentTypes = { ...t };
          this.client.send({ type: 'loadout', picks: [], types: { seal: t.seal, terrorist: t.terrorist } });
        }
        break;
      // NET-DRAIN: 'server closing' is a retry-later (the line shown, the backoff kept); any other refusal is final.
      // Past SERVER_CLOSING_RETRY_MS from the first it is final too: a game's seat ends on the net error's dialog (365 ->
      // dlgNetError).
      case 'refused': {
        const at = performance.now();
        if (ev.reason === SERVER_CLOSING_REFUSAL.reason) this.closingSince ??= at;
        this.closing = ev.reason === SERVER_CLOSING_REFUSAL.reason && at - this.closingSince! <= SERVER_CLOSING_RETRY_MS;
        this.refusal = ev.reason; hud.postMessage(ev.reason);
        // SA-7h S5: a standing room's `no seat in that room` or `not logged in` re-passes once between welcomes (F3).
        if (this.deps.room && ROOM_REPASS_REASONS.has(ev.reason) && !this.roomRepassed) { this.roomRepassed = true; this.roomRepass = true; break; }
        // SA-41: a placed game's held hello refused before its admit re-tokens once between welcomes (H7)
        if (this.deps.game?.reseat && GAME_RETOKEN_REASONS.has(ev.reason) && !this.gameRetokened) { this.gameRetokened = true; this.gameRetoken = true; break; }
        if (!this.closing) {
          this.reconnect.stopped = true;
          if (this.deps.game && ev.reason === SERVER_CLOSING_REFUSAL.reason) this.endGame(GAME_SOCKET_CLOSED_DIALOG_READING, 'disconnected', 'server-update');
        }
        break;
      }
      // SVC-23f: the vote lines as `FUN_002b6530` draws them -- colour 2, past the leading spaces (`./spectatorVote`):
      // the team vote's (S:0x3f26c0, `FUN_002ba040` D:L159765-159766), the Spec Vote's and the eject's (research 264 §4.5).
      case 'votes': hud.postMessage(teamVoteLine(ev)); break;
      case 'spectatorVote': case 'spectatorsEjected': hud.postMessage(spectatorVoteLine(ev)); break;
      case 'loadout': this.deps.loadoutAnswer?.(ev.kit, ev.refused, this.inFlight.shift() ?? null, ev.char ?? null); break;
      // KIT-HELD: the seat's held type, picks and kit -- its own event, so the answers' pairing above is never shifted; a
      // request in flight is answered after it and settles the room's list itself, so this one is not taken then.
      case 'kitHeld':
        if (this.client.role === 'player' && this.inFlight.length === 0 && (ev.team === 'seal' || ev.team === 'terrorist')) {
          this.deps.kitHeld?.(ev.team, ev.char, ev.picks, ev.kit);
        }
        break;
      // S2 round 4: this page's seat went to a newer connection of its session token (a duplicated tab, which starts
      // with a copy of this tab's session storage): a new token, and the usual rejoin -- as a new joiner.
      case 'kicked':
        // HARD-SEAT: in a game the seat is the account's, and its other tab has it now: the end, not a rejoin (N-1).
        if (ev.reason === 'replaced' && this.deps.game) { this.endGame(GAME_SOCKET_CLOSED_DIALOG_READING, 'disconnected', 'replaced'); break; }
        if (ev.reason === 'replaced') { (this.openSession ?? this.deps.session)?.renew(); this.replaced = true; hud.postMessage(REPLACED_LINE_READING); break; }
        if (this.deps.game) this.endGame(ev.reason === 'vote' ? GAME_KICKED_DIALOG_READING : GAME_SOCKET_CLOSED_DIALOG_READING, ev.reason === 'vote' ? 'kicked by a vote' : 'kicked for inactivity', ev.reason === 'vote' ? null : 'idle');
        this.reconnect.stopped = true; this.refusal = ev.reason === 'vote' ? 'kicked by a vote' : 'kicked for inactivity';
        hud.postMessage(ev.reason === 'vote' ? 'YOU HAVE BEEN KICKED FROM THIS GAME' : 'Kicked for inactivity.'); break;
      default: break;
    }
  }
}

/**
 * The ARMORY's character type (web sprint 5 S2; the page's `setCharacterType`, the seam S3's screen applies its choice
 * through): the side's type for its next spawn (`ChangeCharacterType`, research 95 §4.2 S1a; the body, the kit and the
 * hit volumes follow it at the rebuild). In a match the room is told (`NetPage.typeChosen`); for a player of the side
 * the change is staged (`PlayerLoadout.setType`) until the room's answer takes it or returns the page to the type and
 * picks the room holds (`PlayerLoadout.roomAnswer`). False, nothing changed, for a type the map's side does not offer
 * (`armoryTypeAllowed`).
 */
export function chooseCharacterType(loadouts: PlayerLoadout, net: NetPage | null, side: Side, type: number): boolean {
  if (!loadouts.setType(side, type, net?.answersType(side) ?? false)) return false;
  net?.typeChosen(side);
  return true;
}
