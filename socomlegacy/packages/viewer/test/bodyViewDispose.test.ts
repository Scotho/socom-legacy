import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BufferAttribute, BufferGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import type { LoadedBody } from '../src/body';
import { buildBody } from '../src/bodyView';
import { DEFAULT_LIGHTING } from '../src/lighting';

/**
 * WEBGPU-BLACK (2026-11-05, live v0.4.7; the owner's PC rig, run 8): a body's `dispose` must free only what the body
 * built. `Play` hangs the page's held weapons under `body.group` (play.ts `hangHeld`, `setBody`), and those are the
 * world's one object per model (world.ts `held`), whose geometry every remote body's `cloneHeld` copy shares. The old
 * `dispose` traversed the whole group and disposed every mesh's geometry, so the own body's type swap at the room's
 * spawn (`OwnBody.follow`, the old view disposed before the weapons move to the new one) destroyed the shared
 * weapon buffers under every cached remote clone: under WebGPU, "[Buffer] used in submit while destroyed" on the
 * world's pass every frame from the next frame those clones drew -- the dead view's first spectate.
 */

/** The smallest body `buildBody` takes (as `litColourShader.test.ts`): one untextured and one textured sub-mesh. */
function tinyBody(): { body: LoadedBody; map: Parameters<typeof buildBody>[1] } {
  const identity = Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const sub = (textureName: string | null) => ({
    textureName, fog: false,
    positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]), normals: Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    uvs: new Float32Array(6), indices: Uint32Array.from([0, 1, 2]),
    skinIndex: new Uint16Array(12), skinWeight: Float32Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
  });
  const body = {
    character: null, model: 'tiny', dressedBy: 'test', parts: [{ name: 'root', parent: -1, bindLocal: identity, bindWorld: identity }],
    subMeshes: [sub(null), sub('skin')], fittings: [], missing: [], at: null, height: 1, eye: null,
    stats: { vertices: 3, triangles: 1, parts: 1, subMeshes: 2, batches: 2, maxInfluences: 1, droppedWeight: 0, fittings: 0 },
  } as unknown as LoadedBody;
  const map = { textures: { skin: { width: 1, height: 1, data: new Uint8ClampedArray([128, 128, 128, 255]) } }, textureFlags: {} };
  return { body, map };
}

/** A held weapon as the world keeps it: one geometry, shared by the page's own copy and a remote's clone. */
function heldWeapon(): { original: Mesh; clone: Mesh; disposed: () => number } {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
  let disposed = 0;
  geometry.addEventListener('dispose', () => { disposed++; });
  const original = new Mesh(geometry, new MeshBasicMaterial());
  original.name = 'm4Acarbine';
  const clone = original.clone();                       // `cloneHeld`: the same geometry
  return { original, clone, disposed: () => disposed };
}

describe('bodyView dispose: the body frees what it built, never a child hung on it (WEBGPU-BLACK, 2026-11-05)', () => {
  it('a held weapon hung under the group keeps its geometry when the body is disposed; the body\'s own go', () => {
    const { body, map } = tinyBody();
    const view = buildBody(body, map as never, DEFAULT_LIGHTING);
    const own: number[] = [];
    view.group.traverse((o) => { if (o instanceof Mesh) o.geometry.addEventListener('dispose', () => { own.push(o.id); }); });
    const weapon = heldWeapon();
    weapon.original.matrixAutoUpdate = false;
    view.group.add(weapon.original);                     // `Play.hangHeld`: the world's own object, under the body
    const prop = view.addProp('held_item', 'root');
    const grenade = heldWeapon();
    prop.add(grenade.clone);                             // a model hung on a prop node (`./grenade`, the hand's)
    view.dispose();
    expect(own.length).toBe(2);                          // the two sub-meshes the body built
    expect(weapon.disposed()).toBe(0);                   // the shared weapon geometry is the world's, not the body's
    expect(grenade.disposed()).toBe(0);
    expect(weapon.clone.geometry).toBe(weapon.original.geometry);   // the clone shares it: what the remote bodies draw
  });

  it('a body with nothing foreign under it disposes exactly its own meshes (no change in what it frees)', () => {
    const { body, map } = tinyBody();
    const view = buildBody(body, map as never, DEFAULT_LIGHTING);
    const geometries = new Set<BufferGeometry>();
    view.group.traverse((o) => { if (o instanceof Mesh) geometries.add(o.geometry); });
    let disposed = 0;
    for (const g of geometries) g.addEventListener('dispose', () => { disposed++; });
    view.dispose();
    expect(disposed).toBe(geometries.size);
    expect(geometries.size).toBe(2);
  });
});

/** The own body's swap as `OwnBody.follow` runs it: the held objects must be off the old group before it is disposed. */
describe('the own body swap: the held weapons leave the old view before it is disposed (matchMount dispose order)', () => {
  it('a view disposed with the weapons still under it would dispose their shared geometry: the order is the guard', () => {
    // The property the match's `OwnBody` ops hold (matchMount.ts `dispose`): `Play.setWeapon(null)` and
    // `setSidearm(null)` detach the held objects (`removeFromParent`) before `view.dispose()`. Modelled here on a plain
    // group: once detached, a dispose that still traversed everything could not reach them.
    const group = new Group();
    const weapon = heldWeapon();
    group.add(weapon.original);
    weapon.original.removeFromParent();                  // what `setWeapon(null, [])` does first
    group.traverse((o) => { if (o instanceof Mesh) o.geometry.dispose(); });
    expect(weapon.disposed()).toBe(0);
  });

  it("matchMount's own-body dispose op detaches both held objects before the view is disposed (a source pin, PAR-17's kind)", () => {
    const src = readFileSync(fileURLToPath(new URL('../src/matchMount.ts', import.meta.url)), 'utf8');
    expect(src).toMatch(/dispose: \(v\) => \{ play\.setWeapon\(null, \[\]\); play\.setSidearm\(null, \[\]\); scene\.remove\(v\.group\); v\.dispose\(\); \},/);
  });
});
