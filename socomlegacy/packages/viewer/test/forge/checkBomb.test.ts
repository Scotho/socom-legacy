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

// FN-5 (a browser adaptation, FG.R2; FG-51 as kept, FN.R4): a Demolition layout with no bomb start of its own, on a base
// that plays its own bomb (`baseBomb`, the page's `../../src/forge/objectives` `usesBaseBomb`), is no problem -- a note
// says the map's own bomb and plant sites are used, and the placed sites not.
describe("checkMap: Demolition on the base map's bomb", () => {
  const base = { hostages: 0, zones: 0, bomb: { start: true, seal: true, terrorist: true }, baseBomb: true };
  const LINE = "No bomb start placed: the map's own bomb and plant sites are used.";
  it('says so in a note, the placed sites named unused, and no bomb issue', () => {
    const placed = checkMap(layoutWith({ gameType: 2, bomb: { sites: [site(0), site(1)] } }), floorGround(2000), [], undefined, undefined, base);
    expect(placed.notes).toContain(`${LINE} The plant sites placed here are not used.`);
    expect(placed.issues.filter((i) => i.kind === 'bomb-missing')).toEqual([]);
    const none = checkMap(layoutWith({ gameType: 2 }), floorGround(2000), [], undefined, undefined, base);
    expect(none.notes).toContain(LINE);
  });
  it('CONTROL: no note where the layout plays its own bomb, or the base does not play it', () => {
    const own = checkMap(layoutWith({ gameType: 2, bomb: { start: [1, 0, 1], sites: [site(0), site(1)] } }), floorGround(2000), [], undefined, undefined, { ...base, baseBomb: false });
    expect(own.notes.some((n) => n.includes('No bomb start placed'))).toBe(false);
    const notBase = checkMap(layoutWith({ gameType: 2 }), floorGround(2000), [], undefined, undefined, (({ baseBomb: _b, ...rest }) => rest)(base));
    expect(notBase.notes.some((n) => n.includes('No bomb start placed'))).toBe(false);
  });
});
