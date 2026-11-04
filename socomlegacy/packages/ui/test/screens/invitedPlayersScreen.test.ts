import { describe, expect, it } from 'vitest';
import { DIALOG_EVENTS } from '../../src/dialog';
import { UiCommandHost, UI_COMMAND_TABLE, uiCommandRowByName } from '../../src/uiCommands';
import { UiVarManager, type UiVarValue } from '../../src/uiVars';
import type { ZAnimUiCommand } from '../../src/zanimRuntime';
import type { ListboxWidget } from '../../src/widgets/listbox';
import { LobbyClan, MANAGE_ROSTER_LEADER, type ClanRosterMember } from '../../src/screens/createClanCommands';
import type { WorldOfSocomCommands } from '../../src/screens/worldOfSocomCommands';
import {
  CLAN_INVITE_SEATS, CLAN_INVITE_TICKET_ADAPTATION, INVITED_PLAYERS, INVITED_PLAYERS_COMMAND_ROWS, INVITED_PLAYERS_LATEST_REPLY_ADAPTATION,
  INVITED_PLAYERS_VAR, InvitedPlayersCommands, NO_INVITATIONS_SENT, PLAYER_INVITE_NAME_VAR, clanInviteText, clanWelcomeText, invitedPlayersRows,
  type InvitedPlayersService, type SentInvitationReply,
} from '../../src/screens/invitedPlayersCommands';
import { HAVE, worldRig } from './worldOfSocomRig';

/**
 * ONL-28 (web research 273 §1-§2): INVITE PLAYERS (`dlgInvitedPlayers.rdr`) and its five rows of PLAT-08's table --
 * `CanInviteMorePlayersToClan` (ELF 0x27a830 -> 0x2e5fe0), `ClanHasInvitations` (ELF 0x277960 -> 0x2e7290),
 * `GetInvitedPlayers` (`FUN_0027a3f0` -> `FUN_002e6ea0` D:L186707-186729, its reply `FUN_002e6f50` D:L186734-186782, the
 * rows `FUN_002e70b0` D:L186785-186832), `InvitePlayerToClan` (`FUN_0027a740` D:L124512-124547 -> `FUN_002e7600`
 * D:L186970-187047, the lookup's reply `FUN_002e7850` D:L187049-187083, the invitation's `FUN_002e7960` D:L187087-187108),
 * `RevokeInvite` (`FUN_0027a310` D:L124363-124377 -> `FUN_002e72a0` D:L186835-186882, its reply `FUN_002e7420`) -- over
 * SVC-09's invite, sent list and revoke, the services' AccountGetID (NU-14) and SVC-18's whisper.
 * - The rows off the machine, over the service's fake.
 * - The page over the machine, built from the disc's layout and set (or the committed fixtures): reached from the
 *   leader's roster's INVITATIONS row, the name through the game's keyboard (`MPPLAYERNAME`, #394, 14 characters of 31
 *   bytes), INVITE and each answer's caption (#390, #391, #392, #393, #384), the cap at 16, REVOKE (#387, #388, #389),
 *   and back; NU-14: the owner's case, a known player's name typed -- the invitation sent.
 * Synthetic answers; nothing measured on the original running (ONL-32's capture is the proven level).
 */

const SETTLED = 60;
const E = DIALOG_EVENTS;
const cmd = (fn: string, arg = 'NA', anim = 'invite_player'): ZAnimUiCommand => ({ anim, sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg, loc: 0, bytes: new Uint8Array(0x10) });
const flush = async (): Promise<void> => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };
const str = (value: string): UiVarValue => ({ type: 'string', value });
const row = (...cells: string[]): UiVarValue => ({ type: 'array', value: cells.map(str) });
/** A roster row as ONL-27's GetClanRoster keeps it (`rosterMemberOf`). */
const member = (accountId: number, name: string): ClanRosterMember => ({
  accountId, name, description: '', online: { connectStatus: 0, lobbyWorldId: -1, gameWorldId: -1, lobbyName: '', gameName: '' }, ladderStat: 0, ladderPosition: 1, totalRankings: 0,
});

interface Held { accountId: number; accountName: string; responseStatus: number }

/** A server over the service's calls: the accounts AccountGetID finds (the logged-in ones, case-blind; else -998), the invitation's status, the clan's invitations sent. */
function server(o: { accounts?: Record<string, number>; inviteStatus?: number; sent?: Held[]; sentStatus?: number; addPlayer?: boolean } = {}) {
  const requests: { op: string; body: unknown }[] = [];
  const accounts = o.accounts ?? { bob: 42, carol: 43, dave: 44 };
  const held: Held[] = [...(o.sent ?? [])];
  const nameOf = (id: number): string => Object.entries(accounts).find(([, v]) => v === id)?.[0] ?? '';
  const service: InvitedPlayersService = {
    accountId: (q) => {
      requests.push({ op: 'account-id', body: q });
      const id = accounts[q.name.toLowerCase()];
      return Promise.resolve(id === undefined ? { status: -998, accountId: 0 } : { status: 0, accountId: id });
    },
    invite: (q) => {
      requests.push({ op: 'invite', body: q });
      const status = o.inviteStatus ?? 0;
      if (status === 0) held.push({ accountId: q.playerAccountId, accountName: nameOf(q.playerAccountId), responseStatus: 0 });
      return Promise.resolve({ status });
    },
    chat: (q) => { requests.push({ op: 'chat', body: q }); return Promise.resolve(); },
    invitationsSent: (q) => {
      requests.push({ op: 'invitations-sent', body: q });
      const rows: SentInvitationReply[] = held.map((h, i) => ({ status: 0, ...h, responseMessage: '', responseTime: 0, endOfList: i === held.length - 1 }));
      return Promise.resolve(rows.length === 0 || (o.sentStatus ?? 0) !== 0
        ? [{ status: o.sentStatus ?? 1, accountId: 0, accountName: '', responseMessage: '', responseStatus: 0, responseTime: 0, endOfList: true }] : rows);
    },
    revoke: (q) => {
      requests.push({ op: 'revoke', body: q });
      const i = held.findIndex((h) => h.accountId === q.playerAccountId);
      if (i >= 0) held.splice(i, 1);
      return Promise.resolve({ status: i >= 0 ? 0 : -966 });
    },
    ...(o.addPlayer ? { addPlayer: (q: { playerAccountId: number; message: string }) => { requests.push({ op: 'add-player', body: q }); return Promise.resolve({ status: 0 }); } } : {}),
  };
  return { service, requests, held };
}

function rows(o: Parameters<typeof server>[0] = {}, extra: { lobbyUp?: boolean; lobbyState?: number; ticket?: () => string | null; input?: string } = {}) {
  const s = server(o);
  const uiVars = new UiVarManager();
  const clan = new LobbyClan();
  clan.clanId = 12; clan.leader = 'mine'; clan.name = 'Tide';                           // as ONL-26's create leaves it
  const events: number[] = [];
  const c = new InvitedPlayersCommands({
    uiVars, clan, service: s.service, event: (kind) => { events.push(kind); }, ticket: extra.ticket, accountName: () => 'socomc',
    inputString: () => extra.input ?? null,
    ...(extra.lobbyUp !== undefined ? { lobbyUp: () => extra.lobbyUp! } : {}), ...(extra.lobbyState !== undefined ? { lobbyState: () => extra.lobbyState! } : {}),
  });
  const typed = (name: string): void => { uiVars.set(uiVars.add(PLAYER_INVITE_NAME_VAR, null, 1), str(name)); };
  const value = (n: string): UiVarValue | undefined => uiVars.find(n)?.value;
  const run = (name: 'InvitePlayerToClan' | 'RevokeInvite' | 'GetInvitedPlayers' | 'ClanHasInvitations' | 'CanInviteMorePlayersToClan', arg = 'NA'): boolean =>
    c.entries()[name](cmd(name, arg), {} as never, undefined);
  return { ...s, uiVars, clan, events, c, typed, value, run };
}

describe('the rows (PLAT-08\'s table: 76, 77, 79, 124, 190 -- ONL-28\'s)', () => {
  it('are the table\'s, by id, function and task; registered by name, each dispatches to its body', () => {
    expect(INVITED_PLAYERS_COMMAND_ROWS.map((r) => `${r.id} ${r.name} ${r.fn.toString(16)} ${r.task}`)).toEqual([
      '76 InvitePlayerToClan 27a740 ONL-28', '77 RevokeInvite 27a310 ONL-28', '79 GetInvitedPlayers 27a3f0 ONL-28', '124 ClanHasInvitations 277960 ONL-28',
      '190 CanInviteMorePlayersToClan 27a830 ONL-28',
    ]);
    for (const r of INVITED_PLAYERS_COMMAND_ROWS) {
      const t = uiCommandRowByName(r.name)!;
      expect([t.id, t.fn, t.task, UI_COMMAND_TABLE[t.index]!.name], r.name).toEqual([r.id, r.fn, 'ONL-28', r.name]);
    }
    const host = new UiCommandHost();
    rows().c.register(host);
    for (const r of INVITED_PLAYERS_COMMAND_ROWS) expect(host.dispatch(cmd(r.name)).kind, r.name).toBe('table');
  });

  it('the names and texts are the ELF\'s: PLAYER_INVITE_NAME (S:0x3eee50), INVITED_PLAYERS (S:0x3f3920), "No Invitations Sent" (S:0x3f40d0), S:0x3f4220, S:0x3f4070; the seats 16 (slti, ELF 0x2e5ff8)', () => {
    expect([INVITED_PLAYERS, PLAYER_INVITE_NAME_VAR, INVITED_PLAYERS_VAR, NO_INVITATIONS_SENT, CLAN_INVITE_SEATS]).toEqual([
      'dlgInvitedPlayers.rdr', 'PLAYER_INVITE_NAME', 'INVITED_PLAYERS', 'No Invitations Sent', 16,
    ]);
    expect([clanInviteText('Tide'), clanWelcomeText('bob')]).toEqual(['Clan Tide invites you to join.', 'Everyon Welcome bob to the clan']);
    expect(CLAN_INVITE_TICKET_ADAPTATION).toMatch(/ticket/);
    expect(INVITED_PLAYERS_LATEST_REPLY_ADAPTATION).toMatch(/latest request/);
  });
});

describe('the sent list: GetInvitedPlayers, its reply and its rows; ClanHasInvitations; CanInviteMorePlayersToClan', () => {
  it('GetInvitedPlayers: the list emptied, GetClanInvitationsSent { start 0, pageSize 999 }; the rows drawn -- the name and its word (FUN_002e70b0)', async () => {
    const r = rows({ sent: [{ accountId: 42, accountName: 'bob', responseStatus: 0 }, { accountId: 43, accountName: 'carol', responseStatus: 2 }] });
    expect(r.run('GetInvitedPlayers')).toBe(true);
    await flush();
    expect(r.requests).toEqual([{ op: 'invitations-sent', body: { start: 0, pageSize: 999 } }]);
    expect(r.value(INVITED_PLAYERS_VAR)).toEqual({ type: 'array', value: [row('bob', 'Undecided'), row('carol', 'Declined')] });
    expect(r.uiVars.find(INVITED_PLAYERS_VAR)!.longevity).toBe(1);
    expect([r.run('ClanHasInvitations'), r.c.records().map((x) => x.accountId)]).toEqual([true, [42, 43]]);
  });

  it('none sent: one NoResult reply draws [No Invitations Sent, " "]; ClanHasInvitations 0', async () => {
    const r = rows();
    r.run('GetInvitedPlayers');
    await flush();
    expect(r.value(INVITED_PLAYERS_VAR)).toEqual({ type: 'array', value: [row(NO_INVITATIONS_SENT, ' ')] });
    expect(r.run('ClanHasInvitations')).toBe(false);
  });

  it('the reply (FUN_002e6f50): rows of 0, 1, 2 kept once each by account (FUN_002e9030), another status not kept; "Unknown" for a word past 2 (invitedPlayersRows)', () => {
    const r = rows();
    const reply = (accountId: number, responseStatus: number, endOfList = false): SentInvitationReply => ({ status: 0, accountId, accountName: `p${accountId}`, responseMessage: '', responseStatus, responseTime: 0, endOfList });
    r.c.sentReply(reply(1, 0)); r.c.sentReply(reply(1, 2)); r.c.sentReply(reply(2, 3)); r.c.sentReply(reply(3, 2, true));
    expect(r.c.records().map((x) => `${x.accountId} ${x.responseStatus}`)).toEqual(['1 0', '3 2']);
    expect(r.value(INVITED_PLAYERS_VAR)).toEqual({ type: 'array', value: [row('p1', 'Undecided'), row('p3', 'Declined')] });
    expect(invitedPlayersRows([{ name: 'x', responseStatus: 7 }])).toEqual([row('x', 'Unknown')]);
  });

  it('an accepted row (response status 1) sends AddPlayerToClan "Everyon Welcome %s to the clan" and the revoke ("ClanInviteRevokeHack", FUN_002e6f50 D:L186758-186772), and is kept "Accepted"', async () => {
    const r = rows({ addPlayer: true });
    r.c.sentReply({ status: 0, accountId: 42, accountName: 'bob', responseMessage: '', responseStatus: 1, responseTime: 0, endOfList: true });
    await flush();
    expect(r.requests).toEqual([
      { op: 'add-player', body: { playerAccountId: 42, message: 'Everyon Welcome bob to the clan' } }, { op: 'revoke', body: { playerAccountId: 42 } },
    ]);
    expect(r.value(INVITED_PLAYERS_VAR)).toEqual({ type: 'array', value: [row('bob', 'Accepted')] });
  });

  it('a failure status draws the list as it stands; the session not up or out of state 11: no request, the row still answers 1', async () => {
    const failed = rows({ sent: [{ accountId: 42, accountName: 'bob', responseStatus: 0 }], sentStatus: -966 });
    failed.run('GetInvitedPlayers');
    await flush();
    expect(failed.value(INVITED_PLAYERS_VAR)).toEqual({ type: 'array', value: [row(NO_INVITATIONS_SENT, ' ')] });
    for (const o of [{ lobbyUp: false }, { lobbyState: 3 }]) {
      const r = rows({}, o);
      expect(r.run('GetInvitedPlayers')).toBe(true);
      await flush();
      expect(r.requests).toEqual([]);
    }
  });

  it('CanInviteMorePlayersToClan: the roster and the sent list under 16 (ELF 0x2e5fe0); the roster ONL-27\'s, empty here -- GetClanRoster holds it', () => {
    const r = rows();
    let next = 100;
    const fill = (n: number): void => { for (let i = 0; i < n; i++) r.c.sentReply({ status: 0, accountId: next++, accountName: `p${i}`, responseMessage: '', responseStatus: 0, responseTime: 0, endOfList: false }); };
    expect([r.clan.roster, r.run('CanInviteMorePlayersToClan')]).toEqual([[], true]);
    fill(15);
    expect(r.run('CanInviteMorePlayersToClan')).toBe(true);
    r.clan.roster.push(member(1, 'socomc'));                                            // a roster row, as ONL-27's GetClanRoster holds it
    expect(r.run('CanInviteMorePlayersToClan')).toBe(false);
    r.clan.roster.length = 0;
    fill(1);
    expect([r.c.records().length, r.run('CanInviteMorePlayersToClan')]).toEqual([16, false]);
  });
});

describe('InvitePlayerToClan (FUN_0027a740 -> FUN_002e7600, FUN_002e7850, FUN_002e7960)', () => {
  it('the name looked up, the invitation sent with "Clan %s invites you to join." of the clan\'s name, the same text whispered (type 1), then the sent list asked and drawn', async () => {
    const r = rows();
    r.typed('Bob');
    expect(r.run('InvitePlayerToClan')).toBe(true);
    await flush();
    expect(r.requests).toEqual([
      { op: 'account-id', body: { name: 'Bob' } },
      { op: 'invite', body: { playerAccountId: 42, message: 'Clan Tide invites you to join.' } },
      { op: 'chat', body: { messageType: 1, targetId: 42, message: 'Clan Tide invites you to join.' } },
      { op: 'invitations-sent', body: { start: 0, pageSize: 999 } },
    ]);
    expect([r.events, r.value(INVITED_PLAYERS_VAR), r.c.state]).toEqual([[], { type: 'array', value: [row('bob', 'Undecided')] }, 3]);
  });

  it('the state (DAT_0044f798): 1 and 2 answer 1 and send nothing; 3 answers 0 once and goes to 0, so the next call sends', async () => {
    let answer!: (r: { status: number; accountId: number }) => void;
    const r = rows();
    const lookups: string[] = [];
    r.service.accountId = (q) => { lookups.push(q.name); return new Promise((res) => { answer = res; }); };
    r.typed('bob');
    expect([r.run('InvitePlayerToClan'), r.c.state]).toEqual([true, 1]);
    expect([r.run('InvitePlayerToClan'), lookups]).toEqual([true, ['bob']]);
    answer({ status: 0, accountId: 42 });
    await flush();
    expect(r.c.state).toBe(3);
    r.typed('carol');
    expect([r.run('InvitePlayerToClan'), r.c.state, lookups]).toEqual([false, 0, ['bob']]);
    expect([r.run('InvitePlayerToClan'), r.c.state, lookups]).toEqual([true, 1, ['bob', 'carol']]);
  });

  it('refused before any request: an empty name MP_PLAYER_NOT_FOUND; a name on the sent list (case-blind) MP_PLAYER_ALREADY_INVITED; a roster member MP_PLAYER_ALREADY_MEMBER, the leader\'s own name MP_PLAYER_IS_LEADER', async () => {
    const r = rows({ sent: [{ accountId: 42, accountName: 'bob', responseStatus: 0 }] });
    r.run('GetInvitedPlayers');
    await flush();
    r.requests.length = 0;
    for (const [name, event] of [['', 'MP_PLAYER_NOT_FOUND'], ['BOB', 'MP_PLAYER_ALREADY_INVITED']] as const) {
      r.events.length = 0;
      r.typed(name);
      expect(r.run('InvitePlayerToClan'), name).toBe(true);
      expect(r.events, name).toEqual([E[event]]);
    }
    r.clan.roster.push(member(1, 'socomc'), member(7, 'Dave'));                          // ONL-27's roster (GetClanRoster)
    for (const [name, event] of [['dave', 'MP_PLAYER_ALREADY_MEMBER'], ['7', 'MP_PLAYER_ALREADY_MEMBER'], ['SOCOMC', 'MP_PLAYER_IS_LEADER']] as const) {
      r.events.length = 0;
      r.typed(name);
      r.run('InvitePlayerToClan');
      expect(r.events, name).toEqual([E[event]]);
    }
    expect([r.requests, r.c.state]).toEqual([[], 0]);
  });

  it('the answers: no such player MP_PLAYER_NOT_FOUND; the clan full (-956) MP_CLAN_FULL; MediusRequestDenied (-985) nothing; another refusal (-966) MP_PLAYER_NOT_FOUND -- no list asked; the state 3 each time', async () => {
    const lost = rows();
    lost.typed('nobody');
    lost.run('InvitePlayerToClan');
    await flush();
    expect([lost.requests.map((q) => q.op), lost.events, lost.c.state]).toEqual([['account-id'], [E['MP_PLAYER_NOT_FOUND']], 3]);
    for (const [status, events] of [[-956, [E['MP_CLAN_FULL']]], [-985, []], [-966, [E['MP_PLAYER_NOT_FOUND']]]] as const) {
      const r = rows({ inviteStatus: status });
      r.typed('bob');
      r.run('InvitePlayerToClan');
      await flush();
      expect([r.requests.map((q) => q.op), r.events, r.c.state], String(status)).toEqual([['account-id', 'invite', 'chat'], events, 3]);
    }
  });

  it('PLAYER_INVITE_NAME holding no string: 1 and nothing (the variable added TEMPORARY); the session not up or out of state 11: 0, nothing sent', async () => {
    const none = rows();
    expect(none.run('InvitePlayerToClan')).toBe(true);
    expect([none.uiVars.find(PLAYER_INVITE_NAME_VAR)!.longevity, none.requests]).toEqual([1, []]);
    for (const o of [{ lobbyUp: false }, { lobbyState: 3 }]) {
      const r = rows({}, o);
      r.typed('bob');
      expect(r.run('InvitePlayerToClan')).toBe(false);
      await flush();
      expect(r.requests).toEqual([]);
    }
  });

  it('CLAN_INVITE_TICKET_ADAPTATION: a lookup answered after the ticket changed goes no further, and the invite ends (the state 3)', async () => {
    let ticket: string | null = 'T1';
    let answer!: (r: { status: number; accountId: number }) => void;
    const r = rows({}, { ticket: () => ticket });
    r.service.accountId = () => new Promise((res) => { answer = res; });
    r.typed('bob');
    r.run('InvitePlayerToClan');
    ticket = 'T2';
    answer({ status: 0, accountId: 42 });
    await flush();
    expect([r.requests, r.events, r.c.state]).toEqual([[], [], 3]);
  });
});

describe('RevokeInvite (FUN_0027a310 -> FUN_002e72a0, FUN_002e7420)', () => {
  it('INPUT_STRING, the row\'s name: its account revoked, then the sent list asked again', async () => {
    const r = rows({ sent: [{ accountId: 42, accountName: 'bob', responseStatus: 0 }, { accountId: 43, accountName: 'carol', responseStatus: 0 }] }, { input: 'Carol' });
    r.run('GetInvitedPlayers');
    await flush();
    r.requests.length = 0;
    expect(r.run('RevokeInvite', 'INPUT_STRING')).toBe(true);
    await flush();
    expect(r.requests).toEqual([{ op: 'revoke', body: { playerAccountId: 43 } }, { op: 'invitations-sent', body: { start: 0, pageSize: 999 } }]);
    expect(r.value(INVITED_PLAYERS_VAR)).toEqual({ type: 'array', value: [row('bob', 'Undecided')] });
  });

  it('a name not on the list: MP_PLAYER_NOT_FOUND; the list empty: 1 and nothing; the session not up: 0', async () => {
    const r = rows({ sent: [{ accountId: 42, accountName: 'bob', responseStatus: 0 }] }, { input: 'zed' });
    r.run('GetInvitedPlayers');
    await flush();
    r.requests.length = 0;
    expect([r.run('RevokeInvite', 'INPUT_STRING'), r.events, r.requests]).toEqual([true, [E['MP_PLAYER_NOT_FOUND']], []]);
    const empty = rows({}, { input: 'bob' });
    expect([empty.run('RevokeInvite', 'INPUT_STRING'), empty.events, empty.requests]).toEqual([true, [], []]);
    expect(rows({}, { lobbyUp: false }).run('RevokeInvite', 'bob')).toBe(false);
  });
});

describe('the client\'s clan: LobbyClan holds the roster ONL-27 fills', () => {
  it('starts empty; the no-clan state empties it (FUN_002e9740, D:L187801)', () => {
    const k = new LobbyClan();
    expect(k.roster).toEqual([]);
    k.roster.push(member(1, 'a'));
    k.none();
    expect(k.roster).toEqual([]);
  });
});

// ---- the page over the machine ----

type Rig = ReturnType<typeof worldRig>;
const go = (r: Rig, name: string): void => { for (let i = 0; i < 14 && r.focused() !== name; i++) r.press('DOWN', 6); expect(r.focused()).toBe(name); };
const loc = (r: Rig, id: number): string => r.loc.byId.get(id)!.trim();
const popupText = (r: Rig): string => (r.parts.current?.popup()?.popup.text.lines ?? []).map((l) => new TextDecoder().decode(Uint8Array.from(l.bytes)).trim()).join(' ');
const listbox = (r: Rig, name: string): ListboxWidget => r.parts.current!.widgets.get(name) as ListboxWidget;
const items = (r: Rig): string[][] => listbox(r, 'Invited Players').items.map((i) => i.captions);
const enabled = (r: Rig, name: string): boolean => (r.parts.current!.widgets.get(name) as unknown as { enabled: boolean }).enabled;
const sounds = (r: Rig, from: number): string[] => r.sound.log.slice(from).filter((s) => s.startsWith('SOUND')).map((s) => /"sound":"([^"]+)"/.exec(s)![1]!);
const quiet = (calls: string[]): string[] => calls.filter((c) => !/^(GetInvitedPlayers|CanInviteMorePlayersToClan)\(NA\)|^EnableButton\(invite\)/.test(c));

/** SOCOM II ONLINE past SERVER NEWS with this task's rows, the client's clan as ONL-26's create leaves it, CLAN's CROSS to the leader's roster, its INVITATIONS row's CROSS, run to INVITE PLAYERS' build. */
async function invitePage(o: Parameters<typeof server>[0] = {}) {
  const s = server(o);
  let world!: WorldOfSocomCommands;
  const r = worldRig({
    name: 'socomc', announcement: '', keyboard: true,
    register: (host, ctx) => {
      world = ctx.world()!;
      new InvitedPlayersCommands({
        uiVars: ctx.uiVars, clan: world.clan, service: s.service, event: (kind) => { ctx.event(kind); }, accountName: () => 'socomc',
        inputString: (c) => ctx.machine().shell()?.inputString(c.anim) ?? null,
      }).register(host);
    },
  });
  await r.settle(SETTLED);
  r.press('CROSS', 10);
  world.clan.clanId = 12; world.clan.leader = 'mine'; world.clan.name = 'Tide';     // the create's success, after init_screen's GetClan (the rig's no-clan answer)
  r.uiVars.set(r.uiVars.add('CLANNAMEVAR', null, 2), str('Tide'));                    // and the name it leaves in CLANNAMEVAR (research 271 §2.2)
  go(r, 'ClanManage');
  r.press('CROSS', 2);
  for (let i = 0; i < 120 && r.current() !== MANAGE_ROSTER_LEADER; i++) await r.settle(1);
  await r.settle(SETTLED);
  go(r, 'invitedplayers');
  const sound = r.sound.log.length;
  r.press('CROSS', 2);
  for (let i = 0; i < 120 && r.current() !== INVITED_PLAYERS; i++) await r.settle(1);
  await r.settle(SETTLED);
  return { r, ...s, world, sound };
}

/** INVITE PLAYER's keyboard, `name` typed and ENTER. */
async function invited(r: Rig, name: string): Promise<void> {
  go(r, 'invite');
  r.press('CROSS', 6);
  r.type(name);
  await r.settle(20);
}

describe.skipIf(!HAVE)(`INVITE PLAYERS over the machine${HAVE ? '' : ' (no disc and no fixtures)'}`, () => {
  it('reached from the leader\'s roster: its INVITATIONS row\'s CROSS is goto_menu(dlgInvitedPlayers.rdr), SND_DINK', async () => {
    const { r, sound } = await invitePage();
    expect(r.builds.slice(r.builds.indexOf(MANAGE_ROSTER_LEADER))).toEqual([MANAGE_ROSTER_LEADER, INVITED_PLAYERS]);
    expect(sounds(r, sound)[0]).toBe('SND_DINK');
  });

  it('ONSTART: the two lists disabled, a seat left so no popup; the sent list asked (find_invited_players) and drawn; INVITE PLAYER enabled; the captions #377-#383, #385', async () => {
    const { r, requests } = await invitePage({ sent: [{ accountId: 43, accountName: 'carol', responseStatus: 0 }] });
    await r.settle(90);                                                                  // find_invited_players' WAIT 2
    const calls = r.calls(INVITED_PLAYERS);
    expect(calls.slice(0, 3)).toEqual(['DisableButton(RosterList) table', 'DisableButton(Invited Players) table', 'CanInviteMorePlayersToClan(NA) table']);
    expect(calls).toEqual(expect.arrayContaining(['GetInvitedPlayers(NA) table', 'EnableButton(invite) table']));
    expect(requests.filter((q) => q.op === 'invitations-sent').length).toBeGreaterThanOrEqual(2);   // the roster's ONSTART, then this page's
    expect([r.shown(), enabled(r, 'invite'), enabled(r, 'Invited Players'), enabled(r, 'RosterList')]).toEqual([false, true, false, false]);
    expect(items(r)).toEqual([['carol', 'Undecided']]);
    expect([377, 378, 379, 380, 381, 382, 383, 385].map((id) => loc(r, id))).toEqual([
      'INVITE PLAYERS', 'CLAN ROSTER', 'INVITED PLAYERS', 'STATUS', 'Select a player and ¦ Remove them', 'INVITE PLAYER', 'REVOKE INVITE', '¦ Invite players.',
    ]);
    expect(r.text('bar_title')).toEqual([loc(r, 377)]);
    expect(r.text('txtClanName')).toEqual(['Tide']);
  });

  it('INVITE PLAYER: the keyboard MPPLAYERNAME on PLAYER_INVITE_NAME, titled #394, 14 characters of 31 bytes; ENTER (do_invite) invites the name -- AccountGetID, the invitation, the whisper, the list again', async () => {
    const { r, requests } = await invitePage();
    go(r, 'invite');
    expect(r.text('DescriptionTextLow')).toEqual([loc(r, 385)]);
    const from = r.outcomes.length;
    r.press('CROSS', 6);
    expect(quiet(r.calls(INVITED_PLAYERS, from))).toContain('GetTextInput(PLAYER_INVITE_NAME) table');
    const req = r.skb!.keyboard.request!;
    expect([r.skb!.keyboard.isOpen, req.skbName, req.purpose, req.maxChars, req.maxBytes]).toEqual([true, 'MPPLAYERNAME', '_394_EnterInvite_MSG', 14, 31]);
    expect(loc(r, 394)).toBe('Enter Name of Player to Invite');
    requests.length = 0;
    r.type('bob');
    await r.settle(20);
    expect(quiet(r.calls(INVITED_PLAYERS, from))).toContain('InvitePlayerToClan(NA) table');
    expect(requests.slice(0, 4)).toEqual([
      { op: 'account-id', body: { name: 'bob' } }, { op: 'invite', body: { playerAccountId: 42, message: 'Clan Tide invites you to join.' } },
      { op: 'chat', body: { messageType: 1, targetId: 42, message: 'Clan Tide invites you to join.' } }, { op: 'invitations-sent', body: { start: 0, pageSize: 999 } },
    ]);
    expect([items(r), r.shown()]).toEqual([[['bob', 'Undecided']], false]);
  });

  it('NU-14, the owner\'s case: a known player\'s name typed (in any case) -- AccountGetID finds his account, the invitation and its whisper go to it, his row "Undecided"; no popup', async () => {
    const { r, requests } = await invitePage({ accounts: { lima: 77 } });
    requests.length = 0;
    await invited(r, 'Lima');
    expect(requests.filter((q) => q.op !== 'invitations-sent')).toEqual([
      { op: 'account-id', body: { name: 'Lima' } }, { op: 'invite', body: { playerAccountId: 77, message: 'Clan Tide invites you to join.' } },
      { op: 'chat', body: { messageType: 1, targetId: 77, message: 'Clan Tide invites you to join.' } },
    ]);
    expect([items(r), r.shown()]).toEqual([[['lima', 'Undecided']], false]);
  });

  it('the roster\'s refusals\' captions, nothing sent: a member #392 "That player is already a member of your Clan."; the leader\'s own name #393', async () => {
    const { r, requests, world } = await invitePage();
    world.clan.roster.push(member(1, 'socomc'), member(7, 'Dave'));                     // ONL-27's roster (GetClanRoster)
    requests.length = 0;
    await invited(r, 'dave');
    const flat = (t: string): string => t.replace(/\s+/g, ' ').trim();
    expect([r.shown(), flat(popupText(r)), flat(loc(r, 392))]).toEqual([true, flat(loc(r, 392)), 'That player is already a member of your Clan. ¦ CONTINUE.']);
    r.press('CROSS', 10);
    expect(r.shown()).toBe(false);
    await invited(r, 'SOCOMC');
    expect([r.shown(), flat(popupText(r)), flat(loc(r, 393))]).toEqual([true, flat(loc(r, 393)), 'You are the leader of the Clan; you cannot invite yourself. ¦ CONTINUE.']);
    expect(requests.filter((q) => q.op !== 'invitations-sent')).toEqual([]);
  });

  it('the answers\' captions: no such player #390; already invited #391 (nothing sent); the clan full -- MP_CLAN_FULL runs ClanFullError: #384 with #226, INVITE PLAYER disabled', async () => {
    const a = await invitePage();
    await invited(a.r, 'nobody');
    expect([a.r.shown(), popupText(a.r)]).toEqual([true, loc(a.r, 390)]);
    a.r.press('CROSS', 10);
    expect(a.r.shown()).toBe(false);
    const b = await invitePage({ sent: [{ accountId: 42, accountName: 'bob', responseStatus: 0 }] });
    b.requests.length = 0;
    await invited(b.r, 'BOB');
    expect([b.r.shown(), popupText(b.r), b.requests.filter((q) => q.op !== 'invitations-sent')]).toEqual([true, loc(b.r, 391), []]);
    const c = await invitePage({ inviteStatus: -956 });
    await invited(c.r, 'bob');
    expect([c.r.shown(), popupText(c.r), loc(c.r, 226)]).toEqual([true, loc(c.r, 384), 'CONTINUE']);
    expect(enabled(c.r, 'invite')).toBe(false);
    c.r.press('CROSS', 10);
    expect([c.r.shown(), c.r.focused()]).toEqual([false, 'RevokeInv']);
  });

  it('the cap: with 16 invitations sent ONSTART raises ClanFullError -- #384; INVITE PLAYER stays disabled (CanInviteMorePlayersToClan 0)', async () => {
    const sent = Array.from({ length: CLAN_INVITE_SEATS }, (_, i) => ({ accountId: 100 + i, accountName: `p${i}`, responseStatus: 0 }));
    const { r } = await invitePage({ sent });
    expect(items(r)).toHaveLength(16);
    expect([r.shown(), popupText(r)]).toEqual([true, loc(r, 384)]);
    r.press('CROSS', 10);
    await r.settle(30);
    expect([r.shown(), enabled(r, 'invite')]).toEqual([false, false]);
  });

  it('REVOKE INVITE with none sent says #387; with some it activates the list (#386); a row\'s CROSS asks #388 -- YES revokes that name and the list is asked again, NO says #389', async () => {
    const none = await invitePage();
    go(none.r, 'RevokeInv');
    expect(none.r.text('DescriptionTextLow')).toEqual([loc(none.r, 386)]);
    none.r.press('CROSS', 6);
    expect([none.r.text('DescriptionTextLow'), loc(none.r, 387), none.r.focused()]).toEqual([[loc(none.r, 387)], 'There are no outstanding Clan invitations.', 'RevokeInv']);
    const { r, requests } = await invitePage({ sent: [{ accountId: 42, accountName: 'bob', responseStatus: 0 }, { accountId: 43, accountName: 'carol', responseStatus: 0 }] });
    go(r, 'RevokeInv');
    r.press('CROSS', 6);
    expect([r.focused(), enabled(r, 'Invited Players')]).toEqual(['Invited Players', true]);
    r.press('DOWN', 6);
    r.press('CROSS', 10);
    expect([r.shown(), popupText(r)]).toEqual([true, loc(r, 388)]);
    requests.length = 0;
    r.press('CROSS', 10);                                                                // NO (#246), the popup's first button: the cancel's caption
    expect([requests, popupText(r)]).toEqual([[], loc(r, 389)]);
    const again = await invitePage({ sent: [{ accountId: 42, accountName: 'bob', responseStatus: 0 }, { accountId: 43, accountName: 'carol', responseStatus: 0 }] });
    go(again.r, 'RevokeInv');
    again.r.press('CROSS', 6);
    again.r.press('DOWN', 6);
    again.r.press('CROSS', 10);
    again.requests.length = 0;
    again.r.press('RIGHT', 6);                                                           // YES (#253)
    again.r.press('CROSS', 10);
    await again.r.settle(20);
    expect(again.requests.slice(0, 2)).toEqual([{ op: 'revoke', body: { playerAccountId: 43 } }, { op: 'invitations-sent', body: { start: 0, pageSize: 999 } }]);
    expect(items(again.r)).toEqual([['bob', 'Undecided']]);
    expect([again.r.focused(), enabled(again.r, 'Invited Players')]).toEqual(['invite', false]);
  });

  it('the way back: TRIANGLE (goto_menu(PREVIOUS_SCREEN)) to the leader\'s roster with SND_DINK', async () => {
    const { r } = await invitePage();
    const sound = r.sound.log.length;
    r.press('TRIANGLE', 6);
    for (let i = 0; i < 120 && r.current() !== MANAGE_ROSTER_LEADER; i++) await r.settle(1);
    expect([r.current(), sounds(r, sound)[0]]).toEqual([MANAGE_ROSTER_LEADER, 'SND_DINK']);
  });
});
