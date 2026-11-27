import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseZdb, zdbMember, Zar } from '@s2u/archive';
import { buildGrid, itemClass, parseSceneGraph, polygonNormal, readKitTable, type CollisionOwner, type Grid, type GridParams, type SceneNode, type WorldPoly } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { simMapFromBytes } from '../src/simMap';
import { Traversal } from '../src/traversal';
import { groundGrid, groundPolygons, rootY, Walker, type WalkInput } from '../src/walk';
import { heldWeaponModels } from '../src/loadout';
import { WEAPON_LINE_LENGTH_READING, WEAPON_LINE_M4A1_SD_PROVEN, WEAPON_LINE_NO_FIREPOINT, weaponLineLength, weaponLineLengthOf } from '../src/weaponLine';

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

  it('WEAPON-LINE part 2: the launchers -- each has a length, and exactly the models with no firepoint node cast no line (WEAPON_LINE_NO_FIREPOINT)', () => {
    // seat-kill's read (pilot/kill/keyjob-weapon-line-item.md): the LAW up casts its AT4 model's line; the RPG-7's model
    // has no firepoint node (the disc spells it firepont), so +0x14bc is null and the cast returns false.
    const kits = readKitTable(ZWEAPON!);
    const toc = parseZdb(MP2!);
    const models = new Map(parseSceneGraph(Zar.parse(zdbMember(MP2!, toc, 'WEAP_GEO.ZED'))).map((m) => [m.name.toLowerCase(), m]));
    const names = (n: SceneNode): string[] => [n.name, ...n.children.flatMap(names)];
    const launchers = new Set([...kits.arsenal.items.entries()].filter(([id]) => itemClass(id) === 'rocketLauncher').map(([, it]) => it.model).filter((m): m is string => !!m));
    expect(launchers.size, 'the kit table holds launchers').toBeGreaterThan(0);
    const noFirepoint: string[] = [];
    for (const model of launchers) {
      expect(weaponLineLengthOf(model), `${model}: a length`).not.toBeNull();
      const geo = models.get(model.toLowerCase());
      expect(geo, `${model}: in WEAP_GEO`).toBeDefined();
      if (!names(geo!).includes('firepoint')) noFirepoint.push(model.toLowerCase());
    }
    expect(noFirepoint.sort()).toEqual([...WEAPON_LINE_NO_FIREPOINT].sort());
    // The review's F4: heldWeaponModels gives the kit's launcher model (the first rocket-launcher-class entry), and the
    // review's F6: the pin reads MP2's WEAP_GEO (the firearms' firepoints: the case above).
    const launcherId = [...kits.arsenal.items.keys()].find((id) => itemClass(id) === 'rocketLauncher')!;
    const loadout = [254, 255, launcherId, 255, 255];
    expect(heldWeaponModels(kits as never, loadout as never).launcher).toBe(kits.arsenal.items.get(launcherId)!.model);
    expect(heldWeaponModels(kits as never, [254, 255, 255, 255, 255] as never).launcher, 'no launcher in the kit').toBeNull();
  });
});

// ---- without the disc: a synthetic crate, the same rule ---------------------------------------------------------

const quad = (pts: number[], ditype: number, appflags = 0): WorldPoly => ({
  modelName: 'worldmodel', path: 'worldmodel/q', region: 0, ditype, material: 25, ptcount: 4, cameratype: 0, appflags, points: Float32Array.from(pts),
});
const floor = (x0: number, z0: number, x1: number, z1: number, y: number): WorldPoly => quad([x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z0], 3);
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
  /** The capture's start, or `back` u behind it along the walk at `yaw` (the sweep of starts below). */
  const from = (yaw: number, back = 0): { w: Walker; t: Traversal; dist: () => number } => {
    const { grid, polys, plane } = guardwall();
    const w = new Walker(grid), t = new Traversal(grid, polys);
    w.driver = t;
    const [fx, fz] = forward(yaw);
    expect(w.place(G19733.start[0] - fx * back, G19733.start[1] + 8, G19733.start[2] - fz * back)).toBe(true);
    w.state.yaw = yaw;
    return { w, t, dist: () => plane.nx * w.state.x + plane.nz * w.state.z - plane.d };
  };

  /**
   * LATER 1194B: the climb-angle walk-in's stick, as the GAME reads it. The capture's "left stick 0.5" (climb-angle
   * PLAN/RESULTS) is bench macro 16, pad pressure 0.376 (shadow2's stand-off sweep, setup above its FINE/RESULTS.md); the
   * actor's ramped forward word `+0x240` (FINE's CSVs, column `fwd240`, every wall run) climbs 0.165, 0.330 and reaches
   * 0.4001 on flat ground: the target its ramp (`FUN_00586c10`) runs to. [proven: a memory trace of the original] The
   * port takes the pad's target and runs its own ramp, so the walk-in is at 0.400. The word reads 0.384-0.396 only on
   * frames where the feet rise (the fold review's N1: 550 rising frames, none on flat), an uphill scale the port's walk
   * reproduces (the frame-by-frame trace below: the capture's step 0.726 -> 0.747 where the ground levels, the port's
   * 0.727 -> 0.751). The port's forward 0.5, used here before, walked 32 u/s where the capture walked 25.3-25.8.
   */
  const CLIMB_ANGLE_STICK = 0.4;
  /** The capture's own distance to the plane (its RESULTS.md: 0.983 x - 0.184 z = 3162.3, rounded as the capture rounds it). */
  const captureDist = (w: Walker): number => 0.983 * w.state.x - 0.184 * w.state.z - 3162.3;

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

  it('(ii) walked in at 60 degrees, the capture\'s stick: the offer comes on with the feet 9.5 to 11.5 from the plane, never at 12 or more', () => {
    for (const off of [60, -60]) {
      const { w, t, dist } = from(G19733.square + off);
      let onset: number | null = null;
      // The loop ends at the first offered tick, so no offer came with the feet further out than the onset.
      for (let i = 0; i < 240 && onset === null; i++) {
        w.tick(input(CLIMB_ANGLE_STICK));
        if (t.climbPrompt() !== null) onset = dist();
      }
      expect(onset, `${off}: offered on the walk-in`).not.toBeNull();
      expect(onset!, `${off}: the feet at the onset`).toBeGreaterThanOrEqual(9.5);
      expect(onset!, `${off}: the feet at the onset`).toBeLessThanOrEqual(11.5);
    }
  });

  /**
   * The closest approach walking in 4 s at the capture's stick (`CLIMB_ANGLE_STICK`; its `RESULTS.md` column "closest to
   * the plane while walking", two trials a case, both signs pooled): 5.34-5.40 square, 6.40-6.63 at 30 degrees, 5.98-6.22
   * at 60 -- the segment body's reach, not the weapon line's; a band is the trials' range widened by 0.1 each way.
   */
  const closest = (off: number, back = 0): number => {
    const { w, dist } = from(G19733.square + off, back);
    let c = Infinity;
    for (let i = 0; i < 240; i++) { w.tick(input(CLIMB_ANGLE_STICK)); c = Math.min(c, dist()); }
    return c;
  };

  /**
   * HISTORY (superseded for +-30 and +-60 by the re-derivation below, LATER 1194B, 2026-11-21; kept as the record of the
   * rulings it carried; the square case below still uses `closest`):
   * The sweep of starts (the main controller's ruling (a) on LATER 1164, logged for the owner; RED-CLASSING V14-V15). The
   * port resolves walls every 60 Hz tick, so a walk into a face stops anywhere in one tick's move past the segment's
   * reach: the stand-off is a sawtooth over where the walk starts, one 60 Hz move wide (H404; LATER 681; LATER 784 holds
   * the 30 Hz wall build). That is 0.22 normal to the face at 60 degrees and 0.54 square at stick 0.5, as wide as the
   * capture's own range or wider. A single start is a phase draw, and LATER 1164's ramp lead (RAMP_LEAD;
   * strafeRamp.test.ts) adds a fixed ~0.3 u to the approach, which moves the draw: at -60 the single start went
   * 6.189 -> 6.347. Swept, head(s) = trunk(s + 0.3) to 0.005.
   * So these cases are scored over SWEEP_STARTS starts, each SWEEP_STEP further back along the walk (0.6 u, over one
   * whole cycle) -- a FIXED, finer sweep of 13 for both settings (the controller's refinement of ruling (a), logged for
   * the owner: on 7 starts -60 held 3/7 against 3/7, but on 13 one sample flips at the band's edge, the trunk's 6.2208
   * against the capture's 6.22, so single-start differences are noise inside the ~0.22 u wall cycle; LATER 681/784 stay
   * open). PASS: the head's count of starts inside the CAPTURE's range is no more than ONE below the trunk's (the trunk
   * is the mover before the lead, RAMP_LEAD 0, measured on the hub, coreB, 2026-11-18, one file), AND the head's swept
   * range overlaps the capture's range. The capture's ranges are unchanged. 13 starts, trunk (head in brackets):
   * - -60: 7 of 13 inside 5.98-6.22, swept 6.0957-6.3417 (head 6 of 13, 6.1010-6.3542): within one, overlapping.
   * - +60: 6 of 13 inside, swept 6.1058-6.3515 (head 8 of 13, 6.0864-6.3362).
   * - square: 0 of 13 inside 5.34-5.40, swept 5.4136-5.9053 (head 0 of 13, 5.4074-5.9303). The swept range does not
   *   reach the capture's in either setting: LATER 681's gap, held by the it.fails case below.
   * The counts agreeing at 60 is WINDOW LUCK, not a measure (the controller's ruling (a) for +-30, logged for the owner):
   * the lead is a PURE PHASE SHIFT of the sawtooth -- at +30, head[s] = trunk[s + 0.30] to 0.001 over 91 overlapping
   * starts (0.01 u apart), the tooth about 0.46 u -- so a window of a non-integer number of teeth moves a partial tooth
   * in or out: at 30 the same windows count trunk 8/13 against head 5/13 (121 starts: 69 against 53) with the same set
   * of values; at 60 they happen to favour the head. +-30 was therefore kept at its single start inside 6.30-6.73, and a
   * shift criterion against the trunk's recorded sawtooth is LATER 681's instrument.
   * LATER 1194B (research 444 s10; the fresh review's finding 4): with the walls met once a game frame the tooth is a
   * frame's move (about 0.9 u at 30 degrees, stick 0.5), so one start is a coarser draw still, and +-30 is scored as +-60:
   * the same 13 starts, the count inside the capture's 6.40-6.63 no more than one below the trunk's, and the overlap. The
   * trunk's +30 count is the one recorded above (8 of 13, the same windows); its -30 count was never recorded, so -30 is
   * held to +30's (the mirror start; the head's single starts agreed to 0.015, 6.680 / 6.665) -- an assumption the base box
   * leg's labels check, said here, not hidden.
   */
  /** The climb-angle capture's square range (r0004, `climb-angle/RESULTS.md`, two trials), for the GAP case below. */
  const CAPTURE: Record<number, readonly [number, number]> = { 0: [5.34, 5.40] };

  /**
   * LATER 1194B: (iii) RE-DERIVED from the original swept over the start (the controller's ruling (2a), 2026-11-21; the
   * count rule above, calibrated on the trunk's 60 Hz tooth, retired with it). [proven: a memory trace of the original
   * running] shadow2's stand-off sweep, r0004 (CRC 0F6FC6CF) on PCSX2 2.8.2, slot 18 byte-identical to ac's:
   * agent-mail/evidence/weekend-mega-2026-11-14/rig/WALLS-STANDOFF-SWEEP/ (sweep B) and its FINE/ (b 0 to 1.0 back along
   * the walk in steps of 0.1, b 0 and 0.5 three times; 60 runs, none missed or torn).
   * - THE INPUT: `CLIMB_ANGLE_STICK` (above), the game's own 0.4001; the distance: the capture's own (`captureDist`),
   *   from a start it reads 14.894, as the sweep's starts (asserted).
   * - THE ORIGINAL'S TOOTH. With the walls met once a game frame (LATER 1194B), the stand-off rises about 1:1 with the
   *   start and drops one step a frame's move along: at +-30 a tooth 0.678 / 0.707 high, repeats away from the edge
   *   agreeing to 0.01-0.02; at +-60 0.417 / 0.425, its repeats scattering 0.23-0.27, so its shape is not resolved start
   *   by start.
   * - THE RULE (the file's band rule: a capture's value widened by 0.1 each way): over a sweep of 61 starts 0.02 apart
   *   (1.2 u, more than a whole tooth), the port's tooth height (max - min) and both ends of its swept range lie within
   *   0.1 of the original's at each of the four angles. The port (2026-11-21, frames from 2): +30 6.276-7.009, -30
   *   6.301-7.034, +60 6.011-6.435, -60 6.044-6.468 -- every end and tooth within 0.06. It discriminates: a walk at forward 0.5
   *   (measured, tooth 0.93 / 0.54) misses it, and so would the 60 Hz per-tick walls' tooth (about half a frame's move,
   *   0.36 / 0.21: the fresh review's estimate, not run).
   * - THE PHASE, start by start, and the walk-in frame by frame: the two cases below. The capture's walk starts on a game
   *   frame's boundary (each of the original's frames one update); counted from the placing, the port's first frame spans
   *   THREE ticks (`throttleFrameEnds(2)` is false; `GROUND_FRAME_TICKS_READING`), so a stick held from the first tick
   *   pressed inside a frame and the walk ran one tick (half a frame's move, half a tooth) ahead of the capture. So
   *   these walks number the port's frames from 2 (`commandSeq`), as `m51DitchBlock.disc.test.ts` does for the same
   *   reason (the fold review's N2 named it; numbered from the placing every resolved start was 0.32-0.45 off, from 2
   *   within 0.07). It is not a fit: only two phases exist (from 4 is from 2, from 3 is from the placing), and the port's
   *   own press path gives the same walk with no renumbering -- a few rest ticks before the stick, as the capture rests
   *   300 ms, and LATER 1219's frame-start read puts the press on a frame's first tick (the narrow review, 2026-11-21:
   *   per start equal to from 2 within 0.001). The envelope above moves by under 0.006 either way.
   */
  const STANDOFF_FINE: Record<number, { lo: number; hi: number }> = {
    30: { lo: 6.299, hi: 6.977 }, [-30]: { lo: 6.309, hi: 7.016 },
    60: { lo: 6.040, hi: 6.457 }, [-60]: { lo: 6.034, hi: 6.459 },
  };
  /** FINE's +-30 runs by start b = 0, 0.1 .. 1.0 (b 0: the mean of three trials); null at b 0.5, where its trials straddle the drop. */
  const STANDOFF_FINE_BY_START: Record<number, ReadonlyArray<number | null>> = {
    30: [6.595, 6.614, 6.783, 6.782, 6.910, null, 6.388, 6.379, 6.538, 6.636, 6.736],
    [-30]: [6.562, 6.711, 6.808, 6.856, 6.995, null, 6.338, 6.501, 6.606, 6.620, 6.690],
  };
  /** The capture's frame ends at b 0 (FINE `fine30-b0-t1` / `fine-30-b0-t1`, column `dist`, from the first moving frame to the stop). */
  const STANDOFF_FINE_TRACE: Record<number, readonly number[]> = {
    30: [14.586, 13.971, 13.245, 12.519, 11.793, 11.065, 10.339, 9.612, 8.866, 8.119, 7.370, 6.621],
    [-30]: [14.583, 13.962, 13.231, 12.501, 11.773, 11.042, 10.312, 9.582, 8.829, 8.076, 7.323, 6.568],
  };
  /** A walk-in at the capture's stick, the port's frames numbered from 2 (see above); returns the walker. */
  const walkIn = (off: number, back: number, each: (w: Walker, i: number) => void): Walker => {
    const { w } = from(G19733.square + off, back);
    let seq = 2;
    const tick = w.tick.bind(w);
    w.tick = (inp, dt) => { w.commandSeq = seq++; tick(inp, dt); };
    for (let i = 0; i < 240; i++) { w.tick(input(CLIMB_ANGLE_STICK)); each(w, i); }
    return w;
  };
  const closestAt = (off: number, back: number): number => {
    let c = Infinity;
    walkIn(off, back, (w) => { c = Math.min(c, captureDist(w)); });
    return c;
  };

  it('(iii) the closest approach walking in at 30 and 60 degrees, swept over the start: the tooth and its ends within 0.1 of the original swept (r0004, shadow2 FINE)', () => {
    for (const off of [30, -30, 60, -60]) {
      expect(captureDist(from(G19733.square + off).w), `${off}: the start, as the sweep's`).toBeCloseTo(14.894, 2);
      const got = Array.from({ length: 61 }, (_, k) => closestAt(off, k * 0.02));
      const lo = Math.min(...got), hi = Math.max(...got), o = STANDOFF_FINE[off]!;
      const label = `${off}: swept ${lo.toFixed(3)}-${hi.toFixed(3)} (tooth ${(hi - lo).toFixed(3)}) against the original's ${o.lo}-${o.hi} (${(o.hi - o.lo).toFixed(3)})`;
      expect(Math.abs((hi - lo) - (o.hi - o.lo)), `${label}: the tooth`).toBeLessThanOrEqual(0.1);
      expect(Math.abs(lo - o.lo), `${label}: the nearest`).toBeLessThanOrEqual(0.1);
      expect(Math.abs(hi - o.hi), `${label}: the farthest`).toBeLessThanOrEqual(0.1);
    }
  });

  // The fresh review's finding 5 (2026-11-21): FINE resolves +-30 start by start (repeats 0.01-0.02). Every resolved
  // start (all 20, the band rule's 0.1) is held, not the first failure only; the port (2026-11-21): within 0.07.
  it('(iii) at +-30, start by start within 0.1 of the original swept over the start (shadow2 FINE)', () => {
    for (const off of [30, -30]) {
      const misses = STANDOFF_FINE_BY_START[off]!.flatMap((o, k) => {
        if (o === null) return [];
        const c = closestAt(off, k * 0.1);
        return Math.abs(c - o) <= 0.1 ? [] : [`b ${(k * 0.1).toFixed(1)}: ${c.toFixed(3)} against ${o}`];
      });
      expect(misses, `${off}: the starts off the original's by more than 0.1`).toEqual([]);
    }
  });

  // The walk-in frame by frame at b 0 against the capture's own frame ends (the fold review's N2 instrument): the ramp's
  // first two frames, the uphill frames, the level ones and the stop, each within 0.1 (the port, 2026-11-21: +30 within 0.020,
  // -30 within 0.038, a drift growing to the stop, the size of the capture's reached angle -29.68 against the port's 30).
  it('(iii) at +-30 the walk-in frame by frame: each frame end within 0.1 of the capture\'s (shadow2 FINE, b 0)', () => {
    for (const off of [30, -30]) {
      const ends: number[] = [];
      walkIn(off, 0, (w, i) => { if (i % 2 === 1 && ends.length < STANDOFF_FINE_TRACE[off]!.length) ends.push(captureDist(w)); });
      const wrong = STANDOFF_FINE_TRACE[off]!.flatMap((o, k) => (Math.abs(ends[k]! - o) <= 0.1 ? [] : [`frame ${k + 1}: ${ends[k]!.toFixed(3)} against ${o}`]));
      expect(wrong, `${off}: the frame ends off the capture's`).toEqual([]);
    }
  });

  /**
   * The jump-near-wall capture (r0004, ac, 2026-11-04 11:30-11:50Z, `jump-near-wall/RESULTS.md`, two identical trials):
   * run square at the face at full stick and Jump pressed 17.43 from the plane, the stored contact `+0x10ac` SET and CLIMB
   * offered (`+0xed0` 4), the original launched the running jump -- type 8, 64.5 u carried at 62.3 u/s over the 14-u top.
   * The port pressed at the same point launches too (`JUMP_CONTACT_PROVEN` 'none'). Fresh review 2's F7 asked for the
   * carry as well; the carry and the arc are pinned in the two JUMP-AIR cases below. *Was* (2026-11-04): the launch met
   * the face after 10 ticks and the body climbed it for 34 ticks before falling beyond -- fixed by JUMP-AIR (research 80
   * s7: the airborne records slant with the vertical speed every tick, no automatic step-up in the launch).
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

  /**
   * JUMP-AIR (research 80 s7), a capture-scored spec of the jump-near-wall capture's two other columns (r0004, ac,
   * 2026-11-04; `jump-near-wall/RESULTS.md`, two identical trials each). The run-up and press as above; what follows the
   * press, every tick, until the body is down: the traversal's move (a climb is never started -- the original's types run
   * 8 -> 11 and 8 -> 10 -> 2, no climb type), where it lands, when, and the highest feet.
   */
  const jumpFrom = (press: number) => {
    const { w, t, dist } = from(G19733.square);
    const { plane } = guardwall();
    expect(w.place(w.state.x + plane.nx * 30, w.state.y + 8, w.state.z + plane.nz * 30)).toBe(true);
    for (let i = 0; i < 300 && dist() > press; i++) w.tick(input(1));
    const y0 = w.state.y, pressedAt = dist();
    expect(w.jump()).toBe(true);
    expect(w.action?.name).toBe('launch');
    let climbed = false, apex = -Infinity, downAt = -1, landHard = false;
    for (let i = 1; i <= 160 && downAt < 0; i++) {
      w.tick(input(1));
      if (t.state().kind !== 'none') climbed = true;
      apex = Math.max(apex, w.state.y - y0);
      if (w.action?.name === 'landHard') landHard = true;
      if (i > 6 && !w.airborne) downAt = i;
    }
    return { pressedAt, climbed, apex, downAt, landHard, end: dist(), dy: w.state.y - y0 };
  };

  // The capture's 6.95 case (contact set, CLIMB offered at the press): the feet rose to +11.75 / +11.22 against the
  // 14-tall face -- the height to the top swept the step-up's whole 5-10 band -- and it landed back at the foot (6.83
  // out) after 701 ms in the air, never climbing. `AIR_STEP_UP_READING` 'not-in-jump-blend' (R4P-243) holds the no-climb;
  // with 'any' the port steps up mid-air and lands on the top (fresh review 1 of JUMP-AIR, F1).
  it('JUMP-AIR: pressed 6.95 out the running jump rises against the face and lands back at its foot, never climbing', () => {
    const r = jumpFrom(6.95);
    expect(r.pressedAt).toBeLessThanOrEqual(6.95);
    expect(r.climbed, 'no climb in the air').toBe(false);
    expect(r.apex).toBeGreaterThan(10.5);
    expect(r.apex).toBeLessThan(12.5);                            // the capture +11.22 / +11.75
    expect(r.end).toBeGreaterThan(4);
    expect(r.end).toBeLessThan(8);                                 // at the foot (the capture 6.83)
    expect(Math.abs(r.dy)).toBeLessThan(1.5);                      // on the ground it left
    expect(r.downAt).toBeLessThanOrEqual(54);                      // down within 0.9 s of the press (the capture's air 701 ms)
  });

  // The capture's 17.43 case: one arc over the 14-tall top, apex +15.77, the hard landing (type 11) 1067 ms after the
  // press, 49.09 past the face and 35.6 under the press. `AIR_SEGMENT_DIRECTION_READING` 'velocity' holds the arc (with
  // 'frame-step' the records meet the face on a level tick); `AIR_STEP_UP_READING` the no-climb.
  it('JUMP-AIR: pressed 17.43 out the running jump clears the 14-tall top in one arc and lands hard beyond it', () => {
    const r = jumpFrom(17.43);
    expect(r.climbed, 'no climb in the air').toBe(false);
    expect(r.landHard, 'the hard landing (type 11)').toBe(true);
    expect(r.apex).toBeGreaterThan(14.33);                         // over the top
    expect(r.apex).toBeLessThan(17.5);                             // the capture +15.77
    expect(r.end).toBeLessThan(-40);                               // beyond the face (the capture -49.09)
    expect(r.end).toBeGreaterThan(-60);
    expect(r.downAt).toBeGreaterThanOrEqual(57);                   // 0.95-1.15 s after the press (the capture 1067 ms)
    expect(r.downAt).toBeLessThanOrEqual(69);
  });

  // LATER 681: walked in square the port's segment body stops a whole step short of the crossing, 5.66 from the plane at
  // stick 0.5 (5.79 at full stick) -- the original closes to 5.34-5.40 (ca-0-t1, ca-0-t2). The weapon line plays no
  // part (the same with `weaponLineCast` off); held, not re-pinned.
  // LATER 1164 (RAMP_LEAD; strafeRamp.test.ts; ruling (a)): at the one start the lead landed the walk on the sawtooth's
  // low tooth, 5.4074, and the single-start body passed. That was a phase draw, not a fix: the per-tick wall cycle
  // (LATER 681, the 30 Hz wall build LATER 784) is unchanged. The body is now the sweep's rule against the capture's
  // 5.34-5.40, scored by the fraction of a fine sweep inside it (below), and it fails as the gap is.
  // LATER 1194B (the fresh review's finding 6, 2026-11-21): walked now at the capture's stick (`CLIMB_ANGLE_STICK`); its
  // swept range at this head reaches the capture's (5.345 at the nearest). But with the walls met once a frame the square
  // tooth is a frame's move (about 0.85 u), so "half of 61 starts inside a 0.06 band" can no longer be met by any port:
  // this criterion was the 60 Hz tooth's. The original's two trials agree because they share a start, not because the
  // tooth is narrow. Owed, LATER 681: a square sweep of the original over the start (as shadow2's FINE at +-30/+-60),
  // and the case re-derived from it. Kept as it is meanwhile, not re-pinned.
  it.fails('GAP (LATER 681): (iii) the closest approach walking in square: at least half of a fine sweep inside the capture 5.34-5.40', () => {
    // Scored by the FRACTION of a fine sweep inside the capture's range, not by overlap (the pair review, finding 1: the
    // 13-start grid missed a narrow tooth; at 0.51 back the head reaches 5.3986, inside, so overlap would hang on a
    // 0.01 u phase). The original's two trials both close inside; the port reproduces it when at least half of 61
    // starts, 0.01 u apart over one cycle and more, land inside. Today 1 of 61 does: the gap, LATER 681 / 784.
    const got = Array.from({ length: 61 }, (_, k) => closest(0, k * 0.01));
    const [lo, hi] = CAPTURE[0]!;
    expect(got.filter((c) => c >= lo && c <= hi).length).toBeGreaterThanOrEqual(31);
  });
});

describe('WEAPON-LINE part 2 (WEAPON_LINE_ITEM_MODEL_READING): the model of the line by the mount', () => {
  const up = (launcher: string | null, on: boolean): Walker => {
    const w = new Walker(crate().grid);
    w.hand = 0;
    w.heldModels = { rifle: 'm4Acarbine_sd', pistol: 'M9', launcher };
    w.launcherSetOn = () => on;
    (w as unknown as { followLauncherSet(): void }).followLauncherSet();
    return w;
  };
  it('the firearm mount: the model of the firearm hand, with or without an item up', () => {
    expect(up('AT4', false).weaponLineLength()).toBe(weaponLineLengthOf('m4Acarbine_sd'));
  });
  it('the launcher mount: with the LAW up the line is that of the AT4 model (21.3236)', () => {
    expect(up('AT4', true).weaponLineLength()).toBe(WEAPON_LINE_LENGTH_READING['AT4']);
  });
  it('the launcher mount with a model that has no firepoint node (the RPG-7): no line', () => {
    expect(up('RPG7', true).weaponLineLength()).toBeNull();
  });
  it('the still lower (the review F1): the set holds to the clip end, but the mount is the firearm from the put-away -- the rifle line', () => {
    // FUN_005a6b70 writes +0xf79 = the new hand mount in the put-away call (D:L462086), at the lower START; the set comes
    // back only at the lower clip end (FUN_005a60d0, D:L461769-461771). So with the set still on and the mount the rifle,
    // the line is the rifle model, not the AT4.
    const w = up('AT4', true);
    w.launcherMountOn = () => false;
    expect(w.weaponLineLength()).toBe(weaponLineLengthOf('m4Acarbine_sd'));
    w.launcherMountOn = () => true;
    expect(w.weaponLineLength()).toBe(WEAPON_LINE_LENGTH_READING['AT4']);
  });
});
