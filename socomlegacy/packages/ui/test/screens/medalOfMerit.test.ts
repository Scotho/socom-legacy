import { describe, expect, it } from 'vitest';
import { UiCommandHost } from '../../src/uiCommands';
import { UiVarManager, type UiVarValue } from '../../src/uiVars';
import { ValveStore } from '../../src/valves';
import type { ZAnimUiCommand } from '../../src/zanimRuntime';
import { IGNORE_LIST } from '../../src/screens/ignoreListCommands';
import {
  GameLobbyCommands, LOBBY_MEDAL_TOLD_READING, SEAL_LIST_VAR, TERRORIST_LIST_VAR, type GameLobbySeat, type GameLobbyView,
} from '../../src/screens/gameLobbyCommands';
import {
  LADDER_MEDAL_VALVE, LADDER_RANKING_VAR, LadderLobbyCommands, ladderMedal, rankingRows, type LadderListEntry, type LadderOnlineState, type LadderService,
} from '../../src/screens/ladderLobbyCommands';
import { HAVE, WORLD, worldRig } from './worldOfSocomRig';

/**
 * ONL-34 (web research 269 §4; W18.R7): the medal of merit.
 * - Beside the persona's name: SOCOM II ONLINE's own `DisplayMedalOfMerit` (its set; bound to ON_LADDER_REFRESH, which
 *   mode 1's reply raises, `FUN_002eb010` D:L189047) and `UIanim.rdr`'s `ActivateMedalOfMerit` (the fifteen ONSTART
 *   dialogs; IGNORE here) -- both IF / ELSEIF `LadderMedalOfMerit == 1..5` (the valve test's op 2, `FUN_00353fd0`
 *   D:L252188-252189) SHOW `Medal_Blue` .. `Medal_Black`; `ActivateMedalOfMerit` HIDEs the five first. The ops off the
 *   disc are `tools/test/medalOfMeritDisc.test.ts`'s; here they run on the machine over a seeded ladder (or the
 *   committed fixtures) for each medal 0-5.
 * - In the game lobby's two lists (`B_SEALLIST`, `B_REDLIST`, the second column `null.tif`, `Medal_Blue.tif` ..
 *   `Medal_Black.tif`): each seat's medal from SEAT-TOLD's record (`LOBBY_MEDAL_TOLD_READING`), never the page's own
 *   arithmetic -- replaced whole by each event, so after a round the lists carry the new medals.
 * - ONL-30a's owed test (its review's F3): a ranking row whose name differs from the session's only in case is not
 *   tinted -- `FUN_002eb900`'s compare is `FUN_00198f18` (D:L189399), a strcmp (D:L15847-15859), case kept.
 * Synthetic ladders and seats; nothing measured on the original running (the star's place and size against
 * `A_45_lobby2.png` / `A_54_gamelobby2.png` is the proven level, owed to a browser window: the plan's gate item 5).
 */

const SETTLED = 60;
const NODES = ['Medal_Blue', 'Medal_Bronze', 'Medal_Silver', 'Medal_Gold', 'Medal_Black'] as const;
const MEDALS = ['null.tif', 'Medal_Blue.tif', 'Medal_Bronze.tif', 'Medal_Silver.tif', 'Medal_Gold.tif', 'Medal_Black.tif'];
const OFFLINE: LadderOnlineState = { connectStatus: 0, lobbyWorldId: 0, gameWorldId: 0, lobbyName: '', gameName: '' };
const NO_ROW: LadderListEntry = { status: 1, ladderPosition: 0, accountId: 0, accountName: '', stats: '', onlineState: OFFLINE, endOfList: true };
const never = <T>(): Promise<T> => new Promise<T>(() => {});

/** A board that answers my position (0: NoResult, nothing answered) and no page. */
function ladder(position: number, total: number): LadderService {
  return {
    position: () => Promise.resolve(position > 0 ? { status: 0, ladderPosition: position, totalRankings: total } : { status: 1, ladderPosition: 0, totalRankings: 0 }),
    list: () => Promise.resolve([NO_ROW]),
    playerInfo: never,
  };
}

/** One seeded ladder for each medal 0-5 (`FUN_002eaee0` D:L188934-188970; research 155 §2.3's bands). */
const SEEDS: readonly { medal: number; position: number; total: number }[] = [
  { medal: 0, position: 0, total: 0 },      // no answer: the valve as seeded, 0
  { medal: 1, position: 20, total: 30 },    // 20000 / 20 = 1000: the Ensign's
  { medal: 2, position: 12, total: 30 },    // 12000 / 20 = 600, under 851
  { medal: 3, position: 11, total: 100 },   // 11000 / 90 = 122, under 301
  { medal: 4, position: 11, total: 300 },   // 11000 / 290 = 37, under 51
  { medal: 5, position: 3, total: 5 },      // a ladder under 12: the Admiral's star for all
];

type Rig = ReturnType<typeof worldRig>;
const go = (r: Rig, name: string): void => { for (let i = 0; i < 12 && r.focused() !== name; i++) r.press('DOWN', 6); expect(r.focused()).toBe(name); };
const shown = (r: Rig): string[] => NODES.filter((n) => r.node(n)!.visible);
/** The image beside the name for a medal: none for 0, else the one node of the five. */
const imageOf = (medal: number): string[] => (medal === 0 ? [] : [NODES[medal - 1]!]);

describe('the seeds are the medal rule\'s (FUN_002eaee0)', () => {
  it('each seed gives its medal', () => {
    for (const s of SEEDS) expect(ladderMedal(s.position, s.total), `${s.position} of ${s.total}`).toBe(s.medal);
  });
});

describe.skipIf(!HAVE)(`the medal beside the persona's name over the machine${HAVE ? '' : ' (no disc and no fixtures)'}`, () => {
  for (const s of SEEDS) {
    it(`medal ${s.medal}: SOCOM II ONLINE's DisplayMedalOfMerit on the position's answer, then IGNORE's ONSTART ActivateMedalOfMerit, show ${imageOf(s.medal).join('') || 'none'}`, async () => {
      const r = worldRig({ name: 'socomc', announcement: '', ladder: ladder(s.position, s.total) });
      await r.settle(SETTLED);
      expect(r.current()).toBe(WORLD);
      expect(r.valve(LADDER_MEDAL_VALVE)).toBe(s.medal);
      expect(shown(r)).toEqual(imageOf(s.medal));
      r.press('CROSS', 10);
      go(r, 'Ignore');
      r.press('CROSS', 2);
      for (let i = 0; i < 120 && r.current() !== IGNORE_LIST; i++) await r.settle(1);
      await r.settle(SETTLED);
      expect(r.current()).toBe(IGNORE_LIST);
      expect(shown(r)).toEqual(imageOf(s.medal));
    });
  }
});

// ---- the game lobby's two lists ----

const seat = (id: number, name: string, team: GameLobbySeat['team']): GameLobbySeat => ({ id, name, team, ready: false, host: id === 1, readyIn: 30 });
const view = (seats: GameLobbySeat[]): GameLobbyView => ({ seats, countdown: null, launched: false });
const told = (pairs: Record<number, number>): Map<number, { rating: number; medal: number }> => new Map(Object.entries(pairs).map(([id, medal]) => [Number(id), { rating: 1000, medal }]));

function lobby() {
  const uiVars = new UiVarManager();
  const c = new GameLobbyCommands({ uiVars, valves: () => new ValveStore(), games: () => [] });
  const rows = (name: string): UiVarValue[][] => {
    const v = uiVars.find(name)?.value;
    return v?.type === 'array' ? v.value.map((x) => (x.type === 'array' ? [...x.value] : [x])) : [];
  };
  const medals = (name: string): number[] => rows(name).map((r) => (r[1]?.type === 'int' ? r[1].value : -1));
  return { c, uiVars, rows, medals };
}

describe('the game lobby\'s SEALS and TERRORISTS: the second column from SEAT-TOLD (W18.R7, LOBBY_MEDAL_TOLD_READING)', () => {
  const SEATS = [seat(1, 'host', 'seal'), seat(2, 'socomc', 'terrorist'), seat(3, 'bob', 'seal'), seat(4, 'spec', null)];

  it('names the reading', () => {
    expect(LOBBY_MEDAL_TOLD_READING).toMatch(/SEAT-TOLD/);
  });

  it('before any event every medal is 0 (null.tif); the event\'s medal for each seat, 0 for a seat it names not; the spectators\' list has no medal', () => {
    const l = lobby();
    l.c.welcomed(2);
    l.c.gameLobby(view(SEATS));
    expect([l.medals(SEAL_LIST_VAR), l.medals(TERRORIST_LIST_VAR)]).toEqual([[0, 0], [0]]);
    l.c.seatTold(told({ 1: 5, 2: 3 }));
    expect([l.medals(SEAL_LIST_VAR), l.medals(TERRORIST_LIST_VAR)]).toEqual([[5, 0], [3]]);
    expect(l.rows(SEAL_LIST_VAR)[0]!.map((x) => x.type)).toEqual(['string', 'int', 'int', 'array']);   // [name, medal, dot, clan] (FUN_002f7020); AD-13: the clan a keyed cell (VALUE, COLOR)
  });

  it('after a round: the next event replaces the board whole -- the new medals drawn, a seat it leaves out back to 0; a gameLobby keeps the told medals', () => {
    const l = lobby();
    l.c.welcomed(2);
    l.c.gameLobby(view(SEATS));
    l.c.seatTold(told({ 1: 5, 2: 5, 3: 5 }));
    l.c.seatTold(told({ 1: 4, 2: 1 }));
    expect([l.medals(SEAL_LIST_VAR), l.medals(TERRORIST_LIST_VAR)]).toEqual([[4, 0], [1]]);
    l.c.gameLobby(view([seat(1, 'host', 'terrorist'), seat(2, 'socomc', 'terrorist')]));
    expect([l.medals(SEAL_LIST_VAR), l.medals(TERRORIST_LIST_VAR)]).toEqual([[], [4, 1]]);
  });

  it('a ladder under 12: the server tells 5 for every player, and every row carries the star (Medal_Black.tif)', () => {
    const l = lobby();
    l.c.welcomed(2);
    l.c.gameLobby(view(SEATS));
    l.c.seatTold(told({ 1: 5, 2: 5, 3: 5 }));
    expect([...l.medals(SEAL_LIST_VAR), ...l.medals(TERRORIST_LIST_VAR)].map((m) => MEDALS[m])).toEqual(['Medal_Black.tif', 'Medal_Black.tif', 'Medal_Black.tif']);
  });

  it('the oop9 case as the server publishes it: a told 4 drawn 4 (Medal_Gold.tif), whatever the page could compute -- the page computes none', () => {
    const l = lobby();
    l.c.welcomed(2);
    l.c.gameLobby(view([seat(1, 'oop9', 'seal'), seat(2, 'socomc', 'terrorist')]));
    l.c.seatTold(told({ 1: 4, 2: 5 }));
    expect([l.medals(SEAL_LIST_VAR), l.medals(TERRORIST_LIST_VAR)]).toEqual([[4], [5]]);
  });

  it('a new game held forgets the last game\'s told medals', () => {
    const l = lobby();
    l.c.welcomed(2);
    l.c.gameLobby(view(SEATS));
    l.c.seatTold(told({ 1: 5, 2: 5 }));
    l.c.enterGameLobby({ mediusWorldId: 9, gameName: 'g$~Alpha', maxPlayers: 8, rulesSet: 0, gameStats: `44${'00'.repeat(255)}` });
    l.c.welcomed(2);
    l.c.gameLobby(view(SEATS));
    expect([l.medals(SEAL_LIST_VAR), l.medals(TERRORIST_LIST_VAR)]).toEqual([[0, 0], [0]]);
  });
});

// ---- ONL-30a's owed test (its review's F3) ----

describe('PLAYER RANKING\'s tint: the case-sensitive compare (FUN_002eb900 D:L189399, FUN_00198f18 D:L15847-15859)', () => {
  const ROW = (name: string, position: number) => ({ position, accountId: 1000 + position, name, tag: '', online: OFFLINE });
  const plain = (v: UiVarValue): boolean => v.type === 'string';

  it('rankingRows: a name equal to the session\'s is tinted; one that differs only in case is not', () => {
    const [same, upper, lower] = rankingRows([ROW('socomc', 1), ROW('SOCOMC', 2), ROW('Socomc', 3)], 3, 'socomc').map((r) => (r.type === 'array' ? r.value : []));
    expect([plain(same![1]!), plain(upper![1]!), plain(lower![1]!)]).toEqual([false, true, true]);
  });

  it('over the rows: mode 0\'s page with my name in another case draws no tinted row', async () => {
    const uiVars = new UiVarManager(), valves = new ValveStore();
    const rows: LadderListEntry[] = [1, 2, 3].map((p, i) => ({
      status: 0, ladderPosition: p, accountId: 1000 + p, accountName: p === 2 ? 'SocomC' : `p0${p}`, stats: '', onlineState: OFFLINE, endOfList: i === 2,
    }));
    const service: LadderService = {
      position: () => Promise.resolve({ status: 0, ladderPosition: 2, totalRankings: 3 }),
      list: () => Promise.resolve(rows),
      playerInfo: never,
    };
    const c = new LadderLobbyCommands({ uiVars, valves: () => valves, service, accountName: () => 'socomc' });
    const host = new UiCommandHost();
    c.register(host);
    const bytes = new Uint8Array(0x14);
    const cmd: ZAnimUiCommand = { anim: 'get_ladder_top_10', sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn: 'GetLadderInfo', arg: 'NA', loc: 0, bytes };
    host.dispatch(cmd);
    for (let i = 0; i < 6; i++) await new Promise<void>((r) => setTimeout(r, 0));
    const v = uiVars.find(LADDER_RANKING_VAR)?.value;
    const page = v?.type === 'array' ? v.value.map((r) => (r.type === 'array' ? r.value : [])) : [];
    expect(page.map((r) => (r[1]?.type === 'string' ? r[1].value : 'tinted'))).toEqual(['p01', 'SocomC', 'p03']);
  });
});
