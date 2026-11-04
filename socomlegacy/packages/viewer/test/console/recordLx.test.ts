// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { FRIENDS_EMPTY_HINT_ADAPTATION, recordHtml, recordRows } from '../../src/console/render/profile';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { createState, type Adapters, type ProfileAdapter, type ServiceRecordView } from '../../src/console/state';

/**
 * LR-4 (the launcher redesign plan, the row "Profile"; LR.R8): the Service record in the artifact's drawing
 * (`S2-Launcher-v2.dc.html`, its `record` panel: label and value rows, the rank among them, under the panel head with
 * its description) in LR-1's row kinds (`render/rows.ts`) and panel head (`render/head.ts`). What it says is the
 * server's (CX.R5): the name, the rank's medal, the clan, friends, ignored, the ladder, PLAYER INFO's rows and the
 * mission loadouts -- never the artifact's career figures (wins, kills, accuracy, hours: LR.R7). Every record line keeps
 * its act (`pfrec`) and its index, so the pad, the pointer and the keyboard reach it as before. A browser adaptation.
 */
const SIGNED_IN: ServiceRecordView = {
  kind: 'signed-in', name: 'Hawk', rank: { medal: 5, rank: 'ADMIRAL', band: 'Top 5%', mark: 'star', picture: null },
  record: { kind: 'ok', clan: 'Delta', friends: 3, ignored: 1, ladder: '3 of 40', note: { text: 'Posted to the ladder', adaptation: true }, rows: [{ label: 'SCORE:', value: '120' }] },
  loadouts: { kind: 'ok', missions: [{ mission: 'MP2', seal: 'Set', terrorist: 'Not set' }] },
};
function draw(view: ServiceRecordView, rec = 0) {
  const A: Adapters = sampleAdapters();
  A.profile = { record: () => view, locked: () => null } as unknown as ProfileAdapter;
  const S = createState(A);
  S.screen = 'record';
  S.pf.rec = rec;
  const box = document.createElement('div');
  box.innerHTML = recordHtml(S, A);
  return { box, A };
}
const lines = (box: HTMLElement): [string, string][] => [...box.querySelectorAll<HTMLElement>('[data-record]')]
  .map((r) => [r.querySelector('.cx-r__label')?.textContent ?? '', (r.querySelector('.cx-r__value') ?? r.querySelector('.cx-r__hint'))?.textContent ?? '']);

describe('Profile: the Service record (LR-4)', () => {
  it('the panel head: the crumb back to Profile, the h1 its own, a description; the rows in one scroll box, no item of the old drawing', () => {
    const { box } = draw(SIGNED_IN);
    expect(box.querySelector('h1.cx-title')!.textContent).toBe('Service record');
    expect(box.querySelector('.cx-back')!.textContent).toBe('Profile');
    expect(box.querySelector('.cx-screenhead__desc')?.textContent ?? '').not.toBe('');
    expect(box.querySelector('.cx-item, .cx-list')).toBeNull();
    expect(box.querySelector('.cx-rlist[data-scroll]')).not.toBeNull();
  });

  it('the server\'s lines as label and value rows, in recordRows\' order, each with its act and index', () => {
    const { box, A } = draw(SIGNED_IN);
    expect(lines(box)).toEqual([
      ['Name', 'Hawk'], ['Clan', 'Delta'], ['Friends', '3'], ['Ignored', '1'], ['Ladder', '3 of 40'], ['Posted to the ladder', ''],
      ['SCORE:', '120'], ['MP2', 'SEAL Set · Terrorist Not set'],
    ]);
    const rows = [...box.querySelectorAll<HTMLElement>('[data-record]')];
    expect(rows).toHaveLength(recordRows(A).length);
    rows.forEach((r, i) => { expect(r.classList.contains('cx-r')).toBe(true); expect([r.dataset['act'], r.dataset['i']]).toEqual(['pfrec', String(i)]); });
    expect(rows.map((r) => r.dataset['record'])).toEqual(['fact', 'fact', 'fact', 'fact', 'fact', 'note', 'pinfo', 'mission']);
    expect(box.querySelectorAll('[data-pinfo-row]')).toHaveLength(1);
    expect(box.querySelector('[data-record="note"]')!.getAttribute('data-adaptation')).toBe('browser');
  });

  it('the focused line is the pad\'s (is-focused on pf.rec\'s row only)', () => {
    const { box } = draw(SIGNED_IN, 2);
    const lit = [...box.querySelectorAll('[data-record].is-focused')];
    expect(lit).toHaveLength(1);
    expect(lit[0]!.querySelector('.cx-r__label')!.textContent).toBe('Friends');
  });

  it('the rank is a row of its own after the name, its mark and its medal kept; never a record line (no act)', () => {
    const { box } = draw(SIGNED_IN);
    const rank = box.querySelector<HTMLElement>('.cx-rlist [data-rank]')!;
    expect(rank.textContent).toBe('ADMIRAL');
    expect([rank.dataset['medal'], rank.dataset['mark'], rank.getAttribute('title')]).toEqual(['5', 'star', 'Top 5%']);
    const row = rank.closest<HTMLElement>('.cx-r')!;
    expect(row.querySelector('.cx-r__label')!.textContent).toBe('Rank');
    expect(row.hasAttribute('data-act')).toBe(false);
    expect(row.previousElementSibling?.querySelector('.cx-r__label')?.textContent).toBe('Name');
  });

  it('no rank (medal 0): no rank row; the artifact\'s career figures are never drawn', () => {
    const { box } = draw({ ...SIGNED_IN, rank: null });
    expect(box.querySelector('[data-rank]')).toBeNull();
    expect(box.textContent).not.toMatch(/Wins|Kills|Accuracy|Headshots|Time in service|Member since/);
  });

  it('a failed record: its words and the retry line, with the warn mark; signed out: its line', () => {
    const { box } = draw({ ...SIGNED_IN, record: { kind: 'failed', words: 'Server unavailable.' } });
    const st = box.querySelector<HTMLElement>('[data-record="state"]')!;
    expect(st.querySelector('.cx-r__label')!.textContent).toBe('Server unavailable.');
    expect(st.textContent).toContain('Press Cross to try again.');
    expect(st.querySelector('.cx-r__icon')).not.toBeNull();
    const out = draw({ kind: 'signed-out', line: 'Sign in to see your record' }).box;
    expect(lines(out)).toEqual([['Signed out', 'Sign in to see your record']]);
  });

  it('FRIENDS_EMPTY_HINT_ADAPTATION: an empty friends list adds one labelled line after Friends saying how to add one; a list with friends does not', () => {
    const ok = SIGNED_IN.record.kind === 'ok' ? SIGNED_IN.record : null;
    const empty = draw({ ...SIGNED_IN, record: { ...ok!, friends: 0 } }).box;
    const rows = lines(empty);
    const at = rows.findIndex(([l]) => l === 'Friends');
    expect(rows[at]).toEqual(['Friends', '0']);
    expect(rows[at + 1]).toEqual([FRIENDS_EMPTY_HINT_ADAPTATION, '']);
    const hint = [...empty.querySelectorAll<HTMLElement>('[data-record="note"]')].find((r) => r.textContent === FRIENDS_EMPTY_HINT_ADAPTATION)!;
    expect(hint.getAttribute('data-adaptation')).toBe('browser');
    expect(FRIENDS_EMPTY_HINT_ADAPTATION).toBe('Add a friend with FRIENDS > ADD NEW FRIEND and the name of a player in a lobby or game; they join your list once they confirm.');
    expect(draw(SIGNED_IN).box.textContent).not.toContain(FRIENDS_EMPTY_HINT_ADAPTATION);
  });

  it('every server string is text', () => {
    // the disc's medal picture (mark 'medal') is the one <img> a row may hold (data-medal-picture); a server string is never one
    const medal = { medal: 5, rank: 'ADMIRAL', band: 'Top 5%', mark: 'medal' as const, picture: 'data:image/png;base64,AA' };
    const { box } = draw({ ...SIGNED_IN, rank: medal, name: '<img src=x>', record: { kind: 'ok', clan: '<b>C</b>', friends: 0, ignored: 0, ladder: '', note: null, rows: [{ label: '<b>X</b>', value: '<img src=y>' }] } });
    expect(box.querySelector('.cx-rlist img:not([data-medal-picture]), .cx-rlist b')).toBeNull();
  });
});
