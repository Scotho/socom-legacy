/**
 * WIRE-16 (PV-1; research 402 s3) and WM-DATA-17 (protocol 17): a live snapshot frame with each body's tail cut out --
 * protocol 16's three view bytes (52-54: `view` | `clock`, `swayX`, `swayY`) and protocol 17's hand byte (55, `hand`),
 * `VIEW_TAIL_BYTES` in all -- the frame protocol 15 wrote for the same snapshot, every other byte where it was. The pins
 * that hold the live encoder to the frozen pre-#337 writer's bytes (`../cranes.test.ts`, match `test/replayFormat.test.ts`)
 * compare through it: the #337 takeover's claim (no hooks named, no byte of the Cranes section) is about the section, and
 * the tail is protocol 16's and 17's own. The cut bytes are looked at, not dropped blind: a frame with a non-zero tail byte
 * is refused (throws), so a pin through it still proves every byte of the frame (the PV-1 fold; `../viewTail.test.ts`).
 * `withoutHands` cuts protocol 17's hand byte alone: the frame protocol 16 wrote for the same snapshot (the frozen 16
 * layout, `../../src/net/codecV16`'s input; `../netCodecHand.test.ts`). A test helper, no game data.
 */
export const BODY_BYTES_V15 = 52;
/** Protocol 16's body: 15's 52 and the view's three. */
export const BODY_BYTES_V16 = 55;
/** The tail cut to reach protocol 15's body: 16's three view bytes and 17's hand byte. */
export const VIEW_TAIL_BYTES = 4;
/** Protocol 17's hand byte, cut to reach protocol 16's body. */
export const HAND_BYTES = 1;

/** The head before the body count: u8 frame type, u32 tick, u8 sections, i16 x3 the feet's origin; the own state's 36 when bit 0. */
const HEAD = 12;
const OWN = 36;

export function withoutViewTails(frame: Uint8Array): Uint8Array {
  return cutTails(frame, BODY_BYTES_V15, VIEW_TAIL_BYTES, true, 'view tail');
}

/**
 * PV-2: the same cut with the tail bytes NOT looked at -- for a check that claims only that the rest of a room's frame
 * decodes in the old layout (`../cranes.test.ts`'s #337 room-frames check), where the room now fills the clock's nibble
 * (the seat's command number's low four bits, research 402 s3). A byte pin never goes through it: `withoutViewTails` is
 * the strict one, and its pins stay on it.
 */
export function withoutViewTailsUnchecked(frame: Uint8Array): Uint8Array {
  return cutTails(frame, BODY_BYTES_V15, VIEW_TAIL_BYTES, false, 'view tail');
}

/** WM-DATA-17: each body's hand byte cut out, refused when one is not 0 -- protocol 16's frame of the same snapshot. */
export function withoutHands(frame: Uint8Array): Uint8Array {
  return cutTails(frame, BODY_BYTES_V16, HAND_BYTES, true, 'hand');
}

/** WM-DATA-17: the same cut, the hand bytes not looked at -- protocol 16's frame of the snapshot with every hand 0. */
export function withoutHandsUnchecked(frame: Uint8Array): Uint8Array {
  return cutTails(frame, BODY_BYTES_V16, HAND_BYTES, false, 'hand');
}

function cutTails(frame: Uint8Array, keep: number, cut: number, strict: boolean, what: string): Uint8Array {
  let at = HEAD + ((frame[5]! & 1) !== 0 ? OWN : 0);
  const n = frame[at]!;
  at += 1;
  const out: number[] = Array.from(frame.subarray(0, at));
  for (let i = 0; i < n; i++) {
    out.push(...frame.subarray(at, at + keep));
    if (strict) {
      for (let j = 0; j < cut; j++) {
        const v = frame[at + keep + j];
        if (v !== 0) throw new Error(`body ${i}'s ${what} byte ${j} is ${v}, not 0: the cut would hide it`);
      }
    }
    at += BODY_BYTES_V15 + VIEW_TAIL_BYTES;
  }
  out.push(...frame.subarray(at));
  return Uint8Array.from(out);
}
