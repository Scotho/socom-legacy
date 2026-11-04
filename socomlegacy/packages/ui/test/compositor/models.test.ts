import { describe, expect, it } from 'vitest';
import type { DialogModel } from '../../src/dialog';
import {
  UI_MODEL_CAMERA, UI_MODEL_FOCAL_READING, buildDialogScreen, composeScreen, makeModelInstance, modelNodes, projectModels, rotate,
  type UiModelGeometry, type UiModelInstance,
} from '../../src/index';
import { screenNodeTree } from '../../src/screens/screenScripts';

/**
 * The 3D pass's placement and projection (MENU-02a; web research 140 §2): a `MODELS` entry's model placed as
 * `FUN_00366730` (D:L262800-262856) places it before the menu state's camera (D:L54812), its nodes reachable by the
 * scripts, its active parts projected onto the frame. The geometry is made up (one quad per part), the numbers are the
 * decompilation's; the focal length is the reading named in the module.
 */

const entry = (over: Partial<DialogModel> = {}): DialogModel => ({ name: 'Roller', model: 'mainmenu_roller', azimuth: 0, elev: -12.5, distance: 60, rot: 0, useModelUiVar: false, ...over });

/** A part: a unit quad facing +z at `z`, centred at (0, y). */
const quad = (node: string, y: number, z: number, texture: string | null = `${node}.tif`): UiModelGeometry['parts'][number] => ({
  node, meshes: [{
    positions: new Float32Array([1, y + 1, z, -1, y + 1, z, -1, y - 1, z, 1, y - 1, z]),
    uvs: new Float32Array([1, 1, 0, 1, 0, 0, 1, 0]),
    colors: new Float32Array(16).fill(1),
    indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
    texture, cull: true,
  }],
});
const roller = (): UiModelGeometry => ({ name: 'mainmenu_roller', parts: [quad('new_on', 1, 5.5), quad('new_off', 1, 5.5), quad('load_on', 5, 2)] });
const model = (name: string): UiModelGeometry | null => (name === 'mainmenu_roller' ? roller() : null);

describe('makeModelInstance (FUN_00366730 D:L262800-262856)', () => {
  it('places the entry\'s node at (AZIMUTH + 320, ELEV, 320 - DISTANCE) in the world (D:L262819-262821), the camera at (320, 0, 320) (D:L54812)', () => {
    const m = makeModelInstance(entry(), model)!;
    expect(m.root.name).toBe('Roller');
    expect(m.root.position).toEqual([320, -12.5, 260]);
    expect(UI_MODEL_CAMERA).toEqual({ x: 320, y: 0, z: 320 });
    expect(m.parts.map((p) => p.name)).toEqual(['new_on', 'new_off', 'load_on']);
    expect(modelNodes(m).map((n) => n.name)).toEqual(['Roller', 'new_on', 'new_off', 'load_on']);
  });
  it('makes nothing for an entry without a name or a model, or a model the page lacks (FUN_00317c20\'s null, D:L262834)', () => {
    expect(makeModelInstance(entry({ name: null }), model)).toBeNull();
    expect(makeModelInstance(entry({ model: 'absent' }), model)).toBeNull();
  });
  it('USEMODELUIVAR: the MODEL field names a UI variable whose string names the model (D:L262822-262841); without the variable, or a non-string one, none', () => {
    const e = entry({ model: 'RollerModel', useModelUiVar: true });
    const uiVar = (n: string): string | null => (n === 'RollerModel' ? 'mainmenu_roller' : null);
    expect(makeModelInstance(e, model)).toBeNull();
    expect(makeModelInstance(e, model, () => null)).toBeNull();
    expect(makeModelInstance(e, model, uiVar)!.geometry.name).toBe('mainmenu_roller');
    expect(makeModelInstance(entry(), model, () => 'absent')!.geometry.name).toBe('mainmenu_roller');   // the flag off: MODEL is the name
    const design = { libraries: [], usesMemcard: false, font: null, fontLib: true, background: null, bindings: [], controls: [], objects: [], scripts: [], models: [e], dropped: [] };
    expect(buildDialogScreen(design, { model, uiVarString: uiVar }).models.map((m) => m.root.name)).toEqual(['Roller']);
    expect(buildDialogScreen(design, { model }).models).toEqual([]);
  });
  it('is built by buildDialogScreen after the objects (step 3b, D:L263661) when the page hands a model in; else none', () => {
    const design = { libraries: [], usesMemcard: false, font: null, fontLib: true, background: null, bindings: [], controls: [], objects: [], scripts: [], models: [entry()], dropped: [] };
    expect(buildDialogScreen(design, { model }).models.map((m) => m.root.name)).toEqual(['Roller']);
    expect(buildDialogScreen(design).models).toEqual([]);
  });
});

describe('the scripts reach the model\'s nodes (screenNodeTree, after the planes\' nodes)', () => {
  it('finds the entry\'s node and a part\'s by their exact names (NODE_NAME_MATCH_READING: FUN_00315d00\'s strcmp); OBJECT_ACTIVE_STATE and a scale write them', () => {
    const design = { libraries: [], usesMemcard: false, font: null, fontLib: true, background: null, bindings: [], controls: [], objects: [], scripts: [], models: [entry()], dropped: [] };
    const screen = buildDialogScreen(design, { model });
    const tree = screenNodeTree(screen);
    const roller = tree.node('Roller')!, newOn = tree.node('new_on')!;
    expect(roller).toBe(screen.models[0]!.root);
    expect(tree.node('MENUFADER')).toBeDefined();
    expect(tree.node('nothing')).toBeUndefined();
    expect([tree.node('roller'), tree.node('NEW_ON')]).toEqual([undefined, undefined]);   // no folding
    newOn.active = false;
    newOn.scale = [1.4, 1.4, 1.4];
    expect(screen.models[0]!.parts[0]!.active).toBe(false);
    expect(screen.models[0]!.parts[0]!.scale).toEqual([1.4, 1.4, 1.4]);
  });
});

describe('projectModels: the camera before the model, square pixels at UI_MODEL_FOCAL_READING', () => {
  const inst = (): UiModelInstance => makeModelInstance(entry(), model)!;
  const centre = (tris: ReturnType<typeof projectModels>, node: string): [number, number] => {
    const vs = tris.filter((t) => t.node === node).flatMap((t) => [t.a, t.b, t.c]);
    return [vs.reduce((s, v) => s + v.x, 0) / vs.length, vs.reduce((s, v) => s + v.y, 0) / vs.length];
  };
  it('projects a point at (x, y, z) before the camera to (320 + f x / d, 224 - f y / d), d the distance along -z', () => {
    const m = inst();
    const tris = projectModels([m], 100);
    // new_on: centre (0, 1, 5.5) in the model, the model at (0, -12.5, -60) before the camera: d = 54.5, y = -11.5
    const [x, y] = centre(tris, 'new_on');
    expect(x).toBeCloseTo(320, 5);
    expect(y).toBeCloseTo(224 + (100 * 11.5) / 54.5, 5);
    expect(tris.filter((t) => t.node === 'new_on')).toHaveLength(2);
    expect(tris[0]!.texture).toBe('new_on.tif');
    expect(tris[0]!.a.invW).toBeCloseTo(1 / 54.5, 6);
  });
  it('drops a hidden part, a hidden entry, and a part behind the camera', () => {
    const m = inst();
    m.parts[1]!.active = false;
    expect(new Set(projectModels([m]).map((t) => t.node))).toEqual(new Set(['new_on', 'load_on']));
    m.root.active = false;
    expect(projectModels([m])).toEqual([]);
    const far = inst();
    far.root.position = [320, 0, 320 + 1];                 // behind the camera: nothing projects
    expect(projectModels([far])).toEqual([]);
  });
  it('turns the entry by its rotation: +60 degrees about x (ActivateMenuBtns\' LOAD GAME quaternion) brings +y toward the camera', () => {
    const m = inst();
    const before = centre(projectModels([m]), 'load_on');
    m.root.rotation = [0.5, 0, 0, 0.8660254];
    const after = centre(projectModels([m]), 'load_on');
    expect(after[1]).toBeGreaterThan(before[1]);           // the load quad comes down the screen toward the front
    // (0, 5, 2) turned 60 degrees about x: y' = 5 cos 60 - 2 sin 60 = 0.768, z' = 5 sin 60 + 2 cos 60 = 5.33
    const [, y, z] = rotate([0.5, 0, 0, 0.8660254], [0, 5, 2]);
    expect(y).toBeCloseTo(0.768, 3);
    expect(z).toBeCloseTo(5.33, 2);
  });
  it('scales a part about the model\'s origin (every node of mainmenu_roller has the identity matrix) and fades by the opacities', () => {
    const m = inst();
    m.parts[0]!.scale = [2, 2, 2];
    m.parts[0]!.opacity = 0.5;
    const t = projectModels([m], 100).find((x) => x.node === 'new_on')!;
    // (1, 2, 5.5) x 2 = (2, 4, 11): d = 49, y = -8.5 -> 224 + 100 x 8.5 / 49
    expect(t.a.x).toBeCloseTo(320 + (100 * 2) / 49, 5);
    expect(t.a.y).toBeCloseTo(224 + (100 * 8.5) / 49, 5);
    expect(t.a.rgba).toEqual([128, 128, 128, 64]);
  });
  it('is emitted by composeScreen as the models item\'s triangles; a screen without models keeps the bare marker', () => {
    const design = { libraries: [], usesMemcard: false, font: null, fontLib: true, background: null, bindings: [], controls: [], objects: [], scripts: [], models: [entry()], dropped: [] };
    const withModels = composeScreen(buildDialogScreen(design, { model })).find((i) => i.kind === 'models');
    expect(withModels && 'triangles' in withModels ? withModels.triangles!.length : -1).toBe(6);
    const bare = composeScreen(buildDialogScreen(design)).find((i) => i.kind === 'models');
    expect(bare).toEqual({ kind: 'models' });
    expect(UI_MODEL_FOCAL_READING).toBe(455);
  });
});
