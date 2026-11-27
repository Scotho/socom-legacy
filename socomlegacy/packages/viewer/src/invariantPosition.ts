import { GLSLNodeBuilder, WGSLNodeBuilder } from 'three/webgpu';

/**
 * MAC-FLOOR step 2 (INTAKE I-3, tier 1 row 18; player report B-64; a renderer adaptation of three's code generation: what is
 * drawn is the original's, only the rounding of the clip-space position is pinned): every vertex program marks its
 * clip-space position invariant -- WGSL `@invariant` on the `@builtin( position )` output, GLSL `invariant gl_Position;`.
 *
 * Why: the world draws its detail pass and its environment pass as second meshes on the base draw's own geometry,
 * depth-tested less-or-equal against it with no offset (`./world` `applyDetail` and the environment pass), as the console
 * tested them: GEQUAL on its own depth, the GS's Z growing toward the eye (the detail pass: its textures' bind packets set
 * `TEST_1` `ZTST = GEQUAL` on all 65 detail records whose texture is on the disc, `./materialSpec` `detailDrawState`; the
 * environment pass: `TEST_1` `0x5000c`, GEQUAL, on every env texture the 34 archives name, research 330 §7 and its
 * `ENV_PASS_TEST_READING`). [Inference, not read: that the console's pass drew the base's own transformed vertices, so
 * its depth equalled the base's; the port's pass draws the base's own geometry.] That holds only while each program computes the base's depth to the last bit, which nothing in three
 * r186 guarantees: the two programs differ (the detail gate's second matrix product, the reflection's normal), and a
 * shader compiler may contract or reorder the position's arithmetic differently in each. On a tester's M1 Pro (Chrome 157,
 * WebGPU on Metal; agent-mail evidence/floor-flicker-mac-2026-11-21/RESULTS.md) the detail pass failed its test in whole
 * 32 px tiles, fixed per camera pose; WebGL2 on the same Mac was clean. Invariance asks every compiler to compute the
 * position by the same expression the same way in every program that writes it. Whether it cures the Mac is NOT shown:
 * the fault may instead be multisampling's (the one clean WebGPU run had none; RESULTS.md calls it a lead) -- the tester's
 * M1 run settles it, with `?antialias=off` and the `?coplanaroffset=on` fallback beside it (`./testroomAntialias`).
 *
 * Every program on that GPU, not only the world's: three reuses a built program by its graph's cache key, which this mark does not
 * enter, so a marked and an unmarked material of one graph could share a program. Fragment stages are left as three writes
 * them. Installed on an Apple GPU only, by `installInvariantPosition` (below).
 * `test/invariantPosition.test.ts` pins the lines of three this relies on.
 */
export const INVARIANT_WGSL_POSITION = '@invariant @builtin( position ) builtinClipSpace';
/** The GLSL ES 3.00 declaration, written after the extensions (directives must come first) and before `main`. */
export const INVARIANT_GLSL_LINE = 'invariant gl_Position;';

const THREE_WGSL_POSITION = '@builtin( position ) builtinClipSpace';

interface WgslProto { getBuiltins(shaderStage: string): string; __s2uInvariant?: true }
interface GlslProto { _getGLSLVertexCode(shaderData: unknown): string; __s2uInvariant?: true }

const wgslProto = WGSLNodeBuilder.prototype as unknown as WgslProto;
const glslProto = GLSLNodeBuilder.prototype as unknown as GlslProto;
const threeGetBuiltins = wgslProto.getBuiltins;
const threeGetGlslVertexCode = glslProto._getGLSLVertexCode;

/** The WGSL vertex stage's builtins (its output struct's members) with the clip-space position marked invariant. */
export function invariantWgslBuiltins(code: string): string {
  return code.includes(INVARIANT_WGSL_POSITION) ? code : code.replace(THREE_WGSL_POSITION, INVARIANT_WGSL_POSITION);
}

/** A GLSL vertex program with `invariant gl_Position;` before its `main`, when it writes `gl_Position` (once). */
export function invariantGlslVertex(code: string): string {
  if (!code.includes('gl_Position') || code.includes(INVARIANT_GLSL_LINE)) return code;
  const at = code.indexOf('\nvoid main(');
  return at < 0 ? code : `${code.slice(0, at)}\n${INVARIANT_GLSL_LINE}\n${code.slice(at)}`;
}

/**
 * Puts the mark on both of three's builders (idempotent). MAC-FLOOR, gated: `./renderer` `createRenderer` calls it only
 * when the page's probe names an Apple GPU (`./deviceClass` `pageAppleGpu`), where the tiles were seen. PC 1's pixels
 * (2026-11-21, an RTX A4500, Chrome 158, agent-mail evidence/bugs-2026-11-18/macfloor-pc1/SUMMARY.md: a rendered run with
 * a repeat-capture control) showed the mark moving MP2's WebGPU edges by up to 28 LSB, and the fix must not change the
 * picture where it was right; MP72's WebGPU was unchanged. Once installed it stays: a page draws on one GPU.
 */
export function installInvariantPosition(): void {
  if (!Object.prototype.hasOwnProperty.call(wgslProto, '__s2uInvariant')) {
    wgslProto.getBuiltins = function (this: WgslProto, shaderStage: string): string {
      const code = threeGetBuiltins.call(this, shaderStage);
      return shaderStage === 'vertex' ? invariantWgslBuiltins(code) : code;
    };
    wgslProto.__s2uInvariant = true;
  }
  if (!Object.prototype.hasOwnProperty.call(glslProto, '__s2uInvariant')) {
    glslProto._getGLSLVertexCode = function (this: GlslProto, shaderData: unknown): string {
      return invariantGlslVertex(threeGetGlslVertexCode.call(this, shaderData));
    };
    glslProto.__s2uInvariant = true;
  }
}

/** Tests only: three's own text (false) or the invariant one again (true). Only between renderers: programs are cached. */
export function setInvariantPositionForTest(on: boolean): void {
  if (on) { installInvariantPosition(); return; }
  wgslProto.getBuiltins = threeGetBuiltins;
  delete wgslProto.__s2uInvariant;
  glslProto._getGLSLVertexCode = threeGetGlslVertexCode;
  delete glslProto.__s2uInvariant;
}

/** Whether the mark is on both of three's builders (tests). */
export function invariantPositionInstalled(): boolean {
  return Object.prototype.hasOwnProperty.call(wgslProto, '__s2uInvariant') && Object.prototype.hasOwnProperty.call(glslProto, '__s2uInvariant');
}
