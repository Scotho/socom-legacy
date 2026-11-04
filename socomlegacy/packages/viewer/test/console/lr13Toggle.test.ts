// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { liveOptions } from '../../src/console/adapters/options';
import { prompts } from '../../src/console/render/legend';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import type { Adapters } from '../../src/console/state';
import type { LauncherState } from '../../src/modern/launcherState';
import { PAGE } from './cascade';
import { optRowEls, optRowLabel, optRowValue } from './optRows';
import { mountShell } from './shell';

/**
 * LR-13, item B (LR.R16 (1) and (6), the owner, 2026-10-26T18:40Z: "clicking or pressing a toggle flips it, with a
 * snappy and fun animation"; "Cross flips a toggle"): a toggle row of Settings (an Off / On choice, `render/options.ts`'s
 * toggle kind) flips on Cross and on a click of the row, saying the setting cue (`toggle`) as a step does; Left / Right
 * keep stepping it; the clock stays a select (Cross does nothing there). The flip's motion is the artifact's toggle
 * (`S2-Launcher-v2.dc.html`: the pill's `transition: background .2s`, the knob's `transition: left .2s`) on the
 * `--s2u-lx-*` tokens, with the system's overshoot (`--s2u-ease-lx-pop`) and a squash of the knob for the owner's "snappy and fun", none under
 * reduced motion. A browser adaptation: the launcher's look and input, nothing of the game.
 */
let page: ConsolePage | null = null;
beforeEach(() => { localStorage.clear(); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; localStorage.clear(); });

const launcher = (): LauncherState => ({ disc: () => 'empty', isoInserted: () => false, filename: () => null, assets: () => null, onChange: () => () => {} });
function boot() {
  const options = liveOptions(() => { page?.render(); }, { launcher: launcher(), signedIn: () => false, pads: () => [], touch: () => false });
  const sample = sampleAdapters();
  const played: string[] = [];
  const cue = { selection: () => { played.push('move'); }, play: (c: string) => { played.push(c); } };
  page = bootConsole(document, window, { ...sample, data: 'live', states: undefined, options, cue, session: { ...sample.session, signedIn: () => false } } as unknown as Adapters, { keymap: true });
  page.ctl.doAct('opt:appearance');
  page.render();
  return { ctl: page.ctl, options, played };
}
const row = (label: string): HTMLElement => optRowEls().find((r) => optRowLabel(r) === label)!;
const focus = (label: string): void => { page!.ctl.S.opt.row = optRowEls().findIndex((r) => optRowLabel(r) === label); page!.render(); };

describe('LR-13 B: a toggle flips on Cross and on a click', () => {
  // LR-37 (1): Backdrop motion is On by default now (was Off, LATER 197).
  it('Cross flips Backdrop motion On -> Off -> On, with the setting cue each time', () => {
    const { ctl, played } = boot();
    focus('Backdrop motion');
    expect(optRowValue(row('Backdrop motion'))).toBe('On');
    played.length = 0;
    ctl.press('cross');
    expect(optRowValue(row('Backdrop motion'))).toBe('Off');
    ctl.press('cross');
    expect(optRowValue(row('Backdrop motion'))).toBe('On');
    expect(played).toEqual(['toggle', 'toggle']);
  });

  it('Left / Right still step it (the ends kept)', () => {
    const { ctl } = boot();
    focus('Backdrop motion');
    ctl.press('right');
    expect(optRowValue(row('Backdrop motion'))).toBe('On');
    ctl.press('right');
    expect(optRowValue(row('Backdrop motion'))).toBe('On');
    ctl.press('left');
    expect(optRowValue(row('Backdrop motion'))).toBe('Off');
  });

  it('a click on the row flips it (the row an action for the pointer); a click on the pill too', () => {
    boot();
    row('Launcher sounds').click();
    expect(optRowValue(row('Launcher sounds'))).toBe('Off');                    // On by default (CX-52), flipped
    row('Launcher sounds').querySelector<HTMLElement>('.cx-r__pill')!.click();
    expect(optRowValue(row('Launcher sounds'))).toBe('On');
  });

  it('the clock stays a select: Cross changes nothing there, Left / Right step it', () => {
    const { ctl } = boot();
    focus('Clock');
    expect(row('Clock').classList.contains('cx-r--select')).toBe(true);
    const was = optRowValue(row('Clock'));
    ctl.press('cross');
    expect(optRowValue(row('Clock'))).toBe(was);
    ctl.press('right');
    expect(optRowValue(row('Clock'))).not.toBe(was);
  });

  it('the legend names Cross on a toggle ("Toggle"), beside Left / Right\'s Change', () => {
    const { ctl } = boot();
    focus('Backdrop motion');
    const said = prompts(ctl.S, ctl.A).map((p) => [p.k, p.label]);
    expect(said).toContainEqual(['cross', 'Toggle']);
    expect(said).toContainEqual(['dpad-h', 'Change']);
  });
});

describe('LR-13 B (review F4): the knob motion plays only on a flip, never on a row that is merely drawn', () => {
  const flipped = (): string[] => optRowEls().filter((r) => r.classList.contains('is-flipped')).map(optRowLabel);
  it('a fresh draw (a tab opened) carries no flip class on any toggle', () => {
    boot();
    expect(optRowEls().some((r) => r.classList.contains('cx-r--toggle'))).toBe(true);
    expect(flipped()).toEqual([]);
  });

  it('a flip (Cross, a step, a click) marks that row alone; the next draw does not', () => {
    const { ctl } = boot();
    focus('Backdrop motion');
    ctl.press('cross');
    expect(flipped()).toEqual(['Backdrop motion']);
    page!.render();
    expect(flipped()).toEqual([]);
    ctl.press('right');                                                 // LR-37 (1): Off after the flip (it starts On), so Right steps it
    expect(flipped()).toEqual(['Backdrop motion']);
    ctl.press('down');
    expect(flipped()).toEqual([]);
    row('Launcher sounds').click();
    expect(flipped()).toEqual(['Launcher sounds']);
  });
});

describe('LR-13 B: the flip\'s motion, the artifact\'s toggle made snappy', () => {
  it('the pill\'s ground and the knob move over the artifact\'s .2s; the knob springs past its end and squashes as it flips', () => {
    // Every rule ending in this selector (the base rule, and the motion's own under no-preference), their bodies joined.
    const rule = (sel: string): string =>
      [...PAGE.matchAll(new RegExp(`${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'g'))].map((m) => m[1]).join(' ');
    expect(rule('.cx-r__pill')).toMatch(/transition: background 0\.2s/);
    expect(rule('.cx-r__knob')).toMatch(/transition: transform 0\.2s var\(--s2u-ease-lx-pop\)/);   // the system's overshoot, no new token
    expect(PAGE).toMatch(/@keyframes cx-lx-flip-on\s*\{/);
    expect(PAGE).toMatch(/@keyframes cx-lx-flip-off\s*\{/);
    expect(rule('.cx-r--toggle.is-flipped.is-on .cx-r__knob')).toMatch(/animation: cx-lx-flip-on 0\.2s/);
    expect(rule('.cx-r--toggle.is-flipped:not(.is-on) .cx-r__knob')).toMatch(/animation: cx-lx-flip-off 0\.2s/);
  });

  it('none of it under reduced motion', () => {
    const reduced = [...PAGE.matchAll(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?\}\s*)\}/g)].map((m) => m[1]!).join('\n');
    expect(reduced).toMatch(/\.cx-r__knob[^{]*\{[^}]*animation: none/);
  });
});

