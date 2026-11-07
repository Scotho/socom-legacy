// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStatusChips, FORGE_CHIP_ORDER, issuesChip, lobbyChip, modeChip, saveChip, type StatusTone } from '../../src/forge/shell/statusBar';
import { agentPresence } from '../../src/agent/activity';
import type { ForgeAgentApi } from '../../src/forge/agent/api';
import type { LoadedMap } from '../../src/loadMap';
import { freshSavesDb } from './fakeSaves';

/**
 * FUI-4 (the review's IA-7, VP-5, VP-13, AI-2's page half; principle 3; a browser adaptation, FG.R2): every lasting
 * state has one always-visible chip with a word, never the colour alone -- the save, Build / Walk / Play, the lobby's
 * lock, the agent, the issues -- on the design system's `s2u-chip` and `s2u-lamp`, and a panel adds its own through
 * `registerStatusChip`. The strip is tested over a plain document, the words as pure functions, and the page is mounted
 * as `forgeAgentPage.test.ts` mounts it (only the GPU and disc I/O replaced).
 */

const here = dirname(fileURLToPath(import.meta.url));
const forgeCss = readFileSync(resolve(here, '../../src/forge/forge.css'), 'utf8');

const TONE_CLASS: Record<StatusTone, string> = { live: 'is-live', ready: 'is-ready', wait: 'is-wait', alert: 'is-alert', empty: 'is-empty' };

describe('the status-chip strip (FUI-4)', () => {
  beforeEach(() => { document.body.replaceChildren(); });

  it('draws each chip on s2u-chip and s2u-lamp in its order, the word always shown', () => {
    const chips = createStatusChips(document);
    document.body.append(chips.element);
    chips.register({ id: 'b', order: 20, text: () => 'Second', tone: () => 'ready' });
    chips.register({ id: 'a', order: 10, text: () => 'First', tone: () => 'live' });
    expect(chips.ids()).toEqual(['a', 'b']);
    const drawn = [...chips.element.querySelectorAll<HTMLElement>('[data-forge-chip]')];
    expect(drawn.map((c) => c.dataset['forgeChip'])).toEqual(['a', 'b']);
    for (const c of drawn) {
      expect(c.classList.contains('s2u-chip')).toBe(true);
      expect(c.querySelector('.s2u-lamp.s2u-lamp--small.s2u-chip__lamp')?.getAttribute('aria-hidden')).toBe('true');
    }
    expect(drawn.map((c) => c.querySelector('.s2u-chip__word')!.textContent)).toEqual(['First', 'Second']);
    expect(drawn[0]!.classList.contains('is-live')).toBe(true);
  });

  it('reflects each state transition at update, and hides a chip with nothing to say', () => {
    const chips = createStatusChips(document);
    let word: string | null = 'Saving…', tone: StatusTone = 'wait';
    const handle = chips.register({ id: 'save', order: 10, text: () => word, tone: () => tone });
    const chip = (): HTMLElement => chips.element.querySelector<HTMLElement>('[data-forge-chip="save"]')!;
    expect(chip().classList.contains('is-wait')).toBe(true);
    word = 'Autosaved'; tone = 'ready';
    handle.update();
    expect(chip().textContent).toBe('Autosaved');
    expect(chip().classList.contains('is-ready')).toBe(true);
    expect(chip().classList.contains('is-wait')).toBe(false);
    word = null;
    chips.update();
    expect(chip().hidden).toBe(true);
    word = 'Not saved'; tone = 'alert';
    chips.update();
    expect(chip().hidden).toBe(false);
    expect(chip().classList.contains('is-alert')).toBe(true);
    handle.remove();
    expect(chips.element.querySelector('[data-forge-chip="save"]')).toBeNull();
  });

  it('a sixth chip leaves the others\' styles alone: no rule by position, the cells named', () => {
    const chips = createStatusChips(document);
    const tones: StatusTone[] = ['live', 'ready', 'wait', 'alert', 'empty', 'ready'];
    tones.forEach((t, i) => chips.register({ id: `c${i}`, order: i, text: () => `chip ${i}`, tone: () => t }));
    [...chips.element.querySelectorAll<HTMLElement>('[data-forge-chip]')].forEach((c, i) => expect(c.classList.contains(TONE_CLASS[tones[i]!])).toBe(true));
    expect(forgeCss, 'the status bar styled by position (VP-13)').not.toMatch(/nth-of-type/);
    for (const cell of ['mode', 'cam', 'speed']) expect(forgeCss, 'the gold cell and the two a phone hides, by name').toContain(`.fx-cell--${cell}`);
  });

  it('a chip that opens something is a button; its action (the agent\'s Stop) is its own button; a read-only one is a span', () => {
    const chips = createStatusChips(document);
    const open = vi.fn(), stop = vi.fn();
    chips.register({ id: 'agent', order: 40, text: () => 'Agent connected', tone: () => 'ready', onOpen: open, action: () => ({ label: 'Stop', run: stop }) });
    chips.register({ id: 'mode', order: 20, text: () => 'Build', tone: () => 'ready' });
    const agent = chips.element.querySelector<HTMLElement>('[data-forge-chip="agent"]')!;
    const mode = chips.element.querySelector<HTMLElement>('[data-forge-chip="mode"]')!;
    expect(agent.querySelector('button.s2u-chip')).not.toBeNull();
    expect(mode.tagName).toBe('SPAN');
    agent.querySelector<HTMLButtonElement>('button.s2u-chip')!.click();
    expect(open).toHaveBeenCalledOnce();
    const action = agent.querySelector<HTMLButtonElement>('[data-forge-chip-action]')!;
    expect(action.textContent).toBe('Stop');
    action.click();
    expect(stop).toHaveBeenCalledOnce();
  });

  it('a chip marked for the match is mirrored beside the match\'s Back, updated with the strip', () => {
    const chips = createStatusChips(document);
    let word = 'Agent connected';
    chips.register({ id: 'agent', order: 40, text: () => word, tone: () => 'ready', inMatch: true });
    chips.register({ id: 'save', order: 10, text: () => 'Autosaved', tone: () => 'ready' });
    const mirrored = (): string[] => [...chips.matchElement.querySelectorAll<HTMLElement>('[data-forge-chip]')].map((c) => c.textContent ?? '');
    expect(mirrored()).toEqual(['Agent connected']);
    word = 'Agent acting';
    chips.update();
    expect(mirrored()).toEqual(['Agent acting']);
    chips.dispose();
    expect(chips.element.children.length + chips.matchElement.children.length).toBe(0);
  });

  it('the page\'s own chips name every state in words', () => {
    expect(modeChip('build', false)).toEqual({ text: 'Build', tone: 'ready' });
    expect(modeChip('walk', false)).toEqual({ text: 'Walk', tone: 'live' });
    expect(modeChip('play', true)).toEqual({ text: 'Play', tone: 'live' });
    expect(modeChip('blocked', true).text, 'the lobby\'s server match').toBe('Play');
    expect(modeChip('blocked', false)).toEqual({ text: 'Locked', tone: 'wait' });
    expect(lobbyChip({ open: true, role: 'host' }).text).toMatch(/edits locked/);
    expect(lobbyChip({ open: true, role: 'joiner' }).text).toMatch(/edits locked/);
    expect(lobbyChip({ open: false }).text).toBeNull();
    expect(saveChip('saved')).toMatchObject({ text: 'Autosaved', tone: 'ready' });
    expect(saveChip('saving').tone).toBe('wait');
    expect(saveChip('refused')).toMatchObject({ text: 'Not saved', tone: 'alert' });
    expect(saveChip('kept').tone).toBe('wait');
    expect(saveChip('off').text).toMatch(/host/i);
    expect(issuesChip(null)).toMatchObject({ text: 'Not checked', tone: 'empty' });
    expect(issuesChip(0)).toMatchObject({ text: 'No issues', tone: 'ready' });
    expect(issuesChip(1)).toMatchObject({ text: '1 issue', tone: 'alert' });
    expect(issuesChip(3)).toMatchObject({ text: '3 issues', tone: 'alert' });
    expect(FORGE_CHIP_ORDER.save).toBeLessThan(FORGE_CHIP_ORDER.mode);
  });

  it('the agent\'s chip: nothing while idle, then Connected / Approval needed / Acting / Paused, never the colour alone', () => {
    expect(agentPresence('idle', false).text).toBeNull();
    expect(agentPresence('disconnected', false).text).toBeNull();
    expect(agentPresence('waiting', false)).toEqual({ text: 'Agent waiting', tone: 'wait' });
    expect(agentPresence('approval', false)).toEqual({ text: 'Approval needed', tone: 'alert' });
    expect(agentPresence('connected', false)).toEqual({ text: 'Agent connected', tone: 'ready' });
    expect(agentPresence('connected', true)).toEqual({ text: 'Agent acting', tone: 'live' });
    expect(agentPresence('paused', false)).toEqual({ text: 'Agent paused', tone: 'wait' });
    expect(agentPresence('error', false).tone).toBe('alert');
  });
});

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

const toolbar = (label: string): HTMLButtonElement =>
  [...document.querySelectorAll<HTMLButtonElement>('.fx-top button.fx-tool')].find((b) => b.textContent?.trim() === label)!;
/** A chip's word as shown: null when the chip is absent or hidden (nothing to say). */
const chipWord = (id: string): string | null => {
  const chip = document.querySelector<HTMLElement>(`.fx-status [data-forge-chip="${id}"]`);
  return chip && !chip.hidden ? chip.querySelector('.s2u-chip__word')?.textContent ?? null : null;
};

describe('the mounted Forge\'s status bar (FUI-4)', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.stubGlobal('requestAnimationFrame', () => 0);
    history.replaceState(null, '', '/forge?floor');
    localStorage.clear();
    freshSavesDb();                                                 // R3-B: the autosave is written to IndexedDB
    archiveLoad.mockReset().mockRejectedValue(new Error('No disc supplied'));
  });
  afterEach(() => { window.dispatchEvent(new PageTransitionEvent('pagehide')); vi.unstubAllGlobals(); });

  it('the strip follows the save, the mode and the check; a refusal persists; a panel\'s chip shows with the docks off', async () => {
    const { mountForge } = await import('../../src/forge/page');
    let api!: ForgeAgentApi;
    const shell = await mountForge(document, { onAgentReady: (target) => { api = target; } });
    expect(api.read().ready).toBe(true);
    // The five named cells keep their order (the specs read `.fx-status .fx-cell` by index); the chips are not cells.
    const cells = [...document.querySelectorAll<HTMLElement>('.fx-status .fx-cell')];
    expect(cells.map((c) => [...c.classList].find((k) => k.startsWith('fx-cell--')))).toEqual(['fx-cell--mode', 'fx-cell--counts', 'fx-cell--cam', 'fx-cell--speed', 'fx-cell--fps']);
    expect(chipWord('mode')).toBe('Build');
    expect(chipWord('issues')).toBe('Not checked');
    expect(chipWord('lobby'), 'no lobby, no lobby chip').toBeNull();
    expect(document.querySelector('.fx-loading-bar')!.getAttribute('role')).toBe('progressbar');
    expect(document.querySelector('.fx-outliner')!.textContent, 'the empty state names the next step').toMatch(/Nothing placed yet.+(place|choose|pick)/i);

    expect(await api.execute('spawn.place', { team: 'A', at: [0, 80, 0] }, api.read().revision)).toMatchObject({ ok: true });
    expect(chipWord('save')).toBe('Saving…');
    await vi.waitFor(() => expect(chipWord('save')).toBe('Autosaved'));

    // A refusal (the toolbar's Saves over the check's open card) persists in the status line, not only in the toast.
    document.querySelector<HTMLButtonElement>('.fx-play')!.click();
    await vi.waitFor(() => expect(document.querySelector('.fx-check-card h2')?.textContent).toBe('This map has problems'));
    expect(chipWord('issues'), 'the check before Play counts too').toMatch(/^\d+ issues?$/);
    toolbar('Saves').click();
    const line = document.querySelector<HTMLElement>('.fx-status-msg')!;
    expect(line.textContent).toMatch(/card/i);
    expect(line.classList.contains('is-bad')).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }));
    await vi.waitFor(() => expect(document.querySelector('.fx-check-card')).toBeNull());
    expect(line.textContent, 'the refusal outlives its toast').toMatch(/card/i);

    toolbar('Check').click();
    await vi.waitFor(() => expect(document.querySelector('.fx-check-card h2')).not.toBeNull());
    expect(chipWord('issues')).toMatch(/^(No issues|\d+ issues?)$/);
    expect(await api.execute('spawn.place', { team: 'B', at: [40, 80, 0] }, api.read().revision)).toMatchObject({ ok: true });
    expect(chipWord('issues'), 'an edit makes the last check stale').toBe('Not checked');

    let word = 'Probe ready';
    shell.register({
      id: 'probe', title: 'Probe', dock: 'right', order: 90, defaultOpen: false, padLegend: [],
      mount(_host, ctx) {
        const chip = ctx.ui.registerStatusChip({ id: 'probe', order: 90, text: () => word, tone: () => 'ready' });
        return { update: () => chip.update(), dispose: () => undefined };
      },
    });
    document.body.classList.add('fx-docks-off');
    expect(chipWord('probe')).toBe('Probe ready');
    word = 'Probe busy';
    shell.unregister('probe');
    expect(chipWord('probe'), 'unregistered, its chip is gone').toBeNull();
  }, 90_000);
});
