import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RenderedSound, StreamVoiceGains } from '@s2u/sound';
import { GameplayAudioSource } from '../../../tools/gameplayAudioSource';
import { selectValidationMaps } from '../../../tools/mapValidation';
import { GameAudio, type AudioOut } from '../src/audio';
import { mountSound, silentOut } from '../src/matchSound';
import type { Team } from '../src/net/protocol';
import { soundFromDisc } from '../src/soundData';

const disc = process.env.SOCOM_DISC;
const haveDisc = !!disc && existsSync(join(disc, 'RUN', 'READERC.ZAR')) && existsSync(join(disc, 'RUN', 'SOUNDS', 'VAGSTORE.ZAR'));

/** Research 304 section 4: chartype.rdr -> character.rdr CMD_MP_GRENADE_THROWN, all four slots.
 * These independently recorded map anchors prevent a valid recording from the wrong map passing the check.
 * Remaining maps are exercised against their own decoded tables, through the real shared sound part and mixer.
 */
const anchors: Record<string, Record<Team, string[]>> = {
  MP2: { seal: ['^PS_0016', '^PS_0094', '^PS_0042', '^PS_0068'], terrorist: ['^PT_0450', '^*PT_0278A', '^PT_0477', '^PT_0477'] },
  MP51: { seal: ['^PS_0016', '^PS_0094', '^PS_0042', '^PS_0120'], terrorist: ['^PT_0115', '^PT_0148', '^PT_0196', '^PT_0175'] },
  MP72: { seal: ['^PS_0016', '^PS_0094', '^PS_0042', '^PS_0146'], terrorist: ['^PT_0331', '^PT_0358', '^PT_0385', '^PT_0413'] },
};

describe.skipIf(!haveDisc)('grenade callouts: map and character through the actual audio output (SOCOM_DISC)', () => {
  it('all 22 maps, both teams, four characters and four playable grenades; map changes cannot reuse the previous voice', async () => {
    const maps = selectValidationMaps(readdirSync(join(disc!, 'RUN')).map((name) => `RUN/${name}`));
    expect(maps).toHaveLength(22);
    const played: { sound: RenderedSound; gains: StreamVoiceGains }[] = [];
    const out: AudioOut = { ...silentOut(), unlocked: true, state: 'running', playStream: (sound, gains) => { played.push({ sound, gains }); } };
    const audio = new GameAudio(out, () => 0.5, { inline: false });
    const seat: { id: number; role: string; team: Team | null } = { id: 1, role: 'player', team: 'seal' };
    let team: Team = 'seal', character = 0;
    const sound = mountSound({
      audio,
      walk: { mode: () => 'walk', drawnFeet: () => [0, 0, 0], posture: () => 'stand', grid: () => null },
      fly: { groundWish: () => ({ forward: 0, right: 0, boost: false }) },
      loadouts: { type: () => 0 }, side: () => 'seal', seat: () => seat,
      others: () => ({ teamOf: () => team, playerType: () => character, feet: () => [0, 0, 0] }),
    });
    const source = new GameplayAudioSource(disc!);
    let checked = 0;
    try {
      for (const map of maps) {
        const data = await soundFromDisc(source, `RUN/${map}.ZDB`, map);
        sound.setData(data);
        for (team of ['seal', 'terrorist'] as const) {
          seat.team = team; seat.role = 'player';
          const rows = data.taunts!.grenadeWarnings![team];
          if (anchors[map]) expect(rows.map((row) => row[0]?.sound), `${map}/${team}`).toEqual(anchors[map]![team]);
          for (character = 0; character < 4; character++) {
            const warning = rows[character]![0]!;
            const names = data.tacticalGroups?.find((g) => g.name === warning.sound)?.members.map((m) => m.name) ?? [warning.sound];
            const buffers = data.streams!.filter((s) => names.includes(s.name)).map((s) => s.sound);
            expect(buffers.length, `${map}/${team}/${character}`).toBe(names.length);
            for (const item of [121, 122, 123, 126]) {
              const before = played.length;
              expect(sound.grenadeWarning({ id: item, owner: 7, from: [0, 0, 0] })).toBe(warning.sound);
              expect(played.length, `${map}/${team}/${character}/${item}`).toBe(before + 1);
              // Object identity: the output received this map's decoded samples, not merely the expected label.
              expect(buffers.some((buffer) => buffer === played.at(-1)!.sound)).toBe(true);
              expect(played.at(-1)!.sound.peak).toBeGreaterThan(0);
              const gains = played.at(-1)!.gains;
              expect([...gains.left, ...gains.right].some((gain) => gain > 0)).toBe(true);
              checked++;
            }
          }
        }
        const before = played.length;
        character = 0;
        expect(sound.grenadeWarning({ id: 121, owner: seat.id, from: [0, 0, 0] })).toBeNull();
        seat.team = 'seal'; team = 'terrorist';
        expect(sound.grenadeWarning({ id: 121, owner: 7, from: [0, 0, 0] })).toBeNull();
        seat.role = 'spectator'; seat.team = null;
        expect(sound.grenadeWarning({ id: 121, owner: 7, from: [0, 0, 0] })).toBeNull();
        seat.role = 'player'; seat.team = team;
        expect(sound.grenadeWarning({ id: 153, owner: 7, from: [0, 0, 0] })).toBeNull();
        sound.setData(null);
        expect(sound.grenadeWarning({ id: 121, owner: 7, from: [0, 0, 0] })).toBeNull();
        expect(played).toHaveLength(before);
      }
      expect(checked).toBe(704);
    } finally { sound.dispose(); }
  }, 60000);
});
