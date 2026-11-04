import { describe, expect, it } from 'vitest';
import { DIALOG_EVENTS } from '../../src/dialog';
import { UiCommandHost, UI_COMMAND_TABLE, uiCommandRowByName } from '../../src/uiCommands';
import { UiVarManager, type UiVarValue } from '../../src/uiVars';
import type { ZAnimUiCommand } from '../../src/zanimRuntime';
import * as ladderLobby from '../../src/screens/ladderLobbyCommands';
import {
  CLAN_LADDER_BOOT_STATE_READING, CLAN_LADDER_LEADERS_VAR, CLAN_LADDER_RANKING_VAR, CLAN_LADDER_REPLY_ORDER_READING, CLAN_LADDER_TAGS, CLAN_POSITION_VAR,
  CLAN_TOTAL_VAR, LADDER_INFO_MODE, LADDER_LOBBY_COMMAND_ROWS, LadderLobbyCommands, clanMedalOf,
  type ClanListEntry, type ClanListQuery, type ClanPositionQuery, type ClanPositionReply, type ClanTotalReply, type LadderService,
} from '../../src/screens/ladderLobbyCommands';

/**
 * ONL-30 (web research 311 §8.2 items 1-2): the clan medal (`FUN_002ead80` D:L188869-188895) and the clans' half of the
 * one client ladder -- `GetLadderInfo`'s modes 6-11 (`FUN_002784d0` D:L123454-123487: the entry `FUN_002eab80`
 * D:L188792-188826, the podium `FUN_002ea6b0` D:L188638-188657, the list `FUN_002ea5c0` D:L188607-188633, the replies
 * `FUN_002eac70` D:L188831-188863, `FUN_002eb1b0` D:L189056-189091 and `FUN_002ea730` D:L188663-188692, the keep
 * `FUN_002ebcf0` D:L189489-189544, the draws `FUN_002ea800` / `FUN_002ea930`) and row 162 `GetClanRanking`
 * (`FUN_0027a250` D:L124325-124330), over a fake service. Synthetic boards; nothing measured on the original running.
 */

const cmd = (fn: string, mode = 0): ZAnimUiCommand => {
  const bytes = new Uint8Array(0x14);
  bytes[0x10] = mode;
  return { anim: 'get_ladder_top_10', sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg: 'NA', loc: 0, bytes };
};
const str = (value: string): UiVarValue => ({ type: 'string', value });
const int = (value: number): UiVarValue => ({ type: 'int', value });
const arr = (...value: UiVarValue[]): UiVarValue => ({ type: 'array', value });
const tint = (text: string): UiVarValue => arr(str('VALUE'), str(text), str('COLOR'), arr(...[91, 72, 36].map((value) => ({ type: 'real' as const, value }))));
const REFRESH = DIALOG_EVENTS['ON_LADDER_REFRESH']!;
const M = LADDER_INFO_MODE;
/** A clan's id on the seeded boards: 500 + its position. */
const CID = (position: number): number => 500 + position;

type Op = { op: 'position'; q: ClanPositionQuery } | { op: 'total' } | { op: 'list'; q: ClanListQuery };
interface Pending { op: Op; resolve: () => void; reject: () => void }

/**
 * A seeded clans' board of `size`, as CLAN-BOARD-SERVER answers it (`ladder.ts` `clanPosition`, `totalRankings` type 1,
 * `clanList`): every request recorded in the order sent, each reply held until the test releases it (`held`), or answered
 * at once.
 */
function board(size: number, o: { held?: boolean; totalFirst?: boolean } = {}) {
  const sent: Op[] = [];
  const pending: Pending[] = [];
  const answer = <T>(op: Op, reply: () => T): Promise<T> => {
    sent.push(op);
    if (!o.held) return Promise.resolve(reply());
    return new Promise<T>((res, rej) => { pending.push({ op, resolve: () => { res(reply()); }, reject: () => { rej(new Error('never answered')); } }); });
  };
  const service: LadderService = {
    position: () => new Promise(() => {}),
    list: () => new Promise(() => {}),
    playerInfo: () => new Promise(() => {}),
    clanPosition: (q) => answer<ClanPositionReply>({ op: 'position', q }, () => {
      const p = q.clanId - 500;
      return p >= 1 && p <= size ? { tag: q.tag ?? '', status: 0, ladderPosition: p, totalRankings: size } : { tag: q.tag ?? '', status: -971, ladderPosition: 0, totalRankings: 0 };
    }),
    clanTotal: () => answer<ClanTotalReply>({ op: 'total' }, () => ({ status: 0, totalRankings: size })),
    clanList: (q) => answer<ClanListEntry[]>({ op: 'list', q }, () => {
      const n = Math.max(0, Math.min(q.pageSize, size - q.startPosition + 1));
      if (n === 0) return [{ tag: q.tag, status: 1, clanId: 0, clanName: '', ladderPosition: 0, endOfList: true }];
      return Array.from({ length: n }, (_, i) => ({ tag: q.tag, status: 0, clanId: CID(q.startPosition + i), clanName: `c${q.startPosition + i}`, ladderPosition: q.startPosition + i, endOfList: i === n - 1 }));
    }),
  };
  return { sent, pending, service };
}

function rig(b: ReturnType<typeof board>, clanId = -1) {
  const uiVars = new UiVarManager(), events: number[] = [];
  const clan = { clanId, get member(): boolean { return this.clanId !== -1; } };
  const c = new LadderLobbyCommands({ uiVars, service: b.service, event: (k) => { events.push(k); }, clan });
  const host = new UiCommandHost();
  c.register(host);
  const rows = (name: string): UiVarValue[] => { const v = uiVars.find(name)?.value; return v?.type === 'array' ? [...v.value] : []; };
  const run = (mode: number) => host.dispatch(cmd('GetLadderInfo', mode));
  return { c, host, uiVars, events, rows, run, clan };
}
const flush = async (n = 6): Promise<void> => { for (let i = 0; i < n; i++) await new Promise<void>((r) => setTimeout(r, 0)); };
/** The requests as one line each: `position <tag> <clan>`, `total`, `list <tag> <start> <count>`. */
const lines = (ops: readonly Op[]): string[] => ops.map((x) => x.op === 'position' ? `position ${x.q.tag ?? '-'} ${x.q.clanId}` : x.op === 'total' ? 'total' : `list ${x.q.tag} ${x.q.startPosition} ${x.q.pageSize}`);
const firsts = (rs: UiVarValue[]): string[] => rs.map((r) => {
  const c = (r as { value: readonly UiVarValue[] }).value[0]!;
  return c.type === 'string' ? c.value : ((c as { value: readonly UiVarValue[] }).value[1] as { value: string }).value;
});

describe('the clan medal (clanMedalOf, FUN_002ead80 D:L188869-188895)', () => {
  it('per mille of position x 1000 / TotalClans, truncated: 4 up to 50, 3 up to 300, 2 up to 850, else 1 -- the boundaries at a total of 100', () => {
    expect([5, 6, 30, 31, 85, 86].map((p) => clanMedalOf(p, 100))).toEqual([4, 3, 3, 2, 2, 1]);
  });
  it('no top-ten rung and no small-ladder rule: 20 clans give the first 4, 19 give it 3; one clan draws 1; never 5', () => {
    expect([clanMedalOf(1, 20), clanMedalOf(2, 20), clanMedalOf(1, 19), clanMedalOf(1, 1)]).toEqual([4, 3, 3, 1]);
    for (let t = 1; t <= 60; t++) for (let p = 1; p <= t; p++) expect(clanMedalOf(p, t)).not.toBe(5);
  });
  it('0 while the total is 0 or below; position 0 with a total is 4 (p 0); the product 32-bit, as the instructions', () => {
    expect([clanMedalOf(1, 0), clanMedalOf(7, 0), clanMedalOf(1, -3), clanMedalOf(0, 50)]).toEqual([0, 0, 0, 4]);
    expect(clanMedalOf(3_000_000, 1)).toBe(4);                                 // 3e9 wraps negative in 32 bits: p < 51
  });
  it('-1 is the clan\'s own position only when it is handed (D:L188876-188878); not the players\' ladderMedal', () => {
    expect([clanMedalOf(-1, 100, 31), clanMedalOf(-1, 100)]).toEqual([2, 4]);
    expect([clanMedalOf(5, 100), playersMedal(5, 100)]).toEqual([4, 5]);
  });
});
/** The players' medal, for the contrast (FUN_002eaee0's top-ten rung). */
const playersMedal = (p: number, t: number): number => ladderLobby.ladderMedal(p, t);

describe('the rows (PLAT-08\'s table): row 162 GetClanRanking is this module\'s (ONL-30)', () => {
  it('names 92, 162 and 173 by id, function and task, each registered', () => {
    expect(LADDER_LOBBY_COMMAND_ROWS.map((r) => `${r.id} ${r.name} ${r.fn.toString(16)} ${r.task}`)).toEqual(['92 GetLadderInfo 2784d0 ONL-30a', '162 GetClanRanking 27a250 ONL-30', '173 GetPlayerInfo 279b50 ONL-30a']);
    for (const r of LADDER_LOBBY_COMMAND_ROWS) {
      const t = uiCommandRowByName(r.name)!;
      expect([t.id, t.fn, t.task], r.name).toEqual([r.id, r.fn, r.task]);
      expect(UI_COMMAND_TABLE[t.index]!.name).toBe(r.name);
    }
    const r = rig(board(3));
    expect(r.host.dispatch(cmd('GetClanRanking')).kind).toBe('table');
  });
  it('LADDER_INFO_MODE names 6 and 7 for what they do (the page, the podium); the parked placeholder retired', () => {
    expect([M.clanPage, M.clanPodium, M.clanPressUp, M.clanPressDown, M.clanUp, M.clanDown]).toEqual([6, 7, 8, 9, 10, 11]);
    expect(['CLAN_LADDER_MODES_PLACEHOLDER', 'clanTop10', 'clanBest'].filter((n) => n in ladderLobby || n in M)).toEqual([]);
    expect([CLAN_LADDER_REPLY_ORDER_READING, CLAN_LADDER_BOOT_STATE_READING]).toEqual([expect.stringMatching(/order/), expect.stringMatching(/start 2/)]);
    expect(CLAN_LADDER_TAGS).toEqual({ surrounding: 'GetSurrounding', total: 'ClanTotal', list: 'ClanLadderList', leaders: 'ClanLadderLeaders' });
  });
});

describe('mode 6, the entry (FUN_002eab80, then FUN_002ea6b0(10))', () => {
  it('with a clan held: 0xd4 "GetSurrounding" with the clan id, 0xd8 type 1, then the leaders 10 from 1 -- in that order', async () => {
    const b = board(30);
    const r = rig(b, CID(20));
    expect(r.run(M.clanPage).answer).toBe(true);
    expect(lines(b.sent)).toEqual([`position GetSurrounding ${CID(20)}`, 'total', 'list ClanLadderLeaders 1 10']);
    expect(b.sent[0]).toEqual({ op: 'position', q: { tag: 'GetSurrounding', clanId: CID(20), ladderStatIndex: 0, sortOrder: 1 } });
    await flush();
    expect(lines(b.sent).slice(3)).toEqual(['list ClanLadderList 20 14']);       // from the position itself (D:L188856-188860)
  });

  it('the position\'s Success: ClanLadderRanking, the bound, the list from the position; at 2 or less from 1', async () => {
    for (const [me, start] of [[20, 20], [3, 3], [2, 1], [1, 1]] as const) {
      const b = board(30);
      const r = rig(b, CID(me));
      r.run(M.clanPage);
      await flush();
      expect(lines(b.sent).slice(3), String(me)).toEqual([`list ClanLadderList ${start} 14`]);
      expect(r.uiVars.find(CLAN_POSITION_VAR)!.value, String(me)).toEqual(int(me));
      expect(r.c.state().clan.position).toBe(me);
    }
  });

  it('without a clan: my position 0 and the list from 1 before the total, then the leaders (D:L188806-188807)', async () => {
    const b = board(30);
    const r = rig(b);
    r.run(M.clanPage);
    expect(lines(b.sent)).toEqual(['list ClanLadderList 1 14', 'total', 'list ClanLadderLeaders 1 10']);
    await flush();
    expect(firsts(r.rows(CLAN_LADDER_RANKING_VAR))).toEqual(Array.from({ length: 14 }, (_, i) => String(i + 1)));
    expect(r.c.state().clan.position).toBe(0);
  });

  it('the total\'s reply: TotalClans, DAT_0044f870 and the bound (D:L189076-189086); 0xd4\'s own totalRankings not taken', async () => {
    const b = board(30, { held: true });
    const r = rig(b, CID(20));
    r.run(M.clanPage);
    b.pending.shift()!.resolve();                                              // the position (its totalRankings 30)
    await flush();
    expect([r.c.state().clan.total, r.c.state().clan.bound, r.uiVars.find(CLAN_TOTAL_VAR)]).toEqual([0, 20, undefined]);
    b.pending.shift()!.resolve();                                              // the total
    await flush();
    expect([r.c.state().clan.total, r.c.state().clan.bound, r.uiVars.find(CLAN_TOTAL_VAR)!.value]).toEqual([30, 30, int(30)]);
  });

  it('CLAN_LADDER_REPLY_ORDER_READING: the total landing before the position is applied after it -- the bound ends at the total, mode 9 passes on page one', async () => {
    const b = board(40, { held: true });
    const r = rig(b, CID(1));
    r.run(M.clanPage);
    const [position, total, leaders] = [b.pending[0]!, b.pending[1]!, b.pending[2]!];
    total.resolve();
    leaders.resolve();
    await flush();
    expect(r.c.state().clan.total).toBe(0);                                    // held behind the position
    expect(r.rows(CLAN_LADDER_LEADERS_VAR)).toHaveLength(10);                  // the podium shares no state: applied as it lands
    position.resolve();
    await flush();
    expect([r.c.state().clan.total, r.c.state().clan.bound]).toEqual([40, 40]);
    b.pending.at(-1)!.resolve();                                               // the list from 1
    await flush();
    expect(r.c.state().clan.bound).toBe(40);                                   // the rows raise it only to 14
    expect([r.run(M.clanPressUp).answer, r.run(M.clanPressDown).answer]).toEqual([false, true]);
  });

  it('a request never answered frees its turn without effect: the total refused, the leaders and the list still apply', async () => {
    const b = board(30, { held: true });
    const r = rig(b, CID(5));
    r.run(M.clanPage);
    b.pending[1]!.reject();
    b.pending[2]!.resolve();
    b.pending[0]!.resolve();
    await flush();
    expect(r.rows(CLAN_LADDER_LEADERS_VAR)).toHaveLength(10);
    b.pending.at(-1)!.resolve();
    await flush();
    expect([r.c.state().clan.total, firsts(r.rows(CLAN_LADDER_RANKING_VAR))[0]]).toEqual([0, '5']);
  });

  /*
   * LATER 51 (CLAN-RANKING-STALL): a request that never settles -- a promise neither resolved nor rejected -- holds only the
   * replies its own entry sent after it. The original's handler for each reply type is the one callback slot the send
   * rewrites (FUN_006467a8 D:L559258, FUN_00646838 D:L559280, FUN_0064aee8 D:L561948), called with whatever reply lands
   * (D:L563488-563531): no request id, no queue. The podium (FUN_002ea6b0, no flag) is applied as it lands.
   */
  it('a total that never settles holds its own entry\'s list only: the podium applies as it lands; a later entry releases the held list (applied then) and its podium is applied', async () => {
    const b = board(30, { held: true });
    const r = rig(b, CID(20));
    r.run(M.clanPage);
    const [, total1] = [b.pending[0]!, b.pending[1]!];
    b.pending[0]!.resolve();                                                   // the position: the list from 20 asked
    await flush();
    b.pending[2]!.resolve();                                                   // the leaders
    b.pending.at(-1)!.resolve();                                               // the list from 20 -- behind the total
    await flush();
    expect(r.rows(CLAN_LADDER_LEADERS_VAR)).toHaveLength(10);                  // no flag, no shared state: drawn as it lands
    expect([r.rows(CLAN_LADDER_RANKING_VAR), r.events]).toEqual([[], []]);     // the list waits for the total sent before it
    const at = b.pending.length;
    r.run(M.clanPage);                                                         // a later entry (the total never answers): the older chain released first
    expect(firsts(r.rows(CLAN_LADDER_RANKING_VAR))).toEqual(Array.from({ length: 11 }, (_, i) => String(20 + i)));   // its landed list applied then
    // LATER 54 re-pins this (was: `[false, [REFRESH]]`): that list landed on the first visit, where the original drew it
    // and raised its ON_LADDER_REFRESH (FUN_002ea930 D:L188782-188784, on landing); the re-entry's page gets none.
    expect([r.c.state().clan.inFlight, r.events]).toEqual([false, []]);
    for (const p of b.pending.slice(at)) p.resolve();
    await flush();
    expect(lines(b.sent).filter((l) => l.startsWith('list ClanLadderList'))).toEqual(['list ClanLadderList 20 14']);   // rows held at 20: no list (D:L188617)
    expect(r.rows(CLAN_LADDER_LEADERS_VAR)).toHaveLength(10);
    expect([r.c.state().clan.total, r.c.state().clan.bound, r.c.state().clan.inFlight, r.events]).toEqual([30, 30, false, []]);   // LATER 54 (was [REFRESH])
    total1.resolve();                                                          // the first entry's total lands at last: applied as it lands
    await flush();
    expect([r.c.state().clan.total, r.c.state().clan.bound, r.rows(CLAN_LADDER_RANKING_VAR).length, r.events.length]).toEqual([30, 30, 11, 0]);   // LATER 54 (was 1)
  });

  it('a list that never settles keeps the flag set (no page) until a later entry\'s position frees it and asks again', async () => {
    const b = board(30, { held: true });
    const r = rig(b, CID(20));
    r.run(M.clanPage);
    b.pending[0]!.resolve();
    await flush();
    b.pending[1]!.resolve();
    b.pending[2]!.resolve();
    await flush();                                                             // the list from 20 never answers
    expect([r.c.state().clan.inFlight, r.c.state().clan.total]).toEqual([true, 30]);
    const sent = b.sent.length;
    r.run(M.clanUp);
    r.run(M.clanDown);
    expect(b.sent.length).toBe(sent);                                          // one list request out (D:L188617)
    const at = b.pending.length;
    r.run(M.clanPage);
    for (const p of b.pending.slice(at)) p.resolve();
    await flush();
    b.pending.at(-1)!.resolve();
    await flush();
    expect(firsts(r.rows(CLAN_LADDER_RANKING_VAR))).toEqual(Array.from({ length: 11 }, (_, i) => String(20 + i)));
    expect([r.c.state().clan.inFlight, r.events]).toEqual([false, [REFRESH]]);
  });

  it('a re-entry releases the older chain: its landed list applied then, a turn landing later applied as it lands -- never into a newer page (FUN_002ea730 D:L188684-188688)', async () => {
    const b = board(60, { held: true });
    const r = rig(b, CID(20));
    const done = new Set<Pending>();
    const settle = (p: Pending): void => { done.add(p); p.resolve(); };
    /** Every request out answered, but `skip`, until nothing more goes out. */
    const answerAll = async (skip: Pending): Promise<void> => {
      for (let open = b.pending.filter((p) => p !== skip && !done.has(p)); open.length > 0; open = b.pending.filter((p) => p !== skip && !done.has(p))) {
        for (const p of open) settle(p);
        await flush();
      }
    };
    r.run(M.clanPage);
    const total1 = b.pending[1]!;                                              // the first entry's total: it stalls
    await answerAll(total1);                                                   // the position, the leaders, the list from 20 (held behind the total)
    r.run(M.clanPage);                                                         // the re-entry
    await answerAll(total1);
    const shown = firsts(r.rows(CLAN_LADDER_RANKING_VAR));
    expect(shown).toEqual(Array.from({ length: 14 }, (_, i) => String(20 + i)));
    // LATER 54 re-pins this (was 1): the released list's draw raises none on the re-entry's page -- both arrows as the
    // dialog's entry leaves them, while L2 pages (the bound at the re-entry's total, 60).
    expect([r.c.state().clan.total, r.c.state().clan.bound, r.c.state().clan.inFlight, r.events.length]).toEqual([60, 60, false, 0]);
    r.run(M.clanDown);                                                         // L2: the list from 34 out, its rows freed (D:L188624), the flag set
    expect(lines(b.sent).at(-1)).toBe('list ClanLadderList 34 14');
    const page = b.pending.at(-1)!;
    settle(total1);                                                            // the first entry's total lands at last
    await flush();
    expect([r.c.state().clan.rest.length, r.c.state().clan.start, r.c.state().clan.inFlight, r.events.length]).toEqual([0, 34, true, 0]);
    expect([r.c.state().clan.total, r.c.state().clan.bound]).toEqual([60, 60]);
    settle(page);
    await flush();
    expect(firsts(r.rows(CLAN_LADDER_RANKING_VAR))).toEqual(Array.from({ length: 14 }, (_, i) => String(34 + i)));
    expect([r.c.state().clan.inFlight, r.events.length]).toEqual([false, 1]);   // the L2 page's own, as it lands (was 2)
  });

  /*
   * LATER 54 (research 311 §3.7, the arrows; reading, pending review): the original draws a list and raises ON_LADDER_REFRESH
   * when it lands (FUN_002ea730 D:L188684-188688 -> FUN_002ea930 D:L188782-188784) -- one that landed on an earlier visit
   * refreshed that visit's page, never the next. The port holds an entry's list behind its stalled total; at the next entry
   * the release applies what landed (the list drawn, its rows and bound kept) but raises no refresh on the re-entry's page,
   * so the dialog's own arrows stand (the down arrow not hidden while L2 pages). A turn still out at the release raises its
   * refresh when it lands, on the page then up -- as the original's would.
   */
  it('LATER 54: a released list that landed on the first visit is drawn at the re-entry with no ON_LADDER_REFRESH; one landing after the release raises it', async () => {
    const b = board(60, { held: true });
    const r = rig(b, CID(20));
    r.run(M.clanPage);
    b.pending[0]!.resolve();                                                   // the position: the list from 20 asked
    await flush();
    b.pending[2]!.resolve();                                                   // the leaders
    b.pending.at(-1)!.resolve();                                               // the list from 20 -- landed, behind the stalled total
    await flush();
    r.run(M.clanPage);                                                         // the re-entry releases it
    expect(firsts(r.rows(CLAN_LADDER_RANKING_VAR))[0]).toBe('20');            // drawn (the variable written)
    expect(r.events).toEqual([]);                                              // no refresh on the re-entry's page
    // a chain released with its list still out: that list raises its refresh when it lands
    const c = board(60, { held: true });
    const q = rig(c, CID(20));
    q.run(M.clanPage);
    c.pending[0]!.resolve();
    await flush();                                                             // the list from 20 out, the total stalled
    const list = c.pending.at(-1)!;
    q.run(M.clanPage);                                                         // the release: nothing landed to apply
    expect(q.events).toEqual([]);
    list.resolve();                                                            // lands after the release: applied as it lands
    await flush();
    expect(q.events).toEqual([REFRESH]);
  });

  it('SOCOM II ONLINE\'s podium (mode 7) after an entry whose position never settles: applied as it lands', async () => {
    const b = board(30, { held: true });
    const r = rig(b, CID(20));
    r.run(M.clanPage);                                                         // the position never answers
    b.pending[1]!.resolve();
    await flush();
    const at = b.pending.length;
    r.run(M.clanPodium);
    b.pending[at]!.resolve();
    await flush();
    expect(r.rows(CLAN_LADDER_LEADERS_VAR)).toHaveLength(10);
  });

  it('a clan off the board (ClanNotFound): no list asked, nothing written; the podium drawn, the list empty, no refresh', async () => {
    const b = board(30);
    const r = rig(b, 999);
    r.run(M.clanPage);
    await flush();
    expect(lines(b.sent)).toEqual(['position GetSurrounding 999', 'total', 'list ClanLadderLeaders 1 10']);
    expect([r.c.state().clan.position, r.uiVars.find(CLAN_POSITION_VAR), r.rows(CLAN_LADDER_RANKING_VAR), r.events]).toEqual([0, undefined, [], []]);
    expect(r.rows(CLAN_LADDER_LEADERS_VAR)).toHaveLength(10);
    expect(r.run(M.clanPressUp).answer).toBe(true);                            // the boot start 2 passes mode 8 (CLAN_LADDER_BOOT_STATE_READING)
    r.run(M.clanUp);
    await flush();
    expect(lines(b.sent).at(-1)).toBe('list ClanLadderList 1 14');             // L1: the top fourteen
    expect(firsts(r.rows(CLAN_LADDER_RANKING_VAR))).toEqual(Array.from({ length: 14 }, (_, i) => String(i + 1)));
  });

  it('a later visit with rows held: the position\'s Success at 20 sends nothing and draws nothing; at 2 it asks from 1', async () => {
    const b = board(30);
    const r = rig(b, CID(20));
    r.run(M.clanPage);
    await flush();
    const drawn = r.rows(CLAN_LADDER_RANKING_VAR);
    expect(drawn).toHaveLength(11);                                            // 20 .. 30
    const at = b.sent.length, events = r.events.length;
    r.run(M.clanPage);
    await flush();
    expect(lines(b.sent.slice(at))).toEqual([`position GetSurrounding ${CID(20)}`, 'total', 'list ClanLadderLeaders 1 10']);
    expect([r.rows(CLAN_LADDER_RANKING_VAR), r.events.length]).toEqual([drawn, events]);
    const b2 = board(30);
    const two = rig(b2, CID(2));
    two.run(M.clanPage);
    await flush();
    two.run(M.clanPage);
    await flush();
    expect(lines(b2.sent).filter((l) => l.startsWith('list ClanLadderList'))).toEqual(['list ClanLadderList 1 14', 'list ClanLadderList 1 14']);
  });
});

describe('the rows and the draws (FUN_002ea730, FUN_002ebcf0, FUN_002ea800, FUN_002ea930)', () => {
  it('the ranking: sorted, one row per position, ["%d", name, medal]; the own clan\'s position and name tinted; ON_LADDER_REFRESH after it only', async () => {
    const b = board(30);
    const r = rig(b, CID(20));
    r.run(M.clanPage);
    await flush();
    const rows = r.rows(CLAN_LADDER_RANKING_VAR);
    expect(rows[0]).toEqual(arr(tint('20'), tint('c20'), int(clanMedalOf(20, 30))));
    expect(rows[1]).toEqual(arr(str('21'), str('c21'), int(clanMedalOf(21, 30))));
    expect(r.events).toEqual([REFRESH]);
    expect(r.rows(CLAN_LADDER_LEADERS_VAR)).toEqual(Array.from({ length: 10 }, (_, i) => arr(str(String(i + 1)), str(`c${i + 1}`))));
    const s = rig(board(3));
    s.c.clanListReply([
      { tag: 'ClanLadderList', status: 0, clanId: 2, clanName: 'b', ladderPosition: 2, endOfList: false },
      { tag: 'clanladderlist', status: 0, clanId: 1, clanName: 'a', ladderPosition: 1, endOfList: false },   // the tag compared case-blind
      { tag: 'ClanLadderList', status: 0, clanId: 9, clanName: 'dup', ladderPosition: 2, endOfList: true },
    ]);
    expect(s.rows(CLAN_LADDER_RANKING_VAR).map((x) => ((x as { value: readonly UiVarValue[] }).value[1] as { value: string }).value)).toEqual(['a', 'b']);
  });

  it('a NoResult row frees the request and draws nothing; another tag keeps nothing; the medals drawn against the total as it stands', async () => {
    const r = rig(board(3));
    r.c.clanListReply([{ tag: 'ClanLadderList', status: 0, clanId: 1, clanName: 'a', ladderPosition: 1, endOfList: true }]);
    expect(r.rows(CLAN_LADDER_RANKING_VAR)).toEqual([arr(str('1'), str('a'), int(0))]);            // TotalClans 0: every medal 0
    r.c.clanListReply([{ tag: 'ClanLadderList', status: 1, clanId: 0, clanName: '', ladderPosition: 0, endOfList: true }]);
    expect([r.rows(CLAN_LADDER_RANKING_VAR).length, r.c.state().clan.inFlight, r.events.length]).toEqual([1, false, 1]);
    r.c.clanListReply([{ tag: 'Other', status: 0, clanId: 4, clanName: 'x', ladderPosition: 4, endOfList: true }]);
    expect([r.c.state().clan.rest.length, r.events.length]).toEqual([1, 1]);
  });
});

describe('modes 7-11: the podium, the arrows and the pages', () => {
  it('7 the podium alone (SOCOM II ONLINE\'s): the leaders 10 from 1, no position, no total', async () => {
    const b = board(12);
    const r = rig(b, CID(3));
    expect(r.run(M.clanPodium).answer).toBe(true);
    await flush();
    expect(lines(b.sent)).toEqual(['list ClanLadderLeaders 1 10']);
    expect(r.rows(CLAN_LADDER_LEADERS_VAR)).toHaveLength(10);
    expect(r.events).toEqual([]);
  });

  it('8 / 9 at the boot state (start 2, bound 0): 8 passes, 9 fails; 11 with no row held asks from 16 (D:L188617)', async () => {
    const b = board(40);
    const r = rig(b);
    expect(r.c.state().clan).toMatchObject({ start: 2, bound: 0, position: 0, total: 0, inFlight: false });
    expect([r.run(M.clanPressUp).answer, r.run(M.clanPressDown).answer]).toEqual([true, false]);
    r.run(M.clanDown);
    expect(lines(b.sent)).toEqual(['list ClanLadderList 16 14']);              // no row held: 16 goes out (D:L188617)
  });

  it('10 / 11 page by fourteen from max(1, start - 14) and start + 14; one request at a time; the arrows over a drawn page', async () => {
    const b = board(40);
    const r = rig(b, CID(1));
    r.run(M.clanPage);
    await flush();
    const pages = (): number[] => b.sent.filter((x) => x.op === 'list' && x.q.tag === 'ClanLadderList').map((x) => (x as { q: ClanListQuery }).q.startPosition);
    expect(pages()).toEqual([1]);
    expect([r.run(M.clanPressUp).answer, r.run(M.clanPressDown).answer]).toEqual([false, true]);
    r.run(M.clanDown);
    r.run(M.clanDown);                                                         // in flight: refused
    await flush();
    expect(pages()).toEqual([1, 15]);
    expect([r.run(M.clanPressUp).answer, r.run(M.clanPressDown).answer]).toEqual([true, true]);
    r.run(M.clanDown);
    await flush();
    expect(pages()).toEqual([1, 15, 29]);
    expect(r.run(M.clanPressDown).answer).toBe(false);                        // 40 < 29 + 14
    r.run(M.clanUp);
    await flush();
    r.run(M.clanUp);
    await flush();
    r.run(M.clanUp);                                                           // at 1: nothing
    expect(pages()).toEqual([1, 15, 29, 15, 1]);
    expect(r.events).toHaveLength(5);
  });

  it('the last row (a board of exactly start + 14 clans): the down arrow shows, L2 sends nothing (§3.4, the original\'s pair)', async () => {
    const b = board(29);
    const r = rig(b, CID(1));
    r.run(M.clanPage);
    await flush();
    r.run(M.clanDown);
    await flush();
    expect(r.run(M.clanPressDown).answer).toBe(true);                         // the bound 29 is not under 15 + 14
    const at = b.sent.length;
    r.run(M.clanDown);                                                         // 29: not under the bound 29, rows held
    expect(b.sent.length).toBe(at);
  });
});

describe('row 162 GetClanRanking (FUN_0027a250: the entry untagged, then 1)', () => {
  it('asks the position untagged and the total -- no leaders, no list; its replies write the position, the total and the bound, and draw nothing', async () => {
    const b = board(30);
    const r = rig(b, CID(7));
    expect(r.host.dispatch(cmd('GetClanRanking')).answer).toBe(true);
    expect(lines(b.sent)).toEqual([`position - ${CID(7)}`, 'total']);
    expect('tag' in (b.sent[0] as { q: ClanPositionQuery }).q).toBe(false);
    await flush();
    expect(lines(b.sent)).toHaveLength(2);
    expect([r.c.state().clan.position, r.c.state().clan.total, r.c.state().clan.bound, r.rows(CLAN_LADDER_RANKING_VAR), r.events]).toEqual([7, 30, 30, [], []]);
    const none = board(30);
    const n = rig(none);
    n.host.dispatch(cmd('GetClanRanking'));
    expect(lines(none.sent)).toEqual(['list ClanLadderList 1 14', 'total']);   // no clan: FUN_002eab80's other branch
  });

  it('with no service nothing is sent, the state moving as the console\'s: 6 without a clan holds the start at 1, so 8 then answers 0', () => {
    const uiVars = new UiVarManager();
    const c = new LadderLobbyCommands({ uiVars });
    const host = new UiCommandHost();
    c.register(host);
    expect([6, 7, 8, 9, 10, 11].map((m) => host.dispatch(cmd('GetLadderInfo', m)).answer)).toEqual([true, true, false, false, true, true]);
    // a service without the clans' half (the players' alone): nothing of the clans' sent, nothing thrown
    const asked: string[] = [];
    const players: LadderService = { position: () => { asked.push('position'); return new Promise(() => {}); }, list: () => { asked.push('list'); return new Promise(() => {}); }, playerInfo: () => new Promise(() => {}) };
    const p = new LadderLobbyCommands({ uiVars: new UiVarManager(), service: players, clan: { clanId: 4, member: true } });
    const h2 = new UiCommandHost();
    p.register(h2);
    expect([h2.dispatch(cmd('GetLadderInfo', M.clanPage)).answer, h2.dispatch(cmd('GetClanRanking')).answer, asked]).toEqual([true, true, []]);
  });
});
