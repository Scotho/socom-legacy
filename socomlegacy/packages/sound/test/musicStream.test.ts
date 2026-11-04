import { describe, expect, it } from 'vitest';
import type { RdrNode } from '@s2u/archive';
import { groupStage, makeVolume, voiceLevel } from '../src/render';
import { parseStreamEntries, soundHash, streamFile } from '../src/script';
import { frontEndSoundTable } from '../src/uiSounds';
import { decodeVag } from '../src/vag';
import { decodeVpk } from '../src/vpk';
import {
  autoVolSteps, bankGroupOf, bankModifier, BANK_GROUP_READING, DIALOG_VOLUME_DEFAULT, FADE_ALL_TICKS, GROUP_MASTER_READING, groupMasterOf, groupModifier, TUNER_DEFAULTS, VOL_NUM_GROUPS, SLOT_FADE_TICKS, MUSIC_GROUP, MUSIC_VOLUME_DEFAULT, roundStreamGains, streamGroupVolume, STREAM_FLAG_LOOP, STREAM_FLAG_QUEUED, VpkStreamReader, mixStreamBuffer,
  streamFadeCurve, streamGroupMaster, streamGroupModifier, streamMember, streamPlayVolume7, streamVoiceGains,
  vagStreamFlags, vagStreamGroup, vagStreamLoc, vagStreamPlayWords,
} from '../src/musicStream';

/**
 * The front end's music as 989snd is handed it (MENU-MUSIC, PLAT-22's front-end half; web research 152), against the
 * transcription: the stream play's eight words (`FUN_00342240` -> `FUN_0033f580`, the stack words read off the ELF at
 * 0x3425e0-0x34261c), the music group's master from `MUSIC_VOLUME` (`FUN_0038a040` -> `FUN_003414d0`), the square-law
 * group stage (989snd `vol.c` 434-455), the VPK read a buffer at a time with the ADPCM history carried, and the loop
 * (flags 4). Synthetic tables and a synthetic VPK only: no disc file is read here.
 */
const h = (name: string): string => String(soundHash(name));

/** `sounds.rdr`'s SMUS entries in the disc's shape for the menus' music: `MUS` and `LOOP` inside `ST` (research 122 §13). */
const SCRIPT: RdrNode = ['SETS', [
  'HUDUI', [[h('.DINK'), 'ONESHOT', []]],
  'SMUS', [
    [h('MUS_MENU_THEME'), 'ST', ['N1', ['MUUI0001'], 'LOOP', [], 'MUS', []]],
    [h('MUS_ONLINE_MENU'), 'ST', ['N1', ['MUUI0003'], 'LOOP', [], 'MUS', []]],
    [h('MUS_MP_SEAL_INTRO_4'), 'ST', ['N1', ['MUMP0004']], 'MUS', []],
  ],
  'UIVOICE', [[h('^M51_140'), 'ST', ['N1', ['M51_140']]]],
]];

describe('the menus\' music names (FUN_00344f30, FUN_003435c0, FUN_00342240)', () => {
  const table = frontEndSoundTable(SCRIPT, new Map());

  it('MUS_MENU_THEME and MUS_ONLINE_MENU resolve by CRC-32 to SMUS streams of the MUS class, looped, named "%s.VPK"', () => {
    for (const [name, member] of [['MUS_MENU_THEME', 'MUUI0001.VPK'], ['MUS_ONLINE_MENU', 'MUUI0003.VPK']] as const) {
      const r = table.resolve(name);
      expect(r.kind, name).toBe('stream');
      if (r.kind !== 'stream') continue;
      expect([r.object.block, r.object.music, r.object.loop, r.object.headset], name).toEqual(['SMUS', true, true, false]);
      expect(streamMember(r.object), name).toBe(member);
    }
    // A voice line is not of the class: "%s.VAG" (ELF 0x3f76f0).
    const v = table.resolve('^M51_140');
    expect(v.kind === 'stream' ? streamMember(v.object) : null).toBe('M51_140.VAG');
  });

  it('parseStreamEntries finds MUS inside ST too (the depth-first key search, D:L230210-230299): the drift research 122 §13 left to PLAT-22', () => {
    const e = parseStreamEntries(SCRIPT);
    const theme = e.get('SMUS')?.get(soundHash('MUS_MENU_THEME'));
    expect([theme?.music, theme?.loop]).toEqual([true, true]);
    expect(streamFile(theme!)).toBe('MUUI0001.VPK');
    expect(streamFile(e.get('SMUS')!.get(soundHash('MUS_MP_SEAL_INTRO_4'))!)).toBe('MUMP0004.VPK');
    expect(streamFile(e.get('UIVOICE')!.get(soundHash('^M51_140'))!)).toBe('M51_140.VAG');
  });
});

describe('snd_PlayVAGStreamByLoc\'s eight words (FUN_00342240 -> FUN_0033f580, fno 0x2c)', () => {
  const music = { music: true, efx: false, hq: false, headset: false, loop: true };

  it('the location: the archive\'s first sector plus the member\'s offset >> 11, and its low 11 bits (FUN_0034d470, D:L241832-241839)', () => {
    expect(vagStreamLoc(0xee801, 551532544)).toEqual({ sector: 0x1303f8, offset: 0 });
    expect(vagStreamLoc(10, 0x1234)).toEqual({ sector: 12, offset: 0x234 });
  });

  it('MUS_ONLINE_MENU at the command\'s 1.0 and pan -1 is the recomp log\'s line word for word: [0x1303f8, 0, 0x04000000, 0xffff0000, 1, 0, 0, 4]', () => {
    expect(vagStreamPlayWords(music, 0x400, -1, { sector: 0x1303f8, offset: 0 })).toEqual([0x1303f8, 0, 0x04000000, 0xffff0000, 1, 0, 0, 4]);
  });

  it('the group: the MUS class 1, else HQ 6, else an ST entry of neither class 2, a STREAMING_EFX one 0 (ELF 0x3424f8-0x342544)', () => {
    expect(MUSIC_GROUP).toBe(1);
    expect(vagStreamGroup(music)).toBe(1);
    expect(vagStreamGroup({ ...music, music: false, hq: true })).toBe(6);
    expect(vagStreamGroup({ ...music, music: false })).toBe(2);
    expect(vagStreamGroup({ ...music, music: false, efx: true })).toBe(0);
  });

  it('the flags: 4 for LOOP (+0x1d bit 1, ELF 0x342548-0x34255c), 2 when queued and not HS (0x342560-0x34257c); the menus\' plays are never queued', () => {
    expect([STREAM_FLAG_LOOP, STREAM_FLAG_QUEUED]).toEqual([4, 2]);
    expect(vagStreamFlags(music)).toBe(4);
    expect(vagStreamFlags({ ...music, loop: false })).toBe(0);
    expect(vagStreamFlags(music, true)).toBe(6);
    expect(vagStreamFlags({ ...music, headset: true }, true)).toBe(4);
    // A second stem and an offset in the low half-word; the volume and the pan in the high one.
    expect(vagStreamPlayWords({ ...music, loop: false }, 0x200, 90, { sector: 5, offset: 0x10 }, { sector: 9, offset: 0x20 }))
      .toEqual([5, 9, (0x200 << 16 | 0x10) >>> 0, (90 << 16 | 0x20) >>> 0, 1, 0, 0, 0]);
  });
});

describe('the level: the music group\'s master, the play\'s volume and pan, the square-law group stage', () => {
  it('MUSIC_VOLUME 0.74 (InitSystemTuners, D:L282287) is the music group\'s master 0x2f5 (FUN_0038a040 -> FUN_003414d0): the log\'s SetMasterVolume [1, 0x2f5]', () => {
    expect(MUSIC_VOLUME_DEFAULT).toBe(Math.fround(0.74));
    expect(streamGroupMaster(MUSIC_VOLUME_DEFAULT)).toBe(0x2f5);
    expect(streamGroupMaster(1)).toBe(0x400);
    expect(streamGroupMaster(0)).toBe(0);
    expect(streamGroupModifier(0x2f5)).toBe(0x2f5);
    expect(streamGroupModifier(0x400, 0x200)).toBe(0x200);
  });

  it('the play\'s volume word to the handle\'s 7-bit volume: 0x400 is 127, 0x200 63, clamped', () => {
    expect([0x400, 0x200, 0, 0x800, -5].map(streamPlayVolume7)).toEqual([127, 63, 0, 127, 0]);
  });

  it('a stereo VPK at pan -1 is the voice pair: the left data hard left, the right data hard right, each at the group stage\'s level', () => {
    const full = streamVoiceGains(0x400, -1, 2, 0x400);
    expect(full.left[0]).toBeCloseTo(16383 / 0x7ffe, 12);
    expect([full.left[1], full.right[0]]).toEqual([0, 0]);
    expect(full.right[1]).toBe(full.left[0]);
    const menus = streamVoiceGains(0x400, -1, 2, streamGroupModifier(streamGroupMaster(MUSIC_VOLUME_DEFAULT)));
    expect(menus.left[0]).toBeCloseTo(8952 / 0x7ffe, 12);
    // The transcription: makeVolume(127, 0, vol7, pan + 270, 127, 0) then voiceLevel, over 0x7ffe.
    const [l, r] = makeVolume(127, 0, 63, 90 + 270, 127, 0);
    const g = streamVoiceGains(0x200, 90, 2, 0x300);
    expect(g.left).toEqual([voiceLevel(l, 0x300) / 0x7ffe, voiceLevel(r, 0x300) / 0x7ffe]);
    expect(g.right).toEqual([g.left[1], g.left[0]]);
  });

  it('the group stage is a square law: half the master is a quarter of the level, not a half', () => {
    const one = streamVoiceGains(0x400, -1, 2, 0x400).left[0], half = streamVoiceGains(0x400, -1, 2, 0x200).left[0];
    expect(half / one).toBeCloseTo(0.25, 3);
  });

  it('a mono stream keeps the centre pair in both outputs', () => {
    const g = streamVoiceGains(0x400, -1, 1, 0x400);
    const [l, r] = makeVolume(127, 0, 127, 0, 127, 0);
    expect(g.left).toEqual([voiceLevel(l) / 0x7ffe, voiceLevel(r) / 0x7ffe]);
    expect(g.right).toEqual([0, 0]);
  });

  it("a round stream's level is its group's: a line 0.24995 a side (group 2, DIALOG), the music 0.27321 a channel (group 1, MUSIC 0.74)", () => {
    // Research 186 §3.1 STREAM_LEVEL (STRONG): the tuners' groups (MUSIC 1; DIALOG 2 and 6; SOUND 0, 3, 4, 5, 14;
    // HEADSET 7) at InitSystemTuners' defaults, the play at 0x400 and pan -1 (`streamVoiceGains`).
    expect(DIALOG_VOLUME_DEFAULT).toBe(1);
    expect([0, 1, 2, 3, 4, 5, 6, 7, 14].map((g) => streamGroupVolume(g))).toEqual([1, MUSIC_VOLUME_DEFAULT, 1, 1, 1, 1, 1, 0.75, 1]);
    // The line: register 8190 / 0x7ffe through the stream path's pan table (FUN_00019578 -> 989SND.IRX 0x1c600, entry
    // 90 = 11584): 32766 x 11584 / 16383 = 23168, squared / 0x7ffe = 16381, halved 8190.
    const line = roundStreamGains(2, 1);
    expect(line.left[0]).toBe(8190 / 0x7ffe);
    expect(line.left[1]).toBe(8190 / 0x7ffe);
    expect(line.left[0]).toBeCloseTo(0.24995, 5);
    expect(line.right).toEqual([0, 0]);
    const music = roundStreamGains(MUSIC_GROUP, 2);
    expect(music.left[0]).toBeCloseTo(0.27321, 5);
    expect(music.left[1]).toBe(0);
    expect(music.right[0]).toBe(0);
    expect(music.right[1]).toBeCloseTo(0.27321, 5);
  });

  it("the option masters by group (tuner_groups.py; FUN_0038a040 -> FUN_003414d0): SOUND_VOLUME drives 0, 3, 4, 5 and 14, MUSIC_VOLUME 1, DIALOG_VOLUME 2 and 6, HEADSET_CONTROLLER 7, each trunc(v x 1024) under the square law; at the defaults a round line is 0.24995 a side and the music 0.27321 a channel; DIALOG 0.5 lowers the line and not the music", () => {
    // Research 186 §3.1 STREAM_LEVEL and §5 (the tuners' update functions disassembled; Harry62's saved-masters table
    // r0004 0x491190 agrees), research 233 §1: each tuner is `SetMasterVolume(g, trunc(v x 1024))` on its groups.
    expect(GROUP_MASTER_READING).toEqual({ sound: [0, 3, 4, 5, 14], music: [1], dialog: [2, 6], headset: [7] });
    const t = { sound: 0.9, music: 0.8, dialog: 0.7, headset: 0.6 };
    const word = (v: number): number => Math.trunc(Math.fround(Math.fround(v) * 1024));
    const want = (g: number): number =>
      [0, 3, 4, 5, 14].includes(g) ? word(0.9) : g === 1 ? word(0.8) : g === 2 || g === 6 ? word(0.7) : g === 7 ? word(0.6) : 0x400;
    for (let g = 0; g < 16; g++) expect(groupMasterOf(g, t), `group ${g}`).toBe(want(g));
    expect([word(0.9), word(0.8), word(0.7), word(0.6)]).toEqual([921, 819, 716, 614]);
    // At the defaults nothing moves: the line's 8190 and the music's 0.27321 (research 186 §3.1).
    const line = roundStreamGains(2, 1, TUNER_DEFAULTS), music = roundStreamGains(MUSIC_GROUP, 2, TUNER_DEFAULTS);
    expect(line.left[0]).toBe(8190 / 0x7ffe);
    expect(music.left[0]).toBeCloseTo(0.27321, 5);
    // DIALOG 0.5: the line's master 512 enters before the square (989snd vol.c 446-454): 23168 x 512 / 1024 = 11584,
    // squared / 0x7ffe = 4095, halved 2047 -- a quarter of the level for half the master. The music (group 1) stays.
    const half = { ...TUNER_DEFAULTS, dialog: 0.5 };
    expect(groupMasterOf(2, half)).toBe(512);
    expect(roundStreamGains(2, 1, half).left).toEqual([2047 / 0x7ffe, 2047 / 0x7ffe]);
    expect(roundStreamGains(6, 1, half).left[0]).toBe(2047 / 0x7ffe);
    expect(roundStreamGains(MUSIC_GROUP, 2, half)).toEqual(music);
    // SOUND 0.5 moves groups 0, 3, 4, 5 and 14 alike and leaves the lines (2) and the music (1).
    const sound = { ...TUNER_DEFAULTS, sound: 0.5 };
    for (const g of [0, 3, 4, 5, 14]) expect(roundStreamGains(g, 1, sound).left[0], `group ${g}`).toBe(2047 / 0x7ffe);
    expect(roundStreamGains(2, 1, sound)).toEqual(line);
    expect(roundStreamGains(7, 1, { ...TUNER_DEFAULTS, headset: 0.5 }).left[0]).toBe(2047 / 0x7ffe);
  });

  it("a group past 989snd's 15 (VOL_NUM_GROUPS, vol.h) takes no master and no square law: a bank sound in groups 15-31 is its voice volume halved, whatever the options (snd_AdjustVolToGroup vol.c 439-441)", () => {
    // Research 233 s1.2: `if (group >= VOL_NUM_GROUPS) return vol;` -- the IRX's own early return for a group over 0xe --
    // then the voice's `>> 1` (valloc.c 304-306). A negative VolGroup (a signed byte) takes BANK_GROUP_READING.
    expect(VOL_NUM_GROUPS).toBe(15);
    expect([bankGroupOf(14), bankGroupOf(15), bankGroupOf(31), bankGroupOf(-3), bankGroupOf(undefined)]).toEqual([14, 15, 31, BANK_GROUP_READING, BANK_GROUP_READING]);
    const half = { sound: 0.5, music: 0.5, dialog: 0.5, headset: 0.5 };
    for (let g = 0; g < 15; g++) expect(bankModifier(g, half), `group ${g}`).toBe(groupModifier(g, half));
    for (const g of [15, 20, 31]) expect(bankModifier(g, half), `group ${g}`).toBeNull();
    expect(groupStage(23168, 0x400)).toBe(voiceLevel(23168));                   // 8190: the square at full master
    expect(groupStage(23168, 0x200)).toBe(2047);
    expect(groupStage(23168, null)).toBe(11584);                                // no group stage: halved only
  });

  it('mixes a decoded buffer through the pair', () => {
    const out = mixStreamBuffer(Float32Array.of(1, 0.5), Float32Array.of(0.25, -1), { left: [0.5, 0.25], right: [0.125, 1] });
    expect([...out.left]).toEqual([0.5 + 0.25 * 0.125, 0.25 - 0.125]);
    expect([...out.right]).toEqual([0.25 + 0.25, 0.125 - 1]);
  });

  it("FadeAllSounds' AutoVol (360 ticks, FUN_00346c30) steps the 7-bit volume 1 every 2 ticks: 0 at tick 254 (1.058 s)", () => {
    // Research 186 §3.1 AUTOVOL (a reading, pending review; V4 #24): |dv| 127 < 360 ticks, so a step of 1 every trunc(360 / 127) = 2 ticks
    // (989snd's autovol.c; the IRX's FUN_000038b4), the counter decremented and then the step at 0.
    expect(FADE_ALL_TICKS).toBe(360);
    const v = autoVolSteps(127, 0, FADE_ALL_TICKS);
    expect(v.length).toBe(FADE_ALL_TICKS + 1);
    expect([v[0], v[1], v[2], v[60], v[120], v[240], v[253], v[254], v[360]]).toEqual([127, 127, 126, 97, 67, 7, 1, 0, 0]);
    const c = streamFadeCurve(0x400, 0x400, FADE_ALL_TICKS);
    expect(c.length).toBe(FADE_ALL_TICKS + 1);
    expect(c[0]).toBe(1);
    expect(c[253]!).toBeGreaterThan(0);
    expect(c[254]).toBe(0);
    for (let i = 1; i < c.length; i++) expect(c[i]!).toBeLessThanOrEqual(c[i - 1]!);
  });

  it("the slot's FadeOut(2.0) (FUN_00346dd0: 480 ticks) is silent at tick 381 (1.588 s); a fade faster than a step a tick moves by 32nds", () => {
    expect(SLOT_FADE_TICKS).toBe(480);
    const v = autoVolSteps(127, 0, SLOT_FADE_TICKS);
    expect([v[60], v[120], v[240], v[380], v[381]]).toEqual([107, 87, 47, 1, 0]);
    // |dv| >= ticks: each tick (32 cur + trunc(32 dv / ticks)) >> 5, clamped at the target (autovol_sim.py's port).
    const fast = autoVolSteps(127, 0, 60);
    expect(fast.slice(0, 4)).toEqual([127, 124, 121, 118]);
    expect(fast.at(-1)).toBe(0);
    expect(autoVolSteps(0, 127, 60).slice(0, 3)).toEqual([0, 2, 4]);
  });
});

/** A synthetic VPK: the header, then `buffers` of `buffer` bytes, each the left channel's half then the right's. */
function vpk(channelBytes: number, buffer: number, lastFlag = 0): { bytes: Uint8Array; left: Uint8Array; right: Uint8Array } {
  const head = 0x30, stride = buffer / 2, n = Math.ceil(channelBytes / stride);
  const bytes = new Uint8Array(head + n * buffer), v = new DataView(bytes.buffer);
  bytes.set([0x20, 0x4b, 0x50, 0x56]);
  v.setUint32(4, channelBytes, true); v.setUint32(8, head, true); v.setUint32(12, buffer, true);
  v.setUint32(16, 32000, true); v.setUint32(20, 2, true);
  v.setInt8(0x18, 127); v.setInt16(0x1a, 270, true); v.setInt8(0x1c, 127); v.setInt16(0x1e, 90, true);
  let seed = 7;
  const rnd = (): number => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed >>> 16; };
  const channel = (): Uint8Array => {
    const c = new Uint8Array(channelBytes);
    for (let b = 0; b < channelBytes; b += 16) {
      c[b] = (rnd() % 13) | ((rnd() % 5) << 4);
      c[b + 1] = b + 16 >= channelBytes ? lastFlag : 0;
      for (let i = 2; i < 16; i++) c[b + i] = rnd() & 0xff;
    }
    return c;
  };
  const left = channel(), right = channel();
  for (let k = 0; k < n; k++) {
    const at = k * stride, m = Math.min(stride, channelBytes - at);
    bytes.set(left.subarray(at, at + m), head + k * buffer);
    bytes.set(right.subarray(at, at + m), head + k * buffer + stride);
  }
  return { bytes, left, right };
}

/** A reader over the bytes, every range it was asked for kept. */
function ranged(bytes: Uint8Array): { read: (offset: number, length: number) => Promise<Uint8Array>; reads: [number, number][] } {
  const reads: [number, number][] = [];
  return {
    reads,
    read: async (offset, length) => {
      if (offset < 0 || offset + length > bytes.length) throw new Error(`past the end: ${offset}+${length}`);
      reads.push([offset, length]);
      return bytes.slice(offset, offset + length);
    },
  };
}
const concat = (parts: Float32Array[]): Float32Array => {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};

describe('the VPK read by range, a buffer at a time (PLAT-22\'s ranged streaming)', () => {
  it('decodes buffer by buffer, the ADPCM history carried, sample-exact against the whole member\'s decode; never reads more than a buffer at once', async () => {
    const f = vpk(16 * 13, 64, 1);                      // 13 blocks a channel: 6 buffers, the last a short one
    const src = ranged(f.bytes);
    const r = new VpkStreamReader(src.read, f.bytes.length, { loop: false });
    const h = await r.open();
    expect([h.channels, h.bufferBytes, h.sampleRate]).toEqual([2, 64, 32000]);
    const lefts: Float32Array[] = [], rights: Float32Array[] = [];
    for (let b = await r.next(); b; b = await r.next()) { lefts.push(b.left); rights.push(b.right); expect(b.wrapped).toBe(false); }
    expect(lefts.length).toBe(7);
    const whole = decodeVpk(f.bytes);
    expect(concat(lefts)).toEqual(whole.left);
    expect(concat(rights)).toEqual(whole.right);
    expect(Math.max(...src.reads.map(([, n]) => n))).toBeLessThanOrEqual(64);
    expect(await r.next()).toBeNull();
  });

  it('loops as flags 4 asks: past the last buffer it starts again at the data\'s top, the history carried, and says it wrapped', async () => {
    const f = vpk(16 * 6, 64);                          // no end flag: the doubled run decodes straight through
    const r = new VpkStreamReader(ranged(f.bytes).read, f.bytes.length, { loop: true });
    await r.open();
    const lefts: Float32Array[] = [], wraps: boolean[] = [];
    for (let i = 0; i < 6; i++) { const b = (await r.next())!; lefts.push(b.left); wraps.push(b.wrapped); }
    expect(wraps).toEqual([false, false, false, true, false, false]);
    expect(r.passes).toBe(2);
    const twice = new Uint8Array(f.left.length * 2);
    twice.set(f.left); twice.set(f.left, f.left.length);
    const pcm = decodeVag(twice).pcm, expected = Float32Array.from(pcm, (s) => s / 32768);
    expect(concat(lefts)).toEqual(expected);
  });

  it('a range the reader cannot read is its error, not a silent stop; a bad header is refused', async () => {
    const f = vpk(16 * 4, 64);
    const short = new VpkStreamReader(ranged(f.bytes.slice(0, 0x30 + 64)).read, f.bytes.length, { loop: false });
    await short.open();
    await short.next();
    await expect(short.next()).rejects.toThrow(/past the end/);
    const bad = f.bytes.slice();
    bad[0] = 0;
    await expect(new VpkStreamReader(ranged(bad).read, bad.length, { loop: false }).open()).rejects.toThrow(/magic/);
  });
});
