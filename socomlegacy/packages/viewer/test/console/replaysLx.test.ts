// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { attachMapStillFallback, replaysHtml } from '../../src/console/render/replays';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { createState, type Adapters, type ReplayRow, type ReplaysView } from '../../src/console/state';

/**
 * LR-4 (the launcher redesign plan, the row "Profile"; LR.R8): Replays in the artifact's drawing (`S2-Launcher-v2.dc.html`,
 * its `replays` panel: the panel head's title and description over the list). The paged list keeps its table, its
 * columns, its More line and its drawer -- the rows wear LR-3's row drawing (`console.css`, `.cx-room`) -- and the
 * viewer opens over it as before. The description is the server's truth, not the artifact's ("recorded on this device"
 * is not how the launcher keeps them: the server records the matches). A browser adaptation.
 */
const ROW = (id: string): ReplayRow => ({ id, map: 'Frostfire', rules: 'Suppression', when: '2026-10-01 10:00', length: '12:34', players: 2, names: 'Alpha, Bravo' });
function draw(view: ReplaysView, row = 0) {
  const A: Adapters = sampleAdapters();
  A.replays = { ...A.replays, view: () => view };
  const S = createState(A);
  S.screen = 'replays';
  S.rp.row = row;
  const box = document.createElement('div');
  box.innerHTML = replaysHtml(S, A);
  return box;
}

describe('Profile: Replays (LR-4)', () => {
  it('the panel head: back to Profile, the h1 "Your matches", the description of where they are kept', () => {
    const box = draw({ kind: 'ok', entries: [ROW('a')] });
    expect(box.querySelector('h1.cx-title')!.textContent).toBe('Your matches');
    expect(box.querySelector('.cx-back')!.textContent).toBe('Profile');
    const desc = box.querySelector('.cx-screenhead__desc')?.textContent ?? '';
    expect(desc).toMatch(/server/i);
    expect(desc).not.toMatch(/this device/i);
  });

  it('the paged list keeps its table: a row per match (act replay, its index), the column head, the tally, the focused match\'s drawer', () => {
    const box = draw({ kind: 'ok', entries: [ROW('a'), ROW('b')], more: { kind: 'idle' } }, 1);
    const rows = [...box.querySelectorAll<HTMLElement>('.cx-rooms [data-scroll] .cx-room')];
    expect(rows.map((r) => [r.dataset['act'], r.dataset['i'], r.dataset['fk']])).toEqual([['replay', '0', 'replay-a'], ['replay', '1', 'replay-b']]);
    expect(rows[1]!.classList.contains('is-focused')).toBe(true);
    expect(box.querySelector('.cx-rooms__head')!.textContent).toBe('MapRulesRecordedLengthPlayers');
    expect(box.querySelector('.cx-rooms__foot')!.textContent).toBe('2 loaded · newest first');
    expect(box.querySelector('[data-act="replays-more"]')).not.toBeNull();
    expect(box.querySelector('.cx-drawer')).not.toBeNull();
  });

  // LR-11 (review-lr-4 F3): the status line was a `.cx-item` beside LR-3's rows (two drawings on one screen); it is LR-1's info
  // row (`render/rows.ts`) with the same facts -- the icon, the title, the line under it, the verb where a value stands --
  // focused, reachable (Tab and the frame's focus, LR-10's `reach`), its act and focus key as before.
  it('no list: the status line is an info row with its facts and its verb (signed out, reading, refused, none); the description stays', () => {
    const cases = [
      [{ kind: 'signed-out' }, 'Sign in to see your replays', 'The matches you played on this server appear here once you are signed in.', 'Sign in'],
      [{ kind: 'loading' }, 'Reading your replays…', 'Matches you record in game appear here, newest first', 'Refresh'],
      [{ kind: 'failed', title: 'No replays on this server', words: 'This server keeps no replays.' }, 'No replays on this server', 'This server keeps no replays.', 'Try again'],
      [{ kind: 'ok', entries: [] }, 'No replays yet', 'Matches you record in game appear here, newest first', 'Refresh'],
    ] as const;
    for (const [v, title, sub, verb] of cases) {
      const box = draw(v as ReplaysView);
      const row = box.querySelector<HTMLElement>('[data-act="replay-status"]')!;
      expect(row.classList.contains('cx-r')).toBe(true);
      expect(row.classList.contains('cx-r--info')).toBe(true);
      expect(row.classList.contains('is-focused')).toBe(true);
      expect([row.getAttribute('tabindex'), row.dataset['fk']]).toEqual(['0', 'replay-status']);
      expect(row.querySelector('.cx-r__icon .cx-ico')).not.toBeNull();
      expect(row.querySelector('.cx-r__label')!.textContent).toBe(title);
      expect(row.querySelector('.cx-r__hint')!.textContent).toBe(sub);
      expect(row.querySelector('.cx-r__value')!.textContent).toBe(verb);
      expect(row.getAttribute('aria-busy')).toBe(v.kind === 'loading' ? 'true' : null);
      expect(box.querySelector('.cx-item')).toBeNull();
      expect(box.querySelector('.cx-screenhead__desc')).not.toBeNull();
    }
  });
});

/**
 * REPLAY-STILLS (the owner, 2026-11-12, seat 2f: "replays in the "your matches" on live still say "Map picture from
 * your disc" instead of showing the image from the disc (you can just use the ones we got for the leaderboards and
 * cards if easy now)"): the focused replay's drawer shows its map's still -- LCM.R6's, at central's public route
 * `/api/maps/<STEM>/still.png` (LCM-9), the same picture the match page, the player page, the leaderboard and the public
 * replay page draw -- in the Rooms drawer's markup (`.cx-drawer__map` with an `<img>`, no `is-guide`), its `alt` the
 * map's name. No still (a stem the route cannot answer, or one whose picture failed), the text as before, per the disc's
 * state. A browser adaptation (product track).
 */
describe('Replays: the drawer\'s map still (REPLAY-STILLS)', () => {
  const STEM_ROW = (map: string): ReplayRow => ({ ...ROW('s'), map });
  function drawDisc(map: string, disc: 'ready' | 'empty') {
    const A: Adapters = sampleAdapters();
    A.replays = { ...A.replays, view: () => ({ kind: 'ok', entries: [STEM_ROW(map)] }) };
    A.disc = { ...A.disc, state: () => disc };
    const S = createState(A);
    S.screen = 'replays';
    const box = document.createElement('div');
    box.innerHTML = replaysHtml(S, A);
    return box.querySelector<HTMLElement>('.cx-drawer__map')!;
  }

  for (const disc of ['ready', 'empty'] as const) {
    it(`a map with a still: the slot holds the still, alt the map's name, no guide text (disc ${disc})`, () => {
      const slot = drawDisc('MP72', disc);
      const img = slot.querySelector<HTMLImageElement>('img')!;
      expect(img).not.toBeNull();
      expect(img.getAttribute('src')).toBe('/api/maps/MP72/still.png');
      expect(img.getAttribute('alt')).toBe('Crossroads');
      expect([img.getAttribute('loading'), img.getAttribute('decoding')]).toEqual(['lazy', 'async']);
      expect(slot.classList.contains('is-guide')).toBe(false);
      expect(slot.textContent).not.toMatch(/Map picture from your disc|Needs disc/);
      expect(slot.querySelector('.cx-drawer__name')!.textContent).toBe('Crossroads');
    });
  }

  it('no still for the map (not a stem the route answers): the text as today, per the disc', () => {
    for (const [disc, words] of [['ready', 'Map picture from your disc'], ['empty', 'Needs disc']] as const) {
      const slot = drawDisc('Frostfire', disc);
      expect(slot.querySelector('img')).toBeNull();
      expect(slot.classList.contains('is-guide')).toBe(true);
      expect(slot.querySelector('span')!.textContent).toBe(words);
    }
  });

  it('a still that fails to load: the error is caught at the document, the map is remembered, the next draw is the text', () => {
    const failed: string[] = [];
    const detach = attachMapStillFallback(document, (stem) => { failed.push(stem); });
    try {
      const slot = drawDisc('MP73', 'ready');
      document.body.append(slot);
      slot.querySelector('img')!.dispatchEvent(new Event('error'));   // an image's error does not bubble: caught in capture
      expect(failed).toEqual(['MP73']);
      const again = drawDisc('MP73', 'ready');
      expect(again.querySelector('img')).toBeNull();
      expect(again.querySelector('span')!.textContent).toBe('Map picture from your disc');
      slot.remove();
    } finally { detach(); }
  });
});
