import type { UiCommandHandler, UiCommandHost } from '../uiCommands';
import type { UiVarManager } from '../uiVars';

/**
 * ONLINE OPTIONS' PLAYER DESCRIPTION (OPT-15, web sprint 22; web research 265 §1): `SetPlayerDescription`, row 101 of
 * PLAT-08's table (`FUN_00277640`, D:L122933-122945), which the dialog's `OnSKBApply` runs after the keyboard's ENTER
 * and its TRIANGLE's discard runs after restoring the old text (`dlgOnlineOptions.rdr`'s scripts, read through
 * `tools/dump-online-dialogs.ts`).
 *
 * **The original.** The row looks up the UI variable `PlayerDescription` (the name at 0x3eeb40) and, when it holds a
 * string (type 3, D:L122940-122942), hands its text to `FUN_002fa7f0` (D:L198336-198343), which asks the lobby server's
 * TextFilter (type 1, Replace; at most 0x40 bytes of the text, `FUN_002f4df0` D:L194740-194762, the type D:L194753, the copy D:L194755) with the callback at
 * ELF 0x2fa800 (`FUN_002fa800`, 0x2fa800-0x2fa860, read by address: the decompilation has no block for it). The
 * callback prints the reply's text (`"%s"`, 0x3f5b50) into the session's record at +0x9f (0x66a7ef, the record at
 * 0x66a750), sets `PlayerDescription` (0x3f5b60) from that field, and posts the whole record (`FUN_002faa80`, research
 * 155 §1.3). The row answers 1 at once; the variable changes only when the reply comes. At the login the own-stats
 * read sets the variable from the stored record's +0x9f (`FUN_002fa8f0` D:L198401-198402).
 *
 * **The own-stats read** (SVC-15a, web research 268 §1.7; owed from OPT-15, research 265 §6). At each entry into the
 * lobby's state 11, LOGGED IN -- the login's first -- the original's handler (`FUN_002ee540` D:L190794-190797) asks the
 * session's own PlayerInfo (`FUN_002fa870` D:L198347-198363: the request PLAYER INFO's page posts, `FUN_00648d30`, with
 * the session's own account id, D:L198359); its callback `FUN_002fa8f0` (D:L198367-198405), on Success (D:L198381),
 * parses the record (D:L198383; a record that is not `'E'` becomes the default, zero-filled, `FUN_002f9ac0`
 * D:L198207-198222) and sets `PlayerDescription` from its +0x9f (D:L198401-198402). `readOwnRecord` is that pair over
 * the services' PlayerInfo (`/lobby/player-info`, `packages/central/src/playerInfo.ts`), asked by the account's name --
 * the page holds no account id (its login answers a ticket): `OWN_RECORD_BY_NAME_ADAPTATION`. The read's other effects
 * -- the hometown valve copied into the session's record (D:L198384-198390), the rating into `LadderRating`
 * (D:L198392-198398), a record not `'E'` posted back (D:L198403-198405) -- are not built here (research 268 §1.7).
 *
 * **The port** (W22.R1: a page never reports a result). The text goes to the services' owner-fields operation
 * (`/lobby/owner-fields`, `packages/central/src/ownerFields.ts`), which writes the record's +0x9f and nothing else, and
 * answers the stored text; the variable is set from that answer, as the callback sets it from the field. No text filter
 * stands between (`CHAT_FILTER_PLACEHOLDER`'s default, the server's: the TextFilter's words are Sony's, unread). With no
 * service, or no answer, nothing changes: a request never answered, as the console's would be with no reply.
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/** The UI variable the row reads and the keyboard writes (0x3eeb40; the dialog's WRAPPEDTEXT `PlayerDescription`). */
export const PLAYER_DESCRIPTION_VAR = 'PlayerDescription';

/**
 * OWN_RECORD_BY_NAME_ADAPTATION (a browser adaptation of the request, research 268 §1.7): the own-stats read asks the
 * PlayerInfo of the session's account **name**, where the original sends its account id (`FUN_002fa870` D:L198359): the
 * page's login answers a ticket and no account id (SVC-03), and the services resolve the name by the store's lookup.
 * The answer and what is read of it are the original's.
 */
export const OWN_RECORD_BY_NAME_ADAPTATION = 'the own record asked by the account name' as const;

/** The record's description: +0x9f, 66 bytes (`FUN_002fab80` D:L198513-198523), read up to its first NUL. */
export const RECORD_DESCRIPTION_FIELD = { offset: 0x9f, size: 66 } as const;
/** The record's version byte the parser copies whole (`'E'`, `FUN_002f9ac0` D:L198088-198092); any other, the default record. */
const RECORD_VERSION_E = 0x45;

/**
 * The description a PlayerInfo answer's record (hex, 256 bytes) holds, as the own-stats read sets it: +0x9f up to its
 * first NUL or the field's end, one character a byte; '' for a record that is not `'E'` (the default, zero-filled) or
 * one too short to hold the field.
 */
export function recordDescription(statsHex: string): string {
  const field = RECORD_DESCRIPTION_FIELD;
  if (!/^(?:[0-9a-f]{2})*$/i.test(statsHex) || statsHex.length < (field.offset + field.size) * 2) return '';
  const byte = (i: number): number => parseInt(statsHex.slice(i * 2, i * 2 + 2), 16);
  if (byte(0) !== RECORD_VERSION_E) return '';
  let out = '';
  for (let i = field.offset; i < field.offset + field.size; i++) {
    const b = byte(i);
    if (b === 0) break;
    out += String.fromCharCode(b);
  }
  return out;
}

/** The owner-fields operation as the page sees it: the description sent, the stored text answered (cut at the 0x40 bytes the original sends). */
export interface OwnerFieldsService {
  setDescription(description: string): Promise<{ description: string }>;
}

/** PlayerInfo as the page sees it (`/lobby/player-info`, SVC-15a): the status and the record (hex, 256 bytes). */
export interface PlayerInfoLookup {
  playerInfo(q: { name: string }): Promise<{ status: number; stats: string }>;
}

export interface OnlineOptionsCommandsOptions {
  uiVars: UiVarManager;
  /** The services' owner-fields operation with the session's bearer; absent, a request never answered. */
  service?: OwnerFieldsService;
  /** SVC-15a: the services' PlayerInfo with the session's bearer; absent, the own-stats read is never answered. */
  playerInfo?: PlayerInfoLookup;
  /** The session's account name (`LobbyClient.account()`), or null with no login: the own-stats read asks nothing. */
  accountName?: () => string | null;
  /**
   * The session's ticket (`LobbyClient.ticket()`): a reply is taken only while the session that asked stands -- one that
   * lands after a logoff and another login is dropped, as `LobbyClient.ask` drops a reply of an earlier connection.
   */
  session?: () => string | null;
}

export class OnlineOptionsCommands {
  constructor(private readonly o: OnlineOptionsCommandsOptions) {}

  /** `FUN_00277640`: the variable's string sent; the answer's text written back into the variable; answers 1. */
  SetPlayerDescription: UiCommandHandler = () => {
    const v = this.o.uiVars.find(PLAYER_DESCRIPTION_VAR);
    if (v?.value?.type !== 'string' || !this.o.service) return true;
    this.o.service.setDescription(v.value.value).then((reply) => {
      const held = this.o.uiVars.find(PLAYER_DESCRIPTION_VAR);
      if (held) this.o.uiVars.set(held, { type: 'string', value: reply.description });
    }, () => { /* a request never answered */ });
    return true;
  };

  /**
   * The own-stats read (`FUN_002fa870` and its callback `FUN_002fa8f0`): the session's own PlayerInfo asked
   * (`OWN_RECORD_BY_NAME_ADAPTATION`); on Success (D:L198381) `PlayerDescription` added and set to the record's +0x9f
   * (D:L198401-198402; `recordDescription`). Another status, no answer, no service or no login: nothing changes; nor
   * a reply that lands once the session's ticket (`session`) is no longer the one it was asked under.
   */
  readOwnRecord(): void {
    const name = this.o.accountName?.() ?? null;
    if (!this.o.playerInfo || name === null || name === '') return;
    const asked = this.o.session?.() ?? null;
    this.o.playerInfo.playerInfo({ name }).then((reply) => {
      if (reply.status !== 0 || (this.o.session?.() ?? null) !== asked) return;
      const v = this.o.uiVars.add(PLAYER_DESCRIPTION_VAR, null, 1);
      this.o.uiVars.set(v, { type: 'string', value: recordDescription(reply.stats) });
    }, () => { /* a request never answered */ });
  }

  /** The row registered in `host`. */
  register(host: UiCommandHost): void {
    host.setHandler('SetPlayerDescription', this.SetPlayerDescription);
  }
}
