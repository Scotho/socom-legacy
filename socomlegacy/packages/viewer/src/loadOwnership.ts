/**
 * Which load a late answer belongs to (LATER 440, 441): loads overlap, so a lane's reply, a reveal's callback or a warm-up's
 * completion answers for the load it was started for -- never for the load wanted when it lands. Browser bookkeeping of
 * the page's own requests (`./main`); no value, timing or rule of the game.
 */

/** One lane's current request (the map's sound, effects, ARMORY data) and the load it was asked for. */
export class LaneRequest {
  id = -1;
  load = -1;
  /** The lane asked again, as request `id` for load `load`; the id is returned to send. */
  ask(id: number, load: number): number { this.id = id; this.load = load; return id; }
  /** The load a reply answers for: the asking load when it is the lane's current request, else null (dropped). */
  answers(id: number): number | null { return id === this.id ? this.load : null; }
}

/**
 * A reveal's staleness: its view replaced, or its load no longer the wanted one -- a newer load asked whose map has not
 * come back yet to replace the view.
 */
export function ownedStale(load: number, view: object, now: () => { wanted: number; view: object | null }): () => boolean {
  return () => { const at = now(); return at.wanted !== load || at.view !== view; };
}

/** The view the wanted load's scene lane reads: the view on screen only when it is that load's, else none (pending). */
export function sceneViewFor<T>(view: T | null, shownLoad: number, load: number): T | null {
  return shownLoad === load ? view : null;
}

/**
 * LATER 441: a warm-up's completion marked in the record of the load it began on (`warmedAt`), and only while that load
 * is still the wanted one; false when superseded, so a successor's lane is never marked warmed by its predecessor.
 */
export function markWarmed(record: Record<string, number>, lane: string, load: number, wanted: number, at: number): boolean {
  if (wanted !== load) return false;
  record[lane] = at;
  return true;
}
