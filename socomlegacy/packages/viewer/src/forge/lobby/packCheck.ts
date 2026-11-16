import {
  checkDeclaredAgainstManifest, checkDeclaredPacks, checkPackRef, DECLARED_CODES, missingPackRefs, packRefKey, readDeclaredPacks, RECORD_LIMITS, samePackRef,
  type PackManifest, type PackRef,
} from '@s2u/creator-contracts';
import { packWords, readinessSentence } from '../../packs/readiness';

/**
 * CMV-6 (the main controller's call 2, 2026-11-13): the most characters of a provider the page draws -- central's own
 * bound (`central/src/forgeLobby.ts` `FORGE_PROVIDER_CHARS_MAX`, the record's operator, 1-64 printable characters).
 */
export const PROVIDER_CHARS_MAX = 64;

/** A modded host's lobby's members as the page reads them (`moddedMembersOf`). */
export interface ModdedMembers { modded?: true; provider?: string; packs?: PackRef[] }

const CONTROL_CHAR = /[\u0000-\u001f\u007f]/;

/**
 * CMV-6 (CMV.R11; the main controller's calls 2 and 3, 2026-11-13; product track): a lobby's `modded`, `provider` and
 * `packs` as a summary or a detail carries them (`central/src/forgeLobby.ts` `ForgeLobbySummary`), read defensively --
 * the one reader of the custom matches' list (`../../modern/lobbies/data`) and the lobby's detail (`../lobbyClient`).
 * Nothing unless `modded` is exactly `true` (a community or trusted host's lobby keeps today's members alone). A provider
 * is text with no control character and not blank, cut to `PROVIDER_CHARS_MAX`; else dropped. `packs` is a list of at
 * most `RECORD_LIMITS.requires` pack references (`checkPackRef`: exactly id, version and hash), fresh copies; else the
 * whole list is dropped -- the lobby stays listed, as today's optional members are read (`community` only when `true`).
 * Never throws on plain data.
 */
export function moddedMembersOf(e: Readonly<Record<string, unknown>>): ModdedMembers {
  if (e['modded'] !== true) return {};
  const p = e['provider'];
  const provider = typeof p === 'string' && p.trim().length > 0 && !CONTROL_CHAR.test(p) ? p.slice(0, PROVIDER_CHARS_MAX) : null;
  const raw = e['packs'];
  const packs = Array.isArray(raw) && raw.length <= RECORD_LIMITS.requires && raw.every((r) => checkPackRef(r) === null)
    ? (raw as PackRef[]).map((r) => ({ id: r.id, version: r.version, hash: r.hash })) : null;
  return { modded: true, ...(provider !== null ? { provider } : {}), ...(packs !== null ? { packs } : {}) };
}

/**
 * CMV-7 (the community-mods plan, `docs/plans/2026-11-12-community-mods-validation.md`, row CMV-7; CMV.R14; the main
 * controller's call 1 of 2026-11-13, STRICT R14, for the owner to overturn; product track, a browser adaptation with no
 * original): what the page checks of a lobby's packs before it opens the layout or asks any seat (`../page` `joinLobby`).
 *
 * - **Every need the joiner does not hold refuses the join**, whatever side or kind the lobby's server claims for it: a
 *   server-only pack named in the layout is refused too (the cost: a false refusal for such a pack, never a joiner sent
 *   to fetch a pack he should not, and never bytes).
 * - A declared side or kind is acted on only for a pack this page HOLDS (the same id, version and hash), after
 *   `checkDeclaredAgainstManifest` against the manifest held here at that hash; a mismatch refuses with its code
 *   (`declared.MANIFEST_MISMATCH` for a side or kind), never ignored.
 * - A lobby with needs whose detail carries no declaration that reads (`readDeclaredPacks`) refuses: absent or not a
 *   list, `declared.LIST_INVALID`; a list that does not read, the read's own first code.
 * - A declaration that does not cover every need by identity (`checkDeclaredPacks`: no pack of its id, another version,
 *   another hash) refuses with that code, after the manifest check and before the missing one (CMV-6/7's review).
 * Pure: no DOM, no I/O; total on frozen input; never throws, never mutates its input.
 */

/** A pack this page holds: its reference (the store's, `packDigest(manifest)` its hash) and its manifest. */
export interface HeldPack { readonly ref: PackRef; readonly manifest: PackManifest }

/**
 * The codes of this check that are not the declared family's: `missing`, a need the page does not hold (the contract's
 * `PACK_CODES` has no "pack missing" code of its own -- its `pack.DEPENDENCY_MISSING` is a manifest's dependency).
 */
export const PACK_CHECK_CODES = Object.freeze({ missing: 'packCheck.MISSING' } as const);

/** A refused join: its code, the packs it names (none for a declaration that does not read), the line the page says. */
export interface JoinPackRefusal { code: string; packs: PackRef[]; line: string }

const copy = (r: PackRef): PackRef => ({ id: r.id, version: r.version, hash: r.hash });
const LIST_INVALID = DECLARED_CODES.listInvalid;

/** CMV-7: why a join into a lobby needing `needs` is refused here, or null when it is not (see the module's head). */
export function joinPackRefusal(i: { needs: readonly PackRef[]; declared: unknown; held: readonly HeldPack[] }): JoinPackRefusal | null {
  try {
    if (i.needs.length === 0) return null;                              // a pack-free lobby: nothing changes
    const read = readDeclaredPacks(i.declared ?? null);
    if (!read.ok) {
      const code = Array.isArray(i.declared) ? read.diagnostics[0]?.code ?? LIST_INVALID : LIST_INVALID;
      return { code, packs: [], line: `The lobby's server did not say which packs it runs, so they cannot be checked here (${code}).` };
    }
    // a declared pack this page holds: its claim checked against the manifest held here, at that hash
    for (const d of read.packs) {
      const h = i.held.find((x) => samePackRef(x.ref, d));
      if (!h) continue;
      const fault = checkDeclaredAgainstManifest(d, h.manifest, h.ref.hash)[0];
      if (fault) {
        const what = fault.field === 'sides' ? 'sides' : fault.field === 'kinds' ? 'kinds' : 'identity';
        return { code: fault.code, packs: [copy(d)], line: `The lobby's server describes the pack ${packWords(d)} with ${what} its manifest does not have (${fault.code}).` };
      }
    }
    // the review's note (identity only, CMV.R14): a declaration that does not cover every need exactly -- no pack of its
    // id, another version, another hash (`checkDeclaredPacks`) -- refuses with that diagnostic's code, the need it names
    const uncovered = checkDeclaredPacks(read.packs, i.needs)[0];
    if (uncovered) {
      const need = i.needs.find((n) => packRefKey(n) === uncovered.expected);
      const named = need ? [copy(need)] : [];
      return { code: uncovered.code, packs: named, line: `The lobby's server does not run ${need ? `the pack ${packWords(need)}` : 'every pack'} its layout needs (${uncovered.code}).` };
    }
    const missing = missingPackRefs(i.needs, i.held.map((h) => h.ref));
    if (missing.length > 0) return { code: PACK_CHECK_CODES.missing, packs: missing, line: `${readinessSentence(missing)}.` };
    return null;
  } catch {
    // a value no wire gives (a getter that throws): refused, fail closed
    return { code: LIST_INVALID, packs: [], line: `The lobby's packs could not be checked here (${LIST_INVALID}).` };
  }
}
