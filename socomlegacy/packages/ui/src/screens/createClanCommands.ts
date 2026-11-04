import { DIALOG_EVENTS } from '../dialog';
import type { UiCommandHandler, UiCommandHost } from '../uiCommands';
import type { LiveLongevity, UiVarManager, UiVarValue } from '../uiVars';
import type { ZAnimUiCommand } from '../zanimRuntime';

/**
 * CREATE CLAN (`dlgCreateClan.rdr`, ONL-26, web sprint 18's clans' half; web research 271) and its one row of PLAT-08's
 * table, `CreateClan`, over SVC-08's `CreateClan` and `UpdateClanStats` (`packages/central/src/clans.ts`, research 262
 * §1-§2); and the client's clan (`LobbyClan`), which the create writes and SOCOM II ONLINE's `IsMemberOfClan` /
 * `IsLeaderOfClan` read (`./worldOfSocomCommands`). `D:L<line>` = a line of `socom2_game.elf.decomp.c`; `S:0x...` a
 * string of the retail ELF. Transcribed, cited, never pasted; reading, pending review.
 *
 * **The page is the disc's** (`tools/dump-online-dialogs.ts --dialog dlgCreateClan.rdr`; research 271 §1): ONSTART
 * `disable_create_button` disables CREATE CLAN; SET CLAN NAME's CROSS (`SetVariable(CLANNAMEVAR)`) opens the game's
 * keyboard on CLANNAMEVAR -- `MPPLAYERNAME`, titled #224, 13 characters of 31 bytes, the block's own caps (research 119
 * §5, PLAT-17 applies them); its ENTER raises ON_SKB_APPLY, whose `enable_create_button` prunes the name's spaces and
 * enables CREATE CLAN when the name is not empty; CREATE CLAN's CROSS (`CreateClan`) prunes them again and runs this row.
 * The answers are the set's: MP_CREATE_CLAN_SUCCESS `goto_menu(dlgManageRosterLeader.rdr)` -- the leader's roster,
 * ONL-27's page; MP_CREATE_CLAN_FAILURE `create_clan_failure` (#223, no button, then SET CLAN NAME active);
 * MP_FILTER_FAILURE `OnFilterFailure` (#225 with #226, then SET CLAN NAME active); TRIANGLE `goto_menu(PREVIOUS_SCREEN)`.
 *
 * The transport is ours (OT.R27): `CreateClanService` is the page's `/clan/create` and `/clan/update-stats` with the
 * session's ticket as the bearer (`packages/viewer/src/createClanHost.ts`). A rejection is a request never answered.
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/** The dialog, and the one its success goes to (the set's MP_CREATE_CLAN_SUCCESS binding). */
export const CREATE_CLAN = 'dlgCreateClan.rdr';
export const MANAGE_ROSTER_LEADER = 'dlgManageRosterLeader.rdr';

/** The row this module fills (PLAT-08's table: id, name, function), and the task the table names as its body's owner. */
export const CREATE_CLAN_COMMAND_ROWS = [{ id: 50, name: 'CreateClan', fn: 0x27a950, task: 'ONL-26' }] as const;
export type CreateClanCommandName = (typeof CREATE_CLAN_COMMAND_ROWS)[number]['name'];

/** CLANNAMEVAR (S:0x3eee68; the lobby's +0xf0 holds the same variable, S:0x3f3a08): the name the keyboard writes and the create reads. */
export const CLAN_NAME_VAR = 'CLANNAMEVAR';
/** Clan_Description (S:0x3f42f0; the lobby's +0xf4, S:0x3f3a20): the clan's tag. */
export const CLAN_DESCRIPTION_VAR = 'Clan_Description';
/** What a refused create or a refused name leaves in CLANNAMEVAR (S:0x3f4298). */
export const UNAFFILIATED = 'Unaffiliated';
/** PLAYER_NAME_AND_TAG (S:0x3f4380): the name at the foot of the online screens. */
const PLAYER_NAME_AND_TAG_VAR = 'PLAYER_NAME_AND_TAG';
/** The persona's name as ONL-06 keeps it (0x3ee980), the account name's stand-in (`ACCOUNT_NAME_READING`, `./worldOfSocomCommands`). */
const PLAYER_NAME_VAR = 'PLAYERNAMEVAR';
/** The lobby's state in the menus (`WORLD_LOBBY_STATE_READING`, `./worldOfSocomCommands`): 0x0b. */
const LOBBY_STATE_ONLINE = 0x0b;
/** The lobby's two variables are added PERMANENT at its init (`FUN_003857c0(.., 0, 2)`, D:L182783-182786). */
const PERMANENT = 2;
/** `FUN_003857c0(.., 0, 1)`: TEMPORARY. */
const TEMPORARY = 1;

/**
 * CLAN_LEADER_MINE_ADAPTATION: the create's success sets the leader id `DAT_0044f5c4` to the session's account id
 * `DAT_0066a4f0` (D:L187193), and `FUN_002e67d0` compares the two. The page holds no account id (the login's reply
 * carries none, `OWN_WHISPER_BY_NAME_ADAPTATION`), so the leader is kept as the mark `'mine'` and the compare is with
 * it. A browser adaptation of the representation; what the client answers is the original's.
 */
export const CLAN_LEADER_MINE_ADAPTATION = 'the leader id the create sets kept as "mine": the page holds no account id' as const;

/**
 * CLAN_NAME_FILTER_PLACEHOLDER: the create's text filter. The console sends the name to the lobby server's TextFilter
 * first (Lobby 0x98, PassFail: +0x28 left 0, the name's 32 bytes at +0x2c; `FUN_002e7a10` D:L187112-187135, the sender
 * `FUN_00648678`) and creates the reply's text (+0x15) only when its result (+0x58) is not below 0 (`FUN_002e7aa0`
 * D:L187137-187165). The filter was the server's and its words are unread (H85: the client's rules stand; SVC-23's
 * filter); our services serve none, so with no `filter` in the service every name passes as typed -- as the persona's
 * registration (`NAME_FILTER_PLACEHOLDER`, `./lobbyClient`). Settles: the owner's word list (H85) or SVC-23's filter,
 * and ONL-32's transcript of a create. [placeholder]
 */
export const CLAN_NAME_FILTER_PLACEHOLDER = 'no text filter: every name passes' as const;

/**
 * CLAN_LADDER_POST_PLACEHOLDER: the create's last step, `FUN_002e7f50` (D:L187285-187326): the clan's rating
 * `DAT_0044f770` recomputed from the roster (the mean of the first eight rows' +0x1cc when it holds eight or more, else
 * 0) and posted as UpdateLadderStats type 1 (Lobby 0xce, 0x58 bytes, the sender `FUN_0064b248`). Our Horizon has no
 * handler for 0xce (research 97 §2, "none for 0xce") and our services serve none (`packages/central/src/ladder.ts`: the
 * store's ladder field has no writer); a new clan's roster is not yet asked (ONL-27's GetClanRoster), so the rating is
 * 0. The post is not sent. ONL-27's tag post (`UpdateClanStats`, `./manageRosterLeaderCommands`) ends on the same step,
 * its rating the roster's (`clanRosterRating`), and sends nothing either. Settles: SVC-11 (the clans' ladder, W18.R13 /
 * H188). [placeholder]
 */
export const CLAN_LADDER_POST_PLACEHOLDER = 'the clan ladder post (0xce type 1) not sent; the rating 0 with no roster held' as const;

/**
 * CREATE_CLAN_TICKET_ADAPTATION: the create's chain (the filter, the create, the stats post) goes on only under the
 * session's ticket it began with, as the ignore list's (`IGNORE_ADD_TICKET_ADAPTATION`, `./ignoreListCommands`). The
 * console's chain dies with its connection; the page's HTTP answers can land after a logoff and another login, when they
 * would write the first account's clan into the new session or raise its popup there. A browser adaptation of the
 * transport.
 */
export const CREATE_CLAN_TICKET_ADAPTATION = 'a create goes on only under the ticket it began with' as const;

/**
 * A row of the clan's roster as the client keeps it (0x44f740: its count `DAT_0044f744`, its records `DAT_0044f748`,
 * 0x1dc bytes each, `FUN_002e9590` D:L188060-188138 copying the reply's fields): the account +0x1c, the name +0x20:32,
 * the description its stats record holds at +0x9f (the row's +0xdf, the stats at +0x40), the online state +0x140
 * (`connectStatus`, the two world ids, the lobby's +0x14c:64 and the game's +0x18c:64 names), the ladder stat +0x1cc,
 * the ladder position +0x1d0, the rankings' total +0x1d4. GetClanRoster's rows (ONL-27, `./manageRosterCommands`).
 */
export interface ClanRosterMember {
  accountId: number;
  name: string;
  description: string;
  online: { connectStatus: number; lobbyWorldId: number; gameWorldId: number; lobbyName: string; gameName: string };
  ladderStat: number;
  ladderPosition: number;
  totalRankings: number;
}

/** `FUN_00198b80` (strcasecmp): equal with A-Z folded to a-z. */
function caselessEqual(a: string, b: string): boolean {
  const fold = (s: string): string => s.replace(/[A-Z]/g, (c) => c.toLowerCase());
  return fold(a) === fold(b);
}

/** `strtol(s, 0, 10)` (`FUN_00191490`): the leading integer, else 0. */
function leadingInt(s: string): number {
  const m = /^\s*([+-]?\d+)/.exec(s);
  return m ? Number(m[1]) | 0 : 0;
}

/**
 * The client's clan: the words SOCOM II ONLINE's clan rows read and the create, GetMyClans' reply and the roster write.
 * At the lobby's init (D:L182792-182795): the ids -1, the name zeroed; the rating `DAT_0044f770` lies in the BSS (0 at
 * boot) and the init does not write it. On GetMyClans' no-clan reply (`FUN_002e8bd0` D:L187786-187802): the same, and
 * the roster emptied (`FUN_002e9740`, D:L187801) and its rows rebuilt (`FUN_002e6af0`, D:L187802), which sets the rating
 * to 0 on entry (D:L186623) and, with no row to sum, leaves it 0 (D:L186687-186690). GetMyClans' success, the roster and
 * the leader's rows are ONL-27's (`./manageRosterCommands`, `./manageRosterLeaderCommands`; web research 272).
 */
export class LobbyClan {
  /** `DAT_003df298` (-1 in the ELF's data) and its copy `DAT_0044f59c`. */
  clanId = -1;
  /** `DAT_0044f5c4`: the leader's account id, or `'mine'` (`CLAN_LEADER_MINE_ADAPTATION`). */
  leader: number | 'mine' = -1;
  /** 0x44f5a4 (32 bytes): the clan's name. */
  name = '';
  /** `DAT_0044f770`: the clan's rating, which the stats post carries. */
  rating = 0;
  /**
   * The session's own account id as the page learns it (`CLAN_SELF_BY_NAME_ADAPTATION`, `./manageRosterCommands`): the
   * console's `DAT_0066a4f0`, which the page is never told; null until a GetMyClans reply names this account its
   * leader or a roster row carries its name.
   */
  self: number | null = null;
  /**
   * The roster (0x44f740: its count `DAT_0044f744`, its rows): GetClanRoster's (ONL-27, `./manageRosterCommands`). INVITE
   * PLAYERS' seat rule and its roster refusals read it; `IsLeaderOfClan`'s lookup and the rating are made over it.
   */
  readonly roster: ClanRosterMember[] = [];

  /** `FUN_002e6830` (D:L186491-186497): the clan id is not -1. */
  get member(): boolean { return this.clanId !== -1; }

  /** Whether an account id is the session's own (`DAT_0066a4f0`; `CLAN_SELF_BY_NAME_ADAPTATION`). */
  isSelf(accountId: number): boolean { return this.self !== null && this.self === accountId; }

  /** `DAT_0044f5c4 == id`: the leader id is that account's (the create's `'mine'` is the session's own). */
  leaderIs(accountId: number): boolean { return this.leader === 'mine' ? this.isSelf(accountId) : this.leader === accountId; }

  /** `DAT_0044f5c4 == DAT_0066a4f0`: the leader is the session's own account. */
  leaderIsSelf(): boolean { return this.leader === 'mine' || (this.self !== null && this.leader === this.self); }

  /**
   * `FUN_002e9460` (D:L188026-188056) on the roster: none for no name or an empty one; the first row of the name (case-
   * blind, `FUN_00198b80`), else the first whose account is the name's `strtol` (`FUN_00191490`).
   */
  find(name: string | null | undefined): ClanRosterMember | null {
    if (name === null || name === undefined || name === '') return null;
    const byName = this.roster.find((m) => caselessEqual(m.name, name));
    if (byName) return byName;
    const id = leadingInt(name);
    return this.roster.find((m) => m.accountId === id) ?? null;
  }

  /**
   * `FUN_002e67d0` (D:L186474-186488): the leader id is the named roster member's (`find`), else the session's own --
   * with no name, or a name no row holds, the compare is with mine.
   */
  leaderIsMine(name?: string | null): boolean {
    const row = this.find(name);
    return row ? this.leaderIs(row.accountId) : this.leaderIsSelf();
  }

  /**
   * The no-clan state (`FUN_002e8bd0`'s failure branch, D:L187786-187802): the ids -1, the name zeroed, the roster
   * emptied (`FUN_002e9740`, D:L187801), and the rating 0 -- not by the branch's own statements but by the roster builder
   * it calls, `FUN_002e6af0` (D:L187802), whose first write is `DAT_0044f770 = 0` (D:L186623), its mean over an empty
   * roster 0 (D:L186687-186690).
   */
  none(): void {
    this.clanId = -1;
    this.leader = -1;
    this.name = '';
    this.rating = 0;
    this.roster.length = 0;                                                        // FUN_002e9740 (D:L187801): the roster emptied
  }

  /**
   * A new session (`CLAN_REQUEST_SESSION_ADAPTATION`, `./manageRosterCommands`): the no-clan state and the own id
   * forgotten -- the lobby's teardown empties the roster (`FUN_002df8e0`, D:L182261), its init sets the ids -1 and
   * zeroes the name (D:L182792-182795), and the next login writes `DAT_0066a4f0` anew (D:L191037, D:L191185).
   */
  reset(): void {
    this.none();
    this.self = null;
  }
}

/** The TextFilter's reply: the result (+0x58) and the text (+0x15). */
export interface ClanNameFilterReply { result: number; text: string }
/** CreateClan's reply (Lobby 0x55): the status (+0x18) and the clan id (+0x1c). */
export interface CreateClanReply { status: number; clanId: number }

/** The page's half: each request sent, its reply back (a rejection is a request never answered). */
export interface CreateClanService {
  /** TextFilter PassFail of the name (`CLAN_NAME_FILTER_PLACEHOLDER`); absent, every name passes. */
  filter?(q: { text: string }): Promise<ClanNameFilterReply>;
  /** CreateClan (Lobby 0x54): the name at +0x2c. */
  create(q: { clanName: string }): Promise<CreateClanReply>;
  /** UpdateClanStats (Lobby 0x84): the clan id at +0x28, the 256 bytes at +0x2c. */
  updateStats(q: { clanId: number; stats: Uint8Array }): Promise<{ status: number }>;
}

/** The size of the clan stats (+0x2c of the 300-byte request, `FUN_00195800(.., 0x100)`, D:L187213). */
export const CLAN_STATS_BYTES = 0x100;

/**
 * The clan stats as `FUN_002e7b80` writes them after a create (D:L187204-187216; research 262 §2.1):
 * `sprintf("%.3d%.12d%s", 0, rating, tag)` (S:0x3f4328, D:L187210; the icon digits a literal 0, the call's `$a2` `$zero`
 * at ELF 0x2e7c98) into 256 bytes, all 256 copied (D:L187213); the text's bytes, its NUL, and the tail 0 here (the console's stack:
 * `CLAN_STATS_TAIL_READING`, the server's). The tag's characters as UTF-8, as the keyboard writes a variable's text.
 */
export function clanStatsRecord(rating: number, tag: string): Uint8Array {
  const digits = (n: number, width: number): string => (n < 0 ? '-' : '') + String(Math.abs(Math.trunc(n))).padStart(width, '0');
  const text = new TextEncoder().encode(digits(0, 3) + digits(rating, 12) + tag);
  const out = new Uint8Array(CLAN_STATS_BYTES);
  out.set(text.subarray(0, CLAN_STATS_BYTES - 1));
  return out;
}

/**
 * PLAYER_NAME_AND_TAG's text (`FUN_002e7e70` D:L187272-187279, as `FUN_002e8bd0` D:L187837-187844): `"%s"` of the
 * account name (S:0x3f43b8) when the tag is empty, else S:0x3f43a0 -- `#C` 0x80 0x40 0x20, `"[%s] "` of the tag, `#C`
 * 0x80 0x80 0x80, the name: the tag in one colour, the name in the menus' grey.
 */
export function playerNameAndTag(tag: string, name: string): string {
  return tag === '' ? name : `#C\x80\x40\x20[${tag}] #C\x80\x80\x80${name}`;
}

const str = (value: string): UiVarValue => ({ type: 'string', value });

export interface CreateClanCommandsOptions {
  /** The game's one `CUIVarManager` (0x437e80). */
  uiVars: UiVarManager;
  /** The client's clan, the one SOCOM II ONLINE's rows read (`WorldOfSocomCommands.clan`). */
  clan: LobbyClan;
  /** The page's half; absent, every request is never answered. */
  service?: CreateClanService;
  /** `DAT_0044f3c8(name, 0)`: a named event into the built dialog. */
  event?: (kind: number, text: string | null) => void;
  /** The lobby session's +0x7d and its state byte +0x60 (`WORLD_LOBBY_STATE_READING`); absent, up in state 11. */
  lobbyUp?: () => boolean;
  lobbyState?: () => number;
  /** The session's account name, 0x66a4f4 (`ACCOUNT_NAME_READING`); absent or null, PLAYERNAMEVAR's text. */
  accountName?: () => string | null;
  /** The session's ticket, for `CREATE_CLAN_TICKET_ADAPTATION`; absent, not checked. */
  ticket?: () => string | null;
  /** A row called, as it happens. */
  log?: (name: CreateClanCommandName, arg: string, answer: boolean) => void;
}

export class CreateClanCommands {
  constructor(private readonly o: CreateClanCommandsOptions) {}

  private answer(name: CreateClanCommandName, cmd: ZAnimUiCommand, answer: boolean): boolean {
    this.o.log?.(name, cmd.arg, answer);
    return answer;
  }

  private post(event: string): void { this.o.event?.(DIALOG_EVENTS[event]!, null); }

  private setVar(name: string, text: string): void {
    const vars = this.o.uiVars;
    vars.set(vars.add(name, null, PERMANENT), str(text));
  }

  private text(name: string, longevity: LiveLongevity): string | null {
    const v = this.o.uiVars.add(name, null, longevity).value;
    return v.type === 'string' ? v.value : null;
  }

  /** The lobby session up and in state 11 (`WORLD_LOBBY_STATE_READING`). */
  private online(): boolean {
    return (this.o.lobbyUp?.() ?? true) && (this.o.lobbyState?.() ?? LOBBY_STATE_ONLINE) === LOBBY_STATE_ONLINE;
  }

  /** `CREATE_CLAN_TICKET_ADAPTATION`: whether the session's ticket is still the one held now (absent the hook, always). */
  private sameSession(): () => boolean {
    if (this.o.ticket === undefined) return () => true;
    const ticket = this.o.ticket();
    return () => ticket !== null && this.o.ticket!() === ticket;
  }

  /**
   * `FUN_0027a950` (D:L124567-124586): CLANNAMEVAR (S:0x3eee68, added TEMPORARY when absent, D:L124577), its text when it
   * holds a string, else the command's own argument (`FUN_0026ed60` of the record's +8, D:L124578-124580), to
   * `FUN_002e7a10`; 1.
   */
  CreateClan: UiCommandHandler = (cmd) => {
    this.filterThenCreate(this.text(CLAN_NAME_VAR, TEMPORARY) ?? cmd.arg);
    return this.answer('CreateClan', cmd, true);
  };

  /**
   * `FUN_002e7a10` (D:L187112-187135): only while the session is up in state 11, the name (its first 32 bytes, the
   * whole of any name the keyboard's 31-byte cap lets through) sent to the text filter (`CLAN_NAME_FILTER_PLACEHOLDER`);
   * its reply `FUN_002e7aa0` (D:L187137-187165): a result below 0 raises MP_FILTER_FAILURE (S:0x3f4280) and sets
   * CLANNAMEVAR "Unaffiliated" and Clan_Description " " (S:0x3f3f18); else CLANNAMEVAR is set to the reply's text and
   * CreateClan sent with it (0x4c bytes, the name at +0x2c:32; `FUN_00645710`).
   */
  private filterThenCreate(name: string): void {
    const svc = this.o.service;
    if (!svc || !this.online()) return;
    const held = this.sameSession();
    const filtered = svc.filter ? svc.filter({ text: name }) : Promise.resolve<ClanNameFilterReply>({ result: 0, text: name });
    filtered.then((f) => {
      if (!held()) return;                                                         // CREATE_CLAN_TICKET_ADAPTATION
      if (f.result < 0) {
        this.post('MP_FILTER_FAILURE');
        this.setVar(CLAN_NAME_VAR, UNAFFILIATED);
        this.setVar(CLAN_DESCRIPTION_VAR, ' ');
        return;
      }
      this.setVar(CLAN_NAME_VAR, f.text);
      svc.create({ clanName: f.text }).then((r) => { if (held()) this.createReply(r, held); }, () => { /* never answered */ });
    }, () => { /* never answered */ });
  }

  /**
   * `FUN_002e7b80` (D:L187167-187221), the create's reply: a status not Success ("MediusCreateClan",
   * S:0x3f42b0: status == 0) raises MP_CREATE_CLAN_FAILURE (S:0x3f4340) and sets CLANNAMEVAR "Unaffiliated" and
   * Clan_Description "" (S:0x3f3f38); Success keeps the clan id (+0x1c) in `DAT_003df298` and `DAT_0044f59c`, the leader
   * id mine (D:L187193, `CLAN_LEADER_MINE_ADAPTATION`), raises MP_CREATE_CLAN_SUCCESS (S:0x3f42d0), copies CLANNAMEVAR's
   * text as the clan's name (0x44f5a4, 32 bytes), empties Clan_Description, posts the clan stats (`clanStatsRecord` of
   * the rating and Clan_Description's text; 300 bytes, the clan id at +0x28, `FUN_00646660`, the reply `FUN_002e7e70`)
   * and runs `FUN_002e7f50` (`CLAN_LADDER_POST_PLACEHOLDER`).
   */
  private createReply(r: CreateClanReply, held: () => boolean): void {
    if (r.status !== 0) {
      this.post('MP_CREATE_CLAN_FAILURE');
      this.setVar(CLAN_NAME_VAR, UNAFFILIATED);
      this.setVar(CLAN_DESCRIPTION_VAR, '');
      return;
    }
    const clan = this.o.clan;
    clan.clanId = r.clanId | 0;
    clan.leader = 'mine';
    this.post('MP_CREATE_CLAN_SUCCESS');
    const named = this.o.uiVars.find(CLAN_NAME_VAR)?.value;                      // the lobby's +0xf0, read as it stands (D:L187199-187202)
    clan.name = named?.type === 'string' ? named.value : '';
    this.setVar(CLAN_DESCRIPTION_VAR, '');
    const stats = clanStatsRecord(clan.rating, this.text(CLAN_DESCRIPTION_VAR, TEMPORARY) ?? '');
    this.o.service?.updateStats({ clanId: clan.clanId, stats }).then((s) => { if (held()) this.statsReply(s); }, () => { /* never answered */ });
    clan.rating = 0;                                                               // FUN_002e7f50: no roster held (CLAN_LADDER_POST_PLACEHOLDER)
  }

  /**
   * `FUN_002e7e70` (D:L187255-187279): Success ("MediusUpdateClanStats", S:0x3f4360) sets PLAYER_NAME_AND_TAG (added
   * PERMANENT) to `playerNameAndTag` of Clan_Description's text and the account's name; a failure is silent.
   */
  private statsReply(s: { status: number }): void {
    if (s.status !== 0) return;
    const vars = this.o.uiVars;
    const held = vars.find(PLAYER_NAME_VAR)?.value;
    const name = this.o.accountName?.() ?? (held?.type === 'string' ? held.value : '');
    const tag = vars.find(CLAN_DESCRIPTION_VAR)?.value;
    vars.set(vars.add(PLAYER_NAME_AND_TAG_VAR, null, PERMANENT), str(playerNameAndTag(tag?.type === 'string' ? tag.value : '', name)));
  }

  /** The entries by their table name. */
  entries(): Record<CreateClanCommandName, UiCommandHandler> {
    return { CreateClan: this.CreateClan };
  }

  /** Each row's body set in PLAT-08's host (`UiCommandHost.setHandler`). */
  register(host: UiCommandHost): void {
    for (const [name, h] of Object.entries(this.entries())) host.setHandler(name, h);
  }
}
