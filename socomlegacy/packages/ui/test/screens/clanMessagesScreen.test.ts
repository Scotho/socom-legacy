import { describe, expect, it } from 'vitest';
import { DIALOG_EVENTS } from '../../src/dialog';
import { UiCommandHost, UI_COMMAND_TABLE, uiCommandRowByName } from '../../src/uiCommands';
import { UiVarManager, type UiVarValue } from '../../src/uiVars';
import type { ZAnimUiCommand } from '../../src/zanimRuntime';
import type { ListboxWidget } from '../../src/widgets/listbox';
import { fmul } from '../../src/text/f32';
import { layoutText } from '../../src/text/layout';
import { LobbyClan, MANAGE_ROSTER_LEADER } from '../../src/screens/createClanCommands';
import type { WorldOfSocomCommands } from '../../src/screens/worldOfSocomCommands';
import {
  CLAN_LEADER_MESSAGES_VAR, CLAN_MESSAGES_COMMAND_ROWS, CLAN_MESSAGES_LATEST_REPLY_ADAPTATION, CLAN_MESSAGES_PAGE, CLAN_MESSAGES_RETRIEVING, CLAN_MESSAGE_NEW_ID,
  CLAN_MESSAGE_SEPARATOR, CLAN_MESSAGE_SLOTS, CLAN_MESSAGE_TICKET_ADAPTATION, ClanMessagesCommands, MEDIUS_CLAN_MESSAGES_VAR, NO_CLAN_MESSAGES,
  SEND_CLAN_MESSAGE_VAR, clanLeaderMessageRows, clanMessagesPane, type ClanMessageReply, type ClanMessagesService, type MyClanMessageReply,
} from '../../src/screens/clanMessagesCommands';
import { HAVE, worldRig } from './worldOfSocomRig';

/**
 * ONL-29 (web research 274): the clan messages -- SOCOM II ONLINE's MESSAGES band "Clan messages" (#775, the member's
 * pane MEDIUS_CLAN_MESSAGES) and the leader's EDIT NEWS on `dlgManageRosterLeader.rdr` -- and their five rows of PLAT-08's
 * table: `GetClanMessages` (`FUN_00279790` -> `FUN_002e8460` D:L187484-187504, the reply `FUN_002e84e0`
 * D:L187508-187560), `GetLeaderMessages` (`FUN_0027a0b0` -> `FUN_002e6310` D:L186303-186321, the reply `FUN_002e6390`,
 * the keep `FUN_002e65b0`, the rows `FUN_002e6400` D:L186347-186390), `ModifyClanMessage` (`FUN_0027a0e0`
 * D:L124282-124302 -> `FUN_002e60c0` D:L186223-186284), `DeleteClanMessage` (`FUN_0027a1c0` D:L124304-124321 ->
 * `FUN_002e6010` D:L186187-186204), `SendClanMessage` (`FUN_002797f0` D:L123956-123994 -> `FUN_002e8310`
 * D:L187434-187458) -- over SVC-10's paths.
 * - The rows off the machine, over the service's fake.
 * - The pages over the machine, built from the disc's layouts and sets (or the committed fixtures): the band drawn from
 *   the replies through the seam GetMyClans' success calls (ONL-27's GetClan), "No clan messages."; the
 *   leader's page reached as ONL-26's create leaves the client's clan, EDIT NEWS (#485, #498), a post through the game's
 *   keyboard (`ChatSkb`, #497, 199 characters of 199 bytes), an edit, a delete, the blank post's #504 and the stale
 *   row's #503.
 * Synthetic answers; nothing measured on the original running (ONL-32's capture is the proven level).
 */

const SETTLED = 60;
const E = DIALOG_EVENTS;
const cmd = (fn: string, arg = 'NA', anim = 'SendClanMessage'): ZAnimUiCommand => ({ anim, sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg, loc: 0, bytes: new Uint8Array(0x10) });
const flush = async (): Promise<void> => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };
const str = (value: string): UiVarValue => ({ type: 'string', value });
const row = (...cells: string[]): UiVarValue => ({ type: 'array', value: cells.map(str) });
const arr = (...cells: string[]): UiVarValue => ({ type: 'array', value: cells.map(str) });

/** SVC-10 over the service's calls: the clan's messages by id (Horizon's order), the cap of five, the statuses it answers. */
function server(o: { messages?: string[]; sendStatus?: number; modifyStatus?: number; deleteStatus?: number; hangAll?: (n: number) => boolean } = {}) {
  const requests: { op: string; body: unknown }[] = [];
  let next = 1;
  const held: { id: number; text: string }[] = (o.messages ?? []).map((text) => ({ id: next++, text }));
  let allAsked = 0;
  const service: ClanMessagesService = {
    myMessages: (q) => {
      requests.push({ op: 'messages', body: q });
      const rows: MyClanMessageReply[] = held.map((m, i) => ({ status: 0, clanId: 12, message: m.text, endOfList: i === held.length - 1 }));
      return Promise.resolve(rows.length === 0 ? [{ status: 1, clanId: 12, message: '', endOfList: true }] : rows);
    },
    allMessages: (q) => {
      requests.push({ op: 'all-messages', body: q });
      if (o.hangAll?.(++allAsked)) return new Promise<readonly ClanMessageReply[]>(() => {});
      const rows: ClanMessageReply[] = held.map((m, i) => ({ status: 0, clanMessageId: m.id, message: m.text, clanMessageStatus: 3, endOfList: i === held.length - 1 }));
      return Promise.resolve(rows.length === 0 ? [{ status: 1, clanMessageId: 0, message: '', clanMessageStatus: 0, endOfList: true }] : rows);
    },
    send: (q) => {
      requests.push({ op: 'send-message', body: q });
      const status = o.sendStatus ?? (held.length >= 5 ? -956 : 0);
      if (status === 0) held.push({ id: next++, text: q.message });
      return Promise.resolve({ status });
    },
    modify: (q) => {
      requests.push({ op: 'modify-message', body: q });
      const m = held.find((h) => h.id === q.clanMessageId);
      const status = o.modifyStatus ?? (m ? 0 : -966);
      if (status === 0 && m) m.text = q.newMessage;
      return Promise.resolve({ status });
    },
    delete: (q) => {
      requests.push({ op: 'delete-message', body: q });
      const i = held.findIndex((h) => h.id === q.clanMessageId);
      const status = o.deleteStatus ?? (i >= 0 ? 0 : -966);
      if (status === 0 && i >= 0) held.splice(i, 1);
      return Promise.resolve({ status });
    },
  };
  return { service, requests, held };
}

function rows(o: Parameters<typeof server>[0] = {}, extra: { lobbyUp?: boolean; lobbyState?: number; ticket?: () => string | null; input?: string; service?: ClanMessagesService } = {}) {
  const s = server(o);
  const uiVars = new UiVarManager();
  const clan = new LobbyClan();
  clan.clanId = 12; clan.leader = 'mine'; clan.name = 'Tide';                           // as ONL-26's create leaves it
  const events: number[] = [];
  const c = new ClanMessagesCommands({
    uiVars, clan, service: extra.service ?? s.service, event: (kind) => { events.push(kind); }, ticket: extra.ticket, inputString: () => extra.input ?? null,
    ...(extra.lobbyUp !== undefined ? { lobbyUp: () => extra.lobbyUp! } : {}), ...(extra.lobbyState !== undefined ? { lobbyState: () => extra.lobbyState! } : {}),
  });
  const typed = (text: string): void => { uiVars.set(uiVars.add(SEND_CLAN_MESSAGE_VAR, null, 1), str(text)); };
  const value = (n: string): UiVarValue | undefined => uiVars.find(n)?.value;
  const run = (name: (typeof CLAN_MESSAGES_COMMAND_ROWS)[number]['name'], arg = 'NA'): boolean => c.entries()[name](cmd(name, arg), {} as never, undefined);
  return { ...s, uiVars, clan, events, c, typed, value, run };
}

describe('the rows (PLAT-08\'s table: 81, 138, 159, 160, 161 -- ONL-29\'s)', () => {
  it('are the table\'s, by id, function and task; registered by name, each dispatches to its body', () => {
    expect(CLAN_MESSAGES_COMMAND_ROWS.map((r) => `${r.id} ${r.name} ${r.fn.toString(16)} ${r.task}`)).toEqual([
      '81 SendClanMessage 2797f0 ONL-29', '138 GetClanMessages 279790 ONL-29', '159 GetLeaderMessages 27a0b0 ONL-29', '160 ModifyClanMessage 27a0e0 ONL-29',
      '161 DeleteClanMessage 27a1c0 ONL-29',
    ]);
    for (const r of CLAN_MESSAGES_COMMAND_ROWS) {
      const t = uiCommandRowByName(r.name)!;
      expect([t.id, t.fn, t.task, UI_COMMAND_TABLE[t.index]!.name], r.name).toEqual([r.id, r.fn, 'ONL-29', r.name]);
    }
    const host = new UiCommandHost();
    rows().c.register(host);
    for (const r of CLAN_MESSAGES_COMMAND_ROWS) expect(host.dispatch(cmd(r.name)).kind, r.name).toBe('table');
  });

  it('the names and texts are the ELF\'s: MEDIUS_CLAN_MESSAGES (S:0x3f3900), ClanLeaderMessages (S:0x3f3f20), SEND_CLAN_MESSAGE (S:0x3eedb0), S:0x3f4460, S:0x3f3f60, S:0x3f44a8, "-1" (S:0x3f3f10); five slots; start 1, page 999', () => {
    expect([MEDIUS_CLAN_MESSAGES_VAR, CLAN_LEADER_MESSAGES_VAR, SEND_CLAN_MESSAGE_VAR, CLAN_MESSAGES_RETRIEVING, NO_CLAN_MESSAGES, CLAN_MESSAGE_SEPARATOR, CLAN_MESSAGE_NEW_ID, CLAN_MESSAGE_SLOTS]).toEqual([
      'MEDIUS_CLAN_MESSAGES', 'ClanLeaderMessages', 'SEND_CLAN_MESSAGE', 'Retrieving messages from server...', 'No clan messages.', '\n', -1, 5,
    ]);
    expect(CLAN_MESSAGES_PAGE).toEqual({ start: 1, pageSize: 999 });
    expect(CLAN_MESSAGES_LATEST_REPLY_ADAPTATION).toMatch(/latest request/);
    expect(CLAN_MESSAGE_TICKET_ADAPTATION).toMatch(/ticket/);
  });
});

describe('the member\'s pane: GetClanMessages and GetMyClans\' seam (FUN_002e8460, FUN_002e84e0)', () => {
  it('the retrieving text, then GetMyClanMessages { the clan id, start 1, pageSize 999 }; each Success adds "\\n" and its text', async () => {
    const r = rows({ messages: ['Practice at eight.', 'Wear the tag.'] });
    r.c.myClanMessages();
    expect(r.value(MEDIUS_CLAN_MESSAGES_VAR)).toEqual(str(CLAN_MESSAGES_RETRIEVING));
    await flush();
    expect(r.requests).toEqual([{ op: 'messages', body: { clanId: 12, start: 1, pageSize: 999 } }]);
    expect(r.value(MEDIUS_CLAN_MESSAGES_VAR)).toEqual(arr('\n', 'Practice at eight.', '\n', 'Wear the tag.'));
    expect(r.uiVars.find(MEDIUS_CLAN_MESSAGES_VAR)!.longevity).toBe(1);
  });

  it('none (NoResult) or a refusal: "No clan messages."; a request never answered leaves the retrieving text', async () => {
    const r = rows();
    expect(r.run('GetClanMessages')).toBe(true);
    await flush();
    expect(r.value(MEDIUS_CLAN_MESSAGES_VAR)).toEqual(str(NO_CLAN_MESSAGES));
    const never = rows({}, { service: { ...server().service, myMessages: () => new Promise<readonly MyClanMessageReply[]>(() => {}) } });
    never.c.myClanMessages();
    await flush();
    expect(never.value(MEDIUS_CLAN_MESSAGES_VAR)).toEqual(str(CLAN_MESSAGES_RETRIEVING));
  });

  it('clanMessagesPane: a held array keeps its strings only, a held string is dropped; a failure after successes replaces the whole pane', () => {
    const ok = (message: string): MyClanMessageReply => ({ status: 0, clanId: 12, message, endOfList: false });
    expect(clanMessagesPane(str(CLAN_MESSAGES_RETRIEVING), ok('a'))).toEqual(arr('\n', 'a'));
    expect(clanMessagesPane({ type: 'array', value: [str('\n'), { type: 'int', value: 4 }, str('a')] }, ok('b'))).toEqual(arr('\n', 'a', '\n', 'b'));
    expect(clanMessagesPane(arr('\n', 'a'), { status: -966, clanId: 0, message: '', endOfList: true })).toEqual(str(NO_CLAN_MESSAGES));
  });

  it('sent whatever the session\'s state (FUN_002e8460 checks none); GetClanMessages answers 1', async () => {
    const r = rows({ messages: ['x'] }, { lobbyUp: false });
    expect(r.run('GetClanMessages')).toBe(true);
    await flush();
    expect(r.requests.map((q) => q.op)).toEqual(['messages']);
  });

  it('CLAN_MESSAGES_LATEST_REPLY_ADAPTATION: an earlier request\'s late replies are dropped; so are replies after the ticket changed', async () => {
    let release!: (v: readonly MyClanMessageReply[]) => void;
    let calls = 0;
    const base = server().service;
    const late = rows({}, { service: { ...base, myMessages: () => (++calls === 1 ? new Promise<readonly MyClanMessageReply[]>((res) => { release = res; }) : Promise.resolve([{ status: 0, clanId: 12, message: 'new', endOfList: true }])) } });
    late.c.myClanMessages();
    late.c.myClanMessages();
    await flush();
    release([{ status: 0, clanId: 12, message: 'old', endOfList: true }]);
    await flush();
    expect(late.value(MEDIUS_CLAN_MESSAGES_VAR)).toEqual(arr('\n', 'new'));
    let ticket: string | null = 'A';
    const lost = rows({ messages: ['x'] }, { ticket: () => ticket });
    lost.c.myClanMessages();
    ticket = 'B';
    await flush();
    expect(lost.value(MEDIUS_CLAN_MESSAGES_VAR)).toEqual(str(CLAN_MESSAGES_RETRIEVING));
  });
});

describe('the leader\'s list: GetLeaderMessages (FUN_002e6310, FUN_002e6390, FUN_002e65b0, FUN_002e6400)', () => {
  it('GetAllClanMessages { start 1, pageSize 999 }; the rows [id, text, "Message n:"] and the new row ["-1", " ", "Message n:"] below five', async () => {
    const r = rows({ messages: ['one', 'two'] });
    expect(r.run('GetLeaderMessages')).toBe(true);
    await flush();
    expect(r.requests).toEqual([{ op: 'all-messages', body: { start: 1, pageSize: 999 } }]);
    expect(r.value(CLAN_LEADER_MESSAGES_VAR)).toEqual({ type: 'array', value: [row('1', 'one', 'Message 1:'), row('2', 'two', 'Message 2:'), row('-1', ' ', 'Message 3:')] });
    expect(r.uiVars.find(CLAN_LEADER_MESSAGES_VAR)!.longevity).toBe(1);
    expect(r.c.records().map((k) => [k.clanMessageId, k.message, k.clanMessageStatus])).toEqual([[1, 'one', 3], [2, 'two', 3]]);
  });

  it('none: the NoResult reply draws the new row alone, "Message 1:"; five: no new row (the console never posts a sixth)', async () => {
    const none = rows();
    none.run('GetLeaderMessages');
    await flush();
    expect(none.value(CLAN_LEADER_MESSAGES_VAR)).toEqual({ type: 'array', value: [row('-1', ' ', 'Message 1:')] });
    const full = rows({ messages: ['a', 'b', 'c', 'd', 'e'] });
    full.run('GetLeaderMessages');
    await flush();
    expect((full.value(CLAN_LEADER_MESSAGES_VAR) as { readonly value: readonly UiVarValue[] }).value.map((x) => (x as { readonly value: readonly UiVarValue[] }).value[2])).toEqual(
      ['Message 1:', 'Message 2:', 'Message 3:', 'Message 4:', 'Message 5:'].map(str));
  });

  it('the reply: an id already kept is not kept again; a failure draws the list as kept; the list is drawn only at the end of the list', () => {
    const r = rows();
    const ok = (id: number, message: string, endOfList = false): ClanMessageReply => ({ status: 0, clanMessageId: id, message, clanMessageStatus: 3, endOfList });
    r.c.leaderMessagesReply(ok(4, 'a'));
    expect(r.value(CLAN_LEADER_MESSAGES_VAR)).toBeUndefined();
    r.c.leaderMessagesReply(ok(4, 'again'));
    r.c.leaderMessagesReply({ status: -966, clanMessageId: 0, message: '', clanMessageStatus: 0, endOfList: true });
    expect(r.value(CLAN_LEADER_MESSAGES_VAR)).toEqual({ type: 'array', value: [row('4', 'a', 'Message 1:'), row('-1', ' ', 'Message 2:')] });
    expect(clanLeaderMessageRows([])).toEqual([row('-1', ' ', 'Message 1:')]);
  });

  it('sent whatever the session\'s state; the kept messages emptied at the request, before any reply', async () => {
    const r = rows({ messages: ['one'] }, { lobbyUp: false });
    r.run('GetLeaderMessages');
    await flush();
    expect(r.c.records()).toHaveLength(1);
    const never = rows({ messages: ['one'], hangAll: (n) => n > 1 });
    never.run('GetLeaderMessages');
    await flush();
    never.run('GetLeaderMessages');
    expect(never.c.records()).toEqual([]);
  });
});

describe('ModifyClanMessage (FUN_0027a0e0 -> FUN_002e60c0): the post on "-1", the edit of a kept id', () => {
  it('the "-1" row: SendClanMessage { the text }; its Success asks the list again; a refusal shows nothing and asks nothing', async () => {
    const r = rows({}, { input: '-1' });
    r.run('GetLeaderMessages');
    await flush();
    r.typed('Practice at eight.');
    r.requests.length = 0;
    expect(r.run('ModifyClanMessage', 'INPUT_STRING')).toBe(true);
    await flush();
    expect(r.requests).toEqual([{ op: 'send-message', body: { message: 'Practice at eight.' } }, { op: 'all-messages', body: { start: 1, pageSize: 999 } }]);
    expect(r.value(CLAN_LEADER_MESSAGES_VAR)).toEqual({ type: 'array', value: [row('1', 'Practice at eight.', 'Message 1:'), row('-1', ' ', 'Message 2:')] });
    const refused = rows({ sendStatus: -956 }, { input: '-1' });
    refused.typed('x');
    refused.run('ModifyClanMessage', 'INPUT_STRING');
    await flush();
    expect([refused.requests.map((q) => q.op), refused.events]).toEqual([['send-message'], []]);
  });

  it('the "-1" row with the session down or out of state 11: nothing sent, no event; the row still answers 1', async () => {
    for (const extra of [{ lobbyUp: false }, { lobbyState: 9 }]) {
      const r = rows({}, { input: '-1', ...extra });
      r.typed('x');
      expect(r.run('ModifyClanMessage', 'INPUT_STRING')).toBe(true);
      await flush();
      expect([r.requests, r.events]).toEqual([[], []]);
    }
  });

  it('a kept id: ModifyClanMessage { the id, the text }, sent whatever the session\'s state; its Success asks the list again', async () => {
    const r = rows({ messages: ['one', 'two'] }, { input: '2', lobbyUp: false });
    r.run('GetLeaderMessages');
    await flush();
    r.typed('TWO');
    r.requests.length = 0;
    r.run('ModifyClanMessage', 'INPUT_STRING');
    await flush();
    expect(r.requests).toEqual([{ op: 'modify-message', body: { clanMessageId: 2, newMessage: 'TWO' } }, { op: 'all-messages', body: { start: 1, pageSize: 999 } }]);
    expect(r.held.map((h) => h.text)).toEqual(['one', 'TWO']);
    const silent = rows({ messages: ['one'], modifyStatus: -966 }, { input: '1' });
    silent.run('GetLeaderMessages');
    await flush();
    silent.typed('x');
    silent.requests.length = 0;
    silent.run('ModifyClanMessage', 'INPUT_STRING');
    await flush();
    expect([silent.requests.map((q) => q.op), silent.events]).toEqual([['modify-message'], []]);
  });

  it('refused before any request: an empty text CLAN_MESSAGE_EMPTY (even with the session down); an id not kept CLAN_MESSAGE_ID_ERR', async () => {
    const empty = rows({}, { input: '-1', lobbyUp: false });
    empty.typed('');
    empty.run('ModifyClanMessage', 'INPUT_STRING');
    const stale = rows({ messages: ['one'] }, { input: '7' });
    stale.run('GetLeaderMessages');
    await flush();
    stale.typed('x');
    stale.requests.length = 0;
    stale.run('ModifyClanMessage', 'INPUT_STRING');
    await flush();
    expect([empty.events, empty.requests, stale.events, stale.requests]).toEqual([[E.CLAN_MESSAGE_EMPTY], [], [E.CLAN_MESSAGE_ID_ERR], []]);
  });

  it('SEND_CLAN_MESSAGE holding no string: 1 and nothing (the variable added TEMPORARY); an argument that is not INPUT_STRING is read by strtol', async () => {
    const r = rows({ messages: ['one'] });
    expect(r.run('ModifyClanMessage', 'INPUT_STRING')).toBe(true);
    expect([r.uiVars.find(SEND_CLAN_MESSAGE_VAR)?.longevity, r.events, r.requests]).toEqual([1, [], []]);
    r.run('GetLeaderMessages');
    await flush();
    r.typed('by arg');
    r.requests.length = 0;
    r.run('ModifyClanMessage', '1');
    await flush();
    expect(r.requests[0]).toEqual({ op: 'modify-message', body: { clanMessageId: 1, newMessage: 'by arg' } });
  });

  it('CLAN_MESSAGE_TICKET_ADAPTATION: a post answered after the ticket changed does not ask the list again', async () => {
    let ticket: string | null = 'A';
    const r = rows({}, { input: '-1', ticket: () => ticket });
    r.typed('x');
    r.run('ModifyClanMessage', 'INPUT_STRING');
    ticket = 'B';
    await flush();
    expect(r.requests.map((q) => q.op)).toEqual(['send-message']);
  });
});

describe('DeleteClanMessage (FUN_0027a1c0 -> FUN_002e6010) and SendClanMessage (FUN_002797f0 -> FUN_002e8310)', () => {
  it('a row\'s id: DeleteClanMessage { the id }, with no check of the list or the session; its Success asks the list again; "-1" sends nothing; a failure is silent', async () => {
    const r = rows({ messages: ['one', 'two'] }, { input: '1', lobbyUp: false });
    expect(r.run('DeleteClanMessage', 'INPUT_STRING')).toBe(true);
    await flush();
    expect(r.requests).toEqual([{ op: 'delete-message', body: { clanMessageId: 1 } }, { op: 'all-messages', body: { start: 1, pageSize: 999 } }]);
    expect(r.value(CLAN_LEADER_MESSAGES_VAR)).toEqual({ type: 'array', value: [row('2', 'two', 'Message 1:'), row('-1', ' ', 'Message 2:')] });
    const none = rows({}, { input: '-1' });
    none.run('DeleteClanMessage', 'INPUT_STRING');
    const failed = rows({ deleteStatus: -966 }, { input: '9' });
    failed.run('DeleteClanMessage', 'INPUT_STRING');
    await flush();
    expect([none.requests, failed.requests.map((q) => q.op), failed.events]).toEqual([[], ['delete-message'], []]);
  });

  it('SendClanMessage: SEND_CLAN_MESSAGE posted while the session is up in state 11; an empty text CLAN_MESSAGE_EMPTY; down, nothing at all; 1 each time', async () => {
    const r = rows();
    r.typed('posted');
    expect(r.run('SendClanMessage')).toBe(true);
    await flush();
    expect(r.requests).toEqual([{ op: 'send-message', body: { message: 'posted' } }, { op: 'all-messages', body: { start: 1, pageSize: 999 } }]);
    const empty = rows();
    empty.typed('');
    expect(empty.run('SendClanMessage')).toBe(true);
    const down = rows({}, { lobbyUp: false });
    down.typed('');
    expect(down.run('SendClanMessage')).toBe(true);
    const absent = rows();
    expect(absent.run('SendClanMessage')).toBe(true);
    await flush();
    expect([empty.events, empty.requests, down.events, down.requests, absent.requests]).toEqual([[E.CLAN_MESSAGE_EMPTY], [], [], [], []]);
  });
});

// ---- the pages over the machine ----

type Rig = ReturnType<typeof worldRig>;
const go = (r: Rig, name: string): void => { for (let i = 0; i < 14 && r.focused() !== name; i++) r.press('DOWN', 6); expect(r.focused()).toBe(name); };
const loc = (r: Rig, id: number): string => r.loc.byId.get(id)!.trim();
const popupText = (r: Rig): string => (r.parts.current?.popup()?.popup.text.lines ?? []).map((l) => new TextDecoder().decode(Uint8Array.from(l.bytes)).trim()).join(' ');
const listbox = (r: Rig, name: string): ListboxWidget => r.parts.current!.widgets.get(name) as ListboxWidget;
const items = (r: Rig): string[][] => listbox(r, 'ClanMessageList').items.map((i) => i.captions);
const enabled = (r: Rig, name: string): boolean => (r.parts.current!.widgets.get(name) as unknown as { enabled: boolean }).enabled;

/** SOCOM II ONLINE past SERVER NEWS with this task's rows over the fake server. */
async function world(o: Parameters<typeof server>[0] = {}) {
  const s = server(o);
  let w!: WorldOfSocomCommands;
  let msgs!: ClanMessagesCommands;
  const r = worldRig({
    name: 'socomc', announcement: '', keyboard: true,
    register: (host, ctx) => {
      w = ctx.world()!;
      msgs = new ClanMessagesCommands({
        uiVars: ctx.uiVars, clan: w.clan, service: s.service, event: (kind) => { ctx.event(kind); }, inputString: (c) => ctx.machine().shell()?.inputString(c.anim) ?? null,
      });
      msgs.register(host);
    },
  });
  await r.settle(SETTLED);
  r.press('CROSS', 10);
  return { r, ...s, world: w, msgs };
}

/** The leader's roster as CREATE CLAN's success leaves the client's clan, through SOCOM II ONLINE's CLAN row, run to its build. */
async function leaderPage(o: Parameters<typeof server>[0] = {}) {
  const x = await world(o);
  const { r } = x;
  x.world.clan.clanId = 12; x.world.clan.leader = 'mine'; x.world.clan.name = 'Tide';   // the create's success, after init_screen's GetClan (the rig's no-clan answer)
  r.uiVars.set(r.uiVars.add('CLANNAMEVAR', null, 2), str('Tide'));
  go(r, 'ClanManage');
  r.press('CROSS', 2);
  for (let i = 0; i < 120 && r.current() !== MANAGE_ROSTER_LEADER; i++) await r.settle(1);
  await r.settle(SETTLED);
  return x;
}

/** EDIT NEWS' CROSS: the list enabled and active. */
async function editNews(r: Rig): Promise<void> {
  go(r, 'EditNews');
  r.press('CROSS', 6);
  await r.settle(4);
}

describe.skipIf(!HAVE)(`the MESSAGES band over the machine${HAVE ? '' : ' (no disc and no fixtures)'}`, () => {
  it('a player in no clan: GetMyClans\' no-clan reply (ONL-27\'s GetClan, the rig\'s NoResult) asks nothing -- the band keeps the session\'s empty string', async () => {
    const { r, requests } = await world({ messages: ['Practice at eight.'] });
    go(r, 'newsandmessages');
    expect([requests, r.uiVars.find(MEDIUS_CLAN_MESSAGES_VAR)!.value, r.text('ClanMessages'), r.text('ClanMessageText')]).toEqual([[], str(''), [], [loc(r, 775)]]);
  });

  it('GetMyClans\' seam: the band under #775 draws each message after its "\\n"; none, "No clan messages."', async () => {
    const some = await world({ messages: ['Practice at eight.', 'Wear the tag.'] });
    go(some.r, 'newsandmessages');
    some.msgs.myClanMessages();
    expect(some.r.text('ClanMessages')).toEqual([CLAN_MESSAGES_RETRIEVING]);              // the widget reads the variable as it stands
    await some.r.settle(6);
    expect(some.requests).toEqual([{ op: 'messages', body: { clanId: -1, start: 1, pageSize: 999 } }]);   // the client's clan as the no-clan reply leaves it
    expect(some.r.text('ClanMessages').filter((l) => l.trim() !== '')).toEqual(['Practice at eight.', 'Wear the tag.']);
    expect([some.r.node('ClanMessageText')!.visible, some.r.text('ClanMessageText')]).toEqual([true, ['Clan messages']]);
    const none = await world();
    none.msgs.myClanMessages();
    await none.r.settle(6);
    expect(none.r.text('ClanMessages')).toEqual([NO_CLAN_MESSAGES]);
  });

  // NU-13 (web research 274 §9): the member's band as `dlgWorldOfSOCOM.rdr` lays it out -- `motd` at (205, 125); under it
  // `ClanMessages` (WRAPPEDTEXT on MEDIUS_CLAN_MESSAGES) at (-5, 125), WIDTH 400, SPACING 16, HEIGHT 160, SCALE 0.9, and
  // `ClanMessageText` (#775) at (-5, 103) -- drawn by the screen's WRAPPEDTEXT path (`FUN_003794b0`: line k's pen
  // (x, int(y + k x SPACING - 3)), D:L273144; the scissor from (x, int(-4 + y - SPACING)) to (x + WIDTH,
  // int(-4 + y + HEIGHT - SPACING)), D:L273114-273124). The test face holds A, B and C only, so the messages are spelt in them.
  it('NU-13: the band as laid out -- the messages\' lines at (200, 247 + 16 k) under the scissor (200, 230)-(600, 390); "Clan messages" at (200, 228)', async () => {
    const { r, msgs } = await world({ messages: ['AB CA', 'BC'] });
    go(r, 'newsandmessages');
    msgs.myClanMessages();
    await r.settle(6);
    const band = r.node('ClanMessages')!, head = r.node('ClanMessageText')!, motd = r.node('motd')!;
    expect([motd.x, motd.y, band.x, band.y, head.x, head.y]).toEqual([205, 125, -5, 125, -5, 103]);
    const c = band.content;
    if (c?.kind !== 'wrapped') throw new Error('ClanMessages is not a wrapped text');
    expect([c.spec.width, c.spec.spacing, c.spec.height, c.spec.scale]).toEqual([400, 16, 160, Math.fround(0.9)]);
    const face = c.text.face!;
    type Glyphs = Extract<ReturnType<Rig['last']>[number], { kind: 'glyphs' }>;
    const runs = r.last().filter((i): i is Glyphs => i.kind === 'glyphs');
    const own = (g: Glyphs) => g.quads.find((q) => !q.shadow)!;
    const at = (codes: number[], x: number, y: number, scale: number) => {
      const q = layoutText(face, codes, x, y, { scale, color: [0, 0, 0], alpha: 0 }).quads.find((g) => !g.shadow)!;
      return [q.left, q.top];
    };
    const lines = c.lines.map((l, k) => ({ text: String.fromCharCode(...l.bytes), k, codes: l.codes })).filter((l) => l.text.trim() !== '');
    expect(lines.map((l) => l.text)).toEqual(['AB CA', 'BC']);
    for (const l of lines) {
      const run = runs.find((g) => g.node === 'ClanMessages' && String.fromCharCode(...g.quads.filter((q) => !q.shadow).map((q) => q.code)) === l.text)!;
      expect([own(run).left, own(run).top, run.clip]).toEqual([...at(l.codes, 200, 247 + 16 * l.k, fmul(c.spec.scale, face.scale)), { x0: 200, y0: 230, x1: 600, y1: 390 }]);
    }
    const title = runs.find((g) => g.node === 'ClanMessageText')!;
    const t = head.content?.kind === 'text' ? head.content.text : null;
    expect([own(title).left, own(title).top]).toEqual(at(t!.codes, 200 + t!.x, 228 + t!.y, t!.scale));
  });
});

describe.skipIf(!HAVE)(`the leader's EDIT NEWS over the machine${HAVE ? '' : ' (no disc and no fixtures)'}`, () => {
  it('ONSTART asks the list (MRosterLeaderStartData); EDIT NEWS\' help #485, its CROSS #498 with the list enabled and active; the rows drawn', async () => {
    const { r, requests } = await leaderPage({ messages: ['one'] });
    expect(r.calls(MANAGE_ROSTER_LEADER)).toContain('GetLeaderMessages(NA) table');
    expect(requests.filter((q) => q.op === 'all-messages')).toEqual([{ op: 'all-messages', body: { start: 1, pageSize: 999 } }]);
    expect(r.focused()).toBe('EditNews');
    expect(r.text('DescriptionText')).toEqual([loc(r, 485)]);
    expect([loc(r, 475), loc(r, 485), loc(r, 498)]).toEqual(['EDIT NEWS', '¦ Edit your Clan news.', '¦ Edit. · Delete. ¬ Cancel.']);
    await editNews(r);
    expect([r.focused(), enabled(r, 'ClanMessageList'), r.text('DescriptionText')]).toEqual(['ClanMessageList', true, [loc(r, 498)]]);
    expect(items(r).map((c) => c[0])).toEqual(['1', '-1']);
  });

  it('a post: the "-1" row\'s CROSS opens the keyboard -- ChatSkb on SEND_CLAN_MESSAGE, titled #497, 199 characters of 199 bytes; ENTER posts it and the list is asked again', async () => {
    const { r, requests } = await leaderPage();
    await editNews(r);
    const from = r.outcomes.length;
    r.press('CROSS', 6);
    expect(r.calls(MANAGE_ROSTER_LEADER, from)).toEqual(expect.arrayContaining(['ClearUIVar(SEND_CLAN_MESSAGE) table', 'GetTextInput(SEND_CLAN_MESSAGE) table']));
    expect(r.skb!.keyboard.isOpen).toBe(true);
    expect(r.skb!.keyboard.request).toMatchObject({ uiVar: SEND_CLAN_MESSAGE_VAR, skbName: 'ChatSkb', purpose: '_497_EnterMessageClan_MSG', maxChars: 199, maxBytes: 199, maxChars2: 14, maxBytes2: 31 });
    expect(loc(r, 497)).toBe('Enter a Message to Send to Clan.');
    requests.length = 0;
    r.type('Practice at eight');
    await r.settle(20);
    expect(r.calls(MANAGE_ROSTER_LEADER, from)).toContain('ModifyClanMessage(INPUT_STRING) table');
    expect(requests.slice(0, 2)).toEqual([{ op: 'send-message', body: { message: 'Practice at eight' } }, { op: 'all-messages', body: { start: 1, pageSize: 999 } }]);
    expect(items(r).map((c) => c[0])).toEqual(['1', '-1']);
    expect(r.shown()).toBe(false);
  });

  it('an edit: a kept row\'s CROSS and the text -- ModifyClanMessage of its id; a delete: its CIRCLE -- DeleteClanMessage of its id; each asks the list again', async () => {
    const { r, requests, held } = await leaderPage({ messages: ['one', 'two'] });
    await editNews(r);
    r.press('DOWN', 6);
    r.press('CROSS', 6);
    requests.length = 0;
    r.type('TWO');
    await r.settle(20);
    expect(requests.slice(0, 2)).toEqual([{ op: 'modify-message', body: { clanMessageId: 2, newMessage: 'TWO' } }, { op: 'all-messages', body: { start: 1, pageSize: 999 } }]);
    expect(held.map((h) => h.text)).toEqual(['one', 'TWO']);
    requests.length = 0;
    r.press('CIRCLE', 10);
    await r.settle(10);
    expect(requests.slice(0, 2).map((q) => q.op)).toEqual(['delete-message', 'all-messages']);
    expect(held).toHaveLength(1);
    expect(items(r).map((c) => c[0])).toHaveLength(2);
  });

  it('a blank post after a post (SEND_CLAN_MESSAGE cleared, the keyboard\'s empty ENTER a cancel): CLAN_MESSAGE_EMPTY -- #504', async () => {
    const { r, requests } = await leaderPage();
    await editNews(r);
    r.press('CROSS', 6);
    r.type('first');
    await r.settle(20);
    r.press('CROSS', 6);
    requests.length = 0;
    r.type('');
    await r.settle(20);
    expect(requests.filter((q) => q.op === 'send-message')).toEqual([]);
    expect([r.shown(), popupText(r), loc(r, 504)]).toEqual([true, loc(r, 504), 'You cannot post blank messages. ¦ CONTINUE.']);
  });

  it('a stale row (the list asked again and not answered: the kept messages emptied): its edit raises CLAN_MESSAGE_ID_ERR -- #503', async () => {
    const { r, requests } = await leaderPage({ messages: ['one'], hangAll: (n) => n > 1 });
    await editNews(r);
    r.press('CROSS', 6);                                                                 // the row "1"
    r.type('second');                                                                    // the edit's success asks the list again: never answered
    await r.settle(20);
    expect([requests.filter((q) => q.op === 'modify-message').length, items(r).map((c) => c[0])]).toEqual([1, ['1', '-1']]);
    r.press('CROSS', 6);                                                                 // the row "1" still drawn, no longer kept
    requests.length = 0;
    r.type('edit');
    await r.settle(20);
    expect(requests.filter((q) => q.op === 'modify-message')).toEqual([]);
    expect([r.shown(), popupText(r), loc(r, 503)]).toEqual([true, loc(r, 503), 'That message could not be deleted. ¦ CONTINUE.']);
  });

  // NU-13 (the owner's playtest, 2026-10-15: "some centering issues with the messages"; web research 274 §9): the rows as
  // `dlgManageRosterLeader.rdr` lays them out -- `ClanMessageList` at (180, 183), 447 wide, SPACING 17, SCALE 0.8,
  // TOP_MARGIN 25, LEFT_MARGIN 10, HIGHLIGHT_OFFSET -6; its columns the id (POSITION -300), the message (WRAPPED_TEXT,
  // POSITION 90, TOP_OFFSET 3, MAXWIDTH 330) and "Message n:" (POSITION 0) -- through the list's draw `FUN_00373850`
  // (D:L269930-270073), the row's cells `FUN_0037ab90` (D:L273817-273900) and the wrapped cell's draw `FUN_0037be90`
  // (D:L274473-274489) -> `FUN_003794b0` (line 0's pen 3 above the cell's, D:L273144): the message's first line stands on
  // its label's row, 90 to its right; the bar spans the list.
  it('NU-13: the rows as laid out -- the bar (180, 189) 447 x 17, "Message 1:" at (190, 208), the message\'s first line at (280, 208) on the same row', async () => {
    const { r } = await leaderPage({ messages: ['Sup nerds'] });
    await editNews(r);
    await r.settle(2);
    const l = listbox(r, 'ClanMessageList');
    const s = l.spec;
    expect([r.node('ClanMessageList')!.x, r.node('ClanMessageList')!.y, l.image.w, s.spacing, s.scale, s.topMargin, s.leftMargin, s.highlightOffset]).toEqual([
      180, 183, 447, 17, Math.fround(0.8), 25, 10, -6,
    ]);
    expect(s.columns.map((c) => [c.kind, c.position, c.topOffset, c.maxWidth])).toEqual([[1, -300, 0, 1000], [3, 90, 3, 330], [1, 0, 0, 1000]]);
    expect(items(r)).toEqual([['1', 'Sup nerds', 'Message 1:'], ['-1', ' ', 'Message 2:']]);
    // the bar: (180, int(0 - 6 + 208 - 0.75 x 17) = 189), the list's width, one row.
    expect(l.placed.highlight).toEqual({ x: 180, y: 189, w: 447, h: 17 });
    const cell = (item: number, column: number) => l.placed.cells.find((c) => c.item === item && c.column === column)!;
    expect([cell(0, 2).x, cell(0, 2).y]).toEqual([190, 208]);                              // "Message 1:": (180 + 10 + 0, 183 + 25)
    expect([cell(0, 1).kind, cell(0, 1).x, cell(0, 1).y, cell(0, 1).lines]).toEqual(['wrapped', 280, 211, [{ x: 280, y: 208 }]]);
    expect([cell(1, 2).x, cell(1, 2).y]).toEqual([190, 225]);                              // "Message 2:": the next row
  });
});
