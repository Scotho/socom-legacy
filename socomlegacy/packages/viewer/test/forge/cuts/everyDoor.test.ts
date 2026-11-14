import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { snapDoor, wallFaces, withLayoutCuts, leafFrame, pointsOf, placedDoorCuts } from '../../../src/forge/cuts';

/**
 * FORGE CUTS over every door on the disc (`SOCOM_ISO`): each of the 43 doors of the 9 maps that have doors, copied into
 * Frostfire's barracks wall (z 1001..1004) and dropped by it, snaps into the wall, cuts its doorway, blocks a body while
 * shut, opens when used, and -- opened -- lets a body walk through it both ways.
 *
 * `ONE_WAY` lists any door known to let the walk through one way only, named exactly so a new one fails and a mended
 * one too. It is empty: the six framed doors of Vigilance and Fish Hook once were, when their copy took every same-named
 * frame's hull on its map (see the frame test below).
 */
const ISO = process.env['SOCOM_ISO'];
const ONE_WAY = new Set<string>([]);

describe.skipIf(!ISO || !existsSync(ISO))('every disc door set into a wall (SOCOM_ISO)', () => {
  it('snaps, cuts its doorway, blocks shut, opens, and walks through both ways', async () => {
    const ISO_ = ISO!;
    void ISO_;
  const { IsoAssetSource } = await import('@s2u/archive');
  const { fsBlob } = await import('../../../../../tools/fmv-spike');
  const { loadMap } = await import('../../../src/loadMap');
  const { doorFramePoints, doorMove, doorTemplates, withPlacedDoors } = await import('../../../src/forge/placedDoors');
  const { DoorSet } = await import('../../../src/doors');
  const { groundGrid, groundPolygons, Walker } = await import('../../../src/mover');
  const src = new IsoAssetSource(fsBlob(ISO!));
  const base = await loadMap(src, 'RUN/MP2.ZDB');
  const faces = wallFaces(base.ground!);
  const rows: string[] = [];
  const oneWay: string[] = [];
  let ok = 0, all = 0;
  for (const arc of ['MP1','MP2','MP6','MP51','MP71','MP73','MP81','MP82','MP83']) {
    const lib = arc === 'MP2' ? base : await loadMap(src, `RUN/${arc}.ZDB`);
    for (const t of doorTemplates(lib, arc)) {
      all++;
      const leaf = t.owners.flatMap((o) => o.polys);
      // Drops by the wall z 1001..1004: hinge either side along it, either turn.
      let s = null;
      for (const at of [[616, 142, 998], [616, 142, 1007], [604, 142, 998], [628, 142, 1007], [610, 142, 1002], [622, 142, 1002]] as [number, number, number][]) {
        for (const yaw of [0, Math.PI / 2, Math.PI, 1.5 * Math.PI]) { s = snapDoor(at, yaw, (a, y) => doorMove(t, a, y), leaf, faces, doorFramePoints(t)); if (s) break; }
        if (s) break;
      }
      expect(s, `${arc} ${t.name} snaps into the wall`).not.toBeNull();
      if (!s) continue;
      const placed = withPlacedDoors(base, [{ source: arc, name: t.name, at: s.at, yaw: s.yaw }], () => t).map;
      const opened = withLayoutCuts(placed, undefined).map;
      const box = placedDoorCuts(placed)[0]!;
      const k = opened.doors!.length - 1;
      const pl = groundPolygons(opened.ground!);
      const lf = leafFrame(pointsOf(opened.doors![k]!.owners.flatMap((i) => { const o = opened.ground!.owners[i]!; return pl.slice(o.first, o.first + o.count); })))!;
      const walk = (open: boolean) => {
        const g = { ...opened.ground!, points: Float32Array.from(opened.ground!.points) };
        const d = new DoorSet(opened.doors!, g, {});
        if (open) { d.use(k, [lf.c[0], 142, 995], 1, 0); for (let i = 0; i < 400 && d.state(k).busy; i++) d.step(1 / 30); }
        const res: number[] = [];
        for (const [z0, yaw] of [[990, 180], [1016, 0]] as const) {
          const w = new Walker(groundGrid(g)); w.place(lf.c[0], 150, z0); w.state.yaw = yaw;
          for (let i = 0; i < 18; i++) w.tick({ forward: 0, right: 0, boost: false });
          for (let i = 0; i < 220; i++) w.tick({ forward: 1, right: 0, boost: false });
          res.push(w.state.z);
        }
        return { through: res[0]! > 1012 && res[1]! < 993, open: d.state(k).open, res };
      };
      const shut = walk(false), op = walk(true);
      void box; void rows; void ok;
      expect(shut.through, `${arc} ${t.name} blocks while shut`).toBe(false);
      expect(op.open, `${arc} ${t.name} opens`).toBe(true);
      if (!op.through) oneWay.push(`${arc}:${t.name}`);
    }
  }
    // Every door walks through both ways, but the known gap (`ONE_WAY`), named exactly: a new one fails, a mended one too.
    expect(oneWay.sort()).toEqual([...ONE_WAY].sort());
  }, 900_000);
  it("a door copies only its own frame's hull: Vigilance's door_frames share one node name, and none of another stands in", async () => {
    const { IsoAssetSource } = await import('@s2u/archive');
    const { fsBlob } = await import('../../../../../tools/fmv-spike');
    const { loadMap } = await import('../../../src/loadMap');
    const { doorFramePoints, doorTemplates } = await import('../../../src/forge/placedDoors');
    const lib = await loadMap(new IsoAssetSource(fsBlob(ISO!)), 'RUN/MP51.ZDB');
    for (const t of doorTemplates(lib, 'MP51')) {
      const drawn = doorFramePoints(t);
      const lo = [0, 1, 2].map((k) => Math.min(...drawn.map((p) => p[k]!)) - 1.5), hi = [0, 1, 2].map((k) => Math.max(...drawn.map((p) => p[k]!)) + 1.5);
      const hull = pointsOf((t.frame?.owners ?? []).flatMap((o) => o.polys));
      expect(hull.length, t.name).toBeGreaterThan(0);
      for (const p of hull) for (let k = 0; k < 3; k++) expect(p[k]! >= lo[k]! && p[k]! <= hi[k]!, `${t.name} frame hull point ${p}`).toBe(true);
    }
  }, 180_000);
});
