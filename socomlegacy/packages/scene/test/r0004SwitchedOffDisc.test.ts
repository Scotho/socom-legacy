// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseZdb, Zar, zdbMember } from '@s2u/archive';
import { collisionOwners, parseSceneGraph } from '../src/index';

/**
 * R4B-09 (research 383; fresh review 2's N3), dev-disc: `CollisionOwner.switchedOff` is r0004's alone. With the patch
 * NOT applied, no collision owner of any map on the disc carries it -- no node is switched off above a polygon as
 * read -- so `WorldState` keeping such owners off changes nothing as read (`grid.ts`'s claim). One parse per map;
 * skipped without `SOCOM_DISC`.
 */
const RUN = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC, 'RUN') : '';
const MAPS = RUN && existsSync(RUN) ? readdirSync(RUN).filter((n) => /\.ZDB$/i.test(n)).sort() : [];

describe.skipIf(MAPS.length === 0)(`R4B-09: no owner switched off as read${MAPS.length ? '' : ' (SOCOM_DISC absent: skipped)'}`, () => {
  it(`on every map of the disc (${MAPS.length})`, () => {
    const marked: string[] = [];
    for (const file of MAPS) {
      const bytes = new Uint8Array(readFileSync(resolve(RUN, file)));
      const stem = file.replace(/\.ZDB$/i, '').toUpperCase();
      const models = parseSceneGraph(Zar.parse(zdbMember(bytes, parseZdb(bytes), `${stem}_GEO.ZED`)));
      for (const o of collisionOwners(models, 'worldmodel')) if (o.switchedOff) marked.push(`${stem} ${o.path}`);
    }
    expect(marked).toEqual([]);
  }, 300_000);
});
