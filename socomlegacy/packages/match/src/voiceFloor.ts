/**
 * The voice floor and the channel function, pure (SVC-20a, web sprint 20; research 225, transcribed from research 170
 * §2-§3 and its corrections C1-C3). The original's game host keeps one floor entry per voice channel and decides who
 * hears whom by the channel alone; on our server every game is a match room (research 159 R159.7), so the room is the
 * host (170 §2.1, "On our server"). This module is that host's state and nothing else: no I/O, no socket, no clock of
 * its own (`now` is passed in, in milliseconds on the server's clock), no import of the room. The relay (SVC-20b-relay)
 * and the round's channels (SVC-20c) call it. Members are the room's ids -- the connection's identity, never a byte a
 * page sends (170 §2.1's review box).
 *
 * Confidence: reading, pending review (research 225). Nothing here is measured against the original running.
 */

/**
 * The floor's grant times (R170.3): `recordMs` is the voice object's recording cap `voice+0x30` = 10 000 ms (the value
 * `FUN_002b83e0` passes to `FUN_00310080`, D:L158881; the client's check D:L211217); `expiryMs` is the host's expiry
 * `voice+0x34 = voice+0x30 + 5000` = 15 000 ms (`FUN_00310080` D:L211751-211753). On our server the room holds the
 * honest page's cap (W20.R5): a hold is cut `recordMs` after its grant; the expiry stays as the original's backstop.
 */
export const VOICE_FLOOR_HOLD_READING = Object.freeze({ recordMs: 10_000, expiryMs: 10_000 + 5000 });

/**
 * The re-ask (R170.3, R170.4): a client that holds talk without the floor asks again every 1 000 ms (D:L211126,
 * D:L211198; §2.2 D:L211186-211199), once the time has strictly passed (`due < now`, D:L211182). Ours keeps the want
 * on the server and re-asks on the server's clock (OT.R27).
 */
export const VOICE_FLOOR_RETRY_READING = 1000;

/**
 * The hold-off after a cut (R170.3): the client's state 4 waits another `voice+0x30` = 10 000 ms before it may ask
 * again (D:L211257-211265; strictly past, D:L211262); a want still on at its end is re-tried then -- the 20 s resume
 * of a held talk (C6, D:L211255-211263). The room holds it for the same member (W20.R5).
 */
export const VOICE_CUTOFF_LOCKOUT_READING = 10_000;

/**
 * The talk input's lockout after a talk's end, in ms, held on the server (W20.R5; the close review's F1, 2026-10-08): a
 * member's own press inside it does not ask at once -- its want is kept with the window's end as its due time, and the
 * sweep grants it then if the entry is free, so a waiter whose 1 s retry falls due first wins (no floor kept by cycling
 * talk off / on). The value is the talk input's: route B's end sets the TeamCommand timer to 1.0 s (`DAT_003dcb08`,
 * `FUN_00236a50` at D:L83910), route A's to 0.3 s plus that 1.0 s (D:L84677-84690); the page's own is
 * `VOICE_TALK_LOCKOUT_READING` (viewer `voice/talkInput.ts`, research 170 C6). The server holds the smaller, so no
 * honest round page is slowed. The game lobby's CIRCLE has no lockout of its own (`LOBBY_TALK_BUTTON`): on 9 the window
 * is ours, a hardening (OT.R26) -- an honest lobby re-press inside 1.0 s of its release waits until then (research 225
 * §1, §6).
 */
export const VOICE_TALK_LOCKOUT_MS_READING = 1000;

/**
 * The radio's ACTIVE CHANNEL as the command menu sends it (C1): TEAM 0, DEFENSE 1, OFFENSE 2 (`FUN_002344e0`
 * D:L83791-83792 registers OFFENSE with 2 and DEFENSE with 1; `FUN_0022f950` D:L81576-81592 passes it to `FUN_002c2c20`
 * and keeps it in `+0xc4`). The page asks only for one of these, validated 0..2 as `FUN_0022f950` does (W20.R4).
 */
export const VOICE_OFFENSE_DEFENSE_NUMBER_READING = Object.freeze({ team: 0, defense: 1, offense: 2 } as const);

/**
 * The dead zone, base 3: `FUN_002c2c20` puts a member whose in-world actor exists and is dead (`+0xe1` bit 4 clear)
 * on 3 at every ask, whatever base was asked and whatever the game (D:L164432-164435); the HUD draws
 * `action_dead_zone.tif` for base 3 (`FUN_002393f0` D:L85892-85944). Whether a death asks at all is the caller's
 * (C3: the OnDeath branch D:L454484-454492 sends event 0x22, which asks 3, only without respawn or for a ghost;
 * research 225 §5).
 */
export const VOICE_DEAD_CHANNEL_READING = 3;

/**
 * The Terrorists' side bit (C2): SEALs 0-3, Terrorists 4-7, by the team word (`FUN_002c2c20` D:L164449-164458, the
 * Terrorist test), combined by OR (`FUN_0030fcd0` D:L211588), skipped when the base reached is 9 (the base-9
 * exemption, tested after the dead step). Its second guard, `voice+0x4d == 0` (D:L164454), is zeroed at the
 * voice object's start (D:L211836); the file's other `+0x4d` writes are not attributed. It is read as always passing (research 225 §2).
 */
export const VOICE_SIDE_BIT_READING = 4;

/**
 * The spectators' channel, 10: `FUN_002c2c20` puts a spectator (`JoinAsSpectator`, `FUN_002f6d00` D:L196203-196216)
 * on 10 whatever was asked, after the dead step (D:L164437-164440); never +4, his team word being exactly 0x10000 (C2).
 */
export const VOICE_SPECTATOR_CHANNEL_READING = 10;

/**
 * The base the round's start asks for a late joiner (game `+0xcc`, the `late_joiner` valve; C11), whatever the game:
 * the dead zone (D:L55848-55849; 170 §3.1's table). The caller's ask (SVC-20c, research 225 §5), exported for it.
 */
export const VOICE_LATE_JOINER_READING = VOICE_DEAD_CHANNEL_READING;

/**
 * The channel map (R170.5, C1-C3; `FUN_002c2c20` D:L164422-164461 and its callers, 170 §3.1): 0 TEAM, 1 DEFENSE,
 * 2 OFFENSE, 3 the dead zone, OR 4 for the Terrorists, 9 the game lobby's players (`FUN_0027c9f0` D:L125568),
 * 10 spectators, 11 radio off (`FUN_0030e490` D:L210680; the ARMORY `FUN_0027d8c0` D:L126094-126102; the session's
 * start D:L158882). Twelve channels, twelve floor entries.
 */
export const VOICE_CHANNEL_MAP_READING = Object.freeze({
  ...VOICE_OFFENSE_DEFENSE_NUMBER_READING,
  deadZone: VOICE_DEAD_CHANNEL_READING,
  terroristBit: VOICE_SIDE_BIT_READING,
  lobby: 9,
  spectators: VOICE_SPECTATOR_CHANNEL_READING,
  radioOff: 11,
} as const);

/** The floor table's size: twelve `{owner, expiry}` pairs at `voice+0x70`, one per channel (R170.2; `FUN_0030e790` D:L210828-210842). */
const FLOOR_ENTRIES = VOICE_CHANNEL_MAP_READING.radioOff + 1;

/** One floor entry as the room reads it: the owner (a room member id) and the host's expiry. Free (0x100) is `null`. */
export interface VoiceFloorEntry { readonly owner: number; readonly expiry: number }

/**
 * One ask of the channel function, as `FUN_002c2c20` reads it at that moment. Which base is asked, and when, is the
 * caller's (SVC-20c; research 225 §5): the lobby asks 9, the round's start 0 (or `VOICE_LATE_JOINER_READING`), the
 * radio 0, 1 or 2 (validated 0..2 as `FUN_0022f950` does, W20.R4), RADIO ON 0 or 10, event 0x22 3, event 0x23 the
 * remembered `+0xc4`; RADIO OFF sets 11 directly (`FUN_0030e490` D:L210680). The page never names a channel.
 */
export interface VoiceAsk {
  /** The base asked: 0 TEAM, 1 DEFENSE, 2 OFFENSE, 3 the dead zone, 9 the game lobby, 10 spectators, 11 radio off. */
  base: 0 | 1 | 2 | 3 | 9 | 10 | 11;
  /** The member's in-world actor exists and is dead (`+0xe1` bit 4 clear). False in the game lobby: no actor. */
  actorDead: boolean;
  /** The member spectates (`JoinAsSpectator` / `DAT_004413d8`, `FUN_002f6d00`). */
  spectator: boolean;
  /** The team word's side: the Terrorists' takes the side bit; a spectator's (0x10000) matches neither side (C2). */
  team: 'seals' | 'terrorists' | 'spectators';
}

const ASKED_BASES: ReadonlySet<number> = new Set([0, 1, 2, 3, 9, 10, 11]);

function checkChannel(c: number): void {
  if (!Number.isInteger(c) || c < 0 || c >= FLOOR_ENTRIES) throw new RangeError(`voice channel ${c} is not 0..11`);
}

/**
 * The channel one ask puts a member on, literally `FUN_002c2c20` (D:L164422-164461; research 170 §3.1, C1-C3): a dead
 * actor's base becomes 3 (D:L164432-164435); a spectator's becomes 10 (D:L164437-164440); unless the base is then 9,
 * the Terrorists' team word ORs 4 (D:L164449-164458, `FUN_0030fcd0` D:L211588). Radio off, 11, is set directly
 * (`FUN_0030e490` D:L210683), not through this function. A base no caller asks is refused with a `RangeError`, and so
 * is a result above 11 -- 10 ORed with the side bit, 14 (170 §3's review box, `:202-206`).
 */
export function channelOf(ask: VoiceAsk): number {
  if (!ASKED_BASES.has(ask.base)) throw new RangeError(`voice base ${String(ask.base)} is not one a caller asks`);
  if (ask.base === VOICE_CHANNEL_MAP_READING.radioOff) return ask.base;                // FUN_0030e490 D:L210683
  let base: number = ask.base;
  if (ask.actorDead) base = VOICE_DEAD_CHANNEL_READING;                                // D:L164432-164435
  if (ask.spectator) base = VOICE_SPECTATOR_CHANNEL_READING;                           // D:L164437-164440
  const channel = base !== VOICE_CHANNEL_MAP_READING.lobby && ask.team === 'terrorists'
    ? base | VOICE_SIDE_BIT_READING                                                    // D:L164449-164458, D:L211588
    : base;
  checkChannel(channel);
  return channel;
}

/**
 * Whether a listener on channel `listener` hears a speaker on channel `speaker` (`FUN_0030f7e0` D:L211395-211449: the
 * sender's channel equals the listener's, D:L211408; R170.6): exact equality, and never on 11 (nothing is relayed on
 * radio off; a talker there is refused the flag, `FUN_0030e6e0` D:L210785-210796). The slot mute is not here (OQ-8).
 */
export function hears(listener: number, speaker: number): boolean {
  return listener === speaker && listener !== VOICE_CHANNEL_MAP_READING.radioOff;
}

interface Slot { owner: number; grantedAt: number; expiry: number }
interface Want { channel: number; due: number }

/**
 * The floor table on the room (the original's host handler `FUN_0030e8e0` D:L210896-210964; research 170 §2). The
 * original's request type 1 is `talkOn`'s ask (and the sweep's re-ask), type 2 is `talkOff`'s release; types 3 (set an
 * owner unchecked, D:L210934) and 4 (clear) have no way in (170 §2.1's review box). Every mutator returns the channels
 * whose entry changed, ascending, so the relay can tell those channels' members (W20.R6).
 */
export class VoiceFloor {
  readonly #slots: (Slot | null)[] = new Array<Slot | null>(FLOOR_ENTRIES).fill(null);
  /** The talk flag, kept on the server: the channel wanted and when its next ask is due. Insertion order breaks ties. */
  readonly #wants = new Map<number, Want>();
  /** A member's hold-off after a cut: no grant until this instant has passed (W20.R5, state 4; strict, D:L211262). */
  readonly #holdOff = new Map<number, number>();
  /** Each member's current channel as last set or talked on (the voice object's `voice+0x24`), for the D:L211589 guard. */
  readonly #channels = new Map<number, number>();
  /** When each member's talk flag last ended by its release or a set (F1): its own press waits `VOICE_TALK_LOCKOUT_MS_READING` from then. */
  readonly #released = new Map<number, number>();

  /**
   * Talk on (the page's press): asks at once (type 1) and, if not granted, keeps the want so the sweep re-asks every
   * `VOICE_FLOOR_RETRY_READING` has passed since its last ask (strict, D:L211182). A press while the same want is on asks
   * nothing new (the retry stays on the server's clock). A press inside the member's hold-off records the want, re-tried
   * once the hold-off has passed. `channel` is the member's current channel, as the room computes it. On 11 the flag is
   * refused (`FUN_0030e6e0` D:L210785-210796): no ask, no want. A member holds at most one entry: an entry it holds on
   * another channel is released. A press inside `VOICE_TALK_LOCKOUT_MS_READING` of the member's own flag's end (its
   * release, or a set that ended it) asks nothing: the want is kept, due at the window's end, for the sweep (F1).
   */
  talkOn(member: number, channel: number, now: number): number[] {
    checkChannel(channel);
    this.#channels.set(member, channel);
    const changed = new Set<number>();
    if (channel === VOICE_CHANNEL_MAP_READING.radioOff) {
      this.#release(member, changed);
      this.#wants.delete(member);
      return sorted(changed);
    }
    const held = this.#heldBy(member);
    if (held === channel) {
      this.#wants.set(member, this.#wants.get(member) ?? { channel, due: now + VOICE_FLOOR_RETRY_READING });
      return [];
    }
    const want = this.#wants.get(member);
    if (want && want.channel === channel) return [];
    this.#release(member, changed);
    const released = this.#released.get(member);
    if (released !== undefined && now < released + VOICE_TALK_LOCKOUT_MS_READING) {
      this.#wants.set(member, { channel, due: released + VOICE_TALK_LOCKOUT_MS_READING });   // the sweep's, strictly past
      return sorted(changed);
    }
    this.#wants.set(member, { channel, due: now });
    this.#ask(member, now, changed);
    return sorted(changed);
  }

  /**
   * Talk off (the page's release): the want cleared, and the member's entry freed (type 2; the owner must match). A
   * flag that was on (a want or a hold) starts the member's re-press window (F1).
   */
  talkOff(member: number, now: number): number[] {
    const changed = new Set<number>();
    this.#ended(member, now);
    this.#wants.delete(member);
    this.#release(member, changed);
    return sorted(changed);
  }

  /**
   * The host's tick (D:L211271-211300): an entry held past the cap (W20.R5: `recordMs` after its grant, the owner then
   * held off `VOICE_CUTOFF_LOCKOUT_READING`) or past its expiry is freed; then each wanting member whose retry time
   * (and hold-off) has passed re-asks -- strictly past, as the client's `due < now` (D:L211182, D:L211262) -- the
   * earliest first, equal times in the order the wants were made (no queue: the first to re-ask after a release wins,
   * §2.2).
   */
  sweep(now: number): number[] {
    const changed = new Set<number>();
    this.#slots.forEach((slot, c) => {
      if (!slot) return;
      if (now > slot.grantedAt + VOICE_FLOOR_HOLD_READING.recordMs) {
        this.#holdOff.set(slot.owner, now + VOICE_CUTOFF_LOCKOUT_READING);
        this.#slots[c] = null;
        changed.add(c);
      } else if (now > slot.expiry) {
        this.#slots[c] = null;
        changed.add(c);
      }
    });
    const due = [...this.#wants]
      .map(([member, want]) => ({ member, at: Math.max(want.due, this.#holdOff.get(member) ?? -Infinity) }))
      .filter(({ member, at }) => at < now && this.#heldBy(member) === null)
      .sort((a, b) => a.at - b.at);
    for (const { member } of due) this.#ask(member, now, changed);
    for (const [member, until] of this.#holdOff) if (until < now) this.#holdOff.delete(member);
    for (const [member, at] of this.#released) if (at + VOICE_TALK_LOCKOUT_MS_READING < now) this.#released.delete(member);
    return sorted(changed);
  }

  /**
   * The round's start (`FUN_0030e7f0` D:L210844-210892, called at D:L55846): all twelve entries freed, and nothing else.
   * The talk flags are the caller's: the round's start clears each non-late joiner's flag (`FUN_0030e6e0(voice, 0)`,
   * D:L55845) -- in ours `talkOff` -- between its base-0 set and this clear (research 225 §5).
   */
  clearAll(): number[] {
    const changed: number[] = [];
    this.#slots.forEach((slot, c) => {
      if (slot) { this.#slots[c] = null; changed.push(c); }
    });
    return changed;
  }

  /** A member leaves (170 §2.3, "Leaving"): every entry it owns freed at once (ours; the original waits for the expiry), its want and hold-off forgotten. */
  drop(member: number): number[] {
    const changed = new Set<number>();
    this.#release(member, changed);
    this.#wants.delete(member);
    this.#holdOff.delete(member);
    this.#channels.delete(member);
    this.#released.delete(member);
    return sorted(changed);
  }

  /**
   * A session takeover (the room's `takeOver`, LATER 20): `old`'s newer connection, `member`, is the same talker. The
   * old id's flag ends at `now` as a release ends it (F1: its re-press window starts if the flag was on), then its
   * hold-off (W20.R5) and its re-press window move to `member`; the room's `drop(old)` frees its entry and its want
   * after. `member` must be a new id with no floor state of its own.
   */
  takeOver(old: number, member: number, now: number): void {
    this.#ended(old, now);
    const holdOff = this.#holdOff.get(old), released = this.#released.get(old);
    if (holdOff !== undefined) this.#holdOff.set(member, holdOff);
    if (released !== undefined) this.#released.set(member, released);
  }

  /**
   * A channel is set for the member (`FUN_0030fcd0` D:L211574-211599): the talk flag is cleared -- its hold ends and its
   * want with it -- only when the channel differs from the member's current one (the guard D:L211589-211590; its other
   * arm, a failed library query, has no counterpart here); a set to the same channel changes nothing. RADIO OFF
   * (`FUN_0030e490` D:L210662-210688) clears the flag every time (D:L210683), so a set to 11 always clears. The room
   * calls this only where the original sets a channel (a respawn room's death sets none, C3). The hold-off stays (it is
   * the voice object's state 4, not the flag). A member with no channel yet is a change. With `now` (the room passes it),
   * a set that ends a flag that was on starts the member's re-press window, as a release does (F1: RADIO OFF and back,
   * the ARMORY's OFF and its return, are no way round it).
   */
  setChannel(member: number, channel: number, now?: number): number[] {
    checkChannel(channel);
    const changed = new Set<number>();
    const radioOff = channel === VOICE_CHANNEL_MAP_READING.radioOff;
    if (radioOff || this.#channels.get(member) !== channel) {
      if (now !== undefined) this.#ended(member, now);
      this.#wants.delete(member);
      this.#release(member, changed);
    }
    this.#channels.set(member, channel);
    return sorted(changed);
  }

  /** The channel's entry: its owner and expiry, or `null` when free (the original's 0x100). */
  holder(channel: number): VoiceFloorEntry | null {
    checkChannel(channel);
    const slot = this.#slots[channel];
    return slot ? Object.freeze({ owner: slot.owner, expiry: slot.expiry }) : null;
  }

  /** Whether the member's talk flag is on (asking, or holding). */
  wanting(member: number): boolean {
    return this.#wants.has(member);
  }

  /** The member's flag ends at `now`: if it was on (a want, or a hold), its re-press window starts (F1). */
  #ended(member: number, now: number): void {
    if (this.#wants.has(member) || this.#heldBy(member) !== null) this.#released.set(member, now);
  }

  #heldBy(member: number): number | null {
    const c = this.#slots.findIndex((s) => s?.owner === member);
    return c < 0 ? null : c;
  }

  /** Type 1: granted only into a free entry and once the member's hold-off has passed; the next ask a retry later. */
  #ask(member: number, now: number, changed: Set<number>): void {
    const want = this.#wants.get(member);
    if (!want) return;
    want.due = now + VOICE_FLOOR_RETRY_READING;
    const holdOff = this.#holdOff.get(member);
    if (holdOff !== undefined && now <= holdOff) {
      want.due = Math.max(want.due, holdOff);
      return;
    }
    if (this.#slots[want.channel]) return;
    this.#slots[want.channel] = { owner: member, grantedAt: now, expiry: now + VOICE_FLOOR_HOLD_READING.expiryMs };
    changed.add(want.channel);
  }

  /** Type 2: every entry the member owns freed (the owner matches by the room's id, never a byte of the message). */
  #release(member: number, changed: Set<number>): void {
    this.#slots.forEach((slot, c) => {
      if (slot?.owner === member) { this.#slots[c] = null; changed.add(c); }
    });
  }
}

function sorted(set: Set<number>): number[] {
  return [...set].sort((a, b) => a - b);
}
