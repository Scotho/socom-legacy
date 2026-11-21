// @vitest-environment node
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { loadMap } from '../../src/loadMap';
import { compileGeometry, geometryOfMap } from '../../src/forge/geometry/world';

/**
 * The editable geometry's gate (`src/forge/geometry`): a map's world draws and hull, imported and compiled untouched,
 * are the disc's -- every array value for value (bit for bit: -0 kept), every draw's flags, every hull polygon and owner.
 * A probe over the 22 maps of the US disc found them so (2026-11-14); this test holds three. Off the dev disc
 * (`SOCOM_DISC`, else `<SOCOM_PC_ROOT>/game/disc`); skipped without it, and a skip is no pass.
 */
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : '';
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';

const ARRAYS = ['positions', 'uvs', 'colors', 'normals', 'faceNormals', 'indices', 'centroids'] as const;
const bits = (a: ArrayLike<number> | null | undefined): number[] | null => (a ? Array.from(a, (x) => (Object.is(x, -0) ? Number.NaN : x)) : null);

describe.skipIf(DISC === '')('editable geometry round trip on the dev disc (skipped without SOCOM_DISC)', () => {
  for (const stem of ['MP72', 'MP6', 'MP51']) {
    it(`${stem}: the world and the hull compile back to the disc's`, async () => {
      const map = await loadMap(new FsAssetSource(DISC), `RUN/${stem}.ZDB`);
      const out = compileGeometry(geometryOfMap(map));
      expect(out.world).toHaveLength(map.world.length);
      map.world.forEach((d, i) => {
        const c = out.world[i]!;
        for (const k of ARRAYS) expect(bits(c[k] as ArrayLike<number> | undefined), `${stem} draw ${i} ${k}`).toEqual(bits(d[k] as ArrayLike<number> | undefined));
        const { positions: _p, uvs: _u, colors: _c, normals: _n, faceNormals: _f, indices: _i, centroids: _x, ...flags } = d;
        const { positions: _p2, uvs: _u2, colors: _c2, normals: _n2, faceNormals: _f2, indices: _i2, centroids: _x2, ...flags2 } = c;
        expect(flags2).toEqual(flags);
      });
      expect(Array.from(out.ground!.points)).toEqual(Array.from(map.ground!.points));
      expect(Array.from(out.ground!.fields)).toEqual(Array.from(map.ground!.fields));
      expect(out.ground!.owners.map((o) => [o.path, o.count])).toEqual(map.ground!.owners.map((o) => [o.path, o.count]));
    }, 120_000);
  }
});
