// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addressOf, heldInviteAddress, holdInviteAddress, releaseInviteAddress, strippedAddress } from '../src/inviteAddressHold';
import { pageInvite } from '../src/inviteHost';
import { loadInLobbyLinkAt } from '../src/loadIn';
import { resetStreamerCache, setStreamerMode } from '../src/streamerMode';

/**
 * STREAMER-P1 slice 1b (product track, a browser adaptation; the scope's s3.4 "The address bar"): while Streamer mode's
 * Room and account details are Hidden, an invite in the address is held in the page's memory and the address shows the
 * bare place at once (`replaceState`); every reader that took the invite from the address reads the held one, so the
 * join is the same. Off: nothing is held and the address is as before.
 */
beforeEach(() => { localStorage.clear(); resetStreamerCache(); releaseInviteAddress(); });
afterEach(() => { localStorage.clear(); resetStreamerCache(); releaseInviteAddress(); });

const fakeWin = (pathname: string, search: string) => {
  const writes: string[] = [];
  const w = {
    location: { origin: 'https://n.example', pathname, search, hash: '#x' },
    history: {
      state: { s2uMenuRoute: { depth: 2 } } as unknown,
      replaceState(_s: unknown, _u: string, url: string) {
        writes.push(url);
        const hashAt = url.indexOf('#'), body = hashAt >= 0 ? url.slice(0, hashAt) : url, q = body.indexOf('?');
        w.location.pathname = q >= 0 ? body.slice(0, q) : body;
        w.location.search = q >= 0 ? body.slice(q) : '';
      },
    },
    navigator: { clipboard: { writeText: () => Promise.resolve() } },
    document: null,
  };
  return { w, writes };
};
const QUERY = '?devmode&invite=7&game=friday&universe=SOCOM';

describe('STREAMER-P1 1b: the stripped address', () => {
  it('a query invite keeps its path and the other keys; a lobby link becomes the invite route (the router plans both as LOGIN)', () => {
    expect(strippedAddress({ pathname: '/main/online', search: QUERY }, '/')).toBe('/main/online?devmode');
    expect(strippedAddress({ pathname: '/online/lobby/abc123defgh', search: '?devmode' }, '/')).toBe('/main/online?devmode');
    expect(strippedAddress({ pathname: '/socomlegacy/online/lobby/abc123defgh', search: '' }, '/socomlegacy/')).toBe('/socomlegacy/main/online');
  });
});

describe('STREAMER-P1 1b: holdInviteAddress', () => {
  it('Off: nothing held, the address untouched', () => {
    const { w, writes } = fakeWin('/main/online', QUERY);
    expect(holdInviteAddress(w as never, '/')).toBe(false);
    expect([writes, heldInviteAddress()]).toEqual([[], null]);
    expect(addressOf(w.location)).toEqual({ pathname: '/main/online', search: QUERY });
  });

  it('Hidden: the invite held, the address bare at once (fragment kept); readers read the held address', () => {
    setStreamerMode(true);
    const { w, writes } = fakeWin('/main/online', QUERY);
    expect(holdInviteAddress(w as never, '/')).toBe(true);
    expect(writes).toEqual(['/main/online?devmode#x']);
    expect(w.location.search).toBe('?devmode');
    expect(addressOf(w.location)).toEqual({ pathname: '/main/online', search: QUERY });
  });

  it('Hidden, no invite in the address: nothing held, nothing written', () => {
    setStreamerMode(true);
    const { w, writes } = fakeWin('/main/online', '?devmode');
    expect(holdInviteAddress(w as never, '/')).toBe(false);
    expect([writes, heldInviteAddress()]).toEqual([[], null]);
  });

  it('a lobby link held: the address shows the invite route, the lobby link reader still sees the link', () => {
    setStreamerMode(true);
    const { w, writes } = fakeWin('/online/lobby/abc123defgh', '');
    expect(holdInviteAddress(w as never, '/')).toBe(true);
    expect(writes).toEqual(['/main/online#x']);
    expect(loadInLobbyLinkAt(w.location.pathname, '/')).toBe(true);     // the launcher's DEPLOYING panel reads the held link
    releaseInviteAddress();
    expect(loadInLobbyLinkAt(w.location.pathname, '/')).toBe(false);
  });
});

describe('STREAMER-P1 1b: the front end\'s invite (pageInvite)', () => {
  it('Off: as before -- the address keeps the invite until the join, then consumed strips it', () => {
    const { w, writes } = fakeWin('/main/online', QUERY);
    const m = pageInvite(w.location.search, w as never, { base: '/', dev: true });
    expect([m.link?.mediusWorldId, m.pending(), writes]).toEqual([7, true, []]);
    m.consumed();
    expect([writes, m.pending()]).toEqual([['/main/online?devmode#x'], false]);
  });

  it('Hidden: the address is bare at once, the invite still read and pending; consumed writes nothing more and lets go', () => {
    setStreamerMode(true);
    const { w, writes } = fakeWin('/main/online', QUERY);
    const m = pageInvite(w.location.search, w as never, { base: '/', dev: true });
    expect(writes).toEqual(['/main/online?devmode#x']);
    expect([m.link?.mediusWorldId, m.link?.game, m.pending()]).toEqual([7, 'friday', true]);
    m.consumed();
    expect([writes.length, m.pending(), heldInviteAddress()]).toEqual([1, false, null]);
  });

  it('Hidden, a lobby link: read from the held path, the address the invite route', () => {
    setStreamerMode(true);
    const { w, writes } = fakeWin('/online/lobby/abc123defgh', '');
    const m = pageInvite('', w as never, { base: '/' });
    expect(m.link?.lobbyId).toBe('abc123defgh');
    expect(writes).toEqual(['/main/online#x']);
  });

  it('Hidden, the launcher already held it: the front end reads the held address, writes nothing', () => {
    setStreamerMode(true);
    const { w, writes } = fakeWin('/online/lobby/abc123defgh', '');
    holdInviteAddress(w as never, '/');
    writes.length = 0;
    const m = pageInvite(w.location.search, w as never, { base: '/' });
    expect([m.link?.lobbyId, writes]).toEqual(['abc123defgh', []]);
  });
});

describe('STREAMER-P1 1b: turned on after the hand-over (the review\'s F2)', () => {
  it('the front end\'s invite still pending: turning the mode on bares the address then; after consumed, nothing', () => {
    const { w, writes } = fakeWin('/main/online', QUERY);
    const m = pageInvite(w.location.search, w as never, { base: '/', dev: true });
    expect(writes).toEqual([]);                                              // Off at the mount: as before
    setStreamerMode(true);
    expect(writes).toEqual(['/main/online?devmode#x']);
    expect([m.link?.mediusWorldId, m.pending()]).toEqual([7, true]);
    m.consumed();
    expect([writes.length, heldInviteAddress()]).toEqual([1, null]);
  });

  it('consumed first: turning the mode on later writes nothing', () => {
    const { w, writes } = fakeWin('/main/online', QUERY);
    const m = pageInvite(w.location.search, w as never, { base: '/', dev: true });
    m.consumed();
    writes.length = 0;
    setStreamerMode(true);
    expect(writes).toEqual([]);
  });
});
