// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { replaysHtml } from '../../src/console/render/replays';
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
