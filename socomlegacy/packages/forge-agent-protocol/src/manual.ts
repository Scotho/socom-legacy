import type { Permission, Surface, Operation } from './index.js';
import { LIMITS } from './limits.js';
import { FORGE_EXAMPLES, FORGE_INPUT_OPERATIONS, FORGE_OPERATIONS, FORGE_PROBE_EXAMPLES, FORGE_PROBE_LIMITS, type ForgeOperationName } from './forgeOperations.js';
import { arbitraryObject, choice, flag, integer, objectOf, text, type JsonSchema } from './schema.js';
import { CAPTURE_ARGS_SCHEMA, CAPTURE_SMALL_WIDTH_ADAPTATION } from './capture.js';
import { TESTROOM_INNER_OPERATIONS, TESTROOM_INPUT_OPERATIONS, TESTROOM_SETTINGS_OPERATIONS } from './testroomOperations.js';

/**
 * AX-1 (contract C1, ruling AX.R6; a browser adaptation, no original): the operation manual -- every wire operation's
 * argument schema, a call that passes it, and the inner operations a wrapper forwards -- served by the gateway before
 * pairing (`agent_capabilities`, `GET /api/v1/schema`). The wire arguments are what the page targets parse
 * (`viewer/src/agent/forgeTarget.ts`, `testroomTarget.ts`, `paging.ts`); the inner schemas are the page's own
 * (`./forgeOperations.ts`, `./testroomOperations.ts`). Additive only (AX.R8): no operation, permission or surface changes.
 */
export const MANUAL_AREAS = ['forge', 'forge-edit', 'play', 'testroom', 'camera', 'packs', 'session'] as const;
export type ManualArea = (typeof MANUAL_AREAS)[number];
export const MANUAL_AREA_DESCRIPTIONS: Readonly<Record<ManualArea, string>> = Object.freeze({
  'forge': 'Read and check the Forge layout in Build: the layout, refs, catalogue, assets, starters, issues, rules, export.',
  'forge-edit': 'Change the Forge layout: forge.edit and its nested edits, undo/redo, imports and starters; each at expectedRevision.',
  'play': 'Private Forge Play: start, inputs, scripted scenarios, stop.',
  'testroom': 'The solo test room: read, load maps, teleport, inputs and its instruments.',
  'camera': 'The agent\'s cinematic camera shot in Build and the solo room: view only.',
  'packs': 'Packs the player approved in this browser: list, import, remove.',
  'session': 'Any surface: the target\'s state, a picture of the game canvas, a lost request\'s receipt.',
});

export interface NestedManualEntry { permission: Permission; description: string; args: JsonSchema; example: unknown }
export interface ManualEntry {
  permission: Permission;
  surfaces: readonly Surface[];
  mutation: boolean;
  area: ManualArea;
  /** One line for the summary `agent_capabilities` answers with no argument (at most 64 characters). */
  summary: string;
  description: string;
  args: JsonSchema;
  example: unknown;
  /** AX-16/AX-17 (additive): more calls that pass `args`, one per way of calling it, when one example cannot show them all. */
  examples?: readonly unknown[];
  returns?: string;
  /** The page's inner operations this wire operation runs as it is (its args passed on), when it is not a wrapper. */
  runs?: readonly string[];
  /** A wrapper's inner operations: call the wire operation with `{operation: <inner>, arguments: <its args>}`. */
  nested?: Readonly<Record<string, NestedManualEntry>>;
}
type WireEntry = Omit<ManualEntry, 'permission' | 'surfaces' | 'mutation'>;

const REFS_NOTE = ' Refs (piece:0, spawn:1... from forge.read {section:"refs"}) hold for one revision: read them again after any edit.';
const ASSET_REF_NOTE = ' Its ref is an asset ref (asset:<revision>:<index>) from forge.assets, valid for one revision.';
const forgeDef = (name: ForgeOperationName) => FORGE_OPERATIONS.find((o) => o.name === name)!;
const takesPlacementRefs = (name: string, args: JsonSchema): boolean =>
  Object.hasOwn(args.properties ?? {}, 'refs') || name === 'camera.focus' || name === 'placement.set';
/** REVIEW-1 11: a forge.assets row carries both a ref (forge.placement's) and an asset (piece.place's). */
const NESTED_NOTES: Readonly<Record<string, string>> = {
  'piece.place': '. asset is a forge.assets row\'s asset field, not its ref (the ref is forge.placement\'s; passing it here is refused ABSENT_ASSET).',
};
const forgeNested = (names: readonly string[]): Record<string, NestedManualEntry> => Object.fromEntries(names.map((name) => {
  const def = forgeDef(name as ForgeOperationName);
  return [name, { permission: def.permission, args: def.inputSchema, example: FORGE_EXAMPLES[def.name],
    description: def.description + (NESTED_NOTES[name] ?? '') + (takesPlacementRefs(name, def.inputSchema) ? REFS_NOTE : '') }];
}));
const roomNested = (names: readonly string[]): Record<string, NestedManualEntry> => Object.fromEntries(names.map((name) => {
  const op = TESTROOM_INNER_OPERATIONS[name]!;
  return [name, { permission: 'test' as Permission, description: op.description, args: op.args, example: op.example }];
}));

const empty = objectOf();
/** `paging.ts` `page`: an opaque cursor string from the previous page's nextCursor, bound to its revision and section. */
const cursor: JsonSchema = { type: 'string', minLength: 1, maxLength: 256 };
/** `ChunkAssembler.begin`'s `identifier`. */
const transferId: JsonSchema = { type: 'string', minLength: 1, maxLength: 128, pattern: '^[a-zA-Z0-9_.:-]+$' };
/** forgeTarget's `text(value)`: a non-empty string of at most 256 characters. */
const text256: JsonSchema = { type: 'string', minLength: 1, maxLength: 256 };
const FORGE_EDITS = FORGE_OPERATIONS.filter((o) => o.permission === 'edit').map((o) => o.name as string);
const PAGED = ' Paged: at most 100 items and ~60 KB a page; pass nextCursor back as cursor (bound to the revision: a stale one is REVISION_CONFLICT).';

const WIRE: Readonly<Record<string, WireEntry>> = {
  'forge.read': { summary: 'Read the layout by section (pieces, refs, view, metadata), paged', area: 'forge', args: objectOf({ section: { type: 'string', maxLength: 64 }, cursor }, []),
    example: { section: 'refs' },
    description: 'Read the Forge layout by section: pieces (default), spawns, assets, hidden, npcs, missing or any other list in the layout record; refs (every placement\'s ref, kind, at, yaw, locked -- refs hold for one revision, read them again after any edit); view (camera, tool, toggles, snap, saves); metadata (name, base, settings, objectives and counts).' + PAGED,
    returns: 'A page {revision, section, items, total, nextCursor}; view and metadata answer one object.' },
  'forge.catalogue': { summary: 'Read the catalogue by section (operations, palette, saves...)', area: 'forge', args: objectOf({ section: { type: 'string', maxLength: 64 }, cursor }, []),
    example: { section: 'palette' }, examples: [{ section: 'saves' }],   // REVIEW-2 20: the call that runs saves.list
    description: 'Read the loaded catalogue by section: operations (default; the page\'s inner operations with their schemas, the same as this manual\'s nested entries), saves (named browser saves), archives, palette, characters, absent, favourites, basePlacements, hidden.' + PAGED,
    runs: ['saves.list'], returns: 'A page {revision, section, items, total, nextCursor}.' },
  'forge.issues': { summary: "Read the last map check's issues, paged", area: 'forge', args: objectOf({ cursor }, []), example: {},
    description: 'Read the issues of the last map check (forge.check runs one).' + PAGED, returns: 'A page of issues.' },
  'forge.assets': { summary: 'Query loaded assets: bounds, collision roles, asset refs', area: 'forge', args: forgeDef('assets.query').inputSchema, example: FORGE_EXAMPLES['assets.query'], runs: ['assets.query'],
    description: 'Query the loaded palette\'s prototypes: actual visual bounds and collision roles (never name-based solidity), filtered by query, archive or role; its own cursor and limit (1..100). Each item\'s ref (asset:<revision>:<index>) holds for one revision.' },
  'forge.starters': { summary: 'List the six starter experiences and their needs', area: 'forge', args: forgeDef('starters.list').inputSchema, example: {}, runs: ['starters.list'],
    description: 'List the six authored starter experiences and what each needs; load the base map they need first.' },
  'forge.starter.preview': { summary: 'Plan a starter on the current base without editing', area: 'forge', args: forgeDef('starters.preview').inputSchema, example: FORGE_EXAMPLES['starters.preview'], runs: ['starters.preview'],
    description: 'Plan a named starter on the current base without editing it; its source, floor and hull diagnostics can block it. coverRef, crateRef and treeRefs are asset refs from forge.assets, valid for one revision.' },
  'forge.starter.apply': { summary: 'Import a starter as one undoable edit', area: 'forge-edit', args: forgeDef('starters.apply').inputSchema, example: FORGE_EXAMPLES['starters.apply'], runs: ['starters.apply'],
    description: 'Validate a named starter on the current base and import it as one undoable edit at expectedRevision (the same args as forge.starter.preview).' },
  'forge.placement': { summary: 'Check a proposed asset placement without placing it', area: 'forge', args: forgeDef('placement.check').inputSchema, example: FORGE_EXAMPLES['placement.check'], runs: ['placement.check'],
    description: 'Check a proposed placement of a queried asset without placing it: bounds overlap and sampled hull probes, which never certify that a place can be walked.' + ASSET_REF_NOTE },
  // AX-17 (plan item 17; a browser adaptation): the read-only spatial diagnostic.
  'forge.probe': { summary: "Probe ground height, a ray's first hit, or free floor", area: 'forge', args: forgeDef('world.probe').inputSchema,
    example: FORGE_PROBE_EXAMPLES.ground, examples: [FORGE_PROBE_EXAMPLES.ray, FORGE_PROBE_EXAMPLES.free], runs: ['world.probe'],
    description: 'Read the collision the editor\'s placement check reads, without changing anything. Probe the ground before placing, and place at the returned height. ' +
      'kind "ground" {at: [x, z], below?}: the highest ground surface under the plan point (at or below y = below when given), what it is ' +
      '({kind: "base", path} or {kind: "piece", ref}) and the other surfaces under it. kind "ray" {from, to}: the first hit along the segment -- point, ' +
      `normal, distance and what it hit; at most ${FORGE_PROBE_LIMITS.ray} units long. kind "free" {near, radius, footprint?: [w, d], step?, limit?, below?}: up to limit ` +
      `(1..${FORGE_PROBE_LIMITS.candidates}, default 8) ground points within radius (at most ${FORGE_PROBE_LIMITS.radius} units) whose footprint box, axis-aligned in plan view, ` +
      'overlaps no placed piece\'s bounds, nearest first, sampled on a grid of step (default the editor\'s snap grid step). ' +
      `Bounded: at most ${FORGE_PROBE_LIMITS.samples} samples (a finer step is widened) and ${FORGE_PROBE_LIMITS.budgetMs} ms; past a bound the answer is partial and names it in bounds. ` +
      'A diagnostic that never certifies traversability: walk it in Play (forge.play) to know. Piece refs hold for one revision.',
    returns: '{kind, revision, hit?, y?, point?, normal?, surface?, others?, candidates?, samples?, sampleCap?, step?, partial, bounds, traversability: "unverified", diagnostic}.' },
  'forge.edit': { summary: 'Apply one nested edit {operation, arguments} as one undo step', area: 'forge-edit', args: objectOf({ operation: choice(...FORGE_EDITS), arguments: arbitraryObject }, ['operation']),
    example: { operation: 'piece.move', arguments: FORGE_EXAMPLES['piece.move'] },
    description: 'Apply one typed edit to the layout as one undoable step: {operation: <a nested operation>, arguments: <its args>} at expectedRevision (the revision forge.read or the last result answered). layout.batch stages several edits as one step. Refs hold for one revision: read them again after any edit. Only edit-permission operations pass; any other is PERMISSION_DENIED.',
    returns: 'The new revision; some edits answer data (a camera shot\'s id, a save\'s id).', nested: forgeNested(FORGE_EDITS) },
  'forge.undo': { summary: 'Undo one editor edit', area: 'forge-edit', args: empty, example: {}, runs: ['undo'], description: 'Undo one editor edit (the person\'s or an agent\'s) at expectedRevision.' },
  'forge.redo': { summary: 'Redo one undone editor edit', area: 'forge-edit', args: empty, example: {}, runs: ['redo'], description: 'Redo one undone editor edit at expectedRevision.' },
  'forge.import.begin': { summary: 'Begin a chunked layout import (size, SHA-256 digest)', area: 'forge-edit',
    args: objectOf({ transferId, size: integer(0, LIMITS.transferBytes), digest: { type: 'string', pattern: '^[a-f0-9]{64}$' } }),
    example: { transferId: 'import-1', size: 18342, digest: 'a'.repeat(64) },
    description: `Begin a chunked import of a layout file (a v1 layout, a v2 recipe or a Forge authoring envelope with rules): its byte size (at most ${LIMITS.transferBytes}) and SHA-256 hex digest. Then forge.import.chunk in order and forge.import.finish, all at the same revision.` },
  'forge.import.chunk': { summary: 'Send the next base64 import chunk', area: 'forge-edit',
    args: objectOf({ transferId, index: integer(0, LIMITS.transferBytes - 1), data: { type: 'string', maxLength: Math.ceil(LIMITS.chunkBytes / 3) * 4 } }),
    example: { transferId: 'import-1', index: 0, data: 'eyJ2IjoyfQ==' },
    description: `Send the next chunk: index from 0 in order, data base64 of at most ${LIMITS.chunkBytes} bytes.` },
  'forge.import.finish': { summary: 'Check the digest and import the layout as one edit', area: 'forge-edit', args: objectOf({ transferId }), example: { transferId: 'import-1' }, runs: ['layout.import'],
    description: 'Check the digest and import the assembled layout and its base as one undoable edit at expectedRevision.' },
  'forge.import.cancel': { summary: 'Discard the staged import', area: 'forge-edit', args: empty, example: {}, description: 'Discard the staged import.' },
  'forge.export.begin': { summary: 'Begin a chunked layout export', area: 'forge', args: empty, example: {},
    description: 'Begin a chunked export of the layout (with its rules, as the Forge authoring envelope, when it has any).',
    returns: `{transferId, size, chunkBytes (${LIMITS.chunkBytes}), revision}; read chunks 0.. with forge.export.chunk before the layout changes.` },
  'forge.export.chunk': { summary: 'Read one export chunk by index', area: 'forge', args: objectOf({ transferId: { type: 'string', maxLength: 64 }, index: integer(0, LIMITS.transferBytes - 1) }),
    example: { transferId: '0f8e2c1a-7b3d-4e5f-9a6b-1c2d3e4f5a6b', index: 0 },
    description: `Read one export chunk by index; a layout change or ${LIMITS.transferAbsoluteMs / 1000} seconds end the transfer.`, returns: '{index, data (base64)}.' },
  'forge.check': { summary: 'Run the map check; details in forge.issues', area: 'forge', args: empty, example: {}, runs: ['checkMap'],
    description: 'Run the map check (layout and hull diagnostics).', returns: '{issues: <count>, detailsOperation: "forge.issues"}.' },
  'forge.rules': { summary: 'Read the rules: vocabulary, spec, modes or entities', area: 'forge', args: forgeDef('rules.read').inputSchema, example: FORGE_EXAMPLES['rules.read'], runs: ['rules.read'],
    description: 'Discover and read the layout\'s rules by section: vocabulary (events, conditions, actions, capabilities), spec, modes or entities (zones, markers, spawners). Rules writes ride forge.edit (rules.*, zone/marker/spawner.place).' },
  'forge.rules.check': { summary: "Validate the layout's rules", area: 'forge', args: forgeDef('rules.check').inputSchema, example: {}, runs: ['rules.check'],
    description: 'Validate the layout\'s rules against the layout: every diagnostic names its code and field.' },
  'forge.rules.export': { summary: "Export the layout's rules as a v2 rules pack", area: 'forge', args: forgeDef('rules.export').inputSchema, example: {}, runs: ['rules.export'],
    description: 'Export the layout\'s rules as a v2 rules pack (its reference and files); past the inline bound it is RULES_TOO_LARGE, and forge.export.begin carries it.' },
  'forge.rules.import': { summary: "Import a rules pack's files as one undoable edit", area: 'forge-edit', args: forgeDef('rules.import').inputSchema, example: FORGE_EXAMPLES['rules.import'], runs: ['rules.import'],
    description: 'Import a rules pack\'s files (as forge.rules.export gives them) as the layout\'s rules, one undoable edit at expectedRevision; the whole request must fit the control channel, else RULES_TOO_LARGE (use forge.import.*).' },
  'forge.rules.test': { summary: 'Run the rules over a scripted run; nothing applied', area: 'forge', args: forgeDef('rules.test').inputSchema, example: FORGE_EXAMPLES['rules.test'], runs: ['rules.test'],
    description: 'Run the layout\'s rules mode on the room\'s rule host over a scripted run (seed, players, ticks); nothing is applied.' },
  'forge.play': { summary: 'Start private offline Play from Build', area: 'play', args: empty, example: {}, runs: ['play.start'],
    description: 'Start private offline Play of the layout from Build (the surface becomes forge-play); map issues refuse it -- run forge.check and fix them first.' },
  'forge.input': { summary: 'Send one Play input {operation, arguments}', area: 'play', args: objectOf({ operation: choice(...FORGE_INPUT_OPERATIONS), arguments: arbitraryObject }, ['operation']),
    example: { operation: 'input.set', arguments: FORGE_EXAMPLES['input.set'] },
    description: 'Send a normal private Play input: {operation: <a nested operation>, arguments: <its args>}. Held lanes release on cancellation, a menu, a hidden page, the match\'s end or 30 seconds.',
    nested: forgeNested(FORGE_INPUT_OPERATIONS) },
  'play.stop': { summary: 'Stop Play and return to Build', area: 'play', args: empty, example: {}, runs: ['play.stop'], description: 'Stop private Play and return to Build.' },
  'target.status': { summary: 'Read the target: surface, revision, map, readiness', area: 'session', args: empty, example: {},
    description: 'Read the paired target: surface, revision, map and build; in the Forge also readiness, viewRevision, undo/redo, selection and Play\'s observations; in the room its snapshot.' },
  // AX-16 (plan item 16): the presets; `./capture.ts` holds the schema the page parses (`parseCaptureArgs`), one source.
  'target.capture': { summary: 'Capture the game canvas: current, top, refs or a named view', area: 'session', args: CAPTURE_ARGS_SCHEMA,
    example: { view: 'top', size: 'small' },
    examples: [{}, { view: 'top', size: 'small' }, { view: 'refs', refs: ['piece:0', 'spawn:1'] }, { view: 'named', name: 'view:0' }],
    description: `Capture the game canvas only (no page UI) as a PNG or JPEG of at most ${LIMITS.transferBytes} bytes. view: "current" (the default) is the canvas as it is; ` +
      '"top" looks straight down over the layout\'s placed pieces and markers (the base map\'s box when nothing is placed); "refs" frames the given refs in a ' +
      'three-quarter view (pass expectedRevision, the revision you read them at); "named" stands at a placed spectator view (name: view:N or its name) in the ' +
      'Forge, or at a named objective (from testroom.read) in the test room. A preset moves the camera for the picture and puts it back (restores it) exactly after, on ' +
      'a failure too, under the capture permission alone (no edit or test needed); a running camera shot ends (stopped) first. The presets frame the Build camera: Play refuses them PLAYING, and the test room takes ' +
      `current and named only (else UNSUPPORTED). size: "small" scales the picture to at most ${CAPTURE_SMALL_WIDTH_ADAPTATION} pixels wide, "medium" (the default) is the canvas's own size.` +
      REFS_NOTE,
    returns: 'The image, carried as an MCP image.' },
  'scenario.start': { summary: 'Run a bounded script of normal inputs', area: 'play', args: TESTROOM_INNER_OPERATIONS['scenario.start']!.args, example: FORGE_EXAMPLES['scenario.start'], runs: ['scenario.start'],
    description: 'Run a bounded script of normal inputs in Forge Play or the solo room: at most 32 steps {operation, args?, seconds?}, 60 simulation and 30 wall seconds; no positioning or game-state setters. Forge steps: input.set, input.release, action.press/hold/release/cancel, equipment.equip, wait, observe (args field, equals). The room adds teleport without map. Then scenario.status.' },
  'scenario.status': { summary: "Read the scenario's progress and observations", area: 'play', args: empty, example: {}, runs: ['scenario.status'], description: 'Read the scenario\'s progress and the actual observations.' },
  'scenario.cancel': { summary: 'Cancel the scenario and release its inputs', area: 'play', args: empty, example: {}, runs: ['scenario.cancel'], description: 'Cancel the running scenario and release its inputs.' },
  'request.receipt': { summary: "Recover a mutation's result by its requestId", area: 'session', args: objectOf({ requestId: text }), example: { requestId: 'edit-7' },
    description: 'Recover the result of a mutation sent earlier in this pairing by its requestId (after a lost answer: never resend a mutation blind).',
    returns: '{receipt} -- the retained result, or undefined when none is held.' },
  'testroom.read': { summary: "Read the solo room's state and objectives", area: 'testroom', args: objectOf({ cursor: objectOf({ revision: integer(0, Number.MAX_SAFE_INTEGER), offset: integer(0, Number.MAX_SAFE_INTEGER) }) }, []),
    example: {}, runs: ['testroom.read'],
    description: 'Read the solo room: its snapshot (mode, map, pose, feet, equipment, action, plant), its operations and its objectives, 100 a page; pass nextCursor ({revision, offset}) back as cursor.' },
  'testroom.map': { summary: 'List the maps or load one', area: 'testroom', args: objectOf({ list: flag, map: text256, reload: flag, wait: flag }, []),
    example: { map: 'MP2' },
    description: 'List the catalog maps ({list: true}) or load one ({map, reload?, wait?}; wait defaults to true).', nested: roomNested(['map.list', 'map.load']) },
  'testroom.teleport': { summary: 'Move the walker to feet or a named destination', area: 'testroom', args: TESTROOM_INNER_OPERATIONS['teleport']!.args, example: TESTROOM_INNER_OPERATIONS['teleport']!.example, runs: ['teleport'],
    description: TESTROOM_INNER_OPERATIONS['teleport']!.description },
  'testroom.input': { summary: 'Send one input {operation, arguments}', area: 'testroom',
    args: objectOf({ operation: choice(...TESTROOM_INPUT_OPERATIONS), arguments: arbitraryObject, ...TESTROOM_INNER_OPERATIONS['input.set']!.args.properties }, []),
    example: { operation: 'input.set', arguments: { moveY: 1 } },
    description: 'Send a normal input in the solo room: {operation: <a nested operation>, arguments: <its args>}, or the pad lanes alone (taken as input.set).',
    nested: roomNested(TESTROOM_INPUT_OPERATIONS) },
  'testroom.settings': { summary: 'Set the fly camera or the Play toggle', area: 'testroom', args: objectOf({ operation: choice(...TESTROOM_SETTINGS_OPERATIONS), arguments: arbitraryObject }, ['operation']),
    example: { operation: 'session.play', arguments: { on: true } },
    description: 'Change the room\'s instruments: {operation: camera.set | session.play, arguments}.', nested: roomNested(TESTROOM_SETTINGS_OPERATIONS) },
  'packs.list': { summary: "List this browser's local packs, paged", area: 'packs', args: objectOf({ cursor }, []), example: {},
    description: 'List the packs staged, imported and enabled in this browser: id, kind, name, state and diagnostics.' + PAGED },
  'packs.import': { summary: 'Import a staged or folder pack', area: 'packs',
    args: objectOf({ kind: choice('map', 'mod', 'model', 'texture', 'pack'), path: text256, stagedId: text256, name: text256, apply: flag }, ['kind']),
    example: { kind: 'pack', stagedId: 'staged-1', apply: true },
    description: 'Import a pack the player staged or placed in the approved folder: exactly one of stagedId (from packs.list) or a relative path; apply:true also enables it. At expectedRevision; the room refuses it outside Build (BUILD_LOCKED).' },
  'packs.remove': { summary: 'Remove a local pack', area: 'packs', args: objectOf({ id: text256 }), example: { id: 'mod:demo' },
    description: 'Remove a local pack by its id from packs.list, at expectedRevision.' },
  'camera.shot': { summary: 'Play one smooth camera shot (view only)', area: 'camera', args: forgeDef('camera.shot').inputSchema, example: FORGE_EXAMPLES['camera.shot'], runs: ['camera.shot'],
    description: 'Play one smooth camera shot in Build or the solo room, submitted once: points [{at, look}] (2..64, inside the map), seconds 1..120, optional hold 0..10 at the last point. The page drives it frame by frame; a second shot replaces it; manual camera input, Stop, a mode or map change end it. View only.',
    returns: '{shotId, revision, replaced?}' },
  // AX-13 (plan item 13, a browser adaptation): the player's focus. The point is the editor's own pick under the click
  // (`viewer/src/forge/page.ts` `act` -> `pick`: a placement, the base map or the floor), kept by the facade
  // (`viewer/src/forge/agent/editorFacade.ts` `notePoint`) until the base is replaced.
  'forge.focus': { summary: "Read the player's last clicked point, selection and camera", area: 'forge', args: empty, example: {},
    description: 'Read where the player is pointing in Build: the world point (game units) under their last left click in the editor\'s viewport -- a placement, the base map or the floor, as the editor picks it -- with its time, the selection and the camera. To place something "here", ask the player to click where they want it, then call forge.focus and use its point as the edit\'s at. A click on nothing answers point null with its time; a new base (a layout reload) clears it. The selection is refs, which hold for one revision: act on them at the answer\'s revision.',
    returns: '{point: [x, y, z] | null, pointAt: <ms since epoch> | null, selection: <refs>, camera: {x, y, z, yaw, pitch}, revision}' },
  // AX-13: the room's focus, read off its snapshot (`viewer/src/testroom/agent/target.ts` feet, pose, objectives).
  'testroom.focus': { summary: "Read the player's feet, look and the nearest objective", area: 'testroom', args: empty, example: {},
    description: 'Read where the player is in the solo room: their feet (null in the fly camera), their look (yaw and pitch in degrees, as camera.set takes them), the camera, and the nearest named objective of the loaded map (a bomb site, the bomb start or a spawn, as testroom.teleport names them) with its distance in game units from the feet, or from the camera when there are none.',
    returns: '{map, feet: [x, y, z] | null, look: {yaw, pitch} | null, camera: {x, y, z, yaw, pitch} | null, nearest: {name, kind, team, path, feet, distance} | null, revision}' },
  'camera.stop': { summary: 'End the running camera shot', area: 'camera', args: empty, example: {}, runs: ['camera.stop'], description: 'End the running camera shot.', returns: '{stopped: <shot id> | null}' },
  'camera.status': { summary: "Read the camera shot's state", area: 'camera', args: empty, example: {}, runs: ['camera.status'],
    description: 'Read the camera shot: its id, seconds elapsed and, once over, why it ended (manual, mode, map, stopped, revoked, disconnected or done).' },
};

/** The manual for `operations` (the wire's, `./index.ts` `OPERATIONS`): its permission, surfaces and mutation, and the entries above. */
export function buildManual(operations: Readonly<Record<string, Operation>>): Readonly<Record<string, ManualEntry>> {
  const manual: Record<string, ManualEntry> = {};
  for (const [name, operation] of Object.entries(operations)) {
    const wire = WIRE[name];
    if (!wire) continue;
    // REVIEW-1 10: a nested entry's permission is its wrapper's -- the grant the gateway checks for the wire operation.
    const nested = wire.nested && Object.fromEntries(Object.entries(wire.nested).map(([inner, e]) => [inner, { ...e, permission: operation.permission }]));
    manual[name] = { permission: operation.permission, surfaces: operation.surfaces, mutation: operation.mutation, ...wire, ...(nested ? { nested } : {}) };
  }
  return Object.freeze(manual);
}
