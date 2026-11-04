import { describe, expect, it } from 'vitest';
import type { UiVarValue } from '../../src/uiVars';
import { UiVarManager } from '../../src/uiVars';
import type { ListboxWidget } from '../../src/widgets/listbox';
import { lobbyEventInto } from '../../src/screens/connectCommands';
import { LobbyClan, MANAGE_ROSTER_LEADER } from '../../src/screens/createClanCommands';
import {
  CLAN_ROSTER_VAR, ManageRosterCommands, ROSTER_MAIN_MENU, ROSTER_ONLINE_GLYPH, type ClanRosterEntry, type MyClansReply,
} from '../../src/screens/manageRosterCommands';
import { ManageRosterLeaderCommands, type ManageRosterLeaderService } from '../../src/screens/manageRosterLeaderCommands';
import { HAVE, worldRig } from './worldOfSocomRig';

/**
 * CLAN-DOT's reproduction, the page's half (the owner's report, 2026-10-17: the leader's REMOVE PLAYERS view drew both
 * members' ONLINE dots red). The rows are the shapes the live services answer the leader (server test
 * `clanRosterDotRepro.test.ts`): his own row the menus' lobby (connectStatus 2, `MAIN_MENU_LOBBY_NAME_PLACEHOLDER`
 * 'Medius', world -1), a member on the menus whose place PROFILE-PRIVACY withholds (connectStatus 2, the place blanked),
 * one in a game (3) and one logged off (0). The glyph is `clanRosterRows`' (`FUN_002e6af0` D:L186647-186653: 0 the
 * offline glyph S:0x3f4000, else the online one S:0x3f4008). Names invented.
 */

const OFFLINE = { connectStatus: 0, lobbyWorldId: -1, gameWorldId: -1, lobbyName: '', gameName: '' };
const row = (accountId: number, accountName: string, onlineState: ClanRosterEntry['onlineState'], ladderPosition: number): ClanRosterEntry => ({
  status: 0, accountId, accountName, stats: '00'.repeat(256), onlineState, ladderStat: 0, ladderPosition, totalRankings: 0, endOfList: false,
});
/** What `/clan/roster` answers the leader (7) with: his row whole, the others' places withheld (`ROSTER_PLACE_WITHHELD_READING`). */
const SERVED = (): ClanRosterEntry[] => [
  row(7, 'replead', { connectStatus: 2, lobbyWorldId: -1, gameWorldId: -1, lobbyName: 'Medius', gameName: '' }, 1),
  row(8, 'repmenus', { ...OFFLINE, connectStatus: 2 }, 2),
  row(9, 'repgame', { ...OFFLINE, connectStatus: 3 }, 3),
  { ...row(10, 'repoff', { ...OFFLINE }, 4), endOfList: true },
];
const flush = async (): Promise<void> => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };
const cells = (v: UiVarValue | undefined): string[][] =>
  v?.type === 'array' ? v.value.map((r) => (r.type === 'array' ? r.value.map((c) => (c.type === 'string' ? c.value : c.type === 'int' ? String(c.value) : '')) : [])) : [];

describe('CLAN-DOT repro, the page: the served rows to the ONLINE glyph', () => {
  it('the roster request\'s answer drawn into CLAN_ROSTER (the list REMOVE PLAYERS shows): connectStatus 2 and 3 the online glyph, 0 the offline one; the leader\'s own row MAIN MENU', async () => {
    const uiVars = new UiVarManager();
    const clan = new LobbyClan();
    clan.clanId = 12; clan.leader = 7; clan.self = 7; clan.name = 'Repro';
    const c = new ManageRosterCommands({
      uiVars, clan, accountName: () => 'replead',
      service: { myClans: () => new Promise(() => {}), roster: () => Promise.resolve(SERVED()), remove: () => new Promise(() => {}) },
    });
    expect(c.requestRoster()).toBe(true);
    await flush();
    const drawn = cells(uiVars.find(CLAN_ROSTER_VAR)?.value);
    const byName = new Map(drawn.map((r) => [r[1], r]));
    expect(byName.get('replead')![2]).toBe(ROSTER_ONLINE_GLYPH.online);
    expect(byName.get('replead')![7]).toBe(ROSTER_MAIN_MENU);
    expect(byName.get('repmenus')![2]).toBe(ROSTER_ONLINE_GLYPH.online);
    expect(byName.get('repgame')![2]).toBe(ROSTER_ONLINE_GLYPH.online);
    expect(byName.get('repoff')![2]).toBe(ROSTER_ONLINE_GLYPH.offline);
  });
});

// ---- the leader's page over the machine (the disc's layout, or the committed fixtures) ----

type Rig = ReturnType<typeof worldRig>;
const go = (r: Rig, name: string): void => { for (let i = 0; i < 14 && r.focused() !== name; i++) r.press('DOWN', 6); expect(r.focused()).toBe(name); };
const listbox = (r: Rig, name: string): ListboxWidget => r.parts.current!.widgets.get(name) as ListboxWidget;
const MINE: MyClansReply = { status: 0, clanId: 12, clanName: 'Repro', leaderAccountId: 7, leaderAccountName: 'replead', stats: '303030'.padEnd(512, '0'), endOfList: true };

describe.skipIf(!HAVE)(`CLAN-DOT repro, the leader's REMOVE PLAYERS over the machine${HAVE ? '' : ' (no disc and no fixtures)'}`, () => {
  it('REMOVE PLAYERS\' active RosterList: the leader\'s and the menus\' member\'s dots the online glyph, the game\'s too, the logged-off one\'s the offline glyph', async () => {
    const service: ManageRosterLeaderService = {
      remove: () => new Promise(() => {}), transferLeadership: () => new Promise(() => {}), disband: () => new Promise(() => {}), updateStats: () => new Promise(() => {}),
    };
    const r = worldRig({
      name: 'replead', announcement: '', accountName: 'replead', keyboard: true,
      roster: { myClans: () => Promise.resolve([MINE]), roster: () => Promise.resolve(SERVED()), remove: () => new Promise(() => {}) },
      register: (host, ctx) => {
        new ManageRosterLeaderCommands({
          uiVars: ctx.uiVars, clan: ctx.world()!.clan, roster: ctx.roster()!, service, event: lobbyEventInto(() => ctx.machine(), ctx.parts), accountName: () => 'replead',
          inputString: (cmd) => ctx.machine().shell()?.inputString(cmd.anim) ?? null,
        }).register(host);
      },
    });
    await r.settle(60);
    r.press('CROSS', 10);
    await r.settle(10);
    go(r, 'ClanManage');
    r.press('CROSS', 2);
    for (let i = 0; i < 120 && r.current() !== MANAGE_ROSTER_LEADER; i++) await r.settle(1);
    await r.settle(60);
    go(r, 'removeplayers');
    r.press('CROSS', 6);
    expect(r.focused()).toBe('RosterList');
    const shown = new Map(listbox(r, 'RosterList').items.map((it) => [it.captions[1], it.captions[2]]));
    expect([...shown.keys()].sort()).toEqual(['repgame', 'replead', 'repmenus', 'repoff']);
    expect(shown.get('replead')).toBe(ROSTER_ONLINE_GLYPH.online);
    expect(shown.get('repmenus')).toBe(ROSTER_ONLINE_GLYPH.online);
    expect(shown.get('repgame')).toBe(ROSTER_ONLINE_GLYPH.online);
    expect(shown.get('repoff')).toBe(ROSTER_ONLINE_GLYPH.offline);
  });
});
