// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ForgeAgentApi } from '../../src/forge/agent/api';
import { planForgeLayout } from '../../src/forge/agent/commands';
import { emptyLayout, type Layout } from '../../src/forge/layout';
import { BLANK_LIBRARY } from '../../src/forge/matchMap';
import { recordOfLayout } from '../../src/forge/record';
import { forgeAuthoringText, sealForgeRules, type ForgeLayout } from '../../src/forge/rulesAuthoring';
import { FORGE_LAYOUT_KEY } from '../../src/pageStore';
import type { LoadedMap } from '../../src/loadMap';
import { freshSavesDb } from './fakeSaves';

/**
 * FCW-32 round 2, held items 1 and 2 (product track; a browser adaptation with no original): the Forge's Play start
 * hands `startForgeMatch` the layout's rules (FORGE_PLAY_RULES_ADAPTATION) -- its rules mode's spec, params, a seed and
 * its zones, markers and spawners -- and a layout without a rules mode plays exactly as before (no `rules` option at
 * all). The rules' messages the room tells (`rulesPresent`) show beside the match's Back as text, never as markup. The
 * match itself is the test's stand-in (`startForgeMatch` mocked, as `./pagePlayContent.test.ts` mocks it).
 */

vi.mock('../../src/renderer', () => ({ createRenderer: async () => ({
  backend: 'webgl2', resize: () => undefined, presentation: () => 'native', render: () => undefined,
  setPresentation: () => undefined, setClearColor: () => undefined,
}) }));
const archiveLoad = vi.hoisted(() => vi.fn<(stem: string) => Promise<LoadedMap>>());
vi.mock('../../src/forge/archives', () => ({ Archives: class {
  onProgress = null;
  clips = async () => null;
  list = async () => ({ entries: [], problems: [] });
  load = archiveLoad;
  sourceRequest = () => ({ kind: 'http', baseUrl: '/maps' });
}, labelOf: (_entries: unknown, _stem: string, fallback: string) => fallback }));
const started = vi.hoisted(() => ({ options: [] as Record<string, unknown>[] }));
vi.mock('../../src/forge/match', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/forge/match')>()),
  matchExtras: async () => ({ effects: null, sound: null }),
  startForgeMatch: async (_target: HTMLElement, o: Record<string, unknown>) => {
    started.options.push(o);
    return { ended: () => false, close: () => undefined };
  },
}));

/** A blank-floor layout with a spawn and a vault zone. */
const floor = (): Layout => ({
  ...emptyLayout({ kind: 'blank', library: BLANK_LIBRARY }), name: 'Vault',
  spawns: [{ team: 'A', p: [10, 0, 10], yaw: 0 }],
});
/** The same with a two-rule mode on its vault, its reward configured. */
async function withRules(): Promise<ForgeLayout> {
  let l = planForgeLayout(floor(), 'zone.place', { id: 'vault', shape: 'cylinder', at: [0, 0, 0], radius: 5, height: 3 }, []);
  l = planForgeLayout(l, 'rules.new', { pack: 'my.vault', version: '1.0.0', id: 'vault.run', name: 'Vault run' }, []);
  l = planForgeLayout(l, 'rules.set', { spec: {
    schema: 's2u-rules', vocabulary: 0, id: 'vault.run', name: 'Vault run',
    config: [{ id: 'reward', type: 'int', default: 5, min: 0, max: 50 }],
    variables: [{ id: 'gold', scope: 'player', type: 'int', start: 0, min: 0, max: 1000 }],
    entities: { zones: ['vault'] },
    rules: [
      { id: 'pay', when: { event: 'zone.enter', zone: 'vault' }, then: [{ do: 'variable.add', var: 'gold', who: 'player', amount: { param: 'reward' } }] },
      { id: 'score', when: 'player.kill', then: [{ do: 'score.award', who: 'attacker', points: 1 }] },
    ],
  } }, []);
  l = planForgeLayout(l, 'rules.config.set', { params: { reward: 9 } }, []);
  return sealForgeRules(l as ForgeLayout);
}

describe('FCW-32 round 2: Play runs the layout\'s rules; their messages as text', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.stubGlobal('requestAnimationFrame', () => 0);
    freshSavesDb();
    history.replaceState(null, '', '/forge?floor');
    localStorage.clear();
    archiveLoad.mockReset().mockRejectedValue(new Error('No disc supplied'));
    started.options = [];
  });
  afterEach(() => { window.dispatchEvent(new PageTransitionEvent('pagehide')); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  async function play(text: string): Promise<Record<string, unknown>> {
    localStorage.setItem(FORGE_LAYOUT_KEY, text);
    const page = await import('../../src/forge/page');
    let api!: ForgeAgentApi;
    await page.mountForge(document, { onAgentReady: (a) => { api = a; } });
    const r = await api.execute('play.start', { allowIssues: true }, api.read().revision);
    expect(r, JSON.stringify(r)).toMatchObject({ ok: true });
    await vi.waitFor(() => expect(started.options).toHaveLength(1));
    return started.options[0]!;
  }

  it('a layout with a rules mode plays with its spec, params, a seed and its rules entities', async () => {
    const l = await withRules();
    const made = forgeAuthoringText(l, 'Vault');
    if (!('text' in made)) throw new Error(made.why);
    const o = await play(made.text);
    const rules = o['rules'] as { spec: { id: string }; seed: number; params: Record<string, unknown>; layout: { zones?: unknown } };
    expect(rules.spec).toEqual(l.rules!.spec);
    expect(rules.params).toEqual({ reward: 9 });
    expect(Number.isInteger(rules.seed) && rules.seed >= 0).toBe(true);
    expect(rules.layout).toEqual({ zones: l.zones });
    // review F1: Play hands the host the blank floor's names (none), the derivation rules.test shares (`ruleNamesOf`)
    expect((o['rules'] as { names?: unknown }).names).toEqual({ doors: [], switches: [] });
  }, 30_000);

  it('a layout without a rules mode plays exactly as before: no rules option at all (pinned)', async () => {
    const o = await play(JSON.stringify(recordOfLayout(floor(), 'Vault')));
    expect('rules' in o).toBe(false);
  }, 30_000);

  it('a pack\'s message shows beside Back as those literal characters, adding no element', async () => {
    const l = await withRules();
    const made = forgeAuthoringText(l, 'Vault');
    if (!('text' in made)) throw new Error(made.why);
    const o = await play(made.text);
    const onRules = o['onRules'] as (ev: unknown) => void;
    expect(typeof onRules).toBe('function');
    const chips = document.querySelector<HTMLElement>('[data-forge-chips="match"]')!;
    const before = chips.querySelectorAll('*').length;
    onRules({ type: 'rulesPresent', mode: 'vault.run', shows: [{ kind: 'message', text: '<img src=x onerror=alert(1)>' }] });
    expect(chips.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(chips.querySelector('img')).toBeNull();
    onRules({ type: 'rulesPresent', mode: 'vault.run', shows: [{ kind: 'message', text: '<b>x</b>' }] });
    expect(chips.textContent).toContain('<b>x</b>');
    expect(chips.querySelector('b')).toBeNull();
    // one chip for the message, its lamp and word (the status chips' own shape): no element of the message's own
    expect(chips.querySelectorAll('*').length).toBe(before + 3);
  }, 30_000);

  it('FUI-23 (FUI.R24): Play hands the rules\' cues the match\'s audio; a cue is heard, a missing one said, a locked output held for a click', async () => {
    const l = await withRules();
    const made = forgeAuthoringText(l, 'Vault');
    if (!('text' in made)) throw new Error(made.why);
    const o = await play(made.text);
    expect(typeof o['onRulesAudio']).toBe('function');
    const onRules = o['onRules'] as (ev: unknown) => void;
    const onRulesAudio = o['onRulesAudio'] as (a: unknown) => void;
    const plays: string[] = [];
    let on = false;
    onRulesAudio({
      loaded: () => true, has: (n: string) => n === '.BEEP', play: (n: string) => { if (!on) return false; plays.push(n); return true; },
      unlocked: () => on, unlock: () => { on = true; },
    });
    const cue = (name: string) => ({ type: 'rulesPresent', mode: 'vault.run', shows: [{ kind: 'cue', cue: name }] });
    onRules(cue('.NOPE'));
    await vi.waitFor(() => expect(document.body.textContent).toContain('cue .NOPE: not on this map'));
    onRules(cue('.BEEP'));
    const chips = document.querySelector<HTMLElement>('[data-forge-chips="match"]')!;
    expect(chips.querySelector('[data-forge-chip="rules-cue"]')?.textContent).toBe('Press ✕ to hear the cues');
    expect(plays).toEqual([]);
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(plays).toEqual(['.BEEP']);
    expect(chips.querySelector('[data-forge-chip="rules-cue"]')).toBeNull();
  }, 30_000);

  it('FUI-23: a layout without a rules mode hands no cue audio (pinned)', async () => {
    const o = await play(JSON.stringify(recordOfLayout(floor(), 'Vault')));
    expect('onRulesAudio' in o).toBe(false);
  }, 30_000);

  it('the review\'s F4: Share on a layout with rules is refused by name in the status line (it travels as a file), never thrown', async () => {
    const l = await withRules();
    const made = forgeAuthoringText(l, 'Vault');
    if (!('text' in made)) throw new Error(made.why);
    localStorage.setItem(FORGE_LAYOUT_KEY, made.text);
    const page = await import('../../src/forge/page');
    let api!: ForgeAgentApi;
    await page.mountForge(document, { onAgentReady: (a) => { api = a; } });
    expect(api.read().rules).toBeTruthy();
    const unhandled = vi.fn();
    window.addEventListener('unhandledrejection', unhandled);
    process.on('unhandledRejection', unhandled);
    try {
      document.querySelector<HTMLButtonElement>('[data-forge="saves"]')!.click();
      const share = [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Share link')!;
      share.click();
      await vi.waitFor(() => expect(document.body.textContent).toContain('A layout with rules travels as a file'));
      await new Promise((r) => setTimeout(r, 10));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('unhandledrejection', unhandled);
      process.off('unhandledRejection', unhandled);
    }
  }, 30_000);
});
