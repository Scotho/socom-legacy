// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Zar, parseRdr, type RdrNode } from '@s2u/archive';
import { GAME_FRAME_DT, gridCast, launchGrenade, stepGrenade, throwableRecord } from '@s2u/scene';
import { simMapFromBytes } from '../src/simMap';

/**
 * R4P-218 (agent/spc-atlas 22d47ddf74, socomlegacy/docs/atlas/readings/r4p-phase2-reads-218-230.md): the F2000 smoke round
 * on r0004 BOUNCES. The capture Q218C-PC2 (Shadow PC 2, r0004 LAN Desert Glory, 5 trials; record outside the repository)
 * fired it from (900, -30, 1898.6) facing +x at pitch +5.3: launch velocity ~(259.9, 70, -3); the first contact 225-230 u
 * out (beyond the 40 mm HE and FRAG rounds' 100 u arming distance; the disc's 182 has none) deflects it with NO burst, at e.g. (1131.36, 3.86, 1898.68), coming in at
 * (259.9, -11.8, -3.0); a second contact at ~281 u; at rest near (1187, 0.10, 1863) ~2 s after the launch; the smoke from
 * the rest point. The capture gives no muzzle point: it is traced back from the first contact (vy 70 -> -11.8 at 98 u/s^2
 * is 0.835 s), about (914.3, -20.4, 1901.2). The record is the disc's own (`F2000 SMOKE`, muzzle velocity 270, so the
 * launch passes the direction). A dev-disc test: it skips without SOCOM_DISC.
 */

const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : '';
const MP6 = DISC ? resolve(DISC, 'RUN/MP6.ZDB') : '';
const ZWEAPON = DISC ? resolve(DISC, 'RUN/ZWEAPON.ZAR') : '';
const HAVE = !!DISC && existsSync(MP6) && existsSync(ZWEAPON);
type V3 = [number, number, number];
const NL = String.fromCharCode(10);

const THROWER: V3 = [900, -30, 1898.6];
const LAUNCH: V3 = [914.3, -20.4, 1901.2];
const VEL: V3 = [259.9, 70, -3];
const REST: V3 = [1187, 0.1, 1863];

describe.skipIf(!HAVE)('R4P-218 dev-disc: Q218C on Desert Glory -- the F2000 smoke round bounces past its arming distance and rests', () => {
  it('no burst at the first contact (225-230 u out on the original); at rest near the original rest point', () => {
    const zar = Zar.parse(new Uint8Array(readFileSync(ZWEAPON)));
    const script = parseRdr(zar.data(zar.root.children[0] as NonNullable<(typeof zar.root.children)[0]>)) as RdrNode;
    const record = throwableRecord(script, 'F2000 SMOKE');
    const map = simMapFromBytes(new Uint8Array(readFileSync(MP6)), 'RUN/MP6.ZDB');
    const cast = gridCast(map.grid, map.defaultMaterial ?? '');
    const speed = Math.hypot(VEL[0], VEL[1], VEL[2]);
    const g = launchGrenade(LAUNCH, [VEL[0] / speed, VEL[1] / speed, VEL[2] / speed], record);
    const lines: string[] = [];
    let first: { point: V3; t: number; kind: string } | null = null;
    let restAt: { point: V3; t: number } | null = null;
    let burst: { point: V3; t: number } | null = null;
    for (let i = 1; i <= Math.round(4 / GAME_FRAME_DT) && g.state !== 'removed' && !burst; i++) {
      const t = i * GAME_FRAME_DT;
      for (const e of stepGrenade(g, GAME_FRAME_DT, cast)) {
        const q = (e as { point?: V3 }).point;
        if (q) lines.push(`  ${e.kind} at ${q.map((v) => v.toFixed(1)).join(',')} t ${t.toFixed(2)} s, ${(q[0] - THROWER[0]).toFixed(1)} u out`);
        if (!first && q && (e.kind === 'bounce' || e.kind === 'explode' || e.kind === 'dud')) first = { point: [...q] as V3, t, kind: e.kind };
        if (e.kind === 'rest' && q && !restAt) restAt = { point: [...q] as V3, t };
        if (e.kind === 'explode' && q) burst = { point: [...q] as V3, t };
      }
    }
    const restOff = restAt ? Math.hypot(restAt.point[0] - REST[0], restAt.point[1] - REST[1], restAt.point[2] - REST[2]) : NaN;
    console.log([`R4P-218 Q218C REPLAY (record impact ${record.impact}, fuse ${record.fuse} s; the original: first contact 225-230 u out, no burst; rest near ${REST.join(',')} ~2 s)`,
      `first contact: ${first ? `${first.kind} ${(first.point[0] - THROWER[0]).toFixed(1)} u out at t ${first.t.toFixed(2)} s` : 'none'}`,
      `rest: ${restAt ? `${restAt.point.map((v) => v.toFixed(1)).join(',')} at t ${restAt.t.toFixed(2)} s, ${restOff.toFixed(1)} u from the original` : 'none'}`,
      `burst: ${burst ? `${burst.point.map((v) => v.toFixed(1)).join(',')} at t ${burst.t.toFixed(2)} s` : 'none in 4 s'}`, ...lines].join(NL));
    expect(record.impact, 'the disc record bounces').toBe(false);
    expect(first, 'it met something').not.toBeNull();
    expect(first!.kind, 'the first contact is a bounce, not a burst').toBe('bounce');
    expect(first!.point[0] - THROWER[0], 'the first contact 225-230 u out, as on the original (a 15 u margin)').toBeGreaterThan(210);
    expect(first!.point[0] - THROWER[0]).toBeLessThan(245);
    expect(restAt, 'it comes to rest').not.toBeNull();
    expect(restAt!.t, 'at rest within ~3 s (the original ~2 s)').toBeLessThan(3);
    expect(restOff, 'at rest within 40 u of the original rest point').toBeLessThan(40);
  });
});
