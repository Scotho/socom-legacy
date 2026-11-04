import { describe, expect, it } from 'vitest';
import { isSoftwareRenderer, noticeSuppressed, probeSoftwareRenderer, softwareRendererOf } from '../src/softwareRenderer';

/** A WebGL context's reads, faked: the debug extension present or withheld, the plain RENDERER string. */
function fakeGl(opts: { unmasked?: string | null; plain?: string | null; debug?: boolean; lose?: () => void }): WebGLRenderingContext {
  const UNMASKED = 0x9246;
  const RENDERER = 0x1f01;
  return {
    RENDERER,
    getExtension(name: string) {
      if (name === 'WEBGL_debug_renderer_info') return opts.debug === false ? null : { UNMASKED_RENDERER_WEBGL: UNMASKED };
      if (name === 'WEBGL_lose_context') return opts.lose ? { loseContext: opts.lose } : null;
      return null;
    },
    getParameter(p: number) {
      if (p === UNMASKED) return opts.unmasked ?? null;
      if (p === RENDERER) return opts.plain ?? null;
      return null;
    },
  } as unknown as WebGLRenderingContext;
}

/** A document whose canvases answer the contexts given (null: no context of that kind). */
function fakeDoc(contexts: Record<string, unknown>, made: string[] = []): Document {
  return {
    createElement(tag: string) {
      if (tag !== 'canvas') throw new Error(tag);
      return { getContext(kind: string) { made.push(kind); return contexts[kind] ?? null; } };
    },
  } as unknown as Document;
}

describe('isSoftwareRenderer (browser adaptation, CPS-4c: the no-GPU notice)', () => {
  it.each([
    'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)',
    'Google SwiftShader',
    'llvmpipe (LLVM 15.0.7, 256 bits)',
    'Mesa/X.org, llvmpipe (LLVM 12.0.0, 256 bits)',
    'ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'Microsoft Basic Render Driver',
    'Software Adapter',
    'Mesa OffScreen',
    'softpipe',
    'Gallium 0.4 on softpipe',
  ])('a software renderer: %s', (s) => {
    expect(isSoftwareRenderer(s)).toBe(true);
  });

  it.each([
    'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 SUPER Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (AMD, AMD Radeon RX 6800 XT Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'Apple M1',
    'Apple GPU',
    'Mali-G78',
    'Adreno (TM) 650',
    'Mesa Intel(R) Xe Graphics (TGL GT2)',
    'WebKit WebGL',
    '',
  ])('never a hardware (or unnamed) one: %s', (s) => {
    expect(isSoftwareRenderer(s)).toBe(false);
  });

  it('null and undefined are not a software renderer by themselves', () => {
    expect(isSoftwareRenderer(null)).toBe(false);
    expect(isSoftwareRenderer(undefined)).toBe(false);
  });
});

describe('softwareRendererOf', () => {
  it('reads the unmasked renderer when the debug extension is there', () => {
    expect(softwareRendererOf(fakeGl({ unmasked: 'Google SwiftShader', plain: 'WebKit WebGL' }))).toBe('Google SwiftShader');
  });
  it('falls back to RENDERER when the extension is withheld or answers nothing', () => {
    expect(softwareRendererOf(fakeGl({ debug: false, plain: 'llvmpipe' }))).toBe('llvmpipe');
    expect(softwareRendererOf(fakeGl({ unmasked: '', plain: 'Mali-G78' }))).toBe('Mali-G78');
  });
  it('is null when the context names nothing', () => {
    expect(softwareRendererOf(fakeGl({ debug: false, plain: null }))).toBeNull();
  });
  it('is null when a read throws (a lost context)', () => {
    const gl = { getExtension() { throw new Error('lost'); }, getParameter() { throw new Error('lost'); } } as unknown as WebGLRenderingContext;
    expect(softwareRendererOf(gl)).toBeNull();
  });
});

describe('probeSoftwareRenderer', () => {
  it('reads a throwaway WebGL2 context, then loses it', () => {
    let lost = 0;
    const made: string[] = [];
    const out = probeSoftwareRenderer(fakeDoc({ webgl2: fakeGl({ unmasked: 'Google SwiftShader', lose: () => { lost += 1; } }) }, made));
    expect(out).toEqual({ renderer: 'Google SwiftShader', software: true });
    expect(made).toEqual(['webgl2']);
    expect(lost).toBe(1);
  });
  it('falls back to WebGL1 when WebGL2 is not offered', () => {
    const made: string[] = [];
    const out = probeSoftwareRenderer(fakeDoc({ webgl: fakeGl({ unmasked: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 SUPER Direct3D11 vs_5_0 ps_5_0, D3D11)' }) }, made));
    expect(out).toEqual({ renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 SUPER Direct3D11 vs_5_0 ps_5_0, D3D11)', software: false });
    expect(made).toEqual(['webgl2', 'webgl']);
  });
  it('a browser that makes no context at all is software', () => {
    expect(probeSoftwareRenderer(fakeDoc({}))).toEqual({ renderer: null, software: true });
  });
  it('a getContext that throws is no context', () => {
    const doc = { createElement: () => ({ getContext() { throw new Error('blocked'); } }) } as unknown as Document;
    expect(probeSoftwareRenderer(doc)).toEqual({ renderer: null, software: true });
  });
  it('a hardware context whose string is withheld is not software', () => {
    expect(probeSoftwareRenderer(fakeDoc({ webgl2: fakeGl({ debug: false, plain: null }) }))).toEqual({ renderer: null, software: false });
  });
});

describe('noticeSuppressed: the notice is for a player, not an automated browser (the batch review, 2026-11-02)', () => {
  it('a test driver (navigator.webdriver true: Playwright, the perf drivers) suppresses it', () => {
    expect(noticeSuppressed({ webdriver: true })).toBe(true);
  });
  it("a player's browser (webdriver false) does not", () => {
    expect(noticeSuppressed({ webdriver: false })).toBe(false);
  });
  it('a navigator without the field does not', () => {
    expect(noticeSuppressed({})).toBe(false);
  });
});
