import { uiCommandRowByName, type FriendListCommands, type ManageRosterCommands, type ZAnimUiCommand } from '@s2u/ui';
import { setSocialLookup } from './streamerMode';

/**
 * STREAMER-P1 slice 3 (OT.R152, the owner, 2026-11-24: "add friend and clan data in browser ... in this request"; product
 * track, **a browser adaptation** with no original): this player's friends and clan mates, one synchronous view over what
 * the front end already holds -- the friends list (`@s2u/ui` `FriendListCommands.records()`: "on MY list", the FRIENDS
 * screen's meaning) and the clan's roster (`LobbyClan.roster`: a clan mate is a roster member, never a tag match -- tags
 * are not unique and a told tag can be stale). Streamer mode's "friends & clan" choices ask it (`./streamerMode`
 * `setSocialLookup`).
 *
 * - **Keys:** an account id where the caller carries one (it decides alone); else the name, folded as central's
 *   `nameKey` folds it (ASCII A-Z to lowercase) -- and only while `namesTrusted()`: in a room whose names are free-typed
 *   a stranger could take a friend's name, so there every name is a stranger's.
 * - **No flicker:** asking a list again empties it before its reply; the view keeps the last complete list until a new
 *   one is complete -- the friends' latest answer where the list counts them (LATER 1505), else rows ending `endOfList`;
 *   a non-empty roster. A clan left (no clan id) clears the roster.
 * - **Lifecycle:** keyed on the session's ticket; a new ticket, or none (session lost, logout, close), clears both.
 * - **Load:** `ensureLoaded()` asks the friends list once a ticket when it was never read for it (a join straight from an
 *   invite link), and only while Streamer mode wants it (`./streamerMode` `ensureSocialLoaded`); until it answers, friends
 *   are strangers. The roster is never asked from here (GetClan is the clan screens' state machine): it is the ONLINE
 *   screen's read. LATER 1505: the list counts its answers (`FriendListCommands.answered`), so an empty answer (NoResult
 *   only: the last friend removed) empties the set too. A logout and a login on one page while the set was never asked during the first session can still take the
 *   first account's lists (the set sees no ticket change it did not look up); a login it saw waits for fresh lists.
 * - Clan changes are not pushed: a kick or a new member is seen at the next ONLINE screen or clan screen.
 */

export const SOCIAL_SET_ADAPTATION =
  'friends by the friends list and clan mates by the roster, by account id, or by folded name where names are fixed to accounts; kept per session ticket' as const;

export interface SocialWho { readonly accountId?: number | null; readonly name?: string | null }

export interface SocialSources {
  /** The session's ticket now (null: no session). */
  ticket(): string | null;
  /** The friends list's records as they stand (emptied while asked again). */
  friends(): readonly { accountId: number; accountName: string; endOfList: boolean }[];
  /**
   * LATER 1505: the friends list's answers so far and the list as the latest left it (`FriendListCommands.answered`), an
   * empty one (NoResult only) included; absent, an answer is known only by a row ending the list.
   */
  friendsAnswered?(): { readonly count: number; readonly records: readonly { accountId: number; accountName: string }[] };
  /** The clan: its id (-1: none) and its roster as it stands. */
  clan(): { clanId: number; roster: readonly { accountId: number; name: string }[] };
  /** Whether names are fixed to accounts where the caller asks (the front end's online session: game rooms with fixedNames). */
  namesTrusted(): boolean;
  /** Asks the friends list and the clan again (GetFriendsList, GetClan); absent, nothing is asked. */
  request?(): void;
}

export interface SocialSet {
  isFriend(who: SocialWho): boolean;
  isClanMate(who: SocialWho): boolean;
  isFriendOrClan(who: SocialWho): boolean;
  /** Asks the lists once for this ticket when they were never read for it. */
  ensureLoaded(): void;
}

/** Central's `nameKey` fold: ASCII A-Z to lowercase, every other character as it is. */
export const foldName = (name: string): string => name.replace(/[A-Z]/g, (c) => c.toLowerCase());

interface Kept { ids: Set<number>; names: Set<string> }
const empty = (): Kept => ({ ids: new Set(), names: new Set() });

export function createSocialSet(src: SocialSources): SocialSet {
  let key: string | null = null;
  let friends: Kept = empty(), clan: Kept = empty();
  let friendsRead = false, asked = false;
  /** The friends' rows the commands held when the ticket changed: the old account's, never taken for the new (the review's F3). */
  let stale: readonly unknown[] | null = null;
  /** A session was held before (only then can the commands still hold an earlier account's list). */
  let hadSession = false;
  /** LATER 1505: the answers counted when the list was last taken (or at the ticket change: the old session's). */
  let answersSeen = -1;
  /** The clan as LobbyClan held it when the ticket changed after a session: the old account's (the re-check's finding 1). */
  let staleClan: string | null = null;
  const clanSig = (c: ReturnType<SocialSources['clan']>): string => `${c.clanId}:${c.roster.map((r) => r.accountId).join(',')}`;

  const sync = (): void => {
    const t = src.ticket();
    if (t !== key) {
      if (key !== null) hadSession = true;
      key = t; friends = empty(); clan = empty(); friendsRead = false; asked = false;
      stale = hadSession ? src.friends() : null;
      answersSeen = hadSession ? (src.friendsAnswered?.().count ?? -1) : -1;   // an earlier session's answer is never this one's
      staleClan = hadSession ? clanSig(src.clan()) : null;
    }
    if (t === null) return;
    const c = src.clan();
    if (staleClan !== null && clanSig(c) === staleClan) { /* still the old session's clan: wait for a new read */ }
    else if (c.clanId === -1) { clan = empty(); staleClan = null; }
    else if (c.roster.length > 0) { staleClan = null; clan = { ids: new Set(c.roster.map((r) => r.accountId)), names: new Set(c.roster.map((r) => foldName(r.name))) }; }
    const answer = src.friendsAnswered?.();
    // LATER 1505: a new answer is the list as it answered, empty or not (the last friend gone) -- read from the answer,
    // never from the records a later re-ask may already have emptied (the review's F1).
    if (answer !== undefined && answer.count > 0 && answer.count !== answersSeen) {
      answersSeen = answer.count; stale = null;
      friends = { ids: new Set(answer.records.map((r) => r.accountId)), names: new Set(answer.records.map((r) => foldName(r.accountName))) };
      friendsRead = true;
      return;
    }
    if (answer !== undefined) return;                                  // answers counted: only a new answer moves the list
    const rows = src.friends();
    if (rows === stale) return;                                        // still the old session's list: wait for the new
    stale = null;
    if (rows.length > 0 && rows[rows.length - 1]!.endOfList) {
      friends = { ids: new Set(rows.map((r) => r.accountId)), names: new Set(rows.map((r) => foldName(r.accountName))) };
      friendsRead = true;
    }
  };

  const holds = (k: Kept, who: SocialWho): boolean => {
    if (typeof who.accountId === 'number' && who.accountId >= 0) return k.ids.has(who.accountId);
    if (typeof who.name !== 'string' || who.name === '' || !src.namesTrusted()) return false;
    return k.names.has(foldName(who.name));
  };

  return {
    isFriend: (who) => { sync(); return holds(friends, who); },
    isClanMate: (who) => { sync(); return holds(clan, who); },
    isFriendOrClan: (who) => { sync(); return holds(friends, who) || holds(clan, who); },
    ensureLoaded: () => {
      sync();
      if (key === null || friendsRead || asked) return;
      asked = true;
      try { src.request?.(); } catch { /* not asked: friends stay strangers */ }
    },
  };
}

/** A command as the front end's own table would carry it, for the set's one ask of the lists (only its name is read). */
const asked = (fn: string): ZAnimUiCommand => ({ anim: 'streamer-social', sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg: '', loc: 0, bytes: new Uint8Array(0) });

/**
 * The front end's set (`./frontEnd` `FrontEndSession`): its one friends list (`connectFriendList`), the world's clan and
 * its roster commands (`connectManageRoster`: GetClan, which fills the roster), and the lobby's ticket. Names are trusted
 * while the session holds a ticket: every game room the front end joins online is made with `fixedNames` (match
 * `game.ts`, `forgeGame.ts`), each seat named by its account; the test room and LAN have no such session.
 */
export function frontEndSocialSet(o: {
  friends: Pick<FriendListCommands, 'records' | 'GetFriendsList' | 'answered'>;
  roster?: Pick<ManageRosterCommands, 'GetClan'>;
  clan: { readonly clanId: number; readonly roster: readonly { accountId: number; name: string }[] };
  ticket(): string | null;
}): SocialSet {
  return createSocialSet({
    ticket: o.ticket,
    friends: () => o.friends.records(),
    friendsAnswered: () => o.friends.answered,
    clan: () => ({ clanId: o.clan.clanId, roster: o.clan.roster }),
    namesTrusted: () => o.ticket() !== null,
    // The friends list only (the review's F1): GetClan is a polling state machine of the clan screens -- stepped from here it
    // would blank the clan's variables and skip the next screen's fresh read -- so the roster stays the ONLINE screen's.
    // A UiCommandHandler takes the table's own row (`@s2u/ui` UI_COMMAND_TABLE, 157 GetFriendsList) and no time.
    request: () => { const row = uiCommandRowByName('GetFriendsList'); if (row) o.friends.GetFriendsList(asked('GetFriendsList'), row, undefined); },
  });
}

/** The set as Streamer mode's lookup (`./streamerMode` `setSocialLookup`); null, none (everyone a stranger). */
export function registerSocialSet(set: SocialSet | null): void {
  setSocialLookup(set ? (who) => set.isFriendOrClan(who) : null, set ? () => { set.ensureLoaded(); } : null);
}
