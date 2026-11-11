import { DIALOG_EVENTS } from '../dialog';
import type { UiCommandHandler, UiCommandHost } from '../uiCommands';
import type { UiVarManager, UiVarValue } from '../uiVars';
import type { ZAnimUiCommand } from '../zanimRuntime';
import { CLAN_INVITATIONS_QUERY, CLAN_INVITATION_STATUS, type ClanInvitationsQuery } from './clanInvitations';
import type { LobbyClan } from './createClanCommands';

/**
 * INVITE PLAYERS (`dlgInvitedPlayers.rdr`, ONL-28, web sprint 18's clans' half; web research 273 §1-§2) and its five
 * rows of PLAT-08's table -- `CanInviteMorePlayersToClan`, `ClanHasInvitations`, `GetInvitedPlayers`,
 * `InvitePlayerToClan`, `RevokeInvite` -- over SVC-09's `InvitePlayerToClan`, `GetClanInvitationsSent` and
 * `RevokeClanInvitation` (`packages/central/src/clans.ts`, research 262 §4) and AccountGetID for the invite's lookup
 * (NU-14: the services' own, `packages/central/src/accountGetId.ts`; research 273 §2.2). `D:L<line>` = a line of
 * `socom2_game.elf.decomp.c`; `S:0x...` a string of the retail ELF; `ELF 0x...` an instruction read off the ELF where
 * the decompilation has no block. Transcribed, cited, never pasted; reading, pending review.
 *
 * **The page is the disc's** (`tools/dump-online-dialogs.ts --dialog dlgInvitedPlayers.rdr`; research 273 §1): the
 * leader's roster's INVITATIONS row opens it (`goto_menu(dlgInvitedPlayers.rdr)`); ONSTART `OnInvitePlaystart`
 * disables the two lists and raises the cap's popup (#384) when no seat is left, and `find_invited_players` asks the
 * sent list every 22 s, enabling INVITE PLAYER while a seat is left; INVITE PLAYER's CROSS (`invite_player`) opens the
 * game's keyboard on PLAYER_INVITE_NAME (`MPPLAYERNAME`, #394, 14 characters of 31 bytes) and its ENTER
 * (ON_SKB_APPLY, `do_invite`) runs `InvitePlayerToClan`; REVOKE INVITE's CROSS (`OnRevokeInvPress`) activates the
 * sent list, or says #387 when it is empty; a row's CROSS (`revoke_invite`) asks #388 (NO #246 / YES #253) and on YES
 * runs `RevokeInvite(INPUT_STRING)` -- the row's first cell, the name --, else #389. The body's events are the set's
 * popups: MP_PLAYER_NOT_FOUND #390, MP_PLAYER_ALREADY_INVITED #391, MP_PLAYER_ALREADY_MEMBER #392, MP_PLAYER_IS_LEADER
 * #393, MP_CLAN_FULL `ClanFullError` (#384 with #226). TRIANGLE and RETURN go back (`goto_menu(PREVIOUS_SCREEN)`).
 *
 * **The client's sent list** (0x44f720: its count `DAT_0044f724`, its records `DAT_0044f728` -- 0xf0 bytes each: the
 * account +0, the name +4:32, the response status +0x24, the response's text +0x28:200; `FUN_002e9030`
 * D:L187898-187936) is one for the session: emptied at each request (`FUN_002e9160` D:L187939-187958), filled by the
 * replies, read by the invite's check, the revoke's lookup, `ClanHasInvitations` and the cap.
 *
 * The transport is ours (OT.R27): `InvitedPlayersService` is the page's `/lobby/account-id`, `/lobby/chat`,
 * `/clan/invite`, `/clan/invitations-sent` and `/clan/revoke` with the session's ticket as the bearer
 * (`packages/viewer/src/clanInvitationsHost.ts`). A rejection is a request never answered.
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/** The dialog. */
export const INVITED_PLAYERS = 'dlgInvitedPlayers.rdr';
/** PLAYER_INVITE_NAME (S:0x3eee50): the name the keyboard writes and `InvitePlayerToClan` reads. */
export const PLAYER_INVITE_NAME_VAR = 'PLAYER_INVITE_NAME';
/** INVITED_PLAYERS (S:0x3f3920; the lobby's +0xd4, added TEMPORARY at the session's start, D:L182215-182216): the sent list's rows. */
export const INVITED_PLAYERS_VAR = 'INVITED_PLAYERS';
/** The none row's text (S:0x3f40d0) and its second cell (S:0x3f3f18). */
export const NO_INVITATIONS_SENT = 'No Invitations Sent';
const BLANK_CELL = ' ';

/** The rows this module fills (PLAT-08's table: id, name, function), and the task the table names as their bodies' owner. */
export const INVITED_PLAYERS_COMMAND_ROWS = [
  { id: 76, name: 'InvitePlayerToClan', fn: 0x27a740, task: 'ONL-28' },
  { id: 77, name: 'RevokeInvite', fn: 0x27a310, task: 'ONL-28' },
  { id: 79, name: 'GetInvitedPlayers', fn: 0x27a3f0, task: 'ONL-28' },
  { id: 124, name: 'ClanHasInvitations', fn: 0x277960, task: 'ONL-28' },
  { id: 190, name: 'CanInviteMorePlayersToClan', fn: 0x27a830, task: 'ONL-28' },
] as const;
export type InvitedPlayersCommandName = (typeof INVITED_PLAYERS_COMMAND_ROWS)[number]['name'];

/**
 * The client's own seat rule (`CanInviteMorePlayersToClan` ELF 0x27a830 -> 0x2e5fe0: `lw v1, -0x8bc(at)` the roster's
 * count `DAT_0044f744`, `lw v0, -0x8dc(at)` the sent list's `DAT_0044f724`, `addu`, `slti v0, v0, 16`): the roster and
 * the invitations sent, together, under 16 -- UIMnLOC #384's "16". The client's number, read; the server's own cap is
 * `CLAN_CAP_PLACEHOLDER` (the server's).
 */
export const CLAN_INVITE_SEATS = 16;

/** The invitation's text (S:0x3f4220, `sprintf` of the clan's name 0x44f5a4, D:L187074). */
export function clanInviteText(clanName: string): string { return `Clan ${clanName} invites you to join.`; }
/** The leader's AddPlayerToClan text (S:0x3f4070, `sprintf` of the row's name +0x20, D:L186763): the original's spelling. */
export function clanWelcomeText(name: string): string { return `Everyon Welcome ${name} to the clan`; }

/** The arguments the rows test (S:0x3ee898). */
const INPUT_STRING = 'INPUT_STRING';
/** The lobby's state in the menus (`WORLD_LOBBY_STATE_READING`, `./worldOfSocomCommands`): 0x0b. */
const LOBBY_STATE_ONLINE = 0x0b;
/** `FUN_002f4d60`'s ChatMessage type at +0x28 (research 263 §2): 1, a whisper. */
const WHISPER = 1;
/** MediusCallbackStatus (desktop@be557831:server/horizon-server/RT.Common/Types.cs:85, :114): the two the invite's reply tells apart. */
const MEDIUS_REQUEST_DENIED = -985, MEDIUS_MAX_EXCEEDED = -956;

/**
 * CLAN_INVITE_TICKET_ADAPTATION: the invite's chain (AccountGetID, then the invitation and its whisper, then the sent
 * list), the revoke's (the revoke, then the list) and a response's (the response, then the received list) go on only
 * under the session's ticket they began with, as the ignore list's (`IGNORE_ADD_TICKET_ADAPTATION`). A chain cut so
 * ends as the invite's own failures end it, its state 3 (`DAT_0044f798`, D:L187068, D:L187107). The console's chain
 * dies with its connection; the page's HTTP answers can land after a logoff and another login. A browser adaptation
 * of the transport.
 */
export const CLAN_INVITE_TICKET_ADAPTATION = 'an invite, a revoke or a response goes on only under the ticket it began with' as const;

/**
 * INVITED_PLAYERS_LATEST_REPLY_ADAPTATION: as the ignore list's (`IGNORE_LIST_LATEST_REPLY_ADAPTATION`), a sent list's
 * reply is taken only for the latest request, under the ticket it was sent with and still held. The page asks it every
 * 22 s and after each invite and revoke; its HTTP replies can come out of order and after a logoff. A browser
 * adaptation of the transport.
 */
export const INVITED_PLAYERS_LATEST_REPLY_ADAPTATION = 'a sent list reply taken only for the latest request, under the ticket still held' as const;

/** One Lobby 0x7b reply (`MediusGetClanInvitationsSentResponse`): the fields `FUN_002e6f50` and `FUN_002e9030` read. */
export interface SentInvitationReply {
  /** +0x18. */
  status: number;
  /** +0x1c, the invitee. */
  accountId: number;
  /** +0x20:32. */
  accountName: string;
  /** +0x40:200. */
  responseMessage: string;
  /** +0x108: 0 undecided, 1 accepted, 2 declined. */
  responseStatus: number;
  responseTime: number;
  /** +0x110. */
  endOfList: boolean;
}

/** The page's half: each request sent, its reply back (a rejection is a request never answered). */
export interface InvitedPlayersService {
  /**
   * AccountGetID by name (Lobby 0x17, 0x46 bytes: the session key at +0x15, the name at +0x26:32; `FUN_00649e28`,
   * D:L187034-187038): its reply's status (+0x1c, "MediusGetPlayerForInvitation", S:0x3f4200) and account (+0x18), which
   * `FUN_002e7850` (D:L187049-187083) reads. NU-14: the services' own (`/lobby/account-id`, any account of the name,
   * logged in or not since CLAN-INVITES: `ACCOUNT_GET_ID_PRESENCE_OWNER`, the server's); it was SVC-18's FindPlayer, which finds only a
   * player in a room or a game, so a known player in neither was MP_PLAYER_NOT_FOUND (#390) -- the owner's playtest of
   * 2026-10-15.
   */
  accountId(q: { name: string }): Promise<{ status: number; accountId: number }>;
  /** InvitePlayerToClan (Lobby 0x62, 0xf4 bytes): the account at +0x28, the text at +0x2c:200 (`FUN_00645b90`). */
  invite(q: { playerAccountId: number; message: string }): Promise<{ status: number }>;
  /** ChatMessage (Lobby 0x3b, 0x70 bytes; `FUN_002f4d60` D:L194713-194738): the type +0x28, the target +0x2c, the text +0x30; no reply. Absent, not sent. */
  chat?(q: { messageType: number; targetId: number; message: string }): Promise<void>;
  /** GetClanInvitationsSent (Lobby 0x7a, 0x30 bytes: +0x28 0, the page size 999 at +0x2c; `FUN_00645cd8`). */
  invitationsSent(q: ClanInvitationsQuery): Promise<readonly SentInvitationReply[]>;
  /** RevokeClanInvitation (Lobby 0x68, 0x2c bytes): the invitee's account at +0x28 (`FUN_00645e20`). */
  revoke(q: { playerAccountId: number }): Promise<{ status: number }>;
  /** AddPlayerToClan (Lobby 0x5e, 0xf4 bytes; `FUN_00645a48`): our services answer none (`INVITATION_LISTS_UNDECIDED_PLACEHOLDER`, the server's); absent, a request never answered. */
  addPlayer?(q: { playerAccountId: number; message: string }): Promise<{ status: number }>;
}

/** A record of the sent list (`FUN_002e9030`): the account, the name, the response status, the response's text. */
export interface InvitedPlayerRecord { accountId: number; name: string; responseStatus: number; responseMessage: string }

const str = (value: string): UiVarValue => ({ type: 'string', value });

/** `FUN_00198b80` (strcasecmp): the bytes compared with A-Z folded to a-z; true when equal. */
function caseless(a: string, b: string): boolean {
  const fold = (s: string): string => s.replace(/[A-Z]/g, (c) => c.toLowerCase());
  return fold(a) === fold(b);
}

/**
 * The rows `FUN_002e70b0` (D:L186785-186832) builds from the sent list, in order: none, the one row
 * [`"No Invitations Sent"`, `" "`]; else each [the name, its status word] -- 1 "Accepted", 2 "Declined", 0 "Undecided",
 * else "Unknown" (S:0x3f40b0, 0x3f40a0, 0x3f4090, 0x3f40c0).
 */
export function invitedPlayersRows(sent: readonly { name: string; responseStatus: number }[]): UiVarValue[] {
  if (sent.length === 0) return [{ type: 'array', value: [str(NO_INVITATIONS_SENT), str(BLANK_CELL)] }];
  return sent.map((s) => ({ type: 'array', value: [str(s.name), str(CLAN_INVITATION_STATUS[s.responseStatus] ?? 'Unknown')] }));
}

export interface InvitedPlayersCommandsOptions {
  /** The game's one `CUIVarManager` (0x437e80). */
  uiVars: UiVarManager;
  /** The client's clan (`WorldOfSocomCommands.clan`): its name (the invitation's text) and its roster (GetClanRoster's, ONL-27's `./manageRosterCommands`). */
  clan: LobbyClan;
  /** The page's half; absent, every request is never answered. */
  service?: InvitedPlayersService;
  /** `DAT_0044f3c8(name, 0)`: a named event into the built dialog. */
  event?: (kind: number, text: string | null) => void;
  /** The running animation's input string (`FUN_00272480(ctx + 0x18, 0)`): a row's INPUT_STRING. */
  inputString?: (cmd: ZAnimUiCommand) => string | null;
  /** The lobby session's +0x7d and its state byte +0x60 (`WORLD_LOBBY_STATE_READING`); absent, up in state 11. */
  lobbyUp?: () => boolean;
  lobbyState?: () => number;
  /** The session's account name, 0x66a4f4 (`ACCOUNT_NAME_READING`); absent or null, PLAYERNAMEVAR's text. */
  accountName?: () => string | null;
  /** The session's ticket, for the two adaptations; absent, not checked. */
  ticket?: () => string | null;
  /** A row called, as it happens. */
  log?: (name: InvitedPlayersCommandName, arg: string, answer: boolean) => void;
}

export class InvitedPlayersCommands {
  /** The sent list (0x44f720), each a copy of its reply's fields. */
  private sent: InvitedPlayerRecord[] = [];
  /** The latest sent-list request's number (`INVITED_PLAYERS_LATEST_REPLY_ADAPTATION`). */
  private sentSeq = 0;
  /** `DAT_0044f798` (BSS, 0 at boot): the invite's state -- 0 idle, 1 the lookup sent, 2 the invitation sent, 3 done. */
  private inviteState = 0;

  constructor(private readonly o: InvitedPlayersCommandsOptions) {}

  private answer(name: InvitedPlayersCommandName, cmd: ZAnimUiCommand, answer: boolean): boolean {
    this.o.log?.(name, cmd.arg, answer);
    return answer;
  }

  private post(event: string): void { this.o.event?.(DIALOG_EVENTS[event]!, null); }

  /** The lobby session up and in state 11 (`WORLD_LOBBY_STATE_READING`). */
  private online(): boolean {
    return (this.o.lobbyUp?.() ?? true) && (this.o.lobbyState?.() ?? LOBBY_STATE_ONLINE) === LOBBY_STATE_ONLINE;
  }

  /** `CLAN_INVITE_TICKET_ADAPTATION`: whether the session's ticket is still the one held now (absent the hook, always). */
  private sameSession(): () => boolean {
    if (this.o.ticket === undefined) return () => true;
    const ticket = this.o.ticket();
    return () => ticket !== null && this.o.ticket!() === ticket;
  }

  /** The sent list's records, in their order. */
  records(): readonly Readonly<InvitedPlayerRecord>[] { return this.sent; }
  /** `DAT_0044f798`. */
  get state(): number { return this.inviteState; }

  /** ELF 0x27a830 -> 0x2e5fe0: the roster's count (the leader's row among them) and the sent list's, together, under 16. */
  CanInviteMorePlayersToClan: UiCommandHandler = (cmd) =>
    this.answer('CanInviteMorePlayersToClan', cmd, this.o.clan.roster.length + this.sent.length < CLAN_INVITE_SEATS);

  /** ELF 0x277960 -> 0x2e7290 (`lw v0, -0x8dc(at)`; `sltu v0, zero, v0`): the sent list's count is not 0. */
  ClanHasInvitations: UiCommandHandler = (cmd) => this.answer('ClanHasInvitations', cmd, this.sent.length !== 0);

  /** `FUN_0027a3f0` (D:L124400-124407) -> `FUN_002e6ea0`; 1. */
  GetInvitedPlayers: UiCommandHandler = (cmd) => {
    this.requestSent();
    return this.answer('GetInvitedPlayers', cmd, true);
  };

  /**
   * `FUN_002e6ea0` (D:L186707-186729), also the invite's and the revoke's success: only while the session is up in state
   * 11, the sent list emptied (`FUN_002e9160`) and GetClanInvitationsSent sent (0x30 bytes, the session key at +0x15, +0x28
   * left 0, 999 at +0x2c; `FUN_00645cd8`) with the callback `FUN_002e6f50`.
   */
  private requestSent(): boolean {
    if (!this.online()) return false;
    this.sent = [];
    const seq = ++this.sentSeq;
    const ticket = this.o.ticket?.() ?? null;
    const current = (): boolean => seq === this.sentSeq && (this.o.ticket === undefined || (ticket !== null && this.o.ticket() === ticket));
    this.o.service?.invitationsSent({ ...CLAN_INVITATIONS_QUERY }).then((rows) => { if (current()) for (const r of rows) this.sentReply(r); }, () => { /* never answered */ });
    return true;
  }

  /**
   * `FUN_002e6f50` (D:L186734-186782), one reply: a status not Success (`FUN_002f42d0` "MediusGetClanInvitationsSent",
   * S:0x3f4050: status == 0) draws the list as it stands; a Success row of response status 1 (accepted) first sends
   * AddPlayerToClan with `clanWelcomeText` of its name (callback `FUN_002e7280`, a log of "MediusAddPlayerToClan",
   * S:0x3f4110) and then a revoke of its account (callback `FUN_002e7270`, a log of "ClanInviteRevokeHack", S:0x3f40f0);
   * a row of 0, 1 or 2 is kept (`FUN_002e9030`: appended unless a record holds its account); the list drawn when the row
   * ends it (+0x110).
   */
  sentReply(r: SentInvitationReply): void {
    if (r.status !== 0) { this.draw(); return; }
    if (r.responseStatus === 1) {
      const svc = this.o.service;
      svc?.addPlayer?.({ playerAccountId: r.accountId, message: clanWelcomeText(r.accountName) }).catch(() => { /* a log only */ });
      svc?.revoke({ playerAccountId: r.accountId }).catch(() => { /* a log only */ });
    }
    if (r.responseStatus === 0 || r.responseStatus === 1 || r.responseStatus === 2) {
      if (!this.sent.some((s) => s.accountId === r.accountId)) {
        this.sent.push({ accountId: r.accountId, name: r.accountName, responseStatus: r.responseStatus, responseMessage: r.responseMessage });
      }
    }
    if (r.endOfList) this.draw();
  }

  /** `FUN_002e70b0`: the rows set into INVITED_PLAYERS (`FUN_00386460` on the lobby's +0xd4, added TEMPORARY). */
  private draw(): void {
    const vars = this.o.uiVars;
    vars.set(vars.add(INVITED_PLAYERS_VAR, null, 1), { type: 'array', value: invitedPlayersRows(this.sent) });
  }

  /**
   * `FUN_0027a740` (D:L124512-124547): PLAYER_INVITE_NAME (added TEMPORARY when absent, `FUN_003857c0(.., 0, 1)`) --
   * when it holds a string (type 3), its text to `FUN_002e7600` and that answer; else 1.
   */
  InvitePlayerToClan: UiCommandHandler = (cmd) => {
    const v = this.o.uiVars.add(PLAYER_INVITE_NAME_VAR, null, 1).value;
    return this.answer('InvitePlayerToClan', cmd, v.type === 'string' ? this.invite(v.value) : true);
  };

  /** The session's account name (0x66a4f4), else PLAYERNAMEVAR's text (`ACCOUNT_NAME_READING`). */
  private myName(): string {
    const held = this.o.uiVars.find('PLAYERNAMEVAR')?.value;
    return this.o.accountName?.() ?? (held?.type === 'string' ? held.value : '');
  }

  /**
   * `FUN_002e7600` (D:L186970-187047): 0 unless the session is up in state 11; the state 3 is answered 0 and set 0 (so a
   * statement ticks once more, D:L186990-186993); the states 1 and 2 answer 1 and send nothing. In the state 0: no name
   * or an empty one raises MP_PLAYER_NOT_FOUND (S:0x3f4130); a name on the roster (`FUN_002e9460`, `LobbyClan.find`)
   * raises MP_PLAYER_IS_LEADER (S:0x3f4170) when it is the session's own (case-blind,
   * 0x66a4f4), else MP_PLAYER_ALREADY_MEMBER (S:0x3f41c0); a name on the sent list (case-blind, D:L187014-187031) raises
   * MP_PLAYER_ALREADY_INVITED (S:0x3f41e0); else AccountGetID by the name (`InvitedPlayersService.accountId`), the state
   * 1. Each of those answers 1.
   */
  private invite(name: string): boolean {
    if (!this.online()) return false;
    if (this.inviteState === 3) { this.inviteState = 0; return false; }
    if (this.inviteState !== 0) return true;
    if (name === '') { this.post('MP_PLAYER_NOT_FOUND'); return true; }
    if (this.rosterHas(name)) { this.post(caseless(name, this.myName()) ? 'MP_PLAYER_IS_LEADER' : 'MP_PLAYER_ALREADY_MEMBER'); return true; }
    if (this.sent.some((s) => caseless(s.name, name))) { this.post('MP_PLAYER_ALREADY_INVITED'); return true; }
    this.inviteState = 1;
    const svc = this.o.service;
    if (!svc) return true;                                                          // sent and never answered: the state stays 1
    const held = this.sameSession();
    svc.accountId({ name }).then((found) => {
      if (!held()) { this.inviteState = 3; return; }                                // CLAN_INVITE_TICKET_ADAPTATION
      this.found(found, held);
    }, () => { /* never answered: the state stays 1 */ });
    return true;
  }

  /** `FUN_002e9460` (D:L188026-188056) on the roster: a row of the name (case-blind), else of the account `strtol` reads (`LobbyClan.find`). */
  private rosterHas(name: string): boolean { return this.o.clan.find(name) !== null; }

  /**
   * `FUN_002e7850` (D:L187049-187083), AccountGetID's reply: a status (+0x1c) not Success raises MP_PLAYER_NOT_FOUND and
   * ends the invite (the state 3); else InvitePlayerToClan with the account (+0x18) and `clanInviteText` of the clan's name
   * (0xf4 bytes, `FUN_00645b90`, the callback `FUN_002e7960`), the state 2, and the same text whispered to the account
   * (`FUN_002f4d60(.., account, 1, text)`: ChatMessage type 1, the text's first 63 bytes -- never cut: the name's 31-byte
   * cap keeps it to 57).
   */
  private found(r: { status: number; accountId: number }, held: () => boolean): void {
    if (r.status !== 0) { this.post('MP_PLAYER_NOT_FOUND'); this.inviteState = 3; return; }
    const svc = this.o.service!;
    const text = clanInviteText(this.o.clan.name);
    svc.invite({ playerAccountId: r.accountId, message: text }).then((s) => {
      if (!held()) { this.inviteState = 3; return; }                                // CLAN_INVITE_TICKET_ADAPTATION
      this.inviteReply(s);
    }, () => { /* never answered: the state stays 2 */ });
    this.inviteState = 2;
    svc.chat?.({ messageType: WHISPER, targetId: r.accountId, message: text }).catch(() => { /* ChatMessage has no reply */ });
  }

  /**
   * `FUN_002e7960` (D:L187087-187108), the invitation's reply: a status (+0x18) not Success
   * ("MediusInvitePlayerToClanInvitation", S:0x3f4240) raises MP_CLAN_FULL (S:0x3f4268) for MediusMaxExceeded -956,
   * nothing for MediusRequestDenied -985, else MP_PLAYER_NOT_FOUND; a Success asks the sent list again. The state 3.
   */
  private inviteReply(s: { status: number }): void {
    if (s.status !== 0) {
      if (s.status === MEDIUS_MAX_EXCEEDED) this.post('MP_CLAN_FULL');
      else if (s.status !== MEDIUS_REQUEST_DENIED) this.post('MP_PLAYER_NOT_FOUND');
    } else {
      this.requestSent();
    }
    this.inviteState = 3;
  }

  /**
   * `FUN_0027a310` (D:L124363-124377): the argument (`FUN_0026ed60`, the record's +8), INPUT_STRING (S:0x3ee898) replaced
   * by the running animation's input string (`FUN_00272480`) -- the row's first cell, the name --, to `FUN_002e72a0`, whose
   * answer it returns (`jal 0x2e72a0` and the epilogue, ELF 0x27a378-0x27a38c).
   */
  RevokeInvite: UiCommandHandler = (cmd) => {
    const name = cmd.arg === INPUT_STRING ? this.o.inputString?.(cmd) ?? null : cmd.arg === '' ? null : cmd.arg;
    return this.answer('RevokeInvite', cmd, this.revoke(name));
  };

  /**
   * `FUN_002e72a0` (D:L186835-186882): 0 unless the session is up in state 11; with the sent list empty, 1 and nothing;
   * else the record of the name (case-blind): none raises MP_PLAYER_NOT_FOUND; found, RevokeClanInvitation of its account
   * (0x2c bytes, the account at +0x28; `FUN_00645e20`), whose reply `FUN_002e7420` (D:L186888-186898) -- whatever its
   * status ("MediusRevokePlayerInvitation", S:0x3f4150, a log) -- asks the sent list again. 1.
   */
  private revoke(name: string | null): boolean {
    if (!this.online()) return false;
    if (this.sent.length === 0) return true;
    const rec = name === null ? undefined : this.sent.find((s) => caseless(s.name, name));
    if (!rec) { this.post('MP_PLAYER_NOT_FOUND'); return true; }
    const held = this.sameSession();
    this.o.service?.revoke({ playerAccountId: rec.accountId }).then(() => { if (held()) this.requestSent(); }, () => { /* never answered */ });   // CLAN_INVITE_TICKET_ADAPTATION
    return true;
  }

  /** The entries by their table name. */
  entries(): Record<InvitedPlayersCommandName, UiCommandHandler> {
    return {
      InvitePlayerToClan: this.InvitePlayerToClan, RevokeInvite: this.RevokeInvite, GetInvitedPlayers: this.GetInvitedPlayers,
      ClanHasInvitations: this.ClanHasInvitations, CanInviteMorePlayersToClan: this.CanInviteMorePlayersToClan,
    };
  }

  /** Each row's body set in PLAT-08's host (`UiCommandHost.setHandler`). */
  register(host: UiCommandHost): void {
    for (const [name, h] of Object.entries(this.entries())) host.setHandler(name, h);
  }
}
