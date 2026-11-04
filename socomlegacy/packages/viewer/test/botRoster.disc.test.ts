import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRdr, parseZdb, zdbSlice, Zar } from '@s2u/archive';
import { BOT_NAMES_ADAPTATION } from '../src/botRoster';

/**
 * H316 / BTL.R6 on the dev disc: every bot name is read back off the disc through the archive readers, at the file and
 * field `../src/botRoster` cites -- the front end's string table (`UIMnLOC.rdr`), the missions' actors (`vehicles.rdr`:
 * `name`, `display`, `character`, `team`) and UI variables (`mission.rdr` `UiVars`) -- and the terrorists' fill is
 * recomputed by its rule, not restated. Skips without the disc tree (`SOCOM_DISC`).
 */
const DISC = process.env['SOCOM_DISC'] ?? '';
const HAVE = DISC !== '' && existsSync(join(DISC, 'RUN', 'M51.ZDB')) && existsSync(join(DISC, 'RUN', 'LOCALE', 'STATES', 'UIMNLOC.ZAR'));
const MISSIONS = ['M51', 'M52', 'M53', 'M61', 'M62', 'M63', 'M71', 'M72', 'M73', 'M81', 'M82', 'M83'] as const;

type Rdr = unknown[];
const one = (x: unknown): string => (Array.isArray(x) ? String(x[0] ?? '') : String(x ?? ''));
const field = (rec: Rdr, key: string): unknown => { const i = rec.indexOf(key); return i >= 0 ? rec[i + 1] : undefined; };
/** A field's values, one or many -- `@s2u/scene` `escortees.ts`' `list` form (a single value parses as a string). */
const list = (n: unknown): unknown[] => (n === undefined ? [] : typeof n === 'string' ? [n] : (n as unknown[]));
/** A tree's records -- `escortees.ts`' `recordsOf` form: the root wraps one record or a list of them. */
const top = (tree: unknown): Rdr[] => {
  let n = tree;
  while (Array.isArray(n) && n.length === 1 && Array.isArray(n[0])) n = n[0];
  if (!Array.isArray(n)) return [];
  return typeof n[0] === 'string' ? [n] : n.filter((r): r is Rdr => Array.isArray(r));
};
/** The value a key names anywhere in a tree, depth first; undefined if no record holds it. */
const findKey = (tree: unknown, key: string): unknown => {
  if (!Array.isArray(tree)) return undefined;
  const i = tree.indexOf(key);
  if (i >= 0 && i + 1 < tree.length) return tree[i + 1];
  for (const c of tree) { const got = findKey(c, key); if (got !== undefined) return got; }
  return undefined;
};
const member = (z: Zar, name: string): Uint8Array => z.data(z.root.children.find((k) => k.name.toLowerCase() === name.toLowerCase())!);

/** `UIMnLOC.rdr`'s records: MSG_ID to LOCALIZED, in the table's order. */
function uiStrings(): [string, string][] {
  const z = Zar.parse(new Uint8Array(readFileSync(join(DISC, 'RUN/LOCALE/STATES/UIMNLOC.ZAR'))));
  return top(parseRdr(member(z, 'UIMnLOC.rdr'))).map((r) => [one(field(r, 'MSG_ID')), one(field(r, 'LOCALIZED'))]);
}
interface Actor { mission: string; index: number; name: string; display: string; character: string; team: string[] }
/** A mission's `READERM.ZAR` member, parsed. */
function missionRdr(mission: string, name: string): unknown {
  const bytes = new Uint8Array(readFileSync(join(DISC, 'RUN', `${mission}.ZDB`)));
  const entry = parseZdb(bytes).find((e) => /READERM\.ZAR$/i.test(e.name))!;
  return parseRdr(member(Zar.parse(zdbSlice(bytes, entry)), name));
}
function actors(mission: string): Actor[] {
  return top(missionRdr(mission, 'vehicles.rdr')).map((r, index) => ({
    mission, index, name: one(field(r, 'name')), display: one(field(r, 'display')), character: one(field(r, 'character')),
    team: list(field(r, 'team')).map(String),
  }));
}
/** The short name: the `display` word the actor's `character` definition ends with, in `display`'s case. */
const shortName = (a: Actor): string => {
  const last = a.character.split('_').at(-1)!.toLowerCase();
  const word = a.display.split(' ').find((w) => w.toLowerCase() === last);
  if (!word) throw new Error(`${a.mission} ${a.name}: no display word for ${a.character}`);
  return word;
};
const opposing = (a: Actor): boolean => a.team.includes('30') && !a.team.includes('31');

describe.skipIf(!HAVE)('H316 / BTL.R6: the bots\' names read back off the disc', () => {
  it('SEAL: the eight callsigns at their cited fields', () => {
    const ui = new Map(uiStrings());
    const m51 = actors('M51'), m52 = actors('M52');
    const byName = (list: Actor[], name: string): string => list.find((a) => a.name === name)!.display;
    // `mission.rdr`'s `UiVars` field, its records NAME / VALUE -- the field itself, never a walk of the whole mission.
    const uiVars = findKey(missionRdr('M81', 'mission.rdr'), 'UiVars');
    expect(uiVars, 'M81 mission.rdr UiVars').toBeDefined();
    const uiVar = (name: string): string => {
      const rec = top(uiVars).find((r) => one(field(r, 'NAME')) === name);
      if (!rec) throw new Error(`M81 mission.rdr UiVars has no ${name}`);
      return one(field(rec, 'VALUE'));
    };
    const read = [
      ui.get('_807_SPECTER_MSG'), ui.get('_808_JESTER_MSG'), ui.get('_809_VANDAL_MSG'), ui.get('_810_WARDOG_MSG'),
      byName(m52, 'bravo1'), byName(m52, 'bravo2'), uiVar('Seal3Name'), uiVar('Seal4Name'),
    ];
    expect(read).toEqual(BOT_NAMES_ADAPTATION.seal);
    // The same four as the missions' own actors (player, able2, bravo2, bravo1).
    expect(['player', 'able2', 'bravo2', 'bravo1'].map((n) => byName(m51, n))).toEqual(BOT_NAMES_ADAPTATION.seal.slice(0, 4));
    expect(['bravo1', 'bravo2'].map((n) => byName(actors('M81'), n))).toEqual(BOT_NAMES_ADAPTATION.seal.slice(6));
  });

  it('terrorist: the three promoted, the three leaders by their actors, the fill by its rule', () => {
    // The promoted, in the table's order: "<Name> is available to the terrorist team ...".
    const promoted = uiStrings().map(([, text]) => /^([A-Za-z]+) is available to the terrorist team/.exec(text)?.[1]).filter((n): n is string => !!n);
    expect(promoted).toEqual(BOT_NAMES_ADAPTATION.terrorist.slice(0, 3));
    const all = MISSIONS.flatMap((m) => actors(m));
    const actor = (mission: string, name: string): Actor => all.find((a) => a.mission === mission && a.name === name)!;
    // The leaders are chosen (BTL.R6, the merge controller's choice), not derived: named here by their actors, and read
    // back at them -- opposing, and their short names by the rule.
    const leaders = [actor('M52', 'Loading1'), actor('M53', 'Castrioti'), actor('M83', 'Arjan')];
    for (const a of leaders) expect(opposing(a), a.display).toBe(true);
    expect(leaders.map(shortName)).toEqual(BOT_NAMES_ADAPTATION.terrorist.slice(3, 6));
    // The promoted three are the campaign's own actors too: opposing, by the same short-name rule.
    const promotedActors = [actor('M53', 'Pius'), actor('M63', 'int_cont2'), actor('M83', 'valeska')];
    for (const a of promotedActors) expect(opposing(a), a.display).toBe(true);
    expect(promotedActors.map(shortName)).toEqual(BOT_NAMES_ADAPTATION.terrorist.slice(0, 3));
    // The fill: the next opposing single-person actors in mission order -- a one-word display that one actor alone holds
    // in the campaign (not a faction's label: "RAFB" names 79) -- not already named.
    const named = new Set(BOT_NAMES_ADAPTATION.terrorist.slice(0, 6).map((n) => n.toLowerCase()));
    const holders = new Map<string, number>();
    for (const a of all) holders.set(a.display, (holders.get(a.display) ?? 0) + 1);
    const fill = all.filter((a) => opposing(a) && a.display !== '' && !a.display.includes(' ') && holders.get(a.display) === 1
      && !named.has(a.display.toLowerCase())).map((a) => a.display).slice(0, 2);
    expect(fill).toEqual(BOT_NAMES_ADAPTATION.terrorist.slice(6));
  });
});
