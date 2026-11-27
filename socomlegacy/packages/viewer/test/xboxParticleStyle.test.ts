import { expect, it } from 'vitest';
import { DstColorFactor, OneFactor, OneMinusSrcAlphaFactor, SrcAlphaFactor, ZeroFactor } from 'three';
import type { GsState } from '@s2u/gs';
import { effectMaterial } from '../src/effectMaterials';
import type { Factor } from '../src/materialSpec';
import { ParticleStyle } from '../src/xboxPrototype/particleStyle';

it('particle descriptors preserve effective production material state, including textured cutouts', () => {
  const factors: Record<Factor, number> = { zero: ZeroFactor, one: OneFactor, srcAlpha: SrcAlphaFactor,
    oneMinusSrcAlpha: OneMinusSrcAlphaFactor, dstColor: DstColorFactor };
  for (const blend of ['source', 'additive', 'destination', 'none'] as const) for (const alphaTest of [null, 0.5]) {
    const gs: GsState = { blend, alphaTest, bilinear: false, mipmaps: false, levels: 0, depthTest: true, wrapS: 'repeat', wrapT: 'clamp' };
    const rgba = { width: 1, height: 1, data: new Uint8ClampedArray([40, 80, 120, 64]) };
    for (const texture of [null, { gs, rgba }]) {
      const style = new ParticleStyle(texture), current = effectMaterial(texture, { fog: true, vertexAlpha: true });
      try {
        expect(style.state.transparent).toBe(current.transparent);
        expect(style.state.depthWrite).toBe(current.depthWrite);
        expect(style.state.factors ? factors[style.state.factors.src] : OneFactor).toBe(current.blendSrc);
        expect(style.state.factors ? factors[style.state.factors.dst] : ZeroFactor).toBe(current.blendDst);
        // MP64-CREATURES (2026-11-22): the standard material now applies the GS alpha test of a textured cutout (the
        // texture's bind packet: `GsState.alphaTest`), as the world does. The lightweight engine's particle shader still
        // mirrors the old zero (`../src/xboxPrototype/rawParticles.ts`, frozen since v0.4.29): a named divergence, not
        // pinned here as parity.
        expect(current.alphaTest).toBe(texture ? style.spec.alphaTest : 0);   // materialSpec's cutout (GS alpha test, or blend none)
        if (texture) { expect(style.spec.wrapS).toBe('repeat'); expect(style.spec.wrapT).toBe('clamp'); }
      } finally { current.map?.dispose(); current.dispose(); style.dispose(); }
    }
  }
});
