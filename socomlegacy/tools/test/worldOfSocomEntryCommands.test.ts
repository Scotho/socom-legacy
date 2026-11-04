import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRdr, Zar, type RdrNode } from '@s2u/archive';
import { parseAnimSets } from '@s2u/scene';
import {
  LOGOFF_COMMAND_ROWS, PARKED_ROWS, UI_COMMAND_TABLE, WORLD_OF_SOCOM, WORLD_OF_SOCOM_COMMAND_ROWS, WORLD_OF_SOCOM_ENTRY_COMMANDS, WORLD_OF_SOCOM_GLOBAL_VALVES, uiCommandKey,
  uiCommandRowByKey, uiCommandRowByName,
} from '@s2u/ui';

/**
 * ONL-09's list (web research 158 §3): every bound function the SOCOM II ONLINE menu's chapter names --
 * `dlgWorldOfSOCOM.rdr`'s own set and `UIanim.rdr`'s four library animations, pinned off the disc in ONL-33's
 * `onlineDialogs.pinned.json` (research 128 §4.7) -- is answered by a task in `@s2u/ui`'s
 * `WORLD_OF_SOCOM_ENTRY_COMMANDS`: this task's body, an earlier task's, a stub for the task that owns it, or the
 * table's declared row for a parked task. As `usagePolicyEntryCommands.test.ts` holds ONL-08's. The second half holds
 * to the disc (or the committed fixtures) what the pin cannot say: the row the set aims at `ROOMLIST`, and the valves
 * `global_valves.rdr` gives the set.
 */
const PIN = resolve(import.meta.dirname, 'onlineDialogs.pinned.json');
interface Chapter { name: string; widgets: string[]; commands: string[]; bindings: string[]; edges: string[]; library: string[]; valves: string[]; animations: Record<string, string[]> }
const chapter = (): Chapter => (JSON.parse(readFileSync(PIN, 'utf8')) as { chapters: Chapter[] }).chapters.find((c) => c.name === WORLD_OF_SOCOM)!;
const spelling = (line: string): string | null => (/\(no row\)$/.test(line) ? null : line.split(' ')[0]!);
const rowOf = (spelt: string) => uiCommandRowByKey(uiCommandKey(spelt));
/** The one row of the list the pin's `commands` lacks (the listing prints a command aimed at a node as `<node>.op<n>`). */
const NODE_AIMED = 'RefreshRoomList';

describe("the SOCOM II ONLINE menu's chapter (ONL-33's pin)", () => {
  it('is the dialog of research 128 §4.7: 95 widgets, the eleven rows in N6\'s order, eight ONSTART animations, 32 command lines', () => {
    const c = chapter();
    expect(c.widgets).toHaveLength(95);
    expect(c.widgets.filter((w) => w.startsWith('BUTTON ') && !w.includes('popup_motd')).map((w) => w.split(' ')[1])).toEqual([
      'newsandmessages', 'briefingrooms', 'autoplay', 'ClanManage', 'ranking', 'Clanranking', 'invitations', 'refreshlist', 'options', 'friends', 'Ignore',
    ]);
    expect(c.bindings.filter((b) => b.startsWith('SCREEN EVENT ONSTART')).map((b) => b.split(' -> ')[1])).toEqual([
      'TurnOnInvitations [dlgWorldOfSOCOM.rdr]', 'init_screen [dlgWorldOfSOCOM.rdr]', 'PulseArrows [dlgWorldOfSOCOM.rdr]', 'CallMusic [dlgWorldOfSOCOM.rdr]',
      'net_monitor [UIanim.rdr]', 'OnBriefingRoomstart [dlgWorldOfSOCOM.rdr]', 'get_ladder_top_10 [dlgWorldOfSOCOM.rdr]', 'get_friend_list [dlgWorldOfSOCOM.rdr]',
    ]);
    expect(c.bindings).toContain('SCREEN BUTTON TRIANGLE -> exit_lobby [dlgWorldOfSOCOM.rdr]');
    expect(c.bindings).toContain('SCREEN EVENT ON_LADDER_REFRESH -> DisplayMedalOfMerit [dlgWorldOfSOCOM.rdr]');
    expect(c.library).toHaveLength(4);
    expect(c.commands).toHaveLength(32);
    expect(c.widgets).toContain('WRAPPEDTEXT motd uivar MEDIUS_MOTD');
    expect(c.widgets).toContain('WRAPPEDTEXT popup_motd_text childof popup_motd_button uivar MEDIUS_MOTD');   // SERVER NEWS and MESSAGES: one text
    expect(c.widgets).toContain('WRAPPEDTEXT playername uivar PLAYER_NAME_AND_TAG');
  });

  it('SERVER NEWS once: init_screen tests PopupNewsOnce == 0 and sets it to 1 before it activates the popup\'s button', () => {
    expect(chapter().animations['init_screen']!.slice(0, 4)).toEqual(['== NA (1)', '  IF PopupNewsOnce == 0', '    VALVE PopupNewsOnce = 1', '    ActivateButton(popup_motd_button)']);
  });

  it('each parked row\'s CROSS binding is the layout\'s, and its script is the one PARKED_ROWS describes', () => {
    const c = chapter();
    for (const p of PARKED_ROWS) expect(c.bindings, p.control).toContain(`${p.control} BUTTON CROSS -> ${p.animation} [dlgWorldOfSOCOM.rdr]`);
    const script = (a: string): string[] => c.animations[a]!.map((l) => l.trim());
    expect(script('Goto_Ladder')).toEqual(['VALVE StartMusic = 1', 'SwitchMenu(dlgLadderLobby.rdr)']);
    expect(script('Goto_ClanLadder')).toEqual(['VALVE StartMusic = 1', 'SwitchMenu(dlgClanLadderLobby.rdr)']);
    expect(script('Goto_Invites')).toEqual(['VALVE StartMusic = 1', 'SwitchMenu(dlgRespondToInvites.rdr)']);
    expect(script('Goto_Friends')).toEqual(['VALVE StartMusic = 1', 'SwitchMenu(dlgFriendList.rdr)']);
    expect(script('Goto_Ignore')).toEqual(['VALVE StartMusic = 1', 'SwitchMenu(dlgIgnoreList.rdr)']);
    expect(script('Goto_Options')).toEqual(['StopAllSounds(NA)', 'VagStreaming(OFF)', 'SwitchMenu(dlgOnlineOptions.rdr)']);
    expect(script('create_modify_clan').slice(0, 2)).toEqual(['VALVE StartMusic = 1', 'SOUND .DINK']);
    expect(script('join_random_game').slice(0, 4)).toEqual(['VALVE StartMusic = 1', 'SOUND .DINK', 'POPUPDIALOG(NA)', 'POPUP #801 keep']);
    expect(script('join_random_game').at(-1)).toBe('JoinMPGame(RANDOM)');
    // The rows that are not parked: BRIEFING ROOMS and REFRESH LIST.
    expect(c.bindings).toContain('briefingrooms BUTTON CROSS -> PressBriefingRoombtn [dlgWorldOfSOCOM.rdr]');
    expect(c.bindings).toContain('refreshlist BUTTON CROSS -> refresh_roomlist [dlgWorldOfSOCOM.rdr]');
    expect(PARKED_ROWS.map((p) => p.animation)).not.toContain('PressBriefingRoombtn');
    expect(PARKED_ROWS.map((p) => p.animation)).not.toContain('refresh_roomlist');
  });

  it('the logoff\'s program (exit_lobby, ONL-10\'s): #793 with #246 / #253, then on YES the chain to the reboot', () => {
    const lines = chapter().animations['exit_lobby']!.map((l) => l.trim());
    expect(lines.slice(lines.indexOf('POPUPDIALOG(NA)'), lines.indexOf('POPUPDIALOG(NA)') + 2)).toEqual(['POPUPDIALOG(NA)', 'POPUP #793 buttons #246/#253 -> AreYouSure']);
    const yes = lines.slice(lines.indexOf('IF AreYouSure == 2') + 1, lines.indexOf('ELSE'));
    expect(yes).toEqual([
      'StopAllSounds(NA)', 'VagStreaming(OFF)', 'POPUPDIALOG(NA)', 'POPUP #422', 'LobbyLogout(NA)', 'UnInitNetwork(NA)', 'VALVE socom_online_initialized = 0',
      'NetCnfClose(NA)', 'NetCnfUnInit(NA)', 'SWITCHMENU(REBOOT)', 'KILLPOPUP(NA)', 'OPACITY MENUFADER 0.7->0 0.05',
    ]);
  });
});

describe('every name the chapter uses is answered by a task (WORLD_OF_SOCOM_ENTRY_COMMANDS)', () => {
  it('each pinned spelling reaches a row, and that row has exactly one entry naming the spelling', () => {
    const byRow = new Map(WORLD_OF_SOCOM_ENTRY_COMMANDS.map((e) => [e.name, e]));
    expect(byRow.size).toBe(WORLD_OF_SOCOM_ENTRY_COMMANDS.length);
    for (const line of chapter().commands) {
      const spelt = spelling(line);
      if (spelt === null) continue;
      const row = rowOf(spelt);
      expect(row, `${spelt} reaches no row of the table`).not.toBeNull();
      const entry = byRow.get(row!.name);
      expect(entry, `${spelt} (row ${row!.name}) has no entry`).toBeDefined();
      if (spelt !== row!.name) expect(entry!.spelt, `${row!.name}'s spellings lack ${spelt}`).toContain(spelt);
    }
  });

  it('no entry names a row the chapter does not use -- but RefreshRoomList, which the set aims at ROOMLIST and the pin lists as ROOMLIST.op<n>', () => {
    const c = chapter();
    const spelt = c.commands.map(spelling).filter((s): s is string => s !== null);
    const used = new Set(spelt.map((n) => rowOf(n)!.name));
    for (const e of WORLD_OF_SOCOM_ENTRY_COMMANDS) if (e.name !== NODE_AIMED) expect(used.has(e.name), e.name).toBe(true);
    for (const e of WORLD_OF_SOCOM_ENTRY_COMMANDS) for (const s of e.spelt) expect(spelt, `${e.name} spelt ${s}`).toContain(s);
    expect(used.has(NODE_AIMED)).toBe(false);
    const aimed = Object.entries(c.animations).filter(([, lines]) => lines.some((l) => /ROOMLIST\.op(16|5|3)\(NA\)/.test(l))).map(([a]) => a).sort();
    expect(aimed).toEqual(['OnBadJoinState', 'OnJoinRoomFailure', 'init_screen', 'refresh_roomlist']);
    expect(WORLD_OF_SOCOM_ENTRY_COMMANDS).toHaveLength(32);            // 31 rows behind the pin's 32 lines (SwitchMenu spelt twice), and RefreshRoomList
  });

  it('two rows are this module\'s (ONL-09\'s, ONL-11\'s); a stub is registered here for the task that owns it; a parked row is the table\'s, with its task and why', () => {
    const count = (s: string) => WORLD_OF_SOCOM_ENTRY_COMMANDS.filter((e) => e.state === s).length;
    expect([count('here'), count('stub'), count('existing'), count('parked')]).toEqual([2, 0, 30, 0]);   // ONL-22 (research 315 §6 E5): LobbyBailout existing, the logoff module's; ONL-27 (research 272): GetClan, IsMemberOfClan, IsLeaderOfClan existing, the stubs retired; ONL-11: RefreshRoomList's body (research 161); ONL-10 (research 160): UnInitNetwork existing; ONL-12 (research 162): CanJoinRoom and JoinMPRoom existing; ONL-15 (research 265 §2): GetMissionInformation and the five join rows existing; ONL-25 (research 269 §1): GetIgnoreList existing; ONL-30a (research 269 §2): GetLadderInfo existing; ONL-24 (research 269 §3): GetFriendsList existing
    const mine = new Map<string, (typeof WORLD_OF_SOCOM_COMMAND_ROWS)[number]>(WORLD_OF_SOCOM_COMMAND_ROWS.map((r) => [r.name, r]));
    for (const e of WORLD_OF_SOCOM_ENTRY_COMMANDS) {
      const row = uiCommandRowByName(e.name)!;
      expect(row, e.name).toBeDefined();
      if (e.state === 'here') { expect(['ONL-09', 'ONL-11']).toContain(e.task); expect(mine.get(e.name)?.state, e.name).toBe('here'); expect(row.task, e.name).toBe(e.task); }
      else if (e.state === 'stub') { expect(mine.get(e.name)?.state, e.name).toBe('stub'); expect(row.task, e.name).toBe(e.task); expect(e.why, e.name).toBeTruthy(); }
      else if (e.state === 'parked') { expect(mine.has(e.name), e.name).toBe(false); expect(row.task, e.name).toBe(e.task); expect(e.why, e.name).toBeTruthy(); }
      else expect(mine.has(e.name), e.name).toBe(false);
    }
    expect(mine.size).toBe(2);
  });

  it("ONL-22 (research 315 §6 E5): LobbyBailout, OnMultiplayerDisconnect's first row, is the logoff module's body (row 84, FUN_0027dc90), not parked", () => {
    expect(WORLD_OF_SOCOM_ENTRY_COMMANDS.find((e) => e.name === 'LobbyBailout')).toMatchObject({ state: 'existing', task: 'ONL-22' });
    expect(LOGOFF_COMMAND_ROWS.find((r) => r.name === 'LobbyBailout')).toMatchObject({ id: 84, fn: 0x27dc90, task: 'ONL-22' });
  });

  it('a parked row whose `why` says its body answers the constant 1 is one the table answers 1 for', () => {
    for (const e of WORLD_OF_SOCOM_ENTRY_COMMANDS) if (e.state === 'parked' && /constant 1/.test(e.why ?? '')) expect(uiCommandRowByName(e.name)!.answer, e.name).toBe(true);
    expect(UI_COMMAND_TABLE.find((r) => r.name === 'GetLadderInfo')!.answer).toBeNull();   // by its mode: 1 for the two this dialog sends
  });
});

// ---- held to the disc, or to the committed fixtures ----

const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const FIXTURES = process.env.S2U_TEST_FIXTURES ? resolve(process.env.S2U_TEST_FIXTURES) : resolve(import.meta.dirname, '../../test-fixtures');
const from = (root: string, p: string): Uint8Array | null => (root !== '' && existsSync(join(root, p)) ? new Uint8Array(readFileSync(join(root, p))) : null);
const file = (p: string): Uint8Array | null => from(DISC, p) ?? from(FIXTURES, p);
const UIZANIM = file('RUN/UIZANIM.ZAR'), READERC = file('RUN/READERC.ZAR');

describe.skipIf(UIZANIM === null)('the set on the disc: the row it aims at ROOMLIST', () => {
  it('the four animations\' node command at ROOMLIST carries a name\'s index at +6, and that name is RefreshRoomList', () => {
    const set = parseAnimSets(Zar.parse(UIZANIM!)).sets.find((s) => s.name.toLowerCase() === WORLD_OF_SOCOM.toLowerCase())!;
    const index: Record<string, number> = { init_screen: 16, refresh_roomlist: 5, OnBadJoinState: 3, OnJoinRoomFailure: 3 };   // the pin's `op<n>`: below 0xE8, an index into the animation's names
    for (const [name, i] of Object.entries(index)) {
      const anim = set.anims.find((a) => a.name === name)!;
      expect(anim.names[i], name).toBe(NODE_AIMED);
      expect(anim.names, name).toContain('ROOMLIST');
    }
  });
});

describe.skipIf(READERC === null)('global_valves.rdr on the disc (RUN/READERC.ZAR): the valves it gives the dialog\'s set', () => {
  /** The `valves` table's entries (`CValve_Parse`'s input): `name`, `value`, an optional `type` word. */
  function table(): Map<string, { value: number; type: string | null }> {
    const z = Zar.parse(READERC!);
    const key = z.root.children.find((k) => k.name.toLowerCase() === 'global_valves.rdr')!;
    const root = parseRdr(z.data(key)) as RdrNode[];
    const top = root[0] as RdrNode[];
    expect(top[0]).toBe('valves');
    const out = new Map<string, { value: number; type: string | null }>();
    for (const e of top[1] as RdrNode[][]) {
      const field = (k: string): string | null => { const i = e.indexOf(k); return i < 0 ? null : String((e[i + 1] as RdrNode[])[0]); };
      const name = field('name')!;
      if (!out.has(name)) out.set(name, { value: Number(field('value')), type: field('type') });
    }
    return out;
  }

  it('has 185 entries (research 104 R104.6), PopupNewsOnce among them at 0 with no type word (PERM)', () => {
    const z = Zar.parse(READERC!);
    const root = parseRdr(z.data(z.root.children.find((k) => k.name.toLowerCase() === 'global_valves.rdr')!)) as RdrNode[];
    expect(((root[0] as RdrNode[])[1] as RdrNode[]).length).toBe(185);
    expect(table().get('PopupNewsOnce')).toEqual({ value: 0, type: null });
  });

  it('WORLD_OF_SOCOM_GLOBAL_VALVES is every valve of the chapter the table names, with the table\'s value and type, in the table\'s order', () => {
    const t = table();
    const named = [...t.keys()].filter((n) => chapter().valves.includes(n));
    expect(WORLD_OF_SOCOM_GLOBAL_VALVES.map((v) => v.name)).toEqual(named);
    for (const v of WORLD_OF_SOCOM_GLOBAL_VALVES) expect({ value: t.get(v.name)!.value, type: t.get(v.name)!.type ?? 'PERM' }, v.name).toEqual({ value: v.value, type: v.type });
    expect(chapter().valves.filter((n) => !t.has(n))).toEqual(['AreYouReallySure', 'AreYouSure', 'ConfirmPopup', 'CreateGameSettingsChanged', 'NetRecvBytes', 'NetSendBytes', 'NoExitState', 'OKValve', 'OptionsMenuChanged', 'StartMusic']);
  });
});
