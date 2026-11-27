import { isNameDrawable } from './net/playerName';

/**
 * NAMES-MIDDLE's account-name rules (product track; the owner's "middle way", MISSION OT.R149), shared by central's
 * AccountRegistration (`central/src/accounts.ts` `AccountService.create`) and the page's account panel
 * (`./modern/session.ts`), so the two say the same. Adaptations: the original's login keyboard typed printable
 * characters only and its servers' rules are unobservable; nothing here changes what the game does. Dependency-free and
 * outside the shared sim (`./sim.ts` does not reach it).
 */

/**
 * ACCOUNT_NAME_CHARACTERS_ADAPTATION: a new account's name holds drawable characters only (`./net/playerName`
 * `NAME_DRAWABLE_ADAPTATION`) and equals its own cleaned form (`cleanAccountName`: no leading, trailing or doubled space),
 * else it is refused -- the invisible, zero-width and undrawable characters named (`AccountNameRefusal`). Central answers
 * the refusal RegistrationFailed (-994), the original's status for a registration it does not take; existing accounts are
 * neither renamed nor refused a login.
 */
export const ACCOUNT_NAME_CHARACTERS_ADAPTATION = 'a new account name: drawable characters only, as its own cleaned form' as const;

/**
 * NAME_LOOKALIKE_FOLD_ADAPTATION: the key a new account's name is compared under at create, against every held name, so
 * a name that LOOKS like one already held is AccountAlreadyExists. Not the store's key (`central` `nameKey`, persisted as
 * `accounts.name_key UNIQUE`, untouched): a create-time check only. The name is first cleaned as the room shows it
 * (`cleanAccountName`: an older name's undrawable characters dropped, its spaces collapsed), then each character folded:
 * - case, over the whole drawable set (`toLowerCase`: A-Z, the Latin-1 capitals, OE, S-caron, Y-diaeresis);
 * - the Latin-1 diacritics to their base letter (à-å a, ç c, è-ë e, ì-ï i, ñ n, ò-ö and ø o, ù-ü u, ÿ y, š s);
 * - the ligatures and the sharp s spelled out (æ ae, œ oe, ß ss);
 * - the drawable lookalikes: ¡ i and º ° o (the brief's ¡ -> i and its kin), © c, ® r, « <<, » >>, „ ,,; and in the
 *   HUD face's own cells (`../hudFont` `FONT_TEXT_01`) the strokes I (6 texels wide), l (5), | (6) and 1 (8) as i, and
 *   0 (10) as O (12) -- so I, l, |, 1 and i fold together, as case folding already joins I and i. Case folds FIRST, so a
 *   capital L folds to l and then to i as well ("Lola" and "Iola", "Al" and "AI" collide). The breadth of this stroke
 *   rule is the controller's taste call (NAMES-MIDDLE review F2), not settled by this file.
 * The fold is deliberately wide (a false match costs a new player another name; a missed one lets an impersonation in);
 * which lookalikes it joins is the owner's to trim.
 */
export const NAME_LOOKALIKE_FOLD_ADAPTATION = 'a new name is compared at create under case, diacritic and lookalike folding' as const;

/** The name cleaned as the room shows it, uncut: its drawable characters, runs of spaces collapsed, trimmed. */
export function cleanAccountName(name: string): string {
  let s = '';
  for (const ch of name) if (isNameDrawable(ch)) s += ch;
  return s.replace(/ {2,}/g, ' ').trim();
}

/** Why a new account's name is refused (`ACCOUNT_NAME_CHARACTERS_ADAPTATION`): its undrawable characters, each once in order, or its spacing. */
export type AccountNameRefusal = { kind: 'characters'; chars: string[] } | { kind: 'spacing' };

/** The refusal of a new account's name, or null when it may be made (`ACCOUNT_NAME_CHARACTERS_ADAPTATION`). Widths are central's own. */
export function accountNameRefusal(name: string): AccountNameRefusal | null {
  const bad: string[] = [];
  for (const ch of name) if (!isNameDrawable(ch) && !bad.includes(ch)) bad.push(ch);
  if (bad.length > 0) return { kind: 'characters', chars: bad };
  return name === cleanAccountName(name) ? null : { kind: 'spacing' };
}

/** A character as a refusal names it: `U+XXXX`, after the character itself when it is visible (a letter, a digit, a mark of punctuation or a symbol). */
export function nameCharLabel(ch: string): string {
  const code = `U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`;
  return /^[\p{L}\p{N}\p{P}\p{S}]$/u.test(ch) ? `${ch} (${code})` : code;
}

/** NAME_LOOKALIKE_FOLD_ADAPTATION's table, by the lower-cased character. */
const FOLD: Readonly<Record<string, string>> = (() => {
  const out: Record<string, string> = {};
  const put = (chars: string, to: string): void => { for (const c of chars) out[c] = to; };
  put('àáâãäå', 'a'); put('æ', 'ae'); put('ç©', 'c'); put('èéêë', 'e'); put('ìíîï¡1l|', 'i'); put('ñ', 'n');
  put('òóôõöøº°0', 'o'); put('œ', 'oe'); put('®', 'r'); put('š', 's'); put('ß', 'ss'); put('ùúûü', 'u'); put('ÿ', 'y');
  put('«', '<<'); put('»', '>>'); put('„', ',,');
  return out;
})();

/** The key a new name is compared under at create (`NAME_LOOKALIKE_FOLD_ADAPTATION`); never stored. */
export function nameLookalikeKey(name: string): string {
  let out = '';
  for (const ch of cleanAccountName(name)) {
    const low = ch.toLowerCase();
    out += FOLD[low] ?? low;
  }
  return out;
}
