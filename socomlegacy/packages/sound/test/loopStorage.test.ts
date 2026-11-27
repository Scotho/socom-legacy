import { afterEach, describe, expect, it, vi } from 'vitest';
import { GRAIN, type SoundBank } from '../src/bank';
import { renderLoop, renderSound, SampleCache, type RenderOptions, type RenderedSound } from '../src/render';

function bank(send = true, kill = false): SoundBank {
  const grainData = new Uint8Array(48), v = new DataView(grainData.buffer);
  for (const offset of [0, 24]) {
    v.setInt8(offset + 1, 117); v.setInt8(offset + 2, -60);
    v.setUint16(offset + 10, 0x00ff, true); v.setUint16(offset + 12, 0x1f0a, true);
    v.setUint16(offset + 14, send ? 1 : 0, true);
  }
  const vag = new Uint8Array(16); vag[0] = 0; vag[1] = 3; vag.fill(0x12, 2);
  return { name: 'loop-storage', blockId: 'TEST', flags: 0, grainData, names: new Map(), vag,
    sounds: [{ vol: 127, volGroup: 0, pan: 0, instanceLimit: 0, flags: 0,
      grains: [{ type: GRAIN.TONE, arg: 0, delay: 0 }, { type: GRAIN.TONE, arg: 24, delay: 0 },
        ...(kill ? [{ type: GRAIN.KILL_VOICES, arg: 0, delay: 1 }] : [])] }] };
}
// Prior public composition is the oracle: retain the full mix then copy/fold its tail.
function previous(b: SoundBank, seconds: number, fade: number, options: RenderOptions = {}): RenderedSound {
  const r = renderSound(b, 0, new SampleCache(b.vag), { ...options, vol: options.vol ?? 0x400,
    pan: options.pan ?? 0, loop: true, maxSeconds: seconds + fade });
  const frames = Math.round(seconds * 48000), fadeFrames = Math.round(fade * 48000);
  const fold = (x: Float32Array | null): Float32Array | null => {
    if (!x) return null;
    const y = x.slice(0, frames);
    for (let i = 0; i < fadeFrames && frames + i < x.length; i++) {
      const t = i / fadeFrames;
      y[i] = x[i]! * Math.sin(t * Math.PI / 2) + x[frames + i]! * Math.cos(t * Math.PI / 2);
    }
    return y;
  };
  return { ...r, left: fold(r.left)!, right: fold(r.right)!, sendLeft: fold(r.sendLeft), sendRight: fold(r.sendRight) };
}
afterEach(() => vi.unstubAllGlobals());
describe('compact loop preparation', () => {
  it.each([[0.006, 0.001], [0.004, 0], [0.001, 0.004], [0.00003125, 0.00003125], [0, 0.001], [0, 0]])(
    'preserves every channel, peak and metadata for duration %s and fade %s', (seconds, fade) => {
      for (const send of [false, true]) for (const kill of [false, true]) {
        const b = bank(send, kill), options = { pan: 77, vol: 697, pitchMod: -47, random: () => 0.25 };
        const expected = previous(b, seconds, fade, options);
        const actual = renderLoop(b, 0, new SampleCache(b.vag), seconds, fade, options);
        expect(actual).toEqual(expected);
        for (const c of [actual.left, actual.right, actual.sendLeft, actual.sendRight]) if (c) expect(c.buffer.byteLength).toBe(c.byteLength);
      }
    });
  it('allocates only compact loop/tail channels after samples are decoded, with no per-voice arrays', () => {
    const b = bank(), cache = new SampleCache(b.vag); cache.get(0);
    const sizes: number[] = [], Original = Float32Array;
    vi.stubGlobal('Float32Array', new Proxy(Original, { construct(target, args) {
      const a = Reflect.construct(target, args, target) as Float32Array; sizes.push(a.length); return a;
    } }));
    const sound = renderLoop(b, 0, cache, 0.25, 0.05);
    expect(sound.voices).toBe(2);
    expect(sizes.reduce((n, size) => n + size, 0)).toBe(4 * 14400);
    expect(Math.max(...sizes)).toBe(12000);
  });
  it('retains supplied-output callback timing and the existing copy contract', () => {
    const b = bank(), output = vi.fn((frames: number, send: boolean) => ({ left: new Float32Array(frames), right: new Float32Array(frames),
      sendLeft: send ? new Float32Array(frames) : null, sendRight: send ? new Float32Array(frames) : null }));
    const actual = renderLoop(b, 0, new SampleCache(b.vag), 0.01, 0.002, { output });
    expect(output).toHaveBeenCalledExactlyOnceWith(576, true, 48000, true);
    expect(actual).toEqual(previous(b, 0.01, 0.002));
    expect(actual.left.buffer).not.toBe(output.mock.results[0]!.value.left.buffer);
  });
  it('retains silent delayed voices and their exact compact duration', () => {
    const b = bank(); b.sounds[0]!.grains[0]!.delay = 5;
    expect(renderLoop(b, 0, new SampleCache(b.vag), 0.002, 0.001)).toEqual(previous(b, 0.002, 0.001));
  });
});

// XBOX-INTEGRATE: agent/next's LATER 1218 voice list (`RenderedSound.tones`, the page's voice budget) survives the compact
// loop path -- the same voices, priorities, groups and seconds as the full mix's (the oracle above).
describe('XBOX-INTEGRATE: the compact loop keeps LATER 1218\'s tones', () => {
  it.each([[0.006, 0.001], [0.004, 0], [0.001, 0.004], [0, 0.001]])('duration %s, fade %s', (seconds, fade) => {
    for (const send of [false, true]) for (const kill of [false, true]) {
      const b = bank(send, kill), options = { pan: 77, vol: 697, random: () => 0.25 };
      const expected = previous(b, seconds, fade, options);
      const got = renderLoop(b, 0, new SampleCache(b.vag), seconds, fade, options);
      expect(got.tones, `send ${send} kill ${kill}`).toEqual(expected.tones);
      expect(got.tones?.length).toBe(got.voices);
    }
  });
});
