/**
 * SEAT_CLAIM_ADAPTATION (a service adaptation with no original -- the original keeps a watcher a spectator for good,
 * research 314 R314.1, R314.7; the owner's word, 2026-11-24, relayed by Mike): a watcher takes a seat from the spectator
 * view. The room tells a watcher the seats a claim could take (`seats`); the page offers the claim on one line of the
 * spectator's help block, held to confirm as the player's view is (`./hudLayout` POV_HELP_*), and sends `seatClaim`.
 * The room seats it at once when a seat is free (`promoted`, every promotion's path) or queues it (`queue`), first
 * asked, first seated; the same hold leaves the queue.
 *
 * Pure: the page's state in, the line and the hold out. No original behaviour is changed: a player, a dead player and
 * a playing joiner are offered nothing, and a page whose room never sends `seats` (an older room) shows nothing.
 */

/** What the page knows of its claim: the room's last `seats` (null before one), its role and its place in the queue. */
export interface SeatClaimState {
  seats: { open: number; claim: boolean } | null;
  role: 'player' | 'spectator';
  /** The client's queue place (`NetClient.queue`): 0 when not queued. */
  queue: number;
  /** SEAT_CLAIM_TAKE_DELAY_MS_ADAPTATION: a seat held for the page (`NetClient.seatComing`); absent, none. */
  coming?: boolean;
}

/** The claim's offer: the free seat's, the full room's (wait in line), the queue's (leave it); null when none is offered. */
export type SeatClaimOffer =
  | { kind: 'coming' }
  | { kind: 'open'; open: number }
  | { kind: 'full' }
  | { kind: 'queued'; position: number };

/**
 * The offer for a page's state: a spectator the room sent `seats` with `claim` -- queued (the room only tells a watcher
 * and a spectator queued from watching, so a queued page told `seats` asked from watching), a free seat, or full.
 */
export function seatClaimOffer(s: SeatClaimState): SeatClaimOffer | null {
  if (s.role !== 'spectator' || s.seats === null) return null;
  if (s.coming) return { kind: 'coming' };
  if (s.queue > 0) return { kind: 'queued', position: s.queue };
  if (!s.seats.claim) return null;
  return s.seats.open > 0 ? { kind: 'open', open: s.seats.open } : { kind: 'full' };
}

/**
 * SEAT_CLAIM_HOLD_S_ADAPTATION (as above): the seconds the claim's button is held before it acts -- a touch longer than
 * the player's view's 0.4 s (POV_HOLD_S_ADAPTATION), so a press meant for another control never seats the page.
 */
export const SEAT_CLAIM_HOLD_S_ADAPTATION = 0.6;

import { SEAT_CLAIM_R1_GLYPH_ADAPTATION } from './hudFont';

/**
 * SEAT_CLAIM_BUTTONS_ADAPTATION (as above): the pad's R1 -- a spectator's view reads no trigger (`./spectatorView`
 * PAD_SLOTS: the d-pad, Cross, Triangle; its fly camera Square and Circle) -- and the keyboard's J, no other key of the
 * spectator's or the page's (`./spectatorView` SPECTATOR_KEYS; P is the menu keyboard's START).
 */
export const SEAT_CLAIM_BUTTONS_ADAPTATION = { pad: 'R1', key: 'KeyJ', cap: 'J' } as const;

/**
 * Whether the claim's button is held this frame: the pad's R1 as the line names it (`r1`: the R1 button held on a pad
 * or the touch layer, whatever the controller layout's lanes), or J. A caller that does not know R1 (`r1` undefined)
 * reads the fire lane, R1's under the Default layout. A re-check's finding (2026-11-25): under the Goldeneye and COD
 * Modern layouts R1 holds no fire (Inventory; fire is Cross and R2), so a hold read off the fire lane never took a seat
 * from R1 -- and took one from Cross, the spectator's camera toggle.
 */
export function seatClaimHeld(o: { r1: boolean | undefined; fire: boolean; key: boolean }): boolean {
  return (o.r1 ?? o.fire) || o.key;
}

/**
 * SEAT_CLAIM_PAD_GLYPH_ADAPTATION (as above): on a pad the line names R1 by the face's R1 glyph (`font_special_01.tif`,
 * the pad glyphs the help lines draw, as the player's view's hint draws Cross's), its cell trimmed clear of L2's edge
 * (`SEAT_CLAIM_R1_GLYPH_ADAPTATION`), so the hold's ring circles the button as it circles Cross there. The keyboard's J
 * stays a letter.
 */
export const SEAT_CLAIM_PAD_GLYPH_ADAPTATION = String.fromCharCode(SEAT_CLAIM_R1_GLYPH_ADAPTATION.code);

/**
 * SEAT_CLAIM_LINES_ADAPTATION (as above): the offer's words, in the help block's capitals -- the state, a gap, then the
 * control in the player's view's hint's own form ("¦ HOLD: VIEW"): the button, HOLD, what it does. `%n` is the open
 * slots' count or the queue place; the open line's noun follows the count.
 */
export const SEAT_CLAIM_LINES_ADAPTATION = {
  /** SEAT_CLAIM_TAKE_DELAY_MS_ADAPTATION: the seat held, the switch to follow -- no control. */
  coming: { state: 'JOINING THE GAME...' },
  open: { state: '%n SLOT OPEN', states: '%n SLOTS OPEN', act: 'JOIN' },
  full: { state: 'GAME FULL', act: 'JOIN QUEUE' },
  queued: { state: 'IN QUEUE: %n', act: 'LEAVE' },
} as const;

/**
 * SEAT_CLAIM_TAKEN_LINE_ADAPTATION (as above; the owner's word, 2026-11-24): the message window's line when a claim
 * seats the page (`promoted` from watching) -- alive or a ghost alike, in the window's capitals. A playing joiner's
 * promotion keeps its own lines.
 */
export const SEAT_CLAIM_TAKEN_LINE_ADAPTATION = 'SLOT OPEN: TAKING YOU TO THE GAME';

/** SEAT_CLAIM_LINES_ADAPTATION: the gap between the state and the control, three spaces (the help font's). */
export const SEAT_CLAIM_GAP = '   ';

/**
 * SEAT_CLAIM_NO_PAD_ADAPTATION (SEAT_CLAIM_ADAPTATION, a browser adaptation; LATER 1604): on a page that reads neither
 * button -- no pad, no touch layer, and a release build, whose online match reads no key (OT.R29, OT.R38, OT.R114) --
 * the line names what the act needs instead of a button it cannot hold: "GAME FULL   CONTROLLER NEEDED TO JOIN QUEUE".
 * No input rule changes: the claim is still held on R1 only.
 */
export const SEAT_CLAIM_NO_PAD_ADAPTATION = { needs: 'CONTROLLER NEEDED TO' } as const;

/** The device the claim's line is for: R1's glyph (`pad`), J (`keyboard`), or neither (`none`, SEAT_CLAIM_NO_PAD_ADAPTATION). */
export type SeatClaimDevice = 'pad' | 'keyboard' | 'none';

/**
 * The page's claim device off its own detection (SEAT_CLAIM_NO_PAD_ADAPTATION): `pads` the connected pads' count, `prompt`
 * the page's prompt device (`./matchTouch` `promptDeviceOf`, whose `'pad'` is also a pad-less page's fallback), `keys`
 * whether the page hears J (a development build's NetPage listener, OT.R29), `touch` whether the touch layer shows
 * (`MatchTouch.touchShown`: a fine-pointer page's first touch shows it too, which the prompt device does not see). A pad
 * or touch holds R1 (the controller's ruling, 2026-11-26: CONTROLLER NEEDED only with neither); else J where it is
 * heard; else none.
 */
export function seatClaimDeviceOf(pads: number, prompt: 'pad' | 'keyboard' | 'touch', keys: boolean, touch = false): SeatClaimDevice {
  if (pads > 0 || prompt === 'touch' || touch) return 'pad';
  return prompt === 'keyboard' || keys ? 'keyboard' : 'none';
}

/**
 * The offer's line on a device (`pad`: R1's glyph, `keyboard`: J; `none`: what it needs, no button) and where its button
 * stands in it (`at`, the index of the button's character: the hold's ring circles it; -1 with none).
 */
export function seatClaimLine(offer: SeatClaimOffer, device: SeatClaimDevice): { line: string; at: number } {
  const cap = device === 'keyboard' ? SEAT_CLAIM_BUTTONS_ADAPTATION.cap : SEAT_CLAIM_PAD_GLYPH_ADAPTATION;
  const L = SEAT_CLAIM_LINES_ADAPTATION;
  if (offer.kind === 'coming') return { line: L.coming.state, at: -1 };
  const state = offer.kind === 'open' ? (offer.open === 1 ? L.open.state : L.open.states).replace('%n', String(offer.open))
    : offer.kind === 'queued' ? L.queued.state.replace('%n', String(offer.position)) : L.full.state;
  const lead = state + SEAT_CLAIM_GAP;
  if (device === 'none') return { line: `${lead}${SEAT_CLAIM_NO_PAD_ADAPTATION.needs} ${L[offer.kind].act}`, at: -1 };
  return { line: `${lead}${cap} HOLD: ${L[offer.kind].act}`, at: lead.length };
}

/**
 * SEAT_CLAIM_PULSE_ADAPTATION (as above): a free seat's line breathes -- its alpha between `low` and 1 of the help's,
 * `period` seconds a breath -- so a seat opening under a watcher's eye is seen; the full and the queued lines stand still.
 */
export const SEAT_CLAIM_PULSE_ADAPTATION = { low: 0.55, period: 1.6 } as const;

/** The line's share of the help's alpha `t` seconds into the offer (`SEAT_CLAIM_PULSE_ADAPTATION`); 1 off the free seat's. */
export function seatClaimPulse(offer: SeatClaimOffer, t: number): number {
  if (offer.kind !== 'open' && offer.kind !== 'coming') return 1;
  const P = SEAT_CLAIM_PULSE_ADAPTATION;
  return P.low + (1 - P.low) * (0.5 + 0.5 * Math.cos((2 * Math.PI * t) / P.period));
}

/**
 * The claim's hold, on the pad's R1 and the keyboard's J alike: a press starts it, `SEAT_CLAIM_HOLD_S_ADAPTATION` acts
 * once (`take` answers true that once), the release re-arms it. A hold begun with no offer, or one that loses its offer,
 * is void until released -- so the hold that seated a page never reads as a second claim, nor a held trigger from a
 * player's life as one.
 */
export class SeatClaimHold {
  private since: number | null = null;
  private state: 'idle' | 'running' | 'spent' = 'idle';

  /** A frame's sample: the button `down` at `now` (ms) with an offer standing (`offered`). True when the hold acts now. */
  take(down: boolean, offered: boolean, now: number): boolean {
    if (!down) { this.state = 'idle'; this.since = null; return false; }
    if (this.state === 'spent') return false;
    if (!offered) { this.state = 'spent'; this.since = null; return false; }
    if (this.state === 'idle') { this.state = 'running'; this.since = now; return false; }
    if (now - this.since! >= SEAT_CLAIM_HOLD_S_ADAPTATION * 1000) { this.state = 'spent'; this.since = null; return true; }
    return false;
  }

  /** The hold's share done at `now` (ms), 0..1; undefined while none runs (the ring is drawn only then). */
  progress(now: number): number | undefined {
    if (this.state !== 'running' || this.since === null) return undefined;
    return Math.min(1, Math.max(0, (now - this.since) / (SEAT_CLAIM_HOLD_S_ADAPTATION * 1000)));
  }
}
