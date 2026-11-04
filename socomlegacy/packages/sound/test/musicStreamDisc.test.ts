import { closeSync, existsSync, openSync, readFileSync, readSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Zar, ZAR_HEAD, zarIndexLength, type ZarKey } from '@s2u/archive';
import {
  MUSIC_VOLUME_DEFAULT, VpkStreamReader, streamGroupMaster, streamMember, vagStreamLoc, vagStreamPlayWords,
} from '../src/musicStream';
import { parseStreamEntries, streamFile } from '../src/script';
import { frontEndSoundTable, soundScriptRoot } from '../src/uiSounds';
import { decodeVpk, parseVpkHeader } from '../src/vpk';

/**
 * The front end's music on the dev disc (MENU-MUSIC; web research 152; W6.R8): the two names the menus' scripts play
 * resolve through the disc's `sounds.rdr` to their VAGSTORE members, the members are read by range (the archive's index,
 * then the member's buffers: never the 577 MB), and the buffer-at-a-time decode equals the whole member's, sample for
 * sample. Names, sizes, counts and words only (RS.R8). The disc is `SOCOM_DISC`, else `<SOCOM_PC_ROOT>/game/disc`; with
 * neither (CI) every test skips.
 *
 * Not met here: research 124 §1's "the Python VPK decoder" -- no such decoder is in `$SOCOM_PC_ROOT/tools_py` on this host
 * (searched 2026-10-03); the comparison is with this repository's whole-member `decodeVpk` (research 124, reading).
 */
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const VAGSTORE = DISC ? join(DISC, 'RUN/SOUNDS/VAGSTORE.ZAR') : '';
const SOUNDRDR = DISC ? join(DISC, 'RUN/SOUNDRDR.ZAR') : '';
const HAVE = DISC !== '' && existsSync(VAGSTORE) && existsSync(SOUNDRDR);

/**
 * VAGSTORE.ZAR's first sector on the retail image (`$SOCOM_PC_ROOT/tools_py/iso_lbn.py <image> list`: `0x00ee801
 * 576593920 /RUN/SOUNDS/VAGSTORE.ZAR`), and the 989snd play the recomp logged on the online path when SOCOM II ONLINE's
 * menu opened (`$SOCOM_PC_ROOT/logs/parity/s17_a1_lobby_fix/run.log` line 1200, 2026-09-29): research 152 §3.
 */
const VAGSTORE_SECTOR = 0xee801;
const LOGGED_ONLINE_MENU_PLAY = [0x1303f8, 0, 0x04000000, 0xffff0000, 1, 0, 0, 4];

function vagstore(): { key: (name: string) => ZarKey; dataOffset: number; read: (at: number, n: number) => Uint8Array; reads: number[]; close(): void } {
  const fd = openSync(VAGSTORE, 'r'), reads: number[] = [];
  const read = (at: number, n: number): Uint8Array => { const b = new Uint8Array(n); readSync(fd, b, 0, n, at); reads.push(n); return b; };
  const zar = Zar.parse(read(0, zarIndexLength(read(0, ZAR_HEAD))));
  return {
    key: (name) => { const k = zar.root.children.find((x) => x.name.toUpperCase() === name.toUpperCase()); if (!k) throw new Error(`no ${name}`); return k; },
    dataOffset: zar.dataOffset, read, reads, close: () => closeSync(fd),
  };
}

describe.skipIf(!HAVE)('the menus\' music on the dev disc (research 152)', () => {
  it('MUS_MENU_THEME and MUS_ONLINE_MENU resolve by CRC-32 in the front end\'s table to looped MUS streams MUUI0001.VPK and MUUI0003.VPK', () => {
    const script = soundScriptRoot(new Uint8Array(readFileSync(SOUNDRDR)));
    const table = frontEndSoundTable(script, new Map());
    for (const [name, member] of [['MUS_MENU_THEME', 'MUUI0001.VPK'], ['MUS_ONLINE_MENU', 'MUUI0003.VPK']] as const) {
      const r = table.resolve(name);
      expect(r.kind, name).toBe('stream');
      if (r.kind !== 'stream') continue;
      expect([r.object.block, r.object.music, r.object.loop, r.object.headset, r.object.hq, r.object.volume], name).toEqual(['SMUS', true, true, false, false, 1]);
      expect(streamMember(r.object), name).toBe(member);
    }
    // The map path's resolver agrees since its MUS search is depth-first (research 122 §13's drift, fixed here).
    const smus = parseStreamEntries(script).get('SMUS')!;
    const files = [...smus.values()].filter((e) => e.n1.startsWith('MUUI')).map(streamFile).sort();
    expect(files).toEqual(['MUUI0001.VPK', 'MUUI0002.VPK', 'MUUI0003.VPK', 'MUUI0004.VPK', 'MUUI0005.VPK', 'MUUI0006.VPK', 'MUUI3203.VPK']);
    expect([...smus.values()].filter((e) => e.music).length).toBe(211);
  });

  it('reads the two members by range: the header, then the first sectors a buffer at a time; 123.25 s and 188.47 s a pass', async () => {
    const s = vagstore();
    try {
      for (const [name, bytes, channelBytes, seconds] of [['MUUI0001.VPK', 4552704, 2253664, 123.247], ['MUUI0003.VPK', 6895616, 3446240, 188.466]] as const) {
        const k = s.key(name), base = s.dataOffset + k.offset;
        expect(k.size, name).toBe(bytes);
        s.reads.length = 0;
        const r = new VpkStreamReader(async (at, n) => s.read(base + at, n), k.size, { loop: true });
        const h = await r.open();
        expect([h.channelBytes, h.dataOffset, h.bufferBytes, h.sampleRate, h.channels], name).toEqual([channelBytes, 0x800, 0xb000, 32000, 2]);
        expect(((h.channelBytes / 16) * 28) / h.sampleRate).toBeCloseTo(seconds, 3);
        for (let i = 0; i < 3; i++) expect((await r.next())!.left.length).toBe(0xb000 / 2 / 16 * 28);
        expect(Math.max(...s.reads), name).toBeLessThanOrEqual(0xb000);
      }
    } finally { s.close(); }
  }, 60_000);

  it('the buffer-at-a-time decode equals the whole member\'s, sample for sample, and the loop starts the second pass at the top', async () => {
    const s = vagstore();
    try {
      for (const name of ['MUUI0001.VPK', 'MUUI0003.VPK']) {
        const k = s.key(name), base = s.dataOffset + k.offset, whole = decodeVpk(s.read(base, k.size));
        const r = new VpkStreamReader(async (at, n) => s.read(base + at, n), k.size, { loop: true });
        await r.open();
        const left = new Float32Array(whole.left.length), right = new Float32Array(whole.right.length);
        let at = 0;
        for (let i = 0; i < r.bufferCount; i++) {
          const b = (await r.next())!;
          expect(b.wrapped).toBe(false);
          left.set(b.left, at); right.set(b.right, at); at += b.left.length;
        }
        expect(at, name).toBe(whole.left.length);
        let diff = 0;
        for (let i = 0; i < at; i++) if (left[i] !== whole.left[i] || right[i] !== whole.right[i]) diff++;
        expect(diff, `${name}: samples that differ`).toBe(0);
        const again = (await r.next())!;
        expect([again.index, again.wrapped, r.passes]).toEqual([0, true, 2]);
      }
    } finally { s.close(); }
  }, 120_000);

  it('MUS_ONLINE_MENU\'s play, as the menus make it, is the recomp\'s logged snd_PlayVAGStreamByLoc word for word', () => {
    const s = vagstore();
    try {
      const k = s.key('MUUI0003.VPK');
      const loc = vagStreamLoc(VAGSTORE_SECTOR, s.dataOffset + k.offset);
      expect(loc).toEqual({ sector: 0x1303f8, offset: 0 });
      const entry = { music: true, hq: false, headset: false, loop: true };
      expect(vagStreamPlayWords(entry, 0x400, -1, loc)).toEqual(LOGGED_ONLINE_MENU_PLAY);
      expect(streamGroupMaster(MUSIC_VOLUME_DEFAULT)).toBe(0x2f5);                  // the same log's SetMasterVolume [1, 0x2f5]
      const theme = vagStreamLoc(VAGSTORE_SECTOR, s.dataOffset + s.key('MUUI0001.VPK').offset);
      expect(theme).toEqual({ sector: 0x12fb49, offset: 0 });                        // logged nowhere on that run: dlgMenu plays it not
      expect(parseVpkHeader(s.read(s.dataOffset + k.offset, 0x20)).volPan.map((p) => [p.vol, p.pan])).toEqual([[127, 270], [127, 90]]);
    } finally { s.close(); }
  });
});
