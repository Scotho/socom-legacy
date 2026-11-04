import type { ServerEvent } from './protocol';
import type { ServerEventFeed } from './seatTold';

/**
 * AD-13 (the clans' finish, wave 6b; web sprint 40's row, folded; research 275 §5): the page's copy of each seat's clan
 * tag as the room told it -- the room's `seatClans` server event (`./protocol`; the server's `Room.tellClan`, the bridge's
 * read at each seat, `CLAN_TAG_AT_SEAT_READING`), players' and watchers' alike. The original's tag is the slot's
 * published player state's +0x2e (`FUN_002c5450` D:L166281-166293), written for a watcher as for a player (its one role
 * test picks the team word only, D:L166237-166264), and every console reads every slot's (`FUN_002c3ac0`
 * D:L165206-165222): the speaker line (`FUN_00238ac0` D:L85680-85690), the game lobby's talker bar (`FUN_0027cbf0`
 * D:L125668-125677) and its side lists (`FUN_002c5010` D:L166107-166151). Each event replaces the board whole (the
 * room's whole set: a seat it leaves out has no tag). Only the room's events are heard: no `ClientEvent` names a tag
 * (OT.R26: no page names another's or its own).
 *
 * The page's `NetClient` holds one (`NetClient.clans`, closed with the client), and so does a replay's `ReplayClient`
 * (`NetClientSurface`), as `./seatTold`'s board: it listens on the client's own feed (`on`).
 */
export class SeatClanBoard {
  private clans = new Map<number, string>();
  private off: (() => void) | null;

  constructor(feed: ServerEventFeed) {
    this.off = feed.on((ev: ServerEvent) => { if (ev.type === 'seatClans') this.take(ev.seats); });
  }

  /** The seat's told tag, or '' when the last event named it not (no tag, an unknown seat). */
  of(seat: number): string {
    return this.clans.get(seat) ?? '';
  }

  /** Every seat's, by seat id in the event's order (a copy). */
  all(): Map<number, string> {
    return new Map(this.clans);
  }

  /** Stops listening; the last tags stay readable. */
  close(): void {
    this.off?.();
    this.off = null;
  }

  /** The board replaced by an event's seats; an entry whose id is not an integer or whose tag is not a non-empty string is dropped. */
  private take(seats: unknown): void {
    const next = new Map<number, string>();
    if (Array.isArray(seats)) {
      for (const s of seats as ({ id?: unknown; clan?: unknown } | null)[]) {
        if (!s || !Number.isInteger(s.id) || typeof s.clan !== 'string' || s.clan === '') continue;
        next.set(s.id as number, s.clan);
      }
    }
    this.clans = next;
  }
}
