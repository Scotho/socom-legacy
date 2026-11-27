import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FsAssetSource } from '@s2u/archive/node';
import { describe, expect, it } from 'vitest';
import { PLAY_CLIPS } from '../src/animator';
import { playFromDisc, playTransferables, MOTION_PACK_PATH, MOTION_TABLE_PATH } from '../src/motionTable';
import { prototypeAnimationClips } from '../src/xboxPrototype/animationAssets';

const fixtures = resolve(process.env.S2U_TEST_FIXTURES || resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures'));
const missingDisc = ![MOTION_PACK_PATH, MOTION_TABLE_PATH].every(path => existsSync(resolve(fixtures, path)));

describe('Xbox animation asset requests', () => {
  it('keeps the fixed renderer comparison on its existing movement workload', () => {
    expect(prototypeAnimationClips(false)).toEqual(PLAY_CLIPS);
  });

  describe.skipIf(missingDisc)(`match clips from the disc${missingDisc ? ' (motion fixtures absent)' : ''}`, () => {
    it('supplies real keys and playback rows for match actions rather than falling back to missing clips', async () => {
      const requested = prototypeAnimationClips(true);
      const play = await playFromDisc(new FsAssetSource(fixtures), requested);
      expect(play).not.toBeNull();
      const clips = new Map(play!.clips.map(clip => [clip.name, clip]));
      const table = new Map(play!.table!);
      // Names from the existing controllers' disc readings: weaponPose/reloadClip, traversal,
      // throwPose, net/deaths, doors, binocularPose and net/emplacement. Loading these does
      // not claim their controllers are all mounted or their rendered behavior is complete.
      for (const name of ['seal_fp_stand', 'seal_reload', 'seal_prone_reload', 'seal_ladderslide',
        'seal_throwgrenade', 'seal_place_claymore', 'death_stand_chest01', 'seal_flinch_rarm',
        'seal_open_door', 'seal_p_kickopendoor', 'seal_stand2binocular', 'seal_stand2turret']) {
        expect(clips.get(name)?.frameCount, `${name}: decoded keys`).toBeGreaterThan(0);
        expect(table.get(name)?.playback, `${name}: motion.rdr playback`).toBeGreaterThan(0);
      }
      expect(new Set(requested).size).toBe(requested.length);
      // Shared packs also request optional layer names which are absent from the disc.
      // The loader retains its existing missing-name behavior; required actions above
      // must have actual decoded clips, not merely a name in the request.
      expect(clips.size).toBe(play!.clips.length);
      expect([...clips.keys()].every(name => requested.includes(name))).toBe(true);
      const buffers = playTransferables(play!) as ArrayBuffer[];
      expect(new Set(buffers).size).toBe(buffers.length);
      expect(buffers.reduce((bytes, buffer) => bytes + buffer.byteLength, 0)).toBeGreaterThan(0);
    });
  });
});
