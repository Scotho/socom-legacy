import { describe, expect, it } from 'vitest';
import type { RdrNode } from '@s2u/archive';
import { missionSoundBlocks, parseStreamEntries, soundHash, streamFile, streamFor } from '../src/script';

/**
 * A script name to the VAGSTORE member it streams (research 124 §3): the name's CRC-32 (`FUN_003a2370`) found among the
 * loaded blocks' `SETS` entries (`FUN_00344f30`, research 122 R122.1), and an entry with `ST` streams its `N1` -- as
 * `"%s.VPK"` when the entry is of the `MUS` class, else `"%s.VAG"` (`FUN_00342240` D:L241826-241832). The tree below is
 * synthetic, shaped as `parseRdr` gives the disc's (`["-1226827027", "ST", ["N1", ["MUMP0004"]], "MUS", []]`).
 */
const entry = (name: string, ...rest: RdrNode[]): RdrNode => [String(soundHash(name)), ...rest];
const ROOT: RdrNode = ['SETS', [
  'MP9_AM', [entry('.STEP_STONE', 'ONESHOT', [])],
  'SMUS', [
    entry('MUS_MP_SEAL_INTRO_4', 'ST', ['N1', ['MUMP0004']], 'MUS', []),
    entry('MUS_MENU_THEME', 'ST', ['N1', ['MUMN0001'], 'LOOP', []], 'MUS', []),
  ],
  'MULTI', [entry('^PH_0014', 'ST', ['N1', ['PH_0014']]), entry('^PH_0002', 'ST', ['N1', ['PH_0002']])],
  'M51_VC', [entry('^PH_0014', 'ST', ['N1', ['NOT_THIS_ONE']])],
]];

describe('the stream a name plays (research 124 §3)', () => {
  const entries = parseStreamEntries(ROOT);

  it('reads every ST entry of every block, its N1, its class and its loop', () => {
    expect(entries.get('SMUS')?.get(soundHash('MUS_MP_SEAL_INTRO_4'))).toEqual({
      hash: soundHash('MUS_MP_SEAL_INTRO_4'), block: 'SMUS', n1: 'MUMP0004', music: true, loop: false, efx: false,
    });
    expect(entries.get('SMUS')?.get(soundHash('MUS_MENU_THEME'))?.loop).toBe(true);
    expect(entries.get('MULTI')?.get(soundHash('^PH_0014'))?.music).toBe(false);
    expect(entries.has('MP9_AM')).toBe(false);   // no ST entry: a bank sound, not a stream
  });

  it('names the file by the class: MUS a VPK, anything else a VAG', () => {
    expect(streamFile(streamFor(entries, ['SMUS'], 'MUS_MP_SEAL_INTRO_4')!)).toBe('MUMP0004.VPK');
    expect(streamFile(streamFor(entries, ['MULTI'], '^PH_0014')!)).toBe('PH_0014.VAG');
  });

  it('looks only in the blocks loaded, the first that holds the name; a name none holds plays nothing', () => {
    expect(streamFor(entries, ['MULTI', 'M51_VC'], '^PH_0014')?.n1).toBe('PH_0014');
    expect(streamFor(entries, ['SMUS'], '^PH_0014')).toBeNull();
    expect(streamFor(entries, missionSoundBlocks('MP2'), 'MUS_NOT_A_CUE')).toBeNull();
    // The name is hashed as spelt: the sigil is part of it (research 122 §2).
    expect(streamFor(entries, ['MULTI'], 'PH_0014')).toBeNull();
  });

  it('a multiplayer map loads HUDUI, SMUS, TCM_ECHO, its own five and MULTI and HOSTAGE (FUN_00344450)', () => {
    expect(missionSoundBlocks('MP2')).toEqual(['HUDUI', 'SMUS', 'TCM_ECHO', 'MP2_VC', 'MP2_FX', 'MP2_AM', 'MP2_SVO', 'MP2_SMU', 'MULTI', 'HOSTAGE']);
    expect(missionSoundBlocks('mp51')).toContain('MP51_VC');
  });
});
