import { Matrix4 } from 'three';
import { IDENTITY, Skeleton } from '@s2u/scene';
import { Animator, type MoverSnapshot, type AnimEvent } from '../animator';
import type { LoadedBody } from '../body';
import type { LoadedMap } from '../loadMap';
import type { PlayData } from '../motionTable';
import { drawState, materialSpec, type MaterialSpec, type DrawState } from '../materialSpec';
import { heldSkeleton } from '../heldItem';
import type { BodyRig } from './runtimeAssets';
import { lodPlacements, type PrototypeLod } from './lod';
import type { WorldPlacementSpec } from './worldPlacement';
import { BOMB_MODEL_READING } from '../bombPage';

/** Experimental browser instrument, not the production world renderer or simulation. */
export interface PrototypeDraw {
  positions: Float32Array; normals: Float32Array | null; uvs: Float32Array; colors: Float32Array | null;
  indices: Uint32Array; skinIndex?: Uint16Array; skinWeight?: Float32Array;
  instances?: Float32Array; textureName: string | null; spec: MaterialSpec; state: DrawState;
  model: Matrix4; lit: boolean; skinned: boolean; actor: boolean; modelIndex: number; order: number;
  fitting?: { name: string; bone: number; offset: Matrix4 };
  scroll?: readonly [number, number] | null;
  weapon?: string;
  lod?: PrototypeLod;
  facade?: number;
  world?: WorldPlacementSpec;
  objectModel?: string;
}
export const PROTOTYPE_BONE_LIMIT_ADAPTATION = 48;
export const PROTOTYPE_OMISSIONS = [
  'Base team bodies only; complete remote poses, character variants, targeting and threat indicators remain incomplete',
  'Scope/fire-mode controls, masks, bomb controls and traversal are connected but need rendered validation; night/thermal lens colors, pickups, grenades, other equipment and remaining objectives are incomplete',
  'Seamless map changes and resuming an existing combat seat remain unsupported; a clean logout and fresh join are separate checks',
  'Primary/sidearm, round-screen and sound integration still needs complete match and physical console testing',
  'Effect particles, effect models (muzzle flashes, casings), their sounds and the weather are drawn; effect lights, bullet marks and footprints are not',
  'No water reflections, detail passes or character shadows',
  'Door/gate collision and scene visibility/opacity/UV follow shared rules; moving cranes/facade attachments, gate handle animation/sounds, scene particles and engine grid ordering remain incomplete',
  'Raw path culls static off-screen batches and shares current distance/fade rules; production grid/order and full picture parity remain owed',
  'Approximate transparent ordering; visual parity is not established',
  // XBOX-INTEGRATE's review (2026-11-20, findings 2, 3, 5): omissions the list did not name.
  "No underbarrel launcher fire mode: the kit's held rounds are not passed to the fire-mode rule (production: matchFirearm)",
  "Not played: death and hurt voices, the grenade-warning voice and its HUD line, the flashbang ear ring and its duck, the escortee's voice, the remote throw grunt (production: matchSound)",
  'A spectator or a resumed seat is refused (the match ends to the lobby), not untested',
] as const;
export function prototypeDraws(map: LoadedMap, body: LoadedBody | readonly LoadedBody[], weapons: readonly string[] = []): PrototypeDraw[] {
  const models: readonly LoadedBody[] = Array.isArray(body) ? body : [body as LoadedBody];
  for (const model of models) if (model.parts.length > PROTOTYPE_BONE_LIMIT_ADAPTATION) throw new Error('Prototype bone limit exceeded');
  const out: PrototypeDraw[] = [];
  const origin = new Matrix4().makeTranslation(...map.origin);
  const add = (mesh: { positions: Float32Array; normals: Float32Array | null; uvs: Float32Array; colors?: Float32Array | null;
    indices: Uint32Array; textureName: string | null; fog: boolean; cull?: boolean; vertexAlpha?: boolean },
    model: Matrix4, lit: boolean, order: number, extra: Partial<PrototypeDraw> = {}) => {
    const spec = materialSpec(mesh.textureName ? map.textureFlags[mesh.textureName] : undefined, mesh.fog, true, mesh.cull ?? true, undefined, mesh.vertexAlpha ?? false);
    out.push({ positions: mesh.positions, normals: mesh.normals, uvs: mesh.uvs, colors: mesh.colors ?? null, indices: mesh.indices,
      textureName: mesh.textureName, spec, state: drawState(spec, false), model, lit, skinned: false, actor: false, modelIndex: 0, order, ...extra });
  };
  for (const part of map.world) add(part, origin, part.lit, part.order, { scroll: part.scroll,
    world: { path: part.switchPath, scrollPath: part.scrollPath, alternate: part.alternate } });
  const placements = lodPlacements(map.props);
  for (const prop of map.props) {
    const lods = placements.get(prop);
    for (const part of prop.parts) {
      // A band's placements fade independently. Geometry still shares the same
      // arena ranges; each placement borrows just its existing matrix view.
      if (prop.facade) {
        for (let i = 0; i < prop.matrices.length; i += 16) {
          const placed = origin.clone().multiply(new Matrix4().fromArray(prop.matrices, i));
          add(part, placed, part.lit, part.order, { facade: prop.facade, scroll: part.scroll,
            world: { path: prop.paths?.[i / 16], alternate: prop.alternate } });
        }
      } else if (lods) lods.forEach((lod, i) => add(part, origin, part.lit, part.order,
        { instances: prop.matrices.subarray(i * 16, (i + 1) * 16), scroll: part.scroll, lod,
          world: { paths: prop.paths?.slice(i, i + 1), alternate: prop.alternate } }));
      else add(part, origin, part.lit, prop.order, { instances: prop.matrices, scroll: part.scroll,
        world: { paths: prop.paths, alternate: prop.alternate } });
    }
  }
  models.forEach((body, modelIndex) => {
    const at = body.at?.position ?? map.origin;
    const placed = new Matrix4().makeRotationY(body.at?.yaw ?? 0).setPosition(...at);
    for (const part of body.subMeshes) add(part, placed, true, Number.MAX_SAFE_INTEGER,
      { actor: true, modelIndex, skinned: true, skinIndex: part.skinIndex, skinWeight: part.skinWeight });
    for (const fitting of body.fittings) {
      for (const part of fitting.meshes) add(part, placed.clone(), true, Number.MAX_SAFE_INTEGER,
        { actor: true, modelIndex, fitting: { name: fitting.name, bone: fitting.part, offset: new Matrix4().fromArray(fitting.offset) } });
    }
  });
  for (const name of new Set(weapons)) for (const part of map.weapons?.[name]?.parts ?? []) {
    add(part, new Matrix4(), true, Number.MAX_SAFE_INTEGER, { actor: true, weapon: name });
  }
  // Geometry/texture bytes are charged to the same arena and payload cap as every other draw, even while hidden.
  // The objective's model and the throwables' (`./walkingGrenades`: a grenade, a charge, a launched round in the air).
  for (const object of map.grenade?.models ?? []) {
    for (const part of object.parts) add(part, new Matrix4(), part.lit, Number.MAX_SAFE_INTEGER, { objectModel: object.name });
  }
  return out.sort((a, b) => Number(a.state.transparent) - Number(b.state.transparent) || a.order - b.order);
}

/** The existing game animator drives both comparison paths. No new movement or animation rules. */
export function prototypePose(body: BodyRig, clips: PlayData, held = false) {
  const boneCount = body.parts.length;
  const base = new Skeleton(body.model, IDENTITY, body.parts.map((part, index) => ({
    index, name: part.name, parent: part.parent, bindLocal: part.bindLocal,
    bbox: part.bbox ?? new Float32Array(6), type: 0, flags: 0,
  })));
  const skeleton = held ? heldSkeleton(base) : base;
  const animator = new Animator(skeleton, clips.clips, clips.table ? new Map(clips.table) : null, { random: () => 0.5 });
  const events: AnimEvent[] = [];
  animator.onEvent(event => events.push(event));
  const still: MoverSnapshot = { vx: 0, vy: 0, vz: 0, yaw: 0, airborne: false, crouched: false, landing: null, jumps: 0, stance: 'stand' };
  const inverses = body.parts.map(part => new Matrix4().fromArray(part.bindWorld).invert());
  const palette = new Float32Array(PROTOTYPE_BONE_LIMIT_ADAPTATION * 16), scratch = new Matrix4();
  return { skeleton, palette, rootY: () => animator.rootY(), stats: () => animator.stats(), heldLocal: (name: string) => animator.heldLocal(name),
    setWeapon: (weapon: Parameters<Animator['setWeapon']>[0]) => animator.setWeapon(weapon),
    takeEvents: () => events.splice(0),
    step(dt: number, snapshot: MoverSnapshot = still) {
      events.length = 0; // Events belong to this frame; an inaudible benchmark must not retain them.
      animator.step(dt, snapshot);
      skeleton.update();
      for (let i = 0; i < boneCount; i++) scratch.fromArray(skeleton.world[i]!).multiply(inverses[i]!).toArray(palette, i * 16);
    },
  };
}
