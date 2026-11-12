import { CAMERA_SHOT_HOLD_ADAPTATION, CAMERA_SHOT_POINTS_ADAPTATION, CAMERA_SHOT_SECONDS_ADAPTATION } from './limits.js';
import type { JsonSchema } from './schema.js';

/**
 * AX-1 (contract C1; a browser adaptation): the solo test room's inner operations, as the room validates them
 * (`viewer/src/testroom/agent/target.ts` `schemas`, built here the same way). That file is outside AX-1's files, so it
 * keeps its own copy; `viewer/test/agentManual.test.ts` refuses any difference between the two.
 */
const axes = ['moveX', 'moveY', 'lookX', 'lookY'] as const;
const buttons = ['jump', 'crouch', 'prone', 'stance', 'fire', 'reload', 'action', 'swap1', 'swap2'] as const;
const inputProperties: Record<string, JsonSchema> = Object.fromEntries([...axes.map((key) => [key, { type: 'number', minimum: -1, maximum: 1 }]), ...buttons.map((key) => [key, { type: 'boolean' }])]);
const objectSchema = (properties: Record<string, JsonSchema>, required: readonly string[] = []): JsonSchema => ({ type: 'object', properties, required: [...required], additionalProperties: false });
const stringSchema: JsonSchema = { type: 'string', minLength: 1, maxLength: 256 };
const feetSchema: JsonSchema = { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 };

export interface TestroomInnerOperation { description: string; args: JsonSchema; example: unknown }
const inner = (description: string, args: JsonSchema, example: unknown): TestroomInnerOperation => ({ description, args, example });
/** Descriptions after the room's own (`target.ts` `SOLO_TESTROOM_OPERATIONS`), in words for an agent. */
export const TESTROOM_INNER_OPERATIONS: Readonly<Record<string, TestroomInnerOperation>> = Object.freeze({
  'testroom.read': inner('Read the room: mode, map, pose, feet, equipment, action, plant and its named objectives (100 a page).', objectSchema({}), {}),
  'map.list': inner('List the catalog maps the room can load.', objectSchema({}), {}),
  'map.load': inner('Start a real catalog map load. wait defaults to true; wait:false answers at once with desiredMap: poll testroom.read until ready and map.path matches desiredMap.path before a teleport. Acceptance does not mean the map is ready.',
    objectSchema({ map: stringSchema, reload: { type: 'boolean' }, wait: { type: 'boolean', default: true } }, ['map']), { map: 'MP2', wait: true }),
  'teleport': inner('Move the solo walker to explicit feet [x, y, z] or a named destination of the loaded map; an optional map waits for its load. An ambiguous bomb site answers its choices with their names and teams.',
    objectSchema({ map: stringSchema, destination: stringSchema, feet: feetSchema, yaw: { type: 'number' } }), { destination: 'seal_tent' }),
  // REVIEW-1 10: yaw and pitch in degrees (viewer camera.ts Pose), the example's pitch so.
  'camera.set': inner('Set the fly camera only (x, y, z in game units; yaw and pitch in degrees, pitch -35 looks down); to move the body on foot use testroom.teleport.',
    objectSchema(Object.fromEntries(['x', 'y', 'z', 'yaw', 'pitch'].map((k) => [k, { type: 'number' }]))), { x: 0, y: 300, z: -400, yaw: 0, pitch: -35 }),
  'input.set': inner('Hold normal pad lanes: axes -1..1 (positive moveY is forward), buttons true or false; they persist until released, cancelled or 30 seconds wall time.',
    objectSchema(inputProperties), { moveY: 1 }),
  'input.release': inner('Release every injected pad lane.', objectSchema({}), {}),
  'equipment.equip': inner('Equip through the normal selection gate: rifle, pistol or slot 1, 2 or 3.', objectSchema({ item: { enum: ['rifle', 'pistol', 1, 2, 3] } }, ['item']), { item: 'rifle' }),
  'session.play': inner('Use the room\'s Play toggle; finish any ARMORY it opens with armory.key.', objectSchema({ on: { type: 'boolean' } }, ['on']), { on: true }),
  'armory.key': inner('Send a normal key to an ARMORY that is actually open; a closed screen refuses.',
    objectSchema({ code: { enum: ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Backspace'] } }, ['code']), { code: 'Enter' }),
  'action.press': inner('Press the normal action lane.', objectSchema({}), {}),
  'action.hold': inner('Hold the normal action lane.', objectSchema({}), {}),
  'action.release': inner('Release the normal action lane; the game\'s rules decide the outcome.', objectSchema({}), {}),
  'action.cancel': inner('Cancel the held action without firing its release.', objectSchema({}), {}),
  'scenario.start': inner('Run at most 32 steps on rendered frames, 60 seconds of simulation and 30 of wall time. Steps: input.set/release, action.press/hold/release/cancel, equipment.equip, teleport without map, wait or observe (args field and equals; fields map, feet, pose, equipment, action, plant, plant.state, plant.carrier, action.prompt, action.playerMode, action.playing). Each step has operation, optional args and seconds. camera.set steps are refused over the wire. Completion alone does not prove a plant.',
    objectSchema({ steps: { type: 'array', minItems: 1, maxItems: 32, items: objectSchema({ operation: stringSchema, args: { type: 'object' }, seconds: { type: 'number', minimum: 0, maximum: 60 } }, ['operation']) } }, ['steps']),
    { steps: [{ operation: 'input.set', args: { moveY: 1 }, seconds: 2 }, { operation: 'observe', args: { field: 'action.prompt', equals: null }, seconds: 1 }] }),
  'scenario.status': inner('Read the scenario\'s progress and actual observations.', objectSchema({}), {}),
  'scenario.cancel': inner('Cancel the scenario and release its inputs.', objectSchema({}), {}),
  'camera.shot': inner('Play one smooth fly-camera shot, submitted once: points [{at, look}] (2..64, inside the map), seconds 1..120, optional hold 0..10 at the last point. A second shot replaces it; the person\'s camera input, Play, a map change, camera.set, teleport or camera.stop end it.',
    objectSchema({
      points: { type: 'array', minItems: CAMERA_SHOT_POINTS_ADAPTATION.min, maxItems: CAMERA_SHOT_POINTS_ADAPTATION.max,
        items: objectSchema({ at: feetSchema, look: feetSchema }, ['at', 'look']) },
      seconds: { type: 'number', minimum: CAMERA_SHOT_SECONDS_ADAPTATION.min, maximum: CAMERA_SHOT_SECONDS_ADAPTATION.max },
      hold: { type: 'number', minimum: CAMERA_SHOT_HOLD_ADAPTATION.min, maximum: CAMERA_SHOT_HOLD_ADAPTATION.max },
    }, ['points', 'seconds']),
    { points: [{ at: [0, 300, -400], look: [0, 0, 0] }, { at: [400, 200, 0], look: [0, 0, 0] }], seconds: 8 }),
  'camera.stop': inner('End the running camera shot; answers the stopped shot id or null.', objectSchema({}), {}),
  'camera.status': inner('Read the camera shot: its id, seconds elapsed and, once over, why it ended.', objectSchema({}), {}),
});
/** What `testroom.input` forwards and what `testroom.settings` forwards (`viewer/src/agent/testroomTarget.ts`). */
export const TESTROOM_INPUT_OPERATIONS = ['input.set', 'input.release', 'equipment.equip', 'armory.key', 'action.press', 'action.hold', 'action.release', 'action.cancel'] as const;
export const TESTROOM_SETTINGS_OPERATIONS = ['camera.set', 'session.play'] as const;
