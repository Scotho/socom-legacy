// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Zar } from '@s2u/archive';
import { fixture } from '../../archive/test/fixtures';
import {
  bankTone, decodeVag, makeVolume, note2Pitch, OUTPUT_RATE, parseBankFile, renderSound, SampleCache, sdNote2Pitch, voiceLevel,
  type SoundBank,
} from '../src/index';

/**
 * Parity pins for the sample decode and the pitch (TA-SOUND; research 81 §2, research/32 §3). Two halves (TA.R3):
 *
 * - **unit** (no game data, runs on CI): SPU ADPCM blocks written by hand here and decoded to samples worked out by hand
 *   from the recurrence -- the five filter pairs (0,0) (60,0) (115,-52) (98,-55) (122,-60), the division truncating
 *   toward zero, the clamp, a shift over 12 read as 9, a filter over 4 read as 0, the loop and end flags -- and the
 *   pitch word against the rates research 81 §2 names; and the pins of `golden/` driven through the engine code.
 * - **fixture** (`S2U_TEST_FIXTURES`'s `RUN/SOUNDS/BNKSTORE.ZAR`, `RUN/IRX/LIBSD.IRX`; skips without them): the pins
 *   re-derived from the disc's files through the repository's readers and compared whole.
 *
 * `S2U_UPDATE_GOLDEN=1` (with the fixtures present) rewrites the pins from the files instead of comparing them: a
 * developer's convenience after a reader changes on purpose; the diff is then the review.
 */

const GOLDEN = (name: string): string => fileURLToPath(new URL(`./golden/${name}`, import.meta.url));
const pin = <T>(name: string): T & { _source: string } => JSON.parse(readFileSync(GOLDEN(name), 'utf8')) as T & { _source: string };
/** A pin's JSON, one row a line: objects opened to two levels, arrays of rows one row a line, a row on one line. */
function formatPin(o: Record<string, unknown>): string {
  const pad = (n: number): string => '  '.repeat(n);
  const fmt = (v: unknown, depth: number): string => {
    if (Array.isArray(v) && v.length > 0 && depth < 3 && !v.every((x) => typeof x === 'number')) {
      return `[\n${v.map((x) => `${pad(depth + 1)}${JSON.stringify(x)}`).join(',\n')}\n${pad(depth)}]`;
    }
    if (v && typeof v === 'object' && !Array.isArray(v) && depth < 2) {
      return `{\n${Object.entries(v).map(([k, x]) => `${pad(depth + 1)}${JSON.stringify(k)}: ${fmt(x, depth + 1)}`).join(',\n')}\n${pad(depth)}}`;
    }
    return JSON.stringify(v);
  };
  return `${fmt(o, 0)}\n`;
}
/** The data half's comparison: the pin without its `_source`, whole; or, under `S2U_UPDATE_GOLDEN=1`, the pin rewritten. */
function matchPin(name: string, source: string, derived: Record<string, unknown>): void {
  if (process.env.S2U_UPDATE_GOLDEN === '1') writeFileSync(GOLDEN(name), formatPin({ _source: source, ...derived }));
  const { _source, ...pinned } = pin<Record<string, unknown>>(name);
  expect(_source).toBe(source);
  expect(pinned).toEqual(derived);
}

const sha256 = (a: ArrayBufferView): string => createHash('sha256').update(new Uint8Array(a.buffer, a.byteOffset, a.byteLength)).digest('hex');
const seeded = (seed: number) => (): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x80000000; };

/** A 16-byte SPU ADPCM block: `shift | filter << 4`, the flags, and 28 nibbles (low first), given by index. */
function block(head: number, flags: number, nibbles: Record<number, number> = {}): number[] {
  const b = new Array<number>(16).fill(0);
  b[0] = head; b[1] = flags;
  for (const [i, n] of Object.entries(nibbles)) {
    const at = 2 + (Number(i) >> 1);
    b[at] = Number(i) & 1 ? (b[at]! & 0x0f) | ((n & 0xf) << 4) : (b[at]! & 0xf0) | (n & 0xf);
  }
  return b;
}
const pcm = (...blocks: number[][]): number[] => Array.from(decodeVag(new Uint8Array(blocks.flat())).pcm);

describe('SPU ADPCM by hand (research 81 §2; the recurrence of research/32 §3)', () => {
  // Block A, shift 0 filter 0: nibble 26 = 1, nibble 27 = 2 -> its last two samples 1 << 12 = 4096 and 2 << 12 = 8192,
  // so the next block starts from s2 = 4096, s1 = 8192. Block B, shift 12, all nibbles 0: only the filter speaks.
  const A = block(0x00, 0, { 26: 1, 27: 2 });
  it('decodes filter 0 as the nibble shifted by 12 - shift, and nothing of the samples before', () => {
    const s = pcm(A, block(0x0c, 1, {}));
    expect(s.slice(0, 28)).toEqual([...new Array<number>(26).fill(0), 4096, 8192]);
    expect(s.slice(28)).toEqual(new Array<number>(28).fill(0));
  });
  it('predicts with the five filter pairs (60,0) (115,-52) (98,-55) (122,-60): (f0 s1 + f1 s2 + 32) / 64', () => {
    // filter 1: (60 x 8192 + 32) / 64 = 7680.5 -> 7680; then (60 x 7680 + 32) / 64 = 7200.5 -> 7200.
    expect(pcm(A, block(0x1c, 1)).slice(28, 30)).toEqual([7680, 7200]);
    // filter 2: (115 x 8192 - 52 x 4096 + 32) / 64 = 11392.5 -> 11392; (115 x 11392 - 52 x 8192 + 32) / 64 = 13814.5 -> 13814.
    expect(pcm(A, block(0x2c, 1)).slice(28, 30)).toEqual([11392, 13814]);
    // filter 3: (98 x 8192 - 55 x 4096 + 32) / 64 = 9024.5 -> 9024; (98 x 9024 - 55 x 8192 + 32) / 64 = 6778.5 -> 6778.
    expect(pcm(A, block(0x3c, 1)).slice(28, 30)).toEqual([9024, 6778]);
    // filter 4: (122 x 8192 - 60 x 4096 + 32) / 64 = 11776.5 -> 11776; (122 x 11776 - 60 x 8192 + 32) / 64 = 14768.5 -> 14768.
    expect(pcm(A, block(0x4c, 1)).slice(28, 30)).toEqual([11776, 14768]);
  });
  it('truncates the prediction toward zero, as C divides (not a floor, not a shift)', () => {
    // -4096, -8192 into filter 1: (60 x -8192 + 32) / 64 = -7679.5 -> -7679 (a floor or >> 6 would give -7680).
    const neg = block(0x00, 0, { 26: 0xf, 27: 0xe });
    expect(pcm(neg, block(0x1c, 1)).slice(26, 29)).toEqual([-4096, -8192, -7679]);
  });
  it('clamps to 16 bits, both ways', () => {
    // nibble 7 at shift 0 is 28672; filter 1 on top: 28672 + 26880 = 55552 -> 32767.
    expect(pcm(block(0x10, 1, { 0: 7, 1: 7 })).slice(0, 2)).toEqual([28672, 32767]);
    // nibble 8 at shift 0 is -32768; filter 1 on top: -32768 - 30720 -> -32768.
    expect(pcm(block(0x10, 1, { 0: 8, 1: 8 })).slice(0, 2)).toEqual([-32768, -32768]);
  });
  it('reads a shift over 12 as 9 and a filter over 4 as 0', () => {
    expect(pcm(block(0x0d, 1, { 0: 1 }))[0]).toBe(1 << 3);         // shift 13 -> 9: 1 << (12 - 9)
    expect(pcm(block(0x0f, 1, { 0: 1 }))[0]).toBe(1 << 3);         // shift 15 -> 9
    expect(pcm(A, block(0x5c, 1)).slice(28, 30)).toEqual([0, 0]);    // filter 5 -> 0: no prediction
    expect(pcm(A, block(0x7c, 1)).slice(28, 30)).toEqual([0, 0]);    // filter 7 -> 0
    // And the state it leaves is a number: the block after a filter-5 block decodes as filter 0 from silence.
    expect(pcm(A, block(0x5c, 0), block(0x0c, 1, { 0: 1, 1: 2 })).slice(56, 58)).toEqual([1, 2]);
  });
  it('flags: bit 2 marks the loop start, bit 0 ends the run, bit 1 with it repeats; no end flag decodes every block', () => {
    const once = decodeVag(new Uint8Array([...block(0x0c, 0), ...block(0x0c, 4), ...block(0x0c, 1), ...block(0x0c, 0, { 0: 3 })]));
    expect([once.pcm.length, once.loops, once.loopStart, once.bytes]).toEqual([84, false, 28, 48]);
    const looped = decodeVag(new Uint8Array([...block(0x0c, 4), ...block(0x0c, 3)]));
    expect([looped.pcm.length, looped.loops, looped.loopStart, looped.bytes]).toEqual([56, true, 0, 32]);
    const open = decodeVag(new Uint8Array([...block(0x0c, 0), ...block(0x0c, 0), 0x0c, 0]));   // a partial block is not read
    expect([open.pcm.length, open.loops, open.loopStart, open.bytes]).toEqual([56, false, 0, 32]);
    // From an offset (a tone's sample in a bank's VAG chunk): the run starts there, its state from zero.
    const at = decodeVag(new Uint8Array([...block(0x0c, 0, { 27: 5 }), ...block(0x1c, 1, { 0: 1 })]), 16);
    expect(Array.from(at.pcm.slice(0, 2))).toEqual([1, 1]);   // from 0 the block would start on s1 = 5: 1 + 5
  });
});

describe('the pitch and the voice level (research 81 §2-§3, research/32 §3)', () => {
  it('a tone\'s centre note gives its sample rate: .STEP_STONE 16 kHz, .BONE_BRK_1 22.05 kHz, .M4A1_SIL_RLD 44.1 kHz, within 0.2 %', () => {
    // research 81 §2: note 60 is played; pitch 0x1000 is 48 kHz. Centre (-80, 124), (-74, 66), (-62, 66).
    const rate = (c: number, f: number): number => (note2Pitch(c, f, 60, 0) / 0x1000) * OUTPUT_RATE;
    expect(Math.abs(rate(-80, 124) / 16_000 - 1)).toBeLessThan(0.002);
    expect(Math.abs(rate(-74, 66) / 22_050 - 1)).toBeLessThan(0.002);
    expect(Math.abs(rate(-62, 66) / 44_100 - 1)).toBeLessThan(0.002);
    // A PS1 tone (a centre note >= 0) is scaled by 44100 / 48000 and truncated.
    expect(note2Pitch(60, 0, 60, 0)).toBe(Math.trunc((44_100 * 0x1000) / 48_000));
  });
  it('the stereo pair at the centre is 23168 a side; hard right and hard left silence the other side; behind is the centre', () => {
    // VoiceManager::MakeVolume: 127 x 258 = 32766; the pan table at 45 degrees, 989SND.IRX's table 1 (0x1c600):
    // floor(0x3fff x cos 45) = 11584, so 32766 x 11584 / 16383 = 23168.
    expect(makeVolume(127, 0, 127, 0, 127, 0)).toEqual([23168, 23168]);
    expect(makeVolume(127, 0, 127, 90, 127, 0)[0]).toBe(0);
    expect(makeVolume(127, 0, 127, 270, 127, 0)[1]).toBe(0);
    expect(makeVolume(127, 0, 127, 180, 127, 0)).toEqual([23168, 23168]);
    // The square law and the SPU's half scale: 23168^2 / 0x7ffe = 16381, >> 1.
    expect(voiceLevel(23168)).toBe(8190);
  });
});

/** Sony's `sceSdNote2Pitch` with a given note table (the port's arithmetic otherwise, line for line, clamps included). */
function note2PitchWith(table: readonly number[], centerNote: number, centerFine: number, note: number, fine: number): number {
  const idiv = (a: number, b: number): number => Math.trunc(a / b);
  const _fine = fine + centerFine;
  let _fine2 = _fine < 0 ? _fine + 127 : _fine;
  _fine2 = idiv(_fine2, 128);
  const _note = note + _fine2 - centerNote;
  let val3 = idiv(_note, 6);
  if (_note < 0) val3--;
  const offset2 = _fine - _fine2 * 128;
  let val2 = _note < 0 ? -1 : 0;
  if (val3 < 0) val3--;
  val2 = idiv(val3, 2) - val2;
  let val = val2 - 2;
  let offset1 = _note - val2 * 12;
  if (offset1 < 0 || (offset1 === 0 && offset2 < 0)) { offset1 += 12; val = val2 - 3; }
  let off2 = offset2;
  if (off2 < 0) { offset1 = offset1 - 1 + _fine2; off2 += (_fine2 + 1) * 128; }
  offset1 = Math.min(11, Math.max(0, offset1));
  off2 = Math.min(127, Math.max(0, off2));
  let ret = Math.floor((table[offset1]! * table[off2 + 12]!) / 0x10000);
  if (val < 0) ret = Math.floor((ret + 2 ** (-val - 1)) / 2 ** -val);
  else if (val > 0) ret = ret * 2 ** val;
  return Math.min(0xffff, Math.max(0, ret));
}

interface PitchTablePin { offset: number; table: number[] }

describe('LIBSD.IRX\'s note table, pinned (golden/libsd-note-pitch.json)', () => {
  it('is 12 semitone ratios then 128 fine steps, 0x8000 = 1.0, each the floor of 0x8000 x 2^(i/12) or 2^(i/1536)', () => {
    const { table } = pin<PitchTablePin>('libsd-note-pitch.json');
    expect(table.length).toBe(140);
    expect([table[0], table[12]]).toEqual([0x8000, 0x8000]);
    for (let i = 0; i < 12; i++) expect(table[i], `semitone ${i}`).toBe(Math.floor(0x8000 * 2 ** (i / 12)));
    for (let i = 0; i < 128; i++) expect(table[12 + i], `fine ${i}`).toBe(Math.floor(0x8000 * 2 ** (i / 1536)));
  });
  // DRIFT (TA.R6): research 81 §2 (line 101: "`sceSdNote2Pitch` (research/32 §3 ...)") and render.ts name the pitch
  // `sceSdNote2Pitch`, whose note table is LIBSD.IRX's (on the disc at 0x5220, pinned): Sony's table holds the FLOOR of each
  // ratio (0x9837, 0x800e ...), the port builds it with Math.round (0x9838, 0x800f: render.ts NOTE_PITCH, after
  // snd989_mixer.cpp's std::lround). 3,088 of the 16,384 (centre note, fine) pairs give another pitch word, up to 1 %
  // apart at the lowest pitches; of the pinned tones, .M4A1 and .DINK (-58, 66) play 4737 where the disc's table gives
  // 4736. it.fails until the port's table is the disc's.
  it.fails('the port\'s sceSdNote2Pitch equals Sony\'s with the disc\'s table for every centre note and fine (drift: rounded table)', () => {
    const { table } = pin<PitchTablePin>('libsd-note-pitch.json');
    for (let c = 0; c < 128; c++) for (let f = 0; f < 128; f++) {
      expect(sdNote2Pitch(c, f, 60, 0), `${c} ${f}`).toBe(note2PitchWith(table, c, f, 60, 0));
    }
  });
});

interface ToneDigest {
  vol: number; centerNote: number; centerFine: number; pan: number; adsr1: number; adsr2: number; flags: number; sampleOffset: number;
  pitch: number; sample: { samples: number; loops: boolean; loopStart: number; bytes: number; sha256: string };
}
interface SoundDigest {
  bank: string; name: string; index: number; vol: number; volGroup: number; pan: number; grainTypes: number[]; tones: ToneDigest[];
  render: { seed: number; frames: number; voices: number; samples: number[]; peak: number; sha256: string };
}

describe('the bank digests, pinned (golden/bank-digests.json)', () => {
  // DRIFT (TA.R6), the same as above on the disc's own tones: a pinned `pitch` is sceSdNote2Pitch's with the disc's table
  // (the original's), and the port's note2Pitch gives .M4A1's and .DINK's (-58, 66) one higher (4737 for 4736).
  it.fails('each pinned tone\'s pitch word is the port\'s note2Pitch of its centre note and fine at note 60 (drift: .M4A1, .DINK)', () => {
    const { sounds } = pin<{ sounds: SoundDigest[] }>('bank-digests.json');
    for (const s of sounds) for (const t of s.tones) expect(note2Pitch(t.centerNote, t.centerFine, 60, 0), `${s.name}`).toBe(t.pitch);
  });
  it('every pinned tone but the two the rounded table moves plays at the port\'s note2Pitch word', () => {
    const { sounds } = pin<{ sounds: SoundDigest[] }>('bank-digests.json');
    expect(sounds.length).toBe(12);
    const moved: string[] = [];
    for (const s of sounds) for (const t of s.tones) {
      const port = note2Pitch(t.centerNote, t.centerFine, 60, 0);
      if (port !== t.pitch) { moved.push(s.name); expect(port - t.pitch).toBe(1); }
    }
    expect(moved).toEqual(['.M4A1', '.DINK']);
  });
  it('the walk\'s tones play at the rates research 81 §2 names (16 kHz step, 22.05 kHz crack, 44.1 kHz reload), within 0.2 %', () => {
    const { sounds } = pin<{ sounds: SoundDigest[] }>('bank-digests.json');
    const rate = (name: string): number[] => sounds.find((s) => s.name === name)!.tones.map((t) => (t.pitch / 0x1000) * OUTPUT_RATE);
    for (const r of rate('.STEP_STONE')) expect(Math.abs(r / 16_000 - 1)).toBeLessThan(0.002);
    for (const r of rate('.BONE_BRK_1')) expect(Math.abs(r / 22_050 - 1)).toBeLessThan(0.002);
    for (const r of rate('.M4A1_SIL_RLD')) expect(Math.abs(r / 44_100 - 1)).toBeLessThan(0.002);
    // research 81 §2: .STEP_STONE is ten takes of one footfall; .M4A1_SIL two tones at once, a crack (vol 120) and a body.
    expect(sounds.find((s) => s.name === '.STEP_STONE')!.tones.length).toBe(10);
    expect(sounds.find((s) => s.name === '.M4A1_SIL')!.tones.map((t) => t.vol)).toEqual([120, 80]);
    expect(sounds.find((s) => s.name === '.M4A1_SIL')!.vol).toBe(80);
    expect(sounds.find((s) => s.name === '.JUMP_WHOOSH')!.vol).toBe(28);
    expect(sounds.find((s) => s.name === '.STEP_STONE')!.vol).toBe(107);
    // The steps, shots and landings end (bit 0 without bit 1): no sample of theirs loops.
    for (const s of sounds) for (const t of s.tones) expect(t.sample.loops, s.name).toBe(false);
  });
});

const store = fixture('RUN/SOUNDS/BNKSTORE.ZAR');
const libsd = fixture('RUN/IRX/LIBSD.IRX');

/** The sounds whose decode and render are pinned: the walk's, the rifle's, three of the menus'. */
const DIGESTED: readonly [string, string, number][] = [
  ['MP2_am.bnk', '.STEP_STONE', 7], ['MP2_am.bnk', '.STEALTH_STONE', 7], ['MP2_am.bnk', '.STONE_JUMP', 3], ['MP2_am.bnk', '.JUMP_WHOOSH', 1],
  ['MP2_am.bnk', '.BONE_BRK_1', 1], ['MP2_am.bnk', '.STEP_METAL', 7], ['MP2_fx.bnk', '.M4A1_SIL', 1], ['MP2_fx.bnk', '.M4A1_SIL_RLD', 1],
  ['MP2_fx.bnk', '.M4A1', 2], ['HUDUI.bnk', '.DINK', 1], ['HUDUI.bnk', '.METAL', 1], ['HUDUI.bnk', '.TYPE', 1],
];

/**
 * The pitch word the original gives a tone at note 60: `note2Pitch`'s PS1 rule (a centre note >= 0 is scaled by
 * 44100 / 48000) over Sony's `sceSdNote2Pitch` with the disc's table (the pinned `libsd-note-pitch.json`).
 */
function discPitch(centerNote: number, centerFine: number): number {
  const { table } = pin<PitchTablePin>('libsd-note-pitch.json');
  const ps1 = centerNote >= 0;
  const p = note2PitchWith(table, ps1 ? centerNote : -centerNote, centerFine & 0xff, 60, 0);
  return ps1 ? Math.trunc((44_100 * p) / 48_000) : p;
}

function digest(bank: SoundBank, file: string, name: string, seed: number): SoundDigest {
  const index = bank.names.get(name)!;
  const s = bank.sounds[index]!;
  const tones = s.grains.map((g) => bankTone(bank, g)).filter((t) => t !== null).map((t): ToneDigest => {
    const v = decodeVag(bank.vag, t.sampleOffset);
    return {
      vol: t.vol, centerNote: t.centerNote, centerFine: t.centerFine, pan: t.pan, adsr1: t.adsr1, adsr2: t.adsr2, flags: t.flags,
      sampleOffset: t.sampleOffset, pitch: discPitch(t.centerNote, t.centerFine),
      sample: { samples: v.pcm.length, loops: v.loops, loopStart: v.loopStart, bytes: v.bytes, sha256: sha256(v.pcm) },
    };
  });
  const r = renderSound(bank, index, new SampleCache(bank.vag), { random: seeded(seed) });
  const both = new Float32Array(r.left.length * 2);
  both.set(r.left); both.set(r.right, r.left.length);
  return {
    bank: file, name, index, vol: s.vol, volGroup: s.volGroup, pan: s.pan, grainTypes: s.grains.map((g) => g.type), tones,
    render: { seed, frames: r.left.length, voices: r.voices, samples: r.samples, peak: r.peak, sha256: sha256(both) },
  };
}

describe.skipIf(!store)('the bank digests re-derived from BNKSTORE.ZAR (fixture)', () => {
  it('decodes and renders the pinned sounds to the pinned digests (bank-digests.json)', () => {
    const zar = Zar.parse(store!);
    const banks = new Map<string, SoundBank>();
    const bank = (file: string): SoundBank => { let b = banks.get(file); if (!b) banks.set(file, b = parseBankFile(zar.data(zar.find(file)!))); return b; };
    const sounds = DIGESTED.map(([file, name, seed]) => digest(bank(file), file, name, seed));
    matchPin('bank-digests.json', 'disc RUN/SOUNDS/BNKSTORE.ZAR (MP2_am.bnk, MP2_fx.bnk, HUDUI.bnk) through parseBankFile, bankTone, decodeVag and renderSound (seeded); pitch: sceSdNote2Pitch with the LIBSD.IRX table (libsd-note-pitch.json) at note 60; sha256 over the Int16 PCM / the Float32 left then right; 2026-10-02', { sounds });
  });
});

describe.skipIf(!libsd)('LIBSD.IRX\'s note table re-derived (fixture)', () => {
  it('finds the 140-entry table (0x8000 0x879c 0x8fac ...) and it is the pinned one (libsd-note-pitch.json)', () => {
    const v = new DataView(libsd!.buffer, libsd!.byteOffset, libsd!.byteLength);
    const at: number[] = [];
    for (let i = 0; i + 6 <= libsd!.byteLength; i += 2) {
      if (v.getUint16(i, true) === 0x8000 && v.getUint16(i + 2, true) === 0x879c && v.getUint16(i + 4, true) === 0x8fac) at.push(i);
    }
    expect(at.length).toBe(1);
    const table = Array.from({ length: 140 }, (_, k) => v.getUint16(at[0]! + 2 * k, true));
    matchPin('libsd-note-pitch.json', 'disc RUN/IRX/LIBSD.IRX: sceSdNote2Pitch\'s note table (12 semitone ratios, 128 fine steps, u16 little-endian), found by its first three words; 2026-10-02', { offset: at[0]!, table });
  });
});
