import { describe, expect, it } from 'vitest';
import { emptyLayout, type Layout } from '../../src/forge/layout';
import { floorGround } from '../../src/forge/ground';
import { checkMap } from '../../src/forge/validate';

/**
 * Check map on a Demolition layout (a browser adaptation, FG.R2): the bomb start and one site for each planting team
 * (`../../src/forge/objectives` `bombReady`, what Play needs to run the layout's bomb), each one missing said.
 */
const site = (team: 0 | 1) => ({ team, at: [0, 0, 0] as [number, number, number], yaw: 0, range: 15, elevation: 15 });
const layoutWith = (objectives: Layout['objectives']): Layout => ({ ...emptyLayout({ kind: 'blank', library: 'floor' }), objectives });
const bombIssues = (l: Layout) => checkMap(l, floorGround(2000), []).issues.filter((i) => i.kind === 'bomb-missing').map((i) => i.text);

describe('checkMap: the Demolition bomb', () => {
  it('names each of the start and the two sites missing', () => {
    expect(bombIssues(layoutWith({ gameType: 2 }))).toEqual([
      'Demolition has no bomb start: place one with the Bomb tool.',
      'Demolition has no SEAL site: place one with the Site SEAL tool.',
      'Demolition has no Terrorist site: place one with the Site Terrorist tool.',
    ]);
    expect(bombIssues(layoutWith({ gameType: 2, bomb: { start: [1, 0, 1], sites: [site(1)] } }))).toEqual([
      'Demolition has no SEAL site: place one with the Site SEAL tool.',
    ]);
  });

  it('a whole bomb, or another game type, is no issue', () => {
    expect(bombIssues(layoutWith({ gameType: 2, bomb: { start: [1, 0, 1], sites: [site(0), site(1)] } }))).toEqual([]);
    expect(bombIssues(layoutWith({ gameType: 5 }))).toEqual([]);
    expect(bombIssues(layoutWith(undefined))).toEqual([]);
  });
});
