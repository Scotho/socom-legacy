import { describe, expect, it } from 'vitest';
import {
  decodeVoiceDown, decodeVoiceUp, encodeVoiceDown, encodeVoiceUp, VOICE_PACKETS_PER_FRAME_READING, type VoiceDown, type VoiceUp,
} from '../src/net/voiceWire';
import { frameKind } from '../src/net/codec';
import { Frame, PROTOCOL_VERSION } from '../src/net/protocol';

/**
 * V-WIRE (sprint 20, W20.R2): the voice frame's two forms. Page to room `u8 1, u16 seq, u8 n, n x (u8 len, bytes)`; room
 * to page the same with `u8 speaker` after the type byte. The layout is ours (`VOICE_WIRE_FRAMING_PLACEHOLDER`, OT.R27);
 * n is at most four 20 ms packets an 80 ms frame (`VOICE_PACKETS_PER_FRAME_READING`, research 170 §6.1, R170.12).
 */

/** A packet of `len` bytes, each its own index plus a salt, so two packets never compare equal by accident. */
const packet = (len: number, salt: number): Uint8Array => Uint8Array.from({ length: len }, (_, i) => (i * 7 + salt) & 0xff);

const LENGTHS = [0, 1, 15, 255];

/** Every run of 1..4 packets over the lengths 0, 1, 15 and 255 (each length at each position, rotated). */
function packetSets(): Uint8Array[][] {
  const sets: Uint8Array[][] = [];
  for (let n = 1; n <= VOICE_PACKETS_PER_FRAME_READING; n++) {
    for (let r = 0; r < LENGTHS.length; r++) {
      sets.push(Array.from({ length: n }, (_, i) => packet(LENGTHS[(r + i) % LENGTHS.length]!, n * 16 + r * 4 + i)));
    }
  }
  return sets;
}

const plain = (packets: Uint8Array[]): number[][] => packets.map((p) => [...p]);

describe('voiceWire (V-WIRE): round trips', () => {
  it('the page-to-room form gives back its seq and the same packet bytes, 1 to 4 packets of 0, 1, 15 and 255 bytes', () => {
    for (const seq of [0, 1, 0x1234, 0xffff]) {
      for (const packets of packetSets()) {
        const back = decodeVoiceUp(encodeVoiceUp({ seq, packets }));
        expect(back).not.toBeNull();
        expect(back!.seq).toBe(seq);
        expect(plain(back!.packets)).toEqual(plain(packets));
      }
    }
  });

  it('the room-to-page form carries the speaker (0, 1, 255) with the seq and the packets', () => {
    for (const speaker of [0, 1, 255]) {
      for (const packets of packetSets()) {
        const back = decodeVoiceDown(encodeVoiceDown({ speaker, seq: 0xbeef, packets }));
        expect(back).not.toBeNull();
        expect(back!.speaker).toBe(speaker);
        expect(back!.seq).toBe(0xbeef);
        expect(plain(back!.packets)).toEqual(plain(packets));
      }
    }
  });

  it('the seq is a u16 and wraps', () => {
    const packets = [packet(3, 1)];
    expect(decodeVoiceUp(encodeVoiceUp({ seq: 0x10000, packets }))!.seq).toBe(0);
    expect(decodeVoiceUp(encodeVoiceUp({ seq: 0x10005, packets }))!.seq).toBe(5);
    expect(decodeVoiceDown(encodeVoiceDown({ speaker: 3, seq: 0x1ffff, packets }))!.seq).toBe(0xffff);
  });

  it('integers are little-endian, as codec.ts writes them', () => {
    const up = encodeVoiceUp({ seq: 0x0201, packets: [packet(1, 9)] });
    expect([...up]).toEqual([Frame.Voice, 0x01, 0x02, 1, 1, 9]);
    const down = encodeVoiceDown({ speaker: 7, seq: 0x0201, packets: [packet(1, 9)] });
    expect([...down]).toEqual([Frame.Voice, 7, 0x01, 0x02, 1, 1, 9]);
  });
});

describe('voiceWire (V-WIRE): the type byte', () => {
  it('both forms open with Frame.Voice, which frameKind reads', () => {
    const packets = [packet(15, 2), packet(15, 3)];
    expect(frameKind(encodeVoiceUp({ seq: 9, packets }))).toBe(Frame.Voice);
    expect(frameKind(encodeVoiceDown({ speaker: 4, seq: 9, packets }))).toBe(Frame.Voice);
    expect(Frame.Voice).toBe(1);
  });
});

describe('voiceWire (V-WIRE): a malformed frame is refused, never thrown', () => {
  /** The decoders over a frame given as bytes: each must return null and throw nothing. */
  const refusedUp = (bytes: number[]): void => {
    let out: VoiceUp | null | undefined;
    expect(() => { out = decodeVoiceUp(Uint8Array.from(bytes)); }).not.toThrow();
    expect(out).toBeNull();
  };
  const refusedDown = (bytes: number[]): void => {
    let out: VoiceDown | null | undefined;
    expect(() => { out = decodeVoiceDown(Uint8Array.from(bytes)); }).not.toThrow();
    expect(out).toBeNull();
  };

  it('an empty frame', () => {
    refusedUp([]);
    refusedDown([]);
  });

  it('a first byte that is not 1', () => {
    for (const kind of [Frame.Snapshot, Frame.Commands, 3, 255]) {
      refusedUp([kind, 0, 0, 1, 0]);
      refusedDown([kind, 2, 0, 0, 1, 0]);
    }
  });

  it('n = 0', () => {
    refusedUp([1, 0, 0, 0]);
    refusedDown([1, 2, 0, 0, 0]);
  });

  it('n above VOICE_PACKETS_PER_FRAME_READING', () => {
    const n = VOICE_PACKETS_PER_FRAME_READING + 1;
    const body = Array.from({ length: n }, () => [1, 0xaa]).flat();
    refusedUp([1, 0, 0, n, ...body]);
    refusedDown([1, 2, 0, 0, n, ...body]);
    refusedUp([1, 0, 0, 255, ...body]);
  });

  it('a packet length past the end of the frame', () => {
    refusedUp([1, 0, 0, 1, 5, 1, 2, 3]);
    refusedDown([1, 2, 0, 0, 1, 5, 1, 2, 3]);
    refusedUp([1, 0, 0, 2, 1, 9]); // the second packet's length byte missing
    refusedDown([1, 2, 0, 0, 2, 1, 9]);
  });

  it('trailing bytes after the last packet', () => {
    refusedUp([1, 0, 0, 1, 1, 9, 0]);
    refusedDown([1, 2, 0, 0, 1, 1, 9, 0]);
  });

  it('a seq, a speaker or the count cut short', () => {
    refusedUp([1]);
    refusedUp([1, 0]);
    refusedUp([1, 0, 0]);
    refusedDown([1]);
    refusedDown([1, 2]);
    refusedDown([1, 2, 0]);
    refusedDown([1, 2, 0, 0]);
  });

  it('the encoder throws on its own caller\'s bug: a packet over 255 bytes, a count out of 1..4, a speaker out of a byte', () => {
    expect(() => encodeVoiceUp({ seq: 0, packets: [packet(256, 0)] })).toThrow();
    expect(() => encodeVoiceUp({ seq: 0, packets: [] })).toThrow();
    expect(() => encodeVoiceUp({ seq: 0, packets: Array.from({ length: 5 }, (_, i) => packet(1, i)) })).toThrow();
    expect(() => encodeVoiceDown({ speaker: 256, seq: 0, packets: [packet(1, 0)] })).toThrow();
    expect(() => encodeVoiceDown({ speaker: -1, seq: 0, packets: [packet(1, 0)] })).toThrow();
  });
});

describe('voiceWire (V-WIRE): the sizes', () => {
  it('four 15-byte packets: 68 bytes up, 69 down', () => {
    const packets = Array.from({ length: 4 }, (_, i) => packet(15, i));
    expect(encodeVoiceUp({ seq: 1, packets }).byteLength).toBe(1 + 2 + 1 + 4 * (1 + 15));
    expect(encodeVoiceUp({ seq: 1, packets }).byteLength).toBe(68);
    expect(encodeVoiceDown({ speaker: 1, seq: 1, packets }).byteLength).toBe(69);
  });
});

describe('voiceWire (V-WIRE): the protocol', () => {
  it('stays 11: the voice type was reserved, no bump (research 224 §2.6)', () => {
    expect(PROTOCOL_VERSION).toBe(15);                           // PROTO-15's bump (V19.R10: the mover's rules); 14 ER-2's, 13 PLANT-AIM's, 12 SEP-POP's; this part unchanged
  });

  it('VOICE_PACKETS_PER_FRAME_READING is the original\'s four codec frames an 80 ms read', () => {
    expect(VOICE_PACKETS_PER_FRAME_READING).toBe(4);
  });
});
