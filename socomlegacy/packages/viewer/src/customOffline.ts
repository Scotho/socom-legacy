/**
 * FP-6 item 5, the batch review's F2 (H273; product track, a test instrument -- a browser adaptation, no original): a
 * custom map walks OFFLINE only. The test room's `connectNet` (`./main`) names a server room after `map.path`, so a custom
 * hull shown with Online on would take its collision into a server's room: a save's pieces on MP2 into the real MP2
 * standing room, an authored map's stem to `/rooms` or `/ws` -- the case H273 keeps out. `connectNet` asks `has(map)`
 * beside its campaign guard and takes the offline branch for one; the Custom Maps select is disabled with
 * `CUSTOM_MAPS_OFFLINE_WORDS` while Online names a server. Small and static on purpose: the room's content path itself is
 * a chunk of its own (`./testroomContent`), and this guard must hold before that chunk loads.
 */
export const CUSTOM_MAPS_OFFLINE_WORDS = 'custom maps walk offline only';

/** The maps the custom path showed: every authored map (it has `content`), and each disc map it marked (a save's pieces). */
export class CustomOffline {
  private readonly marked = new WeakSet<object>();
  /** `map` marked as the custom path's; returned, for the call that shows it. */
  mark<T extends object>(map: T): T { this.marked.add(map); return map; }
  has(map: object): boolean { return this.marked.has(map) || 'content' in map; }
}
