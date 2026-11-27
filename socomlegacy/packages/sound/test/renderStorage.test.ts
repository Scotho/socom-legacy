import { afterEach, describe, expect, it, vi } from 'vitest';
import { GRAIN, type SoundBank } from '../src/bank';
import { renderSound, SampleCache } from '../src/render';
import { VoiceScratch } from '../src/voiceScratch';

function bank(loop = false, killDelay?: number): SoundBank {
  const grainData = new Uint8Array(24), view = new DataView(grainData.buffer);
  view.setInt8(1, 127); view.setInt8(2, -60);
  view.setUint16(10, 0x00ff, true); view.setUint16(12, 0x1f0a, true);
  view.setUint16(14, 1, true); // Reverb send: preserve all four output channels.
  const vag = new Uint8Array(16); vag[0] = 0; vag[1] = loop ? 3 : 1; vag.fill(0x12, 2);
  return { name: 'storage', blockId: 'TEST', flags: 0, grainData, names: new Map(), vag,
    sounds: [{ vol: 127, volGroup: 0, pan: 0, instanceLimit: 0, flags: 0,
      grains: [{ type: GRAIN.TONE, arg: 0, delay: 0 }, ...(killDelay === undefined ? [] : [{ type: GRAIN.KILL_VOICES, arg: 0, delay: killDelay }])] }] };
}
afterEach(() => vi.unstubAllGlobals());
function measured(b: SoundBank, options: Parameters<typeof renderSound>[3] = {}) {
  const lengths: number[] = [], Original = Float32Array;
  vi.stubGlobal('Float32Array', new Proxy(Original, { construct(target, args) {
    const result = Reflect.construct(target, args, target) as Float32Array; lengths.push(result.length); return result;
  } }));
  const sound = renderSound(b, 0, new SampleCache(b.vag), options);
  vi.unstubAllGlobals();
  return { sound, lengths };
}
describe('temporary rendered voice storage', () => {
  it.each([128, 4096])('reuses bounded scratch with exact mixed PCM across overlapping voices and shorter later renders (%s bytes)', bytes => {
    const scratch = new VoiceScratch(bytes), b = bank(true, 2);
    scratch.use(allocate => allocate(bytes / 4).fill(NaN));
    b.sounds[0]!.grains.splice(1, 0, { type: GRAIN.TONE, arg: 0, delay: 1 });
    const control = measured(b).sound, pooled = measured(b, { scratch }).sound;
    expect(pooled).toEqual(control);
    const before = pooled.left.slice();
    for (const next of [bank(), bank(true, 1), bank(true, 2), bank()]) {
      expect(measured(next, { scratch }).sound).toEqual(measured(next).sound);
      expect(pooled.left).toEqual(before);
    }
    expect(scratch.retainedBytes).toBeLessThanOrEqual(bytes);
  });
  it('stops allocating new voice backing after its first use while final channels remain independent', () => {
    const scratch = new VoiceScratch(4096), b = bank();
    measured(b, { scratch });
    const plain = measured(b), reused = measured(b, { scratch });
    expect(reused.sound).toEqual(plain.sound);
    expect(reused.lengths.reduce((a, b) => a + b, 0)).toBe(plain.lengths.reduce((a, b) => a + b, 0) - 28);
  });
  it('keeps outer voices intact across output-allocator reentry and releases scratch after an output error', () => {
    const scratch = new VoiceScratch(4096), b = bank(true, 2), control = measured(b).sound;
    b.sounds[0]!.grains.splice(1, 0, { type: GRAIN.TONE, arg: 0, delay: 1 });
    const expected = measured(b).sound;
    const result = measured(b, { scratch, output: () => {
      expect(measured(bank(true, 2), { scratch }).sound).toEqual(control);
      return undefined;
    } }).sound;
    expect(result).toEqual(expected);
    expect(() => measured(b, { scratch, output: () => { throw Error('destination failed'); } })).toThrow('destination failed');
    expect(measured(b, { scratch }).sound).toEqual(expected);
  });
  it('does not let a supplied final mix escape in the reusable scratch backing', () => {
    const scratch = new VoiceScratch(4096); let escaped: Float32Array;
    scratch.use(allocate => { escaped = allocate(1024); });
    expect(() => measured(bank(), { scratch, output: frames => ({ left: escaped!.subarray(0, frames), right: new Float32Array(frames),
      sendLeft: new Float32Array(frames), sendRight: new Float32Array(frames) }) })).toThrow('scratch');
  });
  it('rejects the outer arena in nested output before zeroing its live voices', () => {
    const scratch = new VoiceScratch(4096);
    scratch.use(allocate => {
      const outer = allocate(100).fill(7);
      expect(() => measured(bank(), { scratch, output: frames => ({ left: outer.subarray(0, frames), right: new Float32Array(frames),
        sendLeft: new Float32Array(frames), sendRight: new Float32Array(frames) }) })).toThrow('scratch');
      expect([...outer]).toEqual(Array(100).fill(7));
    });
  });
  it('rejects retained arena backing even when all voices exceeded its capacity', () => {
    const b = bank(true); b.sounds[0]!.grains.push({ type: GRAIN.KEY_OFF_VOICES, arg: 0, delay: 1 });
    const length = measured(b).sound.left.length;
    expect(length).toBeLessThan(240000);
    const scratch = new VoiceScratch(length * 4); let backing: ArrayBufferLike;
    scratch.use(allocate => { backing = allocate(length).buffer; });
    expect(() => measured(b, { scratch, output: frames => ({ left: new Float32Array(backing!), right: new Float32Array(frames),
      sendLeft: new Float32Array(frames), sendRight: new Float32Array(frames) }) })).toThrow('scratch');
  });
  it('mixes identical samples directly into supplied channels without allocating another final mix', () => {
    const control = measured(bank()), length = control.sound.left.length;
    const output = { left: new Float32Array(length).fill(9), right: new Float32Array(length).fill(8),
      sendLeft: new Float32Array(length).fill(7), sendRight: new Float32Array(length).fill(6) };
    const allocate = vi.fn(() => output), direct = measured(bank(), { output: allocate });
    expect(allocate).toHaveBeenCalledExactlyOnceWith(length, true, 48000, true);
    for (const channel of ['left', 'right', 'sendLeft', 'sendRight'] as const) {
      expect(direct.sound[channel]).toBe(output[channel]); expect(direct.sound[channel]).toEqual(control.sound[channel]);
    }
    expect(direct.sound).toEqual(control.sound); expect(direct.lengths.length).toBe(control.lengths.length - 4);
  });
  it('retains ordinary allocation when the output provider declines, and skips it for an empty sound', () => {
    const output = vi.fn(() => undefined), b = bank();
    expect(measured(b, { output }).sound).toEqual(measured(b).sound); expect(output).toHaveBeenCalledOnce();
    b.sounds[0]!.grains = []; output.mockClear();
    expect(measured(b, { output }).sound.left.length).toBe(0); expect(output).not.toHaveBeenCalled();
  });
  it('shares proven identical dry/send channels without adding a voice twice', () => {
    const b = bank(true, 2);
    b.sounds[0]!.grains.splice(1, 0, { type: GRAIN.TONE, arg: 0, delay: 1 });
    const control = measured(b).sound; expect(control.voices).toBe(2);
    const output = vi.fn((frames: number, send: boolean, rate: number, identical?: boolean) => {
      expect([send, rate, identical]).toEqual([true, 48000, true]);
      const left = new Float32Array(frames).fill(4), right = new Float32Array(frames).fill(5);
      return { left, right, sendLeft: left, sendRight: right };
    });
    const shared = measured(b, { output }).sound;
    expect(shared).toEqual(control); expect(shared.sendLeft).toBe(shared.left); expect(shared.sendRight).toBe(shared.right);
    expect(output).toHaveBeenCalledOnce();
  });
  it.each([0, 0x11])('refuses dry/send aliasing when tone flags %s give different inclusion', flags => {
    const b = bank(), data = new Uint8Array(48); data.set(b.grainData); data.set(b.grainData, 24);
    new DataView(data.buffer).setUint16(38, flags, true); b.grainData = data;
    b.sounds[0]!.grains.push({ type: GRAIN.TONE, arg: 24, delay: 1 });
    const output = (frames: number, _send: boolean, _rate: number, identical?: boolean) => {
      expect(identical).toBe(false);
      const left = new Float32Array(frames), right = new Float32Array(frames);
      return { left, right, sendLeft: left, sendRight: right };
    };
    expect(() => measured(b, { output })).toThrow('Overlapping');
  });
  it('does not allow shifted or crossed aliases even for identical mixes', () => {
    const b = bank();
    for (const crossed of [false, true]) {
      const output = (frames: number) => {
        const backing = new Float32Array(frames + 1), left = backing.subarray(0, frames), right = new Float32Array(frames);
        return { left, right, sendLeft: crossed ? right : backing.subarray(1), sendRight: crossed ? left : right };
      };
      expect(() => measured(b, { output })).toThrow('Overlapping');
    }
  });
  it('rejects wrong lengths, missing send channels and overlapping output views', () => {
    const channels = () => ({ left: new Float32Array(28), right: new Float32Array(28), sendLeft: new Float32Array(28), sendRight: new Float32Array(28) });
    for (const output of [() => ({ ...channels(), right: new Float32Array(27) }),
      () => ({ ...channels(), sendRight: null }), () => { const c = channels(); return { ...c, right: c.left.subarray() }; }]) {
      expect(() => renderSound(bank(), 0, new SampleCache(bank().vag), { output })).toThrow('output');
    }
  });
  it('a 28-sample one-shot does not reserve five seconds of scratch PCM', () => {
    const { sound, lengths } = measured(bank());
    expect(sound.voices).toBe(1); expect(sound.left.length).toBe(28);
    expect(sound.peak).toBeGreaterThan(0); expect(sound.sendLeft).toEqual(sound.left);
    expect(Math.max(...lengths)).toBeLessThanOrEqual(28);
  });
  it('a looping sample killed after one grain tick only reserves that tick', () => {
    const { sound, lengths } = measured(bank(true, 1));
    expect(sound.left.length).toBe(200); expect(Math.max(...lengths)).toBeLessThanOrEqual(200);
  });
  it('retains a long loop and exact channel lengths across a small render cap', () => {
    const { sound } = measured(bank(true), { loop: true, maxSeconds: 0.25 });
    expect(sound.left.length).toBe(12000); expect(sound.right.length).toBe(12000);
    expect(sound.sendLeft).toEqual(sound.left); expect(sound.sendRight).toEqual(sound.right);
  });
});
