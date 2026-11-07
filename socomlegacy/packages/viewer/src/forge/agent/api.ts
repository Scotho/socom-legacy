import { LIMITS } from '@s2u/forge-agent-protocol';
import type { HistoryActor } from '../history';
import type { LayoutRecord } from '../record';
import type { ForgeRulesDraft } from '../rulesAuthoring';
import type { OperationRegistry } from '../shell/operations';
import type { MapIssue } from '../validate';
import { FORGE_PLAY_AXES, FORGE_PLAY_BUTTONS, FORGE_PLAY_OPERATIONS, type ForgePlayState } from './play';
import { CAMERA_SHOT_HOLD_ADAPTATION, CAMERA_SHOT_POINTS_ADAPTATION, CAMERA_SHOT_SECONDS_ADAPTATION, parseCameraShot,
  type CameraShotReceipt, type CameraShotSpec } from '@s2u/forge-agent-protocol';
import { shotAdmission, type ShotBounds, type ShotDriver, type ShotEnded } from '../camera/driver';

/**
 * FUI-1 (the review's UX-2; a browser adaptation): the snapshot's catalogue, issues and view, typed as the page builds them
 * (`./editorFacade` `agentSnapshot`, LATER 422), so a panel reads what the agent reads. A section the facade did not fill -- a blocked or
 * disposed read answers `{}` -- is `ForgeAgentUnread`: its discriminating field is absent.
 */
export type ForgeAgentUnread<Field extends string> = { readonly [field: string]: unknown } & { readonly [K in Field]?: undefined };
export interface ForgeAgentCatalogue {
  archives: { stem: string; label: string; campaign: boolean }[];
  /** The palette archive's props (`../library` `PaletteEntry`). */
  palette: { asset: string; model: string; placed: number }[];
  characters: { side: 'seal' | 'terrorist'; type: number; label: string }[];
  absent: string[];
  paletteArchive: string;
  chosen: string | null;
  npcChoice: { side: 'seal' | 'terrorist'; type: number } | null;
  favourites: string[];
  filter: 'all' | 'favs' | 'characters';
  query: string;
  loading: boolean;
  baseReady: boolean;
  basePlacements: { key: string; model: string; at: number[] }[];
  hidden: string[];
  /** The base map's own bomb start and its MPBOMB actions, as the disc's map carries them (`../../loadMap`). */
  objectives: { bombStart: [number, number, number] | null; bombSites: unknown[] };
}
/** The editor's switches the view carries (`../page` `VIEW_TOGGLES`). */
export type ForgeAgentViewToggle = 'wireframe' | 'untextured' | 'collision' | 'grid' | 'spawns' | 'fog' | 'shadows' | 'detail' | 'billboards'
  | 'alternate' | 'blendgraded' | 'engineorder' | 'ps2';
export type ForgeAgentView = Record<ForgeAgentViewToggle, boolean> & {
  revision: number;
  snap: boolean;
  gridStep: number;
  turnStep: number;
  tool: 'select' | 'place' | 'spawnA' | 'spawnB' | 'respawnA' | 'respawnB' | 'flare' | 'npc' | 'hostage' | 'zone' | 'point' | 'view' | 'turret' | 'door' | 'gate' | 'barrier' | 'ladder' | 'bomb' | 'siteSeal' | 'siteTerrorist';
  gizmo: string;
  camera: { x: number; y: number; z: number; yaw: number; pitch: number };
  /** The private scenario's status (`./play` `status`), null when none ran. */
  scenario: unknown;
  saves: { id: string; name: string; savedAt: number }[];
  /** The layout revision the issues were checked at; null when unchecked since. */
  issuesRevision: number | null;
  notes: string[];
};

/** Browser adaptation: a narrow, JSON-only editor boundary. Refs live for ONE revision, never across edits. */
export interface ForgeAgentSnapshot {
  ready: boolean;
  mode: 'forge-editor' | 'forge-play' | 'blocked';
  revision: number;
  layout: LayoutRecord | null;
  selection: string[];
  refs: unknown[];
  catalogue: ForgeAgentCatalogue | ForgeAgentUnread<'archives'>;
  issues: MapIssue[];
  view: ForgeAgentView | ForgeAgentUnread<'tool'>;
  canUndo: boolean;
  canRedo: boolean;
  /** Read-only private match observations; null before its actual mount is ready or after it ends. */
  play?: ForgePlayState | null;
  /** FCW-32: the layout's rules (`../rulesAuthoring`), which its record has no field for; null or absent when none. */
  rules?: ForgeRulesDraft | null;
}
/**
 * Browser adaptation: the cheap status a connection reads per request and per capture chunk -- no layout, catalogue or
 * refs built or cloned. `revision` is the layout's (the one an edit carries); `viewRevision` the camera's, palette's and tool's.
 */
export interface ForgeAgentStatus { ready: boolean; mode: ForgeAgentSnapshot['mode']; revision: number; viewRevision: number; name: string; map: string | null }
export interface ForgeAgentActionResult { ok: boolean; code?: string; message?: string; revision: number; data?: unknown }
export interface ForgeAgentExecuteOptions {
  signal?: AbortSignal;
  /**
   * FUI-6 (a browser adaptation): who asks. Absent, the paired agent (its `sessionId` when the connection gives one); the
   * page's panels call as the person (`../page` `ctx.forge`). It names the history step, and changes no refusal or receipt.
   */
  actor?: HistoryActor;
  sessionId?: string;
}
export interface ForgeAgentApi {
  read(): ForgeAgentSnapshot;
  /** Browser adaptation: readiness, surface and revisions without a snapshot (see ForgeAgentStatus). */
  status(): ForgeAgentStatus;
  execute(operation: string, args: unknown, expectedRevision?: number, requestId?: string, options?: ForgeAgentExecuteOptions): Promise<ForgeAgentActionResult>;
  subscribe(listener: (snapshot: ForgeAgentSnapshot) => void): () => void;
  /** Re-pair boundary: invalidate admitted work and clear receipts belonging to the old connection. */
  resetSession(): void;
  /** Local pack/storage writes completed outside this facade: refresh caches and invalidate revision-scoped reads. */
  refreshExternalState(): void;
  dispose(): void;
  /** R5-B (a browser adaptation): an agent camera shot is running now (the agent chip's "Camera shot"). */
  shotRunning?(): boolean;
  /**
   * R5-B: the chip's "Stop camera" and the pad's Circle -- the running shot ended `stopped` at once, outside the
   * request queue; answers its id, or null when none ran. R6: a transport's revoke ends it `revoked` (its `reason`).
   */
  stopShot?(reason?: ShotEnded): string | null;
}
export class ForgeAgentError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}
export interface ForgeAgentPrepared {
  /** Commit synchronously, or call guard again immediately before every asynchronous commit. */
  commit(): unknown | Promise<unknown>;
  dispose(): void;
}
export interface ForgeAgentFacade {
  snapshot(): ForgeAgentSnapshot;
  /** Optional cheap status; without it the status is taken from `snapshot()` (uncloned). */
  status?(): ForgeAgentStatus;
  prepare(operation: string, args: Record<string, unknown>, guard: () => void, signal?: AbortSignal): Promise<ForgeAgentPrepared>;
  subscribe?(listener: () => void): () => void;
  cancel?(reason: string): void;
  refreshExternalState?(): void;
  /**
   * FUI-6: the page's operation registry (`../shell/operations`). An operation it holds (the layout edits) is staged
   * through it, not `prepare`: the same entry the page's own handlers run, one history step naming the actor.
   */
  operations?: OperationRegistry;
  /**
   * R5-A (a browser adaptation): the agent's cinematic camera driver (`../camera/driver`), constructed by the page with
   * its fly-camera setter and driven by its frame loop (round 5b). Absent or null: `camera.shot`, `camera.stop` and
   * `camera.status` refuse UNSUPPORTED.
   */
  shotDriver?: ShotDriver | null;
  /**
   * R5-A: the loaded map's world box a shot is checked against (OUT_OF_BOUNDS); null while no base is loaded
   * (NOT_READY). Only the page can read it, so it is the page's to give; absent or null, `camera.shot` refuses UNSUPPORTED.
   */
  mapBounds?: (() => ShotBounds | null) | null;
}

type Schema = { type?: string; properties?: Record<string, Schema>; required?: string[]; additionalProperties?: boolean;
  items?: Schema; minItems?: number; maxItems?: number; uniqueItems?: boolean; maxLength?: number; enum?: readonly unknown[]; minimum?: number; maximum?: number };
const text: Schema = { type: 'string', maxLength: 160 };
const number: Schema = { type: 'number', minimum: -100_000, maximum: 100_000 };
const flag: Schema = { type: 'boolean' };
const point: Schema = { type: 'array', items: number, minItems: 3, maxItems: 3 };
const refs: Schema = { type: 'array', items: text, maxItems: 2096, uniqueItems: true };
const choice = (...values: string[]): Schema => ({ type: 'string', enum: values });
const object = (properties: Record<string, Schema> = {}, required = Object.keys(properties)): Schema =>
  ({ type: 'object', properties, required, additionalProperties: false });
const arbitraryObject: Schema = { type: 'object' };
/** FCW-32: an authored id (`layout.ts` `AUTHORED_ID`'s length; its grammar is the record's check). */
const authoredId: Schema = { type: 'string', maxLength: 64 };
const size: Schema = { type: 'number', minimum: 0, maximum: 100_000 };
const entityEdits = ['zone.place', 'marker.place', 'spawner.place'] as const;
/**
 * FCW-32 round 2 (the review's F3; a browser adaptation): the most a rules pack carried inline (`rules.export`'s answer,
 * `rules.import`'s files) may take: the control channel's bound (`LIMITS.controlBytes`) less the request's and the
 * result's own room. Past it, the pack travels in the layout's chunked export (`forge.export.begin`), whose envelope
 * carries the rules; the target refuses an inline export past it by name (`RULES_TOO_LARGE`). The import's bound is the
 * WHOLE request's JSON-escaped size (every member's quotes, newlines and non-ASCII count as their escaped bytes, up to 8
 * members), refused by name at the target and at the gateway's sender; the schema's per-member `maxLength` (UTF-16
 * characters) is only its first, cheaper check.
 */
export const RULES_INLINE_BYTES = LIMITS.controlBytes - 4096;
const integer = (minimum: number, maximum: number): Schema => ({ type: 'integer', minimum, maximum });
const rulesEdits = ['rules.new', 'rules.set', 'rules.rule.set', 'rules.rule.delete', 'rules.variable.set', 'rules.variable.delete', 'rules.config.set', 'rules.clear'] as const;
const starterArguments = object({ id: choice('arena', 'crate-stack', 'frostfire-trees', 'hostile-range', 'static-mood', 'demolition'),
  coverRef: text, crateRef: text, treeRefs: { type: 'array', items: text, maxItems: 16, uniqueItems: true },
  hostileType: { type: 'integer', minimum: 0, maximum: 255 } }, ['id']);
type Permission = 'inspect' | 'edit' | 'import' | 'test' | 'diagnose';
const op = <Name extends string>(name: Name, permission: Permission, description: string, inputSchema = object()) =>
  ({ name, permission, description, inputSchema, mutates: permission !== 'inspect' && permission !== 'diagnose' });
/** This is the complete dispatch allowlist; no property names, global hooks or server-backed commands pass through. */
export const FORGE_AGENT_OPERATIONS = [
  op('layout.read', 'inspect', 'Read v2 recipe and revision-scoped refs'),
  op('layout.export', 'inspect', 'Export v2 recipe as JSON data'),
  op('catalogue.read', 'inspect', 'Read loaded assets, characters, archives and readiness'),
  op('starters.list', 'inspect', 'Discover six authored browser-adaptation starter recipes and their requirements; select the actual base first'),
  op('starters.preview', 'inspect', 'Plan a starter on the currently loaded base without editing; actual source, floor and proposed-hull diagnostics can block it', starterArguments),
  op('starters.apply', 'import', 'Validate a starter on the current base and atomically import it as one undoable edit at expectedRevision', starterArguments),
  op('assets.query', 'inspect', 'Query loaded palette prototypes: actual visual bounds and collision roles, never name-based solidity', object({
    query: text, archive: text, role: choice('visual', 'ground-surface', 'wall-surface'),
    limit: { type: 'integer', minimum: 1, maximum: 100 }, cursor: { type: 'string', maxLength: 2048 },
  }, [])),
  op('placement.check', 'diagnose', 'Inspect a queried asset proposal without placing it; bounds-only overlap and sampled hull probes cannot certify traversability', object({ ref: text, at: point, yaw: number }, ['ref', 'at'])),
  op('issues.read', 'inspect', 'Read latest map check issues'),
  op('saves.list', 'inspect', 'Read named browser saves'),
  op('request.receipt', 'inspect', 'Recover a retained request result', object({ requestId: text })),
  op('layout.import', 'import', 'Atomically import a v1 layout or v2 recipe and its base as one undoable edit', object({ layout: arbitraryObject })),
  op('layout.new', 'edit', 'Clear the current base as one undoable edit'),
  op('layout.base', 'edit', 'Stage and change base as one undoable edit', object({ base: arbitraryObject })),
  op('layout.name', 'edit', 'Set recipe name', object({ name: { ...text, maxLength: 48 } })),
  op('layout.batch', 'edit', 'Stage multiple edits as one undo step; destructive ref reindexing is refused before later ref writes', object({ edits: {
    type: 'array', minItems: 1, maxItems: 100, items: object({ operation: choice('layout.name', 'piece.place', 'piece.move', 'piece.rotate', 'piece.delete', 'piece.lock', 'piece.unlock', 'piece.hide', 'piece.restore', 'spawn.place', 'respawn.place', 'flare.place', 'npc.place', 'hostage.place', 'extraction.place', 'point.place', 'view.place', 'turret.place', 'door.place', 'gate.place', 'barrier.place', 'placement.set', 'bomb.place', 'objectives.set', 'settings.set', 'type.set', ...entityEdits, ...rulesEdits), args: arbitraryObject }),
  } })),
  op('piece.place', 'edit', 'Place an asset using the existing piece library', object({ asset: text, at: point, yaw: number }, ['asset', 'at'])),
  op('piece.move', 'edit', 'Move revision-scoped refs by a delta', object({ refs, delta: point })),
  op('piece.rotate', 'edit', 'Turn refs as a group about their centre in radians', object({ refs, yaw: number })),
  op('piece.delete', 'edit', 'Delete unlocked refs', object({ refs })),
  op('piece.lock', 'edit', 'Lock refs', object({ refs })),
  op('piece.unlock', 'edit', 'Unlock refs', object({ refs })),
  op('piece.hide', 'edit', 'Hide base placement keys in the layout', object({ keys: refs })),
  op('piece.restore', 'edit', 'Restore hidden base placement keys', object({ keys: refs })),
  op('selection.set', 'edit', 'Select unlocked revision-scoped refs', object({ refs })),
  op('selection.move', 'edit', 'Move current selection by delta', object({ delta: point })),
  op('selection.rotate', 'edit', 'Turn current selection about centre in radians', object({ yaw: number })),
  op('selection.copy', 'edit', 'Copy selection with the editor clipboard'),
  op('selection.paste', 'edit', 'Paste editor clipboard at a world point', object({ at: point })),
  op('selection.duplicate', 'edit', 'Duplicate selection as one undoable edit', object({ delta: point }, [])),
  op('spawn.place', 'edit', 'Place a team spawn', object({ team: choice('A', 'B'), at: point, yaw: number }, ['team', 'at'])),
  op('flare.place', 'edit', "Place a flare: a copy of one of a disc map's facade nodes (a glow the game turns to the camera), by its archive and node name; a browser adaptation", object({ source: { type: 'string', pattern: '^[A-Z]{1,3}\\d{1,3}$' }, name: { type: 'string', maxLength: 48 }, at: point }, ['source', 'name', 'at'])),
  op('respawn.place', 'edit', "Place a team respawn point, beside the map's own respawn records; a browser adaptation", object({ team: choice('A', 'B'), at: point, yaw: number }, ['team', 'at'])),
  op('hostage.place', 'edit', "Place a hostage beside the base map's own; Escort or Extraction only (a browser adaptation)", object({ at: point, yaw: number, name: { type: 'string', maxLength: 32 } }, ['at'])),
  op('extraction.place', 'edit', "Place an extraction zone (Safety, Safety2...) beside the base map's own; Extraction only (a browser adaptation)", object({ at: point, size: { type: 'array', minItems: 2, maxItems: 2, items: number }, name: { type: 'string', maxLength: 32 } }, ['at'])),
  op('point.place', 'edit', 'Place a tactical point (kind 1 a nav point the compass marks; named Charlie, Delta... by default); a browser adaptation', object({ at: point, name: { type: 'string', maxLength: 32 }, kind: { type: 'integer', minimum: 0, maximum: 31 } }, ['at'])),
  op('view.place', 'edit', 'Place a spectator view: a camera place, yaw and pitch in degrees (named View1... by default); a browser adaptation', object({ at: point, yaw: number, pitch: number, name: { type: 'string', maxLength: 32 } }, ['at'])),
  op('turret.place', 'edit', "Place a turret: a copy of a disc map's own (its archive and node name; Crossroads' RMG by default) at a place, facing yaw radians; a browser adaptation", object({ at: point, yaw: number, source: { type: 'string', maxLength: 8 }, name: { type: 'string', maxLength: 48 } }, ['at'])),
  op('gate.place', 'edit', "Place a gate: a copy of a disc map's own access object with a sliding gate (its archive and root node; Death Trap's access1 by default) -- its lever prompt at the gate, C4 wrecks it -- at a place, turned yaw radians; a browser adaptation", object({ at: point, yaw: number, source: { type: 'string', maxLength: 8 }, name: { type: 'string', maxLength: 48 } }, ['at'])),
  op('barrier.place', 'edit', "Place a C4 barrier: a copy of a disc map's own access object (its archive and root node; Vigilance's access1 by default) that C4 or an RPG wrecks, at a place, turned yaw radians; a browser adaptation", object({ at: point, yaw: number, source: { type: 'string', maxLength: 8 }, name: { type: 'string', maxLength: 48 } }, ['at'])),
  op('door.place', 'edit', "Place a door: a copy of a disc map's own (its archive and node; Frostfire's bdoor_4 by default), its hinge at a place, turned yaw radians from that door's own; a browser adaptation", object({ at: point, yaw: number, source: { type: 'string', maxLength: 8 }, name: { type: 'string', maxLength: 48 } }, ['at'])),
  op('placement.set', 'edit', "Set one field a placement keeps: a zone's name, width or depth; a spawn's team; an NPC's side or type; a bomb site's range or elevation; a hostage's character, the base's own key or another disc map's as <map>:<character> (a browser adaptation)", object({ ref: text, field: choice('name', 'character', 'model', 'kind', 'yaw', 'pitch', 'width', 'depth', 'team', 'side', 'type', 'range', 'elevation'), value: {} })),
  op('npc.place', 'edit', 'Place an available character marker', object({ side: choice('seal', 'terrorist'), type: { type: 'integer', minimum: 0, maximum: 255 }, at: point, yaw: number }, ['side', 'type', 'at'])),
  op('bomb.place', 'edit', 'Replace unlocked bomb start or team sites. kind seal is where SEALs plant; terrorist is where Terrorists plant, matching the editor tools.', object({ kind: choice('start', 'seal', 'terrorist'), at: point, yaw: number }, ['kind', 'at'])),
  op('objectives.set', 'edit', 'Validate and set authored objectives', object({ objectives: arbitraryObject })),
  op('settings.set', 'edit', 'Validate and merge existing Forge settings', object({ settings: arbitraryObject })),
  op('type.set', 'edit', 'Choose authored game type; 0 means map own', object({ type: { type: 'integer', minimum: 0, maximum: 5 } })),
  op('view.set', 'edit', 'Set existing drawing toggle', object({ toggle: choice('wireframe', 'untextured', 'collision', 'grid', 'spawns', 'fog', 'shadows', 'detail', 'billboards', 'alternate', 'blendgraded', 'engineorder', 'ps2'), on: flag })),
  op('camera.pose', 'edit', 'Set editor camera pose', object({ x: number, y: number, z: number, yaw: number, pitch: number })),
  op('camera.look', 'edit', 'Look from a world point at another', object({ from: point, to: point })),
  op('camera.focus', 'edit', 'Focus a revision-scoped placement', object({ ref: text })),
  op('camera.objective', 'edit', 'Focus an actual named disc objective, optionally changing map; refuses absent or ambiguous names', object({ archive: text, name: text }, ['name'])),
  // R5-A (a browser adaptation): the cinematic camera -- view only, never the layout; `edit`, as the camera controls
  // above, so a test-only grant gains no Build camera mutation. A stop needs no revision: it is never refused as stale.
  op('camera.shot', 'edit', 'Play one smooth camera shot in Build, submitted once: points [{at, look}] (2..64, inside the map), seconds 1..120, optional hold 0..10 at the last point. The page drives it frame by frame; a second shot replaces it; manual input, Stop, a mode or map change end it', object({
    points: { type: 'array', minItems: CAMERA_SHOT_POINTS_ADAPTATION.min, maxItems: CAMERA_SHOT_POINTS_ADAPTATION.max, items: object({ at: point, look: point }) },
    seconds: { type: 'number', minimum: CAMERA_SHOT_SECONDS_ADAPTATION.min, maximum: CAMERA_SHOT_SECONDS_ADAPTATION.max },
    hold: { type: 'number', minimum: CAMERA_SHOT_HOLD_ADAPTATION.min, maximum: CAMERA_SHOT_HOLD_ADAPTATION.max },
  }, ['points', 'seconds'])),
  { ...op('camera.stop', 'edit', 'End the running camera shot; answers the stopped shot id or null'), mutates: false },
  op('camera.status', 'inspect', 'Read the camera shot: its id, seconds elapsed and, once over, why it ended (manual, mode, map, stopped, revoked, disconnected or done)'),
  op('palette.set', 'edit', 'Load an archive palette without changing the layout', object({ archive: text })),
  op('palette.search', 'edit', 'Filter displayed assets', object({ query: text })),
  op('palette.filter', 'edit', 'Show all, favourites or characters', object({ filter: choice('all', 'favs', 'characters') })),
  op('palette.choose', 'edit', 'Choose a palette prop', object({ asset: text })),
  op('palette.favourite', 'edit', 'Set asset favourite', object({ asset: text, on: flag })),
  op('snap.set', 'edit', 'Set snap and optional existing step bounds', object({ on: flag, grid: { type: 'number', minimum: 1, maximum: 500 }, rotation: { type: 'number', minimum: 1, maximum: 180 } }, ['on'])),
  op('tool.set', 'edit', 'Choose existing tool and optional gizmo', object({ tool: choice('select', 'place', 'spawnA', 'spawnB', 'npc', 'bomb', 'siteSeal', 'siteTerrorist'), gizmo: choice('translate', 'rotate') }, ['tool'])),
  op('saves.save', 'edit', 'Save current recipe in this browser', object({ name: { ...text, maxLength: 48 } })),
  op('saves.load', 'import', 'Load named browser recipe as one undoable edit on its current base', object({ id: text })),
  op('saves.rename', 'edit', 'Rename a named browser save', object({ id: text, name: { ...text, maxLength: 48 } })),
  op('saves.delete', 'edit', 'Delete a named browser save', object({ id: text })),
  op('undo', 'edit', 'Undo one editor edit'), op('redo', 'edit', 'Redo one editor edit'),
  op('checkMap', 'diagnose', 'Run the existing layout/hull check'),
  op('walk.start', 'test', 'Start offline Walk without requesting pointer lock'),
  op('walk.stop', 'test', 'Stop offline Walk'),
  op('play.start', 'test', 'Start offline Forge Play; map issues refuse until explicitly accepted', object({ allowIssues: flag }, [])),
  op('play.stop', 'test', 'Stop offline Forge Play'),
  op('input.set', 'test', 'Hold normal private Play pad lanes, released on cancellation, menu, hidden page, match end or 30 seconds wall time', object({
    ...Object.fromEntries(FORGE_PLAY_AXES.map((axis) => [axis, { type: 'number', minimum: -1, maximum: 1 }])),
    ...Object.fromEntries(FORGE_PLAY_BUTTONS.map((button) => [button, flag])),
  }, [])),
  op('input.release', 'test', 'Release injected Play inputs through the normal cancellation lifecycle'),
  op('action.press', 'test', 'Press the normal action lane'), op('action.hold', 'test', 'Hold the normal action lane'),
  op('action.release', 'test', 'Release the normal action lane; game rules decide its outcome'),
  op('action.cancel', 'test', 'Cancel the held normal action without firing its release'),
  op('equipment.equip', 'test', 'Use the existing equipment selection gate', object({ item: { enum: ['rifle', 'pistol', 1, 2, 3] } })),
  op('armory.key', 'test', 'Send a normal key to an actually open ARMORY; a closed screen refuses', object({ code: choice('ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Backspace') })),
  op('scenario.start', 'test', 'Run at most 32 normal input/action/equipment steps, wait or observe; total 60 simulation seconds and 30 wall seconds. No positioning or game-state setters. Observations report actual outcomes.', object({ steps: {
    type: 'array', minItems: 1, maxItems: 32, items: object({ operation: choice('input.set', 'input.release', 'action.press', 'action.hold', 'action.release', 'action.cancel', 'equipment.equip', 'wait', 'observe'), args: arbitraryObject, seconds: { type: 'number', minimum: 0, maximum: 60 } }, ['operation']),
  } })),
  op('scenario.status', 'inspect', 'Read scenario progress and actual observations'),
  op('scenario.cancel', 'test', 'Cancel scenario and release its inputs'),
  // FCW-32 (a browser adaptation, the Forge's own authoring instrument; docs/specs/2026-10-27-creator-rules-contract.md):
  // the rules entities and the layout's rules pack. Each edit is one undoable step at expectedRevision, refused whole with
  // the validator's diagnostic naming the bad event, action or field; nothing here runs a rule (the room does, FCW-31).
  op('zone.place', 'edit', 'Place a rules zone by its authored id: a cylinder (radius, height) or a box (size, yaw) about at', object({
    id: authoredId, shape: choice('cylinder', 'box'), at: point, radius: size, height: size, size: { type: 'array', items: size, minItems: 3, maxItems: 3 }, yaw: number,
  }, ['id', 'shape', 'at'])),
  op('marker.place', 'edit', 'Place a rules marker (a named point) by its authored id', object({ id: authoredId, at: point, yaw: number }, ['id', 'at'])),
  op('spawner.place', 'edit', 'Place a rules spawner by its authored id: source player (team), npc (side, type) or item, spread over radius', object({
    id: authoredId, source: choice('player', 'npc', 'item'), at: point, yaw: number, radius: size, team: choice('A', 'B'), side: choice('seal', 'terrorist'),
    type: { type: 'integer', minimum: 0, maximum: 31 },
  }, ['id', 'source', 'at'])),
  op('rules.new', 'edit', 'Start the layout\'s rules pack: its pack id and version, the mode id and name; the layout plays that mode and requires that pack', object({
    pack: authoredId, version: { type: 'string', maxLength: 32 }, id: authoredId, name: { type: 'string', maxLength: 48 },
  }, ['pack', 'id', 'name'])),
  op('rules.set', 'edit', 'Replace the whole rules spec (s2u-rules, vocabulary 0); optional pack version', object({ spec: arbitraryObject, version: { type: 'string', maxLength: 32 } }, ['spec'])),
  op('rules.rule.set', 'edit', 'Add a rule, or replace the rule of its id; optional index in the order (the order is the creator\'s tool)', object({
    rule: arbitraryObject, index: { type: 'integer', minimum: 0, maximum: 127 },
  }, ['rule'])),
  op('rules.rule.delete', 'edit', 'Delete the rule of an id', object({ id: authoredId })),
  op('rules.variable.set', 'edit', 'Declare a variable, or replace the declaration of its id', object({ variable: arbitraryObject })),
  op('rules.variable.delete', 'edit', 'Delete a variable\'s declaration; refused while a rule names it', object({ id: authoredId })),
  op('rules.config.set', 'edit', 'Set the mode\'s configuration values (checked against its published parameters)', object({ params: arbitraryObject })),
  op('rules.clear', 'edit', 'Remove the layout\'s rules, its rules mode and its requirement on their pack'),
  op('rules.import', 'import', 'Import a rules pack\'s files (s2u-pack.json and one rules member, as rules.export gives them) as the layout\'s rules, adopted with its own reference; inline only while the whole request (every member, JSON-escaped, not one member\'s characters) is within RULES_INLINE_BYTES, else refused RULES_TOO_LARGE; a larger one travels in forge.import\'s chunked envelope', object({ files: {
    type: 'array', minItems: 1, maxItems: 8, items: object({ path: { type: 'string', maxLength: 240 }, text: { type: 'string', maxLength: RULES_INLINE_BYTES } }),
  } })),
  op('rules.read', 'inspect', 'Discover and read rules: section vocabulary (events, conditions, actions, capabilities), spec, modes (the Forge\'s mode list) or entities (zones, markers, spawners and their sources)', object({
    section: choice('vocabulary', 'spec', 'modes', 'entities'),
  }, [])),
  op('rules.check', 'diagnose', 'Validate the layout\'s rules against the layout: every diagnostic names its code and field'),
  op('rules.export', 'inspect', 'Export the layout\'s rules as a v2 rules pack: its reference and its files (s2u-pack.json and the rules member); an imported pack unedited as it came'),
  // FCW-32 round 2 (the review's F2; RULES_TEST_ADAPTATION, `../matchRules`): a scripted run of the layout's rules mode on the
  // room's rule host -- seats, moves and the room's events per tick -- with nothing applied; it reads, so it changes no revision.
  { ...op('rules.test', 'test', 'Run the layout\'s rules mode on the room\'s rule host over a scripted run (seed; players id, team, at; ticks of move, alive and events); nothing is applied: answers the rules fired, variables, phase, shows and room actions. The recording room\'s limits: door() is always true and no door moves; round and match ends are only recorded, never applied', object({
    seed: integer(0, 0xffff_ffff),
    players: { type: 'array', maxItems: 16, items: object({ id: integer(0, 255), team: choice('seal', 'terrorist'), at: point, alive: flag }, ['id', 'team']) },
    ticks: { type: 'array', maxItems: 600, items: object({ move: arbitraryObject, alive: arbitraryObject, events: { type: 'array', maxItems: 64, items: arbitraryObject } }, []) },
  }, [])), mutates: false },
] as const;
export type ForgeAgentOperationName = (typeof FORGE_AGENT_OPERATIONS)[number]['name'];
export function validateForgeAgentArguments(operation: string, args: unknown): void {
  const def = FORGE_AGENT_OPERATIONS.find((o) => o.name === operation);
  if (!def) throw new ForgeAgentError('UNKNOWN_OPERATION', operation);
  json(args); validate(args, def.inputSchema);
}

function validate(value: unknown, schema: Schema, path = 'args'): void {
  if (schema.enum && !schema.enum.includes(value)) throw new Error(`${path} is not an allowed value`);
  if (schema.type === 'object') {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${path} must be an object`);
    const obj = value as Record<string, unknown>;
    for (const key of schema.required ?? []) if (!(key in obj)) throw new Error(`${path}.${key} is required`);
    for (const [key, val] of Object.entries(obj)) {
      const child = schema.properties?.[key];
      if (child) validate(val, child, `${path}.${key}`);
      else if (schema.additionalProperties === false) throw new Error(`${path}.${key} is unknown`);
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(value) || value.length < (schema.minItems ?? 0) || value.length > (schema.maxItems ?? 4096)) throw new Error(`${path} must be a bounded array`);
    if (schema.uniqueItems && new Set(value.map((v) => JSON.stringify(v))).size !== value.length) throw new Error(`${path} must contain unique references`);
    value.forEach((v, i) => validate(v, schema.items ?? {}, `${path}[${i}]`));
  } else if (schema.type === 'number' || schema.type === 'integer') {
    if (typeof value !== 'number' || !Number.isFinite(value) || (schema.type === 'integer' && !Number.isInteger(value))
      || value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity)) throw new Error(`${path} must be a finite bounded ${schema.type}`);
  } else if (schema.type === 'string' && (typeof value !== 'string' || value.length > (schema.maxLength ?? 1024))) throw new Error(`${path} must be a bounded string`);
  else if (schema.type === 'boolean' && typeof value !== 'boolean') throw new Error(`${path} must be boolean`);
}
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
/** Strict JSON admission catches nested NaN/undefined/prototypes before serialization can silently coerce them. */
function json(value: unknown, depth = 0): void {
  if (depth > 24) throw new Error('Arguments are too deeply nested');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (Array.isArray(value)) { value.forEach((v) => json(v, depth + 1)); return; }
  if (typeof value === 'object' && value && Object.getPrototypeOf(value) === Object.prototype) {
    for (const [k, v] of Object.entries(value)) { if (['__proto__', 'prototype', 'constructor'].includes(k)) throw new Error('Unsafe key'); json(v, depth + 1); } return;
  }
  throw new Error('Arguments must be finite JSON data');
}

/** R5-A: the camera shot's operations, answered by the facade itself through the page's driver (never `prepare`). */
const CAMERA_SHOT_OPERATIONS: readonly string[] = ['camera.shot', 'camera.stop', 'camera.status'];
/** The agent's own explicit camera commands: each ends a running shot (`stopped`) before it sets the camera. */
const CAMERA_SET_OPERATIONS: readonly string[] = ['camera.pose', 'camera.look', 'camera.focus', 'camera.objective'];
/**
 * R8-4 (a browser adaptation): the stop lane's operation this facade answers itself -- the gateway's and the connection's
 * stop lanes pass camera.stop without waiting, so it is never chained on the serial queue behind a slow operation either.
 * The driver's stop is synchronous and idempotent (`../camera/driver` `stop`), safe beside a running operation; a
 * camera.shot admitted before a stop is refused CANCELLED rather than started after it.
 */
const STOP_LANE_OPERATIONS: readonly string[] = ['camera.stop'];

export function createForgeAgentApi(facade: ForgeAgentFacade, receiptLimit = 4096): ForgeAgentApi {
  let disposed = false;
  let shots = 0;
  /** R8-4: the camera.stops performed; a camera.shot admitted before one never starts after it. */
  let stops = 0;
  let generation = 0;
  let sessionAbort = new AbortController();
  let queue = Promise.resolve();
  const listeners = new Set<(snapshot: ForgeAgentSnapshot) => void>();
  const receipts = new Map<string, { digest: string; result: ForgeAgentActionResult }>();
  const read = (): ForgeAgentSnapshot => {
    const s = facade.snapshot();
    if (disposed || s.mode === 'blocked') return { ready: false, mode: 'blocked', revision: s.revision, layout: null,
      selection: [], refs: [], catalogue: {}, issues: [], view: {}, canUndo: false, canRedo: false };
    return clone(s);
  };
  const statusOf = (): ForgeAgentStatus => {
    if (facade.status) return facade.status();
    const s = facade.snapshot();
    const viewRevision = (s.view as { revision?: unknown } | null)?.revision;
    return { ready: s.ready, mode: s.mode, revision: s.revision, viewRevision: typeof viewRevision === 'number' ? viewRevision : 0,
      name: s.layout?.name ?? 'Forge', map: s.layout?.base ?? null };
  };
  const status = (): ForgeAgentStatus => {
    const s = statusOf();
    return disposed || s.mode === 'blocked' ? { ready: false, mode: 'blocked', revision: s.revision, viewRevision: s.viewRevision, name: 'Forge', map: null } : s;
  };
  const notify = (): void => { for (const listener of listeners) { try { listener(read()); } catch { /* one observer cannot break an edit */ } } };
  const unsubscribe = facade.subscribe?.(notify);
  const failure = (code: string, message: string): ForgeAgentActionResult => ({ ok: false, code, message, revision: statusOf().revision });
  async function run(operation: string, args: unknown, expectedRevision: number | undefined, requestId: string | undefined,
    admittedGeneration: number, signal: AbortSignal | undefined, sessionSignal: AbortSignal, actor: HistoryActor, admittedStops: number): Promise<ForgeAgentActionResult> {
    if (disposed) return failure('DISPOSED', 'The editor target has closed');
    const cancelled = (): boolean => admittedGeneration !== generation || sessionSignal.aborted || !!signal?.aborted;
    if (cancelled()) return failure('CANCELLED', 'The request or its connection was cancelled');
    const def = FORGE_AGENT_OPERATIONS.find((o) => o.name === operation);
    if (!def) return failure('UNKNOWN_OPERATION', 'No such Forge operation');
    try { json(args); validate(args, def.inputSchema); if (JSON.stringify(args).length > 2 * 1024 * 1024) throw new Error('Arguments exceed 2 MiB'); }
    catch (e) { return failure('INVALID_ARGUMENT', String(e)); }
    const parsed = clone(args) as Record<string, unknown>;
    const digest = JSON.stringify([operation, parsed, expectedRevision]);
    if (requestId !== undefined && (!requestId || requestId.length > 160)) return failure('INVALID_ARGUMENT', 'Invalid request ID');
    const old = requestId ? receipts.get(requestId) : undefined;
    if (statusOf().mode === 'blocked') return failure('BLOCKED', 'A live server lobby or match blocks this target');
    if (old) return old.digest === digest ? clone(old.result) : failure('REQUEST_ID_REUSED', 'Request ID already belongs to different arguments');
    // The guards compare the LAYOUT revision only: a camera, palette or tool change never makes a read or a write stale.
    const initial = statusOf();
    const guard = (): void => {
      if (disposed) throw new ForgeAgentError('DISPOSED', 'The editor target has closed');
      if (cancelled()) throw new ForgeAgentError('CANCELLED', 'The request or its connection was cancelled');
      const s = statusOf();
      if (s.mode === 'blocked') throw new ForgeAgentError('BLOCKED', 'A live server lobby or match blocks this target');
      if (def.mutates && (!Number.isSafeInteger(expectedRevision) || expectedRevision !== s.revision)) throw new ForgeAgentError('STALE_REVISION', 'Read the editor again before writing');
      if (!def.mutates && s.revision !== initial.revision) throw new ForgeAgentError('STALE_REVISION', 'The editor changed during this read');
      if (!s.ready && !['request.receipt', 'camera.stop', 'camera.status'].includes(operation)) throw new ForgeAgentError('NOT_READY', 'The editor is loading');
      if (s.mode === 'forge-play' && !['play.stop', 'walk.stop', 'layout.read', 'layout.export', 'catalogue.read', 'issues.read', 'request.receipt', 'camera.stop', 'camera.status', ...FORGE_PLAY_OPERATIONS].includes(operation)) throw new ForgeAgentError('PLAYING', 'Stop offline play before editing');
    };
    /** R5-A: the camera shot, staged here (Build only by the guard above: Walk and Play refuse PLAYING, a lobby BLOCKED). */
    const cameraShot = (): ForgeAgentPrepared => {
      const driver = facade.shotDriver ?? null;
      if (!driver) throw new ForgeAgentError('UNSUPPORTED', 'The camera shot is not available on this page');
      if (operation === 'camera.status') { const status = driver.status(); return { commit: () => status, dispose: () => undefined }; }
      if (operation === 'camera.stop') return { commit: () => { stops++; return { stopped: driver.stop('stopped') }; }, dispose: () => undefined };
      let spec: CameraShotSpec;
      try { spec = parseCameraShot(parsed); } catch { throw new ForgeAgentError('INVALID_ARGUMENT', 'Not a camera shot within its bounds'); }
      if (!facade.mapBounds) throw new ForgeAgentError('UNSUPPORTED', 'The camera shot is not available on this page');
      const bounds = facade.mapBounds();
      if (!bounds) throw new ForgeAgentError('NOT_READY', 'No map is loaded to frame a shot in');
      // R5-B: the page's check with the map's scale (it catches a look on its own point), then ONE walk of the path
      // for the box (OUT_OF_BOUNDS) and the fly camera's pitch limit (OUT_OF_RANGE).
      const finding = driver.check(spec);
      if (finding) throw new ForgeAgentError('INVALID_ARGUMENT', finding);
      const refusal = shotAdmission(spec, bounds, driver.sample);
      if (refusal) throw new ForgeAgentError(refusal.code, refusal.message);
      return { dispose: () => undefined, commit: () => {
        if (stops !== admittedStops) throw new ForgeAgentError('CANCELLED', 'A camera.stop sent after this shot ended it');
        const shotId = `shot-${++shots}`;
        const replaced = driver.start(spec, shotId);
        const receipt: CameraShotReceipt = { shotId, revision: statusOf().revision, ...(replaced ? { replaced } : {}) };
        return receipt;
      } };
    };
    let prepared: ForgeAgentPrepared | undefined;
    let result: ForgeAgentActionResult;
    try {
      guard();
      if (def.mutates && receipts.size >= receiptLimit) throw new ForgeAgentError('RECEIPT_CAPACITY', 'Receipt store is full; start a new target session');
      if (operation === 'request.receipt') {
        const receipt = receipts.get(parsed['requestId'] as string);
        return receipt ? clone(receipt.result) : failure('UNKNOWN_REQUEST', 'No receipt exists in this target epoch');
      }
      // Stop waiting promptly on disconnect; if I/O eventually finishes, dispose its unmounted objects exactly once.
      prepared = await new Promise<ForgeAgentPrepared>((resolve, reject) => {
        let finished = false;
        const clean = (): void => { signal?.removeEventListener('abort', abort); sessionSignal.removeEventListener('abort', abort); };
        const abort = (): void => {
          if (finished) return;
          finished = true; clean();
          try { guard(); } catch (e) { reject(e); }
        };
        signal?.addEventListener('abort', abort, { once: true });
        sessionSignal.addEventListener('abort', abort, { once: true });
        if (cancelled()) { abort(); return; }
        // FUI-6: a registered layout edit is the registry's entry (its guard is this one, then the revision's).
        const registered = facade.operations?.get(operation) ? facade.operations : null;
        const staging = CAMERA_SHOT_OPERATIONS.includes(operation)
          ? Promise.resolve().then(cameraShot)
          : registered
          ? registered.prepare(operation, parsed, { actor, guard, ...(expectedRevision === undefined ? {} : { expectedRevision }),
            ...(requestId ? { requestId } : {}), ...(signal ? { signal } : {}) })
          : facade.prepare(operation, parsed, guard, signal);
        staging.then((staged) => {
          if (finished) { staged.dispose(); return; }
          finished = true; clean(); resolve(staged);
        }, (e: unknown) => { if (!finished) { finished = true; clean(); reject(e); } });
      });
      guard();
      if (CAMERA_SET_OPERATIONS.includes(operation)) facade.shotDriver?.stop('stopped');
      const data = await prepared.commit();
      result = { ok: true, revision: statusOf().revision, ...(data === undefined ? {} : { data: clone(data) }) };
    } catch (e) { result = failure(e instanceof ForgeAgentError ? e.code : 'REFUSED', e instanceof Error ? e.message : String(e)); }
    finally { prepared?.dispose(); }
    if (def.mutates && requestId && admittedGeneration === generation && receipts.size < receiptLimit) receipts.set(requestId, { digest, result: clone(result) });
    notify();
    return result;
  }
  return { read, status, execute: (operation, args, revision, id, options) => {
    // Copy at admission: a caller cannot alter a queued payload.
    let input: unknown;
    try { json(args); input = clone(args); } catch (e) { return Promise.resolve(failure('INVALID_ARGUMENT', String(e))); }
    const admittedGeneration = generation, signal = options?.signal, sessionSignal = sessionAbort.signal;
    const actor: HistoryActor = options?.actor ?? { kind: 'agent', sessionId: options?.sessionId || null };
    const admittedStops = stops;
    // R8-4: the stop lane runs at once, beside whatever the queue is running; everything else is chained in order.
    if (STOP_LANE_OPERATIONS.includes(operation)) return run(operation, input, revision, id, admittedGeneration, signal, sessionSignal, actor, admittedStops);
    const task = queue.then(() => run(operation, input, revision, id, admittedGeneration, signal, sessionSignal, actor, admittedStops));
    queue = task.then(() => undefined, () => undefined);
    return task;
  }, subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  // R5-A: a re-pairing (every close of the connection: a disconnect or a revocation) and the target's disposal end a
  // running shot; the page may stop it first with the closer reason (`revoked`), and the driver keeps the first.
  resetSession: () => { generation++; sessionAbort.abort(); sessionAbort = new AbortController(); facade.shotDriver?.stop('disconnected'); facade.cancel?.('connection reset'); receipts.clear(); },
  refreshExternalState: () => { if (!disposed) { facade.refreshExternalState?.(); notify(); } },
  shotRunning: () => facade.shotDriver?.active() === true,
  stopShot: (reason = 'stopped') => facade.shotDriver?.stop(reason) ?? null,
  dispose: () => { disposed = true; generation++; sessionAbort.abort(); facade.shotDriver?.stop('disconnected'); facade.cancel?.('target disposed'); unsubscribe?.(); listeners.clear(); receipts.clear(); } };
}
