import { describe, expect, it } from 'vitest';
import { DIALOG_EVENTS } from '../../src/dialog';
import { UI_COMMAND_TABLE, UiCommandHost, uiCommandRowByName } from '../../src/uiCommands';
import { UiVarManager, type UiVarValue } from '../../src/uiVars';
import type { ZAnimUiCommand } from '../../src/zanimRuntime';
import {
  CLAN_INVITATION_COMMAND_ROWS, CLAN_INVITATIONS_QUERY, CLAN_INVITATION_STATUS, ClanInvitationCommands, MY_CLAN_INVITES_VAR,
  MyClanInvitations, NO_INVITATIONS_TEXT, type ClanInvitationReply, type ClanInvitationsService,
} from '../../src/screens/clanInvitations';

/**
 * SVC-09a's client half (web research 156 §2): what the SOCOM II ONLINE menu's INVITATIONS row reads. `CheckMyInvites`
 * (`FUN_0027a3c0` D:L124390-124397 -> `FUN_002e8650` D:L187564-187580: the list cleared, CheckMyClanInvitations, Lobby
 * 0x64, start 0, page size 999), its reply handler (`FUN_002e86c0` D:L187584-187610), the list's UI variable
 * (`FUN_002e8780` D:L187613-187665, MY_CLAN_INVITES) and `HasClanInvitations` (ELF 0x277950 `j 0x2e8770`: the list's
 * count != 0). Synthetic replies; nothing measured on the original running. The row itself (`TurnOnInvitations`) is
 * ONL-09's to draw.
 */

const cmd = (fn: string, anim = 'init_screen'): ZAnimUiCommand =>
  ({ anim, sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg: 'NA', loc: 0, bytes: new Uint8Array(0x10) });
const call = (c: ZAnimUiCommand) => [c, uiCommandRowByName(c.fn!)!, undefined] as const;
const str = (s: string): UiVarValue => ({ type: 'string', value: s });
const row = (...s: string[]): UiVarValue => ({ type: 'array', value: s.map(str) });
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

/** Our Horizon's answer for an account with none (`MLS.cs:1553-1560`): one NoResult reply that ends the list. */
const NONE: ClanInvitationReply = {
  status: 1, clanInvitationId: 0, clanId: 0, responseStatus: 0, message: '', leaderAccountId: 0, leaderAccountName: '', endOfList: true,
};
const invite = (over: Partial<ClanInvitationReply> = {}): ClanInvitationReply => ({
  status: 0, clanInvitationId: 7, clanId: 3, responseStatus: 0, message: 'Clan X invites you to join.', leaderAccountId: 11,
  leaderAccountName: 'leader', endOfList: true, ...over,
});

function rig(replies: ClanInvitationReply[]) {
  const uiVars = new UiVarManager();
  const queries: unknown[] = [];
  const events: number[] = [];
  const service: ClanInvitationsService = { check: (q) => { queries.push(q); return Promise.resolve(replies); } };
  const list = new MyClanInvitations({ uiVars, event: (k) => { events.push(k); } });
  const c = new ClanInvitationCommands({ list, service });
  return { uiVars, queries, events, list, c, var: () => uiVars.find(MY_CLAN_INVITES_VAR)?.value };
}

describe('the rows (W9.R4: no table edit)', () => {
  it('CheckMyInvites row 83 (id 85, FUN_0027a3c0) and HasClanInvitations row 129 (id 130, FUN_00277950), both declared for ONL-28', () => {
    expect(CLAN_INVITATION_COMMAND_ROWS.map((r) => `${r.row} ${r.id} ${r.name}`)).toEqual(['83 85 CheckMyInvites', '129 130 HasClanInvitations']);
    for (const r of CLAN_INVITATION_COMMAND_ROWS) {
      const t = uiCommandRowByName(r.name)!;
      expect([t.index, t.id, t.fn, t.task], r.name).toEqual([r.row, r.id, r.fn, 'ONL-28']);
      expect(UI_COMMAND_TABLE[r.row]!.name).toBe(r.name);
    }
  });

  it('register() sets both bodies; a dispatch by name reaches them', async () => {
    const r = rig([NONE]);
    const host = new UiCommandHost();
    r.c.register(host);
    expect(host.dispatch(cmd('CheckMyInvites'))).toMatchObject({ kind: 'table', answer: true });
    await flush();
    expect(host.dispatch(cmd('HasClanInvitations', 'TurnOnInvitations'))).toMatchObject({ kind: 'table', answer: false });
  });
});

describe('CheckMyInvites (FUN_002e8650): the request', () => {
  it('names it: CheckMyClanInvitations (Lobby 0x64), start 0 at +0x28, page size 999 at +0x2c', () => {
    expect(CLAN_INVITATIONS_QUERY).toEqual({ start: 0, pageSize: 999 });
    const r = rig([NONE]);
    expect(r.c.CheckMyInvites(...call(cmd('CheckMyInvites')))).toBe(true);
    expect(r.queries).toEqual([{ start: 0, pageSize: 999 }]);
  });
});

describe('the reply for a player with none (FUN_002e86c0 -> FUN_002e8780)', () => {
  it('our Horizon\'s NoResult: the failure path -- MY_CLAN_INVITES one row [" ", "No Invitations", " "], the count 0, no event', async () => {
    const r = rig([NONE]);
    r.c.CheckMyInvites(...call(cmd('CheckMyInvites')));
    await flush();
    expect(NO_INVITATIONS_TEXT).toBe('No Invitations');
    expect(r.list.count).toBe(0);
    expect(r.list.has).toBe(false);
    expect(r.var()).toEqual({ type: 'array', value: [row(' ', 'No Invitations', ' ')] });
    expect(r.events).toEqual([]);
    expect(r.c.HasClanInvitations(...call(cmd('HasClanInvitations', 'TurnOnInvitations')))).toBe(false);   // the row: _794 NO INVITATIONS, disabled
  });

  it('a success that ends the list with nothing kept (a revoked invitation only): nothing written, no event', async () => {
    const r = rig([invite({ responseStatus: 3 })]);
    r.c.CheckMyInvites(...call(cmd('CheckMyInvites')));
    await flush();
    expect(r.list.count).toBe(0);
    expect(r.var()).toBeUndefined();
    expect(r.events).toEqual([]);
  });
});

describe('the reply with invitations (for SVC-09: the row\'s INVITATIONS state)', () => {
  it('an undecided invitation: kept, MP_MEDIUS_HAS_INVITES raised at the list\'s end, a row ["7", message, "Undecided"]', async () => {
    const r = rig([invite()]);
    r.c.CheckMyInvites(...call(cmd('CheckMyInvites')));
    await flush();
    expect(r.list.count).toBe(1);
    expect(r.list.has).toBe(true);
    expect(r.events).toEqual([DIALOG_EVENTS['MP_MEDIUS_HAS_INVITES']]);
    expect(r.var()).toEqual({ type: 'array', value: [row('7', 'Clan X invites you to join.', 'Undecided')] });
  });

  it('the status words 0, 1, 2 are kept and named Undecided, Accepted, Declined; the same id is kept once', async () => {
    const r = rig([
      invite({ clanInvitationId: 1, responseStatus: 0, endOfList: false }), invite({ clanInvitationId: 2, responseStatus: 1, endOfList: false }),
      invite({ clanInvitationId: 2, responseStatus: 1, endOfList: false }), invite({ clanInvitationId: 3, responseStatus: 2 }),
    ]);
    r.c.CheckMyInvites(...call(cmd('CheckMyInvites')));
    await flush();
    expect(CLAN_INVITATION_STATUS).toEqual(['Undecided', 'Accepted', 'Declined']);
    expect(r.list.count).toBe(3);
    const v = r.var() as { type: 'array'; value: { type: 'array'; value: UiVarValue[] }[] };
    expect(v.value.map((x) => x.value[2])).toEqual([str('Undecided'), str('Accepted'), str('Declined')]);
    expect(r.events).toHaveLength(1);
  });

  it('a second CheckMyInvites clears the list first (FUN_002e9380)', async () => {
    const r = rig([invite()]);
    r.c.CheckMyInvites(...call(cmd('CheckMyInvites')));
    await flush();
    const none = rig([NONE]);
    none.list.reply(invite({ endOfList: true }));
    expect(none.list.count).toBe(1);
    none.c.CheckMyInvites(...call(cmd('CheckMyInvites')));
    expect(none.list.count).toBe(0);
  });
});

describe('CLAN_INVITE_LIVE_ADAPTATION (CLAN-INVITES, a browser adaptation): the received list refreshed when central marks it', () => {
  it('refresh() sends FUN_002e8650\'s request (start 0, page size 999) and keeps the list until its replies are in -- never emptied while one waits', async () => {
    const r = rig([invite()]);
    r.c.CheckMyInvites(...call(cmd('CheckMyInvites')));
    await flush();
    expect([r.list.count, r.list.has]).toEqual([1, true]);
    let answer: (rs: ClanInvitationReply[]) => void = () => {};
    const pending: ClanInvitationsService = { check: (q) => { r.queries.push(q); return new Promise((ok) => { answer = ok; }); } };
    r.events.length = 0;
    r.list.refresh(pending);
    expect(r.queries.at(-1)).toEqual(CLAN_INVITATIONS_QUERY);
    expect([r.list.count, r.list.has]).toEqual([1, true]);                       // CheckMyInvites would read 0 here (FUN_002e9380)
    answer([invite({ endOfList: false }), invite({ clanInvitationId: 8, clanId: 4, message: 'Clan Y invites you to join.' })]);
    await flush();
    expect(r.list.count).toBe(2);
    expect(r.events).toEqual([DIALOG_EVENTS['MP_MEDIUS_HAS_INVITES']]);        // the replies handled as FUN_002e86c0 handles them
    expect(r.var()).toEqual({ type: 'array', value: [row('7', 'Clan X invites you to join.', 'Undecided'), row('8', 'Clan Y invites you to join.', 'Undecided')] });
  });

  it('a refresh answered with none (a revoke, a disband) empties the list and the row reads No Invitations; one never answered changes nothing', async () => {
    const r = rig([invite()]);
    r.c.CheckMyInvites(...call(cmd('CheckMyInvites')));
    await flush();
    r.list.refresh({ check: () => Promise.reject(new Error('never answered')) });
    await flush();
    expect(r.list.count).toBe(1);
    r.list.refresh({ check: () => Promise.resolve([NONE]) });
    await flush();
    expect([r.list.count, r.list.has]).toEqual([0, false]);
    expect(r.var()).toEqual({ type: 'array', value: [row(' ', NO_INVITATIONS_TEXT, ' ')] });
  });
});
