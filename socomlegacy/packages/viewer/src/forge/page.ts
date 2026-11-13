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
  MeshBasicMaterial, Euler, MathUtils, Object3D, PlaneGeometry, Quaternion, type Material, Raycaster, Scene, Vector2, Vector3, type Intersection,
} from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { findLadders, HOSTAGE_START_LIFT_READING, spawnsFor, zonesOfKind, type GlobalLighting, type Grid, type Ladder, type SpawnSlot, type WorldPoly, type EffectProgram } from '@s2u/scene';
import { ACTION_TYPE_CODES } from '../mapActions';
import { placeRefs } from '../sceneHealth';
import { PLAY_CLIPS } from '../animator';
import { buildBody, type BodyView } from '../bodyView';
import { FlyCamera, FORGE_PIVOT_FALLBACK_DEPTH_ADAPTATION, type ForgeViewportView } from '../camera';
import { createSplitViews, parseSplitRecord, type SplitViews, type ViewLook } from './splitViews';
import { wrapYaw } from '../yaw';
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
import { assetsShown, readFavourites, readObjectFavourites, toggleFavourite, writeFavourites, writeObjectFavourites, type AssetFilter } from './favourites';
import { floorGround, layoutGround, prototypePolygons, standingSpot, type ContentMiss, type ContentPiece, type PieceHull } from './ground';
import type { AssetDefinition } from '../packs/content/assets';
import { CONTENT_METRES_PER_UNIT_ADAPTATION, contentPieceHull, type ContentResolver } from '../packs/content/collision';
import type { ContentLoadStage } from '../packs/content/map';
import { FORGE_DOCK_LAYOUT_KEY, FORGE_PANELS_KEY, FORGE_VIEW_KEY, pageIndexedDb, pageSettings } from '../pageStore';
import { agentChangedRefs, agentStepCount, decodeHistoryStep, encodeHistoryStep, History, historyCaption, recordEdit, redoMeta, undoAgentRun, undoMeta, undoWhile,
  type AgentRunUndo, type HistoryMeta } from './history';
import { doorsAfter, groundWithout, linesWithout, placementOf, placementOwners, placementsOf, propsWithout, type Placement } from './hide';
import { FORGE_MATCHING_CLASS } from './matchState';
import { contentPropsGroup, forgeLoadingScreen, lobbyArmoryData, matchExtras, startForgeLobbyMatch, startForgeMatch, type ForgeMatch } from './match';
import type { ForgeLobbyEnd, ForgeLobbyKick, ForgeLobbyPassword, ForgeLobbyVisibility } from './lobby/deps';
import { mountForgeLobby, type ForgeLobby } from './lobby/lobby';
import { armoryViewPaint } from './lobby/lobbyArmory';
import {
  addressWithLobby, askForgeSeat, askGuest, closeLobby, createLobby, enterLocked, fetchLobby, ForgeLobbySession, LOBBY_PASSWORD_MAX, lobbyEndWords, lobbyIdOf, missingArchives,
  handOnLobby, kickSeat, openLobbySocket, setListed, setPassword,
} from './lobbyClient';
import { defaultLobbyName, forgetStaleHost, joinLockedLobby, leaveLobbyInOrder, lobbyHostProof, lobbyMenuItems, lobbyPasswordField, lobbySocketOf, lobbyVisibilityToggle, typingTarget, type LobbyHostProof } from './lobbyPage';
import { BLANK_LIBRARY, blankLibraryMap, composeMatchMap, floorMesh, withSettings } from './matchMap';
import { mapWithArsenal } from './arsenalSetting';
import { rosterChoices, rosterStems, withRoster, type RosterMap } from './rosterSetting';
import { withExtrasSettings, withLoadingTitle, withWorldSettings } from './worldSettings';
import { LoadingPanel } from '../loadingPanel';
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
import { hullLineMaterial, hullSegments } from './hull';
import {
  archiveStem, assetId, DEFAULT_SETTINGS, emptyLayout, newLayout, originalTimeOf, FORGE_GAME_TYPE_NAME, LAYOUT_NAME_MAX, layoutDownloadName, layoutIds, modeCaption, NPC_BEHAVIOURS, parseAssetId, parseCamera,
  serializeLayout, settingsOf, withIds, placementKey, type LightRigSetting, type BombObjectives, type Piece, type ForgeGameType, type Layout, type LayoutBase, type LayoutCamera, type LayoutSettings,
  type NpcBehaviour, BOMB_SITE_REACH, } from './layout';
import { blankFloorOf, bombMarkerPlaysIn, breachReady, forgeTypeUnplayable, type ObjectiveMap } from './objectives';
import { under as mapUnder } from '../mapMeta';
import type { WeaponSoundEntry } from '../soundData';
import { COMMON_SCRIPT_EFFECTS, commonScriptNames, lentAccessAssets, lentScriptAssets, mergeLent, scriptEffectsOf, scriptSoundsOf, scriptSteps, type LentScriptAssets } from './scriptAssets';
import { ambientProgramsOf, EFFECT_ASSET_PREFIX, effectOfAssetName, FORGE_SCRIPT_OBJECT, forgeAmbientEmitters, isScriptObject, scriptOfProgram, SOUND_ASSET_PREFIX, scriptObjectData, soundOfAssetName, withForgeObjects, type AmbientProgram } from './forgeObjects';
import { ambientPreview, playAmbientSounds, previewSounds } from './previewAssets';
import { censusOfCopies, censusOptions, copiesOf, DEFAULT_LADDER, ladderPropsOf, type CopyKind, type MapCensus, type MapCopies } from './mapCensus';
import { turnFacade } from '../facade';
import { flareModelMap, flareTemplates, withPlacedFlares, type FlareTemplate } from './placedFlares';
import { SITE_OUTLINE_DONOR, withSiteOutlines } from './siteOutlines';
import { skyDomeFor } from './skyDome';
import { environmentOf } from './environmentCopy';
import { hiddenDataKeyOf, withoutHiddenData } from './mapDataHide';
import { movedDataKeyOf, withMovedData, type MovedMapData } from './mapDataMove';
import { plantSite } from '../net/objective';
import { BLANK_PRESETS, blankPresetOf, presetLayout, type PresetHostage } from './blankPresets';
import { hostageCharactersOf, hostagesLeftNotes, hostagesPlayIn, hostageDefault, nextHostageName, withLentHostageBodies } from './hostages';
import { EXTRACTION_ZONE_SIZE, nextSafetyName } from './extractionZones';
import { floorAiMaps } from './floorAi';
import {
  AI_LINK_COLOUR, AI_PIECE_BLOCK_COLOUR, aiGoalAt, aiMapZoneGoals, buildAiLinks, buildAiMapOverlay, buildAiPieceMarks, buildAiRoutes,
  describeAiCellAt, drawAiMapLegend, drawAiRouteLegend, type AiRouteGoal, type AiRouteStart,
} from './aiMapOverlay';
import { aiMapsWithPieces } from './aiPieceBlock';
import type { AiMaps } from '@s2u/scene';
import { nextNavName, nextViewName, withPlacedPoints, withPlacedViews } from './placedPoints';
import { turretModelMap, turretMove, turretTemplates, withPlacedTurrets, type TurretTemplate } from './turrets';
import { DEFAULT_BARRIER, DEFAULT_DOOR, DEFAULT_GATE, DEFAULT_TURRET } from './agent/commands';
import { RADIO_LOOK_SOURCES } from './copyDefaults';
import { accessGizmo, accessModelMap, accessMove, accessTemplates, calledOf, withPlacedAccess, type AccessTemplate } from './placedAccess';
import { doorModelMap, doorMove, doorTemplates, withPlacedDoors, type DoorTemplate } from './placedDoors';
import { ACTION_LINK_COLOUR, sphereSegments, BARRIER_GUIDE_COLOUR, BOMB_SITE_GUIDE_COLOUR, SWITCH_REACH_COLOUR, DAMAGE_LINK_COLOUR, LINK_NEAR, overlayLines, SWITCH_LINK_LIFT, bombSiteShapes, DOOR_SWING_COLOUR, GATE_GUIDE_COLOUR, guideGroup, HOSTAGE_GUIDE_COLOUR, keepWorldTurn, VIEW_GUIDE_COLOUR, viewShapes, yawWay, LADDER_CLIMB_COLOUR, TURRET_GUIDE_COLOUR, turretShapes, ladderSegments, ladderTriangles, swingOf, swingSegments, swingTriangles } from './interactOverlay';
import { playObjectives } from './playObjectives';
import {
  contentAssetKey, contentBaseRef, missingPackRefs, onlineRecordRefusal, withoutTree, readContentMapDefinition, TRIGGER_STAT_MAX, type ContentLayoutBase, type ContentMapDefinition,
  type ContentRef, type InstalledRulesPack, type PackRef, type RecordMode,
} from '@s2u/creator-contracts';
import { createWorkspaceDock, ForgePanelError, optionWithNote, type ForgePanel, type ForgeShell, type ForgeShellPage } from './shell/panel';
import { createDockShell, type DockNode } from './shell/dockShell';
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
import { scrubAllNumbers, wheelAllNumbers, type ScrubDetail } from './scrub';
import { buildOutliner, OUTLINER_KINDS, outlinerPanel, spawnSlotRows } from './panels/outlinerPanel';
import { mapDataGroups, type MapDataSource } from './mapData';
import { aimPointOf, linkSegments, linkTargets, programEffects } from './actionSummary';
import { FORGE_SWITCH_REACH, leverLook, SCRIPT_BLAST_DAMAGE, SCRIPT_BLAST_RADIUS, lookModelMap, mapActionTargets, radioLook, withPieceInstances, type SwitchLook, type SwitchLookId } from './placedAccess';
import type { ScriptStep, ScriptSteps, ScriptTarget } from '@s2u/creator-contracts';
import { AUDIO_LOOP_MAX, AUDIO_VOLUME_MAX, SWITCH_WAIT_MAX } from '@s2u/creator-contracts';
import { ACTION_ICONS } from '../hud';
import { bitmapWords } from './actionSummary';
import { environmentSections } from './environment';
import { buildEnvironment, drawEnvironment, environmentPanel } from './panels/environmentPanel';
import { buildLightRigEditor, directionOf, type Atmosphere } from './panels/lightRigEditor';
import { LightArrows } from './lightArrows';
import {
  billboardRows, billboardSpecs, isUserMarkKind, MAP_DATA_KIND_TOGGLES, MAP_DATA_MARKS, MapDataBillboards, placementOfMark, propMarkKey, userMarkKind,
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
  boundSetting, brightenFor, fogOfSlider, fogWithFar, matchBrightenOf, respawnSetting, roomOptionsOf, settingsDelta, sliderOfFog, stepSetting, type SteppedSetting,
  timeSetting,
} from './settings';
import { libraryProps, palette, type PaletteEntry } from './library';
import { standingPose } from './figure';
import { ASSET_DRAG_MIME } from './assetDrag';
import { FORGE_TOOL_ORDER, forgeKeyAction, forgeLeaseExit, forgeToolKeyHelp, forgeToolKeyLabel, type ForgeKeyState } from './keys';
import { servedTreeFallsBackToDisc } from './servedFallback';
import {
  blockPiece, bombMarker, disposeGhost, extractionZoneMarker, ghostIcon, hostageMarker, pointMarker, respawnMarker, zoneOutlines, FORGE_BLOCK, forgeRootOf, ghostOf, missingPiece, npcMarker, PieceLibrary, setSlotCellsShown, spawnMarker, type BombMarkerKind,
} from './pieces';
import {
  boundStep, clipOf, DEFAULT_GRID_STEP, DEFAULT_TURN_STEP, GRID_STEP_MAX, GRID_STEP_MIN, pastedPlaces, placementGridOf,
  mountOnWall, objectBox, placeClickKind, restingPoint, seatOn, snapYawRadians, WALL_NORMAL_Y_MAX, surfaceYs, TURN_STEP_MAX, TURN_STEP_MIN, type PlacePoint,
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

/**
 * The objects whose ghost wears their billboard's icon (`./pieces` `ghostIcon`): those drawn by their billboard alone --
 * the bomb's start and its sites, a tactical point -- and a hostage, whose faint cell is hard to see.
 */
const GHOST_ICON_KINDS: Partial<Record<string, string>> = {
  ambient: 'userAmbients',
  bomb: 'userBombStart', siteSeal: 'userSiteSeal', siteTerrorist: 'userSiteTerrorist', point: 'userTacPoints', hostage: 'userEscortees',
};

/** The asset browser's tabs (`objectTab`): the props, then the objects the Place tool places, in the toolbar's order. */
/**
 * The steps of the block a `while` / `endWhile` / `if` / `end` step opens or closes (an if's else ifs and else with it):
 * what a Remove takes out together, so a script always reads back.
 */
const scriptBlock = (l: readonly { do: string }[], k: number): number[] => {
  const st = l[k];
  if (!st) return [];
  if (st.do === 'while' || st.do === 'endWhile') {
    const fwd = st.do === 'while';
    let d = 0;
    for (let j = k; fwd ? j < l.length : j >= 0; j += fwd ? 1 : -1) {
      const x = l[j]!.do;
      if (x === (fwd ? 'while' : 'endWhile')) d++;
      else if (x === (fwd ? 'endWhile' : 'while') && --d === 0) return [k, j];
    }
    return [k];
  }
  if (st.do !== 'if' && st.do !== 'end') return [k];
  // The if that opens it, then its own else ifs, else and end.
  let at = k;
  if (st.do === 'end') {
    let d = 0;
    for (let j = k; j >= 0; j--) { const x = l[j]!.do; if (x === 'end') d++; else if (x === 'if' && --d === 0) { at = j; break; } }
  }
  const out = [at];
  let d = 0;
  for (let j = at; j < l.length; j++) {
    const x = l[j]!.do;
    if (x === 'if') d++;
    else if (d === 1 && (x === 'elseif' || x === 'else')) out.push(j);
    else if (x === 'end' && --d === 0) { out.push(j); break; }
  }
  return out;
};
/** An ambient effect's hearing guide's colour (`syncAmbientGuides`): its billboard's orange (`userAmbients`). */
const AMBIENT_GUIDE_COLOUR = 0xe08a2c;
/** A sound's RANGE where its script names none: `@s2u/sound` `SOUND_DEFAULT_RANGE` (`FUN_00342670`'s defaults, 160 to 430). */
const AMBIENT_DEFAULT_RANGE: [number, number] = [160, 430];
/** The asset browser's map choice that is no one map (`showEveryMap`): its first, every map's. */
const PALETTE_ALL = '*all';
/**
 * The asset browser's Common (the owner, 2026-11-13: "All, Common, then all the maps"; "do the same for all the asset
 * types"): what the maps share, so a map lists only its own -- the props of a shared library (`libraryProps` `shared`:
 * a model of another archive's library, the Pave Hawk's, the turrets'), the sounds every map's banks hold (the guns'
 * with them), the called effects every map has. A scene object (a door, a gate...) is a copy of one map's own: none.
 */
const PALETTE_COMMON = '*common';
type ObjectTab = 'props' | 'characters' | 'sound' | 'ambient' | 'door' | 'ladder' | 'turret' | 'barrier' | 'switch' | 'gate' | 'flare';
/**
 * The asset browser's tabs (the owner, 2026-11-13: "the cleanest separations of asset/object types ... the true asset
 * engine types"): the disc's own kinds of asset -- its props (models), its characters (`chartype`), its sounds (the
 * banks and their `sounds.rdr` entries) and its programs (zAnim: self-starting ambient ones and called effects alike)
 * -- then the scene objects a map's copy is placed whole as (each the Place tool's), kept as they were for now.
 */
/** The Characters tab shown: off for now (the owner, 2026-11-13: "hide the character assets for now"). */
const CHARACTERS_TAB_SHOWN = false;
const OBJECT_TABS: readonly (readonly [ObjectTab, string])[] = [
  // Characters hidden for now (the owner, 2026-11-13: placed NPCs are the Forge's own, not a disc object; `CHARACTERS_TAB_SHOWN`).
  ['props', 'Props'], ...(CHARACTERS_TAB_SHOWN ? [['characters', 'Characters'] as const] : []),
  ['door', 'Door'], ['ladder', 'Ladder'], ['turret', 'Turret'], ['barrier', 'Damage trigger'], ['switch', 'Switch'], ['gate', 'Gate'], ['flare', 'Flare'],
  // The sounds and the programs last (the owner, 2026-11-13).
  ['sound', 'Sounds'], ['ambient', 'Programs'],
];
/** A tab's things, plural, as the list's words say them ("doors", "sounds", "programs"). */
const tabWords = (word: string): string => { const w = word.toLowerCase(); return w.endsWith('s') ? w : /(ch|sh|x)$/.test(w) ? `${w}es` : `${w}s`; };
/** The Programs tab's filter (the owner, 2026-11-13): every program, the self-starting ambient ones, or the called effects. */
type ProgramFilter = 'all' | 'ambient' | 'effect';

/** A disc object a tile names: its map and its name there. */
type ObjectRef = { source: string; name: string };
/** The object kinds an asset id names (a ladder is a prop: its tile is its prop's own id). */
type ObjectKind = 'door' | 'turret' | 'gate' | 'barrier' | 'flare' | 'switch' | 'ambient';
/**
 * An object's asset id (a browser adaptation, FG.R2): `<kind>.<map>:<name>` -- `door.MP2:bdoor_4` -- so the asset
 * browser's tiles, its thumbnails and its drag (`../creator/assetsForgePanel`, the editor seam) carry it as a prop's
 * `<map>:<model>`; never a layout's key (the editor seam reads it first, `parseObjectAsset`).
 */
const objectAssetId = (kind: ObjectKind, source: string, name: string): string => `${kind}.${source}:${name}`;
const OBJECT_ASSET = /^(door|turret|gate|barrier|flare|switch|ambient)\.([A-Za-z0-9_]+):(.+)$/;
const parseObjectAsset = (asset: string): { kind: ObjectKind; source: string; name: string } | null => {
  const m = OBJECT_ASSET.exec(asset);
  return m ? { kind: m[1] as ObjectKind, source: m[2]!, name: m[3]! } : null;
};
/** The switch's looks (`SwitchLookId`), on every map: its tab's tiles. Custom prop is chosen in its Inspector, once placed. */
const SWITCH_LOOK_SOURCE = 'LOOK';
const SWITCH_LOOK_TILES: readonly (readonly [SwitchLookId, string])[] = [['lever', "Lever panel (Death Trap's)"], ['radio', "Radio (Sujo's)"]];

type Mode = 'select' | 'place' | 'spawnA' | 'spawnB' | 'respawnA' | 'respawnB' | 'npc' | 'hostage' | 'zone' | 'point' | 'view' | 'turret' | 'door' | 'ladder' | 'gate' | 'barrier' | 'flare' | 'bomb' | 'siteSeal' | 'siteTerrorist' | 'switch' | 'ambient';

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
  // The solid draws (`WorldView.setGeometry`; the owner, 2026-11-11): off, the wireframe alone. On by default.
  { id: 'geometry', label: 'Geometry', group: 'Draw', on: true },
  { id: 'wireframe', label: 'Wireframe', group: 'Draw', on: false },
  { id: 'untextured', label: 'Untextured highlight', group: 'Draw', on: false },
  { id: 'collision', label: 'Collision hull', group: 'Draw', on: false },
  { id: 'grid', label: 'Map grid', group: 'Draw', on: false },
  { id: 'spawns', label: 'Gizmos', group: 'Overlays', on: true },
  // The map's AI grid (`./aiMapOverlay`; the owner, 2026-11-12): every walkable cell, coloured by its soil.
  { id: 'aimap', label: 'AI Navigation', group: 'Overlays', on: false },
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
 * The Draw switches each split view keeps its own (the owner, 2026-11-11: "each viewport to be independent of other
 * viewport draw settings"; `./splitViews` `ViewLook.draw`): those that only show or hide what is drawn, set again at each
 * view's draw. Textured, Lit and Untextured highlight rewrite every material (Lit every vertex colour), Fog the scene's
 * fog and clear, the World group's others the draw order, and the picture the renderer: those stay every view's. The
 * Gizmos (`spawns`) are the Overlays menu's, shared by every view as its other switches are (the owner, 2026-11-13).
 */
const VIEW_DRAW_OWN = ['geometry', 'wireframe', 'collision', 'grid', 'aimap', 'shadows', 'detail', 'alternate'] as const satisfies readonly ViewToggle[];

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
  // The split viewport's layouts (`./splitViews`), each the viewport's outline and its dividers; and Maximize.
  'split-1': '<rect x="3" y="4" width="18" height="16" rx="1"/>',
  'split-2-side': '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M12 4v16"/>',
  'split-2-stack': '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 12h18"/>',
  'split-3-top': '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 12h18M12 12v8"/>',
  'split-3-bottom': '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 12h18M12 4v8"/>',
  'split-3-left': '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M12 4v16M12 12h9"/>',
  'split-3-right': '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M12 4v16M3 12h9"/>',
  'split-4': '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M12 4v16M3 12h18"/>',
  'split-4-top': '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 12h18M9 12v8M15 12v8"/>',
  'split-4-bottom': '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 12h18M9 4v8M15 4v8"/>',
  'split-4-left': '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M12 4v16M12 9.3h9M12 14.7h9"/>',
  'split-4-right': '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M12 4v16M3 9.3h9M3 14.7h9"/>',
  'split-4-stack': '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 8h18M3 12h18M3 16h18"/>',
  'split-4-side': '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M7.5 4v16M12 4v16M16.5 4v16"/>',
  maximize: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
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
  // The gizmo's spaces: World a globe; Local an object's own axes on a tilted box.
  world: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  local: '<path d="M5 8l7-4 7 4v8l-7 4-7-4z"/><path d="M12 12v8M12 12l7-4M12 12L5 8"/>',
  // An object shown or hidden in the editor (the Outliner's eye).
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  // The Outliner's folders (the editor's own grouping).
  folder: '<path d="M3 6h6l2 2h10v11H3z"/>',
  folderAdd: '<path d="M3 6h6l2 2h10v11H3z"/><path d="M12 11v6M9 14h6"/>',
  eyeOff: '<path d="M2 12s4-7 10-7c2 0 3.7.7 5.1 1.6M22 12s-4 7-10 7c-2 0-3.7-.7-5.1-1.6"/><path d="M4 20L20 4"/>',
  scale: '<path d="M4 10V4h6M20 14v6h-6M4 4l7 7M20 20l-7-7"/><rect x="10" y="10" width="4" height="4"/>',
  snap: '<path d="M4 4h4v4H4zM16 4h4v4h-4zM4 16h4v4H4zM16 16h4v4h-4zM8 6h8M8 18h8M6 8v8M18 8v8"/>',
  gridSnap: '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>',
  // Surface snapping: a box set down on a surface, an arrow bringing it down.
  surfaceSnap: '<path d="M3 20h18"/><path d="M7 16l5-2.5 5 2.5-5 2.5z"/><path d="M7 16v-3.5l5-2.5 5 2.5V16"/><path d="M12 3v4.5M9.8 5.6L12 7.8l2.2-2.2"/>',
  // The Edit menu's own (the owner, 2026-11-11: icons on the File and Edit rows): cut (scissors), paste (a clipboard),
  // duplicate (a copy beside its plus).
  cut: '<circle cx="6" cy="18" r="3"/><circle cx="18" cy="18" r="3"/><path d="M8.1 15.9L19 4M15.9 15.9L5 4"/>',
  paste: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 11h6M9 15h4"/>',
  duplicate: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3M14 11v6M11 14h6"/>',
  // An ambient tile's badges: its particles (a burst of sparks), its sound (a speaker and its waves).
  particles: '<circle cx="12" cy="12" r="2.2"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>',
  sound: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.2 6.5a7.8 7.8 0 0 1 0 11"/>',
  // A placement's lock (the Inspector's and the Outliner's rows): shut while it is locked, open while it is not.
  locked: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  unlocked: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>',
  // The docks' tabs and the Window menu's panels (the owner, 2026-11-11: "give each tab a nice icon").
  panelViewport: '<rect x="3" y="4" width="18" height="13" rx="1"/><path d="M8 21h8M12 17v4"/>',
  panelAssets: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>',
  panelObject: '<rect x="3" y="4" width="7" height="5" rx="1"/><path d="M6.5 9v9h5M6.5 13.5h5"/><rect x="11.5" y="11" width="9" height="5" rx="1"/><rect x="11.5" y="16" width="9" height="4" rx="1"/>',
  panelOutliner: '<path d="M4 5h4M4 5v14M4 12h4M4 19h4"/><path d="M11 5h9M11 12h9M11 19h9"/>',
  panelInspector: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  panelMap: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
  panelLight: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  panelRules: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  panelStarters: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
  panelContent: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="M4 7v14h11"/>',
  panelAgent: '<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 4v4M9 13h0M15 13h0"/><circle cx="12" cy="3.5" r="1"/><circle cx="9.5" cy="13" r="1"/><circle cx="14.5" cy="13" r="1"/>',
  angleSnap: '<path d="M4 20h16M4 20L15 5"/><path d="M11 20a7 7 0 0 0-2.4-5.3"/>',
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
  return `<span class="fx-billboard-icon" aria-hidden="true" style="background:${m.colour}">${m.glyph}</span>`;
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
const TOOL_NAMES: Record<Mode, string> = { ambient: 'Effect', select: 'Select', place: 'Place', spawnA: 'Spawn SEAL', spawnB: 'Spawn Terrorist', respawnA: 'Respawn SEAL', respawnB: 'Respawn Terrorist', npc: 'NPC', hostage: 'Hostage', zone: 'Extraction zone', turret: 'Turret', door: 'Door', gate: 'Gate', barrier: 'Damage trigger', switch: 'Switch', ladder: 'Ladder', flare: 'Flare', point: 'Tactical point', view: 'Spectator view', bomb: 'Bomb', siteSeal: 'Site SEAL', siteTerrorist: 'Site Terrorist' };

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
  wheelAllNumbers(doc.body);                                 // and steps under the wheel, the pointer on it (`./scrub`)

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
    place: tool('place', 'Place', 'Place: the object chosen -- a prop from the assets, or one of the objects in the row below (a door, a ladder, a spawn...)'),
    spawnA: tool('spawn', 'Spawn SEAL', 'Place a team A spawn (SEALs)', 'fx-team-a'),
    spawnB: tool('spawn', 'Spawn Terrorist', 'Place a team B spawn (Terrorists)', 'fx-team-b'),
    respawnA: tool('spawn', 'Respawn SEAL', "Place a team A respawn point (SEALs): where the SEALs respawn, beside the map's own", 'fx-team-a'),
    respawnB: tool('spawn', 'Respawn Terrorist', "Place a team B respawn point (Terrorists): where the Terrorists respawn, beside the map's own", 'fx-team-b'),
    npc: tool('npc', 'NPC', 'Place an NPC: the character chosen under Characters'),
    door: tool('npc', 'Door', "Place a door: a copy of a disc map's own (the palette's, or Frostfire's), its hinge at the click"),
    gate: tool('npc', 'Gate', "Place a gate: a copy of a disc map's own (Death Trap's or Enowapi's), its lever prompt at the gate; it slides on its lever and C4 wrecks it"),
    barrier: tool('npc', 'Damage trigger', "Place a damage trigger: a copy of a disc map's own destructible whose death runs its program -- a C4 barrier (C4 or an RPG wrecks it) or a hit trigger (health 0: any hit sets it off, never C4; Fish Hook's planks)"),
    switch: tool('npc', 'Switch', "Place a gate's switch: a copy of its gate's own disc lever panel (Death Trap's or Enowapi's), a SWITCH context action that slides that gate -- the gate itself has no prompt, as on the disc; the Inspector's Gate links it"),
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
    // The Forge objects (`../forge/forgeObjects`), under Other's More...: a disc map's ambient effect.
    ambient: tool('place', 'Effect', "Place an effect (an ambient effect): one of a disc map's own -- its fire, smoke, waterfall, torch, rain, bugs, with its sound and light -- playing from the round's start where it stands"),
  };
  // Each tool's key in its tooltip (`./keys` `forgeToolKeyLabel`: Q, then the number keys in the tools row's order).
  for (const [m, b] of Object.entries(modeBtns)) { const k = forgeToolKeyLabel(m); if (k) b.title += key(k); }
  // The tools that place a spawn or a bomb marker wear that placement's billboard (`markBadge`), as its mark and its row do.
  for (const [mode, kind] of [['spawnA', 'userSpawnA'], ['spawnB', 'userSpawnB'], ['respawnA', 'userRespawnA'], ['respawnB', 'userRespawnB'], ['npc', 'userNpcs'], ['hostage', 'userEscortees'], ['zone', 'userTacZones'], ['turret', 'userTurrets'], ['door', 'userDoors'], ['ladder', 'userLadders'], ['flare', 'userFlares'], ['gate', 'userGates'], ['barrier', 'userBarriers'], ['switch', 'userSwitches'], ['point', 'userTacPoints'], ['view', 'userScenicViews'], ['bomb', 'userBombStart'], ['siteSeal', 'userSiteSeal'],
    ['siteTerrorist', 'userSiteTerrorist'], ['ambient', 'userAmbients']] as const) {
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
  /**
   * The object the Place tool places, on its button (the owner, 2026-11-10: "add that object icon in the place button to
   * show which button we are placing"): that object's own icon from its row (`showPlacee`); none for a prop of the assets.
   */
  const placeeBadge = el(doc, 'span', 'fx-placee');
  placeeBadge.setAttribute('aria-hidden', 'true');
  placeeBadge.hidden = true;
  modeBtns.place.append(placeeBadge);
  const PLACE_TITLE = modeBtns.place.title;
  const showPlacee = (m: Mode): void => {
    const own = m !== 'place' && m !== 'select' ? modeBtns[m].querySelector('.fx-billboard-icon, svg.fx-ico') : null;
    placeeBadge.replaceChildren(...(own ? [own.cloneNode(true)] : []));
    placeeBadge.hidden = !own;
    const label = m !== 'place' && m !== 'select' ? modeBtns[m].querySelector('span:not(.fx-billboard-icon)')?.textContent ?? '' : '';
    modeBtns.place.title = label ? `${PLACE_TITLE} · now: ${label}` : PLACE_TITLE;
  };
  modeBtns.select.title = `Select${key(forgeToolKeyLabel('select') ?? '')} · the gear (or a right-click): its settings`;
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
  const selectMapPropsIn = selectToggle('selectMapProps', 'Select map data',
    'A click or a selection box picks the base map’s own props and data (spawns, hostages, sites, zones, doors...); off, they are passed over (the Outliner still selects them)');
  const selectUserPropsIn = selectToggle('selectUserProps', 'Select user data',
    'A click or a selection box picks your placements (props, spawns, objectives, objects...); off, they are passed over (the Outliner still selects them)');
  const selectHiddenIn = selectToggle('selectHidden', 'Select hidden overlays',
    'A kind whose billboards are switched off in the Overlays dropdown can still be clicked or boxed: a door, turret or prop by its model, a spawn or zone where its mark would be. Off, a hidden kind is passed over');
  selectSettings.append(el(doc, 'div', 'fx-tool-popup-note',
    'Off, a click looks through them to what is behind. With Select hidden overlays off, a kind switched off in the Overlays dropdown is passed over too; props always follow the first two. The Outliner selects any.'));
  const moveBtn = tool('move', 'Move', `Move with the gizmo${key('W')}`);
  const turnBtn = tool('turn', 'Rotate', `Rotate with the gizmo${key('E')}`);
  const scaleBtn = tool('scale', 'Scale', `Scale with the gizmo (not wired yet)${key('R')}`);
  scaleBtn.hidden = FORGE_TRANSFORM_STUBS_HIDDEN_ADAPTATION;    // FC-1 (main): a stub, hidden (`./transformStubs`)
  // The snaps are the viewport's grid and rotation pills (`snapPill`, `drawPlacement`); G and the pad's L3 turn both on and off.
  const dupBtn = tool('copy', '', `Duplicate · pad □${key('Ctrl+D')}`);
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
  // The original's loading screen over the match's load (research 125; the layout's Loading screen setting picks it).
  const playLoadingIn = playChoice('playLoading', 'Start', 'Straight into the match, or through the original’s loading screen while it loads',
    [['direct', 'Straight in'], ['loading', 'Loading screen']]);
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
    // The left (the owner, 2026-11-11): Controls and Docks where the menu button was -- the menu button and Reset layout
    // off the page (M and START open the menu; Window › Reset layout restores the docks), the File menu before them.
    (() => { const g = group(helpBtn, docksBtn); g.classList.add('fx-group--help'); return g; })(),
    baseGroup,
    group(undoBtn, redoBtn),                                    // left of Select (the owner, 2026-11-11)
    (() => { const g = group(modeBtns.select, modeBtns.place); g.classList.add('fx-group--modes'); return g; })(),
    // No Duplicate or Delete buttons on the toolbar (the owner, 2026-11-11): `dupBtn` and `delBtn` stay off the page,
    // their keys (Ctrl+D, Del), the pad's and the menus' rows doing the same.
    // The gizmo's modes and the snaps are the viewport's again (the owner, 2026-11-11): one spacer before the right's.
    el(doc, 'div', 'fx-spacer'),
    (() => { const g = group(walkBtn, checkBtn, lobbyBtn, saveMapBtn); g.classList.add('fx-group--play'); return g; })(),
    playBtn,
  );

  const paletteSel = el(doc, 'select', 'fx-select');
  /** The map the asset browser shows, or '' for All (`PALETTE_ALL`: every map's). */
  const paletteStem = (): string => (paletteSel.value.startsWith('*') ? '' : paletteSel.value);
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
  const chipFav = el(doc, 'button', 'fx-chip');
  chipFav.innerHTML = `${icon('star')}<span class="s2u-visually-hidden">Favourites</span>`;
  chipFav.setAttribute('aria-label', 'Favourites');
  chipFav.title = 'Favourites: only the ones you starred (press again for all of them)';
  chipFav.setAttribute('aria-pressed', 'false');
  const search = el(doc, 'input', 'fx-search');
  search.type = 'search';
  search.placeholder = 'Search props…';
  search.setAttribute('aria-label', 'Search the assets');
  const list = el(doc, 'ul', 'fx-assets');
  list.setAttribute('aria-label', 'Assets');
  const assetsHead = el(doc, 'div', 'fx-panel-head');
  assetsHead.append(el(doc, 'span', 'fx-dim', 'Source'));
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
  sizeLabel.append(sizeSlider);   // the slider alone, no value beside it (the owner, 2026-11-11); `sizeValue` kept off the page
  const assetPreviewLabel = el(doc, 'label', 'fx-asset-preview-toggle');
  const assetPreviewToggle = el(doc, 'input');
  assetPreviewToggle.type = 'checkbox';
  assetPreviewToggle.setAttribute('aria-label', 'Asset preview on hover');
  assetPreviewLabel.append(assetPreviewToggle, el(doc, 'span', '', 'Asset preview on hover'));
  assetViewPopup.append(assetPreviewLabel);
  // Sound on hover (the owner, 2026-11-11: "a setting ... to disable sound on hover"): an ambient effect's sounds while
  // its preview shows (`hoverAmbientSound`); kept with the view.
  const assetHoverSoundLabel = el(doc, 'label', 'fx-asset-preview-toggle');
  const assetHoverSoundToggle = el(doc, 'input');
  assetHoverSoundToggle.type = 'checkbox';
  assetHoverSoundToggle.setAttribute('aria-label', 'Sound on hover');
  assetHoverSoundLabel.title = "An ambient effect's sounds play while its preview shows";
  assetHoverSoundLabel.append(assetHoverSoundToggle, el(doc, 'span', '', 'Sound on hover'));
  assetViewPopup.append(assetHoverSoundLabel);
  // Loop sounds (the owner, 2026-11-11): a previewed effect's sounds round again until stopped; off, played once.
  const assetLoopSoundsLabel = el(doc, 'label', 'fx-asset-preview-toggle');
  const assetLoopSoundsToggle = el(doc, 'input');
  assetLoopSoundsToggle.type = 'checkbox';
  assetLoopSoundsToggle.setAttribute('aria-label', 'Loop sounds');
  assetLoopSoundsLabel.title = "A previewed ambient effect's sounds play round again until stopped; off, once";
  assetLoopSoundsLabel.append(assetLoopSoundsToggle, el(doc, 'span', '', 'Loop sounds'));
  assetViewPopup.append(assetLoopSoundsLabel);
  chipChars.hidden = true;                                     // a tab now (the owner, 2026-11-13): Characters
  // The Programs tab's filter chips: every program, the ambient ones, the called effects.
  const programChips = (['all', 'ambient', 'effect'] as const).map((f) => {
    const c = el(doc, 'button', 'fx-chip', f === 'all' ? 'All' : f === 'ambient' ? 'Ambient' : 'Effects');
    c.type = 'button';
    c.title = f === 'all' ? 'Every program' : f === 'ambient' ? "Self-starting ambient programs: they run from the round's start as the map runs them" : 'Called effects (explosions, dust, sparks): placed, they run again and again';
    c.dataset['programFilter'] = f;
    c.addEventListener('click', () => { programFilter = f; drawAssets(); });
    return c;
  });
  chips.append(chipFav, chipChars, ...programChips, assetViewPopupButton, assetViewPopup);
  filters.append(search, chips);
  const assetsFoot = el(doc, 'div', 'fx-assets-foot');
  assetsFoot.append(displayModes, sizeLabel);
  /**
   * The asset browser's object tabs (the owner, 2026-11-10: "in the assets browser, add all the objects types for each
   * map. Add an internal tab system to switch between all the object types. From Door -- Flare"): Props, then each
   * object the Place tool places, in the toolbar's order -- each tab the chosen map's own of that kind (`drawObjects`).
   */
  const objectTabsRow = el(doc, 'div', 'fx-asset-tabs');
  objectTabsRow.setAttribute('role', 'tablist');
  objectTabsRow.setAttribute('aria-label', 'Asset kinds');
  const objectTabButtons = new Map<string, HTMLButtonElement>();
  for (const [key, word] of OBJECT_TABS) {
    const b = el(doc, 'button', 'fx-asset-tab');
    b.type = 'button';
    // Its icon beside its word (the owner, 2026-11-10: "add the icons next to the text"): its toolbar button's own
    // (`markBadge`, the placement's billboard), the props' their mark.
    const own = key === 'props' ? markBadge('userProps') : key === 'characters' ? icon('npc') : key === 'sound' ? icon('sound')
      : modeBtns[key].querySelector('.fx-billboard-icon, svg.fx-ico')?.outerHTML ?? '';
    b.innerHTML = `${own}<span>${word}</span>`;
    b.setAttribute('role', 'tab');
    b.title = key === 'props' ? "The map's props" : key === 'characters' ? "The base map's own player models, placed as NPCs"
      : key === 'sound' ? "The map's sounds: each placed as an effect object that plays it (its script yours to change)"
      : key === 'ambient' ? "The map's programs (zAnim): its self-starting ambient effects and its called effects, each placed as an effect object"
      : `The map's ${tabWords(word)}: click one to place it, or drag it onto the world`;
    // Characters: the list the chip showed (`showChars`); any other tab its own list.
    b.addEventListener('click', () => { if (key === 'characters') showChars = true; else { objectTab = key; showChars = false; } search.value = ''; drawAssets(); });
    objectTabButtons.set(key, b);
    objectTabsRow.append(b);
  }
  const assetsSurface = el(doc, 'div', 'fx-assets-pane');
  assetsSurface.append(assetsHead, paletteSel, objectTabsRow, filters, list, assetsFoot);
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
  /**
   * The workbench (the owner, 2026-11-11: "drag any panel to any other panel ... how Visual Studio works"; `./shell/dockShell`):
   * the area between the toolbar and the status bar, one tree of splits and tab groups the panels dock in -- the viewport
   * one of them. Its default: the assets left, the viewport, then the Outliner over the Inspector (with the rest as tabs).
   */
  const workbench = el(doc, 'main', 'fx-workbench');
  const inspectorDom = buildInspector(doc, icon('reset'));
  const { name: inspectName, kind: inspectKind, fields, x: fx, y: fy, z: fz, yaw: fyaw, lock: lockBtn,
    pitch: fpitch, roll: froll, sx: fsx, sy: fsy, sz: fsz, resetPosition, resetRotation, resetScale } = inspectorDom;
  const outlinerDom = buildOutliner(doc);
  const { list: outliner, search: outlinerSearch, filter: outlinerFilter, filterSummary: outlinerFilterSummary, filterList: outlinerFilterList } = outlinerDom;
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
  const { gameTypeSel, lightIn, lightReset, lightOut, fogIn, fogOut, fogReset, numIn, ffIn, npcSel, respawnIn, eqSel } = settingsDom;
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
      hoverSound: (asset) => { hoverAmbientSound(asset); },
      soundProgress: (asset) => {
        const o = parseObjectAsset(asset);
        if (o?.kind !== 'ambient' || ambientPlaying !== `${o.source}:${o.name}`) return null;
        return ambientAudio?.timeline?.()?.fraction ?? null;
      },
      stagePiece: (asset) => (shellEditor ? shellEditor.stagePiece(asset) : Promise.resolve(null)),
      place: (staged, at, yaw) => (shellEditor ? shellEditor.place(staged, at, yaw) : Promise.resolve({ ok: false, code: 'NOT_READY', revision: 0 })),
      viewport: () => viewport,
      projectDrop: (x, y) => (shellEditor ? shellEditor.projectDrop(x, y) : { reason: FORGE_REFUSALS.busy }),
      projectCentre: () => (shellEditor?.projectCentre ? shellEditor.projectCentre() : { reason: FORGE_REFUSALS.busy }),
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
  const DEFAULT_DOCK: DockNode = { kind: 'split', dir: 'row', sizes: [0.18, 0.58, 0.24], children: [
    // Each a tab (`./shell/dockShell` `dockTabKeyOf`: a panel's `tab`, else its id), its sections stacked as before.
    { kind: 'group', id: 'g-assets', tabs: ['assets'], active: 'assets' },
    { kind: 'group', id: 'g-viewport', tabs: ['viewport'], active: 'viewport' },
    { kind: 'split', dir: 'column', sizes: [0.45, 0.55], children: [
      { kind: 'group', id: 'g-outliner', tabs: ['object', 'map', 'content', 'agent'], active: 'object' },
      { kind: 'group', id: 'g-inspector', tabs: ['inspector'], active: 'inspector' },
    ] },
  ] };
  /**
   * Each dock tab's and each panel's icon (the owner, 2026-11-11: "give each tab a nice icon ... also add those icons in the
   * window dropdown"): by a tab's key (its slugged word) or a panel's id; none, no icon.
   */
  const PANEL_ICONS: Readonly<Record<string, string>> = {
    viewport: 'panelViewport', assets: 'panelAssets', 'asset-browser': 'panelAssets', object: 'panelObject', outliner: 'panelOutliner',
    inspector: 'panelInspector', map: 'panelMap', view: 'view', settings: 'gear', environment: 'panelLight', rules: 'panelRules',
    starters: 'panelStarters', content: 'panelContent', 'creator-assets': 'panelContent', agent: 'panelAgent',
  };
  const panelIcon = (key: string): string => { const name = PANEL_ICONS[key]; return name ? icon(name) : ''; };
  const shell: ForgeShellPage = createDockShell({
    doc, workbench, workspace: workspaceDock, tabIcon: panelIcon,
    store: pageSettings, storeKey: FORGE_DOCK_LAYOUT_KEY,
    defaults: { root: DEFAULT_DOCK, homes: { left: 'g-assets', right: 'g-outliner', top: 'g-outliner', bottom: 'g-outliner', center: 'g-viewport' } },
    viewportId: 'viewport',
    // Docks off, Walk or a match: the viewport alone (FUI-1 fix-up A1: a panel is not drawn then).
    maximized: () => doc.body.classList.contains('fx-docks-off') || doc.body.classList.contains('is-playing') || doc.body.classList.contains(FORGE_MATCHING_CLASS),
    dockShown: (d) => !doc.body.classList.contains(FORGE_MATCHING_CLASS) && !doc.body.classList.contains('is-playing')
      && (d === 'workspace' || d === 'center' || !doc.body.classList.contains('fx-docks-off')),
    showDocks: () => setDocks(true),
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
    from: () => (base?.kind === 'blank' ? base.library : base?.kind === 'map' ? base.archive : ''),
    // Its sky: a disc map's own dome copied over the floor (`./skyDome`), or none.
    // An official map keeps its own sky (its world's): the copied dome is a new empty map's alone.
    skyChoices: () => base?.kind !== 'blank' ? [] : entries.filter((e) => !e.campaign && !absent.has(e.stem)).map((e) => [e.stem, `${e.label} · ${e.stem}`] as const),
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
    const blank = envEditable();
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
  // The owner, 2026-11-06: View renamed Draw; 2026-11-11: Draw renamed Display.
  viewportModesSummary.innerHTML = `${icon('view')}<span>Display</span>`;
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
  const geometryInput = addViewportToggle('geometry', 'Geometry');
  const texturedInput = modeToggle('Textured');
  const wireframeInput = addViewportToggle('wireframe', 'Wireframe');
  const litInput = modeToggle('Lit');
  const untexturedInput = addViewportToggle('untextured', 'Untextured highlight');
  /** Textured, Lit and Untextured highlight are the solid draws' own: with Geometry off they stand greyed, kept as set. */
  const syncGeometryDependents = (): void => {
    for (const i of [texturedInput, litInput, untexturedInput]) {
      i.disabled = !geometryInput.checked;
      i.closest('label')?.classList.toggle('is-disabled', !geometryInput.checked);
    }
  };
  // The collision hull and the map grid under Draw (the owner, 2026-11-11: no Overlays section here).
  addViewportToggle('collision', 'Collision hull');
  addViewportToggle('grid', 'Map grid');
  addViewportToggle('aimap', 'AI Navigation');                       // the map's AI grid (`./aiMapOverlay`; the owner, 2026-11-12)
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
  /**
   * The snaps in the viewport as Unreal's viewport toolbar draws them (the owner, 2026-11-11: "make it like unreal ... they
   * also split grid snap and rotation snap into different menus"; a browser adaptation, FG.R2): a pill a snap -- its
   * switch, an icon lit while it is on, then its step's dropdown (the ladder's steps, and any step typed).
   */
  const snapPill = (iconName: string, label: string, unit: string, ladder: readonly number[], min: number, max: number, keyHint: string) => {
    const pill = el(doc, 'div', 'fx-snap-pill');
    pill.setAttribute('role', 'group');
    pill.setAttribute('aria-label', label);
    const toggle = el(doc, 'button', 'fx-snap-toggle');
    toggle.type = 'button';
    toggle.innerHTML = icon(iconName);
    toggle.setAttribute('aria-label', label);
    const menu = doc.createElement('details');
    menu.className = 'fx-viewport-snap';
    const summary = doc.createElement('summary');
    summary.className = 'fx-snap-value';
    summary.title = `${label}: its step`;
    const panel = el(doc, 'div', 'fx-viewport-snap-panel');
    panel.append(el(doc, 'div', 'fx-snap-panel-title', `${label} step`));
    const presets = ladder.map((v) => {
      const b = el(doc, 'button', 'fx-snap-preset', `${v}${unit}`);
      b.type = 'button';
      b.dataset['step'] = String(v);
      panel.append(b);
      return b;
    });
    const row = el(doc, 'label', 'fx-viewport-snap-field');
    row.append(el(doc, 'span', '', 'Custom'));
    const field = el(doc, 'input', 'fx-num fx-setting-num fx-stepper');
    field.type = 'number';
    field.min = String(min);
    field.max = String(max);
    field.step = '1';
    field.title = `${label} step${unit === '°' ? ', in degrees' : ', in game units'}`;
    field.setAttribute('aria-label', `${label} step`);
    row.append(field);
    panel.append(row);
    menu.append(summary, panel);
    pill.append(toggle, menu);
    const draw = (on: boolean, step: number): void => {
      toggle.classList.toggle('is-on', on);
      toggle.setAttribute('aria-pressed', String(on));
      toggle.title = `${label} ${on ? 'on' : 'off'}: press to turn it ${on ? 'off' : 'on'} (${keyHint})`;
      summary.textContent = `${step}${unit}`;
      summary.classList.toggle('is-off', !on);
      for (const b of presets) b.setAttribute('aria-pressed', String(Number(b.dataset['step']) === step));
    };
    return { pill, toggle, menu, summary, field, presets, draw };
  };
  const gridSnapUi = snapPill('gridSnap', 'Grid snap', '', GRID_STEP_LADDER, GRID_STEP_MIN, GRID_STEP_MAX, 'G turns both snaps');
  const turnSnapUi = snapPill('angleSnap', 'Rotation snap', '°', TURN_STEP_LADDER, TURN_STEP_MIN, TURN_STEP_MAX, 'G turns both snaps');
  const viewportGridIn = gridSnapUi.field;
  const viewportTurnIn = turnSnapUi.field;
  /*
   * Surface snapping's button (the owner, 2026-11-11, as Unreal's viewport toolbar has it): its icon lit while on, its
   * dropdown the switch, then its settings -- Rotate to Surface Normal (drawn, never on: a saved layout keeps a piece's
   * yaw only) and the Surface Offset (`surfaceSnapDrag`).
   */
  const surfaceMenu = doc.createElement('details');
  surfaceMenu.className = 'fx-viewport-snap fx-surface-snap';
  const surfaceSummary = doc.createElement('summary');
  surfaceSummary.className = 'fx-surface-button';
  surfaceSummary.innerHTML = icon('surfaceSnap');
  surfaceSummary.setAttribute('aria-label', 'Surface snapping');
  const surfacePanel = el(doc, 'div', 'fx-viewport-snap-panel fx-surface-panel');
  const surfaceRow = (label: string, title: string): HTMLInputElement => {
    const row = el(doc, 'label', 'fx-toggle fx-surface-row');
    const i = doc.createElement('input');
    i.type = 'checkbox';
    i.setAttribute('aria-label', label);
    row.title = title;
    row.append(i, el(doc, 'span', '', label));
    surfacePanel.append(row);
    return i;
  };
  const surfaceIn = surfaceRow('Surface Snapping', "Dragging the move gizmo's centre seats the selection on the surface under the pointer");
  surfacePanel.append(el(doc, 'div', 'fx-snap-panel-title', 'Settings'));
  const surfaceNormalIn = surfaceRow('Rotate to Surface Normal', "Not yet: a saved layout keeps a piece's yaw only, so a tilt to the surface would not survive a save");
  surfaceNormalIn.disabled = true;
  surfaceNormalIn.closest('label')?.classList.add('is-disabled');
  const surfaceOffsetRow = el(doc, 'label', 'fx-viewport-snap-field fx-surface-offset');
  surfaceOffsetRow.append(el(doc, 'span', '', 'Surface Offset'));
  const surfaceOffsetIn = el(doc, 'input', 'fx-num fx-setting-num fx-stepper');
  surfaceOffsetIn.type = 'number';
  surfaceOffsetIn.step = '1';
  surfaceOffsetIn.title = 'How far above the surface it is seated, game units';
  surfaceOffsetIn.setAttribute('aria-label', 'Surface offset');
  surfaceOffsetRow.append(surfaceOffsetIn);
  surfacePanel.append(surfaceOffsetRow);
  surfaceMenu.append(surfaceSummary, surfacePanel);
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
  // The owner, 2026-11-06: Billboards renamed View; 2026-11-11: View renamed Overlays.
  billboardsSummary.innerHTML = `${icon('billboard')}<span>Overlays</span>`;
  const billboardsList = el(doc, 'div', 'fx-viewport-modes-list fx-billboards-list');
  // Two columns, so every switch shows at once with no scroll: the settings and the overlays, then the kinds -- one list,
  // the map's own data and the user's own placements alike (the owner, 2026-11-10: "only have a single list").
  const billboardsCols = [el(doc, 'div', 'fx-billboards-col'), el(doc, 'div', 'fx-billboards-col')] as const;
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
  // One list (the owner, 2026-11-06): the billboards' two switches and the overlays' under a single Overlays heading.
  billboardsCol.append(el(doc, 'h3', 'fx-viewport-modes-heading', 'Settings'));   // the owner, 2026-11-11: was Overlays
  const billboardsOnIn = billboardToggle('Show billboards');
  // Every gizmo at once (the owner, 2026-11-06: one switch; second in the list): the disc's spawn slots' cells and arrows
  // (`../overlays`) and the placed spawns' and hostages' cells, the doors' swings, the ladders', turrets', views', gates'
  // and barriers' guides (`./interactOverlay`) -- the view setting the disc's slots had. Its own listener: View's switches
  // took theirs before this one joined them.
  const discSlotsIn = billboardToggle('Gizmos');
  discSlotsIn.closest('label')!.title = 'Every gizmo on or off: spawn and hostage cells, door swings, ladder, turret, view, gate and C4 barrier guides';
  viewportToggleInputs.set('spawns', discSlotsIn);
  discSlotsIn.addEventListener('change', () => { view.spawns = discSlotsIn.checked; applyView(); });
  // Both the billboards' and the gizmos' (`applyGizmoDepth`), so its own switch whatever Show billboards says.
  const billboardsTopIn = billboardToggle('Always on top');
  billboardsTopIn.closest('label')!.title = 'Draw the billboards and the gizmos over all the geometry, so they can be found from anywhere on the map; off, walls hide them';
  // The map's own flare glows (its lights', the sun's, the sky's): drawn as the game draws them, or out of the way.
  const flareGlowsIn = billboardToggle('Flare glows');
  flareGlowsIn.closest('label')!.title = "The map's own light glows, sun, moon and stars; off, they are not drawn (nor picked)";
  flareGlowsIn.addEventListener('change', () => { flareGlows = flareGlowsIn.checked; applyView(); });
  // In the Draw dropdown (the owner, 2026-11-11: "Move Flare glows to draw dropdown"), under World after Alternate states;
  // still a view's own (`ViewLook.glows`).
  const alternateRow = viewportToggleInputs.get('alternate')?.closest('label');
  const flareGlowsRow = flareGlowsIn.closest('label')!;
  if (alternateRow) alternateRow.after(flareGlowsRow); else viewportModesList.append(flareGlowsRow);
  // The map's light rig as arrows (`./lightArrows`): which way each of its directional lights comes in.
  const lightDirectionsIn = billboardToggle('Light directions');
  lightDirectionsIn.closest('label')!.title = "The map's light rig (GlobalLighting): an arrow each light, in its colour, the way it shines";
  lightDirectionsIn.addEventListener('change', () => { lightDirections = lightDirectionsIn.checked; applyView(); });
  // Only user data (the owner, 2026-11-10: "have a toggle that says 'Only user data'"): the map's own marks and guides
  // hidden all at once (`isUserMarkKind`), the user's own placements' kept by their kinds' switches.
  const onlyUserIn = billboardToggle('Only user data');
  onlyUserIn.closest('label')!.title = "Hide the map's own data (its spawns, doors, actions...), keeping your own placements' marks";
  onlyUserIn.addEventListener('change', () => { onlyUserData = onlyUserIn.checked; applyView(); });
  // The Select tool's Select hidden overlays (the owner, 2026-11-13: "also add this select option in the overlays
  // menu"): the same one setting, here beside the switches that hide the kinds.
  const overlaySelectHiddenIn = billboardToggle('Select hidden overlays');
  overlaySelectHiddenIn.closest('label')!.title = 'A kind switched off here can still be clicked or boxed: a door, turret or prop by its model, a spawn or zone where its mark would be. Off, a hidden kind is passed over';
  overlaySelectHiddenIn.addEventListener('change', () => setSelectHidden(overlaySelectHiddenIn.checked));
  // The kinds: one list, its All first -- every kind on or off at once; part of them on, it shows mixed (`indeterminate`).
  billboardsCol = billboardsCols[1];
  billboardsCol.append(el(doc, 'h3', 'fx-viewport-modes-heading', 'Overlay'));    // the owner, 2026-11-11: was Billboards
  const billboardsAllIn = billboardToggle('All');
  billboardsAllIn.closest('label')!.title = 'Every kind on or off at once';
  billboardsAllIn.addEventListener('change', () => {
    for (const t of MAP_DATA_KIND_TOGGLES) { if (billboardsAllIn.checked) billboardsOff.delete(t.id); else billboardsOff.add(t.id); }
    applyView();
  });
  const billboardKindIns = new Map<string, HTMLInputElement>();
  /** A kind's switch (`billboardRows`): its mark before its word, as the viewport draws it. */
  const kindSwitch = (t: (typeof MAP_DATA_KIND_TOGGLES)[number]): void => {
    const input = billboardToggle(t.label);
    // Its letter on its colour, split down the middle for a two-sided kind (spawns, respawns: SEALs | Terrorists).
    const marks = t.kinds.map((k) => MAP_DATA_MARKS[k]!);
    const colours = [...new Set(marks.map((m) => m.colour))];
    const badge = el(doc, 'span', 'fx-billboard-icon', marks[0]!.glyph);
    badge.setAttribute('aria-hidden', 'true');
    badge.style.background = colours.length === 2 ? `linear-gradient(90deg, ${colours[0]} 50%, ${colours[1]} 50%)` : colours[0]!;
    input.after(badge);
    billboardKindIns.set(t.id, input);
  };
  for (const row of billboardRows()) {
    if ('heading' in row) { billboardsCol.append(el(doc, 'h4', 'fx-billboards-section', row.heading)); continue; }
    kindSwitch(row.toggle);
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
    onlyUserIn.checked = onlyUserData;
    overlaySelectHiddenIn.checked = selectHidden;
    for (const [id, input] of billboardKindIns) { input.checked = !billboardsOff.has(id); input.disabled = !billboardsOn; }
    const offCount = MAP_DATA_KIND_TOGGLES.filter((t) => billboardsOff.has(t.id)).length;
    billboardsAllIn.checked = offCount === 0;
    billboardsAllIn.indeterminate = offCount > 0 && offCount < MAP_DATA_KIND_TOGGLES.length;
    billboardsAllIn.disabled = !billboardsOn;
    for (const [id, solo] of billboardSolos) {
      const on = soloOf(id);
      solo.classList.toggle('is-on', on);
      solo.setAttribute('aria-pressed', String(on));
      solo.disabled = !billboardsOn;
    }
    billboardsTopIn.disabled = false;                           // the gizmos' too: never held by Show billboards
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
    [surfaceMenu, surfaceSummary],
    [gridSnapUi.menu, gridSnapUi.summary],
    [turnSnapUi.menu, turnSnapUi.summary],
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
  /**
   * Every dropdown of the Forge closed by a press outside it (the owner, 2026-11-12: "When I click outside of this filter
   * popup, close it ... for all popup windows in the forge app"; a browser adaptation, FG.R2): the viewport's, the
   * Outliner's Filter (`.fx-viewport-modes`), the snaps', the camera's, the HUD's More, the split view's -- and any other
   * marked `data-forge-popup`. A section's fold (`.fx-panel`, `.fx-fold`) is no popup and stays as it is. The menu bar's
   * and the tool gears' popups close themselves alike (their own listeners).
   */
  const FORGE_POPUPS = 'details[open]:is(.fx-viewport-modes, .fx-viewport-snap, .fx-camera-views, .fx-camera-settings, .fx-hud-more, .fx-split-menu, [data-forge-popup])';
  doc.addEventListener('pointerdown', (event) => {
    const target = event.target as Node | null;
    for (const popup of doc.querySelectorAll<HTMLDetailsElement>(FORGE_POPUPS)) if (!(target && popup.contains(target))) popup.open = false;
  }, true);
  viewportLeftControls.append(viewportModes, billboardsMenu, viewMenu);
  /*
   * The gizmo's controls back in the viewport, icons alone, as Unreal's viewport toolbar has them (the owner, 2026-11-11;
   * a browser adaptation, FG.R2): Move / Rotate / Scale one joined pill (their titles the keys, W / E / R), World / Local
   * its own round button, then the grid snap's pill and the rotation snap's, then the camera's settings -- on the first
   * view's top-right (`./splitViews` `globalControls`).
   */
  const gizmoTools = el(doc, 'div', 'fx-gizmo-tools');
  gizmoTools.setAttribute('role', 'group');
  gizmoTools.setAttribute('aria-label', 'Transform');
  gizmoTools.append(moveBtn, turnBtn, scaleBtn);
  // The gizmo's space (the owner, 2026-11-10: "a world/local transform button in the viewport, like how many 3D editors"):
  // World, its handles on the world's axes; Local, on the selected placement's own.
  const spaceBtn = el(doc, 'button', 'fx-tool fx-gizmo-space', '');
  spaceBtn.innerHTML = `${icon('world')}<span>World</span>`;
  spaceBtn.type = 'button';
  cameraHud.append(spaceBtn, gizmoTools, surfaceMenu, gridSnapUi.pill, turnSnapUi.pill);   // World / Local left of Move (the owner, 2026-11-11)
  cameraHud.append(cameraSettings);
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
  /*
   * The Controls card (the owner, 2026-11-11: the menu button merged into the ? button, "switch between editor controls
   * and walk/play controls"): a switch at its top -- Editor, Walk / Play -- each its own columns; the forge menu's way in
   * (M, START) a button at its foot.
   */
  helpCard.innerHTML = `<header><h2>Controls</h2><div class="fx-help-switch" role="tablist" aria-label="Controls for">`
    + `<button type="button" role="tab" data-help-tab="editor">Editor</button><button type="button" role="tab" data-help-tab="play">Walk / Play</button>`
    + `</div></header><div class="fx-help-cols" data-help="play" role="tabpanel">${
    keyRows('Controller', [
      ['Left stick', 'Move'], ['Right stick', 'Look'], ['&#x2715; Cross', 'Jump'], ['&#x25cb; Circle', 'Stance'],
      ['&#x25a1; Square', 'Action (doors)'], ['START', 'Back to the editor'],
      ['In the match', 'The game&#x2019;s own controls'], ['Hold SELECT + START', 'Back to the forge from the match'],
    ])}${keyRows('Keyboard and mouse', [
      ['W A S D', 'Move'], ['Mouse', 'Look'], ['Space', 'Jump'], ['C', 'Stance'], ['X', 'Doors'], ['V, P or Esc', 'Back to the editor'],
      ['In the match', 'The controller (the keyboard is not the match&#x2019;s)'],
    ])}</div><div class="fx-help-cols" data-help="editor" role="tabpanel">${
    keyRows('Controller', [
      ['Left stick', 'Fly'], ['Right stick', 'Look'], ['L2 / R2', 'Down / up'],
      ['&#x2715; Cross', 'Select or place at the centre'], ['Hold &#x2715;', 'Add to or take out of the selection'], ['L1 / R1', 'Previous / next tool (every tool, as the tools row)'], ['D-pad &#x2191; &#x2193;', 'Previous / next prop (a character with the NPC tool)'],
      ['D-pad &#x2190; &#x2192;', 'Turn the selection by the turn step'], ['Hold &#x25cb; + sticks', 'Move the selection (right stick: height)'],
      ['&#x25cb; Circle', 'Deselect'], ['&#x25a1; Square', 'Duplicate'], ['&#x25b3; Triangle', 'Delete'], ['SELECT', 'Undo'], ['Hold SELECT', 'Redo'],
      ['L3', 'Snap on / off'], ['R3', 'Frame the selection'], ['START', 'The forge menu: Play, Walk, base, palette, view, save'], ['Stick at its rim', 'Fly faster'],
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
      ...forgeToolKeyHelp((t) => TOOL_NAMES[t]),                // FP-1b (main): the keys' real order, never a literal list
      FORGE_TRANSFORM_STUBS_HIDDEN_ADAPTATION ? ['W / E', 'Move / rotate'] : ['W / E / R', 'Move / rotate / scale'], ['Q', 'Gizmo World / Local'],
      ['G / Shift+G', 'Group the selection into a folder / ungroup it (outliner)'], ['Ctrl+D / Del', 'Duplicate / delete (a selected folder with everything in it)'], ['[ / ]', 'Previous / next prop (a character with the NPC tool)'], [', / .', 'Turn the selection by the turn step'],
      ['M', 'The forge menu (arrows, Enter, Esc)'], ['Ctrl+X / Ctrl+C / Ctrl+V', 'Cut / copy / paste the selection at the cursor'], ['Ctrl+Z / Ctrl+Y', 'Undo / redo'], ['Ctrl+O / Ctrl+S', 'Open a file / saves'], ['F / H / P / V', 'Frame / docks / play / walk'],
    ])}</div><footer><button type="button" class="fx-tool" data-help-menu>Forge menu (M)</button><button type="button" class="fx-tool fx-primary">Close</button></footer>`;
  help.append(helpCard);
  /** The card's switch: Editor or Walk / Play, its columns shown, its tab pressed. */
  const showHelpTab = (tab: 'editor' | 'play'): void => {
    for (const b of helpCard.querySelectorAll<HTMLButtonElement>('[data-help-tab]')) {
      const on = b.dataset['helpTab'] === tab;
      b.setAttribute('aria-selected', String(on));
      b.classList.toggle('is-on', on);
    }
    for (const c of helpCard.querySelectorAll<HTMLElement>('[data-help]')) c.hidden = c.dataset['help'] !== tab;
  };
  for (const b of helpCard.querySelectorAll<HTMLButtonElement>('[data-help-tab]')) {
    b.addEventListener('click', () => showHelpTab(b.dataset['helpTab'] === 'play' ? 'play' : 'editor'));
  }
  showHelpTab('editor');
  // Reset layout: the workbench's default tree, the docks shown.
  resetLayoutBtn.addEventListener('click', () => {
    shell.resetLayout();
    setDocks((globalThis.innerWidth ?? 1280) > 760);
  });
  /**
   * The placing tools on a row of their own under the toolbar (the owner, 2026-11-06), in labelled sections (the owner,
   * 2026-11-06; a browser adaptation, FG.R2): Spawn (spawns, respawn points), Objects (door, ladder, turret, damage
   * trigger, switch, gate, flare), then Demolition's bomb and sites, Escort's and Extraction's hostages and zones
   * (`MODE_TOOL_TYPES`, which greys a section the layout's game type does not play), Info (tactical points, spectator
   * views) and Other (NPCs); ambient effects with the objects. Select and Place stay on the toolbar.
   */
  const toolsRow = el(doc, 'nav', 'fx-tools-row');
  toolsRow.setAttribute('aria-label', 'Objects to place (the Place tool places the one chosen)');
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
    // Ambient with the objects (the owner, 2026-11-11).
    modeSection('Objects', 'objects', group(modeBtns.door, modeBtns.ladder, modeBtns.turret, modeBtns.barrier, modeBtns.switch, modeBtns.gate, modeBtns.flare, modeBtns.ambient)),
    // Breach plays the bomb's start and the SEALs' site too (`./objectives` `breachReady`): one section, both modes named.
    modeSection(`${FORGE_GAME_TYPE_NAME[2]} · ${FORGE_GAME_TYPE_NAME[1]}`, 'demolition', group(modeBtns.bomb, modeBtns.siteSeal, modeBtns.siteTerrorist)),
    modeSection(`${FORGE_GAME_TYPE_NAME[3]} · ${FORGE_GAME_TYPE_NAME[4]}`, 'escort', group(modeBtns.hostage, modeBtns.zone)),
    modeSection('Info', 'info', group(modeBtns.point, modeBtns.view)),
    modeSection('Other', 'other', group(modeBtns.npc)),
  );
  doc.body.append(top, toolsRow, workbench, statusBar, checkSheet, modal, help, workspaceDock, selectSettings, playSettings);
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
  // Opened on the controls of what is going on: Walk / Play while walking or in a match, else the editor's.
  const setHelp = (on: boolean): void => { if (on) showHelpTab(playing ? 'play' : 'editor'); help.hidden = !on; leaseCheck(); };
  helpBtn.addEventListener('click', () => setHelp(true));
  help.addEventListener('click', (e) => {
    const button = (e.target as HTMLElement).closest('footer button');
    if (e.target !== help && !button) return;
    setHelp(false);
    if (button?.hasAttribute('data-help-menu')) menuBtn.click();   // the forge menu, the ≡ button's way in
  });
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
  /** The split viewport (`./splitViews`), made once the view's settings are read (below). */
  let split: SplitViews | null = null;
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
    if (split) split.relayout();                               // each view's share, the active one's aspect the camera's
    else fly.setAspect(created.presentation() === 'ps2' ? 640 / 448 : w / h);
    fitHudLater();
  };
  /** The top-right controls fitted to the active view (`fitHud`, set once the split is made); a frame later, laid out. */
  let fitHudNow: (() => void) | null = null;
  const fitHudLater = (): void => { requestAnimationFrame(() => fitHudNow?.()); };
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
    const hostageSlots = (mapDataShown(baseMap).escortees ?? []).map((e): SpawnSlot => ({ side: 0, index: 0, position: [e.at[0], e.at[1] - HOSTAGE_START_LIFT_READING + 0.5, e.at[2]], onFloor: true, step: 0, facing: yawWay(e.yaw), loc: e.loc }));
    // Its gates' and C4 barriers' gizmos (`./placedAccess` `accessGizmo`): each lever at its own place.
    for (const t of accessTemplates(baseMap, baseMap.archive)) {
      const g = accessGizmo(t, 'disc');
      if (!g.segments.length) continue;
      const guide = guideIn(g.segments, g.triangles, null, t.kind === 'gate' ? GATE_GUIDE_COLOUR : BARRIER_GUIDE_COLOUR, t.kind === 'gate' ? 'gates' : 'damage');
      mapAccessGuides.push(guide);
      scene.add(guide);
    }
    // Its plant sites' reach (MPBOMB context actions): each action's own `actions.rdr` range and elevation (`../mapActions`);
    // a site this layout takes out (`./mapDataHide`) has none.
    for (const a of mapDataShown(baseMap).actions ?? []) {
      if (a.type.toUpperCase() !== 'MPBOMB') continue;
      const g = bombSiteShapes(a.at, a.range, a.elevation);
      if (!g.segments.length) continue;
      const guide = guideIn(g.segments, g.triangles, null, BOMB_SITE_GUIDE_COLOUR, 'actions');
      mapAccessGuides.push(guide);
      scene.add(guide);
    }
    // What each context action and damage trigger reaches (`./actionSummary`): a line from its mark to each place its
    // programs turn on, off or move, placed as the world places them (`../sceneHealth` `placeRefs`) -- Crossroads'
    // switches to their arches, Sujo's radios to the ladder and the coop. An editor guide; the match runs nothing here.
    for (const link of mapActionLinks(baseMap, polys)) {
      if (!link.to.length) continue;
      const guide = guideIn(linkSegments(link.from, link.to), [], null, link.kind === 'damage' ? DAMAGE_LINK_COLOUR : ACTION_LINK_COLOUR, link.kind);
      mapAccessGuides.push(guide);
      scene.add(guide);
    }
    // Its spectator views' looks: an arrow from each along its yaw and pitch (`SCENIC_VIEWS_READING`).
    // Where this layout has them (`mapDataShown`: a view moved, `Layout.movedData`), as their V marks are.
    const looks = (mapDataShown(baseMap).scenicViews ?? []).map((v) => viewShapes(v.at, v.yaw, v.pitch, VIEW_ARROW_LENGTH));
    if (looks.length) {
      mapViewGuides = guideIn(looks.flatMap((s) => s.segments), looks.flatMap((s) => s.triangles), null, VIEW_GUIDE_COLOUR, 'scenicViews');
      scene.add(mapViewGuides);
    }
    if (hostageSlots.length) {
      mapHostageGuides = guideIn(Array.from(slotBoxSegments(hostageSlots)), [], null, HOSTAGE_GUIDE_COLOUR, 'escortees');
      scene.add(mapHostageGuides);
    }
    // The new guides under the switches as they stand (the Gizmos switch, each kind's, Only user data): drawn afresh they
    // were all shown -- a delete's redraw brought back guides the Overlays had off (the owner, 2026-11-13).
    if (!playing) applyGuides();                               // Play keeps its own (all hidden)
  }
  /** The Billboards dropdown's settings on the marks: shown on a disc map, on top or not, each kind's switch. */
  const applyBillboards = (): void => {
    applyMarks();
    drawBillboardSwitches();
    marksShown = lookKey(lookNow());
  };
  /** The marks as the View dropdown's billboard switches have them (no menu drawn): what a split view's draw sets. */
  const applyMarks = (): void => {
    mapBillboards.setHiddenKinds(MAP_DATA_KIND_TOGGLES.flatMap((t) => (billboardsOff.has(t.id) ? t.kinds : onlyUserData ? t.kinds.filter((k) => !isUserMarkKind(k)) : [])));
    mapBillboards.setOnTop(billboardsOnTop);
    // The user's marks show on a blank floor too; with no map the map's own are simply none.
    mapBillboards.setVisible(billboardsOn);
    // A disc map's rig, or a new empty map's own (or the one it is built from): the same arrows, the same switch.
    lightArrows.setVisible(lightDirections && (!!baseMap || base?.kind === 'blank'));
    if (mapZoneLines) mapZoneLines.visible = billboardsOn && !billboardsOff.has('tacZones');   // with the Z marks' switch
    baseView?.setFlaresShown?.(flareGlows);                     // the map's own glows, drawn or out of the way
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
  /**
   * A movable map data object's gizmo stand-in (`./mapDataMove`; the owner, 2026-11-12): the gizmo sits on it at the
   * object's place; its drag's end is the object's move, one edit (`commitMapDataMove`). Its turn is not kept.
   */
  const mapDataProxy = new Object3D();
  scene.add(mapDataProxy);
  /**
   * A rules entity's gizmo stand-in (the owner, 2026-11-12: "do it for rule entities as well"): the gizmo sits on it at
   * the entity's place; its drag's end is the entity's move by the difference, the planner's edit (`piece.move`), as its
   * Inspector fields make it. Its turn is not kept.
   */
  const entityProxy = new Object3D();
  scene.add(entityProxy);
  let dragFrom: { centre: Vec3; poses: Pose[] } | null = null;
  /** The gizmo's space (`spaceBtn`, `setGizmoSpace`): its handles on the world's axes or the placement's own. Kept with the view. */
  let gizmoSpace: 'world' | 'local' = 'world';
  /** The placements under the dragged ones (`followersOf`), carried along each step of a drag. */
  let dragFollow: { r: Object3D; a: Object3D; rel: Matrix4 }[] | null = null;
  let duplicateModifierOnPointerDown = false;
  /** A map prop's drag waiting on its first move: a copy (Ctrl, `take` false) or the prop taken over (a plain drag). */
  let pendingMapPropDrag: { source: BaseProp; before: string[]; take: boolean } | null = null;
  let pendingUserPropDrag: { source: Object3D; matrix: Matrix4; before: string[] } | null = null;
  let pendingGroupPropDrag: { sources: Object3D[]; poses: Pose[]; scales: Vector3[]; centre: Vec3; before: string[]; started: boolean; ended: boolean } | null = null;
  let groupPropDragStep: { step: OperationStep; before: string[] } | null = null;
  let mapPropDragStep: { step: OperationStep; before: string[] } | null = null;
  /**
   * Surface snapping (the owner, 2026-11-11, as Unreal's: "this only works when using the transform gizmo's centre
   * cube"; a browser adaptation, FG.R2): while the move gizmo's centre handle (`XYZ`) drags one placement, it is seated on
   * whatever surface is under the pointer -- the world, a placement, the floor; never itself or what rides on it -- as
   * the Place tool seats a new one (`placeAt`: grid snap on x/z, then the surface's height; `seatOn`: its foot on it),
   * raised by the offset. An axis handle moves as before. A group, a map prop or a locked one is left to the gizmo.
   */
  let surfaceSnap = true;
  let surfaceOffset = 0;
  /** The pointer over the viewport's surface, as the last move left it (a gizmo drag included). */
  const dragNdc = new Vector2();
  input.addEventListener('pointermove', (e) => {
    const r = input.getBoundingClientRect();
    dragNdc.set(((e.clientX - r.left) / Math.max(1, r.width)) * 2 - 1, -((e.clientY - r.top) / Math.max(1, r.height)) * 2 + 1);
  }, true);
  /**
   * One snap for every gizmo drag (the owner, 2026-11-12: "Unify them all. If a user wants to move it off the ground they
   * can use the other axes"): while the move gizmo's centre handle (`XYZ`) drags, what it drags is seated on the surface
   * under the pointer -- one placement on its box's foot (`seatOn`), a switch mounted on the wall it is over and a ladder
   * stood against it (`dragWallPose`, as the Place tool does), several by their lowest member, a moved map data object or
   * a rules entity by its place (a hostage's start its lift over it). An axis handle moves freely.
   */
  const surfaceSnapDrag = (): void => {
    if (!surfaceSnap || !gizmo.dragging || gizmo.mode !== 'translate' || gizmo.axis !== 'XYZ') return;
    const o = gizmo.object;
    if (!o) return;
    // A stand-in (a map data object's, `./mapDataMove`; a rules entity's): its place on the surface.
    if (o === mapDataProxy || o === entityProxy) {
      const items = o === mapDataProxy ? mapDataMoving() : [];
      if (o === mapDataProxy && !items.length) return;
      const hit = pickSurface(dragNdc, []);
      if (!hit) return;
      const at = placeAt(hit);
      // Several map objects by their lowest foot (a hostage's start its lift over its foot), as a group by its lowest member.
      const centreY = items.length ? items.reduce((n, i) => n + i.at[1], 0) / items.length : 0;
      const foot = items.length ? Math.min(...items.map((i) => i.at[1] - (i.kind === 'escortees' ? HOSTAGE_START_LIFT_READING : 0))) : 0;
      at.y += surfaceOffset + (centreY - foot);
      o.position.copy(at);
      o.updateMatrixWorld(true);
      return;
    }
    // Several: the pivot carried so the lowest member's foot (at the drag's start, `groupDragLow`) is on the surface.
    if (o === pivot) {
      if (!dragFrom || groupDragLow === null || pendingGroupPropDrag) return;
      const hit = pickSurface(dragNdc, [...picks.items, ...(dragFollow ?? []).map((f) => f.r)]);
      if (!hit) return;
      const at = placeAt(hit);
      pivot.position.set(at.x, dragFrom.centre[1] + (at.y + surfaceOffset - groupDragLow), at.z);
      pivot.updateMatrixWorld(true);
      return;
    }
    const r = selected;
    if (!r || o !== r || lockedOf(r) || isGroup()) return;
    const hit = pickSurface(dragNdc, [r, ...(dragFollow ?? []).map((f) => f.r)]);
    if (!hit) return;
    if (dragWallPose(r, hit)) return;
    seatOn(r, placeAt(hit));
    if (surfaceOffset) { r.position.y += surfaceOffset; r.updateMatrixWorld(true); }
  };
  /** The lowest foot of the dragged members at the drag's start (`objectBox`), for the group's snap; null between drags. */
  let groupDragLow: number | null = null;
  /**
   * A dragged switch on the wall under the pointer (mounted, its back on it) or a ladder piece against it (stood, its
   * climbing side out), as the Place tool puts them (`wallPose`); false over a floor, or for anything else.
   */
  const dragWallPose = (r: Object3D, hit: Intersection): boolean => {
    const asset = r.userData['forgePiece'] as string | undefined;
    const ladder = asset ? ladderFronts.get(asset) ?? null : null;
    const how = r.userData['forgeSwitch'] ? 'mount' : ladder ? 'stand' : null;
    if (!how) return false;
    const w = wallOf(hit);
    if (!w) return false;
    const probe = (x: number, z: number): number[] => (placementGrid ? surfaceYs(placementGrid, x, z) : []);
    mountOnWall(r, w.point, w.normal, ladder ?? [0, 1], how, (x, z, y) => restingPoint({ x, y, z }, probe, null).y);
    r.updateMatrixWorld(true);
    return true;
  };
  gizmo.addEventListener('objectChange', () => {
    surfaceSnapDrag();
    if (gizmo.object === mapPropProxy && pendingMapPropDrag) {
      const pending = pendingMapPropDrag;
      pendingMapPropDrag = null;
      duplicateMapPropForDrag(pending.source, pending.before, pending.take);
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
    if (dragFollow?.length) carryFollowers(dragFollow);           // the children with their parent
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
      // The tree: what is under the dragged placements follows them (never a copy's drag).
      dragFollow = duplicateModifierOnPointerDown ? null
        : followersOf(gizmo.object === pivot ? picks.items : selected && gizmo.object === selected ? [selected] : []);
      if (gizmo.object === pivot) {
        const centre: Vec3 = [pivot.position.x, pivot.position.y, pivot.position.z];
        const poses = picks.items.map(poseOf);
        dragFrom = { centre, poses };
        const feet = picks.items.map((r) => objectBox(r).min.y).filter((y) => Number.isFinite(y));
        groupDragLow = feet.length ? Math.min(...feet) : null;
        if (duplicateModifierOnPointerDown && isGroup()) {
          const sources = picks.items.filter((r) => !lockedOf(r));
          pendingGroupPropDrag = {
            sources, poses: sources.map(poseOf), scales: sources.map((r) => r.scale.clone()), centre, before: selectionIds(), started: false, ended: false,
          };
          passOver('copied');
        } else passOver('moved');
      }
      // A map prop dragged: Ctrl copies it (the original stays); a plain drag takes it over (the owner, 2026-11-06: a custom
      // version of an official map) -- it becomes the layout's own piece at its place, the original hidden, one edit.
      else if (gizmo.object === mapPropProxy && baseSelected) pendingMapPropDrag = { source: baseSelected, before: selectionIds(), take: !duplicateModifierOnPointerDown };
      else if (selected && gizmo.object === selected && (selected.userData['forgePiece'] || cloneable(selected)) && duplicateModifierOnPointerDown) {
        pendingUserPropDrag = { source: selected, matrix: selected.matrix.clone(), before: selectionIds() };
      }
      return;
    }
    groupDragLow = null;
    if (gizmo.object === mapDataProxy) {
      dragFollow = null;
      duplicateModifierOnPointerDown = false;
      const items = mapDataMoving();
      const c = mapDataCentre(items);
      const p = mapDataProxy.position;
      // Each by the stand-in's move from the items' middle (one map object: to the stand-in's place).
      const d = [p.x - c[0], p.y - c[1], p.z - c[2]];
      commitMapDataMoves(items.map((item) => ({ item, at: [item.at[0] + d[0]!, item.at[1] + d[1]!, item.at[2] + d[2]!] as [number, number, number] })));
      return;
    }
    if (gizmo.object === entityProxy) {
      dragFollow = null;
      duplicateModifierOnPointerDown = false;
      const entity = inspectedEntity();
      const p = entityProxy.position;
      const delta: [number, number, number] | null = entity ? [p.x - entity.at[0], p.y - entity.at[1], p.z - entity.at[2]] : null;
      if (entity && delta && delta.some((v) => Math.abs(v) > 1e-3) && !refuseEdit()) void entityEdit('piece.move', { refs: [entity.ref], delta });
      else showSelection();
      return;
    }
    const mapPropGesture = gizmo.object === mapPropProxy;
    dragFollow = null;
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
  const hullMaterial = hullLineMaterial();
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
  /** The map a split view's camera stands in (`./splitViews` `mapOpened`): the disc's archive, an authored map, the floor. */
  const splitMapKey = (b: LayoutBase): string => (b.kind === 'map' ? b.archive : b.kind === 'content' ? `content:${b.mapId}` : 'blank');
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
  /**
   * The placements' tree (`Layout.tree`; the owner, 2026-11-10: "implement the tree layout"): each placement's parent, as
   * the engine's own nodes nest (a node's matrix local to its parent's: `@s2u/scene` `flattenScene`). Every placement
   * keeps its own world place (the scene's roots stay flat): the tree is what moves with what in the editor, and what the
   * Inspector's transform is local to.
   */
  const parentOf = new Map<Object3D, Object3D>();
  /**
   * The Outliner's folders (`Layout.folders`; the owner, 2026-11-11: "nulls/folders to group objects nicely ... purely for
   * organizing objects in the outliner"): each an object of the editor's alone, never in the scene, the layout's lists or a
   * match -- no transform (its contents keep their world places), a name. A placement or a folder may sit under one.
   */
  const folders: Object3D[] = [];
  const isFolder = (o: Object3D): boolean => !!o.userData['forgeFolder'];
  const folderName = (o: Object3D): string => (o.userData['forgeFolder'] as { name: string }).name;
  const newFolder = (name: string): Object3D => { const f = new Object3D(); f.name = `folder ${name}`; f.userData['forgeFolder'] = { name }; return f; };
  /**
   * The folders selected from their rows (the owner, 2026-11-12: "be able to select/delete folders in the outliner"): a
   * folder's click picks it with what it holds; Delete then takes it out with everything under it. Kept only while the
   * selection is still the picked folders' own (`showSelection` lets them go otherwise).
   */
  const folderPicks = new Set<Object3D>();
  /** The Outliner's order (`Layout.order`): siblings drawn in it; `outlineOrdered` once one is set (a reorder, or the file's). */
  let outlineOrder: Object3D[] = [];
  let outlineOrdered = false;
  /** Placements and folders, as siblings are drawn: in `outlineOrder`, the rest after it in the layout's own order. */
  const outlineSorted = (items: readonly Object3D[]): Object3D[] => {
    const at = new Map(outlineOrder.map((o, i) => [o, i] as const));
    const own = new Map([...roots, ...folders].map((o, i) => [o, i] as const));
    const rank = (o: Object3D): number => at.get(o) ?? 1e9 + (own.get(o) ?? 0);
    return [...items].sort((a, b) => rank(a) - rank(b));
  };
  /** What sits under `p` (null: the top), in the Outliner's order. */
  const outlineChildren = (p: Object3D | null): Object3D[] => outlineSorted([...roots, ...folders].filter((c) => (parentOf.get(c) ?? null) === p));
  const childrenOf = (r: Object3D): Object3D[] => [...roots, ...folders].filter((c) => parentOf.get(c) === r);
  const descendantsOf = (r: Object3D): Object3D[] => {
    const out: Object3D[] = [];
    const walk = (at: Object3D): void => { for (const c of childrenOf(at)) { out.push(c); walk(c); } };
    walk(r);
    return out;
  };
  /** Each placement under one of `movers` (and not one itself), with its place relative to its nearest moving ancestor. */
  const followersOf = (movers: readonly Object3D[]): { r: Object3D; a: Object3D; rel: Matrix4 }[] => {
    const moving = new Set(movers);
    const out: { r: Object3D; a: Object3D; rel: Matrix4 }[] = [];
    if (parentOf.size === 0 || moving.size === 0) return out;
    for (const r of roots) {
      if (moving.has(r)) continue;
      let a = parentOf.get(r);
      while (a && !moving.has(a)) a = parentOf.get(a);
      if (!a) continue;
      a.updateMatrix();
      r.updateMatrix();
      out.push({ r, a, rel: a.matrix.clone().invert().multiply(r.matrix) });
    }
    return out;
  };
  /** The followers put back at their places relative to their moved ancestors (`followersOf`). */
  const carryFollowers = (follow: readonly { r: Object3D; a: Object3D; rel: Matrix4 }[]): void => {
    for (const { r, a, rel } of follow) {
      a.updateMatrix();
      a.matrix.clone().multiply(rel).decompose(r.position, r.quaternion, r.scale);
      r.updateMatrix();
    }
  };
  /** `move` run on `movers`, every placement under them carried along. */
  const carrying = (movers: readonly Object3D[], move: () => void): void => {
    const follow = followersOf(movers);
    move();
    carryFollowers(follow);
  };
  /** A placement's matrix local to its parent's (its world matrix at the top). */
  const localMatrixOf = (r: Object3D): Matrix4 => {
    r.updateMatrix();
    const p = parentOf.get(r);
    if (!p) return r.matrix.clone();
    p.updateMatrix();
    return p.matrix.clone().invert().multiply(r.matrix);
  };
  /** A placement put at `local` under its parent (at the top, `local` is its world matrix). */
  const setLocalMatrix = (r: Object3D, local: Matrix4): void => {
    const p = parentOf.get(r);
    if (p) p.updateMatrix();
    (p ? p.matrix.clone().multiply(local) : local).decompose(r.position, r.quaternion, r.scale);
    r.updateMatrix();
  };
  /** A placement's local position and yaw (degrees), as the Inspector shows them. */
  const localPose = (r: Object3D): { position: Vector3; yaw: number } => {
    const pos = new Vector3(), q = new Quaternion(), sc = new Vector3();
    localMatrixOf(r).decompose(pos, q, sc);
    return { position: pos, yaw: new Euler().setFromQuaternion(q, 'YXZ').y };
  };
  /** One local axis (or the local yaw, degrees) of a placement set, its pitch and roll kept. */
  const setLocalAxis = (r: Object3D, axis: 'x' | 'y' | 'z' | 'yaw', v: number): void => {
    const pos = new Vector3(), q = new Quaternion(), sc = new Vector3();
    localMatrixOf(r).decompose(pos, q, sc);
    if (axis === 'yaw') { const e = new Euler().setFromQuaternion(q, 'YXZ'); e.y = (v * Math.PI) / 180; q.setFromEuler(e); } else pos[axis] = v;
    setLocalMatrix(r, new Matrix4().compose(pos, q, sc));
  };
  /**
   * The placements hidden in the editor (the owner, 2026-11-11: "object hiding in the tree"; the Outliner's eye): each and
   * everything under it undrawn, unpicked and unmarked here -- as the engine's own inactive node hides its subtree (its
   * `m_active`, `OBJECT_ACTIVE_STATE`). The editor's view alone: never written to the layout, never in a match.
   */
  const editorHidden = new Set<Object3D>();
  /** Whether a placement is hidden here: it, or one above it in the tree. */
  const editorHiddenNow = (r: Object3D): boolean => { for (let a: Object3D | undefined = r; a; a = parentOf.get(a)) if (editorHidden.has(a)) return true; return false; };
  /** Each placement drawn or not by the editor's hiding (`editorHidden`), its billboard with it. */
  let editorHiddenKey = '';
  const applyEditorHidden = (): void => {
    for (const r of roots) r.visible = !editorHiddenNow(r);
    const key = roots.map((r) => (r.visible ? '1' : '0')).join('');
    // The user billboards rebuilt without them: flagged, not by emptying `userMarksOf` -- with every placement deleted
    // that matched the empty `roots`, so the last ones' marks stayed drawn.
    if (key !== editorHiddenKey) { editorHiddenKey = key; userMarksStale = true; }
  };
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
  /**
   * The Place tool's re-place: `r` the lead (under the cursor), `others` the rest of the selection by their places relative
   * to it, `follow` what sits under any of them (`followersOf`) -- the owner, 2026-11-11: "place tool should account for
   * hierarchy ... make place tool work with multi selected objects"; `starts` each one's place to put back.
   */
  let replacing: { r: Object3D; position: Vector3; quaternion: Quaternion; before: string[]; others: { r: Object3D; rel: Matrix4 }[];
    follow: { r: Object3D; a: Object3D; rel: Matrix4 }[]; starts: Map<Object3D, { position: Vector3; quaternion: Quaternion }>; moving: Set<Object3D> } | null = null;
  /** The re-placed ones after the lead: the rest of the selection at their places relative to it, what is under them along. */
  const carryReplace = (): void => {
    const was = replacing;
    if (!was) return;
    was.r.updateMatrix();
    for (const { r: o, rel } of was.others) { was.r.matrix.clone().multiply(rel).decompose(o.position, o.quaternion, o.scale); o.updateMatrix(); }
    carryFollowers(was.follow);
  };
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
  /** The other tabs' starred tiles (`readObjectFavourites`): each tab's Favourites, starred first under All. */
  let objectFavs = readObjectFavourites();
  /** FUI-3 (PAD-11): the props chosen last, newest first (the menu's Props screen, its Recent tab; this session's only). */
  let recentProps: string[] = [];
  const noteRecentProp = (asset: string): void => { recentProps = [asset, ...recentProps.filter((a) => a !== asset)].slice(0, PROPS_RECENT_MAX); };
  let filter: AssetFilter = 'all';
  /** The asset browser's tab (`OBJECT_TABS`): the props, or one object kind's copies on the chosen map. */
  let objectTab: ObjectTab = 'props';
  /**
   * The object the Place tool places of each kind, as its tile chose it (`chooseObject`): a door's, turret's, gate's,
   * damage trigger's or flare's disc source and name, a ladder prop's asset, a switch's look. Absent, the kind's own
   * default (`defaultDoor` and the others: the palette's first, else the disc's named one).
   */
  const objectChoice: { door?: ObjectRef; turret?: ObjectRef; gate?: ObjectRef; barrier?: ObjectRef; flare?: ObjectRef; ambient?: ObjectRef; ladder?: string; switch?: SwitchLookId } = {};
  /** FG-21: the assets dock lists the base map's characters (its player models) instead of its props. */
  let showChars = false;
  let programFilter: ProgramFilter = 'all';

  /** FG-21: the character the NPC tool places: a side and its type on the map (`LoadedMap.types`). */
  let npcChoice: { side: 'seal' | 'terrorist'; type: number } | null = null;
  /** FG-21: the map whose characters the NPCs are (the base's; the blank floor's library's). */
  let charMap: LoadedMap | null = null;
  /** The grid snap (moves and placements on the grid step), and the turn snap apart (the owner, 2026-11-11). */
  let snap = false;
  let turnSnap = false;
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
   * One Place tool (the owner, 2026-11-10: "instead of each placeable being its own tool ... objects that the place tool
   * places ... Only two tools for now. Select and Place"; a browser adaptation, FG.R2): `mode` names what Place places --
   * `place` a prop of the assets, else one of the objects (a door, a ladder, a spawn...) -- and `lastPlacee` the last one,
   * which the Place button and its key take up again. Every object takes the Place settings: the snap, the grid and turn
   * steps, the wheel's turn (`queuedTurn`, now every object's, back to none when another object is chosen).
   */
  let lastPlacee: Mode = 'place';
  /** The objects the wheel turns: all but a zone (square on the AI grid), a point and a view (the camera's own). */
  const wheelTurns = (m: string): boolean => m !== 'select' && m !== 'zone' && m !== 'point' && m !== 'view';
  /** FUI-22 (D4): the wheel's travel toward its next notch (a trackpad's small deltas add up to one). */
  let wheelTravel = 0;
  /** FUI-22 (D1): the asset list's tooltip preview, on unless the asset browser's view setting turns it off. */
  let assetTips = true;
  /** The asset browser's Sound on hover (`hoverAmbientSound`): on unless the view kept it off. */
  let assetHoverSound = true;
  /** The asset browser's Loop sounds (`playAmbientSounds`' `loop`): on unless the view kept it off. */
  let assetLoopSounds = true;
  /**
   * The Select tool's settings (its gear), kept with the view: a click or a selection box picks the base map's own props
   * (`selectMapProps`), the user's placements (`selectUserProps`) -- either, both or neither.
   */
  let selectMapProps = true;
  /** The Play settings (the Play button's gear): where round 1 stands the player, and its side. Browser adaptations. */
  let playSpawn: 'camera' | 'random' = 'camera';
  let playSide: 'auto' | 'seal' | 'terrorist' = 'auto';
  /** Whether Play starts through the original's loading screen (`./match` `forgeLoadingScreen`; a browser adaptation). */
  let playLoading: 'direct' | 'loading' = 'direct';
  let selectUserProps = true;
  /**
   * Select hidden overlays (the owner, 2026-11-13: "allow objects to be selectable ... even when their billboards are
   * hidden"; on by default; a browser adaptation, FG.R2): a kind whose billboards are switched off (or every billboard
   * off) is still picked -- its object by a click on it, a mark-only one where its mark would be. Off, as before: a kind
   * switched off is passed over.
   */
  let selectHidden = true;
  /** Select hidden overlays set from either of its switches (the Select settings', the Overlays dropdown's), both kept in step. */
  function setSelectHidden(on: boolean): void {
    selectHidden = on;
    selectHiddenIn.checked = on;
    overlaySelectHiddenIn.checked = on;
    writeView();
    say(on ? 'Select: hidden overlays can be selected' : 'Select: hidden overlays are passed over');
  }
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
  /** The View dropdown's Only user data: the map's own marks (and their guides) hidden, the user's kept. */
  let onlyUserData = false;
  /** The active view's marks (`./splitViews` `ViewLook`): the switches above, read whole and put back whole. */
  const lookNow = (): ViewLook => ({
    on: billboardsOn, off: [...billboardsOff].sort(), onlyUser: onlyUserData, glows: flareGlows, arrows: lightDirections,
    draw: Object.fromEntries(VIEW_DRAW_OWN.map((id) => [id, view[id]])),
  });
  const putLook = (l: ViewLook): void => {
    billboardsOn = l.on;
    billboardsOff.clear();
    for (const id of l.off) billboardsOff.add(id);
    onlyUserData = l.onlyUser;
    flareGlows = l.glows;
    lightDirections = l.arrows;
    for (const id of VIEW_DRAW_OWN) { const on = l.draw?.[id]; if (typeof on === 'boolean') view[id] = on; }
  };
  /**
   * A view's look with the overlays everyone shares (the owner, 2026-11-13: toggling a kind in one view shows it so in
   * every view): the billboards' switches, Only user data, the flare glows and the light arrows the menus' now; the
   * view's own Draw switches (`VIEW_DRAW_OWN`) kept.
   */
  const sharedLook = (l: ViewLook): ViewLook => ({ ...lookNow(), ...(l.draw ? { draw: l.draw } : {}) });
  const lookKey = (l: ViewLook): string => JSON.stringify([l.on, [...l.off].sort(), l.onlyUser, l.glows, l.arrows]);
  /** A view's own Draw switches (`VIEW_DRAW_OWN`), one key; a switch it does not name is the menus'. */
  const drawKey = (l: ViewLook): string => JSON.stringify(VIEW_DRAW_OWN.map((id) => l.draw?.[id] ?? view[id]));
  /** The marks and the Draw switches the scene holds now (`lookKey`, `drawKey`): a split view's draw sets its own only when they differ. */
  let marksShown = '';
  let drawShown = '';
  /**
   * The AI map overlay (`./aiMapOverlay`): built the first time it is shown for a map's `AIMAPS.MPS`, kept while that map
   * is the base, shown as the AI map switch says. A disc map's alone: a new empty map's grid is the Forge's own flat floor
   * (`./floorAi`), every cell the same. Its layers each have their own switch in the AI Navigation menu (`aiNav`).
   */
  let aiMapOverlay: ReturnType<typeof buildAiMapOverlay> | null = null;
  let aiMapOf: AiMaps | null = null;
  /**
   * The AI Navigation menu's layer switches (the owner, 2026-11-12: "all the navigation specific toggles"): the soil
   * tiles, the cells placed pieces block, the links, the hostage routes and the legend -- under the AI map switch, which
   * shows or hides them all. Kept in this browser (a convenience: absent or unreadable, all on).
   */
  const AI_NAV_KEY = 'forge.aiNav';
  const aiNav = { cells: true, blocked: true, links: true, routes: true, legend: true };
  try {
    const kept = JSON.parse(globalThis.localStorage?.getItem(AI_NAV_KEY) ?? 'null') as Partial<typeof aiNav> | null;
    if (kept) for (const k of Object.keys(aiNav) as (keyof typeof aiNav)[]) { const v = kept[k]; if (typeof v === 'boolean') aiNav[k] = v; }
  } catch { /* all on */ }
  const keepAiNav = (): void => { try { globalThis.localStorage?.setItem(AI_NAV_KEY, JSON.stringify(aiNav)); } catch { /* this session only */ } };
  /** Its legend in the viewport's lower left (`drawAiMapLegend`): made at the first show, drawn again with each build. */
  let aiMapLegend: HTMLDivElement | null = null;
  const aiLegendKinds = el(doc, 'div', 'fx-ai-legend__kinds');
  const aiLegendHover = el(doc, 'div', 'fx-ai-legend__hover', 'Hover the map: its cell');
  const aiLegendRoutes = el(doc, 'div', 'fx-ai-legend__routes');
  /** The links between sub-maps (`buildAiLinks`), built with the tiles. */
  let aiLinks: ReturnType<typeof buildAiLinks> | null = null;
  /**
   * The grid as the layout leaves it (`./aiPieceBlock` `aiMapsWithPieces`): the placed pieces' cells nogo, as Play hands
   * it to the room (`./playObjectives`); its blocked cells drawn (`buildAiPieceMarks`), the routes planned on it.
   */
  let aiStamped: AiMaps | null = null;
  let aiPieceMarks: ReturnType<typeof buildAiPieceMarks> | null = null;
  let aiPieceCount = 0;
  /**
   * The route preview (`buildAiRoutes`; the owner, 2026-11-12): every hostage start -- the map's own (`LoadedMap.escortees`)
   * and the placed ones -- to the cheapest extraction zone, the map's own (kind 1) and the placed ones. Drawn again with
   * each edit while the overlay shows (`changed`), on the grid the placed pieces leave.
   */
  let aiRoutes: ReturnType<typeof buildAiRoutes> | null = null;
  let aiRoutesRun = 0;
  const drawAiLegendKinds = (): void => {
    if (!aiMapOverlay) return;
    drawAiMapLegend(aiLegendKinds, aiMapOverlay.counts, [
      { colour: AI_PIECE_BLOCK_COLOUR, label: 'Blocked by placed props', note: 'nogo in this layout: hostages and bots path round it', count: aiPieceCount, line: false },
      { colour: AI_LINK_COLOUR, label: 'Link (Submap)', note: 'where a route passes from one sub-map to another', count: aiLinks?.count ?? 0, line: true },
    ]);
  };
  /** Each layer shown as the AI map switch and its own (`aiNav`) say; the legend's routes with the routes. */
  const showAiLayers = (legend = false): void => {
    const on = view.aimap;
    if (aiMapOverlay) aiMapOverlay.group.visible = on && aiNav.cells;
    if (aiPieceMarks) aiPieceMarks.group.visible = on && aiNav.blocked;
    if (aiLinks) aiLinks.group.visible = on && aiNav.links;
    if (aiRoutes) aiRoutes.group.visible = on && aiNav.routes;
    aiLegendRoutes.hidden = !aiNav.routes || !aiRoutes?.routes.length;
    if (legend && aiMapLegend) aiMapLegend.hidden = !(on && aiNav.legend && aiMapOverlay);
  };
  const refreshAiRoutes = async (): Promise<void> => {
    const run = ++aiRoutesRun;
    const ai = aiMapOf;
    if (!ai || !aiMapOverlay) return;
    const composed = await composeGround().catch(() => null);
    if (run !== aiRoutesRun || ai !== aiMapOf || !aiMapOverlay) return;
    const stamped = composed ? aiMapsWithPieces(ai, composed.ground) : { ai, blocked: [] };
    aiStamped = stamped.ai;
    aiPieceMarks?.dispose();
    aiPieceMarks = buildAiPieceMarks(stamped.blocked);
    aiPieceCount = stamped.blocked.length;
    scene.add(aiPieceMarks.group);
    aiRoutes?.dispose();
    const feet = (r: Object3D): [number, number, number] => [r.position.x, r.position.y, r.position.z];
    const starts: AiRouteStart[] = [
      // The map's own as this layout has them (`mapDataShown`): a taken-out one gone, a moved one at its new place.
      ...((baseMap ? mapDataShown(baseMap).escortees : undefined) ?? []).map((e) => ({ name: e.name, at: e.at })),
      ...roots.filter((r) => r.userData['forgeHostage']).map((r) => ({ name: placedLabel(r), at: feet(r) })),
    ];
    const goals: AiRouteGoal[] = [
      ...aiMapZoneGoals((baseMap ? mapDataShown(baseMap).ai : undefined) ?? stamped.ai),
      ...roots.filter((r) => r.userData['forgeZone']).flatMap((r) => { const g = aiGoalAt(stamped.ai, placedLabel(r), feet(r)); return g ? [g] : []; }),
    ];
    aiRoutes = buildAiRoutes(stamped.ai, starts, goals);
    scene.add(aiRoutes.group);
    drawAiRouteLegend(aiLegendRoutes, aiRoutes.routes);
    drawAiLegendKinds();
    showAiLayers();
  };
  /**
   * `legend`: the Display menu's own switch is being applied (`applyView`, a map change) -- the legend follows it, not a
   * split view's own draw (`applyViewDraw` runs with each view's switches in turn).
   */
  const syncAiMap = (legend = false): void => {
    const ai = base?.kind === 'map' ? baseMap?.ai ?? null : null;
    if (aiMapOf !== ai) {
      for (const layer of [aiMapOverlay, aiLinks, aiPieceMarks, aiRoutes]) layer?.dispose();
      aiMapOverlay = null; aiLinks = null; aiPieceMarks = null; aiRoutes = null; aiStamped = null; aiPieceCount = 0;
      aiMapOf = ai;
    }
    if (view.aimap && ai && !aiMapOverlay) {
      aiMapOverlay = buildAiMapOverlay(ai);
      scene.add(aiMapOverlay.group);
      aiLinks = buildAiLinks(ai);
      scene.add(aiLinks.group);
      if (!aiMapLegend) {
        aiMapLegend = el(doc, 'div', 'fx-ai-legend');
        aiMapLegend.append(aiLegendKinds, aiLegendHover, aiLegendRoutes);
      }
      if (!aiMapLegend.isConnected) viewport.append(aiMapLegend);
      drawAiLegendKinds();
      void refreshAiRoutes();
    }
    showAiLayers(legend);
  };
  /** An AI Navigation menu switch: the layer turned, the AI map switch on with it (a layer is no use with the map off). */
  const setAiNav = (key: keyof typeof aiNav, on: boolean): void => {
    aiNav[key] = on;
    keepAiNav();
    if (on && !view.aimap) { view.aimap = true; applyView(); return; }
    showAiLayers(true);
  };
  /** The hover line: the cell under the pointer on the map's surface, once a frame at most. */
  let aiHoverFrame = 0;
  input.addEventListener('pointermove', (e) => {
    if (!view.aimap || !aiMapOverlay || !aiMapOf || aiHoverFrame) return;
    const x = e.clientX, y = e.clientY;
    aiHoverFrame = requestAnimationFrame(() => {
      aiHoverFrame = 0;
      const ai = aiMapOf;
      if (!ai) return;
      const r = input.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0)) return;
      const hit = pick(new Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), 'map');
      aiLegendHover.textContent = hit ? describeAiCellAt(aiStamped ?? ai, [hit.point.x, hit.point.y + 1, hit.point.z]) ?? 'Off the grid' : 'Off the map';
    });
  });
  /** The Draw switches a view keeps its own (`VIEW_DRAW_OWN`), on the worlds and the overlays, as `view` has them now. */
  const applyViewDraw = (): void => {
    syncAiMap();
    for (const v of [baseView, ...pieces.views()]) {
      if (!v) continue;
      v.setGeometry(view.geometry);
      v.setWireframe(view.wireframe);
      v.setShadows(view.shadows);
      v.setDetail(view.detail);
      v.setAlternate(view.alternate);
    }
    overlays.setGrid(view.grid && !!baseMap);
    if (hullLines) hullLines.visible = view.collision;
    else if (view.collision && !hullTimer) scheduleHull();
  };
  /**
   * View `look`'s marks and own Draw switches set on the scene for its draw (`null`: the menus' own, the active view's),
   * the menus untouched.
   */
  const applyViewMarks = (look: ViewLook | null): void => {
    // The overlays are one setting for every view (the owner, 2026-11-13: "a shared unified state for overlay settings"):
    // a view brings its own Draw switches only (`sharedLook`).
    const want = look ? sharedLook(look) : lookNow();
    const marks = lookKey(want), draws = drawKey(want);
    if (marks === marksShown && draws === drawShown) return;
    const kept = look ? lookNow() : null;
    if (look) putLook(want);
    if (draws !== drawShown) applyViewDraw();
    applyGuides();                                             // the Gizmos switch (`spawns`) is a Draw one, and the marks'
    if (marks !== marksShown) applyMarks();
    if (kept) putLook(kept);
    marksShown = marks;
    drawShown = draws;
  };
  /** Whether any view draws the collision hull (an edit builds it again for them). */
  const hullWanted = (): boolean => view.collision || !!split?.record().views.some((v) => v.look?.draw?.['collision']);
  /** The split as the view key kept it, until the split is made and reads it (`writeView` keeps it meanwhile). */
  let keptSplit: unknown = null;
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
      // The turn snap kept apart; a view kept before it had one: the one snap's.
      turnSnap = typeof raw['turnSnap'] === 'boolean' ? raw['turnSnap'] : snap;
      if (raw['surfaceSnap'] === false) surfaceSnap = false;     // on unless kept off
      if (typeof raw['surfaceOffset'] === 'number' && Number.isFinite(raw['surfaceOffset'])) surfaceOffset = raw['surfaceOffset'];
      if (raw['assetTips'] === false) assetTips = false;
      if (raw['assetHoverSound'] === false) assetHoverSound = false;
      if (raw['assetLoopSounds'] === false) assetLoopSounds = false;
      if (raw['selectMapProps'] === false) selectMapProps = false;
      if (raw['selectUserProps'] === false) selectUserProps = false;
      if (raw['selectHidden'] === false) selectHidden = false;
      if (raw['playSpawn'] === 'random') playSpawn = 'random';
      if (raw['playSide'] === 'seal' || raw['playSide'] === 'terrorist') playSide = raw['playSide'];
      if (raw['playLoading'] === 'loading') playLoading = 'loading';
      if (raw['space'] === 'local') gizmoSpace = 'local';
      keptSplit = raw['split'] ?? null;
      const bb = raw['billboards'];
      if (bb && typeof bb === 'object') {
        const b = bb as { on?: unknown; top?: unknown; off?: unknown };
        if (typeof b.on === 'boolean') billboardsOn = b.on;
        if (typeof b.top === 'boolean') billboardsOnTop = b.top;
        const glows = (b as { glows?: unknown }).glows;
        if (typeof glows === 'boolean') flareGlows = glows;
        const arrows = (b as { arrows?: unknown }).arrows;
        if (typeof arrows === 'boolean') lightDirections = arrows;
        const onlyUser = (b as { onlyUser?: unknown }).onlyUser;
        if (typeof onlyUser === 'boolean') onlyUserData = onlyUser;
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
    // The billboards kept: the overlays, one setting for every view (`sharedLook`).
    const splitNow = split?.record() ?? null;
    const main = lookNow();                                    // the overlays: one setting for every view
    // The Draw switches kept at the top are the first view's too (its own, `VIEW_DRAW_OWN`, while another has the menus).
    const mainDraw = splitNow && split!.active() !== 0 ? splitNow.views[0]?.look?.draw ?? {} : {};
    writeKey(VIEW_KEY, JSON.stringify({ ...(splitNow ? { split: splitNow } : keptSplit ? { split: keptSplit } : {}), ...view, ...mainDraw, textured: texturedOn, lit: litOn, gridStep, turnStep, snap, turnSnap, ...(surfaceSnap ? {} : { surfaceSnap: false }), ...(surfaceOffset ? { surfaceOffset } : {}), ...(assetTips ? {} : { assetTips: false }), ...(assetHoverSound ? {} : { assetHoverSound: false }), ...(assetLoopSounds ? {} : { assetLoopSounds: false }), ...(selectMapProps ? {} : { selectMapProps: false }), ...(selectUserProps ? {} : { selectUserProps: false }), ...(selectHidden ? {} : { selectHidden: false }), ...(playSpawn === 'camera' ? {} : { playSpawn }), ...(playSide === 'auto' ? {} : { playSide }), ...(playLoading === 'loading' ? { playLoading } : {}), ...(gizmoSpace === 'local' ? { space: 'local' } : {}), billboards: { on: main.on, top: billboardsOnTop, glows: main.glows, arrows: main.arrows, ...(main.onlyUser ? { onlyUser: true } : {}), off: [...main.off], kinds: MAP_DATA_KIND_TOGGLES.map((t) => t.id) }, ...(viewCamera ? { camera: viewCamera } : {}) }));
  };
  const drawPlacement = (): void => {
    viewportGridIn.value = String(gridStep);
    viewportTurnIn.value = String(turnStep);
    // Each snap's pill: its switch lit while on, its step on its dropdown (dimmed while off).
    gridSnapUi.draw(snap, gridStep);
    turnSnapUi.draw(turnSnap, turnStep);
    // Surface snapping's button lit while on; its offset.
    surfaceIn.checked = surfaceSnap;
    surfaceSummary.classList.toggle('is-on', surfaceSnap);
    surfaceSummary.title = `Surface snapping ${surfaceSnap ? 'on' : 'off'}: its settings`;
    if (doc.activeElement !== surfaceOffsetIn) surfaceOffsetIn.value = String(surfaceOffset);
    assetPreviewToggle.checked = assetTips;
    assetHoverSoundToggle.checked = assetHoverSound;
    assetLoopSoundsToggle.checked = assetLoopSounds;
  };
  /** The world switches on one view (the base's, or a piece template's), as the test room puts them (`applyToggle`). */
  const applyWorld = (v: WorldView): void => {
    v.setDetailDistance(detailDistanceFor(view.ps2 ? 'ps2' : 'modern', detailDistance.get()));   // PF.R60: PS2 keeps the original
    v.setWireframe(view.wireframe);
    v.setGeometry(view.geometry);
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
  // A piece built under a split: the menus' switches now, each other view's set again at its next draw (`applyViewMarks`).
  pieces.onBuild = (v) => { applyWorld(v); drawShown = ''; };
  /**
   * Whether a gizmo of a kind draws (the owner, 2026-11-06): its kind's View switch on -- the switch whose id or whose
   * mark kinds name it (`MAP_DATA_KIND_TOGGLES`: `doors`, `userTurrets`, `slotA`...). A kind no switch names draws.
   */
  /**
   * The gizmos drawn as the billboards are (the owner, 2026-11-06): with Always on top on, over everything (as they were
   * made: no depth test); off, behind what stands in front -- every guide (door swings, rings, arrows, cells) and the
   * placed spawns', hostages' and zones' own lines, the map's spawn slots, the map's zone rectangles. Run with the view,
   * and whenever new gizmos are made (a placement added, the map's guides drawn).
   */
  function applyGizmoDepth(): void {
    const top = billboardsOnTop;
    const set = (o: Object3D): void => {
      const m = (o as Partial<Mesh>).material as Material | Material[] | undefined;
      for (const x of Array.isArray(m) ? m : m ? [m] : []) {
        if (x.visible === false || x.depthTest === !top) continue;                  // a pick box (unseen), or already so
        x.depthTest = !top;
        x.needsUpdate = true;
      }
    };
    const guides = [mapDoorGuides, mapLadderGuides, mapTurretGuides, mapHostageGuides, mapViewGuides, ...mapAccessGuides, mapZoneLines];
    for (const g of guides) g?.traverse(set);
    for (const r of roots) {
      r.traverse((o) => { if (o.userData['forgeGuideKind'] || o.userData['forgeGuide']) o.traverse(set); });
      if (r.userData['forgeSpawn'] || r.userData['forgeRespawn'] || r.userData['forgeHostage'] || r.userData['forgeZone']) {
        for (const child of r.children) if ((child as LineSegments).isLineSegments) set(child);
      }
    }
    overlays.setSpawnsOnTop(top);
  }
  function guideShown(kind: string | undefined): boolean {
    if (!kind) return true;
    const t = MAP_DATA_KIND_TOGGLES.find((x) => x.id === kind || x.kinds.includes(kind));
    // A map's own guide (its kind no user one) hidden under Only user data.
    if (onlyUserData && t && !isUserMarkKind(kind)) return false;
    return !t || !billboardsOff.has(t.id);
  }
  /**
   * The gizmos (the owner, 2026-11-06): the Gizmos switch, and each kind's own View switch -- a kind switched off in the
   * View dropdown (its billboards) draws no gizmo either (`guideShown`). Visibility only: what a split view's draw sets.
   */
  const applyGuides = (): void => {
    overlays.setSpawns(view.spawns && !!baseMap && guideShown('slotA'));
    setSlotCellsShown(view.spawns);                           // the placed spawns' and hostages' cells too, as the disc's
    // The guides with them: the map's own and each placed object's, each by its kind.
    for (const g of [mapDoorGuides, mapLadderGuides, mapTurretGuides, mapHostageGuides, mapViewGuides, ...mapAccessGuides]) {
      if (g) g.visible = view.spawns && guideShown(g.userData['forgeGuideKind'] as string | undefined);
    }
    for (const r of roots) {
      r.traverse((o) => { if (o.userData['forgeGuideKind']) o.visible = view.spawns && guideShown(o.userData['forgeGuideKind'] as string); });
      // A placed spawn's, respawn's or hostage's cell and an extraction zone's outline (their own lines, not tagged guides).
      if (r.userData['forgeSpawn'] || r.userData['forgeRespawn'] || r.userData['forgeHostage'] || r.userData['forgeZone']) {
        const on = (r.userData['forgeZone'] || view.spawns) && guideShown(userKindOfRoot(r) ?? undefined);
        for (const child of r.children) if ((child as LineSegments).isLineSegments && !child.userData['forgeGuideKind']) child.visible = !!on;
      }
    }
  };
  const applyView = (): void => {
    for (const v of [baseView, ...pieces.views()]) if (v) applyWorld(v);
    overlays.setGrid(view.grid && !!baseMap);
    applyGuides();
    applyGizmoDepth();                                        // drawn over everything or behind, as the billboards
    applyBillboards();
    // A new empty map fogs too (the owner, 2026-11-06): its fog the built-from map's, its own colour and distance over it.
    // A map's fog on as the view has it, unless the layout turns it off (its own environment); an empty map's as its own.
    fog.enabled = view.fog && (base?.kind === 'map' ? settings.fog?.on ?? true : base?.kind === 'blank' && (settings.fog?.on ?? discFog.enabled));
    // A new empty map's own fog colour is kept over Day / night's tint (`lightingFog` `keepColour`).
    liftForgeFog(scene, fog, lighting, null, created.setClearColor, settings.timeOfDay, envEditable() && !!settings.fogColor);
    if (base?.kind === 'blank' && settings.timeOfDay === null) created.setClearColor([12, 20, 24]);
    created.setPresentation(view.ps2 ? 'ps2' : 'native');
    fit();
    if (hullLines) hullLines.visible = view.collision;
    if (view.collision) scheduleHull();
    syncAiMap(true);
    for (const [id, i] of viewportToggleInputs) i.checked = view[id];
    texturedInput.checked = texturedOn;
    litInput.checked = litOn;
    syncGeometryDependents();
    drawShown = drawKey(lookNow());                            // the scene holds the menus' Draw switches now
    viewportDetailDom.sync();
    viewportRenderScaleDom.sync();                             // FP-2: disabled under the PS2 picture
    writeView();
    refreshHint();
  };
  texturedInput.checked = texturedOn;
  litInput.checked = litOn;
  for (const [id, i] of viewportToggleInputs) i.checked = view[id];
  syncGeometryDependents();
  drawBillboardSwitches();                                    // the Billboards dropdown as the view was kept
  /**
   * The split viewport (the owner, 2026-11-11; `./splitViews`, a browser adaptation): its button beside the gizmo's World
   * / Local, its Maximize among the active view's menus. The view under the pointer has the camera; it does not move to
   * another view mid-gesture, with a menu open, or while a layout loads.
   */
  split = createSplitViews({
    doc, viewport, fly, input, viewControls: viewportLeftControls, axisWidget, globalControls: cameraHud, crosshair,
    baseAspect: (w, h) => (created.presentation() === 'ps2' ? 640 / 448 : w / h),
    lookNow,
    // Its marks and its own Draw switches on the menus and the scene (`applyView` draws the Draw menu again, and keeps them).
    setLook: (look) => { putLook(sharedLook(look)); applyView(); drawBillboardSwitches(); },   // its Draw switches; the overlays shared
    focus: () => viewportFocus(),
    canSwitch: () => !busy && !gizmo.dragging && !fly.navigating() && !fly.isLocked()
      && !viewportLeftControls.querySelector('details[open]') && !cameraHud.querySelector('details[open]'),
    onChange: () => writeView(),
    onLayout: () => fitHudLater(),
    icon: (l) => icon(`split-${l}`),
    maximizeIcon: icon('maximize'),
  });
  // The split button right of the camera's view dropdown (Perspective, Top...), among the view's own menus (the owner,
  // 2026-11-11).
  viewMenu.after(split.menu);
  split.menu.classList.add('fx-split-menu--left');
  /*
   * The top-right controls too wide for the active view (the owner, 2026-11-11: "have a more button", as Unreal's viewport
   * toolbar): from the right, what does not fit beside the view's own menus goes under a » button at the row's end, a
   * dropdown holding them as they are (their own menus still open from there). Laid again with the viewport, the split's
   * active view, and the left menus' width.
   */
  const hudMore = doc.createElement('details');
  hudMore.className = 'fx-hud-more';
  const hudMoreSummary = doc.createElement('summary');
  hudMoreSummary.className = 'fx-hud-more-button';
  hudMoreSummary.textContent = '»';
  hudMoreSummary.title = 'Click to expand: the controls that do not fit';
  hudMoreSummary.setAttribute('aria-label', 'More viewport controls');
  const hudMoreList = el(doc, 'div', 'fx-hud-more-list');
  hudMore.append(hudMoreSummary, hudMoreList);
  hudMore.hidden = true;
  cameraHud.append(hudMore);
  /** The row's items in order; the last ones go under » first. */
  const hudItems: HTMLElement[] = [spaceBtn, gizmoTools, surfaceMenu, gridSnapUi.pill, turnSnapUi.pill, cameraSettings];
  let fittingHud = false;
  const fitHud = (): void => {
    if (fittingHud) return;
    fittingHud = true;
    try {
      // Every item back on the row, then the last ones under » while the row runs into the left menus.
      for (const item of hudItems) cameraHud.insertBefore(item, hudMore);
      hudMore.hidden = true;
      const room = (): number => cameraHud.getBoundingClientRect().left - viewportLeftControls.getBoundingClientRect().right - 12;
      if (room() >= 0) { hudMore.open = false; return; }
      hudMore.hidden = false;
      for (let i = hudItems.length - 1; i >= 0 && room() < 0; i--) hudMoreList.prepend(hudItems[i]!);
    } finally { fittingHud = false; }
  };
  hudMoreSummary.addEventListener('click', (e) => {
    e.preventDefault();
    const opening = !hudMore.open;
    for (const [other] of viewportPopups) other.open = false;
    hudMore.open = opening;
  });
  doc.addEventListener('pointerdown', (e) => {
    if (hudMore.open && !hudMore.contains(e.target as Node | null)) hudMore.open = false;
  }, true);
  if (typeof ResizeObserver !== 'undefined') {
    const hudWatch = new ResizeObserver(() => fitHud());
    hudWatch.observe(viewport);
    hudWatch.observe(viewportLeftControls);
  }
  fitHudNow = fitHud;
  fitHudLater();
  split.restore(parseSplitRecord(keptSplit, MAP_DATA_KIND_TOGGLES.map((t) => t.id)));
  fit();
  // PF.R60: a change from the panel's slider, the menu's row or the launcher's Options redraws every world and the slider.
  detailDistance.observe(() => { applyView(); });
  viewportDetailDom.sync();
  viewportRenderScaleDom.sync();                               // FP-2

  /* ---------- the map settings (FG-24, FG.R18; `./settings`) ---------- */
  /**
   * The roster's donor maps for the Characters section (`./rosterSetting`): read once each through the hostages' cache
   * (`hostageLibOf`, one load a map), the section drawn again as each arrives (`rosterRev`).
   */
  const rosterLibs = new Map<string, LoadedMap | null>();
  let rosterRev = 0, rosterMapList: (readonly [string, string])[] = [], rosterMapsOf: readonly ArchiveEntry[] | null = null;
  const rosterMaps = (): (readonly [string, string])[] => {
    if (rosterMapsOf !== entries) {                            // the disc's MP maps, kept one list while `entries` is
      rosterMapsOf = entries;
      rosterMapList = entries.filter((e) => !e.campaign && /^MP\d+$/i.test(e.stem)).map((e) => [e.stem, `${e.label} · ${e.stem}`] as const);
    }
    return rosterMapList;
  };
  const rosterChoicesOf = (stem: string, side: 'seal' | 'terrorist'): { index: number; label: string }[] | null => {
    const home = baseMap ?? charMap;
    if (home && stem === home.archive) return rosterChoices(home, side);
    if (rosterLibs.has(stem)) { const lib = rosterLibs.get(stem); return lib ? rosterChoices(lib, side) : []; }
    void hostageLibOf(stem).then((lib) => { rosterLibs.set(stem, lib); rosterRev++; drawSettings(); });
    return null;
  };
  const drawRoster = (): void => {
    const home = baseMap ?? charMap;
    settingsDom.roster.draw({
      setting: settings.characters, home: home?.archive ?? '', locked: editsLocked(), rev: rosterRev, maps: rosterMaps(),
      homeCounts: { seal: home ? rosterChoices(home, 'seal').length : 0, terrorist: home ? rosterChoices(home, 'terrorist').length : 0 },
      choicesOf: rosterChoicesOf,
    });
  };
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
    respawnIn.checked = settings.respawn;
    eqSel.value = String(settings.eqLimit);
    // The match's weapons and kits over the map's own arsenal (a blank floor's: its library's, as Play plays it).
    settingsDom.arsenal.draw({ setting: settings.arsenal, kits: (baseMap ?? charMap)?.arsenal ?? null, locked: editsLocked() });
    drawRoster();
    // The map's own surface, reverb, view and title (a blank floor's: its library's), and the layout's over them.
    const home = baseMap ?? charMap;
    settingsDom.world.draw({
      settings, locked: editsLocked(), maps: rosterMaps(),
      own: { material: home?.grenade?.defaultMaterial ?? null, reverb: home?.reverb ?? null,
        fov: home?.camera ? { hfov: home.camera.hfov, vfov: home.camera.vfov } : null, title: home?.name ?? null },
    });
  };
  /**
   * The settings on the editor's view: the fog's far (its near at the disc's ratio) over the base's own fog, and the
   * light as the brighten uniform's factor on the base's world and every piece template (`WorldView.setLighting` with
   * the same rig: a uniform, no rebake); the fog colour and the cleared background follow the brighten (`liftFog`).
   */
  /** A new empty map's own rig, where it has one (a blank base only); null on a disc map, which keeps its own. */
  /**
   * Whether the base's environment is the layout's to edit (the owner, 2026-11-06): a new empty map's, and an official
   * map's for a custom version of it -- each starting from the map's own values, Reset back to them. An authored map's is
   * its pack's.
   */
  function envEditable(): boolean { return base?.kind === 'blank' || base?.kind === 'map'; }
  const customRig = (): GlobalLighting | null => (envEditable() ? (settings.lightRig as GlobalLighting | null | undefined) ?? null : null);
  /** The rig of the map a new empty map is built from (its library): what it plays with none of its own. */
  const libraryRig = (): GlobalLighting | null => (base?.kind === 'blank' ? charMap?.lightRig ?? null : base?.kind === 'map' ? baseMap?.lightRig ?? null : null);
  /** A new empty map's drop-shadow way: its own, else the built-from map's, else `FALLBACK_SHADOW` (as the editor shows). */
  /** Where an official map's Light directions arrows stand: its middle and its size (the map data's draw sets it). */
  let mapArrowsAt: { centre: [number, number, number]; size: number } = { centre: [0, 0, 0], size: 0 };
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
    if (envEditable() && settings.fogColor) fog.color = [settings.fogColor[0], settings.fogColor[1], settings.fogColor[2]];
    // Its own near distance and height band likewise (its on is the view's, `applyView`).
    if (envEditable() && settings.fog) {
      fog.near = Math.max(0, Math.min(settings.fog.near, fog.far - 1));
      fog.altitude = settings.fog.height ? { top: settings.fog.height.top, bottom: settings.fog.height.bottom } : null;
    }
    lighting.brighten = brightenFor(DEFAULT_LIGHTING.brighten, settings.timeOfDay === null ? settings.light : 1);
    // An official map's own world under the layout's rig where it has one (a custom version), else the map's again.
    if (base?.kind === 'map') lighting.rig = customRig() ?? baseMap?.lightRig ?? null;
    baseView?.setLighting(lighting);
    pieces.setRig(customRig());                                // a new empty map's own rig over the pieces' own (a blank base only)
    pieces.setBrighten(lighting.brighten);
    if (base?.kind === 'blank') {
      // The rig it plays drawn as the Light directions arrows, across the floor's middle; the editor with it.
      lightArrows.set((customRig() ?? libraryRig()) as GlobalLighting | null, [0, 0, 0], BLANK_RIG_ARROWS_SPAN, blankShadow());
    } else if (base?.kind === 'map') {
      // An official map's: across its own middle, sized to it (`mapArrowsAt`, the map data's draw).
      lightArrows.set(customRig() ?? libraryRig(), mapArrowsAt.centre, mapArrowsAt.size, settings.shadowVector ?? baseMap?.shadowVector ?? null);
    }
    if (envEditable()) rigEditor.draw();
    rigEditor.body.hidden = !envEditable();
    // The disc's read-only copy only where the rig cannot be edited (the owner, 2026-11-12: "only show the editable
    // version if possible"): the editor already shows the same light rig, fog, night and shadows.
    environmentDom.info.hidden = envEditable();
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
  // CREATE GAME's RESPAWN (its rounds and time to the respawn screen's defaults, `./settings` `respawnSetting`) and EQlimit.
  respawnIn.addEventListener('change', () => settingsEdit(() => { settings = respawnSetting(settings, respawnIn.checked); edit(); drawSettings(); }));
  eqSel.addEventListener('change', () => settingsEdit(() => { settings = { ...settings, eqLimit: boundSetting('eqLimit', Number(eqSel.value)) }; edit(); drawSettings(); }));
  settingsDom.arsenal.onChange((next) => settingsEdit(() => { settings = { ...settings, arsenal: next }; edit(); drawSettings(); }));
  settingsDom.roster.onChange((next) => settingsEdit(() => { settings = { ...settings, characters: next }; edit(); drawSettings(); }));
  settingsDom.world.onChange((patch) => settingsEdit(() => { settings = { ...settings, ...patch }; edit(); drawSettings(); }));
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
    // The library's archive, none of its map (`./objectives`); a map's own objectives this layout takes out, left out.
    return !m ? {} : base?.kind === 'blank' ? blankFloorOf(m) : mapDataShown(m);
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
  const stepSettingBy = (key: SteppedSetting, dir: 1 | -1): void => {
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
  /**
   * The base map's own objectives picked by a box (the owner, 2026-11-06): the deletable ones (`./mapDataHide`
   * `hiddenDataKeyOf`) -- spawn slots, respawns, hostages, the bomb start, plant sites, extraction zones -- by their
   * billboard's key, beside the props and placements the box picks; Delete takes them all out in one step.
   */
  const dataPicks = new Map<string, BillboardSpec>();
  /** The base map's own objectives this layout takes out (`Layout.hiddenData`, `./mapDataHide`): its custom version's. */
  let hiddenData = new Set<string>();
  /**
   * The base map's own data objects this layout moves (`Layout.movedData`, `./mapDataMove`): each by its key to its new
   * place -- spawn slots, respawn points, hostages, the bomb start, tactical points and zones, spectator views.
   */
  let movedData = new Map<string, MovedMapData>();
  /**
   * The base map's data as this layout has it -- its taken-out objectives gone (`withoutHiddenData`), its moved objects at
   * their new places (`withMovedData`): what the Outliner, the billboards, the guides, the check and Play all read.
   */
  function mapDataShown<T extends LoadedMap>(m: T): T { return withMovedData(withoutHiddenData(m, hiddenData), movedData); }
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
    // Another view has the camera: the layout's camera is still the first view's (`./splitViews`).
    if (split && split.active() !== 0) {
      const m = split.mainState();
      return { x: m.position[0], y: m.position[1], z: m.position[2], yaw: wrapYaw(MathUtils.radToDeg(m.yaw)), pitch: MathUtils.radToDeg(m.pitch) };
    }
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
      ...(hiddenData.size ? { hiddenData: [...hiddenData].sort() } : {}),
      ...(movedData.size ? { movedData: Object.fromEntries([...movedData].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) } : {}),
      ...(Object.keys(delta).length ? { settings: delta } : {}),
    };
    // R3-B (FCW-07a part 2): each row's authored id rides its object (`forgeId`, set by `prepareLayout`), so a reorder, a
    // delete or an undo keeps it; a row without one (placed since) takes the first default free from its place.
    const idOf = (r: Object3D): { id?: string } => (typeof r.userData['forgeId'] === 'string' ? { id: r.userData['forgeId'] as string } : {});
    const marks: { start: Object3D | null; sites: Object3D[] } = { start: null, sites: [] };
    const gateRoots = roots.filter((r) => r.userData['forgeGate']);
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
      } else if (r.userData['forgeTrigger']) {
        // A custom damage trigger: its place, its link (a prop of yours by its place among the pieces, or a map object's
        // path; a prop since deleted, none), its numbers and its death's steps.
        const t = pieceTrigger.get(r);
        const sc = triggerScript.get(r);
        const steps = sc ? scriptToFile({ steps: sc.steps }).steps : [];
        const link = triggerLink.get(r);
        const piece = link && typeof link !== 'string' ? ownLists().pieces.indexOf(link) : -1;
        if (t) (l.triggers ??= []).push({ ...(typeof link === 'string' ? { node: link } : piece >= 0 ? { piece } : {}), ...t,
          ...(steps.length ? { script: { steps } } : {}), at: [r.position.x, r.position.y, r.position.z] });
      } else if (r.userData['forgeSwitch']) {
        const gate = gateRoots.indexOf(switchGate.get(r) ?? r);
        const sc = gate < 0 ? switchScript.get(r) : undefined;
        const action = gate < 0 && !sc ? switchAction.get(r) ?? null : null;
        // On a prop (`switchLink`): a prop of yours by its place among the pieces, or a map object's path.
        const link = switchPropMode.has(r) ? switchLink.get(r) : undefined;
        const piece = link && typeof link !== 'string' ? ownLists().pieces.indexOf(link) : -1;
        (l.switches ??= []).push({ ...(gate >= 0 ? { gate } : {}), ...(action ? { action } : {}), ...(sc ? { script: scriptToFile(sc) } : {}), ...(switchOpts.get(r) ?? {}),
          ...(typeof link === 'string' ? { node: link } : piece >= 0 ? { piece } : {}), at: [r.position.x, r.position.y, r.position.z], yaw: r.rotation.y, ...(locked ? { locked: true } : {}) });
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
      } else if (objectOf(r)) {
        // A Forge object (`Layout.objects`): its kind, its map (an ambient's), its name, its place and turn.
        const o = objectOf(r)!;
        (l.objects ??= []).push({ kind: o.kind, source: o.source, name: o.name, at: [r.position.x, r.position.y, r.position.z], yaw: r.rotation.y, ...(locked ? { locked: true } : {}),
          ...(objectScript.get(r) ? { script: scriptToFile(objectScript.get(r)!) } : {}) });
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
    // The tree (`Layout.tree`): each parented placement by its place in the layout as written.
    const idOfRoot = new Map([...outlineIds()].map(([id, r]) => [r, id] as const));
    const tree = [...parentOf].flatMap(([c, pr]): [string, string][] => { const ci = idOfRoot.get(c), pi = idOfRoot.get(pr); return ci && pi ? [[ci, pi]] : []; });
    if (tree.length) l.tree = tree;
    // The Outliner's folders and its order (`Layout.folders`, `Layout.order`): the editor's own, sent to no lobby.
    if (folders.length) l.folders = folders.map((f) => ({ name: folderName(f) }));
    if (outlineOrdered) {
      const order = outlineSorted([...roots, ...folders]).flatMap((o) => { const id = idOfRoot.get(o); return id ? [id] : []; });
      if (order.length) l.order = order;
    }
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
    let piece = 0, spawn = 0, respawn = 0, flare = 0, npc = 0, hostage = 0, zone = 0, point = 0, views = 0, turret = 0, door = 0, gate = 0, barrier = 0, switches = 0, triggers = 0, objects = 0;
    const bombs = { start: 0, seal: 0, terrorist: 0 };
    for (const r of roots) {
      const bomb = bombKindOf(r);
      if (r.userData['forgePiece']) map.set(`piece:${piece++}`, r);
      else if (r.userData['forgeTrigger']) map.set(`trigger:${triggers++}`, r);   // a custom damage trigger (`newTriggerMarker`)
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
      else if (r.userData['forgeSwitch']) map.set(`switch:${switches++}`, r);
      else if (r.userData['forgePoint']) map.set(`point:${point++}`, r);
      else if (r.userData['forgeObject']) map.set(`object:${objects++}`, r);
      else if (r.userData['forgeView']) map.set(`view:${views++}`, r);
      else if (bomb) map.set(`bomb:${bomb}:${bombs[bomb]++}`, r);   // FG-51: a file may name two sites of a team
    }
    return map;
  };
  /** The placements' identities (`placementIds`) and the folders' (`folder:<i>`): the tree's and the order's references. */
  const outlineIds = (): Map<string, Object3D> => {
    const map = placementIds();
    folders.forEach((f, i) => map.set(`folder:${i}`, f));
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
    if (hullWanted()) scheduleHull();
    // The AI map's routes planned again for the placed hostages and zones (`refreshAiRoutes`), a moment after the edits.
    if (aiMapOverlay) { if (aiRoutesTimer) clearTimeout(aiRoutesTimer); aiRoutesTimer = setTimeout(() => { aiRoutesTimer = null; void refreshAiRoutes(); }, 150); }
    statusChips.update();
  };
  let aiRoutesTimer: ReturnType<typeof setTimeout> | null = null;

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
  const isMarker = (r: Object3D): boolean => !!r.userData['forgeObject'] || !!r.userData['forgeSpawn'] || !!r.userData['forgeRespawn'] || !!r.userData['forgeFlare'] || !!r.userData['forgeNpc'] || !!r.userData['forgeBomb'] || !!r.userData['forgeHostage'] || !!r.userData['forgeZone'] || !!r.userData['forgePoint'] || !!r.userData['forgeView'] || !!r.userData['forgeTurret'] || !!r.userData['forgeDoor'] || !!r.userData['forgeGate'] || !!r.userData['forgeBarrier'] || !!r.userData['forgeSwitch'] || !!r.userData['forgeTrigger'];
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
    if (objectChoice.turret) return objectChoice.turret;     // the asset browser's tile (`chooseObject`)
    const own = paletteStem() ? (await turretsOf(paletteStem()))[0] : undefined;
    if (own) return { source: own.source, name: own.name };
    return (await turretTemplate(DEFAULT_TURRET.source, DEFAULT_TURRET.name)) ? { ...DEFAULT_TURRET } : null;
  };
  /**
   * A placed turret's marker: its template's model as the disc draws it (`turretModelMap`, built once a model), else --
   * its archive not here -- a stand-in pick box, so the placement is kept. Tagged with its source and name, and its
   * definition for the Inspector's Data (read only: the disc's).
   */
  async function newTurret(source: string, name: string, preview = false): Promise<Object3D> {
    const t = await turretTemplate(source, name);
    const r = (t ? pieces.modelOf(`turret:${source}:${name}`, turretModelMap(t), preview) : null) ?? pointMarker('point');
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
    if (objectChoice.door) return objectChoice.door;         // the asset browser's tile (`chooseObject`)
    const own = paletteStem() ? (await doorsOf(paletteStem()))[0] : undefined;
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
    // The Place tool's flare ghost too (`ghostFacade`): its glow faces the camera as the placed one will.
    // A flare dragged from the asset browser too (`stagedLive`: its object keeps its flare's data).
    for (const r of [...roots, ...(ghost && ghost.userData['ghostFacade'] ? [ghost] : []), ...[...stagedLive].map((x) => x.object)]) {
      const facade = r === ghost ? ghost.userData['ghostFacade'] as number : (r.userData['forgeFlare'] as { facade?: number } | undefined)?.facade;
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
    if (objectChoice.flare) return objectChoice.flare;       // the asset browser's tile (`chooseObject`)
    for (const stem of [paletteStem(), baseMap?.archive ?? '']) {
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
  async function newFlare(source: string, name: string, preview = false): Promise<Object3D> {
    const t = await flareTemplate(source, name);
    const r = (t ? pieces.modelOf(`flare:${source}:${name}`, flareModelMap(t), preview) : null) ?? pointMarker('point');
    r.userData['forgeFlare'] = { source, name, facade: t?.prop.facade ?? 0, ...(t ? { model: t.prop.modelName } : { missing: true }) };
    r.name = `flare ${name}`;
    const pick = new Mesh(new BoxGeometry(FLARE_PICK_SIZE, FLARE_PICK_SIZE, FLARE_PICK_SIZE), new MeshBasicMaterial({ visible: false }));
    pick.name = 'flare pick';
    r.add(pick);
    return r;
  }
  /** The ladder a new placement is: the palette archive's first ladder prop, else Sandstorm's ladder35; null when neither is here. */
  const defaultLadder = async (): Promise<string | null> => {
    if (objectChoice.ladder) return objectChoice.ladder;     // the asset browser's tile (`chooseObject`)
    for (const stem of [paletteStem(), DEFAULT_LADDER.source]) {
      if (!stem || absent.has(stem)) continue;
      const lib = await hostageLibOf(stem);
      const own = lib ? ladderPropsOf(lib) : [];
      const pick = stem === DEFAULT_LADDER.source ? own.find((l) => l.model === DEFAULT_LADDER.name) ?? own[0] : own[0];
      if (pick) return assetId(stem, pick.model);
    }
    return null;
  };
  /** A placed door's marker: its template's leaf and frame as the disc draws them, its hinge at the origin; else a stand-in. */
  async function newDoor(source: string, name: string, preview = false): Promise<Object3D> {
    const t = await doorTemplate(source, name);
    const r = (t ? pieces.modelOf(`door:${source}:${name}`, doorModelMap(t), preview) : null) ?? pointMarker('point');
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
    const picked = objectChoice[kind];
    if (picked) return picked;                                // the asset browser's tile (`chooseObject`)
    const own = paletteStem() ? (await accessOf(paletteStem())).find((t) => t.kind === kind) : undefined;
    if (own) return { source: own.source, name: own.name };
    const d = kind === 'gate' ? DEFAULT_GATE : DEFAULT_BARRIER;
    return (await accessTemplate(kind, d.source, d.name)) ? { ...d } : null;
  };
  /**
   * A placed gate's or barrier's marker: its template whole as the disc draws it (its wreck off), its anchor at the
   * origin; else a stand-in. Tagged with its source and name, and the template's data for the Inspector (read only).
   */
  async function newAccess(kind: 'gate' | 'barrier', source: string, name: string, preview = false): Promise<Object3D> {
    const t = await accessTemplate(kind, source, name);
    const r = (t ? pieces.modelOf(`access:${source}:${name}`, accessModelMap(t), preview) : null) ?? pointMarker('point');
    r.userData[kind === 'gate' ? 'forgeGate' : 'forgeBarrier'] = { source, name, ...(t ? {
      parts: t.pieces.length, health: t.destructibles.map((d) => d.health), shield: t.destructibles.map((d) => d.shield),
      ...(t.gate ? { slide: t.gate.spec.open, seconds: t.gate.spec.seconds, levers: t.gate.spec.levers.length } : {}),
    } : { missing: true }) };
    r.name = `${kind} ${name}`;
    // Where and which way it is used (`./placedAccess` `accessGizmo`): its C4 prompt's reach, a gate's slide and lever.
    if (t) {
      const g = accessGizmo(t, 'atGate');
      if (g.segments.length) r.add(guideIn(g.segments, g.triangles, accessMove(t, [0, 0, 0], 0), kind === 'gate' ? GATE_GUIDE_COLOUR : BARRIER_GUIDE_COLOUR, kind === 'gate' ? 'userGates' : 'userBarriers'));
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
  /**
   * A placed switch's reach (`SWITCH_REACH_COLOUR`): its record's reach and height reach (`switchOwnRecord` under its own
   * fields, `preview` a scrubbed value over them) round its prompt's place in its own frame (`switchReachAt`, kept off the Data list's `forge` keys: the
   * look's record less its anchor, as `withPlacedAccess` moves it). None while it has no reach.
   */
  function addSwitchGuide(r: Object3D, preview?: { range?: number; elevation?: number }): void {
    for (const old of r.children.filter((c) => c.userData['forgeSwitchGuide'])) { r.remove(old); disposeGuide(old); }
    if (switchPropMode.has(r)) { switchLinksKey = ''; return; }   // drawn round its prop by `syncSwitchLinks`
    const opts = switchOpts.get(r) ?? {};
    // As `withPlacedAccess` takes its record: a map action's or its gate's lever's, else its look's own.
    const look = r.userData['switchLookReach'] as { range: number; elevation: number } | undefined;
    const own = switchAction.get(r) || switchGate.get(r) ? switchOwnRecord(r) ?? look : look ?? switchOwnRecord(r);
    const range = preview?.range ?? opts.range ?? own?.range ?? 0;
    const elevation = preview?.elevation ?? opts.elevation ?? own?.elevation ?? -1;
    const at = (r.userData['switchReachAt'] as [number, number, number] | undefined) ?? [0, 0, 0];
    const g = bombSiteShapes(at, range, elevation);
    if (!g.segments.length) return;
    const guide = guideIn(g.segments, g.triangles, null, SWITCH_REACH_COLOUR, 'userSwitches');
    guide.userData['forgeSwitchGuide'] = true;
    r.add(guide);
  }
  /**
   * Each placed switch's gate (the owner, 2026-11-08): the gate root it slides, or none. Kept off `userData` (a ghost's
   * clone and the Inspector's Data copy that); `layoutNow` writes it as the gate's place among the placed gates.
   */
  const switchGate = new WeakMap<Object3D, Object3D | null>();
  /** Each placed switch's map action instead (the owner, 2026-11-08): a base map's action by its valve, or none. */
  const switchAction = new WeakMap<Object3D, string | null>();
  /** Each placed switch's look and own record fields (`SwitchMarker`'s; absent, its action's own). */
  type SwitchOpts = { look?: Exclude<SwitchLookId, 'lever'>; prompt?: string; range?: number; elevation?: number; points?: number };
  const switchOpts = new WeakMap<Object3D, SwitchOpts>();
  /**
   * The looks a switch can wear (`./placedAccess` `SwitchLook`), each read once: the lever panel and its plate from the
   * default gate (Death Trap's access1, `DEFAULT_GATE`), the radio from Sujo (MP61), else Enowapi (MP62). Null when its
   * map is not on this disc.
   */
  const switchLooks = new Map<SwitchLookId, Promise<SwitchLook | null>>();
  const switchLookOf = (id: SwitchLookId): Promise<SwitchLook | null> => {
    let got = switchLooks.get(id);
    if (!got) {
      got = (async (): Promise<SwitchLook | null> => {
        if (id === 'radio') {
          for (const stem of RADIO_LOOK_SOURCES) {
            if (absent.has(stem)) continue;
            const lib = await archives.load(stem).catch(() => null);
            const look = lib ? radioLook(lib) : null;
            if (look) return look;
          }
          return null;
        }
        const which = await defaultAccess('gate');
        const t = which ? await accessTemplate('gate', which.source, which.name) : null;
        const part = t?.gate?.switches[0];
        return t && part ? leverLook(part, t.lib, id === 'plate') : null;
      })();
      switchLooks.set(id, got);
    }
    return got;
  };
  /**
   * Each placed switch's script (the owner, 2026-11-08; a browser adaptation, FG.R2), as the editor holds it: its steps
   * naming the layout's own objects by the objects themselves (a delete or a reorder never points a step at another),
   * written as their places in their lists (`ScriptTarget`) by `layoutNow` (`scriptToFile`).
   */
  type EditorTarget = { map: string } | { obj: Object3D };
  type EditorStep = {
    do: ScriptStep['do']; action?: string; run?: Object3D; target?: EditorTarget; at?: EditorTarget; seconds?: number; random?: number;
    text?: string; name?: string; from?: string; volume?: number; flag?: string; value?: number; chance?: number; times?: number;
  };
  type EditorScript = { steps: EditorStep[] };
  const switchScript = new WeakMap<Object3D, EditorScript>();
  /**
   * A custom damage trigger (the owner, 2026-11-10: "make our own custom damage triggers ... patch a satchel on any prop";
   * "the damage trigger [should] stay a damage trigger ... and just link to the prop"; `PieceTrigger`): an object of its
   * own (`newTriggerMarker`) carrying its record's health, armour and shield, its death's steps (`triggerScript`) and its
   * link (`triggerLink`): one of your props, or one of the map's own objects by its placed path -- that prop left as it is.
   */
  const pieceTrigger = new WeakMap<Object3D, { health: number; armor: number; shield: number }>();
  const triggerScript = new WeakMap<Object3D, EditorScript>();
  const triggerLink = new WeakMap<Object3D, Object3D | string>();
  /**
   * A switch on a prop (the owner, 2026-11-10: "do the same thing for switch, have a custom prop as an option ... don't
   * move the switch"; `SwitchMarker.piece` / `node`): its Look's Custom prop (`switchPropMode`, drawn as a marker) and the
   * prop it is used on (`switchLink`), left as it is -- the use prompt's ray strikes that prop.
   */
  const switchPropMode = new WeakSet<Object3D>();
  const switchLink = new WeakMap<Object3D, Object3D | string>();
  /** The middle of a linked prop: a prop of yours by its drawn bounds, a map object by its collision (`targetPlace`). */
  const linkCentre = (link: Object3D | string | undefined): [number, number, number] | null => {
    if (!link) return null;
    if (typeof link === 'string') return targetPlace({ map: link });
    if (!roots.includes(link)) return null;
    link.updateMatrixWorld(true);
    const b = new Box3().setFromObject(link);
    return b.isEmpty() ? null : b.getCenter(new Vector3()).toArray() as [number, number, number];
  };
  /**
   * The Prop choice of a custom trigger or a switch on a prop: none, one of your props, or one of the map's own objects --
   * never one `taken` holds (another trigger's or switch's), nor a map object `refused` names.
   */
  const propLinkOptions = (taken: readonly (Object3D | string | undefined)[], refused: (path: string) => boolean): (readonly [string, string])[] => {
    const own = ownLists();
    const lib = baseMap ? scriptLibOf(baseMap) : { objects: [] as { path: string; label: string }[] };
    const modelOfPiece = (x: Object3D): string => parseAssetId(String(x.userData['forgePiece'] ?? ''))?.model ?? 'prop';
    return [['', 'Not linked yet'] as const,
      ...own.pieces.flatMap((x, i) => (taken.includes(x) ? [] : [[`piece:${i}`, `Your prop ${i + 1} \u00b7 ${modelOfPiece(x)}`] as const])),
      ...lib.objects.filter((o) => !taken.includes(o.path) && !refused(o.path)).map((o) => [`map:${o.path}`, `Map \u00b7 ${o.label}`] as const)];
  };
  const propLinkValue = (link: Object3D | string | undefined): string => {
    const own = ownLists();
    return typeof link === 'string' ? `map:${link}` : link && own.pieces.includes(link) ? `piece:${own.pieces.indexOf(link)}` : '';
  };
  const propLinkOf = (v: string): Object3D | string | null => (v.startsWith('piece:') ? ownLists().pieces[Number(v.slice(6))] ?? null : v.startsWith('map:') ? v.slice(4) : null);
  const newTriggerMarker = (): Object3D => {
    const r = pointMarker('point');
    r.userData['forgeTrigger'] = true;
    r.name = 'damage trigger (custom)';
    return r;
  };
  /** Where a custom trigger's link is (its link line's end): a prop of yours where it stands, a map object's aim point. */
  const triggerLinkPlace = (r: Object3D): [number, number, number] | null => {
    const link = triggerLink.get(r);
    if (!link) return null;
    if (typeof link === 'string') return targetPlace({ map: link });
    return roots.includes(link) ? [link.position.x, link.position.y + SWITCH_LINK_LIFT, link.position.z] : null;
  };
  /** The layout's own objects a script names, each list in the order `layoutNow` writes it. */
  const ownLists = (): { pieces: Object3D[]; barriers: Object3D[]; gates: Object3D[]; objects: Object3D[] } => ({
    pieces: roots.filter((r) => r.userData['forgePiece']), barriers: roots.filter((r) => r.userData['forgeBarrier']), gates: roots.filter((r) => r.userData['forgeGate']),
    objects: roots.filter((r) => r.userData['forgeObject']),
  });
  const SCRIPT_FLAG = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;
  const SCRIPT_NAME = /^[A-Za-z0-9_. -]{1,48}$/;
  /** A sound's name: an effect's rule, and the game's loops' `~` and its other marks. */
  const SCRIPT_SOUND_NAME = /^[A-Za-z0-9_.~!^ -]{1,48}$/;
  /** An editor target as the file writes it; null for an object no longer placed. */
  const targetToFile = (t: EditorTarget | undefined, own: ReturnType<typeof ownLists>): ScriptTarget | null => {
    if (!t) return null;
    if ('map' in t) return { map: t.map };
    const at = (list: Object3D[]): number => list.indexOf(t.obj);
    if (t.obj.userData['forgePiece']) return at(own.pieces) >= 0 ? { piece: at(own.pieces) } : null;
    if (t.obj.userData['forgeBarrier']) return at(own.barriers) >= 0 ? { barrier: at(own.barriers) } : null;
    if (t.obj.userData['forgeGate']) return at(own.gates) >= 0 ? { gate: at(own.gates) } : null;
    if (t.obj.userData['forgeObject']) return at(own.objects) >= 0 ? { object: at(own.objects) } : null;   // an empty's place
    return null;
  };
  /**
   * A step list as the file writes it: a step whose object is gone, or whose words do not read, left out; the ifs kept
   * whole (a stray else or end dropped, an open if closed), so a file always reads back.
   */
  const stepsToFile = (list: readonly EditorStep[], own: ReturnType<typeof ownLists>): ScriptStep[] => {
    const out: ScriptStep[] = [];
    // The open blocks, innermost last: a while, an if before its else, an if after it.
    const open: ('while' | 'if' | 'else')[] = [];
    const n10k = (v: unknown): number => Math.min(9999, Math.max(0, Math.round(Number(v) || 0)));
    const test = (st: EditorStep): { flag: string; equals: number } | { chance: number } | null =>
      (st.chance !== undefined ? { chance: Math.min(1, Math.max(0, Number(st.chance) || 0)) } : st.flag && SCRIPT_FLAG.test(st.flag) ? { flag: st.flag, equals: n10k(st.value) } : null);
    for (const st of list) {
      switch (st.do) {
        case 'run': {
          const b = st.run ? own.barriers.indexOf(st.run) : -1;
          if (b >= 0) out.push({ do: 'run', barrier: b });
          else if (st.action && /^[A-Za-z0-9_.-]{1,64}$/.test(st.action)) out.push({ do: 'run', action: st.action });
          break;
        }
        case 'show': case 'hide': { const t = targetToFile(st.target, own); if (t) out.push({ do: st.do, target: t }); break; }
        case 'wait': {
          const random = Math.min(SWITCH_WAIT_MAX, Math.max(0, Number(st.random) || 0));
          out.push({ do: 'wait', seconds: Math.min(SWITCH_WAIT_MAX, Math.max(0, Number(st.seconds) || 0)), ...(random > 0 ? { random } : {}) });
          break;
        }
        case 'message': { const text = String(st.text ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 80); if (text) out.push({ do: 'message', text }); break; }
        case 'sound': case 'effect': {
          if (!st.name || !(st.do === 'sound' ? SCRIPT_SOUND_NAME : SCRIPT_NAME).test(st.name)) break;
          const at = targetToFile(st.at, own);
          const from = st.from && /^[A-Z]{1,3}\d{1,3}$/.test(st.from) && st.from !== scriptHome() ? st.from : undefined;
          const volume = st.do === 'sound' && st.volume !== undefined && Number.isFinite(st.volume) && st.volume !== 1 ? Math.min(AUDIO_VOLUME_MAX, Math.max(0, st.volume)) : undefined;
          if (st.do === 'sound') out.push({ do: 'sound', name: st.name, ...(at ? { at } : {}), ...(from ? { from } : {}), ...(volume !== undefined ? { volume } : {}) });
          else out.push({ do: 'effect', name: st.name, ...(at ? { at } : {}), ...(from ? { from } : {}) });
          break;
        }
        case 'blast': {
          // MPBOMB's blast at its place (as the bridges fire theirs): nothing else to keep.
          const at = targetToFile(st.at, own);
          out.push({ do: 'blast', ...(at ? { at } : {}) });
          break;
        }
        case 'set': if (st.flag && SCRIPT_FLAG.test(st.flag)) out.push({ do: 'set', flag: st.flag, value: Math.min(9999, Math.max(0, Math.round(Number(st.value) || 0))) }); break;
        case 'if': { const t = test(st); if (t) { out.push({ do: 'if', ...t }); open.push('if'); } break; }
        case 'elseif': { const t = test(st); if (t && open[open.length - 1] === 'if') out.push({ do: 'elseif', ...t }); break; }
        case 'else': if (open[open.length - 1] === 'if') { open[open.length - 1] = 'else'; out.push({ do: 'else' }); } break;
        case 'end': if (open[open.length - 1] === 'if' || open[open.length - 1] === 'else') { open.pop(); out.push({ do: 'end' }); } break;
        case 'while': out.push({ do: 'while' }); open.push('while'); break;
        case 'endWhile': if (open[open.length - 1] === 'while') { open.pop(); out.push({ do: 'endWhile' }); } break;
        case 'loop': {
          const times = st.times !== undefined ? Math.min(AUDIO_LOOP_MAX, Math.max(1, Math.round(Number(st.times) || 1))) : undefined;
          const seconds = times === undefined && st.seconds !== undefined ? Math.min(SWITCH_WAIT_MAX * 6, Math.max(0, Number(st.seconds) || 0)) : undefined;
          out.push({ do: 'loop', ...(times !== undefined ? { times } : {}), ...(seconds !== undefined ? { seconds } : {}) });
          break;
        }
        default: break;
      }
      if (out.length >= 64) break;
    }
    // A block left open closed (a file always reads back): its End if or End while.
    while (open.length && out.length < 64) out.push({ do: open.pop() === 'while' ? 'endWhile' : 'end' });
    return out;
  };
  const scriptToFile = (sc: EditorScript): ScriptSteps => {
    const own = ownLists();
    return { steps: stepsToFile(sc.steps, own) };
  };
  /** A file's script for the editor, its objects the staged ones (`prepareLayout`'s lists, in the file's order). */
  const scriptFromFile = (sc: ScriptSteps, own: { pieces: Object3D[]; barriers: Object3D[]; gates: Object3D[]; objects?: Object3D[] }): EditorScript => {
    const target = (t: ScriptTarget | undefined): EditorTarget | undefined => {
      if (!t) return undefined;
      if ('map' in t) return { map: t.map };
      const obj = 'piece' in t ? own.pieces[t.piece] : 'barrier' in t ? own.barriers[t.barrier] : 'object' in t ? own.objects?.[t.object] : own.gates[t.gate];
      return obj ? { obj } : undefined;
    };
    const steps = (list: readonly ScriptStep[]): EditorStep[] => list.map((st): EditorStep => {
      switch (st.do) {
        case 'run': return 'action' in st ? { do: 'run', action: st.action } : { do: 'run', ...(own.barriers[st.barrier] ? { run: own.barriers[st.barrier]! } : {}) };
        case 'show': case 'hide': return { do: st.do, ...(target(st.target) ? { target: target(st.target)! } : {}) };
        case 'wait': return { do: 'wait', seconds: st.seconds, ...(st.random ? { random: st.random } : {}) };
        case 'message': return { do: 'message', text: st.text };
        case 'sound': return { do: 'sound', name: st.name, ...(target(st.at) ? { at: target(st.at)! } : {}), ...(st.from ? { from: st.from } : {}), ...(st.volume !== undefined ? { volume: st.volume } : {}) };
        case 'effect': return { do: 'effect', name: st.name, ...(target(st.at) ? { at: target(st.at)! } : {}), ...(st.from ? { from: st.from } : {}) };
        case 'set': return { do: 'set', flag: st.flag, value: st.value };
        case 'if': case 'elseif': return 'chance' in st ? { do: st.do, chance: st.chance } : { do: st.do, flag: st.flag, value: st.equals };
        case 'loop': return { do: 'loop', ...(st.times !== undefined ? { times: st.times } : {}), ...(st.seconds !== undefined ? { seconds: st.seconds } : {}) };
        case 'blast': return { do: 'blast', ...(target(st.at) ? { at: target(st.at)! } : {}) };
        default: return { do: st.do };
      }
    });
    return { steps: steps(sc.steps) };
  };
  /**
   * The base map's objects a script can show or hide, each a placed node of the world model's own (`worldmodel/<name>`)
   * with something drawn or solid under it; its sounds and its common effects (the names its programs play and call
   * that its set does not hold), with the call strikes' two (research 171 s4) always. Read once a map.
   */
  /** The archive a match's own sounds and effects are (`composeGround`'s `groundMap`): the base map's, else a floor's library. */
  const scriptHome = (): string => (baseMap ?? (base?.kind === 'blank' ? charMap : null))?.archive ?? '';
  const scriptLibs = new WeakMap<LoadedMap, { objects: { path: string; label: string }[]; sounds: string[]; effects: string[]; polys: WorldPoly[]; places: Map<string, [number, number, number] | null> }>();
  const scriptLibOf = (map: LoadedMap) => {
    const have = scriptLibs.get(map);
    if (have) return have;
    let polys: WorldPoly[] = [];
    try { polys = map.ground ? groundPolygons(map.ground) : []; } catch { polys = []; }
    const owned = new Set<string>();
    const top = (p: string): string => p.split('/').slice(0, 2).join('/').split('=')[0]!;
    for (const q of polys) if (q.path.startsWith('worldmodel/')) owned.add(top(q.path));
    for (const pr of map.props) for (const p of pr.paths ?? []) if (p.startsWith('worldmodel/')) owned.add(top(p));
    const objects = [...owned].filter((p) => p !== 'worldmodel').sort().map((path) => ({ path, label: path.slice('worldmodel/'.length) }));
    // Its sounds and effects as every map's are listed (`./scriptAssets`, the census's `sound` and `effect`).
    const programs = (map.meta?.scene?.programs ?? []).map((p) => p.program);
    const out = { objects, sounds: scriptSoundsOf(programs), effects: scriptEffectsOf(programs), polys, places: new Map<string, [number, number, number] | null>() };
    scriptLibs.set(map, out);
    return out;
  };
  /** Where a script's target stands, for its line: an object of the layout's where it is, a map node at its collision's middle. */
  const targetPlace = (t: EditorTarget | undefined): [number, number, number] | null => {
    if (!t) return null;
    if ('obj' in t) return roots.includes(t.obj) ? [t.obj.position.x, t.obj.position.y + SWITCH_LINK_LIFT, t.obj.position.z] : null;
    if (!baseMap) return null;
    const lib = scriptLibOf(baseMap);
    if (!lib.places.has(t.map)) lib.places.set(t.map, aimPointOf(lib.polys, t.map));
    return lib.places.get(t.map) ?? null;
  };
  /** The record a switch runs as, before its own fields: its map action's, else its gate's lever's (`SwitchPart.action`). */
  const switchOwnRecord = (r: Object3D): { bitmap: string; range: number; elevation: number; points: number } | null => {
    const valve = switchAction.get(r);
    const target = valve && baseMap ? (baseMap.meta?.actions ?? []).find((a) => a.valve.toLowerCase() === valve.toLowerCase()) : undefined;
    if (target) return { bitmap: target.bitmap, range: target.range, elevation: target.elevation, points: target.points };
    const f = r.userData['forgeSwitch'] as { range?: number; elevation?: number; prompt?: string } | undefined;
    return f?.range !== undefined ? { bitmap: f.prompt ?? '', range: f.range, elevation: f.elevation ?? -1, points: 0 } : null;
  };
  /**
   * Each placed switch's line to its gate (the owner, 2026-11-08; an editor guide, FG.R2): white, the switch link's
   * colour, from the switch to the gate it slides, rebuilt each frame they move or the link changes (`syncSwitchLinks`);
   * none for a switch with no gate. Shown with the gizmos and the Switch tool, never in Play.
   */
  const switchLinks = overlayLines([], ACTION_LINK_COLOUR, 'forge guide userSwitches');
  switchLinks.userData['forgeGuideKind'] = 'userSwitches';
  scene.add(switchLinks);
  let switchLinksKey = '';
  const syncSwitchLinks = (): void => {
    const pts: number[] = [];
    // Each explosion step's radius round its place (MPBOMB Ammo's 300 u): its object's, else `home` -- the switch (its
    // prop when on one) or the trigger's prop, where the match fires it.
    const blastRings = (sc: EditorScript | undefined, home: readonly number[]): void => {
      for (const st of sc ? sc.steps : []) {
        if (st.do !== 'blast') continue;
        const at = (st.at ? targetPlace(st.at) : null) ?? home;
        // Its reach a sphere (the owner, 2026-11-10: "draw the radius sphere"), its full-strength half a ring inside.
        const r = SCRIPT_BLAST_RADIUS;
        pts.push(...sphereSegments([at[0]!, at[1]!, at[2]!], r), ...bombSiteShapes([at[0]!, at[1]!, at[2]!], r / 2, -1).segments);
      }
    };
    const here = (r: Object3D): number[] => [r.position.x, r.position.y, r.position.z];
    for (const r of roots) {
      // A custom damage trigger's line to its prop (`triggerLinkPlace`).
      if (r.userData['forgeTrigger']) {
        const end = triggerLinkPlace(r);
        if (end) pts.push(r.position.x, r.position.y + SWITCH_LINK_LIFT, r.position.z, end[0], end[1], end[2]);
        blastRings(triggerScript.get(r), linkCentre(triggerLink.get(r)) ?? here(r));
        continue;
      }
      if (!r.userData['forgeSwitch']) continue;
      blastRings(switchScript.get(r), (switchPropMode.has(r) ? linkCentre(switchLink.get(r)) : null) ?? here(r));
      // On a prop: its line to the prop, and its reach and height reach round the prop's middle (`bombSiteShapes`).
      if (switchPropMode.has(r)) {
        const mid = linkCentre(switchLink.get(r));
        if (mid) {
          pts.push(r.position.x, r.position.y + SWITCH_LINK_LIFT, r.position.z, mid[0], mid[1], mid[2]);
          const opts = switchOpts.get(r) ?? {}, rec = switchOwnRecord(r);
          pts.push(...bombSiteShapes(mid, opts.range ?? rec?.range ?? FORGE_SWITCH_REACH, opts.elevation ?? rec?.elevation ?? -1).segments);
        }
      }
      const g = switchGate.get(r);
      // A map action's end: where the player aims at it (`mapActionPlaces`), else its node.
      const valve = switchAction.get(r);
      const target = !g && valve && baseMap ? (baseMap.meta?.actions ?? []).find((a) => a.valve.toLowerCase() === valve.toLowerCase()) : undefined;
      const sc = switchScript.get(r);
      const ends: (readonly number[])[] = [];
      if (g && roots.includes(g)) ends.push([g.position.x, g.position.y + SWITCH_LINK_LIFT, g.position.z]);
      else if (target) ends.push(mapActionPlaces(baseMap!).aims.get(target.path) ?? target.at);
      else if (sc) {
        // A script's: each object it shows, hides, runs or plays at, and each map action it runs (a blank floor's own
        // objects too: only a map's need the base).
        for (const st of sc.steps) {
          const own = st.run ? targetPlace({ obj: st.run }) : null;
          if (own) ends.push(own);
          if (st.do === 'run' && st.action && baseMap) {
            const a = (baseMap.meta?.actions ?? []).find((x) => x.valve.toLowerCase() === st.action!.toLowerCase());
            if (a) ends.push(mapActionPlaces(baseMap).aims.get(a.path) ?? a.at);
          }
          for (const t of [st.target, st.at]) { const at = targetPlace(t); if (at) ends.push(at); }
        }
      }
      for (const end of ends) pts.push(r.position.x, r.position.y + SWITCH_LINK_LIFT, r.position.z, end[0]!, end[1]!, end[2]!);
    }
    const key = pts.map((v) => v.toFixed(1)).join(',');
    if (key !== switchLinksKey) {
      switchLinksKey = key;
      switchLinks.geometry.setAttribute('position', new BufferAttribute(new Float32Array(pts), 3));
      switchLinks.geometry.computeBoundingSphere();
    }
    switchLinks.visible = pts.length > 0 && view.spawns && !playing && guideShown('userSwitches');
  };
  /** The placed gates, in the order the layout writes them, and a gate's words for the Inspector's Gate. */
  const gateRootsNow = (): Object3D[] => roots.filter((r) => r.userData['forgeGate']);
  /**
   * A placed switch (`./placedAccess` `switchModelMap`): its gate's own disc lever's props (`gateswitch`), Death Trap's
   * when it drives none; else a stand-in. Linked to `gate`.
   */
  async function newSwitch(gate: Object3D | null, action: string | null = null, opts: SwitchOpts = {}, onProp = false, preview = false): Promise<Object3D> {
    const own = gate ? accessOwnOf(gate) : null;
    const which = own ?? await defaultAccess('gate');
    const t = which ? await accessTemplate('gate', which.source, which.name) : null;
    const part = t?.gate?.switches[0];
    // Its look: a gate's own lever panel when it asks for the lever, else the look it names; the plate alone a stand-in.
    const look = opts.look === undefined && t && part && own ? leverLook(part, t.lib) : await switchLookOf(opts.look ?? 'lever');
    const key = opts.look === undefined && own ? `switch:${own.source}:${own.name}` : `switch:${opts.look ?? 'lever'}`;
    // On a prop (`switchPropMode`): a marker -- the prop is what is struck, its look not copied.
    const r = (!onProp && look && look.pieces.length ? pieces.modelOf(key, lookModelMap(look), preview) : null) ?? pointMarker('point');
    if (onProp) switchPropMode.add(r);
    switchOpts.set(r, { ...opts });
    // Its reach where it runs no map action: `FORGE_SWITCH_REACH`, as `withPlacedAccess` gives it.
    r.userData['forgeSwitch'] = part ? { lever: part.handle.split('/').pop(), range: FORGE_SWITCH_REACH, elevation: part.action.elevation, prompt: part.action.bitmap } : { missing: true };
    r.name = 'switch';
    switchGate.set(r, gate);
    switchAction.set(r, gate ? null : action);
    if (look && !onProp) {
      r.userData['switchReachAt'] = [0, 1, 2].map((k) => look.record.at[k]! - look.anchor[k]!);
      r.userData['switchLookReach'] = { range: FORGE_SWITCH_REACH, elevation: look.record.elevation };
    }
    addSwitchGuide(r);
    return r;
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
  /**
   * A Forge object (`@s2u/creator-contracts` `ForgeObject`; `./forgeObjects`): an ambient effect, a marker (the unseen
   * pick box), its look its billboard (`userAmbients`); `userData.forgeObject` its kind, its map and its program, and its
   * audio script where it has one.
   */
  type ForgeObjectData = { kind: 'ambient'; source: string; name: string; script?: ScriptSteps };
  const objectOf = (r: Object3D): ForgeObjectData | undefined => r.userData['forgeObject'] as ForgeObjectData | undefined;
  /**
   * Each effect object's script (the one script, `scriptEditors`), as the editor holds it: its steps naming the layout's
   * own objects by the objects themselves (a switch's and a trigger's alike), written by `layoutNow` (`scriptToFile`).
   */
  const objectScript = new WeakMap<Object3D, EditorScript>();
  const newForgeObject = (given: ForgeObjectData): Object3D => {
    const o = scriptObjectData(given);                         // a single sound's or effect's tile: a scripted effect running it
    const r = pointMarker('point');
    // Its script the editor's (`objectScript`): what it starts with, its targets none yet (a loaded one's set by `prepareLayout`).
    if (o.script) objectScript.set(r, scriptFromFile(o.script, ownLists()));
    // Its look its billboard (`userAmbients`), its View switch theirs; its audio script its own copy.
    r.userData['forgeObject'] = { kind: o.kind, source: o.source, name: o.name };
    r.name = `${o.kind} ${o.name}`;
    return r;
  };
  const objectLabel = (r: Object3D): string => {
    const o = objectOf(r);
    const sc = objectScript.get(r);
    if (o && isScriptObject(o)) {
      // Named by what it runs first: its first effect, else its first sound.
      const first = sc?.steps.find((x) => x.do === 'effect') ?? sc?.steps.find((x) => x.do === 'sound');
      return `Effect \u00b7 ${first?.name ? `${first.name.trim()} (${first.from ?? o.source})` : 'empty'}`;
    }
    return !o ? '' : `Ambient \u00b7 ${o.name} (${o.source})${sc ? ' \u00b7 its own script' : ''}`;
  };
  /** The ambient effect the Ambient tool places: the asset browser's tile, else the palette map's first. */
  const defaultAmbient = async (): Promise<ObjectRef | null> => {
    if (objectChoice.ambient) return objectChoice.ambient;
    for (const stem of [paletteStem(), baseMap?.archive ?? '']) {
      if (!stem || absent.has(stem)) continue;
      const lib = await hostageLibOf(stem);
      const first = lib ? ambientProgramsOf(lib)[0] : undefined;
      if (first) return { source: stem, name: first.name };
    }
    return null;
  };
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
  /** A custom damage trigger's words: Custom, what sets it off, and the prop it is linked to (`triggerLink`). */
  const triggerLabel = (r: Object3D): string => {
    const t = pieceTrigger.get(r), link = triggerLink.get(r);
    const on = typeof link === 'string' ? link.slice('worldmodel/'.length)
      : link && roots.includes(link) ? parseAssetId(String(link.userData['forgePiece'] ?? ''))?.model ?? 'prop' : 'not linked';
    return `Custom \u00b7 ${t && t.health > 0 ? 'C4' : 'hit'} \u00b7 ${on}`;
  };
  const nameOf = (r: Object3D): string => {
    const n = npcOf(r);
    if (n) return `NPC · ${charLabel(n.side, n.type)}`;
    const bomb = bombKindOf(r);
    if (bomb) return bombLabel(bomb);
    if (r.userData['forgeHostage']) return hostageOf(r).name ?? 'Hostage';
    if (r.userData['forgeZone']) return zoneNameOf(r);
    if (objectOf(r)) return objectLabel(r);
    if (r.userData['forgePoint'] || r.userData['forgeView']) return pointNameOf(r);
    if (r.userData['forgeTurret']) return turretLabel(r);
    if (r.userData['forgeDoor']) return doorLabel(r);
    if (accessOwnOf(r)) return accessLabel(r);
    if (r.userData['forgeTrigger']) return triggerLabel(r);
    if (r.userData['forgeRespawn']) return `Respawn ${r.userData['forgeRespawn'] as string}`;
    if (r.userData['forgeFlare']) return `Flare · ${(r.userData['forgeFlare'] as { name: string }).name}`;
    return (r.userData['forgePiece'] as string | undefined) ?? `Spawn ${r.userData['forgeSpawn'] as string}`;
  };
  /** FUI-22 (D2): the Inspector head's kind word for a placement. */
  const kindOf = (r: Object3D): string => (objectOf(r) ? (isScriptObject(objectOf(r)!) ? 'Effect' : 'Ambient effect') : bombKindOf(r) ? 'Objective' : r.userData['forgeHostage'] ? 'Hostage' : r.userData['forgeZone'] ? 'Zone' : r.userData['forgePoint'] ? 'Tactical point' : r.userData['forgeView'] ? 'Spectator view' : r.userData['forgeTurret'] ? 'Turret' : r.userData['forgeDoor'] ? 'Door' : r.userData['forgeGate'] ? 'Gate' : r.userData['forgeBarrier'] || r.userData['forgeTrigger'] ? 'Damage trigger' : r.userData['forgeSwitch'] ? 'Switch' : npcOf(r) ? 'NPC' : r.userData['forgeFlare'] !== undefined ? 'Flare' : r.userData['forgeRespawn'] ? 'Respawn point' : r.userData['forgeSpawn'] ? 'Spawn' : 'Piece');
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
      inspectName.textContent = `Map prop \u00b7 ${baseSelected.model} \u2014 drag it to make it yours, Delete hides it`;
      for (const f of [fx, fy, fz, fyaw]) f.value = '';
      return;
    }
    if (!s && mapDataSelected) {
      // The map's own data selected (a spawn slot, a door, a view...): named and placed. A data object (`./mapDataMove`)
      // takes its place typed (`commitMapDataMove`); the scene's own objects (a door, a turret...) stay read only.
      const item = mapDataSelected;
      const movable = mapDataMovable();
      fields.classList.toggle('is-off', !movable);
      fyaw.disabled = true;
      inspectKind.textContent = MAP_DATA_MARKS[item.kind]?.word ?? 'Map data';
      const key = movedDataKeyOf(item);
      inspectName.textContent = key && movedData.has(key) ? `${item.label} · moved` : item.label;
      // While its gizmo drags, the stand-in's place; else its own.
      const at = gizmo.object === mapDataProxy && gizmo.dragging ? mapDataProxy.position.toArray() : item.at;
      const active = doc.activeElement;
      if (active !== fx) fx.value = String(Math.round(at[0]!));
      if (active !== fy) fy.value = String(Math.round(at[1]!));
      if (active !== fz) fz.value = String(Math.round(at[2]!));
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
    // Local to its parent (the owner, 2026-11-10: "in the inspector show the local transform"), as engines show it.
    const parent = parentOf.get(s);
    inspectName.textContent = parent ? `${nameOf(s)} \u00b7 in ${placedLabel(parent)}` : nameOf(s);
    fields.title = parent ? `Local to its parent, ${placedLabel(parent)}` : 'World (no parent)';
    const local = localPose(s);
    const active = doc.activeElement;
    if (active !== fx) fx.value = String(Math.round(local.position.x));
    if (active !== fy) fy.value = String(Math.round(local.position.y));
    if (active !== fz) fz.value = String(Math.round(local.position.z));
    if (active !== fyaw) fyaw.value = String(deg(local.yaw));
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
  /**
   * A locked selection (the owner, 2026-11-11: locked ones "selectable, but not deletable or editable"): one locked
   * placement, or a group of nothing but locked ones -- inspected, its transform fields greyed, its resets hidden (its
   * Properties' own editors are greyed by `inspectorEditors`).
   */
  const lockedSelection = (): boolean => (selected ? lockedOf(selected) : isGroup() && picks.size > 0 && basePicks.size === 0 && picks.items.every(lockedOf));
  const showResets = (): void => {
    const s = isGroup() || baseSelected ? null : selected;
    const entity = inspectedEntity();
    const open = !editsLocked() && !lockedSelection();
    const away = (v: number, d: number): boolean => Math.abs(v - d) > RESET_EPSILON;
    const turned = (a: number): boolean => away(Math.cos(a), 1);   // a whole turn is home
    const local = s ? (() => { const pos = new Vector3(), q = new Quaternion(), sc = new Vector3(); localMatrixOf(s).decompose(pos, q, sc); return { pos, q }; })() : null;
    const movedKey = !s && !entity && mapDataSelected ? movedDataKeyOf(mapDataSelected) : null;
    resetPosition.hidden = !open || !(local ? local.pos.toArray().some((v) => away(v, 0)) : entity ? entity.at.some((v) => away(v, 0))
      : movedKey ? movedData.has(movedKey) : false);   // a moved map object: back to the disc's own place
    resetRotation.hidden = !open || !(local ? away(Math.abs(local.q.w), 1) : entity && entity.yaw !== null ? turned(entity.yaw) : false);
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
  const copyLists = { door: new Map<string, (readonly [string, string])[]>(), turret: new Map<string, (readonly [string, string])[]>(), hostage: new Map<string, (readonly [string, string])[]>(), ladder: new Map<string, (readonly [string, string])[]>(), flare: new Map<string, (readonly [string, string])[]>(), gate: new Map<string, (readonly [string, string])[]>(), barrier: new Map<string, (readonly [string, string])[]>(), sound: new Map<string, (readonly [string, string])[]>(), effect: new Map<string, (readonly [string, string])[]>(), ambient: new Map<string, (readonly [string, string])[]>() };
  const copyList = (kind: CopyKind, stem: string): (readonly [string, string])[] | null => {
    // A sound or an effect: every one the map has (`scriptNamesOf`), not the census's few its programs name.
    if (kind === 'sound' || kind === 'effect') {
      const got = scriptNamesOf(stem);
      return got ? ownScriptNames(got, kind).map((n) => [n, n] as const) : null;
    }
    const counted = censusKnown.get(stem)?.[kind];
    if (counted) return counted;
    const got = copyLists[kind].get(stem);
    if (got) return got;
    if (!copyLists[kind].has(stem)) {
      copyLists[kind].set(stem, undefined as never);
      const ask = kind === 'flare'
        ? flaresOf(stem).then((ts) => ts.map((t) => [t.name, `${t.name} \u00b7 ${t.prop.modelName}`] as const))
        : kind === 'ladder' || kind === 'gate' || kind === 'barrier' || kind === 'ambient'
        ? hostageLibOf(stem).then((lib) => (lib ? copiesOf(lib)[kind] : []))
        : kind === 'hostage'
        ? hostageLibOf(stem).then((lib) => hostageCharactersOf(lib).map((c) => [c, c] as const))
        : kind === 'door'
        ? doorsOf(stem).then((ts) => ts.map((t) => [t.name, `${t.name.trim()} \u00b7 ${t.pieces[0]?.prop.modelName ?? '?'} \u00b7 ${t.spec.programs.map((p) => p.name).join(' + ')}`] as const))
        : turretsOf(stem).then((ts) => ts.map((t) => [t.name, `${t.name.trim()} \u00b7 ${t.placement.weapon ?? 'no weapon'}`] as const));
      void ask.then((list) => { copyLists[kind].set(stem, list); refreshInspector(); if (objectTab === kind) drawAssets(); });
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
  /** Each map's own props, counted with its census (`askCensus`): the Source's Props counts. */
  const ownPropCounts = new Map<string, number>();
  /** Each map's props as read (`archives.props`): a placed prop's Prop row. */
  const mapPropLists = new Map<string, NonNullable<Awaited<ReturnType<typeof archives.props>>>>();
  const propListAsked = new Set<string>();
  /** A map's props, read once on asking (the Inspector drawn again when they come); null till then. */
  const propListOf = (stem: string): NonNullable<Awaited<ReturnType<typeof archives.props>>> | null => {
    const got = mapPropLists.get(stem);
    if (got || propListAsked.has(stem)) return got ?? null;
    propListAsked.add(stem);
    void archives.props(stem).catch(() => null).then((props) => { mapPropLists.set(stem, props ?? []); refreshInspector(); });
    return null;
  };
  const askCensus = (): void => {
    if (censusAsked) return;
    censusAsked = true;
    const none: MapCopies = { door: [], turret: [], hostage: [], ladder: [], gate: [], barrier: [], flare: [], sound: [], effect: [], ambient: [] };
    for (const [stem] of copyMaps()) {
      if (absent.has(stem)) { censusKnown.set(stem, none); continue; }
      void archives.census(stem).then(async (c) => {
        censusKnown.set(stem, c ?? none);
        // Its own props (a shared library's are Common's), for the Source's counts (`drawPaletteCounts`).
        const props = await archives.props(stem).catch(() => null);
        ownPropCounts.set(stem, (props ?? []).filter((x) => !x.shared).length);
        if (props) mapPropLists.set(stem, props);
        refreshInspector();
        drawPaletteCounts();
        if (paletteSel.value === PALETTE_ALL && objectTab !== 'props') drawAssets();   // All's object tabs fill as maps are read
      });
    }
  };
  /**
   * Each map's sounds and effects a switch's script may play (the owner, 2026-11-10: "I want to use other maps
   * sound/effects in my switch"; `./archives` `scriptNames`: its banks' sounds and its programs' streams, every effect
   * of its two sets) -- the maps read one after another in the background once a sound or effect step is shown.
   */
  const scriptNameLists = new Map<string, { sounds: string[]; effects: string[] }>();
  let scriptNamesAsked = false;
  const scriptNamesOf = (stem: string): { sounds: string[]; effects: string[] } | null => {
    const got = scriptNameLists.get(stem);
    if (got) return got;
    if (absent.has(stem)) return { sounds: [], effects: [] };
    void archives.scriptNames(stem).then((n) => { if (!scriptNameLists.has(stem)) { scriptNameLists.set(stem, n ?? { sounds: [], effects: [] }); refreshInspector(); if (objectTab === 'ambient' || objectTab === 'sound') drawAssets(); } });
    return null;
  };
  /** A map's own sounds or effects: its list less what every map has (`scriptCommonNow`), once that is known. */
  const ownScriptNames = (n: { sounds: string[]; effects: string[] }, kind: 'sound' | 'effect'): string[] => {
    const list = kind === 'sound' ? n.sounds : n.effects;
    const common = scriptCommon ? new Set(kind === 'sound' ? scriptCommon.sounds : scriptCommon.effects) : null;
    return common ? list.filter((x) => !common.has(x)) : list;
  };
  const askScriptNames = (): void => {
    if (scriptNamesAsked) return;
    scriptNamesAsked = true;
    let chain: Promise<unknown> = Promise.resolve();
    for (const [stem] of copyMaps()) {
      if (absent.has(stem)) continue;
      chain = chain.then(() => archives.scriptNames(stem).then((n) => { if (!scriptNameLists.has(stem)) { scriptNameLists.set(stem, n ?? { sounds: [], effects: [] }); refreshInspector(); if (objectTab === 'ambient' || objectTab === 'sound') drawAssets(); } }));
    }
  };
  /**
   * A Map choice made, its placement waiting on the change (`ref` to the map chosen): the Map shows the new map at once
   * and the choice under it "reading", until the edit lands or is refused.
   */
  const copyPending = new Map<string, string>();
  /** A script step's From map chosen, its first name being read (`scriptEditors`): `<ref>:<list>:<index>` to the map. */
  const stepPending = new Map<string, string>();
  /** The From choice's Weapons category (`weaponSoundsNow`): no map's stem, never written to a file. */
  const WEAPONS_CATEGORY = '*weapons';
  /** The From choice's Common category (`scriptCommonNow`): what every map has. No map's stem, never written to a file. */
  const COMMON_CATEGORY = '*common';
  /**
   * The sounds and effects every disc map has (`./scriptAssets` `commonScriptNames` over `scriptNamesOf`'s lists), once
   * every map's is read; null till then. Kept for the count of maps it was taken over.
   */
  let scriptCommon: { maps: number; sounds: string[]; effects: string[] } | null = null;
  const scriptCommonNow = (): { sounds: string[]; effects: string[] } | null => {
    askScriptNames();
    const stems = copyMaps().map(([m]) => m).filter((m) => !absent.has(m));
    if (scriptCommon && scriptCommon.maps === stems.length) return scriptCommon;
    const lists = stems.map((m) => scriptNameLists.get(m));
    if (!stems.length || lists.some((l) => !l)) return null;
    scriptCommon = { maps: stems.length, ...commonScriptNames(lists as { sounds: string[]; effects: string[] }[]) };
    return scriptCommon;
  };
  /** `scriptCommonNow` once every map is read. */
  const scriptCommonRead = async (): Promise<{ sounds: string[]; effects: string[] }> => {
    const stems = copyMaps().map(([m]) => m).filter((m) => !absent.has(m));
    const lists = await Promise.all(stems.map((m) => archives.scriptNames(m).then((n) => { const l = n ?? { sounds: [], effects: [] }; if (!scriptNameLists.has(m)) scriptNameLists.set(m, l); return l; })));
    return scriptCommonNow() ?? commonScriptNames(lists);
  };
  /** The guns' sounds (`./archives` `weaponSounds`), once read; null till then (the Inspector redrawn when they land). */
  let weaponSoundList: WeaponSoundEntry[] | null = null;
  let weaponSoundsAsked = false;
  const weaponSoundsNow = (): WeaponSoundEntry[] | null => {
    if (!weaponSoundsAsked) { weaponSoundsAsked = true; void archives.weaponSounds().then((l) => { weaponSoundList = l; refreshInspector(); if (objectTab === 'sound') drawAssets(); }); }
    return weaponSoundList;
  };
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
  /** The Map choice's options for `kind`: every map, each with what it has once counted (`censusOptions`). */
  const mapChoices = (kind: CopyKind, current: string): (readonly [string, string, boolean])[] => {
    askCensus();
    const maps = copyMaps();
    const script = kind === 'sound' || kind === 'effect';
    if (script) askScriptNames();
    const known = (stem: string): MapCensus | null => {
      const c = censusKnown.get(stem);
      if (!script) return c ? censusOfCopies(c) : null;
      // A sound's or an effect's count: the map's whole list once read (`scriptNamesOf`), "counting..." till then.
      const n = scriptNamesOf(stem);
      return n ? { ...(c ? censusOfCopies(c) : { door: 0, turret: 0, hostage: 0, ladder: 0, gate: 0, barrier: 0, flare: 0, ambient: 0 }), sound: ownScriptNames(n, 'sound').length, effect: ownScriptNames(n, 'effect').length } : null;
    };
    // A current map the list lacks shown first; none (a Custom one's: '' or a `*` choice) adds no row.
    const listed = !current || current.startsWith('*') || maps.some(([m]) => m === current);
    return censusOptions(listed ? maps : [[current, current] as const, ...maps], known, kind, current);
  };
  /**
   * Every map on this disc, multiplayer then campaign, by stem and name: where a door, turret, hostage, ladder, gate,
   * damage trigger or flare may be copied from (the owner, 2026-11-10: "every asset from every map available at all times").
   */
  /**
   * A map choice's group (the owner, 2026-11-13: "add the headers Multiplayer/Campaign the same way it is shown in the
   * asset browser ... unify the look and feel of these maps lists"): a disc map's Multiplayer or Campaign, a category
   * of every map's (Weapons, Common: a `*` value) Across maps; anything else (Custom) none.
   */
  const mapGroupOf = (value: string): string | undefined => {
    if (value.startsWith('*') && value !== CUSTOM_TRIGGER) return 'Across maps';
    const e = entries.find((x) => x.stem === value);
    return e ? (e.campaign ? 'Campaign' : 'Multiplayer') : undefined;
  };
  /**
   * Map choices with their groups (`mapGroupOf`), for an Inspector select; a map's count (`mapChoices`' "\u00b7 3 doors",
   * "\u00b7 none") its note, set right in its row (`optionWithNote`), as the asset browser's Source sets its own.
   */
  const groupedMaps = (rows: readonly (readonly [string, string, boolean?])[]): (readonly [string, string, boolean, string | undefined, string | undefined])[] => {
    const names = new Map(copyMaps());
    return rows.map((r) => {
      const name = names.get(r[0]);
      const note = name && r[1].startsWith(`${name} \u00b7 `) ? r[1].slice(name.length + 3) : undefined;
      return [r[0], note !== undefined ? name! : r[1], r[2] ?? false, mapGroupOf(r[0]), note] as const;
    });
  };
  const copyMaps = (): (readonly [string, string])[] => [
    // A map's name first, so the list (by name, as `entries` is) reads in its order.
    ...entries.filter((e) => !e.campaign && /^MP\d+$/i.test(e.stem)).map((e) => [e.stem, `${e.label} \u00b7 ${e.stem}`] as const),
    ...entries.filter((e) => e.campaign).map((e) => [e.stem, `${e.stem} \u00b7 ${e.label} (campaign)`] as const),
  ];
  /**
   * A copied door's or turret's two choices: its map, and its door or turret on that map. A map changed takes that map's
   * first (read first, refused where it has none); either change is the planner's `placement.set` of its `model`.
   */
  const copyEditors = (kind: 'door' | 'turret' | 'ladder' | 'flare' | 'gate' | 'barrier', ref: string, own: { source: string; name: string }, off: boolean, set: (v: string) => Promise<void>,
    custom?: () => void): InspectorEditor[] => {
    const pending = copyPending.get(ref);
    const list = pending ? null : copyList(kind, own.source);
    const words = kind === 'barrier' ? 'damage trigger' : kind;
    return [
      { label: 'Source', kind: 'select', value: pending ?? own.source, covers: [`${kind}.source`], disabled: off,
        // A damage trigger's Custom first (`customFromBarrier`): a prop of your choice made one.
        options: groupedMaps(custom ? [[CUSTOM_TRIGGER, 'Custom', false] as const, ...mapChoices(kind, pending ?? own.source)] : mapChoices(kind, pending ?? own.source)),
        title: custom ? `Custom: a prop you choose made a damage trigger; a disc map: that map's own ${words} copied whole` : `The disc map whose ${words} it copies`,
        set: (v) => {
          const stem = String(v);
          if (custom && stem === CUSTOM_TRIGGER) { custom(); return; }
          const first = kind === 'gate' || kind === 'barrier'
            ? () => accessOf(stem).then((ts) => ts.find((t) => t.kind === kind)?.name ?? null)
            : kind === 'ladder'
            ? () => hostageLibOf(stem).then((lib) => (lib ? ladderPropsOf(lib)[0]?.model ?? null : null))
            : kind === 'flare'
            ? () => flaresOf(stem).then((ts) => ts[0]?.name ?? null)
            : () => (kind === 'door' ? doorsOf(stem) : turretsOf(stem)).then((ts) => ts[0]?.name ?? null);
          switchCopyMap(ref, kind, stem, first, (name) => set(`${stem}:${name}`));
        } },
      { label: kind === 'door' ? 'Door' : kind === 'ladder' ? 'Ladder' : kind === 'flare' ? 'Flare' : kind === 'gate' ? 'Gate' : kind === 'barrier' ? 'Damage Trigger' : 'Turret', kind: 'select', value: pending ? '' : own.name, covers: [`${kind}.name`], disabled: off || !list,
        options: pending ? [['', 'Loading…']] : list ? (list.some(([n]) => n === own.name) ? list : [...list, [own.name, own.name] as const]) : [[own.name, 'Loading…']],
        title: kind === 'flare' ? "The disc glow it copies: one facade node, the lamp it hangs on left behind" : kind === 'gate' ? "The disc gate it copies: its slide, its lever and its wreck are that gate's" : kind === 'barrier' ? "The disc damage trigger it copies: its health, its parts and its wreck are that trigger's" : kind === 'door' ? "The disc door it copies: its swing and reach are that door's" : kind === 'ladder' ? "The disc ladder prop it is: its height and rungs are that ladder's" : "The disc turret it copies: its definition, weapon and limits are that turret's",
        set: (v) => set(`${own.source}:${String(v)}`) },
    ];
  };
  /** A script step's kinds, in the Add list's order, and each one's words. */
  const STEP_KINDS: readonly (readonly [ScriptStep['do'], string])[] = [
    ['sound', 'Play a sound (SOUND)'], ['effect', 'Play an effect (CALL)'], ['wait', 'Wait (WAIT)'], ['loop', 'Loop from the top (LOOP)'],
    ['while', 'While, for ever (WHILE)'], ['endWhile', 'End while'], ['if', 'If (IF)'], ['elseif', 'Else if'], ['else', 'Otherwise (ELSE)'], ['end', 'End if'],
    ['set', 'Set a flag (VALVE)'], ['show', 'Show an object'], ['hide', 'Hide an object'], ['run', 'Run an action'], ['message', 'Show a message'],
    ['blast', "Explosion (the bomb's: MPBOMB, 300 u)"],
  ];
  /** The steps the Add list starts a block with (a While with its End while, an If with its End if); the closers come with them. */
  const ADD_KINDS = STEP_KINDS.filter(([d]) => d !== 'endWhile' && d !== 'end' && d !== 'elseif' && d !== 'else');
  /**
   * A script in the Inspector -- the one script (the owner, 2026-11-13: "a fully generic scripting way of doing things that
   * is unified"): a switch's pull, a damage trigger's death, an effect object's round. Each step a row of what it does
   * (Move up, Move down, Remove: a While or an If with its End), then its own fields; then Add a step. `title` the list's
   * head, `self` what a step with no At acts at (the switch, the prop, the object).
   */
  function scriptEditors(s: Object3D, ref: string, sc: EditorScript, off: boolean, out: InspectorEditor[],
    opts: { store?: WeakMap<Object3D, EditorScript>; death?: boolean; title?: string; self?: string } = {}): void {
    const store = opts.store ?? switchScript;
    if (!store.has(s)) store.set(s, sc);                        // the steps edited are the store's own
    const lib = baseMap ? scriptLibOf(baseMap) : { objects: [], sounds: [], effects: [...COMMON_SCRIPT_EFFECTS] };
    // The map whose sounds and effects the match has of its own: the base's, or a blank floor's library (`charMap`, the
    // archive the match plays on: `composeGround`'s `groundMap`).
    const home = scriptHome();
    const own = ownLists();
    const change = (field: string, fn: (sc: EditorScript) => void): void => {
      personEdit('placement.set', { ref, field: 'script', value: field }, (step) => {
        const before = selectionIds();
        fn(store.get(s) ?? sc);
        edit(before, step);
        refreshInspector();
      }, true);
    };
    // The objects a step names: the layout's own first, then the map's; their values `piece:i`, `barrier:i`, `gate:i`, `map:path`.
    const modelOf = (r: Object3D): string => { const id = parseAssetId(String(r.userData['forgePiece'] ?? '')); return id ? id.model : 'piece'; };
    const objectOptions: (readonly [string, string])[] = [
      ...own.pieces.map((r, i) => [`piece:${i}`, `Your prop ${i + 1} \u00b7 ${modelOf(r)}`] as const),
      ...own.barriers.map((r, i) => [`barrier:${i}`, `Your damage trigger ${i + 1} \u00b7 ${accessLabel(r)}`] as const),
      ...own.gates.map((r, i) => [`gate:${i}`, `Your gate ${i + 1} \u00b7 ${accessLabel(r)}`] as const),
      ...own.objects.map((r, i) => [`object:${i}`, `Your ${objectLabel(r)}`] as const),
      ...lib.objects.map((o) => [`map:${o.path}`, `Map \u00b7 ${o.label}`] as const),
    ];
    const valueOf = (t: EditorTarget | undefined): string => {
      if (!t) return '';
      if ('map' in t) return `map:${t.map}`;
      for (const [k, list] of [['piece', own.pieces], ['barrier', own.barriers], ['gate', own.gates], ['object', own.objects]] as const) { const i = list.indexOf(t.obj); if (i >= 0) return `${k}:${i}`; }
      return '';
    };
    const targetOf = (v: string): EditorTarget | undefined => {
      if (v.startsWith('map:')) return { map: v.slice(4) };
      const [k, i] = v.split(':');
      const obj = (k === 'piece' ? own.pieces : k === 'barrier' ? own.barriers : k === 'gate' ? own.gates : k === 'object' ? own.objects : [])[Number(i)];
      return obj ? { obj } : undefined;
    };
    const runOptions: (readonly [string, string])[] = [
      ...own.barriers.map((r, i) => [`barrier:${i}`, `Wreck your damage trigger ${i + 1} \u00b7 ${accessLabel(r)}`] as const),
      ...(baseMap ? mapActionTargets(baseMap) : []).map((a) => [`action:${a.valve}`, `Map action \u00b7 ${a.type || 'no prompt'} \u00b7 ${a.node} \u2192 ${a.anims[0] ?? ''}`] as const),
    ];
    const fresh = (kind: ScriptStep['do']): EditorStep => {
      switch (kind) {
        case 'run': { const first = runOptions[0]?.[0] ?? ''; return first.startsWith('barrier:') ? { do: 'run', run: own.barriers[Number(first.slice(8))]! } : { do: 'run', ...(first ? { action: first.slice(7) } : {}) }; }
        case 'show': case 'hide': { const t = targetOf(objectOptions[0]?.[0] ?? ''); return { do: kind, ...(t ? { target: t } : {}) }; }
        case 'wait': return { do: 'wait', seconds: 1 };
        case 'message': return { do: 'message', text: 'MESSAGE' };
        // A new sound or effect: the list's last one's map again (else the match's own map's first).
        case 'sound': { const last = [...sc.steps].reverse().find((x) => x.do === 'sound'); return last ? { do: 'sound', name: last.name, ...(last.from ? { from: last.from } : {}) } : { do: 'sound', name: lib.sounds[0] ?? '.EXP_1' }; }
        case 'effect': { const last = [...sc.steps].reverse().find((x) => x.do === 'effect'); return last ? { do: 'effect', name: last.name, ...(last.from ? { from: last.from } : {}) } : { do: 'effect', name: lib.effects[0] ?? 'fire_explode_med' }; }
        case 'set': return { do: 'set', flag: 'flag', value: 1 };
        case 'if': case 'elseif': return { do: kind, flag: 'flag', value: 1 };
        case 'loop': return { do: 'loop' };
        case 'blast': return { do: 'blast' };
        default: return { do: kind };
      }
    };
    const list = (title: string): void => {
      const steps = sc.steps;
      out.push({ label: title, kind: 'select', value: '', options: [['', steps.length ? `${steps.length} step${steps.length === 1 ? '' : 's'}` : 'No steps yet']], disabled: true, set: () => undefined,
        gap: true, stepsStart: true,
        title: "Run top to bottom, as the game runs its own programs' commands. A ~ sound loops at its place from the start (the game's rule)" });
      const at = (fn: (l: EditorStep[]) => void) => (x: EditorScript): void => { fn(x.steps); };
      let depth = 0;
      steps.forEach((st, k) => {
        // Its number, indented a dot a block it stands in (an else if or an else at its if's own depth).
        if (st.do === 'endWhile' || st.do === 'end') depth = Math.max(0, depth - 1);
        const inner = st.do === 'elseif' || st.do === 'else' ? Math.max(0, depth - 1) : depth;
        const n = `${'\u00b7 '.repeat(inner)}${k + 1}`;
        if (st.do === 'while' || st.do === 'if') depth++;
        out.push({ label: `${n}.`, kind: 'select', value: st.do, disabled: off, gap: true,
          options: [...STEP_KINDS, ...(k > 0 ? [['up', '\u2191 Move up'] as const] : []), ...(k < steps.length - 1 ? [['down', '\u2193 Move down'] as const] : []), ['remove', '\u2715 Remove'] as const],
          title: 'What this step does; Move up, Move down or Remove (a While or an If is removed with its End, Else if and Otherwise)', set: (v) => change('step', at((l) => {
            if (v === 'remove') { for (const j of scriptBlock(l, k).sort((a, b) => b - a)) l.splice(j, 1); }
            else if (v === 'up' || v === 'down') { const to = v === 'up' ? k - 1 : k + 1; const [x] = l.splice(k, 1); l.splice(to, 0, x!); }
            else if (v !== st.do) l[k] = fresh(v as ScriptStep['do']);
          })) });
        const field = (label: string, ed: Omit<InspectorEditor, 'label' | 'disabled'>): void => { out.push({ ...ed, label: `${n}. ${label}`, disabled: off }); };
        const objectField = (label: string, key: 'target' | 'at', none: string | null): void => field(label, {
          kind: 'select', value: valueOf(st[key]), options: [...(none ? [['', none] as const] : []), ...objectOptions],
          title: 'Your props, damage triggers and gates, then the map\'s own objects', set: (v) => change(key, at((l) => { const t = targetOf(String(v)); l[k] = { ...l[k]!, ...(t ? { [key]: t } : {}) }; if (!t) delete l[k]![key]; })),
        });
        switch (st.do) {
          case 'run': field('Action', { kind: 'select', value: st.run ? `barrier:${own.barriers.indexOf(st.run)}` : st.action ? `action:${st.action}` : '', options: runOptions,
            title: "Your damage trigger's wreck, or one of the map's own actions -- run as the disc runs one (EXECUTE_ACTION)",
            set: (v) => change('run', at((l) => { const p = String(v); l[k] = p.startsWith('barrier:') ? { do: 'run', run: own.barriers[Number(p.slice(8))]! } : { do: 'run', action: p.slice(7) }; })) }); break;
          case 'show': case 'hide': objectField('Object', 'target', null); break;
          case 'wait':
            field('Seconds', { kind: 'number', value: st.seconds ?? 0, title: `How long before the next step (up to ${SWITCH_WAIT_MAX})`, set: (v) => change('seconds', at((l) => { l[k] = { ...l[k]!, seconds: Number(v) }; })) });
            field('Random +', { kind: 'number', value: st.random ?? 0, title: "Up to this many seconds more, at random each time (WAIT's random range)",
              set: (v) => change('random', at((l) => { const x = Number(v); const next = { ...l[k]! }; if (!Number.isFinite(x) || x <= 0) delete next.random; else next.random = x; l[k] = next; })) });
            break;
          case 'loop': {
            const how = st.times !== undefined ? 'times' : st.seconds !== undefined ? 'seconds' : 'ever';
            field('Until', { kind: 'select', value: how,
              options: [['ever', 'For ever (LOOP -1)'] as const, ['times', 'A number of runs'] as const, ['seconds', 'A time'] as const],
              title: 'LOOP runs the script again from its first step: for ever, until it has run so many times, or until so many seconds have passed',
              set: (v) => change('loop', at((l) => { l[k] = v === 'times' ? { do: 'loop', times: 2 } : v === 'seconds' ? { do: 'loop', seconds: 30 } : { do: 'loop' }; })) });
            if (st.times !== undefined) field('Runs', { kind: 'number', value: st.times, title: `How many times the script runs in all (1 to ${AUDIO_LOOP_MAX})`, set: (v) => change('times', at((l) => { l[k] = { do: 'loop', times: Number(v) }; })) });
            if (st.seconds !== undefined) field('Seconds', { kind: 'number', value: st.seconds, title: 'How long it keeps running again', set: (v) => change('seconds', at((l) => { l[k] = { do: 'loop', seconds: Number(v) }; })) });
            break;
          }
          case 'message':
            field('Text', { kind: 'text', value: st.text ?? '', title: 'Posted on the message window, as the round start\'s (80 letters)', set: (v) => change('text', at((l) => { l[k] = { ...l[k]!, text: String(v) }; })) });
            break;
          case 'sound': case 'effect': {
            // From any disc map (the owner, 2026-11-10: "all sounds/effects from all maps"; `./scriptAssets`): the map
            // first, every one with its count (`mapChoices`), then that map's names -- the base's own at once, another's
            // once read (the census's list). Another map's is lent into the match (`lentScriptAssets`).
            const kind = st.do;
            // Two categories before the maps (the owner, 2026-11-10): the guns' sounds ("move all the gun sounds to a separate
            // category", `weaponSoundsNow`) and what every map has ("move all the common sounds/effects across all the maps
            // into a single category", `scriptCommonNow`). Every map holds either, so one of them keeps no `from`: it plays
            // out of the match's own map. A map then lists only what is not common.
            const guns = kind === 'sound' ? weaponSoundsNow() : null;
            const common = scriptCommonNow();
            const commonNames = common ? (kind === 'sound' ? common.sounds : common.effects) : null;
            const category = !st.from && st.name
              ? (guns?.some((g) => g.name === st.name) ? WEAPONS_CATEGORY : commonNames?.includes(st.name) ? COMMON_CATEGORY : null) : null;
            const from = category ?? st.from ?? home;
            const key = `${ref}:steps:${k}`;
            const pending = stepPending.get(key);
            // Each `[name, label]`: a gun's with its weapon; the base's own whole list once read, its programs' meanwhile.
            const names: readonly (readonly [string, string])[] | null = pending ? null
              : from === WEAPONS_CATEGORY ? guns?.map((g) => [g.name, `${g.name} \u00b7 ${g.weapon} ${g.kind}`] as const) ?? null
              : from === COMMON_CATEGORY ? commonNames?.map((n) => [n, n] as const) ?? null
              : copyList(kind, from) ?? (from === home ? (kind === 'sound' ? lib.sounds : lib.effects).map((n) => [n, n] as const) : null);
            const counted = (n: number | undefined, words: string): string => (n === undefined ? 'loading\u2026' : `${n} ${words}`);
            const categories: (readonly [string, string, boolean])[] = [
              ...(kind === 'sound' ? [[WEAPONS_CATEGORY, `Weapons \u00b7 ${counted(guns?.length, 'gun sounds')}, on every map`, false] as const] : []),
              [COMMON_CATEGORY, `Common \u00b7 ${counted(commonNames?.length, kind === 'sound' ? 'sounds' : 'effects')} every map has`, false] as const,
            ];
            const mapNow = pending && !pending.startsWith('*') ? pending : from.startsWith('*') ? home : from;
            if (home) field('From', { kind: 'select', value: pending ?? from, options: groupedMaps([...categories, ...mapChoices(kind, mapNow)]),
              title: kind === 'sound' ? "Weapons, Common (what every map has) or a disc map's own: another map's is lent into the match out of that map's banks"
                : "Common (what every map has) or a disc map's own: another map's is lent into the match out of that map's effect sets",
              set: (v) => {
                const stem = String(v);
                if (stem === from) return;
                stepPending.set(key, stem);
                refreshInspector();
                const first: Promise<string | null> = stem === WEAPONS_CATEGORY ? archives.weaponSounds().then((l) => l[0]?.name ?? null)
                  : stem === COMMON_CATEGORY ? scriptCommonRead().then((c) => (kind === 'sound' ? c.sounds : c.effects)[0] ?? null)
                  : archives.scriptNames(stem).then((n) => {
                    const list = (n?.[kind === 'sound' ? 'sounds' : 'effects'] ?? []).filter((x) => !commonNames?.includes(x));
                    return list[0] ?? (stem === home ? (kind === 'sound' ? lib.sounds : lib.effects)[0] ?? null : null);
                  });
                void first.then((name) => {
                  if (name === null) { notifier.refused(`${stem.startsWith('*') ? 'that category' : stem} has no ${kind} to play`); return; }
                  change('from', at((l) => { const next: EditorStep = { ...l[k]!, name, from: stem }; if (stem === home || stem.startsWith('*')) delete next.from; l[k] = next; }));
                }).finally(() => { stepPending.delete(key); refreshInspector(); });
              } });
            field(kind === 'sound' ? 'Sound' : 'Effect', { kind: 'select', value: names ? st.name ?? '' : '',
              options: !names ? [['', pending ? `(reading ${pending === WEAPONS_CATEGORY ? 'the weapons' : pending === COMMON_CATEGORY ? 'every map' : pending}...)` : `${st.name ?? ''} (reading the maps...)`] as const]
                : st.name && !names.some(([n]) => n === st.name) ? [[st.name, st.name] as const, ...names] : names,
              title: kind === 'sound' ? "The category's or the map's sounds" : "The category's or the map's effects (those that draw where they are called)",
              set: (v) => { if (v) change('name', at((l) => { l[k] = { ...l[k]!, name: String(v) }; })); } });
            if (kind === 'sound') {
              field('Volume', { kind: 'number', value: st.volume ?? 1,
                title: `The command's volume (SOUND's flag 0x10): 1 the sound's own level, 0 silent, up to ${AUDIO_VOLUME_MAX} (the maps' fires play at 3)`,
                set: (v) => change('volume', at((l) => { const x = Number(v); const next = { ...l[k]! }; if (!Number.isFinite(x) || x === 1) delete next.volume; else next.volume = x; l[k] = next; })) });
              const fromNow = st.from ?? home;
              if (st.name && fromNow && !fromNow.startsWith('*')) out.push({ ...previewSoundButton(fromNow, st.name), label: `${n}. Hear`, disabled: false });
            }
            objectField('At', 'at', opts.self ?? (opts.death ? 'The prop' : 'The switch'));
            break;
          }
          case 'blast':
            // MPBOMB's blast at its place, as Crossroads' bridges fire theirs (`./placedAccess` `SCRIPT_BLAST_WEAPON`): the
            // record's own Explosion_Damage 50 and radius 300 u, blocked by cover, its look the satchel's. Nothing to set.
            objectField('At', 'at', opts.self ?? (opts.death ? 'The prop' : 'The switch'));
            out.push({ label: `${n}. Blast`, kind: 'select', value: '', disabled: true, set: () => undefined,
              options: [['', `The bomb's: damage ${SCRIPT_BLAST_DAMAGE}, radius ${SCRIPT_BLAST_RADIUS} u (${SCRIPT_BLAST_RADIUS / 10} m), cover blocks it`] as const],
              title: "FIRE_WEAPON of MPBOMB / MPBOMB Ammo, as Crossroads' bridges and the planted bomb fire it: its fragments on every player within the radius whose head it sees. Set At on a bare place (an ambient, a map node) rather than inside a solid object" });
            break;
          case 'if': case 'elseif': {
            // On a flag (VALVE ==) or on a chance (RANDOM_WEIGHT).
            const chance = st.chance !== undefined;
            field('Test', { kind: 'select', value: chance ? 'chance' : 'flag', options: [['flag', 'A flag is'] as const, ['chance', 'A random chance'] as const],
              title: "A flag's value (every script of the layout shares its flags), or a random chance each time it runs (RANDOM_WEIGHT)",
              set: (v) => change('test', at((l) => { l[k] = v === 'chance' ? { do: st.do, chance: 0.5 } : { do: st.do, flag: 'flag', value: 1 }; })) });
            if (chance) {
              field('Chance %', { kind: 'number', value: Math.round((st.chance ?? 0) * 1000) / 10, title: 'Taken this often (rand() <= the chance); else on to the next Else if, Otherwise or End if',
                set: (v) => change('chance', at((l) => { const x = Number(v); l[k] = { ...l[k]!, chance: Number.isFinite(x) ? Math.min(1, Math.max(0, x / 100)) : 0.5 }; })) });
              break;
            }
            field('Flag', { kind: 'text', value: st.flag ?? '', title: 'A name every script of the layout shares (letters, digits, _)', set: (v) => change('flag', at((l) => { l[k] = { ...l[k]!, flag: String(v).trim() }; })) });
            field('Is', { kind: 'number', value: st.value ?? 0, title: 'The steps up to the next Else if, Otherwise or End if run when the flag is this', set: (v) => change('value', at((l) => { l[k] = { ...l[k]!, value: Number(v) }; })) });
            break;
          }
          case 'set':
            field('Flag', { kind: 'text', value: st.flag ?? '', title: 'A name every script of the layout shares (letters, digits, _)', set: (v) => change('flag', at((l) => { l[k] = { ...l[k]!, flag: String(v).trim() }; })) });
            field('To', { kind: 'number', value: st.value ?? 0, title: 'The flag set to this (0 to 9999); every flag starts each round at 0', set: (v) => change('value', at((l) => { l[k] = { ...l[k]!, value: Number(v) }; })) });
            break;
          default: break;
        }
      });
      out.push({ label: 'Add a step', kind: 'select', value: '', disabled: off, gap: true,
        options: [['', '+ Add a step\u2026'] as const, ...ADD_KINDS],
        title: 'A step at the end of the script (a While comes with its End while, an If with its End if)',
        set: (v) => { if (v) change('add', at((l) => { l.push(fresh(v as ScriptStep['do'])); if (v === 'while') l.push({ do: 'endWhile' }); if (v === 'if') l.push({ do: 'end' }); })); } });
    };
    if (opts.title) { list(opts.title); return; }
    // A damage trigger's death: one list, run once (its prop hidden first: `withPlacedAccess`).
    if (opts.death) { list('When destroyed'); return; }
    list('When pulled (once a round)');
  }
  /** An ambient's program's own sounds as script steps (`scriptOfProgram`), once its map is read; null till then. */
  const programScriptNow = (o: ForgeObjectData): { steps: ScriptStep[]; whole: boolean } | null => {
    const lib = hostageLibNow(o.source);
    const program = lib?.meta?.scene?.programs.find((p) => p.program.name.toLowerCase() === o.name.toLowerCase())?.program;
    return program ? scriptOfProgram(program, o.source) : null;
  };
  /** The Damage trigger's Map choice's Custom (`triggerEditors`): no map's stem, never written to a file. */
  const CUSTOM_TRIGGER = '*custom';
  /** A satchel's numbers (C4): Vigilance's access1's record (`DEFAULT_BARRIER`), read off the disc; null where it is not on it. */
  const c4TriggerStats = async (): Promise<{ health: number; armor: number; shield: number } | null> => {
    const tpl = await accessTemplate('barrier', DEFAULT_BARRIER.source, DEFAULT_BARRIER.name);
    const d = tpl?.destructibles.find((x) => x.root === tpl.root && x.health > 0) ?? tpl?.destructibles.find((x) => x.health > 0);
    return d ? { health: d.health, armor: d.armor, shield: d.shield } : null;
  };
  /** A hit trigger's numbers (Any hit): health 0, a plank's rule (`FUN_00273a50`: any hit whose rating reaches its shield). */
  const HIT_TRIGGER_STATS = { health: 0, armor: 0, shield: 0 } as const;
  /** `next` in `old`'s place among the placements (its place, turn, scale and lock kept): drawn, published and selected. */
  const swapRoot = (old: Object3D, next: Object3D): void => {
    next.position.copy(old.position);
    next.quaternion.copy(old.quaternion);
    if (old.userData['forgePiece'] && next.userData['forgePiece']) next.scale.copy(old.scale);
    if (old.userData['forgeLock']) next.userData['forgeLock'] = true;
    const at = roots.indexOf(old);
    if (at >= 0) roots[at] = next; else roots.push(next);
    scene.remove(old);
    (old.userData['dispose'] as (() => void) | undefined)?.();
    scene.add(next);
    publishCreatorPiece(next);
    applyGizmoDepth();
    select(next);
  };
  /**
   * The Damage trigger's Map choice's Custom (`triggerEditors`): the placed disc trigger becomes a custom one in its place,
   * that trigger's own numbers where it takes a satchel, else a satchel's (`c4TriggerStats`), linked to nothing yet.
   */
  const customFromBarrier = (s: Object3D, ref: string): void => {
    const own = accessOwnOf(s);
    if (!own) return;
    void (async () => {
      const t = await accessTemplate('barrier', own.source, own.name);
      const d = t?.destructibles.find((x) => x.root === t.root && x.health > 0);
      const stats = d ? { health: d.health, armor: d.armor, shield: d.shield } : await c4TriggerStats() ?? { ...HIT_TRIGGER_STATS };
      const r = newTriggerMarker();
      personEdit('placement.set', { ref, field: 'trigger', value: 'custom' }, (step) => {
        const before = selectionIds();
        pieceTrigger.set(r, stats);
        triggerScript.set(r, { steps: [] });
        swapRoot(s, r);
        edit(before, step);
      }, true);
    })();
  };
  /**
   * A custom damage trigger's Inspector (`PieceTrigger`): its Map (Custom; a disc map's turns it back into that map's first
   * trigger), its Prop (one of yours or the map's, left as it is -- it must be solid to be struck), what sets it off -- C4 (a satchel planted
   * on it, `c4TriggerStats`) or Any hit (`HIT_TRIGGER_STATS`) -- its numbers, and what its death runs after the prop is
   * gone (`scriptEditors`' death form).
   */
  function triggerEditors(s: Object3D, ref: string, off: boolean, out: InspectorEditor[]): void {
    const t = pieceTrigger.get(s);
    if (!t) return;
    const setTrigger = (field: string, next: { health: number; armor: number; shield: number }): void => {
      personEdit('placement.set', { ref, field: 'trigger', value: field }, (step) => {
        const before = selectionIds();
        pieceTrigger.set(s, next);
        edit(before, step);
        refreshInspector();
      }, true);
    };
    const pending = copyPending.get(ref);
    out.push({ label: 'Source', kind: 'select', value: pending ?? CUSTOM_TRIGGER, covers: ['barrier.source'], disabled: off,
      options: groupedMaps([[CUSTOM_TRIGGER, 'Custom', false] as const, ...mapChoices('barrier', pending ?? '')]),
      title: "Custom: a prop you choose made a damage trigger; a disc map: that map's own trigger copied whole",
      set: (v) => {
        const stem = String(v);
        if (stem === CUSTOM_TRIGGER) return;
        // Back to a disc trigger: that map's first, in this one's place (its numbers and death steps let go).
        switchCopyMap(ref, 'barrier', stem, () => accessOf(stem).then((ts) => ts.find((x) => x.kind === 'barrier')?.name ?? null), async (name) => {
          const r = await newAccess('barrier', stem, name);
          personEdit('placement.set', { ref, field: 'trigger', value: 'disc' }, (step) => {
            const before = selectionIds();
            swapRoot(s, r);
            edit(before, step);
          }, true);
        });
      } });
    // Its prop (the owner, 2026-11-10: "specify a prop from the scene"; "keep the prop as it is and just link to the
    // prop"): one of your props, or one of the map's own objects -- never one another custom trigger links, nor one the
    // map's own triggers hold already. Its link line shows it (`syncSwitchLinks`).
    const own = ownLists();
    const link = triggerLink.get(s);
    const lib = baseMap ? scriptLibOf(baseMap) : { objects: [] as { path: string; label: string }[], polys: [] as WorldPoly[] };
    const discTargets = baseMap?.meta?.scene?.destructibles.map((d) => d.targetPath) ?? [];
    const others = roots.filter((x) => x !== s && x.userData['forgeTrigger']).map((x) => triggerLink.get(x));
    const modelOfPiece = (x: Object3D): string => parseAssetId(String(x.userData['forgePiece'] ?? ''))?.model ?? 'prop';
    const linkValue = typeof link === 'string' ? `map:${link}` : link && own.pieces.includes(link) ? `piece:${own.pieces.indexOf(link)}` : '';
    out.push({ label: 'Prop', kind: 'select', value: linkValue, disabled: off,
      options: [['', 'Not linked yet'] as const,
        ...own.pieces.flatMap((x, i) => (others.includes(x) ? [] : [[`piece:${i}`, `Your prop ${i + 1} \u00b7 ${modelOfPiece(x)}`] as const])),
        ...lib.objects.filter((o) => !others.includes(o.path) && !discTargets.some((d) => mapUnder(d, o.path) || mapUnder(o.path, d)))
          .map((o) => [`map:${o.path}`, `Map \u00b7 ${o.label}`] as const)],
      title: "The prop it is on, left as it is: its collision takes the satchel or the hit, and its death hides it. It must be solid to be struck",
      set: (v) => {
        const pick = String(v);
        const to = pick.startsWith('piece:') ? own.pieces[Number(pick.slice(6))] ?? null : pick.startsWith('map:') ? pick.slice(4) : null;
        if (to && typeof to !== 'string' && !to.userData['forgeHull']) notifier.notify(`${modelOfPiece(to)} has no collision of its own: nothing can strike it, so the match leaves this trigger out`);
        if (typeof to === 'string' && !lib.polys.some((q) => mapUnder(q.path, to))) notifier.notify(`${to.slice('worldmodel/'.length)} has no collision: nothing can strike it, so the match leaves this trigger out`);
        personEdit('placement.set', { ref, field: 'trigger', value: 'link' }, (step) => {
          const before = selectionIds();
          if (to) triggerLink.set(s, to); else triggerLink.delete(s);
          // The owner, 2026-11-10: the trigger moves to its prop's middle once linked -- a prop of yours by its drawn
          // bounds, a map object by its collision's middle (`targetPlace`, where its context action would be aimed).
          const mid = typeof to === 'string' ? targetPlace({ map: to })
            : to ? (() => { to.updateMatrixWorld(true); const b = new Box3().setFromObject(to); return b.isEmpty() ? null : b.getCenter(new Vector3()).toArray() as [number, number, number]; })() : null;
          if (mid) s.position.set(mid[0], mid[1], mid[2]);
          edit(before, step);
          refreshInspector();
        }, true);
      } });
    out.push({ label: 'Set off by', kind: 'select', value: t.health > 0 ? 'c4' : 'hit', disabled: off,
      options: [['c4', 'C4 (plant a satchel on it)'] as const, ['hit', 'Any hit (shoot or blast it)'] as const],
      title: "C4 takes a satchel planted on it, as the disc's barriers do; Any hit dies to the first round or blast that reaches its shield, as a plank does",
      set: (v) => {
        if (v === 'hit') { setTrigger('hit', { ...HIT_TRIGGER_STATS }); return; }
        void c4TriggerStats().then((st) => {
          if (!st) { notifier.refused(`no C4 barrier to take a satchel's numbers from (${DEFAULT_BARRIER.source} ${DEFAULT_BARRIER.name} is not on this disc)`); return; }
          setTrigger('c4', st);
        });
      } });
    const stat = (label: string, key: 'health' | 'armor' | 'shield', title: string): void => {
      out.push({ label, kind: 'number', value: t[key], disabled: off, title,
        set: (v) => { const n = Math.min(TRIGGER_STAT_MAX, Math.max(0, Number(v) || 0)); if (n !== t[key]) setTrigger(key, { ...t, [key]: n }); } });
    };
    stat('Health', 'health', 'Damage it takes before it dies; 0: any hit that reaches its shield kills it (and it never takes a satchel)');
    stat('Armour', 'armor', 'Soaks damage before its health (the disc records\' armour)');
    stat('Shield', 'shield', 'The least damage a hit or a satchel must carry to count at all');
    scriptEditors(s, ref, triggerScript.get(s) ?? { steps: [] }, off, out, { store: triggerScript, death: true });
  }
  /**
   * An asset tile dropped on the selection's Source or its object row (the owner, 2026-11-13: "drag and drop assets from
   * the asset browser into the inspector ... It should automatically adjust the source from the asset"; a browser
   * adaptation): the tile's map and its object taken at once, as choosing both there would -- a door's, a turret's, a
   * flare's, a gate's, a damage trigger's (a custom one made that disc one again), a ladder's, a switch's look, a
   * program's (a sound's or an effect's tile its scripted one). One of another kind is refused (the row takes no drop).
   */
  const assetDropPlan = (s: Object3D, asset: string): (() => void) | null => {
    const ref = selectionIds()[0];
    if (!ref || editsLocked() || lockedOf(s)) return null;
    const copy = (stem: string, name: string): void => {
      copyPending.set(ref, stem);
      refreshInspector();
      void entityEdit('placement.set', { ref, field: 'model', value: `${stem}:${name}` }).finally(() => { copyPending.delete(ref); refreshInspector(); });
    };
    const o = parseObjectAsset(asset);
    if (!o) {
      // A ladder's tile is its prop's own id; taken only from the Ladder tab, onto a ladder.
      const p = parseAssetId(asset);
      if (p && objectTab === 'ladder' && s.userData['forgeLadder']) return () => copy(p.archive, p.model);
      return p && objectTab === 'props' && s.userData['forgePiece'] && !s.userData['forgeLadder'] ? () => copy(p.archive, p.model) : null;
    }
    const sameCopy = (kind: string): boolean =>
      (kind === 'door' && !!s.userData['forgeDoor']) || (kind === 'turret' && !!s.userData['forgeTurret'])
      || (kind === 'flare' && !!s.userData['forgeFlare']) || ((kind === 'gate' || kind === 'barrier') && accessOwnOf(s)?.kind === kind);
    if (sameCopy(o.kind)) return () => copy(o.source, o.name);
    if (o.kind === 'barrier' && pieceTrigger.has(s)) {
      // A custom trigger made that disc trigger again (its numbers and death steps let go), as its Source does.
      return () => {
        copyPending.set(ref, o.source);
        refreshInspector();
        void newAccess('barrier', o.source, o.name).then((r) => {
          personEdit('placement.set', { ref, field: 'trigger', value: 'disc' }, (step) => {
            const before = selectionIds();
            swapRoot(s, r);
            edit(before, step);
          }, true);
        }).finally(() => { copyPending.delete(ref); refreshInspector(); });
      };
    }
    if (o.kind === 'switch' && s.userData['forgeSwitch']) {
      // Its look's map chosen in its Source (each map one switch: the look follows).
      const radioHome = RADIO_LOOK_SOURCES.find((m) => !absent.has(m)) ?? RADIO_LOOK_SOURCES[0];
      const home = o.name === 'radio' ? radioHome : DEFAULT_GATE.source;
      return () => inspectorEditors().find((e) => e.label === 'Source' && e.covers?.includes('switch.look'))?.set(home);
    }
    const fobj = objectOf(s);
    if (o.kind === 'ambient' && fobj) {
      return () => {
        const next: ForgeObjectData = { kind: 'ambient', source: o.source, name: o.name };
        personEdit('placement.set', { ref, field: 'model', value: o.name }, (step) => {
          const before = selectionIds();
          swapRoot(s, newForgeObject(next));
          edit(before, step);
          refreshInspector();
        }, true);
      };
    }
    return null;
  };
  /** The asset browser's tab of a selection's kind (the mini browser's, `openAssetPicker`); null for one it has none of. */
  const pickTabOf = (s: Object3D): ObjectTab | null => {
    if (s.userData['forgeDoor']) return 'door';
    if (s.userData['forgeTurret']) return 'turret';
    if (s.userData['forgeFlare']) return 'flare';
    if (s.userData['forgeLadder']) return 'ladder';
    const access = accessOwnOf(s);
    if (access) return access.kind;
    if (pieceTrigger.has(s)) return 'barrier';
    if (s.userData['forgeSwitch']) return 'switch';
    if (objectOf(s)) return 'ambient';
    if (s.userData['forgePiece']) return 'props';
    return null;
  };
  /**
   * The mini asset browser (the owner, 2026-11-13: "opens a mini popup asset browser filtered to that item type, where I
   * can pick and browse for my asset ... the same as the asset browser, but without the tabs"; a browser adaptation): the
   * asset browser itself, lent to a popup by the row -- its tab the row's kind, its tabs hidden, its Source the object's
   * -- a tile's click taken by the object as its drop is (`assetDropPlan`). Closed (a pick, Escape, a click outside, its
   * x), the browser goes back to its panel as it was: its tab, its Source, its search, its filter.
   */
  /** The mini browser's size as last left (its corner dragged), for the next one opened this session. */
  let assetPickSize: { w: number; h: number } | null = null;
  let assetPick: {
    s: Object3D; popup: HTMLDivElement; home: HTMLElement | null; ghost: HTMLElement | null; scroll: number;
    tab: ObjectTab; source: string; query: string; filter: AssetFilter; chars: boolean;
    off: () => void;
  } | null = null;
  const closeAssetPicker = (): void => {
    const p = assetPick;
    if (!p) return;
    assetPick = null;
    p.off();
    assetPickSize = { w: p.popup.offsetWidth, h: p.popup.offsetHeight };
    assetsSurface.classList.remove('is-picking');
    // Back in its panel, where its still copy stood.
    if (p.ghost?.isConnected) p.ghost.replaceWith(assetsSurface);
    else if (p.home?.isConnected) p.home.append(assetsSurface);
    else assetsSurface.remove();
    p.ghost?.remove();
    p.popup.remove();
    objectTab = p.tab; showChars = p.chars; search.value = p.query; filter = p.filter;
    if (paletteSel.value !== p.source && Array.from(paletteSel.options).some((o) => o.value === p.source)) {
      paletteSel.value = p.source;
      paletteSel.dispatchEvent(new Event('change'));
    } else drawAssets();
    list.scrollTop = p.scroll;
  };
  /**
   * The asset browser as its panel shows it, a still copy (the owner, 2026-11-13: "the asset browser content on the dock
   * window gets hidden ... it should not"): left in the panel while the browser itself is lent to the mini browser --
   * its fields' values, its list's scroll and its thumbnails as they were, inert (a press on it closes the mini browser,
   * the browser back in its place).
   */
  const assetsGhost = (): HTMLElement => {
    const ghost = assetsSurface.cloneNode(true) as HTMLElement;
    ghost.classList.add('fx-assets-ghost');
    ghost.inert = true;
    ghost.setAttribute('aria-hidden', 'true');
    for (const x of [ghost, ...Array.from(ghost.querySelectorAll<HTMLElement>('[id]'))]) x.removeAttribute('id');
    // A field's live value is not its markup's: each copied by its place.
    const from = Array.from(assetsSurface.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select'));
    const to = Array.from(ghost.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select'));
    from.forEach((f, i) => {
      const t = to[i];
      if (!t) return;
      if (f instanceof HTMLInputElement && t instanceof HTMLInputElement && (f.type === 'checkbox' || f.type === 'radio')) t.checked = f.checked;
      else t.value = f.value;
    });
    return ghost;
  };
  const openAssetPicker = (s: Object3D, tab: ObjectTab, source: string, anchor: HTMLElement): void => {
    closeAssetPicker();
    const popup = el(doc, 'div', 'fx-asset-picker');
    popup.setAttribute('role', 'dialog');
    const word = OBJECT_TABS.find(([k]) => k === tab)?.[1] ?? 'Assets';
    popup.setAttribute('aria-label', `Choose ${tabWords(word)}`);
    const head = el(doc, 'div', 'fx-asset-picker-head');
    const close = el(doc, 'button', 'fx-tool fx-asset-picker-close', '\u2715');
    close.type = 'button';
    close.title = 'Close';
    close.setAttribute('aria-label', 'Close');
    head.append(el(doc, 'span', '', tabWords(word)), close);
    const home = assetsSurface.parentElement;
    const scroll = list.scrollTop;
    const ghost = home ? assetsGhost() : null;
    if (ghost) home!.insertBefore(ghost, assetsSurface);
    popup.append(head, assetsSurface);
    const ghostList = ghost?.querySelector<HTMLElement>('.fx-assets');
    if (ghostList) ghostList.scrollTop = scroll;
    assetsSurface.classList.add('is-picking');
    if (assetPickSize) { popup.style.width = `${assetPickSize.w}px`; popup.style.height = `${assetPickSize.h}px`; }
    doc.body.append(popup);
    // At the Inspector's left (the owner, 2026-11-13: "place it the left side of the inspector"), level with the row;
    // inside the window (its right where the Inspector is docked left).
    const r = anchor.getBoundingClientRect();
    const panel = (anchor.closest('.fx-inspector') ?? anchor).getBoundingClientRect();
    const win = doc.defaultView;
    const vw = win?.innerWidth ?? 1280, vh = win?.innerHeight ?? 800;
    const w = popup.offsetWidth, h = popup.offsetHeight;
    const left = panel.left - w - 8 >= 8 ? panel.left - w - 8 : Math.min(vw - w - 8, panel.right + 8);
    popup.style.left = `${Math.max(8, left)}px`;
    popup.style.top = `${Math.max(8, Math.min(vh - h - 8, r.top - 40))}px`;
    // Moved by its head (its close button aside), kept inside the window.
    head.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
      e.preventDefault();
      head.setPointerCapture(e.pointerId);
      const sx = e.clientX - popup.offsetLeft, sy = e.clientY - popup.offsetTop;
      const move = (m: PointerEvent): void => {
        const vw2 = win?.innerWidth ?? 1280, vh2 = win?.innerHeight ?? 800;
        popup.style.left = `${Math.max(0, Math.min(vw2 - 60, m.clientX - sx))}px`;
        popup.style.top = `${Math.max(0, Math.min(vh2 - 30, m.clientY - sy))}px`;
      };
      const up = (): void => { head.removeEventListener('pointermove', move); head.removeEventListener('pointerup', up); head.removeEventListener('pointercancel', up); };
      head.addEventListener('pointermove', move);
      head.addEventListener('pointerup', up);
      head.addEventListener('pointercancel', up);
    });
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); closeAssetPicker(); } };
    const onDown = (e: PointerEvent): void => {
      const t = e.target as Node | null;
      // A click in the popup, or in a list the browser opened (its Source's own options, its view popup), stays.
      if (t && (popup.contains(t) || anchor.contains(t))) return;
      closeAssetPicker();
    };
    doc.addEventListener('keydown', onKey, true);
    doc.addEventListener('pointerdown', onDown, true);
    close.addEventListener('click', () => closeAssetPicker());
    assetPick = {
      s, popup, home, ghost, scroll, tab: objectTab, source: paletteSel.value, query: search.value, filter, chars: showChars,
      off: () => { doc.removeEventListener('keydown', onKey, true); doc.removeEventListener('pointerdown', onDown, true); },
    };
    objectTab = tab; showChars = false; search.value = ''; filter = 'all';
    // Its Source the object's own map where the browser lists it (Custom, or a map not listed: as it is).
    if (source && paletteSel.value !== source && Array.from(paletteSel.options).some((o) => o.value === source)) {
      paletteSel.value = source;
      paletteSel.dispatchEvent(new Event('change'));
    } else drawAssets();
    search.focus();
  };
  /** A tile chosen in the mini browser: taken by its object as a drop is, the popup closed. */
  const pickFromBrowser = (asset: string): void => {
    const p = assetPick;
    if (!p) return;
    // Read while the picker's tab is the browser's; its object gone meanwhile (deleted, undone), nothing taken.
    const plan = roots.includes(p.s) ? assetDropPlan(p.s, asset) : null;
    closeAssetPicker();
    if (plan) plan(); else notifier.refused('That asset cannot go on this object');
  };
  /** The object rows next to a Source that take a tile too (`assetDropPlan`). */
  const OBJECT_ROW_LABELS = new Set(['Door', 'Turret', 'Ladder', 'Flare', 'Gate', 'Damage Trigger', 'Trigger', 'Program']);
  const withAssetDrop = (editors: InspectorEditor[]): InspectorEditor[] => {
    const s = isGroup() || baseSelected ? null : selected;
    if (!s) return editors;
    const drop = {
      accepts: (): boolean => { const a = assetTiles?.dragAsset(); return !!a && assetDropPlan(s, a) !== null; },
      take: (): void => { const a = assetTiles?.dragAsset(); const plan = a ? assetDropPlan(s, a) : null; plan?.(); },
    };
    const owner = selectionIds()[0] ?? '';
    const tab = pickTabOf(s);
    const source = String(editors.find((e) => e.label === 'Source')?.value ?? '');
    const word = OBJECT_TABS.find(([k]) => k === tab)?.[1] ?? 'asset';
    // The browse button on the object row (the owner, 2026-11-13: "not on the source row ... on the second row").
    const browse = tab ? { icon: icon('panelAssets'), title: `Browse ${tabWords(word)}`, disabled: editsLocked() || lockedOf(s),
      open: (anchor: HTMLElement) => openAssetPicker(s, tab, source, anchor) } : undefined;
    return editors.map((e, i) => {
      if (e.kind !== 'select') return e;
      const objectRow = !!e.covers?.includes('piece.model') || (OBJECT_ROW_LABELS.has(e.label) && editors[i - 1]?.label === 'Source');
      if (e.label === 'Source') return { ...e, drop, owner };
      return objectRow ? { ...e, drop, owner, ...(browse ? { browse } : {}) } : e;
    });
  };
  const inspectorEditors = (): InspectorEditor[] => {
    const s = isGroup() || baseSelected ? null : selected;
    // A map's own ambient effect (Map Data's Ambient Effects; the owner, 2026-11-10: "add play/pause to map data ambient
    // objects"): its sounds played and stopped here, as a placed one's (`previewAmbientSound`), with what it is.
    if (!s && mapDataSelected?.kind === 'ambients' && baseMap) {
      const program = (mapDataSelected.data as { program?: string } | undefined)?.program;
      if (!program) return [];
      const fo: ForgeObjectData = { kind: 'ambient', source: baseMap.archive, name: program };
      const prog = ambientProgramNow(fo), heard = ambientSoundsOf(fo);
      const rows: InspectorEditor[] = [];
      const info = (label: string, text: string, title: string): void => {
        rows.push({ label, kind: 'select', value: 'x', disabled: true, options: [['x', text] as const], title, set: () => undefined });
      };
      if (prog) info('Does', [prog.particles ? 'particles' : '', prog.sound ? 'sound' : '', prog.light ? 'light' : ''].filter(Boolean).join(' + '), 'What its program runs');
      if (heard) for (const h of heard) info(h.name, `${(h.range[0] / 10).toFixed(1)} m full → ${(h.range[1] / 10).toFixed(1)} m silent · ${h.loop ? 'loop' : 'once'}`, "The sound's own RANGE (FUN_00342670) and whether it loops");
      if (!prog || prog.sound) {
        rows.push(ambientSoundButton(baseMap.archive, program));
      }
      return rows;
    }
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
      out.push({ label: 'Source', kind: 'select', value: from, covers: ['hostage.source'], disabled: off,
        options: groupedMaps(mapChoices('hostage', from)),
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
      out.push({ label: 'Hostage', kind: 'select', value: shown, covers: ['hostage.character'], disabled: off || listed.length === 0 || !theirs,
        options: pending ? [['', 'Loading…']] : !theirs ? [[shown, 'Loading…']] : listed.length ? listed.map((c) => [c, c] as const) : [['', 'No hostage characters on this map']],
        title: 'Its body: one of the hostage characters that map has', set: (v) => set('character')(lent ? `${own.source}:${String(v)}` : String(v)) });
    }
    const doorOwn = s.userData['forgeDoor'] as { source: string; name: string } | undefined;
    if (doorOwn) out.push(...copyEditors('door', ref, doorOwn, off, (v) => entityEdit('placement.set', { ref, field: 'model', value: v })));
    // A placed ladder: its Map and its Ladder, as a door's; either a change of the piece's asset (`placement.set` model).
    const ladderAsset = s.userData['forgeLadder'] ? parseAssetId(String(s.userData['forgePiece'] ?? '')) : null;
    // A placed prop: its Source and its Prop, as every copied object's (the owner, 2026-11-13: "add the Source/Prop drop
    // downs to inspector for props"): any map, each with its own props counted (one with none greyed), then that map's
    // props -- its own, then a shared library's (Common's) -- either a change of the piece's asset (`placement.set` model).
    const propAsset = !ladderAsset && s.userData['forgePiece'] ? parseAssetId(String(s.userData['forgePiece'])) : null;
    if (propAsset) {
      askCensus();
      const pending = copyPending.get(ref);
      const src = pending ?? propAsset.archive;
      const setModel = (v: string): Promise<void> => entityEdit('placement.set', { ref, field: 'model', value: v });
      const maps = copyMaps();
      const sourceRows = (maps.some(([m]) => m === src) ? maps : [[src, src] as const, ...maps]).map(([stem, name]) => {
        const n = absent.has(stem) ? 0 : ownPropCounts.get(stem);
        const note = n === undefined ? 'loading\u2026' : n === 0 ? 'none' : `${n} prop${n === 1 ? '' : 's'}`;
        return [stem, `${name} \u00b7 ${note}`, n === 0 && stem !== src] as const;
      });
      out.push({ label: 'Source', kind: 'select', value: src, covers: ['piece.source'], disabled: off, options: groupedMaps(sourceRows),
        title: 'The disc map whose prop it is',
        set: (v) => {
          const stem = String(v);
          copyPending.set(ref, stem);
          refreshInspector();
          // That map's first own prop (else its first): its own list read if it is not yet.
          void archives.props(stem).catch(() => null).then(async (props) => {
            if (props) mapPropLists.set(stem, props);
            const first = (props ?? []).find((x) => !x.shared) ?? props?.[0];
            if (!first) { notifier.refused(`${stem} has no prop to copy`); return; }
            await setModel(`${stem}:${first.model}`);
          }).finally(() => { copyPending.delete(ref); refreshInspector(); });
        } });
      const list = pending ? null : propListOf(propAsset.archive);
      const models = list
        ? [...list].sort((a, b) => Number(!!a.shared) - Number(!!b.shared) || a.model.localeCompare(b.model))
          .map((x) => [x.model, x.shared ? `${x.model} \u00b7 common` : x.model] as const)
        : null;
      out.push({ label: 'Prop', kind: 'select', value: pending ? '' : propAsset.model, covers: ['piece.model'], disabled: off || !models,
        options: pending ? [['', 'Loading\u2026']] : models ? (models.some(([m]) => m === propAsset.model) ? models : [...models, [propAsset.model, propAsset.model] as const]) : [[propAsset.model, 'Loading\u2026']],
        title: "The disc prop it is: its model and its collision",
        set: (v) => { void setModel(`${propAsset.archive}:${String(v)}`); } });
    }
    if (s.userData['forgeSwitch']) {
      // Its look and its record's own fields (the owner, 2026-11-08): each its action's own until set.
      const opts = switchOpts.get(s) ?? {};
      const ownRec = switchOwnRecord(s);
      const setOpt = (field: string, patch: (o: SwitchOpts) => SwitchOpts, rebuild = false, onProp = switchPropMode.has(s)) => {
        personEdit('placement.set', { ref, field, value: field }, (step) => {
          const before = selectionIds();
          const next = patch({ ...(switchOpts.get(s) ?? {}) });
          if (!rebuild) { switchOpts.set(s, next); addSwitchGuide(s); edit(before, step); refreshInspector(); return; }
          // A new look is a new model: the switch built anew in its place, its links and fields kept.
          void newSwitch(switchGate.get(s) ?? null, switchAction.get(s) ?? null, next, onProp).then((r) => {
            const sc = switchScript.get(s), link = switchLink.get(s);
            if (sc) switchScript.set(r, sc);
            if (onProp && link) switchLink.set(r, link);
            r.position.copy(s.position);
            r.quaternion.copy(s.quaternion);
            if (s.userData['forgeLock']) r.userData['forgeLock'] = true;
            const at = roots.indexOf(s);
            if (at >= 0) roots[at] = r; else roots.push(r);
            scene.remove(s);
            (s.userData['dispose'] as (() => void) | undefined)?.();
            scene.add(r);
            publishCreatorPiece(r);
            applyGizmoDepth();
            select(r);
            edit(before, step);
          });
        }, true);
      };
      const onProp = switchPropMode.has(s);
      // Its Source and its Trigger, as every copied object's (the owner, 2026-11-13: "consistent with the rest of the
      // objects. Source, Trigger ... not look"): Custom (a prop you link) or the map whose switch it copies -- the lever
      // panel Death Trap's gate's (`DEFAULT_GATE`), the radio Sujo's (`RADIO_LOOK_SOURCES`) -- then that map's switch.
      const radioHome = RADIO_LOOK_SOURCES.find((m) => !absent.has(m)) ?? RADIO_LOOK_SOURCES[0];
      const lookNow: SwitchLookId = opts.look ?? 'lever';
      const homeOf = (look: SwitchLookId): string => (look === 'radio' ? radioHome : DEFAULT_GATE.source);
      const sourceNow = onProp ? CUSTOM_TRIGGER : homeOf(lookNow);
      const switchMaps = copyMaps().map(([stem, name]) => {
        const n = paletteCountOf(stem, 'switch');
        const note = n === null ? 'loading…' : n === 0 ? 'none' : `${n} switch${n === 1 ? '' : 'es'}`;
        return [stem, `${name} · ${note}`, n === 0 && stem !== sourceNow] as const;
      });
      out.push({ label: 'Source', kind: 'select', value: sourceNow, covers: ['switch.look'], disabled: off,
        options: groupedMaps([[CUSTOM_TRIGGER, 'Custom', false] as const, ...switchMaps]),
        title: "Custom: a prop you link, which the pick lands on; a disc map: that map's own switch copied whole, its model and its collision",
        set: (v) => {
          const stem = String(v);
          if (stem === CUSTOM_TRIGGER) { if (!onProp) setOpt('look', (o) => o, true, true); return; }
          const look: SwitchLookId | null = stem === DEFAULT_GATE.source ? 'lever' : stem === radioHome ? 'radio' : null;
          if (!look) { notifier.refused(`${stem} has no switch to copy`); return; }
          setOpt('look', (o) => { const { look: _l, ...rest } = o; return look === 'lever' ? rest : { ...rest, look }; }, true, false);
        } });
      // Its Trigger: the chosen map's switch (Plate only, the lever's retired pick plate, offered only to a switch that has it).
      if (!onProp) {
        const looks = SWITCH_LOOK_TILES.filter(([l]) => homeOf(l) === sourceNow).map(([l, w]) => [l, w] as const);
        if (lookNow === 'plate') looks.push(['plate', 'Plate only (retired: use Custom)'] as const);
        out.push({ label: 'Trigger', kind: 'select', value: lookNow, covers: ['switch.look'], disabled: off || looks.length < 2,
          options: looks,
          title: "The disc switch it copies: its model and its collision (the pick lands on it)",
          set: (v) => setOpt('look', (o) => { const { look: _l, ...rest } = o; return v === 'lever' ? rest : { ...rest, look: v as Exclude<SwitchLookId, 'lever'> }; }, true, false) });
      }
      // Its prop (FORGE_SWITCH_PROP_ADAPTATION): used where it stands, the switch moved to its middle. Never a prop another switch
      // is on, nor a map object with an action of its own (a door, a disc switch: the pick would find that one).
      if (onProp) {
        const mapActionPaths = (baseMap?.meta?.actions ?? []).map((a) => a.path);
        const link = switchLink.get(s);
        out.push({ label: 'Prop', kind: 'select', value: propLinkValue(link), disabled: off,
          options: propLinkOptions(roots.filter((x) => x !== s && switchPropMode.has(x)).map((x) => switchLink.get(x)),
            (path) => mapActionPaths.some((a) => mapUnder(a, path) || mapUnder(path, a))),
          title: "The prop players use it on, left as it is: aiming at it shows the prompt (it must be solid). The switch moves to its middle",
          set: (v) => {
            const to = propLinkOf(String(v));
            personEdit('placement.set', { ref, field: 'switchProp', value: String(v) }, (step) => {
              const before = selectionIds();
              if (to) switchLink.set(s, to); else switchLink.delete(s);
              // The owner, 2026-11-10: the switch moves to its prop's middle once linked, as a custom damage trigger does.
              const mid = linkCentre(to ?? undefined);
              if (mid) s.position.set(mid[0], mid[1], mid[2]);
              switchLinksKey = '';
              edit(before, step);
              refreshInspector();
            }, true);
          } });
      }
      // What it runs (the owner, 2026-11-08): a placed gate (its lever), one of the base map's own actions (run as the
      // original's EXECUTE_ACTION runs one: `./placedAccess` `mapActionTargets`, `mapActionProgram`), or nothing.
      const gates = gateRootsNow();
      const linked = switchGate.get(s) ?? null;
      const ownAction = switchAction.get(s) ?? null;
      const targets = baseMap ? mapActionTargets(baseMap) : [];
      const ownScript = switchScript.get(s);
      const value = linked && gates.includes(linked) ? `gate:${gates.indexOf(linked)}` : ownScript ? 'script' : ownAction ? `action:${ownAction}` : 'none';
      const known = targets.some((a) => `action:${a.valve}` === value) || !ownAction;
      out.push({ label: 'Runs', kind: 'select', value, covers: ['switch.gate', 'switch.lever'], disabled: off,
        options: [['none', 'Nothing'] as const, ['script', 'A script (your own steps, below)'] as const,
          ...gates.map((g, i) => [`gate:${i}`, `Gate ${i + 1} \u00b7 ${accessLabel(g)}`] as const),
          ...targets.map((a) => [`action:${a.valve}`, `Map action \u00b7 ${a.type || 'no prompt'} \u00b7 ${a.node} \u2192 ${a.anims[0] ?? ''}`] as const),
          ...(known ? [] : [[value, `Map action \u00b7 ${ownAction} (not on this map)`, true] as const])],
        title: "A placed gate (its lever slides it), or one of the base map's own actions -- run as the disc runs it from a death or another program (EXECUTE_ACTION): its own program at its own place, refused while it runs or once used", set: (v) => {
          const pick = String(v);
          const gate = pick.startsWith('gate:') ? gates[Number(pick.slice(5))] ?? null : null;
          const action = pick.startsWith('action:') ? pick.slice(7) : null;
          personEdit('placement.set', { ref, field: 'runs', value: pick }, (step) => {
            const before = selectionIds();
            switchGate.set(s, gate);
            switchAction.set(s, action);
            addSwitchGuide(s);
            // A script chosen keeps the one it had (or starts empty); anything else lets it go.
            if (pick === 'script') { if (!switchScript.has(s)) switchScript.set(s, { steps: [] }); } else switchScript.delete(s);
            edit(before, step);
            refreshInspector();
          }, true);
        } });
      // Its script (the owner, 2026-11-08): a row a step -- what it does, then what on -- an Add row, the toggle's second
      // list, and whether it can be used again. Each change one edit.
      // Its prompt (the owner, 2026-11-13: removed, then "add back the switch.prompt dropdown"): its action's own until set.
      const ownWord = ownRec?.bitmap ? bitmapWords(ownRec.bitmap) : "the look's";
      out.push({ label: 'Prompt', kind: 'select', value: opts.prompt ?? '', covers: ['switch.prompt'], disabled: off,
        options: [['', `Its action's own (${ownWord})`] as const, ...[...new Set(Object.values(ACTION_ICONS))].map((b) => [b, bitmapWords(b)] as const)],
        title: "The HUD's prompt icon over it: its action's own, or any the HUD draws",
        set: (v) => setOpt('prompt', (o) => { const { prompt: _p, ...rest } = o; return v ? { ...rest, prompt: String(v) } : rest; }) });
      const num = (label: string, field: 'range' | 'elevation' | 'points', own: number | undefined, title: string): void => {
        // A scrub's live reach: the guide redrawn at the scrubbed value (no edit), as a plant site's.
        const preview = field === 'points' ? {} : { preview: (v: number | null): void => { addSwitchGuide(s, v === null ? undefined : { [field]: v }); } };
        out.push({ label, kind: 'number', value: opts[field] ?? own ?? 0, covers: [`switch.${field}`], disabled: off, ...preview,
          title: `${title} -- its action's own: ${own ?? '?'}${opts[field] !== undefined ? ' (set here)' : ''}`,
          set: (v) => setOpt(field, (o) => {
            const n = Number(v);
            const { [field]: _f, ...rest } = o;
            return Number.isFinite(n) && n !== own ? { ...rest, [field]: field === 'points' ? Math.max(0, Math.round(n)) : n } : rest;
          }) });
      };
      num('Reach', 'range', ownRec?.range, 'How near along the ground the player stands to use it, world units');
      num('Height reach', 'elevation', ownRec?.elevation, 'How near in height (-1: no height test)');
      num('Points', 'points', ownRec?.points, 'Points for the player who uses it, once a round');
      // Its steps last (the owner, 2026-11-13: "move the reach, height reach, points ... above the steps").
      if (ownScript) scriptEditors(s, ref, ownScript, off, out);
    }
    if (pieceTrigger.has(s)) triggerEditors(s, ref, off, out);
    const accessOwn = accessOwnOf(s);
    if (accessOwn) out.push(...copyEditors(accessOwn.kind, ref, accessOwn, off, (v) => entityEdit('placement.set', { ref, field: 'model', value: v }),
      accessOwn.kind === 'barrier' ? () => customFromBarrier(s, ref) : undefined));
    if (ladderAsset) out.push(...copyEditors('ladder', ref, { source: ladderAsset.archive, name: ladderAsset.model }, off, (v) => entityEdit('placement.set', { ref, field: 'model', value: v })));
    const flare = s.userData['forgeFlare'] as { source: string; name: string } | undefined;
    if (flare) out.push(...copyEditors('flare', ref, flare, off, (v) => entityEdit('placement.set', { ref, field: 'model', value: v })));
    const turret = s.userData['forgeTurret'] as { source: string; name: string } | undefined;
    if (turret) out.push(...copyEditors('turret', ref, turret, off, (v) => entityEdit('placement.set', { ref, field: 'model', value: v })));
    const fobj = objectOf(s);
    if (fobj) {
      // A Forge object's own (`./forgeObjects`): an ambient effect's map and program, and its sounds.
      const setObj = (field: string, next: ForgeObjectData): void => {
        personEdit('placement.set', { ref, field, value: next.name }, (step) => {
          const before = selectionIds();
          const r = newForgeObject(next);
          if (fobj.kind === next.kind && fobj.source === next.source && fobj.name === next.name) return;
          // An ambient's own script kept across a change of its effect (not across Custom and a map: each its own).
          const sc = objectScript.get(s);
          if (sc && !isScriptObject(fobj) && !isScriptObject(next)) objectScript.set(r, sc);
          swapRoot(s, r);
          edit(before, step);
          refreshInspector();
        }, true);
      };
      // Its Source and its Program, as every copied object's (the owner, 2026-11-13: "do the same for the effect/program
      // inspector ... keep it consistent across all objects"): Custom (a scripted effect, `FORGE_SCRIPT_OBJECT`: your own
      // steps) or the map whose ambient program it copies, each map with its count (`mapChoices`), one with none greyed.
      const scripted = isScriptObject(fobj);
      out.push({ label: 'Source', kind: 'select', value: scripted ? CUSTOM_TRIGGER : fobj.source ?? '', covers: ['ambient.source'], disabled: off,
        options: groupedMaps([[CUSTOM_TRIGGER, 'Custom', false] as const, ...mapChoices('ambient', scripted ? '' : fobj.source ?? '')]),
        title: "Custom: a script of the game's own commands, yours to write; a disc map: that map's own ambient program copied whole",
        set: (v) => {
          const stem = String(v);
          if (stem === CUSTOM_TRIGGER) {
            // A map's program made Custom: a script that CALLs that program, once, from the round's start.
            if (!scripted) setObj('model', { kind: 'ambient', source: fobj.source, name: FORGE_SCRIPT_OBJECT, script: { steps: [{ do: 'effect', name: fobj.name, from: fobj.source }] } });
            return;
          }
          void hostageLibOf(stem).then((lib) => { const first = lib ? ambientProgramsOf(lib)[0] : undefined;
            if (!first) { notifier.refused(`${stem} has no ambient program`); return; } setObj('model', { kind: 'ambient', source: stem, name: first.name }); });
        } });
      if (scripted) {
        out.push({ label: 'Program', kind: 'select', value: 'x', disabled: true, options: [['x', 'Your own script (below)'] as const],
          title: 'A Custom program: its steps below', set: () => undefined });
        scriptEditors(s, ref, objectScript.get(s) ?? { steps: [] }, off, out, { store: objectScript, title: "From the round's start", self: 'The object' });
      } else {
        const list = fobj.source ? copyList('ambient', fobj.source) : null;
        out.push({ label: 'Program', kind: 'select', value: fobj.name, covers: ['ambient.name'], disabled: off || !list,
          options: list ? (list.some(([n]) => n === fobj.name) ? list : [[fobj.name, fobj.name] as const, ...list]) : [[fobj.name, 'Loading\u2026'] as const],
          title: "The map's ambient effect: its particles, its sound and its light, as its map plays it from the round's start",
          set: (v) => setObj('model', { kind: 'ambient', source: fobj.source, name: String(v) }) });
        // What it is (read off its map: `ambientProgramsOf`, its sounds' script entries): what it does, where its map has it,
        // each sound's hearing -- full volume inside the first distance, silent past the second (10 units a metre).
        const prog = ambientProgramNow(fobj);
        const info = (label: string, text: string, title: string): void => {
          out.push({ label, kind: 'select', value: 'x', disabled: true, options: [['x', text] as const], title, set: () => undefined });
        };
        if (prog) {
          info('Does', [prog.particles ? 'particles' : '', prog.sound ? 'sound' : '', prog.light ? 'light' : ''].filter(Boolean).join(' + ') || 'nothing drawn',
            'What its program runs: PARTICLE_SOURCE, SOUND, LIGHT (the programs it calls too)');
          info('On its map', prog.root ? `at ${prog.root}` : 'about the camera (the whole map)', "Where its own map plays it: a node of that map's, or the camera (rain, snow, bugs)");
        }
        const heard = ambientSoundsOf(fobj, objectScript.get(s));
        if (heard) for (const h of heard) {
          info(h.name, `${(h.range[0] / 10).toFixed(1)} m full \u2192 ${(h.range[1] / 10).toFixed(1)} m silent \u00b7 ${h.loop ? 'loop' : 'once'}${h.volume !== null ? ` \u00b7 vol ${h.volume}` : ''}${h.doppler ? ' \u00b7 doppler' : ''}`,
            "The sound's own script entry: RANGE (full volume inside the first, silent past the second; FUN_00342670), one-shot or a loop, VOLUME, doppler");
        } else if (prog?.sound) info('Sounds', `${prog.sounds.join(', ')} (reading their ranges\u2026)`, "The sounds its program plays");
        // Its sound previewed (the owner, 2026-11-10: "add a button in the inspector for sound objects to preview the
        // sound"): Play its program's sounds here once (a loop until Stop), Stop ends them. An effect with no sound, none.
        const sounds = fobj.source ? copyList('ambient', fobj.source)?.find(([n]) => n === fobj.name)?.[1].includes('sound') : undefined;
        if (sounds !== false && !objectScript.has(s)) {
          if (fobj.source) out.push(ambientSoundButton(fobj.source, fobj.name));
        }
        // Its sound: its effect's own, or its sounds written as a script of the game's own commands (the owner, 2026-11-10:
        // "make it fully scriptable ... I don't want to have any custom behaviour"). The script starts as its program's own
        // sound commands (`scriptOfProgram`) where they are those commands alone.
        out.push({ label: 'Script', kind: 'select', value: objectScript.has(s) ? 'custom' : 'own', disabled: off,
          options: [['own', "Its effect's own (as its map plays it)"] as const, ['custom', 'Scripted (the game\'s commands)'] as const],
          title: "Its effect's own sounds, or a script of the game's own commands in their place -- SOUND, CALL an effect, WAIT, LOOP, WHILE, IF on a random chance -- with any map's sounds and effects (its own particles and light stay)",
          set: (v) => {
            const own = v === 'custom' ? programScriptNow(fobj) : null;
            const next = v === 'custom' ? own?.steps ?? [] : undefined;
            if (own && !own.whole) say(`${fobj.name}'s program sounds by more than these commands: its ~ loops are copied, the rest is yours to write`);
            personEdit('placement.set', { ref, field: 'script', value: String(v) }, (step) => {
              const before = selectionIds();
              if (next) objectScript.set(s, scriptFromFile({ steps: next }, ownLists())); else objectScript.delete(s);
              edit(before, step);
              ambientGuideKey = '';
              refreshInspector();
            }, true);
          } });
        const own = objectScript.get(s);
        if (own) scriptEditors(s, ref, own, off, out, { store: objectScript, title: "From the round's start", self: 'The object' });
      }
    }
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
    // No Parent or Locked rows (the owner, 2026-11-11): the Outliner's drag sets the parent, the head's lock icon the lock.
    return out;
  };
  /** Whether the one map data object selected moves (`./mapDataMove`: a data object, not the scene's own; no lobby hold). */
  function mapDataMovable(): boolean {
    return !selected && !baseSelected && !isGroup() && !!mapDataSelected && movedDataKeyOf(mapDataSelected) !== null && !editsLocked();
  }
  /**
   * The selected map data object moved to `at` (null: back to the disc's own place) -- one edit, the layout's own
   * (`Layout.movedData`); its billboard, row, guides and Inspector drawn again from the map as the layout has it.
   */
  function commitMapDataMove(at: [number, number, number] | null): void {
    if (mapDataSelected) commitMapDataMoves([{ item: mapDataSelected, at }]);
  }
  /**
   * The map data objects the gizmo moves (the owner, 2026-11-13: "I can select multiple map objects, but not move them
   * together"): the one selected, or the several picked (a box, Ctrl) with nothing of the layout's or a map prop picked
   * -- each one that moves (`movedDataKeyOf`; a door, a turret... stays). None while edits are held.
   */
  function mapDataMoving(): BillboardSpec[] {
    if (selected || baseSelected || picks.size || basePicks.size || editsLocked()) return [];
    const items = [...dataPicks.values()];
    if (mapDataSelected && !dataPicks.has(mapDataSelected.key)) items.push(mapDataSelected);
    return items.filter((i) => movedDataKeyOf(i) !== null);
  }
  /** The middle of map data objects' places (the gizmo's stand-in for them). */
  function mapDataCentre(items: readonly BillboardSpec[]): [number, number, number] {
    const n = Math.max(1, items.length);
    return [0, 1, 2].map((k) => items.reduce((t, i) => t + i.at[k]!, 0) / n) as [number, number, number];
  }
  /**
   * Map data objects each moved to its `at` (null: back to the disc's own place) -- one edit, the layout's own
   * (`Layout.movedData`); their billboards, rows, guides and Inspector drawn again from the map as the layout has it.
   */
  function commitMapDataMoves(moves: readonly { item: BillboardSpec; at: [number, number, number] | null }[]): void {
    const todo = moves.flatMap((m) => {
      const key = movedDataKeyOf(m.item);
      if (!key) return [];
      if (m.at === null && !movedData.has(key)) return [];
      // Not moved at all (a click on the gizmo, a turn: its turn is not kept): nothing.
      if (m.at && m.at.every((v, i) => Math.abs(v - m.item.at[i]!) < 1e-3)) return [];
      return [{ ...m, key }];
    });
    if (!todo.length) { showSelection(); return; }
    if (refuseEdit()) { showSelection(); return; }
    personEdit('placement.set', { field: 'mapData' }, (step) => {
      const before = selectionIds();
      for (const m of todo) { if (m.at) movedData.set(m.key, { at: m.at }); else movedData.delete(m.key); }
      drawMapBillboards();
      // The selection kept, each at its new place (`mapDataIndex` drawn again).
      if (mapDataSelected) mapDataSelected = mapDataIndex.get(mapDataSelected.key) ?? null;
      for (const k of [...dataPicks.keys()]) { const n = mapDataIndex.get(k); if (n) dataPicks.set(k, n); else dataPicks.delete(k); }
      highlightSelectionMark();
      drawMapGuides();
      edit(before, step);
      showSelection();
      const one = todo.length === 1 ? todo[0]! : null;
      say(one ? (one.at ? `${one.item.label} moved: this layout's own place (the disc's map is unchanged)` : `${one.item.label} back at the disc's own place`)
        : `${todo.length} map objects moved: this layout's own places (the disc's map is unchanged)`);
    }, true);
  }
  const refreshInspector = (): void => {
    refreshInspectorFields();
    if (lockedSelection()) for (const f of [fx, fy, fz, fyaw, ...stubFields]) f.disabled = true;
    else for (const f of [fx, fy, fz]) f.disabled = false;
    fields.classList.toggle('is-locked', lockedSelection());
    showResets();
    // The record's lock and parent are the head's lock icon and the Outliner's tree: not listed again under Properties.
    const rows = dataRows(inspectorData()).filter(([k]) => k !== 'lock' && k !== 'parent' && !k.startsWith('parent.'));
    showInspectorData(inspectorDom, rows, withAssetDrop(inspectorEditors()));
  };
  resetPosition.addEventListener('click', () => {
    if (!selected && !isGroup() && !baseSelected && mapDataSelected && mapDataMovable()) { commitMapDataMove(null); return; }
    const entity = inspectedEntity();
    if (entity) { entityEdit('piece.move', { refs: [entity.ref], delta: entity.at.map((v) => -v) }); return; }
    const s = isGroup() ? null : selected;
    if (!s) return;
    personEdit('piece.move', { refs: selectionIds() }, () => {
      // Its local position (its parent's place; the origin at the top), its children with it.
      carrying([s], () => { const pos = new Vector3(), q = new Quaternion(), sc = new Vector3(); localMatrixOf(s).decompose(pos, q, sc); setLocalMatrix(s, new Matrix4().compose(new Vector3(), q, sc)); });
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
      // Its local turn (its parent's; none at the top), its children with it.
      carrying([s], () => { const pos = new Vector3(), q = new Quaternion(), sc = new Vector3(); localMatrixOf(s).decompose(pos, q, sc); setLocalMatrix(s, new Matrix4().compose(pos, new Quaternion(), sc)); });
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
      const origin = scrubOrigin;
      carrying([s], () => {
        if (cancelled) { s.position.copy(origin.position); s.quaternion.copy(origin.quaternion); s.updateMatrix(); }
        else setLocalAxis(s, f === fx ? 'x' : f === fy ? 'y' : f === fz ? 'z' : 'yaw', value);   // local to its parent
      });
      if (cancelled) scrubOrigin = null;
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
          carrying(picks.items, () => applyPoses(movedBy(picks.items.map(poseOf), d)));
          passOver('moved');
          placePivot();
          refreshBox();
          edit();
        });
        return;
      }
      // A map data object's place typed (`./mapDataMove`): its axis set, one edit.
      if (!selected && !baseSelected && mapDataSelected && mapDataMovable()) {
        const v = Number(f.value);
        if (f === fyaw || !Number.isFinite(v)) return;
        const at: [number, number, number] = [mapDataSelected.at[0], mapDataSelected.at[1], mapDataSelected.at[2]];
        at[f === fx ? 0 : f === fy ? 1 : 2] = v;
        commitMapDataMove(at);
        return;
      }
      const s = selected;
      const v = Number(f.value);
      if (!s || !Number.isFinite(v)) return;
      // FUI-6: the move's or the turn's entry; the field takes no edit under a lobby's hold (it is closed), as before.
      personEdit(f === fyaw ? 'piece.rotate' : 'piece.move', { refs: selectionIds() }, () => {
        // Local to its parent (`setLocalAxis`), its children with it.
        carrying([s], () => setLocalAxis(s, f === fx ? 'x' : f === fy ? 'y' : f === fz ? 'z' : 'yaw', v));
        refreshBox();
        edit();
      }, true);
    });
  }
  /**
   * A placement put under another, or at the top (`parent` null): one edit, its world place kept (its local transform
   * becomes its place under the new parent). Refused under itself or under one of its own.
   */
  const setParentEdit = (child: Object3D, parent: Object3D | null): void => {
    if (parent && (parent === child || descendantsOf(child).includes(parent))) { notifier.refused('A placement cannot go under itself or one of its own children'); return; }
    if ((parentOf.get(child) ?? null) === parent) return;
    personEdit('placement.set', { field: 'parent' }, (step) => {
      const before = selectionIds();
      if (parent) parentOf.set(child, parent); else parentOf.delete(child);
      edit(before, step);
      say(parent ? `${placedLabel(child)} under ${placedLabel(parent)}` : `${placedLabel(child)} at the top`);
      refreshInspector();
      drawOutliner();
    }, true);
  };
  /** The top-most of `items`: none under another of them (moved, the rest follow their own parent). */
  const topMost = (items: readonly Object3D[]): Object3D[] => {
    const set = new Set(items);
    return items.filter((o) => { for (let a = parentOf.get(o); a; a = parentOf.get(a)) if (set.has(a)) return false; return true; });
  };
  /**
   * The Outliner's drop (the owner, 2026-11-11: "if I drop on item center it goes as a child. if I drop above it inserts
   * as before, and below it drops as next"; "multiple objects ... moved together under the same object"): the dragged
   * placements and folders (their top-most) put before `target`, after it (its siblings), inside it (its last children) or
   * at the top, in their order -- one edit, every one at its own world place.
   */
  const moveInOutline = (dragged: readonly Object3D[], target: Object3D | null, where: 'before' | 'after' | 'inside' | 'top'): void => {
    const items = outlineSorted(topMost(dragged));
    if (!items.length || (target && items.includes(target))) return;
    const parent = where === 'inside' ? target : where === 'top' || !target ? null : parentOf.get(target) ?? null;
    if (parent && items.some((o) => o === parent || descendantsOf(o).includes(parent))) { notifier.refused('A placement cannot go under itself or one of its own children'); return; }
    personEdit('placement.set', { field: 'parent' }, (step) => {
      const before = selectionIds();
      const full = outlineSorted([...roots, ...folders]).filter((o) => !items.includes(o));
      let at = full.length;
      if (target && (where === 'before' || where === 'after')) { const i = full.indexOf(target); if (i >= 0) at = where === 'before' ? i : i + 1; }
      else if (target && where === 'inside') at = Math.max(...[target, ...descendantsOf(target)].map((o) => full.indexOf(o))) + 1;
      full.splice(at, 0, ...items);
      outlineOrder = full;
      outlineOrdered = true;
      for (const o of items) { if (parent) parentOf.set(o, parent); else parentOf.delete(o); }
      edit(before, step);
      const what = items.length === 1 ? (isFolder(items[0]!) ? folderName(items[0]!) : placedLabel(items[0]!)) : `${items.length} objects`;
      const where2 = !target || where === 'top' ? 'at the top' : where === 'inside' ? `under ${isFolder(target) ? folderName(target) : placedLabel(target)}` : `${where} ${isFolder(target) ? folderName(target) : placedLabel(target)}`;
      say(`${what} ${where2}`);
      refreshInspector();
      drawOutliner();
    }, true);
  };
  /** A new folder (the Outliner's +): the selected placements' top-most moved into it, where the first of them was. */
  const addFolder = (): void => {
    const items = outlineSorted(topMost([...picks.items.filter((o) => roots.includes(o)), ...folderPicks]));
    personEdit('placement.set', { field: 'folder' }, (step) => {
      const before = selectionIds();
      const taken = new Set(folders.map(folderName));
      let n = 1;
      while (taken.has(`Folder ${n}`)) n++;
      const f = newFolder(`Folder ${n}`);
      const full = outlineSorted([...roots, ...folders]);
      folders.push(f);
      const first = items[0];
      const up = first ? parentOf.get(first) : undefined;
      if (up) parentOf.set(f, up);
      const at = first ? full.indexOf(first) : full.length;
      full.splice(at < 0 ? full.length : at, 0, f);
      outlineOrder = full;
      outlineOrdered = true;
      for (const o of items) parentOf.set(o, f);
      // The new folder selected with what it holds (a G then Delete, or a second G, acts on it).
      if (items.length) { folderPicks.clear(); folderPicks.add(f); for (const o of descendantsOf(f)) if (isFolder(o)) folderPicks.add(o); }
      edit(before, step);
      say(items.length ? `Folder ${n}: ${items.length} object${items.length === 1 ? '' : 's'} in it` : `Folder ${n} made: drag objects into it`);
      showSelection();
    }, true);
  };
  /** A folder taken out of the tree: what it held up to where it was (their world places kept). No edit of its own. */
  const dissolveFolder = (f: Object3D): void => {
    const up = parentOf.get(f);
    for (const c of [...roots, ...folders]) if (parentOf.get(c) === f) { if (up) parentOf.set(c, up); else parentOf.delete(c); }
    parentOf.delete(f);
    const at = folders.indexOf(f);
    if (at >= 0) folders.splice(at, 1);
    outlineOrder = outlineOrder.filter((o) => o !== f);
    editorHidden.delete(f);
    folderPicks.delete(f);
  };
  /** Folders taken out (one edit): what they held up to where each was (their world places kept). */
  const removeFolders = (fs: readonly Object3D[]): void => {
    if (!fs.length) return;
    personEdit('placement.set', { field: 'folder' }, (step) => {
      const before = selectionIds();
      for (const f of fs) dissolveFolder(f);
      edit(before, step);
      say(fs.length === 1 ? `${folderName(fs[0]!)} removed: what it held kept` : `${fs.length} folders removed: what they held kept`);
      showSelection();
    }, true);
  };
  /**
   * The selected folders deleted with everything under them (the owner, 2026-11-12: "It should delete the folder and all
   * the children objects"), and any other placement picked with them -- one edit. A locked placement in them refuses it.
   */
  const deleteFolders = (): void => {
    const gone = new Set<Object3D>();
    for (const f of topMost([...folderPicks])) { gone.add(f); for (const o of descendantsOf(f)) gone.add(o); }
    for (const r of picks.items) gone.add(r);
    const placements = roots.filter((r) => gone.has(r));
    const emptied = folders.filter((f) => gone.has(f));
    const locked = placements.filter(lockedOf);
    if (locked.length) {
      notifier.refused(locked.length === 1 ? `${placedLabel(locked[0]!)} is locked: unlock it to delete the folder` : `${locked.length} locked in the folder: unlock them to delete it`);
      return;
    }
    if (placements.length && refuseEdit()) return;
    const byObject = new Map([...placementIds()].map(([id, r]) => [r, id]));
    const refs = placements.flatMap((r) => { const id = byObject.get(r); return id ? [id] : []; });
    const before = selectionIds();
    personEdit(placements.length ? 'piece.delete' : 'placement.set', placements.length ? { refs } : { field: 'folder' }, (step) => {
      for (const r of placements) removeRoot(r);
      for (const f of emptied) dissolveFolder(f);
      folderPicks.clear();
      picks.clear();
      basePicks.clear();
      edit(before, step);
      const named = emptied.length === 1 ? folderName(emptied[0]!) : `${emptied.length} folders`;
      say(`${named} deleted${placements.length ? ` with ${placements.length} object${placements.length === 1 ? '' : 's'}` : ''}`);
      showSelection();
    }, true);
  };
  /** G (the owner, 2026-11-12): the selection's placements and folders grouped into a new folder; refused with none. */
  const groupSelection = (): void => {
    if (!picks.items.some((o) => roots.includes(o)) && !folderPicks.size) { notifier.refused('Select objects to group them'); return; }
    addFolder();
  };
  /**
   * Shift+G (the owner, 2026-11-12): the selected folders taken out, what they held kept -- or, with no folder selected,
   * the folder each selected placement sits directly in.
   */
  const ungroupSelection = (): void => {
    const fs = folderPicks.size ? topMost([...folderPicks])
      : [...new Set(picks.items.flatMap((o) => { const p = parentOf.get(o); return p && isFolder(p) ? [p] : []; }))];
    if (!fs.length) { notifier.refused('Select a folder, or objects in one, to ungroup'); return; }
    removeFolders(fs);
  };
  /** A folder's new name kept (one edit); a blank or unchanged one leaves it. */
  const setFolderName = (f: Object3D, name: string | null | undefined): void => {
    const n = name?.replace(/[\u0000-\u001f]/g, ' ').trim();
    if (!n || n === folderName(f)) return;
    personEdit('placement.set', { field: 'folder' }, (step) => {
      const before = selectionIds();
      f.userData['forgeFolder'] = { name: n };
      f.name = `folder ${n}`;
      edit(before, step);
      drawOutliner();
    }, true);
  };
  /**
   * A folder renamed in its own row (the owner, 2026-11-11: "don't open a whole new popup window, I want to be able to
   * edit inline"): its words become a field -- Enter or leaving it keeps the name, Esc leaves it as it was. The Outliner is
   * not drawn again under the typing (`outlinerRenaming`); once done, it is.
   */
  let outlinerRenaming = false;
  let outlinerRedrawWaiting = false;
  /** A folder's words last clicked, and when: a second click on the same folder's within `OUTLINER_RENAME_MS` renames it. */
  let folderPress: { f: Object3D; at: number } | null = null;
  /** The double-click's window for a folder's rename (ms; a browser adaptation's own value, about a desktop's default). */
  const OUTLINER_RENAME_MS = 450;
  const renameFolderInline = (f: Object3D, words: HTMLElement): void => {
    if (outlinerRenaming) return;
    const li = words.closest('li');
    const field = el(doc, 'input', 'fx-row-rename');
    field.type = 'text';
    field.maxLength = 48;
    field.value = folderName(f);
    field.setAttribute('aria-label', 'Folder name');
    outlinerRenaming = true;
    if (li) li.draggable = false;
    words.replaceWith(field);
    let done = false;
    let armed = false;                                          // a blur before the field has the focus is no finish
    requestAnimationFrame(() => { if (done) return; field.focus(); field.select(); armed = true; });
    const finish = (keep: boolean): void => {
      if (done) return;
      done = true;
      outlinerRenaming = false;
      if (keep) setFolderName(f, field.value);
      if (field.isConnected) field.replaceWith(words);
      if (li) li.draggable = true;
      if (outlinerRedrawWaiting || keep) { outlinerRedrawWaiting = false; drawOutliner(); }
    };
    // The field's presses and keys are its own: no row selection, no drag, no editor key.
    for (const type of ['click', 'dblclick', 'pointerdown', 'mousedown'] as const) field.addEventListener(type, (e) => e.stopPropagation());
    field.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); finish(true); } else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
    field.addEventListener('blur', () => { if (armed) finish(true); });
  };
  /** A placement's outliner words (FUI-3: the dock's row and the START menu's Outliner screen read the same). */
  const placedLabel = (r: Object3D): string => {
    const team = r.userData['forgeSpawn'] as string | undefined, npc = npcOf(r), bomb = bombKindOf(r);
    if (r.userData['forgeHostage']) return hostageOf(r).name ?? 'Hostage';
    if (r.userData['forgeZone']) return zoneNameOf(r);
    if (objectOf(r)) return objectLabel(r);
    if (r.userData['forgePoint'] || r.userData['forgeView']) return pointNameOf(r);
    if (r.userData['forgeTurret']) return turretLabel(r);
    if (r.userData['forgeDoor']) return doorLabel(r);
    if (accessOwnOf(r)) return accessLabel(r);
    if (r.userData['forgeTrigger']) return triggerLabel(r);
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
  const outlinerExpanded: Record<OutlinerBranch, boolean> = { mapProps: true, rules: true, missing: true, hidden: true };
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
    else if (mode === 'toggle') basePicks.toggle(prop);      // Ctrl: this prop in or out, the rest of the selection kept
    else basePicks.add(prop);
    entityPicked = null;
    showSelection();
    return prop;
  };
  /**
   * The Outliner (the owner, 2026-11-10: "in the outliner have a filter for all the object types. Dont have a separation
   * between user data and map data"): one tree, a branch a kind (the View's own kinds, `MAP_DATA_KIND_TOGGLES`, in its
   * order) holding the map's own of that kind and the layout's alike, each with its billboard; the layout's placements
   * nested under their parents (`parentOf`, `Layout.tree`) -- a placement dragged onto another goes under it, onto its
   * branch's heading (or the list's empty space) back to the top. The filter shows one kind (flat), the rules, the missing
   * pieces or the hidden map props; a search shows its matches flat.
   */
  /**
   * Whether the Outliner's rows carry their eye (the editor's hiding, `editorHidden`): put away for now (the owner,
   * 2026-11-11: "hide the hide button"); the hiding itself kept for its return.
   */
  const OUTLINER_EYE_SHOWN = false;
  /**
   * A level's indent: one caret's width (20px; the owner, 2026-11-13: "the same as c4d's"), so a child's caret sits where
   * its parent's caret ends and its icon one caret further in.
   */
  const OUTLINER_INDENT_PX = 20;
  /** A row `depth` levels into the Outliner's tree: indented a step a level. */
  const treeDepth = (li: HTMLElement, depth: number): void => {
    li.classList.add('fx-tree-child');
    li.style.paddingLeft = `${depth * OUTLINER_INDENT_PX}px`;
    li.dataset['treeDepth'] = String(depth);
  };
  /**
   * The Outliner's Filter (the owner, 2026-11-10: "similar to the way we did it in the view drop down, being able to toggle
   * each one independently and solo"; "a button to toggle user objects and map objects (read only)"): your objects and
   * the map's own on or off, then each kind (`OUTLINER_KINDS`) on or off, Solo that kind alone. Kept for the session.
   */
  const outlinerOff = new Set<string>();
  let outlinerShowUser = true, outlinerShowMap = true;
  const outlinerKindIns = new Map<string, HTMLInputElement>();
  const outlinerSolos = new Map<string, HTMLButtonElement>();
  const outlinerFilterRow = (label: string, badge: HTMLElement | null): HTMLInputElement => {
    const row = el(doc, 'label', 'fx-viewport-mode fx-toggle');
    const input = doc.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('aria-label', label);
    row.append(input, ...(badge ? [badge] : []), el(doc, 'span', '', label));
    outlinerFilterList.append(row);
    return input;
  };
  outlinerFilterList.append(el(doc, 'h3', 'fx-viewport-modes-heading', 'Show'));
  const outlinerUserIn = outlinerFilterRow('Your objects', null);
  outlinerUserIn.closest('label')!.title = 'The placements you made (and took over), under their parents';
  outlinerUserIn.addEventListener('change', () => { outlinerShowUser = outlinerUserIn.checked; drawOutlinerFilter(); drawOutliner(); });
  const outlinerMapIn = outlinerFilterRow('Map objects (read only)', null);
  outlinerMapIn.closest('label')!.title = "The base map's own props and data: selectable and framed, never edited";
  outlinerMapIn.addEventListener('change', () => { outlinerShowMap = outlinerMapIn.checked; drawOutlinerFilter(); drawOutliner(); });
  outlinerFilterList.append(el(doc, 'h3', 'fx-viewport-modes-heading', 'Kinds'));
  const outlinerAllIn = outlinerFilterRow('All', null);
  outlinerAllIn.addEventListener('change', () => {
    for (const [id] of OUTLINER_KINDS) { if (outlinerAllIn.checked) outlinerOff.delete(id); else outlinerOff.add(id); }
    drawOutlinerFilter();
    drawOutliner();
  });
  const outlinerSoloOf = (id: string): boolean => OUTLINER_KINDS.every(([k]) => outlinerOff.has(k) === (k !== id));
  for (const [id, label] of OUTLINER_KINDS) {
    // Its billboard before its word, as the View's switch draws it (two sides split down the middle).
    const kind = MAP_DATA_KIND_TOGGLES.find((t) => t.id === id);
    let badge: HTMLElement | null = null;
    if (kind) {
      const marks = kind.kinds.map((k) => MAP_DATA_MARKS[k]!);
      const colours = [...new Set(marks.map((m) => m.colour))];
      badge = el(doc, 'span', 'fx-billboard-icon', marks[0]!.glyph);
      badge.setAttribute('aria-hidden', 'true');
      badge.style.background = colours.length === 2 ? `linear-gradient(90deg, ${colours[0]} 50%, ${colours[1]} 50%)` : colours[0]!;
    }
    const input = outlinerFilterRow(label, badge);
    input.addEventListener('change', () => { if (input.checked) outlinerOff.delete(id); else outlinerOff.add(id); drawOutlinerFilter(); drawOutliner(); });
    outlinerKindIns.set(id, input);
    const solo = el(doc, 'button', 'fx-chip fx-billboard-solo', 'Solo');
    solo.type = 'button';
    solo.title = `List only ${label.toLowerCase()}; press again to list every kind`;
    solo.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const was = outlinerSoloOf(id);
      outlinerOff.clear();
      if (!was) for (const [k] of OUTLINER_KINDS) if (k !== id) outlinerOff.add(k);
      drawOutlinerFilter();
      drawOutliner();
    });
    input.closest('label')!.append(solo);
    outlinerSolos.set(id, solo);
  }
  /** The Filter's switches drawn from its state, its summary saying how much it hides. */
  const drawOutlinerFilter = (): void => {
    outlinerUserIn.checked = outlinerShowUser;
    outlinerMapIn.checked = outlinerShowMap;
    for (const [id, input] of outlinerKindIns) input.checked = !outlinerOff.has(id);
    const off = OUTLINER_KINDS.filter(([k]) => outlinerOff.has(k)).length;
    outlinerAllIn.checked = off === 0;
    outlinerAllIn.indeterminate = off > 0 && off < OUTLINER_KINDS.length;
    for (const [id, solo] of outlinerSolos) { const on = outlinerSoloOf(id); solo.classList.toggle('is-on', on); solo.setAttribute('aria-pressed', String(on)); }
    const narrowed = off > 0 || !outlinerShowUser || !outlinerShowMap;
    outlinerFilterSummary.textContent = narrowed ? 'Filter \u2022' : 'Filter';
    outlinerFilterSummary.classList.toggle('is-on', narrowed);
  };
  drawOutlinerFilter();
  // A new folder (the owner, 2026-11-11: "nulls/folders to group objects"): the selection's placements into it, else empty.
  const newFolderBtn = el(doc, 'button', 'fx-tool fx-outliner-folder', '');
  newFolderBtn.type = 'button';
  newFolderBtn.innerHTML = icon('folderAdd');
  newFolderBtn.title = "New folder (the selection moved into it): the Outliner's own grouping, never in a match";
  newFolderBtn.setAttribute('aria-label', 'New folder');
  newFolderBtn.addEventListener('click', () => addFolder());
  outlinerFilter.after(newFolderBtn);
  /** The placements and folders a drag carries (the row's, or every selected one with it). */
  let outlinerDrag: Object3D[] | null = null;
  /** Each drawn row's placement or folder (a drag's target, a fold opened under a drag). */
  const rowObjectOf = new WeakMap<Element, Object3D>();
  /** A drag over: its marks cleared, the top's drop row hidden. */
  const endOutlinerDrag = (): void => {
    outlinerDrag = null;
    if (dragOpenTimer !== null) { clearTimeout(dragOpenTimer); dragOpenTimer = null; }
    outliner.classList.remove('is-dragging');
    for (const li of outliner.querySelectorAll('.is-drop, .is-drop-before, .is-drop-after')) li.classList.remove('is-drop', 'is-drop-before', 'is-drop-after');
  };
  /** Whether a drag over the Outliner is an asset tile's (the asset browser's, `ASSET_DRAG_MIME`) that can still drop. */
  const assetDragOver = (e: DragEvent): boolean =>
    !outlinerDrag && !!e.dataTransfer?.types.includes(ASSET_DRAG_MIME) && !!assetTiles?.dragToken();
  /**
   * An asset tile dropped on the Outliner (the owner, 2026-11-12: "instantiates the asset that position in the tree (user
   * objects only) and creates the asset at the center point in the viewport from the camera's view"): placed at the view's
   * centre as a drop on the world would place it (`AssetTiles.dropAtCentre`), then put before, after or inside `target`
   * (null: at the top's end, where a new placement lands already). Two steps: the placement, then its place in the tree.
   */
  const dropAssetInOutline = (e: DragEvent, target: Object3D | null, where: 'before' | 'after' | 'inside' | 'top'): void => {
    const tiles = assetTiles;
    const token = e.dataTransfer?.getData(ASSET_DRAG_MIME) ?? '';
    endOutlinerDrag();                                          // its drop marks cleared
    if (!tiles || !token) return;
    const had = new Set(roots);
    void tiles.dropAtCentre(token).then((ok) => {
      if (!ok) return;
      const made = roots.filter((r) => !had.has(r));
      if (!made.length || !target || where === 'top') return;
      if (!roots.includes(target) && !folders.includes(target)) return;       // its target went meanwhile: left at the top
      moveInOutline(made, target, where);
    });
  };
  /** The placements whose children the Outliner folds (their caret). */
  const foldedRows = new WeakSet<Object3D>();
  /** The Outliner's two top-level sections folded (`drawOutliner`): the map's own objects, the user's. */
  const foldedSections = new Set<'map' | 'user'>();
  /**
   * The Map Objects' kinds unfolded (the owner, 2026-11-13: "put each object type into its own folder"): the editor's
   * view alone -- a group a kind, drawn by the Outliner, never a folder of the layout (`Layout.folders`) nor written
   * anywhere. Every kind starts folded.
   */
  const openMapKinds = new Set<string>();
  /** The folded kinds holding a selected row at the last draw: unfolded when the selection is shown (`revealSelectionInOutliner`). */
  let mapKindsHoldingSelection: string[] = [];
  /** A folded row unfolding under a drag held over it (`OUTLINER_DRAG_OPEN_MS`). */
  let dragOpenTimer: ReturnType<typeof setTimeout> | null = null;
  /** How long a drag rests on a folded row before it unfolds (an editor's feel, as tree views do). */
  const OUTLINER_DRAG_OPEN_MS = 450;
  /** A folded row opened under a drag: its own rows shown where no other fold above them holds them, its caret open. */
  const unfoldDuringDrag = (r: Object3D): void => {
    if (!foldedRows.has(r)) return;
    foldedRows.delete(r);
    for (const row of outliner.querySelectorAll<HTMLLIElement>('li')) {
      const x = rowObjectOf.get(row);
      if (!x) continue;
      if (x === r) {
        const caret = row.querySelector<HTMLElement>('.fx-row-caret');
        if (caret) { caret.textContent = '\u25be'; caret.setAttribute('aria-expanded', 'true'); }
        continue;
      }
      let a = parentOf.get(x), under = false, held = false;
      for (; a; a = parentOf.get(a)) { if (a === r) { under = true; break; } if (foldedRows.has(a)) held = true; }
      if (under && !held) row.hidden = false;
    }
  };
  let outlinerDropWired = false;
  const drawOutliner = (): void => {
    // A row being renamed in place: drawn again once the typing is done (`renameFolderInline`), never under it.
    if (outlinerRenaming) { outlinerRedrawWaiting = true; return; }
    const q = outlinerSearch.value.trim().toLowerCase();
    // Every row built; the Filter's switches (`outlinerOff`, `outlinerShowUser`, `outlinerShowMap`) pick what is drawn.
    const want: string = 'all';
    if (!outlinerDropWired) {
      // The list's empty space: a dragged placement back to the top.
      outlinerDropWired = true;
      // An asset tile too, on the empty space past the rows (placed, at the top's end); a map row takes none.
      const userSpace = (e: DragEvent): boolean => {
        const li = (e.target as HTMLElement).closest<HTMLLIElement>('li');
        return !li || li.dataset['outlinerSection'] === 'user' || li.dataset['userEmpty'] !== undefined;
      };
      outliner.addEventListener('dragover', (e) => {
        if (outlinerDrag) { e.preventDefault(); return; }
        if (assetDragOver(e) && userSpace(e)) { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; }
      });
      outliner.addEventListener('drop', (e) => {
        if (!outlinerDrag && assetDragOver(e)) {
          if ((e.target as HTMLElement).closest('li[data-user-prop], li.fx-folder-row') || !userSpace(e)) return;
          e.preventDefault();
          dropAssetInOutline(e, null, 'top');
          return;
        }
        const dragged = outlinerDrag;
        endOutlinerDrag();
        if (!dragged || (e.target as HTMLElement).closest('li[data-user-prop], li.fx-folder-row')) return;
        e.preventDefault();
        moveInOutline(dragged, null, 'top');
      });
      // A click on the list's empty space, past every row: nothing selected (the owner, 2026-11-11).
      outliner.addEventListener('click', (e) => {
        if ((e.target as HTMLElement | null)?.closest('li')) return;
        if (e.ctrlKey || e.metaKey || e.shiftKey) return;
        select(null);
      });
    }
    /** A placement's kind as the View names it (`MAP_DATA_KIND_TOGGLES`); a missing piece a prop. */
    const kindIdOf = (r: Object3D): string => {
      if (r.userData['forgeMissing'] === true) return 'mapProps';
      const mark = userKindOfRoot(r);
      return MAP_DATA_KIND_TOGGLES.find((t) => mark !== null && t.kinds.includes(mark))?.id ?? 'mapProps';
    };
    /** The one tree (All, no search): every placement under its parent; else a flat list of the matches. */
    const nestedView = want === 'all' && !q;
    /** Every user row drawn, in the tree's order (a Shift range runs over them). */
    const userRowEls: HTMLLIElement[] = [];
    /**
     * Whether something under `o` in the tree is selected (the owner, 2026-11-11: "when a child object is selected, I want
     * all the parent objects to be implicitly selected ... a nice highlight"): its row so marked, folded or not -- a
     * highlight, never a selection.
     */
    const pickedBelow = new Set<Object3D>();
    for (const p of picks.items) for (let a = parentOf.get(p); a; a = parentOf.get(a)) pickedBelow.add(a);
    const holdsPicked = (o: Object3D): boolean => pickedBelow.has(o);
    /**
     * A row's fold caret, where it has children (the one tree only); a row without, the caret's room kept empty
     * (the owner, 2026-11-13: children read as siblings when a parent's caret pushed its icon to its children's column).
     */
    const addCaret = (li: HTMLLIElement, o: Object3D): void => {
      const kids = nestedView ? childrenOf(o).length : 0;
      if (!kids) {
        const room = el(doc, 'i', 'fx-row-caret fx-row-caret-room');   // never a span: the row's words are its first
        room.setAttribute('aria-hidden', 'true');
        li.prepend(room);
        return;
      }
      const folded = foldedRows.has(o);
      const caret = el(doc, 'button', 'fx-tree-caret fx-row-caret', folded ? '\u25b8' : '\u25be');
      caret.type = 'button';
      caret.title = folded ? `Show its ${kids} child${kids === 1 ? '' : 'ren'}` : 'Fold its children';
      caret.setAttribute('aria-expanded', String(!folded));
      caret.addEventListener('click', (e) => { e.stopPropagation(); if (folded) foldedRows.delete(o); else foldedRows.add(o); drawOutliner(); });
      caret.addEventListener('dblclick', (e) => e.stopPropagation());
      li.prepend(caret);
    };
    /** A row's eye (the editor's hiding, `editorHidden`): shown or hidden here, everything under it with it. */
    const addEye = (li: HTMLLIElement, o: Object3D, label: string, before: Element | null): void => {
      if (!OUTLINER_EYE_SHOWN) return;                         // put away for now (the owner, 2026-11-11)
      const hiddenHere = editorHidden.has(o), hiddenAbove = !hiddenHere && editorHiddenNow(o);
      li.classList.toggle('is-hidden-here', hiddenHere || hiddenAbove);
      const eye = el(doc, 'button', 'fx-chip fx-eye', '');
      eye.type = 'button';
      eye.innerHTML = icon(hiddenHere || hiddenAbove ? 'eyeOff' : 'eye');
      eye.title = hiddenAbove ? 'Hidden with its parent (show the parent to show it)' : hiddenHere ? 'Show it (and what is under it) in the editor' : 'Hide it (and what is under it) in the editor; a match still has it';
      eye.setAttribute('aria-label', hiddenHere ? `Show ${label}` : `Hide ${label}`);
      eye.setAttribute('aria-pressed', String(hiddenHere));
      eye.addEventListener('click', (e) => {
        e.stopPropagation();
        if (editorHidden.has(o)) editorHidden.delete(o); else { editorHidden.add(o); for (const x of [o, ...descendantsOf(o)]) picks.remove(x); }
        applyEditorHidden();
        syncUserBillboards();
        showSelection();
        drawOutliner();
      });
      eye.addEventListener('dblclick', (e) => e.stopPropagation());
      li.insertBefore(eye, before);
    };
    /**
     * A row's drag (the owner, 2026-11-11): it carries its own (or, picked with others, every selected one); over another
     * row its top quarter puts them before it, its bottom quarter after it, its middle inside it (a folded one opens under
     * a held drag); the drop line or the outline says which.
     */
    const wireRowDrag = (li: HTMLLIElement, o: Object3D): void => {
      rowObjectOf.set(li, o);
      if (!(roots.includes(o) && lockedOf(o))) {
        li.draggable = true;
        li.addEventListener('dragstart', (e) => {
          const many = !isFolder(o) && picks.has(o) && picks.size > 1 ? picks.items.filter((x) => roots.includes(x) && !lockedOf(x)) : [o];
          outlinerDrag = many;
          e.dataTransfer?.setData('text/plain', many.length > 1 ? `${many.length} objects` : isFolder(o) ? folderName(o) : placedLabel(o));
          if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
          outliner.classList.add('is-dragging');               // the top's drop row shown
        });
        li.addEventListener('dragend', endOutlinerDrag);
      }
      const zoneOf = (e: DragEvent): 'before' | 'after' | 'inside' => {
        const b = li.getBoundingClientRect();
        const y = (e.clientY - b.top) / Math.max(1, b.height);
        return y < 0.28 ? 'before' : y > 0.72 ? 'after' : 'inside';
      };
      const refused = (dragged: readonly Object3D[]): boolean => dragged.includes(o) || dragged.some((d) => descendantsOf(d).includes(o));
      li.addEventListener('dragover', (e) => {
        const dragged = outlinerDrag;
        const asset = assetDragOver(e);                        // an asset tile: placed, then put here in the tree
        if (!asset && (!dragged || refused(dragged))) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer) e.dataTransfer.dropEffect = asset ? 'copy' : 'move';
        const zone = zoneOf(e);
        li.classList.toggle('is-drop', zone === 'inside');
        li.classList.toggle('is-drop-before', zone === 'before');
        li.classList.toggle('is-drop-after', zone === 'after');
        // A folded row held under the drag a moment unfolds in place (the owner, 2026-11-11), so its children take a drop.
        if (zone === 'inside' && foldedRows.has(o)) {
          if (dragOpenTimer === null) dragOpenTimer = setTimeout(() => { dragOpenTimer = null; unfoldDuringDrag(o); }, OUTLINER_DRAG_OPEN_MS);
        } else if (dragOpenTimer !== null) { clearTimeout(dragOpenTimer); dragOpenTimer = null; }
      });
      li.addEventListener('dragleave', () => {
        li.classList.remove('is-drop', 'is-drop-before', 'is-drop-after');
        if (dragOpenTimer !== null) { clearTimeout(dragOpenTimer); dragOpenTimer = null; }
      });
      li.addEventListener('drop', (e) => {
        const dragged = outlinerDrag;
        const zone = zoneOf(e);
        if (!dragged && assetDragOver(e)) { e.preventDefault(); e.stopPropagation(); dropAssetInOutline(e, o, zone); return; }
        endOutlinerDrag();
        if (!dragged || refused(dragged)) return;
        e.preventDefault();
        e.stopPropagation();
        moveInOutline(dragged, o, zone);
      });
    };
    const userRow = (r: Object3D, depth: number): HTMLLIElement => {
      const i = roots.indexOf(r);
      const team = r.userData['forgeSpawn'] as string | undefined;
      const npc = npcOf(r);
      const bomb = bombKindOf(r);
      const missing = r.userData['forgeMissing'] === true;
      const li = el(doc, 'li');
      li.dataset['userProp'] = String(i);
      li.dataset['userKind'] = kindIdOf(r);                   // its kind
      // Its depth in the tree (`parentOf`), indented under its parent's row.
      if (depth > 0) treeDepth(li, depth);
      // A row wears its placement's billboard (`markBadge`: an NPC's N too); a missing piece keeps its warning.
      const markKind = missing ? null : userKindOfRoot(r);
      const label = placedLabel(r);
      li.innerHTML = markKind ? markBadge(markKind) : icon('place');
      li.classList.toggle('fx-team-a', team === 'A');
      li.classList.toggle('fx-team-b', team === 'B');
      li.classList.toggle('fx-bomb', bomb === 'start');
      li.classList.toggle('fx-side-seal', npc?.side === 'seal' || bomb === 'seal');
      li.classList.toggle('fx-side-terrorist', npc?.side === 'terrorist' || bomb === 'terrorist');
      li.classList.toggle('fx-missing', missing);
      const locked = lockedOf(r);
      // Its words: a double-click on them frames it (the owner, 2026-11-11: "only frame if I double click the text").
      const words = el(doc, 'span', 'fx-row-label', label);
      words.addEventListener('dblclick', () => focusOn(r));
      // Its name alone (the owner, 2026-11-11: "hide the numbers ... just show hide/lock"); a missing piece still says so.
      li.append(words, ...(missing ? [el(doc, 'span', 'fx-dim', 'missing')] : []));
      li.classList.toggle('is-on', picks.has(r));
      // Something under it selected: its row highlighted (`holdsPicked`), so a folded parent shows where the selection is.
      li.classList.toggle('is-implicit', !picks.has(r) && holdsPicked(r));
      li.classList.toggle('is-locked', locked);
      // A lock icon (the owner, 2026-11-11): shown under the pointer, always while locked (`.fx-lock-icon`).
      const lock = el(doc, 'button', 'fx-lock fx-lock-icon', '');
      lock.type = 'button';
      lock.innerHTML = icon(locked ? 'locked' : 'unlocked');
      lock.classList.toggle('is-on', locked);
      lock.setAttribute('aria-label', locked ? `Unlock ${label}` : `Lock ${label}`);
      lock.setAttribute('aria-pressed', String(locked));
      lock.title = locked ? 'Unlock this placement' : 'Lock this placement: still selectable, but it cannot be moved, edited or deleted';
      lock.addEventListener('click', (e) => {
        e.stopPropagation();
        lockToggle(r);
      });
      lock.addEventListener('dblclick', (e) => e.stopPropagation());
      li.append(lock);
      // Shift selects a contiguous range; Ctrl / Meta toggles one placement.
      // A locked placement is selected from its row too (the owner, 2026-11-11), its edits refused.
      li.addEventListener('click', (e) => {
        const toggle = e.ctrlKey || e.metaKey;
        if (e.shiftKey) {
          const visible = userRowEls.flatMap((row) => {
            const root = roots[Number(row.dataset['userProp'])];
            return root ? [root] : [];
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
      addCaret(li, r);
      addEye(li, r, label, lock);
      wireRowDrag(li, r);
      userRowEls.push(li);
      return li;
    };
    /**
     * A folder's row (`folders`): its icon and name (a double-click renames it), how much it holds, its caret and eye;
     * a click selects it and what it holds; a drag moves it, what it holds with it.
     */
    const folderRow = (f: Object3D, depth: number): HTMLLIElement => {
      const li = el(doc, 'li', 'fx-folder-row');
      if (depth > 0) treeDepth(li, depth);
      const held = descendantsOf(f).filter((o) => roots.includes(o));
      li.innerHTML = icon('folder');
      const words = el(doc, 'span', 'fx-row-label', folderName(f));
      words.title = 'Double-click to rename';
      // A double-click on its words renames it in the row (no dialog). Counted here, by the folder, not by the browser's
      // dblclick: the first click selects what it holds and draws the Outliner again, so the second lands on new words.
      words.addEventListener('click', (e) => {
        const now = performance.now();
        if (folderPress?.f === f && now - folderPress.at < OUTLINER_RENAME_MS) {
          e.stopPropagation();                                 // the second click renames; it does not select again
          folderPress = null;
          renameFolderInline(f, words);
          return;
        }
        folderPress = { f, at: now };
      });
      words.addEventListener('dblclick', (e) => e.stopPropagation());
      li.append(words);
      li.classList.toggle('is-on', folderPicks.has(f) || (held.length > 0 && held.every((o) => picks.has(o))));
      li.classList.toggle('is-implicit', !li.classList.contains('is-on') && holdsPicked(f));
      // No \u2715 of its own (the owner, 2026-11-12): Shift+G ungroups it, Delete takes it out with what it holds.
      // A click selects the folder itself (Delete takes it out with everything in it) and what it holds; Ctrl / Meta adds
      // it to the selection, or takes it out again.
      li.addEventListener('click', (e) => {
        const pickable = held.filter((o) => !editorHiddenNow(o));
        const toggle = e.ctrlKey || e.metaKey;
        if (replacing) { endReplace(true); setMode('select'); }
        if (!toggle) { picks.clear(); basePicks.clear(); dataPicks.clear(); folderPicks.clear(); }
        if (mapDataSelected) { mapDataSelected = null; mapBillboards.highlight(null); }
        if (toggle && folderPicks.has(f)) {
          folderPicks.delete(f);
          for (const o of pickable) picks.remove(o);
        } else {
          // The folders kept picked are those the selection is still all of (`showSelection`): this one and its own.
          folderPicks.add(f);
          for (const o of descendantsOf(f)) if (isFolder(o)) folderPicks.add(o);
          picks.addAll(pickable);
        }
        if (entityPicked !== null) { entityPicked = null; drawRulesScene(); }
        showSelection();
      });
      addCaret(li, f);
      addEye(li, f, folderName(f), null);
      wireRowDrag(li, f);
      return li;
    };
    /** Whether a placement's own row matches the search. */
    const userMatches = (r: Object3D): boolean => !q || placedLabel(r).toLowerCase().includes(q) || nameOf(r).toLowerCase().includes(q);
    /** A placement's row and its children's under it (`depth` deeper each, unless folded), in the layout's order. */
    const subtree = (r: Object3D, depth: number): HTMLLIElement[] =>
      [userRow(r, depth), ...(foldedRows.has(r) ? [] : childrenOf(r).flatMap((c) => subtree(c, depth + 1)))];
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
      const lock = el(doc, 'button', 'fx-lock fx-lock-icon', '');
      lock.type = 'button';
      lock.innerHTML = icon(locked ? 'locked' : 'unlocked');
      lock.classList.toggle('is-on', locked);
      lock.setAttribute('aria-label', locked ? `Unlock ${label}` : `Lock ${label}`);
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
    if (baseMap && baseView && (want === 'all' || want === 'mapProps' || want === 'hidden')) {
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
      if ((want !== 'all' && want !== 'mapProps') || (q && !label.toLowerCase().includes(q))) return [];
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
      li.dataset['mapKey'] = key;                              // the rows' order, for a Shift range
      li.classList.toggle('is-on', mapDataSelected?.key === key || dataPicks.has(key));
      li.addEventListener('click', (e) => {
        // Shift: every map data row from the last one clicked to this (the owner, 2026-11-06: read only ones too); Ctrl
        // (Cmd): this one in or out; else this one alone, as before.
        if (e.shiftKey || e.ctrlKey || e.metaKey) {
          pickMapDataRows(li, key, e.shiftKey ? 'range' : 'toggle');
          return;
        }
        mapDataAnchor = key;
        selectMapData(key);
        const item = mapDataIndex.get(key);
        if (item && e.detail > 1) frameMapData(item);
      });
      li.addEventListener('dblclick', () => { const item = mapDataIndex.get(key); if (item) frameMapData(item); });
    };
    // The map's own data (a browser adaptation, FG.R2): the disc's spawn slots, read only -- a row each, selected and
    // framed as any map data (`mapDataRow`), its key its billboard's (`slot:A1`).
    const slotRows = baseMap && (want === 'all' || want === 'slots') ? spawnSlotRows(mapDataShown(baseMap).slots).flatMap((s) => {
      if (q && !`${s.label} ${s.key}`.toLowerCase().includes(q)) return [];
      const li = el(doc, 'li', 'fx-spawn-slot');
      li.dataset['spawnSlot'] = s.key;
      li.innerHTML = markBadge(s.key.startsWith('A') ? 'slotA' : 'slotB');   // the slot's billboard, its side's colour
      li.append(el(doc, 'span', '', s.label));                 // its place and facing in its tooltip only
      li.title = s.title.replace('click to look at it', 'click to select, double-click to frame');
      mapDataRow(li, `slot:${s.key}`);
      return [li];
    }) : [];
    /** The map's own rows of a kind: its props, its spawn slots, or its data's (`./mapData`), read only. */
    const mapDataGroupRows = new Map<string, HTMLLIElement[]>();
    if (baseMap && want !== 'rules' && want !== 'missing' && want !== 'hidden') {
      for (const g of mapDataGroups(mapDataSource(baseMap), floorUnder)) {
        if (want !== 'all' && want !== g.key) continue;
        mapDataGroupRows.set(g.key, g.rows.flatMap((row) => {
          if (q && !row.label.toLowerCase().includes(q)) return [];
          const li = el(doc, 'li', 'fx-map-data');
          li.dataset['mapData'] = row.key;
          li.innerHTML = markBadge(row.kind ?? g.key);              // the kind's billboard (D a door, V a view, Rs / Rt...)
          li.append(el(doc, 'span', '', row.label));
          li.title = row.title.replace(/click to (look at|look through) it/, 'click to select, double-click to frame');
          mapDataRow(li, row.key);
          return [li];
        }));
      }
    }
    const mapRowsOf = (kind: string): HTMLLIElement[] => kind === 'mapProps' ? mapRows : kind === 'slots' ? slotRows : mapDataGroupRows.get(kind) ?? [];
    /**
     * One big tree (the owner, 2026-11-10: "I want everything to be nestable in a single big tree"): the layout's
     * placements first, each under its parent (any kind under any kind), then the map's own (read only, at the top), each
     * row its billboard. A quick tab shows one kind, the rules, the missing pieces or the hidden map props, flat.
     */
    const treeRoots: HTMLLIElement[] = [];
    /**
     * The tree's two top-level sections (the owner, 2026-11-11: "split the map objects and user objects into two top
     * level undeleteable items"): a row each that folds what it holds -- never selected, dragged or deleted. A placement
     * dropped on User Objects goes back to the top level.
     */
    const sectionRow = (id: 'map' | 'user', label: string, count: number, holdsSelection: boolean): HTMLLIElement => {
      const folded = foldedSections.has(id);
      const li = el(doc, 'li', 'fx-outliner-section');
      li.dataset['outlinerSection'] = id;
      const caret = el(doc, 'button', 'fx-tree-caret fx-row-caret', folded ? '▸' : '▾');   // its press the row's
      caret.type = 'button';
      caret.tabIndex = -1;
      caret.setAttribute('aria-hidden', 'true');
      li.append(caret);
      li.insertAdjacentHTML('beforeend', icon('folder'));
      li.append(el(doc, 'span', 'fx-row-label', label), el(doc, 'span', 'fx-dim', String(count)));
      li.setAttribute('aria-expanded', String(!folded));
      li.title = `${id === 'map' ? "The map's own objects" : 'Your placements'}: click to ${folded ? 'show' : 'fold'} them`;
      li.classList.toggle('is-implicit', folded && holdsSelection);
      li.addEventListener('click', () => { if (folded) foldedSections.delete(id); else foldedSections.add(id); drawOutliner(); });
      if (id === 'user') {
        li.addEventListener('dragover', (e) => { if (outlinerDrag || assetDragOver(e)) { e.preventDefault(); li.classList.add('is-drop'); } });
        li.addEventListener('dragleave', () => li.classList.remove('is-drop'));
        li.addEventListener('drop', (e) => { const dragged = outlinerDrag; endOutlinerDrag(); if (!dragged) return; e.preventDefault(); e.stopPropagation(); moveInOutline(dragged, null, 'top'); });
      }
      return li;
    };
    /** A section's row one level in (the map's own rows and the rules entities have no depth of their own). */
    const indented = (li: HTMLLIElement): HTMLLIElement => {
      treeDepth(li, 1);
      return li;
    };
    // The Filter: a placement shown while yours are and its kind is on (a missing piece by Missing pieces); the map's
    // own rows while the map's are and their kind is; the rules entities by Rules.
    const rowKind = (r: Object3D): string => (r.userData['forgeMissing'] === true ? 'missing' : kindIdOf(r));
    const shown = (r: Object3D): boolean => outlinerShowUser && !outlinerOff.has(rowKind(r));
    /** A placement's row and its children's -- a hidden kind's children lifted to its place, so none is lost from the tree. */
    const filtered = (r: Object3D, depth: number, folded = false): HTMLLIElement[] => {
      const inner = (d: number, f: boolean): HTMLLIElement[] => outlineChildren(r).flatMap((c) => filtered(c, d, f));
      // A folder: drawn while your objects are (it holds only yours).
      if (isFolder(r)) {
        if (!outlinerShowUser) return inner(depth, folded);
        const row = folderRow(r, depth);
        row.hidden = folded;
        return [row, ...inner(depth + 1, folded || foldedRows.has(r))];
      }
      if (!shown(r)) return inner(depth, folded);
      const row = userRow(r, depth);
      row.hidden = folded;                                    // under a folded row: drawn, unseen (a drag may open it)
      return [row, ...inner(depth + 1, folded || foldedRows.has(r))];
    };
    // User Objects: the layout's placements (in the one tree, a level under the section), then the rules entities.
    const userRows = [
      ...(nestedView ? outlineChildren(null).flatMap((r) => filtered(r, 1)) : roots.filter((r) => shown(r) && userMatches(r)).map((r) => userRow(r, 1))),
      ...(outlinerOff.has('rules') ? [] : entityRows.map(indented)),
    ];
    const userCount = userRows.filter((li) => !li.classList.contains('fx-folder-row')).length;
    treeRoots.push(sectionRow('user', 'User Objects', userCount, picks.size > 0 || entityPicked !== null));
    if (!foldedSections.has('user')) {
      const empty = indented(el(doc, 'li', 'fx-empty',
        q ? 'No matches' : roots.length ? 'Nothing the Filter shows' : 'Nothing placed yet: choose a prop, then click the world'));
      empty.dataset['userEmpty'] = '';                         // an asset tile dropped here is placed (`dropAssetInOutline`)
      treeRoots.push(...(userRows.length ? userRows : [empty]));
    }
    // Map Objects: the base map's own, read only, by kind as the Overlays menu lists them.
    if (baseMap) {
      // A group a kind (`openMapKinds`; the Outliner's own, never the layout's): its rows a level under it.
      const kinds = outlinerShowMap ? billboardRows().flatMap((row) => {
        if (!('toggle' in row) || outlinerOff.has(row.toggle.id)) return [];
        const rows = mapRowsOf(row.toggle.id);
        return rows.length ? [{ id: row.toggle.id, label: row.toggle.label, rows }] : [];
      }) : [];
      mapKindsHoldingSelection = [];
      const mapCount = kinds.reduce((n, k) => n + k.rows.length, 0);
      treeRoots.push(sectionRow('map', 'Map Objects', mapCount, basePicks.size > 0 || dataPicks.size > 0 || mapDataSelected !== null));
      if (!foldedSections.has('map')) {
        if (!kinds.length) treeRoots.push(indented(el(doc, 'li', 'fx-empty', q ? 'No matches' : 'Nothing the Filter shows')));
        for (const k of kinds) {
          // A search shows its matches unfolded; else the kind's own fold.
          const open = !!q || openMapKinds.has(k.id);
          const li = el(doc, 'li', 'fx-folder-row fx-map-kind');
          li.dataset['mapKind'] = k.id;
          treeDepth(li, 1);
          const caret = el(doc, 'button', 'fx-tree-caret fx-row-caret', open ? '▾' : '▸');
          caret.type = 'button';
          caret.tabIndex = -1;
          caret.setAttribute('aria-hidden', 'true');
          li.append(caret);
          li.insertAdjacentHTML('beforeend', icon('folder'));
          li.append(el(doc, 'span', 'fx-row-label', k.label), el(doc, 'span', 'fx-dim', String(k.rows.length)));
          li.setAttribute('aria-expanded', String(open));
          li.title = `The map's ${k.label.toLowerCase()}: click to ${open ? 'fold' : 'show'} them`;
          const holds = !open && k.rows.some((r) => r.classList.contains('is-on'));
          if (holds) mapKindsHoldingSelection.push(k.id);
          li.classList.toggle('is-implicit', holds);
          li.addEventListener('click', () => { if (open) openMapKinds.delete(k.id); else openMapKinds.add(k.id); drawOutliner(); });
          treeRoots.push(li);
          if (open) for (const r of k.rows) {
            treeDepth(r, 2);
            const room = el(doc, 'i', 'fx-row-caret fx-row-caret-room');   // a caret's room, as a leaf's: its icon under the kind's
            room.setAttribute('aria-hidden', 'true');
            r.prepend(room);
            treeRoots.push(r);
          }
        }
      }
    }
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
    ambient: 'An ambient effect: the map\'s fire, smoke, water or weather, playing from the round\'s start',
    spawnA: 'A team A spawn: it faces the way you look',
    spawnB: 'A team B spawn: it faces the way you look',
    hostage: 'A hostage, beside the map\'s own: Escort and Extraction play them',
    zone: 'An extraction zone (Safety, Safety2...), beside the map\'s own: Extraction plays them',
    door: "A door: a copy of a disc map's own (its swing, its reach), its hinge at the click; the rotate gizmo turns it",
    turret: "A turret: a copy of a disc map's own (its definition, weapon and limits), facing the way you look",
    ladder: "A ladder: a disc map's own ladder prop, its foot at the click, facing the way you look; climbable in Play",
    flare: "A flare: one of a disc map's glows (its facade node alone), turned to the camera; the Inspector's Map and Flare change it",
    gate: "A gate: a copy of a disc map's own, its lever prompt at the gate; the lever slides it, C4 or an RPG wrecks it",
    barrier: "A damage trigger: a copy of a disc map's own destructible -- a C4 barrier (C4 or an RPG) or a hit trigger (any hit, never C4)",
    switch: "A gate's switch: a copy of its gate's own disc lever panel; pulling it slides the gate (the Inspector's Gate links it)",
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
      : ({ place: 'PLACE', select: 'SELECT', spawnA: 'SPAWN A', spawnB: 'SPAWN B', respawnA: 'RESPAWN A', respawnB: 'RESPAWN B', npc: 'NPC', hostage: 'HOSTAGE', zone: 'ZONE', turret: 'TURRET', door: 'DOOR', gate: 'GATE', barrier: 'DAMAGE TRIGGER', switch: 'SWITCH', ladder: 'LADDER', flare: 'FLARE', point: 'POINT', view: 'VIEW', bomb: 'BOMB', siteSeal: 'SITE SEAL', siteTerrorist: 'SITE TERRORIST', ambient: 'EFFECT' } as const)[mode];
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
    // A selected folder stays selected while every shown placement it holds is picked and no map prop, map item or rules
    // entity is (a plain selection elsewhere, `select`, lets it go).
    if (folderPicks.size) {
      if (basePicks.size || dataPicks.size || mapDataSelected || entityPicked !== null) folderPicks.clear();
      for (const f of [...folderPicks]) {
        const held = descendantsOf(f).filter((o) => roots.includes(o) && !editorHiddenNow(o));
        if (!folders.includes(f) || held.some((o) => !picks.has(o))) folderPicks.delete(f);
      }
    }
    selected =picks.size === 1 && basePicks.size === 0 ? picks.items[0]! : null;
    baseSelected = basePicks.size === 1 && picks.size === 0 ? basePicks.items[0]! : null;
    // A prop being re-placed follows the cursor: no gizmo on it meanwhile.
    // A locked placement is selected and inspected, never moved (the owner, 2026-11-11): no gizmo on it, nor on a group
    // of locked ones alone (a group with some unlocked moves those: `sources` below).
    const anyMovable = picks.items.some((r) => !lockedOf(r));
    const on = replacing ? null : selected ? (lockedOf(selected) ? null : selected)
      : (baseSelected ? mapPropProxy : isGroup() && anyMovable ? pivot : mapDataMoving().length ? mapDataProxy
        : inspectedEntity() && !editsLocked() ? entityProxy : null);
    if (on === entityProxy) {
      const entity = inspectedEntity();
      if (entity) entityProxy.position.set(...entity.at);
      entityProxy.quaternion.identity();
      entityProxy.updateMatrixWorld(true);
    }
    if (on === mapDataProxy) {
      mapDataProxy.position.set(...mapDataCentre(mapDataMoving()));
      mapDataProxy.quaternion.identity();
      mapDataProxy.updateMatrixWorld(true);
    }
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
    // A locked placement is never deleted: Delete greyed while only locked ones are picked.
    delBtn.disabled = picks.items.filter((r) => !lockedOf(r)).length + basePicks.size + dataPicks.size + folderPicks.size === 0 && entityPicked === null && !(mapDataSelected && hiddenDataKeyOf(mapDataSelected));   // FCW-32 step 4: an entity's row too
    const unlocking = picks.size === 0 && lockHeld.length > 0;
    lockBtn.disabled = (picks.size === 0 && !unlocking) || editsLocked();
    // A lock's icon, not its word (the owner, 2026-11-11): shut while the placement is locked, open while not.
    lockBtn.innerHTML = icon(unlocking ? 'locked' : 'unlocked');
    lockBtn.setAttribute('aria-label', unlocking ? 'Unlock' : 'Lock');
    lockBtn.setAttribute('aria-pressed', String(unlocking));
    lockBtn.classList.toggle('is-on', unlocking);
    // Nothing to lock or unlock: no lock drawn in the head at all.
    lockBtn.hidden = picks.size === 0 && !unlocking;
    lockBtn.title = unlocking
      ? 'Unlock: it can be moved, edited and deleted again'
      : 'Lock the selection: still selectable and inspected, but it cannot be moved, edited or deleted until it is unlocked';
    refreshBox();
    refreshInspector();
    drawOutliner();
    highlightSelectionMark();                                  // a selected map data item's mark, or a map prop's
  };
  /** That one alone (a plain click), or nothing selected (Circle's tap, Esc): the group cleared. */
  const lockedOf = (r: Object3D): boolean => r.userData['forgeLock'] === true;
  // A locked placement is selectable (the owner, 2026-11-11: "selectable, but not deletable or editable"): its Inspector
  // shows it, every edit of it refused (no gizmo, its fields greyed, Delete and Cut pass it over).
  const select = (o: Object3D | null): void => {
    if (o === null) lockHeld = [];                            // a deselect lets the just-locked go
    if (o === null && mapDataSelected) { mapDataSelected = null; mapBillboards.highlight(null); }   // and a map data item
    dataPicks.clear();                                       // and the map objectives a box picked
    if (replacing && o !== replacing.r) { endReplace(true); setMode('select'); }   // another selection: the re-placed prop back
    // FCW-32 step 4 fold F3: nothing selected drops a picked rules entity too (Circle, Escape, a click on empty ground).
    if (o === null && entityPicked !== null) { entityPicked = null; drawRulesScene(); }
    folderPicks.clear();                                        // a placement (or nothing) selected lets a folder go
    picks.only(o);
    basePicks.clear();
    showSelection();
  };
  /**
   * One of the base map's own data items selected by its key (its Outliner row, its billboard): every other selection
   * let go, its billboard drawn larger, the Inspector naming it -- read only, nothing to move.
   */
  /** The last Map Data row clicked: a Shift range runs from it. */
  let mapDataAnchor: string | null = null;
  /**
   * Map Data rows picked together from the Outliner (the owner, 2026-11-06): a Shift range from the anchor, or a Ctrl
   * toggle -- any map data, read only ones too, held with a box's picks (`dataPicks`): highlighted, framed, and the
   * deletable ones taken out by Delete. Every other selection let go.
   */
  const pickMapDataRows = (li: HTMLElement, key: string, how: 'range' | 'toggle'): void => {
    if (replacing) { endReplace(true); setMode('select'); }
    if (mapDataSelected) { dataPicks.set(mapDataSelected.key, mapDataSelected); mapDataSelected = null; }
    if (how === 'toggle') {
      const item = mapDataIndex.get(key);
      if (dataPicks.has(key)) dataPicks.delete(key); else if (item) dataPicks.set(key, item);
      mapDataAnchor = key;
    } else {
      const tree = li.closest('ul, ol')?.parentElement?.closest('[role="tree"], .fx-outliner, .fx-section') ?? li.ownerDocument;
      const order = Array.from(tree.querySelectorAll<HTMLElement>('[data-map-key]')).map((row) => row.dataset['mapKey']!);
      const to = order.indexOf(key);
      const from = mapDataAnchor ? order.indexOf(mapDataAnchor) : -1;
      const [a, b] = from < 0 ? [to, to] : [Math.min(from, to), Math.max(from, to)];
      dataPicks.clear();
      for (const k of order.slice(a, b + 1)) { const item = mapDataIndex.get(k); if (item) dataPicks.set(k, item); }
    }
    picks.clear();
    basePicks.clear();
    if (entityPicked !== null) { entityPicked = null; drawRulesScene(); }
    showSelection();
    highlightSelectionMark();
    drawOutliner();
    const deletable = [...dataPicks.values()].filter((spec) => hiddenDataKeyOf(spec) !== null).length;
    say(`${dataPicks.size} map item${dataPicks.size === 1 ? '' : 's'} selected${deletable < dataPicks.size ? ` · ${deletable} can be deleted, the rest are read only` : ''}`);
  };
  const selectMapData = (key: string): void => {
    const item = mapDataIndex.get(key);
    if (!item) return;
    dataPicks.clear();
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
    for (const r of picks.items) for (let a = parentOf.get(r); a; a = parentOf.get(a)) if (foldedRows.delete(a)) opened = true;
    for (const k of mapKindsHoldingSelection) if (!openMapKinds.has(k)) { openMapKinds.add(k); opened = true; }
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
    // Map items picked together (a box, the Outliner's Shift / Ctrl): their places, each with a little room round it.
    for (const spec of dataPicks.values()) bounds.union(new Box3().setFromCenterAndSize(new Vector3(...spec.at), new Vector3(20, 20, 20).addScalar(spec.reach ?? 0)));
    focusOnBounds(bounds);
  };
  const setMode = (m: Mode): void => {
    // A tool the layout's game type does not play (`refreshModeTools`): its key or the pad's row refused, and said.
    if (modeBtns[m].disabled && modeBtns[m].dataset['forgeModeOff'] === 'true') {
      const types = MODE_TOOL_TYPES[m];
      notifier.refused(types ? modeToolWhy(types) : 'This tool is off for this game type');
      return;
    }
    // Another object chosen: the wheel's turn belongs to the one it turned (a prop's own asset change: `newAssetChosen`).
    if (m !== 'select' && m !== 'place' && m !== lastPlacee) { queuedTurn = 0; wheelTravel = 0; }
    if (entityTool !== null) { entityTool = null; rulesChanged(); }   // FCW-32 step 4: another tool ends the entity's place mode
    if (replacing && m !== 'place') endReplace(true);         // another tool puts a re-placed prop back
    mode = m;
    if (m !== 'select') { lastPlacee = m; showPlacee(m); }
    // Select or Place lit; the object Place places marked in its row (a prop's: the assets' chosen tile).
    for (const [k, b] of Object.entries(modeBtns)) b.classList.toggle('is-on', k === 'place' ? m !== 'select' : k === m);
    input.classList.toggle('is-placing', m !== 'select');
    refreshHint();
    syncGhost();
  };
  /** The re-place ended: the prop put back where it was (`restore`), or left where it is; the surfaces with it again. */
  const endReplace = (restore: boolean): void => {
    const was = replacing;
    if (!was) return;
    replacing = null;
    if (restore) for (const [o, at] of was.starts) if (roots.includes(o)) { o.position.copy(at.position); o.quaternion.copy(at.quaternion); o.updateMatrix(); }
    refreshPlacementGround();
    refreshBox();
  };
  /**
   * The placements the Place tool can pick up: the selection's unlocked ones (a prop, a marker, an object), its lead the
   * one selected last (else the first); none under a lobby's hold or in Play.
   */
  const replaceable = (): { lead: Object3D; all: Object3D[] } | null => {
    if (editsLocked() || playing || baseSelected) return null;
    const all = picks.items.filter((o) => roots.includes(o) && !lockedOf(o));
    if (!all.length) return null;
    const lead = selected && all.includes(selected) ? selected : all[0]!;
    return { lead, all };
  };
  /**
   * The Place tool, from its button or its key: with one placed user prop selected it picks that prop up (`replacing`) --
   * it follows the cursor on the surface below, a click puts it down, Escape puts it back; with none, the Place tool as
   * it always was (the chosen prop's ghost).
   */
  const enterPlace = (): void => {
    const picked = replacing ? null : replaceable();
    if (!picked) { setMode(lastPlacee); return; }             // the last object placed (a prop: the assets' chosen)
    const r = picked.lead;
    r.updateMatrix();
    const others = picked.all.filter((o) => o !== r).map((o) => { o.updateMatrix(); return { r: o, rel: r.matrix.clone().invert().multiply(o.matrix) }; });
    const follow = followersOf(picked.all);
    const moving = new Set<Object3D>([...picked.all, ...follow.map((f) => f.r)]);
    const starts = new Map([...moving].map((o) => [o, { position: o.position.clone(), quaternion: o.quaternion.clone() }] as const));
    replacing = { r, position: r.position.clone(), quaternion: r.quaternion.clone(), before: selectionIds(), others, follow, starts, moving };
    refreshPlacementGround();                                  // its own hull out of the surfaces it rests on
    setMode('place');
    showSelection();                                           // no gizmo while it follows the cursor
    say(`placing ${moving.size > 1 ? `${nameOf(r)} and ${moving.size - 1} more` : nameOf(r)}: click to put ${moving.size > 1 ? 'them' : 'it'} down · the wheel turns ${moving.size > 1 ? 'them' : 'it'} · Esc puts ${moving.size > 1 ? 'them' : 'it'} back`);
  };
  /**
   * The re-placed prop put down at `at`: one Move, it selected, then the Place tool on its asset -- more copies placed as
   * a click in the asset browser would place them. A pack's piece (its reference is not the asset key `chosen` holds) or a
   * missing one's stand-in has no such Place tool: the Select tool then.
   */
  const commitReplace = (at: Vector3 | null): void => {
    const was = replacing;
    if (!was) return;
    if (at) seatOn(was.r, at);                                   // null: already put down (on a wall, `wallPose`)
    carryReplace();
    endReplace(false);
    const asset = was.r.userData['forgePiece'] as string | undefined;
    const many = was.others.length > 0;
    const again = !many && !!asset && !asset.startsWith(PACK_ASSET_PREFIX) && !was.r.userData['forgeMissing'];
    personEdit('piece.move', { refs: selectionIds() }, () => {
      setMode('select');
      if (many) { picks.clear(); picks.addAll([was.r, ...was.others.map((o) => o.r)]); showSelection(); } else select(was.r);
      refreshBox();
      edit(was.before);
      if (again && asset) choosePaletteRow(asset);             // place more of it, as from the asset browser
      say(again ? `placed ${nameOf(was.r)} · click to place another · Esc stops` : `placed ${nameOf(was.r)}`);
    }, true);
  };
  const setGizmoSpace = (space: 'world' | 'local'): void => {
    gizmoSpace = space;
    gizmo.setSpace(space);
    spaceBtn.innerHTML = `${icon(space)}<span>${space === 'world' ? 'World' : 'Local'}</span>`;
    spaceBtn.setAttribute('aria-pressed', String(space === 'local'));
    spaceBtn.title = space === 'world' ? "The gizmo on the world's axes; press for the selection's own (Local)" : "The gizmo on the selection's own axes; press for the world's (World)";
    spaceBtn.title += key('Q');
    writeView();
  };
  const setGizmo = (m: 'translate' | 'rotate' | 'scale'): void => {
    gizmo.setMode(m);
    moveBtn.classList.toggle('is-on', m === 'translate');
    turnBtn.classList.toggle('is-on', m === 'rotate');
    scaleBtn.classList.toggle('is-on', m === 'scale');
    showSelection();
  };
  /**
   * The two snaps (the owner, 2026-11-11: "independent toggles"): `grid` the moves' and placements' (the gizmo's
   * translation, the ghost on the grid step), `turn` the turns' (the gizmo's rotation, a placement's yaw); each left as it
   * is where not given.
   */
  const setSnaps = (grid: boolean, turn: boolean = turnSnap): void => {
    snap = grid;
    turnSnap = turn;
    // FUI-22 review F1: with the turn snap on the queued prop's carried turn stays on the turn step's grid (a changed step re-rounds it).
    if (turn && queuedTurn !== 0 && turnStep > 0) { queuedTurn = (((Math.round(queuedTurn / turnStep) * turnStep) % 360) + 360) % 360; moveGhost(lastNdc); }
    gizmo.setTranslationSnap(grid ? gridStep : null);
    gizmo.setRotationSnap(turn ? (turnStep * Math.PI) / 180 : null);
    drawPlacement();
    writeView();
  };
  /** Snap on or off as one (G, the pad's L3, the menu's Snap row): both snaps. */
  const setSnap = (on: boolean): void => setSnaps(on, on);
  /** Whether any snap is on (what G and L3 turn off). */
  const snapAny = (): boolean => snap || turnSnap;
  // A view setting, no edit: applied live as it is scrubbed (`input` from `./scrub`, the field not focused), and at the
  // release or a typed value's Enter (`change`) -- a half-typed value is never clamped under the typing.
  const applyGridStep = (): void => {
    gridStep = boundStep(Number(viewportGridIn.value), GRID_STEP_MIN, GRID_STEP_MAX, DEFAULT_GRID_STEP);
    setSnaps(snap);
  };
  const applyTurnStep = (): void => {
    turnStep = boundStep(Number(viewportTurnIn.value), TURN_STEP_MIN, TURN_STEP_MAX, DEFAULT_TURN_STEP);
    setSnaps(snap);
  };
  for (const [input, apply] of [[viewportGridIn, applyGridStep], [viewportTurnIn, applyTurnStep]] as const) {
    input.addEventListener('change', apply);
    input.addEventListener('input', () => { if (doc.activeElement !== input) apply(); });
  }
  surfaceIn.addEventListener('change', () => { surfaceSnap = surfaceIn.checked; drawPlacement(); writeView(); });
  const applySurfaceOffset = (): void => {
    const v = Number(surfaceOffsetIn.value);
    surfaceOffset = Number.isFinite(v) ? v : 0;
    writeView();
  };
  surfaceOffsetIn.addEventListener('change', applySurfaceOffset);
  surfaceOffsetIn.addEventListener('input', () => { if (doc.activeElement !== surfaceOffsetIn) applySurfaceOffset(); });
  gridSnapUi.toggle.addEventListener('click', () => setSnaps(!snap));
  turnSnapUi.toggle.addEventListener('click', () => setSnaps(snap, !turnSnap));
  // A step from a dropdown's ladder: taken as a typed one is, its dropdown shut.
  for (const [ui, input, apply] of [[gridSnapUi, viewportGridIn, applyGridStep], [turnSnapUi, viewportTurnIn, applyTurnStep]] as const) {
    for (const b of ui.presets) b.addEventListener('click', () => { input.value = b.dataset['step'] ?? input.value; apply(); ui.menu.open = false; });
  }
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
    // A prop's queue cleared (nothing chosen); an object's placing ended alike, the object kept for the Place button.
    const was = mode === 'place' ? chosen : mode === 'select' ? null : TOOL_NAMES[mode];
    if (mode === 'place') chosen = null;
    queuedTurn = 0; wheelTravel = 0;
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
      carryReplace();
      refreshBox();
      say(`placing ${nameOf(replacing.r)} · the wheel turns it ${turnStep}°`);
      return;
    }
    queuedTurn = (((queuedTurn + deg) % 360) + 360) % 360;
    moveGhost(lastNdc);
    const shown = queuedTurn > 180 ? queuedTurn - 360 : queuedTurn;
    say(`placing ${mode === 'place' ? chosen ?? '' : TOOL_NAMES[mode]} · turned ${shown}° · the wheel turns it ${turnStep}°`);
  };
  /**
   * An ambient effect's sounds previewed (the owner, 2026-11-10: "allow me to play them in the asset browser"; `./previewAssets`):
   * the program's own sounds (`ambientProgramsOf`) on an audio of the preview's own; one at a time, the last one stopped.
   */
  /**
   * Each map's sounds' script entries (`@s2u/sound` `SoundParams`: RANGE, one-shot, volume, doppler), read once a map
   * (`./previewAssets` `previewSounds`) for the ambient effects' hearing (`ambientSoundsOf`); null till read.
   */
  const soundParamsOf = new Map<string, Map<string, { range: [number, number] | null; oneShot: boolean; volume?: number; doppler: boolean }> | null>();
  const soundParamsAsked = new Set<string>();
  const soundParamsFor = (stem: string): Map<string, { range: [number, number] | null; oneShot: boolean; volume?: number; doppler: boolean }> | null => {
    if (!soundParamsAsked.has(stem)) {
      soundParamsAsked.add(stem);
      void previewSounds(archives.sourceRequest(), stem).then((got) => {
        soundParamsOf.set(stem, new Map((got?.data.params ?? []) as [string, { range: [number, number] | null; oneShot: boolean; volume?: number; doppler: boolean }][]));
        ambientGuideKey = '';
        refreshInspector();
      });
    }
    return soundParamsOf.get(stem) ?? null;
  };
  /** A map already read for its objects (`hostageLibOf`), at once; else it is read, the guides and the Inspector redrawn then. */
  const libsNow = new Map<string, LoadedMap | null>();
  const hostageLibNow = (stem: string): LoadedMap | null => {
    if (libsNow.has(stem)) return libsNow.get(stem)!;
    void hostageLibOf(stem).then((l) => { if (!libsNow.has(stem)) { libsNow.set(stem, l); ambientGuideKey = ''; refreshInspector(); } });
    return null;
  };
  /** The base map's own ambient effects for Map Data: its programs the Ambient tool offers (`ambientProgramsOf`), placed. */
  const mapAmbientPlaces = (): NonNullable<LoadedMap['ambientPlaces']> => {
    if (!baseMap?.ambientPlaces?.length) return [];
    const offered = new Set(ambientProgramsOf(baseMap).map((a) => a.name));
    return baseMap.ambientPlaces.filter((a) => offered.has(a.program));
  };
  /** An ambient effect's program as its map holds it (`ambientProgramsOf`), once its map is read; null till then. */
  const ambientProgramNow = (o: ForgeObjectData): AmbientProgram | null => {
    if (o.kind !== 'ambient' || !o.source) return null;
    const lib = hostageLibNow(o.source);
    return lib ? ambientProgramsOf(lib).find((x) => x.name === o.name) ?? null : null;
  };
  /** Each of an ambient effect's sounds with its hearing (its RANGE, else the default), once its map's sounds are read. */
  const ambientSoundsOf = (o: ForgeObjectData, script?: EditorScript): { name: string; range: [number, number]; loop: boolean; volume: number | null; doppler: boolean }[] | null => {
    // A script's: each sound it plays, at its own RANGE.
    if (script) {
      const out: { name: string; range: [number, number]; loop: boolean; volume: number | null; doppler: boolean }[] = [];
      for (const st of script.steps) {
        if (st.do !== 'sound' || !st.name) continue;
        const params = soundParamsFor(st.from && !st.from.startsWith('*') ? st.from : scriptHome());
        if (!params) return null;
        const p = params.get(st.name) ?? params.get(st.name.trim());
        out.push({ name: st.name, range: p?.range ?? AMBIENT_DEFAULT_RANGE, loop: st.name.startsWith('~'), volume: st.volume ?? null, doppler: p?.doppler ?? false });
      }
      return out;
    }
    const prog = ambientProgramNow(o);
    if (!prog || !o.source) return null;
    const params = soundParamsFor(o.source);
    if (!params) return null;
    return prog.sounds.map((n) => {
      const p = params.get(n) ?? params.get(n.trim());
      return { name: n, range: p?.range ?? AMBIENT_DEFAULT_RANGE, loop: p ? !p.oneShot : false, volume: p?.volume ?? null, doppler: p?.doppler ?? false };
    });
  };
  /**
   * The ambient effects' hearing in the viewport (the owner, 2026-11-10: "add the ambient to the view dropdown and
   * viewport"; an editor guide): about each placed ambient effect with a sound, a sphere at its loudest sound's silent
   * distance (RANGE max: heard nowhere past it) and a ring at its full-volume distance (RANGE min) -- `FUN_00342670`'s
   * falloff, the sound's own; shown with the View's Ambient effects switch (`userAmbients`), never in Play.
   */
  const ambientGuides = overlayLines([], AMBIENT_GUIDE_COLOUR, 'forge guide userAmbients');
  ambientGuides.userData['forgeGuideKind'] = 'userAmbients';
  scene.add(ambientGuides);
  let ambientGuideKey = '';
  /**
   * Taken out (the owner, 2026-11-13: "remove the sphere gizmo from effects ... it clogs up the viewport"): no effect
   * draws its hearing; the switch kept off so a guide drawn before stays unseen. The drawing below is kept for a return.
   */
  const AMBIENT_GUIDES_SHOWN = false;
  const syncAmbientGuides = (): void => {
    if (!AMBIENT_GUIDES_SHOWN) { ambientGuides.visible = false; return; }
    const pts: number[] = [];
    for (const r of roots) {
      const o = objectOf(r);
      if (o?.kind !== 'ambient') continue;
      const sounds = ambientSoundsOf(o, objectScript.get(r));
      if (!sounds?.length) continue;
      const max = Math.max(...sounds.map((x) => x.range[1])), min = Math.max(...sounds.map((x) => x.range[0]));
      const at = [r.position.x, r.position.y, r.position.z];
      if (max > 0) pts.push(...sphereSegments(at, max, 3, 6, 48));
      if (min > 0 && min < max) pts.push(...bombSiteShapes(at, min, -1).segments);
    }
    const key = pts.length ? `${pts.length}:${pts[0]!.toFixed(1)}:${pts[pts.length - 1]!.toFixed(1)}` : '';
    if (key !== ambientGuideKey) {
      ambientGuideKey = key;
      ambientGuides.geometry.setAttribute('position', new BufferAttribute(new Float32Array(pts), 3));
      ambientGuides.geometry.computeBoundingSphere();
    }
    ambientGuides.visible = pts.length > 0 && view.spawns && !playing && guideShown('userAmbients');
  };
  let ambientAudio: { stop(): void; timeline?(): { fraction: number } | null } | null = null;
  /** The ambient effect sounding now (`<map>:<program>`): what the Inspector's one Play / Stop button reads. */
  let ambientPlaying: string | null = null;
  const stopAmbientPreview = (): void => { ambientAudio?.stop(); ambientAudio = null; ambientPlaying = null; drawAmbientPlayButtons(); };
  /**
   * The asset browser's ambient tiles' sound buttons (the owner, 2026-11-11: "when they are playing change the button to
   * a stop"): ■ on the effect sounding now (a press stops it), ▶ on every other (a press plays it, any other stopped).
   */
  const drawAmbientPlayButtons = (): void => {
    for (const b of doc.querySelectorAll<HTMLButtonElement>('button[data-ambient-sound]')) {
      const on = b.dataset['ambientSound'] === ambientPlaying;
      b.textContent = on ? '■' : '▶';
      b.classList.toggle('is-on', on);
      b.title = on ? 'Stop its sound' : 'Play its sound';
      b.setAttribute('aria-label', `${on ? 'Stop' : 'Play'} ${b.dataset['ambientName'] ?? ''}'s sound`);
      b.setAttribute('aria-pressed', String(on));
    }
  };
  /**
   * The Inspector's one sound button (the owner, 2026-11-10: "make the play/pause button a single button"): Play while
   * this effect is silent, Stop while it sounds; a press plays it (any other stopped) or stops it.
   */
  const ambientSoundButton = (source: string, name: string): InspectorEditor => {
    const key = `${source}:${name}`, on = ambientPlaying === key;
    return { label: 'Sound', kind: 'button', value: on ? '■ Stop' : '▶ Play', title: on ? 'Stop its sound' : 'Play its sounds here (a loop plays until Stop)',
      set: () => { if (ambientPlaying === key) { stopAmbientPreview(); refreshInspector(); } else void previewAmbientSound(source, name).then(() => refreshInspector()); } };
  };
  /** One sound of a map's played here (`playAmbientSounds`): a loop until Stop, a one-shot once. */
  const previewSoundNamed = async (source: string, sound: string): Promise<void> => {
    stopAmbientPreview();
    const h = await playAmbientSounds(archives.sourceRequest(), source, [sound]);
    ambientAudio = h;
    ambientPlaying = h.played ? `${source}:${sound}#sound` : null;
    say(h.played ? `${source}: playing ${sound}` : `${source}: ${sound} would not play`, !h.played);
  };
  /** A sound's Play / Stop button (`previewSoundNamed`), as the ambient effect's one. */
  const previewSoundButton = (source: string, sound: string): InspectorEditor => {
    const key = `${source}:${sound}#sound`, on = ambientPlaying === key;
    return { label: 'Hear', kind: 'button', value: on ? '\u25a0 Stop' : '\u25b6 Play', title: on ? 'Stop it' : 'Play this sound here (a loop plays until Stop)',
      set: () => { if (ambientPlaying === key) { stopAmbientPreview(); refreshInspector(); } else void previewSoundNamed(source, sound).then(() => refreshInspector()); } };
  };
  /** `quiet`: no line said (a hover's: a silent effect is no news). */
  const previewAmbientSound = async (source: string, name: string, quiet = false): Promise<void> => {
    stopAmbientPreview();
    // A Sound tile's (`=sound:<sound>`): that sound alone.
    const solo = soundOfAssetName(name);
    const lib = solo === null ? await hostageLibOf(source) : null;
    const p = solo !== null ? { sounds: [solo] } : lib ? ambientProgramsOf(lib).find((x) => x.name === name) : undefined;
    if (!p?.sounds.length) { if (!quiet) say(`${name} plays no sound of its own`); return; }
    // Looped or once, as the asset browser's Loop sounds says; once run out, its ■ a ▶ again.
    const h = await playAmbientSounds(archives.sourceRequest(), source, p.sounds, {
      loop: assetLoopSounds,
      onEnd: () => { if (ambientAudio === h) { ambientAudio = null; ambientPlaying = null; drawAmbientPlayButtons(); refreshInspector(); } },
    });
    ambientAudio = h;
    ambientPlaying = h.played ? `${source}:${name}` : null;
    drawAmbientPlayButtons();
    if (quiet) return;
    say(h.played ? `${name}: playing ${p.sounds.join(', ')}` : `${name}: its sounds would not play (${p.sounds.join(', ')})`, !h.played);
  };
  /**
   * An ambient effect's sounds while its preview shows (the owner, 2026-11-11: "when we are previewing (hovering) over an
   * ambient asset that has a sound ... also play the sound"; a browser adaptation, FG.R2): its tile's ▶ the ■ meanwhile,
   * stopped when the preview goes or shows another. Never what its own ▶ started (that plays until stopped); off with
   * the asset browser's Sound on hover setting (`assetHoverSound`).
   */
  let hoverSoundKey: string | null = null;
  const hoverAmbientSound = (asset: string | null): void => {
    const o = asset ? parseObjectAsset(asset) : null;
    const key = o?.kind === 'ambient' && assetHoverSound ? `${o.source}:${o.name}` : null;
    if (key === hoverSoundKey) return;
    if (hoverSoundKey && ambientPlaying === hoverSoundKey) stopAmbientPreview();   // the last hover's, and only that
    hoverSoundKey = null;
    if (!key || !o || ambientPlaying === key) return;          // nothing to play, or already playing from its ▶
    hoverSoundKey = key;
    void previewAmbientSound(o.source, o.name, true).then(() => {
      // Left before its sounds were read: let them go at once.
      if (hoverSoundKey !== key && ambientPlaying === key) stopAmbientPreview();
    });
  };
  /** An object of the asset browser built as its kind's tool builds it (`newDoor` and the others), unplaced; null for a prop. */
  /** `preview`: for the asset browser's preview -- drawn from the previews' own templates (`PieceLibrary`), the Draw switches' never. */
  const buildObject = async (o: { kind: ObjectKind; source: string; name: string }, preview = false): Promise<Object3D | null> => {
    switch (o.kind) {
      case 'door': return newDoor(o.source, o.name, preview);
      case 'turret': return newTurret(o.source, o.name, preview);
      case 'gate': case 'barrier': return newAccess(o.kind, o.source, o.name, preview);
      case 'flare': return newFlare(o.source, o.name, preview);
      case 'switch': return newSwitch(null, null, o.name !== 'lever' ? { look: o.name as Exclude<SwitchLookId, 'lever'> } : {}, false, preview);
      case 'ambient': return newForgeObject({ kind: 'ambient', source: o.source, name: o.name });
      default: return null;
    }
  };
  /** The tiles of an object tab: the chosen map's copies of that kind (`copyList`), a ladder's as its prop, the switch's looks. */
  /**
   * The Effect tab's tiles (the owner, 2026-11-13: "a unified effect object"): the map's ambient effects, then its single
   * effects (the script's "Play an effect": `scriptNamesOf`, each one not an ambient effect already) and its sounds --
   * each placed as one effect object (`./forgeObjects` `scriptObjectData`: run, wait, again).
   */
  const objectTiles = (kind: Exclude<ObjectTab, 'props' | 'characters'>): { id: string; name: string; meta: string }[] | null => {
    if (kind === 'sound') return soundTiles();
    const own = objectTilesOwn(kind);
    if (kind !== 'ambient') return own;
    const stem = paletteStem();
    const ambient = new Set((own ?? []).map((t) => { const o = parseObjectAsset(t.id); return o ? `${o.source}:${o.name.trim().toLowerCase()}` : ''; }));
    // The called effects: a map's own (its list less what every map has, `scriptCommonNow`, once every map is read), each
    // one not an ambient program already; Common's what every map has, placed from the match's own map.
    const common = scriptCommonNow();
    const effectTile = (m: string, e: string, meta: string) => ({ id: objectAssetId('ambient', m, `${EFFECT_ASSET_PREFIX}${e}`), name: e.trim(), meta });
    const ownEffects = (m: string, n: { sounds: string[]; effects: string[] }) =>
      ownScriptNames(n, 'effect').filter((e) => !ambient.has(`${m}:${e.trim().toLowerCase()}`)).map((e) => effectTile(m, e, `${m} \u00b7 effect, called`));
    const anyMap = stem || scriptHome() || copyMaps()[0]?.[0] || '';
    const commonEffects = (): { id: string; name: string; meta: string }[] => (common?.effects ?? []).map((e) => effectTile(anyMap, e, 'every map \u00b7 effect, called'));
    let more: { id: string; name: string; meta: string }[] | null;
    if (paletteSel.value === PALETTE_COMMON) more = common ? commonEffects() : null;
    else if (!stem && paletteSel.value === PALETTE_ALL) {
      // All: what every map has once, then each map's own (read so far).
      const read = copyMaps().map(([m]) => m).filter((m) => scriptNameLists.has(m));
      more = common ? [...commonEffects(), ...read.flatMap((m) => ownEffects(m, scriptNameLists.get(m)!))] : null;
    } else if (!stem) more = [];
    else { const n = scriptNamesOf(stem); more = n && common ? ownEffects(stem, n) : null; }
    // The Programs filter: the ambient ones (the map's own self-starting programs), the called effects, or both.
    const shown = (list: { id: string; name: string; meta: string }[] | null): typeof list => (list === null ? null
      : list.filter((t) => { const called = effectOfAssetName(parseObjectAsset(t.id)?.name ?? '') !== null; return programFilter === 'all' || (programFilter === 'effect') === called; }));
    return own === null && more === null ? null : shown([...(own ?? []), ...(more ?? [])]);
  };
  /**
   * The Sounds tab's tiles, by the map choice (the owner, 2026-11-13: "each map sound to only refer to sounds for that
   * map"): a map its own sounds -- its list less what every map has (`scriptCommonNow`, once every map is read: null till
   * then) and less the guns' (`weaponSoundsNow`); Common what every map has, the guns' with it; All both, each once. A
   * sound every map has is placed from the match's own map (it is in every map's banks).
   */
  const soundTiles = (): { id: string; name: string; meta: string }[] | null => {
    const stem = paletteStem();
    const tile = (m: string, n: string, meta: string) => ({ id: objectAssetId('ambient', m, `${SOUND_ASSET_PREFIX}${n}`), name: n.trim(), meta });
    const guns = weaponSoundsNow();
    const common = scriptCommonNow();
    // Every map's own and what every map has wait on every map being read, and on the guns' list.
    if (!common || !guns) return null;
    const anyMap = stem || scriptHome() || copyMaps()[0]?.[0] || '';
    const gunNames = new Set(guns.map((g) => g.name));
    const commonTiles = (): { id: string; name: string; meta: string }[] => [
      ...common.sounds.filter((n) => !gunNames.has(n)).map((n) => tile(anyMap, n, 'every map')),
      ...guns.map((g) => tile(anyMap, g.name, `every map \u00b7 ${g.weapon} ${g.kind}`)),
    ];
    const own = (m: string, n: { sounds: string[] }): { id: string; name: string; meta: string }[] =>
      ownScriptNames({ sounds: n.sounds, effects: [] }, 'sound').filter((x) => !gunNames.has(x)).map((x) => tile(m, x, m));
    if (paletteSel.value === PALETTE_COMMON) return commonTiles();
    if (paletteSel.value === PALETTE_ALL) return [...commonTiles(), ...copyMaps().map(([m]) => m).filter((m) => scriptNameLists.has(m)).flatMap((m) => own(m, scriptNameLists.get(m)!))];
    if (!stem) return [];
    const n = scriptNamesOf(stem);
    return n ? own(stem, n) : null;
  };
  /** A tab's own tiles: the chosen map's copies of the kind (`copyList`), a ladder's as its prop, the switch's looks. */
  const objectTilesOwn = (kind: Exclude<ObjectTab, 'props' | 'characters' | 'sound'>): { id: string; name: string; meta: string }[] | null => {
    const stem = paletteStem();
    if (kind === 'switch') {
      // Each look under the map whose object it copies (the owner, 2026-11-13: "these assets don't belong to every map"):
      // the lever panel Death Trap's gate's (`DEFAULT_GATE`), the radio Sujo's (else Enowapi's, `switchLookOf`). All both;
      // Common none (a look is one map's own object).
      const home = (look: SwitchLookId): string => (look === 'radio' ? RADIO_LOOK_SOURCES.find((m) => !absent.has(m)) ?? RADIO_LOOK_SOURCES[0] : DEFAULT_GATE.source);
      const tiles = SWITCH_LOOK_TILES.map(([look, word]) => ({ id: objectAssetId('switch', SWITCH_LOOK_SOURCE, look), name: word, meta: home(look), map: home(look) }));
      if (paletteSel.value === PALETTE_ALL) return tiles.map(({ map: _m, ...t }) => t);
      return tiles.filter((t) => t.map === stem).map(({ map: _m, ...t }) => t);
    }
    if (!stem && paletteSel.value === PALETTE_ALL) {
      // All: every map's of the kind (the census's lists, `censusKnown`), each by its map; null till a map is read.
      const maps = copyMaps().map(([m]) => m);
      const read = maps.filter((m) => censusKnown.has(m));
      if (read.length === 0) return null;
      return read.flatMap((m) => (censusKnown.get(m)?.[kind] ?? []).map(([name, label]) => ({
        id: kind === 'ladder' ? assetId(m, name) : objectAssetId(kind, m, name), name: name.trim(),
        meta: [m, ...label.split(' \u00b7 ').slice(1)].join(' \u00b7 '),
      })));
    }
    if (!stem) return [];
    const got = copyList(kind, stem);
    if (!got) return null;
    return got.map(([name, label]) => ({ id: kind === 'ladder' ? assetId(stem, name) : objectAssetId(kind, stem, name), name: name.trim(), meta: label.split(' \u00b7 ').slice(1).join(' \u00b7 ') || stem }));
  };
  /** An object tile's click: that object the Place tool's (`objectChoice`), the tool on its kind. */
  const chooseObject = (kind: Exclude<ObjectTab, 'props' | 'characters'>, id: string): void => {
    if (kind === 'ladder') objectChoice.ladder = id;
    else {
      const o = parseObjectAsset(id);
      if (!o) return;
      if (o.kind === 'switch') objectChoice.switch = o.name as SwitchLookId;
      else objectChoice[o.kind] = { source: o.source, name: o.name };
    }
    queuedTurn = 0; wheelTravel = 0;
    setMode(kind === 'sound' ? 'ambient' : kind);               // a sound is placed as an effect object (`scriptObjectData`)
    syncGhost();
    drawAssets();
    assetTiles?.activate(id);
    say(`placing ${OBJECT_TABS.find(([k]) => k === kind)?.[1] ?? kind}: ${id.slice(id.indexOf(':') + 1)}`);
  };
  /** Whether an object tile is the one the Place tool places now. */
  const objectChosen = (kind: Exclude<ObjectTab, 'props' | 'characters'>, id: string): boolean => {
    if (mode !== (kind === 'sound' ? 'ambient' : kind)) return false;
    if (kind === 'ladder') return objectChoice.ladder === id;
    const o = parseObjectAsset(id);
    const c = o ? (o.kind === 'switch' ? objectChoice.switch ?? 'lever' : objectChoice[o.kind]) : undefined;
    return !!o && (typeof c === 'string' ? c === o.name : !!c && c.source === o.source && c.name === o.name);
  };
  const drawObjects = (kind: Exclude<ObjectTab, 'props' | 'characters'>): void => {
    const q = search.value.trim().toLowerCase();
    const tiles = objectTiles(kind);
    const word = OBJECT_TABS.find(([k]) => k === kind)?.[1] ?? kind;
    const items: HTMLElement[] = [];
    const matched = (tiles ?? []).filter((x) => !q || `${x.name} ${x.meta}`.toLowerCase().includes(q));
    // Favourites: the starred alone; else the starred first, a line, then the rest (as the props are).
    const starred = matched.filter((x) => objectFavs.has(x.id));
    const ordered = filter === 'favs' ? starred : [...starred, ...matched.filter((x) => !objectFavs.has(x.id))];
    for (const t of ordered) {
      if (filter !== 'favs' && starred.length && t === ordered[starred.length]) items.push(el(doc, 'li', 'fx-sep'));
      // A tile as a prop's: its preview, its name, dragged onto the world as one (`assetTiles`: the editor seam's object).
      const li = el(doc, 'li');
      li.dataset['asset'] = t.id;
      li.draggable = true;
      const pick = el(doc, 'button', 'fx-asset-pick');
      pick.type = 'button';
      // A drag starts on the pick itself (a button inside a draggable row does not start one in every browser).
      pick.draggable = true;
      const preview = el(doc, 'span', 'fx-asset-thumbnail');
      const image = doc.createElement('img');
      image.dataset['assetThumbnail'] = '';
      image.dataset['assetId'] = t.id;
      image.alt = '';
      image.setAttribute('aria-hidden', 'true');
      image.loading = 'lazy';
      image.draggable = false;                                 // the tile's drag, never the browser's own image drag
      // A single sound has no picture: its speaker (`fx-asset-sound`), no thumbnail asked for.
      const tileAsset = parseObjectAsset(t.id);
      const soundTile = !!tileAsset && soundOfAssetName(tileAsset.name) !== null;
      if (soundTile) { preview.classList.add('fx-asset-sound'); preview.innerHTML = icon('sound'); }
      else preview.append(image, el(doc, 'span', 'fx-asset-thumbnail-status', 'Loading preview…'));
      // An ambient effect's badges on its picture (the owner, 2026-11-11: "easy at a glance ... which ambient assets are
      // sounds/particles"): a sparks icon where it draws particles, a speaker where it plays sound -- its census's own
      // words (`mapCensus`: "particles + sound + light").
      if (kind === 'ambient') {
        const does = t.meta.split(' · ').find((s) => /\b(particles|sound|light)\b/.test(s)) ?? '';
        const badges = el(doc, 'span', 'fx-asset-badges');
        badges.setAttribute('aria-hidden', 'true');
        for (const [word, art, title] of [['particles', 'particles', 'Particles'], ['sound', 'sound', 'Sound']] as const) {
          if (!new RegExp(`\\b${word}\\b`).test(does)) continue;
          const b = el(doc, 'span', `fx-asset-badge fx-asset-badge--${word}`);
          b.innerHTML = icon(art);
          b.title = title;
          badges.append(b);
        }
        if (badges.childElementCount) preview.append(badges);
      }
      // The tile's own line without what its badges say (particles, sound; the owner, 2026-11-11) -- a light kept, and
      // the whole of it on the preview's info line (`data-asset-info`, below).
      const tileMeta = kind !== 'ambient' ? t.meta : t.meta.split(' · ').map((s) => {
        if (!/\b(particles|sound|light)\b/.test(s)) return s;
        return s.split(' + ').filter((w) => w !== 'particles' && w !== 'sound').join(' + ');
      }).filter(Boolean).join(' · ');
      const copy = el(doc, 'span', 'fx-asset-card-copy');
      copy.append(el(doc, 'span', 'fx-asset-name', t.name), el(doc, 'span', 'fx-dim', tileMeta));
      pick.append(preview, copy);
      li.append(pick);
      const fav = objectFavs.has(t.id);
      const star = el(doc, 'button', 'fx-star');
      star.type = 'button';
      star.innerHTML = icon('star');
      star.title = fav ? 'Remove from favourites' : 'Add to favourites';
      star.setAttribute('aria-label', `${star.title}: ${t.name}`);
      star.classList.toggle('is-on', fav);
      star.addEventListener('click', (e) => { e.stopPropagation(); objectFavs = toggleFavourite(objectFavs, t.id); writeObjectFavourites(objectFavs); drawAssets(); });
      li.prepend(star);
      // An ambient effect's sound, played here (`previewAmbientSound`); its particles are its tile's preview (`ambientPreview`).
      // Only for an effect that plays sound (the owner, 2026-11-11): a particles-only one has nothing to play.
      const playsSound = /\bsound\b/.test(t.meta.split(' · ').find((s) => /\b(particles|sound|light)\b/.test(s)) ?? '');
      if ((kind === 'ambient' && playsSound) || kind === 'sound') {
        const o = parseObjectAsset(t.id);
        const play = el(doc, 'button', 'fx-star fx-asset-play');
        play.type = 'button';
        // Its play button a stop while it sounds (`drawAmbientPlayButtons`): a press plays it, or stops it.
        const soundKey = o ? `${o.source}:${o.name}` : '';
        play.dataset['ambientSound'] = soundKey;
        play.dataset['ambientName'] = t.name;
        play.addEventListener('click', (e) => {
          e.stopPropagation();
          if (!o) return;
          if (ambientPlaying === soundKey) stopAmbientPreview(); else void previewAmbientSound(o.source, o.name);
        });
        li.prepend(play);
      }
      // No browser tooltip on a tile (the owner, 2026-11-11: one popup, the preview's): its words the preview's info line.
      li.dataset['assetInfo'] = `${word}${t.meta ? ` \u00b7 ${t.meta}` : ''}`;
      li.classList.toggle('is-on', objectChosen(kind, t.id));
      li.addEventListener('click', () => { if (assetPick) pickFromBrowser(t.id); else chooseObject(kind, t.id); });
      items.push(li);
    }
    if (items.length === 0) {
      // A map's own sounds wait on every map (what they all have is left out): said so.
      items.push(el(doc, 'li', 'fx-empty', filter === 'favs' && tiles !== null && !q ? `No favourite ${tabWords(word)} here yet: star one to keep it here` : tiles === null ? ((kind === 'sound' || kind === 'ambient') && !scriptCommon
        ? `Reading every map's ${tabWords(word)}, to tell each map's own from what every map has…` : `Reading ${paletteStem() || 'every map'}'s ${tabWords(word)}…`)
        : q ? `No ${tabWords(word)} match` : paletteStem() ? `No ${tabWords(word)} on ${paletteStem()}: choose another map above`
        : paletteSel.value === PALETTE_COMMON ? `A ${word.toLowerCase()} is one map's own: choose a map above for its ${tabWords(word)}` : `Choose a map above for its ${tabWords(word)}`));
    }
    list.replaceChildren(...items);
    drawAmbientPlayButtons();                                   // ▶ or ■, as the sounding one stands
    assetTiles?.redrawn();
    updateAssetThumbnailObservations();
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
  /**
   * The Source's maps, each with what it has of the tab's kind (the owner, 2026-11-13: "the same for the asset browser,
   * depending on which tab is selected", as the Inspector's Map choices count theirs): its count, "loading\u2026" until read,
   * "none" -- greyed, not choosable -- where it has none (the one chosen never greyed). A map's own: its own props,
   * sounds and called effects (none every map has: Common's), its ambient programs, its copies of a scene object's kind,
   * a switch look's map. All and Common as they are.
   */
  const PALETTE_WORDS: Readonly<Record<Exclude<ObjectTab, 'characters'>, readonly [string, string]>> = {
    props: ['prop', 'props'], sound: ['sound', 'sounds'], ambient: ['program', 'programs'], door: ['door', 'doors'], ladder: ['ladder', 'ladders'],
    turret: ['turret', 'turrets'], barrier: ['damage trigger', 'damage triggers'], switch: ['switch', 'switches'], gate: ['gate', 'gates'], flare: ['flare', 'flares'],
  };
  const paletteCountOf = (stem: string, tab: Exclude<ObjectTab, 'characters'>): number | null => {
    if (absent.has(stem)) return 0;
    const census = censusKnown.get(stem);
    switch (tab) {
      case 'props': return ownPropCounts.get(stem) ?? null;
      case 'switch': {
        const radio = RADIO_LOOK_SOURCES.find((m) => !absent.has(m)) ?? RADIO_LOOK_SOURCES[0];
        return Number(stem === DEFAULT_GATE.source) + Number(stem === radio);
      }
      case 'sound': case 'ambient': {
        // Its own: what every map has and the guns' left out, once known.
        const n = scriptNameLists.get(stem), common = scriptCommon, guns = weaponSoundList;
        if (!n || !common || (tab === 'sound' && !guns)) return null;
        if (tab === 'sound') { const g = new Set((guns ?? []).map((x) => x.name)); return ownScriptNames(n, 'sound').filter((x) => !g.has(x)).length; }
        if (!census) return null;
        const ambient = new Set(census.ambient.map(([x]) => x.trim().toLowerCase()));
        return census.ambient.length + ownScriptNames(n, 'effect').filter((e) => !ambient.has(e.trim().toLowerCase())).length;
      }
      default: return census ? census[tab].length : null;
    }
  };
  /** The counts asked for: once the Source is first opened (`paletteSel`'s press), so no map is read before it is. */
  let paletteCountsAsked = false;
  const drawPaletteCounts = (): void => {
    if (!paletteCountsAsked) return;
    const tab: Exclude<ObjectTab, 'characters'> = showChars || objectTab === 'characters' ? 'props' : objectTab;
    // What the tab's counts read: every map's census, and its sounds and effects (with the guns') for those tabs.
    if (tab === 'sound' || tab === 'ambient') { askScriptNames(); if (tab === 'sound') weaponSoundsNow(); }
    askCensus();
    const [one, many] = PALETTE_WORDS[tab];
    for (const o of Array.from(paletteSel.querySelectorAll('option'))) {
      if (o.value.startsWith('*')) continue;                    // All, Common
      const base = o.dataset['base'] ?? (o.dataset['base'] = o.textContent ?? o.value);
      const n = paletteCountOf(o.value, tab);
      const words = n === null ? 'loading\u2026' : n === 0 ? 'none' : `${n} ${n === 1 ? one : many}`;
      // Its name, then its count set right (`optionWithNote`; the closed field reads them as one line).
      if (o.dataset['note'] !== words) { optionWithNote(o, base, words); o.dataset['note'] = words; }
      o.disabled = n === 0 && o.value !== paletteSel.value;
    }
  };
  const drawAssetList = (): void => {
    drawPaletteCounts();
    applyAssetDisplay();
    chipFav.classList.toggle('is-on', !showChars && filter === 'favs');
    chipFav.setAttribute('aria-pressed', String(!showChars && filter === 'favs'));
    chipChars.classList.toggle('is-on', showChars);
    for (const [k, b] of objectTabButtons) { const on = k === 'characters' ? showChars : !showChars && objectTab === k; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', String(on)); }
    // Favourites (on or off) every tab's (the owner, 2026-11-13); the program filter Programs'.
    chipFav.hidden = showChars;
    for (const c of programChips) { c.hidden = showChars || objectTab !== 'ambient'; c.classList.toggle('is-on', c.dataset['programFilter'] === programFilter); }
    search.placeholder = showChars ? 'Search characters…' : objectTab === 'props' ? 'Search props…' : `Search ${tabWords(OBJECT_TABS.find(([k]) => k === objectTab)?.[1] ?? '')}…`;
    if (showChars) { drawCharacters(); return; }
    if (objectTab !== 'props' && objectTab !== 'characters') { drawObjects(objectTab); return; }
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
      // A drag starts on the pick itself (a button inside a draggable row does not start one in every browser).
      pick.draggable = true;
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
      image.draggable = false;                                 // the tile's drag, never the browser's own image drag
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
      li.setAttribute('aria-label', a.model);                  // no browser tooltip: the preview names it (one popup)
      li.classList.toggle('is-on', chosen === a.asset);
      li.addEventListener('click', () => { if (assetPick) pickFromBrowser(a.asset); else choosePaletteRow(a.asset); });
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
  assetHoverSoundToggle.addEventListener('change', () => {
    assetHoverSound = assetHoverSoundToggle.checked;
    if (!assetHoverSound) hoverAmbientSound(null);              // a hover's sound sounding now: stopped
    writeView();
  });
  assetLoopSoundsToggle.addEventListener('change', () => {
    assetLoopSounds = assetLoopSoundsToggle.checked;           // from the next play on
    writeView();
  });
  // The All chip gone (the owner, 2026-11-13: "useless now"): Favourites a toggle, off is every prop.
  chipFav.addEventListener('click', () => { filter = filter === 'favs' && !showChars ? 'all' : 'favs'; showChars = false; drawAssets(); });
  chipChars.addEventListener('click', () => { showChars = true; drawAssets(); });
  /**
   * R6 (the rendered pass's case 8): a palette loaded -- the open START menu redrawn (its Props screen reads the palette at
   * each draw), so it shows the new props without another press. Set once the menu is made.
   */
  let refreshMenuForPalette = (): void => undefined;
  /**
   * The asset browser's All (`PALETTE_ALL`): every map's props read off its census (`archives.props`, one map at a time
   * in the worker), shown as they come -- each map's own, and a prop of a shared library (`libraryProps` `shared`: the
   * Pave Hawk's, the turrets') once, its asset a map's that holds it, one already loaded where one is. Its object tabs
   * are every map's alike (`objectTiles`).
   */
  let everyMapRun = 0;
  const showEveryMap = async (which: string, sharedOnly = false): Promise<void> => {
    const run = ++everyMapRun;
    invalidateAssetThumbnails();
    entriesOfPalette = [];
    paletteLoading = 'All';
    askCensus();                                               // the object tabs' lists, every map's
    drawAssets();
    const stems = entries.filter((e) => !absent.has(e.stem)).map((e) => e.stem);
    // A map already loaded first: its shared props' thumbnails read no other map.
    const loadedFirst = [...new Set([baseMap?.archive ?? '', ...stems])].filter((x) => stems.includes(x));
    const seenShared = new Set<string>();
    const out: PaletteEntry[] = [];
    for (const stem of loadedFirst) {
      const props = await archives.props(stem);
      if (run !== everyMapRun || paletteSel.value !== which) return;
      for (const p of props ?? []) {
        if (sharedOnly && !p.shared) continue;                 // Common: a shared library's models alone
        if (p.shared) {
          const key = `${p.lib.toUpperCase()}:${p.model}`;
          if (seenShared.has(key)) continue;
          seenShared.add(key);
          out.push({ asset: assetId(stem, p.model), model: p.model, placed: p.placed });
        } else out.push({ asset: assetId(stem, p.model), model: p.model, placed: p.placed });
      }
      entriesOfPalette = [...out].sort((a, b) => a.model.localeCompare(b.model));
      drawAssets();
    }
    if (run !== everyMapRun) return;
    paletteLoading = null;
    drawAssets();
    refreshMenuForPalette();
    say(sharedOnly ? `Common: ${entriesOfPalette.length} props of the shared libraries` : `All: ${entriesOfPalette.length} props from ${stems.length} maps`);
  };
  const showPalette = async (stem: string): Promise<void> => {
    everyMapRun++;                                             // a Shared or All still reading stops
    if (stem === PALETTE_ALL) { paletteSel.value = stem; await showEveryMap(stem); return; }
    // Common: the shared libraries' props, from every map (`showEveryMap`'s read, their models alone).
    if (stem === PALETTE_COMMON) { paletteSel.value = stem; await showEveryMap(stem, true); return; }
    invalidateAssetThumbnails();
    paletteSel.value = stem;
    entriesOfPalette = [];
    paletteLoading = stem;
    drawAssets();
    let map: LoadedMap;
    try { map = await archives.load(stem); } finally { if (paletteLoading === stem) paletteLoading = null; }
    if (paletteSel.value !== stem) return;
    // Its own props alone: a shared library's (`libraryProps` `shared`) are Common's.
    const shared = new Set(libraryProps(map).filter((p) => p.shared).map((p) => p.model));
    entriesOfPalette = creatorPalette(map).filter((e) => !shared.has(e.model));
    drawAssets();
    refreshMenuForPalette();
    say(`${labelOf(entries, stem, map.name)} (${stem}): ${entriesOfPalette.length} props of its own${shared.size ? ` (${shared.size} shared: Common)` : ''}`);   // the mission's name, never its raw loc key
  };

  /* ---------- pieces and markers ---------- */
  const addRoot = (r: Object3D): void => { roots.push(r); scene.add(r); publishCreatorPiece(r); applyGizmoDepth(); if (!playing) applyGuides(); };
  /** A copy joins its kind (pieces, then spawns, then NPCs), the order a restore rebuilds, so its row does not move. */
  const addPlacement = (r: Object3D): void => {
    const rank = (o: Object3D): number => o.userData['forgePiece'] ? 0 : o.userData['forgeSpawn'] ? 1 : 2;
    const kind = rank(r);
    const at = roots.findIndex((o) => rank(o) > kind);
    if (at < 0) roots.push(r); else roots.splice(at, 0, r);
    scene.add(r);
    publishCreatorPiece(r);
    if (!playing) applyGuides();                               // its guides under the switches as they stand
  };
  const removeRoot = (r: Object3D): void => {
    // Its children up to its own parent (their world places kept), as an editor's delete of a parent does.
    const up = parentOf.get(r);
    for (const c of [...roots, ...folders]) if (parentOf.get(c) === r) { if (up) parentOf.set(c, up); else parentOf.delete(c); }
    parentOf.delete(r);
    editorHidden.delete(r);
    outlineOrder = outlineOrder.filter((o) => o !== r);
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
  const newPiece = async (asset: string, content?: unknown, preview = false): Promise<Object3D | null> => {
    if (asset === FORGE_BLOCK) return blockPiece();
    // R3-B: a pack's piece (`contentAssetKey`): no disc archive holds it. R6 (3): drawn from its pack when it resolves.
    if (asset.startsWith(PACK_ASSET_PREFIX)) return content ? newContentPiece(content as ContentRef) : null;
    const id = parseAssetId(asset);
    if (!id || absent.has(id.archive)) return null;
    const map = await archives.load(id.archive).catch(() => null);
    if (!map) { pieceSources.delete(id.archive); forgetArchive(id.archive); return null; }
    pieceSources.set(id.archive, map);
    const r = pieces.piece(asset, map, preview);
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
    // The map's own objectives this layout takes out are no rows (`./mapDataHide`).
    const shown = mapDataShown(map);
    const actions = mapActionPlaces(map);
    return {
      ...shown, flares: baseView?.flares?.() ?? [], ladders: mapLadders, ambientPlaces: mapAmbientPlaces(),
      // A context action at the middle of its node's collision, where the player aims (`./actionSummary` `aimPointOf`).
      actions: (shown.actions ?? []).map((a) => { const aim = actions.aims.get(a.path); return aim ? { ...a, aim } : a; }),
      programs: map.meta?.scene?.programs.map((p) => p.program) ?? [],
      destructibles: actions.damage,
    };
  }
  /**
   * The base's context actions' aim points and its destructibles' places, each the middle of its node's collision on the
   * base's whole hull -- read once a map (the hull is the disc's; a hidden prop does not move them).
   */
  const actionPlaces = new WeakMap<LoadedMap, { aims: Map<string, [number, number, number]>; damage: NonNullable<MapDataSource['destructibles']> }>();
  function mapActionPlaces(map: LoadedMap): { aims: Map<string, [number, number, number]>; damage: NonNullable<MapDataSource['destructibles']> } {
    const have = actionPlaces.get(map);
    if (have) return have;
    let polys: WorldPoly[] = [];
    try { polys = map.ground ? groundPolygons(map.ground) : []; } catch { polys = []; }
    const aims = new Map<string, [number, number, number]>();
    for (const a of map.actions ?? []) {
      const p = aimPointOf(polys, a.path);
      if (p) aims.set(a.path, p);
    }
    const damage = (map.meta?.scene?.destructibles ?? []).map((d) => {
      const at = aimPointOf(polys, d.targetPath);
      return { anim: d.anim, targetPath: d.targetPath, health: d.health, shield: d.shield, program: d.program, ...(at ? { at } : {}) };
    });
    const out = { aims, damage };
    actionPlaces.set(map, out);
    return out;
  }
  /**
   * The guide lines' ends: from each context action's mark (its aim, else its node) and each damage trigger's, to the
   * middle of the collision of every node its programs turn on, off or move -- an executed action's own place too --
   * less its own parts and with near ends merged (`linkTargets`).
   */
  function mapActionLinks(map: LoadedMap, polys: readonly WorldPoly[]): { kind: 'actions' | 'damage'; from: [number, number, number]; to: [number, number, number][] }[] {
    const meta = map.meta;
    if (!meta?.scene) return [];
    const libs = new Map(meta.scene.programs.map((p) => [p.program.name.toLowerCase(), p] as const));
    const programs = new Map(meta.scene.programs.map((p) => [p.program.name, p.program] as const));
    const shown = mapDataShown(map).actions ?? [];
    const byValve = (v: string) => shown.find((a) => a.valve.toLowerCase() === v.toLowerCase());
    const place = (p: EffectProgram, scope: string | null): (string | null)[] => {
      const lib = libs.get(p.name.toLowerCase());
      return lib ? placeRefs(meta, p.nodes, lib.search, p.root, scope, lib.parents) : [];
    };
    const { aims } = mapActionPlaces(map);
    const where = (a: { path: string; at: [number, number, number] }): [number, number, number] => aims.get(a.path) ?? a.at;
    const walk = { place, actionAnims: (v: string) => byValve(v)?.anims ?? [], actionPath: (v: string) => byValve(v)?.path ?? null };
    const ends = (paths: string[], extra: [number, number, number][] = []): [number, number, number][] =>
      [...extra, ...paths.flatMap((p) => { const c = aimPointOf(polys, p); return c ? [c] : []; })];
    const out: { kind: 'actions' | 'damage'; from: [number, number, number]; to: [number, number, number][] }[] = [];
    for (const a of shown) {
      if (a.typeCode === ACTION_TYPE_CODES['DOOR']) continue;
      const from = where(a);
      const e = programEffects(a.anims, programs, { ...walk, scope: a.path });
      out.push({ kind: 'actions', from, to: linkTargets(from, ends(e.paths), LINK_NEAR) });
    }
    for (const d of meta.scene.destructibles) {
      const from = aimPointOf(polys, d.targetPath);
      if (!from) continue;
      const e = programEffects([d.program.name], new Map([...programs, [d.program.name, d.program]]), { ...walk, nodes: d.nodes, scope: d.root });
      const executed = e.actions.flatMap((v) => { const a = byValve(v); return a ? [where(a)] : []; });
      out.push({ kind: 'damage', from, to: linkTargets(from, ends(e.paths, executed), LINK_NEAR) });
    }
    return out;
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
    // The spawn slots this map still has (one deleted from it, `./mapDataHide`, no billboard and no cell).
    const slotsNow = baseMap ? mapDataShown(baseMap).slots : [];
    if (baseMap && base?.kind === 'map') overlays.placeSpawns(spawnsFor(baseMap.name) ?? null, slotsNow);
    const specs = baseMap ? billboardSpecs(mapDataGroups(mapDataSource(baseMap), floorUnder), slotsNow, props) : [];
    mapDataIndex = new Map(specs.map((s) => [s.key, s]));
    // A selected item the marks no longer have (hidden since) goes; a new base clears it before (`door:0` is another door).
    if (mapDataSelected && !mapDataIndex.has(mapDataSelected.key)) mapDataSelected = null;
    mapBillboards.set(specs);
    highlightSelectionMark();
    // The light rig's arrows across the map's middle, sized to it; the Environment panel's disc values with them.
    const box = baseView?.box;
    const centre: [number, number, number] = box && !box.isEmpty() ? box.getCenter(new Vector3()).toArray() : [0, 0, 0];
    if (base?.kind === 'blank') lightArrows.set(customRig() ?? libraryRig(), [0, 0, 0], BLANK_RIG_ARROWS_SPAN, blankShadow());   // a new empty map's rig
    else {
      mapArrowsAt = { centre, size: box && !box.isEmpty() ? Math.max(box.max.x - box.min.x, box.max.z - box.min.z) : 0 };
      lightArrows.set(customRig() ?? baseMap?.lightRig ?? null, mapArrowsAt.centre, mapArrowsAt.size, settings.shadowVector ?? baseMap?.shadowVector ?? null);
    }
    // The map's tactical zones' rectangles, each at the floor under its middle (the file places them on the ground plane only).
    if (mapZoneLines) { scene.remove(mapZoneLines); mapZoneLines.geometry.dispose(); (mapZoneLines.material as Material).dispose(); mapZoneLines = null; }
    // The zones this map still has: one deleted from it (`./mapDataHide`) leaves no rectangle behind.
    const tacZones = baseMap ? mapDataShown(baseMap).tac?.zones ?? [] : [];
    if (tacZones.length) {
      mapZoneLines = zoneOutlines(tacZones.map((z) => ({ ...z, y: floorUnder((z.minX + z.maxX) / 2, (z.minZ + z.maxZ) / 2) })));
      scene.add(mapZoneLines);
    }
    drawMapGuides();                                           // its doors' swings, its ladders' climb sides
    applyGizmoDepth();                                         // and those, with the zones' rectangles, drawn as the view has them
    drawEnvironmentPanel();
    syncAiMap(true);                                           // another map: its AI grid, if shown
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
    // Every mark of the selection, a box's or a group's too: each map prop's M, each placement's own, each map item's.
    const keys = new Set<string>([
      ...dataPicks.keys(),
      ...(mapDataSelected ? [mapDataSelected.key] : []),
      ...basePicks.items.map((b) => propMarkKey(b.key)),
      ...picks.items.map((r) => userMarkKeyOf(r)),
    ]);
    mapBillboards.highlight(keys.size ? [...keys] : null);
  }
  /**
   * The user's placements' billboards (`./mapDataBillboards` `setUser`): a mark each -- a piece, a spawn by its team, an
   * NPC, a bomb marker -- keyed `user:<n>` for as long as the placement lives (`userMarkKeys`), rebuilt only when the set
   * of placements changes, and moved over each where it is every frame (`sync`).
   */
  const userMarkKeys = new WeakMap<Object3D, string>();
  let userMarkCount = 0;
  let userMarksOf: readonly Object3D[] = [];
  /** The marks to be rebuilt whatever `roots` holds (the editor's hiding changed: `applyEditorHidden`). */
  let userMarksStale = false;
  function userMarkKeyOf(r: Object3D): string {
    let key = userMarkKeys.get(r);
    if (!key) { key = `user:${++userMarkCount}`; userMarkKeys.set(r, key); }
    return key;
  }
  /** The placement a user mark's key names, or null (a key not of a user mark, or one gone since). */
  const rootOfUserMark = (key: string): Object3D | null =>
    (key.startsWith('user:') ? roots.find((r) => userMarkKeys.get(r) === key) ?? null : null);
  /** A placement's mark kind (`./mapDataBillboards` `userMarkKind`): what its View switch is. */
  function userKindOfRoot(r: Object3D): string | null {
    return userMarkKind({
      piece: !!r.userData['forgePiece'], npc: !!npcOf(r), bomb: bombKindOf(r), hostage: !!r.userData['forgeHostage'], zone: !!r.userData['forgeZone'],
      point: !!r.userData['forgePoint'], view: !!r.userData['forgeView'], turret: !!r.userData['forgeTurret'], door: !!r.userData['forgeDoor'],
      ladder: !!r.userData['forgeLadder'], flare: r.userData['forgeFlare'] !== undefined, gate: !!r.userData['forgeGate'], barrier: !!r.userData['forgeBarrier'] || !!r.userData['forgeTrigger'], switch: !!r.userData['forgeSwitch'], object: objectOf(r)?.kind,
      ...(r.userData['forgeSpawn'] === 'A' || r.userData['forgeSpawn'] === 'B' ? { team: r.userData['forgeSpawn'] as 'A' | 'B' } : {}),
      ...(r.userData['forgeRespawn'] === 'A' || r.userData['forgeRespawn'] === 'B' ? { respawn: r.userData['forgeRespawn'] as 'A' | 'B' } : {}),
    });
  }
  /**
   * Whether a kind of thing can be picked by a click or a box (the owner, 2026-11-06): only while its View switch shows
   * it (the Billboards' kinds, `MAP_DATA_KIND_TOGGLES`; Show billboards off, none) -- map data and user data alike. Props
   * are the exception: they draw themselves, their marks start switched off, and a prop follows the Select settings alone.
   */
  const PROP_MARK_KINDS = new Set(['mapProps', 'userProps']);
  function kindSelectable(kind: string | null | undefined): boolean {
    if (!kind || PROP_MARK_KINDS.has(kind) || selectHidden) return true;
    if (!billboardsOn) return false;
    if (onlyUserData && !isUserMarkKind(kind)) return false;   // Only user data: the map's own not picked
    return !MAP_DATA_KIND_TOGGLES.some((t) => billboardsOff.has(t.id) && t.kinds.includes(kind));
  }
  /**
   * Whether the map props' M billboards show (the owner, 2026-11-06: map props select by them when they do) -- Show
   * billboards on and the View dropdown's Map Data Props on. On: a box picks props by their M alone, a click by its M or
   * the prop. Off: a box and a click both hit-test the props' drawn bodies.
   */
  const propMarksShown = (): boolean => billboardsOn && !billboardsOff.has('mapProps');
  /** A placement a click or a box may pick: its kind shown (`kindSelectable`). */
  const rootSelectable = (r: Object3D): boolean => !editorHiddenNow(r) && kindSelectable(userKindOfRoot(r));
  function syncUserBillboards(): void {
    applyEditorHidden();                                       // the editor's hiding first: a hidden one has no mark
    if (userMarksStale || roots.length !== userMarksOf.length || roots.some((r, i) => r !== userMarksOf[i])) {
      userMarksStale = false;
      userMarksOf = [...roots];
      mapBillboards.setUser(roots.flatMap((r): UserMark[] => {
        const kind = userMarkKind({
          piece: !!r.userData['forgePiece'], npc: !!npcOf(r), bomb: bombKindOf(r), hostage: !!r.userData['forgeHostage'], zone: !!r.userData['forgeZone'], point: !!r.userData['forgePoint'], view: !!r.userData['forgeView'], turret: !!r.userData['forgeTurret'], door: !!r.userData['forgeDoor'], ladder: !!r.userData['forgeLadder'], flare: r.userData['forgeFlare'] !== undefined, gate: !!r.userData['forgeGate'], barrier: !!r.userData['forgeBarrier'] || !!r.userData['forgeTrigger'], switch: !!r.userData['forgeSwitch'], object: objectOf(r)?.kind,
          ...(r.userData['forgeSpawn'] === 'A' || r.userData['forgeSpawn'] === 'B' ? { team: r.userData['forgeSpawn'] as 'A' | 'B' } : {}),
          ...(r.userData['forgeRespawn'] === 'A' || r.userData['forgeRespawn'] === 'B' ? { respawn: r.userData['forgeRespawn'] as 'A' | 'B' } : {}),
        });
        return kind && !editorHiddenNow(r) ? [{ key: userMarkKeyOf(r), kind, label: placedLabel(r), object: r }] : [];
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
      if (replacing?.moving.has(r)) continue;                  // what is being re-placed never rests on itself
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
        hullLines.renderOrder = 10;                         // after the world: its translucent lines blend over what is drawn
        hullLines.visible = view.collision;
        scene.add(hullLines);
      });
    }, 250);
  };
  const duplicateMapPropForDrag = (source: BaseProp, before: string[], take = false): void => {
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
      // Taken over: the original hidden in the same step (FG-17's hide), the copy now the prop.
      if (take) { hiddenKeys.add(source.key); drawHidden(); warnBakedCollision([source.key]); }
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
      if (hullWanted()) scheduleHull();
    }).catch((error: unknown) => {
      console.warn(`forge: ${source.model}'s collision hull would not read`, error);
      say(`Could not load ${source.model}'s collision hull`, true);
    });
  };
  const duplicateUserPropForDrag = (source: Object3D, originalMatrix: Matrix4, before: string[]): void => {
    const asset = source.userData['forgePiece'] as string | undefined;
    // A placed object (a door, a switch, a spawn... -- `markerClone`): cloned whole and renamed.
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
    const stagedGates: Object3D[] = [];
    for (const [kind, list] of [['gate', l.gates], ['barrier', l.barriers]] as const) {
      for (const t of list ?? []) {
        const r = await newAccess(kind, t.source, t.name);
        r.position.set(...t.at);
        r.rotation.y = t.yaw;
        if (t.locked) r.userData['forgeLock'] = true;
        staged.push(r);
        if (kind === 'gate') stagedGates.push(r);
      }
    }
    // The Forge objects (`Layout.objects`), before the scripts that name them (`ScriptTarget` `object`).
    const stagedObjects: Object3D[] = [];
    for (const o of l.objects ?? []) {
      if (o.kind !== 'ambient') continue;
      const r = newForgeObject({ kind: o.kind, source: o.source, name: o.name });
      r.position.set(o.at[0], o.at[1], o.at[2]);
      r.rotation.y = o.yaw;
      if (o.locked) r.userData['forgeLock'] = true;
      staged.push(r);
      stagedObjects.push(r);
    }
    const stagedOwn = { pieces: staged.filter((x) => x.userData['forgePiece']), barriers: staged.filter((x) => x.userData['forgeBarrier']), gates: stagedGates, objects: stagedObjects };
    // The objects' scripts, their targets the staged lists (an object may name a prop, a trigger, a gate or another object).
    (l.objects ?? []).filter((o) => o.kind === 'ambient').forEach((o, k) => { if (o.script && stagedObjects[k]) objectScript.set(stagedObjects[k]!, scriptFromFile(o.script, stagedOwn)); });
    for (const t of l.triggers ?? []) {
      // A custom damage trigger: its object at its place (else at its prop), linked to its prop or map object.
      const r = newTriggerMarker();
      const link = t.node ?? (t.piece !== undefined ? stagedOwn.pieces[t.piece] : undefined);
      if (link) triggerLink.set(r, link);
      pieceTrigger.set(r, { health: t.health, armor: t.armor, shield: t.shield });
      triggerScript.set(r, t.script ? scriptFromFile(t.script, stagedOwn) : { steps: [] });
      const at = t.at ?? (typeof link === 'string' ? targetPlace({ map: link }) : link ? [link.position.x, link.position.y, link.position.z] : null);
      if (at) r.position.set(at[0], at[1], at[2]);
      staged.push(r);
    }
    for (const t of l.switches ?? []) {
      const { look, prompt, range, elevation, points } = t;
      const link = t.node ?? (t.piece !== undefined ? stagedOwn.pieces[t.piece] : undefined);
      const r = await newSwitch(t.gate === undefined ? null : stagedGates[t.gate] ?? null, t.action ?? null,
        { ...(look ? { look } : {}), ...(prompt ? { prompt } : {}), ...(range !== undefined ? { range } : {}), ...(elevation !== undefined ? { elevation } : {}), ...(points !== undefined ? { points } : {}) },
        t.node !== undefined || t.piece !== undefined);
      if (link) switchLink.set(r, link);
      if (t.script) switchScript.set(r, scriptFromFile(t.script, stagedOwn));
      r.position.set(...t.at);
      r.rotation.y = t.yaw;
      if (t.locked) r.userData['forgeLock'] = true;
      staged.push(r);
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
    hiddenData = new Set(l.hiddenData ?? []);
    movedData = new Map(Object.entries(l.movedData ?? {}));
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
    parentOf.clear();
    for (const r of [...roots]) removeRoot(r);
    layoutName = l.name ?? '';
    layoutNameIn.value = layoutName;
      for (const r of staged) addRoot(r);
      // The tree (`Layout.tree`), by the placements' places in the layout as they now stand.
      folders.length = 0;
      for (const f of l.folders ?? []) folders.push(newFolder(f.name));
      const placed = outlineIds();
      for (const [c, pr] of l.tree ?? []) { const child = placed.get(c), parent = placed.get(pr); if (child && parent && child !== parent) parentOf.set(child, parent); }
      outlineOrder = (l.order ?? []).flatMap((id) => { const o = placed.get(id); return o ? [o] : []; });
      outlineOrdered = outlineOrder.length > 0;
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
      split?.activateMain();                                  // the layout's camera is the first view's
      await setBase(l.base);
      markBundle(opening);
      const missing = await placeAll(l);
      if (l.camera) fly.setPose(l.camera);
      else if (applySavedViewCamera && viewCamera) fly.setPose(viewCamera);
      applySavedViewCamera = false;
      viewCamera = cameraNow();
      noteCamera();
      cameraReady = true;
      split?.mapOpened(splitMapKey(l.base));                  // the other views: kept on this map, else made anew
      writeView();
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
        return shown(h.object) && !!root && root !== replacing?.r;
      }) ?? null;
    }
    if (only === 'map') return baseView ? ray.intersectObjects([baseView.group], true).find((h) => shown(h.object)) ?? null : null;
    const targets: Object3D[] = [...roots];
    if (baseView) targets.push(baseView.group);
    if (floor.parent) targets.push(floorPlane);
    // A locked placement is struck as any is (the owner, 2026-11-11: locked ones selectable); its edits are refused.
    return ray.intersectObjects(targets, true).find((h) => {
      if (!shown(h.object)) return false;
      const root = forgeRootOf(h.object);
      return !(root && root === replacing?.r);                  // a prop being re-placed: the cursor looks past it
    }) ?? null;
  };
  /**
   * The surface under `ndc` past `skip` and what is under them (a dragged placement and its followers: never its own
   * ground) -- the world, the placements, the floor. Surface snapping's ground (`surfaceSnapDrag`).
   */
  const pickSurface = (ndc: Vector2, skip: readonly Object3D[]): Intersection | null => {
    ray.setFromCamera(ndc, fly.viewportCamera());
    const targets: Object3D[] = [...roots];
    if (baseView) targets.push(baseView.group);
    if (floor.parent) targets.push(floorPlane);
    return ray.intersectObjects(targets, true).find((h) => {
      if (!shown(h.object)) return false;
      for (const s of skip) if (isUnder(h.object, s)) return false;
      return true;
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
  /**
   * The wall under the cursor (the owner, 2026-11-10: "if my cursor is on a wall ... the switch or ladder just place in
   * the same orientation as the wall"; "also do the same for props"; `./placement` `mountOnWall`): the struck face's
   * outward normal in the world (turned to the camera's side), when steep enough to be one (`WALL_NORMAL_Y_MAX`); null
   * on a floor, a ramp, the sky, or the blank floor.
   */
  const wallOf = (hit: Intersection | null): { point: Vector3; normal: Vector3 } | null => {
    if (!hit?.face || hit.object === floorPlane) return null;
    const m = hit.object.matrixWorld.clone();
    if (hit.object instanceof InstancedMesh && hit.instanceId !== undefined) { const im = new Matrix4(); hit.object.getMatrixAt(hit.instanceId, im); m.multiply(im); }
    const n = hit.face.normal.clone().applyMatrix3(new Matrix3().getNormalMatrix(m)).normalize();
    if (n.dot(ray.ray.direction) > 0) n.negate();
    return Math.abs(n.y) <= WALL_NORMAL_Y_MAX ? { point: hit.point.clone(), normal: n } : null;
  };
  /**
   * A ladder prop's climbing side in its own frame (`./mapCensus` `ladderPropsOf` `front`, read off its disc map's
   * placement), by asset; null for a prop that is no ladder. Read once an asset (`ladderFrontOf`), then at hand.
   */
  const ladderFronts = new Map<string, [number, number] | null>();
  const ladderFrontOf = async (asset: string): Promise<[number, number] | null> => {
    if (ladderFronts.has(asset)) return ladderFronts.get(asset)!;
    const id = parseAssetId(asset);
    const lib = id ? await hostageLibOf(id.archive) : null;
    const front = (lib && id ? ladderPropsOf(lib).find((l) => l.model === id.model)?.front : undefined) ?? null;
    ladderFronts.set(asset, front);
    return front;
  };
  /**
   * `o` mounted on the wall under the cursor when the tool places on walls -- a prop (Place, and a prop re-placed), a
   * switch, a ladder -- and the cursor is on one: turned as the wall faces (its front out: +Z, a ladder its climbing
   * side), its back on the wall; a ladder standing on the floor below, the rest at the cursor's height. False (nothing
   * moved) on a floor, where placing is as before. The wheel's turn and snap are the floor's; a wall sets the turn.
   */
  const wallPose = (o: Object3D, hit: Intersection | null, asset?: string): boolean => {
    const onWalls = !!replacing || mode === 'place' || mode === 'switch' || mode === 'ladder';
    const w = onWalls ? wallOf(hit) : null;
    if (!w) return false;
    const ladder = asset ? ladderFronts.get(asset) ?? null : null;
    const probe = (x: number, z: number): number[] => (placementGrid ? surfaceYs(placementGrid, x, z) : []);
    mountOnWall(o, w.point, w.normal, ladder ?? [0, 1], ladder || mode === 'ladder' ? 'stand' : 'mount',
      (x, z, y) => restingPoint({ x, y, z }, probe, null).y);
    return true;
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
      const struck = pick(ndc);
      if (!wallPose(replacing.r, struck, String(replacing.r.userData['forgePiece'] ?? ''))) seatOn(replacing.r, placeAt(struck));
      carryReplace();                                          // the rest of the selection, and what is under them, along
      refreshBox();
      return;
    }
    if (!ghost) return;
    const struck = pick(ndc);
    const at = mode === 'bomb' || mode === 'siteSeal' || mode === 'siteTerrorist' ? onDrawnTop(placeAt(struck), struck) : placeAt(struck);
    const ghostPiece = mode === 'place' ? chosen ?? undefined : mode === 'ladder' && ghostAsset?.startsWith('ladder:') ? ghostAsset.slice(7) : undefined;
    if (!wallPose(ghost, struck, ghostPiece)) {
      ghost.rotation.y = ghostYaw();
      seatOn(ghost, at);
    }
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
    // The Place settings, a prop's alike (`placementYaw`): the turn on the turn step with the turn snap on, the wheel's on top.
    return (turnSnap ? snapYawRadians(own, turnStep) : own) + (wheelTurns(mode) ? (queuedTurn * Math.PI) / 180 : 0);
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
      case 'ambient': { const a = await defaultAmbient(); return a ? { key: `ambient:${a.source}:${a.name}`, source: newForgeObject({ kind: 'ambient', ...a }) } : null; }
      case 'bomb': case 'siteSeal': case 'siteTerrorist':
        return { key: mode, source: bombMarker(mode === 'bomb' ? 'start' : mode === 'siteSeal' ? 'seal' : 'terrorist') };
      case 'door': { const d = await defaultDoor(); return d ? { key: `door:${d.source}:${d.name}`, source: await newDoor(d.source, d.name) } : null; }
      case 'turret': { const t = await defaultTurret(); return t ? { key: `turret:${t.source}:${t.name}`, source: await newTurret(t.source, t.name) } : null; }
      case 'switch': { const look = objectChoice.switch; return { key: `switch:${look ?? 'lever'}`, source: await newSwitch(null, null, look && look !== 'lever' ? { look } : {}) }; }
      case 'gate': case 'barrier': { const k = mode; const a = await defaultAccess(k); return a ? { key: `${k}:${a.source}:${a.name}`, source: await newAccess(k, a.source, a.name) } : null; }
      case 'ladder': { const a = await defaultLadder(); if (a) await ladderFrontOf(a); const r = a ? await newPiece(a) : null; return a && r ? { key: `ladder:${a}`, source: r } : null; }
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
        // A flare's glow turned to the camera (`turnPlacedFlares`); a marker drawn by its billboard alone, that icon.
        const facade = (made.source.userData['forgeFlare'] as { facade?: number } | undefined)?.facade;
        if (facade) ghost.userData['ghostFacade'] = facade;
        const iconKind = GHOST_ICON_KINDS[mode];
        if (iconKind && MAP_DATA_MARKS[iconKind]) ghost.add(ghostIcon(MAP_DATA_MARKS[iconKind]!));
        ghostAsset = made.key;
        scene.add(ghost);
        moveGhost(lastNdc);
        input.dataset['ghost'] = mode;
      }, () => { if (token === ghostToken) clearGhost(); });
      return;
    }
    if (mode !== 'place' || !chosen || playing) { clearGhost(); return; }
    const asset = chosen;
    if (!ladderFronts.has(asset)) void ladderFrontOf(asset).then(() => { if (chosen === asset) moveGhost(lastNdc); });
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
  const placementYaw = (): number => (turnSnap ? snapYawRadians(facing(), turnStep) : facing())
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
    if (replacing) {
      if (toggle || refuseEdit()) return;
      // On a wall: put down as its ghost stands (`wallPose`), else seated on the floor under the click.
      const r0 = replacing.r;
      commitReplace(wallPose(r0, hit, String(r0.userData['forgePiece'] ?? '')) ? null : placeAt(hit));
      return;
    }
    if (entityTool !== null && !toggle) { placeEntity(entityTool, placeAt(hit)); return; }   // FCW-32 step 4 (D4)
    if (mode === 'select' || toggle) {
      // The Select tool's settings: a kind switched off is looked through -- map props off, a click finds the placements
      // behind the map; user props off, the map behind the placements; both off, nothing.
      const chose = selectMapProps && selectUserProps ? hit : selectUserProps ? pick(ndc, 'placed') : selectMapProps ? pick(ndc, 'map') : null;
      // A map data billboard, when it is the nearest thing under the cursor (one behind a wall is not drawn, so not
      // picked), is the map's own data selected (read only); under the same setting as the map's props.
      {
        const mark = mapBillboards.pick(ray, selectHidden);
        const userRoot = mark ? rootOfUserMark(mark.key) : null;
        // A user placement's mark (square) under "Select user props"; the map's own (round) under "Select map props".
        // A map prop's M only while the Ms show (`propMarksShown`); with them off a click hit-tests the prop itself.
        const propMark = !!mark && !!placementOfMark(mark.key);
        const allowed = mark && (userRoot ? selectUserProps && rootSelectable(userRoot)
          : selectMapProps && (propMark ? propMarksShown() : kindSelectable(mapDataIndex.get(mark.key)?.kind ?? null)));
        if (mark && allowed && mark.distance <= (chose?.distance ?? Infinity)) {
          // Ctrl (or Shift) on a mark (the owner, 2026-11-06): its object in or out of the selection, the rest kept --
          // as Ctrl in the Outliner. A placement's, a map prop's (by its M) or a map data item's.
          if (toggle) {
            if (userRoot) { picks.toggle(userRoot); showSelection(); return; }
            const propKey = placementOfMark(mark.key);
            const found = propKey ? mapPropPlacements().find(({ placement }) => placement.key === propKey) : undefined;
            if (found) { selectMapProp(found.placement, found.model, 'toggle'); return; }
            const item = mapDataIndex.get(mark.key);
            if (!propKey && item) {
              if (mapDataSelected) { dataPicks.set(mapDataSelected.key, mapDataSelected); mapDataSelected = null; }
              if (dataPicks.has(item.key)) dataPicks.delete(item.key); else dataPicks.set(item.key, item);
              mapDataAnchor = item.key;
              showSelection();
              highlightSelectionMark();
              drawOutliner();
            }
            return;
          }
          if (userRoot) { select(userRoot); return; }               // a user mark: its placement selected, as a click on it
          // A map prop's mark (M) selects the prop itself, as a click on it does; any other, the map data item.
          const propKey = placementOfMark(mark.key);
          const found = propKey ? mapPropPlacements().find(({ placement }) => placement.key === propKey) : undefined;
          if (found) selectMapProp(found.placement, found.model);
          else if (!propKey && !mark.key.startsWith('user:')) selectMapData(mark.key);
          return;
        }
      }
      // A placement of a kind its View switch hides is passed over, as nothing there.
      const struck = forgeRootOf(chose?.object ?? null);
      const root = struck && rootSelectable(struck) ? struck : null;
      if (selectMapProps && !struck && chose && baseMap && baseView && isUnder(chose.object, baseView.group)) {
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
    if (mode === 'switch') {
      // A gate's switch at the click, linked to the nearest placed gate (the Inspector's Gate changes it): the disc's
      // gates open only by their lever panels (research 174 s5), so a switch needs a gate to drive.
      // With no gate placed it runs nothing until the Inspector's Runs names a map action (or a gate placed later).
      const gates = gateRootsNow();
      const near = gates.length ? gates.reduce((a, b) => (a.position.distanceTo(at) <= b.position.distanceTo(at) ? a : b)) : null;
      const yaw = ghostYaw();
      const look = objectChoice.switch;                        // the asset browser's tile (`chooseObject`)
      personEdit('switch.place', {}, (step) => void newSwitch(near, null, look && look !== 'lever' ? { look } : {}).then((r) => {
        const before = selectionIds();
        if (!wallPose(r, hit)) { r.rotation.y = yaw; seatOn(r, at); }   // on a wall, as the wall faces
        addRoot(r);
        select(r);
        say(near ? `Switch placed: it slides ${accessLabel(near)} (Gate ${gates.indexOf(near) + 1}); the Inspector's Runs changes it`
          : "Switch placed: choose what it runs in the Inspector's Runs (a gate, or one of the map's own actions)");
        edit(before, step);
      }), true);
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
          say(`${accessLabel(r)} placed${kind === 'gate' ? ': C4 or an RPG wrecks it; place a Switch (Objects) to slide it' : ': C4 or an RPG wrecks it'}`);
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
        personEdit('piece.place', { asset }, (step) => void ladderFrontOf(asset).then(() => newPiece(asset)).then((r) => {
          if (!r) { say(`${asset} has no geometry to place`, true); return; }
          if (!wallPose(r, hit, asset)) { r.rotation.y = yaw; seatOn(r, at); }   // on a wall: its climbing side out, on the floor
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
    if (mode === 'ambient') {
      // A Forge object at the click (`./forgeObjects`): the chosen ambient effect.
      const kind = mode;
      const yaw = ghostYaw();
      void defaultAmbient().then((a) => {
        if (!a) { notifier.refused('No ambient effect to place: choose a map in the assets (Ambient tab) that has one'); return; }
        personEdit('object.place', { kind }, () => {
          const before = selectionIds();
          const r = newForgeObject({ kind, ...a });
          r.rotation.y = yaw;
          seatOn(r, at);
          addRoot(r);
          select(r);
          say(`${objectLabel(r)} placed`);
          edit(before);
        }, true);
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
      if (authoredType !== 3 && authoredType !== 4) { notifier.refused('Safety zones play in Escort or Extraction: set the game type first (Map tab, Map Settings)'); return; }
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
      if (!hostagesPlayIn(authoredType ?? undefined)) { notifier.refused('Hostages play in Escort or Extraction: set the game type first (Map tab, Map Settings)'); return; }
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
        // On a wall, as the wall faces (`wallPose`); else the ghost's turn (FUI-22 D4: the wheel's with it) and its box's
        // bottom on the surface, as the ghost's.
        if (!wallPose(r, hit, asset)) { r.rotation.y = placementYaw(); seatOn(r, at); }
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
    const shownRoots = selectUserProps ? roots.filter((r) => shown(r) && rootSelectable(r)) : [];   // locked ones too
    const ndcs = shownRoots.map((r) => { const v = r.getWorldPosition(new Vector3()).project(camera); return [v.x, v.y, v.z] as Vec3; });
    const inBox = inRect(ndcs, [d.ndc.x, d.ndc.y], [end.x, end.y]).map((i) => shownRoots[i]!);
    // The map's own props, by the owner's rules (2026-11-06; `propMarksShown`): with their M billboards on, every M in
    // the box (behind a wall or not, drawn or an alternate state); with them off, a hit test of the drawn props -- the
    // middle of each drawn body in the box. Its drawn mesh found through one walk of the base world, every entry of its
    // placement tried (a LOD pair's near and far copies are two entries); one with none drawn sized from its geometry.
    const placements = !selectMapProps || !baseMap ? [] : mapPropPlacements().filter(({ placement }) => !hiddenKeys.has(placement.key));
    const meshesOf = new Map<number, Mesh[]>();
    const entriesOf = new Map<string, [number, number][]>();
    if (placements.length && baseMap && baseView) {
      baseView.group.updateMatrixWorld(true);
      baseView.group.traverse((o) => {
        const tag = o.userData['forgeBaseProp'] as { prop?: number } | undefined;
        if (!(o instanceof Mesh) || typeof tag?.prop !== 'number') return;
        const list = meshesOf.get(tag.prop) ?? [];
        list.push(o);
        meshesOf.set(tag.prop, list);
      });
      for (const [entry, prop] of baseMap.props.entries()) {
        for (let i = 0; i < prop.matrices.length / 16; i++) {
          const m = prop.matrices, at = i * 16;
          const key = placementKey(prop.modelName, m[at + 12]!, m[at + 13]!, m[at + 14]!);
          const list = entriesOf.get(key) ?? [];
          list.push([entry, i]);
          entriesOf.set(key, list);
        }
      }
    }
    const meshOf = (entry: number, index: number): { o: Mesh; matrix: Matrix4; drawn: boolean } | null => {
      let fallback: { o: Mesh; matrix: Matrix4; drawn: boolean } | null = null;
      for (const o of meshesOf.get(entry) ?? []) {
        const tag = o.userData['forgeBaseProp'] as { index?: number };
        const matrix = new Matrix4();
        if (o instanceof InstancedMesh) {
          if (index >= o.count) continue;
          o.getMatrixAt(index, matrix);
          if (Math.abs(matrix.determinant()) < 1e-12) continue;   // an instance drawn hidden: its geometry below instead
          matrix.premultiply(o.matrixWorld);
        } else {
          if (tag.index !== undefined && tag.index !== index) continue;
          matrix.copy(o.matrixWorld);
        }
        const found = { o, matrix, drawn: shown(o) };
        if (found.drawn) return found;
        fallback ??= found;
      }
      return fallback;
    };
    /** A placement's own geometry's bounds, from the map's prop entry (no drawn mesh needed). */
    const partsBox = (entry: number, index: number): { matrix: Matrix4; box: Box3 } | null => {
      const prop = baseMap?.props[entry];
      if (!prop) return null;
      const matrix = new Matrix4().fromArray(Array.from(prop.matrices.subarray(index * 16, index * 16 + 16)));
      const box = new Box3(), v = new Vector3();
      for (const part of prop.parts) {
        const pos = part.positions;
        for (let k = 0; k + 2 < pos.length; k += 3) box.expandByPoint(v.set(pos[k]!, pos[k + 1]!, pos[k + 2]!));
      }
      return box.isEmpty() ? null : { matrix, box: box.applyMatrix4(matrix) };
    };
    const [rx0, rx1] = [Math.min(d.ndc.x, end.x), Math.max(d.ndc.x, end.x)];
    const [ry0, ry1] = [Math.min(d.ndc.y, end.y), Math.max(d.ndc.y, end.y)];
    const inside = (p: Vector3): boolean => { const v = p.clone().project(camera); return v.x >= rx0 && v.x <= rx1 && v.y >= ry0 && v.y <= ry1 && v.z >= -1 && v.z <= 1; };
    /**
     * M billboards off: whether a prop shows from the camera inside the box (the owner, 2026-11-06: no geometry behind a
     * wall or across the map) -- a ray from the camera to its middle, then (blocked) to points across its body, each
     * inside the box: shown when the first drawn thing a ray meets is the prop itself (any mesh drawing its placement), or
     * nothing before the point. The world, the other props and the layout's own pieces all block.
     */
    const occluders: Object3D[] = [...roots];
    if (baseView) occluders.push(baseView.group);
    const sightRay = new Raycaster();
    const seenFromCamera = (own: Set<Object3D>, instance: number | null, box: Box3): boolean => {
      const c = box.getCenter(new Vector3());
      const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => new Vector3(k & 1 ? box.max.x : box.min.x, k & 2 ? box.max.y : box.min.y, k & 4 ? box.max.z : box.min.z)
        .lerp(c, 0.35));                                      // a third of the way in: on the body, not its box's air
      for (const target of [c, ...corners]) {
        if (!inside(target)) continue;
        // The camera's own ray through the point's place on screen (a perspective eye, or an orthographic view's parallel).
        const ndcAt = target.clone().project(camera);
        sightRay.setFromCamera(new Vector2(ndcAt.x, ndcAt.y), camera);
        const dist = sightRay.ray.origin.distanceTo(target);
        if (!(dist > 0)) return true;
        sightRay.far = dist + 1;
        const first = sightRay.intersectObjects(occluders, true).find((h) => {
          if (!shown(h.object)) return false;
          const root = forgeRootOf(h.object);
          return !root || !lockedOf(root);
        });
        if (!first || first.distance >= dist - 1) return true;               // nothing before the point
        if (own.has(first.object) && (instance === null || first.instanceId === undefined || first.instanceId === instance)) return true;
      }
      return false;
    };
    /**
     * A billboard seen from the camera (the owner, 2026-11-06): with Always on top off its icons are drawn behind what
     * stands in front, so a box picks only those it can see -- nothing drawn between the camera and the icon. With Always
     * on top on, every icon in the box (all are drawn).
     */
    const markSeen = (at: Vector3, drawn = true): boolean => {
      if (billboardsOnTop && drawn) return true;
      const ndcAt = at.clone().project(camera);
      sightRay.setFromCamera(new Vector2(ndcAt.x, ndcAt.y), camera);
      const dist = sightRay.ray.origin.distanceTo(at);
      if (!(dist > 0)) return true;
      sightRay.far = dist;
      const first = sightRay.intersectObjects(occluders, true).find((h) => {
        if (!shown(h.object)) return false;
        const root = forgeRootOf(h.object);
        return !root || !lockedOf(root);
      });
      return !first || first.distance >= dist - 1;
    };
    let unresolved = 0;
    const mapInBox = placements.flatMap(({ placement, model }) => {
      const tried: [number, number][] = [[placement.prop, placement.index], ...(entriesOf.get(placement.key) ?? [])];
      let mesh: { o: Mesh; matrix: Matrix4; drawn: boolean } | null = null;
      for (const [entry, index] of tried) {
        const m = meshOf(entry, index);
        if (m && (m.drawn || !mesh)) mesh = m;
        if (mesh?.drawn) break;
      }
      // M billboards on: the prop's M alone (its place) -- every M in the box, drawn or not. Off: a hit test of its drawn
      // body, as before -- the middle of a drawn prop in the box (nothing drawn, nothing to hit).
      const marks = propMarksShown();
      if (!marks && !mesh?.drawn) return [];
      const own = mesh ? { matrix: mesh.matrix, box: basePropBox(mesh.o, mesh.matrix) } : partsBox(placement.prop, placement.index);
      if (!own) { unresolved++; return []; }
      // The M where it is drawn (lifted over the prop's place: a box round the icon close up holds the icon, not the place).
      const markAt = marks ? mapBillboards.markAt(propMarkKey(placement.key)) ?? new Vector3().setFromMatrixPosition(own.matrix) : null;
      if (markAt ? !inside(markAt) || !markSeen(markAt) : !inside(own.box.getCenter(new Vector3()))) return [];
      // M billboards off: only a prop the camera sees (`seenFromCamera`), any of its placement's drawn meshes its own.
      if (!marks && mesh) {
        const meshes = new Set<Object3D>(tried.flatMap(([entry]) => meshesOf.get(entry) ?? []));
        if (!seenFromCamera(meshes, mesh.o instanceof InstancedMesh ? placement.index : null, own.box)) return [];
      }
      return [{ ...placement, model, object: mesh?.o ?? baseView!.group, instance: mesh && mesh.o instanceof InstancedMesh ? placement.index : null,
        matrix: own.matrix, box: own.box } as BaseProp];
    });
    // Every map data item whose marks show (the View dropdown's switches; the owner, 2026-11-06: read only ones too) --
    // spawns, respawns, hostages, the bomb start, doors, gates, turrets, ladders, actions, points, zones, views, flares,
    // cranes -- at its billboard's place; Delete then takes out the deletable ones (`./mapDataHide`) and says of the rest.
    const dataCandidates = !selectMapProps ? [] : [...mapDataIndex.values()].filter((spec) => !PROP_MARK_KINDS.has(spec.kind) && kindSelectable(spec.kind));
    // Each where its mark is drawn (lifted over its place), as the props' Ms; with Always on top off, only those seen.
    const dataAt = dataCandidates.map((spec) => mapBillboards.markAt(spec.key) ?? new Vector3(...spec.at));
    const dataInBox = inRect(dataAt.map((at) => { const v = at.clone().project(camera); return [v.x, v.y, v.z] as Vec3; }),
      [d.ndc.x, d.ndc.y], [end.x, end.y]).filter((i) => markSeen(dataAt[i]!, mapBillboards.drawn(dataCandidates[i]!.key))).map((i) => dataCandidates[i]!);
    // The placements by their billboards too (the owner, 2026-11-11: "rect select needs to work with billboards as well"):
    // each whose mark is drawn in the box, as the map's own marks are taken (`markSeen`: with Always on top off, if seen).
    const marksInBox = shownRoots.filter((r) => {
      if (inBox.includes(r)) return false;
      const at = mapBillboards.markAt(userMarkKeyOf(r));
      if (!at) return false;
      const v = at.clone().project(camera);
      return inRect([[v.x, v.y, v.z]], [d.ndc.x, d.ndc.y], [end.x, end.y]).length > 0 && markSeen(at, mapBillboards.drawn(userMarkKeyOf(r)));
    });
    if (!d.add) { picks.clear(); basePicks.clear(); dataPicks.clear(); mapDataSelected = null; }
    picks.addAll([...inBox, ...marksInBox]);
    basePicks.addAll(mapInBox);
    for (const spec of dataInBox) dataPicks.set(spec.key, spec);
    showSelection();
    highlightSelectionMark();
    const n = picks.size + basePicks.size + dataPicks.size;
    const deletable = [...dataPicks.values()].filter((spec) => hiddenDataKeyOf(spec) !== null).length;
    say(`${inBox.length + mapInBox.length + dataInBox.length} in the box · ${n} selected${mapInBox.length ? ` · ${mapInBox.length} map prop${mapInBox.length === 1 ? '' : 's'}` : ''}${unresolved ? ` · ${unresolved} map prop${unresolved === 1 ? '' : 's'} not drawn` : ''}${dataPicks.size ? ` · ${dataPicks.size} map item${dataPicks.size === 1 ? '' : 's'}${deletable < dataPicks.size ? ` (${deletable} can be deleted)` : ''}` : ''}`);
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
    // Every object Place places alike (a prop once one is chosen, or one re-placed): its ghost a turn step a notch.
    if (((mode === 'place' && (chosen || replacing)) || (mode !== 'place' && wheelTurns(mode))) && !playing) {
      wheelTravel += e.deltaMode === 0 ? e.deltaY : e.deltaY * WHEEL_LINE_PX;
      if (Math.abs(wheelTravel) < WHEEL_NOTCH_PX) return;
      const up = wheelTravel < 0;
      wheelTravel = 0;
      turnQueued(up ? turnStep : -turnStep);
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
    queued: (mode === 'place' && chosen !== null) || (mode !== 'place' && mode !== 'select') || entityTool !== null || replacing !== null,
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
    // 2 the Place tool, as its button (`enterPlace`: a selected placement picked up, else the last object placed).
    if (typeof a === 'object' && 'tool' in a) { if (a.tool === 'place') enterPlace(); else setMode(a.tool); return; }
    if (typeof a === 'object') { padMenu.input(a.menu === 'back' && e.code === 'KeyM' ? 'close' : a.menu); e.stopImmediatePropagation(); return; }
    switch (a) {
      case 'closeCard': if (!help.hidden) setHelp(false); else cards.back(); break;   // FUI-2: the top card's way back
      case 'undo': undo(); break;
      case 'redo': redo(); break;
      case 'copy': if (!playing) copySelection(); break;
      case 'paste': if (!playing) pasteClipboard(); break;
      case 'cut': if (!playing) cutSelection(); break;
      // The File menu's keys (the owner, 2026-11-11): each presses its row's button, as the menu does.
      case 'openLayout': if (!playing) openBtn.click(); break;
      case 'saves': if (!playing) saveBtn.click(); break;
      case 'walk': toggleWalk(); break;                          // FG-50: Walk and Edit, the camera kept
      case 'play': togglePlay(); break;
      case 'stopWalk': stopPlay(); break;
      case 'door': walk.action(); break;                        // the test room's action key (a door)
      case 'docks': setDocks(doc.body.classList.contains('fx-docks-off')); break;
      case 'frame': frameSelection(); break;
      // Not mid-drag: a gizmo drag keeps the mode it began in (the camera keeps W / E / R itself while it navigates).
      case 'translate': case 'rotate': case 'scale':
        // FC-1 (main): R picks no scale gizmo while the stubs are hidden (`./transformStubs`).
        if (!gizmo.dragging && !(a === 'scale' && FORGE_TRANSFORM_STUBS_HIDDEN_ADAPTATION)) setGizmo(a);
        break;
      case 'snap': setSnap(!snapAny()); break;
      // Q (the owner, 2026-11-12): the gizmo's World / Local, as its button.
      case 'space': setGizmoSpace(gizmoSpace === 'world' ? 'local' : 'world'); say(gizmoSpace === 'world' ? 'Gizmo: World' : 'Gizmo: Local'); break;
      // G / Shift+G (the owner, 2026-11-12): the selection grouped into a new folder, or its folders taken out.
      case 'group': if (!playing) groupSelection(); break;
      case 'ungroup': if (!playing) ungroupSelection(); break;
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
  /** Cut (the Edit menu, Ctrl+X): the placements copied (`copySelection`), then deleted -- one step to undo. */
  const cutSelection = (): void => {
    if (!picks.items.some((r) => !lockedOf(r))) { say('nothing to cut', true); return; }
    copySelection();
    basePicks.clear();                                          // a map prop's hiding is not a cut: yours alone
    dataPicks.clear();
    entityPicked = null;
    remove();
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
   * A copy of a placed object (the owner, 2026-11-06: Ctrl-drag, duplicate and copy/paste copy them as a prop; 2026-11-10:
   * "we can't ctrl drag copy switches ... as we add more objects, remember to add the ctrl drag copy to new objects"):
   * a door, turret, gate, damage trigger (a disc one or a custom one), switch, flare, hostage, zone, tactical point or
   * spectator view cloned whole -- its model, its data, its guides -- its saved id and lock dropped, its world-turned guides
   * turned with the world again, and what it keeps off `userData` copied (`copyObjectState`); a spawn, a respawn point or
   * an NPC built afresh. Null for a piece (its own path) and a bomb marker (one of each). A NEW OBJECT KIND IS ADDED HERE.
   */
  function cloneable(s: Object3D): boolean {
    const u = s.userData;
    return !!(u['forgeFlare'] || u['forgeDoor'] || u['forgeTurret'] || u['forgeGate'] || u['forgeBarrier'] || u['forgeHostage'] || u['forgeZone'] || u['forgePoint'] || u['forgeView']
      || u['forgeSwitch'] || u['forgeTrigger']);
  }
  /**
   * What a switch or a custom damage trigger keeps off `userData` (`switchGate`, `switchAction`, `switchOpts`,
   * `switchScript`, `switchPropMode`; `pieceTrigger`, `triggerScript`) carried to its copy: its script's lists copied, so
   * an edit of one is not the other's. Its prop link (`switchLink`, `triggerLink`) is not: a prop carries one switch or
   * one trigger (`withPlacedAccess` refuses a second), so the copy starts unlinked -- said (`copyNotes`).
   */
  const copyScript = (sc: EditorScript): EditorScript => ({ steps: sc.steps.map((x) => ({ ...x })) });
  let copyNotes = 0;
  function copyObjectState(from: Object3D, to: Object3D): void {
    if (switchGate.has(from)) switchGate.set(to, switchGate.get(from) ?? null);
    if (switchAction.has(from)) switchAction.set(to, switchAction.get(from) ?? null);
    if (switchOpts.has(from)) switchOpts.set(to, { ...switchOpts.get(from)! });
    const sc = switchScript.get(from);
    if (sc) switchScript.set(to, copyScript(sc));
    if (switchPropMode.has(from)) { switchPropMode.add(to); if (switchLink.has(from)) copyNotes++; }
    const t = pieceTrigger.get(from);
    if (t) pieceTrigger.set(to, { ...t });
    const ts = triggerScript.get(from);
    if (ts) triggerScript.set(to, copyScript(ts));
    const os = objectScript.get(from);
    if (os) objectScript.set(to, copyScript(os));
    if (triggerLink.has(from)) copyNotes++;
  }
  function markerClone(s: Object3D): Object3D | null {
    const u = s.userData;
    // Built afresh: a spawn, a respawn point, an NPC (their looks are made, not copied).
    if (u['forgeRespawn']) return respawnMarker(u['forgeRespawn'] as 'A' | 'B');
    if (u['forgeSpawn']) return spawnMarker(u['forgeSpawn'] as 'A' | 'B');
    const npc = npcOf(s);
    if (npc) return newNpc(npc.side, npc.type);
    const fo = objectOf(s);
    if (fo) return newForgeObject({ ...fo });   // a Forge object (its script copied)
    if (!cloneable(s)) return null;
    const c = s.clone(true);
    delete c.userData['forgeId'];
    delete c.userData['forgeLock'];
    c.traverse((o) => {
      const kind = o.userData['forgeGuideKind'] as string | undefined;
      if (kind === 'userScenicViews' || (u['forgeHostage'] && o.parent === c && (o as LineSegments).isLineSegments)) keepWorldTurn(o);
    });
    copyObjectState(s, c);
    if (copyNotes) { copyNotes = 0; say('Copied unlinked: a prop carries one switch or one damage trigger, so link the copy to another prop (Inspector, Prop)'); }
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
  /**
   * The map props among `keys` (their placement keys) whose collision hiding them cannot take out (`./hide`
   * `placementOwners`: no hull owner of their own) -- each by its model, once. Said after a hide (the owner, 2026-11-06):
   * the prop is gone from the drawing, and, if it is solid in the game, its collision may stay in the map's.
   */
  const bakedCollisionOf = (keys: readonly string[]): string[] => {
    if (!baseMap?.ground) return [];
    const ground = baseMap.ground;
    const models = new Set<string>();
    for (const key of keys) {
      const entries = [...placementsOf(baseMap, [key])];
      if (!entries.length || entries.some((e) => placementOwners(baseMap, ground, e).length > 0)) continue;
      models.add(key.split('@')[0]?.split(':')[0] ?? key);
    }
    return [...models];
  };
  const warnBakedCollision = (keys: readonly string[]): void => {
    const models = bakedCollisionOf(keys);
    if (!models.length) return;
    const named = models.length <= 3 ? models.join(', ') : `${models.slice(0, 3).join(', ')} and ${models.length - 3} more`;
    notifier.refused(`Hidden, but no collision of its own was found for ${named}: if it is solid in the game, its collision is part of the map and stays (an invisible wall)`);
  };
  const remove = (): void => {
    // A folder selected from its row: deleted with everything under it (and whatever else is picked with it).
    if (folderPicks.size) { deleteFolders(); return; }
    // FCW-32 step 4 (D4): a rules entity picked from its row is deleted by its reference (refused while a rule names it).
    if (entityPicked !== null && picks.size + basePicks.size === 0) { entityEdit('piece.delete', { refs: [entityPicked] }); return; }
    if ((picks.size || basePicks.size) && refuseEdit()) return;
    // A locked placement is never deleted, selected or not (the owner, 2026-11-11): picked alone, refused and said; picked
    // with others, left out of the selection first -- the rest deleted, the locked ones kept and named in the line.
    const lockedPicked = picks.items.filter(lockedOf);
    if (lockedPicked.length) {
      if (lockedPicked.length === picks.size && basePicks.size === 0 && dataPicks.size === 0) {
        notifier.refused(lockedPicked.length === 1 ? 'Locked: unlock it to delete it' : `${lockedPicked.length} locked: unlock them to delete them`);
        return;
      }
      for (const r of lockedPicked) picks.remove(r);
      showSelection();
      say(`${lockedPicked.length} locked kept`);
    }
    const before = selectionIds();
    // A box's map objectives (the owner, 2026-11-06), with whatever else it picked: every placement deleted, every map
    // prop hidden, every objective taken out of this map -- one step.
    const dataKeys = [...dataPicks.values()].map(hiddenDataKeyOf).filter((k): k is string => k !== null);
    // Only read-only map data picked (doors, views, turrets...): nothing to delete, and said.
    if (!dataKeys.length && dataPicks.size && picks.size + basePicks.size === 0) {
      notifier.refused('These map items are read only: spawn slots, respawn points, hostages, the bomb start, plant sites and extraction zones can be deleted');
      return;
    }
    if (dataKeys.length) {
      if (refuseEdit()) return;
      const gone = [...picks.items].filter((r) => !lockedOf(r));
      const props = [...basePicks.items];
      personEdit(gone.length ? 'piece.delete' : 'piece.hide', gone.length ? { refs: before } : { keys: [...props.map((b) => b.key), ...dataKeys] }, () => {
        for (const k of dataKeys) hiddenData.add(k);
        for (const b of props) hiddenKeys.add(b.key);
        for (const r of gone) removeRoot(r);
        dataPicks.clear(); picks.clear(); basePicks.clear(); mapDataSelected = null;
        drawHidden();
        drawMapBillboards();
        drawMapGuides();
        drawOutliner();
        refreshGameTypes();
        showSelection();
        highlightSelectionMark();
        edit(before);
        say(`${dataKeys.length} map objective${dataKeys.length === 1 ? '' : 's'} deleted${gone.length ? ` · ${gone.length} deleted` : ''}${props.length ? ` · ${props.length} map prop${props.length === 1 ? '' : 's'} hidden` : ''}`);
        warnBakedCollision(props.map((b) => b.key));
      }, true);
      return;
    }
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
        warnBakedCollision(keys);
      }, true);
      return;
    }
    if (baseSelected) {
      // FG-17: a map prop is hidden in this layout, not deleted: the disc's placement stays, listed in the outliner.
      const prop = baseSelected;
      personEdit('piece.hide', { keys: [prop.key] }, () => {
        hiddenKeys.add(prop.key);
        say(`${prop.model} hidden in this layout`);
        warnBakedCollision([prop.key]);
        basePicks.clear();
        drawHidden();
        showSelection();
        edit(before);
      }, true);
      return;
    }
    // A map's own objective selected in Map Data (the owner, 2026-11-06): taken out of this layout, not off the disc --
    // a hostage, the bomb start, a plant site, an extraction zone (`./mapDataHide`). Any other map data stays read only.
    if (!selected && mapDataSelected) {
      const row = mapDataSelected;
      const key = hiddenDataKeyOf(row);
      if (!key) { notifier.refused(`${row.label} can't be deleted yet: spawn slots, respawn points, hostages, the bomb start, plant sites and extraction zones can`); return; }
      if (refuseEdit()) return;
      personEdit('piece.hide', { keys: [key] }, () => {
        hiddenData.add(key);
        mapDataSelected = null;
        drawMapBillboards();
        drawMapGuides();                                       // its hostage cell, its plant site's reach: gone with it
        drawOutliner();
        refreshGameTypes();
        showSelection();
        edit(before);
        say(`${row.label} deleted from this map`);
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
    playing = on;
    doc.body.classList.toggle('is-playing', on);
    shell.refresh();                                           // Walk: the viewport alone (`maximized`)
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
        // The map's own objectives this layout takes out (`./mapDataHide`): the room's rules never see them.
        return mapDataShown({ ...c.groundMap, props: propsWithout(c.groundMap, hiddenNow), lines: linesWithout(c.groundMap, hiddenNow) } as LoadedMap);
      })();
    const markers = npcs ? layout.npcs ?? [] : [];
    // The Play settings' side (Play's own: `npcs`), else the side the NPCs leave the player (`./npcs` `playerSideOf`).
    const playerSide = npcs && playSide !== 'auto' ? playSide : playerSideOf(markers);
    const own = settingsOf(layout);
    const fit = npcsThatFit(markers, playerSide, own.players);
    // R6 (3): the same resolver as the ground's, so a pack piece is solid in the match exactly when it is drawn here.
    // Each piece's name in the hull (`composeGround`'s `forge/piece_<its place among the roots>`): its drawn placements
    // take it too, so a switch's script hides or shows both (`./matchMap`, `./placedAccess` `scriptPrograms`).
    const pieceOwners = roots.flatMap((r, i) => (r.userData['forgePiece'] ? [`forge/piece_${i}`] : []));
    const pieceOwner = (i: number): string => pieceOwners[i] ?? `forge/piece_${i}`;
    const composed = composeMatchMap(baseMap, { ...layout, npcs: fit.kept }, libs, c.ground, playerSide, resolveContent, pieceOwner);
    const type = layout.objectives?.gameType;
    // The placed hostages and zones on the map, then the game type, its test reading them (`./playObjectives`); a blank
    // floor's hostages copy its library's character (`blankFloorOf` dropped its escortees).
    // The bodies placed hostages borrow from other disc maps (`./hostages` `withLentHostageBodies`); one whose map or
    // character is not here wears the default instead, as it would with none named.
    const lentLibs = new Map<string, LoadedMap>();
    for (const h of layout.hostages ?? []) if (h.source && !lentLibs.has(h.source)) { const lib = await hostageLibOf(h.source); if (lib) lentLibs.set(h.source, lib); }
    const bodied = withLentHostageBodies(composed.map, layout.hostages, (s) => lentLibs.get(s) ?? null);
    const worn = new Set(hostageCharactersOf(bodied.map));
    const hostages = layout.hostages?.map((h) => (h.source && !worn.has(h.character ?? '') ? (({ source: _s, character: _c, ...rest }) => rest)(h) : h));
    // The team and default character: the base's first hostage's (a blank floor's library's), else a lending map's.
    const lent = (base.kind === 'blank' ? c.groundMap.escortees?.[0] : composed.map.escortees?.[0])
      ?? [...lentLibs.values()].map((l) => l.escortees?.[0]).find((e) => !!e);
    const played = playObjectives(bodied.map, { ...layout, ...(hostages ? { hostages } : {}) }, lent, type === undefined ? null : blankWhy(type));
    // The layout's placed tactical points and spectator views beside the map's own (`./placedPoints`), in any type.
    // The layout's Forge objects (`./forgeObjects`): each one's place by its path, the ambient effects to play.
    const pointed = withForgeObjects(withPlacedViews(withPlacedPoints(played.map, layout.tacPoints), layout.scenicViews), layout.objects), why = played.why;
    // The layout's placed turrets beside the map's own (`./turrets`): each its disc template's copy, in any type.
    const templates = new Map<string, TurretTemplate>();
    for (const t of layout.turrets ?? []) { const found = await turretTemplate(t.source, t.name); if (found) templates.set(`${t.source}:${t.name}`, found); }
    const turreted = withPlacedTurrets(pointed, layout.turrets, (s, n) => templates.get(`${s}:${n}`) ?? null);
    // The layout's placed doors beside the map's own (`./placedDoors`): each its disc template's copy, its leaf in the hull.
    const doorTemplatesNow = new Map<string, DoorTemplate>();
    for (const t of layout.doors ?? []) { const found = await doorTemplate(t.source, t.name); if (found) doorTemplatesNow.set(`${t.source}:${t.name}`, found); }
    const doored = withPlacedDoors(turreted.map, layout.doors, (s, n) => doorTemplatesNow.get(`${s}:${n}`) ?? null);
    // The layout's placed gates and C4 barriers (`./placedAccess`): each its disc access object's copy, whole.
    const accessNow = new Map<string, AccessTemplate>();
    // Each look the layout's switches wear (`switchLookOf`), read before the composition: a gate's switch asking for the
    // lever panel wears its gate's own (`withPlacedAccess`).
    const looksNow = new Map<SwitchLookId, SwitchLook | null>();
    for (const sw of layout.switches ?? []) { const id = sw.look ?? 'lever'; if (!looksNow.has(id)) looksNow.set(id, await switchLookOf(id)); }
    const switchLookNow = (id: SwitchLookId): SwitchLook | null => looksNow.get(id) ?? null;
    for (const [kind, list] of [['gate', layout.gates], ['barrier', layout.barriers]] as const) {
      for (const t of list ?? []) { const found = await accessTemplate(kind, t.source, t.name); if (found) accessNow.set(`${kind}:${t.source}:${t.name}`, found); }
    }
    const accessed = withPlacedAccess(doored.map, [
      ...(layout.gates ?? []).map((t) => ({ kind: 'gate' as const, ...t })), ...(layout.barriers ?? []).map((t) => ({ kind: 'barrier' as const, ...t })),
    ], (m) => accessNow.get(`${m.kind}:${m.source}:${m.name}`) ?? null, layout.switches ?? [], switchLookNow, pieceOwner, layout.triggers ?? []);
    // What the match lends from other maps (`./scriptAssets`): the switches' scripts' sounds and effects, and each copied
    // gate's and damage trigger's own (its deaths', its actions' and their calls').
    // The ambient effects' programs (from another map's sets) and their sounds (from their map's banks), lent too.
    const ambientLent: LentScriptAssets = { sounds: [], effects: [] };
    const ambientPrograms = new Map<string, AmbientProgram | null>();
    for (const o of layout.objects ?? []) {
      if (o.kind !== 'ambient' || !o.source || isScriptObject(o)) continue;   // a scripted effect: its script's, below
      const lib = await hostageLibOf(o.source);
      const prog = lib ? ambientProgramsOf(lib).find((x) => x.name === o.name) : undefined;
      ambientPrograms.set(`${o.source}:${o.name}`, prog ?? null);
      if (o.source.toUpperCase() !== c.groundMap.archive.toUpperCase()) ambientLent.effects.push({ from: o.source, names: [o.name] });
      if (prog?.sounds.length) ambientLent.sounds.push({ from: o.source, names: [...prog.sounds] });
    }
    // Every script's sounds and effects (the one script: switches', triggers' and effect objects'), each from its own map.
    const lentAssets0 = mergeLent(lentScriptAssets(scriptSteps([...(layout.switches ?? []), ...(layout.triggers ?? []), ...(layout.objects ?? [])]), c.groundMap.archive), lentAccessAssets([...accessNow.values()].map((t) => {
      const set = new Set((t.lib.meta?.scene?.programs ?? []).map((p) => p.program.name.toLowerCase()));
      const programs = [...t.destructibles.map((d) => d.program), ...t.actions.flatMap((a) => (a.program ? [a.program.program] : [])), ...calledOf(t, { anims: {} }).map((p) => p.program)];
      return { lib: t.lib, programs, set };
    }), c.groundMap.archive));
    // Their looping sounds the audio's emitters at their places, as the map's own ambient loops (`forgeAmbientEmitters`).
    const emitters = forgeAmbientEmitters(layout.objects, (src, n) => ambientPrograms.get(`${src}:${n}`) ?? null);
    const lentAssets = mergeLent(lentAssets0, { ...ambientLent, ...(emitters.length ? { emitters } : {}) });
    // Each piece a placed node (`./placedAccess` `withPieceInstances`): a script's hide reaches every page on the wire.
    if (layout.switches?.some((sw) => sw.script || sw.piece !== undefined) || layout.triggers?.length) accessed.map = withPieceInstances(accessed.map, pieceOwners);
    // The layout's placed flares (`./placedFlares`): each its disc facade node, drawn and turned as the map's own.
    const flaresNow = new Map<string, FlareTemplate>();
    for (const f of layout.flares ?? []) { const found = await flareTemplate(f.source, f.name); if (found) flaresNow.set(`${f.source}:${f.name}`, found); }
    const flared = withPlacedFlares(accessed.map, layout.flares, (src, n) => flaresNow.get(`${src}:${n}`) ?? null).map;
    // The layout's own Demolition sites wear the map's bases' outlines (`./siteOutlines`): the disc's pulse at the sites
    // that plant, none left at the tents that no longer do.
    const ownSites = (type === 2 || (type === 1 && breachReady(layout.objectives?.bomb))) && why === null ? layout.objectives?.bomb?.sites ?? [] : [];
    // A base with no outline of its own (a blank floor) borrows the donor's (`SITE_OUTLINE_DONOR`), when it is on this disc.
    const outlineDonor = ownSites.length && !absent.has(SITE_OUTLINE_DONOR) ? await hostageLibOf(SITE_OUTLINE_DONOR) : null;
    const aimed = withSiteOutlines(flared, ownSites, outlineDonor);
    const unplayable = why === null ? undefined : `${why}; playing the base's mode`;
    // FG-24: the layout's fog and light on the map's camera and rig (`./matchMap` `withSettings`, its limit said there).
    // A new empty map's own light rig (`settings.lightRig`) over the one its library lends: the match lit as the editor is.
    // Its sky: the chosen disc map's dome over the floor (`./skyDome`), its textures carried as a turret's are.
    const skyLib = base.kind === 'blank' && own.skyFrom ? await hostageLibOf(own.skyFrom) : null;
    const skyDome = skyLib ? skyDomeFor(skyLib, aimed.archive) : null;
    /**
     * Its fog's on, near distance and height band (the camera record's) and its night (`NightMission`, `LensFX_NVG`), over
     * the fog distance's own near (`withSettings`) -- set last, so the near it names is the near played.
     */
    const ownAtmosphere = (m: LoadedMap): LoadedMap => {
      if (base.kind !== 'blank' && base.kind !== 'map') return m;
      const f = own.fog, cam = m.camera;
      return {
        ...m,
        ...(f && cam ? { camera: { ...cam, fogEnabled: f.on, fogNear: Math.max(0, Math.min(f.near, cam.fogFar - 1)), fogAltitude: f.height !== null,
          ...(f.height ? { fogTop: f.height.top, fogBottom: f.height.bottom } : {}) } } : {}),
        ...(own.night ? { night: { mission: own.night.mission, lens: own.night.lens ? [...own.night.lens] as [number, number, number, number] : null } } : {}),
      };
    };
    // Its fog colour (the camera record's) and drop-shadow direction likewise.
    const lit = base.kind !== 'blank' && base.kind !== 'map' ? aimed : {
      ...aimed,
      ...(own.lightRig ? { lightRig: own.lightRig as GlobalLighting } : {}),
      ...(skyDome ? { world: [...aimed.world, ...skyDome.world], textures: { ...aimed.textures, ...skyDome.textures },
        textureFlags: { ...aimed.textureFlags, ...skyDome.textureFlags },
        ...(aimed.textureMips || skyDome.textureMips ? { textureMips: { ...(aimed.textureMips ?? {}), ...(skyDome.textureMips ?? {}) } } : {}) } : {}),
      ...(own.shadowVector ? { shadowVector: [...own.shadowVector] as [number, number, number] } : {}),
      // A colour chosen is a fog to see: on, whatever the built-from map's camera had.
      ...(own.fogColor && aimed.camera ? { camera: { ...aimed.camera, fogEnabled: true, fogColor: [...own.fogColor] as [number, number, number] } } : {}),
    };
    // The layout's roster (`./rosterSetting`): each side's types, bodies lent from their disc maps, with their kits; then
    // its arsenal over that (`./arsenalSetting`): the room's kits, its pick replay and the bots' kits read both.
    const donors = new Map<string, RosterMap>();
    for (const stem of rosterStems(own.characters)) { const lib = await hostageLibOf(stem); if (lib) donors.set(stem, lib); }
    const rostered = withRoster(ownAtmosphere(withSettings(lit, own)), own.characters, (stem) => donors.get(stem) ?? null);
    const armed = mapWithArsenal(rostered.map, own.arsenal);
    // The map's own world values the layout writes over (`./worldSettings`): the default surface and the field of view.
    const world = withWorldSettings(armed.map, own);
    return { c, layout, lentAssets, own, fit, playerSide, composed, hostagesLeft: played.hostagesLeft, hostagesOffGrid: played.hostagesOffGrid, hostagesPastBound: played.hostagesPastBound, zonesLeft: played.zonesLeft, turretsLeft: turreted.unplaced, doorsLeft: doored.unplaced, arsenalRefused: [...rostered.refused, ...armed.refused, ...world.refused], map: world.map, gameMode: type !== undefined && why === null ? modeCaption(type) : undefined, unplayable };
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
    const disc = l.base.kind === 'map' && baseMap ? mapDataShown(baseMap).slots.map((s) => ({ side: s.side, at: s.position })) : undefined;
    // Extraction's hostages and zones the base holds itself: a map's escortees and kind-1 zones; a blank floor none.
    // The base's own objectives as this layout keeps them (those it deleted out, `./mapDataHide`): its hostages, its
    // extraction zones, its bomb start and its tents; its AI map too, where Play stands the placed hostages (a blank
    // floor's own, `./floorAi`): Check counts as Play places (main).
    const kept = l.base.kind === 'map' && baseMap ? mapDataShown(baseMap) : null;
    const own = kept
      ? { ai: kept.ai, hostages: kept.escortees?.length ?? 0, zones: kept.ai ? zonesOfKind(kept.ai, 1).length : 0,
        safety: !!kept.ai?.maps.some((s) => s.zones.some((z) => z.name.toLowerCase() === 'safety')),
        bomb: { start: !!kept.bombStart, seal: !!plantSite('seal', kept.meta?.actions ?? []), terrorist: !!plantSite('terrorist', kept.meta?.actions ?? []) } }
      : { ai: floorAiMaps(FLOOR_SIZE), hostages: 0, zones: 0 };
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
  /**
   * The map whose round cues a match plays (the owner, 2026-11-06; `../soundData` `soundFromDisc` `cuesFrom`): where the
   * layout plays a game type other than its map's own (`missionlist.rdr`, `kitGameType`), a disc map of that type --
   * the intro, the bomb's and the hostages' lines, the win and loss and their voices and music its script's. Undefined
   * where the map's own already is that type, or no map of it is on this disc (its own then, as before).
   */
  const cueDonorFor = async (archive: string): Promise<{ path: string; archive: string } | undefined> => {
    const type = layoutMode ? null : authoredType;
    if (type === null) return undefined;
    if (!missionKitsRead) { try { missionKits = await loadKitSource(assetSourceFor(archives.sourceRequest())); } catch { missionKits = null; } missionKitsRead = true; }
    if (kitGameType(missionKits, archive) === type) return undefined;
    const donor = entries.find((e) => !e.campaign && !absent.has(e.stem) && kitGameType(missionKits, e.stem) === type);
    return donor ? { path: donor.path, archive: donor.stem } : undefined;
  };
  const startMatch = async (agentGuard?: () => void): Promise<void> => {
    if (match || playing || busy || !base) return;
    if (editsLocked()) { notifier.refused('Play waits while a lobby is open: the lobby\'s host launches its match'); return; }
    if (refuseMissingPacks('Play')) return;
    busy = true;
    busyCause = 'play';
    showLoading('Starting the match');
    // The Play settings' Start: the original's loading screen over the load, the layout's map and words (`showPlayLoading`).
    if (playLoading === 'loading') await showPlayLoading();
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
      const [clips, rawExtras] = await Promise.all([archives.clips(MATCH_CLIPS), matchExtras(archives.sourceRequest(), c.groundMap, await cueDonorFor(c.groundMap.archive), m.lentAssets)]);
      const extras = withExtrasSettings(rawExtras, own).extras;          // the layout's surface and reverb (`./worldSettings`)
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
        forgeLighting: forgeLightingOptions(own, baseMap, (base?.kind === 'blank' || base?.kind === 'map') && !!own.fogColor), brighten: matchBrightenOf(own), ...(m.gameMode ? { gameMode: m.gameMode } : {}), source: archives.sourceRequest(),   // F7 (a): the overlay's cues read from it
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
        ...(m.arsenalRefused.length ? [`map settings: ${m.arsenalRefused.join('; ')}`] : []),
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
    } finally { busy = false; showLoading(null); playLoadingPanel?.hide(); }
  };
  /**
   * The original's loading screen for Play (a browser adaptation, research 125): read off the layout's Loading screen map
   * (else the base's, a blank floor's library's), its title and description the layout's where set, and drawn by the main
   * page's own panel (`../loadingPanel`) until the match has started or failed. A screen with no layout (a source without
   * `RUN/UI/READERC.ZAR`) is not shown and is said; the start goes on either way.
   */
  let playLoadingPanel: LoadingPanel | null = null;
  const showPlayLoading = async (): Promise<void> => {
    const home = baseMap ?? charMap;
    const stem = settings.loading?.from ?? home?.archive ?? null;
    const path = (stem ? entries.find((e) => e.stem === stem)?.path : undefined) ?? home?.path;
    if (!path) return;
    playLoadingPanel ??= new LoadingPanel(doc);
    playLoadingPanel.cover();
    const screen = await forgeLoadingScreen(archives.sourceRequest(), path);
    if (screen?.layout) playLoadingPanel.show(withLoadingTitle(screen, settings.loading));
    else { playLoadingPanel.hide(); say(`no loading screen to show for ${stem ?? path}${screen?.missing.length ? `: ${screen.missing[0]}` : ''}`, true); }
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
    playLoadingIn.value = playLoading;
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
  playLoadingIn.addEventListener('change', () => {
    playLoading = playLoadingIn.value === 'loading' ? 'loading' : 'direct';
    writeView();
    say(playLoading === 'loading' ? 'Play: through the loading screen' : 'Play: straight into the match');
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
    for (const i of [gameTypeSel, lightIn, lightReset, fogIn, fogReset, numIn.players, numIn.rounds, numIn.roundSeconds, ffIn, npcSel, respawnIn, eqSel, fx, fy, fz, fyaw]) i.disabled = editsLocked() || (i === fogReset && settings.fogFar === null);
    settingsDom.arsenal.draw({ setting: settings.arsenal, kits: (baseMap ?? charMap)?.arsenal ?? null, locked: editsLocked() });   // redrawn only on a change
    drawRoster();
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
      const [clips, rawExtras] = await Promise.all([archives.clips(MATCH_CLIPS), matchExtras(archives.sourceRequest(), m.c.groundMap, await cueDonorFor(m.c.groundMap.archive), m.lentAssets)]);
      const extras = withExtrasSettings(rawExtras, m.own).extras;        // the layout's surface and reverb (`./worldSettings`)
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
        forgeLighting: forgeLightingOptions(m.own, baseMap, (base?.kind === 'blank' || base?.kind === 'map') && !!m.own.fogColor), brighten: matchBrightenOf(m.own), ...(m.gameMode ? { gameMode: m.gameMode } : {}), source: archives.sourceRequest(),   // F7 (a): the overlay's cues read from it
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
        const own = baseMap ?? charMap;
        if (!own) return null;
        // The ARMORY's valves the layout's over the map's (`./arsenalSetting`), as the lobby's match plays them.
        const map = mapWithArsenal(own, settingsOf(o.layout).arsenal).map;
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
      // The tree is the editor's own (`withoutTree`): the lobby plays every placement at its own world place.
      const made = await createLobby(lobbyBase(), name, withoutTree(l), ticket, undefined, { listed: visibilityToggle.listed(), password: passwordField.password() });
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
    selectHiddenIn.checked = selectHidden;
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
    say(selectMapProps ? 'Select: map data can be selected' : 'Select: map data is passed over');
  });
  selectUserPropsIn.addEventListener('change', () => {
    selectUserProps = selectUserPropsIn.checked;
    writeView();
    say(selectUserProps ? 'Select: user data can be selected' : 'Select: user data is passed over');
  });
  selectHiddenIn.addEventListener('change', () => setSelectHidden(selectHiddenIn.checked));
  moveBtn.addEventListener('click', () => setGizmo('translate'));
  spaceBtn.addEventListener('click', () => setGizmoSpace(gizmoSpace === 'world' ? 'local' : 'world'));
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
  // The Source's counts (`drawPaletteCounts`): asked for the first time it is opened, by the pointer or the keys.
  for (const type of ['pointerdown', 'keydown', 'focus'] as const) {
    paletteSel.addEventListener(type, () => { if (paletteCountsAsked) return; paletteCountsAsked = true; drawPaletteCounts(); });
  }
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
    const next = await layoutForSelect(chosen, paletteStem() || entries[0]?.stem || BLANK_LIBRARY).catch((e: unknown) => { say(String(e), true); return null; });
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
  outlinerFilter.addEventListener('toggle', () => { if (outlinerFilter.open) drawOutlinerFilter(); });
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
  /*
   * The toolbar's menu bar (the owner, 2026-11-11: "a top level Menu ... File, Edit, Window"; a browser adaptation, FG.R2):
   * File's New, Open and Saves (their toolbar buttons gone, each row pressing its button); Edit's undo and redo, cut,
   * copy, paste, duplicate and delete; Window's every panel, ticked while it is in the docks (a press closes or opens it
   * again), and Reset layout. The toolbar scrolls sideways and clips, so an open menu's list stands in the page's body,
   * under its title, as Snap's panel does.
   */
  {
    type MenuRow = { label: string; keys?: string; icon?: string; act: () => void; enabled?: () => boolean; checked?: () => boolean } | 'rule';
    const menubar = el(doc, 'nav', 'fx-menubar');
    menubar.setAttribute('role', 'menubar');
    menubar.setAttribute('aria-label', 'Forge menu bar');
    const menus: { d: HTMLDetailsElement; list: HTMLElement }[] = [];
    const shut = (m: { d: HTMLDetailsElement; list: HTMLElement }): void => {
      m.d.open = false;
      m.list.classList.remove('fx-menubar-floating');
      if (m.list.parentElement !== m.d) m.d.append(m.list);
    };
    const topMenu = (title: string, rows: () => MenuRow[]): void => {
      const d = doc.createElement('details');
      d.className = 'fx-menubar-menu';
      const summary = doc.createElement('summary');
      summary.className = 'fx-menubar-title';
      summary.textContent = title;
      summary.setAttribute('role', 'menuitem');
      const list = el(doc, 'div', 'fx-menubar-list');
      list.setAttribute('role', 'menu');
      list.setAttribute('aria-label', title);
      d.append(summary, list);
      const m = { d, list };
      menus.push(m);
      const draw = (): void => {
        const all = rows();
        // A tick column only in a menu that ticks (Window); File and Edit start at their icons (the owner, 2026-11-11).
        const ticks = all.some((r) => r !== 'rule' && r.checked !== undefined);
        list.classList.toggle('has-ticks', ticks);
        list.replaceChildren(...all.map((r) => {
          if (r === 'rule') { const hr = el(doc, 'div', 'fx-menubar-rule'); hr.setAttribute('role', 'separator'); return hr; }
          const b = el(doc, 'button', 'fx-menubar-row');
          b.type = 'button';
          const ticked = r.checked?.();
          b.setAttribute('role', ticked === undefined ? 'menuitem' : 'menuitemcheckbox');
          if (ticked !== undefined) b.setAttribute('aria-checked', String(ticked));
          b.disabled = r.enabled ? !r.enabled() : false;
          const words = el(doc, 'span', 'fx-menubar-label', r.label);
          if (r.icon) words.insertAdjacentHTML('afterbegin', r.icon);   // a panel's icon before its name (Window)
          if (ticks) b.append(el(doc, 'span', 'fx-menubar-tick', ticked ? '✓' : ''));
          b.append(words, el(doc, 'span', 'fx-menubar-keys', r.keys ?? ''));
          b.addEventListener('click', () => { shut(m); r.act(); });
          return b;
        }));
      };
      summary.addEventListener('click', (e) => {
        e.preventDefault();
        const opening = !d.open;
        for (const other of menus) shut(other);
        if (!opening) return;
        d.open = true;
        draw();
        list.classList.add('fx-menubar-floating');
        doc.body.append(list);
        const r = summary.getBoundingClientRect();
        list.style.top = `${Math.round(r.bottom + 2)}px`;
        list.style.left = `${Math.round(Math.max(4, Math.min(r.left, (doc.defaultView?.innerWidth ?? r.right) - list.offsetWidth - 4)))}px`;
      });
      // One menu open: moving onto another title opens that one, as a desktop menu bar does.
      summary.addEventListener('pointerenter', () => { if (menus.some((o) => o !== m && o.d.open)) summary.click(); });
      menubar.append(d);
    };
    doc.addEventListener('pointerdown', (e) => {
      const t = e.target as Node | null;
      for (const m of menus) if (m.d.open && !(t && (m.d.contains(t) || m.list.contains(t)))) shut(m);
    }, true);
    doc.addEventListener('keydown', (e) => { if (e.key === 'Escape') for (const m of menus) if (m.d.open) shut(m); });
    top.addEventListener('scroll', () => { for (const m of menus) shut(m); }, { passive: true });
    doc.defaultView?.addEventListener('resize', () => { for (const m of menus) shut(m); });
    const unlocked = (): boolean => picks.items.some((r) => !lockedOf(r));
    topMenu('File', () => [
      { label: 'New…', icon: icon('file'), act: () => newBtn.click() },
      { label: 'Open…', icon: icon('open'), keys: 'Ctrl+O', act: () => openBtn.click() },
      { label: 'Saves…', icon: icon('save'), keys: 'Ctrl+S', act: () => saveBtn.click() },
    ]);
    topMenu('Edit', () => [
      { label: 'Undo', icon: icon('undo'), keys: 'Ctrl+Z', act: undo, enabled: () => !undoBtn.disabled },
      { label: 'Redo', icon: icon('redo'), keys: 'Ctrl+Y', act: redo, enabled: () => !redoBtn.disabled },
      'rule',
      { label: 'Cut', icon: icon('cut'), keys: 'Ctrl+X', act: cutSelection, enabled: unlocked },
      { label: 'Copy', icon: icon('copy'), keys: 'Ctrl+C', act: copySelection, enabled: unlocked },
      { label: 'Paste', icon: icon('paste'), keys: 'Ctrl+V', act: pasteClipboard, enabled: () => clipboard.length > 0 },
      'rule',
      { label: 'Duplicate', icon: icon('duplicate'), keys: 'Ctrl+D', act: duplicate, enabled: () => !dupBtn.disabled },
      { label: 'Delete', icon: icon('trash'), keys: 'Del', act: remove, enabled: () => !delBtn.disabled },
    ]);
    // AI Navigation (the owner, 2026-11-12: "next to Window ... all the navigation specific toggles"): the AI map switch
    // (the Display menu's Draw row) and each of its layers (`aiNav`); a layer turned on turns the map on with it.
    const aiNavRow = (label: string, key: keyof typeof aiNav): MenuRow => ({ label, checked: () => view.aimap && aiNav[key], act: () => setAiNav(key, !(view.aimap && aiNav[key])) });
    const navMenu = (): MenuRow[] => [
      { label: 'AI Navigation', checked: () => view.aimap, act: () => { view.aimap = !view.aimap; applyView(); } },
      'rule',
      aiNavRow('Cells by soil', 'cells'),
      aiNavRow('Blocked by placed props', 'blocked'),
      aiNavRow('Links between sub-maps', 'links'),
      aiNavRow('Hostage routes', 'routes'),
      'rule',
      aiNavRow('Legend', 'legend'),
    ];
    topMenu('Window', () => [
      ...(shell.windowItems?.() ?? []).map((p): MenuRow => ({
        label: p.title, icon: panelIcon(p.key), checked: () => p.docked,
        // A tab closed whole (every section it holds), or opened again where it was.
        act: () => { if (p.docked) { if (shell.closeTabOf) shell.closeTabOf(p.id); else shell.collapse(p.id); } else shell.reveal(p.id); leaseCheck(); },
      })),
      'rule',
      { label: 'Reset layout', icon: icon('reset'), act: () => resetLayoutBtn.click() },
    ]);
    topMenu('AI Navigation', navMenu);
    top.querySelector('.fx-brand')?.after(menubar);
    // New, Open and Saves now in File: their toolbar buttons off the page (the rows press them; their hooks kept).
    for (const b of [newBtn, openBtn, saveBtn]) b.remove();
  }
  /*
   * A dropdown's value stepped by the wheel (the owner, 2026-11-11: "when it is focused, and the mouse is over it and I
   * press scroll, it should scroll the value"; a browser adaptation, FG.R2): every `<select>` of the page, while it has the
   * focus and the pointer is on it -- down the next choice, up the previous, a greyed one passed over, a notch's travel a
   * step (`WHEEL_NOTCH_PX`, a trackpad's deltas summed) -- told as a choice is (`input`, `change`). The page does not scroll.
   */
  {
    let travel = 0;
    let travelOf: HTMLSelectElement | null = null;
    doc.addEventListener('wheel', (e) => {
      const s = (e.target as Element | null)?.closest?.('select');
      if (!s || s.multiple || s.disabled || doc.activeElement !== s || s.options.length === 0) return;
      e.preventDefault();
      if (travelOf !== s) { travelOf = s; travel = 0; }
      travel += e.deltaMode === 1 ? e.deltaY * WHEEL_LINE_PX : e.deltaY;
      if (Math.abs(travel) < WHEEL_NOTCH_PX) return;
      const dir = travel > 0 ? 1 : -1;
      travel = 0;
      let i = s.selectedIndex;
      for (let j = i + dir; j >= 0 && j < s.options.length; j += dir) {
        if (!s.options[j]!.disabled && !s.options[j]!.hidden) { i = j; break; }
      }
      if (i === s.selectedIndex) return;
      s.selectedIndex = i;
      s.dispatchEvent(new Event('input', { bubbles: true }));
      s.dispatchEvent(new Event('change', { bubbles: true }));
    }, { passive: false, capture: true });
  }
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
  setGizmoSpace(gizmoSpace);
  setSnaps(snap, turnSnap);
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
        note: locked ? 'Locked: Cross selects and looks (no edits) · Square unlocks it' : 'Cross selects it and looks at it',
        act: () => { select(r); focusOn(r); },
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
        { id: 'snap', label: 'Snap', value: snap && turnSnap ? 'On' : snap ? 'Grid' : turnSnap ? 'Turn' : 'Off', keepOpen: true, act: () => setSnap(!snapAny()), left: () => setSnap(!snapAny()), right: () => setSnap(!snapAny()) },
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
  const blankLibrary = (): string => paletteStem() || entries[0]?.stem || BLANK_LIBRARY;
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
    // A locked placement is never turned (selectable, not editable: the owner, 2026-11-11).
    if (picks.items.some(lockedOf)) { notifier.refused('Locked: unlock it to turn it'); return; }
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
      case 'snap': setSnap(!snapAny()); pop(snapAny() ? 'Snap on' : 'Snap off'); break;
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
      for (const r of picks.items) if (!lockedOf(r)) r.position.add(step);   // a locked one stays (selectable, not editable)
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
    if (split && split.active() !== 0) { writeView(); return; }   // another view's camera: kept with the split
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
    characters, charLabel, absent: () => absent, paletteArchive: () => paletteStem(), chosen: () => chosen, npcChoice: () => npcChoice,
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
    adoptLayoutCamera: (camera) => {
      split?.activateMain();
      if (camera) { fly.setPose(camera); fly.halt(); viewCamera = cameraNow(); noteCamera(); }
      cameraReady = true;
      if (base) split?.mapOpened(splitMapKey(base));
      writeView();
    },
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
  /** An object asset's source identity (`sourceIdentity`): one per kind and map, kept for the page's life. */
  const objectSources = new Map<string, object>();
  /**
   * An object of the asset browser dropped on the world (`place`): built and placed as its toolbar tool places it at a
   * click -- one edit -- at `at` turned `yaw`; a switch linked to the nearest placed gate, as a click's is. True when placed.
   */
  const placeObjectAt = (o: { kind: ObjectKind; source: string; name: string }, at: Vector3, yaw: number): Promise<boolean> => new Promise((done) => {
    const op = o.kind === 'ambient' ? 'object.place' : o.kind === 'door' ? 'door.place' : o.kind === 'turret' ? 'turret.place' : o.kind === 'gate' ? 'gate.place' : o.kind === 'barrier' ? 'barrier.place' : o.kind === 'flare' ? 'flare.place' : 'switch.place';
    const args = o.kind === 'flare' ? { source: o.source, name: o.name } : {};
    let ran = false;
    const accepted = personEdit(op, args, (step) => {
      ran = true;
      void buildObject(o).then((r) => {
        if (!r) { done(false); return; }
        const before = selectionIds();
        if (o.kind === 'switch') {
          const gates = gateRootsNow();
          const near = gates.length ? gates.reduce((a, b) => (a.position.distanceTo(at) <= b.position.distanceTo(at) ? a : b)) : null;
          switchGate.set(r, near);
        }
        r.rotation.y = yaw;
        seatOn(r, at);
        addRoot(r);
        select(r);
        say(`${nameOf(r)} placed`);
        edit(before, step);
        done(true);
      }, () => done(false));
    }, true);
    if (!accepted && !ran) done(false);
  });
  const shellEditorOf = (api: ForgeAgentApi): ForgeEditor => {
    /** The pieces this editor staged, each with the page's own release (R4: a place consumes it through that). */
    const ours = new WeakMap<StagedPiece, () => void>();
    return {
      async previewPiece(asset) {
        const obj = parseObjectAsset(asset);
        // An ambient effect's thumbnail: its particles stepped ahead (`./previewAssets` `ambientPreview`).
        if (obj?.kind === 'ambient' && soundOfAssetName(obj.name) !== null) return null;   // a sound: nothing to draw
        // An ambient effect's thumbnail, or a single effect's: its particles stepped ahead (`ambientPreview` plays any by name).
        if (obj?.kind === 'ambient') return ambientPreview(archives.sourceRequest(), obj.source, effectOfAssetName(obj.name) ?? obj.name, true);
        // Drawn as the game draws it (the owner, 2026-11-11): the previews' own templates -- textured, lit, no wireframe,
        // whatever the Draw menu says -- and no editor guides (a door's swing, a ladder's climb side...).
        const r = obj ? await buildObject(obj, true).catch(() => null) : await newPiece(asset, undefined, true).catch(() => null);
        if (!r) return null;
        r.traverse((o) => { if (o.userData['forgeGuideKind'] || o.userData['forgeGuide']) o.visible = false; });
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
        // An object of the browser's tabs (`parseObjectAsset`) built as its tool builds it; a prop as before.
        const obj = parseObjectAsset(asset);
        const r = obj ? await buildObject(obj).catch(() => null) : await newPiece(asset).catch(() => null);
        if (!r) return null;
        // An ambient effect's ghost and tooltip run its particles (`ambientPreview`) about its marker.
        if (obj?.kind === 'ambient' && soundOfAssetName(obj.name) === null) {
          const live = await ambientPreview(archives.sourceRequest(), obj.source, effectOfAssetName(obj.name) ?? obj.name).catch(() => null);
          if (live) { r.add(live.object); const d = r.userData['dispose'] as (() => void) | undefined; r.userData['dispose'] = () => { live.dispose(); d?.(); }; }
        }
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
        // An object (`parseObjectAsset`): placed as its tool places it (`placeObjectAt`), the ghost let go.
        const obj = parseObjectAsset(staged.asset);
        if (obj) {
          try {
            placed = await placeObjectAt(obj, new Vector3(at[0], at[1], at[2]), yaw ?? 0);
            return placed ? { ok: true, revision: api.status().revision } : { ok: false, code: 'REFUSED', revision };
          } finally { staged.dispose(); }
        }
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
      // The Outliner's asset drop: the view's centre, through the same projection as a drop on the world.
      projectCentre() {
        const rect = input.getBoundingClientRect();
        return this.projectDrop(rect.left + rect.width / 2, rect.top + rect.height / 2);
      },
      sourceIdentity(asset) {
        if (asset === FORGE_BLOCK) return FORGE_BLOCK_SOURCE;
        const obj = parseObjectAsset(asset);
        if (obj) { const key = `${obj.kind}.${obj.source}`; let id = objectSources.get(key); if (!id) objectSources.set(key, id = Object.freeze({ object: key })); return id; }
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
  shell.register(asPerson({ ...examplesForgePanel(() => starterContext()), tab: 'Map' }));
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
    const realDt = (now - last) / 1000, dt = Math.min(realDt, 0.1);   // AQ-17: the render scale counts the real frame
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
    syncSwitchLinks();                                       // each placed switch's line to its gate
    syncAmbientGuides();                                     // each placed ambient effect's hearing
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
    // The split viewport (`./splitViews`): one view under Walk, Play or a shot, the active one; else each drawn below.
    split?.setSuspended(playing || shot.driver.active());
    const splitDraws = split?.drawList() ?? [];
    if (!splitDraws.length) {
      baseView?.frame(fly.viewportCamera(), dt);
      skyView?.frame(fly.viewportCamera(), dt);             // a new empty map's copied sky: its clouds' scroll
      turnPlacedFlares(fly.viewportCamera().position);
    }
    if (selected || isGroup()) refreshBox();
    forgeLighting.update([scene], forgeLightingOptions(settings, baseMap, envEditable() && !!settings.fogColor));
    // LATER 471 (a browser adaptation, `EXTENSION_HOST_ADAPTATION`; dot's placement 2026-10-25T21:45Z): the extension
    // host's schedule -- each enabled system's `frame(dt)`, dt in seconds -- once a drawn frame, never under a match.
    extensions?.frame(dt);
    syncAxisWidget();
    if (splitDraws.length) {
      // Each view as its own camera sees the map: the world's camera-facing work (facades, LOD fades, the sky) for it,
      // the placed flares turned to it, its marks, the one gizmo sized for it; the active view last, so the scene is
      // left as its camera sees it (picking). The clocks advance once a frame, with the first view drawn.
      created.renderViews(scene, splitDraws, (i) => {
        const v = splitDraws[i]!;
        const tick = i === 0 ? dt : 0;
        baseView?.frame(v.camera, tick);
        skyView?.frame(v.camera, tick);
        turnPlacedFlares(v.camera.position);
        applyViewMarks(v.look);
        mapBillboards.fit(v.camera);                           // its marks sized for this view's camera
        gizmo.camera = v.camera;
      });
      gizmo.camera = fly.viewportCamera();
    } else {
      mapBillboards.fit(fly.viewportCamera());                 // the marks sized for this camera (`MapDataBillboards.fit`)
      created.render(scene, fly.viewportCamera());
    }
    adaptiveRatio.frame(realDt, now, ratioTarget, view.ps2 || busy);   // FP-2: `../matchMount`'s tail; held under the PS2 frame and while the page loads
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
      // The multiplayer maps by name (the owner, 2026-11-13: "list them in alphabetical order ... don't sort the
      // campaigns"), then the campaign's missions in their own order -- every map list reads this: the asset browser's,
      // the base's, New's and the Inspector's Map choices.
      entries = [...entries].sort((a, b) => Number(a.campaign) - Number(b.campaign)
        || (a.campaign ? 0 : a.label.localeCompare(b.label, undefined, { sensitivity: 'base', numeric: true })));
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
  // The asset browser's All first (the owner, 2026-11-10: "or even an all value"; "remove the shared and just keep all
  // ... it should be a union of all the maps"; `showEveryMap`): every map's props and objects together.
  {
    const g = el(doc, 'optgroup');
    g.label = 'Across maps';
    g.append(opt(PALETTE_ALL, 'All \u00b7 every map'), opt(PALETTE_COMMON, 'Common \u00b7 shared by every map'));
    paletteSel.append(g);
  }
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
