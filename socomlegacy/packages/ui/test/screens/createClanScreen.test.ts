import { describe, expect, it } from 'vitest';
import { DIALOG_EVENTS } from '../../src/dialog';
import { UiCommandHost, UI_COMMAND_TABLE, uiCommandRowByName } from '../../src/uiCommands';
import { UiVarManager, type UiVarValue } from '../../src/uiVars';
import type { ZAnimUiCommand } from '../../src/zanimRuntime';
import { AcctDb, PersonaCommands } from '../../src/screens/personaCommands';
import { UniverseList } from '../../src/screens/universeCommands';
import { PARKED_ROWS, WORLD_OF_SOCOM_ENTRY_COMMANDS, WorldOfSocomCommands, parkedRowGate } from '../../src/screens/worldOfSocomCommands';
import {
  CLAN_DESCRIPTION_VAR, CLAN_LADDER_POST_PLACEHOLDER, CLAN_LEADER_MINE_ADAPTATION, CLAN_NAME_FILTER_PLACEHOLDER, CLAN_NAME_VAR, CREATE_CLAN, CREATE_CLAN_COMMAND_ROWS,
  CREATE_CLAN_TICKET_ADAPTATION, CreateClanCommands, LobbyClan, MANAGE_ROSTER_LEADER, UNAFFILIATED, clanStatsRecord, playerNameAndTag,
  type CreateClanReply, type CreateClanService,
} from '../../src/screens/createClanCommands';
import { ManageRosterCommands, type ManageRosterService } from '../../src/screens/manageRosterCommands';
import { HAVE, WORLD, worldRig } from './worldOfSocomRig';

/** ONL-27's GetMyClans answered as Horizon answers a player in no clan (one NoResult reply; `MLS.cs:1614-1636` at be557831). */
const NO_CLAN_SERVICE: ManageRosterService = {
  myClans: () => Promise.resolve([{ status: 1, clanId: 0, clanName: '', leaderAccountId: 0, leaderAccountName: '', stats: '00'.repeat(256), endOfList: true }]),
  roster: () => new Promise(() => {}), remove: () => new Promise(() => {}),
};

/**
 * ONL-26 (web research 271): CREATE CLAN (`dlgCreateClan.rdr`) and its one row of PLAT-08's table, `CreateClan`
 * (`FUN_0027a950` D:L124567-124587 -> the name's text filter `FUN_002e7a10` D:L187112-187135, its reply `FUN_002e7aa0`
 * D:L187137-187165, the create's reply `FUN_002e7b80` D:L187167-187221, the stats post's reply `FUN_002e7e70`
 * D:L187255-187279), over SVC-08's `CreateClan` and `UpdateClanStats` (`packages/central/src/clans.ts`).
 * - The row off the machine, over the service's fake.
 * - The client's clan (`LobbyClan`: 0x3df298, 0x44f59c, 0x44f5c4, 0x44f5a4, 0x44f770) and SOCOM II ONLINE's two reads of
 *   it, `IsMemberOfClan` (`FUN_002e6830`) and `IsLeaderOfClan` (`FUN_002e67d0`).
 * - The page over the machine, built from the disc's layout and set (or the committed fixtures): reached by SOCOM II
 *   ONLINE's CLAN row (`create_modify_clan`, unparked) with no clan, the name through the game's keyboard
 *   (`MPPLAYERNAME`, 13 characters of 31 bytes), CREATE and each answer's caption -- success to the leader's roster
 *   (ONL-27's page), failure #223, questionable content #225 with #226 -- and the way back.
 * Synthetic answers; nothing measured on the original running (ONL-32's capture is the proven level).
 */

const SETTLED = 60;
const cmd = (fn: string, arg = 'NA', anim = 'CreateClan'): ZAnimUiCommand => ({ anim, sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg, loc: 0, bytes: new Uint8Array(0x10) });
const flush = async (): Promise<void> => { for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0)); };
const str = (value: string): UiVarValue => ({ type: 'string', value });
const ascii = (b: Uint8Array): string => { const end = b.indexOf(0); return String.fromCharCode(...b.subarray(0, end < 0 ? b.length : end)); };
const E = DIALOG_EVENTS;

/** A server over the service's calls: the create's status and id, the stats post's status, an optional text filter. */
function server(o: { status?: number; clanId?: number; statsStatus?: number; filter?: { result: number; text?: string } } = {}) {
  const requests: { op: string; body: unknown }[] = [];
  const service: CreateClanService = {
    create: (q) => { requests.push({ op: 'create', body: q }); return Promise.resolve<CreateClanReply>({ status: o.status ?? 0, clanId: (o.status ?? 0) === 0 ? (o.clanId ?? 7) : 0 }); },
    updateStats: (q) => { requests.push({ op: 'update-stats', body: { clanId: q.clanId, stats: ascii(q.stats), length: q.stats.length } }); return Promise.resolve({ status: o.statsStatus ?? 0 }); },
    ...(o.filter ? { filter: (q: { text: string }) => { requests.push({ op: 'filter', body: q }); return Promise.resolve({ result: o.filter!.result, text: o.filter!.text ?? q.text }); } } : {}),
  };
  return { service, requests };
}

function rows(o: Parameters<typeof server>[0] = {}, extra: { lobbyUp?: boolean; lobbyState?: number; ticket?: () => string | null; accountName?: string } = {}) {
  const s = server(o);
  const uiVars = new UiVarManager();
  const clan = new LobbyClan();
  const events: number[] = [];
  const c = new CreateClanCommands({
    uiVars, clan, service: s.service, event: (kind) => { events.push(kind); }, ticket: extra.ticket,
    ...(extra.lobbyUp !== undefined ? { lobbyUp: () => extra.lobbyUp! } : {}), ...(extra.lobbyState !== undefined ? { lobbyState: () => extra.lobbyState! } : {}),
    accountName: () => extra.accountName ?? 'socomc',
  });
  const typed = (name: string): void => { uiVars.set(uiVars.add(CLAN_NAME_VAR, null, 1), str(name)); };
  const value = (n: string): UiVarValue | undefined => uiVars.find(n)?.value;
  return { ...s, uiVars, clan, events, c, typed, value };
}

describe('the row (PLAT-08\'s table: 50 CreateClan, ONL-26\'s)', () => {
  it('is the table\'s, by id, function and task; registered by name, it answers 1', () => {
    expect(CREATE_CLAN_COMMAND_ROWS.map((r) => `${r.id} ${r.name} ${r.fn.toString(16)} ${r.task}`)).toEqual(['50 CreateClan 27a950 ONL-26']);
    const t = uiCommandRowByName('CreateClan')!;
    expect([t.id, t.fn, t.task, t.answer]).toEqual([50, 0x27a950, 'ONL-26', true]);
    expect(UI_COMMAND_TABLE[t.index]!.name).toBe('CreateClan');
    const host = new UiCommandHost();
    rows().c.register(host);
    expect(host.dispatch(cmd('CreateClan')).kind).toBe('table');
  });

  it('the names are the ELF\'s: CLANNAMEVAR (S:0x3eee68), Clan_Description (S:0x3f42f0), "Unaffiliated" (S:0x3f4298); the dialogs', () => {
    expect([CLAN_NAME_VAR, CLAN_DESCRIPTION_VAR, UNAFFILIATED, CREATE_CLAN, MANAGE_ROSTER_LEADER]).toEqual([
      'CLANNAMEVAR', 'Clan_Description', 'Unaffiliated', 'dlgCreateClan.rdr', 'dlgManageRosterLeader.rdr',
    ]);
    expect(CLAN_NAME_FILTER_PLACEHOLDER).toMatch(/every name passes/);
    expect(CLAN_LADDER_POST_PLACEHOLDER).toMatch(/not sent/);
    expect(CLAN_LEADER_MINE_ADAPTATION).toMatch(/no account id/);
    expect(CREATE_CLAN_TICKET_ADAPTATION).toMatch(/ticket/);
  });
});

describe('the client\'s clan (LobbyClan) and SOCOM II ONLINE\'s reads of it', () => {
  it('starts as the lobby\'s init leaves it (D:L182792-182795): no clan, no leader, no name, the rating 0 (BSS)', () => {
    const k = new LobbyClan();
    expect([k.clanId, k.leader, k.name, k.rating, k.member, k.leaderIsMine()]).toEqual([-1, -1, '', 0, false, false]);
  });

  it('IsMemberOfClan (FUN_002e6830: the clan id is not -1) and IsLeaderOfClan (FUN_002e67d0: the leader id is mine) read it; GetClan\'s no-clan reply (FUN_002e8bd0 D:L187787-187802) clears it', async () => {
    const clan = new LobbyClan();
    const w = new WorldOfSocomCommands({ uiVars: new UiVarManager(), service: { announcement: () => new Promise(() => {}) }, clan });
    const k = new ManageRosterCommands({ uiVars: new UiVarManager(), clan, service: NO_CLAN_SERVICE });   // ONL-27's rows over the same clan
    expect(w.clan).toBe(clan);
    const isMember = (): boolean => k.IsMemberOfClan(cmd('IsMemberOfClan', 'NA', 'ClanManageAct'), {} as never, undefined);
    const isLeader = (): boolean => k.IsLeaderOfClan(cmd('IsLeaderOfClan', 'NA', 'ClanManageAct'), {} as never, undefined);
    expect([isMember(), isLeader()]).toEqual([false, false]);
    clan.clanId = 7; clan.leader = 'mine'; clan.name = 'Tide';
    expect([isMember(), isLeader()]).toEqual([true, true]);
    clan.leader = 99;
    expect([isMember(), isLeader()]).toEqual([true, false]);
    k.GetClan(cmd('GetClan', 'NA', 'init_screen'), {} as never, undefined);
    await flush();
    expect([isMember(), isLeader(), clan.name, clan.clanId, clan.leader]).toEqual([false, false, '', -1, -1]);
  });

  it('the rating through a no-clan reply: FUN_002e8bd0 calls FUN_002e6af0 (D:L187802), which writes DAT_0044f770 = 0 (D:L186623) -- so a rating held before it does not reach the next create\'s stats record (D:L187210)', async () => {
    const s = server({ clanId: 9 });
    const uiVars = new UiVarManager(), clan = new LobbyClan();
    const k = new ManageRosterCommands({ uiVars, clan, service: NO_CLAN_SERVICE });
    const c = new CreateClanCommands({ uiVars, clan, service: s.service, accountName: () => 'socomc' });
    clan.clanId = 3; clan.leader = 'mine'; clan.rating = 1234;                       // a roster's mean, as ONL-27's rows would leave it
    k.GetClan(cmd('GetClan', 'NA', 'init_screen'), {} as never, undefined);
    await flush();
    expect([clan.member, clan.rating]).toEqual([false, 0]);
    uiVars.set(uiVars.add(CLAN_NAME_VAR, null, 1), str('Tide'));
    c.CreateClan(cmd('CreateClan'), {} as never, undefined);
    await flush();
    expect(s.requests[1]).toEqual({ op: 'update-stats', body: { clanId: 9, stats: '000000000000000', length: 256 } });
    clan.rating = 1234;                                                              // with no no-clan reply between, the held rating is what the record carries
    c.CreateClan(cmd('CreateClan'), {} as never, undefined);
    await flush();
    expect((s.requests[3]!.body as { stats: string }).stats).toBe('000000000001234');
  });

  it('a WorldOfSocomCommands given no clan holds its own', () => {
    const w = new WorldOfSocomCommands({ uiVars: new UiVarManager(), service: { announcement: () => new Promise(() => {}) } });
    expect(w.clan).toBeInstanceOf(LobbyClan);
  });
});

describe('CreateClan (FUN_0027a950 -> FUN_002e7a10, FUN_002e7aa0, FUN_002e7b80, FUN_002e7e70)', () => {
  it('success: the name sent; MP_CREATE_CLAN_SUCCESS; the clan id kept, the leader mine, the name copied; Clan_Description emptied; the stats posted "%.3d%.12d%s" of 0, the rating, the tag; then PLAYER_NAME_AND_TAG', async () => {
    const r = rows({ clanId: 31 });
    r.typed('Tide Runners');
    expect(r.c.CreateClan(cmd('CreateClan'), {} as never, undefined)).toBe(true);
    await flush();
    expect(r.requests).toEqual([
      { op: 'create', body: { clanName: 'Tide Runners' } },
      { op: 'update-stats', body: { clanId: 31, stats: '000000000000000', length: 256 } },
    ]);
    expect(r.events).toEqual([E['MP_CREATE_CLAN_SUCCESS']]);
    expect([r.clan.clanId, r.clan.leader, r.clan.name, r.clan.member, r.clan.leaderIsMine(), r.clan.rating]).toEqual([31, 'mine', 'Tide Runners', true, true, 0]);
    expect([r.value(CLAN_NAME_VAR), r.value(CLAN_DESCRIPTION_VAR)]).toEqual([str('Tide Runners'), str('')]);
    expect(r.value('PLAYER_NAME_AND_TAG')).toEqual(str('socomc'));
    expect(r.uiVars.find('PLAYER_NAME_AND_TAG')!.longevity).toBe(2);
  });

  it('any refusal (ClanNameInUse -970, the in-a-clan -992 / -966, Fail): MP_CREATE_CLAN_FAILURE, CLANNAMEVAR "Unaffiliated", Clan_Description "", no stats post, no clan', async () => {
    for (const status of [-970, -992, -966, 1]) {
      const r = rows({ status });
      r.typed('Tide');
      r.c.CreateClan(cmd('CreateClan'), {} as never, undefined);
      await flush();
      expect(r.requests.map((q) => q.op), String(status)).toEqual(['create']);
      expect(r.events, String(status)).toEqual([E['MP_CREATE_CLAN_FAILURE']]);
      expect([r.value(CLAN_NAME_VAR), r.value(CLAN_DESCRIPTION_VAR), r.clan.member], String(status)).toEqual([str(UNAFFILIATED), str(''), false]);
    }
  });

  it('the text filter (CLAN_NAME_FILTER_PLACEHOLDER): absent every name passes; a result below 0 is MP_FILTER_FAILURE, CLANNAMEVAR "Unaffiliated", Clan_Description " ", no create', async () => {
    const refused = rows({ filter: { result: -1 } });
    refused.typed('Rude');
    refused.c.CreateClan(cmd('CreateClan'), {} as never, undefined);
    await flush();
    expect(refused.requests).toEqual([{ op: 'filter', body: { text: 'Rude' } }]);
    expect(refused.events).toEqual([E['MP_FILTER_FAILURE']]);
    expect([refused.value(CLAN_NAME_VAR), refused.value(CLAN_DESCRIPTION_VAR)]).toEqual([str(UNAFFILIATED), str(' ')]);
    const replaced = rows({ filter: { result: 0, text: 'R**e' } });
    replaced.typed('Rude');
    replaced.c.CreateClan(cmd('CreateClan'), {} as never, undefined);
    await flush();
    expect(replaced.requests.slice(0, 2)).toEqual([{ op: 'filter', body: { text: 'Rude' } }, { op: 'create', body: { clanName: 'R**e' } }]);
    expect(replaced.clan.name).toBe('R**e');                                         // CLANNAMEVAR set to the reply's text first (D:L187156)
  });

  it('the session not up, or the lobby in another state than 11: nothing sent, nothing raised; the row still answers 1', async () => {
    for (const o of [{ lobbyUp: false }, { lobbyState: 3 }]) {
      const r = rows({}, o);
      r.typed('Tide');
      expect(r.c.CreateClan(cmd('CreateClan'), {} as never, undefined)).toBe(true);
      await flush();
      expect([r.requests, r.events]).toEqual([[], []]);
    }
  });

  it('CLANNAMEVAR holding no string: the command\'s own argument is the name (FUN_0026ed60 of +8, D:L124578-124580); the variable added TEMPORARY as the body reads it', async () => {
    const r = rows();
    r.c.CreateClan(cmd('CreateClan', 'NA'), {} as never, undefined);
    expect([r.uiVars.find(CLAN_NAME_VAR)!.longevity, r.uiVars.find(CLAN_NAME_VAR)!.value.type]).toEqual([1, 'none']);
    await flush();
    expect(r.requests[0]).toEqual({ op: 'create', body: { clanName: 'NA' } });
  });

  it('a refused stats post is silent (FUN_002e7e70): PLAYER_NAME_AND_TAG not written; the clan stands', async () => {
    const r = rows({ statsStatus: -966 });
    r.typed('Tide');
    r.c.CreateClan(cmd('CreateClan'), {} as never, undefined);
    await flush();
    expect([r.value('PLAYER_NAME_AND_TAG'), r.clan.member, r.events]).toEqual([undefined, true, [E['MP_CREATE_CLAN_SUCCESS']]]);
  });

  it('CREATE_CLAN_TICKET_ADAPTATION: an answer that lands after the session\'s ticket changed goes no further', async () => {
    let ticket: string | null = 'T1';
    let answer!: (r: CreateClanReply) => void;
    const sent: string[] = [];
    const uiVars = new UiVarManager(), clan = new LobbyClan(), events: number[] = [];
    const service: CreateClanService = {
      create: () => { sent.push('create'); return new Promise<CreateClanReply>((res) => { answer = res; }); },
      updateStats: () => { sent.push('update-stats'); return Promise.resolve({ status: 0 }); },
    };
    const c = new CreateClanCommands({ uiVars, clan, service, event: (k) => { events.push(k); }, ticket: () => ticket });
    uiVars.set(uiVars.add(CLAN_NAME_VAR, null, 1), str('Tide'));
    c.CreateClan(cmd('CreateClan'), {} as never, undefined);
    await flush();
    expect(sent).toEqual(['create']);
    ticket = 'T2';                                                                       // a logoff and another login
    answer({ status: 0, clanId: 4 });
    await flush();
    expect([events, clan.member, sent]).toEqual([[], false, ['create']]);
    ticket = null;                                                                       // no ticket: the filter's pass goes no further
    c.CreateClan(cmd('CreateClan'), {} as never, undefined);
    await flush();
    expect(sent).toEqual(['create']);
  });

  it('the stats record (clanStatsRecord): 256 bytes, the text NUL-ended and the tail 0 (CLAN_STATS_TAIL_READING, the server\'s)', () => {
    const z = clanStatsRecord(0, '');
    expect([z.length, ascii(z), z[15], z.subarray(16).every((b) => b === 0)]).toEqual([256, '000000000000000', 0, true]);
    expect(ascii(clanStatsRecord(1234, 'ABC'))).toBe('000000000001234ABC');
    expect(ascii(clanStatsRecord(-5, ''))).toBe(`000-${'0'.repeat(11)}5`);                 // %.12d of -5: the sign, then twelve digits
  });

  it('PLAYER_NAME_AND_TAG (playerNameAndTag): "%s" of the name with no tag (S:0x3f43b8); "#C\\x80\\x40\\x20[%s] #C\\x80\\x80\\x80%s" with one (S:0x3f43a0)', () => {
    expect(playerNameAndTag('', 'socomc')).toBe('socomc');
    expect(playerNameAndTag('TR', 'socomc')).toBe('#C\x80\x40\x20[TR] #C\x80\x80\x80socomc');
  });
});

describe('the unparked row', () => {
  it('SOCOM II ONLINE\'s CLAN row (create_modify_clan) is no longer parked; IsMemberOfClan, IsLeaderOfClan and GetClan ONL-27\'s bodies over the client\'s clan', () => {
    expect(PARKED_ROWS.map((p) => p.control)).not.toContain('ClanManage');
    expect(parkedRowGate({ dialog: WORLD, animation: 'create_modify_clan', argument: null })).toBe(false);
    for (const n of ['IsMemberOfClan', 'IsLeaderOfClan', 'GetClan']) expect(WORLD_OF_SOCOM_ENTRY_COMMANDS.find((e) => e.name === n), n).toMatchObject({ state: 'existing', task: 'ONL-27' });
  });
});

// ---- the page over the machine ----

type Rig = ReturnType<typeof worldRig>;
const go = (r: Rig, name: string): void => { for (let i = 0; i < 12 && r.focused() !== name; i++) r.press('DOWN', 6); expect(r.focused()).toBe(name); };
const loc = (r: Rig, id: number): string => r.loc.byId.get(id)!.trim();
const popupText = (r: Rig): string => (r.parts.current?.popup()?.popup.text.lines ?? []).map((l) => new TextDecoder().decode(Uint8Array.from(l.bytes)).trim()).join(' ');
const sounds = (r: Rig, from: number): string[] => r.sound.log.slice(from).filter((s) => s.startsWith('SOUND')).map((s) => /"sound":"([^"]+)"/.exec(s)![1]!);
const quiet = (calls: string[]): string[] => calls.filter((c) => !/^HasClanInvitations|^invitations\.op1|^DisableButton\(invitations\)|^EnableButton\(invitations\)/.test(c));
const enabled = (r: Rig, name: string): boolean => (r.parts.current!.widgets.get(name) as unknown as { enabled: boolean }).enabled;

/** SOCOM II ONLINE past SERVER NEWS with this task's row and ONL-06's PruneUIVarSpaces mounted, the CLAN row's CROSS, run to CREATE CLAN's build. */
async function createPage(o: Parameters<typeof server>[0] = {}) {
  const s = server(o);
  const r = worldRig({
    name: 'socomc', announcement: '', keyboard: true,
    register: (host, ctx) => {
      new PersonaCommands({ valves: () => ctx.machine().valves, uiVars: ctx.uiVars, db: new AcctDb(), universes: new UniverseList({ uiVars: ctx.uiVars }), inputString: (c) => ctx.machine().shell()?.inputString(c.anim) ?? null, name: (c, i) => ctx.parts.current?.name(c, i) ?? null, event: ctx.event }).register(host);
      new CreateClanCommands({ uiVars: ctx.uiVars, clan: ctx.world()!.clan, service: s.service, event: (kind) => { ctx.event(kind); }, accountName: () => 'socomc' }).register(host);
    },
  });
  await r.settle(SETTLED);
  r.press('CROSS', 10);
  go(r, 'ClanManage');
  r.press('CROSS', 2);
  for (let i = 0; i < 120 && r.current() !== CREATE_CLAN; i++) await r.settle(1);
  await r.settle(SETTLED);
  return { r, ...s };
}

/** SET CLAN NAME's keyboard, `name` typed and ENTER. */
async function named(r: Rig, name: string): Promise<void> {
  go(r, 'claname');
  r.press('CROSS', 6);
  r.type(name);
  await r.settle(10);
}

describe.skipIf(!HAVE)(`CREATE CLAN over the machine${HAVE ? '' : ' (no disc and no fixtures)'}`, () => {
  it('SOCOM II ONLINE\'s CLAN row with no clan: CROSS runs create_modify_clan -- StartMusic 1, .DINK, IsMemberOfClan 0, SwitchMenu(dlgCreateClan.rdr)', async () => {
    const r = worldRig({ name: 'socomc', announcement: '' });
    await r.settle(SETTLED);
    r.press('CROSS', 10);
    go(r, 'ClanManage');
    const from = r.outcomes.length, sound = r.sound.log.length;
    r.press('CROSS', 2);
    for (let i = 0; i < 120 && r.builds.at(-1) !== CREATE_CLAN; i++) await r.settle(1);
    expect(quiet(r.calls(WORLD, from))).toEqual(['IsMemberOfClan(NA) table', 'SwitchMenu(dlgCreateClan.rdr) table']);
    expect([r.builds, r.valve('StartMusic'), sounds(r, sound)[0]]).toEqual([[WORLD, CREATE_CLAN], 1, '.DINK']);
  });

  it('ONSTART: CREATE CLAN disabled (disable_create_button); the title #217, the description #218, the rows #219 and #220, their help lines #222 and #221', async () => {
    const { r } = await createPage();
    expect(r.calls(CREATE_CLAN)).toContain('DisableButton(createClan) table');
    expect(enabled(r, 'createClan')).toBe(false);
    expect([217, 218, 219, 220, 221, 222].map((id) => loc(r, id))).toEqual([
      'CREATE CLAN',
      'Creating a Clan will make you the leader of the Clan.  As the Clan leader, command your Clan. Invite great players to join your Clan and remove the dead-weight players. Send News to your Clan members, informing them of upcoming matches or practice sessions.  Use the Briefing Room\'s Create Game screen to set your Clan\'s side to either SEAL or Terrorist and allow other players to challenge your Clan\'s abilities.',
      'SET CLAN NAME', 'CREATE CLAN', '¦ Create your new Clan.', '¦ Give your Clan a name.',
    ]);
    expect(r.text('bar_title')).toEqual([loc(r, 217)]);
    expect(r.focused()).toBe('claname');
    expect(r.text('DescriptionText')).toEqual([loc(r, 222)]);
  });

  it('SET CLAN NAME: the keyboard MPPLAYERNAME on CLANNAMEVAR, titled #224, 13 characters of 31 bytes -- a 14th refused; ENTER enables CREATE CLAN and the name is drawn', async () => {
    const { r } = await createPage();
    const from = r.outcomes.length;
    go(r, 'claname');
    r.press('CROSS', 6);
    expect(r.calls(CREATE_CLAN, from)).toContain('GetTextInput($1) table');               // $1: the binding's argument, CLANNAMEVAR (research 119 §4)
    const req = r.skb!.keyboard.request!;
    expect([r.skb!.keyboard.isOpen, req.skbName, req.purpose, req.maxChars, req.maxBytes, req.noDQuote, req.allowEmpty]).toEqual([true, 'MPPLAYERNAME', '_224_CreateClanName_MSG', 13, 31, false, false]);
    expect(loc(r, 224)).toBe('Create Clan Name');
    r.type('Tide Runners X', null);                                                     // 14 characters: the 14th refused
    expect([r.skb!.keyboard.text, enabled(r, 'createClan')]).toEqual(['Tide Runners ', false]);
    r.type('');                                                                          // ENTER
    await r.settle(10);
    expect(r.calls(CREATE_CLAN, from)).toEqual(expect.arrayContaining(['PruneUIVarSpaces(CLANNAMEVAR) table', 'TestUIVar(CLANNAMEVAR) table', 'EnableButton(createClan) table']));
    expect(r.uiVars.find(CLAN_NAME_VAR)!.value).toEqual(str('Tide Runners'));      // PruneUIVarSpaces: the trailing space gone
    expect(enabled(r, 'createClan')).toBe(true);
    expect(r.text('txtClanName')).toEqual(['Tide Runners']);
  });

  it('CREATE CLAN: .DINK, PruneUIVarSpaces, CreateClan(NA) -- SVC-08\'s create with the name; success raises MP_CREATE_CLAN_SUCCESS: goto_menu(dlgManageRosterLeader.rdr), the leader\'s roster (ONL-27\'s page)', async () => {
    const { r, requests } = await createPage({ clanId: 12 });
    await named(r, 'Tide');
    go(r, 'createClan');
    expect(r.text('DescriptionText')).toEqual([loc(r, 221)]);
    const from = r.outcomes.length;
    r.press('CROSS', 2);
    for (let i = 0; i < 120 && r.builds.at(-1) !== MANAGE_ROSTER_LEADER; i++) await r.settle(1);
    expect(r.calls(CREATE_CLAN, from).slice(0, 2)).toEqual(['PruneUIVarSpaces(CLANNAMEVAR) table', 'CreateClan(NA) table']);
    expect(requests).toEqual([{ op: 'create', body: { clanName: 'Tide' } }, { op: 'update-stats', body: { clanId: 12, stats: '000000000000000', length: 256 } }]);
    expect(r.events).toContain(E['MP_CREATE_CLAN_SUCCESS']);
    expect([r.current(), r.builds.slice(r.builds.indexOf(CREATE_CLAN))]).toEqual([MANAGE_ROSTER_LEADER, [CREATE_CLAN, MANAGE_ROSTER_LEADER]]);
  });

  it('a refused create (the name in use, -970; or the player already in a clan, -992): #223 with no button; CROSS closes it and SET CLAN NAME is active, the name "Unaffiliated"', async () => {
    for (const status of [-970, -992]) {
      const { r } = await createPage({ status });
      await named(r, 'Tide');
      go(r, 'createClan');
      r.press('CROSS', 2);
      await r.settle(20);
      expect([r.shown(), popupText(r)], String(status)).toEqual([true, loc(r, 223)]);
      r.press('CROSS', 10);
      expect([r.shown(), r.focused(), r.current()], String(status)).toEqual([false, 'claname', CREATE_CLAN]);
      expect(r.text('txtClanName'), String(status)).toEqual([UNAFFILIATED]);
    }
  });

  it('a name the text filter refuses: MP_FILTER_FAILURE runs OnFilterFailure -- #225 with #226; CROSS closes it and SET CLAN NAME is active; no create sent', async () => {
    const { r, requests } = await createPage({ filter: { result: -1 } });
    await named(r, 'Rude');
    go(r, 'createClan');
    r.press('CROSS', 2);
    await r.settle(20);
    expect(requests.map((q) => q.op)).toEqual(['filter']);
    expect([r.shown(), popupText(r), loc(r, 226)]).toEqual([true, loc(r, 225), 'CONTINUE']);
    r.press('CROSS', 10);
    expect([r.shown(), r.focused()]).toEqual([false, 'claname']);
  });

  it('a name of spaces only leaves CREATE CLAN disabled (PruneUIVarSpaces, TestUIVar 0); TRIANGLE goes back to SOCOM II ONLINE with SND_DINK', async () => {
    const { r, requests } = await createPage();
    await named(r, '   ');
    expect(enabled(r, 'createClan')).toBe(false);
    const sound = r.sound.log.length;
    r.press('TRIANGLE', 6);
    for (let i = 0; i < 120 && r.current() !== WORLD; i++) await r.settle(1);
    expect([r.current(), sounds(r, sound), requests]).toEqual([WORLD, ['SND_DINK'], []]);
  });
});
