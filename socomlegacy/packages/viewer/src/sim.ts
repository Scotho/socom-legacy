/**
 * The shared sim (web sprint 3, M2; spec W3.R2): everything the multiplayer server runs of the walk, headless -- no
 * three.js, no DOM, no Web Audio anywhere under it (`test/simBoundary.test.ts` walks the imports and refuses them). The
 * page imports these same modules; the server (`@s2u/match`) imports them through here, so both predict and
 * decide with one code path.
 *
 * - the mover (`./mover`): the stick law, stances, jumps, landings, action root motion, the probe on the hull;
 * - the traversal moves (`./traversal`): ladders, climbs, peeks, dives, water;
 * - the motion table and clip timings the mover and the moves read (`./motionTable`, `./locomotion`, `./clipPath`);
 * - the tuning (`./physics`) and the stature (`./stature`);
 * - the round (`./round`) and its accuracy and penetration (`./accuracy`), the kick (`./rifleKick`);
 * - the magazines (`./magazines`): the game's ring, one a weapon, the page's `Fire` and the room counting alike;
 * - the runtime kit (`./loadout`, web sprint 4): the loadout's two firearm slots, their records (2X applied), the spawn
 *   kit of each side's character type, the kit tables read once from `ZWEAPON.ZAR`;
 * - each firearm class's rules (`./firearms`, web sprint 4 M4): the reload's delay, the bolt and pump lock, the pellets,
 *   the launchers' rounds as fire modes and the kit's round slots;
 * - the map's typed metadata (`./mapMeta`, MAP-01): the action records, the instance ids, zAnim's initial state;
 * - the world's mutable state (`./worldState`, MAP-02): one per room, the nodes' activity on the collision and the drawing;
 * - the scene objects' health (`./sceneHealth`, MAP-06): the kind-3 damage blocks on their nodes, hits, blasts and C4;
 * - the equipment's rules (`./equipment`, web sprint 4 M7): the three slots and their gate, the pouch the loadout
 *   carries, C4's targets and plant, the rockets' launch and the backblast's cone;
 * - grenades live headless in `@s2u/scene` already (`projectile.ts`: launch, step, the blast's damage);
 * - the reload's clip and length (`./reloadClip`): the page's reload and the room's lock, one table (MJ-1);
 * - the camera's geometry (`./cameraRig`) and the server's accuracy cone over it (`./net/shotCone`, OWNER-3): the room
 *   refuses a round whose eye or aim the page's camera and cone could not have made;
 * - the fire modes' wait (`fireInterval`, `FUN_005c09f0`) the room rates rounds by, and the probe's lift
 *   (`probeLiftOf('stand')` in `./mover`, the tick's floor pick from the feet + 11.48, LATER 785) a spawn is placed from.
 */
export * from './mover';
export { Traversal } from './traversal';
export { shortTurn, wrapYaw } from './yaw';
export * from './round';
export * from './magazines';
export * from './loadout';
export * from './firearms';
export * from './equipment';
export * as accuracy from './accuracy';
export { penetrate, fireInterval } from './accuracy';
export { PROBE_LIFT } from '@s2u/scene';
export * from './physics';
export * from './stature';
export * from './motionTable';
export { oneShotSeconds, airBands, SEAL_ANIMS } from './locomotion';
export { RifleKick } from './rifleKick';
export { openingStand } from './stand';
export * from './simMap';
export { DoorSet, doorInReach, doorPick, openDoorClip, pickDoor, readDoors, PHASE_REST, VALVE_LOCKED, type DoorActor, type DoorHooks, type DoorSpec } from './doors';
export { GateSet, isGateLeaf, readGates, type GateLeverSpec, type GateSpec } from './gates';
export {
  CraneSet, chainReactionCraneSpecs, craneDisc, craneOffset, cranePressSlack, craneRides, craneSwingAngle, craneUnresolved, readCranes, splitCranePlacements,
  type CraneControl, type CraneHooks, type CraneLeg, type CraneSpec,
} from './cranes';
export {
  ACTION_TYPE_CODES, ACTION_TYPE_UNKNOWN, actionAtPick, readMapActions, type ActionRecord, type MapAction,
} from './mapActions';
export { alternateDisagreement, NODE_REF_SCOPE_READING, readMapMeta, under, type MapInitial, type MapInstance, type MapMeta } from './mapMeta';
export {
  bareMeta, forkGround, ROOM_SKIP_EFFECTS_READING, SHOT_GEOMETRY_LIVE_READING, WORLD_RESET_SAVED_READING, WorldState, type InstanceState, type WorldHooks,
} from './worldState';
export {
  C4_ACCEPT_DAMAGE_READING, destructiblesOf, placeRefs, SCENE_BLAST_REACH_PLACEHOLDER, SCENE_DEATH_AUTHORITY_READING, SCENE_INSTANCE_SCOPE_READING,
  SceneHealth, sceneOf, sceneProgramsOf, SKIP_EFFECTS_VALVE, type SceneDestructible, type SceneHit, type SceneMeta, type SceneProgram, type SceneRunContext,
} from './sceneHealth';
export * from './net/protocol';
export * from './net/codec';
export * from './net/voiceWire';
export * from './net/body';
export * from './net/moverSim';
export * from './net/lookGate';
export * from './net/damage';
export * from './net/lobby';
export * from './net/deaths';
export * from './net/rules';
export * from './net/blast';
export * from './reloadClip';
export { CAM_FAR, HEAD_EYE_WALL_BACK_PLACEHOLDER, headEye, localCamera, lookHeight, scopeEyeHeight, toWorld } from './cameraRig';
export * from './net/shotCone';
export * from './net/emplacement';
