// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { encodeRecord, gzipReplay } from '../../../../match/src/replay/format';
import { REPLAY_NOT_FOUND_OR_NOT_YOURS } from '../../../src/replay/load';
import { REPLAY_REFUSAL_WORDS, replayRefusalKind } from '../../../src/modern/replays/view';
import { header } from '../../replayFixture';
import { NO_HEADER, OLDER_PROTOCOL, OTHER_FORMAT, sentenceOf } from './sentences';

/**
 * MU2-13 (row MU2-13, "the states"): the replay's refusal sorted into its kind, each with its words.
 *
 * - **corrupt** and **another version** -- the replay's own file refused by the existing loader (`src/replay/load.ts`,
 *   its sentence for the player kept verbatim under the title); and the two refusals of its fetch (not found or not
 *   yours; anything else). The kind is read from the loader's own sentences, made here by the loader itself from bytes
 *   (`decodeSegment`, `./sentences`), so a sentence changed there fails here. The titles are the modern UI's own (the
 *   design has none): the plan's H-next row.
 * - **still recording** -- no row can be one: the match server lists and serves a recording only once it is closed (its
 *   sidecar is written at the close; a `.part` is never listed: `packages/central/src/replay/http.ts`, "The scan";
 *   `deploy/README.md`). Once a file is open, the transport says "Partial recording" for one cut before its end
 *   (`./transport.test.ts`).
 *
 * CX-26 (the console plan): the states drawn -- each refusal in the viewer, its title, its line, the sentence, Back --
 * are held over `mountReplayViewer` in `./viewer.test.ts` (the modern Replays section that drew them is retired); the
 * list's "none" is the console's (`test/console/replaysStates.test.ts`). A browser adaptation (MU.R1): nothing of the
 * game.
 */

/**
 * MU2-13 review F1: a format-1 file -- its header whole and read -- whose next record has a tag no format knows (99,
 * empty). `decodeRecords` throws on it (a format-1 file never held an unknown kind, so it is not skipped), and the
 * header passes `refusal`'s version checks, so the loader says its damaged-file sentence (`load.ts` `refusal`'s last).
 */
const BAD_TAG = (): Uint8Array => {
  const head = encodeRecord({ kind: 'header', header: header({ format: 1 }) });
  const out = new Uint8Array(head.byteLength + 5);
  out.set(head);
  out[head.byteLength] = 99;                                   // the tag; its u32 length stays 0
  return out;
};
/** Two plain bytes: less than one record's prefix, so no whole record (`decodeSegment`'s "holds no whole record yet"). */
const NO_WHOLE_RECORD = (): Uint8Array => new Uint8Array([7, 1]);

describe('MU2-13: the refusal\'s kind, read from the loader\'s own sentences', () => {
  it('an older protocol, a newer one, another file format: "version"', async () => {
    expect(replayRefusalKind(await sentenceOf(OLDER_PROTOCOL()))).toBe('version');
    expect(replayRefusalKind(await sentenceOf(encodeRecord({ kind: 'header', header: header({ protocol: 999 }) })))).toBe('version');
    expect(replayRefusalKind(await sentenceOf(OTHER_FORMAT()))).toBe('version');
  });
  it('a file that does not parse: "corrupt" (no header, empty, not a readable gzip, a bad tag, no whole record)', async () => {
    expect(replayRefusalKind(await sentenceOf(NO_HEADER()))).toBe('corrupt');
    expect(replayRefusalKind(await sentenceOf(new Uint8Array(0)))).toBe('corrupt');
    expect(replayRefusalKind(await sentenceOf(new Uint8Array([0x1f, 0x8b, 1, 2, 3])))).toBe('corrupt');
    // MU2-13 review F1: the damaged-file sentence and the no-whole-record one, each said by the loader from bytes (as
    // every case above), never typed here -- a rewording in `load.ts` fails this test rather than sorting as unavailable.
    expect(replayRefusalKind(await sentenceOf(BAD_TAG()))).toBe('corrupt');
    expect(replayRefusalKind(await sentenceOf(gzipReplay(BAD_TAG())))).toBe('corrupt');     // a closed (gzip) file alike
    expect(replayRefusalKind(await sentenceOf(NO_WHOLE_RECORD()))).toBe('corrupt');
  });
  it('the fetch\'s 404 (not found, or not yours): "missing"; anything else: "unavailable"', () => {
    expect(replayRefusalKind(REPLAY_NOT_FOUND_OR_NOT_YOURS)).toBe('missing');
    expect(replayRefusalKind('The recording could not be fetched (HTTP 500).')).toBe('unavailable');
    expect(replayRefusalKind("The match's world did not open within 30 seconds. Go back and watch it again.")).toBe('unavailable');
    expect(replayRefusalKind('')).toBe('unavailable');
  });
  it('each kind has its title and line, the modern UI\'s own', () => {
    expect(Object.keys(REPLAY_REFUSAL_WORDS).sort()).toEqual(['corrupt', 'missing', 'unavailable', 'version']);
    for (const [kind, [title, line]] of Object.entries(REPLAY_REFUSAL_WORDS)) {
      expect(title, kind).toMatch(/\S/);
      expect(line, kind).toMatch(/\S/);
    }
  });
});
