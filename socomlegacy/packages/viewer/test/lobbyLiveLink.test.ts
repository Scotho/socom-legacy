// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  LOBBY_LIVE_BACKOFF_MS_ADAPTATION, LOBBY_LIVE_GAME_BODY_CLASS_ADAPTATION, LOBBY_LIVE_NAVIGATE_EVENT_ADAPTATION, LOBBY_LIVE_POLL_MS_ADAPTATION, liveMatchHrefOf,
  lobbyIdOfPath, mountLobbyLiveLink, type LivePageResponse,
} from '../src/lobbyLiveLink';
import { LAUNCHER_NAVIGATE_EVENT_ADAPTATION, launcherNav } from '../src/console/history';
import { CATS, createState } from '../src/console/state';
import { sampleAdapters } from '../src/console/sampleAdapters';
import { MATCH_PAGE_POLL_MS_ADAPTATION, MATCH_PAGE_SEGMENT_ADAPTATION } from '../src/matchPage';

/**
 * LCM-8, LCM-18d (the LCM plan, `docs/plans/2026-11-09-live-cards-and-match-pages.md`; product track, OT.R53 -- the
 * project's own page, no original): the lobby page's "Live match stats" link, its own small module so the launcher's
 * entry loads none of the match page. It polls `/api/live` while the document is still that lobby's page; it stops, and
 * its link goes, when the address leaves the lobby (a tick, a popstate) or the game takes the page (the body's
 * `ps2-look`); it pauses while the tab is hidden and backs off after a failed read. Names invented.
 */

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const answer = (body: unknown): LivePageResponse => ({ ok: true, status: 200, json: async () => body });
let hidden = false;
Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });

afterEach(() => {
  document.body.replaceChildren();
  document.body.className = '';
  hidden = false;
  window.history.replaceState(null, '', '/');
});

/** A timer stand-in: each pending callback with its delay; `clear` drops one. */
function timers() {
  const pending: { fn: () => void; ms: number; id: number }[] = [];
  let next = 1;
  return {
    pending,
    setTimer: (fn: () => void, ms: number): number => { const id = next++; pending.push({ fn, ms, id }); return id; },
    clearTimer: (id: unknown): void => { const i = pending.findIndex((p) => p.id === id); if (i >= 0) pending.splice(i, 1); },
    fire: (): void => { const p = pending.shift(); p?.fn(); },
  };
}

describe('LCM-8: the lobby page\'s "Live match stats" link', () => {
  const live = { lobbies: [{ id: 'publicLobby1', matchId: '41-3-5' }, { id: 'publicLobby2', matchId: null }, { name: 'Private match', key: 'abc' }] };

  it('/api/live\'s matchId of that lobby gives /match/<id>; none, a null one or another lobby gives no link', () => {
    expect(liveMatchHrefOf(live, 'publicLobby1')).toBe('/match/41-3-5');
    expect(liveMatchHrefOf(live, 'publicLobby1')).toBe(`/${MATCH_PAGE_SEGMENT_ADAPTATION}/41-3-5`);   // the match page's own segment
    expect(liveMatchHrefOf(live, 'publicLobby1', '/socomlegacy/')).toBe('/socomlegacy/match/41-3-5');
    expect(liveMatchHrefOf(live, 'publicLobby2')).toBeNull();
    expect(liveMatchHrefOf(live, 'other')).toBeNull();
    expect(liveMatchHrefOf(null, 'publicLobby1')).toBeNull();
  });

  it('the lobby id of an address is the launcher\'s own parse (`lobbyInviteOf`): /online/lobby/<id> only', () => {
    expect(lobbyIdOfPath('/online/lobby/publicLobby1')).toBe('publicLobby1');
    expect(lobbyIdOfPath('/socomlegacy/online/lobby/publicLobby1', '/socomlegacy/')).toBe('publicLobby1');
    expect(lobbyIdOfPath('/online/lobby/publicLobby1/x')).toBeNull();
    expect(lobbyIdOfPath('/')).toBeNull();
    expect(lobbyIdOfPath('/main/online')).toBeNull();
  });

  it('the poll\'s pace is the match page\'s (one constant each, equal)', () => {
    expect(LOBBY_LIVE_POLL_MS_ADAPTATION).toBe(MATCH_PAGE_POLL_MS_ADAPTATION);
    expect(LOBBY_LIVE_BACKOFF_MS_ADAPTATION).toEqual([15_000, 30_000, 60_000]);
  });

  it('mounted: a ds action appears while the lobby has a match, and goes when it has none', async () => {
    window.history.replaceState(null, '', '/online/lobby/publicLobby1');
    const answers = [live, { lobbies: [{ id: 'publicLobby1', matchId: null }] }];
    const t = timers();
    mountLobbyLiveLink(document, 'publicLobby1', { fetch: async () => answer(answers.shift()), setTimer: t.setTimer, clearTimer: t.clearTimer });
    await tick();
    const a = document.querySelector<HTMLAnchorElement>('a.project-live-link')!;
    expect(a.textContent).toBe('Live match stats');
    expect(a.getAttribute('href')).toBe('/match/41-3-5');
    expect(a.classList.contains('s2u-action')).toBe(true);
    expect(a.getAttribute('style') ?? '').not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
    expect(a.getAttribute('style')).toMatch(/z-index: 20;/);    // its old stacking, under any launcher layer above it
    t.fire();
    await tick();
    expect(document.querySelector('a.project-live-link')).toBeNull();
  });
});

describe('LCM-18d: the link ends with the lobby\'s page', () => {
  const live = { lobbies: [{ id: 'publicLobby1', matchId: '41-3-5' }] };

  it('the address leaving the lobby (seen at the next tick): the link goes, nothing is asked again and no timer is left', async () => {
    window.history.replaceState(null, '', '/online/lobby/publicLobby1');
    let asked = 0;
    const t = timers();
    mountLobbyLiveLink(document, 'publicLobby1', { fetch: async () => { asked++; return answer(live); }, setTimer: t.setTimer, clearTimer: t.clearTimer });
    await tick();
    expect(document.querySelector('a.project-live-link')).not.toBeNull();
    window.history.pushState(null, '', '/main/online');          // the router's own move fires no popstate
    t.fire();
    await tick();
    expect(document.querySelector('a.project-live-link')).toBeNull();
    expect(asked).toBe(1);
    expect(t.pending).toEqual([]);
  });

  it('a popstate off the lobby stops it at once: the pending timer is cleared and the link goes', async () => {
    window.history.replaceState(null, '', '/online/lobby/publicLobby1');
    const t = timers();
    mountLobbyLiveLink(document, 'publicLobby1', { fetch: async () => answer(live), setTimer: t.setTimer, clearTimer: t.clearTimer });
    await tick();
    expect(t.pending).toHaveLength(1);
    window.history.pushState(null, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(document.querySelector('a.project-live-link')).toBeNull();
    expect(t.pending).toEqual([]);
  });

  it('LCM-19: the launcher\'s own move off the lobby (its history helper\'s pushState, no popstate) removes the link at once, before any read', async () => {
    expect(LOBBY_LIVE_NAVIGATE_EVENT_ADAPTATION).toBe(LAUNCHER_NAVIGATE_EVENT_ADAPTATION);   // one event name, held equal
    const a = sampleAdapters();
    window.history.replaceState(null, '', '/');
    const s = createState(a);
    const nav = launcherNav(window, '/', { apply: () => {} });
    try {
      nav.adopt(s, a);
      nav.sync(s, a);
      window.history.replaceState(window.history.state, '', '/online/lobby/publicLobby1');   // the lobby's page
      let asked = 0;
      const t = timers();
      mountLobbyLiveLink(document, 'publicLobby1', { fetch: async () => { asked++; return answer(live); }, setTimer: t.setTimer, clearTimer: t.clearTimer });
      await tick();
      expect(document.querySelector('a.project-live-link')).not.toBeNull();
      window.dispatchEvent(new CustomEvent(LAUNCHER_NAVIGATE_EVENT_ADAPTATION));           // a launcher move that stays on the lobby: kept
      expect(document.querySelector('a.project-live-link')).not.toBeNull();
      const len = window.history.length;
      s.cat = CATS.findIndex((c) => c.id === 'options');
      s.screen = 'options';
      nav.sync(s, a);                                                                        // a nested page: the helper pushes
      expect(window.history.length).toBe(len + 1);
      expect(lobbyIdOfPath(window.location.pathname)).toBeNull();
      expect(document.querySelector('a.project-live-link')).toBeNull();                     // at once: no timer fired
      expect(t.pending).toEqual([]);
      expect(asked).toBe(1);
    } finally {
      nav.dispose();
    }
  });

  it('the game taking the page (the body\'s ps2-look, the address kept): the link goes and is never added again', async () => {
    window.history.replaceState(null, '', '/online/lobby/publicLobby1');
    let asked = 0;
    const t = timers();
    mountLobbyLiveLink(document, 'publicLobby1', { fetch: async () => { asked++; return answer(live); }, setTimer: t.setTimer, clearTimer: t.clearTimer });
    await tick();
    expect(document.querySelector('a.project-live-link')).not.toBeNull();
    document.body.classList.add(LOBBY_LIVE_GAME_BODY_CLASS_ADAPTATION);
    await tick();                                                 // the observer's record
    expect(document.querySelector('a.project-live-link')).toBeNull();
    expect(t.pending).toEqual([]);
    expect(asked).toBe(1);
  });

  it('stop(): an answer already in flight adds nothing; a stale timer\'s callback asks nothing', async () => {
    window.history.replaceState(null, '', '/online/lobby/publicLobby1');
    let release: (r: LivePageResponse) => void = () => {};
    let asked = 0;
    const t = timers();
    const link = mountLobbyLiveLink(document, 'publicLobby1', {
      fetch: () => { asked++; return new Promise<LivePageResponse>((r) => { release = r; }); }, setTimer: t.setTimer, clearTimer: t.clearTimer,
    });
    link.stop();
    release(answer(live));
    await tick();
    expect(document.querySelector('a.project-live-link')).toBeNull();
    expect(t.pending).toEqual([]);
    expect(asked).toBe(1);
  });
});

describe('LCM-18d: hidden tabs and failed reads', () => {
  const live = { lobbies: [{ id: 'publicLobby1', matchId: '41-3-5' }] };

  it('a hidden tab asks nothing; shown again, it reads at once', async () => {
    window.history.replaceState(null, '', '/online/lobby/publicLobby1');
    let asked = 0;
    const t = timers();
    mountLobbyLiveLink(document, 'publicLobby1', { fetch: async () => { asked++; return answer(live); }, setTimer: t.setTimer, clearTimer: t.clearTimer });
    await tick();
    hidden = true;
    t.fire();
    await tick();
    expect(asked).toBe(1);
    expect(t.pending).toEqual([]);
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    await tick();
    expect(asked).toBe(2);
  });

  it('failed reads back off 15 s, 30 s, 60 s, 60 s; a good read goes back to the pace; the link stays through a blip', async () => {
    window.history.replaceState(null, '', '/online/lobby/publicLobby1');
    const script: (boolean)[] = [true, false, false, false, false, true];
    const t = timers();
    mountLobbyLiveLink(document, 'publicLobby1', {
      fetch: async () => { if (script.shift()) return answer(live); throw new Error('network'); }, setTimer: t.setTimer, clearTimer: t.clearTimer,
    });
    const delays: number[] = [];
    for (let i = 0; i < 6; i++) {
      await tick();
      delays.push(t.pending[0]!.ms);
      if (i > 0 && i < 5) expect(document.querySelector('a.project-live-link')).not.toBeNull();
      t.fire();
    }
    expect(delays).toEqual([LOBBY_LIVE_POLL_MS_ADAPTATION, 15_000, 30_000, 60_000, 60_000, LOBBY_LIVE_POLL_MS_ADAPTATION]);
  });
});

describe('LCM-18d: the launcher\'s entry loads none of the match page', () => {
  const viewer = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const read = (p: string): string => readFileSync(resolve(viewer, p), 'utf8');
  const imports = (src: string): string[] => [...src.matchAll(/^\s*import\s+(?:type\s+)?(?:[^'"]*from\s+)?['"]([^'"]+)['"]/gm)].map((m) => m[1]!);

  it('console/main.ts takes the link from ./lobbyLiveLink, never ../matchPage', () => {
    const specs = imports(read('src/console/main.ts'));
    expect(specs).toContain('../lobbyLiveLink');
    expect(specs).not.toContain('../matchPage');
  });

  it('lobbyLiveLink.ts imports only the route parse: no match page, no site shell, no site data', () => {
    expect(imports(read('src/lobbyLiveLink.ts')).sort()).toEqual(['./menuRoutes', '@s2u/ui'].sort());
  });
});
