import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Bone, BoxGeometry, BufferAttribute, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, Skeleton, SkinnedMesh, Uint16BufferAttribute } from 'three';
import { FRAME_DIAG_VARIANTS, floatHash, frameDiag, frameState, paletteHash, poseHash } from '../src/frameDiag';
import { SpectatorView, type SpectatorBody } from '../src/spectatorView';
import { BodyFlag } from '../src/net/protocol';
import { builtTitle, readBuiltDist, VIEWER_DIST } from './builtDist';

/**
 * cps-frame-hash-4 (product track, a test-only instrument; `../src/frameDiag.ts`): the frame identity gate's diagnosis of
 * a followed body's frame that toggles between two pictures (attempt 4 on the owner's PC, 2026-11-03) -- the frame's
 * inputs hashed (the camera's matrices whole, each body's pose and bone palette) and one input switched off at a time,
 * each put back. The browser spec's `S2U_FRAME_DIAG=1` mode is run on request, not here.
 */
const here = dirname(fileURLToPath(import.meta.url));
const src = (f: string): string => readFileSync(resolve(here, '../src', f), 'utf-8');

function skinnedBody(): Group {
  const group = new Group();
  const root = new Bone(), arm = new Bone();
  root.add(arm);
  arm.position.set(0, 1, 0);
  const geo = new BoxGeometry(1, 2, 1);
  const n = geo.getAttribute('position').count;
  geo.setAttribute('skinIndex', new Uint16BufferAttribute(new Uint16Array(n * 4), 4));
  geo.setAttribute('skinWeight', new BufferAttribute(new Float32Array(n * 4).fill(0.25), 4));
  const mesh = new SkinnedMesh(geo, new MeshBasicMaterial());
  mesh.add(root);
  mesh.bind(new Skeleton([root, arm]));
  group.add(mesh);
  group.updateMatrixWorld(true);
  mesh.skeleton.update();
  return group;
}

describe('cps-frame-hash-4: the frame\'s inputs hashed', () => {
  it('floatHash is FNV-1a 64 over the float32 bytes: equal values equal, a 1-ulp change apart', () => {
    expect(floatHash([1, 2, 3])).toBe(floatHash(new Float32Array([1, 2, 3])));
    const f = new Float32Array([1]);
    const u = new Uint32Array(f.buffer);
    u[0] = u[0]! + 1;
    expect(floatHash([f[0]!])).not.toBe(floatHash([1]));
    expect(floatHash([1])).toMatch(/^[0-9a-f]{16}$/);
  });
  it('poseHash moves with any local matrix or visibility under the body; paletteHash with the bone palette, null without a skin', () => {
    const body = skinnedBody();
    const pose = poseHash(body), palette = paletteHash(body);
    expect(poseHash(body)).toBe(pose);
    expect(palette).toMatch(/^[0-9a-f]{16}$/);
    const arm = (body.children[0] as SkinnedMesh).skeleton.bones[1]!;
    arm.rotation.z = 1e-6;
    arm.updateMatrix();
    expect(poseHash(body)).not.toBe(pose);
    body.updateMatrixWorld(true);
    (body.children[0] as SkinnedMesh).skeleton.update();
    expect(paletteHash(body)).not.toBe(palette);
    arm.visible = false;
    const hidden = poseHash(body);
    arm.visible = true;
    expect(hidden).not.toBe(poseHash(body));
    expect(paletteHash(new Group())).toBeNull();
  });
  it('frameState: the camera\'s world and projection matrices whole (16 numbers each) and each body\'s hashes', () => {
    const camera = new PerspectiveCamera(60, 1, 1, 100);
    camera.position.set(1, 2, 3);
    camera.updateMatrixWorld();
    const body = skinnedBody();
    const s = frameState(camera, [{ id: 4, group: body }]);
    expect(s.camera).toEqual(Array.from(camera.matrixWorld.elements));
    expect(s.camera).toHaveLength(16);
    expect(s.projection).toEqual(Array.from(camera.projectionMatrix.elements));
    expect(s.bodies).toEqual([{ id: 4, pose: poseHash(body), palette: paletteHash(body) }]);
  });
});

describe('cps-frame-hash-4: the variants, one at a time, each put back', () => {
  const alive = (id: number): SpectatorBody => ({ id, feet: [id * 10, 0, 0], yaw: 0, flags: BodyFlag.Alive });
  function rig() {
    const scene = new Scene();
    const body = new Group();
    body.add(new Mesh(new BoxGeometry()));
    body.children[0]!.layers.enable(3);
    const overlay = new Mesh(new BoxGeometry());
    overlay.userData['effectLightPass'] = true;
    const hiddenOverlay = new Mesh(new BoxGeometry());
    hiddenOverlay.userData['effectLightPass'] = true;
    hiddenOverlay.visible = false;
    scene.add(body, overlay, hiddenOverlay);
    const view = new SpectatorView({
      bodies: () => [alive(2), alive(5)], seat: () => ({ role: 'spectator', self: null, team: null, teams: new Map(), rules: 'classic', ghost: false }),
      spectate: () => {}, leaveSelf: () => {},
    });
    let cleared = 0;
    const diag = frameDiag({ scene: () => scene, bodies: () => [{ id: 2, group: body }], spectator: () => view, clearShadow: () => { cleared++; } });
    return { scene, body, overlay, hiddenOverlay, view, diag, cleared: () => cleared };
  }
  it('the four variants, in the spec\'s order', () => {
    expect(FRAME_DIAG_VARIANTS).toEqual(['staticCamera', 'noBodies', 'noShadow', 'noEffectLight']);
  });
  it('staticCamera: the spectator\'s own X takes the follow to free (the camera left), and X again back to the same body', () => {
    const r = rig();
    r.view.key({ type: 'keyup', code: 'ArrowRight', repeat: false, preventDefault: () => {} });
    expect([r.view.mode, r.view.target]).toEqual(['follow', 2]);
    expect(r.diag.set('staticCamera')).toBe('staticCamera');
    expect(r.view.mode).toBe('free');
    r.diag.set(null);
    expect([r.view.mode, r.view.target]).toEqual(['follow', 2]);
  });
  it('staticCamera without a follow is not set (null): nothing to stop', () => {
    const r = rig();
    expect(r.diag.set('staticCamera')).toBeNull();
    expect(r.view.mode).toBe('free');
  });
  it('noBodies: every object of every body off every layer, each mask put back', () => {
    const r = rig();
    const masks = [r.body.layers.mask, r.body.children[0]!.layers.mask];
    r.diag.set('noBodies');
    expect([r.body.layers.mask, r.body.children[0]!.layers.mask]).toEqual([0, 0]);
    r.diag.set(null);
    expect([r.body.layers.mask, r.body.children[0]!.layers.mask]).toEqual(masks);
  });
  it('noEffectLight: the shown overlays hidden and shown again; one hidden already stays hidden', () => {
    const r = rig();
    r.diag.set('noEffectLight');
    expect([r.overlay.visible, r.hiddenOverlay.visible]).toEqual([false, false]);
    r.diag.set('noBodies');                       // the next variant puts the last back first
    expect(r.overlay.visible).toBe(true);
    expect(r.body.layers.mask).toBe(0);
    r.diag.set(null);
    expect([r.overlay.visible, r.hiddenOverlay.visible, r.body.layers.mask]).toEqual([true, false, 1]);
  });
  it('noShadow: the shadow cleared before each read, and only under that variant', () => {
    const r = rig();
    r.diag.beforeRead();
    expect(r.cleared()).toBe(0);
    r.diag.set('noShadow');
    r.diag.beforeRead();
    r.diag.beforeRead();
    expect(r.cleared()).toBe(2);
    r.diag.set(null);
    r.diag.beforeRead();
    expect(r.cleared()).toBe(2);
  });
});

describe('cps-frame-hash-4: wired as a development build\'s only', () => {
  it('main.ts hangs frameDiag and frameState under the dev panel\'s gate, after bodiesInView', () => {
    const main = src('main.ts');
    expect(main).toMatch(/\n {2}if \(import\.meta\.en[v]\.DEV && devToolsEnabled\(SEARCH\)\) \{ const diag = frameDiag\(\{ scene: \(\) => scene, bodies: \(\) => remote\.seenForDev\(\)\.bodies, spectator: \(\) => net\?\.spectator \?\? null, clearShadow: \(\) => charShadow\.shadow\.clear\(\) \}\); window\.__viewer\.frameDiag = \(v\) => diag\.set\(v\); window\.__viewer\.frameState = \(\) => \{ diag\.beforeRead\(\); return frameState\(fly\.camera, remote\.seenForDev\(\)\.bodies\); \}; \}/);
    expect(main.indexOf('window.__viewer.frameDiag')).toBeGreaterThan(main.indexOf('window.__viewer.bodiesInView'));
    const hook = src('hook.ts');
    expect(hook).toMatch(/\n {2}frameDiag\?\(variant: FrameDiagVariant \| null\): FrameDiagVariant \| null;/);
    expect(hook).toMatch(/\n {2}frameState\?\(\): FrameState;/);
  });
  it('the spec reads frameState beside each hash and has the S2U_FRAME_DIAG mode over the four variants', () => {
    const spec = readFileSync(resolve(here, '../e2e/zz-frame-identity.spec.ts'), 'utf-8');
    expect(spec).toMatch(/window\.__viewer\.frameState\?\.\(\)/);
    expect(spec).toMatch(/process\.en[v]\['S2U_FRAME_DIAG'\]/);
    expect(spec).toMatch(/FRAME_DIAG_VARIANTS/);
    expect(spec).toMatch(/frame-identity-diag\.json/);
  });
});

const dist = readBuiltDist(VIEWER_DIST);
describe.skipIf(!dist.built)(builtTitle('the built viewer has no frameDiag or frameState (cps-frame-hash-4)', dist), () => {
  it('their hook names are absent from dist/viewer/assets/*.js', () => {
    expect(dist.js).not.toContain('frameDiag');
    expect(dist.js).not.toContain('frameState');
  });
});
