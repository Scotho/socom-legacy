import { createForgeLighting, liftForgeFog, type ForgeLightingOptions } from './forge/lighting';
import { Scene, type Object3D } from 'three';
import { freezeSceneMatrix } from './sceneMatrix';
import { aiCellOf, probeFloor, probeGround, selectFloor, type Side } from '@s2u/scene';
import { BINOCULAR_CLIPS } from './binocularPose';
import { frameCanvas } from './brightness';
import { GameAudio, type AudioStats } from './audio';
import { PLAY_CLIPS } from './animator';
import { buildBody, type BodyView } from './bodyView';
import { FlyCamera } from './camera';
import { ELF_DEFAULT_FOGCOL, fogForExtent, type FogSettings } from './fog';
import { gameSeatOf, voiceReportSocket } from './connectHost';
import type { GameLobbyHandOff } from './gameLobbyHost';
import { mergeInput, noInput, PadWatch, padInput, type Input, type PadSource } from './gamepad';
import { readGraphicsBackend } from './graphicsBackend';
import { GpuTimer, gpuTimeAsked, type GpuStats, type TimestampRendererLike } from './gpuStats';   // CPS GPU time: the dev-only GPU timer (`?devmode&gputime`)
import { devSwitches } from './source';            // CPS H9: the dev tools switch `./devTools` asks, for the hook's renderStats (not `./devTools`: it reaches the shell's fly gate, PAR-17)
import { frameCountsOf, frameOverlaysCulledOf, frameOverlaysOf, renderStats, type FrameCounts, type RenderStats } from './renderStats';   // CPS H9: PRF-4's counts on the match's renderer, a development build's only; H10: the effect-light overlays
import type { ForgePlayPort } from './forge/agent/play';
import { HostagePage } from './hostagePage';
import type { ViewerHook } from './hook';
import { Hud, ownHudName, spectatorHudView, type HudView } from './hud';
import { keepClearWatch } from './hudMessagePanel';
import { sessionGameDetails } from './scoreboard';
import { handRoundScreenBitmaps, type ArmoryBitmaps } from './roundScreens';
import { HudVoiceElement, voiceHudFrame } from './hudVoice';
import { teamTagInput, teamTags } from './hudTags';
import { NO_REGION, RegionCull, regionUnder } from './regionCull';
import { DEFAULT_LIGHTING, type Lighting } from './lighting';
import type { LoadedMap } from './loadMap';
import { itemIcon, PlayerLoadout } from './loadout';
import { dropModels, heldOfItem, WorldDrops } from './drops';
import { pickupKitOf } from './net/pickupRules';
import { finalCloseDialog, LOBBY_MATCH_EVENTS_ADAPTATION, missionMapPath, type MatchHandle } from './lobbyMatch';
import { rankOf } from './mapOrder';
import type { NetClient } from './net/client';
import { pickSurfaces } from './net/hostageOrder';
import { corpseShownS, DEATH_CLIPS, FLINCH_CLIPS } from './net/deaths';
import { TURRET_CLIPS } from './net/emplacement';
import type { Rules, ServerEvent, Team } from './net/protocol';
import { NetPage, type NetPageDeps } from './netPage';
import { flushedPad } from './padFlush';
import { ownBodyRead, Play, type PlayClips } from './play';
import { actionHands, mountActions } from './matchActions';
import { bombSound, ownBombBody, worldPulse } from './bombPage';
import type { CancelCause } from './actionContext';
import { DoorPage } from './doorPage';
import { DOOR_CLIPS, openDoorClip } from './doors';
import { pushedWindowOf } from './net/flinchReload';
import { GatePage } from './gatePage';
import { CranePage } from './cranePage';
import { mountFirearm, type MatchFirearm } from './matchFirearm';
import { FRONT_END_CAPABILITIES, feedCamera, liftFog, mapFog, matchSide, setRemoteMap, standOf } from './matchCore';
import { matchNetDeps } from './matchNet';
import { mountExchange, type ExchangeState } from './matchExchange';
import { mountArmory } from './matchArmory';
import type { ArmoryData } from './armoryData';
import { exchangeTaps, mountTip, mountTouch, promptDeviceOf, readsPad, type MatchTouch } from './matchTouch';
import { pageSettings, tabSettings, tipStoreOf } from './pageStore';
import { mountFpsReadout, type FpsReadout } from './matchFps';
import { documentFullscreen, toggleFullscreen } from './mobileFullscreen';
import { pressUnlessArmory, unlessArmory } from './armoryGlue';
import { playerLanes, type LaneParts } from './matchLanes';
import { mountSound, silentOut, type MatchAudio } from './matchSound';
import { mountEffects } from './matchEffects';
import { mountThrowables } from './matchThrow';
import { MatchAbort } from './matchAbort';
import { mountTaunts, type MatchTaunts, type TauntsState } from './matchTaunts';
import { mountChat, type ChatState } from './matchChat';
import { mountVoice, type MatchVoice, type VoiceState } from './voice/voiceClient';
import { externalWhispers, mountRoundChat, type RoundQueueLine } from './roundChat';
import { mountRoundTextLine } from './roundTextLine';
import { localStartMenuOptions, StartMenu, type StartMenuOptions, type StartMenuState } from './startMenu';
import type { PlayOptions } from './originalOptions';
import { matchOptions, type MatchOptions } from './matchOptions';
import type { NativeSettings } from './nativeSettings';
import { fireModeInputFor } from './fireModeInput';
import { padButtonsDown } from './weaponExchange';
import { refusalLine } from './matchMessages';
import { buildPageWorld, type PageWorld } from './matchWorld';
import type { RenderedSound } from '@s2u/sound';
import type { SoundData } from './soundData';
import type { EffectData } from './effectData';
import { flinchPose, RemotePlayers } from './remotePlayers';
import { mountCharShadow } from './charShadow';
import { ratioTargetOf, shadowRendererOf, type MatchRenderer } from './matchRenderer';
import { MATCH_CANVAS_CLASS, PICTURE_PS2_CLASS, VIDEO_PICTURE_DEFAULT, pictureExperimentalSettings, type VideoPicture } from './picture';
import { detailDistanceFor, detailDistanceKeeper } from './detailDistance';
import { PS2_FRAME } from './renderer';
import { hdTextures } from './hdTexturePack';
import { HdServedPack } from './hdTexturePackServed';
import { pageHdStore } from './hdTexturePackStore';
import { warmMapEffects } from './matchWarm';
import { AdaptiveRatio, pixelRatioCap, watchViewport, type ViewportWindow } from './matchViewport';
import { renderCapFor, videoSettingsKeeper } from './videoSettings';
import { pageFrameSampler } from './frameSampler';
import { beaconMatchBegan, beaconMatchEnded } from './clientErrorBeacon';   // CLIENT_ERROR_BEACON_ADAPTATION: the match's own lifecycle for its reports
import { wantsTouchControls } from './touch';
import { resolveRules } from './rules';
import { ScoreboardKeys } from './scoreboardKeys';
import { GamePad } from './setupPad';
import { controllerStanceMode } from './startupSettings';
import { StanceButton } from './stanceButton';
import { FrameTime } from './frameTime';
import { bodyForTeam, OwnBody } from './teamBody';
import { THROW_CLIPS } from './throwPose';
import { TRAVERSAL_CLIPS } from './traversal';
import { TraversalPage } from './traversalPage';
import { craneScene } from './craneHook';
import { drawnTurretParts, placementView } from './turretHook';
import { withVictoryClips } from './victoryData';
import { STEP_PROBE_LIFT_READING, WalkMode } from './walk';
import { WEAPON_CLIPS } from './weaponPose';
import type { SourceRequest, ViewerRequest, ViewerResponse } from './worker';
import { buildWorld, type WorldView } from './world';
import { markLoad } from './loadMarks';
import { mouseSite } from './mouseTesting';

/**
 * ONL-18c (web research 166 §8): the match's world in the front end's page. `LobbyMatch` (ONL-18) hands the lobby's
 * open client to its `start` port once the loading screen's hold lets go; this module is that port's match, mounted
 * into an element the caller gives -- the map viewer's world built from the mission's archive (`missionMapPath`), the
 * walk, the own and the others' bodies, the HUD with its scoreboard and round screens, the pad, and a `NetPage` on the
 * **same** client (`NetPageDeps.game.adopt`, research 166 §1; the session's hold and the pinned URL as ONL-18 and
 * HARD-SEAT left them). It reads no page markup: `/testroom`'s module (`./main`) reads its own when it loads (`#view`,
 * `#mode`, `#loading`, `#mp-name`, `#tw-weapons` ...), so the front end could not import it -- and must not (OT.R12:
 * the front end's bundle stays free of `./main`; the front end loads this module with `import()` at the match's load).
 *
 * ONE-WIRE (web research 222): the match's wiring is `/testroom`'s own, not a copy -- both pages mount the same parts:
 * `./matchCore` (the capabilities switch, the side, the kit on the map, the fog, the stand, the camera's lanes),
 * `./matchFirearm` (the firearm), `./matchNet` (the `NetPage` deps), `./matchLanes` (the pad's game lanes), `./matchSound`
 * (the sound, MATCH-SOUND: on the match's own `GameAudio` over the menus' context, research 222 §7), `./matchThrow` (the
 * throwables, the launcher and the R2 inventory, MATCH-THROW: research 222 §8), `./matchActions` (sprint 27's action part
 * with the doors and the traversal it picks among, ACT-1: research 250). What this page
 * mounts is its switch, `FRONT_END_CAPABILITIES`; the parts it does not are `MATCH_MOUNT_PARTS_PLACEHOLDER`'s, each
 * mounted here by turning its switch on and handing its part.
 */

/**
 * MATCH_MOUNT_PARTS_PLACEHOLDER: the parts of the match the front end's page mounts (ONL-18c, ONL-18d) -- the world, the
 * walk on the pad, the own body and the others' (their clips), the HUD (the clock, the messages, the scoreboard held on
 * SELECT, the round's banners and end screens, the compass and the stance), the match on the lobby's client, and the
 * firearm with its reticle and its effects (one wiring with `/testroom`'s since ONE-WIRE, research 222), and since
 * MATCH-SOUND the sound with the round's streamed cues (`./matchSound`, research 222 §7), since MATCH-THROW the
 * throwables, the launcher and the R2 inventory that takes them up (`./matchThrow`, research 222 §8: a round mode's round
 * flown here too), and since ACT-1 (ruling ACT.R1, research 250) the doors, sprint 27's actions (`./matchActions`: the
 * switches, the bomb, the turrets) and the traversal (ladders, climbs, the peek, the water), and since ACT-5 the hostages'
 * orders and marks (HX-4a/HX-5, research 239 s7, 250 s6; ruling ACT.R5: unreachable from the lobby until Desert Glory is
 * listed, ruling ACT.R6), and since TAUNTS the Chat menu's taunts (`./matchTaunts`, research 301), and since PAR-1 WEAPON
 * EXCHANGE and the dead's prompt (`./matchExchange`, research 253). Since PAR-4 the world drops (`./drops`) and the action part's pickup on them (H120).
 * Since SVC-20b-page the voice client (`./voice/voiceClient`, research 226 §3). Since PAR-2 (OT.R43) the seat ARMORY
 * (`./matchArmory`: `/testroom`'s part), mounted and dormant: the original's ARMORY on this path is the lobby's
 * (`./lobbyArmory`; research 222 §5), so no hello of this page asks the room for a held seat.
 * Since PAR-5 the touch layer (`./matchTouch`: `/testroom`'s part, on a real touch device; research 222 §11).
 * Not mounted yet (`FRONT_END_CAPABILITIES`' parts that are off): the tactical map. The original's match has every one
 * (research 166 §8); the evidence that settles it is each part mounted here and a two-page browser run.
 * [placeholder]
 */
export const MATCH_MOUNT_PARTS_PLACEHOLDER = 'world, walk, bodies, HUD, the match, the firearm and its effects, the sound, the throwables, the launcher and the R2 inventory, the doors, the actions (the switches, the bomb, the turrets), the traversal, the hostages (unreachable from the lobby until Desert Glory is listed: ACT.R6) and the Chat menu taunts, its tactical orders and messages, the voice client, and WEAPON EXCHANGE (exchange), and since PAR-6 the character shadow, and since PAR-4 the world drops and their pickup, and since PAR-2 the seat armory (mounted, dormant: on this path the original ARMORY is the lobby one), and since PAR-5 the touch layer (touch); tactical map not yet' as const;

/** The window the match runs its frames and listens on (the page's; the tests' fake). */
export interface MatchWindow {
  requestAnimationFrame(cb: FrameRequestCallback): number;
  cancelAnimationFrame(id: number): void;
  addEventListener(type: string, fn: EventListener): void;
  removeEventListener(type: string, fn: EventListener): void;
  navigator?: PadSource;
  /** PAR-12: the phone browser bar's resizes (`./matchViewport` `watchViewport`); absent on the tests' fakes. */
  visualViewport?: ViewportWindow['visualViewport'];
  /** CPS H9: the page's query, for the dev panel's gate on the hook's `renderStats` (`?devmode`); absent, the gate is shut. */
  location?: { readonly search: string };
}

/** What the match draws with: since PAR-6 the contract is `./matchRenderer`'s (web research 255 s1), re-exported here. */
export type { MatchRenderer } from './matchRenderer';

/** The mission's world and the play clips, decoded while the loading screen showed (`matchLoader`). */
export interface MatchAssets {
  map: LoadedMap;
  clips: PlayClips | null;
  /** The map's effect data (`./worker`'s `effects`: the rounds' runs, the marks, the scope lenses); absent, none (ONL-18d). */
  effects?: EffectData | null;
  /** The map's sound data and its rendered loops (`./worker`'s `sound` and `soundLoops`); absent, none (MATCH-SOUND). */
  sound?: { data: SoundData; loops: readonly { name: string; sound: RenderedSound }[] } | null;
}

export interface MatchMountOptions {
  /** Browser adaptation: constructor-injected normal input, accepted only on an actual private loopback client. */
  normalInput?: ForgePlayPort;
  /**
   * FG-24 (the forge's day/night slider, FG.R18; an adaptation, no original): the match's brighten (`./lighting`
   * `Lighting.brighten`, the uniform over every material). Unset -- every caller but the forge's Play -- the match lights
   * as it always has (`DEFAULT_LIGHTING`); the game's own lighting is untouched.
   */
  brighten?: number;
  /** Opt-in Forge browser adaptation. Unset, every ordinary match keeps the original renderer. */
  forgeLighting?: ForgeLightingOptions;
  /**
   * FG-51 (a forge adaptation, no original): the layout's own mode name (`Demolition`, ...) when the layout names a
   * game type. Unset -- every match but that forge layout -- the map's rank (`rankOf`), as before.
   */
  gameMode?: string;
  /**
   * LATER 456 (a forge adaptation, no original -- the original has no content props; H336): the caller's own objects
   * drawn with the world -- the Forge's Play with FORGE_PLAY_CONTENT_PROPS_ADAPTATION on (`./forge/page`), its content
   * props at their placements -- on the scene right after the world, off it with the match. The caller owns them (built
   * and disposed by it). Unset -- every match but the Forge's Play -- the scene is as before.
   */
  extraWorld?: Object3D;
  /** The lobby's open client (`GameLobbyHandOff.client`), the session held by it. */
  client: NetClient;
  /** The lobby's events so far, the welcome first (`LobbyMatch`'s). */
  events: readonly ServerEvent[];
  /** The hand-off: the game's id, the ticket and the pinned URL a drop reopens (`NetPageDeps.game`), or a placed game's door and token (SA-6b). */
  handOff: GameLobbyHandOff;
  /** connect's `lobby.socketHolds` (research 157 §6): told at the match's drops, re-welcomes and close. */
  holds(held: boolean): void;
  /** The mission's world; null (a failed load) is a match with no world drawn, its client still listened to. */
  assets: Promise<MatchAssets | null>;
  /** The renderer over the match's canvas; absent, `./renderer`'s (WebGPU, else WebGL2), loaded with the match. */
  renderer?: (canvas: HTMLCanvasElement) => Promise<MatchRenderer>;
  /** OT.R79 (`./picture`): VIDEO MODE's picture, drawn and followed while the match runs; absent, MODERN (what the match drew before). */
  picture?: { get(): VideoPicture; observe(f: (picture: VideoPicture) => void): () => void };
  /** The window; absent, the target's document's. */
  win?: MatchWindow;
  /**
   * `LobbyMatch.blocked` (PR #10's hold): true until the round runs. While it holds, the camera takes no input and the
   * pad is flushed each frame, as `./main`'s `padFrame` does under its `loadingJoin.blocked`; absent, never held.
   */
  blocked?: () => boolean;
  /**
   * MATCH-SOUND (research 222 §7): the match's own audio (`frontEnd.ts` `frontEndMatchSound`: a `GameAudio` on an output
   * over the menus' context), released at the match's release and close; absent, the match is silent.
   */
  audio?: MatchAudio;
  /** TAUNTS (`./matchTaunts`, research 301): the five as the session's MPTAUNTMSG1-5 hold them; absent, the disc's defaults. */
  taunts?: () => readonly (string | null)[];
  /** MESSAGES (`./matchChat`, research 302): the five as the session's MPLOCALSOP1-5 hold them; absent, the disc's defaults. */
  messages?: () => readonly (string | null)[];
  /**
   * OPTIONS (research 302 §4): the pitch sign, the head bob and the fire-mode swap as the session's last `StoreOptions`
   * left them (`./originalOptions` `playOptionsOf`), read each frame; absent, the original's defaults.
   */
  options?: () => PlayOptions;
  /**
   * PAR-3 (research 255 s3): the page's ARMORY read for the mission -- the front end's is the lobby's (`frontEnd.ts`,
   * `keepMissionRead`) -- whose bitmaps hold the round screens' backdrop and panels (`./roundScreens`
   * `handRoundScreenBitmaps`); absent, or null, the screens draw their colour-exact shapes. PAR-2: the same read is the seat
   * ARMORY's data (`./matchArmory` `setData`; a read with no layout opens no screen).
   */
  armory?: Promise<ArmoryData | ArmoryBitmaps | null>;
  /**
   * SVC-19 (research 266 §3.4): another seat's game-session line heard in the match (`NetPageDeps.gameChat`) -- the
   * front end's game lobby's `chatLine`, its panel's (`FUN_002ba9d0` appends with no state test, D:L160135); absent,
   * dropped.
   */
  gameChat?: (event: Extract<ServerEvent, { type: 'chat' }>) => void;
  /**
   * SA-43c Part 2 (research 345 sections 1-2): the room's `system` event heard in the match (`NetPageDeps.systemMessage`)
   * -- the front end's `BriefingRoomChat.systemMessage`, Part 1's routing of `FUN_0030dce0` (in a round the HUD's line);
   * absent, dropped.
   */
  systemMessage?: (event: Extract<ServerEvent, { type: 'system' }>) => void;
  /**
   * SVC-19 (research 266 §3.3): EXTERNAL WHISPERS' global as the session's last `StoreOptions` left it
   * (`OptionGlobals.value('EnableExternalWhispers')`, `DAT_003de620`); absent or undefined, its initial 1 (`./roundChat`).
   */
  externalWhispers?: () => number | undefined;
  /**
   * KEYBOARD-WHISPER (OT.R48; research 266 §3.9): the round's USB-keyboard text line (`./roundTextLine`) -- `online()`,
   * the round online with `ComeFromLan` 0 (`FUN_001f7ff0` D:L56828-56830: the front end's session's valve), and
   * `whisper(message, name)`, the lobby server's (`FUN_002f4860`: the session's `BriefingRoomChat.mediusChat`); absent,
   * no line.
   */
  textLine?: { online(): boolean; whisper(message: string, name: string): void };
  /** ONL-19 (research 269 §5): the session's UI variables and valves, GAME DETAILS' source (`./scoreboard` `sessionGameDetails`); absent, the LAN fill. */
  gameVars?: { uiVar(name: string): string | null; valve(name: string): number | null };
  /**
   * MATCH-01 (research 266 §8): the START menu's options -- the session's globals and valve registry
   * (`./startMenu` `sessionStartMenuOptions`); absent, the menu's own store (its INVERT PITCH and FIREMODE then reach nothing).
   */
  startMenuOptions?: StartMenuOptions;
  /** MLS.R1/R7 browser adaptation: isolated native Options over this match, sharing the front end's live state. */
  settings?: NativeSettings;
  /**
   * BLACK-GAP (`./loadingHold` `LOADING_UNTIL_FIRST_FRAME_ADAPTATION`, a browser adaptation): told once, when the world
   * has been drawn -- the mission's assets in (placed, or a failed load settled), the scene's warm (`ViewerRenderer.warm`'s
   * compile jobs) settled where the renderer has one, a frame rendered after that, and the next frame begun (the first
   * render's own synchronous compiles and its present behind it); absent, nothing told.
   */
  firstFrame?: () => void;
}

/** The mounted match (`LobbyMatch`'s handle), its canvas and its `NetPage` once the world is in. */
export interface MountedMatch extends MatchHandle {
  readonly canvas: HTMLCanvasElement;
  net(): NetPage | null;
  ended(): number | null;
  /**
   * SVC-19 (research 266 §3.3): the round's drain of the lobby server's queue (`FUN_001f7ff0` D:L56708-56719): a line
   * the front end's lobby chat hands the match while it is up, posted on its HUD's message window as `./roundChat` rules;
   * nothing once the match is gone.
   */
  lobbyLine(line: RoundQueueLine): void;
}

/**
 * IP3 (`LOAD_REPORT_AT_PREPARED_READING`, `./lobbyPrepare` `LOBBY_PREPARE_ADAPTATION`): the mount's options it reads before
 * `join()` -- its stage 1 (`prepareMount`): the world, the renderer, VIDEO MODE's picture, the window, the match's audio,
 * and the forge's own (its brighten, lighting, mode and props). Every other option is the hand-off's (`MatchAttachOptions`).
 */
export const MATCH_STAGE_KEYS = ['assets', 'renderer', 'picture', 'win', 'brighten', 'forgeLighting', 'gameMode', 'extraWorld', 'audio'] as const;
export type MatchStageKey = typeof MATCH_STAGE_KEYS[number];

/** IP3: what the mount's stage 1 is given (`prepareMount`): the stage's options, and what only a prepare names. */
export interface MatchStageOne extends Pick<MatchMountOptions, MatchStageKey> {
  /**
   * The seat's side before the hand-off's client is handed on (MENU-SIDE: the body and the default kit `place` puts on):
   * the game lobby's own client's team (`./gameLobbyHost` `GameSocketHost.link`, the client the hand-off hands on; a
   * SWITCH TEAMS re-seats it in the bridge's view, `NetClient`'s `gameLobby`); absent or null, the SEAL's (`matchSide`).
   * At attach the hand-off's client is the side's source, as before.
   */
  side?: () => Team | null;
  /** The canvas hidden (`visibility`, laid out as shown) until attach: a prepare's, drawn under the menus. */
  hidden?: boolean;
  /**
   * Told once: true when the world is drawn as the mount's own BLACK-GAP gate has it (the assets placed, the scene's warm
   * settled, two frames rendered: what `firstFrame` means), false when the mount cannot get there (its renderer would
   * not come, or it was let go first).
   */
  prepared?: (ok: boolean) => void;
}

/** IP3: the hand-off's options, given at attach (`PreparedMount.attach`): every option stage 1 does not read. */
export type MatchAttachOptions = Omit<MatchMountOptions, MatchStageKey>;

/**
 * IP3: the mount stopped before `join()` (`prepareMount`): built, placed, warmed and drawn on a hidden canvas, inert to the
 * player and the room until `attach` -- nothing audible, no input, no net, no HUD, its frames stopped once drawn.
 */
export interface PreparedMount {
  readonly canvas: HTMLCanvasElement;
  /** The side source read again (5d's ruling (a)): a changed side re-runs the seat's own lines, warming only what they add. */
  reseat(): void;
  /** Stage 2: the hand-off's options in, the canvas shown, the input bound and `join()` run -- nothing of stage 1 again. */
  attach(target: HTMLElement, o: MatchAttachOptions): MountedMatch;
  /** Let go before attach: the mount's own teardown (the one `close` runs). Nothing once attached: the match owns it. */
  drop(): void;
}

/**
 * The browser spec's window hook on the front end's match (note 168's `e2e/twoPagesMatch.spec.ts`), a development
 * build's only (`import.meta.env.DEV`, which every `vite build` drops): what the page's match sees and a way to face
 * another player before a round. A playtest instrument, a browser adaptation: it changes nothing of the game.
 */
export const MATCH_WINDOW_HOOK: string = import.meta.env.DEV ? '__frontEndMatch' : '';   // folded away by every build: `test/build_keyboard.test.ts` scans for it

/**
 * LATER 568's probe (`e2e/later568Mp51Visibility.spec.ts`; a browser adaptation, a read-only playtest instrument that
 * changes nothing of the game): the region gate as the page last framed it (`./regionCull`, LATER 415 / 489) -- whether
 * it is framed now (`matchMount`'s frame: a match and the walk's grid), the camera's masks, the viewer's feet and eye
 * and the region words of the floors under them, and per drawn body: a CPU or not, alive, its group visible, its meshes
 * on render layer 0 (`RemotePlayers.applyZoneGate`), its zone, the gate's verdict, its feet and its floor's region word
 * (`NO_REGION` with none, as `RegionCull.frame` steps it).
 */
export interface ZoneGateProbe {
  framed: boolean;
  floor: number; eyeRegion: number; mask: number;
  viewed: [number, number, number] | null; viewedRegion: number | null;
  eye: [number, number, number] | null; eyeUnder: number | null;
  spectator: boolean;
  bodies: {
    id: number; bot: boolean; alive: boolean | null; visible: boolean; meshes: number; onLayer0: number;
    zone: number; drawn: boolean; feet: [number, number, number] | null; region: number | null;
  }[];
}

export interface MatchWindowHook {
  team(): string | null;
  /** MENU-SIDE: the side the match plays the page as (`./matchCore` `matchSide`): its body's and its kit's. */
  side(): Side;
  /** MENU-SIDE: the kit on the page's own body (`PlayerLoadout.loadout`: the room's spawn's, five item ids). */
  kit(): number[];
  /** MENU-SIDE: the page's own body: the side whose bodies on the map hold it (null: none on, or none of a side), its model. */
  body(): { side: Side | null; model: string | null };
  /** MENU-SIDE: the map's types' own kits per side (`chartype.rdr` order; `MapArsenal.kits`), empty before the map. */
  kits(): Record<Side, number[][]>;
  /** MENU-SIDE review: another player as this page has it -- the side it holds for it, the side of the body it draws (null: none yet). */
  other(id: number): { team: Side | null; body: Side | null };
  id(): number;
  /** The other players' ids in the page's snapshot. */
  others(): number[];
  /** FBA.R10: actual drawn regional CPU bodies, read-only development evidence. */
  appearances(): ReturnType<RemotePlayers['appearances']>;
  /** The room's events heard since the mount, counted by type (`impact`, `hurt`, `shot` ...). */
  heard(): Record<string, number>;
  /** The look turned onto another player's body (its feet and `aimHeight` up); false when the page has no aim or no body. */
  aimAt(id: number, aimHeight: number): boolean;
  /** The match's audio's stats (`GameAudio.stats`: plays by event and by name, drops, the context's state). */
  audio(): AudioStats;
  /** ACT-1 (research 250 s1): what the HUD draws and its model (`Hud.state`: the compass's objective marks among it). */
  hud(): HudView;
  /** PAR-48c: a test instrument, no game behaviour -- whether the match's renderer has come (the spec waits on the picture first). */
  drawing(): boolean;
  /** TAUNTS (`./matchTaunts`): the Chat menu, the five, the taunts heard. */
  taunts(): TauntsState;
  // ACT-4 (ruling ACT.R4, research 250 s5): the reads the menu-path specs take, each `./hook`'s `ViewerHook` line (`/testroom`'s).
  feet: ViewerHook['feet'];
  setCamera: ViewerHook['setCamera'];
  pose: ViewerHook['pose'];
  floorUnder: ViewerHook['floorUnder'];
  doors: ViewerHook['doors'];
  traversal: ViewerHook['traversal'];
  worldStates: ViewerHook['worldStates'];
  worldActive: ViewerHook['worldActive'];
  /** PB-9b: `/testroom`'s `basePulse()` (`WorldState.basePulse`): the bases' pulse, a development read. */
  basePulse: ViewerHook['basePulse'];
  /** PAR-1: `/testroom`'s `weaponSelect()` less its touch button (`./matchExchange` `state`). */
  weaponSelect(): ExchangeState;
  /** PAR-2: `/testroom`'s `armory()` (`./matchArmory` `state`): its data in, open, its screen, cursor, kits, preview. */
  armory: ViewerHook['armory'];
  /** PAR-2: `/testroom`'s `openArmory()`: opens it as a seat's join does; whether it opened. */
  openArmory: ViewerHook['openArmory'];
  /** `/testroom`'s `weaponSelect().gate.alive` (`NetPage.gate`): a player, alive, not a ghost; no match, true. */
  alive(): boolean;
  /** `/testroom`'s `net().waiting` (`NetPage.waitingRoom`): a player in a room no round has started in; no match, true. */
  waiting(): boolean;
  /** B138's instrument: every term of the page's respawn ready (`NetPage.respawnTerms`); null with no match. */
  respawnTerms(): Record<string, unknown> | null;
  /** TACTICAL ORDERS and MESSAGES (`./matchChat`): the five messages, the communications heard. */
  chat(): ChatState;
  /** SVC-20b-page (`./voice/voiceClient`): the frames sent and heard, the speaker, the floor's holder, the tone, the headset. */
  voice(): VoiceState;
  /** MATCH-01 / MATCH-02 (`./startMenu`): the START menu and its confirm, the labels as drawn -- a test aid, read only. */
  startMenu(): StartMenuState & { labels: string[] };
  settings(): ReturnType<NativeSettings['state']> | null;
  /** GM-09: the Settings overlay's frame as its canvas shows it (`NativeSettings.readFrame`), null while closed -- a test aid. */
  settingsFrame(): ReturnType<NativeSettings['readFrame']>;
  /** OPTIONS (research 302 §4): what the match applies of the stored options this frame. */
  options(): PlayOptions & { pitchInverted: boolean; bob: boolean };
  /** PB.R2's goldens: `./main`'s `ownBody()` -- the own body as drawn (`./play` `ownBodyRead`), a development instrument. */
  ownBody: ViewerHook['ownBody'];
  // ACT-2 (research 215 s7, 250 s3): `./main`'s two turret reads (`./turretHook`), the MP51 spec's.
  turrets: NonNullable<ViewerHook['turrets']>;
  turretParts: NonNullable<ViewerHook['turretParts']>;
  /** LATER 568's probe: the region gate's state and each body's drawing (`ZoneGateProbe`; a browser adaptation, read only). */
  zoneGate(): ZoneGateProbe;
  /**
   * CPS H9 (product track, a dev instrument; `./renderStats`, PRF-4): the match's renderer's `renderer.info` counts as
   * `/testroom`'s `renderStats()` reads its own -- one renderer, `match` (the world, the HUD and the armory preview all
   * draw on it); null until the renderer has come. Only under the dev panel's gate (a development build with
   * `?devmode`), absent otherwise and from every `vite build` (`test/renderStats.test.ts`, `test/matchMount.test.ts`).
   */
  renderStats?(): RenderStats | null;
  /**
   * CPS H9 (product track, a dev instrument; `./charShadow` `CharacterShadow.stats`): the own shadow's full draws and idle
   * skips since the mount, monotonic. CPS H9, 2026-11-03T01:58Z: calls 0 between frames; charShadow 0.15% with the skip
   * in (the seat walking and firing). Under the same gate as `renderStats`, absent otherwise and from every `vite build`.
   */
  shadowStats?(): { drawn: number; skipped: number };
  /**
   * CPS cell-alive (product track, a dev instrument), 2026-11-03: the seat's state for the live perf cell -- `alive` a
   * player walking and not dead (`./hostages`' `self` reading, its spectator excluded), `dead` (`walk.isDead()`),
   * `spectator` (no client yet, or its role not `player`) and the walk's mode. Window 2 (07:34-08:03Z): the seat dead or
   * spectating most of the window in several runs. Under the same gate as `renderStats`, absent otherwise and from every
   * `vite build`.
   */
  seatState?(): { alive: boolean; dead: boolean; spectator: boolean; mode: string };
  /**
   * CPS GPU time (product track, a dev-only instrument; `./gpuStats`): the last resolved frame's GPU ms (its render
   * passes', its compute passes') from three's timestamp queries, null until one resolves or when the adapter has no
   * timer (WebGPU without `timestamp-query`, WebGL2 without `EXT_disjoint_timer_query_webgl2`) or the page did not ask
   * (`&gputime`). Under the same gate as `renderStats`, absent otherwise and from every `vite build`.
   */
  gpuStats?(): GpuStats | null;
}

/** The play clips the match asks of the worker: `./main`'s list (its `askPlay`; ACT-2: the turret anim set's, MAP-10b). */
const MATCH_CLIPS = [...PLAY_CLIPS, ...WEAPON_CLIPS, ...TRAVERSAL_CLIPS, ...THROW_CLIPS, ...DEATH_CLIPS, ...FLINCH_CLIPS, ...DOOR_CLIPS, ...BINOCULAR_CLIPS, ...TURRET_CLIPS];

/** The map's stem, as the room names it (`RUN/MP2.ZDB` -> `MP2`). */
function stemOf(path: string): string { return path.replace(/^.*\//, '').replace(/\.ZDB$/i, '').toUpperCase(); }

/** `./renderer`'s renderer (WebGPU, else WebGL2) over a canvas, loaded with the match (the mount's and the loader's default). */
/**
 * The match's renderer. CPS GPU time (a dev-only instrument, `./gpuStats`): three's timestamps asked only in a development
 * build under the dev tools switch and `&gputime`, on the canvas's own window's query.
 */
const pageRenderer = (c: HTMLCanvasElement): Promise<MatchRenderer> => {
  const win: { location?: { readonly search: string } } = c.ownerDocument.defaultView ?? {};
  return import('./renderer').then((r) => r.createRenderer(c, { trackTimestamp: import.meta.env.DEV && gpuTimeAsked(win.location?.search ?? '') }));
};
/** The match's own canvas's placement (the design system owns colour and type): over the whole window. */
function placeMatchCanvas(canvas: HTMLCanvasElement): void {
  canvas.style.position = 'fixed';
  canvas.style.inset = '0';
  canvas.style.left = 'var(--tw-l, 0px)';
  canvas.style.top = 'var(--tw-t, 0px)';
  canvas.style.width = 'calc(100vw - var(--tw-l, 0px) - var(--tw-r, 0px))';
  canvas.style.height = 'var(--mobile-picture-height, calc(100dvh - var(--tw-t, 0px) - var(--tw-b, 0px)))';
  canvas.style.zIndex = '1000';
}
/**
 * Mounts the match into `target` (an element it appends its canvas to, or the canvas itself) on the lobby's client.
 * Nothing is read from the document but `target`'s own: every element the match needs it makes or is given.
 */
/** The game's own projection, framebuffer-wide, when a map names none (`./main`'s `PS2_ASPECT`). */
const PS2_ASPECT = Math.tan(0.6109) / Math.tan(0.4276);
/** The match's lighting from the mount's options (FG-24): `DEFAULT_LIGHTING`, with `brighten` when a caller names one. */
export const matchLighting = (brighten: number | undefined): Lighting => ({ ...DEFAULT_LIGHTING, ...(brighten === undefined ? {} : { brighten }) });

export function mountMatch(target: HTMLElement, o: MatchMountOptions): MountedMatch {
  return prepareMount(target, o).attach(target, o);   // IP3: the mount's two stages, the second at once
}

/**
 * IP3 (`LOAD_REPORT_AT_PREPARED_READING`; `./lobbyPrepare` `LOBBY_PREPARE_ADAPTATION`, 5d's design, 2026-11-02): the mount's
 * stage 1 -- the match's construction, `place`, the renderer, `applyPicture` and the three warms (`warmThrows`,
 * `warmEffects`, `warmShadow`), its frames drawn until its own BLACK-GAP gate holds -- stopped before `join()`.
 * `mountMatch` runs both stages at once; `MatchLoader.prepare` runs this one ahead of the hand-off (on a hidden canvas)
 * and its `mount` the second (`PreparedMount.attach`), so the prepare is the mount's own path, not a sibling of it.
 * Before attach nothing of it reaches the player or the room: no sound data or loops (its audio plays nothing without
 * them), no input bound (the keys, the mouse, the pad, the touch layer), no client heard and no `NetPage`, no HUD shown
 * (the hold stands: `blocked`; no spawn) and its canvas hidden; its frames stop once the gate holds.
 */
export function prepareMount(target: HTMLElement, first: MatchStageOne): PreparedMount {
  /**
   * IP3: the mount's options -- stage 1's from the start, the hand-off's added at attach (one object, so a part made here
   * reads the hand-off's at its call). Until attach the hold stands (`blocked`), as `LobbyMatch.blocked` holds a mount
   * until its round runs.
   */
  const o: MatchStageOne & Partial<MatchAttachOptions> = { ...first, blocked: () => true };
  const doc = target.ownerDocument;
  const win = o.win ?? (doc.defaultView as unknown as MatchWindow);
  /** IP3: the hand-off's attach has run (`attach`): the hand-off's parts are in, the input bound, the client heard. */
  let attached = false;
  const own = target.tagName !== 'CANVAS';
  const canvas = own ? doc.createElement('canvas') : target as HTMLCanvasElement;
  frameCanvas(canvas);   // OPT-11 (research 358): the page's BRIGHTNESS on the match's picture
  canvas.classList.add(MATCH_CANVAS_CLASS);   // OT.R79 / SCREEN POSITION: the match's canvas, found by its class (`./picture`)
  if (own) {
    // Placement only, as the front end's own canvas (the design system owns colour and type): over the whole window.
    placeMatchCanvas(canvas);
    target.append(canvas);
  }
  if (first.hidden) canvas.style.visibility = 'hidden';   // IP3: a prepare's, laid out as shown, not over the menus

  // IP3: the hand-off's parts -- made at attach (`attachTo`: they adopt the lobby's talk input, read the hand-off's options
  // at their making, or bind the input and build the touch layer) and used here from then; nothing reaches them before.
  let normalInput: ForgePlayPort | undefined;
  let taunts!: MatchTaunts;
  let startMenu!: StartMenu;
  let voice!: MatchVoice;
  let touch!: MatchTouch;
  let keepClear!: ReturnType<typeof keepClearWatch>;
  let touchTaps!: AbortController;
  let offTip: () => void = () => {};
  let playOptions!: MatchOptions;
  let lanes!: LaneParts;
  let typed: ReturnType<typeof mountRoundTextLine> | null = null;
  let offHeard: () => void = () => {};
  const adopt = (p: { normalInput: ForgePlayPort | undefined; taunts: MatchTaunts; startMenu: StartMenu; voice: MatchVoice; touch: MatchTouch; keepClear: ReturnType<typeof keepClearWatch>; touchTaps: AbortController; offTip: () => void; playOptions: MatchOptions; lanes: LaneParts; typed: ReturnType<typeof mountRoundTextLine> | null }): void => {
    ({ normalInput, taunts, startMenu, voice, touch, keepClear, touchTaps, offTip, playOptions, lanes, typed } = p);
  };

  const scene = new Scene();
  freezeSceneMatrix(scene);   // CPS H13: composed once, auto-update off (`./sceneMatrix`; the walk's forced multiplies)
  const forgeLighting = o.forgeLighting ? createForgeLighting() : null;
  const fly = new FlyCamera(canvas, { onFire: (down) => firearm.trigger(down) });   // `./main`'s `onFire: trigger`
  fly.setInputSuspended(true);                          // IP3: no input before attach (each frame's `padFrame` from then)
  const walk = new WalkMode(fly);
  // ACT-1 (research 250 s1): `./main`'s traversal (research 86, `./traversalPage`) -- the ladder, the climb, the peek and the
  // water on the walk; the slide's loop and landing on the match's audio (`sound`, read at a call). No `bindKeys` or
  // `keysOpen`: the keyboard's X, Q and E are `/testroom`'s (OT.R29).
  const traversal = new TraversalPage(walk, {
    slide: (at) => { sound.ladderSlide(at); },   // PAR-89 (research 305 s3): `./main`'s -- the slide's loop; OBF-7: let go under the round screens
    land: (speed, at) => { sound.ladderLand(speed, at); },
  });
  const hud = new Hud();
  const scoreboardKeys = new ScoreboardKeys(() => walk.mode() === 'walk' && !armory.isOpen());   // PAR-2: `./main`'s gate
  // The others' footfalls (`./matchSound`), and since PAR-8 their footprints (`./matchEffects`, research 257 s1).
  const remote = new RemotePlayers(scene, (id, step, feet, yaw) => { matchEffects.footfall(id, step, feet, yaw); });
  /** LATER 415: the camera's region masks and the bodies' zones, for the teammates' tags (`./regionCull`). */
  const regionCull = new RegionCull();
  // ACT-1: `./main`'s doors (`./doorPage`, research 92): the room's swings followed off the lobby's client, the leaf drawn by
  // the view and heard on the match's audio; the action on the door under the reticle asked of the room.
  const doors = new DoorPage({
    grid: () => walk.grid(),
    feet: () => walk.feet(),
    aim: () => walk.fireAim(),
    sound: (name, at, volume) => { sound.audio.play(name, at, 'play', volume); },   // the command's flag-0x10 volume
    move: (path, delta) => { view?.moveNode(path, delta); },
    net: () => (net && net.client.state === 'open' ? net.client : null),
    press: () => traversal.actionPress(),          // LATER 362: the action button's chased press, the kick's pick
    // DOORS (research 92 section 2): `./main`'s own-press clip, line for line, on the mount's clips.
    pushClip: (type) => {
      const clip = openDoorClip(type, firearm.item() === 'pistol');   // LATER 362b F4: the kick's pistol pair
      if (!clip) return;
      const at = performance.now();
      walk.setFlinchPose(() => flinchPose(clip, (performance.now() - at) / 1000, remote.playClips()), pushedWindowOf(walk.nextCommand(), clip, remote.playClips()), { reloadGate: false, pushed: true });
    },
  });
  // MAP-07: `./main`'s gates (`./gatePage`). The lever is the switch's action; the slide is the room's, drawn here.
  const gates = new GatePage({
    move: (path, delta) => { view?.moveNode(path, delta); },
    net: () => (net && net.client.state === 'open' ? net.client : null),
  });
  /** Chain Reaction's hooks (`./cranePage`, research 176 §9): `./main`'s, on the lobby's client. */
  const cranes = new CranePage({
    move: (path, delta) => { view?.moveNode(path, delta); },
    spin: (path, angle) => { view?.spinLocalX(path, angle); },
    active: (path, on) => { view?.setNodeActive(path, on); },
    net: () => (net && net.client.state === 'open' ? net.client : null),
    // The presentation run tests crane_vN and writes nothing (PF.R26). The snapshot's valve is what it should see.
    valve: (name, v) => { world?.world.setValve(name, v); },
  });
  /**
   * ACT-5 (ruling ACT.R5; research 239 s7.1, 250 s6): the hostages' part, `./main`'s `const hostages = new HostagePage({`
   * line for line (HX-4a) -- the mount's `map` where `./main` reads `loaded`. Unreachable from the lobby until Desert
   * Glory is listed (ruling ACT.R6): the lobby's maps have no hostages, so it offers nothing there.
   */
  const hostages = new HostagePage({
    self: () => {
      const c = net?.client, feet = walk.feet();
      return c && feet ? { id: c.id, alive: walk.mode() === 'walk' && !walk.isDead(), spectator: c.role !== 'player', side: c.team ?? 'seal', feet } : null;
    },
    hostages: () => net?.hostages().values() ?? [],
    feet: (id) => remote.feet(id),
    aim: () => walk.fireAim(),
    bodies: (eye, dir, reach) => remote.aimBodies(eye, dir, reach),
    surfaces: (eye, far) => { const g = walk.grid(); return g ? pickSurfaces(g, eye, far, map?.grenade?.defaultMaterial ?? '') : []; },
    cellOf: (feet) => { const sub = map?.ai?.maps[0]; return sub ? aiCellOf(sub, feet[0]!, feet[2]!) : null; },
    order: (id, cmd) => net?.hostageOrder(id, cmd) ?? false,
  });
  const play = new Play();
  const loadouts = new PlayerLoadout();
  const lighting: Lighting = matchLighting(o.brighten);
  const fog: FogSettings = { enabled: true, ...fogForExtent(1200), color: [...ELF_DEFAULT_FOGCOL], altitude: null };
  let map: LoadedMap | null = null;
  let view: WorldView | null = null;
  /**
   * PAR-4 (research 234 s5, s6; `./main`'s PF-34 line): the room's dropped weapons and bundles on the page -- the world
   * drops' part, its models the held weapons' (`WorldView.held`) off the map's kit table.
   */
  const drops = new WorldDrops(dropModels(scene, () => loadouts.tables(), (m) => view?.held(m)?.clone() ?? null, () => pickupKitOf(loadouts.loadout(), loadouts.tables(), (s) => firearm.heldRounds()[s]?.rounds ?? 0, throws.grenade.stats().leftByItem, throws.grenade.stats().equipmentSlots), (item) => { const h = heldOfItem(item); if (h) play.dropHeld(h); }));   // NU-5 L1: the kit for the launcher's offer; OBF-15: the own death's drop off the own body
  /** MATCH-GAPS: the page's world (`./matchWorld`, /testroom's `pageWorld`): C4's targets, the scene programs, the room's followed. */
  let world: PageWorld | null = null;
  let clips: PlayClips | null = null;
  let net: NetPage | null = null;
  /**
   * PAR-94 B2 (research 322 §4.1 B2, D2): the room has spawned this page's seat this match -- its own `spawn` heard
   * (`NetPage`'s `case 'spawn'` -> the deps' `respawned`, the hand-off's replayed events included). Until then the frame
   * draws neither the HUD nor the reticle: the original's HUD update runs only under the camera's actor (`FUN_001f7ff0`
   * D:L56631), and the default kit `place` hangs is no kit the room gave. A death keeps it (today's HUD for the dead).
   */
  let spawned = false;
  let renderer: MatchRenderer | null = null;
  let endedDialog: number | null = null;
  let gone = false;
  let frameId = 0;
  // The events the client brings between the mount and the match's `NetPage` (the world's build): replayed after the
  // lobby's, so none is lost -- LobbyMatch keeps no more once the match has begun. IP3: heard from the attach, the
  // hand-off's client's (`attachTo`); a prepared match has heard no client before it.
  const pending: ServerEvent[] = [];
  let hear: (() => void) | null = null;

  // The client's own team while the `NetPage` is still being made: its constructor replays the lobby's events (a
  // Terrorist seat's spawn among them) before `net` is set (the ONL-18c review's F1). IP3: before attach, stage 1's side
  // source (`MatchStageOne.side`: the game lobby's own client's team).
  const side = (): Side => matchSide(net, o.client ?? { team: o.side?.() ?? null });
  const ownBody = new OwnBody<BodyView>({
    build: (b) => buildBody(b, map!, lighting),
    // WEBGPU-BLACK (2026-11-05): the held weapons off the old view before it goes (`Play.setWeapon(null)` detaches them), as
    // `./remotePlayers` `remove` does; `follow`'s `hang` and a new map's own hang put them on the new view.
    dispose: (v) => { play.setWeapon(null, []); play.setSidearm(null, []); scene.remove(v.group); v.dispose(); },
    attach: (v, b) => { if (v) scene.add(v.group); play.setBody(v, b); warmShadow(); },   // PAR-6: a new body's shadow programs
    hang: () => firearm.hangKit(true),             // `./main`'s `ownBody.hang`: `hangKit(true)`
  });
  const followTeam = (team: Team | null = side()): void => { if (map) ownBody.follow(bodyForTeam(map, team, loadouts.bodyType(team ?? 'seal'))); };
  // MATCH-SOUND (research 222 §7): the sound -- `/testroom`'s (`./matchSound`), on the match's own GameAudio.
  const sound = mountSound({
    audio: o.audio?.game ?? new GameAudio(silentOut(), undefined, { inline: false }), walk, fly, loadouts, side,
    seat: () => net?.client ?? null, hud, nameOf: (id) => net?.displayNameOf(id) ?? null, others: () => remote,   // research 304, NU-7 W1: a teammate's grenade warning and its line
    screenUp: () => net?.screenUp() ?? false,   // OBF-7: the page's own body not heard under the round screens (ROUND_SCREENS_SILENCE_WALK_READING)
  });
  play.onEvent(sound.playEvent);                       // the body's footfalls, clip callbacks and landings, heard
  /** The fog on the scene and behind it (`./matchCore` `liftFog`): with the goggles on, the camera's colour times the lens's. */
  let fogLens: readonly number[] | null = null;
  const refreshFog = (): void => {
    if (o.forgeLighting) liftForgeFog(scene, fog, lighting, fogLens, (rgb) => renderer?.setClearColor(rgb), o.forgeLighting.timeOfDay);
    else liftFog(scene, fog, lighting, fogLens, (rgb) => renderer?.setClearColor(rgb));
  };
  // MATCH-THROW (research 222 §8): the throwables, the launcher and the R2 inventory -- `/testroom`'s (`./matchThrow`),
  // its sounds on the match's audio, its effects the firearm's (read at a call). MATCH-GAPS (research 222 §9): the
  // claymore's refusal on the HUD's message window as the original posts it (`./matchMessages`: 0x65f880, colour 2), and
  // the page's world, whose destructibles are C4's targets (`./matchWorld`: /testroom's `pageWorld`, built at `place`).
  const throws = mountThrowables({
    scene, walk, fly, play, loadouts, view: () => view, map: () => map, net: () => net, firearm: () => firearm,
    audio: sound.audio, refuse: refusalLine(hud), world: () => world?.world ?? null,
    warning: (r) => { sound.grenadeWarning(r); },     // research 304: a teammate's spoken warning
    remoteKit: (owner) => remote.playerKit(owner),     // M203-FIRE-SOUND: another's launch report from its kit (research 94 §C4.5)
  });
  // `./main`'s open: no stance block runs while the R2 inventory is open (`InventoryMenu.onOpened`, `WalkMode.holdForMenu`).
  throws.inventory.onOpened(() => { stanceButton.reset(); walk.holdForMenu(true); });
  // ONL-18d: the firearm -- the one `/testroom` mounts too (`./matchFirearm`, ONE-WIRE), with the throwables' hands
  // (MATCH-THROW) and, since ACT-1, the action part's turret first (`./main`'s hands, read at a call); its sound
  // `/testroom`'s (MATCH-SOUND).
  const firearm: MatchFirearm = mountFirearm({
    scene, fly, walk, play, remote, hud, loadouts, view: () => view, map: () => map, body: () => ownBody.view(), net: () => net,
    blocked: () => (o.blocked?.() ?? false) || armory.isOpen() || exchange.isOpen() || taunts.isOpen(), refreshFog: (lens) => { fogLens = lens; refreshFog(); }, sound: sound.firearm,
    hands: throws.hands(actionHands(() => acts)),   // PAR-55: the action part's, asked at each call (made after the firearm)
    mountedMuzzle: (id) => acts.turrets.muzzleOf(id),   // ACT-2: `./main`'s MAP-10b -- a mounted body's rounds leave the turret's firepoint
    vibration: () => attached && startMenu.values().vibration,   // CTL-2: VIBRATION (DAT_00650698) as the START menu and the card leave it
    menuOpen: () => attached && startMenu.isOpen(),   // CTL-2 (the review's F2): FUN_00204a40 stops the motors and the pulse; IP3: no menu before attach
  });
  // PAR-8 (research 257 s1): `./main`'s shared effects -- the footprints on sand and snow beside the steps, own and others'.
  const matchEffects = mountEffects({ effects: firearm.effects, walk, sound });
  play.onEvent(matchEffects.playEvent);
  traversal.setEffects(firearm.effects);             // PAR-10 (research 257 s3, 250 s9): `./main`'s -- the water's splash and ripples
  // ACT-1 (ruling ACT.R1, research 250 s1): sprint 27's action part (`./matchActions`, ONE-WIRE) -- `./main`'s `mountActions`
  // call with what this page lends it: the doors, the traversal, the throwables' C4, the others' bodies, and the bomb
  // drawn through the match's cues, HUD, bodies, effects and the throwables' world bomb (bomb-floor's Satchel). `drops`
  // since PAR-4 (H120): the world drops' weapon ahead of the feet, the pickup context's; `hostages` is ACT-5's (ruling
  // ACT.R5); the `turret` block ACT-2's (research 250 s3).
  const acts = mountActions({
    walk, fly, doors, traversal, grenade: throws.grenade, remote, play, firearm,   // research 303: the dance's body, its trigger and reload
    net: () => net, map: () => map, view: () => view, world: () => world?.world ?? null,
    craneToggle: (valve) => cranes.toggleLocal(valve),
    gatePress: (action, seq) => gates.press(action, seq), cranePress: (valve, seq) => cranes.press(valve, seq),   // P8
    bombView: {
      roundAudio: sound.roundAudio, hud, remotePlayers: remote, effects: firearm.effects, worldBomb: throws.grenade.worldBomb(),
      ownBody: ownBombBody(play, throws.throwPose, walk, () => firearm.item() === 'pistol'),   // PB-1: `./main`'s, the own body
      sound: bombSound(sound.audio),                                                             // PB-1: the pickup's .FOOTBOMB
      pulse: worldPulse(() => world?.world ?? null),                                             // PB-9b: `./main`'s, the bases' pulse
    },
    win: win as unknown as EventTarget,
    drops: { ahead: () => drops.promptAt(walk.feet(), walk.snapshot()?.yaw ?? 0), candidates: () => drops.holdCandidatesAt(walk.feet(), walk.snapshot()?.yaw ?? 0), second: () => drops.promptAt(walk.feet(), walk.snapshot()?.yaw ?? 0, 2), item: (did) => drops.itemOf(did) },   // LkPaioX5 (c): the second TAKE and the names;   // PAR-34 group 7: `./main`'s   // PAR-4: `./main`'s PF-34 -- the weapon prompt's drop
    // ACT-2: `./main`'s MAP-10b (research 215 s7) -- the mount's sounds on the match's audio, the bodies' hands and the
    // clips their poses time (the lobby client's bodies, as `./main` reads its own client's); the own round drawn.
    turret: {
      sound: (name, at) => { sound.audio.play(name, at, 'play', 1); },
      bodyFeet: (id) => remote.feet(id), clips: () => remote.playClips(),
      hand: (id) => (id === net?.client.id ? walk.hand() : (net?.client.bodies().find((b) => b.id === id)?.slot === 1 ? 1 : 0)),
      round: (record, from, dir, frame, count) => firearm.turretRound(record, from, dir, frame, count),
    },
    hostages,                                        // HX-4a: the hostages' orders (research 239 s7)
  });
  walk.setMountPose(() => acts.turrets.ownPose());   // ACT-2: `./main`'s MAP-10b -- the turret anim set's clips on the bodies
  remote.setMountPose((id) => acts.turrets.turretPose(id));
  acts.turrets.setSpread(() => firearm.turretCone());   // TURRET-CONE P2: `./main`'s -- the rounds roll on the turret's cone
  // TAUNTS (research 301): the Chat menu's taunts -- `/testroom`'s (`./matchTaunts`), the five the session's (`taunts`);
  // its TACTICAL ORDERS and MESSAGES (research 302, `./matchChat`), the five messages the session's (`messages`).
  const chat = mountChat({
    net: () => net, hud, audio: sound.audio, messages: () => o.messages?.() ?? [], side, character: (s) => loadouts.type(s),
    voice: () => voice,   // MATCH-05 (note 227 §2.4): RADIO and TEAMMATES' rows through the voice client, mounted below
  });
  const matchAbort = new MatchAbort();
  // MATCH-01 (research 266 §8): the in-round START menu's rows' captions, the map's HudCLOC (the menu made at attach).
  let menuCaptions: Record<string, string> | null = null;
  // cq41E0VR (browser adaptations, product track; the controller 5d's call, logged for the owner): the START menu's
  // FULLSCREEN row on the shared helper (`./mobileFullscreen`) and its SHOW FPS readout (`./matchFps`, off by default, kept
  // on the page's settings path) on the frame time PAR-12 smooths (`adaptiveRatio`, below). A refused request (no user
  // activation, as from a pad; a frame without the permission) shows the menu's notice and changes nothing else.
  const docFullscreen = documentFullscreen(doc);
  const matchFullscreen = {
    active: () => docFullscreen.active(),
    toggle: (refused: () => void): void => { toggleFullscreen(docFullscreen, refused); },
  };
  // IP3: the readout is a page element (shown when SHOW FPS is on), so it is made at attach with the START menu it
  // belongs to (`attachTo`), as the touch layer is -- a prepare puts nothing on the page; null before.
  let fpsReadout: FpsReadout | null = null;
  // PAR-1 (research 253): WEAPON EXCHANGE and the dead's prompt -- `/testroom`'s (`./matchExchange`), on the lobby's
  // client and the map; the prompt's `%c` the pad's R2 (the match is played on a controller, OT.R29; the touch half is
  // PAR-5's).
  const exchange = mountExchange({
    net: () => net, map: () => map, side, loadouts, win, walking: () => walk.mode() === 'walk', device: () => promptDeviceOf(pads.count(), 'pad'),   // PAR-5: the pad, or a touch screen's INV
  });
  /**
   * PAR-2 (OT.R43): the seat ARMORY -- `/testroom`'s part (`./matchArmory`), mounted here but DORMANT (the PAR-2 review's
   * ruling, 2026-10-11): the original has no in-match ARMORY -- its ARMORY is the lobby's, before the launch (research 95
   * §4.1, 167 R167.1, 182 §4.5; `ARMORY_SEAT_READING`), which this page's lobby already shows (`./lobbyArmory`). So
   * `playing` is false: no hello of this page asks the room to hold a seat for it -- the lobby's does not, nor the one
   * `NetPage` sends when it reopens the socket after a drop -- and a seat it is told of anyway spawns at once (`ready`).
   * Its data is the lobby's ARMORY read (`o.armory`, PAR-3's one decode), its cues the match's audio, its lines the pad's
   * (OT.R29: no keyboard path); the round ends' decal and air clear is this page's `roundClear` (`./matchNet`). Its
   * development hook's `openArmory` is a playtest instrument that opens nothing while dormant.
   */
  const armoryPart = mountArmory({
    net: () => net, map: () => map, side, loadouts, answer: (kit) => { exchange.answer(kit); },
    playing: () => false, online: () => true, audio: { play: (name, at) => sound.audio.play(name, at), restart: (name) => sound.audio.restart(name) },
    device: () => 'pad',   // no `store`: dormant, it saves no loadout -- the lobby's ARMORY keeps the account's (matchChat's pin: no browser key)
    opened: () => { fly.setInputSuspended(true); },   // the game's input the screen's from this frame (`./main`'s)
    deadZone: () => fly.lookOptions().stick.deadZone,   // LATER 408: CONTROLLER OPTIONS' DEAD ZONE, the flick read through it
  });
  const { armory } = armoryPart;
  const voiceEl = new HudVoiceElement();   // MATCH-05: `./main`'s -- the HUD's voice element's state across frames (`./hudVoice`)
  // `./main`'s `setPlayMode`: `fire.bindKey()` (R, a development build's) -- through a target that drops every event
  // while the hold stands, as `./main`'s capture listener swallows every key under `loadingJoin.blocked` (main.ts:829;
  // the ONL-18d review's finding 1).
  const heldGate = new Map<EventListenerOrEventListenerObject, EventListener>();
  const gated = {
    addEventListener: (type: string, fn: EventListenerOrEventListenerObject) => {
      const call: EventListener = (e) => { if (o.blocked?.() ?? false) return; if (typeof fn === 'function') fn(e); else fn.handleEvent(e); };
      heldGate.set(fn, call);
      win.addEventListener(type, call);
    },
    removeEventListener: (type: string, fn: EventListenerOrEventListenerObject) => {
      const call = heldGate.get(fn);
      if (call) { win.removeEventListener(type, call); heldGate.delete(fn); }
    },
  };
  /** `./main`'s canvas `mousedown`: the right button steps the zoom round (a browser adaptation, the mouse). */
  const onMouseDown = (e: MouseEvent): void => { if (e.button === 2 && !armory.isOpen() && !(o.blocked?.() ?? false)) firearm.stepZoom('cycle'); };
  // PAR-6 (research 255 s1): the characters' shadow -- `/testroom`'s (`./charShadow` `mountCharShadow`): the map's vector at
  // `place`, the body's programs for the map warmed, its map drawn each frame before the world, freed at the teardown.
  const shadow = mountCharShadow();
  /** The body the shadow was warmed for (`./main`'s `warmWalk` shadow line): once a body and the renderer are in. */
  let shadowWarmed: BodyView | null = null;
  const warmShadow = (): void => {
    const r = renderer, v = ownBody.view();
    if (!r?.prepare || !v || shadowWarmed === v) return;
    shadowWarmed = v;
    void shadow.warm(v.group, scene, (objects, sc, camera, options) => r.prepare!(objects, sc, camera, options), () => gone || ownBody.view() !== v)
      .catch(() => { /* a stale warm-up is dropped */ });
  };
  /**
   * LATER 253: the map's effects -- and with them the scene -- compiled before the first shot and the first blast
   * (research 90 items 16 and 19, `./main`'s `warmEffects`): once a map and the renderer are in.
   */
  let effectsWarmedFor: LoadedMap | null = null;
  /** BLACK-GAP (`./loadingHold`): the map whose whole-scene warm (`warmEffects`: the renderer's compile jobs) has settled. */
  let sceneWarmedFor: LoadedMap | null = null;
  const warmEffects = (): void => {
    const r = renderer, m = map;
    if (!r?.warm || !m || effectsWarmedFor === m) return;
    effectsWarmedFor = m;
    const settled = (): void => { sceneWarmedFor = m; if (map === m) markLoad('warm-settled'); };   // IP3 (`./loadMarks`): the current map's   // BLACK-GAP (`./loadingHold`): the scene's compile jobs settled; a stale one too
    void warmMapEffects(firearm.effects, () => { fly.camera.updateMatrixWorld(); return r.warm!(scene, fly.camera); }).then(settled, settled);
  };
  /** The map the throwables were warmed for (research 90 #23, `/testroom`'s `warmWalk`): once a map, the renderer and the map in. */
  let warmedFor: LoadedMap | null = null;
  const warmThrows = (): void => {
    const r = renderer, m = map;
    if (!r?.prepare || !m || warmedFor === m) return;
    warmedFor = m;
    void throws.warm((objects) => r.prepare!(objects, scene, fly.camera, { stale: () => gone || map !== m })).catch(() => { /* a stale warm-up is dropped */ });
  };
  const fit = (): void => {
    if (!renderer) return;
    // CPS-4a (CPS.R7, a browser adaptation): the render scale's ceiling for the canvas's box (`./videoSettings`), met at
    // the ratio's next tick (`AdaptiveRatio.setCap`); the PS2 frame below draws its 640 x 448 whatever it is.
    const width = Math.max(1, canvas.clientWidth), height = Math.max(1, canvas.clientHeight);
    adaptiveRatio.setCap(renderCapFor(renderScale, globalThis.devicePixelRatio, wantsTouchControls(), width, height).ratioCap);
    if (picture === 'ps2') {
      // OT.R79's PS2 picture, `./main`'s (:1638-1642): the console's 640 x 448 frame, its projection from the map's own
      // half-angles, stretched onto the 4:3 box (`PICTURE_PS2_CLASS`).
      renderer.resize(PS2_FRAME.width, PS2_FRAME.height);
      fly.setAspect(map?.camera ? Math.tan(map.camera.hfov) / Math.tan(map.camera.vfov) : PS2_ASPECT);
      return;
    }
    renderer.resize(width, height);
    fly.setAspect(width / height);
  };
  // OT.R79 (LATER 378; `./picture`): VIDEO MODE's picture -- MODERN (the default: native, what the match drew before), PS2
  // (`./main`'s PS2: the frame, the HUD's, the canvas's 4:3 box), EXPERIMENTAL (Modern with the test room's experimental
  // renderer at its defaults) -- applied now, when the renderer comes, and at a change. The detail pass is on under all
  // three (the world's default; `./startupSettings` `resolveVisuals`, PF-30), so the picture leaves it alone. Its detail
  // distance (PF.R60, `./detailDistance`, a browser adaptation): 1 (the original) under PS2, else the page's one
  // stored factor (2 by default), heard while the match runs.
  let picture: VideoPicture = o.picture?.get() ?? VIDEO_PICTURE_DEFAULT;
  let hdPack: HdServedPack | null = null, hdLogged = '';
  const detailDistance = detailDistanceKeeper();
  const applyDetailDistance = (): void => { view?.setDetailDistance(detailDistanceFor(picture, detailDistance.get())); };
  const offDetailDistance = detailDistance.observe(() => { if (!gone) applyDetailDistance(); });
  // CPS-4a (CPS.R7, a browser adaptation; `./videoSettings`): the page's video settings, heard while the match runs -- the
  // render scale (`fit`'s cap), the Shadows switch (a player's switch over the shadows the port draws: the characters'
  // map, which the original casts while its shadows global `DAT_003df138` is on, and the world's drop-shadow decals; off,
  // the map cleared once and its frame line skipped; the global and its values unchanged) and SHOW FPS (the START
  // menu's readout, one key).
  const video = videoSettingsKeeper();
  const videoAtMount = video.get();
  let renderScale = videoAtMount.renderScale;
  let shadowsOn = videoAtMount.shadows;
  const offVideo = video.observe((v) => {
    if (gone) return;
    if (v.renderScale !== renderScale) { renderScale = v.renderScale; fit(); }
    if (v.shadows !== shadowsOn) { shadowsOn = v.shadows; view?.setShadows(shadowsOn); if (!shadowsOn) shadow.shadow.clear(); }
    if (fpsReadout && v.showFps !== fpsReadout.shown()) fpsReadout.toggle();   // IP3: the readout exists from the attach; made, it reads the stored setting
  });
  const applyPicture = (): void => {
    const ps2 = picture === 'ps2';
    applyDetailDistance();
    canvas.classList.toggle(PICTURE_PS2_CLASS, ps2);
    hud.setPresentation(ps2 ? 'ps2' : 'native');
    renderer?.setPresentation?.(ps2 ? 'ps2' : 'native');
    const experimental = pictureExperimentalSettings(picture);
    renderer?.setExperimental?.(experimental);
    // HD.R8: the HD pack under HD (GoE Soul). The texture registry collects from the first time the picture is chosen,
    // so a world built after it is known in full; one built before keeps its originals until the next map. The pack
    // is the one this browser imported, else the served one (fetched a texture at a time: MODERN and PS2 fetch nothing).
    // The status logged once a state (off, loading, the pack's name, a refusal), not once a texture.
    if (experimental.hdPack) { hdTextures.collect(); hdPack ??= new HdServedPack(undefined, (text) => { const k = text.replace(/\d+/g, '#'); if (k !== hdLogged) { hdLogged = k; console.info(`[hd] ${text}`); } }, undefined, pageHdStore()); }
    void hdPack?.setEnabled(experimental.hdPack);
    fit();
  };
  const offPicture = o.picture?.observe((p) => { if (!gone) { picture = p; applyPicture(); } }) ?? ((): void => {});
  applyPicture();
  // PAR-12 (research 255 s2): `./main`'s viewport and pixel ratio (`./matchViewport`) -- the window's resize, the phone
  // browser bar's and the rotation; the ratio capped for the device and traded for frames, not while the loading hold stands.
  const unwatchViewport = watchViewport(win, fit);
  const adaptiveRatio = new AdaptiveRatio(pixelRatioCap(globalThis.devicePixelRatio, wantsTouchControls()));

  /** IP3: the assets `place` put up -- its hand-off lines (`gameLines`, `soundLines`) run at attach when it came first. */
  let placed: MatchAssets | null = null;
  /** The HUD's game line and GAME DETAILS (the session's variables: the hand-off's), `place`'s -- at attach for a prepare. */
  const gameLines = (m: LoadedMap): void => {
    hud.setGame(m.name, o.gameMode ?? rankOf(m.name)?.mode ?? '');
    hud.setGameDetails(o.gameVars ? () => sessionGameDetails(o.gameVars!) : null);
  };
  /**
   * The map's sound in, `place`'s -- at attach for a prepare (IP3: nothing audible before it; the audio holds no bank, so
   * every play before is dropped unheard).
   */
  const soundLines = (a: MatchAssets): void => {
    sound.setData(a.sound?.data ?? null);              // `./main`'s worker answers: the map's banks, the round's cues, then the loops
    taunts.setData(a.sound?.data ?? null);             // TAUNTS: the vocals, the defaults, the captions (`./matchTaunts`)
    menuCaptions = a.sound?.data?.taunts?.captions ?? null;   // MATCH-01: the START menu's HudCLOC strings
    hud.setLocCaptions(menuCaptions);                  // LkPaioX5 (b): the action caption's HudCLOC strings (the bomb's)
    chat.setData(a.sound?.data ?? null);               // TACTICAL ORDERS and MESSAGES: the records, the defaults (`./matchChat`)
    if (a.sound) sound.setLoops(a.sound.loops);
  };
  /** The side the seat's own lines last put on (`seatLines`); null before a map. */
  let seated: Side | null = null;
  /**
   * MENU-SIDE: the seat's own lines -- its side's body and default kit until the room's spawn names the kit, never the
   * SEAL's for a Terrorist seat (`./main`'s `show` places a SEAL: /testroom's page has no seat before its welcome).
   * `place`'s, and IP3's side change before the launch (`reseat`, 5d's ruling (a)): one function, never a copy.
   */
  const seatLines = (m: LoadedMap, seat: Side): void => {
    seated = seat;
    ownBody.reset(bodyForTeam(m, seat));
    loadouts.spawn(seat, { network: true });
    firearm.hangKit(true);                             // `./main`'s `show`: `hangKit(true)`, then `spawnKit(side)`
    firearm.spawnKit(seat);
  };
  /**
   * IP3 (5d's ruling (a)): the side source changed while the match is prepared (SWITCH TEAMS in the game lobby): the seat's
   * own lines again for the new side, and only what they add compiled -- the new body's shadow programs (`warmShadow`, from
   * the body's `attach`) and the body with the kit it now holds (the held models hang under its group, `Play.setWeapon`):
   * `ViewerRenderer.prepare` on that one group, never the scene's whole `warm` again. Not both sides up front (5d). Nothing
   * before a map is placed (`place` reads the side then), nor once the `NetPage` seats the page (`followTeam`).
   */
  const reseat = (): void => {
    const m = map, seat = side();
    if (gone || !m || net || seat === seated) return;
    seatLines(m, seat);
    const r = renderer, v = ownBody.view();
    if (!r?.prepare || !v) return;
    void r.prepare([v.group], scene, fly.camera, { stale: () => gone || map !== m || ownBody.view() !== v }).catch(() => { /* a stale warm-up is dropped */ });
  };

  /** The world on the scene, as `./main`'s `show` puts a map up -- in one go, the loading screen already gone. */
  const place = (a: MatchAssets): void => {
    const m = a.map;
    map = m;
    placed = a;
    clips = a.clips;
    lighting.rig = m.lightRig;
    mapFog(fog, m);
    hud.setBitmaps(m.hud);
    hud.setNavPoints((m.tac?.points ?? []).filter((p) => p.kind === 1));
    if (attached) gameLines(m);
    const built = buildWorld(m);
    if (o.brighten !== undefined) built.setLighting(lighting);
    markLoad('world-built');                           // IP3 (`./loadMarks`): a measurement mark
    // FG-39 (the forge's day/night in Play): the world takes the caller's brighten. Its rig is the map's own, as
    // `buildWorld` starts it (`lighting.rig = m.lightRig` above), so this moves the brighten uniform and re-bakes nothing;
    // with no brighten named -- every match but the forge's -- the world is built and lit exactly as before.
    view = built;
    applyDetailDistance();                            // PF.R60: the picture's detail distance on the new world
    if (!shadowsOn) built.setShadows(false);           // CPS-4a: the player's Shadows off
    scene.add(built.group);
    if (o.extraWorld) scene.add(o.extraWorld);        // LATER 456: the Forge's content props, after the world (unset, none)
    firearm.clearMap(m);                              // the marks, the shade and the clip, the FOV, the view states (`./matchFirearm`)
    throws.setMap(built, m);                          // the throwables' models and bitmaps (`./matchThrow`)
    throws.setMarks(firearm.setWorld(built));         // the scorches take the marks' shade and clip
    firearm.setView(m);
    firearm.setEffects(a.effects ?? null);
    if (attached) soundLines(a);                       // IP3: a prepare's at its attach
    for (const add of [...built.revealWorld, ...built.revealProps]) { try { add(); } catch { /* one object's failure is not the world's */ } }
    const extent = built.box.min.distanceTo(built.box.max);
    fly.setClipPlanes(m.camera?.nearPlane ?? 4, Math.max(2000, extent * 1.6));
    if (!m.camera) { Object.assign(fog, fogForExtent(extent)); fog.altitude = null; }
    refreshFog();
    fly.setScale(m.metersPerUnit);
    // MENU-SIDE: the seat's side from the first frame (the lobby's client knows it: its welcome, or the game lobby's
    // view after a SWITCH TEAMS; IP3: before attach, stage 1's side source) -- `seatLines`, once the map's shadow vector and
    // its kit tables are in (IP3: moved ahead of the seat's lines, which both `place` and `reseat` run).
    const seat = side();
    shadow.setMap(m);                                  // PAR-6: `./main`'s `show` -- the map's ShadowVector
    loadouts.setMap(m.arsenal?.table ?? null, m.arsenal?.map ?? null);
    seatLines(m, seat);
    const shown = withVictoryClips(clips, m.victory);   // research 303: the map's dances on the bodies (the others' now)
    play.setClips(shown);
    traversal.setClips(shown);                         // ACT-1: `./main`'s -- the traversal's roots come from the clips
    remote.setClips(shown);
    setRemoteMap(remote, m, lighting, () => view);
    const stand = standOf(m, built);
    fly.lookFrom(stand.from, stand.to);
    // MAP-02 (`./matchWorld`, MATCH-GAPS): the page's world on the walk's hull and grid, drawn by the view, zAnim's
    // opening state -- /testroom's `pageWorld` lines; a program's sound on the match's audio, its effect the firearm's.
    // A world that will not build (a map's metadata it cannot take) is logged and left out: the match joins without one
    // and C4 finds no target, as before MATCH-GAPS (the review's finding 2).
    try {
      world = buildPageWorld(m, {
        setNodeActive: (path, on) => { view?.setNodeActive(path, on); },
        setNodeOpacity: (path, f) => { view?.setNodeOpacity(path, f); },   // PB-9b: `./main`'s, the bases' pulse
        sound: (name, at, volume) => { sound.sceneSound(name, at, volume); },   // OBF-31: none under the round screens
        effect: (name, at) => { firearm.effects.play(name, { position: at, normal: [0, 1, 0] }); },
        log: (line) => { console.info(line); },
      }, a.effects?.ambient ?? null);                  // LATER 409 F1: the effect runner's ambient, played by it alone
    } catch (e) {
      world = null;
      console.warn("the match's world would not build:", e instanceof Error ? e.message : String(e));
    }
    walk.setGround(m.ground, stand.feet, world?.grid ?? null);
    regionCull.reset();                               // LATER 415's review, F2: a new map, new nodes
    doors.setMap(m.doors, m.ground);                   // ACT-1: `./main`'s DOORS -- on the hull the walk stands on, shut as the disc has them
    gates.setMap(m.gates, m.ground, m.doors?.length ?? 0);   // MAP-07: `./main`'s gates -- the snapshot's tail, after the doors
    cranes.setMap(m.cranes, m.ground);                 // Chain Reaction: `./main`'s hooks, on that same hull
    walk.setMode('walk');                              // the match is played on foot; the room's spawn stands the mover
    warmThrows();
    warmEffects();                                     // LATER 253: the effects and the scene, as `./main`'s
  };


  // BLACK-GAP (`./loadingHold`): the assets settled -- a frame drawn from here on is the world's.
  let worldIn = false;
  let firstDrawn = false;
  let worldDraws = 0;                                  // frames rendered since the world was ready to draw (IP3: and attached)
  /** IP3: stage 1's gate -- the same frames counted from the mount, attached or not; told once (`MatchStageOne.prepared`). */
  let readyDraws = 0;
  let readyTold = false;
  const tellReady = (ok: boolean): void => { if (!readyTold) { readyTold = true; first.prepared?.(ok); } };
  /** IP3: `join()`, the hand-off's (made at attach); before attach the assets' settle waits for it there. */
  let joinNow: (() => void) | null = null;
  o.assets.then((a) => {
    if (gone) return;
    // A map the Forge composed (`./forge/playObjectives` names its escort zones on it): its escort's fallback lines on.
    if (a) sound.roundAudio.round.forgeEscortLines = Array.isArray((a.map as { forgeEscortZones?: unknown }).forgeEscortZones);
    if (a) place(a);
    worldIn = true;
    joinNow?.();
  }, () => { if (!gone) { worldIn = true; joinNow?.(); } });
  (o.renderer ?? pageRenderer)(canvas).then((r) => {
    if (gone) { r.renderer.dispose?.(); return; }
    renderer = r;
    markLoad('renderer');                              // IP3 (`./loadMarks`)
    refreshFog();
    applyPicture();                                    // OT.R79: the picture's presentation, then the fit
    const ratio = ratioTargetOf(r);
    if (ratio) adaptiveRatio.start(ratio);             // PAR-12: `./main`'s `created.setPixelRatio(RATIO_CAP)`
    warmThrows();
    warmEffects();                                     // LATER 253: the effects and the scene, as `./main`'s
    warmShadow();                                      // PAR-6: the body's shadow programs, once the renderer is in
  }, (e: unknown) => { console.warn('the match would not draw:', e instanceof Error ? e.message : String(e)); tellReady(false); });

  // ---- the pad (`./main`'s `padFrame`, its game lanes; controller only, OT.R29) ----
  const gamePad = new GamePad({ waitForRest: false, pressClock: () => performance.now() });   // MOVE-S6: the stance press on the game frame
  // ACT-3 (research 214 s4, 250 s4): `./main`'s `pads` (main.ts:1101-1114) for its XR-06 cancel -- a Cross held on a lost pad
  // is a cancel, never the release its vanished lanes would read as. Told the same `nav` as `gamePad`, polled first; no
  // toasts (the front end's pad rows are the setup page's). Its window listeners let go at the teardown (`padsOn`).
  const pads = new PadWatch({ connected: () => {}, disconnected: () => {}, cancel: () => { acts.cancel('padLost'); } });   // MP-1: the touch layer's hiding is the frame's (`readsPad`)
  const padsOn: [string, EventListener][] = [];
  const stanceButton = new StanceButton();
  let padMerged: Input = noInput();
  /** What the game's lanes read last frame: the merged input less the lanes the R2 inventory holds (`./main`'s `padGame`). */
  let padGame: Input = noInput();
  let flushed = false;
  /** ACT-3: the menu over the game last frame (the R2 inventory, the Chat menu), for the cancel on its opening (`./main`'s `menuOver`). */
  let menuOver: CancelCause | null = null;
  /** The human's own pad and touch lanes last frame, so the agent's release never lets go of what a person holds. */
  let humanHeld = { fire: false, stance: false };
  const padFrame = (dt: number, now: number): void => {
    if (!attached) return;                             // IP3: no input before attach (the camera held since the mount)
    if (o.settings?.isOpen() && net?.client.state !== 'open') o.settings.interrupt();
    const nav = win.navigator;
    const held = o.blocked?.() ?? false;
    // LATER 426: the five gating flags each frame; the rest only when the agent's driver reads them (an `observe` step, a
    // status read), at most once a frame -- never on a frame with no agent work (the solo room's `3bf6baa88`, the same audit).
    const gateFlags = normalInput && {
      local: (net?.client ?? o.client!).url === 'loopback:', visible: doc.visibilityState !== 'hidden',
      ready: !gone && !held && !!map && !!net && net.client.state === 'open',
      menu: armory.isOpen() || startMenu.isOpen() || taunts.isOpen() || exchange.isOpen() || throws.inventory.isOpen(),
      armory: armory.isOpen(),
    };
    const agent = normalInput && gateFlags ? normalInput.frame(dt, {
      ...gateFlags,
      read: () => ({
        ...gateFlags, map: map ? { archive: map.archive, path: map.path, name: map.name } : null,
        pose: fly.pose(), feet: walk.feet(),
        equipment: { kit: firearm.kit.state(), weapon: firearm.fire.state(), slots: loadouts.loadout(), armory: armoryPart.state() },
        action: { playerMode: walk.mode(), playing: true, dead: walk.isDead(), locked: walk.isLocked(),
          held: acts.wiring.lifecycle.down(), prompt: acts.bomb.prompt(), holdProgress: acts.bomb.holdProgress(), traversal: traversal.stats() },   // read-only: action() PRESSES
        plant: acts.bomb.state(),
      }),
    }) : noInput();
    // Held (`./main`'s `padFrame` under `loadingJoin.blocked`): no input reaches the camera, and the pad is flushed each
    // frame -- the edges taken against the pad as it is (research 116 R116.13, `./padFlush`), so a button held through
    // the hold is held, not pressed, at its release, and a stick is live at once.
    fly.setInputSuspended(held || taunts.isOpen() || exchange.isOpen() || armory.isOpen() || startMenu.isOpen());   // and while a menu holds the pad (`./main`'s `menu`; the START menu's: +0x5e1 bit 7, D:L61999-62000)
    if (held) { throws.inventory.close(); firearm.held(); touch.release(); }   // `./main`'s `padFrame` under the hold: the menu closed, `fire.release()`, `releaseTouch()`
    if (held && acts.wiring.lifecycle.down()) acts.cancel('loading');   // ACT-3: `./main`'s (main.ts:1181) -- a Cross held into the hold let go once
    if (held) voice.pad(false);                        // SVC-20b-page (the review's F4): no talk under the hold
    if (!nav) return;
    pads.poll(nav);                                    // ACT-3: `./main`'s `pads.poll` (main.ts:1184) -- a pad gone cancels the hold
    const polled = gamePad.poll(nav);
    touch.padConnected(readsPad(gamePad));            // MP-1 (FI.R4): hidden, on its root, while the pad read is a connected one
    if (normalInput) { const own = padInput(polled); humanHeld = { fire: own.fire || touch.input.fire, stance: own.stance || touch.input.stance }; }
    const pad = normalInput ? mergeInput(padInput(polled), agent) : padInput(polled);
    if (gamePad.crouch) pad.crouch = true;
    if (gamePad.prone) pad.prone = true;              // PP-5 (OT.R67): the pad profile's Prone bind
    walk.setStanceMode(controllerStanceMode());       // OT.R67: the browser's stance mode (the prone-pop by default)
    playOptions.apply(fly, pad);                       // OPTIONS (research 302 §4; `./matchOptions`): the stored pitch, bob and fire-rate swap
    // h59U9CLb (a browser adaptation, off by default; nothing stored, `pad` as it was): the profile's extra binds ORed in
    // after the FIRE RATE swap, so they target actions (`./padExtras`), never while the hold or a menu holds the pad.
    const padMenu = held || armory.isOpen() || startMenu.isOpen() || taunts.isOpen() || exchange.isOpen() || throws.inventory.isOpen();
    Object.assign(pad, gamePad.extras(pad, padMenu));
    if (held || !flushed) {
      exchange.hold(new Set([...padButtonsDown(polled), ...padButtonsDown(touch.pad)]));   // `./main`'s: WEAPON EXCHANGE's edges against the pad as it is; MP-1 F2: the touch pad's too
      armoryPart.stick(polled, new Set(), false);    // AM-2's review F1: the stick armed through the hold, as the buttons' edges are -- no flick at the release
      ({ merged: padMerged, game: padGame } = flushedPad(touch.input, pad));
      // `./main`'s: a button a screen took before the hold is still owned -- the baseline holds it as released.
      padMerged = exchange.input.frame(padMerged, false);
      padGame = exchange.input.frame(padGame, false);
      fireModeInputFor(lanes).flush(padGame.fireMode);   // PAR-22: the fire-mode button flushed with it (FUN_002dba60, research 254 s4)
      gamePad.flushExtras();                           // h59U9CLb: no combo spans the flush
      flushed = !held;
      if (held) return;
    }
    const down = new Set([...padButtonsDown(polled), ...padButtonsDown(touch.pad)]);   // MP-1 (FI.R3): the touch pad's buttons are a pad's
    o.settings?.frame(now, down, polled, touch.pad);
    const edges = exchange.edges(down);               // `./main`'s: the buttons pressed this frame; the menu's context kept current
    // TAUNTS (`./matchTaunts`, research 301 §7): open, the Chat menu holds the pad -- the game's lanes take nothing.
    const start = startMenu.pad(down, mergeInput(touch.input, pad), dt);   // MATCH-01: the START menu first; up, the pad is its own
    matchAbort.frame(dt);
    const chat = taunts.pad(start.held, start.input);   // PAR-5: the touch lanes merged with the pad's (`./main`'s `input`)
    voice.pad(chat.talk);                              // SVC-20b-page: the talk input's flag (W20.R9)
    // PAR-1: `./main`'s `menu` -- the Chat menu, else the ARMORY open (PAR-2: the pad is its; no button opens it, the
    // owner's ruling of 2026-10-02), else WEAPON EXCHANGE (closed, R2 opens it dead; open, the pad is its, HUD mode 1);
    // its ownership before R1, the R2 inventory and the lanes (research 300 §3).
    armoryPart.stick(polled, edges, !(start.owns || chat.owns));   // AM-2 (research 340 §2): the ARMORY's dialog takes the stick's flick, as the original's (read before the press: F2)
    const menu = start.owns || chat.owns || (armory.isOpen() ? armory.pad(edges) : exchange.pad(edges));
    if (menu || throws.inventory.isOpen()) normalInput?.cancel('A normal menu owns the input');
    const input = exchange.input.frame(chat.input, menu);
    feedCamera(fly, input, () => !!net?.spectatorCamera());   // PF-31: Triangle the spectator's while the pad is (`./matchCore`)
    const walking = walk.mode() === 'walk';
    // R1, then the R2 inventory (`./main`'s: it reads the merged lanes' edges and hands the game the input less the lanes
    // it holds), then the game's lanes in the player update's order (`./matchLanes`, `FUN_00594cf0`): the jump, the
    // shoulders (the slots the inventory's binds hold), the zoom, the fire mode, the reload, the stance.
    firearm.triggerLane(padMerged, input);
    if (!walking && throws.inventory.isOpen()) throws.inventory.close();
    const game = menu || !walking ? input : throws.inventory.frame(padMerged, input, dt, frameTime.real());   // PAR-34: its idle close in real time
    // ACT-3: `./main`'s XR-06 edge (main.ts:1229-1231) -- the ARMORY's or a menu's opening (WEAPON EXCHANGE, the R2
    // inventory, the Chat menu) cancels the action button's hold before the lanes, so the Cross it takes over is no release.
    const over: CancelCause | null = armory.isOpen() ? 'armory' : menu || throws.inventory.isOpen() ? 'menu' : null;
    if (over && !menuOver) { acts.cancel(over); stanceButton.reset(); }   // as the R2 inventory's `onOpened`: no tap or hold carried over
    if (pad.stance && !game.stance) gamePad.cancelStancePress();   // OT.R107: a Triangle a menu took is no late pressure Prone
    menuOver = over;
    fly.setInputSuspended(menu);                       // this frame's menu, as `./main` suspends on its `menu`
    walk.holdForMenu(menu || throws.inventory.isOpen());
    playerLanes(lanes, padGame, game, frameTime.real(), { walking, menu, runAndTalk: startMenu.runAndTalk() });   // PAR-24: the timed holds in real time
    padMerged = input;
    padGame = game;
    touch.endFrame();                                  // PAR-5: the touch lifts read this frame let go for the next
    hud.setKeepClear(keepClear.get());                 // OT.R82: the message panel kept off the touch controls (`./hudMessagePanel`)
    acts.wiring.endFrame();                            // ACT-3: `./main`'s (main.ts:1246) -- a release the walk never asked about dropped
  };

  /** PAR-24 (research 252): the frame's real seconds, read once a frame; the timed rules count them, the simulation the clamped step. */
  const frameTime = new FrameTime();
  // CPS H9 (a dev instrument): CPS H9, 2026-11-03T01:58Z: calls 0 between frames; charShadow 0.15% with the skip in.
  // three's `info.autoReset` zeroes the frame's counts at an animation frame's start, and the live scene's read between
  // frames saw them zeroed (`./renderStats`, the header). The hook's gate -- the dev panel's switch, `./source` `devSwitches`' `tools` asked direct (`./devTools`
  // reaches the shell's fly gate, PAR-17) -- and the last frame's counts, snapshotted at the frame's tail below.
  const devStats = import.meta.env.DEV && devSwitches(win.location?.search ?? '').tools;
  let lastDraws: FrameCounts | null = null;
  let lastOverlays: number | null = null;             // CPS H10 (a dev instrument): the effect-light overlays shown at the frame's tail
  let lastOverlaysCulled: number | null = null;       // CPS overlay cull (a dev instrument): of those, the ones the frame's render left out
  let gpuTimer: GpuTimer | null = null;                // CPS GPU time (a dev instrument): three's timestamps resolved at the frame's tail, the last kept
  const frame = (now: number): void => {
    frameId = 0;
    if (gone) return;
    const dt = Math.min(frameTime.frame(now), 0.1);   // a backgrounded tab must not teleport the camera (PAR-24: the real seconds kept)
    padFrame(dt, now);
    firearm.beforeMove();                              // the bob (states 1-3)
    fly.update(dt);
    traversal.input();                                 // ACT-1: `./main`'s research 86 -- the peek held (the pad's lean lanes)
    net?.trigger(firearm.fire.triggerHeld() || acts.triggerHeld());   // LATER 347: `./main`'s -- the trigger the frame's commands carry, before the walk builds them
    walk.frame(dt);
    const walking = walk.mode() === 'walk';
    firearm.gunFrame(dt, walking);                     // the view tick, the bloom, the zoom and its FOV, the lens
    throws.poseFrame(dt);                              // the throw clip's `throw_whoosh` (`./matchThrow`)
    firearm.kitFrame(dt, walking);                     // the kit's swap and mounts
    play.frame(dt, walk, fly.camera, frameTime.real(), net ? corpseShownS(net.roomRules(), 'own', net.waitingRoom()) : Infinity, net?.ghost() === true);   // PAR-34: the rifle's lowering countdown in real time; PAR-91: `./main`'s -- the own corpse by the room's rules (the welcome's); NU-11b H2: a ghost's own body unseen
    firearm.beforeNet();                               // the dead's held trigger let go before the net's frame, as `./main`'s frame
    remote.setListener(net ? walk.feet() : null);      // PF-25 (research 219 §4): the others' footfalls, the nearest three
    net?.frame(dt, fly.camera, firearm.fire.triggerHeld() || acts.triggerHeld(), frameTime.real());   // ACT-1: `./main`'s -- the turret's trigger too (PAR-34: a rescued hostage's fade in real time; NU-4: a corpse has none -- was: the bodies' fades)
    acts.followNet();                                  // ACT-1: `./main`'s fix round -- a reconnect's new client followed at once
    exchange.frame();                                  // PAR-1: `./main`'s -- WEAPON EXCHANGE's context kept current
    if (attached) { touch.weaponsFrame(); touch.pageState(walking, taunts.isOpen()); }   // PAR-5: INV with the dead's prompt; the layer's walk and Chat menu (IP3: the layer's from attach)
    doors.frame(dt);                                   // ACT-1: `./main`'s DOORS -- the room's swings
    gates.frame(dt);                                   // MAP-07: `./main`'s gates -- the room's slide
    cranes.frame(dt);                                  // Chain Reaction: `./main`'s hooks
    acts.turrets.frame();                              // ACT-1: `./main`'s MAP-10b -- the held turret's look clamped, every occupied gun turned
    world?.world.step(dt);                             // SUP-02: the world's running scene programs (./main's `pageWorld?.step(dt)`)
    firearm.fireFrame(dt, walking);                    // the fire's rate and reload
    acts.turretFrame(frameTime.real(), walk.isDead());   // PAR-24: its cadence in real time; ACT-1: `./main`'s MAP-10b -- the turret's trigger let go off it or dead; its rounds
    firearm.effectsFrame(dt, fly.camera);              // the effects
    fly.camera.updateMatrixWorld();
    sound.frame(fly.camera, walk.gameCamera());        // the game's listener is the camera (0x48dd40; #479: the game's); the reverb, the beds
    const glow = throws.frame(dt, frameTime.real());   // the throws, the launcher, the flashbang's wash (`./matchThrow`; PAR-34: the timed rules in real time)
    renderer?.setGlow?.(glow);                         // and its glow for this frame's render
    view?.frame(fly.camera, dt, firearm.zoom.renderView());   // PF-29: ./main's twin (the zoom's render view)
    fly.camera.updateMatrixWorld();
    // LATER 129 (PAR-48c, issue #138): the frame's game state runs each frame, as `./main`'s, and only the drawing waits
    // for the renderer (a WATCH GAME page's can come late: WebGPU's adapter request, LATER 128) -- in `./main`'s order:
    // the render, the spectator's pad, the view (PAR-48c's review F1: the pad's change is this frame's), the hostages,
    // the slide's loop, the HUD's render.
    // LATER 415 / 489: the renderer's region gate before the frame's render (LATER 489's review, F1): the shown
    // body's floor, every body's zone (a hostage's too), the eye (`./regionCull`); then the bodies drawn by it.
    const gateGrid = walk.grid();
    if (net && gateGrid) {
      regionCull.frame(gateGrid, {
        viewed: walk.feet(), eye: walk.lookAim()?.eye ?? null, spectator: net.client.role === 'spectator',
        bodies: remote.ids().map((id) => ({ id, feet: remote.feet(id) })),
      });
    }
    remote.applyZoneGate(net && gateGrid ? (id) => regionCull.drawn(id) : null);
    if (renderer) {
      if (shadowsOn) shadow.frame(shadowRendererOf(renderer), scene, ownBody.view()?.group ?? null);   // PAR-6: `./main`'s line before the world's render; CPS-4a: not while Shadows are off
      forgeLighting?.update([scene], o.forgeLighting!);
      renderer.render(scene, fly.camera);
    }
    // BLACK-GAP: frames rendered with the world in and its scene compiled (or no warm to wait for); the second's end is the gate.
    // IP3: the hand-off's counted from its attach (frames on the shown canvas); stage 1's (`readyDraws`) from the mount.
    const worldDrawn = worldIn && !!renderer && (!map || !renderer.warm || sceneWarmedFor === map);
    if (!firstDrawn && attached && worldDrawn) worldDraws++;
    if (!readyTold && worldDrawn) readyDraws++;
    const firstWorldFrame = !firstDrawn && worldDraws >= 2;
    net?.spectatorPad(padMerged);                      // PF-31: ./main's twin
    const spectating = spectatorHudView(net, walk, undefined, exchange.device(), (id) => itemIcon(loadouts.tables(), id));   // LATER 118: the dead's help lines on the prompt's own device (./matchExchange); LATER 117: the watched teammate's held icon
    hud.setSpectator(spectating);                      // PAR-48: ./main's twin (research 282)
    if (renderer) {
      const scoreboard = (walking || spectating !== null) && (padMerged.scoreboard || scoreboardKeys.held());   // research 87 §12: SELECT held; PAR-48: a spectator's too
      firearm.aimReticle(dt);
      firearm.showReticle(renderer.renderer, walking, false, scoreboard, spawned);   // no tactical map mounted; PAR-94 B2: none before the seat's spawn
      hud.setScoreboard(scoreboard);
      // PAR-94 B2: no HUD before the room's spawn of the seat (was: `hud.setVisible(walking)`, the default kit drawn from the mount).
      hud.setVisible(walking && spawned);
      { const own = ownHudName(net); hud.setPlayerName(own.name, own.tag); }   // NU-9 N1 (research 327): the walker's own name and tag, apart
      traversal.hudFrame(hud);                         // ACT-4: `./main`'s research 86 -- the ladder slide's icon on a ladder
      acts.bomb.hudFrame();                            // ACT-1: `./main`'s XR-06 -- the bomb's compass marks and the fuse in the timer's place
    }
    hostages.frame();                                  // ACT-5: `./main`'s HX-4a line -- the hostage order offered afresh this frame
    if (renderer) {
      traversal.effectsFrame();                        // ACT-1: `./main`'s research 86 -- the water's ripples (PAR-10: on the firearm's effects)
    }
    traversal.soundFrame();                            // PAR-89: `./main`'s -- the slide's loop held for the slide clip (research 305 s3)
    if (renderer) {
      firearm.feedHud(walking, {                       // ACT-4: `./main`'s -- the weapon box and the readouts, with the action slot's two feeds
        climb: traversal.hudClimb(),                   // research 86: the ledge's climb prompt
        nearby: acts.prompt(walking),                  // XR-06: the action context's prompt, in the picker's order (`./matchActions`)
      });
      {                                                // MATCH-05: `./main`'s -- the voice element and the hud_talk mark (note 227 §2)
        const page = net;
        const vf = page ? voiceHudFrame(voiceEl, performance.now() / 1000, {
          voice: voice.state(), self: { id: page.client.id, team: page.client.role === 'player' ? page.client.team : null },
          rows: page.rows, spectators: hud.spectatorCount(), nameOf: (id) => page.displayNameOf(id), clanOf: (id) => page.client.clans.of(id),   // AD-13
          at: (id) => remote.feet(id), own: walk.feet(),
        }) : null;
        hud.setVoice(vf?.view ?? null);
        hud.setTalkMarks(vf?.marks ?? []);
        hud.setCommandMenu(attached && taunts.isOpen());   // NU-9 T3: the Chat menu open hides the tags' texts (D:L56617-56623); IP3: none before attach
        // LATER 415: the tags read the region gate framed before the render (`./regionCull`).
        const tagGrid = walk.grid();
        hud.setTeamTags(page ? teamTags(teamTagInput(page, remote, fly.camera, voice.state(), tagGrid ? (id) => regionCull.drawn(id) : undefined)) : null);   // NU-9 T4 (research 329)
      }
      hud.setHostageMarks(net?.hostageMarks(map?.ai, map?.forgeZoneMarks) ?? []);   // ACT-5: `./main`'s HX-5 line -- the hostages' and the zones' compass marks
      hud.render(renderer.renderer);
    }
    // PAR-2: `./main`'s -- the ARMORY's scripts stepped, pulled out 5 s before the next round (popup 47), drawn over everything.
    armoryPart.frame(dt, renderer?.renderer ?? null);
    if (import.meta.env.DEV && devStats && renderer?.renderer.info) lastDraws = frameCountsOf(renderer.renderer.info);   // CPS H9: after the frame's last render (the armory's), its counts copied
    if (import.meta.env.DEV && devStats) lastOverlays = frameOverlaysOf(firearm.effects.lights); if (import.meta.env.DEV && devStats) lastOverlaysCulled = frameOverlaysCulledOf(firearm.effects.lights);   // CPS H10: the overlays the frame drew from (a state: `./renderStats`); the overlay cull: of those, the ones its render left out
    if (import.meta.env.DEV && devStats && renderer) (gpuTimer ??= new GpuTimer(renderer.renderer as unknown as TimestampRendererLike)).frame();   // CPS GPU time: the frame's passes resolved, never awaited
    if (adaptiveRatio.frame(dt, now, ratioTargetOf(renderer), (o.blocked?.() ?? false) || picture === 'ps2')) fpsReadout?.tick();   // PAR-12: `./main`'s frame tail; the PS2 frame's size is the point; cq41E0VR's readout on its tick
    pageFrameSampler().frame(frameTime.real() * 1000, 'match', renderer, canvas, map, net);   // CPS-5 (a browser adaptation): the performance line's sampler, the frame's real ms
    if (firstWorldFrame) { firstDrawn = true; markLoad('first-frame'); o.firstFrame?.(); }   // BLACK-GAP (`./loadingHold`): the front end's loading screen let go
    if (readyDraws >= 2) tellReady(true);             // IP3: stage 1's end -- the same gate, "prepared" as `firstFrame` means drawn
    if (gone || (!attached && readyTold)) return;      // IP3: a prepared match's frames stopped until its attach
    frameId = win.requestAnimationFrame(frame);
  };
  frameId = win.requestAnimationFrame(frame);

  // CPS (the dev instruments below, a development build's only under `devStats`): IP3 makes the hook at attach
  // (`attachTo`), so they are gathered here and spread into it there.
  const devHook: Pick<MatchWindowHook, 'renderStats' | 'shadowStats' | 'seatState' | 'gpuStats'> = {};
  // CPS H9, 2026-11-03: the match's draw count unread -- only the test room's hook had it (532 calls a frame on MP2, 834 on
  // MP6, the room empty) while the 16-seat live Frostfire cell spent 47-51% of its main thread in the draw submission.
  // `./main`'s PRF-4 line on the match's renderer, under the same gate (`./devTools`' switch is `./source`'s `tools`,
  // asked here direct: `./devTools` reaches `./flyAccess`, the shell's, PAR-17); the live scene reads it (`tools/perf/cpf/liveRun.ts`).
  // CPS H9, 2026-11-03T01:58Z: the counts read between frames were the reset ones (calls 0, triangles 0), so the render
  // counts are the last frame's as its tail snapshotted them (live until a frame has drawn); and the own shadow's drawn /
  // skipped counts beside (charShadow 0.15% with the skip in, the seat moving).
  if (import.meta.env.DEV && devStats) devHook.renderStats = () => { const info = renderer?.renderer.info; return info ? renderStats([['match', { info }]], [lastDraws], lastOverlays, lastOverlaysCulled) : null; };
  if (import.meta.env.DEV && devStats) devHook.shadowStats = () => shadow.shadow.stats();
  // CPS cell-alive, 2026-11-03: the seat's state beside, read once a second by the live scene (`tools/perf/cpf/liveRun.ts`)
  if (import.meta.env.DEV && devStats) devHook.seatState = () => {
    const spectator = !net || net.client.role !== 'player', mode = walk.mode(), dead = walk.isDead();
    return { alive: !spectator && mode === 'walk' && !dead, dead, spectator, mode };
  };
  // CPS GPU time (CPS.R9's GPU column): the last resolved frame's GPU ms, read by the live scene beside the others
  if (import.meta.env.DEV && devStats) devHook.gpuStats = () => gpuTimer?.stats() ?? null;

  // IP3: one teardown -- a mount's `close` and `release`, and a prepared match let go before its attach (`drop`): what was
  // never attached (the hand-off's parts, its hook) is skipped, all the rest let go the same way.
  const teardown = (): void => {
    normalInput?.end('The private match ended');
    gone = true;
    beaconMatchEnded();                                // CLIENT_ERROR_BEACON_ADAPTATION: no elapsed outside a match
    tellReady(false);                                  // IP3: a prepare still waiting on this mount ends with it
    offHeard();
    offPicture();                                      // OT.R79: the picture no longer followed
    void hdPack?.setEnabled(false); hdPack = null;     // HD.R8: the HD pack's originals back before the world goes
    offDetailDistance();                               // PF.R60: nor the detail distance
    offVideo();                                        // CPS-4a: nor the video settings
    canvas.classList.remove(PICTURE_PS2_CLASS, MATCH_CANVAS_CLASS);   // the canvas's own classes only: the body's are never touched
    if (import.meta.env.DEV && attached) {             // IP3: the hook is the attached match's
      delete (win as unknown as Record<string, unknown>)[MATCH_WINDOW_HOOK];
      delete (win as unknown as { __crane?: unknown }).__crane;
    }
    hear?.(); hear = null;
    if (frameId) win.cancelAnimationFrame(frameId);
    frameId = 0;
    acts.unlock();                                     // ACT-1: `./main`'s -- the closed client gave the walk back unlocked (`NetClient.release`)
    acts.follow(null);                                 // ACT-1: `./main`'s wave 4 -- the pages back to no room: no bomb, no turret held
    acts.dispose();                                    // the window's blur listener let go
    drops.reset();                                     // PAR-4: `./main`'s map left -- the room's drops off the scene
    for (const [type, fn] of padsOn) win.removeEventListener(type, fn);   // ACT-3: the pad watch's two
    unwatchViewport();                                 // PAR-12: the resize, the visual viewport's and the rotation
    walk.unbindKey();
    scoreboardKeys.unbindKey();
    forgeLighting?.dispose();
    fly.dispose();
    remote.clear();
    ownBody.reset(null);
    if (view) { scene.remove(view.group); view.dispose(); view = null; }
    if (o.extraWorld) scene.remove(o.extraWorld);     // LATER 456: off the scene with the match; the caller disposes it
    world = null;                                      // MATCH-GAPS: the page's world let go (C4 none from here)
    hostages.reset();                                  // ACT-5: `./main`'s at `connectNet` -- nothing offered from the room left
    hud.dispose();
    throws.dispose();                                  // MATCH-THROW: off the scene, its listeners, the flash's wash, the menu
    if (attached) taunts.dispose();                    // TAUNTS: the menu closed, its held buttons and the heard list gone
    o.settings?.interrupt();
    if (attached) startMenu.dispose();                 // MATCH-01: the START menu closed, the HUD's hides lifted
    fpsReadout?.dispose();                             // cq41E0VR: the SHOW FPS readout off the page (made at attach)
    matchAbort.reset();
    chat.dispose();                                    // TACTICAL ORDERS and MESSAGES: the map's records and the heard list gone
    typed?.dispose();                                  // KEYBOARD-WHISPER: the text line's keys let go
    exchange.dispose();                                // PAR-1: the window's blur listener let go, the menu closed for good
    if (attached) { touch.dispose(); touchTaps.abort(); offTip(); }   // PAR-5: the layer's listeners, its classes and its built markup gone
    if (attached) keepClear.dispose();                 // OT.R82
    armoryPart.dispose();                              // PAR-2: closed without a `ready` on the client handed back, the view freed
    if (attached) voice.dispose();                     // SVC-20b-page: the talk let go, the microphone's track stopped (constraint 6)
    firearm.dispose();
    shadow.dispose();                                  // PAR-6: the shadow's silhouette and map freed, none on the receivers
    sound.dispose();                                   // MATCH-SOUND: the ears, the cues, the map's banks and beds
    o.audio?.release();                                // the match's output off the menus' context
    canvas.removeEventListener('mousedown', onMouseDown);
    if (renderer) {
      const r = renderer;
      r.renderer.dispose?.();
      // The context let go now, not when the collector finds the canvas (the review's F3): WebGL2's, the only one a
      // page can drop by hand; a WebGPU device ends with the renderer's own dispose.
      if (r.backend === 'webgl2') {
        try { (canvas.getContext('webgl2') as WebGL2RenderingContext | null)?.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* gone already */ }
      }
    }
    renderer = null;
    net = null;
    if (own) canvas.remove();
  };

  // SVC-19 (research 266 §3.3): the round's frame drains the lobby server's queue onto the HUD's message window.
  const roundChat = mountRoundChat({
    hud, external: () => externalWhispers(o.externalWhispers?.()),
    names: () => net?.rows.map((r) => r.name) ?? [],
  });

  /**
   * IP3 stage 2 (`PreparedMount.attach`): the hand-off's options in (the same object as stage 1's, typed whole from here),
   * the canvas shown in the hand-off's target, and the hand-off's parts made and the input bound, in the order the mount
   * always made them -- the private input port, the walk's keys, the HUD's set-up read, the round screens' ARMORY read,
   * the scoreboard's keys, the client heard (the events kept for the replay), TAUNTS on the lobby's talk input, the START
   * menu on the session's options, the voice client, the fire's keys and the mouse's zoom, the pad's watch, the touch
   * layer and the phone's tip, the stored OPTIONS, the hook (its count of the client's events), the keyboard's text line
   * -- then the map's sound and HUD lines `place` left for this, the seat's side read again, and `join()` once the world
   * is in. Nothing of stage 1 runs again: no second `place`, renderer or warm.
   */
  const attachTo = (into: HTMLElement, o: MatchMountOptions): MountedMatch => {
    if (own && canvas.parentNode !== into) into.append(canvas);
    if (first.hidden) canvas.style.visibility = '';    // shown, as the mount's own canvas is
    // Each in the order the mount always made it (the window's listeners among them): the input from here, not before.
    const normalInput = o.client.url === 'loopback:' ? o.normalInput : undefined;
    if (o.normalInput && !normalInput) o.normalInput.end('Only a private loopback match accepts this input port');
    walk.bindKey(win as unknown as EventTarget);
    // NU-9 (c) T4 (research 329 §1.8): TEAMMATE NAMES read once at the mount, as the HUD's set-up reads it (D:L77558-77559); absent, the golden's 1
    hud.setTeammateNames((o.gameVars?.valve('DISPLAY_MP_TEAM_NAMES') ?? 1) !== 0);
    // PAR-3 (research 255 s3): `./main`'s `armoryData` line -- the round screens' two bitmaps out of the page's ARMORY read
    // (the lobby's), kept by the HUD across the map's own set.
    // PAR-2: and the seat ARMORY's data, `./main`'s `armoryData` (a seat waiting for it opens it then; no read, none).
    o.armory?.then((d) => { if (!gone) { handRoundScreenBitmaps(hud, d); armoryPart.setData(d && 'layout' in d ? d : null); } }, () => { if (!gone) armoryPart.setData(null); /* no read: the screens' shapes */ });
    scoreboardKeys.bindKey(win as unknown as EventTarget);
    hear = o.client.on((ev) => { if (pending.length < LOBBY_MATCH_EVENTS_ADAPTATION) pending.push(ev); });
    // TAUNTS (research 301): the Chat menu's taunts -- `/testroom`'s (`./matchTaunts`), the five the session's (`taunts`).
    const taunts = mountTaunts({
      net: () => net, hud, audio: sound.audio, custom: () => o.taunts?.() ?? [], release: () => { throws.grenade.cancelMenuHold(); firearm.held(); },
      otherMenu: () => (o.blocked?.() ?? false) || armory.isOpen() || exchange.isOpen() || throws.inventory.isOpen(), entries: chat.entries,
      talk: o.handOff.talk,   // ONL-16b (W20.R9): the lobby's talk input, one instance across the launch
      runAndTalk: () => startMenu.runAndTalk(),   // MATCH-01: RUN AND TALK as the START menu leaves it
      aborting: () => matchAbort.aborting(),
    });
    // cq41E0VR: the SHOW FPS readout, with the menu whose row toggles it (IP3: at attach, beside the touch layer's parent).
    const fps = fpsReadout = mountFpsReadout(own ? into : doc.body, { smoothedMs: () => adaptiveRatio.smoothedMs(), store: pageSettings, zIndex: Number(canvas.style.zIndex || 1000) + 1 });
    // MATCH-01 (research 266 §8): the in-round START menu (`./startMenu`), `/testroom`'s too; its rows' captions the map's HudCLOC.
    const startMenu = new StartMenu({
      options: o.startMenuOptions ?? localStartMenuOptions(),
      seat: () => ({ multiplayer: true, spectator: !!net?.gate().spectator, comeFromLan: !(o.textLine?.online() ?? true) }),
      caption: (id) => menuCaptions?.[String(id)] ?? null,
      title: () => map?.name ?? null,
      sound: (name) => { sound.audio.play(name, null); },
      allowed: () => !!net?.gate().inMatch && !(o.blocked?.() ?? false) && !armory.isOpen() && !exchange.isOpen() && !throws.inventory.isOpen(),
      voiceMask: (on) => { taunts.headset.setVoiceMask(on); },
      opened: () => { taunts.reset(); },
      abort: () => { matchAbort.abort(); },
      hud,
      settings: o.settings,
      adaptations: { fullscreen: matchFullscreen, fps },   // cq41E0VR: FULLSCREEN and SHOW FPS (B199)
    });
    startMenu.levelStart();                            // R4B-02 review P2: the level load's mask (r4 0x1f6850, D:L55851-55854)
    // SVC-20b-page (research 226 §3): the voice client -- `/testroom`'s (`./voice/voiceClient`), on the taunts' talk flag,
    // at the match audio's HEADSET VOLUME (its tuner source); the microphone at the first talk press only.
    // SVC-22b (research 226 §5): the taunts part's headset UX -- the notice, the no-headset line, the round's modulation.
    // VOICE-LATE-3 (research 226 §3.3): `reportTo`, the server a development build's posted voice counters go to (a playtest
    // instrument; nothing is posted in a release build or without `?devmode`)
    // VOICE-MATCH-RED (LATER 60): the voice's link is the lobby's client until the `NetPage` is set, as `side` reads it --
    // that constructor replays the events kept on the loading screen, and since LOAD-HOLD (b151af927) they hold round 1's
    // `voiceFloor` (server `room.ts` `voiceRoundStart`); with no link then, the voice's `sync` took the set `net` for a
    // new client at its next `pad` and dropped that floor entry, the round's channel null until the next one.
    const voice = mountVoice({ net: () => net ?? { client: o.client }, tuners: () => sound.audio.getTuners(), headset: taunts.headset, reportTo: () => voiceReportSocket(o.handOff),
      talkCue: (name, volume) => { sound.audio.play(name, null, 'play', volume); },
    });
    // `./main`'s overlay: WEAPON EXCHANGE, the R2 inventory and TAUNTS on the HUD's layer (no tactical map here).
    hud.setOverlay((frame, sizes) => {
      const ws = exchange.overlay(frame, sizes), inv = throws.inventory.draw(frame, sizes), chat = taunts.draw(frame, sizes), menu = startMenu.draw(frame, sizes);   // MATCH-01: the START menu last, over them
      return ws.quads.length || inv.quads.length || chat.quads.length || menu.quads.length ? { quads: [...ws.quads, ...inv.quads, ...chat.quads, ...menu.quads], tris: [...ws.tris] } : null;
    });
    firearm.fire.bindKey(gated as unknown as EventTarget);
    if (import.meta.env.DEV) {                                       // OT.R38: the mouse a development build's only
      mouseSite('s2u-mouse-zoom');
      canvas.addEventListener('mousedown', onMouseDown);
    }
    pads.attach({ addEventListener: (type: string, fn: EventListener) => { padsOn.push([type, fn]); win.addEventListener(type, fn); } } as unknown as EventTarget);
    /**
     * PAR-5 (`./matchTouch`, research 222 §11): `/testroom`'s touch layer, built on the match's root over its canvas -- a real
     * touch device's controls (OT.R29: START lets one in without a controller; a browser adaptation) -- with WEAPON EXCHANGE's
     * INV and its taps on the open menu, a touch's alone (no mouse in a release, OT.R38); and the phone's tip.
     */
    const touch = mountTouch(own ? into : doc.body, {
      stance: pressUnlessArmory<'up' | 'cancel'>(() => armory.isOpen(), (event) => walk.stanceTouch(event)),
      fire: (down) => firearm.trigger(down),
      reload: unlessArmory(() => armory.isOpen(), () => { if (walk.mode() === 'walk' && !walk.isDead()) firearm.fire.reload(); }),
      cancelAction: () => { acts.cancel('touch'); },
      exchange, covered: () => armory.isOpen() || (o.blocked?.() ?? false), win, build: { zIndex: Number(canvas.style.zIndex || 0) + 1 },
    });
    const keepClear = keepClearWatch(own ? into : doc.body, canvas);   // OT.R82: the touch controls' boxes, at a change (`./hudMessagePanel`)
    const touchTaps = new AbortController();
    exchangeTaps(canvas, exchange, { touchOnly: true, signal: touchTaps.signal });
    const offTip = mountTip({ local: tipStoreOf(pageSettings), session: tipStoreOf(tabSettings), pads: () => pads.count(), show: (text, dismiss) => { touch.showTip(text, dismiss); } });   // the page's settings path (R99.3), as `./main`'s
    /** OPTIONS (research 302 §4; `UIStoreOptions`, 04 O11): the session's stored options, each frame -- the part both pages mount. */
    const playOptions = matchOptions(o.options);
    const lanes: LaneParts = {
      walk, firearm, stanceButton,
      shoulder: (which) => { throws.takeSlot(throws.inventory.binds()[which]); },   // the slot each holds (the R2 inventory's binds)
      action: (before, after, dt) => { acts.lanes(before, after, dt); },   // ACT-3: `./main`'s (main.ts:942) -- XR-06's lifecycle, then research 86's lanes
      fireModeSetting: playOptions.fireModeSetting,      // PAR-22: the stored OPTIONS' (research 254 s3; `./matchOptions`)
    };
    normalInput?.bind({
      // Only the agent's own held lanes are cancelled between frames; the merged input drops the rest next frame.
      // LATER 436/447: the trigger and a stance hold the agent let go are released (no tap at the stance's release), unless a
      // human holds that lane too.
      release: ({ action, fire, stance }) => {
        if (action) acts.cancel('blur');
        if (fire && !humanHeld.fire) firearm.held();
        if (stance && !humanHeld.stance) stanceButton.forgetPress();   // the review's F1: the human's Crouch and Prone binds kept
      },
      equip: (item) => !gone && !armory.isOpen() && !startMenu.isOpen() && !taunts.isOpen() && !exchange.isOpen()
        && throws.takeSlot(item === 'rifle' ? 0 : item === 'pistol' ? 1 : item + 1),
      armoryKey: (code) => !gone && !(o.blocked?.() ?? false) && armory.isOpen() && armory.key(code),
    });
    // The browser spec's hook (`MATCH_WINDOW_HOOK`), a development build's only.
    const heard: Record<string, number> = {};
    offHeard = o.client.on((ev) => { heard[ev.type] = (heard[ev.type] ?? 0) + 1; });
    if (import.meta.env.DEV) {
      (win as unknown as { __crane?: () => ReturnType<typeof craneScene> }).__crane = () => craneScene(view?.group ?? null, cranes.hookState());
      (win as unknown as Record<string, unknown>)[MATCH_WINDOW_HOOK] = {
        ...devHook,                                      // CPS: renderStats, shadowStats, seatState, gpuStats (under `devStats`)
        team: () => net?.client.team ?? o.client.team ?? null,
        respawnTerms: () => net?.respawnTerms() ?? null,   // B138's instrument (dev only: the hook is folded out of builds)
        side,
        kit: () => [...loadouts.loadout()],
        body: () => {
          const b = ownBody.loaded();
          const of = (s: Side): boolean => !!b && (map?.types?.[s].includes(b) || b === (s === 'seal' ? map?.body : map?.terrorist));
          return { side: of('terrorist') ? 'terrorist' : of('seal') ? 'seal' : null, model: b?.model ?? null };
        },
        kits: () => ({
          seal: (map?.arsenal?.map?.kits.seal ?? []).map((k) => [...k.loadout]),
          terrorist: (map?.arsenal?.map?.kits.terrorist ?? []).map((k) => [...k.loadout]),
        }),
        other: (id) => ({ team: remote.teamOf(id), body: remote.bodySide(id) }),
        id: () => (net?.client ?? o.client).id,
        others: () => { const c = net?.client ?? o.client; return c.bodies().filter((b) => b.id !== c.id).map((b) => b.id); },
        appearances: () => remote.appearances(),
        heard: () => ({ ...heard }),
        audio: () => sound.audio.stats(),
        hud: () => hud.state(),                          // ACT-1: the HUD's model (the bomb's marks); ACT-4's reads after `aimAt`
        drawing: () => renderer !== null,                // PAR-48c: a test instrument, no game behaviour -- whether the match's renderer has come
        taunts: () => taunts.state(),
        weaponSelect: () => exchange.state(),            // PAR-1: `./main`'s `weaponSelect()` less the touch button (PAR-5's)
        armory: () => armoryPart.state(),                // PAR-2: `./main`'s `armory()` (`./matchArmory` `state`)
        openArmory: () => armoryPart.open(),             // PAR-2: `./main`'s -- opens it as a seat's join does (a playtest instrument)
        chat: () => chat.state(),
        voice: () => voice.state(),
        startMenu: () => ({ ...startMenu.state(), labels: startMenu.labels() }),   // MATCH-01 / MATCH-02: the START menu, read only
        settings: () => o.settings?.state() ?? null,
        settingsFrame: () => o.settings?.readFrame() ?? null,    // GM-09: the overlay's frame (a test aid, read only)
        options: () => ({ ...playOptions.current(), pitchInverted: fly.lookOptions().invertPitch, bob: fly.originalHeadBob }),
        ownBody: () => ownBodyRead(play, throws.throwPose),   // PB.R2's goldens: `./main`'s, the own body as drawn (read-only)
        aimAt: (id, aimHeight) => {
          const c = net?.client ?? o.client;
          const body = c.bodies().find((b) => b.id === id), eye = walk.fireAim()?.eye;
          if (!body || !eye) return false;
          const [dx, dy, dz] = [body.feet[0] - eye[0], body.feet[1] + aimHeight - eye[1], body.feet[2] - eye[2]];
          fly.setPose({ yaw: (Math.atan2(-dx, -dz) * 180) / Math.PI, pitch: (Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI });
          return true;
        },
        // ACT-4 (ruling ACT.R4, research 250 s5): what the menu-path specs read (`e2e/menuMatch.ts` `ACT4_READS`), each
        // `./main`'s `__viewer` line; no `teleport` on a served match. The match is played on foot with no fly toggle, so
        // `setCamera` keeps the walk (`./main`'s `playOn && !FLY.toggle`).
        feet: () => walk.feet(),                         // `./main`'s `feet`
        setCamera: (pose) => walk.setCamera(pose, true),   // `./main`'s `setCamera`
        pose: () => fly.pose(),                          // `./main`'s `pose`
        floorUnder: (x, z, y, from = y) => {             // `./main`'s `floorUnder`: the walk's floor pick (FUN_005b5d40)
          const grid = walk.grid();
          return grid ? (selectFloor(probeGround(grid, x, z), from + STEP_PROBE_LIFT_READING, y)?.y ?? null) : null;
        },
        doors: () => doors.stats(),                      // `./main`'s `doors`
        traversal: () => traversal.stats(),              // `./main`'s `traversal`
        worldStates: () => world?.world.states().map(({ path, active }) => ({ path, active })) ?? null,   // `./main`'s, on the page's world
        worldActive: (path) => world?.world.isActive(path) ?? null,   // `./main`'s `worldActive`
        basePulse: () => world?.world.basePulse() ?? null,   // `./main`'s `basePulse` (PB-9b), on the page's world
        // LATER 568's probe (a browser adaptation, read only): the gate as last framed, each body as drawn by it.
        zoneGate: () => {
          const grid = walk.grid();
          const regionAt = (f: readonly number[] | null): number | null => {
            if (!grid || !f) return null;
            const h = probeFloor(grid, f[0]!, f[1]!, f[2]!);
            return h ? h.poly.region >>> 0 : NO_REGION;
          };
          const viewed = walk.feet(), eye = walk.lookAim()?.eye ?? null;
          return {
            framed: net !== null && grid !== null,
            floor: regionCull.floor >>> 0, eyeRegion: regionCull.eyeRegion >>> 0, mask: regionCull.mask >>> 0,
            viewed, viewedRegion: regionAt(viewed),
            eye: eye ? [eye[0]!, eye[1]!, eye[2]!] : null, eyeUnder: grid && eye ? regionUnder(grid, eye) : null,
            spectator: net?.client.role === 'spectator',
            bodies: remote.seenForDev().bodies.map((b) => {
              let meshes = 0, onLayer0 = 0;
              b.group.traverse((o) => { if ((o as { isMesh?: boolean }).isMesh) { meshes++; if (o.layers.isEnabled(0)) onLayer0++; } });
              const feet = remote.feet(b.id);
              return {
                id: b.id, bot: net?.isBot(b.id) ?? false, alive: b.alive, visible: b.group.visible, meshes, onLayer0,
                zone: regionCull.zone(b.id), drawn: regionCull.drawn(b.id), feet, region: regionAt(feet),
              };
            }),
          };
        },
        alive: () => (net ? net.gate().alive : true),    // `./main`'s `weaponSelect().gate.alive` (its `exchangeGate`: no match, alive)
        waiting: () => net?.waitingRoom() ?? true,       // `./main`'s `net().waiting`; no NetPage yet, still waiting
        // ACT-2 (research 250 s3): `./main`'s W0-gate reads (`./turretHook`) -- the placements and the held one, the drawn parts.
        turrets: () => ({ placements: (map?.turrets ?? []).map(placementView), ...acts.turrets.stats() }),
        turretParts: () => drawnTurretParts(view?.group ?? null, (map?.turrets ?? []).map((t) => t.root)),
      } satisfies MatchWindowHook;
    }
    // KEYBOARD-WHISPER (OT.R48; research 266 §3.9): the online round's USB-keyboard text line on the HUD, its `/w` whisper
    // through the lobby's path; the round's actors the score's rows (`ROUND_ACTOR_NAMES_READING`), the sender the seat.
    const line = o.textLine;
    const typed = line ? mountRoundTextLine({
      hud, win, online: () => !gone && line.online(), whisper: (message, name) => { line.whisper(message, name); },
      actors: () => net?.rows ?? [],
      sender: () => (net ? { id: net.client.id, spectator: net.client.role !== 'player' } : null),
      menu: () => armory.isOpen() || exchange.isOpen() || throws.inventory.isOpen(),   // ROUND-LINE-YIELDS (#260): a closed DEV line leaves Enter to an open menu
    }) : null;
    adopt({ normalInput, taunts, startMenu, voice, touch, keepClear, touchTaps, offTip, playOptions, lanes, typed });
    attached = true;                                   // the hand-off's parts in: the frame and `padFrame` reach them from here
    beaconMatchBegan();                                // CLIENT_ERROR_BEACON_ADAPTATION: a report's matchElapsedMs counts from here
    if (placed) { gameLines(placed.map); soundLines(placed); }   // `place`'s hand-off lines, when the world came first
    reseat();                                          // the hand-off's client's side, should the lobby's last read differ

    /** The match on the lobby's client, once the world is in (its walk then stands the room's last spawn: `rebind`). */
    const join = (): void => {
      hear?.(); hear = null;
      const welcome = o.events.find((e): e is Extract<ServerEvent, { type: 'welcome' }> => e.type === 'welcome') ?? null;
      const adopted = [...o.events, ...pending];         // the room's events so far: the lobby's, then those heard since the mount
      const rules: Rules = welcome?.rules ?? resolveRules('', null).rules;
      // The deps both pages share (`./matchNet`), on the front end's switch, the throwables' (`./matchThrow`, MATCH-THROW),
      // the sound's (`./matchSound`, MATCH-SOUND), the seat ARMORY's (`./matchArmory`, PAR-2), and its own: the game on the
      // lobby's client.
      const deps = matchNetDeps({
        caps: FRONT_END_CAPABILITIES, walk, remote, hud, fly, loadouts, firearm,
        clips: () => clips, map: () => map, side, followTeam,
        menuOpen: () => (o.blocked?.() ?? false) || exchange.isOpen() || taunts.isOpen() || armory.isOpen() || startMenu.isOpen(),   // the hold, WEAPON EXCHANGE, TAUNTS, the ARMORY, the START menu
        // A round's start (and an abandon) empties both decal pools and the air (CMPExitState L76084) and the wash: on
        // /testroom the ARMORY's glue does it; here the parts' own (the MATCH-THROW review's finding 1), ahead of the ARMORY's.
        // ACT-5: and nothing offered from the round before (`hostages.reset()`): a port-side cache clear with no source in the
        // original, changing nothing a player sees (`HostagePage.frame` stales the offer each frame; research 250 s6).
        // PAR-4: and the world drops with the air (`./main`'s `clearAir`: DROP_LIFETIME_PLACEHOLDER).
        roundClear: () => { firearm.fire.clearMarks(); firearm.effects.clearFootprints(); traversal.clearRipples(); throws.roundStart(); hostages.reset(); drops.reset(); startMenu.roundStart(); regionCull.reset(); },   // LATER 415 F2
      }, {
        ...exchange.netHooks(),                          // PAR-1: `./main`'s `answered` -- the menu shows the kit the room will spawn
        // `./main`'s: the pouch too at a spawn (the page's spent rings do not outlive it); WEAPON EXCHANGE closed over the kit (S8).
        respawned: () => { spawned = true; throws.grenade.refill(); exchange.reset(); startMenu.reset(); },   // PAR-94 B2: the seat spawned; MATCH-01: the HUD's reset closes the START menu
        died: () => { acts.cancel('death'); },           // ACT-3: `./main`'s XR-06 (main.ts:1721) -- a death cancels the action button's hold
      }, {
        ownCorpseExpired: () => play.ownCorpseExpired(), // RSP-6: `./main`'s same rendered-body expiry, no separate timer
        respawnInputBlocked: () => throws.inventory.isOpen(), // RSP-8: same existing R2 owner, scoped to the new press gate
        ...throws.netDeps(),
        ...sound.netDeps(),
        hostageState: (ev) => hostages.state(ev),       // ACT-5: `./main`'s HX-4a line (`PART_DEPS.hostages`, research 239 s7)
        // PAR-4: the world drops' (`PART_DEPS.worldDrops`, `./main`'s PF-34 lines): the room's drops, a welcome's set too;
        // the live kit after a pickup, no fill (the one firearm's `takeKit`).
        drops,
        kitChanged: (l, s, r, f, k) => { firearm.takeKit(l, s, r, f, k); },
        ...taunts.netDeps(),
        ...chat.netDeps(),
        ...voice.netDeps(),                              // SVC-20b-page: the floor entry and the room's voice frames
        ...armoryPart.netDeps(),                         // PAR-2: the hello's `armory`, a seat it opens on, the two round ends
        ...(o.gameChat ? { gameChat: o.gameChat } : {}),  // SVC-19: the room's game-session line, to the lobby's panel (research 266 §3.4)
        ...(o.systemMessage ? { systemMessage: o.systemMessage } : {}),   // SA-43c Part 2: the room's system message, to the front end's routing
        game: {
          id: o.handOff.mediusWorldId, ...gameSeatOf(o.handOff), holds: (h) => { o.holds(h); },   // SA-6b: the pinned URL and ticket, or a placed game's door and token
          ...(o.handOff.reseat ? { reseat: o.handOff.reseat } : {}),   // SA-6c (GAME_RETOKEN_ADAPTATION): the lobby's one provider, every retry re-tokened
          ended: (dialog) => { endedDialog ??= dialog; },
          adopt: { client: o.client, events: adopted },
        },
      });
      pending.length = 0;
      const path = missionMapPath(o.handOff.mission) ?? '';
      // Protocol 10 (MAP-03): the page's world follows the room's -- handed to the adopted lobby client by `NetPage`
      // (`NetClient.setWorld`), as /testroom's own client takes its `world` dep; none before a map is in.
      net = new NetPage({ ...deps, world: () => world?.world ?? null }, o.handOff.pinned.url, stemOf(path), welcome?.name ?? '', undefined, false, rules);
      acts.follow(net.client);                           // ACT-1: `./main`'s wave 4 -- the bomb, the turrets and the switches follow this room
      // The adoption's own line (research 250 s2): `/testroom`'s client is new, its welcome still to come; this one was
      // welcomed in the lobby, so the part is told what the NetPage was told -- the welcome's `objective` (the bomb on the
      // ground, or carried) and occupied turrets, and every event since -- or a joiner draws no bomb until it next changes.
      for (const ev of adopted) acts.roomEvents.emit(ev);
    };
    joinNow = join;
    if (worldIn) join();
    // A prepared match's frames, stopped at its gate, go on: its clock from here (the pause no frame's real time).
    if (!gone && frameId === 0) { frameTime.restart(); frameId = win.requestAnimationFrame(frame); }
    return {
      canvas,
      net: () => net,
      ended: () => matchAbort.ended() ?? endedDialog ?? (net ? null : finalCloseDialog(o.client)),
      lobbyLine: (line) => { if (!gone) roundChat.line(line); },
      release: () => {
        if (gone) return null;
        const client = net ? net.release() : o.client.state === 'open' ? o.client : (o.client.close(), null);
        teardown();
        return client;
      },
      close: () => {
        if (gone) return;
        if (net) net.close(); else o.client.close();
        teardown();
      },
    };
  };
  return {
    canvas,
    reseat,
    attach: (into, a) => {
      if (gone || attached) throw new Error('a prepared match is attached once, and not once let go');
      // The review's finding 1: only the hand-off's own options come in -- a stage-1 key a caller hands on with them (the
      // loader's mount passes the hand-off's whole options, its `audio` among them) never replaces the stage's: the match
      // was built on the stage's audio, picture and window, and its teardown lets those go, once.
      const handOff: Record<string, unknown> = { ...a };
      for (const key of MATCH_STAGE_KEYS) delete handOff[key];
      return attachTo(into, Object.assign(o, { blocked: undefined }, handOff) as MatchMountOptions);
    },
    drop: () => { if (!attached && !gone) teardown(); },
  };
}

/** A worker the loader asks (`./worker`'s; the tests' fake). */
export interface MatchWorker {
  postMessage(request: ViewerRequest): void;
  addEventListener(type: 'message', fn: (e: MessageEvent<ViewerResponse>) => void): void;
  addEventListener(type: 'error', fn: () => void): void;
  terminate(): void;
}

/** The front end's match loader: the mission's world decoded while the loading screen shows, then the match mounted on it. */
export interface MatchLoader {
  /** The mission's world and clips (the last mission's kept); null when the archive would not decode. */
  load(mission: string): Promise<MatchAssets | null>;
  /**
   * IP3 (`LOAD_REPORT_AT_PREPARED_READING`): the mission's match made ready to draw before the load is reported -- the
   * mount's own stage 1 (`prepareMount`) on the assets (`load`), its canvas hidden: the construction, `place`, the
   * renderer, the picture and the three warms, its frames drawn until its BLACK-GAP gate holds. Settles then; never
   * rejects (a failure settles too, nothing kept, logged once). One prepared match is kept: `mount` of its mission
   * attaches it (no second renderer, world or warm); a `load` or `prepare` of another mission, `dropPrepared`, `dispose`
   * and a lost context on its canvas let it go (its own teardown).
   */
  prepare(mission: string): Promise<void>;
  /**
   * IP3's lobby prepare (`./lobbyPrepare` `LOBBY_PREPARE_ADAPTATION`): whether `mission`'s match is prepared, being
   * prepared, or neither (null) -- what the hand-off's prepare finds (`./loadMarks` `markLobbyPrepared`).
   */
  holds(mission: string): 'prepared' | 'preparing' | null;
  /**
   * IP3's lobby prepare: the prepared match let go -- or the one being prepared, at once -- by its own teardown (the
   * renderer, the canvas, the world, the effects, the audio); the loader, its worker and its decoded mission kept
   * (`dispose` lets all go).
   */
  dropPrepared(): void;
  /** IP3 (5d's ruling (a)): the side source changed (`MatchLoaderOptions.side`): the prepared match re-seats (`PreparedMount.reseat`). */
  reseat(): void;
  mount(target: HTMLElement, o: Omit<MatchMountOptions, 'assets'>): MountedMatch;
  dispose(): void;
}

export interface MatchLoaderOptions {
  /**
   * Browser adaptation (no original; product track, PR #631's Xbox memory work), scoped to the Xbox preset by default
   * (`./graphicsBackend`): the worker is terminated once a load's assets are in and nothing is asked of it, so the
   * archive, its decode garbage, the sound banks and the loops' samples it holds go with it. The assets themselves are
   * the page's (transferred, kept in `kept`); a later request makes a fresh worker. Nothing the game does changes.
   */
  releaseWorkerAfterLoad?: boolean;
  /** IP3: the renderer `prepare` makes over its canvas; absent, `./renderer`'s (the mount's default). The tests' fakes. */
  renderer?: (canvas: HTMLCanvasElement) => Promise<MatchRenderer>;
  /** IP3: the document `prepare` makes its canvas in (on its body); absent, the page's. */
  doc?: Document;
  /**
   * IP3 (the review's F3): the picture asks for the HD pack (`./picture` `pictureExperimentalSettings(..).hdPack`). The
   * mount's `applyPicture` collects the pack's textures (`hdTextures.collect()`) before its `place` builds the world, and
   * a world the prepare built came before any collect -- so under it `prepare` does nothing and `mount` takes no prepared
   * match (it builds its own, as before IP3). Absent, never.
   */
  hdPack?: () => boolean;
  /**
   * IP3: the stage-1 inputs a prepare has before any hand-off, each the one the hand-off's mount is given -- VIDEO MODE's
   * picture (`./picture`'s keeper, followed by the mount's own `observe`), the window, and the match's audio (made for
   * the prepare; the hand-off's own audio is then let go unused). A mount whose window or picture is another's, or that
   * names one of the forge's stage-1 options, takes no prepared match.
   */
  picture?: MatchMountOptions['picture'];
  win?: MatchWindow;
  audio?: () => MatchAudio | undefined;
  /** IP3: the seat's side before the hand-off (`MatchStageOne.side`: the game lobby's own client's team); absent, the SEAL's. */
  side?: () => Team | null;
}

/**
 * The map viewer's worker (`./worker`: the archive read off the visitor's disc image or the served tree, decoded off
 * the page's thread, as `/testroom` reads it) asked for the mission's map and the play clips. One mission is kept: the
 * load the loading screen started is the one the match mounts on.
 */
export function matchLoader(source: SourceRequest, makeWorker: () => MatchWorker = () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }) as unknown as MatchWorker, options: MatchLoaderOptions = {}): MatchLoader {
  const releaseWorkerAfterLoad = options.releaseWorkerAfterLoad ?? readGraphicsBackend() === 'xbox';
  let worker: MatchWorker | null = null;
  let ids = 0;
  const waiting = new Map<number, (r: ViewerResponse | null) => void>();
  const ask = (request: ViewerRequest): Promise<ViewerResponse | null> => new Promise((res) => {
    if (!worker) {
      worker = makeWorker();
      worker.addEventListener('message', (e: MessageEvent<ViewerResponse>) => {
        const m = e.data;
        if (m.kind === 'progress' || m.kind === 'loading') return;
        // The map's sound comes in two answers, the data then its loops (`./worker`): the request is answered by the second.
        if (m.kind === 'sound') { sounds.set(m.id, m.data); return; }
        const done = waiting.get(m.id);
        if (done) { waiting.delete(m.id); done(m.kind === 'error' ? null : m); }
      });
      worker.addEventListener('error', () => { for (const done of waiting.values()) done(null); waiting.clear(); });
    }
    waiting.set(request.id, res);
    worker.postMessage(request);
  });
  const sounds = new Map<number, SoundData>();
  /** `./main`'s `askSound`: the map's sound data and its loops, of the same source, its path and archive (MATCH-SOUND). */
  const askSound = (path: string, archive: string): Promise<MatchAssets['sound']> => {
    const id = ++ids;
    return ask({ kind: 'sound', id, source, path, archive }).then((r) => {
      const data = sounds.get(id);
      sounds.delete(id);
      return data && r?.kind === 'soundLoops' ? { data, loops: r.loops } : null;
    });
  };
  let kept: { mission: string; assets: Promise<MatchAssets | null> } | null = null;
  const load = (mission: string): Promise<MatchAssets | null> => {
    if (kept?.mission === mission) return kept.assets;
    const path = missionMapPath(mission);
    const assets = path === null ? Promise.resolve(null) : Promise.all([
      ask({ kind: 'load', id: ++ids, source, path }),
      ask({ kind: 'play', id: ++ids, source, clips: MATCH_CLIPS }),
    ]).then(async ([m, p]) => {
      if (m?.kind !== 'map') return null;
      // `./main`'s `askEffects` once the map is in: of the same source, its path and archive.
      // and `askSound` beside it: the loading screen holds for both, as `/testroom`'s loading lanes do.
      const [e, sound] = await Promise.all([
        ask({ kind: 'effects', id: ++ids, source, path: m.map.path, archive: m.map.archive }),
        askSound(m.map.path, m.map.archive),
      ]);
      return { map: m.map, clips: p?.kind === 'play' ? p.data : null, effects: e?.kind === 'effects' ? e.data : null, sound };
    });
    // PR #631, the Xbox preset only (`releaseWorkerAfterLoad`): the worker let go once this load is in and no request
    // waits -- checked in the same turn as the terminate, so a request asked before it (another mission's load still
    // in flight) keeps the worker until its own settle, and one asked after it makes a fresh worker (`ask`).
    if (releaseWorkerAfterLoad) {
      const idle = (): void => { if (worker && waiting.size === 0) { worker.terminate(); worker = null; } };
      void assets.then(idle, idle);
    }
    kept = { mission, assets };
    return assets;
  };
  // IP3 (`LOAD_REPORT_AT_PREPARED_READING`): one match prepared ahead of its mount (`prepare`) -- the mount's own stage 1
  // (`prepareMount`), not a sibling of it -- or one being prepared.
  let prepared: PrepareJob | null = null;
  let preparing: PrepareJob | null = null;
  /** A job let go: its prepared mount's own teardown (`PreparedMount.drop`: the renderer, the canvas, the world, all of it). */
  const letGo = (job: PrepareJob): void => {
    job.stale = true;
    job.offLost();
    const m = job.mount;
    job.mount = null;
    m?.drop();
  };
  /** The prepared match let go, and one in the making at once (the review's F1: a compile that never ends keeps nothing). */
  const drop = (): void => {
    const jobs = [preparing, prepared];
    preparing = null;
    prepared = null;
    for (const job of jobs) if (job) letGo(job);
  };
  const prepare = (mission: string): Promise<void> => {
    if (options.hdPack?.()) return Promise.resolve();   // the review's F3: the world waits for the mount's HD collect
    if (prepared?.mission === mission) return Promise.resolve();
    if (preparing?.mission === mission) return preparing.done;
    drop();
    const job: PrepareJob = { mission, mount: null, done: Promise.resolve(), stale: false, audio: false, offLost: () => {} };
    job.done = (async (): Promise<void> => {
      const a = await load(mission).catch(() => null);
      const doc = options.doc ?? globalThis.document;
      if (!a || !doc || job.stale) { if (preparing === job) preparing = null; return; }
      let settle: (ok: boolean) => void = () => {};
      const ready = new Promise<boolean>((res) => { settle = res; });
      const audio = options.audio?.();
      try {
        job.mount = prepareMount(doc.body, {
          assets: Promise.resolve(a), renderer: options.renderer ?? pageRenderer, hidden: true, prepared: (ok) => { settle(ok); },
          ...(options.picture ? { picture: options.picture } : {}), ...(options.win ? { win: options.win } : {}),
          ...(audio ? { audio } : {}), ...(options.side ? { side: options.side } : {}),
        });
        job.audio = audio !== undefined;
      } catch (e) {
        console.warn('the match could not be prepared:', e instanceof Error ? e.message : String(e));
        audio?.release();
        settle(false);
      }
      // N1 (5d's ruling): a context lost on the prepared canvas before a mount takes it lets the prepared match go (the
      // mount then makes its own renderer) -- the one way, with a mount that cannot take it, a kept prepare is dropped.
      const canvas = job.mount?.canvas;
      if (canvas) {
        const lost = (): void => {
          if (prepared === job) prepared = null;
          if (preparing === job) preparing = null;
          letGo(job);
        };
        canvas.addEventListener('webglcontextlost', lost);
        job.offLost = () => { canvas.removeEventListener('webglcontextlost', lost); };
      }
      const ok = await ready;
      if (preparing !== job) return;                   // let go meanwhile (its teardown ran), or taken by a mount (N1)
      preparing = null;
      if (ok) prepared = job;
      else letGo(job);                                 // its renderer would not come: nothing kept
    })();
    preparing = job;
    return job.done;
  };
  /**
   * The job a mount of `o`'s mission takes: prepared, or still preparing past the load's bound (N1:
   * `PREPARE_WAIT_BOUND_ADAPTATION` keeps it for the mount) -- under the stage-1 inputs the mount is given (F3: never
   * under the HD picture; the same window and picture; the hand-off's audio, if any, only where the prepare has its own).
   */
  /**
   * The review's finding 3: the HD picture chosen in the lobby while a match is prepared or being prepared lets it go at
   * once -- the mount would refuse it (F3), and its own `picture.observe` would start the HD pack (the collect and the
   * served pack's fetches) for nothing. Watched from the loader's making, so this observer is told before any prepared
   * match's own (made later; the keeper tells its observers in the order they came); that one, still told from the
   * keeper's copy, is the gone mount's and does nothing.
   */
  const offPicture = options.picture?.observe(() => { if ((prepared || preparing) && options.hdPack?.()) drop(); }) ?? ((): void => {});
  const takes = (o: Omit<MatchMountOptions, 'assets'>): PrepareJob | null => {
    const job = [prepared, preparing].find((j) => j?.mission === o.handOff.mission && j.mount !== null) ?? null;
    if (!job || options.hdPack?.()) return null;
    if (o.win !== undefined && o.win !== options.win) return null;
    if (o.picture !== undefined && o.picture !== options.picture) return null;
    if (o.audio !== undefined && !job.audio) return null;
    if (o.renderer !== undefined || o.brighten !== undefined || o.forgeLighting !== undefined || o.gameMode !== undefined || o.extraWorld !== undefined) return null;
    return job;
  };
  return {
    load: (mission) => { if (kept?.mission !== mission) drop(); return load(mission); },
    prepare,
    holds: (mission) => (prepared?.mission === mission ? 'prepared' : preparing?.mission === mission ? 'preparing' : null),
    dropPrepared: drop,
    reseat: () => { (prepared ?? preparing)?.mount?.reseat(); },
    mount: (target, o) => {
      const job = takes(o);
      // Nothing prepared to take: the mount as before (the loader's renderer seam, when given, its default).
      if (!job?.mount) { drop(); return mountMatch(target, { ...(options.renderer ? { renderer: options.renderer } : {}), ...o, assets: load(o.handOff.mission) }); }
      // The prepared match taken whole: its stage 1 done (or still warming, N1), the hand-off's options attached to it --
      // its canvas shown, `join()` run; its close and release are its own (its canvas its own, removed by its teardown).
      const m = job.mount;
      job.mount = null;
      job.offLost();
      if (prepared === job) prepared = null;
      if (preparing === job) preparing = null;
      drop();                                          // any other mission's
      if (job.audio) o.audio?.release();               // the hand-off's audio unused: the prepared match plays on its own
      return m.attach(target, o);
    },
    dispose: () => { offPicture(); drop(); worker?.terminate(); worker = null; for (const done of waiting.values()) done(null); waiting.clear(); sounds.clear(); kept = null; },
  };
}

/** IP3: a prepare of one mission (`MatchLoader.prepare`): its prepared mount once made, its settle, whether it was let go. */
interface PrepareJob {
  mission: string;
  mount: PreparedMount | null;
  done: Promise<void>;
  stale: boolean;
  /** The prepare made the match's audio (`MatchLoaderOptions.audio`). */
  audio: boolean;
  /** The lost-context listener off its canvas (N1). */
  offLost: () => void;
}
