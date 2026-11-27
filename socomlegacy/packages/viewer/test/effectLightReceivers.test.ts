import { describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Object3D, Sphere, Vector3 } from 'three';
import type { ZAnimLight } from '@s2u/scene';
import { EffectLights } from '../src/effectLights';
import { MODEL_PACK_DRAW } from '../src/modelPackHook';

const flash: ZAnimLight = { flags: 0, node: null, atContext: false, offset: [0, 0, 0],
  rgb: [255, 200, 120], opacity: 64, blend: 0x48, ranges: [[0, 0, 5]], duration: 1 } as ZAnimLight;
const mesh = () => new Mesh(new BoxGeometry(), new MeshBasicMaterial());

// The release's discovery, kept here as the equivalence oracle for overlapping roots and visibility.
function originalReceivers(roots: Object3D[], hidden: boolean): Mesh[] {
  const out: Mesh[] = [], seen = new Set<Object3D>();
  for (const root of roots) {
    root.updateWorldMatrix(true, true);
    (hidden ? root.traverse : root.traverseVisible).call(root, o => {
      const m = o as Mesh;
      if (seen.has(m) || !m.isMesh || !m.parent || !m.geometry?.getAttribute('position') ||
          m.userData.effectLightPass || m.userData[MODEL_PACK_DRAW] === true) return;
      seen.add(m);
      const mat = Array.isArray(m.material) ? m.material[0] : m.material;
      if (!mat?.transparent) out.push(m);
    });
  }
  return out;
}

describe('effect-light receiver work, with the same illumination', () => {
  it('updates a held weapon inside a body once even when the receiver roots repeat or overlap', () => {
    const body = new Group(), weapon = new Group();
    body.add(mesh(), weapon); weapon.add(mesh());
    const lights = new EffectLights();
    lights.setReceivers(() => [weapon, body, weapon]);
    const update = vi.spyOn(weapon, 'updateWorldMatrix');
    lights.warmMeshes();
    expect(update).toHaveBeenCalledTimes(1);
    expect(lights.stats().pooled).toBe(4);
    lights.warmDone(); update.mockRestore();
  });

  it('keeps discovery order and observes visibility, materials, reparenting and late additions every time', () => {
    const body = new Group(), weapon = new Group(), hiddenParent = new Group(), other = new Group();
    const gun = mesh(), skin = mesh(), glass = mesh(), packed = mesh();
    glass.material.transparent = true; packed.userData[MODEL_PACK_DRAW] = true;
    body.add(hiddenParent, skin, glass, packed); hiddenParent.add(weapon); weapon.add(gun);
    let roots: Object3D[] = [weapon, body, weapon, other];
    const lights = new EffectLights(); lights.setReceivers(() => roots);
    const discover = (hidden: boolean) => (lights as unknown as { receiverMeshes(hidden: boolean): Mesh[] }).receiverMeshes(hidden);
    for (const change of [() => {}, () => { hiddenParent.visible = false; }, () => { weapon.visible = false; },
      () => { weapon.visible = true; glass.material.transparent = false; },
      () => { other.add(weapon); packed.userData[MODEL_PACK_DRAW] = false; },
      () => { other.add(mesh()); skin.removeFromParent(); }, () => { roots = [body, other, weapon]; }]) {
      change();
      for (const hidden of [false, true]) expect(discover(hidden)).toEqual(originalReceivers(roots, hidden));
    }
  });

  it('reuses bounds scratch across shots while moved, scaled and instanced receivers still get the right flashes', () => {
    const world = new Group(), near = mesh(), moving = mesh();
    moving.position.x = 50;
    const instances = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 1);
    instances.setMatrixAt(0, new Matrix4().makeTranslation(2, 0, 0));
    world.add(near, moving, instances);
    const lights = new EffectLights(); lights.setReceivers(() => [world]); lights.warmMeshes(); lights.warmDone();
    // Complete the geometry bounds first: only the light's per-shot bounds work is counted.
    near.geometry.computeBoundingSphere(); moving.geometry.computeBoundingSphere(); instances.computeBoundingSphere();
    const clone = vi.spyOn(Sphere.prototype, 'clone');
    try {
      for (let i = 0; i < 20; i++) {
        lights.clear(); moving.position.x = i % 2 ? 1 : 50;
        near.scale.setScalar(i % 2 ? 2 : 1);
        lights.begin(flash, [0, 0, 0], () => true);
        expect(lights.stats().overlays).toBe(i % 2 ? 3 : 2);
      }
      expect(clone).not.toHaveBeenCalled();
      instances.setMatrixAt(0, new Matrix4().makeTranslation(100, 0, 0));
      instances.computeBoundingSphere();
      lights.clear(); lights.begin(flash, [0, 0, 0], () => true);
      expect(lights.stats().overlays).toBe(2);
      const transformed = new Vector3().setFromMatrixPosition(moving.matrixWorld);
      expect(transformed.x).toBe(1);
    } finally { clone.mockRestore(); }
  });
});
