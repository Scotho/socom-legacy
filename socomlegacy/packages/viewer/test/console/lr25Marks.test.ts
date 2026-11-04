// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { optCategories, type Adapters } from '../../src/console/state';
import { declsOf, PAGE_RULES } from './cascade';
import { mountShell } from './shell';

/**
 * LR-25 (LR.R23 (e), the dispatcher's reading of LR.R22; the owner may overturn): the mockup's CONTROLLER and MIC marks
 * are clickable (`S2 Launcher v2.dc.html` lines 1066-1068: the controller's click is `openCheck()`, the mic's jumps to the
 * voice setting); ours open Settings > System Settings > Controller (the screen Play's Cross opens when no controller is
 * in) and Settings > the microphone's row. The disc mark keeps the source menu. Both are real buttons reached by Tab,
 * never pad focus stops (as the disc mark). The review's folds: F1 a pad press is no user gesture, so it must not open
 * the chooser (the source is still switched, and the legend says how to open it); F4 the Settings list's scrollbar rule
 * is the page's, not the overlay's; F5 the mic mark's dot is warn when the browser refused the microphone. A browser
 * adaptation: nothing of the game.
 */

let page: ConsolePage | null = null;
beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; vi.restoreAllMocks(); localStorage.clear(); vi.useRealTimers(); });
const boot = (a: Adapters = sampleAdapters(), input: 'pad' | 'pointer' = 'pad'): ConsolePage => {
  page = bootConsole(document, window, a, { keymap: true });
  page.ctl.S.input = input;
  page.render();
  return page;
};
const mark = (kind: string): HTMLButtonElement => document.querySelector<HTMLButtonElement>(`#legend .cx-mark[data-mark="${kind}"]`)!;
const key = (name: string): void => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true })); };

describe('LR-25 (e): the controller and microphone marks are buttons', () => {
  it('both are <button>s, Tab-reachable (no tabindex -1), never a pad focus stop (no data-fk)', () => {
    boot();
    for (const k of ['pad', 'mic']) {
      const m = mark(k);
      expect(m.tagName, k).toBe('BUTTON');
      expect(m.getAttribute('type')).toBe('button');
      expect(m.getAttribute('role'), k).toBeNull();
      expect(m.hasAttribute('tabindex'), k).toBe(false);
      expect(m.hasAttribute('data-fk'), k).toBe(false);
      expect(m.getAttribute('aria-label'), k).toBeTruthy();
    }
  });
  it('the controller mark\'s click opens Settings > System Settings > Controller (Play\'s own check)', () => {
    const p = boot();
    mark('pad').click();
    const S = p.ctl.S;
    expect(S.screen).toBe('options');
    expect(optCategories(S, p.ctl.A)[S.opt.cat]!.id).toBe('controller');
  });
  it('the microphone mark\'s click jumps to the voice setting: the microphone\'s row where there is one', () => {
    const a = sampleAdapters();
    const base = a.options.categories;
    a.options.categories = () => [...base(), { id: 'communication', label: 'Communication', icon: 'mic', rows: [{ id: 'mic-on', label: 'Use microphone in game', values: ['Off', 'On'], def: 1, about: '', note: '' }] }] as ReturnType<typeof base>;
    const p = boot(a);
    mark('mic').click();
    const S = p.ctl.S;
    expect(S.screen).toBe('options');
    const cat = optCategories(S, p.ctl.A)[S.opt.cat]!;
    expect(cat.id).toBe('communication');
    expect(cat.rows[S.opt.row]!.id).toBe('mic-on');
  });
  it('and the sample\'s voice row where there is no microphone row', () => {
    const p = boot();
    mark('mic').click();
    const S = p.ctl.S;
    expect(S.screen).toBe('options');
    const cat = optCategories(S, p.ctl.A)[S.opt.cat]!;
    expect(cat.rows[S.opt.row]!.id).toBe('voice');
  });
  it('the dots stay: the controller mark\'s tone follows the pad, the mic\'s follows the microphone', () => {
    boot();
    expect(mark('pad').dataset.tone).toBeDefined();
    expect(mark('mic').querySelector('.cx-mark__dot')).not.toBeNull();
  });
});

describe('LR-25 F5: a refused microphone is a warn dot', () => {
  it('the mic mark\'s data-tone is "warn" when the browser refused it', () => {
    const a = sampleAdapters();
    a.mic.on = () => true;
    a.mic.refused = () => true;
    boot(a);
    expect(mark('mic').dataset.tone).toBe('warn');
  });
});

describe('LR-25 F1: a pad press is no user gesture -- the source switches, the chooser does not open', () => {
  const spied = () => {
    const a = sampleAdapters();
    const choose = vi.fn(async () => false);
    const chooseFolder = vi.fn(async () => false);
    a.disc.choose = choose;
    a.disc.chooseFolder = chooseFolder;
    const pick = vi.fn();
    (globalThis as unknown as { showDirectoryPicker: unknown }).showDirectoryPicker = pick;
    return { a, choose, chooseFolder, pick };
  };
  it('pad Cross on an option: the source is the option, no chooser, a legend line says how to open it', () => {
    const { a, choose, chooseFolder, pick } = spied();
    const p = boot(a, 'pad');
    p.ctl.S.src.open = true;
    p.ctl.S.src.row = 1;
    p.ctl.press('cross');
    expect(a.disc.source?.()).toBe('folder');
    expect(choose).not.toHaveBeenCalled();
    expect(chooseFolder).not.toHaveBeenCalled();
    expect(pick).not.toHaveBeenCalled();
    expect(p.ctl.S.src.open).toBe(false);
    expect(p.ctl.S.legendError).toContain('with the pointer');
  });
  it('a pointer click on an option still opens the chooser', () => {
    const { a, choose } = spied();
    const p = boot(a, 'pointer');
    mark('disc').click();
    document.querySelector<HTMLElement>('#legend .cx-srcopt[data-i="0"]')!.click();
    expect(choose).toHaveBeenCalledTimes(1);
    expect(p.ctl.S.legendError).toBe('');
  });
  it('the keyboard\'s Enter on an option still opens the chooser (a keydown is a user gesture)', () => {
    const { a, choose } = spied();
    const p = boot(a, 'pad');
    p.ctl.S.src.open = true;
    p.ctl.S.src.row = 0;
    key('Enter');
    expect(choose).toHaveBeenCalledTimes(1);
  });
});

describe('LR-25 F4: the Settings list\'s scrollbar rule is the page\'s only', () => {
  it('every rule hiding .cx-rows\' scrollbar excludes the overlay (data-console-mode="overlay")', () => {
    const rules = PAGE_RULES.filter((r) => r.sel.some((x) => x.includes('.cx-rows')) && declsOf(r.body).some(([n, v]) => (n === 'scrollbar-width' || n === 'display') && v === 'none'));
    expect(rules.length).toBeGreaterThanOrEqual(2);
    for (const r of rules) expect(r.sel.join(), r.sel.join()).toContain(':not([data-console-mode="overlay"])');
  });
});
