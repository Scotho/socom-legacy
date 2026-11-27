import { HITBOX_TRACE_REACH, rayMeet, traceBoxes } from '../../viewer/src/hitboxTrace';
import type { HitBody } from '../../viewer/src/net/hitVolumes';

/**
 * HITBOX-TRACE (a development instrument with no original; product track: it reads the volumes the room judges with and
 * changes nothing the room simulates, judges or sends). The room's half of the trace `tools/hitboxTrace.ts` joins with
 * the page's (`../../viewer/src/hitboxTrace.ts`):
 *
 * - each tick, for each living player and each targetable hostage, one line: the body's volumes as the room's order pick
 *   would judge them at that tick (`Room.hostageOrderVolumes`, `Room.liveVolumes` -- the same calls the judging code
 *   makes, never a copy), `posed` whether they are the live pose's boxes or the stance's idle set, and the boxes'
 *   world bounds (`traceBoxes`);
 * - each `hostageOrder` the room judges (`event: 'order'`) with its eye, direction, view tick, the pick and the drop's
 *   reason (`why`, null: taken), and the hostages' volumes the pick cast on; each round's rewind (`event: 'round'`) with the
 *   first body record it made and the hostages' volumes at its tick.
 *
 * On only by `RoomOptions.hitboxTrace` (a sink), which the match server sets from `S2U_HITBOX_TRACE=<path>`
 * (`./hitboxTraceFile` `hitboxTraceRoomOptions`; this module imports nothing of node's: the room runs in the page's
 * loopback too). Off -- the default -- the room holds no recorder: one null test a tick, nothing made, nothing
 * called (`test/hitboxTrace.test.ts`).
 */

/** Where the room's lines go: one JSON object each. */
export type HitboxTraceSink = (line: Record<string, unknown>) => void;

/** The room's recorder: made by the room only when its option names a sink. */
export class RoomHitboxTrace {
  /** Recorders made (the off test: none without the option). */
  static made = 0;
  constructor(private readonly sink: HitboxTraceSink) { RoomHitboxTrace.made++; }

  /** One body at a tick, its volumes as the room judges them. */
  body(tick: number, id: number, kind: 'hostage' | 'player', state: string | number, posed: boolean, volumes: HitBody): void {
    this.sink({ side: 'room', tick, id, kind, state, posed, ...traceBoxes(volumes) });
  }

  /** The order judged and not yet answered (`dropped`, or none by the tick's end: taken). */
  private pending: Record<string, unknown> | null = null;

  /**
   * A `hostageOrder`'s pick (`Room.orderPickTrusted`): its line, view tick and rewound tick (`at`), the pick, whether the eye
   * was refused, the hostages' volumes it cast on, and where the line meets the ordered hostage's (`meet`: the hit's
   * height above its feet and its bone; null a miss). Written when its answer comes (`dropped`) or at the tick's end.
   */
  order(tick: number, viewTick: number | null, at: number | null, issuer: number, hostage: number, eye: readonly number[], dir: readonly number[],
    picked: number | null, eyeRefused: boolean, bodies: readonly { id: number; posed: boolean; volumes: HitBody }[]): void {
    this.flush();
    const target = bodies.find((b) => b.id === hostage);
    this.pending = {
      side: 'room', event: 'order', tick, viewTick, at, issuer, hostage, eye: [...eye], dir: [...dir], picked, eyeRefused,
      meet: target ? rayMeet(eye, dir, HITBOX_TRACE_REACH, target.volumes) : null, why: null,
      bodies: bodies.map((b) => ({ id: b.id, posed: b.posed, ...traceBoxes(b.volumes) })),
    };
  }

  /** The order's answer: refused for `why` (`orderRefusal`'s). */
  dropped(why: string): void {
    if (this.pending) { this.pending['why'] = why; this.flush(); }
    else this.sink({ side: 'room', event: 'order', why, picked: null, bodies: [] });
  }

  /** A round's rewind: the first body record its walk made, the hostages' volumes at its tick, the line's meet on each. */
  round(tick: number, viewTick: number | null, at: number, issuer: number, eye: readonly number[], dir: readonly number[], picked: number | null,
    bodies: readonly { id: number; posed: boolean; volumes: HitBody }[]): void {
    this.sink({
      side: 'room', event: 'round', tick, viewTick, at, issuer, hostage: null, eye: [...eye], dir: [...dir], picked, why: null,
      bodies: bodies.map((b) => ({ id: b.id, posed: b.posed, meet: rayMeet(eye, dir, HITBOX_TRACE_REACH, b.volumes), ...traceBoxes(b.volumes) })),
    });
  }

  /** The tick's end: an order still unanswered was taken. */
  endTick(): void { this.flush(); }

  private flush(): void {
    if (!this.pending) return;
    const p = this.pending;
    this.pending = null;
    this.sink(p);
  }
}
