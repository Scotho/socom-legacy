import { CardSlots } from '@s2u/card';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { liveOptions } from '../../src/console/adapters/options';
import { ConsoleController, type Host } from '../../src/console/grammar';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { CATS, createState, optCategories, type Adapters } from '../../src/console/state';
import { cardOptionStore } from '../../src/modern/settings/store';

/**
 * The pad walk of `e2e/launcherPolish.spec.ts` ("a standard controller reaches launcher menus, nested settings and safe
 * modal actions"): Settings > Game (Display), Right, R1 (Audio), Circle, Circle, Down, Cross (Settings > Launcher), then
 * R1 along the tabs. The spec's page is the sample adapters (`open()` loads `?sample`), whose Options categories carry no
 * family, so their tabs are the adapter's one strip (`optTabs`, state.ts; #595's layout A groups the live adapter's tabs
 * only); the live adapter's Launcher tabs are layout A's (OPT_FAMILY_ORDER). A browser adaptation: the launcher's own
 * Settings, nothing of the game.
 */
function memory(): CardSlots {
  const m = new Map<string, string>();
  return new CardSlots(() => ({ getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } }) as unknown as Storage, () => undefined, { now: () => 1 });
}

function setup(live: boolean) {
  const A: Adapters = sampleAdapters();
  if (live) A.options = liveOptions(() => {}, { store: cardOptionStore(memory()), signedIn: () => false, pads: () => [], touch: () => false, launcher: { disc: () => 'empty', isoInserted: () => false, filename: () => null, onChange: () => () => {} } });
  const S = createState(A);
  const host: Host = { render: vi.fn(), announce: vi.fn(), fit: vi.fn() } as unknown as Host;
  const c = new ConsoleController(S, A, host);
  const tab = (): string | undefined => (S.screen === 'options' ? optCategories(S, A)[S.opt.cat]?.label : undefined);
  return { A, S, c, tab };
}

/** Settings > Game, Right, R1, Circle, Circle, Down, Cross: the spec's walk up to Launcher. */
function toLauncher(s: ReturnType<typeof setup>): void {
  const { S, c, tab } = s;
  S.cat = CATS.findIndex((x) => x.id === 'options');
  S.item[S.cat] = 0;
  c.press('cross'); expect(tab()).toBe('Display');
  c.press('right'); c.press('r1'); expect(tab()).toBe('Audio');
  c.press('circle'); c.press('circle'); c.press('down'); c.press('cross');
  expect(tab()).toBe('Controller');
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('launcherPolish pad walk: R1 from Settings > Launcher', () => {
  it('the sample adapters (the spec\'s page): one strip, so R1 from Controller is Network, Account, then App', () => {
    const s = setup(false);
    expect(optCategories(s.S, s.A).map((c) => c.label)).toEqual(['Display', 'Audio', 'Controller', 'Network', 'Account', 'App', 'Appearance']);
    expect(optCategories(s.S, s.A).some((c) => c.family)).toBe(false);
    toLauncher(s);
    s.c.press('r1'); expect(s.tab()).toBe('Network');
    s.c.press('r1'); expect(s.tab()).toBe('Account');
    s.c.press('r1'); expect(s.tab()).toBe('App');
  });

  it('the live adapter: layout A -- R1 from Controller reaches Appearance, then App', () => {
    const s = setup(true);
    toLauncher(s);
    s.c.press('r1'); expect(s.tab()).toBe('Appearance');
    s.c.press('r1'); expect(s.tab()).toBe('App');
  });
});
