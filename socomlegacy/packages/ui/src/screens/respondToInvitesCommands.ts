import type { UiCommandHandler, UiCommandHost } from '../uiCommands';
import type { ZAnimUiCommand } from '../zanimRuntime';
import type { ClanInvitationsService, MyClanInvitations } from './clanInvitations';

/**
 * RESPOND TO INVITES (`dlgRespondToInvites.rdr`, ONL-28, web sprint 18's clans' half; web research 273 §3) and its two
 * rows of PLAT-08's table -- `AcceptInvitation`, `DeclineInvitation` -- over SVC-09's RespondToClanInvitation
 * (`packages/central/src/clans.ts` `respond`, research 262 §4); the received list it shows and refreshes is SVC-09a's
 * (`MyClanInvitations`, `./clanInvitations`). `D:L<line>` = a line of `socom2_game.elf.decomp.c`; `S:0x...` a string of
 * the retail ELF. Transcribed, cited, never pasted; reading, pending review.
 *
 * **The page is the disc's** (`tools/dump-online-dialogs.ts --dialog dlgRespondToInvites.rdr`; research 273 §3): SOCOM
 * II ONLINE's INVITATIONS row opens it (`Goto_Invites`: StartMusic 1, `SwitchMenu`), enabled only while the received
 * list holds an invitation (`TurnOnInvitations`); ONSTART `OnRespondStart` sets LEAVE CLAN by `IsLeaderOfClan` /
 * `IsMemberOfClan` (hidden for the leader, active for a member, disabled with no clan), activates ACCEPT and disables
 * the list, and `find_invited_players` runs `CheckMyInvites` every 30 s. ACCEPT's and DECLINE's ONACTIVATE set
 * `AcceptOrDecline` 0 or 1 (help #728 / #729); their CROSS activates the list (#730 / #731) when one is held; a row's
 * CROSS (`Accept_invite`) -- for ACCEPT: the leader is told, in the set's own text, to appoint or disband first; a member
 * #732 ("You must leave the your currect Clan before you can join another."), the focus then on LEAVE CLAN; with no
 * clan `AcceptInvitation(INPUT_STRING)` -- the row's first cell, the invitation's id --, #733, then #734 and, past it,
 * `SwitchMenu(dlgWorldOfSOCOM.rdr)`; for DECLINE: #735, `DeclineInvitation(INPUT_STRING)`, the focus back on DECLINE.
 * RETURN switches to SOCOM II ONLINE; TRIANGLE goes back (`goto_menu(PREVIOUS_SCREEN)`). LEAVE CLAN's `QuitClan` is
 * ONL-27's row (`./manageRosterCommands`).
 *
 * **An accept leaves the client's clan as it was.** The response's reply `FUN_002e8a60` (D:L187710-187720) logs its
 * status ("RespondToClanInvitation", S:0x3f4500) and asks the received list again -- it writes no clan id, leader or
 * name: the client learns its new clan from GetMyClans, which SOCOM II ONLINE's `init_screen` runs at the switch the
 * accept's script makes (`GetClan`, ONL-27's GetMyClans, `./manageRosterCommands`). So `LobbyClan` is not touched here,
 * as the original's client is not.
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/** The dialog, and the one its accept and its RETURN switch to. */
export const RESPOND_TO_INVITES = 'dlgRespondToInvites.rdr';

/** The rows this module fills (PLAT-08's table: id, name, function), and the task the table names as their bodies' owner. */
export const RESPOND_TO_INVITES_COMMAND_ROWS = [
  { id: 113, name: 'AcceptInvitation', fn: 0x277550, task: 'ONL-28' },
  { id: 114, name: 'DeclineInvitation', fn: 0x2774c0, task: 'ONL-28' },
] as const;
export type RespondToInvitesCommandName = (typeof RESPOND_TO_INVITES_COMMAND_ROWS)[number]['name'];

/** The response's word at +0x2c (`MediusClanInvitationsResponseStatus`): 1 accept (`FUN_002e89f0`), 2 decline (`FUN_002e8980`). */
export const CLAN_INVITATION_RESPONSE = { accept: 1, decline: 2 } as const;

/**
 * The leader's refusal, the set's own literal (`Accept_invite`'s POPUP under `IsLeaderOfClan`: 149 bytes, no UIMnLOC id;
 * `tools/test/clanInvitationsDisc.test.ts` holds it to the disc).
 */
export const LEADER_CANNOT_JOIN_TEXT = 'You are the leader of a clan.  You must appoint a new leader or disband the clan from the manage roster screen before joining a new clan. \xa6 Continue.';

/** The arguments the rows test (S:0x3ee898). */
const INPUT_STRING = 'INPUT_STRING';

/** RespondToClanInvitation's request (Lobby 0x66, 0xf8 bytes): the id at +0x28, the response at +0x2c, the text +0x30:200 (left empty). */
export interface ClanInvitationResponse { clanInvitationId: number; response: 1 | 2; message: string }

/** The page's half (a rejection is a request never answered). */
export interface RespondToInvitesService {
  respond(q: ClanInvitationResponse): Promise<{ status: number }>;
}

export interface RespondToInvitesCommandsOptions {
  /** The received list (0x44f700, `MyClanInvitations`): the reply asks it again. */
  list: MyClanInvitations;
  /** CheckMyClanInvitations' service (SVC-09a's `/clan/invitations`). */
  invitations: ClanInvitationsService;
  /** The page's half; absent, every request is never answered. */
  service?: RespondToInvitesService;
  /** The running animation's input string (`FUN_00272480(ctx + 0x18, 0)`): a row's INPUT_STRING. */
  inputString?: (cmd: ZAnimUiCommand) => string | null;
  /** The session's ticket, for `CLAN_INVITE_TICKET_ADAPTATION` (`./invitedPlayersCommands`); absent, not checked. */
  ticket?: () => string | null;
  /** A row called, as it happens. */
  log?: (name: RespondToInvitesCommandName, arg: string, answer: boolean) => void;
}

/** `strtol(s, 0, 10)` (`FUN_00191490`): the leading integer, else 0. */
function strtol(s: string): number {
  const m = /^\s*([+-]?\d+)/.exec(s);
  return m ? Number(m[1]) | 0 : 0;
}

export class RespondToInvitesCommands {
  constructor(private readonly o: RespondToInvitesCommandsOptions) {}

  private answer(name: RespondToInvitesCommandName, cmd: ZAnimUiCommand, answer: boolean): boolean {
    this.o.log?.(name, cmd.arg, answer);
    return answer;
  }

  /**
   * The two rows' argument (`FUN_0026ed60`, the record's +8), INPUT_STRING (S:0x3ee898) replaced by the running
   * animation's input string (`FUN_00272480`), read by `strtol` base 10 (`FUN_00191490`): the invitation's id. A row
   * whose text is missing reads 0 here (the console's `strtol` of no string; the list's rows always hold their id).
   */
  private id(cmd: ZAnimUiCommand): number {
    const text = cmd.arg === INPUT_STRING ? this.o.inputString?.(cmd) ?? null : cmd.arg;
    return strtol(text ?? '');
  }

  /** `FUN_00277550` (D:L122892-122908) -> `FUN_002e89f0`: the response 1; answer 1. */
  AcceptInvitation: UiCommandHandler = (cmd) => {
    this.respond(this.id(cmd), CLAN_INVITATION_RESPONSE.accept);
    return this.answer('AcceptInvitation', cmd, true);
  };

  /** `FUN_002774c0` (D:L122873-122889) -> `FUN_002e8980`: the response 2; answer 1. */
  DeclineInvitation: UiCommandHandler = (cmd) => {
    this.respond(this.id(cmd), CLAN_INVITATION_RESPONSE.decline);
    return this.answer('DeclineInvitation', cmd, true);
  };

  /**
   * `FUN_002e89f0` / `FUN_002e8980` (D:L187668-187707): RespondToClanInvitation (0xf8 bytes: the session key at +0x15,
   * the id at +0x28, the response at +0x2c, the text left empty; `FUN_00645d78`), sent whatever the session's state (no
   * +0x7d or +0x60 test), with the callback `FUN_002e8a60` (D:L187710-187720): the status logged, the received list asked
   * again (`FUN_002e8650`, `MyClanInvitations.check`) -- after any status (`CLAN_INVITE_TICKET_ADAPTATION`: only under the
   * ticket the response went with).
   */
  private respond(clanInvitationId: number, response: 1 | 2): void {
    const svc = this.o.service;
    if (!svc) return;
    const ticket = this.o.ticket?.() ?? null;
    const held = (): boolean => this.o.ticket === undefined || (ticket !== null && this.o.ticket() === ticket);
    svc.respond({ clanInvitationId, response, message: '' }).then(() => { if (held()) this.o.list.check(this.o.invitations); }, () => { /* never answered */ });
  }

  /** The entries by their table name. */
  entries(): Record<RespondToInvitesCommandName, UiCommandHandler> {
    return { AcceptInvitation: this.AcceptInvitation, DeclineInvitation: this.DeclineInvitation };
  }

  /** Each row's body set in PLAT-08's host (`UiCommandHost.setHandler`). */
  register(host: UiCommandHost): void {
    for (const [name, h] of Object.entries(this.entries())) host.setHandler(name, h);
  }
}
