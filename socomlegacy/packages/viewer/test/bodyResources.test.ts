import { describe, expect, it, vi } from 'vitest';
import { Matrix4, Mesh, SkinnedMesh, type Texture } from 'three';
import type { MeshBasicNodeMaterial } from 'three/webgpu';
import type { LoadedBody } from '../src/body';
import { buildBody, type BodyView } from '../src/bodyView';
import { DEFAULT_LIGHTING } from '../src/lighting';

function fixture() {
  const identity = new Matrix4().toArray();
  const surface = {
    textureName: 'skin', fog: false, cull: true,
    positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    normals: Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    uvs: new Float32Array(6), indices: Uint32Array.from([0, 1, 2]),
  };
  const body = {
    character: null, model: 'shared', dressedBy: 'test',
    parts: [{ name: 'root', parent: -1, bindLocal: identity, bindWorld: identity }],
    subMeshes: [{ ...surface, skinIndex: new Uint16Array(12), skinWeight: Float32Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]) }],
    fittings: [{ name: 'Satchel', part: 0, offset: identity, meshes: [{ ...surface, colors: null }] }],
    missing: [], at: null, height: 1, eye: null,
    stats: { vertices: 3, triangles: 1, parts: 1, subMeshes: 1, batches: 1, maxInfluences: 1, droppedWeight: 0, fittings: 1 },
  } as unknown as LoadedBody;
  const map = { textures: { skin: { width: 1, height: 1, data: new Uint8ClampedArray([128, 128, 128, 255]) } }, textureFlags: {} };
  return { body, map };
}
function meshes(view: BodyView): Mesh[] {
  const result: Mesh[] = [];
  view.group.traverse((object) => { if (object instanceof Mesh) result.push(object); });
  return result;
}
const skin = (view: BodyView) => meshes(view).find((mesh) => mesh instanceof SkinnedMesh)! as SkinnedMesh;
const material = (mesh: Mesh) => mesh.material as MeshBasicNodeMaterial;
const texture = (view: BodyView) => material(skin(view)).map!;

describe('shared body render resources (browser memory adaptation)', () => {
  it("review F2 (c4, 2026-11-12): a throwing dispose listener on one resource never strands the body's other leases", () => {
    const { body, map } = fixture();
    const view = buildBody(body, map, DEFAULT_LIGHTING);
    const fitting = meshes(view).find((mesh) => !(mesh instanceof SkinnedMesh))!;
    const freed: string[] = [];
    skin(view).geometry.addEventListener('dispose', () => freed.push('skin'));
    fitting.geometry.addEventListener('dispose', () => freed.push('fitting'));
    texture(view).addEventListener('dispose', () => { freed.push('texture'); throw new Error('a listener failed'); });
    expect(() => view.dispose()).toThrow('a listener failed');   // the failure is still said
    expect(freed.sort()).toEqual(['fitting', 'skin', 'texture']);  // every lease was released, the last one too
    expect(() => view.dispose()).not.toThrow();                    // and a second dispose does nothing
  });

  it('sixteen instances own one geometry per surface and one texture, with independent animation and materials', () => {
    const { body, map } = fixture();
    const views = Array.from({ length: 16 }, () => buildBody(body, map, DEFAULT_LIGHTING));
    try {
      expect(new Set(views.flatMap((view) => meshes(view).map((mesh) => mesh.geometry))).size).toBe(2);
      expect(new Set(views.map(texture)).size).toBe(1);
      expect(new Set(views.map((view) => skin(view).skeleton)).size).toBe(16);
      expect(new Set(views.map((view) => material(skin(view)))).size).toBe(16);
      views[0]!.setPose([new Matrix4().makeTranslation(3, 0, 0).toArray()]);
      views[0]!.setOpacity(0.25);
      views[0]!.setGearVisible('Satchel', true);
      expect(skin(views[1]!).skeleton.bones[0]!.position.x).toBe(0);
      expect(material(skin(views[1]!)).opacity).toBe(1);
      expect(views[1]!.stats.hiddenGear).toContain('Satchel');
    } finally { views.forEach((view) => view.dispose()); }
  });

  it('keeps shared resources alive until the last borrower leaves, including double disposal and replacement', () => {
    const { body, map } = fixture();
    const a = buildBody(body, map, DEFAULT_LIGHTING), b = buildBody(body, map, DEFAULT_LIGHTING);
    const geometry = skin(a).geometry, tex = texture(a);
    const geometryDisposed = vi.fn(), textureDisposed = vi.fn();
    geometry.addEventListener('dispose', geometryDisposed); tex.addEventListener('dispose', textureDisposed);
    a.dispose(); a.dispose();
    expect(geometryDisposed).not.toHaveBeenCalled(); expect(textureDisposed).not.toHaveBeenCalled();
    const replacement = buildBody(body, map, DEFAULT_LIGHTING);
    expect(skin(replacement).geometry).toBe(geometry); expect(texture(replacement)).toBe(tex);
    b.dispose(); expect(geometryDisposed).not.toHaveBeenCalled();
    replacement.dispose(); replacement.dispose();
    expect(geometryDisposed).toHaveBeenCalledTimes(1); expect(textureDisposed).toHaveBeenCalledTimes(1);
    const fresh = buildBody(body, map, DEFAULT_LIGHTING);
    expect(skin(fresh).geometry).not.toBe(geometry); expect(texture(fresh)).not.toBe(tex);
    fresh.dispose();
  });

  it('shares a texture across different models without sharing their geometry', () => {
    const { body, map } = fixture();
    const other = fixture().body;
    const a = buildBody(body, map, DEFAULT_LIGHTING), b = buildBody(other, map, DEFAULT_LIGHTING);
    expect(texture(a)).toBe(texture(b)); expect(skin(a).geometry).not.toBe(skin(b).geometry);
    a.dispose(); b.dispose();
  });

  it('isolates resources between map owners, even with the same decoded inputs', () => {
    const { body, map } = fixture();
    const a = buildBody(body, map, DEFAULT_LIGHTING), b = buildBody(body, { ...map }, DEFAULT_LIGHTING);
    expect(texture(a)).not.toBe(texture(b)); expect(skin(a).geometry).not.toBe(skin(b).geometry);
    a.dispose(); b.dispose();
  });

  it('does not reuse a texture after its decoded source or sampling flags change', () => {
    const { body, map } = fixture();
    const a = buildBody(body, map, DEFAULT_LIGHTING);
    map.textures.skin = { ...map.textures.skin, data: new Uint8ClampedArray([255, 0, 0, 255]) };
    const b = buildBody(body, map, DEFAULT_LIGHTING);
    expect(texture(b)).not.toBe(texture(a));
    Object.assign(map.textureFlags, { skin: { bilinear: false, opaque: true, transparent: false, graded: false, gs: null } });
    const c = buildBody(body, map, DEFAULT_LIGHTING);
    expect(texture(c)).not.toBe(texture(b));
    a.dispose(); b.dispose(); c.dispose();
  });

  it('releases resources acquired by a failed build without disposing an existing borrower', () => {
    const { body, map } = fixture();
    const a = buildBody(body, map, DEFAULT_LIGHTING);
    const textures: Texture[] = [texture(a)];
    const disposed = vi.fn(); textures[0]!.addEventListener('dispose', disposed);
    const invalid = { ...body, fittings: [{ ...body.fittings[0]!, part: 999 }] };
    expect(() => buildBody(invalid, map, DEFAULT_LIGHTING)).toThrow();
    expect(disposed).not.toHaveBeenCalled();
    a.dispose(); expect(disposed).toHaveBeenCalledTimes(1);
  });
});
