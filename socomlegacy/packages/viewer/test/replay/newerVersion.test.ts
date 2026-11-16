// test/replay/newerVersion.test.ts -- FL-2b: a replay from a newer version says "reload the page" (product track, OT.R53)
import { describe, expect, it } from 'vitest';
import { encodeRecord, REPLAY_FORMATS, REPLAY_PROTOCOLS } from '../../../match/src/replay/format';
import { decodeSegment, ReplayLoadError, REPLAY_DOOR_OTHER_VERSION, REPLAY_NEWER_VERSION } from '../../src/replay/load';
import { REPLAY_REFUSAL_WORDS, refusalWords, replayRefusalKind } from '../../src/modern/replays/view';
import { header } from '../replayFixture';

/**
 * FL-2b (the main controller's ruling, 67, 2026-11-14): a page tab left open across a release runs the old viewer, which
 * meets the new host's newer recording. A recording whose format or protocol is NEWER than every one this build reads
 * is refused with one sentence that tells the player what to do -- reload the page -- at a host's door and from a file
 * alike; an older or otherwise unknown version keeps its words. A browser adaptation (REPLAY_ADAPTATION): nothing of
 * the game. Values made from the format's own lists, never typed here.
 */

const MAX_FORMAT = Math.max(...REPLAY_FORMATS);
const MAX_PROTOCOL = Math.max(...REPLAY_PROTOCOLS);
const headerOnly = (over: Record<string, unknown>): Uint8Array =>
  encodeRecord({ kind: 'header', header: { ...header(), ...over } as unknown as ReturnType<typeof header> });

async function refused(bytes: Uint8Array, door = false): Promise<ReplayLoadError> {
  const e = await decodeSegment(bytes, { door }).then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(ReplayLoadError);
  return e as ReplayLoadError;
}

describe('FL-2b: a recording newer than this build reads says "reload the page"', () => {
  it('the sentence, exactly', () => {
    expect(REPLAY_NEWER_VERSION).toBe('This replay is from a newer version: reload the page.');
  });

  it('from a file: a format one past the newest this build reads', async () => {
    const e = await refused(headerOnly({ format: MAX_FORMAT + 1 }));
    expect(e.kind).toBe('version');
    expect(e.message).toBe(REPLAY_NEWER_VERSION);
  });

  it('at a host\'s door: a format one past the newest', async () => {
    const e = await refused(headerOnly({ format: MAX_FORMAT + 1 }), true);
    expect(e.kind).toBe('version');
    expect(e.message).toBe(REPLAY_NEWER_VERSION);
  });

  it('a protocol one past the newest, from a file and at a door', async () => {
    for (const door of [false, true]) {
      const e = await refused(headerOnly({ protocol: MAX_PROTOCOL + 1 }), door);
      expect(e.kind, String(door)).toBe('version');
      expect(e.message, String(door)).toBe(REPLAY_NEWER_VERSION);
    }
  });

  it('an OLDER unsupported format or protocol keeps today\'s words', async () => {
    const file = await refused(headerOnly({ format: 0 }));
    expect(file.kind).toBe('version');
    expect(file.message).toBe(`This recording's file format is version 0; this build reads versions ${REPLAY_FORMATS.slice(0, -1).join(', ')} and ${MAX_FORMAT}.`);
    expect((await refused(headerOnly({ protocol: 1 }))).message).toMatch(/^This recording was made with network protocol 1;/);
    for (const over of [{ format: 0 }, { protocol: 1 }]) {
      const door = await refused(headerOnly(over), true);
      expect(door.kind).toBe('version');
      expect(door.message).toBe(REPLAY_DOOR_OTHER_VERSION);
    }
  });

  it('at a door, a format or protocol that is not a whole number stays "damaged" (SA-9b), even a large one', async () => {
    for (const over of [{ format: MAX_FORMAT + 0.5 }, { protocol: MAX_PROTOCOL + 0.5 }, { format: 'x' }, { format: Number.MAX_VALUE }]) {
      const e = await refused(headerOnly(over), true);
      expect(e.kind, JSON.stringify(over)).toBe('corrupt');
      expect(e.message).toBe('This recording is damaged and cannot be played.');
    }
  });
});

describe('FL-2b: the Replays viewer says the newer sentence where it says a version refusal', () => {
  it('the sentence alone sorts as "version" (a text-only reason)', () => {
    expect(replayRefusalKind(REPLAY_NEWER_VERSION)).toBe('version');
  });
  it('the newer case: its own title, and the sentence is the line (no "this page does not play" beside it)', () => {
    const [title, line] = refusalWords('version', REPLAY_NEWER_VERSION);
    expect(title).toBe('Recorded by a newer version');
    expect(line).toBeNull();                                   // the sentence itself, shown as the alert, is the line
  });
  it('any other refusal keeps its kind\'s words', () => {
    expect(refusalWords('version', REPLAY_DOOR_OTHER_VERSION)).toEqual(REPLAY_REFUSAL_WORDS.version);
    expect(refusalWords('corrupt', REPLAY_NEWER_VERSION)).toEqual(REPLAY_REFUSAL_WORDS.corrupt);
  });
});
