/// <reference types="vite/client" />
import { Matrix4, Scene, Vector3, type Object3D } from 'three';
import { freezeSceneMatrix } from './sceneMatrix';
import type { MapInfo } from '@s2u/archive';
import { sortByPopularity } from './mapOrder';
import { allowedMultiplayerMaps, emptyPickerStatus, parseMapAllowlist } from './multiplayerMaps';
import {
  gridCast, probeGround, selectFloor, spawnsFor,
  type HullCast, type Loadout, type Side, type Spawns,
} from '@s2u/scene';
import { FlyCamera, type Pose } from './camera';
import { createPageShot, type PageShot } from './forge/camera/pageShot';
import type { ViewerHook } from './hook';
import { createSoloTestroomTarget, soloJson, type SoloTestroomTarget } from './testroom/agent/target';
import { publishSoloAgentApi } from './testroom/agent/host';
import { createLiveLocalPackDrivers } from './testroom/agent/packs';
import { attestSoloAddress, modelPreviewAddress } from './testroom/agent/address';
import { LocalPackError } from './agent/localPacks';
import { packMap } from './texturePack';
import { viewerCommit } from './revision';
import type { CraneActionMiss } from './equipment';
import { devSeen } from './devSeen';                 // RE-5: the dev hook's read, a development build's only (folded below)
import { renderStats } from './renderStats';         // PRF-4: the dev hook's renderer counts, a development build's only
import { bodiesInView, followSeat, hashFrame, type FrameHashRenderer } from './frameHash';   // CPS.R9 (e): the dev hook's frame identity hash, a development build's only
import { frameDiag, frameState } from './frameDiag';   // cps-frame-hash-4: the gate's diagnosis (the frame's inputs, one switched off at a time), a development build's only
import type { LoadedMap, LoadStage } from './loadMap';
import { Overlays } from './overlays';
import { mountExperimentalGraphics } from './experimentalGraphics';
import { shouldReopenArmory } from './mods/armoryReopen';
import { mountModPanel } from './mods/panel';
import { installZombies } from './zombies/mode';
import { ZombieDeath } from './zombies/death';
import { createRenderer, PS2_FRAME, type Backend, type Presentation } from './renderer';
import type { LinkLog } from './linkLog';
import { rehearse } from './rehearsal';
import { ELF_DEFAULT_FOGCOL, fogForExtent, type FogSettings } from './fog';
import { brightenOf, DEFAULT_LIGHTING, type Lighting } from './lighting';
import { Ui, type SliderName, type ToggleName } from './ui';
import { buildWorld, type WorldView } from './world';
import {gxApplyProgress,mountLocalTexturePacks,packTargetFor,type LocalTexturePacks,type TexturePackTarget} from './texturePackRuntime';
import {HdServedPack,lazyHdPackDecoders} from './hdTexturePackServed';
import {pageHdStore} from './hdTexturePackStore';
import {ApplyFrames,hdTextures,rendererUploader} from './hdTexturePack';
import {PackApplier,pageTextureChoice} from './packs/pagePacks';
import {PackApplyOverlay,pagePlayLive} from './packApplyOverlay';
import { modelPackActive } from './modelPack';
import { mappedModelIds, mappedWorldPieceIds } from './modelPackHook';
import { bareWorldPieceWarnings, formatWorldPieceList, worldPieceLoadRequest, worldPiecesKeptLine } from './worldPieces';
import { createWorldSwap } from './worldSwap';
import { reportDecodeFailure, wireWorkerFailure } from './decodeFailure';
import { spreadAcrossFrames, type Spread } from './scheduler';
import { wantsTouchControls } from './touch';
import { groundGrid, probeLiftOf, WalkMode } from './walk';
import { flinchPose, RemotePlayers } from './remotePlayers';
import type { PlayClips } from './play';
import { chooseCharacterType, NetPage, retryDelayMs, type NetPageDeps } from './netPage';
import { LoopbackMatch, simClipsOfPlay, simMapOfLoaded } from './net/loopback';
import { campaignEntry, campaignInstrumentOn, campaignStand, campaignStemOf, type CampaignSpot } from './testroomCampaign';
import { PageSession, sessionKeyFor } from './net/session';
import { corpseShownS, DEATH_CLIPS, FLINCH_CLIPS } from './net/deaths';
import { explosionShake } from './look';
import { mergeInput, noInput, PadWatch, padInput, pressedSince, type Input } from './gamepad';
import { storeOf } from './mobileTip';
import { exchangeTaps, mountTip, mountTouch, promptDeviceOf, readsPad } from './matchTouch';
import { pageCard, pageIndexedDb, pageSettings, readLastMap, tabSettings, tipStoreOf, writeLastMap } from './pageStore';
import { Hud, ownHudName, spectatorHudView, validClientCount } from './hud';
import { keepClearWatch } from './hudMessagePanel';
import { servedRoomDetails } from './scoreboard';
import { HudVoiceElement, voiceHudFrame } from './hudVoice';
import { teamTagInput, teamTags } from './hudTags';
import { readNameTags } from './nameTags';
import { readRangeReadout } from './rangeReadout';
import { RegionCull } from './regionCull';
import { DoorPage } from './doorPage';
import { DOOR_CLIPS, openDoorClip } from './doors';
import { pushedWindowOf } from './net/flinchReload';
import { GatePage } from './gatePage';
import { CranePage } from './cranePage';
import { craneScene } from './craneHook';
import type { CancelCause } from './actionContext';
import { bareMeta, GLASS_FRAGMENTS_PLACEHOLDER, WorldState } from './worldState';
import { TacMap } from './tacMap';
import { ScoreboardKeys } from './scoreboardKeys';
import { mountRoundTextLine } from './roundTextLine';
import { rankOf } from './mapOrder';
import { buildBody, type BodyView } from './bodyView';
import { mountCharShadow } from './charShadow';
import { AdaptiveRatio, pixelRatioCap, watchViewport } from './matchViewport';
import { renderCapFor, videoSettingsKeeper } from './videoSettings';
import { lensColours, nightVisionRow } from './nightVision';
import { shownScopeNode } from './sights';
import { bodyForTeam, hitBodiesOfPage, OwnBody } from './teamBody';
import { hotkey } from './kit';
import { ownBodyRead, Play, playActions, StanceButton } from './play';
import { FrameTime } from './frameTime';
import { pageFrameSampler } from './frameSampler';
import { installClientErrorBeacon, pageClientErrorBeacon } from './clientErrorBeacon';   // CLIENT_ERROR_BEACON_ADAPTATION, part A (2026-11-05)
import { PlayUi, readPlayChoice, writePlayChoice } from './features';
import { devOverlayDrawn, devPanelLoadingKey, devToolsEnabled, spawnOverlayOn } from './devTools';
import type { DevPanel } from './devPanel';
import { FLY_PARAM, flyAccess, mayEnter, soloMatchOn } from './flyAccess';
import { extractionPoints } from './hostageMarks';
import { onlineChoiceAddress, readShare, updateAddress } from './shareUrl';
import { devBadgeLabel, devMode, devSwitches, startSource, tracerHold } from './source';
import { ephFrameOf } from './ephFrame';
import { EphPause } from './ephPause';
import { enterReplayWorld, replayWorldDeps, replayWorldHost } from './modern/replays/worldHost';
import { itemIcon, kitParam, PlayerLoadout } from './loadout';
import { padButtonsDown } from './weaponExchange';
import { mountExchange } from './matchExchange';
import { pressUnlessArmory, syncArmoryTouch, unlessArmory } from './armoryGlue';
import { frameOfClient } from './armoryView';
import { mountArmory } from './matchArmory';
import type { ArmoryData } from './armoryData';
import { handRoundScreenBitmaps } from './roundScreens';
import type { InputDevice } from './weaponSelect';
import { LOCAL_STACK_SERVER, NO_ROOMS_ROUTE, NO_SHARED_ROOM, onlineLine, onlineToast, pageIsLocal, readOnline, resolveOnline, roomRetryStatus, withRefusalMap, writeOnline, type OnlineChoice, type OnlineStatus, type OnlineTarget } from './online';
import { ownOriginRoomSocket, pinnedMatchSocket, roomKeyOf, roomPathOf, roomRefusalLine, STANDING_ROOM_CLASSIC_LINE, startRoomJoin } from './connectHost';
import { ServedMapsRead } from './servedMaps';
import { readRules, resolveRules, writeRules } from './rules';
import { roomsUrl } from './playersOnline';
import { multiplayerEnabled, onlineTarget, playersPoller, singlePlayerAddress, stripMultiplayerUi } from './multiplayer';
import type { Rules, Team } from './net/protocol';
import { PLAY_CLIPS } from './animator';
import { TRAVERSAL_CLIPS } from './traversal';
import { TURRET_CLIPS } from './net/emplacement';
import { TraversalPage } from './traversalPage';
import { gameAudio } from './audio';
import { mountSound } from './matchSound';
import { fallDeathLine, mountEffects } from './matchEffects';
import { WEAPON_CLIPS } from './weaponPose';
import { dropModels, heldOfItem, WorldDrops } from './drops';
import { pickupKitOf } from './net/pickupRules';
import { HostagePage } from './hostagePage';
import { orderCellOf, pickSurfaces } from './net/hostageOrder';
import { setActionPickLog } from './actionPage';
import { EQUIPMENT_SLOTS } from './equipment';
import { INVENTORY_MENU_KEYS_READING } from './inventoryMenu';
import { THROW_CLIPS } from './throwPose';
import { grenadePlace, mountThrowables } from './matchThrow';
import { refusalLine } from './matchMessages';
import { abortLines, MatchAbort } from './matchAbort';
import { mountTaunts } from './matchTaunts';
import { mountChat } from './matchChat';
import { mountVoice } from './voice/voiceClient';
import { pageCardMessages } from './messageSettings';
import type { TauntDevEditor } from './tauntDevEditor';
import { DEV_EDITOR_CLOSED, type DevEditorState } from './tauntDevState';
import { pageCardTaunts } from './tauntSettings';
import { matchOptions } from './matchOptions';
import { playOptionsOf } from './originalOptions';
import { localStartMenuOptions, playOptionsGlobals, sessionStartMenuOptions, StartMenu, type StartMenuOptions } from './startMenu';
import { NativeSettings, readNativeOptionsAssets } from './nativeSettings';
import { uiGpuSurfaceLoader, uiGpuSurfaceWiring } from './uiGpuSurfaceMount';
import { pageDeviceClass } from './deviceClass';
import { pageUiGpuSwitch, uiGpuDevBuild } from './uiGpuSwitch';
import { pageNativeOptionsState } from './nativeOptionsState';
import type { NativeOptionsState } from './nativeOptionsHost';
import { adoptPageOptions, liveStartMenuOptions, pageCardReads, pageEarlyCommits, screenOriginOf, teammateNamesValue, withPageHooks } from './playerSettings';
import { pagePicture } from './picture';
import { screenOriginKeeper } from './screenOrigin';
import { makeUiSoundHost, readUiSoundFiles } from './uiSoundHost';
import { BINOCULAR_CLIPS } from './binocularPose';
import type { ModDiscReply, SourceRequest, ViewerRequest, ViewerResponse } from './worker';
import { assetSourceFor, discOpener, isDiscRequest } from './discSource';
import { bootSource, indexVerdict, discOpened } from './discIndex';
import { GamePad } from './setupPad';
import { controllerStanceMode } from './startupSettings';
import { detailDistanceFor, readDetailDistance } from './detailDistance';
import { flushedPad } from './padFlush';
import { fireModeInputFor } from './fireModeInput';
import { keyboardSite } from './keyboardTesting';
import { kbmAllowed, testroomKbmPage } from './kbmScope';
import { pageMarks } from './loadBudget';
import { DiscChoice } from '@s2u/ui';
import { attachLoadingScreen } from './loadingPanel';
import { LoadingJoin, pageLanes, soloLoadHold, type LoadKind } from './loadingJoin';
import { LaneRequest, markWarmed, ownedStale, sceneViewFor } from './loadOwnership';
import type { Layout } from '@s2u/creator-contracts';
import { browserChannel, MODS_CHANNEL } from './packs/modsState';
import { CUSTOM_MAPS_OFFLINE_WORDS, CustomOffline } from './customOffline';
import { CustomProps } from './customProps';
import type { ContentOpen, ContentPropPlacement } from './testroomContent';
import { mountFirearm } from './matchFirearm';
import { pageSpawned } from './reticle';
import { matchNetDeps } from './matchNet';
import { playerLanes, type LaneParts } from './matchLanes';
import { actionHands, mountActions } from './matchActions';
import { bombSound, ownBombBody, worldPulse } from './bombPage';
import { withVictoryClips } from './victoryData';
import { drawnTurretParts, placementView } from './turretHook';
import { wrapYaw } from './yaw';
import { pageVideoReadout } from './perfLine';   // `window.__viewer.video`, a test instrument
import { brightnessOfVars, frameCanvas, setBrightness } from './brightness';
import { feedCamera, liftFog, mapFog, matchSide as sideOfMatch, setRemoteMap, standOf, TESTROOM_CAPABILITIES } from './matchCore';

/**
 * The load budget's phase marks (PLAT-29a, research 100): the first byte and the page start now, the disc chosen
 * (`openDisc`), the disc indexed (the worker's accepted map list) and the map's first frame (`show`'s world revealed)
 * as they happen; read by `window.__viewer.phases()`. Only a phase's first mark counts.
 */
const LOAD_MARKS = pageMarks(() => performance.now(), (performance.getEntriesByType?.('navigation') ?? []) as PerformanceNavigationTiming[]);

/** The served disc tree: `socomlegacy/public/maps/`, with its own `index.json` beside it. */
// The maps directory sits beside the page: `/maps` in dev, `/socomlegacy/maps` when served under a prefix.
const MAPS = `${import.meta.env.BASE_URL}maps`;
/** The map the viewer opens on, and the one the screenshot test asks for by name. */
const DEFAULT_ARCHIVE = 'MP2';
/**
 * The pixel ratio the native presentation may draw at: the device's, up to 2 on a desktop and 1.5 on a
 * phone, whose GPU is filling a screen a hand's width away. `AdaptiveRatio` lowers it further when frames run
 * long and raises it back when they do not (`./matchViewport`, PAR-12: the policy both pages run).
 */
const RATIO_CAP = pixelRatioCap(globalThis.devicePixelRatio, wantsTouchControls());
/** The game's own projection, framebuffer-wide: `tan(hfov) / tan(vfov)` at the authored half-angles. */
const PS2_ASPECT = Math.tan(0.6109) / Math.tan(0.4276);


const loadingJoin = new LoadingJoin();                     // the hold is decided per load at `begin` (MCW.R8, `soloLoadHold`)
let loadedSound = -1, loadedEffects = -1, loadedArmory = -1;
/** The worker's answer to the play request (`./loadingJoin` `JoinLanes.play`): clips, none (no `MOTION_P.ZAR`), or not yet. */
let playAnswer: 'clips' | 'none' | 'pending' = 'pending';

const canvas = document.getElementById('view') as HTMLCanvasElement | null;
if (!canvas) throw new Error('the page has no #view canvas');
frameCanvas(canvas);   // OPT-11 (research 358): the card's BRIGHTNESS on /testroom's picture

/** The page's query string, read once. */
const SEARCH = globalThis.location?.search ?? '';
/** The three dev switches. `?devmode` turns all three on (`./source`). */
const DEV = devSwitches(SEARCH);
/** EPH-2, a browser adaptation: the parity harness's read (`__viewer.ephFrame`) answers only with the bare `?devmode`. */
const EPH_ON = devMode(SEARCH);
/**
 * EPH campaign stand (`./testroomCampaign`; a browser adaptation, a development instrument with no original; the owner,
 * 2026-10-31): a development build's `/testroom?devmode` lists the campaign mission `?map=` names, loads it offline and
 * stands the player at its start. Off everywhere else -- the campaign is no game mode here (MISSION).
 */
const CAMPAIGN_GATE = { devBuild: import.meta.env.DEV, search: SEARCH, pathname: globalThis.location?.pathname ?? '' };
const CAMPAIGN_ON = campaignInstrumentOn(CAMPAIGN_GATE);
/** The address's `&at=` spot for a campaign stand, read through the development module (`./devSpot`), once. */
const CAMPAIGN_ASK: Promise<CampaignSpot | null> | null = import.meta.env.DEV && CAMPAIGN_ON   // folded away in a release
  ? import('./devSpot').then((m) => m.readDevSpot(SEARCH)).catch(() => null) : null;
let campaignAsk: CampaignSpot | null | undefined;
/**
 * The DEV badge (`setup/index.html` `#dev-badge`): a chip on the left edge naming the switches that are on. Hidden in the markup,
 * and left hidden when none is on, so a page with no dev switch never shows it. The stylesheet hides it again while the
 * original loading screen is up, and in the PS2 picture places it inside the 4:3 frame.
 */
const devBadge = document.getElementById('dev-badge');
const devLabel = devBadgeLabel(DEV);
if (devBadge && devLabel) {
  const word = devBadge.querySelector('.s2u-chip__word');
  if (word) word.textContent = devLabel;
  devBadge.hidden = false;
}
/**
 * MU-11 (MU.R9; `./modern/replays/worldHost`): the modern replay viewer's world -- this page framed by the viewer with
 * `replayview` and its host on the frame element (same origin only); null otherwise, and then nothing below changes.
 */
const REPLAY_WORLD = TESTROOM_CAPABILITIES.replay ? replayWorldHost(globalThis.window, SEARCH) : null;
/**
 * The shareable settings the address carries (owner, 2026-09-29; `./shareUrl`): `mode`, `map`, `view`, `online`. On load
 * they beat the remembered choices; each is written back into the address as it changes, so the address is a link to
 * this setup. The retired `redotcom` and `rules` are ignored and rewritten out (`RETIRED_PARAMS`).
 */
const SHARE = readShare(SEARCH);
/**
 * MULTIPLAYER, the build's switch (owner, 2026-09-30: the site's redotcom ships "with multiplayer disabled";
 * `./multiplayer`): `VITE_S2U_MULTIPLAYER=off` (a static-only build) takes the
 * Online section out and makes the kicker the product's name, before `Ui` reads the page; the address's `online`, `mp`
 * and `server` are taken out; no server is joined and no `/rooms` is asked. The offline match stays. On by default.
 */
const MULTIPLAYER = multiplayerEnabled(import.meta.env.VITE_S2U_MULTIPLAYER as string | undefined);
if (!MULTIPLAYER) {
  stripMultiplayerUi();
  updateAddress(singlePlayerAddress());
}
/**
 * Playing as a SEAL (walk mode, the body, the rifle, the HUD) is reCOM mode (`./features`; the owner 2026-09-28 and
 * 2026-09-29): the settings' Mode switch, always on the page ("&redotcom can die now. The mode replaces it"), remembered,
 * `mode=` in the address over the memory, Explore by default. Off, the play's markup is out of the
 * page (`PlayUi`, put back when it is switched on) and nothing binds `G`, the pad's Start, `R` or the hook's walk: the
 * page is the fly camera alone. Switched at run time, both ways (`setPlayMode`), without a reload -- a reload would lose
 * the visitor's disc image.
 */
let playOn = REPLAY_WORLD ? false : (SHARE.play ?? readPlayChoice() === '1');   // MU-11: framed as the replay's world, a watcher
/**
 * Offline, reCOM mode plays the match on its own (`./net/loopback`). `&nomatch` keeps the free walk, and `&fly` with
 * `?devmode` does too (`./flyAccess` `soloMatchOn`). Read here: the crane page holds the hull at the disc rest while
 * this is on, before the room exists (`followsMatch`).
 */
const SOLO_MATCH = soloMatchOn(SEARCH);
/**
 * The free camera in Play is the developer's alone (owner, 2026-09-29; `./flyAccess`): without `?devmode` there is no
 * Fly / Walk switch, `G` and the pad's Start do not toggle, the hook refuses fly, and `&fly` is ignored and taken out of
 * the address. With it, `&fly` keeps the free camera when reCOM mode opens (the tests that measure the fly view ask).
 */
const FLY = flyAccess(SEARCH);
const FLY_START = FLY.startInFly;
if (!FLY.toggle) document.getElementById('mode')?.remove();   // before `PlayUi` and `Ui` see the page
/** reCOM mode opens on foot (owner, 2026-09-29): the map's walk starts once it is ready. Later maps keep the mode. */
let startedWalk = false;
function startInWalk(mapName: string): void {
  if (!playOn || FLY_START || startedWalk) return;
  let tries = 0;
  const attempt = (): void => {
    if (startedWalk || loaded?.name !== mapName) return;     // entered already, or another map was picked
    if (!playOn) return;                                        // Explore was chosen meanwhile
    if (walk.mode() === 'walk' || walk.setMode('walk')) {
      startedWalk = true;
      if (import.meta.env.DEV) consumeDevSpot();   // a spot in the address, once the walk can stand
      return;
    }
    // The body and clips may still be on their way (~5 s); past that, a slower try once a second for a minute, since a
    // player in Play has no other way onto their feet (no G without `?devmode`, `./flyAccess`). A map with no floor to
    // stand on never allows it, so the tries end there rather than run for the life of the page.
    if (++tries < 300) requestAnimationFrame(attempt); else if (tries < 360) setTimeout(attempt, 1000);
  };
  attempt();
}
/** The play's markup, taken out and put back with the mode (`setPlayMode`); everything is wired while it is on the page. */
installClientErrorBeacon(window, pageClientErrorBeacon());   // CLIENT_ERROR_BEACON_ADAPTATION, part A: a no-op after `./entry`'s install (one a window); kept for a page served without it
const playUi = new PlayUi();
const ui = new Ui();
const scene = new Scene();
freezeSceneMatrix(scene);   // CPS H13: composed once, auto-update off (`./sceneMatrix`: the walk's forced multiplies)
const fly = new FlyCamera(canvas, {
  kbm: testroomKbm,                                // RB-8 (OT.R114, RB.R4): the keys and the mouse in every build while offline
  onSpeedChange: (m) => ui.setCameraHint(m, fly.isLocked()),
  onLockChange: (locked) => ui.setCameraHint(fly.multiplier(), locked),
  onFire: (down) => trigger(down),
});
const overlays = new Overlays(scene);
/** The developer panel (`./devPanel`), present only after its development-build import resolves. */
let devPanel: DevPanel | null = null;
/** The panel key during the loading screen, before that import has resolved: opened once the panel mounts. */
let devPanelQueued = false;
/**
 * The panel's clock (`./devClock`). Identity until that development import replaces it, so a release frame is the
 * real `dt` and the replay clock is untouched. A browser adaptation, a development instrument with no original: at
 * 1x (its start) it returns the frame's own seconds bit for bit (`devPanelGate.test.ts`).
 */
let scaleDt = (dt: number): number => dt;
/** Places `at` / `yaw` from the opening address, once. A no-op until the panel's development import installs it. */
let consumeDevSpot = (): void => {};
/** Drops the developer panel's bullet traces. A no-op until that import installs it. */
let clearDevTraces = (): void => {};
/** Draws the panel's traces while it is open and their switch is on (`devOverlayDrawn`). A no-op until that import. */
let drawDevTraces = (): void => {};
/** Refills this page's magazines when the panel asked and a shot emptied one. A no-op until that import. */
let devAfterFire = (): void => {};
/** Its markers toggle. The settings checkbox's spawns stay independent (`spawnOverlayOn`). */
let devMarkersOn = false;
/**
 * Walk mode (W1.4, `./walk`): `G` and the panel's switch; the mover steps at 60 Hz and the game's third-person camera
 * follows it (W2.1, `./playerCamera`); the zoom's views past third person -- first person, the night vision, the scope --
 * are drawn from the head (first person restored by the owner, 2026-10-01).
 */
const walk = new WalkMode(fly, (on) => ui.setWalk(on));
walk.modeKey = FLY.toggle;                            // G: the developer's in Play (`./flyAccess`)
ui.setFlyToggle(FLY.toggle);
/**
 * Web research 86 (`./traversalPage`): the ladder, the climb, the peek and the water on the walk; X, Q and E, the pad's
 * Cross and d-pad sides. The clips' callbacks sound through `Play.onEvent`; the slide's loop and landing through these.
 */
const traversal = new TraversalPage(walk, {
  slide: (at) => { sound.ladderSlide(at); },   // PAR-89 (research 305 s3): the slide's loop, held by `soundFrame`; OBF-7: let go under the round screens
  land: (speed, at) => { sound.ladderLand(speed, at); },
});
traversal.bindKeys(globalThis, testroomKbm);
// The ARMORY holds the input while it is open (web sprint 5; the S3 review): the peek and the action keys do nothing.
traversal.keysOpen = () => !armory.isOpen() && !loadingJoin.blocked && !inventory.isOpen();   // X: no action while the R2 menu is open
/**
 * The map's doors (`./doorPage`, socomlegacy/docs/research/92-doors.md): the action button on the door under the reticle swings
 * it -- here, or on the server in a match -- its leaf drawn and its polygons turned with it, its sound played.
 */
const doors = new DoorPage({
  grid: () => walk.grid(),
  feet: () => walk.feet(),
  aim: () => walk.fireAim(),
  sound: (name, at, volume) => { audio.play(name, at, 'play', volume); },   // the command's flag-0x10 volume
  move: (path, delta) => { view?.moveNode(path, delta); },
  net: () => (net && net.client.state === 'open' ? net.client : null),
  press: () => traversal.actionPress(),          // LATER 362: the action button's chased press, the kick's pick
  // DOORS (research 92 section 2): the own press with no room -- the program's `Open door` on the own body, as the
  // room's `motion` event plays it in a match (`./netPage`): through the walk, its cut window from the walk's own next
  // command (#485's review F4), no reload gate (the push sets no motion flag 0x4).
  pushClip: (type) => {
    const clip = openDoorClip(type, firearm.item() === 'pistol');   // LATER 362b F4: the kick's pistol pair
    if (!clip) return;
    const at = performance.now();
    // #485's review F4: the stick cuts it past its NoInterrupt here too -- its window from the walk's own commands.
    // The door-open body hold (research 92 section 2): `clip` holds the body while the window is on top (`./walk` `pushedTop`).
    walk.setFlinchPose(() => flinchPose(clip, (performance.now() - at) / 1000, playClips), pushedWindowOf(walk.nextCommand(), clip, playClips), { reloadGate: false, pushed: true, clip });
  },
});
/**
 * MAP-07 (`./gatePage`): Death Trap's and Enowapi's lever gates. The switch prompt is the action's; the slide is the
 * room's, followed from the snapshot's door tail and drawn here. The lever handle is not drawn.
 */
const gates = new GatePage({
  move: (path, delta) => { view?.moveNode(path, delta); },
  net: () => (net && net.client.state === 'open' ? net.client : null),
});
/** Chain Reaction's hooks (`./cranePage`, research 176 §9): the room's phase, the hull and the drawn node. */
const cranes = new CranePage({
  move: (path, delta) => { view?.moveNode(path, delta); },
  spin: (path, angle) => { view?.spinLocalX(path, angle); },
  active: (path, on) => { view?.setNodeActive(path, on); },
  net: () => (net && net.client.state === 'open' ? net.client : null),
  // The presentation run tests crane_vN and writes nothing (PF.R26). The snapshot's valve is what it should see.
  valve: (name, v) => { pageWorld?.setValve(name, v); },
  // The offline room forks the walk hull when the armory closes. Until its snapshot arrives the hull stays at the
  // disc rest, including while `net` is still null (`./cranePage`).
  followsMatch: () => playOn && SOLO_MATCH,
});
/** A cancel of the action button's hold (a port rule, research 214 s4): nothing fires, the release after it neither. */
function cancelAction(cause: CancelCause): void {
  acts.cancel(cause);
}
/**
 * LATER 76: whether the match's DEV keys hand a key to the ARMORY (their own test: Play mode, past the loading hold, the
 * ARMORY open); the round text line yields Enter only then, so a key the ARMORY will not take opens the line instead.
 * `armory` is declared further down (`armoryPart`, below); the closure is first called at a key, after the module ran.
 */
const armoryTakesKeys = (): boolean => playOn && !loadingJoin.blocked && armory.isOpen();
/** The in-game HUD (`./hud`, research 87): the ammo box, the compass, the prompts -- a pass after the reticle's, walking only. */
const hud = new Hud();
// KEYBOARD-WHISPER (OT.R48, OT.R43; research 266 §3.9): the online round's USB-keyboard line, online while a server's room holds the
// page (not its own LoopbackMatch); no lobby session here, so a whisper is echoed and unsent (FUN_002f4860 with the lobby down).
mountRoundTextLine({ hud, win: window, online: () => net !== null && !solo && !REPLAY_WORLD, whisper: () => { /* the lobby down: nothing sent */ }, actors: () => net?.rows ?? [], sender: () => (net ? { id: net.client.id, spectator: net.client.role !== 'player' } : null), menu: () => armoryTakesKeys() || exchange.isOpen() || inventory.isOpen() || (tauntDev?.isOpen() ?? false) });   // LATER 76; ROUND-LINE-YIELDS (#260): a closed DEV line leaves Enter to an open menu; LATER 183: the SETUP TAUNTS editor is one (its listener loads after this)
/** SOCOM II's tactical map (`./tacMap`, research 87 §9): `M` while walking (SELECT on the console), in the HUD pass. */
const tacMap = new TacMap(() => walk.mode() === 'walk' && !armory.isOpen() && !loadingJoin.blocked);
tacMap.bindKey(globalThis, () => fly.pose().yaw, testroomKbm);
tacMap.onToggle = (open) => hud.setTacMapOpen(open);
/** The multiplayer round's scoreboard (research 87 §12): SELECT held on a pad, Tab held on the keyboard, walking only. */
const scoreboardKeys = new ScoreboardKeys(() => walk.mode() === 'walk' && !armory.isOpen() && !loadingJoin.blocked);
scoreboardKeys.bindKey(globalThis, testroomKbm);
const feetXZ = (): [number, number] | null => { const f = walk.feet(); return f ? [f[0], f[2]] : null; };
hud.setOverlay((frame, sizes) => {
  const tac = tacMap.layout(frame, loaded?.tac ?? null, feetXZ() ?? [0, 0], fly.pose().yaw, sizes);
  // WEAPON EXCHANGE and the dead's prompt (web sprint 4, M8; `./weaponExchange`), over the in-round HUD on layer 1.
  const ws = exchangePart.overlay(frame, sizes);
  // The R2 inventory alive (`./inventoryMenu`), on the same layer.
  const inv = inventory.draw(frame, sizes);
  const chat = taunts.draw(frame, sizes);               // TAUNTS (`./matchTaunts`), on the same layer
  const menu = startMenu.draw(frame, sizes);            // MATCH-01: the START menu (`./startMenu`), over them
  if (!ws.quads.length && !inv.quads.length && !chat.quads.length && !menu.quads.length) return tac;
  return { quads: [...(tac?.quads ?? []), ...ws.quads, ...inv.quads, ...chat.quads, ...menu.quads], tris: [...(tac?.tris ?? []), ...ws.tris] };
});
/**
 * The runtime kit (web sprint 4, M3/M4; `./loadout`): the `Loadout` on the body -- the character type's
 * `default_weapons` at each spawn (the map's first `navyseals` type offline; the match's side online), a pick
 * (`setLoadout`, the menu's path) at the next -- and the two firearm slots' records, models and icons that follow it.
 * The developer's `&kit=<ids>` (with `?devmode`) is every spawn's pick: what a test that pins a weapon asks for.
 */
const loadouts = new PlayerLoadout();
loadouts.setDevKit(DEV.tools ? kitParam(SEARCH) : null);
/** The page's side in the match (`NetClient.team`), a SEAL offline and before the welcome. */
const matchSide = (): Side => sideOfMatch(net);
/**
 * The match's sound (`./matchSound`, MATCH-SOUND: research 222 §7), the one both pages mount, on the page's `gameAudio`:
 * the fall table, the walk's sounds, the others' footfalls, the firearm's, the ringing ears, the round's cues (INT.R7)
 * and the sound part's `NetPage` hooks.
 */
const sound = mountSound({
  audio: gameAudio, walk, fly, loadouts, side: matchSide, seat: () => net?.client ?? null, hud, nameOf: (id) => net?.displayNameOf(id) ?? null, others: () => remote,
  screenUp: () => net?.screenUp() ?? false,   // OBF-7: the page's own body not heard under the round screens (ROUND_SCREENS_SILENCE_WALK_READING)
  // AMB-1: TESTROOM_FLY_AMBIENCE_ADAPTATION (`./walkSounds`) -- the free-fly viewer with no match holds the beds off; in a
  // match (a `NetPage`: online, solo, a replay) they play in every view, the dead cycle's included (research 81 §10)
  ambienceOff: () => net === null && walk.mode() !== 'walk',
});
const { roundAudio, ears } = sound;
/**
 * WEAPON EXCHANGE in the match (web sprint 4, M8/M9; research 94 part 2): the one part both pages mount (`./matchExchange`,
 * PAR-1: research 253) -- opened dead in the match by the pad's R2, the key `I` or the touch button; each confirm adds
 * the pick to the side's list (`PlayerLoadout.confirm`) and sends the list as the `loadout` request -- through the
 * page's own room offline, the server's socket online (protocol 7) -- whose answer is the kit shown and spawned with at
 * the next round (R94.3). Its names are destructured from the part, so the keys, the touch button and its taps (PAR-5's),
 * the ARMORY's ownership and the hook read them unchanged.
 */
const exchangePart = mountExchange({
  net: () => net, map: () => loaded, side: matchSide, loadouts, win: globalThis,
  walking: () => playOn && walk.mode() === 'walk', device: () => promptDevice(),
});
const { menu: exchange, input: exchangeInput, refresh: refreshExchange, gate: exchangeGate, prompt: promptInfo } = exchangePart;
/**
 * The pre-round ARMORY (web sprint 5 S3, W5.R1-R4; `./armory`): opened on a seat the room opens it on (the welcome's or
 * the promotion's `armory`: a first seat, a ghost's, a waiting room's, a promotion's; `ARMORY_SEAT_READING`) and offline
 * before the page's own room is made (once a map) -- nowhere else: in a match nothing opens it (the owner's ruling of
 * 2026-10-02, INT.R3; the Inventory button is the swap's alive and WEAPON EXCHANGE's dead); popup 47 5 s before the
 * next round, the round's start closing it (S7). Live: each change goes through S2's seam as it is made (`./matchArmory`, debounced within the room's loadout
 * budget); leaving flushes the last and tells the room (`NetPage.armoryDone`: the held seat's first spawn).
 * `&noarmory` (with `?devmode`) keeps it shut, for the specs that play a match without it.
 */
const NO_ARMORY = DEV.tools && new URLSearchParams(SEARCH).has('noarmory');
/**
 * PAR-2: the screen, its live send (`./armorySend`: one change per `ARMORY_SEND_DEBOUNCE_MS`, at once in the round-end
 * interval's last `ARMORY_SEND_NOW_S`, dropped at a round's start -- ARMORY_ROUND_START_RACE_READING), its two round ends
 * (`./armoryGlue`: a round's start drops a pending change and closes the screen; an abandon sends it and leaves the
 * screen open -- ARMORY_ABANDON_READING), its world, its open and its change through S2's seam are the one part both
 * pages mount (`./matchArmory`). Its names are destructured from the part, so the keys, the pad, the taps, the loading
 * lanes and the hook read them unchanged. /testroom's adapters: `&noarmory` and Play mode, the offline room's title bar
 * (blank), its device, its two clears, the pointer lock let go, and the offline room made when the screen is left.
 */
const armoryPart = mountArmory({
  net: () => net, map: () => loaded, side: matchSide, loadouts, answer: (kit) => { exchange.answer(kit); },
  playing: () => !NO_ARMORY && playOn,
  // The title bar (`armoryNames`): online the match server's name over the room's (the map's, ARMORY_GAME_NAME_READING;
  // ARMORY_SERVER_NAME_READING), offline both blank.
  online: () => !solo,
  // The UI bank's sounds (`HUDUI.bnk`, research 95 §3.9), without a place: the menu's, as the goggles' (vtable+0xc);
  // the typed description's tick as one voice, started again at each glyph (`GameAudio.restart`).
  audio: { play: (name, at) => audio.play(name, at), restart: (name) => audio.restart(name) },
  store: storeOf(() => localStorage),
  device: () => promptDevice(),
  opened: () => {
    fly.setInputSuspended(true);                    // the game's input is the screen's from this frame (the S3 review)
    try { globalThis.document?.exitPointerLock?.(); } catch { /* not locked */ }
  },
  // W5.R1: the offline match's room, made when the ARMORY it opened on first is left (before the first spawn).
  done: () => { const go = soloAfterArmory; soloAfterArmory = null; go?.(); },
  warm: () => { void warmArmory?.(); },             // its programs linked before it first draws (S3 part 2)
  clearDecals: () => { fire.clearMarks(); effects.clearFootprints(); traversal.clearRipples(); remote.clearWakes(); },   // PAR-10: the ripples too, the others' with them
  // The throwables' own round start (`./matchThrow`, as the front end's `roundClear`): the air, the scorches and the
  // flashbang's wash -- a blind set off in the last round does not run on into the next (LATER 12, research 222 §8).
  clearAir: () => { throws.roundStart(); drops.reset(); startMenu.roundStart(); regionCull.reset(); },   // LATER 415 F2   // PF-34: the drops go with the air (DROP_LIFETIME_PLACEHOLDER)
  deadZone: () => fly.lookOptions().stick.deadZone,   // LATER 408: CONTROLLER OPTIONS' DEAD ZONE, the flick read through it
});
const { armory, view: armoryView } = armoryPart;
globalThis.addEventListener?.('pagehide', (e) => { if (!(e as PageTransitionEvent).persisted) armoryView.dispose(); });
// The match's socket is closed cleanly as the page goes (`NetPage`'s pagehide: the room drops the seat at once); a page
// the browser brings back from its back-forward cache joins afresh.
globalThis.addEventListener?.('pageshow', (e) => { if ((e as PageTransitionEvent).persisted && loaded && net?.closedByPage()) connectNet(loaded); });
/** The offline match's room, made when the ARMORY it opened on first is left (W5.R1: before the first spawn). */
let soloAfterArmory: (() => void) | null = null;
/** The map the offline ARMORY has opened on (once a map entry: a late clips load's new room does not open it again). */
let armoryEntry: LoadedMap | null = null;
/**
 * The ARMORY's disc data, asked of the map's source once it is shown (`./armoryData`). The UI models and their textures
 * are the same for every map: asked for once, kept by the view across map changes (`ArmoryView.setModels`).
 */
const armoryLane = new LaneRequest();   // LATER 440: a reply answers for the load it was asked for (`./loadOwnership`)
function askArmory(from: SourceRequest, path: string, archive: string): void {
  ask({ kind: 'armory', id: armoryLane.ask(++requests, shownLoad), source: from, path, archive, models: !armoryView.hasModels() });
}
/** The ARMORY's data landed: kept, and the screen opened if a seat or the offline match waited for it (`./matchArmory`). */
function armoryData(data: ArmoryData | null): void {
  // PF.R22: the round screens' backdrop and panels, UIMP's copies from this same decode, kept by the HUD across maps
  // (`./roundScreens` `handRoundScreenBitmaps`, PAR-3: the hand-off both pages call).
  handRoundScreenBitmaps(hud, data);
  armoryPart.setData(data);
}
/**
 * The device the prompt's `%c` is drawn for: a pad's R2 when one is connected, the touch label on a touch screen, else
 * the key in a development build and the pad in a release (OT.R29: a release has no key; LATER 132).
 */
function promptDevice(): InputDevice {
  return promptDeviceOf(pads.count(), import.meta.env.DEV ? 'keyboard' : 'pad');   // PAR-5: the rule both pages read (`./matchTouch`)
}
// ---- W2.2b: the play mode -- the walk with the body, the game's clips on the mover (`./play`, `./animator`) ---------
/**
 * The body and its clips: the map's body (`show`), the source's clips (`RUN/MOTION_P.ZAR` and `motion.rdr`, asked of
 * each source once its map list is in, as the seal table is), stepped once a frame after the walk. Without the pack
 * the body stands in its bind pose; the W2.1 body switch shows it in fly mode.
 */
const play = new Play();
/**
 * The throwables, the launcher and the R2 inventory (`./matchThrow`, MATCH-THROW: research 222 §8): the one part both
 * pages mount -- the grenades and charges (`./grenade`, research 85: `3`/`4`/`5` the kit's equipment slots, the pad's R2
 * inventory, the trigger throws), the LAW and the RPG-7 (`./rocket`), the throw's clip on the body (`./throwPose`), the
 * flashbang's blind (`./flash`) and `CWeaponSel` (`./inventoryMenu`). Its sounds are the match's (`./matchSound`), its
 * effects the firearm's, made below (read at a call).
 */
const throws = mountThrowables({
  scene, walk, fly, play, loadouts, view: () => view, map: () => loaded, net: () => net, firearm: () => firearm,
  audio: sound.audio,
  refuse: refusalLine(hud),                           // PAR-36 (c): the claymore refused on the HUD's message line (0x65f880, colour 2), matchMount's line
  world: () => pageWorld,                             // SUP-03: C4's targets are the page's world's destructibles
  warning: (r) => { sound.grenadeWarning(r); },       // research 304: a teammate's spoken warning
  remoteKit: (owner) => remote.playerKit(owner),       // M203-FIRE-SOUND: another's launch report from its kit (research 94 §C4.5)
  simTick: () => solo?.room.tick,                     // research 209 §18: the in-page room's tick, the C4 fallback's clock
});
const { grenade, rocket, throwPose, whiteOut, inventory } = throws;
const { takeSlot, selectEquipment, inventoryCurrent, equipmentIcon, equipmentMagazine, equipmentName } = throws;
/** PF-34 (`./drops`, research 234 s5, s6): the room's dropped weapons and bundles on the page (the world drops' part). */
const drops = new WorldDrops(dropModels(scene, () => loadouts.tables(), (m) => view?.held(m)?.clone() ?? null, () => pickupKitOf(loadouts.loadout(), loadouts.tables(), (s) => firearm.heldRounds()[s]?.rounds ?? 0, grenade.stats().leftByItem, grenade.stats().equipmentSlots), (item) => { const h = heldOfItem(item); if (h) play.dropHeld(h); }));   // NU-5 L1: the kit for the launcher's offer; OBF-15: the own death's drop off the own body
/**
 * The firearm (`./matchFirearm`, ONE-WIRE: research 222): the one both pages mount -- the fire (W2.5, `./fire`: the
 * trigger a left click while the mouse is captured or the touch fire button, `R` the reload), the gunplay (research 84:
 * the bloom, its fire modes on `B` / L3, the view states the right button and the d-pad step), the kit's two firearms
 * and the swap (WEAPON, `./kit`: L1 / `1` the primary, L2 / `2` the secondary until the R2 inventory puts other slots
 * there), the reticle and the range finder, the rounds' effects and the lenses. `/testroom`'s equipment plugs into it
 * (`hands`: the throwables, the launcher, the turret, the R2 inventory) and its sound (`sound`).
 */
const firearm = mountFirearm({
  scene, fly, walk, play, hud, loadouts,
  // The others are made further down (their footfalls are the sound's): lent through closures, read at a round.
  remote: { aimDistance: (eye, ray, reach) => remote.aimDistance(eye, ray, reach), weaponFrame: (id) => remote.weaponFrame(id), aimBodies: (eye, dir, reach) => remote.aimBodies(eye, dir, reach), teamOf: (id) => remote.teamOf(id), feet: (id) => remote.feet(id), neckAt: (id) => remote.neckAt(id) },
  view: () => view, map: () => loaded, body: () => body, net: () => net,
  // The loading hold and the ARMORY hold the input (web sprint 5 S3); WEAPON EXCHANGE open holds the trigger too (Chris's
  // fa657438, research 300 §3: no consumed press becomes a shot; its held buttons after the close are `ExchangeInput`'s).
  blocked: () => loadingJoin.blocked || armory.isOpen() || exchange.isOpen() || taunts.isOpen(),
  refreshFog: (lens) => { fogLens = lens; refreshFog(); },
  // In a match the room's spawn names the kit (protocol 7: its pick, R94.3); only no match takes the page's pick.
  network: () => !!NET.url,
  hands: throws.hands(actionHands(() => acts)),   // PAR-55: the action part's, asked at each call (made after the firearm)
  sound: sound.firearm,                             // the rounds and reloads, the effects' door, the goggles, another's report
  mountedMuzzle: (id) => acts.turrets.muzzleOf(id),   // MAP-10b: a mounted body's rounds leave the turret's firepoint
  vibration: () => startMenu.values().vibration,   // CTL-2: VIBRATION (DAT_00650698) as the START menu and the card leave it
  menuOpen: () => startMenu.isOpen(),   // CTL-2 (the review's F2): FUN_00204a40 stops the motors and the pulse
});
const { fire, zoom, accuracy, kit, reticle, effects, rangeFinder } = firearm;
effects.holdTracers(tracerHold(SEARCH));   // a dev instrument, not the original's: `?devmode&tracerhold` keeps a tracer at its end; off without that flag (research 89 §19)
// PAR-10 (research 257 s3, research 250 s9): the water's splash and wading ripples are the traversal's own keeper's
// (research 86 s5.4, `FUN_005b52b0`) on the firearm's effects -- both pages' one path; `traversal.effectsFrame()` each frame.
traversal.setEffects(effects);
const { setZoom, stepZoom, switchFireMode, showFireMode, selectFirearm, shoulderGate, kitFree, hangKit, spawnKit } = firearm;
/**
 * TAUNTS (`./matchTaunts`, web research 301) and TACTICAL ORDERS and MESSAGES (`./matchChat`, research 302): the Chat
 * menu, the parts both pages mount; the five taunts and the five messages the page's card's.
 */
let cardTaunts = pageCardTaunts(), cardMessages = pageCardMessages();
const chat = mountChat({
  net: () => net, hud, audio: sound.audio, messages: () => cardMessages, side: matchSide, character: (s) => loadouts.type(s),
  voice: () => voice,   // MATCH-05 (note 227 §2.4): RADIO and TEAMMATES' rows through the voice client, mounted below
});
const matchAbort = new MatchAbort();
const taunts = mountTaunts({
  net: () => net, hud, audio: sound.audio, custom: () => cardTaunts, release: () => { grenade.cancelMenuHold(); fire.release(); },
  otherMenu: () => loadingJoin.blocked || armory.isOpen() || exchange.isOpen() || inventory.isOpen() || !!tauntDev?.isOpen(), entries: chat.entries,
  runAndTalk: () => startMenu.runAndTalk(),   // MATCH-01: RUN AND TALK as the START menu leaves it
  aborting: () => matchAbort.aborting(),
});
// MATCH-01 (research 266 §8): the in-round START menu (`./startMenu`), the front end's match's too. No session here: its
// writes kept over the card's stored options (`localStartMenuOptions`), which the page's `matchOptions` reads below.
let menuCaptions: Record<string, string> | null = null;
let pageOptions: NativeOptionsState | null = null;
// RB-16 (PS-4; a browser adaptation, OT.R114's "all of their settings being functional in there"): SCREEN POSITION on the
// test room's canvas (`#view`, `./screenOrigin` SCREEN_ORIGIN_ADAPTATION) -- the card's origin at the start and at each
// valve's card write while native Options is not up, native Options' own at each StoreOptions (`pageHooks`).
const screenOrigin = screenOriginKeeper(document, window);
function layCardOrigin(): void {
  const { x, y } = screenOriginOf(pageOptions?.valves ?? cardReads.valves());
  screenOrigin.set(x, y);
}
// RB-16 (RB-3's inline reads moved, PS-1): the page card's OPTIONS, four masters, BRIGHTNESS and valves (`./playerSettings`)
const cardReads = pageCardReads(undefined, undefined, { valvesChanged: () => { if (!pageOptions) layCardOrigin(); } });
layCardOrigin();
// RB-16 (PS-4): native Options over the test room lays SCREEN POSITION and takes VIDEO MODE's picture -- the page's one
// picture (`./picture` `pagePicture`), which the test room's look follows (`ui.onLook` below) -- as the front end's does.
const pageHooks = { screenOrigin: (x: number, y: number) => { screenOrigin.set(x, y); }, picture: pagePicture() };
const localMenuOptions = localStartMenuOptions(playOptionsGlobals(() => cardReads.options()));
const stopEarlyHome = pageEarlyCommits(pageCard, {   // RB-3 (`./playerSettings`): Home writes before native Options exists
  live: () => !!pageOptions, local: localMenuOptions, tuners: () => cardReads.tuners(),
  reread: () => { cardReads.rereadTuners(); },   // first successful tuner save can create a previously absent card manager
  adopt: (made) => { cardReads.adoptTuners(made); },   // PR #765: a fresh card's first staged step, heard before its save
});
const liveMenuOptions = (): StartMenuOptions => pageOptions ? sessionStartMenuOptions(() => pageOptions!.globals, () => pageOptions!.valves) : localMenuOptions;
const startMenuOptions: StartMenuOptions = liveStartMenuOptions(liveMenuOptions);
// MLS.R1/R7: the same native Options pages as the home menu, hosted over this match. Lazy state initialization
// runs only after a still-current read, once per page; no new front-end, default reset, or network registration.
// GM-19b (the GPU menus plan; GM.R8, GM.R18): the test room's overlay on its GPU surface as the match's (`./frontEnd`), but
// reading `overlay.sd` at any scale -- it has no HD (`resolveTestRoomOverlay`); the surface imported only when it presents.
// GM-XBOX1 (`UI_GPU_XBOX_ONE_CONTEXT_ADAPTATION`, a browser adaptation; `uiGpuSurfaceWiring`): no GPU option on the Xbox
// class, as the match's; it is handed no HD option elsewhere, and the 1x one there (the same 640 x 448 frame).
const nativeSettings = new NativeSettings({ doc: document, load: async () => {
  const assetsSource = assetSourceFor(mapSource);
  const assets = await readNativeOptionsAssets(assetsSource);
  const sounds = await readUiSoundFiles(assetsSource);
  return { assets, state: () => pageOptions ?? adoptPageOptions(withPageHooks(pageNativeOptionsState(assets.disc), pageHooks), localMenuOptions, (state) => { pageOptions = state; }, stopEarlyHome),
    sounds: sounds.files ? makeUiSoundHost(sounds.files, sound.audio).cues : null };
}, ...uiGpuSurfaceWiring('overlay', pageDeviceClass(), undefined, () => ({ resolveAt: () => pageUiGpuSwitch().resolveTestRoomOverlay(), load: uiGpuSurfaceLoader({ surface: 'overlay', transparent: true, sw: pageUiGpuSwitch(), win: window }), dev: uiGpuDevBuild() })) });
globalThis.addEventListener?.('pagehide', e => {
  if (!(e as PageTransitionEvent).persisted) { stopEarlyHome(); cardReads.stop(); screenOrigin.stop(); nativeSettings.dispose(); pageOptions?.dispose?.(); }
});
const startMenu = new StartMenu({
  options: startMenuOptions,
  seat: () => ({ multiplayer: true, spectator: !!net?.gate().spectator, comeFromLan: false }),
  caption: (id) => menuCaptions?.[String(id)] ?? null,
  title: () => loaded?.name ?? null,
  sound: (name) => { sound.audio.play(name, null); },
  allowed: () => !!net?.gate().inMatch && !loadingJoin.blocked && !armory.isOpen() && !exchange.isOpen() && !inventory.isOpen() && !tauntDev?.isOpen(),
  voiceMask: (on) => { taunts.headset.setVoiceMask(on); },
  opened: () => { taunts.reset(); },
  abort: () => { matchAbort.abort(); },
  hud,
  settings: nativeSettings,
});
const mountPageVoice = () => mountVoice({ net: () => net, tuners: () => sound.audio.getTuners(), headset: taunts.headset,
  talkCue: (name, volume) => { sound.audio.play(name, null, 'play', volume); },
});   // SVC-20b-page: shared voice client; its talk grant's cue `VOICE_TALK_CUE_ADAPTATION` (research 170 §5.4)
let voice = mountPageVoice();   // CLOSE-FIX-1 F4: one a match -- disposed at the match's end (`connectNet`) and mounted afresh
const voiceEl = new HudVoiceElement();   // MATCH-05: the HUD's voice element's state across frames (`./hudVoice`)
/**
 * `?devmode`'s SETUP TAUNTS button (`./tauntDevEditor`): a development build's only, loaded with `import()` under
 * `import.meta.env.DEV` so a release bundle holds neither it nor its editor; the player's way in is ONLINE > OPTIONS.
 */
let tauntDev: TauntDevEditor | null = null;
let tauntDevState = (): DevEditorState => DEV_EDITOR_CLOSED;
if (import.meta.env.DEV && DEV.tools) void import('./tauntDevEditor').then((m) => {
  tauntDev = m.mountTauntDevEditor({
    panel: document.getElementById('panel-body'), source: () => mapSource, defaults: () => taunts.state().defaults.length ? taunts.state().defaults : null,
    blocked: () => loadingJoin.blocked || exchange.isOpen() || startMenu.isOpen() || nativeSettings.isOpen(), opening: () => { taunts.reset(); inventory.close(); fire.release(); },
    saved: () => {
      cardTaunts = pageCardTaunts();
      // A later Options save must keep the other editor's newly saved five, alongside its live tuner values.
      cardTaunts.forEach((value, i) => pageOptions?.uiVars.set(`MPTAUNTMSG${i + 1}`, { type: 'string', value: value ?? '' }));
    }, status: (t) => ui.setStatus(t, 'error'),
  });
  tauntDev.refresh();                               // the map's data may be in already
  tauntDevState = () => m.devEditorState(tauntDev);
}).catch(() => { /* a navigation aborted the optional dev module: expected */ });
/**
 * A pick (the weapon select's confirm, M8; the hook's `setLoadout`): written to the side's type, carried from its next
 * spawn -- in classic, the next round (R94.3).
 */
function setLoadout(loadout: Loadout, side: Side = net?.client.team ?? 'seal'): Loadout | null {
  // The developer's kit too, so the page's own room (which replays and spawns from it, `RoomOptions.soloKit`) takes it.
  loadouts.setDevKit(loadout);
  loadouts.setLoadout(loadout, side);
  return loadouts.pending(side);
}
/**
 * The ARMORY's character type (web sprint 5 S2; the seam S3's screen applies its choice through, beside `setLoadout`):
 * the side's type for its next spawn (`ChangeCharacterType`, research 95 §4.2 S1a; the body, the kit and the hit
 * volumes follow it at the rebuild). In a match the room is told at once (`chooseCharacterType`): a player's `loadout`
 * request naming the type (protocol 9), staged until the room answers, or a spectator's types for its seat; a rejoin is
 * seated as it (the hello's `types`). False, nothing changed, for a type the map's side does not offer.
 */
function setCharacterType(type: number, side: Side = matchSide()): boolean {
  return chooseCharacterType(loadouts, net, side, type);
}
// The open (`ctrl+0x221` = 1): no stance block runs, so a Triangle, C or touch C press under way is forgotten -- its
// masked lane or its release would otherwise be a tap (`InventoryMenu.onOpened`, `WalkMode.holdForMenu`).
inventory.onOpened(() => { stanceButton.reset(); walk.holdForMenu(true); });
/**
 * The sound (socomlegacy/docs/research/81, `./audio`): the map's own banks, played on the walk's events (`./walkSounds`) --
 * the footfalls, the jump, the landing, the rifle's rounds and reload. The first click or key press unlocks it.
 * `gameAudio` is the API the panel and the other workstreams import from `./audio` (`setVolume`, `setMuted`,
 * `onFootstep`, `onFire`, `onReload`, `onJump`, `onLand`, `onAnimCallback`). The unlock (a browser adaptation, no game
 * input) listens on the window ahead of the match's key captures below: the loading screen's hold, the ARMORY and WEAPON
 * EXCHANGE stop a key with `stopImmediatePropagation`, and an unlock registered after them never heard a key pressed
 * while the loading screen held the input (`test/audio.test.ts`; remoteCombat.spec.ts's unlock, 2026-10-05).
 */
const audio = gameAudio;
audio.unlockOn(globalThis);
// WEAPON EXCHANGE's keys (`./weaponExchange`): closed, `I` opens it when the gate lets it (WEAPON_SELECT_KEY_READING);
// open, every key but Esc (the mouse's release) is the menu's -- the game's keys do nothing (HUD mode 1). Captured on the
// window, ahead of every other listener but the audio's unlock.
if (import.meta.env.DEV) keyboardSite('s2u-kb-match-keys');            // OT.R29: the match's keys are a development build's only;
globalThis.addEventListener('keydown', testroomKeys((e: KeyboardEvent) => {   // RB-8 (OT.R114): and the test room's while offline
  // `?devmode`'s SETUP TAUNTS open: the typing is its soft keyboard's (`./tauntDevEditor`, whose listener comes after this
  // one) -- never `I`'s R2 inventory, whose Enter and Backspace would then take the keyboard's commit and erase.
  if (nativeSettings.isOpen() && e.code !== 'Escape') { exchangeInput.key(e.code, true, true, e.repeat); e.preventDefault(); e.stopImmediatePropagation(); return; }
  if (tauntDev?.isOpen()) return;
  // The loading screen swallows every key below. The developer panel's key toggles it, or queues the open until
  // the panel's import resolves. A repeat or a modifier is not that key. A browser adaptation, a development
  // instrument with no original: only under the panel's own switch (`devToolsEnabled`), so without it the key goes on
  // as it did before the panel.
  if (loadingJoin.blocked && devToolsEnabled(SEARCH)) {
    const panelKey = devPanelLoadingKey(e.code, e.repeat, e.ctrlKey, e.metaKey, e.altKey, devPanel, devPanelQueued);
    if (panelKey.taken) {
      devPanelQueued = panelKey.queued;
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
  }
  if (exchangeInput.key(e.code, true, false)) { e.preventDefault(); e.stopImmediatePropagation(); return; }
  if (!playOn || e.ctrlKey || e.metaKey || e.altKey || e.code === 'Escape') return;
  const target = e.target;
  if (typeof HTMLElement !== 'undefined' && target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'SELECT')) return;
  if (loadingJoin.blocked) { e.preventDefault(); e.stopImmediatePropagation(); return; }
  // The ARMORY (web sprint 5 S3): open, every key but Esc is its; no key opens it (the owner's ruling, 2026-10-02).
  if (armoryTakesKeys()) {                        // LATER 76: the round line's test too (here Play mode and the hold have passed)
    if (!e.repeat) armory.key(e.code);
    exchangeInput.key(e.code, true, true, e.repeat);   // its keys owned till let go, as WEAPON EXCHANGE's (research 300 §3)
    e.preventDefault();
    e.stopImmediatePropagation();
    return;
  }
  refreshExchange();
  const open = exchange.isOpen();
  let taken = e.repeat ? open : exchange.key(e.code, exchangeGate());
  if (taken) exchangeInput.key(e.code, true, true, e.repeat);
  // Alive, `I` is the R2 inventory's (`./inventoryMenu`, INVENTORY_MENU_KEYS_READING), and its keys while it is open.
  if (!taken && !open && walk.mode() === 'walk') taken = e.repeat ? inventory.isOpen() && Object.hasOwn(INVENTORY_MENU_KEYS_READING, e.code) : inventory.key(e.code);
  if (!taken) return;
  e.preventDefault();
  e.stopImmediatePropagation();
}), { capture: true });
globalThis.addEventListener('keyup', testroomKeys((e: KeyboardEvent) => {
  if (exchangeInput.key(e.code, false, false)) { e.preventDefault(); e.stopImmediatePropagation(); }
}, true), { capture: true });
// The PC's number keys (the owner, 2026-09-29; `./kit`'s `hotkey`; W4.R5): 1 the rifle, 2 the Mark 23, 3, 4 and 5 the
// kit's equipment slots 1-3 -- walking, no modifier, not on auto-repeat, not typed into the panel's fields.
globalThis.addEventListener('keydown', testroomKeys((e: KeyboardEvent) => {   // OT.R29: a development build's; RB-8: offline
  const key = hotkey(e.code);
  if (!playOn || !key || e.ctrlKey || e.metaKey || e.altKey || e.repeat || walk.mode() !== 'walk') return;
  const target = e.target;
  if (typeof HTMLElement !== 'undefined' && target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'SELECT')) return;
  if ('firearm' in key) selectFirearm(key.firearm);
  else takeSlot(key.equipment + 1);                   // the equipment slots 2-4: the shoulder press's whole gate (`takeSlot`)
}));
globalThis.addEventListener('keydown', testroomKeys((e: KeyboardEvent) => {   // OT.R29: a development build's; RB-8: offline
  if (!playOn || e.code !== 'KeyB' || e.ctrlKey || e.metaKey || e.altKey || e.repeat || walk.mode() !== 'walk') return;
  const target = e.target;
  if (typeof HTMLElement !== 'undefined' && target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'SELECT')) return;
  switchFireMode();
}));
/** The trigger, pressed or let go: the firearm's, another owner's first -- the turret, the launcher, a throwable (`hands`). */
function trigger(down: boolean): void {
  firearm.trigger(down);
}
/**
 * The effects' pre-warm (research 90 item 16): their programs compiled and their bitmaps uploaded when the map's effect
 * data arrives, not in the frame of the first explosion. Set once the renderer is up.
 */
let compileEffects: ((g: ReturnType<typeof effects.warmUp>) => Promise<void>) | null = null;
/** The world whose warm-up (`warmScene`, after its props) has run. */
let worldWarmed: WorldView | null = null;
/** The world whose warm-up rejected: the loading screen does not wait on it (`./loadingJoin`). */
let worldWarmFailed: WorldView | null = null;
function warmEffects(): void {
  // Before the world's own warm-up the effects ride in it (`show`: one pass over the scene, not two).
  if (!compileEffects || !effects.stats().loaded || !view || worldWarmed !== view) return;
  const g = effects.warmUp();
  const compiling = compileEffects(g);
  effects.warmStarted(g);                           // the list is taken: the frames meanwhile do not draw the warm-up
  void compiling.catch(() => {}).finally(() => effects.warmDone(g));
}
const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
/** The test room's mod panel, once `boot` mounts it (`MODS_SCOPE_ADAPTATION`); null in the replay frame and before. */
let modPanel: ReturnType<typeof mountModPanel> = null;

let view: WorldView | null = null;
let localTexturePacks: LocalTexturePacks | null = null;
/** B206 ML-3: the test room's MODS texture pack applier (`./packs/pagePacks`); null off the test room. */
let testRoomPacks: PackApplier<TexturePackTarget> | null = null;
/**
 * PR #729's Codex P1 (re-read; ML.R13): the test room's HD pack asked its online guard again as its room is made or left
 * (`HdPackRuntime.reguard`), so a pack applied while Online was Off is drawn guarded once a room on a server is joined.
 */
let reguardPacks = (): void => undefined;
let loaded: LoadedMap | null = null;
/** Browser adaptation: explicit agent-approved model preview, using the same runtime as the model-pack panel. */
let agentModelsEnabled = false;
const currentModelPackAddress = (): string => modelPreviewAddress(globalThis.location.href, agentModelsEnabled);
/** W2.1: the player's body, rebuilt with every map; shown by the panel's `body` switch (`./bodyView`). */
let body: BodyView | null = null;
/**
 * The page's own body by its side (`./teamBody`, 2026-09-30): a SEAL offline and until the match seats the player, the
 * map's Terrorist for a Terrorist -- rebuilt when the side's body differs (the old disposed, `Play.setBody`, the kit
 * re-hung), so the walk, the death clips, the death camera and the shadow all run on the side's own skeleton.
 */
const ownBody = new OwnBody<BodyView>({
  build: (b) => buildBody(b, loaded!, lighting),
  dispose: (v) => { scene.remove(v.group); v.dispose(); },
  attach: (v, b) => { body = v; if (v) scene.add(v.group); play.setBody(v, b); },
  hang: () => hangKit(true),
});
/**
 * The page's player's side now (`NetClient.team`; welcome, promoted), its body following it -- and, web sprint 5 S2,
 * its character type on that side (`PlayerLoadout.bodyType`: the type the last spawn rebuilt it as, else the side's next).
 */
function followTeam(team: Team | null = matchSide()): void {
  if (loaded) ownBody.follow(bodyForTeam(loaded, team, loadouts.bodyType(team ?? 'seal')));
}
/** The characters' shadow (`./charShadow`): the SEAL's render map, projected on the world -- the part both pages mount (PAR-6). */
const charShadow = mountCharShadow();
/** RB-16 (PS-7, CPS.R7): the page's video settings (`./videoSettings`) the test room's panel follows: Shadows and Show FPS. */
const pageVideo = videoSettingsKeeper();
let shadowsOn = pageVideo.get().shadows;
let backend: Backend = 'webgl2';
/** The maps the index listed, so a path can be turned back into its archive for the URL. */
let mapList: MapInfo[] = [];
/**
 * FP-6 item 5 (FP.R13; a test instrument's, `./testroomContent`): the last disc map the worker gave the room -- an
 * authored map's library when its base names none or names this one; the library asked of the worker on its own id (never
 * shown); the authored map's drawn pack props, freed at the next authored load.
 */
let roomLibrary: LoadedMap | null = null;
let libraryAsk: { id: number; resolve: (map: LoadedMap) => void; reject: (e: Error) => void } | null = null;
/** PR #756 P2s (`./customProps`): the custom props held, and whether the wanted load's are still being drawn (the hold). */
const customProps = new CustomProps();
/** A disc save's pieces (`openCustom`), composed onto its map when the worker gives that load's map (`piecesOnShow`). */
let pendingPieces: { load: number; tc: typeof import('./testroomContent'); compose: (map: LoadedMap) => { map: LoadedMap; props: ContentPropPlacement[] } } | null = null;
/**
 * FP-6 item 5: the room's content path (`./testroomContent`: the authored map's loader, the Forge's piece compose, the
 * saves' reader), a chunk of its own fetched once, when the Custom Maps select mounts -- S3b item 8's reason
 * (`./loadMap` `loadAnyMap`): a static import would bind the content loader and the forge's modules into the room's graph.
 */
const testroomContent = (): Promise<typeof import('./testroomContent')> => import('./testroomContent');
/** The batch review's F2 (H273, `./customOffline`): the maps the custom path showed, which `connectNet` keeps offline. */
const customOffline = new CustomOffline();
/** F2: the Custom Maps select set to the Online setting (disabled, said, while it names a server); bound at its mount. */
let refreshCustomOffline = (): void => undefined;
/**
 * PR #756's second P2: the room's selection token. Each map chosen takes it -- a disc load (`load`), a Custom Maps row
 * (`openCustom`) -- so a custom selection still reading its saves or packs is abandoned once a newer one is made.
 */
let customSelection = 0;
/** The presentation the panel asks for; `fit` puts it into effect. */
let presentation: Presentation = 'native';
/** `fit`, once `boot` has a renderer: the canvas's CSS box, or the PS2 frame, onto the camera. */
let fit: (() => void) | null = null;

/** The panel's lighting, accumulated as the sliders move and handed to the world as one set. */
const lighting: Lighting = { ...DEFAULT_LIGHTING };

/** The panel's fog. Replaced wholesale when a map states its own, then nudged by the sliders. */
const fog: FogSettings = {
  enabled: true, ...fogForExtent(1200), color: [...ELF_DEFAULT_FOGCOL], altitude: null,
};
/** The renderer's clear colour, once `boot` has one: the background follows the fog. */
let setClearColor: ((rgb: [number, number, number]) => void) | null = null;
/** The renderer's warm-up (`ViewerRenderer.warm`), once `boot` has one: every program compiled after a map's reveal. */
let warmScene: ((extras: Object3D[]) => Promise<void>) | null = null;
/** How many of the world's programs link at once before its first paint (`ViewerRenderer.prepare`'s `lanes`). */
const WORLD_LANES = 8;
/** A reveal's programs compiled before it (`ViewerRenderer.prepare`), once `boot` has a renderer. */
let prepareObjects: ((objects: Object3D[], stale: () => boolean, lanes?: number) => Promise<void>) | null = null;
/** What entering the walk first draws -- the SEAL and its rifle, their shadow's silhouette, the HUD and the reticle -- compiled with the map. */
let warmWalk: (() => Promise<void>) | null = null;
/** The ARMORY's passes compiled (`ArmoryView.warmTargets`), once `boot` has a renderer: again when its data lands. */
let warmArmory: (() => Promise<void>) | null = null;
/** The renderer's link log (`./linkLog`), once `boot` has a renderer: the hook's `links()`. */
let linkLog: LinkLog | null = null;
/** When each warm-up of the map on screen finished (`performance.now()`), for the hook's `links()`. */
let warmedAt: Record<string, number> = {};
/** The body whose walk warm-up is done and whose first draws are owed (`./rehearsal`, research 90 #21): the next frame makes them. */
let rehearsal: BodyView | null = null;

/**
 * False while the fog on screen is the map's own, true once a slider has been dragged. It stops the
 * step-snapped value in the range input from being read back over the decoded one on every map load.
 */
let fogIsMine = false;
/** The goggles' lens over the fog while they are on (the firearm's `refreshFog`), else null. */
let fogLens: readonly number[] | null = null;

/**
 * Puts the current fog on the scene and behind it. The brighten pass multiplies the whole frame, the
 * fog colour and the cleared background with it, so both are lifted by the same factor here.
 */
function refreshFog(): void {
  // With the goggles on the camera's colour is the lens's times the fog's (`FUN_005c1800`, `cam+0xd0`).
  liftFog(scene, fog, lighting, fogLens, setClearColor);
}

/**
 * Which request the page is still waiting for, one per kind. Loads overlap -- the boot auto-load is
 * already running when the player picks a map, and a small archive can overtake a large one -- so an
 * answer whose id is no longer the wanted one is dropped rather than drawn over the newer map.
 */
let requests = 0;
let wantedIndex = -1;
let wantedMap = -1;
const ask = (request: ViewerRequest): void => worker.postMessage(request);
/** What the overlay says while each stage of a load runs. */
const STAGE_WORDS: Record<LoadStage, string> = {
  fetching: 'fetching the archive',
  archive: 'reading the archive',
  geometry: 'decoding the geometry',
  textures: 'decoding the textures',
};

/** When the current load was asked for, so the status line can report the whole wait, not a part. */
let askedAt = 0;
/** The reveal in progress. A new load cancels it: half a map is not drawn under the next one. */
let revealing: Spread | null = null;
/**
 * Whether a map switch is under way: the loading overlay stands from a load's ask until its world is revealed or the
 * load fails (`ui.setLoading`); the disc is not opened over it (`openDisc`).
 */
const switching = (): boolean => document.getElementById('loading')?.hidden === false;

/**
 * A test-room mod reload (`load`'s second argument). The solo ARMORY opens only once this load's ARMORY data
 * is in and the loading screen is down (`tryReopenArmory`). Cleared when that open runs or the load fails.
 */
let reopenArmory = false;
/** This load's `armory` reply has been applied. A newer load clears it. */
let reopenArmoryData = false;
/**
 * Opens the solo ARMORY for a mod reload once `shouldReopenArmory` says the load is finished. If the screen
 * cannot open, the offline room is made at once, as a seat with nothing to show does.
 */
function tryReopenArmory(): void {
  if (!shouldReopenArmory({
    asked: reopenArmory,
    dataLanded: reopenArmoryData,
    loadFinished: !switching(),
    solo: !NO_ARMORY && playOn && SOLO_MATCH,
  })) return;
  reopenArmory = false;
  reopenArmoryData = false;
  if (armoryPart.isOpen()) return;
  if (!armoryPart.open()) { const go = soloAfterArmory; soloAfterArmory = null; go?.(); }
}
/** MCW.R8: the load's kind, read live -- at `begin` and again every frame, so a load that goes online before it shows regains the hold. */
const loadKindNow = (): LoadKind => ({
  testroomPage: /(?:^|\/)testroom(?:\/|$)/i.test(globalThis.location.pathname),
  replay: !!REPLAY_WORLD || attestSoloAddress(globalThis.location.search).replay,
  netClientOnline: !!(net && !solo), netUrl: !!NET.url, roomOpen: roomAsk !== null,
  networkAddress: attestSoloAddress(globalThis.location.search).network,
});
const load = (path: string, armoryAfter = false): void => {
  customSelection++;                               // PR #756 P2: a disc load supersedes a custom selection still preparing
  reopenArmory = armoryAfter;
  reopenArmoryData = false;
  askedAt = performance.now();
  wantedMap = ++requests;
  startMenu.levelStart();                          // R4B-02 review P2: the level load's mask (r4 0x1f6850, D:L55851-55854)
  // ONL-18b: the release reports the load (`loaded`) on this load's client -- the one `connectNet` made for it.
  // MCW.R8: no presentation hold for an actual SOLO test-room load; a replay, a network test room or a game mount keeps the original.
  loadingJoin.begin(wantedMap, () => { if (netLoad === wantedMap) net?.client.reportLoaded(); }, soloLoadHold(loadKindNow()));
  loadingScreen.watch.begin();
  loadingScreen.panel.cover();
  fire.release();
  fly.setInputSuspended(true);
  wantedMapFrom = source.kind;
  if (mapSource !== source) nativeSettings.invalidate();
  mapSource = source;
  // Browser adaptation: start immutable Settings reads after the source exists, without creating live option state.
  void nativeSettings.preload();
  rememberMap(path);
  revealing?.cancel();
  revealing = null;
  // The original loading screen covers preparation; gameplay input stays suspended until the required lanes finish.
  ui.setLoading(true, 'fetching the archive', 0);
  // Level pieces (`worldPieces`): the ids go only while a pack is active. The catalog is dev-only (`devtools` /
  // `devmode`, or the pack's own page) and a replay frame asks for neither — its recording was made without the pack.
  const packOn = !REPLAY_WORLD && modelPackActive(currentModelPackAddress(), import.meta.env.BASE_URL);
  const pieces = worldPieceLoadRequest(packOn, packOn ? mappedWorldPieceIds() : [], packOn || (!REPLAY_WORLD && DEV.tools));
  ask({ kind: 'load', id: wantedMap, source, path, ...pieces });
};
/**
 * FP-6 item 5 (FP.R13; a test instrument -- a browser adaptation, no original): an authored map opened in the room
 * (`./testroomContent` `loadTestroomContent`) beside `load`: a new wanted load under the same hold, the map built on this
 * thread from the page's shared content source and shown by `show`; the hold's sound, effects and ARMORY lanes asked of
 * its library, else answered at once with none (`contentLaneAnswers`); a refusal ends the hold with its words. No rules,
 * NPCs or objectives of a layout: the map as its loader gives it.
 */
const loadContent = async (open: ContentOpen, layout: Layout | null = null, current?: () => boolean): Promise<'shown' | 'refused' | 'superseded'> => {
  const tc = await testroomContent();
  if (current && !current()) return 'superseded';   // PR #756 P2: a newer selection made while the chunk came
  return tc.loadTestroomContent(open, {
    begin: () => {
      reopenArmory = false;
      reopenArmoryData = false;
      askedAt = performance.now();
      wantedMap = ++requests;
      startMenu.levelStart();
      loadingJoin.begin(wantedMap, () => { if (netLoad === wantedMap) net?.client.reportLoaded(); }, soloLoadHold(loadKindNow()));
      loadingScreen.watch.begin();
      loadingScreen.panel.cover();
      fire.release();
      fly.setInputSuspended(true);
      wantedMapFrom = source.kind;
      if (mapSource !== source) nativeSettings.invalidate();
      mapSource = source;
      revealing?.cancel();
      revealing = null;
      ui.setLoading(true, 'reading the custom map', 0);
      return wantedMap;
    },
    wanted: () => wantedMap,
    source: () => tc.pageContentSource(),
    library: (stem) => {
      const same = (a: string): boolean => stem !== null && a.toUpperCase() === stem.toUpperCase();
      if (roomLibrary && (stem === null || same(roomLibrary.archive))) return Promise.resolve(roomLibrary);
      const listed = mapList.find((m) => same(m.archive));
      if (!listed || source === NO_SOURCE) return Promise.resolve(roomLibrary);
      return new Promise<LoadedMap>((resolve, reject) => {
        libraryAsk?.reject(new Error('another library was asked'));
        libraryAsk = { id: ++requests, resolve, reject };
        ask({ kind: 'load', id: libraryAsk.id, source, path: listed.path });
      });
    },
    show: (map) => { shownFrom = wantedMapFrom; customProps.clear(); show(customOffline.mark(map)); },
    answer: (load, library) => {
      const a = tc.contentLaneAnswers(load, library);
      if (a.kind === 'ask') { askSound(mapSource, a.path, a.archive); askEffects(mapSource, a.path, a.archive); askArmory(mapSource, a.path, a.archive); }
      // PR #756 P2: the ARMORY's empty answer through its own hand-off too, so a seat waiting on data is released.
      else { loadedSound = a.loadedSound; loadedEffects = a.loadedEffects; loadedArmory = a.loadedArmory; armoryData(null); }
      if (wantedPlay < 0) playAnswer = 'none';
    },
    drawProps: (load, props) => { drawContentProps(tc, load, props); },
    fail: (load, words) => { loadingJoin.failed(load); loadingScreen.panel.hide(); reportDecodeFailure(ui, words); },
  }, layout);
};
/** FP-6 item 5: the pack props of the map `load` shows, drawn in its world's group; the previous authored load's freed. */
function drawContentProps(tc: typeof import('./testroomContent'), load: number, props: readonly ContentPropPlacement[]): void {
  customProps.clear();
  if (!props.length) return;
  // PR #756 P2: the hold waits for them (their hull is in the ground already); a read that fails settles, so it releases.
  customProps.begin(load);
  void tc.pageContentSource().then((src) => tc.contentPropsObject(props, (def) => src.member(def.ref.pack, def.visual.member))).then((g) => {
    if (shownLoad !== load || !view) { (g.userData['dispose'] as () => void)(); customProps.settle(load); return; }
    customProps.attach(load, g, view.group);
  }).catch(() => { customProps.settle(load); });
}
/** FP-6 item 5: a disc save's static pieces on the map the worker gave for its load (`composeStaticPieces`), else null. */
function piecesOnShow(id: number, map: LoadedMap): { map: LoadedMap; props: ContentPropPlacement[]; tc: typeof import('./testroomContent') } | null {
  const p = pendingPieces;
  if (!p || p.load !== id) return null;
  pendingPieces = null;
  // The load screen waits on this map's show: a compose that throws shows the map without its pieces, said.
  try { return { ...p.compose(map), tc: p.tc }; }
  catch (e) { ui.setStatus(`the layout's pieces did not compose: ${e instanceof Error ? e.message : String(e)}`, 'error'); return null; }
}
/**
 * FP-6 item 5 (FP.R13): a Custom Maps row opened (`./testroomContent` `customPlan`): a bare content map as itself, a
 * bundle or a save on its authored base with its static pieces (`loadContent`), a save on a disc map through the room's
 * own `load` with its pieces composed when the map comes (`piecesOnShow`); a refusal said in the status line.
 */
const openCustom = async (value: string): Promise<void> => {
  if (NET.url) { ui.setStatus(CUSTOM_MAPS_OFFLINE_WORDS, 'error'); return; }
  const mine = ++customSelection;
  const current = (): boolean => customSelection === mine;
  let tc: typeof import('./testroomContent');
  try { tc = await testroomContent(); } catch { if (current()) ui.setStatus('the custom maps would not read', 'error'); return; }
  if (!current()) return;
  const chunk = tc;
  await tc.openCustomRow(value, {
    current,
    source: () => chunk.pageContentSource(),
    saves: () => chunk.readTestroomSaves(pageIndexedDb()),
    say: (words, error) => { ui.setStatus(words, error ? 'error' : 'ok'); },
    pathOf: (archive) => mapList.find((m) => m.archive.toUpperCase() === archive.toUpperCase())?.path ?? null,
    loadContent: (o, layout) => { void loadContent(o, layout, current).catch((e: unknown) => { ui.setStatus(`the custom map did not load: ${e instanceof Error ? e.message : String(e)}`, 'error'); }); },
    loadDisc: (path, compose) => {
      load(path);                                  // takes the token itself: this selection's own load
      pendingPieces = { load: wantedMap, tc: chunk, compose };
    },
  });
};

/**
 * Where the archives come from (W1.7). The served tree is the default whenever `maps/index.json` answers;
 * the player's own disc image replaces it once opened. `source` is what the picker's paths are read from,
 * and it changes only when that source's map list arrives, so a map picked from the old list in the
 * meantime is still read from the source that listed it.
 */
// Since 2026-09-29 (owner) the page reads only the visitor's disc unless `?devmode` lets it read the served tree
// (`./source`): without it no request is made under `maps/` at all, and the disc page stands in its place.
const SERVED: SourceRequest | null = startSource(SEARCH, MAPS);
// PLAT-10's front end (`?menuflow`) is not mounted from here since OT.R12 (2026-10-03): the page's entry
// (`./pageEntry`) loads this module only without `menuflow`, and the front end alone with it.
const NO_SOURCE: SourceRequest = SERVED ?? { kind: 'http', baseUrl: MAPS };   // a placeholder, never asked of without devmode
let source: SourceRequest = NO_SOURCE;
/** The source the wanted map list was asked of; it becomes `source` when that list arrives. */
let wantedIndexFrom: SourceRequest = NO_SOURCE;
/** The source the wanted map is being read from, and the one the map on screen came from, for `stats()`. */
let wantedMapFrom: SourceRequest['kind'] = 'http';
let shownFrom: SourceRequest['kind'] = 'http';
/** The source the wanted map is being read from, whole: the map's sound is asked of it too. */
let mapSource: SourceRequest = NO_SOURCE;

/** Nothing is open and nothing is served: a failure has only the disc page to fall back on (review 2, m-15). */
const nothingOpen = (): boolean => source === NO_SOURCE && !SERVED;

/** The open source's archives that would not name themselves (`./discIndex`), kept in each map's diagnostics list. */
let indexDiagnostics: string[] = [];

/** Asks `from` for its map list; the answer switches the picker, and the source, over to it. */
function askIndex(from: SourceRequest): void {
  wantedIndexFrom = from;
  wantedIndex = ++requests;
  ask({ kind: 'index', id: wantedIndex, source: from, ...(CAMPAIGN_ON ? { campaign: true } : {}) });
}

// MULTIPLAYER (web sprint 3): the other players and the match -- the settings' Online (owner, 2026-09-29; `./online`), or
// the URL's `&mp` / `&server=` over it. reCOM mode joins as a player, the map viewer as a watcher (`connectNet`).
// PAR-8 (research 257 s1): the shared effects (`./matchEffects`) -- the footprints beside the steps, own and others'.
const matchEffects = mountEffects({ effects, walk, sound });
// The others' footfalls heard at the foot (`remoteFootfall`, FUN_005a3570/FUN_005a39b0; REMOTE_STEP_STICK_READING), and
// since PAR-8 printed there (FUN_005a3280).
const remote = new RemotePlayers(scene, matchEffects.footfall);
// The others' wading ripples and splashes (research 86 s5.4: `FUN_005b52b0` for every SEAL body) on the effects the
// page's own keeper takes (`traversal.setEffects(effects)` above).
remote.setEffects(effects);
// FLASH-GLOW-BODIES: the others' bodies compiled at their spawn, the glow's context too (`RemotePlayers.setPrepare`). `prepareObjects`
// is set later, with the renderer: read at each call, so a body built before then is simply not prepared.
remote.setPrepare((objects, stale) => { void prepareObjects?.(objects, stale).catch(() => {}); });
/** LATER 415: the camera's region masks and the bodies' zones, for the teammates' tags (`./regionCull`). */
const regionCull = new RegionCull();
/**
 * HX-4a (`./hostagePage`, research 239 s1, s3, s7; ruling HX.R8): the hostages' part -- FOLLOW! / HOLD POSITION on the
 * hostage under the crosshair, the room's own test on the page's ray (the others' capsules, the hull's surfaces, sub-map
 * 0's cells, W0's `LoadedMap.ai`); `/testroom` only this sprint (`TESTROOM_CAPABILITIES.hostages`).
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
  surfaces: (eye, far) => { const g = walk.grid(); return g ? pickSurfaces(g, eye, far, loaded?.grenade?.defaultMaterial ?? '') : []; },
  cellOf: (feet) => orderCellOf(loaded?.ai, feet),
  order: (id, cmd) => net?.hostageOrder(id, cmd) ?? false,
});
/**
 * Sprint 27's action button and the pages it acts on (`./matchActions`, ONE-WIRE: research 222): the room's events
 * relayed to the pages that follow them, the map's switches (XR-04), the manual turrets and their trigger (MAP-10b),
 * DEMOLITION's bomb (XR-05: drawn through the cues, the HUD's marks and fuse, the satchel on the carrier's body,
 * `base_explosion1`, the world bomb's model) and the action button's one context, its hold and its cancel (XR-06; the
 * window's blur cancels it). Made once its drawers exist (after `remote`).
 */
const acts = mountActions({
  walk, fly, doors, traversal, grenade, remote, play, firearm,   // research 303: the dance's body, its trigger and reload
  net: () => net, map: () => loaded, view: () => view, world: () => pageWorld,
  craneToggle: (valve) => cranes.toggleLocal(valve),
  gatePress: (action, seq) => gates.press(action, seq), cranePress: (valve, seq) => cranes.press(valve, seq),   // P8
  bombView: {
    roundAudio, hud, remotePlayers: remote, effects, worldBomb: grenade.worldBomb(),
    ownBody: ownBombBody(play, throwPose, walk, () => firearm.item() === 'pistol'),   // PB-1 (research 214 s3): the own body
    sound: bombSound(gameAudio),                                                       // PB-1: the pickup's .FOOTBOMB
    pulse: worldPulse(() => pageWorld),                                                // PB-9b (research 284 s8): the bases' pulse
  },
  win: globalThis,
  drops: { ahead: () => drops.promptAt(walk.feet(), walk.snapshot()?.yaw ?? 0), candidates: () => drops.holdCandidatesAt(walk.feet(), walk.snapshot()?.yaw ?? 0), second: () => drops.promptAt(walk.feet(), walk.snapshot()?.yaw ?? 0, 2), item: (did) => drops.itemOf(did) },   // LkPaioX5 (c): the second TAKE and the names;   // PAR-34 group 7: PICKUP_HOLD_PER_CLASS_READING   // PF-34: the weapon prompt's drop
  // MAP-10b (research 215 s7): the mount's sounds, the bodies' hands and the clips their poses time; the own round drawn.
  turret: {
    sound: (name, at) => { gameAudio.play(name, at, 'play', 1); },
    bodyFeet: (id) => remote.feet(id), clips: () => remote.playClips(),
    hand: (id) => (id === net?.client.id ? walk.hand() : (net?.client.bodies().find((b) => b.id === id)?.slot === 1 ? 1 : 0)),
    round: (record, from, dir, frame, count) => firearm.turretRound(record, from, dir, frame, count),
  },
  hostages,                                        // HX-4a: the hostages' orders (research 239 s7)
});
walk.setMountPose(() => acts.turrets.ownPose());              // MAP-10b: the turret anim set's clips on the bodies
remote.setMountPose((id) => acts.turrets.turretPose(id));
acts.turrets.setSpread(() => firearm.turretCone());           // TURRET-CONE P2 (research 215 s8.2): the rounds roll on the turret's cone
const PAGE_LOCATION = globalThis.location ?? { protocol: 'http:', host: 'localhost' };
let NET: OnlineTarget = onlineTarget(MULTIPLAYER, SEARCH, () => SHARE.online ?? readOnline(), PAGE_LOCATION);   // none with multiplayer off
/**
 * The match's rules (`./rules`; OT.R71): the link's `rules=`, else the test room's remembered Rules setting, else classic
 * (the original's default), online and in the offline match alike; the setting changes it (`ui.onRules`, below).
 */
let RULES: Rules = resolveRules(SEARCH, readRules()).rules;
/**
 * The tab's session tokens (S2 round 4, `./net/session`), one a tab and a server: kept in session storage across a
 * reload, sent with each hello so the room keeps this page's seat record (and takes over a seat an unclean drop left
 * behind) -- keyed by the server URL's origin (`sessionKeyFor`), so a page that joins another server (`&server=`) never
 * sends it the token this one knows it by (the S2 review's round-4 lows).
 */
const PAGE_SESSIONS = new Map<string, PageSession>();
function sessionFor(url: string): PageSession {
  const key = sessionKeyFor(url);
  let s = PAGE_SESSIONS.get(key);
  if (!s) { s = new PageSession(undefined, undefined, key); PAGE_SESSIONS.set(key, s); }
  return s;
}
let net: NetPage | null = null;
/** RB-8: the URL `net` was made with (`'loopback:'`, `'replay:'`, a server's), read only while `net` is not null. */
let netUrl: string | null = null;
/**
 * RB-8 (the replay batch, KBM-2; OT.R114, RB.R4; a browser adaptation): whether the test room may read the keyboard and
 * the mouse now -- no match client, the offline room or a recording, never a server's room (`./kbmScope`). Asked at each
 * event, so the room going online makes them deaf at once. Hoisted: the camera above is built with it.
 */
function testroomKbm(): boolean { return kbmAllowed(testroomKbmPage(REPLAY_WORLD !== null), net === null ? null : netUrl); }
/**
 * RB-8: a key listener of the test room's in every build, run in a development build or while `testroomKbm` holds; a
 * key's release (`release`) always runs, so a key held as the room goes online is let go.
 */
function testroomKeys<E extends Event>(f: (e: E) => void, release = false): (e: E) => void { return (e) => { if (release || import.meta.env.DEV || testroomKbm()) f(e); }; }
/**
 * SA-7h S5 (`./connectHost` `ROOM_DOOR_ADAPTATION`): while a host-run standing room's first pass is out there is no
 * `net` yet -- its status meanwhile (`connecting`, `retrying` on the backoff, then `refused` with the pass's line), read
 * where `net`'s would be; the join (`startRoomJoin`) cancelled by the next connect, so a superseded one answers nothing.
 * `roomNameRetry`: after "set a name to join this room", setting a name joins again (the review's F5).
 */
let roomAsk: OnlineStatus | null = null;
let roomJoinOn: { cancel(): void } | null = null;
let roomNameRetry: (() => void) | null = null;
/**
 * PAR-94 B2/B3 (research 322 §4.1): the page's room (`net`) has spawned the page this match -- its own `spawn` heard
 * (`NetPage`'s `case 'spawn'` -> the deps' `respawned`); false again with each new room. The frame draws the walker's
 * HUD and reticle through `pageSpawned` (`./reticle`): none under the ARMORY, none before the room's spawn.
 */
let ownSpawned = false;
/**
 * The load whose map is on screen (`show`), and the load whose map the current net client was attempted for
 * (`connectNet`): the loading screen's connection lane reads only a client attempted for the wanted load
 * (`./loadingJoin` `pageLanes`; review F1 of the PR #10 carry).
 */
let shownLoad = -1, netLoad = -1;
/** The page's offline room (`./net/loopback`), once the armory has closed. `SOLO_MATCH` is with `playOn`. */
let solo: LoopbackMatch | null = null;
/** Browser adaptation: its input is merged with the pad only in the actual solo test room. */
let soloAgent: SoloTestroomTarget | null = null;
/** R5-B (a browser adaptation): the agent's camera shot on the solo room's fly camera, built with the room's agent target. */
let roomShot: PageShot | null = null;
/** MAP-02: the page's world state (`./worldState`) on the shown map's hull; the offline room's is followed into it. */
let pageWorld: WorldState | null = null;
/** The clips the worker sent (the death clips among them, for the page's own death). */
let playClips: PlayClips | null = null;
/**
 * Test-room zombies (`TEST_ROOM_ZOMBIES_ADAPTATION`). A labelled adaptation: it does not change the match.
 * F6 starts it and F7 resets it. F9 stays the development overlay's key, and F8 stays the playtest mark.
 * The model and the sounds come from the visitor's mod pack (`MODS/ZOMBIES/PACK.ZIP`). A mod mode in every build's
 * test room, never in a match (OT.R70); a replay frame (`REPLAY_WORLD`) mounts none of it, as the mod panel and the model
 * pack do not (the #395 review's ask 5).
 */
const zombieDeath = REPLAY_WORLD ? null : new ZombieDeath(fly.camera);
const zombies = zombieDeath && installZombies({
  scene, fire,
  inMatch: () => net !== null && solo === null,     // ask 2, OT.R70: a networked match (online, replay) -- every match the page holds is `net`
  // #395 review F1 (b): the offline loopback stood down at a start (the one teardown connectNet uses) and made again at F7
  // R1 (the re-read): the map-entry ARMORY's pending offline room counts too -- stood down with it, the ARMORY closed
  offline: { active: () => solo !== null || soloAfterArmory !== null, stop: () => { leaveRoom(); reopenArmory = false; armory.close(); ears.stop(); showOnline(); }, restore: () => { if (loaded) connectNet(loaded); } },
  archive: () => loaded?.archive ?? null,
  ready: () => loaded?.archive === 'MP72' && walk.mode() === 'walk' && play.animStats() !== null,
  grid: () => walk.grid(),
  feet: () => walk.feet(),
  camera: () => { const p = fly.pose(); return [p.x, p.y, p.z]; },
  yaw: () => fly.pose().yaw,
  clips: () => playClips,
  health: (value) => hud.patch({ health: value }),
  time: (seconds) => hud.patch({ timer: seconds }),
  lock: (on) => walk.setLocked(on),
  devtools: DEV.tools,
  present: (dt) => zombieDeath.frame(dt),
  death: (result) => {
    document.exitPointerLock?.();
    fire.release();
    walk.setLocked(true);
    zombieDeath.start(walk.feet() ?? [0, 0, 0], result, true);
  },
  resetDeath: () => { zombieDeath.reset(); },
});
if (zombieDeath && zombies) zombieDeath.onRestart = () => { void zombies.start(); };
/** The name the player set (`s2u.mp.name`), or '' for the server's guest name (W3.R12). */
function playerName(): string {
  try { return globalThis.localStorage?.getItem('s2u.mp.name') ?? ''; } catch { return ''; }
}
// W3.R12: the settings' name field -- printable ASCII, 30 at most (the server cleans it again), sent to the match.
{
  const field = document.getElementById('mp-name') as HTMLInputElement | null;
  if (field) {
    field.value = playerName();
    field.addEventListener('change', () => {
      const name = field.value.replace(/[^\x20-\x7e]/g, '').replace(/\s+/g, ' ').trim().slice(0, 30);
      field.value = name;
      try { globalThis.localStorage?.setItem('s2u.mp.name', name); } catch { /* no storage */ }
      if (name) net?.client.send({ type: 'name', name });
      if (name) roomNameRetry?.();                  // SA-7h S5 (F5): a hosted join refused for the name, joined again
    });
  }
}
// The firearm's own: the pose, the reload's hold, the room, the sound and the effects per round (`./matchFirearm`).
play.onEvent(sound.playEvent);   // the body's footfalls, clip callbacks and landings, heard (`./matchSound`)
// The message window's lines a lone SEAL can cause (research 87 §14): a landing of the death class is the game's fall
// to death, "%s falls to their death" (0x65c440, `FUN_00547860`) -- the viewer's SEAL walks on. PAR-9 (research 257 s2):
// only with no room live (the match client not open); in a match the room's kill line is the one (`NetPage`, both pages').
play.onEvent(fallDeathLine({ hud, net: () => net }));
play.onEvent(matchEffects.playEvent);   // EFFECTS: the footprint on sand and snow (`FUN_005a3280`; `./matchEffects`, PAR-8)
let wantedPlay = -1;
/** EFFECTS: the map's effect data, asked of the source the map came from once it is shown (`./effectData`). */
const effectsLane = new LaneRequest();
function askEffects(from: SourceRequest, path: string, archive: string): void {
  ask({ kind: 'effects', id: effectsLane.ask(++requests, shownLoad), source: from, path, archive });
}
/** The map's sound, asked of the source the map came from once it is shown (`./soundData`). */
const soundLane = new LaneRequest();
function askSound(from: SourceRequest, path: string, archive: string): void {
  ask({ kind: 'sound', id: soundLane.ask(++requests, shownLoad), source: from, path, archive });
}
function askPlay(from: SourceRequest): void {
  wantedPlay = ++requests;
  playAnswer = 'pending';
  ask({ kind: 'play', id: wantedPlay, source: from, clips: [...PLAY_CLIPS, ...WEAPON_CLIPS, ...TRAVERSAL_CLIPS, ...THROW_CLIPS, ...DEATH_CLIPS, ...FLINCH_CLIPS, ...DOOR_CLIPS, ...BINOCULAR_CLIPS, ...TURRET_CLIPS] });   // the deaths, the flinches: Online can come on at any time
}

// ---- W2.6: the scope and the pad's lanes in play (`./play`, `./walk`) ---------------------------------------------
/**
 * First person and the scope: stepped into by the zoom (research 84; first person restored, owner 2026-10-01) -- third,
 * first person, the scope's levels, back to third. The right mouse button on the canvas is the zoom's press (a
 * `mousedown`, which fires for each button, where a `pointerdown` does not while another is held). The fire button is
 * W2.4's.
 */
canvas.addEventListener('mousedown', (e) => { if (e.button === 2 && (import.meta.env.DEV || testroomKbm()) && !armory.isOpen() && !loadingJoin.blocked) stepZoom('cycle'); });   // RB-8: offline

/**
 * The merged lanes (the pad and the touch buttons, `padFrame`) in play: the crouch on the release (docs/PLAYTEST.md
 * step 8; `playActions`; the jump on the press is `padFrame`'s, read ahead of the shoulders), and the stance button's
 * tap (crouch) and hold (prone;
 * `StanceButton`, one step a frame). In the fly camera the same lanes are up and down.
 */
const stanceButton = new StanceButton();
/** PAR-24 (research 252): the frame's real seconds, read once a frame; the timed rules count them, the simulation the clamped step. */
const frameTime = new FrameTime();
/** PK-3, a browser adaptation (`./ephPause`): the parity pack's Pause, `__viewer.ephPause`; a no-op without the bare `?devmode`. */
const ephPause = new EphPause(EPH_ON, () => frameTime.restart());
/** The game's lanes' parts (`./matchLanes` `playerLanes`): the shoulders through the R2 inventory's binds, the action's lanes. */
// OT.R72: the look stick from the live Options manager while it is up (its globals and UI vars: CUSTOM's sliders), else
// the card's -- the START menu never sets it; PAR-36: the live shared OPTIONS (`./matchOptions`, both pages' part) and the
// volume masters.
const playOptions = matchOptions(() => ({ ...playOptionsOf(startMenuOptions), stick: (pageOptions ? playOptionsOf(pageOptions.globals, pageOptions.uiVars) : cardReads.options()).stick }));
audio.setTunerVars(() => pageOptions?.uiVars ?? cardReads.tuners());
const lanes: LaneParts = {
  walk, firearm, stanceButton, fireModeSetting: playOptions.fireModeSetting,
  shoulder: (which) => { takeSlot(inventory.binds()[which]); },
  action: (before, after, dt) => { acts.lanes(before, after, dt); },   // XR-06's lifecycle, then research 86's lanes
};


/**
 * The `discChosen` mark's take-back rule (research 100; `@s2u/ui`'s `DiscChoice`, pinned by its test): a disc refused
 * -- no ISO, no archive that names itself, the worker failing -- takes back only its own mark, and a disc chosen over
 * one still being read moves the mark to its own choosing.
 */
const DISC_CHOICE = new DiscChoice(LOAD_MARKS);

/**
 * The player's own disc (W1.7, milestone M5): a `File` from the panel's file input or dropped on the page -- or a
 * disc request, image or picked folder (DA-3, `./discSource`) -- handed to the worker, which lists its maps by range
 * and reads the chosen archive out of it. The disc is never uploaded and the page itself reads none of it.
 * A folder (DA-4; DA-3's review F1) is checked here first, once (DA.R8): the worker trusts only a request the page
 * resolved. The order -- not over a map switch, before or after the check (MJ-3); the older disc still indexing
 * forgotten when a folder is chosen; a disc chosen meanwhile wins; a refusal said as the worker's are -- is
 * `./discSource` `discOpener`'s, tested there over these parts.
 */
const openDisc = discOpener({
  switching,
  chosen: () => { DISC_CHOICE.chosen(); },
  refused: () => { DISC_CHOICE.refused(); },
  status: (text) => { ui.setStatus(text); },
  discState: (text) => { ui.setDiscState(text); },
  ask: (disc) => { askIndex(disc); },
  forget: () => { wantedIndex = ++requests; wantedIndexFrom = source; },
  failed: (failure) => {
    REPLAY_WORLD?.failed(failure);                     // MU-11: the replay viewer says it
    reportDecodeFailure(ui, failure, nothingOpen());
  },
});
ui.onDisc(openDisc);

// A worker that fails without a reply -- its module will not load, an exception outside a request's `try`, a reply the
// page cannot read -- is told as the worker's own errors are, not left on "reading ..." (`./decodeFailure`).
wireWorkerFailure(worker, ui, () => { REPLAY_WORLD?.failed('the page\'s decoder stopped'); wantedIndexFrom = source; DISC_CHOICE.refused(); return nothingOpen(); });
// MU-11: framed as the replay viewer's world -- the chrome away, the viewer's opened disc image read as a dropped one.
if (REPLAY_WORLD) enterReplayWorld(document, REPLAY_WORLD, openDisc, SERVED !== null);
// INT-LOADING: original presentation, held through browser preparation and the room's welcome.
const loadingScreen = attachLoadingScreen(worker, () => wantedMap, document);
worker.addEventListener('error', () => loadingJoin.failed(wantedMap));
worker.addEventListener('messageerror', () => loadingJoin.failed(wantedMap));
worker.addEventListener('message', (event: MessageEvent<ViewerResponse | ModDiscReply>) => {
  const message = event.data;
  if (message.kind === 'error') {
    // A lane's request that failed is answered for the loading screen (`./loadingJoin`): it waits on it no more.
    if (message.id === wantedPlay) playAnswer = 'none';
    // FP-6 item 5: an authored map's library that would not load answers its ask (the load goes on without one).
    if (libraryAsk && message.id === libraryAsk.id) { const l = libraryAsk; libraryAsk = null; l.reject(new Error(message.message)); return; }
    // LATER 440: each for the load it was asked for -- a superseded load's late failure never answers for the wanted one.
    loadedSound = soundLane.answers(message.id) ?? loadedSound;
    loadedEffects = effectsLane.answers(message.id) ?? loadedEffects;
    loadedArmory = armoryLane.answers(message.id) ?? loadedArmory;
    if (message.id !== wantedIndex && message.id !== wantedMap) return;
    if (message.id === wantedMap) { loadingJoin.failed(wantedMap); loadingScreen.panel.hide(); reopenArmory = false; reopenArmoryData = false; }
    // A disc that will not open changes nothing, and its chosen mark is taken back (research 100).
    if (message.id === wantedIndex) { wantedIndexFrom = source; DISC_CHOICE.refused(); }
    // On the disc page the page's own line says it; the panel is not unfolded over it. With nothing open the disc
    // page is offered to say it on (a disc dropped while the page came up, review 2 m-15).
    const failure = `failed while ${message.doing}: ${message.message}`;
    REPLAY_WORLD?.failed(failure);                     // MU-11: the replay viewer says it
    reportDecodeFailure(ui, failure, message.id === wantedIndex && nothingOpen());
    return;
  }
  if (message.kind === 'index') {
    if (message.id !== wantedIndex) return;
    // An archive that would not name itself is said on the disc page's line (`./discIndex`, PL-11); when not one did,
    // the disc stays unopened, as a disc that will not open at all does.
    const verdict = indexVerdict(message.maps, message.problems);
    if (verdict.note) ui.setDiscState(verdict.note, 'error');
    // Not one archive named itself, or none is there at all (another game's image): the source does not switch, and
    // the picker and the walker's clips stay as they were (`indexVerdict`'s `open`, review 2 m-16).
    if (!verdict.open) {
      const line = verdict.note ?? (isDiscRequest(wantedIndexFrom.kind)
        ? 'the disc image holds no RUN/MP*.ZDB archives: is it SOCOM II?' : 'the served index lists no MP archives');
      wantedIndexFrom = source;
      DISC_CHOICE.refused();
      ui.setDiscState(line, 'error');
      REPLAY_WORLD?.failed(line);                      // MU-11: the replay viewer says it
      reportDecodeFailure(ui, line, nothingOpen());
      return;
    }
    source = wantedIndexFrom;
    indexDiagnostics = verdict.diagnostics;
    discOpened(ui, verdict.note);                               // a disc (or the served tree) is open: the map comes
    DISC_CHOICE.indexed();                                      // the chosen disc is open: its mark stands
    showMaps(message.maps, message.campaign ?? []);
    askPlay(source);
    // A disc or the served tree is open: the panel's listing is asked again, while a mod is held (`wantsDisc`).
    if (modPanel?.wantsDisc()) worker.postMessage({ kind: 'mod-disc' });
    return;
  }
  if (message.kind === 'play') {
    if (message.id === wantedPlay) {
      playClips = message.data; installPlayClips();
      playAnswer = message.data ? 'clips' : 'none';
      if (solo && !solo.clips && loaded) connectNet(loaded);    // the single-player room made again with the clips
    }
    return;
  }
  if (message.kind === 'sound') {
    const forLoad = soundLane.answers(message.id);
    if (forLoad !== null) { loadedSound = forLoad; sound.setData(message.data); taunts.setData(message.data); menuCaptions = message.data?.taunts?.captions ?? null; chat.setData(message.data); tauntDev?.refresh(); }   // INT.R7: the cues as they land
    if (forLoad !== null) hud.setLocCaptions(menuCaptions);   // LkPaioX5 (b): the action caption's HudCLOC strings (the bomb's)
    return;
  }
  if (message.kind === 'soundLoops') {
    if (message.id === soundLane.id) sound.setLoops(message.loops);
    return;
  }
  if (message.kind === 'effects') {
    const forLoad = effectsLane.answers(message.id);
    if (forLoad === null) return;
    loadedEffects = forLoad;
    firearm.setEffects(message.data);                // the runs, the scope lenses' rows, the marks, the penetration (`./matchFirearm`)
    pageWorld?.setAmbient(message.data.ambient);   // LATER 409 F1: the effect runner's ambient, played by it alone
    warmEffects();                                   // research 90 item 16: compile the effects before the first shot
    return;
  }
  if (message.kind === 'progress') {
    if (message.id !== wantedMap) return;               // a stage of a load we have moved on from
    ui.setLoading(true, STAGE_WORDS[message.stage], message.total > 0 ? message.done / message.total : 0);
    return;
  }
  if (message.kind === 'loading') return;              // the loading screen's own (`attachLoadingScreen` above)
  if (message.kind === 'mod-disc') return;             // the mod panel's own (`./mods/panel`)
  // The ARMORY's data (web sprint 5 S3, `./armoryData`): the screen's layout, scripts, strings, fonts and bitmaps.
  if (message.kind === 'armory') {
    const forLoad = armoryLane.answers(message.id);
    if (forLoad !== null) {
      loadedArmory = forLoad;
      armoryData(message.data);
      // A mod reload waits for this data and for the loading screen (`tryReopenArmory`). Opening here, while
      // the load is still up, is closed when the fresh data replaces a screen seated on the previous one.
      if (reopenArmory) reopenArmoryData = true;
      tryReopenArmory();
    }
    return;
  }
  // FP-6 item 5: an authored map's library (`loadContent`), on its own id: handed to that load, never shown.
  if (libraryAsk && message.id === libraryAsk.id) { const l = libraryAsk; libraryAsk = null; l.resolve(message.map); return; }
  if (message.id !== wantedMap) return;
  roomLibrary = message.map;
  const pieced = piecesOnShow(message.id, message.map);
  shownFrom = wantedMapFrom;
  customProps.clear();                              // PR #756 P2: every world replacement frees the custom props
  show(pieced ? customOffline.mark(pieced.map) : message.map);
  askSound(mapSource, message.map.path, message.map.archive);
  askEffects(mapSource, message.map.path, message.map.archive);
  askArmory(mapSource, message.map.path, message.map.archive);
  if (pieced) drawContentProps(pieced.tc, message.id, pieced.props);
});

ui.onMapChange((path) => {
  if (!path) return;
  ui.setStatus(`loading ${path} ...`);
  load(path);
});
// FP-6 item 5 (FP.R13; a test instrument's): the Custom Maps select after the map select (which stays as it is), listing the
// Forge's rows over the page's shared source (`./forge/customMaps` `customMapRows`), read again when MODS changes the
// packs; never in the replay's world. A row is opened by `openCustom`.
if (!REPLAY_WORLD) void testroomContent().then((tc) => {
  const customSelect = tc.mountCustomMapsSelect(document, document.getElementById('maps')?.closest('.s2u-field') ?? null, (v) => { void openCustom(v); });
  refreshCustomOffline = () => { customSelect.setOnline(!!NET.url); };
  refreshCustomOffline();
  const relist = async (): Promise<void> => {
    try { customSelect.set(await tc.listCustomMaps(await tc.pageContentSource(), pageIndexedDb())); } catch { customSelect.set([]); }
  };
  void relist();
  try {
    const channel = browserChannel(MODS_CHANNEL);
    if (channel) channel.onmessage = () => { void tc.pageContentSource().then((s) => s.refresh()).then(relist, relist); };
  } catch { /* no channel: the list read at boot stands */ }
}).catch(() => { /* the chunk did not load: the room has no Custom Maps select */ });
// TR-1 (TR.R2), a test instrument's: the bar's map dropdown reloads the room on its map -- shown on the served tree only
// (a disc image is not kept over a reload), never in the replay's world (`./testroomMapBar`).
ui.onBarMap(() => !REPLAY_WORLD && SERVED !== null && source === SERVED);
// TR-2 (TR.R3): the room's online server's played maps (`GET /maps`) marked on the bar, read again as the choice moves.
const servedMaps = new ServedMapsRead((stems) => ui.markServedMaps(stems));
if (!REPLAY_WORLD && SERVED !== null) {
  void servedMaps.read(NET.url);
  ui.onOnline((choice) => servedMaps.read(resolveOnline('', choice, PAGE_LOCATION).url));
}
// Restores the picture -- the address's `view`, else the page's one picture (RB-16, PS-4: `pagePicture`, the key Home's
// Options > Display "Video" row and VIDEO MODE write, followed while the page runs) -- before the toggles are read; the
// link follows it.
const previewLook = ui.onLook(SHARE.view, (view) => updateAddress({ view }), pagePicture());
updateAddress({ view: ui.toggles().ps2look ? 'ps2' : 'modern', ...(FLY.dropFly ? { drop: [FLY_PARAM] } : {}) });   // a player's `&fly` leaves
// RB-16 (PS-7; CPS.R7's video settings, a browser adaptation): the shared video keys on the test room, set before the
// toggles are announced -- the panel's shadows toggle is the Shadows key (it writes it, `applyToggle`, and follows it), and
// the frame counter is drawn by Show FPS (a `?devmode` page keeps its instrument's counter).
ui.setToggle('shadows', shadowsOn);
ui.setFpsShown(pageVideo.get().showFps || DEV.tools);
pageVideo.observe((v) => { ui.setToggle('shadows', v.shadows); ui.setFpsShown(v.showFps || DEV.tools); });
ui.onToggle(applyToggle);
ui.apply(applyToggle);
ui.onChromeToggle(testroomKbm);
ui.onFullscreen(testroomKbm);

// ---- W2.7: the controller (`./gamepad`, ruling W2.R5) ------------------------------------------------------------
/** The pads, from the events and the poll: a toast names each that comes, and says when one goes (W2.R5). */
const pads = new PadWatch({
  connected: (id) => {
    ui.toast(`Controller connected: ${id}`);
    ui.setPadConnected(true);                     // the Controls popover's Controller tab
  },
  disconnected: () => {
    ui.toast('Controller disconnected');
    ui.setPadConnected(pads.count() > 0);
  },
  // XR-06 (research 214 s4): a Cross held on the lost pad is a cancel, never the release its vanished lanes would read as
  // (`pads.poll` runs before `traversal.padLanes` in `padFrame`). `cancelAction` cancels the traversal's hold too.
  cancel: () => cancelAction('padLost'),
});
pads.attach(globalThis);
// The development keyboard's X (OT.R29: a development build's only; RB-8, OT.R114: and the test room's while offline), its
// edges to the lifecycle as Cross's: in the capture phase, so the release fires the page's context before
// `TraversalPage`'s keyup asks the walk's action.
{
  const isX = (e: KeyboardEvent): boolean => e.code === 'KeyX' && !e.ctrlKey && !e.metaKey && !e.altKey;
  globalThis.addEventListener?.('keydown', testroomKeys((e: KeyboardEvent) => {
    if (!isX(e) || walk.mode() !== 'walk' || !traversal.keysOpen() || tauntDev?.isOpen()) return;   // the open SETUP TAUNTS types X
    const el = e.target;
    if (typeof HTMLElement !== 'undefined' && el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'SELECT')) return;
    if (traversal.respawnKeyInputActive()) return;    // RSP-8: its nonrepeat keydown/ownership belongs to the dead controller
    acts.wiring.press();
  }), { capture: true });
  // The release whatever the modifiers (as `TraversalPage`'s keyup): a held X let go with Ctrl down must not stick the hold.
  globalThis.addEventListener?.('keyup', testroomKeys((e: KeyboardEvent) => { if (e.code === 'KeyX' && !traversal.respawnKeyInputActive() && acts.wiring.lifecycle.down()) acts.wiring.release(); }, true), { capture: true });
}
/**
 * The pad the match reads (the owner, 2026-10-04: "make sure the game retains controller and mic settings as the setup
 * implies"; `./setupPad`): the setup page's device, bindings, dead zone and crouch shortcut. `pads` still says when one
 * comes and goes. Nothing customised, the physical pad as before. No rest-wait (`waitForRest` false; the menus keep it,
 * for the setup page's START): the loading hold's release flushes the pad as the original's state start does (research
 * 116 R116.13, `FUN_002d9e00`; `./padFlush` in `padFrame`), and a pad connected mid-match is a press, as there.
 */
const gamePad = new GamePad({ waitForRest: false, pressClock: () => performance.now() });   // MOVE-S6: the stance press on the game frame
/** Whether the touch layer is hidden under the open ARMORY (`syncArmoryTouch`). */
let armoryTouch = false;
/** The touch layer let go: its sticks, and every button lane held (released on the next frame, as a lift is). */
function releaseTouch(): void {
  touch.release();                                 // PAR-5 (`./matchTouch`): the touch C cancelled too, no prone behind the screen
}
/** The pad's own input last frame, for its edges; and what the camera and the mover were fed, for the hook. */
let padLast: Input = noInput();
let padMerged: Input = noInput();
/** What the game's lanes read last frame: the merged input less the lanes the R2 inventory holds (`InventoryMenu.frame`). */
let padGame: Input = noInput();
/** XR-06: the screen over the game last frame (the ARMORY, a menu), for the cancel on its opening. */
let menuOver: CancelCause | null = null;
/**
 * One frame of the controller, before the camera's: the pad read through the layout (`padInput`), merged with the
 * touch stick (the larger push on each axis, the buttons OR-ed; `mergeInput`) and fed to the camera's lanes -- which
 * the fly camera flies by and the walk's mover steps by (`groundWish`), so one mapping drives both (W2.R5). The right
 * stick turns at the arrow keys' rate, scaled (`setLook`). Up and down are the fly camera's; on foot the jump and the
 * crouch are the mover's (W2.3a), to be read from `padMerged` there -- the game's crouch acts on the release
 * (docs/PLAYTEST.md step 8; `releasedSince`); the stance button's tap and hold are `StanceButton`'s. Start toggles walk and fly on its press, as `G` does on its keydown.
 */
function padFrame(dt: number): void {
  if (nativeSettings.isOpen() && net?.client.state !== 'open') nativeSettings.interrupt();
  if (loadingJoin.blocked) {
    pads.poll(navigator);
    const held = gamePad.poll(navigator);
    touch.padConnected(readsPad(gamePad));            // MP-1 (FI.R4): the touch layer hidden while the pad read is a connected one
    exchangePart.hold(new Set([...padButtonsDown(held), ...padButtonsDown(touch.pad)]));   // WEAPON EXCHANGE's edges taken against the pad as it is; MP-1 F2: the touch pad's too
    armoryPart.stick(held, new Set(), false);       // AM-2's review F1: the stick armed through the hold, as the buttons' edges are -- no flick at the release
    // The original's flush at the state's start (research 116 R116.13; `./padFlush`): the edges are taken against the
    // pad as it is, so a button held through the release is held, not pressed, and a stick is live at once.
    const heldInput = padInput(held);
    if (gamePad.crouch) heldInput.crouch = true;
    if (gamePad.prone) heldInput.prone = true;        // PP-5 (OT.R67): the pad profile's Prone bind, flushed with the rest
    playOptions.apply(fly, heldInput);
    releaseTouch();
    ({ last: padLast, merged: padMerged, game: padGame } = flushedPad(touchInput, heldInput));   // the game lanes' read too
    // A button a screen took before the hold is still owned (`./exchangeInput`): the baseline holds it as released, so
    // the first frame after the hold reads no release edge from it (R116.13 unchanged for every other button).
    padMerged = exchangeInput.frame(padMerged, false);
    padGame = exchangeInput.frame(padGame, false);
    fireModeInputFor(lanes).flush(padGame.fireMode);   // PAR-22: the fire-mode button flushed with the lanes' read (FUN_002dba60, research 254 s4)
    inventory.close();
    fire.release();
    fly.setInputSuspended(true);
    if (acts.wiring.lifecycle.down()) cancelAction('loading');   // the loading hold sees no edge: a Cross held into it is let go once, never a lost press
    voice.pad(false);                                  // SVC-20b-page (the review's F4): no talk under the hold
    return;
  }
  pads.poll(navigator);                                // the toasts: a pad come or gone
  const polled = gamePad.poll(navigator);
  touch.padConnected(readsPad(gamePad));              // MP-1 (FI.R4): hidden while the chosen (else the automatic) pad is connected
  const pad = padInput(polled);
  if (gamePad.crouch) pad.crouch = true;              // the setup page's crouch shortcut (no pad row holds crouch)
  if (gamePad.prone) pad.prone = true;                // PP-5 (OT.R67): the pad profile's Prone bind (no pad row holds it)
  walk.setStanceMode(controllerStanceMode());         // OT.R67: the browser's stance mode (the prone-pop by default)
  playOptions.apply(fly, pad);                        // OPTIONS (research 302 §4): the stored pitch, bob and fire-rate swap
  let input = mergeInput(touchInput, pad);
  if (soloAgent) input = mergeInput(input, soloAgent.input());
  // WEAPON EXCHANGE (`./weaponExchange`): closed, R2 opens it when the gate lets it; open, the d-pad, Cross, Triangle,
  // Start and R2 step it, and the game's own lanes below take nothing (HUD mode 1).
  const down = new Set([...padButtonsDown(polled), ...padButtonsDown(touch.pad)]);   // MP-1 (FI.R3): the touch pad's buttons are a pad's
  const edges = exchangePart.edges(down);              // the buttons pressed this frame; the menu's context kept current
  // TAUNTS (`./matchTaunts`): `?devmode`'s SETUP TAUNTS, then the Chat menu -- open, the pad is its (research 301 §7).
  const editorOwns = tauntDev?.frame(performance.now(), down) ?? false;
  nativeSettings.frame(performance.now(), down, polled, touch.pad);
  setBrightness(brightnessOfVars(pageOptions?.uiVars ?? cardReads.tuners()));   // Reuse the landed shared effect for the live Options manager.
  const start = startMenu.pad(down, input, dt);        // MATCH-01: the START menu first; up, the pad is its own
  if (matchAbort.frame(dt)) { net?.close(); for (const line of abortLines(false)) hud.postMessage(line); }
  const chat = taunts.pad(start.held, start.input);
  voice.pad(chat.talk);                                // SVC-20b-page: the talk input's flag (W20.R9)
  input = chat.input;
  document.body.classList.toggle('is-taunts-open', chat.owns || editorOwns || nativeSettings.isOpen());   // the page's chrome off the native editor (`./styles.css`)
  // The ARMORY (web sprint 5 S3): open, the pad is its; no button opens it (the owner's ruling, 2026-10-02).
  armoryPart.stick(polled, edges, playOn && !(start.owns || editorOwns || chat.owns));   // AM-2 (research 340 §2): the ARMORY's dialog takes the stick's flick, as the original's (read before the press: F2)
  const menu = start.owns || editorOwns || chat.owns || playOn && (armory.isOpen() ? armory.pad(edges) : exchangePart.pad(edges));
  // Browser safeguard: no consumed button becomes a game press/release after close or round reset.
  input = exchangeInput.frame(input, menu);
  // Open, the ARMORY holds the game's input (the S3 review): the camera and the walker take no key, stick or look.
  fly.setInputSuspended(menu);
  // Repair 2: the touch layer hidden under the open screen, its sticks and held buttons let go as it opens.
  armoryTouch = syncArmoryTouch(document.body, playOn && armory.isOpen(), armoryTouch, releaseTouch);
  ui.holdToasts(armoryTouch);                              // no toast over the screen's title bar: held till it closes
  feedCamera(fly, input, () => !!net?.spectatorCamera());   // PF-31: Triangle the spectator's while the pad is (`./matchCore`)
  // The pad's Start (developer only, `FLY.toggle`): none while a screen has the pad (repair 2's nit).
  if (playOn && FLY.toggle && !menu && pressedSince(padLast, pad).includes('mode')) walk.setMode(walk.mode() === 'walk' ? 'fly' : 'walk');
  // R1 is the trigger, as the mouse button is: held it fires at the rifle's rate, let go it stops. Only the pad's own
  // edges, so a released R1 never lets go of a mouse button or the touch button still held.
  // The merged lane, so the touch fire button (`touchInput.fire`) is the trigger the same way; a released R1 still never
  // lets go of a button the other source holds.
  if (playOn && !menu && input.fire !== padMerged.fire) trigger(input.fire);
  // A screen taking the pad lets a held trigger go (its R1 is then owned till let go, `./exchangeInput`): else an R1 held
  // into the ARMORY and out past DONE would leave the trigger pulled, its release no edge.
  else if (menu && padMerged.fire) trigger(false);
  // The R2 inventory alive (`./inventoryMenu`, research 94 §4.3): it reads the merged lanes' edges -- R2 opens it; open,
  // d-pad Up / Down, L1, L2, Triangle, Cross and R2 are its -- and hands the game the input less the lanes it holds
  // (its buttons and Square: no stance, jump or action while open, ctrl+0x221). Only walking in play, and never while
  // WEAPON EXCHANGE has the pad.
  const walking = playOn && walk.mode() === 'walk';
  if (!walking && inventory.isOpen()) inventory.close();
  const game = menu || !walking ? input : inventory.frame(padMerged, input, dt, frameTime.real());   // PAR-34: its idle close in real time
  // XR-06 (research 214 s4): the ARMORY's or a menu's opening (WEAPON EXCHANGE, the R2 inventory) cancels the action
  // button's hold -- before the traversal's lanes, so the Cross the menu takes over is no release.
  const over: CancelCause | null = playOn && armory.isOpen() ? 'armory' : menu || inventory.isOpen() ? 'menu' : null;
  if (over && !menuOver) { cancelAction(over); stanceButton.reset(); }   // as the R2 inventory's `onOpened`: no tap or hold carried over
  if (pad.stance && !game.stance) gamePad.cancelStancePress();   // OT.R107: a Triangle a menu took is no late pressure Prone
  menuOver = over;
  walk.holdForMenu(menu || inventory.isOpen());        // discard preexisting keyboard/touch holds when a menu opens
  // Research 84: d-pad Up and Down step the zoom in and out, L3 the fire mode (walking, the rifle up). The edges are of
  // the merged lanes: a touch button and a pad's are the same press. None while WEAPON EXCHANGE has the pad.
  // The game's lanes in the player update's order (`./matchLanes`, `FUN_00594cf0`): the jump, the Action -- Cross's edges to
  // the action lifecycle (wave 4, `./actionWiring`: the press, the hold, the release that fires the page's context now,
  // before the traversal's lanes ask the walk's action), research 86's Cross and the d-pad's sides -- the shoulders (each
  // takes up the slot it holds, the R2 inventory's binds), the zoom, the fire mode, the reload, then the stance. None
  // while WEAPON EXCHANGE or the ARMORY has the pad (`menu`).
  playerLanes(lanes, padGame, game, frameTime.real(), { walking, menu, runAndTalk: startMenu.runAndTalk() });   // PAR-24: the timed holds (the action's, the stance's) in real time
  padLast = pad;
  padMerged = input;
  padGame = game;
  touch.endFrame();                                    // PAR-5: the touch lifts read this frame let go for the next
  if (keepClear) hud.setKeepClear(keepClear.get());   // OT.R82: the message panel kept off the touch controls
  acts.wiring.endFrame();                              // a release the walk never asked about (locked, off the walk) dropped
}
// The ARMORY open (web sprint 5 S3): a tap or a click is read on the 640x448 frame as its presses (`armoryTap`).
canvas.addEventListener('pointerdown', (e) => {
  if (loadingJoin.blocked || !armory.isOpen()) return;
  const r = canvas.getBoundingClientRect();
  // The frame as the ARMORY draws it on the drawing buffer (fitted whole and centred, ARMORY_FRAME_FIT), the CSS box
  // mapped to the buffer first: the PS2 look stretches the buffer onto a 4:3 box (`./armoryView` `frameOfClient`).
  const [fx, fy] = frameOfClient(e.clientX - r.left, e.clientY - r.top, r, { width: canvas.width, height: canvas.height });
  armory.tap(fx, fy);
  e.preventDefault();
  e.stopImmediatePropagation();
}, { capture: true });
// WEAPON EXCHANGE open: a tap or a click on the canvas is read on the 640x448 frame as the menu's presses (`./matchTouch`).
exchangeTaps(canvas, exchangePart);
/**
 * PAR-5 (`./matchTouch`, research 222 §11): the touch layer on the page's body -- the sticks, the buttons, the lanes they
 * hold (`touchInput`, merged with the pad's in `padFrame`) -- and WEAPON EXCHANGE's INV (WEAPON_SELECT_TOUCH_READING),
 * shown while the dead's prompt is up or the menu open. Repair 2: the touch C's press and RELOAD do nothing under the
 * open ARMORY (the C's release and cancel still reach the walk), as the trigger (`trigger`) does not.
 */
const touch = mountTouch(document.body, {
  stance: pressUnlessArmory<'up' | 'cancel'>(() => armory.isOpen(), (event) => walk.stanceTouch(event)),   // the touch C: the PC's C rule (`WalkMode.stanceTouch`)
  fire: trigger,
  reload: unlessArmory(() => armory.isOpen(), () => { if (walk.mode() === 'walk' && !walk.isDead()) fire.reload(); }),
  cancelAction: () => { cancelAction('touch'); },   // XR-06: the action lane taken by the system is a cancel
  exchange: exchangePart, covered: () => armory.isOpen() || loadingJoin.blocked,
});
const { input: touchInput } = touch;
// OT.R82: the touch controls' boxes, measured at a change. Read by `padFrame`, whose one caller is `boot`'s frame loop:
// `boot()` is first called below this line, so the loop never reads it before it is set.
const keepClear = canvas ? keepClearWatch(document, canvas) : null;
ui.onWalkSwitch((on) => { if (!walk.setMode(on ? 'walk' : 'fly')) ui.setWalk(false); });
ui.onPanelToggle();
ui.onControlsPopover();
/**
 * The phone's tip (owner, 2026-09-29; `./mobileTip`): a controller and landscape recommended on a touch device, once a
 * visit and again on each turn to portrait, until the player dismisses it (remembered). A pad connected hides it.
 */
mountTip({ local: tipStoreOf(pageSettings), session: tipStoreOf(tabSettings), pads: () => pads.count(), show: (text, dismiss) => { ui.showTip(text, dismiss); } });
// Round 2: the panel's Sound and Mouse look sections (each is on the page only in reCOM mode), remembered in this browser.
ui.onSound({ volume: (v) => audio.setVolume(v), muted: (m) => audio.setMuted(m) });
ui.onLookControls((opts) => fly.setLookOptions(opts));
const revision = ui.showRevision();

/**
 * reCOM mode on or off (the settings' Mode switch, owner 2026-09-29), at run time and both ways: the play's markup in or
 * out of the page (`PlayUi`), its keys bound or not, the lists in the Controls popover, the body switch let go, the walk
 * left for the fly camera -- and entered when it comes on, as a reCOM visit opens on foot -- and the match joined again
 * in the new role (a player, or a watcher). `remember` is the visitor's choice (not the page's start): it is stored, and
 * the address says the mode so a reload keeps it.
 */
function setPlayMode(on: boolean, remember: boolean): void {
  const was = playOn;
  playOn = on;
  playUi.set(on);
  ui.setPlay(on);
  ui.setRecom(on);
  if (on) { walk.bindKey(); fire.bindKey(globalThis, testroomKbm); } else { walk.unbindKey(); fire.unbindKey(); }
  if (remember) writePlayChoice(on);
  updateAddress({ play: on });                  // the link says the mode (and the retired `redotcom` leaves it)
  if (!on) {
    armoryEntry = null;                           // Play entered again is a new entry: the offline ARMORY opens again
    fire.release();
    if (walk.mode() === 'walk') walk.setMode('fly');
    ui.setWalk(false);
    const bodyBox = document.getElementById('player-body') as HTMLInputElement | null;
    if (bodyBox?.checked) { bodyBox.checked = false; applyToggle('body', false); }
    startedWalk = false;
  } else if (!was && loaded) {
    startedWalk = false;
    startInWalk(loaded.name);
  }
  if (was !== on && loaded) connectNet(loaded);
}
setPlayMode(playOn, false);
ui.onRecomSwitch((on) => setPlayMode(on, true));

/**
 * The Rules setting (OT.R71; `./rules`): the switch shows the match's rules; a choice is remembered, the link's `rules=`
 * (which beat the remembered one) taken out so the choice holds on a reload, and the room made again under it -- the
 * offline match and the server's alike (`connectNet`).
 */
ui.setRules(RULES);
ui.onRules((choice: Rules) => {
  writeRules(choice);
  updateAddress({ drop: ['rules'] });
  RULES = choice;
  if (loaded) connectNet(loaded);
});

/**
 * The Online setting (owner, 2026-09-29; `./online`): the choice remembered, the match joined again at the new server or
 * left. A server the URL named is replaced by the choice.
 */
if (MULTIPLAYER) {
  ui.offerLocal(pageIsLocal(PAGE_LOCATION));    // Local is a developer's: never on a deployed (non-local) build
  ui.setOnline(NET.choice);
  // The link says the choice; a server the address named (`&server=`, which beats it) is not rewritten on load -- only a
  // choice the visitor makes below takes it out.
  if (NET.choice !== 'url') updateAddress({ online: NET.choice });
}
/**
 * PLAYERS ONLINE (owner, 2026-09-29; `./playersOnline`): the panel's kicker and the picker's per-map counts, from the
 * shared server's `/rooms` -- the local server's when Online is Local; a local page (`./online` `pageIsLocal`) reads the
 * shared list only when Online is Shared, and none when Off (`roomsUrl`, 2026-10-07). `VITE_S2U_ROOMS` replaces the shared list at
 * build time (`off`: none; the e2e run sets it, `playwright.config.ts`, while the shared server is not live). Polled
 * about every 20 s while the page shows, paused while it is hidden, stopped when the page goes (and started again if
 * the browser brings it back from its back-forward cache). None at all with multiplayer off (`./multiplayer`).
 */
const ROOMS_OVERRIDE = import.meta.env.VITE_S2U_ROOMS as string | undefined;
const rooms = REPLAY_WORLD ? null : playersPoller(MULTIPLAYER, NET.choice, ROOMS_OVERRIDE, (c) => ui.setPlayerCounts(c), {}, pageIsLocal(PAGE_LOCATION), PAGE_LOCATION);
if (rooms) {
  rooms.start();
  globalThis.addEventListener?.('pagehide', () => rooms.stop());
  globalThis.addEventListener?.('pageshow', (e) => { if ((e as PageTransitionEvent).persisted) rooms.start(); });
  ui.onOnline((choice: OnlineChoice) => {
    writeOnline(choice);
    updateAddress(onlineChoiceAddress(choice));   // the choice replaces a named server: `server=` / `mp` leave the link
    NET = resolveOnline('', choice, PAGE_LOCATION);
    refreshCustomOffline();                         // FP-6 F2: custom maps walk offline only
    rooms.setUrl(roomsUrl(NET.choice, ROOMS_OVERRIDE, pageIsLocal(PAGE_LOCATION), PAGE_LOCATION));
    if (loaded) connectNet(loaded);
    showOnline();
  });
}
/** The connection's line under the setting, and a toast when it comes up or goes unreachable (not at every retry). */
let onlineShown = '';
function showOnline(): void {
  const status = net ? withRefusalMap(net.status(), net.client.refusal) : roomAsk ?? { state: 'off' as const, players: 0, retryIn: 0, watching: !playOn };
  const line = onlineLine(status);
  ui.setOnlineState(line.text, line.lamp, line.countdown);
  const headline = status.state === 'retrying' ? 'unreachable' : status.state;
  if (headline === onlineShown) return;
  const toast = onlineToast(status);
  if (toast) ui.toast(toast);
  onlineShown = headline;
}
showOnline();

/**
 * The map a visitor asked for: `?map=MP7` in the URL first, then the one remembered from last time,
 * then the default. Matched on the archive stem, case aside, so a hand-typed link works.
 */
function wantedArchive(): string {
  try {
    const asked = new URLSearchParams(location.search).get('map');
    if (asked) return asked.toUpperCase();
    const last = readLastMap();   // `./pageStore` LAST_MAP_KEY: a return visit opens where it left off
    if (last) return last.toUpperCase();
  } catch { /* no storage, or no URL to read */ }
  return DEFAULT_ARCHIVE;
}

/** Writes the map into the URL and into storage, both best-effort: a viewer that cannot is still a viewer. */
function rememberMap(path: string): void {
  if (REPLAY_WORLD) return;                     // MU-11: framed as the replay's world, nothing written of the visitor's
  const archive = mapList.find((m) => m.path === path)?.archive;
  if (!archive) return;
  updateAddress({ map: archive });              // `./shareUrl`: the other parameters kept as they were, `&fly` still bare
  writeLastMap(archive);                        // a failure is reported by `./pageStore`; the default next time
}
ui.onSlider((name, value) => {
  if (name === 'fognear' || name === 'fogfar') fogIsMine = true;
  applySlider(name, value);
});
ui.applySliders(applySlider);

/** The sliders: the brighten is a uniform on every material, so moving it rewrites no vertex. */
function applySlider(name: SliderName, value: number): void {
  if (name === 'brighten') { lighting.brighten = value; refreshFog(); }
  // A slider only owns the fog once the player has moved it: `applySliders` is also called on every
  // map load, and the range input has snapped the decoded value to its step by then.
  else if (name === 'fognear') { if (fogIsMine) { fog.near = value; refreshFog(); } return; }
  else if (name === 'fogfar') { if (fogIsMine) { fog.far = value; refreshFog(); } return; }
  view?.setLighting(lighting);
  body?.setLighting(lighting);
}

/** The panel's markers: hostages and extraction zones, and the spawn overlay while either control wants it. */
function setDevMarkers(on: boolean): void {
  devMarkersOn = on;
  drawDevMarkers();
}
/** TRS-CONDENSE (the owner, 2026-11-01): the panel's markers are drawn only while the panel is open (`devOverlayDrawn`). */
function devMarkersDrawn(): boolean {
  return devOverlayDrawn(devPanel?.isOpen() ?? false, devMarkersOn);
}
function drawDevMarkers(): void {
  overlays.setObjectives(devMarkersDrawn());
  overlays.setSpawns(spawnOverlayOn(devMarkersDrawn(), ui.toggles().spawns));
}

/**
 * PF.R60 (`./detailDistance`, a browser adaptation over PF-30's gate): the test room's world at the page's one
 * stored detail distance under its Modern look, and at the original's (1) under its PS2 look.
 */
function applyDetailDistance(): void {
  view?.setDetailDistance(detailDistanceFor(presentation === 'ps2' ? 'ps2' : 'modern', readDetailDistance()));
}

function applyToggle(name: ToggleName, on: boolean): void {
  if (name === 'grid') overlays.setGrid(on);
  else if (name === 'collision') overlays.setCollision(on);
  else if (name === 'spawns') overlays.setSpawns(spawnOverlayOn(devMarkersDrawn(), on));
  else if (name === 'wireframe') view?.setWireframe(on);
  else if (name === 'fog') { fog.enabled = on; refreshFog(); }
  else if (name === 'blendgraded') view?.setBlendGraded(on);
  else if (name === 'engineorder') view?.setEngineOrder(on);
  else if (name === 'shadows') {                // RB-16 (PS-7): the Shadows key's, as the front end's match draws it
    shadowsOn = on;
    view?.setShadows(on);
    if (!on) charShadow.shadow.clear();
    pageVideo.set({ shadows: on });
  }
  else if (name === 'alternate') view?.setAlternate(on);
  else if (name === 'detail') view?.setDetail(on);
  else if (name === 'linestrips') view?.setLineStrips(on);
  else if (name === 'billboards') view?.setBillboards(on);
  else if (name === 'untextured') view?.setUntexturedHighlight(on);
  else if (name === 'rigeverywhere') { lighting.rigEverywhere = on; view?.setLighting(lighting); }
  else if (name === 'body') play.setFlyToggle(on);        // W2.2b: the body in fly mode; in play it is always shown
  else if (name === 'ps2look') {
    presentation = on ? 'ps2' : 'native';
    applyDetailDistance();                        // PF.R60: the PS2 look keeps the original's (1)
    document.body.classList.toggle('ps2-look', on);
    fit?.();
    screenOrigin.layLater();                      // RB-16: the canvas's box changed with the look; SCREEN POSITION re-laid on it
    updateAddress({ view: on ? 'ps2' : 'modern' });   // however it was switched, the link follows (`./shareUrl`)
  }
}

boot().catch((e: unknown) => {
  // No WebGPU and no WebGL2: the page has nothing to draw with, and should say so rather than sit on
  // "booting" for ever.
  ui.setStatus(`this browser offers neither WebGPU nor WebGL2, so there is nothing to draw with: ${e instanceof Error ? e.message : String(e)}`, 'error');
  REPLAY_WORLD?.failed('this browser offers neither WebGPU nor WebGL2, so there is nothing to draw with');   // MU-11
});

/** Brings the renderer up, starts the frame loop, then asks the worker for the map list. */
async function boot(): Promise<void> {
  // MODS_SCOPE_ADAPTATION (the owner, 2026-10-19): the test room's mods, offline or online. Never a lobby match reached
  // through the standard UI paths (the front end's page and worker never load this module or its tables), and never the
  // console's replay viewer framing this page: a replay was recorded without mods, so drawing it with them would
  // misreport what was played. `ready` is bounded and opens no store on a boot with no mods.
  modPanel = REPLAY_WORLD ? null : mountModPanel(document, worker, { reloadMap: () => { if (loaded?.path) load(loaded.path, true); } });
  await modPanel?.ready;
  const created = await createRenderer(canvas!);
  // OT.R92 (HD-6): the HD pack made for PCSX2, test room only; it requests nothing until its switch is on. An HD pack zip
  // given to the test room's "Import pack (.zip)" is kept in this browser and used before a served one.
  // Outside the test room the texture registry stays off: nothing is registered or kept (review finding 6).
  if (document.body.classList.contains('test-room')) hdTextures.collect();
  // B206 ML-3 / ML-4 (ML.R5, R8, R10, R13; product track, ML.R2): the texture pack chosen in MODS (Home > Experiments >
  // Mods) applied here as on every page -- the HD pack from the MODS store only (ML.R4), drawn as made offline and under
  // the online guard in a room on a server; a GX per-map pack on its own map -- behind the overlay, spread over the
  // frames. The Experimental panel's chooser and HD switch are removed (ML-6).
  const packFrames = new ApplyFrames();
  packFrames.setUploader(rendererUploader(created.renderer));   // after ML-9 (ML.R10): each upload timed in its frame
  // ML-9's F1: the strip in live play (Play on, walking, alive), as the match's overlay (`./matchMount`'s `packLive`).
  const packOverlay = document.body.classList.contains('test-room') ? new PackApplyOverlay(document, () => pagePlayLive(playOn, walk.mode() === 'walk', walk.isDead())) : null;
  // B206 ML-6: the panel's HD switch, its status line and its texture-pack group are removed; the HD pack's words reach
  // the overlay alone.
  const hdPack: HdServedPack | null = document.body.classList.contains('test-room')
    ? new HdServedPack(undefined, () => { packOverlay?.update(hdPack?.progress() ?? null); }, undefined, pageHdStore(),
      // After ML-9 (ML.R10) and GM-13d: the pack's decodes, keys and alpha rescale in the decode worker, as the front
      // end's match does (a 16 MiB BC7 decode on the main thread was a 300 ms frame in the test room).
      lazyHdPackDecoders(() => import('./hdMenuTextures').then((m) => new m.HdMenuDecoder())),
      { storeOnly: true, runtime: { opaqueGuard: () => !!NET.url && net !== null && !REPLAY_WORLD, frames: packFrames } }) : null;
  localTexturePacks = mountLocalTexturePacks(document, undefined, undefined,
    { reported: (r) => { packOverlay?.update(gxApplyProgress(r)); }, frames: packFrames });
  const gxPacks = localTexturePacks;
  reguardPacks = () => { hdPack?.runtime.reguard(); };
  testRoomPacks = hdPack ? new PackApplier<TexturePackTarget>({ choice: pageTextureChoice(), registry: hdTextures, hd: () => hdPack, gx: () => gxPacks }) : null;
  // ML-10 F6: no archive reader -- the runtime's `importZip` (its only reader) has no caller since ML-6; a plain pack is
  // built through the MODS registry (`packs/registry.ts`, its `loadedTextures` option gives it the loaded archive).
  mountExperimentalGraphics(document, (settings) => {
    created.setExperimental(settings);
    // B206 ML-3 / ML-6 (ML.R8, OT.R110): the texture packs follow the MODS choice (`testRoomPacks`), never this panel,
    // which reads no pack (`settings.localTexturePack` and `hdPack` are `MODS_PACK_SETTINGS`' off values).
    const uiSampling = {enabled: settings.enabled && settings.hudSampling, mode: settings.hudMode, sharpness: settings.hudSharpness, snap: settings.hudSnap};
    hud.setExperimentalSampling(uiSampling);
    reticle.setExperimentalSampling(uiSampling);
  }, () => previewLook('modern'));
  linkLog = created.links;
  if (import.meta.env.DEV && devToolsEnabled(SEARCH)) window.__viewer.renderStats = () => renderStats([['page', created.renderer]]);   // PRF-4: the dev panel's gate
  if (import.meta.env.DEV && devToolsEnabled(SEARCH)) window.__viewer.frameHash = (size, options) => hashFrame(created.renderer as unknown as FrameHashRenderer, scene, fly.camera, size, options);   // CPS.R9 (e): the world in a target, hashed; the same gate
  if (import.meta.env.DEV && devToolsEnabled(SEARCH)) window.__viewer.holdFrame = (on) => { frameTime.hold(on); };   // cps-frame-hash-2: the frame's dt and real seconds held at 0 for the gate; the same gate
  if (import.meta.env.DEV && devToolsEnabled(SEARCH)) window.__viewer.followSeat = (n) => (net ? followSeat(net.spectator, n) : null);   // cps-frame-hash-3: the replay's spectator follows a seat (its own Right released) so the hashed view holds bodies; the same gate
  if (import.meta.env.DEV && devToolsEnabled(SEARCH)) window.__viewer.bodiesInView = () => bodiesInView(fly.camera, remote.seenForDev().bodies);   // cps-frame-hash-3: the drawn bodies in the page camera's view and layers; the same gate
  if (import.meta.env.DEV && devToolsEnabled(SEARCH)) { const diag = frameDiag({ scene: () => scene, bodies: () => remote.seenForDev().bodies, spectator: () => net?.spectator ?? null, clearShadow: () => charShadow.shadow.clear() }); window.__viewer.frameDiag = (v) => diag.set(v); window.__viewer.frameState = () => { diag.beforeRead(); return frameState(fly.camera, remote.seenForDev().bodies); }; }   // cps-frame-hash-4: the gate's diagnosis -- a variant on or off, and what the next render is drawn from; the same gate
  // The effects with the scene they light, the way the world is warmed (the PS2 frame's target, the hidden through
  // stand-ins): research 90 item 19, a light pass compiled for the canvas alone still stalled the first blast.
  compileEffects = async () => { fly.camera.updateMatrixWorld(); await created.warm(scene, fly.camera); };
  warmEffects();
  const { render, resize, backend: chosen } = created;
  setClearColor = created.setClearColor;
  warmScene = (extras) => created.warm(scene, fly.camera, extras);
  // The ARMORY's two passes (its bitmaps' quads, its preview models), compiled when its data lands (web sprint 5 S3).
  warmArmory = async () => { await Promise.all(armoryView.warmTargets().map((t) => created.prepare(t.objects, t.scene, t.camera, { screen: true }))); };
  void warmArmory();
  prepareObjects = (objects, stale, lanes) => created.prepare(objects, scene, fly.camera, { stale, lanes });
  warmWalk = async () => {
    const b = body, stale = (): boolean => body !== b;
    const overlays = [hud.warmTarget(), reticle.warmTarget()];
    await Promise.all([
      b ? created.prepare([b.group], scene, fly.camera, { stale }) : null,
      b ? charShadow.warm(b.group, scene, created.prepare, stale) : null,   // PAR-6: the shadow map's programs (`mountCharShadow`)
      ...overlays.map((o) => created.prepare([o.scene], o.scene, o.camera, { screen: true })),
      // Research 90 #23: the throw's arc and a blast's scorch, ahead of the scene-wide warm-up (which reaches them last).
      throws.warm((objects) => created.prepare(objects, scene, fly.camera, { stale })),   // `./matchThrow`: both pages' warm-up
    ]);
    if (!stale()) rehearsal = b;                     // #21: compiled; now drawn once, off the walk's first frame
  };
  ui.onFogColour((rgb) => { fog.color = rgb; refreshFog(); });
  refreshFog();
  backend = chosen;

  // Trades pixels for frames (`./matchViewport` `AdaptiveRatio`, PAR-12). A phone that cannot hold Crossroads at 1.5x
  // drops to 1.25x, then 1x, and climbs back when it can; a desktop that never runs long never moves. Not while a map is
  // arriving, whose frames are long on purpose, and never in the PS2 presentation, whose size is the point.
  const adaptiveRatio = new AdaptiveRatio(RATIO_CAP);
  // CPS-4a (CPS.R7, a browser adaptation): the page's render scale (`./videoSettings`, Balanced by default) caps the ratio
  // for the canvas's box at each fit, met at the ratio's next tick; a change in the launcher's overlay is heard.
  const videoSettings = videoSettingsKeeper();
  fit = (): void => {
    adaptiveRatio.setCap(renderCapFor(videoSettings.get().renderScale, globalThis.devicePixelRatio, wantsTouchControls(), canvas!.clientWidth, canvas!.clientHeight).ratioCap);
    created.setPresentation(presentation);
    hud.setPresentation(presentation);
    if (presentation === 'ps2') {
      // The console's frame: 640 by 448 pixels, and a projection built in those pixels from the map's
      // own half-angles, which the page then stretches onto 4:3 exactly as the television did.
      resize(PS2_FRAME.width, PS2_FRAME.height);
      fly.setAspect(loaded?.camera ? Math.tan(loaded.camera.hfov) / Math.tan(loaded.camera.vfov) : PS2_ASPECT);
      return;
    }
    const width = Math.max(1, canvas!.clientWidth);
    const height = Math.max(1, canvas!.clientHeight);
    resize(width, height);
    fly.setAspect(width / height);
  };
  fit();
  // The window's resize; a phone's browser bar, which comes and goes without a window resize (the visual viewport says
  // when); the rotation (`./matchViewport` `watchViewport`, PAR-12: both pages' listeners).
  watchViewport(globalThis, fit);
  videoSettings.observe(() => { fit?.(); });

  // A frame time smoothed over about half a second: the raw number flickers too much to read, and the
  // point of the counter is to notice a map that costs 30 ms, not to watch it jitter.
  adaptiveRatio.start(created);                         // PAR-12: at the cap `fit` set (CPS-4a)
  /**
   * Research 90 #21 (`./rehearsal`): the walk's first draws -- the SEAL and what it holds, its shadow map's pass, the
   * throw's arc, the HUD and the reticle -- made once in a frame before the walk, before that frame's own render,
   * which clears over them.
   */
  const rehearseWalk = (b: BodyView): void => {
    const arc = grenade.warmObjects().filter((o) => o.parent !== null);
    rehearse(scene, [b.group, ...arc], () => {
      charShadow.shadow.update(created.renderer, scene, b.group);
      render(scene, fly.camera);
    }, (o) => o.userData['effectLightPass'] === true);
    charShadow.shadow.clear();
    for (const o of [hud.warmTarget(), reticle.warmTarget()]) {
      rehearse(o.scene, o.scene.children, () => {
        const autoClear = created.renderer.autoClear;
        created.renderer.autoClear = false;
        try { created.renderer.render(o.scene, o.camera); } finally { created.renderer.autoClear = autoClear; }
      });
    }
    warmedAt['rehearsed'] = performance.now();
  };
  const frame = (): void => {
    const dt = Math.min(frameTime.frame(performance.now()), 0.1);     // a backgrounded tab must not teleport the camera (PAR-24: the real seconds kept)
    if (ephPause.held()) { requestAnimationFrame(frame); return; }   // PK-3 (`./ephPause`): paused, nothing steps or draws; the resume re-bases the clock
    // R6 (the round 5b review): Play, Walk and a new map end the shot first (`mode` / `map`), so the walk's own pitch set
    // or a map's look is never read as the person's move; then the takeover test (R5-B: the person moved the camera).
    soloAgent?.shotSeams();
    if (roomShot?.driver.active() && walk.mode() !== 'fly') roomShot.driver.stop('mode');
    if (roomShot?.overridden()) roomShot.driver.stop('manual');
    soloAgent?.frame(dt);           // browser adaptation: jobs contribute to this real frame, never extra simulation ticks
    const raw = dt;
    {
      const dt = scaleDt(raw);       // the dev panel's clock; identity until its development import, so a release frame is `dt`
      padFrame(dt);                   // W2.7: the pad and the touch stick into the camera's lanes, before it steps
      firearm.beforeMove();           // the bob: states 1-3 (research 83)
      fly.update(dt);
      traversal.input();              // research 86: the peek held (Q / E, the pad's lean lanes)
      net?.trigger(fire.triggerHeld() || acts.triggerHeld());   // LATER 347: the trigger the frame's commands carry, set before the walk builds them (LATER 236's order for the view)
      walk.frame(dt);                 // walk mode: the mover's 60 Hz ticks, the game's camera after each, the view placed
      const walking = walk.mode() === 'walk';
      firearm.gunFrame(dt, walking);  // research 84: the view tick, the bloom, the zoom and its FOV, the lens
      throws.poseFrame(dt);           // the throw clip's `throw_whoosh` (`./matchThrow`)
      firearm.kitFrame(dt, walking);  // WEAPON: the swap's hand-off and end (`./kit`), the mounts
      play.frame(dt, walk, fly.camera, frameTime.real(), net ? corpseShownS(net.roomRules(), 'own', net.waitingRoom()) : Infinity, net?.ghost() === true);   // W2.2b: the body at the drawn feet in its clip; hidden in the scope (PAR-34: the lowering in real time); PAR-91: the own corpse by the room's rules (the welcome's; the offline room's are the page's RULES, classic); NU-11b H2: a ghost's own body unseen
      firearm.beforeNet();            // DEAD: the dead's controller takes the respawn press alone -- a held trigger lets go
      remote.setListener(net ? walk.feet() : null);   // PF-25 (research 219 §4): the others' footfalls, the nearest three
      net?.frame(dt, fly.camera, fire.triggerHeld() || acts.triggerHeld(), frameTime.real());   // MULTIPLAYER: the others at the view tick, the clock (PAR-34: a rescued hostage's fade in real time; NU-4: a corpse has none -- was: the bodies' fades)
      // Fix round: `NetPage`'s reconnect replaces its client inside `net.frame` (`retry`); the pages follow the new one at
      // once, before any of its socket's events (a later task) -- its welcome included. The dropped client gave the walk
      // back unlocked (`NetClient.release`), so the reset's turret release unlocks nothing (the new client's lock stands).
      acts.followNet();
      exchangePart.frame();           // WEAPON EXCHANGE's context kept current (`./matchExchange`)
      touch.weaponsFrame();           // WEAPON EXCHANGE's touch button, with the dead's prompt (`./matchTouch`)
      doors.frame(dt);                // DOORS: the swings (the server's, in a match)
      gates.frame(dt);                // MAP-07: the lever gates (the server's slide, from the snapshot's door tail)
      cranes.frame(dt);               // Chain Reaction: the hooks (the server's phase, then this frame)
      acts.turrets.frame();           // MAP-10b: the held turret's look clamped, every occupied gun turned to its aim
      pageWorld?.step(dt);            // SUP-02: the world's running scene programs (a death's sequence past its first tick)
      firearm.fireFrame(dt, walking); // W2.5: the reload, the rate, a held trigger's rounds; MAP-10b: still while mounted
      if (import.meta.env.DEV) devAfterFire();   // the panel's magazine refill, a development build's only
      acts.turretFrame(frameTime.real(), walk.isDead());   // MAP-10b (PAR-24: its cadence in real time): the turret's trigger let go off it or dead; its rounds at its cadence
      effects.setBrighten(brightenOf(lighting));
      firearm.effectsFrame(dt, fly.camera);   // EFFECTS: the zAnim effect runs, the casings, the particles
      fly.camera.updateMatrixWorld();
      sound.frame(fly.camera, walk.gameCamera());   // the game's listener is the camera (0x48dd40; #479: the game's); the reverb, the beds
      solo?.drain(performance.now());      // research 209 §18: the room's due ticks, and their detonate, before the page's fuse decides
      created.setGlow(throws.frame(dt, frameTime.real()));   // the throws, the launcher, the flashbang's wash and its glow (`./matchThrow`; PAR-34: the timed rules in real time)
      view?.frame(fly.camera, dt, zoom.renderView());   // the flares turn, the LODs pick, the oceans scroll -- before the draw (PF-29: the zoom's view)
      if (rehearsal) {                 // #21: the walk's first draws, before this frame's render clears over them
        const b = rehearsal;
        rehearsal = null;
        if (b === body && !walking) rehearseWalk(b);
      }
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
      if (shadowsOn) charShadow.frame(created.renderer, scene, body?.group ?? null);   // PAR-6: the visible body's map, else none (`mountCharShadow`); RB-16: not while Shadows are off
      render(scene, fly.camera);
      firearm.aimReticle(dt);         // W2.4: the reticle on the aim point, its size, set, colour and pip
      if (!walking) tacMap.setOpen(false);
      tacMap.frame(dt);
      net?.spectatorPad(padMerged);                 // PF-31: the spectator's pad, on release (./spectatorView)
      const spectating = spectatorHudView(net, walk, undefined, promptDevice(), (id) => itemIcon(loadouts.tables(), id)), scoreboard = (walking || spectating !== null) && (padMerged.scoreboard || scoreboardKeys.held());   // PAR-48: a spectator's SELECT too (FUN_0022be20); LATER 118: the dead's help lines on the prompt's device
      hud.setScoreboard(scoreboard);     // research 87 §12: SELECT (Tab) held; it hides the reticle too (L56808-56828)
      // PAR-94 B2/B3 (research 322 §4.1): the walker's kit neither under the ARMORY nor before the room's spawn of the page.
      const spawned = pageSpawned({ room: net !== null, spawned: ownSpawned, armoryOpen: armory.isOpen() });
      firearm.showReticle(created.renderer, walking, tacMap.isOpen(), scoreboard, spawned);   // none while dead (`reticleShown`)
      // Was: `hud.setVisible(walking)` -- drawn under the offline ARMORY and from the walk's start, before any spawn.
      hud.setVisible(walking && spawned); hud.setSpectator(spectating);   // PAR-48 (research 282): a spectator's or a dead player's view; null the walker's
      { const own = ownHudName(net); hud.setPlayerName(own.name, own.tag); }   // NU-9 N1 (research 327): the walker's own name and tag, apart
      traversal.hudFrame(hud);        // research 86: the ladder slide's icon on a ladder
      acts.bomb.hudFrame();           // XR-06: the bomb's compass marks and the fuse in the round timer's place
      hostages.frame();               // HX-4a: the hostage order offered afresh this frame (the prompt, the lane's input)
      traversal.effectsFrame();       // research 86: the water's ripples (FUN_005b52b0)
      traversal.soundFrame();         // PAR-89 (research 305 s3): the slide's loop held for the slide clip, at the feet
      firearm.feedHud(walking, {      // the weapon box (the equipment's over the firearm's) and the readouts
        climb: traversal.hudClimb(),
        nearby: acts.prompt(walking),  // XR-06: the action context's prompt, in the picker's order (`./matchActions`)
      });
      {                               // MATCH-05 (research 170 §5.2, note 227 §2): the voice element and the hud_talk mark
        // LATER 671 (the v0.4.11 review's F3), SS-2 (H422 answered (a)): TEAMMATE NAMES as `./matchMount` reads it, the
        // card's 0 / 1 on or off, the look this browser's Name tags (`./nameTags`). `/testroom` has no session's set-up:
        // the page's native OPTIONS' valve, else (RB-16, PS-4) the card's stored one, and the key, read each frame;
        // absent, 1 and the default look.
        const teamNames = teammateNamesValue(pageOptions?.valves ?? cardReads.valves());
        hud.setTeammateNames(teamNames !== 0, readNameTags() === 'original');
        hud.setRangeReadout(readRangeReadout() === 'on');   // HUD-ALIVE C (OT.R117, a browser adaptation): this browser's, read each frame as the look is
        const page = net;
        const vf = page ? voiceHudFrame(voiceEl, performance.now() / 1000, {
          voice: voice.state(), self: { id: page.client.id, team: page.client.role === 'player' ? page.client.team : null },
          rows: page.rows, spectators: hud.spectatorCount(), nameOf: (id) => page.displayNameOf(id), clanOf: (id) => page.client.clans.of(id),   // AD-13
          at: (id) => remote.feet(id), own: walk.feet(),
        }) : null;
        hud.setVoice(vf?.view ?? null);
        hud.setTalkMarks(vf?.marks ?? []);
        hud.setInfoNumber(page ? validClientCount(page.rows, hud.spectatorCount()) : null, page?.client.sessionMaster === true);   // HUD-ALIVE B: the consoles' count, "%d" / "%dm"
        hud.setCommandMenu(taunts.isOpen());             // NU-9 T3: the Chat menu open hides the tags' texts (D:L56617-56623)
        // LATER 415: the tags read the region gate framed before the render (`./regionCull`).
        const tagGrid = walk.grid();
        hud.setTeamTags(page ? teamTags({ ...teamTagInput(page, remote, fly.camera, voice.state(), tagGrid ? (id) => regionCull.drawn(id) : undefined), original: hud.teammateNamesOriginal() }) : null);   // NU-9 T4 (research 329); LATER 671
      }
      hud.setHostageMarks(net?.hostageMarks(loaded?.ai) ?? []);   // HX-5: the hostages' and the zones' compass marks (research 239 s7.2)
      hud.render(created.renderer);
      // The ARMORY (web sprint 5 S3; `./matchArmory`): its scripts stepped, pulled out 5 s before the next round (popup 47,
      // a notice), drawn over everything.
      armoryPart.frame(dt, created.renderer);
    }

    // Every 200 ms (redrawing text every frame is itself a cost): the ratio checked, the frame counter, the Online line.
    if (adaptiveRatio.frame(dt, performance.now(), created, presentation === 'ps2' || revealing !== null)) {
      ui.setFps(1000 / adaptiveRatio.smoothedMs(), adaptiveRatio.smoothedMs());
      devPanel?.sample(1000 / adaptiveRatio.smoothedMs(), adaptiveRatio.smoothedMs());
      showOnline();                               // the Online line: connecting, online and the players, the retry
    }
    pageFrameSampler().frame(frameTime.real() * 1000, 'test room', created, canvas, loaded, net);   // CPS-5 (a browser adaptation): the performance line's sampler, the frame's real ms
    // The loading screen's hold (`./loadingJoin` `joinVerdict`): released on the lanes' completion, or at once on a
    // refused join -- the map then shows with the Online line and the HUD saying why, as before the hold.
    if (loadingJoin.blocked) {
      // The room's welcome, not its first round: the Armory must remain usable before readying up. Only a client
      // attempted for this load answers for it (`netLoad`): none yet before `show`, a previous map's never.
      const step = loadingJoin.frame(wantedMap, pageLanes({
        // LATER 440: the scene lane reads the view only when it is the wanted load's -- an old map's warmed world never readies it.
        load: wantedMap, playOn, view: customProps.ready(wantedMap) ? sceneViewFor(view, shownLoad, wantedMap) : null, worldWarmed, worldWarmFailed,
        playAnswer, walkWarmed: warmedAt['walk'] !== undefined,
        noArmory: NO_ARMORY, loadedArmory, armoryReady: armory.ready(), loadedEffects, loadedSound,
        url: !!NET.url, netLoad, status: net?.status() ?? roomAsk,
      }), performance.now() / 1000, soloLoadHold(loadKindNow()));   // MCW.R8: the kind re-read; promote-only
      if (step === 'released' || step === 'failed') { loadingScreen.watch.ready(wantedMap); loadingScreen.panel.hide(); showOnline(); REPLAY_WORLD?.ready?.(); }
    }
    packOverlay?.refresh();          // ML-9's F1 / F2: the strip as live play or the loading screen starts and ends
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  // Test-room model pack (`./modelPackRuntime`): a visitor's GLBs, and only with `/testroom` and `modmodels`.
  // The loader is a separate chunk, so a page without the flag never fetches it. The front end does not import it.
  // A replay frame (`REPLAY_WORLD`) skips it, as the mod panel does: the recording was made without the pack.
  if (!REPLAY_WORLD && modelPackActive(`${globalThis.location?.pathname ?? ''}${SEARCH}`, import.meta.env.BASE_URL)) {
    const { mountModelPack } = await import('./modelPackRuntime');
    await mountModelPack(document);
  }

  // Without `?devmode` the served tree is never asked for (`./source`): the disc page is the way in.
  const hasServed = SERVED ? await served(SERVED) : false;
  // A disc opened while the page came up wins over the served tree; with nothing served the disc page is offered even
  // while it indexes, so a failed index is said on it (`bootSource`, review 2 m-15).
  const pendingIso = isDiscRequest(wantedIndexFrom.kind) && source === NO_SOURCE;
  const start = bootSource(SERVED !== null, hasServed, pendingIso, source !== NO_SOURCE);
  if (start === 'served' && SERVED) {
    ui.setStatus(`${backend}: indexing the archives ...`);
    askIndex(SERVED);
  } else if (start === 'offer-disc') {
    ui.offerDisc();
    if (!pendingIso) ui.setStatus('open your own SOCOM II disc image (.iso): it is read in this browser, never uploaded');
  }
}

/** The served source answers only when the disc tree has been extracted (and only with `?devmode` is it asked). */
async function served(from: SourceRequest): Promise<boolean> {
  if (from.kind !== 'http') return false;
  try {
    return (await fetch(`${from.baseUrl}/index.json`)).ok;
  } catch {
    return false;
  }
}

function showMaps(maps: MapInfo[], campaign: readonly string[] = []): void {
  // The deploy's map allowlist (`./multiplayerMaps`: VITE_S2U_MAP_ALLOWLIST, which the server reads too; unset: all).
  const allowlist = import.meta.env.VITE_S2U_MAP_ALLOWLIST as string | undefined;
  const allowed = allowedMultiplayerMaps(maps, parseMapAllowlist(allowlist));
  const wanted = wantedArchive();
  // EPH campaign stand: the campaign mission `?map=` names, after the allowlist's maps, on `/testroom?devmode` alone.
  const mission = campaignEntry(wanted, campaign, `${wanted} -- campaign (devmode instrument)`, CAMPAIGN_GATE);
  const ordered = [...sortByPopularity(allowed), ...(mission ? [mission] : [])]; // the owner's popularity ranking, most played first
  mapList = ordered;
  const first = ordered.find((m) => m.archive.toUpperCase() === wanted)
    ?? ordered.find((m) => m.archive === DEFAULT_ARCHIVE) ?? ordered[0];
  ui.setMaps(ordered, first?.path ?? null);
  if (!first) {
    const empty = emptyPickerStatus({ discMaps: maps.length, allowlist, source: isDiscRequest(source.kind) ? 'iso' : 'served' });
    REPLAY_WORLD?.failed(empty);                       // MU-11: the replay viewer says it
    ui.setStatus(empty, 'error');
    return;
  }
  ui.setStatus(`loading ${first.name} ...`);
  load(first.path);
}

/**
 * The room left: the client closed and every page part back to no room (the voice's track, the walk's lock, the bomb and
 * turrets, the drops, the hostages, the abort, a pending join, the offline match, the ARMORY's waiting seat).
 * `connectNet`'s first half, unchanged line for line (its ARMORY lines and `ears.stop()` follow in `connectNet`, in their
 * old order); the test room's zombies stand the offline loopback down through it too (#395 review F1).
 */
function leaveRoom(): void {
  nativeSettings.interrupt();
  voice.dispose();                                 // CLOSE-FIX-1 F4 (constraint 6): the match's end -- the talk let go, the track stopped
  voice = mountPageVoice();                        //   and a fresh client for the next (it opens nothing until a press)
  voiceEl.members = 0;                             // LATER 77 (review F1): voice+0x5c is 0 again at a session's start (FUN_00310080 D:L211754, via FUN_002b83e0)
  net?.close();
  net = null;
  reguardPacks();                                  // PR #729 P1: off a server room, the pack drawn as made again
  ownSpawned = false;                              // PAR-94 B2/B3: the next room has spawned nobody yet
  acts.unlock();                                   // the closed client gave the walk back unlocked (`NetClient.release`)
  acts.follow(null);                               // wave 4: the pages back to no room -- no bomb, no turret held
  drops.reset();                                   // PF-34: a map left clears the old room's drops (`WorldDrops.reset`)
  hostages.reset();                                // HX-4a: nothing offered from the old room's hostages
  matchAbort.reset();                              // MATCH-02: a new match holds no abort (the reCOM switch, the online choice rejoin here)
  roomAsk = null; roomJoinOn?.cancel(); roomJoinOn = null; roomNameRetry = null;   // SA-7h S5: no join of the match left answers for this one
  solo?.stop();
  solo = null;
  soloAfterArmory = null;
  armoryPart.forget();                             // no seat waits for the data of the match left
}

/**
 * The match for the map on screen (a new map is a new match: each map its own, W3.R11): the Online setting's server, or
 * the URL's, joined as a player in reCOM mode and as a watcher in the map viewer; none when Online is off. Any earlier
 * connection is closed first.
 */
function connectNet(map: LoadedMap): void {
  // The offline ARMORY open on this map entry while its room is made again (the clips landed late): kept open, the new
  // room made when it is left -- never opened a second time (once a map entry).
  const keepArmory = !NET.url && playOn && SOLO_MATCH && armory.isOpen() && soloAfterArmory !== null && armoryEntry === map;
  leaveRoom();
  netLoad = map === loaded ? shownLoad : -1;
  if (!keepArmory) armory.close();
  if (armoryEntry !== map && !keepArmory) armoryEntry = null;
  ears.stop();
  // The deps both pages share (`./matchNet`), /testroom's additions on them, and its own: the sound, the ARMORY's.
  const deps = matchNetDeps({
    caps: TESTROOM_CAPABILITIES, walk, remote, hud, fly, loadouts, firearm,
    clips: () => playClips, map: () => loaded, side: matchSide, followTeam,
    menuOpen: () => loadingJoin.blocked || exchange.isOpen() || armory.isOpen() || taunts.isOpen() || startMenu.isOpen(),
  }, {
    ...exchangePart.netHooks(),                     // answered: the menu shows the kit the room will spawn the player with
    // The pouch too at a spawn -- the page's spent rings do not outlive a death or a round; the round's reset closes
    // WEAPON EXCHANGE over the kit the spawn took (S8).
    respawned: () => { ownSpawned = true; grenade.refill(); exchangePart.reset(); startMenu.reset(); },   // PAR-94 B2/B3: the room spawned the page; MATCH-01: the HUD's reset closes the START menu
    // XR-06 (research 214 s4): a death cancels the action button's hold -- nothing fires, the release after it neither.
    died: () => { cancelAction('death'); },
  }, {
    ownCorpseExpired: () => play.ownCorpseExpired(), // RSP-6: the actual own-body hide state, read after this frame's play
    respawnInputBlocked: () => inventory.isOpen(), // RSP-8: the existing R2 input owner blocks only this new dead-press gate
    ...throws.netDeps(),                            // the throwables' (`./matchThrow`, `PART_DEPS`): the room's projectiles, a stale throw, PF-36's pids
    ...sound.netDeps(),                             // the sound's (`./matchSound`): the reload, the voices, the ring, the round's cues, the objective
    hostageState: (ev) => hostages.state(ev),       // HX-4a: the hostages' part (`PART_DEPS.hostages`, research 239 s7)
    ...taunts.netDeps(),                            // TAUNTS' (`./matchTaunts`): the room's taunts heard
    ...chat.netDeps(),                              // TACTICAL ORDERS and MESSAGES (`./matchChat`): the room's communications heard
    ...voice.netDeps(),                             // SVC-20b-page (`./voice/voiceClient`): the floor entry and the room's voice frames
    // The world drops' (`PART_DEPS`, PF-34, research 234 s6): the room's drops, a welcome's set too; the live kit after a
    // pickup, no fill (the one firearm's `takeKit`).
    drops,
    kitChanged: (l, s, r, f, k) => { firearm.takeKit(l, s, r, f, k); },
    // The ARMORY's (`./matchArmory`, `PART_DEPS.armory`): a classic round's start -- both decal pools emptied, as the
    // game's round end does (CMPExitState L76084 -> FUN_0031c880 -> FUN_003bf050 x2, L219059-219060), the marks, the
    // footprints, the scorches -- closes the ARMORY (ARMORY_WAITING_LAUNCH_READING), a change still in the send's
    // debounce dropped first (ARMORY_ROUND_START_RACE_READING); an abandon keeps it open and sends that change (repair
    // 2); W5.R1: a seat the room opens it on (ARMORY_SEAT_READING), once its data is in -- and when it cannot open, the
    // room told at once so the seat spawns; the hello's `armory` while Play mode opens it (`&noarmory` aside).
    ...armoryPart.netDeps(),
    client: null,                                   // PT-18: the replay part's (`PART_DEPS.replay`); the page's own NetClient, the replay branch's below
  });
  const stem = map.path.replace(/^.*\//, '').replace(/\.ZDB$/i, '').toUpperCase();
  // EPH campaign stand: a campaign mission is played offline, whatever Online says -- no server plays one.
  const campaignLoad = CAMPAIGN_ON && campaignStemOf(stem) !== null;
  // FP-6 F2 (H273, `./customOffline`): a custom map -- an authored one, or a disc map carrying a save's pieces -- is walked
  // offline whatever Online says: its hull never goes to a server's room named after its path.
  const customLoad = customOffline.has(map);
  // RV-7c-2 (research 276 §6): both replay branches' hull, the room's flight surface (`Room.hullCast`); null off this map.
  const replayHull = (): HullCast | null => (pageWorld && pageWorld.ground === map.ground ? gridCast(pageWorld.grid, map.grenade?.defaultMaterial ?? '') : null);
  // MU-11 (MU.R9; `./modern/replays/worldHost`): framed by the modern replay viewer -- the watcher's NetPage of the
  // replay mode below, its recording the viewer's (the host's factory), its spectator view handed back for the viewer's
  // camera buttons. Ahead of every other branch; without the host nothing here changes.
  if (REPLAY_WORLD) {
    netUrl = 'replay:';
    net = new NetPage({ ...deps, ...replayWorldDeps(REPLAY_WORLD, { throwable: (k) => throws.throwable(k), hull: replayHull }), world: () => (pageWorld?.ground === map.ground ? pageWorld : null) }, 'replay:', stem, playerName(), undefined, true, RULES);
    REPLAY_WORLD.attached({ spectator: net.spectator });
    exchangePart.reset();
    refreshExchange();
    showOnline();
    return;
  }
  // PT-18 (W35.R4, W35.R5; research 244 §1): `?devmode&replay=<url>` on a development build -- a watcher's NetPage on a
  // recording (`./replay/mount`), ahead of the server's and the offline room's; without `replay=` nothing changes here.
  const replayOn = TESTROOM_CAPABILITIES.replay && import.meta.env.DEV && DEV.tools && new URLSearchParams(SEARCH).has('replay');
  if (replayOn) {
    void import('./replay/mount').then(({ replayClient }) => {
      if (loaded !== map || net) return; netUrl = 'replay:';   // a newer map or match since; RB-8: the URL `net` is made with
      net = new NetPage({ ...deps, client: replayClient(SEARCH, undefined, { throwable: (k) => throws.throwable(k), hull: replayHull, held: () => loadingJoin.blocked }), world: () => (pageWorld?.ground === map.ground ? pageWorld : null) }, 'replay:', stem, playerName(), undefined, true, RULES);
      showOnline();
    }).catch((e: unknown) => { console.warn('the replay client would not load:', e instanceof Error ? e.message : String(e)); });
  } else if (NET.url && !campaignLoad && !customLoad) {
    const url = NET.url;
    const join = (room?: Omit<NonNullable<NetPageDeps['room']>, 'session'>, o: { rules?: Rules } = {}): void => {
      try {
        netUrl = url;
        net = new NetPage({
          ...deps, local: NET.choice === 'local', session: sessionFor(url),
          ...(room ? { room: { ...room, session: sessionFor } } : {}),   // SA-7h S5: a standing room's door and pass; F4: each door's session
          world: () => (pageWorld?.ground === map.ground ? pageWorld : null),   // MAP-03: the room's world, off the wire
        }, url, stem, playerName(), NET.simulate, !playOn, o.rules ?? RULES);
        acts.follow(net.client);                     // wave 4: the bomb, the turrets and the switches follow this room
        reguardPacks();                              // PR #729 P1: an applied pack drawn guarded before the room's first frame
      } catch (e) {
        // A socket the browser refuses outright (a `server=` it will not open) must not stop `show` half-way: no match.
        net = null;
        ui.setStatus(`the match could not be joined: ${e instanceof Error ? e.message : String(e)}`, 'error');
      }
    };
    // SA-7h S5 (`./connectHost` `ROOM_DOOR_ADAPTATION`): the page's own origin `/ws` -- the bare `?mp`, and since TRS-1 a
    // deployed page's Shared -- asks central's `/rooms` first; a classic room listed `hosted` (a host runs it) is joined
    // through the room pass, its refusal the page's (no fall back to `/ws`). TRS-2: a local page's Shared asks the local
    // stack's central the same way (`LOCAL_STACK_SERVER`). Every other target -- `local`, a `server=`, respawn -- and a
    // room not hosted: today's; but Shared chosen in the panel is the standing rooms alone (`sharedOnly`): no room key, or
    // none hosted, says `NO_SHARED_ROOM`, and `/rooms` not read is retried (the TRS review's F1/F2).
    const sharedOnly = NET.choice === 'shared' && !NET.fromUrl;
    const stackShared = NET.choice === 'shared' && url === LOCAL_STACK_SERVER;
    const roomBase = ownOriginRoomSocket(url, PAGE_LOCATION) ? `${PAGE_LOCATION.protocol}//${PAGE_LOCATION.host}`
      : stackShared ? LOCAL_STACK_SERVER.replace(/^ws:/, 'http:').replace(/\/ws$/, '') : null;
    // LATER 229; #421 review F6: a standing room is classic, so a respawn ask looks up the map's classic standing room
    const room = roomBase !== null ? roomKeyOf(stem, RULES === 'respawn' ? 'classic' : RULES, map.gameType) : null;
    /** TRS-1: Shared found no standing room hosted for this map -- the page's line says so (`NO_SHARED_ROOM`). */
    const noSharedRoom = (): void => {
      roomAsk = { state: 'refused', reason: NO_SHARED_ROOM, players: 0, retryIn: 0, watching: !playOn };
      showOnline();
      ui.setStatus(`Online: ${NO_SHARED_ROOM}`, 'error');
    };
    const path = roomPathOf({ shared: sharedOnly, roomBase, room });
    if (path === 'today') join();
    else if (path === 'none') noSharedRoom();   // TRS review F2: no standing room can hold it -- never `/ws`
    else {
      const ask = (): void => {
        roomAsk = { state: 'connecting', players: 0, retryIn: 0, watching: !playOn };
        roomNameRetry = null;
        const status = (s: OnlineStatus | null): void => { roomAsk = s; showOnline(); };
        // TRS-2, LATER 262: the stack's start line only while its `/rooms` is not read (`unlisted`); a failed pass after it
        // is the server's line (a page on another port than 5342 is refused by the stack's origin check).
        const retrying = (listed: boolean) => (ms: number): void => { status(roomRetryStatus(ms, { stack: stackShared, listed, watching: !playOn })); };
        /** LATER 263: the server answers 404 on `/rooms` -- the route not served -- said once, no retry (`NO_ROOMS_ROUTE`). */
        const noRoute = (): void => {
          roomJoinOn = null;
          status({ state: 'refused', reason: NO_ROOMS_ROUTE, players: 0, retryIn: 0, watching: !playOn });
          ui.setStatus(`Online: ${NO_ROOMS_ROUTE}`, 'error');
        };
        roomJoinOn = startRoomJoin({
          base: roomBase!, room: room!, name: playerName,
          devDoors: stackShared || pinnedMatchSocket(SEARCH, PAGE_LOCATION, import.meta.env.DEV).devDoors,   // TRS-2: the stack's doors are the loopback's
          delayMs: (n) => retryDelayMs(n, false, NET.choice === 'local' || stackShared),   // F1: the page's backoff for a server not reached; the stack's, the local one's
        }, {
          today: () => {
            roomJoinOn = null;
            // TRS-1: Online = Shared is the standing rooms -- none hosted for this map is said plainly, never a fall back to
            // `/ws` (NO_SHARED_ROOM); the bare `&mp` keeps today's path.
            if (sharedOnly) { noSharedRoom(); return; }
            status(null); if (loaded === map && !net) join();
          },
          seat: (seat, provider) => {
            roomJoinOn = null; status(null);
            if (RULES === 'respawn') ui.setStatus(STANDING_ROOM_CLASSIC_LINE);   // F6: the standing room plays classic (LATER 313)
            if (loaded === map && !net) join({ seat, provider }, { rules: 'classic' });
          },
          refused: (why) => {
            roomJoinOn = null;
            if (why === 'no room' && sharedOnly) { noSharedRoom(); return; }   // TRS-1
            status({ state: 'refused', reason: roomRefusalLine(why), players: 0, retryIn: 0, watching: !playOn });
            ui.setStatus(`the match could not be joined: ${roomRefusalLine(why)}`, 'error');
            if (why === 'name') roomNameRetry = () => { if (loaded === map && !net && !roomJoinOn) ask(); };   // F5
          },
          retrying: retrying(true),
          ...(sharedOnly ? { unlisted: retrying(false), noRoute } : {}),   // TRS review F1: Shared's server not reached is retried, never "no shared room"; LATER 263
        });
      };
      ask();
    }
  } else if (playOn && SOLO_MATCH && map.ground) {
    // Offline in reCOM mode: the match server's own room, in the page (`./net/loopback`; owner, 2026-09-29).
    const start = (): void => {
      if (loaded !== map || net) return;               // a newer map or match since
      // EPH campaign stand: a mission's AIMAPS gives no slots (research 200 U6), so round 1 stands at `&at=` or the
      // stem's measured start (`./testroomCampaign`); with neither the page says so and makes no room -- no guessed spawn.
      if (campaignLoad && campaignAsk === undefined && CAMPAIGN_ASK) {
        void CAMPAIGN_ASK.then((asked) => { campaignAsk = asked; start(); });
        return;
      }
      const soloMap = simMapOfLoaded(map);
      const stand = campaignLoad ? campaignStand(stem, soloMap.slots, campaignAsk ?? null) : null;
      if (stand && 'refused' in stand) { ui.setStatus(stand.refused, 'error'); return; }
      if (stand) soloMap.slots = stand.slots;
      solo = new LoopbackMatch(soloMap, simClipsOfPlay(playClips), {
        // The page's player is the host's SEAL; its type's record is the developer's kit when one was asked for.
        rules: RULES, kits: map.arsenal ?? null, soloKit: () => loadouts.devKit(),
        bodies: hitBodiesOfPage(map, playClips),        // each side's own capsules, as the server's (`./teamBody`)
        // RB-47 (RB.R4, RB.R6; OT.R114, a browser adaptation): the mouse's turn cap off -- the player's mover on the open look
        // gate (`./net/lookGate` 'free'; a CPU seat keeps the law, match `room.ts` `newSim`) where the page reads the mouse.
        ...(kbmAllowed('testroom', null) ? { lookRate: 'free' as const } : {}),
        // MAP-02: the page's world follows the room's -- read at each change, as `NetPage`'s is: under NO_ARMORY this
        // `start` runs from `connectNet` before `show` has built `pageWorld` (below), and a world read once here was null.
        world: () => (pageWorld?.ground === map.ground ? pageWorld : null),
        // A development build's disc check (`__room.lastActionMiss`). The page's offsets are this frame's hooks.
        ...(import.meta.env.DEV ? {
          onActionMiss: (detail: CraneActionMiss) => {
            detail.page = cranes.hookState().map((h) => ({
              path: h.hook,
              offset: [h.offset[0], h.offset[1], h.offset[2]] as [number, number, number],
              paused: h.paused,
            }));
          },
        } : {}),
      });
      // Its welcome is no join for the ARMORY: it was opened before the room was made.
      netUrl = 'loopback:';
      net = new NetPage({ ...deps, socket: solo.socket, solo: true, joined: () => {}, armory: false }, 'loopback:', stem, playerName(), undefined, false, RULES);
      acts.follow(net.client);                     // wave 4: the pages follow the offline room as an online one
      exchangePart.reset();
      refreshExchange();
      showOnline();
    };
    // W5.R1: the ARMORY first -- the room is made, and the player spawned, when it is left; without it, at once. Once a
    // map entry: a room made again (the clips) opens it no more, and one made while it is open waits for it.
    if (keepArmory) soloAfterArmory = start;
    else if (NO_ARMORY || armoryEntry === map) start();
    else {
      armoryEntry = map;
      soloAfterArmory = start;
      // A mod reload must not seat on the previous ARMORY data: that open is closed when the fresh data
      // arrives, and the close starts this room, so the screen never stays up (`tryReopenArmory`).
      if (!reopenArmory) armoryPart.seat();         // now, or once its data lands; none to open: the room made at once
    }
  }
  exchangePart.reset();                               // a new match: the menu closed
  refreshExchange();
  showOnline();
}

/**
 * Puts a decoded map on the screen without freezing the page doing it.
 *
 * The measured shape of the old stall: the fetch was 31-51 ms warm, the worker's decode 44-94 ms, the
 * handoff 1-27 ms and `buildWorld` 14-20 ms -- and then **one frame of 690 to 1,703 ms**, because that
 * frame is where three uploaded every texture and geometry and compiled every program. So the build is
 * still done here in one go, and what is spread out is the *showing*: `buildWorld` hands back its
 * objects in two queues (`./world`) and `./scheduler` adds them a budget's worth per frame.
 *
 * The old map is taken down when the world's own meshes are in, not before -- so the swap happens
 * between two drawn maps rather than through a blank one -- and the props stream in behind it.
 */
/** The world on screen and the one waiting to be taken down (`./worldSwap`: an interrupted switch orphans none). */
const worlds = createWorldSwap<WorldView>(scene);
/** The worker's play clips on the bodies, with the map's dances in (research 303, `./victoryData` `withVictoryClips`). */
function installPlayClips(): void {
  const clips = withVictoryClips(playClips, loaded?.victory);
  play.setClips(clips); traversal.setClips(clips); remote.setClips(clips);
}
function show(map: LoadedMap): void {
  zombies?.reset({ restore: false });             // #395 F1: the map load makes its own room
  const t0 = performance.now();
  loaded = map;
  const pieceList = document.getElementById('model-pack-pieces');
  if (pieceList) pieceList.textContent = map.worldPieceList ? formatWorldPieceList(map.worldPieceList) : '';
  const keptLine = document.getElementById('model-pack-kept');      // #432 (OT.R69): pieces kept on the disc's draw, and why
  if (keptLine) keptLine.textContent = worldPiecesKeptLine(map.worldPiecesKept, map.worldPiecesPropsOnly);
  if (map.worldPieceList) {
    console.info(`Model pack: ${map.worldPieceList.length} world pieces on ${map.name}. __viewer.worldPieces() lists their ids.`);
    for (const line of bareWorldPieceWarnings(mappedModelIds(), map.worldPieceList)) console.warn(line);
  }
  installPlayClips();                               // research 303: this map's dances on the bodies
  shownLoad = wantedMap;                            // `show` is called for the wanted load's map only
  // The lighting is the map's own, read from its `GlobalLighting` record: three directional lights and
  // an ambient. The two sliders are trims on top of it and stay where the panel has them.
  lighting.rig = map.lightRig;
  // The map's own fog, before the world is built: `cameras/camera` in its `MP*.ZED` carries the
  // colour, the range and the enable bit the level was authored with. Two of the twenty-two ship
  // with it off, so the bit is honoured rather than the range being used as a proxy for it.
  if (mapFog(fog, map)) {                         // the altitude band too, on the six maps that enable it (`./matchCore`)
    fogIsMine = false;                          // the new map's own fog, until a slider says otherwise
    ui.setFog(fog.near, fog.far, fog.color);
    ui.setFogEnabled(fog.enabled);
  }
  hud.setBitmaps(map.hud);
  hud.setNavPoints((map.tac?.points ?? []).filter((p) => p.kind === 1));
  hud.setGame(map.name, rankOf(map.name)?.mode ?? '');
  hud.setGameDetails(() => (net && !solo ? servedRoomDetails(net.serverName(), map.name) : null));
  tacMap.setOpen(false);
  firearm.clearMap(map);                          // a new map: the reticle's bitmaps, no marks, no effects, full magazines
  audio.setData(null);                            // AUDIO: the old map's banks, SOILS, beds and emitters too
  nativeSettings.interrupt();
  startMenu.teardown(); localMenuOptions.clear(); matchAbort.reset();   // MLS.R2: native Options keeps applied session state across maps
  taunts.setData(null); chat.setData(null); tauntDev?.refresh(); cardTaunts = pageCardTaunts(); cardMessages = pageCardMessages(); cardReads.reread(pageOptions);   // Shared live state survives map replacement; BRIGHTNESS laid again (`pageCardReads`).
  screenOrigin.layLater();
  const built = buildWorld(map);
  view = built;
  applyDetailDistance();                          // PF.R60: the look's detail distance (`./detailDistance`)
  if (testRoomPacks) testRoomPacks.setWorld(built, map.textures);   // B206 ML-3: the MODS pack on the new world (its target set through it)
  else localTexturePacks?.setTarget(packTargetFor(built));   // GX-1d/GX-1e: any MP<n> map (GX.R9), the runtime's rule
  worlds.begin(built);                            // a world still waiting from an interrupted switch goes now
  throws.setMap(built, map);                      // the M67's model, its effect bitmaps, the map's DefaultMaterial; C4's targets
  scene.add(built.group);
  // EFFECTS (research 89 §5, §13, the mark's colour): a mark, a footprint and a grenade's scorch take the drawn world's
  // colour under them, and are clipped to its triangles, shaded per vertex, as `FUN_003b3ab0` builds them.
  throws.setMarks(firearm.setWorld(built));       // the marks' and the scorches' shade and clip
  // Spend the depth buffer on this map: the near plane the game itself uses, and a far that just
  // covers the map's diagonal rather than the 40,000 the camera used to open with.
  fly.setClipPlanes(map.camera?.nearPlane ?? 4, Math.max(2000, view.box.min.distanceTo(view.box.max) * 1.6));
  // A map with no `cameras/camera` key takes a range off its own size rather than the last map's.
  if (!map.camera) {
    Object.assign(fog, fogForExtent(view.box.min.distanceTo(view.box.max)));
    fog.altitude = null;
    fogIsMine = false;                          // the fallback is the map's too, until a slider moves
    ui.setFog(fog.near, fog.far, fog.color);
  }
  overlays.place(built.box);
  // Held rather than built: the hull is tens of thousands of segments on the larger maps and the
  // checkbox is off by default, so `overlays` makes the object the first time it is switched on.
  overlays.placeCollision(map.collision);
  // The measured table (`@s2u/scene`'s `spawnsFor`, keyed by the name `mission.rdr` shows) still places the
  // camera, at A's (x, z) below; the overlay draws it beside the disc's spawn slots, read in the worker from
  // `AIMAPS.MPS` (W1.5b). Which slot a player gets is game logic, so the stand is not moved to one (W1.R9).
  const spawn: Spawns | undefined = spawnsFor(map.name);
  overlays.placeSpawns(spawn ?? null, map.slots);
  overlays.placeObjectives([
    ...(map.escortees ?? []).map((e) => ({ kind: 'hostage' as const, at: e.at })),
    ...extractionPoints(map.ai).map((at) => ({ kind: 'extraction' as const, at })),
  ]);
  if (import.meta.env.DEV) clearDevTraces();   // the previous map's rounds are not this map's
  // W2.1: the player's body, in its bind pose at slot A (`./body`, `./bodyView`); the switch below shows it.
  // A SEAL until the match says (`followTeam`): the side's body, `Play.setBody` its play mode's body and skeleton (W2.2b).
  ownBody.reset(bodyForTeam(map, 'seal'));
  charShadow.setMap(map);                              // PAR-6: the map's ShadowVector (`mountCharShadow`)
  // WEAPON (web sprint 4): the map's kits, and the page's player spawned with its side's -- a SEAL until the match says
  // (`respawned`): the primary in the right hand at its grip, the secondary on the hips until drawn (`./kit`).
  loadouts.setMap(map.arsenal?.table ?? null, map.arsenal?.map ?? null);
  loadouts.spawn('seal', { network: !!NET.url });
  hangKit(true);                                       // a new body: the kit is hung on it afresh
  spawnKit('seal');
  inventory.spawned();                                 // a new body's controller: L1 slot 0, L2 slot 1 (FUN_00599690 -> FUN_00598280)
  // LATER 441: the completion is owned by this load and its record; a superseded warm-up marks nothing and enters nothing.
  const walkLoad = shownLoad, walkWarmedAt: Record<string, number> = {};
  warmedAt = walkWarmedAt;
  void warmWalk?.().catch(() => {}).then(() => {   // what entering the walk draws first, compiled now
    if (!markWarmed(walkWarmedAt, 'walk', walkLoad, wantedMap, performance.now())) return;
    startInWalk(map.name);
  });
  // MULTIPLAYER: the others are this map's SEAL and Terrorist; a new map is a new match (each map its own, W3.R11).
  // Protocol 7: the player's own kit when the room named it, else its type's (protocol 9) -- `./matchCore`.
  setRemoteMap(remote, map, lighting, () => view);
  connectNet(map);
  // A new world starts in whatever state the panel is showing, not in the state it was built in.
  ui.apply(applyToggle);
  ui.applySliders(applySlider);   // a freshly built world starts at the panel's settings, not the defaults
  refreshFog();
  fly.setScale(map.metersPerUnit);
  // The map's own vertical field of view (a 49-degree picture, not a wide-angle survey), the view states and the bloom
  // reset, a night map's night vision and its lens colour (`./matchFirearm` `setView`).
  firearm.setView(map);
  fit?.();                                        // the PS2 presentation's aspect is the map's own

  // W1.4b: the stand the worker worked out (`LoadedMap.stand`, `./stand`): A's (x, z), `EYE` over the ground
  // probe's floor there, not over A's recorded y -- the orbit camera's on 20 maps, 25 over that floor. No measured
  // spawns for this map yet: off its own extent, looking at the middle of it (`./matchCore` `standOf`).
  const stand = standOf(map, view);
  fly.lookFrom(stand.from, stand.to);
  // The walk's ground: the probe's polygons and grid. A walking mover is stood on the new map under the camera
  // just placed, or at spawn A's (x, z) on the stand's floor (A's recorded y where the probe found none).
  // MAP-02 (`./worldState`): the page's world on the walk's hull and grid, drawn by the view; zAnim's opening state.
  const hullGrid = map.ground ? groundGrid(map.ground) : null;
  // SUP-02: a scene program's SOUND at its node's place (SCENE_SOUND_PLACE_READING) through the audio catalogue by name,
  // as the doors' are; DESTRUCTION_SOURCE logged once a node (GLASS_FRAGMENTS_PLACEHOLDER: no fragment is drawn).
  const debrisSeen = new Set<string>();
  pageWorld = map.ground && hullGrid ? new WorldState(map.meta ?? bareMeta(), map.ground, hullGrid, {
    visible: (path, on) => { view?.setNodeActive(path, on); },
    opacity: (path, f) => { view?.setNodeOpacity(path, f); },   // PB-9b (research 284 s8): a program's opacity, the bases' pulse
    sound: (name, path, volume) => { sound.sceneSound(name, path !== null ? pageWorld?.placeOf(path) ?? null : null, volume); },   // OBF-31: none under the round screens
    // XR-04 (research 213 s4): a program's common-set effect (COMMON_EFFECT_CALL_READING) -- the call strike's fire and
    // dust -- played at the calling program's root (an arch's `worldmodel/seal_demo_1`), on a presentation run.
    call: (name, path) => {
      const at = path !== null ? pageWorld?.placeOf(path) ?? null : null;
      if (at) effects.play(name, { position: at, normal: [0, 1, 0] });
    },
    destruction: (path) => {
      const key = path ?? '';
      if (debrisSeen.has(key)) return;
      debrisSeen.add(key);
      console.info(`world: DESTRUCTION_SOURCE at ${path ?? '(no node)'} -- ${GLASS_FRAGMENTS_PLACEHOLDER}: no fragments drawn`);
    },
  }) : null;
  if (pageWorld) pageWorld.runAutostartPrograms = true;   // AS-1: the same runner as `buildPageWorld` (the room does not)
  pageWorld?.applyInitial();
  walk.setGround(map.ground, stand.feet, hullGrid);
  regionCull.reset();                               // LATER 415's review, F2: a new map, new nodes
  if (import.meta.env.DEV) consumeDevSpot();   // the opening address's spot, once; a later map keeps where the player is
  doors.setMap(map.doors, map.ground);             // DOORS: on the hull the walk stands on, shut as the disc has them
  gates.setMap(map.gates, map.ground, map.doors?.length ?? 0);   // MAP-07: the same hull; the snapshot's tail, after the doors
  cranes.setMap(map.cranes, map.ground);           // Chain Reaction: on that same hull, at rest and moving

  ui.select(map.path);
  ui.setPanelTitle(`${map.name} (${map.archive})`);   // the folded cog's tooltip
  ui.setDiagnostics([...indexDiagnostics, ...map.diagnostics]);   // the disc's unreadable archives stay listed

  // The status line is written **when the world is on screen**, not when the map is decoded. Everything
  // that waits for a map -- the e2e, the screenshot tools -- waits on this line, and a line that
  // appeared while the scene was still filling in would hand them a half-drawn map to photograph.
  const draws = built.revealWorld.length + built.revealProps.length;
  const say = (suffix: string): void => ui.setStatus([
    `${map.name} (${map.archive})`,
    backend,
    // Abbreviated on a phone for the same reason two of the parts are dropped there: the line has to
    // fit on one row inside a 360px strip, and "tris" says as much as "triangles" does.
    `${built.triangles.toLocaleString('en-GB')} ${ui.isNarrow() ? 'tris' : 'triangles'}`,
    // One draw per queued object: a world mesh per texture, and an `InstancedMesh` (or a plain one, for
    // a prop placed once) per prop model-node. `map.world.length` counted only the world's.
    // These two go first on a narrow screen: they are the diagnosing eye's numbers, not the visitor's,
    // and on a phone the line has to fit in the top strip beside everything else.
    ...(ui.isNarrow() ? [] : [
      `${draws} draws`,
      `${map.collision.polygons.toLocaleString('en-GB')} collision polys`,
    ]),
    ui.isNarrow() ? `${map.loadMs} ms` : `${map.loadMs} ms load${suffix}`,
    // The system's separator on every width: "  |  " five times over was most of what pushed the
    // line onto a second row at 360px, and the phone and the desktop should read as one line.
  ].join(' · '));

  // The world first.
  //
  // The previous map stays in the scene until the new one's first meshes land, so the swap happens
  // between two drawn things rather than through a blank frame -- and no longer than that, because the
  // two maps share a coordinate range and leaving both up for the whole reveal draws one through the
  // other. Disposing it only then also means nothing is freed while it is still being drawn.
  const built0 = built;
  const retire = (): void => { worlds.retirePrevious(built0); };
  // Each reveal waits for its objects' programs, linked off the draw (research 90 item 17: a draw that meets a new
  // program links it there and then -- 3.6 s of stalls through Guidance's first seconds).
  // LATER 440: stale too once a newer load is asked, before its map replaces the view -- an old reveal never readies it.
  const load0 = shownLoad;
  const stale = ownedStale(load0, built0, () => ({ wanted: wantedMap, view }));
  const prepared = (objects: Object3D[], lanes?: number): Promise<void> => (prepareObjects?.(objects, stale, lanes) ?? Promise.resolve()).catch(() => {});
  ui.setLoading(true, 'building the scene', 0);
  // The world's with more links in flight: nothing is drawn yet that a backed-up driver could hold.
  void prepared(built.worldObjects, WORLD_LANES).then(() => {
    if (stale()) return;
    revealing = spreadAcrossFrames(built0.revealWorld, {
      onProgress: (done, total) => {
        retire();
        ui.setLoading(true, 'building the scene', total > 0 ? done / total : 1);
      },
    });
    void revealing.done.then(() => {
      if (stale()) return;                          // another map was picked while this one was revealing
      retire();
      ui.setLoading(false);
      tryReopenArmory();                           // a mod reload's ARMORY, now that the loading screen is down
      LOAD_MARKS.mark('mapFirstFrame');            // the first map's world whole in the scene (research 100)
      say(` · ${Math.round(performance.now() - (askedAt || t0))} ms to first paint`);
      // The props follow, over further frames. The map is already drawn and flyable while they arrive,
      // and the flares among them are turned by the render loop on the frame after they land. Then every
      // program and texture the map, its LOD copies and the SEAL can need, before the first turn needs it.
      // The effects' warm-up rides along when their data is in (one pass: their models, particles and marks, and the
      // light passes' overlays over every prop -- research 90 item 19); data coming later warms by itself.
      void prepared(built0.propObjects).then(() => {
        if (stale()) return;
        const propsReveal = spreadAcrossFrames(built0.revealProps);
        revealing = propsReveal;
        void propsReveal.done.then(async () => {
          if (stale()) return;
          warmedAt['props'] = performance.now();
          const g = effects.stats().loaded ? effects.warmUp() : null;
          const warming = warmScene?.(built0.warmExtras());
          if (g) effects.warmStarted(g);
          // A rejection is surfaced as before (the promise's own); the loading screen stops waiting on this world.
          try { await warming; } catch (e) { if (!stale()) worldWarmFailed = built0; throw e; } finally {
            if (g) effects.warmDone(g);
            // Browser adaptation: resume dynamic resolution once this reveal is ready (or failed).
            // A cancelled/older map's warm-up must never release a newer reveal's hold.
            if (revealing === propsReveal) revealing = null;
          }
          if (!stale()) { worldWarmed = built0; warmedAt['world'] = performance.now(); }
        });
      });
    });
  });
}

/**
 * W0-gate, dev only (`ViewerHook.teleport`, hung on the hook with `?devmode` alone): the walk's mover stood at the feet
 * as a spawn stands it (`WalkMode.respawn`), and in the page's own match the room's mover too (the room's spawn's own
 * placement, `match/src/room.ts` `spawn`), so the room's mount test reads the same feet. A match on a server is never
 * moved from here.
 */
function teleport(x: number, y: number, z: number, yaw?: number): boolean {
  if (walk.mode() !== 'walk') return false;
  if (net && !solo) return false;
  const facing = wrapYaw(yaw ?? fly.pose().yaw);
  const id = net?.client.id ?? null;
  const roomBody = solo && id !== null ? solo.room.player(id) : undefined;
  if (solo && !roomBody) return false;
  if (!walk.respawn([x, y, z], facing)) return false;
  if (roomBody) {
    roomBody.sim.walker.place(x, y + probeLiftOf('stand'), z);
    roomBody.sim.walker.state.yaw = facing;
  }
  return true;
}

// Browser adaptation: module-scoped, typed solo instruments. No viewer-global capabilities cross this seam.
// The live connection and current URL are checked on every command, async continuation and rendered frame.
if (/(?:^|\/)testroom(?:\/|$)/i.test(globalThis.location.pathname)) {
  const localPacks = createLiveLocalPackDrivers({
    allowed: () => { const state = soloAgent?.read(); return state?.buildAllowed === true && state.ready; },
    modPanel: () => modPanel, texturePacks: () => localTexturePacks,
    textureContext: async () => {
      const map = loaded, target = view && packTargetFor(view);
      if (!map || !target || !packMap(map.archive)) throw new LocalPackError('UNSUPPORTED_SURFACE', 'No loaded map texture sources.');
      const archive = await assetSourceFor(mapSource).read(map.path);
      if (loaded !== map || !view || packTargetFor(view) !== target) throw new LocalPackError('UNSUPPORTED_SURFACE', 'The loaded map changed during its texture read.');
      return { map: map.archive, archive, toolCommit: viewerCommit(), sourcesFor: (roles) => target.sourcesFor(roles) };
    },
    modelAddress: currentModelPackAddress,
    modelBase: import.meta.env.BASE_URL, modelsEnabled: (on) => { agentModelsEnabled = on; },
    reload: async (signal) => {
      if (!loaded || !soloAgent) throw new LocalPackError('UNSUPPORTED_SURFACE', 'No loaded map to rebuild.');
      const result = await soloAgent.execute('map.load', { map: loaded.path, reload: true }, undefined, undefined, { signal });
      if (!result.ok) throw new LocalPackError('APPLY_FAILED', 'The actual map rebuild did not complete.');
    },
  });
  // R5-B (a browser adaptation): the agent's camera shot on the room's fly camera directly (`FlyCamera.setPose`, never
  // `WalkMode.setCamera`, which may reset the mover: the feet and the mode stand); fly mode only (else it ends `mode`);
  // the loaded map's own MetersPerUnit read per call; the built world's box. The room's target drives its frames.
  const shot = createPageShot({ camera: fly, canDrive: () => walk.mode() === 'fly',
    metersPerUnit: () => (loaded && loaded.metersPerUnit > 0 ? loaded.metersPerUnit : null) });
  roomShot = shot;
  soloAgent = createSoloTestroomTarget({
    localPacks,
    shotDriver: shot.driver,
    mapBounds: () => (view && !view.box.isEmpty() ? { min: [view.box.min.x, view.box.min.y, view.box.min.z], max: [view.box.max.x, view.box.max.y, view.box.max.z] } : null),
    state: () => {
      const address = attestSoloAddress(globalThis.location.search);
      const online = !!(net && !solo) || !!NET.url || roomAsk !== null || address.network;
      return {
        scope: /(?:^|\/)testroom(?:\/|$)/i.test(globalThis.location.pathname) ? 'testroom' : 'other',
        online, replay: !!REPLAY_WORLD || address.replay, visible: !document.hidden, building: !playOn,
        ready: !!loaded && shownLoad === wantedMap && !loadingJoin.blocked && !switching() && !ui.discPageShown(),
        map: loaded && {
          archive: loaded.archive, name: loaded.name, path: loaded.path, actions: loaded.actions ?? [],
          destinations: [
            ...(loaded.bombStart ? [{ name: 'bomb start', path: 'bombStart', kind: 'bombStart', team: null, feet: loaded.bombStart }] : []),
            ...loaded.slots.map((slot) => ({ name: `spawn ${slot.side}:${slot.index}`, path: `spawn/${slot.side}/${slot.index}`, kind: 'spawn', team: slot.side, feet: slot.position })),
          ],
        },
        name: playerName(), pose: fly.pose(), feet: walk.feet(),
        equipment: soloJson({ kit: kit.state(), weapon: fire.state(), slots: EQUIPMENT_SLOTS.map((slot) => ({ id: loadouts.loadout()[slot], name: equipmentName(loadouts.loadout()[slot]!) })), held: rocket.up() ? equipmentName(rocket.held()!) : grenade.held(), armory: armoryPart.state() }),
        action: soloJson({ playerMode: walk.mode(), playing: playOn, dead: walk.isDead(), locked: walk.isLocked(), held: acts.wiring.lifecycle.down(), prompt: acts.bomb.prompt(), holdProgress: acts.bomb.holdProgress(), traversal: traversal.stats() }),   // read-only: action() PRESSES
        plant: soloJson(acts.bomb.state()),
      };
    },
    maps: () => mapList, loadMap: (path) => load(path),
    teleport: (feet, yaw) => {
      if (walk.mode() === 'walk') return teleport(...feet, yaw);
      walk.setCamera({ x: feet[0], y: feet[1], z: feet[2], ...(yaw === undefined ? {} : { yaw }) });
      return true;
    },
    setCamera: (pose) => { if (walk.mode() !== 'fly') return false; walk.setCamera(pose, playOn && !FLY.toggle); return true; },
    equip: (item) => typeof item === 'number' ? selectEquipment(item) : selectFirearm(item),
    play: (on) => setPlayMode(on, true),
    armoryKey: (code) => !loadingJoin.blocked && armory.isOpen() && armory.key(code),
    // LATER 435: only the agent's own held lanes are cancelled between frames; the merged input drops the rest next frame.
    release: ({ action, fire }) => { if (action) cancelAction('touch'); if (fire) trigger(false); },
    now: () => performance.now(),
  });
  publishSoloAgentApi(soloAgent);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { shot.driver.stop('disconnected'); soloAgent?.cancel('page hidden'); } });
  globalThis.addEventListener('pagehide', () => { soloAgent?.dispose(); publishSoloAgentApi(null); }, { once: true });
}

/**
 * The debug hook Playwright drives. `./hook` declares its shape and widens `Window` to hold it, so this is
 * a checked assignment to a real property rather than a cast of the global object.
 */
/** Disc check of Chain Reaction (`./craneHook`): the drawn panels and whether the translation is paused. A read. */
window.__crane = () => craneScene(view?.group ?? null, cranes.hookState());
// The room's last crane miss (`__room.lastActionMiss`). A development build's only: a vite build folds this away.
if (import.meta.env.DEV) {
  window.__room = { get lastActionMiss() { return solo?.room.lastActionMiss ?? null; } };
}

window.__viewer = {
  // A pose with no floor under it drops the walk into the fly camera (`WalkMode.setCamera`); in Play without the
  // developer's toggle the page never leaves the walk by the hook's hand: `keepOnFoot` stands the SEAL again at the
  // spawn's feet (`./flyAccess`; m-27 of review 2).
  setCamera: (pose: Partial<Pose>) => walk.setCamera(pose, playOn && !FLY.toggle),
  pose: () => fly.pose(),
  loading: () => ({ ...loadingScreen.panel.stats(), blocked: loadingJoin.blocked }),
  links: (since) => ({
    now: performance.now(), total: linkLog?.total ?? 0, sync: linkLog?.syncTotal ?? 0, pending: linkLog?.pending() ?? 0,
    records: linkLog?.since(since) ?? [], warmed: { ...warmedAt },
  }),
  stats: () => ({
    triangles: view?.triangles ?? 0,
    backend,
    diagnostics: loaded?.diagnostics ?? [],
    loadMs: loaded?.loadMs ?? 0,
    map: loaded?.name ?? null,
    source: shownFrom,
    collisionPolys: loaded?.collision.polygons ?? 0,
    untexturedDraws: view?.untextured ?? 0,
    shadowDraws: view?.shadowDraws ?? 0,
    alternateDraws: view?.alternateDraws ?? 0,
    detailDraws: view?.detailDraws ?? 0,
    spawns: (loaded && spawnsFor(loaded.name)) ?? null,
    stand: loaded?.stand ?? null,
    slots: overlays.slotCounts(),
    body: body ? { ...body.stats, visible: body.group.visible } : null,
    anim: play.animStats(),
    view: play.viewStats(),
    nightVision: nightVisionRow(),
    lens: { effect: firearm.lens(), rows: lensColours(), node: shownScopeNode(firearm.heldKit().rifle?.object ?? null) },
  }),
  toggles: () => ui.toggles(),
  video: () => pageVideoReadout(),   // a test instrument (a browser adaptation): the resolved video settings the shadows toggle follows
  chromeHidden: () => ui.chromeHidden(),
  panelCollapsed: () => ui.panelCollapsed(),
  flares: () => view?.flarePositions() ?? [],
  lines: () => view?.lineGroups() ?? [],
  sliders: () => ui.sliderValues(),
  mode: () => walk.mode(),
  setMode: (mode) => (mayEnter(mode, playOn, FLY) ? walk.setMode(mode) : false),
  recom: (on) => { if (on !== undefined) setPlayMode(on, true); return playOn; },
  discPage: () => ui.discPageShown(),
  phases: () => LOAD_MARKS.marks(),
  playersOnline: () => {
    const c = rooms?.counts();
    return c ? { total: c.total, byMap: Object.fromEntries(c.byMap) } : null;
  },
  // TRS-4: the panel's status as it shows it (`showOnline`): a room's ask (SA-7h S5, TRS-1's no shared room) before a match.
  online: () => ({ ...(net ? net.status() : roomAsk ?? { state: 'off' as const, players: 0, retryIn: 0, watching: !playOn }), choice: NET.choice, url: NET.url }),
  walkFor: (seconds, input) => walk.walkFor(seconds, { forward: input?.forward ?? 1, right: input?.right ?? 0, boost: false }),
  feet: () => walk.feet(),
  floorUnder: (x, z, y, from = y) => {
    const grid = walk.grid();
    return grid ? (selectFloor(probeGround(grid, x, z), from + probeLiftOf('stand'), y)?.y ?? null) : null;
  },
  pad: () => ({ id: pads.id(), input: { ...padMerged } }),
  mover: () => walk.mover(),
  jump: () => walk.jump(),
  crouch: (on) => walk.crouch(on),
  look: () => fly.lookState(),
  setLook: (opts) => { fly.setLookOptions(opts); return fly.lookOptions(); },
  setZoom: (magnification, mode4) => fly.setZoom(magnification, mode4),
  shake: (distance) => { const s = explosionShake(distance); if (s) fly.shakeScreen(s); return s !== null; },
  zoom: () => ({ state: zoom.state(), view: zoom.view(), magnification: zoom.magnification(), fov: zoom.fov(firearm.baseFov()), lookScale: zoom.lookScale() }),
  zoomIn: () => stepZoom('in'),
  zoomOut: () => stepZoom('out'),
  cycleZoom: () => stepZoom('cycle'),
  fireMode: () => firearm.fireModeName(),
  switchFireMode: () => switchFireMode(),
  fireRound: () => fire.roundMode(),
  accuracy: () => ({ ...accuracy.state(), cone: accuracy.cone(zoom.state(), zoom.magnification()) }),
  reticle: () => reticle.state(),
  stance: () => walk.stance(),
  setStance: (stance) => walk.setStance(stance),
  camera: () => walk.cameraState(),
  fire: () => fire.state(),
  surfacesAlong: (from, dir) => fire.surfacesAlong(from, dir),
  shoot: () => fire.shoot(),
  traversal: () => traversal.stats(),
  net: () => net && {
    state: net.client.state, id: net.client.id, role: net.client.role, team: net.client.team, queue: net.client.queue,
    remotes: remote.count(), bodies: net.client.bodies().map((b) => ({ id: b.id, feet: [...b.feet], alive: (b.flags & 64) !== 0, weapon: b.weapon, slot: b.slot })),
    corrections: { ...net.client.corrections }, rtt: net.client.rtt, snapshotRate: net.client.snapshotRate(), feet: walk.feet(),
    waiting: net.waitingRoom(),
    // HX-OBEY: the hostages as the room last told them (HX-1's list, each `hostageState`), for `e2e/hostageOrder.spec.ts`.
    hostages: [...net.hostages().values()].map((h) => ({ id: h.id, alive: h.alive, ai: h.ai, leader: h.leader, unit: h.unit })),
    // HX-OBEY: the order the page offers now on the hostage under the crosshair (`HostagePage.offer`), or null.
    offer: (() => { const o = hostages.offer(); return o ? { hostage: o.hostage, cmd: o.cmd, text: o.text } : null; })(),
    offerWhy: hostages.why(),
  },
  action: () => traversal.action(),
  ephFrame: () => ephFrameOf(EPH_ON, walk, play),                     // EPH-2 (`./ephFrame`): null without `?devmode`
  ephPause: (on) => ephPause.set(on),                                 // PK-3 (`./ephPause`): false without `?devmode`
  doors: () => doors.stats(),
  gates: () => gates.stats(),                                     // MAP-07: the drawn lever gates (a test instrument)
  useDoor: (i) => doors.use(i),
  worldStates: () => pageWorld?.states().map(({ path, active }) => ({ path, active })) ?? null,
  worldActive: (path) => pageWorld?.isActive(path) ?? null,
  worldPieces: () => loaded?.worldPieceList?.map((piece) => ({
    id: piece.key, name: piece.name, index: piece.index, ordinal: piece.ordinal,
    pivot: [piece.pivot[0], piece.pivot[1], piece.pivot[2]] as [number, number, number],
  })) ?? null,
  basePulse: () => pageWorld?.basePulse() ?? null,   // PB-9b (research 284 s8): the bases' pulse, a development read
  setLean: (side) => { traversal.hookLean = side; },
  // The camera's peek, held even when the side ray refuses the body lean (`WalkMode.peekPin`).
  setPeek: (value) => { walk.peekPin = value; },
  audio: () => audio.stats(),
  setAudio: (settings) => {
    if (settings.volume !== undefined) audio.setVolume(settings.volume);
    if (settings.muted !== undefined) audio.setMuted(settings.muted);
    return audio.stats();
  },
  weapon: () => play.weaponStats(),
  ownBody: () => ownBodyRead(play, throwPose),
  victory: () => ({ ...acts.victoryState(), remotes: remote.victoryStates() }),   // research 303 (`./victory`)
  kit: () => kit.state(),
  loadout: () => ({
    loadout: [...loadouts.loadout()], records: firearm.records().map((r) => r.name), models: [loadouts.model(0), loadouts.model(1)],
    pending: loadouts.pending(net?.client.team ?? 'seal'),
    type: loadouts.type(matchSide()), bodyType: loadouts.bodyType(matchSide()), model: ownBody.loaded()?.model ?? null,
  }),
  setLoadout: (ids) => { const l = kitParam(`kit=${ids.join(',')}`); return l ? setLoadout(l) : null; },
  setCharacterType: (type) => setCharacterType(type),
  armory: () => armoryPart.state(),
  openArmory: () => armoryPart.open(),
  armoryKey: (code) => armory.key(code),
  weaponSelect: () => ({ ...exchangePart.state(), touchButton: touch.weaponsShown() }),
  taunts: () => ({ ...taunts.state(), ...tauntDevState() }),   // TAUNTS (`./matchTaunts`), `?devmode`'s SETUP TAUNTS
  chat: () => chat.state(),                                    // TACTICAL ORDERS and MESSAGES (`./matchChat`)
  voice: () => voice.state(),                                  // SVC-20b-page (`./voice/voiceClient`)
  startMenu: () => ({ ...startMenu.state(), labels: startMenu.labels() }),   // MATCH-01 (`./startMenu`): the START menu, read only
  settings: () => nativeSettings.state(),
  settingsFrame: () => nativeSettings.readFrame(),             // GM-09: the overlay's frame (a test aid, read only)
  options: () => ({ ...playOptions.current(), pitchInverted: fly.lookOptions().invertPitch, bob: fly.originalHeadBob }),
  openTauntEditor: () => { tauntDev?.button.click(); },
  weaponSelectKey: (code) => { refreshExchange(); return exchange.key(code, exchangeGate()); },
  selectWeapon: (item) => selectFirearm(item),
  inventory: () => {
    const laid = inventory.layout();
    return {
      ...inventory.state(), binds: inventory.binds(), current: inventoryCurrent(),
      layout: laid.items.map((i) => i.part),
      texts: laid.items.flatMap((i) => i.kind === 'text' ? [{ part: i.part, text: i.text }] : []),
    };
  },
  trigger: (down) => trigger(down),
  setGear: (name, on) => play.setGearVisible(name, on),
  hud: () => hud.state(),
  setHud: (patch) => { hud.patch(patch); return hud.state(); },
  grenade: () => grenade.stats(),
  throwGrenade: (holdSeconds = 1, immediate = true) => grenade.throwNow(holdSeconds, immediate),
  equipGrenade: (on) => grenade.equip(on),
  grenadeTrail: (on) => grenade.setTrail(on),
  resetGrenades: () => grenade.reset(),
  selectItem: (item) => grenade.select(item),
  throwClip: () => throwPose.stats(),
  whiteOut: () => whiteOut.state(),
  detonateCharges: () => grenade.detonateCharges(),
  equipment: () => ({
    slots: EQUIPMENT_SLOTS.map((sl) => ({ id: loadouts.loadout()[sl]!, name: equipmentName(loadouts.loadout()[sl]!) })),
    held: rocket.up() ? equipmentName(rocket.held()!) : grenade.held(), rocket: rocket.stats(),
    icon: equipmentIcon(), count: equipmentMagazine()?.rounds ?? fire.state().magazine.rounds, roundIcon: rocket.roundIcon(),
  }),
  selectEquipment: (slot) => selectEquipment(slot),
  plantC4: () => grenade.plantC4(),
  effects: () => effects.stats(),
  playEffect: (name, at, kind = 'impact') => {
    // 30 units ahead of the camera unless told where; a muzzle effect with a node whose barrel runs across the view to
    // the right (the flash seen from the side), an impact at the world point facing up, the round coming down the view.
    fly.camera.updateMatrixWorld();
    const cam = fly.camera.matrixWorld;
    const ahead = new Vector3(0, 0, -30).applyMatrix4(cam);
    const where = at ? new Vector3(...at) : ahead;
    const forward = new Vector3(0, 0, -1).transformDirection(cam);
    if (kind === 'muzzle') {
      // The weapon's frame: x along the barrel (the camera's right), y up, z to the barrel's right.
      const x = new Vector3(1, 0, 0).transformDirection(cam), z = new Vector3().crossVectors(x, new Vector3(0, 1, 0)).normalize(), y = new Vector3().crossVectors(z, x);
      const node = new Matrix4().makeBasis(x, y, z).setPosition(where);
      return effects.play(name, { node, position: [0, 0, 0], velocity: forward.toArray() as [number, number, number] });
    }
    // As a grenade's (`grenadePlace`): a node at the point too, for the sources that follow their caller's node.
    return effects.play(name, { ...grenadePlace(where.toArray()), velocity: forward.toArray() as [number, number, number] });
  },
  pauseEffects: (on) => { effects.paused = on; },
  tacMap: () => tacMap.state(),
  setTacMap: (open) => { tacMap.setOpen(open, fly.pose().yaw); return tacMap.state(); },
  clearEffects: () => effects.reset(),
  turrets: () => ({ placements: (loaded?.turrets ?? []).map(placementView), ...acts.turrets.stats() }),
  turretParts: () => drawnTurretParts(view?.group ?? null, (loaded?.turrets ?? []).map((t) => t.root)),
  ...(DEV.tools ? {
    teleport,
    kill: (): boolean => {
      const id = net?.client.id;
      const room = solo?.room;
      if (id === undefined || !room) return false;
      return room.devKill(id);
    },
    actionPickLog: (everyFrame: boolean): void => { setActionPickLog(everyFrame ? 'frame' : 'change'); },
  } : {}),
  ...(import.meta.env.DEV ? { devSeen: () => devSeen({ bomb: acts.bomb, grenade, remote, hud }) } : {}),   // RE-5: a development build's only (`./devSeen`)
  revision,
} satisfies ViewerHook;

// The lever-pick log (`?devmode`): one line when the reason changes. `__viewer.actionPickLog(true)` prints every sample.
if (DEV.tools) setActionPickLog('change');

// The developer's playtest overlay and its saved report (`./playtestReport`; sends nothing): a lazy chunk, `?devmode` only.
if (DEV.tools) {
  void import('./playtestReport').then((m) => m.mountPlaytestOverlay({ document, urls: URL, now: () => performance.now() }, () => window.__viewer, () => net?.client.combatReport())).catch(() => { /* a navigation aborted the optional dev module: expected */ });
}
// The in-game developer panel (`./devPanel`): a development build's only, behind the one tools helper (`./devTools`).
if (import.meta.env.DEV && devToolsEnabled(SEARCH)) void import('./devPanel').then((m) => {
  scaleDt = (dt) => devPanel?.scaleFrame(dt) ?? dt;
  let devTracesOn = false;
  let devTraceList: ReturnType<typeof m.rememberTrace> = [];
  let devRefill = false;
  devAfterFire = () => {
    if (!devRefill) return;
    m.devRefillEmptied(firearm.fire);
  };
  let spotDone = false;
  const liveNow = () => {
    const feet = walk.feet();
    const pose = fly.pose();
    return {
      map: loaded?.name ?? null, archive: loaded?.archive ?? null, mission: loaded ? (rankOf(loaded.name)?.mode ?? '') : '',
      play: playOn, camera: walk.mode(), x: feet?.[0] ?? pose.x, y: feet?.[1] ?? pose.y, z: feet?.[2] ?? pose.z,
      yaw: pose.yaw, speed: walk.speed(), stance: walk.mode() === 'walk' ? walk.stance() : 'fly',
    };
  };
  devPanel = m.mountDevPanel({
    doc: document, access: FLY, playing: () => playOn, mode: () => window.__viewer.mode(),
    setMode: (mode) => window.__viewer.setMode(mode),
    spawns: () => window.__viewer.stats().spawns,
    team: () => window.__viewer.net?.()?.team ?? null,
    teleport: (x, y, z, yaw?) => window.__viewer.teleport?.(x, y, z, yaw) ?? false,
    markers: () => devMarkersOn, setMarkers: setDevMarkers,
    live: liveNow,
    places: () => loaded ? m.devPlaces({
      spawns: spawnsFor(loaded.name) ?? null,
      slots: loaded.slots,
      escortees: loaded.escortees ?? [],
      extraction: extractionPoints(loaded.ai),
      bomb: loaded.bombStart ?? null,
    }) : [],
    mapBounds: () => {
      const grid = walk.gridOfGround();
      if (!grid) return null;
      const { originX, originZ, cellDim, cellsX, cellsZ } = grid.params;
      if (!(cellDim > 0) || !(cellsX > 0) || !(cellsZ > 0)) return null;
      return { minX: originX, maxX: originX + cellsX * cellDim, minZ: originZ, maxZ: originZ + cellsZ * cellDim };
    },
    floorUnder: (x, z) => {
      const grid = walk.gridOfGround();
      if (!grid) return null;
      const y = walk.feet()?.[1] ?? fly.pose().y;
      // Every floor in the column. The walk's pick refuses one more than 20 over the feet, which ignored an uphill click.
      return m.nearestFloor(probeGround(grid, x, z).map((h) => h.y), y);
    },
    setCamera: (pose) => { window.__viewer.setCamera(pose); },
    worldToggles: () => ({ collision: ui.toggles().collision, wireframe: ui.toggles().wireframe }),
    setWorldToggle: (name, on) => {
      const box = document.getElementById(name);
      if (!(box instanceof HTMLInputElement) || box.checked === on) return;
      box.checked = on;
      box.dispatchEvent(new Event('change'));
    },
    tracesOn: () => devTracesOn,
    setTraces: (on) => { devTracesOn = on; drawDevTraces(); },
    overlaysShown: () => { drawDevMarkers(); drawDevTraces(); },
    infiniteAmmo: () => devRefill,
    setInfiniteAmmo: (on) => { devRefill = on; },
    applyKit: (text) => {
      const parsed = kitParam(`kit=${text.trim()}`);
      if (!parsed) return 'bad';
      return window.__viewer.setLoadout([...parsed]) ? 'ok' : 'refused';
    },
    copySpot: () => {
      const live = liveNow();
      const search = m.devSpotSearch(globalThis.location?.search ?? '', live.play, live.archive, live);
      if (!search) return null;
      try {
        const loc = globalThis.location;
        globalThis.history?.replaceState(globalThis.history.state, '', `${loc.pathname}${search}${loc.hash}`);
        void globalThis.navigator?.clipboard?.writeText(`${loc.origin}${loc.pathname}${search}${loc.hash}`).catch(() => { /* the address bar still holds it */ });
      } catch { /* a page without a history */ }
      return search;
    },
  });
  if (devPanelQueued) { devPanel.setOpen(true); devPanelQueued = false; }
  consumeDevSpot = () => {
    if (spotDone) return;
    const spot = m.readDevSpot(SEARCH);
    if (!spot) { spotDone = true; return; }
    if (playOn && mayEnter('walk', playOn, FLY)) {
      if (walk.mode() !== 'walk' && !window.__viewer.setMode('walk')) return;
      if (!window.__viewer.teleport?.(spot.x, spot.y, spot.z, spot.yaw)) return;
      spotDone = true;
      return;
    }
    window.__viewer.setCamera({ x: spot.x, y: spot.y, z: spot.z, yaw: spot.yaw });
    spotDone = true;
  };
  clearDevTraces = () => { devTraceList = []; overlays.setRoundTraces(new Float32Array()); };
  drawDevTraces = () => { overlays.setRoundTraces(devOverlayDrawn(devPanel?.isOpen() ?? false, devTracesOn) ? m.tracePositions(devTraceList) : new Float32Array()); };
  firearm.fire.subscribe((e) => {
    if (e.type !== 'round') return;
    if (devRefill && e.rounds === 0) m.devRefillMagazine(firearm.fire);
    devTraceList = m.rememberTrace(devTraceList, {
      from: [e.from[0], e.from[1], e.from[2]], to: [e.to[0], e.to[1], e.to[2]], hit: e.hit,
    });
    if (devTracesOn) drawDevTraces();
  });
  // A map shown before this import resolved called the no-op twice (`show`, `startInWalk`): place its spot now, once.
  if (loaded) consumeDevSpot();   // `spotDone` keeps a later call from placing it again
}).catch(() => { /* a navigation aborted the optional dev module: expected */ });
