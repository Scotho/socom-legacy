import { afterEach, describe, expect, it } from 'vitest';
import { LinearFilter, LinearMipmapLinearFilter, NearestFilter, Texture } from 'three';
import { EXPERIMENTAL_DEFAULTS } from '../src/experimentalGraphics';
import { setWorldAnisotropy, setWorldSamplingMaximum, updateWorldSampling, worldAnisotropyOn, WorldTextureSampling } from '../src/experimentalWorldSampling';

/**
 * VS-6 (the spec's §4.2 Texture filtering; a browser adaptation, product track): the anisotropy part of the world's
 * sampling (H135) is switched by `setWorldAnisotropy` -- the video keeper's `filtering` row, applied live by the match
 * -- independent of the experiment's `enabled`; trilinear and the mip bias stay the experiment's, gated as before.
 */
const off = { ...EXPERIMENTAL_DEFAULTS, enabled: false };
function texture(): Texture {
  const t = new Texture();
  t.minFilter = NearestFilter; t.magFilter = NearestFilter; t.anisotropy = 1;
  return t;
}

afterEach(() => { setWorldAnisotropy(false); updateWorldSampling(off); setWorldSamplingMaximum(1); });

describe('VS-6: anisotropy without the experiment', () => {
  it('setWorldAnisotropy(true) with the experiment off: the device\'s maximum, the mip chain sampled; off again, the originals back', () => {
    setWorldSamplingMaximum(16);
    updateWorldSampling(off);
    const s = new WorldTextureSampling(() => {});
    const t = texture();
    s.add(t);
    expect(t.anisotropy).toBe(1);
    expect(s.key(t)).toBe(0);
    setWorldAnisotropy(true);
    expect(worldAnisotropyOn()).toBe(true);
    expect(t.anisotropy).toBe(16);
    expect(t.minFilter).toBe(LinearMipmapLinearFilter);
    expect(t.magFilter).toBe(LinearFilter);
    expect(s.key(t)).toBe(1);                                           // sampled with derivatives, never biased
    setWorldAnisotropy(false);
    expect(worldAnisotropyOn()).toBe(false);
    expect(t.anisotropy).toBe(1);
    expect(t.minFilter).toBe(NearestFilter);
    expect(s.key(t)).toBe(0);
    s.dispose();
  });

  it('the other parts stay gated: trilinear and the mip bias asked with the experiment off change nothing; the bias never rides the ungated anisotropy', () => {
    setWorldSamplingMaximum(8);
    const s = new WorldTextureSampling(() => {});
    const t = texture();
    s.add(t);
    updateWorldSampling({ ...off, worldTrilinear: true, worldLodBias: true, worldLodBiasValue: 1 });
    expect(s.key(t)).toBe(0);
    expect(t.minFilter).toBe(NearestFilter);
    setWorldAnisotropy(true);
    expect(s.key(t)).toBe(1);                                           // not 2: the bias is the experiment's
    expect(t.anisotropy).toBe(8);
    s.dispose();
  });

  it('the experiment\'s own anisotropy and bias still work as before, the ungated switch off', () => {
    setWorldSamplingMaximum(4);
    const s = new WorldTextureSampling(() => {});
    const t = texture();
    s.add(t);
    updateWorldSampling({ ...EXPERIMENTAL_DEFAULTS, enabled: true, worldAnisotropy: true, worldLodBias: true, worldLodBiasValue: 1 });
    expect(t.anisotropy).toBe(4);
    expect(s.key(t)).toBe(2);
    updateWorldSampling({ ...EXPERIMENTAL_DEFAULTS, enabled: false, worldAnisotropy: true });
    expect(t.anisotropy).toBe(1);                                       // the experiment off: its anisotropy gone with it
    s.dispose();
  });

  it('the experiment turned off keeps the ungated anisotropy on (a picture change does not undo the row)', () => {
    setWorldSamplingMaximum(16);
    const s = new WorldTextureSampling(() => {});
    const t = texture();
    s.add(t);
    setWorldAnisotropy(true);
    updateWorldSampling({ ...EXPERIMENTAL_DEFAULTS, enabled: true });
    updateWorldSampling(off);
    expect(t.anisotropy).toBe(16);
    s.dispose();
  });

  it("review F2: a new renderer's maximum is taken by a flag left on (setWorldSamplingMaximum recomputes)", () => {
    setWorldSamplingMaximum(4);
    const s = new WorldTextureSampling(() => {});
    const t = texture();
    s.add(t);
    setWorldAnisotropy(true);
    expect(t.anisotropy).toBe(4);
    setWorldSamplingMaximum(16);
    expect(t.anisotropy).toBe(16);
    s.dispose();
  });
});
