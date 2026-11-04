import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { UiOp } from '@s2u/scene';
import {
  chapterPairs, commandCitation, listOps, listProgram, MATCH_PATH, mpRooms, nameOrText, namedBy, ONLINE_DIALOGS, ONLINE_PATH,
  opText, popupLine, type DialogChapter,
} from '../onlineDialogs';

/**
 * ONL-33's pure pieces (web research 128) on made-up input, and the online path's flow edges as the pin holds them
 * (`onlineDialogs.pinned.json`, re-derived from the disc by `onlineDialogsDisc.test.ts`). No disc: these run in CI.
 */

/** A 220-byte POPUP record (research 118 §2) with the fields the chapter reads. */
function record(o: { text?: number; textName?: number; buttons?: [number, number] | null; valve?: number; triangle?: boolean; keep?: boolean; widths?: [number, number] }): number[] {
  const b = new Array<number>(220).fill(0);
  const s16 = (at: number, v: number): void => { const u = v & 0xffff; b[at] = u & 0xff; b[at + 1] = u >> 8; };
  const i32 = (at: number, v: number): void => { for (let i = 0; i < 4; i++) b[at + i] = (v >>> (8 * i)) & 0xff; };
  if (o.textName !== undefined) b[0] = o.textName;
  s16(2, o.text ?? 0);
  if (o.triangle) b[64] = 1;
  if (o.keep) b[65] = 1;
  if (o.buttons) {
    b[66] = 1;
    b[67] = o.valve ?? 0;
    [68, 144].forEach((at, i) => { i32(at + 12, o.widths?.[i] ?? 80); s16(at + 22, o.buttons![i]!); });
  }
  return b;
}

const NAMES = ['NA', 'MainMenuCardSlotChoice', 'INPUT_STRING', 'A literal caption, with spaces.'];
const ui = (fn: string, arg: string): UiOp => ({ op: 'ui', command: { node: null, op: 0, fn, arg, loc: 0, extra: [] } });
const popup = (extra: number[]): UiOp => ({ op: 'ui', command: { node: 'POPUP', op: 0, fn: null, arg: 'NA', loc: 0, extra }, popup: { text: 0 } });

describe('a POPUP record as a line (FUN_0036da20, research 118 §2)', () => {
  it('reads the text id at +2, the buttons\' label ids at +68+22 / +144+22, the valve at +67, TRIANGLE +64, keep +65', () => {
    expect(popupLine(record({ text: 828, buttons: [510, 511], valve: 1 }), NAMES)).toBe('POPUP #828 buttons #510/#511 -> MainMenuCardSlotChoice');
    expect(popupLine(record({ text: 830, buttons: [510, 511], valve: 1, triangle: true }), NAMES)).toBe('POPUP #830 buttons #510/#511 -> MainMenuCardSlotChoice TRIANGLE');
    expect(popupLine(record({ text: 572, keep: true }), NAMES)).toBe('POPUP #572 keep');
  });

  it('a button of width 0 is no button; with +66 set and both widths 0 the line says "none"', () => {
    expect(popupLine(record({ text: 226, buttons: [226, 0], valve: 1, widths: [80, 0] }), NAMES)).toBe('POPUP #226 buttons #226 -> MainMenuCardSlotChoice');
    expect(popupLine(record({ text: 574, buttons: [0, 0], valve: 1, widths: [0, 0] }), NAMES)).toBe('POPUP #574 buttons none -> MainMenuCardSlotChoice');
  });

  it('with no text id the name at +0 stands; a literal caption is kept as its length only', () => {
    expect(popupLine(record({ textName: 2 }), NAMES)).toBe('POPUP INPUT_STRING');
    expect(popupLine(record({ textName: 3 }), NAMES)).toBe('POPUP <text 31>');
  });
});

describe('a script listed', () => {
  it('nameOrText keeps names, files, ports and numbers; a caption becomes <text N>', () => {
    expect(['NETCNF_DB', 'dlgNetAuthenticate.rdr', 'mc0:', '3.0', '..', 'BASCUS-97275SOCOMII', '$1'].map(nameOrText)).toEqual(['NETCNF_DB', 'dlgNetAuthenticate.rdr', 'mc0:', '3.0', '..', 'BASCUS-97275SOCOMII', '$1']);
    expect(nameOrText('MEMORY CARD slot 2')).toBe('<text 18>');
  });

  it('indents two spaces per open IF / ELSE / WHILE and closes on ENDIF / END_WHILE', () => {
    const ops: UiOp[] = [
      { op: 'if', depth: 0, tokens: [{ t: 'ui', command: { node: null, op: 0, fn: 'IsMemCardInserted', arg: 'NA', loc: 0, extra: [] } }, { t: 'and' }, { t: 'valve', valve: 'MemcardOpen', op: '==', operand: 1 }] },
      popup(record({ text: 572, keep: true })),
      { op: 'else', depth: 0 },
      { op: 'while', forever: false, jump: 0, tokens: [{ t: 'valve', valve: 'SitHere', op: '==', operand: 0 }] },
      { op: 'endWhile', jump: 0 },
      { op: 'endif', depth: 0 },
      ui('SWITCHMENU', 'INPUT_STRING'),
    ];
    expect(listOps(ops, NAMES)).toEqual([
      'IF IsMemCardInserted(NA) AND MemcardOpen == 1', '  POPUP #572 keep', 'ELSE', '  WHILE SitHere == 0', '  END_WHILE', 'ENDIF', 'SWITCHMENU(INPUT_STRING)',
    ]);
  });

  it('each op kind as a line: nodes, waits, calls, motions, sounds, valves; NODE_ACTIVE named', () => {
    const lines = ([
      { op: 'ui', command: { node: 'bar_title', op: 1, fn: null, arg: 'NA', loc: 448, extra: [] } },
      { op: 'ui', command: { node: 'Slot_title', op: 1, fn: null, arg: 'MEMORY CARD slot 2', loc: 0, extra: [] } },
      { op: 'wait', seconds: 0.30000001 },
      { op: 'call', anim: 'OpenCardOne', block: true },
      { op: 'stopAnimation', anim: 'has_memcard_changed' },
      { op: 'callSequence', sequence: 'end_of_screen' },
      { op: 'active', node: 'DNASLogo', on: true },
      { op: 'opacity', node: 'MENUFADER', from: 0, to: 0.7, rate: 1, seconds: 0.05 },
      { op: 'move', node: 'online_on', flags: 0, seconds: 0.15 },
      { op: 'sound', sound: '.DINK', flags: 0x80, newPlay: true, node: 0 },
      { op: 'valve', valve: 'num_memcards', operation: '+=', operand: 1 },
      { op: 'if', depth: 0, tokens: [{ t: 'other', set: 0, cmd: 7 }] },
      { op: 'loop', count: null },
      { op: 'other', set: 0, cmd: 47, name: 'PAUSE_ANIMATION' },
    ] as UiOp[]).map((o) => opText(o, NAMES));
    expect(lines).toEqual([
      'bar_title.op1(#448)', 'Slot_title.op1(<text 18>)', 'WAIT 0.3', 'CALL OpenCardOne (blocking)', 'STOP has_memcard_changed',
      'CALL_SEQUENCE end_of_screen', 'SHOW DNASLogo', 'OPACITY MENUFADER 0->0.7 0.05', 'MOVE online_on 0.15', 'SOUND .DINK',
      'VALVE num_memcards += 1', 'IF NODE_ACTIVE', 'LOOP forever', 'PAUSE_ANIMATION',
    ]);
  });

  it('a program of several sequences heads each with its name and activation', () => {
    expect(listProgram({ sequences: [{ name: 'check', activation: 2, ops: [ui('MC_ChPort', '0')] }, { name: 'end_of_screen', activation: 1, ops: [{ op: 'call', anim: 'load_initial_config', block: true }] }] }, NAMES))
      .toEqual(['== check (2)', '  MC_ChPort(0)', '== end_of_screen (1)', '  CALL load_initial_config (blocking)']);
  });

  it('namedBy collects bound functions, valves (tested, set, operand), sounds and the node and popup ids', () => {
    const n = namedBy([
      ui('NetCnfOpen', 'mc0:'),
      { op: 'if', depth: 0, tokens: [{ t: 'valve', valve: 'A', op: '==', operand: { valve: 'B' } }, { t: 'ui', command: { node: null, op: 0, fn: 'TestUIVar', arg: 'netcnf_db', loc: 0, extra: [] } }] },
      { op: 'valve', valve: 'C', operation: '=', operand: 0 },
      { op: 'sound', sound: '.DINK', flags: 0, newPlay: false, node: 0 },
      { op: 'ui', command: { node: 'bar_title', op: 1, fn: null, arg: 'NA', loc: 536, extra: [] } },
      popup(record({ text: 574 })),
    ]);
    expect(n).toEqual({ commands: ['NetCnfOpen', 'TestUIVar'], valves: ['A', 'B', 'C'], sounds: ['.DINK'], locs: [536], popups: [574] });
  });

  it('cites a command by its row as the dispatcher keys it (FUN_00198b80\'s ASCII fold; research 107)', () => {
    expect(commandCitation('SWITCHMENU')).toBe('SWITCHMENU SwitchMenu FUN_0027e720');
    expect(commandCitation('DNASAuthenticate')).toBe('DNASAuthenticate FUN_002cc670');
    expect(commandCitation('NetCnfOpen')).toBe('NetCnfOpen FUN_00277dd0');
    expect(commandCitation('NA')).toBe('NA (no row)');
  });
});

describe('mp_rooms.rdr as a table', () => {
  const room = (name: string, games: string[][]): unknown[] => ['ROOMNAME', [name], 'LIMIT', ['256'], 'GAMELIST', games.map(([g, ff, max, ...m]) => ['GAMENAME', [g!], 'FRIENDLYFIRE', [ff!], 'MAXPLAYERS', [max!], 'MISSION_SEQUENCE', m])];

  it('reads rooms, their limit and their games with friendly fire, max players and the mission ids in order', () => {
    const root = [[room('US EAST', [['Medley', '0', '16', '1', '2'], ['Vigilance', '1', '16', '51']]), room('ASIA', [])]];
    expect(mpRooms(root as never)).toEqual([
      { name: 'US EAST', limit: 256, games: [{ name: 'Medley', friendlyFire: 0, maxPlayers: 16, missions: [1, 2] }, { name: 'Vigilance', friendlyFire: 1, maxPlayers: 16, missions: [51] }] },
      { name: 'ASIA', limit: 256, games: [] },
    ]);
  });

  it('refuses a room with no LIMIT and a number that is not one', () => {
    expect(() => mpRooms([[['ROOMNAME', ['X'], 'GAMELIST', []]]] as never)).toThrow(/no LIMIT/);
    expect(() => mpRooms([[room('X', [['G', 'yes', '16', '1']])]] as never)).toThrow(/FRIENDLYFIRE/);
  });
});

describe('chapterPairs', () => {
  it('takes every edge to a dialog, library edges too, as from -> to; states and movies are not pairs', () => {
    const c = (name: string, edges: string[]): DialogChapter => ({ name, edges } as DialogChapter);
    expect(chapterPairs([
      c('dlgA.rdr', ['x BUTTON CROSS go SWITCHMENU -> dlgB.rdr', 'SCREEN EVENT ONSTART s SWITCHMENU -> REBOOT', 'y EVENT E z SWITCHMENU -> dlgC.rdr (library)']),
      c('dlgB.rdr', ['SCREEN layout BACKGROUND -> run/movies/x.pss']),
    ])).toEqual(['dlgA.rdr -> dlgB.rdr', 'dlgA.rdr -> dlgC.rdr']);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The pin: the path from ONLINE to the SOCOM II ONLINE menu and on to the match, edge by edge (research 128 §1).

const PIN = resolve(import.meta.dirname, 'onlineDialogs.pinned.json');

describe('the online path\'s flow edges, as pinned from the disc', () => {
  const pin = existsSync(PIN) ? JSON.parse(readFileSync(PIN, 'utf8')) as { dialogs: string[]; pairs: string[]; chapters: { name: string; edges: string[] }[] } : null;
  const edges = (d: string): string[] => pin?.chapters.find((c) => c.name === d)?.edges ?? [];

  it('the pin exists and holds the chapter\'s dialogs in the chapter\'s order (mp_rooms.rdr is a table, pinned apart)', () => {
    expect(pin).not.toBeNull();
    expect(pin!.dialogs).toEqual(ONLINE_DIALOGS.filter((d) => d !== 'mp_rooms.rdr'));
    expect(ONLINE_DIALOGS.slice(0, ONLINE_PATH.length + MATCH_PATH.length)).toEqual([...ONLINE_PATH, ...MATCH_PATH]);
  });

  it('ONLINE -> dlgMPswitch -> dlgNetLogin -> DNAS -> universe -> persona -> connect -> agreement -> SOCOM II ONLINE', () => {
    const PATH: [string, string][] = [
      ['dlgMPswitch.rdr', 'SCREEN EVENT ONSTART StopStreaming SWITCHMENU -> dlgNetLogin.rdr'],
      ['dlgNetLogin.rdr', 'login_btn BUTTON CROSS proceed_net_login SWITCHMENU -> dlgNetAuthenticate.rdr'],
      ['dlgNetAuthenticate.rdr', 'SCREEN EVENT ONSTART init_socom_online SWITCHMENU -> dlgNetServerSelect.rdr'],
      ['dlgNetServerSelect.rdr', 'SCREEN EVENT MP_SUCCESS server_connected SWITCHMENU -> dlgNetPlayerName.rdr'],
      ['dlgNetPlayerName.rdr', 'connect_btn BUTTON CROSS register_new_account SWITCHMENU -> dlgNetConnect.rdr'],
      ['dlgNetConnect.rdr', 'SCREEN EVENT ONSTART init_socom_online SWITCHMENU -> dlgUsagePolicy.rdr'],
      ['dlgUsagePolicy.rdr', 'YesAccept BUTTON CROSS ForceUsagePolicyReturn SWITCHMENU -> dlgWorldOfSOCOM.rdr'],
    ];
    for (const [from, edge] of PATH) expect(edges(from), from).toContain(edge);
  });

  it('SOCOM II ONLINE -> briefing room -> CREATE GAME / JOIN GAME -> game lobby -> the load screen', () => {
    expect(edges('dlgWorldOfSOCOM.rdr')).toContain('SCREEN EVENT MP_JOIN_ROOM switch_to_briefing_room SWITCHMENU -> dlgMPBriefingRoom.rdr (library)');
    expect(edges('dlgMPBriefingRoom.rdr')).toContain('CRgame BUTTON CROSS OnCreateGamePress SWITCHMENU -> dlgCreateGame.rdr');
    expect(edges('dlgMPBriefingRoom.rdr')).toContain('GAMELIST BUTTON CROSS join_game SWITCHMENU -> dlgGameLobby.rdr');
    expect(edges('dlgCreateGame.rdr')).toContain('SCREEN BUTTON SQUARE create_game SWITCHMENU -> dlgGameLobby.rdr');
    expect(edges('dlgGameLobby.rdr')).toContain('SCREEN EVENT ONSTART check_loop SWITCHMENU -> LOAD_SCREEN');
    expect(edges('dlgGameLobby.rdr')).toContain('weaponselect BUTTON CROSS goto_eq_mp_set_return_valve SWITCHMENU -> dlg_equipment_mp.rdr');
  });

  it('the ways back: TRIANGLE on LOGIN to the main menu, on DNAS and the universe list a REBOOT; the NTGUI return to LOGIN', () => {
    expect(edges('dlgNetLogin.rdr')).toContain('SCREEN BUTTON TRIANGLE exit_net_login SWITCHMENU -> dlgMenu.rdr');
    expect(edges('dlgNetAuthenticate.rdr')).toContain('SCREEN BUTTON TRIANGLE exit_connect_screen SWITCHMENU -> REBOOT');
    expect(edges('dlgNetServerSelect.rdr')).toContain('SCREEN BUTTON TRIANGLE exit_server_select SWITCHMENU -> REBOOT');
    expect(edges('dlgReturnFromNTGUI2.rdr')).toContain('SCREEN EVENT ONSTART do_onstart SWITCHMENU -> dlgNetLogin.rdr');
  });

  it('the pairs of the path are in the pin\'s pair list', () => {
    const path = [...ONLINE_PATH];
    for (let i = 0; i + 1 < path.length; i++) expect(pin!.pairs).toContain(`${path[i]} -> ${path[i + 1]}`);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The note and the files against the pin: a chapter pinned has its section or its row in research 128 (ONL-33's review).

const NOTE = resolve(import.meta.dirname, '../../docs/research/128-the-online-dialogs.md');
const FILES = ['../onlineDialogs.ts', '../dump-online-dialogs.ts', 'onlineDialogs.test.ts', 'onlineDialogsDisc.test.ts', 'onlineDialogs.pinned.json', '../../docs/research/128-the-online-dialogs.md'];

describe('research 128 against the pin', () => {
  const pin = JSON.parse(readFileSync(PIN, 'utf8')) as { dialogs: string[]; chapters: { name: string }[] };
  const note = readFileSync(NOTE, 'utf8');

  it('says how many chapters the pin holds', () => {
    expect(note.match(/\((\d+) chapters,/)?.[1]).toBe(String(pin.chapters.length));
  });

  it('gives every pinned chapter a section (### ... `dlgX`) or a row of §4.13 (| dlgX ...)', () => {
    const missing = pin.dialogs.map((d) => d.replace(/\.rdr$/, '')).filter((d) =>
      !new RegExp(`^###[^\\n]*\`${d}\``, 'm').test(note) && !new RegExp(`^\\| ${d}( \\(READERX\\))? \\|`, 'm').test(note));
    expect(missing).toEqual([]);
  });

  it('the chapter\'s files are valid UTF-8', () => {
    const bad = FILES.filter((f) => { try { new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(resolve(import.meta.dirname, f))); return false; } catch { return true; } });
    expect(bad).toEqual([]);
  });
});
