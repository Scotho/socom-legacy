/**
 * The coded pictures of an MPEG-2 video elementary stream, for the count-and-order proof (research 98 §7.8; research
 * 120 §8). Pure, no I/O. The harness (`tools/fmv-spike.ts decode --check`) decodes a movie through `@s2u/fmv`'s core,
 * which feeds the decoder one coded picture per feed tagged with its coding index (`mpeg2_tag_picture`), and holds the
 * tags displayed against `displayOrder` of these pictures: every coded picture out exactly once, in the order the
 * standard displays them. The elementary stream comes from PLAT-18's demuxer (`demuxPss`), since PLAT-19b; the header
 * reading is the package's (`readPictureHeader`), so the harness and the page read a header the same way.
 *
 * A frame may be coded as two field pictures (13818-2 clause 6.1.1, frames and fields: picture_structure 1 or 2 in
 * the picture coding extension): two picture headers, one displayed frame. `codedFrames` pairs them, and the check
 * counts frames.
 */
import { readPictureHeader, type PictureStructure, type PictureType } from '@s2u/fmv';

export type { PictureStructure, PictureType };

/**
 * A coded picture: the offset of its picture start code's first byte, its temporal_reference, its coding type and,
 * when a picture coding extension follows the header, its picture_structure.
 */
export interface PictureHeader {
  offset: number;
  temporalReference: number;
  type: PictureType;
  structure?: PictureStructure;
}

/**
 * Every picture start code (`00 00 01 00`, ISO/IEC 13818-2 6.2.3 picture_header) in `es`, with the fields that follow
 * it. The standard keeps the start-code prefix out of coded data, so a match is a header; a header cut off by the end
 * of the buffer is not counted.
 */
export function pictureHeaders(es: Uint8Array): PictureHeader[] {
  const out: PictureHeader[] = [];
  for (let i = 0; i + 5 < es.length; i++) {
    if (es[i] !== 0 || es[i + 1] !== 0 || es[i + 2] !== 1 || es[i + 3] !== 0) continue;
    out.push({ offset: i, ...readPictureHeader(es, i) });
    i += 3;
  }
  return out;
}

/** A displayed frame: one frame picture, or a field picture and its complementary field (`second`). */
export interface CodedFrame {
  first: number;
  second?: number;
  type: PictureType;
  temporalReference: number;
}

/**
 * The coded pictures grouped into frames (13818-2 clause 6.1.1, frames and fields): a field picture followed by the
 * opposite field is one frame, carrying the first field's index, type and temporal reference -- the picture libmpeg2
 * displays for the pair (`display_picture`, the second field being `display_picture_2nd`). A frame picture, or a field with no
 * complement, stands alone.
 */
export function codedFrames(headers: readonly PictureHeader[]): CodedFrame[] {
  const out: CodedFrame[] = [];
  for (let k = 0; k < headers.length; k++) {
    const h = headers[k]!;
    const next = headers[k + 1];
    const field = h.structure === 'top' || h.structure === 'bottom';
    if (field && next && (next.structure === 'top' || next.structure === 'bottom') && next.structure !== h.structure) {
      out.push({ first: k, second: k + 1, type: h.type, temporalReference: h.temporalReference });
      k++;
    } else {
      out.push({ first: k, type: h.type, temporalReference: h.temporalReference });
    }
  }
  return out;
}

/**
 * The display order of pictures given in coding order (ISO/IEC 13818-2 clause 6.1.1, "frame reordering"): a B picture is displayed
 * as soon as it is decoded; an I or P picture is held and displayed when the next I or P arrives, or at the end of
 * the stream. Returns coding indices in display order.
 */
export function displayOrder(codingTypes: readonly PictureType[]): number[] {
  const out: number[] = [];
  let held = -1;
  codingTypes.forEach((t, k) => {
    if (t === 'B') { out.push(k); return; }
    if (held >= 0) out.push(held);
    held = k;
  });
  if (held >= 0) out.push(held);
  return out;
}
