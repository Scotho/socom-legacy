import { mountMenuSampling, parseMenuSampling, type UiSamplingSettings } from './experimentalUiSampling';
import { FrameGuard } from './frameGuard';
import { pageCloseReport } from './net/closeReport';
import { Zar, parseRdr, readZarMembers, type AssetSource } from '@s2u/archive';
import { assetSourceFor } from './discSource';
import { BlackPictureSource, type BlackPicture, type MovieFrame, type MoviePictureSource } from '@s2u/fmv';
import type { Rgba } from '@s2u/gs';
import { FONTS_RDR, parseAnimSets } from '@s2u/scene';
import {
  DialogPartsHost, DnasCommands, FRONT_END_PARAM, FrontEndMachine, LoaderScreens, MenuInput, MovieCommands, MovieLayer, ONMPEGEND, Opener, PopupSlot,
  SoftKeyboardFrontEnd, UiClock, UiCommandHost, UiVarManager, dialogLookup, isVideoPictureDesign, selectVideoPicture, videoPictureLookup, type VideoPicture, loaderTextures, readLoaderImages, readTextFaces, widgetPad,
  UNIVERSE_QUERY, UniverseCommands, UniverseList, type UniverseReply, type UniverseService, UsagePolicyCommands, type UsagePolicyService,
  type CaptionSource, type DialogDesign, type Launch, type MoviePicture, type OpenerEvent, type PadButtonName, type RawImage, type RawName,
  type TextFace, type UiDrawItem, type UiSoundCues, type WidgetPad, type ZAnimRtSet, type LobbyClient, type LobbyService, lobbyEventInto,
  mountCreateGame, type MissionRecord, NO_PAD, OnlineFiltersCommands, OptionGlobals, OptionsCommands, initSystemTuners, seedNumMultiMissions, type ValveEntry,
  type RoundQueueLine, lobbyBotsGate, syncLobbyBots, withLobbyBots, type MenuInputSource, recoverLobbyControls, setComposeScreenProbe,
} from '@s2u/ui';
import { devToolsEnabled } from './devTools';
import { UI_PERF_WINDOW_HOOK, uiPerfRequest } from './uiPerfRequest';
import type { UiPerfProbe, UiPerfRenderProbe } from './uiGpuPerf';
import { DIALOG_VOLUME_DEFAULT, MUSIC_VOLUME_DEFAULT } from '@s2u/sound';
import { GameAudio, WebAudioOut, type TunerVars } from './audio';
import { screenOriginKeeper } from './screenOrigin';
import { pagePicture } from './picture';
import { hdTextures } from './hdTexturePack';
import { collectOnHint, pageHintFlags, pageTextureChoice, parseTextureChoice } from './packs/pagePacks';
import { videoSettingsDialogLookup } from './videoSettings';   // CPS-4b: VIDEO OPTIONS' browser rows (the lookup below)
import type { HdMenus } from './hdMenuTextures';
import { captionTextOf, chainUiTexturePrefetch, pageCaptions, pageUiTextures, startPageUiTexturePrefetch } from './frontEndAssets';
import { frontEndMovieOut, frontEndMovies, movieFramePicture, movieMissTeller, pageMovieWorker, type FrontEndMovies, type MovieWorkerHandle } from './frontEndMovies';
import { showPageLine } from './pageLine';
import { accountServiceBase, pageLoginService, pinnedMatchSocket, sessionLobby, type LobbyConnection, type PinnedSocketUrl } from './connectHost';
import { connectMenuCommands } from './menuCommandsHost';
import { MenuMusic, frontEndMusicOut } from './menuMusic';
import { connectNetLogin, type NetLoginConnection } from './netLoginHost';
import { connectPersona, readsUniverseFirst, restoreCardUiVars, type PersonaConnection } from './personaHost';
import { withMenuArt, type MenuArt } from './menuArt';
import { fetchUniverseService, universeServiceBase } from './universeHost';
import { fetchUsagePolicyService } from './usagePolicyHost';
import { connectClanInvitations, fetchClanInvitationsService, fetchClanMembershipService, withClanInvitationNotice, type ClanMembershipTransport } from './clanInvitationsHost';
import { connectClanMessages, fetchClanMessagesService, type ClanMessagesTransport } from './clanMessagesHost';
import { connectManageRoster, fetchManageRosterService, type ManageRosterTransport } from './manageRosterHost';
import { connectWorldOfSocom, fetchAnnouncementService, fetchOwnerFieldsService, fetchPlayerInfoService, fetchRoomListService, type WorldOfSocomConnection, type WorldOfSocomMount } from './worldOfSocomHost';
import { briefingRoomPingDraw, withBriefingRoomPing } from './briefingRoomPing';
import { connectBriefingRoom, fetchBriefingRoomService, type BriefingRoomTransport } from './briefingRoomHost';
import { connectIgnoreList, fetchIgnoreListService, type IgnoreListTransport } from './ignoreListHost';
import { connectLadderLobby, fetchLadderService, type LadderTransport } from './ladderLobbyHost';
import { connectFriendList, fetchFriendListService, type FriendListTransport } from './friendListHost';
import { connectCreateClan, fetchCreateClanService, type CreateClanTransport } from './createClanHost';
import { connectGameLobby, fetchGameLobbyService, GAME_LOBBY_MATCH_START, type GameLobbyHandOff, type GameLobbyTransport } from './gameLobbyHost';
import { connectInvite, endHandOff, guardInviteLogin, offerInvite, pageInvite, withInviteButton, type InviteHanded, type InviteMount } from './inviteHost';
import { deferredMatch, LobbyMatch, missionMapPath, pageLobbyMatchScreen, writeNetErrno, type LobbyMatchPorts, type LobbyMatchReturn } from './lobbyMatch';
import { pageServerUpdate } from './serverUpdate';
import { gamepadCross, operatorToast, saysFor, withSays, type OperatorToast, type SayMemory } from './operatorToast';
import { armoryFromDisc, type ArmoryData } from './armoryData';
import { keepMissionRead } from './roundScreens';
import { LOBBY_DIALOG, LobbyArmory } from './lobbyArmory';
import type { MatchLoader, MatchWindow } from './matchMount';
import { matchLoaderSlot, releasesMatchOnReturn, type MatchLoaderSlot } from './matchLoaderSlot';
import { readGraphicsBackend } from './graphicsBackend';
import { pageDeviceClass, pageRendererProbe } from './deviceClass';
import { LobbyPrepareTrigger, lobbyPrepareAllowed, type LobbyPreparePorts } from './lobbyPrepare';
import { menuRasterWanted, movieWorkerSleeps, xboxMemoryMeasures } from './frontEndSleep';
import type { MatchAudio } from './matchSound';
import { LoadingPanel } from './loadingPanel';
import { loadingHold } from './loadingHold';
import { markLoad, markLobbyPrepared } from './loadMarks';
import type { WebSocketLike } from './net/client';
import type { ServerEvent } from './net/protocol';
import { CreateGameOfferRead, fetchCreateGameService, offerWithRooms, missionsFromReaderc, sessionCreateGame, type CreateGameTransport } from './createGameHost';
import { attachMenuInput } from './menuInput';
import { connectMenuRoutes } from './menuRoutes';
import { LOBBY_LINK_DIRECT_HOLD_SECONDS_ADAPTATION } from './lobbyLinkDirect';
import { showLobbyLinkCover } from './lobbyLinkCover';
import { MoviePlayerHost } from './moviePlayerHost';
import type { MovieSoundOut } from './movieSound';
import { connectSoftKeyboard, readUiParams } from './softKeyboardKeys';
import type { RasterOptions, UiCanvasTarget, UiTextures } from './uiCompositorView';
import { releasePageQuadCache } from './uiCompositorView';   // QUAD-CACHE-RELEASE (LATER 859): the menus' cache let go under a match
import { CpuUiPresenter, isUiPresenter, type UiPresenter } from './uiPresenter';
import { FrontEndGpu, uiGpuFrontFrameOptions } from './uiGpuFront';
import { uiGpuSurfaceLoader, uiGpuSurfaceWiring } from './uiGpuSurfaceMount';
import { pageUiGpuSwitch, uiGpuDevBuild, type UiGpuSwitch } from './uiGpuSwitch';
import { seedUiGpuTextureKey } from './uiGpuTextures';
import { HD_MENU_SCALE_LIMIT } from './uiRasterRules';
import { pageUiSounds, type FrontEndAudio } from './uiSoundHost';
import type { SourceRequest } from './worker';
import { tauntTexts } from './tauntSettings';
import { messageTexts } from './messageSettings';
import { bootValves, playOptionsOf, readGlobalValves, restoreValveModule, VALVE_MODULE } from './originalOptions';
import { controllerConfigs, type ControllerConfigs } from './controllerConfigs';
import { sessionStartMenuOptions, START_MENU_PAGE, storeVoiceModulation, type StartMenuPage } from './startMenu';
import { NativeSettings, readNativeOptionsAssets } from './nativeSettings';
import type { NativeOptionsState } from './nativeOptionsHost';
import { brightnessOfVars, frameCanvas, setBrightness } from './brightness';
import { connectNativeOptions } from './nativeOptionsContext';
import { pageCard, tabSettings } from './pageStore';

/**
 * The page's front-end entry (PLAT-10; W9.R4; web research 115): `@s2u/ui`'s front end -- the menu state on its start
 * dialog, the switches, the fades, the game states, the reboot -- run on PLAT-12's clock, with PLAT-21's movie host
 * behind a `BACKGROUND TYPE MPEG` dialog, drawn by PLAT-14's drawer onto a 640 x 448 canvas over the page. Since
 * BOOT-04 (web research 139) it runs the opener: at `/` the loader's raw screens (BOOT-02) first, then the game's own
 * boot dialogs -- `dlgIntroScreen`, `dlgIntroCinematic` (sony448.pss), `dlgSecondCinematic` (Intro_2.pss) -- to
 * `dlgMenu`, through `@s2u/ui`'s `Opener` with the card and hardware bindings stubbed (BOOT-05 and BOOT-09 replace them).
 *
 * **A browser adaptation, the page's default entry** (OT.R19, the owner, 2026-10-04: "the default load is the menu flow
 * now"): at the page's base path the page is the front end **alone** (OT.R12: `./pageEntry` never loads `./main` there,
 * so no map viewer in any mode, no match, no world behind this canvas), its path mirroring the menu flow
 * (`./menuRoutes`, OT.R10); the map viewer and Play are the page at `<base>/testroom`. `@s2u/ui`'s `FRONT_END_PARAM`
 * (`menuflow`, OT.R9; research 115 §15) no longer decides the page: `menuflow=<dialog>.rdr` names the start dialog. PLAT-15's widgets are built, ticked and drawn with each dialog and PLAT-16's popup is
 * in the overlay slot (sprint 9's connecting lines, `DialogPartsHost`), and PLAT-23's sound host is behind the command
 * host (`sounds`): `mountFrontEnd` makes it from the source it reads, over a `GameAudio` of the front end's own that holds
 * HUDUI (research 115 §16.2). PLAT-11's menu input reads the page's keys, pad and taps (`./menuInput`, research 116
 * §16). The bitmaps and glyphs draw from the source's banks and caption tables (ONL-01, `./frontEndAssets`, research
 * 144 §5). It reads them from the visitor's own disc image (OT.R14, web research 148: `./pageEntry` offers the disc
 * page and hands the opened image in as `{ kind: 'iso', file }`), or from the served tree under `?devmode`. The movies
 * are the disc's (MOVIE-WIRE, 2026-10-03; `./frontEndMovies`): `mountFrontEnd` hands the session PLAT-19c's worker source
 * over the same source, whose pictures PLAT-14's drawer copies (`movieFramePicture`), with PLAT-20's sound read for each
 * movie opened and played on the front end's own audio (research 120 §11, research 137 §5). The menus' music is the
 * disc's (MENU-MUSIC, research 152): `mountFrontEnd` gives PLAT-23's host the page's streamer (`./menuMusic`), which plays
 * a `MUS_` stream from VAGSTORE by range on the same audio.
 */

/** A dialog's name as `--menu_state` takes one: a disc member's (letters, digits, underscores, `.rdr`). */
const DIALOG_NAME = /^[A-Za-z0-9_]{1,59}\.rdr$/;

/**
 * B206 ML-3 (plan 2026-11-06-mods-loader, ML.R11; product track, ML.R2): the menus draw HD while the HD pack is the
 * texture pack chosen in MODS -- under either picture -- or under `?uiPerfHd` (GM-02's instrument). ML-6 removed the HD
 * picture, the third way in.
 * GM-HDCAP (plan 2026-11-01-gpu-menus, the Log 2026-11-09; product track, a browser adaptation): and only while the
 * GPU may draw the front end at HD (`gpu`, `frontGpuMayDraw`). The software path at the pack's 4x froze players in the
 * menus (GM-02, research 380 §6.1: 150-183 ms frames, 39-49 s of the UI clock lost a wall minute); with the GPU drawer
 * off -- by `?uiGpu=off`, the storage kill, or (the flip's review F2) a front surface down at L4 or L3 -- the HD pack
 * keeps its world textures and the menus draw the original 640 x 448 frame. `?uiPerfHd` (the perf instrument) still
 * forces the HD path.
 * GM-28 (GM.R19): this is the load gate only; the scale each frame is drawn at follows what presents (the loop's
 * `uiGpuFrontFrameOptions`), so a surface that does not present (L4, waiting, released, a kill) draws the 1x frame.
 */
export function menusHdOn(o: { uiPerfHd: boolean; choice: string | null; gpu: boolean }): boolean {
  return o.uiPerfHd || (o.gpu && parseTextureChoice(o.choice)?.kind === 'hd');
}

/**
 * The menus' HD decision applied (HD-3, ML-3; the flip's re-check 3 made it a unit): the pack's module loaded once, only
 * when the gate (`on`) first answers true; every later call hands the loaded pack the gate's answer (while the page runs)
 * and the chosen pack's id (PR #729's Codex P2: a replaced pack reloads its manifest). Once the gate answers false for good
 * (the front surface down, review F2), a later pack-choice notice or picture change sets the pack off again and loads
 * nothing.
 */
export function hdMenusApplier<H extends { set(on: boolean, choice: string | null): unknown }>(o: {
  on: () => boolean; running: () => boolean; choice: () => string | null; load: () => Promise<H>;
}): () => void {
  let loading: Promise<H> | null = null;
  return () => {
    if (!o.on() && !loading) return;
    loading ??= o.load();
    void loading.then((h) => h.set(o.running() && o.on(), o.choice())).catch((e) => { console.warn('[hd] menus:', e); });
  };
}

/**
 * GM-HDCAP, GM-28: whether the front end's GPU drawer may draw at HD -- the switch's answer before a context is made (the
 * address, the support kill, a session kill, the landed table): `on`, or `shadow` on a page the Vite dev server serves
 * (`dev`, `uiGpuDevBuild`: GM-16b's development table, whose guard compares HD frames, GM.R11). A built page never keeps
 * the menus' HD for `shadow` -- its table has none, and a URL `shadow` there would show the 4x software frame (GM.R19).
 * The capability gate (L4) is not known before a context: the loop's per-frame options cover it.
 */
export function frontGpuMayDraw(sw: UiGpuSwitch, dev: boolean): boolean {
  const mode = sw.resolve('front', HD_MENU_SCALE_LIMIT).mode;
  return mode === 'on' || (dev && mode === 'shadow');
}

export interface FrontEndEntry {
  /** `--menu_state`: the start dialog, or null for the default. */
  startDialog: string | null;
}

/** What the address asks of the front end: its start dialog (`menuflow=<dialog>.rdr`), else the default (OT.R19). */
export function frontEndEntry(search: string): FrontEndEntry {
  let q: URLSearchParams;
  try { q = new URLSearchParams(search); } catch { return { startDialog: null }; }
  const v = q.get(FRONT_END_PARAM) ?? '';
  return { startDialog: DIALOG_NAME.test(v) ? v : null };
}

/** The disc files the entry reads (research 115 §7: the menu state opens `run/ui` `readerc.zar` and `run/uizanim.zar`; the loader's `RUN/RAW/`, research 130). */
export const FRONT_END_FILES = {
  dialogs: ['RUN/UI/READERC.ZAR', 'RUN/UI/READERX.ZAR'],
  scripts: 'RUN/UIZANIM.ZAR',
  fonts: FONTS_RDR.archive,
  loader: ['RUN/RAW/PULOADGP.RAW', 'RUN/RAW/LOADING.RAW'],
} as const;

/** OA-3: the toast's closed ids in the tab's storage, through `./pageStore` (W6.R2). */
const sayMemory: SayMemory = { getItem: (k) => tabSettings.get(k), setItem: (k, v) => { tabSettings.set(k, v); } };

/** The disc's part of the front end. */
export interface FrontEndDisc {
  /** A dialog by name (`dialogLookup` over READERC then READERX). */
  dialog: (name: string) => DialogDesign | null;
  /** `RUN/UIZANIM.ZAR`'s sets. */
  sets: ZAnimRtSet[];
  /** `fonts.rdr`'s faces (PLAT-13). */
  faces: TextFace[];
  /** The caption tables (PLAT-04's `LocService`); null: captions drawn as written. */
  captions: CaptionSource | null;
  /** The loader's two pictures (BOOT-02's `readLoaderImages`); a missing one draws black. */
  loader: Partial<Record<RawName, RawImage>>;
  /** What would not read. */
  missing: string[];
  /**
   * `global_valves.rdr` whole, its rows in order with their type words (`./originalOptions` `readGlobalValves`): the
   * registry the session starts with, as `CValve_Open` loads it (`bootValves`; OPT-02b, research 229 §1) -- the option
   * valves' defaults among them (research 302 §4). Absent, none set.
   */
  globalValves?: ValveEntry[];
  art?: MenuArt;   // MENU-02a: the bitmaps, the font's atlas, the MODELS (`./menuArt` withMenuArt); absent, the textures placeholder stands
}

const why = (e: unknown): string => (e instanceof Error ? e.message : String(e));
/**
 * Whether this page is a development build (Vite's `import.meta.env.DEV`: true under the dev server, false in every
 * built page; none under Node) -- `ACCOUNT_SERVICE_OWN_ORIGIN_ADAPTATION`'s gate (`./connectHost`). Named as
 * `import.meta.env.*` is, so that Vite hands the module its env (`./online`'s `viteLocalPort`).
 */
export function devBuild(): boolean {
  return (import.meta.env as Record<string, unknown> | undefined)?.['DEV'] === true;
}

/** Reads the front end's files; never throws -- what will not read is in `missing`. */
export async function readFrontEndDisc(source: AssetSource): Promise<FrontEndDisc> {
  const missing: string[] = [];
  const archives: Zar[] = [];
  for (const path of FRONT_END_FILES.dialogs) {
    try { archives.push(Zar.parse(await source.read(path))); } catch (e) { missing.push(`${path}: ${why(e)}`); }
  }
  let sets: ZAnimRtSet[] = [];
  try { sets = parseAnimSets(Zar.parse(await source.read(FRONT_END_FILES.scripts))).sets; } catch (e) { missing.push(`${FRONT_END_FILES.scripts}: ${why(e)}`); }
  let faces: TextFace[] = [];
  try {
    const fonts = (await readZarMembers(source, FONTS_RDR.archive, [FONTS_RDR.member])).get(FONTS_RDR.member);
    if (!fonts) throw new Error(`no ${FONTS_RDR.member}`);
    faces = readTextFaces(parseRdr(fonts));
  } catch (e) { missing.push(`${FONTS_RDR.archive}: ${why(e)}`); }
  let loader: Partial<Record<RawName, RawImage>> = {};
  try { loader = await readLoaderImages(source); } catch (e) { missing.push(`RUN/RAW: ${why(e)}`); }
  let globalValves: ValveEntry[] | undefined;
  try { globalValves = await readGlobalValves(source); } catch (e) { missing.push(`global_valves.rdr: ${why(e)}`); }
  return { dialog: videoSettingsDialogLookup(videoPictureLookup(dialogLookup(archives))), sets, faces, captions: await pageCaptions(source, missing), loader, missing, ...(globalValves ? { globalValves } : {}) };   // ONL-01: PLAT-04's tables from the tree (`./frontEndAssets`); none: captions drawn as written
}

export interface FrontEndSessionOptions<P = BlackPicture> {
  /**
   * OPT-14 (research 344 §3, §6; its review's F1): the controller configs this session's OPTIONS binds --
   * CONTROLLER PRESETS' `SetControllerConfig` and every `StoreOptions` run on them. The page's own front end passes
   * the page's (`controllerConfigs`); absent (a development instrument's session, the test room's SETUP TAUNTS),
   * nothing is bound, so such a session never changes the pad's map.
   */
  controllerConfigs?: ControllerConfigs;
  /**
   * R4B-02 (OT.R97, research 375 §2): the START menu's page whose VOICE MODULATION every `StoreOptions` of this session
   * sets from `VoiceMask` (r0004's `UIStoreOptions`, r4 0x27cdb0-0x27cdc4: `./startMenu` `storeVoiceModulation`). The
   * page's own front end passes the page's (`START_MENU_PAGE`); absent (a development instrument's session), nothing is
   * bound, as with `controllerConfigs`.
   */
  startMenuPage?: StartMenuPage;
  /**
   * SCREEN POSITION (`./screenOrigin`, an adaptation): the origin `SetScreenOrigin` and each `StoreOptions` lay, the card's
   * `ScreenOriginX` / `ScreenOriginY` less 128; absent (a test's session), drawn nowhere.
   */
  screenOrigin?: (x: number, y: number) => void;
  /** VIDEO MODE (OT.R79, `./picture`): the page's picture, shown on VIDEO's strip and set by it; absent (a test's session), the strip moves nothing. */
  picture?: { get(): VideoPicture; set(picture: VideoPicture): void };
  /**
   * After the card's UI variables are restored and before the first dialog's ONSTART runs (web research 301 §6): a
   * host's own variables at that moment (`/testroom`'s development-only SETUP TAUNTS adds the HudCLOC defaults, as
   * `dlgNetLogin` would). Absent: none.
   */
  initializeVars?: (vars: UiVarManager) => void;
  disc: FrontEndDisc;
  /** `--menu_state`; absent, the default. */
  startDialog?: string | null;
  /** The bitmaps by name (none by default: `@s2u/ui`'s textures placeholder). */
  textures?: UiTextures;
  /** Each dialog built, its design (FE-SWEEP: the page reads the lazy banks its `LIBRARIES` name, `PageUiTextures.need`). */
  dialogBuilt?: (design: DialogDesign) => void;
  /**
   * The movies' picture source (PLAT-21's `MoviePictureSource`): the page's is PLAT-19c's worker source with PLAT-20's
   * sound (`./frontEndMovies`). Absent (a session with no decoder: the tests', a page without workers), `@s2u/fmv`'s
   * `BlackPictureSource` -- the disc's picture counts, every picture black, the sequence and its timing the same.
   */
  source?: MoviePictureSource<P>;
  /** A presented picture's pixels for the drawer (its `image` is the source's `P`); absent, every picture draws black. */
  moviePicture?: (picture: MoviePicture) => Rgba | null;
  /** The loader's screens before the game (the opener at `/`); false when a deep link lands past the boot. Default true. */
  loader?: boolean;
  /** Every `LoadExecPS2` (the reboot, the shutdown), for the page's log. */
  onLaunch?: (l: Launch) => void;
  /**
   * PLAT-23's cues (`makeUiSoundHost(...).cues`, `./uiSoundHost`): the zAnim `SOUND` command, `PopUpDialog`'s `.METAL`,
   * `SwitchMenu PREVIOUS_SCREEN`'s BACK. Absent: the front end is silent.
   */
  sounds?: UiSoundCues;
  /** The opener's events (the page's log). */
  onEvent?: (e: OpenerEvent) => void;
  /** ONL-04: the universe query's service (`./universeHost`); absent, `GetServerList` keeps ONL-03's stand-in worker. */
  universe?: UniverseService;
  /** ONL-04: a deep link past the DNAS screen -- the replies read before the session, as that screen's worker leaves them. */
  universeReply?: UniverseReply | null;
  /** ONL-08: the policy request's service (`./usagePolicyHost`, SVC-05's `/texts/policy`); absent, GetUsagePolicy stays the table's. */
  usagePolicy?: UsagePolicyService;
  /** ONL-09: the announcement's service (`./worldOfSocomHost`, SVC-05's `/texts/announcement`) and SVC-09a's invitations (`./clanInvitationsHost`); absent, never answered. */
  announcement?: WorldOfSocomMount['announcement'];
  clanInvitations?: WorldOfSocomMount['invitations'];
  /** ONL-11: SVC-06's room list (`./worldOfSocomHost`, `/lobby/channel-list` with the session's ticket as its bearer); absent, never answered. */
  roomList?: WorldOfSocomMount['roomList'];
  /** OPT-15: ONLINE OPTIONS' description to the record (`./worldOfSocomHost`, `/lobby/owner-fields` with the session's ticket); absent, never answered. */
  ownerFields?: WorldOfSocomMount['ownerFields'];
  /** SVC-15a: the own-stats read's PlayerInfo (`./worldOfSocomHost`, `/lobby/player-info` with the session's ticket); absent, never answered. */
  playerInfo?: WorldOfSocomMount['playerInfo'];
  /** ONL-12: SVC-06's join, filter, leave and game list (`./briefingRoomHost`, the session's ticket as the bearer); absent, never answered. */
  briefingRoom?: BriefingRoomTransport;
  /** ONL-25: SVC-17's ignore list and SVC-18's FindPlayer (`./ignoreListHost`, the session's ticket as the bearer); absent, never answered. */
  ignoreList?: IgnoreListTransport;
  /** ONL-30a: SVC-13's ladder and SVC-15a's PLAYER INFO (`./ladderLobbyHost`, the session's ticket as the bearer); absent, never answered. */
  ladder?: LadderTransport;
  /** ONL-24: SVC-16's friends (`./friendListHost`, the session's ticket as the bearer); absent, never answered. */
  friendList?: FriendListTransport;
  /** ONL-26: SVC-08's create and stats post (./createClanHost); absent, never answered. */
  createClan?: CreateClanTransport;
  /** ONL-28: SVC-09's invite, sent list, revoke and response, SVC-09a's received list with the ticket, SVC-18's FindPlayer and whisper (./clanInvitationsHost); absent, never answered. */
  clanMembership?: ClanMembershipTransport;
  /** ONL-29: SVC-10's clan messages (./clanMessagesHost); absent, never answered. */
  clanMessages?: ClanMessagesTransport;
  /** ONL-27: SVC-08's GetMyClans, roster, leadership, disband and stats and SVC-09's removal (./manageRosterHost); absent, never answered. */
  manageRoster?: ManageRosterTransport;
  /** ONL-07: the account service the login asks (`./connectHost`, SVC-03's `/account/*`); absent, no lobby: ONL-06's placeholders stand. */
  account?: LobbyService;
  /** ONL-13: SVC-06's `/lobby/create-game` (`./createGameHost`) and `missionlist.rdr`'s records; absent, never answered / none. */
  createGame?: CreateGameTransport;
  /** OT.R71: CREATE GAME's RESPAWN row offered (absent or true, the default); false (a test's) disables it. */
  respawnRules?: boolean;
  missions?: () => readonly MissionRecord[];
  /** NB-7 (OT.R50): the server's CREATE GAME offer (`./createGameHost` `fetchCreateGameOffer`); absent or null, FIRST_RELEASE_MAPS. */
  createGameOffer?: () => readonly number[] | null;
  /** P537-L2 (an adaptation: a developer's test server): the server runs `CREATE_GAME_ALL_MAPS=1` (`CreateGameOfferRead.allMaps`); absent, false. */
  allBotGames?: () => boolean;
  /** ONL-16a: the join, the leave and the host's report (`./gameLobbyHost`), and the page's pinned match socket; absent, never answered / no socket. */
  gameLobby?: GameLobbyTransport;
  matchSocket?: PinnedSocketUrl;
  /** ONL-16a: the match's start, the socket handed on open (`GAME_LOBBY_MATCH_START`), for the page's log; the session's `match` takes the client. */
  matchStart?: (h: GameLobbyHandOff) => void;
  /** LOBBY-INVITE: the address's invite, its strip and the browser's invite channel (`./inviteHost`); absent, none. */
  invite?: InviteMount;
  /**
   * SVC-19 (web research 266 §3.3): the round's drain of the lobby server's lines -- the mounted match's (`./matchMount`
   * `MountedMatch.lobbyLine`), null while none is up: while it answers one, a forwarded whisper or universe line goes to
   * the match's HUD, not the game lobby's panel (`BriefingRoomChat`'s `round`). Absent, never a round's.
   */
  roundChat?: () => ((line: RoundQueueLine) => void) | null;
  /** ONL-16a: a socket for the tests (the game socket's); absent, the page's `WebSocket`. */
  gameSocket?: (url: string) => WebSocketLike;
  /**
   * The shared ARMORY on the game lobby's page (`./lobbyArmory`, the owner's playtest of 2026-10-06): the mission's data
   * (`./armoryData` with its world). Absent, the ARMORY is the disc's dialog on the generic runtime.
   */
  armory?: { load(mission: string): Promise<ArmoryData | null> };
  /**
   * ONL-18 (web research 166 §5): the page's half of the hand-off -- the loading screen, the map's load, the match on the
   * client (`./lobbyMatch` `LobbyMatchPorts`), and the page told when it leaves the front end and comes back. Absent, a
   * screen that draws nothing, a load done at once and a match that keeps the client with nothing drawn (the page's own
   * is `./matchMount`'s, ONL-18c: `mountFrontEnd`).
   */
  lobbyMatch?: Partial<Pick<LobbyMatchPorts, 'screen' | 'load' | 'prepare' | 'unprepare' | 'start'>> & LobbyPreparePorts & {
    leave?(): void;
    returned?(r: LobbyMatchReturn): void;
    /**
     * MATCH-SOUND: the return settled -- the menu state's returning dialog built and run `RETURN_SETTLE_FRAMES_ADAPTATION` frames
     * (its ONSTART's plays made), so what it started, or left silent, is known (the held music decided then).
     */
    settled?(r: LobbyMatchReturn): void;
  };
}


/** OBF-2: each menus' frame's stand-in source (`FrontEndSession.menuFrame`) to the page's source it reads. */
const FRAME_SOURCES = new WeakMap<MenuInputSource, MenuInputSource>();

/** The front end, its movie host and its clock: what the page advances once per animation frame and draws. */
export class FrontEndSession<P = BlackPicture> {
  readonly opener: Opener;
  readonly machine: FrontEndMachine;
  readonly clock = new UiClock();
  readonly layer = new MovieLayer();
  readonly movie: MoviePlayerHost<P>;
  /** The picture source the movie host's two players share (the original's one decoder). */
  readonly source: MoviePictureSource<P>;
  readonly host: UiCommandHost;
  /**
   * The overlay slot (W9.R4), one for the whole front end and handed to every dialog host the machine makes: where
   * `PopUpDialog` shows the `POPUP` node and `KillPopUp` hides it. PLAT-16's component is connected to it
   * (`popups.connect(parts.makePopup)`).
   */
  readonly popups = new PopupSlot();
  /** PLAT-23's cues the session was given (`sounds`), or null: the front end silent. */
  readonly sounds: UiSoundCues | null;
  /** What each built dialog holds beside its nodes (PLAT-15's widgets, PLAT-16's popup), and the node commands' objects. */
  readonly parts: DialogPartsHost;
  /** PLAT-11's menu input: the pad read, the dispatch, the focus ring, `SuspendMenuInput` (the page's adapter its source). */
  readonly input: MenuInput;
  /** OBF-2: the menus held while a match is up (`holdMenus`): each read of theirs, and the shared ARMORY's, is no pad. */
  private menusHeld = false;
  /** PLAT-17's soft keyboard: `GetTextInput`, the dispatch's step 2, A8, the draw over the screen (its file and keys: `./softKeyboardKeys`). */
  readonly keyboard: SoftKeyboardFrontEnd;
  /** The game's one UI variable manager (0x437e80): the widgets, the popup and the keyboard read and write the same. */
  readonly uiVars = new UiVarManager();
  /** OPTIONS (research 302 §4): the game's option globals as `StoreOptions` leaves them -- what the match applies. */
  readonly options = new OptionGlobals();
  /** MLS.R7: the match editor reuses the live session and its complete card serializer. */
  readonly nativeOptions: NativeOptionsState;
  /** ONL-01's NetCnf stand-in: `selection` is the server of the combination LOGIN chose (ONL-03's DNAS screen reads it). */
  readonly netLogin: NetLoginConnection;
  /** ONL-04: the client's universe entries and news (0x44fd50, 0x44fc60's), filled by `GetServerList`'s worker. */
  readonly universes = new UniverseList({ uiVars: this.uiVars });
  /** ONL-06: the persona form's rows, the client's account list (0x44fc60) and its module of the card's save file (`./personaHost`). */
  readonly persona: PersonaConnection;
  /** ONL-09: the SOCOM II ONLINE menu's rows, the invitations list and the launch's valves (`./worldOfSocomHost`). */
  readonly world: WorldOfSocomConnection;
  /** ONL-12: the join's and the BRIEFING ROOM's rows over the session's lobby (`./briefingRoomHost`, research 162 §4). */
  readonly briefing: ReturnType<typeof connectBriefingRoom>;
  /** OA-3 (a browser adaptation): the page's one toast for an operator's say (`./operatorToast`); null with no document. */
  readonly sayToast: OperatorToast | null = typeof document !== 'undefined' && document.defaultView ? operatorToast(document, gamepadCross(document.defaultView), sayMemory) : null;
  /** OA-3: the game handed off to the match (`GameLobbyMatchStart.mediusWorldId`, the mounted match's `handOff`), or null. */
  private matchGame: number | null = null;
  /** ONL-24: FRIENDS' rows, the client's friends list and requests, the pushes' poll (`./friendListHost`, research 269 §3). */
  readonly friends: ReturnType<typeof connectFriendList>;
  /** ONL-16a: a listed game's join and the GAME LOBBY over the game socket (`./gameLobbyHost`, research 165 §4). */
  readonly gameLobby: ReturnType<typeof connectGameLobby>;
  /** ONL-18: the game lobby's launch to the match on the same client (`./lobbyMatch`, web research 166). */
  readonly match: LobbyMatch;
  /** The game lobby's ARMORY as the shared screen (`./lobbyArmory`); null without the session's `armory` option. */
  readonly lobbyArmory: LobbyArmory | null;
  /** LOBBY-INVITE: the GAME LOBBY's button, the join, INVITE_FLOW's advance and the channel's answers (`./inviteHost`). */
  readonly invite: ReturnType<typeof connectInvite>;
  /** ONL-07: the lobby client, its two rows and its frame call (`./connectHost`, research 157 §5); null with no account service. */
  readonly connect: LobbyConnection | null;
  /** ONL-07: the session's lobby -- its state, and the login's ticket (`lobby.ticket()`: the seam for the screens after the login). */
  get lobby(): LobbyClient | null { return this.connect?.lobby ?? null; }
  /** The last tick's draw list. */
  last: UiDrawItem[] = [];
  /** GM-02 (`./uiGpuPerf`, an instrument; null but on a development build under `?devmode&uiPerf`): `render`'s raster and present times. */
  perf: UiPerfRenderProbe | null = null;
  /**
   * A test's pad record for the next frame (research 116 §1's states per button), or null; `press` fills it and the
   * opener's step-4 call reads it (`tap`). The page's pad is PLAT-11's reader (`input.read`), from the browser's keys,
   * gamepad and taps. A browser adaptation.
   */
  pad: WidgetPad | null = null;
  private pressed: PadButtonName | null = null;
  /** The last `advance`'s time, ms: ONL-18's clock (`LobbyMatch`). */
  private frameNow = 0;
  /** MATCH-SOUND: a return not settled yet (`lobbyMatch.settled`), and the frames its dialog has run. */
  private returning: { r: LobbyMatchReturn; frames: number; settle: () => void } | null = null;
  /** IP3 lobby prepare (`./lobbyPrepare`, a browser adaptation): the game lobby's mission watched once a frame (`advance`). */
  private readonly lobbyPrepare: LobbyPrepareTrigger;
  private readonly textures: UiTextures;
  private readonly moviePicture?: (picture: MoviePicture) => Rgba | null;

  constructor(o: FrontEndSessionOptions<P>) {
    const faces = o.disc.faces;
    const face = (n: string): TextFace | null => faces.find((f) => f.name.toLowerCase() === n.toLowerCase()) ?? null;
    const sounds = o.sounds ?? null;
    this.sounds = sounds;
    // The shared ARMORY's screen (`./lobbyArmory`): while it has the lobby's `dlg_equipment_mp.rdr`, that dialog's own
    // sounds are silent -- the shared screen plays its scripts' (the same disc scripts) and its steps'.
    const voiced = (): boolean => !(this.lobbyArmory?.owns(this.machine.shell()?.currentName ?? null) ?? false);
    this.parts = new DialogPartsHost({
      popupObject: () => this.machine.queue.popupObject, face, captions: o.disc.captions, uiVars: this.uiVars,
      // research 122 §6: the widgets' and the popup's code cues.
      sound: sounds ? (n) => { if (!voiced()) return; if (n === '.METAL') sounds.popup(); else if (n === 'TELETYPE') sounds.teletype(); else sounds.selection(); } : undefined,
    });
    // PLAT-23's connecting line: the cues behind the command host -- `SOUND` (30, `FUN_002659c0`) through the zAnim
    // host's `sound`.
    this.host = new UiCommandHost({ node: this.parts.nodeCommand, sound: sounds ? (cmd) => { if (voiced()) sounds.sound(cmd); } : undefined, instanceStop: sounds ? (anim) => { sounds.stopInstance(anim); } : undefined });   // PF-32 (research 233 §3)
    this.popups.connect(this.parts.makePopup);
    (this.input = new MenuInput({ machine: () => this.machine, parts: this.parts, selection: sounds ? () => { if (voiced()) sounds.selection(); } : undefined })).register(this.host);
    // The menus' tap is the shared ARMORY's while it has the screen (`armoryTap` on the same 640 x 448 frame).
    const tap = this.input.tap.bind(this.input);
    this.input.tap = (x, y) => { if (this.lobbyArmory?.hosting()) { this.lobbyArmory.tap(x, y); return null; } return tap(x, y); };
    (this.keyboard = new SoftKeyboardFrontEnd({ machine: () => this.machine, parts: this.parts, face, uiVars: this.uiVars, locText: captionTextOf(o.disc.captions), sound: sounds ? (k) => { sounds.keyboard(k); } : undefined })).connect(this.host, this.input);
    // The page's bitmaps come from two readers that both hold the menus' libraries: MENU-02a's art (the roller's quads, the
    // font atlas, the models' textures; `disc.art`) and ONL-01's banks (`textures`, the dialogs' bitmaps and captions).
    // Each answers what it holds; neither shadows the other (the merge of 2026-10-03 let `textures` hide the art, and
    // the roller drew nothing on the page).
    const art = o.disc.art?.textures ?? null, banks = o.textures ?? null;
    const own: UiTextures = (name) => art?.(name) ?? banks?.(name) ?? null;
    const loader = loaderTextures(o.disc.loader);
    this.textures = (name) => loader(name) ?? own(name);
    this.moviePicture = o.moviePicture;
    // PLAT-21's host over PLAT-14's layer (the player is its only writer); event 3 to the dialog built now; after a
    // pushed movie, the menu state's ON_STATE_POP and its two frames.
    this.source = o.source ?? (new BlackPictureSource() as unknown as MoviePictureSource<P>);
    this.movie = new MoviePlayerHost<P>({
      source: this.source,
      layer: { present: (p) => this.layer.present({ width: 640, height: 448, image: p }) },
      onMpegEnd: () => { this.machine.shell()?.event(ONMPEGEND); },
      onStatePop: () => this.machine.menu.statePop(),
      // The host stands in for CG's push of the movie state (`FUN_002cf380(.., 0x4086f4, 0)`): applied, it frame-syncs
      // and covers the top state with the push's argument 0 (`FUN_002ce9e0` D:L171928-171931) -- for the menu state,
      // OnCover `FUN_00366b10`, the dialog's background movie stopped, which `background.statePop` restarts at the pop.
      onCover: () => { this.clock.frameSync(); this.machine.states.top()?.onCover?.(0); },
    });
    for (const [name, entry] of Object.entries(new MovieCommands(this.movie).entries())) this.host.setHandler(name, (cmd) => entry(cmd));
    // PLAT-08's table is a registry each module fills (W9.R4): PLAT-23's three rows (126 StopAllSounds, 127
    // FadeAllSounds, 134 VagStreaming) beside PLAT-21's three above; the screens' twelve are the machine's at each boot.
    if (sounds) for (const [name, entry] of Object.entries(sounds.entries())) this.host.setHandler(name, (cmd) => entry(cmd));
    const { libmc, commands: menu, desktop } = connectMenuCommands(this.host, { machine: () => this.machine, uiVars: this.uiVars });   // MENU-01a's thirteen rows over the page's card (`./menuCommandsHost`)
    // OPT-09's day (OT.R5; research 302 §4): the main menu's OPTIONS runs its own chain (`CallOptions`, to
    // `dlgOptions_Menu.rdr`) in place of MENU-03's desktop-recompilation notice; the rows not built are parked there
    // (`@s2u/ui` `OPTIONS_PARKED_ROWS`). NEW GAME, LOAD GAME, EXTRAS and LAN keep their notice.
    desktop.hooks.unregister('dlgMenu.rdr', 'options_button', 'CROSS');
    initSystemTuners(this.uiVars);   // `InitSystemTuners` (FUN_0038a7a0) at the game's start: the volumes, the brightness, the sticks (longevity 2)
    const universe = o.universe;                                                       // ONL-04 (research 147): GetServerList's worker over the session's list
    const hidden = o.invite?.direct ? LOBBY_LINK_DIRECT_HOLD_SECONDS_ADAPTATION : undefined;   // OT.R121: OT.R20's holds behind the cover
    new DnasCommands({ valves: () => this.machine.valves, getServerList: universe ? () => this.universes.job(universe) : undefined, ...(hidden !== undefined ? { holdSeconds: hidden } : {}) }).register(this.host);   // ONL-03's five rows (research 146): the DNAS bypass, the stand-in workers
    this.netLogin = connectNetLogin(this.host, { machine: () => this.machine, uiVars: this.uiVars, libmc, ...(hidden !== undefined ? { connectHoldSeconds: hidden } : {}) });   // ONL-01's NetCnf rows over the same libmc (`./netLoginHost`)
    new UniverseCommands({ valves: () => this.machine.valves, uiVars: this.uiVars, list: this.universes, lobbyDisconnect: () => this.lobby?.disconnect() }).register(this.host);
    if (o.universeReply) { for (const e of o.universeReply.universes) this.universes.entry(e); for (const n of o.universeReply.news) this.universes.newsChunk(n); }
    if (o.usagePolicy) new UsagePolicyCommands({ uiVars: this.uiVars, service: o.usagePolicy, lobbyUp: () => this.lobby?.up ?? true, lobbyState: () => this.lobby?.state() ?? 0, lobbyLogout: () => { this.lobby?.logout(); } }).register(this.host);   // ONL-08 (research 156): GetUsagePolicy, LobbyLogout's stub
    this.opener = new Opener({
      // `CValve_Open` at the game's start (FUN_00351d40, the call D:L152619): `global_valves.rdr` whole, before any screen
      // makes a valve -- the registry's order, and so the card's `CValveSaveManager` module's, is the table's (OPT-02b).
      valves: bootValves(o.disc.globalValves ?? []),
      dialog: withBriefingRoomPing(withLobbyBots(withInviteButton(o.disc.dialog, () => this.opener?.valves), () => this.gameLobby?.commands.botsOffered() ?? false)), sets: o.disc.sets, host: this.host,   // INVITE_BUTTON_ADAPTATION; MLS-PING browser table; FBA-2's native team bot controls, H314/H315's games only
      build: { face, captions: o.disc.captions, movie: this.layer, model: o.disc.art?.model },
      movie: {
        service: this.movie, frame: (dt) => this.movie.frame(dt, null),
        unload: () => { this.movie.background.unload(); this.layer.clear(); },
        load: (bg) => { this.input.built(); this.movie.background.load(bg); },   // the build's focus (D:L263735-263745), then step 9
      },
      frameSync: () => this.clock.frameSync(),
      popups: this.popups,
      built: (b) => {
        this.parts.built(b);
        syncLobbyBots(this.gameLobby.commands, this.parts.current);
        // OT.R79: VIDEO's strip at the page's picture before its first tick checks the box (`selectVideoPicture`).
        if (o.picture && this.parts.current && isVideoPictureDesign(b.design)) selectVideoPicture(this.parts.current.widgets, o.picture.get());
        o.dialogBuilt?.(b.design);
      }, draw: this.keyboard.drawOver(briefingRoomPingDraw(this.parts)), widgetsTick: this.parts.widgetsTick, setEnabled: this.parts.setEnabled, focusTick: this.keyboard.tick,
      pad: this.input.read, input: this.input.dispatch, activate: this.input.activate,
      // `FUN_0027eff0` D:L126897-126900 and `FUN_0027e720` D:L126591-126598 (research 122 §6).
      playMetal: sounds ? () => { if (voiced()) sounds.popup(); } : undefined, playBack: sounds ? () => { if (voiced()) sounds.back(); } : undefined,
      onLaunch: (l) => { this.world.launch(); this.briefing.launch(); seedNumMultiMissions(this.opener.valves, o.missions?.() ?? []); o.onLaunch?.(l); },   // ONL-09: a launch reads global_valves.rdr anew (SERVER NEWS once a launch); ONL-15: NumMultiMissions (FUN_002c8c10)
      onEvent: o.onEvent,
      loaderScreens: o.loader === false ? null : new LoaderScreens(),
      tap: () => this.nextPad(),                                   // a test's button (`press`); the page's input is PLAT-11's above
      systemMessages: () => { this.briefing.chat.systemMessages(); },   // SA-43c: the menu state's tick step (6), MP_SYSTEM_MESSAGE
    });
    this.machine = this.opener.machine;
    this.connect = sessionLobby(this.host, { machine: () => this.machine, uiVars: this.uiVars, parts: this.parts, captions: o.disc.captions, keyboard: this.keyboard, db: () => this.persona?.db }, o.account);   // ONL-07 (research 157 §5)
    this.persona = connectPersona(this.host, { machine: () => this.machine, uiVars: this.uiVars, libmc, menu, universes: this.universes, parts: this.parts, standing: this.opener.stubs.entries(), lobby: this.connect?.lobby });   // ONL-06 (research 153 §5): after the boot's stubs
    this.world = connectWorldOfSocom(this.host, { uiVars: this.uiVars, valves: () => this.opener.valves, event: (kind) => { this.machine.shell()?.event(kind); }, announcement: o.announcement, invitations: o.clanInvitations, lobby: this.connect?.lobby,   // ONL-09 (research 158 §4); ONL-10's lobby (research 160 §4)
      roomList: o.roomList, roomListPing: {}, ownerFields: o.ownerFields, playerInfo: o.playerInfo, ticket: () => this.lobby?.ticket() ?? null, sessionLost: (t) => { this.lobby?.sessionLost(t); } });   // ONL-11 (research 161 §3); OPT-15 (research 265 §1); SVC-15a (research 268 §1.7)
    let clanInvitesLive: (() => void) | null = null;   // CLAN-INVITES (CLAN_INVITE_LIVE_ADAPTATION): connectClanInvitations' live, bound below
    this.briefing = connectBriefingRoom(this.host, { uiVars: this.uiVars, valves: () => this.opener.valves, lobby: this.connect?.lobby ?? null, rooms: () => this.world.commands.rooms(),   // ONL-12 (research 162 §4)
      inputString: (cmd) => this.machine.shell()?.inputString(cmd.anim) ?? null, event: lobbyEventInto(() => this.machine, this.parts),
      service: o.briefingRoom && withClanInvitationNotice(withSays(o.briefingRoom, (says, ticket) => { if (ticket !== this.lobby?.ticket()) return; const f = saysFor(says, this.currentGameId()); for (const id of f.withdraw) this.sayToast?.withdraw(id); for (const x of f.show) this.sayToast?.show(x); }),   // OA-3: the poll's `says` to the toast only (OA.R1)
        (ticket) => { if (ticket === this.lobby?.ticket()) clanInvitesLive?.(); }),   // CLAN-INVITES: the poll's mark asks the received list again (CLAN_INVITE_LIVE_ADAPTATION)
      ticket: () => this.lobby?.ticket() ?? null, sessionLost: (t) => { this.lobby?.sessionLost(t); }, clanId: () => this.world.commands.clan.clanId,   // CLAN-ID-WIRE: AUTOPLAY's FUN_002e9940 (DAT_0044f59c)
      missions: o.missions, found: (g) => { this.gameLobby.commands.randomGameFound(g); }, now: () => this.frameNow,   // ONL-15 (research 265 §2): the type filter, AUTOPLAY's pick; ONL-23: the chat's poll on the page's clock
      currentGame: () => this.gameLobby.commands.currentGame(),   // GetGameInfo('CurrentGame'): the lobby's play list (+0x84) and 0x414e00 (research 154 §7.1)
      gamePing: { roomDoor: (room) => this.world.roomDoor(room) },   // GAME-PING: the game list's PING from the page's round trip to the room's door (a browser adaptation)
      ...(o.roundChat ? { round: o.roundChat } : {}),   // SVC-19: a round's drain of the lobby server's lines (research 266 §3.3)
      // SA-43c (SYSTEM_MESSAGE_STATE_READING): a match handed off and its round not yet up is the load state -- a server
      // system message then is dropped (`FUN_001e7c80`); the round's sink, when up, takes it first
      loading: () => this.match.phase === 'loading' || this.match.phase === 'match' });
    new OnlineFiltersCommands({ uiVars: this.uiVars, valves: () => this.opener.valves, missions: o.missions, name: (cmd, i) => this.parts.current?.name(cmd, i) ?? null }).register(this.host);   // ONL-15: ONLINE FILTERS' GetMissionInformation
    connectIgnoreList(this.host, { uiVars: this.uiVars, service: o.ignoreList, ticket: () => this.lobby?.ticket() ?? null, sessionLost: (t) => { this.lobby?.sessionLost(t); },   // ONL-25 (research 269 §1): one ignore list for SOCOM II ONLINE, IGNORE and the chat keyboards' IGNORE key
      inputString: (cmd) => this.machine.shell()?.inputString(cmd.anim) ?? null, event: lobbyEventInto(() => this.machine, this.parts) });
    this.friends = connectFriendList(this.host, { uiVars: this.uiVars, service: o.friendList, ticket: () => this.lobby?.ticket() ?? null, sessionLost: (t) => { this.lobby?.sessionLost(t); },   // ONL-24 (research 269 §3): one friends list for SOCOM II ONLINE, FRIENDS and PLAYER INFO's FRIEND origin
      inputString: (cmd) => this.machine.shell()?.inputString(cmd.anim) ?? null, event: lobbyEventInto(() => this.machine, this.parts), lobby: this.connect?.lobby ?? null,
      line: (text, name, flag, kind) => { this.briefing.chat.screenLine(text, name, flag, kind); }, now: () => this.frameNow });   // the forward's line on ONL-23's screen line; the pushes polled on the page's clock
    connectCreateClan(this.host, { uiVars: this.uiVars, clan: this.world.commands.clan, service: o.createClan, ticket: () => this.lobby?.ticket() ?? null, sessionLost: (t) => { this.lobby?.sessionLost(t); }, event: lobbyEventInto(() => this.machine, this.parts), lobby: this.connect?.lobby ?? null });   // ONL-26 (research 271)
    const clanInvites = connectClanInvitations(this.host, { uiVars: this.uiVars, clan: this.world.commands.clan, invitations: this.world.invitations, service: o.clanMembership, ticket: () => this.lobby?.ticket() ?? null, sessionLost: (t) => { this.lobby?.sessionLost(t); }, event: lobbyEventInto(() => this.machine, this.parts), inputString: (cmd) => this.machine.shell()?.inputString(cmd.anim) ?? null, lobby: this.connect?.lobby ?? null, dialog: () => this.machine.shell()?.currentName ?? null });   // ONL-28 (research 273); CLAN-INVITES F2: the live mark's dialogs
    clanInvitesLive = clanInvites.live;   // CLAN-INVITES (CLAN_INVITE_LIVE_ADAPTATION): the chat poll's mark, above
    const clanMessages = connectClanMessages(this.host, { uiVars: this.uiVars, clan: this.world.commands.clan, service: o.clanMessages, ticket: () => this.lobby?.ticket() ?? null, sessionLost: (t) => { this.lobby?.sessionLost(t); }, event: lobbyEventInto(() => this.machine, this.parts), inputString: (cmd) => this.machine.shell()?.inputString(cmd.anim) ?? null, lobby: this.connect?.lobby ?? null });   // ONL-29 (research 274)
    const ladder = connectLadderLobby(this.host, { uiVars: this.uiVars, valves: () => this.opener.valves, service: o.ladder, ticket: () => this.lobby?.ticket() ?? null,   // ONL-30a (research 269 §2): one client ladder for SOCOM II ONLINE's top ten and PLAYER RANKING
      sessionLost: (t) => { this.lobby?.sessionLost(t); }, inputString: (cmd) => this.machine.shell()?.inputString(cmd.anim) ?? null,
      event: lobbyEventInto(() => this.machine, this.parts), lobby: this.connect?.lobby ?? null, friendState: (name) => this.friends.commands.onlineStateByName(name),   // ONL-24: PLAYER INFO's FRIEND origin
      roomState: (name) => this.briefing.commands.roomPlayerState(name), clan: this.world.commands.clan });   // SVC-15: PLAYER INFO's BRIEFING origin, the room's player list; ONL-30: CLAN RANKING's clan (LobbyClan)
    connectManageRoster(this.host, { uiVars: this.uiVars, clan: this.world.commands.clan, service: o.manageRoster, ticket: () => this.lobby?.ticket() ?? null, sessionLost: (t) => { this.lobby?.sessionLost(t); }, event: lobbyEventInto(() => this.machine, this.parts), inputString: (cmd) => this.machine.shell()?.inputString(cmd.anim) ?? null, lobby: this.connect?.lobby ?? null, clanMessages, ladderTotal: () => ladder.state().myTotal, ladderPosition: () => ladder.state().myPosition });   // ONL-27 (research 272)
    this.gameLobby = connectGameLobby(this.host, { uiVars: this.uiVars, valves: () => this.opener.valves, lobby: this.connect?.lobby ?? null,   // ONL-16a (research 165 §4)
      recoverLobby: (state) => recoverLobbyControls(this.parts.current, this.machine.shell()?.currentName, state),
      voice: { talkCue: (name, volume) => { sounds?.play(name, { volume, pan: -1, pitchMod: 0 }, 'zanim'); } },
      games: () => this.briefing.commands.gamesHeld(), roomWorldId: () => this.briefing.commands.roomWorldId(), inputString: (cmd) => this.machine.shell()?.inputString(cmd.anim) ?? null,
      event: lobbyEventInto(() => this.machine, this.parts), switchMenu: (d) => { this.machine.queue.switchMenu(d); }, service: o.gameLobby, pinned: o.matchSocket, socket: o.gameSocket,
      dialog: () => this.machine.shell()?.currentName ?? null,                                                     // R4B-08: r0004's Team Switch Error (research 379 §3)
      matchStart: (h) => { this.matchGame = h.mediusWorldId; o.matchStart?.(h); this.lobbyPrepare.handedOff(); this.match.start(h); }, randomGame: () => { if (!this.invite.searchArmed()) this.briefing.autoplay.start(); },   // INVITE_JOIN_ADAPTATION
      joinRefused: (s, w) => this.invite.refused(s, w),                                                                 // INVITE_REFUSAL_ADAPTATION
      chat: this.briefing.chat, clanId: () => this.world.commands.clan.clanId,   // ONL-18: the hand-off, never an open client unheard; ONL-15: AUTOPLAY; ONL-23: SendChatText's whisper (research 266 §1); CLAN-ID-WIRE: ClanGameClosed's FUN_002e9940 (research 272 §3)
      system: (text, severity) => { this.briefing.chat.systemMessage(text, severity); },   // SA-43c Part 2: the game socket's system message, routed as the lobby's (FUN_0030dce0)
      serverUpdate: pageServerUpdate,   // OBF-4 (OBF.R4; an adaptation): the host's update -- the post-match warning and window.location.reload()
      ...(o.allBotGames ? { allBotGames: o.allBotGames } : {}),   // P537-L2: GAME LOBBY's BOTS on the server's word alone
      // LOBBY-MAPNAME (research 165 §9): the mission's UiVars from the shared ARMORY's read of the same mission (one decode,
      // kept: `armoryRead`), so AdvanceMPMission's load gives the title bar's MPgamename the map's mission_title
      ...(o.armory ? { missionVars: (mission: string) => o.armory!.load(mission).then((d) => d?.missionUiVars ?? null) } : {}) });
    this.host.setBindingGate('lobby-bots', lobbyBotsGate({
      commands: this.gameLobby.commands, node: (cmd) => this.parts.current?.nodeCommand(cmd),
      focus: (name) => {
        const parts = this.parts.current, spec = parts?.widgets.specOf(name);
        if (!parts || !spec || !parts.widgets.enabled(spec)) return false;
        this.input.activate(name);
        return true;
      },
    }));
    this.invite = connectInvite(this.host, { mount: o.invite ?? null, briefing: this.briefing, world: this.world, gameLobby: this.gameLobby, match: () => this.match,
      lobby: () => this.lobby, machine: () => this.machine, parts: this.parts, universes: this.universes, uiVars: this.uiVars, valves: () => this.opener.valves,
      event: lobbyEventInto(() => this.machine, this.parts) });   // INVITE_FLOW / INVITE_JOIN / INVITE_HANDOFF answers
    // The shared ARMORY (`./lobbyArmory`): the test room's screen on the lobby's `dlg_equipment_mp.rdr`, its stores the
    // lobby's profile rows, its way back the lobby's SWITCHMENU, its sounds the menus' cues by name (a script's SOUND
    // at its own volume, pan and pitch, as the dialog's played them; the code's cues unplaced at 1.0).
    const cue = { volume: 1, pan: -1, pitchMod: 0 };
    const armory = o.armory;
    this.lobbyArmory = armory ? new LobbyArmory({
      load: (m) => armory.load(m), model: (n) => o.disc.art?.model(n) ?? null, modelTextures: (n) => o.disc.art?.textures(n) ?? null,
      valves: () => this.opener.valves, uiVar: (n) => { const v = this.uiVars.find(n)?.value; return v?.type === 'string' ? v.value : null; },
      profile: this.gameLobby.profile, mission: () => this.gameLobby.commands.missionName(),
      loadout: (side, choice) => { this.gameLobby.socket?.loadout(side, choice); },   // ARMORY-SAVE: the lobby ARMORY's choice to the room
      sound: (n, own) => { if (!sounds) return; if (n === '.METAL') sounds.popup(); else if (n === '.TYPE') sounds.teletype(); else sounds.play(n, own ?? cue, 'zanim'); },
      back: () => { this.machine.queue.switchMenu(LOBBY_DIALOG); },
    }) : null;
    const lm = o.lobbyMatch;
    this.lobbyPrepare = new LobbyPrepareTrigger(() => lm);
    // LATER 62 (`./net/closeReport` `CLOSE_REPORT_ADAPTATION`): a development build's only, behind the literal gate a
    // production build folds away with the module (the nightly carries it, its servers off); the reporter wants ?devmode.
    const closeReport = import.meta.env.DEV ? pageCloseReport() : null;
    this.match = new LobbyMatch({   // ONL-18 (research 166 §5)
      ...(closeReport ? { closeReport } : {}),
      screen: { show: (m) => { lm?.leave?.(); lm?.screen?.show(m); }, hide: () => { lm?.screen?.hide(); } },
      load: lm?.load ?? (() => Promise.resolve()),
      ...(lm?.prepare ? { prepare: lm.prepare } : {}),   // IP3 (`LOAD_REPORT_AT_PREPARED_READING`): absent, the load alone
      ...(lm?.unprepare ? { unprepare: lm.unprepare } : {}),   // IP3 (the review's F1, F4): the prepared match dropped
      start: lm?.start ?? ((m) => ({ release: () => m.client, close: () => { m.client.close(); } })),   // no page: the client kept, nothing drawn
      holds: (h) => { this.lobby?.socketHolds(h); }, now: () => this.frameNow,   // the page's animation-frame time (`advance`)
      netErrno: (n) => { writeNetErrno(this.opener.valves, n); },   // NET-ERRNO (research 315 §6 E2): mp_net_errno before the return to dlgNetError.rdr
      serverUpdate: pageServerUpdate,                                 // OBF-4 (OBF.R4; an adaptation): the post-match warning and window.location.reload()
      back: (r) => {
        // The load state's way out (`FUN_001f5e70` D:L55710-55745): the dialog written into the menu state's start
        // dialog (0x408568, research 115 §7), then a switch to the menu state, whose Init builds that dialog
        // (`FUN_001f4860`). The page's launch never left the menu state (the match runs over it), so the switch leaves
        // and enters it again -- the original's exit from the load state into a fresh menu state (the sprint 17 close
        // review's finding: writing the start dialog alone left the stale lobby on screen). A `stopped` return names no
        // dialog: the menu state as it stands, for the lobby's own events to draw on. At the match's end the lobby's
        // launch is undone (`GameLobbyCommands.matchReturned`) and its socket takes the client back.
        if (r.dialog !== null) {
          this.machine.menu.startDialog = r.dialog;
          this.machine.states.switchTo(this.machine.menu);
        } else if (this.machine.states.top() !== this.machine.menu) this.machine.states.switchTo(this.machine.menu);
        if (r.why === 'match-over') this.gameLobby.commands.matchReturned();
        if (r.client) this.gameLobby.socket?.adopt(r.client);
        lm?.returned?.(r);
        this.returning = { r, frames: 0, settle: () => { lm?.settled?.(r); } };
      },
    });
    mountCreateGame(this.host, { uiVars: this.uiVars, valves: () => this.opener.valves, event: (k) => { this.machine.shell()?.event(k); }, missions: o.missions, offered: o.createGameOffer, ...(o.allBotGames ? { allMaps: o.allBotGames } : {}),   // ONL-13 (research 163): its success, the lobby's entry; NB-7: the server's offer
      ...(o.respawnRules !== undefined ? { respawnRules: o.respawnRules } : {}),
      roomWorldId: () => this.briefing.commands.roomWorldId(), lobbyUp: () => this.lobby?.up ?? false, lobbyState: () => this.lobby?.state() ?? 0,
      service: o.createGame ? sessionCreateGame(o.createGame, () => this.lobby?.ticket() ?? null, (t) => { this.lobby?.sessionLost(t); }) : undefined,
      created: (g) => this.gameLobby.commands.created(g), clanId: () => this.world.commands.clan.clanId });   // CLAN-ID-WIRE: GF3's clan id (clanField, research 272 §3)
    // `--menu_state`: the start dialog named by the address, past the loader (the boot option names the game's own start).
    // The card's `CUIVarManager` module (web research 301 §6): read with the save file above (`connectPersona`, the
    // console's boot `LoadConfig`), restored at longevity 3 before any dialog's ONSTART -- `dlgNetLogin`'s taunt and SOP
    // defaults (`add` at 3) then leave a saved value as it is.
    restoreCardUiVars(this.persona.card, this.uiVars);
    // OPTIONS (research 302 §4): InitOptions, StoreOptions and CopyUIVar, and the parked rows' gates; the option valves'
    // defaults are the opener's registry's (`global_valves.rdr` whole, `bootValves` above), then the card's
    // `CValveSaveManager` module over them (the boot's `LoadConfig`) and `load_initial_config`'s `StoreOptions` -- the
    // globals the match applies.
    // OPT-14 (research 344 §3, §6): CONTROLLER PRESETS' `SetControllerConfig` makes the page's controller config active
    // (`FUN_002c5d60`), and each `StoreOptions` -- the boot's below among them -- runs its two steps on it (`FUN_0027b960`).
    const optionsCommands = new OptionsCommands({
      valves: () => this.opener.valves, uiVars: this.uiVars, globals: this.options, dialog: () => this.machine.shell()?.currentName ?? null,
      name: (cmd, i) => this.parts.current?.name(cmd, i) ?? null,
      controllerConfig: (name) => { o.controllerConfigs?.select(name); }, inputString: (cmd) => this.machine.shell()?.inputString(cmd.anim) ?? null,
      screenOrigin: (x, y) => { o.screenOrigin?.(x, y); },
      ...(o.picture ? { picture: o.picture } : {}),                       // OT.R79: VIDEO MODE's strip
    });
    optionsCommands.register(this.host);
    const configs = o.controllerConfigs;
    if (configs) this.options.observe(() => { configs.store((name) => this.options.value(name)); });
    const menuPage = o.startMenuPage;                                          // R4B-02: r0004's store reads VoiceMask back
    if (menuPage) this.options.observe(() => { storeVoiceModulation(menuPage, (name) => this.options.value(name)); });
    if (!restoreValveModule(this.opener.valves, this.persona.card?.part(VALVE_MODULE))) console.warn(`[card] the save file's ${VALVE_MODULE} module could not be read: the options keep their defaults`);
    optionsCommands.store();                                                   // UIStoreOptions: the globals, then the stick apply (CTL-1's F2)
    this.nativeOptions = connectNativeOptions(pageCard, {
      valves: this.opener.valves, uiVars: this.uiVars, globals: this.options, configs: o.controllerConfigs, libmc, config: this.persona.config,
      ...(o.screenOrigin ? { screenOrigin: o.screenOrigin } : {}), ...(o.picture ? { picture: o.picture } : {}),   // #481: SCREEN POSITION, VIDEO MODE over the match
    });
    o.initializeVars?.(this.uiVars);
    if (o.startDialog) { this.opener.skipLoader(); this.machine.boot(o.startDialog); this.persona.entered(o.startDialog); }
  }

  /** The frame's pad: a `press` is FALLING on one frame and RISING on the next (research 116 §1); else `pad` as set. */
  private nextPad(): WidgetPad | null {
    if (this.pressed) {
      const name = this.pressed;
      this.pressed = null;
      this.pad = widgetPad({ [name]: 'RISING' });
      return widgetPad({ [name]: 'FALLING' });
    }
    const p = this.pad;
    this.pad = null;
    return p;
  }

  /** A tap of one button on the next frame (a test hook, a browser adaptation; the page's input is PLAT-11's `input`). */
  press(name: PadButtonName): void { this.pressed = name; }

  /**
   * The menus held while a match is up, or let go at its return (the page's `matchMenuHold`): the original's menus are
   * not running in a match, so neither they nor the shared ARMORY read the pad while it is. A flag the menus' frame reads
   * (OBF-2): never a swap of `input.source`, which a hand-off made inside the menus' own frame would take for the page's.
   */
  holdMenus(held: boolean): void { this.menusHeld = held; }
  /** The menus held by a match (HD-3 review F1: the page leaves their frame undrawn at an HD scale meanwhile). */
  get menusHidden(): boolean { return this.menusHeld; }

  /** The session ended with its page (`mountFrontEnd`'s `stop`): the lobby logged out, not awaited, and disconnected (`@s2u/ui`'s `LOBBY_CLOSE_AT_STOP_ADAPTATION`). */
  close(): void { this.nativeOptions.dispose?.(); this.sessionGone(); this.invite.close(); this.connect?.lobby.close(); this.sayToast?.dispose(); }

  /** OA-3: the page's game for a say's scope -- the game lobby's (`GameSocketHost.open`'s world), else the match's while one is up, else null. */
  private currentGameId(): number | null {
    const lobby = this.gameLobby.commands.game();
    if (lobby) return lobby.mediusWorldId;
    return this.match.phase !== 'idle' ? this.matchGame : null;
  }

  /**
   * The session over (the page's stop, the lobby's disconnect or its lost session): the game socket -- or, after the
   * hand-off, the match's client -- closed and its hold let go (the game lobby review's finding 2; research 157 §6).
   */
  private sessionGone(): void { this.match.stop(); this.gameLobby.socket?.close(); }

  /** MATCH-SOUND: a return settled once the menu state is up on its dialog and has run `RETURN_SETTLE_FRAMES_ADAPTATION` frames. */
  private settleReturn(): void {
    const ret = this.returning;
    if (!ret || this.machine.states.top() !== this.machine.menu) return;
    if (ret.r.dialog !== null && this.machine.shell()?.currentName !== ret.r.dialog) return;
    if (++ret.frames < RETURN_SETTLE_FRAMES_ADAPTATION) return;
    this.returning = null;
    ret.settle();
  }

  /** The ticks due at `now` (ms; the page's animation-frame time), each one frame of the front end. Answers how many ran. */
  advance(now: number): number {
    this.frameNow = now;
    return this.clock.advance(now, (_tick, dt) => { this.connect?.frame(); this.world.frame(); if (this.connect && this.connect.lobby.ticket() === null) this.sessionGone(); this.gameLobby.frame(); syncLobbyBots(this.gameLobby.commands, this.parts.current); this.invite.frame(); this.briefing.frame(); this.friends.frame(); this.match.frame(); this.lobbyPrepareFrame(); this.menuFrame(dt); this.settleReturn(); });   // ONL-16a: the game socket's closes   // ONL-07: the lobby's step, once a frame (FUN_002dfe50)
  }

  /**
   * IP3 lobby prepare (`./lobbyPrepare` `LOBBY_PREPARE_ADAPTATION`): after the lobby's and the match's own steps in the
   * frame -- so a hand-off this frame already shows the match up -- the game lobby's mission to the trigger; a match up,
   * or its return not settled yet (`returning`: the returning dialog's ONSTART may leave the game), holds it.
   */
  private lobbyPrepareFrame(): void {
    // IP3 (5d's ruling (a)): and the seat's side, the game lobby's own client's team (the client the hand-off hands on).
    this.lobbyPrepare.frame(this.gameLobby.commands.missionName(), this.match.phase === 'loading' || this.match.phase === 'match' || this.returning !== null, this.gameLobby.socket?.link()?.team ?? '');
  }

  /**
   * The machine's frame, and the shared ARMORY's over it (`./lobbyArmory`): every pad read is handed to the shared
   * screen (its presses), the machine reading none while the screen is up; then the screen steps beside the dialog it
   * hosts and, up, its draw list is the frame's.
   */
  private menuFrame(dt: number): void {
    const host = this.lobbyArmory;
    // OT.R121 (`./lobbyLinkDirect`): behind a lobby link's cover the menus read no pad, as while a match holds them.
    const muted = (): boolean => this.menusHeld || this.invite.covering();
    if (!host && !muted()) { this.last = this.opener.frame(dt); return; }
    // OBF-2 (OBF.R2): one listener per read. The frame's source stands in for the page's for this frame only; one kept
    // past it and handed back (once: the match's hold, taken inside this frame by a late joiner's ReadyToLoad) is the
    // page's source again, never a second wrapper around it -- which handed the screen every read twice, the pad's then
    // NO_PAD, so a held press stepped it once per read.
    const real = FRAME_SOURCES.get(this.input.source) ?? this.input.source;
    const off = (): boolean => muted() || (host?.hosting() ?? false);
    const frame: MenuInputSource = {
      read: () => { const snap = muted() ? NO_PAD : real.read(); host?.pad(snap); return off() ? NO_PAD : snap; },
      ...(real.usbKey ? { usbKey: () => (off() ? null : real.usbKey!()) } : {}),
    };
    FRAME_SOURCES.set(frame, real);
    this.input.source = frame;
    try { this.last = this.opener.frame(dt); } finally { if (this.input.source === frame) this.input.source = real; }
    if (!host) return;
    const sh = this.machine.shell();
    host.frame(dt, sh?.currentName ?? null, sh ? sh.popups.shown(sh.screen) : false);
    if (host.hosting()) this.last = host.drawList();
  }

  /**
   * The last frame onto a canvas target (PLAT-14's drawer); what it could not draw comes back. `hd` (HD-3, a browser
   * adaptation under HD (GoE SouL), `./hdMenuTextures`): the frame's scale and the HD pack's lookup; absent, the original.
   */
  render(target: UiCanvasTarget | UiPresenter, uiSampling?: UiSamplingSettings, hd?: Pick<RasterOptions, 'scale' | 'hd' | 'quadCache'>): { undrawn: string[] } {
    const textures = this.lobbyArmory?.hosting() ? this.lobbyArmory.textures : this.textures;
    // GM-09 (a browser adaptation that changes nothing drawn): the frame goes through a presenter -- the one handed in,
    // or today's software path (`CpuUiPresenter`) onto a 2D canvas target, one per target, kept while the target is.
    const presenter = isUiPresenter(target) ? target
      : this.presenter instanceof CpuUiPresenter && this.presenter.target === target ? this.presenter : new CpuUiPresenter(target);
    this.presenter = presenter;
    return { undrawn: presenter.present(this.last, textures, { movie: this.moviePicture, uiSampling, ...hd }, this.perf).undrawn };
  }

  /** GM-09: the presenter the last frame went through (null before the first render). */
  presenter: UiPresenter | null = null;
  /** GM-09: the frame the page last showed (straight RGBA, top row first, at its scale), or null before the first. */
  readFrame(): Rgba | null { return this.presenter?.readFrame() ?? null; }
  /** GM-09: what the last frame shown left undrawn (empty before the first). */
  undrawn(): readonly string[] { return this.presenter?.undrawn() ?? []; }
}

/**
 * HD-3 review F1 (a browser adaptation): whether the page draws the menus' frame this tick. At an HD scale a frame is
 * 2560 x 1792 in software, so it is not drawn while a match holds the menus (the match's canvas is over it); the next
 * tick after the return draws it. At scale 1 the page draws every tick, held or not -- except while a match is up,
 * where `./frontEndSleep` `menuRasterWanted` rests it under every preset (H397 / C14; PR #631 began it under the Xbox
 * preset alone). `gpu` (GM-12b, GM.R17): the
 * frame goes through the front end's GPU surface (`./uiGpuFront`), which draws no hidden frame at any scale.
 */
export function drawsMenuFrame(session: { menusHidden: boolean }, scale: number, gpu = false): boolean {
  // GM.R17 (GM-12b): on the GPU path a hidden frame is not drawn at any scale; the software path draws it as it always has.
  if (gpu) return !session.menusHidden;
  return scale <= 1 || !session.menusHidden;
}

/**
 * The menus held while the match is up (the original's menus are not running in a match): `leave` at the match's
 * loading screen, `returned` at its return to the menus -- the session's `holdMenus`, whichever frame calls them.
 *
 * OBF-2 (OBF.R2; the plan `docs/plans/2026-10-30-overnight-bugfix.md`): this was a swap of the session's
 * `input.source` -- the old one kept, a NO_PAD one set, the kept one set back at the return. A late joiner's hand-off
 * runs inside the menus' frame (`ReadyToLoad`, `FUN_0027caf0` D:L125606-125608, a dialog command of the machine's tick),
 * where the source is the frame's own stand-in (`FrontEndSession.menuFrame`): the swap kept that stand-in, the frame's
 * end set the page's back under the match (the menus read the pad through it), and the return set the stand-in back for
 * good -- each frame after wrapped it again, so the shared ARMORY was handed every read twice, a press stepping it once
 * per read (Craig: "down moves 4 times", Triangle back through several menus), one more wrapper with each late join.
 */
export function matchMenuHold(session: () => { holdMenus(held: boolean): void } | null): { leave(): void; returned(): void } {
  return {
    leave: () => { session()?.holdMenus(true); },
    returned: () => { session()?.holdMenus(false); },
  };
}

/** The page's hook on the window on the front end's page (a browser adaptation, for a browser run and the console). */
export interface FrontEndWindowHook {
  session: FrontEndSession<MovieFrame>;
  /** The movies' source, meters and sound (null: no worker, the black source). */
  movies: FrontEndMovies | null;
  /** A tap of a PS2 button on the next frame (`START`, `CROSS` ...). */
  press(name: PadButtonName): void;
  /** The opener's events so far. */
  events: OpenerEvent[];
  /** The menus' music (MENU-MUSIC): its streams' state and the browser spec's `skip` (null: no output of the page's own). */
  music: MenuMusic | null;
}
export const FRONT_END_WINDOW_HOOK = '__frontEnd';

/** The mounted entry: its canvas, a line on what it is doing, and its stop. */
export interface FrontEndMount {
  canvas: HTMLCanvasElement;
  status: string;
  session: Promise<FrontEndSession<MovieFrame> | null>;
  /** The movies' source, meters and sound, once the session is made with them (null: none). */
  movies?: FrontEndMovies | null;
  /** The menus' music (MENU-MUSIC), when the page made its own audio (null: none). */
  music?: MenuMusic | null;
  stop(): void;
}

/** What the page's hook can be handed instead of its own (the tests'). */
export interface FrontEndMountOptions {
  /** The files' source; absent, the request's own: the served tree's `HttpAssetSource`, or `IsoAssetSource` over the visitor's image. */
  assets?: AssetSource;
  /** The front end's own audio; absent, a `GameAudio` over Web Audio, made when a source is there. */
  audio?: FrontEndAudio;
  /**
   * PLAT-19b's worker, made at the first movie's open; absent, the page's (`startMovieWorker`) where the page has
   * workers; null, none: the movies play from `@s2u/fmv`'s black source.
   */
  movies?: (() => MovieWorkerHandle) | null;
  /** PLAT-20's output for the movies' sound; absent, `webAudioMovieOut` over the front end's own audio's context (when it made the audio). */
  movieSound?: () => MovieSoundOut | null;
  /** GM-12b: the GPU switch the front end reads; absent, the page's (`pageUiGpuSwitch`). A test's own. */
  uiGpu?: UiGpuSwitch;
}

/**
 * MATCH-SOUND (web research 222 §7): the front end's half of the match's sound. The match plays on a `GameAudio` of its
 * own over the menus' `AudioContext` (`new WebAudioOut(out)`: one context, unlocked by the menus' activation -- the disc
 * page's click, the owner's "no prompt" -- with no second gesture), never on the menus' `GameAudio`, so the map's data
 * does not replace HUDUI nor stop the menus' music slot; its `release` lets the map's banks and the output go. The
 * menus' music is held while the match's loading screen and the match are up and let go at the return
 * (`MenuMusic.hold`, `MATCH_RETURN_MUSIC_PLACEHOLDER`). No output of the page's own (a `FrontEndAudio` given, the tests'):
 * no match audio, a silent match.
 */
/**
 * The frames the returning dialog runs before a match's return is settled (`lobbyMatch.settled`): its first (the
 * dialog's ONSTART bindings) and one after, so a music its start plays is heard as started. A browser adaptation: the
 * page's own wait, no original (the original's menu state simply runs; the held music is the page's, MATCH-SOUND).
 */
export const RETURN_SETTLE_FRAMES_ADAPTATION = 2;

export function frontEndMatchSound(o: {
  out: WebAudioOut | null;
  vars: () => TunerVars | null | undefined;
  music: { hold(on: boolean): void; settleHeld(replay: boolean): void } | null;
}): {
  audio(): MatchAudio | undefined;
  /** The mount with the match's audio; a mount that throws releases it (the error passed on). */
  start<T>(mount: (audio: MatchAudio | undefined) => T): T;
  leave(): void;
  returned(): void;
  settled(r: LobbyMatchReturn): void;
} {
  const audio = (): MatchAudio | undefined => {
    if (!o.out) return undefined;
    const out = new WebAudioOut(o.out, { releaseLoopSamples: xboxMemoryMeasures() });   // VS-10 F1: the Xbox class's loop release too
    out.prepare();                                 // on the menus' context, made already: nothing for a gesture to wait on
    const game = new GameAudio(out, undefined, { inline: false });
    game.setTunerVars(o.vars);                     // PF-32: the options' four masters, as the menus' are read
    return { game, release: () => { game.setData(null); out.dispose(); } };
  };
  return {
    audio,
    start: (mount) => {
      const a = audio();
      try { return mount(a); } catch (e) { a?.release(); throw e; }
    },
    leave: () => { o.music?.hold(true); },
    // The menus' plays taken again at once (the returning dialog's own); the held music decided when the return settles:
    // played again only on the lobby's return (`MATCH_END_RETURN_READING`, the match's end) and only if the dialog
    // started none (`MenuMusic.settleHeld`).
    returned: () => { o.music?.hold(false); },
    settled: (r) => { o.music?.settleHeld(r.why === 'match-over'); },
  };
}

/**
 * The front end's canvases' placement (`#front-end` and GM-12b's `#front-end-gpu`: the same CSS box). Placement only
 * (the design system owns colour and type, `test/chrome_classes.test.ts`): over the whole window, the 640 x 448 frame
 * scaled to fit; the frame itself is opaque.
 */
export function placeFrontEndCanvas(el: HTMLCanvasElement): void {
  el.style.position = 'fixed';
  el.style.inset = '0';
  el.style.left = 'var(--tw-l, 0px)';
  el.style.top = 'var(--tw-t, 0px)';
  el.style.width = 'calc(100vw - var(--tw-l, 0px) - var(--tw-r, 0px))';
  el.style.height = 'var(--mobile-picture-height, calc(100dvh - var(--tw-t, 0px) - var(--tw-b, 0px)))';
  el.style.objectFit = 'contain';
  el.style.zIndex = '1000';
}

/**
 * The page's hook (`./pageEntry`'s one line, OT.R12; it was `main.ts`'s until 2026-10-03; since OT.R19 it mounts with
 * or without `FRONT_END_PARAM`, the page's entry deciding): a 640 x 448 canvas over the page, the front end read from `source` -- the
 * visitor's disc image (`{ kind: 'iso', file }`, OT.R14: `@s2u/archive`'s `IsoAssetSource` over the file, the reader
 * the viewer's worker uses) or the served tree (`?devmode`'s) -- and run once per animation frame until `stop`. The
 * menus' sounds are PLAT-23's host made from the same source (`pageUiSounds`) over an audio of the front end's own,
 * unlocked by the first gesture on the page; without the sound files it runs silent. The document is not read beyond
 * `body` (the canvas's parent) and its window: on the front end's page the entry has emptied the body before this runs
 * (its disc page gone once the image opened), and the keys and pointer stop at the canvas (`./menuInput`).
 */
export function mountFrontEnd(search: string, source: SourceRequest | null, doc: Document = document, opts: FrontEndMountOptions = {}): FrontEndMount | null {
  const entry = frontEndEntry(search);
  const canvas = doc.createElement('canvas');
  canvas.id = 'front-end';
  canvas.width = 640;
  canvas.height = 448;
  placeFrontEndCanvas(canvas);
  doc.body.append(canvas);
  frameCanvas(canvas);   // OPT-11 (research 358): the original's BRIGHTNESS pass scales this frame
  const win = doc.defaultView;
  const menuSampling = parseMenuSampling(search);
  const clearMenuSampling = mountMenuSampling(canvas, menuSampling);
  // LATER 350: the menus read the pad's stick through its dead zone, CONTROLLER OPTIONS' DEAD ZONE once a session holds it.
  const menuInput = win ? attachMenuInput(canvas, win, () => playOptionsOf(session_?.options, session_?.uiVars ?? null).stick.deadZone) : null;      // PLAT-11: from now on no key or pointer reaches the viewer
  let running = true;
  let frameId = 0;
  let audio: FrontEndAudio | null = null;
  let keys: { detach(): void } | null = null;
  let session_: FrontEndSession<MovieFrame> | null = null;
  let hdMenus: HdMenus | null = null;                              // HD-3: the menus' HD pack, once HD (GoE SouL) is chosen
  // The flip's review F2: the front's GPU surface down for the session (L4: no WebGL2, a software adapter, ...; L3: the loss
  // limit) -- the menus' HD images could never show, so the pack is let go and not asked again this session.
  let frontGpuDown = false;
  /** SVC-19: the mounted match's drain of the lobby server's lines (research 266 §3.3), from its mount to its return. */
  let roundLine: ((line: RoundQueueLine) => void) | null = null;
  let lobbyAsk = 0;                                                  // IP3 lobby prepare: the latest ask (`lobbyPrepare`, `lobbyRelease`)
  let matchLoading: MatchLoaderSlot<MatchLoader> | null = null;    // ONL-18c: the match's loader, once a match loads; PR #631: let go at the return
  let matchUp = false;                                             // PR #631 (`./frontEndSleep`, a browser adaptation): a lobby-mounted match up, `leave` to `returned`
  let matchGraphics = 'auto';                                      // PR #631: the graphics preset read at `leave` (not a read a tick)
  // GM-12a (a browser adaptation; the GPU menus plan, "Canvases and contexts"): the front end's GPU surface
  // (`./uiGpuPresenter` `UiGpuSurfacePresenter`, reached by `import()` only) -- its context let go at the match's `leave`
  // and asked back lazily after `returned`, let go for good at `stop` and at the session's close. Null while the switch
  // keeps `front` off; GM-12b makes it beside `#front-end-gpu` (`./uiGpuFront` `FrontEndGpu`, `gpuFront` below).
  let uiGpuFront: { release(): void; returned(): void; dispose(): void } | null = null;
  let gpuFront: FrontEndGpu | null = null;                         // GM-12b: `#front-end-gpu`, its swap and its surface
  let texturePrefetchStop: (() => void) | null = null;            // GM-29: the banks' prefetch (`startPageUiTexturePrefetch`)
  // GM-12a review F5: the session's close lets the GPU surface go as the page's stop does (both come through here).
  const closeSession = (): void => { session_?.close(); uiGpuFront?.dispose(); uiGpuFront = null; };
  // GM-02 (`./uiGpuPerf`, an instrument, a browser adaptation): a development build under `?devmode` only -- `?uiPerf` the
  // frame ring, `?uiPerfHd` the menus' HD path on for the measurement too (below); every player's page has neither.
  const uiPerf = uiPerfRequest(search, devBuild() && devToolsEnabled(search));
  let perf: UiPerfProbe | null = null;
  // Review F2: the instrument's module, loaded with `import()` beside the disc's read only when the ring is asked for.
  const perfLoad = uiPerf.ring
    ? import('./uiGpuPerf').catch((e: unknown) => { console.warn('[uiPerf] instrument:', e); return null; })
    : null;
  const ctx = canvas.getContext?.('2d') ?? null;
  const say = (text: string): void => {
    mount.status = text;
    const k = canvas.width / 640;                                // HD-3: the canvas may be drawn at a scale
    if (ctx) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = '#ccc'; ctx.font = `${14 * k}px sans-serif`; ctx.fillText(text, 16 * k, 32 * k); }
  };
  const onVisibility = (): void => { session.then((s) => s?.clock.setHidden(doc.hidden, win?.performance.now() ?? NaN)); };
  /**
   * NU-16b (`PAGEHIDE_LOGOUT_ADAPTATION`, `./connectHost`; research 157 §7 item 3, 159 §1): the page going away -- a
   * reload, a close, a navigation; not the back/forward cache (`persisted`), from which it may come back with its
   * session -- stops the front end, whose session's close sends the lobby's logout `keepalive`, so the services end the
   * session now and the reloaded page's login is never -997 for their `SESSION_SILENT_MS_READING`. A browser
   * adaptation.
   */
  let lobbyCover: { hide(): void } | null = null;               // OT.R121: a lobby link's cover while its login path runs behind it
  let screenOriginStop: (() => void) | null = null;            // SCREEN POSITION's resize listener, set once the keeper is made
  const pictureOff: (() => void)[] = [];                        // HD-4: the page's picture keeper outlives a mount; its observers do not
  const onPageHide = (e: PageTransitionEvent): void => { if (!e.persisted) mount.stop(); };
  const mount: FrontEndMount = {
    canvas, status: '', session: Promise.resolve(null),
    stop: () => {
      running = false;
      texturePrefetchStop?.(); texturePrefetchStop = null;           // GM-29: the banks' prefetch ended, its worker closed
      if (frameId) win?.cancelAnimationFrame(frameId);
      doc.removeEventListener('visibilitychange', onVisibility);
      win?.removeEventListener('pagehide', onPageHide);
      menuInput?.detach();
      keys?.detach();
      audio?.setData(null);                                          // its music slot stopped, its bank let go
      mount.movies?.stop();                                          // the movie's stream closed, its sound stopped, the worker ended
      mount.music?.stop();                                           // the music's streams stopped (MENU-MUSIC)
      screenOriginStop?.();                                          // SCREEN POSITION's resize listener off
      for (const off of pictureOff.splice(0)) off();                 // HD-4: this mount's picture observers off
      lobbyCover?.hide(); lobbyCover = null;                         // OT.R121: the cover off with its page
      closeSession();                                                // the lobby's keep-alive stopped, its session logged out (review (5)); GM-12a: the GPU surface let go
      matchLoading?.release();                                       // ONL-18c: the match's worker ended
      gpuFront?.remove();                                            // GM-12b: #front-end-gpu off the page
      canvas.remove();
      clearMenuSampling();
      void hdMenus?.set(false);                                      // HD-3: the menus' pack let go
      if (perf) {                                                    // GM-02: the instrument off with its page (review F4: all three)
        setComposeScreenProbe(null);
        if (session_) session_.perf = null;
        if (win) delete (win as unknown as Record<string, unknown>)[UI_PERF_WINDOW_HOOK];
        perf = null;
      }
    },
  };
  if (!source) {
    say('the front end reads your SOCOM II disc image (.iso): open it on the page (or the served tree with ?devmode)');
    return mount;
  }
  say('reading the front end ...');
  // ONL-18c: the match's loader (`./matchMount`), imported at the first match's load and never before (OT.R12).
  const from = source;
  // IP3 (the review's F3) gave the loader `hdPack` for the HD picture; B206 ML-6 removed the picture, so none is given.
  // IP3 (the prepare is the mount's own stage 1): what the mount reads before `join()` and the hand-off used to bring --
  // the page's picture (VIDEO MODE, followed by the mount), the window, the match's own audio on the menus' context
  // (`frontEndMatchSound`; nothing plays before the attach hands it the map's sound), and the seat's side: the game
  // lobby's own client's team (`GameSocketHost.link`), the client the hand-off hands on.
  const matchLoader = (): Promise<MatchLoader> => (matchLoading ??= matchLoaderSlot(() => import('./matchMount').then((m) => m.matchLoader(from, undefined, {
    picture, ...(win ? { win: win as unknown as MatchWindow } : {}),
    audio: () => matchSound.audio(), side: () => session_?.gameLobby.socket?.link()?.team ?? null,
  })))).get();
  const assets = opts.assets ?? assetSourceFor(source);   // FE-ISO: the image, a picked folder (DA-3) or the served tree
  const invite = win ? pageInvite(search, win, { dev: devBuild() }) : null;                                // INVITE_LINK_ADAPTATION
  const handedOff = (h: InviteHanded): null => { running = false; if (frameId) win?.cancelAnimationFrame(frameId); closeSession(); mount.movies?.stop(); mount.music?.stop(); say(endHandOff(invite, h)); return null; };   // the address kept unless taken (review 7)
  // The mission's ARMORY data (`./armoryData`, with its world), read in the lobby (`./lobbyArmory`) and kept for its
  // mission: the match's round screens take their two bitmaps from the same decode (PAR-3, research 255 s3).
  const armoryRead = keepMissionRead((mission: string): Promise<ArmoryData | null> => {
    const path = missionMapPath(mission);
    return path ? armoryFromDisc(assets, path, mission.toUpperCase(), { models: false, world: true }) : Promise.resolve(null);
  });
  const out = opts.audio ? null : new WebAudioOut(null, { releaseLoopSamples: xboxMemoryMeasures });   // VS-10 F1: the Xbox class's loop release too; read at the first loop let go, never at start (VS-12)
  // OT.R79: VIDEO MODE's MODERN / PS2 / EXPERIMENTAL, this browser's; HD-4: the page's one keeper, Home's Display "Video" row's too
  const picture = pagePicture();
  const screenOrigin = screenOriginKeeper(doc, win ?? null);   // SCREEN POSITION (SCREEN_ORIGIN_ADAPTATION): the card's origin on the canvases
  screenOriginStop = () => screenOrigin.stop();
  pictureOff.push(picture.observe(() => { screenOrigin.layLater(); }));         // OT.R79: the match's box changes with the picture; the origin re-laid on it
  // GM-12b (a browser adaptation; `./uiGpuFront`): `#front-end-gpu` beside this canvas, made when the GPU switch asks
  // `front` of the GPU (since the flip, GM.R18, every page but `?uiGpu=off` and the storage kill). The same box, BRIGHTNESS
  // (`frameCanvas`, in `FrontEndGpu`), SCREEN POSITION and the page's keys and taps; its surface imported after the
  // first software frame (GM.R15), its software fallback the 2D canvas beneath, sized to each frame it draws.
  // The switch itself is read on every page, players' included (GM-12b review F2): built once from the address and the
  // stored setting, resolved for `front`, and published as the non-enumerable `window.__uiGpu` read-out -- nothing of
  // the game; with `front` off it makes no canvas, no context and imports nothing.
  const uiGpu = opts.uiGpu ?? pageUiGpuSwitch();
  if (ctx && win) {
    // N1 (the Fable seat's delta review of 788d20722): the probe's throwaway WebGL context made before the front's surface,
    // never beside it (GM-XBOX1; a browser adaptation). Memoised a page load: the class's later reads (the loading panel's,
    // Settings', the return's) stay live -- the Xbox pick may change -- and make no context.
    pageRendererProbe();
    gpuFront = FrontEndGpu.mount({
      doc, twin: canvas, sw: uiGpu, place: placeFrontEndCanvas, laid: () => screenOrigin.lay(),
      down: () => { frontGpuDown = true; applyHdMenus(); },                     // the flip's review F2: L4 or L3 lets the menus' HD pack go
      ladder: uiGpu.hostFor('front'),                                           // the flip's re-check 2: the page's software frames counted while down
      load: (c) => import('./uiGpuPresenter').then((m) => new m.UiGpuSurfacePresenter({
        canvas: c, transparent: false, surface: 'front', host: uiGpu.hostFor('front'),   // GM-30 review 1: surfaces.front counts
        software: new CpuUiPresenter(ctx, { fit: (w, h) => { if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; } } }),
        clock: { now: () => win.performance.now(), setTimeout: (fn, ms) => win.setTimeout(fn, ms), clearTimeout: (t) => { win.clearTimeout(t as number); } },
        blend: (scale) => uiGpu.blend('front', scale), allowSoftwareAdapter: uiGpu.readout().url.allowSoftwareAdapter,
        shown: (w) => { gpuFront?.want(w); }, log: (line) => { console.warn(line); },
        hdKeys: () => hdMenus?.keys() ?? null,                                  // GM-14a: HD images keyed by the pack's key, on every build
      })),
    });
    if (gpuFront) {
      uiGpuFront = gpuFront;
      menuInput?.also(gpuFront.canvas);                                         // PLAT-11 on both canvases: a tap lands on the same frame point
      screenOrigin.lay();
    }
  }
  // HD-3 (OT.R92; `./hdMenuTextures`, a browser adaptation): with the HD pack chosen the menus sample its images and are
  // drawn at its scale; its module (and three, which the pack's module imports) is loaded only then. Without it nothing
  // is loaded or fetched and the original frame is drawn.
  // GM-02: `?uiPerfHd` (a development build under `?devmode` only) turns the menus' path on with no pack chosen, so the
  // baseline can measure scales 2 and 4; the world's picture is untouched.
  // B206 ML-3 (ML.R9, R11): the page's texture registry collects from the boot while a pack is enabled (so a match's
  // world prepared before the first choice is known in full), and the menus' HD follows the HD pack chosen in MODS --
  // under MODERN and PS2 alike, the picture no longer its switch.
  collectOnHint(pageHintFlags, hdTextures);
  const packChoice = pageTextureChoice();
  const menusHd = (): boolean => menusHdOn({ uiPerfHd: uiPerf.hd, choice: packChoice.get(), gpu: !frontGpuDown && frontGpuMayDraw(uiGpu, uiGpuDevBuild()) });
  const applyHdMenus = hdMenusApplier({ on: menusHd, running: () => running, choice: () => packChoice.get(),
    load: () => import('./hdMenuTextures').then((m) => (hdMenus = m.pageHdMenus(m.parseHdMenuScale(search)))) });
  pictureOff.push(picture.observe(applyHdMenus));
  pictureOff.push(packChoice.observe(applyHdMenus));                            // B206 ML-3: the MODS choice, heard at its notice
  void packChoice.ready.then(applyHdMenus);
  applyHdMenus();
  audio = opts.audio ?? new GameAudio(out ?? undefined, undefined, { inline: false });
  // PLAT-19c's pictures and PLAT-20's sound, from the same tree (MOVIE-WIRE; `./frontEndMovies`).
  const worker = opts.movies !== undefined ? opts.movies : typeof Worker === 'function' ? pageMovieWorker : null;
  // LATER 67: a kept movie gone from this browser's storage is said once on the page, besides the console line.
  const tellMovieMiss = movieMissTeller((line) => showPageLine(doc, line));
  const movies = worker ? frontEndMovies({
    source, assets, worker, now: () => win?.performance.now() ?? Date.now(),
    volume: () => { const v = session_?.uiVars.find('DIALOG_VOLUME')?.value; return v?.type === 'real' ? v.value : DIALOG_VOLUME_DEFAULT; },
    out: opts.movieSound ?? (out ? frontEndMovieOut(out) : () => null),
    onError: (path, e) => { console.warn('front end: movie', path, why(e)); tellMovieMiss(e); },
  }) : null;
  mount.movies = movies;
  // MENU-MUSIC (research 152): the menus' MUS_ streams from VAGSTORE by range, on the same output; MUSIC_VOLUME the session's.
  const musicVolume = (): number => { const v = session_?.uiVars.find('MUSIC_VOLUME')?.value; return v?.type === 'real' ? v.value : MUSIC_VOLUME_DEFAULT; };
  audio.setTunerVars?.(() => session_?.uiVars);   // PF-32 (research 233 §1.3): the four option masters by group, read at each play
  const webOut = out;
  const music = webOut ? new MenuMusic({
    source: assets, out: frontEndMusicOut(webOut), whenRunning: (run) => webOut.onRunning(run), musicVolume,
    onError: (member, e) => console.warn('front end: music', member, why(e)),
  }) : null;
  mount.music = music;
  const matchSound = frontEndMatchSound({ out: webOut, vars: () => session_?.uiVars, music });   // MATCH-SOUND
  const sounds = pageUiSounds(assets, audio, doc, music ? { music } : {}).catch((e) => ({ cues: null, output: null, missing: [why(e)] }));
  // ONL-04: the universe query to our match server (`./universeHost`); a deep link to SELECT UNIVERSE reads it first.
  const universe = fetchUniverseService(universeServiceBase(search, win?.location ?? { protocol: 'http:', host: 'localhost' }));
  const atSelectUniverse = readsUniverseFirst(entry.startDialog);            // ONL-06: the persona form's deep link reads it too
  const universeReply = atSelectUniverse ? universe.query({ ...UNIVERSE_QUERY }).catch(() => null) : Promise.resolve(null);
  let missions: readonly MissionRecord[] = [];                               // ONL-13: missionlist.rdr (RUN/READERC.ZAR)
  assets.read('RUN/READERC.ZAR').then((b) => {
    missions = missionsFromReaderc(b);
    if (session_) seedNumMultiMissions(session_.opener.valves, missions);   // ONL-15: the table read sets NumMultiMissions (FUN_002c8c10), whenever it lands
  }, () => { /* none: no mission offered */ });
  // NB-7 (OT.R50; CREATE_GAME_OFFER_ADAPTATION): what the server offers CREATE GAME, read once with the room list's request
  // (nothing asked at the mount); until it answers (or with none, or a server before the served rule), FIRST_RELEASE_MAPS.
  const createGameOffer = win ? new CreateGameOfferRead(accountServiceBase(search, win.location, devBuild())) : null;
  // INVITE_HANDOFF_ADAPTATION: first -- a logged-in tab of this browser takes the invite, and this tab stops before the dialogs are read or LOGIN is built.
  const handOff = offerInvite(invite);
  const prepared = async () => {
    const handed = await handOff;
    if (handed) return { handed } as const;
    const [disc, ui, reply, perfLib] = await Promise.all([readFrontEndDisc(assets).then((d) => withMenuArt(assets, d)), sounds, universeReply, perfLoad]);
    return { handed: null, disc, ui, reply, perfLib } as const;
  };
  const session = prepared().then((r) => {
    if (!running) return null;
    if (r.handed) return handedOff(r.handed);
    const { disc, ui, reply, perfLib } = r;
    if (!ctx || !win) { say('no 2D canvas'); return null; }
    const createGameServiceTarget = accountServiceBase(search, win.location, devBuild());
    const events: OpenerEvent[] = [];
    // The loading panel is made at a match's first loading screen, not at the mount: the page at the base path holds the
    // front end's canvas alone until a game launches (menuflow.spec's frontEndAlone).
    let loadingPanel: LoadingPanel | null = null;
    // HD-4 (OT.R92, HD.R8; a browser adaptation) drew the loading screen at the menus' scale through their pack; GM-28
    // replaces that: the original 640 x 448 drawing in every state until the panel has its own GPU surface.
    // GM-28 (GM.R19; the lane holder's amendment, 2026-11-09): GM-22 makes the panel a whole-frame software raster each
    // animation frame, so its software draws scale 1 in every state. GM-23: the menus' HD options again, which reach only
    // the panel's own GPU surface while it presents (`loading` in the switch: `on` on the landed table since the flip,
    // GM.R18; at L4 the panel's 1x software); opaque, as the panel's frame is; its context let go while it hides.
    // GM-XBOX1 (`UI_GPU_XBOX_ONE_CONTEXT_ADAPTATION`, a browser adaptation; `uiGpuSurfaceWiring`): on the Xbox class no GPU
    // option -- the panel's surface would be a second WebGL context beside the match's through the load -- and the 1x HD
    // option with it (review F1: the HD pack is not refused on Xbox), so its software draws 640 x 448, as v0.4.17's did.
    const panel = (): LoadingPanel => (loadingPanel ??= ((w) => new LoadingPanel(doc, w.hd, w.gpu))(uiGpuSurfaceWiring('loading', pageDeviceClass(), () => hdMenus?.options() ?? { scale: 1 }, () => ({ resolveAt: (s: number) => uiGpu.resolve('loading', s), load: uiGpuSurfaceLoader({ surface: 'loading', transparent: false, sw: uiGpu, win, hdKeys: () => hdMenus?.keys() ?? null }), dev: uiGpuDevBuild() }))));
    // BLACK-GAP (`./loadingHold` `LOADING_UNTIL_FIRST_FRAME_ADAPTATION`, a browser adaptation): at the match's start the
    // screen stays up until the mounted match draws its first world frame (or the fallback), not taken down at begin.
    // QUAD-CACHE-RELEASE review F1: the panel draws through the load after `leave` (its software frames fill the page's
    // quad cache), so the caches go again when it hides at the match's first frame. The in-match Options overlay's draws
    // refill it too; that refill (within the cache's 32 MiB) waits for the next match's `leave`.
    const loadingHide = loadingHold(() => { loadingPanel?.hide(); hdMenus?.releaseQuadCache(); releasePageQuadCache(); });
    const matchScreen = pageLobbyMatchScreen({ cover: () => { loadingHide.show(); panel().cover(); }, show: (s) => panel().show(s), hide: () => { loadingHide.hide(); } }, assets);
    const menuHold = matchMenuHold(() => session_);
    const banks = pageUiTextures(assets);                                          // ONL-01: the banks from the tree (`./frontEndAssets`)
    const s = new FrontEndSession<MovieFrame>({
      disc, startDialog: entry.startDialog, sounds: ui.cues ?? undefined, textures: banks.textures,
      controllerConfigs,                                                                                              // OPT-14: the page's own front end binds the pad's configs
      startMenuPage: START_MENU_PAGE,                                                                                 // R4B-02: and the START menu's VOICE MODULATION (r0004's store)
      screenOrigin: (x, y) => { screenOrigin.set(x, y); },                                                             // SCREEN POSITION: the drawn frame moved (`./screenOrigin`)
      picture,                                                                                                        // OT.R79: VIDEO MODE, the page's picture (`./picture`)
      dialogBuilt: (d) => { void banks.need(d).then((m) => { if (m.length) console.warn('front end: not read', m); }); },   // FE-SWEEP: OPTIONS' UIOP when its dialog is built
      ...(movies ? { source: movies.source } : {}), moviePicture: movieFramePicture,                                   // MOVIE-WIRE: the disc's movies
      universe, universeReply: reply,                                                                                  // ONL-04: the universe list's service and a deep link's reply
      usagePolicy: fetchUsagePolicyService(universeServiceBase(search, win.location)),                                // ONL-08: the agreement's text from the same server
      account: guardInviteLogin(pageLoginService(search, win.location, devBuild()), invite, (handed) => { handedOff(handed); }),   // ONL-07: the login at the page's own /account/* (N1, OT.R22); never a login while another tab holds the session; SAVE-PASSWORD (OT.R61): a saved password by the remember cookie
      announcement: fetchAnnouncementService(universeServiceBase(search, win.location)), clanInvitations: fetchClanInvitationsService(universeServiceBase(search, win.location)),   // ONL-09: SERVER NEWS, the INVITATIONS row
      roomList: offerWithRooms(fetchRoomListService(accountServiceBase(search, win.location, devBuild())), createGameOffer),   // ONL-11: the rooms, the ticket's bearer at the page's own origin; NB-7: the offer's read with them
      ownerFields: fetchOwnerFieldsService(accountServiceBase(search, win.location, devBuild())),                     // OPT-15: ONLINE OPTIONS' description, the same base and bearer
      playerInfo: fetchPlayerInfoService(accountServiceBase(search, win.location, devBuild())),                       // SVC-15a: the own-stats read at state 11, the same base and bearer
      briefingRoom: fetchBriefingRoomService(accountServiceBase(search, win.location, devBuild())),                   // ONL-12: the join, the room's games, the way out
      ignoreList: fetchIgnoreListService(accountServiceBase(search, win.location, devBuild())),                       // ONL-25: the ignore list, the same base and bearer
      ladder: fetchLadderService(accountServiceBase(search, win.location, devBuild())),                               // ONL-30a: PLAYER RANKING and PLAYER INFO, the same base and bearer
      friendList: fetchFriendListService(accountServiceBase(search, win.location, devBuild())),                       // ONL-24: FRIENDS, the same base and bearer
      createClan: fetchCreateClanService(accountServiceBase(search, win.location, devBuild())),   // ONL-26: CREATE CLAN, the same base and bearer
      clanMembership: fetchClanMembershipService(accountServiceBase(search, win.location, devBuild())),   // ONL-28: the invitations' pages and the INVITATIONS row's ticketed list, the same base and bearer
      clanMessages: fetchClanMessagesService(accountServiceBase(search, win.location, devBuild())),   // ONL-29: the clan messages, the same base and bearer
      manageRoster: fetchManageRosterService(accountServiceBase(search, win.location, devBuild())),   // ONL-27: the rosters, the same base and bearer
      createGame: fetchCreateGameService(createGameServiceTarget), missions: () => missions,   // ONL-13: CREATE GAME
      createGameOffer: () => createGameOffer?.current() ?? null,                                                       // NB-7: the server's offer (OT.R50)
      allBotGames: () => createGameOffer?.allMaps() ?? false,                                                          // P537-L2: the server's CREATE_GAME_ALL_MAPS word
      gameLobby: fetchGameLobbyService(accountServiceBase(search, win.location, devBuild())), matchSocket: pinnedMatchSocket(search, win.location, devBuild()),   // ONL-16a
      armory: { load: armoryRead },                                                                                    // the shared ARMORY's data (kept: PAR-3)
      ...(invite ? { invite } : {}),                                                                                   // LOBBY-INVITE
      matchStart: (h) => { console.info('front end:', GAME_LOBBY_MATCH_START, h.mediusWorldId, h.mission); },          // the session's `match` takes the client (ONL-18)
      roundChat: () => roundLine,                                                                                      // SVC-19: the match's HUD takes the lobby's lines while it is up
      lobbyMatch: {                                                                                                    // ONL-18 (research 166 §5): one loading screen for every map
        screen: matchScreen.screen,
        // ONL-18c (research 166 §8): the world decoded in the map viewer's worker while the screen shows, then the match
        // mounted on the lobby's client -- `./matchMount` loaded only now, so the front end's bundle stays free of it
        // and of `./main` (OT.R12). A loader that will not come leaves the archive's read as the load.
        // IP3 (`./loadMarks`, a measurement instrument): the load's phases marked.
        load: (mission) => { markLoad('load-start'); return matchLoader().then((l) => l.load(mission), () => matchScreen.load(mission)).then((a) => { markLoad('decode-done'); return a; }); },
        // IP3 (`LOAD_REPORT_AT_PREPARED_READING`, research 166 §3): the match made ready to draw (canvas, renderer, world,
        // compile, its frames to the mount's first-frame gate: the mount's own stage 1) before the load is reported; a
        // loader that will not come settles it at once.
        // IP3 lobby prepare (`./loadMarks` `markLobbyPrepared`): whether it found the game lobby's prepared match.
        prepare: (mission) => matchLoader().then((l) => { markLobbyPrepared(l.holds(mission) !== null); return l.prepare(mission); }, () => undefined),
        // IP3 lobby prepare (`./lobbyPrepare` `LOBBY_PREPARE_ADAPTATION`, a browser adaptation, the owner's word 2026-11-02):
        // the game lobby's mission prepared while the player waits there (guarded: off under the Xbox preset, on a small
        // device, at `?lobbyprepare=0`), so the hand-off's load and prepare above find it; let go when the game is left or
        // changes mission. A release meanwhile (`lobbyAsk`) stops a prepare not begun yet; neither port throws or rejects.
        lobbyPrepare: (mission) => { if (!lobbyPrepareAllowed()) return; const ask = ++lobbyAsk; void matchLoader().then((l) => (ask === lobbyAsk ? l.prepare(mission) : undefined)).catch(() => undefined); },
        lobbyRelease: () => { ++lobbyAsk; void matchLoading?.held()?.then((l) => { l.dropPrepared(); }, () => undefined); },
        // IP3 (5d's ruling (a)): a SWITCH TEAMS in the game lobby -- the prepared match re-seats (its own seat lines).
        lobbySide: () => { void matchLoading?.held()?.then((l) => { l.reseat(); }, () => undefined); },
        // IP3 (the review's F4): a load ended with no match started -- the prepared match (or the one being made) let go
        // (5d's N1: not at the prepare's bound, which keeps it for the mount); a loader not made is not made for it.
        unprepare: () => { ++lobbyAsk; void matchLoading?.held()?.then((l) => { l.dropPrepared(); }, () => undefined); },
        start: (m) => { loadingHide.hold(); markLoad('start'); const made = matchLoader().then((l) => {
          // MATCH-SOUND: the match's own audio, on the menus' context; a mount that throws lets it go.
          // TAUNTS (`./matchTaunts`) and MESSAGES (`./matchChat`): the fives as the session's MPTAUNTMSG1-5 and
          // MPLOCALSOP1-5 hold them -- the card's, else dlgNetLogin's defaults; OPTIONS: the globals StoreOptions left.
          const taunts = (): (string | null)[] => tauntTexts(session_?.uiVars ?? null);
          const messages = (): (string | null)[] => messageTexts(session_?.uiVars ?? null);
          const options = () => playOptionsOf(session_?.options, session_?.uiVars ?? null);   // OT.R72: the stick tuners too
          // SVC-19 (research 266 §3.3-§3.4): the room's game-session lines to the game lobby's panel; EXTERNAL WHISPERS
          // as the globals StoreOptions left (`DAT_003de620`); the match's HUD the round's drain of the lobby's lines.
          const gameChat = (ev: Extract<ServerEvent, { type: 'chat' }>): void => { session_?.gameLobby.commands.chatLine(ev); };
          // SA-43c Part 2: the room's system message (a host's restart notice) routed as the lobby's (`FUN_0030dce0`, Part 1)
          const systemMessage = (ev: Extract<ServerEvent, { type: 'system' }>): void => { session_?.briefing.chat.systemMessage(ev.text, ev.severity); };
          const whispers = (): number | undefined => session_?.options.value('EnableExternalWhispers');
          // KEYBOARD-WHISPER (OT.R48; research 266 §3.9): the round's USB-keyboard line, online while `ComeFromLan` reads 0
          // (`FUN_001f7ff0` D:L56828-56830, `FUN_003045b0(0x44fe10)`), its `/w` through SendMediusChat's path (`FUN_002f4860`).
          const textLine = {
            online: (): boolean => (session_?.opener.valves.find('ComeFromLan')?.value ?? 0) === 0,
            whisper: (message: string, name: string): void => { session_?.briefing.chat.mediusChat(message, name); },
          };
          // MATCH-01 (research 266 §8): the START menu's rows on the session's option globals and valve registry.
          const current = session_;
          const startMenuOptions = current ? sessionStartMenuOptions(() => current.options, () => current.opener.valves) : undefined;
          // HD-4 (OT.R92, HD.R8; a browser adaptation): the overlay at the menus' scale (capped at 2x) through their pack.
          // GM-19a (GM-28's rule, GM.R19): those HD options reach only the overlay's GPU surface while it presents
          // (`overlay` in the switch: `on` on the landed table since the flip, GM.R18; at L4 the overlay's 1x
          // software); every software frame is the original 640 x 448 frame. Its context is made at the first open and let
          // go when the match ends (the unmount's `interrupt`). GM-XBOX1 (`UI_GPU_XBOX_ONE_CONTEXT_ADAPTATION`, a browser
          // adaptation; `uiGpuSurfaceWiring`): on the Xbox class no GPU option, so no second WebGL context beside the
          // match's, and the 1x HD option with it (review F1), so its software draws 640 x 448, as v0.4.17's did.
          const settings = current ? new NativeSettings({ doc, load: async () => ({ assets: await readNativeOptionsAssets(assets, { disc, banks }), state: () => current.nativeOptions, sounds: ui.cues }), ...uiGpuSurfaceWiring('overlay', pageDeviceClass(), () => hdMenus?.options() ?? { scale: 1 }, () => ({ resolveAt: (s: number) => uiGpu.resolve('overlay', s), load: uiGpuSurfaceLoader({ surface: 'overlay', transparent: true, sw: uiGpu, win, hdKeys: () => hdMenus?.keys() ?? null }), dev: uiGpuDevBuild() })) }) : undefined;
          void settings?.preload(); // Browser adaptation: warm kept Options assets before the match mounts.
          // PAR-3: the round screens' bitmaps from the lobby's ARMORY read of the same mission (`armoryRead`, one decode).
          return matchSound.start((audio) => {
            const mounted = l.mount(doc.body, { ...m, ...(win ? { win } : {}), ...(audio ? { audio } : {}), taunts, messages, options, picture, armory: armoryRead(m.handOff.mission), gameChat, systemMessage, externalWhispers: whispers, textLine, startMenuOptions, settings, gameVars: { uiVar: (n) => { const v = session_?.uiVars.find(n)?.value; return v?.type === 'string' ? v.value : null; }, valve: (n) => session_?.opener.valves.find(n)?.value ?? null }, firstFrame: () => { loadingHide.firstFrame(); } });
            loadingHide.mounted();   // #635 review F2: the fallback's clock from the canvas's mount
            markLoad('mounted');   // IP3 (`./loadMarks`)
            roundLine = (line) => { mounted.lobbyLine(line); };
            return mounted;
          });
        });
          // #635 review F2: a match that will not mount lets the screen go at once (as before the hold), not at the fallback.
          made.then(() => undefined, () => { loadingHide.release(); });
          return deferredMatch(m.client, made); },
        // The menus take no pad while the match is up (the original's menus are not running in a match).
        // MATCH-SOUND: the menus' music held from the match's loading screen to the return.
        // `./frontEndSleep` (a browser adaptation): the menus' raster skipped while the match is up under every preset
        // (H397 / C14; PR #631 began it under the Xbox preset) and, under the Xbox preset or the Xbox class (VS-10 F1), the
        // movie worker ended when no movie is open.
        leave: () => { hdMenus?.releaseQuadCache(); releasePageQuadCache(); matchSound.leave(); canvas.hidden = true; screenOrigin.layLater(); menuHold.leave(); uiGpuFront?.release(); gpuFront?.commit(); matchUp = true; matchGraphics = readGraphicsBackend(); if (movieWorkerSleeps(matchGraphics)) movies?.sleep(); else movies?.sound.keep.clear(); },   // GM-32 review F1: the kept movie sound let go for the match
        settled: (r) => { matchSound.settled(r); },
        // PR #631 (`./matchLoaderSlot`): under the Xbox preset the match's worker and decoded mission let go at the return.
        returned: () => { roundLine = null; if (releasesMatchOnReturn(readGraphicsBackend()) || pageDeviceClass() === 'xbox') matchLoading?.release(); matchSound.returned(); canvas.hidden = false; screenOrigin.layLater(); menuHold.returned(); uiGpuFront?.returned(); matchUp = false; loadingHide.release(); },
      },
      onLaunch: (l) => console.info('front end: LoadExecPS2', l.elf, l.argv),
      onEvent: (e) => { events.push(e); console.info('front end:', e); },
    });
    session_ = s;
    // SOUND MODE (`./audio` `SOUND_MODE_ADAPTATION`): `STEREO_CONTROLLER` as the boot's store left it, then as each later
    // `StoreOptions` does -- the original's `UIStoreOptions` hands it to the sound driver at each store.
    const soundMode = (): void => { out?.setSoundMode(s.options.value('STEREO_CONTROLLER') ?? 1); };
    soundMode();
    s.options.observe(soundMode);
    if (missions.length) seedNumMultiMissions(s.opener.valves, missions);   // ONL-15: a read before the session (a deep link need not launch)
    const router = connectMenuRoutes(s.machine, { win, alive: () => canvas.isConnected });     // OT.R10: the path mirrors the menu flow
    if (router.plan.stack.length) s.opener.skipLoader();                                     // a deep link lands past the boot
    if (disc.missing.length) console.warn('front end: not read', disc.missing);
    if (ui.missing.length) console.warn('front end: no sound', ui.missing.join('; '));
    (win as unknown as Record<string, unknown>)[FRONT_END_WINDOW_HOOK] = { session: s, movies, press: (n: PadButtonName) => s.press(n), events, music } satisfies FrontEndWindowHook;
    if (uiPerf.ring && perfLib) {
      // GM-02: the ring, the session's render probe, composeScreen's probe, and the page's hook for `e2e/uiGpuPerf.spec.ts`.
      const { UiPerfProbe, dialogSwitches, summarizeUiPerf } = perfLib;
      const probe = new UiPerfProbe(() => win.performance.now());
      perf = probe;
      s.perf = probe;
      setComposeScreenProbe(probe);
      (win as unknown as Record<string, unknown>)[UI_PERF_WINDOW_HOOK] = {
        now: () => win.performance.now(),
        samples: () => probe.ring.samples(),
        summary: (from: number, to: number) => summarizeUiPerf(probe.ring.samples(), from, to),
        switches: () => dialogSwitches(probe.ring.samples()),
        hd: () => { const o = hdMenus?.options(); return { scale: o?.scale ?? 1, version: o?.version ?? -1, forced: uiPerf.hd, decoder: hdMenus?.decoderMode() ?? null }; },
        hdSettled: () => hdMenus?.settled() ?? Promise.resolve(),
      };
    }
    mount.status = `front end on ${router.plan.stack.length ? s.machine.menu.startDialog : 'the opener (the loader screens, then dlgIntroScreen.rdr)'}`;
    menuInput?.connect(s.input);                                   // PLAT-11: the keys, pad and taps are the menus'
    if (s.invite.covering()) lobbyCover = showLobbyLinkCover(doc);   // OT.R121: the login path behind the cover, to the GAME LOBBY or a reveal
    // PLAT-17: UiParams.rdr, the physical typing -- in a release build too, but only while the soft keyboard's text entry
    // is open (the original takes a USB keyboard there; research 301 §6): no gameplay key (OT.R29, `keyboardGate.test.ts`).
    keys = connectSoftKeyboard(s.keyboard, win, () => readUiParams(assets), true);
    // FRAME-LOOP-GUARD (LATER 859, `./frameGuard`; a browser adaptation): the menus' body is `step`, run through the
    // guard, so a throw inside a tick costs that tick, not the menus.
    const step = (now: number): boolean => {
      if (!running) return false;
      movies?.sound.refreshVolume();                             // PCM group 2 follows Dialog, including the MENULOOP soundtrack.
      music?.refreshVolume();                                      // OPTIONS' MUSIC VOLUME on the music playing (research 302 §4)
      setBrightness(brightnessOfVars(session_?.uiVars));         // OPT-11 (research 358): OPTIONS' BRIGHTNESS on the picture
      const chosen = hdMenus?.options() ?? { scale: 1 };              // HD-3: 640 x 448 unless HD (GoE SouL)'s pack is on
      // The session advances every tick (the lobby and the match tick through it); the raster rests under a match (H397 / C14).
      perf?.begin(now);                                              // GM-02: the instrument's frame (null on every player's page)
      const ticks = s.advance(now);
      if (lobbyCover && !s.invite.covering()) { lobbyCover.hide(); lobbyCover = null; }   // OT.R121: the reveal
      perf?.advanced(ticks);
      const gpu = gpuFront?.drawsOn(chosen.scale) ?? false;          // GM-12b: the front end's GPU surface draws this scale (never at L4 or L3: review F3)
      // GM-28 (GM.R19): the HD options to the surface only (1x there too unless it presents); the page's own software
      // frame -- pre-import, a guard trip, `off` -- is the 1x frame; `?uiPerfHd` (a dev build's instrument) keeps its HD.
      const hd = uiGpuFrontFrameOptions(chosen, gpu || uiPerf.hd);
      if (ticks > 0 && drawsMenuFrame(s, hd.scale, gpu) && menuRasterWanted(matchUp, matchGraphics)) {
        if (gpu) s.render(gpuFront!.surface!, menuSampling ?? undefined, hd);
        else {
          if (canvas.width !== 640 * hd.scale) { canvas.width = 640 * hd.scale; canvas.height = 448 * hd.scale; }
          s.render(ctx, menuSampling ?? undefined, hd);
        }
        gpuFront?.drawn(gpu);
      }
      gpuFront?.commit();                                            // GM-12b: the canvas swap at the tick boundary, after the frame is on its canvas
      perf?.end(s.clock.lostSeconds, s.last, (hd as { version?: number }).version ?? -1, hd.scale, s.machine.shell()?.currentName ?? '');
      return true;
    };
    const frontGuard = new FrameGuard();
    const loop = (now: number): void => {
      if (frontGuard.frame(() => step(now), () => running)) frameId = win.requestAnimationFrame(loop);
    };
    frameId = win.requestAnimationFrame(loop);
    // GM-29 (`./frontEndAssets` `UI_TEXTURE_PREFETCH_ADAPTATION`, a browser adaptation): after a frame, at idle, every
    // bank's textures decoded ahead of the dialogs in the page's decode worker -- keyed for the GPU surface's texture
    // cache where the page has one -- so a cold dialog's first frame finds them; the lookup never waits on it.
    // GM-32: the menus' art first (`./menuArt` `MENU_ART_PREFETCH_ADAPTATION`; the lookup asks it before the banks), then the banks.
    if (win) texturePrefetchStop = startPageUiTexturePrefetch(win, chainUiTexturePrefetch(disc.art, banks), gpuFront ? seedUiGpuTextureKey : undefined);
    return s;
  }, (e) => { say(`the front end would not read: ${why(e)}`); return null; });
  mount.session = session;
  doc.addEventListener('visibilitychange', onVisibility);
  win?.addEventListener('pagehide', onPageHide);
  return mount;
}
