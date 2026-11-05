import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseZdb, zdbMember, Zar } from '@s2u/archive';
import { buildGrid, parseSceneGraph, polygonNormal, readKitTable, type CollisionOwner, type Grid, type GridParams, type SceneNode, type WorldPoly } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { simMapFromBytes } from '../src/simMap';
import { Traversal } from '../src/traversal';
import { groundGrid, groundPolygons, rootY, Walker, type WalkInput } from '../src/walk';
import { WEAPON_LINE_LENGTH_READING, WEAPON_LINE_M4A1_SD_PROVEN, weaponLineLength } from '../src/weaponLine';

/**
 * SEGMENT-BODY part 2, the weapon line (web research 86 s3.8 and s3.1; research 281 s4.1). The stored contact
 * `actor+0x1090..+0x10ac` has a second source beside the body's segment records: the slot `actor+0x1140..+0x115c`, cleared
 * as each tick begins (`FUN_0054d9a0` D:L416434) and filled by a level segment cast along the facing (D:L416630-416687)
 * from the feet at the skeleton root's height (`FUN_0054e8f0` D:L416877-416880), 2 x the held weapon model's x extent
 * long plus the tick's displacement (D:L416892-416905); `FUN_005483d0` copies the slot into the contact when no record
 * hits (D:L413618-413671). So a still body forms a contact up to about 23 u out, and an oblique walk-in forms one
 * before any record meets the face -- what the capture of the original shows (r0004, ac, 2026-11-04, `climb-angle/`).
 */

const STILL: WalkInput = { forward: 0, right: 0, boost: false };
const input = (forward: number): WalkInput => ({ forward, right: 0, boost: false });
/** The mover's forward on the ground at a yaw (`walk.ts`: forward is (-sin, -cos)). */
const forward = (yaw: number): [number, number] => [-Math.sin((yaw * Math.PI) / 180), -Math.cos((yaw * Math.PI) / 180)];

describe('the weapon line\'s length: 2 x the held model\'s x extent (FUN_0054e8f0 D:L416892-416902)', () => {
  it('the M4A1 SD: 22.930, as read in the original running (r0004, ac, 2026-11-04 09:16Z: bounds x -3.679799 to 7.785366)', () => {
    // The model's +0x40 bounds and its flag word +0x5c as ac read them in RDRAM (WEAPON-LINE.md section 1 and 2).
    const bbox = Float32Array.from([-3.679799, -1.39975, -0.3755144, 7.785366, 1.775333, 0.3755953]);
    expect(weaponLineLength({ flags: 0x80800855, bbox })).toBeCloseTo(22.9303, 4);
    expect(WEAPON_LINE_M4A1_SD_PROVEN).toBeCloseTo(22.930, 3);
    expect(WEAPON_LINE_LENGTH_READING.m4Acarbine_sd).toBeCloseTo(WEAPON_LINE_M4A1_SD_PROVEN, 3);
    // Inside the capture's bracket for the reach along the facing (22.5-23.4; OBLIQUE-CLIMB-READ section 1).
    expect(WEAPON_LINE_M4A1_SD_PROVEN).toBeGreaterThan(22.5);
    expect(WEAPON_LINE_M4A1_SD_PROVEN).toBeLessThan(23.4);
  });

  it('the +0x5f flag is bit 6 (the byte shifted left 57, D:L416894): 0x80 is clear and the bounds are the model\'s own; 0x40 is not built', () => {
    const bbox = Float32Array.from([-1, 0, 0, 2, 0, 0]);
    expect(weaponLineLength({ flags: 0x80000000, bbox })).toBe(6);
    expect(weaponLineLength({ flags: 0x7f000000 & ~0x40000000, bbox })).toBe(6);
    // Bit 6 set walks the +100 chain through FUN_00541510 (D:L408768 on): no weapon on the disc sets it (the table's test).
    expect(() => weaponLineLength({ flags: 0x40000000, bbox })).toThrow(/FUN_00541510/);
  });
});

const MP2 = fixture('RUN/MP2.ZDB');

describe.skipIf(!MP2)(`the weapon line's table against the disc's weapon models${MP2 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it('WEAP_GEO\'s 59 models: every length is 2 x |bbox x max - x min|, and none sets +0x5f bit 6', () => {
    const toc = parseZdb(MP2!);
    const models = parseSceneGraph(Zar.parse(zdbMember(MP2!, toc, 'WEAP_GEO.ZED')));
    expect(models).toHaveLength(59);
    const flagged = models.filter((m) => ((m.flags >>> 24) & 0x40) !== 0).map((m) => m.name);
    expect(flagged).toEqual([]);
    const table: Record<string, number> = {};
    for (const m of models) table[m.name] = weaponLineLength(m);
    expect(Object.keys(WEAPON_LINE_LENGTH_READING).sort()).toEqual(Object.keys(table).sort());
    for (const [name, length] of Object.entries(table)) expect(WEAPON_LINE_LENGTH_READING[name], name).toBeCloseTo(length, 3);
  });
});

const ZWEAPON = fixture('RUN/ZWEAPON.ZAR');

describe.skipIf(!MP2 || !ZWEAPON)(`every firearm a kit can hold has its weapon line${MP2 && ZWEAPON ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  // Part 4 (fresh review 1's F1, F7): the kit's models (`./loadout` `slotModel`, the item's `ModelName`) are the names
  // the length is looked up by, so each firearm record's model is in `WEAP_GEO`; `FUN_0054e8f0` casts only when the held
  // model's `aimpoint` (`+0x14ac`, D:L416874) and `firepoint` (`+0x14bc`, D:L416882) nodes were found at the mount (the
  // body's slot +100, research 202 s3.10) -- both present on every firearm's model.
  it('each firearm record\'s ModelName has a length, and its model an aimpoint and a firepoint node', () => {
    const kits = readKitTable(ZWEAPON!);
    const toc = parseZdb(MP2!);
    const models = new Map(parseSceneGraph(Zar.parse(zdbMember(MP2!, toc, 'WEAP_GEO.ZED'))).map((m) => [m.name, m]));
    const names = (n: SceneNode): string[] => [n.name, ...n.children.flatMap(names)];
    const firearms = [...kits.records.keys()].map((id) => kits.arsenal.items.get(id)!.model).filter((m): m is string => !!m);
    expect(firearms.length).toBeGreaterThan(30);
    // The mover's own lookup (`Walker.weaponLineLength`), case aside as the model's (research 94's
    // `MODEL_NAME_CASE_READING`: the SA-80 A2 names `IW80A2`, `WEAP_GEO` holds `iw80a2`).
    const w = new Walker(crate().grid);
    w.hand = 0;
    const missing: string[] = [];
    for (const model of new Set(firearms)) {
      w.heldModels = { rifle: model, pistol: null };
      const geo = [...models.keys()].find((n) => n.toLowerCase() === model.toLowerCase());
      if (w.weaponLineLength() === null || geo === undefined) { missing.push(`${model}: no length`); continue; }
      expect(w.weaponLineLength(), model).toBe(WEAPON_LINE_LENGTH_READING[geo]);
      const nodes = names(models.get(geo)!);
      for (const node of ['aimpoint', 'firepoint']) if (!nodes.includes(node)) missing.push(`${model}: no ${node}`);
    }
    expect(missing).toEqual([]);
  });
});

// ---- without the disc: a synthetic crate, the same rule ---------------------------------------------------------

const quad = (pts: number[], ditype: number, appflags = 0): WorldPoly => ({
  modelName: 'worldmodel', path: 'worldmodel/q', region: 0, ditype, material: 25, ptcount: 4, cameratype: 0, appflags, points: Float32Array.from(pts),
});
const floor = (x0: number, z0: number, x1: number, z1: number, y: number): WorldPoly => quad([x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1], 3);
function world(polys: WorldPoly[]): Grid {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  return buildGrid(params, [], [], polys, owners);
}

/** An appflags-4 crate 14 tall: its south face the plane z = 0 from x -80 to 80, facing +z; its top a floor. */
function crate(): { grid: Grid; polys: WorldPoly[] } {
  const polys = [
    floor(-150, -150, 150, 150, 0),
    quad([-80, 0, 0, 80, 0, 0, 80, 14, 0, -80, 14, 0], 2, 4), quad([80, 0, -40, -80, 0, -40, -80, 14, -40, 80, 14, -40], 2, 4),
    quad([-80, 0, -40, -80, 0, 0, -80, 14, 0, -80, 14, -40], 2, 4), quad([80, 0, 0, 80, 0, -40, 80, 14, -40, 80, 14, 0], 2, 4),
    floor(-80, -40, 80, 0, 14),
  ];
  return { grid: world(polys), polys };
}

describe('the weapon line forms the stored contact without a record hit (FUN_005483d0 D:L413618-413671), no disc', () => {
  const at = (yaw: number, z = 15): { w: Walker; t: Traversal } => {
    const { grid, polys } = crate();
    const w = new Walker(grid), t = new Traversal(grid, polys);
    w.driver = t;
    expect(w.place(0, 5, z)).toBe(true);
    w.state.yaw = yaw;
    return { w, t };
  };

  it('standing still 15 out, square and at 30 degrees: the contact is the weapon line\'s hit and CLIMB is offered; at 60: neither', () => {
    for (const yaw of [0, 30, -30]) {
      const { w, t } = at(yaw);
      for (let i = 0; i < 5; i++) w.tick(STILL);
      const c = w.storedContact();
      expect(c, `yaw ${yaw}: a stored contact`).not.toBeNull();
      // The slot's point: on the face, along the facing, at the feet + the root's height (D:L416877-416880).
      const [fx, fz] = forward(yaw);
      expect(c!.z).toBeCloseTo(0, 4);
      expect(c!.x).toBeCloseTo(fx * (15 / -fz), 3);
      expect(c!.y).toBeCloseTo(w.state.y + rootY('stand'), 4);
      expect(t.climbPrompt(), `yaw ${yaw}: offered`).not.toBeNull();
    }
    for (const yaw of [60, -60]) {
      const { w, t } = at(yaw);
      for (let i = 0; i < 5; i++) w.tick(STILL);
      expect(w.storedContact(), `yaw ${yaw}: 30 along the facing, past the line`).toBeNull();
      expect(t.climbPrompt(), `yaw ${yaw}: not offered`).toBeNull();
    }
  });

  it('walked in at 60 degrees, stick 0.5: the offer comes on with the feet under 12 from the face, never before', () => {
    for (const yaw of [60, -60]) {
      const { w, t } = at(yaw, 20);
      let onset: number | null = null;
      for (let i = 0; i < 240 && onset === null; i++) {
        w.tick(input(0.5));
        if (t.climbPrompt() !== null) onset = w.state.z;
      }
      expect(onset, `yaw ${yaw}: offered on the walk-in`).not.toBeNull();
      expect(onset!, `yaw ${yaw}: feet from the face at the onset`).toBeLessThan(12);
      expect(onset!, `yaw ${yaw}: feet from the face at the onset`).toBeGreaterThan(9.5);
    }
  });

  it('a running jump pressed 17.4 out with the contact set launches (the jump-near-wall capture, synthetic twin)', () => {
    const { w } = at(0, 60);
    for (let i = 0; i < 240 && w.state.z > 17.43; i++) w.tick(input(1));
    expect(w.state.z).toBeLessThanOrEqual(17.43);
    expect(w.storedContact(), 'the weapon line holds the face').not.toBeNull();
    expect(Math.hypot(w.state.vx, w.state.vz)).toBeGreaterThan(15);
    expect(w.jump()).toBe(true);
    expect(w.action?.name).toBe('launch');
  });
});

// ---- the dev disc: M51's guardwall, the capture's face --------------------------------------------------------------

const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : '';
const M51 = DISC && existsSync(join(DISC, 'RUN', 'M51.ZDB')) ? join(DISC, 'RUN', 'M51.ZDB') : '';

/**
 * M51 `worldmodel/guardwall/g19733`'s south face (its plane 0.983 x - 0.184 z = 3162.3, z 3116-3240, top -168.08; the
 * disc's polygon through the repository's readers), from the capture's slot 18: (3826.5, -182.91, 3175.3), 15 u out;
 * square is yaw 100.6.
 */
const G19733 = { start: [3826.5, -182.91, 3175.3] as const, square: 100.6 };

let m51: { grid: Grid; polys: WorldPoly[]; plane: { nx: number; nz: number; d: number } } | null = null;
function guardwall(): NonNullable<typeof m51> {
  if (m51) return m51;
  const map = simMapFromBytes(new Uint8Array(readFileSync(M51)), 'RUN/M51.ZDB');
  const polys = groundPolygons(map.ground);
  const face = polys.find((p) => {
    const n = p.path === 'worldmodel/guardwall/g19733' ? polygonNormal(p.points) : null;
    return n !== null && Math.abs(n[0] - 0.983) < 0.002 && Math.abs(n[2] + 0.184) < 0.002;
  });
  if (!face) throw new Error('M51: g19733 south face not found');
  const n = polygonNormal(face.points)!, h = Math.hypot(n[0], n[2]);
  const nx = n[0] / h, nz = n[2] / h;
  return (m51 = { grid: groundGrid(map.ground), polys, plane: { nx, nz, d: nx * face.points[0]! + nz * face.points[2]! } });
}

describe.skipIf(!M51)(`M51 guardwall g19733 -- a capture-scored spec of the original (r0004, ac, 2026-11-04)${M51 ? '' : ' (no dev disc: SOCOM_DISC -- skipped)'}`, () => {
  const from = (yaw: number): { w: Walker; t: Traversal; dist: () => number } => {
    const { grid, polys, plane } = guardwall();
    const w = new Walker(grid), t = new Traversal(grid, polys);
    w.driver = t;
    expect(w.place(G19733.start[0], G19733.start[1] + 8, G19733.start[2])).toBe(true);
    w.state.yaw = yaw;
    return { w, t, dist: () => plane.nx * w.state.x + plane.nz * w.state.z - plane.d };
  };

  it('(i) standing still 15 out: square and at 30 degrees CLIMB is offered within a few ticks; at 60 it is not', () => {
    for (const off of [0, 30, -30]) {
      const { w, t, dist } = from(G19733.square + off);
      expect(dist()).toBeCloseTo(15, 0);
      for (let i = 0; i < 5; i++) w.tick(STILL);
      expect(t.climbPrompt(), `${off}: offered`).not.toBeNull();
      // The stored contact sat 11.5 over the feet in the capture (-171.464 against -182.95): the root's height.
      expect(w.storedContact()!.y - w.state.y, `${off}: the contact's height over the feet`).toBeCloseTo(11.48, 1);
    }
    for (const off of [60, -60]) {
      const { w, t } = from(G19733.square + off);
      for (let i = 0; i < 5; i++) w.tick(STILL);
      expect(t.climbPrompt(), `${off}: not offered`).toBeNull();
    }
  });

  it('(ii) walked in at 60 degrees, stick 0.5: the offer comes on with the feet 9.5 to 11.5 from the plane, never at 12 or more', () => {
    for (const off of [60, -60]) {
      const { w, t, dist } = from(G19733.square + off);
      let onset: number | null = null;
      // The loop ends at the first offered tick, so no offer came with the feet further out than the onset.
      for (let i = 0; i < 240 && onset === null; i++) {
        w.tick(input(0.5));
        if (t.climbPrompt() !== null) onset = dist();
      }
      expect(onset, `${off}: offered on the walk-in`).not.toBeNull();
      expect(onset!, `${off}: the feet at the onset`).toBeGreaterThanOrEqual(9.5);
      expect(onset!, `${off}: the feet at the onset`).toBeLessThanOrEqual(11.5);
    }
  });

  /**
   * The closest approach walking in 4 s at stick 0.5 (the capture's `RESULTS.md` column "closest to the plane while
   * walking", two trials a case, both signs pooled): 5.34-5.40 square, 6.40-6.63 at 30 degrees, 5.98-6.22 at 60 -- the
   * segment body's reach, not the weapon line's; a band is the trials' range widened by 0.1 each way.
   */
  const closest = (off: number): number => {
    const { w, dist } = from(G19733.square + off);
    let c = Infinity;
    for (let i = 0; i < 240; i++) { w.tick(input(0.5)); c = Math.min(c, dist()); }
    return c;
  };

  it('(iii) the closest approach walking in at 30 and 60 degrees: 6.30-6.73 and 5.88-6.32 (the capture 6.40-6.63, 5.98-6.22)', () => {
    for (const [off, lo, hi] of [[30, 6.30, 6.73], [-30, 6.30, 6.73], [60, 5.88, 6.32], [-60, 5.88, 6.32]] as const) {
      const c = closest(off);
      expect(c, `${off}: closest`).toBeGreaterThanOrEqual(lo);
      expect(c, `${off}: closest`).toBeLessThanOrEqual(hi);
    }
  });

  /**
   * The jump-near-wall capture (r0004, ac, 2026-11-04 11:30-11:50Z, `jump-near-wall/RESULTS.md`, two identical trials):
   * run square at the face at full stick and Jump pressed 17.43 from the plane, the stored contact `+0x10ac` SET and CLIMB
   * offered (`+0xed0` 4), the original launched the running jump -- type 8, 64.5 u carried at 62.3 u/s over the 14-u top.
   * The port pressed at the same point launches too (`JUMP_CONTACT_PROVEN` 'none'). Fresh review 2's F7 asked for the
   * carry as well; the port misses it, so only the type is pinned here. Measured 2026-11-04 (this case's staging, full
   * stick held after the press, 60 Hz): pressed 16.60 out at 62.3 u/s, the launch meets the face 5.19 out after 10 ticks,
   * 5.6 over the press, and ends there (not airborne, no action, speed 0); the body then rises up the face for 34 ticks
   * to the top (-168.5), runs across it and falls, landing (`landHard`) 90 ticks after the press at -51.70 out, y
   * -220.03 -- the original's one 1034 ms arc (apex +15.77) landed at -49.09, y -219.61. The end point is close; the
   * path is not: the port's launch does not clear the 14-u top in its arc.
   */
  it('the running jump pressed 17.4 out, square at full stick, with the contact set and CLIMB offered: launched', () => {
    const { w, t, dist } = from(G19733.square);
    const { plane } = guardwall();
    // Back along the face's normal to 45 out, a run-up as the capture's (62.9 u/s at the press).
    expect(w.place(w.state.x + plane.nx * 30, w.state.y + 8, w.state.z + plane.nz * 30)).toBe(true);
    expect(dist()).toBeCloseTo(45, 0);
    for (let i = 0; i < 300 && dist() > 17.43; i++) w.tick(input(1));
    expect(dist()).toBeLessThanOrEqual(17.43);
    expect(dist()).toBeGreaterThan(16);
    expect(w.storedContact(), 'the stored contact set at the press').not.toBeNull();
    expect(t.climbPrompt(), 'CLIMB offered at the press').not.toBeNull();
    expect(w.jump()).toBe(true);
    expect(w.action?.name, 'the running jump (type 8)').toBe('launch');
  });

  // LATER 681: walked in square the port's segment body stops a whole step short of the crossing, 5.66 from the plane at
  // stick 0.5 (5.79 at full stick) -- the original closes to 5.34-5.40 (ca-0-t1, ca-0-t2). The weapon line plays no
  // part (the same with `weaponLineCast` off); held, not re-pinned.
  it.fails('GAP (LATER 681): (iii) the closest approach walking in square: 5.24-5.50 (the capture 5.34-5.40)', () => {
    const c = closest(0);
    expect(c).toBeGreaterThanOrEqual(5.24);
    expect(c).toBeLessThanOrEqual(5.50);
  });
});
