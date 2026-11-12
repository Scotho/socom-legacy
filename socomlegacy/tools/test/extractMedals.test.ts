import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Rgba } from '@s2u/gs';
import { FsAssetSource } from '@s2u/archive/node';
import { decodePng } from '../png';
import { MEDAL_TEXTURES } from '../../packages/viewer/src/modern/discAssets';
import { extractMedals, gitWorkTreeOf, MEDAL_COUNT_ADAPTATION, medalFileName, sourceFromEnv } from '../cards/extractMedals';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * LCM-2: the medal extraction tool (product track, a browser adaptation: the cards' assets for central). The pictures
 * come through the viewer's own reader (`readMedalPictures`, MU2-7) -- never a new decoder; this file pins the names,
 * the order (research 155 §2.3's table: medal 1 ENSIGN `Medal_Blue` .. 5 ADMIRAL `Medal_Black`) and the PNG output.
 */

const picture = (w: number, h: number, seed: number): Rgba => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i++) data[i] = (i * 7 + seed * 31) & 0xff;
  return { width: w, height: h, data };
};

const withTemp = async (body: (dir: string) => Promise<void>): Promise<void> => {
  const dir = mkdtempSync(join(tmpdir(), 'lcm2-medals-'));
  try { await body(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
};

describe('extractMedals (the reader faked)', () => {
  it('the medal order is research 155 §2.3 table: null, then ENSIGN Medal_Blue .. ADMIRAL Medal_Black', () => {
    expect(MEDAL_TEXTURES).toEqual(['null.tif', 'Medal_Blue.tif', 'Medal_Bronze.tif', 'Medal_Silver.tif', 'Medal_Gold.tif', 'Medal_Black.tif']);
    expect(MEDAL_COUNT_ADAPTATION).toBe(5);
    expect([1, 2, 3, 4, 5].map(medalFileName)).toEqual(['medal-1.png', 'medal-2.png', 'medal-3.png', 'medal-4.png', 'medal-5.png']);
  });

  it('writes medal-1.png .. medal-5.png, each the reader\'s picture of that medal, alpha kept', async () => {
    const pics = new Map<number, Rgba>([1, 2, 3, 4, 5].map((m) => [m, picture(3, 2, m)]));
    await withTemp(async (dir) => {
      const written = await extractMedals({} as never, dir, async () => pics);
      expect(written.map((p) => p.slice(dir.length + 1))).toEqual(['medal-1.png', 'medal-2.png', 'medal-3.png', 'medal-4.png', 'medal-5.png']);
      expect(readdirSync(dir).sort()).toEqual(['medal-1.png', 'medal-2.png', 'medal-3.png', 'medal-4.png', 'medal-5.png']);
      for (const m of [1, 2, 3, 4, 5]) {
        const png = decodePng(new Uint8Array(readFileSync(join(dir, medalFileName(m)))));
        expect([png.width, png.height]).toEqual([3, 2]);
        expect(Array.from(png.data)).toEqual(Array.from(pics.get(m)!.data));
      }
    });
  });

  it('refuses, writing nothing, when the reader answers fewer than the five', async () => {
    const pics = new Map<number, Rgba>([1, 2, 3, 5].map((m) => [m, picture(2, 2, m)]));
    await withTemp(async (dir) => {
      await expect(extractMedals({} as never, dir, async () => pics)).rejects.toThrow(/medal 4/);
      expect(readdirSync(dir)).toEqual([]);
    });
  });

  it('LCM-18b: refuses an outDir inside a git work tree, reading and writing nothing (RS.R8: disc art never in a tree)', async () => {
    await withTemp(async (repo) => {
      const init = spawnSync('git', ['init', '-q', repo], { encoding: 'utf8' });
      expect(init.status, init.stderr).toBe(0);
      let asked = 0;
      const read = async (): Promise<ReadonlyMap<number, Rgba>> => { asked++; return new Map([1, 2, 3, 4, 5].map((m) => [m, picture(2, 2, m)])); };
      const out = join(repo, 'deep', 'medals');
      await expect(extractMedals({} as never, out, read)).rejects.toThrow(/inside the git work tree/);
      await expect(extractMedals({} as never, repo, read)).rejects.toThrow(/inside the git work tree/);
      expect(asked).toBe(0);
      expect(existsSync(join(repo, 'deep'))).toBe(false);
      expect(readdirSync(repo)).toEqual(['.git']);
      expect(gitWorkTreeOf(out)).not.toBeNull();
    });
    await withTemp(async (dir) => { expect(gitWorkTreeOf(join(dir, 'x'))).toBeNull(); });
  });

  it('LCM-18b: the root .gitignore ignores medal-*.png, and the tools typecheck includes cards/**', () => {
    expect(readFileSync(join(HERE, '../../../.gitignore'), 'utf8')).toMatch(/^medal-\*\.png$/m);
    expect(readFileSync(join(HERE, '../tsconfig.json'), 'utf8')).toContain('"cards/**/*.ts"');
  });

  it('opens SOCOM_DISC as a directory, else SOCOM_ISO as an image, else refuses', async () => {
    await expect(sourceFromEnv({})).rejects.toThrow(/SOCOM_DISC or SOCOM_ISO/);
  });
});

const DISC = process.env.SOCOM_DISC ?? '';
const ISO = process.env.SOCOM_ISO ?? '';
const HAVE = (DISC !== '' && existsSync(join(DISC, 'RUN', 'UI', 'UIMP_TXR.ZED'))) || (ISO !== '' && existsSync(ISO));

describe.skipIf(!HAVE)(`extractMedals on the dev disc${HAVE ? '' : ' (SOCOM_DISC with RUN/UI/UIMP_TXR.ZED and SOCOM_ISO absent: skipped)'}`, () => {
  it('five files, each the disc\'s picture at its own size, distinct bytes, medal n = MEDAL_TEXTURES[n]', async () => {
    const source = await sourceFromEnv(process.env);
    await withTemp(async (dir) => {
      const written = await extractMedals(source, dir);
      expect(written).toHaveLength(5);
      const { pageUiTextures } = await import('../../packages/viewer/src/frontEndAssets');
      const bank = pageUiTextures(DISC !== '' ? new FsAssetSource(DISC) : source, ['UIMP'], null, []);
      expect(await bank.ready).toEqual([]);
      const seen = new Set<string>();
      for (let m = 1; m <= 5; m++) {
        const png = decodePng(new Uint8Array(readFileSync(join(dir, medalFileName(m)))));
        // The disc's texture size (16 x 16: the viewer's dev-disc test of readMedalPictures, MU2-7).
        expect([png.width, png.height], `medal ${m}`).toEqual([16, 16]);
        const tex = bank.textures(MEDAL_TEXTURES[m]!)!;
        expect(Array.from(png.data), `medal ${m} is ${MEDAL_TEXTURES[m]}`).toEqual(Array.from(tex.data));
        let opaque = 0;
        for (let i = 3; i < png.data.length; i += 4) if (png.data[i]! > 0) opaque++;
        expect(opaque, `medal ${m}`).toBeGreaterThan(0);
        seen.add(Array.from(png.data).join(','));
      }
      expect(seen.size).toBe(5);
    });
  });
});
