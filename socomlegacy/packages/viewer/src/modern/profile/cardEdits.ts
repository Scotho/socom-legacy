import { Libmc, MC_RESULT, PERSONA_NAME_MAX, PERSONA_TOWN_READING, PersonaCard, UI_VAR_MODULE, type CardSlots, type PersonaLogin, type PersonaRecord } from '@s2u/card';
import { ACCT_FIELD_BYTES, PERSONA_LIST_ROWS } from '@s2u/ui';
import { MESSAGE_VARS } from '../../messageSettings';
import { pageCard } from '../../pageStore';
import { TAUNT_VARS, cardTauntTexts } from '../../tauntSettings';
import { TAUNT_MAX_CHARS, validTauntText } from '../../taunts';
import { loginSaveSize, saveWithinCard } from '../cardSave';

/**
 * What the modern profile edits on the memory card (MU-13c taunts and team messages, MU-13e personas; MU.R2: the card
 * package's own functions, never a second store). A browser adaptation (MU.R1): it adds no screen to the original.
 *
 * **Where it writes.** The card's save file `BASCUS-97275SOCOMII`, read and written by `PersonaCard` over the page's
 * `Libmc` exactly as the persona form's `LoadConfig` / `SaveConfig` and the settings page's store (`../settings/store`)
 * do:
 * - the five taunts `MPTAUNTMSG1-5` and the five team messages `MPLOCALSOP1-5` are string UI variables in the file's
 *   `CUIVarManager` module (web research 301 §6, 302 §3; `../../tauntSettings` `TAUNT_VARS`, `../../messageSettings`
 *   `MESSAGE_VARS`), written as that module's own record `{ type: 'string', value }` beside the module's other keys
 *   (`PersonaCard.part` / `setPart` / `save`); shared by every persona on the card;
 * - a persona is a record of the `CAcctDB` list: created by `PersonaCard.saveLogin` (`personaFromLogin`: NAME cut at 14,
 *   a record of the same HOST, PORT and NAME replaced where it stands), changed -- HOME TOWN, GENDER -- by the same
 *   call with its own HOST, PORT and NAME, deleted by `PersonaCard.setLogins` of the list without it and `save`
 *   (`DeleteMUISPersona` `FUN_002761a0` D:L122290-122391 erases the record and the list is saved by `SaveConfig`).
 *
 * **One card per write.** The modern UI runs only before START (the launcher's tab is torn down at START) and the
 * front end re-reads the card when it boots (`frontEnd.ts`, `connectPersona`'s `load`), so no page-held list can race
 * this: every write opens the card afresh (`open`), changes it, and saves it; nothing is cached across writes. A
 * malformed file is refused (never overwritten from here: the original's "Error loading data" path owns that).
 *
 * **The card-save boundary (MU-F2b).** Every write goes through `../cardSave` `saveWithinCard`: the original's space
 * rule (`IsSpaceForSaveGameFile`, `FUN_0027b3d0`) and libmc's Write rule for the enlarged file, counting what releasing
 * `SCRATCHPAD.DAT` frees (`SaveConfig`'s `FUN_003a1c60`), are asked before the writer deletes the old file; a refused
 * write leaves the old file and its modules as they were, and `refusal()` says why. The edit is opened, changed and
 * saved over the boundary's staged copy of the card and persisted once (MU-F2d): a browser refusal or another tab's
 * save in between writes nothing.
 *
 * The password is never touched: a persona's record keeps its PASSWORD length and SAVEPASSWORD as the file held them
 * (`saveLogin` with `password: null`, the remember-cookie login's way, `personaFromLogin`) -- but by `setPersonaLogin`,
 * OT.R61's console half (PERSONA-PERSIST (a)): a sign-in's SAVE PASSWORD filed through the same `saveLogin`, which keeps
 * only the password's length (`personaFromLogin`), never the password.
 */

/** The hometown keyboard `_605_EnterHometown_MSG`: 20 characters, 63 bytes, empty allowed (research 153 §3, the form's table). */
export const PERSONA_TOWN_MAX_CHARS = 20;
/** The name keyboard `_455_EnterPlayerName_MSG`: 14 characters, 31 bytes, no double quote (research 153 §3, `A_37`). */
export const PERSONA_NAME_KEYBOARD_BYTES = 31;
/** The five of a phrase list (research 301 §6, 302 §3). */
export const PHRASE_SLOTS = 5;

export interface PersonaKey { readonly host: string; readonly port: number; readonly name: string }
export const keyOf = (p: PersonaRecord): PersonaKey => ({ host: p.HOST, port: p.PORT, name: p.NAME });
const same = (p: PersonaRecord, k: PersonaKey): boolean => p.HOST === k.host && p.PORT === k.port && p.NAME === k.name;

const bytes = (s: string): number => new TextEncoder().encode(s).length;
const chars = (s: string): number => Array.from(s).length;
const CONTROL = /[\u0000-\u001f\u007f]/;

/** `PruneUIVarSpaces` (`FUN_00278370` D:L123368-123404): the spaces at both ends cut. */
export const pruneSpaces = (s: string): string => s.replace(/^ +/, '').replace(/ +$/, '');

/**
 * Why a typed persona name is refused, or '' when it is the original's: the name keyboard's own limits (14 characters,
 * 31 bytes, no double quote: research 153 §3), no name an empty one (`FUN_002fd0d0` D:L199622-199633: nothing with no
 * NAME), the name one of the HOST's and PORT's three at most (`PERSONA_LIST_ROWS`: `FUN_00276af0` D:L122572 pads the
 * list to three `<New Persona>` rows, none with three) and not one already held (`MUISPersonaExists` `FUN_00276580`
 * D:L122394-122426, compared exactly). Control characters are refused too: the keyboard has no key for one.
 * `name` is the pruned text.
 */
export function personaNameProblem(name: string, held: readonly PersonaRecord[], host: string, port: number): string {
  if (name === '') return 'Enter a name';
  if (chars(name) > PERSONA_NAME_MAX || bytes(name) > PERSONA_NAME_KEYBOARD_BYTES) return `A name is ${PERSONA_NAME_MAX} characters at most`;
  if (name.includes('"')) return 'A name cannot hold a double quote';
  if (CONTROL.test(name)) return 'A name cannot hold control characters';
  const here = held.filter((p) => p.HOST === host && p.PORT === port);
  if (here.some((p) => p.NAME === name)) return 'You already have a persona by that name';
  if (here.length >= PERSONA_LIST_ROWS) return `A server holds ${PERSONA_LIST_ROWS} personas at most; delete one first`;
  return '';
}

/** Why a typed hometown is refused, or '': 20 characters, 63 bytes (`ACCT_FIELD_BYTES.hometown`); empty is allowed. */
export function townProblem(town: string): string {
  if (chars(town) > PERSONA_TOWN_MAX_CHARS || bytes(town) > ACCT_FIELD_BYTES.hometown) return `A home town is ${PERSONA_TOWN_MAX_CHARS} characters at most`;
  if (CONTROL.test(town)) return 'A home town cannot hold control characters';
  return '';
}

/** Why a typed taunt or team message is refused, or '': `dlgSetTaunts` / `dlgSetSop` `do_chat`'s `GetTextInput`: 45 characters, 46 bytes with the NUL, allowEmpty false (`../../taunts` `validTauntText`). */
export function phraseProblem(text: string): string {
  if (text === '') return 'Enter some text';
  if (!validTauntText(text)) return `At most ${TAUNT_MAX_CHARS} characters, no control characters`;
  return '';
}

export interface NewPersona { readonly name: string; readonly host: string; readonly port: number; readonly town: string; readonly gender: 0 | 1 }

/** The edits the profile makes on the card. Every write answers false when nothing was written. */
export interface ProfileCardEdits {
  /** Whether the card can be read and written (a malformed file or a failing card says false). */
  usable(): boolean;
  /** The personas as the persona form reads them (slot 1's file, else slot 2's). */
  personas(): PersonaRecord[];
  /** The card slot (1 or 2) whose file is read; null with no card. */
  slot(): 1 | 2 | null;
  /** The five taunts' / team messages' texts as the card holds them: a string (text, or a HudCLOC key) or null. */
  taunts(): (string | null)[];
  messages(): (string | null)[];
  setTaunt(slot: number, text: string): boolean;
  setMessage(slot: number, text: string): boolean;
  createPersona(p: NewPersona): boolean;
  setPersonaTown(key: PersonaKey, town: string): boolean;
  setPersonaGender(key: PersonaKey, gender: 0 | 1): boolean;
  deletePersona(key: PersonaKey): boolean;
  /**
   * OT.R61's console half (PERSONA-PERSIST (a)): a sign-in's SAVE PASSWORD on a record the card holds, through
   * `PersonaCard.saveLogin` (`personaFromLogin`): YES with the typed password keeps its length (cut at 12), YES with
   * `password: null` the length the record had, NO keeps none (Forget this device, an unticked sign-in, a quick
   * sign-in's -978). The quick sign-in's success files nothing: the record holds YES already. The password itself is
   * never written.
   * Optional so that a test double of the profile's edits need not carry it; `cardProfileEdits` always does.
   */
  setPersonaLogin?(key: PersonaKey, login: { savePassword: boolean; password: string | null }): boolean;
  /**
   * OT.R61's console half (PERSONA-PERSIST (a), fold A): a remembered sign-in of a name the card does not hold files it
   * as the original's LOGIN files a name its form had not seen (`../../personaHost` `MP_NAME_MIGRATION_ADAPTATION`: the
   * record `UpdateAcctInfo` appends, `FUN_002fbce0` D:L199067-199071 -- HOST, PORT and NAME, no hometown, GENDER 0) --
   * the card package's default town (`PERSONA_TOWN_READING`) -- with SAVE PASSWORD: YES and the typed password, of
   * which `personaFromLogin` keeps the length alone. The caller checks the name and the form's cap first
   * (`personaNameProblem`). Optional, as `setPersonaLogin`.
   */
  rememberNewPersona?(p: { name: string; host: string; port: number; password: string }): boolean;
  /** Why the last write was refused (`../cardSave` `CARD_SAVE_REFUSED`), '' when it saved or was not tried. Optional: a fake has none. */
  refusal?(): string;
}

interface Opened { card: PersonaCard; port: 0 | 1; malformed: boolean; exists: boolean; mc: Libmc }

/** The card as the persona form reads it: slot 1's file, else slot 2's; neither: slot 1, to be made. */
function open(slots: CardSlots): Opened | null {
  try {
    const mc = new Libmc(slots, { log: () => {} });
    let first: Opened | null = null;
    for (const port of [0, 1] as const) {
      const card = new PersonaCard(mc, port);
      const read = card.load();
      if (read.result >= 0) return { card, port, malformed: read.malformed !== undefined, exists: true, mc };
      if (read.result === MC_RESULT.NoEntry && first === null) first = { card, port, malformed: false, exists: false, mc };
    }
    return first;
  } catch { return null; }
}

const loginOf = (p: PersonaRecord, over: Partial<PersonaLogin> = {}): PersonaLogin =>
  ({ host: p.HOST, port: p.PORT, name: p.NAME, town: p.TOWN, gender: p.GENDER, savePassword: p.SAVEPASSWORD === 1, password: null, ...over });

export function cardProfileEdits(slots: CardSlots = pageCard): ProfileCardEdits {
  const read = (over: CardSlots = slots): Opened | null => { const o = open(over); return o && !o.malformed ? o : null; };
  let refused = '';
  /**
   * One card per write (the module's note): `change` changes the card in memory and answers whether to save, or a
   * login for `saveLogin` to write; either save runs inside the card-save boundary (`saveWithinCard`), the card opened
   * over its staged copy.
   */
  const write = (change: (card: PersonaCard) => boolean | PersonaLogin): boolean => {
    refused = '';
    try {
      const out = saveWithinCard(slots, (staged) => {
        const fresh = read(staged);
        if (!fresh) return null;
        const plan = change(fresh.card);
        if (plan === false) return null;
        const card = fresh.card;
        return plan === true
          ? { mc: fresh.mc, port: fresh.port, size: card.contents().size, commit: () => card.save() }
          : { mc: fresh.mc, port: fresh.port, size: loginSaveSize(card, plan), commit: () => card.saveLogin(plan).result };
      });
      if (out === null) return false;
      if (!out.ok) refused = out.message;
      return out.ok;
    } catch { return false; }
  };
  const part = (names: readonly string[]): (string | null)[] => cardTauntTexts(read()?.card.part(UI_VAR_MODULE), names);
  const setVar = (name: string, text: string): boolean => write((card) => {
    const held = card.part(UI_VAR_MODULE);
    if (held !== undefined && (typeof held !== 'object' || held === null || Array.isArray(held))) return false;   // another shape: not overwritten
    card.setPart(UI_VAR_MODULE, { ...(held as Record<string, unknown> | undefined), [name]: { type: 'string', value: text } });
    return true;
  });
  const setSlotted = (names: readonly string[], slot: number, text: string): boolean =>
    Number.isInteger(slot) && slot >= 0 && slot < PHRASE_SLOTS && phraseProblem(text) === '' && setVar(names[slot]!, text);
  const edit = (key: PersonaKey, over: Partial<PersonaLogin>): boolean => write((card) => {
    const held = card.personas().find((p) => same(p, key));
    return held ? loginOf(held, over) : false;
  });

  return {
    usable: () => read() !== null,
    personas: () => read()?.card.personas() ?? [],
    slot: () => { const o = read(); return o ? (o.port === 0 ? 1 : 2) : null; },
    taunts: () => part(TAUNT_VARS),
    messages: () => part(MESSAGE_VARS),
    setTaunt: (slot, text) => setSlotted(TAUNT_VARS, slot, text),
    setMessage: (slot, text) => setSlotted(MESSAGE_VARS, slot, text),
    createPersona: (p) => write(() => ({ host: p.host, port: p.port, name: p.name, town: p.town, gender: p.gender, savePassword: false, password: null })),
    setPersonaTown: (key, town) => townProblem(town) === '' && edit(key, { town }),
    setPersonaGender: (key, gender) => edit(key, { gender }),
    setPersonaLogin: (key, login) => edit(key, { savePassword: login.savePassword, password: login.savePassword ? login.password : null }),
    rememberNewPersona: (p) => write((card) => (card.personas().some((r) => same(r, { host: p.host, port: p.port, name: p.name })) ? false
      : { host: p.host, port: p.port, name: p.name, town: PERSONA_TOWN_READING, gender: 0, savePassword: true, password: p.password })),
    deletePersona: (key) => write((card) => {
      const list = card.personas();
      if (!list.some((p) => same(p, key))) return false;
      card.setLogins(list.filter((p) => !same(p, key)).map((p) => loginOf(p)));
      return true;
    }),
    refusal: () => refused,
  };
}
