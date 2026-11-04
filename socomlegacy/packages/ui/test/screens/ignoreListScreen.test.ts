import { describe, expect, it } from 'vitest';
import { DIALOG_EVENTS } from '../../src/dialog';
import { SKB_FN, SKB_KEY_TYPE } from '../../src/keyboard';
import { UiCommandHost, UI_COMMAND_TABLE, uiCommandRowByName } from '../../src/uiCommands';
import { UiVarManager, type UiVarValue } from '../../src/uiVars';
import type { ZAnimUiCommand } from '../../src/zanimRuntime';
import type { ListboxWidget } from '../../src/widgets/listbox';
import { OptionGlobals, OptionsCommands, COPY_UI_VAR_DIALOGS } from '../../src/screens/optionsCommands';
import { BRIEFING_ROOM, BRIEFING_ROOM_ENTRY_COMMANDS } from '../../src/screens/briefingRoomCommands';
import { PARKED_ROWS, WORLD_OF_SOCOM_ENTRY_COMMANDS, type ChannelListEntry } from '../../src/screens/worldOfSocomCommands';
import {
  IGNORE_ADD_TICKET_ADAPTATION, IGNORE_LIST, IGNORE_LIST_COMMAND_ROWS, IGNORE_LIST_VAR, IGNORE_STATUS_GLYPH, IgnoreListCommands, PLAYER_IGNORE_NAME_VAR, ignoreListRows,
  type IgnoreListEntry, type IgnoreListService,
} from '../../src/screens/ignoreListCommands';
import { HAVE, WORLD, worldRig } from './worldOfSocomRig';
import { briefingRig } from './briefingRoomRig';

/**
 * ONL-25 (web research 269 §1): IGNORE (`dlgIgnoreList.rdr`) and the ignore list's three rows -- `GetIgnoreList`
 * (`FUN_0027a280` D:L124333-124340 -> `FUN_00300f00` D:L202303-202318, its reply `FUN_00300f70` D:L202321-202340, the
 * insert `FUN_00301ed0` D:L202884-202948, the draw `FUN_00301920` D:L202685-202721), `AddToIgnore` (`FUN_00279f50`
 * D:L124215-124230 -> `FUN_00300c50` D:L202208-202244, `FUN_00300db0` D:L202246-202273, `FUN_00300e60`
 * D:L202275-202301) and `RemoveFromIgnore` (`FUN_002798e0` D:L123996-124014 -> `FUN_00300fe0` D:L202343-202366,
 * `FUN_003010c0` D:L202370-202390).
 * - The rows off the machine, over the service's fake.
 * - The page over the machine, built from the disc's layout and set (or the committed fixtures): reached by SOCOM II
 *   ONLINE's IGNORE row (`Goto_Ignore`, unparked), the list drawn from a seeded list, ADD by name through the keyboard
 *   (found, not found, the list full, already listed) and REMOVE of the selected row, each with the original's popups,
 *   and the way back.
 * - The briefing room's chat keyboard's IGNORE key (`on_skb_apply_2`: `CopyUIVar` CHATMESSAGE -> PLAYER_IGNORE_NAME,
 *   then `AddToIgnore`).
 * Synthetic lists; nothing measured on the original running (ONL-32's transcripts are the proven level).
 */

const SETTLED = 60;
const cmd = (fn: string, arg = 'NA', anim = 'OnIgnoreListStart'): ZAnimUiCommand => ({ anim, sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg, loc: 0, bytes: new Uint8Array(0x10) });
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const entry = (id: number, name: string, playerStatus = 0, endOfList = false): IgnoreListEntry => ({ status: 0, ignoreAccountId: id, ignoreAccountName: name, playerStatus, endOfList });
/** Horizon's answer for an empty list (desktop@be557831 `MLS.cs:799-807`): one NoResult row ending it. */
const NO_ROWS: IgnoreListEntry = { status: 1, ignoreAccountId: 0, ignoreAccountName: '', playerStatus: 0, endOfList: true };
const str = (value: string): UiVarValue => ({ type: 'string', value });
const row = (id: number, name: string, glyph: string): UiVarValue => ({ type: 'array', value: [str(String(id)), str(name), str(glyph)] });

/** A server's list over the service's four calls: the accounts by name, the list, the add's and the remove's answers. */
function server(o: { accounts?: Record<string, number>; listed?: number[]; addStatus?: number; removeStatus?: number; status?: Record<number, number> } = {}) {
  const accounts = o.accounts ?? { bob: 42, Carol: 43, dave: 44 };
  const names = new Map(Object.entries(accounts).map(([n, id]) => [id, n]));
  let listed = [...(o.listed ?? [])];
  const requests: { op: string; body: unknown }[] = [];
  const service: IgnoreListService = {
    list: () => {
      requests.push({ op: 'ignore-list', body: {} });
      const rows = listed.map((id, i) => entry(id, names.get(id) ?? '', o.status?.[id] ?? 0, i === listed.length - 1));
      return Promise.resolve(rows.length ? rows : [NO_ROWS]);
    },
    accountId: (q) => {
      requests.push({ op: 'account-id', body: q });
      const id = Object.entries(accounts).find(([n]) => n.toLowerCase() === q.name.toLowerCase())?.[1];
      return Promise.resolve(id === undefined ? { status: -998, accountId: 0 } : { status: 0, accountId: id });
    },
    add: (q) => {
      requests.push({ op: 'ignore-add', body: q });
      const status = o.addStatus ?? 0;
      if (status === 0 && !listed.includes(q.ignoreAccountId)) listed.push(q.ignoreAccountId);
      return Promise.resolve({ status });
    },
    remove: (q) => {
      requests.push({ op: 'ignore-remove', body: q });
      const status = o.removeStatus ?? 0;
      if (status === 0) listed = listed.filter((id) => id !== q.ignoreAccountId);
      return Promise.resolve({ status });
    },
  };
  return { service, requests, listed: () => listed };
}

function rows(o: Parameters<typeof server>[0] = {}, extra: { ticket?: () => string | null; input?: string | null } = {}) {
  const s = server(o);
  const uiVars = new UiVarManager();
  const events: number[] = [];
  const c = new IgnoreListCommands({ uiVars, service: s.service, event: (kind) => { events.push(kind); }, inputString: () => extra.input ?? null, ticket: extra.ticket });
  const drawn = (): UiVarValue | undefined => uiVars.find(IGNORE_LIST_VAR)?.value;
  const typed = (name: string): void => { uiVars.set(uiVars.add(PLAYER_IGNORE_NAME_VAR, null, 1), str(name)); };
  return { ...s, uiVars, events, c, drawn, typed };
}

describe('the rows (PLAT-08\'s table: 165 GetIgnoreList, 166 RemoveFromIgnore, 167 AddToIgnore, ONL-25\'s)', () => {
  it('are the table\'s, by id, function and task; registered by name, each answers 1', () => {
    expect(IGNORE_LIST_COMMAND_ROWS.map((r) => `${r.id} ${r.name} ${r.fn.toString(16)} ${r.task}`)).toEqual([
      '165 GetIgnoreList 27a280 ONL-25', '166 RemoveFromIgnore 2798e0 ONL-25', '167 AddToIgnore 279f50 ONL-25',
    ]);
    for (const r of IGNORE_LIST_COMMAND_ROWS) {
      const t = uiCommandRowByName(r.name)!;
      expect([t.id, t.fn, t.task, t.answer], r.name).toEqual([r.id, r.fn, r.task, true]);
      expect(UI_COMMAND_TABLE[t.index]!.name).toBe(r.name);
    }
    const host = new UiCommandHost();
    rows().c.register(host);
    for (const r of IGNORE_LIST_COMMAND_ROWS) expect(host.dispatch(cmd(r.name)).kind, r.name).toBe('table');
  });

  it('the names the bodies use are the ELF\'s: IgnoreListVar (S:0x3f6150), PLAYER_IGNORE_NAME (S:0x3eee00), the glyphs 0xAA / 0xA7 (S:0x3f6140, S:0x3f6148)', () => {
    expect([IGNORE_LIST, IGNORE_LIST_VAR, PLAYER_IGNORE_NAME_VAR]).toEqual(['dlgIgnoreList.rdr', 'IgnoreListVar', 'PLAYER_IGNORE_NAME']);
    expect([IGNORE_STATUS_GLYPH.disconnected.charCodeAt(0), IGNORE_STATUS_GLYPH.other.charCodeAt(0)]).toEqual([0xaa, 0xa7]);
  });
});

describe('GetIgnoreList (FUN_00300f00, its reply FUN_00300f70, the draw FUN_00301920)', () => {
  it('the list emptied and asked; each Success row kept, the list drawn at the row ending it: ["%d" of the id, the name, the glyph]', async () => {
    const r = rows({ listed: [42, 43], status: { 43: 2 } });
    expect(r.c.GetIgnoreList(cmd('GetIgnoreList'), {} as never, undefined)).toBe(true);
    expect(r.requests).toEqual([{ op: 'ignore-list', body: {} }]);
    expect(r.drawn()).toBeUndefined();                                                // nothing until the reply
    await flush();
    expect(r.drawn()).toEqual({ type: 'array', value: [row(42, 'bob', '\xaa'), row(43, 'Carol', '\xa7')] });
    expect(r.uiVars.find(IGNORE_LIST_VAR)!.longevity).toBe(1);                        // FUN_003857c0(.., 0, 1): TEMPORARY
    expect(r.c.records().map((x) => x.ignoreAccountId)).toEqual([42, 43]);
  });

  it('Horizon\'s NoResult row draws the list as it stands: empty', async () => {
    const r = rows();
    r.c.GetIgnoreList(cmd('GetIgnoreList'), {} as never, undefined);
    await flush();
    expect(r.drawn()).toEqual({ type: 'array', value: [] });
  });

  it('one row per account id (FUN_00301ed0 D:L202914-202921); a non-Success row draws what is held; rows after it are kept', () => {
    const r = rows();
    r.c.listReply([entry(42, 'bob'), entry(42, 'bob again'), { ...NO_ROWS, endOfList: false }]);
    expect(r.drawn()).toEqual({ type: 'array', value: [row(42, 'bob', '\xaa')] });
    r.c.listReply([entry(44, 'dave', 3, true)]);
    expect(r.drawn()).toEqual({ type: 'array', value: [row(42, 'bob', '\xaa'), row(44, 'dave', '\xa7')] });
  });

  it('the rows as FUN_00301920 builds them (ignoreListRows)', () => {
    expect(ignoreListRows([entry(7, 'x', 0), entry(-3, 'y', 1)])).toEqual([row(7, 'x', '\xaa'), row(-3, 'y', '\xa7')]);
  });

  it('IGNORE_LIST_LATEST_REPLY_ADAPTATION: a reply to an older request, or under a ticket no longer held, is dropped', async () => {
    let ticket: string | null = 'T1';
    const r = rows({ listed: [42] }, { ticket: () => ticket });
    r.c.GetIgnoreList(cmd('GetIgnoreList'), {} as never, undefined);
    ticket = 'T2';
    await flush();
    expect(r.drawn()).toBeUndefined();
    r.c.GetIgnoreList(cmd('GetIgnoreList'), {} as never, undefined);
    await flush();
    expect(r.drawn()).toEqual({ type: 'array', value: [row(42, 'bob', '\xaa')] });
  });
});

describe('AddToIgnore (FUN_00279f50 -> FUN_00300c50, FUN_00300db0, FUN_00300e60)', () => {
  it('found: AccountGetID\'s stand-in by the typed name, AddToIgnoreList with the account, then the list asked again and drawn', async () => {
    const r = rows();
    r.typed('bob');
    expect(r.c.AddToIgnore(cmd('AddToIgnore', 'NA', 'OnIgnorePress'), {} as never, undefined)).toBe(true);
    await flush(); await flush();
    expect(r.requests).toEqual([{ op: 'account-id', body: { name: 'bob' } }, { op: 'ignore-add', body: { ignoreAccountId: 42 } }, { op: 'ignore-list', body: {} }]);
    expect(r.drawn()).toEqual({ type: 'array', value: [row(42, 'bob', '\xaa')] });
    expect(r.events).toEqual([]);
  });

  it('a name already on the list (case-blind, FUN_00198b80) raises PLAYER_IS_IGNORED and sends nothing', async () => {
    const r = rows({ listed: [42] });
    r.c.GetIgnoreList(cmd('GetIgnoreList'), {} as never, undefined);
    await flush();
    r.requests.length = 0;
    r.typed('BOB');
    r.c.AddToIgnore(cmd('AddToIgnore'), {} as never, undefined);
    await flush();
    expect([r.requests, r.events]).toEqual([[], [DIALOG_EVENTS.PLAYER_IS_IGNORED]]);
  });

  it('not found: MP_PLAYER_NOT_FOUND, no add; any refused add (the cap\'s -956, a DBError): MP_IGNORE_LIST_FULL, the list not asked', async () => {
    const lost = rows();
    lost.typed('nobody');
    lost.c.AddToIgnore(cmd('AddToIgnore'), {} as never, undefined);
    await flush(); await flush();
    expect([lost.requests.map((q) => q.op), lost.events]).toEqual([['account-id'], [DIALOG_EVENTS.MP_PLAYER_NOT_FOUND]]);
    for (const status of [-956, -988]) {
      const full = rows({ addStatus: status });
      full.typed('dave');
      full.c.AddToIgnore(cmd('AddToIgnore'), {} as never, undefined);
      await flush(); await flush();
      expect([full.requests.map((q) => q.op), full.events], String(status)).toEqual([['account-id', 'ignore-add'], [DIALOG_EVENTS.MP_IGNORE_LIST_FULL]]);
    }
  });

  it('IGNORE_ADD_TICKET_ADAPTATION: a lookup or an add answered after the session\'s ticket changed (a logoff and another login) goes no further', async () => {
    let ticket: string | null = 'T1';
    const lookup = rows({}, { ticket: () => ticket });
    lookup.typed('bob');
    lookup.c.AddToIgnore(cmd('AddToIgnore'), {} as never, undefined);
    ticket = 'T2';                                                                    // before AccountGetID's answer lands
    await flush(); await flush();
    expect([lookup.requests.map((q) => q.op), lookup.events]).toEqual([['account-id'], []]);
    ticket = 'T1';
    const refused = rows({ addStatus: -956 }, { ticket: () => ticket });
    let answer!: () => void;
    const add = refused.service.add;
    refused.service.add = (q) => new Promise((done) => { answer = () => { done(add(q)); }; });   // the add's answer held back
    refused.typed('bob');
    refused.c.AddToIgnore(cmd('AddToIgnore'), {} as never, undefined);
    await flush();
    expect(refused.requests.map((q) => q.op)).toEqual(['account-id']);                // the add asked, its answer not yet in
    ticket = null;                                                                    // logged off before the add's answer
    answer();
    await flush(); await flush();
    expect([refused.requests.map((q) => q.op), refused.events]).toEqual([['account-id', 'ignore-add'], []]);
    expect(IGNORE_ADD_TICKET_ADAPTATION).toMatch(/ticket/);
    ticket = 'T1';
    const kept = rows({}, { ticket: () => ticket });
    kept.typed('bob');
    kept.c.AddToIgnore(cmd('AddToIgnore'), {} as never, undefined);
    await flush(); await flush();
    expect(kept.requests.map((q) => q.op)).toEqual(['account-id', 'ignore-add', 'ignore-list']);   // the same ticket throughout: the chain runs
  });

  it('no name (the variable absent, empty, or not a string) sends nothing and raises nothing; the variable is added TEMPORARY as the body reads it', async () => {
    const r = rows();
    r.c.AddToIgnore(cmd('AddToIgnore'), {} as never, undefined);
    expect(r.uiVars.find(PLAYER_IGNORE_NAME_VAR)!.longevity).toBe(1);
    r.typed('');
    r.c.AddToIgnore(cmd('AddToIgnore'), {} as never, undefined);
    r.uiVars.set(PLAYER_IGNORE_NAME_VAR, { type: 'int', value: 42 });
    r.c.AddToIgnore(cmd('AddToIgnore'), {} as never, undefined);
    await flush();
    expect([r.requests, r.events]).toEqual([[], []]);
  });
});

describe('RemoveFromIgnore (FUN_002798e0 -> FUN_00300fe0, FUN_003010c0)', () => {
  it('INPUT_STRING: the row\'s first cell, strtol base 10 (FUN_00191490), an account on the list: RemoveFromIgnoreList, then the list asked again', async () => {
    const r = rows({ listed: [42, 43] }, { input: '43' });
    r.c.GetIgnoreList(cmd('GetIgnoreList'), {} as never, undefined);
    await flush();
    r.requests.length = 0;
    expect(r.c.RemoveFromIgnore(cmd('RemoveFromIgnore', 'INPUT_STRING', 'OnIgnoreListPress'), {} as never, undefined)).toBe(true);
    await flush(); await flush();
    expect(r.requests).toEqual([{ op: 'ignore-remove', body: { ignoreAccountId: 43 } }, { op: 'ignore-list', body: {} }]);
    expect(r.drawn()).toEqual({ type: 'array', value: [row(42, 'bob', '\xaa')] });
  });

  it('IGNORE_ADD_TICKET_ADAPTATION: a remove answered after the session\'s ticket changed asks no list', async () => {
    let ticket: string | null = 'T1';
    const r = rows({ listed: [42, 43] }, { input: '43', ticket: () => ticket });
    r.c.GetIgnoreList(cmd('GetIgnoreList'), {} as never, undefined);
    await flush();
    r.requests.length = 0;
    let answer!: () => void;
    const remove = r.service.remove;
    r.service.remove = (q) => new Promise((done) => { answer = () => { done(remove(q)); }; });   // the remove's answer held back
    r.c.RemoveFromIgnore(cmd('RemoveFromIgnore', 'INPUT_STRING', 'OnIgnoreListPress'), {} as never, undefined);
    ticket = 'T2';                                                                    // a logoff and another login before it lands
    answer();
    await flush(); await flush();
    expect(r.requests).toEqual([{ op: 'ignore-remove', body: { ignoreAccountId: 43 } }]);
  });

  it('an account not on the list sends nothing; a refused remove says nothing and the list is not asked', async () => {
    const r = rows({ listed: [42], removeStatus: -988 }, { input: '44' });
    r.c.GetIgnoreList(cmd('GetIgnoreList'), {} as never, undefined);
    await flush();
    r.requests.length = 0;
    r.c.RemoveFromIgnore(cmd('RemoveFromIgnore', 'INPUT_STRING'), {} as never, undefined);
    r.c.RemoveFromIgnore(cmd('RemoveFromIgnore', 'NA'), {} as never, undefined);   // "NA": strtol 0, no account 0
    expect(r.requests).toEqual([]);
    r.c.RemoveFromIgnore(cmd('RemoveFromIgnore', '42'), {} as never, undefined);   // a literal argument as it stands
    await flush(); await flush();
    expect([r.requests.map((q) => q.op), r.events]).toEqual([['ignore-remove'], []]);
  });
});

describe('the unparked rows', () => {
  it('SOCOM II ONLINE: GetIgnoreList is ONL-25\'s body (existing), the IGNORE row is no longer parked', () => {
    expect(WORLD_OF_SOCOM_ENTRY_COMMANDS.find((e) => e.name === 'GetIgnoreList')).toMatchObject({ state: 'existing', task: 'ONL-25' });
    expect(PARKED_ROWS.map((p) => p.control)).not.toContain('Ignore');
  });

  it('the BRIEFING ROOM: AddToIgnore (ONL-25) and CopyUIVar (MENU-01\'s body, OPTIONS\' module) answered; CopyUIVar copies on the two chat dialogs', () => {
    expect(BRIEFING_ROOM_ENTRY_COMMANDS.find((e) => e.name === 'AddToIgnore')).toMatchObject({ state: 'existing', task: 'ONL-25' });
    expect(BRIEFING_ROOM_ENTRY_COMMANDS.find((e) => e.name === 'CopyUIVar')).toMatchObject({ state: 'existing', task: 'MENU-01' });
    expect(COPY_UI_VAR_DIALOGS).toEqual(expect.arrayContaining([BRIEFING_ROOM, 'dlgGameLobby.rdr']));
  });
});

// ---- the page over the machine ----

type Rig = ReturnType<typeof worldRig>;
const go = (r: Rig, name: string): void => { for (let i = 0; i < 12 && r.focused() !== name; i++) r.press('DOWN', 6); expect(r.focused()).toBe(name); };
const loc = (r: Rig, id: number): string => r.loc.byId.get(id)!.trim();
const popupText = (r: Rig): string => (r.parts.current?.popup()?.popup.text.lines ?? []).map((l) => new TextDecoder('latin1').decode(Uint8Array.from(l.bytes)).trim()).join(' ');
const items = (r: Rig): string[][] => (r.parts.current!.widgets.get('IgnoreList') as ListboxWidget).items.map((i) => i.captions);
const listbox = (r: Rig): ListboxWidget => r.parts.current!.widgets.get('IgnoreList') as ListboxWidget;
const sounds = (r: Rig, from: number): string[] => r.sound.log.slice(from).filter((s) => s.startsWith('SOUND')).map((s) => /"sound":"([^"]+)"/.exec(s)![1]!);
const quiet = (calls: string[]): string[] => calls.filter((c) => !/^HasClanInvitations|^invitations\.op1|^DisableButton\(invitations\)|^EnableButton\(invitations\)/.test(c));

/** SOCOM II ONLINE past SERVER NEWS, the IGNORE row's CROSS, run to IGNORE's build. */
async function ignorePage(o: Parameters<typeof server>[0] = {}) {
  const s = server(o);
  const r = worldRig({ name: 'socomc', announcement: '', ignore: s.service, keyboard: true });
  await r.settle(SETTLED);
  r.press('CROSS', 10);
  go(r, 'Ignore');
  r.press('CROSS', 2);
  for (let i = 0; i < 120 && r.current() !== IGNORE_LIST; i++) await r.settle(1);
  await r.settle(SETTLED);
  return { r, ...s };
}

describe.skipIf(!HAVE)(`IGNORE over the machine${HAVE ? '' : ' (no disc and no fixtures)'}`, () => {
  it('SOCOM II ONLINE\'s ONSTART asks the list (get_friend_list) and the IGNORE row\'s pane draws it; its CROSS (Goto_Ignore) switches to dlgIgnoreList.rdr', async () => {
    const s = server({ listed: [42] });
    const r = worldRig({ name: 'socomc', announcement: '', ignore: s.service });
    await r.settle(SETTLED);
    expect(r.calls(WORLD)).toContain('GetIgnoreList(NA) table');
    expect(s.requests.map((q) => q.op)).toEqual(['ignore-list']);
    r.press('CROSS', 10);
    go(r, 'Ignore');
    expect([r.node('IgnoreList')!.visible, items(r)]).toEqual([true, [['42', 'bob', '\xaa']]]);
    const from = r.outcomes.length;
    r.press('CROSS', 2);
    for (let i = 0; i < 120 && r.builds.at(-1) !== IGNORE_LIST; i++) await r.settle(1);
    expect(quiet(r.calls(WORLD, from))).toEqual(['SwitchMenu(dlgIgnoreList.rdr) table']);
    expect([r.builds, r.valve('StartMusic')]).toEqual([[WORLD, IGNORE_LIST], 1]);
  });

  it('ONSTART: GetIgnoreList, the list disabled; the seeded list drawn by the record\'s three columns (the id at 800, off the list; the name; the glyph); the captions #368, #370, #371, #314', async () => {
    const { r, requests } = await ignorePage({ listed: [42, 43], status: { 43: 2 } });
    expect(r.calls(IGNORE_LIST).slice(0, 2)).toEqual(['GetIgnoreList(NA) table', 'DisableButton(IgnoreList) table']);
    expect(requests.map((q) => q.op)).toEqual(['ignore-list', 'ignore-list']);           // the menu's ONSTART, then the page's
    expect(items(r)).toEqual([['42', 'bob', '\xaa'], ['43', 'Carol', '\xa7']]);
    expect(listbox(r).spec.columns.map((c) => c.position)).toEqual([800, 90, 21]);
    expect(listbox(r).enabled).toBe(false);
    expect(r.text('bar_title')).toEqual([loc(r, 368)]);
    expect([368, 370, 371, 314, 372, 373, 322, 374, 376, 226].map((id) => loc(r, id))).toEqual([
      'IGNORE LIST', 'IGNORE', 'REMOVE IGNORE', 'RETURN', '¦ Add to your ignore list.', '¦ Manage your ignore list.', '¦ Return to SOCOM II Online.',
      'Are you sure you wish to remove this player from your ignore list?',
      'That player does not exist or is not currently logged in. Please check your spelling and try again.', 'CONTINUE',
    ]);
    expect([loc(r, 369), loc(r, 375)]).toEqual(['I.D.', 'Enter Name of Player to Ignore']);   // the range's, no widget's or script's
    expect(r.focused()).toBe('Ignore');
    expect(r.text('DescriptionText')).toEqual([loc(r, 372)]);
  });

  it('ADD: CROSS on IGNORE opens the keyboard on PLAYER_IGNORE_NAME; the name typed: AccountGetID, AddToIgnoreList, the list asked again and drawn', async () => {
    const { r, requests } = await ignorePage({ listed: [43] });
    requests.length = 0;
    const from = r.outcomes.length;
    r.press('CROSS', 6);
    expect(quiet(r.calls(IGNORE_LIST, from))).toEqual(['ClearUIVar(PLAYER_IGNORE_NAME) table', 'GetTextInput(PLAYER_IGNORE_NAME) table']);
    // MPPLAYERNAME, no caps; no title: the script spells the key PURPOSE, which the set does not carry (research 119 §5),
    // so #375 "Enter Name of Player to Ignore" is shown nowhere.
    expect([r.skb!.keyboard.isOpen, r.skb!.keyboard.request?.skbName, r.skb!.keyboard.request?.purpose, r.skb!.keyboard.request?.maxChars, r.skb!.keyboard.request?.maxBytes])
      .toEqual([true, 'MPPLAYERNAME', '', 0, 0]);
    r.type('bob');
    await r.settle(10);
    expect(quiet(r.calls(IGNORE_LIST, from))).toContain('AddToIgnore(NA) table');
    expect(requests).toEqual([{ op: 'account-id', body: { name: 'bob' } }, { op: 'ignore-add', body: { ignoreAccountId: 42 } }, { op: 'ignore-list', body: {} }]);
    expect(items(r)).toEqual([['43', 'Carol', '\xaa'], ['42', 'bob', '\xaa']]);
    expect(r.shown()).toBe(false);
  });

  it('ADD of a name no player holds: MP_PLAYER_NOT_FOUND runs PlayerNotFound -- #376 with #226; CROSS closes it', async () => {
    const { r, requests } = await ignorePage();
    requests.length = 0;
    r.press('CROSS', 6);
    r.type('nobody');
    await r.settle(10);
    expect(requests.map((q) => q.op)).toEqual(['account-id']);
    expect([r.shown(), popupText(r)]).toEqual([true, loc(r, 376)]);
    r.press('CROSS', 10);
    expect([r.shown(), r.valve('SitAndSpin')]).toEqual([false, 1]);
  });

  it('ADD past the cap: MP_IGNORE_LIST_FULL runs IgnoreListFull -- its literal text (77 bytes); the list not asked', async () => {
    const { r, requests } = await ignorePage({ addStatus: -956 });
    requests.length = 0;
    r.press('CROSS', 6);
    r.type('dave');
    await r.settle(10);
    expect(requests.map((q) => q.op)).toEqual(['account-id', 'ignore-add']);
    expect(r.shown()).toBe(true);
    expect(popupText(r)).toBe('Your ignore list is full. Remove players from your ignore list and try again.');
  });

  it('ADD of a name already listed: PLAYER_IS_IGNORED runs PlayerIsAlreadyIgnored -- its literal text (37 bytes); nothing sent', async () => {
    const { r, requests } = await ignorePage({ listed: [42] });
    requests.length = 0;
    r.press('CROSS', 6);
    r.type('Bob');
    await r.settle(10);
    expect(requests).toEqual([]);
    expect([r.shown(), popupText(r)]).toEqual([true, 'You are already ignoring that player.']);
  });

  it('REMOVE: CROSS enables and activates the list; CROSS on a row asks #374 (YES #253 / NO #246); YES removes that row\'s account and the list is asked again', async () => {
    const { r, requests } = await ignorePage({ listed: [42, 43] });
    requests.length = 0;
    go(r, 'RemoveIgnore');
    expect(r.text('DescriptionText')).toEqual([loc(r, 373)]);
    r.press('CROSS', 6);
    expect([r.focused(), listbox(r).enabled, r.valve('IgnoreListActive')]).toEqual(['IgnoreList', true, 1]);
    r.press('DOWN', 6);
    r.press('CROSS', 10);
    expect([r.shown(), popupText(r)]).toEqual([true, `${loc(r, 374)}`]);
    r.press('CROSS', 10);
    await r.settle(10);
    expect(requests).toEqual([{ op: 'ignore-remove', body: { ignoreAccountId: 43 } }, { op: 'ignore-list', body: {} }]);
    expect(items(r)).toEqual([['42', 'bob', '\xaa']]);
  });

  it('REMOVE with the list empty does nothing (TestUIVar(IgnoreListVar) 0); TRIANGLE in the list gives the focus back to REMOVE', async () => {
    const empty = await ignorePage();
    go(empty.r, 'RemoveIgnore');
    empty.r.press('CROSS', 6);
    expect([empty.r.focused(), listbox(empty.r).enabled]).toEqual(['RemoveIgnore', false]);
    const { r } = await ignorePage({ listed: [42] });
    go(r, 'RemoveIgnore');
    r.press('CROSS', 6);
    r.press('TRIANGLE', 6);
    expect([r.focused(), listbox(r).enabled, r.valve('IgnoreListActive'), r.current()]).toEqual(['RemoveIgnore', false, 0, IGNORE_LIST]);
  });

  it('the way back: TRIANGLE runs goto_menu(PREVIOUS_SCREEN) with SND_DINK; RETURN\'s CROSS switches back with no sound of its own', async () => {
    const a = await ignorePage();
    const sound = a.r.sound.log.length;
    a.r.press('TRIANGLE', 6);
    for (let i = 0; i < 120 && a.r.current() !== WORLD; i++) await a.r.settle(1);
    expect([a.r.current(), sounds(a.r, sound)]).toEqual([WORLD, ['SND_DINK']]);
    const b = await ignorePage();
    go(b.r, 'return');
    expect(b.r.text('DescriptionText')).toEqual([loc(b.r, 322)]);
    const quietFrom = b.r.sound.log.length;
    b.r.press('CROSS', 6);
    for (let i = 0; i < 120 && b.r.current() !== WORLD; i++) await b.r.settle(1);
    expect([b.r.current(), sounds(b.r, quietFrom)]).toEqual([WORLD, []]);
  });
});

// ---- the briefing room's IGNORE key ----

const ALPHA: ChannelListEntry = { status: 0, mediusWorldId: 1, playerCount: 0, maxPlayers: 64, securityLevel: 0, genericField1: 0, lobbyName: 'Alpha', endOfList: true };

describe.skipIf(!HAVE)(`the BRIEFING ROOM's chat keyboard: Action2 (IGNORE) then ENTER${HAVE ? '' : ' (no disc and no fixtures)'}`, () => {
  it('ON_SKB_APPLY2 runs on_skb_apply_2: CopyUIVar(CHATMESSAGE -> PLAYER_IGNORE_NAME) and AddToIgnore -- the typed name looked up and ignored', async () => {
    const s = server();
    const r = await briefingRig({
      name: 'socomc', announcement: '', rooms: [ALPHA], keyboard: true, ignore: s.service,
      register: (host, ctx) => {
        new OptionsCommands({ valves: () => ctx.machine().valves, uiVars: ctx.uiVars, globals: new OptionGlobals(), dialog: () => ctx.machine().shell()?.currentName ?? null, name: (c, i) => ctx.parts.current?.name(c, i) ?? null }).register(host);
      },
    });
    await r.settle(SETTLED);
    r.press('CROSS', 10);
    go(r as unknown as Rig, 'briefingrooms');
    r.press('CROSS', 6);
    r.press('CROSS', 2);
    for (let i = 0; i < 200 && r.current() !== BRIEFING_ROOM; i++) await r.settle(1);
    await r.settle(SETTLED);
    s.requests.length = 0;
    r.press('TRIGGER_R1' as never, 6);
    const kb = r.skb!.keyboard;
    expect([kb.isOpen, kb.request?.uiVar]).toEqual([true, 'CHATMESSAGE']);
    const isAction2 = (): boolean => { const k = kb.keyAt(kb.col, kb.row); return k.type === SKB_KEY_TYPE.FN && k.value === SKB_FN.Action2; };
    for (let i = 0; i < 200 && !isAction2(); i++) r.press(i % 16 === 15 ? 'DOWN' : 'RIGHT', 1);
    expect(isAction2()).toBe(true);
    r.press('CROSS', 2);
    expect(kb.mode).toBe(2);
    const from = r.outcomes.length;
    r.type('dave');
    await r.settle(10);
    expect(quiet(r.calls(BRIEFING_ROOM, from)).filter((c) => /CopyUIVar|AddToIgnore|SendMediusChat/.test(c))).toEqual(['CopyUIVar(NA) table', 'AddToIgnore(NA) table']);
    expect(r.uiVars.find(PLAYER_IGNORE_NAME_VAR)!.value).toEqual(str('dave'));
    expect(s.requests).toEqual([{ op: 'account-id', body: { name: 'dave' } }, { op: 'ignore-add', body: { ignoreAccountId: 44 } }, { op: 'ignore-list', body: {} }]);
    expect(r.chatRequests.filter((q) => q.op === 'chat')).toEqual([]);
  });
});
