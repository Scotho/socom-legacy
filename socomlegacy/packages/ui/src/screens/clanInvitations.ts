import { DIALOG_EVENTS } from '../dialog';
import type { UiCommandHandler, UiCommandHost } from '../uiCommands';
import type { UiVarManager, UiVarValue } from '../uiVars';
import type { ZAnimUiCommand } from '../zanimRuntime';

/**
 * The SOCOM II ONLINE menu's INVITATIONS row, the client's half of SVC-09a (web research 156 §2): the request
 * `CheckMyInvites` sends, the client's list of received clan invitations its replies fill, the UI variable built from
 * it, and `HasClanInvitations`, which the row reads. The row itself is ONL-09's to draw: `dlgWorldOfSOCOM`'s ONSTART
 * `init_screen` runs `CheckMyInvites(NA)`, and its `TurnOnInvitations` loops `IF HasClanInvitations(NA)` -> EnableButton
 * and `_476_INVITATIONS_MSG`, else `_794_NoInvitations_MSG` and DisableButton (ONL-33's pin). ONL-09 registers
 * `ClanInvitationCommands` in PLAT-08's host with the page's service (`fetchClanInvitationsService` in
 * `packages/viewer/src/clanInvitationsHost.ts`, SVC-09a's `POST /clan/invitations` on the match server).
 *
 * **The request** (`CheckMyInvites` `FUN_0027a3c0` D:L124390-124397 -> `FUN_002e8650` D:L187564-187581): the received
 * list (0x44f700: its count `DAT_0044f704`, its items `DAT_0044f708`) cleared (`FUN_002e9380` D:L188004-188023); a
 * 0x30-byte request -- the session key (0x66a4d0, 17 bytes) at +0x15, +0x28 left 0, 999 at +0x2c -- sent through
 * `FUN_00645c38` with the callback `FUN_002e86c0`: Lobby 0x64 CheckMyClanInvitations by SVC-02's map (research 97 §2
 * row "CheckClanInvites"; `MediusCheckMyClanInvitationsRequest`'s Start and PageSize, `RT.Models/Lobby`). Answer 1.
 *
 * **The reply** (`FUN_002e86c0` D:L187584-187610, the 0x65 response's fields at +0x18 status, +0x1c invitation id,
 * +0x20 clan id, +0x24 response status, +0x28 message (200), +0xf0 leader id, +0xf4 leader name (32), +0x114 EndOfList):
 * a non-success status (`FUN_002f42d0` "CheckMyClanInvitations": status == 0) rebuilds the variable at once
 * (`FUN_002e8780`); a success with a response status of 2 or less is kept (`FUN_002e9240` D:L187961-188001: once per
 * invitation id), and at EndOfList with the list not empty the event MP_MEDIUS_HAS_INVITES is raised through the sink
 * `DAT_0044f3c8` (0x3f44d0) and the variable rebuilt. A success that ends the list with nothing kept writes nothing.
 *
 * **The variable** (`FUN_002e8780` D:L187613-187665): MY_CLAN_INVITES (lobby +0xd0, added at the session's start,
 * D:L182219-182220) set to an array of rows: an empty list, one row `[" ", "No Invitations", " "]` (0x3f3f18, 0x3f44e8);
 * else per invitation `["%d" of its id, its message, its status]`, the status 0 "Undecided", 1 "Accepted", 2
 * "Declined", else "Unknown" (0x3f4090, 0x3f40b0, 0x3f40a0, 0x3f40c0).
 *
 * **HasClanInvitations** (row 130, ELF 0x277950: `lui a0, 0x45; j 0x2e8770; addiu a0, a0, -0xc90`; at 0x2e8770
 * `lw v0, -0x8fc(at)` = `DAT_0044f704`, `jr ra; sltu v0, zero, v0`): the count is not 0.
 *
 * So a player with no invitation -- every player while clans are parked (OT.R8: no clan can exist) -- answered as our
 * Horizon answers (one NoResult reply that ends the list, `MLS.cs:1552-1560`) reads none: the count 0, the row "NO
 * INVITATIONS" and disabled.
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/** The rows (`readBindingTable`; held to PLAT-08's table by the test). Both declared for ONL-28 in the table. */
export const CLAN_INVITATION_COMMAND_ROWS = [
  { row: 83, id: 85, name: 'CheckMyInvites', fn: 0x27a3c0 },
  { row: 129, id: 130, name: 'HasClanInvitations', fn: 0x277950 },
] as const;
export type ClanInvitationCommandName = (typeof CLAN_INVITATION_COMMAND_ROWS)[number]['name'];

/** The request's two words (`FUN_002e8650`: +0x28 zeroed, +0x2c 999). */
export const CLAN_INVITATIONS_QUERY = { start: 0, pageSize: 999 } as const;
export type ClanInvitationsQuery = { start: number; pageSize: number };

/** The UI variable (0x3f3940) and the none row's text (0x3f44e8). */
export const MY_CLAN_INVITES_VAR = 'MY_CLAN_INVITES';
export const NO_INVITATIONS_TEXT = 'No Invitations';
/** The none row's two outer cells and its separator (0x3f3f18). */
const BLANK_CELL = ' ';
/** The status words' names (`FUN_002e8780`), by `MediusClanInvitationsResponseStatus` 0..2; any other "Unknown". */
export const CLAN_INVITATION_STATUS = ['Undecided', 'Accepted', 'Declined'] as const;
const UNKNOWN_STATUS = 'Unknown';

/** One Lobby 0x65 reply (`MediusCheckMyClanInvitationsResponse`): the fields `FUN_002e86c0` and `FUN_002e9240` read. */
export interface ClanInvitationReply {
  status: number;
  clanInvitationId: number;
  clanId: number;
  responseStatus: number;
  message: string;
  leaderAccountId: number;
  leaderAccountName: string;
  endOfList: boolean;
}
/** The page's half: the request sent, the replies back in order (a rejection is a request never answered). */
export interface ClanInvitationsService { check(q: ClanInvitationsQuery): Promise<ClanInvitationReply[]> }

interface Kept { id: number; clanId: number; responseStatus: number; message: string; leaderAccountId: number; leaderAccountName: string }

export interface MyClanInvitationsOptions {
  /** The game's one `CUIVarManager` (0x437e80). */
  uiVars: UiVarManager;
  /** The event sink `DAT_0044f3c8` (the menu state's named events: the shell's `event(kind)`); absent, nothing. */
  event?: (kind: number) => void;
}

/** The received list (0x44f700) and its variable. */
export class MyClanInvitations {
  private readonly items: Kept[] = [];

  constructor(private readonly o: MyClanInvitationsOptions) {}

  /** `DAT_0044f704`. */
  get count(): number { return this.items.length; }
  /** `FUN_002e8770`: the count is not 0. */
  get has(): boolean { return this.items.length !== 0; }

  /** `FUN_002e8650` (D:L187564-187581): the list cleared, the request sent. */
  check(service: ClanInvitationsService): void {
    this.items.length = 0;
    service.check({ ...CLAN_INVITATIONS_QUERY }).then((rs) => {
      for (const r of rs) this.reply(r);
    }, () => { /* never answered: the list stays empty and the variable as it was */ });
  }

  /** `FUN_002e86c0` (D:L187584-187610): one reply. */
  reply(r: ClanInvitationReply): void {
    if (r.status !== 0) { this.publish(); return; }
    if ((r.responseStatus >>> 0) <= 2) this.keep(r);
    if (r.endOfList && this.items.length !== 0) {
      this.o.event?.(DIALOG_EVENTS['MP_MEDIUS_HAS_INVITES']!);
      this.publish();
    }
  }

  /** `FUN_002e9240` (D:L187961-188001): appended unless its invitation id is held. */
  private keep(r: ClanInvitationReply): void {
    if (this.items.some((k) => k.id === r.clanInvitationId)) return;
    this.items.push({
      id: r.clanInvitationId, clanId: r.clanId, responseStatus: r.responseStatus, message: r.message,
      leaderAccountId: r.leaderAccountId, leaderAccountName: r.leaderAccountName,
    });
  }

  /** `FUN_002e8780` (D:L187613-187665): MY_CLAN_INVITES set from the list. */
  publish(): void {
    const cell = (s: string): UiVarValue => ({ type: 'string', value: s });
    const rows: UiVarValue[] = this.items.length === 0
      ? [{ type: 'array', value: [cell(BLANK_CELL), cell(NO_INVITATIONS_TEXT), cell(BLANK_CELL)] }]
      : this.items.map((k) => ({
        type: 'array', value: [cell(String(k.id | 0)), cell(k.message), cell(CLAN_INVITATION_STATUS[k.responseStatus] ?? UNKNOWN_STATUS)],
      }));
    const vars = this.o.uiVars;
    vars.set(vars.add(MY_CLAN_INVITES_VAR, null, 1), { type: 'array', value: rows });
  }
}

export interface ClanInvitationCommandsOptions {
  list: MyClanInvitations;
  /** The request's service (SVC-09a's `/clan/invitations`). */
  service: ClanInvitationsService;
  /** A row called, as it happens. */
  log?: (name: ClanInvitationCommandName, arg: string, answer: boolean) => void;
}

/** The two rows the online menu's set dispatches for the row: register them in PLAT-08's host (ONL-09). */
export class ClanInvitationCommands {
  constructor(private readonly o: ClanInvitationCommandsOptions) {}

  private answer(name: ClanInvitationCommandName, cmd: ZAnimUiCommand, answer: boolean): boolean {
    this.o.log?.(name, cmd.arg, answer);
    return answer;
  }

  /** `FUN_0027a3c0` (D:L124390-124397): `FUN_002e8650`; answer 1. */
  CheckMyInvites: UiCommandHandler = (cmd) => {
    this.o.list.check(this.o.service);
    return this.answer('CheckMyInvites', cmd, true);
  };

  /** ELF 0x277950 -> 0x2e8770: the received count is not 0. */
  HasClanInvitations: UiCommandHandler = (cmd) => this.answer('HasClanInvitations', cmd, this.o.list.has);

  entries(): Record<ClanInvitationCommandName, UiCommandHandler> {
    return { CheckMyInvites: this.CheckMyInvites, HasClanInvitations: this.HasClanInvitations };
  }

  register(host: UiCommandHost): void {
    for (const [name, h] of Object.entries(this.entries())) host.setHandler(name, h);
  }
}
