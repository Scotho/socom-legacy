// @vitest-environment node
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { segmentHits, surfaceMaterial, type CollisionOwner, type WorldPoly } from '@s2u/scene';
import { blastExposed } from '../../viewer/src/net/blast';
import { fragmentCount, fragmentDamage } from '../../viewer/src/net/damage';
import { blastLine } from '../../viewer/src/sceneHealth';
import { roomOn, surfacesOver } from './sceneRoundsDisc';

/**
 * NADE-BLAST (Machete's report, 2026-11-11: "deaths from nades thru walls and windows"), dev disc: a real M67 (the kit
 * table's record, `RUN/ZWEAPON.ZAR`) going off in a real room on a real map (`roomOn`: `loadSimMap`), through the room's
 * own player path (`blastPlayers`, the one `blast()` and the bomb take), on a SEAL placed (a) in the open, (b) behind a
 * solid wall, (c) behind an intact window pane, (d) behind the same pane broken, (e) through an open doorway (and, as
 * its control, the same door shut) -- each at a body-minus-blast height of 0, +100, -100, +250 and -250 -- and, for the
 * reach shrink the explosion's own line applies (`FUN_003c80e0`), behind MP61's access1 METAL_GRATE at 80 u and 110 u.
 * A positive height lifts the body over its floor (as on a roof or in a jump), a negative one lifts the blast over the
 * body's floor (an airburst): nothing is put under the ground. It records what the port deals (a table on stdout) and
 * asserts only what the original's reading decides.
 *
 * The original's reading (the synthesis of 2026-11-11, reading, pending review): a SEAL is hurt only when two lines are
 * both clear -- LINE 1, the explosion's walk (`FUN_003c7dd0` D:L318974-318992 -> `FUN_003c80e0` D:L319096-319143), to
 * the midpoint of one of the body's node boxes (`FUN_003c7ee0` D:L319005-319075; WHICH node is unread -- capture C1),
 * judged by the radius squared times each face's PENETRATION against the line's length squared; and LINE 2, the body's
 * own (`FUN_005ac070` -> `FUN_005a0e70`), to the animated head bone (`actor+0x308`, D:L464841/D:L464853; its height
 * unread), vetoed by the first face that is cover. Then the falloff to the feet and the fragment count, as the port's.
 * The port checks line 2 alone, to a head HEAD_OVER above the feet (`room.ts` 18.3 / 11.1 / 1.7).
 *
 * The oracle here does not guess the two unread end points: it judges each line against every point of the body's
 * column (the feet + 0.5 up to the port's head, 1 u apart, at the feet's x and z), with the port's own transcriptions of
 * the two tests -- `blastExposed` for line 2 (one-sided, the exposure test's see-through set) and `blastLine` for
 * line 1 (the PENETRATION product; BLAST_REACH_LINE_SIDES_READING two-sided) -- and decides only when the column agrees:
 * 'none' when every point is shut off on line 2, or every point on line 1; 'damage' when every point is open on both
 * and the radius and the fragment count (the room's own draw, 0.5) leave something; 'unread' otherwise (it rests on C1
 * or the head bone). Its assumptions, stated: both end points lie in that column (the head bone over the feet within
 * the port's head height: the posed eye is 15.88 standing, 9.90 crouched, research 180 s1.3; lean and the prone head's
 * forward offset are unread, so a prone body is never decided by the lines); and the two predicates are right (this
 * file cannot catch an error in `blastExposed` or `blastLine` themselves -- e.g. research 281 s4.3's one-sided reading).
 *
 * A broken pane is its glass node switched off as the scene's world switches a dead node (`worldState.ts`
 * `setOwnerActive`, `m_active` bit 0); an open door, its slab's node off the same way (the slab out of the doorway).
 * It skips without the disc (a skip, not a pass).
 */
const DISC = [process.env.SOCOM_DISC, process.env.SOCOM_PC_ROOT ? join(process.env.SOCOM_PC_ROOT, 'game/disc') : undefined]
  .find((d) => !!d && existsSync(join(d, 'RUN/MP71.ZDB')) && existsSync(join(d, 'RUN/MP61.ZDB')) && existsSync(join(d, 'RUN/ZWEAPON.ZAR')));

type V3 = [number, number, number];
type Posture = 'stand' | 'crouch' | 'prone';
type Verdict = 'damage' | 'none' | 'unread';
type Thrown = { record: { explosionRadius: number; explosionDamage: number; name: string; id: number }; piercing: number; fragments: boolean };

/** The room's `HEAD_OVER` (`room.ts`, unexported): the port's head above the feet. */
const HEAD_OVER: Record<Posture, number> = { stand: 18.3, crouch: 11.1, prone: 1.7 };
/** The room's `sightFrom` (IMPACT_SIGHT_READING = BOUNCE_LIFT, 0.1 toward the end point): copied, the room keeps it private. */
const sight = (p: V3, h: V3): V3 => {
  const d = [h[0] - p[0], h[1] - p[1], h[2] - p[2]], l = Math.hypot(d[0]!, d[1]!, d[2]!);
  if (!(l > 0.1)) return p;
  const k = 0.1 / l;
  return [p[0] + d[0]! * k, p[1] + d[1]! * k, p[2] + d[2]! * k];
};
/** Where a resting grenade's point is taken over its floor (a stand-in: the blast at rest sits on the ground). */
const REST_LIFT = 1;
const HEIGHTS = [0, 100, -100, 250, -250] as const;

type Site = { name: string; map: 'MP71' | 'MP61'; blast: [number, number]; body: [number, number]; blastFloorHint: number; bodyFloorHint: number; airburst?: number; off?: RegExp; postures?: Posture[]; heights?: readonly number[] };

/**
 * MP71 (default STONE), the house h8wc1: its north wall at z 598.4-600 (`int81`/`ext81`), floor 179 both sides, the
 * roof over the inside (z < 598) at 217-221. Its window01: a GLASS (0.99) pane at z 599, x 2491-2503, y 191-206 (sill
 * 12 u over the floor), the wall below and above it. Its door door_ft_6: a WOOD_THICK slab at x 2467-2481, y 179-205.
 * The wall at x 2440 is WOOD_THICK past y 210. MP61 (default STONE): access1's METAL_GRATE (0.4) at z 1033.5, x
 * 658-690, y 41-71 -- the floor falls south (39.9 at z 1020, 30.2 at z 1100).
 */
const SITES: Site[] = [
  { name: '(a) open ground', map: 'MP71', blast: [2480, 640], body: [2480, 675], blastFloorHint: 179, bodyFloorHint: 179 },
  { name: '(b) solid wall', map: 'MP71', blast: [2440, 620], body: [2440, 585], blastFloorHint: 179, bodyFloorHint: 179 },
  { name: '(c) intact pane', map: 'MP71', blast: [2497, 620], body: [2497, 594], blastFloorHint: 179, bodyFloorHint: 179, postures: ['stand', 'crouch', 'prone'] },
  { name: '(d) broken pane', map: 'MP71', blast: [2497, 620], body: [2497, 594], blastFloorHint: 179, bodyFloorHint: 179, off: /window01=window01\/wframe\/wglass$/, postures: ['stand', 'crouch', 'prone'] },
  { name: '(e) open doorway', map: 'MP71', blast: [2474, 620], body: [2474, 585], blastFloorHint: 179, bodyFloorHint: 179, off: /door_ft_6\/door_one_left=door_one_left\/door_slab$/ },
  { name: '(e0) shut door', map: 'MP71', blast: [2474, 620], body: [2474, 585], blastFloorHint: 179, bodyFloorHint: 179 },
  { name: '(g) grate, 80 u', map: 'MP61', blast: [674, 1028.5], body: [674, 1108.5], blastFloorHint: 41, bodyFloorHint: 35, airburst: 56, heights: [0] },
  { name: '(g) grate, 110 u', map: 'MP61', blast: [674, 1028.5], body: [674, 1138.5], blastFloorHint: 41, bodyFloorHint: 35, airburst: 56, heights: [0] },
];

type Row = {
  site: string; map: string; posture: Posture; dy: number; blast: V3; feet: V3; d: number;
  l2Head: boolean; l2Open: number; l1Open: number; samples: number; l2From: number | null; l1From: number | null; blockers: string;
  reading: Verdict; why: string; fragments: number; damage: number;
};

/** The highest surface over (x, z) no higher than `hint` + 2: the floor the site stands on (not a roof over it). */
function floorAt(ground: Parameters<typeof surfacesOver>[0], x: number, z: number, hint: number): number {
  const ys = surfacesOver(ground, x, z).filter((y) => y <= hint + 2);
  if (ys.length === 0) throw new Error(`no floor at ${x}, ${z} under ${hint}`);
  return ys.at(-1)!;
}

describe.skipIf(!DISC)(`NADE-BLAST: an M67 through walls, panes and doorways on MP71 and MP61 (dev disc${DISC ? '' : ': SOCOM_DISC / SOCOM_PC_ROOT absent -- skipped'})`, () => {
  const rows: Row[] = [];
  let radius = 0;

  beforeAll(async () => {
    for (const stem of ['MP71', 'MP61'] as const) {
      const s = await roomOn(DISC!, stem);
      const room = s.room as unknown as {
        thrown(kind: string): Thrown | null;
        blastPlayers(t: Thrown, point: V3, ownerOf: () => null, facing: undefined, name: string): void;
        combat: (a: unknown, q: unknown, data: { status: string; rawDamage?: number; hitLocations?: unknown[] }) => void;
        kill: (...args: unknown[]) => void;
      };
      const t = room.thrown('M67')!;
      expect(t.record.name).toBe('M67');
      radius = t.record.explosionRadius;
      // The victim's report and kill are only listened to: the body stays up for the next case (its health put back).
      let report: { status: string; rawDamage?: number; hitLocations?: unknown[] } | null = null;
      room.combat = (_a, q, data) => { if (q === s.player(2)) report = data; };
      room.kill = () => {};
      const victim = s.player(2) as unknown as { alive: boolean; health: { hp: number[]; armour: number[] }; sim: { walker: { state: { x: number; y: number; z: number }; posture_: Posture } } };
      const hp0 = [...victim.health.hp], armour0 = [...victim.health.armour];
      const grid = s.map.grid, def = s.map.defaultMaterial ?? '';
      const owners = new Set<CollisionOwner>();
      for (const o of grid.objects) if (o.kind === 'collision') owners.add(o.owner);
      const penetration = (p: WorldPoly): number => surfaceMaterial(p.material, def).penetration;

      for (const site of SITES.filter((x) => x.map === stem)) {
        const switched = site.off ? [...owners].filter((o) => site.off!.test(o.path)) : [];
        if (site.off) expect(switched.length, `${site.name}: the node to switch off`).toBeGreaterThan(0);
        const kept = switched.map((o) => o.flags);
        for (const o of switched) o.flags = (o.flags ?? 1 << 12) & ~1;
        try {
          const blastFloor = floorAt(s.map.ground, site.blast[0], site.blast[1], site.blastFloorHint);
          const bodyFloor = floorAt(s.map.ground, site.body[0], site.body[1], site.bodyFloorHint);
          for (const posture of site.postures ?? ['stand']) for (const dy of site.heights ?? HEIGHTS) {
            const base = site.airburst ?? blastFloor + REST_LIFT;
            const blast: V3 = [site.blast[0], base + (site.airburst === undefined && dy < 0 ? -dy : 0), site.blast[1]];
            const feet: V3 = [site.body[0], bodyFloor + (site.airburst === undefined && dy > 0 ? dy : 0), site.body[1]];
            const d = Math.hypot(feet[0] - blast[0], feet[1] - blast[1], feet[2] - blast[2]);

            // The oracle: each line against the body's column.
            const top = HEAD_OVER[posture];
            const hs: number[] = [];
            for (let h = 0.5; h < top; h += 1) hs.push(h);
            hs.push(top);
            let l2Open = 0, l1Open = 0, l2From: number | null = null, l1From: number | null = null;
            const blockers = new Set<string>();
            for (const h of hs) {
              const p: V3 = [feet[0], feet[1] + h, feet[2]];
              if (blastExposed(grid, sight(blast, p), p, def)) { l2Open++; l2From ??= h; }
              if (blastLine(grid, sight(blast, p), p, '\u0000no-target', radius, penetration)) { l1Open++; l1From ??= h; }
            }
            const head: V3 = [feet[0], feet[1] + top, feet[2]];
            const l2Head = blastExposed(grid, sight(blast, head), head, def);
            const count = fragmentCount(d, posture, () => 0.5);
            let reading: Verdict, why: string;
            if (!(fragmentDamage(t.record.explosionDamage, radius, d) > 0) || count === 0) [reading, why] = ['none', d >= radius ? 'outside the radius' : 'no fragment'];
            else if (posture === 'prone') [reading, why] = ['unread', "the prone body's points (forward of the feet)"];
            else if (l2Open === 0) [reading, why] = ['none', 'line 2 shut at every point'];
            else if (l1Open === 0) [reading, why] = ['none', 'line 1 shut at every point'];
            else if (l2Open === hs.length && l1Open === hs.length) [reading, why] = ['damage', 'both lines open at every point'];
            else [reading, why] = ['unread', l1Open < hs.length ? 'C1 (line 1 end point)' : 'the head bone'];
            if (l2Open < hs.length || l1Open < hs.length) {
              const p: V3 = [feet[0], feet[1] + 0.5, feet[2]];
              for (const h of segmentHits(grid, sight(blast, p), head, () => true, undefined, false)) {
                blockers.add(`${h.owner.path.split('/').slice(-2).join('/')}:${surfaceMaterial(h.poly.material, def).name}`);
              }
            }

            // The port: the room's own player path.
            victim.health.hp.splice(0, hp0.length, ...hp0);
            victim.health.armour.splice(0, armour0.length, ...armour0);
            victim.alive = true;
            Object.assign(victim.sim.walker.state, { x: feet[0], y: feet[1], z: feet[2] });
            victim.sim.walker.posture_ = posture;
            s.place(1, [feet[0] + 2000, feet[1], feet[2]]);   // the thrower far off (out of every radius)
            report = null;
            room.blastPlayers(t, blast, () => null, undefined, 'P1');
            const applied = report as { status: string; rawDamage?: number; hitLocations?: unknown[] } | null;
            const fragments = applied?.status === 'applied' ? applied.hitLocations?.length ?? 0 : 0;
            const damage = applied?.status === 'applied' ? applied.rawDamage ?? 0 : 0;
            rows.push({
              site: site.name, map: stem, posture, dy, blast, feet, d, l2Head, l2Open, l1Open, samples: hs.length, l2From, l1From,
              blockers: [...blockers].join(' '), reading, why, fragments, damage,
            });
          }
        } finally {
          switched.forEach((o, i) => { if (kept[i] === undefined) delete o.flags; else o.flags = kept[i]!; });
        }
      }
    }
  }, 600_000);

  afterAll(() => {
    const f = (v: number): string => v.toFixed(1);
    console.log(`M67: radius ${radius}; ${rows.length} cases`);
    console.table(rows.map((r) => ({
      case: r.site, map: r.map, posture: r.posture, 'body-blast dy': r.dy, blast: r.blast.map(f).join(','), feet: r.feet.map(f).join(','), 'd(feet)': f(r.d),
      'port L2@head': r.l2Head ? 'open' : 'shut', 'L2 open': `${r.l2Open}/${r.samples}`, 'L2 from h': r.l2From ?? '-',
      'L1 open': `${r.l1Open}/${r.samples}`, 'L1 from h': r.l1From ?? '-',
      reading: r.reading, why: r.why, 'port frags': r.fragments, 'port dmg': Math.round(r.damage),
      verdict: r.reading === 'unread' ? '-' : (r.fragments > 0 ? 'damage' : 'none') === r.reading ? 'agrees' : 'CONTRADICTS',
      blockers: r.blockers,
    })));
  });

  const port = (r: Row): Verdict => (r.fragments > 0 ? 'damage' : 'none');
  const row = (site: string, posture: Posture, dy: number): Row => rows.find((r) => r.site === site && r.posture === posture && r.dy === dy)!;

  it('the matrix ran: every site at every height and posture, the M67 its kit-table radius (150)', () => {
    expect(radius).toBe(150);
    expect(rows).toHaveLength(4 * 5 + 2 * 3 * 5 + 2);
  });

  it('beyond the radius (+-250) no body is hurt, whatever lies between (the falloff, FUN_005a0e70 L459235-459256)', () => {
    const far = rows.filter((r) => Math.abs(r.dy) === 250);
    expect(far.length).toBeGreaterThan(0);
    for (const r of far) expect([r.site, r.posture, r.dy, r.reading, port(r)]).toEqual([r.site, r.posture, r.dy, 'none', 'none']);
  });

  it('the open ground and the open doorway at one height: both lines open at every point of the body -- hurt', () => {
    for (const site of ['(a) open ground', '(e) open doorway']) {
      const r = row(site, 'stand', 0);
      expect([site, r.reading, port(r)]).toEqual([site, 'damage', 'damage']);
    }
  });

  it('the solid wall, the intact pane (standing and crouched) and the shut door at one height: line 2 shut at every point -- not hurt', () => {
    for (const [site, posture] of [['(b) solid wall', 'stand'], ['(c) intact pane', 'stand'], ['(c) intact pane', 'crouch'], ['(e0) shut door', 'stand']] as const) {
      const r = row(site, posture, 0);
      expect([site, posture, r.reading, port(r)]).toEqual([site, posture, 'none', 'none']);
    }
  });

  it('every case the reading decides but the grate beyond its reach: the port agrees', () => {
    const decided = rows.filter((r) => r.reading !== 'unread' && r.site !== '(g) grate, 110 u');
    expect(decided.length).toBeGreaterThan(0);
    expect(decided.filter((r) => port(r) !== r.reading).map((r) => `${r.site} ${r.posture} ${r.dy}`)).toEqual([]);
  });

  it('the grate at 80 u, inside its reach (150 x sqrt(0.4) = 94.9 u): hurt in both', () => {
    const r = row('(g) grate, 80 u', 'stand', 0);
    expect([r.reading, port(r)]).toEqual(['damage', 'damage']);
  });

  // Item 4 of the synthesis: line 1's PENETRATION product shrinks the M67's reach through a METAL_GRATE (0.4) to
  // 150 x sqrt(0.4) = 94.9 u, so a body 110 u behind access1 is spared; line 2 sees through the grate (r0004), and the
  // port, testing line 2 alone, hurts him. Fails today; passes once the room tests line 1 (then drop `.fails`).
  it('the grate at 110 u, beyond its reach: line 1 shut at every point of the body, line 2 open at every one', () => {
    const r = row('(g) grate, 110 u', 'stand', 0);
    // FRAG-COUNT: at 115 u the oracle's count (the room's draw of 0.5) is 0, so its reading says 'no fragment' before the
    // lines; the lines themselves are what this case pins -- line 1 shut at every point, line 2 open at every one.
    expect([r.reading, r.l1Open, r.l2Open]).toEqual(['none', 0, r.samples]);
  });

  // NADE-BLAST (V21-AA): the room tests line 1 -- `.fails` dropped (red on the base, which hurt him).
  it('the grate at 110 u: not hurt (the base hurt him: it had no line 1)', () => {
    expect(port(row('(g) grate, 110 u', 'stand', 0))).toBe('none');
  });
});
