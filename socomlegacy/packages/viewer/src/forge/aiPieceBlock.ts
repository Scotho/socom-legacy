import { aiCellCentre, aiCellIndex, aiCellY, type AiLoc, type AiMaps, type AiSubMap } from '@s2u/scene';
import type { GroundData } from '../mover';

/**
 * The layout's pieces on the AI map (the owner, 2026-11-12: "do 8" -- placed props never reached the AI grid, so hostages
 * and bots walked through them). A browser adaptation, FG.R2: the game has no editor, so no original says how a placed
 * prop meets `AIMAPS.MPS`; the disc's grid itself is never changed, only a copy for the layout. Every cell a placed
 * piece's collision covers -- a polygon of an owner `forge/piece_<i>` (`./matchMap` `composeMatchMap`, `layoutGround`)
 * whose xz shadow overlaps the cell's square, within a body's band above the cell's floor -- takes soil 0 (*nogo*,
 * research 200 §2: never entered by the planner). Its other bits (the link, the action, the height) stay.
 */

/**
 * The band above a cell's floor a piece must reach into to block it (world units; FORGE_AI_PIECE_BAND_ADAPTATION, the
 * adaptation's own values, no original): `step` -- below it a piece's top is stepped over (a kerb, a floor plate); `head`
 * -- above it a piece passes overhead (a beam, a roof).
 */
export const FORGE_AI_PIECE_BAND_ADAPTATION = { step: 2, head: 16 } as const;

/** The soil a placed piece's cell takes: 0, *nogo* (research 200 §2). */
const PIECE_SOIL = 0;
const PIECE_OWNER = 'forge/piece_';
const GROUND_FIELDS = 6;   // `../mover` `packGround`: ptcount first

/** A cell a piece blocked: its place on the grid and its floor's centre. */
export interface AiPieceCell extends AiLoc { at: [number, number, number] }

/** Whether the square [x0,x1]x[z0,z1] meets the polygon `pts` (x, z pairs) in the plane. */
function squareMeetsPolygon(x0: number, z0: number, x1: number, z1: number, pts: readonly number[]): boolean {
  const n = pts.length / 2;
  for (let i = 0; i < n; i++) { const x = pts[i * 2]!, z = pts[i * 2 + 1]!; if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return true; }
  // The square's centre inside the polygon (an even-odd crossing count; a degenerate shadow, a wall's line, has none).
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = pts[i * 2]!, zi = pts[i * 2 + 1]!, xj = pts[j * 2]!, zj = pts[j * 2 + 1]!;
    if ((zi > cz) !== (zj > cz) && cx < ((xj - xi) * (cz - zi)) / (zj - zi) + xi) inside = !inside;
  }
  if (inside) return true;
  // An edge of the polygon crossing the square (a wall's shadow is a line through it).
  const corners = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]] as const;
  const cross = (ax: number, az: number, bx: number, bz: number, cx2: number, cz2: number): number => (bx - ax) * (cz2 - az) - (bz - az) * (cx2 - ax);
  const segs = (ax: number, az: number, bx: number, bz: number, px: number, pz: number, qx: number, qz: number): boolean => {
    const d1 = cross(px, pz, qx, qz, ax, az), d2 = cross(px, pz, qx, qz, bx, bz);
    const d3 = cross(ax, az, bx, bz, px, pz), d4 = cross(ax, az, bx, bz, qx, qz);
    return ((d1 > 0) !== (d2 > 0) || d1 === 0 || d2 === 0) && ((d3 > 0) !== (d4 > 0) || d3 === 0 || d4 === 0);
  };
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ax = pts[j * 2]!, az = pts[j * 2 + 1]!, bx = pts[i * 2]!, bz = pts[i * 2 + 1]!;
    for (let k = 0; k < 4; k++) {
      const p = corners[k]!, q = corners[(k + 1) % 4]!;
      if (segs(ax, az, bx, bz, p[0], p[1], q[0], q[1])) return true;
    }
  }
  return false;
}

/**
 * `ai` with the placed pieces of `ground` stamped on it as *nogo* cells (above), and the cells it blocked. The sub-maps
 * no piece touches are the disc's own objects; a touched one is a copy with its own `cells`. With no pieces, `ai` itself.
 */
export function aiMapsWithPieces(ai: AiMaps, ground: GroundData, band = FORGE_AI_PIECE_BAND_ADAPTATION): { ai: AiMaps; blocked: AiPieceCell[] } {
  const owners = ground.owners.filter((o) => o.path.startsWith(PIECE_OWNER) || o.modelName.startsWith(PIECE_OWNER));
  if (!owners.length) return { ai, blocked: [] };
  // Each polygon's first point, from the point counts (`packGround`: polygon after polygon).
  const polys = ground.fields.length / GROUND_FIELDS;
  const start = new Uint32Array(polys + 1);
  for (let i = 0; i < polys; i++) start[i + 1] = start[i]! + ground.fields[i * GROUND_FIELDS]! * 3;
  const copies = new Map<number, AiSubMap>();
  const blocked: AiPieceCell[] = [];
  const seen = new Set<string>();
  for (const owner of owners) {
    for (let p = owner.first; p < owner.first + owner.count && p < polys; p++) {
      const a = start[p]!, b = start[p + 1]!;
      if (b - a < 9) continue;                                   // fewer than three points: no shadow
      const xz: number[] = [];
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (let k = a; k < b; k += 3) {
        const x = ground.points[k]!, y = ground.points[k + 1]!, z = ground.points[k + 2]!;
        xz.push(x, z);
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      }
      for (const sub of ai.maps) {
        const [sx, sz] = sub.cellSize;
        const cx0 = Math.max(0, Math.floor((minX - sub.min[0]) / sx)), cx1 = Math.min(sub.cellsX - 1, Math.floor((maxX - sub.min[0]) / sx));
        const cz0 = Math.max(0, Math.floor((minZ - sub.min[2]) / sz)), cz1 = Math.min(sub.cellsZ - 1, Math.floor((maxZ - sub.min[2]) / sz));
        if (cx0 > cx1 || cz0 > cz1) continue;
        for (let z = cz0; z <= cz1; z++) {
          for (let x = cx0; x <= cx1; x++) {
            const i = aiCellIndex(sub, x, z);
            if (i < 0) continue;
            const own = copies.get(sub.index) ?? sub;
            const word = own.cells[i]!;
            if ((word & 31) === PIECE_SOIL) continue;
            const floor = aiCellY(sub, word);
            if (maxY < floor + band.step || minY > floor + band.head) continue;
            const x0 = sub.min[0] + x * sx, z0 = sub.min[2] + z * sz;
            if (!squareMeetsPolygon(x0, z0, x0 + sx, z0 + sz, xz)) continue;
            let copy = copies.get(sub.index);
            if (!copy) { copy = { ...sub, cells: sub.cells.slice() }; copies.set(sub.index, copy); }
            copy.cells[i] = ((word & ~31) | PIECE_SOIL) >>> 0;
            const key = `${sub.index}:${x}:${z}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const [wx, wz] = aiCellCentre(sub, x, z);
            blocked.push({ map: sub.index, x, z, at: [wx, floor, wz] });
          }
        }
      }
    }
  }
  if (!copies.size) return { ai, blocked };
  return { ai: { ...ai, maps: ai.maps.map((s) => copies.get(s.index) ?? s) }, blocked };
}
