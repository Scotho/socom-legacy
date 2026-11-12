import { describe, expect, it } from 'vitest';
import {
  Box3, BoxGeometry, Color, Group, Mesh, MeshBasicMaterial, OrthographicCamera, RenderTarget, Scene, Vector3, type Camera,
  type ColorRepresentation, type Material,
} from 'three';
import {
  CharacterShadow, fitShadowCamera, markCasters, shadowFactor, shadowStrength, SHADOW_LAYER, SHADOW_MAP_SIZE, SHADOW_WEIGHT,
  type ShadowRenderer,
} from '../src/charShadow';

/** A SEAL-sized box standing on the ground at (100, 0, -50). */
const seal = new Box3(new Vector3(96, 0, -54), new Vector3(104, 18, -46));
/** Frostfire's `ShadowVector` (MP2) and a steep one (MP9). */
const VECTORS: [number, number, number][] = [[-0.811, -0.2, 0.55], [0.408, -0.816, 0.408], [0, -1, 0]];

describe('charShadow: the CRenderMap camera (FUN_0031a180)', () => {
  for (const v of VECTORS) {
    it(`fits the actor's eight corners inside the map with a texel's margin, looking down ${v.join(',')}`, () => {
      const cam = new OrthographicCamera();
      const d = new Vector3(...v).normalize();
      const range = fitShadowCamera(cam, seal, d);
      expect(range).toBeCloseTo(18 * 1.5, 6);                          // 1.5 x the largest side
      expect(cam.position.toArray()).toEqual([100, 9, -50]);             // the bounds' centre
      const forward = new Vector3(0, 0, -1).transformDirection(cam.matrixWorld);
      expect(forward.dot(d)).toBeCloseTo(1, 6);                          // down the shadow vector
      const edge = (SHADOW_MAP_SIZE - 2) / SHADOW_MAP_SIZE;
      let most = 0;
      for (let i = 0; i < 8; i++) {
        const c = new Vector3(i & 1 ? seal.max.x : seal.min.x, i & 2 ? seal.max.y : seal.min.y, i & 4 ? seal.max.z : seal.min.z).project(cam);
        most = Math.max(most, Math.abs(c.x), Math.abs(c.y));
        expect(Math.abs(c.z)).toBeLessThanOrEqual(1);                    // within the depth range
      }
      expect(most).toBeCloseTo(edge, 6);                                 // the outermost corner a texel in from the edge
    });
  }
});

describe('charShadow: the receivers\' darkening (VU1 0x3c)', () => {
  it('scales by ShadowWeight * 255 in the GS\'s 0..128: 0.25 (the world default, no map names one) is ~0.5', () => {
    expect(SHADOW_WEIGHT).toBe(0.25);
    expect(shadowStrength(SHADOW_WEIGHT)).toBeCloseTo(63.75 / 128, 6);
  });
  it('builds a node for the world\'s graphs', () => {
    expect(shadowFactor()).toBeTruthy();
  });
});

describe('charShadow: who draws into the map (VU1 0x40: the actor\'s own triangles)', () => {
  /** A body part and, beside it, an effect light's overlay re-drawing it (`./effectLights`' `overlayOf`). */
  const actor = (): { group: Group; part: Mesh; overlay: Mesh } => {
    const group = new Group();
    const geometry = new BoxGeometry(1, 1, 1);
    const part = new Mesh(geometry, new MeshBasicMaterial());
    const overlay = new Mesh(geometry, new MeshBasicMaterial());
    overlay.userData.effectLightPass = true;
    group.add(part, overlay);
    return { group, part, overlay };
  };

  it('puts the actor\'s own meshes on the map\'s layer, never a light pass\'s overlay (#23: a blast linked its silhouette)', () => {
    const { group, part, overlay } = actor();
    overlay.layers.enable(SHADOW_LAYER);                 // as the old per-frame traversal had left it
    markCasters(group);
    expect(part.layers.isEnabled(SHADOW_LAYER)).toBe(true);
    expect(overlay.layers.isEnabled(SHADOW_LAYER)).toBe(false);
  });

  it('the warm-up\'s set-up marks the same casters', () => {
    const { group, part, overlay } = actor();
    new CharacterShadow().warmSetup(group);
    expect(part.layers.isEnabled(SHADOW_LAYER)).toBe(true);
    expect(overlay.layers.isEnabled(SHADOW_LAYER)).toBe(false);
  });
});

/**
 * RENDER-FINALLY (product track, a renderer adaptation: nothing the game draws changes while renders do not throw): a
 * throw inside the map's render (a failed GPU allocation; the match's frame guard keeps the loop going) puts back the
 * scene's override and background, the renderer's target and clear colour and the scene's matrix flag, and rethrows.
 * Before, all but the flag stayed set: the world drew into the shadow map with the silhouette, a frozen canvas.
 */
describe('charShadow: RENDER-FINALLY, the map\'s draw puts the state back on a throw', () => {
  /** A renderer with a target and a clear colour, whose `render` throws `failing` once and records each draw. */
  class ThrowingRenderer implements ShadowRenderer {
    target: RenderTarget | null;
    clearColor = new Color(0x336699);
    clearAlpha = 0.75;
    failing: Error | null = null;
    readonly draws: { target: RenderTarget | null; override: Material | null; background: unknown }[] = [];
    constructor(target: RenderTarget | null) { this.target = target; }
    getRenderTarget(): RenderTarget | null { return this.target; }
    setRenderTarget(t: RenderTarget | null): void { this.target = t; }
    getClearColor(c: Color): Color { return c.copy(this.clearColor); }
    getClearAlpha(): number { return this.clearAlpha; }
    setClearColor(c: ColorRepresentation, a = 1): void { this.clearColor = new Color(c); this.clearAlpha = a; }
    clear(): void {}
    render(scene: Scene, _camera: Camera): void {
      if (this.failing) { const e = this.failing; this.failing = null; throw e; }
      this.draws.push({ target: this.target, override: scene.overrideMaterial, background: scene.background });
    }
  }
  const setup = () => {
    const scene = new Scene();
    const override = new MeshBasicMaterial();
    const background = new Color(0x112233);
    scene.overrideMaterial = override;
    scene.background = background;
    const group = new Group();
    const body = new Mesh(new BoxGeometry(8, 18, 8), new MeshBasicMaterial());
    body.position.set(0, 9, 0);
    group.add(body);
    scene.add(group);
    const outer = new RenderTarget(4, 4);
    const r = new ThrowingRenderer(outer);
    return { scene, override, background, group, outer, r };
  };
  const expectRestored = (s: ReturnType<typeof setup>): void => {
    expect(s.scene.overrideMaterial).toBe(s.override);
    expect(s.scene.background).toBe(s.background);
    expect(s.r.getRenderTarget()).toBe(s.outer);
    expect(s.r.clearColor.getHex()).toBe(0x336699);
    expect(s.r.clearAlpha).toBe(0.75);
    expect(s.scene.matrixWorldAutoUpdate).toBe(true);
  };

  it('a throwing render rethrows the same error with every piece of state back as it was', () => {
    const s = setup();
    const shadow = new CharacterShadow();
    const failure = new Error('GPU allocation failed');
    s.r.failing = failure;
    let caught: unknown = null;
    try { shadow.update(s.r, s.scene, s.group); } catch (e) { caught = e; }
    expect(caught).toBe(failure);
    expectRestored(s);
    shadow.dispose();
  });

  it('the next frame draws the map as normal: into the map, with the silhouette and no background, then restores', () => {
    const s = setup();
    const shadow = new CharacterShadow();
    s.r.failing = new Error('GPU allocation failed');
    expect(() => shadow.update(s.r, s.scene, s.group)).toThrow('GPU allocation failed');
    shadow.update(s.r, s.scene, s.group);
    expect(s.r.draws).toHaveLength(1);                         // the throw left the map undrawn: no idle skip
    const [draw] = s.r.draws;
    expect(draw!.target).toBe(shadow.target);
    expect(draw!.override).not.toBe(s.override);              // the silhouette, not the scene's own override
    expect(draw!.override).not.toBeNull();
    expect(draw!.background).toBeNull();
    expectRestored(s);
    shadow.dispose();
  });

  it('with no throw the state is restored exactly as before (the unchanged path)', () => {
    const s = setup();
    const shadow = new CharacterShadow();
    shadow.update(s.r, s.scene, s.group);
    expect(s.r.draws).toHaveLength(1);
    expectRestored(s);
    shadow.dispose();
  });
});
