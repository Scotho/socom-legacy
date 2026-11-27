import { describe, expect, it } from 'vitest';
import { decodeVagStream, decodeVagStreamPcm16 } from '../src/vagStream';
import { decodeVpk, decodeVpkPcm16 } from '../src/vpk';
import { floatStream, type Pcm16Stream } from '../src/streamPcm';

// Browser storage adaptation: retain the decoder's integers, with no new quantization.
// Synthetic ADPCM exercises every predictor, signed nibbles and clipping.
function frames(): Uint8Array {
  const bytes = new Uint8Array(16 * 65);
  for (let f = 0; f < 65; f++) {
    bytes[f * 16] = ((f % 5) << 4) | (f % 13);
    bytes[f * 16 + 1] = f === 64 ? 1 : 0;
    for (let j = 2; j < 16; j++) bytes[f * 16 + j] = (f * 17 + j * 37) & 255;
  }
  return bytes;
}
function vag(): Uint8Array {
  const data = frames(), bytes = new Uint8Array(48 + data.length), view = new DataView(bytes.buffer);
  bytes.set([0x56, 0x41, 0x47, 0x70]);
  view.setUint32(12, data.length); view.setUint32(16, 22050); bytes.set(data, 48);
  return bytes;
}
function vpk(channels: number): Uint8Array {
  const data = frames(), bytes = new Uint8Array(32 + data.length * channels), view = new DataView(bytes.buffer);
  bytes.set([0x20, 0x4b, 0x50, 0x56]);
  [data.length, 32, 16 * channels, 32000, channels].forEach((value, i) => view.setUint32(4 + 4 * i, value, true));
  for (let at = 0; at < data.length; at += 16) for (let c = 0; c < channels; c++) {
    const frame = data.slice(at, at + 16);
    if (c) for (let j = 2; j < 16; j++) frame[j] = frame[j]! ^ 255;
    bytes.set(frame, 32 + at * channels + c * 16);
  }
  return bytes;
}

describe('lossless stream storage', () => {
  it('preserves all 65536 signed sample values, including endpoints, and mono aliasing', () => {
    const pcm = Int16Array.from({ length: 65536 }, (_, i) => i - 32768);
    const stored: Pcm16Stream = { storage: 'pcm16', left: pcm, right: pcm, sendLeft: null, sendRight: null,
      sampleRate: 22050, voices: 1, samples: [], peak: 1 };
    const expanded = floatStream(stored);
    expect(expanded.right).toBe(expanded.left);
    expect(Array.from(expanded.left)).toEqual(Array.from(pcm, value => value / 32768));
    expect(floatStream(expanded)).toBe(expanded);
    expect(stored.left).toBe(pcm);
  });
  it.each([['VAG', vag, decodeVagStream, decodeVagStreamPcm16],
    ['mono VPK', () => vpk(1), decodeVpk, decodeVpkPcm16],
    ['stereo VPK', () => vpk(2), decodeVpk, decodeVpkPcm16]] as const)(
    '%s keeps the decoder output and metadata at half the channel storage', (_name, bytes, decode, compact) => {
      const input = bytes(), normal = decode(input), stored = compact(input);
      expect(stored.storage).toBe('pcm16');
      expect(stored.left).toBeInstanceOf(Int16Array);
      expect(stored.left.byteLength * 2).toBe(normal.left.byteLength);
      expect(stored.right.byteLength * 2).toBe(normal.right.byteLength);
      expect(floatStream(stored)).toEqual(normal);
      if (_name === 'VAG') expect(stored.right).toBe(stored.left);
      expect(() => compact(input.subarray(0, input.length - 16))).toThrow(/truncated/);
    });
  it('retains only the decoded frames when VAGp or VPK has padding after an early end flag', () => {
    const voice = vag(), music = vpk(2);
    voice[48 + 1] = 1;
    music[32 + 1] = music[32 + 16 + 1] = 1;
    const mono = decodeVagStreamPcm16(voice), stereo = decodeVpkPcm16(music);
    for (const sound of [mono, stereo]) for (const pcm of [sound.left, sound.right]) {
      expect(pcm.length).toBe(28);
      expect(pcm.byteOffset).toBe(0);
      expect(pcm.byteLength).toBe(56);
      expect(pcm.buffer.byteLength).toBe(56);
    }
    expect(mono.right).toBe(mono.left);
    expect(stereo.right.buffer).not.toBe(stereo.left.buffer);
    expect(floatStream(mono)).toEqual(decodeVagStream(voice));
    expect(floatStream(stereo)).toEqual(decodeVpk(music));
  });
});
