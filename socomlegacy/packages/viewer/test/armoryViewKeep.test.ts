import { describe, expect, it } from 'vitest';
import type { DecodedWeapon } from '@s2u/scene';
import { Group } from 'three';
import { ArmoryView, showModelParts } from '../src/armoryView';

/**
 * The ARMORY's view keeps its UI models across map changes (the S3 review, finding 15): they are every map's
 * (`RUN/UI/UI_GEO.ZED`), so a later map's data -- sent without them -- leaves them held, and the page's teardown goes.
 */

const mesh = () => ({
  positions: new Float32Array(9), uvs: new Float32Array(6), colors: new Float32Array(12), indices: new Uint32Array([0, 1, 2]),
  textureName: 'm16', cull: true,
});
const model = (name: string): { model: string; decoded: DecodedWeapon } =>
  ({ model: name, decoded: { parts: [{ node: 'g1', meshes: [mesh()] }], textures: ['m16'], diagnostics: [] } as unknown as DecodedWeapon });
const tex = { width: 2, height: 2, data: new Uint8ClampedArray(16) };

describe('ArmoryView keeps the UI models', () => {
  it('holds a model once; a map\'s data without models leaves them; dispose lets all go', () => {
    const v = new ArmoryView();
    expect(v.hasModels()).toBe(false);
    v.setModels([model('m16a2UI')], [['m16', tex]]);
    expect([v.hasModels(), v.hasModel('M16A2UI')]).toEqual([true, true]);
    const meshes = v.warmTargets()[1]!.objects.length;
    const quad = (t: ReturnType<ArmoryView['warmTargets']>) => (t[0]!.objects[0] as unknown as { geometry: unknown } | undefined)?.geometry;
    v.setBitmaps([['backsolid.tif', tex]]);
    const w3 = v.warmTargets();
    expect(quad(w3)).toBe(quad(v.warmTargets()));                      // one warm quad, made once
    v.setModels([], []);                                               // the next map's data: none sent
    expect(v.hasModel('m16a2UI')).toBe(true);
    v.setModels([model('m16a2UI'), model('mp5UI')], [['m16', tex]]);  // a held one is not made again
    expect(v.warmTargets()[1]!.objects.length).toBe(meshes * 2);
    v.dispose();
    expect(v.hasModels()).toBe(false);
  });
});

describe('ArmoryView draws a model without the parts the scripts switched off (ARMORY_MODEL_PART_REF)', () => {
  it('tags each preview mesh with its part and hides the parts named for its entry', () => {
    const decoded = { parts: [{ node: 'commando_high', meshes: [mesh()] }, { node: 'silencer', meshes: [mesh()] }], textures: [], diagnostics: [] } as unknown as DecodedWeapon;
    const v = new ArmoryView();
    v.setModels([{ model: 'sig_commandoUI', decoded }], []);
    const meshes = v.warmTargets()[1]!.objects;
    expect(meshes.map((m) => m.userData['node'])).toEqual(['commando_high', 'silencer']);
    const g = new Group();
    for (const m of meshes) g.add(m);
    const shown = (): unknown[] => g.children.filter((m) => m.visible).map((m) => m.userData['node']);
    showModelParts(g, ['silencer']);
    expect(shown()).toEqual(['commando_high']);
    showModelParts(g, ['Silencer']);                                   // exact names (strcmp): another name hides nothing
    expect(shown()).toEqual(['commando_high', 'silencer']);
    showModelParts(g, []);
    expect(shown()).toEqual(['commando_high', 'silencer']);
    v.dispose();
  });
});
