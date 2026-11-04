// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { customHtml, lobbyGameHtml, lobbyRoomHtml } from '../../src/console/render/lobbies';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { createState, OVERLAY_LOCK_WORDS, type Adapters, type CustomView, type LobbyGameView, type LobbyRoomView } from '../../src/console/state';

/**
 * LR-3 (the launcher redesign plan, the row "Online"; LR.R8): the Briefing room, Game and Custom matches screens in LR-1's
 * row kinds (`render/rows.ts`; the artifact's `rowsFor`: a section header, then rows): a game a link row (Cross opens
 * it), a fact an info row (its label and value), a note and a player an info row, a custom match a link row (Cross is
 * JOIN; its lock the icon, the password `data-locked`, over a game page muted with the lock's line). What each row says,
 * its order and its click (`data-act` lbrow / lbcustom, `data-i` its item's index) stay CX-LOBBIES'. A browser adaptation.
 */
const ROOM: LobbyRoomView = {
  kind: 'ok', id: 'r1', name: 'US EAST', locked: false, full: false,
  facts: [{ kind: 'fact', label: 'Players', value: '3/64' }],
  games: [{ id: 'g1', name: 'Bravo', sub: 'Frostfire · Suppression · 2/16', locked: false, inProgress: false, full: false },
    { id: 'g2', name: 'Charlie', sub: 'Crossroads · Breach · 1/8 · Password', locked: true, inProgress: true, full: false }],
  players: { kind: 'names', names: ['HUSH', 'Kilo'] },
};
const GAME: LobbyGameView = {
  kind: 'ok', id: 'g1', name: 'Bravo', room: 'r1', roomName: 'US EAST', locked: false, full: false, inProgress: false,
  facts: [{ kind: 'fact', label: 'Players', value: '2/16' }, { kind: 'fact', label: 'Map', value: 'Frostfire' }],
  details: [{ kind: 'fact', label: 'Rounds', value: '6' }, { kind: 'note', label: 'Needs disc for the rest', value: '' }],
  players: { kind: 'note', line: 'Private game', private: true },
};
const CUSTOM: CustomView = { kind: 'ok', empty: null, rows: [
  { id: 'L1', name: 'Crate maze', map: 'Frostfire', players: 3, max: 16, inMatch: false, locked: true, href: '/forge?l=L1' },
  { id: 'L2', name: 'Open floor', map: 'Crossroads', players: 1, max: 16, inMatch: true, locked: false, href: '/forge?l=L2' },
] };

function setup(over: 'none' | 'game' = 'none') {
  const A: Adapters = sampleAdapters();
  A.rooms = { ...A.rooms, room: (id: string) => (id === 'r1' ? ROOM : { kind: 'gone' }), game: (id: string) => (id === 'g1' ? GAME : { kind: 'gone' }) };
  A.custom = { sync() { /* shown */ }, view: () => CUSTOM, refresh: async () => { /* read */ }, join: () => null };
  const S = createState(A);
  if (over === 'game') S.mode = 'overlay';                              // no page reads: over a game page (`overGame`)
  S.lb.room = 'r1'; S.lb.game = 'g1'; S.lb.from = 'room';
  return { A, S };
}
const draw = (html: string): HTMLElement => { const box = document.createElement('div'); box.innerHTML = html; return box; };
/** A row as [kind, label, hint or value]. */
const rows = (box: HTMLElement): [string, string, string][] => [...box.querySelectorAll<HTMLElement>('.cx-rlist .cx-r')].map((r) => [
  [...r.classList].find((c) => c.startsWith('cx-r--'))!.slice(6),
  (r.classList.contains('cx-r--header') ? r.textContent : r.querySelector('.cx-r__label')?.textContent) ?? '',
  r.querySelector('.cx-r__hint')?.textContent ?? r.querySelector('.cx-r__value')?.textContent ?? '']);

describe('the lobby screens in the artifact\'s rows (LR-3)', () => {
  it('a Briefing room: its games as link rows under "Games", its players as info rows under "Players"; the old items gone', () => {
    const { A, S } = setup();
    S.screen = 'room'; S.lb.row = 1;
    const box = draw(lobbyRoomHtml(S, A));
    expect(box.querySelector('.cx-item')).toBeNull();
    expect(rows(box)).toEqual([
      ['header', 'Games', ''], ['link', 'Bravo', 'Frostfire · Suppression · 2/16'], ['link', 'Charlie', 'Crossroads · Breach · 1/8 · Password'],
      ['header', 'Players', ''], ['info', 'HUSH', ''], ['info', 'Kilo', ''],
    ]);
    const games = [...box.querySelectorAll<HTMLElement>('.cx-r--link[data-act="lbrow"]')];
    expect(games.map((g) => [g.dataset['i'], g.dataset['id']])).toEqual([['0', 'g1'], ['1', 'g2']]);
    expect(games[1]!.classList.contains('is-focused')).toBe(true);
    expect(box.querySelectorAll('.is-focused')).toHaveLength(1);
    // the pad's focus on a player (item 3) is drawn on its row
    S.lb.row = 3;
    const on = draw(lobbyRoomHtml(S, A)).querySelector('.cx-r.is-focused')!;
    expect(on.querySelector('.cx-r__label')!.textContent).toBe('Kilo');
  });

  it('LR-10: players, facts and notes with an act are focusable (tabindex 0, data-act, data-i); the private players note keeps its lock icon', () => {
    const { A, S } = setup();
    S.screen = 'game';
    const box = draw(lobbyGameHtml(S, A));
    const infos = [...box.querySelectorAll<HTMLElement>('.cx-r--info')];
    expect(infos.length).toBeGreaterThan(0);
    for (const r of infos) {
      expect(r.getAttribute('tabindex')).toBe('0');
      expect(r.dataset['act']).toBe('lbgame');
      expect(r.dataset['i']).toMatch(/^\d+$/);
    }
    const note = infos.find((r) => r.textContent!.includes('Private game'))!;
    expect(note.querySelector('.cx-r__icon rect[x="5"][y="11"][width="14"][height="10"]')).not.toBeNull();
  });
  it('a Game: its facts and GAME DETAILS as info rows (label and value) under their headers, then the players\' line', () => {
    const { A, S } = setup();
    S.screen = 'game'; S.lb.grow = 0;
    const box = draw(lobbyGameHtml(S, A));
    expect(box.querySelector('.cx-item')).toBeNull();
    expect(rows(box)).toEqual([
      ['header', 'Game', ''], ['info', 'Players', '2/16'], ['info', 'Map', 'Frostfire'],
      ['header', 'Game details', ''], ['info', 'Rounds', '6'], ['info', 'Needs disc for the rest', ''],
      ['header', 'Players', ''], ['info', 'Private game', ''],
    ]);
    expect(box.querySelector('.cx-r.is-focused .cx-r__label')!.textContent).toBe('Players');
  });

  it('Custom matches: a link row per lobby, its lock icon and data-locked kept; Cross JOIN by data-act lbcustom', () => {
    const { A, S } = setup();
    S.screen = 'custom'; S.lb.crow = 0;
    const box = draw(customHtml(S, A));
    expect(box.querySelector('.cx-item')).toBeNull();
    expect(rows(box)).toEqual([
      ['link', 'Crate maze', 'Frostfire · 3/16 players · Password'], ['link', 'Open floor', 'Crossroads · 1/16 players · In match'],
    ]);
    const m = [...box.querySelectorAll<HTMLElement>('[data-act="lbcustom"]')];
    expect(m.map((x) => [x.dataset['i'], x.dataset['id'], x.hasAttribute('data-locked')])).toEqual([['0', 'L1', true], ['1', 'L2', false]]);
    expect(m[0]!.querySelector('.cx-r__icon rect[x="5"][y="11"][width="14"][height="10"]')).not.toBeNull();   // the lock (icons.ts P.lock)
    expect(m.some((x) => x.getAttribute('aria-disabled') === 'true')).toBe(false);
  });

  it('over a game page JOIN is locked: each row muted (aria-disabled) with the lock\'s line', () => {
    const { A, S } = setup('game');
    S.screen = 'custom';
    const box = draw(customHtml(S, A));
    const m = [...box.querySelectorAll<HTMLElement>('[data-act="lbcustom"]')];
    expect(m).toHaveLength(2);
    for (const x of m) {
      expect(x.getAttribute('aria-disabled')).toBe('true');
      expect(x.classList.contains('is-muted')).toBe(true);
      expect(x.querySelector('.cx-r__hint')!.textContent).toBe(OVERLAY_LOCK_WORDS.join);
    }
  });

  it('a waiting list is one info row in its words; the rows sit in the scroll box', () => {
    const { A, S } = setup();
    A.custom = { ...A.custom!, view: () => ({ kind: 'waiting' }) };
    S.screen = 'custom';
    const box = draw(customHtml(S, A));
    expect(rows(box)).toEqual([['info', 'Reading the custom matches…', '']]);
    expect(box.querySelector('.cx-rlist[data-scroll]')).not.toBeNull();
  });

  it('the read-only rows keep their click and hover (CX-LOBBIES: every row carried its act and index; the pointer moves the focus)', () => {
    const { A, S } = setup();
    S.screen = 'room';
    const room = draw(lobbyRoomHtml(S, A));
    expect([...room.querySelectorAll<HTMLElement>('[data-act="lbrow"]')].map((r) => r.dataset['i'])).toEqual(['0', '1', '2', '3']);
    S.screen = 'game';
    const game = draw(lobbyGameHtml(S, A));
    expect([...game.querySelectorAll<HTMLElement>('[data-act="lbgame"]')].map((r) => r.dataset['i'])).toEqual(['0', '1', '2', '3', '4']);
    expect(game.querySelectorAll('.cx-r--header[data-act]')).toHaveLength(0);
  });
});
