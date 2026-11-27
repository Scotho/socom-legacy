// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  flashLevel, GAME_FRAME_DT, gridCast, launchGrenade, M67, MARK141, polygonNormal, stepGrenade,
  VIGI_TUNNEL_CEILING_KEPT_SPEED_ADAPTATION, VIGI_TUNNEL_CEILING_MIN_DOWN_ADAPTATION, VIGI_TUNNEL_CEILING_OWNERS_ADAPTATION,
  type ThrowableRecord,
} from '@s2u/scene';
import { simMapFromBytes, type SimMap } from '../src/simMap';

/**
 * VIGI-CEILING (MISSION OT.R140, an INTENTIONAL DIVERGENCE, the owner's). A dev-disc test: it skips without `SOCOM_DISC`.
 * (1) The table's six owners are MP51's and no other map's (by `CollisionOwner.path` over every map archive); each owner's
 *     faces steeper than the table's 45 degrees are printed (the ceilings the rule can meet from below, and the floors).
 * (2) IQ-084's captured launch (the r0004 capture on Shadow PC 2; the port matched it before this change, #213: the
 *     ceiling 5.0 u and the burst 1.0 u from the original's) flown by the port with the divergence: the flashbang now
 *     carries down wc12A's tunnel past the original's burst point. The burst, its distance and the thrower's flash level
 *     are printed for the owner to judge the factor. A frag from the same launch is printed beside it.
 * Archive paths are passed as `RUN/<file>` (`simMapFromBytes`' stem takes the text after the last '/').
 */

const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : '';
const RUN = DISC ? resolve(DISC, 'RUN') : '';
const HAVE_DISC = !!RUN && existsSync(RUN);
type V3 = [number, number, number];
const NL = String.fromCharCode(10);
const readMap = (file: string): SimMap => simMapFromBytes(new Uint8Array(readFileSync(resolve(RUN, file))), `RUN/${file}`);
// Every map archive: the multiplayer MP*.ZDB and the campaign's M*.ZDB (the forge loads both; the campaign reuses wc<NN>
// chunk names, research 313). The review's F1.
const archives = HAVE_DISC ? readdirSync(RUN).filter((f) => /^MP?\d+\.ZDB$/i.test(f)).sort() : [];
const MP51_FILE = archives.find((f) => /^MP51\.ZDB$/i.test(f)) ?? 'MP51.ZDB';
const HAVE_MP51 = HAVE_DISC && existsSync(resolve(RUN, MP51_FILE));
const TABLE = new Set<string>(VIGI_TUNNEL_CEILING_OWNERS_ADAPTATION);

function collisionOwners(map: SimMap): { path: string; polys: readonly { points: Float32Array }[] }[] {
  const out: { path: string; polys: readonly { points: Float32Array }[] }[] = [];
  for (const o of map.grid.objects) if (o.kind === 'collision') out.push({ path: o.owner.path, polys: o.polys });
  return out;
}

describe.skipIf(!HAVE_DISC)('VIGI-CEILING (1): the six tunnel owners are MP51 and no other map, campaign included', () => {
  it('every listed owner is on MP51 (wc12A di_tunnels_wc12 with a level face); no other archive holds any listed owner', () => {
    const lines: string[] = [];
    const elsewhere: string[] = [];
    const unread: string[] = [];
    let vaultLevel = 0;
    for (const file of archives) {
      let map: SimMap;
      try { map = readMap(file); } catch (err) { unread.push(`${file} (${String(err).slice(0, 80)})`); continue; }
      const owners = collisionOwners(map);
      if (file === MP51_FILE) {
        for (const path of VIGI_TUNNEL_CEILING_OWNERS_ADAPTATION) {
          const mine = owners.filter((o) => o.path === path);
          expect(mine.length, `${path} on MP51`).toBeGreaterThan(0);
          let down = 0, up = 0, walls = 0;
          for (const o of mine) for (const p of o.polys) {
            const n = polygonNormal(p.points);
            if (!n) continue;
            const ny = n[1] / Math.hypot(n[0], n[1], n[2]);
            if (ny <= -VIGI_TUNNEL_CEILING_MIN_DOWN_ADAPTATION) down++;
            else if (ny >= VIGI_TUNNEL_CEILING_MIN_DOWN_ADAPTATION) up++;
            else walls++;
          }
          if (path.endsWith('/di_tunnels_wc12')) vaultLevel = down + up;
          lines.push(`${path}: ${mine.reduce((s, o) => s + o.polys.length, 0)} faces -- ${down} wound facing down, ${up} facing up (within 60 degrees of level), ${walls} nearer vertical`);
        }
      } else {
        for (const o of owners) if (TABLE.has(o.path)) elsewhere.push(`${file}: ${o.path}`);
      }
    }
    console.log(['VIGI-CEILING (1) MP51 TUNNEL OWNERS (a contact counts as a ceiling when met from below, whatever the winding)', ...lines,
      `archives read: ${archives.length - unread.length} of ${archives.length}${unread.length ? ` -- UNREAD: ${unread.join('; ')}` : ''}`,
      `other archives holding a listed owner: ${elsewhere.length ? elsewhere.join('; ') : 'none'}`].join(NL));
    expect(archives.length, 'map archives found').toBeGreaterThan(1);
    expect(unread.filter((u) => /^MP/i.test(u)), 'every multiplayer archive read').toEqual([]);
    expect(vaultLevel, 'the wc12A vault owner has a level face').toBeGreaterThan(0);
    expect(elsewhere, 'no listed owner on any other map').toEqual([]);
  });
});

/** IQ-084: the mean full-hold flashbang launch (shadow/VIGITHROW-ORIG-PC2/SUMMARY.md); the original burst near (1076.9, -27.0, 781.9). */
const IQ084 = { thrower: [1015, -17.6, 811] as V3, launch: [1021.54, 5.63, 815.29] as V3, vel: [217.0, 97.9, -1.1] as V3, origBurst: [1076.9, -27.0, 781.9] as V3 };

function fly(map: SimMap, record: ThrowableRecord): { burst: V3 | null; lines: string[] } {
  const cast = gridCast(map.grid, map.defaultMaterial ?? '');
  const g = launchGrenade(IQ084.launch, IQ084.vel, record);
  const lines: string[] = [];
  let burst: V3 | null = null;
  for (let i = 0; i < 200 && g.state !== 'removed' && !burst; i++) {
    for (const e of stepGrenade(g, GAME_FRAME_DT, cast)) {
      const t = ((i + 1) * GAME_FRAME_DT).toFixed(2);
      if (e.kind === 'bounce') {
        const q = e.point;
        const listed = e.owner !== undefined && TABLE.has(e.owner) && e.normal[1] <= -VIGI_TUNNEL_CEILING_MIN_DOWN_ADAPTATION;
        lines.push(`  bounce ${e.owner ?? '?'} ${e.material} at ${q.map((v) => v.toFixed(1)).join(',')} n_y ${e.normal[1].toFixed(2)} t ${t} s, speed ${e.speed.toFixed(1)}${listed ? '  <- a LISTED CEILING (kept speed)' : ''}`);
      }
      if (e.kind === 'explode') burst = [...(e as { point: V3 }).point];
    }
  }
  return { burst, lines };
}

describe.skipIf(!HAVE_MP51)('VIGI-CEILING (2): IQ-084 launch with the divergence carries down wc12A', () => {
  it('the flashbang carries past the original burst point; burst, distance and flash level printed (a frag beside it)', () => {
    const map = readMap(MP51_FILE);
    const eye: V3 = [IQ084.thrower[0], IQ084.thrower[1] + 13, IQ084.thrower[2]];
    const out: string[] = [`VIGI-CEILING (2) IQ-084 WITH THE DIVERGENCE (kept-speed ${VIGI_TUNNEL_CEILING_KEPT_SPEED_ADAPTATION}; the original burst ${IQ084.origBurst.join(',')})`];
    const flash = fly(map, MARK141);
    for (const [name, r] of [['flashbang', flash], ['frag', fly(map, M67)]] as const) {
      if (!r.burst) { out.push(`${name}: NO BURST`, ...r.lines); continue; }
      const dv: V3 = [r.burst[0] - eye[0], r.burst[1] - eye[1], r.burst[2] - eye[2]];
      const dist = Math.hypot(dv[0], dv[1], dv[2]);
      const facing = dist > 0 ? dv[0] / dist : 1;
      out.push(`${name}: burst at ${r.burst.map((v) => v.toFixed(1)).join(',')}, ${(r.burst[0] - IQ084.origBurst[0]).toFixed(1)} u further along +x than the original, dist ${dist.toFixed(1)} from the eye, facing ${facing.toFixed(2)}, flash ${name === 'flashbang' ? (flashLevel(dist, facing) ?? 'none') : 'n/a'}`, ...r.lines);
    }
    console.log(out.join(NL));
    expect(flash.burst, 'the flashbang bursts').not.toBeNull();
    expect(flash.burst![0], 'it carries at least 30 u further down the tunnel than the original').toBeGreaterThan(IQ084.origBurst[0] + 30);
  });
});
