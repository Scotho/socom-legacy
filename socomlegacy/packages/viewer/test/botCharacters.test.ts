import { describe, expect, it } from 'vitest';
import { chooseBotCharacter, type CharacterCatalogue, type CharacterChoice } from '../src/characters/catalogue';

const choice = (name: string, canonical: boolean, model = name): CharacterChoice => ({
  key: name, identity: name, name, canonical, team: 'seal', region: 'russia', character: name,
  model, library: 'MP2', uniform: 'Scuba', role: 'Operator',
});
const catalogue = (choices: CharacterChoice[]): CharacterCatalogue => ({
  region: 'russia', uniform: 'Scuba', choices, pool: { seal: choices.map((c) => c.key), terrorist: [] },
});

describe('authored regional CPU character allocation (FBA.R10)', () => {
  it('selects actual characters before custom fillers, with random order inside each group', () => {
    const c = catalogue([choice('Anchor', false), choice('Specter', true), choice('Jester', true), choice('Rook', false)]);
    const used = new Set<string>();
    const names = Array.from({ length: 4 }, () => {
      const next = chooseBotCharacter(c, 'seal', used, () => .99)!;
      used.add(next.identity); return next.name;
    });
    expect(names).toEqual(['Jester', 'Specter', 'Rook', 'Anchor']);
  });

  it('includes regional actual characters outside the old capped eight-slot pool', () => {
    const c = catalogue([choice('Anchor', false), choice('Polaris', true)]);
    c.pool.seal = ['Anchor'];
    expect(chooseBotCharacter(c, 'seal', new Set(), () => 0)?.name).toBe('Polaris');
  });

  it('never allocates the same actual person twice through alternate appearances', () => {
    const scuba = choice('JesterScuba', true), arctic = choice('JesterArctic', true);
    scuba.identity = arctic.identity = 'canonical:jester';
    const c = catalogue([scuba, arctic, choice('Anchor', false)]);
    expect(chooseBotCharacter(c, 'seal', new Set(['canonical:jester']), () => 0)?.name).toBe('Anchor');
  });

  it('prefers the established map appearance for an identity and respects faction', () => {
    const a = choice('JesterArctic', true), b = choice('JesterScuba', true);
    a.identity = b.identity = 'canonical:jester'; a.uniform = 'Arctic';
    const c = catalogue([a, b]); c.pool.seal = [b.key];
    expect(chooseBotCharacter(c, 'seal', new Set(), () => 0)).toBe(b);
    expect(chooseBotCharacter(c, 'terrorist', new Set(), () => 0)).toBeNull();
  });

  it('includes custom-named multiplayer skins in the combined priority pool, without duplicate appearances', () => {
    const a = choice('Specter', true, 'MP-A'), b = choice('Polaris', true, 'Spetsnaz');
    const duplicate = choice('Bludshot', true, 'Spetsnaz'), native = choice('Anchor', false, 'MP-B');
    const filler = choice('Flint', false, 'Specialist');
    const c = catalogue([a, b, duplicate, native, filler]);
    c.multiplayerModels = { seal: ['MP-A', 'MP-B'], terrorist: [] };
    const used = new Set<string>();
    const models = Array.from({ length: 3 }, () => {
      const next = chooseBotCharacter(c, 'seal', used, () => 0)!;
      used.add(next.identity); return next.model;
    });
    expect(new Set(models)).toEqual(new Set(['MP-A', 'MP-B', 'Spetsnaz']));
  });
});
