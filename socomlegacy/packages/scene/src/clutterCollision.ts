import { flattenScene, worldDi } from './buildScene';
import { isAffineRowVector, type ClutterInstance } from './clutter';
import { worldCollision, type WorldPoly } from './collision';
import { collisionOwners, uprightFrame, type CollisionOwner } from './grid';
import { multiply, transformPoint, type SceneNode } from './sceneGraph';

/**
 * CLT-2 (plan `docs/plans/clutter.md`, LATER 997, research 422; reading, pending review): the clutter in the hull.
 *
 * The original's collision batch `FUN_002d3cf0` walks each grid cell's clutter list (D:L175686-175710) beside its
 * world objects, running the per-object walk `FUN_002d3030` on each clutter instance's model through the instance's
 * matrix -- for the body's movement records, a round's line and a blast's rays alike (the queue `FUN_0031dd90`
 * D:L219870-219900, the mask forced to -1 at D:L219895), and the immediate query `FUN_002d4780` the same
 * (D:L175765-175788). An instance enters that list only when its model or a child owns polygons (`FUN_002d7b00`
 * D:L177843-177860). Clutter polygons then meet the same polygon test as the world's, so the port's per-query rules
 * (sides, materials, penetration) apply to them unchanged.
 *
 * The rulings: the instances are exactly `placeClutter`'s affine records (CLT.R1); their polygons and owners follow
 * the worldmodel's, in CLUTTER.ZAR's record order (CLT.R2); an owner's path is `clutter/<model>#<record>` and the
 * node's path below the model root (CLT.R3); the grid files them by their polygons' extent (CLT.R4).
 */

/**
 * r0004 r4 0x2f2108-0x2f2304 (research 422 s4; reading, pending review): r0004's clutter loader (r4 0x2f1f70, the twin of
 * `FUN_002d5060`), on a level whose name starts with `mp61` (Sujo; r4 0x2f2108-0x2f2144), frees an instance of the
 * clutter type `barrel_open` (r4 0x2f21b0-0x2f21d4) whose position lies within 1.0 of (614, 30, 1134) on every axis
 * (r4 0x2f2250-0x2f2304) and never files it in a cell. The position is the record's (`FUN_002d9490`'s pointer, which
 * `clutterMatrix` carries in the translation row in both forms). The comparison is taken strict (`< 1`); no record
 * lies on the boundary. OT.R97: r0004 is the specification. Applied to the hull (`clutterCollision`) and the drawing
 * (`placeClutter`'s `keep`).
 */
export function r0004DropsClutter(stem: string, modelName: string, matrix: ArrayLike<number>): boolean {
  if (!stem.toLowerCase().startsWith('mp61') || modelName !== 'barrel_open') return false;
  return Math.abs(matrix[12]! - 614) < 1 && Math.abs(matrix[13]! - 30) < 1 && Math.abs(matrix[14]! - 1134) < 1;
}

/** One clutter model's realised collision, model space, walked once and composed per instance. */
interface Prototype {
  owners: { path: string; modelName: string; flags: number; world: Float32Array; polys: WorldPoly[] }[];
}

/**
 * A clutter model realised as `placeCollision` and `collisionOwners` realise the worldmodel (`flattenScene` rooted at
 * the model, `worldDi`), or null when the graph has no such model (`flattenScene` throws, as `placeClutter` takes it).
 * Rooted at a clutter model, a direct instance child is at depth 0 (`nested` false), so it keeps its own `di` as an
 * instance child of the worldmodel root does (`worldDi`).
 */
function prototypeOf(models: SceneNode[], name: string): Prototype | null {
  let flat;
  try {
    flat = flattenScene(models, name);
  } catch {
    return null;
  }
  const owners: Prototype['owners'] = [];
  for (const f of flat) {
    const di = worldDi(f);
    if (di.length === 0) continue;
    const polys = di.map((poly): WorldPoly => {
      const points = new Float32Array(poly.points.length);
      for (let i = 0; i < poly.points.length; i += 3) {
        const p = transformPoint(f.world, poly.points[i]!, poly.points[i + 1]!, poly.points[i + 2]!);
        points[i] = p[0]; points[i + 1] = p[1]; points[i + 2] = p[2];
      }
      return {
        modelName: f.modelName, path: f.path, region: poly.region, ditype: poly.ditype, material: poly.material, ptcount: poly.ptcount,
        cameratype: poly.cameratype, appflags: poly.appflags, inside: poly.inside, reverbZone: poly.reverbZone, points,
      };
    });
    owners.push({ path: f.path, modelName: f.modelName, flags: f.flags, world: f.world, polys });
  }
  return { owners };
}

/**
 * Every placed clutter instance's polygons in the world, each through its instance's matrix (`p' = p x node world x
 * instance`, row vectors, as `placeClutter` composes `multiply(part.rowMajor, instance.matrix)`), and one owner per
 * (instance, node with polygons) whose `first` counts on from `firstPoly`. `stem`: the map, for r0004's drop
 * (`r0004DropsClutter`). A dropped or skipped record keeps its index for the paths of the others.
 */
export function clutterCollision(models: SceneNode[], instances: ClutterInstance[], firstPoly: number, stem = ''): { polys: WorldPoly[]; owners: CollisionOwner[]; missing: string[] } {
  const prototypes = new Map<string, Prototype | null>();
  const polys: WorldPoly[] = [];
  const owners: CollisionOwner[] = [];
  const missing: string[] = [];
  let first = firstPoly;
  instances.forEach((instance, record) => {
    if (!isAffineRowVector(instance.matrix)) return;                                 // CLT.R1: as the drawing skips it
    if (r0004DropsClutter(stem, instance.modelName, instance.matrix)) return;
    let proto = prototypes.get(instance.modelName);
    if (proto === undefined) {
      proto = prototypeOf(models, instance.modelName);
      if (proto === null) missing.push(instance.modelName);
      prototypes.set(instance.modelName, proto);
    }
    if (proto === null) return;
    const root = `clutter/${instance.modelName}#${record}`;
    const m = instance.matrix;
    for (const o of proto.owners) {
      const path = root + o.path.slice(instance.modelName.length);                    // CLT.R3: the path below the model root
      for (const p of o.polys) {
        const points = new Float32Array(p.points.length);
        for (let i = 0; i < p.points.length; i += 3) {
          const q = transformPoint(m, p.points[i]!, p.points[i + 1]!, p.points[i + 2]!);
          points[i] = q[0]; points[i + 1] = q[1]; points[i + 2] = q[2];
        }
        polys.push({ ...p, path, points });
      }
      const frame = multiply(o.world, m);
      owners.push({
        modelName: o.modelName, path, first, count: o.polys.length, flags: o.flags,
        ...((o.flags & 1) === 0 ? { switchedOff: true as const } : {}), ...(uprightFrame(frame) ? {} : { frame }),
      });
      first += o.polys.length;
    }
  });
  return { polys, owners, missing };
}

/**
 * The map's hull as both the page (`viewer/src/loadMap.ts` `hull`) and the room (`viewer/src/simMap.ts`) build it, so
 * the two stay identical: the worldmodel's polygons and owners (`worldCollision`, `collisionOwners`; a failure there
 * throws, as before), then the clutter's appended (CLT.R2). `readClutter` returns CLUTTER.ZAR's instances
 * (`parseClutter`); when it throws, the hull is the worldmodel's alone and a note says why -- never a throw.
 */
export function mapCollision(models: SceneNode[], stem: string, readClutter: () => ClutterInstance[], rootName = 'worldmodel'): { polys: WorldPoly[]; owners: CollisionOwner[]; notes: string[] } {
  const polys = worldCollision(models, rootName);
  const owners = collisionOwners(models, rootName);
  const notes: string[] = [];
  let instances: ClutterInstance[];
  try {
    instances = readClutter();
  } catch (e) {
    notes.push(`clutter collision: ${e instanceof Error ? e.message : String(e)} -- the hull holds the worldmodel alone`);
    return { polys, owners, notes };
  }
  const clutter = clutterCollision(models, instances, polys.length, stem);
  for (const name of clutter.missing) notes.push(`clutter collision: ${name} named by CLUTTER.ZAR but not in the scene graph`);
  return { polys: [...polys, ...clutter.polys], owners: [...owners, ...clutter.owners], notes };
}
