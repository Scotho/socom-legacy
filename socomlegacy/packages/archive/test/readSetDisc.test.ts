import { describe, expect, it } from 'vitest';
import { closeSync, existsSync, fstatSync, openSync, readSync } from 'node:fs';
import { IsoAssetSource } from '../src/isoAssetSource';
import { CAMPAIGN_ARCHIVES, COMMON_ARCHIVES } from '../src/mapIndex';
import { discReadSet } from '../src/readSet';

/**
 * DX-1's dev-disc check (front-end plan `docs/plans/2026-10-16-front-end-pad-and-disc.md`, FI.R6): the read set over
 * the retail image (`SOCOM_ISO`), from its table only -- the volume descriptor and the directory records; no file's bytes
 * are read and nothing is written. It skips itself when `SOCOM_ISO` is absent, as on a host without the disc: a skip, not
 * a pass. The total is logged, for the extraction's quota and the plan's Log.
 */
const ISO = process.env.SOCOM_ISO;
const HAVE_ISO = !!ISO && existsSync(ISO);
if (!HAVE_ISO) console.warn('readSetDisc.test: SKIPPED -- SOCOM_ISO is not set or not found');

/** An fs-backed Blob stand-in, one readSync per slice (`isoAssetSource.test.ts`'s): not fs.openAsBlob, whose size wraps. */
function fsBlob(path: string): Blob & { close(): void } {
  const fd = openSync(path, 'r');
  const size = fstatSync(fd).size;
  const slice = (start = 0, end = size): Blob => ({
    size: end - start,
    arrayBuffer: async () => {
      const out = new Uint8Array(end - start);
      let got = 0;
      while (got < out.length) {
        const n = readSync(fd, out, got, out.length - got, start + got);
        if (n === 0) break;
        got += n;
      }
      return out.buffer;
    },
  }) as unknown as Blob;
  return { size, slice, close: () => closeSync(fd) } as unknown as Blob & { close(): void };
}

describe.skipIf(!HAVE_ISO)('the read set on the retail image (SOCOM_ISO), from its table', () => {
  it('is non-empty, lacks nothing, and every path and size is the image\'s own extent; the total is logged', async () => {
    const blob = fsBlob(ISO!);
    try {
      const image = new IsoAssetSource(blob);
      const set = await discReadSet(image);
      const extents = new Map((await image.extents()).map((e) => [e.path, e.size]));
      expect(set.missing).toEqual([]);
      expect(set.files.length).toBeGreaterThan(0);
      for (const f of set.files) {
        expect(extents.has(f.path), f.path).toBe(true);
        expect(f.size, f.path).toBe(extents.get(f.path));
      }
      const paths = set.files.map((f) => f.path);
      expect(new Set(paths).size).toBe(paths.length);
      expect(paths.filter((p) => /^RUN\/MP\d+\.ZDB$/.test(p)).length).toBe(22);
      for (const p of COMMON_ARCHIVES) expect(paths, p).toContain(p);
      for (const p of CAMPAIGN_ARCHIVES) expect(paths, p).toContain(p);         // the forge's single-player maps (FI.R6)
      for (const p of ['SYSTEM.CNF', 'RUN/SOUNDS/VAGSTORE.ZAR', 'RUN/MOVIES/INTRO_2.PSS']) expect(paths, p).toContain(p);
      expect(paths.filter((p) => p.endsWith('.PSS')).length, 'the three kept movies (FI.R6)').toBe(3);
      expect(set.total).toBe(set.files.reduce((n, f) => n + f.size, 0));
      const by = (re: RegExp): number => set.files.filter((f) => re.test(f.path)).reduce((n, f) => n + f.size, 0);
      console.log(`readSetDisc: ${set.files.length} files, ${set.total} bytes (${(set.total / 1e9).toFixed(2)} GB); `
        + `movies ${by(/\.PSS$/)} B, VAGSTORE ${by(/VAGSTORE/)} B, maps ${by(/^RUN\/MP\d+\.ZDB$/)} B, campaign `
        + `${by(/^RUN\/M\d+\.ZDB$/)} B, the rest `
        + `${set.total - by(/\.PSS$/) - by(/VAGSTORE/) - by(/^RUN\/MP\d+\.ZDB$/) - by(/^RUN\/M\d+\.ZDB$/)} B; image ${blob.size} B`);
    } finally {
      blob.close();
    }
  }, 120_000);
});
