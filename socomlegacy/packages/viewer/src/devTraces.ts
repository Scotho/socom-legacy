/**
 * Fired rounds drawn by the test room (`./devPanel`). A browser adaptation: each segment is a `round` the page's
 * firearm already reported (`from` to `to`, and a cross at `to` when it hit). A line of sight that was not a shot
 * is not invented here. A development instrument with no original: while the panel is closed, the game's clock and ammo are main's; only the drawing overlays may stay
 * (the traces among them, drawn only once the panel's box is on, until it is unticked); a shot is the same either way.
 */
export interface DevTrace {
  from: readonly [number, number, number];
  to: readonly [number, number, number];
  hit: boolean;
}

export const DEV_TRACE_CAP = 12;

/** A line of sight apart from a fired round is not drawn: the page has no query for one. */
export const DEV_LOS_NOTE = 'A line of sight apart from a fired round is not drawn. The page has no query for one. A round\'s own segment is the trace.';

export function rememberTrace(list: readonly DevTrace[], next: DevTrace): DevTrace[] {
  const copy = (p: readonly [number, number, number]): [number, number, number] => [p[0], p[1], p[2]];
  const out = [...list, { from: copy(next.from), to: copy(next.to), hit: next.hit }];
  return out.length > DEV_TRACE_CAP ? out.slice(out.length - DEV_TRACE_CAP) : out;
}

const CROSS = 2;

/** Line positions: the round, then a small cross at the hit. Empty when there are no rounds. */
export function tracePositions(list: readonly DevTrace[]): Float32Array {
  let segments = 0;
  for (const t of list) segments += t.hit ? 4 : 1;
  const out = new Float32Array(segments * 6);
  let o = 0;
  const seg = (ax: number, ay: number, az: number, bx: number, by: number, bz: number): void => {
    out[o++] = ax; out[o++] = ay; out[o++] = az; out[o++] = bx; out[o++] = by; out[o++] = bz;
  };
  for (const t of list) {
    seg(t.from[0], t.from[1], t.from[2], t.to[0], t.to[1], t.to[2]);
    if (!t.hit) continue;
    const [x, y, z] = t.to;
    seg(x - CROSS, y, z, x + CROSS, y, z);
    seg(x, y - CROSS, z, x, y + CROSS, z);
    seg(x, y, z - CROSS, x, y, z + CROSS);
  }
  return out;
}
