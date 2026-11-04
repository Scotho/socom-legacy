import { describe, expect, it } from 'vitest';
import { closeSync, existsSync, openSync, readFileSync, readSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseRdr, Zar, ZAR_HEAD, zarIndexLength, type ZarKey } from '@s2u/archive';
import { missionSoundBlocks, parseStreamEntries, streamFile, streamFor } from '../src/script';
import { decodeVpk, parseVpkHeader } from '../src/vpk';
import { decodeVagStream } from '../src/vagStream';

/**
 * Research 124 on the dev disc (W6.R8: `SOCOM_DISC`, the disc's `RUN` tree): the round's cue names resolve through
 * `sounds.rdr` to their VAGSTORE members, and the members decode -- names, sizes and counts asserted, never a sample
 * value. VAGSTORE (577 MB) is read by range here, its index and the members only. Skips without the disc, as on CI.
 */
const DISC = process.env.SOCOM_DISC;
const VAGSTORE = DISC ? resolve(DISC, 'RUN/SOUNDS/VAGSTORE.ZAR') : '';
const SCRIPT = DISC ? resolve(DISC, 'RUN/SOUNDRDR.ZAR') : '';
const HAVE = !!DISC && existsSync(VAGSTORE) && existsSync(SCRIPT);

/** VAGSTORE's index, then each named member's bytes by range, matched without case (`streamFile`'s rule). */
function vagstore(): { names: string[]; read: (name: string) => Uint8Array; keys: ZarKey[]; close: () => void } {
  const fd = openSync(VAGSTORE, 'r');
  const range = (at: number, n: number): Uint8Array => { const b = new Uint8Array(n); readSync(fd, b, 0, n, at); return b; };
  const zar = Zar.parse(range(0, zarIndexLength(range(0, ZAR_HEAD))));
  const keys = zar.root.children;
  return {
    names: keys.map((k) => k.name), keys,
    read: (name) => {
      const k = keys.find((x) => x.name.toUpperCase() === name.toUpperCase());
      if (!k) throw new Error(`no ${name}`);
      return range(zar.dataOffset + k.offset, k.size);
    },
    close: () => closeSync(fd),
  };
}

describe.skipIf(!HAVE)('the round\'s streams on the dev disc (SOCOM_DISC; research 124)', () => {
  const entries = (): ReturnType<typeof parseStreamEntries> => {
    const zar = Zar.parse(new Uint8Array(readFileSync(SCRIPT)));
    const key = zar.root.children.find((k) => k.name.toLowerCase() === 'sounds.rdr');
    if (!key) throw new Error('no sounds.rdr');
    return parseStreamEntries(parseRdr(zar.data(key)));
  };

  it('resolves the cue names through the blocks a multiplayer map loads', () => {
    const e = entries(), blocks = missionSoundBlocks('MP2');
    const file = (name: string): string | null => { const s = streamFor(e, blocks, name); return s ? streamFile(s) : null; };
    expect(file('MUS_MP_SEAL_INTRO_4')).toBe('MUMP0004.VPK');
    expect(file('MUS_MP_TERR_INTRO_4')).toBe('MUMP0009.VPK');
    expect(file('MUS_MP_SEAL_WIN_RUS')).toBe('MUMP0019.VPK');
    expect(file('MUS_MP_TERR_WIN_RUS')).toBe('MUMP0020.VPK');
    expect(file('MUS_MP_SEAL_WIN_ALB')).toBe('MUMP0013.VPK');
    expect(file('^PH_0014')).toBe('PH_0014.VAG');
    expect(file('^PH_0002')).toBe('PH_0002.VAG');
    expect(streamFor(e, blocks, '^PH_0014')?.block).toBe('MULTI');
    expect(streamFor(e, blocks, 'MUS_MP_SEAL_INTRO_4')?.block).toBe('SMUS');
    // The SMUS block: 212 entries, all ST (research 122 R122.8); none of the round's cues loops.
    expect(e.get('SMUS')?.size).toBe(212);
    for (const n of ['MUS_MP_SEAL_INTRO_4', 'MUS_MP_TERR_INTRO_4', 'MUS_MP_SEAL_WIN_RUS', 'MUS_MP_TERR_WIN_RUS']) expect(streamFor(e, blocks, n)?.loop).toBe(false);
  });

  it('every VPK of VAGSTORE is two channels at 32 kHz in 0xb000 buffers from 0x800, its size exactly that', () => {
    const s = vagstore();
    try {
      const vpks = s.keys.filter((k) => /\.vpk$/i.test(k.name));
      expect(vpks.length).toBe(210);
      for (const k of vpks) {
        const h = parseVpkHeader(s.read(k.name).subarray(0, 0x30));
        expect([h.dataOffset, h.bufferBytes, h.sampleRate, h.channels]).toEqual([0x800, 0xb000, 32000, 2]);
        expect(h.volPan.map((p) => p.pan)).toEqual([270, 90]);
        expect(k.size).toBe(h.dataOffset + Math.ceil(h.channelBytes / (h.bufferBytes / 2)) * h.bufferBytes);
      }
    } finally { s.close(); }
  }, 120_000);

  it('decodes the Frostfire cues whole: each channel size / 16 x 28 samples, and the two result lines to their end flag', () => {
    const s = vagstore();
    try {
      for (const n of ['MUMP0004.VPK', 'MUMP0009.VPK', 'MUMP0019.VPK', 'MUMP0020.VPK']) {
        const bytes = s.read(n), h = parseVpkHeader(bytes), r = decodeVpk(bytes);
        expect(r.left.length).toBe((h.channelBytes / 16) * 28);
        expect(r.right.length).toBe(r.left.length);
        expect(r.peak).toBeGreaterThan(0);
      }
      const ph14 = decodeVagStream(s.read('PH_0014.VAG')), ph02 = decodeVagStream(s.read('PH_0002.VAG'));
      expect([ph14.sampleRate, ph14.left.length]).toEqual([22050, (17264 / 16 + 1) * 28]);
      expect([ph02.sampleRate, ph02.left.length]).toEqual([22050, (13440 / 16 + 1) * 28]);
    } finally { s.close(); }
  }, 120_000);
});
