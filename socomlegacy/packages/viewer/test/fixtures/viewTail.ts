/**
 * WIRE-16 (PV-1; research 402 s3): a protocol-16 snapshot frame with each body's three tail bytes (52-54: `view` | `clock`,
 * `swayX`, `swayY`) cut out -- the frame protocol 15 wrote for the same snapshot, every other byte where it was. The pins
 * that hold the live encoder to the frozen pre-#337 writer's bytes (`../cranes.test.ts`, match `test/replayFormat.test.ts`)
 * compare through it: the #337 takeover's claim (no hooks named, no byte of the Cranes section) is about the section, and
 * the tail is protocol 16's own. The cut bytes are looked at, not dropped blind: a frame with a non-zero tail byte is
 * refused (throws), so a pin through it still proves every byte of the frame (the PV-1 fold; `../viewTail.test.ts`). A
 * test helper, no game data.
 */
export const BODY_BYTES_V15 = 52;
export const VIEW_TAIL_BYTES = 3;

/** The head before the body count: u8 frame type, u32 tick, u8 sections, i16 x3 the feet's origin; the own state's 36 when bit 0. */
const HEAD = 12;
const OWN = 36;

export function withoutViewTails(frame: Uint8Array): Uint8Array {
  return cutTails(frame, true);
}

/**
 * PV-2: the same cut with the tail bytes NOT looked at -- for a check that claims only that the rest of a room's frame
 * decodes in the old layout (`../cranes.test.ts`'s #337 room-frames check), where the room now fills the clock's nibble
 * (the seat's command number's low four bits, research 402 s3). A byte pin never goes through it: `withoutViewTails` is
 * the strict one, and its pins stay on it.
 */
export function withoutViewTailsUnchecked(frame: Uint8Array): Uint8Array {
  return cutTails(frame, false);
}

function cutTails(frame: Uint8Array, strict: boolean): Uint8Array {
  let at = HEAD + ((frame[5]! & 1) !== 0 ? OWN : 0);
  const n = frame[at]!;
  at += 1;
  const out: number[] = Array.from(frame.subarray(0, at));
  for (let i = 0; i < n; i++) {
    out.push(...frame.subarray(at, at + BODY_BYTES_V15));
    if (strict) {
      for (let j = 0; j < VIEW_TAIL_BYTES; j++) {
        const v = frame[at + BODY_BYTES_V15 + j];
        if (v !== 0) throw new Error(`body ${i}'s view tail byte ${j} is ${v}, not 0: the cut would hide it`);
      }
    }
    at += BODY_BYTES_V15 + VIEW_TAIL_BYTES;
  }
  out.push(...frame.subarray(at));
  return Uint8Array.from(out);
}
