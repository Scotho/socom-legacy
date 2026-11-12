// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseZdb, Zar, zdbMember } from '@s2u/archive';
import { applyR0004MapPatch, parseSceneGraph, segmentHits, surfaceMaterial, worldCollision, type WorldPoly } from '@s2u/scene';
import { simMapFromBytes } from '../src/simMap';
import { roundStartAdmits, startWalled } from '../src/net/startLine';

/**
 * LEAN-WALLED (issue #752 defect 2, LATER 775; reading, pending review), dev-disc (`SOCOM_DISC`; skipped without it, a
 * skip being said): on MP51 Vigilance's patched hull (R4B-09, research 383: r0004 adds eleven INVISIBLE_DI walls, the
 * one under `wc22A` and the root's at r4 0x2d6ee0 among them), each of those walls is met by a start line that tests
 * every polygon -- the throw's, as before -- and by none that admits what the round admits (`roundStartAdmits`, the
 * room's own material lookup), since the round's walk passes a PENETRATION-1 surface over (`FUN_003c9b70`
 * D:L320028-320030; r0004 0x3ebf28-0x3ebf40). A body on either side of the root's wall: its round start past the
 * wall is walled for every polygon, and not for the round.
 */
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC, 'RUN') : '';
const PATH = DISC ? resolve(DISC, 'MP51.ZDB') : '';
const HAVE = !!PATH && existsSync(PATH);

type V3 = [number, number, number];
const sub = (a: readonly number[], b: readonly number[]): V3 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const add = (a: readonly number[], b: readonly number[], k = 1): V3 => [a[0]! + b[0]! * k, a[1]! + b[1]! * k, a[2]! + b[2]! * k];

/** A polygon's centroid and its unit normal (Newell's). */
function frame(p: WorldPoly): { c: V3; n: V3 } {
  const k = p.ptcount, q = p.points;
  const c: V3 = [0, 0, 0], n: V3 = [0, 0, 0];
  for (let i = 0; i < k; i++) {
    const j = (i + 1) % k;
    for (let a = 0; a < 3; a++) c[a] = c[a]! + q[i * 3 + a]! / k;
    n[0] += (q[i * 3 + 1]! - q[j * 3 + 1]!) * (q[i * 3 + 2]! + q[j * 3 + 2]!);
    n[1] += (q[i * 3 + 2]! - q[j * 3 + 2]!) * (q[i * 3]! + q[j * 3]!);
    n[2] += (q[i * 3]! - q[j * 3]!) * (q[i * 3 + 1]! + q[j * 3 + 1]!);
  }
  const l = Math.hypot(...n);
  return { c, n: [n[0] / l, n[1] / l, n[2] / l] };
}

describe.skipIf(!HAVE)(`LEAN-WALLED on MP51's patched hull${HAVE ? '' : ' (SOCOM_DISC absent: skipped)'}`, () => {
  const bytes = HAVE ? new Uint8Array(readFileSync(PATH)) : new Uint8Array();
  const map = HAVE ? simMapFromBytes(bytes, 'RUN/MP51.ZDB') : null;
  /** The world's polygons as the room's hull holds them, r0004's own picked out by their node's name. */
  const added = (): WorldPoly[] => {
    const toc = parseZdb(bytes);
    const models = parseSceneGraph(Zar.parse(zdbMember(bytes, toc, 'MP51_GEO.ZED')));
    applyR0004MapPatch(models, 'MP51');
    return worldCollision(models).filter((p) => /r0004@/.test(p.path));
  };
  const penetration = (m: number | undefined): number => surfaceMaterial(m ?? 0, map!.defaultMaterial ?? '').penetration;

  it('r0004 adds eleven INVISIBLE_DI walls (PENETRATION 1) with the round query class\'s side bit', () => {
    const walls = added().filter((p) => surfaceMaterial(p.material, map!.defaultMaterial ?? '').name === 'INVISIBLE_DI');
    expect(walls).toHaveLength(11);
    for (const w of walls) expect(penetration(w.material)).toBe(1);
  });

  it('each one is met by an every-polygon line through it, and by no round start line', () => {
    const walls = added().filter((p) => surfaceMaterial(p.material, map!.defaultMaterial ?? '').name === 'INVISIBLE_DI');
    const admits = roundStartAdmits(penetration);
    for (const w of walls) {
      const { c, n } = frame(w);
      const a = add(c, n, -0.5), b = add(c, n, 0.5);
      const every = segmentHits(map!.grid, a, b).filter((h) => h.poly.path === w.path && h.poly.material === w.material);
      expect(every.length, w.path).toBeGreaterThan(0);
      const round = segmentHits(map!.grid, a, b, admits).filter((h) => h.poly.path === w.path);
      expect(round, w.path).toEqual([]);
    }
  });

  it("a body on either side of the root's wall (r4 0x2d6ee0): its start past the wall is walled for every polygon, not for the round", () => {
    const wall = added().find((p) => /r0004@0x2d6ee0/.test(p.path))!;
    expect(wall).toBeDefined();
    const { c, n } = frame(wall);
    const admits = roundStartAdmits(penetration);
    for (const side of [1, -1]) {
      const feet = add([c[0], wall.points[1]! + 0.5, c[2]], n, 6 * side);
      const body = { feet, yaw: 0, posture: 'stand' as const, moveRoot: null, peek: 0 };
      const muzzle = add([c[0], c[1], c[2]], n, -2 * side);
      expect(startWalled(map!.grid, body, muzzle), `side ${side}`).toBe(true);
      expect(startWalled(map!.grid, body, muzzle, admits), `side ${side}`).toBe(false);
    }
  });
});
