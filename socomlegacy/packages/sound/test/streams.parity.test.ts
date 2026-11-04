// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, openSync, readFileSync, readSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRdr, Zar, ZAR_HEAD, zarIndexLength, type RdrNode } from '@s2u/archive';
import { fixture } from '../../archive/test/fixtures';
import { missionSoundBlocks, parseStreamEntries, soundHash, streamFile, streamFor } from '../src/script';
import { decodeVpk, parseVpkHeader } from '../src/vpk';
import { decodeVagStream, VAGP_HEADER_BYTES } from '../src/vagStream';

/**
 * Parity pins for the round's streams (TA-SOUND; research 124 §1-§3): which `VAGSTORE.ZAR` member each cue the 22 maps'
 * `objectives` scripts name streams from (`sounds.rdr`'s `ST` entries: the `MUS` class a VPK, any other a VAGp), and what
 * those members hold -- the VPK and VAGp headers and a digest of the decoded PCM. Two halves (TA.R3): **unit**, the pins
 * driving the resolver (`parseStreamEntries`, `streamFor`, `streamFile`, `soundHash`) and the header claims of the note,
 * with no game data; **fixture** (`RUN/SOUNDRDR.ZAR`) and **disc** (`SOCOM_DISC`'s `RUN/SOUNDS/VAGSTORE.ZAR`, read by
 * range), the pins re-derived and compared whole (skip without them). `S2U_UPDATE_GOLDEN=1` rewrites the pins.
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
function matchPin(name: string, source: string, derived: Record<string, unknown>): void {
  if (process.env.S2U_UPDATE_GOLDEN === '1') writeFileSync(GOLDEN(name), formatPin({ _source: source, ...derived }));
  const { _source, ...pinned } = pin<Record<string, unknown>>(name);
  expect(_source).toBe(source);
  expect(pinned).toEqual(derived);
}
const sha256 = (a: ArrayBufferView): string => createHash('sha256').update(new Uint8Array(a.buffer, a.byteOffset, a.byteLength)).digest('hex');

/** Every stream name the 22 maps' `objectives` scripts play (research 124 §5's table). */
const SIDES = ['SEAL', 'TERR'] as const;
const CUE_NAMES: readonly string[] = [
  ...SIDES.flatMap((s) => [1, 2, 3, 4, 5].map((n) => `MUS_MP_${s}_INTRO_${n}`)),
  ...SIDES.flatMap((s) => ['RUS', 'BRA', 'ALG', 'ALB'].map((c) => `MUS_MP_${s}_WIN_${c}`)),
  '^PH_0014', '^PH_0002',
];

interface CueRow { name: string; hash: number; block: string; n1: string; music: boolean; loop: boolean; efx: boolean; file: string }
interface VpkDigest {
  file: string; size: number; channelBytes: number; dataOffset: number; bufferBytes: number; sampleRate: number; channels: number;
  volPan: { vol: number; group: number; pan: number }[]; samples: number; peak: number; sha256Left: string; sha256Right: string;
}
interface VagDigest { file: string; size: number; version: number; dataBytes: number; sampleRate: number; name: string; endFlagAt: number; samples: number; peak: number; sha256: string }
interface StreamDigestsPin { vpk: VpkDigest[]; vag: VagDigest[] }

describe('the round\'s cue names, pinned (golden/round-streams.json; research 124 §3)', () => {
  const cues = (): CueRow[] => pin<{ cues: CueRow[] }>('round-streams.json').cues;

  it('every cue the scripts name has an ST entry: the MUS_* in SMUS, a VPK; the result lines in MULTI, a VAGp; none loops', () => {
    const c = cues();
    expect(c.map((r) => r.name)).toEqual(CUE_NAMES);
    for (const r of c) {
      expect(soundHash(r.name), r.name).toBe(r.hash);
      expect(r.block, r.name).toBe(r.name.startsWith('MUS_') ? 'SMUS' : 'MULTI');
      expect(r.music, r.name).toBe(r.name.startsWith('MUS_'));
      expect(r.file, r.name).toBe(`${r.n1}.${r.music ? 'VPK' : 'VAG'}`);
      expect([r.loop, r.efx], r.name).toEqual([false, false]);
    }
  });

  it('Frostfire\'s six (research 124 §3): INTRO_4 MUMP0004 / MUMP0009, WIN_RUS MUMP0019 / MUMP0020, SEAL WIN_ALB MUMP0013, the lines PH_0014 / PH_0002', () => {
    const file = Object.fromEntries(cues().map((r) => [r.name, r.file]));
    expect(file).toMatchObject({
      MUS_MP_SEAL_INTRO_4: 'MUMP0004.VPK', MUS_MP_TERR_INTRO_4: 'MUMP0009.VPK', MUS_MP_SEAL_WIN_RUS: 'MUMP0019.VPK',
      MUS_MP_TERR_WIN_RUS: 'MUMP0020.VPK', MUS_MP_SEAL_WIN_ALB: 'MUMP0013.VPK', '^PH_0014': 'PH_0014.VAG', '^PH_0002': 'PH_0002.VAG',
    });
  });

  it('the resolver, fed the pinned entries as sounds.rdr spells them, finds each through the blocks a multiplayer map loads', () => {
    // `ST (N1 <stem>)`, with `MUS` beside it for the music class: the shape parseRdr gives the disc's entries.
    const sets: RdrNode[] = [];
    for (const block of ['SMUS', 'MULTI']) {
      sets.push(block, cues().filter((r) => r.block === block).map((r): RdrNode => [String(r.hash), 'ST', ['N1', [r.n1]], ...(r.music ? ['MUS', []] : [])]));
    }
    const entries = parseStreamEntries(['SETS', sets]);
    for (const map of ['MP1', 'MP2', 'MP51', 'MP83']) {
      for (const r of cues()) {
        const e = streamFor(entries, missionSoundBlocks(map), r.name);
        expect(e && streamFile(e), `${map} ${r.name}`).toBe(r.file);
        expect(e?.block).toBe(r.block);
      }
    }
    // The sigil is part of the name: PH_0014 bare is no cue.
    expect(streamFor(entries, missionSoundBlocks('MP2'), 'PH_0014')).toBeNull();
  });
});

describe('the round\'s stream members, pinned (golden/stream-digests.json; research 124 §1-§2)', () => {
  const digests = (): StreamDigestsPin => pin<StreamDigestsPin>('stream-digests.json');

  it('every VPK the cues stream: 0x800, 0xb000, 32 kHz, two channels panned 270 / 90, sized 0x800 + ceil(size / 0x5800) x 0xb000', () => {
    const v = digests().vpk;
    expect(v.length).toBe(18);
    for (const d of v) {
      expect([d.dataOffset, d.bufferBytes, d.sampleRate, d.channels], d.file).toEqual([0x800, 0xb000, 32_000, 2]);
      expect(d.volPan, d.file).toEqual([{ vol: 127, group: 0, pan: 270 }, { vol: 127, group: 0, pan: 90 }]);
      expect(d.size, d.file).toBe(d.dataOffset + Math.ceil(d.channelBytes / (d.bufferBytes / 2)) * d.bufferBytes);
      expect(d.samples, d.file).toBe((d.channelBytes / 16) * 28);   // no frame carries the end flag: every frame is played
      expect(d.peak, d.file).toBeGreaterThan(0);
    }
  });

  it('the music\'s lengths (research 124 §1): MUMP0004 37.66 s (688,576 bytes a channel, 1,398,784 the member), MUMP0009 38.15, MUMP0019 18.43, MUMP0020 18.77', () => {
    const v = Object.fromEntries(digests().vpk.map((d) => [d.file, d]));
    const seconds = (f: string): number => Math.round((v[f]!.samples / v[f]!.sampleRate) * 100) / 100;
    expect([seconds('MUMP0004.VPK'), seconds('MUMP0009.VPK'), seconds('MUMP0019.VPK'), seconds('MUMP0020.VPK')]).toEqual([37.66, 38.15, 18.43, 18.77]);
    expect([v['MUMP0004.VPK']!.channelBytes, v['MUMP0004.VPK']!.size]).toEqual([688_576, 1_398_784]);
  });

  it('the result lines (research 124 §2): VAGp version 32 at 22,050 Hz, PH_0014 to its end flag at 17,264 of 17,296 bytes (1.37 s), PH_0002 13,440 of 13,472 (1.07 s)', () => {
    const v = Object.fromEntries(digests().vag.map((d) => [d.file, d]));
    expect(Object.keys(v).sort()).toEqual(['PH_0002.VAG', 'PH_0014.VAG']);
    expect(v['PH_0014.VAG']).toMatchObject({ version: 32, sampleRate: 22_050, dataBytes: 17_296, endFlagAt: 17_264, name: 'PH_0014' });
    expect(v['PH_0002.VAG']).toMatchObject({ version: 32, sampleRate: 22_050, dataBytes: 13_472, endFlagAt: 13_440, name: 'PH_0002' });
    for (const d of Object.values(v)) {
      expect(d.samples, d.file).toBe((d.endFlagAt / 16 + 1) * 28);
      expect(d.size, d.file).toBeGreaterThanOrEqual(VAGP_HEADER_BYTES + d.dataBytes);
    }
    expect(Math.round((v['PH_0014.VAG']!.samples / 22_050) * 100) / 100).toBe(1.37);
    expect(Math.round((v['PH_0002.VAG']!.samples / 22_050) * 100) / 100).toBe(1.07);
  });
});

const soundrdr = fixture('RUN/SOUNDRDR.ZAR');

function cueRows(script: Uint8Array): CueRow[] {
  const zar = Zar.parse(script);
  const key = zar.root.children.find((k) => k.name.toLowerCase() === 'sounds.rdr')!;
  const entries = parseStreamEntries(parseRdr(zar.data(key)));
  return CUE_NAMES.map((name) => {
    const e = streamFor(entries, missionSoundBlocks('MP2'), name);
    if (!e) throw new Error(`no stream ${name}`);
    return { name, hash: e.hash, block: e.block, n1: e.n1, music: e.music, loop: e.loop, efx: e.efx, file: streamFile(e) };
  });
}

describe.skipIf(!soundrdr)('the round\'s cue names re-derived from SOUNDRDR.ZAR (fixture)', () => {
  it('parseStreamEntries and streamFor give the pinned rows (round-streams.json)', () => {
    matchPin('round-streams.json', 'disc RUN/SOUNDRDR.ZAR sounds.rdr SETS ST entries through parseStreamEntries, resolved with streamFor over missionSoundBlocks(MP2) and named by streamFile; 2026-10-02', { cues: cueRows(soundrdr!) });
  });
});

const DISC = process.env.SOCOM_DISC;
const VAGSTORE = DISC ? resolve(DISC, 'RUN/SOUNDS/VAGSTORE.ZAR') : '';
const SCRIPT = DISC ? resolve(DISC, 'RUN/SOUNDRDR.ZAR') : '';
const HAVE_DISC = !!DISC && existsSync(VAGSTORE) && existsSync(SCRIPT);

describe.skipIf(!HAVE_DISC)('the round\'s stream members re-derived from VAGSTORE.ZAR (SOCOM_DISC)', () => {
  it('the members the cues name decode to the pinned headers and digests (stream-digests.json)', () => {
    const fd = openSync(VAGSTORE, 'r');
    try {
      const range = (at: number, n: number): Uint8Array => { const b = new Uint8Array(n); readSync(fd, b, 0, n, at); return b; };
      const zar = Zar.parse(range(0, zarIndexLength(range(0, ZAR_HEAD))));
      const read = (name: string): Uint8Array => {
        const k = zar.root.children.find((x) => x.name.toUpperCase() === name.toUpperCase());
        if (!k) throw new Error(`no ${name}`);
        return range(zar.dataOffset + k.offset, k.size);
      };
      const files = [...new Set(cueRows(new Uint8Array(readFileSync(SCRIPT))).map((r) => r.file))];
      const vpk: VpkDigest[] = files.filter((f) => f.endsWith('.VPK')).map((file) => {
        const b = read(file), h = parseVpkHeader(b), r = decodeVpk(b);
        return {
          file, size: b.byteLength, channelBytes: h.channelBytes, dataOffset: h.dataOffset, bufferBytes: h.bufferBytes, sampleRate: h.sampleRate,
          channels: h.channels, volPan: h.volPan, samples: r.left.length, peak: r.peak, sha256Left: sha256(r.left), sha256Right: sha256(r.right),
        };
      });
      const vag: VagDigest[] = files.filter((f) => f.endsWith('.VAG')).map((file) => {
        const b = read(file), v = new DataView(b.buffer, b.byteOffset, b.byteLength), r = decodeVagStream(b);
        let end = -1;
        for (let at = VAGP_HEADER_BYTES; at + 16 <= b.byteLength; at += 16) if (b[at + 1]! & 1) { end = at - VAGP_HEADER_BYTES; break; }
        const name = String.fromCharCode(...b.subarray(32, 48)).replace(/\0.*$/s, '');
        return {
          file, size: b.byteLength, version: v.getUint32(4, false), dataBytes: v.getUint32(12, false), sampleRate: r.sampleRate, name,
          endFlagAt: end, samples: r.left.length, peak: r.peak, sha256: sha256(r.left),
        };
      });
      matchPin('stream-digests.json', 'disc RUN/SOUNDS/VAGSTORE.ZAR, the members round-streams.json names, read by range; parseVpkHeader, decodeVpk, decodeVagStream; sha256 over the decoded Float32 PCM; 2026-10-02', { vpk, vag });
    } finally { closeSync(fd); }
  }, 120_000);
});
