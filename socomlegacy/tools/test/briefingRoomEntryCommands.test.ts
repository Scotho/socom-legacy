import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRdr, Zar, type RdrNode } from '@s2u/archive';
import {
  BRIEFING_ROOM, BRIEFING_ROOM_COMMAND_ROWS, BRIEFING_ROOM_GLOBAL_VALVES, BRIEFING_ROOM_ENTRY_COMMANDS, LOGOFF_COMMAND_ROWS, uiCommandKey, uiCommandRowByKey,
  uiCommandRowByName,
} from '@s2u/ui';

/**
 * ONL-12's list (web research 162): every bound function the BRIEFING ROOM's chapter names -- `dlgMPBriefingRoom.rdr`'s
 * own set and `UIanim.rdr`'s five library animations, pinned off the disc in ONL-33's `onlineDialogs.pinned.json`
 * (research 128 §4.9) -- is answered by a task in `@s2u/ui`'s `BRIEFING_ROOM_ENTRY_COMMANDS`, as
 * `worldOfSocomEntryCommands.test.ts` holds ONL-09's; and text chat's animations are the layout's bindings (ONL-23).
 */
const PIN = resolve(import.meta.dirname, 'onlineDialogs.pinned.json');
interface Chapter { name: string; commands: string[]; bindings: string[]; animations: Record<string, string[]>; library: string[] }
const chapter = (): Chapter => (JSON.parse(readFileSync(PIN, 'utf8')) as { chapters: Chapter[] }).chapters.find((c) => c.name === BRIEFING_ROOM)!;
const spelling = (line: string): string => line.split(' ')[0]!;
const rowOf = (spelt: string) => uiCommandRowByKey(uiCommandKey(spelt));
/** The rows the set aims at a node, which the pin prints as `<node>.op<n>` and its `commands` lacks (research 158 §2.3). */
const NODE_AIMED = ['RefreshGameList', 'RefreshRoomPlayerList'];

describe("the BRIEFING ROOM's chapter (ONL-33's pin)", () => {
  it('is research 128 §4.9\'s dialog: 32 command lines; the game list asked at GAMELIST, the player list at PLAYERLIST', () => {
    const c = chapter();
    expect(c.commands).toHaveLength(32);
    expect(c.animations['auto_refresh_gamelist']!.map((l) => l.trim())).toEqual(['IF socom_online_state == 11', 'IF NODE_ACTIVE', 'GAMELIST.op4(NA)', 'ENDIF', 'IF NODE_ACTIVE', 'PLAYERLIST.op6(NA)', 'ENDIF', 'ENDIF']);
    expect(c.animations['exit_lobby']!.map((l) => l.trim())).toEqual(['DisableButton(CRgame)', 'DisableButton(join_game)', 'DEBUG', 'JoinMPRoom(NONE)', 'VALVE StartMusic = 1', 'CALL ReturnToWorldOfSOCOM (blocking)']);
  });

  it('ONL-23 (research 266 §1): text chat runs as the layout binds it -- R1 and the USB keyboard\'s ENTER start do_chat, the player info\'s R1 its whisper; no gate stands', () => {
    const c = chapter();
    expect(c.bindings).toContain('SCREEN BUTTON TRIGGER_R1 -> do_chat [dlgMPBriefingRoom.rdr]');
    expect(c.bindings).toContain('SCREEN EVENT USBKBD_ENTER -> do_chat [dlgMPBriefingRoom.rdr]');
    expect(c.bindings).toContain('playerinfo_ctl_desc BUTTON TRIGGER_R1 -> playerinfo_send_message [dlgMPBriefingRoom.rdr]');
    expect(BRIEFING_ROOM_ENTRY_COMMANDS.find((e) => e.name === 'SendMediusChat')).toMatchObject({ state: 'existing', task: 'ONL-23' });
  });
});

describe('every name the chapter uses is answered by a task (BRIEFING_ROOM_ENTRY_COMMANDS)', () => {
  it('each pinned spelling reaches a row with one entry; no entry names a row the chapter does not use, but the two the set aims at a node', () => {
    const byRow = new Map(BRIEFING_ROOM_ENTRY_COMMANDS.map((e) => [e.name, e]));
    expect(byRow.size).toBe(BRIEFING_ROOM_ENTRY_COMMANDS.length);
    const used = new Set<string>();
    for (const line of chapter().commands) {
      const spelt = spelling(line);
      const row = rowOf(spelt);
      expect(row, `${spelt} reaches no row`).not.toBeNull();
      used.add(row!.name);
      const entry = byRow.get(row!.name);
      expect(entry, `${spelt} (row ${row!.name}) has no entry`).toBeDefined();
      if (spelt !== row!.name) expect(entry!.spelt, `${row!.name}'s spellings lack ${spelt}`).toContain(spelt);
    }
    for (const e of BRIEFING_ROOM_ENTRY_COMMANDS) if (!NODE_AIMED.includes(e.name)) expect(used.has(e.name), e.name).toBe(true);
    for (const n of NODE_AIMED) expect(used.has(n), n).toBe(false);
  });

  it('this module\'s rows are BRIEFING_ROOM_COMMAND_ROWS\'; a parked row is the table\'s, with its task and why', () => {
    const mine = new Set<string>(BRIEFING_ROOM_COMMAND_ROWS.map((r) => r.name));
    for (const e of BRIEFING_ROOM_ENTRY_COMMANDS) {
      const row = uiCommandRowByName(e.name)!;
      expect(row, e.name).toBeDefined();
      if (e.state === 'here') { expect(mine.has(e.name), e.name).toBe(true); expect(row.task, e.name).toBe(e.task); }
      else if (e.state === 'parked') { expect(mine.has(e.name), e.name).toBe(false); expect(row.task, e.name).toBe(e.task); expect(e.why, e.name).toBeTruthy(); }
      else expect(mine.has(e.name), e.name).toBe(false);
    }
  });

  it("ONL-22 (research 315 §6 E5): LobbyBailout, OnMultiplayerDisconnect's first row, is the logoff module's body (row 84, FUN_0027dc90), not parked", () => {
    expect(BRIEFING_ROOM_ENTRY_COMMANDS.find((e) => e.name === 'LobbyBailout')).toMatchObject({ state: 'existing', task: 'ONL-22' });
    expect(LOGOFF_COMMAND_ROWS.find((r) => r.name === 'LobbyBailout')).toMatchObject({ id: 84, fn: 0x27dc90, task: 'ONL-22' });
    expect(uiCommandRowByName('LobbyBailout')).toMatchObject({ id: 84, status: 'declared', task: 'ONL-22', answer: true });
  });
});

// ---- held to the disc, or to the committed fixtures ----

const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const FIXTURES = process.env.S2U_TEST_FIXTURES ? resolve(process.env.S2U_TEST_FIXTURES) : resolve(import.meta.dirname, '../../test-fixtures');
const from = (root: string, p: string): Uint8Array | null => (root !== '' && existsSync(join(root, p)) ? new Uint8Array(readFileSync(join(root, p))) : null);
const READERC = from(DISC, 'RUN/READERC.ZAR') ?? from(FIXTURES, 'RUN/READERC.ZAR');

describe.skipIf(READERC === null)('global_valves.rdr on the disc (RUN/READERC.ZAR): the two filters of the game list that no path dialog names', () => {
  it('BRIEFING_ROOM_GLOBAL_VALVES is the table entries GamePasswordFilter and LockedFilter, with its values and types', () => {
    const z = Zar.parse(READERC!);
    const root = parseRdr(z.data(z.root.children.find((k) => k.name.toLowerCase() === 'global_valves.rdr')!)) as RdrNode[];
    const entries = ((root[0] as RdrNode[])[1] as RdrNode[][]).map((e) => {
      const field = (k: string): string | null => { const i = e.indexOf(k); return i < 0 ? null : String((e[i + 1] as RdrNode[])[0]); };
      return { name: field('name')!, value: Number(field('value')), type: field('type') ?? 'PERM' };
    });
    for (const v of BRIEFING_ROOM_GLOBAL_VALVES) expect(entries.find((e) => e.name === v.name), v.name).toEqual(v);
  });
});
