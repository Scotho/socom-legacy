// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { inFlightList } from '../src/projectSite/generated';

/** MU-8a 3: the news page's "Where the work stands" names the four states `tools/sitePages.ts` reads from HANDOFF section 2. */
describe('the project pages: the handoff items\' states', () => {
  it('each item carries its state\'s word: in flight, landed, owed, parked', () => {
    const list = inFlightList([
      { title: 'A', state: 'in-flight', summary: '' }, { title: 'B', state: 'landed', summary: '' },
      { title: 'C', state: 'owed', summary: '' }, { title: 'D', state: 'parked', summary: 'x' },
    ]);
    expect([...list.querySelectorAll('li .project-meta')].map((m) => m.textContent)).toEqual(['In flight', 'Landed', 'Owed', 'Parked']);
  });
});
