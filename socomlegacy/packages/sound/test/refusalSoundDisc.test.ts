import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RdrNode } from '@s2u/archive';
import { parseSoundScript, soundHash, type SoundSet } from '../src/script';
import { soundRdrFind, soundScriptRoot, UI_REFUSAL_SOUND, UiSoundTable } from '../src/uiSounds';

/**
 * The code's refusal cue is silent in a match as in the menus (web research 122 R122.10 and section 8; research 81
 * section 3; research 94 section 4.6; research 201). `FUN_003419c0` (D:L241460-241467) plays only while
 * `DAT_0048dd90` is non-null, and `DAT_0048dd90` is set after every block load (D:L242747) to `FUN_00344f30`'s lookup
 * of the literal at ELF 0x3f7858, `SND_NEG`. The lookup's table holds the `SETS` entries of the blocks a map loads and
 * the `GROUPS` it loads, all out of `sounds.rdr`; so when no `SETS` entry of any block and no group of any `GROUPS`
 * set carries `SND_NEG`'s hash, the lookup is null whatever a map loads, and every caller -- the shoulder press
 * `FUN_00594cf0` (D:L453295, D:L453307) and the inventory menu (`FUN_0021bda0`, `FUN_0021c6f0`) -- plays nothing.
 * The front end's table alone is `uiSoundsDisc.test.ts`'s; this is the whole script. Names, hashes and counts only
 * (RS.R8). The disc is `SOCOM_DISC`, else `<SOCOM_PC_ROOT>/game/disc`; without either every test skips.
 */
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const HAVE = DISC !== '' && existsSync(join(DISC, 'RUN/SOUNDRDR.ZAR'));

let cache: { root: RdrNode; sets: Map<string, SoundSet>; groups: Map<string, string[]> } | null = null;
function script(): NonNullable<typeof cache> {
  if (cache) return cache;
  const root = soundScriptRoot(new Uint8Array(readFileSync(join(DISC, 'RUN/SOUNDRDR.ZAR'))));
  const groups = new Map<string, string[]>();
  const all = soundRdrFind(root, 'GROUPS');
  if (!Array.isArray(all)) throw new Error('sounds.rdr has no GROUPS');
  for (let i = 0; i + 1 < all.length; i += 2) {
    const name = all[i], list = all[i + 1];
    if (typeof name !== 'string' || !Array.isArray(list)) continue;
    groups.set(name, list.flatMap((g) => (Array.isArray(g) && typeof g[0] === 'string' && g[0] !== '' ? [g[0]] : [])));
  }
  cache = { root, sets: parseSoundScript(root), groups };
  return cache;
}
/** Every string of the decoded tree, depth-first. */
function* strings(node: RdrNode): Generator<string> {
  if (typeof node === 'string') { yield node; return; }
  if (Array.isArray(node)) for (const c of node) yield* strings(c);
}
/** In how many `SETS` blocks an entry carries the name's hash. */
const blocksWith = (sets: Map<string, SoundSet>, name: string): number => [...sets.values()].filter((s) => s.has(soundHash(name))).length;

describe.skipIf(!HAVE)('SND_NEG, the code\'s refusal cue, in the whole of sounds.rdr on the dev disc (SOCOM_DISC; R122.10)', () => {
  it('the cue is SND_NEG, CRC-32 2611767692 (signed -1683199604) by FUN_003a2370', () => {
    expect(UI_REFUSAL_SOUND).toBe('SND_NEG');
    expect(soundHash(UI_REFUSAL_SOUND)).toBe(-1683199604);
  });

  it('the scan sees what is there: 128 SETS blocks, 11 GROUPS sets; .STEP_STONE, .M4A1_SIL, .NEG and .DINK found', () => {
    const { sets, groups } = script();
    expect(sets.size).toBe(128);
    expect(groups.size).toBe(11);
    expect(blocksWith(sets, '.STEP_STONE')).toBe(33);
    expect(blocksWith(sets, '.M4A1_SIL')).toBe(34);
    expect(blocksWith(sets, '.NEG')).toBe(1);
    expect(blocksWith(sets, '.DINK')).toBe(1);
  }, 60_000);

  it('no SETS entry of any block carries SND_NEG\'s hash, and no group of any GROUPS set is named by it', () => {
    const { sets, groups } = script();
    expect(blocksWith(sets, UI_REFUSAL_SOUND)).toBe(0);
    const named = [...groups.entries()].flatMap(([set, gs]) => gs.filter((g) => soundHash(g) === soundHash(UI_REFUSAL_SOUND)).map((g) => `${set}/${g}`));
    expect(named).toEqual([]);
  }, 60_000);

  it('the text SND_NEG is nowhere in the decoded script', () => {
    const { root } = script();
    let n = 0, hit = 0;
    for (const s of strings(root)) { n++; if (s === UI_REFUSAL_SOUND) hit++; }
    expect(n).toBeGreaterThan(20_000);
    expect(hit).toBe(0);
  }, 60_000);

  it('FUN_00344f30 over a table of every block and every GROUPS set: SND_NEG is null, the controls are not', () => {
    const { root, sets, groups } = script();
    const table = new UiSoundTable();
    for (const block of sets.keys()) table.loadBlock(root, block, null);
    for (const set of groups.keys()) table.loadGroups(root, set);
    expect(table.lookup(UI_REFUSAL_SOUND)).toBeNull();
    for (const name of ['.STEP_STONE', '.M4A1_SIL', '.NEG', '.DINK']) expect(table.lookup(name), name).not.toBeNull();
  }, 60_000);
});
