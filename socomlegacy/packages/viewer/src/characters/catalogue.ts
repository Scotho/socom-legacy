import type { CharacterTable } from '@s2u/scene';
import type { Team } from '../net/protocol';

/** Prepared from all 22 multiplayer and 12 campaign CLIB libraries; the file stays with the private disc assets. */
export interface CharacterInventory { version: number; libraries: { archive: string; models: string[]; fittings?: string[]; members: string[] }[] }
export type CharacterRegion = 'albania' | 'brazil' | 'algeria' | 'russia' | 'thai' | 'europe';
export interface CharacterChoice {
  key: string; identity: string; name: string; canonical: boolean; team: Team; region: CharacterRegion;
  character: string; model: string; library: string; uniform: string; role: string;
  /** Fixed source appearance for this mesh, shared by every callsign that uses it. FBA.R10; donor provenance in research 364. */
  outfit?: { character: string; library: string };
}
export interface CharacterCatalogue {
  /** Native chartype.rdr selectable appearances, including custom-named multiplayer skins. */
  multiplayerModels?: Record<Team, string[]>;
  region: CharacterRegion; uniform: string; choices: CharacterChoice[]; pool: Record<Team, string[]>; playerModels?: Partial<Record<Team, string>>;
}

/**
 * Newly authored identities, not recovered names (the custom fills of the appearance catalogue; never a bot's displayed
 * name, `../botRoster`). A placeholder: named placeholders (the area (c) review's finding 7: literal tables from an unpublished donor snapshot, no `FUN_`/`D:L` or disc field); research 364 §8 and 101 list each with the reading that would settle it.
 */
export const CUSTOM_IDENTITIES_PLACEHOLDER = {
  seal: ['Anchor', 'Rook', 'Flint', 'Slate', 'Hawk', 'Kestrel', 'Wraith', 'Frost', 'Cinder', 'Pike', 'Mako', 'Lance', 'Talon', 'Drift', 'Bishop', 'Ridge'],
  russia: ['Volkov', 'Morozov', 'Petrov', 'Sokolov', 'Orlov', 'Markov', 'Nikitin', 'Fedorov', 'Belov', 'Kozlov', 'Pavlov', 'Smirnov', 'Ivanov', 'Antonov', 'Popov', 'Zaitsev'],
  albania: ['Dervishi', 'Hoxha', 'Krasniqi', 'Leka', 'Berisha', 'Gashi', 'Deda', 'Kola', 'Shala', 'Basha', 'Gjoka', 'Meta', 'Duka', 'Cela', 'Kodra', 'Rama'],
  brazil: ['Silva', 'Santos', 'Costa', 'Oliveira', 'Pereira', 'Almeida', 'Ferreira', 'Ribeiro', 'Carvalho', 'Gomes', 'Martins', 'Lima', 'Barbosa', 'Rocha', 'Dias', 'Mendes'],
  algeria: ['Benali', 'Bensalem', 'Saidi', 'Amrani', 'Mansouri', 'Meziane', 'Haddad', 'Belhadj', 'Brahimi', 'Hamdi', 'Mokrani', 'Bouzid', 'Rahmani', 'Cherif', 'Boudiaf', 'Taleb'],
  thai: ['Somchai', 'Anan', 'Prasert', 'Krit', 'Surasak', 'Niran', 'Chai', 'Sakda', 'Arthit', 'Kittipong', 'Preecha', 'Wichai', 'Thana', 'Somsak', 'Suchart', 'Manop'],
  europe: ['Kovac', 'Novak', 'Varga', 'Horvat', 'Urban', 'Marek', 'Kral', 'Barta', 'Dvorak', 'Kolar', 'Havel', 'Svoboda', 'Nemec', 'Prochazka', 'Blazek', 'Cerny'],
} as const;

/**
 * The campaign's SEALs by mission definition (mission definitions + UiVars Seal3Name/Seal4Name, rather than MP slots or
 * model letters; donor catalogue, provenance in research 364). A placeholder: named placeholders (the area (c) review's finding 7: literal tables from an unpublished donor snapshot, no `FUN_`/`D:L` or disc field); research 364 §8 and 101 list each with the reading that would settle it.
 */
export const CAMPAIGN_IDENTITIES_PLACEHOLDER = [
  [['Specter', 'Jester', 'Wardog', 'Vandal'], ['jungle_A51', 'jungle_B51', 'jungle_C51', 'jungle_D51']],
  [['Specter', 'Jester', 'Sabre', 'Reaver'], ['urban_A52', 'urban_B52', 'SAS_C52', 'SAS_D52']],
  [['Specter', 'Jester', 'Sabre', 'Reaver'], ['tiger_A53', 'tiger_B53', 'SAS_C53', 'SAS_D53']],
  [['Specter', 'Jester', 'Wardog', 'Vandal'], ['jungle_A61', 'jungle_B61', 'jungle_C61', 'jungle_D61']],
  [['Specter', 'Jester', 'Wardog', 'Vandal'], ['jungle_A62', 'jungle_B62', 'jungle_C62', 'jungle_D62']],
  [['Specter', 'Jester', 'Wardog', 'Vandal'], ['M63_cqb_A', 'M63_cqb_B', 'M63_cqb_C', 'M63_cqb_D']],
  [['Specter', 'Jester', 'Wardog', 'Vandal'], ['desert_A71', 'desert_B71', 'desert_C71', 'desert_D71']],
  [['Specter', 'Jester', 'Wardog', 'Vandal'], ['desert_A72', 'desert_B72', 'desert_C72', 'desert_D72']],
  [['Specter', 'Jester', 'Wardog', 'Vandal'], ['desert_A73', 'desert_B73', 'desert_C73', 'desert_D73']],
  [['Specter', 'Jester', 'Polaris', 'Bludshot'], ['arctic_A81', 'arctic_B81', 'arctic_C81', 'arctic_D81']],
  [['Specter', 'Jester', 'Polaris', 'Bludshot'], ['arctic_A82', 'arctic_B82', 'arctic_C82', 'arctic_D82']],
  [['Specter', 'Jester', 'Wardog', 'Vandal'], ['scuba_A83', 'scuba_B83', 'scuba_C83', 'scuba_D83']],
] as const;
const CAMPAIGN_IDENTITIES: Record<string, string> = {};
for (const [names, definitions] of CAMPAIGN_IDENTITIES_PLACEHOLDER) definitions.forEach((definition, i) => { CAMPAIGN_IDENTITIES[definition.toLowerCase()] = names[i]!; });

/** The named characters by definition (donor catalogue). A placeholder: named placeholders (the area (c) review's finding 7: literal tables from an unpublished donor snapshot, no `FUN_`/`D:L` or disc field); research 364 §8 and 101 list each with the reading that would settle it. */
export const NAMED_DEFINITIONS_PLACEHOLDER: Record<string, string> = {
  albanian_rugova: 'Rugova', albanian_castrioti: 'Castrioti', albanian_pius: 'Pius',
  brazilian_lucimar: 'Lucimar', m63_quixada: 'Quixada', russian_arjan: 'Arjan', russian_valeska: 'Valeska', seal_marcela: 'Marcela',
};
/** A terrorist family's region by its definition-name suffix (donor catalogue). A placeholder: named placeholders (BOTS-LAND's area (c) narrow check, finding 5: the donor snapshot's literal tables); research 364 §8 and 101 list each with the reading that would settle it. */
export const FAMILY_REGION_PLACEHOLDER: Record<string, CharacterRegion> = { alb: 'albania', bra: 'brazil', alg: 'algeria', rus: 'russia', thai: 'thai', euro: 'europe' };
/** A campaign mission's region by its number's first digit (donor catalogue). A placeholder: named placeholders (BOTS-LAND's area (c) narrow check, finding 5: the donor snapshot's literal tables); research 364 §8 and 101 list each with the reading that would settle it. */
export const MISSION_REGION_PLACEHOLDER: Readonly<Record<string, CharacterRegion>> = { 5: 'albania', 6: 'brazil', 7: 'algeria', 8: 'russia' };
/** Campaign mission regions from mission.rdr/ExtraStringTables and the verified mission roster, donor catalogue; research 364. */
function missionRegion(character: string): CharacterRegion | null {
  const mission = /^M(\d{2})_/i.exec(character)?.[1] ?? /(\d{2})$/.exec(character)?.[1];
  return mission ? MISSION_REGION_PLACEHOLDER[mission[0]!] ?? null : null;
}

/** The canonical identity a character's base chain names (donor catalogue). A placeholder: named placeholders (the area (c) review's finding 7: literal tables from an unpublished donor snapshot, no `FUN_`/`D:L` or disc field); research 364 §8 and 101 list each with the reading that would settle it. */
export const CANONICAL_CHAINS_PLACEHOLDER: readonly (readonly [string, string])[] = [
  ['able1', 'Specter'], ['able2', 'Jester'], ['SAS_A', 'Sabre'], ['SAS_B', 'Reaver'], ['rus_spets01', 'Polaris'], ['rus_spets02', 'Bludshot'],
];

export function characterChain(table: CharacterTable, name: string): string[] {
  const out: string[] = [];
  while (!out.includes(name) && out.length < 32) {
    out.push(name); const base = table.characters.get(name)?.base;
    if (!base) break; name = base;
  }
  return out;
}
function uniformOf(model: string): string {
  if (model === 'SAS_01') return 'SAS';
  if (model === 'Spetsnaz') return 'Spetsnaz';
  if (model === 'rus_specialist') return 'Specialist';
  if (/scuba/i.test(model)) return 'Scuba';
  if (/arc|cold/i.test(model)) return 'Arctic';
  if (/des/i.test(model)) return 'Desert';
  if (/woodland/i.test(model)) return 'Woodland';
  if (/tiger/i.test(model)) return 'Tiger';
  if (/cqb/i.test(model)) return 'CQB';
  return 'Jungle';
}
function regionOf(table: CharacterTable, character: string): CharacterRegion | null {
  for (const item of characterChain(table, character)) {
    const family = /^mp_terror\d+_(alb|bra|alg|rus|euro|thai)$/.exec(item)?.[1] ?? /^guard_(alb|bra|alg|rus)$/.exec(item)?.[1];
    if (family) return FAMILY_REGION_PLACEHOLDER[family]!;
    for (const [prefix, region] of [['albanian_', 'albania'], ['brazilian_', 'brazil'], ['algerian_', 'algeria'], ['russian_', 'russia']] as const) {
      if (item.startsWith(prefix)) return region;
    }
  }
  return null;
}
function canonicalOf(table: CharacterTable, character: string): string | null {
  // A mission leaf can override the base's actor: jungle_C62 is Wardog despite sharing Able's mesh/definition.
  const mission = CAMPAIGN_IDENTITIES[character.toLowerCase()];
  if (mission) return mission;
  for (const c of characterChain(table, character)) {
    const named = NAMED_DEFINITIONS_PLACEHOLDER[c.toLowerCase()]; if (named) return named;
  }
  // MP regional definitions replace their base's model. A uniquely named character model links them back to
  // that character definition; mission-only aliases such as Quixada's generic leader mesh cannot establish this.
  if (character.startsWith('mp')) for (const [definition, name] of Object.entries(NAMED_DEFINITIONS_PLACEHOLDER)) {
    if (definition.startsWith('m63_')) continue;
    const actual = [...table.characters.keys()].find((c) => c.toLowerCase() === definition);
    if (actual && table.model(actual) === table.model(character)) return name;
  }
  const chain = characterChain(table, character);
  for (const [base, name] of CANONICAL_CHAINS_PLACEHOLDER) if (chain.includes(base)) return name;
  return null; // In particular scuba_C -> seal_D_scuba has no established separate canonical identity.
}

/** The SEAL team every map's catalogue offers first (donor catalogue). A placeholder: named placeholders (BOTS-LAND's area (c) narrow check, finding 5: the donor snapshot's literal tables); research 364 §8 and 101 list each with the reading that would settle it. */
export const CAMPAIGN_SEALS_PLACEHOLDER = ['Specter', 'Jester', 'Wardog', 'Vandal'] as const;
/** The SEAL pair a region adds outside Frostfire (donor catalogue; `other` for the rest). A placeholder: named placeholders (BOTS-LAND's area (c) narrow check, finding 5: the donor snapshot's literal tables); research 364 §8 and 101 list each with the reading that would settle it. */
export const REGION_SEALS_PLACEHOLDER: Readonly<Record<string, readonly string[]>> = { russia: ['Polaris', 'Bludshot'], brazil: ['Marcela'], other: ['Sabre', 'Reaver'] };

/** Frostfire's (MP2) authored roster: its custom SEALs and their uniforms, its terrorists' models (donor catalogue). A
 * placeholder: named placeholders (the area (c) review's finding 7: literal tables from an unpublished donor snapshot, no `FUN_`/`D:L` or disc field); research 364 §8 and 101 list each with the reading that would settle it. */
export const MP2_ROSTER_PLACEHOLDER = {
  anchor: ['Anchor', 'seal_D_scuba'] as const,
  operatives: [['Rook', 'Spetsnaz'], ['Flint', 'rus_specialist'], ['Slate', 'seal_B_scuba']] as const,
  terroristModels: ['al_gman01', 'al_gman02', 'al_leader', 'al_captain', 'rus_snowter01', 'rus_snowter02', 'rus_snowter03', 'rus_ter01'] as const,
};

/** A choice's role by its definition and model names (donor catalogue). A placeholder: named placeholders (the area (c) review's finding 7: literal tables from an unpublished donor snapshot, no `FUN_`/`D:L` or disc field); research 364 §8 and 101 list each with the reading that would settle it. */
export const CHARACTER_ROLES_PLACEHOLDER = { officer: /officer|captain/i, leader: /leader|castrioti|rugova|pius|arjan|valeska|quixada/i } as const;

/** A per-map catalogue built from character definitions and available mesh libraries, never MP slot identities. */
export function buildCharacterCatalogue(table: CharacterTable, inventory: CharacterInventory, map: string): CharacterCatalogue {
  const stem = map.toUpperCase();
  const firstEnemy = [...table.characters.keys()].find((c) => c.toLowerCase() === `${stem.toLowerCase()}_terror1`);
  const region = firstEnemy ? regionOf(table, firstEnemy) ?? 'russia' : 'russia';
  const firstSeal = table.model(`${stem.toLowerCase()}_seal1`);
  const uniform = uniformOf(firstSeal ?? 'seal_A_scuba');
  const choices: CharacterChoice[] = [];
  const usedVariants = new Set<string>();
  const customCounts: Record<Team, number> = { seal: 0, terrorist: 0 };
  const available = (model: string, definition: string) => {
    const mission = /(?:_|[A-D])(51|52|53|61|62|63|71|72|73|81|82|83)$/i.exec(definition)?.[1];
    return inventory.libraries.find((l) => l.archive === `M${mission}` && l.models.includes(model))
      ?? inventory.libraries.find((l) => l.models.includes(model));
  };
  const definitions = [...table.characters.keys()];
  const escortModels = new Set<string>(), multiplayerCombatModels = new Set<string>();
  for (const definition of definitions) {
    const model = table.model(definition); if (!model) continue;
    const chain = characterChain(table, definition);
    if (chain.some((c) => ['hostage', 'hostage2', 'mp_hostage_extract', 'mp_hostage_escort'].includes(c))) escortModels.add(model);
    if (chain.includes('mp_seal') || chain.includes('mp_terror')) multiplayerCombatModels.add(model);
  }
  // Give mission-specific canonical definitions priority when two inherited records describe the same outfit.
  definitions.sort((a, b) => Number(b.toLowerCase() in CAMPAIGN_IDENTITIES) - Number(a.toLowerCase() in CAMPAIGN_IDENTITIES));
  for (const character of definitions) {
    const model = table.model(character); if (!model) continue;
    const library = available(model, character); if (!library) continue;
    const chain = characterChain(table, character);
    const seal = chain.includes('basic_seal') || chain.includes('mp_seal') || character === 'seal_Marcela';
    const team: Team = seal ? 'seal' : 'terrorist';
    const ownRegion = regionOf(table, character);
    if (!seal && ownRegion !== region) continue;
    // Regional guard inheritance alone does not establish hostility: MP's escortees also use alg_UN01/02.
    // Keep appearances explicitly promoted to a combatant (the specialist, butcher and other unlockables).
    if (escortModels.has(model) && !multiplayerCombatModels.has(model)) continue;
    // Civilian/hostage models enter only when the actual MP roster explicitly promotes that appearance.
    if (!seal && chain.some((c) => c === 'hostage' || c === 'hostage2') && !character.startsWith('mp')) continue;
    const canonical = canonicalOf(table, character);
    const outfit = uniformOf(model);
    if (seal) {
      if (['Spetsnaz', 'rus_specialist'].includes(model) && region !== 'russia') continue;
      if (model === 'SAS_01' && region !== 'albania' && region !== 'algeria') continue;
      if (canonical === 'Marcela' && region !== 'brazil') continue;
      if ((canonical === 'Polaris' || canonical === 'Bludshot') && region !== 'russia') continue;
      if ((canonical === 'Sabre' || canonical === 'Reaver') && region !== 'albania' && region !== 'algeria') continue;
      if (!['SAS_01', 'Spetsnaz', 'rus_specialist', 'seal_Marcela'].includes(model)
        && outfit !== uniform && !(uniform === 'Jungle' && ['Tiger', 'Woodland'].includes(outfit))
        && !(region === 'albania' && ['Woodland', 'Tiger', 'CQB'].includes(outfit))
        && !(region === 'brazil' && ['Tiger', 'CQB'].includes(outfit))) continue;
    }
    const variant = `${team}|${canonical ?? 'custom'}|${model}`;
    if (usedVariants.has(variant)) continue;
    usedVariants.add(variant);
    const pool = seal ? CUSTOM_IDENTITIES_PLACEHOLDER.seal : CUSTOM_IDENTITIES_PLACEHOLDER[region];
    const at = customCounts[team];
    const name = canonical ?? `${pool[at % pool.length]}${at >= pool.length ? ` ${Math.floor(at / pool.length) + 1}` : ''}`;
    if (!canonical) customCounts[team]++;
    choices.push({ key: `${team}:${character}`, identity: canonical ? `canonical:${canonical.toLowerCase()}` : `custom:${team}:${region}:${name.toLowerCase()}`,
      name, canonical: canonical !== null, team, region, character, model, library: library.archive, uniform: outfit,
      role: CHARACTER_ROLES_PLACEHOLDER.officer.test(character + model) ? 'Officer' : CHARACTER_ROLES_PLACEHOLDER.leader.test(character + model) ? 'Leader' : seal ? 'Operator' : 'Fighter' });
  }
  // A model has one standard source outfit. Archive-local equipment copies do not create extra bot looks.
  const outfits = new Map<string, { character: string; library: string }>();
  for (const choice of choices) {
    if (!outfits.has(choice.model)) outfits.set(choice.model, { character: choice.character, library: choice.library });
  }
  const standardModel = (model: string): string => {
    // Donor catalogue: lower-detail copies belong to the same character. Prefer its full mesh when available.
    const full = model.replace(/_LO$/i, '').replace(/^seal_([ABC])_desert$/, 'seal_$1_des');
    return outfits.has(full) ? full : model;
  };
  for (const choice of choices) {
    choice.model = standardModel(choice.model);
    choice.outfit = outfits.get(choice.model)!;
  }
  const pool: Record<Team, string[]> = { seal: [], terrorist: [] };
  const select = (team: Team, name: string, model?: string): void => {
    const options = choices.filter((a) => a.team === team && (a.name === name || (!a.canonical && model && a.model === model)));
    const matching = options.filter((a) => !model || a.model === model);
    const choice = matching.find((a) => a.uniform === uniform && missionRegion(a.character) === region)
      ?? matching.find((a) => a.uniform === uniform) ?? matching[0] ?? options[0];
    if (!choice) return;
    if (!choice.canonical && choice.name !== name) { choice.name = name; choice.identity = `custom:${team}:${region}:${name.toLowerCase()}`; }
    if (!pool[team].some((key) => choices.find((a) => a.key === key)?.identity === choice.identity)) pool[team].push(choice.key);
  };
  for (const name of CAMPAIGN_SEALS_PLACEHOLDER) select('seal', name);
  if (stem === 'MP2') {
    select('seal', ...MP2_ROSTER_PLACEHOLDER.anchor);
    for (const [name, model] of MP2_ROSTER_PLACEHOLDER.operatives) {
      // The custom operative can reuse a canonical operator's generic uniform, without becoming that identity.
      const base = choices.find((a) => a.team === 'seal' && a.model === model);
      if (base) { const copy = { ...base, key: `custom:${name}`, identity: `custom:seal:${region}:${name.toLowerCase()}`, name, canonical: false }; choices.push(copy); pool.seal.push(copy.key); }
    }
    MP2_ROSTER_PLACEHOLDER.terroristModels.forEach((model, i) => select('terrorist', CUSTOM_IDENTITIES_PLACEHOLDER.russia[i]!, model));
  } else {
    for (const name of REGION_SEALS_PLACEHOLDER[region] ?? REGION_SEALS_PLACEHOLDER.other!) select('seal', name);
    for (const team of ['seal', 'terrorist'] as const) {
      while (pool[team].length < 8) {
        const selected = pool[team].map((key) => choices.find((a) => a.key === key)!);
        const uses = (model: string): number => selected.filter((s) => s.model === model).length;
        const least = Math.min(...choices.filter((a) => a.team === team).map((a) => uses(a.model)));
        const eligible = choices.filter((a) => a.team === team && uses(a.model) === least && !selected.some((s) => s.identity === a.identity));
        eligible.sort((a, b) => selected.filter((s) => s.model === a.model).length - selected.filter((s) => s.model === b.model).length);
        if (!eligible.length) break;
        pool[team].push(eligible[0]!.key);
      }
    }
  }
  // A small regional roster can reuse outfits for additional named custom operatives, never duplicate canonical people.
  for (const team of ['seal', 'terrorist'] as const) for (const name of team === 'seal' ? CUSTOM_IDENTITIES_PLACEHOLDER.seal : CUSTOM_IDENTITIES_PLACEHOLDER[region]) {
    if (pool[team].length >= 8) break;
    if (choices.some((a) => pool[team].includes(a.key) && a.name === name)) continue;
    const selected = pool[team].map((key) => choices.find((a) => a.key === key)!);
    const base = choices.filter((a) => a.team === team).sort((a, b) => selected.filter((s) => s.model === a.model).length - selected.filter((s) => s.model === b.model).length)[0];
    if (!base) break;
    const copy = { ...base, key: `custom:${team}:${name}`, identity: `custom:${team}:${region}:${name.toLowerCase()}`, name, canonical: false };
    choices.push(copy); pool[team].push(copy.key);
  }
  return { region, uniform, choices, pool, playerModels: { ...(firstSeal ? { seal: standardModel(firstSeal) } : {}), ...(firstEnemy && table.model(firstEnemy) ? { terrorist: standardModel(table.model(firstEnemy)!) } : {}) } };
}

/** FBA.R10: actual regional characters plus native MP skins form one random, appearance-deduplicated priority pool. */
export function chooseBotCharacter(catalogue: CharacterCatalogue, team: Team, used: ReadonlySet<string>,
  random: () => number = Math.random,
  usedModels: ReadonlySet<string> = new Set(catalogue.choices.filter((c) => used.has(c.identity)).map((c) => c.model))): CharacterChoice | null {
  const preferred = new Set(catalogue.pool[team]);
  const native = new Set(catalogue.multiplayerModels?.[team] ?? []);
  const identities = new Map<string, CharacterChoice>();
  const rank = (v: CharacterChoice): number => Number(preferred.has(v.key)) * 2 + Number(v.uniform === catalogue.uniform);
  for (const c of catalogue.choices) {
    if (c.team !== team || used.has(c.identity)) continue;
    const previous = identities.get(c.identity);
    if (!previous || rank(c) > rank(previous)) identities.set(c.identity, c);
  }
  const candidates = [...identities.values()];
  const groups = new Map<string, CharacterChoice[]>();
  for (const c of candidates) {
    if ((!c.canonical && !native.has(c.model)) || usedModels.has(c.model)) continue;
    const same = groups.get(c.model) ?? [];
    same.push(c); groups.set(c.model, same);
  }
  const draw = <T>(choices: T[]): T | null => choices.length
    ? choices[Math.min(choices.length - 1, Math.max(0, Math.floor(random() * choices.length)))]! : null;
  if (groups.size) {
    const group = draw([...groups.values()])!;
    // A native skin already represents a real person only once; do not add a custom alias of that same appearance.
    const actual = group.filter((c) => c.canonical);
    const options = actual.length ? actual : group.filter((c) => rank(c) === Math.max(...group.map(rank)));
    return draw(options);
  }
  // Only after every unique priority appearance has had a place may another identity reuse its outfit.
  const actual = candidates.filter((c) => c.canonical);
  return draw(actual.length ? actual : candidates.filter((c) => preferred.has(c.key)));
}
