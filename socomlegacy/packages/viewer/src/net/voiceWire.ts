import { Frame } from './protocol';

/**
 * The voice frame on the match socket (sprint 20, V-WIRE; the plan's W20.R1-R2): the pure codec of its two forms, used by
 * the room's relay and the page's voice client (SVC-20b, wave 2). One frame every 80 ms, the original's cadence, carrying
 * that frame's 20 ms Opus packets (W20.R3).
 *
 * - Page to room (`VoiceUp`): `u8 1, u16 seq, u8 n, n x (u8 len, bytes)`.
 * - Room to page (`VoiceDown`): `u8 1, u8 speaker, u16 seq, u8 n, n x (u8 len, bytes)` -- the speaker is the room's member
 *   id for the connection the frame came in on, never a claim of the page (the plan's constraint 4). A member id is
 *   1..`MEMBER_ID_CAP` (239, `match/src/server.ts`), so a byte holds it.
 *
 * Integers are little-endian, as `codec.ts`'s `Writer` writes them; this module keeps its own `DataView` (codec.ts's
 * `Writer` and `Reader` are private to it). The type byte is `Frame.Voice` (1), reserved by protocol 11 (research 224
 * §2.1), so the codec needs no version bump (224 §2.6). The decoders never throw: a malformed frame -- empty, another
 * type, a field cut short, a count of 0 or past the cap, a packet past the end, bytes after the last packet -- is null,
 * the peer's to drop. The encoders throw only on their own caller's bug (a packet over 255 bytes, a count out of
 * 1..`VOICE_PACKETS_PER_FRAME_READING`, a speaker out of a byte), never on a peer's bytes.
 */

/**
 * The packets in one 80 ms voice frame, at most. The original reads 0x500 bytes (640 samples, 80 ms at 8000 Hz) and
 * encodes them as four codec frames of 0x140 bytes (160 samples, 20 ms) each before it hands the message on
 * (`FUN_0030f990` D:L211453-211550, the loop of four at D:L211490-211498; research 170 §6.1, R170.12); our four are 20 ms
 * Opus packets (W20.R2, W20.R3). [reading] -- the cadence transcribed, not yet measured on a talker (research 170 §10).
 */
export const VOICE_PACKETS_PER_FRAME_READING = 4;

/**
 * The frame's layout, ours: the original's voice goes through the DME library, whose framing is not read (research 170
 * §6.1, §10), and OT.R27 makes the network ours. The plan's W20.R2; this string documents it, the code below is it.
 */
export const VOICE_WIRE_FRAMING_PLACEHOLDER = 'u8 kind, (u8 speaker,) u16 seq, u8 n, n x (u8 len, bytes)';

/** A voice frame from the page: its own sequence number (a u16, wrapping) and its 20 ms packets, 1..4 of 0..255 bytes. */
export interface VoiceUp { seq: number; packets: Uint8Array[] }
/** A voice frame from the room: the page's frame with the speaker's member id, set by the room. */
export interface VoiceDown extends VoiceUp { speaker: number }

/** The bytes a packet run takes on the wire: a length byte each, then its bytes. Throws on the caller's bug. */
function packetBytes(packets: Uint8Array[]): number {
  if (packets.length < 1 || packets.length > VOICE_PACKETS_PER_FRAME_READING) {
    throw new RangeError(`a voice frame carries 1..${VOICE_PACKETS_PER_FRAME_READING} packets, not ${packets.length}`);
  }
  let size = 0;
  for (const p of packets) {
    if (p.byteLength > 0xff) throw new RangeError(`a voice packet is at most 255 bytes, not ${p.byteLength}`);
    size += 1 + p.byteLength;
  }
  return size;
}

/** Writes the u16 seq, the count and the packets from `at`: the part both forms share. */
function writeTail(out: Uint8Array, view: DataView, at: number, seq: number, packets: Uint8Array[]): void {
  view.setUint16(at, seq & 0xffff, true);
  at += 2;
  out[at++] = packets.length;
  for (const p of packets) {
    out[at++] = p.byteLength;
    out.set(p, at);
    at += p.byteLength;
  }
}

/** Reads the u16 seq, the count and the packets from `at` to the frame's end; null on any malformation. */
function readTail(bytes: Uint8Array, view: DataView, at: number): VoiceUp | null {
  if (at + 3 > bytes.byteLength) return null;
  const seq = view.getUint16(at, true);
  at += 2;
  const n = bytes[at++]!;
  if (n < 1 || n > VOICE_PACKETS_PER_FRAME_READING) return null;
  const packets: Uint8Array[] = [];
  for (let i = 0; i < n; i++) {
    if (at >= bytes.byteLength) return null;
    const len = bytes[at++]!;
    if (at + len > bytes.byteLength) return null;
    packets.push(bytes.subarray(at, at + len));
    at += len;
  }
  return at === bytes.byteLength ? { seq, packets } : null;
}

const viewOf = (bytes: Uint8Array): DataView => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

/** The page's voice frame: `u8 1, u16 seq, u8 n, n x (u8 len, bytes)`. */
export function encodeVoiceUp(f: VoiceUp): Uint8Array {
  const out = new Uint8Array(1 + 2 + 1 + packetBytes(f.packets));
  out[0] = Frame.Voice;
  writeTail(out, viewOf(out), 1, f.seq, f.packets);
  return out;
}

/** A page's voice frame, or null when it is not a well-formed one. The packets are views into `bytes`, not copies. */
export function decodeVoiceUp(bytes: Uint8Array): VoiceUp | null {
  if (bytes.byteLength < 1 || bytes[0] !== Frame.Voice) return null;
  return readTail(bytes, viewOf(bytes), 1);
}

/** The room's voice frame: `u8 1, u8 speaker, u16 seq, u8 n, n x (u8 len, bytes)`. */
export function encodeVoiceDown(f: VoiceDown): Uint8Array {
  if (!Number.isInteger(f.speaker) || f.speaker < 0 || f.speaker > 0xff) {
    throw new RangeError(`a voice frame's speaker is a byte, not ${f.speaker}`);
  }
  const out = new Uint8Array(1 + 1 + 2 + 1 + packetBytes(f.packets));
  out[0] = Frame.Voice;
  out[1] = f.speaker;
  writeTail(out, viewOf(out), 2, f.seq, f.packets);
  return out;
}

/** A room's voice frame, or null when it is not a well-formed one. The packets are views into `bytes`, not copies. */
export function decodeVoiceDown(bytes: Uint8Array): VoiceDown | null {
  if (bytes.byteLength < 2 || bytes[0] !== Frame.Voice) return null;
  const tail = readTail(bytes, viewOf(bytes), 2);
  return tail ? { speaker: bytes[1]!, seq: tail.seq, packets: tail.packets } : null;
}
