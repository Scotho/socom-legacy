import type { Team } from './net/protocol';

/**
 * The bots' names by side (H316: the owner, 2026-10-24, "i more meant like the mission campaign character names"; the
 * lists and their rules are the merge controller's choice under that word, for the owner to overturn -- BTL.R6; drawn
 * by `match/src/bots/matchBots.ts` through `botNameFor`). Each
 * name is the campaign's own, read off the disc through the archive readers (a reading; `test/botRoster.disc.test.ts`
 * reads every one back); their use for online bots is the adaptation. Research 364 §8a cites each field.
 *
 * - SEAL bots: the campaign's eight SEAL callsigns -- SPECTER, JESTER, VANDAL, WARDOG (`RUN/LOCALE/STATES/UIMNLOC.ZAR`
 *   `UIMnLOC.rdr` `_807_SPECTER_MSG`..`_810_WARDOG_MSG`, and each mission's `vehicles.rdr` actors `player`, `able2`,
 *   `bravo2`, `bravo1` `display`), SABRE, REAVER (M52 / M53 `vehicles.rdr` `bravo1` / `bravo2` `display`), POLARIS,
 *   BLUDSHOT (M81 / M82 `mission.rdr` `UiVars` `Seal3Name` / `Seal4Name`, and `vehicles.rdr` `display`). (Feral, whom
 *   `UIMnLOC.rdr` `_1391` also promotes to the SEALs, is left out: the side holds eight.)
 * - Terrorist bots: first the three the disc itself promotes to the terrorists' multiplayer (`UIMnLOC.rdr` `_1384`
 *   Pius, `_1390` Quixada, `_1402` Valeska), then the campaign's opposing leaders in mission order (Rugova M52, Castrioti
 *   M53, Arjan M83), then the next opposing single-person actors in mission order -- a one-word `display` one actor alone
 *   holds in the campaign, not a faction's label ("RAFB" names 79) -- Gaspar, Vidonia (M61).
 *   Rules over `vehicles.rdr`'s fields: opposing = `team` holds 30 and not 31 (a reading of the data; the ids' meaning is
 *   not transcribed); a short name = the `display` word the actor's `character` definition ends with (`m52_Rugova`
 *   Rugova), in `display`'s case.
 */
export const BOT_NAMES_ADAPTATION: Readonly<Record<Team, readonly string[]>> = {
  seal: ['SPECTER', 'JESTER', 'VANDAL', 'WARDOG', 'SABRE', 'REAVER', 'POLARIS', 'BLUDSHOT'],
  terrorist: ['Pius', 'Quixada', 'Valeska', 'Rugova', 'Castrioti', 'Arjan', 'Gaspar', 'Vidonia'],
};

/**
 * BOTN, a browser adaptation: the owner's own five bot names, each side's ahead of `BOT_NAMES_ADAPTATION` -- his word,
 * 2026-10-31, not the campaign's (unlike the list above, none of these is read off the disc): "seal: Freq, Cav, Orion /
 * terrorsit: Shinobison, HUGE (yellow raincoat model on frostfire always). add these to the names of the list. make them
 * the first ones added and included in each bot additions, the rest can be randomized". His order and spelling; the
 * first free one, in order, goes to each new bot, so every fill holds all five while they are free.
 */
export const BOT_PRIORITY_NAMES_ADAPTATION: Readonly<Record<Team, readonly string[]>> = {
  seal: ['Freq', 'Cav', 'Orion'],
  terrorist: ['Shinobison', 'HUGE'],
};

/**
 * BOTN, a browser adaptation (the owner's word above, "HUGE (yellow raincoat model on frostfire always)"): a bot of this
 * name, on this map, always wears this model; elsewhere it takes the normal draw (`MatchBots.prepareCharacters`). The
 * model is read off the disc, not assumed (`test/botRaincoat.fixture.test.ts`): Frostfire's terrorist armory type
 * `mp2_terror4` (`RUN/MP2.ZDB` `READERM.ZAR` `chartype.rdr`) is `al_captain` (`RUN/READERC.ZAR` `character.rdr`), the one
 * model of the eight a Frostfire terrorist bot can wear (the four armory types and the catalogue's pool,
 * `MP2_ROSTER_PLACEHOLDER.terroristModels`; the Russian four read from M81 / M82 on the disc tree) with a yellow texture
 * (`CLIB_TXR.ZED`: `al_sailer_jacket_front`, `al_sailer_jacket_back`, `al_sailer_sleave`).
 */
export const BOT_MODEL_BY_NAME_ADAPTATION: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  HUGE: { MP2: 'al_captain' },
};

/** The model `BOT_MODEL_BY_NAME_ADAPTATION` names for a bot of `name` on the map `stem` (without case), or null. */
export function botModelFor(name: string, stem: string): string | null {
  const byMap = Object.entries(BOT_MODEL_BY_NAME_ADAPTATION).find(([n]) => n.toLowerCase() === name.toLowerCase())?.[1];
  return byMap ? Object.entries(byMap).find(([s]) => s.toUpperCase() === stem.toUpperCase())?.[1] ?? null : null;
}

/**
 * BOTN, a browser adaptation: the native armory type that wears a `BOT_MODEL_BY_NAME_ADAPTATION` model, by its
 * `character.rdr` record -- `al_captain` is Frostfire's fourth terrorist type, `mp2_terror4` (`RUN/MP2.ZDB` `READERM.ZAR`
 * `chartype.rdr`; its model `RUN/READERC.ZAR` `character.rdr`, read back by `test/botRaincoat.fixture.test.ts`). A bot so
 * named is seated on that type through the armory itself (`MatchBots.setRoster`), so its model holds on a host with no
 * character catalogue (a RUN/-only disc folder: `MatchBots.prepareCharacters` returns there before its fixed rule).
 */
export const BOT_MODEL_CHARACTER_ADAPTATION: Readonly<Record<string, string>> = { al_captain: 'mp2_terror4' };

/**
 * BOTN: the index, among a side's native armory types (`chartype.rdr` order, each with its `character.rdr` record), of the
 * one wearing the model `botModelFor` names for `name` on `stem`; undefined when the rule names none or no type wears it.
 */
export function botNativeTypeFor(name: string, stem: string, types: readonly { character: string }[]): number | undefined {
  const model = botModelFor(name, stem), character = model ? BOT_MODEL_CHARACTER_ADAPTATION[model] : undefined;
  if (!character) return undefined;
  const index = types.findIndex((t) => t.character.toLowerCase() === character.toLowerCase());
  return index < 0 ? undefined : index;
}

/** A side's names all taken (a human holding one, a larger room): "CPU <n>", the first free -- an invention, no original. */
export const BOT_NAME_FALLBACK_ADAPTATION = (n: number): string => `CPU ${n}`;

/**
 * A bot's name for a seat on `team`: the first of its side's priority names (`BOT_PRIORITY_NAMES_ADAPTATION`, in order)
 * no seat holds; with those all held, one of its side's names (`BOT_NAMES_ADAPTATION`) no seat holds, chosen by
 * `random`; with none free, the first free fallback. Taken names are compared without case, spectators' included.
 */
export function botNameFor(team: Team, taken: readonly string[], random: () => number): string {
  const used = new Set(taken.map((name) => name.toLowerCase()));
  const first = BOT_PRIORITY_NAMES_ADAPTATION[team].find((name) => !used.has(name.toLowerCase()));
  const free = BOT_NAMES_ADAPTATION[team].filter((name) => !used.has(name.toLowerCase()));
  // A priority name still makes the draw it replaces, discarded: the bots share one random stream with the team tactics
  // (`MatchBots`), so the draw count matches main's -- and a seeded match replays as before BOTN, the tactical draws
  // unmoved -- whenever no spectator or other-side person holds one of the side's ordinary names (every ordinary fill,
  // the hold test's included). Where one does, main's earlier ordinary picks can run out the list (a "CPU n" with no
  // draw) where BOTN's do not: a spectator "Specter" and an 8-SEAL fill are 7 draws on main, 8 here. Not matched: it
  // would mean replaying main's choices, for a naming adaptation.
  if (first) { if (free.length) random(); return first; }
  if (free.length) return free[Math.min(free.length - 1, Math.max(0, Math.floor(random() * free.length)))]!;
  for (let n = 1; ; n++) if (!used.has(BOT_NAME_FALLBACK_ADAPTATION(n).toLowerCase())) return BOT_NAME_FALLBACK_ADAPTATION(n);
}
