// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DialogDesign, InviteLink, PadSlotName } from '@s2u/ui';
import { FrontEndSession, type FrontEndDisc } from '../src/frontEnd';
import type { InviteMount } from '../src/inviteHost';
import { LOBBY_LINK_COVER_ID, LOBBY_LINK_COVER_LINE, lobbyLinkCoverUp, showLobbyLinkCover } from '../src/lobbyLinkCover';
import { LOBBY_LINK_DIRECT_STALL_FRAMES_ADAPTATION } from '../src/lobbyLinkDirect';
import { LOAD_IN_LEAVE_MS } from '../src/loadIn';

/**
 * OT.R121's page half (LOBBY_LINK_DIRECT_ADAPTATION; product track): while a lobby link's login path runs behind the
 * cover, the cover stands over the front end's canvases and the menus read no pad -- the player's presses never reach a
 * screen they cannot see; the cover goes at the reveal. Fakes only: no game data.
 */

const design = (): DialogDesign => ({
  libraries: [], usesMemcard: false, font: null, fontLib: true, background: null,
  bindings: [{ kind: 'event', name: 'ONSTART', code: 0, state: 1, animation: 'menu_fade_up', argument: null }],
  controls: [], objects: [], scripts: [], models: [], dropped: [],
});
const disc = (names: string[]): FrontEndDisc => ({ dialog: (n) => (names.includes(n) ? design() : null), sets: [], faces: [], captions: null, loader: {}, missing: [] });
const LOBBY: InviteLink = { mediusWorldId: 0, game: '', universe: null, lobbyId: 'TOwttYxGFFw' };
const mount = (direct: boolean): InviteMount => ({
  link: LOBBY, id: 'S', open: () => null, pending: () => true, consumed: () => {}, href: () => '', copy: () => Promise.resolve(true),
  ...(direct ? { direct: { account: 'Bravo' } } : {}),
});

/**
 * WM-37 (the owner's "12 b approved on both", 2026-11-15; product track): the black wall with its one white line is
 * replaced by the launcher's DEPLOYING panel (`../src/console/deployPanel`, through `../src/loadIn`), moved on by the
 * hidden path's screen each frame (`stage`), the page's sound held while it stands, and at `hide` the hand-off drawn and
 * faded out before the element goes. `lobbyLinkCoverUp` turns false at the start of the fade (the seat's decision): the
 * GAME LOBBY is the screen then, the leaving cover takes no press, and the overlay (`../src/modern/overlay` `doOpen`) is
 * refused only while the cover stands.
 */
const sheet = (): string => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/lobbyLinkCover.css'), 'utf8');
afterEach(() => { document.getElementById(LOBBY_LINK_COVER_ID)?.remove(); vi.useRealTimers(); });

describe('the cover (a browser adaptation\'s own page element)', () => {
  it('shown once over the page: one element, the panel at Load (the front end booting), its accessible name the line', () => {
    vi.useFakeTimers();
    const a = showLobbyLinkCover(document);
    const b = showLobbyLinkCover(document);
    expect(document.querySelectorAll(`#${LOBBY_LINK_COVER_ID}`)).toHaveLength(1);
    const el = document.getElementById(LOBBY_LINK_COVER_ID)!;
    expect(el.getAttribute('role')).toBe('status');
    expect(el.getAttribute('aria-label')).toBe(LOBBY_LINK_COVER_LINE);
    expect(el.querySelector('.dp.is-entering')).not.toBeNull();
    expect(el.dataset['stage']).toBe('load');
    a.hide(); b.hide();
    vi.runAllTimers();
    expect(document.getElementById(LOBBY_LINK_COVER_ID)).toBeNull();
  });

  it('stage: moved on by the hidden path\'s screen, the entrance not replayed; an unchanged stage draws nothing new', () => {
    vi.useFakeTimers();
    const c = showLobbyLinkCover(document);
    const el = document.getElementById(LOBBY_LINK_COVER_ID)!;
    c.stage('dlgNetLogin.rdr', null);
    expect(el.dataset['stage']).toBe('connect');
    expect(el.querySelector('.dp.is-entering')).toBeNull();
    const panel = el.firstElementChild;
    c.stage('dlgNetLogin.rdr', null);
    expect(el.firstElementChild).toBe(panel);
    c.stage('dlgGameLobby.rdr', null);
    expect(el.dataset['stage']).toBe('lobby');
    c.hide(); vi.runAllTimers();
  });

  it('hide at the GAME LOBBY: the Lobby stage, the fade class, then removed; a second hide and a late stage do nothing', () => {
    vi.useFakeTimers();
    const c = showLobbyLinkCover(document);
    const el = document.getElementById(LOBBY_LINK_COVER_ID)!;
    c.stage('dlgGameLobby.rdr', null);
    c.hide();
    expect(el.dataset['stage']).toBe('lobby');
    expect(el.querySelector('.dp__kicker')!.textContent).toBe('Direct link · 4 of 4');
    expect(el.classList.contains('is-leaving')).toBe(true);
    c.hide();
    c.stage('dlgNetLogin.rdr', null);
    expect(el.dataset['stage']).toBe('lobby');
    vi.runAllTimers();
    expect(document.getElementById(LOBBY_LINK_COVER_ID)).toBeNull();
    expect(lobbyLinkCoverUp(document)).toBe(false);
  });

  it('the review\'s F3: a reveal where the player must act (not the GAME LOBBY) fades the cover as it stands, no Lobby stage', () => {
    vi.useFakeTimers();
    const c = showLobbyLinkCover(document);
    const el = document.getElementById(LOBBY_LINK_COVER_ID)!;
    c.stage('dlgWorldOfSOCOM.rdr', null);                                  // a join refused or bounded: its popup there
    c.hide();
    expect(el.classList.contains('is-leaving')).toBe(true);
    expect(el.dataset['stage']).toBe('connect');
    expect(el.querySelector('.dp__kicker')!.textContent).toBe('Direct link · 3 of 4');
    expect(el.querySelector('.dp__step.is-now .dp__label')!.textContent).toBe('Connect');
    vi.runAllTimers();
    expect(document.getElementById(LOBBY_LINK_COVER_ID)).toBeNull();
  });

  it('the review\'s F4: under reduced motion the leaving cover is gone from the picture at once (opacity 0, no animation)', () => {
    const css = sheet().replace(/\/\*[\s\S]*?\*\//g, '');
    const reduced = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(css)![1]!;
    expect(reduced).toMatch(new RegExp(`#${LOBBY_LINK_COVER_ID}\\.is-leaving \\{ animation: none; opacity: 0; +\\}`));
  });

  it('the overlay is refused only while the cover stands: down at once at hide, the element still fading and taking no press, removed after LOAD_IN_LEAVE_MS', () => {
    vi.useFakeTimers();
    const c = showLobbyLinkCover(document);
    expect(lobbyLinkCoverUp(document)).toBe(true);
    c.hide();
    const el = document.getElementById(LOBBY_LINK_COVER_ID);
    expect(el, 'still in the page, fading').not.toBeNull();
    expect(el!.classList.contains('is-leaving')).toBe(true);
    expect(lobbyLinkCoverUp(document), 'not up from the start of the fade').toBe(false);
    expect(sheet().replace(/\/\*[\s\S]*?\*\//g, '')).toMatch(new RegExp(`#${LOBBY_LINK_COVER_ID}\\.is-leaving \\{[^}]*pointer-events: none`));
    vi.advanceTimersByTime(LOAD_IN_LEAVE_MS - 1);
    expect(document.getElementById(LOBBY_LINK_COVER_ID)).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(document.getElementById(LOBBY_LINK_COVER_ID)).toBeNull();
    expect(lobbyLinkCoverUp(document)).toBe(false);
  });

  it('a cover shown while an old one fades is a new element, not the leaving one', () => {
    vi.useFakeTimers();
    const old = showLobbyLinkCover(document);
    old.hide();
    const fresh = showLobbyLinkCover(document);
    vi.runAllTimers();
    expect(document.querySelectorAll(`#${LOBBY_LINK_COVER_ID}`)).toHaveLength(1);
    expect(document.getElementById(LOBBY_LINK_COVER_ID)!.classList.contains('is-leaving')).toBe(false);
    fresh.hide(); vi.runAllTimers();
  });

  it("its look is its own sheet's, by the id: no inline style on the element; the design system's ground, no black wall", () => {
    vi.useFakeTimers();
    const c = showLobbyLinkCover(document);
    expect(document.getElementById(LOBBY_LINK_COVER_ID)!.getAttribute('style')).toBeNull();
    c.hide(); vi.runAllTimers();
    const css = sheet().replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).toMatch(new RegExp(`#${LOBBY_LINK_COVER_ID} \\{[^}]*position: fixed; inset: 0; z-index: 2147483000;`));
    expect(css).not.toMatch(/#000\b|#ccc\b|sans-serif/);
    expect(css).toMatch(/var\(--s2u-ground\)/);
    expect(css).toMatch(new RegExp(`#${LOBBY_LINK_COVER_ID}\\.is-leaving \\{[^}]*animation: lobby-link-cover-out`));
  });
});

describe('the session\'s menus read no pad while the cover stands', () => {
  const held = async (direct: boolean): Promise<number> => {
    const s = new FrontEndSession({ disc: disc(['dlgNetLogin.rdr']), startDialog: 'dlgNetLogin.rdr', invite: mount(direct) });   // LOGIN: on the path, so no reveal
    s.input.source = { read: () => ({ down: new Set<PadSlotName>(['CROSS']), stickX: 0, stickY: 0 }) };
    let now = 0;
    for (let i = 0; i < 10; i++) { s.advance(now += 1000 / 30); await Promise.resolve(); }
    expect(s.invite.covering()).toBe(direct);
    return s.input.pad.state('CROSS');
  };

  it('no mark: CROSS held reaches the menus\' pad; the mark: the pad reads nothing', async () => {
    expect(await held(false)).not.toBe(0);
    expect(await held(true)).toBe(0);
  });

  it('revealed (a bound reached: the screen\'s stall here, the join\'s lifts the same flag): the pad is read again', async () => {
    const s = new FrontEndSession({ disc: disc(['dlgNetLogin.rdr']), startDialog: 'dlgNetLogin.rdr', invite: mount(true) });
    s.input.source = { read: () => ({ down: new Set<PadSlotName>(['CROSS']), stickX: 0, stickY: 0 }) };
    let now = 0;
    for (let i = 0; i < 10; i++) { s.advance(now += 1000 / 30); await Promise.resolve(); }
    expect([s.invite.covering(), s.input.pad.state('CROSS')]).toEqual([true, 0]);
    for (let i = 0; i < LOBBY_LINK_DIRECT_STALL_FRAMES_ADAPTATION + 30; i++) s.advance(now += 1000 / 30);
    expect(s.invite.covering()).toBe(false);
    expect(s.input.pad.state('CROSS')).not.toBe(0);
  });
});
