import { expect } from 'vitest';
import { encodeRecord } from '../../../../match/src/replay/format';
import { decodeSegment } from '../../../src/replay/load';
import { header } from '../../replayFixture';

/**
 * MU2-13: the loader's own sentences for the player, made from bytes by the loader itself (`decodeSegment`), so a
 * sentence changed in `src/replay/load.ts` fails the tests that read it (`./states.test.ts`, the kind; `./viewer.test.ts`,
 * the viewer's refusal states). Generated values only; nothing of the disc.
 */

/** The loader's sentence for `bytes`, as the player is told it. */
export async function sentenceOf(bytes: Uint8Array): Promise<string> {
  const e = await decodeSegment(bytes).then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(Error);
  return (e as Error).message;
}

/** A header-only file of another protocol (one below every protocol this build decodes) or of another format. */
export const OLDER_PROTOCOL = (): Uint8Array => encodeRecord({ kind: 'header', header: header({ protocol: 1 }) });
export const OTHER_FORMAT = (): Uint8Array => encodeRecord({ kind: 'header', header: header({ format: 4 }) });
/** A file whose first record is not a header: it does not parse as a replay. */
export const NO_HEADER = (): Uint8Array => encodeRecord({ kind: 'end', tick: 1, reason: 'x' });
