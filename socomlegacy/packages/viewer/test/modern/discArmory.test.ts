// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { AssetSource } from '@s2u/archive';
import type { ArmoryData } from '../../src/armoryData';
import { DISC_READERS, discAssetsOf, readMissionArmory, type DiscReaders } from '../../src/modern/discAssets';
import { missionData } from '../console/loadout/fixture';

/**
 * MU2-8 (MU2-7's finding, the controller's assignment): a mission's ARMORY is read through the launcher's disc facade
 * (`../../src/modern/discAssets` `readMissionArmory`: the game lobby's `armoryFromDisc` read, once per mission per image,
 * in memory, nothing written). Its reader since CX-LOADOUTS is the console's Armory loadouts (`src/console/adapters/
 * loadouts.ts`, whose own case `test/console/adapters/loadouts.test.ts` "no readMission given" holds that it asks the
 * facade); the retired modern section's two editor cases went with it.
 */
const source: AssetSource = { list: async () => [], read: async (p) => { throw new Error(`no ${p}`); } };

describe('discAssets readMissionArmory', () => {
  it('is the facade\'s, read once per mission (by its key, any case) and shared; a failed read is asked again', async () => {
    let fail = true;
    const missionArmory = vi.fn(async (_s: AssetSource, m: string): Promise<ArmoryData | null> => { if (fail && m === 'MP7') throw new Error('no'); return missionData(m); });
    const readers: DiscReaders = { ...DISC_READERS, missionArmory };
    const a = discAssetsOf(source, readers);
    const [x, y] = await Promise.all([a.readMissionArmory!('MP2'), a.readMissionArmory!('mp2')]);
    expect(x).toBe(y);
    expect(missionArmory.mock.calls.map((c) => c[1])).toEqual(['MP2']);
    await expect(a.readMissionArmory!('MP7')).rejects.toThrow('no');
    fail = false;
    expect(await a.readMissionArmory!('MP7')).not.toBeNull();
    expect(missionArmory.mock.calls.map((c) => c[1])).toEqual(['MP2', 'MP7', 'MP7']);
  });
  it('the default reader is the game lobby\'s read: a mission with no archive answers null without reading', async () => {
    const read = vi.fn(source.read);
    expect(await readMissionArmory({ ...source, read }, 'NOT A MAP')).toBeNull();
    expect(read).not.toHaveBeenCalled();
    expect(DISC_READERS.missionArmory).toBe(readMissionArmory);
  });
});
