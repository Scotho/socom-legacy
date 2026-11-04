import type { UiCommandHandler, UiCommandHost } from '../uiCommands';
import type { UiVarManager, UiVarValue } from '../uiVars';
import { VALVE_TYPE, type ValveStore } from '../valves';
import type { ZAnimUiCommand } from '../zanimRuntime';
import { NET_WORKER_RESULT_READING, type DnasEntryCommand, type NetJob } from './dnasCommands';

/**
 * SELECT UNIVERSE's data (`dlgNetServerSelect.rdr`, ONL-04; web research 147, on research 128 §4.3 and 133): the
 * universe query `GetServerList`'s worker sends, the client's two lists its replies fill, and the two rows the screen's
 * set dispatches that PLAT-08's table declares for ONL-04 -- `LobbyDisconnect` and `UpdateServerInfo`. PLAT-08's
 * `UiCommandHost` is a registry each module fills (`setHandler`, W9.R4); the table is not edited.
 *
 * **The worker** (`GetServerList`'s, vtable 0x406730, research 146 §2): its message handler `FUN_002fb340`
 * (D:L198714-198748) is called with a phase byte. Phase 0 clears the entry list (`FUN_002fff90(0x44fd50)`), clears the
 * two done flags `DAT_0044fd80` / `DAT_0044fd88` and sends LobbyExt 0x03 (`FUN_0064ad98` D:L561889-561912, the
 * callbacks `FUN_002fded0` for the news and `FUN_002fdaf0` for the entries) with InfoType 3, CharacterEncoding 2,
 * Language 1. Phase 1, once both flags are set, writes 1 into the worker's valve (+0x38, the `short` at +4, the watchers
 * told on a change) and posts its end. A query never answered leaves both flags clear: the worker runs on, and the DNAS
 * screen's 90-s `monitor_timeout` reboots (research 146 R146.9).
 *
 * **The replies** arrive through the page's service (`UniverseService`: SVC-05's `POST /texts/universe` on the match
 * server, `packages/central/src/serverTexts.ts`), the fields by the names research 133 §1 gives them. Each entry is
 * `FUN_002fdaf0` (D:L199953-200104): a non-success status (`FUN_002f42d0`: `status == 0`) sets the entries' flag and
 * nothing else; a success is copied into the list (`FUN_002fee50(0x44fd50, ..)`), and on the one with EndOfList (+0x2b4)
 * SERVER_LIST (0x3f5e08) is built -- an array with one array per universe: the name (+0x1c), `status word == 0`
 * (+0x220), the users (+0x224) and the max users (+0x228) -- and added at longevity 1 (`FUN_003857c0(0x437e80, ..,
 * 1)`), then the flag is set. Each news chunk is `FUN_002fded0` (D:L200125-200144): a success is appended to the news
 * list (0x44fd70) and EndOfList (+0x11c) sets the flag; a failure sets the flag. The news list is cleared nowhere but at
 * start-up (`FUN_003000a0(0x44fd70, 0x10)`, D:L328692-328695): a second query appends its news after the first's.
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/** The rows: index in the table, id, name, function (`readBindingTable`; held to PLAT-08's table by the test). */
export const UNIVERSE_COMMAND_ROWS = [
  { row: 152, id: 153, name: 'LobbyDisconnect', fn: 0x274d60 },
  { row: 154, id: 155, name: 'UpdateServerInfo', fn: 0x274c00 },
] as const;
export type UniverseCommandName = (typeof UNIVERSE_COMMAND_ROWS)[number]['name'];

/**
 * Every bound function `dlgNetServerSelect.rdr`'s chapter names (its layout's bindings and its own set; no library
 * animation is reached: ONL-33's pin, `tools/test/onlineDialogs.pinned.json`), each answered by a task, as ONL-03's
 * `DNAS_ENTRY_COMMANDS` does for the DNAS screen. `tools/test/universeEntryCommands.test.ts` holds the list to the pin.
 */
export const UNIVERSE_ENTRY_COMMANDS: readonly DnasEntryCommand[] = [
  { name: 'SwitchMenu', status: 'earlier', task: 'PLAT-10', spelt: ['SWITCHMENU'] },
  { name: 'PopUpDialog', status: 'earlier', task: 'PLAT-10', spelt: ['POPUPDIALOG'] },
  { name: 'KillPopUp', status: 'earlier', task: 'PLAT-10', spelt: ['KillPopup'] },
  { name: 'ClearUIVar', status: 'earlier', task: 'MENU-01a', spelt: [] },
  { name: 'LobbyDisconnect', status: 'here', task: 'ONL-04', spelt: [] },
  { name: 'UpdateServerInfo', status: 'here', task: 'ONL-04', spelt: [] },
  // SERVERLIST's CROSS (`select_server`), answered since ONL-06 by its module (`personaCommands.ts`, research 153 §2;
  // registered in the host beside this one): the patch level's test, and the form's half of the connect -- the
  // connection itself stays ONL-07's (`PersonaLobby.connect`). Until 2026-10-04 both were declared (ONL-05, ONL-07).
  { name: 'VerifyPatchLevel', status: 'earlier', task: 'ONL-06', spelt: [] },
  { name: 'LobbyConnect', status: 'earlier', task: 'ONL-06', spelt: [] },
  {
    name: 'UnInitNetwork', status: 'declared', task: 'ONL-10', spelt: ['UNINITNETWORK'],
    why: "TRIANGLE's `exit_server_select` and `OnNetError`: the reboot out of the online path; its body (`FUN_0027e5c0` D:L126505-126515) disconnects the lobby and stops the DME layer, then answers 1 -- ONL-10's, mounted on the session (`logoffCommands.ts`, web research 160 §2.2); the table answers 1 unimplemented too",
  },
];

/** The query's three words (`FUN_002fb340` D:L198741-198744; research 133 R133.1). */
export const UNIVERSE_QUERY = { infoType: 3, characterEncoding: 2, language: 1 } as const;
export type UniverseQuery = { infoType: number; characterEncoding: number; language: number };

/** The UI variables the handlers write (the ELF's strings at 0x3f5e08, 0x3ee8e0, 0x3ee8f0). */
export const SERVER_LIST_VAR = 'SERVER_LIST';
export const SERVER_NEWS_VAR = 'SERVER_NEWS';
export const SERVER_NAME_VAR = 'SERVER_NAME';
/** What `UpdateServerInfo` puts between the description and the news (ELF 0x3ee8d8). */
export const SERVER_NEWS_SEPARATOR = '\n\n';

/** One LobbyExt 0x04 entry (`MediusUniverseStatusList_ExtraInfoResponse`), the fields `FUN_002fdaf0` reads (research 133 §2). */
export interface UniverseEntry {
  status: number;
  name: string;
  dns: string;
  port: number;
  description: string;
  universeStatus: number;
  userCount: number;
  maxUsers: number;
  billing: string;
  billingName: string;
  extendedInfo: string;
  endOfList: boolean;
}
/** One Lobby 0xc9 news reply (`FUN_002fded0`). */
export interface UniverseNewsChunk { status: number; news: string; endOfList: boolean }
/** The service's answer to one query: the entries, then the news, in the order they are handled. */
export interface UniverseReply { universes: UniverseEntry[]; news: UniverseNewsChunk[] }
/** The page's half: the query sent, the replies back (a rejection is a query never answered). */
export interface UniverseService { query(q: UniverseQuery): Promise<UniverseReply> }

/**
 * LOBBY_DISCONNECT_READING: `LobbyDisconnect` (`FUN_00274d60`, D:L121599-121614) asks the lobby connection (0x44fe10,
 * `FUN_003045b0`) whether it is up: up, it disconnects (`FUN_003043e0`); down, it calls `FUN_002dfdd0(0x44f370)`, which
 * was not followed. Either way the answer is 1. The port has no lobby connection before ONL-07's `LobbyConnect`; the
 * page's hook is told, and nothing else is done. [reading] *Followed by ONL-07 (2026-10-05, research 157 §2):
 * `FUN_002dfdd0` (D:L182488-182499) clears the session flag, closes the transport and resets the lobby's lists; the
 * page's hook is `LobbyClient.disconnect`. The LAN branch (`FUN_003043e0`) is still not read.*
 */
export const LOBBY_DISCONNECT_READING = 'the page\'s lobby told; FUN_002dfdd0 not followed' as const;

/** The client's two lists: the universe entries (0x44fd50) and the news (0x44fd70), with their done flags. */
export class UniverseList {
  private readonly entries: UniverseEntry[] = [];
  private readonly newsList: string[] = [];
  /** `DAT_0044fd80`: the entries have ended. */
  entriesEnded = false;
  /** `DAT_0044fd88`: the news has ended. */
  newsEnded = false;

  constructor(private readonly o: { uiVars: UiVarManager }) {}

  get count(): number { return this.entries.length; }
  get newsCount(): number { return this.newsList.length; }
  /** Both halves ended (`FUN_002fb340` phase 1's test, D:L198724). */
  get ended(): boolean { return this.entriesEnded && this.newsEnded; }

  /** `FUN_002fdaa0` (D:L199936-199949): the entry's name, or "" past the list (`DAT_003f5de0`). */
  name(i: number): string { return i >= 0 && i < this.entries.length ? this.entries[i]!.name : ''; }
  /** `FUN_002fda50` (D:L199919-199933): the entry's description, or "". */
  description(i: number): string { return i >= 0 && i < this.entries.length ? this.entries[i]!.description : ''; }
  /** `FUN_002fdea0`: the news chunk `i`. */
  news(i: number): string { return this.newsList[i] ?? ''; }
  /**
   * The first entry of a name, compared exactly (`strcmp` on +0x1c), or null: the walk of `FUN_002fd6e0`,
   * `FUN_002fd7e0`, `FUN_002fd8b0` and `FUN_002fd980` (D:L199827-199916), which SELECT UNIVERSE's CROSS runs through
   * `VerifyPatchLevel` and `LobbyConnect` (ONL-06, research 153 §2).
   */
  find(name: string): UniverseEntry | null { return this.entries.find((e) => e.name === name) ?? null; }
  /** The last entry of a name: `FUN_002fd610` (D:L199803-199824) walks the whole list and keeps its last match. */
  findLast(name: string): UniverseEntry | null {
    for (let i = this.entries.length - 1; i >= 0; i--) if (this.entries[i]!.name === name) return this.entries[i]!;
    return null;
  }

  /** `FUN_002fb340` phase 0 (D:L198737-198746): the entries cleared, the two flags cleared, the query sent. */
  start(service: UniverseService): void {
    this.entries.length = 0;
    this.entriesEnded = false;
    this.newsEnded = false;
    service.query({ ...UNIVERSE_QUERY }).then((r) => {
      for (const e of r.universes) this.entry(e);
      for (const n of r.news) this.newsChunk(n);
    }, () => { /* never answered: the flags stay clear and the worker runs on */ });
  }

  /** `FUN_002fdaf0` (D:L199953-200104): one entry. */
  entry(e: UniverseEntry): void {
    if (e.status !== 0) { this.entriesEnded = true; return; }
    this.entries.push({ ...e });
    if (!e.endOfList) return;
    const rows: UiVarValue[] = this.entries.map((u) => ({
      type: 'array', value: [
        { type: 'string', value: u.name },
        { type: 'int', value: u.universeStatus === 0 ? 1 : 0 },
        { type: 'int', value: u.userCount },
        { type: 'int', value: u.maxUsers },
      ],
    }));
    this.o.uiVars.add(SERVER_LIST_VAR, { type: 'array', value: rows }, 1);
    this.entriesEnded = true;
  }

  /** `FUN_002fded0` (D:L200125-200144): one news chunk. */
  newsChunk(n: UniverseNewsChunk): void {
    if (n.status !== 0) { this.newsEnded = true; return; }
    this.newsList.push(n.news);
    if (n.endOfList) this.newsEnded = true;
  }

  /**
   * `GetServerList`'s worker as a `NetJob`: made, it sends the query (phase 0); each poll is phase 1's test; ended, the
   * result is the 1 phase 1 writes (D:L198727-198734) -- `NET_WORKER_RESULT_READING`'s value, here read for this worker.
   */
  job(service: UniverseService): NetJob {
    this.start(service);
    return { poll: () => this.ended, result: NET_WORKER_RESULT_READING };
  }
}

export interface UniverseCommandsOptions {
  /** The valve registry (0x49e800). */
  valves: () => ValveStore;
  /** The game's one `CUIVarManager` (0x437e80). */
  uiVars: UiVarManager;
  /** The client's lists (the page's one `UniverseList`, shared with `DnasCommands`' `GetServerList`). */
  list: UniverseList;
  /** The page's lobby connection told to close (`LOBBY_DISCONNECT_READING`); absent, nothing. */
  lobbyDisconnect?: () => void;
  /** A row called, as it happens. */
  log?: (name: UniverseCommandName, arg: string, answer: boolean) => void;
}

export class UniverseCommands {
  constructor(private readonly o: UniverseCommandsOptions) {}

  private answer(name: UniverseCommandName, cmd: ZAnimUiCommand, answer: boolean): boolean {
    this.o.log?.(name, cmd.arg, answer);
    return answer;
  }

  /** `FUN_00274d60` (D:L121599-121614): the lobby closed if up (`LOBBY_DISCONNECT_READING`); answer 1. */
  LobbyDisconnect: UiCommandHandler = (cmd) => {
    this.o.lobbyDisconnect?.();
    return this.answer('LobbyDisconnect', cmd, true);
  };

  /**
   * `FUN_00274c00` (D:L121558-121596): the valve the argument names acquired TEMP (`FUN_00351ff0(names[+8], 2)`), its
   * `short` the index; SERVER_NEWS added at longevity 1 as an array -- the entry's description (`FUN_002fda50`), the
   * separator (0x3ee8d8) and every news chunk in order (`FUN_002fdec0` / `FUN_002fdea0`); SERVER_NAME added at 1 with no
   * value, then set to the entry's name (`FUN_002fdaa0`, `FUN_003862a0`); answer 1.
   */
  UpdateServerInfo: UiCommandHandler = (cmd) => {
    const list = this.o.list;
    const i = this.o.valves().acquire(cmd.arg, VALVE_TYPE.TEMP).value & 0xffff;
    const parts: UiVarValue[] = [{ type: 'string', value: list.description(i) }, { type: 'string', value: SERVER_NEWS_SEPARATOR }];
    for (let n = 0; n < list.newsCount; n++) parts.push({ type: 'string', value: list.news(n) });
    const vars = this.o.uiVars;
    vars.add(SERVER_NEWS_VAR, { type: 'array', value: parts }, 1);
    const name = vars.add(SERVER_NAME_VAR, null, 1);
    vars.set(name, { type: 'string', value: list.name(i) });
    return this.answer('UpdateServerInfo', cmd, true);
  };

  /** The entries by their table name. */
  entries(): Record<UniverseCommandName, UiCommandHandler> {
    return { LobbyDisconnect: this.LobbyDisconnect, UpdateServerInfo: this.UpdateServerInfo };
  }

  /** Each row's body set in PLAT-08's host (`UiCommandHost.setHandler`). */
  register(host: UiCommandHost): void {
    for (const [name, h] of Object.entries(this.entries())) host.setHandler(name, h);
  }
}
