/**
 * Synthetic zombies-pack bytes for tests. Not a model and not a sound from anywhere: a hand-made glTF
 * triangle and a short PCM tone (`TEST_ROOM_ZOMBIES_ADAPTATION`).
 */
import { makeZip, type ZipItem } from '../zipFixture';

export function pcmWav(seconds = 0.05, rate = 8000): Uint8Array {
  const n = Math.max(1, Math.floor(seconds * rate));
  const data = n * 2;
  const out = new Uint8Array(44 + data);
  const view = new DataView(out.buffer);
  const write = (offset: number, text: string): void => { for (let i = 0; i < text.length; i++) out[offset + i] = text.charCodeAt(i); };
  write(0, 'RIFF');
  view.setUint32(4, 36 + data, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, data, true);
  for (let i = 0; i < n; i++) view.setInt16(44 + i * 2, Math.round(Math.sin(i / 8) * 4000), true);
  return out;
}

/** A glTF 2.0 binary: one triangle of the given height, and one translation clip per name; `patch` edits its JSON. */
export function glbWithClips(names: readonly string[], height = 2, patch?: (json: Record<string, unknown>) => void): ArrayBuffer {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, height, 0]);
  const indices = new Uint16Array([0, 1, 2]);
  const times = new Float32Array([0, 1]);
  const translation = new Float32Array([0, 0, 0, 0, 0.1, 0]);
  const bin = new Uint8Array(76);
  bin.set(new Uint8Array(positions.buffer), 0);
  bin.set(new Uint8Array(indices.buffer), 36);
  bin.set(new Uint8Array(times.buffer), 44);
  bin.set(new Uint8Array(translation.buffer), 52);
  const json = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'Head' }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', max: [1, height, 0], min: [0, 0, 0] },
      { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' },
      { bufferView: 2, componentType: 5126, count: 2, type: 'SCALAR', max: [1], min: [0] },
      { bufferView: 3, componentType: 5126, count: 2, type: 'VEC3', max: [0, 0.1, 0], min: [0, 0, 0] },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36, target: 34962 },
      { buffer: 0, byteOffset: 36, byteLength: 6, target: 34963 },
      { buffer: 0, byteOffset: 44, byteLength: 8 },
      { buffer: 0, byteOffset: 52, byteLength: 24 },
    ],
    buffers: [{ byteLength: bin.byteLength }],
    animations: names.map((name) => ({
      name,
      channels: [{ sampler: 0, target: { node: 0, path: 'translation' } }],
      samplers: [{ input: 2, output: 3, interpolation: 'LINEAR' }],
    })),
  };
  patch?.(json);
  const text = new TextEncoder().encode(JSON.stringify(json));
  const jsonPad = (4 - (text.length % 4)) % 4;
  const binPad = (4 - (bin.length % 4)) % 4;
  const total = 12 + 8 + text.length + jsonPad + 8 + bin.length + binPad;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  let offset = 12;
  view.setUint32(offset, text.length + jsonPad, true);
  view.setUint32(offset + 4, 0x4e4f534a, true);
  out.set(text, offset + 8);
  for (let i = 0; i < jsonPad; i++) out[offset + 8 + text.length + i] = 0x20;
  offset += 8 + text.length + jsonPad;
  view.setUint32(offset, bin.length + binPad, true);
  view.setUint32(offset + 4, 0x004e4942, true);
  out.set(bin, offset + 8);
  return out.buffer;
}

export const CLIPS = ['idle', 'walk', 'run', 'attack', 'death'] as const;

export interface PackSpec {
  json?: unknown;
  model?: Uint8Array;
  sounds?: Record<string, Uint8Array>;
  extra?: ZipItem[];
  zip64?: boolean;
}

export function packZip(spec: PackSpec = {}): Uint8Array {
  const wav = pcmWav();
  const sounds = spec.sounds ?? {
    'sounds/a.wav': wav, 'sounds/b.wav': wav, 'sounds/c.wav': wav,
    'sounds/round-start.wav': wav, 'sounds/round-end.wav': wav,
  };
  const json = spec.json ?? {
    format: 's2u-zombies-pack', version: 1, model: 'zombie.glb',
    bones: { head: 'Head', spine: 'Spine' },
    groups: { Groans: ['sounds/a.wav'], Attacks: ['sounds/b.wav'], Deaths: ['sounds/c.wav'] },
    cues: { 'round-start': 'sounds/round-start.wav', 'round-end': 'sounds/round-end.wav' },
  };
  const model = spec.model ?? new Uint8Array(glbWithClips(CLIPS));
  const items: ZipItem[] = [
    { name: 'pack.json', data: JSON.stringify(json) },
    { name: 'zombie.glb', data: model, method: 0 },
    ...Object.entries(sounds).map(([name, data]) => ({ name, data, method: 0 as const })),
    ...(spec.extra ?? []),
  ];
  return makeZip(items, { zip64: spec.zip64 });
}

export function goodPackBytes(): Uint8Array {
  return packZip();
}
