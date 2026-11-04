import { describe, expect, it } from 'vitest';
import type { ListboxWidget } from '../../src/widgets/listbox';
import { PARKED_ROWS, PARKED_ROW_GATE_READING, parkedRowGate } from '../../src/screens/worldOfSocomCommands';
import {
  CLAN_LADDER_LEADERS_VAR, CLAN_LADDER_LOBBY, clanMedalOf,
  type ClanListEntry, type ClanListQuery, type ClanPositionQuery, type LadderService,
} from '../../src/screens/ladderLobbyCommands';
import type { MyClansReply } from '../../src/screens/manageRosterCommands';
import { HAVE, WORLD, worldRig } from './worldOfSocomRig';

/**
 * ONL-30 (web research 311 §8.2 item 4): CLAN RANKING (`dlgClanLadderLobby.rdr`) and SOCOM II ONLINE's clan podium over
 * the machine, built from the disc's layout and sets (or the committed fixtures): the menu's ONSTART filling
 * `ClanLadderTop10` (mode 7, research 311 §7); the CLAN RANKING row's CROSS (`Goto_ClanLadder`, unparked: `StartMusic = 1`,
 * `SwitchMenu`); the page's ONSTART (`get_ladder_top_10`: `ClearUIVar(CLAN_LADDER_LEADERS)`, `GetLadderInfo` 6,
 * `DisableButton(LadderTop10)`) and its three requests; THE PODIUM; the list from my clan's position, my row tinted; the
 * medal cell at POSITION 820, off the frame (§4.3); L1 / L2 paging and `RefreshArrows` on ON_LADDER_REFRESH; a second
 * visit showing the list last drawn (§3.7); an off-board clan's empty list and L1's top fourteen (§6); TRIANGLE back.
 * Synthetic boards through the service's fake; nothing measured on the original running (ONL-32's capture is the proven
 * level).
 */

const SETTLED = 60;
const ME = 'socomc';
/** A clan's id on the seeded boards: 500 + its position. */
const CID = (position: number): number => 500 + position;
const MEDALS = ['null.tif', 'Medal_Blue.tif', 'Medal_Bronze.tif', 'Medal_Silver.tif', 'Medal_Gold.tif', 'Medal_Black.tif'];
const OFFLINE = { connectStatus: 0, lobbyWorldId: 0, gameWorldId: 0, lobbyName: '', gameName: '' };

type Op = { op: 'position'; q: ClanPositionQuery } | { op: 'total' } | { op: 'list'; q: ClanListQuery };

/** A seeded clans' board of `size` as CLAN-BOARD-SERVER answers it; the players' ladder empty (NoResult), as the rig's default. */
function clans(size: number) {
  const sent: Op[] = [];
  const service: LadderService = {
    position: () => Promise.resolve({ status: 1, ladderPosition: 0, totalRankings: 0 }),
    list: () => Promise.resolve([{ status: 1, ladderPosition: 0, accountId: 0, accountName: '', stats: '', onlineState: OFFLINE, endOfList: true }]),
    playerInfo: () => new Promise(() => {}),
    clanPosition: (q) => {
      sent.push({ op: 'position', q });
      const p = q.clanId - 500;
      return Promise.resolve(p >= 1 && p <= size ? { tag: q.tag ?? '', status: 0, ladderPosition: p, totalRankings: size } : { tag: q.tag ?? '', status: -971, ladderPosition: 0, totalRankings: 0 });
    },
    clanTotal: () => { sent.push({ op: 'total' }); return Promise.resolve({ status: 0, totalRankings: size }); },
    clanList: (q) => {
      sent.push({ op: 'list', q });
      const n = Math.max(0, Math.min(q.pageSize, size - q.startPosition + 1));
      const rows: ClanListEntry[] = n === 0 ? [{ tag: q.tag, status: 1, clanId: 0, clanName: '', ladderPosition: 0, endOfList: true }]
        : Array.from({ length: n }, (_, i) => ({ tag: q.tag, status: 0, clanId: CID(q.startPosition + i), clanName: `Clan${q.startPosition + i}`, ladderPosition: q.startPosition + i, endOfList: i === n - 1 }));
      return Promise.resolve(rows);
    },
  };
  return { sent, service };
}
const lines = (ops: readonly Op[]): string[] => ops.map((x) => x.op === 'position' ? `position ${x.q.tag ?? '-'} ${x.q.clanId}` : x.op === 'total' ? 'total' : `list ${x.q.tag} ${x.q.startPosition} ${x.q.pageSize}`);

type Rig = ReturnType<typeof worldRig>;
const go = (r: Rig, name: string): void => { for (let i = 0; i < 14 && r.focused() !== name; i++) r.press('DOWN', 6); expect(r.focused()).toBe(name); };
const loc = (r: Rig, id: number): string => r.loc.byId.get(id)!.trim();
const listbox = (r: Rig, name: string): ListboxWidget => r.parts.current!.widgets.get(name) as ListboxWidget;
const items = (r: Rig, name: string): string[][] => listbox(r, name).items.map((i) => i.captions);
const textures = (r: Rig, name: string, col: number): (string | null)[] => listbox(r, name).items.map((i) => i.images?.[col]?.texture ?? null);
const quiet = (calls: string[]): string[] => calls.filter((c) => !/^HasClanInvitations|^invitations\.op1|^DisableButton\(invitations\)|^EnableButton\(invitations\)/.test(c));
const sounds = (r: Rig, from: number): string[] => r.sound.log.slice(from).filter((s) => s.startsWith('SOUND')).map((s) => /"sound":"([^"]+)"/.exec(s)![1]!);

/** SOCOM II ONLINE with the session's clan (GetMyClans' success: `clanId`; -1 none) over a seeded clans' board. */
function menu(b: ReturnType<typeof clans>, clanId: number) {
  const mine: MyClansReply = { status: 0, clanId, clanName: 'Mine', leaderAccountId: 7, leaderAccountName: ME, stats: '00'.repeat(256), endOfList: true };
  const none: MyClansReply = { status: 1, clanId: 0, clanName: '', leaderAccountId: 0, leaderAccountName: '', stats: '00'.repeat(256), endOfList: true };
  return worldRig({
    name: ME, announcement: '', accountName: ME, ladder: b.service,
    roster: {
      myClans: () => Promise.resolve([clanId === -1 ? none : mine]),
      roster: () => Promise.resolve([{ status: -971, accountId: 0, accountName: '', stats: '00'.repeat(256), onlineState: OFFLINE, ladderStat: 0, ladderPosition: 0, totalRankings: 0, endOfList: true }]),
      remove: () => new Promise(() => {}),
    },
  });
}

/** Past SERVER NEWS, the CLAN RANKING row's CROSS, run to the page's build. */
async function rankingPage(r: Rig): Promise<void> {
  r.press('CROSS', 10);
  go(r, 'Clanranking');
  r.press('CROSS', 2);
  for (let i = 0; i < 120 && r.current() !== CLAN_LADDER_LOBBY; i++) await r.settle(1);
  await r.settle(SETTLED);
}
const firstOf = (r: Rig): string => items(r, 'LadderList')[0]?.[0] ?? '';
const arrows = (r: Rig): [boolean, boolean] => [r.node('arrow_up')!.visible, r.node('arrow_dwn')!.visible];

describe('CLAN RANKING out of the parked rows (H188\'s condition, W18.R13; PARKED_ROW_GATE_READING kept for a later row)', () => {
  it('PARKED_ROWS is empty; the gate stays and takes no row of SOCOM II ONLINE', () => {
    expect(PARKED_ROWS).toEqual([]);
    expect(PARKED_ROW_GATE_READING).toMatch(/OT\.R8/);
    const start = (animation: string) => ({ dialog: WORLD, design: {} as never, animation, argument: null });
    expect([parkedRowGate(start('Goto_ClanLadder')), parkedRowGate(start('Goto_Ladder'))]).toEqual([false, false]);
  });
});

describe.skipIf(!HAVE)(`SOCOM II ONLINE's clan podium and CLAN RANKING over the machine${HAVE ? '' : ' (no disc and no fixtures)'}`, () => {
  it('the menu\'s ONSTART (get_ladder_top_10, mode 7) fills ClanLadderTop10: the leaders 10 from 1 alone; the CLAN RANKING row\'s pane shows it under #766, RANK and CLAN NAME', async () => {
    const b = clans(16);
    const r = menu(b, CID(5));
    await r.settle(SETTLED);
    expect(lines(b.sent)).toEqual(['list ClanLadderLeaders 1 10']);
    r.press('CROSS', 10);
    go(r, 'Clanranking');
    expect([r.node('ClanLadderTop10')!.visible, r.node('ClanTopTenText')!.visible, r.text('ClanTopTenText')]).toEqual([true, true, [loc(r, 766)]]);
    expect(items(r, 'ClanLadderTop10')).toEqual(Array.from({ length: 10 }, (_, i) => [String(i + 1), `Clan${i + 1}`]));
    expect(listbox(r, 'ClanLadderTop10').spec.columns.map((c) => c.position)).toEqual([20, 130]);
    expect([loc(r, 464), loc(r, 774)]).toEqual(['RANK', 'CLAN NAME']);
  });

  it('CLAN RANKING\'s CROSS (Goto_ClanLadder, unparked) switches to dlgClanLadderLobby.rdr, StartMusic 1, no sound', async () => {
    const r = menu(clans(16), CID(5));
    await r.settle(SETTLED);
    r.press('CROSS', 10);
    go(r, 'Clanranking');
    const from = r.outcomes.length, sound = r.sound.log.length;
    r.press('CROSS', 2);
    for (let i = 0; i < 120 && r.builds.at(-1) !== CLAN_LADDER_LOBBY; i++) await r.settle(1);
    expect(quiet(r.calls(WORLD, from))).toEqual(['SwitchMenu(dlgClanLadderLobby.rdr) table']);
    expect([r.builds, r.valve('StartMusic'), sounds(r, sound).filter((s) => s !== '.TYPE')]).toEqual([[WORLD, CLAN_LADDER_LOBBY], 1, []]);
  });

  it('the page\'s ONSTART: ClearUIVar(CLAN_LADDER_LEADERS), GetLadderInfo (6), DisableButton(LadderTop10); the three requests, then the list from my clan\'s position; THE PODIUM; my row first and tinted; the medal column at 820, off the frame', async () => {
    const b = clans(40);
    const r = menu(b, CID(20));
    await r.settle(SETTLED);
    await rankingPage(r);
    expect(quiet(r.calls(CLAN_LADDER_LOBBY)).filter((c) => /ClearUIVar|GetLadderInfo|DisableButton\(LadderTop10\)/.test(c)).slice(0, 3)).toEqual(['ClearUIVar(CLAN_LADDER_LEADERS) table', 'GetLadderInfo(NA) table', 'DisableButton(LadderTop10) table']);
    expect(lines(b.sent).slice(1)).toEqual([`position GetSurrounding ${CID(20)}`, 'total', 'list ClanLadderLeaders 1 10', 'list ClanLadderList 20 14']);
    expect([r.text('bar_title'), r.text('TopTen_text')]).toEqual([[loc(r, 148)], [loc(r, 151)]]);
    expect(items(r, 'LadderTop10')).toEqual(Array.from({ length: 10 }, (_, i) => [String(i + 1), `Clan${i + 1}`]));
    expect(listbox(r, 'LadderTop10').spec.columns.map((c) => c.position)).toEqual([10, 90]);
    const rows = items(r, 'LadderList');
    expect(rows.map((c) => c[0])).toEqual(Array.from({ length: 14 }, (_, i) => String(20 + i)));
    expect(rows[0]!.slice(0, 2)).toEqual(['20', 'Clan20']);
    const colors = listbox(r, 'LadderList').items.map((i) => i.colors);
    expect(colors[0]!.slice(0, 2)).toEqual([[91, 72, 36], [91, 72, 36]]);
    expect(colors[1]!.slice(0, 2)).toEqual([null, null]);
    const spec = listbox(r, 'LadderList').spec;
    expect(spec.columns.map((c) => c.position)).toEqual([50, 130, 820]);
    expect(spec.columns[2]!.textures).toEqual(MEDALS);
    expect(textures(r, 'LadderList', 2)).toEqual(Array.from({ length: 14 }, (_, i) => MEDALS[clanMedalOf(20 + i, 40)]!));
    const medals = r.last().filter((d) => d.kind === 'sprite' && d.node === 'LadderList' && /^Medal_/.test(d.texture ?? '')) as { x0: number }[];
    expect([medals.length, medals.every((d) => d.x0 >= 640)]).toEqual([14, true]);   // 305 + 820: right of the 640-pixel frame
    expect(r.uiVars.find(CLAN_LADDER_LEADERS_VAR)!.value.type).toBe('array');
  });

  it('L2 the next fourteen, L1 back (ladder_down / ladder_up); RefreshArrows shows each arrow while that way pages', async () => {
    const b = clans(40);
    const r = menu(b, CID(1));
    await r.settle(SETTLED);
    await rankingPage(r);
    expect([firstOf(r), ...arrows(r)]).toEqual(['1', false, true]);
    r.press('TRIGGER_L2' as never, 2);
    await r.settle(40);
    expect([firstOf(r), ...arrows(r)]).toEqual(['15', true, true]);
    r.press('TRIGGER_L2' as never, 2);
    await r.settle(40);
    expect([firstOf(r), items(r, 'LadderList').length, ...arrows(r)]).toEqual(['29', 12, true, false]);
    r.press('TRIGGER_L1' as never, 2);
    await r.settle(40);
    expect([firstOf(r), r.node('arrow_up')!.visible]).toEqual(['15', true]);
  });

  it('a second visit in the same session shows the list it last drew, no list asked, both arrows pulsing (FUN_002eac70\'s send blocked, research 311 §3.7)', async () => {
    const b = clans(40);
    const r = menu(b, CID(20));
    await r.settle(SETTLED);
    await rankingPage(r);
    const drawn = items(r, 'LadderList');
    expect(drawn[0]![0]).toBe('20');
    r.press('TRIANGLE', 6);
    for (let i = 0; i < 120 && r.current() !== WORLD; i++) await r.settle(1);
    await r.settle(SETTLED);
    const at = b.sent.length;
    go(r, 'Clanranking');
    r.press('CROSS', 2);
    for (let i = 0; i < 120 && r.current() !== CLAN_LADDER_LOBBY; i++) await r.settle(1);
    await r.settle(SETTLED);
    expect(lines(b.sent.slice(at))).toEqual([`position GetSurrounding ${CID(20)}`, 'total', 'list ClanLadderLeaders 1 10']);
    expect(items(r, 'LadderList')).toEqual(drawn);
    expect(arrows(r)).toEqual([true, true]);
  });

  it('a clan off the board (ClanNotFound): THE PODIUM, an empty list, both arrows pulsing; L1 takes nothing -- the empty LISTBOX passes the pad (FUN_003745e0 D:L270328-270330: no row, no binding run), against research 311 §6\'s "L1 shows the top fourteen"', async () => {
    const b = clans(30);
    const r = menu(b, 999);
    await r.settle(SETTLED);
    await rankingPage(r);
    expect(items(r, 'LadderTop10')).toHaveLength(10);
    expect([items(r, 'LadderList'), ...arrows(r)]).toEqual([[], true, true]);
    expect(r.focused()).toBe('LadderList');
    const from = r.outcomes.length, at = b.sent.length;
    r.press('TRIGGER_L1' as never, 2);
    r.press('TRIGGER_L2' as never, 2);
    await r.settle(40);
    expect([r.calls(CLAN_LADDER_LOBBY, from), b.sent.length - at, items(r, 'LadderList')]).toEqual([[], 0, []]);
  });

  it('the way back: TRIANGLE runs goto_menu(PREVIOUS_SCREEN) with SND_DINK, to SOCOM II ONLINE', async () => {
    const r = menu(clans(16), CID(3));
    await r.settle(SETTLED);
    await rankingPage(r);
    const sound = r.sound.log.length;
    r.press('TRIANGLE', 6);
    for (let i = 0; i < 120 && r.current() !== WORLD; i++) await r.settle(1);
    expect([r.current(), sounds(r, sound)]).toEqual([WORLD, ['SND_DINK']]);
  });
});
