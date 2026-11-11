import './forge.css';
import { createForgeAgentApi, ForgeAgentError, type ForgeAgentApi, type ForgeAgentSnapshot } from './agent/api';
import { createForgePlayDriver } from './agent/play';
import { createForgeAgentRevisions, createForgeEditorFacade } from './agent/editorFacade';
import { createCreatorCatalogue, type CreatorAsset } from '../creator/catalogue';
import type { StarterContext } from '../creator/examples';
import { examplesForgePanel } from '../creator/examplesPanel';
import { assetsForgePanel, createAssetTiles, type AssetTiles } from '../creator/assetsForgePanel';
import { createLocalPackApi, type LocalPackApi } from '../agent/localPacks';
import { forgeMapPackDrivers } from '../agent/forgePacks';
import { checkStarterLayout } from '../creator/examples/validation';
import {
  Box3, Box3Helper, BoxGeometry, BufferAttribute, BufferGeometry, Color, GridHelper, Group, InstancedMesh, LineBasicMaterial, LineSegments, Matrix3, Matrix4, Mesh,
  MeshBasicMaterial, Euler, Object3D, PlaneGeometry, Quaternion, type Material, Raycaster, Scene, Vector2, Vector3, type Intersection,
} from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { findLadders, HOSTAGE_START_LIFT_READING, spawnsFor, zonesOfKind, type GlobalLighting, type Grid, type Ladder, type SpawnSlot, type WorldPoly } from '@s2u/scene';
import { PLAY_CLIPS } from '../animator';
import { buildBody, type BodyView } from '../bodyView';
import { FlyCamera, FORGE_PIVOT_FALLBACK_DEPTH_ADAPTATION, type ForgeViewportView } from '../camera';
import { createPageShot, type PageShot } from './camera/pageShot';
import type { ShotBounds } from './camera/driver';
import { ELF_DEFAULT_FOGCOL, fogForExtent, type FogSettings } from '../fog';
import { DEFAULT_LIGHTING, type Lighting } from '../lighting';
import { createForgeLighting, forgeLightingOptions, liftForgeFog } from './lighting';
import type { LoadedMap } from '../loadMap';
import { mapFog, standOf } from '../matchCore';
import { groundPolygons, type GroundData } from '../mover';
import { Overlays, slotBoxSegments } from '../overlays';
import { DoorPage } from '../doorPage';
import { Play, type PlayClips } from '../play';
import { createRenderer, type ViewerRenderer } from '../renderer';
import { visualPostSeams, type VisualPostSeams } from '../visualPostSeam';
import { createExtensionHost, type ExtensionHost } from '../packs/systems/host';
import { PackApplier, collectOnHint, pageHintFlags, pageTextureChoice } from '../packs/pagePacks';
import { PackApplyOverlay, pagePlayLive } from '../packApplyOverlay';
import { ApplyFrames, FORGE_MATCH_TEXTURE_SCOPE, hdTextures, rendererUploader } from '../hdTexturePack';
import { HdServedPack, lazyHdPackDecoders } from '../hdTexturePackServed';
import { pageHdStore } from '../hdTexturePackStore';
import { gxApplyProgress, pageGxPacks, type TexturePackTarget } from '../texturePackRuntime';
import { visualTintHandler } from '../packs/systems/visualTint';
import { bodyForTeam } from '../teamBody';
import { groundGrid, WalkMode } from '../walk';
import { WEAPON_CLIPS } from '../weaponPose';
import { keyboardSite } from '../keyboardTesting';
import { mouseSite } from '../mouseTesting';
import { buildWorld, type WorldView } from '../world';
import { Archives, labelOf, type ArchiveEntry } from './archives';
import { assetSourceFor, type DiscRequest, type SourceRequest } from '../discSource';
import { kitGameType, loadKitSource } from '../loadout';
import { noteDiscSource } from '../pwa/fileDisc';
import { storedCopyRequest } from '../discCopy';
import { extractionState, storedExtraction } from '../discExtractRecord';
import { forgeDiscStart } from '../discStart';
import { sourceWhere } from '../discStored';
import { accountServiceBase, pinnedMatchSocket, type PinnedSocketUrl } from '../connectHost';
import { pageSession } from '../modern/session';
import type { ArmoryData } from '../armoryData';
import {
  canPickDiscFolder, canPickDiscImage, discRequestFromHandle, pickDiscFolder, pickDiscImage, readStartState, rememberedDisc, requestDisc,
} from '../discMemory';
import { assetsShown, readFavourites, toggleFavourite, writeFavourites, type AssetFilter } from './favourites';
import { floorGround, layoutGround, prototypePolygons, standingSpot, type ContentMiss, type ContentPiece, type PieceHull } from './ground';
import type { AssetDefinition } from '../packs/content/assets';
import { CONTENT_METRES_PER_UNIT_ADAPTATION, contentPieceHull, type ContentResolver } from '../packs/content/collision';
import type { ContentLoadStage } from '../packs/content/map';
import { FORGE_PANELS_KEY, FORGE_VIEW_KEY, pageIndexedDb, pageSettings } from '../pageStore';
import { agentChangedRefs, agentStepCount, decodeHistoryStep, encodeHistoryStep, History, historyCaption, recordEdit, redoMeta, undoAgentRun, undoMeta, undoWhile,
  type AgentRunUndo, type HistoryMeta } from './history';
import { doorsAfter, groundWithout, linesWithout, placementOf, placementsOf, propsWithout, type Placement } from './hide';
import { FORGE_MATCHING_CLASS } from './matchState';
import { contentPropsGroup, lobbyArmoryData, matchExtras, startForgeLobbyMatch, startForgeMatch, type ForgeMatch } from './match';
import type { ForgeLobbyEnd, ForgeLobbyKick, ForgeLobbyPassword, ForgeLobbyVisibility } from './lobby/deps';
import { mountForgeLobby, type ForgeLobby } from './lobby/lobby';
import { armoryViewPaint } from './lobby/lobbyArmory';
import {
  addressWithLobby, askForgeSeat, askGuest, closeLobby, createLobby, enterLocked, fetchLobby, ForgeLobbySession, LOBBY_PASSWORD_MAX, lobbyEndWords, lobbyIdOf, missingArchives,
  handOnLobby, kickSeat, openLobbySocket, setListed, setPassword,
} from './lobbyClient';
import { defaultLobbyName, forgetStaleHost, joinLockedLobby, leaveLobbyInOrder, lobbyHostProof, lobbyMenuItems, lobbyPasswordField, lobbySocketOf, lobbyVisibilityToggle, typingTarget, type LobbyHostProof } from './lobbyPage';
import { BLANK_LIBRARY, blankLibraryMap, floorMesh } from './matchMap';
import { mapStill } from './mapStills';
import { openingStand, randomStand, standFromHere, walkFeet } from './playFromHere';
import { checkMap, type CheckedPiece, type MapCheck } from './validate';
import { npcsThatFit, playerSideOf } from './npcs';
import { TRAVERSAL_CLIPS } from '../traversal';
import { THROW_CLIPS } from '../throwPose';
import { DEATH_CLIPS, FLINCH_CLIPS } from '../net/deaths';
import { DOOR_CLIPS } from '../doors';
import { BINOCULAR_CLIPS } from '../binocularPose';
import { TURRET_CLIPS } from '../net/emplacement';
import { crossHoldsIn, FORGE_MATCH_EXIT_CHORD, ForgePad, type PadAction, type PadSnapshot } from './pad';
import { centreOf, inRect, moved as movedBy, Selection, turnedAbout, yawOf, yawQuat, type Pose, type Quat, type Vec3 } from './group';
import {
  createMenuSections, PAD_MENU_INPUT, PadMenu, pagedSections, sectioned, splitAtHeadings, type MenuItem, type MenuSections, type MenuSectionSpec,
} from './padMenu';
import { matchBackWords, menuCard, placeMenuCard } from './menuView';
import { hullSegments } from './hull';
import {
  archiveStem, assetId, DEFAULT_SETTINGS, emptyLayout, newLayout, originalTimeOf, FORGE_GAME_TYPE_NAME, LAYOUT_NAME_MAX, layoutDownloadName, layoutIds, modeCaption, NPC_BEHAVIOURS, parseAssetId, parseCamera,
  serializeLayout, settingsOf, withIds, type LightRigSetting, type BombObjectives, type Piece, type ForgeGameType, type Layout, type LayoutBase, type LayoutCamera, type LayoutSettings,
  type NpcBehaviour, BOMB_SITE_REACH, } from './layout';
import { blankFloorOf, bombMarkerPlaysIn, forgeTypeUnplayable, type ObjectiveMap } from './objectives';
import { censusOfCopies, censusOptions, copiesOf, DEFAULT_LADDER, ladderPropsOf, type CopyKind, type MapCensus, type MapCopies } from './mapCensus';
import { turnFacade } from '../facade';
import { flareModelMap, flareTemplates, type FlareTemplate } from './placedFlares';
import { SITE_OUTLINE_DONOR } from './siteOutlines';
import { skyDomeFor } from './skyDome';
import { composeLayoutFinish, composeLayoutObjects, layoutOwnSites } from './composeLayout';
import { environmentOf } from './environmentCopy';
import { BLANK_PRESETS, blankPresetOf, presetLayout, type PresetHostage } from './blankPresets';
import { hostageCharactersOf, hostagesLeftNotes, hostagesPlayIn, hostageDefault, nextHostageName } from './hostages';
import { EXTRACTION_ZONE_SIZE, nextSafetyName } from './extractionZones';
import { floorAiMaps } from './floorAi';
import { nextNavName, nextViewName } from './placedPoints';
import { turretModelMap, turretMove, turretTemplates, type TurretTemplate } from './turrets';
import { DEFAULT_BARRIER, DEFAULT_DOOR, DEFAULT_GATE, DEFAULT_TURRET } from './agent/commands';
import { accessGizmo, accessModelMap, accessMove, accessTemplates, type AccessTemplate } from './placedAccess';
import { doorModelMap, doorMove, doorTemplates, type DoorTemplate } from './placedDoors';
import { BARRIER_GUIDE_COLOUR, BOMB_SITE_GUIDE_COLOUR, bombSiteShapes, DOOR_SWING_COLOUR, GATE_GUIDE_COLOUR, guideGroup, HOSTAGE_GUIDE_COLOUR, keepWorldTurn, VIEW_GUIDE_COLOUR, viewShapes, yawWay, LADDER_CLIMB_COLOUR, TURRET_GUIDE_COLOUR, turretShapes, ladderSegments, ladderTriangles, swingOf, swingSegments, swingTriangles } from './interactOverlay';
import {
  contentAssetKey, contentBaseRef, missingPackRefs, onlineRecordRefusal, readContentMapDefinition, type ContentLayoutBase, type ContentMapDefinition,
  type ContentRef, type InstalledRulesPack, type PackRef, type RecordMode,
} from '@s2u/creator-contracts';
import { createForgeShell, createWorkspaceDock, ForgePanelError, type ForgePanel, type ForgeShell, type ForgeShellPage } from './shell/panel';
import {
  createFocusLeases, panelContext, type CharacterRow, type ForgeDropProjection, type ForgeEditor, type ForgePageContext, type ForgePalette, type ForgePanelContext, type ForgeUi,
  type PaletteRow, type StagedPiece,
} from './shell/context';
import { drawLegend, legendFor, type LegendContext } from './shell/legend';
import { createOperationRegistry, FORGE_EDIT_OPERATIONS, HUMAN, performedOr, recordOperationStep, type OperationStep } from './shell/operations';
import { createNotifier, forgePulse } from './shell/notify';
import { createStatusChips, FORGE_CHIP_ORDER, issuesChip, lobbyChip, modeChip, saveChip, type ForgeSaveState, type StatusChipView } from './shell/statusBar';
import { padActuator } from '../rumble';
import { CARD_SAFE_ATTR, createCardStack, type CardHandle } from './shell/cards';
import { PAD_FOCUS_INPUT } from './shell/padFocus';
import { holdEarlyPresses } from './shell/earlyPress';
import { agentModeOf, FORGE_REFUSALS, forgeBusyRefusal, forgeEditRefusal, forgeSurfaceState, type ForgeBusyCause, type ForgeShellState, type ForgeSurfaceState } from './shell/state';
import { buildInspector, inspectorPanel, dataRows, showInspectorData, type InspectorEditor } from './panels/inspectorPanel';
import { FORGE_TRANSFORM_STUBS_HIDDEN_ADAPTATION } from './transformStubs';
import { scrubAllNumbers, type ScrubDetail } from './scrub';
import { buildOutliner, outlinerPanel, spawnSlotRows } from './panels/outlinerPanel';
import { mapDataGroups, type MapDataSource } from './mapData';
import { environmentSections } from './environment';
import { buildEnvironment, drawEnvironment, environmentPanel } from './panels/environmentPanel';
import { buildLightRigEditor, directionOf, type Atmosphere } from './panels/lightRigEditor';
import { LightArrows } from './lightArrows';
import {
  billboardRows, billboardSpecs, MAP_DATA_KIND_TOGGLES, MAP_DATA_MARKS, MapDataBillboards, placementOfMark, propMarkKey, userMarkKind,
  type BillboardSpec, type PropMark, type UserMark,
} from './mapDataBillboards';
import { buildDetailDistance, buildRenderScale, detailDistanceMenuItem, renderScaleMenuItem, VIEW_MENU_ROWS, viewMenuSection, type DetailDistanceHooks, type RenderScaleHooks } from './panels/viewPanel';
import { detailDistanceFor, detailDistanceKeeper } from '../detailDistance';
import { AdaptiveRatio, pixelRatioCap, type RatioTarget } from '../matchViewport';
import { wantsTouchControls } from '../touch';
import { renderCapFor, videoSettingsKeeper } from '../videoSettings';
import { buildSettings, drawCustomModes, formatSetting, MODE_OPTION_PREFIX, modeOptionValue, settingsPanel } from './panels/settingsPanel';
import { freshEntityId, rulesPanel, RULES_ENTITY_WORD, RULES_PLACE_DEFAULTS_ADAPTATION, type RulesEntityKind } from './panels/rulesPanel';
import { canvasLabel, createRulesGizmos } from './rulesGizmos';
import { bombOfMarkerStates, bombRestOf, layoutObjectivesOf, markersOfBomb, type BombMarkerState } from './bombMarkers';
import { autosaveUnreadable, layoutOfRecord, RECORD_LIMITS, recordOfLayout, savedLayoutHasWork, type PieceRow } from './record';
import {
  checkForgeRules, FORGE_AUTHORING_SCHEMA, FORGE_AUTHORING_VERSION, forgeAuthoringText, forgeModeList, layoutOfAuthoring, parseForgeLayout, readForgeAuthoring,
  refusalWords, shareRefusal, type ForgeLayout, type ForgeRulesDraft,
} from './rulesAuthoring';
import { forgePlayRules, forgeRuleHost, playRulesSeed, ruleNamesOf } from './matchRules';
import { createRulesPresenter } from './rulesPresent';
import type { RulesCueAudio } from './rulesCues';
import { AUTOSAVE_NAME, deleteNamed, dropKeptAside, joinerSavePreset, keptAside, readSaveList, renameNamed, saveNamed, saveNamedRules, setAsideAutosave, setAsideSaves, writeSaves, type KeptAside, type NamedSave } from './saves';
import { ForgeSaves, SavesStore } from './savesStore';
import { bootChoice, ownLayoutOnReturn } from './boot';
import { cameraFlush, cameraFrame, settleState } from './cameraSettle';
import { savesCard } from './savesPanel';
import { CUSTOM_MAPS_GROUP, CUSTOM_VALUE_PREFIX, SAVE_VALUE_PREFIX, customMapRows, customRowLabel, customRowSentence, type CustomMapRow } from './customMaps';
import { customMapRequires, type CustomMapRecord } from '../packs/customMaps';
import { codeFromLocation, decodeShare, shareOffer } from './share';
import {
  boundSetting, brightenFor, fogOfSlider, fogWithFar, matchBrightenOf, roomOptionsOf, settingsDelta, sliderOfFog, stepSetting,
  timeSetting, type NumericSetting,
} from './settings';
import { palette, type PaletteEntry } from './library';
import { standingPose } from './figure';
import { FORGE_TOOL_ORDER, forgeKeyAction, forgeLeaseExit, forgeToolKeyHelp, forgeToolKeyLabel, type ForgeKeyState } from './keys';
import { servedTreeFallsBackToDisc } from './servedFallback';
import {
  blockPiece, bombMarker, disposeGhost, extractionZoneMarker, hostageMarker, pointMarker, respawnMarker, zoneOutlines, FORGE_BLOCK, forgeRootOf, ghostOf, missingPiece, npcMarker, PieceLibrary, setSlotCellsShown, spawnMarker, type BombMarkerKind,
} from './pieces';
import {
  boundStep, clipOf, DEFAULT_GRID_STEP, DEFAULT_TURN_STEP, GRID_STEP_MAX, GRID_STEP_MIN, pastedPlaces, placementGridOf,
  placeClickKind, restingPoint, seatOn, snapYawRadians, surfaceYs, TURN_STEP_MAX, TURN_STEP_MIN, type PlacePoint,
} from './placement';

/**
 * FORGE (the owner, 2026-10-12: "a build and fly sandbox ... that creates assets that will eventually be multiplayer
 * maps"; a proof of concept first; then "a play mode like the test room", favourites, the test room's view settings
 * and "more of polished game engine feel"). A browser adaptation with no original: nothing here is the game's, and
 * nothing of the game's paths is changed -- the forge reads the disc through the viewer's own loader, draws with its
 * world builder and plays with its walk, mover and SEAL. A development build's only (OT.R29 / OT.R38).
 *
 * The page is an editor: a toolbar, the assets dock (the disc's prop prototypes from any archive, favourites first
 * and as a filter of their own), the viewport, the inspector / outliner / view dock, and a status bar. A layout is
 * kept as a recipe (`./layout`): autosaved in this browser as the v2 record (`./record`), and kept by name
 * (`./saves`), downloaded, opened, or shared as a link (`./share`). A v1 file still opens.
 */

const MAPS = `${import.meta.env.BASE_URL}maps`;
/** R3-B (FCW-07a part 2): what the page says when a list it writes was written elsewhere first (another tab, the agent's bridge). */
export const SAVED_ELSEWHERE = 'Saved elsewhere, reloaded';
const VIEW_KEY = FORGE_VIEW_KEY;
/** The blank floor's extent and step, in game units (the forge's own). */
const FLOOR_SIZE = 8000;
const FLOOR_STEP = 100;
/** A spectator view's arrow, world units: long enough to read from across a room (an editor guide's size, no reading). */
const VIEW_ARROW_LENGTH = 60;
/** The blank floor's guide in a neutral gray (the owner, 2026-11-06; an editor guide, never drawn in a match): its centre lines, its lines, its ground. */
const FLOOR_GRID_CENTRE = 0x8c8c8c;
const FLOOR_GRID_LINES = 0xb4b4b4;
const FLOOR_GRID_GROUND = 0xe4e4e4;
/** The forge's opening view over a campaign floor (its own, no original): this far up and back from the standing spot. */
const CAMPAIGN_EYE_UP = 90;
const CAMPAIGN_EYE_BACK = 160;
/**
 * R3-B (a browser adaptation, FG.R2; no original): a placement ghost's look -- the pad's own ghost (`./pieces` `ghostOf`,
 * its 0.4 opacity) and a staged drop's (`StagedPiece.show`) alike -- and the tint it takes while the placement is refused.
 */
const GHOST_OPACITY_ADAPTATION = 0.4;
const GHOST_REFUSED_TINT_ADAPTATION = 0xd0404a;
/** R3-B: a pack's piece's layout key (`@s2u/creator-contracts` `contentAssetKey`): a label, never read as a disc archive. */
const PACK_ASSET_PREFIX = 'pack:';
/** R3-B: packs by `id@version`, as the Check sheet and the refusals name them. */
const packWords = (refs: readonly PackRef[]): string => refs.map((r) => `${r.id}@${r.version}`).join(', ');
/** R3-B: the forge's own block has one source, this page's (`ForgeEditor.sourceIdentity`). */
const FORGE_BLOCK_SOURCE: object = Object.freeze({ source: 'forge-block' });
/**
 * R3-B: a ghost's materials -- translucent as the pad's ghost, and tinted while the placement is refused. Each material's
 * own colour is kept on it (`userData.forgeGhostBase`), so a ghost that turns admitted again shows its own colour.
 */
function paintGhost(root: Object3D, admitted: boolean): void {
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    for (const m of (Array.isArray(o.material) ? o.material : [o.material]) as Material[]) {
      m.transparent = true;
      m.opacity = GHOST_OPACITY_ADAPTATION;
      m.depthWrite = false;
      const color = (m as Material & { color?: unknown }).color;
      if (!(color instanceof Color)) continue;
      const own = (m.userData['forgeGhostBase'] as number | undefined) ?? color.getHex();
      m.userData['forgeGhostBase'] = own;
      color.setHex(own);
      if (!admitted) color.lerp(new Color(GHOST_REFUSED_TINT_ADAPTATION), 0.65);
    }
  });
  root.userData['forgeGhost'] = admitted ? 'admitted' : 'refused';
}

type Mode = 'select' | 'place' | 'spawnA' | 'spawnB' | 'respawnA' | 'respawnB' | 'npc' | 'hostage' | 'zone' | 'point' | 'view' | 'turret' | 'door' | 'ladder' | 'gate' | 'barrier' | 'flare' | 'bomb' | 'siteSeal' | 'siteTerrorist';

/**
 * The placing tools a game type alone plays (a browser adaptation, FG.R2; the owner, 2026-11-06): the bomb's start and
 * its plant sites Demolition's (2, `FUN_002c9540`), the hostages and extraction zones Escort's and Extraction's (3, 4:
 * what `./playObjectives` reads under them). A tool not listed places under every type.
 */
/**
 * A new empty map's rig where the map it is built from has none (a browser adaptation, FG.R2; an editor's values, no
 * original): one white key light from high in the south-east, one dim cool fill opposite, the third off (the disc's zero
 * direction), and a soft ambient.
 */
const FALLBACK_RIG: LightRigSetting = {
  directions: [directionOf(135, 50), directionOf(315, 30), [0, 0, 0]],
  colours: [[0.85, 0.85, 0.8], [0.25, 0.28, 0.35], [0, 0, 0]],
  ambient: [0.35, 0.35, 0.38],
};
/**
 * A new empty map's drop-shadow vector where the map it is built from has none (an editor's value, as `FALLBACK_RIG`):
 * falling north-west, 45 degrees down, as from `FALLBACK_RIG`'s key light.
 */
const FALLBACK_SHADOW: [number, number, number] = [-0.5, -0.7071, 0.5];
/**
 * The span a new empty map's Light directions arrows are sized to (world units; an editor's value): a multiplayer map's
 * own size, so they stand in the sky as a disc map's do (`./lightArrows`: 0.3 of it, about 1000 long).
 */
const BLANK_RIG_ARROWS_SPAN = 3500;

/** A placed flare's unseen pick box, world units a side (an editor's value, FG.R2): a glow's quad is too thin to click. */
const FLARE_PICK_SIZE = 6;

const MODE_TOOL_TYPES: Partial<Record<Mode, readonly ForgeGameType[]>> = {
  bomb: [2, 1], siteSeal: [2, 1], siteTerrorist: [2], hostage: [3, 4], zone: [3, 4],   // BREACH: the start and the SEALs' site (`breachReady`)
};

/**
 * The view settings: the test room's own switches over the world (`main.ts` `applyToggle`, `setup/index.html`'s
 * defaults), the forge's hull and floor, and the picture (native or the PS2 frame).
 */
const VIEW_TOGGLES = [
  { id: 'wireframe', label: 'Wireframe', group: 'Draw', on: false },
  { id: 'untextured', label: 'Untextured highlight', group: 'Draw', on: false },
  { id: 'collision', label: 'Collision hull', group: 'Overlays', on: false },
  { id: 'grid', label: 'Map grid', group: 'Overlays', on: false },
  { id: 'spawns', label: 'Gizmos', group: 'Overlays', on: true },
  { id: 'fog', label: 'Fog', group: 'World', on: true },
  { id: 'shadows', label: 'Drop shadows', group: 'World', on: true },
  { id: 'detail', label: 'Detail textures', group: 'World', on: true },
  { id: 'billboards', label: 'Billboards', group: 'World', on: true },
  { id: 'alternate', label: 'Alternate states', group: 'World', on: false },
  { id: 'blendgraded', label: 'Graded alpha blend', group: 'World', on: true },
  { id: 'engineorder', label: 'Engine draw order', group: 'World', on: false },
  { id: 'ps2', label: 'PS2 picture (640×448)', group: 'Picture', on: false },
] as const;
type ViewToggle = (typeof VIEW_TOGGLES)[number]['id'];

/**
 * FUI-3 (PAD-6, PAD-11; browser adaptations, FG.R2 -- the game has no editor): the START menu's Props grid (its columns,
 * a page of cells L1 / R1 jump, the recent props it keeps) and the ladders its Grid step and Turn step rows step through
 * (inside the dock's own bounds, `./placement` GRID_STEP_MIN..MAX and TURN_STEP_MIN..MAX; the defaults 25 and 15 on them).
 */
const PROPS_COLUMNS = 3;
const PROPS_PAGE = 12;
const PROPS_RECENT_MAX = 12;
const GRID_STEP_LADDER = [1, 5, 10, 25, 50, 100, 250, 500] as const;
const TURN_STEP_LADDER = [1, 5, 15, 30, 45, 90, 180] as const;
/**
 * FUI-22 (D4; a browser adaptation's own values): the wheel's travel that counts as one notch (CSS pixels; a mouse
 * wheel's notch is about 100, a trackpad's deltas add up to it), and a line's worth where the browser counts in lines.
 */
const WHEEL_NOTCH_PX = 50;
const WHEEL_LINE_PX = 40;

/** Small line icons, the forge's own drawing on a 24 grid (no third-party set). */
const ICON: Record<string, string> = {
  select: '<path d="M5 3l14 8-6 2-2 6z"/>',
  place: '<path d="M12 3v18M3 12h18"/><circle cx="12" cy="12" r="4"/>',
  spawn: '<path d="M6 21V4h10l-2 4 2 4H6"/>',
  npc: '<circle cx="12" cy="5" r="2.5"/><path d="M12 8v7M8 11h8M12 15l-3 6M12 15l3 6"/>',
  move: '<path d="M12 2v20M2 12h20M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3"/>',
  camera: '<path d="M4 7h4l2-2h4l2 2h4v12H4z"/><circle cx="12" cy="13" r="4"/>',
  povPerspective: '<path d="M12 3 21 8v8l-9 5-9-5V8zM12 3v10m9-5-9 5-9-5m9 5v8"/>',
  povTop: '<path d="M4 5h16v14H4zM8 9h8v6H8z"/><path d="m12 7 2 2-2 2-2-2z"/>',
  povBottom: '<path d="M4 5h16v14H4zM8 9h8v6H8z"/><path d="m12 17-2-2 2-2 2 2z"/>',
  povLeft: '<path d="M5 4h14v16H5zM9 8h6v8H9z"/><path d="m7 12 2-2v4z"/>',
  povRight: '<path d="M5 4h14v16H5zM9 8h6v8H9z"/><path d="m17 12-2 2v-4z"/>',
  povFront: '<path d="M5 4h14v16H5zM8 7h8v10H8z"/><circle cx="12" cy="12" r="2"/>',
  povBack: '<path d="M5 4h14v16H5zM8 7h8v10H8z"/><path d="M10 10h4v4h-4z"/>',
  turn: '<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v4h-4"/>',
  scale: '<path d="M4 10V4h6M20 14v6h-6M4 4l7 7M20 20l-7-7"/><rect x="10" y="10" width="4" height="4"/>',
  snap: '<path d="M4 4h4v4H4zM16 4h4v4h-4zM4 16h4v4H4zM16 16h4v4h-4zM8 6h8M8 18h8M6 8v8M18 8v8"/>',
  billboard: '<circle cx="12" cy="9" r="6"/><path d="M12 15v6M9 21h6"/><path d="M10 9h4"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  copy: '<rect x="8" y="8" width="12" height="12"/><path d="M4 16V4h12"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  open: '<path d="M3 6h7l2 2h9v11H3z"/>',
  save: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  file: '<path d="M6 3h9l3 3v15H6z"/><path d="M9 12h6M9 16h6"/>',
  star: '<path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.3-5.5-3-5.5 3 1-6.3L3 9.7l6.2-.9z"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  stop: '<rect x="6" y="6" width="12" height="12"/>',
  dock: '<rect x="3" y="4" width="18" height="16"/><path d="M8 4v16M16 4v16"/>',
  reset: '<path d="M3 11a9 9 0 1 1 2.64 6.36"/><path d="M3 4v7h7"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>',
  lobby: '<circle cx="8" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><path d="M2 20c0-4 3-6 6-6s6 2 6 6M10 20c0-4 3-6 6-6s6 2 6 6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01"/>',
  bomb: '<circle cx="12" cy="14" r="6"/><path d="M16 10l3-3M17 5h3v3"/>',
  check: '<path d="M4 12l5 5L20 6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  view: '<rect x="3" y="4" width="8" height="7" rx="1"/><rect x="13" y="4" width="8" height="7" rx="1"/><rect x="3" y="13" width="8" height="7" rx="1"/><path d="m15 15 3 3 3-3"/>',
  listView: '<path d="M4 6h.01M4 12h.01M4 18h.01M9 6h11M9 12h11M9 18h11"/>',
  gridView: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
};
/**
 * The mouse's look, asked inline rather than through `../pointer`'s `requestLock` (an import of that module from this
 * chunk made it a chunk of its own). OT.R38 made it a development build's; OT.R68 (the owner, 2026-10-21: keyboard and
 * mouse for everything in the forge's creation UI) makes it the forge editor's in every build -- a right-click, or the
 * Walk -- never a match's (`../matchMount` keeps its own gate). A browser adaptation.
 */
const lockMouse = (el: HTMLCanvasElement): void => {
  try {
    const r = (el as { requestPointerLock?: () => unknown }).requestPointerLock?.();
    if (r instanceof Promise) r.catch(() => undefined);              // a refused lock is not an uncaught rejection
  } catch { /* no lock: the page keeps its pointer */ }
};
/** A key's name in a tooltip (OT.R68: the forge's editor reads the keyboard in every build). */
const key = (k: string): string => ` · ${k}`;
const icon = (name: string): string => `<svg class="fx-ico" viewBox="0 0 24 24" aria-hidden="true">${ICON[name] ?? ''}</svg>`;
/**
 * A kind's billboard as an icon (`./mapDataBillboards` `MAP_DATA_MARKS`): its letter on its colour, round for the map's
 * own data and square for the user's placements -- the mark the viewport draws, in the toolbar and the Outliner too.
 */
const markBadge = (kind: string): string => {
  const m = MAP_DATA_MARKS[kind];
  if (!m) return icon('place');
  return `<span class="fx-billboard-icon${m.shape === 'square' ? ' is-square' : ''}" aria-hidden="true" style="background:${m.colour}">${m.glyph}</span>`;
};

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = doc.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

/** The page's store (`../pageStore` `pageSettings`): its rules on a private window and the quota; the keys its inventory names. */
const readKey = (key: string): string | null => pageSettings.get(key);
const writeKey = (key: string, text: string): void => { pageSettings.set(key, text); };

/** FG-26: the forge lobby this page is in. */
interface LobbyHere {
  id: string;
  name: string;
  role: 'host' | 'joiner';
  /**
   * The create's host ticket (the host's page only), in memory only (FG.R21); dropped once a told lobby names another
   * seat as host (the FG-48 re-review's F1, `./lobbyPage` `forgetStaleHost`).
   */
  hostTicket: string | null;
  /**
   * The ticket the hello carried: the login's (the launcher's session, FG.R11), a guest's pass (FG-38, FG-28's: memory
   * only, never a bearer of the page's other calls), or null (a server without accounts: FG.R21's lobby seat).
   */
  ticket: string | null;
  /** FG-38: the seat is a guest's (no sign-in): its ticket, if any, is a guest's pass. */
  guest: boolean;
  /** FG-45: whether the lobby shows in the modern UI's Custom matches (the server's last answer; the host's to change). */
  listed: boolean;
  /** FG-48a: whether the lobby asks a password (the server's last answer; the host's to change). Never the password. */
  locked: boolean;
  layout: Layout;
  lateJoiner: boolean;
  pinned: PinnedSocketUrl;
  session: ForgeLobbySession;
  /** The window, or null once the match took the seat. */
  popup: ForgeLobby | null;
  painter: { dispose(): void };
  shown: boolean;
  /** The lobby closed or the seat ended: the window stays with its notice until closed. */
  ended: boolean;
}

/**
 * R4 (the UI seat's rulings to dot, 2026-10-25 11:34Z and 11:41Z; a browser adaptation, FG.R2): what the page owns for
 * its whole lifetime and hands a panel that asks -- the one local packs instance (`../agent/localPacks`), which the
 * agent's dock (its target's pack operations) and the Local files panel (its file staging; FUI-22) share. The page disposes it at
 * its teardown; a panel never does.
 */
export interface ForgePageServices {
  readonly packs: LocalPackApi;
}

/**
 * A panel `mountForge` registers: one built, a promise for one loaded beside the page (the agent dock's), or (R4) a
 * function of the page's services (`ForgePageServices`), called once the editor's facade is up.
 */
export type ForgePanelSource = ForgePanel | Promise<ForgePanel> | ((page: ForgePageServices) => ForgePanel | Promise<ForgePanel>);

/** FUI-1: what `mountForge` takes beside the document (a browser adaptation, FG.R2). */
export interface MountForgeOptions {
  onAgentReady?: (api: ForgeAgentApi) => void;
  /** Panels registered once the editor's facade is up (`ForgePanelSource`). */
  panels?: readonly ForgePanelSource[];
  /**
   * R4: the page's local packs, made once from the editor's facade (a test's stand-in); absent, the browser's own
   * (`createLocalPackApi` over the forge's map drivers, `../agent/forgePacks`).
   */
  localPacks?: (forge: ForgeAgentApi) => LocalPackApi;
  /**
   * R3-B (FUI-14/16's minimum; a browser adaptation): the creator packs this device holds, each by its identity (the
   * registry's, FCW-06/08, once it is mounted). Absent: none, so every pack a layout requires is missing here -- the
   * layout still opens and edits whole; Play and Create lobby wait for them.
   */
  availablePacks?: () => readonly PackRef[];
  /**
   * FCW-32 round 2 (the review's F2; rules spec §7): the rules packs installed on this device, each its reference and its
   * spec, offered to the layout's mode catalogue beside its own draft (`./rulesAuthoring` `forgeLayoutModes`): the agent's
   * mode list, its checks and `rules.test`, and Play. Absent: none -- the registry publishes no rules member yet (FCW-35).
   */
  installedRules?: () => readonly InstalledRulesPack[];
  /**
   * R6 (3, 7): where the page reads a creator pack's content (`ForgeContentSource`); absent, `NO_CONTENT_SOURCE` -- the
   * page-lifetime local packs (FCW-06's registry) expose no member read yet, so nothing resolves and every pack piece is
   * the stand-in, listed by the Check, as before.
   */
  content?: ForgeContentSource;
}

/**
 * R6 (3, 7; product track, a browser adaptation with no original): what the page reads a creator pack's content through.
 * `asset` answers a prop's definition (FCW-09, `../packs/content/assets`) or null when its pack or the asset is not here
 * (the resolver `layoutGround`, `composeMatchMap` and `loadContentMap` are given); `member` a pack member's bytes (the
 * GLB a definition's visual names) or null; `map` an authored map's member JSON (`loadContentBase`'s `readMap`) or null.
 */
export interface ForgeContentSource {
  asset(ref: ContentRef): AssetDefinition | null;
  member(pack: PackRef, path: string): Uint8Array | null | Promise<Uint8Array | null>;
  map(ref: ContentRef): unknown;
  /**
   * FP-6 item 1 (FP.R4): the installed packs' content maps, each by reference with its own name (FP-5's
   * `RegistryContentSource.mapIndex`), for the base list's Custom Maps group. Absent: none.
   */
  mapIndex?(): readonly { ref: ContentRef; name: string }[];
  /** FP-6 item 1 (FP.R12): the custom maps MODS keeps (`../packs/customMaps`), each a read-only base. Absent: none. */
  customMaps?(): readonly CustomMapRecord[];
  /**
   * FP-6 (the coordinator's FP-5 fold note): settles once each pack's JSON members (its asset definitions) are read
   * (FP-5's `RegistryContentSource.ready`, its list form since 237de657d). The page awaits it with every pack a chosen
   * custom base or save requires before it builds the pieces, so a pack piece is never a stand-in only because its
   * definition was not read yet. Absent: nothing to wait for.
   */
  ready?(packs: PackRef | readonly PackRef[]): Promise<void>;
}
/**
 * R6: the page's content source until the registry publishes its members -- FCW-06's `LocalPackApi` (`../packs/registry`)
 * lists, stages, imports and removes, but reads no member and resolves no reference, so nothing resolves here: a pack
 * piece stays the stand-in, a content base is refused in words.
 */
export const NO_CONTENT_SOURCE: ForgeContentSource = Object.freeze({ asset: () => null, member: () => null, map: () => null });
/** R6 (7): the loading line's words for an authored map's load stages (`../packs/content/map` `ContentLoadStage`). */
const CONTENT_STAGE_WORDS: Readonly<Record<ContentLoadStage, string>> = Object.freeze({
  validating: 'Checking the authored map', dependencies: 'Reading the packs it uses', collision: 'Building its hull',
  navigation: 'Building its navigation', objectives: 'Placing its objectives', ready: 'Ready',
});
const CONTENT_STAGES: readonly ContentLoadStage[] = ['validating', 'dependencies', 'collision', 'navigation', 'objectives', 'ready'];
/**
 * R6 fix-up: the base select's one row for an authored map (a content base), disabled (never chosen). R7-4 (round 6's
 * finding): its value names the map, `content:<pack id>@<version>/<map id>` (the facade's `status().map` words), so the
 * select's value is the base's own while it is open and any other row chosen from it asks as a base change does.
 */
const CONTENT_BASE_ROW = 'content';
const contentBaseValue = (b: ContentLayoutBase): string => `content:${b.ref.id}@${b.ref.version}/${b.mapId}`;
/**
 * R7-2: the renderer's seams for the page's extension host (`../visualPostSeam` `visualPostSeams`, claimed once per
 * renderer; the page makes its own renderer at each mount). A renderer that bound no seam -- a test's stand-in for
 * `createRenderer` -- gives none: the host still publishes its catalogue, and a claim on the slot is refused
 * (`pack.SEAM_MISSING`), as a host given no seam refuses it.
 */
function rendererSeams(renderer: ViewerRenderer): Partial<VisualPostSeams> {
  // R7 fix-up (the review's finding 3): only a renderer that BOUND no seam gives none; a seam already claimed by
  // another host is the loud failure it should be.
  try { return visualPostSeams(renderer); } catch (e) {
    if (e instanceof Error && /claimed no visual post seam/.test(e.message)) return {};
    throw e;
  }
}
/** R6 (7): the words of a content base whose pack is not here: the open is refused with them. */
export const contentBaseRefusal = (b: ContentLayoutBase): string =>
  `This layout needs pack ${b.ref.id}@${b.ref.version} (its authored map ${b.mapId}), which is not here`;
/**
 * R6 (3): the drawn stand-in for a resolved pack piece whose GLB will not read -- its bounds as a wireframe box, in game
 * units. An adaptation (the forge's own look, no original), so the piece stays pickable and its hull stays where it is.
 */
const CONTENT_STANDIN_COLOUR_ADAPTATION = 0xc4a226;
/**
 * LATER 456 (product track, a Forge adaptation with no original -- the original has no content props): whether Play's
 * match draws the layout's content props. A solid pack prop is in Play's hull either way (`composeMatchMap`'s
 * `resolveContent`); the owner's call, H336, between two readings, answered yes by the owner 2026-10-26: (a) drawn --
 * Play shows each content prop where its hull is (`./match` `contentPropsGroup`, the match mount's `extraWorld`), on.
 * (b) not drawn -- the content props editor-only, as before -- is kept as the record of the alternative: off, Play's
 * mount is not given the option at all. The retail match never is.
 */
export const FORGE_PLAY_CONTENT_PROPS_ADAPTATION = true;
/** LATER 456: the flag as `startMatch` reads it -- through this getter, so a test can turn it on (`vi.spyOn(..., 'drawn')`). */
export const forgePlayContentProps = { drawn: (): boolean => FORGE_PLAY_CONTENT_PROPS_ADAPTATION };

/**
 * The starters' placement check on the page (FCW-03; a browser adaptation, no original): one catalogue over the loaded
 * palettes, checked against the ORIGINAL replacement base (`source`) plus the prior proposed hulls -- never the editor's
 * current pieces, which the import replaces. `checkPlacement` answers what `StarterContext.checkPlacement` answers, for
 * the assets the caller read from `catalogue` (`queryCreatorAssets`); the page's own `starterContext` is its one caller.
 */
export function starterPlacementChecks(source: LoadedMap | null, maps: readonly LoadedMap[], revision: () => number): {
  catalogue: ReturnType<typeof createCreatorCatalogue>;
  checkPlacement(assets: readonly CreatorAsset[], ref: string, transform: { at: Vec3; yaw?: number }, prior: readonly PieceRow[], ids: readonly string[]):
    { revision: number; diagnostics: { code: string; evidence: string; message: string; ref?: string }[] };
} {
  let previewGrid: Grid | null = source?.ground ? groundGrid(source.ground) : null;
  let obstacles: { ref: string; bounds: { min: Vec3; max: Vec3 } }[] = [];
  const catalogue = createCreatorCatalogue({ revision, maps: () => maps, grid: () => previewGrid, obstacles: () => obstacles });
  return { catalogue, checkPlacement(assets, ref, transform, prior, ids) {
    const hulls: PieceHull[] = [];
    obstacles = [];
    for (const [index, row] of prior.entries()) {
      const asset = assets.find((a) => a.asset === ids[row[0]]), parsed = asset ? parseAssetId(asset.asset) : null;
      const map = parsed ? maps.find((m) => m.archive === parsed.archive) : null;
      const polys = map && parsed ? prototypePolygons(map, parsed.model) : null;
      if (!asset || !polys?.length) throw new ForgeAgentError('REQUIREMENTS_UNMET', 'A prior proposed piece lost its actual collision hull.');
      const matrix = new Matrix4().makeRotationY(row[4] * Math.PI / 180).setPosition(row[1], row[2], row[3]);
      hulls.push({ owner: `starter:${index}`, polys, m: matrix.elements });
      if (asset.bounds) {
        const box = new Box3(new Vector3(...asset.bounds.min), new Vector3(...asset.bounds.max)).applyMatrix4(matrix);
        obstacles.push({ ref: `piece:${index}`, bounds: { min: box.min.toArray() as Vec3, max: box.max.toArray() as Vec3 } });
      }
    }
    previewGrid = source?.ground ? groundGrid(layoutGround(source.ground, hulls)) : null;
    // R3-B (dot's 6236 preservation, ca259f89a): the recipe is serialized -- its rows on the record's lattice
    // (RECORD_POSITION_DENOMINATOR) -- so the prior hulls are earlier pieces rounded into the same record.
    const checked = catalogue.checkPlacement(ref, transform, { positionEncoding: 'record-v2', supportOwners: hulls.map((h) => h.owner) });
    const hard = checked.diagnostics.filter((d) => !['TRAVERSABILITY_UNVERIFIED', 'BOUNDS_OVERLAP'].includes(d.code));
    const diagnostics = checked.diagnostics.filter((d) => d.code !== 'TRAVERSABILITY_UNVERIFIED' && (d.code !== 'BOUNDS_OVERLAP' || hard.length > 0 || checked.probes === 0));
    if (checked.omittedDiagnostics) diagnostics.push({ code: 'DIAGNOSTICS_LIMIT', evidence: 'incomplete-diagnostics', message: 'Placement diagnostics were truncated; this preview is blocked.' });
    return { revision: checked.revision, diagnostics };
  } };
}

/** FUI-3: each mounted Forge's START menu sections, by the shell `mountForge` handed back (`registerMenuSection`). */
const MENU_SECTIONS = new WeakMap<ForgeShell, MenuSections<ForgePageContext>>();

/**
 * FUI-3 (a browser adaptation, FG.R2): a feature's own START menu section on a mounted Forge (`./padMenu`
 * `MenuSectionSpec`: its rows asked of the page's context at each draw), drawn beside the shell's Panels section; the
 * return lets it go. A second section of one id is refused, as is a built-in section's id (R3-A, `./padMenu`
 * `FORGE_MENU_SECTIONS`); a shell `mountForge` did not hand back is refused.
 */
export function registerMenuSection(shell: ForgeShell, spec: MenuSectionSpec<ForgePageContext>): () => void {
  const sections = MENU_SECTIONS.get(shell);
  if (!sections) throw new Error(`${spec.id}: not a mounted Forge's shell`);
  return sections.register(spec);
}

/** The Forge's page, and its panel registry (`./shell/panel`, FUI-1): `register`, `unregister`, `dispose`; FUI-3: `registerMenuSection`. */
/**
 * "Start a new layout?": what the confirm says before the layout is dropped, or null when nothing would be lost (no
 * piece, no rules, no zone, marker or spawner). FCW-32: a layout's rules and its entities are work too -- asked about as
 * pieces are (91's box run of forgeRules.spec found a layout holding only rules dropped without a word); only pieces, the
 * words as they were.
 */
export function newLayoutDropWords(pieces: number, rules: boolean, entities: number): string | null {
  if (pieces === 0 && !rules && entities === 0) return null;
  const dropped = !rules && entities === 0 ? 'The pieces placed now are dropped.'
    : 'The pieces, rules, zones, markers and spawners now in the layout are dropped.';
  return `${dropped} Save first to keep them.`;
}

/** Each tool's name as the page says it (the status line, the pad's pop, the help card's key rows: `forgeToolKeyHelp`). */
const TOOL_NAMES: Record<Mode, string> = { select: 'Select', place: 'Place', spawnA: 'Spawn SEAL', spawnB: 'Spawn Terrorist', respawnA: 'Respawn SEAL', respawnB: 'Respawn Terrorist', npc: 'NPC', hostage: 'Hostage', zone: 'Extraction zone', turret: 'Turret', door: 'Door', gate: 'Gate', barrier: 'C4 barrier', ladder: 'Ladder', flare: 'Flare', point: 'Tactical point', view: 'Spectator view', bomb: 'Bomb', siteSeal: 'Site SEAL', siteTerrorist: 'Site Terrorist' };

export async function mountForge(doc: Document = document, options?: MountForgeOptions): Promise<ForgeShell> {
  const held: { shell?: ForgeShell } = {};
  await mountForgePage(doc, options, (shell) => { held.shell = shell; });
  if (!held.shell) throw new Error('The Forge did not mount its docks');
  return held.shell;
}

async function mountForgePage(doc: Document, options: MountForgeOptions | undefined, onShell: (shell: ForgeShell) => void): Promise<void> {
  doc.title = 'Forge -- SOCOM II Legacy (experiment)';
  for (const e of Array.from(doc.body.children)) e.remove();
  doc.body.className = 'forge-page';
  scrubAllNumbers(doc.body);                                 // every number field drags to change (`./scrub`), as the transform's

  /* ================= the markup ================= */
  const tool = (name: string, label: string, title: string, cls = ''): HTMLButtonElement => {
    const b = el(doc, 'button', `fx-tool ${cls}`.trim());
    b.type = 'button';
    b.innerHTML = `${icon(name)}<span>${label}</span>`;
    b.title = title;
    return b;
  };
  const group = (...kids: HTMLElement[]): HTMLDivElement => { const g = el(doc, 'div', 'fx-group'); g.append(...kids); return g; };
  /**
   * R7-1 (the rendered pass 2: the row 1491 px at 1440; the UI seat's ruling, product track): a right-hand tool whose
   * label repeats its icon is drawn as its icon at every width (`.fx-tool--icon`); its label stays its text and becomes
   * its aria-label, its title unchanged, so a reader, the pad's words and the tests still name it.
   */
  const iconOnly = (b: HTMLButtonElement, label: string): HTMLButtonElement => {
    b.classList.add('fx-tool--icon');
    b.setAttribute('aria-label', label);
    return b;
  };

  // The toolbar.
  const top = el(doc, 'header', 'fx-top');
  top.setAttribute('data-mu-top-bar', '');               // the overlay's touch Menu keeps clear of it (`TOUCH_MENU_BAR_SELECTOR`)
  const home = el(doc, 'a', 'fx-home');
  home.href = import.meta.env.BASE_URL;
  home.title = 'Back to the launcher';
  home.innerHTML = `${icon('back')}`;
  const brand = el(doc, 'div', 'fx-brand');
  brand.append(el(doc, 'span', 'fx-logo', 'FORGE'), el(doc, 'span', 'fx-badge', 'EXPERIMENT'));
  const baseSel = el(doc, 'select', 'fx-select');
  baseSel.title = 'The base: a map’s world, or a blank floor';
  const newBtn = tool('file', 'New', 'Start a new layout: a preset or a map as its base');
  const openBtn = tool('open', 'Open', 'Open a layout file');
  const saveBtn = tool('save', 'Saves', 'Named layouts in this browser, a file, or a share link');
  saveBtn.dataset['forge'] = 'saves';
  // R6 (the rendered pass's R4, the UI seat's ruling of 2026-10-25 17:44Z): no Starters button -- it pushed the toolbar
  // past 1440 px and Duplicate past 1024. The Starter experiences panel stays reachable from START > Panels and its dock.
  const saveMapBtn = iconOnly(tool('save', 'Save map', 'Keep this lobby’s map in this browser’s saves'), 'Save map');
  saveMapBtn.hidden = true;
  saveMapBtn.dataset['forge'] = 'save-map';
  const file = el(doc, 'input');
  file.type = 'file';
  file.accept = '.json,application/json';
  file.hidden = true;
  const modeBtns: Record<Mode, HTMLButtonElement> = {
    select: tool('select', 'Select', 'Select'),
    place: tool('place', 'Place', 'Place the chosen prop'),
    spawnA: tool('spawn', 'Spawn SEAL', 'Place a team A spawn (SEALs)', 'fx-team-a'),
    spawnB: tool('spawn', 'Spawn Terrorist', 'Place a team B spawn (Terrorists)', 'fx-team-b'),
    respawnA: tool('spawn', 'Respawn SEAL', "Place a team A respawn point (SEALs): where the SEALs respawn, beside the map's own", 'fx-team-a'),
    respawnB: tool('spawn', 'Respawn Terrorist', "Place a team B respawn point (Terrorists): where the Terrorists respawn, beside the map's own", 'fx-team-b'),
    npc: tool('npc', 'NPC', 'Place an NPC: the character chosen under Characters'),
    door: tool('npc', 'Door', "Place a door: a copy of a disc map's own (the palette's, or Frostfire's), its hinge at the click"),
    gate: tool('npc', 'Gate', "Place a gate: a copy of a disc map's own (Death Trap's or Enowapi's), its lever prompt at the gate; it slides on its lever and C4 wrecks it"),
    barrier: tool('npc', 'C4 barrier', "Place a C4 barrier: a context action, a copy of a disc map's own access barrier (the palette's, or Vigilance's), that C4 or an RPG wrecks"),
    ladder: tool('npc', 'Ladder', "Place a ladder: a disc map's own ladder prop (the palette's, or Sandstorm's ladder35), its foot at the click, facing the way you look"),
    flare: tool('npc', 'Flare', "Place a flare: a copy of one of a disc map's glows (a facade node alone, not the lamp it hangs on), turned to the camera as the game turns it"),
    turret: tool('npc', 'Turret', "Place a turret: a copy of a disc map's own (the palette's, or Crossroads'), facing the way you look"),
    point: tool('npc', 'Point', 'Place a tactical point (Charlie, Delta...): a nav point on the compass, beside the map\'s own'),
    view: tool('npc', 'View', 'Place a spectator view: a click takes the camera\'s place and look, beside the map\'s own'),
    zone: tool('npc', 'Zone', 'Place an extraction zone (Safety, Safety2...): Extraction plays them, beside the map\'s own'),
    hostage: tool('npc', 'Hostage', 'Place a hostage: Escort and Extraction play them, beside the map\'s own'),
    bomb: tool('bomb', 'Bomb', "Place the bomb's start", 'fx-bomb'),
    siteSeal: tool('bomb', 'Site SEAL', 'Place the site the SEALs plant at', 'fx-side-seal'),
    siteTerrorist: tool('bomb', 'Site Terrorist', 'Place the site the Terrorists plant at', 'fx-side-terrorist'),
  };
  // Each tool's key in its tooltip (`./keys` `forgeToolKeyLabel`: Q, then the number keys in the tools row's order).
  for (const [m, b] of Object.entries(modeBtns)) { const k = forgeToolKeyLabel(m); if (k) b.title += key(k); }
  // The tools that place a spawn or a bomb marker wear that placement's billboard (`markBadge`), as its mark and its row do.
  for (const [mode, kind] of [['spawnA', 'userSpawnA'], ['spawnB', 'userSpawnB'], ['respawnA', 'userRespawnA'], ['respawnB', 'userRespawnB'], ['npc', 'userNpcs'], ['hostage', 'userEscortees'], ['zone', 'userTacZones'], ['turret', 'userTurrets'], ['door', 'userDoors'], ['ladder', 'userLadders'], ['flare', 'userFlares'], ['gate', 'userGates'], ['barrier', 'userBarriers'], ['point', 'userTacPoints'], ['view', 'userScenicViews'], ['bomb', 'userBombStart'], ['siteSeal', 'userSiteSeal'],
    ['siteTerrorist', 'userSiteTerrorist']] as const) {
    modeBtns[mode].querySelector('svg.fx-ico')?.insertAdjacentHTML('beforebegin', markBadge(kind));
    modeBtns[mode].querySelector('svg.fx-ico')?.remove();
  }
  /**
   * The Select tool's settings (a browser adaptation, FG.R2): a gear inside the Select button opens them (as does the
   * button's context menu -- a right-click, or the keyboard's menu key), in a popup under the button. A body-level popup:
   * the toolbar scrolls sideways and would clip it.
   */
  const selectGear = el(doc, 'span', 'fx-tool-gear');
  selectGear.innerHTML = icon('gear');
  selectGear.title = 'Select settings';
  selectGear.setAttribute('aria-hidden', 'true');
  modeBtns.select.append(selectGear);
  modeBtns.select.title = `Select${key('Q')} · the gear (or a right-click): its settings`;
  const selectSettings = el(doc, 'div', 'fx-tool-popup');
  selectSettings.id = 'fx-select-settings';
  selectSettings.setAttribute('role', 'dialog');
  selectSettings.setAttribute('aria-label', 'Select settings');
  selectSettings.hidden = true;
  /** A switch row as the View panel draws its toggles (`.fx-toggle`): the input and its word. */
  const selectToggle = (setting: string, label: string, title: string): HTMLInputElement => {
    const row = el(doc, 'label', 'fx-toggle');
    const i = el(doc, 'input');
    i.type = 'checkbox';
    i.dataset['forgeSetting'] = setting;
    row.title = title;
    row.append(i, el(doc, 'span', '', label));
    selectSettings.append(row);
    return i;
  };
  selectSettings.append(el(doc, 'div', 'fx-tool-popup-title', 'Select'));
  const selectMapPropsIn = selectToggle('selectMapProps', 'Select map props',
    'A click or a selection box picks the base map’s own props; off, they are passed over (the Outliner still selects them)');
  const selectUserPropsIn = selectToggle('selectUserProps', 'Select user props',
    'A click or a selection box picks your placements; off, they are passed over (the Outliner still selects them)');
  selectSettings.append(el(doc, 'div', 'fx-tool-popup-note', 'Off, a click looks through them to what is behind; the Outliner selects either.'));
  const moveBtn = tool('move', 'Move', `Move with the gizmo${key('W')}`);
  const turnBtn = tool('turn', 'Rotate', `Rotate with the gizmo${key('E')}`);
  const scaleBtn = tool('scale', 'Scale', `Scale with the gizmo (not wired yet)${key('R')}`);
  scaleBtn.hidden = FORGE_TRANSFORM_STUBS_HIDDEN_ADAPTATION;    // FC-1: a stub, hidden (`./transformStubs`)
  // Snap left the toolbar: the viewport's snap settings hold it (`drawPlacement`); G and the pad's L3 still turn it on and off.
  const dupBtn = tool('copy', '', `Duplicate · pad □${key('C')}`);
  const delBtn = tool('trash', '', `Delete · pad △${key('Del')}`);
  const docksBtn = iconOnly(tool('dock', 'Docks', `Show or hide the docks${key('H')}`), 'Docks');
  const resetLayoutBtn = iconOnly(tool('reset', 'Reset layout', 'Restore the default dock layout and panel sizes'), 'Reset layout');
  resetLayoutBtn.dataset['forge'] = 'reset-layout';
  // The pad's buttons as `./pad` maps them: SELECT tapped undoes, held redoes (L2 / R2 are the fly's down / up).
  const undoBtn = tool('undo', '', `Undo · pad SELECT${key('Ctrl+Z')}`);
  const redoBtn = tool('redo', '', `Redo · pad hold SELECT${key('Ctrl+Y')}`);
  undoBtn.dataset['forge'] = 'undo';                         // FUI-6: a stable hook; the titles name the step (`refreshUndo`)
  redoBtn.dataset['forge'] = 'redo';
  const helpBtn = iconOnly(tool('help', 'Controls', 'Controls'), 'Controls');
  // LATER 230 (the merge controller's product-track call, 2026-10-21): the menu's way in for a pointer, a release build's
  // too (no keys there): at the toolbar's left, on screen at every width without a scroll; START's on a pad.
  const menuBtn = tool('menu', '', 'The forge menu \u00b7 pad START');
  menuBtn.dataset['forge'] = 'menu';
  menuBtn.setAttribute('aria-expanded', 'false');
  const walkBtn = iconOnly(tool('spawn', 'Walk', 'Walk the layout on foot, without the match'), 'Walk');
  // FG-26 (FG.R17, FG.R22): this layout as a lobby on the server; once one is open, the lobby window's open and close.
  const checkBtn = iconOnly(tool('check', 'Check', 'Check the map: spawns, pieces, missing assets, the piece budget'), 'Check');
  const lobbyBtn = iconOnly(tool('lobby', 'Create lobby', 'Make a lobby of this layout on the server: others join from its link'), 'Create lobby');
  checkBtn.dataset['forge'] = 'check';                         // R3-B (FUI-13): stable test hooks
  lobbyBtn.dataset['forge'] = 'lobby';
  const playBtn = el(doc, 'button', 'fx-play');
  playBtn.type = 'button';
  // FUI-3 (PAD-5): START opens the menu, whose first row is Play; the title no longer sends a pad to START.
  playBtn.title = `Play the layout: an offline match${key('P')} · the gear (or a right-click): its settings`;
  /**
   * The Play settings (a browser adaptation, FG.R2; no original -- the game's own rounds stand a player on a slot): a gear
   * inside the Play button, a popup under it, as the Select tool's. Where round 1 stands the player -- the floor under
   * the camera (FG-50's), or one of its side's spawns at random -- and which side it plays.
   */
  const playGear = el(doc, 'span', 'fx-tool-gear');
  playGear.innerHTML = icon('gear');
  playGear.title = 'Play settings';
  playGear.setAttribute('aria-hidden', 'true');
  const playSettings = el(doc, 'div', 'fx-tool-popup');
  playSettings.id = 'fx-play-settings';
  playSettings.setAttribute('role', 'dialog');
  playSettings.setAttribute('aria-label', 'Play settings');
  playSettings.hidden = true;
  /** A choice row: its word, then a select of `options` ([value, word]). */
  const playChoice = (setting: string, label: string, title: string, options: readonly (readonly [string, string])[]): HTMLSelectElement => {
    const row = el(doc, 'label', 'fx-tool-popup-row');
    row.title = title;
    const sel = el(doc, 'select', 'fx-select');
    sel.dataset['forgeSetting'] = setting;
    for (const [value, word] of options) { const o = el(doc, 'option', '', word); o.value = value; sel.append(o); }
    row.append(el(doc, 'span', '', label), sel);
    playSettings.append(row);
    return sel;
  };
  playSettings.append(el(doc, 'div', 'fx-tool-popup-title', 'Play'));
  const playSpawnIn = playChoice('playSpawn', 'Spawn at', 'Where round 1 stands you: the floor under the camera, or one of your side’s spawns at random',
    [['camera', 'Camera location'], ['random', 'Random spawn']]);
  const playSideIn = playChoice('playSide', 'Spawn as', 'The side you play; Auto takes the side the NPCs leave you',
    [['auto', 'Auto (from the NPCs)'], ['seal', 'SEAL'], ['terrorist', 'Terrorist']]);
  playSettings.append(el(doc, 'div', 'fx-tool-popup-note', 'Random draws from your placed spawns, or the map’s spawn slots where you placed none.'));
  const layoutNameIn = el(doc, 'input', 'fx-search fx-name');
  layoutNameIn.type = 'text';
  layoutNameIn.maxLength = LAYOUT_NAME_MAX;
  layoutNameIn.placeholder = 'Untitled layout';
  layoutNameIn.setAttribute('aria-label', 'Layout name');
  // The layout's name, shown not typed (the owner, 2026-11-06): Saves' Save as names it, and a file opened brings its own.
  layoutNameIn.readOnly = true;
  layoutNameIn.tabIndex = -1;
  layoutNameIn.title = 'The layout’s name: Saves › Save as names it';
  const baseAsk = el(doc, 'span', 'fx-base-ask');
  baseAsk.hidden = true;
  const baseApply = el(doc, 'button', 'fx-tool fx-primary', 'Apply');
  const baseCancel = el(doc, 'button', 'fx-tool', 'Cancel');
  baseApply.type = 'button';
  baseCancel.type = 'button';
  baseAsk.append(el(doc, 'span', '', 'New layout on this base?'), baseApply, baseCancel);
  // R7-1: the base group's select and layout name shrink to their floors as the row's own items (`.fx-group--base`,
  // `display: contents`), and Walk sits with Check and Create lobby -- the row's natural width at most 1260 px.
  // No base list on the toolbar (the owner, 2026-11-06): New asks for the base (`chooseNewBase`). `baseSel` stays, off
  // the page, the list of bases New offers and the row the current base answers to (`baseValue`).
  const baseGroup = group(newBtn, openBtn, saveBtn, layoutNameIn, file);   // Saves beside Open (the owner, 2026-11-06)
  baseGroup.classList.add('fx-group--base');
  top.append(
    home, brand,
    group(menuBtn),
    baseGroup,
    (() => { const g = group(modeBtns.select, modeBtns.place); g.classList.add('fx-group--modes'); return g; })(),
    group(dupBtn, delBtn),
    group(undoBtn, redoBtn),
    el(doc, 'div', 'fx-spacer'),
    group(helpBtn, docksBtn, resetLayoutBtn),
    group(walkBtn, checkBtn, lobbyBtn, saveMapBtn),
    playBtn,
  );

  // The assets dock.
  const left = el(doc, 'aside', 'fx-dock fx-left');
  const paletteSel = el(doc, 'select', 'fx-select');
  paletteSel.title = 'The archive whose props fill the list';
  const assetBrowserSettingsKey = 's2u-forge-assets-browser';
  let assetViewMode: 'list' | 'grid' = 'grid';
  let assetTileSize = 112;
  try {
    const saved = JSON.parse(readKey(assetBrowserSettingsKey) ?? '{}') as { mode?: unknown; size?: unknown };
    if (saved.mode === 'list' || saved.mode === 'grid') assetViewMode = saved.mode;
    if (typeof saved.size === 'number' && Number.isFinite(saved.size)) assetTileSize = Math.round(Math.max(72, Math.min(200, saved.size)));
  } catch { /* Invalid saved presentation preferences use the browser defaults. */ }
  // FUI-22 (D5, FUI.R21; D3; a browser adaptation): the one asset browser -- archive, search, filters, and a view
  // settings popup; both formats use static staged-prop thumbnails and the optional hover tooltip (`assetTiles`, below).
  const chipAll = el(doc, 'button', 'fx-chip', 'All');
  chipAll.setAttribute('aria-label', 'All');
  chipAll.title = 'Every prop of the archive';
  const chipFav = el(doc, 'button', 'fx-chip');
  chipFav.innerHTML = `${icon('star')}<span class="s2u-visually-hidden">Favourites</span>`;
  chipFav.setAttribute('aria-label', 'Favourites');
  chipFav.title = 'Favourites: the props you starred';
  const search = el(doc, 'input', 'fx-search');
  search.type = 'search';
  search.placeholder = 'Search props…';
  search.setAttribute('aria-label', 'Search the assets');
  const list = el(doc, 'ul', 'fx-assets');
  list.setAttribute('aria-label', 'Assets');
  const assetsHead = el(doc, 'div', 'fx-panel-head');
  assetsHead.append(el(doc, 'span', 'fx-dim', 'your disc’s props'));
  const filters = el(doc, 'div', 'fx-asset-filters');
  const chips = el(doc, 'div', 'fx-asset-chips');
  chips.classList.add('fx-asset-chip-row');
  const chipChars = el(doc, 'button', 'fx-chip');
  chipChars.innerHTML = `${icon('npc')}<span class="s2u-visually-hidden">Characters</span>`;
  chipChars.setAttribute('aria-label', 'Characters');
  chipChars.title = 'Characters: the base map’s own player models, placed as NPCs';
  const assetViewPopupButton = el(doc, 'button', 'fx-chip fx-asset-view-popup-button');
  assetViewPopupButton.type = 'button';
  assetViewPopupButton.innerHTML = `${icon('gear')}<span class="s2u-visually-hidden">Asset view options</span>`;
  assetViewPopupButton.setAttribute('aria-label', 'Asset view options');
  assetViewPopupButton.setAttribute('aria-haspopup', 'true');
  assetViewPopupButton.setAttribute('aria-expanded', 'false');
  assetViewPopupButton.title = 'Asset view options';
  const assetViewPopup = el(doc, 'div', 'fx-asset-view-popup');
  assetViewPopup.id = 'fx-asset-view-popup';
  assetViewPopup.setAttribute('role', 'group');
  assetViewPopup.setAttribute('aria-label', 'Asset view settings');
  assetViewPopup.hidden = true;
  assetViewPopupButton.setAttribute('aria-controls', assetViewPopup.id);
  // The browser's foot, under the list: the format (list / grid) at its left, the size slider at its right.
  const displayModes = el(doc, 'div', 'fx-asset-display-modes');
  displayModes.setAttribute('role', 'group');
  displayModes.setAttribute('aria-label', 'Asset format');
  const listModeBtn = el(doc, 'button', 'fx-chip fx-asset-view-button');
  listModeBtn.innerHTML = `${icon('listView')}<span class="s2u-visually-hidden">List</span>`;
  listModeBtn.type = 'button';
  listModeBtn.setAttribute('aria-label', 'List view');
  listModeBtn.title = 'Show assets in a list';
  const gridModeBtn = el(doc, 'button', 'fx-chip fx-asset-view-button');
  gridModeBtn.innerHTML = `${icon('gridView')}<span class="s2u-visually-hidden">Grid</span>`;
  gridModeBtn.type = 'button';
  gridModeBtn.setAttribute('aria-label', 'Grid view');
  gridModeBtn.title = 'Show assets as preview tiles';
  displayModes.append(listModeBtn, gridModeBtn);
  const sizeLabel = el(doc, 'label', 'fx-asset-size-label');
  const sizeSlider = el(doc, 'input', 'fx-asset-size');
  const sizeValue = el(doc, 'output', 'fx-asset-size-value');
  const assetViewEvents = new AbortController();
  sizeSlider.type = 'range';
  sizeSlider.min = '72';
  sizeSlider.max = '200';
  sizeSlider.step = '8';
  sizeSlider.value = String(assetTileSize);
  sizeSlider.setAttribute('aria-label', 'Grid size');
  sizeSlider.title = 'Change grid tile width and list row height';
  sizeLabel.append(sizeSlider, sizeValue);
  const assetPreviewLabel = el(doc, 'label', 'fx-asset-preview-toggle');
  const assetPreviewToggle = el(doc, 'input');
  assetPreviewToggle.type = 'checkbox';
  assetPreviewToggle.setAttribute('aria-label', 'Asset preview on hover');
  assetPreviewLabel.append(assetPreviewToggle, el(doc, 'span', '', 'Asset preview on hover'));
  assetViewPopup.append(assetPreviewLabel);
  chips.append(chipAll, chipFav, chipChars, assetViewPopupButton, assetViewPopup);
  filters.append(search, chips);
  const assetsFoot = el(doc, 'div', 'fx-assets-foot');
  assetsFoot.append(displayModes, sizeLabel);
  const assetsSurface = el(doc, 'div', 'fx-assets-pane');
  assetsSurface.append(assetsHead, paletteSel, filters, list, assetsFoot);
  const applyAssetDisplay = (): void => {
    list.dataset['view'] = assetViewMode;
    list.style.setProperty('--fx-asset-tile-size', `${assetTileSize}px`);
    list.style.setProperty('--fx-asset-row-height', `${Math.round(48 + (assetTileSize - 72) * 36 / 128)}px`);
    sizeSlider.value = String(assetTileSize);
    sizeValue.textContent = `${assetTileSize}px`;
    listModeBtn.classList.toggle('is-on', assetViewMode === 'list');
    gridModeBtn.classList.toggle('is-on', assetViewMode === 'grid');
    listModeBtn.setAttribute('aria-pressed', String(assetViewMode === 'list'));
    gridModeBtn.setAttribute('aria-pressed', String(assetViewMode === 'grid'));
  };
  applyAssetDisplay();

  // The outliner, the inspector, the view and the settings: FUI-1's first registrants (`./shell/panel`; a browser
  // adaptation, FG.R2), their markup as it was (`./panels/*`); the closure below keeps wiring their controls.
  const right = el(doc, 'aside', 'fx-dock fx-right');
  const topDock = el(doc, 'aside', 'fx-dock fx-dock-zone fx-dock-top');
  const bottomDock = el(doc, 'aside', 'fx-dock fx-dock-zone fx-dock-bottom');
  const centerDock = el(doc, 'aside', 'fx-dock fx-dock-zone fx-dock-center');
  const inspectorDom = buildInspector(doc, icon('reset'));
  const { name: inspectName, kind: inspectKind, fields, x: fx, y: fy, z: fz, yaw: fyaw, lock: lockBtn,
    pitch: fpitch, roll: froll, sx: fsx, sy: fsy, sz: fsz, resetPosition, resetRotation, resetScale } = inspectorDom;
  const outlinerDom = buildOutliner(doc);
  const { list: outliner, search: outlinerSearch, filter: outlinerFilter } = outlinerDom;
  // PF.R60 (`../detailDistance`, a browser adaptation over PF-30's gate): the detail distance -- the page's one stored factor,
  // the front end's launcher Options' too -- beside the PS2 picture switch; the PS2 picture draws the original's (1).
  const detailDistance = detailDistanceKeeper();
  const detailHooks: DetailDistanceHooks = { value: () => detailDistance.get(), step: (d) => detailDistance.step(d), ps2: () => view.ps2 };
  // FP-2 (FP.R5; a browser adaptation, FG.R2): the render scale -- the page's one stored video setting (`../videoSettings`,
  // CPS.R7), the launcher's and VIDEO OPTIONS' too; no Forge-only setting -- beside the detail distance, on its shape.
  const videoSettings = videoSettingsKeeper();
  const renderScaleHooks: RenderScaleHooks = { value: () => videoSettings.get().renderScale, step: (d) => videoSettings.step(d), ps2: () => view.ps2 };
  // FG-24 (FG.R18; an adaptation, no original): the layout's map settings -- the light and the fog applied live, the
  // room's options at Play; each change an edit of the layout (saved, undone and redone with it).
  const settingsDom = buildSettings(doc);
  const { gameTypeSel, lightIn, lightReset, lightOut, fogIn, fogOut, fogReset, numIn, ffIn, npcSel } = settingsDom;
  /**
   * FUI-1 (the review's IA-9, UX-1, UX-7, UX-12): the docks' registry -- order, open state per viewer (one key), frame,
   * visibility and teardown. The facade, the state and the words it hands a panel are the page's, read lazily (they
   * are built further down); the workspace slot (FUI.R5) holds no panel yet.
   */
  const workspaceDock = createWorkspaceDock(doc);
  /**
   * FUI-2 (FUI-1b's prerequisite; a browser adaptation, FG.R2): the focus lease a panel takes (`ctx.ui.focus.take`).
   * While held the editor's keys, camera and pad lanes are the panel's (`leaseCheck` and the pad's frame, below); a fold,
   * a hide, a dispose or the panel's signal lets it go. `leaseCheck` is set once the editor seam is up.
   */
  let leaseCheck = (): void => undefined;
  let leaseChanged = (): void => undefined;
  const leases = createFocusLeases({ shown: (id) => shell.isShown(id), onChange: () => leaseChanged() });
  /** FUI-4 (`./shell/statusBar`): the status bar's chip strip; the page's own chips register once the editor is up. */
  const statusChips = createStatusChips(doc);
  // FCW-32 round 2 (FORGE_RULES_PRESENT_ADAPTATION): the rules' messages and HUD values as words on the match's chips.
  // FUI-23 (FUI.R24): and its cues heard on the match's audio -- a missing name on the status line, a click, a key or a
  // touch on the page the held cues' gesture.
  const rulesPresenter = createRulesPresenter(statusChips, { say: (words) => { say(words); }, gestures: doc });
  const shellUi: ForgeUi = {
    // FUI-4 (`./shell/notify`): one notice model -- `true` is the older error flag; an options object names its kind.
    notify: (m, o) => notifier.notify(m, typeof o === 'object' ? o : { kind: o ? 'error' : 'status' }),
    toast: (m) => pop(m), reveal: (id) => shell.reveal(id),
    collapse: (id) => { shell.collapse(id); leaseCheck(); }, open: (card, o) => cards.open(card, o), focus: leases,
    accepted: (m) => notifier.accepted(m), refused: (m) => notifier.refused(m), registerStatusChip: (spec) => statusChips.register(spec),
    pulse: (kind) => notifier.pulse(kind),                  // R4: the one haptic path (`./shell/notify` `forgePulse`)
  };
  /** FUI-1b: the editor seam (`./shell/context` `ForgeEditor`), set once the facade is up (`shellEditorOf`, below). */
  let shellEditor: ForgeEditor | null = null;
  /**
   * FUI-22 (D5, FUI.R21; D1): the one asset list's tiles -- the drag onto the world and the tooltip preview
   * (`../creator/assetsForgePanel` `createAssetTiles`), bound to `list` once the editor seam is up; disposed at the teardown.
   */
  let assetTiles: AssetTiles | null = null;
  let disposeTiles = (): void => undefined;
  const assetThumbnailCache = new Map<string, string>();
  const assetThumbnailFailures = new Map<string, number>();
  let invalidateAssetThumbnails = (): void => undefined;
  /** FUI-22: whether the tiles were last told their panel is shown (told again only when it turns). */
  let tilesShown = true;
  /** R4: the page's local packs (`ForgePageServices`), made once the facade is up; disposed at the teardown, by it only. */
  let pagePacks: LocalPackApi | null = null;
  /** R7-2: the page's extension host (`ForgePageContext.host`), composed once the renderer is made; disposed at the teardown. */
  let extensions: ExtensionHost | null = null;
  /** The page's context for the panels (`./shell/context`) and, FUI-3, for the menu sections features register. */
  const pageContext: ForgePageContext = {
    get forge(): ForgeAgentApi { if (!agentApi) throw new Error('The Forge editor is not ready'); return agentApi; },   // the agent dock's
    get host(): ExtensionHost | undefined { return extensions ?? undefined; },                                         // R7-2: FCW-08's
    editor: {
      previewPiece: (asset) => shellEditor?.previewPiece?.(asset) ?? Promise.resolve(null),
      stagePiece: (asset) => (shellEditor ? shellEditor.stagePiece(asset) : Promise.resolve(null)),
      place: (staged, at, yaw) => (shellEditor ? shellEditor.place(staged, at, yaw) : Promise.resolve({ ok: false, code: 'NOT_READY', revision: 0 })),
      viewport: () => viewport,
      projectDrop: (x, y) => (shellEditor ? shellEditor.projectDrop(x, y) : { reason: FORGE_REFUSALS.busy }),
      sourceIdentity: (asset) => (shellEditor ? shellEditor.sourceIdentity(asset) : null),
      // AX-15: the agent's changes, undone through the page's own undo (`restore`), and read off the history.
      undoAgentRun: (sessionId) => undoAgentRunNow(sessionId),
      undoWhile: (match) => undoWhileNow(match),
      historyTop: () => undoMeta(history),
      agentStepCount: (sessionId) => agentStepCount(history, sessionId),
      agentChangedRefs: (sessionId) => agentChangedRefs(history, sessionId),
    },
    // R6 (the UI seat's palette seam to dot, 2026-10-25 17:23Z / 17:24Z): the page's palette, the page's state throughout.
    palette: {
      rows: () => paletteRows(), filter: () => ({ query: search.value, favouritesOnly: filter === 'favs' }),
      setQuery: (q) => { search.value = q; drawAssets(); },
      setFavouritesOnly: (on) => { filter = on ? 'favs' : 'all'; showChars = false; drawAssets(); },
      favourite: (asset, on) => {
        if (favs.has(asset) === on || parseAssetId(asset) === null) return;
        favs = toggleFavourite(favs, asset); writeFavourites(favs); drawAssets();
      },
      choose: (asset) => { if (entriesOfPalette.some((e) => e.asset === asset) || favs.has(asset)) choosePaletteRow(asset); },
      chosen: () => chosen,
      archives: () => [...paletteSel.options].map((o) => ({ id: o.value, label: o.text, chosen: o.value === paletteSel.value })),
      chooseArchive: (id) => {
        if (![...paletteSel.options].some((o) => o.value === id)) return;
        void showPalette(id).catch((e: unknown) => say(String(e), true));
      },
      characters: () => characterRows(),
      chooseCharacter: (id) => { const c = characters().find((k) => `${k.side}:${k.type}` === id); if (c) chooseCharacterRow(c); },
      state: () => ({ loading: paletteLoading !== null, emptyReason: paletteLoading !== null || paletteRows().length ? null : paletteEmptyReason() }),
      subscribe: (fn) => { paletteListeners.add(fn); return () => { paletteListeners.delete(fn); }; },
    } satisfies ForgePalette,
    ui: shellUi, state: () => shellState(), store: pageSettings, doc,
  };
  const shell: ForgeShellPage = createForgeShell({
    doc, docks: { left, right, top: topDock, bottom: bottomDock, center: centerDock, workspace: workspaceDock },
    store: pageSettings, storeKey: FORGE_PANELS_KEY,
    showDock: (d) => { if (d !== 'workspace') setDocks(true); },
    // FUI-1 fix-up (A1): a dock is drawn unless folded away (Docks), walked (`is-playing`) or under a match.
    dockShown: (d) => !doc.body.classList.contains(FORGE_MATCHING_CLASS) && !doc.body.classList.contains('is-playing')
      && (d === 'workspace' || !doc.body.classList.contains('fx-docks-off')),
    context: pageContext,
  });
  shell.register({
    id: 'asset-browser', title: 'Assets', dock: 'left', order: 0, defaultOpen: true, tab: 'Assets', padLegend: [],
    mount(host) {
      host.append(assetsSurface);
      return { dispose: () => { assetsSurface.remove(); } };
    },
  });
  /** FUI-3: the START menu's sections a feature adds (`registerMenuSection`), drawn beside the shell's Panels section. */
  const menuSections = createMenuSections<ForgePageContext>();
  MENU_SECTIONS.set(shell, menuSections);
  onShell(shell);
  shell.register(inspectorPanel(inspectorDom, shellUi.reveal));
  shell.register(outlinerPanel(outlinerDom, shellUi.reveal));
  // FUI-3 (PAD-6): View switches remain in START's View section and the viewport dropdown.
  const viewMenuRows = VIEW_TOGGLES.map((t) => [t.id, VIEW_MENU_ROWS.find(([id]) => id === t.id)?.[1] ?? t.label] as const);
  shell.register(settingsPanel(settingsDom, {
    settings: () => settings, discFar: () => discFog.far, gameTypeLabel: () => optionLabel(gameTypeSel),
    cycleGameType: (by) => cycleSelect(gameTypeSel, by), step: (key, dir) => stepSettingBy(key, dir),
    resetFog: () => { personEdit('settings.set', { settings: { fogFar: null } }, () => { settings = { ...settings, fogFar: null }; applySettings(); edit(); }); },
    resetLighting: () => resetLighting(), locked: () => editsLocked(),
  }));
  // The Environment panel (World): the layout's lighting rows (Settings' controls, mounted here, wired as before) and
  // the disc's own lighting and atmosphere, read only (`drawEnvironmentPanel`).
  const environmentDom = buildEnvironment(doc, settingsDom.lightingRows);
  /**
   * A new empty map's own light rig (the owner, 2026-11-06; a browser adaptation, FG.R2): `settings.lightRig`, edited in
   * the Environment panel (`./panels/lightRigEditor`) on a blank base only -- a disc map keeps its own. Absent, the rig of
   * the map it is built from (its library's `GlobalLighting`); a library with none, `FALLBACK_RIG`.
   */
  const rigEditor = buildLightRigEditor(doc, {
    get: () => atmosphereNow(),
    own: () => !!(settings.lightRig || settings.fogColor || settings.shadowVector || settings.skyFrom || settings.fog || settings.night),
    from: () => (base?.kind === 'blank' ? base.library : ''),
    // Its sky: a disc map's own dome copied over the floor (`./skyDome`), or none.
    skyChoices: () => entries.filter((e) => !e.campaign && !absent.has(e.stem)).map((e) => [e.stem, `${e.label} · ${e.stem}`] as const),
    flares: () => roots.filter((r) => r.userData['forgeFlare']).length,
    preview: (a) => { if (editsLocked()) return; settings = { ...settings, ...atmosphereSettings(a) }; applySettings(); },
    commit: (a) => { if (refuseEdit()) { applySettings(); return; } settings = { ...settings, ...atmosphereSettings(a) }; applySettings(); settingsEdit(() => edit()); },
    reset: () => {
      if (refuseEdit()) return;
      settings = { ...settings, lightRig: null, fogColor: null, shadowVector: null, skyFrom: null, fog: null, night: null };
      applySettings();
      rigEditor.draw(true);                                    // every field, the focused one too
      settingsEdit(() => edit());
    },
    // Preset (the owner, 2026-11-06): a disc map's whole environment copied in (`./environmentCopy`), as a new empty map
    // built from it starts; what that map lacks goes back to the built-from map's. One edit.
    preset: () => { void (async () => {
      if (refuseUnderCard() || refuseEdit()) return;
      const maps = entries.filter((e) => !e.campaign && !absent.has(e.stem)).map((e) => [e.stem, `${e.label} · ${e.stem}`] as const);
      if (!maps.length) { notifier.refused('No disc map to copy a light rig from'); return; }
      const current = settings.skyFrom ?? (base?.kind === 'blank' ? base.library : '');
      const stem = await askChoice('Light rig preset', 'Copy this map’s light rig, fog, night, shadows and sky into your map. Your own values are replaced.',
        [['Multiplayer', maps]], maps.some(([v]) => v === current) ? current : maps[0]![0], 'Copy');
      if (!stem) return;
      const from = await hostageLibOf(stem);
      if (!from) { notifier.refused(`${stem} would not load`); return; }
      if (refuseEdit()) return;
      // Every field the preset's: what the map lacks (a shadow vector) is the value now shown, kept as this map's own.
      const now = atmosphereNow();
      settings = { ...settings, ...atmosphereSettings(now), ...environmentOf(from) };
      applySettings();
      rigEditor.draw(true);                                    // every field, the focused one too
      settingsEdit(() => edit());
      say(`Light rig copied from ${stem}`);
    })(); },
  });
  environmentDom.info.before(rigEditor.body);
  environmentDom.body.prepend(rigEditor.top);                // Preset and Reset at the panel's top (the owner, 2026-11-06)
  /**
   * The layout lighting's two rows where they belong (the owner, 2026-11-06): on a new empty map, Day / night under the
   * light rig and Fog distance under the fog (`rigEditor.slots`), the Layout lighting heading hidden; on a disc map, back
   * under that heading (its own rig and fog are read only below).
   */
  const placeLightingRows = (): void => {
    const [dayNightRow, fogRow] = settingsDom.lightingRows;
    const blank = base?.kind === 'blank';
    if (dayNightRow) (blank ? rigEditor.slots.dayNight : environmentDom.layout).append(dayNightRow);
    if (fogRow) (blank ? rigEditor.slots.fogDistance : environmentDom.layout).append(fogRow);
    environmentDom.layout.hidden = blank;
    rigEditor.top.hidden = !blank;
  };
  shell.register(environmentPanel(environmentDom));

  // The viewport and the status bar.
  const viewport = el(doc, 'main', 'fx-viewport');
  const canvas = el(doc, 'canvas', 'fx-canvas');
  const input = el(doc, 'div', 'fx-input');
  let gizmo!: TransformControls;
  const crosshair = el(doc, 'div', 'fx-crosshair');
  crosshair.hidden = true;
  const cameraHud = el(doc, 'div', 'fx-camera-hud');
  const viewportLeftControls = el(doc, 'div', 'fx-viewport-left-controls');
  let texturedOn = true;
  let litOn = true;
  const viewportModes = doc.createElement('details');
  viewportModes.className = 'fx-viewport-modes';
  const viewportModesSummary = doc.createElement('summary');
  viewportModesSummary.className = 'fx-viewport-modes-summary';
  viewportModesSummary.innerHTML = `${icon('view')}<span>Draw</span>`;   // the owner, 2026-11-06: View renamed Draw
  const viewportModesList = el(doc, 'div', 'fx-viewport-modes-list');
  const viewportToggleInputs = new Map<ViewToggle, HTMLInputElement>();
  const modeGroup = (heading: string): void => {
    viewportModesList.append(el(doc, 'h3', 'fx-viewport-modes-heading', heading));
  };
  const modeToggle = (label: string): HTMLInputElement => {
    const row = el(doc, 'label', 'fx-viewport-mode fx-toggle');
    const checkbox = doc.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.setAttribute('aria-label', label);
    row.append(checkbox, el(doc, 'span', '', label));
    viewportModesList.append(row);
    return checkbox;
  };
  const addViewportToggle = (id: ViewToggle, label: string): HTMLInputElement => {
    const checkbox = modeToggle(label);
    viewportToggleInputs.set(id, checkbox);
    return checkbox;
  };
  modeGroup('Draw');
  const texturedInput = modeToggle('Textured');
  const wireframeInput = addViewportToggle('wireframe', 'Wireframe');
  const litInput = modeToggle('Lit');
  addViewportToggle('untextured', 'Untextured highlight');
  modeGroup('Overlays');
  addViewportToggle('collision', 'Collision hull');
  addViewportToggle('grid', 'Map grid');
  modeGroup('World');
  addViewportToggle('fog', 'Fog');
  addViewportToggle('shadows', 'Drop shadows');
  addViewportToggle('detail', 'Detail textures');
  addViewportToggle('alternate', 'Alternate states');
  addViewportToggle('blendgraded', 'Graded alpha blend');
  addViewportToggle('engineorder', 'Engine draw order');
  modeGroup('Picture');
  addViewportToggle('ps2', 'PS2 picture (640×448)');
  const viewportDetailDom = buildDetailDistance(doc, detailHooks, (value) => detailDistance.set(value));
  viewportDetailDom.row.classList.add('fx-viewport-mode');
  viewportModesList.append(viewportDetailDom.row);
  const viewportRenderScaleDom = buildRenderScale(doc, renderScaleHooks, (renderScale) => videoSettings.set({ renderScale }));   // FP-2
  viewportRenderScaleDom.row.classList.add('fx-viewport-mode');
  viewportModesList.append(viewportRenderScaleDom.row);
  const snapSettings = doc.createElement('details');
  snapSettings.className = 'fx-viewport-snap';
  const snapSettingsSummary = doc.createElement('summary');
  snapSettingsSummary.className = 'fx-camera-view fx-viewport-snap-summary';
  snapSettingsSummary.innerHTML = `${icon('snap')}<span>Snap</span><output class="fx-camera-speed-button-value">${DEFAULT_GRID_STEP} / ${DEFAULT_TURN_STEP}°</output>`;
  const snapSettingsPanel = el(doc, 'div', 'fx-viewport-snap-panel');
  const snapNumberInput = (label: string, min: number, max: number, title: string): HTMLInputElement => {
    const row = el(doc, 'label', 'fx-viewport-snap-field');
    row.append(el(doc, 'span', '', label));
    const field = el(doc, 'input', 'fx-num fx-setting-num fx-stepper');
    field.type = 'number';
    field.min = String(min);
    field.max = String(max);
    field.step = '1';
    field.title = title;
    field.setAttribute('aria-label', label);
    row.append(field);
    snapSettingsPanel.append(row);
    return field;
  };
  const viewportGridIn = snapNumberInput('Grid step', GRID_STEP_MIN, GRID_STEP_MAX, 'Grid step, in game units');
  const viewportTurnIn = snapNumberInput('Turn step (°)', TURN_STEP_MIN, TURN_STEP_MAX, 'Turn step, in degrees');
  const viewportSnapRow = el(doc, 'label', 'fx-toggle fx-viewport-snap-toggle');
  const viewportSnapIn = doc.createElement('input');
  viewportSnapIn.type = 'checkbox';
  viewportSnapIn.setAttribute('aria-label', 'Snap');
  viewportSnapRow.append(viewportSnapIn, el(doc, 'span', '', 'Snap'));
  snapSettingsPanel.append(viewportSnapRow);
  snapSettingsPanel.insertBefore(viewportSnapRow, snapSettingsPanel.firstChild);
  snapSettings.append(snapSettingsSummary, snapSettingsPanel);
  texturedInput.addEventListener('change', () => {
    texturedOn = texturedInput.checked;
    applyView();
  });
  litInput.addEventListener('change', () => {
    litOn = litInput.checked;
    applyView();
  });
  for (const [id, checkbox] of viewportToggleInputs) {
    checkbox.addEventListener('change', () => { view[id] = checkbox.checked; applyView(); });
  }
  viewportModes.append(viewportModesSummary, viewportModesList);
  /*
   * The viewport's Billboards dropdown (a browser adaptation, FG.R2), beside View: the map data billboards shown at all,
   * drawn over all the geometry (found from anywhere on the map), the disc spawn slots' cell outlines, and a switch a
   * kind of map data (`MAP_DATA_KIND_TOGGLES`). The same look as View's dropdown.
   */
  const billboardsMenu = doc.createElement('details');
  billboardsMenu.className = 'fx-viewport-modes fx-viewport-billboards';
  const billboardsSummary = doc.createElement('summary');
  billboardsSummary.className = 'fx-viewport-modes-summary';
  billboardsSummary.innerHTML = `${icon('billboard')}<span>View</span>`;   // the owner, 2026-11-06: Billboards renamed View
  const billboardsList = el(doc, 'div', 'fx-viewport-modes-list fx-billboards-list');
  // Three columns, so every switch shows at once with no scroll: the settings and the overlays, then the user's own
  // data, then the map's data (the long list).
  const billboardsCols = [el(doc, 'div', 'fx-billboards-col'), el(doc, 'div', 'fx-billboards-col'), el(doc, 'div', 'fx-billboards-col')] as const;
  billboardsList.append(...billboardsCols);
  let billboardsCol: HTMLElement = billboardsCols[0];
  const billboardToggle = (label: string): HTMLInputElement => {
    const row = el(doc, 'label', 'fx-viewport-mode fx-toggle');
    const checkbox = doc.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.setAttribute('aria-label', label);
    row.append(checkbox, el(doc, 'span', '', label));
    billboardsCol.append(row);
    return checkbox;
  };
  billboardsCol.append(el(doc, 'h3', 'fx-viewport-modes-heading', 'Billboards'));
  const billboardsOnIn = billboardToggle('Show billboards');
  const billboardsTopIn = billboardToggle('Always on top');
  billboardsTopIn.closest('label')!.title = 'Draw the billboards over all the geometry, so they can be found from anywhere on the map';
  billboardsCol.append(el(doc, 'h3', 'fx-viewport-modes-heading', 'Overlays'));
  // Every gizmo at once (the owner, 2026-11-06: one switch): the disc's spawn slots' cells and arrows (`../overlays`) and
  // the placed spawns' and hostages' cells, the doors' swings, the ladders', turrets', views', gates' and barriers'
  // guides (`./interactOverlay`) -- the view setting the disc's slots had. Its own listener: View's switches took theirs
  // before this one joined them.
  const discSlotsIn = billboardToggle('Gizmos');
  discSlotsIn.closest('label')!.title = 'Every gizmo on or off: spawn and hostage cells, door swings, ladder, turret, view, gate and C4 barrier guides';
  viewportToggleInputs.set('spawns', discSlotsIn);
  discSlotsIn.addEventListener('change', () => { view.spawns = discSlotsIn.checked; applyView(); });
  // The map's own flare glows (its lights', the sun's, the sky's): drawn as the game draws them, or out of the way.
  const flareGlowsIn = billboardToggle('Flare glows');
  flareGlowsIn.closest('label')!.title = "The map's own light glows, sun, moon and stars; off, they are not drawn (nor picked)";
  flareGlowsIn.addEventListener('change', () => { flareGlows = flareGlowsIn.checked; applyView(); });
  // The map's light rig as arrows (`./lightArrows`): which way each of its directional lights comes in.
  const lightDirectionsIn = billboardToggle('Light directions');
  lightDirectionsIn.closest('label')!.title = "The map's light rig (GlobalLighting): an arrow each light, in its colour, the way it shines";
  lightDirectionsIn.addEventListener('change', () => { lightDirections = lightDirectionsIn.checked; applyView(); });
  // Two sections: the map's own data (round marks) and the user's own placements (square marks), each with its All first
  // -- every kind of the section on or off at once; part of them on, it shows mixed (`indeterminate`).
  const BILLBOARD_SECTIONS = [['map', 'Map data', 'Every kind of map data on or off at once'],
    ['user', 'User data', 'Every kind of your own placements on or off at once']] as const;
  const billboardsAllIns = new Map<'map' | 'user', HTMLInputElement>();
  const billboardKindIns = new Map<string, HTMLInputElement>();
  for (const [group, heading, title] of BILLBOARD_SECTIONS) {
    billboardsCol = billboardsCols[group === 'map' ? 2 : 1];
    billboardsCol.append(el(doc, 'h3', 'fx-viewport-modes-heading', heading));
    const kinds = MAP_DATA_KIND_TOGGLES.filter((t) => t.group === group);
    const all = billboardToggle('All');
    all.closest('label')!.title = title;
    all.addEventListener('change', () => {
      for (const t of kinds) { if (all.checked) billboardsOff.delete(t.id); else billboardsOff.add(t.id); }
      applyView();
    });
    billboardsAllIns.set(group, all);
  }
  /**
   * The kinds' switches a row each (the owner, 2026-11-06: `billboardRows`): a user kind beside its map kind, a side with
   * no counterpart an empty cell -- a switch's row kept, unseen and out of reach -- so both columns line up.
   */
  const kindSwitch = (t: (typeof MAP_DATA_KIND_TOGGLES)[number]): void => {
    const input = billboardToggle(t.label);
    // The kind's own mark before its word, as the viewport draws it: its letter on its colour (two sides or teams
    // split down the middle), round or square as it is drawn, so a switch reads as the marks it shows.
    const marks = t.kinds.map((k) => MAP_DATA_MARKS[k]!);
    const badge = el(doc, 'span', `fx-billboard-icon${marks[0]!.shape === 'square' ? ' is-square' : ''}`, marks[0]!.glyph);
    badge.setAttribute('aria-hidden', 'true');
    // Split only for a two-sided kind (spawns, respawns: SEALs | Terrorists); the bomb's start and its sites are the
    // start's own red.
    badge.style.background = marks.length === 2
      ? `linear-gradient(90deg, ${marks[0]!.colour} 50%, ${marks[1]!.colour} 50%)`
      : marks[0]!.colour;
    input.after(badge);
    billboardKindIns.set(t.id, input);
  };
  const emptyCell = (): void => {
    const input = billboardToggle('');
    const row = input.closest('label')!;
    row.classList.add('fx-billboard-empty');
    row.setAttribute('aria-hidden', 'true');
    row.style.visibility = 'hidden';
    input.tabIndex = -1;
    input.disabled = true;
    // As tall as a switch's row with its Solo, so the two columns stay level.
    row.append(el(doc, 'span', 'fx-chip fx-billboard-solo', 'Solo'));
  };
  for (const row of billboardRows()) {
    // A section's heading (the toolbar's own, `BILLBOARD_SECTIONS`) in both columns, so the two stay level.
    if ('heading' in row) {
      for (const col of [billboardsCols[1], billboardsCols[2]]) col.append(el(doc, 'h4', 'fx-billboards-section', row.heading));
      continue;
    }
    billboardsCol = billboardsCols[1];
    if (row.user) kindSwitch(row.user); else emptyCell();
    billboardsCol = billboardsCols[2];
    if (row.map) kindSwitch(row.map); else emptyCell();
  }
  /**
   * Each kind's Solo, at its switch's right: only that kind shown, every other switched off; pressed again while it is
   * the only one on, every kind back on.
   */
  const soloOf = (id: string): boolean => MAP_DATA_KIND_TOGGLES.every((t) => billboardsOff.has(t.id) === (t.id !== id));
  const billboardSolos = new Map([...billboardKindIns].map(([id, input]) => {
    const solo = el(doc, 'button', 'fx-chip fx-billboard-solo', 'Solo');
    solo.type = 'button';
    const label = MAP_DATA_KIND_TOGGLES.find((t) => t.id === id)!.label;
    solo.title = `Show only ${label.toLowerCase()}; press again to show every kind`;
    solo.setAttribute('aria-label', `Solo ${label}`);
    solo.addEventListener('click', (e) => {
      e.preventDefault();                                      // a press in the switch's row: never the switch's own
      e.stopPropagation();
      const was = soloOf(id);
      billboardsOff.clear();
      if (!was) for (const t of MAP_DATA_KIND_TOGGLES) if (t.id !== id) billboardsOff.add(t.id);
      applyView();
    });
    input.closest('label')!.append(solo);
    return [id, solo] as const;
  }));
  billboardsMenu.append(billboardsSummary, billboardsList);
  /** The dropdown's switches drawn from the settings (each change, and once at the start). */
  const drawBillboardSwitches = (): void => {
    billboardsOnIn.checked = billboardsOn;
    billboardsTopIn.checked = billboardsOnTop;
    flareGlowsIn.checked = flareGlows;
    lightDirectionsIn.checked = lightDirections;
    for (const [id, input] of billboardKindIns) { input.checked = !billboardsOff.has(id); input.disabled = !billboardsOn; }
    for (const [group, all] of billboardsAllIns) {
      const kinds = MAP_DATA_KIND_TOGGLES.filter((t) => t.group === group);
      const offCount = kinds.filter((t) => billboardsOff.has(t.id)).length;
      all.checked = offCount === 0;
      all.indeterminate = offCount > 0 && offCount < kinds.length;
      all.disabled = !billboardsOn;
    }
    for (const [id, solo] of billboardSolos) {
      const on = soloOf(id);
      solo.classList.toggle('is-on', on);
      solo.setAttribute('aria-pressed', String(on));
      solo.disabled = !billboardsOn;
    }
    billboardsTopIn.disabled = !billboardsOn;
  };
  billboardsOnIn.addEventListener('change', () => { billboardsOn = billboardsOnIn.checked; applyView(); });
  billboardsTopIn.addEventListener('change', () => { billboardsOnTop = billboardsTopIn.checked; applyView(); });
  for (const [id, input] of billboardKindIns) {
    input.addEventListener('change', () => { if (input.checked) billboardsOff.delete(id); else billboardsOff.add(id); applyView(); });
  }
  const cameraSpeedFeedback = el(doc, 'div', 'fx-camera-speed-feedback');
  cameraSpeedFeedback.setAttribute('aria-hidden', 'true');
  const cameraSpeedFeedbackLabel = el(doc, 'span', 'fx-camera-speed-feedback-label', 'Camera speed');
  const cameraSpeedFeedbackValue = doc.createElement('output');
  cameraSpeedFeedbackValue.className = 'fx-camera-speed-feedback-value';
  const cameraSpeedFeedbackTrack = el(doc, 'span', 'fx-camera-speed-feedback-track');
  const cameraSpeedFeedbackFill = el(doc, 'span', 'fx-camera-speed-feedback-fill');
  cameraSpeedFeedbackTrack.append(cameraSpeedFeedbackFill);
  cameraSpeedFeedback.append(cameraSpeedFeedbackLabel, cameraSpeedFeedbackTrack, cameraSpeedFeedbackValue);
  let cameraSpeedFeedbackTimer: ReturnType<typeof setTimeout> | null = null;
  const viewMenu = doc.createElement('details');
  viewMenu.className = 'fx-camera-views';
  const viewMenuSummary = doc.createElement('summary');
  viewMenuSummary.className = 'fx-camera-view';
  const viewMenuList = doc.createElement('div');
  viewMenuList.className = 'fx-camera-view-list';
  const axisWidget = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  axisWidget.classList.add('fx-axis-widget');
  axisWidget.setAttribute('viewBox', '0 0 80 80');
  axisWidget.setAttribute('role', 'group');
  axisWidget.setAttribute('aria-label', 'View orientation. Drag to orbit; select an axis to align the view.');
  const axisLines = doc.createElementNS(axisWidget.namespaceURI, 'g') as SVGGElement;
  axisLines.classList.add('fx-axis-lines');
  axisWidget.append(axisLines);
  const axisEnds = new Map<string, SVGGElement>();
  const axisLineElements = new Map<string, SVGLineElement>();
  for (const axis of ['x', 'y', 'z'] as const) {
    const line = doc.createElementNS(axisWidget.namespaceURI, 'line') as SVGLineElement;
    line.classList.add(`fx-axis-${axis}`);
    axisLineElements.set(axis, line);
    axisLines.append(line);
    for (const sign of [-1, 1] as const) {
      const end = doc.createElementNS(axisWidget.namespaceURI, 'g') as SVGGElement;
      end.classList.add('fx-axis-end', `fx-axis-${axis}`);
      end.dataset['axis'] = axis;
      end.dataset['sign'] = String(sign);
      end.setAttribute('role', 'button');
      end.setAttribute('tabindex', '0');
      end.setAttribute('aria-label', `${sign > 0 ? 'Positive' : 'Negative'} ${axis.toUpperCase()} axis view`);
      const circle = doc.createElementNS(axisWidget.namespaceURI, 'circle');
      circle.setAttribute('r', sign > 0 ? '8' : '6');
      const label = doc.createElementNS(axisWidget.namespaceURI, 'text');
      label.textContent = sign > 0 ? axis.toUpperCase() : '';
      end.append(circle, label);
      axisEnds.set(`${axis}:${sign}`, end);
      axisWidget.append(end);
    }
  }
  const viewOptions: [ForgeViewportView, string][] = [
    ['perspective', 'Perspective'], ['top', 'Top'], ['bottom', 'Bottom'], ['left', 'Left'],
    ['right', 'Right'], ['front', 'Front'], ['back', 'Back'],
  ];
  const viewIcons: Record<ForgeViewportView, string> = {
    perspective: 'povPerspective', top: 'povTop', bottom: 'povBottom', left: 'povLeft',
    right: 'povRight', front: 'povFront', back: 'povBack',
  };
  const viewButtons = new Map<ForgeViewportView, HTMLButtonElement>();
  for (const [value, label] of viewOptions) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'fx-camera-view-option';
    button.setAttribute('aria-label', `${label} view`);
    button.innerHTML = `${icon(viewIcons[value])}<span>${label}</span>`;
    button.addEventListener('click', () => {
      selectViewportView(value);
    });
    viewButtons.set(value, button);
    viewMenuList.append(button);
  }
  viewMenuSummary.dataset['view'] = 'perspective';
  viewMenuSummary.innerHTML = `${icon(viewIcons.perspective)}<span>Perspective</span>`;
  viewMenuSummary.setAttribute('aria-label', 'Perspective view');
  viewButtons.get('perspective')?.setAttribute('aria-pressed', 'true');
  viewMenu.append(viewMenuSummary, viewMenuList);
  const viewportFocus = (): Vector3 => baseView && !baseView.box.isEmpty()
    ? baseView.box.getCenter(new Vector3())
    : new Vector3();
  const syncViewportViewMenu = (value: ForgeViewportView): void => {
    const label = viewOptions.find(([view]) => view === value)?.[1] ?? 'Perspective';
    viewMenuSummary.dataset['view'] = value;
    viewMenuSummary.innerHTML = `${icon(viewIcons[value])}<span>${label}</span>`;
    viewMenuSummary.setAttribute('aria-label', `${label} view`);
    for (const [view, item] of viewButtons) item.setAttribute('aria-pressed', String(view === value));
  };
  const selectViewportView = (value: ForgeViewportView): void => {
    const current = viewMenuSummary.dataset['view'] as ForgeViewportView | undefined;
    fly.setForgeViewportView(value, value !== 'perspective' && current === 'perspective' ? viewportFocus() : null);
    syncViewportViewMenu(value);
    gizmo.camera = fly.viewportCamera();
    viewMenu.open = false;
  };
  const syncAxisWidget = (): void => {
    const camera = fly.viewportCamera();
    if (gizmo && gizmo.camera !== camera) gizmo.camera = camera;
    camera.updateMatrixWorld();
    const inverse = camera.quaternion.clone().invert();
    const projected = new Map<string, { x: number; y: number; depth: number }>();
    for (const [axis, vector] of [
      ['x', new Vector3(1, 0, 0)], ['y', new Vector3(0, 1, 0)], ['z', new Vector3(0, 0, 1)],
    ] as const) {
      const point = vector.applyQuaternion(inverse);
      const positive = { x: 40 + point.x * 25, y: 40 - point.y * 25, depth: point.z };
      const negative = { x: 40 - point.x * 25, y: 40 + point.y * 25, depth: -point.z };
      projected.set(`${axis}:1`, positive);
      projected.set(`${axis}:-1`, negative);
      const line = axisLineElements.get(axis)!;
      line.setAttribute('x1', '40');
      line.setAttribute('y1', '40');
      line.setAttribute('x2', String(positive.x));
      line.setAttribute('y2', String(positive.y));
    }
    const ordered = [...axisEnds.entries()].sort((a, b) => projected.get(a[0])!.depth - projected.get(b[0])!.depth);
    for (const [key, end] of ordered) {
      const point = projected.get(key)!;
      end.setAttribute('transform', `translate(${point.x} ${point.y})`);
      axisWidget.append(end);
    }
    const actualView = fly.forgeViewportView();
    if (viewMenuSummary.dataset['view'] !== actualView) syncViewportViewMenu(actualView);
  };
  const alignAxis = (axis: 'x' | 'y' | 'z', sign: 1 | -1): void => {
    const view: ForgeViewportView = axis === 'y'
      ? sign === 1 ? 'top' : 'bottom'
      : axis === 'x'
        ? sign === 1 ? 'right' : 'left'
        : sign === 1 ? 'back' : 'front';
    selectViewportView(view);
  };
  let axisDrag: { pointerId: number; x: number; y: number; moved: boolean; axis: string | null } | null = null;
  let suppressAxisClick = false;
  axisWidget.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const target = (event.target as Element | null)?.closest('.fx-axis-end') ?? null;
    axisDrag = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      moved: false,
      axis: target ? `${target.getAttribute('data-axis')}:${target.getAttribute('data-sign')}` : null,
    };
    axisWidget.setPointerCapture(event.pointerId);
  });
  axisWidget.addEventListener('pointermove', (event) => {
    if (!axisDrag || axisDrag.pointerId !== event.pointerId) return;
    const dx = event.clientX - axisDrag.x;
    const dy = event.clientY - axisDrag.y;
    if (!axisDrag.moved && Math.hypot(event.clientX - axisDrag.x, event.clientY - axisDrag.y) > 2) axisDrag.moved = true;
    if (axisDrag.moved) fly.orbitForgeViewport(dx, dy, viewportFocus());
    axisDrag.x = event.clientX;
    axisDrag.y = event.clientY;
    event.preventDefault();
    event.stopPropagation();
  });
  const endAxisDrag = (event: PointerEvent): void => {
    if (!axisDrag || axisDrag.pointerId !== event.pointerId) return;
    if (axisDrag.moved || axisDrag.axis) {
      suppressAxisClick = true;
      setTimeout(() => { suppressAxisClick = false; }, 0);
    }
    if (!axisDrag.moved && axisDrag.axis) {
      const [axis, sign] = axisDrag.axis.split(':');
      if ((axis === 'x' || axis === 'y' || axis === 'z') && (sign === '1' || sign === '-1')) {
        alignAxis(axis, sign === '1' ? 1 : -1);
      }
    }
    axisDrag = null;
  };
  axisWidget.addEventListener('pointerup', endAxisDrag);
  axisWidget.addEventListener('pointercancel', endAxisDrag);
  for (const [key, end] of axisEnds) {
    end.addEventListener('click', () => {
      if (suppressAxisClick) return;
      const [axis, sign] = key.split(':') as ['x' | 'y' | 'z', '1' | '-1'];
      alignAxis(axis, sign === '1' ? 1 : -1);
    });
    end.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      end.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  }
  let showPadCrosshair = false;
  const updateCrosshair = (): void => {
    crosshair.hidden = fly.isLookHeld() || fly.isLocked() || !showPadCrosshair;
  };
  const cameraSettings = doc.createElement('details');
  cameraSettings.className = 'fx-camera-settings';
  const cameraSettingsSummary = doc.createElement('summary');
  cameraSettingsSummary.innerHTML = `${icon('camera')}<span>Camera</span><output class="fx-camera-speed-button-value">1.0</output>`;
  const cameraSettingsPanel = doc.createElement('div');
  cameraSettingsPanel.className = 'fx-camera-settings-panel';
  const cameraSpeedLabel = doc.createElement('label');
  cameraSpeedLabel.className = 'fx-camera-speed-label';
  cameraSpeedLabel.textContent = 'Camera Speed';
  const cameraSpeedInput = doc.createElement('input');
  cameraSpeedInput.className = 'fx-range fx-camera-speed';
  cameraSpeedInput.type = 'range';
  cameraSpeedInput.min = '0.1';
  cameraSpeedInput.max = '16';
  cameraSpeedInput.step = 'any';
  cameraSpeedInput.value = '1';
  cameraSpeedInput.setAttribute('aria-label', 'Camera speed');
  const cameraSpeedValue = doc.createElement('output');
  cameraSpeedValue.className = 'fx-camera-speed-value';
  cameraSpeedValue.textContent = '1.0';
  const cameraFovLabel = el(doc, 'label', 'fx-camera-speed-label', 'Field of View');
  const cameraFovInput = doc.createElement('input');
  cameraFovInput.className = 'fx-range fx-camera-setting-range';
  cameraFovInput.type = 'range';
  cameraFovInput.min = '30';
  cameraFovInput.max = '120';
  cameraFovInput.step = '1';
  cameraFovInput.value = '49';
  cameraFovInput.setAttribute('aria-label', 'Field of view');
  const cameraFovValue = doc.createElement('output');
  cameraFovValue.className = 'fx-camera-setting-value';
  cameraFovValue.textContent = '49°';
  const cameraLookSpeedLabel = el(doc, 'label', 'fx-camera-speed-label', 'Camera Look Speed');
  const cameraLookSpeedInput = doc.createElement('input');
  cameraLookSpeedInput.className = 'fx-range fx-camera-setting-range';
  cameraLookSpeedInput.type = 'range';
  cameraLookSpeedInput.min = '0.1';
  cameraLookSpeedInput.max = '5';
  cameraLookSpeedInput.step = '0.1';
  cameraLookSpeedInput.value = '1';
  cameraLookSpeedInput.setAttribute('aria-label', 'Camera look speed');
  const cameraLookSpeedValue = doc.createElement('output');
  cameraLookSpeedValue.className = 'fx-camera-setting-value';
  cameraLookSpeedValue.textContent = '1.0×';
  const cameraCollisionLabel = doc.createElement('label');
  cameraCollisionLabel.className = 'fx-camera-collision-label';
  const cameraCollisionInput = doc.createElement('input');
  cameraCollisionInput.type = 'checkbox';
  cameraCollisionInput.setAttribute('aria-label', 'Camera collisions');
  cameraCollisionLabel.append(cameraCollisionInput, doc.createTextNode('Camera collisions'));
  cameraSettingsPanel.append(
    cameraSpeedLabel, cameraSpeedInput, cameraSpeedValue,
    cameraFovLabel, cameraFovInput, cameraFovValue,
    cameraLookSpeedLabel, cameraLookSpeedInput, cameraLookSpeedValue,
    cameraCollisionLabel,
  );
  cameraSettings.append(cameraSettingsSummary, cameraSettingsPanel);
  const hideCameraSpeedFeedback = (): void => {
    cameraSpeedFeedback.classList.remove('is-on');
    if (cameraSpeedFeedbackTimer !== null) clearTimeout(cameraSpeedFeedbackTimer);
    cameraSpeedFeedbackTimer = null;
  };
  // The viewport's dropdowns: one open at a time (Billboards among them, so it never lies over View), and a press
  // anywhere outside the open one closes it.
  const viewportPopups: [HTMLDetailsElement, HTMLElement][] = [
    [viewportModes, viewportModesSummary],
    [billboardsMenu, billboardsSummary],
    [viewMenu, viewMenuSummary],
    [snapSettings, snapSettingsSummary],
    [cameraSettings, cameraSettingsSummary],
  ];
  for (const [popup, summary] of viewportPopups) {
    summary.addEventListener('click', (event) => {
      event.preventDefault();
      const shouldOpen = !popup.open;
      for (const [other] of viewportPopups) other.open = other === popup && shouldOpen;
      if (shouldOpen) hideCameraSpeedFeedback();
    });
    popup.addEventListener('toggle', () => { if (popup.open) hideCameraSpeedFeedback(); });
  }
  doc.addEventListener('pointerdown', (event) => {
    const target = event.target as Node | null;
    for (const [popup] of viewportPopups) if (popup.open && !(target && popup.contains(target))) popup.open = false;
  }, true);
  viewportLeftControls.append(viewportModes, billboardsMenu, viewMenu);
  // The gizmo's modes in the viewport (a browser adaptation, FG.R2), left of Snap: one joined group of buttons, each its
  // icon and its word, their titles the keys (W / E / R).
  const gizmoTools = el(doc, 'div', 'fx-gizmo-tools');
  gizmoTools.setAttribute('role', 'group');
  gizmoTools.setAttribute('aria-label', 'Transform');
  gizmoTools.append(moveBtn, turnBtn, scaleBtn);
  cameraHud.append(gizmoTools, snapSettings, cameraSettings);
  // FUI-3 (FUI.R6): the legend strip at the status bar, in place of the hint line (`./shell/legend`).
  const legend = el(doc, 'ul', 's2u-prompts fx-legend');
  const toast = el(doc, 'div', 'fx-toast', '');
  /** FG-47: the box a left-drag on no placement draws (the Select tool). */
  const marquee = el(doc, 'div', 'fx-marquee');
  marquee.hidden = true;
  viewport.append(canvas, input, crosshair, marquee, viewportLeftControls, cameraHud, axisWidget, cameraSpeedFeedback, legend, toast);
  // The toast sits over the legend strip (`.fx-toast`'s `--fx-legend-h`): the strip's height, 0 while it is hidden. It
  // wraps at narrow widths, so it is measured, not assumed.
  const measureLegend = (): void => { viewport.style.setProperty('--fx-legend-h', `${legend.hidden ? 0 : legend.offsetHeight}px`); };
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(measureLegend).observe(legend);
  measureLegend();
  const statusBar = el(doc, 'footer', 'fx-status');
  const status = el(doc, 'span', 'fx-status-msg', 'starting…');
  // FUI-4 (VP-13): the cells named, not styled by position; the chip strip and the message log between the line and them.
  const sMode = el(doc, 'span', 'fx-cell fx-cell--mode');
  const sCounts = el(doc, 'span', 'fx-cell fx-cell--counts');
  const sCam = el(doc, 'span', 'fx-cell fx-cell--cam');
  const sSpeed = el(doc, 'span', 'fx-cell fx-cell--speed');
  const sFps = el(doc, 'span', 'fx-cell fx-cell--fps');
  const notifier = createNotifier({ doc, status, toast, onChange: () => statusChips.update() });
  notifier.onPulse(forgePulse(() => padActuator()));        // FUI-4, R4: the haptics listen on the one pulse path
  statusBar.append(status, notifier.logButton, statusChips.element, sMode, sCounts, sCam, sSpeed, sFps, notifier.log, notifier.live);
  // The loading veil over the viewport, the in-page dialog, the controls card.
  const loading = el(doc, 'div', 'fx-loading');
  const loadingTitle = el(doc, 'div', 'fx-loading-title', 'Loading');
  const loadingBar = el(doc, 'div', 'fx-loading-bar');
  const loadingFill = el(doc, 'div', 'fx-loading-fill');
  const loadingLine = el(doc, 'div', 'fx-loading-line', '');
  loadingBar.append(loadingFill);
  loadingBar.setAttribute('role', 'progressbar');                 // FUI-4 (VP-13): read as progress, not a picture of it
  loadingBar.setAttribute('aria-valuemin', '0');
  loadingBar.setAttribute('aria-valuemax', '100');
  loadingBar.setAttribute('aria-valuenow', '0');
  loadingBar.setAttribute('aria-labelledby', 'fx-loading-title');
  loadingTitle.id = 'fx-loading-title';
  loading.append(loadingTitle, loadingBar, loadingLine);
  loading.hidden = true;
  viewport.append(loading);
  shell.register({
    id: 'viewport', title: 'Viewport', dock: 'center', order: 0, defaultOpen: true, tab: 'Viewport', movable: false, padLegend: [],
    mount(host) {
      host.append(viewport);
      return { dispose: () => { viewport.remove(); } };
    },
  });
  const modal = el(doc, 'div', 'fx-modal');
  modal.hidden = true;
  /**
   * FUI-2 (the review's IA-1, IA-2, IA-13, UX-3): the dialog's one owner -- a stack of cards on `modal` (`./shell/cards`):
   * Esc and Circle the top card's way back, each card a dialog with its focus trapped and given back.
   */
  const cards = createCardStack(doc, modal);
  cards.onChange = () => leaseCheck();
  /** FUI-2 (IA-1): the map check's list on demand, a sheet beside the editor (not a dialog: nothing waits on it). */
  const checkSheet = el(doc, 'div', 'fx-check-sheet');
  checkSheet.hidden = true;
  const help = el(doc, 'div', 'fx-modal');
  help.hidden = true;
  const helpCard = el(doc, 'div', 'fx-card fx-help');
  const keyRows = (heading: string, rows: [string, string][]): string =>
    `<section><h3>${heading}</h3><dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl></section>`;
  helpCard.innerHTML = `<header><h2>Controls</h2><span class="fx-dim">Build, then Play to walk it</span></header><div class="fx-help-cols">${
    keyRows('Controller', [
      ['Left stick', 'Fly (walk in Play)'], ['Right stick', 'Look'], ['L2 / R2', 'Down / up'],
      ['&#x2715; Cross', 'Select or place at the centre'], ['Hold &#x2715;', 'Add to or take out of the selection'], ['L1 / R1', 'Previous / next tool (every tool, as the tools row)'], ['D-pad &#x2191; &#x2193;', 'Previous / next prop (a character with the NPC tool)'],
      ['D-pad &#x2190; &#x2192;', 'Turn the selection by the turn step'], ['Hold &#x25cb; + sticks', 'Move the selection (right stick: height)'],
      ['&#x25cb; Circle', 'Deselect'], ['&#x25a1; Square', 'Duplicate'], ['&#x25b3; Triangle', 'Delete'], ['SELECT', 'Undo'], ['Hold SELECT', 'Redo'],
      ['L3', 'Snap on / off'], ['R3', 'Frame the selection'], ['START', 'The forge menu: Play, Walk, base, palette, view, save'], ['Stick at its rim', 'Fly faster'], ['Walking', '&#x2715; jump &#xb7; &#x25cb; stance &#xb7; &#x25a1; action (doors) &#xb7; START back'], ['In the match', 'The game&#x2019;s own controls &#xb7; hold SELECT + START: back to the forge'],
    ])}${keyRows('Pointer', [
      ['Click', 'Select, or place in Place / Spawn'], ['Shift or Ctrl + click', 'Add to or take out of the selection (the outliner too)'],
      ['Drag on empty world', 'Box-select; Shift + drag adds to the selection'], ['Right-drag', 'Look while held; release to stop'],
      ['Middle-drag', 'Pan in the camera plane'], ['Alt + left-drag', 'Orbit around the point under the cursor'],
      ['Alt + right-drag', 'Dolly toward / away from the point under the cursor'], ['Alt + middle-drag', 'Pan the camera'],
      ['Drag the gizmo', 'Move or turn the selection'], ['Wheel', 'Move forward / back in Perspective; zoom in / out in orthographic views; hold RMB to change fly speed'],
      ['Double-click a row', 'Frame it (outliner)'],
    ])}${keyRows('Keyboard and mouse', [
      ['Right-click', 'Hold to look / fly; release to stop &#xb7; wheel changes speed while held'],
      ['W A S D &#xb7; Q / E', 'Fly / move down or up while holding RMB'], ['Shift / Ctrl', 'Move 2x faster / stop while flying'],
      ['R / F', 'Move up / down in camera space while holding RMB'],
      ['Z / C', 'Widen / narrow the view while holding RMB'], ['Esc', 'Release the mouse lock'],
      ...forgeToolKeyHelp((t) => TOOL_NAMES[t]),                // FP-1b: the keys' real order, never a literal list
      FORGE_TRANSFORM_STUBS_HIDDEN_ADAPTATION ? ['W / E / G', 'Move / rotate / snap'] : ['W / E / R / G', 'Move / rotate / scale / snap'], ['C / Del', 'Duplicate / delete'], ['[ / ]', 'Previous / next prop (a character with the NPC tool)'], [', / .', 'Turn the selection by the turn step'],
      ['M', 'The forge menu (arrows, Enter, Esc)'], ['Ctrl+C / Ctrl+V', 'Copy / paste the selection at the cursor'], ['Ctrl+Z / Ctrl+Y', 'Undo / redo'], ['F / H / P / V', 'Frame / docks / play / walk'],
      ['Walking', 'W A S D &#xb7; mouse &#xb7; Space jump &#xb7; C stance &#xb7; X doors &#xb7; V, P or Esc back'], ['In the match', 'The controller (the keyboard is not the match&#x2019;s)'],
    ])}</div><footer><button type="button" class="fx-tool fx-primary">Close</button></footer>`;
  help.append(helpCard);
  const dockGuides = el(doc, 'div', 'fx-dock-guides');
  dockGuides.setAttribute('aria-label', 'Panel docking targets');
  const dockPreview = el(doc, 'div', 'fx-dock-preview');
  const dropZones = ['left', 'right', 'top', 'bottom', 'center'] as const;
  type DockDropZone = (typeof dropZones)[number];
  type TabDragPayload = { dock: DockDropZone; tab: string };
  const dockElements: Record<DockDropZone, HTMLElement> = { left, right, top: topDock, bottom: bottomDock, center: centerDock };
  let draggedTab: TabDragPayload | null = null;
  const clearDockDrop = (): void => {
    draggedTab = null;
    dockGuides.classList.remove('is-active');
    dockPreview.removeAttribute('data-zone');
    dockGuides.querySelectorAll('.is-drop-active').forEach((item) => item.classList.remove('is-drop-active'));
  };
  for (const zone of dropZones) {
    const target = el(doc, 'button', `fx-dock-target fx-dock-target--${zone}`, zone === 'center' ? 'Center' : zone);
    target.type = 'button';
    target.dataset['forgeDockTarget'] = zone;
    target.addEventListener('dragover', (event) => {
      event.preventDefault();
      dockPreview.dataset['zone'] = zone;
      dockGuides.querySelectorAll('.is-drop-active').forEach((item) => item.classList.remove('is-drop-active'));
      target.classList.add('is-drop-active');
    });
    target.addEventListener('drop', (event) => {
      event.preventDefault();
      const raw = event.dataTransfer?.getData('application/x-forge-tab');
      let payload = draggedTab;
      if (!payload && raw) {
        try {
          const parsed = JSON.parse(raw) as { dock?: unknown; tab?: unknown };
          if (typeof parsed.dock === 'string' && dropZones.includes(parsed.dock as DockDropZone) && typeof parsed.tab === 'string') {
            payload = { dock: parsed.dock as DockDropZone, tab: parsed.tab };
          }
        } catch { /* an invalid or unavailable transfer payload is ignored */ }
      }
      if (!payload) return;
      try { shell.moveTab(payload.dock, payload.tab, zone); }
      finally { clearDockDrop(); }
    });
    dockGuides.append(target);
  }
  const dockSizeKey = 'forge.dock.sizes.v1';
  // The right dock wide enough for the Inspector's transform rows (caption, three fields, reset) without a value cut off.
  const defaultDockSizes = { left: 270, right: 360, top: 180, bottom: 180 };
  const dockSizes = { ...defaultDockSizes };
  try {
    const saved = JSON.parse(pageSettings.get(dockSizeKey) ?? '{}') as Partial<typeof dockSizes>;
    if (Number.isFinite(saved.left)) dockSizes.left = Math.min(600, Math.max(180, saved.left!));
    if (Number.isFinite(saved.right)) dockSizes.right = Math.min(600, Math.max(180, saved.right!));
    if (Number.isFinite(saved.top)) dockSizes.top = Math.min(500, Math.max(100, saved.top!));
    if (Number.isFinite(saved.bottom)) dockSizes.bottom = Math.min(500, Math.max(100, saved.bottom!));
  } catch { /* use the default dock sizes */ }
  doc.body.style.setProperty('--fx-left', `${dockSizes.left}px`);
  doc.body.style.setProperty('--fx-right', `${dockSizes.right}px`);
  doc.body.style.setProperty('--fx-dock-top', `${dockSizes.top}px`);
  doc.body.style.setProperty('--fx-dock-bottom', `${dockSizes.bottom}px`);
  for (const edge of ['left', 'right', 'top', 'bottom'] as const) {
    const handle = el(doc, 'div', `fx-dock-resizer fx-dock-resizer--${edge}`);
    handle.dataset['edge'] = edge;
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', edge === 'left' || edge === 'right' ? 'vertical' : 'horizontal');
    handle.setAttribute('aria-label', `Resize ${edge} dock`);
    handle.tabIndex = 0;
    doc.body.append(handle);
    let drag: { pointerId: number; x: number; y: number; initial: number } | null = null;
    const sizeOf = (): number => dockSizes[edge];
    const applySize = (value: number): void => {
      dockSizes[edge] = edge === 'left' || edge === 'right'
        ? Math.min(600, Math.max(180, value))
        : Math.min(500, Math.max(100, value));
      const property = edge === 'left' ? '--fx-left' : edge === 'right' ? '--fx-right' : edge === 'top' ? '--fx-dock-top' : '--fx-dock-bottom';
      doc.body.style.setProperty(property, `${dockSizes[edge]}px`);
      pageSettings.set(dockSizeKey, JSON.stringify(dockSizes));
    };
    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, initial: sizeOf() };
      handle.setPointerCapture(event.pointerId);
      handle.classList.add('is-resizing');
    });
    handle.addEventListener('pointermove', (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const delta = edge === 'left' ? event.clientX - drag.x
        : edge === 'right' ? drag.x - event.clientX
          : edge === 'top' ? event.clientY - drag.y : drag.y - event.clientY;
      applySize(drag.initial + delta);
    });
    const endResize = (event: PointerEvent): void => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      drag = null;
      handle.classList.remove('is-resizing');
    };
    handle.addEventListener('pointerup', endResize);
    handle.addEventListener('pointercancel', endResize);
    handle.addEventListener('keydown', (event) => {
      const direction = edge === 'left' || edge === 'top' ? 1 : -1;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      event.preventDefault();
      const positive = event.key === 'ArrowRight' || event.key === 'ArrowDown';
      applySize(sizeOf() + (positive ? direction : -direction) * (event.shiftKey ? 40 : 10));
    });
  }
  resetLayoutBtn.addEventListener('click', () => {
    shell.resetLayout();
    Object.assign(dockSizes, defaultDockSizes);
    doc.body.style.setProperty('--fx-left', `${dockSizes.left}px`);
    doc.body.style.setProperty('--fx-right', `${dockSizes.right}px`);
    doc.body.style.setProperty('--fx-dock-top', `${dockSizes.top}px`);
    doc.body.style.setProperty('--fx-dock-bottom', `${dockSizes.bottom}px`);
    pageSettings.set(dockSizeKey, JSON.stringify(dockSizes));
    setDocks((globalThis.innerWidth ?? 1280) > 760);
  });
  doc.addEventListener('dragstart', (event) => {
    const tab = (event.target as Element | null)?.closest<HTMLElement>('[data-forge-tab]');
    if (!tab) return;
    const dock = dropZones.find((zone) => dockElements[zone].contains(tab));
    const key = tab.dataset['forgeTab'];
    if (!dock || !key) return;
    draggedTab = { dock, tab: key };
    dockGuides.classList.add('is-active');
    dockGuides.append(dockPreview);
  });
  doc.addEventListener('dragend', clearDockDrop);
  /**
   * The placing tools on a row of their own under the toolbar (the owner, 2026-11-06), in labelled sections (the owner,
   * 2026-11-06; a browser adaptation, FG.R2): Spawn (spawns, respawn points), Objects (door to turret, flares), then
   * Demolition's bomb and sites, Escort's and Extraction's hostages and zones (`MODE_TOOL_TYPES`, which greys a section
   * the layout's game type does not play), Info (tactical points, spectator views) and Other (NPCs). Select and Place
   * stay on the toolbar.
   */
  const toolsRow = el(doc, 'nav', 'fx-tools-row');
  toolsRow.setAttribute('aria-label', 'Placing tools');
  toolsRow.setAttribute('data-mu-top-bar', '');           // the touch Menu keeps clear of it too (`TOUCH_MENU_BAR_SELECTOR`)
  const modeSection = (label: string, key: string, ...groups: HTMLElement[]): HTMLDivElement => {
    const sec = el(doc, 'div', 'fx-mode-section');
    sec.dataset['forgeModeSection'] = key;
    sec.setAttribute('role', 'group');
    sec.setAttribute('aria-label', label);
    sec.append(el(doc, 'span', 'fx-mode-section__label', label), ...groups);
    return sec;
  };
  toolsRow.append(
    modeSection('Spawn', 'spawn', group(modeBtns.spawnA, modeBtns.spawnB), group(modeBtns.respawnA, modeBtns.respawnB)),
    modeSection('Objects', 'objects', group(modeBtns.door, modeBtns.gate, modeBtns.barrier, modeBtns.ladder, modeBtns.turret, modeBtns.flare)),
    modeSection(FORGE_GAME_TYPE_NAME[2], 'demolition', group(modeBtns.bomb, modeBtns.siteSeal, modeBtns.siteTerrorist)),
    modeSection(`${FORGE_GAME_TYPE_NAME[3]} · ${FORGE_GAME_TYPE_NAME[4]}`, 'escort', group(modeBtns.hostage, modeBtns.zone)),
    modeSection('Info', 'info', group(modeBtns.point, modeBtns.view)),
    modeSection('Other', 'other', group(modeBtns.npc)),
  );
  doc.body.append(top, toolsRow, left, right, topDock, bottomDock, centerDock, dockGuides, statusBar, checkSheet, modal, help, workspaceDock, selectSettings, playSettings);
  /*
   * The early tap (product track, a browser adaptation with no original; shadow's GPU trace at 1da70bdac): the shell is on
   * the page from here while the renderer starts below (WebGPU's start, slow on a real GPU), its listeners wired only
   * after it. A press on the toolbar meanwhile is held and pressed once the page is wired (`./shell/earlyPress`; help and
   * reset-layout are wired already), and the controls that act on the scene -- the placing tools, the viewport, the
   * modes, the edits, Walk, Check, Create lobby, Save map and Play -- are inert until then. Open too: its press opens the
   * file chooser, which a browser allows only within a user activation's few seconds, so a replay after a slow start
   * could do nothing (its listener reads `refuseUnderCard` and `lobby`, made after the await, so it cannot be wired
   * early). Nothing changes once wired.
   */
  const earlyPresses = holdEarlyPresses(top, [helpBtn, resetLayoutBtn]);
  const untilWired: HTMLElement[] = [toolsRow, viewport, openBtn, modeBtns.select, modeBtns.place, dupBtn, delBtn, undoBtn, redoBtn, walkBtn, checkBtn, lobbyBtn, saveMapBtn, playBtn];
  for (const c of untilWired) c.toggleAttribute('inert', true);
  // The wrapped toolbar's height, so the docks and the viewport (top: var(--fx-top)) follow it.
  const fitToolbar = (): void => {
    const h = top.offsetHeight;
    if (h <= 0) return;
    // The tools' row under it (`--fx-top-bar` the toolbar's own), and the docks under both.
    doc.body.style.setProperty('--fx-top-bar', `${h}px`);
    doc.body.style.setProperty('--fx-top', `${h + (toolsRow.hidden ? 0 : toolsRow.offsetHeight)}px`);
  };
  fitToolbar();
  new ResizeObserver(fitToolbar).observe(top);
  new ResizeObserver(fitToolbar).observe(toolsRow);
  /** FUI-2: a card's buttons the pad walks (`./shell/padFocus`). */
  const padItems = (...items: HTMLElement[]): void => { for (const i of items) i.dataset['padItem'] = ''; };
  /**
   * The page's own confirm (no browser dialog): a card with the question and two buttons, on the card stack (FUI-2).
   * `danger` (the review's PAD-2, IA-13): a destructive question -- Cancel focused first, the act drawn as danger; Cross
   * presses the focused button, so a second Cross is never a yes. Esc and Circle are Cancel.
   */
  const askConfirm = (heading: string, body: string, yes = 'Continue', danger = false): Promise<boolean> => new Promise((resolve) => {
    const card = el(doc, 'div', 'fx-card');
    const no = el(doc, 'button', 'fx-tool', 'Cancel');
    const ok = el(doc, 'button', danger ? 'fx-tool fx-danger' : 'fx-tool fx-primary', yes);
    no.setAttribute(CARD_SAFE_ATTR, '');
    padItems(no, ok);
    const foot = el(doc, 'footer');
    foot.append(no, ok);
    card.append(el(doc, 'h2', '', heading), el(doc, 'p', '', body), foot);
    let handle: CardHandle | null = null;
    const done = (v: boolean): void => { handle?.close(); resolve(v); };
    no.addEventListener('click', () => done(false));
    ok.addEventListener('click', () => done(true));
    handle = cards.open(card, { onBack: () => done(false), initialFocus: ok, label: heading, danger });
  });
  /**
   * FG-26: the page's own question with a line to type (no browser dialog): the text, or null when cancelled. FG-45:
   * `extra`, a control drawn under the line (the create's visibility toggle), read by the caller.
   */
  const askText = (heading: string, body: string, value: string, max: number, yes: string, extra: HTMLElement | null = null, secret = false): Promise<string | null> => new Promise((resolve) => {
    const card = el(doc, 'form', 'fx-card');
    const field = el(doc, 'input', 'fx-search');
    // FG-48a: `secret`, a password -- masked, taken as typed (never trimmed), never filled by the browser.
    field.type = secret ? 'password' : 'text';
    if (secret) field.autocomplete = 'off';
    field.value = value;
    field.maxLength = max;
    const no = el(doc, 'button', 'fx-tool', 'Cancel');
    no.type = 'button';
    const ok = el(doc, 'button', 'fx-tool fx-primary', yes);
    ok.type = 'submit';
    const foot = el(doc, 'footer');
    foot.append(no, ok);
    card.append(el(doc, 'h2', '', heading), el(doc, 'p', '', body), field, ...(extra ? [extra] : []), foot);
    // FUI-2: on the card stack. The pad walks the line, Cancel and the act; Cross on the line only focuses it (the pad's
    // own keyboard is FUI-8's), so it never sends the prefill unread. Esc and Circle are Cancel.
    padItems(field, no, ok);
    let handle: CardHandle | null = null;
    const done = (v: boolean): void => { const text = v ? (secret ? field.value : field.value.trim()) : null; handle?.close(); resolve(text); };
    no.addEventListener('click', () => done(false));
    card.addEventListener('submit', (e) => { e.preventDefault(); done(true); });   // Enter in the field is the form's own
    handle = cards.open(card, { onBack: () => done(false), initialFocus: field, label: heading });
    field.select();
  });
  /**
   * The page's own question with a list to choose from (no browser dialog; the owner, 2026-11-06): the value chosen, or
   * null when cancelled. `options` grouped (`[group, [[value, label], ...]]`), `value` chosen at first.
   */
  const askChoice = (heading: string, body: string, options: readonly (readonly [string, readonly (readonly [string, string, string?])[]])[], value: string, yes: string): Promise<string | null> => new Promise((resolve) => {
    const card = el(doc, 'form', 'fx-card');
    const field = el(doc, 'select', 'fx-select');
    field.setAttribute('aria-label', heading);
    for (const [label, rows] of options) {
      if (!rows.length) continue;
      const g = el(doc, 'optgroup');
      g.label = label;
      for (const [v, w, t] of rows) { const o = el(doc, 'option', '', w); o.value = v; if (t) o.title = t; g.append(o); }   // FP-6 2: a row's title
      field.append(g);
    }
    if (value) field.value = value;
    const no = el(doc, 'button', 'fx-tool', 'Cancel');
    no.type = 'button';
    const ok = el(doc, 'button', 'fx-tool fx-primary', yes);
    ok.type = 'submit';
    const foot = el(doc, 'footer');
    foot.append(no, ok);
    card.append(el(doc, 'h2', '', heading), el(doc, 'p', '', body), field, foot);
    // FUI-2: on the card stack; the pad walks the list, Cancel and the act. Esc and Circle are Cancel.
    padItems(field, no, ok);
    let handle: CardHandle | null = null;
    const done = (v: boolean): void => { handle?.close(); resolve(v && field.value ? field.value : null); };
    no.addEventListener('click', () => done(false));
    card.addEventListener('submit', (e) => { e.preventDefault(); done(true); });
    handle = cards.open(card, { onBack: () => done(false), initialFocus: field, label: heading });
  });
  /**
   * Before work is dropped (the owner, 2026-11-06: New over an edited layout): save it first, drop it, or stay. The
   * page's own card (no browser dialog): 'save', 'discard', or null when cancelled (Esc, Circle, Cancel).
   */
  const askSaveFirst = (heading: string, body: string): Promise<'save' | 'discard' | null> => new Promise((resolve) => {
    const card = el(doc, 'div', 'fx-card');
    const no = el(doc, 'button', 'fx-tool', 'Cancel');
    const drop = el(doc, 'button', 'fx-tool fx-danger', 'Don’t save');
    const keep = el(doc, 'button', 'fx-tool fx-primary', 'Save first');
    no.setAttribute(CARD_SAFE_ATTR, '');
    padItems(no, drop, keep);
    const foot = el(doc, 'footer');
    foot.append(no, drop, keep);
    card.append(el(doc, 'h2', '', heading), el(doc, 'p', '', body), foot);
    let handle: CardHandle | null = null;
    const done = (v: 'save' | 'discard' | null): void => { handle?.close(); resolve(v); };
    no.addEventListener('click', () => done(null));
    drop.addEventListener('click', () => done('discard'));
    keep.addEventListener('click', () => done('save'));
    handle = cards.open(card, { onBack: () => done(null), initialFocus: keep, label: heading });
  });
  /** FG-26: the page's own notice card (one button). */
  const tellCard = (heading: string, body: string): Promise<void> => new Promise((resolve) => {
    const card = el(doc, 'div', 'fx-card');
    const ok = el(doc, 'button', 'fx-tool fx-primary', 'OK');
    padItems(ok);
    const foot = el(doc, 'footer');
    foot.append(ok);
    card.append(el(doc, 'h2', '', heading), el(doc, 'p', '', body), foot);
    let handle: CardHandle | null = null;
    const done = (): void => { handle?.close(); resolve(); };
    ok.addEventListener('click', done);
    handle = cards.open(card, { onBack: done, initialFocus: ok, label: heading });          // FUI-2: on the card stack
  });
  const setHelp = (on: boolean): void => { help.hidden = !on; leaseCheck(); };
  helpBtn.addEventListener('click', () => setHelp(true));
  help.addEventListener('click', (e) => { if (e.target === help || (e.target as HTMLElement).closest('footer button')) setHelp(false); });
  const showLoading = (heading: string | null): void => {
    loading.hidden = heading === null;
    if (heading !== null) { loadingTitle.textContent = heading; loadingFill.style.width = '0%'; loadingBar.setAttribute('aria-valuenow', '0'); loadingLine.textContent = ''; }
  };

  /**
   * FUI-4 (`./shell/notify`; the review's IA-12, UX-5): the line (`say`, an error kept until replaced) and the toast
   * (`pop`, a passing event) are the notifier's: every notice also reaches the message log and the live region.
   */
  const say = (line: string, bad = false): void => { notifier.say(line, bad); };
  const pop = (line: string): void => { notifier.toast(line); };

  /* ================= the renderer, the camera, the scene ================= */
  showLoading('Starting the Forge');                         // the early tap: the shell is inert in part meanwhile, and says why
  // The early tap: a renderer that never starts is said, not left as "Starting the Forge" (the page stops, as before).
  const created = await createRenderer(canvas).catch((e: unknown) => {
    showLoading(null);
    say(`the renderer did not start: ${e instanceof Error ? e.message : String(e)}`, true);
    throw e;
  });
  showLoading(null);
  /*
   * R7-2 (owed by FCW-07b-2; product track, a browser adaptation with no original): the extension host, composed here
   * and only here -- the renderer's one seam (`visualPostSeams`, claimed once, for the renderer this page made) and the
   * page's one engine handler (`visualTintHandler`) -- and handed to a panel as `ctx.host` (`ForgePageContext.host`), so
   * FCW-08's registrant reaches `catalogue()` and `register`. Nothing registers or enables a system by itself. Disposed
   * with the page (`teardown`).
   */
  extensions = createExtensionHost({ seams: rendererSeams(created), handlers: [visualTintHandler] });
  const scene = new Scene();
  let fly!: FlyCamera;
  const cameraCollisionRay = new Raycaster();
  fly = new FlyCamera(canvas, {
    forgeKbm: true,                                                // OT.R68: its keys and captured look in every build
    pointerInput: input,
    // The camera's own return to perspective (a Walk from Top, Front...): the view menu says so (a browser adaptation, FG.R2).
    onViewportViewChange: (view) => { syncViewportViewMenu(view); gizmo.camera = fly.viewportCamera(); },
    constrainMovement: (from, to, radius) => {
      const camera = fly.viewportCamera();
      camera.updateMatrixWorld();
      const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
      const up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize();
      const offsets = [
        new Vector3(),
        right.clone().multiplyScalar(radius * 0.75),
        right.clone().multiplyScalar(-radius * 0.75),
        up.clone().multiplyScalar(radius * 0.75),
        up.clone().multiplyScalar(-radius * 0.75),
      ];
      const targets: Object3D[] = [...roots];
      if (baseView) targets.push(baseView.group);
      const position = from.clone();
      let remaining = to.clone().sub(from);
      const normals: Vector3[] = [];
      for (let slide = 0; slide < 3 && remaining.lengthSq() > 1e-8; slide++) {
        const distance = remaining.length();
        const direction = remaining.clone().multiplyScalar(1 / distance);
        let nearest: Intersection | null = null;
        for (const offset of offsets) {
          cameraCollisionRay.set(position.clone().add(offset), direction);
          cameraCollisionRay.near = 0;
          cameraCollisionRay.far = distance + radius;
          const hit = cameraCollisionRay.intersectObjects(targets, true).find((candidate) => {
            for (let at: Object3D | null = candidate.object; at; at = at.parent) if (!at.visible) return false;
            return true;
          });
          if (hit && (!nearest || hit.distance < nearest.distance)) nearest = hit;
        }
        if (!nearest || nearest.distance > distance) {
          position.add(remaining);
          break;
        }
        const safeDistance = Math.max(0, nearest.distance - radius * 0.25);
        position.addScaledVector(direction, safeDistance);
        remaining.addScaledVector(direction, -safeDistance);
        const normal = nearest.face
          ? nearest.face.normal.clone().applyMatrix3(new Matrix3().getNormalMatrix(nearest.object.matrixWorld)).normalize()
          : direction.clone().negate();
        if (normal.dot(direction) > 0) normal.negate();
        normals.push(normal);
        remaining.projectOnPlane(normal);
      }
      return { position, normals };
    },
    panDepthAt: (clientX, clientY) => {
      const rect = input.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      const hit = pick(new Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      ));
      if (!hit) return null;
      fly.viewportCamera().updateMatrixWorld();
      return hit.point.clone().sub(fly.viewportCamera().position).dot(fly.viewportCamera().getWorldDirection(new Vector3()));
    },
    pivotAt: (clientX, clientY) => {
      const rect = input.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      const ndc = new Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      const hit = pick(ndc);
      if (hit) return hit.point.clone();
      fly.viewportCamera().updateMatrixWorld();
      ray.setFromCamera(ndc, fly.viewportCamera());
      return ray.ray.at(FORGE_PIVOT_FALLBACK_DEPTH_ADAPTATION, new Vector3());
    },
    onLockChange: updateCrosshair,
    onLookHoldChange: updateCrosshair,
    onFovChange: (degrees) => {
      cameraFovInput.value = String(degrees);
      cameraFovValue.textContent = `${Math.round(degrees)}°`;
    },
    onFire: (down) => { if (down && !playing) act(new Vector2(0, 0)); },
    onSpeedChange: (m, source) => {
      sSpeed.textContent = `speed ×${m.toFixed(2)}`;
      cameraSpeedInput.value = String(m);
      cameraSpeedValue.textContent = m.toFixed(1);
      const speedReadout = cameraSettingsSummary.querySelector('.fx-camera-speed-button-value');
      if (speedReadout) speedReadout.textContent = m.toFixed(1);
      if (source !== 'wheel') return;
      if (cameraSettings.open || viewMenu.open) {
        hideCameraSpeedFeedback();
        return;
      }
      cameraSpeedFeedbackFill.style.width = `${((m - 0.1) / (16 - 0.1)) * 100}%`;
      cameraSpeedFeedbackValue.textContent = `×${m.toFixed(1)}`;
      cameraSpeedFeedback.classList.add('is-on');
      if (cameraSpeedFeedbackTimer !== null) clearTimeout(cameraSpeedFeedbackTimer);
      cameraSpeedFeedbackTimer = setTimeout(() => {
        cameraSpeedFeedback.classList.remove('is-on');
        cameraSpeedFeedbackTimer = null;
      }, 1000);
    },
  });
  sSpeed.textContent = 'speed ×1.00';
  cameraSpeedInput.addEventListener('input', () => fly.setSpeedMultiplier(Number(cameraSpeedInput.value)));
  cameraFovInput.addEventListener('input', () => fly.setFov(Number(cameraFovInput.value)));
  cameraLookSpeedInput.addEventListener('input', () => {
    const multiplier = Number(cameraLookSpeedInput.value);
    fly.setLookSpeedMultiplier(multiplier);
    cameraLookSpeedValue.textContent = `${multiplier.toFixed(1)}×`;
  });
  cameraCollisionInput.addEventListener('change', () => fly.setCameraCollisionEnabled(cameraCollisionInput.checked));
  // FP-2 (FP.R5; a browser adaptation, FG.R2 -- the game has no editor): the viewport draws at the player's RENDER SCALE,
  // the page's one stored video setting (`../videoSettings`, CPS.R7; no Forge-only setting), wired as `../matchMount`
  // wires a match: `fit` caps the ratio at the preset's ceiling for the viewport's box, `AdaptiveRatio` (`../matchViewport`)
  // starts the renderer at the cap and trades pixels for frames under it in the frame's tail. The PS2 picture keeps its
  // 640 x 448 at ratio 1 (`../renderer`). The renderer's ratio only where it has one (a test's stand-in may not), as
  // `../matchRenderer` `ratioTargetOf` reads it. The keeper is the Draw dropdown's (`videoSettings`, above).
  let renderScale = videoSettings.get().renderScale;
  const adaptiveRatio = new AdaptiveRatio(pixelRatioCap(globalThis.devicePixelRatio, wantsTouchControls()));
  const ratioTarget: RatioTarget | null = typeof created.setPixelRatio === 'function' && typeof created.pixelRatio === 'function' ? created : null;
  const fit = (): void => {
    // Not before the stylesheet is in (a development build injects it late): unstyled, the viewport takes its height
    // from the canvas, and each resize would grow the other. In the center tab it is relative to fill its panel.
    if (getComputedStyle(viewport).position === 'static') { requestAnimationFrame(fit); return; }
    const w = Math.max(1, viewport.clientWidth), h = Math.max(1, viewport.clientHeight);
    adaptiveRatio.setCap(renderCapFor(renderScale, globalThis.devicePixelRatio, wantsTouchControls(), w, h).ratioCap);   // FP-2: met at the ratio's next tick
    created.resize(w, h);
    fly.setAspect(created.presentation() === 'ps2' ? 640 / 448 : w / h);
  };
  new ResizeObserver(fit).observe(viewport);
  fit();
  if (ratioTarget) adaptiveRatio.start(ratioTarget);          // FP-2: at `fit`'s cap (the device's, while the stylesheet is late)
  // FP-2: a render scale stepped here or by another keeper of this page (the launcher's row, VIDEO OPTIONS) refits and
  // redraws the Draw dropdown's row; released at teardown. Another browser tab's step is read at this page's next mount
  // (the keeper hears this page's keepers only, no `storage` event).
  const offVideoSettings = videoSettings.observe((v) => {
    if (v.renderScale !== renderScale) { renderScale = v.renderScale; fit(); }
    viewportRenderScaleDom.sync();
  });
  const lighting: Lighting = { ...DEFAULT_LIGHTING };
  const fog: FogSettings = { enabled: true, ...fogForExtent(1200), color: [...ELF_DEFAULT_FOGCOL], altitude: null };
  /** FG-24: the base's own fog (the disc's, or the forge's stand-in), what the layout's fog distance is put over. */
  let discFog: FogSettings = { ...fog, color: [...fog.color] };
  /** FG-24: the layout's settings, whole (`./layout` `settingsOf`); the layout keeps what differs from the disc's. */
  let settings: LayoutSettings = { ...DEFAULT_SETTINGS };
  /**
   * FG-51: the game type the settings name. A layout that names none takes its base map's own (the owner, 2026-11-06: no
   * "Map's own" choice): `ownTypeOf`. Null only while the disc's mission list is still being read (`typePending`).
   */
  let authoredType: ForgeGameType | null = null;
  /**
   * The disc's mission list read (`labelBaseTypes`: READERC's `missionlist.rdr`, `../loadout` `kitGameType`), or not yet;
   * `missionKits` null once read means the source has none.
   */
  let missionKits: Awaited<ReturnType<typeof loadKitSource>> = null;
  let missionKitsRead = false;
  /** The layout names no type and the mission list is not read yet: its type waits (and is written as none meanwhile). */
  let typePending = false;
  /**
   * A base's own game type: a disc map's TYPE in `missionlist.rdr` (`FUN_002c9540` D:L168844-168906), the type a match on
   * it plays with none named; SUPPRESSION (5) for a map off the list, a blank floor or an authored map -- what the room
   * plays there (`../loadout` `kitGameType`: undefined, SUPPRESSION's rules). Null while the list is not read yet.
   */
  const ownTypeOf = (b: LayoutBase | null): ForgeGameType | null => {
    if (!missionKitsRead) return null;
    const own = b?.kind === 'map' ? kitGameType(missionKits, b.archive) : undefined;
    return own === 1 || own === 2 || own === 3 || own === 4 || own === 5 ? own : 5;
  };
  /** Keys of an opened objectives block this slice does not edit (`escortees`, ...), kept across a save. */
  let objectiveRest: Record<string, unknown> = {};
  /**
   * R3-B (FCW-07a part 2): the packs the open layout declares beyond its pieces' own (`Layout.requires`) and its creator
   * mode (`Layout.mode`), kept as they were and written back (`layoutNow`): this page edits neither.
   */
  let layoutRequires: PackRef[] = [];
  let layoutMode: RecordMode | null = null;
  /**
   * FCW-32 (a browser adaptation, the Forge's own authoring): the layout's rules entities and its rules
   * (`./rulesAuthoring`), kept as data and written back (`layoutNow`); the agent's edits change them
   * (`./agent/commands`). FCW-32 step 4 (FUI.R23): drawn in the editor's scene (`./rulesGizmos`), listed in the Outliner
   * and edited by hand with the Rules panel (`./panels/rulesPanel`), every edit the planner's through the facade.
   */
  let layoutEntities: Pick<Layout, 'zones' | 'markers' | 'spawners'> = {};
  let layoutRules: ForgeRulesDraft | null = null;
  /** FCW-32 step 4 (FUI.R23 D4): the rules entity the next click on the world (or Cross) places, or null. */
  let entityTool: RulesEntityKind | null = null;
  /** FCW-32 step 4 (D4): the rules entity picked from its Outliner row (`zone:<id>`, the planner's reference), or null. */
  let entityPicked: string | null = null;
  /** FCW-32 step 4: who hears that the layout's rules, its entities or the place mode changed (the Rules panel). */
  const rulesListeners = new Set<() => void>();
  const rulesChanged = (): void => { for (const fn of [...rulesListeners]) fn(); };
  /** Keys of an opened bomb block this slice does not edit (`bases`, ...), kept while a bomb marker is placed. */
  let bombRest: Record<string, unknown> = {};
  const overlays = new Overlays(scene);
  /** The base map's own data as billboards (`./mapDataBillboards`), redrawn with each base (`drawMapBillboards`). */
  const mapBillboards = new MapDataBillboards(scene);
  /** The base map's light rig as arrows (`./lightArrows`), set with each base; under Billboards › Light directions. */
  const lightArrows = new LightArrows(scene);
  /** The base map's tactical zones as ground rectangles (`zoneOutlines`), shown with their billboards' switch. */
  let mapZoneLines: LineSegments | null = null;
  /** The map's own doors' swings and ladders' climb sides (`./interactOverlay`), each with its billboards' switch. */
  let mapDoorGuides: Object3D | null = null;
  let mapLadderGuides: Object3D | null = null;
  let mapTurretGuides: Object3D | null = null;
  let mapHostageGuides: Object3D | null = null;
  let mapViewGuides: Object3D | null = null;
  let mapAccessGuides: Object3D[] = [];
  /**
   * An editor guide (`guideGroup`: its outline and its translucent fill), both moved by `m` into its owner's frame,
   * tagged with its kind; always drawn in the editor, the billboards on or off.
   */
  function guideIn(segments: number[], triangles: number[], m: Matrix4 | null, colour: number, toggle: string): Object3D {
    const v = new Vector3();
    const moved = (list: number[]): number[] => {
      if (!m) return list;
      const out = list.slice();
      for (let i = 0; i + 2 < out.length; i += 3) { v.set(out[i]!, out[i + 1]!, out[i + 2]!).applyMatrix4(m); out[i] = v.x; out[i + 1] = v.y; out[i + 2] = v.z; }
      return out;
    };
    const g = guideGroup(moved(segments), moved(triangles), colour, `forge guide ${toggle}`);
    // Shown with the gizmos (the Billboards menu's Gizmos switch), whatever the billboards' own switches.
    g.userData['forgeGuideKind'] = toggle;
    g.visible = view.spawns;
    return g;
  }
  /**
   * A turret's guide (`turretShapes`): at its gun's pivot on its root's floor, its facing and its yaw limits (the
   * placement keeps them in radians, the parser's conversion), the arc a reach the turret's size.
   */
  function turretGuide(t: { origin: readonly number[]; gunOrigin: readonly number[]; facing: number; limits: { yaw: [number, number] | null } }) {
    const deg = (r: number): number => (r * 180) / Math.PI;
    const yaw = t.limits.yaw ? [deg(t.limits.yaw[0]), deg(t.limits.yaw[1])] as const : null;
    return turretShapes([t.gunOrigin[0]!, t.origin[1]!, t.gunOrigin[2]!], t.facing, yaw, 40);
  }
  /** A guide's geometries and materials let go. */
  function disposeGuide(g: Object3D): void {
    g.traverse((o) => {
      const mesh = o as Partial<Mesh>;
      mesh.geometry?.dispose();
      const mat = mesh.material as Material | Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose();
    });
  }
  /** The map's doors' and ladders' guides drawn afresh (a new base, its ladders re-read with a prop hidden). */
  /**
   * The map's guides drawn, never at the cost of the map: a guide that will not build (a record without its matrices)
   * is left out, and the base loads as it would with none.
   */
  function drawMapGuides(): void {
    try { drawMapGuidesNow(); } catch { /* the guides are an editor aid: none drawn sooner than a map refused */ }
  }
  function drawMapGuidesNow(): void {
    for (const g of [mapDoorGuides, mapLadderGuides, mapTurretGuides, mapHostageGuides, mapViewGuides]) if (g) { scene.remove(g); disposeGuide(g); }
    mapDoorGuides = mapLadderGuides = mapTurretGuides = mapHostageGuides = mapViewGuides = null;
    for (const g of mapAccessGuides) { scene.remove(g); disposeGuide(g); }
    mapAccessGuides = [];
    if (!baseMap) return;
    const polys = baseMap.ground ? groundPolygons(baseMap.ground) : [];
    const swings = (baseMap.doors ?? []).flatMap((d) => {
      const leaf = d.owners.flatMap((o) => { const w = baseMap!.ground?.owners[o]; return w ? polys.slice(w.first, w.first + w.count).map((q) => q.points) : []; });
      const sw = swingOf(d, leaf);
      return sw ? [sw] : [];
    });
    if (swings.length) {
      mapDoorGuides = guideIn(swings.flatMap(swingSegments), swings.flatMap(swingTriangles), null, DOOR_SWING_COLOUR, 'doors');
      scene.add(mapDoorGuides);
    }
    if (mapLadders.length) {
      mapLadderGuides = guideIn(mapLadders.flatMap(ladderSegments), mapLadders.flatMap(ladderTriangles), null, LADDER_CLIMB_COLOUR, 'ladders');
      scene.add(mapLadderGuides);
    }
    // Its turrets' facings and arcs, its hostages' facings (the reading's yaw, `HOSTAGE_FACING_READING`).
    const turrets = (baseMap.turrets ?? []).map((t) => turretGuide(t));
    if (turrets.length) {
      mapTurretGuides = guideIn(turrets.flatMap((s) => s.segments), turrets.flatMap((s) => s.triangles), null, TURRET_GUIDE_COLOUR, 'turrets');
      scene.add(mapTurretGuides);
    }
    // The map's hostages as the placed ones: a spawn's box alone at each start (`../overlays` `slotBoxSegments`).
    const hostageSlots = (baseMap.escortees ?? []).map((e): SpawnSlot => ({ side: 0, index: 0, position: [e.at[0], e.at[1] - HOSTAGE_START_LIFT_READING + 0.5, e.at[2]], onFloor: true, step: 0, facing: yawWay(e.yaw), loc: e.loc }));
    // Its gates' and C4 barriers' gizmos (`./placedAccess` `accessGizmo`): each lever at its own place.
    for (const t of accessTemplates(baseMap, baseMap.archive)) {
      const g = accessGizmo(t, 'disc');
      if (!g.segments.length) continue;
      const guide = guideIn(g.segments, g.triangles, null, t.kind === 'gate' ? GATE_GUIDE_COLOUR : BARRIER_GUIDE_COLOUR, t.kind === 'gate' ? 'gates' : 'actions');
      mapAccessGuides.push(guide);
      scene.add(guide);
    }
    // Its plant sites' reach (MPBOMB context actions): each action's own `actions.rdr` range and elevation (`../mapActions`).
    for (const a of baseMap.actions ?? []) {
      if (a.type.toUpperCase() !== 'MPBOMB') continue;
      const g = bombSiteShapes(a.at, a.range, a.elevation);
      if (!g.segments.length) continue;
      const guide = guideIn(g.segments, g.triangles, null, BOMB_SITE_GUIDE_COLOUR, 'actions');
      mapAccessGuides.push(guide);
      scene.add(guide);
    }
    // Its spectator views' looks: an arrow from each along its yaw and pitch (`SCENIC_VIEWS_READING`).
    const looks = (baseMap.scenicViews ?? []).map((v) => viewShapes(v.at, v.yaw, v.pitch, VIEW_ARROW_LENGTH));
    if (looks.length) {
      mapViewGuides = guideIn(looks.flatMap((s) => s.segments), looks.flatMap((s) => s.triangles), null, VIEW_GUIDE_COLOUR, 'scenicViews');
      scene.add(mapViewGuides);
    }
    if (hostageSlots.length) {
      mapHostageGuides = guideIn(Array.from(slotBoxSegments(hostageSlots)), [], null, HOSTAGE_GUIDE_COLOUR, 'escortees');
      scene.add(mapHostageGuides);
    }
  }
  /** The Billboards dropdown's settings on the marks: shown on a disc map, on top or not, each kind's switch. */
  const applyBillboards = (): void => {
    mapBillboards.setHiddenKinds(MAP_DATA_KIND_TOGGLES.filter((t) => billboardsOff.has(t.id)).flatMap((t) => t.kinds));
    mapBillboards.setOnTop(billboardsOnTop);
    // The user's marks show on a blank floor too; with no map the map's own are simply none.
    mapBillboards.setVisible(billboardsOn);
    // A disc map's rig, or a new empty map's own (or the one it is built from): the same arrows, the same switch.
    lightArrows.setVisible(lightDirections && (!!baseMap || base?.kind === 'blank'));
    if (mapZoneLines) mapZoneLines.visible = billboardsOn && !billboardsOff.has('tacZones');   // with the Z marks' switch
    baseView?.setFlaresShown?.(flareGlows);                     // the map's own glows, drawn or out of the way
    drawBillboardSwitches();
  };
  /**
   * FCW-32 step 4 (FUI.R23 D4; RULES_GIZMOS_ADAPTATION): the rules entities as wireframes in the editor's scene. Hidden
   * under Walk, Play and a camera shot (`rulesHidden`, completed once the match's state exists below); no layers toggle of
   * the View panel fits them (its overlays are the disc's), so Build always shows them. `input.dataset.rulesGizmos`
   * names what is drawn now (empty while hidden), as `input.dataset.pieces` names the pieces.
   */
  const rulesGizmos = createRulesGizmos({ label: canvasLabel });
  scene.add(rulesGizmos.group);
  let rulesHidden = (): boolean => playing;
  const syncRulesGizmos = (): void => {
    const shown = !rulesHidden();
    if (rulesGizmos.group.visible !== shown) rulesGizmos.group.visible = shown;
    const words = shown ? rulesGizmos.ids().join(',') : '';
    if (input.dataset['rulesGizmos'] !== words) input.dataset['rulesGizmos'] = words;
  };
  const drawRulesScene = (): void => {
    const refs = new Set([...(layoutEntities.zones ?? []).map((z) => `zone:${z.id}`), ...(layoutEntities.markers ?? []).map((m) => `marker:${m.id}`),
      ...(layoutEntities.spawners ?? []).map((s) => `spawner:${s.id}`)]);
    if (entityPicked !== null && !refs.has(entityPicked)) entityPicked = null;
    rulesGizmos.draw(layoutEntities, entityPicked);
    syncRulesGizmos();
  };

  gizmo = new TransformControls(fly.viewportCamera(), input);
  gizmo.setTranslationSnap(null);
  scene.add(gizmo.getHelper());
  /**
   * FG-47: a group's gizmo sits on a pivot at the group's centre (`./group` `centreOf`); its drag is applied to every
   * member live, from the members' places at the drag's start (`moved`, `turnedAbout`).
   */
  const pivot = new Object3D();
  scene.add(pivot);
  const mapPropProxy = new Object3D();
  scene.add(mapPropProxy);
  let dragFrom: { centre: Vec3; poses: Pose[] } | null = null;
  let duplicateModifierOnPointerDown = false;
  let pendingMapPropDrag: { source: BaseProp; before: string[] } | null = null;
  let pendingUserPropDrag: { source: Object3D; matrix: Matrix4; before: string[] } | null = null;
  let pendingGroupPropDrag: { sources: Object3D[]; poses: Pose[]; scales: Vector3[]; centre: Vec3; before: string[]; started: boolean; ended: boolean } | null = null;
  let groupPropDragStep: { step: OperationStep; before: string[] } | null = null;
  let mapPropDragStep: { step: OperationStep; before: string[] } | null = null;
  gizmo.addEventListener('objectChange', () => {
    if (gizmo.object === mapPropProxy && pendingMapPropDrag) {
      const pending = pendingMapPropDrag;
      pendingMapPropDrag = null;
      duplicateMapPropForDrag(pending.source, pending.before);
    }
    if (pendingUserPropDrag) {
      const pending = pendingUserPropDrag;
      pendingUserPropDrag = null;
      duplicateUserPropForDrag(pending.source, pending.matrix, pending.before);
    }
    if (gizmo.object === pivot && pendingGroupPropDrag && !pendingGroupPropDrag.started) {
      const pending = pendingGroupPropDrag;
      pending.started = true;
      void Promise.all(pending.sources.map(copyOf)).then((copies) => {
        const made: Object3D[] = [];
        copies.forEach((copy, i) => {
          if (!copy) return;
          applyPose(copy, pending.poses[i]!);
          copy.scale.copy(pending.scales[i]!);
          freshName(copy);
          addPlacement(copy);
          made.push(copy);
        });
        if (made.length === 0) {
          pendingGroupPropDrag = null;
          dragFrom = null;
          pivot.position.set(...pending.centre);
          pivot.quaternion.identity();
          placePivot();
          showSelection();
          say('Could not duplicate the selected user props', true);
          return;
        }
        personEdit('selection.duplicate', { refs: pending.before }, (step) => {
          pendingGroupPropDrag = null;
          picks.clear();
          picks.addAll(made);
          basePicks.clear();
          showSelection();
          dragFrom = { centre: pending.centre, poses: made.map(poseOf) };
          applyPivot(dragFrom);
          groupPropDragStep = { step, before: pending.before };
          edit(pending.before, step);
          if (pending.ended) {
            dragFrom = null;
            groupPropDragStep = null;
            edit(pending.before, step);
            placePivot();
          }
        }, true);
      }).catch((error: unknown) => {
        pendingGroupPropDrag = null;
        dragFrom = null;
        pivot.position.set(...pending.centre);
        pivot.quaternion.identity();
        placePivot();
        showSelection();
        say(`Could not duplicate the selected user props: ${String(error)}`, true);
      });
    } else if (gizmo.object === pivot && dragFrom && !pendingGroupPropDrag) applyPivot(dragFrom);
    refreshBox(); refreshInspector(); changed();
  });
  /**
   * STUB (a browser adaptation, FG.R2): the rotate gizmo's tilt rings -- X (pitch), Z (roll), the view ring (E) and the
   * free turn (XYZE) -- are drawn but not wired. Record v3 keeps a piece's yaw alone (`creator-contracts`
   * `recordOfLayout`), so a grab on one is stopped before the gizmo's own pointerdown and the page says so; Y turns.
   */
  const tiltRingStub = (e: PointerEvent): void => {
    if (e.button !== 0 || !gizmo.enabled || !gizmo.object) return;
    const axis = gizmo.axis;
    if (axis === null) return;
    // STUB: the scale tool -- its gizmo drawn, every handle stopped (the record keeps no scale either).
    if (gizmo.mode === 'scale') {
      e.stopImmediatePropagation();
      e.preventDefault();
      say('Scale is not wired yet: a saved layout keeps no scale');
      return;
    }
    if (gizmo.mode !== 'rotate' || axis === 'Y') return;
    e.stopImmediatePropagation();
    e.preventDefault();
    say(`${axis === 'X' ? 'Pitch' : axis === 'Z' ? 'Roll' : 'Free turn'} is not wired yet: a saved layout keeps a piece's yaw only`);
  };
  input.addEventListener('pointerdown', tiltRingStub, true);
  gizmo.addEventListener('dragging-changed', (e) => {
    if ((e as unknown as { value: boolean }).value) {
      if (gizmo.object === pivot) {
        const centre: Vec3 = [pivot.position.x, pivot.position.y, pivot.position.z];
        const poses = picks.items.map(poseOf);
        dragFrom = { centre, poses };
        if (duplicateModifierOnPointerDown && isGroup()) {
          const sources = picks.items.filter((r) => !lockedOf(r));
          pendingGroupPropDrag = {
            sources, poses: sources.map(poseOf), scales: sources.map((r) => r.scale.clone()), centre, before: selectionIds(), started: false, ended: false,
          };
          passOver('copied');
        } else passOver('moved');
      }
      else if (gizmo.object === mapPropProxy && baseSelected && duplicateModifierOnPointerDown) pendingMapPropDrag = { source: baseSelected, before: selectionIds() };
      else if (selected && gizmo.object === selected && (selected.userData['forgePiece'] || cloneable(selected)) && duplicateModifierOnPointerDown) {
        pendingUserPropDrag = { source: selected, matrix: selected.matrix.clone(), before: selectionIds() };
      }
      return;
    }
    const mapPropGesture = gizmo.object === mapPropProxy;
    pendingMapPropDrag = null;
    pendingUserPropDrag = null;
    if (mapPropDragStep) {
      const duplicate = mapPropDragStep;
      mapPropDragStep = null;
      edit(duplicate.before, duplicate.step);
      duplicateModifierOnPointerDown = false;
      return;
    }
    if (pendingGroupPropDrag) {
      pendingGroupPropDrag.ended = true;
      dragFrom = null;
      duplicateModifierOnPointerDown = false;
      return;
    }
    if (groupPropDragStep) {
      const duplicate = groupPropDragStep;
      groupPropDragStep = null;
      dragFrom = null;
      edit(duplicate.before, duplicate.step);
      duplicateModifierOnPointerDown = false;
      placePivot();
      return;
    }
    if (mapPropGesture) {
      showSelection();
      duplicateModifierOnPointerDown = false;
      return;
    }
    const group = dragFrom !== null;
    dragFrom = null;
    // A drag is one step (FUI-6: the move's or the turn's entry; the drag already moved, so it is only recorded).
    personEdit(gizmo.mode === 'rotate' ? 'piece.rotate' : 'piece.move', { refs: selectionIds() }, () => edit(), true);
    if (group) placePivot();
  });
  /** The selection's boxes, one per member (FG-47); the first is the single selection's. */
  const box = new Box3Helper(new Box3(), new Color(0xd8a640));
  box.visible = false;
  scene.add(box);
  const boxes: Box3Helper[] = [box];

  const floor = new Group();
  // Named FDL.R4 exception: the blank editor floor/grid are guides, not match scenery.
  floor.userData['forgeLightingInstrument'] = true;
  // A neutral gray (the owner, 2026-11-06): the guide's own colour, no map's.
  floor.add(new GridHelper(FLOOR_SIZE, FLOOR_SIZE / FLOOR_STEP, FLOOR_GRID_CENTRE, FLOOR_GRID_LINES));
  // The floor fogs as the match's floor does (`./matchMap` `floorMesh`, `fog: true`): a new empty map's fog shows on it.
  const floorPlane = new Mesh(new PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: FLOOR_GRID_GROUND, fog: true }));
  floorPlane.position.y = -0.5;
  floor.add(floorPlane);
  /** The layout's hull drawn over the world (`./hull`); a new object each time, as the renderer keys its draws by one. */
  const hullMaterial = new LineBasicMaterial({ vertexColors: true, fog: false, depthTest: false, transparent: true, opacity: 0.85 });
  let hullLines: LineSegments | null = null;

  /* ================= the state ================= */
  /** The served tree in a development build (`?disc` asks for the release's path instead); the player's disc otherwise. */
  const SERVED: SourceRequest = { kind: 'http', baseUrl: MAPS };
  const archives = new Archives(SERVED);
  // Browser adaptation: inspection sees decoded palettes only, never starts a load of its own.
  const creatorMaps = new Map<string, LoadedMap>();
  // Unmounted pieces/ghosts carry evidence privately; only a scene commit publishes their archive.
  const creatorPieceMaps = new WeakMap<Object3D, LoadedMap>();
  const publishCreatorPiece = (r: Object3D): void => {
    const map = creatorPieceMaps.get(r);
    if (map) creatorRemember(map);
  };
  // Browser adaptation: a newly inspected archive changes the creator catalogue, so revision-bound cursors must lapse.
  const creatorRemember = (map: LoadedMap): void => { if (!creatorMaps.has(map.archive)) { creatorMaps.set(map.archive, map); agentMark(); } };
  /** R3-B: the archive each piece was last built from (`newPiece`), by stem: a staged drop's source (`sourceIdentity`). */
  const pieceSources = new Map<string, LoadedMap>();
  const creatorPalette = (map: LoadedMap): PaletteEntry[] => { creatorRemember(map); return palette(map); };
  /** Archives that failed to open. A later piece from one is missing without asking again (a redo would otherwise retry). */
  const absent = new Set<string>();
  const STAGE: Record<string, string> = { fetching: 'Reading the archive', archive: 'Opening the archive', geometry: 'Decoding the geometry', textures: 'Decoding the textures' };
  const forgetArchive = (stem: string): void => {
    absent.add(stem);
    const line = status.textContent ?? '';
    if (line.startsWith(`${stem}: `) && /\d+%$/.test(line)) say('');
  };
  archives.onProgress = (stem, stage, done, total) => {
    if (absent.has(stem)) return;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    notifier.notify(`${stem}: ${STAGE[stage] ?? stage} ${pct}%`, { progress: true });   // FUI-4: the line only
    if (!loading.hidden) { loadingFill.style.width = `${pct}%`; loadingBar.setAttribute('aria-valuenow', String(pct)); loadingLine.textContent = `${stem} · ${STAGE[stage] ?? stage}`; }
  };
  const pieces = new PieceLibrary();
  let entries: ArchiveEntry[] = [];
  let base: LayoutBase | null = null;
  let baseView: WorldView | null = null;
  // B206 ML-3 / ML-4 (ML.R5, R8, R9, R10; product track, ML.R2): the texture pack chosen in MODS applied to the Forge's
  // world -- the HD pack from the MODS store (drawn as made: the editor is offline, ML.R13), a GX per-map pack on its own
  // map -- behind the overlay, spread over the frames. The registry collects from here while a pack is enabled (ML.R9);
  // its own claim name, so the Play's match (its own applier, `../matchMount`) never takes a texture's original twice.
  collectOnHint(pageHintFlags, hdTextures);
  const packFrames = new ApplyFrames();
  packFrames.setUploader(rendererUploader(created.renderer));   // after ML-9 (ML.R10): each upload timed in its frame
  // ML-9's F1: the strip while the Forge's Play walks or its match runs (`match`, read at each refresh, never before it is set).
  const packOverlay = new PackApplyOverlay(doc, () => pagePlayLive(playing || match !== null, true, false));
  let forgeHd: HdServedPack | null = null;
  const forgePacks = new PackApplier<TexturePackTarget>({
    choice: pageTextureChoice(), registry: hdTextures,
    hd: () => forgeHd = new HdServedPack(undefined, () => { packOverlay.update(forgeHd?.progress() ?? null); }, undefined, pageHdStore(),
      // After ML-9 (ML.R10) and GM-13d: the pack's decodes, keys and alpha rescale in the decode worker, as the match's.
      lazyHdPackDecoders(() => import('../hdMenuTextures').then((m) => new m.HdMenuDecoder())),
      // PR #729's Codex P1: the editor's own textures only -- never its Play's or lobby match's (`enterMatchScope`), so the
      // match's guarded runtime (ML.R13) is the one that draws them.
      { storeOnly: true, runtime: { frames: packFrames, owner: 'hd:forge', scope: null } }),
    gx: () => pageGxPacks((r) => { packOverlay.update(gxApplyProgress(r)); }, packFrames),
  });
  /** R7-3: an authored map's own props as drawn (`newContentBaseProps`), beside its world; null on any other base. */
  let baseContentProps: Group | null = null;
  let baseMap: LoadedMap | null = null;
  const roots: Object3D[] = [];
  const forgeLighting = createForgeLighting();
  /**
   * FG-47 (FG.R24): the selection, of several -- the placements picked and the map's own props picked (`./group`
   * `Selection`). `selected` and `baseSelected` are the single selection's, as before FG-47: the one placement or the
   * one map prop when it is alone, else null (`showSelection` derives them).
   */
  const picks = new Selection<Object3D>();
  let selected: Object3D | null = null;
  /**
   * The placements the Inspector's Lock just locked (a browser adaptation, FG.R2): still shown in the Inspector, not
   * selected -- a locked placement takes no edit -- so the same button reads Unlock and gives them back. Dropped by any
   * other selection or a deselect.
   */
  let lockHeld: Object3D[] = [];
  /**
   * Re-placing (a browser adaptation, FG.R2): a placed user prop picked up by the Place tool (`startReplace`) -- it follows
   * the cursor on the surface below it as the placement ghost does (snap included), its own hull and its own hits left
   * out; a click puts it down (one Move), Escape or another tool puts it back where it was (`position`, `quaternion`).
   */
  let replacing: { r: Object3D; position: Vector3; quaternion: Quaternion; before: string[] } | null = null;
  /**
   * The base map's own data selected (a browser adaptation, FG.R2): a spawn slot, a door, a view... picked from its
   * Outliner row or its billboard -- shown, framed, never edited. Another selection lets it go. `mapDataIndex`: every
   * item by its key (`./mapDataBillboards` `BillboardSpec.key`), as the billboards were last drawn.
   */
  let mapDataSelected: BillboardSpec | null = null;
  let mapDataIndex = new Map<string, BillboardSpec>();
  /**
   * The base's ladders (`@s2u/scene` `findLadders`): no objects, the hull's `m_appflags` 2 polygons (research 86 §2) --
   * read off the base's hull less its hidden props when the marks are drawn (`drawMapBillboards`), kept for the Outliner.
   */
  let mapLadders: Ladder[] = [];
  let mode: Mode = 'select';
  let chosen: string | null = null;
  let entriesOfPalette: PaletteEntry[] = [];
  let favs = readFavourites();
  /** FUI-3 (PAD-11): the props chosen last, newest first (the menu's Props screen, its Recent tab; this session's only). */
  let recentProps: string[] = [];
  const noteRecentProp = (asset: string): void => { recentProps = [asset, ...recentProps.filter((a) => a !== asset)].slice(0, PROPS_RECENT_MAX); };
  let filter: AssetFilter = 'all';
  /** FG-21: the assets dock lists the base map's characters (its player models) instead of its props. */
  let showChars = false;
  /** FG-21: the character the NPC tool places: a side and its type on the map (`LoadedMap.types`). */
  let npcChoice: { side: 'seal' | 'terrorist'; type: number } | null = null;
  /** FG-21: the map whose characters the NPCs are (the base's; the blank floor's library's). */
  let charMap: LoadedMap | null = null;
  let snap = false;
  /** FG-49: the snap's grid (game units) and turn (degrees). Snap off leaves a drag free; the steps stay for the pad. */
  let gridStep = DEFAULT_GRID_STEP;
  let turnStep = DEFAULT_TURN_STEP;
  /**
   * FUI-22 (D4, the owner 2026-10-27: "please make mouse wheel spin assets in forge too" ... "when you have an item queued
   * to place"; a browser adaptation): the queued prop's own turn, degrees, a turn step a wheel notch, on top of the
   * placement's facing; back to none when the queue is cancelled.
   */
  let queuedTurn = 0;
  /**
   * The wheel's turn on a placing tool's object (the owner, 2026-11-06: as the Place tool's `queuedTurn`), degrees, on top
   * of the tool's own turn (`ghostYaw`); back to none when another tool is taken.
   */
  let toolTurn = 0;
  /** The tools whose object the wheel turns: all but Select, Place (its own), a zone (square on the AI grid), a point, a view. */
  const wheelTurns = (m: string): boolean => m !== 'select' && m !== 'place' && m !== 'zone' && m !== 'point' && m !== 'view';
  /** FUI-22 (D4): the wheel's travel toward its next notch (a trackpad's small deltas add up to one). */
  let wheelTravel = 0;
  /** FUI-22 (D1): the asset list's tooltip preview, on unless the asset browser's view setting turns it off. */
  let assetTips = true;
  /**
   * The Select tool's settings (its gear), kept with the view: a click or a selection box picks the base map's own props
   * (`selectMapProps`), the user's placements (`selectUserProps`) -- either, both or neither.
   */
  let selectMapProps = true;
  /** The Play settings (the Play button's gear): where round 1 stands the player, and its side. Browser adaptations. */
  let playSpawn: 'camera' | 'random' = 'camera';
  let playSide: 'auto' | 'seal' | 'terrorist' = 'auto';
  let selectUserProps = true;
  /**
   * The map data billboards' settings (the viewport's Billboards dropdown; `./mapDataBillboards`), kept with the view:
   * shown at all, drawn over all the geometry, and the kinds of map data switched off (`MAP_DATA_KIND_TOGGLES` ids).
   */
  let billboardsOn = true;
  let billboardsOnTop = false;
  /** The map's flare glows drawn (the game's own lights' glows, the sun, the sky's): off, they are out of the way. */
  let flareGlows = true;
  /** The light rig's arrows drawn (`./lightArrows`): where each of the map's directional lights shines from. */
  let lightDirections = true;
  // The map's props draw themselves: their marks start switched off until the view keeps a choice.
  const billboardsOff = new Set<string>(['mapProps']);
  let busy = false;
  /** LATER 819: what set `busy` last (set beside it), so a press refused meanwhile says why (`forgeBusyRefusal`). */
  let busyCause: ForgeBusyCause = 'open';
  /**
   * Browser adaptation: the agent's revisions (`./agent/editorFacade` `createForgeAgentRevisions`, LATER 422): the LAYOUT
   * revision -- monotonic across human/agent edits, undo, selection, settings, saves and every base replacement, never an
   * index epoch and never the view's (camera, palette, tool), which is its own -- and the latest map check, dropped when
   * the layout revision advances. `agentMark`: a layout change not yet counted (`changed`, settings, hidden keys, saves);
   * the next read counts it. `agentChanged`: the layout revision advanced now, its listeners told.
   */
  const agentRevisions = createForgeAgentRevisions();
  const agentMark = (): void => { agentRevisions.mark(); };
  const agentPlay = createForgePlayDriver({ now: () => performance.now() });
  let agentApi: ForgeAgentApi | null = null;
  /** R5-B (a browser adaptation): the agent's camera shot on this page's fly camera (`./camera/pageShot`), made below. */
  let pageShot: PageShot | null = null;
  const agentChanged = (): void => { agentRevisions.changed(); };
  /** Walking the layout as a SEAL (`togglePlay`). */
  let playing = false;
  /**
   * FG-26 (FG.R19-R22): the forge lobby this page is in (its host's or a joiner's), or null. While it is open the layout
   * is the server's copy -- the room was composed from it (`forgeSimMap.ts`) -- so it takes no edit and Play waits.
   */
  let lobby: LobbyHere | null = null;
  /** FG-26: a joiner's page shows the host's layout: it is not written over this browser's own autosave. */
  let autosaveOff = false;
  /**
   * FP-6 item 3 (FP.R12, "a bundle is an installed thing, not a save"; product track, a browser adaptation): the custom
   * map open as a read-only base, or null. Marked read-only as a joiner's lobby layout is (`autosaveOff`: nothing of it
   * is written over this browser's autosave, and MODS' record is never written by the page), and the toolbar's Saves is
   * "Save as" (`saveBundleAs`): the layout copied into the player's saves, a fresh id, and that copy opened.
   * `bundleOfLayout` ties a Custom Maps choice's record to the very layout object that choice made (PR #756's P2): the
   * open of THAT layout marks it, and a choice cancelled later (its "Save this layout first?", its save name) leaves
   * nothing behind for an unrelated open to take -- the record goes with the dropped layout.
   */
  let bundleOpen: CustomMapRecord | null = null;
  const bundleOfLayout = new WeakMap<Layout, CustomMapRecord>();

  /* ---------- the view settings ---------- */
  const view: Record<ViewToggle, boolean> = Object.fromEntries(VIEW_TOGGLES.map((t) => [t.id, t.on])) as Record<ViewToggle, boolean>;
  /** The camera last written with the view (`FORGE_VIEW_KEY`), applied once when a layout names none of its own. */
  let viewCamera: LayoutCamera | null = null;
  let applySavedViewCamera = true;
  /** False until a layout has opened: the frame loop must not write the view's camera over the saved one before then. */
  let cameraReady = false;
  let notedCam = '';
  /** LATER 195: the camera is written once still for `CAMERA_SETTLE_MS` of frames (`./cameraSettle`), not on a timer. */
  const camSettle = settleState('');
  try {
    const raw = JSON.parse(readKey(VIEW_KEY) ?? '{}') as Record<string, unknown>;
    if (raw && typeof raw === 'object') {
      for (const t of VIEW_TOGGLES) { const value = raw[t.id]; if (typeof value === 'boolean') view[t.id] = value; }
      // The map's facing props (`billboards`: trees and flares turned to the camera) have no switch in the viewport any
      // more, so a view kept with them off would keep them off for good: they are drawn, as the game draws them.
      view.billboards = true;
      if (typeof raw['textured'] === 'boolean') texturedOn = raw['textured'];
      if (typeof raw['lit'] === 'boolean') litOn = raw['lit'];
      if (raw['camera'] !== undefined) { try { viewCamera = parseCamera(raw['camera']); } catch { viewCamera = null; } }
      if (typeof raw['gridStep'] === 'number') gridStep = boundStep(raw['gridStep'], GRID_STEP_MIN, GRID_STEP_MAX, DEFAULT_GRID_STEP);
      if (typeof raw['turnStep'] === 'number') turnStep = boundStep(raw['turnStep'], TURN_STEP_MIN, TURN_STEP_MAX, DEFAULT_TURN_STEP);
      if (typeof raw['snap'] === 'boolean') snap = raw['snap'];
      if (raw['assetTips'] === false) assetTips = false;
      if (raw['selectMapProps'] === false) selectMapProps = false;
      if (raw['selectUserProps'] === false) selectUserProps = false;
      if (raw['playSpawn'] === 'random') playSpawn = 'random';
      if (raw['playSide'] === 'seal' || raw['playSide'] === 'terrorist') playSide = raw['playSide'];
      const bb = raw['billboards'];
      if (bb && typeof bb === 'object') {
        const b = bb as { on?: unknown; top?: unknown; off?: unknown };
        if (typeof b.on === 'boolean') billboardsOn = b.on;
        if (typeof b.top === 'boolean') billboardsOnTop = b.top;
        const glows = (b as { glows?: unknown }).glows;
        if (typeof glows === 'boolean') flareGlows = glows;
        const arrows = (b as { arrows?: unknown }).arrows;
        if (typeof arrows === 'boolean') lightDirections = arrows;
        if (Array.isArray(b.off)) {
          billboardsOff.clear();
          for (const id of b.off) if (MAP_DATA_KIND_TOGGLES.some((t) => t.id === id)) billboardsOff.add(id as string);
          // A view kept before the map props had marks names no choice for them: theirs start off as a new view's.
          if (!Array.isArray((b as { kinds?: unknown }).kinds) || !((b as { kinds: unknown[] }).kinds).includes('mapProps')) billboardsOff.add('mapProps');
        }
      }
    }
  } catch { /* the defaults */ }
  /** The view switches, the placement steps and the camera, one record (the view key already kept the switches). */
  const writeView = (): void => {
    writeKey(VIEW_KEY, JSON.stringify({ ...view, textured: texturedOn, lit: litOn, gridStep, turnStep, snap, ...(assetTips ? {} : { assetTips: false }), ...(selectMapProps ? {} : { selectMapProps: false }), ...(selectUserProps ? {} : { selectUserProps: false }), ...(playSpawn === 'camera' ? {} : { playSpawn }), ...(playSide === 'auto' ? {} : { playSide }), billboards: { on: billboardsOn, top: billboardsOnTop, glows: flareGlows, arrows: lightDirections, off: [...billboardsOff], kinds: MAP_DATA_KIND_TOGGLES.map((t) => t.id) }, ...(viewCamera ? { camera: viewCamera } : {}) }));
  };
  const drawPlacement = (): void => {
    viewportGridIn.value = String(gridStep);
    viewportTurnIn.value = String(turnStep);
    viewportSnapIn.checked = snap;
    const snapReadout = snapSettingsSummary.querySelector('output');
    if (snapReadout) snapReadout.textContent = `${gridStep} / ${turnStep}°`;
    snapSettingsSummary.classList.toggle('is-on', snap);
    assetPreviewToggle.checked = assetTips;
  };
  /** The world switches on one view (the base's, or a piece template's), as the test room puts them (`applyToggle`). */
  const applyWorld = (v: WorldView): void => {
    v.setDetailDistance(detailDistanceFor(view.ps2 ? 'ps2' : 'modern', detailDistance.get()));   // PF.R60: PS2 keeps the original
    v.setWireframe(view.wireframe);
    v.setTextured(texturedOn);
    v.setUnlit(!litOn);
    v.setUntexturedHighlight(view.untextured);
    v.setShadows(view.shadows);
    v.setDetail(view.detail);
    v.setBillboards(view.billboards);
    v.setAlternate(view.alternate);
    v.setBlendGraded(view.blendgraded);
    v.setEngineOrder(view.engineorder);
  };
  pieces.onBuild = applyWorld;
  const applyView = (): void => {
    for (const v of [baseView, ...pieces.views()]) if (v) applyWorld(v);
    overlays.setGrid(view.grid && !!baseMap);
    overlays.setSpawns(view.spawns && !!baseMap);
    setSlotCellsShown(view.spawns);                           // the placed spawns' and hostages' cells too, as the disc's
    // The guides with them (one switch): the map's own and each placed object's.
    for (const g of [mapDoorGuides, mapLadderGuides, mapTurretGuides, mapHostageGuides, mapViewGuides, ...mapAccessGuides]) if (g) g.visible = view.spawns;
    for (const r of roots) r.traverse((o) => { if (o.userData['forgeGuideKind']) o.visible = view.spawns; });
    applyBillboards();
    // A new empty map fogs too (the owner, 2026-11-06): its fog the built-from map's, its own colour and distance over it.
    fog.enabled = view.fog && (base?.kind === 'map' || (base?.kind === 'blank' && (settings.fog?.on ?? discFog.enabled)));
    // A new empty map's own fog colour is kept over Day / night's tint (`lightingFog` `keepColour`).
    liftForgeFog(scene, fog, lighting, null, created.setClearColor, settings.timeOfDay, base?.kind === 'blank' && !!settings.fogColor);
    if (base?.kind === 'blank' && settings.timeOfDay === null) created.setClearColor([12, 20, 24]);
    created.setPresentation(view.ps2 ? 'ps2' : 'native');
    fit();
    if (hullLines) hullLines.visible = view.collision;
    if (view.collision) scheduleHull();
    for (const [id, i] of viewportToggleInputs) i.checked = view[id];
    texturedInput.checked = texturedOn;
    litInput.checked = litOn;
    viewportDetailDom.sync();
    viewportRenderScaleDom.sync();                             // FP-2: disabled under the PS2 picture
    writeView();
    refreshHint();
  };
  texturedInput.checked = texturedOn;
  litInput.checked = litOn;
  for (const [id, i] of viewportToggleInputs) i.checked = view[id];
  drawBillboardSwitches();                                     // the Billboards dropdown as the view was kept
  // PF.R60: a change from the panel's slider, the menu's row or the launcher's Options redraws every world and the slider.
  detailDistance.observe(() => { applyView(); });
  viewportDetailDom.sync();
  viewportRenderScaleDom.sync();                               // FP-2

  /* ---------- the map settings (FG-24, FG.R18; `./settings`) ---------- */
  /** The panel's controls from the settings (a field being typed in is left alone). */
  const drawSettings = (): void => {
    const active = doc.activeElement;
    lightIn.value = String(settings.timeOfDay ?? 1);
    lightOut.textContent = formatSetting('timeOfDay', settings, discFog.far);
    lightReset.disabled = editsLocked() || (settings.timeOfDay === originalTimeOf(base) && settings.light === 1);
    const far = settings.fogFar ?? Math.round(discFog.far);
    fogIn.value = String(sliderOfFog(far));
    fogOut.textContent = formatSetting('fogFar', settings, discFog.far);
    fogReset.disabled = settings.fogFar === null || editsLocked();
    for (const key of ['players', 'rounds', 'roundSeconds'] as const) if (active !== numIn[key]) numIn[key].value = String(settings[key]);
    ffIn.checked = settings.friendlyFire;
    npcSel.value = settings.npcBehaviour;
  };
  /**
   * The settings on the editor's view: the fog's far (its near at the disc's ratio) over the base's own fog, and the
   * light as the brighten uniform's factor on the base's world and every piece template (`WorldView.setLighting` with
   * the same rig: a uniform, no rebake); the fog colour and the cleared background follow the brighten (`liftFog`).
   */
  /** A new empty map's own rig, where it has one (a blank base only); null on a disc map, which keeps its own. */
  const customRig = (): GlobalLighting | null => (base?.kind === 'blank' ? (settings.lightRig as GlobalLighting | null | undefined) ?? null : null);
  /** The rig of the map a new empty map is built from (its library): what it plays with none of its own. */
  const libraryRig = (): GlobalLighting | null => (base?.kind === 'blank' ? charMap?.lightRig ?? null : null);
  /** A new empty map's drop-shadow way: its own, else the built-from map's, else `FALLBACK_SHADOW` (as the editor shows). */
  const blankShadow = (): readonly number[] => settings.shadowVector ?? charMap?.shadowVector ?? FALLBACK_SHADOW;
  /**
   * A new empty map's sky in the editor (`settings.skyFrom`, `./skyDome`): the chosen disc map's dome, built as a world
   * of its own over the floor, lit by its own rig, its clouds scrolling with each frame (`skyView.frame`). Drawn again only
   * when the choice changes; none on a disc map (its own sky is its world's).
   */
  let skyView: WorldView | null = null;
  let skyKey = '';
  let skyToken = 0;
  async function drawSky(): Promise<void> {
    const want = base?.kind === 'blank' && settings.skyFrom ? settings.skyFrom : '';
    if (want === skyKey) return;
    skyKey = want;
    const token = ++skyToken;
    if (skyView) { scene.remove(skyView.group); skyView.dispose(); skyView = null; }
    if (!want) return;
    const lib = await hostageLibOf(want);
    if (token !== skyToken || !lib) return;
    const dome = skyDomeFor(lib, null);
    if (!dome.world.length) { say(`${want} has no sky to copy (none of its world is textured as a sky)`, true); return; }
    const view = buildWorld({ ...lib, world: dome.world, props: [], lines: null });
    view.setLighting({ ...DEFAULT_LIGHTING, rig: lib.lightRig, brighten: lighting.brighten });
    for (const task of view.revealWorld) task();
    if (token !== skyToken) { view.dispose(); return; }
    skyView = view;
    scene.add(view.group);
  }
  /**
   * A new empty map's environment as it plays (`./panels/lightRigEditor` `Atmosphere`): each value the layout's own
   * (`settings`), else the map it is built from's -- its rig (`libraryRig`), its camera's fog (`discFog`), its night and
   * its shadow -- else the editor's fallbacks.
   */
  const atmosphereNow = (): Atmosphere => {
    const own = settings.fog, alt = discFog.altitude;
    // The layout's own night wins whole: its lens none is none, not the built-from map's showing through.
    const lens = settings.night ? settings.night.lens : charMap?.night?.lens ?? null;
    return {
      rig: (settings.lightRig ?? libraryRig() ?? FALLBACK_RIG) as LightRigSetting,
      sky: settings.skyFrom ?? '',
      fog: {
        on: own?.on ?? discFog.enabled,
        colour: (settings.fogColor ?? [discFog.color[0], discFog.color[1], discFog.color[2]]) as [number, number, number],
        near: own?.near ?? fog.near,
        far: settings.fogFar ?? discFog.far,
        height: own
          ? { on: own.height !== null, top: own.height?.top ?? alt?.top ?? 50, bottom: own.height?.bottom ?? alt?.bottom ?? 0 }
          : { on: alt !== null, top: alt?.top ?? 50, bottom: alt?.bottom ?? 0 },
      },
      night: { mission: settings.night ? settings.night.mission : charMap?.night?.mission ?? false, lens: (lens ? [lens[0], lens[1], lens[2], lens[3]] : [0, 0, 0, 0]) as [number, number, number, number] },
      shadow: (settings.shadowVector ?? (charMap?.shadowVector ? [...charMap.shadowVector] : FALLBACK_SHADOW)) as [number, number, number],
    };
  };
  /** An environment as the layout keeps it: every part its own (a change makes the whole environment the map's). */
  const atmosphereSettings = (a: Atmosphere): Partial<typeof settings> => ({
    lightRig: a.rig, skyFrom: a.sky || null, fogColor: a.fog.colour, shadowVector: a.shadow,
    fogFar: boundSetting('fogFar', a.fog.far),
    fog: { on: a.fog.on, near: Math.max(0, Math.min(a.fog.near, a.fog.far - 1)), height: a.fog.height.on ? { top: a.fog.height.top, bottom: a.fog.height.bottom } : null },
    night: { mission: a.night.mission, lens: a.night.lens },
  });
  const applySettings = (): void => {
    agentMark();                                              // browser adaptation: the agent's layout revision
    Object.assign(fog, fogWithFar(discFog, settings.fogFar));
    // A new empty map's own fog colour over the one it is built from (a blank base only).
    if (base?.kind === 'blank' && settings.fogColor) fog.color = [settings.fogColor[0], settings.fogColor[1], settings.fogColor[2]];
    // Its own near distance and height band likewise (its on is the view's, `applyView`).
    if (base?.kind === 'blank' && settings.fog) {
      fog.near = Math.max(0, Math.min(settings.fog.near, fog.far - 1));
      fog.altitude = settings.fog.height ? { top: settings.fog.height.top, bottom: settings.fog.height.bottom } : null;
    }
    lighting.brighten = brightenFor(DEFAULT_LIGHTING.brighten, settings.timeOfDay === null ? settings.light : 1);
    baseView?.setLighting(lighting);
    pieces.setRig(customRig());                                // a new empty map's own rig over the pieces' own (a blank base only)
    pieces.setBrighten(lighting.brighten);
    if (base?.kind === 'blank') {
      // The rig it plays drawn as the Light directions arrows, across the floor's middle; the editor with it.
      lightArrows.set((customRig() ?? libraryRig()) as GlobalLighting | null, [0, 0, 0], BLANK_RIG_ARROWS_SPAN, blankShadow());
      rigEditor.draw();
    }
    rigEditor.body.hidden = base?.kind !== 'blank';
    placeLightingRows();
    void drawSky();
    // The bodies (the NPCs' figures, the walk's SEAL) on the same uniform, each with its own map's rig.
    for (const r of roots) (r.userData['forgeBrighten'] as ((b: number) => void) | undefined)?.(lighting.brighten);
    if (body) body.view.setLighting({ ...DEFAULT_LIGHTING, rig: body.from.lightRig, brighten: lighting.brighten });
    applyView();
    drawSettings();
    drawEnvironmentPanel();                                    // a legacy brightness shown while a layout carries one
  };
  lightIn.addEventListener('input', () => { if (refuseEdit()) { drawSettings(); return; } settings = timeSetting(settings, boundSetting('timeOfDay', Number(lightIn.value))); applySettings(); });
  lightIn.addEventListener('change', () => { if (!editsLocked()) settingsEdit(() => edit()); });   // one undo per drag
  // Original has no numeric time, although its thumb starts at Day. Selecting
  // that same endpoint must activate it even when a native range emits no change.
  const activateTime = (): void => {
    if (settings.timeOfDay !== null) return;
    const timeOfDay = boundSetting('timeOfDay', Number(lightIn.value));
    personEdit('settings.set', { settings: { timeOfDay } }, () => { settings = timeSetting(settings, timeOfDay); applySettings(); edit(); });
  };
  let lightHeld = false;
  lightIn.addEventListener('pointerdown', e => { lightHeld = e.button === 0 && !editsLocked(); });
  lightIn.addEventListener('pointerup', () => { if (lightHeld) { lightHeld = false; activateTime(); } });
  lightIn.addEventListener('pointercancel', () => { lightHeld = false; });
  lightIn.addEventListener('keyup', e => { if (['Home', 'End', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(e.key)) activateTime(); });
  lightReset.addEventListener('click', () => resetLighting());
  fogIn.addEventListener('input', () => { settings = { ...settings, fogFar: fogOfSlider(Number(fogIn.value)) }; applySettings(); });
  fogIn.addEventListener('change', () => settingsEdit(() => edit()));
  fogReset.addEventListener('click', () => settingsEdit(() => { settings = { ...settings, fogFar: null }; applySettings(); edit(); }));
  for (const key of ['players', 'rounds', 'roundSeconds'] as const) {
    numIn[key].addEventListener('change', () => settingsEdit(() => {
      const next = { ...settings };
      next[key] = boundSetting(key, Number(numIn[key].value));
      settings = next;
      numIn[key].value = String(settings[key]);
      edit();
    }));
  }
  ffIn.addEventListener('change', () => settingsEdit(() => { settings = { ...settings, friendlyFire: ffIn.checked }; edit(); }));
  npcSel.addEventListener('change', () => settingsEdit(() => {
    const v = (NPC_BEHAVIOURS as readonly string[]).includes(npcSel.value) ? npcSel.value as NpcBehaviour : DEFAULT_SETTINGS.npcBehaviour;
    settings = { ...settings, npcBehaviour: v };
    edit();
  }));
  /**
   * FG-51: the map the room's tests read before the layout's objectives (`composeForMatch`'s base): a map base's own; a
   * blank floor its library's, with no escortees (the server's `forgeSimMap` drops them too).
   */
  const objectiveBase = (): ObjectiveMap => {
    const m = baseMap ?? (base?.kind === 'blank' ? charMap : null);
    return !m ? {} : base?.kind === 'blank' ? blankFloorOf(m) : m;   // the library's archive, none of its map (`./objectives`)
  };
  /**
   * FCW-32 step 4 fold F2 (review; a browser adaptation): why Play would refuse the layout's own rules mode on this base --
   * the room's rule host at enable (`forgeRuleHost`) against the map's doors and switches (`ruleNamesOf`, the derivation
   * Play and `rules.test` share) -- or null. A map base whose map is not loaded yet has no names to check: null.
   */
  const playTimeWhy = (l: ForgeLayout | null): string | null => {
    const draft = l?.rules;
    if (!l || !draft) return null;
    if (base && base.kind !== 'blank' && !baseMap) return null;
    const own = l.mode?.id === draft.spec.id && l.mode.version === draft.pack.version;
    const probe: ForgeLayout = { ...l, mode: own ? l.mode : { id: draft.spec.id, version: draft.pack.version, params: {} } };
    const rules = forgePlayRules(probe, 0, installedRules());
    if (!rules) return null;
    try { forgeRuleHost(rules, ruleNamesOf(base, baseMap)); return null; } catch (e) {
      return (e instanceof Error ? e.message : String(e)).replace(/^the layout's rules pack was refused: /, '');
    }
  };
  /** Why type `t` would not play here with the markers placed now (`./objectives`, the room's own rule), or null. */
  const typeUnplayable = (t: ForgeGameType): string | null => {
    const bomb = bombOfMarkers();
    return blankWhy(t) ?? forgeTypeUnplayable(t, { gameType: t, ...(bomb ? { bomb } : {}) }, withPlacedEscortees(objectiveBase()));
  };
  /**
   * The base's objective map with the placed hostages counted among its escortees, when there is a character for them
   * (the base's own hostages', or on a blank floor its library's) -- so Escort and Extraction read what Play will hold.
   */
  const withPlacedEscortees = (m: ObjectiveMap): ObjectiveMap => {
    const placed = roots.filter((r) => r.userData['forgeHostage']).length;
    const lendable = (m.escortees?.length ?? 0) > 0 || (base?.kind === 'blank' && !!charMap?.escortees?.length) || anyLentHostage();
    const zones = roots.filter((r) => r.userData['forgeZone']).map(zoneNameOf);
    const counted = placed && lendable ? { ...m, escortees: [...(m.escortees ?? []), ...Array.from({ length: placed }, () => null)] } : m;
    return zones.length ? { ...counted, forgeEscortZones: zones } : counted;
  };
  /**
   * What the blank floor cannot play whatever is placed: Escort, whose script names an escort map's own zones (a browser
   * adaptation's word); null elsewhere. On the floor Extraction plays its placed hostages (a character lent by the library
   * map, which must have hostages of its own) and placed zones.
   */
  function blankWhy(t: number): string | null {
    if (base?.kind !== 'blank') return null;
    if ((t === 3 || t === 4) && !charMap?.escortees?.length && !anyLentHostage()) return `${t === 3 ? 'Escort' : 'Extraction'} on the blank floor needs a library map with hostages (its character is lent)`;
    return null;
  }
  /**
   * The picker shows what the room would play: a type the base cannot play (Breach, Escort, Extraction -- nothing in the
   * editor changes that) is greyed and says why; Demolition says what it still needs and stays pickable, the markers
   * being the way to ready it. A layout opened naming an unplayable type keeps it (the merge controller's ruling 4b),
   * shown as unplayable; Play then plays the base's own type and says so.
   */
  const refreshGameTypes = (): void => {
    for (const opt of gameTypeSel.options) {
      const v = Number(opt.value);
      if (v !== 1 && v !== 2 && v !== 3 && v !== 4 && v !== 5) continue;
      const why = typeUnplayable(v);
      // Demolition, Escort and Extraction wait on what is placed under them (the bomb; the hostages and extraction zones,
      // the owner 2026-11-05): pickable, "cannot play yet" and the reason. Breach, which the editor cannot ready, never.
      const placeable = v === 1 || v === 2 || v === 3 || v === 4;   // BREACH: its start and site placed (`breachReady`)
      opt.disabled = why !== null && !placeable;
      opt.textContent = why === null ? FORGE_GAME_TYPE_NAME[v] : `${FORGE_GAME_TYPE_NAME[v]} · ${placeable ? 'cannot play yet' : 'this map can\'t play it'}`;
      opt.title = why ?? '';
    }
    // FCW-32 step 4 (FUI.R23 D2): the Custom group -- the rules modes of the Forge's mode list (`forgeModeList`, spec §7:
    // `forgeModeChoices` over the layout's draft, then the installed packs'); one Play cannot run greyed with its reason.
    const l = layoutNow(false);
    const installed = installedRules();
    const modes = l ? forgeModeList(l, installed).flatMap((c) => (c.kind === 'rules' ? [c] : [])) : [];
    // Review F2: the draft's mode greys on the entity check, then on the Play-time check (the map's doors and switches).
    const draftWhy = l?.rules ? refusalWords(checkForgeRules(l, installed)) ?? playTimeWhy(l) : null;
    drawCustomModes(gameTypeSel, modes.map((m) => {
      const own = !!layoutRules && m.pack.id === layoutRules.pack.id && m.pack.version === layoutRules.pack.version;
      return { id: m.id, version: m.version, name: m.name,
        reason: own ? draftWhy : layoutMode?.id === m.id && layoutMode.version === m.version ? null : INSTALLED_MODE_WORDS };
    }));
    const want = gameTypeValue();
    if (gameTypeSel.value !== want) gameTypeSel.value = want;
    // A blank floor's row in the base list is its type's preset (`blankValue`): it follows the type.
    if (base?.kind === 'blank') { const v = blankValue(); if (baseSel.value !== v) baseSel.value = v; }
    refreshModeTools();
  };
  /**
   * The tools a game type plays (a browser adaptation, FG.R2: the editor's own grouping), the rest greyed: a tool listed
   * in `MODE_TOOL_TYPES` is on only under its types. A type still being read (`typePending`) and a rules mode (whose rule
   * host may read any placement) leave every tool on. Placements already made stay; only placing more is held.
   */
  /**
   * The base list's row for a blank floor (the owner, 2026-11-06: no blank floor without a type): its game type's preset
   * (`./blankPresets`), Suppression's while the type is not known; the plain row where the list has no presets (a tree
   * with no disc maps).
   */
  function blankValue(): string {
    const v = `blank:${authoredType ?? 5}`;
    return baseSel.querySelector(`option[value="${v}"]`) ? v : 'blank';
  }
  function refreshModeTools(): void {
    const type = layoutMode ? null : authoredType;
    for (const [m, types] of Object.entries(MODE_TOOL_TYPES) as [Mode, readonly ForgeGameType[]][]) {
      const off = type !== null && !types.includes(type);
      const b = modeBtns[m];
      b.disabled = off;
      b.dataset['forgeModeOff'] = off ? 'true' : '';
      if (off && !b.dataset['forgeTitle']) b.dataset['forgeTitle'] = b.title;
      b.title = off ? `${b.dataset['forgeTitle']} · ${modeToolWhy(types)}` : b.dataset['forgeTitle'] ?? b.title;
      if (off && mode === m) setMode('select');
    }
    for (const sec of toolsRow.querySelectorAll<HTMLElement>('.fx-mode-section')) {
      const tools = [...sec.querySelectorAll<HTMLButtonElement>('.fx-tool')];
      sec.classList.toggle('is-off', tools.length > 0 && tools.every((t) => t.disabled));
    }
  }
  /** Why a tool is greyed: the game types it places for. */
  const modeToolWhy = (types: readonly ForgeGameType[]): string => `${types.map((t) => FORGE_GAME_TYPE_NAME[t]).join(' and ')} only: choose it as the game type`;
  /** FCW-32 step 4 (D2): the select's value for the layout: its rules mode's option, else its retail type ('' the map's own). */
  const gameTypeValue = (): string => (layoutMode ? modeOptionValue(layoutMode) : authoredType === null ? '' : String(authoredType));
  /** FCW-32 step 4 (D2): an installed pack's mode is chosen through its pack once the registry offers it (FCW-35). */
  const INSTALLED_MODE_WORDS = 'An installed rules mode is chosen through its pack (FCW-35)';
  /** FCW-32 step 4 (D2): a rules mode chosen in the picker: the draft's own as `rules.set` sets it (the planner's edit). */
  const chooseRulesMode = (value: string, back: () => void): void => {
    if (layoutMode && value === modeOptionValue(layoutMode)) return;
    const draft = layoutRules;
    if (!draft || value !== modeOptionValue({ id: draft.spec.id, version: draft.pack.version })) { back(); notifier.refused(INSTALLED_MODE_WORDS); return; }
    void personForge.execute('rules.set', { spec: draft.spec }, personForge.status().revision).then((r) => {
      if (!r.ok) { back(); notifier.refused(r.message ?? r.code ?? 'Refused'); }
    });
  };
  gameTypeSel.addEventListener('change', () => {
    const back = (): void => { gameTypeSel.value = gameTypeValue(); };
    if (gameTypeSel.value.startsWith(MODE_OPTION_PREFIX)) { chooseRulesMode(gameTypeSel.value, back); return; }
    if (layoutMode) {
      // FCW-32 step 4 (D2): the layout plays its rules mode (the room's rule host decides it); a retail type waits until
      // its rules are removed, which Remove rules (the Rules panel) does as one step.
      back();
      notifier.refused(`This layout plays its rules mode ${layoutRules?.spec.name ?? layoutMode.id}: Remove rules in the Rules panel to choose a game type of the disc`);
      return;
    }
    const v = Number(gameTypeSel.value);
    // FUI-6: the game type's entry; a refusal (the lobby's hold) puts the picker back, as before.
    if (!personEdit('type.set', { type: v }, () => {
      const picked = v === 1 || v === 2 || v === 3 || v === 4 || v === 5 ? v : null;
      const why = picked !== null && picked !== 1 && picked !== 2 && picked !== 3 && picked !== 4 ? typeUnplayable(picked) : null;   // those four wait on their placements
      if (why) { back(); say(why, true); return; }
      authoredType = picked;
      typePending = false;
      edit();
    })) back();
  });
  /** FG-26: whether a lobby holds the layout (open, not ended): no edit, no Play. */
  const editsLocked = (): boolean => lobby !== null && !lobby.ended;
  /** FUI-1b: the START menu is open (set once the menu is built, further down). */
  let padMenuOpen = (): boolean => false;
  /** FCW-32 step 4 (FUI.R23 D5): Create lobby's tooltip says why a layout is refused online (set with the lobby's button, below). */
  let lobbyTitle = (): void => undefined;
  /**
   * FUI-1 (UX-13): the surface and the edit rule, one derivation (`./shell/state`) the agent and the panels read. FUI-1b:
   * canEdit is Build's only (no Walk, Play, lobby hold, dialog or check); canPlace adds no card open and not loading.
   */
  const surfaceNow = (): ForgeSurfaceState => forgeSurfaceState({ lobbyHolds: editsLocked(), serverMatch: !!matchOfLobby, match: !!match, walking: playing,
    modal: !modal.hidden, checking, card: padMenuOpen() || !help.hidden, busy });
  /** FUI-2 (the review's IA-1): a toolbar action that opens a card, asked while a card is open: refused, and said. */
  const refuseUnderCard = (): boolean => {
    if (!cards.isOpen()) return false;
    notifier.refused('Close the open card first');                 // FUI-4 (IA-12): a refusal persists in the line
    return true;
  };
  /** FG-26: an edit asked while a lobby holds the layout: refused, and said (`./shell/state` `forgeEditRefusal`, unchanged). */
  const refuseEdit = (): boolean => {
    const why = forgeEditRefusal({ lobbyHolds: editsLocked() });
    if (why === null) return false;
    notifier.refused(why);                                          // FUI-4 (IA-12): a refusal persists in the line
    return true;
  };
  /** One pad step of a setting (`./settings` `stepSetting`): applied, and an edit. */
  const stepSettingBy = (key: NumericSetting | 'friendlyFire' | 'npcBehaviour', dir: 1 | -1): void => {
    personEdit('settings.set', { settings: { [key]: dir } }, () => {
      settings = stepSetting(settings, key, dir, discFog.far);
      applySettings();
      edit();
    });
  };
  /** Original: the saved Night -> Day cleared and the legacy dimmer with it (`./settings` `timeSetting`), an edit. */
  const resetLighting = (): void => {
    const original = originalTimeOf(base);
    personEdit('settings.set', { settings: { timeOfDay: original } }, () => { settings = timeSetting(settings, original); applySettings(); edit(); });
  };

  /* ---------- the layout ---------- */
  /** FG-17: the base map's own props hidden in this layout (`./hide`; `Layout.hidden`), by key. */
  let hiddenKeys = new Set<string>();
  /** FG-17: one of the base map's own props (hide-only: a placement of the disc's, not a piece); FG-47: its box, read at the pick. */
  type BaseProp = Placement & { model: string; object: Object3D; instance: number | null; matrix: Matrix4; box: Box3 };
  /** FG-47: the map's own props picked, by their placement key. */
  const basePicks = new Selection<BaseProp>((b) => b.key);
  /** FG-17: the one map prop selected, when it is alone. */
  let baseSelected: BaseProp | null = null;
  /** The hidden keys the base view draws hidden now, as its switches (`WorldView.setPlacementActive`). */
  let hiddenDrawn = new Set<string>();
  const drawHidden = (): void => {
    agentMark();                                              // browser adaptation: the agent's layout revision
    refreshPlacementGround();
    if (!baseView || !baseMap) { hiddenDrawn = new Set(); return; }
    const want = placementsOf(baseMap, hiddenKeys);
    for (const k of hiddenDrawn) if (!want.has(k)) baseView.setPlacementActive(k, true);
    for (const k of want) if (!hiddenDrawn.has(k)) baseView.setPlacementActive(k, false);
    hiddenDrawn = want;
    drawMapBillboards();                                       // a hidden map prop's mark goes, a shown one's comes back
  };
  const bombKindOf = (r: Object3D): BombMarkerKind | null => {
    const k = r.userData['forgeBomb'];
    return k === 'start' || k === 'seal' || k === 'terrorist' ? k : null;
  };
  /**
   * The bomb markers placed, as the layout's bomb (`./bombMarkers`: an opened block's kept keys, a file's own reach and
   * keys per site, each marker's lock), or undefined with none.
   */
  const bombOfMarkers = (): BombObjectives | undefined => bombOfMarkerStates(roots.flatMap((r): BombMarkerState[] => {
    const kind = bombKindOf(r);
    if (!kind) return [];
    const file = r.userData['forgeBombFile'] as Pick<BombMarkerState, 'range' | 'elevation' | 'rest'> | undefined;
    return [{ kind, at: [r.position.x, r.position.y, r.position.z], yaw: r.rotation.y, locked: r.userData['forgeLock'] === true, ...(file ?? {}) }];
  }), bombRest);
  const restOf = (o: object, drop: readonly string[]): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) if (!drop.includes(k)) out[k] = v;
    return out;
  };
  /** The fly camera as the layout and the view store it (`Layout.camera`, applied by `openLayout`). */
  const cameraNow = (): LayoutCamera => {
    const p = fly.pose();
    return { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch };
  };
  const noteCamera = (): void => {
    const p = fly.pose();
    notedCam = `${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)},${p.yaw.toFixed(1)},${p.pitch.toFixed(1)}`;
    camSettle.key = notedCam;
    camSettle.due = false;
  };
  /** The layout's name, kept with it (`Layout.name`) and used for the downloaded file. */
  let layoutName = '';
  /**
   * R3-B (FCW-07a part 2): the page's lists -- the named saves, the autosave and the copies set aside -- through the one
   * saves writer (`./savesStore` `ForgeSaves` over IndexedDB, named in `../pageStore`). Opened once (the localStorage
   * lists moved on the first open); every write is awaited, a compare-and-swap on the generation last read.
   */
  const forgeSaves = new ForgeSaves(new SavesStore(pageIndexedDb()), pageSettings);
  let savesOpening: Promise<void> | null = null;
  /** Named layouts in this browser (`./saves`), as the store last read them. The autosave is the other slot. */
  let named: NamedSave[] = [];
  /** #348's re-review: entries this build cannot read, written back as they were. */
  let unreadableSaves: ReturnType<typeof readSaveList>['unreadable'] = [];
  /**
   * The review of R3-B (blocking): the generation `named` was read at. A list built from `named` is written expecting it
   * (`persistNamed`), so a re-read `named` never took in (a refused write's, a joiner's return) is a conflict, said, and
   * never written over.
   */
  let namedAt = 0;
  const refreshNamed = (): void => {
    const l = readSaveList(forgeSaves.view());
    named = l.saves;
    unreadableSaves = l.unreadable;
    namedAt = forgeSaves.generation('saves');
  };
  /**
   * Writes in flight from this page (the review of R3-B): a close waits for every one asked before it -- the pagehide's
   * flush of an edit and of a camera move both -- before the store is closed (`teardown`).
   */
  const pendingWrites = new Set<Promise<unknown>>();
  const tracked = <T>(p: Promise<T>): Promise<T> => {
    pendingWrites.add(p);
    const done = (): void => { pendingWrites.delete(p); };
    p.then(done, done);
    return p;
  };
  /** The store opened and its lists read, once; before the first read of a list and the first write. */
  const savesOpen = (): Promise<void> => (savesOpening ??= forgeSaves.open().then(({ state, hidden }) => {
    refreshNamed();
    if (state === 'unavailable') say('This browser keeps no Forge saves here (no IndexedDB), so nothing is saved this visit', true);
    else if (state === 'unmigrated') say('The layouts kept in this browser could not be moved to its database, so saving is off this visit', true);
    // R6 (R3): a closing page's last edit, written at its close, lost to another tab's save in the meantime: that save is kept.
    else if (hidden.autosave === 'dropped') say('An edit made as the Forge last closed was not kept: another tab had saved the layout in the meantime', true);
  }));
  /**
   * R3-B (FUI-14/16's minimum): the packs the open layout requires (its pieces' and its declared ones, the record's
   * `requires`) that this device does not hold (`MountForgeOptions.availablePacks`). The layout opens and edits whole;
   * Play and Create lobby are refused while any is missing, its list named; nothing is discarded.
   */
  const availablePacks = options?.availablePacks ?? ((): readonly PackRef[] => []);
  const installedRules = options?.installedRules ?? ((): readonly InstalledRulesPack[] => []);   // FCW-32 round 2
  /** R6 (3, 7): the page's content source and its resolver (`ForgeContentSource`); a throwing source answers nothing. */
  const contentSource = options?.content ?? NO_CONTENT_SOURCE;
  const resolveContent: ContentResolver = (ref) => { try { return contentSource.asset(ref); } catch { return null; } };
  /**
   * R7-6 (round 6's finding): the one authored map's member `holdsContentBase` read (the boot's question), kept by the
   * base's words (`contentBaseValue`) for that base's load (`loadContentWorld`), so a source whose map() fetches reads it
   * once a boot. Taken by the load; dropped at the next base change.
   */
  let heldContentMap: { key: string; json: unknown } | null = null;
  const takeHeldContentMap = (b: ContentLayoutBase): unknown => {
    const held = heldContentMap;
    if (!held || held.key !== contentBaseValue(b)) return null;
    heldContentMap = null;
    return held.json;
  };
  /** R6 (3): the pack pieces the last composed ground left out (unresolved, or not a turn about +Y): the Check lists them. */
  let contentMisses: ContentMiss[] = [];
  const missingPacks = (): PackRef[] => {
    const l = layoutNow(false);
    if (!l) return [];
    // FCW-32: the layout's own rules pack is here (the layout holds it), never a missing one.
    return missingPackRefs(recordOfLayout(l, l.name?.trim() || 'Layout').requires ?? [], [...availablePacks(), ...(l.rules ? [l.rules.pack] : [])]);
  };
  const missingPacksWords = (what: string, packs: readonly PackRef[]): string =>
    `${what} waits for ${packs.length} pack${packs.length === 1 ? '' : 's'} not here: ${packWords(packs)}. Your work is kept`;
  /** R3-B: `what` refused while a pack is missing (said, as a refusal); false when every pack is here. */
  const refuseMissingPacks = (what: string): boolean => {
    const packs = missingPacks();
    if (packs.length === 0) return false;
    notifier.refused(missingPacksWords(what, packs));
    return true;
  };
  /** R3-B: on an open, the count of the packs it needs that are not here, and which. */
  const noteMissingPacks = (): void => {
    const packs = missingPacks();
    if (packs.length) notifier.notify(`${packs.length} pack${packs.length === 1 ? '' : 's'} this layout needs ${packs.length === 1 ? 'is' : 'are'} not here (${packWords(packs)}): it opens and edits; Play waits for ${packs.length === 1 ? 'it' : 'them'}`, { kind: 'refusal' });
  };
  /**
   * R3-B: a list written elsewhere first -- never written over: the lists are read again (the store did), the Saves card
   * redrawn, and the person told, as a refusal.
   */
  const savedElsewhere = (): void => {
    refreshNamed();
    notifier.notify(SAVED_ELSEWHERE, { kind: 'refusal' });
    if (savesHandle?.open) openSaves();
    agentMark();
    agentChanged();
  };
  /**
   * The review of R3-B: lists the store read again (`ForgeSaves.reread`, true when any changed) are taken in -- the named
   * copy, the Saves card, the agent -- before anything is written from them. R4 (the round 3 review): also when the
   * re-read changed nothing but the page's copy is older than the store's (a list the store read on its own, at a refused
   * write, and the page never took in), so the next Save writes from the list the store holds, not a stale one.
   */
  const listsReread = (changed: boolean): void => {
    if (!changed && namedAt === forgeSaves.generation('saves')) return;
    refreshNamed();
    if (savesHandle?.open) openSaves();
    agentMark();
    agentChanged();
  };
  /** The share link last built, shown in the saves card. */
  let shareUrl = '';
  /**
   * LATER 195: the layout an edit's autosave writes -- the camera the settle last kept (`viewCamera`), never the pose
   * of a fly under way.
   */
  const settledLayout = (): Layout | null => { const l = layoutNow(false); return l && viewCamera ? { ...l, camera: viewCamera } : l; };
  const layoutNow = (withCamera = true): ForgeLayout | null => {
    if (!base) return null;
    const delta = settingsDelta(settings);
    const name = layoutName.trim();
    const l: Layout = {
      ...emptyLayout(base),
      ...(name ? { name } : {}),
      ...(withCamera ? { camera: cameraNow() } : {}),
      ...(hiddenKeys.size ? { hidden: [...hiddenKeys].sort() } : {}),
      ...(Object.keys(delta).length ? { settings: delta } : {}),
    };
    // R3-B (FCW-07a part 2): each row's authored id rides its object (`forgeId`, set by `prepareLayout`), so a reorder, a
    // delete or an undo keeps it; a row without one (placed since) takes the first default free from its place.
    const idOf = (r: Object3D): { id?: string } => (typeof r.userData['forgeId'] === 'string' ? { id: r.userData['forgeId'] as string } : {});
    const marks: { start: Object3D | null; sites: Object3D[] } = { start: null, sites: [] };
    for (const r of roots) {
      r.updateMatrix();
      const locked = r.userData['forgeLock'] === true;
      if (r.userData['forgePiece']) {
        const content = r.userData['forgeContent'] as Piece['content'] | undefined;
        l.pieces.push({ asset: r.userData['forgePiece'] as string, m: Array.from(r.matrix.elements), ...(locked ? { locked: true } : {}), ...idOf(r), ...(content ? { content } : {}) });
      } else if (r.userData['forgeRespawn']) (l.respawns ??= []).push({ team: r.userData['forgeRespawn'] as 'A' | 'B', p: [r.position.x, r.position.y, r.position.z], yaw: r.rotation.y, ...(locked ? { locked: true } : {}) });
      else if (r.userData['forgeSpawn']) l.spawns.push({ team: r.userData['forgeSpawn'] as 'A' | 'B', p: [r.position.x, r.position.y, r.position.z], yaw: r.rotation.y, ...(locked ? { locked: true } : {}), ...idOf(r) });
      else if (r.userData['forgeNpc']) {
        const n = r.userData['forgeNpc'] as { side: 'seal' | 'terrorist'; type: number };
        (l.npcs ??= []).push({ side: n.side, type: n.type, p: [r.position.x, r.position.y, r.position.z], yaw: r.rotation.y, ...(locked ? { locked: true } : {}), ...idOf(r) });
      } else if (r.userData['forgeGate'] || r.userData['forgeBarrier']) {
        const a = accessOwnOf(r)!;
        (l[a.kind === 'gate' ? 'gates' : 'barriers'] ??= []).push({ source: a.source, name: a.name, at: [r.position.x, r.position.y, r.position.z], yaw: r.rotation.y, ...(locked ? { locked: true } : {}) });
      } else if (r.userData['forgeDoor']) {
        const t = r.userData['forgeDoor'] as { source: string; name: string };
        (l.doors ??= []).push({ source: t.source, name: t.name, at: [r.position.x, r.position.y, r.position.z], yaw: r.rotation.y, ...(locked ? { locked: true } : {}) });
      } else if (r.userData['forgeTurret']) {
        const t = r.userData['forgeTurret'] as { source: string; name: string };
        (l.turrets ??= []).push({ source: t.source, name: t.name, at: [r.position.x, r.position.y, r.position.z], yaw: r.rotation.y, ...(locked ? { locked: true } : {}) });
      } else if (r.userData['forgeFlare']) {
        const f = r.userData['forgeFlare'] as { source: string; name: string };
        (l.flares ??= []).push({ source: f.source, name: f.name, at: [r.position.x, r.position.y, r.position.z], ...(locked ? { locked: true } : {}) });
      } else if (r.userData['forgePoint']) {
        const t = r.userData['forgePoint'] as { name: string; kind: number };
        (l.tacPoints ??= []).push({ name: t.name, kind: t.kind, at: [r.position.x, r.position.y, r.position.z], ...(locked ? { locked: true } : {}) });
      } else if (r.userData['forgeView']) {
        const v = r.userData['forgeView'] as { name: string; yaw: number; pitch: number };
        (l.scenicViews ??= []).push({ name: v.name, at: [r.position.x, r.position.y, r.position.z], yaw: v.yaw, pitch: v.pitch, ...(locked ? { locked: true } : {}) });
      } else if (r.userData['forgeZone']) {
        const z = r.userData['forgeZone'] as { w: number; d: number; name: string };
        (l.extractionZones ??= []).push({ name: z.name, at: [r.position.x, r.position.y, r.position.z], size: [z.w, z.d], ...(locked ? { locked: true } : {}) });
      } else if (r.userData['forgeHostage']) {
        const own = hostageOf(r);
        (l.hostages ??= []).push({ p: [r.position.x, r.position.y, r.position.z], yaw: r.rotation.y, ...(locked ? { locked: true } : {}),
          ...(own.name ? { name: own.name } : {}), ...(own.character ? { character: own.character } : {}), ...(own.source ? { source: own.source } : {}) });
      } else {                                                  // a bomb marker: `bombOfMarkers` below
        const kind = bombKindOf(r);
        if (kind === 'start') marks.start ??= r;
        else if (kind) marks.sites.push(r);
      }
    }
    // The type shown is written (its base's own when none was picked, `ownTypeOf`); while it is still being read
    // (`typePending`) none is, so the base keeps its own -- the same type. The markers are kept, and an opened block's
    // own keys whenever there are any (`./bombMarkers` `layoutObjectivesOf`).
    const objectives = layoutObjectivesOf(typePending ? null : authoredType, bombOfMarkers(), objectiveRest);
    if (objectives) l.objectives = objectives;
    const startId = marks.start?.userData['forgeId'], siteIds = marks.sites.map((r) => r.userData['forgeId']);
    if (objectives?.bomb && (typeof startId === 'string' || siteIds.some((id) => typeof id === 'string'))) {
      // a site placed since has no id yet: `withIds` gives it the first default free (an absent entry is its default)
      l.ids = { ...(typeof startId === 'string' ? { bomb: startId } : {}), sites: siteIds.map((id) => (typeof id === 'string' ? id : undefined)) as string[] };
    }
    if (layoutRequires.length) l.requires = layoutRequires.map((p) => ({ ...p }));
    if (layoutMode) l.mode = JSON.parse(JSON.stringify(layoutMode)) as RecordMode;
    Object.assign(l, JSON.parse(JSON.stringify(layoutEntities)) as typeof layoutEntities);     // FCW-32
    if (layoutRules) (l as ForgeLayout).rules = JSON.parse(JSON.stringify(layoutRules)) as ForgeRulesDraft;
    const out: ForgeLayout = withIds(l);
    // the ids written back on their objects: a row placed since keeps the one it took now
    let pi = 0, si = 0, ni = 0;
    for (const r of roots) {
      if (r.userData['forgePiece']) r.userData['forgeId'] = out.pieces[pi++]!.id;
      else if (r.userData['forgeSpawn']) r.userData['forgeId'] = out.spawns[si++]!.id;
      else if (r.userData['forgeNpc']) r.userData['forgeId'] = out.npcs![ni++]!.id;
    }
    if (marks.start && out.ids?.bomb !== undefined) marks.start.userData['forgeId'] = out.ids.bomb;
    marks.sites.forEach((r, i) => { const id = out.ids?.sites?.[i]; if (id !== undefined) r.userData['forgeId'] = id; });
    return out;
  };
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  /** FUI-4: an edit's 300 ms autosave is due (the save chip's "Saving…"). */
  let savePending = false;
  /** FUI-4: the issues the last check found (the issues chip), until an edit makes it stale (`changed`). */
  let lastIssues: number | null = null;
  /** Undo and redo over the layout's text (`./history`): a step at the end of each edit. */
  const history = new History<string>('');
  /** FUI-6 (AI-1): Undo and Redo name the step they take back or make again: `Undo: Place spawn A (agent) · pad SELECT`. */
  const undoWords = (): string => { const m = undoMeta(history); return m ? `Undo: ${historyCaption(m)}` : 'Undo'; };
  const redoWords = (): string => { const m = redoMeta(history); return m ? `Redo: ${historyCaption(m)}` : 'Redo'; };
  const refreshUndo = (): void => {
    undoBtn.disabled = !history.canUndo(); redoBtn.disabled = !history.canRedo();
    undoBtn.title = `${undoWords()} · pad SELECT${key('Ctrl+Z')}`;
    redoBtn.title = `${redoWords()} · pad hold SELECT${key('Ctrl+Y')}`;
  };
  /**
   * FUI-6 (the review's principle 5; a browser adaptation, FG.R2): the one command layer (`./shell/operations`). Every
   * layout edit is one entry: the agent's facade stages it there (`agentFacade.prepare`, as before), the page's handlers perform
   * their own scene edit through it (`personEdit`). A person's edit is refused while a lobby holds the layout, in
   * `refuseEdit`'s words; the agent's refusals stay the facade's. Each operation is one history step naming its actor.
   */
  const operations = createOperationRegistry({
    revision: () => agentLayoutRevision(),
    refusal: (spec, actor) => {
      if (actor.kind !== 'human' || !spec.mutates) return null;
      const why = forgeEditRefusal({ lobbyHolds: editsLocked() });
      return why === null ? null : { code: 'BLOCKED', message: why };
    },
    onRefused: (refusal) => notifier.refused(refusal.message),         // FUI-4 (IA-12): as `refuseEdit` says it
  });
  for (const o of FORGE_EDIT_OPERATIONS) {
    operations.register({ id: o.id, domain: o.domain, mutates: true, label: o.label,
      run: performedOr((args, ctx) => agentFacade.prepare(o.id, args, ctx.guard, ctx.signal, ctx.step)) });
  }
  /**
   * FUI-6: a person's edit through its entry: refused as `refuseEdit` refuses (said, false), else `perform` runs at once
   * as the operation's step. `admitted`: the handler admitted it itself before the scene changed (a drag let go).
   */
  const personEdit = (id: string, args: Record<string, unknown>, perform: (step: OperationStep) => void, admitted = false): boolean =>
    operations.perform(id, args, { admitted, perform: (ctx) => { perform(ctx.step); } });
  /** FUI-6: a map setting's change; its input was taken with no refusal before (the fields close under a hold). */
  const settingsEdit = (perform: () => void): void => { personEdit('settings.set', {}, perform, true); };
  /** The layout's text without the camera: an undo must not jump the view. */
  const layoutText = (): string => { const l = layoutNow(false); return l ? serializeLayout(l) : ''; };
  /**
   * Placements by identity, in the order `layoutNow` writes them (pieces, then spawns, then NPCs). A row in `roots` is
   * not stable: a restore rebuilds in that order, so the last row can become a spawn.
   */
  const placementIds = (): Map<string, Object3D> => {
    const map = new Map<string, Object3D>();
    let piece = 0, spawn = 0, respawn = 0, flare = 0, npc = 0, hostage = 0, zone = 0, point = 0, views = 0, turret = 0, door = 0, gate = 0, barrier = 0;
    const bombs = { start: 0, seal: 0, terrorist: 0 };
    for (const r of roots) {
      const bomb = bombKindOf(r);
      if (r.userData['forgePiece']) map.set(`piece:${piece++}`, r);
      else if (r.userData['forgeSpawn']) map.set(`spawn:${spawn++}`, r);
      else if (r.userData['forgeRespawn']) map.set(`respawn:${respawn++}`, r);
      else if (r.userData['forgeFlare']) map.set(`flare:${flare++}`, r);
      else if (r.userData['forgeNpc']) map.set(`npc:${npc++}`, r);
      else if (r.userData['forgeHostage']) map.set(`hostage:${hostage++}`, r);
      else if (r.userData['forgeZone']) map.set(`xzone:${zone++}`, r);   // `xzone:`, a rules zone's `zone:<id>` apart (FP-1b)
      else if (r.userData['forgeTurret']) map.set(`turret:${turret++}`, r);
      else if (r.userData['forgeDoor']) map.set(`door:${door++}`, r);
      else if (r.userData['forgeGate']) map.set(`gate:${gate++}`, r);
      else if (r.userData['forgeBarrier']) map.set(`barrier:${barrier++}`, r);
      else if (r.userData['forgePoint']) map.set(`point:${point++}`, r);
      else if (r.userData['forgeView']) map.set(`view:${views++}`, r);
      else if (bomb) map.set(`bomb:${bomb}:${bombs[bomb]++}`, r);   // FG-51: a file may name two sites of a team
    }
    return map;
  };
  /** The placements picked, as identities. A map prop has none. */
  const selectionIds = (): string[] => {
    const byObject = new Map([...placementIds()].map(([id, r]) => [r, id]));
    return picks.items.flatMap((r) => { const id = byObject.get(r); return id ? [id] : []; });
  };
  /** The step's selection put back. Whatever is picked now is not kept: the step owns it. */
  const applyPicked = (ids: readonly string[]): void => {
    const map = placementIds();
    picks.clear();
    basePicks.clear();
    picks.addAll(ids.flatMap((id) => { const r = map.get(id); return r ? [r] : []; }));
    showSelection();
  };
  /**
   * An edit made: saved, and a step. `before` is the selection at the edit (passed by a caller that changes it first);
   * omitted, it is the selection now. The step undone to restores `before`; the step redone to restores the selection after.
   */
  const edit = (before?: readonly string[], step: OperationStep | null = operations.active()): void => {
    keepEarlier = false;                                          // the player's own edit: theirs to keep now
    const prior = before ?? selectionIds();
    changed();
    // FUI-6: an operation's edit is its one step (actor, domain, words); an edit outside one is a step as before.
    if (step) recordOperationStep(history, step, layoutText(), prior, selectionIds());
    else recordEdit(history, layoutText(), prior, selectionIds());
    refreshUndo();
    refreshPlacementGround();
    agentChanged();
  };
  /** The autosave is the v2 record, camera included (`Layout.camera`, the fly pose's own numbers). A record over its bounds is not written, so a later reload cannot fail and replace it. */
  let autosaveRefusal = '';
  /**
   * #348's re-review: the load opened a fallback over an earlier autosave this disc cannot open (`./boot`). That autosave
   * is kept until the player edits, so a fallback's own write (a timer, a camera move, a close) does not replace it.
   */
  let keepEarlier = false;
  const writeAutosave = (l: Layout): Promise<void> => tracked(writeAutosaveNow(l));
  /**
   * The autosave's text for `l` (the v2/v3 record), or why it is not written (`checkRecord`). FCW-32: a layout with rules
   * writes its authoring envelope (`./rulesAuthoring` `forgeAuthoringText`); without, the record exactly as before.
   */
  const autosaveText = (l: ForgeLayout): { text: string } | { why: string } => forgeAuthoringText(l, l.name?.trim() || AUTOSAVE_NAME);
  const writeAutosaveNow = async (l: Layout): Promise<void> => {
    if (keepEarlier) return;
    const made = autosaveText(l);
    if ('why' in made) {
      if (made.why !== autosaveRefusal) { autosaveRefusal = made.why; say(`This layout is not saved: ${made.why}`, true); }
      return;
    }
    // R3-B: the autosave's own list in the store, by compare-and-swap on the one this page holds (opened or written:
    // the review of R3-B); a list another tab wrote is said, then taken in -- never written over unsaid. R7-5 (round 6's
    // finding): the text is this page's write in flight from now (`ForgeSaves.pending`), not only once its wait for the
    // open is over, so a pagehide that flushes an edit and a camera move and then hands off (`autosaveOnHide`, all in
    // one synchronous handler) names both as its own, and the next open does not take them for another tab's.
    await forgeSaves.pending('autosave', made.text, savesOpen());
    const text = made.text;
    if (text === forgeSaves.text('autosave')) { autosaveRefusal = ''; return; }
    const out = await forgeSaves.write('autosave', text, 'held');
    if (out === 'conflict') { autosaveRefusal = ''; forgeSaves.take('autosave'); savedElsewhere(); }
    else if (out === 'refused') {
      const refused = 'this browser refused the save';
      if (autosaveRefusal !== refused) { autosaveRefusal = refused; say(`This layout is not saved: ${refused}`, true); }
    } else autosaveRefusal = '';
    statusChips.update();
  };
  const changed = (): void => {
    agentMark();                                              // browser adaptation: the agent's layout revision
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { savePending = false; const l = settledLayout(); if (l && !autosaveOff) void writeAutosave(l); statusChips.update(); }, 300);
    savePending = true;
    lastIssues = null;                                        // FUI-4: an edit makes the last check stale
    refreshCounts();
    refreshGameTypes();                                       // FG-51: Demolition's readiness follows the markers
    drawRulesScene();                                         // FCW-32 step 4: the rules entities drawn, the panel told
    rulesChanged();
    lobbyTitle();
    drawOutliner();
    if (view.collision) scheduleHull();
    statusChips.update();
  };

  /* ---------- selection, inspector, outliner ---------- */
  /** FG-47: whether the selection is a group (more than one member). */
  const isGroup = (): boolean => picks.size + basePicks.size > 1;
  /** A box per member (FG-47): a map prop's read at its pick, a placement's from its drawing; none while playing. */
  const refreshBox = (): void => {
    const list = playing ? [] : [...basePicks.items.map((b) => b.box), ...picks.items.map((r) => new Box3().setFromObject(r))];
    while (boxes.length < list.length) { const h = new Box3Helper(new Box3(), new Color(0xd8a640)); scene.add(h); boxes.push(h); }
    boxes.forEach((h, i) => {
      const b = list[i];
      if (b) h.box.copy(b);
      h.visible = !!b && !b.isEmpty();
    });
  };
  /** FG-17: a map prop's drawn geometry's box at its placement (an instance of a shared draw, or a mesh of its own). */
  const basePropBox = (o: Mesh, m: Matrix4): Box3 => {
    o.geometry.computeBoundingBox();
    return o.geometry.boundingBox!.clone().applyMatrix4(m);
  };
  /** FG-47: a member's place and turn (`./group` `Pose`); a marker's turn is its yaw. */
  const isMarker = (r: Object3D): boolean => !!r.userData['forgeSpawn'] || !!r.userData['forgeRespawn'] || !!r.userData['forgeFlare'] || !!r.userData['forgeNpc'] || !!r.userData['forgeBomb'] || !!r.userData['forgeHostage'] || !!r.userData['forgeZone'] || !!r.userData['forgePoint'] || !!r.userData['forgeView'] || !!r.userData['forgeTurret'] || !!r.userData['forgeDoor'] || !!r.userData['forgeGate'] || !!r.userData['forgeBarrier'];
  const poseOf = (r: Object3D): Pose => ({
    p: [r.position.x, r.position.y, r.position.z],
    q: isMarker(r) ? yawQuat(r.rotation.y) : [r.quaternion.x, r.quaternion.y, r.quaternion.z, r.quaternion.w],
    marker: isMarker(r),
  });
  const applyPose = (r: Object3D, m: Pose): void => {
    r.position.set(...m.p);
    if (m.marker) r.rotation.set(0, yawOf(m.q), 0); else r.quaternion.set(...m.q);
  };
  /** FG-47: the placements picked, their poses replaced (the same order). */
  const applyPoses = (poses: readonly Pose[]): void => { picks.items.forEach((r, i) => { const m = poses[i]; if (m) applyPose(r, m); }); };
  const groupCentre = (): Vec3 | null => centreOf(picks.items.map((r) => [r.position.x, r.position.y, r.position.z] as Vec3));
  /** FG-47: the pivot at the group's centre, unturned (not during the gizmo's drag). */
  const placePivot = (): void => {
    const c = groupCentre();
    if (!c || dragFrom) return;
    pivot.position.set(...c);
    pivot.quaternion.identity();
    pivot.scale.set(1, 1, 1);
    pivot.updateMatrixWorld();
  };
  /** FG-47: the pivot's change since the drag's start, applied to every member: the turn about the centre, then the move. */
  const applyPivot = (from: { centre: Vec3; poses: Pose[] }): void => {
    const q = pivot.quaternion;
    const d: Vec3 = [pivot.position.x - from.centre[0], pivot.position.y - from.centre[1], pivot.position.z - from.centre[2]];
    applyPoses(movedBy(turnedAbout(from.poses, from.centre, [q.x, q.y, q.z, q.w]), d));
  };
  /** FG-47: a move, turn or copy of a group with map props in it passes over them (they cannot move): said once. */
  const passOver = (what: string): void => {
    const n = basePicks.size;
    if (n > 0) say(`${n} map prop${n === 1 ? '' : 's'} not ${what}: the map's own props stay where the disc put them`);
  };
  const deg = (r: number): number => Math.round(((r * 180) / Math.PI + 360) % 360);
  /** FG-21: a character's name in the forge: its side and number, and its `character.rdr` character. */
  const charLabel = (side: 'seal' | 'terrorist', type: number): string => {
    const b = charMap?.types?.[side]?.[type];
    return `${side === 'seal' ? 'SEAL' : 'Terrorist'} ${type + 1}${b?.character ? ` · ${b.character}` : ''}`;
  };
  const npcOf = (r: Object3D): { side: 'seal' | 'terrorist'; type: number } | undefined => r.userData['forgeNpc'] as { side: 'seal' | 'terrorist'; type: number } | undefined;
  /** A placed hostage's own name, character and the map lending it (`HostageMarker`), kept on its marker; each may be absent. */
  const hostageOf = (r: Object3D): { name?: string; character?: string; source?: string } => {
    const v = r.userData['forgeHostage'];
    return v && typeof v === 'object' ? v as { name?: string; character?: string; source?: string } : {};
  };
  /** A placed hostage wears another disc map's character (`source`): its body is lent to the match (`withLentHostageBodies`). */
  function anyLentHostage(): boolean { return roots.some((r) => !!(r.userData['forgeHostage'] as { source?: string } | undefined)?.source); }
  /** Each disc map's archive as a hostage's character is lent from it, loaded once a stem; one not on this disc, null. */
  const hostageLibs = new Map<string, Promise<LoadedMap | null>>();
  const hostageLibOf = (stem: string): Promise<LoadedMap | null> => {
    let ask = hostageLibs.get(stem);
    if (!ask) { ask = absent.has(stem) ? Promise.resolve(null) : archives.load(stem).catch(() => null); hostageLibs.set(stem, ask); }
    return ask;
  };
  /** The hostage names in use: the base's own (or a blank floor's library's) and the placed ones, so a new one takes the next. */
  const hostageNamesTaken = (): string[] => [...((baseMap ?? charMap)?.escortees ?? []).map((e) => e.name),
    ...roots.flatMap((r) => (r.userData['forgeHostage'] ? [hostageOf(r).name ?? ''] : []))];
  /** The turrets each archive holds (`./turrets` `turretTemplates`), read once a stem; an archive with none, none. */
  const turretCatalogue = new Map<string, Promise<TurretTemplate[]>>();
  const turretsOf = (stem: string): Promise<TurretTemplate[]> => {
    let ask = turretCatalogue.get(stem);
    if (!ask) {
      ask = (absent.has(stem) ? Promise.resolve(null) : archives.load(stem).catch(() => null)).then((lib) => (lib ? turretTemplates(lib, stem) : []));
      turretCatalogue.set(stem, ask);
    }
    return ask;
  };
  /** The template a placed turret names, or null where its archive is not on this disc or holds no such turret. */
  const turretTemplate = async (source: string, name: string): Promise<TurretTemplate | null> =>
    (await turretsOf(source)).find((t) => t.name === name) ?? null;
  /** The turret a new placement copies: the palette archive's first, else Crossroads' RMG; null when neither is here. */
  const defaultTurret = async (): Promise<{ source: string; name: string } | null> => {
    const own = (await turretsOf(paletteSel.value))[0];
    if (own) return { source: own.source, name: own.name };
    return (await turretTemplate(DEFAULT_TURRET.source, DEFAULT_TURRET.name)) ? { ...DEFAULT_TURRET } : null;
  };
  /**
   * A placed turret's marker: its template's model as the disc draws it (`turretModelMap`, built once a model), else --
   * its archive not here -- a stand-in pick box, so the placement is kept. Tagged with its source and name, and its
   * definition for the Inspector's Data (read only: the disc's).
   */
  async function newTurret(source: string, name: string): Promise<Object3D> {
    const t = await turretTemplate(source, name);
    const r = (t ? pieces.modelOf(`turret:${source}:${name}`, turretModelMap(t)) : null) ?? pointMarker('point');
    const d = t?.placement;
    r.userData['forgeTurret'] = { source, name, ...(d ? { weapon: d.weapon, ammo: d.ammoInit, mountRange: d.mountRange,
      yawLimitsDeg: d.def.limitsDeg.yaw, pitchLimitsDeg: d.def.limitsDeg.pitch } : { missing: true }) };
    r.name = `turret ${name}`;
    // Its facing and the arc its gun turns through (`./interactOverlay`), in the marker's frame: they turn with it.
    if (t) { const g = turretGuide(t.placement); r.add(guideIn(g.segments, g.triangles, turretMove(t, [0, 0, 0], 0), TURRET_GUIDE_COLOUR, 'userTurrets')); }
    return r;
  }
  /** The doors each archive holds (`./placedDoors` `doorTemplates`), read once a stem; an archive with none, none. */
  const doorCatalogue = new Map<string, Promise<DoorTemplate[]>>();
  const doorsOf = (stem: string): Promise<DoorTemplate[]> => {
    let ask = doorCatalogue.get(stem);
    if (!ask) {
      ask = (absent.has(stem) ? Promise.resolve(null) : archives.load(stem).catch(() => null)).then((lib) => (lib ? doorTemplates(lib, stem) : []));
      doorCatalogue.set(stem, ask);
    }
    return ask;
  };
  const doorTemplate = async (source: string, name: string): Promise<DoorTemplate | null> => (await doorsOf(source)).find((t) => t.name === name) ?? null;
  /** The door a new placement copies: the palette archive's first, else Frostfire's bdoor_4; null when neither is here. */
  const defaultDoor = async (): Promise<{ source: string; name: string } | null> => {
    const own = (await doorsOf(paletteSel.value))[0];
    if (own) return { source: own.source, name: own.name };
    return (await doorTemplate(DEFAULT_DOOR.source, DEFAULT_DOOR.name)) ? { ...DEFAULT_DOOR } : null;
  };
  /**
   * The placed flares turned to the camera each frame (`../facade` `turnFacade`, `FUN_00317fc0` as the world's `frame`
   * does it): each glow mesh about its own origin, the eye in its parent's frame -- so a placed flare's turn and yaw do not
   * matter, as the game's do not. A clone's own meshes: the template's are never framed.
   */
  const flareEye = new Vector3();
  const flareEyeAt: [number, number, number] = [0, 0, 0];
  const flareAt: [number, number, number] = [0, 0, 0];
  function turnPlacedFlares(eye: Vector3): void {
    for (const r of roots) {
      const facade = (r.userData['forgeFlare'] as { facade?: number } | undefined)?.facade;
      if (!facade) continue;
      r.updateMatrixWorld();
      r.traverse((o) => {
        if (!o.name.endsWith('(flare)') || !o.parent) return;
        o.parent.worldToLocal(flareEye.copy(eye)).toArray(flareEyeAt);
        turnFacade(o, facade, o.position.toArray(flareAt) as [number, number, number], flareEyeAt);
      });
    }
  }
  /** The flares each archive holds (`./placedFlares` `flareTemplates`: its facade nodes), read once a stem. */
  const flareCatalogue = new Map<string, Promise<FlareTemplate[]>>();
  const flaresOf = (stem: string): Promise<FlareTemplate[]> => {
    let ask = flareCatalogue.get(stem);
    if (!ask) { ask = hostageLibOf(stem).then((lib) => (lib ? flareTemplates(lib, stem) : [])); flareCatalogue.set(stem, ask); }
    return ask;
  };
  const flareTemplate = async (source: string, name: string): Promise<FlareTemplate | null> =>
    (await flaresOf(source)).find((t) => t.name === name) ?? null;
  /**
   * The flare a new placement copies (a browser adaptation, FG.R2): the palette archive's first, else the base map's
   * own; null when neither has one (no disc default: which glow is not the game's to say).
   */
  const defaultFlare = async (): Promise<{ source: string; name: string } | null> => {
    for (const stem of [paletteSel.value, baseMap?.archive ?? '']) {
      if (!stem || absent.has(stem)) continue;
      const own = (await flaresOf(stem))[0];
      if (own) return { source: own.source, name: own.name };
    }
    return null;
  };
  /**
   * A placed flare's marker: its facade node alone as the disc draws it (`flareModelMap`), else a stand-in; tagged with
   * its source, name and facade value (`turnPlacedFlares` turns it), and an unseen box a click finds (a glow is a quad).
   */
  async function newFlare(source: string, name: string): Promise<Object3D> {
    const t = await flareTemplate(source, name);
    const r = (t ? pieces.modelOf(`flare:${source}:${name}`, flareModelMap(t)) : null) ?? pointMarker('point');
    r.userData['forgeFlare'] = { source, name, facade: t?.prop.facade ?? 0, ...(t ? { model: t.prop.modelName } : { missing: true }) };
    r.name = `flare ${name}`;
    const pick = new Mesh(new BoxGeometry(FLARE_PICK_SIZE, FLARE_PICK_SIZE, FLARE_PICK_SIZE), new MeshBasicMaterial({ visible: false }));
    pick.name = 'flare pick';
    r.add(pick);
    return r;
  }
  /** The ladder a new placement is: the palette archive's first ladder prop, else Sandstorm's ladder35; null when neither is here. */
  const defaultLadder = async (): Promise<string | null> => {
    for (const stem of [paletteSel.value, DEFAULT_LADDER.source]) {
      if (!stem || absent.has(stem)) continue;
      const lib = await hostageLibOf(stem);
      const own = lib ? ladderPropsOf(lib) : [];
      const pick = stem === DEFAULT_LADDER.source ? own.find((l) => l.model === DEFAULT_LADDER.name) ?? own[0] : own[0];
      if (pick) return assetId(stem, pick.model);
    }
    return null;
  };
  /** A placed door's marker: its template's leaf and frame as the disc draws them, its hinge at the origin; else a stand-in. */
  async function newDoor(source: string, name: string): Promise<Object3D> {
    const t = await doorTemplate(source, name);
    const r = (t ? pieces.modelOf(`door:${source}:${name}`, doorModelMap(t)) : null) ?? pointMarker('point');
    r.userData['forgeDoor'] = { source, name, ...(t ? { swing: t.spec.programs.map((p) => p.name), range: t.spec.range, elevation: t.spec.elevation } : { missing: true }) };
    r.name = `door ${name}`;
    // Which way it swings (`./interactOverlay`): its template's own swing, in the marker's frame (the hinge at its origin).
    const swing = t ? swingOf(t.spec, t.owners.flatMap((o) => o.polys.map((q) => q.points))) : null;
    if (t && swing) r.add(guideIn(swingSegments(swing), swingTriangles(swing), doorMove(t, [0, 0, 0], 0), DOOR_SWING_COLOUR, 'userDoors'));
    return r;
  }
  const doorLabel = (r: Object3D): string => `Door · ${(r.userData['forgeDoor'] as { name?: string } | undefined)?.name ?? ''}`;
  /** The gates and C4 barriers each archive holds (`./placedAccess` `accessTemplates`), read once a stem. */
  const accessCatalogue = new Map<string, Promise<AccessTemplate[]>>();
  const accessOf = (stem: string): Promise<AccessTemplate[]> => {
    let ask = accessCatalogue.get(stem);
    if (!ask) {
      ask = (absent.has(stem) ? Promise.resolve(null) : archives.load(stem).catch(() => null)).then((lib) => (lib ? accessTemplates(lib, stem) : []));
      accessCatalogue.set(stem, ask);
    }
    return ask;
  };
  const accessTemplate = async (kind: 'gate' | 'barrier', source: string, name: string): Promise<AccessTemplate | null> =>
    (await accessOf(source)).find((t) => t.kind === kind && t.name === name) ?? null;
  /** The gate or barrier a new placement copies: the palette archive's first, else Death Trap's or Vigilance's access1. */
  const defaultAccess = async (kind: 'gate' | 'barrier'): Promise<{ source: string; name: string } | null> => {
    const own = (await accessOf(paletteSel.value)).find((t) => t.kind === kind);
    if (own) return { source: own.source, name: own.name };
    const d = kind === 'gate' ? DEFAULT_GATE : DEFAULT_BARRIER;
    return (await accessTemplate(kind, d.source, d.name)) ? { ...d } : null;
  };
  /**
   * A placed gate's or barrier's marker: its template whole as the disc draws it (its wreck off), its anchor at the
   * origin; else a stand-in. Tagged with its source and name, and the template's data for the Inspector (read only).
   */
  async function newAccess(kind: 'gate' | 'barrier', source: string, name: string): Promise<Object3D> {
    const t = await accessTemplate(kind, source, name);
    const r = (t ? pieces.modelOf(`access:${source}:${name}`, accessModelMap(t)) : null) ?? pointMarker('point');
    r.userData[kind === 'gate' ? 'forgeGate' : 'forgeBarrier'] = { source, name, ...(t ? {
      parts: t.pieces.length, health: t.destructibles.map((d) => d.health), shield: t.destructibles.map((d) => d.shield),
      ...(t.gate ? { slide: t.gate.spec.open, seconds: t.gate.spec.seconds, levers: t.gate.spec.levers.length } : {}),
    } : { missing: true }) };
    r.name = `${kind} ${name}`;
    // Where and which way it is used (`./placedAccess` `accessGizmo`): its C4 prompt's reach, a gate's slide and lever.
    if (t) {
      const g = accessGizmo(t, 'atGate');
      r.add(guideIn(g.segments, g.triangles, accessMove(t, [0, 0, 0], 0), kind === 'gate' ? GATE_GUIDE_COLOUR : BARRIER_GUIDE_COLOUR, kind === 'gate' ? 'userGates' : 'userBarriers'));
    }
    return r;
  }
  /**
   * A placed plant site's gizmo (`./interactOverlay` `bombSiteShapes`): the reach its file keeps (`forgeBombFile`, else
   * `BOMB_SITE_REACH`), in the marker's own frame; a bomb start has none. An edit re-stages the marker, so it is drawn anew.
   */
  function addSiteGuide(r: Object3D, preview?: { range?: number; elevation?: number }): void {
    const kind = r.userData['forgeBomb'] as BombMarkerKind | undefined;
    if (!kind || kind === 'start') return;
    // The one drawn before (a preview's redraw, `preview` the scrubbed value over the file's): let go first.
    for (const old of r.children.filter((c) => c.userData['forgeSiteGuide'])) { r.remove(old); disposeGuide(old); }
    const file = r.userData['forgeBombFile'] as { range?: number; elevation?: number } | undefined;
    const g = bombSiteShapes([0, 0, 0], preview?.range ?? file?.range ?? BOMB_SITE_REACH, preview?.elevation ?? file?.elevation ?? BOMB_SITE_REACH);
    if (!g.segments.length) return;
    const guide = guideIn(g.segments, g.triangles, null, BOMB_SITE_GUIDE_COLOUR, 'userActions');
    guide.userData['forgeSiteGuide'] = true;
    r.add(guide);
  }
  const accessOwnOf = (r: Object3D): { kind: 'gate' | 'barrier'; source: string; name: string } | null => {
    const g = r.userData['forgeGate'] as { source: string; name: string } | undefined;
    if (g) return { kind: 'gate', source: g.source, name: g.name };
    const b = r.userData['forgeBarrier'] as { source: string; name: string } | undefined;
    return b ? { kind: 'barrier', source: b.source, name: b.name } : null;
  };
  const accessLabel = (r: Object3D): string => { const a = accessOwnOf(r)!; return `${a.kind === 'gate' ? 'Gate' : 'C4 barrier'} · ${a.source} ${a.name}`; };
  /** A placed turret's words: its node name and its weapon. */
  const turretLabel = (r: Object3D): string => {
    const t = r.userData['forgeTurret'] as { name: string; weapon?: string | null } | undefined;
    return t ? `${t.name}${t.weapon ? ` · ${t.weapon}` : ''}` : 'Turret';
  };
  /** A placed tactical point's or spectator view's name, kept on its marker. */
  const pointNameOf = (r: Object3D): string => ((r.userData['forgePoint'] ?? r.userData['forgeView']) as { name?: string } | undefined)?.name ?? 'Point';
  /** A placed tactical point's marker, named, of its kind. */
  const newPoint = (name: string, kind: number): Object3D => { const r = pointMarker('point'); r.userData['forgePoint'] = { name, kind }; return r; };
  /** A placed spectator view's marker, named, its look (degrees, the camera's own). */
  const newView = (name: string, yaw: number, pitch: number): Object3D => {
    const r = pointMarker('view');
    r.userData['forgeView'] = { name, yaw, pitch };
    // The way it looks (`./interactOverlay` `viewShapes`): its own yaw and pitch, the world's turn kept (the marker is not
    // turned by them); an Inspector change rebuilds the marker, the arrow with it.
    const look = viewShapes([0, 0, 0], yaw, pitch, VIEW_ARROW_LENGTH);
    const guide = guideIn(look.segments, look.triangles, null, VIEW_GUIDE_COLOUR, 'userScenicViews');
    keepWorldTurn(guide);
    r.add(guide);
    return r;
  };
  /** The names in use of a kind: the base's own (its tactical points; its views) and the placed ones, so a new one takes the next. */
  const pointNamesTaken = (kind: 'point' | 'view'): string[] => kind === 'point'
    ? [...(baseMap?.tac?.points ?? []).filter((p) => p.kind === 1).map((p) => p.name), ...roots.filter((r) => r.userData['forgePoint']).map(pointNameOf)]
    : [...(baseMap?.scenicViews ?? []).map((v) => v.name), ...roots.filter((r) => r.userData['forgeView']).map(pointNameOf)];
  /** A placed extraction zone's name (Safety, Safety2...), kept on its marker. */
  const zoneNameOf = (r: Object3D): string => (r.userData['forgeZone'] as { name?: string } | undefined)?.name ?? 'Safety';
  /** A placed extraction zone's marker, named. */
  const newZone = (name: string, w: number, d: number): Object3D => {
    const r = extractionZoneMarker(w, d);
    r.userData['forgeZone'] = { w, d, name };
    return r;
  };
  /** The zone names in use: the base map's own (its tactical zones) and the ones placed, so a new one takes the next. */
  const zoneNamesTaken = (): string[] => [...(baseMap?.tac?.zones ?? []).map((z) => z.name), ...roots.filter((r) => r.userData['forgeZone']).map(zoneNameOf)];
  const bombLabel = (kind: BombMarkerKind): string => kind === 'start' ? 'Bomb start' : kind === 'seal' ? 'Site · SEAL' : 'Site · Terrorist';
  const nameOf = (r: Object3D): string => {
    const n = npcOf(r);
    if (n) return `NPC · ${charLabel(n.side, n.type)}`;
    const bomb = bombKindOf(r);
    if (bomb) return bombLabel(bomb);
    if (r.userData['forgeHostage']) return hostageOf(r).name ?? 'Hostage';
    if (r.userData['forgeZone']) return zoneNameOf(r);
    if (r.userData['forgePoint'] || r.userData['forgeView']) return pointNameOf(r);
    if (r.userData['forgeTurret']) return turretLabel(r);
    if (r.userData['forgeDoor']) return doorLabel(r);
    if (accessOwnOf(r)) return accessLabel(r);
    if (r.userData['forgeRespawn']) return `Respawn ${r.userData['forgeRespawn'] as string}`;
    if (r.userData['forgeFlare']) return `Flare · ${(r.userData['forgeFlare'] as { name: string }).name}`;
    return (r.userData['forgePiece'] as string | undefined) ?? `Spawn ${r.userData['forgeSpawn'] as string}`;
  };
  /** FUI-22 (D2): the Inspector head's kind word for a placement. */
  const kindOf = (r: Object3D): string => (bombKindOf(r) ? 'Objective' : r.userData['forgeHostage'] ? 'Hostage' : r.userData['forgeZone'] ? 'Zone' : r.userData['forgePoint'] ? 'Tactical point' : r.userData['forgeView'] ? 'Spectator view' : r.userData['forgeTurret'] ? 'Turret' : r.userData['forgeDoor'] ? 'Door' : r.userData['forgeGate'] ? 'Gate' : r.userData['forgeBarrier'] ? 'C4 barrier' : npcOf(r) ? 'NPC' : r.userData['forgeFlare'] !== undefined ? 'Flare' : r.userData['forgeRespawn'] ? 'Respawn point' : r.userData['forgeSpawn'] ? 'Spawn' : 'Piece');
  /**
   * The Inspector's pitch, roll and scale (a browser adaptation, FG.R2): drawn, not yet wired. A single piece shows its
   * own values (pitch and roll read in the `YXZ` order, so yaw stays the turn about Y); anything else -- a group, a map
   * prop, a marker, a rules entity -- has them off, as its record keeps a yaw alone. An edit goes to `transformStub`.
   */
  const stubFields = [fpitch, froll, fsx, fsy, fsz];
  const fillStubFields = (force = false): void => {
    const s = selected;
    const piece = s !== null && !isGroup() && !baseSelected && kindOf(s) === 'Piece' ? s : null;
    for (const f of stubFields) f.disabled = !piece || editsLocked();
    const turn = piece ? new Euler().setFromQuaternion(piece.quaternion, 'YXZ') : null;
    const scaled = (v: number): string => String(Math.round(v * 1000) / 1000);
    const show = (f: HTMLInputElement, v: string): void => { if (force || doc.activeElement !== f) f.value = v; };
    show(fpitch, turn ? String(deg(turn.x)) : '');
    show(froll, turn ? String(deg(turn.z)) : '');
    show(fsx, piece ? scaled(piece.scale.x) : '');
    show(fsy, piece ? scaled(piece.scale.y) : '');
    show(fsz, piece ? scaled(piece.scale.z) : '');
  };
  /**
   * STUB: pitch, roll and scale edits are not applied. Record v3 keeps a piece's yaw alone (`creator-contracts`
   * `recordOfLayout`), so a tilt or a scale would be lost at the next save; the field is put back and the page says so.
   */
  const transformStub = (f: HTMLInputElement): void => {
    fillStubFields(true);
    say(`${f.dataset['label'] ?? 'This field'} is not wired yet: a saved layout keeps a piece's yaw only`);
  };
  for (const f of stubFields) f.addEventListener('change', () => transformStub(f));
  // FC-1 (`./transformStubs`): while the switch is on, the stubs are hidden -- Pitch and Roll beside a real Yaw, and the
  // whole Scale row with its reset; Position, Yaw and the rotation's reset (a yaw reset) stay.
  if (FORGE_TRANSFORM_STUBS_HIDDEN_ADAPTATION) {
    for (const f of [fpitch, froll]) (f.closest<HTMLElement>('.fx-field') ?? f).hidden = true;
    (fsx.closest<HTMLElement>('.fx-scale-fields') ?? fsx).hidden = true;
  }
  const refreshInspectorFields = (): void => {
    const s = selected;
    fillStubFields();
    fyaw.disabled = isGroup() || editsLocked();             // FG-47 (the review's F1): the lobby's lock holds the yaw too
    inspectKind.textContent = isGroup() ? 'Group' : baseSelected ? 'Map prop' : s ? kindOf(s) : '';
    const entity = !s && !isGroup() && !baseSelected && entityPicked !== null ? rulesEntityRefs().find((e) => e.ref === entityPicked) : undefined;
    if (entity) {
      // FCW-32 step 4 (D4): a rules entity picked from its Outliner row -- its place and turn, each a planner edit by its id.
      inspectKind.textContent = RULES_ENTITY_WORD[entity.kind];
      inspectName.textContent = entity.label;
      fields.classList.remove('is-off');
      const active = doc.activeElement;
      if (active !== fx) fx.value = String(Math.round(entity.at[0]));
      if (active !== fy) fy.value = String(Math.round(entity.at[1]));
      if (active !== fz) fz.value = String(Math.round(entity.at[2]));
      fyaw.disabled = entity.yaw === null || editsLocked();
      if (active !== fyaw) fyaw.value = entity.yaw === null ? '' : String(deg(entity.yaw));
      return;
    }
    if (isGroup()) {
      // FG-47: the count and the centre of the placements picked; typing one moves the whole group; no yaw.
      const c = groupCentre();
      const n = picks.size + basePicks.size;
      inspectName.textContent = `${n} selected${basePicks.size ? ` \u00b7 ${basePicks.size} map prop${basePicks.size === 1 ? '' : 's'}, which stay` : ''}`;
      fields.classList.toggle('is-off', !c);
      const active = doc.activeElement;
      if (active !== fx) fx.value = c ? String(Math.round(c[0])) : '';
      if (active !== fy) fy.value = c ? String(Math.round(c[1])) : '';
      if (active !== fz) fz.value = c ? String(Math.round(c[2])) : '';
      fyaw.value = '';
      return;
    }
    if (baseSelected) {
      fields.classList.add('is-off');
      inspectName.textContent = `Map prop \u00b7 ${baseSelected.model} \u2014 Delete hides it in this layout`;
      for (const f of [fx, fy, fz, fyaw]) f.value = '';
      return;
    }
    if (!s && mapDataSelected) {
      // The map's own data selected (a spawn slot, a door, a view...): named and placed, read only -- its fields off.
      const item = mapDataSelected;
      fields.classList.add('is-off');
      inspectKind.textContent = MAP_DATA_MARKS[item.kind]?.word ?? 'Map data';
      inspectName.textContent = item.label;
      fx.value = String(Math.round(item.at[0]));
      fy.value = String(Math.round(item.at[1]));
      fz.value = String(Math.round(item.at[2]));
      fyaw.value = item.view ? String(Math.round(item.view.yaw)) : '';
      return;
    }
    if (!s && lockHeld.length > 0) {
      // Just locked from the Inspector: shown, read-only, until its Unlock or another selection.
      fields.classList.add('is-off');
      inspectKind.textContent = 'Locked';
      inspectName.textContent = lockHeld.length === 1 ? nameOf(lockHeld[0]!) : `${lockHeld.length} locked`;
      for (const f of [fx, fy, fz, fyaw]) f.value = '';
      return;
    }
    fields.classList.toggle('is-off', !s);
    if (!s) { inspectName.textContent = 'Nothing selected'; for (const f of [fx, fy, fz, fyaw]) f.value = ''; return; }
    inspectName.textContent = nameOf(s);
    const active = doc.activeElement;
    if (active !== fx) fx.value = String(Math.round(s.position.x));
    if (active !== fy) fy.value = String(Math.round(s.position.y));
    if (active !== fz) fz.value = String(Math.round(s.position.z));
    if (active !== fyaw) fyaw.value = String(deg(s.rotation.y));
  };
  /** The rules entity the Inspector shows (picked from its Outliner row, nothing else selected), or undefined. */
  const inspectedEntity = (): { ref: string; at: [number, number, number]; yaw: number | null } | undefined =>
    !selected && !isGroup() && !baseSelected && entityPicked !== null ? rulesEntityRefs().find((e) => e.ref === entityPicked) : undefined;
  /**
   * Each transform row's reset (a browser adaptation, FG.R2), shown only when the row is off its default -- position 0,
   * rotation 0, scale 1 -- read off the selection itself, not the rounded fields. One placement or one rules entity
   * only (a group's centre is not a value of its own); none under the lobby's lock.
   */
  const RESET_EPSILON = 1e-6;
  const showResets = (): void => {
    const s = isGroup() || baseSelected ? null : selected;
    const entity = inspectedEntity();
    const open = !editsLocked();
    const away = (v: number, d: number): boolean => Math.abs(v - d) > RESET_EPSILON;
    const turned = (a: number): boolean => away(Math.cos(a), 1);   // a whole turn is home
    resetPosition.hidden = !open || !(s ? s.position.toArray().some((v) => away(v, 0)) : entity ? entity.at.some((v) => away(v, 0)) : false);
    resetRotation.hidden = !open || !(s ? away(Math.abs(s.quaternion.w), 1) : entity && entity.yaw !== null ? turned(entity.yaw) : false);
    resetScale.hidden = !open || !(s && !isMarker(s) ? s.scale.toArray().some((v) => away(v, 1)) : false);
  };
  /**
   * The Inspector's Data (a browser adaptation, FG.R2): the selected object's own record, read only, under its
   * transform -- a map data item's as the map gives it, a map prop's placement, a placement's editor data (each
   * `forge*` field it carries, a hostage's, a zone's and a bomb site's too); a group or nothing, none.
   */
  const inspectorData = (): unknown => {
    if (isGroup()) return null;
    if (baseSelected) return { model: baseSelected.model, key: baseSelected.key };
    const s = selected;
    if (!s && mapDataSelected) return mapDataSelected.data ?? null;
    if (!s) return null;
    const own: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(s.userData)) {
      if (!k.startsWith('forge') || typeof v === 'function') continue;
      own[k.slice(5, 6).toLowerCase() + k.slice(6)] = v;
    }
    return own;
  };
  /**
   * The selected placement's fields the layout keeps, as the Data list's editors (a browser adaptation, FG.R2): each
   * change one of the planner's `placement.set` (one undo step, checked as the agent's), its lock the Lock's own edit.
   * A group, a map's own data or a map prop: none (the disc's data is read only).
   */
  /** The turret models the Inspector offers (`<archive>:<turret>`): the palette's and Crossroads', as their archives read. */
  /**
   * The disc's doors and turrets the Inspector offers, a map at a time (a browser adaptation, FG.R2): the Map choice
   * lists every multiplayer map on this disc; its doors or turrets are read when it is first chosen (`doorsOf`,
   * `turretsOf`: its archive loaded once) and listed by name with their model and swing, or weapon. Until read, none.
   */
  const copyLists = { door: new Map<string, (readonly [string, string])[]>(), turret: new Map<string, (readonly [string, string])[]>(), hostage: new Map<string, (readonly [string, string])[]>(), ladder: new Map<string, (readonly [string, string])[]>(), flare: new Map<string, (readonly [string, string])[]>(), gate: new Map<string, (readonly [string, string])[]>(), barrier: new Map<string, (readonly [string, string])[]>() };
  const copyList = (kind: CopyKind, stem: string): (readonly [string, string])[] | null => {
    const counted = censusKnown.get(stem)?.[kind];
    if (counted) return counted;
    const got = copyLists[kind].get(stem);
    if (got) return got;
    if (!copyLists[kind].has(stem)) {
      copyLists[kind].set(stem, undefined as never);
      const ask = kind === 'flare'
        ? flaresOf(stem).then((ts) => ts.map((t) => [t.name, `${t.name} \u00b7 ${t.prop.modelName}`] as const))
        : kind === 'ladder' || kind === 'gate' || kind === 'barrier'
        ? hostageLibOf(stem).then((lib) => (lib ? copiesOf(lib)[kind] : []))
        : kind === 'hostage'
        ? hostageLibOf(stem).then((lib) => hostageCharactersOf(lib).map((c) => [c, c] as const))
        : kind === 'door'
        ? doorsOf(stem).then((ts) => ts.map((t) => [t.name, `${t.name.trim()} \u00b7 ${t.pieces[0]?.prop.modelName ?? '?'} \u00b7 ${t.spec.programs.map((p) => p.name).join(' + ')}`] as const))
        : turretsOf(stem).then((ts) => ts.map((t) => [t.name, `${t.name.trim()} \u00b7 ${t.placement.weapon ?? 'no weapon'}`] as const));
      void ask.then((list) => { copyLists[kind].set(stem, list); refreshInspector(); });
    }
    return null;
  };
  /**
   * Each multiplayer map's doors, turrets and hostages (`./mapCensus`), counted in the background once a Map choice is
   * first shown -- the worker reads each map once, one at a time, keeping only its counts -- so the choice lists only
   * the maps with one of the kind to copy.
   */
  const censusKnown = new Map<string, MapCopies>();
  let censusAsked = false;
  const askCensus = (): void => {
    if (censusAsked) return;
    censusAsked = true;
    const none: MapCopies = { door: [], turret: [], hostage: [], ladder: [], gate: [], barrier: [], flare: [] };
    for (const [stem] of copyMaps()) {
      if (absent.has(stem)) { censusKnown.set(stem, none); continue; }
      void archives.census(stem).then((c) => { censusKnown.set(stem, c ?? none); refreshInspector(); });
    }
  };
  /**
   * A Map choice made, its placement waiting on the change (`ref` to the map chosen): the Map shows the new map at once
   * and the choice under it "reading", until the edit lands or is refused.
   */
  const copyPending = new Map<string, string>();
  /**
   * The Map choice's change: that map's first door, turret or character -- the census's list at once, else read off the
   * map (`first`) -- set by `apply`; a map with none refused. The Inspector redrawn meanwhile, and again when it lands.
   */
  const switchCopyMap = (ref: string, kind: CopyKind, stem: string, first: () => Promise<string | null>, apply: (name: string) => Promise<void>): void => {
    copyPending.set(ref, stem);
    refreshInspector();
    const counted = censusKnown.get(stem)?.[kind];
    void (counted ? Promise.resolve(counted[0]?.[0] ?? null) : first()).then(async (name) => {
      if (name === null) { notifier.refused(`${stem} has no ${kind} to copy`); return; }
      await apply(name);
    }).finally(() => { copyPending.delete(ref); refreshInspector(); });
  };
  /** The Map choice's options for `kind`: only the maps with one to copy, each listed once counted (`censusOptions`). */
  const mapChoices = (kind: CopyKind, current: string): (readonly [string, string])[] => {
    askCensus();
    const maps = copyMaps();
    const known = (stem: string): MapCensus | null => { const c = censusKnown.get(stem); return c ? censusOfCopies(c) : null; };
    return censusOptions(maps.some(([m]) => m === current) ? maps : [[current, current] as const, ...maps], known, kind, current);
  };
  /** The multiplayer maps on this disc, by stem and name: where a door or turret may be copied from. */
  const copyMaps = (): (readonly [string, string])[] => entries.filter((e) => !e.campaign && /^MP\d+$/i.test(e.stem)).map((e) => [e.stem, `${e.stem} \u00b7 ${e.label}`] as const);
  /**
   * A copied door's or turret's two choices: its map, and its door or turret on that map. A map changed takes that map's
   * first (read first, refused where it has none); either change is the planner's `placement.set` of its `model`.
   */
  const copyEditors = (kind: 'door' | 'turret' | 'ladder' | 'flare' | 'gate' | 'barrier', ref: string, own: { source: string; name: string }, off: boolean, set: (v: string) => Promise<void>): InspectorEditor[] => {
    const pending = copyPending.get(ref);
    const list = pending ? null : copyList(kind, own.source);
    const words = kind;
    return [
      { label: 'Map', kind: 'select', value: pending ?? own.source, covers: [`${kind}.source`], disabled: off,
        options: mapChoices(kind, pending ?? own.source),
        title: `The disc map whose ${words} it copies`,
        set: (v) => {
          const stem = String(v);
          const first = kind === 'gate' || kind === 'barrier'
            ? () => accessOf(stem).then((ts) => ts.find((t) => t.kind === kind)?.name ?? null)
            : kind === 'ladder'
            ? () => hostageLibOf(stem).then((lib) => (lib ? ladderPropsOf(lib)[0]?.model ?? null : null))
            : kind === 'flare'
            ? () => flaresOf(stem).then((ts) => ts[0]?.name ?? null)
            : () => (kind === 'door' ? doorsOf(stem) : turretsOf(stem)).then((ts) => ts[0]?.name ?? null);
          switchCopyMap(ref, kind, stem, first, (name) => set(`${stem}:${name}`));
        } },
      { label: kind === 'door' ? 'Door' : kind === 'ladder' ? 'Ladder' : kind === 'flare' ? 'Flare' : kind === 'gate' ? 'Gate' : kind === 'barrier' ? 'Barrier' : 'Turret', kind: 'select', value: pending ? '' : own.name, covers: [`${kind}.name`], disabled: off || !list,
        options: pending ? [['', `(reading ${pending}...)`]] : list ? (list.some(([n]) => n === own.name) ? list : [...list, [own.name, own.name] as const]) : [[own.name, `${own.name.trim()} (reading the map...)`]],
        title: kind === 'flare' ? "The disc glow it copies: one facade node, the lamp it hangs on left behind" : kind === 'gate' ? "The disc gate it copies: its slide, its lever and its wreck are that gate's" : kind === 'barrier' ? "The disc access barrier it copies: its health, its parts and its wreck are that barrier's" : kind === 'door' ? "The disc door it copies: its swing and reach are that door's" : kind === 'ladder' ? "The disc ladder prop it is: its height and rungs are that ladder's" : "The disc turret it copies: its definition, weapon and limits are that turret's",
        set: (v) => set(`${own.source}:${String(v)}`) },
    ];
  };
  const inspectorEditors = (): InspectorEditor[] => {
    const s = isGroup() || baseSelected ? null : selected;
    if (!s) return [];
    const ref = selectionIds()[0];
    if (!ref) return [];
    const off = editsLocked() || lockedOf(s);
    const set = (field: string) => (value: string | number | boolean): void => { void entityEdit('placement.set', { ref, field, value }); };
    const out: InspectorEditor[] = [];
    const zone = s.userData['forgeZone'] as { w: number; d: number; name: string } | undefined;
    const team = s.userData['forgeSpawn'] as 'A' | 'B' | undefined;
    const npc = npcOf(s), bomb = bombKindOf(s);
    if (zone) {
      out.push({ label: 'Name', kind: 'text', value: zone.name, covers: ['zone.name'], disabled: off, title: 'Safety, Safety2...: the escort script finds its zones by name', set: set('name') });
      // A scrub's live size: the marker's outline and pick box stretched (no edit; put back at 1 before the release's).
      const sized = (axis: 'x' | 'z', own: number) => (v: number | null): void => {
        for (const c of s.children) c.scale[axis] = v === null || !(own > 0) ? 1 : Math.max(v, 0.01) / own;
      };
      out.push({ label: 'Width', kind: 'number', value: zone.w, covers: ['zone.w'], disabled: off, title: 'Along x, world units', set: set('width'), preview: sized('x', zone.w) });
      out.push({ label: 'Depth', kind: 'number', value: zone.d, covers: ['zone.d'], disabled: off, title: 'Along z, world units', set: set('depth'), preview: sized('z', zone.d) });
    }
    if (s.userData['forgeHostage']) {
      const own = hostageOf(s);
      // The characters a hostage can wear here: the base's own hostages' (a blank floor's: its library's), each once.
      const chars = [...new Set(((baseMap ?? charMap)?.escortees ?? []).map((e) => e.character))];
      out.push({ label: 'Name', kind: 'text', value: own.name ?? '', covers: ['hostage.name'], disabled: off, title: 'Its scene name (the disc\'s Hostage1, Hostage2...)', set: set('name') });
      // Its map, as a door's or a turret's (a browser adaptation, FG.R2): the base (or a blank floor's library), or any
      // multiplayer map on this disc, whose hostage character is lent to the match with its body. A map changed takes
      // that map's first character; one with none is refused.
      const home = (baseMap ?? charMap)?.archive ?? '';
      const pending = copyPending.get(ref);
      const from = pending ?? own.source ?? home;
      out.push({ label: 'Map', kind: 'select', value: from, covers: ['hostage.source'], disabled: off,
        options: mapChoices('hostage', from),
        title: 'The disc map whose hostage character it wears', set: (v) => {
          const stem = String(v);
          const character = (value: string): Promise<void> => entityEdit('placement.set', { ref, field: 'character', value });
          if (stem === home) switchCopyMap(ref, 'hostage', stem, () => Promise.resolve(chars[0] ?? null), character);
          else switchCopyMap(ref, 'hostage', stem, () => hostageLibOf(stem).then((lib) => hostageCharactersOf(lib)[0] ?? null), (c) => character(`${stem}:${c}`));
        } });
      // Every character type that map has, by name; one never set shows the one it plays as (the map's first). A character
      // the layout names that the map lacks stays listed, so the choice is never lost unseen.
      const lent = !!own.source && own.source !== home;
      const theirs = pending ? null : lent ? copyList('hostage', own.source!)?.map(([c]) => c) ?? null : chars;
      const shown = pending ? '' : own.character ?? theirs?.[0] ?? '';
      const listed = theirs ? (own.character && !theirs.includes(own.character) ? [...theirs, own.character] : theirs) : (shown ? [shown] : []);
      out.push({ label: 'Character', kind: 'select', value: shown, covers: ['hostage.character'], disabled: off || listed.length === 0 || !theirs,
        options: pending ? [['', `(reading ${pending}...)`]] : !theirs ? [[shown, `${shown} (reading the map...)`]] : listed.length ? listed.map((c) => [c, c] as const) : [['', 'No hostage characters on this map']],
        title: 'Its body: one of the hostage characters that map has', set: (v) => set('character')(lent ? `${own.source}:${String(v)}` : String(v)) });
    }
    const doorOwn = s.userData['forgeDoor'] as { source: string; name: string } | undefined;
    if (doorOwn) out.push(...copyEditors('door', ref, doorOwn, off, (v) => entityEdit('placement.set', { ref, field: 'model', value: v })));
    // A placed ladder: its Map and its Ladder, as a door's; either a change of the piece's asset (`placement.set` model).
    const ladderAsset = s.userData['forgeLadder'] ? parseAssetId(String(s.userData['forgePiece'] ?? '')) : null;
    const accessOwn = accessOwnOf(s);
    if (accessOwn) out.push(...copyEditors(accessOwn.kind, ref, accessOwn, off, (v) => entityEdit('placement.set', { ref, field: 'model', value: v })));
    if (ladderAsset) out.push(...copyEditors('ladder', ref, { source: ladderAsset.archive, name: ladderAsset.model }, off, (v) => entityEdit('placement.set', { ref, field: 'model', value: v })));
    const flare = s.userData['forgeFlare'] as { source: string; name: string } | undefined;
    if (flare) out.push(...copyEditors('flare', ref, flare, off, (v) => entityEdit('placement.set', { ref, field: 'model', value: v })));
    const turret = s.userData['forgeTurret'] as { source: string; name: string } | undefined;
    if (turret) out.push(...copyEditors('turret', ref, turret, off, (v) => entityEdit('placement.set', { ref, field: 'model', value: v })));
    const point = s.userData['forgePoint'] as { name: string; kind: number } | undefined;
    if (point) {
      out.push({ label: 'Name', kind: 'text', value: point.name, covers: ['point.name'], disabled: off, title: 'Its first letter (C..Z) is its compass badge', set: set('name') });
      out.push({ label: 'Kind', kind: 'number', value: point.kind, covers: ['point.kind'], disabled: off, title: '0-31; 1 a nav point the compass marks', set: set('kind') });
    }
    const view = s.userData['forgeView'] as { name: string; yaw: number; pitch: number } | undefined;
    if (view) {
      out.push({ label: 'Name', kind: 'text', value: view.name, covers: ['view.name'], disabled: off, set: set('name') });
      out.push({ label: 'Yaw °', kind: 'number', value: Math.round(view.yaw * 10) / 10, covers: ['view.yaw'], disabled: off, title: 'The camera\'s turn (degrees, the port\'s yaw)', set: set('yaw') });
      out.push({ label: 'Pitch °', kind: 'number', value: Math.round(view.pitch * 10) / 10, covers: ['view.pitch'], disabled: off, title: 'Down negative (degrees)', set: set('pitch') });
    }
    if (team) out.push({ label: 'Team', kind: 'select', value: team, options: [['A', 'SEAL (A)'], ['B', 'Terrorist (B)']], covers: ['spawn'], disabled: off, set: set('team') });
    if (npc) {
      out.push({ label: 'Side', kind: 'select', value: npc.side, options: [['seal', 'SEAL'], ['terrorist', 'Terrorist']], covers: ['npc.side'], disabled: off, set: set('side') });
      const types = charMap?.types?.[npc.side] ?? [];
      out.push({ label: 'Character', kind: 'select', value: String(npc.type), covers: ['npc.type'], disabled: off,
        options: types.map((b, i) => [String(i), b ? charLabel(npc.side, i) : `Type ${i + 1} (not on this base)`] as const), set: (v) => set('type')(Number(v)) });
    }
    if (bomb && bomb !== 'start') {
      const file = s.userData['forgeBombFile'] as { range?: number; elevation?: number } | undefined;
      // A scrub's live reach: the gizmo redrawn at the scrubbed value (no edit; the file's again before the release's).
      const reach = (key: 'range' | 'elevation') => (v: number | null): void => { addSiteGuide(s, v === null ? undefined : { [key]: v }); };
      out.push({ label: 'Range', kind: 'number', value: file?.range ?? BOMB_SITE_REACH, covers: ['bombFile.range'], disabled: off, title: 'How near a planter must stand', set: set('range'), preview: reach('range') });
      out.push({ label: 'Elevation', kind: 'number', value: file?.elevation ?? BOMB_SITE_REACH, covers: ['bombFile.elevation'], disabled: off, title: 'How far above or below', set: set('elevation'), preview: reach('elevation') });
    }
    out.push({ label: 'Locked', kind: 'check', value: lockedOf(s), covers: ['lock'], disabled: editsLocked(), set: () => lockToggle(s) });
    return out;
  };
  const refreshInspector = (): void => { refreshInspectorFields(); showResets(); showInspectorData(inspectorDom, dataRows(inspectorData()), inspectorEditors()); };
  resetPosition.addEventListener('click', () => {
    const entity = inspectedEntity();
    if (entity) { entityEdit('piece.move', { refs: [entity.ref], delta: entity.at.map((v) => -v) }); return; }
    const s = isGroup() ? null : selected;
    if (!s) return;
    personEdit('piece.move', { refs: selectionIds() }, () => {
      s.position.set(0, 0, 0);
      refreshBox();
      refreshInspector();
      edit();
    }, true);
  });
  resetRotation.addEventListener('click', () => {
    const entity = inspectedEntity();
    if (entity) { if (entity.yaw !== null) entityEdit('piece.rotate', { refs: [entity.ref], yaw: -entity.yaw }); return; }
    const s = isGroup() ? null : selected;
    if (!s) return;
    personEdit('piece.rotate', { refs: selectionIds() }, () => {
      s.quaternion.identity();
      refreshBox();
      refreshInspector();
      edit();
    }, true);
  });
  // STUB, as the scale fields are: record v3 keeps no scale (`transformStub`).
  resetScale.addEventListener('click', () => say('Scale is not wired yet: a saved layout keeps no scale'));
  /**
   * The scrub's live preview (`./scrub`; a browser adaptation): one placement follows its position or yaw field while it
   * is dragged, unrecorded; the release's `change` makes it one edit (the field handlers below), as a gizmo drag is.
   * Escape puts the placement back exactly where it was (the field shows a rounded value). A group, a rules entity and
   * the stub fields take the value at the release only.
   */
  let scrubOrigin: { r: Object3D; position: Vector3; quaternion: Quaternion } | null = null;
  for (const f of [fx, fy, fz, fyaw]) {
    f.addEventListener('fx-scrub', (e) => {
      const s = isGroup() || baseSelected ? null : selected;
      if (!s) return;
      const { value, cancelled } = (e as CustomEvent<ScrubDetail>).detail;
      if (scrubOrigin?.r !== s) scrubOrigin = { r: s, position: s.position.clone(), quaternion: s.quaternion.clone() };
      if (cancelled) {
        s.position.copy(scrubOrigin.position);
        s.quaternion.copy(scrubOrigin.quaternion);
        scrubOrigin = null;
      } else if (f === fx) s.position.x = value; else if (f === fy) s.position.y = value; else if (f === fz) s.position.z = value;
      else s.rotation.set(0, (value * Math.PI) / 180, 0);
      refreshBox();
      showResets();
    });
    f.addEventListener('change', () => { scrubOrigin = null; });
  }
  for (const f of [fx, fy, fz, fyaw]) {
    f.addEventListener('change', () => {
      const entity = !selected && !isGroup() && !baseSelected && entityPicked !== null ? rulesEntityRefs().find((e) => e.ref === entityPicked) : undefined;
      if (entity) {
        // FCW-32 step 4 (D4): a rules entity moved or turned by the planner's edit by its reference (`piece.move`, `.rotate`).
        const v = Number(f.value);
        if (!Number.isFinite(v)) return;
        if (f === fyaw) { if (entity.yaw !== null) entityEdit('piece.rotate', { refs: [entity.ref], yaw: (v * Math.PI) / 180 - entity.yaw }); return; }
        const delta: [number, number, number] = [0, 0, 0];
        const axis = f === fx ? 0 : f === fy ? 1 : 2;
        delta[axis] = v - entity.at[axis];
        entityEdit('piece.move', { refs: [entity.ref], delta });
        return;
      }
      if (isGroup()) {
        // FG-47: the group's centre typed: every member moved by the difference.
        const c = groupCentre();
        const v = Number(f.value);
        if (!c || f === fyaw || !Number.isFinite(v)) return;
        personEdit('piece.move', { refs: selectionIds() }, () => {
          const axis = f === fx ? 0 : f === fy ? 1 : 2;
          const d: [number, number, number] = [0, 0, 0];
          d[axis] = v - c[axis];
          applyPoses(movedBy(picks.items.map(poseOf), d));
          passOver('moved');
          placePivot();
          refreshBox();
          edit();
        });
        return;
      }
      const s = selected;
      const v = Number(f.value);
      if (!s || !Number.isFinite(v)) return;
      // FUI-6: the move's or the turn's entry; the field takes no edit under a lobby's hold (it is closed), as before.
      personEdit(f === fyaw ? 'piece.rotate' : 'piece.move', { refs: selectionIds() }, () => {
        if (f === fx) s.position.x = v; else if (f === fy) s.position.y = v; else if (f === fz) s.position.z = v;
        else s.rotation.set(0, (v * Math.PI) / 180, 0);
        refreshBox();
        edit();
      }, true);
    });
  }
  /** A placement's outliner words (FUI-3: the dock's row and the START menu's Outliner screen read the same). */
  const placedLabel = (r: Object3D): string => {
    const team = r.userData['forgeSpawn'] as string | undefined, npc = npcOf(r), bomb = bombKindOf(r);
    if (r.userData['forgeHostage']) return hostageOf(r).name ?? 'Hostage';
    if (r.userData['forgeZone']) return zoneNameOf(r);
    if (r.userData['forgePoint'] || r.userData['forgeView']) return pointNameOf(r);
    if (r.userData['forgeTurret']) return turretLabel(r);
    if (r.userData['forgeDoor']) return doorLabel(r);
    if (accessOwnOf(r)) return accessLabel(r);
    if (r.userData['forgeRespawn']) return `Respawn ${r.userData['forgeRespawn'] as string}`;
    if (r.userData['forgeFlare']) return `Flare · ${(r.userData['forgeFlare'] as { name: string }).name}`;
    return bomb ? bombLabel(bomb) : npc ? `NPC · ${npc.side === 'seal' ? 'SEAL' : 'Terrorist'} ${npc.type + 1}` : team ? `Spawn ${team}` : (parseAssetId(nameOf(r))?.model ?? nameOf(r));
  };
  /** Lock a placement, or unlock it (the outliner's Lock button; FUI-3: the menu's Square on its row). */
  const lockToggle = (r: Object3D): void => {
    const locked = lockedOf(r);
    personEdit(locked ? 'piece.unlock' : 'piece.lock', {}, () => {
      if (locked) { delete r.userData['forgeLock']; lockHeld = lockHeld.filter((h) => h !== r); }
      else { r.userData['forgeLock'] = true; picks.remove(r); }
      showSelection();
      edit();
    });
  };
  /** A map prop hidden in this layout shown again (the outliner's hidden row; FUI-3: the menu's Cross or Triangle on it). */
  const showHiddenProp = (k: string): void => {
    personEdit('piece.restore', { keys: [k] }, () => { hiddenKeys.delete(k); drawHidden(); edit(); say(`${k.split('@')[0]} shown again`); });
  };
  /** FCW-32 step 4 (FUI.R23 D4): the rules entities as the Outliner lists them -- the planner's reference, words, kind, lock, place. */
  const rulesEntityRefs = (): { ref: string; label: string; kind: RulesEntityKind; locked: boolean; at: [number, number, number]; yaw: number | null }[] => [
    ...(layoutEntities.zones ?? []).map((z) => ({ ref: `zone:${z.id}`, label: `Zone · ${z.id}`, kind: 'zone' as const, locked: z.locked === true, at: z.at,
      yaw: z.shape === 'box' ? z.yaw : null })),
    ...(layoutEntities.markers ?? []).map((m) => ({ ref: `marker:${m.id}`, label: `Marker · ${m.id}`, kind: 'marker' as const, locked: m.locked === true, at: m.at, yaw: m.yaw })),
    ...(layoutEntities.spawners ?? []).map((s) => ({ ref: `spawner:${s.id}`, label: `Spawner · ${s.id}`, kind: 'spawner' as const, locked: s.locked === true, at: s.at, yaw: s.yaw })),
  ];
  const entityAt = (ref: string): [number, number, number] | null => rulesEntityRefs().find((e) => e.ref === ref)?.at ?? null;
  /** FCW-32 step 4 (D4): one of the planner's edits on a rules entity by its reference, through the person's facade; a refusal said. */
  const entityEdit = (operation: string, args: Record<string, unknown>): Promise<void> =>
    personForge.execute(operation, args, personForge.status().revision).then((r) => { if (!r.ok) notifier.refused(r.message ?? r.code ?? 'Refused'); });
  /** FCW-32 step 4 (D4): a rules entity picked from its row (the placements let go), or none; the Inspector names it. */
  const pickEntity = (ref: string | null): void => {
    entityPicked = ref;
    if (ref) { picks.clear(); basePicks.clear(); }
    showSelection();
    drawRulesScene();
  };
  /**
   * The Outliner's tree: two roots -- Map Data (the base map's props and spawn slots) and User Data (the layout's props,
   * spawns, NPCs, objectives and rules entities) -- and their branches, each folded or open. The disc's spawn slots start
   * folded: 48 rows on most maps.
   */
  // A branch's key; the rest of the map data's branches (`./mapData`) are `map:<kind>`, folded until opened.
  type OutlinerBranch = string;
  const outlinerExpanded: Record<OutlinerBranch, boolean> = {
    mapData: true, userData: true, mapProps: true, spawnSlots: false,
    userProps: true, userSpawns: true, userRespawns: true, userNpcs: true, userEscortees: true, userTacZones: true, userTacPoints: true, userScenicViews: true, userTurrets: true, userDoors: true, userLadders: true, userFlares: true, userGates: true, userObjectives: true, userActions: true, rules: true,
  };
  let mapRangeAnchor: string | null = null;
  let userRangeAnchor: Object3D | null = null;
  const mapPropPlacements = (): { placement: Placement; model: string }[] => {
    if (!baseMap) return [];
    const seen = new Set<string>();
    const result: { placement: Placement; model: string }[] = [];
    for (const prop of baseMap.props) {
      if (prop.facade !== 0) continue;
      for (let index = 0; index < prop.matrices.length / 16; index++) {
        const placement = placementOf(baseMap, prop.modelName, prop.matrices.subarray(index * 16, index * 16 + 16));
        if (!placement || seen.has(placement.key)) continue;
        seen.add(placement.key);
        result.push({ placement, model: prop.modelName });
      }
    }
    return result;
  };
  const outlinerItemCount = (): number => {
    const placements = mapPropPlacements();
    const keys = new Set(placements.map(({ placement }) => placement.key));
    const orphanedHidden = [...hiddenKeys].filter((key) => !keys.has(key)).length;
    return roots.length + placements.length + orphanedHidden + rulesEntityRefs().length + (baseContentProps?.children.length ?? 0);
  };
  const resolveMapProp = (placement: Placement, model: string): BaseProp | null => {
    if (!baseView) return null;
    baseView.group.updateMatrixWorld(true);
    const matches: { object: Mesh; matrix: Matrix4 }[] = [];
    baseView.group.traverse((candidate) => {
      if (matches.length || !(candidate instanceof Mesh)) return;
      const source = candidate.userData['forgeBaseProp'] as { prop?: number; index?: number } | undefined;
      if (source?.prop !== placement.prop) return;
      const world = new Matrix4();
      if (candidate instanceof InstancedMesh) {
        if (placement.index >= candidate.count) return;
        candidate.getMatrixAt(placement.index, world);
        world.premultiply(candidate.matrixWorld);
      } else {
        if (source.index !== placement.index) return;
        world.copy(candidate.matrixWorld);
      }
      matches.push({ object: candidate, matrix: world });
    });
    const match = matches[0];
    if (!match) {
      return null;
    }
    const { object, matrix } = match;
    return { ...placement, model, object, instance: object instanceof InstancedMesh ? placement.index : null, matrix, box: basePropBox(object, matrix) };
  };
  const selectMapProp = (placement: Placement, model: string, mode: 'only' | 'toggle' | 'add' = 'only'): BaseProp | null => {
    const prop = resolveMapProp(placement, model);
    if (!prop) {
      say(`Cannot select map prop ${model}: its rendered placement is unavailable`, true);
      return null;
    }
    if (mode === 'only') { picks.clear(); basePicks.only(prop); }
    else if (mode === 'toggle') { picks.clear(); basePicks.toggle(prop); }
    else basePicks.add(prop);
    entityPicked = null;
    showSelection();
    return prop;
  };
  const drawOutliner = (): void => {
    const q = outlinerSearch.value.trim().toLowerCase();
    const want = outlinerFilter.value;
    const userRows = roots.flatMap((r, i) => {
      const team = r.userData['forgeSpawn'] as string | undefined;
      const npc = npcOf(r);
      const bomb = bombKindOf(r);
      const missing = r.userData['forgeMissing'] === true;
      // A plant site is a context action (MPBOMB), as the map's tents: the Context Actions branch; the start Bomb Start's.
      const kind = missing ? 'missing' : bomb === 'start' ? 'objectives' : bomb ? 'actions' : r.userData['forgeHostage'] ? 'hostages' : r.userData['forgeZone'] ? 'zones' : r.userData['forgePoint'] ? 'points' : r.userData['forgeView'] ? 'views' : r.userData['forgeTurret'] ? 'turrets' : r.userData['forgeDoor'] ? 'doors' : r.userData['forgeGate'] ? 'gates' : r.userData['forgeBarrier'] ? 'actions' : r.userData['forgeLadder'] ? 'ladders' : r.userData['forgeFlare'] !== undefined ? 'flares' : r.userData['forgeRespawn'] ? 'respawns' : team ? 'spawns' : npc ? 'npcs' : 'pieces';
      if (want === 'hidden' || want === 'map') return [];
      if (want === 'pieces' ? kind !== 'pieces' && kind !== 'missing'
        : want === 'objectives' ? kind !== 'objectives' && kind !== 'actions' : want !== 'all' && kind !== want) return [];
      const label = placedLabel(r);
      if (q && !label.toLowerCase().includes(q) && !nameOf(r).toLowerCase().includes(q)) return [];
      const li = el(doc, 'li');
      li.dataset['userProp'] = String(i);
      li.dataset['userKind'] = kind;                          // its branch under User Data
      // A row wears its placement's billboard (`markBadge`: an NPC's N too); a missing piece keeps its warning.
      // The row's badge is its placement's billboard (`syncUserBillboards`' own call): a hostage's H, a zone's Z, too.
      const hostage = !!r.userData['forgeHostage'], zone = !!r.userData['forgeZone'];
      const markKind = missing ? null : userMarkKind({
        piece: !!r.userData['forgePiece'], npc: !!npc, bomb, hostage, zone, point: !!r.userData['forgePoint'], view: !!r.userData['forgeView'], turret: !!r.userData['forgeTurret'], door: !!r.userData['forgeDoor'], ladder: !!r.userData['forgeLadder'], flare: r.userData['forgeFlare'] !== undefined, gate: !!r.userData['forgeGate'], barrier: !!r.userData['forgeBarrier'], ...(team === 'A' || team === 'B' ? { team } : {}),
        ...(r.userData['forgeRespawn'] === 'A' || r.userData['forgeRespawn'] === 'B' ? { respawn: r.userData['forgeRespawn'] as 'A' | 'B' } : {}),
      });
      li.innerHTML = markKind ? markBadge(markKind) : icon('place');
      li.classList.toggle('fx-team-a', team === 'A');
      li.classList.toggle('fx-team-b', team === 'B');
      li.classList.toggle('fx-bomb', bomb === 'start');
      li.classList.toggle('fx-side-seal', npc?.side === 'seal' || bomb === 'seal');
      li.classList.toggle('fx-side-terrorist', npc?.side === 'terrorist' || bomb === 'terrorist');
      li.classList.toggle('fx-missing', missing);
      const locked = lockedOf(r);
      li.append(el(doc, 'span', '', label), el(doc, 'span', 'fx-dim', locked ? 'locked' : missing ? 'missing' : team || npc || bomb ? '' : `#${i + 1}`));
      li.classList.toggle('is-on', picks.has(r));
      li.classList.toggle('is-locked', locked);
      const lock = el(doc, 'button', 'fx-chip fx-lock', locked ? 'Unlock' : 'Lock');
      lock.type = 'button';
      lock.title = locked ? 'Unlock this placement' : 'Lock this placement so it cannot be selected or moved';
      lock.addEventListener('click', (e) => {
        e.stopPropagation();
        lockToggle(r);
      });
      li.append(lock);
      // Shift selects a contiguous range; Ctrl / Meta toggles one placement.
      // FG-49: a locked placement is not selected from its row; the lock button is the way back.
      li.addEventListener('click', (e) => {
        if (lockedOf(r)) return;
        const toggle = e.ctrlKey || e.metaKey;
        if (e.shiftKey) {
          const visible = userRows.flatMap((row) => {
            const root = roots[Number(row.dataset['userProp'])];
            return root && !lockedOf(root) ? [root] : [];
          });
          const from = userRangeAnchor ? visible.indexOf(userRangeAnchor) : -1;
          const to = visible.indexOf(r);
          if (to < 0) return;
          const start = from < 0 ? to : Math.min(from, to);
          const end = from < 0 ? to : Math.max(from, to);
          picks.clear();
          basePicks.clear();
          picks.addAll(visible.slice(start, end + 1));
          entityPicked = null;
          showSelection();
        } else if (toggle) {
          userRangeAnchor = r;
          picks.toggle(r);
          showSelection();
        } else {
          userRangeAnchor = r;
          select(r);
        }
      });
      li.addEventListener('dblclick', () => focusOn(r));
      return [li];
    });
    // FCW-32 step 4 (FUI.R23 D4): the rules entities, a row each by its authored id -- picked from its row, locked and
    // deleted by it, each the planner's edit by its reference (`zone:<id>`) through the person's facade.
    const entityRows = want === 'all' || want === 'rules' ? rulesEntityRefs().flatMap(({ ref, label, kind, locked }) => {
      if (q && !label.toLowerCase().includes(q)) return [];
      const li = el(doc, 'li', 'fx-rules-entity');
      li.dataset['rulesEntity'] = ref;
      li.innerHTML = icon(kind === 'spawner' ? 'spawn' : 'place');
      li.append(el(doc, 'span', '', label), el(doc, 'span', 'fx-dim', locked ? 'locked' : 'rules'));
      li.classList.toggle('is-on', entityPicked === ref);
      li.classList.toggle('is-locked', locked);
      const lock = el(doc, 'button', 'fx-chip fx-lock', locked ? 'Unlock' : 'Lock');
      lock.type = 'button';
      lock.title = locked ? `Unlock ${label}` : `Lock ${label} so it cannot be moved or deleted`;
      lock.addEventListener('click', (e) => { e.stopPropagation(); entityEdit(locked ? 'piece.unlock' : 'piece.lock', { refs: [ref] }); });
      const del = el(doc, 'button', 'fx-chip', 'Delete');
      del.type = 'button';
      del.dataset['rulesEntityDelete'] = ref;
      del.title = `Delete ${label} (refused while a rule names it)`;
      del.addEventListener('click', (e) => { e.stopPropagation(); entityEdit('piece.delete', { refs: [ref] }); });
      li.append(lock, del);
      li.addEventListener('click', () => { pickEntity(locked ? null : ref); });
      li.addEventListener('dblclick', () => { const at = entityAt(ref); if (at) lookAtPoint(at); });
      return [li];
    }) : [];
    const mapRows: HTMLLIElement[] = [];
    const mapPlacements = mapPropPlacements();
    const seenMapProps = new Set(mapPlacements.map(({ placement }) => placement.key));
    if (baseMap && baseView && want !== 'pieces' && want !== 'spawns' && want !== 'npcs' && want !== 'objectives' && want !== 'missing' && want !== 'rules') {
      const modelOrdinals = new Map<string, number>();
      for (const { placement, model } of mapPlacements) {
        const ordinal = (modelOrdinals.get(model) ?? 0) + 1;
        modelOrdinals.set(model, ordinal);
        const hidden = hiddenKeys.has(placement.key);
        if (want === 'hidden' && !hidden) continue;
        if (q && !`${model} ${placement.key}`.toLowerCase().includes(q)) continue;
        const li = el(doc, 'li', hidden ? 'fx-hidden-prop' : '');
        li.dataset['mapProp'] = placement.key;
        li.innerHTML = hidden ? icon('trash') : markBadge('mapProps');   // a map prop's billboard (M); hidden, the bin
        li.append(el(doc, 'span', '', model), el(doc, 'span', 'fx-dim', hidden ? 'hidden \u00b7 show' : `#${ordinal}`));
        li.title = hidden ? `${placement.key}: hidden in this layout; click to show it again` : `${model} · ${placement.key}`;
        li.classList.toggle('is-on', basePicks.items.some((picked) => picked.key === placement.key));
        li.addEventListener('click', (e) => {
          if (hidden) { showHiddenProp(placement.key); return; }
          const toggle = e.ctrlKey || e.metaKey;
          if (e.shiftKey) {
            const visible = mapRows.flatMap((row) => {
              const key = row.dataset['mapProp'];
              if (!key || hiddenKeys.has(key)) return [];
              const item = mapPlacements.find(({ placement: candidate }) => candidate.key === key);
              return item ? [item] : [];
            });
            const from = mapRangeAnchor ? visible.findIndex(({ placement: candidate }) => candidate.key === mapRangeAnchor) : -1;
            const to = visible.findIndex(({ placement: candidate }) => candidate.key === placement.key);
            if (to < 0) return;
            const start = from < 0 ? to : Math.min(from, to);
            const end = from < 0 ? to : Math.max(from, to);
            const selectedProps = visible.slice(start, end + 1).flatMap(({ placement: candidate, model: candidateModel }) => {
              const item = resolveMapProp(candidate, candidateModel);
              if (!item) say(`Cannot select map prop ${candidateModel}: its rendered placement is unavailable`, true);
              return item ? [item] : [];
            });
            picks.clear();
            basePicks.clear();
            basePicks.addAll(selectedProps);
            entityPicked = null;
            showSelection();
          } else {
            mapRangeAnchor = placement.key;
            const prop = selectMapProp(placement, model, toggle ? 'toggle' : 'only');
            if (prop && e.detail > 1) focusOnBounds(prop.box);
          }
        });
        li.addEventListener('dblclick', (e) => {
          e.preventDefault();
          const prop = selectMapProp(placement, model);
          if (prop) focusOnBounds(prop.box);
        });
        mapRows.push(li);
      }
    }
    const authoredMapRows = (baseContentProps?.children ?? []).flatMap((object) => {
      const owner = object.userData['forgeBaseProp'];
      const label = typeof owner === 'string' ? owner.split('/').pop() ?? owner : 'Map prop';
      if ((want !== 'all' && want !== 'map') || (q && !label.toLowerCase().includes(q))) return [];
      const li = el(doc, 'li', 'fx-content-map-prop');
      li.innerHTML = icon('place');
      li.append(el(doc, 'span', '', label), el(doc, 'span', 'fx-dim', 'map'));
      li.title = 'Authored map prop; its placement belongs to the map';
      li.addEventListener('click', () => focusOn(object));
      li.addEventListener('dblclick', () => focusOn(object));
      return [li];
    });
    mapRows.push(...authoredMapRows);
    if (want === 'all' || want === 'hidden') {
      for (const key of [...hiddenKeys].sort()) {
        if (seenMapProps.has(key) || (q && !key.toLowerCase().includes(q))) continue;
        const li = el(doc, 'li', 'fx-hidden-prop');
        li.innerHTML = icon('trash');
        li.append(el(doc, 'span', '', key.split('@')[0]!), el(doc, 'span', 'fx-dim', 'hidden \u00b7 show'));
        li.title = `${key}: a map prop hidden in this layout; click to show it again`;
        li.addEventListener('click', () => showHiddenProp(key));
        mapRows.push(li);
      }
    }
    /**
     * A map data row's presses (read only): a click selects it (`selectMapData`); a second click in a row -- a
     * double-click -- frames it (the row is redrawn by the first, so the count is read, as the map props' rows read it).
     */
    const mapDataRow = (li: HTMLLIElement, key: string): void => {
      li.classList.toggle('is-on', mapDataSelected?.key === key);
      li.addEventListener('click', (e) => {
        selectMapData(key);
        const item = mapDataIndex.get(key);
        if (item && e.detail > 1) frameMapData(item);
      });
      li.addEventListener('dblclick', () => { const item = mapDataIndex.get(key); if (item) frameMapData(item); });
    };
    // The map's own data (a browser adaptation, FG.R2): the disc's spawn slots, read only -- a row each, selected and
    // framed as any map data (`mapDataRow`), its key its billboard's (`slot:A1`).
    const slotRows = baseMap && (want === 'all' || want === 'spawns') ? spawnSlotRows(baseMap.slots).flatMap((s) => {
      if (q && !`${s.label} ${s.key}`.toLowerCase().includes(q)) return [];
      const li = el(doc, 'li', 'fx-spawn-slot');
      li.dataset['spawnSlot'] = s.key;
      li.innerHTML = markBadge(s.key.startsWith('A') ? 'slotA' : 'slotB');   // the slot's billboard, its side's colour
      li.append(el(doc, 'span', '', s.label));                 // its place and facing in its tooltip only
      li.title = s.title.replace('click to look at it', 'click to select, double-click to frame');
      mapDataRow(li, `slot:${s.key}`);
      return [li];
    }) : [];
    /**
     * A branch of the tree: its rows (or its own branches, `count` then the rows under them) behind a toggle, folded or
     * not by `outlinerExpanded`; `empty` the line when it holds nothing.
     */
    const branch = (key: OutlinerBranch, label: string, rows: HTMLLIElement[], empty: string, count = rows.length): HTMLLIElement => {
      const item = el(doc, 'li', 'fx-tree-branch');
      item.dataset['treeBranch'] = key;
      const toggle = el(doc, 'button', 'fx-tree-toggle');
      toggle.type = 'button';
      const open = outlinerExpanded[key] ?? false;
      toggle.setAttribute('aria-expanded', String(open));
      toggle.append(el(doc, 'span', 'fx-tree-caret', open ? '\u25be' : '\u25b8'),
        el(doc, 'span', '', `${label} (${count})`));
      const children = el(doc, 'ul', 'fx-outliner-children');
      children.hidden = !open;
      children.append(...(rows.length ? rows : [el(doc, 'li', 'fx-empty', empty)]));
      toggle.addEventListener('click', () => { outlinerExpanded[key] = !open; drawOutliner(); });
      item.append(toggle, children);
      return item;
    };
    /** A root of the tree (Map Data, User Data): its branches, its count the rows under them. */
    const rootBranch = (key: OutlinerBranch, label: string, kids: { item: HTMLLIElement; count: number }[], empty: string): HTMLLIElement =>
      branch(key, label, kids.map((k) => k.item), empty, kids.reduce((n, k) => n + k.count, 0));
    const sub = (key: OutlinerBranch, label: string, rows: HTMLLIElement[], empty: string): { item: HTMLLIElement; count: number } =>
      ({ item: branch(key, label, rows, empty), count: rows.length });
    const byKind = (...kinds: string[]): HTMLLIElement[] => userRows.filter((r) => kinds.includes(r.dataset['userKind'] ?? ''));
    const nothing = q ? 'No matches' : undefined;

    // Map Data: the base map's own -- its props and its spawn slots.
    const mapKids: { item: HTMLLIElement; count: number }[] = [];
    if (want === 'all' || want === 'map' || want === 'hidden') {
      mapKids.push(sub('mapProps', 'Props', mapRows, want === 'hidden' ? 'No hidden map props'
        : nothing ?? (baseMap || baseContentProps ? 'No map props' : 'Load a map to see its props')));
    }
    // The spawn slots only on a map that has them (a blank floor has none).
    if ((want === 'all' || want === 'spawns') && baseMap?.slots.length) {
      mapKids.push(sub('spawnSlots', 'Spawns', slotRows, nothing ?? 'No spawn slots'));
    }
    // The rest of the map's own data (`./mapData`), a branch a kind the map has, read only: a click selects a row, a
    // double-click frames it (a zone from far enough back to see it whole; a spectator view through its own camera).
    if (want === 'all' && baseMap) {
      for (const g of mapDataGroups(mapDataSource(baseMap), floorUnder)) {
        const rows = g.rows.flatMap((row) => {
          if (q && !row.label.toLowerCase().includes(q)) return [];
          const li = el(doc, 'li', 'fx-map-data');
          li.dataset['mapData'] = row.key;
          li.innerHTML = markBadge(row.kind ?? g.key);              // the kind's billboard (D a door, V a view, Rs / Rt...)
          li.append(el(doc, 'span', '', row.label));
          li.title = row.title.replace(/click to (look at|look through) it/, 'click to select, double-click to frame');
          mapDataRow(li, row.key);
          return [li];
        });
        if (rows.length || !q) mapKids.push(sub(`map:${g.key}`, g.label, rows, 'None'));
      }
    }
    // User Data: what the layout places -- its props, its spawns, its NPCs and objectives where it has some, its rules.
    const userKids: { item: HTMLLIElement; count: number }[] = [];
    const userView = want === 'all' || want === 'pieces' || want === 'spawns' || want === 'npcs' || want === 'objectives' || want === 'missing';
    if (userView && want !== 'spawns' && want !== 'npcs' && want !== 'objectives') {
      userKids.push(sub('userProps', 'Props', byKind('pieces', 'missing'), nothing ?? 'Nothing placed yet: choose a prop, then click the world'));
    }
    if (want === 'all' || want === 'spawns') userKids.push(sub('userSpawns', 'Spawns', byKind('spawns'), nothing ?? 'No spawns: the Spawn SEAL and Spawn Terrorist tools place them'));
    const respawnRows = byKind('respawns');
    if (want === 'all' && respawnRows.length) userKids.push(sub('userRespawns', 'Respawn Points', respawnRows, nothing ?? 'No respawn points'));
    const npcRows = byKind('npcs'), objectiveRows = byKind('objectives'), actionRows = byKind('actions'), hostageRows = byKind('hostages'), zoneRows = byKind('zones'), pointRows = byKind('points'), viewRows = byKind('views'), turretRows = byKind('turrets'), doorRows = byKind('doors'), ladderRows = byKind('ladders'), gateRows = byKind('gates');
    if (want === 'npcs' || (want === 'all' && npcRows.length)) userKids.push(sub('userNpcs', 'NPCs', npcRows, nothing ?? 'No NPCs'));
    if (want === 'all' && hostageRows.length) userKids.push(sub('userEscortees', 'Hostages', hostageRows, nothing ?? 'No hostages'));
    if (want === 'all' && zoneRows.length) userKids.push(sub('userTacZones', 'Tactical Zones', zoneRows, nothing ?? 'No extraction zones'));
    if (want === 'all' && doorRows.length) userKids.push(sub('userDoors', 'Doors', doorRows, nothing ?? 'No doors'));
    if (want === 'all' && ladderRows.length) userKids.push(sub('userLadders', 'Ladders', ladderRows, nothing ?? 'No ladders'));
    const flareRows = byKind('flares');
    if (want === 'all' && flareRows.length) userKids.push(sub('userFlares', 'Flares', flareRows, nothing ?? 'No flares'));
    if (want === 'all' && gateRows.length) userKids.push(sub('userGates', 'Gates', gateRows, nothing ?? 'No gates'));
    if (want === 'all' && turretRows.length) userKids.push(sub('userTurrets', 'Turrets', turretRows, nothing ?? 'No turrets'));
    if (want === 'all' && pointRows.length) userKids.push(sub('userTacPoints', 'Tactical Points', pointRows, nothing ?? 'No tactical points'));
    if (want === 'all' && viewRows.length) userKids.push(sub('userScenicViews', 'Spectator Views', viewRows, nothing ?? 'No spectator views'));
    if (want === 'objectives' || (want === 'all' && objectiveRows.length)) userKids.push(sub('userObjectives', 'Bomb Start', objectiveRows, nothing ?? 'No bomb start: the Bomb tool places it'));
    if (want === 'objectives' || (want === 'all' && actionRows.length)) userKids.push(sub('userActions', 'Context Actions', actionRows, nothing ?? 'No bomb sites: the Site SEAL and Site Terrorist tools place them'));
    if (want === 'all' || want === 'rules') userKids.push(sub('rules', 'Rules', entityRows, nothing ?? 'No rules entities'));

    const treeRoots: HTMLLIElement[] = [];
    if (mapKids.length) treeRoots.push(rootBranch('mapData', 'Map Data', mapKids, 'No map data'));
    if (userKids.length) treeRoots.push(rootBranch('userData', 'User Data', userKids, 'Nothing placed yet'));
    outliner.replaceChildren(...treeRoots);
    // A branch holding a selected row, folded or not, is drawn as holding the selection: its word in the selection's
    // colour, so a folded tree still shows where the selection is.
    for (const b of outliner.querySelectorAll<HTMLLIElement>('li.fx-tree-branch')) {
      b.classList.toggle('has-selected', b.querySelector('li.is-on:not(.fx-tree-branch)') !== null);
    }
  };
  const refreshCounts = (): void => {
    const placed = roots.filter((r) => r.userData['forgePiece']);
    const n = placed.length;
    const npcs = roots.filter((r) => r.userData['forgeNpc']).length;
    const bombs = roots.filter((r) => bombKindOf(r)).length;
    const spawns = roots.length - n - npcs - bombs;
    sCounts.textContent = `${n} piece${n === 1 ? '' : 's'} · ${spawns} spawn${spawns === 1 ? '' : 's'} · ${npcs} NPC${npcs === 1 ? '' : 's'}${bombs ? ` · ${bombs} objective${bombs === 1 ? '' : 's'}` : ''}`;
    input.dataset['pieces'] = placed.map((r) => `${r.position.x.toFixed(2)},${r.position.y.toFixed(2)},${r.position.z.toFixed(2)}`).join(';');
  };
  // FUI-3 (PAD-5, FUI.R6; OT.R68): the hint line is retired for the legend strip (`./shell/legend`): one function of what
  // the pad (or, without one, the keyboard and mouse) is doing here, drawn as the system's prompts at the status bar.
  const padConnected = (): boolean => [...(globalThis.navigator?.getGamepads?.() ?? [])].some((g) => g?.connected === true);
  /** What a marker tool places, said before the prompts (the hint's words before FUI-3). */
  const TOOL_NOTES: Partial<Record<Mode, string>> = {
    spawnA: 'A team A spawn: it faces the way you look',
    spawnB: 'A team B spawn: it faces the way you look',
    hostage: 'A hostage, beside the map\'s own: Escort and Extraction play them',
    zone: 'An extraction zone (Safety, Safety2...), beside the map\'s own: Extraction plays them',
    door: "A door: a copy of a disc map's own (its swing, its reach), its hinge at the click; the rotate gizmo turns it",
    turret: "A turret: a copy of a disc map's own (its definition, weapon and limits), facing the way you look",
    ladder: "A ladder: a disc map's own ladder prop, its foot at the click, facing the way you look; climbable in Play",
    flare: "A flare: one of a disc map's glows (its facade node alone), turned to the camera; the Inspector's Map and Flare change it",
    gate: "A gate: a copy of a disc map's own, its lever prompt at the gate; the lever slides it, C4 or an RPG wrecks it",
    barrier: "A C4 barrier (a context action): a copy of a disc map's own access barrier, wrecked by C4 or an RPG",
    point: 'A tactical point (Charlie, Delta...): kind 1 a nav point the compass marks by its first letter',
    view: 'A spectator view: a click takes the camera\'s own place and look (the spectator steps through them)',
    bomb: 'The bomb\'s start: one start, and placing again replaces it',
    siteSeal: 'The site the SEALs plant at: one a team',
    siteTerrorist: 'The site the Terrorists plant at: one a team',
    respawnA: "A SEAL respawn point: where the SEALs respawn, beside the map's own; facing the way you look",
    respawnB: "A Terrorist respawn point: where the Terrorists respawn, beside the map's own; facing the way you look",
  };
  /** The legend's context; FUI-3: set in full once the menu and the match exist (below), the editor's tool until then. */
  let legendNow = (): LegendContext => ({ kind: 'build', tool: mode, selection: 0 });
  let legendStamp = '';
  /** The legend redrawn when what it says changed (each frame and each tool change ask; a stamp keeps the DOM still). */
  const drawLegendNow = (): void => {
    const pad = padConnected();
    const ctx = legendNow();
    const note = ctx.kind !== 'build' ? undefined : entityTool ? `Click the world, or Cross at the centre, to place the ${entityTool}; Esc cancels`
      : mode === 'place' && !chosen ? 'Choose a prop in the assets first'
      : mode === 'npc' && !npcChoice ? 'Choose a character under Characters first' : TOOL_NOTES[mode];
    const prompts = legendFor(ctx, pad ? 'pad' : 'keys');
    const stamp = JSON.stringify([pad, note, prompts.map((pr) => [pr.glyph, pr.key, pr.label])]);
    if (stamp === legendStamp) return;
    legendStamp = stamp;
    drawLegend(doc, legend, prompts, { pad, note, onPress: (a) => legendPress(a) });
    legend.hidden = prompts.length === 0;
  };
  /** A legend prompt's tap: the press it stands for (`padAction`, below). */
  let legendPress = (_a: PadAction): void => undefined;
  const refreshHint = (): void => {
    drawLegendNow();
    statusChips.update();                                     // FUI-4: Build / Walk / Play
    sMode.textContent = playing ? 'PLAY' : entityTool ? `PLACE ${entityTool.toUpperCase()}`
      : ({ place: 'PLACE', select: 'SELECT', spawnA: 'SPAWN A', spawnB: 'SPAWN B', respawnA: 'RESPAWN A', respawnB: 'RESPAWN B', npc: 'NPC', hostage: 'HOSTAGE', zone: 'ZONE', turret: 'TURRET', door: 'DOOR', gate: 'GATE', barrier: 'C4 BARRIER', ladder: 'LADDER', flare: 'FLARE', point: 'POINT', view: 'VIEW', bomb: 'BOMB', siteSeal: 'SITE SEAL', siteTerrorist: 'SITE TERRORIST' } as const)[mode];
  };
  /**
   * The selection drawn (FG-47): the single selection's `selected` / `baseSelected` derived, the gizmo on the one
   * placement -- or on the group's pivot at its centre -- the boxes, the inspector, the outliner, the buttons.
   */
  const showSelection = (): void => {
    // FCW-32 step 4 (D4): a placement picked lets a picked rules entity go.
    if (entityPicked !== null && picks.size + basePicks.size > 0) { entityPicked = null; drawRulesScene(); }
    // Any other selection lets a selected map data item go.
    if (mapDataSelected && (picks.size + basePicks.size > 0 || entityPicked !== null)) mapDataSelected = null;
    if (picks.size + basePicks.size > 0 || entityPicked !== null) lockHeld = [];   // another selection lets the just-locked go
    selected = picks.size === 1 && basePicks.size === 0 ? picks.items[0]! : null;
    baseSelected = basePicks.size === 1 && picks.size === 0 ? basePicks.items[0]! : null;
    // A prop being re-placed follows the cursor: no gizmo on it meanwhile.
    const on = replacing ? null : selected ?? (baseSelected ? mapPropProxy : isGroup() && picks.size > 0 ? pivot : null);
    if (baseSelected) {
      mapPropProxy.matrix.copy(baseSelected.matrix);
      mapPropProxy.matrix.decompose(mapPropProxy.position, mapPropProxy.quaternion, mapPropProxy.scale);
      mapPropProxy.updateMatrixWorld(true);
    }
    if (on) {
      if (on === pivot) placePivot();
      if (gizmo.object !== on) gizmo.attach(on);
      // FG.R10: a piece turns about the vertical only. FC-1: the tilt rings off while the stubs are hidden
      // (`./transformStubs`), as before the Overhaul; on, every ring is drawn and a grab of any but yaw is a stub
      // (`tiltRingStub`), so a reload cannot drop a tilt the record does not keep.
      gizmo.showX = !FORGE_TRANSFORM_STUBS_HIDDEN_ADAPTATION || gizmo.mode !== 'rotate';
      gizmo.showZ = !FORGE_TRANSFORM_STUBS_HIDDEN_ADAPTATION || gizmo.mode !== 'rotate';
    } else gizmo.detach();
    dupBtn.disabled = picks.size === 0;
    delBtn.disabled = picks.size + basePicks.size === 0 && entityPicked === null;   // FCW-32 step 4: an entity's row too
    const unlocking = picks.size === 0 && lockHeld.length > 0;
    lockBtn.disabled = (picks.size === 0 && !unlocking) || editsLocked();
    lockBtn.textContent = unlocking ? 'Unlock' : 'Lock';
    lockBtn.classList.toggle('is-on', unlocking);
    lockBtn.title = unlocking
      ? 'Unlock: it can be selected and moved again'
      : 'Lock the selection: it cannot be selected or moved until it is unlocked here or in the outliner';
    refreshBox();
    refreshInspector();
    drawOutliner();
    highlightSelectionMark();                                  // a selected map data item's mark, or a map prop's
  };
  /** That one alone (a plain click), or nothing selected (Circle's tap, Esc): the group cleared. */
  const lockedOf = (r: Object3D): boolean => r.userData['forgeLock'] === true;
  const select = (o: Object3D | null): void => {
    if (o && lockedOf(o)) return;
    if (o === null) lockHeld = [];                            // a deselect lets the just-locked go
    if (o === null && mapDataSelected) { mapDataSelected = null; mapBillboards.highlight(null); }   // and a map data item
    if (replacing && o !== replacing.r) { endReplace(true); setMode('select'); }   // another selection: the re-placed prop back
    // FCW-32 step 4 fold F3: nothing selected drops a picked rules entity too (Circle, Escape, a click on empty ground).
    if (o === null && entityPicked !== null) { entityPicked = null; drawRulesScene(); }
    picks.only(o);
    basePicks.clear();
    showSelection();
  };
  /**
   * One of the base map's own data items selected by its key (its Outliner row, its billboard): every other selection
   * let go, its billboard drawn larger, the Inspector naming it -- read only, nothing to move.
   */
  const selectMapData = (key: string): void => {
    const item = mapDataIndex.get(key);
    if (!item) return;
    if (replacing) { endReplace(true); setMode('select'); }
    lockHeld = [];
    picks.clear();
    basePicks.clear();
    if (entityPicked !== null) { entityPicked = null; drawRulesScene(); }
    mapDataSelected = item;
    mapBillboards.highlight(item.key);
    showSelection();
  };
  /** The camera on a map data item: a spectator view's own pose, else a look at its place from far enough to see it. */
  const frameMapData = (item: BillboardSpec): void => {
    if (item.view) { fly.setPose(item.view); return; }
    const [x, y, z] = item.at;
    const back = item.reach ?? 0;
    fly.lookFrom([x + 60 + back * 0.6, y + 45 + back * 0.5, z + 60 + back * 0.6], [x, y + 5, z]);
  };
  const focusOn = (r: Object3D): void => {
    focusOnBounds(new Box3().setFromObject(r));
  };
  const focusOnBounds = (b: Box3): void => {
    if (b.isEmpty()) return;
    const c = b.getCenter(new Vector3());
    const reach = Math.max(80, b.getSize(new Vector3()).length() * 1.4);
    const dir = fly.viewportCamera().getWorldDirection(new Vector3());
    fly.lookFrom([c.x - dir.x * reach, c.y - dir.y * reach + reach * 0.3, c.z - dir.z * reach], [c.x, c.y, c.z]);
  };
  /**
   * The selection shown in the Outliner: every branch above a selected row unfolded, the tree redrawn, and the first
   * selected row scrolled into sight. A row the search or the type filter leaves out is not drawn, so not revealed.
   */
  const revealSelectionInOutliner = (): void => {
    let opened = false;
    for (const row of outliner.querySelectorAll<HTMLLIElement>('li.is-on:not(.fx-tree-branch)')) {
      for (let b = row.parentElement?.closest<HTMLLIElement>('li.fx-tree-branch'); b; b = b.parentElement?.closest<HTMLLIElement>('li.fx-tree-branch')) {
        const key = b.dataset['treeBranch'];
        if (key && outlinerExpanded[key] !== true) { outlinerExpanded[key] = true; opened = true; }
      }
    }
    if (opened) drawOutliner();
    outliner.querySelector<HTMLElement>('li.is-on:not(.fx-tree-branch)')?.scrollIntoView?.({ block: 'nearest' });
  };
  const frameSelection = (): void => {
    revealSelectionInOutliner();                               // F shows the selection in the tree too
    // F (and the menu's row) frames a selected map data item as its double-click does.
    if (mapDataSelected && picks.size + basePicks.size === 0) { frameMapData(mapDataSelected); return; }
    const bounds = new Box3();
    for (const prop of basePicks.items) bounds.union(prop.box);
    for (const root of picks.items) bounds.union(new Box3().setFromObject(root));
    focusOnBounds(bounds);
  };
  const setMode = (m: Mode): void => {
    // A tool the layout's game type does not play (`refreshModeTools`): its key or the pad's row refused, and said.
    if (modeBtns[m].disabled && modeBtns[m].dataset['forgeModeOff'] === 'true') {
      const types = MODE_TOOL_TYPES[m];
      notifier.refused(types ? modeToolWhy(types) : 'This tool is off for this game type');
      return;
    }
    if (m !== mode) toolTurn = 0;                              // a tool's wheel turn is that tool's
    if (entityTool !== null) { entityTool = null; rulesChanged(); }   // FCW-32 step 4: another tool ends the entity's place mode
    if (replacing && m !== 'place') endReplace(true);         // another tool puts a re-placed prop back
    mode = m;
    for (const [k, b] of Object.entries(modeBtns)) b.classList.toggle('is-on', k === m);
    input.classList.toggle('is-placing', m !== 'select');
    refreshHint();
    syncGhost();
  };
  /** The re-place ended: the prop put back where it was (`restore`), or left where it is; the surfaces with it again. */
  const endReplace = (restore: boolean): void => {
    const was = replacing;
    if (!was) return;
    replacing = null;
    if (restore && roots.includes(was.r)) { was.r.position.copy(was.position); was.r.quaternion.copy(was.quaternion); }
    refreshPlacementGround();
    refreshBox();
  };
  /** The one placed user prop the Place tool can pick up: the single selection, a piece, unlocked, edits open. */
  const replaceable = (): Object3D | null => {
    const s = selected;
    return s && !isGroup() && !baseSelected && s.userData['forgePiece'] && !lockedOf(s) && !editsLocked() && !playing ? s : null;
  };
  /**
   * The Place tool, from its button or its key: with one placed user prop selected it picks that prop up (`replacing`) --
   * it follows the cursor on the surface below, a click puts it down, Escape puts it back; with none, the Place tool as
   * it always was (the chosen prop's ghost).
   */
  const enterPlace = (): void => {
    const r = replacing ? null : replaceable();
    if (!r) { setMode('place'); return; }
    replacing = { r, position: r.position.clone(), quaternion: r.quaternion.clone(), before: selectionIds() };
    refreshPlacementGround();                                  // its own hull out of the surfaces it rests on
    setMode('place');
    showSelection();                                           // no gizmo while it follows the cursor
    say(`placing ${nameOf(r)}: click to put it down · the wheel turns it · Esc puts it back`);
  };
  /**
   * The re-placed prop put down at `at`: one Move, it selected, then the Place tool on its asset -- more copies placed as
   * a click in the asset browser would place them. A pack's piece (its reference is not the asset key `chosen` holds) or a
   * missing one's stand-in has no such Place tool: the Select tool then.
   */
  const commitReplace = (at: Vector3): void => {
    const was = replacing;
    if (!was) return;
    seatOn(was.r, at);
    endReplace(false);
    const asset = was.r.userData['forgePiece'] as string;
    const again = !asset.startsWith(PACK_ASSET_PREFIX) && !was.r.userData['forgeMissing'];
    personEdit('piece.move', { refs: selectionIds() }, () => {
      setMode('select');
      select(was.r);
      refreshBox();
      edit(was.before);
      if (again) choosePaletteRow(asset);                      // place more of it, as from the asset browser
      say(again ? `placed ${nameOf(was.r)} · click to place another · Esc stops` : `placed ${nameOf(was.r)}`);
    }, true);
  };
  const setGizmo = (m: 'translate' | 'rotate' | 'scale'): void => {
    gizmo.setMode(m);
    moveBtn.classList.toggle('is-on', m === 'translate');
    turnBtn.classList.toggle('is-on', m === 'rotate');
    scaleBtn.classList.toggle('is-on', m === 'scale');
    showSelection();
  };
  const setSnap = (on: boolean): void => {
    snap = on;
    // FUI-22 review F1: with snap on the queued prop's carried turn stays on the turn step's grid (a changed step re-rounds it).
    if (on && queuedTurn !== 0 && turnStep > 0) { queuedTurn = (((Math.round(queuedTurn / turnStep) * turnStep) % 360) + 360) % 360; moveGhost(lastNdc); }
    gizmo.setTranslationSnap(on ? gridStep : null);
    gizmo.setRotationSnap(on ? (turnStep * Math.PI) / 180 : null);
    drawPlacement();
    writeView();
  };
  // A view setting, no edit: applied live as it is scrubbed (`input` from `./scrub`, the field not focused), and at the
  // release or a typed value's Enter (`change`) -- a half-typed value is never clamped under the typing.
  const applyGridStep = (): void => {
    gridStep = boundStep(Number(viewportGridIn.value), GRID_STEP_MIN, GRID_STEP_MAX, DEFAULT_GRID_STEP);
    setSnap(snap);
  };
  const applyTurnStep = (): void => {
    turnStep = boundStep(Number(viewportTurnIn.value), TURN_STEP_MIN, TURN_STEP_MAX, DEFAULT_TURN_STEP);
    setSnap(snap);
  };
  for (const [input, apply] of [[viewportGridIn, applyGridStep], [viewportTurnIn, applyTurnStep]] as const) {
    input.addEventListener('change', apply);
    input.addEventListener('input', () => { if (doc.activeElement !== input) apply(); });
  }
  viewportSnapIn.addEventListener('change', () => setSnap(viewportSnapIn.checked));
  /* ---------- the assets ---------- */
  /** FG-21: the base map's characters, each side's types in `chartype.rdr` order, as the dock's list. */
  const characters = (): { side: 'seal' | 'terrorist'; type: number }[] => {
    const t = charMap?.types;
    if (!t) return [];
    const of = (side: 'seal' | 'terrorist'): { side: 'seal' | 'terrorist'; type: number }[] =>
      t[side].flatMap((b, type) => (b ? [{ side, type }] : []));
    return [...of('terrorist'), ...of('seal')];
  };
  const drawCharacters = (): void => {
    const q = search.value.trim().toLowerCase();
    const items: HTMLElement[] = [];
    let last: string | null = null;
    for (const c of characters()) {
      const label = charLabel(c.side, c.type);
      if (q && !label.toLowerCase().includes(q)) continue;
      if (last !== c.side) { items.push(el(doc, 'li', 'fx-group-head', c.side === 'seal' ? 'SEALs' : 'Terrorists')); last = c.side; }
      const li = el(doc, 'li', `fx-char fx-side-${c.side}`);
      const preview = el(doc, 'span', 'fx-asset-thumbnail fx-char-thumbnail');
      preview.innerHTML = icon('npc');
      const b = charMap?.types?.[c.side]?.[c.type];
      li.append(preview, el(doc, 'span', 'fx-asset-name', `${c.side === 'seal' ? 'SEAL' : 'Terrorist'} ${c.type + 1}`), el(doc, 'span', 'fx-dim', b?.character ?? b?.model ?? ''));
      li.title = `${label}: placed as an NPC on the ${c.side === 'seal' ? 'SEAL' : 'terrorist'} side`;
      li.classList.toggle('is-on', npcChoice?.side === c.side && npcChoice.type === c.type);
      li.addEventListener('click', () => chooseCharacterRow(c));
      items.push(li);
    }
    if (items.length === 0) items.push(el(doc, 'li', 'fx-empty', characters().length ? 'No characters match' : 'This base carries no player models'));
    list.replaceChildren(...items);
    assetTiles?.tooltip.hide();
    updateAssetThumbnailObservations();
  };
  /** R6 (the palette seam): the page's NPC tool on character `c` -- the Characters list's click and the seam's `chooseCharacter`. */
  const chooseCharacterRow = (c: { side: 'seal' | 'terrorist'; type: number }): void => {
    npcChoice = c; setMode('npc'); drawAssets(); say(`placing NPCs: ${charLabel(c.side, c.type)}`);
  };
  /** FUI-22 review F1 (all routes): a newly chosen asset arrives unturned (the wheel's turn belongs to the prop it turned); the same asset keeps it. */
  const newAssetChosen = (asset: string): void => {
    if (chosen !== asset) { queuedTurn = 0; wheelTravel = 0; }
  };
  /** R6: the page's Place tool on `asset` -- the assets list's click and the seam's `choose`. */
  const choosePaletteRow = (asset: string): void => {
    newAssetChosen(asset);
    // FUI-22 review F2: the list is redrawn, so a pick made from a tile's button hands focus to the redrawn one.
    const refocus = !!doc.activeElement && list.contains(doc.activeElement) && !!doc.activeElement.closest('.fx-asset-pick');
    chosen = asset; noteRecentProp(asset); setMode('place'); drawAssets(); say(`placing ${asset}`);
    if (refocus) {
      for (const li of Array.from(list.children) as HTMLElement[]) if (li.dataset['asset'] === asset) li.querySelector<HTMLElement>('.fx-asset-pick')?.focus();
    }
    assetTiles?.activate(asset);                                 // FUI-22 (D1): the picked asset's tooltip at once
  };
  /** FUI-22 (D4): Escape with a prop queued -- the queue cancelled (the Select tool, nothing chosen), the selection kept. */
  const cancelQueued = (): void => {
    if (replacing) {
      // Escape while re-placing: the prop back where it was, the Select tool, it still selected.
      const r = replacing.r;
      endReplace(true);
      setMode('select');
      showSelection();
      say(`${nameOf(r)}: put back`);
      return;
    }
    if (entityTool !== null) { const kind = entityTool; endEntityPlace(); say(`${kind}: placement cancelled`); return; }   // FCW-32 step 4
    const was = chosen;
    chosen = null; queuedTurn = 0; wheelTravel = 0;
    assetTiles?.tooltip.hide();
    setMode('select');
    drawAssets();
    say(was ? `${was}: placement cancelled` : 'placement cancelled');
  };
  /** FUI-22 (D4): the queued prop turned by `deg` (a wheel notch is one turn step), the ghost with it, the turn said. */
  const turnQueued = (deg: number): void => {
    if (replacing) {
      // The re-placed prop turned about the vertical by `deg`, as the queued prop's ghost turns.
      replacing.r.rotation.y += (deg * Math.PI) / 180;
      refreshBox();
      say(`placing ${nameOf(replacing.r)} · the wheel turns it ${turnStep}°`);
      return;
    }
    queuedTurn = (((queuedTurn + deg) % 360) + 360) % 360;
    moveGhost(lastNdc);
    const shown = queuedTurn > 180 ? queuedTurn - 360 : queuedTurn;
    say(`placing ${chosen ?? ''} · turned ${shown}° · the wheel turns it ${turnStep}°`);
  };
  /** R6: the words the assets list shows when no prop does. */
  const paletteEmptyReason = (): string => (filter === 'favs' ? 'No favourites yet: star a prop to keep it here' : 'No props match: clear the search or choose another filter');
  /** R6 (the palette seam, `./shell/context` `ForgePalette`): the list's rows as the page draws them, its sections named. */
  const paletteRows = (): PaletteRow[] => assetsShown(entriesOfPalette, favs, filter, search.value).map((a) => ({
    assetId: a.asset, name: a.model, archive: a.archive, group: filter === 'all' && a.fav ? 'Favourites' : null, placed: a.placed,
    favourite: a.fav, chosen: chosen === a.asset,
  }));
  /** R6: the base's characters as the Characters list shows them (its search applied), each with the page's own metadata. */
  const characterRows = (): CharacterRow[] => {
    const q = search.value.trim().toLowerCase();
    return characters().flatMap((c): CharacterRow[] => {
      const name = charLabel(c.side, c.type);
      if (q && !name.toLowerCase().includes(q)) return [];
      return [{ id: `${c.side}:${c.type}`, name, side: c.side, group: c.side === 'seal' ? 'SEALs' : 'Terrorists', type: c.type,
        model: charMap?.types?.[c.side]?.[c.type]?.model ?? null, chosen: npcChoice?.side === c.side && npcChoice.type === c.type }];
    });
  };
  /** R6: the palette seam's listeners, told at every redraw of the assets list (the rows, filter, favourites, chosen, archive). */
  const paletteListeners = new Set<() => void>();
  /** R6: the archive the palette is being read from, or null. */
  let paletteLoading: string | null = null;
  let updateAssetThumbnailObservations = (): void => undefined;
  const drawAssets = (): void => {
    drawAssetList();
    for (const listener of [...paletteListeners]) {
      try { listener(); } catch (e) { console.error('forge palette listener', e); }
    }
  };
  const drawAssetList = (): void => {
    applyAssetDisplay();
    chipAll.classList.toggle('is-on', !showChars && filter === 'all');
    chipFav.classList.toggle('is-on', !showChars && filter === 'favs');
    chipChars.classList.toggle('is-on', showChars);
    search.placeholder = showChars ? 'Search characters…' : 'Search props…';
    if (showChars) { drawCharacters(); return; }
    const shown = assetsShown(entriesOfPalette, favs, filter, search.value);
    let favsEnded = false;
    const items: HTMLElement[] = [];
    for (const a of shown) {
      if (filter === 'all' && !a.fav && !favsEnded && shown.some((s) => s.fav)) { items.push(el(doc, 'li', 'fx-sep')); favsEnded = true; }
      // FUI-22 (D5, D3): a tile -- its star, static preview, then its own pick control, dragged as one piece; its hover
      // tooltip gives the full name and animated preview (`assetTiles`).
      const li = el(doc, 'li');
      li.dataset['asset'] = a.asset;
      li.draggable = true;
      const star = el(doc, 'button', 'fx-star');
      star.type = 'button';
      star.innerHTML = icon('star');
      star.title = a.fav ? 'Remove from favourites' : 'Add to favourites';
      star.setAttribute('aria-label', `${star.title}: ${a.model}`);
      star.classList.toggle('is-on', a.fav);
      star.addEventListener('click', (e) => { e.stopPropagation(); favs = toggleFavourite(favs, a.asset); writeFavourites(favs); drawAssets(); });
      const pick = el(doc, 'button', 'fx-asset-pick');
      pick.type = 'button';
      const name = el(doc, 'span', 'fx-asset-name', a.model);
      const metaText = assetViewMode === 'grid'
        ? (a.placed === null || filter === 'favs' ? a.archive : '')
        : (a.placed === null ? a.archive : filter === 'favs' ? a.archive : `×${a.placed}`);
      const preview = el(doc, 'span', 'fx-asset-thumbnail');
      const image = doc.createElement('img');
      image.dataset['assetThumbnail'] = '';
      image.dataset['assetId'] = a.asset;
      image.alt = '';
      image.setAttribute('aria-hidden', 'true');
      image.loading = 'lazy';
      const status = el(doc, 'span', 'fx-asset-thumbnail-status', 'Loading preview…');
      preview.append(image, status);
      const meta = el(doc, 'span', 'fx-dim', metaText);
      if (assetViewMode === 'grid') {
        const copy = el(doc, 'span', 'fx-asset-card-copy');
        copy.append(name);
        if (metaText) copy.append(meta);
        pick.append(preview, copy);
      } else {
        const copy = el(doc, 'span', 'fx-asset-card-copy');
        copy.append(name, meta);
        pick.append(preview, copy);
      }
      li.append(star, pick);
      li.title = a.model;
      li.classList.toggle('is-on', chosen === a.asset);
      li.addEventListener('click', () => choosePaletteRow(a.asset));
      items.push(li);
    }
    if (items.length === 0) items.push(el(doc, 'li', 'fx-empty', paletteEmptyReason()));
    list.replaceChildren(...items);
    assetTiles?.redrawn();
    updateAssetThumbnailObservations();
  };
  const saveAssetBrowserSettings = (): void => writeKey(assetBrowserSettingsKey, JSON.stringify({ mode: assetViewMode, size: assetTileSize }));
  const setAssetViewMode = (mode: 'list' | 'grid'): void => {
    if (assetViewMode === mode) return;
    assetViewMode = mode;
    applyAssetDisplay();
    saveAssetBrowserSettings();
    drawAssets();
  };
  const closeAssetViewPopup = (): void => {
    assetViewPopup.hidden = true;
    assetViewPopupButton.setAttribute('aria-expanded', 'false');
  };
  assetViewPopupButton.addEventListener('click', () => {
    assetViewPopup.hidden = !assetViewPopup.hidden;
    assetViewPopupButton.setAttribute('aria-expanded', String(!assetViewPopup.hidden));
    if (!assetViewPopup.hidden) listModeBtn.focus();
  });
  assetViewPopup.addEventListener('click', event => event.stopPropagation());
  doc.addEventListener('pointerdown', event => {
    if (!chips.contains(event.target as Node)) closeAssetViewPopup();
  }, { signal: assetViewEvents.signal });
  doc.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || assetViewPopup.hidden) return;
    event.stopPropagation();
    closeAssetViewPopup();
    assetViewPopupButton.focus();
  }, { signal: assetViewEvents.signal });
  listModeBtn.addEventListener('click', () => setAssetViewMode('list'));
  gridModeBtn.addEventListener('click', () => setAssetViewMode('grid'));
  sizeSlider.addEventListener('input', () => {
    const value = Number(sizeSlider.value);
    if (!Number.isFinite(value)) return;
    assetTileSize = Math.round(Math.max(72, Math.min(200, value)));
    applyAssetDisplay();
    saveAssetBrowserSettings();
  });
  assetPreviewToggle.addEventListener('change', () => {
    assetTips = assetPreviewToggle.checked;
    if (!assetTips) assetTiles?.tooltip.hide();
    writeView();
  });
  chipAll.addEventListener('click', () => { filter = 'all'; showChars = false; drawAssets(); });
  chipFav.addEventListener('click', () => { filter = 'favs'; showChars = false; drawAssets(); });
  chipChars.addEventListener('click', () => { showChars = true; drawAssets(); });
  /**
   * R6 (the rendered pass's case 8): a palette loaded -- the open START menu redrawn (its Props screen reads the palette at
   * each draw), so it shows the new props without another press. Set once the menu is made.
   */
  let refreshMenuForPalette = (): void => undefined;
  const showPalette = async (stem: string): Promise<void> => {
    invalidateAssetThumbnails();
    paletteSel.value = stem;
    entriesOfPalette = [];
    paletteLoading = stem;
    drawAssets();
    let map: LoadedMap;
    try { map = await archives.load(stem); } finally { if (paletteLoading === stem) paletteLoading = null; }
    if (paletteSel.value !== stem) return;
    entriesOfPalette = creatorPalette(map);
    drawAssets();
    refreshMenuForPalette();
    say(`${labelOf(entries, stem, map.name)} (${stem}): ${entriesOfPalette.length} props`);   // the mission's name, never its raw loc key
  };

  /* ---------- pieces and markers ---------- */
  const addRoot = (r: Object3D): void => { roots.push(r); scene.add(r); publishCreatorPiece(r); };
  /** A copy joins its kind (pieces, then spawns, then NPCs), the order a restore rebuilds, so its row does not move. */
  const addPlacement = (r: Object3D): void => {
    const rank = (o: Object3D): number => o.userData['forgePiece'] ? 0 : o.userData['forgeSpawn'] ? 1 : 2;
    const kind = rank(r);
    const at = roots.findIndex((o) => rank(o) > kind);
    if (at < 0) roots.push(r); else roots.splice(at, 0, r);
    scene.add(r);
    publishCreatorPiece(r);
  };
  const removeRoot = (r: Object3D): void => {
    const at = roots.indexOf(r);
    if (at >= 0) roots.splice(at, 1);
    scene.remove(r);
    (r.userData['dispose'] as (() => void) | undefined)?.();
    if (picks.remove(r)) showSelection();
  };
  /**
   * R6 (3): a pack's piece whose definition resolves (`resolveContent`): a group named by its content key, its GLB (the
   * pack member the definition's visual names, read through `../modelPackRuntime` `parseGlb`, three's GLTFLoader with the
   * outside-URI refusal) with its root scaled by 1 / CONTENT_METRES_PER_UNIT_ADAPTATION exactly once -- metres to game
   * units, as `../packs/content/collision` scales its hull -- under the piece's own place and turn (the caller sets the
   * group's matrix). Its hull is not carried here: the ground composes it from the reference (`layoutGround`). A GLB that
   * will not read draws the bounds' stand-in. Null when the definition does not resolve (the caller's stand-in, counted).
   */
  const newContentPiece = async (ref: ContentRef): Promise<Object3D | null> => {
    const def = resolveContent(ref);
    if (!def) return null;
    const key = contentAssetKey(def.ref);
    const g = new Group();
    g.name = key;
    g.userData['forgePiece'] = key;
    g.userData['forgeContentKey'] = key;
    let visual: Object3D | null = null;
    const bytes = await Promise.resolve(contentSource.member(def.ref.pack, def.visual.member)).catch(() => null);
    if (bytes) {
      try { visual = await (await import('../modelPackRuntime')).parseGlb(bytes); }
      catch (e) { console.warn(`forge: ${key}'s visual would not read`, e); visual = null; }
    }
    if (visual) visual.scale.setScalar(1 / CONTENT_METRES_PER_UNIT_ADAPTATION);
    else {
      const { min, max } = def.boundsMetres;
      const u = 1 / CONTENT_METRES_PER_UNIT_ADAPTATION;
      const box = new Mesh(new BoxGeometry(Math.max((max[0] - min[0]) * u, 1), Math.max((max[1] - min[1]) * u, 1), Math.max((max[2] - min[2]) * u, 1)),
        new MeshBasicMaterial({ color: CONTENT_STANDIN_COLOUR_ADAPTATION, wireframe: true, fog: false }));
      box.position.set(((min[0] + max[0]) / 2) * u, ((min[1] + max[1]) / 2) * u, ((min[2] + max[2]) / 2) * u);
      visual = box;
    }
    g.add(visual);
    const drawn = visual;
    g.userData['dispose'] = () => {
      drawn.traverse((o) => {
        const m = o as Mesh;
        if (!m.isMesh) return;
        m.geometry?.dispose();
        for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mat?.dispose();
      });
    };
    return g;
  };
  const newPiece = async (asset: string, content?: unknown): Promise<Object3D | null> => {
    if (asset === FORGE_BLOCK) return blockPiece();
    // R3-B: a pack's piece (`contentAssetKey`): no disc archive holds it. R6 (3): drawn from its pack when it resolves.
    if (asset.startsWith(PACK_ASSET_PREFIX)) return content ? newContentPiece(content as ContentRef) : null;
    const id = parseAssetId(asset);
    if (!id || absent.has(id.archive)) return null;
    const map = await archives.load(id.archive).catch(() => null);
    if (!map) { pieceSources.delete(id.archive); forgetArchive(id.archive); return null; }
    pieceSources.set(id.archive, map);
    const r = pieces.piece(asset, map);
    if (!r) return null;
    const polys = await hullOf(asset);
    if (polys && polys.length > 0) r.userData['forgeHull'] = polys;
    // A ladder prop (its own hull's `m_appflags` 2 polygons, `./mapCensus` `ladderPropsOf`): the Ladders branch, its L.
    if (polys?.some((q) => q.appflags === 2)) {
      r.userData['forgeLadder'] = true;
      // Its climb side (`./interactOverlay`): the prop's own ladder polygons' (their side the game's where the disc places it).
      for (const l of findLadders(polys)) r.add(guideIn(ladderSegments(l), ladderTriangles(l), null, LADDER_CLIMB_COLOUR, 'userLadders'));
    }
    creatorPieceMaps.set(r, map);
    return r;
  };
  /** FG-21: the walk's clips, read once for the NPC markers' standing pose (`./figure`); null where they will not read. */
  let figureClipsAsk: Promise<PlayClips | null> | null = null;
  const figureClips = (): Promise<PlayClips | null> => (figureClipsAsk ??= archives.clips(PLAY_CLIPS).catch(() => null));
  /** FG-21: an NPC's marker, its character's own body standing on it (a post where the map has no body for it). */
  const newNpc = (side: 'seal' | 'terrorist', type: number, map = charMap): Object3D => {
    const b = map?.types?.[side]?.[type] ?? null;
    let figure: { group: Object3D; dispose(): void } | null = null;
    let relight: ((brighten: number) => void) | null = null;
    if (map && b) {
      const v = buildBody(b, map, { ...DEFAULT_LIGHTING, rig: map.lightRig, brighten: lighting.brighten });
      relight = (brighten) => v.setLighting({ ...DEFAULT_LIGHTING, rig: map.lightRig, brighten });   // FG-24: the day / night
      v.place([0, 0, 0], 0);
      v.setVisible(true);
      let gone = false;
      // Stood in the game's own idle once the walk's clips are read (the bind pose until then, or for good without them).
      void figureClips().then((c) => { const pose = c && !gone ? standingPose(b, c) : null; if (pose) v.setPose(pose); });
      figure = { group: v.group, dispose: () => { gone = true; v.dispose(); } };
    }
    const marker = npcMarker(side, type, figure);
    if (relight) marker.userData['forgeBrighten'] = relight;
    return marker;
  };

  /* ---------- the hull: the base's and every piece's (`./ground`) ---------- */
  /** The hull placements rest on: the base, plus each placed piece's collision (`userData.forgeHull`, model space). */
  let placementGrid: Grid | null = null;
  /**
   * The floor under a ground-plane point (the tactical map's points and zones, `./mapData`): the highest surface there,
   * 0 with no hull yet. A declaration, so the Outliner reads it wherever it is drawn.
   */
  /** The map data the Outliner and the billboards read: the loaded map's, and the flares its drawn world holds. */
  function mapDataSource(map: LoadedMap): MapDataSource {
    return { ...map, flares: baseView?.flares?.() ?? [], ladders: mapLadders };
  }
  function floorUnder(x: number, z: number): number {
    try {
      const ys = placementGrid ? surfaceYs(placementGrid, x, z) : [];
      return ys.length ? Math.max(...ys) : 0;
    } catch { return 0; }
  }
  /** The base map's data billboards: every spawn slot and Map Data row with a place (none on a blank floor). */
  const drawMapBillboards = (): void => {
    // The ladders off the base's hull, a hidden prop's own polygons out (its ladder with it), sided on the floors.
    try {
      mapLadders = baseMap?.ground
        ? findLadders(groundPolygons(groundWithout(baseMap, baseMap.ground, placementsOf(baseMap, hiddenKeys))), placementGrid ?? undefined)
        : [];
    } catch { mapLadders = []; }
    // The map's props, each at its placement's place (its matrix's translation, column-major), but a hidden one.
    const props = baseMap ? mapPropPlacements().flatMap(({ placement, model }): PropMark[] => {
      if (hiddenKeys.has(placement.key)) return [];
      const m = baseMap!.props[placement.prop]?.matrices;
      const at = placement.index * 16;
      return m && m.length >= at + 16 ? [{ key: placement.key, model, at: [m[at + 12]!, m[at + 13]!, m[at + 14]!] }] : [];
    }) : [];
    const specs = baseMap ? billboardSpecs(mapDataGroups(mapDataSource(baseMap), floorUnder), baseMap.slots, props) : [];
    mapDataIndex = new Map(specs.map((s) => [s.key, s]));
    // A selected item the marks no longer have (hidden since) goes; a new base clears it before (`door:0` is another door).
    if (mapDataSelected && !mapDataIndex.has(mapDataSelected.key)) mapDataSelected = null;
    mapBillboards.set(specs);
    highlightSelectionMark();
    // The light rig's arrows across the map's middle, sized to it; the Environment panel's disc values with them.
    const box = baseView?.box;
    const centre: [number, number, number] = box && !box.isEmpty() ? box.getCenter(new Vector3()).toArray() : [0, 0, 0];
    if (base?.kind === 'blank') lightArrows.set(customRig() ?? libraryRig(), [0, 0, 0], BLANK_RIG_ARROWS_SPAN, blankShadow());   // a new empty map's rig
    else lightArrows.set(baseMap?.lightRig ?? null, centre, box && !box.isEmpty() ? Math.max(box.max.x - box.min.x, box.max.z - box.min.z) : 0, baseMap?.shadowVector ?? null);
    // The map's tactical zones' rectangles, each at the floor under its middle (the file places them on the ground plane only).
    if (mapZoneLines) { scene.remove(mapZoneLines); mapZoneLines.geometry.dispose(); (mapZoneLines.material as Material).dispose(); mapZoneLines = null; }
    const tacZones = baseMap?.tac?.zones ?? [];
    if (tacZones.length) {
      mapZoneLines = zoneOutlines(tacZones.map((z) => ({ ...z, y: floorUnder((z.minX + z.maxX) / 2, (z.minZ + z.maxZ) / 2) })));
      scene.add(mapZoneLines);
    }
    drawMapGuides();                                           // its doors' swings, its ladders' climb sides
    drawEnvironmentPanel();
    applyBillboards();
  };
  /** The selection's mark drawn as selected: a selected map data item's, else the one selected map prop's. */
  /**
   * The Environment panel's read-only part from the base map (`./environment`): its light rig, fog, night, shadows,
   * reflections and flares; the layout's retired brightness while it carries one. A declaration: `applySettings` may run
   * before this line.
   */
  function drawEnvironmentPanel(): void {
    const map = baseMap;
    drawEnvironment(environmentDom, map ? environmentSections({
      rig: map.lightRig,
      camera: map.camera,
      ...(map.night ? { night: map.night } : {}),
      ...(map.shadowVector ? { shadowVector: map.shadowVector } : {}),
      ...(map.envMaterials ? { envMaterials: map.envMaterials } : {}),
      flares: baseView?.flares?.().length ?? 0,
      legacyLight: settings.timeOfDay === null && settings.light < 1 ? settings.light : null,
    }) : []);
  }
  function highlightSelectionMark(): void {                    // a declaration: `showSelection` may run before this line
    mapBillboards.highlight(mapDataSelected?.key ?? (baseSelected ? propMarkKey(baseSelected.key) : selected ? userMarkKeyOf(selected) : null));
  }
  /**
   * The user's placements' billboards (`./mapDataBillboards` `setUser`): a mark each -- a piece, a spawn by its team, an
   * NPC, a bomb marker -- keyed `user:<n>` for as long as the placement lives (`userMarkKeys`), rebuilt only when the set
   * of placements changes, and moved over each where it is every frame (`sync`).
   */
  const userMarkKeys = new WeakMap<Object3D, string>();
  let userMarkCount = 0;
  let userMarksOf: readonly Object3D[] = [];
  function userMarkKeyOf(r: Object3D): string {
    let key = userMarkKeys.get(r);
    if (!key) { key = `user:${++userMarkCount}`; userMarkKeys.set(r, key); }
    return key;
  }
  /** The placement a user mark's key names, or null (a key not of a user mark, or one gone since). */
  const rootOfUserMark = (key: string): Object3D | null =>
    (key.startsWith('user:') ? roots.find((r) => userMarkKeys.get(r) === key) ?? null : null);
  function syncUserBillboards(): void {
    if (roots.length !== userMarksOf.length || roots.some((r, i) => r !== userMarksOf[i])) {
      userMarksOf = [...roots];
      mapBillboards.setUser(roots.flatMap((r): UserMark[] => {
        const kind = userMarkKind({
          piece: !!r.userData['forgePiece'], npc: !!npcOf(r), bomb: bombKindOf(r), hostage: !!r.userData['forgeHostage'], zone: !!r.userData['forgeZone'], point: !!r.userData['forgePoint'], view: !!r.userData['forgeView'], turret: !!r.userData['forgeTurret'], door: !!r.userData['forgeDoor'], ladder: !!r.userData['forgeLadder'], flare: r.userData['forgeFlare'] !== undefined, gate: !!r.userData['forgeGate'], barrier: !!r.userData['forgeBarrier'],
          ...(r.userData['forgeSpawn'] === 'A' || r.userData['forgeSpawn'] === 'B' ? { team: r.userData['forgeSpawn'] as 'A' | 'B' } : {}),
          ...(r.userData['forgeRespawn'] === 'A' || r.userData['forgeRespawn'] === 'B' ? { respawn: r.userData['forgeRespawn'] as 'A' | 'B' } : {}),
        });
        return kind ? [{ key: userMarkKeyOf(r), kind, label: placedLabel(r), object: r }] : [];
      }));
      highlightSelectionMark();
    }
    mapBillboards.sync();
  }
  const refreshPlacementGround = (): void => {
    const baseGround = base?.kind === 'blank'
      ? floorGround(FLOOR_SIZE)
      : baseMap?.ground
        ? groundWithout(baseMap, baseMap.ground, placementsOf(baseMap, hiddenKeys))
        : null;
    if (!baseGround) { placementGrid = null; return; }
    const placed: (PieceHull | ContentPiece)[] = [];
    for (const [i, r] of roots.entries()) {
      if (r === replacing?.r) continue;                         // a prop being re-placed never rests on itself
      // R6 (3): a pack piece's hull is the content provider's, through the page's resolver (`layoutGround`).
      const content = r.userData['forgePiece'] ? r.userData['forgeContent'] as ContentRef | undefined : undefined;
      if (content) { r.updateMatrix(); placed.push({ owner: `forge/piece_${i}`, content, m: Array.from(r.matrix.elements) }); continue; }
      const polys = r.userData['forgeHull'] as WorldPoly[] | undefined;
      if (!polys || polys.length === 0) continue;
      r.updateMatrix();
      placed.push({ owner: `forge/piece_${i}`, polys, m: Array.from(r.matrix.elements) });
    }
    placementGrid = placementGridOf(baseGround, placed, resolveContent);
  };
  const hulls = new Map<string, WorldPoly[] | null>();
  const hullOf = async (asset: string): Promise<WorldPoly[] | null> => {
    if (!hulls.has(asset)) {
      const id = parseAssetId(asset);
      if (!id || absent.has(id.archive)) hulls.set(asset, null);
      else {
        const map = await archives.load(id.archive).catch(() => null);
        if (!map) forgetArchive(id.archive);
        hulls.set(asset, map ? prototypePolygons(map, id.model) : null);
      }
    }
    return hulls.get(asset) ?? null;
  };
  const composeGround = async (): Promise<{ ground: GroundData; solid: number; groundMap: LoadedMap; misses: ContentMiss[] } | null> => {
    if (!base) return null;
    const groundMap = baseMap ?? (base.kind === 'blank' ? charMap : null);
    if (!groundMap) return null;
    // R6 (7): an authored map's ground is its own (`loadContentMap`'s), as a map base's is.
    const baseGround = base.kind !== 'blank'
      ? (groundMap.ground ? groundWithout(groundMap, groundMap.ground, placementsOf(groundMap, hiddenKeys)) : undefined)
      : floorGround(FLOOR_SIZE);
    if (!baseGround) return null;
    const entries: (PieceHull | ContentPiece)[] = [];
    let solid = 0;
    for (const [i, r] of roots.entries()) {
      const asset = r.userData['forgePiece'] as string | undefined;
      if (!asset) continue;
      r.updateMatrix();
      const owner = `forge/piece_${i}`, m = Array.from(r.matrix.elements);
      // R6 (3, FCW-09): a pack piece goes to `layoutGround` as its reference; the content provider gives its hull, or
      // its miss (unresolved, or placed other than by a turn about +Y).
      const content = r.userData['forgeContent'] as ContentRef | undefined;
      if (content) {
        const got = contentPieceHull({ owner, content, m }, resolveContent);
        if (!('missing' in got) && got.hull) solid++;
        entries.push({ owner, content, m });
        continue;
      }
      const polys = await hullOf(asset);
      if (polys) { entries.push({ owner, polys, m }); solid++; }
    }
    const misses: ContentMiss[] = [];
    return { ground: layoutGround(baseGround, entries, resolveContent, misses), solid, groundMap, misses };
  };
  let hullTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleHull = (): void => {
    if (hullTimer) clearTimeout(hullTimer);
    hullTimer = setTimeout(() => {
      void composeGround().then((c) => {
        if (!c) return;
        const { positions, colors } = hullSegments(c.ground);
        const g = new BufferGeometry();
        g.setAttribute('position', new BufferAttribute(positions, 3));
        g.setAttribute('color', new BufferAttribute(colors, 3));
        if (hullLines) { scene.remove(hullLines); hullLines.geometry.dispose(); }
        hullLines = new LineSegments(g, hullMaterial);
        hullLines.frustumCulled = false;
        hullLines.renderOrder = 10;                         // over the world: the hull is read through it
        hullLines.visible = view.collision;
        scene.add(hullLines);
      });
    }, 250);
  };
  const duplicateMapPropForDrag = (source: BaseProp, before: string[]): void => {
    const map = baseMap;
    if (!map || baseSelected?.key !== source.key) return;
    const asset = assetId(map.archive, source.model);
    const copy = pieces.piece(asset, map);
    if (!copy) {
      say(`Cannot duplicate map prop ${source.model}: its prototype is unavailable`, true);
      showSelection();
      return;
    }
    const id = parseAssetId(asset);
    if (!id) {
      say(`Cannot duplicate map prop ${source.model}: its asset identity is invalid`, true);
      showSelection();
      return;
    }
    mapPropProxy.updateMatrixWorld(true);
    mapPropProxy.matrixWorld.decompose(copy.position, copy.quaternion, copy.scale);
    creatorPieceMaps.set(copy, map);
    pieceSources.set(id.archive, map);
    const accepted = personEdit('selection.duplicate', { refs: [source.key] }, (step) => {
      mapPropDragStep = { step, before };
      addPlacement(copy);
      picks.only(copy);
      basePicks.clear();
      showSelection();
      edit(before, step);
    }, true);
    if (!accepted) {
      mapPropProxy.matrix.copy(source.matrix);
      mapPropProxy.matrix.decompose(mapPropProxy.position, mapPropProxy.quaternion, mapPropProxy.scale);
      mapPropProxy.updateMatrixWorld(true);
      showSelection();
      return;
    }
    void hullOf(asset).then((polys) => {
      if (!polys?.length || !roots.includes(copy)) return;
      copy.userData['forgeHull'] = polys;
      refreshPlacementGround();
      if (view.collision) scheduleHull();
    }).catch((error: unknown) => {
      console.warn(`forge: ${source.model}'s collision hull would not read`, error);
      say(`Could not load ${source.model}'s collision hull`, true);
    });
  };
  const duplicateUserPropForDrag = (source: Object3D, originalMatrix: Matrix4, before: string[]): void => {
    const asset = source.userData['forgePiece'] as string | undefined;
    // A placed door, turret, gate, barrier, hostage, zone, point or view: cloned whole and renamed (`markerClone`).
    const copy = asset ? source.clone(true) : markerClone(source);
    if (!copy) return;
    delete copy.userData['forgeId'];
    if (!asset) freshName(copy);
    const map = creatorPieceMaps.get(source);
    if (map) creatorPieceMaps.set(copy, map);
    const id = asset ? parseAssetId(asset) : null;
    if (id && map) pieceSources.set(id.archive, map);

    const accepted = personEdit('selection.duplicate', { refs: before }, (step) => {
      mapPropDragStep = { step, before };
      addPlacement(copy);
      source.matrix.copy(originalMatrix);
      source.matrix.decompose(source.position, source.quaternion, source.scale);
      source.updateMatrix();
      source.updateMatrixWorld(true);
      picks.only(copy);
      basePicks.clear();
      showSelection();
      edit(before, step);
    }, true);
    if (!accepted) {
      source.matrix.copy(originalMatrix);
      source.matrix.decompose(source.position, source.quaternion, source.scale);
      source.updateMatrix();
      source.updateMatrixWorld(true);
      showSelection();
    }
  };

  /* ---------- the base ---------- */
  const clearAll = (): void => {
    select(null);
    for (const r of [...roots]) removeRoot(r);
    if (baseView) { forgePacks.setWorld(null, null); scene.remove(baseView.group); baseView.dispose(); baseView = null; }   // ML-3: the pack's originals back first
    if (baseContentProps) { scene.remove(baseContentProps); (baseContentProps.userData['dispose'] as (() => void) | undefined)?.(); baseContentProps = null; }
    baseMap = null;
    charMap = null;
    hiddenDrawn = new Set();
    scene.remove(floor);
  };
  /**
   * R6 fix-up (the review's base-select finding): an authored map is a base the select shows -- one disabled option of
   * its own (`CONTENT_BASE_ROW`), never chosen, so another base chosen from it asks as any base change does, and the
   * pad's Base row steps past it. R7-4: its value is the map's (`contentBaseValue`). `b` null: the option goes (the base
   * is a map's or the blank floor's).
   */
  const showContentOption = (b: ContentLayoutBase | null, label = ''): void => {
    let o = baseSel.querySelector<HTMLOptionElement>(`option[data-forge-base="${CONTENT_BASE_ROW}"]`);
    if (b === null) { o?.remove(); return; }
    if (!o) { o = el(doc, 'option', '', label); o.dataset['forgeBase'] = CONTENT_BASE_ROW; o.disabled = true; baseSel.prepend(o); }
    else o.textContent = label;
    o.value = contentBaseValue(b);
    baseSel.value = o.value;
  };
  /** R6 (7): an authored map's load stage in the loading line (`CONTENT_STAGE_WORDS`), its bar by the stage's place. */
  const showContentStage = (stage: ContentLoadStage, done: number, total: number): void => {
    loadingLine.textContent = total > 0 ? `${CONTENT_STAGE_WORDS[stage]} (${done} of ${total})` : CONTENT_STAGE_WORDS[stage];
    const pct = Math.round(((CONTENT_STAGES.indexOf(stage) + 1) / CONTENT_STAGES.length) * 100);
    loadingFill.style.width = `${pct}%`;
    loadingBar.setAttribute('aria-valuenow', String(pct));
  };
  /**
   * R6 (7; the S3b review): a content base's authored map, loaded through `loadContentMap` (`../packs/content/map`
   * `loadContentBase`: the member by the structured reference only) with the page's resolver for its props and `library`
   * (the disc map whose characters and kits the match takes) -- or refused, nothing changed: its pack not here
   * (`contentBaseRefusal`), or the map refused (its diagnostics' words). R7-3 (round 6's finding): with the map's own
   * props (`contentMapPieces`, owner `content/prop_<i>`), whose hulls the load put in its ground -- the page draws them
   * (`newContentBaseProps`). R7-6: the member read once a boot -- the answer `holdsContentBase` kept, else read here.
   */
  const loadContentWorld = async (b: ContentLayoutBase, library: LoadedMap | null): Promise<{ world: LoadedMap; props: ContentPiece[] }> => {
    const ref = contentBaseRef(b);
    const json: unknown = await Promise.resolve(takeHeldContentMap(b) ?? contentSource.map(ref)).catch(() => null);
    if (json === null || json === undefined) throw new ForgeAgentError('REQUIREMENTS_UNMET', contentBaseRefusal(b));
    const { ContentMapLoadError, contentMapPieces, loadContentBase } = await import('../packs/content/map');
    let world: LoadedMap;
    try {
      world = await loadContentBase(b, async () => json, {
        resolveAsset: (r) => resolveContent(r), onStage: showContentStage, ...(library ? { library } : {}),
      });
    } catch (e) {
      if (e instanceof ContentMapLoadError) throw new ForgeAgentError('REQUIREMENTS_UNMET', `This layout's authored map ${b.mapId} (${b.ref.id}@${b.ref.version}) did not load: ${e.message}`);
      throw e;
    }
    // The definition the load read (it reads its member the same way), for its props' places.
    const def = readContentMapDefinition(json, ref);
    return { world, props: Array.isArray(def) ? [] : contentMapPieces(def as ContentMapDefinition) };
  };
  /**
   * R7-3 (round 6's finding; product track, a browser adaptation): an authored map's own props drawn -- each by the
   * content-prop draw the layout's pack pieces take (`newContentPiece`: its GLB scaled once to game units, else its
   * bounds' stand-in), placed by the map's own matrix (`contentMapPieces`), where the load put its hull, so the editor
   * and Walk show what they stand on and walk into. The base's, not the layout's: no placement mark (never picked,
   * selected or saved), and gone with the base (`clearAll`). A prop that does not resolve is not drawn (the load refused
   * such a map already).
   */
  const newContentBaseProps = async (props: readonly ContentPiece[]): Promise<Group> => {
    const g = new Group();
    g.name = 'forge-content-base-props';
    for (const p of props) {
      const r = await newContentPiece(p.content).catch(() => null);
      if (!r) continue;
      delete r.userData['forgePiece'];
      r.userData['forgeBaseProp'] = p.owner;
      r.matrix.fromArray(p.m as number[]);
      r.matrix.decompose(r.position, r.quaternion, r.scale);
      g.add(r);
    }
    g.userData['dispose'] = () => { for (const r of g.children) (r.userData['dispose'] as (() => void) | undefined)?.(); };
    return g;
  };
  /** All I/O and geometry construction precede the scene swap; cancellation disposes only the unmounted view. */
  const prepareBase = async (b: LayoutBase) => {
    const stem = b.kind === 'map' ? b.archive : b.library;
    const known = entries.some((a) => a.stem === stem);
    const map = b.kind === 'map' || known ? await archives.load(stem) : blankLibraryMap(stem, FLOOR_SIZE);
    // R6 (7): a content base's world is its authored map; its library (`map`) fills the palette and gives its characters.
    const loaded = b.kind === 'content' ? await loadContentWorld(b, known ? map : null) : null;
    const authored = loaded?.world ?? null;
    const v = b.kind === 'map' ? buildWorld(map) : authored ? buildWorld(authored) : null;
    if (v) { for (const task of v.revealWorld) task(); for (const task of v.revealProps) task(); }
    // R7-3: the authored map's own props, drawn before the swap as the rest of its world is.
    const ownProps = loaded && loaded.props.length ? await newContentBaseProps(loaded.props) : null;
    const loadedPalette = known || b.kind === 'map' ? palette(map) : [];
    let committed = false;
    const disposeOwnProps = (): void => { (ownProps?.userData['dispose'] as (() => void) | undefined)?.(); };
    return { map, dispose: (): void => { if (!committed) { v?.dispose(); disposeOwnProps(); } }, commit: (): void => {
    committed = true;
    // LATER 471 (a browser adaptation, `EXTENSION_HOST_ADAPTATION`): the world changes here, synchronously, so the host
    // ends every system (its leases undone) now -- never during the preparation above, which may fail or be dropped.
    extensions?.onMapSwitch();
    pageShot?.driver.stop('map');                             // R5-B: a new base ends the agent's camera shot
    clearAll();
    heldContentMap = null;                                    // R7-6: a base change ends the boot's kept answer
    base = b;
    if (ownProps) { baseContentProps = ownProps; scene.add(ownProps); }
    if (b.kind === 'map' || authored) {
      const opened = authored ?? map;
      baseMap = opened;
      charMap = authored && known ? map : opened;
      lighting.rig = opened.lightRig;
      if (!mapFog(fog, opened)) Object.assign(fog, { enabled: true, ...fogForExtent(4000) });
      discFog = { ...fog, color: [...fog.color], altitude: fog.altitude ? { ...fog.altitude } : null };
      const world = v!;
      world.setLighting(lighting);
      baseView = world;
      forgePacks.setWorld(world, opened.textures);           // B206 ML-3: the MODS texture pack on the new world (ML.R8, R9)
      scene.add(world.group);
      fly.setScale(opened.metersPerUnit);
      fly.setClipPlanes(opened.camera?.nearPlane ?? 4, Math.max(2000, world.box.min.distanceTo(world.box.max) * 1.6));
      // FP.R15 (the owner, 2026-11-09; a Forge start view, product track): a disc map's base opens at Craig's still for
      // that map (`./mapStills`, by the archive's stem -- `MP1`; `opened.name` is the mission's name). A map with none, an
      // authored map and the blank floor keep the stand below; `openLayout` then puts a layout's own camera over either.
      const still = b.kind === 'map' ? mapStill(archiveStem(b.archive).toUpperCase()) : null;
      const stand = standOf(opened, world);
      if (still) fly.setPose(still);
      else if (stand.spawn) fly.lookFrom(stand.from, stand.to);
      else {
        // No measured spawn (a campaign mission): `standOf` looks from off the map's extent. Open over its own ground
        // instead -- the disc's first slot, else the middle, else the hull's first floor (`./ground` `standingSpot`) --
        // a little above and behind a standing eye, looking across the floor.
        const mid = world.box.getCenter(new Vector3());
        const slot = opened.slots[0]?.position;
        const spot = opened.ground
          ? standingSpot(groundGrid(opened.ground), opened.ground, [...(slot ? [[slot[0], slot[2]] as [number, number]] : []), [mid.x, mid.z]])
          : null;
        if (spot) fly.lookFrom([spot[0], spot[1] + CAMPAIGN_EYE_UP, spot[2] + CAMPAIGN_EYE_BACK], [spot[0], spot[1] + 20, spot[2] - CAMPAIGN_EYE_BACK]);
        else fly.lookFrom(stand.from, stand.to);
      }
      overlays.place(world.box);
      overlays.placeSpawns(b.kind === 'map' ? spawnsFor(opened.name) ?? null : null, opened.slots);
      if (b.kind === 'map') {
        showContentOption(null);
        baseSel.value = b.archive;
      } else if (b.kind === 'content') {
        showContentOption(b, `Authored map · ${opened.name}`);
      }
    } else {
      const lib = map;
      charMap = lib;
      lighting.rig = null;
      // Its fog the built-from map's camera record's, as the match's (`./objectives` `blankFloorOf` keeps that camera);
      // a library with none, the stand-in. The layout's own colour and distance go over it (`applySettings`).
      if (!lib || !mapFog(fog, lib)) Object.assign(fog, { enabled: true, ...fogForExtent(4000), color: [...ELF_DEFAULT_FOGCOL], altitude: null });
      discFog = { ...fog, color: [...fog.color], altitude: fog.altitude ? { ...fog.altitude } : null };
      scene.add(floor);
      fly.setScale(lib?.metersPerUnit && lib.metersPerUnit > 0 ? lib.metersPerUnit : 0.1);
      fly.setClipPlanes(4, FLOOR_SIZE * 2);
      fly.lookFrom([0, 250, 600], [0, 0, 0]);
      showContentOption(null);
      baseSel.value = blankValue();
    }
    paletteSel.value = stem;
    entriesOfPalette = loadedPalette;
    paletteLoading = null;
    drawAssets();
    refreshMenuForPalette();
    refreshPlacementGround();
    mapDataSelected = null;                                    // a new base: the last map's item (`door:0` is another door)
    drawMapBillboards();                                       // the base's own data, on its floor
    applyView();
    refreshGameTypes();
    if (known || b.kind === 'map') creatorRemember(map);
    } };
  };
  const setBase = async (b: LayoutBase): Promise<void> => { const prepared = await prepareBase(b); try { prepared.commit(); } finally { prepared.dispose(); } };
  /** Browser adaptation: stage the actual editor objects, then one synchronous scene/history commit. */
  const prepareLayout = async (l: Layout, strict = false) => {
    const stagedBase = JSON.stringify(base) === JSON.stringify(l.base) ? null : await prepareBase(l.base);
    const staged: Object3D[] = [];
    let committed = false;
    const dispose = (): void => {
      if (!committed) for (const r of staged) (r.userData['dispose'] as (() => void) | undefined)?.();
      stagedBase?.dispose();
    };
    try {
    let missing = 0;
    // R3-B (FCW-07a part 2): every row's id, its own or its default (`layoutIds`), kept on its object (`layoutNow`).
    const ids = layoutIds(l);
    for (const [i, p] of l.pieces.entries()) {
      let r = await newPiece(p.asset, p.content).catch(() => null);
      if (!r) { if (strict && !p.content) throw new ForgeAgentError('ABSENT_ASSET', `${p.asset} has no geometry on this disc`); r = missingPiece(p.asset); missing++; }
      r.matrix.fromArray(p.m);
      r.matrix.decompose(r.position, r.quaternion, r.scale);
      if (p.locked) r.userData['forgeLock'] = true;
      r.userData['forgeId'] = ids.pieces[i];
      if (p.content) r.userData['forgeContent'] = JSON.parse(JSON.stringify(p.content)) as Piece['content'];   // a pack's piece: its reference kept
      staged.push(r);
    }
    for (const [i, sp] of l.spawns.entries()) {
      const r = spawnMarker(sp.team);
      r.position.set(...sp.p);
      r.rotation.y = sp.yaw;
      if (sp.locked) r.userData['forgeLock'] = true;
      r.userData['forgeId'] = ids.spawns[i];
      staged.push(r);
    }
    let npcAt = 0, siteAt = 0;
    for (const n of l.npcs ?? []) {
      if (strict && !(stagedBase?.map ?? charMap)?.types?.[n.side]?.[n.type]) throw new ForgeAgentError('ABSENT_ASSET', 'A character in this layout is not available on the base');
      const r = newNpc(n.side, n.type, stagedBase?.map ?? charMap);
      r.position.set(...n.p);
      r.rotation.y = n.yaw;
      if (n.locked) r.userData['forgeLock'] = true;
      r.userData['forgeId'] = ids.npcs?.[npcAt++];
      staged.push(r);
    }
    for (const [kind, list] of [['gate', l.gates], ['barrier', l.barriers]] as const) {
      for (const t of list ?? []) {
        const r = await newAccess(kind, t.source, t.name);
        r.position.set(...t.at);
        r.rotation.y = t.yaw;
        if (t.locked) r.userData['forgeLock'] = true;
        staged.push(r);
      }
    }
    for (const t of l.doors ?? []) {
      const r = await newDoor(t.source, t.name);
      r.position.set(...t.at);
      r.rotation.y = t.yaw;
      if (t.locked) r.userData['forgeLock'] = true;
      staged.push(r);
    }
    for (const t of l.turrets ?? []) {
      const r = await newTurret(t.source, t.name);
      r.position.set(...t.at);
      r.rotation.y = t.yaw;
      if (t.locked) r.userData['forgeLock'] = true;
      staged.push(r);
    }
    for (const f of l.flares ?? []) {
      const r = await newFlare(f.source, f.name);
      r.position.set(...f.at);
      if (f.locked) r.userData['forgeLock'] = true;
      staged.push(r);
    }
    for (const s of l.respawns ?? []) {
      const r = respawnMarker(s.team);
      r.position.set(...s.p);
      r.rotation.y = s.yaw;
      if (s.locked) r.userData['forgeLock'] = true;
      staged.push(r);
    }
    for (const t of l.tacPoints ?? []) {
      const r = newPoint(t.name, t.kind);
      r.position.set(...t.at);
      if (t.locked) r.userData['forgeLock'] = true;
      staged.push(r);
    }
    for (const v of l.scenicViews ?? []) {
      const r = newView(v.name, v.yaw, v.pitch);
      r.position.set(...v.at);
      if (v.locked) r.userData['forgeLock'] = true;
      staged.push(r);
    }
    for (const z of l.extractionZones ?? []) {
      const r = newZone(z.name, z.size[0], z.size[1]);
      r.position.set(...z.at);
      if (z.locked) r.userData['forgeLock'] = true;
      staged.push(r);
    }
    for (const h of l.hostages ?? []) {
      const r = hostageMarker();
      r.userData['forgeHostage'] = { ...(h.name ? { name: h.name } : {}), ...(h.character ? { character: h.character } : {}), ...(h.source ? { source: h.source } : {}) };
      r.position.set(...h.p);
      r.rotation.y = h.yaw;
      if (h.locked) r.userData['forgeLock'] = true;
      staged.push(r);
    }
    for (const m of markersOfBomb(l.objectives?.bomb)) {
      const r = bombMarker(m.kind);
      const markId = m.kind === 'start' ? ids.bomb : ids.sites?.[siteAt++];
      if (markId !== undefined) r.userData['forgeId'] = markId;
      r.position.set(...m.at);
      r.rotation.y = m.yaw;
      if (m.locked) r.userData['forgeLock'] = true;           // FG-49's lock, as a piece's
      // A site's file values (its reach, its own keys) ride the marker, so a save keeps them (the forge seat's low 2).
      if (m.kind !== 'start') r.userData['forgeBombFile'] = { range: m.range, elevation: m.elevation, ...(m.rest ? { rest: m.rest } : {}) };
      addSiteGuide(r);
      staged.push(r);
    }
    return { missing, dispose, commit: (): void => {
      committed = true;
      stagedBase?.commit();
    select(null);
    hiddenKeys = new Set(l.hidden ?? []);
    drawHidden();
    settings = settingsOf(l);                                // FG-24: the layout's settings, the panel with them
    applySettings();
    // FG-51: the layout's game type, kept even where it cannot play (shown so; ruling 4b), or the base's own.
    // No type named: the base map's own (`ownTypeOf`), or waiting on the mission list's read (`typePending`).
    authoredType = l.objectives?.gameType ?? ownTypeOf(l.base);
    typePending = authoredType === null;
    gameTypeSel.value = authoredType === null ? '' : String(authoredType);
    objectiveRest = l.objectives ? restOf(l.objectives, ['gameType', 'bomb']) : {};
    layoutRequires = (l.requires ?? []).map((p) => ({ ...p }));       // R3-B: the packs the layout declares, kept as they were
    layoutMode = l.mode ? JSON.parse(JSON.stringify(l.mode)) as RecordMode : null;
    // FCW-32: the rules entities and the rules, kept as they were
    layoutEntities = JSON.parse(JSON.stringify({ zones: l.zones, markers: l.markers, spawners: l.spawners })) as typeof layoutEntities;
    layoutRules = (l as ForgeLayout).rules ? JSON.parse(JSON.stringify((l as ForgeLayout).rules)) as ForgeRulesDraft : null;
    bombRest = bombRestOf(l.objectives?.bomb);              // never the start's lock: an unlock sticks (the review's medium)
    for (const r of [...roots]) removeRoot(r);
    layoutName = l.name ?? '';
    layoutNameIn.value = layoutName;
      for (const r of staged) addRoot(r);
      refreshPlacementGround();
      refreshGameTypes();
      drawRulesScene();                                       // FCW-32 step 4: the entities as opened, the panel told
      rulesChanged();
      lobbyTitle();
    } };
    } catch (e) { dispose(); throw e; }
  };
  const placeAll = async (l: Layout): Promise<number> => {
    const prepared = await prepareLayout(l);
    try { prepared.commit(); return prepared.missing; } finally { prepared.dispose(); }
  };
  /** An undo or a redo: the state's pieces put back (a state's base is the layout's: a new base resets the history). */
  const restore = (raw: string | null, word: string): void => {
    if (raw === null || busy) return;
    busy = true;
    busyCause = 'undo';
    const step = decodeHistoryStep(raw);
    void placeAll(parseForgeLayout(step.text)).then(() => {
      applyPicked(step.picked);
      changed();
      refreshUndo();
      agentChanged();
      pop(word);
    }).finally(() => { busy = false; });
  };
  // Busy (a restore, an open, a Play start) or playing: no step taken, so the history's pointer stays with the scene.
  const undo = (): void => { if (!refuseEdit()) restore(history.undo(busy || playing), 'Undone'); };
  const redo = (): void => { if (!refuseEdit()) restore(history.redo(busy || playing), 'Redone'); };
  /**
   * AX-15 (a browser adaptation, FG.R2): the agent's run undone -- the history's pointer moved past each of the agent's
   * top steps (one redo each), then the scene restored once, as a normal undo restores it; the words say how many and
   * why it stopped. A person's step is never undone.
   */
  const undoAgentRunNow = (sessionId?: string | null): AgentRunUndo => {
    if (refuseEdit()) return { undone: 0, stopped: 'busy', state: null, message: 'Edits are held now: no agent changes undone' };
    const out = undoAgentRun(history, sessionId, busy || playing);
    if (out.state !== null) restore(out.state, out.message);
    return out;
  };
  /** AX-15: one activity row's own step undone (the top steps while `match` holds), as a normal undo. */
  const undoWhileNow = (match: (meta: HistoryMeta) => boolean): number => {
    if (refuseEdit()) return 0;
    const out = undoWhile(history, match, busy || playing);
    if (out.state !== null) restore(out.state, 'Undone');
    return out.undone;
  };
  undoBtn.addEventListener('click', undo);
  redoBtn.addEventListener('click', redo);
  /**
   * The e2e-mega lost press (a browser adaptation, no original): one open at a time, in the order asked. An open asked while
   * another is under way (a file opened while the boot's first map still decodes) runs after it, so the one asked last is
   * the layout open -- never the earlier, slower one committing over it (`test/forge/pageFirstOpen.test.ts` (B)).
   */
  let opensAsked: Promise<unknown> = Promise.resolve();
  /**
   * LATER 818: an open the player asked (a file, a save, New, a base chosen) -- set at the ask, so a press made before the
   * boot asks its first open (while it reads the saves store or decodes a share code) is never replaced by the boot's.
   */
  let playerOpenAsked = false;
  const openLayout = (l: Layout, by: 'page' | 'player' = 'page'): Promise<void> => {
    if (by === 'player') playerOpenAsked = true;
    const run = opensAsked.then(() => openLayoutNow(l));
    opensAsked = run.catch(() => undefined);
    return run;
  };
  const openLayoutNow = async (l: Layout): Promise<void> => {
    const opening = bundleOfLayout.get(l) ?? null;                 // FP-6 item 3: this open's own bundle, or none
    busy = true;
    busyCause = 'open';
    const stem = l.base.kind === 'map' ? l.base.archive : null;
    showLoading(`Loading ${stem ? entries.find((a) => a.stem === stem)?.label ?? stem : l.base.kind === 'content' ? `the authored map ${l.base.mapId}` : 'the blank floor'}`);
    try {
      await setBase(l.base);
      markBundle(opening);
      const missing = await placeAll(l);
      if (l.camera) fly.setPose(l.camera);
      else if (applySavedViewCamera && viewCamera) fly.setPose(viewCamera);
      applySavedViewCamera = false;
      viewCamera = cameraNow();
      noteCamera();
      writeView();
      cameraReady = true;
      baseAsk.hidden = true;
      say(missing ? `${missing} piece${missing === 1 ? '' : 's'} not found on this disc` : 'layout open', missing > 0);
      noteMissingPacks();
      changed();
      history.reset(encodeHistoryStep(layoutText(), []));
      refreshUndo();
      agentChanged();
    } finally { busy = false; showLoading(null); }
  };

  // FP-6 item 6 (a test instrument, a development build's only; no game behaviour): `e2e/forgeCustomMaps.spec.ts` counts
  // the open base's own content props drawn (an authored map's, `baseContentProps`: each tagged `forgeContentKey`).
  if (import.meta.env.DEV) {
    (globalThis as { __forgeContentProps?: unknown }).__forgeContentProps = (): number => {
      let n = 0;
      baseContentProps?.traverse((o) => { if (typeof o.userData['forgeContentKey'] === 'string') n++; });
      return n;
    };
  }
  // LATER 141 (a test instrument, a development build's only; no game behaviour): `e2e/forgeHide.spec.ts` opens a map,
  // hides and shows a map prop's placement by its key as Hide and the outliner's Show do (FG-17), and reads the base
  // view's drawn line strips -- their summed segment length; a hidden placement's strips collapse onto a point
  // (`WorldView.setPlacementActive`).
  if (import.meta.env.DEV) {
    (globalThis as { __forgeHide?: unknown }).__forgeHide = {
      /** The page's own first map open and nothing loading: the spec opens its map after, never beside, the page's. */
      ready: (): boolean => base !== null && !busy,
      open: async (stem: string): Promise<void> => {
        for (let i = 0; busy && i < 100; i++) await new Promise((r) => setTimeout(r, 100));   // a load under way finishes first
        await openLayout(emptyLayout({ kind: 'map', archive: stem }));
      },
      keys: (model: string): string[] => {
        const out = new Set<string>();
        for (const p of baseMap?.props ?? []) if (p.modelName === model) for (let i = 0; i < p.matrices.length / 16; i++) {
          const found = baseMap ? placementOf(baseMap, model, p.matrices.subarray(i * 16, i * 16 + 16)) : null;
          if (found) out.add(found.key);
        }
        return [...out];
      },
      hide: (key: string): void => { hiddenKeys.add(key); drawHidden(); },
      show: (key: string): void => { hiddenKeys.delete(key); drawHidden(); },
      lineLength: (): number => {
        let n = 0;
        baseView?.group.traverse((o) => {
          if (!(o instanceof LineSegments)) return;
          const a = o.geometry.getAttribute('position');
          for (let i = 0; a && i + 1 < a.count; i += 2) n += Math.hypot(a.getX(i + 1) - a.getX(i), a.getY(i + 1) - a.getY(i), a.getZ(i + 1) - a.getZ(i));
        });
        return n;
      },
    };
  }

  /* ---------- picking ---------- */
  /** AX-13 (a browser adaptation): the agent facade's `notePoint`, set once the facade is built (`agentFacade` below). */
  let agentPointHook: ((point: [number, number, number] | null) => void) | null = null;
  const isUnder = (o: Object3D, g: Object3D): boolean => { for (let at: Object3D | null = o; at; at = at.parent) if (at === g) return true; return false; };
  const ray = new Raycaster();
  const shown = (o: Object3D): boolean => { for (let at: Object3D | null = o; at; at = at.parent) if (!at.visible) return false; return true; };
  /**
   * `only` (the Select tool's settings): `placed`, the user's placements alone -- the base map and the floor looked
   * through; `map`, the base map's own props alone -- the placements looked through.
   */
  const pick = (ndc: Vector2, only?: 'placed' | 'map'): Intersection | null => {
    ray.setFromCamera(ndc, fly.viewportCamera());
    if (only === 'placed') {
      return ray.intersectObjects(roots, true).find((h) => {
        const root = forgeRootOf(h.object);
        return shown(h.object) && !!root && root !== replacing?.r && !lockedOf(root);
      }) ?? null;
    }
    if (only === 'map') return baseView ? ray.intersectObjects([baseView.group], true).find((h) => shown(h.object)) ?? null : null;
    const targets: Object3D[] = [...roots];
    if (baseView) targets.push(baseView.group);
    if (floor.parent) targets.push(floorPlane);
    // FG-49: a locked placement is skipped, so the click lands on whatever is behind it.
    return ray.intersectObjects(targets, true).find((h) => {
      if (!shown(h.object)) return false;
      const root = forgeRootOf(h.object);
      if (root && root === replacing?.r) return false;          // a prop being re-placed: the cursor looks past it
      return !root || !lockedOf(root);
    }) ?? null;
  };
  /** The hull under the cursor (`./placement` `restingPoint`): snap on x/z, then the probe's surface. */
  /**
   * A bomb marker's point (the owner, 2026-11-06; a browser adaptation, FG.R2): the higher of the resting point
   * (`placeAt`: the collision under the click) and the drawn surface the click struck. A placed building's drawn floor can
   * stand over its hull (Crossroads' gazebo, a house's slab on the blank floor), and a site seated on the hull under it
   * hides its outline beneath that floor; on the drawn floor it shows, its reach measured from a point a slab's thickness
   * over the feet on the hull -- well inside its Elevation. An unseen pick box (a marker's) is no drawn surface.
   */
  const onDrawnTop = (at: Vector3, hit: Intersection | null): Vector3 => {
    const mat = (hit?.object as Partial<Mesh> | undefined)?.material as Material | Material[] | undefined;
    const drawn = hit && mat && !(Array.isArray(mat) ? mat.every((m) => m.visible === false) : mat.visible === false);
    if (drawn && hit.point.y > at.y) at.y = hit.point.y;
    return at;
  };
  const placeAt = (hit: Intersection | null): Vector3 => {
    const raw = hit ? hit.point : ray.ray.at(300, new Vector3());
    const probe = (x: number, z: number): number[] => (placementGrid ? surfaceYs(placementGrid, x, z) : []);
    const p: PlacePoint = restingPoint({ x: raw.x, y: raw.y, z: raw.z }, probe, snap ? gridStep : null);
    return new Vector3(p.x, p.y, p.z);
  };
  /** The cursor's last place, in normalized device coordinates: a paste lands there. The centre until the pointer moves. */
  let lastNdc = new Vector2(0, 0);
  let ghost: Object3D | null = null;
  let ghostAsset: string | null = null;
  let ghostToken = 0;
  const clearGhost = (): void => {
    if (ghost) { scene.remove(ghost); disposeGhost(ghost); ghost = null; }
    ghostAsset = null;
    delete input.dataset['ghost'];
  };
  const moveGhost = (ndc: Vector2): void => {
    if (replacing) {
      // The prop being re-placed is its own ghost: on the surface under the cursor, its turn kept.
      if (!roots.includes(replacing.r)) { replacing = null; return; }   // gone meanwhile (an undo, a delete)
      seatOn(replacing.r, placeAt(pick(ndc)));
      refreshBox();
      return;
    }
    if (!ghost) return;
    const struck = pick(ndc);
    const at = mode === 'bomb' || mode === 'siteSeal' || mode === 'siteTerrorist' ? onDrawnTop(placeAt(struck), struck) : placeAt(struck);
    ghost.rotation.y = ghostYaw();
    seatOn(ghost, at);
    ghost.visible = true;
    paintGhost(ghost, shellState().canPlace);                     // R3-B: a staged drop's ghost takes the same tint
  };
  /**
   * Every placing tool but Select (the owner, 2026-11-06): a click places, a drag moves the selection's gizmo, as the
   * Place tool's; and it previews what it places under the cursor (`syncGhost`).
   */
  function placingTool(): boolean { return mode !== 'select'; }
  /** The ghost's turn: the Place tool's wheel; the tools that face the camera's way, that; a door, a zone, a point none. */
  function ghostYaw(): number {
    if (mode === 'place') return placementYaw();
    // A plant site starts square (the owner, 2026-11-06): its outline then lies square to the world (`./siteOutlines`).
    const own = mode === 'door' || mode === 'gate' || mode === 'barrier' || mode === 'zone' || mode === 'point' || mode === 'flare'
      || mode === 'siteSeal' || mode === 'siteTerrorist' ? 0 : facing();
    return own + (wheelTurns(mode) ? (toolTurn * Math.PI) / 180 : 0);
  }
  /**
   * What a placing tool other than Place would place, built as it builds it (its marker, or its disc model), and the key
   * it is known by -- the ghost rebuilt only when that changes; null for a tool with nothing to preview (a view: placed
   * at the camera).
   */
  async function toolGhostSource(): Promise<{ key: string; source: Object3D } | null> {
    switch (mode) {
      case 'spawnA': case 'spawnB': return { key: mode, source: spawnMarker(mode === 'spawnA' ? 'A' : 'B') };
      case 'respawnA': case 'respawnB': return { key: mode, source: respawnMarker(mode === 'respawnA' ? 'A' : 'B') };
      case 'npc': return npcChoice ? { key: `npc:${npcChoice.side}:${npcChoice.type}`, source: newNpc(npcChoice.side, npcChoice.type) } : null;
      case 'hostage': return { key: 'hostage', source: hostageMarker() };
      case 'zone': return { key: 'zone', source: newZone('Safety', EXTRACTION_ZONE_SIZE, EXTRACTION_ZONE_SIZE) };
      case 'point': return { key: 'point', source: newPoint('Point', 1) };
      case 'bomb': case 'siteSeal': case 'siteTerrorist':
        return { key: mode, source: bombMarker(mode === 'bomb' ? 'start' : mode === 'siteSeal' ? 'seal' : 'terrorist') };
      case 'door': { const d = await defaultDoor(); return d ? { key: `door:${d.source}:${d.name}`, source: await newDoor(d.source, d.name) } : null; }
      case 'turret': { const t = await defaultTurret(); return t ? { key: `turret:${t.source}:${t.name}`, source: await newTurret(t.source, t.name) } : null; }
      case 'gate': case 'barrier': { const k = mode; const a = await defaultAccess(k); return a ? { key: `${k}:${a.source}:${a.name}`, source: await newAccess(k, a.source, a.name) } : null; }
      case 'ladder': { const a = await defaultLadder(); const r = a ? await newPiece(a) : null; return a && r ? { key: `ladder:${a}`, source: r } : null; }
      case 'flare': { const f = await defaultFlare(); return f ? { key: `flare:${f.source}:${f.name}`, source: await newFlare(f.source, f.name) } : null; }
      default: return null;
    }
  }
  /** FG-5: the chosen prop, translucent, on the hull under the cursor; every other placing tool's placement alike. */
  const syncGhost = (): void => {
    const token = ++ghostToken;
    if (replacing && mode === 'place' && !playing) { clearGhost(); moveGhost(lastNdc); return; }   // the prop itself follows
    if (mode !== 'place' && mode !== 'select' && !playing) {
      const was = mode;
      void toolGhostSource().then((made) => {
        if (token !== ghostToken || mode !== was) return;
        if (!made) { clearGhost(); return; }
        if (ghost && ghostAsset === made.key) { moveGhost(lastNdc); input.dataset['ghost'] = mode; return; }
        if (ghost) { scene.remove(ghost); disposeGhost(ghost); }
        ghost = ghostOf(made.source);
        ghostAsset = made.key;
        scene.add(ghost);
        moveGhost(lastNdc);
        input.dataset['ghost'] = mode;
      }, () => { if (token === ghostToken) clearGhost(); });
      return;
    }
    if (mode !== 'place' || !chosen || playing) { clearGhost(); return; }
    const asset = chosen;
    if (ghost && ghostAsset === asset) { moveGhost(lastNdc); input.dataset['ghost'] = '1'; return; }
    void newPiece(asset).then((src) => {
      if (token !== ghostToken) { if (src?.userData['dispose']) (src.userData['dispose'] as () => void)(); return; }
      if (!src || mode !== 'place' || chosen !== asset) return;
      if (ghost) { scene.remove(ghost); disposeGhost(ghost); }
      ghost = ghostOf(src);
      ghostAsset = asset;
      scene.add(ghost);
      moveGhost(lastNdc);
      input.dataset['ghost'] = '1';
    });
  };
  /** Turned to face away from the camera, so a piece or a marker is placed as the builder looks. */
  const facing = (): number => { const d = fly.viewportCamera().getWorldDirection(new Vector3()); return Math.atan2(-d.x, -d.z); };
  /** The placement's turn as the pad's ghost takes it: the facing, on the turn step when snap is on (R3-B: a drop's too). */
  const placementYaw = (): number => (snap ? snapYawRadians(facing(), turnStep) : facing())
    + (mode === 'place' ? (queuedTurn * Math.PI) / 180 : 0);   // FUI-22 (D4): the queued prop's wheel turn on top
  /**
   * FCW-32 step 4 (FUI.R23 D4; a browser adaptation): the place mode for a rules entity (the Rules panel's Place rows, the
   * START menu's) -- the Select tool's next click on the world, or Cross at the centre, places it there as the planner's
   * `zone.place` / `marker.place` / `spawner.place` through the person's facade, its id the first `<kind><n>` free.
   */
  const startEntityPlace = (kind: RulesEntityKind): void => {
    if (refuseEdit()) return;
    setMode('select');
    entityTool = kind;
    input.classList.add('is-placing');
    refreshHint();
    rulesChanged();
    say(`placing a ${kind}: click the world, or Cross at the centre · Esc cancels`);
  };
  const endEntityPlace = (): void => {
    entityTool = null;
    input.classList.toggle('is-placing', mode !== 'select');
    refreshHint();
    rulesChanged();
  };
  const placeEntity = (kind: RulesEntityKind, p: Vector3): void => {
    endEntityPlace();
    const l = layoutNow(false);
    const used = l ? [...l.pieces.map((x) => x.id), ...l.spawns.map((x) => x.id), ...(l.npcs ?? []).map((x) => x.id), l.ids?.bomb, ...(l.ids?.sites ?? []),
      ...rulesEntityRefs().map((e) => e.ref.slice(e.ref.indexOf(':') + 1))].filter((x): x is string => typeof x === 'string') : [];
    const id = freshEntityId(kind, used);
    const at = [p.x, p.y, p.z].map((n) => Math.round(n * 10) / 10) as [number, number, number];
    const yaw = facing();
    const { zoneRadius, zoneHeight, spawnerSource, spawnerTeam, spawnerRadius } = RULES_PLACE_DEFAULTS_ADAPTATION;
    const args = kind === 'zone' ? { id, shape: 'cylinder', at, radius: zoneRadius, height: zoneHeight }
      : kind === 'marker' ? { id, at, yaw } : { id, source: spawnerSource, team: spawnerTeam, at, yaw, radius: spawnerRadius };
    void personForge.execute(`${kind}.place`, args, personForge.status().revision).then((r) => {
      if (r.ok) say(`${RULES_ENTITY_WORD[kind]} ${id} placed`);
      else notifier.refused(r.message ?? r.code ?? 'Refused');
    });
  };
  /** At the centre or the pointer: select, or place; `toggle` (FG-47: Shift / Ctrl, Cross held) adds or takes out, in any tool. */
  const act = (ndc: Vector2, toggle = false): void => {
    if (busy) return;
    const hit = pick(ndc);
    agentPointHook?.(hit ? [hit.point.x, hit.point.y, hit.point.z] : null);   // AX-13: the agent's forge.focus reads this pick
    // A re-placed prop: a click puts it down where it follows the cursor (a modified click changes nothing meanwhile).
    if (replacing) { if (!toggle && !refuseEdit()) commitReplace(placeAt(hit)); return; }
    if (entityTool !== null && !toggle) { placeEntity(entityTool, placeAt(hit)); return; }   // FCW-32 step 4 (D4)
    if (mode === 'select' || toggle) {
      // The Select tool's settings: a kind switched off is looked through -- map props off, a click finds the placements
      // behind the map; user props off, the map behind the placements; both off, nothing.
      const chose = selectMapProps && selectUserProps ? hit : selectUserProps ? pick(ndc, 'placed') : selectMapProps ? pick(ndc, 'map') : null;
      // A map data billboard, when it is the nearest thing under the cursor (one behind a wall is not drawn, so not
      // picked), is the map's own data selected (read only); under the same setting as the map's props.
      if (!toggle) {
        const mark = mapBillboards.pick(ray);
        const userRoot = mark ? rootOfUserMark(mark.key) : null;
        // A user placement's mark (square) under "Select user props"; the map's own (round) under "Select map props".
        const allowed = mark && (userRoot ? selectUserProps : selectMapProps);
        if (mark && allowed && mark.distance <= (chose?.distance ?? Infinity)) {
          if (userRoot) { select(userRoot); return; }               // a user mark: its placement selected, as a click on it
          // A map prop's mark (M) selects the prop itself, as a click on it does; any other, the map data item.
          const propKey = placementOfMark(mark.key);
          const found = propKey ? mapPropPlacements().find(({ placement }) => placement.key === propKey) : undefined;
          if (found) selectMapProp(found.placement, found.model);
          else if (!propKey && !mark.key.startsWith('user:')) selectMapData(mark.key);
          return;
        }
      }
      const root = forgeRootOf(chose?.object ?? null);
      if (selectMapProps && !root && chose && baseMap && baseView && isUnder(chose.object, baseView.group)) {
        // FG-17: one of the map's own props -- its placement by model and place (`./hide` `placementOf`).
        const o = chose.object as Mesh;
        const model = o.name.replace(/ \((lod|flare)\)$/, '');
        const m = new Matrix4();
        if (o instanceof InstancedMesh && chose.instanceId !== undefined) { o.getMatrixAt(chose.instanceId, m); m.premultiply(o.matrixWorld); }
        else m.copy(o.matrixWorld);
        const found = placementOf(baseMap, model, m.elements);
        if (found) {
          const b: BaseProp = { ...found, model, object: o, instance: o instanceof InstancedMesh && chose.instanceId !== undefined ? chose.instanceId : null, matrix: m, box: basePropBox(o, m) };
          if (toggle) basePicks.toggle(b);
          else { picks.clear(); basePicks.only(b); }
          showSelection();
          return;
        }
      }
      if (toggle) { if (root) { picks.toggle(root); showSelection(); } return; }   // nothing there: the selection as it was
      select(root);
      return;
    }
    if (refuseEdit()) return;                                 // FG-26: placing is an edit
    const at = placeAt(hit);
    if (mode === 'spawnA' || mode === 'spawnB') {
      const team = mode === 'spawnA' ? 'A' : 'B';
      personEdit('spawn.place', { team }, () => {
        const before = selectionIds();
        const r = spawnMarker(team);
        r.rotation.y = ghostYaw();
        seatOn(r, at);
        addRoot(r);
        select(r);
        say(`spawn ${r.userData['forgeSpawn'] as string} placed`);
        edit(before);
      }, true);
      return;
    }
    if (mode === 'respawnA' || mode === 'respawnB') {
      const team = mode === 'respawnA' ? 'A' : 'B';
      personEdit('respawn.place', { team }, () => {
        const before = selectionIds();
        const r = respawnMarker(team);
        r.rotation.y = ghostYaw();
        seatOn(r, at);
        addRoot(r);
        select(r);
        say(`respawn point ${team} placed`);
        edit(before);
      }, true);
      return;
    }
    if (mode === 'npc') {
      if (!npcChoice) { showChars = true; drawAssets(); notifier.refused('choose a character under Characters first'); return; }
      const who = npcChoice;
      personEdit('npc.place', { side: who.side, type: who.type }, () => {
        const before = selectionIds();
        const r = newNpc(who.side, who.type);
        r.rotation.y = ghostYaw();
        seatOn(r, at);
        addRoot(r);
        select(r);
        say(`NPC placed: ${charLabel(who.side, who.type)}`);
        edit(before);
      }, true);
      return;
    }
    if (mode === 'door') {
      // A copy of a disc door, its hinge at the click, in its own turn (any game type): the palette's archive's first
      // door, else Frostfire's bdoor_4 (`DEFAULT_DOOR`); the Inspector's Model changes it, the rotate gizmo turns it.
      const yaw = ghostYaw();
      void defaultDoor().then((which) => {
        if (!which) { notifier.refused("No door to copy: the palette's archive has none, nor Frostfire (MP2) on this disc"); return; }
        personEdit('door.place', {}, (step) => void newDoor(which.source, which.name).then((r) => {
          const before = selectionIds();
          r.rotation.y = yaw;
          seatOn(r, at);
          addRoot(r);
          select(r);
          say(`${doorLabel(r)} placed: a copy of the disc's door`);
          edit(before, step);
        }), true);
      });
      return;
    }
    if (mode === 'gate' || mode === 'barrier') {
      // A copy of a disc map's access object at the click (any game type): the palette archive's first of its kind, else
      // Death Trap's or Vigilance's access1 (`DEFAULT_GATE`, `DEFAULT_BARRIER`); the Inspector's Map changes it.
      const kind = mode;
      const yaw = ghostYaw();
      void defaultAccess(kind).then((which) => {
        if (!which) { notifier.refused(kind === 'gate' ? 'No gate to copy: neither Death Trap (MP11) nor Enowapi (MP62) is on this disc' : "No C4 barrier to copy: the palette's archive has none, nor Vigilance (MP51) on this disc"); return; }
        personEdit(kind === 'gate' ? 'gate.place' : 'barrier.place', {}, (step) => void newAccess(kind, which.source, which.name).then((r) => {
          const before = selectionIds();
          r.rotation.y = yaw;
          seatOn(r, at);
          addRoot(r);
          select(r);
          say(`${accessLabel(r)} placed${kind === 'gate' ? ': its lever at the gate, C4 wrecks it' : ': C4 or an RPG wrecks it'}`);
          edit(before, step);
        }), true);
      });
      return;
    }
    if (mode === 'flare') {
      // A copy of a disc glow at the click (any game type): the palette's archive's first, else the base map's own
      // (`defaultFlare`); the Inspector's Map and Flare change it.
      void defaultFlare().then((which) => {
        if (!which) { notifier.refused("No flare to copy: neither the palette's archive nor this base has a facade node"); return; }
        personEdit('flare.place', { source: which.source, name: which.name }, (step) => void newFlare(which.source, which.name).then((r) => {
          const before = selectionIds();
          seatOn(r, at);
          addRoot(r);
          select(r);
          say(`Flare ${which.name} placed: a copy of the disc's glow, turned to the camera`);
          edit(before, step);
        }), true);
      });
      return;
    }
    if (mode === 'ladder') {
      // A disc ladder prop at the click, facing the way the camera looks (any game type): the palette's archive's first
      // ladder prop, else Sandstorm's ladder35 (`DEFAULT_LADDER`); the Inspector's Map and Ladder change it.
      const yaw = ghostYaw();
      void defaultLadder().then((asset) => {
        if (!asset) { notifier.refused("No ladder to place: the palette's archive has no ladder prop, nor Sandstorm (MP73) on this disc"); return; }
        const before = selectionIds();
        personEdit('piece.place', { asset }, (step) => void newPiece(asset).then((r) => {
          if (!r) { say(`${asset} has no geometry to place`, true); return; }
          r.rotation.y = yaw;
          seatOn(r, at);
          addRoot(r);
          select(r);
          say(`Ladder ${parseAssetId(asset)?.model ?? asset} placed: a disc ladder prop, climbable in Play`);
          edit(before, step);
        }), true);
      });
      return;
    }
    if (mode === 'turret') {
      // A copy of a disc turret at the click, facing the way the camera looks (any game type): the palette's own
      // archive's first turret, else Crossroads' RMG (`DEFAULT_TURRET`); the Inspector's Model changes it.
      const yaw = ghostYaw();
      void defaultTurret().then((which) => {
        if (!which) { notifier.refused("No turret to copy: the palette's archive has none, nor Crossroads (MP72) on this disc"); return; }
        personEdit('turret.place', {}, (step) => void newTurret(which.source, which.name).then((r) => {
          const before = selectionIds();
          r.rotation.y = yaw;
          seatOn(r, at);
          addRoot(r);
          select(r);
          say(`${turretLabel(r)} placed: a copy of the disc's turret`);
          edit(before, step);
        }), true);
      });
      return;
    }
    if (mode === 'point' || mode === 'view') {
      // A tactical point at the click; a spectator view at the camera itself, looking as it looks (any game type).
      const isView = mode === 'view';
      personEdit(isView ? 'view.place' : 'point.place', {}, () => {
        const before = selectionIds();
        const pose = fly.pose();
        const r = isView ? newView(nextViewName(pointNamesTaken('view')), pose.yaw, pose.pitch) : newPoint(nextNavName(pointNamesTaken('point')), 1);
        if (isView) r.position.set(pose.x, pose.y, pose.z); else seatOn(r, at);
        addRoot(r);
        select(r);
        say(`${pointNameOf(r)} placed: a ${isView ? 'spectator view' : 'tactical point'}, beside the map's own`);
        edit(before);
      }, true);
      return;
    }
    if (mode === 'zone') {
      // Placed extraction zones play in Extraction only (the owner, 2026-11-05): another type, the player is told.
      if (authoredType !== 3 && authoredType !== 4) { notifier.refused('Safety zones play in Escort or Extraction: set the game type first (World tab, Settings)'); return; }
      personEdit('extraction.place', {}, () => {
        const before = selectionIds();
        const r = newZone(nextSafetyName(zoneNamesTaken()), EXTRACTION_ZONE_SIZE, EXTRACTION_ZONE_SIZE);
        seatOn(r, at);
        addRoot(r);
        select(r);
        say(`${zoneNameOf(r)} placed: ${authoredType === 3 ? 'an escort' : 'an extraction'} zone, beside the map's own`);
        edit(before);
      }, true);
      return;
    }
    if (mode === 'hostage') {
      // Placed hostages play in Escort and Extraction only (the owner, 2026-11-05): another type, the player is told.
      if (!hostagesPlayIn(authoredType ?? undefined)) { notifier.refused('Hostages play in Escort or Extraction: set the game type first (World tab, Settings)'); return; }
      personEdit('hostage.place', {}, () => {
        const before = selectionIds();
        const r = hostageMarker();
        // The disc's pattern, Hostage1...; on a base with no hostage of its own, the default character lent (`hostageDefault`).
        const homeChars = ((baseMap ?? charMap)?.escortees ?? []).map((e) => e.character);
        r.userData['forgeHostage'] = { name: nextHostageName(hostageNamesTaken()), ...hostageDefault(homeChars, (stem) => absent.has(stem)) };
        r.rotation.y = ghostYaw();
        seatOn(r, at);
        addRoot(r);
        select(r);
        say(`${hostageOf(r).name ?? 'Hostage'} placed, beside the map's own`);
        edit(before);
      }, true);
      return;
    }
    if (mode === 'bomb' || mode === 'siteSeal' || mode === 'siteTerrorist') {
      const kind: BombMarkerKind = mode === 'bomb' ? 'start' : mode === 'siteSeal' ? 'seal' : 'terrorist';
      // The bomb and its sites play in Demolition, the start and the SEALs' site in Breach too (the owner, 2026-11-05/06;
      // `./objectives` `bombMarkerPlaysIn`, the agent's `bomb.place` alike): another type, the player is told to change it.
      if (!bombMarkerPlaysIn(kind, authoredType)) { notifier.refused('The bomb plays in Demolition (and its start and the SEALs\' site in Breach): set the game type first (World tab, Settings)'); return; }
      // One start, and one site a planting team: a new one replaces every marker of its kind (a file may name two).
      const prevs = roots.filter((r) => bombKindOf(r) === kind);
      // A lock means "don't change this" (the merge controller's call, 2026-10-22): never a silent removal.
      if (prevs.some(lockedOf)) { notifier.refused(`the locked ${kind === 'start' ? 'start' : 'site'} stays: unlock it first`); return; }
      personEdit('bomb.place', { kind }, () => {
        const before = selectionIds();
        for (const p of prevs) removeRoot(p);
        const r = bombMarker(kind);
        addSiteGuide(r);
        r.rotation.y = ghostYaw();
        seatOn(r, onDrawnTop(at.clone(), hit));
        addRoot(r);
        select(r);
        say(`${bombLabel(kind)} placed${prevs.length > 1 ? ` · the ${prevs.length} earlier ones replaced` : ''}`);
        edit(before);
      }, true);
      return;
    }
    if (!chosen) { notifier.refused('choose a prop in the assets first'); return; }   // FUI.R19: a refusal, the toast and the line
    const asset = chosen;
    const before = selectionIds();
    // FUI-6: the placement's entry; the piece builds asynchronously, so its edit names the operation's step itself.
    personEdit('piece.place', { asset }, (step) => {
      void newPiece(asset).then((r) => {
        if (!r) { say(`${asset} has no geometry to place`, true); return; }
        r.rotation.y = placementYaw();                          // FUI-22 (D4): the ghost's turn, the wheel's with it
        seatOn(r, at);                                          // its box's bottom on the surface, as the ghost's
        addRoot(r);
        select(r);
        say(`placed ${asset}`);
        edit(before, step);
        moveGhost(lastNdc);
      }, (e: unknown) => say(String(e), true));
    }, true);
  };

  /* ---------- the input ---------- */
  const ndcOf = (e: PointerEvent): Vector2 => {
    const r = input.getBoundingClientRect();
    return new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  };
  input.addEventListener('contextmenu', (e) => e.preventDefault());
  /** The pointer's last place: Play stands under it when the camera has no floor (FG-50). */
  let pointerClient: { x: number; y: number } | null = null;
  /**
   * FG-5: Place mode, a press that begins on the gizmo. The gizmo would take the click (the new piece is selected, so
   * its gizmo sits under the cursor). A click still places; a drag past the slop is handed to the gizmo (`./placement`
   * `placeClickKind`). Capture runs before the gizmo's own pointerdown, which does not stop the event.
   */
  type GizmoPointer = { x: number; y: number; button: number };
  const gizmoPointer = gizmo as TransformControls & {
    pointerHover(p: GizmoPointer): void;
    pointerDown(p: GizmoPointer): void;
    pointerMove(p: GizmoPointer): void;
    pointerUp(p: GizmoPointer): void;
  };
  let placeHold: { x: number; y: number; pointerId: number; nx: number; ny: number; drag: boolean } | null = null;
  const ndcToPointer = (e: PointerEvent, button: number): GizmoPointer => {
    const n = ndcOf(e);
    return { x: n.x, y: n.y, button };
  };
  input.addEventListener('pointerdown', (e) => {
    duplicateModifierOnPointerDown = e.button === 0 && e.ctrlKey;
  }, true);
  input.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !placingTool() || playing || gizmo.dragging || gizmo.axis === null) return;
    const focused = doc.activeElement;
    if (focused instanceof HTMLElement) focused.blur();
    const n = ndcOf(e);
    lastNdc = n;
    placeHold = { x: e.clientX, y: e.clientY, pointerId: e.pointerId, nx: n.x, ny: n.y, drag: false };
    try { input.setPointerCapture(e.pointerId); } catch { /* the release still arrives over the viewport */ }
    e.stopImmediatePropagation();
  }, true);
  input.addEventListener('pointerdown', (e) => {
    pointerClient = { x: e.clientX, y: e.clientY };
    const focused = doc.activeElement;
    if (focused instanceof HTMLElement) focused.blur();             // the keys go to the camera again
    // The captured mouse's look: the editor's in every build (OT.R68; OT.R38 a development build's elsewhere).
    if (e.button === 2) { if (import.meta.env.DEV) mouseSite('s2u-mouse-pointer-lock'); lockMouse(canvas); return; }   // OT.R68
    if (e.button !== 0 || gizmo.dragging) return;
    if (!placingTool() && gizmo.axis !== null) return;   // Select: the gizmo's own drag. A placing tool: a click places.
    lastNdc = ndcOf(e);
    const add = e.shiftKey || e.ctrlKey || e.metaKey;           // FG-47: a pointer's modifiers, read off the click (no key listener)
    if (mode === 'select' && !busy) {
      // FG-47: on a placement, at once as before (Shift / Ctrl adds or takes out); on none, a box if the pointer drags,
      // else a click at its release (a map prop, or nothing: deselect).
      const ndc = ndcOf(e);
      if (selectUserProps && forgeRootOf(pick(ndc)?.object ?? null)) { act(ndc, add); return; }   // user props off: a box, as on nothing
      boxDrag = { x: e.clientX, y: e.clientY, ndc, add, drawn: false };
      // FG-47 (the review's F3): the pointer captured, so the release ends the box wherever it lands (a dock, the lobby's
      // window), not only over the viewport -- the gizmo's own capture is off while a lobby locks the edits.
      try { input.setPointerCapture(e.pointerId); } catch { /* a pointer the page cannot capture: the box ends at its own pointerup */ }
      return;
    }
    act(lastNdc);
  });
  /** FG-47: a left-drag begun on no placement in the Select tool: its start, and whether the box shows yet. */
  let boxDrag: { x: number; y: number; ndc: Vector2; add: boolean; drawn: boolean } | null = null;
  /** The pointer moved this far (CSS pixels) is a drag, not a click (the forge's own). */
  const BOX_DRAG_PX = 4;
  const drawMarquee = (e: PointerEvent): void => {
    if (!boxDrag) return;
    const r = viewport.getBoundingClientRect();
    marquee.style.left = `${Math.min(boxDrag.x, e.clientX) - r.left}px`;
    marquee.style.top = `${Math.min(boxDrag.y, e.clientY) - r.top}px`;
    marquee.style.width = `${Math.abs(e.clientX - boxDrag.x)}px`;
    marquee.style.height = `${Math.abs(e.clientY - boxDrag.y)}px`;
    marquee.hidden = false;
  };
  input.addEventListener('pointermove', (e) => {
    pointerClient = { x: e.clientX, y: e.clientY };
    if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
      lastNdc = ndcOf(e);
      if (placingTool() && !playing && !placeHold?.drag) moveGhost(lastNdc);
    }
    const h = placeHold;
    if (h && h.pointerId === e.pointerId) {
      if (!h.drag && placeClickKind(Math.hypot(e.clientX - h.x, e.clientY - h.y), true) === 'gizmo') {
        h.drag = true;
        const start = { x: h.nx, y: h.ny, button: 0 };
        gizmoPointer.pointerHover(start);
        gizmoPointer.pointerDown(start);
      }
      if (h.drag) gizmoPointer.pointerMove(ndcToPointer(e, -1));
    }
    if (!boxDrag) return;
    if (!boxDrag.drawn && Math.hypot(e.clientX - boxDrag.x, e.clientY - boxDrag.y) < BOX_DRAG_PX) return;
    boxDrag.drawn = true;
    drawMarquee(e);
  });
  input.addEventListener('pointerup', (e) => {
    const h = placeHold;
    if (h && h.pointerId === e.pointerId && e.button === 0) {
      placeHold = null;
      if (h.drag) { if (gizmo.dragging) gizmoPointer.pointerUp(ndcToPointer(e, 0)); }
      else act(new Vector2(h.nx, h.ny));
    }
    const d = boxDrag;
    boxDrag = null;
    marquee.hidden = true;
    if (!d || e.button !== 0) return;
    if (!d.drawn) { act(d.ndc, d.add); return; }
    // The user placements and visible map-prop bounds whose screen positions lie inside the box (`./group` `inRect`).
    const end = ndcOf(e);
    const camera = fly.viewportCamera();
    camera.updateMatrixWorld();
    // The Select tool's settings: a kind switched off is left out of the box.
    const shownRoots = selectUserProps ? roots.filter((r) => shown(r) && !lockedOf(r)) : [];
    const ndcs = shownRoots.map((r) => { const v = r.getWorldPosition(new Vector3()).project(camera); return [v.x, v.y, v.z] as Vec3; });
    const inBox = inRect(ndcs, [d.ndc.x, d.ndc.y], [end.x, end.y]).map((i) => shownRoots[i]!);
    const mapCandidates = !selectMapProps ? [] : mapPropPlacements().flatMap(({ placement, model }) => {
      if (hiddenKeys.has(placement.key)) return [];
      const prop = resolveMapProp(placement, model);
      if (!prop || !shown(prop.object)) return [];
      if (prop.instance !== null) {
        const matrix = new Matrix4();
        (prop.object as InstancedMesh).getMatrixAt(prop.instance, matrix);
        if (Math.abs(matrix.determinant()) < 1e-12) return [];
      }
      const centre = prop.box.getCenter(new Vector3()).project(camera);
      return [[prop, [centre.x, centre.y, centre.z] as Vec3] as const];
    });
    const mapInBox = inRect(mapCandidates.map(([, point]) => point), [d.ndc.x, d.ndc.y], [end.x, end.y])
      .map((i) => mapCandidates[i]![0]);
    if (!d.add) { picks.clear(); basePicks.clear(); }
    picks.addAll(inBox);
    basePicks.addAll(mapInBox);
    showSelection();
    say(`${inBox.length + mapInBox.length} in the box · ${picks.size + basePicks.size} selected`);
  });
  input.addEventListener('pointercancel', (e) => {
    if (placeHold && placeHold.pointerId === e.pointerId) {
      if (placeHold.drag && gizmo.dragging) gizmoPointer.pointerUp({ x: placeHold.nx, y: placeHold.ny, button: 0 });
      placeHold = null;
    }
    boxDrag = null;
    marquee.hidden = true;
  });
  input.addEventListener('wheel', (e) => {
    e.preventDefault();
    // FUI-22 (D4, a browser adaptation): a prop queued to place, the wheel turns it -- one turn step a notch, up to the
    // left as the pad's turn -- and the camera keeps its speed; with nothing queued the wheel is the camera's as before.
    if (mode === 'place' && (chosen || replacing) && !playing) {
      wheelTravel += e.deltaMode === 0 ? e.deltaY : e.deltaY * WHEEL_LINE_PX;
      if (Math.abs(wheelTravel) < WHEEL_NOTCH_PX) return;
      const up = wheelTravel < 0;
      wheelTravel = 0;
      turnQueued(up ? turnStep : -turnStep);
      return;
    }
    // Every other placing tool's object alike: its ghost turned a turn step a notch, the next placed so.
    if (wheelTurns(mode) && !playing) {
      wheelTravel += e.deltaMode === 0 ? e.deltaY : e.deltaY * WHEEL_LINE_PX;
      if (Math.abs(wheelTravel) < WHEEL_NOTCH_PX) return;
      const up = wheelTravel < 0;
      wheelTravel = 0;
      toolTurn = (((toolTurn + (up ? turnStep : -turnStep)) % 360) + 360) % 360;
      moveGhost(lastNdc);
      const shown = toolTurn > 180 ? toolTurn - 360 : toolTurn;
      say(`${TOOL_NAMES[mode]} · turned ${shown}° · the wheel turns it ${turnStep}°`);
      return;
    }
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: e.deltaY, deltaMode: e.deltaMode, cancelable: true }));
  }, { passive: false });
  // The keys (OT.R68, the owner 2026-10-21: keyboard and mouse for everything in the forge's creation UI, not once its
  // matches have started): the editor's map (`./keys`) in every build, never a match's. A browser adaptation. The build
  // test's marker (OT.R29's `s2u-kb-forge`) and the Play match's P / Esc out stay a development build's.
  if (import.meta.env.DEV) keyboardSite('s2u-kb-forge');
  /** The page's state as the key map reads it (`./keys`). */
  const keyState = (): ForgeKeyState => ({
    typing: false /* the listeners return on a field first */, match: match !== null, menu: padMenu.isOpen(), card: !modal.hidden || !help.hidden, playing,
    pointerLocked: !!doc.pointerLockElement,                      // the review's F2: no pointer lock API is no lock
    leased: leases.holder() !== null,                             // FUI-2: a panel holding the focus reads its own keys
    // FUI-22 (D4): Escape cancels the queue first (FCW-32: an entity's too; a re-placed prop's too)
    queued: (mode === 'place' && chosen !== null) || entityTool !== null || replacing !== null,
    navigating: fly.navigating(),                                 // RMB fly, a pan, an orbit, a dolly: W / E / R are the camera's
  });
  /** R3-A: set at teardown -- a torn-down page's keys answer nothing (a second mount in one document, a test's). */
  let keysGone = false;
  globalThis.addEventListener('keydown', (e) => {
    if (keysGone) return;
    if (typingTarget(e.target)) return;                       // FG.R23: the lobby chat's typing, the docks' fields: no shortcut
    // Capture, so P and Esc reach the forge before the match's own window listener. A lobby match keeps the pad chord.
    if (import.meta.env.DEV && match && !matchOfLobby && (e.code === 'KeyP' || e.code === 'Escape')) {
      endMatch();
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    // FUI-3 (OT.R68; a browser adaptation): PgUp / PgDn page the open menu's sections, as L1 / R1 do on the pad.
    if (padMenu.isOpen() && !match && (e.code === 'PageUp' || e.code === 'PageDown')) {
      e.preventDefault();
      padMenu.input(e.code === 'PageDown' ? 'nextSection' : 'prevSection');
      return;
    }
    const a = forgeKeyAction(e, keyState());
    if (a === null) return;
    e.preventDefault();
    // The arrows and Space: the menu's, not the camera's. FUI-3: M closes it at any depth (Esc goes back a sub-screen).
    // A tool's key (`./keys` `FORGE_TOOL_ORDER`): Q the Select tool, the number keys the placing tools (a tool the game
    // type greys is refused by `setMode`, and said).
    if (typeof a === 'object' && 'tool' in a) { setMode(a.tool); return; }
    if (typeof a === 'object') { padMenu.input(a.menu === 'back' && e.code === 'KeyM' ? 'close' : a.menu); e.stopImmediatePropagation(); return; }
    switch (a) {
      case 'closeCard': if (!help.hidden) setHelp(false); else cards.back(); break;   // FUI-2: the top card's way back
      case 'undo': undo(); break;
      case 'redo': redo(); break;
      case 'copy': if (!playing) copySelection(); break;
      case 'paste': if (!playing) pasteClipboard(); break;
      case 'walk': toggleWalk(); break;                          // FG-50: Walk and Edit, the camera kept
      case 'play': togglePlay(); break;
      case 'stopWalk': stopPlay(); break;
      case 'door': walk.action(); break;                        // the test room's action key (a door)
      case 'docks': setDocks(doc.body.classList.contains('fx-docks-off')); break;
      case 'frame': frameSelection(); break;
      // Not mid-drag: a gizmo drag keeps the mode it began in (the camera keeps W / E / R itself while it navigates).
      case 'translate': case 'rotate': case 'scale':
        // FC-1: R picks no scale gizmo while the stubs are hidden (`./transformStubs`).
        if (!gizmo.dragging && !(a === 'scale' && FORGE_TRANSFORM_STUBS_HIDDEN_ADAPTATION)) setGizmo(a);
        break;
      case 'snap': setSnap(!snap); break;
      case 'duplicate': duplicate(); break;
      case 'delete': remove(); break;
      // FUI-2: the check's sheet first. FUI-22 (D1, D4): Escape lets the tooltip go; with a prop queued it cancels the
      // queue and keeps the selection, and the next Escape deselects.
      // Escape (the owner, 2026-11-06): any tool back to Select and the selection let go; a queued placement cancelled
      // first, an open Check sheet closed instead.
      case 'deselect': assetTiles?.escape(); if (!closeCheckSheet()) { setMode('select'); select(null); } break;
      case 'cancelPlace': assetTiles?.escape(); if (!closeCheckSheet()) { cancelQueued(); setMode('select'); select(null); } break;
      // The pad's actions that had no key (the merge controller's call (c)): the pad's own path, the menu's cursor included.
      case 'prevAsset': case 'nextAsset': case 'turnLeft': case 'turnRight': padAction(a); break;
      // M (the review's F3): as the pad's START, the lobby's window is hidden first -- the menu never under it.
      case 'menu': if (lobby?.popup && lobby.shown) { setLobbyShown(false); break; } toggleMenu('keys'); break;
    }
  }, true);
  /**
   * R3-A (a browser adaptation): the focus lease's keyboard exit (`./keys` `forgeLeaseExit`), read after the holding
   * panel's own key handlers (this listener's bubble phase): Escape lets the lease go, as the pad's Circle does; M lets it
   * go and opens the menu. A key the panel took (`defaultPrevented`) stays the panel's.
   */
  const onLeaseKey = (e: KeyboardEvent): void => {
    if (keysGone || e.defaultPrevented || typingTarget(e.target)) return;
    const exit = forgeLeaseExit(e, keyState());
    if (exit === null) return;
    e.preventDefault();
    leases.releaseAll();
    if (exit !== 'menu') return;
    if (lobby?.popup && lobby.shown) setLobbyShown(false);           // then M as usual (the review's F3: the lobby's window first)
    else toggleMenu('keys');
  };
  globalThis.addEventListener('keydown', onLeaseKey);     // OT.R68: the editor's keys, every build (R3-A: the lease's exit)

  /** FG-49: the selection copied as a group. A paste puts its centre on the cursor and keeps each offset. */
  type ClipItem = {
    asset: string | null;
    team: 'A' | 'B' | null;
    /** A placed respawn point's team (`userData.forgeRespawn`): built afresh at the paste, as the duplicate paths do. */
    respawn: 'A' | 'B' | null;
    npc: { side: 'seal' | 'terrorist'; type: number } | null;
    offset: Vec3;
    q: Quat;
    marker: boolean;
    /** The review of R3-B: a pack's piece's reference, and whether its pack is here (the stand-in pasted when not). */
    content: Piece['content'] | null;
    missing: boolean;
    /** A placed door, turret, gate, barrier, hostage, zone, point or view: its clone at the copy (`markerClone`). */
    clone: Object3D | null;
  };
  let clipboard: ClipItem[] = [];
  /**
   * The review of R3-B: a copy of a pack's piece keeps its reference (`Piece.content`) -- a duplicate, a paste -- so it
   * is written as its original is (`layoutNow`), never a bare `pack:` key the record refuses.
   */
  const contentOf = <T extends Object3D>(r: T, content: unknown): T => {
    if (content) r.userData['forgeContent'] = JSON.parse(JSON.stringify(content)) as Piece['content'];
    return r;
  };
  const copySelection = (): void => {
    const from = picks.items.filter((r) => !lockedOf(r));
    if (from.length === 0) { say('nothing to copy', true); return; }
    const points = from.map((r): Vec3 => [r.position.x, r.position.y, r.position.z]);
    const clip = clipOf(points, from.map((r) => poseOf(r).q));
    clipboard = from.map((r, i) => ({
      asset: (r.userData['forgePiece'] as string | undefined) ?? null,
      team: (r.userData['forgeSpawn'] as 'A' | 'B' | undefined) ?? null,
      respawn: (r.userData['forgeRespawn'] as 'A' | 'B' | undefined) ?? null,
      npc: npcOf(r) ?? null,
      offset: clip[i]!.offset,
      q: clip[i]!.q,
      marker: isMarker(r),
      content: (r.userData['forgeContent'] as Piece['content'] | undefined) ?? null,
      missing: r.userData['forgeMissing'] === true,
      clone: markerClone(r),
    }));
    say(`copied ${clipboard.length}`);
  };
  const pasteClipboard = (): void => {
    const clip = clipboard;
    if (clip.length === 0) { say('nothing to paste', true); return; }
    if (refuseEdit() || busy || playing) return;
    const before = selectionIds();
    const at = placeAt(pick(lastNdc));
    const places = pastedPlaces(clip.map((c) => c.offset), [at.x, at.y, at.z]);
    personEdit('selection.paste', {}, (step) => void Promise.all(clip.map((c) => {
      if (c.clone) return Promise.resolve(markerClone(c.clone));
      if (c.respawn) return Promise.resolve(respawnMarker(c.respawn));
      if (c.team) return Promise.resolve(spawnMarker(c.team));
      if (c.npc) return Promise.resolve(newNpc(c.npc.side, c.npc.type));
      if (c.asset && c.missing) return Promise.resolve(contentOf(missingPiece(c.asset), c.content));
      return c.asset ? newPiece(c.asset, c.content ?? undefined).then((r) => r && contentOf(r, c.content)).catch(() => null) : Promise.resolve(null);
    })).then((made) => {
      const added: Object3D[] = [];
      made.forEach((r, i) => {
        if (!r) return;
        const p = places[i]!;
        r.position.set(p[0], p[1], p[2]);
        const q = clip[i]!.q;
        if (clip[i]!.marker) r.rotation.set(0, yawOf(q), 0);
        else r.quaternion.set(q[0], q[1], q[2], q[3]);
        freshName(r);
        addRoot(r);
        added.push(r);
      });
      if (added.length === 0) return;
      picks.clear();
      basePicks.clear();
      picks.addAll(added);
      showSelection();
      edit(before, step);
      say(`pasted ${added.length}`);
      moveGhost(lastNdc);
    }), true);
  };

  /**
   * A copy of a placed door, turret, gate, C4 barrier, hostage, zone, tactical point or spectator view (the owner,
   * 2026-11-06: Ctrl-drag, duplicate and copy/paste copy them as a prop): the marker cloned whole -- its model, its data,
   * its guides -- its saved id and lock dropped, its world-turned guides turned with the world again; null for another
   * kind (a piece, a spawn, an NPC: built afresh below; a bomb marker: one of each).
   */
  function cloneable(s: Object3D): boolean {
    const u = s.userData;
    return !!(u['forgeFlare'] || u['forgeDoor'] || u['forgeTurret'] || u['forgeGate'] || u['forgeBarrier'] || u['forgeHostage'] || u['forgeZone'] || u['forgePoint'] || u['forgeView']);
  }
  function markerClone(s: Object3D): Object3D | null {
    const u = s.userData;
    if (!cloneable(s)) return null;
    const c = s.clone(true);
    delete c.userData['forgeId'];
    delete c.userData['forgeLock'];
    c.traverse((o) => {
      const kind = o.userData['forgeGuideKind'] as string | undefined;
      if (kind === 'userScenicViews' || (u['forgeHostage'] && o.parent === c && (o as LineSegments).isLineSegments)) keepWorldTurn(o);
    });
    return c;
  }
  /** A copy just made takes the next name of its kind (Hostage2, Safety2, Delta...), as a new one would; others keep theirs. */
  function freshName(r: Object3D): void {
    const u = r.userData;
    if (u['forgeHostage']) u['forgeHostage'] = { ...(u['forgeHostage'] as object), name: nextHostageName(hostageNamesTaken()) };
    else if (u['forgeZone']) u['forgeZone'] = { ...(u['forgeZone'] as object), name: nextSafetyName(zoneNamesTaken()) };
    else if (u['forgePoint']) u['forgePoint'] = { ...(u['forgePoint'] as object), name: nextNavName(pointNamesTaken('point')) };
    else if (u['forgeView']) u['forgeView'] = { ...(u['forgeView'] as object), name: nextViewName(pointNamesTaken('view')) };
  }
  /** A copy of a placement, unplaced: its piece, its marker or its NPC (null where its piece will not read). */
  const copyOf = async (s: Object3D): Promise<Object3D | null> => {
    const asset = s.userData['forgePiece'] as string | undefined;
    const team = s.userData['forgeSpawn'] as 'A' | 'B' | undefined;
    const npc = npcOf(s);
    if (bombKindOf(s)) return null;                           // one of each bomb marker: move the one placed
    const cloned = markerClone(s);
    if (cloned) return cloned;
    if (s.userData['forgeRespawn']) return respawnMarker(s.userData['forgeRespawn'] as 'A' | 'B');
    if (team) return spawnMarker(team);
    if (npc) return newNpc(npc.side, npc.type);
    if (asset && s.userData['forgeMissing']) return contentOf(missingPiece(asset), s.userData['forgeContent']);
    return asset ? newPiece(asset, s.userData['forgeContent']).then((r) => r && contentOf(r, s.userData['forgeContent'])).catch(() => null) : null;
  };
  /** FG-47: every placement picked copied, offset as one copy is; the copies the selection; one step. */
  const duplicateGroup = (): void => {
    if (refuseEdit()) return;
    const from = [...picks.items];
    const before = selectionIds();
    passOver('copied');
    if (from.length === 0) return;
    personEdit('selection.duplicate', {}, (step) => void Promise.all(from.map(copyOf)).then((copies) => {
      const made: Object3D[] = [];
      copies.forEach((r, i) => {
        const s = from[i]!;
        if (!r) return;
        r.position.copy(s.position).add(new Vector3(gridStep * 2, 0, 0));
        r.quaternion.copy(s.quaternion);
        r.scale.copy(s.scale);
        freshName(r);
        addPlacement(r);
        made.push(r);
      });
      if (made.length === 0) return;
      picks.clear();
      basePicks.clear();
      picks.addAll(made);
      showSelection();
      edit(before, step);
    }), true);
  };
  const duplicate = (): void => {
    if (isGroup()) { duplicateGroup(); return; }
    const s = selected;
    if (!s || refuseEdit()) return;
    const before = selectionIds();
    const asset = s.userData['forgePiece'] as string | undefined;
    const team = s.userData['forgeSpawn'] as 'A' | 'B' | undefined;
    const npc = npcOf(s);
    if (bombKindOf(s)) { say('one of each bomb marker: move the one placed'); return; }
    personEdit('selection.duplicate', {}, (step) => {
      const place = (r: Object3D): void => {
        r.position.copy(s.position).add(new Vector3(gridStep * 2, 0, 0));
        r.quaternion.copy(s.quaternion);
        r.scale.copy(s.scale);
        freshName(r);
        addPlacement(r);
        select(r);
        edit(before, step);
      };
      const cloned = markerClone(s);
      if (cloned) place(cloned);
      else if (s.userData['forgeRespawn']) place(respawnMarker(s.userData['forgeRespawn'] as 'A' | 'B'));
      else if (team) place(spawnMarker(team));
      else if (npc) place(newNpc(npc.side, npc.type));
      else if (asset && s.userData['forgeMissing']) place(contentOf(missingPiece(asset), s.userData['forgeContent']));
      else if (asset) void newPiece(asset, s.userData['forgeContent']).then((r) => { if (r) place(contentOf(r, s.userData['forgeContent'])); });
    }, true);
  };
  const remove = (): void => {
    // FCW-32 step 4 (D4): a rules entity picked from its row is deleted by its reference (refused while a rule names it).
    if (entityPicked !== null && picks.size + basePicks.size === 0) { entityEdit('piece.delete', { refs: [entityPicked] }); return; }
    if ((picks.size || basePicks.size) && refuseEdit()) return;
    const before = selectionIds();
    if (isGroup()) {
      // FG-47: every placement removed, every map prop hidden (FG-17's path, never deleted); one step.
      const gone = [...picks.items];
      const hid = basePicks.items.length;
      const keys = basePicks.items.map((b) => b.key);
      personEdit(gone.length ? 'piece.delete' : 'piece.hide', gone.length ? { refs: before } : { keys }, () => {
        for (const b of basePicks.items) hiddenKeys.add(b.key);
        picks.clear();
        basePicks.clear();
        for (const r of gone) removeRoot(r);
        drawHidden();
        showSelection();
        edit(before);
        say(`${gone.length} deleted${hid ? ` · ${hid} map prop${hid === 1 ? '' : 's'} hidden in this layout` : ''}`);
      }, true);
      return;
    }
    if (baseSelected) {
      // FG-17: a map prop is hidden in this layout, not deleted: the disc's placement stays, listed in the outliner.
      const prop = baseSelected;
      personEdit('piece.hide', { keys: [prop.key] }, () => {
        hiddenKeys.add(prop.key);
        say(`${prop.model} hidden in this layout`);
        basePicks.clear();
        drawHidden();
        showSelection();
        edit(before);
      }, true);
      return;
    }
    const gone = selected;
    if (gone) personEdit('piece.delete', { refs: before }, () => { removeRoot(gone); edit(before); }, true);
  };

  /* ================= play: the test room's walk, mover and SEAL on the layout ================= */
  const walk = new WalkMode(fly);
  walk.modeKey = false;                              // no G: Play and Build are the forge's own switch
  const play = new Play();
  /**
   * The map's doors in Play (`../doorPage`, socomlegacy/docs/research/92-doors.md), on the layout's hull as the walk stands
   * on it: the action -- the pad's Square, X in a development build, as the test room's -- opens the door under the
   * reticle; its leaf is drawn moved (`WorldView.moveNode`). Silent: the forge has no sound yet.
   */
  const doors = new DoorPage({
    grid: () => walk.grid(),
    feet: () => walk.feet(),
    aim: () => walk.fireAim(),
    sound: () => undefined,
    move: (path, delta) => { swung.add(path); baseView?.moveNode(path, delta); },
    net: () => null,
  });
  /** The leaves a door moved in Play: put back at the build (a delta is the whole move from the disc's place). */
  const swung = new Set<string>();
  const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  walk.setActionFilter(() => doors.action());
  let body: { view: BodyView; from: LoadedMap } | null = null;
  /** The SEAL of the map the layout stands on (the blank floor's: its library's), built once per map. */
  const bodyFor = (map: LoadedMap): BodyView | null => {
    if (body?.from === map) return body.view;
    if (body) { scene.remove(body.view.group); body.view.dispose(); body = null; }
    const b = bodyForTeam(map, 'seal');
    if (!b) return null;
    const v = buildBody(b, map, { ...DEFAULT_LIGHTING, rig: map.lightRig, brighten: lighting.brighten });   // FG-24: the day / night
    scene.add(v.group);
    play.setBody(v, b);
    body = { view: v, from: map };
    return v;
  };
  const drawPlayBtn = (): void => {
    playBtn.innerHTML = `${icon('play')}<span>Play</span>`;
    playBtn.append(playGear);                                  // the Play settings' gear, after the word
    walkBtn.classList.toggle('is-on', playing);
  };
  const setPlaying = (on: boolean): void => {
    if (on) centerDock.querySelector<HTMLButtonElement>('[data-forge-tab="viewport"]')?.click();
    playing = on;
    doc.body.classList.toggle('is-playing', on);
    drawPlayBtn();
    playBtn.classList.toggle('is-on', on);
    menuBtn.disabled = on;                                    // LATER 230: START stops a walk; the menu waits
    if (on) padMenu.close();
    gizmo.getHelper().visible = !on;
    refreshBox();
    for (const r of roots) if (isMarker(r)) r.visible = !on;
    body?.view.setVisible(on);
    refreshHint();
    syncGhost();
  };
  /** FG-50: the camera, and the cursor's x, z when the pointer is over the world. */
  const viewForStand = (): { camera: [number, number, number]; yaw: number; cursor: [number, number] | null } => {
    const pose = fly.pose();
    let cursor: [number, number] | null = null;
    if (pointerClient) {
      const r = input.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        const ndc = new Vector2(((pointerClient.x - r.left) / r.width) * 2 - 1, -((pointerClient.y - r.top) / r.height) * 2 + 1);
        const hit = pick(ndc);
        if (hit) cursor = [hit.point.x, hit.point.z];
      }
    }
    return { camera: [pose.x, pose.y, pose.z], yaw: (pose.yaw * Math.PI) / 180, cursor };
  };
  /**
   * FG-50: the editor's place, put back when Play ends. The match has its own camera; this one, the selection and the
   * tool are the maker's, and leaving must find them as they were.
   */
  let editPlace: { pose: ReturnType<FlyCamera['pose']>; mode: Mode; placed: Object3D[]; base: BaseProp[] } | null = null;
  const rememberPlace = (): void => {
    fly.halt();                                              // the glide stops on this pose, before it is kept
    editPlace = { pose: fly.pose(), mode, placed: [...picks.items], base: [...basePicks.items] };
  };
  const restorePlace = (): void => {
    const saved = editPlace;
    if (!saved) return;
    editPlace = null;
    fly.setPose(saved.pose);
    fly.halt();
    setMode(saved.mode);
    picks.clear();
    for (const r of saved.placed) if (roots.includes(r)) picks.add(r);
    basePicks.clear();
    for (const b of saved.base) basePicks.add(b);
    showSelection();
  };
  const startPlay = async (agentGuard?: () => void): Promise<void> => {
    if (playing || busy || !base) return;
    busy = true;
    busyCause = 'walk';
    try {
      const c = await composeGround();
      if (!c) { say('this base has no hull to stand on', true); if (doc.pointerLockElement) doc.exitPointerLock(); return; }
      const grid = groundGrid(c.ground);
      // FG-50: the floor under the camera, else under the cursor. The camera is not moved to a marker: Walk and Edit
      // keep the view where it is, and the walk stands on that floor (a layout spawn only when neither has one).
      // LATER 803: then, on a disc map's base, the map's own stand (`standOf`), as the open looked from before FP.R15.
      const marker = roots.find((r) => r.userData['forgeSpawn'] === 'A') ?? roots.find((r) => r.userData['forgeSpawn']);
      const mapStand = base.kind === 'map' && baseMap && baseView ? standOf(baseMap, baseView) : null;
      const feet = walkFeet(grid, c.ground, viewForStand(), marker ? [marker.position.x, marker.position.y, marker.position.z] : null, mapStand);
      if (!feet) {
        say('nowhere to stand: place a spawn on a floor', true);
        if (doc.pointerLockElement) doc.exitPointerLock();
        return;
      }
      // Shut, as the disc has them; FG-31: their owners remapped onto the walk's hull, a hidden prop's gone (`./hide` `doorsAfter`).
      const mapDoors = base.kind === 'map' ? c.groundMap.doors : undefined;
      doors.setMap(mapDoors && c.groundMap.ground ? doorsAfter(c.groundMap.ground, c.ground, mapDoors) : mapDoors, c.ground);
      // The SEAL is the map's own; a campaign mission carries no multiplayer SEAL, so the first multiplayer map's stands
      // in (its textures with it), as the test room's player is a multiplayer body.
      if (!bodyFor(c.groundMap)) {
        const mp = entries.find((a) => !a.campaign);
        if (mp) bodyFor(await archives.load(mp.stem));
      }
      play.setClips(await archives.clips([...PLAY_CLIPS, ...WEAPON_CLIPS]));
      agentGuard?.();
      walk.setGround(c.ground, feet, grid);
      if (!walk.setMode('walk')) {
        say('nowhere to stand there: place a spawn on a floor', true);
        if (doc.pointerLockElement) doc.exitPointerLock();     // the press's lock, let go with the Walk that did not start
        return;
      }
      walk.bindKey();
      setPlaying(true);
      const n = roots.filter((r) => r.userData['forgePiece']).length;
      say(`playing · ${c.solid} of ${n} piece${n === 1 ? '' : 's'} solid`);
    } finally { busy = false; }
  };
  const stopPlay = (): void => {
    if (!playing) return;
    walk.unbindKey();
    walk.setMode('fly');
    for (const path of swung) baseView?.moveNode(path, IDENTITY);   // the doors shut again, as the next Play opens them
    swung.clear();
    if (doc.pointerLockElement) doc.exitPointerLock();
    setPlaying(false);                                         // the camera stays where the walk left it (FG-50)
    say('building');
  };
  const toggleWalk = (): void => {
    if (playing) { stopPlay(); return; }
    // The mouse's look (OT.R68: the editor's Walk, every build) is asked here, in the press itself: a pointer lock wants the user's
    // gesture, and Play's loads (the hull, the clips, a SEAL from another archive) can outlast the gesture's window.
    if (import.meta.env.DEV) mouseSite('s2u-mouse-pointer-lock');
    lockMouse(canvas);                                         // OT.R68: the Walk's captured look in every build
    void startPlay().catch((e: unknown) => say(String(e), true));
  };
  walkBtn.addEventListener('click', toggleWalk);

  /* ================= Play: the offline match on the layout (`./match`, `./matchMap`) ================= */
  /** The clips a match plays (`../matchMount`'s `MATCH_CLIPS`): the walk's, the weapons', the traversal's, the throws'... */
  const MATCH_CLIPS = [...PLAY_CLIPS, ...WEAPON_CLIPS, ...TRAVERSAL_CLIPS, ...THROW_CLIPS, ...DEATH_CLIPS, ...FLINCH_CLIPS, ...DOOR_CLIPS, ...BINOCULAR_CLIPS, ...TURRET_CLIPS];   // DOOR_CLIPS: #485's re-check (the door's clip and window)
  const matchHost = el(doc, 'div', 'fx-match');
  matchHost.hidden = true;
  const matchBack = el(doc, 'button', 'fx-tool fx-match-back');
  matchBack.type = 'button';
  // LATER 230 (the merge controller's word): the pad's chord only with a pad; a tap or a click is the way otherwise.
  const drawMatchBack = (): void => {
    const pad = [...(globalThis.navigator?.getGamepads?.() ?? [])].some((g) => g?.connected === true);
    const coarse = globalThis.matchMedia?.('(pointer: coarse)').matches === true;
    matchBack.innerHTML = `${icon('back')}<span>${matchBackWords({ dev: import.meta.env.DEV, pad, coarse })}</span>`;
  };
  drawMatchBack();
  globalThis.addEventListener?.('gamepadconnected', drawMatchBack);
  globalThis.addEventListener?.('gamepaddisconnected', drawMatchBack);
  globalThis.addEventListener?.('gamepadconnected', refreshHint);    // OT.R68: the legend follows the input at hand
  globalThis.addEventListener?.('gamepaddisconnected', refreshHint);
  doc.body.append(matchHost);
  let match: ForgeMatch | null = null;
  /** FG-26: the match running is the lobby's (its end ends this page's lobby). */
  let matchOfLobby = false;
  // FCW-32 step 4 (FUI.R23 D4): the rules gizmos never in Play (a match), Walk or a camera shot.
  rulesHidden = () => playing || match !== null || pageShot?.driver.active() === true;
  /**
   * The match ended here. A lobby's match (FG-26) ends this page's lobby too. The FG-48 re-review's F1: `match.close()`
   * already shut the lobby's socket (the session handed it to the match at the launch), and that socket's close is the
   * hand-on (the server's `leave`, the same successor as the LEAVE's) -- so `leaveLobby` reads the socket gone, sends no
   * request after it and says nothing, and only lets the lobby go here: the window, the address, a joiner's own layout.
   */
  /**
   * OT.R68: the editor's camera is held while a match runs -- its keys are every build's now, and the match's page is
   * over it -- and the mouse it captured let go at the match's start (the merge controller's care); freed at the end.
   */
  let editorHeld = false;
  const holdEditor = (on: boolean): void => {
    editorHeld = on;
    if (on) leases.releaseAll();                              // FUI-2: a match hides the docks, so a panel's focus lease ends
    fly.setInputSuspended(on);
    if (on && doc.pointerLockElement === canvas) doc.exitPointerLock();
  };
  /** FUI-2: a panel holding the focus lease holds the camera's keys and lanes as a match does; let go, it flies again. */
  leaseChanged = () => { fly.setInputSuspended(editorHeld || leases.holder() !== null); };
  /**
   * PR #729's Codex P1 (ML.R13): the textures a match registers carry its scope (`FORGE_MATCH_TEXTURE_SCOPE`), from just
   * before it starts to its end, so the editor's HD runtime (scope null) leaves them to the match's guarded one.
   */
  let leaveScope: (() => void) | null = null;
  const enterMatchScope = (): void => { leaveScope?.(); leaveScope = hdTextures.enterScope(FORGE_MATCH_TEXTURE_SCOPE); };
  const leaveMatchScope = (): void => { leaveScope?.(); leaveScope = null; };
  const endMatch = (): void => {
    leaveMatchScope();
    agentPlay.port.end('Forge Play ended');
    rulesPresenter.clear();                                   // FCW-32 round 2: the rules' words go with the match
    if (!match) return;
    match.close();
    match = null;
    syncRulesGizmos();                                        // FCW-32 step 4 (D4): the editor's again
    const leftLobby = matchOfLobby;
    if (matchOfLobby) { matchOfLobby = false; leaveLobby(); }
    forgePad.reset();                                         // the exit chord, still held, is not a press here
    matchHost.replaceChildren();
    matchHost.hidden = true;
    doc.body.classList.remove(FORGE_MATCHING_CLASS);
    holdEditor(false);
    if (doc.pointerLockElement) doc.exitPointerLock();
    fit();
    restorePlace();                                          // FG-50: the camera, the selection and the tool, as they were
    if (!leftLobby) say('building');                         // LATER 215's review F2: leaveLobby said it, then a joiner's line
  };
  matchBack.addEventListener('click', endMatch);
  /**
   * The layout composed into the match's map (`./matchMap`): the base's world less its hidden props (the blank floor's
   * own), the pieces, their hull, the spawn slots, the settings' fog and light. `npcs` false (FG-26, the lobby's match:
   * a forge lobby's room seats no NPC, `forgeLobby.ts`) composes none.
   */
  const composeForMatch = async (npcs: boolean) => {
    if (!base) return null;
    const c = await composeGround();
    if (!c) return null;
    const layout = layoutNow()!;
    const libs = new Map<string, LoadedMap>([[c.groundMap.archive, c.groundMap]]);
    for (const p of layout.pieces) {
      const stem = parseAssetId(p.asset)?.archive;
      if (stem && !libs.has(stem)) libs.set(stem, await archives.load(stem).catch(() => c.groundMap));
    }
    // The blank floor plays on its library's archive with none of that map's world: the pieces, on the floor's hull.
    const baseMap: LoadedMap = base.kind === 'blank'
      // None of the library's map data or game type (`./objectives` `blankFloorOf`): its places are that map's, off the floor.
      // The floor's own open AI map (`./floorAi`), so placed hostages and extraction zones have cells there.
      ? { ...blankFloorOf({ ...c.groundMap, world: [floorMesh(FLOOR_SIZE)], lines: null, props: [] } as LoadedMap), ai: floorAiMaps(FLOOR_SIZE) } as LoadedMap
      : (() => {
        const hiddenNow = placementsOf(c.groundMap, hiddenKeys);
        // FG-36: the hidden placements' line strips out of the match's map too (`./hide` `linesWithout`).
        return { ...c.groundMap, props: propsWithout(c.groundMap, hiddenNow), lines: linesWithout(c.groundMap, hiddenNow) } as LoadedMap;
      })();
    const markers = npcs ? layout.npcs ?? [] : [];
    // The Play settings' side (Play's own: `npcs`), else the side the NPCs leave the player (`./npcs` `playerSideOf`).
    const playerSide = npcs && playSide !== 'auto' ? playSide : playerSideOf(markers);
    const own = settingsOf(layout);
    const fit = npcsThatFit(markers, playerSide, own.players);
    // The pure chain (`./composeLayout`, its steps in their order; FP-1b): the page loads what it reads -- the hostages'
    // lent bodies, the placed copies' templates, the outline donor and the sky -- and the chain composes the map.
    const lentLibs = new Map<string, LoadedMap>();
    for (const h of layout.hostages ?? []) if (h.source && !lentLibs.has(h.source)) { const lib = await hostageLibOf(h.source); if (lib) lentLibs.set(h.source, lib); }
    const templates = new Map<string, TurretTemplate>();
    for (const t of layout.turrets ?? []) { const found = await turretTemplate(t.source, t.name); if (found) templates.set(`${t.source}:${t.name}`, found); }
    const doorTemplatesNow = new Map<string, DoorTemplate>();
    for (const t of layout.doors ?? []) { const found = await doorTemplate(t.source, t.name); if (found) doorTemplatesNow.set(`${t.source}:${t.name}`, found); }
    const accessNow = new Map<string, AccessTemplate>();
    for (const [kind, list] of [['gate', layout.gates], ['barrier', layout.barriers]] as const) {
      for (const t of list ?? []) { const found = await accessTemplate(kind, t.source, t.name); if (found) accessNow.set(`${kind}:${t.source}:${t.name}`, found); }
    }
    const flaresNow = new Map<string, FlareTemplate>();
    for (const f of layout.flares ?? []) { const found = await flareTemplate(f.source, f.name); if (found) flaresNow.set(`${f.source}:${f.name}`, found); }
    const type = layout.objectives?.gameType;
    const { composed, played, why, turreted, doored, flared } = composeLayoutObjects({
      baseMap, layout, libs, ground: c.ground, playerSide, resolveContent, npcs: fit.kept, lentLibs,
      blank: base.kind === 'blank', libraryEscortee: c.groundMap.escortees?.[0], blocked: type === undefined ? null : blankWhy(type),
      turretOf: (s, n) => templates.get(`${s}:${n}`) ?? null, doorOf: (s, n) => doorTemplatesNow.get(`${s}:${n}`) ?? null,
      accessOf: (m) => accessNow.get(`${m.kind}:${m.source}:${m.name}`) ?? null, flareOf: (src, n) => flaresNow.get(`${src}:${n}`) ?? null,
    });
    // The layout's own Demolition sites wear the map's bases' outlines (`./siteOutlines`): the disc's pulse at the sites
    // that plant, none left at the tents that no longer do.
    const ownSites = layoutOwnSites(layout, why);
    // A base with no outline of its own (a blank floor) borrows the donor's (`SITE_OUTLINE_DONOR`), when it is on this disc.
    const outlineDonor = ownSites.length && !absent.has(SITE_OUTLINE_DONOR) ? await hostageLibOf(SITE_OUTLINE_DONOR) : null;
    const unplayable = why === null ? undefined : `${why}; playing the base's mode`;
    // FG-24: the layout's fog and light on the map's camera and rig, and a new empty map's own environment over the one
    // its library lends (`./ownEnvironment` `withLayoutEnvironment`): the match lit as the editor is. Its sky: the chosen
    // disc map's dome over the floor (`./skyDome`), its textures carried as a turret's are.
    const blankBase = base.kind === 'blank';
    const skyLib = blankBase && own.skyFrom ? await hostageLibOf(own.skyFrom) : null;
    const map = composeLayoutFinish(flared, ownSites, outlineDonor, own, blankBase, (aimed) => (skyLib ? skyDomeFor(skyLib, aimed.archive) : null));
    return { c, layout, own, fit, playerSide, composed, hostagesOffGrid: played.hostagesOffGrid, hostagesPastBound: played.hostagesPastBound, zonesLeft: played.zonesLeft, turretsLeft: turreted.unplaced, doorsLeft: doored.unplaced, map, gameMode: type !== undefined && why === null ? modeCaption(type) : undefined, unplayable };
  };
  /** The map check (`./validate`) is running: Play and Create lobby wait, and a second click does not start another. */
  let checking = false;
  /** Jump: a short way off the point, looking back at it, and that marker selected. The forge's own camera, not the game's. */
  const lookAtPoint = (at: [number, number, number]): void => {
    fly.lookFrom([at[0] + 120, at[1] + 80, at[2] + 120], [at[0], at[1] + 10, at[2]]);
    const hit = roots.find((r) => {
      const dx = r.position.x - at[0], dy = r.position.y - at[1], dz = r.position.z - at[2];
      return dx * dx + dy * dy + dz * dz <= 0.25;
    });
    if (hit) select(hit);
  };
  /**
   * The layout against the hull Play and a lobby stand on (`composeGround`, the server's composition). A blank floor
   * whose library is not on this disc is checked on the floor alone.
   */
  const collectCheckOnce = async (): Promise<MapCheck | null> => {
    const l = layoutNow();
    if (!l || !base) return null;
    let composed: Awaited<ReturnType<typeof composeGround>> = null;
    try { composed = await composeGround(); } catch { composed = null; }
    const ground = composed?.ground ?? (base.kind === 'blank' ? floorGround(FLOOR_SIZE) : null);
    if (!ground) { say('this base has no hull to check', true); return null; }
    contentMisses = composed?.misses ?? [];                   // R6 (3): the Check sheet's missing list names them
    const pieces: CheckedPiece[] = [];
    let polyCount = 0;
    let index = 0;
    for (const [rootIndex, r] of roots.entries()) {
      const asset = r.userData['forgePiece'] as string | undefined;
      if (!asset) continue;
      r.updateMatrix();
      // R6 (3): a pack piece is held when its definition resolves; its polygons the content provider's (model space).
      const content = r.userData['forgeContent'] as ContentRef | undefined;
      const got = content ? contentPieceHull({ owner: `forge/piece_${rootIndex}`, content, m: Array.from(r.matrix.elements) }, resolveContent) : null;
      const id = content ? null : parseAssetId(asset);
      const map = id ? await archives.load(id.archive).catch(() => null) : null;
      const held = got ? !('missing' in got) : !!id && !!map && map.props.some((q) => q.modelName === id.model);
      const hull = got ? (!('missing' in got) && got.hull ? [...got.hull.polys] : []) : held ? await hullOf(asset) : null;
      const polys = held ? (hull ?? []) : null;
      if (polys) polyCount += polys.length;
      pieces.push({ index, asset, m: Array.from(r.matrix.elements), polys, owner: `forge/piece_${rootIndex}` });
      index++;
    }
    const disc = l.base.kind === 'map' && baseMap ? baseMap.slots.map((s) => ({ side: s.side, at: s.position })) : undefined;
    // Extraction's hostages and zones the base holds itself: a map's escortees and kind-1 zones; a blank floor none.
    // Its AI map too, where Play stands the placed hostages (a blank floor's own, `./floorAi`): Check counts as Play places.
    const own = l.base.kind === 'map' && baseMap
      ? { ai: baseMap.ai, hostages: baseMap.escortees?.length ?? 0, zones: baseMap.ai ? zonesOfKind(baseMap.ai, 1).length : 0,
        safety: !!baseMap.ai?.maps.some((s) => s.zones.some((z) => z.name.toLowerCase() === 'safety')) } : { ai: floorAiMaps(FLOOR_SIZE), hostages: 0, zones: 0 };
    return checkMap(l, ground, pieces, polyCount, disc, own);
  };
  const collectCheck = async (): Promise<MapCheck | null> => {
    const found = await collectCheckOnce();
    if (found) { lastIssues = found.issues.length; statusChips.update(); }
    return found;
  };
  /** The check's words and rows, into `card` before its `foot` (FUI-2: one body for the sheet and the card before Play). */
  const checkBody = (found: MapCheck, card: HTMLElement, foot: HTMLElement): void => {
    const packs = missingPacks();
    const problems = found.issues.length > 0 || packs.length > 0 || contentMisses.length > 0;
    const list = el(doc, 'ul', 'fx-check');
    // R6 (3): each pack piece the ground left out (`layoutGround`'s misses), beside the packs: drawn as the stand-in, not solid.
    for (const m of contentMisses) {
      const row = el(doc, 'li');
      row.dataset['kind'] = 'content-miss';
      row.append(el(doc, 'span', '', `Pack piece not built: ${m.content.assetId} of ${m.content.pack.id}@${m.content.pack.version} (${
        m.reason === 'placement' ? 'placed other than by a turn about its upright' : 'its pack or the asset is not here'})`));
      list.append(row);
    }
    // R3-B (FUI-14/16's minimum): each pack the layout needs that is not here, by id@version; Play waits for them.
    for (const p of packs) {
      const row = el(doc, 'li');
      row.dataset['kind'] = 'missing-pack';
      row.append(el(doc, 'span', '', `Pack not here: ${p.id}@${p.version} (Play and Create lobby wait for it)`));
      list.append(row);
    }
    for (const issue of found.issues) {
      const row = el(doc, 'li');
      row.dataset['kind'] = issue.kind;
      row.append(el(doc, 'span', '', issue.text));
      if (issue.at) {
        const at = issue.at;
        const jump = el(doc, 'button', 'fx-tool', 'Jump');
        jump.type = 'button';
        jump.dataset['pad'] = 'act';                            // FUI-2: on the card, Cross on the row is its Jump
        row.dataset['padItem'] = '';
        jump.addEventListener('click', () => lookAtPoint(at));
        row.append(jump);
      }
      list.append(row);
    }
    const notes = found.notes.length ? el(doc, 'p', 'fx-dim fx-check-notes', found.notes.join(' ')) : null;
    card.append(
      el(doc, 'h2', '', problems ? 'This map has problems' : 'Map check'),
      el(doc, 'p', '', problems ? 'These are what the check found. You can go on, or go back and fix them.' : 'No problems.'),
      ...(problems ? [list] : []),
      ...(notes ? [notes] : []),
      foot,
    );
  };
  /** FUI-2 (IA-1): the on-demand list's sheet closed; false when none was open. */
  const closeCheckSheet = (): boolean => {
    if (checkSheet.hidden) return false;
    checkSheet.hidden = true;
    checkSheet.replaceChildren();
    return true;
  };
  /**
   * FUI-2 (the review's IA-1): the on-demand list, a sheet beside the editor -- not the dialog's slot, and nothing waits on
   * it, so the check is over once it shows and a card opened after it (Saves) takes the pointer. Close, Esc and Circle
   * close it; its Jump looks at the point. Its rows' pad walk is the Issues panel's (FUI-5).
   */
  const showCheckSheet = (found: MapCheck): void => {
    const card = el(doc, 'div', 'fx-card fx-check-card');
    const foot = el(doc, 'footer');
    const close = el(doc, 'button', 'fx-tool fx-primary', 'Close');
    close.type = 'button';
    close.addEventListener('click', () => { closeCheckSheet(); });
    foot.append(close);
    checkBody(found, card, foot);
    card.setAttribute('role', 'region');
    const heading = card.querySelector('h2');
    if (heading) { heading.id = 'fx-check-sheet-title'; card.setAttribute('aria-labelledby', heading.id); }
    checkSheet.replaceChildren(card);
    checkSheet.hidden = false;
  };
  /**
   * The check's card before Play or Create lobby: `yes` goes on. FUI-2: a card on the stack, its host see-through
   * (`fx-check-modal`: Jump shows the point), Go back focused first -- Cross is never Play anyway unread (PAD-8's half);
   * Esc and Circle go back.
   */
  const askMapCheck = (found: MapCheck, yes: string): Promise<boolean> => new Promise((resolve) => {
    closeCheckSheet();
    const card = el(doc, 'div', 'fx-card fx-check-card');
    const foot = el(doc, 'footer');
    let handle: CardHandle | null = null;
    const done = (v: boolean): void => { handle?.close(); resolve(v); };
    const back = el(doc, 'button', 'fx-tool', 'Go back');
    const go = el(doc, 'button', 'fx-tool fx-primary', yes);
    back.type = 'button';
    go.type = 'button';
    back.setAttribute(CARD_SAFE_ATTR, '');
    padItems(back, go);
    foot.append(back, go);
    back.addEventListener('click', () => done(false));
    go.addEventListener('click', () => done(true));
    checkBody(found, card, foot);
    handle = cards.open(card, { onBack: () => done(false), initialFocus: back, label: 'Map check', hostClass: 'fx-check-modal' });
  });
  /** Run the check. No problems, go on. Problems, the list; the player can still go on. A note alone does not stop. */
  const proceedIfClear = async (yes: string): Promise<boolean> => {
    if (refuseUnderCard()) return false;                          // FUI-2 (IA-1): no card opened over another
    if (checking || busy || match) return false;
    closeCheckSheet();                                            // FUI-2: a list from before is not this check's
    checking = true;
    try {
      const found = await collectCheck();
      if (!found) return false;
      if (found.issues.length === 0) return true;
      return await askMapCheck(found, yes);
    } finally { checking = false; }
  };
  const startMatch = async (agentGuard?: () => void): Promise<void> => {
    if (match || playing || busy || !base) return;
    if (editsLocked()) { notifier.refused('Play waits while a lobby is open: the lobby\'s host launches its match'); return; }
    if (refuseMissingPacks('Play')) return;
    busy = true;
    busyCause = 'play';
    showLoading('Starting the match');
    // Taken at the press, before the loads: the camera can still be gliding, and Play stands where the maker was.
    rememberPlace();
    const stand = viewForStand();
    let held = false;
    // LATER 456: the content props' group while no started match owns it -- a throw before `match` is set frees it here
    // (the review's leak); once `startForgeMatch` resolves, its close disposes it, so this is cleared and never freed twice.
    let unownedProps: Object3D | null = null;
    try {
      const m = await composeForMatch(true);
      if (!m) { editPlace = null; say('this base has no hull to play on', true); return; }
      const { c, own, fit, playerSide, composed } = m;
      // FCW-32 round 2 (FORGE_PLAY_RULES_ADAPTATION): a rules mode plays its rules on the room's host; none, as before.
      const playRules = forgePlayRules(m.layout, playRulesSeed(), installedRules());
      const playNames = ruleNamesOf(base, m.map);                       // review F1: the one derivation, shared with rules.test
      let mapForMatch = m.map;
      // FG-50: round 1 stands the local player on the floor under the camera (or the cursor), facing the camera.
      // Classic starts every round from `map.slots`, so the layout's index 0 is put back into that array once round 1
      // has spawned (`openingStand` `restore`). No floor there keeps the layout's slots. The respawns stay that list.
      const side: 0 | 1 = playerSide === 'seal' ? 0 : 1;
      // The Play settings: one of the side's spawns at random (`./playFromHere` `randomStand`), else the camera's floor.
      const here = playSpawn === 'random' ? randomStand(mapForMatch.slots, side) : standFromHere(groundGrid(c.ground), c.ground, stand);
      const opening = here ? openingStand(mapForMatch.slots, side, here.at, here.yaw) : null;
      if (opening) mapForMatch = { ...mapForMatch, slots: opening.slots };
      else if (!mapForMatch.slots.some((sl) => sl.side === side)) {
        editPlace = null;
        say('nowhere to stand: place a spawn marker on a floor', true);
        return;
      }
      const [clips, extras] = await Promise.all([archives.clips(MATCH_CLIPS), matchExtras(archives.sourceRequest(), c.groundMap)]);
      // LATER 456 (H336; FORGE_PLAY_CONTENT_PROPS_ADAPTATION, on by the owner's answer): with the flag on, the composed content
      // props drawn by the editor's own draw, each at its placement; a piece that fails is left out and counted.
      const props = forgePlayContentProps.drawn() ? await contentPropsGroup(composed.content, (p) => newContentPiece(p.def.ref)) : null;
      unownedProps = props?.group ?? null;
      agentGuard?.();
      if (!agentGuard) select(null);
      held = true;
      doc.body.classList.add(FORGE_MATCHING_CLASS);
      holdEditor(true);
      matchHost.hidden = false;
      drawMatchBack();
      matchHost.replaceChildren(matchBack, statusChips.matchElement);   // FUI-4: the agent's chip beside Back
      enterMatchScope();
      const started = await startForgeMatch(matchHost, {
        normalInput: agentPlay.port,
        map: mapForMatch, clips, effects: extras.effects, sound: extras.sound, name: 'FORGE', npcs: fit.kept, npcBehaviour: own.npcBehaviour, side: playerSide,
        room: { ...roomOptionsOf(own), onRoundStart: (round) => { if (round === 1) opening?.restore(); } },
        forgeLighting: forgeLightingOptions(own, baseMap), brighten: matchBrightenOf(own), ...(m.gameMode ? { gameMode: m.gameMode } : {}), source: archives.sourceRequest(),   // F7 (a): the overlay's cues read from it
        ...(props ? { extraWorld: props.group } : {}),                                // LATER 456: only with the flag on
        ...(playRules ? { rules: { ...playRules, names: playNames }, onRules: (ev: unknown) => { rulesPresenter.take(ev); } } : {}),   // FCW-32 round 2
        ...(playRules ? { onRulesAudio: (a: RulesCueAudio | null) => { rulesPresenter.audio(a); }, rulesCueStats: () => rulesPresenter.cueStats() } : {}),       // FUI-23: the cues on the match's audio (and their counts, the DEV readout)
      });
      unownedProps = null;                                                            // LATER 456: the match's close frees it now
      try { agentGuard?.(); } catch (e) { started.close(); throw e; }
      match = started;
      matchOfLobby = false;
      syncRulesGizmos();                                                            // FCW-32 step 4 (D4): none in Play
      // FCW-32 step 4 (FUI.R23 D5): "PLAY · <mode name>" beside Back for a rules mode.
      if (playRules) {
        const named = (playRules.spec as { name?: unknown } | null)?.name;
        rulesPresenter.mode(typeof named === 'string' && named ? named : m.layout.mode?.id ?? 'rules');
      }
      const notes = [
        ...(m.unplayable ? [m.unplayable] : []),
        ...(composed.missing ? [`${composed.missing} piece${composed.missing === 1 ? '' : 's'} not on this disc`] : []),
        ...(props?.failed ? [`${props.failed} content prop${props.failed === 1 ? '' : 's'} not drawn`] : []),
        ...(m.doorsLeft ? [`${m.doorsLeft} door${m.doorsLeft === 1 ? '' : 's'} not on this disc, left out`] : []),
        ...(m.turretsLeft ? [`${m.turretsLeft} turret${m.turretsLeft === 1 ? '' : 's'} not on this disc, left out`] : []),
        ...(m.zonesLeft ? [`${m.zonesLeft} extraction zone${m.zonesLeft === 1 ? '' : 's'} off the AI grid, left out`] : []),
        ...hostagesLeftNotes(m.hostagesOffGrid, m.hostagesPastBound),     // off the AI grid; past the room's 16 (`./hostages`)
        ...(fit.dropped ? [`${fit.dropped} NPC${fit.dropped === 1 ? '' : 's'} sit out (8 a side, ${Math.min(own.players, 16)} in all)`] : []),
      ];
      const against = fit.kept.length ? ` against ${fit.kept.length} NPC${fit.kept.length === 1 ? '' : 's'}` : '';
      say(`playing the layout${against}${notes.length ? ` · ${notes.join(' · ')}` : ''}`, fit.dropped > 0 || m.unplayable !== undefined);
    } catch (e) {
      const unowned = unownedProps as Object3D | null;
      unownedProps = null;
      (unowned?.userData['dispose'] as (() => void) | undefined)?.();                 // LATER 456: a failed start's props, once
      endMatch();
      if (held && !agentGuard) restorePlace();                 // an agent refusal keeps intervening human view/selection
      if (agentGuard) editPlace = null;
      doc.body.classList.remove(FORGE_MATCHING_CLASS);
      holdEditor(false);
      matchHost.hidden = true;
      say(`the match would not start: ${e instanceof Error ? e.message : String(e)}`, true);
      if (e instanceof ForgeAgentError) throw e;
    } finally { busy = false; showLoading(null); }
  };
  const togglePlay = (): void => {
    if (match) { endMatch(); return; }
    if (refuseMissingPacks('Play')) return;
    void proceedIfClear('Play anyway').then((ok) => { if (ok) void startMatch(); });
  };
  playBtn.addEventListener('click', togglePlay);
  /* The Play settings: the gear (never a Play) or the button's context menu opens them under the button; a press
     elsewhere or Escape closes them; a change is kept with the view's settings. */
  const setPlaySettingsOpen = (open: boolean): void => {
    playSettings.hidden = !open;
    playBtn.classList.toggle('has-popup', open);
    if (!open) return;
    playSpawnIn.value = playSpawn;
    playSideIn.value = playSide;
    const r = playBtn.getBoundingClientRect();
    playSettings.style.left = `${Math.max(8, Math.min(r.left, doc.documentElement.clientWidth - playSettings.offsetWidth - 8))}px`;
    playSettings.style.top = `${r.bottom + 6}px`;
    playSpawnIn.focus();
  };
  playGear.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); setPlaySettingsOpen(playSettings.hidden); });
  playBtn.addEventListener('contextmenu', (e) => { e.preventDefault(); setPlaySettingsOpen(true); });
  playSpawnIn.addEventListener('change', () => {
    playSpawn = playSpawnIn.value === 'random' ? 'random' : 'camera';
    writeView();
    say(playSpawn === 'random' ? 'Play: you spawn at one of your side’s spawns, at random' : 'Play: you spawn under the camera');
  });
  playSideIn.addEventListener('change', () => {
    const v = playSideIn.value;
    playSide = v === 'seal' || v === 'terrorist' ? v : 'auto';
    writeView();
    say(playSide === 'auto' ? 'Play: your side from the NPCs' : `Play: you spawn as ${playSide === 'seal' ? 'a SEAL' : 'a Terrorist'}`);
  });
  doc.addEventListener('pointerdown', (e) => {
    const t = e.target as Node;
    if (!playSettings.hidden && !playSettings.contains(t) && !playGear.contains(t)) setPlaySettingsOpen(false);
  });
  doc.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || playSettings.hidden) return;
    e.stopPropagation();
    setPlaySettingsOpen(false);
    playBtn.focus();
  }, true);
  checkBtn.addEventListener('click', () => {
    if (checking || busy || !base) return;
    checking = true;
    void collectCheck()
      .then((found) => { checking = false; if (found) showCheckSheet(found); })   // FUI-2 (IA-1): a sheet; the check is over
      .finally(() => { checking = false; });
  });

  /* ================= the lobby (FG-26; `./lobbyClient`, the popup `./lobby`) ================= */
  /** The server's routes and socket at the page's own origin (`../connectHost`: `server=` only under a development build's `?devtools`, which `?devmode` sets). */
  const lobbyBase = (): string => accountServiceBase(globalThis.location.search, globalThis.location, import.meta.env.DEV);
  const setAddress = (id: string | null): void => {
    try { globalThis.history.replaceState(globalThis.history.state, '', addressWithLobby(globalThis.location.href, id)); } catch { /* the address stays */ }
  };
  /** The lobby's map: the base's archive, or the blank floor's library (the popup's header, the ARMORY's world). */
  const lobbyMapStem = (l: Layout): string => (l.base.kind === 'map' ? l.base.archive : l.base.library);
  /** Whether this disc opens a layout's base: a blank floor needs no archive (the load's rule and a joiner's return's). */
  const holdsBase = (b: LayoutBase): boolean => b.kind === 'blank' || (b.kind === 'content' ? holdsContentBase(b) : entries.some((a) => a.stem === b.archive));
  /**
   * R6 fix-up (the review's blocking finding on item 7): a content base is held only when the page's content source
   * answers for its authored map (an answer still to come counts: its load refuses in words, and the fallback keeps the
   * autosave, `fallBack`). One whose pack is not here is a base this page lacks, as a map this disc lacks is (#348's
   * re-review), so the load opens the earlier layout or a fallback that never writes over the player's work.
   */
  function holdsContentBase(b: ContentLayoutBase): boolean {
    const key = contentBaseValue(b);
    if (heldContentMap?.key === key) return true;
    let got: unknown;
    try { got = contentSource.map(contentBaseRef(b)); } catch { return false; }
    if (got === null || got === undefined) return false;
    // R7-6 (round 6's finding): the answer kept for this base's load (`loadContentWorld`), so a source whose map() fetches
    // reads the member once a boot. One entry, by the base's words; taken by the load, dropped at the next base change.
    heldContentMap = { key, json: got instanceof Promise ? got.catch(() => null) : got };
    return true;
  }
  /** R6 fix-up: the words for a layout the load could not open -- a content base's own refusal, else the caller's. */
  const unheldWords = (l: Layout | null, otherwise: string): string => (l?.base.kind === 'content' ? contentBaseRefusal(l.base) : otherwise);
  /** The ARMORY's canvas renderer (FG-27's report: `armoryViewPaint` on a renderer of the window's own), made at its first draw. */
  const armoryPainter = (): { paint: ReturnType<typeof armoryViewPaint>; dispose(): void } => {
    let made: ViewerRenderer | null = null, asked = false, gone = false;
    const paint = armoryViewPaint((canvas) => {
      if (!asked) {
        asked = true;
        void createRenderer(canvas).then((r) => {
          if (gone) { r.renderer.dispose(); return; }
          r.setPresentation('ps2');                          // the screen's own 640 x 448 frame
          made = r;
        }, (e: unknown) => { say(`the ARMORY will not draw: ${e instanceof Error ? e.message : String(e)}`, true); });
      }
      return made?.renderer ?? null;
    });
    return { paint, dispose: () => { gone = true; made?.renderer.dispose(); made = null; } };
  };
  /**
   * FCW-32 step 4 (FUI.R23 D5; H273, H274): why this layout cannot make a lobby -- the online policy's own words
   * (`onlineRecordRefusal`: a creator pack, a creator mode, an authored map), or null. Create lobby's tooltip and its
   * START row say it before the press refuses it (`createLobbyNow`).
   */
  const onlineWhy = (): string | null => {
    const l = layoutNow(false);
    const online = l ? onlineRecordRefusal(recordOfLayout(l, l.name?.trim() || 'Layout')) : [];
    return online.length ? online.map((d) => d.text).join(' ') : null;
  };
  lobbyTitle = () => {
    if (lobby !== null && !lobby.ended) return;
    const title = onlineWhy() ?? 'Make a lobby of this layout on the server: others join from its link';
    if (lobbyBtn.title !== title) lobbyBtn.title = title;
  };
  const drawLobbyBtn = (): void => {
    const open = lobby !== null && !lobby.ended;
    lobbyBtn.innerHTML = `${icon('lobby')}<span>${open ? 'Lobby' : 'Create lobby'}</span>`;
    lobbyBtn.setAttribute('aria-label', open ? 'Lobby' : 'Create lobby');      // R7-1: icon-only, named by its label
    lobbyBtn.title = open ? 'Show or hide the lobby window' : onlineWhy() ?? 'Make a lobby of this layout on the server: others join from its link';
    lobbyBtn.classList.toggle('is-on', lobby?.shown === true && lobby.popup !== null);
    saveMapBtn.hidden = !(lobby && lobby.role === 'joiner' && !lobby.ended && lobby.layout);
    playBtn.disabled = editsLocked();
    for (const i of [gameTypeSel, lightIn, lightReset, fogIn, fogReset, numIn.players, numIn.rounds, numIn.roundSeconds, ffIn, npcSel, fx, fy, fz, fyaw]) i.disabled = editsLocked() || (i === fogReset && settings.fogFar === null);
    fillStubFields();                                         // pitch, roll, scale: off under the lobby's lock too
    showResets();                                             // and the rows' resets
    gizmo.enabled = !editsLocked();
    statusChips.update();                                     // FUI-4: the lobby's lock
  };
  const setLobbyShown = (on: boolean): void => {
    if (!lobby?.popup) return;
    lobby.shown = on;
    lobby.popup.setShown(on);
    if (on) padMenu.close();
    drawLobbyBtn();
  };
  /**
   * The lobby let go here: the window, the socket, the ARMORY's renderer, the address; a joiner's own layout back.
   * FG-48c: the host's LEAVE hands the lobby on (`handOnLobby`: closed by the server with none to take it); `close`, the
   * host's "Close the lobby", closes it for everyone (`closeLobby`). Either is proved by `lobbyHostProof` (FG-38: a guest
   * creator's pass is never its bearer; a guest successor's is).
   *
   * The FG-48 batch review's F2: the order matters. The socket's end reaching the server first hands the lobby on and
   * drops this page's proof, so a CLOSE would then be refused (403) and the lobby left open under the successor, and a
   * LEAVE with none to take it would leave the lobby waiting rather than closed. So the request is awaited before the
   * socket closes (`leaveLobbyInOrder`, bounded by `LOBBY_LEAVE_WAIT_MS`), and a failure is said; the window, the
   * renderer, the address and the editor go at once, so only the socket's close waits. That order is an explicit LEAVE's
   * or CLOSE LOBBY's, from the window or the START menu, the socket still the session's.
   *
   * The FG-48 re-review's F1: when the session no longer holds the socket (`socketGone` -- a lobby match's end, whose
   * `match.close()` shut it, or the start's failure after the hand-off, `./match` closing the client it was handed), the
   * socket's close was the hand-on, so nothing is asked after it (a request then met a 403 and said an untrue line) and
   * nothing is said; the lobby is only let go here.
   */
  const leaveLobby = (close = false): void => {
    const l = lobby;
    if (!l) return;
    const socketGone = l.session.net() === null;
    const p = l.ended ? null : lobbyHostProof(l, l.session.me());
    lobby = null;
    l.popup?.dispose();
    l.painter.dispose();
    const request = !p ? null : close
      ? async () => ((await closeLobby(lobbyBase(), l.id, p.hostTicket, p.bearer)) ? { ok: true as const } : { ok: false as const, words: 'the server refused it or could not be reached' })
      : async () => { const a = await handOnLobby(lobbyBase(), l.id, p.hostTicket, p.bearer); return a.ok ? { ok: true as const } : { ok: false as const, words: a.words }; };
    void leaveLobbyInOrder(close ? 'close' : 'leave', { socketGone, request, closeSocket: () => l.session.close(), say: (line) => say(line, true) });
    setAddress(null);
    drawLobbyBtn();
    if (!match) say('building');
    if (l.role === 'joiner') void ownLayoutBack();            // LATER 215: after, so its line about the autosave stays
  };
  /**
   * A joiner's own work back, as this browser kept it (the host's layout was never written over it). LATER 215: one it
   * does not open -- unreadable, or on a map this disc lacks -- is set aside or kept until the player edits
   * (`ownLayoutOnReturn`), since the host's layout stays open and the autosave comes back on.
   */
  const ownLayoutBack = async (): Promise<void> => {
    await savesOpen();
    listsReread(await forgeSaves.reread());
    drawCustomMaps();                                         // FP-6: the group the join's load did not read (R7-A)
    forgeSaves.take('autosave');                              // the autosave this return opens (or keeps) is the page's now
    const back = await ownLayoutOnReturn(forgeSaves.text('autosave'), (l) => holdsBase(l.base), setAsideAutosaveNow);
    keepEarlier = back.keepEarlier;
    autosaveOff = false;
    if (back.open) void openLayout(back.open).catch((e: unknown) => { keepEarlier = true; say(String(e), true); });
    else if (back.unheld && back.keepEarlier) say('Your own layout needs a map this page cannot open, so it is kept until you edit', true);
    else sayAside(back);
  };
  /** The room started the match: the window closes, the layout is composed as Play's, the match mounted on the lobby's client. */
  const launchLobbyMatch = async (l: LobbyHere): Promise<void> => {
    l.popup?.dispose();
    l.popup = null;
    l.shown = false;
    drawLobbyBtn();
    if (playing) stopPlay();
    padMenu.close();
    for (let i = 0; busy && i < 100; i++) await new Promise((r) => setTimeout(r, 100));   // a load under way finishes first
    if (lobby !== l || match) return;
    busy = true;
    busyCause = 'lobbyMatch';
    showLoading('Starting the lobby\'s match');
    try {
      const m = await composeForMatch(false);
      if (!m) throw new Error('this base has no hull to play on');
      const [clips, extras] = await Promise.all([archives.clips(MATCH_CLIPS), matchExtras(archives.sourceRequest(), m.c.groundMap)]);
      if (lobby !== l) return;
      const h = l.session.handOff();
      if (!h) throw new Error('the lobby ended before its match');
      select(null);
      doc.body.classList.add(FORGE_MATCHING_CLASS);
      holdEditor(true);
      matchHost.hidden = false;
      drawMatchBack();
      matchHost.replaceChildren(matchBack, statusChips.matchElement);   // FUI-4: the agent's chip beside Back
      enterMatchScope();
      match = startForgeLobbyMatch(matchHost, {
        map: m.map, clips, effects: extras.effects, sound: extras.sound, handOff: h, pinned: l.pinned, gameName: l.name, lateJoiner: l.lateJoiner,
        forgeLighting: forgeLightingOptions(m.own, baseMap), brighten: matchBrightenOf(m.own), ...(m.gameMode ? { gameMode: m.gameMode } : {}), source: archives.sourceRequest(),   // F7 (a): the overlay's cues read from it
      });
      matchOfLobby = true;
      say(m.unplayable ? `the lobby's match · ${l.name} · ${m.unplayable}` : `the lobby's match · ${l.name}`, m.unplayable !== undefined);
    } catch (e) {
      // The FG-48 re-review's F1: a failure after the hand-off left no socket with the session (`./match` closed the
      // client it was handed, or `endMatch` the match's), so `leaveLobby` sends nothing after it -- the socket's close
      // was the hand-on; one before the hand-off still holds the socket, and the leave keeps F2's order.
      endMatch();
      doc.body.classList.remove(FORGE_MATCHING_CLASS);
      holdEditor(false);
      matchHost.hidden = true;
      say(`the lobby's match would not start: ${e instanceof Error ? e.message : String(e)}`, true);
      leaveLobby();
    } finally { busy = false; showLoading(null); }
  };
  /**
   * Into the lobby `id`: its socket opened (the hello's `forge`), the window mounted over the forge, the address its link.
   * LATER 275 (SA-7i's page half; a product-track adaptation of the transport): `seat`, a placed lobby's door and forge
   * token (the create's, or the joiner's `askForgeSeat`), opens the socket at that door with the token (`lobbySocketOf`);
   * none, the page's pinned `/ws` as before. A door the page does not follow is said, the creator's lobby closed (its host
   * ticket alone proves it), and nothing entered: false. `l.pinned` stays the page's own socket (the match's hand-off).
   * LATER 306: that close is awaited and a failed one said -- else a signed-in host holds a lobby it cannot enter, its
   * next Create refused (409) until the server's idle sweep ends it.
   */
  const enterLobby = async (o: { id: string; name: string; role: 'host' | 'joiner'; hostTicket: string | null; ticket: string | null; guest: boolean; listed: boolean; locked: boolean; layout: Layout; lateJoiner: boolean; seat: { door: string; token: string } | null }): Promise<boolean> => {
    const pinned = pinnedMatchSocket(globalThis.location.search, globalThis.location, import.meta.env.DEV);
    const sock = lobbySocketOf(pinned, o.seat);
    if (!sock) {
      say(`the lobby's server is not one this page joins: the lobby was not entered`, true);
      if (o.role === 'host' && o.hostTicket && !(await closeLobby(lobbyBase(), o.id, o.hostTicket))) {
        say(`the lobby's server is not one this page joins, and the lobby could not be closed: it ends on its own once idle (until then a new lobby may be refused)`, true);
      }
      return false;
    }
    const client = openLobbySocket({ url: sock.url, id: o.id, hostTicket: o.hostTicket, ticket: o.ticket, token: sock.token, name: '' });
    const stem = lobbyMapStem(o.layout);
    const players = settingsOf(o.layout).players;
    let armory: Promise<ArmoryData> | null = null;
    const session = new ForgeLobbySession(client, {
      title: () => ({ name: o.name, map: stem, players }),
      armoryData: () => {
        const map = baseMap ?? charMap;
        if (!map) return null;
        armory ??= lobbyArmoryData(archives.sourceRequest(), map);
        return armory;
      },
    });
    const painter = armoryPainter();
    const l: LobbyHere = { ...o, pinned, session, popup: null, painter, shown: true, ended: false };
    lobby = l;
    // FG-48c: the host's seams follow this page's own seat -- its host flag and a proof (`lobbyHostProof`: the creator's
    // host ticket, or a bearer; FG-38: a guest creator's pass never its bearer) -- read each frame, so a successor's
    // window gains them live and an old host's loses them. FG-45: the visibility.
    const hostProof = (): LobbyHostProof | null => lobbyHostProof(l, session.me());
    const visibility = (): ForgeLobbyVisibility | null => { const p = hostProof(); return !p ? null : {
      listed: () => l.listed,
      set: async (on) => {
        const a = await setListed(lobbyBase(), l.id, on, p.hostTicket, p.bearer);
        if (!a.ok) return a.words;
        l.listed = a.listed;
        pop(a.listed ? 'The lobby shows in Custom matches' : 'The lobby is joined by its link alone');
        return null;
      },
    }; };
    // FG-48a: the password, the host's as the visibility is, proved the same way; the password typed goes to the PATCH alone.
    const password = (): ForgeLobbyPassword | null => { const p = hostProof(); return !p ? null : {
      locked: () => l.locked,
      set: async (pw) => {
        const a = await setPassword(lobbyBase(), l.id, pw, p.hostTicket, p.bearer);
        if (!a.ok) return a.words;
        l.locked = a.locked;
        pop(a.locked ? 'The lobby asks a password' : 'The lobby is open to its link');
        return null;
      },
    }; };
    // FG-48b: the kick, the host's as the password is, proved the same way.
    const kick = (): ForgeLobbyKick | null => { const p = hostProof(); return !p ? null : {
      kick: async (seat) => {
        const a = await kickSeat(lobbyBase(), l.id, seat, p.hostTicket, p.bearer);
        return a.ok ? null : a.words;
      },
    }; };
    // FG-48c: the host's "Close the lobby" (CLOSE LOBBY in the window), for everyone; LEAVE (the seam's `close`) hands it on.
    const end = (): ForgeLobbyEnd | null => { const p = hostProof(); return !p ? null : { close: () => { if (lobby === l) leaveLobby(true); } }; };
    // FG-48c: the host handed to this seat -- the lobby read once, so LISTED and the password show the server's state.
    // The FG-48 re-review's F1: a told lobby naming another seat as host drops the creator's ticket (`forgetStaleHost`),
    // so a page that handed the lobby on never proves itself host again with a dead ticket, on any path.
    let hosting = hostProof() !== null;
    session.onLobby((ev) => {
      forgetStaleHost(l, ev, session.me());
      const now = hostProof() !== null;
      if (now && !hosting && lobby === l) {
        void fetchLobby(lobbyBase(), l.id).then((got) => {
          if (!got.ok || lobby !== l) return;
          l.listed = got.lobby.listed === true;
          l.locked = got.lobby.locked === true;
        });
        l.popup?.notice('You host this lobby now: LAUNCH, LISTED, the password, KICK and CLOSE LOBBY are yours');
        pop('You host the lobby now');
      }
      hosting = now;
    });
    l.popup = mountForgeLobby(doc.body, { ...session.deps(doc, () => { if (lobby === l) leaveLobby(); }), visibility, password, kick, end }, { paint: painter.paint });
    session.onLaunch(() => { if (lobby === l) void launchLobbyMatch(l); });
    session.onEnd((_code, reason) => {
      if (lobby !== l) return;
      l.ended = true;
      const words = lobbyEndWords(reason, l.guest) ?? 'The lobby ended';   // FG-38 (R4): a guest's lapsed pass said so
      l.popup?.notice(words);                            // shown in the window; its close takes it down
      if (l.popup) { l.shown = true; l.popup.setShown(true); }
      setAddress(null);
      drawLobbyBtn();
      say(words, true);
    });
    setAddress(o.id);
    select(null);
    drawLobbyBtn();
    say(`${o.role === 'host' ? 'hosting' : 'in'} the lobby ${o.name}${o.guest ? ' as a guest' : ''}`);
    return true;
  };
  /**
   * Create lobby (the toolbar, the START menu): this layout posted -- signed in through the launcher's session (FG.R11),
   * else a guest (FG.R21; FG-38: the create answers the guest's pass, which the hello carries and nothing else).
   */
  const createLobbyNow = async (): Promise<void> => {
    if (lobby && !lobby.ended) { setLobbyShown(!lobby.shown); return; }
    if (lobby) leaveLobby();
    if (busy || match || !base) return;
    if (playing) stopPlay();
    const l = layoutNow();
    if (!l) return;
    if (refuseMissingPacks('Create lobby')) return;
    // R3-B (item 6; H273, H274): a lobby plays the disc's own content -- a layout that needs a creator pack or names a
    // creator mode is refused before anything is asked or posted, in the policy's own words (central refuses it too).
    const online = onlineRecordRefusal(recordOfLayout(l, l.name?.trim() || 'Layout'));
    if (online.length) { notifier.refused(online.map((d) => d.text).join(' ')); return; }
    if (!(await proceedIfClear('Create anyway'))) return;
    const session = pageSession(globalThis.window);
    const ticket = session.ticket();
    const who = ticket ? `as ${session.account()?.name ?? 'your account'}` : 'as a guest (nothing of a guest is kept after the lobby)';
    const stem = lobbyMapStem(l);
    // FG-45: the lobby's visibility beside its name, off unless ticked (the pad changes it from the window afterwards).
    const visibilityToggle = lobbyVisibilityToggle(doc);
    // FG-48a: an optional password under it (the host changes or clears it from the window afterwards).
    const passwordField = lobbyPasswordField(doc);
    const extras = el(doc, 'div', 'fx-lobby-create-extras');
    extras.append(visibilityToggle.root, passwordField.root);
    const name = await askText('Create lobby', `This layout goes to the server for the lobby's life; each player draws it from their own disc. You host ${who}.`,
      defaultLobbyName(entries.find((a) => a.stem === stem)?.label ?? stem), 32, 'Create', extras);
    if (name === null) return;
    if (name === '') { say('a lobby needs a name', true); return; }
    if (!passwordField.ok()) { say('a lobby password is 1 to 32 letters, digits, spaces or signs', true); return; }
    busy = true;
    busyCause = 'lobby';
    say('making the lobby…');
    try {
      const made = await createLobby(lobbyBase(), name, l, ticket, undefined, { listed: visibilityToggle.listed(), password: passwordField.password() });
      if (!made.ok) { say(`the lobby was not made: ${made.words}`, true); return; }
      if (made.stale) pop('Your sign-in had ended: you host as a guest');
      await enterLobby({ id: made.id, name, role: 'host', hostTicket: made.hostTicket, ticket: made.guest ? made.pass?.ticket ?? null : ticket, guest: made.guest, listed: made.lobby.listed === true, locked: made.lobby.locked === true, layout: l, lateJoiner: false, seat: made.seat });
    } finally { busy = false; }
  };
  /** `/forge?lobby=<id>`: the lobby's layout fetched and opened read-only, then its socket and window; false when the join stops. */
  const joinLobby = async (id: string): Promise<boolean> => {
    showLoading('Joining the lobby');
    const stop = async (line: string): Promise<false> => {
      loadingLine.textContent = line;
      say(line, true);
      await tellCard('This lobby cannot be joined', line);
      showLoading(null);
      setAddress(null);
      return false;
    };
    const got = await fetchLobby(lobbyBase(), id);
    if (!got.ok) return stop(`The lobby could not be read: ${got.words}.`);
    const lacking = missingArchives(got.lobby.layout, new Set(entries.map((a) => a.stem)));
    if (lacking.length) return stop(`Its layout needs ${lacking.join(', ')}, which ${lacking.length === 1 ? 'is' : 'are'} not on ${sourceWhere(archives.sourceRequest())} (FG.R12).`);
    showLoading(null);
    autosaveOff = true;                                     // the host's layout is not written over this browser's own
    try {
      await openLayout(got.lobby.layout);
    } catch (e) {
      autosaveOff = false;
      return stop(`Its layout would not open: ${e instanceof Error ? e.message : String(e)}`);
    }
    const ticket = pageSession(globalThis.window).ticket();
    // FG-38: no sign-in, a guest's pass -- asked once the layout is open, so FG-28's 60 s run from just before the hello.
    const guestPass = ticket ? null : await askGuest(lobbyBase(), id);
    if (guestPass && !guestPass.ok) { ownLayoutBack(); return stop(`No guest pass for this lobby: ${guestPass.words}.`); }
    // FG-48a: a locked lobby -- its password asked in a card (after the guest pass), the seat entered by its bearer
    // (the login's ticket or the guest's pass) before its hello (`joinLockedLobby`: a refusal said and asked again, a
    // cancel the join's end). Its review's F2: a guest's pass lapsed while the card was open is renewed once.
    let seatTicket = ticket ?? guestPass?.pass?.ticket ?? null;
    if (got.lobby.locked === true) {
      if (!seatTicket) { ownLayoutBack(); return stop('This lobby asks a password, and this server has no accounts to admit you by: it cannot be joined from here.'); }
      const joined = await joinLockedLobby(got.lobby.name, seatTicket, {
        ask: (line) => askText('This lobby asks a password', line, '', LOBBY_PASSWORD_MAX, 'Join', null, true),
        enter: (password, bearer) => enterLocked(lobbyBase(), id, password, bearer),
        renew: ticket ? null : async () => {
          const fresh = await askGuest(lobbyBase(), id);
          if (!fresh.ok) return { ok: false, words: fresh.words };
          return fresh.pass ? { ok: true, bearer: fresh.pass.ticket } : { ok: false, words: 'this server gives no guest passes' };
        },
        say: (line) => say(line, true),
      });
      if (!joined.ok) {
        ownLayoutBack();
        if (joined.cancelled) { setAddress(null); say('the join was cancelled'); return false; }
        return stop(joined.line);
      }
      seatTicket = joined.bearer;
    }
    // LATER 275: a placed lobby's seat (its host's door and a forge token), asked last -- the token lives 60 s -- by the
    // seat's own ticket; a lobby central runs itself answers none (409), and a page with no ticket (a server without
    // accounts) asks nothing: both keep the page's own socket.
    const placed = seatTicket ? await askForgeSeat(lobbyBase(), id, seatTicket) : null;
    if (placed && !placed.ok) { ownLayoutBack(); return stop(`The lobby's server did not seat you: ${placed.words}.`); }
    if (!(await enterLobby({ id, name: got.lobby.name, role: 'joiner', hostTicket: null, ticket: seatTicket, guest: !ticket, listed: got.lobby.listed === true, locked: got.lobby.locked === true, layout: got.lobby.layout, lateJoiner: got.lobby.state.launched, seat: placed?.seat ?? null }))) {
      ownLayoutBack();
      return stop('The lobby\'s server is not one this page joins.');
    }
    return true;
  };
  lobbyBtn.addEventListener('click', () => { void createLobbyNow(); });
  const copyLobbyLink = (): void => {
    if (!lobby) return;
    const link = addressWithLobby(globalThis.location.href, lobby.id);
    void globalThis.navigator?.clipboard?.writeText(link).then(() => pop('Lobby link copied'), () => say(link));
  };

  /* ================= the wiring ================= */
  const setDocks = (shown: boolean): void => {
    if (!shown) centerDock.querySelector<HTMLButtonElement>('[data-forge-tab="viewport"]')?.click();
    doc.body.classList.toggle('fx-docks-off', !shown);
    docksBtn.classList.toggle('is-on', shown);
    shell.refresh();
  };
  docksBtn.addEventListener('click', () => setDocks(doc.body.classList.contains('fx-docks-off')));
  for (const [k, b] of Object.entries(modeBtns)) b.addEventListener('click', () => (k === 'place' ? enterPlace() : setMode(k as Mode)));
  /* The Select tool's settings: the gear (a click on it also takes the Select tool, as the button would) or the
     button's context menu opens them under the button; a press elsewhere or Escape closes them. */
  const placeSelectSettings = (): void => {
    const r = modeBtns.select.getBoundingClientRect();
    selectSettings.style.left = `${Math.max(8, r.left)}px`;
    selectSettings.style.top = `${r.bottom + 6}px`;
  };
  const setSelectSettingsOpen = (open: boolean): void => {
    selectSettings.hidden = !open;
    modeBtns.select.classList.toggle('has-popup', open);
    if (!open) return;
    selectMapPropsIn.checked = selectMapProps;
    selectUserPropsIn.checked = selectUserProps;
    placeSelectSettings();
    selectMapPropsIn.focus();
  };
  selectGear.addEventListener('click', () => setSelectSettingsOpen(selectSettings.hidden));
  modeBtns.select.addEventListener('contextmenu', (e) => { e.preventDefault(); setMode('select'); setSelectSettingsOpen(true); });
  doc.addEventListener('pointerdown', (e) => {
    const t = e.target as Node;
    if (!selectSettings.hidden && !selectSettings.contains(t) && !selectGear.contains(t)) setSelectSettingsOpen(false);
  });
  doc.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || selectSettings.hidden) return;
    e.stopPropagation();
    setSelectSettingsOpen(false);
    modeBtns.select.focus();
  }, true);
  selectMapPropsIn.addEventListener('change', () => {
    selectMapProps = selectMapPropsIn.checked;
    writeView();
    say(selectMapProps ? 'Select: map props can be selected' : 'Select: map props are passed over');
  });
  selectUserPropsIn.addEventListener('change', () => {
    selectUserProps = selectUserPropsIn.checked;
    writeView();
    say(selectUserProps ? 'Select: user props can be selected' : 'Select: user props are passed over');
  });
  moveBtn.addEventListener('click', () => setGizmo('translate'));
  turnBtn.addEventListener('click', () => setGizmo('rotate'));
  scaleBtn.addEventListener('click', () => setGizmo('scale'));
  lockBtn.addEventListener('click', () => {
    if (picks.size === 0 && lockHeld.length > 0) {
      // The same button, now Unlock: the just-locked unlocked and selected again (the outliner's unlock, `lockToggle`).
      const held = lockHeld.filter((r) => roots.includes(r));
      personEdit('piece.unlock', {}, () => {
        lockHeld = [];
        for (const r of held) { delete r.userData['forgeLock']; picks.add(r); }
        showSelection();
        edit();
        say('unlocked');
      });
      return;
    }
    personEdit('piece.lock', { refs: selectionIds() }, () => {
      if (picks.size === 0) return;
      for (const r of picks.items) r.userData['forgeLock'] = true;
      lockHeld = [...picks.items];                            // kept in the Inspector, so its button can unlock them
      picks.clear();
      showSelection();
      edit();
      say('locked');
    });
  });
  dupBtn.addEventListener('click', duplicate);
  delBtn.addEventListener('click', remove);
  search.addEventListener('input', drawAssets);
  paletteSel.addEventListener('change', () => { void showPalette(paletteSel.value).catch((e: unknown) => say(String(e), true)); });
  /**
   * FP-6 item 1 (FP.R4; product track, a browser adaptation with no original): the base list's Custom Maps group, added
   * after the page's own groups (OT.R112: Crispy's picker, one group in his conventions and nothing of his changed) --
   * the installed bundles, the bare content maps no bundle stands on, the player's saves (`./customMaps`). No row, no
   * group. Drawn at boot and again each time New asks, so an install made since is listed.
   */
  const customRecords = (): readonly CustomMapRecord[] => { try { return contentSource.customMaps?.() ?? []; } catch { return []; } };
  const customIndex = (): readonly { ref: ContentRef; name: string }[] => { try { return contentSource.mapIndex?.() ?? []; } catch { return []; } };
  /** The rows last drawn, and (item 2) the readiness sentence a Custom Maps open owes the toast once it has opened. */
  let customRows: CustomMapRow[] = [];
  let customSwitchWords: string | null = null;
  /** Item 3: the open base's bundle marked (`bundleOpen`): autosave off and Save as while one is open; put back after. */
  function markBundle(r: CustomMapRecord | null): void {
    if (!r && !bundleOpen) return;
    if (r && !bundleOpen) autosaveOff = true;
    else if (!r && bundleOpen) autosaveOff = false;
    bundleOpen = r;
    const label = saveBtn.querySelector('span');
    if (label) label.textContent = r ? 'Save as' : 'Saves';
    saveBtn.title = r ? 'Copy this installed custom map into your saves, to edit' : 'Named layouts in this browser, a file, or a share link';
  }
  /** Item 2: said once per switch, after the open (a refused open says its own words instead). */
  const sayCustomSwitch = (): void => { const w = customSwitchWords; customSwitchWords = null; if (w) pop(w); };
  const drawCustomMaps = (): void => {
    baseSel.querySelector('optgroup[data-forge-group="custom-maps"]')?.remove();
    const rows = customMapRows({ records: customRecords(), mapIndex: customIndex(), saves: named, available: availablePacks() });
    if (!rows.length) return;
    const g = el(doc, 'optgroup');
    g.label = CUSTOM_MAPS_GROUP;
    g.dataset['forgeGroup'] = 'custom-maps';
    customRows = rows;
    // Item 2 (FP.R4): the short caption on the row, the whole readiness sentence its title (`../packs/readiness`).
    for (const r of rows) { const o = el(doc, 'option', '', customRowLabel(r)); o.value = r.value; o.title = customRowSentence(r); g.append(o); }
    const current = baseSel.value;
    baseSel.append(g);
    if (current) baseSel.value = current;
  };
  /**
   * New's first question (the owner, 2026-11-06): what the layout starts from -- the bases `baseSel` lists, in its groups
   * (Custom / Preset: the new empty maps; Multiplayer and Campaign: the disc's maps, each with its own game type), the
   * current base's row chosen at first. Null when cancelled.
   */
  const chooseNewBase = (): Promise<string | null> => {
    drawCustomMaps();                                             // FP-6: the group read again (an install since boot)
    const groups: (readonly [string, (readonly [string, string, string?])[]])[] = [];
    for (const child of Array.from(baseSel.children)) {
      if (child instanceof HTMLOptGroupElement) {
        const rows = Array.from(child.querySelectorAll('option')).filter((o) => !o.disabled).map((o) => [o.value, o.textContent ?? o.value, o.title] as const);
        groups.push([child.label, rows]);
      } else if (child instanceof HTMLOptionElement && !child.disabled) {
        groups.push(['Custom / Preset', [[child.value, child.textContent ?? child.value]]]);
      }
    }
    const current = baseValue();
    const first = groups.some(([, rows]) => rows.some(([v]) => v === current)) ? current : groups[0]?.[1][0]?.[0] ?? '';
    return askChoice('New layout', 'Start from a preset (a new empty map set up for its mode) or one of the disc’s maps.', groups, first, 'Next');
  };
  newBtn.addEventListener('click', () => { void (async () => {
    if (refuseUnderCard()) return;                                // FUI-2 (IA-1)
    baseAsk.hidden = true;
    if (refuseEdit()) return;
    // The base first (a preset, a map); a preset then asks which map it is built from (`layoutForSelect`); the work this
    // drops last, once everything is chosen. Any of them cancelled: the layout stays as it is.
    const chosen = await chooseNewBase();
    if (chosen === null) return;
    const next = await layoutForSelect(chosen, paletteSel.value || entries[0]?.stem || BLANK_LIBRARY).catch((e: unknown) => { say(String(e), true); return null; });
    if (!next) return;
    const entities = (layoutEntities.zones?.length ?? 0) + (layoutEntities.markers?.length ?? 0) + (layoutEntities.spawners?.length ?? 0);
    const asked = newLayoutDropWords(roots.length, layoutRules !== null, entities);
    if (asked) {
      // Save it first (a named save in this browser, as the Saves card's), drop it, or stay where it is.
      const answer = await askSaveFirst('Save this layout first?', asked);
      if (answer === null) return;
      if (answer === 'save') {
        // As the Saves card's Save as: a named save in this browser, a save of the name replaced.
        const current = layoutForSave();
        if (!current) return;
        const name = await askText('Save this layout', 'A save with this name is replaced. It stays in this browser.', layoutName, RECORD_LIMITS.name, 'Save');
        if (!name) return;
        const kept = saveNamedRules(named, name, recordOfLayout(current, name), (current as ForgeLayout).rules);
        if (kept.error) { say(kept.error, true); return; }
        if ((await persistNamed(kept.saves)) !== 'written') return;    // refused or saved elsewhere: said there, nothing dropped
        pop(`Saved ${name}`);
      }
    }
    await openLayout(next, 'player').then(sayCustomSwitch, (e: unknown) => { customSwitchWords = null; say(String(e), true); });
  })(); });
  /**
   * The layout renamed as a person's edit (`layout.name`): one undoable step, autosaved, refused (and said) where an edit
   * is refused -- the name field's and Saves > Save as's one path (LATER 804). False when refused.
   */
  const renameLayout = (next: string): boolean => personEdit('layout.name', { name: next }, () => {
    layoutNameIn.value = next;
    if (next === layoutName) return;
    layoutName = next;
    edit();
  });
  layoutNameIn.addEventListener('change', () => {
    const next = layoutNameIn.value.trim().slice(0, LAYOUT_NAME_MAX);
    if (!renameLayout(next)) layoutNameIn.value = layoutName;
  });
  outlinerSearch.addEventListener('input', drawOutliner);
  outlinerFilter.addEventListener('change', drawOutliner);
  /** The layout a save writes. A joiner's is the lobby's copy: the server's layout, including a piece this disc could not draw. */
  /**
   * FP-6 item 3: the open bundle copied into the player's saves as an ordinary layout (a fresh id, `saveNamedRules`; a
   * save of the name replaced, as the Saves card's Save as), then that copy opened -- the record in MODS untouched.
   */
  const saveBundleAs = async (): Promise<void> => {
    const from = bundleOpen;
    const l = layoutNow();
    if (!from || !l) return;
    await savesOpen();
    const name = await askText('Save as', 'This custom map is installed and read-only: a copy is saved in this browser, and opened to edit.', layoutName || from.name, RECORD_LIMITS.name, 'Save');
    if (!name) return;
    const next = saveNamedRules(named, name, recordOfLayout(l, name), (l as ForgeLayout).rules);
    if (next.error) { say(next.error, true); return; }
    if ((await persistNamed(next.saves)) !== 'written') return;
    const saved = named.find((x) => x.name === name);
    if (!saved) return;
    await openLayout(layoutOfAuthoring(saved), 'player').then(() => pop(`Saved ${name}`), (e: unknown) => say(e instanceof Error ? e.message : String(e), true));
  };
  const layoutForSave = (): Layout | null => (lobby && lobby.role === 'joiner' && !lobby.ended && lobby.layout ? lobby.layout : layoutNow());
  /**
   * The e2e-mega lost press (a browser adaptation, no original): the layout a Saves card press takes (Save as, Download,
   * Share link) -- or, while the page opens one (`busy`) or before any base is open, that press refused and said, never a
   * press that does nothing (`test/forge/pageFirstOpen.test.ts` (A)).
   */
  const layoutToSave = (): Layout | null => {
    const l = busy ? null : layoutForSave();
    if (!l) notifier.refused(busy ? forgeBusyRefusal(busyCause) : FORGE_REFUSALS.noBase);   // LATER 819: the cause's own words
    return l;
  };
  /**
   * Writes `list`, and keeps it as `named` only when the write went through (the fold's re-review, finding A). R3-B: an
   * awaited compare-and-swap on the list last read; a list written elsewhere first answers `conflict` (said, read again).
   */
  const persistNamed = (list: NamedSave[], at = namedAt): Promise<'written' | 'conflict' | 'refused'> => tracked(persistNamedNow(list, at));
  const persistNamedNow = async (list: NamedSave[], at: number): Promise<'written' | 'conflict' | 'refused'> => {
    await savesOpen();
    // the review of R3-B: `list` was built from `named` as read at `at`; a list read again past it is a conflict
    const r = await forgeSaves.update((copy) => writeSaves(list, copy, unreadableSaves), { saves: at });
    if (r.outcome === 'conflict') { savedElsewhere(); return 'conflict'; }
    const ok = r.value && r.outcome !== 'refused';
    if (ok) { refreshNamed(); agentMark(); }                 // `list`, as written; browser adaptation: the agent's revision
    if (!ok) say(unreadableSaves.some((u) => u.whole) ? 'The saved list is one this page cannot read, so it is not written over' : 'This browser refused the save', true);
    return ok ? 'written' : 'refused';
  };
  /** LATER 193 through the store (R3-B): an autosave this build cannot read, set aside; true when it is kept aside. */
  const setAsideAutosaveNow = (text: string): Promise<boolean> => tracked(setAsideAutosaveWrite(text));
  const setAsideAutosaveWrite = async (text: string): Promise<boolean> => {
    await savesOpen();
    const r = await forgeSaves.update((copy) => setAsideAutosave(copy, text));
    if (r.outcome === 'conflict') savedElsewhere();
    return r.value && (r.outcome === 'written' || r.outcome === 'unchanged');
  };
  const downloadLayout = (): void => {
    const l = layoutToSave();
    if (!l) return;
    const record = recordOfLayout(l, l.name?.trim() || 'Layout');
    // FCW-32: a layout with rules downloads its authoring envelope (the record and its rules), which the file open reads.
    const rules = (l as ForgeLayout).rules;
    const kept = rules ? { schema: FORGE_AUTHORING_SCHEMA, version: FORGE_AUTHORING_VERSION, record, rules } : record;
    const a = el(doc, 'a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(kept, null, 1)], { type: 'application/json' }));
    a.download = layoutDownloadName(l.name, l.base);
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    pop(`Saved ${a.download}`);
  };
  /**
   * LATER 214: a kept copy saved as a file, as it was (text: it may not be JSON). A blob link clicked in place -- no new
   * window, so a phone's browser downloads it -- its address let go after a minute, as a phone's download sheet may
   * read it late.
   */
  const downloadKept = (k: KeptAside): void => {
    const a = el(doc, 'a');
    a.href = URL.createObjectURL(new Blob([k.text], { type: 'text/plain' }));
    a.download = `forge-${k.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.txt`;
    a.hidden = true;
    doc.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
    pop(`Saved ${a.download}`);
  };
  /**
   * PAD-1 (FUI.R2; the review's IA-2) and FUI-2 (UX-3; a browser adaptation): the Saves card on the card stack. Circle and
   * Esc (its way back) close it, and START (`padAction`); Cross with no row held is nothing; the d-pad walks its rows
   * (Cross Open, Square Rename, Triangle Delete). A question it asks (rename, delete) is a card over it, and `openSaves`
   * then redraws it in place, its scroll and its held row kept.
   */
  let savesHandle: CardHandle | null = null;
  const closeSaves = (): void => {
    savesHandle?.close();
    savesHandle = null;
  };
  const openSaves = (): void => {
    const card = savesCard(doc, {
      saves: named,
      unreadable: unreadableSaves,
      kept: keptAside(forgeSaves.view()),
      onKeptDownload: (k) => downloadKept(k),
      onKeptDelete: (k) => { void (async () => {
        if (!(await askConfirm('Delete this kept copy?', `${k.name} is removed from this browser for good. Download it first to keep it.`, 'Delete', true))) { openSaves(); return; }
        const r = await forgeSaves.update((copy) => dropKeptAside(copy, k));
        if (r.outcome === 'conflict') { savedElsewhere(); return; }
        const dropped = r.outcome === 'refused' ? 'refused' : r.value;
        if (dropped === 'dropped') pop(`Deleted ${k.name}`);
        else if (dropped === 'gone') say('That copy was already gone');   // another tab took it: not a refusal (the review's L1)
        else say('This browser refused the change', true);
        openSaves();
      })(); },
      shareUrl,
      onOpen: (id) => { void (async () => {
        if (refuseEdit()) return;
        const s = named.find((x) => x.id === id);
        if (!s) return;
        closeSaves();
        await openLayout(layoutOfAuthoring(s), 'player').then(() => pop(`Opened ${s.name}`))
          .catch((e: unknown) => say(e instanceof Error ? e.message : String(e), true));
      })(); },
      onRename: (id) => { void (async () => {
        const s = named.find((x) => x.id === id);
        if (!s) return;
        const name = await askText('Rename this save', 'The name shown in this browser.', s.name, RECORD_LIMITS.name, 'Rename');
        if (!name) { openSaves(); return; }
        const next = renameNamed(named, id, name);
        if (next.error) { say(next.error, true); openSaves(); return; }
        if ((await persistNamed(next.saves)) !== 'written') { openSaves(); return; }
        if (layoutName === s.name) { layoutName = name; layoutNameIn.value = name; }
        openSaves();
      })(); },
      onDelete: (id) => { void (async () => {
        const s = named.find((x) => x.id === id);
        if (!s) return;
        if (!(await askConfirm('Delete this save?', `${s.name} is removed from this browser.`, 'Delete', true))) { openSaves(); return; }
        await persistNamed(deleteNamed(named, id));
        openSaves();
      })(); },
      onSaveAs: () => { void (async () => {
        const l = layoutToSave();
        if (!l) return;
        const name = await askText('Save this layout', 'A save with this name is replaced. It stays in this browser.', layoutName, RECORD_LIMITS.name, 'Save');
        if (!name) { openSaves(); return; }
        // LATER 804: the rename is the page's own edit (`renameLayout`), never a bare assignment. A joiner's save names
        // only its copy, as before; a rename refused (said) keeps the layout's name, and the copy is still saved by it.
        if (!(lobby && lobby.role === 'joiner' && !lobby.ended) && name !== layoutName) renameLayout(name);
        const saved = layoutForSave() ?? l;
        const next = saveNamedRules(named, name, recordOfLayout(saved, name), (saved as ForgeLayout).rules);   // FCW-32: its rules beside it
        if (next.error) { say(next.error, true); openSaves(); return; }
        if ((await persistNamed(next.saves)) === 'written') pop(`Saved ${name}`);
        openSaves();
      })(); },
      onSetAside: () => { void (async () => {
        const r = await forgeSaves.update((copy) => setAsideSaves(copy));
        if (r.outcome === 'conflict') { savedElsewhere(); return; }
        if (!r.value || r.outcome === 'refused') { say('The saved list could not be set aside', true); openSaves(); return; }
        refreshNamed();
        pop('The saved list was set aside, as it was; saving works again');
        openSaves();
      })(); },
      onDownload: () => downloadLayout(),
      onShare: () => { void shareCurrent(); },
      onClose: () => closeSaves(),
    });
    if (savesHandle?.open) { savesHandle.replace(card); return; }
    savesHandle = cards.open(card, { onBack: () => closeSaves(), initialFocus: null, label: 'Saves' });
  };
  const shareCurrent = async (): Promise<void> => {
    const l = layoutToSave();
    if (!l) return;
    // FCW-32 round 2 (the review's F4; FUI.R19): a share code carries the record alone, whose check knows no rules mode --
    // refused by name before the encoding, as the page's other refusals are said.
    const refused = shareRefusal(l as ForgeLayout);
    if (refused) { notifier.refused(refused); return; }
    const offer = await shareOffer(globalThis.location.href, recordOfLayout(l, layoutName.trim() || 'Layout'));
    if (offer.kind === 'too-big') {
      shareUrl = '';
      downloadLayout();
      say('This layout is too large for a link, so it was saved as a file');
      openSaves();
      return;
    }
    shareUrl = offer.url;
    const field = modal.querySelector<HTMLInputElement>('[data-share-link]');
    if (field) field.value = offer.url;
    try {
      await globalThis.navigator.clipboard.writeText(offer.url);
      pop('Share link copied');
    } catch {
      pop('Share link ready to copy');
    }
  };
  const saveLobbyMap = async (): Promise<void> => {
    const l = lobby;
    if (!l || l.role !== 'joiner' || l.ended || !l.layout) return;
    const preset = joinerSavePreset(l.layout.name, l.name);
    const name = await askText('Save this map', 'The lobby’s layout is kept in this browser, with your other layouts.', preset, RECORD_LIMITS.name, 'Save');
    if (!name) return;
    const next = saveNamed(named, name, recordOfLayout(l.layout, name));
    if (next.error) { say(next.error, true); return; }
    if ((await persistNamed(next.saves)) === 'written') pop(`Saved ${name}`);
  };
  saveBtn.addEventListener('click', () => { if (refuseUnderCard()) return; if (bundleOpen) void saveBundleAs(); else openSaves(); });   // FP-6 3   // FUI-2 (IA-1): never over another card
  saveMapBtn.addEventListener('click', () => { void saveLobbyMap(); });
  openBtn.addEventListener('click', () => { if (!refuseUnderCard() && !refuseEdit()) file.click(); });
  file.addEventListener('change', () => {
    const f = file.files?.[0];
    file.value = '';
    if (!f) return;
    void f.text().then((t) => {
      return openLayout(layoutOfAuthoring(readForgeAuthoring(t, f.name.replace(/\.json$/i, '') || 'Layout')), 'player');   // FCW-32: a kept text's rules too
    }).then(() => pop(`Opened ${f.name}`))
      .catch((e: unknown) => say(e instanceof Error ? e.message : String(e), true));
  });

  setMode('select');
  setGizmo('translate');
  setSnap(snap);
  setDocks((globalThis.innerWidth ?? 1280) > 760);       // a narrow window opens on the viewport, the docks a key away
  drawPlayBtn();
  drawLobbyBtn();
  refreshUndo();
  drawOutliner();
  refreshInspector();
  drawSettings();

  /* ================= the forge's menu on START (FG-18, `./padMenu`) ================= */
  const menuHost = el(doc, 'div', 'fx-modal fx-padmenu');
  menuHost.hidden = true;
  doc.body.append(menuHost);
  const cycleSelect = (sel: HTMLSelectElement, by: number): void => {
    const n = sel.options.length;
    if (n === 0) return;
    let i = sel.selectedIndex;
    for (let step = 0; step < n; step++) {
      i = (i + by + n) % n;
      if (!sel.options[i]?.disabled) { sel.selectedIndex = i; sel.dispatchEvent(new Event('change')); return; }
    }
  };
  const optionLabel = (sel: HTMLSelectElement): string => sel.options[sel.selectedIndex]?.textContent ?? '';
  /* ---------- FUI-3: the menu's sub-screens (the Outliner, the Props grid, the check) and its new rows ---------- */
  /** FUI-3 (PAD-7): the Outliner as a sub-screen -- Cross selects and looks, Square locks, Triangle deletes; a hidden map prop shows again. */
  const outlinerScreen = (): MenuItem[] => {
    const placed: MenuItem[] = roots.map((r, i) => {
      const locked = lockedOf(r), missing = r.userData['forgeMissing'] === true;
      return {
        id: `outliner-${i}`, label: placedLabel(r), value: locked ? 'Locked' : picks.has(r) ? 'Selected' : missing ? 'Missing' : `#${i + 1}`,
        note: locked ? 'Locked: Square unlocks it' : 'Cross selects it and looks at it',
        act: () => { if (lockedOf(r)) { notifier.refused('Locked: Square unlocks it'); return; } select(r); focusOn(r); },
        secondary: { label: locked ? 'Unlock' : 'Lock', keepOpen: true, act: () => lockToggle(r) },
        remove: { label: 'Delete', keepOpen: true, act: () => { if (lockedOf(r)) { notifier.refused('Locked: Square unlocks it'); return; } select(r); remove(); } },
      };
    });
    const hidden: MenuItem[] = [...hiddenKeys].sort().map((k) => ({
      id: `outliner-hidden-${k}`, label: k.split('@')[0]!, value: 'Hidden', note: 'A map prop hidden in this layout: Cross or Triangle shows it',
      keepOpen: true, act: () => showHiddenProp(k), remove: { label: 'Show', keepOpen: true, act: () => showHiddenProp(k) },
    }));
    // FCW-32 step 4 (FUI.R23 D4): the rules entities -- Cross picks and looks, Square locks, Triangle deletes, by their ids.
    const entities: MenuItem[] = rulesEntityRefs().map((e) => ({
      id: `outliner-${e.ref}`, label: e.label, value: e.locked ? 'Locked' : entityPicked === e.ref ? 'Selected' : 'Rules',
      note: e.locked ? 'Locked: Square unlocks it' : 'Cross picks it and looks at it',
      act: () => { if (e.locked) { notifier.refused('Locked: Square unlocks it'); return; } lookAtPoint(e.at); pickEntity(e.ref); },
      secondary: { label: e.locked ? 'Unlock' : 'Lock', keepOpen: true, act: () => entityEdit(e.locked ? 'piece.unlock' : 'piece.lock', { refs: [e.ref] }) },
      remove: { label: 'Delete', keepOpen: true, act: () => entityEdit('piece.delete', { refs: [e.ref] }) },
    }));
    if (placed.length === 0 && hidden.length === 0 && entities.length === 0) return [{ id: 'outliner-empty', label: 'Nothing placed yet', disabled: true }];
    return [...sectioned('outliner-placed', 'Placed', placed), ...sectioned('outliner-rules', 'Rules entities', entities),
      ...sectioned('outliner-hidden', 'Hidden map props', hidden)];
  };
  const PROPS_TABS = [['all', 'All'], ['favs', 'Favourites'], ['recent', 'Recent']] as const;
  let propsTab: (typeof PROPS_TABS)[number][0] = 'all';
  const stepPropsTab = (by: number): void => {
    const at = PROPS_TABS.findIndex(([t]) => t === propsTab);
    propsTab = PROPS_TABS[(at + by + PROPS_TABS.length) % PROPS_TABS.length]![0];
  };
  const chooseProp = (asset: string): void => {
    newAssetChosen(asset);
    chosen = asset;
    showChars = false;
    noteRecentProp(asset);
    setMode('place');
    drawAssets();
    say(`placing ${asset}`);
  };
  /** FUI-3 (PAD-11): the Props screen -- the palette, the filter's tabs, then the props as a grid in pages (L1 / R1 a page). */
  const propsScreen = (): MenuItem[] => {
    const known = new Map(entriesOfPalette.map((e) => [e.asset, e]));
    const shown = propsTab === 'recent'
      ? recentProps.flatMap((asset) => { const id = parseAssetId(asset); return id ? [{ asset, model: known.get(asset)?.model ?? id.model, archive: id.archive }] : []; })
      : assetsShown(entriesOfPalette, favs, propsTab === 'favs' ? 'favs' : 'all', '');
    const cells: MenuItem[] = shown.map((a) => {
      const fav = favs.has(a.asset);
      return {
        id: `prop-${a.asset}`, label: a.model, ...(a.asset === chosen ? { value: 'Chosen' } : fav ? { value: '★' } : {}),
        note: `${a.archive} · Cross places it · Square ${fav ? 'unmarks' : 'marks'} it a favourite`,
        act: () => chooseProp(a.asset),
        secondary: { label: fav ? 'Unfavourite' : 'Favourite', keepOpen: true, act: () => { favs = toggleFavourite(favs, a.asset); writeFavourites(favs); drawAssets(); } },
      };
    });
    const none = propsTab === 'favs' ? 'No favourites yet: Square marks one' : propsTab === 'recent' ? 'No prop chosen yet' : 'No props on this palette';
    return [
      { id: 'props-palette', label: 'Palette', value: optionLabel(paletteSel), keepOpen: true, left: () => cycleSelect(paletteSel, -1), right: () => cycleSelect(paletteSel, 1) },
      { id: 'props-show', label: 'Show', value: PROPS_TABS.find(([t]) => t === propsTab)![1], keepOpen: true, left: () => stepPropsTab(-1), right: () => stepPropsTab(1) },
      ...(cells.length ? pagedSections(cells, PROPS_PAGE, 'props') : [{ id: 'props-none', label: none, disabled: true }]),
    ];
  };
  /** FUI-3 (PAD-8's row): the check run from the menu, its findings a sub-screen -- Cross looks at one, the last row checks again. */
  let menuCheck: MapCheck | null = null;
  let menuChecking = false;
  const runMenuCheck = (): void => {
    if (checking || busy || !base) return;
    checking = true;
    menuChecking = true;
    menuCheck = null;
    void collectCheck()
      .then((found) => { menuCheck = found; })
      .finally(() => { checking = false; menuChecking = false; padMenu.refresh(); });
  };
  const checkScreen = (): MenuItem[] => {
    if (menuChecking) return [{ id: 'check-running', label: 'Checking the map…', disabled: true }];
    const again: MenuItem = { id: 'check-again', label: 'Check again', keepOpen: true, act: () => { runMenuCheck(); padMenu.refresh(); } };
    if (!menuCheck) return [{ id: 'check-none', label: base ? 'Not checked' : 'No base to check', disabled: true }, ...(base ? [again] : [])];
    const issues: MenuItem[] = menuCheck.issues.map((issue, i) => {
      const at = issue.at;
      return at ? { id: `check-issue-${i}`, label: issue.text, value: issue.kind, note: 'Cross looks at it', act: () => lookAtPoint(at) }
        : { id: `check-issue-${i}`, label: issue.text, value: issue.kind, note: 'The whole map', disabled: true };
    });
    const notes: MenuItem[] = menuCheck.notes.map((n, i) => ({ id: `check-note-${i}`, label: n, disabled: true }));
    return [
      ...(issues.length ? sectioned('check-issues', 'Problems', issues) : [{ id: 'check-clear', label: 'No problems', disabled: true }]),
      ...(notes.length ? [{ id: 'check-notes', label: 'Notes', heading: true }, ...notes] : []),
      again,
    ];
  };
  /** FUI-3 (PAD-6): the grid and turn steps on the d-pad, through the dock's own fields (a browser adaptation's ladder). */
  const stepOn = (ladder: readonly number[], now: number, by: number): number =>
    (by > 0 ? ladder.find((v) => v > now) ?? ladder[ladder.length - 1]! : [...ladder].reverse().find((v) => v < now) ?? ladder[0]!);
  const stepField = (field: HTMLInputElement, ladder: readonly number[], now: number, by: number): void => {
    field.value = String(stepOn(ladder, now, by));
    field.dispatchEvent(new Event('change'));
  };
  const menuItems = (): MenuItem[] => {
    const fav = chosen !== null && favs.has(chosen);
    // FUI-3: the shell's rows (`./shell/panel`) in their sections, the View switches, each panel's own heading,
    // the Panels section last of them, a feature's registered sections before it.
    const shellSections = splitAtHeadings(shell.menuItems(), { id: 'view', label: 'View' });
    const panelsSection = shellSections.find((x) => x.id === 'panels');
    const viewRows = [
      ...(shellSections.find((x) => x.id === 'view')?.rows ?? []),
      ...viewMenuSection(viewMenuRows, { on: (id) => view[id], toggle: (id) => { view[id] = !view[id]; applyView(); } }),
      detailDistanceMenuItem(detailHooks),
      renderScaleMenuItem(renderScaleHooks),                   // FP-2 (FP.R5): the render scale, after the detail distance
    ];
    return [
      ...sectioned('play', 'Play', [
        { id: 'play', label: 'Play the layout', note: editsLocked() ? 'Waits while a lobby is open: its host launches its match' : 'An offline match on it: the whole game, its sounds and its round', disabled: editsLocked(), act: () => togglePlay() },
        { id: 'walk', label: 'Walk the layout', note: 'On foot, without the match', act: () => toggleWalk() },
        { id: 'check', label: 'Check the map', note: 'Spawns, pieces, missing assets, the piece budget · Cross runs it', disabled: !base, act: () => runMenuCheck(), page: checkScreen },
        // FG-26 (FG.R22): the lobby's rows -- the window's open and close are here, the toolbar's and its own close.
        ...lobbyMenuItems({
          // FG-48c: the host's rows follow this page's own seat (`lobbyHostProof`), a successor's too.
          lobby: lobby ? { name: lobby.name, role: lobbyHostProof(lobby, lobby.session.me()) ? 'host' : 'joiner', shown: lobby.shown && lobby.popup !== null, ended: lobby.ended } : null,
          canCreate: !!base && !busy && !match,
        }, { create: () => { void createLobbyNow(); }, show: (on) => setLobbyShown(on), leave: () => leaveLobby(), close: () => leaveLobby(true), copyLink: copyLobbyLink })
          // FCW-32 step 4 (FUI.R23 D5): a layout refused online says why on its row (the press refuses it in those words).
          .map((r) => { const why = r.id === 'lobby-create' ? onlineWhy() : null; return why ? { ...r, note: why } : r; }),
      ]),
      ...sectioned('build', 'Build', [
        { id: 'base', label: 'New layout', value: optionLabel(baseSel), note: '✕ chooses a preset or a map to start from', act: () => newBtn.click() },
        { id: 'props', label: 'Props', value: chosen ? parseAssetId(chosen)?.model ?? chosen : 'Choose',
          note: 'Every prop as a grid: L1 / R1 a page, the filter as tabs, the recent ones', grid: PROPS_COLUMNS, page: propsScreen },
        { id: 'npc', label: 'NPC character', value: npcChoice ? charLabel(npcChoice.side, npcChoice.type) : characters().length ? 'Choose' : 'None on this base',
          note: '← → another character · ✕ the NPC tool: place it as a foe in Play', disabled: characters().length === 0, keepOpen: true,
          left: () => stepCharacter(-1), right: () => stepCharacter(1), act: () => { if (!npcChoice) stepCharacter(1); else setMode('npc'); } },
        { id: 'palette', label: 'Palette', value: optionLabel(paletteSel), note: 'Whose props the d-pad steps through', keepOpen: true, left: () => cycleSelect(paletteSel, -1), right: () => cycleSelect(paletteSel, 1), act: () => cycleSelect(paletteSel, 1) },
        { id: 'filter', label: 'Props shown', value: filter === 'all' ? 'All' : 'Favourites', keepOpen: true,
          act: () => { filter = filter === 'all' ? 'favs' : 'all'; drawAssets(); }, left: () => { filter = 'all'; drawAssets(); }, right: () => { filter = 'favs'; drawAssets(); } },
        { id: 'fav', label: chosen ? `Favourite: ${parseAssetId(chosen)?.model ?? chosen}` : 'Favourite', value: chosen ? (fav ? '★' : '☆') : '', disabled: chosen === null, keepOpen: true,
          act: () => { if (chosen) { favs = toggleFavourite(favs, chosen); writeFavourites(favs); drawAssets(); } } },
        { id: 'outliner-screen', label: 'Outliner', value: `${outlinerItemCount()}`,
          note: 'Every placement: Cross selects and looks · Square locks · Triangle deletes or shows', page: outlinerScreen },
        picks.size === 0 && lockHeld.length > 0
          ? { id: 'lock-selection', label: 'Unlock', note: 'The placement just locked can be selected and moved again', act: () => lockBtn.click() }
          : { id: 'lock-selection', label: 'Lock selection', note: 'It cannot be selected or moved until unlocked (Outliner, Square)', disabled: picks.size === 0, act: () => lockBtn.click() },
        { id: 'frame-selection', label: 'Frame selection', note: 'The camera looks at the selected objects', disabled: picks.size + basePicks.size === 0 && !mapDataSelected, act: frameSelection },
        { id: 'snap', label: 'Snap', value: snap ? 'On' : 'Off', keepOpen: true, act: () => setSnap(!snap), left: () => setSnap(!snap), right: () => setSnap(!snap) },
        { id: 'grid-step', label: 'Grid step', value: `${gridStep}`, keepOpen: true,
          left: () => stepField(viewportGridIn, GRID_STEP_LADDER, gridStep, -1), right: () => stepField(viewportGridIn, GRID_STEP_LADDER, gridStep, 1) },
        { id: 'turn-step', label: 'Turn step', value: `${turnStep}°`, keepOpen: true,
          left: () => stepField(viewportTurnIn, TURN_STEP_LADDER, turnStep, -1), right: () => stepField(viewportTurnIn, TURN_STEP_LADDER, turnStep, 1) },
      ]),
      ...sectioned('view', 'View', [
        { id: 'docks', label: 'Docks', value: doc.body.classList.contains('fx-docks-off') ? 'Hidden' : 'Shown', keepOpen: true, act: () => setDocks(doc.body.classList.contains('fx-docks-off')) },
        ...viewRows,
      ]),
      // FUI-1: the registered panels' sections (`./shell/panel`): the Settings' map settings (FG-24, one step each left /
      // right) and any other panel's; FUI-3: then the sections a feature registered, then the shell's Panels section.
      ...shellSections.filter((x) => x.id !== 'view' && x.id !== 'panels').flatMap((x) => sectioned(x.id, x.label, x.rows)),
      ...menuSections.items(pageContext),
      ...(panelsSection ? sectioned(panelsSection.id, panelsSection.label, panelsSection.rows) : []),
      ...sectioned('forge', 'Forge', [
        // FUI-6 (AI-1): the step each takes back or makes again, as the toolbar's titles name it (SELECT, held SELECT).
        { id: 'undo', label: undoWords(), disabled: !history.canUndo(), keepOpen: true, act: () => undo() },
        { id: 'redo', label: redoWords(), disabled: !history.canRedo(), keepOpen: true, act: () => redo() },
        { id: 'save', label: 'Saves', note: 'Named layouts in this browser, a file, or a share link', act: () => saveBtn.click() },
        { id: 'controls', label: 'Controls', act: () => setHelp(true) },
        { id: 'launcher', label: 'Back to the launcher', act: () => { globalThis.location.href = import.meta.env.BASE_URL; } },
      ]),
    ];
  };
  const padMenu = new PadMenu(menuItems);
  refreshMenuForPalette = () => { if (padMenu.isOpen()) padMenu.refresh(); };   // R6: a palette loaded under the open menu
  rulesListeners.add(() => { if (padMenu.isOpen()) padMenu.refresh(); });       // FCW-32 step 4: a rules value stepped from the menu
  padMenuOpen = () => padMenu.isOpen();                       // FUI-1b: a card open withholds a placement (`canPlace`)
  // FUI-3: the legend's context in full, now the menu, the match and the cards exist; a prompt's tap is its press.
  legendNow = (): LegendContext => {
    if (match) return { kind: 'match' };
    if (!help.hidden || cards.isOpen()) return { kind: 'card' };
    if (padMenu.isOpen()) return { kind: 'menu', item: padMenu.current(), depth: padMenu.depth(), sections: padMenu.sections().length };
    if (playing) return { kind: 'walk' };
    if (lobby?.popup && lobby.shown) return { kind: 'lobby' };
    if (leases.holder() !== null) return { kind: 'panel' };
    return { kind: 'build', tool: mode, selection: picks.size + basePicks.size };
  };
  legendPress = (a) => padAction(a);
  /** LATER 230: the menu opened by the toolbar's button (its hint names a pointer's ways), not by START. */
  let menuByPointer: boolean | 'keys' = false;
  const drawMenu = (): void => {
    menuHost.hidden = !padMenu.isOpen();
    menuBtn.classList.toggle('is-on', padMenu.isOpen());
    menuBtn.setAttribute('aria-expanded', String(padMenu.isOpen()));
    if (menuHost.hidden) return;
    placeMenuCard(menuHost, menuCard(doc, padMenu, menuByPointer));
  };
  padMenu.onChange = () => { drawMenu(); leaseCheck(); drawLegendNow(); };   // FUI-2: the menu withholds a placement (a staged drop)
  menuBtn.addEventListener('click', () => {
    if (menuBtn.disabled) return;
    if (lobby?.popup && lobby.shown) setLobbyShown(false);       // the review's F4: as START hides it, the menu never under it
    menuByPointer = !padMenu.isOpen();
    padMenu.toggle();
  });
  menuHost.addEventListener('click', (e) => { if (e.target === menuHost) padMenu.close(); });
  /**
   * The menu opened or closed by the pad's START (false) or M ('keys', OT.R68). Opening lets the captured mouse go
   * (the review's F4): a click behind the menu would act at the centre, and the mouse would still turn the camera.
   */
  const toggleMenu = (by: false | 'keys'): void => {
    if (!padMenu.isOpen() && doc.pointerLockElement === canvas) doc.exitPointerLock();
    menuByPointer = by;
    padMenu.toggle();
  };
  const baseValue = (): string => (base?.kind === 'map' ? base.archive : base?.kind === 'content' ? contentBaseValue(base) : blankValue());
  /** The base the select names: an authored map's own (its option, R6 fix-up), the blank floor on `library`, or a map. */
  const baseOfSelect = (v: string, library: string): LayoutBase =>
    base?.kind === 'content' && v === contentBaseValue(base) ? { ...base } : v === 'blank' || blankPresetOf(v) ? { kind: 'blank', library } : { kind: 'map', archive: v };
  /**
   * A preset's hostages' body (`./blankPresets`): a blank floor has none of its own, so it is lent by a disc map that has
   * hostages -- one whose own mode is the preset's first (an Escort map's VIPs for Escort), then any Escort or Extraction
   * map (`missionlist.rdr`, `kitGameType`); null where none is on this disc.
   */
  const presetHostage = async (type: ForgeGameType, library: string): Promise<PresetHostage | null> => {
    if (!missionKitsRead) { try { missionKits = await loadKitSource(assetSourceFor(archives.sourceRequest())); } catch { missionKits = null; } missionKitsRead = true; }
    const stems = copyMaps().map(([stem]) => stem).filter((stem) => !absent.has(stem));
    const typed = (t: number): string[] => stems.filter((stem) => kitGameType(missionKits, stem) === t);
    // The map chosen to lend the empty map first: its own hostages where it has some.
    for (const stem of [...new Set([...(absent.has(library) ? [] : [library]), ...typed(type), ...typed(3), ...typed(4)])]) {
      const character = hostageCharactersOf(await hostageLibOf(stem))[0];
      if (character) return { source: stem, character };
    }
    return null;
  };
  /** FP-6: the required packs' definitions read before the pieces are built (`ForgeContentSource.ready`, one call); never throws. */
  const packsReady = async (packs: readonly PackRef[]): Promise<void> => {
    if (!contentSource.ready || !packs.length) return;
    try { await contentSource.ready(packs); } catch { /* read on first use instead */ }
  };
  /**
   * FP-6 item 1: the layout a Custom Maps row opens -- a bundle's own layout (`custom:<digest>`), a new layout on a bare
   * content map (`content:...`, the library the empty map's), a save as the Saves card opens it (`save:<id>`); undefined
   * for any other row, null for a row whose record or save is gone (said).
   */
  const customLayoutFor = async (v: string, library: string): Promise<Layout | null | undefined> => {
    const row = customRows.find((r) => r.value === v);
    customSwitchWords = row ? customRowSentence(row) : null;
    if (v.startsWith(CUSTOM_VALUE_PREFIX)) {
      const r = customRecords().find((x) => `${CUSTOM_VALUE_PREFIX}${x.digest}` === v);
      if (!r) { say('That custom map is no longer installed', true); return null; }
      await packsReady(customMapRequires(r.layout));
      const opened = layoutOfRecord(r.layout);
      bundleOfLayout.set(opened, r);                               // item 3: this layout's open marks it read-only
      return opened;
    }
    if (v.startsWith(SAVE_VALUE_PREFIX)) {
      const s = named.find((x) => `${SAVE_VALUE_PREFIX}${x.id}` === v);
      if (!s) { say('That save is no longer in this browser', true); return null; }
      await packsReady(customMapRequires(s.record as Parameters<typeof customMapRequires>[0]));
      return layoutOfAuthoring(s);
    }
    if (v.startsWith('content:') && !(base?.kind === 'content' && v === contentBaseValue(base))) {
      const m = customIndex().find((x) => `content:${x.ref.pack.id}@${x.ref.pack.version}/${x.ref.assetId}` === v);
      if (!m) return undefined;
      const lib = /^[A-Za-z0-9_]{1,16}$/.test(library) ? library : BLANK_LIBRARY;
      return { ...newLayout({ kind: 'content', ref: { ...m.ref.pack }, mapId: m.ref.assetId, library: lib } as LayoutBase), name: m.name };
    }
    return undefined;
  };
  /**
   * The layout a base choice opens: a preset's set up for its mode (`./blankPresets`), else a new layout on the base;
   * null when its question is cancelled. A new empty map asks first which disc map it is built from (the owner,
   * 2026-11-06): the one whose props fill its palette and whose characters and kits its match takes (`LayoutBase`
   * `library`) -- only the maps of the preset's own mode, `library` chosen at first where it is one.
   */
  const layoutForSelect = async (v: string, library: string): Promise<Layout | null> => {
    const custom = await customLayoutFor(v, library);
    if (custom !== undefined) return custom;
    const preset = blankPresetOf(v);
    if (!preset) return newLayout(baseOfSelect(v, library));
    const row = (e: ArchiveEntry): readonly [string, string] => [e.stem, `${e.label} · ${e.stem}`] as const;
    // The preset's own mode's maps: their TYPE in `missionlist.rdr` (`kitGameType`), read first if it is not yet. Where
    // the disc names none of that mode (or has no list), every multiplayer map, and said so.
    if (!missionKitsRead) { try { missionKits = await loadKitSource(assetSourceFor(archives.sourceRequest())); } catch { missionKits = null; } missionKitsRead = true; }
    const mp = entries.filter((e) => !e.campaign && !absent.has(e.stem));
    const same = mp.filter((e) => kitGameType(missionKits, e.stem) === preset.type);
    const offered = same.length ? same : mp;
    const modeName = FORGE_GAME_TYPE_NAME[preset.type];
    const chosen = offered.length ? await askChoice(
      `${preset.label}: built from which map?`,
      `${same.length ? `The ${modeName} maps on this disc.` : `No ${modeName} map on this disc: every multiplayer map.`} `
        + 'The one chosen fills the palette with its props, and the match takes its characters and weapons. Its world is not drawn: the empty map is a flat floor.',
      [[modeName, offered.map(row)]],
      offered.some((e) => e.stem === library) ? library : offered[0]!.stem, 'Create',
    ) : library;
    if (chosen === null) return null;
    const lender = preset.type === 3 || preset.type === 4 ? await presetHostage(preset.type, chosen) : null;
    if ((preset.type === 3 || preset.type === 4) && !lender) say('No disc map with hostages to lend their character: the hostages are placed bare', true);
    const made = presetLayout(baseOfSelect(v, chosen), preset.type, lender);
    // Its environment copied from the map it is built from (`./environmentCopy`): the rig, the fog, the night, the
    // shadows and the sky -- the empty map's own from the start, to change in the Environment panel.
    const from = await hostageLibOf(chosen);
    if (from) made.settings = { ...(made.settings ?? {}), ...environmentOf(from) };
    return made;
  };
  let baseQuiet = false;
  baseSel.addEventListener('change', () => {
    if (baseQuiet || padMenu.isOpen()) return;
    if (baseSel.value === baseValue()) { baseAsk.hidden = true; return; }
    if (refuseEdit()) { baseQuiet = true; baseSel.value = baseValue(); baseQuiet = false; return; }
    baseAsk.hidden = false;
    baseAsk.scrollIntoView?.({ inline: 'nearest', block: 'nearest' });   // LATER 226: past a narrow toolbar's edge, brought into view
  });
  const blankLibrary = (): string => paletteSel.value || entries[0]?.stem || BLANK_LIBRARY;
  baseApply.addEventListener('click', () => {
    if (refuseEdit()) { baseAsk.hidden = true; baseQuiet = true; baseSel.value = baseValue(); baseQuiet = false; return; }
    baseAsk.hidden = true;
    // A cancelled question (the empty map's library) leaves the layout as it was, the base list put back.
    void layoutForSelect(baseSel.value, blankLibrary()).then((l) => {
      if (l) return openLayout(l, 'player').then(sayCustomSwitch, (e: unknown) => { customSwitchWords = null; throw e; });
      baseQuiet = true; baseSel.value = baseValue(); baseQuiet = false;
      return undefined;
    }).catch((e: unknown) => say(String(e), true));
  });
  baseCancel.addEventListener('click', () => { baseAsk.hidden = true; baseQuiet = true; baseSel.value = baseValue(); baseQuiet = false; });

  /* ================= the controller (FG-12, `./pad`) ================= */
  const forgePad = new ForgePad();
  /** The tools L1 / R1 step through: every tool, in the tools row's order (`./keys` `FORGE_TOOL_ORDER`), Select and Place first. */
  const TOOLS: Mode[] = ['select', 'place', ...FORGE_TOOL_ORDER];
  /** A pad seen once: said once, with where its menu is. */
  let padGreeted = false;
  /** When a pad last moved or pressed anything: while recent, the centre's reticle shows (the pad acts there). */
  let padSeen = -Infinity;
  let grabbing = false;
  const readPad = (): PadSnapshot | null => {
    const pads = globalThis.navigator?.getGamepads?.() ?? [];
    let best: Gamepad | null = null;
    for (const g of pads) if (g?.connected && (!best || (g.mapping === 'standard' && best.mapping !== 'standard'))) best = g;
    return best;
  };
  /** The next or previous asset of the list as shown, chosen, the tool Place. */
  /** FG-21: the next or previous character, chosen, the tool NPC, the dock on its Characters. */
  const stepCharacter = (by: number): void => {
    const all = characters();
    if (all.length === 0) { notifier.refused('this base carries no player models'); return; }
    const at = all.findIndex((c) => c.side === npcChoice?.side && c.type === npcChoice.type);
    npcChoice = all[(at < 0 ? (by > 0 ? 0 : all.length - 1) : (at + by + all.length) % all.length)]!;
    showChars = true;
    setMode('npc');
    drawAssets();
    list.querySelector('li.is-on')?.scrollIntoView({ block: 'nearest' });
    say(`placing NPCs: ${charLabel(npcChoice.side, npcChoice.type)}`);
  };
  const stepAsset = (by: number): void => {
    if (mode === 'npc' || showChars) { stepCharacter(by); return; }
    const shown = assetsShown(entriesOfPalette, favs, filter, search.value);
    if (shown.length === 0) return;
    const at = shown.findIndex((a) => a.asset === chosen);
    const next = shown[(at < 0 ? (by > 0 ? 0 : shown.length - 1) : (at + by + shown.length) % shown.length)]!;
    newAssetChosen(next.asset);
    chosen = next.asset;
    noteRecentProp(next.asset);                                  // FUI-3: the Props screen's Recent tab
    setMode('place');
    drawAssets();
    list.querySelector('li.is-on')?.scrollIntoView({ block: 'nearest' });
    say(`placing ${next.asset}`);
    assetTiles?.activate(next.asset);                             // FUI-22 (D1): the pad's pick, its tooltip at once
  };
  const turnSelected = (deg: number): void => {
    if (isGroup()) {
      // FG-47: the group turned about its centre's vertical axis (`./group` `turnedAbout`); one step.
      const c = groupCentre();
      personEdit('piece.rotate', { refs: selectionIds() }, () => {
        passOver('turned');
        if (!c) return;
        applyPoses(turnedAbout(picks.items.map(poseOf), c, yawQuat((deg * Math.PI) / 180)));
        placePivot();
        refreshBox();
        refreshInspector();
        edit();
      });
      return;
    }
    const s = selected;
    if (!s) return;
    personEdit('piece.rotate', { refs: selectionIds() }, () => {
      s.rotation.set(0, s.rotation.y + (deg * Math.PI) / 180, 0);
      refreshBox();
      refreshInspector();
      edit();
    });
  };
  const padAction = (a: PadAction): void => {
    // A card over the page answers the pad: Cross yes, Circle no; the controls card closes on either.
    if (!help.hidden) { if (a === 'act' || a === 'deselect' || a === 'menu') setHelp(false); return; }
    // FUI-2: the top card takes the pad (`./shell/cards`): the d-pad walks it, Cross presses the held row, Circle backs out,
    // Square and Triangle the row's own; START closes the Saves card (PAD-1) and is nothing on a question.
    if (cards.isOpen()) {
      if (a === 'menu') { if (savesHandle && cards.top() === savesHandle) closeSaves(); return; }
      const input = PAD_FOCUS_INPUT[a];
      if (input) cards.pad(input);
      return;
    }
    if (a === 'deselect' && pageShot?.driver.active()) { pageShot.driver.stop('stopped'); return; }   // R5-B: Circle stops the agent's shot
    if (a === 'deselect' && shell.back()) return;            // FUI-1: an open workspace backs out first (FUI.R5)
    if (playing) {
      if (a === 'act') walk.jump();
      else if (a === 'deselect') walk.crouch();
      else if (a === 'duplicate') walk.action();            // Square: the action (a door)
      else if (a === 'menu') stopPlay();
      return;
    }
    if (padMenu.isOpen()) { const m = PAD_MENU_INPUT[a]; if (m) padMenu.input(m); return; }
    if (a === 'deselect' && closeCheckSheet()) return;        // FUI-2: the check's sheet backs out first
    // FUI-2: a panel holding the focus lease takes the pad (`ctx.ui.focus`); START still opens the menu; a Circle the panel
    // does not take gives the pad back to the editor.
    const leased = leases.holder();
    if (leased !== null) {
      if (a === 'menu') { toggleMenu(false); return; }
      const input = PAD_FOCUS_INPUT[a];
      if (input && !shell.padTo(leased, input) && input === 'back') leases.releaseAll();
      return;
    }
    // FUI-1 fix-up (A4, FUI.R5): with the focus in a dock, L1 / R1 step its tabs and Circle leaves it (`./shell/panel`).
    const dockInput = a === 'prevTool' ? 'prevSection' : a === 'nextTool' ? 'nextSection' : a === 'deselect' ? 'back' : null;
    if (dockInput && shell.padInput(dockInput)) return;
    switch (a) {
      case 'act': act(new Vector2(0, 0)); break;
      case 'pick': act(new Vector2(0, 0), true); break;     // FG-47: Cross held: add or take out what is at the centre
      case 'deselect': select(null); break;
      case 'duplicate': duplicate(); break;
      case 'delete': remove(); break;
      case 'prevTool': case 'nextTool': {
        // The next tool the game type plays: a greyed one (`refreshModeTools`) is stepped over, never stopped on.
        const step = a === 'nextTool' ? 1 : TOOLS.length - 1;
        let at = TOOLS.indexOf(mode);
        for (let n = 0; n < TOOLS.length; n++) {
          at = (at + step) % TOOLS.length;
          if (!modeBtns[TOOLS[at]!].disabled) break;
        }
        const next = TOOLS[at]!;
        setMode(next);
        pop(TOOL_NAMES[next]);                                  // the pad has no button under the eye: say the tool
        break;
      }
      case 'prevAsset': stepAsset(-1); break;
      case 'nextAsset': stepAsset(1); break;
      // A re-placed prop turns as it follows the cursor (no edit until it is put down), as the wheel turns it.
      case 'turnLeft': if (replacing) turnQueued(turnStep); else turnSelected(turnStep); break;
      case 'turnRight': if (replacing) turnQueued(-turnStep); else turnSelected(-turnStep); break;
      case 'undo': undo(); break;
      case 'redo': redo(); break;
      case 'snap': setSnap(!snap); pop(snap ? 'Snap on' : 'Snap off'); break;
      case 'frame': frameSelection(); break;                   // R3: the keyboard's F
      case 'menu': toggleMenu(false); break;
    }
  };
  /** One frame of the pad: its actions, then the sticks -- the camera's lanes, or the selection while Circle grabs it. */
  const padFrame = (now: number, dt: number): void => {
    const snapshot = readPad();
    if (snapshot && !padGreeted) { padGreeted = true; pop('Controller connected · START opens the forge menu'); }
    // FG-47: Cross is the build's tap-or-hold; where it answers at its press (the walk's jump, a card, the menu), not.
    // FG-47 (the review's F2): nor while the lobby's window takes the pad -- its Cross acts at the press (LEAVE among them),
    // so a release after the window went must find no hold begun.
    const leased = leases.holder() !== null;
    forgePad.crossHolds = crossHoldsIn({ playing, card: !modal.hidden || !help.hidden || leased, menu: padMenu.isOpen(), lobbyWindow: !!(lobby?.popup && lobby.shown) });
    // AM-1 (FI.R2; a browser adaptation): the menu the pad answers (no card over it, not in Play) takes the left stick.
    // FUI-2: so does a card (the walker's d-pad, with MenuStick's repeat) and a panel holding the focus lease.
    forgePad.menuOpen = (padMenu.isOpen() || !modal.hidden || leased) && help.hidden && !playing;
    const f = forgePad.frame(snapshot, now);
    // FG-26 (FG.R22): the lobby's window, while it shows, takes the pad (its d-pad, Cross, Circle's talk; the ARMORY's
    // presses); START hides it (the forge's menu then shows it again), SELECT is nobody's; the camera holds still.
    if (lobby?.popup && lobby.shown && modal.hidden && help.hidden && !padMenu.isOpen()) {
      lobby.popup.pad(snapshot);
      if (f.actions.includes('menu')) setLobbyShown(false);
      fly.setStick(0, 0); fly.setLook(0, 0); fly.setLift(0); fly.setStickBoost(false);
      return;
    }
    const moved = f.move[0] || f.move[1] || f.look[0] || f.look[1] || f.lift;
    if (f.actions.length || moved) padSeen = now;
    for (const a of f.actions) padAction(a);
    // AM-1: nor under the menu -- Circle held there is its close, and the sticks move nothing behind it.
    const grab = f.grab && !playing && picks.size > 0 && modal.hidden && help.hidden && !padMenu.isOpen() && !editsLocked() && !leased;
    if (grab) {
      // Camera-relative on the ground: the left stick across and along the view, the right stick's y the height.
      // FG-47: every placement picked moved by the same step (a map prop passed over, said once a grab).
      const d = fly.viewportCamera().getWorldDirection(new Vector3());
      const fwd = new Vector3(d.x, 0, d.z).normalize();
      const right = new Vector3(-fwd.z, 0, fwd.x);
      const speed = 320 * dt;
      const step = new Vector3().addScaledVector(right, f.move[0] * speed).addScaledVector(fwd, -f.move[1] * speed);
      step.y -= f.look[1] * speed;
      for (const r of picks.items) r.position.add(step);
      if (moved) {
        agentMark();                                            // browser adaptation: an agent's queued transform conflicts with a live grab
        if (!grabbing) passOver('moved');
        grabbing = true;
        if (isGroup()) placePivot();
        refreshBox();
        refreshInspector();
      }
      fly.setStick(0, 0); fly.setLook(0, 0); fly.setLift(0);
    } else {
      if (grabbing) { grabbing = false; personEdit('piece.move', { refs: selectionIds() }, () => edit(), true); }   // the grab let go: one step
      const blocked = !modal.hidden || !help.hidden || padMenu.isOpen() || leased;   // FUI-2: a lease holds the camera's lanes
      fly.setStick(blocked ? 0 : f.move[0], blocked ? 0 : -f.move[1]);
      fly.setLook(blocked ? 0 : f.look[0], blocked ? 0 : -f.look[1]);
      fly.setLift(blocked || playing ? 0 : f.lift);
      fly.setStickBoost(!blocked && f.boost);
    }
    showPadCrosshair = !playing && now - padSeen < 5000;
    updateCrosshair();
  };

  /**
   * The camera is written with the view and the layout 300 ms after it last moved, so a fly does not write every
   * frame. An edit waits the same 300 ms (`changed`). `pagehide`, and `visibilitychange` to hidden, flush both at
   * once, so a reload or a close in that window keeps the move and the edit. The listeners come off at teardown (a
   * `pagehide` that is not the back/forward cache).
   */
  const saveCamera = (): void => {
    if (!cameraReady || match || playing) return;
    viewCamera = cameraNow();
    writeView();
    if (!autosaveOff) { const saved = layoutNow(true); if (saved) void writeAutosave(saved); }
  };
  const flushCamera = (): void => {
    // A save that would refuse (a match, Play, the camera not ready) leaves the move due for later.
    if (cameraFlush(camSettle, cameraReady && !match && !playing)) saveCamera();
  };
  /** The edit's 300 ms write, done now. A close inside that window keeps the edit. */
  const flushEdits = (): void => {
    if (saveTimer === null) return;
    clearTimeout(saveTimer);
    saveTimer = null;
    savePending = false;
    const l = settledLayout();
    if (l && !autosaveOff) void writeAutosave(l);
  };
  const viewWin = doc.defaultView;
  // R5-B: a hidden or closing page ends the agent's camera shot (`disconnected`; its end saves the camera once).
  function onVisibility(): void { if (doc.visibilityState === 'hidden') { pageShot?.driver.stop('disconnected'); agentPlay.cancel('page hidden'); flushEdits(); flushCamera(); } }
  function teardown(): void {
    doc.removeEventListener('visibilitychange', onVisibility);
    assetViewEvents.abort();
    if (cameraSpeedFeedbackTimer !== null) clearTimeout(cameraSpeedFeedbackTimer);
    keysGone = true;                                          // R3-A: a torn-down page's keys answer nothing
    globalThis.removeEventListener('keydown', onLeaseKey);
    viewWin?.removeEventListener('pagehide', onPageHide);
    viewWin?.removeEventListener('pageshow', onPageShow);
    shell.dispose();                                         // FUI-1: every registered panel, its signal, listeners and timers
    disposeTiles();                                          // FUI-22: the list's tiles, their tooltip and its renderer
    pagePacks?.dispose();                                    // R4: the local packs are the page's, let go after their panels
    pagePacks = null;
    extensions?.dispose();                                    // R7-2: every system ended, every later call HOST_DISPOSED
    leases.releaseAll();                                      // FUI-2: the focus lease and the card stack
    cards.dispose();
    agentApi?.dispose();
    notifier.dispose();                                       // FUI-4: the toast's timer, the pulse's listeners
    statusChips.dispose();
    void closeStore();                                        // R3-B: once the last write (the close's own flush) is done
    forgeLighting.dispose();
    offVideoSettings();                                       // FP-2: the render scale no longer heard
  }
  /**
   * The review of R3-B: the store is closed once every write this page asked is done -- the pagehide's flushes
   * included, each of which reaches the store's queue only after its own `savesOpen` -- and the store's queue is idle.
   */
  async function closeStore(): Promise<void> {
    for (;;) {
      while (pendingWrites.size) await Promise.allSettled([...pendingWrites]);
      await forgeSaves.idle();
      if (pendingWrites.size === 0) break;
    }
    forgeSaves.close();
  }
  /**
   * R6 (the rendered pass's R3; the UI seat's ruling of 2026-10-25 17:44Z: no localStorage journal): the close's autosave,
   * issued NOW -- the flushes above reach the store only after `savesOpen()` and its queue, and a document that goes away
   * has no transaction by then. With the database open, the latest layout's text is put synchronously on a fresh
   * readwrite transaction and committed (`ForgeSaves.writeOnHide`), at the generation this page holds; the next open takes
   * it in by the store's compare-and-swap (a list another tab wrote since wins). With the database not open yet nothing
   * is put: the queued write lands only if this page lives on (a back/forward cache), else that edit is lost.
   */
  const autosaveOnHide = (): void => {
    if (autosaveOff || keepEarlier || forgeSaves.state !== 'ready') return;
    const l = settledLayout();
    if (!l) return;
    const made = autosaveText(l);
    if ('why' in made || made.text === forgeSaves.text('autosave')) return;
    forgeSaves.writeOnHide('autosave', made.text);
  };
  function onPageHide(e: PageTransitionEvent): void {
    pageShot?.driver.stop('disconnected');
    agentPlay.cancel('page hidden');
    flushEdits();
    flushCamera();
    autosaveOnHide();
    if (!e.persisted) teardown();
  }
  /**
   * LATER 488 (a browser adaptation): shown again from the back/forward cache, the page is live and writes on, so the
   * hand-off its `pagehide` put is taken back (`ForgeSaves.takeBackHidden`, compare-and-delete: only the row this page
   * put) -- else the next open would take this page's later writes for another tab's. Its next `pagehide` puts afresh.
   */
  function onPageShow(e: PageTransitionEvent): void {
    if (e.persisted) void tracked(forgeSaves.takeBackHidden());
  }
  doc.addEventListener('visibilitychange', onVisibility);
  viewWin?.addEventListener('pagehide', onPageHide);
  viewWin?.addEventListener('pageshow', onPageShow);

  /* ================= agent editor facade (browser adaptation; no original/game controls) ================= */
  /** Explicit camera commands settle immediately and use the same view/autosave writer as a human camera settle. */
  const agentSaveCamera = (): void => { fly.halt(); noteCamera(); saveCamera(); };
  /**
   * R5-B (a browser adaptation, no original; the spec docs/specs/2026-10-25-forge-camera-shot.md): the agent's camera
   * shot, built once a mount on the fly camera's own pose setter (`FlyCamera.setPose`, never the orbit or walk helpers;
   * the look law and its 89.9-degree clamp untouched). The sampler reads the base map's `MetersPerUnit` per call -- the
   * page's own (`baseMap`), never the fly camera's 0.1 fallback; the box is the base map's built world
   * (`WorldView.box`, the extent the clip planes and overlays use). A blank floor has neither: NOT_READY. A shot frame
   * never saves (`agentSaveCamera` is the agent's explicit commands'); its end saves the camera ONCE.
   */
  const shotMetersPerUnit = (): number | null => ((base?.kind === 'map' || base?.kind === 'content') && baseMap && baseMap.metersPerUnit > 0 ? baseMap.metersPerUnit : null);
  const shotBounds = (): ShotBounds | null => {
    if ((base?.kind !== 'map' && base?.kind !== 'content') || !baseView || baseView.box.isEmpty()) return null;
    const { min, max } = baseView.box;
    return { min: [min.x, min.y, min.z], max: [max.x, max.y, max.z] };
  };
  /** Build on the fly camera only: Walk, Play, a match or a lobby's hold end the shot (`mode`). */
  const shotCanDrive = (): boolean => cameraReady && !playing && !match && agentMode() === 'forge-editor';
  const shot = createPageShot({ camera: fly, metersPerUnit: shotMetersPerUnit, canDrive: shotCanDrive,
    onEnd: () => { noteCamera(); saveCamera(); } });
  pageShot = shot;
  const agentMode = (): ForgeAgentSnapshot['mode'] => agentModeOf(surfaceNow().surface);
  /**
   * LATER 422 (a browser adaptation): the agent's editor facade (`./agent/editorFacade`) -- its snapshot, status, revisions
   * and operations -- built over the page's explicit `ForgeAgentEditor`: the page's own reads and its own actions, each
   * the code the facade ran here in this closure before.
   */
  const agentFacade = createForgeEditorFacade({
    revisions: agentRevisions, play: agentPlay, operations, shotDriver: shot.driver, mapBounds: shotBounds, savedElsewhereWords: SAVED_ELSEWHERE,
    mode: agentMode, picks: () => picks.items, base: () => base, busy: () => busy, checking: () => checking, layoutName: () => layoutName,
    layoutNow: () => layoutNow(), selectionIds, placementIds, npcOf, bombKindOf, lockedOf, entries: () => entries, palette: () => entriesOfPalette,
    characters, charLabel, absent: () => absent, paletteArchive: () => paletteSel.value, chosen: () => chosen, npcChoice: () => npcChoice,
    favourites: () => favs, filter: () => filter, showChars: () => showChars, query: () => search.value, hiddenKeys: () => hiddenKeys,
    baseMap: () => baseMap, charMap: () => charMap, view: () => view, snap: () => snap, gridStep: () => gridStep, turnStep: () => turnStep,
    tool: () => mode, gizmoMode: () => gizmo.mode, camera: cameraNow, named: () => named, namedAt: () => namedAt, history,
    inMatch: () => !!match, matchOfLobby: () => matchOfLobby, playing: () => playing, statusText: () => status.textContent ?? '',
    clipboard: () => clipboard,
    queryAssets: (query, cursor) => creatorCatalogue.queryCreatorAssets(query, cursor),
    checkPlacement: (ref, transform) => creatorCatalogue.checkPlacement(ref, transform),
    // AX-17 (a browser adaptation): forge.probe reads the placement check's own grid and the pieces' bounds, by ref.
    probeWorld: () => {
      refreshPlacementGround();
      const ids = placementIds(), refOf = new Map<Object3D, string>([...ids].map(([ref, r]) => [r, ref]));
      const obstacles = [...ids].flatMap(([ref, r]) => {
        if (!ref.startsWith('piece:')) return [];
        const b = new Box3().setFromObject(r);
        return b.isEmpty() ? [] : [{ ref, bounds: { min: b.min.toArray(), max: b.max.toArray() } }];
      });
      return { grid: placementGrid, obstacles, refOfOwner: (path: string) => {
        const m = /^forge\/piece_(\d+)$/.exec(path), r = m ? roots[Number(m[1])] : undefined;
        return r ? refOf.get(r) ?? null : null;
      } };
    },
    starterContext: (guard) => starterContext(guard), missingPacks, missingPacksWords, installedRules,
    prepareLayout, applyPicked, changed, refreshUndo, edit, noteMissingPacks,
    adoptLayoutCamera: (camera) => { if (camera) { fly.setPose(camera); fly.halt(); viewCamera = cameraNow(); noteCamera(); writeView(); } cameraReady = true; },
    copySelection, collectCheck, loadArchive: (stem) => archives.load(stem),
    setPalette: (stem, map) => { invalidateAssetThumbnails(); paletteSel.value = stem; entriesOfPalette = creatorPalette(map); paletteLoading = null; drawAssets(); refreshMenuForPalette(); },
    lookAtPoint, saveCamera: agentSaveCamera, persistNamed: (list, at) => persistNamed(list, at),
    startMatch: (guard) => startMatch(guard), startPlay: (guard) => startPlay(guard),
    setView: (toggle, on) => { view[toggle as ViewToggle] = on; applyView(); },
    setCameraPose: (pose) => { fly.setPose(pose); }, lookFrom: (from, to) => { fly.lookFrom(from, to); }, focusOn,
    setQuery: (query) => { search.value = query; drawAssets(); },
    setPaletteFilter: (chars, only) => { showChars = chars; filter = only; drawAssets(); },
    choose: (asset) => { newAssetChosen(asset); chosen = asset; setMode('place'); drawAssets(); },
    setFavourite: (asset, on) => { if (on) favs.add(asset); else favs.delete(asset); writeFavourites(favs); drawAssets(); },
    setSnap: (grid, turn, on) => { gridStep = grid; turnStep = turn; setSnap(on); },
    setTool: (tool, gizmoMode) => { setMode(tool); if (gizmoMode) setGizmo(gizmoMode); },
    stopPlay, endMatch,
    // R3-B: the lists read again from the store (another writer's); the card and the agent told once they are.
    rereadLists: () => { void savesOpen().then(() => forgeSaves.reread()).then(listsReread); },
  });
  agentPointHook = agentFacade.notePoint;                     // AX-13: the player's last clicked point, for forge.focus
  const agentLayoutRevision = agentFacade.layoutRevision;
  const agentReady = agentFacade.ready;
  const agentSnapshot = agentFacade.snapshot;
  /** FUI-1: `ForgePanelContext.state()` -- the surface, the edit rule and the layout's revision as of now. */
  const shellState = (): ForgeShellState => ({ ...surfaceNow(), revision: agentLayoutRevision() });
  /**
   * FUI-1b (a browser adaptation, FG.R2): the editor seam a feature panel's drop is built on. `stagePiece` builds the real
   * piece through the page's own piece path (`newPiece`), never added to the scene; `place` is the facade's `piece.place`
   * (one revision-guarded edit, one history step: no second placement path), refused with ADMISSION_LOST when the
   * placement is no longer admitted (`canPlace`); either way the staged piece is disposed. R3-A (LATER 451): the page
   * owns every staged piece -- it cancels the staged drops once a placement is no longer admitted (with or without a
   * lease), and each panel's are disposed when its registration ends (`./shell/context` `panelContext`).
   */
  /** The drops staged and not yet placed or let go; cancelled once a placement is no longer admitted. */
  const stagedLive = new Set<StagedPiece>();
  /** R3-A: the staged drops cancelled by a lapsed admission: their `place` still answers ADMISSION_LOST. */
  const stagedLapsed = new WeakSet<StagedPiece>();
  leaseCheck = () => {
    leases.sync();
    if (stagedLive.size > 0 && !surfaceNow().canPlace) for (const s of [...stagedLive]) { stagedLapsed.add(s); s.dispose(); }
  };
  const shellEditorOf = (api: ForgeAgentApi): ForgeEditor => {
    /** The pieces this editor staged, each with the page's own release (R4: a place consumes it through that). */
    const ours = new WeakMap<StagedPiece, () => void>();
    return {
      async previewPiece(asset) {
        const r = await newPiece(asset).catch(() => null);
        if (!r) return null;
        let gone = false;
        return {
          object: r,
          dispose() {
            if (gone) return;
            gone = true;
            r.removeFromParent();
            const release = r.userData['dispose'];
            if (typeof release === 'function') release();
          },
        };
      },
      async stagePiece(asset) {
        if (!shellState().canPlace) return null;
        const r = await newPiece(asset).catch(() => null);
        if (!r) return null;
        let gone = false;
        /** R3-B: the piece's own materials while it is drawn as a ghost (translucent clones stand in for them). */
        let own: Map<Mesh, Material | Material[]> | null = null;
        const unghost = (): void => {
          if (!own) return;
          for (const [mesh, material] of own) {
            for (const c of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as Material[]) c.dispose();
            mesh.material = material;
          }
          own = null;
          delete r.userData['forgeGhost'];
        };
        /** Out of the scene and its own resources let go: a dispose's, or (R4) a successful place's consumption. */
        const release = (): void => {
          if (gone) return;
          gone = true; stagedLive.delete(staged); unghost(); r.removeFromParent(); (r.userData['dispose'] as (() => void) | undefined)?.();
        };
        const staged: StagedPiece = {
          asset, object: r, get disposed() { return gone; },
          dispose: release,
          show(at, yaw, admitted) {
            if (gone) return;
            if (!own) {
              const kept = new Map<Mesh, Material | Material[]>();
              r.traverse((o) => {
                if (!(o instanceof Mesh)) return;
                kept.set(o, o.material as Material | Material[]);
                o.material = Array.isArray(o.material) ? (o.material as Material[]).map((m) => m.clone()) : (o.material as Material).clone();
              });
              own = kept;
            }
            r.position.set(at[0], at[1], at[2]);
            r.rotation.y = yaw;
            r.updateMatrix();
            r.visible = true;
            paintGhost(r, admitted);
            if (r.parent !== scene) scene.add(r);
          },
          hide() { if (!gone) r.visible = false; },
        };
        ours.set(staged, release);
        stagedLive.add(staged);
        return staged;
      },
      async place(staged, at, yaw) {
        const revision = api.status().revision;
        if (ours.has(staged) && stagedLapsed.has(staged)) return { ok: false, code: 'ADMISSION_LOST', revision };
        if (!ours.has(staged) || staged.disposed) return { ok: false, code: 'NOT_STAGED', revision };
        if (!shellState().canPlace) { staged.dispose(); return { ok: false, code: 'ADMISSION_LOST', revision }; }
        // R4 (the seam note to dot, 2026-10-25 11:23Z): a placed piece is consumed -- the ghost became the piece, so the page
        // releases it itself, never through the piece's `dispose` (a panel's let-go); a refused one is disposed.
        let placed = false;
        try {
          const result = await api.execute('piece.place', { asset: staged.asset, at: [at[0], at[1], at[2]], ...(yaw === undefined ? {} : { yaw }) }, revision);
          placed = result.ok;
          return result.ok ? { ok: true, revision: result.revision } : { ok: false, code: result.code ?? 'REFUSED', revision: result.revision };
        } finally { if (placed) ours.get(staged)?.(); else staged.dispose(); }
      },
      viewport: () => viewport,
      projectDrop(clientX, clientY): ForgeDropProjection {
        const state = shellState();
        if (!state.canPlace) return { reason: state.reason ?? FORGE_REFUSALS.busy };
        if (!base) return { reason: FORGE_REFUSALS.noBase };
        const rect = input.getBoundingClientRect();
        const u = (clientX - rect.left) / rect.width, v = (clientY - rect.top) / rect.height;
        if (!(rect.width > 0 && rect.height > 0) || !(u >= 0 && u <= 1 && v >= 0 && v <= 1)) return { reason: FORGE_REFUSALS.outsideView };
        const hit = pick(new Vector2(u * 2 - 1, -v * 2 + 1));
        const point = hit ? hit.point : ray.ray.at(300, new Vector3());
        const snapped = placeAt(hit);
        return { point: [point.x, point.y, point.z], snapped: [snapped.x, snapped.y, snapped.z], yaw: placementYaw() };
      },
      sourceIdentity(asset) {
        if (asset === FORGE_BLOCK) return FORGE_BLOCK_SOURCE;
        const id = parseAssetId(asset);
        return id ? pieceSources.get(id.archive) ?? creatorMaps.get(id.archive) ?? null : null;
      },
    };
  };
  const creatorCatalogue = createCreatorCatalogue({
    revision: () => agentSnapshot().revision, maps: () => [...creatorMaps.values()],
    grid: () => { refreshPlacementGround(); return placementGrid; },
    obstacles: () => roots.flatMap((r, i) => {
      if (!r.userData['forgePiece']) return [];
      const b = new Box3().setFromObject(r);
      return b.isEmpty() ? [] : [{ ref: `piece:${i}`, bounds: { min: b.min.toArray() as Vec3, max: b.max.toArray() as Vec3 } }];
    }),
  });
  /** Authored starter adaptation: inspect only already loaded palettes in bounded batches. Each candidate is checked
   * against the original replacement base plus prior proposed hulls, never the current editor content being replaced. */
  const starterContext = async (guard: () => void = () => undefined): Promise<StarterContext> => {
    guard();
    const revision = agentSnapshot().revision, maps = [...creatorMaps.values()], source = base?.kind === 'map' ? baseMap : null;
    const checks = starterPlacementChecks(source, maps, () => agentSnapshot().revision);
    const { catalogue } = checks;
    const assets: StarterContext['assets'] = [];
    let cursor: string | null = null;
    do {
      guard();
      const page = catalogue.queryCreatorAssets({ limit: 100 }, cursor);
      if (page.total > 4096 || assets.length + page.items.length > 4096) throw new ForgeAgentError('CATALOGUE_LIMIT', 'Starter inspection is limited to 4096 loaded prototypes; use fewer palettes.');
      assets.push(...page.items); cursor = page.nextCursor;
      // Yield between bounded batches so a human edit/disconnect can cancel before expensive inspection continues.
      if (cursor) await new Promise<void>(resolve => setTimeout(resolve, 0));
    } while (cursor);
    guard();
    return { revision, archives: entries.map(({ stem, label, campaign }) => ({ stem, label, campaign })), map: source, assets,
      checkLayout: record => {
        guard();
        const diagnostics = checkStarterLayout(record, source, maps);
        guard();
        return { revision: agentSnapshot().revision, diagnostics };
      },
      checkPlacement: (ref, transform, prior, ids) => {
        guard();
        const checked = checks.checkPlacement(assets, ref, transform, prior, ids);
        guard();
        return checked;
      },
    };
  };
  agentApi = createForgeAgentApi(agentFacade);
  options?.onAgentReady?.(agentApi);
  /**
   * FUI-6: the facade as the page's own panels call it -- the person's (the examples panel's Apply, the editor seam's drop):
   * the same facade, its steps named as the person's. A handed panel (the agent's dock) is given the agent's.
   */
  const personForge: ForgeAgentApi = { ...agentApi, execute: (operation, args, revision, id, opts) => agentApi!.execute(operation, args, revision, id, { ...opts, actor: HUMAN }) };
  const asPerson = (panel: ForgePanel): ForgePanel => ({ ...panel, mount: (host, ctx) => panel.mount(host, {
    get forge() { return personForge; }, get editor() { return ctx.editor; }, get palette() { return ctx.palette; },
    ui: ctx.ui, state: () => ctx.state(), store: ctx.store, doc: ctx.doc, signal: ctx.signal } satisfies ForgePanelContext) });
  shellEditor = shellEditorOf(personForge);
  /**
   * FUI-4 (the review's IA-7; principle 3): the page's own lasting states, one chip each -- the autosave, Build / Walk /
   * Play, the lobby's lock, the last check -- read each time the strip updates. The agent's chip is its panel's.
   */
  const pageChip = (id: keyof typeof FORGE_CHIP_ORDER, view: () => StatusChipView): void => {
    statusChips.register({ id, order: FORGE_CHIP_ORDER[id], text: () => view().text, tone: () => view().tone, title: () => view().title ?? '' });
  };
  const saveStateNow = (): ForgeSaveState => (autosaveOff ? 'off' : autosaveRefusal || (savesOpening && forgeSaves.state !== 'ready') ? 'refused'
    : keepEarlier ? 'kept' : savePending ? 'saving' : 'saved');
  pageChip('save', () => saveChip(saveStateNow()));
  pageChip('mode', () => modeChip(surfaceNow().surface, !!match));
  pageChip('lobby', () => lobbyChip({ open: editsLocked(), ...(lobby ? { role: lobby.role } : {}) }));
  pageChip('issues', () => issuesChip(lastIssues));
  // FUI.R5's tabs; FUI-22 (D2, ruled): the starters under World -- "they are world content, not an edit tool".
  shell.register(asPerson({ ...examplesForgePanel(() => starterContext()), tab: 'World' }));
  /**
   * FCW-32 step 4 (FUI-18's rules half, FUI.R23 D1, D3, D4; RULES_PANEL_ADAPTATION): the Rules panel under Edit, after the
   * Outliner -- the person's, every edit the planner's through this facade -- and its START section while the layout has
   * rules (its configuration's rows and the places), beside the shell's Panels row "Rules" that hands it the pad.
   */
  const rulesForgePanel = rulesPanel({
    state: () => ({ rules: layoutRules, mode: layoutMode, entities: layoutEntities, name: layoutName }),
    layout: () => layoutNow(false), installed: () => installedRules(), playRefusal: () => playTimeWhy(layoutNow(false)),
    place: (kind) => startEntityPlace(kind), placing: () => entityTool,
    subscribe: (fn) => { rulesListeners.add(fn); return () => { rulesListeners.delete(fn); }; },
  });
  shell.register(asPerson(rulesForgePanel));
  menuSections.register({ id: 'rules', label: 'Rules', items: () => rulesForgePanel.menuRows() });
  /**
   * R4 (the UI seat's rulings to dot, 2026-10-25 11:34Z / 11:41Z): the page's local packs, one for its lifetime, made from
   * the agent's facade as the agent's dock made its own (`forgeMapPackDrivers`); handed to the agent's dock and to dot's
   * Local files panel alike (FUI-22: the Content tab's), so a file staged in one is the other's; disposed at the teardown,
   * never by a panel.
   */
  const packs: LocalPackApi = (options?.localPacks ?? ((api: ForgeAgentApi) => createLocalPackApi(forgeMapPackDrivers(api))))(agentApi);
  pagePacks = packs;
  const services: ForgePageServices = { packs };
  // R4 (FCW-S1-ASSETS, dot's `../creator/assetsForgePanel`), FUI-22 (D5, FUI.R21): the creator's own grid is gone. Its
  // pack loading is the Local files panel, the right dock's Content tab, with the page's one file chooser; its drag onto
  // the world and (D1) the tooltip preview are the one list's tiles -- the person's, through the editor seam (set above).
  shell.register(asPerson(assetsForgePanel({ packs })));
  const tilesAbort = new AbortController();
  const tilesCtx = panelContext(pageContext, tilesAbort.signal);
  assetTiles = createAssetTiles(list, {
    get forge() { return personForge; }, get editor() { return tilesCtx.editor; }, get palette() { return tilesCtx.palette; },
    ui: tilesCtx.ui, state: () => tilesCtx.state(), store: tilesCtx.store, doc: tilesCtx.doc, signal: tilesCtx.signal,
  } satisfies ForgePanelContext, { tips: () => assetTips });
  const assetThumbnailQueue: string[] = [];
  const assetThumbnailQueued = new Set<string>();
  let assetThumbnailBusy = false;
  let assetThumbnailGeneration = 0;
  const updateAssetThumbnailImage = (asset: string, url: string | null): void => {
    for (const image of Array.from(list.querySelectorAll<HTMLImageElement>('img[data-asset-thumbnail]'))) {
      if (image.dataset['assetId'] !== asset) continue;
      const status = image.parentElement?.querySelector<HTMLElement>('.fx-asset-thumbnail-status');
      if (url) {
        image.src = url;
        image.classList.add('is-ready');
        status?.remove();
      } else if (status) {
        status.textContent = (assetThumbnailFailures.get(asset) ?? 0) > 2 ? 'Preview unavailable' : 'Preparing preview…';
      }
    }
  };
  const pumpAssetThumbnails = async (): Promise<void> => {
    if (assetThumbnailBusy || !shell.isShown('asset-browser')) return;
    const asset = assetThumbnailQueue.shift();
    if (!asset) return;
    assetThumbnailBusy = true;
    assetThumbnailQueued.delete(asset);
    const generation = assetThumbnailGeneration;
    try {
      let url = assetThumbnailCache.get(asset) ?? null;
      if (!url && (assetThumbnailFailures.get(asset) ?? 0) <= 2) {
        url = await assetTiles!.thumbnail(asset, 160, 120);
        if (generation !== assetThumbnailGeneration) return;
        if (url) {
          assetThumbnailCache.set(asset, url);
          if (assetThumbnailCache.size > 256) assetThumbnailCache.delete(assetThumbnailCache.keys().next().value!);
        } else {
          const attempts = assetThumbnailFailures.get(asset) ?? 0;
          if (attempts < 2) {
            assetThumbnailFailures.set(asset, attempts + 1);
            await new Promise(resolve => setTimeout(resolve, 300));
            if (generation === assetThumbnailGeneration) {
              assetThumbnailQueued.add(asset);
              assetThumbnailQueue.unshift(asset);
            }
          } else {
            assetThumbnailFailures.set(asset, attempts + 1);
          }
        }
      }
      updateAssetThumbnailImage(asset, url);
    } catch (error) {
      const attempts = (assetThumbnailFailures.get(asset) ?? 0) + 1;
      assetThumbnailFailures.set(asset, attempts);
      updateAssetThumbnailImage(asset, null);
      if (attempts <= 2) {
        await new Promise(resolve => setTimeout(resolve, 300));
        if (generation === assetThumbnailGeneration) {
          assetThumbnailQueued.add(asset);
          assetThumbnailQueue.unshift(asset);
        }
      }
      console.error(`forge asset thumbnail: ${asset}`, error);
    } finally {
      assetThumbnailBusy = false;
      void pumpAssetThumbnails();
    }
  };
  const queueAssetThumbnail = (asset: string): void => {
    const cached = assetThumbnailCache.get(asset);
    if (cached) { updateAssetThumbnailImage(asset, cached); return; }
    if ((assetThumbnailFailures.get(asset) ?? 0) > 2) return;
    if (assetThumbnailQueued.has(asset)) { void pumpAssetThumbnails(); return; }
    assetThumbnailQueued.add(asset);
    assetThumbnailQueue.push(asset);
    void pumpAssetThumbnails();
  };
  const thumbnailObserver = doc.defaultView && 'IntersectionObserver' in doc.defaultView
    ? new doc.defaultView.IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const image = entry.target as HTMLImageElement;
        if (image.dataset['assetId']) queueAssetThumbnail(image.dataset['assetId']);
        thumbnailObserver?.unobserve(image);
      }
    }, { root: list, rootMargin: '120px' })
    : null;
  updateAssetThumbnailObservations = (): void => {
    thumbnailObserver?.disconnect();
    const images = Array.from(list.querySelectorAll<HTMLImageElement>('img[data-asset-thumbnail]'));
    for (const image of images) {
      const asset = image.dataset['assetId'];
      if (!asset) continue;
      const cached = assetThumbnailCache.get(asset);
      if (cached) updateAssetThumbnailImage(asset, cached);
      else if ((assetThumbnailFailures.get(asset) ?? 0) > 2) updateAssetThumbnailImage(asset, null);
      else if (thumbnailObserver) thumbnailObserver.observe(image);
      else if (images.indexOf(image) < 24) {
        const bounds = image.getBoundingClientRect(), viewport = list.getBoundingClientRect();
        if (bounds.width > 0 && bounds.height > 0 && viewport.width > 0 && viewport.height > 0
          && bounds.bottom >= viewport.top && bounds.top <= viewport.bottom) queueAssetThumbnail(asset);
      }
    }
  };
  invalidateAssetThumbnails = (): void => {
    assetThumbnailGeneration++;
    assetThumbnailCache.clear();
    assetThumbnailFailures.clear();
    assetThumbnailQueue.length = 0;
    assetThumbnailQueued.clear();
  };
  updateAssetThumbnailObservations();
  disposeTiles = () => { invalidateAssetThumbnails(); tilesAbort.abort(); assetTiles?.dispose(); assetTiles = null; };
  for (const handed of options?.panels ?? []) {
    void Promise.resolve().then(() => (typeof handed === 'function' ? handed(services) : handed)).then((p) => shell.register(p)).catch((e: unknown) => {
      if (!(e instanceof ForgePanelError && e.code === 'DISPOSED')) console.error('forge panel: not mounted', e);
    });
  }

  /* ================= the frame ================= */
  let last = performance.now();
  let agentFrameAt = last;
  let agentStateStamp = '';
  let shellStateStamp = '';
  let fpsAt = last, frames = 0;
  const frame = (now: number): void => {
    packOverlay.refresh();                                   // ML-9's F1 / F2: the strip as the Play or a load starts and ends
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    // FUI-22: the list's tiles told when their dock is drawn or not (Docks, Walk, a match); their tooltip's frame.
    const assetsShown = shell.isShown('asset-browser');
    if (assetsShown !== tilesShown) {
      tilesShown = assetsShown;
      assetTiles?.visibility(assetsShown);
      if (assetsShown) updateAssetThumbnailObservations();
    }
    if (assetsShown) assetTiles?.frame(dt);
    if (shot.driver.active() && !shotCanDrive()) shot.driver.stop('mode');   // R5-B: Walk, Play, a match, a lobby's hold
    syncRulesGizmos();                                       // FCW-32 step 4 (D4): never under Walk, Play or a shot
    if (now - agentFrameAt >= 250) {
      agentFrameAt = now;
      const stamp = `${agentLayoutRevision()}:${agentReady()}:${agentMode()}`;
      if (stamp !== agentStateStamp) { agentStateStamp = stamp; agentRevisions.notify(); }
      const rules = surfaceNow();
      const shellStamp = `${stamp}:${rules.canEdit}:${rules.canPlace}`;     // FUI-1b: the panels' state() turned
      if (shellStamp !== shellStateStamp) { shellStateStamp = shellStamp; shell.update(); assetTiles?.update(); }
      statusChips.update();                                 // FUI-4: a chip whose word is unchanged is not touched
    }
    if (match) {
      // The match draws on its own canvas; the forge's waits under it (no draw) until the match ends -- or the pad's
      // exit chord: SELECT and START held together (the forge's own, no original; the match reads both alone).
      const p = readPad();
      const chord = FORGE_MATCH_EXIT_CHORD.every((b) => !!p?.buttons[b]?.pressed);
      rulesPresenter.frame({ cross: !!p?.buttons[0]?.pressed });   // FUI-23: the held cues; Cross (button 0) their gesture
      if (match.ended() || chord) endMatch();
      requestAnimationFrame(frame);
      return;
    }
    padFrame(now, dt);
    drawLegendNow();                                         // FUI-3: the legend follows what the pad is doing
    shell.frame(dt, now);                                    // FUI-1: the registered panels' own clocks
    syncUserBillboards();                                    // the user's placements' marks: the set when it changed, then where each is
    leaseCheck();                                            // FUI-2: a lease let go once its panel is hidden
    if (lobby) { lobby.session.poll(); lobby?.popup?.frame(dt); }   // FG-26: the window's clocks and voice; a close seen
    // R5-B: while the agent's shot runs it places the camera, the fly update only its takeover test (`PageShot.frame`).
    shot.frame(dt, () => fly.update(dt));
    if (cameraReady && !playing && !shot.driver.active()) {    // R5-B: a shot frame never settles a save
      const p = fly.pose();
      const key = `${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)},${p.yaw.toFixed(1)},${p.pitch.toFixed(1)}`;
      notedCam = key;
      if (cameraFrame(camSettle, key, now)) saveCamera();          // LATER 195: still for CAMERA_SETTLE_MS of frames
    }
    if (playing) {
      walk.frame(dt);
      doors.frame(dt);
      play.frame(dt, walk, fly.viewportCamera());
    }
    baseView?.frame(fly.viewportCamera(), dt);
    skyView?.frame(fly.viewportCamera(), dt);               // a new empty map's copied sky: its clouds' scroll
    turnPlacedFlares(fly.viewportCamera().position);
    if (selected || isGroup()) refreshBox();
    forgeLighting.update([scene], forgeLightingOptions(settings, baseMap));
    // LATER 471 (a browser adaptation, `EXTENSION_HOST_ADAPTATION`; dot's placement 2026-10-25T21:45Z): the extension
    // host's schedule -- each enabled system's `frame(dt)`, dt in seconds -- once a drawn frame, never under a match.
    extensions?.frame(dt);
    syncAxisWidget();
    created.render(scene, fly.viewportCamera());
    adaptiveRatio.frame(dt, now, ratioTarget, view.ps2 || busy);   // FP-2: `../matchMount`'s tail; held under the PS2 frame and while the page loads
    frames++;
    if (now - fpsAt > 500) {
      sFps.textContent = `${Math.round((frames * 1000) / (now - fpsAt))} fps · ${created.backend}`;
      const p = fly.viewportCamera().position;
      sCam.textContent = `cam ${Math.round(p.x)}, ${Math.round(p.y)}, ${Math.round(p.z)}`;
      frames = 0;
      fpsAt = now;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  /* ================= the disc (FG.R12), the archives, then the saved layout or a first base ================= */
  /**
   * A release reads the player's own disc (OT.R34): DX-3's kept extraction when it is whole (`../discStart`
   * `forgeDiscStart`: its read set from storage -- the campaign's maps with it since FI.R6's second revision -- and any
   * path outside it from the stored copy or the remembered disc when either is the same disc), else the launcher's stored copy, else its remembered disc when its permission is already
   * granted, else a card -- "Continue with <name>" (the permission asked in that click), or the chooser. A pad press
   * cannot open a file chooser or answer a permission (`../discMemory`), so the card's buttons are the pointer's.
   * Resolves with the source once one opens.
   */
  /** The disc the page already holds, with no prompt: DX-3's extraction, the stored copy, or the remembered disc whose permission is granted. */
  const knownDisc = async (): Promise<{ started: SourceRequest | null; state: Awaited<ReturnType<typeof readStartState>>; remembered: Awaited<ReturnType<typeof rememberedDisc>> | null }> => {
    const state = await readStartState();
    const remembered = state.remembered ? await rememberedDisc() : null;
    const started = await forgeDiscStart({
      state: () => extractionState(),
      record: () => storedExtraction(),
      copy: async () => (state.copy ? await storedCopyRequest() : null),
      remembered: async () => (remembered && state.permission === 'granted' ? await discRequestFromHandle(remembered.handle) : null),
    });
    return { started, state, remembered };
  };
  const discSource = async (): Promise<SourceRequest> => {
    try {
      const { started, state, remembered } = await knownDisc();
      if (started) return started;
      return await new Promise<SourceRequest>((resolve) => {
        const card = el(doc, 'div', 'fx-card fx-disc');
        const line = el(doc, 'p', '', 'The forge builds from your own SOCOM II disc: a disc image (.iso) or a folder of its files. Nothing is uploaded. '
          + 'A browser opens its file chooser only for a click or a tap, never for a controller button: choose it with the pointer once, and the launcher remembers it.');
        const foot = el(doc, 'footer');
        let handle: CardHandle | null = null;
        const opened = (r: DiscRequest | null): void => { if (r) { handle?.close(); resolve(r); } };
        const fail = (e: unknown): void => { line.textContent = `That disc could not be opened: ${e instanceof Error ? e.message : String(e)}`; };
        if (remembered && state.permission === 'prompt') {
          const go = el(doc, 'button', 'fx-tool fx-primary', `Continue with ${remembered.meta.name}`);
          go.addEventListener('click', () => {
            void requestDisc(remembered.handle).then((p) => (p === 'granted' ? discRequestFromHandle(remembered.handle) : null)).then(opened, fail);
          });
          foot.append(go);
        }
        const image = el(doc, 'button', 'fx-tool', 'Choose disc image');
        const fileInput = el(doc, 'input');
        fileInput.type = 'file';
        // Unfiltered for iOS document pickers; the disc reader checks the selected contents.
        fileInput.hidden = true;
        fileInput.addEventListener('change', () => { const f = fileInput.files?.[0]; if (f) opened({ kind: 'iso', file: f }); });
        image.addEventListener('click', () => {
          if (canPickDiscImage()) void pickDiscImage().then((d) => opened(d?.request ?? null), fail);
          else fileInput.click();
        });
        foot.append(image, fileInput);
        if (canPickDiscFolder()) {
          const folder = el(doc, 'button', 'fx-tool', 'Choose disc folder');
          folder.addEventListener('click', () => { void pickDiscFolder().then((d) => opened(d?.request ?? null), fail); });
          foot.append(folder);
        }
        card.append(el(doc, 'h2', '', 'Your disc'), line, foot);
        // FUI-2: on the card stack. No way back (the Forge builds from the disc) and no pad row (a browser opens its file
        // chooser only for a click or a tap): Esc and Circle say so.
        handle = cards.open(card, { onBack: () => pop('Choose your disc with the pointer: a browser opens its chooser only for a click or a tap'),
          initialFocus: null, label: 'Your disc' });
      });
    } catch (e) {
      say(`the disc could not be read: ${e instanceof Error ? e.message : String(e)}`, true);
      throw e;
    }
  };
  // The early tap: the page is wired (every listener above attached); the scene's controls take input, and a press held
  // while the renderer started is pressed now, as it would be from here on.
  for (const c of untilWired) c.toggleAttribute('inert', false);
  earlyPresses.release();
  // `let`: a development build with no served tree turns to the disc below (./servedFallback)
  let wantsDisc = !import.meta.env.DEV || new URLSearchParams(globalThis.location?.search ?? '').has('disc');
  const address = globalThis.location?.search ?? '';
  const devBench = import.meta.env.DEV && address.split('&').some((part) => part === 'bench' || part === '?bench' || part.startsWith('bench=') || part.startsWith('?bench='));
  /** `/forge?floor` pins a blank floor when nothing else is open, so a disc being linked does not change that start. `?bench` is the development bench. */
  const wantsFloor = new URLSearchParams(address).has('floor');
  // A development bench with no disc (`?bench`): the forge's own block on a blank floor. It does not read an archive. `?floor` is the saves pin.
  if (devBench) {
    showLoading(null);
    autosaveOff = true;
    base = { kind: 'blank', library: 'forge' };
    scene.add(floor);
    fly.setScale(1);
    fly.setClipPlanes(4, FLOOR_SIZE * 2);
    fly.lookFrom([0, 250, 600], [0, 0, 0]);
    const blankOpt = el(doc, 'option', '', 'New Empty Map');
    blankOpt.value = 'blank';
    baseSel.append(blankOpt);
    baseSel.value = 'blank';
    entriesOfPalette = [{ asset: FORGE_BLOCK, model: 'block', placed: 0 }];
    chosen = FORGE_BLOCK;
    drawAssets();
    refreshPlacementGround();
    applyView();
    setMode('place');
    history.reset(layoutText());
    refreshUndo();
    refreshCounts();
    say('blank floor');
    return;
  }
  showLoading('Reading the disc');
  if (wantsDisc) {
    showLoading(null);
    const source = await discSource();
    noteDiscSource(source);
    archives.setSource(source);
    creatorMaps.clear();
    pieceSources.clear();
    showLoading('Reading the disc');
  }
  let problems: string[] = [];
  // On a disc a failed list stops, as main does. A development build whose served tree lists nothing (a fresh clone:
  // `npm run extract-maps` was never run) reads the player's disc instead, as `?disc` would (./servedFallback; the
  // owner's smoke test, 2026-11-04: an empty floor with the disc loaded).
  let listFailed = false;
  const listOrStop = async (): Promise<boolean> => {
    try {
      ({ entries, problems } = await archives.list());
      listFailed = false;
      return true;
    } catch (e) {
      listFailed = true;
      entries = [];
      showLoading(null);
      say(`${wantsDisc ? 'the disc' : 'the served tree'} did not list its maps (${e instanceof Error ? e.message : String(e)})`, true);
      return !wantsDisc;
    }
  };
  if (!(await listOrStop())) return;
  if (servedTreeFallsBackToDisc({ dev: import.meta.env.DEV, readsDisc: wantsDisc, listFailed, listed: entries.length })) {
    // Only a disc the page already holds (no prompt, no card): with none, the page keeps its no-maps start at once --
    // a fresh clone's tests and a page with no disc never wait on a read (f9's proof of e7fbb1bce, 84 timeouts)
    const known = await knownDisc().then((k) => k.started, () => null);
    if (known) {
      wantsDisc = true;
      say('no maps in the served tree (npm run extract-maps writes them): the forge reads your disc');
      noteDiscSource(known);
      archives.setSource(known);
      creatorMaps.clear();
      pieceSources.clear();
      showLoading('Reading the disc');
      if (!(await listOrStop())) return;
    }
  }
  showLoading(null);
  const opt = (value: string, label: string): HTMLOptionElement => { const o = el(doc, 'option', '', label); o.value = value; return o; };
  /** The fragment is taken once. A reload then opens the autosave, not the link again. */
  const clearShareFragment = (): void => {
    const loc = globalThis.location;
    const history = globalThis.history;
    if (!loc || !history?.replaceState) return;
    try {
      const url = new URL(loc.href);
      url.hash = '';
      history.replaceState(history.state, '', `${url.pathname}${url.search}`);
    } catch { /* a location this page cannot rewrite */ }
  };
  const readAutosave = (text: string | null): Layout | null => {
    if (!text) return null;
    try { return layoutOfAuthoring(readForgeAuthoring(text, AUTOSAVE_NAME)); } catch { return null; }   // FCW-32: its rules too
  };
  /**
   * A share code, else the v2 autosave (a v1 file still reads). The code is cleared once it is read. A non-empty
   * autosave is replaced only when the opener says so. Null when neither is there.
   */
  const savedLayout = async (): Promise<{ layout: Layout | null; shared: boolean; earlier: Layout | null; earlierHasWork: boolean; aside: boolean; held: boolean }> => {
    await savesOpen();
    const keptText = forgeSaves.text('autosave');
    const earlier = readAutosave(keptText);
    // LATER 193 (the merge controller's call: set it aside and say so, as the saved list's `setAsideSaves`): an autosave
    // this build cannot read is kept as it was before anything the page writes next could replace it. Where it cannot be
    // set aside (the list full, a refused write: `setAsideAutosave`), it counts as work and is held in place: a share
    // link asks, and whatever opens writes no autosave until the player's own edit (`keepEarlier`, both open paths;
    // the batch review's F1).
    const unreadable = autosaveUnreadable(keptText);
    const aside = unreadable && await setAsideAutosaveNow(keptText!);
    const held = unreadable && !aside;
    const earlierHasWork = !!keptText && (savedLayoutHasWork(keptText) || held);
    const code = codeFromLocation(globalThis.location?.href ?? '');
    if (code) {
      clearShareFragment();
      let shared: Layout | null = null;
      try { shared = layoutOfRecord(await decodeShare(code)); }
      catch (e) { say(`The share link could not be opened (${e instanceof Error ? e.message : String(e)})`, true); }
      if (shared && earlierHasWork) {
        const open = await askConfirm('Open this shared layout?', 'This browser already has a layout. Opening the link replaces it.', 'Open the link', true);
        if (!open) return { layout: earlier, shared: false, earlier, earlierHasWork, aside, held };
      }
      if (shared) return { layout: shared, shared: true, earlier, earlierHasWork, aside, held };
    }
    return { layout: earlier, shared: false, earlier, earlierHasWork, aside, held };
  };
  /** LATER 193: the line said after the open (whose own line would replace it), or empty. */
  const asideWords = (found: { aside: boolean; held: boolean }): string =>
    found.aside ? 'An earlier autosave this build cannot read is kept aside in this browser, not replaced'
      : found.held ? 'An earlier autosave this build cannot read could not be kept aside, so it stays until you edit'
        : '';
  const sayAside = (found: { aside: boolean; held: boolean }): void => {
    const words = asideWords(found);
    if (words) say(words, true);
  };
  /**
   * LATER 818: the boot's first open -- unless the player asked for an open first (`playerOpenAsked`, in the gap while
   * the boot read its saves): then that open stands, and the boot's opens only if it left no base (it failed). False
   * when the boot's open was not made, so its lines (said after its open) are not said over the player's.
   */
  const openFirst = async (l: Layout): Promise<boolean> => {
    if (playerOpenAsked) {
      await opensAsked;
      if (base) return false;
    }
    await openLayout(l);
    return true;
  };
  if (entries.length === 0) {
    if (wantsDisc) { if (!listFailed) say('no SOCOM II maps on that disc', true); return; }
    const found = await savedLayout();
    // #348's re-review: a shared map layout this tree cannot open falls back to the earlier blank-floor layout.
    let saved = found.layout;
    // R6 (7): a content base needs no archive (its library is a blank floor's), so it opens here as a blank floor does --
    // when its pack is here (`holdsBase`). R6 fix-up: a share on one whose pack is not here opens the earlier layout
    // this page holds, as a share on a map does; with no earlier layout its open is refused and the floor opens.
    const sharedUnopened = !!saved && found.shared && !holdsBase(saved.base)
      && (saved.base.kind === 'map' ? found.earlier?.base.kind !== 'map' : !!found.earlier && holdsBase(found.earlier.base));
    const sharedWords = sharedUnopened ? unheldWords(saved, 'The shared layout needs a map this page cannot open') : '';
    if (sharedUnopened) saved = found.earlier;
    // A saved map layout is left alone: opening a blank floor would autosave over it.
    if (saved && saved.base.kind === 'map') { say(['no archives in the served tree (socomlegacy/public/maps)', asideWords(found)].filter(Boolean).join('. '), true); return; }
    keepEarlier = found.held;                                      // the review's F1: an unreadable autosave held in place
    baseSel.append(opt('blank', 'New Empty Map'));
    drawCustomMaps();                                              // FP-6: after the page's own row
    try {
      if (!(await openFirst(saved ?? newLayout({ kind: 'blank', library: BLANK_LIBRARY })))) return;
      // After the open, whose own line would replace it (the fold's review, low 3).
      if (sharedUnopened) say(`${sharedWords}, so your earlier layout is open`, true);
      else sayAside(found);
    } catch (e) { await fallBack(e, newLayout({ kind: 'blank', library: BLANK_LIBRARY })); }
    return;
  }
  /**
   * R6 (7): an open refused at boot (a content base whose pack is not here) leaves no world: the fallback opens, and the
   * refusal is said after it, whose own line would replace it. An open refused over a world keeps it (`prepareBase`).
   * R6 fix-up (the review's blocking finding): the fallback is not the player's work, so an autosave kept in this browser
   * is kept until the player's own edit (`keepEarlier`) -- the fallback's own write never replaces it.
   */
  /**
   * Each multiplayer base's own game type beside its name (the owner, 2026-11-06): `READERC.ZAR/missionlist.rdr`'s TYPE
   * (`FUN_002c9540` D:L168844-168906, `../loadout` `kitGameType`), the type a match on it plays when the layout names none.
   * Read once off the page's source; a map off the list, a campaign map, or a source without READERC, no word.
   */
  async function labelBaseTypes(): Promise<void> {
    let kits: Awaited<ReturnType<typeof loadKitSource>> = null;
    try { kits = await loadKitSource(assetSourceFor(archives.sourceRequest())); } catch { kits = null; }
    // The list read (or found absent): a layout waiting on its base's own type takes it now.
    missionKits = kits;
    missionKitsRead = true;
    // Shown, not an edit: no undo step, no save of its own -- the layout's next edit writes it (a file naming no type and
    // one naming its base's own play the same).
    if (typePending) {
      authoredType = ownTypeOf(base);
      typePending = false;
      refreshGameTypes();
    }
    if (!kits) return;
    for (const o of Array.from(baseSel.querySelectorAll('option'))) {
      const type = kitGameType(kits, o.value);
      if (type) o.textContent = `${o.textContent ?? ''} · ${FORGE_GAME_TYPE_NAME[type]}`;
    }
  }
  async function fallBack(e: unknown, fallback: Layout): Promise<void> {
    const words = e instanceof Error ? e.message : String(e);
    if (!base) { keepEarlier ||= forgeSaves.text('autosave') !== null; try { await openLayout(fallback); } catch (again) { say(again instanceof Error ? again.message : String(again), true); return; } }
    say(words, true);
  }
  if (problems.length) say(`${problems.length} archive${problems.length === 1 ? '' : 's'} would not name ${problems.length === 1 ? 'itself' : 'themselves'}: ${problems[0]}`, true);
  const mp = entries.filter((a) => !a.campaign), camp = entries.filter((a) => a.campaign);
  const optgroup = (label: string, rows: ArchiveEntry[]): HTMLOptGroupElement => {
    const g = el(doc, 'optgroup');
    g.label = label;
    g.append(...rows.map((a) => opt(a.stem, `${a.label} \u00b7 ${a.stem}`)));
    return g;
  };
  // The blank floor and its presets first (the owner, 2026-11-06: `./blankPresets`), then the disc's maps.
  const custom = el(doc, 'optgroup');
  custom.label = 'Custom / Preset';
  custom.append(...BLANK_PRESETS.map((p) => opt(p.value, p.label)));   // no blank floor without a type (the owner, 2026-11-06)
  baseSel.append(custom);
  if (mp.length) { baseSel.append(optgroup('Multiplayer', mp)); paletteSel.append(optgroup('Multiplayer', mp)); }
  if (camp.length) { baseSel.append(optgroup('Campaign', camp)); paletteSel.append(optgroup('Campaign', camp)); }
  void labelBaseTypes();
  // FG-26: `/forge/lobby/<id>` (or an old `/forge?lobby=<id>`) opens as a joiner (the lobby's layout, read-only); a join
  // that stops opens the forge as ever.
  const joinId = lobbyIdOf(globalThis.location?.search ?? '', globalThis.location?.pathname ?? '');
  if (joinId && await joinLobby(joinId)) return;
  // FP-6: after the page's own groups, the saves read -- and only once the page is not joining: a join opens no saves
  // store (R7-A, LATER 215); a joiner's return draws the group (`ownLayoutBack`).
  void savesOpen().then(drawCustomMaps, () => undefined);
  const found = await savedLayout();
  let first = found.layout;
  // A share or an autosave wins. Otherwise `/forge?floor` pins the blank floor, with or without a disc.
  if (!first && wantsFloor) first = newLayout({ kind: 'blank', library: BLANK_LIBRARY });
  // A map base this disc does not hold opens on one it does. A blank floor needs no archive. Pieces the disc lacks
  // stay in the layout (`placeAll`) and `openLayout` says how many. #348's re-review: a share that cannot open here
  // opens the earlier layout instead, and a fallback keeps the earlier autosave until the player edits (`./boot`).
  const holds = holdsBase;
  const heldOf = (l: Layout | null): 'none' | 'held' | 'unheld' => (!l ? 'none' : holds(l.base) ? 'held' : 'unheld');
  const choice = bootChoice({ first: heldOf(first), shared: found.shared, earlier: heldOf(found.earlier), earlierHasWork: found.earlierHasWork });
  const rejected = choice.open !== 'first' && !!first;
  const asked = first;
  if (choice.open === 'earlier') first = found.earlier;
  else if (choice.open === 'fallback') first = null;
  keepEarlier = choice.keepEarlier || found.held;                  // LATER 193's review F1: held in place until an edit
  const fallback = entries.find((a) => a.stem === 'MP2') ?? entries[0]!;
  try {
    if (!(await openFirst(first ?? emptyLayout({ kind: 'map', archive: fallback.stem })))) return;
    if (choice.open === 'earlier') say(`${unheldWords(asked, 'This disc has no base for the shared layout')}, so your earlier layout is open`, true);
    else if (rejected) say([`${unheldWords(asked, 'This disc has no base for that layout')}, so another was opened${choice.keepEarlier ? '; your earlier layout is kept until you edit' : ''}`, asideWords(found)].filter(Boolean).join('. '), true);
    else sayAside(found);
  } catch (e) {
    await fallBack(e, emptyLayout({ kind: 'map', archive: fallback.stem }));
  }
}
