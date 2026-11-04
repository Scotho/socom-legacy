import { describe, expect, it } from 'vitest';
import { codedFrames, displayOrder, pictureHeaders } from '../fmvStream';

/**
 * PLAT-19a's count-and-order proof (research 98 §7.8): the coded pictures of an MPEG-2 video elementary stream read off
 * its picture start codes (ISO/IEC 13818-2 6.2.3: `00 00 01 00`, then temporal_reference 10 bits and
 * picture_coding_type 3 bits), and the display order those pictures must come out in. Every stream here is synthetic.
 */

/** A picture header: the start code, then temporal_reference (10 bits) and picture_coding_type (3 bits). */
function pic(tr: number, type: number): number[] {
  return [0, 0, 1, 0, (tr >> 2) & 0xff, ((tr & 3) << 6) | ((type & 7) << 3), 0xff, 0xf8];
}
const SEQ = [0, 0, 1, 0xb3, 0x28, 0x01, 0xc0, 0x15];   // a sequence header's start (not a picture)
const SLICE = [0, 0, 1, 0x01, 0x12, 0x34, 0x00, 0x00, 0x00, 0x02, 0x55];   // a slice with zero bytes but no start code
const END = [0, 0, 1, 0xb7];

describe('pictureHeaders: the coded pictures of an elementary stream', () => {
  it('finds each picture start code with its offset, temporal reference and coding type', () => {
    const es = Uint8Array.from([...SEQ, ...pic(0, 1), ...SLICE, ...pic(2, 2), ...SLICE, ...pic(1, 3), ...SLICE, ...END]);
    expect(pictureHeaders(es)).toEqual([
      { offset: 8, temporalReference: 0, type: 'I' },
      { offset: 27, temporalReference: 2, type: 'P' },
      { offset: 46, temporalReference: 1, type: 'B' },
    ]);
  });

  it('reads a temporal reference above 255 across the two bytes', () => {
    expect(pictureHeaders(Uint8Array.from(pic(1021, 2)))).toEqual([{ offset: 0, temporalReference: 1021, type: 'P' }]);
  });

  it('a slice, sequence or end code is not a picture, and a start code cut off by the end of the buffer is not counted', () => {
    expect(pictureHeaders(Uint8Array.from([...SEQ, ...SLICE, ...END]))).toEqual([]);
    expect(pictureHeaders(Uint8Array.from([...SLICE, 0, 0, 1, 0, 0x00]))).toEqual([]);
  });

  it('finds a start code whose prefix follows more zero bytes', () => {
    expect(pictureHeaders(Uint8Array.from([0, 0, 0, 0, 0, 1, 0, 0, 0x08, 0, 0]))).toEqual([{ offset: 3, temporalReference: 0, type: 'I' }]);
  });
});

describe('field pictures (13818-2 6.3.10 picture_structure): two coded pictures, one frame', () => {
  /** A picture header and its picture coding extension with picture_structure `s` (1 top, 2 bottom, 3 frame). */
  const field = (tr: number, type: number, s: number): number[] => [...pic(tr, type), 0, 0, 1, 0xb5, 0x8f, 0xff, 0xf0 | s, 0x80, ...SLICE];

  it('pictureHeaders reads the structure from the picture coding extension that follows the header', () => {
    const es = Uint8Array.from([...SEQ, ...field(0, 1, 1), ...field(0, 2, 2), ...field(1, 3, 3)]);
    expect(pictureHeaders(es).map((h) => h.structure)).toEqual(['top', 'bottom', 'frame']);
  });

  it('codedFrames pairs a field with its complement; a frame picture stands alone; the pair takes the first field\'s index and type', () => {
    const es = Uint8Array.from([...SEQ, ...field(0, 1, 1), ...field(0, 2, 2), ...field(3, 2, 2), ...field(3, 2, 1), ...field(1, 3, 3), ...pic(2, 3), ...SLICE]);
    expect(codedFrames(pictureHeaders(es))).toEqual([
      { first: 0, second: 1, type: 'I', temporalReference: 0 },
      { first: 2, second: 3, type: 'P', temporalReference: 3 },
      { first: 4, type: 'B', temporalReference: 1 },
      { first: 5, type: 'B', temporalReference: 2 },
    ]);
  });

  it('a frame-coded stream: one frame per picture (the disc\'s case)', () => {
    const es = Uint8Array.from([...SEQ, ...pic(0, 1), ...SLICE, ...pic(2, 2), ...SLICE, ...pic(1, 3), ...SLICE]);
    expect(codedFrames(pictureHeaders(es)).map((f) => f.first)).toEqual([0, 1, 2]);
  });
});

describe('displayOrder: coding order to display order (13818-2 clause 6.1.1, frame reordering)', () => {
  it('all intra: display order is coding order', () => {
    expect(displayOrder(['I', 'I', 'I', 'I'])).toEqual([0, 1, 2, 3]);
  });

  it('a reference picture is shown when the next reference arrives; B pictures at once; the last at the end', () => {
    // coding I0 P1 B2 B3 P4 B5 -> display I0 B2 B3 P1 B5 P4
    expect(displayOrder(['I', 'P', 'B', 'B', 'P', 'B'])).toEqual([0, 2, 3, 1, 5, 4]);
  });

  it('a new I picture releases the held reference like a P (an open GOP: its B pictures come after it in coding order)', () => {
    // coding I0 P1 B2 I3 B4 B5 -> display I0 B2 P1 B4 B5 I3
    expect(displayOrder(['I', 'P', 'B', 'I', 'B', 'B'])).toEqual([0, 2, 1, 4, 5, 3]);
  });

  it('an empty stream displays nothing', () => {
    expect(displayOrder([])).toEqual([]);
  });
});
