import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { polygonNormal, segmentHits, SURFACE_SIDE, SURFACE_SKIP, surfaceWord, type Grid, type V3 } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { loadMap } from '../src/loadMap';
import { groundGrid } from '../src/mover';
import { releaseAimSin, throwClear, throwClearanceSegment } from '../src/throwCommit';
import type { PlaySnapshot } from '../src/walk';

/**
 * LATER 247 (the owner, 2026-10-21: "the first grenade throws, but then the next few the arc animation shows but the
 * grenade is not thrown"): reproduced in a rendered match (`agent-mail/evidence/l247-throw-repro-20261021`) as the
 * release refused by PAR-20 D12's clearance (`FUN_005499e0` D:L413977-414063; research 256 §5) with the SEAL against
 * MP2's dock barrier, the arc drawn through the hold (`FUN_005970b0` D:L454091-454188) and the refusal zeroing the
 * power alone (D:L475497-475498). The standing segment enters the barrier's face from its front -- the hand end in front
 * of the face's own normal, the far end behind it -- which the original's one-sided hull test counts too
 * (`FUN_002d2890` side mode 0x20, D:L174831-174837, the hull's colliders D:L215827-215828; research 281 §4.2-§4.3:
 * reading; the microcode re-read from the ELF by LATER 247's review). The node word's bit 21 is clear (research 256 §5's
 * one mapped writer of the owner skip, `+0xa1` mask 4; the others unread, LATER 256), so whether the original skips this
 * owner is the open term, under `THROW_CLEARANCE_QUERY_PLACEHOLDER`. Four units back the segment meets nothing and the
 * throw goes.
 *
 * The pose is the rendered refusal's (pass 2, `results-pass2.json`): the feet as the hook read them, yaw 240 (the
 * teleport's -120). Its pitch and power were not recorded: the respawn's rest pitch (`init_aim_pitch`) and pass 1's
 * held power at the same spot (0.895-0.900 after a 600 ms hold) stand for them; the scratch probe found the same one hit
 * at pitches 0 and 12.
 */

const FIXTURE_ROOT = resolve(process.env.S2U_TEST_FIXTURES || resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures'));
const MP2_ZDB = fixture('RUN/MP2.ZDB');

const CONTACT: V3 = [1103.199951171875, 100, 814.7999877929688];
const BACK4: V3 = [1099.7365397070218, 100, 812.7988896085014];
const YAW = 240;
const REST_PITCH = -9.167;                                       // `dynamics.rdr`'s `init_aim_pitch`
const POWER = 0.895;
/**
 * The node word's bit 21 (`+0x5e` bit 5), which `CWorld::AddChild` maps to `+0xa1` mask 4 -- research 256 §5's one mapped
 * writer of the owner skip; the collider factories' model byte and the others are unread (LATER 256).
 */
const NODE_WORD_BIT_21 = 1 << 21;

const snap = (feet: V3): PlaySnapshot => ({
  feet: [...feet], yaw: YAW, pitch: REST_PITCH, vx: 0, vz: 0, vy: 0, airborne: false, crouched: false, stance: 'stand',
  landing: null, jumps: 0,
} as PlaySnapshot);

describe.skipIf(!MP2_ZDB)(`LATER 247: at MP2's dock barrier (worldmodel/out_di1_10) the standing release is refused -- a front entry, as the original's one-sided hull test refuses it (FUN_002d2890 side mode 0x20, research 281 s4.2); 4 back it throws${MP2_ZDB ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  let hull: Grid | undefined;
  const grid = async (): Promise<Grid> => (hull ??= groundGrid((await loadMap(new FsAssetSource(FIXTURE_ROOT), 'RUN/MP2.ZDB')).ground!));
  const query = (g: Grid, feet: V3) => {
    const s = snap(feet), aimSin = releaseAimSin(s);
    const seg = throwClearanceSegment(s, POWER, aimSin)!;
    const hits = segmentHits(g, seg.from, seg.to, (p) => (surfaceWord(p) & (SURFACE_SIDE | SURFACE_SKIP)) === SURFACE_SIDE);
    return { s, aimSin, seg, hits };
  };

  it("against the barrier: one hit, out_di1_10 entered from its front, the node word's bit 21 clear (research 256 s5's one mapped writer; the others unread, LATER 256), and the clearance refuses", async () => {
    const g = await grid();
    const { s, aimSin, seg, hits } = query(g, CONTACT);
    expect(hits).toHaveLength(1);
    const hit = hits[0]!;
    expect(hit.owner.path).toBe('worldmodel/out_di1_10');
    const n = polygonNormal(hit.poly.points)!;
    const p0 = [hit.poly.points[0]!, hit.poly.points[1]!, hit.poly.points[2]!];
    const side = (q: readonly number[]): number => n[0] * (q[0]! - p0[0]!) + n[1] * (q[1]! - p0[1]!) + n[2] * (q[2]! - p0[2]!);
    expect(side(seg.from)).toBeGreaterThan(0);                    // the hand end in front of the face's own normal
    expect(side(seg.to)).toBeLessThan(0);                         // the far end behind it: a front entry
    expect(n[0]).toBeCloseTo(-1, 6);                              // the face at x 1115 turned toward the SEAL
    expect((hit.owner.flags ?? 0) & NODE_WORD_BIT_21).toBe(0);                // bit 21 clear; the owner skip itself unread (LATER 256)
    expect(throwClear(g, s, POWER, aimSin)).toBe(false);
  }, 60_000);

  it('four units back along the heading: nothing met, the throw goes', async () => {
    const g = await grid();
    const { s, aimSin, hits } = query(g, BACK4);
    expect(hits).toEqual([]);
    expect(throwClear(g, s, POWER, aimSin)).toBe(true);
  }, 60_000);
});
