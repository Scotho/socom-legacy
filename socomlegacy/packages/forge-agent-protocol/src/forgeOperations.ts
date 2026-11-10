import { CAMERA_SHOT_HOLD_ADAPTATION, CAMERA_SHOT_POINTS_ADAPTATION, CAMERA_SHOT_SECONDS_ADAPTATION, LIMITS } from './limits.js';
import { arbitraryObject, authoredId, choice, flag, integer, number, objectOf, point, refs, size, text, type JsonSchema } from './schema.js';

/**
 * AX-1 (contract C1, ruling AX.R6; a browser adaptation): the Forge page's operations and their argument schemas, moved
 * unchanged from `viewer/src/forge/agent/api.ts` (which re-exports them as `FORGE_AGENT_OPERATIONS` and validates against
 * them) so the gateway can publish them before pairing (`./manual.ts`).
 */
export type ForgePermission = 'inspect' | 'edit' | 'import' | 'test' | 'diagnose';
/** The private Forge Play pad lanes (moved from `viewer/src/forge/agent/play.ts`, which re-exports them). */
export const FORGE_PLAY_AXES = ['moveX', 'moveY', 'lookX', 'lookY'] as const;
export const FORGE_PLAY_BUTTONS = ['jump', 'crouch', 'prone', 'stance', 'fire', 'reload', 'action', 'swap1', 'swap2'] as const;
/** The Play inputs `forge.input` forwards (`viewer/src/agent/forgeTarget.ts`); the rest of Play is its own wire operations. */
export const FORGE_INPUT_OPERATIONS = ['input.set', 'input.release', 'action.press', 'action.hold', 'action.release', 'action.cancel',
  'equipment.equip', 'armory.key'] as const;
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
const rulesEdits = ['rules.new', 'rules.set', 'rules.rule.set', 'rules.rule.delete', 'rules.variable.set', 'rules.variable.delete', 'rules.config.set', 'rules.clear'] as const;
const starterArguments = objectOf({ id: choice('arena', 'crate-stack', 'frostfire-trees', 'hostile-range', 'static-mood', 'demolition'),
  coverRef: text, crateRef: text, treeRefs: { type: 'array', items: text, maxItems: 16, uniqueItems: true },
  hostileType: { type: 'integer', minimum: 0, maximum: 255 } }, ['id']);
/**
 * AX-17 (plan item 17; a browser adaptation, product track): the instrument bounds of `world.probe` (`forge.probe` on the
 * wire). Bounded work only -- the largest `free` radius and `ray` length in game units, the most grid samples a `free`
 * probe takes (a finer step is widened to fit), the most candidates it answers, and the wall-clock budget past which it
 * answers what it has, marked partial. None is a simulation value: the probe reads the editor's placement collision and
 * never certifies traversability.
 */
export const FORGE_PROBE_LIMITS = Object.freeze({ radius: 2000, ray: 16000, samples: 1024, candidates: 32, budgetMs: 50 });
/** AX-17: a world plan point [x, z] in game units. */
const planPoint: JsonSchema = { type: 'array', items: number, minItems: 2, maxItems: 2 };
const probeArguments = objectOf({
  kind: choice('ground', 'ray', 'free'),
  at: planPoint, below: number, from: point, to: point, near: point,
  radius: { type: 'number', minimum: 0, maximum: 100_000 },
  footprint: { type: 'array', items: size, minItems: 2, maxItems: 2 },
  step: { type: 'number', minimum: 1, maximum: 1000 },
  limit: integer(1, FORGE_PROBE_LIMITS.candidates),
}, ['kind']);
const op = <Name extends string>(name: Name, permission: ForgePermission, description: string, inputSchema = objectOf()) =>
  ({ name, permission, description, inputSchema, mutates: permission !== 'inspect' && permission !== 'diagnose' });
/** This is the complete dispatch allowlist; no property names, global hooks or server-backed commands pass through. */
export const FORGE_OPERATIONS = [
  op('layout.read', 'inspect', 'Read v2 recipe and revision-scoped refs'),
  op('layout.export', 'inspect', 'Export v2 recipe as JSON data'),
  op('catalogue.read', 'inspect', 'Read loaded assets, characters, archives and readiness'),
  op('starters.list', 'inspect', 'Discover six authored browser-adaptation starter recipes and their requirements; select the actual base first'),
  op('starters.preview', 'inspect', 'Plan a starter on the currently loaded base without editing; actual source, floor and proposed-hull diagnostics can block it', starterArguments),
  op('starters.apply', 'import', 'Validate a starter on the current base and atomically import it as one undoable edit at expectedRevision', starterArguments),
  op('assets.query', 'inspect', 'Query loaded palette prototypes: actual visual bounds and collision roles, never name-based solidity', objectOf({
    query: text, archive: text, role: choice('visual', 'ground-surface', 'wall-surface'),
    limit: { type: 'integer', minimum: 1, maximum: 100 }, cursor: { type: 'string', maxLength: 2048 },
  }, [])),
  op('placement.check', 'diagnose', 'Inspect a queried asset proposal without placing it; bounds-only overlap and sampled hull probes cannot certify traversability', objectOf({ ref: text, at: point, yaw: number }, ['ref', 'at'])),
  // AX-17 (a browser adaptation): a read-only spatial diagnostic over the collision and bounds the placement check reads.
  op('world.probe', 'diagnose', "Probe the editor's placement collision without changing anything: ground {at:[x,z], below?} the highest ground under a plan point and what it is (the base, or a piece ref); ray {from, to} the first hit along a segment (point, normal, what it hit); free {near, radius, footprint?:[w,d], step?, limit?} ground points within radius whose footprint overlaps no placed piece's bounds (plan view), nearest first. A diagnostic that never certifies traversability", probeArguments),
  op('issues.read', 'inspect', 'Read latest map check issues'),
  op('saves.list', 'inspect', 'Read named browser saves'),
  op('request.receipt', 'inspect', 'Recover a retained request result', objectOf({ requestId: text })),
  op('layout.import', 'import', 'Atomically import a v1 layout or v2 recipe and its base as one undoable edit', objectOf({ layout: arbitraryObject })),
  op('layout.new', 'edit', 'Clear the current base as one undoable edit'),
  op('layout.base', 'edit', 'Stage and change base as one undoable edit', objectOf({ base: arbitraryObject })),
  op('layout.name', 'edit', 'Set recipe name', objectOf({ name: { ...text, maxLength: 48 } })),
  op('layout.batch', 'edit', 'Stage multiple edits as one undo step; destructive ref reindexing is refused before later ref writes', objectOf({ edits: {
    type: 'array', minItems: 1, maxItems: 100, items: objectOf({ operation: choice('layout.name', 'piece.place', 'piece.move', 'piece.rotate', 'piece.delete', 'piece.lock', 'piece.unlock', 'piece.hide', 'piece.restore', 'spawn.place', 'respawn.place', 'flare.place', 'npc.place', 'hostage.place', 'extraction.place', 'point.place', 'view.place', 'turret.place', 'door.place', 'gate.place', 'barrier.place', 'placement.set', 'bomb.place', 'objectives.set', 'settings.set', 'type.set', ...entityEdits, ...rulesEdits), args: arbitraryObject }),
  } })),
  op('piece.place', 'edit', 'Place an asset using the existing piece library', objectOf({ asset: text, at: point, yaw: number }, ['asset', 'at'])),
  op('piece.move', 'edit', 'Move revision-scoped refs by a delta', objectOf({ refs, delta: point })),
  op('piece.rotate', 'edit', 'Turn refs as a group about their centre in radians', objectOf({ refs, yaw: number })),
  op('piece.delete', 'edit', 'Delete unlocked refs', objectOf({ refs })),
  op('piece.lock', 'edit', 'Lock refs', objectOf({ refs })),
  op('piece.unlock', 'edit', 'Unlock refs', objectOf({ refs })),
  op('piece.hide', 'edit', 'Hide base placement keys in the layout', objectOf({ keys: refs })),
  op('piece.restore', 'edit', 'Restore hidden base placement keys', objectOf({ keys: refs })),
  op('selection.set', 'edit', 'Select unlocked revision-scoped refs', objectOf({ refs })),
  op('selection.move', 'edit', 'Move current selection by delta', objectOf({ delta: point })),
  op('selection.rotate', 'edit', 'Turn current selection about centre in radians', objectOf({ yaw: number })),
  op('selection.copy', 'edit', 'Copy selection with the editor clipboard'),
  op('selection.paste', 'edit', 'Paste editor clipboard at a world point', objectOf({ at: point })),
  op('selection.duplicate', 'edit', 'Duplicate selection as one undoable edit', objectOf({ delta: point }, [])),
  op('spawn.place', 'edit', 'Place a team spawn', objectOf({ team: choice('A', 'B'), at: point, yaw: number }, ['team', 'at'])),
  op('flare.place', 'edit', "Place a flare: a copy of one of a disc map's facade nodes (a glow the game turns to the camera), by its archive and node name; a browser adaptation", objectOf({ source: { type: 'string', pattern: '^[A-Z]{1,3}\\d{1,3}$' }, name: { type: 'string', maxLength: 48 }, at: point }, ['source', 'name', 'at'])),
  op('respawn.place', 'edit', "Place a team respawn point, beside the map's own respawn records; a browser adaptation", objectOf({ team: choice('A', 'B'), at: point, yaw: number }, ['team', 'at'])),
  op('hostage.place', 'edit', "Place a hostage beside the base map's own; Escort or Extraction only (a browser adaptation)", objectOf({ at: point, yaw: number, name: { type: 'string', maxLength: 32 } }, ['at'])),
  op('extraction.place', 'edit', "Place an extraction zone (Safety, Safety2...) beside the base map's own; Extraction only (a browser adaptation)", objectOf({ at: point, size: { type: 'array', minItems: 2, maxItems: 2, items: number }, name: { type: 'string', maxLength: 32 } }, ['at'])),
  op('point.place', 'edit', 'Place a tactical point (kind 1 a nav point the compass marks; named Charlie, Delta... by default); a browser adaptation', objectOf({ at: point, name: { type: 'string', maxLength: 32 }, kind: { type: 'integer', minimum: 0, maximum: 31 } }, ['at'])),
  op('view.place', 'edit', 'Place a spectator view: a camera place, yaw and pitch in degrees (named View1... by default); a browser adaptation', objectOf({ at: point, yaw: number, pitch: number, name: { type: 'string', maxLength: 32 } }, ['at'])),
  op('turret.place', 'edit', "Place a turret: a copy of a disc map's own (its archive and node name; Crossroads' RMG by default) at a place, facing yaw radians; a browser adaptation", objectOf({ at: point, yaw: number, source: { type: 'string', maxLength: 8 }, name: { type: 'string', maxLength: 48 } }, ['at'])),
  op('gate.place', 'edit', "Place a gate: a copy of a disc map's own access object with a sliding gate (its archive and root node; Death Trap's access1 by default) -- its lever prompt at the gate, C4 wrecks it -- at a place, turned yaw radians; a browser adaptation", objectOf({ at: point, yaw: number, source: { type: 'string', maxLength: 8 }, name: { type: 'string', maxLength: 48 } }, ['at'])),
  op('barrier.place', 'edit', "Place a C4 barrier: a copy of a disc map's own access object (its archive and root node; Vigilance's access1 by default) that C4 or an RPG wrecks, at a place, turned yaw radians; a browser adaptation", objectOf({ at: point, yaw: number, source: { type: 'string', maxLength: 8 }, name: { type: 'string', maxLength: 48 } }, ['at'])),
  op('door.place', 'edit', "Place a door: a copy of a disc map's own (its archive and node; Frostfire's bdoor_4 by default), its hinge at a place, turned yaw radians from that door's own; a browser adaptation", objectOf({ at: point, yaw: number, source: { type: 'string', maxLength: 8 }, name: { type: 'string', maxLength: 48 } }, ['at'])),
  op('placement.set', 'edit', "Set one field a placement keeps: a zone's name, width or depth; a spawn's team; an NPC's side or type; a bomb site's range or elevation; a hostage's character, the base's own key or another disc map's as <map>:<character> (a browser adaptation)", objectOf({ ref: text, field: choice('name', 'character', 'model', 'kind', 'yaw', 'pitch', 'width', 'depth', 'team', 'side', 'type', 'range', 'elevation'), value: {} })),
  op('npc.place', 'edit', 'Place an available character marker', objectOf({ side: choice('seal', 'terrorist'), type: { type: 'integer', minimum: 0, maximum: 255 }, at: point, yaw: number }, ['side', 'type', 'at'])),
  op('bomb.place', 'edit', 'Replace unlocked bomb start or team sites. kind seal is where SEALs plant; terrorist is where Terrorists plant, matching the editor tools.', objectOf({ kind: choice('start', 'seal', 'terrorist'), at: point, yaw: number }, ['kind', 'at'])),
  op('objectives.set', 'edit', 'Validate and set authored objectives', objectOf({ objectives: arbitraryObject })),
  op('settings.set', 'edit', 'Validate and merge existing Forge settings', objectOf({ settings: arbitraryObject })),
  op('type.set', 'edit', 'Choose authored game type; 0 means map own', objectOf({ type: { type: 'integer', minimum: 0, maximum: 5 } })),
  op('view.set', 'edit', 'Set existing drawing toggle', objectOf({ toggle: choice('wireframe', 'untextured', 'collision', 'grid', 'spawns', 'fog', 'shadows', 'detail', 'billboards', 'alternate', 'blendgraded', 'engineorder', 'ps2'), on: flag })),
  op('camera.pose', 'edit', 'Set editor camera pose: x, y, z in game units; yaw and pitch in degrees (pitch -35 looks down)', objectOf({ x: number, y: number, z: number, yaw: number, pitch: number })),
  op('camera.look', 'edit', 'Look from a world point at another', objectOf({ from: point, to: point })),
  op('camera.focus', 'edit', 'Focus a revision-scoped placement', objectOf({ ref: text })),
  op('camera.objective', 'edit', 'Focus an actual named disc objective, optionally changing map; refuses absent or ambiguous names', objectOf({ archive: text, name: text }, ['name'])),
  // R5-A (a browser adaptation): the cinematic camera -- view only, never the layout; `edit`, as the camera controls
  // above, so a test-only grant gains no Build camera mutation. A stop needs no revision: it is never refused as stale.
  op('camera.shot', 'edit', 'Play one smooth camera shot in Build, submitted once: points [{at, look}] (2..64, inside the map), seconds 1..120, optional hold 0..10 at the last point. The page drives it frame by frame; a second shot replaces it; manual input, Stop, a mode or map change end it', objectOf({
    points: { type: 'array', minItems: CAMERA_SHOT_POINTS_ADAPTATION.min, maxItems: CAMERA_SHOT_POINTS_ADAPTATION.max, items: objectOf({ at: point, look: point }) },
    seconds: { type: 'number', minimum: CAMERA_SHOT_SECONDS_ADAPTATION.min, maximum: CAMERA_SHOT_SECONDS_ADAPTATION.max },
    hold: { type: 'number', minimum: CAMERA_SHOT_HOLD_ADAPTATION.min, maximum: CAMERA_SHOT_HOLD_ADAPTATION.max },
  }, ['points', 'seconds'])),
  { ...op('camera.stop', 'edit', 'End the running camera shot; answers the stopped shot id or null'), mutates: false },
  op('camera.status', 'inspect', 'Read the camera shot: its id, seconds elapsed and, once over, why it ended (manual, mode, map, stopped, revoked, disconnected or done)'),
  op('palette.set', 'edit', 'Load an archive palette without changing the layout', objectOf({ archive: text })),
  op('palette.search', 'edit', 'Filter displayed assets', objectOf({ query: text })),
  op('palette.filter', 'edit', 'Show all, favourites or characters', objectOf({ filter: choice('all', 'favs', 'characters') })),
  op('palette.choose', 'edit', 'Choose a palette prop', objectOf({ asset: text })),
  op('palette.favourite', 'edit', 'Set asset favourite', objectOf({ asset: text, on: flag })),
  op('snap.set', 'edit', 'Set snap and optional existing step bounds', objectOf({ on: flag, grid: { type: 'number', minimum: 1, maximum: 500 }, rotation: { type: 'number', minimum: 1, maximum: 180 } }, ['on'])),
  op('tool.set', 'edit', 'Choose existing tool and optional gizmo', objectOf({ tool: choice('select', 'place', 'spawnA', 'spawnB', 'npc', 'bomb', 'siteSeal', 'siteTerrorist'), gizmo: choice('translate', 'rotate') }, ['tool'])),
  op('saves.save', 'edit', 'Save current recipe in this browser', objectOf({ name: { ...text, maxLength: 48 } })),
  op('saves.load', 'import', 'Load named browser recipe as one undoable edit on its current base', objectOf({ id: text })),
  op('saves.rename', 'edit', 'Rename a named browser save', objectOf({ id: text, name: { ...text, maxLength: 48 } })),
  op('saves.delete', 'edit', 'Delete a named browser save', objectOf({ id: text })),
  op('undo', 'edit', 'Undo one editor edit'), op('redo', 'edit', 'Redo one editor edit'),
  op('checkMap', 'diagnose', 'Run the existing layout/hull check'),
  op('walk.start', 'test', 'Start offline Walk without requesting pointer lock'),
  op('walk.stop', 'test', 'Stop offline Walk'),
  op('play.start', 'test', 'Start offline Forge Play; map issues refuse until explicitly accepted', objectOf({ allowIssues: flag }, [])),
  op('play.stop', 'test', 'Stop offline Forge Play'),
  op('input.set', 'test', 'Hold normal private Play pad lanes, released on cancellation, menu, hidden page, match end or 30 seconds wall time', objectOf({
    ...Object.fromEntries(FORGE_PLAY_AXES.map((axis) => [axis, { type: 'number', minimum: -1, maximum: 1 }])),
    ...Object.fromEntries(FORGE_PLAY_BUTTONS.map((button) => [button, flag])),
  }, [])),
  op('input.release', 'test', 'Release injected Play inputs through the normal cancellation lifecycle'),
  op('action.press', 'test', 'Press the normal action lane'), op('action.hold', 'test', 'Hold the normal action lane'),
  op('action.release', 'test', 'Release the normal action lane; game rules decide its outcome'),
  op('action.cancel', 'test', 'Cancel the held normal action without firing its release'),
  op('equipment.equip', 'test', 'Use the existing equipment selection gate', objectOf({ item: { enum: ['rifle', 'pistol', 1, 2, 3] } })),
  op('armory.key', 'test', 'Send a normal key to an actually open ARMORY; a closed screen refuses', objectOf({ code: choice('ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Backspace') })),
  op('scenario.start', 'test', 'Run at most 32 normal input/action/equipment steps, wait or observe; total 60 simulation seconds and 30 wall seconds. No positioning or game-state setters. Observations report actual outcomes.', objectOf({ steps: {
    type: 'array', minItems: 1, maxItems: 32, items: objectOf({ operation: choice('input.set', 'input.release', 'action.press', 'action.hold', 'action.release', 'action.cancel', 'equipment.equip', 'wait', 'observe'), args: arbitraryObject, seconds: { type: 'number', minimum: 0, maximum: 60 } }, ['operation']),
  } })),
  op('scenario.status', 'inspect', 'Read scenario progress and actual observations'),
  op('scenario.cancel', 'test', 'Cancel scenario and release its inputs'),
  // FCW-32 (a browser adaptation, the Forge's own authoring instrument; docs/specs/2026-10-27-creator-rules-contract.md):
  // the rules entities and the layout's rules pack. Each edit is one undoable step at expectedRevision, refused whole with
  // the validator's diagnostic naming the bad event, action or field; nothing here runs a rule (the room does, FCW-31).
  op('zone.place', 'edit', 'Place a rules zone by its authored id: a cylinder (radius, height) or a box (size, yaw) about at', objectOf({
    id: authoredId, shape: choice('cylinder', 'box'), at: point, radius: size, height: size, size: { type: 'array', items: size, minItems: 3, maxItems: 3 }, yaw: number,
  }, ['id', 'shape', 'at'])),
  op('marker.place', 'edit', 'Place a rules marker (a named point) by its authored id', objectOf({ id: authoredId, at: point, yaw: number }, ['id', 'at'])),
  op('spawner.place', 'edit', 'Place a rules spawner by its authored id: source player (team), npc (side, type) or item, spread over radius', objectOf({
    id: authoredId, source: choice('player', 'npc', 'item'), at: point, yaw: number, radius: size, team: choice('A', 'B'), side: choice('seal', 'terrorist'),
    type: { type: 'integer', minimum: 0, maximum: 31 },
  }, ['id', 'source', 'at'])),
  op('rules.new', 'edit', 'Start the layout\'s rules pack: its pack id and version, the mode id and name; the layout plays that mode and requires that pack', objectOf({
    pack: authoredId, version: { type: 'string', maxLength: 32 }, id: authoredId, name: { type: 'string', maxLength: 48 },
  }, ['pack', 'id', 'name'])),
  op('rules.set', 'edit', 'Replace the whole rules spec (s2u-rules, vocabulary 0); optional pack version', objectOf({ spec: arbitraryObject, version: { type: 'string', maxLength: 32 } }, ['spec'])),
  op('rules.rule.set', 'edit', 'Add a rule, or replace the rule of its id; optional index in the order (the order is the creator\'s tool)', objectOf({
    rule: arbitraryObject, index: { type: 'integer', minimum: 0, maximum: 127 },
  }, ['rule'])),
  op('rules.rule.delete', 'edit', 'Delete the rule of an id', objectOf({ id: authoredId })),
  op('rules.variable.set', 'edit', 'Declare a variable, or replace the declaration of its id', objectOf({ variable: arbitraryObject })),
  op('rules.variable.delete', 'edit', 'Delete a variable\'s declaration; refused while a rule names it', objectOf({ id: authoredId })),
  op('rules.config.set', 'edit', 'Set the mode\'s configuration values (checked against its published parameters)', objectOf({ params: arbitraryObject })),
  op('rules.clear', 'edit', 'Remove the layout\'s rules, its rules mode and its requirement on their pack'),
  op('rules.import', 'import', 'Import a rules pack\'s files (s2u-pack.json and one rules member, as rules.export gives them) as the layout\'s rules, adopted with its own reference; inline only while the whole request (every member, JSON-escaped, not one member\'s characters) is within RULES_INLINE_BYTES, else refused RULES_TOO_LARGE; a larger one travels in forge.import\'s chunked envelope', objectOf({ files: {
    type: 'array', minItems: 1, maxItems: 8, items: objectOf({ path: { type: 'string', maxLength: 240 }, text: { type: 'string', maxLength: RULES_INLINE_BYTES } }),
  } })),
  op('rules.read', 'inspect', 'Discover and read rules: section vocabulary (events, conditions, actions, capabilities), spec, modes (the Forge\'s mode list) or entities (zones, markers, spawners and their sources)', objectOf({
    section: choice('vocabulary', 'spec', 'modes', 'entities'),
  }, [])),
  op('rules.check', 'diagnose', 'Validate the layout\'s rules against the layout: every diagnostic names its code and field'),
  op('rules.export', 'inspect', 'Export the layout\'s rules as a v2 rules pack: its reference and its files (s2u-pack.json and the rules member); an imported pack unedited as it came'),
  // FCW-32 round 2 (the review's F2; RULES_TEST_ADAPTATION, `../matchRules`): a scripted run of the layout's rules mode on the
  // room's rule host -- seats, moves and the room's events per tick -- with nothing applied; it reads, so it changes no revision.
  { ...op('rules.test', 'test', 'Run the layout\'s rules mode on the room\'s rule host over a scripted run (seed; players id, team, at; ticks of move, alive and events); nothing is applied: answers the rules fired, variables, phase, shows and room actions. The recording room\'s limits: door() is always true and no door moves; round and match ends are only recorded, never applied', objectOf({
    seed: integer(0, 0xffff_ffff),
    players: { type: 'array', maxItems: 16, items: objectOf({ id: integer(0, 255), team: choice('seal', 'terrorist'), at: point, alive: flag }, ['id', 'team']) },
    ticks: { type: 'array', maxItems: 600, items: objectOf({ move: arbitraryObject, alive: arbitraryObject, events: { type: 'array', maxItems: 64, items: arbitraryObject } }, []) },
  }, [])), mutates: false },
] as const;
export type ForgeOperationName = (typeof FORGE_OPERATIONS)[number]['name'];

/**
 * AX-1: one realistic call per Forge operation, published in the manual; `test/manual.test.ts` validates each against its
 * own schema. Placement refs (`piece:0`, `spawn:1`...) come from `forge.read {section:"refs"}` and asset refs
 * (`asset:<revision>:<index>`) from `forge.assets`; both hold for ONE layout revision. World points are game units.
 */
export const FORGE_EXAMPLES: Readonly<Record<ForgeOperationName, unknown>> = {
  'layout.read': {}, 'layout.export': {}, 'catalogue.read': {}, 'starters.list': {},
  'starters.preview': { id: 'arena' },
  'starters.apply': { id: 'static-mood' },
  'assets.query': { query: 'crate', role: 'ground-surface', limit: 20 },
  'placement.check': { ref: 'asset:12:3', at: [120, 0, -40], yaw: 1.5708 },
  'world.probe': { kind: 'ground', at: [120, -40] },
  'issues.read': {}, 'saves.list': {},
  'request.receipt': { requestId: 'edit-7' },
  'layout.import': { layout: { v: 2, name: 'Crate yard', base: 'blank', assets: [], pieces: [], spawns: [] } },
  'layout.new': {},
  'layout.base': { base: { kind: 'map', archive: 'MP2' } },
  'layout.name': { name: 'Crate yard' },
  'layout.batch': { edits: [{ operation: 'piece.place', args: { asset: 'MP2:crate', at: [120, 0, -40] } },
    { operation: 'spawn.place', args: { team: 'A', at: [0, 0, 0], yaw: 0 } }] },
  'piece.place': { asset: 'MP2:crate', at: [120, 0, -40], yaw: 0 },
  'piece.move': { refs: ['piece:0'], delta: [0, 0, 50] },
  'piece.rotate': { refs: ['piece:0', 'piece:1'], yaw: 1.5708 },
  'piece.delete': { refs: ['piece:2'] },
  'piece.lock': { refs: ['piece:0'] },
  'piece.unlock': { refs: ['piece:0'] },
  'piece.hide': { keys: ['crate@100,0,-20'] },
  'piece.restore': { keys: ['crate@100,0,-20'] },
  'selection.set': { refs: ['piece:0', 'spawn:1'] },
  'selection.move': { delta: [25, 0, 0] },
  'selection.rotate': { yaw: -0.7854 },
  'selection.copy': {},
  'selection.paste': { at: [200, 0, 60] },
  'selection.duplicate': { delta: [50, 0, 0] },
  'spawn.place': { team: 'A', at: [0, 0, 0], yaw: 3.1416 },
  'flare.place': { source: 'MP72', name: 'flare01', at: [40, 30, 10] },
  'respawn.place': { team: 'B', at: [-300, 0, 220], yaw: 0 },
  'hostage.place': { at: [80, 0, -120], yaw: 0 },
  'extraction.place': { at: [400, 0, 400], size: [200, 200], name: 'Safety' },
  'point.place': { at: [150, 0, 150], name: 'Charlie', kind: 1 },
  'view.place': { at: [0, 120, -300], yaw: 0, pitch: -20, name: 'View1' },
  'turret.place': { at: [60, 0, 60], yaw: 1.5708 },
  'gate.place': { at: [0, 0, 250], yaw: 0 },
  'barrier.place': { at: [100, 0, 250], yaw: 0 },
  'door.place': { at: [-50, 0, 100], yaw: 1.5708 },
  'placement.set': { ref: 'spawn:0', field: 'team', value: 'B' },
  'npc.place': { side: 'terrorist', type: 0, at: [220, 0, -80], yaw: 3.1416 },
  'bomb.place': { kind: 'seal', at: [300, 0, -200], yaw: 0 },
  'objectives.set': { objectives: { gameType: 2, bomb: { start: [0, 0, 0], sites: [] } } },
  'settings.set': { settings: { timeOfDay: 0.25 } },
  'type.set': { type: 2 },
  'view.set': { toggle: 'collision', on: true },
  'camera.pose': { x: 0, y: 300, z: -400, yaw: 0, pitch: -35 },   // REVIEW-1 10: degrees (viewer camera.ts Pose)
  'camera.look': { from: [0, 300, -400], to: [0, 0, 0] },
  'camera.focus': { ref: 'piece:0' },
  'camera.objective': { archive: 'MP2', name: 'seal_tent' },
  'camera.shot': { points: [{ at: [0, 300, -400], look: [0, 0, 0] }, { at: [400, 200, 0], look: [0, 0, 0] }], seconds: 8, hold: 2 },
  'camera.stop': {}, 'camera.status': {},
  'palette.set': { archive: 'MP2' },
  'palette.search': { query: 'crate' },
  'palette.filter': { filter: 'favs' },
  'palette.choose': { asset: 'MP2:crate' },
  'palette.favourite': { asset: 'MP2:crate', on: true },
  'snap.set': { on: true, grid: 25, rotation: 15 },
  'tool.set': { tool: 'place', gizmo: 'translate' },
  'saves.save': { name: 'Crate yard draft' },
  'saves.load': { id: 'save-1' },
  'saves.rename': { id: 'save-1', name: 'Crate yard v2' },
  'saves.delete': { id: 'save-1' },
  'undo': {}, 'redo': {}, 'checkMap': {},
  'walk.start': {}, 'walk.stop': {},
  'play.start': { allowIssues: false },
  'play.stop': {},
  'input.set': { moveY: 1, lookX: 0.25 },
  'input.release': {},
  'action.press': {}, 'action.hold': {}, 'action.release': {}, 'action.cancel': {},
  'equipment.equip': { item: 'pistol' },
  'armory.key': { code: 'Enter' },
  'scenario.start': { steps: [{ operation: 'input.set', args: { moveY: 1 }, seconds: 2 }, { operation: 'input.release', args: {} },
    { operation: 'observe', args: { field: 'action.prompt', equals: null }, seconds: 1 }] },
  'scenario.status': {}, 'scenario.cancel': {},
  'zone.place': { id: 'hill', shape: 'cylinder', at: [0, 0, 0], radius: 150, height: 100 },
  'marker.place': { id: 'drop', at: [200, 0, 50], yaw: 0 },
  'spawner.place': { id: 'reinforcements', source: 'npc', at: [-200, 0, 0], radius: 50, side: 'terrorist', type: 0 },
  'rules.new': { pack: 'king-of-the-hill', version: '1.0.0', id: 'koth', name: 'King of the Hill' },
  'rules.set': { spec: { schema: 's2u-rules', vocabulary: 0, id: 'koth', name: 'King of the Hill', rules: [] }, version: '1.0.1' },
  'rules.rule.set': { rule: { id: 'enter-hill', when: { event: 'zone.enter', zone: 'hill' }, then: [{ do: 'message.show', text: 'On the hill' }] } },
  'rules.rule.delete': { id: 'enter-hill' },
  'rules.variable.set': { variable: { id: 'score', type: 'int', scope: 'team', start: 0 } },
  'rules.variable.delete': { id: 'score' },
  'rules.config.set': { params: { scoreLimit: 100 } },
  'rules.clear': {},
  'rules.import': { files: [{ path: 's2u-pack.json', text: '{"schema":"s2u-pack"}' }, { path: 'rules/koth.json', text: '{"schema":"s2u-rules"}' }] },
  'rules.read': { section: 'vocabulary' },
  'rules.check': {},
  'rules.export': {},
  'rules.test': { seed: 1, players: [{ id: 0, team: 'seal', at: [0, 0, 0] }], ticks: [{ move: {} }, { events: [] }] },
};

/** AX-17: one call of each `world.probe` kind, published in the manual (`forge.probe`'s example and examples). */
export const FORGE_PROBE_EXAMPLES = Object.freeze({
  ground: FORGE_EXAMPLES['world.probe'],
  ray: { kind: 'ray', from: [0, 200, 0], to: [0, -200, 0] },
  free: { kind: 'free', near: [120, 0, -40], radius: 300, footprint: [60, 60], limit: 8 },
});
