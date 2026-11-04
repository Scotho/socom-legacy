import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AssetSource } from '../src/assetSource';
import { discIdentity, socom2Release, SOCOM2_RELEASES, SOCOM2_US_BOOT } from '../src/discIdentity';
import { FsAssetSource } from '../src/fsAssetSource';

/**
 * DA-2 (plan `docs/plans/2026-10-11-disc-access.md`, DA.R8): a disc is known by its `SYSTEM.CNF` before anything else
 * is read. The retail US one is `BOOT2 = cdrom0:\SCUS_972.75;1`, `VER = 1.02`, `VMODE = NTSC` (roadmap `02-boot.md` B1).
 * DA.R8 as amended 2026-10-28: every dumped retail release of SOCOM II boots, not the US disc alone (no beta, no demo).
 */

/** A source over named texts that records every path read, so a test can say nothing else was. */
const textSource = (files: Record<string, string>): AssetSource & { reads: string[] } => {
  const reads: string[] = [];
  return {
    reads,
    list: async () => Object.keys(files).sort(),
    read: async (path: string) => {
      reads.push(path);
      const text = files[path];
      if (text === undefined) throw new Error(`no ${path}`);
      return new TextEncoder().encode(text);
    },
  };
};

const RETAIL_CRLF = 'BOOT2 = cdrom0:\\SCUS_972.75;1\r\nVER = 1.02\r\nVMODE = NTSC\r\n';

describe('discIdentity over synthetic SYSTEM.CNFs', () => {
  it('names the retail disc, reading SYSTEM.CNF and nothing else', async () => {
    expect(SOCOM2_US_BOOT).toBe('SCUS_972.75');
    const source = textSource({ 'SYSTEM.CNF': RETAIL_CRLF, 'RUN/MP2.ZDB': 'x' });
    expect(await discIdentity(source)).toEqual({ boot: 'SCUS_972.75', ver: '1.02', vmode: 'NTSC' });
    expect(source.reads).toEqual(['SYSTEM.CNF']);
  });

  it('reads LF line endings, and CRLF without a final newline, the same', async () => {
    const lf = textSource({ 'SYSTEM.CNF': 'BOOT2 = cdrom0:\\SCUS_972.75;1\nVER = 1.02\nVMODE = NTSC\n' });
    expect(await discIdentity(lf)).toEqual({ boot: 'SCUS_972.75', ver: '1.02', vmode: 'NTSC' });
    const bare = textSource({ 'SYSTEM.CNF': 'BOOT2=cdrom0:\\SCUS_972.75;1\r\nVER=1.02\r\nVMODE=NTSC' });
    expect(await discIdentity(bare)).toEqual({ boot: 'SCUS_972.75', ver: '1.02', vmode: 'NTSC' });
  });

  it('knows every dumped retail release of SOCOM II by its boot name (redump, 2026-10-28)', () => {
    expect(Object.keys(SOCOM2_RELEASES).sort()).toEqual([
      'SCES_519.04', 'SCES_523.06', 'SCKA_200.20', 'SCPS_150.65', 'SCUS_972.75',
    ]);
    expect(socom2Release('SCUS_972.75')?.serials).toContain('SCUS-97275');
    expect(socom2Release('scka_200.20')?.serials).toEqual(['SCKA-20020', 'SCKA-20053']);
    expect(socom2Release('SCES_517.91')).toBeNull();
    for (const notRetail of ['SCUS_973.66', 'SCUS_973.68', 'TCES_519.04']) expect(socom2Release(notRetail)).toBeNull();   // the betas and the demo
  });

  it('accepts every other retail release of SOCOM II the same way', async () => {
    const cases: [string, string, string][] = [
      ['SCES_519.04', '1.01', 'PAL'], ['SCES_523.06', '1.00', 'PAL'], ['SCPS_150.65', '1.00', 'NTSC'], ['SCKA_200.20', '2.00', 'NTSC'],
    ];
    for (const [boot, ver, vmode] of cases) {
      const source = textSource({ 'SYSTEM.CNF': `BOOT2 = cdrom0:\\${boot};1\r\nVER = ${ver}\r\nVMODE = ${vmode}\r\n` });
      expect(await discIdentity(source)).toEqual({ boot, ver, vmode });
    }
  });

  it('refuses another game, naming what it found and the releases it takes', async () => {
    const other = textSource({ 'SYSTEM.CNF': 'BOOT2 = cdrom0:\\SCES_517.91;1\r\nVER = 1.00\r\nVMODE = PAL\r\n' });
    await expect(discIdentity(other)).rejects.toThrow(/this disc boots SCES_517\.91; this game needs a SOCOM U\.S\. Navy SEALs II disc .*SCUS_972\.75.*SCES_519\.04/);
    const demo = textSource({ 'SYSTEM.CNF': 'BOOT2 = cdrom0:\\SCUS_973.68;1\r\nVER = 1.00\r\nVMODE = NTSC\r\n' });
    await expect(discIdentity(demo)).rejects.toThrow(/this disc boots SCUS_973\.68/);
  });

  it('reads a large SYSTEM.CNF without overflowing the stack, and refuses it by what it found', async () => {
    await expect(discIdentity(textSource({ 'SYSTEM.CNF': 'X'.repeat(2_000_000) }))).rejects.toThrow(/BOOT2/);
  });

  it('refuses a SYSTEM.CNF with no BOOT2 line', async () => {
    await expect(discIdentity(textSource({ 'SYSTEM.CNF': 'VER = 1.02\r\n' }))).rejects.toThrow(/BOOT2/);
  });

  it('refuses a folder without SYSTEM.CNF as not a PS2 disc\'s root', async () => {
    const source = textSource({ 'RUN/MP2.ZDB': 'x' });
    await expect(discIdentity(source)).rejects.toThrow(/SYSTEM\.CNF.*not .*PS2 disc's root/);
    expect(source.reads).toEqual(['SYSTEM.CNF']);
  });
});

const DISC = process.env.SOCOM_DISC;
const HAVE_DISC = !!DISC && existsSync(resolve(DISC, 'SYSTEM.CNF'));
if (!HAVE_DISC) console.warn('discIdentity.test: the dev-disc test is SKIPPED -- it needs SOCOM_DISC (the extracted tree)');

describe.skipIf(!HAVE_DISC)('discIdentity over the retail disc tree (SOCOM_DISC)', () => {
  it('names SCUS_972.75, VER 1.02, VMODE NTSC', async () => {
    expect(await discIdentity(new FsAssetSource(resolve(DISC!)))).toEqual({ boot: 'SCUS_972.75', ver: '1.02', vmode: 'NTSC' });
  });
});
