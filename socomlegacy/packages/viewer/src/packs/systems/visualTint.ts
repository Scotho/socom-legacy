/**
 * The visual tint (FCW-07b-2): the proof system of the `visual.post` slot, a browser adaptation with no original
 * (`VISUAL_TINT_ADAPTATION`; the contract is `docs/specs/2026-10-25-extension-contracts.md`). Engine code (H272): a
 * pack claims it by name and gives it a colour and a strength in its claim's options
 * (`{slot: 'visual.post', handler: 'visual.post.tint', options: {colour, strength}}`, LATER 458); the code is this
 * module's, offered by the application as `visualTintHandler` and run only by the extension host (`./host`). Off --
 * not offered, registered only, disabled, disposed or restored -- the frame is the original draw list; on, one
 * full-screen pass over the finished picture mixes it toward the colour by the strength.
 */
import { LinearSRGBColorSpace, Mesh, PlaneGeometry, Scene } from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { positionGeometry, vec4 } from 'three/tsl';
import { diagnostic, type Diagnostic, type EngineHandler } from '@s2u/creator-contracts';
import type { SystemFactory, VisualSystem } from './host';

export const VISUAL_TINT_ADAPTATION =
  'a full-screen tint over the finished picture, engine code a pack claims by name; off, the frame is the original draw list' as const;

/** The tint's own refusal: a claim option missing, of the wrong type or out of range (never a throw). */
export const VISUAL_TINT_CODES = Object.freeze({ option: 'visual.TINT_OPTION' } as const);

/** The pass's id on the seam (`VisualPostSeam.snapshot().post` while it is installed). */
export const VISUAL_TINT_PASS = 'visual.post.tint' as const;

/**
 * The claim's options, validated: `colour` six hexadecimal digits (`rrggbb`, a leading `#` allowed, kept lower-case),
 * written to the picture as given (the renderer's output is linear, unconverted -- `createRenderer`); `strength` from 0
 * (the picture unchanged) to 1 (the colour alone). They are the pack claim's (`PackHandlerClaim.options`): the
 * contract bounds their shape, this module checks their content.
 */
export interface VisualTintOptions {
  readonly colour: string;
  readonly strength: number;
}

const HEX = /^#?([0-9a-fA-F]{6})$/;
const KEYS = new Set(['colour', 'strength']);

/** The options as a pack's claim gives them, or the diagnostics that refuse them (`VISUAL_TINT_CODES.option`). */
export function checkVisualTintOptions(raw: unknown): VisualTintOptions | Diagnostic[] {
  const out: Diagnostic[] = [];
  const refuse = (field: string, expected: string, actual: unknown): void => {
    out.push(diagnostic({
      source: 'pack', severity: 'error', code: VISUAL_TINT_CODES.option,
      text: `The tint's ${field} must be ${expected}.`, field, expected, actual: typeof actual === 'string' ? actual : String(actual),
    }));
  };
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    refuse('options', 'an object {colour, strength}', raw);
    return out;
  }
  const o = raw as Record<string, unknown>;
  for (const key of Object.keys(o)) if (!KEYS.has(key)) refuse(key, 'absent (the tint takes colour and strength only)', o[key]);
  const hex = typeof o.colour === 'string' ? HEX.exec(o.colour) : null;
  if (!hex) refuse('colour', 'six hexadecimal digits (rrggbb)', o.colour);
  const strength = o.strength;
  if (typeof strength !== 'number' || !Number.isFinite(strength) || strength < 0 || strength > 1) refuse('strength', 'a number from 0 to 1', strength);
  if (out.length) return out;
  return Object.freeze({ colour: hex![1]!.toLowerCase(), strength: strength as number });
}

/** The tint as the host runs it, over its lease on the seam. Resources are built once an instance, released at dispose. */
function tintSystem(options: VisualTintOptions): SystemFactory {
  return (seam) => {
    let parts: { scene: Scene; mesh: Mesh; geometry: PlaneGeometry; material: MeshBasicNodeMaterial } | null = null;
    let off: (() => void) | null = null;
    const build = (): NonNullable<typeof parts> => {
      const material = new MeshBasicNodeMaterial();
      material.color.setHex(Number.parseInt(options.colour, 16), LinearSRGBColorSpace);
      material.opacity = options.strength;
      material.transparent = true;   // mix(picture, colour, strength): the default blending at alpha = strength
      material.depthTest = false;
      material.depthWrite = false;
      material.fog = false;
      material.vertexNode = vec4(positionGeometry.xy, 0, 1);   // clip space as given, like the renderer's own blits
      const geometry = new PlaneGeometry(2, 2);
      const mesh = new Mesh(geometry, material);
      mesh.frustumCulled = false;
      mesh.visible = false;   // on the seam from install, drawn from enable
      const scene = new Scene();
      scene.add(mesh);
      return { scene, mesh, geometry, material };
    };
    const system: VisualSystem = {
      // Again at an enable after a disable: the resources are kept, the pass put back on the seam the host cleared.
      install() {
        parts ??= build();
        off ??= seam.install({ id: VISUAL_TINT_PASS, scene: parts.scene });
      },
      enable() { if (parts) parts.mesh.visible = true; },
      disable() {
        if (parts) parts.mesh.visible = false;
        off?.();
        off = null;
      },
      dispose() {
        off?.();
        off = null;
        if (!parts) return;
        parts.scene.remove(parts.mesh);
        parts.geometry.dispose();
        parts.material.dispose();
        parts = null;
      },
    };
    return system;
  };
}

/**
 * The engine handler the application lists where it composes the host
 * (`createExtensionHost({ seams: visualPostSeams(renderer), handlers: [visualTintHandler] })`), and its system for a
 * pack's claim, from the claim's options: `systemForClaim(visualTintHandler, claim, defaults?)` (`./host`) -- the
 * claim's `options`, the application's defaults only for a claim with none -- then `host.register(pack, claim,
 * factory)` once it returned no diagnostics.
 */
export const visualTintHandler: EngineHandler & { system(options: unknown): SystemFactory | Diagnostic[] } = Object.freeze({
  id: 'visual.post.tint',
  slot: 'visual.post',
  system(options: unknown): SystemFactory | Diagnostic[] {
    const checked = checkVisualTintOptions(options);
    return Array.isArray(checked) ? checked : tintSystem(checked);
  },
});
