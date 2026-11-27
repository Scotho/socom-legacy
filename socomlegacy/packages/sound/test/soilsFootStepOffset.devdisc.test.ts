// @vitest-environment node
import { closeSync, existsSync, fstatSync, openSync, readFileSync, readSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { IsoAssetSource } from '@s2u/archive';
import { materialsFromArchive, type Material } from '../src/materials';

/**
 * LATER 1095 (R145, the ground offset; research 151, the section after §8). Evidence kind: a DEV-DISC TEST -- a reading
 * of the disc's data (`RUN/READERC.ZAR`'s `materials.rdr`, its `SOILS` list) through the repository's reader
 * (`../src/materials` `materialsFromArchive` -> `parseSoils`, `footStepOffset: real(record, 'FOOT_STEP_OFFSET')`), over
 * every soil of the real disc, not the golden.
 *
 * Why: the original adds a material's `FOOT_STEP_OFFSET` (the soil record's +0x38) to the floor height of a standing or
 * landing body, so the six soils that carry one hold a SEAL lower on them. The port's -0.8 values on GRASS, BROKEN
 * GLASS, LEAVES, ICE, SNOW and GRAVEL came from its golden (`./golden/materials.json`), not from a re-read of the disc;
 * this file is that re-read. It logs one row per soil (index | name | footStepOffset, `null` where the record has no
 * key) and asserts the six, each -0.8, are the only soils with a non-zero offset.
 *
 * The disc is no fixture: this file reads `SOCOM_DISC` (or `SOCOM_PC_ROOT`'s `game/disc`), else the image `SOCOM_ISO`,
 * and SKIPS without them -- the skip is printed, never counted as a pass. To be run on a box with the disc. Written
 * without a run (this host runs no tests): its first run is owed there.
 */
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const MEMBER = 'RUN/READERC.ZAR';
const DIR = [process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : undefined, PC_ROOT ? join(PC_ROOT, 'game', 'disc') : undefined]
  .find((d) => !!d && existsSync(join(d, MEMBER)));
const ISO = process.env.SOCOM_ISO && existsSync(process.env.SOCOM_ISO) ? process.env.SOCOM_ISO : undefined;
const HAVE = !!DIR || !!ISO;
const SKIP = HAVE ? '' : ': SOCOM_DISC / SOCOM_PC_ROOT (game/disc/RUN/READERC.ZAR) and SOCOM_ISO absent -- SKIPPED (the disc is no fixture)';
if (!HAVE) console.warn(`soilsFootStepOffset.devdisc.test${SKIP}`);

/** The soils that carry a ground offset, as the disc spells them (compared without case), and the offset. */
const OFFSET_SOILS = ['GRASS', 'BROKEN GLASS', 'LEAVES', 'ICE', 'SNOW', 'GRAVEL'];
const OFFSET = -0.8;

/** An fs-backed Blob stand-in over the image, one readSync per slice (as `archive/test/isoAssetSource.test.ts` reads it). */
function fsBlob(path: string): { blob: Blob; close: () => void } {
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
  return { blob: { size, slice } as unknown as Blob, close: () => closeSync(fd) };
}

async function readerc(): Promise<{ bytes: Uint8Array; from: string }> {
  if (DIR) return { bytes: new Uint8Array(readFileSync(join(DIR, MEMBER))), from: 'SOCOM_DISC' };
  const { blob, close } = fsBlob(ISO!);
  try {
    return { bytes: await new IsoAssetSource(blob).read(MEMBER), from: 'SOCOM_ISO' };
  } finally {
    close();
  }
}

describe.skipIf(!HAVE)(`materials.rdr's FOOT_STEP_OFFSET over every soil of the disc (dev-disc; LATER 1095)${SKIP}`, () => {
  it('only GRASS, BROKEN GLASS, LEAVES, ICE, SNOW and GRAVEL carry an offset, each -0.8; every other soil 0 or absent', async () => {
    const { bytes, from } = await readerc();
    const soils: Material[] = materialsFromArchive(bytes);
    console.info(`soilsFootStepOffset: ${soils.length} materials off ${MEMBER} (${from})\nindex | name | footStepOffset`);
    for (const m of soils) console.info(`${m.index} | ${m.name} | ${m.footStepOffset === null ? 'null' : m.footStepOffset}`);

    expect(soils.length, 'the table holds the engine\'s two and the disc\'s soils').toBeGreaterThan(2);
    const offset = soils.filter((m) => m.footStepOffset !== null && m.footStepOffset !== 0);
    expect(offset.map((m) => m.name.toUpperCase()).sort()).toEqual([...OFFSET_SOILS].sort());
    for (const m of offset) expect(m.footStepOffset, m.name).toBe(OFFSET);
    for (const want of OFFSET_SOILS) expect(soils.filter((m) => m.name.toUpperCase() === want).length, `${want} named once`).toBe(1);
  }, 120_000);
});
