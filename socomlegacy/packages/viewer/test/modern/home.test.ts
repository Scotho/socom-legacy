// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { serverStateWords } from '../../src/modern/home/cards';
import { SERVER_OFFLINE } from '../../src/modern/lobbies/data';
import { supportedInput } from '../../src/startup';
import { discAssetsOf, pictureOf, type MapPicture } from '../../src/modern/discAssets';
import type { AssetSource } from '@s2u/archive';
import type { LoadingScreen } from '../../src/loadingAssets';

/**
 * LU-2' of the modern-UI plan (`docs/plans/briefs/modern-ui-live-site-scope.md` 3; rulings MU.R18, MU.R19, MU.R23 (2),
 * MU.R24): the launcher's home was a summary of the player's state -- the Ready check and six cards. A browser adaptation
 * (MU.R1): the project's own launcher, nothing of the original's screens.
 *
 * CX-25 (the console plan): Home itself (`src/modern/home/index.ts` `mountHome`) is retired with the modern shell, which
 * alone mounted it. CX-26: the card builders `home/cards.ts` kept (`homeCards`, `readyFacts`, `readyLede`, `discLine`),
 * read by this file alone since, are retired too, their cases named in CX-26's commit and the console plan's Log. What
 * stays held here: `serverStateWords` (the console's server line reads it), and the readers the cards reused. CX-27:
 * `replays/data.ts` `newestReplays` (the Recent matches card's first three), read by this file alone since, is retired,
 * its case not carried (Home is gone; the console's Replays list pages the whole listing,
 * `test/console/replaysPaging.test.ts`).
 */

const UP = { kind: 'ok', rooms: [{ name: 'MP2', map: 'MP2', players: 3 }, { name: 'MP51', map: 'MP51', players: 0 }] } as const;
const DOWN = { kind: 'failed', why: 'unreachable' } as const;

describe('the readers the cards reused', () => {
  it('discAssets.ts: pictureOf takes the binding\'s title and its load_picture bitmap from a read loading screen', () => {
    const rgba = { width: 2, height: 1, data: new Uint8ClampedArray(8) };
    const screen = { binding: { title: 'Crossroads', picture: 'LD_MP2_PROG.tif' }, bitmaps: [['ld_mp2_prog.tif', rgba]] } as unknown as LoadingScreen;
    expect(pictureOf(screen)).toEqual({ title: 'Crossroads', picture: rgba });
    expect(pictureOf({ binding: null, bitmaps: [] } as unknown as LoadingScreen)).toEqual({ title: null, picture: null });
  });
  it('discAssets.ts: readMapPicture reads once per map, and refuses a stem that is not a map archive\'s', async () => {
    const pic: MapPicture = { title: 'Crossroads', picture: null };
    const mapPictures = vi.fn(async () => pic);
    const src: AssetSource = { list: async () => [], read: async (p) => { throw new Error(`no ${p}`); } };
    const a = discAssetsOf(src, { valves: vi.fn(), itemNames: vi.fn(), mapPictures });
    expect(await a.readMapPicture!('MP2')).toBe(pic);
    expect(await a.readMapPicture!('MP2')).toBe(pic);
    expect(mapPictures).toHaveBeenCalledTimes(1);
    expect(mapPictures).toHaveBeenCalledWith(src, 'MP2');
    await expect(a.readMapPicture!('../ETC')).rejects.toThrow();
    expect(mapPictures).toHaveBeenCalledTimes(1);
  });
});

// ---- MU-F3 (dot's Home delta 1): the setup page's own readiness contract ----

describe('MU-F3 1: the setup page\'s supported-input contract', () => {
  it('startup.ts supportedInput: a standard pad, else a touch device, else a keyboard; none, null', () => {
    expect(supportedInput({ pad: true, touch: true, keyboard: false })).toBe('controller');
    expect(supportedInput({ pad: false, touch: true, keyboard: false })).toBe('touch');
    expect(supportedInput({ pad: false, touch: false, keyboard: true })).toBe('keyboard');
    expect(supportedInput({ pad: false, touch: false, keyboard: false })).toBeNull();
  });
});

describe('MU-P1b 14: one wording for the server state (serverStateWords, shared by the sections)', () => {
  it('waiting, up, down; a lost session is the account\'s, not the server\'s', () => {
    expect(serverStateWords({ kind: 'waiting' })).toBe('Checking');
    expect(serverStateWords(UP)).toBe('Online');
    expect(serverStateWords(DOWN)).toBe('Offline · Retrying...');
    expect(serverStateWords({ kind: 'failed', why: 'refused' })).toBe('Server unavailable · Retrying...');   // MU-P1d: answers but fails
    expect(serverStateWords({ kind: 'failed', why: 'session-lost' })).toBe('Online');
    expect(SERVER_OFFLINE).toBe('Offline');                    // where nothing retries (a listing asked once)
  });
});
