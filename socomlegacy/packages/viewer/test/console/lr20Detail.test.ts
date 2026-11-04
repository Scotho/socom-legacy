// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { liveOptions } from '../../src/console/adapters/options';
import { prompts } from '../../src/console/render/legend';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { homeItems, type Adapters } from '../../src/console/state';
import type { LauncherState } from '../../src/modern/launcherState';
import { P } from '../../src/console/icons';
import { optRowEls, optRowLabel } from './optRows';
import { rootFontPx } from '../../src/console/fit';
import { declsOf, PAGE_RULES, rem, ruleApplies as applies, side, TIERS, value, type Rule } from './cascade';
import { mountShell } from './shell';
import { CardSlots } from '@s2u/card';
import type { ValveEntry } from '@s2u/ui';
import type { DiscAssets } from '../../src/modern/discAssets';
import { cardOptionStore } from '../../src/modern/settings/store';

/**
 * LR-20 (the LR.R11 side-by-side's P4, P11, P12 -- `agent-mail/evidence/review-lr-7-side-by-side.md` -- and its pass 2's
 * Q4, Q8, Q12, Q13 -- `review-lr-7-side-by-side-2.md`): the hints, the copy, the icons and the panel's details, against
 * the owner's artifact (`S2 Launcher v2.dc.html`) and the handoff's settings catalog (`03_SETTINGS_CATALOG.md`). A browser
 * adaptation: the launcher's words and look, nothing of the game.
 */
let page: ConsolePage | null = null;
beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; localStorage.clear(); vi.useRealTimers(); });

const launcher = (): LauncherState => ({ disc: () => 'empty', isoInserted: () => false, filename: () => null, assets: () => null, onChange: () => () => {} });
/** The live options adapter (the real tabs' rows), signed in or out. */
function bootLive(signedIn = false) {
  const options = liveOptions(() => { page?.render(); }, { launcher: launcher(), signedIn: () => signedIn, pads: () => [], touch: () => false, install: () => 'chromium' });
  const sample = sampleAdapters();
  page = bootConsole(document, window, { ...sample, data: 'live', states: undefined, options, session: { ...sample.session, signedIn: () => signedIn } } as Adapters, { keymap: true });
  page.ctl.S.input = 'pad';
  page.render();
  return page.ctl;
}
const said = (): [string, string][] => prompts(page!.ctl.S, page!.ctl.A).map((p) => [p.k, p.label]);
const labels = (): string[] => optRowEls().map(optRowLabel);
const open = (tab: string): void => { page!.ctl.doAct('opt:' + tab); page!.render(); };
const focusRow = (label: string): void => {
  const i = labels().indexOf(label);
  if (i < 0) throw new Error(`no row "${label}" in ${labels().join(', ')}`);
  page!.ctl.S.opt.zone = 'rows';
  page!.ctl.S.opt.row = i;
  page!.render();
};
const cross = (): string | null => said().find(([k]) => k === 'cross')?.[1] ?? null;
const has = (k: string, label: string): boolean => said().some(([a, b]) => a === k && b === label);

describe('LR-20 (1) P4: the legend\'s Cross names what Cross does on each row kind, never the row\'s value', () => {
  it('Appearance: the link "Theme & background" is Open (its value "Navy & Gold · Wave only" stays on the row)', () => {
    const ctl = bootLive();
    open('appearance');
    focusRow('Theme & background');
    expect(cross()).toBe('Open');
    expect(said().some(([, l]) => /Navy|Wave only/.test(l))).toBe(false);
  });

  it('a toggle is Toggle (and Change on the D-pad); a select only Change on the D-pad', () => {
    const ctl = bootLive();
    open('appearance');
    focusRow('Backdrop motion');
    expect(cross()).toBe('Toggle');
    expect(has('dpad-h', 'Change')).toBe(true);
    focusRow('Clock');
    expect(cross()).toBeNull();
    expect(has('dpad-h', 'Change')).toBe(true);
  });

  it('an action row is its verb; a pick (the theme panel) is Pick', () => {
    const ctl = bootLive();
    open('app');
    focusRow('Install app');
    expect(cross()).toBe('Install');
    open('appearance');
    focusRow('Theme & background');
    ctl.press('cross');
    expect(ctl.S.opt.panel).toBe('theme');
    expect(cross()).toBe('Pick');
  });

  it('an info row (App\'s Version) offers neither a Cross nor a Change: nothing changes it', () => {
    const ctl = bootLive();
    open('app');
    focusRow('Version');
    expect(cross()).toBeNull();
    expect(has('dpad-h', 'Change')).toBe(false);
    expect(has('circle', 'Back')).toBe(true);
  });
});

describe('LR-20 (6) Q13: Square "Reset to default" only where the focused row has a default (03_SETTINGS_CATALOG)', () => {
  it('Account: neither "Remember me" (chosen on the sign-in) nor Sign out has a default -- no Square', () => {
    for (const signedIn of [false, true]) {
      const ctl = bootLive(signedIn);
      open('account');
      for (const label of ['Remember me on this browser', 'Sign out']) {
        focusRow(label);
        expect(has('square', 'Reset to default'), `${label}, signed ${signedIn ? 'in' : 'out'}`).toBe(false);
      }
      page!.dispose(); page = null; mountShell(document);
    }
  });

  it('Display and Appearance: a row with a default offers it', () => {
    const ctl = bootLive();
    open('appearance');
    focusRow('Clock');
    expect(has('square', 'Reset to default')).toBe(true);
    page!.dispose(); page = null; mountShell(document);
    page = bootConsole(document, window, sampleAdapters(), { keymap: true });
    open('display');
    expect(has('square', 'Reset to default')).toBe(true);
  });
});

describe('LR-20 (2) P12: an action row\'s hint adds something or is not drawn; the tags sit beside their titles', () => {
  const hintOf = (label: string): string | null => optRowEls().find((r) => optRowLabel(r) === label)?.querySelector('.cx-r__hint')?.textContent ?? null;
  /** Every action row of every tab now drawn: its hint is never a word its label already says. */
  const noRepeats = (): void => {
    const cats = page!.ctl.A.options.categories();
    for (const c of cats) {
      open(c.id);
      for (const el of optRowEls().filter((r) => r.classList.contains('cx-r--action'))) {
        const label = optRowLabel(el).toLowerCase();
        const hint = el.querySelector('.cx-r__hint')?.textContent?.toLowerCase() ?? '';
        expect(hint !== '' && (label === hint || label.split(/\s+/).includes(hint)), `${c.id}: "${label}" / "${hint}"`).toBe(false);
      }
    }
  };

  it('Sign out draws no hint (the artifact\'s A(\'Sign out\', \'signout\', null)); signed out, its lock is the hint', () => {
    const ctl = bootLive(true);
    open('account');
    expect(hintOf('Sign out')).toBeNull();
    noRepeats();
    page!.dispose(); page = null; mountShell(document);
    bootLive(false);
    open('account');
    expect(hintOf('Sign out')).toBe('Sign in to change');
    void ctl;
  });

  it('Button mapping says what it opens; Install app the artifact\'s line; the legend keeps the verbs', () => {
    bootLive(true);
    open('controller');
    expect(hintOf('Button mapping')).toBe('Choose what each button does');
    focusRow('Button mapping');
    expect(cross()).toBe('Remap');
    open('app');
    expect(hintOf('Install app')).toBe('Adds the launcher to your desktop and app list');
    focusRow('Install app');
    expect(cross()).toBe('Install');
  });

  it('the sample\'s Connection test says what it checks (the artifact\'s "Checks NAT type and latency", to what it checks)', () => {
    page = bootConsole(document, window, sampleAdapters(), { keymap: true });
    open('network');
    expect(hintOf('Connection test')).toBe('Checks reach and latency');
    noRepeats();
  });

  it('WIP and COMING follow their title, in the title\'s line (the item marked has-tag)', () => {
    page = bootConsole(document, window, sampleAdapters(), { keymap: true });
    // FWIP (the owner, 2026-10-31): Forge's tag reads WIP (was: EXPERIMENT).
    for (const [cat, title, word] of [['experiments', 'Forge', 'WIP'], ['profile', 'Profiles', 'COMING']] as const) {   // LR-37 (9): Online's Custom matches row is gone; the sample's Profiles is Coming
      page.ctl.doAct('cat:' + cat);
      page.render();
      const item = [...document.querySelectorAll<HTMLElement>('#stage .cx-item')].find((x) => x.querySelector('.cx-item__title')?.textContent === title)!;
      expect(item, `${cat}: ${title}`).toBeDefined();
      const tag = item.querySelector('.cx-item__state')!;
      expect(tag.textContent).toBe(word);
      expect(item.querySelector('.cx-item__title')!.nextElementSibling, `${title}: the tag right after the title`).toBe(tag);
      expect(item.classList.contains('has-tag')).toBe(true);
    }
  });

  it('the sheet: a tagged item\'s title track is its own width and the tag starts beside it, wherever the item\'s grid is set', () => {
    const grids = PAGE_RULES.filter((r) => r.sel.some((x) => /^(\.cx-home )?\.cx-item$/.test(x)) && /grid-template-columns/.test(r.body));
    expect(grids.length).toBeGreaterThan(0);
    for (const g of grids) {
      const sel = g.sel.find((x) => /^(\.cx-home )?\.cx-item$/.test(x))!;
      const first = /grid-template-columns:\s*(\S+)/.exec(g.body)![1]!;
      const tagged = PAGE_RULES.find((r) => r.sel.includes(`${sel}.has-tag`) && r.media.join('|') === g.media.join('|') && /grid-template-columns/.test(r.body));
      expect(tagged, `${sel} under ${g.media.join(' and ') || 'no media'}`).toBeDefined();
      expect(tagged!.body.replace(/\s+/g, ' ')).toContain(`grid-template-columns: ${first} minmax(0, max-content) minmax(0, 1fr)`);
    }
    const state = PAGE_RULES.find((r) => r.sel.includes('.cx-item.has-tag .cx-item__state'));
    expect(state?.body).toMatch(/justify-self:\s*start/);
    expect(PAGE_RULES.find((r) => r.sel.includes('.cx-item.has-tag .cx-item__sub'))?.body).toMatch(/grid-column:\s*2 \/ -1/);
  });
});

/*
 * LR-23 (LR.R22, the owner: "The entire right side overlay for the selected category - gone"): Play's panel is gone, so
 * P11's facts about its rows are too. Was: the Microphone row carried the Disc and Controller rows' ring (empty and
 * unbadged off, full with the check badge on), Deploy none; no teal line between "Change disc" and the cog in the panel;
 * a check's line wrapping to two lines before it is cut. The ring's colour on an info row stays the rows' kind.
 */
describe('LR-20 (3) P11, superseded for Home by LR.R22 (LR-23): no panel; the info row\'s ring colour stays', () => {
  it('no check list on the page\'s Home', () => {
    page = bootConsole(document, window, sampleAdapters(), { keymap: true });
    expect(document.querySelector('#stage .cx-checklist')).toBeNull();
    expect(PAGE_RULES.filter((r) => r.sel.some((x) => x.includes('.cx-checklist')))).toEqual([]);
  });

  it('the ring\'s colour on the info row (the accent, good when on)', () => {
    expect(value(['.cx-r--info.has-ring'], '--cx-r-ring', 1280)).toBe('var(--s2u-lx-accent)');
    expect(value(['.cx-r--info.has-ring.is-good'], '--cx-r-ring', 1280)).toBe('var(--s2u-lx-good)');
  });
});

describe('LR-20 (4) Q8: the Signed out screen is the message -- no "Signed out" toast over it; toasts elsewhere stay', () => {
  function bootSession(mode: 'page' | 'overlay' = 'page') {
    const sample = sampleAdapters();
    let signed = true;
    const A: Adapters = {
      ...sample,
      card: { ...sample.card, names: () => ['ALPHA-1', 'WRAITH-6'] },
      session: { ...sample.session, signedIn: () => signed, persona: () => (signed ? 'WRAITH-6' : ''), async signOut() { signed = false; } },
    };
    page = bootConsole(document, window, A, { keymap: true, ...(mode === 'overlay' ? { mode, close: () => {} } : {}) });
    return page.ctl;
  }
  const toast = (): string => document.getElementById('toast')?.textContent?.trim() ?? '';
  const signOut = async (ctl: ReturnType<typeof bootSession>): Promise<void> => {
    ctl.doAct('signout');
    ctl.press('down');
    ctl.press('cross');
    await vi.advanceTimersByTimeAsync(0);
  };

  it('a sign-out from the launcher page: the screen, and no toast repeating its heading', async () => {
    const ctl = bootSession();
    await signOut(ctl);
    expect(ctl.S.overlay).toBe('signedout');
    expect(ctl.S.toast).toBe('');
    expect(toast()).toBe('');
  });

  it('over a game (no resting screen) the toast still says it; a later toast on the launcher is drawn', async () => {
    const ctl = bootSession('overlay');
    await signOut(ctl);
    expect(ctl.S.overlay).not.toBe('signedout');
    expect(toast()).toBe('Signed out');
    page!.dispose(); page = null; mountShell(document);
    const c2 = bootSession();
    await signOut(c2);
    c2.press('circle');
    c2.toast('Disc ready: SOCOM II');
    c2.render();
    expect(toast()).toBe('Disc ready: SOCOM II');
  });
});

describe('LR-20 (5) Q12: the App tab and item have their own mark (the artifact\'s install_desktop), not Display\'s monitor', () => {
  it('the live and the sample App tabs, and Settings\' App item, carry the install mark', () => {
    bootLive();
    const live = page!.ctl.A.options.categories();
    expect(live.find((c) => c.id === 'app')!.icon).toBe('install');
    expect(live.find((c) => c.id === 'display')!.icon).toBe('display');
    open('app');
    const tab = document.querySelector('#stage .cx-tab.is-current svg')!.innerHTML;
    open('display');
    expect(document.querySelector('#stage .cx-tab.is-current svg')!.innerHTML).not.toBe(tab);
    page!.dispose(); page = null; mountShell(document);
    page = bootConsole(document, window, sampleAdapters(), { keymap: true });
    expect(page.ctl.A.options.categories().find((c) => c.id === 'app')!.icon).toBe('install');
    expect(homeItems('options', page.ctl.S, page.ctl.A).some((x) => x.act === 'opt:app')).toBe(false);
  });

  it('the mark is drawn in the set\'s own stroke (no fill, no fetched font)', () => {
    const svg = (P as Record<string, string>)['install'];
    expect(svg).toBeTruthy();
    expect(svg).not.toMatch(/fill=|font|url\(/);
    expect(svg).not.toBe(P.display);
  });
});

/* ---------- LR-20 (7): the short phone landscape's rail and list, read from the rules as lr17Landscape reads them ---------- */

interface Env { w: number; h: number; pointer: 'fine' | 'coarse'; input: 'pointer' | 'pad' }
/** `prop` on the element `sel` names at `env`: the strongest tier first, within it the later rule; a box side read off its shorthand. */
function declAt(sel: string, prop: string, env: Env): string | null {
  const box = /^(margin|padding)-(top|right|bottom|left)$/.exec(prop);
  for (const tier of TIERS) {
    let v: string | null = null;
    for (const r of tier) {
      if (!applies(r, env) || !r.sel.includes(sel)) continue;
      for (const [n, val] of declsOf(r.body)) {
        if (n === prop) v = val;
        else if (box && n === box[1]) v = side(val, (['top', 'right', 'bottom', 'left'] as const).indexOf(box[2] as 'top') as 0 | 1 | 2 | 3);
      }
    }
    if (v != null) return v;
  }
  return null;
}
const needAt = (sel: string, prop: string, env: Env): string => {
  const v = declAt(sel, prop, env);
  if (v == null) throw new Error(`no ${prop} for ${sel} at ${env.w}x${env.h}`);
  return v;
};

/** LR.R12's 640x360 and the other phone landscapes at or under 760px wide (the iPhone SE's 568x320, 667x375, 740x360). */
const PHONE_LANDSCAPES: readonly (readonly [number, number])[] = [[640, 360], [568, 320], [667, 375], [740, 360]];

describe('LR-20 (7) Q4: at 640x360 the rail\'s neighbours clear the L1 / R1 chips, the list fades at its bottom edge', () => {
  for (const [w, h] of PHONE_LANDSCAPES) for (const pointer of ['fine', 'coarse'] as const) {
    it(`${w}x${h}, ${pointer}: every mark the strip draws is whole and opaque, or not drawn; none under a chip`, () => {
      const env: Env = { w, h, pointer, input: 'pointer' };
      const px = rootFontPx(w, h, 0);
      const a0 = { w, h, ui: 0, px, bar: 0 };
      const len = (v: string, a = a0, pct = false): number => rem(v, a, pct) * px;
      const stage = w - len(needAt('.cx-app', 'padding-left', env)) - len(needAt('.cx-app', 'padding-right', env));
      const bar = len(needAt('.cx-crossbar', 'width', env), { ...a0, bar: stage / px }, true);
      const at = { ...a0, bar: bar / px };
      const width = declAt('.cx-crossbar__strip', 'width', env);
      expect(width === null || width === 'auto', `the strip's width (${width}) must leave its two insets to set it`).toBe(true);
      const left = len(needAt('.cx-crossbar__strip', 'left', env), at, true);
      const right = bar - len(needAt('.cx-crossbar__strip', 'right', env), at, true);
      const hint = Math.max(len(declAt('.cx-crossbar__hint', 'width', env) ?? '0px'), len(needAt('.cx-crossbar__hint', 'min-width', env)), len(needAt('.cx-crossbar__hint .cx-shoulder', 'min-width', env)));
      expect(left, 'the strip starts past the L1 chip').toBeGreaterThanOrEqual(hint);
      expect(bar - right, 'the strip ends before the R1 chip').toBeGreaterThanOrEqual(hint);
      const mask = needAt('.cx-crossbar__strip', 'mask-image', env);
      const stop = /#000 ([\d.]+)%/.exec(mask);
      expect(stop, mask).not.toBeNull();
      const fade = (Number(stop![1]) / 100) * (right - left);
      const pitch = len('var(--s2u-cx-cat-pitch)', at);
      const icon = len(needAt('.cx-cat .cx-ico', 'width', env));
      const mid = bar / 2;
      for (let k = -4; k <= 4; k++) {
        const lo = mid + k * pitch - icon / 2;
        const hi = lo + icon;
        const drawn = hi > left && lo < right;
        if (!drawn) continue;
        expect(lo, `the mark ${k} from the current, ${lo.toFixed(1)}..${hi.toFixed(1)} in a strip ${left.toFixed(1)}..${right.toFixed(1)} fading ${fade.toFixed(1)}px: cut or faded at the chip`).toBeGreaterThanOrEqual(left + fade);
        expect(hi).toBeLessThanOrEqual(right - fade);
      }
    });
  }

  it('640x360: Home\'s list fades at its bottom edge over a padding as long as the fade; none under the theme list', () => {
    for (const pointer of ['fine', 'coarse'] as const) for (const input of ['pointer', 'pad'] as const) {
      const env: Env = { w: 640, h: 360, pointer, input };
      const px = rootFontPx(640, 360, 0);
      const mask = needAt('.cx-home .cx-list', 'mask-image', env);
      expect(declAt('.cx-home .cx-list', '-webkit-mask-image', env)).toBe(mask);
      const m = /^linear-gradient\(180deg, #000 calc\(100% - ([\d.]+rem)\), transparent\)$/.exec(mask);
      expect(m, mask).not.toBeNull();
      const fade = rem(m![1]!, { w: 640, h: 360, ui: 0, px, bar: 0 });
      expect(rem(needAt('.cx-home .cx-list', 'padding-bottom', env), { w: 640, h: 360, ui: 0, px, bar: 0 })).toBeGreaterThanOrEqual(fade);
      expect(needAt('.cx-home .cx-list', 'box-sizing', env)).toBe('border-box');
      expect(needAt('.cx-home .cx-list:has(.cx-dropup)', 'mask-image', env)).toBe('none');
    }
  });

  it('the tall and the wider screens keep their rail: no LR-20 rule holds at 1280x720, 844x390 or 390x844', () => {
    for (const [w, h] of [[1280, 720], [844, 390], [390, 844], [1024, 768]] as const) {
      const env: Env = { w, h, pointer: 'fine', input: 'pointer' };
      const mine = TIERS[0]!.filter((r) => r.sel.some((s) => s === '.cx-home .cx-list' || s === '.cx-crossbar__strip') && /mask-image|max\(/.test(r.body) && r.media.some((m) => /max-width: 760px/.test(m) && /max-height/.test(m)));
      expect(mine.length, 'the LR-20 block').toBeGreaterThan(0);
      for (const r of mine) expect(applies(r, env), `${w}x${h}`).toBe(false);
    }
  });
});

/**
 * LR-20's fold (2) (the coordinator, from the box's run at 8b88093ca, `lr-20/1280x720/display.png`: Display with a switch
 * focused, the legend offered no Square "Reset to default" where Appearance's rows do). Read: the box's page had no disc,
 * and Display's switches are the memory card's options, whose defaults are the disc's own table (`global_valves.rdr`,
 * `adapters/options.ts` `defaults`, read through `readValveDefaults`): without the disc a switch has no default to go
 * back to and is locked ("Needs disc"), so Square is rightly not offered (LR-20 (6), the catalog's "unavailable where
 * there is none"); the disc in, every Display row has its default and offers it. Brightness (a tuner, whose default is
 * the code's) offers it either way. Pinned on the live Display rows, with and without the disc.
 */
describe('LR-20 fold (2): the live Display rows offer Square wherever they have a default', () => {
  const memory = (): CardSlots => {
    const m = new Map<string, string>();
    const storage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); } };
    return new CardSlots(() => storage as unknown as Storage, () => undefined, { now: () => 5_000 });
  };
  const TABLE: ValveEntry[] = [
    { name: 'BOBBING_1ST_PERSON', value: 1, type: 'PERSIST' }, { name: 'DISPLAY_MP_TEAM_NAMES', value: 1, type: 'PERSIST' },
    { name: 'HelpWindowsEnabled', value: 1, type: 'PERSIST' }, { name: 'ScreenOriginX', value: 100, type: 'PERSIST' },
    { name: 'ScreenOriginY', value: 100, type: 'PERSIST' },
  ];
  const withDisc = (ready: boolean): LauncherState => {
    const assets: DiscAssets = { readValveDefaults: async () => TABLE, readItemNames: async () => new Map() };
    return { disc: () => (ready ? 'ready' : 'empty'), isoInserted: () => ready, filename: () => null, assets: () => (ready ? assets : null), onChange: () => () => {} };
  };
  const flush = async (): Promise<void> => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)); };
  async function bootDisplay(ready: boolean): Promise<void> {
    vi.useRealTimers();
    const options = liveOptions(() => { page?.render(); }, { store: cardOptionStore(memory()), launcher: withDisc(ready), signedIn: () => false, pads: () => [], touch: () => false, install: () => 'chromium' });
    const sample = sampleAdapters();
    page = bootConsole(document, window, { ...sample, data: 'live', states: undefined, options } as Adapters, { keymap: true });
    page.ctl.S.input = 'pad';
    await flush();
    open('display');
  }

  it('no disc: Brightness (the code\'s default) offers it; a switch (its default the disc\'s, locked "Needs disc") does not', async () => {
    await bootDisplay(false);
    focusRow('Brightness');
    expect(has('square', 'Reset to default')).toBe(true);
    focusRow('Head bob');
    expect(page!.ctl.A.options.categories().find((c) => c.id === 'display')!.rows.find((r) => r.label === 'Head bob')).toMatchObject({ locked: 'Needs disc' });
    expect(has('square', 'Reset to default')).toBe(false);
  });

  it('the disc in: every Display row with values has its default and offers Square', async () => {
    await bootDisplay(true);
    const rows = page!.ctl.A.options.categories().find((c) => c.id === 'display')!.rows.filter((r) => r.values && r.values.length > 1);
    expect(rows.length).toBeGreaterThan(3);
    for (const r of rows) {
      expect(r.def, r.label).not.toBeUndefined();
      focusRow(r.label);
      expect(has('square', 'Reset to default'), r.label).toBe(true);
    }
  });
});

/*
 * LR-20's fold (4) (the box at 8b88093ca, 844x390: the disc check's line clipped in Play's panel) -- superseded for Home by
 * LR.R22 (LR-23): the panel and its disc check are gone; the disc's line rides on the legend chip (visually hidden). Was:
 * on a short landscape screen the check's chip dropped and its line given the room for two lines.
 */

/**
 * LR-20's fold (5) (the coordinator, from the box's run at 8b88093ca: at 640x360 the neighbour marks sat under the L1 / R1
 * chips). Read on the box's own shots (`lr-20/640x360/home.png`, `online.png`, `settings.png`, `experiments.png`): the
 * marks stand at x 183, 320 and 455 and the chips end at 52 and start at 587 -- clear -- so nothing is moved; the three
 * marks' whole boxes (each a pitch wide, the current one and its two neighbours) are pinned clear of the chips' boxes, as
 * LR-20 (7) pins the marks themselves.
 */
describe('LR-20 fold (5): at 640x360 the current mark\'s and its neighbours\' boxes lie between the L1 and R1 chips', () => {
  for (const [w, h] of PHONE_LANDSCAPES) for (const pointer of ['fine', 'coarse'] as const) {
    it(`${w}x${h}, ${pointer}`, () => {
      const env: Env = { w, h, pointer, input: 'pointer' };
      const px = rootFontPx(w, h, 0);
      const a0 = { w, h, ui: 0, px, bar: 0 };
      const len = (v: string, a = a0, pct = false): number => rem(v, a, pct) * px;
      const stage = w - len(needAt('.cx-app', 'padding-left', env)) - len(needAt('.cx-app', 'padding-right', env));
      const bar = len(needAt('.cx-crossbar', 'width', env), { ...a0, bar: stage / px }, true);
      const pitch = len('var(--s2u-cx-cat-pitch)', { ...a0, bar: bar / px });
      const hint = Math.max(len(needAt('.cx-crossbar__hint', 'min-width', env)), len(needAt('.cx-crossbar__hint .cx-shoulder', 'min-width', env)));
      const mid = bar / 2;
      for (const k of [-1, 0, 1]) {
        const lo = mid + k * pitch - pitch / 2;
        const hi = lo + pitch;
        expect(lo, `the mark ${k}'s box ${lo.toFixed(1)}..${hi.toFixed(1)} against L1's 0..${hint.toFixed(1)}`).toBeGreaterThanOrEqual(hint);
        expect(hi, `against R1's ${(bar - hint).toFixed(1)}..${bar.toFixed(1)}`).toBeLessThanOrEqual(bar - hint);
      }
    });
  }
});
