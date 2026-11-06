import type { PerspectiveCamera } from 'three';
import { DEFAULT_ARMORY_TYPE, tracerKindFor, tracerRound, UNITS_PER_METRE, type AiMaps, type GameType, type Pick, type Side, type WeaponRecord } from '@s2u/scene';
import type { LoadoutRequest, PlayerLoadout } from './loadout';
import type { FireEvent, FireWeapon } from './fire';
import type { EquipmentSlotState } from './equipmentSlots';
import { NetClient, type NetOptions, type NetWalk, type Simulate, type WebSocketLike } from './net/client';
import {
  GAME_HELLO_WAIT_MS_ADAPTATION, GAME_RETOKEN_REASONS, GAME_RETOKEN_WAIT_MS_ADAPTATION, gameSeatOf, gameSeatOpen, isGameSeat, isRoomSeatOf, isSeatOf, matchSocketUrl,
  ROOM_REPASS_REASONS, roomRefusalLine, socketHost, type GameSeat, type GameSeatProvider, type Reseat, type RoomPass, type RoomSeat, type RoomSeatProvider,
} from './connectHost';
import type { DropWire, HostageStateWire, HostageWire, LoadoutRefusal, MatchStats, Rules, ScoreRow, ServerEvent, Team } from './net/protocol';
import { SEAT_HOLD_MS_ADAPTATION, SERVER_CLOSING_REFUSAL, SERVER_CLOSING_RETRY_MS } from './net/protocol';
import { countdownLine, eliminationLines, MAX_ROUNDS } from './net/rules';
import { deathPose, flinchPose, type RemotePlayers } from './remotePlayers';
import { isDead, overall } from './net/damage';
import { flinchCutWindow, reloadInFlinch } from './net/flinchReload';
import type { NetRefillRule } from './net/netRefill';
import { RESPAWN_FADE_S, RESPAWN_PROMPT_S } from './net/deaths';
import { TICK_HZ } from './net/protocol';
import type { PlayClips } from './play';
import type { ScoreRowInfo } from './scoreboard';
import { botDisplayName, plainBotText } from './botPresentation';
import { yourStatsOf, type RoundScreen } from './roundScreens';
import type { WalkMode } from './walk';
import type { OnlineStatus } from './online';
import type { CompassMark, HudSpectatorView, RoundInfo } from './hud';
import { extractionPoints, hostageMarks } from './hostageMarks';
import type { RoundAudioHost } from './roundAudioHost';
import type { ObjectiveLine, RoundCues } from './roundCues';
import type { MatchGate } from './weaponExchange';
import { keyboardSite } from './keyboardTesting';
import type { WorldState } from './worldState';
import type { Input } from './gamepad';
import type { VoiceDown } from './net/voiceWire';
import type { ScenicView } from './mapMeta';
import { cameraEye, SpectatorView, type SpectatorBody } from './spectatorView';
import { applyJoinState, type JoinSinks, type ProjectilePhase } from './joinState';
import { spectatorVoteLine, teamVoteLine, voteRowsOpen } from './spectatorVote';

/**
 * The page in a match (web sprint 3, M4-M8): the net client on the walk, the other players drawn (`./remotePlayers`),
 * their rounds' muzzles, impacts and sounds, the page's own rounds and reloads sent up, the game's kill lines in the
 * message window (research 91 section 10: "%s fragged %s with %s", "%s commits suicide with %s", "%s falls to their
 * death"), "TIME EXPIRED" and the round's clock (section 18), the scoreboard's rows. Behind `?redotcom&mp` (W3.R7).
 */

export interface NetPageDeps {
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
  remoteGrenade(kind: string, from: [number, number, number], velocity: [number, number, number], owner?: number, pid?: number, phase?: ProjectilePhase, ageTicks?: number): void;
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
    /** OT.R59 (RECONNECT-GHOST): a resume's pouch by name and launcher held, as the room holds them (no refill). */
    resumed?: { pouch: Readonly<Record<string, number>>; equipmentSlots?: readonly EquipmentSlotState[]; held: number | null; weapon?: 0 | 1 }): void;
  /** PF-36 (research 235 s4): the room's pid for this page's own throw or charge (`placed`; `GrenadeThrower.tagOwn`). */
  tagOwnProjectile?(kind: string, from: [number, number, number], pid: number): void;
  /** PF-36 (research 235 s4): the resting charge with this pid was damaged in the room and goes off (`detonateRemote`). */
  detonateProjectile?(pid: number): void;
  /** The spectator's camera: the pose to stand the fly camera at (follow), or null to leave it free. */
  spectate(pose: { x: number; y: number; z: number; yaw: number; pitch: number } | null): void;
  /** WALL-CAM: actor follow uses the live map's shared player rig/pass (research 382 §2). */
  spectateFollow?(body: SpectatorBody, dt: number): void;
  spectateFollowReset?(): void;
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
   * LOW-2: a throw the room refused stale, its item given back (the throwables' part, `./matchNet` `PART_DEPS`). LATER
   * 503: `shot`, a rocket's launch in the launcher's journal (`./rocket` `RocketLauncher.refund`).
   */
  staleThrow?(kind: string, slot?: number, shot?: number): void;
  /**
   * P2 (the online-parity sweep's TB-1; research 85 s9.5): the white-out at the level the room's gated blast resolved on
   * the page's own SEAL (`blast.flash`; `./flash` `WhiteOut.start`) -- the throwables' part (`./matchNet` `PART_DEPS`).
   */
  whiteOut?(level: 1 | 2 | 3): void;
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
   */
  escorteeVoice?(id: number, cue: 'yes', at: [number, number, number] | null): void;
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

export function fireWeaponOf(r: WeaponRecord): FireWeapon {
  const s = r.sounds;
  return { name: r.name, id: r.id, range: r.maximumRange * UNITS_PER_METRE, fireAnim: r.fireAnim ?? null, sounds: s ? { ...s } : { close: null, med: null, far: null, reload: null } };   // #425: the tracer's range
}

/**
 * The game's kill line (research 91 section 10), the names already resolved. `orphan` (review 2, m-13): a grenade whose
 * thrower left before its fuse ran out -- the server scores it as no one's and keeps the thrower's name
 * (`killerName`), so the line is the thrower's "fragged", never the victim's suicide.
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
 * The wait before the next attempt to join, ms. After a match was reached (PT195-4, LATER 329): at once, then the
 * backoff unchanged -- 2, 4, 8 ... 10 s -- so a blip is not sat out for a second, and a server that stays down is not
 * asked any faster than that curve. To a server never reached, 2, 4, 8 ... 60 s. The at-once attempt is taken once in
 * `QUICK_RECONNECT_WINDOW_MS_ADAPTATION` (`dropRetry`).
 */
export function retryDelayMs(attempts: number, reached: boolean, local = false): number {
  if (local && !reached) return LOCAL_RETRY_MS;
  if (!reached) return Math.min(60_000, 2000 * 2 ** attempts);
  if (attempts <= 0) return 0;
  return Math.min(10_000, 1000 * 2 ** attempts);
}

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
 * tight loop; inside the window a drop's first wait is the backoff's next step, 2 s (`retryDelayMs(1, true)`).
 */
export const QUICK_RECONNECT_WINDOW_MS_ADAPTATION = 10_000;

/**
 * LINK_SILENCE_MS_ADAPTATION (NET-RES.R9, OT.R77; a browser adaptation, no game value): a welcomed socket the server
 * has sent nothing on for this long is given up -- closed with no `bye`, so the room holds the seat (NET-RES.R7) -- and
 * the retry taken, ms. The server sends 30 snapshots a second in a round and answers the page's ping each 2 s, so 10 s
 * of nothing is a dead link, which the browser's TCP may otherwise sit on for minutes before it closes the socket.
 */
export const LINK_SILENCE_MS_ADAPTATION = 10_000;

/**
 * RESUME_GIVE_UP_MS_ADAPTATION (NET-RES.R9): how long after a reached match's drop the page goes on retrying, ms -- the
 * room's hold (`SEAT_HOLD_MS_ADAPTATION`) and one backoff step (10 s) more; past it the seat ends (#365 until NET-RES-3
 * names the case). A browser adaptation.
 */
export const RESUME_GIVE_UP_MS_ADAPTATION = SEAT_HOLD_MS_ADAPTATION + 10_000;

/**
 * A drop's first wait, ms, and the at-once reconnect's time to keep (`quickAt`, the page's clock; -Infinity before
 * any): `retryDelayMs`, except that the at-once attempt is taken only once in `QUICK_RECONNECT_WINDOW_MS_ADAPTATION`;
 * inside it, the 2 s step.
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

/** LOW-2 (research 223 s6): the page's rounds and throws kept by seq for a `stale` answer: about 2 s of a pull a tick. */
const STALE_MEMORY = 128;

/** The engine reads the round's result this long after the script ends it (`FUN_002a9b30` L150612-150672). */
const ENGINE_READ_S = 3;

export class NetPage {
  client: NetClient;
  private readonly names = new Map<number, string>();
  /** Authored bot presentation follows trusted seat metadata, independently of callsigns and regional appearances. */
  private readonly bots = new Set<number>();
  private readonly teams = new Map<number, Team>();
  /** Another player's rounds this round, from 1 (the tracer's count, `tracerRound`; `TRACER_REMOTE_COUNT_READING`). Cleared with the round. */
  private readonly tracerRounds = new Map<number, number>();
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
  /** The page's own death edge (ms), and whether the current round still owns that death's help. */
  private dead: { at: number; help: boolean; atLoad?: true } | null = null;
  /** j5t3o2iU: the page's own body's health as its last `hurt`, spawn or resume left it (`overall`; 1 whole). */
  private ownHealth = 1;
  /** PF-18 (research 218 §2.1): the command seq the page's last reload was sent with (`reloadInFlinch`); null before one. */
  private reloadSeq: number | null = null;
  /** LOW-2 (research 223 s6): the seqs the page's rounds, reloads and throws went with (their journal ids, the item), for `stale`. */
  private readonly sentFires = new Map<number, number>();
  private readonly sentReloads = new Map<number, number>();
  private readonly sentThrows = new Map<number, { kind: string; slot?: number; shot?: number }>();
  /**
   * LATER 347: rounds the kit fired before any command carrying their press went out -- a press's round fired in the pad's
   * read or an input event, ahead of the walk's commands for its frame -- held until the walk has sent a command after them
   * (`flushPressRounds`), then named at the first of those, the first to carry the press, with the view clock of their
   * firing. Was: named `lastSeq()` at once, the previous frame's command, which carries no Trigger: the room's cone
   * (`./net/shotCone` `tick`) bloomed the round before the press's edge started the pull's count again (`FUN_005c0ae0`), and
   * ran one round behind the page's count for the whole burst -- bursts of five rounds or more refused 'cone'.
   */
  private readonly pressRounds: { client: NetClient; after: number; viewTick: number; shownTick: number | null; e: Extract<FireEvent, { type: 'round' }> }[] = [];
  /** LATER 347: the Trigger bit the walk's next commands carry (`trigger`). */
  private triggerBit = false;
  private static remember<T>(map: Map<number, T>, seq: number, v: T): void {
    if (map.has(seq)) return;                                   // a pull's rays at one seq: one shell
    map.set(seq, v);
    if (map.size > STALE_MEMORY) map.delete(map.keys().next().value!);
  }
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
    if (this.reconnect.stopped || !this.welcomed || !gate.inMatch || gate.spectator || !voteRowsOpen(gate) || !this.teammates().includes(id)) return false;
    const remove = !this.myVotes.has(id);
    this.client.send({ type: 'vote', target: id, remove });
    if (remove) this.myVotes.add(id); else this.myVotes.delete(id);
    return true;
  }
  private teammates(): number[] {
    const mine = this.client.team;
    return [...this.teams].filter(([id, team]) => team === mine && id !== this.client.id).map(([id]) => id).sort((a, b) => a - b);
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
    this.spectator.key(e, DEAD_CYCLE_WHILE_MENU_READING === 'blocked' && (this.deps.menuOpen?.() ?? false));
  };
  private unsubscribe: () => void;
  /** LATER 498: off the client's held-spawn signal (`NetClient.onSpawnHeld`). */
  private unsubscribeHeld: () => void = () => undefined;
  /**
   * M9: a dropped socket (a server restart, the network) is joined again at once, then after 2, 4, 8 ... 10 s; a kick or a refusal
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
   * `watch` (the map viewer's Online setting): join as a spectator that never plays -- the walk is not driven, the
   * camera follows the living players (Space the next, V the free camera) as a queued spectator's does.
   */
  constructor(private readonly deps: NetPageDeps, private readonly url: string, private readonly map: string, private name: string, private readonly simulate?: Simulate, private readonly watch = false, rules: Rules = 'respawn') {
    // HARD-SEAT (the review's (4)): a socket that carries the ticket opens the pinned URL only (research 169 measure 7);
    // SA-6b (GAME_DOOR_ADAPTATION): a placed game's opens its pinned door with its token, never the ticket.
    if (deps.game && !isGameSeat(deps.game)) throw new TypeError('a game socket needs its pinned URL (pinnedMatchSocket) or its pinned door (pinnedGameDoor)');
    // SA-7h S5: a standing room's socket opens only a door `pinnedRoomDoor` made, for the provider's room, with a token.
    if (deps.room && (deps.game || !isRoomSeatOf(deps.room.seat, deps.room.provider?.room))) throw new TypeError('a standing room\'s socket needs its pinned room door (pinnedRoomDoor) and its pass\'s token');
    this.spectator = new SpectatorView({
      bodies: () => this.client.bodies(), spectate: (pose) => this.deps.spectate(pose), views: () => this.deps.scenicViews?.() ?? [],
      follow: deps.spectateFollow ? (body, dt) => this.deps.spectateFollow!(body, dt) : undefined,
      resetFollow: () => this.deps.spectateFollowReset?.(),
      magnify: (m) => this.deps.spectateMagnify?.(m), pitchSign: () => this.deps.spectatePitchSign?.() ?? 1,
      seat: () => ({ role: this.client.role, self: this.client.id, team: this.client.team, teams: this.teams, rules: this.rules, ghost: this.ghostSince !== null }),
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
    if (adopt) for (const ev of adopt.events) this.event(ev);   // ONL-18: the lobby's events, the welcome first
    if (import.meta.env.DEV) {                                       // OT.R29: the keys a development build's only
      keyboardSite('s2u-kb-net-page');
      globalThis.addEventListener?.('keydown', this.onKey);
      globalThis.addEventListener?.('keyup', this.onSpectatorKey);
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
  private readonly onPageHide = (): void => { this.leftPage = true; this.close(); };
  /** OT.R59: the match socket's `bye`, best effort, the first thing a page going away does (`NetClient.sayBye`). */
  private readonly onPageHideBye = (): void => { (this.client as { sayBye?(): void }).sayBye?.(); };
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
  private endGame(dialog: number, reason: string): void {
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
   * Joins again after a drop, with the backoff: at once, then 2, 4, 8 ... 10 s after a match that was reached (with the HUD's line),
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
        this.endGame(code === 4007 ? GAME_ENDED_DIALOG_READING : GAME_SOCKET_CLOSED_DIALOG_READING, code === 4007 ? 'game ended' : 'disconnected');
      }
    }
    // NET-RES-2d (NET-RES.R9): a game seat's retries run through the room's hold and one step more, then the seat ends
    // (#365 until NET-RES-3 names the case) -- never while the server says it is closing (NET-DRAIN's own bound).
    if (!this.reconnect.stopped && this.deps.game && !this.closing && this.droppedAt !== null && now - this.droppedAt > RESUME_GIVE_UP_MS_ADAPTATION) {
      console.warn(`match socket: game ${this.deps.game.id} not back within ${RESUME_GIVE_UP_MS_ADAPTATION} ms of its drop: the seat ended`);
      this.refusal ??= 'connection lost';
      this.endGame(GAME_SOCKET_CLOSED_DIALOG_READING, 'disconnected');
      return;
    }
    if (this.reconnect.stopped || !this.retriable() || this.asking) return;   // SA-6c: while a re-token is out, the backoff paused
    if (this.reconnect.at === 0) {
      const wait = dropRetry(this.reconnect.attempts, this.reached, now, this.reconnect.quickAt, this.deps.local);
      this.reconnect.quickAt = wait.quickAt;
      this.reconnect.at = retryDueAt(now, wait.delayMs);
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
    if (now - this.helloSince < GAME_HELLO_WAIT_MS_ADAPTATION) return;
    const state = c.state;
    const what = this.deps.game ? `game ${this.deps.game.id}` : this.deps.room ? `room ${this.deps.room.provider.room}` : 'the server';
    console.warn(`match socket: ${what} not welcomed within ${GAME_HELLO_WAIT_MS_ADAPTATION} ms, hung ${state} (${state === 'connecting' ? 'the upgrade never completed' : 'opened, no welcome'}) on ${this.helloHost}, attempt ${this.reconnect.attempts + 1}: dropped, retried after the backoff`);
    this.helloLapsed = true; this.helloSince = null;
    c.close();
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
        if (!this.deps.game || !isSeatOf(r.seat, this.deps.game.id)) { this.endGame(GAME_SOCKET_CLOSED_DIALOG_READING, 'disconnected'); return; }   // a broken or another game's seat: as 4008
        this.gameSeat = r.seat; this.gameRetoken = false; this.reopen(); return;
      }
      if (r.kind === 'ended') { this.endGame(r.close === 4007 ? GAME_ENDED_DIALOG_READING : GAME_SOCKET_CLOSED_DIALOG_READING, r.close === 4007 ? 'game ended' : 'disconnected'); return; }
      if (r.kind === 'signed-out') { this.reconnect.stopped = true; this.refusal ??= 'signed out'; return; }
      this.reconnect.at = retryDueAt(performance.now(), retryDelayMs(this.reconnect.attempts, this.reached, this.deps.local));
    };
    timer = setTimeout(() => { answered({ kind: 'backoff' }); }, GAME_RETOKEN_WAIT_MS_ADAPTATION);   // the page-side bound
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
      this.reconnect.at = retryDueAt(performance.now(), retryDelayMs(this.reconnect.attempts, this.reached, this.deps.local));
    };
    timer = setTimeout(() => { answered({ kind: 'failed' }); }, GAME_RETOKEN_WAIT_MS_ADAPTATION);
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
    this.pressRounds.length = 0;                   // LATER 347: no held round outlives the page
    this.clientListeners.clear();                  // AD-12's review F1: no lobby match follows a page that is gone
    this.deps.hud.setRoundScreen(null);
    this.deps.hud.setScoreRows(null, []);
    this.notice(null);                             // OT.R59 (RECONNECT-GHOST (B)): no line outlives the page's match
    globalThis.removeEventListener?.('keydown', this.onKey);
    globalThis.removeEventListener?.('keyup', this.onSpectatorKey);
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
    this.deps.hud.setScoreRows(null, []);
    this.notice(null);                             // OT.R59 (RECONNECT-GHOST (B)): no line outlives the page's match
    globalThis.removeEventListener?.('keydown', this.onKey);
    globalThis.removeEventListener?.('keyup', this.onSpectatorKey);
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

  /**
   * A round to the server, named at command `seq` (the last sent; LATER 347's held round the first after it was held) with
   * the view clock of its firing (`viewTick`: the room's rewind for the shot; a held round keeps the one it fired at) and,
   * NCW-17 (an instrument), the displayed tick of its firing (`shownTick`, `NetClient.shownTick`; none before a snapshot)
   * -- like `viewTick`, read when the round fires (a held press's round: at its press, as `fireEvent` holds it), not at
   * the frame the player last saw, so its lead bucket reads "at the firing". The two are read at one moment
   * (`roundTicks`): a browser's clock moves between two reads, and a bracketed `shownTick` read after `viewTick` would
   * come out a hair above it and be dropped by the room's check (the review's F1).
   */
  private sendRound(e: Extract<FireEvent, { type: 'round' }>, viewTick: number, shownTick: number | null, seq = this.client.lastSeq()): void {
    if (e.shot !== undefined) NetPage.remember(this.sentFires, seq, e.shot);
    const d = [e.to[0] - e.from[0], e.to[1] - e.from[1], e.to[2] - e.from[2]];
    const l = Math.hypot(d[0]!, d[1]!, d[2]!) || 1;
    // Protocol 5: the eye's ray the round was aimed down, for the server's cone (a round without it is refused there).
    const eye = e.eye ?? e.from, aim = e.aim ?? [d[0]! / l, d[1]! / l, d[2]! / l];
    this.client.send({
      type: 'fire', seq, from: [...e.from], dir: [d[0]! / l, d[1]! / l, d[2]! / l],
      weapon: e.weapon.id === this.deps.weapons()[1].id ? 1 : 0, viewTick,
      eye: [eye[0], eye[1], eye[2]], aim: [aim[0]!, aim[1]!, aim[2]!],
      ...(shownTick !== null ? { shownTick } : {}),
    });
  }

  /**
   * NCW-17's review F1: a round's view clock and displayed tick (`sendRound`), both at one clock read, so a bracketed
   * round's `shownTick` is its `viewTick`. The read is `performance.now` itself -- the live client's own default, as the
   * turret claim's (`./matchActions`) -- never the page's round-timer clock (`now`), which a replay clock would put on
   * its own milliseconds and so move a round's rewind tick (the re-check's F1).
   */
  private roundTicks(): { viewTick: number; shownTick: number | null } {
    const now = performance.now();
    return { viewTick: this.client.viewTick(now), shownTick: this.client.shownTick(now) };
  }

  /** LATER 347: the trigger as the walk's commands carry it -- `./main`'s and `./matchMount`'s frame, before `walk.frame`; `frame` again after. */
  trigger(on: boolean): void {
    this.setTrigger(on);
    this.client.beginFrame?.();                   // NCW-8: a new frame's send order -- each round right after its own command
  }
  /** LATER 347's bit, set: `trigger`'s before the walk, and `frame`'s again after it (which begins no frame: NCW-8). */
  private setTrigger(on: boolean): void {
    this.triggerBit = on;
    this.deps.walk.setTrigger(on);
  }

  /**
   * LATER 347: the held rounds, once the walk has sent a command after them, named at the first of those -- the first to
   * carry the press -- not the frame's last, which at 20 fps (three commands a frame) would bring the pull's second round
   * inside the room's gap (`room.ts` `cycle`, LATER 338); another client's, or a closed one's, dropped.
   */
  private flushPressRounds(): void {
    if (this.pressRounds.length === 0) return;
    if (this.client.state !== 'open') { this.pressRounds.length = 0; return; }
    const sent = this.client.lastSeq();
    if (this.pressRounds.some((h) => h.client === this.client && h.after >= sent)) return;   // no command since: a frame past 60 fps
    // LATER 338: a round with its own game frame's command keeps it, never before the press's first command.
    for (const h of this.pressRounds.splice(0)) if (h.client === this.client) this.sendRound(h.e, h.viewTick, h.shownTick, Math.max(h.after + 1, h.e.seq ?? 0));
  }

  /**
   * LATER 587's second fold (`./fire` `ROOM_GATE_MIRROR_ADAPTATION`, `FireSource.roundSeq`): the command a round the kit
   * fires now goes out named at, as `fireEvent` and `flushPressRounds` name it -- held (no Trigger on the commands yet, or
   * a round already held), the first command after the last sent or its own game frame's (`own`) if later; else its own,
   * or the last sent. Null on a closed socket, or between a resumed welcome and its resume (NCW-8 (b)): nothing is sent.
   */
  roundSeq(own?: number): number | null {
    if (this.client.state !== 'open' || this.client.awaitingResume?.() === true) return null;
    if (!this.triggerBit || this.pressRounds.length > 0) return Math.max(this.client.lastSeq() + 1, own ?? 0);
    return own ?? this.client.lastSeq();
  }

  /** The page's own rounds and reloads, to the server (`Fire.subscribe`). */
  fireEvent(e: FireEvent): void {
    // NCW-8 (b): between a resumed welcome and its resume nothing is named at the new client's low count -- a press's
    // round held here (LATER 347) would leave named there once the resume came; dropped, as a closed socket's.
    if (this.client.state !== 'open' || this.client.awaitingResume?.() === true) { if (e.type === 'reloadStart') this.reloadSeq = null; return; }
    if (e.type === 'round') {
      if (!this.triggerBit || this.pressRounds.length > 0) {                     // LATER 347: before its press's commands
        this.pressRounds.push({ client: this.client, after: this.client.lastSeq(), ...this.roundTicks(), e });
        return;
      }
      const { viewTick, shownTick } = this.roundTicks();
      this.sendRound(e, viewTick, shownTick, e.seq ?? this.client.lastSeq());   // LATER 338: its own game frame's command
    } else if (e.type === 'reloadPress') {
      // LATER 72 (research 313 s8.3): the press reaches the room, at the command it rode, and the page's window ends where
      // the room's does -- its `seq` + the delay's commands.
      const seq = this.client.lastSeq(); this.client.send({ type: 'reloadPress', seq });
      this.deps.pressWindow?.(seq + Math.round(e.seconds * TICK_HZ));
    } else if (e.type === 'reloadStart') {
      const seq = this.client.lastSeq(); this.client.send({ type: 'reload', seq }); this.reloadSeq = seq;
      if (e.reload !== undefined) NetPage.remember(this.sentReloads, seq, e.reload);   // round 3: each reload by its seq
    }
  }

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

  /** A seat taken: the page holds the room's type (`deps.seated`) and sends what the seat needs (`resendPicks`). */
  private seat(team: Team | null, player: boolean, char: number | null): void {
    const again = this.deps.seated?.(player ? team : null, player ? char : null);
    if (player) this.resendPicks(team, char, typeof again === 'number' ? again : null);
  }

  /**
   * WEAPON EXCHANGE's gate (`./weaponSelectState` `canOpen`; research 94 §B2): in the match, dead or a ghost, the camera
   * on oneself (not following a teammate), not a spectator.
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
    if (this.client.state !== 'open') return;
    const p = c4?.surface?.point;
    const at = c4?.slot ?? slot;
    NetPage.remember(this.sentThrows, this.client.lastSeq(), { kind, ...(at !== undefined ? { slot: at } : {}), ...(shot !== undefined ? { shot } : {}) });
    this.client.send({
      type: 'throw', seq: this.client.lastSeq(), kind,
      from: [from[0]!, from[1]!, from[2]!], velocity: [velocity[0]!, velocity[1]!, velocity[2]!],
      ...(c4?.target !== undefined ? { target: c4.target } : {}),
      ...(c4?.surface && p ? { surface: { path: c4.surface.path, point: [p[0]!, p[1]!, p[2]!] as [number, number, number] } } : {}),
      // LATER 305: the eye C4's aim ray left (the room adds it to its own eyes once it has held it to the camera's locus).
      ...(c4?.surface && p && c4.eye ? { eye: [c4.eye[0]!, c4.eye[1]!, c4.eye[2]!] as [number, number, number] } : {}),
      ...(start !== undefined ? { start } : {}),
      ...(at !== undefined ? { slot: at } : {}),
    });
  }

  /**
   * THROW-INTERRUPT (research 326 §2.4): a hand throwable's release request, on the page's last command; the seq it named,
   * which the `throw` echoes as `start`, or null when no room is open.
   */
  throwStartEvent(kind: string, slot?: number): number | null {
    if (this.client.state !== 'open') return null;
    const seq = this.client.lastSeq();
    this.client.send({ type: 'throwStart', seq, kind, ...(slot !== undefined ? { slot } : {}) });
    return seq;
  }

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
   * (`./net/hostageOrder`) and answers in `hostageState`.
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
      eye: [aim.eye[0], aim.eye[1], aim.eye[2]], dir: [d[0]! / l, d[1]! / l, d[2]! / l],
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
    this.deps.escorteeVoice?.(ev.id, 'yes', this.deps.remote.feet?.(ev.id) ?? null);
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
  hostageMarks(ai: AiMaps | null | undefined): CompassMark[] {
    if (!this.hostageMap.size) return [];
    if (ai !== this.zonesOf.ai) this.zonesOf = { ai, points: extractionPoints(ai) };
    const list = [...this.hostageMap.values()].flatMap((h) => {
      const at = this.deps.remote.feet(h.id) ?? ('at' in h ? h.at : null);
      return at ? [{ at, alive: h.alive, rescued: h.ai === 0x11 || this.hostageSaid.rescued.has(h.id) }] : [];
    });
    return hostageMarks(list, this.zonesOf.points);
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

  /** Whether one of the game's round screens is up (the page hides its reticle under it). */
  screenUp(): boolean {
    return this.roundScreen() !== null;
  }

  /** Seconds since the engine's read ended for the standing result (negative during it), else null: one clock read. */
  private screensElapsed(): number | null {
    const sc = this.screens;
    return sc ? (this.now() - sc.start) / 1000 - ENGINE_READ_S : null;
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
    let t = elapsed;
    if (t < 0) return null;
    for (let i = 0; i < sc.list.length; i++) {
      const item = sc.list[i]!;
      if (t < item.seconds || i === sc.list.length - 1) {
        // ROUND COMPLETE's and FINAL ROUND's lists are the round block (`RoundStatLbContents*`, the getter 0x225fe0 =
        // `+0x58c`; `FUN_00223680` D:L75946-75947), GAME COMPLETE's the match block (`GameSealsTotLbContents` /
        // `GameTerrsTotLbContents` by `FUN_00225bc0` via `FUN_002241c0` D:L76208-76214, the `+0x544` sum D:L76987;
        // research 216 §8): the round's three where the room sends them (`ScoreRow.roundKills` ..), else the totals.
        const roundList = item.screen !== 'gameComplete';
        const rows: ScoreRowInfo[] = this.rows.map((r) => ({
          ...r, self: r.id === this.client.id,
          ...(roundList && r.roundKills !== undefined && r.roundDeaths !== undefined && r.roundScore !== undefined
            ? { kills: r.roundKills, deaths: r.roundDeaths, score: r.roundScore } : {}),
        }));
        const you = this.rows.find((r) => r.id === this.client.id);
        // PF-26: the MVP is `./roundScreens` `pickMvp`'s; YOUR STATS the row's three and the room's counters.
        return {
          kind: item.screen, secondsLeft: Math.max(0, item.seconds - t), elapsed: t, winner: sc.winner, wins: sc.wins, rows,
          you: you ? yourStatsOf(you, sc.stats?.[this.client.id]) : null, timePlayed: (performance.now() - this.joinedAt) / 1000,
        };
      }
      t -= item.seconds;
    }
    return null;
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
  }

  /** One frame; `real` the frame's real seconds (PAR-34, `./frameTime`; default `dt`), the bodies' timed fades' (`RemotePlayers.frame`). */
  frame(dt: number, camera: PerspectiveCamera, trigger: boolean, real = dt): void {
    this.retry();
    const elapsed = this.screensElapsed();
    this.deps.hud.setRoundScreen(this.roundScreen(elapsed));
    this.sweepDrops(elapsed);
    this.flushPressRounds();                       // LATER 347: a press's round, once the walk has sent its frame's commands
    this.setTrigger(trigger);
    const scale = (this.client as { dtScale?(): number }).dtScale?.() ?? 1;   // PT-19 (F2): the replay's speed, both clocks
    this.deps.remote.frame(dt * scale, this.client.bodies(), camera, real * scale);
    this.deps.roundAudio?.frame();                 // INT.R7: the round's cues that are due
    this.spectator.frame(cameraEye(camera), real); // PF-31: the follow, the scenic view (W6: its look and zoom in real seconds), the watched teammate
    if (this.launchAt !== null) this.deps.hud.setTimer(Math.max(0, (this.launchAt - this.now()) / 1000));
    else if (this.endsAt !== null) this.deps.hud.setTimer(Math.max(0, (this.endsAt - this.now()) / 1000));
  }

  /** PF-31: the pad, once a frame (`./main`'s and `./matchMount`'s pad frames): the spectator's and the benched player's controls on release. */
  spectatorPad(input: Input): void {
    this.spectator.pad(input, DEAD_CYCLE_WHILE_MENU_READING === 'blocked' && (this.deps.menuOpen?.() ?? false));
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
        this.deps.remoteGrenade(kind, from, velocity, owner, pid, phase);
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
    this.sentThrows.clear();                      // a stale pre-spawn throw cannot refund the new kit
    this.dead = null; this.ghostSince = null; this.unbench(); hud.setHealth(1); this.deps.walk.setDeathPose(null);
    this.ghostDead = false;                                   // NU-11b F1: the client's `spawned` gave the walk back alive
    this.notice(null);                                        // OT.R59 (RECONNECT-GHOST (B)): the reconnect's line goes at its spawn
    this.deps.respawned(ev.kit ?? null, ev.char ?? null);   // the server's kit and type at this spawn (room.ts)
  }

  /** PF-31 / PAR-48: the map's scenic views as the spectator reads them (`NetPageDeps.scenicViews`), for the HUD's title. */
  scenicViews(): readonly ScenicView[] {
    return this.deps.scenicViews?.() ?? [];
  }

  private spectatorWelcome(position: number): void {
    this.deps.walk.setMode('fly');
    if (position > 0) this.deps.hud.postMessage(queueLine(position));   // a watcher is not in the line
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
        break;
      case 'joined': this.seatBot(ev.id, ev.bot); this.names.set(ev.id, ev.name); this.teams.set(ev.id, ev.team); remote.setTeam(ev.id, ev.team); remote.setCharacter?.(ev.id, ev.character ?? null); break;
      case 'botCharacter': remote.setCharacter?.(ev.id, ev.character); break;
      case 'renamed': this.names.set(ev.id, ev.name); if (ev.id === this.client.id) this.name = ev.name; break;
      case 'left': remote.forget(ev.id); this.teams.delete(ev.id); this.bots.delete(ev.id); this.myVotes.delete(ev.id); break;
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
          remote.died(ev.victim, ev.clip);
          // HX-5 (research 239 s6): the script's SealKillN / HostKillN by the killer's side -- the stream, the line, WAIT 2,
          // the second line (`HOSTAGE_CUES_READING`, `PENALTY_LINE_READING`); none for a world kill (no valve moves).
          const side = ev.killer === null ? undefined : ev.killer === this.client.id ? this.localTeam() : this.teams.get(ev.killer);
          if (side) this.deps.roundAudio?.hostage?.(side === 'seal' ? 'killedBySeals' : 'killedByTerrorists', this.post);
          break;
        }
        // A kept name is untrusted text (the area (c) re-read's finding 5): its marker bytes never draw a bot's gold initial (BNI.R1).
        hud.postMessage(killLine(ev.how, ev.killer === null ? plainBotText(keptName(ev) ?? '') || null : this.displayNameOf(ev.killer), this.displayNameOf(ev.victim), ev.weapon));
        // The room's voice gate (`FUN_0053b710`): a death within 3 s of the body's hurt voice comes `voiced: false`.
        // LATER 657: the death voice is the dying console's own -- the actor's +0x58 (`FUN_00547af0` D:L413024) reaches
        // its controller's +0x18, the local SEAL's `FUN_005979a0` (D:L454473-454480) playing 0x3c/0x3d, a remote body's
        // `FUN_005e6290` (D:L497312-497328) a valve clear and no voice -- so another's death plays none on this page. A
        // bot's is its AI controller's, on the console running it (`FUN_005714b0` D:L433901-433907): the offline match's
        // page runs the room (`solo`) and voices its bots; online the server runs them, and a page voices none.
        if (typeof ev.cause === 'number' && ev.voiced !== false && this.deps.deathVoice) {
          if (ev.victim === this.client.id) this.deps.deathVoice(ev.cause, null, null, this.deps.walk.feet());
          else if (this.deps.solo && this.isBot(ev.victim)) {
            this.deps.deathVoice(ev.cause, this.teams.get(ev.victim) ?? null, remote.playerType(ev.victim), remote.feet(ev.victim));
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
        } else remote.died(ev.victim, ev.clip);
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
        this.sentThrows.clear();                        // the authoritative snapshot supersedes predicted throw counts
        this.dead = null; this.ghostSince = null; this.unbench(); this.deps.walk.setDeathPose(null); this.ghostDead = false;
        hud.setHealth(this.ownHealth = overall({ hp: ev.health, armour: ev.armour }));
        this.deps.kitChanged?.(ev.loadout, null, ev.rounds, undefined, {
          pouch: ev.pouch, held: ev.held, weapon: ev.weapon,
          ...(ev.equipmentSlots !== undefined ? { equipmentSlots: ev.equipmentSlots } : {}),
        });
        this.notice(null);
        break;
      case 'hurt': {
        // j5t3o2iU: a drop the body lives through rumbles the pad (`FUN_005477a0` -> `FUN_00597b00`), every one: the voice's
        // gate is the room's `hurtVoice`, not this. A lethal one is the death's rumble (`died`), no drop none.
        const health = overall({ hp: ev.health, armour: [] });
        if (health < this.ownHealth && !isDead({ hp: ev.health, armour: [] })) this.deps.ownHurt?.();
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
        if (ev.id !== this.client.id) remote.flinch(ev.id, ev.clip);
        else if (!this.dead) {
          let at = performance.now();
          const clip = ev.clip;
          // LATER 512: its clock settable (`PhasedPose.at`), so the walk draws it again from the phase a door push covered it at.
          const pose = Object.assign(() => flinchPose(clip, (performance.now() - at) / 1000, this.deps.clips()), {
            at: (seconds: number) => { at = performance.now() - seconds * 1000; },
          });
          // PAR-60: the room's window as the page's own stick cut it (the walk's commands already run; `room.ts` `flinchCut`).
          const cut = this.deps.walk.setFlinchPose(pose, flinchCutWindow(ev, clip, this.deps.clips())) ?? null;
          if (reloadInFlinch(this.reloadSeq, cut === null ? ev : { from: ev.from, until: cut })) this.deps.undoReload?.();   // PF-18: the room dropped it 'flinch'
        }
        break;
      // DOORS (research 92 section 2): a one-shot a map program pushed on a body -- the door's `ai::ANIMATE` `Open door`
      // on the presser, sent by `FUN_00588bc0`'s own Push Blend (D:L446413-446414) -- played as the flinch is: on another's
      // body whole (`pushMotion`), on the page's own through the walk with the room's cut window and no reload gate (the
      // push sets no motion flag 0x4). Additive: an older page ignores it, an older room never sends it.
      case 'motion':
        if (ev.id !== this.client.id) remote.pushMotion(ev.id, ev.clip);
        else if (!this.dead) {
          const at = performance.now(), clip = ev.clip;
          this.deps.walk.setFlinchPose(() => flinchPose(clip, (performance.now() - at) / 1000, this.deps.clips()),
            flinchCutWindow(ev, clip, this.deps.clips()), { reloadGate: false, pushed: true });
        }
        break;
      case 'blast':
        if (ev.ring) this.deps.ring?.(ev.ring.seconds, ev.ring.volume);   // the knock: `NetClient`
        if (ev.flash) this.deps.whiteOut?.(ev.flash);                      // P2: the room's level (FLASH_FRIENDLY_FIRE_READING)
        // PF-19 (research 218 §3): the room laid `Prone cover` after command `after` and drops a reload named past it
        // 'proneCover'; the page's, sent before this event arrived, is undone as a flinch's is (PF-18).
        if (ev.knock?.fall === 'proneCover' && this.reloadSeq !== null && this.reloadSeq > ev.after) this.deps.undoReload?.();
        break;
      // LOW-2 (research 223 s6): the room refused the page's own reload, round or throw stale. The last reload, named, is
      // put back as the room has it (`staleReload`, however long ago it ended); a round back to its weapon and a throw's
      // item back to the pouch, once a seq (a pull's rays share one).
      case 'stale': {
        if (ev.request === 'throw') {
          const use = this.sentThrows.get(ev.seq);
          if (!use) break;
          this.sentThrows.delete(ev.seq);
          if (use.shot !== undefined) this.deps.staleThrow?.(use.kind, use.slot, use.shot);   // LATER 503: a rocket's
          else if (use.slot === undefined) this.deps.staleThrow?.(use.kind);
          else this.deps.staleThrow?.(use.kind, use.slot);
          break;
        }
        const sent = ev.request === 'fire' ? this.sentFires : this.sentReloads;
        const v = sent.get(ev.seq);
        if (v === undefined) break;
        sent.delete(ev.seq);
        if (ev.request === 'fire') this.deps.staleRound?.(v as number);
        else { if (ev.seq === this.reloadSeq) this.reloadSeq = null; this.deps.staleReload?.(v); }
        break;
      }
      case 'hurtVoice':
        if (ev.id === this.client.id) this.deps.hurtVoice?.(null, null, this.deps.walk.feet());
        else this.deps.hurtVoice?.(this.teams.get(ev.id) ?? null, remote.playerType(ev.id), remote.feet(ev.id));
        break;
      case 'taunt': this.deps.taunt?.(ev); break;
      case 'communication': this.deps.communication?.(ev); break;
      case 'chat': this.deps.gameChat?.(ev); break;   // SVC-19: the game session's line, to the game lobby's panel (`FUN_002ba9d0`), never the HUD
      case 'system': this.deps.systemMessage?.(ev); break;   // SA-43c Part 2: the server's system message, routed by the front end (`FUN_0030dce0`)
      case 'voiceFloor': this.deps.voiceFloor?.(ev); break;
      case 'shot':
      case 'impact': {
        // INT-NET-2: the page's own round comes back only when a body stopped it (the room's hit, never predicted), as an
        // `impact`: its impact alone, once a shot (research 91 section 23; OWN_BLOOD_READING). A `shot` of its own id is
        // never the room's (review finding 1) and plays nothing: the page drew its own round.
        const own = ev.type === 'impact';
        if (ev.id === this.client.id ? !own : own) break;
        // Protocol 7: the item that fired, by id -- its record (the kit table's), else the side's slot that holds it.
        const side = this.deps.weapons(this.teams.get(ev.id) ?? 'seal');
        const w = this.deps.recordOf?.(ev.weapon) ?? side.find((r) => r.id === ev.weapon) ?? side[0];
        const count = (this.tracerRounds.get(ev.id) ?? 0) + 1;
        this.tracerRounds.set(ev.id, count);
        const mine = this.localTeam();
        const theirs = this.teams.get(ev.id) ?? null;
        const e: Extract<FireEvent, { type: 'round' }> = {
          type: 'round', weapon: fireWeaponOf(w), from: ev.from, to: ev.to, hit: ev.normal !== null, rounds: 0,
          normal: ev.normal, material: ev.material,
          // The page's own round already drew its tracer. Another's uses the same every-fourth rule on the shots
          // this page has seen (research 89 §4, §19). P12b (match `room.ts` SHOT_EVENT_BODIES_READING): its tracer runs to
          // the round's end (`end`, when `to` is the first body), as the shooter's own does; the impact stays at `to`.
          // LATER 644: every round keeps that end, tracer or not -- the passing sound walks the whole path (research 81).
          ...(ev.type === 'shot' && tracerRound(ev.weapon, count)
            ? { tracer: true as const, tracerKind: tracerKindFor(ev.weapon, mine !== null && theirs === mine) }
            : {}),
          ...(ev.type === 'shot' && ev.end ? { tracerTo: ev.end } : {}),
        };
        if (own) this.deps.roundImpact?.(e);
        else {
          this.deps.roundEffects(e, ev.id);
          // P12 (SW-3; match `room.ts` SHOT_EVENT_THROUGH_READING): every other world surface the round struck, an impact
          // each -- no second muzzle, tracer or report (`roundImpact`, the impact alone), as the shooter's page plays its
          // own through-surfaces (`./matchFirearm`). Never on the page's own `impact`: its own walk drew them.
          for (const t of ev.type === 'shot' ? ev.through ?? [] : []) {
            this.deps.roundImpact?.({ ...e, to: t.point, normal: t.normal, material: t.material, hit: true, tracer: undefined, tracerKind: undefined, tracerTo: undefined });
          }
        }
        break;
      }
      case 'reloadSound': {
        // REMOTE_RELOAD_SOUND_READING: the item's record by id (as a shot's, but no stand-in: another item's sound is
        // wrong), at the body as drawn -- the room's feet while it is not -- never the page's own (its reload played).
        if (ev.id === this.client.id) break;
        const side = this.deps.weapons(this.teams.get(ev.id) ?? 'seal');
        const w = this.deps.recordOf?.(ev.weapon) ?? side.find((r) => r.id === ev.weapon) ?? null;
        if (w) this.deps.reloadSound?.(w, remote.feet(ev.id) ?? ev.at);
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
      case 'kit': this.deps.kitChanged?.(ev.loadout, ev.slot ?? null, ev.rounds, ev.filled); break;
      case 'placed': this.deps.tagOwnProjectile?.(ev.kind, ev.from, ev.pid); break;
      case 'detonate': this.deps.detonateProjectile?.(ev.pid); break;
      case 'timeExpired':
        hud.postMessage('TIME EXPIRED', 0.9); this.endsAt = this.now();
        this.deps.roundAudio?.timeExpired();           // `mission_timer2`'s cue: the SEALs' win music, no line (research 124 §5)
        break;
      case 'countdown': this.countdown(ev.seconds); break;   // the owner's launch countdown (2026-10-01)
      case 'roundStart':
        // Protocol 10 (MAP-03): the round's epoch kept and the page's world reset as the level opened (`FUN_002ac0e0`,
        // as the room's `startRound` does) -- in `NetClient.newEpoch`, the one place, which does nothing when a snapshot
        // of this round already crossed the boundary; from now a state of an older round is not applied.
        if (typeof ev.epoch === 'number') this.client.newEpoch(ev.epoch);
        this.deps.newRound?.();                         // the last round's decals go (CMPExitState L76084)
        this.escorteeUnits.clear();                     // HX-4a: the round's reset moves no hostage by an order (no YES)
        this.tracerRounds.clear();
        this.launchAt = null; this.roomWaits = false; this.roundSeconds = ev.seconds; this.roundLength = ev.seconds;
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
        this.tracerRounds.clear();
        this.unbench();
        if (this.deps.game) { this.endGame(GAME_ENDED_DIALOG_READING, 'abandoned'); break; }   // the match is over: no waiting line
        hud.postMessage(ABANDON_LINE_READING);
        if (this.client.role === 'player') hud.postMessage(WAITING_LINE_READING);   // the room waits for both sides again
        break;
      case 'roundOver':
        this.deps.roundAudio?.roundOver();              // closes the round; `abort` and `success2` play nothing
        this.endsAt = null;
        this.screens = { start: this.now(), list: ev.screens, winner: ev.winner, wins: ev.wins, stats: ev.stats };
        break;
      case 'score':
        for (const row of ev.rows) this.seatBot(row.id, row.bot);
        this.rows = ev.rows;
        hud.setScoreRows(ev.rows.map((r) => ({ ...r, self: r.id === this.client.id })), ev.spectators, ev.wins);
        // LATER 152 (`DEFUSE_CLOCK_HELD_READING`): a held clock stops at its figure (a defuse); else it counts from `timeLeft`.
        if (ev.timeLeft !== null && ev.clockHeld) { this.endsAt = null; hud.setTimer(ev.timeLeft); }
        else if (ev.timeLeft !== null) this.endsAt = this.now() + ev.timeLeft * 1000;
        break;
      case 'queue': if (ev.position > 0) hud.postMessage(queueLine(ev.position)); break;
      case 'promoted':
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
        } else hud.postMessage('YOU ARE IN: A PLACE IS FREE');
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
          if (this.deps.game && ev.reason === SERVER_CLOSING_REFUSAL.reason) this.endGame(GAME_SOCKET_CLOSED_DIALOG_READING, 'disconnected');
        }
        break;
      }
      // SVC-23f: the vote lines as `FUN_002b6530` draws them -- colour 2, past the leading spaces (`./spectatorVote`):
      // the team vote's (S:0x3f26c0, `FUN_002ba040` D:L159765-159766), the Spec Vote's and the eject's (research 264 §4.5).
      case 'votes': hud.postMessage(teamVoteLine(ev)); break;
      case 'spectatorVote': case 'spectatorsEjected': hud.postMessage(spectatorVoteLine(ev)); break;
      case 'loadout': this.deps.loadoutAnswer?.(ev.kit, ev.refused, this.inFlight.shift() ?? null, ev.char ?? null); break;
      // S2 round 4: this page's seat went to a newer connection of its session token (a duplicated tab, which starts
      // with a copy of this tab's session storage): a new token, and the usual rejoin -- as a new joiner.
      case 'kicked':
        // HARD-SEAT: in a game the seat is the account's, and its other tab has it now: the end, not a rejoin (N-1).
        if (ev.reason === 'replaced' && this.deps.game) { this.endGame(GAME_SOCKET_CLOSED_DIALOG_READING, 'disconnected'); break; }
        if (ev.reason === 'replaced') { (this.openSession ?? this.deps.session)?.renew(); this.replaced = true; hud.postMessage(REPLACED_LINE_READING); break; }
        if (this.deps.game) this.endGame(ev.reason === 'vote' ? GAME_KICKED_DIALOG_READING : GAME_SOCKET_CLOSED_DIALOG_READING, ev.reason === 'vote' ? 'kicked by a vote' : 'kicked for inactivity');
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
