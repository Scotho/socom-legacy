import type { ServerEvent } from './protocol';

/**
 * SVC-07c SEAT-TOLD (web sprint 18, W18.R3; research 264 §2; research 155 §2.3, §4.4): the page's copy of each seat's
 * last told rating and medal -- the original's in-game player state +0x42 (the medal, `FUN_002eaee0`'s, D:L166200-166201;
 * `oop9`'s forced 4, D:L166202-166205, already in the event) and +8 (the rating from the server's record,
 * D:L166208-166209), both set after each round by `FUN_002c5360` -- from the room's
 * `seatTold` server event (`./protocol`; the server's `Room.tellRatings`, the results queue's values). Each event replaces
 * the board whole: the room names every account seated in the game (after a round and at each seat's join), so a seat
 * it leaves out holds no stale value. Only the room's events are heard: nothing the page sends reaches it (research 169 §4: the page reports
 * no result; no `ClientEvent` carries a rating). The screens read it (ONL-34 draws the medals); nothing draws it here.
 *
 * The page's `NetClient` holds one (`NetClient.told`, closed with the client), and so does a replay's `ReplayClient`
 * (`told` is on `NetClientSurface`, the mapped type of NetClient's public members): the board listens on the client's
 * own event feed (`on`), which every server event reaches, so ONL-34 reads `client.told` from either.
 */

/** A seat's told rating and medal (the medal 0-5, `medalOf`'s index: none, Ensign .. Admiral). */
export interface SeatToldEntry { readonly rating: number; readonly medal: number }

/** What the board listens on: the net client's (or the replay client's) feed of the server's events. */
export interface ServerEventFeed {
  on(listener: (ev: ServerEvent) => void): () => void;
}

export class SeatToldBoard {
  private told = new Map<number, SeatToldEntry>();
  private off: (() => void) | null;

  constructor(feed: ServerEventFeed) {
    this.off = feed.on((ev) => { if (ev.type === 'seatTold') this.take(ev.seats); });
  }

  /** The seat's last told rating and medal (a copy), or undefined when the last event named it not. */
  get(seat: number): SeatToldEntry | undefined {
    const e = this.told.get(seat);
    return e ? { rating: e.rating, medal: e.medal } : undefined;
  }

  /** Every seat's, by seat id in the event's order (a copy). */
  all(): Map<number, SeatToldEntry> {
    return new Map([...this.told].map(([id, e]) => [id, { rating: e.rating, medal: e.medal }]));
  }

  /** Stops listening; the last values stay readable. */
  close(): void {
    this.off?.();
    this.off = null;
  }

  /** The board replaced by an event's seats; an entry whose id, rating or medal is not a number of its kind is dropped. */
  private take(seats: unknown): void {
    const next = new Map<number, SeatToldEntry>();
    if (Array.isArray(seats)) {
      for (const s of seats as { id?: unknown; rating?: unknown; medal?: unknown }[]) {
        if (!s || !Number.isInteger(s.id) || typeof s.rating !== 'number' || !Number.isFinite(s.rating)) continue;
        if (!Number.isInteger(s.medal) || (s.medal as number) < 0 || (s.medal as number) > 5) continue;
        next.set(s.id as number, { rating: s.rating, medal: s.medal as number });
      }
    }
    this.told = next;
  }
}
