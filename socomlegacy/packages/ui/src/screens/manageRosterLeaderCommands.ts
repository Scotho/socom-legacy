import { DIALOG_EVENTS } from '../dialog';
import type { UiCommandHandler, UiCommandHost } from '../uiCommands';
import type { LiveLongevity, UiVarManager } from '../uiVars';
import type { ZAnimUiCommand } from '../zanimRuntime';
import { MEDIUS_CLAN_MESSAGES_VAR, NO_CLAN_MESSAGES } from './clanMessagesCommands';
import { CLAN_DESCRIPTION_VAR, CLAN_NAME_VAR, clanStatsRecord, playerNameAndTag, type LobbyClan } from './createClanCommands';
import { clanRosterRating, sortClanRoster, type ManageRosterCommands, type ManageRosterService } from './manageRosterCommands';

/**
 * The leader's roster (`dlgManageRosterLeader.rdr`, ONL-27, web sprint 18's clans' half; web research 272 §2) and its
 * four rows of PLAT-08's table -- `RemovePlayerFromClan`, `TransferLeadership`, `DisbandClan`, `UpdateClanStats` -- over
 * SVC-09's RemovePlayerFromClan and SVC-08's TransferClanLeadership, DisbandClan and UpdateClanStats
 * (`packages/central/src/clans.ts`: `/clan/remove`, `/clan/transfer-leadership`, `/clan/disband`, `/clan/update-stats`;
 * research 262). The roster, GetMyClans and QuitClan are `./manageRosterCommands`'s; EDIT NEWS is ONL-29's
 * (`./clanMessagesCommands`), INVITATIONS ONL-28's page (`./invitedPlayersCommands`). `D:L<line>` = a line of
 * `socom2_game.elf.decomp.c`; `S:0x...` a string of the retail ELF; `ELF 0x...` an instruction read off the ELF where the
 * decompilation has no block. Transcribed, cited, never pasted; reading, pending review.
 *
 * **The page is the disc's** (`tools/dump-online-dialogs.ts --dialog dlgManageRosterLeader.rdr`; research 272 §2): the
 * title "MANAGE CLAN:" (the layout's literal), the rows EDIT NEWS #475, INVITATIONS #476, REMOVE PLAYERS #477, VIEW INFO
 * #460, APPOINT LEADER #478, DISBAND CLAN #479, CLAN TAG #480, RETURN #314; the roster's list as the member's. Each of
 * REMOVE PLAYERS (#487), VIEW INFO (#471) and APPOINT LEADER (#490) sets `ActivateRosterFrom` 0 / 2 / 1 on its
 * ONACTIVATE, and its CROSS (`OnRemoveAppointPress`) activates the list (#495 / #472 / #496); a row's CROSS
 * (`DoSomething`): to remove, unless `IsLeaderOfClan(INPUT_STRING)` -- the set's literal refusal "You are the leader of
 * this clan, you cannot remove yourself." with its "Continue" -- #492 (NO / YES), YES `RemovePlayerFromClan` and #493,
 * NO #389; to appoint, unless the row is the leader's, #491, YES `TransferLeadership(INPUT_STRING)`, NO #389; to view,
 * PLAYER INFO. DISBAND CLAN's CROSS (`clan_disband`) asks #500: YES `DisbandClan`, NO #501. CLAN TAG's CROSS
 * (`clan_tag`): the game's keyboard on Clan_Description (`MPPLAYERNAME`, #499, 3 characters of 15 bytes), the wait,
 * `NetCensorText(Clan_Description)`, half a second, `UpdateClanStats`. The events: MP_DISBAND_CLAN_SUCCESS to SOCOM II
 * ONLINE, MP_DISBAND_CLAN_FAILURE a popup of its text, MP_LEADERSHIP_TRANSFER_SUCCESS to the member's roster,
 * MP_PLAYER_IS_LEADER #502; #505 and #506 are the set's and bound by no event.
 *
 * The transport is ours (OT.R27): `ManageRosterLeaderService` is the page's `/clan/remove`, `/clan/transfer-leadership`,
 * `/clan/disband` and `/clan/update-stats` with the session's ticket as the bearer
 * (`packages/viewer/src/manageRosterHost.ts`). A rejection is a request never answered.
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/** The rows this module fills (PLAT-08's table: id, name, function), and the task the table names as their bodies' owner. */
export const MANAGE_ROSTER_LEADER_COMMAND_ROWS = [
  { id: 78, name: 'RemovePlayerFromClan', fn: 0x27a840, task: 'ONL-27' },
  { id: 115, name: 'TransferLeadership', fn: 0x277430, task: 'ONL-27' },
  { id: 51, name: 'DisbandClan', fn: 0x27a920, task: 'ONL-27' },
  { id: 102, name: 'UpdateClanStats', fn: 0x277610, task: 'ONL-27' },
] as const;
export type ManageRosterLeaderCommandName = (typeof MANAGE_ROSTER_LEADER_COMMAND_ROWS)[number]['name'];

/** The leader's refusal of his own row, the set's literal (`DoSomething`'s POPUP, no UIMnLOC id; its button the literal "Continue"). */
export const LEADER_CANNOT_REMOVE_SELF_TEXT = 'You are the leader of this clan, you cannot remove yourself.';

/** The disband's error (S:0x3f3fa0, `sprintf` of the status's name, D:L186533-186534). */
export const CLAN_DISBAND_ERROR_FORMAT = 'Clan Disband Error: %s';
/** `FUN_002f4300`'s answer for a status it does not name (S:0x3f55d0). */
export const MEDIUS_STATUS_TEXT_UNKNOWN = 'Unknown/Invalid Medius Status Code';

/**
 * `FUN_002f4300` (D:L194356-194523): a Medius status's name, 4 down to 0 and -954 down to -1000, each the ELF's string
 * (S:0x3f55c0 .. S:0x3f4fd0, held by `tools/test/manageRosterDisc.test.ts`); any other `MEDIUS_STATUS_TEXT_UNKNOWN`.
 */
const STATUS_NAMES: Readonly<Record<number, string>> = {
  4: 'MediusPass', 3: 'MediusWorldCreatedSizeReduced', 2: 'MediusRequestAccepted', 1: 'MediusNoResult', 0: 'MediusSuccess',
  [-954]: 'MediusIncompatibleAppID', [-955]: 'MediusKeyError', [-956]: 'MediusMaxExceeded', [-957]: 'MediusDataDoesNotExist',
  [-958]: 'MediusDataAlreadyExists', [-959]: 'MediusCacheFailure', [-960]: 'MediusFileQuotaExceeded', [-961]: 'MediusFileInvalidFilename',
  [-962]: 'MediusFileAlreadyExists', [-963]: 'MediusFileDoesNotExist', [-964]: 'MediusFileNoPermissions', [-965]: 'MediusFileInternalAccessError',
  [-966]: 'MediusFail', [-967]: 'MediusFilterFailed', [-968]: 'MediusTextStringInvalid', [-969]: 'MediusSessionKeyInvalid',
  [-970]: 'MediusClanNameInUse', [-971]: 'MediusClanNotFound', [-972]: 'MediusPlayerBanned', [-973]: 'MediusGameNameNotFound',
  [-974]: 'MediusChannelNameExists', [-975]: 'MediusGameNameExists', [-976]: 'MediusChannelNotFound', [-977]: 'MediusGameNotFound',
  [-978]: 'MediusInvalidPassword', [-979]: 'MediusInvalidRequestMsg', [-980]: 'MediusFilterNotFound', [-981]: 'MediusNumFiltersAtMax',
  [-982]: 'MediusGetGameListFilterFailed', [-983]: 'MediusClearGameListFilterFailed', [-984]: 'MediusSetGameListFilterFailed',
  [-985]: 'MediusRequestDenied', [-986]: 'MediusExceedsMaxWorlds', [-987]: 'MediusDMEError', [-988]: 'MediusDBError',
  [-989]: 'MediusPlayerNotPrivileged', [-990]: 'MediusNotClanLeader', [-991]: 'MediusWMError', [-992]: 'MediusAlreadyLeaderOfClan',
  [-993]: 'MediusIncorrectLoginStep', [-994]: 'MediusRegistrationFailed', [-995]: 'MediusLoginFailed', [-996]: 'MediusEndSessionFailed',
  [-997]: 'MediusAccountLoggedIn', [-998]: 'MediusAccountNotFound', [-999]: 'MediusAccountAlreadyExists', [-1000]: 'MediusBeginSessionFailed',
};

/** `FUN_002f4300`: the status's name. */
export function mediusStatusText(status: number): string { return STATUS_NAMES[status | 0] ?? MEDIUS_STATUS_TEXT_UNKNOWN; }
/** The disband's error text (S:0x3f3fa0 of `FUN_002f4300`'s name, D:L186533-186534). */
export function clanDisbandErrorText(status: number): string { return CLAN_DISBAND_ERROR_FORMAT.replace('%s', mediusStatusText(status)); }

/** The lobby's state in the menus (`WORLD_LOBBY_STATE_READING`, `./worldOfSocomCommands`): 0x0b. */
const LOBBY_STATE_ONLINE = 0x0b;
/** `FUN_003857c0(.., 0, 1)`: TEMPORARY; `(.., 0, 2)`: PERMANENT. */
const TEMPORARY = 1;
const PERMANENT = 2;
/** PLAYER_NAME_AND_TAG (S:0x3f4380), added PERMANENT by the stats post's reply (D:L187272). */
const PLAYER_NAME_AND_TAG_VAR = 'PLAYER_NAME_AND_TAG';
const EMPTY = '';
/** The disband's Clan_Description (S:0x3f3f18, D:L186541): a space, where GetMyClans' and the quit's write "". */
const BLANK = ' ';

/** The page's half: each request sent, its reply back (a rejection is a request never answered). */
export interface ManageRosterLeaderService extends Pick<ManageRosterService, 'remove'> {
  /** TransferClanLeadership (Lobby 0x5c, 0x4c bytes: the session key +0x15, the new leader's account +0x28, its name +0x2c:32; `FUN_006459a0`). */
  transferLeadership(q: { newLeaderAccountId: number; newLeaderAccountName: string }): Promise<{ status: number }>;
  /** DisbandClan (Lobby 0x56, 0x2c bytes: the session key +0x15, the clan +0x28; `FUN_006457b8`). */
  disband(q: { clanId: number }): Promise<{ status: number }>;
  /** UpdateClanStats (Lobby 0x84, 300 bytes: the clan +0x28, the 256 bytes +0x2c; `FUN_00646660`). */
  updateStats(q: { clanId: number; stats: Uint8Array }): Promise<{ status: number }>;
}

export interface ManageRosterLeaderCommandsOptions {
  /** The game's one `CUIVarManager` (0x437e80). */
  uiVars: UiVarManager;
  /** The client's clan (`WorldOfSocomCommands.clan`). */
  clan: LobbyClan;
  /** The clan client's rows (`./manageRosterCommands`): the roster's request and its draw. */
  roster: Pick<ManageRosterCommands, 'requestRoster' | 'drawRoster' | 'session'>;
  /** The page's half; absent, every request is never answered. */
  service?: ManageRosterLeaderService;
  /** `DAT_0044f3c8(name, text)`: a named event, with its text, into the built dialog (`lobbyEventInto`). */
  event?: (kind: number, text: string | null) => void;
  /** The running animation's input string (`FUN_00272480(ctx + 0x18, 0)`): a row's INPUT_STRING. */
  inputString?: (cmd: ZAnimUiCommand) => string | null;
  /** The lobby session's +0x7d and its state byte +0x60 (`WORLD_LOBBY_STATE_READING`); absent, up in state 11. */
  lobbyUp?: () => boolean;
  lobbyState?: () => number;
  /** The session's account name, 0x66a4f4 (`ACCOUNT_NAME_READING`); absent or null, PLAYERNAMEVAR's text. */
  accountName?: () => string | null;
  /** The session's ticket, for `CLAN_ROSTER_TICKET_ADAPTATION` (`./manageRosterCommands`); absent, not checked. */
  ticket?: () => string | null;
  /** A row called, as it happens. */
  log?: (name: ManageRosterLeaderCommandName, arg: string, answer: boolean) => void;
}

/** The arguments the rows test (S:0x3ee898). */
const INPUT_STRING = 'INPUT_STRING';

export class ManageRosterLeaderCommands {
  constructor(private readonly o: ManageRosterLeaderCommandsOptions) {}

  private answer(name: ManageRosterLeaderCommandName, cmd: ZAnimUiCommand, answer: boolean): boolean {
    this.o.log?.(name, cmd.arg, answer);
    return answer;
  }

  private post(event: string, text: string | null = null): void { this.o.event?.(DIALOG_EVENTS[event]!, text); }

  private up(): boolean { return this.o.lobbyUp?.() ?? true; }
  private online(): boolean { return this.up() && (this.o.lobbyState?.() ?? LOBBY_STATE_ONLINE) === LOBBY_STATE_ONLINE; }

  /** `CLAN_ROSTER_TICKET_ADAPTATION`: whether the session's ticket is still the one held now (absent the hook, always). */
  private sameSession(): () => boolean {
    if (this.o.ticket === undefined) return () => true;
    const ticket = this.o.ticket();
    return () => ticket !== null && this.o.ticket!() === ticket;
  }

  private setVar(name: string, text: string, longevity: LiveLongevity = PERMANENT): void {
    const vars = this.o.uiVars;
    vars.set(vars.add(name, null, longevity), { type: 'string', value: text });
  }

  private myName(): string {
    const held = this.o.uiVars.find('PLAYERNAMEVAR')?.value;
    return this.o.accountName?.() ?? (held?.type === 'string' ? held.value : '');
  }

  // ---- REMOVE PLAYERS ----

  /**
   * ELF 0x27a840-0x27a880 (no decompiled block): the running animation's input string (`FUN_00272480(ctx + 0x18, 0)`, or
   * none with no context) -- the row's key, not the command's argument -- to `FUN_002e7450`, whose answer is dropped; 1.
   */
  RemovePlayerFromClan: UiCommandHandler = (cmd) => {
    this.o.roster.session();                                                         // CLAN_REQUEST_SESSION_ADAPTATION
    this.remove(this.o.inputString?.(cmd) ?? null);
    return this.answer('RemovePlayerFromClan', cmd, true);
  };

  /**
   * `FUN_002e7450` (D:L186901-186943): only while the session is up in state 11; the roster's row of the name or id
   * (`FUN_002e9460`): none raises MP_PLAYER_NOT_FOUND (S:0x3f4130); the session's own account's MP_PLAYER_IS_LEADER
   * (S:0x3f4170, `CLAN_SELF_BY_NAME_ADAPTATION`); else RemovePlayerFromClan of its account and the clan (0x30 bytes, the
   * account +0x28, the clan `DAT_003df298` +0x2c, `DAT_003df2a0` the account -- read by nothing else; `FUN_00645af0`) with
   * the callback `FUN_002e7580` (D:L186946-186967): a refusal ("MediusRemovePlayerFromClan", S:0x3f4190)
   * MP_PLAYER_NOT_FOUND; a Success MP_SUCCESS (S:0x3f41b0) and the roster asked again (`FUN_002e69f0`).
   */
  private remove(name: string | null): void {
    if (!this.online()) return;
    const clan = this.o.clan;
    const row = clan.find(name);
    if (!row) { this.post('MP_PLAYER_NOT_FOUND'); return; }
    if (clan.isSelf(row.accountId)) { this.post('MP_PLAYER_IS_LEADER'); return; }
    const held = this.sameSession();
    this.o.service?.remove({ playerAccountId: row.accountId, clanId: clan.clanId }).then((s) => {
      if (!held()) return;                                                           // CLAN_ROSTER_TICKET_ADAPTATION
      if (s.status !== 0) { this.post('MP_PLAYER_NOT_FOUND'); return; }
      this.post('MP_SUCCESS');
      this.o.roster.requestRoster();
    }, () => { /* never answered */ });
  }

  // ---- APPOINT LEADER ----

  /**
   * ELF 0x277430-0x2774b0 (no decompiled block): the argument (`FUN_0026ed60` of the record's +8), INPUT_STRING
   * (S:0x3ee898) replaced by the running animation's input string (`FUN_00272480`), to `FUN_002e81b0`; 1.
   */
  TransferLeadership: UiCommandHandler = (cmd) => {
    this.o.roster.session();
    const name = cmd.arg === INPUT_STRING ? this.o.inputString?.(cmd) ?? null : cmd.arg;
    this.transfer(name);
    return this.answer('TransferLeadership', cmd, true);
  };

  /**
   * `FUN_002e81b0` (D:L187372-187410), with no check of the session: no name or an empty one, or no roster row of it
   * (`FUN_002e9460`), raises MP_PLAYER_NOT_FOUND; else TransferClanLeadership of the row's account (+0x28) and name
   * (+0x2c:32) with the callback `FUN_002e82a0` (D:L187413-187431): a refusal ("TransferClanLeadership", S:0x3f43e0)
   * MP_PLAYER_NOT_FOUND; a Success MP_LEADERSHIP_TRANSFER_SUCCESS (S:0x3f4400). The client's leader id is not written:
   * the member's roster's GetClan learns the new leader (`./manageRosterCommands`).
   */
  private transfer(name: string | null): void {
    const row = name === null || name === '' ? null : this.o.clan.find(name);
    if (!row) { this.post('MP_PLAYER_NOT_FOUND'); return; }
    const held = this.sameSession();
    this.o.service?.transferLeadership({ newLeaderAccountId: row.accountId, newLeaderAccountName: row.name }).then((s) => {
      if (!held()) return;                                                           // CLAN_ROSTER_TICKET_ADAPTATION
      this.post(s.status === 0 ? 'MP_LEADERSHIP_TRANSFER_SUCCESS' : 'MP_PLAYER_NOT_FOUND');
    }, () => { /* never answered */ });
  }

  // ---- DISBAND CLAN ----

  /** ELF 0x27a920-0x27a940 (no decompiled block): `FUN_002e6850(0x44f370)`; 1. */
  DisbandClan: UiCommandHandler = (cmd) => {
    this.o.roster.session();
    this.disband();
    return this.answer('DisbandClan', cmd, true);
  };

  /**
   * `FUN_002e6850` (D:L186500-186518): only while the session is up in state 11, DisbandClan of the clan `DAT_0044f59c`
   * (+0x28) with the callback `FUN_002e68e0` (D:L186521-186554): a refusal ("MediusDisbandClan", S:0x3f3f40) raises
   * MP_DISBAND_CLAN_FAILURE (S:0x3f3fc0) with `clanDisbandErrorText` of its status (D:L186531-186537), which the page
   * pops (`disband_failure`: POPUP INPUT_STRING); a Success: CLANNAMEVAR "", Clan_Description " ", MEDIUS_CLAN_MESSAGES
   * "No clan messages." (D:L186540-186542), the roster emptied and drawn (D:L186543-186544), the three ids -1 and the name
   * zeroed (D:L186545-186548), MP_DISBAND_CLAN_SUCCESS (S:0x3f3f80, D:L186549-186551).
   */
  private disband(): void {
    if (!this.online()) return;
    const clan = this.o.clan;
    const held = this.sameSession();
    this.o.service?.disband({ clanId: clan.clanId }).then((s) => {
      if (!held()) return;                                                           // CLAN_ROSTER_TICKET_ADAPTATION
      if (s.status !== 0) { this.post('MP_DISBAND_CLAN_FAILURE', clanDisbandErrorText(s.status)); return; }
      this.setVar(CLAN_NAME_VAR, EMPTY);
      this.setVar(CLAN_DESCRIPTION_VAR, BLANK);
      this.setVar(MEDIUS_CLAN_MESSAGES_VAR, NO_CLAN_MESSAGES, TEMPORARY);
      clan.roster.length = 0;
      this.o.roster.drawRoster();
      clan.clanId = -1; clan.leader = -1; clan.name = EMPTY;
      this.post('MP_DISBAND_CLAN_SUCCESS');
    }, () => { /* never answered */ });
  }

  // ---- CLAN TAG ----

  /**
   * `FUN_00277610` (D:L122923-122930) -> `FUN_002e7d70` (D:L187223-187252), with no check of the session: Clan_Description
   * (S:0x3f42f0, added TEMPORARY when absent) -- its text when it holds a string; the variable is the lobby's own and
   * always does (GetMyClans and the disband write it) -- into `clanStatsRecord` of the rating (`"%.3d%.12d%s"`, S:0x3f4328,
   * the icon 0) and UpdateClanStats with the clan `DAT_0044f59c` (+0x28), the callback `FUN_002e7e70` (D:L187255-187282:
   * Success, "MediusUpdateClanStats" S:0x3f4360, PLAYER_NAME_AND_TAG `playerNameAndTag` of the tag and the name; a refusal
   * silent); then `FUN_002e7f50` (D:L187285-187328): the rating recomputed -- with eight rows or more the roster sorted and
   * the first eight's mean, else 0 -- and its ladder post not sent (`CLAN_LADDER_POST_PLACEHOLDER`). 1.
   */
  UpdateClanStats: UiCommandHandler = (cmd) => {
    this.o.roster.session();
    const clan = this.o.clan;
    const v = this.o.uiVars.add(CLAN_DESCRIPTION_VAR, null, TEMPORARY).value;
    const tag = v.type === 'string' ? v.value : EMPTY;
    const held = this.sameSession();
    this.o.service?.updateStats({ clanId: clan.clanId, stats: clanStatsRecord(clan.rating, tag) }).then((s) => {
      if (!held() || s.status !== 0) return;                                        // CLAN_ROSTER_TICKET_ADAPTATION; a refusal is silent
      const t = this.o.uiVars.find(CLAN_DESCRIPTION_VAR)?.value;
      this.setVar(PLAYER_NAME_AND_TAG_VAR, playerNameAndTag(t?.type === 'string' ? t.value : EMPTY, this.myName()));
    }, () => { /* never answered */ });
    if (clan.roster.length >= 8) sortClanRoster(clan.roster);                        // FUN_002e7f50 D:L187302-187306
    clan.rating = clanRosterRating(clan.roster);
    return this.answer('UpdateClanStats', cmd, true);
  };

  /** The entries by their table name. */
  entries(): Record<ManageRosterLeaderCommandName, UiCommandHandler> {
    return {
      RemovePlayerFromClan: this.RemovePlayerFromClan, TransferLeadership: this.TransferLeadership, DisbandClan: this.DisbandClan,
      UpdateClanStats: this.UpdateClanStats,
    };
  }

  /** Each row's body set in PLAT-08's host (`UiCommandHost.setHandler`). */
  register(host: UiCommandHost): void {
    for (const [name, h] of Object.entries(this.entries())) host.setHandler(name, h);
  }
}
