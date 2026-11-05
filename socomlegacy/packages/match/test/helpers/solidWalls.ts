import type { WorldPoly } from '@s2u/scene';

/**
 * SEGMENT-BODY (research 217 s2.9): a hull face is hit only from in front of its own normal (research 281 s4.3), so a
 * synthetic wall of one quad is a wall from one side only. A hull's wall is a closed solid; this gives every wall quad
 * (`ditype` 2) its back face, the same points wound the other way, so the scene's walls stop a body from either side as
 * the disc's two-sided contacts did. A ladder's rungs (`/ladder` in the path) are left as they are: the climb reads
 * their own winding.
 */
export function solidWalls(polys: readonly WorldPoly[]): WorldPoly[] {
  const backs = polys.filter((p) => p.ditype === 2 && !p.path.includes('ladder')).map((p) => {
    const q = p.points, n = q.length / 3, points = new Float32Array(q.length);
    for (let i = 0; i < n; i++) points.set(q.subarray((n - 1 - i) * 3, (n - i) * 3), i * 3);
    return { ...p, path: `${p.path}-back`, points };
  });
  return [...polys, ...backs];
}
