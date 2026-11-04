import { describe, expect, it } from 'vitest';
import { UI_COMMAND_TABLE, UiCommandHost, uiCommandRowByName } from '../../src/uiCommands';
import { UiVarManager, type UiVarValue } from '../../src/uiVars';
import { ValveStore, VALVE_TYPE } from '../../src/valves';
import type { ZAnimUiCommand } from '../../src/zanimRuntime';
import { printUiVar } from '../../src/widgets/host';
import {
  LOBBY_DISCONNECT_READING, SERVER_LIST_VAR, SERVER_NAME_VAR, SERVER_NEWS_SEPARATOR, SERVER_NEWS_VAR, UNIVERSE_COMMAND_ROWS,
  UNIVERSE_QUERY, UniverseCommands, UniverseList, type UniverseEntry, type UniverseReply, type UniverseService,
} from '../../src/screens/universeCommands';

/**
 * ONL-04: SELECT UNIVERSE's data (web research 147). The universe query GetServerList's worker sends
 * (`FUN_002fb340` D:L198714-198748), the two reply handlers that fill the client's lists (`FUN_002fdaf0`
 * D:L199955-200104, the LobbyExt 0x04 entries and SERVER_LIST; `FUN_002fded0` D:L200125-200144, the news), and the two
 * rows SELECT UNIVERSE's set dispatches that the table declares for ONL-04: UpdateServerInfo `FUN_00274c00`
 * (D:L121558-121596: SERVER_NEWS and SERVER_NAME) and LobbyDisconnect `FUN_00274d60` (D:L121599-121614). Synthetic
 * replies over a fake service; nothing measured on the original running.
 */

const cmd = (fn: string, arg = 'NA', anim = 'ChangeServerFocus'): ZAnimUiCommand =>
  ({ anim, sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg, loc: 0, bytes: new Uint8Array(0x10) });

const entry = (over: Partial<UniverseEntry> = {}): UniverseEntry => ({
  status: 0, name: 'SOCOM II Local', dns: '', port: 0, description: 'Local universe', universeStatus: 1, userCount: 0, maxUsers: 256,
  billing: '', billingName: '', extendedInfo: '', endOfList: true, ...over,
});
const news = (text: string, endOfList = true) => ({ status: 0, news: text, endOfList });

/** A service that answers at once (`now`) or when `answer` is called, recording each query. */
function fakeService(reply: UniverseReply | null, now = true) {
  const queries: unknown[] = [];
  let resolve!: (r: UniverseReply) => void;
  const service: UniverseService = {
    query: (q) => {
      queries.push(q);
      if (now && reply) return Promise.resolve(reply);
      return new Promise<UniverseReply>((r) => { resolve = r; });
    },
  };
  return { service, queries, answer: (r: UniverseReply) => resolve(r) };
}
const flush = () => new Promise<void>((r) => setTimeout(r, 0));
const str = (s: string): UiVarValue => ({ type: 'string', value: s });
const int = (n: number): UiVarValue => ({ type: 'int', value: n });

describe('the rows (W9.R4: PLAT-08\'s host is a registry; no table edit)', () => {
  it('names the two rows the table declares for ONL-04, each at its index, id and function', () => {
    expect(UNIVERSE_COMMAND_ROWS.map((r) => `${r.row} ${r.name}`)).toEqual(['152 LobbyDisconnect', '154 UpdateServerInfo']);
    for (const r of UNIVERSE_COMMAND_ROWS) {
      const t = uiCommandRowByName(r.name)!;
      expect([t.index, t.id, t.fn]).toEqual([r.row, r.id, r.fn]);
      expect(UI_COMMAND_TABLE[r.row]!.name).toBe(r.name);
      expect(t.task, r.name).toBe('ONL-04');
    }
  });
});

describe('the universe query (FUN_002fb340 phase 0) and its two halves', () => {
  it('sends InfoType 3, encoding 2, language 1 and ends only when both the entries and the news have ended', async () => {
    const uiVars = new UiVarManager();
    const list = new UniverseList({ uiVars });
    const f = fakeService(null, false);
    const job = list.job(f.service);
    expect(f.queries).toEqual([UNIVERSE_QUERY]);
    expect(UNIVERSE_QUERY).toEqual({ infoType: 3, characterEncoding: 2, language: 1 });
    expect(job.poll()).toBe(false);
    f.answer({ universes: [entry()], news: [news('Welcome.')] });
    await flush();
    expect(job.poll()).toBe(true);
    expect(job.result).toBe(1);                                      // phase 1 writes 1 into the worker's valve (D:L198727-198734)
  });

  it('an entry with a non-success status ends the list without a row (FUN_002f42d0: status == 0)', () => {
    const uiVars = new UiVarManager();
    const list = new UniverseList({ uiVars });
    list.entry(entry({ status: 1, name: '' }));
    expect(list.entriesEnded).toBe(true);
    expect(list.count).toBe(0);
    expect(uiVars.find(SERVER_LIST_VAR)).toBeUndefined();            // SERVER_LIST is written only on a success's EndOfList
  });

  it('SERVER_LIST: one row per entry -- the name, status word == 0, users, max users -- written at the list\'s end (D:L200083-200101)', () => {
    const uiVars = new UiVarManager();
    const list = new UniverseList({ uiVars });
    list.entry(entry({ name: 'A', universeStatus: 1, userCount: 3, maxUsers: 256, endOfList: false }));
    expect(uiVars.find(SERVER_LIST_VAR)).toBeUndefined();
    list.entry(entry({ name: 'B', universeStatus: 0, userCount: 0, maxUsers: 100, endOfList: true }));
    const v = uiVars.find(SERVER_LIST_VAR)!;
    expect(v.longevity).toBe(1);
    expect(v.value).toEqual({ type: 'array', value: [
      { type: 'array', value: [str('A'), int(0), int(3), int(256)] },
      { type: 'array', value: [str('B'), int(1), int(0), int(100)] },
    ] });
  });

  it('a second query clears the entries (FUN_002fff90) but not the news, which the original never clears', async () => {
    const uiVars = new UiVarManager();
    const list = new UniverseList({ uiVars });
    const f = fakeService({ universes: [entry()], news: [news('One.')] });
    list.job(f.service);
    await flush();
    list.job(f.service);
    await flush();
    expect(list.count).toBe(1);
    expect(list.newsCount).toBe(2);
  });

  it('a service that never answers leaves the worker running (the 90-s watchdog is the screen\'s)', async () => {
    const list = new UniverseList({ uiVars: new UiVarManager() });
    const job = list.job({ query: () => Promise.reject(new Error('unreachable')) });
    await flush();
    for (let i = 0; i < 5; i++) expect(job.poll()).toBe(false);
  });
});

describe('UpdateServerInfo (FUN_00274c00) and LobbyDisconnect (FUN_00274d60)', () => {
  function setup(reply: UniverseReply) {
    const uiVars = new UiVarManager();
    const valves = new ValveStore();
    const list = new UniverseList({ uiVars });
    for (const e of reply.universes) list.entry(e);
    for (const n of reply.news) list.newsChunk(n);
    const disconnects: number[] = [];
    const commands = new UniverseCommands({ valves: () => valves, uiVars, list, lobbyDisconnect: () => { disconnects.push(1); } });
    const host = new UiCommandHost({});
    commands.register(host);
    return { uiVars, valves, list, host, disconnects, run: (fn: string, arg = 'NA') => host.dispatch(cmd(fn, arg)) };
  }

  it('SERVER_NEWS is the selected universe\'s description, a blank line and every news chunk; SERVER_NAME its name', () => {
    const s = setup({ universes: [entry({ name: 'U0', description: 'D0', endOfList: false }), entry({ name: 'U1', description: 'D1' })], news: [news('N0', false), news('N1')] });
    s.valves.set('SELECTED_SERVER', 1, VALVE_TYPE.TEMP);
    const o = s.run('UpdateServerInfo', 'SELECTED_SERVER');
    expect(o.kind).toBe('table');
    expect(o.answer).toBe(true);
    expect(SERVER_NEWS_SEPARATOR).toBe('\n\n');
    expect(s.uiVars.find(SERVER_NEWS_VAR)!.value).toEqual({ type: 'array', value: [str('D1'), str('\n\n'), str('N0'), str('N1')] });
    expect(s.uiVars.find(SERVER_NAME_VAR)!.value).toEqual(str('U1'));
    expect(s.uiVars.find(SERVER_NEWS_VAR)!.longevity).toBe(1);
  });

  it('an index past the list reads the empty string (FUN_002fda50 / FUN_002fdaa0: DAT_003f5de0)', () => {
    const s = setup({ universes: [entry()], news: [] });
    s.valves.set('SELECTED_SERVER', 4, VALVE_TYPE.TEMP);
    s.run('UpdateServerInfo', 'SELECTED_SERVER');
    expect(s.uiVars.find(SERVER_NEWS_VAR)!.value).toEqual({ type: 'array', value: [str(''), str('\n\n')] });
    expect(s.uiVars.find(SERVER_NAME_VAR)!.value).toEqual(str(''));
  });

  it('acquires the argument\'s valve TEMP (an absent one reads 0: the first universe)', () => {
    const s = setup({ universes: [entry({ name: 'First' })], news: [] });
    s.run('UpdateServerInfo', 'SELECTED_SERVER');
    expect(s.valves.find('SELECTED_SERVER')).toMatchObject({ value: 0 });
    expect(s.uiVars.find(SERVER_NAME_VAR)!.value).toEqual(str('First'));
  });

  it('LobbyDisconnect answers 1 and tells the page\'s lobby (none is connected before ONL-07\'s LobbyConnect)', () => {
    const s = setup({ universes: [], news: [] });
    expect(s.run('LobbyDisconnect').answer).toBe(true);
    expect(s.disconnects).toEqual([1]);
    expect(LOBBY_DISCONNECT_READING).toBeTruthy();
  });
});

describe('SERVER_NEWS printed into its WRAPPEDTEXT (FUN_003860f0 over an array, FUN_00379260\'s 0x2903-byte buffer)', () => {
  it('prints the elements in turn; a string only when its length + 2 fits what is left', () => {
    const news: UiVarValue = { type: 'array', value: [str('Desc'), str('\n\n'), str('News')] };
    expect(printUiVar(news, 0x2903)).toBe('Desc\n\nNews');
    expect(printUiVar(news, 9)).toBe('Desc\n\n');                    // 'News' needs 4 + 2 < 9 - 6: refused, nothing written
    expect(printUiVar({ type: 'array', value: [int(12), str('x')] }, 0x2903)).toBe('12x');
    expect(printUiVar(news, 5)).toBe('');                           // an array needs more than 5 bytes left
  });
});
