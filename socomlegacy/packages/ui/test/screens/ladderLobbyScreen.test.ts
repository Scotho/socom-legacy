import { describe, expect, it } from 'vitest';
import { DIALOG_EVENTS } from '../../src/dialog';
import { UiCommandHost, UI_COMMAND_TABLE, uiCommandRowByName } from '../../src/uiCommands';
import { UiVarManager, type UiVarValue } from '../../src/uiVars';
import { ValveStore } from '../../src/valves';
import type { ZAnimUiCommand } from '../../src/zanimRuntime';
import type { ListboxWidget } from '../../src/widgets/listbox';
import { BRIEFING_ROOM_ENTRY_COMMANDS } from '../../src/screens/briefingRoomCommands';
import { BriefingRoomChat, type LobbyChatService } from '../../src/screens/briefingRoomChat';
import { PARKED_ROWS, WORLD_OF_SOCOM_ENTRY_COMMANDS, parkedRowGate } from '../../src/screens/worldOfSocomCommands';
import * as ladderLobby from '../../src/screens/ladderLobbyCommands';
import {
  CLAN_LADDER_LOBBY, LADDER_INFO_MODE, LADDER_KEYED_CELL_READING, LADDER_LEADERS_VAR, LADDER_LOBBY, LADDER_LOBBY_COMMAND_ROWS,
  LADDER_MEDAL_VALVE, LADDER_POSITION_VAR, LADDER_RANKING_VAR, LADDER_TIER_VALVE,
  LadderLobbyCommands, PLAYER_INFO_CHAT_NAME_VAR, PLAYER_INFO_DESCRIPTION_VAR, PLAYER_INFO_NAME_VAR, PLAYER_INFO_ORIGIN,
  PLAYER_INFO_RECORD_VERSION_READING, PLAYER_INFO_VAR1, PLAYER_INFO_VAR2, ladderMedal, ladderTier, readPlayerRecord,
  type ClanRosterPresence, type LadderListEntry, type LadderOnlineState, type LadderService, type PlayerInfoQuery,
} from '../../src/screens/ladderLobbyCommands';
import { HAVE, WORLD, worldRig } from './worldOfSocomRig';

/**
 * ONL-30a (web research 269 §2): PLAYER RANKING (`dlgLadderLobby.rdr`), PLAYER INFO on its CROSS and SOCOM II ONLINE's
 * top ten -- `GetLadderInfo` (`FUN_002784d0` D:L123407-123492: the position `FUN_002eafb0` / `FUN_002eb2c0` and their
 * replies `FUN_002eb010` / `FUN_002eb340`, the page `FUN_002eb510`, the podium `FUN_002eb610`, the reply `FUN_002eb6a0`,
 * the rows `FUN_002ebe50`, the draws `FUN_002eb7a0` / `FUN_002eb900`, the medal `FUN_002eaee0`, the tier `FUN_002eae20`)
 * and `GetPlayerInfo` (`FUN_00279b50` D:L124078-124094 -> `FUN_002efe50` D:L191683-191719, the page `FUN_002f0020`
 * D:L191722-192146, V11).
 * - The rows off the machine, over a seeded ladder through the service's fake.
 * - The page over the machine, built from the disc's layout and set (or the committed fixtures): SOCOM II ONLINE's top
 *   ten and its PLAYER RANKING row (unparked), the page's podium, its fourteen rows from my position less 2, the paging
 *   and the arrows, my row's tint, the medals, PLAYER INFO on CROSS and its whisper's not-found popup, the way back; CLAN
 *   RANKING's row unparked since ONL-30 (its page: `clanLadderLobbyScreen.test.ts`; the clans' half: `clanLadder.test.ts`).
 * Synthetic ladders; nothing measured on the original running (ONL-32's capture is the proven level).
 */

const SETTLED = 60;
const cmd = (fn: string, mode = 0, arg = 'NA', anim = 'get_ladder_top_10'): ZAnimUiCommand => {
  const bytes = new Uint8Array(0x14);
  bytes[0x10] = mode;
  return { anim, sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg, loc: 0, bytes };
};
const flush = async (n = 3): Promise<void> => { for (let i = 0; i < n; i++) await new Promise<void>((r) => setTimeout(r, 0)); };
const str = (value: string): UiVarValue => ({ type: 'string', value });
const int = (value: number): UiVarValue => ({ type: 'int', value });
const arr = (...value: UiVarValue[]): UiVarValue => ({ type: 'array', value });
const tint = (text: string): UiVarValue => arr(str('VALUE'), str(text), str('COLOR'), arr(...[91, 72, 36].map((value) => ({ type: 'real' as const, value }))));
const OFFLINE: LadderOnlineState = { connectStatus: 0, lobbyWorldId: 0, gameWorldId: 0, lobbyName: '', gameName: '' };
const ME = 'socomc';

/** A 256-byte `'E'` record at the codec's offsets (`accountStatsCodec.ts`, research 155 §1.1), as hex. */
interface Fields {
  rating?: number; position?: number; minutes?: number; seconds?: number; won?: number; lost?: number; kills?: number; games?: number; bonus?: number;
  hostages?: number; vipsRescued?: number; vipsKilled?: number; deaths?: number; suicides?: number; planted?: number; defused?: number; headShots?: number;
  hit?: number; leader?: boolean; tag?: string; clan?: string; hometown?: string; description?: string; version?: number;
}
function recordHex(f: Fields = {}): string {
  const b = new Uint8Array(256), v = new DataView(b.buffer);
  b[0] = f.version ?? 0x45;
  b[1] = (f.hit ?? 0) & 0x7f;
  b[2] = f.leader ? 0x80 : 0;
  v.setInt32(0x04, f.rating ?? 1000, true); v.setInt32(0x08, f.position ?? 0, true); v.setUint32(0x0c, f.minutes ?? 0, true); v.setUint32(0x10, f.seconds ?? 0, true);
  v.setInt32(0x14, f.won ?? 0, true); v.setInt32(0x18, f.lost ?? 0, true); v.setInt32(0x1c, f.kills ?? 0, true);
  v.setUint32(0x20, (((f.bonus ?? 0) & 0x3ff) << 22 | ((f.games ?? 0) & 0x3fffff)) >>> 0, true);
  [f.hostages, f.vipsRescued, f.vipsKilled, f.deaths, f.suicides, f.planted, f.defused, f.headShots].forEach((x, i) => v.setUint16(0x24 + i * 2, x ?? 0, true));
  const put = (o: number, n: number, s = ''): void => { for (let i = 0; i < Math.min(n, s.length); i++) b[o + i] = s.charCodeAt(i); };
  put(0x34, 12, f.tag); put(0x40, 32, f.clan); put(0x60, 63, f.hometown); put(0x9f, 66, f.description);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

/** Horizon's empty page (desktop@be557831 `MLS.cs:1137-1145`; `ladder.ts` `list`): one NoResult row ending it. */
const NO_ROW: LadderListEntry = { status: 1, ladderPosition: 0, accountId: 0, accountName: '', stats: '', onlineState: OFFLINE, endOfList: true };
/** A seeded row's account id (SVC-15: the 0xf0 row's +0x20, the page's key cell): 1000 + its position. */
const ID = (position: number): number => 1000 + position;

/** A seeded board: `size` players by rating, me at `me` (0: not on it), each row's record and online state. */
function board(o: { size: number; me?: number; tags?: Record<number, string>; online?: Record<number, LadderOnlineState>; fields?: Record<number, Fields>; failList?: boolean } = { size: 30 }) {
  const rows = Array.from({ length: o.size }, (_, i) => {
    const position = i + 1;
    const name = position === o.me ? ME : `p${String(position).padStart(2, '0')}`;
    const rating = 2000 - position;
    return { position, accountId: ID(position), name, rating, stats: recordHex({ rating, position, tag: o.tags?.[position], ...o.fields?.[position] }), online: o.online?.[position] ?? OFFLINE };
  });
  const requests: { op: string; body: unknown }[] = [];
  const service: LadderService = {
    position: () => {
      requests.push({ op: 'position', body: {} });                    // SVC-15: the bearer's own (0xf1's +0x18, the session's account)
      const me = rows.find((r) => r.name === ME);
      return Promise.resolve(me ? { status: 0, ladderPosition: me.position, totalRankings: rows.length } : { status: 1, ladderPosition: 0, totalRankings: 0 });
    },
    list: (q) => {
      requests.push({ op: 'list', body: q });
      const page = rows.slice(q.startPosition - 1, q.startPosition - 1 + q.pageSize);
      if (o.failList) return Promise.reject(new Error('503'));
      return Promise.resolve(page.length === 0 ? [NO_ROW] : page.map((r, i) => ({
        status: 0, ladderPosition: r.position, accountId: r.accountId, accountName: r.name, stats: r.stats, onlineState: r.online, endOfList: i === page.length - 1,
      })));
    },
    playerInfo: (q: PlayerInfoQuery) => {
      requests.push({ op: 'player-info', body: q });
      const r = 'name' in q ? rows.find((x) => x.name.toLowerCase() === q.name.toLowerCase()) : rows.find((x) => x.accountId === q.accountId);
      return Promise.resolve(r ? { status: 0, accountName: r.name, playerStatus: 0, stats: r.stats } : { status: -998, accountName: 'name' in q ? q.name : '', playerStatus: 0, stats: '' });
    },
  };
  return { rows, requests, service };
}

function rig(b: ReturnType<typeof board>, o: { online?: boolean; input?: string | null; roomState?: (name: string) => LadderOnlineState | null; clanState?: (name: string) => ClanRosterPresence | null } = {}) {
  const uiVars = new UiVarManager(), valves = new ValveStore(), events: number[] = [];
  const c = new LadderLobbyCommands({
    uiVars, valves: () => valves, service: b.service, event: (k) => { events.push(k); }, inputString: () => o.input ?? null,
    lobbyUp: () => o.online ?? true, lobbyState: () => 11, accountName: () => ME, ...(o.roomState ? { roomState: o.roomState } : {}),
    ...(o.clanState ? { clanState: o.clanState } : {}),
  });
  const host = new UiCommandHost();
  c.register(host);
  const value = (name: string): UiVarValue | undefined => uiVars.find(name)?.value;
  const rows = (name: string): UiVarValue[] => { const v = value(name); return v?.type === 'array' ? [...v.value] : []; };
  return { c, host, uiVars, valves, events, value, rows, run: (fn: string, mode: number, arg = 'NA') => host.dispatch(cmd(fn, mode, arg)) };
}
const REFRESH = DIALOG_EVENTS['ON_LADDER_REFRESH']!;

describe('the rows (PLAT-08\'s table: 92 GetLadderInfo, 173 GetPlayerInfo, ONL-30a\'s; 162 GetClanRanking, ONL-30\'s)', () => {
  it('are the table\'s, by id, function and task; registered by name; GetLadderInfo answers by its mode, GetPlayerInfo 1', () => {
    expect(LADDER_LOBBY_COMMAND_ROWS.map((r) => `${r.id} ${r.name} ${r.fn.toString(16)} ${r.task}`)).toEqual(['92 GetLadderInfo 2784d0 ONL-30a', '162 GetClanRanking 27a250 ONL-30', '173 GetPlayerInfo 279b50 ONL-30a']);
    for (const r of LADDER_LOBBY_COMMAND_ROWS) {
      const t = uiCommandRowByName(r.name)!;
      expect([t.id, t.fn, t.task], r.name).toEqual([r.id, r.fn, r.task]);
      expect(UI_COMMAND_TABLE[t.index]!.name).toBe(r.name);
    }
    expect([uiCommandRowByName('GetLadderInfo')!.answer, uiCommandRowByName('GetPlayerInfo')!.answer]).toEqual([null, true]);
    const r = rig(board({ size: 3 }));
    expect([r.run('GetLadderInfo', LADDER_INFO_MODE.position).kind, r.run('GetPlayerInfo', PLAYER_INFO_ORIGIN.ladder, 'p01').kind]).toEqual(['table', 'table']);
    expect([LADDER_LOBBY, CLAN_LADDER_LOBBY]).toEqual(['dlgLadderLobby.rdr', 'dlgClanLadderLobby.rdr']);
  });

  it('the unparked entries: SOCOM II ONLINE\'s GetLadderInfo and PLAYER RANKING\'s row; the briefing room\'s GetPlayerInfo is this body\'s, not reached; CLAN RANKING unparked by ONL-30', () => {
    expect(WORLD_OF_SOCOM_ENTRY_COMMANDS.find((e) => e.name === 'GetLadderInfo')).toMatchObject({ state: 'existing', task: 'ONL-30a' });
    expect(BRIEFING_ROOM_ENTRY_COMMANDS.find((e) => e.name === 'GetPlayerInfo')).toMatchObject({ state: 'existing', task: 'ONL-30a' });
    expect(PARKED_ROWS.map((p) => p.control)).not.toContain('ranking');
    expect(PARKED_ROWS.map((p) => p.control)).not.toContain('Clanranking');
    const start = (animation: string) => ({ dialog: WORLD, design: {} as never, animation, argument: null });
    expect([parkedRowGate(start('Goto_Ladder')), parkedRowGate(start('Goto_ClanLadder'))]).toEqual([false, false]);
  });
});

describe('the medal and the tier (FUN_002eaee0 D:L188934-188970, FUN_002eae20 D:L188898-188931)', () => {
  const tally = (total: number, f: (p: number, t: number) => number) => { const n = [0, 0, 0, 0, 0, 0]; for (let p = 1; p <= total; p++) n[f(p, total)]!++; return n; };
  it('the medal: 0 for an empty total; 5 for all while the total is 1 to 11; the bands of research 155 §2.3 at 100, 250 and 1,000', () => {
    expect([ladderMedal(1, 0), ladderMedal(7, 0), ladderMedal(1, -1)]).toEqual([0, 0, 0]);
    for (let t = 1; t <= 11; t++) expect(tally(t, ladderMedal).slice(1), String(t)).toEqual([0, 0, 0, 0, t]);
    expect(tally(12, ladderMedal).slice(1).reverse()).toEqual([10, 0, 0, 0, 2]);          // Admiral .. Ensign
    expect(tally(100, ladderMedal).slice(1).reverse()).toEqual([10, 0, 17, 49, 24]);
    expect(tally(250, ladderMedal).slice(1).reverse()).toEqual([10, 2, 60, 132, 46]);
    expect(tally(1000, ladderMedal).slice(1).reverse()).toEqual([10, 40, 247, 545, 158]);
    expect([tally(22, ladderMedal)[2], tally(23, ladderMedal)[2], tally(46, ladderMedal)[3], tally(47, ladderMedal)[3], tally(225, ladderMedal)[4], tally(226, ladderMedal)[4]]).toEqual([0, 1, 0, 1, 0, 1]);
  });

  it('a position of -1 is my own (FUN_002eaee0 D:L188943-188945: DAT_0044f7f8, the review of ONL-27, F2): the medal of my position', () => {
    expect([ladderMedal(-1, 100, 50), ladderMedal(50, 100), ladderMedal(-1, 100, 5), ladderMedal(5, 100), ladderMedal(-1, 0, 50)]).toEqual([2, 2, 5, 5, 0]);
    expect(ladderMedal(-1, 1000, 900)).toBe(ladderMedal(900, 1000));
  });

  it('the tier: no top-ten rung -- on 12 position 1 is 2, the rest 1; on 14 1 is 3, 2-3 are 2; the first 4 needs 30', () => {
    expect([ladderTier(1, 0), ladderTier(5, 11)]).toEqual([0, 4]);
    expect([ladderTier(1, 12), ladderTier(2, 12)]).toEqual([2, 1]);
    expect([ladderTier(1, 14), ladderTier(2, 14), ladderTier(3, 14), ladderTier(4, 14)]).toEqual([3, 2, 2, 1]);
    expect([ladderTier(1, 29), ladderTier(1, 30)]).toEqual([3, 4]);
  });
});

describe('GetLadderInfo: my position, THE PODIUM and the page (FUN_002784d0)', () => {
  it('mode 0 in state 11: my position asked (the bearer\'s own, one request) and THE PODIUM\'s ten; the answer opens the page at my position less 2, fourteen rows; LadderRanking, the two valves', async () => {
    const b = board({ size: 30, me: 20, tags: { 1: 'SEAL', 20: 'ME' } });
    const r = rig(b);
    expect(r.run('GetLadderInfo', LADDER_INFO_MODE.position).answer).toBe(true);
    expect(b.requests.slice(0, 2)).toEqual([
      { op: 'position', body: {} },
      { op: 'list', body: { ladderStatIndex: 0, sortOrder: 1, startPosition: 1, pageSize: 10 } },     // TheBest (FUN_002eb610)
    ]);
    await flush();
    expect(b.requests[2]).toEqual({ op: 'list', body: { ladderStatIndex: 0, sortOrder: 1, startPosition: 18, pageSize: 14 } });   // TheRest from max(1, 20 - 2)
    expect(r.value(LADDER_POSITION_VAR)).toEqual(int(20));
    expect([r.valves.find(LADDER_MEDAL_VALVE)!.value, r.valves.find(LADDER_TIER_VALVE)!.value]).toEqual([ladderMedal(20, 30), ladderTier(20, 30)]);
    expect(r.rows(LADDER_LEADERS_VAR)).toEqual(Array.from({ length: 10 }, (_, i) => arr(str(String(i + 1)), str(`p${String(i + 1).padStart(2, '0')}`), str(i === 0 ? '[SEAL]' : ''))));
    const page = r.rows(LADDER_RANKING_VAR);
    expect(page).toHaveLength(13);                                           // 18 .. 30: the board's end
    // SVC-15: the key cell is "%d" of the row's +0x20, the account id (FUN_002eb900 D:L189390), as the original's
    expect(page[0]).toEqual(arr(str('1018'), str('p18'), str('18'), int(ladderMedal(18, 30)), str('')));
    expect(page[2]).toEqual(arr(str('1020'), tint(ME), tint('20'), int(ladderMedal(20, 30)), tint('[ME]')));   // my row tinted: name, position, tag
    expect(r.events).toEqual([REFRESH]);                                     // the page's draw (D:L189451); FUN_002eb340 raises none
    expect(LADDER_KEYED_CELL_READING).toMatch(/VALUE/);
    // SVC-15 retired ONL-30a's two adaptations (research 269 §2.5): the services serve the account at +0x20 and the bearer's own position.
    expect(['LADDER_ROW_KEY_ADAPTATION', 'LADDER_POSITION_BY_NAME_ADAPTATION'].filter((n) => n in ladderLobby)).toEqual([]);
  });

  it('each row\'s medal is FUN_002eaee0 of its position against my total -- 0 while my total is 0 (my position not answered: the page from 1)', async () => {
    const b = board({ size: 40 });
    const r = rig(b);
    r.run('GetLadderInfo', LADDER_INFO_MODE.position);
    await flush();
    expect(b.requests.map((q) => q.op === 'list' ? (q.body as { startPosition: number }).startPosition : q.op)).toEqual(['position', 1, 1]);   // NoResult: the page from 1 (D:L189130-189131)
    const page = r.rows(LADDER_RANKING_VAR);
    expect(page.map((row) => (row as { value: readonly UiVarValue[] }).value[3])).toEqual(Array.from({ length: 14 }, () => int(0)));
    const ranked = rig(board({ size: 40, me: 1 }));
    ranked.run('GetLadderInfo', LADDER_INFO_MODE.position);
    await flush();
    expect(ranked.rows(LADDER_RANKING_VAR).map((row) => (row as { value: readonly UiVarValue[] }).value[3])).toEqual(Array.from({ length: 14 }, (_, i) => int(ladderMedal(i + 1, 40))));
    expect(ranked.rows(LADDER_RANKING_VAR).map((row) => (row as { value: readonly UiVarValue[] }).value[3])).toEqual([...Array.from({ length: 10 }, () => int(5)), ...Array.from({ length: 4 }, () => int(2))]);   // 11-14 of 40: 366-466 per mille, LIEUTENANT
  });

  it('mode 0 off state 11 sends no position (FUN_002eb2c0 D:L189104), THE PODIUM still; mode 1 asks at any state, holds it and raises ON_LADDER_REFRESH (FUN_002eb010)', async () => {
    const b = board({ size: 5, me: 3 });
    const off = rig(b, { online: false });
    off.run('GetLadderInfo', LADDER_INFO_MODE.position);
    expect(b.requests.map((q) => q.op)).toEqual(['list']);
    const b1 = board({ size: 5, me: 3 });
    const r = rig(b1, { online: false });
    r.run('GetLadderInfo', LADDER_INFO_MODE.top10);
    await flush();
    expect(b1.requests.map((q) => q.op)).toEqual(['position', 'list']);       // no page: FUN_002eb010 opens none
    expect([r.value(LADDER_POSITION_VAR), r.valves.find(LADDER_MEDAL_VALVE)!.value, r.valves.find(LADDER_TIER_VALVE)!.value]).toEqual([int(3), 5, 4]);   // a ladder under 12: all Admirals
    expect(r.events).toEqual([REFRESH]);
    expect(r.rows(LADDER_LEADERS_VAR)).toHaveLength(5);
  });

  it('the paging: 2 / 3 answer 0 at the top and the bottom; 5 the next fourteen, 4 back, one request at a time; past the total nothing', async () => {
    const b = board({ size: 40, me: 1 });
    const r = rig(b);
    r.run('GetLadderInfo', LADDER_INFO_MODE.position);
    await flush();
    const starts = (): number[] => b.requests.filter((q) => q.op === 'list' && (q.body as { pageSize: number }).pageSize === 14).map((q) => (q.body as { startPosition: number }).startPosition);
    expect(starts()).toEqual([1]);
    expect([r.run('GetLadderInfo', LADDER_INFO_MODE.pressUp).answer, r.run('GetLadderInfo', LADDER_INFO_MODE.pressDown).answer]).toEqual([false, true]);
    r.run('GetLadderInfo', LADDER_INFO_MODE.down);
    r.run('GetLadderInfo', LADDER_INFO_MODE.down);                            // in flight: refused (D:L189195)
    expect(starts()).toEqual([1, 15]);
    await flush();
    expect(r.rows(LADDER_RANKING_VAR).map((x) => ((x as { value: readonly UiVarValue[] }).value[2] as { value: string }).value)).toEqual(Array.from({ length: 14 }, (_, i) => String(15 + i)));
    expect([r.run('GetLadderInfo', LADDER_INFO_MODE.pressUp).answer, r.run('GetLadderInfo', LADDER_INFO_MODE.pressDown).answer]).toEqual([true, true]);
    r.run('GetLadderInfo', LADDER_INFO_MODE.down);
    await flush();
    expect(starts()).toEqual([1, 15, 29]);
    expect(r.run('GetLadderInfo', LADDER_INFO_MODE.pressDown).answer).toBe(false);   // 40 < 29 + 14
    r.run('GetLadderInfo', LADDER_INFO_MODE.down);                              // 43: not below the total
    expect(starts()).toEqual([1, 15, 29]);
    r.run('GetLadderInfo', LADDER_INFO_MODE.up);
    await flush();
    r.run('GetLadderInfo', LADDER_INFO_MODE.up);
    await flush();
    r.run('GetLadderInfo', LADDER_INFO_MODE.up);                                // at 1: nothing (start not above 1)
    expect(starts()).toEqual([1, 15, 29, 15, 1]);
    expect(r.events).toEqual([REFRESH, REFRESH, REFRESH, REFRESH, REFRESH]);
  });

  it('a page never answered holds the request (no second); a NoResult page keeps what LADDER_RANKING held and frees the request; rows kept once per position, in order', async () => {
    const silent = board({ size: 40, me: 1, failList: true });
    const s = rig(silent);
    s.run('GetLadderInfo', LADDER_INFO_MODE.position);
    await flush();
    s.run('GetLadderInfo', LADDER_INFO_MODE.down);
    expect(silent.requests.filter((q) => q.op === 'list')).toHaveLength(2);    // the podium and the first page; the down refused while out
    const r = rig(board({ size: 3 }));
    r.c.listReply('TheRest', [
      { ...NO_ROW, status: 0, ladderPosition: 2, accountName: 'b', endOfList: false }, { ...NO_ROW, status: 0, ladderPosition: 1, accountName: 'a', endOfList: false },
      { ...NO_ROW, status: 0, ladderPosition: 2, accountName: 'dup', endOfList: true },
    ]);
    expect(r.rows(LADDER_RANKING_VAR).map((x) => ((x as { value: readonly UiVarValue[] }).value[1] as { value: string }).value)).toEqual(['a', 'b']);
    r.c.listReply('TheRest', [NO_ROW]);
    expect(r.rows(LADDER_RANKING_VAR)).toHaveLength(2);
    expect(r.c.state().inFlight).toBe(false);
  });

  it('the clans\' modes (ONL-30, clanLadder.test.ts) send none of the players\' requests: over a service without the clans\' half nothing goes out; 6 without a clan holds the clan list at 1, so 8 and 9 answer 0', () => {
    const b = board({ size: 5 });
    const r = rig(b);
    const answers = [6, 7, 8, 9, 10, 11].map((m) => r.run('GetLadderInfo', m).answer);
    expect([answers, b.requests]).toEqual([[true, true, false, false, true, true], []]);
  });
});

describe('GetPlayerInfo and PLAYER INFO (FUN_00279b50 -> FUN_002efe50, the page FUN_002f0020, V11)', () => {
  const FULL: Fields = {
    rating: 1234, won: 7, lost: 3, kills: 55, games: 12, bonus: 4, hostages: 2, vipsRescued: 1, vipsKilled: 6, deaths: 40, suicides: 5, planted: 3, defused: 2,
    headShots: 9, hit: 23, minutes: 17, seconds: 3725, leader: true, tag: 'SEAL', clan: 'Team Six', hometown: 'Norfolk', description: 'Hello there',
  };
  async function opened(online: LadderOnlineState, o: { origin?: number; text?: string; roomState?: (name: string) => LadderOnlineState | null; clanState?: (name: string) => ClanRosterPresence | null } = {}) {
    const b = board({ size: 30, me: 18, fields: { 16: FULL }, online: { 16: online } });
    const r = rig(b, { input: o.text ?? '1016', ...(o.roomState ? { roomState: o.roomState } : {}), ...(o.clanState ? { clanState: o.clanState } : {}) });
    r.run('GetLadderInfo', LADDER_INFO_MODE.position);
    await flush();
    b.requests.length = 0;
    r.run('GetPlayerInfo', o.origin ?? PLAYER_INFO_ORIGIN.ladder, 'INPUT_STRING');
    return { b, r };
  }
  const list1Head = (position: number, total: number): UiVarValue[] => [
    arr(str(' '), str(' ')), arr(str(' '), str(' '), int(ladderMedal(position, total))), arr(str(' '), str(' ')),
    arr(str('Team Six (Leader)'), str(' ')), arr(str('LADDER POSITION:'), str(String(position))), arr(str('SCORE:'), str('1234')),
    arr(str('TOTAL # OF GAMES:'), str('12')), arr(str('ROUNDS WON:'), str('7')), arr(str('ROUNDS LOST:'), str('3')),
    arr(str(' '), str(' ')), arr(str(' '), str(' ')), arr(str(' '), str(' ')), arr(str('HOMETOWN:'), str('Norfolk')),
  ];

  it('from the ladder: "Retrieving Player Info", the row\'s key asked as the account id (SVC-15, FUN_002efe50 D:L191699); the reply\'s three lists in V11\'s order with the row\'s position, its online state and TOTAL PLAYING TIME', async () => {
    const room: LadderOnlineState = { connectStatus: 2, lobbyWorldId: 4, gameWorldId: -1, lobbyName: 'Alpha', gameName: '' };
    const b = board({ size: 30, me: 18, fields: { 16: FULL }, online: { 16: room } });
    const r = rig(b, { input: '1016' });
    r.run('GetLadderInfo', LADDER_INFO_MODE.position);
    await flush();
    b.requests.length = 0;
    expect(r.run('GetPlayerInfo', PLAYER_INFO_ORIGIN.ladder, 'INPUT_STRING').answer).toBe(true);
    expect([r.value(PLAYER_INFO_VAR1), r.value(PLAYER_INFO_VAR2), r.value(PLAYER_INFO_DESCRIPTION_VAR)]).toEqual([str('Retrieving Player Info'), str(' '), str(' ')]);
    expect(b.requests).toEqual([{ op: 'player-info', body: { accountId: 1016 } }]);
    await flush();
    expect(r.value(PLAYER_INFO_NAME_VAR)).toEqual(str('#C\x80\x40\x20[SEAL] #C\x53\x48\x24p16'));
    expect(r.value(PLAYER_INFO_CHAT_NAME_VAR)).toEqual(str('p16'));
    expect(r.rows(PLAYER_INFO_VAR1)).toEqual([
      ...list1Head(16, 30),
      arr(str('ONLINE:'), str('17 min.')), arr(str('BRIEFING ROOM:'), str('Alpha')), arr(str('GAME:'), tint('In Lobby')),
    ]);
    expect(r.rows(PLAYER_INFO_VAR2)).toEqual([
      arr(str('KILLS:'), str('55')), arr(str('DEATHS:'), str('40')), arr(str('SUICIDES:'), str('5')), arr(str('BOMBS PLANTED:'), str('3')),
      arr(str('BOMBS DEFUSED:'), str('2')), arr(str('HOSTAGES RESCUED:'), str('2')), arr(str('VIPs RESCUED:'), str('1')), arr(str('VIPs KILLED:'), str('6')),
      arr(str('BONUS OBJECTIVES:'), str('4')), arr(str('HIT PERCENTAGE:'), str('23 %')), arr(str('HEAD SHOTS:'), str('9')), arr(str(' '), str(' ')),
      arr(str('TOTAL PLAYING TIME:'), str('1 : 02')),
    ]);
    expect(r.rows(PLAYER_INFO_DESCRIPTION_VAR)).toEqual([arr(str('DESCRIPTION:\n'), str('Hello there'))]);
  });

  it('the presence lines by the row\'s state: in a game its name; "Medius..." the MAIN MENU; logging in; not logged in NOT CURRENTLY LOGGED IN', async () => {
    const tail = (r: ReturnType<typeof rig>): UiVarValue[] => r.rows(PLAYER_INFO_VAR1).slice(13);
    const game = await opened({ connectStatus: 3, lobbyWorldId: 4, gameWorldId: 9, lobbyName: 'Alpha', gameName: 'Night Raid' });
    await flush();
    expect(tail(game.r)).toEqual([arr(str('ONLINE:'), str('17 min.')), arr(str('BRIEFING ROOM:'), str('Alpha')), arr(str('GAME:'), str('Night Raid'))]);
    const menu = await opened({ connectStatus: 1, lobbyWorldId: 1, gameWorldId: -1, lobbyName: 'Medius Lobby', gameName: '' });
    await flush();
    expect(tail(menu.r)).toEqual([arr(str('ONLINE:'), str('17 min.')), arr(str('BRIEFING ROOM:'), str('MAIN MENU')), arr(str('GAME:'), str('Logging In'))]);
    const off = await opened(OFFLINE);
    await flush();
    expect(tail(off.r)).toEqual([arr(str('NOT CURRENTLY LOGGED IN\n'), str(' '))]);
  });

  it('a player not on the page\'s rows (FUN_002ebc20 looks in 0x44f7b0 only): no entry -- NOT CURRENTLY LOGGED IN and the record\'s own +0x08', async () => {
    const b = board({ size: 30, me: 20, fields: { 16: FULL }, online: { 16: { connectStatus: 2, lobbyWorldId: 4, gameWorldId: -1, lobbyName: 'Alpha', gameName: '' } } });
    const r = rig(b, { input: '1016' });
    r.run('GetLadderInfo', LADDER_INFO_MODE.position);
    await flush();
    expect(r.c.state().rest.map((x) => x.position)[0]).toBe(18);
    r.run('GetPlayerInfo', PLAYER_INFO_ORIGIN.ladder, 'INPUT_STRING');
    await flush();
    expect(r.rows(PLAYER_INFO_VAR1).slice(4, 5).concat(r.rows(PLAYER_INFO_VAR1).slice(13))).toEqual([arr(str('LADDER POSITION:'), str('16')), arr(str('NOT CURRENTLY LOGGED IN\n'), str(' '))]);
  });

  it('not found (any status but Success): "Could not retrieve player information." and the two others blank (D:L192140-192143)', async () => {
    const { r } = await opened(OFFLINE, { text: 'nobody' });
    await flush();
    expect([r.value(PLAYER_INFO_VAR1), r.value(PLAYER_INFO_VAR2), r.value(PLAYER_INFO_DESCRIPTION_VAR)]).toEqual([str('Could not retrieve player information.'), str(' '), str(' ')]);
    expect(r.value(PLAYER_INFO_NAME_VAR)).toBeUndefined();
  });

  it('another origin (BRIEFING) with no room list handed in: asked by the account id strtol reads; no entry, so state 0 and the record\'s own +0x08', async () => {
    const { b, r } = await opened({ connectStatus: 2, lobbyWorldId: 4, gameWorldId: -1, lobbyName: 'Alpha', gameName: '' }, { origin: PLAYER_INFO_ORIGIN.briefing, text: '1016' });
    expect(b.requests).toEqual([{ op: 'player-info', body: { accountId: 1016 } }]);
    await flush();
    expect(r.rows(PLAYER_INFO_VAR1)).toEqual([...list1Head(16, 30), arr(str('NOT CURRENTLY LOGGED IN\n'), str(' '))]);
  });

  it('SVC-15: the BRIEFING origin\'s presence lines from the room\'s player list (FUN_002e3610 by the reply\'s name, D:L191891-191929): its online state whole, the position the record\'s own +0x08; none in it, NOT CURRENTLY LOGGED IN', async () => {
    const seen: string[] = [];
    const game: LadderOnlineState = { connectStatus: 3, lobbyWorldId: 1, gameWorldId: 9, lobbyName: 'Alpha', gameName: 'Night Raid' };
    const roomState = (name: string): LadderOnlineState | null => { seen.push(name); return name === 'p16' ? game : null; };
    const { r } = await opened(OFFLINE, { origin: PLAYER_INFO_ORIGIN.briefing, text: '1016', roomState });
    await flush();
    expect(seen).toEqual(['p16']);
    expect(r.rows(PLAYER_INFO_VAR1)).toEqual([...list1Head(16, 30),
      arr(str('ONLINE:'), str('17 min.')), arr(str('BRIEFING ROOM:'), str('Alpha')), arr(str('GAME:'), str('Night Raid'))]);
    const none = await opened(OFFLINE, { origin: PLAYER_INFO_ORIGIN.briefing, text: '1016', roomState: () => null });
    await flush();
    expect(none.r.rows(PLAYER_INFO_VAR1).slice(13)).toEqual([arr(str('NOT CURRENTLY LOGGED IN\n'), str(' '))]);
    // the CLAN origin never reads the room's list (D:L191825-191857 is its own branch)
    const clan = await opened(OFFLINE, { origin: PLAYER_INFO_ORIGIN.clan, text: '1016', roomState });
    await flush();
    expect(clan.r.rows(PLAYER_INFO_VAR1).slice(13)).toEqual([arr(str('NOT CURRENTLY LOGGED IN\n'), str(' '))]);
  });

  it('PLAYER-INFO-CLAN: the CLAN origin\'s presence lines and position from the clan\'s roster (FUN_002e9460 on 0x44f740 by the reply\'s name, D:L191827): its online state whole (D:L191830-191854) and its +0x1d0 in place of the record\'s +0x08 (D:L191855); a name not on it, NOT CURRENTLY LOGGED IN and +0x08', async () => {
    const seen: string[] = [];
    const game: LadderOnlineState = { connectStatus: 3, lobbyWorldId: 1, gameWorldId: 9, lobbyName: 'Alpha', gameName: 'Night Raid' };
    const clanState = (name: string): ClanRosterPresence | null => { seen.push(name); return name === 'p16' ? { online: game, ladderPosition: 7 } : null; };
    const { r } = await opened(OFFLINE, { origin: PLAYER_INFO_ORIGIN.clan, text: '1016', clanState });
    await flush();
    expect(seen).toEqual(['p16']);
    expect(r.rows(PLAYER_INFO_VAR1)).toEqual([...list1Head(7, 30),
      arr(str('ONLINE:'), str('17 min.')), arr(str('BRIEFING ROOM:'), str('Alpha')), arr(str('GAME:'), str('Night Raid'))]);
    // not on the roster: no entry -- state 0 and the record's own +0x08
    const none = await opened(OFFLINE, { origin: PLAYER_INFO_ORIGIN.clan, text: '1016', clanState: () => null });
    await flush();
    expect(none.r.rows(PLAYER_INFO_VAR1)).toEqual([...list1Head(16, 30), arr(str('NOT CURRENTLY LOGGED IN\n'), str(' '))]);
    // the other origins never read the roster
    seen.length = 0;
    for (const origin of [PLAYER_INFO_ORIGIN.briefing, PLAYER_INFO_ORIGIN.friend, PLAYER_INFO_ORIGIN.ladder]) await opened(OFFLINE, { origin, text: '1016', clanState });
    await flush();
    expect(seen).toEqual([]);
    // every origin's list held now: the placeholder retired
    expect(Object.keys(ladderLobby).filter((k) => k.startsWith('PLAYER_INFO_ORIGIN_LISTS'))).toEqual([]);
  });

  it('the record (PLAYER_INFO_RECORD_VERSION_READING): an E record read at its offsets; another first byte, or none, the default (the rating 1000)', () => {
    expect(readPlayerRecord(recordHex({ ...FULL, position: 8 }))).toMatchObject({ rating: 1234, ladderPosition: 8, games: 12, bonusObjectives: 4, hitPercent: 23, clanLeader: true, clanTag: 'SEAL', secondsPlayed: 3725 });
    expect(readPlayerRecord(recordHex({ ...FULL, version: 0x44 }))).toMatchObject({ rating: 1000, kills: 0, clanTag: '', description: '' });
    expect(readPlayerRecord('').rating).toBe(1000);
    expect(PLAYER_INFO_RECORD_VERSION_READING).toMatch(/1000/);
  });
});

// ---- the page over the machine ----

type Rig = ReturnType<typeof worldRig>;
const go = (r: Rig, name: string): void => { for (let i = 0; i < 12 && r.focused() !== name; i++) r.press('DOWN', 6); expect(r.focused()).toBe(name); };
const loc = (r: Rig, id: number): string => r.loc.byId.get(id)!.trim();
const listbox = (r: Rig, name: string): ListboxWidget => r.parts.current!.widgets.get(name) as ListboxWidget;
const items = (r: Rig, name: string): string[][] => listbox(r, name).items.map((i) => i.captions);
const textures = (r: Rig, name: string, col: number): (string | null)[] => listbox(r, name).items.map((i) => i.images?.[col]?.texture ?? null);
const popupText = (r: Rig): string => (r.parts.current?.popup()?.popup.text.lines ?? []).map((l) => new TextDecoder('latin1').decode(Uint8Array.from(l.bytes)).trim()).join(' ');
const sounds = (r: Rig, from: number): string[] => r.sound.log.slice(from).filter((s) => s.startsWith('SOUND')).map((s) => /"sound":"([^"]+)"/.exec(s)![1]!);
const quiet = (calls: string[]): string[] => calls.filter((c) => !/^HasClanInvitations|^invitations\.op1|^DisableButton\(invitations\)|^EnableButton\(invitations\)/.test(c));
const MEDALS = ['null.tif', 'Medal_Blue.tif', 'Medal_Bronze.tif', 'Medal_Silver.tif', 'Medal_Gold.tif', 'Medal_Black.tif'];
const PLAYER_NOT_FOUND_TEXT = 'The message cannot be sent because that player is not currently logged in.';

/** A whisper's FindPlayer that finds no one (ONL-23's `SendMediusChat`, `FUN_002f4a20` D:L194614-194619). */
function chat(r: { requests: unknown[] }): LobbyChatService {
  return {
    findPlayer: (q) => { r.requests.push(q); return Promise.resolve({ status: -998, accountId: 0, accountName: q.name }); },
    chat: () => Promise.resolve(), chatLines: () => Promise.resolve([]),
  };
}

/** SOCOM II ONLINE past SERVER NEWS, the PLAYER RANKING row's CROSS, run to the page's build. */
async function rankingPage(b: ReturnType<typeof board>, o: { keyboard?: boolean; whispers?: unknown[] } = {}) {
  const r = worldRig({
    name: ME, announcement: '', ladder: b.service, keyboard: o.keyboard,
    register: (host, ctx) => {
      if (o.whispers) new BriefingRoomChat({ uiVars: ctx.uiVars, lobby: { up: true, state: () => 11, account: () => ME }, service: chat({ requests: o.whispers }), rooms: () => [], event: (k) => { ctx.event(k); } }).register(host);
    },
  });
  await r.settle(SETTLED);
  r.press('CROSS', 10);
  go(r, 'ranking');
  r.press('CROSS', 2);
  for (let i = 0; i < 120 && r.current() !== LADDER_LOBBY; i++) await r.settle(1);
  await r.settle(SETTLED);
  return r;
}

describe.skipIf(!HAVE)(`SOCOM II ONLINE's top ten and PLAYER RANKING over the machine${HAVE ? '' : ' (no disc and no fixtures)'}`, () => {
  it('the menu\'s ONSTART (get_ladder_top_10, modes 1 and 7): my position and THE PODIUM; the PLAYER RANKING row\'s pane shows LadderTop10 under #765; DisplayMedalOfMerit on ON_LADDER_REFRESH', async () => {
    const b = board({ size: 5, me: 3, tags: { 2: 'SEAL' } });
    const r = worldRig({ name: ME, announcement: '', ladder: b.service });
    await r.settle(SETTLED);
    expect(r.calls(WORLD).filter((c) => c.startsWith('GetLadderInfo'))).toEqual(['GetLadderInfo(NA) table', 'GetLadderInfo(NA) table']);
    expect(b.requests).toEqual([{ op: 'position', body: {} }, { op: 'list', body: { ladderStatIndex: 0, sortOrder: 1, startPosition: 1, pageSize: 10 } }]);
    // DisplayMedalOfMerit as built today: the runtime's IF / SHOW over LadderMedalOfMerit -- a ladder under 12, the star.
    expect(['Medal_Blue', 'Medal_Bronze', 'Medal_Silver', 'Medal_Gold', 'Medal_Black'].map((n) => r.node(n)!.visible)).toEqual([false, false, false, false, true]);
    r.press('CROSS', 10);
    go(r, 'ranking');
    expect(r.text('DescriptionText')).toEqual([loc(r, 788)]);
    expect([r.node('LadderTop10')!.visible, r.node('TopTenText')!.visible, r.text('TopTenText')]).toEqual([true, true, [loc(r, 765)]]);
    expect(items(r, 'LadderTop10')).toEqual([['1', 'p01', ''], ['2', 'p02', '[SEAL]'], ['3', ME, ''], ['4', 'p04', ''], ['5', 'p05', '']]);
    expect(listbox(r, 'LadderTop10').spec.columns.map((c) => c.position)).toEqual([20, 130, 65]);
  });

  it('with no position answered (an empty board) no medal shows; a ladder of 30 with me 20th shows the Ensign\'s', async () => {
    const empty = worldRig({ name: ME, announcement: '' });
    await empty.settle(SETTLED);
    expect(['Medal_Blue', 'Medal_Black'].map((n) => empty.node(n)!.visible)).toEqual([false, false]);
    const r = worldRig({ name: ME, announcement: '', ladder: board({ size: 30, me: 20 }).service });
    await r.settle(SETTLED);
    expect(['Medal_Blue', 'Medal_Bronze', 'Medal_Silver', 'Medal_Gold', 'Medal_Black'].map((n) => r.node(n)!.visible)).toEqual([true, false, false, false, false]);
  });

  it('PLAYER RANKING\'s CROSS (Goto_Ladder, unparked) switches to dlgLadderLobby.rdr; CLAN RANKING\'s (unparked by ONL-30) to dlgClanLadderLobby.rdr', async () => {
    const clan = worldRig({ name: ME, announcement: '' });
    await clan.settle(SETTLED);
    clan.press('CROSS', 10);
    go(clan, 'Clanranking');
    const at = clan.outcomes.length;
    clan.press('CROSS', 2);
    for (let i = 0; i < 120 && clan.builds.at(-1) !== CLAN_LADDER_LOBBY; i++) await clan.settle(1);
    expect([quiet(clan.calls(WORLD, at)), clan.builds]).toEqual([['SwitchMenu(dlgClanLadderLobby.rdr) table'], [WORLD, CLAN_LADDER_LOBBY]]);
    const r = worldRig({ name: ME, announcement: '' });
    await r.settle(SETTLED);
    r.press('CROSS', 10);
    go(r, 'ranking');
    const from = r.outcomes.length;
    r.press('CROSS', 2);
    for (let i = 0; i < 120 && r.builds.at(-1) !== LADDER_LOBBY; i++) await r.settle(1);
    expect(quiet(r.calls(WORLD, from))).toEqual(['SwitchMenu(dlgLadderLobby.rdr) table']);
    expect([r.builds, r.valve('StartMusic')]).toEqual([[WORLD, LADDER_LOBBY], 1]);
  });

  it('ONSTART: ClearUIVar(LADDER_LEADERS), GetLadderInfo, DisableButton(LadderTop10); the record\'s captions, the legend\'s, and both lists\' columns', async () => {
    const b = board({ size: 30, me: 20 });
    const r = await rankingPage(b);
    expect(quiet(r.calls(LADDER_LOBBY)).slice(0, 3)).toEqual(['ClearUIVar(LADDER_LEADERS) table', 'GetLadderInfo(NA) table', 'DisableButton(LadderTop10) table']);
    expect(b.requests.slice(2).map((q) => q.body)).toEqual([{}, { ladderStatIndex: 0, sortOrder: 1, startPosition: 1, pageSize: 10 }, { ladderStatIndex: 0, sortOrder: 1, startPosition: 18, pageSize: 14 }]);
    expect([r.text('bar_title'), r.text('TopTen_text'), r.text('player_text_rt'), r.text('desc_low_text')]).toEqual([[loc(r, 396)], [loc(r, 151)], [loc(r, 398)], [loc(r, 395)]]);
    expect(['rank_text', 'rank_desc_text', 'admiral_text', 'captain_text', 'commander_text', 'lieutenant_text', 'ensign_text', 'adm_text_desc', 'capt_text_desc', 'comm_text_desc', 'lieut_text_desc', 'ensign_text_desc'].map((n) => r.text(n)[0])).toEqual([
      'RANK', 'RANK INSIGNIA', 'ADMIRAL', 'CAPTAIN', 'LT. COMMANDER', 'LIEUTENANT', 'ENSIGN', 'TOP 10 PLAYERS', 'TOP 5%', 'NEXT 5-30%', 'NEXT 30-85%', 'LOWEST 15%',
    ]);
    expect(listbox(r, 'LadderTop10').spec.columns.map((c) => c.position)).toEqual([10, 90, 35]);
    expect(listbox(r, 'LadderList').spec.columns.map((c) => c.position)).toEqual([-600, 130, 47, 20, 80]);
    expect(listbox(r, 'LadderList').spec.columns[3]!.textures).toEqual(MEDALS);
    expect(r.node('pop_missionBack')!.visible).toBe(false);
  });

  it('the foot\'s medal (ActivateMedalOfMerit: Medal_Blue .. Medal_Black) shows my one; the RANK INSIGNIA legend\'s five (medal_blue .. medal_black) all stay (FUN_00315d00 strcmp)', async () => {
    const r = await rankingPage(board({ size: 30, me: 20 }));           // the 20th of 30: the Ensign's, Medal_Blue
    expect(r.valve(LADDER_MEDAL_VALVE)).toBe(1);
    expect(['Medal_Blue', 'Medal_Bronze', 'Medal_Silver', 'Medal_Gold', 'Medal_Black'].map((n) => r.node(n)!.visible)).toEqual([true, false, false, false, false]);
    expect(['medal_blue', 'medal_bronze', 'medal_silver', 'medal_gold', 'medal_black'].map((n) => r.node(n)!.visible)).toEqual([true, true, true, true, true]);
  });

  it('THE PODIUM\'s ten; the fourteen rows from my position less 2, each medal FUN_002eaee0 of its position, my row tinted', async () => {
    const r = await rankingPage(board({ size: 40, me: 20, tags: { 20: 'ME' } }));
    expect(items(r, 'LadderTop10')).toEqual(Array.from({ length: 10 }, (_, i) => [String(i + 1), `p${String(i + 1).padStart(2, '0')}`, '']));
    const rows = items(r, 'LadderList');
    expect(rows.map((c) => c[2])).toEqual(Array.from({ length: 14 }, (_, i) => String(18 + i)));
    expect(rows[2]).toEqual(['1020', ME, '20', '', '[ME]']);   // SVC-15: the key cell the account id (drawn nowhere, column -600)
    expect(textures(r, 'LadderList', 3)).toEqual(Array.from({ length: 14 }, (_, i) => MEDALS[ladderMedal(18 + i, 40)]!));
    const colors = listbox(r, 'LadderList').items.map((i) => i.colors);
    expect(colors[2]).toEqual([null, [91, 72, 36], [91, 72, 36], null, [91, 72, 36]]);
    expect(colors[0]).toEqual([null, null, null, null, null]);
  });

  it('L2 the next fourteen, L1 back (ladder_down / ladder_up); RefreshArrows shows each arrow while that way pages', async () => {
    const b = board({ size: 40, me: 3 });
    const r = await rankingPage(b);
    const firstOf = (): string => items(r, 'LadderList')[0]![2]!;
    expect([firstOf(), r.node('arrow_up')!.visible, r.node('arrow_dwn')!.visible]).toEqual(['1', false, true]);
    r.press('TRIGGER_L2' as never, 2);
    await r.settle(40);
    expect([firstOf(), r.node('arrow_up')!.visible, r.node('arrow_dwn')!.visible]).toEqual(['15', true, true]);
    r.press('TRIGGER_L2' as never, 2);
    await r.settle(40);
    expect([firstOf(), items(r, 'LadderList').length, r.node('arrow_up')!.visible, r.node('arrow_dwn')!.visible]).toEqual(['29', 12, true, false]);
    r.press('TRIGGER_L1' as never, 2);
    await r.settle(40);
    expect([firstOf(), r.node('arrow_up')!.visible]).toEqual(['15', true]);
  });

  it('CROSS on a row: PLAYER INFO shown over the page -- the row\'s key asked, the two lists and the description; TRIANGLE hides it and gives the list back', async () => {
    const b = board({ size: 30, me: 20, fields: { 18: { rating: 1500, hometown: 'Norfolk', description: 'Hi', seconds: 7260, kills: 3 } } });
    const r = await rankingPage(b);
    b.requests.length = 0;
    expect(r.focused()).toBe('LadderList');
    const from = r.outcomes.length;
    r.press('CROSS', 4);
    await r.settle(20);
    expect(quiet(r.calls(LADDER_LOBBY, from)).filter((c) => /GetPlayerInfo|ClearUIVar/.test(c))).toEqual([
      'ClearUIVar(PLAYER_INFO_NAME_VAR) table', 'ClearUIVar(PLAYER_INFO_CHAT_NAME_VAR) table', 'ClearUIVar(PLAYER_INFO_VAR1) table', 'ClearUIVar(PLAYER_INFO_VAR2) table',
      'ClearUIVar(PLAYER_INFO_DESCRIPTION) table', 'GetPlayerInfo(INPUT_STRING) table',
    ]);
    expect(b.requests).toEqual([{ op: 'player-info', body: { accountId: 1018 } }]);   // SVC-15: the row's key, the account id, as the original's
    expect([r.node('pop_missionBack')!.visible, r.focused()]).toEqual([true, 'playerinfo_ctl_desc']);
    const l1 = items(r, 'playerinfo_list1');
    expect(l1.map((c) => c[0])).toEqual([' ', ' ', ' ', ' ', 'LADDER POSITION:', 'SCORE:', 'TOTAL # OF GAMES:', 'ROUNDS WON:', 'ROUNDS LOST:', ' ', ' ', ' ', 'HOMETOWN:', 'NOT CURRENTLY LOGGED IN\n']);
    expect([l1[4]![1], l1[5]![1], l1[12]![1]]).toEqual(['18', '1500', 'Norfolk']);
    expect(textures(r, 'playerinfo_list1', 2)[1]).toBe(MEDALS[ladderMedal(18, 30)]);
    expect(listbox(r, 'playerinfo_list1').spec.columns.map((c) => c.position)).toEqual([0, 130, 0]);
    const l2 = items(r, 'playerinfo_list2');
    expect([l2[0], l2.at(-1)]).toEqual([['KILLS:', '3'], ['TOTAL PLAYING TIME:', '2 : 01']]);
    expect(r.uiVars.find(PLAYER_INFO_NAME_VAR)!.value).toEqual(str('p18'));
    r.press('TRIANGLE', 6);
    expect([r.node('pop_missionBack')!.visible, r.focused(), r.current()]).toEqual([false, 'LadderList', LADDER_LOBBY]);
  });

  it('PLAYER INFO\'s R1: the whisper keyboard on CHATMESSAGE; a player not found raises MP_PLAYER_NOT_FOUND -- PlayerNotFound\'s literal text with #226', async () => {
    const whispers: unknown[] = [];
    const r = await rankingPage(board({ size: 30, me: 20 }), { keyboard: true, whispers });
    r.press('CROSS', 4);
    await r.settle(20);
    r.press('TRIGGER_R1' as never, 6);
    expect([r.skb!.keyboard.isOpen, r.skb!.keyboard.request?.uiVar, r.valve('KeyboardPurpose')]).toEqual([true, 'CHATMESSAGE', 99]);
    r.type('hello');
    await r.settle(10);
    expect(whispers).toEqual([{ name: 'p18' }]);
    expect([r.shown(), popupText(r)]).toEqual([true, PLAYER_NOT_FOUND_TEXT]);
    expect(loc(r, 226)).toBe('CONTINUE');
    r.press('CROSS', 10);
    expect([r.shown(), r.valve('SitAndSpin')]).toEqual([false, 1]);
  });

  it('the way back: TRIANGLE runs goto_menu(PREVIOUS_SCREEN) with SND_DINK, to SOCOM II ONLINE', async () => {
    const r = await rankingPage(board({ size: 5, me: 1 }));
    const sound = r.sound.log.length;
    r.press('TRIANGLE', 6);
    for (let i = 0; i < 120 && r.current() !== WORLD; i++) await r.settle(1);
    expect([r.current(), sounds(r, sound)]).toEqual([WORLD, ['SND_DINK']]);
  });
});
