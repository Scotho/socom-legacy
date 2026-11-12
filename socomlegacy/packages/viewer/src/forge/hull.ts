import { LineBasicMaterial } from 'three';
import { groundPolygons, type GroundData } from '../mover';

/**
 * The hull's lines' material (the owner, 2026-11-09): drawn in the world's depth -- a wall in front hides the hull behind
 * it, as it hides the world (was: over everything) -- never fogged, its colours the segments' own, translucent.
 */
export function hullLineMaterial(): LineBasicMaterial {
  return new LineBasicMaterial({ vertexColors: true, fog: false, depthTest: true, depthWrite: false, transparent: true, opacity: 0.85 });
}

/**
 * FORGE (a browser adaptation, no original): the layout's hull drawn -- every polygon's edges as line segments, what
 * the walk stands on (ditype bit 0, the ground probe's) in green and the rest (walls) in amber, so a builder sees
 * which pieces are solid and where.
 */
const GROUND: readonly [number, number, number] = [0.35, 0.9, 0.45];
const WALL: readonly [number, number, number] = [0.95, 0.65, 0.2];

export function hullSegments(ground: GroundData): { positions: Float32Array; colors: Float32Array } {
  const polys = groundPolygons(ground);
  let edges = 0;
  for (const p of polys) edges += p.ptcount;
  const positions = new Float32Array(edges * 6);
  const colors = new Float32Array(edges * 6);
  let at = 0;
  for (const p of polys) {
    const c = (p.ditype & 1) !== 0 ? GROUND : WALL;
    for (let i = 0; i < p.ptcount; i++) {
      const a = i * 3, b = ((i + 1) % p.ptcount) * 3;
      positions.set([p.points[a]!, p.points[a + 1]!, p.points[a + 2]!, p.points[b]!, p.points[b + 1]!, p.points[b + 2]!], at);
      colors.set([...c, ...c], at);
      at += 6;
    }
  }
  return { positions, colors };
}
