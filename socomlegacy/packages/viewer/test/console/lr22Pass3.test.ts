// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { CardSlots } from '@s2u/card';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { prompts } from '../../src/console/render/legend';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import type { OptRow } from '../../src/console/state';
import { mountShell } from './shell';
import { liveOptions } from '../../src/console/adapters/options';
import { P } from '../../src/console/icons';
import { cardOptionStore } from '../../src/modern/settings/store';
import { keepAsideEdges, markEdges, moreOf } from '../../src/console/render/options';
import { declsOf, PAGE, ruleApplies, TIERS, words, type MediaEnv } from './cascade';

/**
 * LR-22 (the LR.R11 side-by-side's pass 3, `agent-mail/evidence/review-lr-7-side-by-side-3.md`, R1-R8; the LR-7 matrix 2's
 * shots at a8579e3ce). jsdom has no layout, so the rules are read as `./lr18Tabs.test.ts` and `./lr19Legend.test.ts` read them:
 * `./cascade`'s tiers at a window (size, pointer, the options container's width). A browser adaptation: the launcher's
 * layout, nothing of the game.
 */

/** `prop` on the element `sels` names (the first selector that has one), the strongest tier first, at `env`. */
function read(sels: string[], prop: string, env: MediaEnv): string | null {
  for (const tier of TIERS) {
    for (const sel of sels) {
      let v: string | null = null;
      for (const r of tier) {
        if (!r.sel.includes(sel) || !ruleApplies(r, env)) continue;
        for (const [n, val] of declsOf(r.body)) {
          if (n === prop) v = val;
          else if (n === 'padding' && /^padding-(top|bottom)$/.test(prop)) v = words(val)[0]!;      // the shorthand's block sides
        }
      }
      if (v != null) return v;
    }
  }
  return null;
}
const need = (sels: string[], prop: string, env: MediaEnv): string => {
  const v = read(sels, prop, env);
  if (v == null) throw new Error(`no ${prop} for ${sels.join(' / ')} at ${env.w}x${env.h}`);
  return v;
};

/* ---------- R1 + R2: the Settings description panel stays inside the stage ---------- */

describe('LR-22 R1/R2: under the CX-ASIDE grid the description panel keeps a least height inside the body and scrolls its own text', () => {
  const BODY = ['.cx-screen[data-key="options"] .cx-screen__body'];
  const ASIDE = ['.cx-screen[data-key="options"] .cx-aside'];
  // 1024x768 at 100 % and 1280x720 at 130 % (the root 16.64px: the container is 76.9rem less the frame's padding): both < 79.75rem.
  for (const [label, env] of [['1024x768', { w: 1024, h: 768, stageRem: 70 }], ['1280x720 at Interface 130 %', { w: 1280, h: 720, stageRem: 70 }]] as const) {
    it(`${label}: the aside's track has a least (it never collapses to its padding and overdraws the legend), the tab row yields it`, () => {
      const tracks = words(need(BODY, 'grid-template-rows', env));
      expect(tracks).toHaveLength(2);
      const m = /^minmax\(([\d.]+)rem, auto\)$/.exec(tracks[1]!);
      expect(m, `the aside's track is minmax(<least>rem, auto): ${tracks[1]}`).not.toBeNull();
      const least = Number(m![1]);
      expect(least, 'a title and a line or two').toBeGreaterThanOrEqual(6);
      expect(tracks[0], 'the tab row leaves the aside its least of the body').toContain(`calc(100% - ${m![1]}rem)`);
    });
    it(`${label}: the aside's padding leaves its text a line (a 7.5rem track holds the padding and a title)`, () => {
      const pt = Number(/^([\d.]+)rem$/.exec(need(ASIDE, 'padding-top', env))![1]);
      expect(pt * 2, 'the vertical padding').toBeLessThanOrEqual(2.5);
      expect(need(ASIDE, 'overflow-y', env)).toBe('auto');
    });
  }
  it('the aside fades the edge its text can still scroll toward (render/options.ts keepAsideEdges marks data-more)', () => {
    const env = { w: 1024, h: 768, stageRem: 70 };
    for (const more of ['end', 'start', 'start end']) {
      const m = read([`.cx-screen[data-key="options"] .cx-aside[data-more="${more}"]`], 'mask-image', env);
      expect(m, `data-more="${more}"`).toMatch(/linear-gradient\(180deg/);
    }
  });
});

describe('LR-22 R2: keepAsideEdges marks the edge the panel text can still scroll toward', () => {
  it('moreOf: nothing where it fits, end at the top, both mid-way, start at the bottom', () => {
    expect(moreOf(0, 0)).toBe('');
    expect(moreOf(0, 1)).toBe('');
    expect(moreOf(0, 40)).toBe('end');
    expect(moreOf(20, 40)).toBe('start end');
    expect(moreOf(40, 40)).toBe('start');
  });
  it('the Options aside gets data-more from its scroll metrics, and loses it where the text fits', () => {
    document.body.innerHTML = '<div id="stage"><section data-key="options"><aside class="cx-aside"></aside></section></div>';
    const aside = document.querySelector<HTMLElement>('.cx-aside')!;
    let room = 60;
    Object.defineProperty(aside, 'scrollHeight', { configurable: true, get: () => 100 + room });
    Object.defineProperty(aside, 'clientHeight', { configurable: true, get: () => 100 });
    keepAsideEdges(document);
    expect(aside.dataset['more']).toBe('end');
    aside.scrollTop = 30;
    aside.dispatchEvent(new Event('scroll'));
    expect(aside.dataset['more']).toBe('start end');
    room = 0;
    aside.scrollTop = 0;
    keepAsideEdges(document);
    expect(aside.hasAttribute('data-more')).toBe(false);
  });
});

/* ---------- R3: the legend's labels keep their descenders ---------- */

describe('LR-22 R3: a prompt label box is a full line, so its one-line clip cuts below the descenders', () => {
  const LABEL = ['.cx-legend .cx-prompt > .cx-label'];
  for (const [w, h] of [[1920, 1080], [1280, 720], [1024, 768], [844, 390], [640, 360]] as const) {
    it(`${w}x${h}: the label's line-height is at least 1.2 (it is clipped by overflow: hidden for its ellipsis; the font's line-height 1 cut "y", "g", "p")`, () => {
      const env = { w, h, pointer: w < 900 ? 'coarse' : 'fine' } as const;
      expect(need(LABEL, 'overflow', env), 'still clipped, for the ellipsis').toBe('hidden');
      expect(Number(need(LABEL, 'line-height', env))).toBeGreaterThanOrEqual(1.2);
    });
  }
});

/* ---------- R4: the Play sheet at the artifact's pixels -- gone with the sheet (LR-23) ---------- */

/*
 * LR-23 (LR.R22, the owner: "The entire right side overlay for the selected category - gone"): the Play sheet is gone, so
 * its px pins are too (was: min(660px, 64vw) wide; 34 / 15 / 12px head, 17 / 13px rows, the head's 0 44px 22px padding).
 * LR-22 R4's point -- the artifact's own px, not rem on the scaled root -- carries into LR-23's Home (lr23Home.test.ts).
 */
describe('LR-22 R4 (superseded for Home by LR.R22): no Play sheet rules', () => {
  it('no rule names the sheet', () => {
    expect(PAGE.includes('.cx-home.is-sheet')).toBe(false);
  });
});

/* ---------- R5: the Mobile tab has its own mark ---------- */

describe('LR-22 R5: the Mobile tab icon is a phone, not the Controller gamepad', () => {
  it('the live Options tabs: every category has its own icon, Mobile the phone', () => {
    const m = new Map<string, string>();
    const storage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); } };
    const slots = new CardSlots(() => storage as unknown as Storage, () => undefined, { now: () => 5_000 });
    const o = liveOptions(() => {}, { store: cardOptionStore(slots), signedIn: () => false, pads: () => [], touch: () => true, launcher: { disc: () => 'empty', isoInserted: () => false, filename: () => null, assets: () => null, onChange: () => () => {} } });
    const cats = o.categories();
    const icons = cats.map((c) => c.icon);
    expect(cats.map((c) => c.id)).toContain('mobile');
    expect(new Set(icons).size, `the tabs' icons: ${icons.join(', ')}`).toBe(icons.length);
    expect(cats.find((c) => c.id === 'mobile')!.icon).toBe('phone');
    expect(P.phone).not.toBe(P.pad);
    expect(P.phone).not.toMatch(/fill=|stroke=|style=|<image|href/);
  });
});

/* ---------- R7: the short landscape list keeps the focused first item's frame ---------- */

describe('LR-22 R7: in a short landscape the Home body and list keep the focused first item frame: the focus room above it, clipped by neither', () => {
  const ROOM = 'calc(var(--s2u-focus-w) + 3px)';
  for (const [w, h] of [[844, 390], [640, 360], [1024, 540]] as const) {
    const env = { w, h };
    it(`${w}x${h}: the body (overflow hidden) pads its top by the focus room and takes it off its 8px margin; the list's own top room is given back`, () => {
      expect(need(['.cx-home__body'], 'overflow', env)).toBe('hidden');
      expect(need(['.cx-home__body'], 'padding-top', env)).toBe(ROOM);
      expect(need(['.cx-home__body'], 'margin', env)).toBe(`calc(8px - (var(--s2u-focus-w) + 3px)) 0 0`);
      expect(need(['.cx-home__body > .cx-list'], 'padding-top', env)).toBe(ROOM);
      expect(need(['.cx-home__body > .cx-list'], 'margin-top', env)).toBe('calc(-1 * (var(--s2u-focus-w) + 3px))');
      expect(need(['.cx-list'], 'overflow-y', env), 'the list scrolls, which clips its first item ring without the room').toBe('auto');
    });
  }
  it('a tall window is unchanged: the body has no top padding there', () => {
    expect(read(['.cx-home__body'], 'padding-top', { w: 1280, h: 720 })).toBeNull();
  });
});

/* ---------- R8: the legend offers nothing a locked or read-only row cannot do ---------- */

describe('LR-22 R8: Toggle / Change are offered exactly where the press changes the row (one predicate, state.ts canChangeRow)', () => {
  it('toggle, select, locked, sign-in, info and action rows, signed in and out: the legend and the D-pad / Cross agree', () => {
    const rows: OptRow[] = [
      { id: 'tog', label: 'Toggle', values: ['Off', 'On'], def: 0, about: '', note: '' },
      { id: 'sel', label: 'Select', values: ['A', 'B', 'C'], def: 0, about: '', note: '' },
      { id: 'lock-tog', label: 'Locked toggle (Needs disc)', values: ['Off', 'On'], def: 0, locked: 'Insert disc', about: '', note: '' },
      { id: 'lock-sel', label: 'Locked select (Needs disc)', values: ['A', 'B'], def: 0, locked: 'Insert disc', about: '', note: '' },
      { id: 'remember', label: 'Remember me', values: ['On the sign-in'], def: 0, locked: 'Chosen on the sign-in', about: '', note: '' },
      { id: 'auth', label: 'Sign-in toggle', values: ['Off', 'On'], def: 0, needsSignIn: true, about: '', note: '' },
      { id: 'info', label: 'Version', info: { value: '1.0' }, about: '', note: '' },
      { id: 'act', label: 'Action', action: 'Run', about: '', note: '' },
    ];
    const seen = { offered: 0, refused: 0 };
    for (const signedIn of [true, false]) {
      const a = sampleAdapters();
      const sets: string[] = [];
      a.session = { ...a.session, signedIn: () => signedIn };
      a.options = { ...a.options, categories: () => [{ id: 'display', label: 'Display', icon: 'display', rows }], value: () => 0, set: (id) => { sets.push(id); }, step: undefined };
      const page: ConsolePage = bootConsole(document, window, a, { keymap: true });
      const { ctl } = page;
      ctl.doAct('opt:display');
      rows.forEach((r, i) => {
        ctl.S.opt = { cat: 0, row: i, zone: 'rows' };
        const labels = prompts(ctl.S, ctl.A).filter((p) => p.label === 'Change' || p.label === 'Toggle').map((p) => p.label);
        const before = sets.length;
        if (r.values) ctl.press('right');
        const changed = sets.length > before;
        const where = `${r.label}, signed ${signedIn ? 'in' : 'out'}`;
        expect(labels.length > 0, `${where}: the legend offers ${labels.join('/') || 'nothing'}, the D-pad ${changed ? 'changes' : 'does nothing'}`).toBe(changed);
        if (r.values) { if (labels.length) seen.offered++; else seen.refused++; }
      });
      page.dispose();
      mountShell(document);
    }
    expect(seen.offered, 'rows that change').toBeGreaterThan(0);
    expect(seen.refused, 'rows that refuse').toBeGreaterThan(0);
  });
});

/* ---------- R6: the Theme list fades the edge it scrolls toward ---------- */

describe('LR-22 R6: the Theme list marks and fades its scrollable edge', () => {
  it('the sheet fades each data-more on .cx-dropup', () => {
    for (const more of ['end', 'start', 'start end']) {
      expect(read([`.cx-dropup[data-more="${more}"]`], 'mask-image', { w: 1280, h: 720 }), more).toMatch(/linear-gradient\(180deg/);
    }
  });
  it('markEdges: end at the top of a taller list, none where it fits', () => {
    const el = document.createElement('ul');
    let room = 50;
    Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => 200 + room });
    Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => 200 });
    markEdges(el);
    expect(el.dataset['more']).toBe('end');
    room = 0;
    markEdges(el);
    expect(el.hasAttribute('data-more')).toBe(false);
  });
});
