import { beforeAll, describe, expect, it } from 'vitest';
import { parseRdr, rdrGet, Zar, type RdrNode } from '@s2u/archive';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { DEATH_LISTS, deathClip, FLINCH_LISTS } from '../src/net/deaths';
import { PART } from '../src/net/damage';
import type { Stance } from '../src/mover';

/**
 * CROUCH-BODY-LIST (v0.4.21; simulation track, a reading): every death and flinch list of viewer `net/deaths.ts` against
 * the disc's own `damanim.rdr` (`RUN/READERC.ZAR`), parsed by the port's reader, entry for entry and in order. Until
 * this pin only BODY STAND was held against the file (`remoteDeath.test.ts`); the rest were research 91's transcription,
 * and BODY CROUCH had lost `Death crouch chest01` (the original drew 141 `death_crouch_chest01` for a crouch-running
 * BODY kill, LATER 980's rig read; research 421 s6's numbering).
 *
 * The names to clips, as `deaths.ts` documents them. The deaths: snake-cased (`MOTION_P.ZAR`'s names), but for the four
 * with no clip of their own name, which resolve through `animset.rdr`'s `GLOBAL` set (research 179 s11.2, research 217
 * s4) -- the four are checked against GLOBAL here. The flinches: through `animset.rdr`'s `Seal anim set` and the sets it
 * includes (`Flinch right arm` -> `seal_flinch_rarm`, `Hit shoulder` -> `guard_hit_shoulder`); the port has no mapping
 * function of its own in `src`, so the test reads the anim set off the disc as `remoteDeath.test.ts` does, never a
 * retyped table.
 */

const READERC_ZAR = fixture('RUN/READERC.ZAR');
const STANCES: readonly Stance[] = ['stand', 'crouch', 'prone'];
const STANCE_KEY: Readonly<Record<Stance, string>> = { stand: 'STAND', crouch: 'CROUCH', prone: 'PRONE' };

/** The four GLOBAL aliases `deaths.ts` names (its header comment). */
const DEATH_ALIASES: Readonly<Record<string, string>> = {
  'Die': 'death_stand_chest01', 'Death02': 'death_stand_chest02',
  'Crawl death01': 'death_stand_groin02', 'Crawl death02': 'death_stand_groin01',
};

/** A single-child wrapper's content (the reader keeps one-element lists as lists). */
const unwrap = (n: RdrNode): RdrNode => (Array.isArray(n) && n.length === 1 && Array.isArray(n[0]) ? unwrap(n[0]) : n);

/** A list's entries: `rdrGet` hands a one-entry list back as the entry itself (its first element a key). */
const entriesOf = (list: RdrNode | undefined): RdrNode[] => {
  if (list === undefined) return [];
  const n = unwrap(list);
  if (typeof n === 'string') return [n];
  return typeof n[0] === 'string' ? [n] : n;
};

/** An entry's display name (`NAME`), or the entry itself when the list holds bare strings. */
const nameOf = (e: RdrNode): string => (typeof e === 'string' ? e : String(rdrGet(e, 'NAME')));

/** The top-level keys of a parsed `.rdr`: each string followed by its value's list. */
const keysOf = (root: RdrNode): string[] => {
  const n = unwrap(root);
  if (typeof n === 'string') return [];
  const out: string[] = [];
  for (let i = 0; i + 1 < n.length; i++) if (typeof n[i] === 'string' && Array.isArray(n[i + 1])) out.push(n[i] as string);
  return out;
};

/** Every string under a node, in order (an anim set's `include`, one name or several). */
const stringsOf = (n: RdrNode | undefined): string[] => (n === undefined ? [] : typeof n === 'string' ? [n] : n.flatMap(stringsOf));

describe.skipIf(!READERC_ZAR)(`deaths.ts's lists are damanim.rdr's, entry for entry${READERC_ZAR ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  // Read in a hook, never at collection: the factory runs on a host without the disc too (BL-7, skipIfFactories).
  let damanim: RdrNode = [];
  let sets: RdrNode[] = [];
  beforeAll(() => {
    const zar = Zar.parse(READERC_ZAR!);
    damanim = parseRdr(zar.data(zar.find('damanim.rdr')!));
    sets = unwrap(parseRdr(zar.data(zar.find('animset.rdr')!))) as RdrNode[];
  });
  const setByName = (name: string): RdrNode | undefined => sets.find((s) => rdrGet(s, 'anim_set_name') === name);
  /** A type name's clip in an anim set, its own rows first, then each include in order (as `deathPoses.test.ts`). */
  const clipIn = (setName: string, type: string, seen: Set<string> = new Set()): string | null => {
    const set = setByName(setName);
    if (!set || seen.has(setName)) return null;
    seen.add(setName);
    for (const a of entriesOf(rdrGet(set, 'anim_set_anims'))) {
      if (typeof a !== 'string' && rdrGet(a, 'type_name') === type) {
        const clip = rdrGet(a, 'anim_name');
        if (typeof clip === 'string') return clip;
      }
    }
    for (const i of stringsOf(rdrGet(set, 'include'))) {
      const c = clipIn(i, type, seen);
      if (c) return c;
    }
    return null;
  };
  const snake = (name: string): string => name.toLowerCase().replace(/ /g, '_');
  const deathName = (name: string): string => DEATH_ALIASES[name] ?? snake(name);
  const flinchName = (name: string): string => clipIn('Seal anim set', name) ?? snake(name);
  const names = (key: string, stance: Stance): string[] => {
    const table = rdrGet(damanim, key);
    return table === undefined ? [] : entriesOf(rdrGet(table, STANCE_KEY[stance])).map(nameOf);
  };

  it('reads the file: its lists, printed (REPORT), and the four GLOBAL aliases deaths.ts names', () => {
    const keys = keysOf(damanim);
    console.log(`REPORT CBL damanim.rdr keys: ${keys.join(', ')}`);
    for (const key of keys) for (const s of STANCES) console.log(`REPORT CBL ${key} ${STANCE_KEY[s]}: ${names(key, s).join(' | ')}`);
    for (const [name, clip] of Object.entries(DEATH_ALIASES)) expect(clipIn('GLOBAL', name), name).toBe(clip);
    expect(keys).toContain('BODY_DEATH_ANIMATIONS');
  });

  const DEATHS = (['HEAD', 'BODY', 'TEAMMATE_HEAD', 'TEAMMATE_BODY'] as const).flatMap((family) => STANCES.map((stance) => ({ family, stance })));
  it.each(DEATHS)('$family $stance: deaths.ts holds the disc\'s list', ({ family, stance }) => {
    const want = names(`${family}_DEATH_ANIMATIONS`, stance).map(deathName);
    expect(want.length, `${family}_DEATH_ANIMATIONS ${STANCE_KEY[stance]} on the disc`).toBeGreaterThan(0);
    expect(DEATH_LISTS[family][stance]).toEqual(want);
    // and deathClip draws it, each entry at its share of the draw (`pick`, `FUN_005a0950` rand() % count)
    if (family === 'HEAD' || family === 'BODY') {
      const part = family === 'HEAD' ? PART.HEAD : PART.BODY;
      expect(want.map((_, i) => deathClip('bullet', part, stance, () => (i + 0.5) / want.length))).toEqual(want);
    } else {
      expect(want.map((_, i) => deathClip('bullet', PART.BODY, stance, () => (i + 0.5) / want.length, 'teammate'))).toEqual(want);
    }
  });

  /** `PART` order, the table at 0x44d230 (`FUN_005a0270` L458783-458785); the file's key for each, the first found. */
  const FLINCH_KEYS: readonly (readonly string[])[] = [
    ['HEAD'], ['RARM', 'RIGHT_ARM', 'R_ARM'], ['LARM', 'LEFT_ARM', 'L_ARM'], ['BODY'], ['RLEG', 'RIGHT_LEG', 'R_LEG'], ['LLEG', 'LEFT_LEG', 'L_LEG'],
  ];
  const FLINCHES = Object.entries(PART).flatMap(([label, part]) => STANCES.map((stance) => ({ label, part, stance })));
  it.each(FLINCHES)('$label $stance flinch: deaths.ts holds the disc\'s list', ({ label, part, stance }) => {
    const keys = keysOf(damanim);
    const key = FLINCH_KEYS[part]!.map((k) => `${k}_FLINCH_ANIMATIONS`).find((k) => keys.includes(k));
    expect(key, `${label}'s flinch list in ${keys.join(', ')}`).toBeDefined();
    const want = names(key!, stance).map(flinchName);
    expect(want.length, `${key} ${STANCE_KEY[stance]} on the disc`).toBeGreaterThan(0);
    expect(FLINCH_LISTS[part]![stance]).toEqual(want);
  });
});
