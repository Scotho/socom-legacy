import { describe, expect, it } from 'vitest';
import { UiCommandHost, UI_COMMAND_TABLE, uiCommandRowByName } from '../../src/uiCommands';
import { UiVarManager } from '../../src/uiVars';
import type { ZAnimUiCommand } from '../../src/zanimRuntime';
import type { ListboxWidget } from '../../src/widgets/listbox';
import { ClanInvitationCommands, MyClanInvitations, type ClanInvitationReply, type ClanInvitationsService } from '../../src/screens/clanInvitations';
import { LobbyClan } from '../../src/screens/createClanCommands';
import { PARKED_ROWS, WORLD_OF_SOCOM, parkedRowGate, type WorldOfSocomCommands } from '../../src/screens/worldOfSocomCommands';
import {
  CLAN_INVITATION_RESPONSE, LEADER_CANNOT_JOIN_TEXT, RESPOND_TO_INVITES, RESPOND_TO_INVITES_COMMAND_ROWS, RespondToInvitesCommands,
  type ClanInvitationResponse, type RespondToInvitesService,
} from '../../src/screens/respondToInvitesCommands';
import { HAVE, WORLD, worldRig } from './worldOfSocomRig';

/**
 * ONL-28 (web research 273 §3-§4): RESPOND TO INVITES (`dlgRespondToInvites.rdr`) and its two rows of PLAT-08's table --
 * `AcceptInvitation` (`FUN_00277550` D:L122892-122908 -> `FUN_002e89f0`), `DeclineInvitation` (`FUN_002774c0`
 * D:L122873-122889 -> `FUN_002e8980`), their reply `FUN_002e8a60` (D:L187710-187720) -- over SVC-09's
 * RespondToClanInvitation, the received list SVC-09a's (`MyClanInvitations`); and SOCOM II ONLINE's INVITATIONS row
 * (`Goto_Invites`), unparked.
 * - The rows off the machine, over the service's fake; the accept leaves the client's clan as it was.
 * - The page over the machine, built from the disc's layout and set (or the committed fixtures): the row's two forms,
 *   its CROSS to the page, ACCEPT (#730, #733, #734, the return to SOCOM II ONLINE), DECLINE (#731, #735), "must leave
 *   before joining" (#732), the leader's refusal (the set's own text), RETURN and TRIANGLE.
 * Synthetic answers; nothing measured on the original running (ONL-32's capture is the proven level).
 */

const SETTLED = 60;
const cmd = (fn: string, arg = 'NA', anim = 'Accept_invite'): ZAnimUiCommand => ({ anim, sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg, loc: 0, bytes: new Uint8Array(0x10) });
const flush = async (): Promise<void> => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };
const invite = (clanInvitationId: number, message: string): ClanInvitationReply => ({
  status: 0, clanInvitationId, clanId: 3, responseStatus: 0, message, leaderAccountId: 2, leaderAccountName: 'lead', endOfList: false,
});
const NONE: ClanInvitationReply = { status: 1, clanInvitationId: 0, clanId: 0, responseStatus: 0, message: '', leaderAccountId: 0, leaderAccountName: '', endOfList: true };

/** A server: the received invitations (a response takes its own off the list), each response's status. */
function server(o: { invites?: ClanInvitationReply[]; status?: number } = {}) {
  const requests: { op: string; body: unknown }[] = [];
  let held = [...(o.invites ?? [])];
  const check: ClanInvitationsService = {
    check: (q) => {
      requests.push({ op: 'invitations', body: q });
      return Promise.resolve(held.length === 0 ? [NONE] : held.map((r, i) => ({ ...r, endOfList: i === held.length - 1 })));
    },
  };
  const service: RespondToInvitesService = {
    respond: (q: ClanInvitationResponse) => {
      requests.push({ op: 'respond', body: q });
      if ((o.status ?? 0) === 0) held = held.filter((r) => r.clanInvitationId !== q.clanInvitationId);
      return Promise.resolve({ status: o.status ?? 0 });
    },
  };
  return { check, service, requests };
}

function rows(o: Parameters<typeof server>[0] = {}, extra: { input?: string; ticket?: () => string | null } = {}) {
  const s = server(o);
  const uiVars = new UiVarManager();
  const events: number[] = [];
  const list = new MyClanInvitations({ uiVars, event: (k) => { events.push(k); } });
  const c = new RespondToInvitesCommands({ list, invitations: s.check, service: s.service, inputString: () => extra.input ?? null, ticket: extra.ticket });
  return { ...s, uiVars, list, events, c };
}

describe('the rows (PLAT-08\'s table: 113 AcceptInvitation, 114 DeclineInvitation -- ONL-28\'s)', () => {
  it('are the table\'s, by id, function and task; registered by name, each answers 1', () => {
    expect(RESPOND_TO_INVITES_COMMAND_ROWS.map((r) => `${r.id} ${r.name} ${r.fn.toString(16)} ${r.task}`)).toEqual(['113 AcceptInvitation 277550 ONL-28', '114 DeclineInvitation 2774c0 ONL-28']);
    for (const r of RESPOND_TO_INVITES_COMMAND_ROWS) {
      const t = uiCommandRowByName(r.name)!;
      expect([t.id, t.fn, t.task, t.answer, UI_COMMAND_TABLE[t.index]!.name], r.name).toEqual([r.id, r.fn, 'ONL-28', true, r.name]);
    }
    const host = new UiCommandHost();
    rows().c.register(host);
    for (const r of RESPOND_TO_INVITES_COMMAND_ROWS) expect(host.dispatch(cmd(r.name)).kind, r.name).toBe('table');
    expect([RESPOND_TO_INVITES, CLAN_INVITATION_RESPONSE]).toEqual(['dlgRespondToInvites.rdr', { accept: 1, decline: 2 }]);
    expect(LEADER_CANNOT_JOIN_TEXT).toHaveLength(149);
  });
});

describe('AcceptInvitation and DeclineInvitation (FUN_002e89f0 / FUN_002e8980, the reply FUN_002e8a60)', () => {
  it('INPUT_STRING, the row\'s first cell, read by strtol: RespondToClanInvitation { id, 1, "" }; the reply asks the received list again', async () => {
    const r = rows({ invites: [invite(7, 'Clan Tide invites you to join.')] }, { input: '7' });
    expect(r.c.AcceptInvitation(cmd('AcceptInvitation', 'INPUT_STRING'), {} as never, undefined)).toBe(true);
    await flush();
    expect(r.requests).toEqual([{ op: 'respond', body: { clanInvitationId: 7, response: 1, message: '' } }, { op: 'invitations', body: { start: 0, pageSize: 999 } }]);
    expect([r.list.count, r.uiVars.find('MY_CLAN_INVITES')!.value]).toEqual([0, { type: 'array', value: [{ type: 'array', value: [' ', 'No Invitations', ' '].map((value) => ({ type: 'string', value })) }] }]);
  });

  it('a decline is the response 2; the reply asks the list again whatever its status (the console only logs it)', async () => {
    const r = rows({ invites: [invite(9, 'x')], status: -966 }, { input: '9' });
    r.c.DeclineInvitation(cmd('DeclineInvitation', 'INPUT_STRING'), {} as never, undefined);
    await flush();
    expect(r.requests).toEqual([{ op: 'respond', body: { clanInvitationId: 9, response: 2, message: '' } }, { op: 'invitations', body: { start: 0, pageSize: 999 } }]);
    expect(r.list.count).toBe(1);
  });

  it('the argument as written when it is not INPUT_STRING; no text reads 0', async () => {
    const r = rows();
    r.c.AcceptInvitation(cmd('AcceptInvitation', '12'), {} as never, undefined);
    r.c.DeclineInvitation(cmd('DeclineInvitation', 'INPUT_STRING'), {} as never, undefined);
    await flush();
    expect(r.requests.filter((q) => q.op === 'respond').map((q) => q.body)).toEqual([
      { clanInvitationId: 12, response: 1, message: '' }, { clanInvitationId: 0, response: 2, message: '' },
    ]);
  });

  it('CLAN_INVITE_TICKET_ADAPTATION: a reply that lands after the ticket changed does not ask the list', async () => {
    let ticket: string | null = 'T1';
    const r = rows({ invites: [invite(7, 'x')] }, { input: '7', ticket: () => ticket });
    r.c.AcceptInvitation(cmd('AcceptInvitation', 'INPUT_STRING'), {} as never, undefined);
    ticket = 'T2';
    await flush();
    expect(r.requests.map((q) => q.op)).toEqual(['respond']);
  });

  it('an accept leaves the client\'s clan as it was: FUN_002e8a60 writes no clan id, leader or name', async () => {
    const clan = new LobbyClan();
    const r = rows({ invites: [invite(7, 'x')] }, { input: '7' });
    r.c.AcceptInvitation(cmd('AcceptInvitation', 'INPUT_STRING'), {} as never, undefined);
    await flush();
    expect([clan.clanId, clan.leader, clan.name, clan.member]).toEqual([-1, -1, '', false]);
  });
});

describe('SOCOM II ONLINE\'s INVITATIONS row (Goto_Invites) is no longer parked', () => {
  it('PARKED_ROWS is empty since ONL-30 unparked CLAN RANKING (W18.R13); the gate lets Goto_Invites start', () => {
    expect(PARKED_ROWS).toEqual([]);  // was ['Clanranking'] until ONL-30's merge (406e46fd9)
    expect(parkedRowGate({ dialog: WORLD_OF_SOCOM, animation: 'Goto_Invites', argument: null })).toBe(false);
  });
});

// ---- the page over the machine ----

type Rig = ReturnType<typeof worldRig>;
const go = (r: Rig, name: string): void => { for (let i = 0; i < 14 && r.focused() !== name; i++) r.press('DOWN', 6); expect(r.focused()).toBe(name); };
const loc = (r: Rig, id: number): string => r.loc.byId.get(id)!.trim();
/** The popup's lines: a UIMnLOC caption's bytes are UTF-8 (0xC2 0xA6 for the glyph); a set's literal is its own bytes, one each (latin1). */
const popupText = (r: Rig, encoding = 'utf-8'): string => (r.parts.current?.popup()?.popup.text.lines ?? []).map((l) => new TextDecoder(encoding).decode(Uint8Array.from(l.bytes)).trim()).join(' ');
const listbox = (r: Rig): ListboxWidget => r.parts.current!.widgets.get('Invitations') as ListboxWidget;
const enabled = (r: Rig, name: string): boolean => (r.parts.current!.widgets.get(name) as unknown as { enabled: boolean }).enabled;
const sounds = (r: Rig, from: number): string[] => r.sound.log.slice(from).filter((s) => s.startsWith('SOUND')).map((s) => /"sound":"([^"]+)"/.exec(s)![1]!);

/** SOCOM II ONLINE past SERVER NEWS with this task's rows over the fake's received list; `clan` set after init_screen's GetClan (the rig's no-clan answer); the INVITATIONS row's CROSS, run to the page's build. */
async function respondPage(o: Parameters<typeof server>[0] = {}, clan?: (c: LobbyClan) => void) {
  const s = server(o);
  let world!: WorldOfSocomCommands;
  const r = worldRig({
    name: 'socomc', announcement: '',
    register: (host, ctx) => {
      world = ctx.world()!;
      const list = new MyClanInvitations({ uiVars: ctx.uiVars, event: (k) => { ctx.event(k); } });
      new ClanInvitationCommands({ list, service: s.check }).register(host);
      new RespondToInvitesCommands({ list, invitations: s.check, service: s.service, inputString: (c) => ctx.machine().shell()?.inputString(c.anim) ?? null }).register(host);
    },
  });
  await r.settle(90);                                                                    // the reply, then TurnOnInvitations' next second
  r.press('CROSS', 10);
  clan?.(world.clan);
  go(r, 'invitations');
  const from = r.outcomes.length;
  r.press('CROSS', 2);
  for (let i = 0; i < 120 && r.current() !== RESPOND_TO_INVITES; i++) await r.settle(1);
  await r.settle(SETTLED);
  return { r, ...s, world, from };
}

const TWO = [invite(7, 'Clan Tide invites you to join.'), invite(8, 'Clan Reef invites you to join.')];

describe.skipIf(!HAVE)(`RESPOND TO INVITES over the machine${HAVE ? '' : ' (no disc and no fixtures)'}`, () => {
  it('the row\'s two forms: none, NO INVITATIONS (#794) and disabled; an invitation waiting, INVITATIONS (#476), enabled, its help #787', async () => {
    const none = worldRig({ name: 'socomc', announcement: '' });
    await none.settle(90);
    expect(none.calls()).toContain('invitations.op1(_794_NoInvitations_MSG)');
    expect(enabled(none, 'invitations')).toBe(false);
    const { r } = await respondPage({ invites: TWO });
    expect(r.calls(WORLD)).toContain('invitations.op1(_476_INVITATIONS_MSG)');
    expect([loc(r, 476), loc(r, 794), loc(r, 787)]).toEqual(['INVITATIONS', 'NO INVITATIONS', '¦ View current Clan invites.']);
  });

  it('its CROSS (Goto_Invites): StartMusic 1, SwitchMenu(dlgRespondToInvites.rdr) -- no sound', async () => {
    const { r, from } = await respondPage({ invites: TWO });
    expect(r.calls(WORLD, from).filter((c) => !/^HasClanInvitations|^invitations\.op1|^EnableButton\(invitations\)|^CheckMyInvites/.test(c))).toEqual(['SwitchMenu(dlgRespondToInvites.rdr) table']);
    expect([r.builds.slice(-2), r.valve('StartMusic')]).toEqual([[WORLD, RESPOND_TO_INVITES], 1]);
  });

  it('ONSTART with no clan: LEAVE CLAN disabled, ACCEPT active, the list disabled; CheckMyInvites asked; the rows [id, text, status]; the captions #724-#727, #380, #728', async () => {
    const { r, requests } = await respondPage({ invites: TWO });
    const calls = r.calls(RESPOND_TO_INVITES);
    expect(calls.slice(0, 6)).toEqual(expect.arrayContaining(['IsLeaderOfClan(NA) table', 'IsMemberOfClan(NA) table', 'DisableButton(LeaveClan) table', 'ActivateButton(Accept) table', 'DisableButton(Invitations) table']));
    expect(calls).toContain('CheckMyInvites(NA) table');
    expect(requests.filter((q) => q.op === 'invitations').length).toBeGreaterThanOrEqual(2);
    expect([r.focused(), enabled(r, 'LeaveClan'), enabled(r, 'Invitations')]).toEqual(['Accept', false, false]);
    expect(listbox(r).items.map((i) => i.captions)).toEqual([['7', 'Clan Tide invites you to join.', 'Undecided'], ['8', 'Clan Reef invites you to join.', 'Undecided']]);
    expect([724, 725, 726, 727, 380, 728].map((id) => loc(r, id))).toEqual(['RESPOND TO INVITES', 'CLAN INVITATION', 'ACCEPT', 'DECLINE', 'STATUS', '¦ Activate the accept invitations list.']);
    expect([r.text('bar_title'), r.text('DescriptionText'), r.valve('AcceptOrDecline')]).toEqual([[loc(r, 724)], [loc(r, 728)], 0]);
  });

  it('ACCEPT: CROSS activates the list (#730); a row\'s CROSS accepts that invitation -- AcceptInvitation(INPUT_STRING), #733, then #734; CROSS returns to SOCOM II ONLINE; the client\'s clan untouched', async () => {
    const { r, requests, world } = await respondPage({ invites: TWO });
    r.press('CROSS', 6);
    expect([r.focused(), enabled(r, 'Invitations'), r.text('DescriptionText')]).toEqual(['Invitations', true, [loc(r, 730)]]);
    r.press('DOWN', 6);
    requests.length = 0;
    const from = r.outcomes.length;
    r.press('CROSS', 4);
    expect(r.calls(RESPOND_TO_INVITES, from)).toContain('AcceptInvitation(INPUT_STRING) table');
    expect(r.text('DescriptionText')).toEqual([loc(r, 733)]);
    await r.settle(60);
    expect(requests.slice(0, 2)).toEqual([{ op: 'respond', body: { clanInvitationId: 8, response: 1, message: '' } }, { op: 'invitations', body: { start: 0, pageSize: 999 } }]);
    expect([r.shown(), popupText(r)]).toEqual([true, loc(r, 734)]);
    r.press('CROSS', 4);
    for (let i = 0; i < 120 && r.current() !== WORLD; i++) await r.settle(1);
    expect([r.current(), world.clan.member]).toEqual([WORLD, false]);
  });

  it('DECLINE: ONACTIVATE #729 (AcceptOrDecline 1); CROSS activates the list (#731); a row\'s CROSS: #735, DeclineInvitation(INPUT_STRING), the focus back on DECLINE, the list disabled', async () => {
    const { r, requests } = await respondPage({ invites: TWO });
    go(r, 'Decline');
    expect([r.text('DescriptionText'), r.valve('AcceptOrDecline')]).toEqual([[loc(r, 729)], 1]);
    r.press('CROSS', 6);
    expect([r.focused(), r.text('DescriptionText')]).toEqual(['Invitations', [loc(r, 731)]]);
    requests.length = 0;
    r.press('CROSS', 6);
    expect(r.text('DescriptionText')).toEqual([loc(r, 735)]);
    await r.settle(60);
    expect(requests.slice(0, 2)).toEqual([{ op: 'respond', body: { clanInvitationId: 7, response: 2, message: '' } }, { op: 'invitations', body: { start: 0, pageSize: 999 } }]);
    expect([r.focused(), enabled(r, 'Invitations'), r.shown(), r.current()]).toEqual(['Decline', false, false, RESPOND_TO_INVITES]);
  });

  it('a member: "must leave before joining" -- #732, nothing sent; CROSS closes it and LEAVE CLAN is active (OnRespondStart again)', async () => {
    const { r, requests } = await respondPage({ invites: TWO }, (c) => { c.clanId = 4; c.leader = 99; c.name = 'Reef'; });
    expect([enabled(r, 'LeaveClan'), r.focused()]).toEqual([true, 'LeaveClan']);
    go(r, 'Accept');
    r.press('CROSS', 6);
    requests.length = 0;
    r.press('CROSS', 10);
    expect([r.shown(), popupText(r)]).toEqual([true, loc(r, 732)]);
    expect(loc(r, 732)).toBe('You must leave the your currect Clan before you can join another. ¦ CONTINUE.');
    const from = r.outcomes.length;
    r.press('CROSS', 10);
    expect([r.shown(), requests.filter((q) => q.op === 'respond')]).toEqual([false, []]);
    expect(r.calls(RESPOND_TO_INVITES, from).slice(0, 8)).toEqual([
      'ActivateButton(LeaveClan) table', 'EnableButton(LeaveClan) table', 'DisableButton(Invitations) table', 'IsLeaderOfClan(NA) table', 'IsMemberOfClan(NA) table',
      'EnableButton(LeaveClan) table', 'ActivateButton(LeaveClan) table', 'ActivateButton(Accept) table',
    ]);
    // The menu queue is consumed from its top (`FUN_003654c0` D:L262288-262290, `./menuQueue`): the frame's first
    // ActivateButton, LEAVE CLAN's, is the last applied -- the focus rests there, as at a member's ONSTART.
    expect([r.focused(), r.text('DescriptionText')]).toEqual(['LeaveClan', [loc(r, 468)]]);
  });

  it('the leader: the set\'s own text (149 bytes) -- appoint a new leader or disband first; nothing sent', async () => {
    const { r, requests } = await respondPage({ invites: TWO }, (c) => { c.clanId = 4; c.leader = 'mine'; c.name = 'Reef'; });
    expect(r.node('LeaveClan')!.visible).toBe(false);
    r.press('CROSS', 6);
    requests.length = 0;
    r.press('CROSS', 10);
    expect([r.shown(), popupText(r, 'latin1')]).toEqual([true, LEADER_CANNOT_JOIN_TEXT]);
    expect(requests.filter((q) => q.op === 'respond')).toEqual([]);
  });

  it('the way back: RETURN switches to SOCOM II ONLINE (#322); TRIANGLE goes back with SND_DINK', async () => {
    const a = await respondPage({ invites: TWO });
    go(a.r, 'return');
    expect(a.r.text('DescriptionText')).toEqual([loc(a.r, 322)]);
    a.r.press('CROSS', 4);
    for (let i = 0; i < 120 && a.r.current() !== WORLD; i++) await a.r.settle(1);
    expect(a.r.current()).toBe(WORLD);
    const b = await respondPage({ invites: TWO });
    const sound = b.r.sound.log.length;
    b.r.press('TRIANGLE', 6);
    for (let i = 0; i < 120 && b.r.current() !== WORLD; i++) await b.r.settle(1);
    expect([b.r.current(), sounds(b.r, sound)[0]]).toEqual([WORLD, 'SND_DINK']);
  });
});
