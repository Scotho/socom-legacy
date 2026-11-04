import { describe, expect, it } from 'vitest';
import { locTable } from '@s2u/scene';
import { archivesOf, missionName } from '../../src/forge/catalog';

/**
 * FORGE (FG-11, FG-16; the owner, 2026-10-13: "Finish the campaign maps as well."): every map archive a source holds --
 * the 22 multiplayer `RUN/MP<N>.ZDB` and the 12 campaign `RUN/M<NN>.ZDB` -- in the disc's order, each named by its own
 * `mission.rdr` description: a multiplayer map's is its name; a campaign mission's is a `_<id>_..._MSG` key, resolved
 * through HUDCLOC (ids 60000-60904, `@s2u/scene` `LOC_ARCHIVES`).
 */
describe('FORGE: the archives a source holds', () => {
  it('are the multiplayer maps then the campaign missions, each by number; nothing else', () => {
    expect(archivesOf(['RUN/M61.ZDB', 'RUN/MP10.ZDB', 'RUN/MP2.ZDB', 'RUN/M51.ZDB', 'RUN/MOTION_P.ZAR', 'RUN/APACHE00.ZDB', 'run/mp1.zdb', 'RUN/M83.ZDB']))
      .toEqual([
        { stem: 'MP1', path: 'run/mp1.zdb', campaign: false },
        { stem: 'MP2', path: 'RUN/MP2.ZDB', campaign: false },
        { stem: 'MP10', path: 'RUN/MP10.ZDB', campaign: false },
        { stem: 'M51', path: 'RUN/M51.ZDB', campaign: true },
        { stem: 'M61', path: 'RUN/M61.ZDB', campaign: true },
        { stem: 'M83', path: 'RUN/M83.ZDB', campaign: true },
      ]);
  });
});

describe('FORGE: a mission\'s name', () => {
  const hud = locTable([{ id: 60883, msg: '_60883_SeedingChaos_MSG', text: 'Seeding Chaos' }]);

  it('is the description as it stands for a multiplayer map', () => {
    expect(missionName('FROSTFIRE', hud)).toBe('FROSTFIRE');
  });

  it('is the string table\'s text for a campaign key, by its message name or its id', () => {
    expect(missionName('_60883_SeedingChaos_MSG', hud)).toBe('Seeding Chaos');
    expect(missionName('_60883_Other_MSG', hud)).toBe('Seeding Chaos');
  });

  it('without the table, the key\'s own words: the id and _MSG off, the words split', () => {
    expect(missionName('_60884_ShadowOfTheMountain_MSG', null)).toBe('Shadow Of The Mountain');
    expect(missionName('_60884_ShadowOfTheMountain_MSG', hud)).toBe('Shadow Of The Mountain');
  });
});
