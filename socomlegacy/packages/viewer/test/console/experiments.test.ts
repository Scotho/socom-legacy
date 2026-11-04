import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleController, type Host } from '../../src/console/grammar';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { createState, CATS, homeItems } from '../../src/console/state';

/**
 * FORGE (the owner, 2026-10-12): the launcher's Experiments section -- Forge and the test room, each its own page.
 * A browser adaptation with no original (the project's launcher page, OT.R28); nothing of the game is touched.
 */
function setup() {
  const A = sampleAdapters();
  const S = createState(A);
  const host: Host = { render: vi.fn(), announce: vi.fn(), fit: vi.fn() };
  const opened: string[] = [];
  A.server.openPage = (name: string) => { opened.push(name); };
  return { A, S, c: new ConsoleController(S, A, host), opened };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('FORGE: the Experiments section', () => {
  it('is the strip\'s last category (CX.R14: Armory and Server are no longer categories)', () => {
    const ids = CATS.map((c) => c.id);
    expect(ids).toContain('experiments');
    expect(ids).not.toContain('armory');
    expect(ids).not.toContain('server');
    expect(CATS.at(-1)!.id).toBe('experiments');
  });

  it('lists Forge and the test room, each opening its own page', () => {
    const { A, S, c, opened } = setup();
    const items = homeItems('experiments', S, A);
    expect(items.map((i) => i.title)).toEqual(['Forge', 'Test room']);
    S.cat = CATS.findIndex((x) => x.id === 'experiments');
    S.item[S.cat] = 0;
    c.press('cross');
    S.item[S.cat] = 1;
    c.press('cross');
    expect(opened).toEqual(['Forge', 'Testroom']);
  });

  // LR-23 / LR-39 (LR.R22, LR.R32): the section's readout is drawn nowhere and `readoutHtml` is removed; the Forge row's
  // tag is what marks the section as the project's own (was: the readout's "not part of the original game"); FWIP (the
  // owner, 2026-10-31): the tag reads WIP (was: EXPERIMENT).
  it('the Forge row is tagged WIP; no readout, and no line says a development build\'s', () => {
    const { A, S } = setup();
    const forge = homeItems('experiments', S, A).find((x) => x.title === 'Forge')!;
    expect(forge.state).toEqual(['WIP', 'tag']);
    // OT.R52 (FG.R9): the forge is in every build -- nothing says it is a development build's.
    for (const x of homeItems('experiments', S, A)) expect(`${x.title} ${x.sub}`).not.toMatch(/development builds? only/i);
  });
});
