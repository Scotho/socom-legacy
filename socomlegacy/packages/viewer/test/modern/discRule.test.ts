// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AssetSource } from '@s2u/archive';
import { publishDiscImage } from '../../src/modern/discImage';
import { publishDisc, type DiscStoreState } from '../../src/modern/discStore';
import { launcherState } from '../../src/modern/launcherState';

/**
 * MU2-7, the ISO rule (MU.R3: every screen that needs no game asset works before the disc is in; a screen that draws a
 * game asset waits for it and says so) over the real disc store and the real `launcherState` -- the view every section
 * is handed -- through each of the store's five states. What a screen needs of the disc is its own row's (each holds
 * its own cases over a fake view: Settings `m/modernSettingsDisc`, `m/settingsHardening`; Profile `m/modernProfile`,
 * `m/modernProfileDisc`; Loadouts `m/loadout/loadoutDisc`; Home `m/home`; Play online `m/lobbies/details`); this file
 * holds the one change MU2-7 made to the view under all of them: `in-game` -- the overlay over a running game -- is the
 * disc in, as the console reads it, so a disc-gated control is live there and the "insert" words are not said. CX-26:
 * its Replays case (each card's Watch live exactly while the disc is in) went with the retired section (`mountReplays`);
 * the console's Replays rows lock without the disc (`test/console/adapters/replays.test.ts`, "Needs disc").
 */
const STATES: DiscStoreState[] = ['empty', 'reading', 'ready', 'error', 'in-game'];
const image: AssetSource = { list: async () => [], read: async (p) => { throw new Error(`no ${p}`); } };

describe('the ISO rule over the real disc view (MU2-7)', () => {
  beforeEach(() => { document.body.innerHTML = '<section id="sec"></section>'; publishDiscImage(document, image); });
  afterEach(() => { publishDiscImage(document, null); publishDisc(document, { state: 'empty', filename: null }); });

  it('the readers are handed out exactly while the disc is in; the disc\'s facts follow it, never kept past it', () => {
    const view = launcherState(document);
    for (const s of STATES) {
      publishDisc(document, { state: s, filename: s === 'empty' ? null : 'socom2.iso' });
      const discIn = s === 'ready' || s === 'in-game';
      expect([view.isoInserted(), view.assets!() !== null], s).toEqual([discIn, discIn]);
      if (!discIn) expect([view.kind!(), view.label!()], s).toEqual([null, '']);
    }
  });
});
