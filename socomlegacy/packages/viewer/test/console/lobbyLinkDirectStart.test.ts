import { describe, expect, it } from 'vitest';
import type { InviteLink } from '@s2u/ui';
import { autoStartStep, liveInvite, type AutoStartView } from '../../src/console/adapters/invite';
import { pageInvite } from '../../src/inviteHost';
import { LOBBY_LINK_QUICK_WAIT_MS_ADAPTATION, takeLobbyLinkDirect } from '../../src/lobbyLinkDirect';
import type { SessionState } from '../../src/modern/session';
import type { ConsoleState, DiscState } from '../../src/console/state';

/**
 * LOBBY-LINK-DIRECT's launcher half (the owner, 2026-11-11; product track, a browser adaptation): on a lobby link's
 * address the launcher's START -- its own auto-START or the player's -- decides once, from the disc kept whole and the
 * session signed in, whether the front end it mounts presses through the login screens (`../../src/lobbyLinkDirect`); the
 * auto-START waits for the load's quick sign-in to answer first, so a remembered player is read signed in. Fakes only.
 */

const ID = 'TOwttYxGFFw';
const LOBBY: InviteLink = { mediusWorldId: 0, game: '', universe: null, lobbyId: ID };

function rig(o: { path?: string; session?: SessionState; whole?: boolean; disc?: DiscState; quick?: boolean; now?: () => number } = {}) {
  const state = { session: o.session ?? 'signed-in', whole: o.whole ?? true, disc: o.disc ?? 'ready' as DiscState, quick: o.quick ?? false };
  const win = {
    location: { origin: 'https://n.example', pathname: o.path ?? `/online/lobby/${ID}`, search: '', hash: '' },
    history: { state: null, replaceState(_s: unknown, _u: string, url: string) { win.location.pathname = url; } },
    focus() {},
  };
  const inv = liveInvite(win as never, {
    session: { state: () => state.session, account: () => (state.session === 'signed-out' ? null : { name: 'Bravo' }) },
    disc: { state: () => state.disc, kept: () => (state.whole ? { whole: true } : null) },
    quickPending: () => state.quick,
    base: '/', open: () => null, id: 'L', ...(o.now ? { now: o.now } : {}),
  });
  const S: Pick<ConsoleState, 'start' | 'overlay'> = { start: 'idle', overlay: null };
  let starts = 0;
  const page = inv.attach({ S, ready: () => true, start: () => { starts++; S.start = 'arming'; } });
  const mount = (): ReturnType<typeof pageInvite> => pageInvite('', win as never, { base: '/' });
  return { state, S, page, starts: () => starts, mount, win };
}

describe('the launcher decides at START: direct, or today\'s flow', () => {
  it('a lobby link, the disc kept whole, signed in: the auto-START marks it direct; the front end\'s mount on the address reads it', () => {
    const t = rig();
    t.page.check();
    expect(t.starts()).toBe(1);
    expect(t.mount().direct).toEqual({ account: 'Bravo' });
  });

  for (const [name, o] of [
    ['not signed in', { session: 'signed-out' }],
    ['the USER AGREEMENT not accepted yet (the agreement state)', { session: 'agreement' }],
    ['the disc not kept whole (gone on from the disc itself)', { whole: false }],
  ] as const) {
    it(`${name}: STARTs as today, no mark -- the original's screens wait for the player, the join after them`, () => {
      const t = rig(o);
      t.page.check();
      expect(t.starts()).toBe(1);
      expect(t.mount().direct ?? null).toBeNull();
    });
  }

  it('the load\'s quick sign-in still answering: the auto-START waits for it, then decides on its answer', () => {
    const t = rig({ quick: true, session: 'signing-in' });
    t.page.check();
    expect(t.starts()).toBe(0);
    t.state.quick = false; t.state.session = 'signed-in';
    t.page.check();
    expect(t.starts()).toBe(1);
    expect(takeLobbyLinkDirect(LOBBY)).toEqual({ account: 'Bravo' });
  });

  it('a quick sign-in that never answers: the wait is bounded, then START as today (no mark while it is still signing in)', () => {
    let now = 1000;
    const t = rig({ quick: true, session: 'signing-in', now: () => now });
    t.page.check();
    now += LOBBY_LINK_QUICK_WAIT_MS_ADAPTATION - 1;
    t.page.check();
    expect(t.starts()).toBe(0);
    now += 1;
    t.page.check();
    expect(t.starts()).toBe(1);
    expect(takeLobbyLinkDirect(LOBBY)).toBeNull();
  });

  it('the quick sign-in refused (signed out after it): START as today, no mark', () => {
    const t = rig({ quick: true, session: 'signing-in' });
    t.page.check();
    t.state.quick = false; t.state.session = 'signed-out';
    t.page.check();
    expect(t.starts()).toBe(1);
    expect(takeLobbyLinkDirect(LOBBY)).toBeNull();
  });

  it('a START the player pressed first on the link\'s page is decided the same way, once', () => {
    const t = rig();
    t.S.start = 'arming';
    t.page.check();
    t.page.check();
    expect(t.starts()).toBe(0);
    expect(takeLobbyLinkDirect(LOBBY)).toEqual({ account: 'Bravo' });
    expect(takeLobbyLinkDirect(LOBBY)).toBeNull();
  });

  it('an old ?invite= address (no lobby id) never waits on the quick sign-in and is never direct', () => {
    const t = rig({ path: '/main/online', quick: true });
    t.win.location.search = '?invite=7&game=friday';
    t.page.check();
    expect(t.starts()).toBe(1);
    expect(takeLobbyLinkDirect(LOBBY)).toBeNull();
  });

  it('autoStartStep: \'signing\' waits; without it, as before', () => {
    const v: AutoStartView = { invite: true, spent: false, start: 'idle', overlay: null, disc: 'ready', extracting: false, ready: true };
    expect(autoStartStep(v)).toBe('start');
    expect(autoStartStep({ ...v, signing: true })).toBe('wait');
    expect(autoStartStep({ ...v, signing: true, spent: true })).toBe('off');
  });
});
