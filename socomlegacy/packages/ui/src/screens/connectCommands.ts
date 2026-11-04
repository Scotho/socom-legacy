import { deliverDialogEvent } from '../movie/movieCommands';
import type { UiCommandHandler, UiCommandHost } from '../uiCommands';
import type { UiVarManager, UiVariable } from '../uiVars';
import type { ZAnimUiCommand } from '../zanimRuntime';
import type { DialogPartsHost } from './dialogParts';
import type { DnasEntryCommand } from './dnasCommands';
import type { FrontEndMachine } from './frontEndMachine';
import type { LobbyClient } from './lobbyClient';
import { PLAYER_PASSWORD_VAR } from './netLoginCommands';
import { PLAYER_NAME_VAR, type AcctDb } from './personaCommands';

/**
 * CONNECTING's rows (`dlgNetConnect.rdr`, ONL-07; web research 157 §3, on research 128 §4.5 and 153 §6): `LobbyLogin`
 * and `LobbyRegister`, which the screen's `init_socom_online` dispatches, over the lobby client
 * (`./lobbyClient`: the states, the requests, the events). PLAT-08's `UiCommandHost` is a registry each module fills
 * (`setHandler`, W9.R4): `register` binds the two rows and the table itself is not edited. `D:L<line>` = a line of
 * `socom2_game.elf.decomp.c`; an address is the retail ELF's.
 *
 * **What the screen does with them** (the set, decoded by ONL-33's chapter reader): ONSTART runs `init_socom_online`
 * (`ScaleSet`; the valve `UsagePolicyReturnScreen` = 1; `IF LobbyLogin` -- else `exit_connect_screen` -- then a loop
 * on the valve `socom_online_state`, a literal caption a state into `ONLINE_LOBBY_STATE`: 12 "STATE: SESSION BEGIN",
 * 7 "STATE: ACCOUNT LOGIN", 3 "STATE: ACCOUNT REGISTRATION", 8, 4, 9, 5 (states the retail client never enters), 10
 * "STATE: LOGIN FAILURE" with the question "Player Name not found. Would you like to register this Player Name?"
 * (YES #253: `LobbyRegister`; NO #246: `exit_connect_screen`), 6 "STATE: REGISTRATION FAILURE", WAIT 1 and
 * `exit_connect_screen`, 11 the way out: "STATE: LOGGED IN", `DownloadCharacterProfile` (blocking, its own 3 s
 * cut-off), WAIT 1, `SWITCHMENU(dlgUsagePolicy.rdr)`), `Connect_flash` (the progress strip) and `monitor_timeout`
 * (WAIT 90, then `notify_unknown_failure`: #547, #515 for 5 s, `exit_connect_screen`). The events: MP_PLAYER_LOGGED_IN
 * #543, MP_FILTER_FAILURE #544 (and `NameIsVulgar` = 1), MP_INVALID_PASSWORD #545, MP_MEDIUS_ERROR its own text then
 * #515 for 5 s -- each then `exit_connect_screen` (`SWITCHMENU(PREVIOUS_SCREEN)`: the persona form). #546
 * (`notify_connect_failure`) is started by no binding, no animation and no string of the ELF; #548 is named by no
 * dialog.
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/** The connecting screen's dialog. */
export const CONNECT_DIALOG = 'dlgNetConnect.rdr';

/** The rows: index in the table, id, name, function (`readBindingTable`; held to PLAT-08's table by the test). */
export const CONNECT_COMMAND_ROWS = [
  { row: 37, id: 37, name: 'LobbyRegister', fn: 0x27dde0 },
  { row: 39, id: 39, name: 'LobbyLogin', fn: 0x27dd20 },
] as const;
export type ConnectCommandName = (typeof CONNECT_COMMAND_ROWS)[number]['name'];

/**
 * Every bound function `dlgNetConnect.rdr`'s chapter names (its layout's bindings, its own set and `UIanim.rdr`'s
 * `OnSystemMessage`: ONL-33's pin, `tools/test/onlineDialogs.pinned.json`), each answered by a task, as ONL-06's
 * `PERSONA_ENTRY_COMMANDS` does. `tools/test/connectEntryCommands.test.ts` holds the list to the pin.
 */
export const CONNECT_ENTRY_COMMANDS: readonly DnasEntryCommand[] = [
  { name: 'SwitchMenu', status: 'earlier', task: 'PLAT-10', spelt: ['SWITCHMENU'] },
  { name: 'PopUpDialog', status: 'earlier', task: 'PLAT-10', spelt: ['POPUPDIALOG'] },
  { name: 'LobbyLogin', status: 'here', task: 'ONL-07', spelt: [] },
  { name: 'LobbyRegister', status: 'here', task: 'ONL-07', spelt: [] },
  {
    name: 'CharacterProfile', status: 'declared', task: 'PLAT-34', spelt: [],
    why: "`DownloadCharacterProfile`'s two calls: the persona's weapon profile `WeapProfile_<account id>.dat` asked of the server's file service -- sub-op 5 `LoadFromServer` (`FUN_0033ea10` D:L239541-239589) then 6 `WaitForLoadComplete` (`FUN_0033e850` D:L239480-239538), of the eight the builder `FUN_00275d30` decodes (D:L122135-122195). The row is the ARMORY's (PLAT-34) and no file service exists; the table answers its not-implemented placeholder (true) for both, and the animation's own second sequence (WAIT 3, STOP) ends it after 3 s either way (research 157 §3.3)",
  },
];

/**
 * PASSWORD_DROPPED_AT_ANSWER_ADAPTATION: the owner's ruling OT.R17 (2026-10-04: "persona name is saved but password
 * isn't"; the typed password goes once to the service and is held nowhere after), not the original's behaviour -- the
 * console keeps PLAYERPASSWORD and the account list's copy for the session, so its form shows the stars again after a
 * refused login. Here, when the login is answered (a success; a refusal: -997, -978, any other; a registration's end),
 * or on the first frame the connecting screen is no longer the dialog built while a login was pending (the register
 * question answered NO; the 90 s watchdog), PLAYERPASSWORD is set to the empty string, every record of the account
 * list in memory loses its password, and the page's keyboard is told to let its last text go (`forget`). -998 alone
 * keeps PLAYERPASSWORD until the question is answered: `LobbyRegister` reads the variable again (`FUN_0027dde0`).
 * *Narrowed 2026-10-17 to typed passwords (SAVE-PASSWORD, MISSION OT.R61): the page's wiring keeps a saved password --
 * the stand-in of a record saved under SAVE PASSWORD: YES -- in PLAYERPASSWORD and the list, as the original keeps it,
 * and keeps a password typed under YES as the stand-in of its length (`packages/viewer/src/connectHost.ts`
 * `connectLobby`, `packages/viewer/src/personaHost.ts` `PageAcctDb`).*
 */
export const PASSWORD_DROPPED_AT_ANSWER_ADAPTATION = 'PLAYERPASSWORD, the account list and the keyboard let the typed password go when the login is answered or the screen is left (OT.R17)' as const;

/**
 * PASSWORD_DROPPED_ON_REFUSED_ROW_ADAPTATION: the same ruling (OT.R17) where no login is ever pending. A `LobbyLogin`
 * or `LobbyRegister` that read a password with text and answers 0 -- the lobby session down (`FUN_002fa5a0` /
 * `FUN_002fa320` with the flag clear: the persona form's deep link with no universe reply never connects), or no name
 * -- hands it to nothing, and the set runs `exit_connect_screen` at once: the password is dropped there and then, as at
 * an answer (`forgetPassword`). The console keeps it, as it keeps every copy.
 */
export const PASSWORD_DROPPED_ON_REFUSED_ROW_ADAPTATION = 'a row that read a password and answers 0 drops it at once (OT.R17)' as const;

/**
 * The lobby's event callback (`DAT_0044f3c8(name, argument)`) over the front end: the built dialog's event records of
 * `kind` (`FUN_00367810` D:L263357-263396) -- each bound animation started with its own `ARGUMENT`, or, when the event
 * carries an argument (`param_3 != 0`, D:L263383-263385: MP_MEDIUS_ERROR's text), with that as its input string, as
 * PLAT-17's keyboard events are delivered.
 */
export function lobbyEventInto(machine: () => FrontEndMachine, parts: DialogPartsHost): (kind: number, text: string | null) => void {
  return (kind, text) => {
    const shell = machine().shell();
    if (!shell) return;
    if (text === null) { shell.event(kind); return; }
    const current = parts.current;
    if (!shell.design || !current) return;
    deliverDialogEvent(shell.design.bindings, kind, (anim) => current.widgetHost.animation(anim, text));
  };
}

export interface ConnectCommandsOptions {
  /** The game's one `CUIVarManager` (0x437e80). */
  uiVars: UiVarManager;
  /** The lobby (0x44f370). Its `settled` is to call `forgetPassword` (the page's wiring; `packages/viewer/src/connectHost.ts`). */
  lobby: Pick<LobbyClient, 'login' | 'register' | 'step' | 'forgetPassword'>;
  /** The client's account list (0x44fc60), asked when it is needed: its passwords in memory are dropped with PLAYERPASSWORD. Absent: none is held. */
  db?: () => AcctDb | null | undefined;
  /** The page's other holders of the typed text (the soft keyboard's last text), told to let it go. */
  forget?: () => void;
  /** A row called, as it happens. */
  log?: (name: ConnectCommandName, arg: string, answer: boolean) => void;
}

export class ConnectCommands {
  /** A login or a registration was handed the password and the screen has not been left since. */
  private pending = false;

  constructor(private readonly o: ConnectCommandsOptions) {}

  private answer(name: ConnectCommandName, cmd: ZAnimUiCommand, answer: boolean): boolean {
    this.o.log?.(name, cmd.arg, answer);
    return answer;
  }

  /** A variable's string, or null when it holds none (`*pc == '\x03'`). */
  private str(v: UiVariable): string | null { return v.value.type === 'string' ? v.value.value : null; }

  /**
   * PLAYERNAMEVAR and PLAYERPASSWORD as both bodies read them: each added TEMPORARY; `c` both strings with text, else
   * null; `read` whether a password with text was read (`PASSWORD_DROPPED_ON_REFUSED_ROW_ADAPTATION`).
   */
  private credentials(): { c: { name: string; password: string } | null; read: boolean } {
    const vars = this.o.uiVars;
    const name = this.str(vars.add(PLAYER_NAME_VAR, null, 1));
    const password = this.str(vars.add(PLAYER_PASSWORD_VAR, null, 1));
    const read = password !== null && password !== '';
    return { c: name === null || name === '' || !read ? null : { name, password }, read };
  }

  /** A row's end: handed to the lobby, the password is pending; refused with a password read, it is dropped now. */
  private handed(ok: boolean, read: boolean): void {
    if (ok) this.pending = true;
    else if (read) this.forgetPassword();
  }

  /**
   * `FUN_0027dd20` (D:L126241-126269): PLAYERNAMEVAR (0x3ee980) and PLAYERPASSWORD (0x3ee990), each added TEMPORARY;
   * either no string or empty, answer 0; else the lobby's login with both (`FUN_002fa5a0`), whose answer is the row's.
   */
  LobbyLogin: UiCommandHandler = (cmd) => {
    const { c, read } = this.credentials();
    const ok = c !== null && this.o.lobby.login(c.name, c.password);
    this.handed(ok, read);
    return this.answer('LobbyLogin', cmd, ok);
  };

  /** `FUN_0027dde0` (D:L126272-126300): the same two variables into the lobby's registration (`FUN_002fa320`). */
  LobbyRegister: UiCommandHandler = (cmd) => {
    const { c, read } = this.credentials();
    const ok = c !== null && this.o.lobby.register(c.name, c.password);
    this.handed(ok, read);
    return this.answer('LobbyRegister', cmd, ok);
  };

  /** `PASSWORD_DROPPED_AT_ANSWER_ADAPTATION`: the lobby client's `settled`, and `frame`'s leave. */
  forgetPassword(): void {
    this.pending = false;
    this.o.lobby.forgetPassword();
    const vars = this.o.uiVars;
    const v = vars.find(PLAYER_PASSWORD_VAR);
    if (v && v.value.type === 'string' && v.value.value !== '') vars.set(v, { type: 'string', value: '' });
    this.o.db?.()?.forgetPasswords();
    this.o.forget?.();
  }

  /**
   * One frame of the page: the lobby's step (`FUN_002dfe50`, which the network update calls once a frame,
   * D:L210249 / D:L210256), then -- `PASSWORD_DROPPED_AT_ANSWER_ADAPTATION` -- the password dropped when a login is
   * pending and the dialog built is no longer the connecting screen. `dialog` is the built dialog's name, or null.
   */
  frame(dialog: string | null): void {
    this.o.lobby.step();
    if (this.pending && dialog?.toLowerCase() !== CONNECT_DIALOG.toLowerCase()) this.forgetPassword();
  }

  /** The entries by their table name. */
  entries(): Record<ConnectCommandName, UiCommandHandler> {
    return { LobbyRegister: this.LobbyRegister, LobbyLogin: this.LobbyLogin };
  }

  /** Each row's body set in PLAT-08's host (`UiCommandHost.setHandler`). */
  register(host: UiCommandHost): void {
    for (const [name, h] of Object.entries(this.entries())) host.setHandler(name, h);
  }
}
