import { describe, expect, it, vi } from 'vitest';
import { createSocialSet, foldName, type SocialSources } from '../src/socialSet';

/**
 * STREAMER-P1 slice 3 (product track, a browser adaptation; the scope's s3.5 and s4.6a): one synchronous view over the
 * friends list and the clan roster the front end already holds -- a friend by account id or folded name, a clan mate by
 * roster (never a tag), no flicker while a list is asked again, cleared with the session's ticket, a name trusted only
 * where names are fixed to accounts, the lists asked once where a lobby mounts before they were ever read.
 */
type Row = { accountId: number; accountName: string; endOfList: boolean };
function sources(o: Partial<{ ticket: string | null; friends: Row[]; clanId: number; roster: { accountId: number; name: string }[]; trusted: boolean }> = {}) {
  const s = { ticket: 't1' as string | null, friends: [] as Row[], clanId: -1, roster: [] as { accountId: number; name: string }[], trusted: true, ...o };
  const request = vi.fn();
  const src: SocialSources = {
    ticket: () => s.ticket, friends: () => s.friends, clan: () => ({ clanId: s.clanId, roster: s.roster }), namesTrusted: () => s.trusted, request,
  };
  return { s, src, request };
}
const FRIENDS: Row[] = [{ accountId: 11, accountName: 'KiLL', endOfList: false }, { accountId: 12, accountName: 'Pal_2', endOfList: true }];

describe('STREAMER-P1 3: the social set', () => {
  it('central\'s nameKey fold: ASCII A-Z to lowercase, nothing else', () => {
    expect(foldName('KiLL')).toBe('kill');
    expect(foldName('ÄBC_Z')).toBe('Äbc_z');
  });

  it('a friend by account id and by folded name; a stranger is neither', () => {
    const { src, s } = sources({ friends: FRIENDS });
    const set = createSocialSet(src);
    expect(set.isFriend({ accountId: 12 })).toBe(true);
    expect(set.isFriend({ name: 'kill' })).toBe(true);
    expect(set.isFriend({ name: 'PAL_2' })).toBe(true);
    expect(set.isFriend({ name: 'stranger' })).toBe(false);
    expect(set.isFriend({ accountId: 99, name: 'KiLL' })).toBe(false);          // an account id carried decides alone
    s.trusted = false;
    expect(set.isFriend({ name: 'KiLL' })).toBe(false);                         // a free-typed room: names never trusted
    expect(set.isFriend({ accountId: 11 })).toBe(true);                         // an account id still is
  });

  it('a clan mate by roster; a member of another clan with the same tag is not (no tag is ever read)', () => {
    const { src } = sources({ clanId: 5, roster: [{ accountId: 21, name: 'Mate' }] });
    const set = createSocialSet(src);
    expect(set.isClanMate({ accountId: 21 })).toBe(true);
    expect(set.isClanMate({ name: 'mate' })).toBe(true);
    expect(set.isClanMate({ name: 'TagTwin' })).toBe(false);
    expect(set.isFriendOrClan({ name: 'mate' })).toBe(true);
    expect(set.isFriendOrClan({ name: 'nobody' })).toBe(false);
  });

  it('no flicker: while the list is asked again (emptied, then partly answered) the last complete list stands', () => {
    const { src, s } = sources({ friends: FRIENDS });
    const set = createSocialSet(src);
    expect(set.isFriend({ name: 'Pal_2' })).toBe(true);
    s.friends = [];                                                             // requestList empties it
    expect(set.isFriend({ name: 'Pal_2' })).toBe(true);
    s.friends = [{ accountId: 11, accountName: 'KiLL', endOfList: false }];      // part of the reply
    expect(set.isFriend({ name: 'Pal_2' })).toBe(true);
    s.friends = [{ accountId: 11, accountName: 'KiLL', endOfList: false }, { accountId: 13, accountName: 'New', endOfList: true }];
    expect(set.isFriend({ name: 'Pal_2' })).toBe(false);                        // the new complete list
    expect(set.isFriend({ name: 'New' })).toBe(true);
  });

  it('the roster likewise: an emptied roster keeps the last; leaving the clan (no clan id) clears it', () => {
    const { src, s } = sources({ clanId: 5, roster: [{ accountId: 21, name: 'Mate' }] });
    const set = createSocialSet(src);
    expect(set.isClanMate({ name: 'Mate' })).toBe(true);
    s.roster = [];
    expect(set.isClanMate({ name: 'Mate' })).toBe(true);
    s.clanId = -1;
    expect(set.isClanMate({ name: 'Mate' })).toBe(false);
  });

  it('cleared on a ticket change, and on its loss (sessionLost, logout, close leave no ticket)', () => {
    const { src, s } = sources({ friends: FRIENDS, clanId: 5, roster: [{ accountId: 21, name: 'Mate' }] });
    const set = createSocialSet(src);
    expect(set.isFriendOrClan({ name: 'KiLL' })).toBe(true);
    s.ticket = null; s.friends = []; s.roster = [];
    expect(set.isFriendOrClan({ name: 'KiLL' })).toBe(false);
    expect(set.isFriendOrClan({ name: 'Mate' })).toBe(false);
    s.ticket = 't2';                                                            // the new login, seen before its list comes
    expect(set.isFriend({ name: 'KiLL' })).toBe(false);
    s.friends = [{ accountId: 31, accountName: 'Other', endOfList: true }];
    expect(set.isFriend({ name: 'Other' })).toBe(true);
  });

  it('the review’s F3: a new ticket does not take the old account’s list still held by the commands, until it is asked again', () => {
    const { src, s, request } = sources({ friends: FRIENDS });
    const set = createSocialSet(src);
    expect(set.isFriend({ name: 'KiLL' })).toBe(true);
    s.ticket = 't2';                                                            // another login; the commands still hold the old rows
    expect(set.isFriend({ name: 'KiLL' })).toBe(false);
    set.ensureLoaded();
    expect(request).toHaveBeenCalledTimes(1);                                   // not taken as read: asked
    s.friends = [{ accountId: 41, accountName: 'Fresh', endOfList: true }];      // the new account's answer (a new array)
    expect(set.isFriend({ name: 'Fresh' })).toBe(true);
  });

  it('the re-check’s finding 1: a new login does not take the old account’s clan roster still held, until the clan is read again', () => {
    const { src, s } = sources({ clanId: 5, roster: [{ accountId: 21, name: 'Mate' }] });
    const set = createSocialSet(src);
    expect(set.isClanMate({ name: 'Mate' })).toBe(true);
    s.ticket = 't2';                                                            // another login; LobbyClan still holds the old clan
    expect(set.isClanMate({ name: 'Mate' })).toBe(false);
    s.clanId = 8; s.roster = [{ accountId: 51, name: 'NewMate' }];               // the new account's clan, read
    expect(set.isClanMate({ name: 'NewMate' })).toBe(true);
  });

  it('the clan guard (the re-check’s test gap): the first session takes the clan at once; after a new login, a clan left (-1) and then the SAME clan read again is taken', () => {
    const { src, s } = sources({ clanId: 5, roster: [{ accountId: 21, name: 'Mate' }] });
    const set = createSocialSet(src);
    expect(set.isClanMate({ name: 'Mate' })).toBe(true);                         // the first session: no guard
    s.ticket = 't2';
    expect(set.isClanMate({ name: 'Mate' })).toBe(false);                        // the old clan, held: ignored
    s.clanId = -1; s.roster = [];                                                // a clan screen's session() resets LobbyClan
    expect(set.isClanMate({ name: 'Mate' })).toBe(false);
    s.clanId = 5; s.roster = [{ accountId: 21, name: 'Mate' }];                  // the same clan, read again for this login
    expect(set.isClanMate({ name: 'Mate' })).toBe(true);
  });

  it('a lobby mounting with the set never read for this ticket asks the lists once; read already, never', () => {
    const { src, s, request } = sources();
    const set = createSocialSet(src);
    set.ensureLoaded();
    set.ensureLoaded();
    expect(request).toHaveBeenCalledTimes(1);
    s.ticket = 't2';
    set.ensureLoaded();
    expect(request).toHaveBeenCalledTimes(2);                                    // a new session: once again
    const read = sources({ friends: FRIENDS });
    const set2 = createSocialSet(read.src);
    set2.isFriend({ name: 'x' });
    set2.ensureLoaded();
    expect(read.request).not.toHaveBeenCalled();
    const none = sources({ ticket: null });
    createSocialSet(none.src).ensureLoaded();
    expect(none.request).not.toHaveBeenCalled();                                 // no session: nothing to ask
  });
});

describe('STREAMER-P1 3: the front end\'s social set, registered as Streamer mode\'s lookup', () => {
  it('reads the friends list\'s records and the clan\'s roster; names trusted only with a ticket; the request asks both lists', async () => {
    const { frontEndSocialSet, registerSocialSet } = await import('../src/socialSet');
    const { friendOrClan, ensureSocialLoaded, setSocialLookup } = await import('../src/streamerMode');
    let ticket: string | null = 't1';
    const fn: string[] = [];
    const friends = { records: () => FRIENDS as never, GetFriendsList: (c: { fn: string }) => { fn.push(c.fn); return true; } };
    const roster = { GetClan: (c: { fn: string }) => { fn.push(c.fn); return false; } };
    const clan = { clanId: 5, roster: [{ accountId: 21, name: 'Mate' }] };
    const set = frontEndSocialSet({ friends: friends as never, roster: roster as never, clan, ticket: () => ticket });
    registerSocialSet(set);
    try {
      expect(friendOrClan({ name: 'kill' })).toBe(true);
      expect(friendOrClan({ name: 'mate' })).toBe(true);
      ticket = null;
      expect(friendOrClan({ name: 'kill' })).toBe(false);
      ticket = 't2';
      const none = frontEndSocialSet({ friends: { records: () => [], GetFriendsList: friends.GetFriendsList } as never, roster: roster as never, clan: { clanId: -1, roster: [] }, ticket: () => ticket });
      registerSocialSet(none);
      ensureSocialLoaded();                                                     // Streamer mode Off: nothing asked (the review's F1)
      expect(fn).toEqual([]);
      none.ensureLoaded();
      none.ensureLoaded();
      expect(fn).toEqual(['GetFriendsList']);                                  // the review's F1: GetClan's state machine is never stepped
      registerSocialSet(null);
      expect(friendOrClan({ name: 'kill' })).toBe(false);
    } finally { setSocialLookup(null); }
  });
});

describe("STREAMER-P1 3: the ask passes the table's own row, as every UiCommandHandler call does (TS2554 at socialSet.ts:134)", () => {
  it('GetFriendsList is called with the command, the 157 GetFriendsList row and no time', async () => {
    const { frontEndSocialSet } = await import('../src/socialSet');
    const { uiCommandRowByName } = await import('@s2u/ui');
    const calls: unknown[][] = [];
    const friends = { records: () => [], GetFriendsList: (...args: unknown[]) => { calls.push(args); return true; } };
    const set = frontEndSocialSet({ friends: friends as never, clan: { clanId: -1, roster: [] }, ticket: () => 't1' });
    set.ensureLoaded();
    expect(calls).toHaveLength(1);
    const [cmd, row, time] = calls[0]!;
    expect((cmd as { fn: string }).fn).toBe('GetFriendsList');
    expect(row).toBe(uiCommandRowByName('GetFriendsList'));
    expect((row as { id: number }).id).toBe(157);
    expect(time).toBeUndefined();
  });
});

describe('STREAMER-P1 3: the front end session registers its set (a source pin)', () => {
  it('FrontEndSession registers the front end\'s set over its friends list, the roster commands, the clan and the ticket', async () => {
    const { readFileSync } = await import('node:fs');
    const { dirname, resolve } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/frontEnd.ts'), 'utf-8');
    expect(src).toContain('const manageRoster = connectManageRoster(this.host,');
    expect(src).toContain('registerSocialSet(frontEndSocialSet({ friends: this.friends.commands, roster: manageRoster.roster, clan: this.world.commands.clan, ticket: () => this.lobby?.ticket() ?? null }));');
  });
});

/**
 * LATER 1505 (the last friend removed): the friends list counts its answers and keeps the list as each left it
 * (`FriendListCommands.answered`), so an answer with no row kept -- an empty list, NoResult only -- is an answer: the set
 * takes the empty list and its friend is gone; and a re-ask's emptied records are never read as an answer.
 */
describe('LATER 1505: an empty friends list, answered, empties the set', () => {
  const answering = (rows: Row[]) => {
    const s = { ticket: 't1' as string | null, friends: rows, answer: { count: 1, records: rows } };
    const request = vi.fn();
    const src: SocialSources = {
      ticket: () => s.ticket, friends: () => s.friends, friendsAnswered: () => s.answer,
      clan: () => ({ clanId: -1, roster: [] }), namesTrusted: () => true, request,
    };
    /** The list asked again: its records emptied (`requestList`), the latest answer unchanged. */
    const reask = (): void => { s.friends = []; };
    /** A reply taken: the records and the answer, counted. */
    const reply = (next: Row[]): void => { s.friends = next; s.answer = { count: s.answer.count + 1, records: next }; };
    return { s, src, request, reask, reply };
  };
  it('the last friend removed: asked again (emptied), answered with none -- no longer a friend', () => {
    const { src, reask, reply } = answering(FRIENDS);
    const set = createSocialSet(src);
    expect(set.isFriend({ name: 'KiLL' })).toBe(true);
    reask();
    expect(set.isFriend({ name: 'KiLL' })).toBe(true);                          // no flicker while unanswered
    reply([]);                                                                  // answered: NoResult only
    expect(set.isFriend({ name: 'KiLL' })).toBe(false);
  });
  it('the review’s F1: an answer the set has not read yet, then a re-ask before it looks -- the answer’s list, not the emptied records', () => {
    const { src, reask, reply } = answering(FRIENDS);
    const set = createSocialSet(src);
    expect(set.isFriend({ name: 'KiLL' })).toBe(true);
    reply([...FRIENDS, { accountId: 62, accountName: 'Added', endOfList: true }]);   // answered, not looked at yet
    reask();                                                                          // asked again at once: emptied
    expect([set.isFriend({ name: 'KiLL' }), set.isFriend({ name: 'Added' })]).toEqual([true, true]);
  });
  it('an empty list answered counts as read: ensureLoaded asks nothing more', () => {
    const { src, request } = answering([]);
    const set = createSocialSet(src);
    set.isFriend({ name: 'x' });
    set.ensureLoaded();
    expect(request).not.toHaveBeenCalled();
  });
  it('after a new login, an answer counted before it is the old session’s: the list waits for the next answer', () => {
    const { s, src, reply } = answering(FRIENDS);
    const set = createSocialSet(src);
    expect(set.isFriend({ name: 'KiLL' })).toBe(true);
    s.ticket = 't2';
    expect(set.isFriend({ name: 'KiLL' })).toBe(false);
    reply([{ accountId: 61, accountName: 'Next', endOfList: true }]);
    expect(set.isFriend({ name: 'Next' })).toBe(true);
  });
});

describe("STREAMER-P1 3: the round's voice is told who is a friend or clan mate (IQ-229 F1, the hand-off's known gap 4)", () => {
  it("friendOrClanBySeat reads a seat id's name through the given table and asks the social lookup; no name is a stranger", async () => {
    const { friendOrClanBySeat, setSocialLookup } = await import('../src/streamerMode');
    setSocialLookup((who) => who.name?.toLowerCase() === 'mate', null);
    try {
      const names = new Map<number, string>([[3, 'Mate'], [4, 'Stranger']]);
      const of = friendOrClanBySeat((id) => names.get(id) ?? null);
      expect([of(3), of(4), of(9)]).toEqual([true, false, false]);
      const throwing = friendOrClanBySeat(() => { throw new Error('x'); });
      expect(throwing(3)).toBe(false);
    } finally { setSocialLookup(null); }
  });
  it("the round (matchMount) and the page voice (main) pass it to mountVoice over the match's own seat names (a source pin)", async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const src = (f: string): string => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src', f), 'utf8');
    expect(src('matchMount.ts')).toMatch(/mountVoice\(\{[^]*?friendOrClan: friendOrClanBySeat\(\(id\) => net\?\.nameOf\(id\) \?\? null\)/);
    expect(src('main.ts')).toMatch(/mountVoice\(\{[^]*?friendOrClan: friendOrClanBySeat\(\(id\) => net\?\.nameOf\(id\) \?\? null\)/);
  });
});

describe("STREAMER-P1 3: a round's speaker check asks the lists lazily (the IQ-229 review's (iii))", () => {
  it('friendOrClanBySeat asks ensureSocialLoaded when Streamer mode wants friends; nothing while Off', async () => {
    const sm = await import('../src/streamerMode');
    const data = new Map<string, string>();
    const g = globalThis as unknown as { localStorage?: unknown };
    const had = g.localStorage;
    g.localStorage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); }, removeItem: (k: string) => { data.delete(k); } };
    sm.resetStreamerCache();
    const ensure = vi.fn();
    sm.setSocialLookup(() => false, ensure);
    try {
      const of = sm.friendOrClanBySeat(() => 'Someone');
      of(3);
      expect(ensure).not.toHaveBeenCalled();                                         // Off: the game's requests untouched
      sm.setStreamerMode(true);                                                      // the preset: friends & clan choices
      of(3);
      expect(ensure).toHaveBeenCalled();
    } finally { sm.setSocialLookup(null); data.clear(); sm.resetStreamerCache(); g.localStorage = had; }
  });
});
