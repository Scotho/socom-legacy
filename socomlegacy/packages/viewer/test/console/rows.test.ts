// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { METER_BARS, rowHtml, rowsHtml, type Row } from '../../src/console/render/rows';
import { PAGE, value } from './cascade';

/**
 * LR-1 (the launcher redesign plan, LR.R8): the row kinds of the owner's Claude Design artifact (`S2-Launcher-v2.dc.html`,
 * its `rowsFor` builders and its row template): header, toggle, slider, select, action (primary, muted, danger), link,
 * info (good, warn, bad), list, pick, meter, drop and check, drawn as the artifact draws them, each with its native role
 * so the keyboard, the mouse and a reader reach it as the pad does (LR.R13). The screens adopt them in LR-2..LR-5; what a
 * row says and does is theirs (CX.R5: nothing of the artifact's sample data). A browser adaptation.
 */
const el = (r: Row, focused = false, i = 0): HTMLElement => {
  const box = document.createElement('div');
  box.innerHTML = rowHtml(r, { focused, index: i, act: 'lxrow' });
  return box.firstElementChild as HTMLElement;
};
const W = 1280;

describe('every row', () => {
  it('is a .cx-r of its kind, with the focus mark the pad draws, its index for the click, and the act the screen names', () => {
    const r = el({ kind: 'action', id: 'go', label: 'Go' }, true, 3);
    expect(r.classList.contains('cx-r')).toBe(true);
    expect(r.classList.contains('cx-r--action')).toBe(true);
    expect(r.classList.contains('is-focused')).toBe(true);
    expect(r.dataset['row']).toBe('3');
    expect(r.dataset['act']).toBe('lxrow');
    expect(r.dataset['i']).toBe('3');
    expect(r.dataset['id']).toBe('go');
    expect(el({ kind: 'action', id: 'go', label: 'Go' }).classList.contains('is-focused')).toBe(false);
  });
  it('escapes every word it is given', () => {
    const r = el({ kind: 'info', label: '<i>a</i>', value: '<b>b</b>' });
    expect(r.innerHTML).not.toMatch(/<i>|<b>/);
    expect(r.textContent).toContain('<i>a</i>');
  });
  it('a label\'s hint is its second line, drawn only when given', () => {
    expect(el({ kind: 'action', id: 'a', label: 'A', hint: 'Why' }).querySelector('.cx-r__hint')!.textContent).toBe('Why');
    expect(el({ kind: 'action', id: 'a', label: 'A' }).querySelector('.cx-r__hint')).toBeNull();
  });
  it('the list wraps the rows in one scroll box, the focused one marked', () => {
    const box = document.createElement('div');
    box.innerHTML = rowsHtml([{ kind: 'header', label: 'Sound' }, { kind: 'toggle', id: 't', label: 'T', on: true }, { kind: 'action', id: 'a', label: 'A' }], { focus: 2, act: 'lxrow', key: 'audio' });
    const list = box.firstElementChild as HTMLElement;
    expect(list.classList.contains('cx-rlist')).toBe(true);
    expect(list.hasAttribute('data-scroll')).toBe(true);
    expect(list.dataset['key']).toBe('rows-audio');
    expect([...list.children].map((c) => c.classList.contains('is-focused'))).toEqual([false, false, true]);
  });
});

describe('the kinds', () => {
  it('header: the section\'s name in mono capitals, not focusable; an empty one is the artifact\'s spacer', () => {
    const h = el({ kind: 'header', label: 'Rules' });
    expect(h.tagName).toBe('DIV');
    expect(h.getAttribute('role')).toBe('heading');
    expect(h.textContent).toBe('Rules');
    expect(el({ kind: 'header', label: '' }).classList.contains('is-spacer')).toBe(true);
  });
  it('toggle: a switch, its pill and knob, aria-checked as it is', () => {
    const t = el({ kind: 'toggle', id: 'v', label: 'Vibration', on: true });
    expect(t.tagName).toBe('BUTTON');
    expect(t.getAttribute('role')).toBe('switch');
    expect(t.getAttribute('aria-checked')).toBe('true');
    expect(t.querySelector('.cx-r__pill > .cx-r__knob')).not.toBeNull();
    expect(t.classList.contains('is-on')).toBe(true);
    expect(el({ kind: 'toggle', id: 'v', label: 'V', on: false }).getAttribute('aria-checked')).toBe('false');
  });
  it('slider: a slider role with its range, the fill and the thumb at its share, the value with its unit', () => {
    const s = el({ kind: 'slider', id: 'g', label: 'Gain', value: 70, min: 0, max: 100, step: 5, unit: '%' });
    expect(s.getAttribute('role')).toBe('slider');
    expect(s.getAttribute('tabindex')).toBe('0');
    expect([s.getAttribute('aria-valuemin'), s.getAttribute('aria-valuemax'), s.getAttribute('aria-valuenow')]).toEqual(['0', '100', '70']);
    expect(s.getAttribute('aria-valuetext')).toBe('70%');
    expect(s.querySelector<HTMLElement>('.cx-r__track')!.getAttribute('style')).toBe('--cx-r-pct: 70%');
    expect(s.querySelector('.cx-r__fill')).not.toBeNull();
    expect(s.querySelector('.cx-r__thumb')).not.toBeNull();
    expect(s.querySelector('.cx-r__value')!.textContent).toBe('70%');
    expect(el({ kind: 'slider', id: 'g', label: 'G', value: 2, min: 1, max: 11 }).querySelector<HTMLElement>('.cx-r__track')!.getAttribute('style')).toBe('--cx-r-pct: 10%');
  });
  it('select: the value between the two step marks the pointer takes (the row\'s one stop is itself)', () => {
    const s = el({ kind: 'select', id: 'hud', label: 'HUD', value: 'Full' });
    expect(s.tagName).toBe('BUTTON');
    expect(s.getAttribute('aria-label')).toBe('HUD: Full');
    const steps = [...s.querySelectorAll<HTMLElement>('.cx-r__step')];
    expect(steps.map((x) => [x.textContent, x.dataset['d'], x.getAttribute('aria-hidden')])).toEqual([['‹', '-1', 'true'], ['›', '1', 'true']]);
    expect(s.querySelector('.cx-r__choice')!.textContent).toBe('Full');
  });
  it('action: an arrow at the end; its tone primary, muted (aria-disabled) or danger', () => {
    const a = el({ kind: 'action', id: 'x', label: 'Deploy', tone: 'primary' });
    expect(a.classList.contains('is-primary')).toBe(true);
    expect(a.querySelector('.cx-r__arrow')!.textContent).toBe('→');
    expect(el({ kind: 'action', id: 'x', label: 'X', tone: 'muted' }).getAttribute('aria-disabled')).toBe('true');
    expect(el({ kind: 'action', id: 'x', label: 'X', tone: 'danger' }).classList.contains('is-danger')).toBe(true);
    expect(el({ kind: 'action', id: 'x', label: 'X' }).getAttribute('aria-disabled')).toBeNull();
  });
  it('link: the target\'s icon first, the chevron at the end', () => {
    const l = el({ kind: 'link', id: 'pad', label: 'Controller', icon: 'pad' });
    expect(l.firstElementChild?.classList.contains('cx-r__icon')).toBe(true);
    expect(l.querySelector('.cx-r__arrow')!.textContent).toBe('›');
  });
  it('info: label and value, not focusable; the value\'s tone good, warn or bad', () => {
    const i = el({ kind: 'info', label: 'Status', value: 'Online', tone: 'good' });
    expect(i.tagName).toBe('DIV');
    expect(i.getAttribute('tabindex')).toBeNull();
    expect(i.querySelector('.cx-r__value')!.textContent).toBe('Online');
    expect(i.classList.contains('is-good')).toBe(true);
    expect(el({ kind: 'info', label: 'S', value: 'v', tone: 'warn' }).classList.contains('is-warn')).toBe(true);
    expect(el({ kind: 'info', label: 'S', value: 'v', tone: 'bad' }).classList.contains('is-bad')).toBe(true);
  });
  it('info with an act (LR-10, LR.R13): `reach` makes it reachable by Tab (tabindex 0, data-act, data-i); an icon, marks, muted and tone are RowOpts', () => {
    const box = document.createElement('div');
    box.innerHTML = rowHtml({ kind: 'info', label: 'Private game', value: '' }, { focused: false, index: 4, act: 'lbrow', reach: true, icon: 'lock', attrs: 'data-item="note"' });
    const r = box.firstElementChild as HTMLElement;
    expect(r.getAttribute('tabindex')).toBe('0');
    expect([r.dataset['act'], r.dataset['i'], r.dataset['item']]).toEqual(['lbrow', '4', 'note']);
    expect(r.querySelector('.cx-r__icon rect[x="5"][y="11"]')).not.toBeNull();
    const m = document.createElement('div');
    m.innerHTML = rowHtml({ kind: 'list', id: 'x', label: 'X' }, { focused: false, index: 0, act: 'a', muted: true, tone: 'good' });
    const l = m.firstElementChild as HTMLElement;
    expect(l.getAttribute('aria-disabled')).toBe('true');
    expect(l.classList.contains('is-muted') && l.classList.contains('is-good')).toBe(true);
    // without `reach` an info row stays unreachable
    expect(el({ kind: 'info', label: 'S', value: 'v' }).hasAttribute('data-act')).toBe(false);
  });
  it('list: a label, its hint and a value at the side', () => {
    const l = el({ kind: 'list', id: 'r', label: 'Room', hint: 'Open', value: '6 / 16' });
    expect(l.tagName).toBe('BUTTON');
    expect(l.querySelector('.cx-r__side .cx-r__value')!.textContent).toBe('6 / 16');
  });
  it('pick: a radio in its group, its mark, a theme\'s three swatches or a picture\'s thumbnail when given', () => {
    const p = el({ kind: 'pick', id: 'navy', group: 'theme', label: 'Navy & Gold', picked: true, swatch: ['#03080e', '#2692d4', '#f2b43a'] });
    expect(p.getAttribute('role')).toBe('radio');
    expect(p.getAttribute('aria-checked')).toBe('true');
    expect(p.dataset['group']).toBe('theme');
    expect(p.classList.contains('is-picked')).toBe(true);
    expect([...p.querySelectorAll<HTMLElement>('.cx-r__swatch')].map((s) => s.getAttribute('style'))).toEqual(['background: #03080e', 'background: #2692d4', 'background: #f2b43a']);
    expect(p.querySelector('.cx-r__mark')).not.toBeNull();
    const t = el({ kind: 'pick', id: 'x', group: 'bg', label: 'X', picked: false, thumb: 'blob:pic' });
    expect(t.getAttribute('aria-checked')).toBe('false');
    expect(t.querySelector<HTMLElement>('.cx-r__thumb-pic')!.getAttribute('style')).toBe('background-image: url("blob:pic")');
    expect(() => el({ kind: 'pick', id: 'x', group: 'g', label: 'X', picked: false, swatch: ['red;x', '#000', '#000'] })).toThrow();
  });
  it(`meter: ${METER_BARS} bars, the lit share by the level (blue, then gold, then bad), the threshold marked, a meter role`, () => {
    const m = el({ kind: 'meter', label: 'Input level', hint: '42%', level: 0.75, threshold: 0.35 });
    expect(m.getAttribute('role')).toBe('meter');
    expect(m.getAttribute('aria-valuenow')).toBe('75');
    const bars = [...m.querySelectorAll('.cx-r__bar')];
    expect(bars).toHaveLength(24);
    expect(bars.filter((b) => b.classList.contains('is-lit'))).toHaveLength(18);
    expect(bars.slice(0, 16).every((b) => b.classList.contains('is-low'))).toBe(true);
    expect(bars.slice(16, 18).every((b) => b.classList.contains('is-mid'))).toBe(true);
    expect(bars[8]!.classList.contains('is-threshold')).toBe(true);
    const loud = el({ kind: 'meter', label: 'L', level: 1 });
    expect([...loud.querySelectorAll('.cx-r__bar.is-high')]).toHaveLength(3);
  });
  it('drop: the dashed zone with its words, the bar while it reads', () => {
    const d = el({ kind: 'drop', id: 'iso', label: 'Drop a disc image here', hint: 'or press Cross to browse' });
    expect(d.tagName).toBe('BUTTON');
    expect(d.querySelector('.cx-r__zone')).not.toBeNull();
    expect(d.querySelector('.cx-r__bar-line')).toBeNull();
    const busy = el({ kind: 'drop', id: 'iso', label: 'X', hint: 'Reading', progress: 0.4 });
    expect(busy.querySelector<HTMLElement>('.cx-r__bar-line')!.getAttribute('style')).toBe('--cx-r-pct: 40%');
  });
  it('check: the ring filled by its share, the icon, the badge (check or alert), the state and the chip', () => {
    const ok = el({ kind: 'check', id: 'disc', label: 'Disc ready', hint: 'SOCOM II', icon: 'disc', ok: true, progress: 1, chip: 'Change' });
    expect(ok.classList.contains('is-ok')).toBe(true);
    expect(ok.querySelector<HTMLElement>('.cx-r__ring')!.getAttribute('style')).toBe('--cx-r-pct: 100%');
    expect(ok.querySelector('.cx-r__badge .cx-ico')).not.toBeNull();
    expect(ok.querySelector('.cx-r__chip')!.textContent).toBe('Change');
    const wait = el({ kind: 'check', id: 'pad', label: 'No controller', hint: 'Press a button', icon: 'pad', ok: false, progress: 0, chip: 'Scan' });
    expect(wait.classList.contains('is-ok')).toBe(false);
  });
});

describe('the drawing (the artifact\'s, in the --s2u-lx tokens)', () => {
  const v = (sel: string, prop: string) => value([sel], prop, W);
  it('a row: 54 design px least, 8 by 24 padding, the artifact\'s 4px corners; the focused row lit (ink 6%, a 1px ink frame at 22%)', () => {
    expect(v('.cx-r', 'min-height')).toBe('3.375rem');
    expect(v('.cx-r', 'padding')).toBe('0.5rem 1.5rem');
    expect(v('.cx-r', 'border-radius')).toBe('var(--s2u-radius-lx-row)');
    expect(v('.cx-r.is-focused', 'background')).toBe('color-mix(in srgb, var(--s2u-lx-ink) 6%, transparent)');
    expect(v('.cx-r.is-focused', 'box-shadow')).toBe('inset 0 0 0 1px color-mix(in srgb, var(--s2u-lx-ink) 22%, transparent)');
  });
  it('the label at 17, its hint at 13 at 58%; a header 11 mono capitals in the section blue', () => {
    expect(v('.cx-r__label', 'font')).toBe('400 calc(1.0625rem * var(--cx-text-scale))/1.3 var(--s2u-font-body)');   // LR-46: the launcher's type token (was '400 1.0625rem/1.3 var(--s2u-font-body)')
    expect(v('.cx-r__hint', 'opacity')).toBe('0.58');
    expect(v('.cx-r--header', 'color')).toBe('var(--s2u-lx-section)');
    expect(v('.cx-r--header', 'font')).toBe('400 calc(0.6875rem * var(--cx-text-scale))/1.2 var(--s2u-font-mono)');   // LR-46: the launcher's type token (was '400 0.6875rem/1.2 var(--s2u-font-mono)')
  });
  it('the tones: primary the bright gold, muted the ink at 35%, danger bad; info good, warn the gold, bad', () => {
    expect(v('.cx-r.is-primary .cx-r__label', 'color')).toBe('var(--s2u-lx-accent-hi)');
    expect(v('.cx-r.is-muted .cx-r__label', 'color')).toBe('color-mix(in srgb, var(--s2u-lx-ink) 35%, transparent)');
    expect(v('.cx-r.is-danger .cx-r__label', 'color')).toBe('var(--s2u-lx-bad)');
    expect(v('.cx-r.is-good .cx-r__value', 'color')).toBe('var(--s2u-lx-good)');
    expect(v('.cx-r.is-warn .cx-r__value', 'color')).toBe('var(--s2u-lx-accent)');
    expect(v('.cx-r.is-bad .cx-r__value', 'color')).toBe('var(--s2u-lx-bad)');
  });
  it('the toggle\'s pill 46 by 26, gold when on with the dark knob 20 design px along', () => {
    expect(v('.cx-r__pill', 'width')).toBe('2.875rem');
    expect(v('.cx-r__pill', 'height')).toBe('1.625rem');
    expect(v('.cx-r.is-on .cx-r__pill', 'background')).toBe('var(--s2u-lx-accent)');
    expect(v('.cx-r.is-on .cx-r__knob', 'background')).toBe('var(--s2u-lx-on-accent)');
    expect(v('.cx-r.is-on .cx-r__knob', 'transform')).toBe('translateX(1.25rem)');
  });
  it('the slider\'s track 170 design px, its fill and thumb at --cx-r-pct; the chip and the deploy gold when focused', () => {
    expect(v('.cx-r__track', 'width')).toBe('10.625rem');
    expect(v('.cx-r__fill', 'width')).toBe('var(--cx-r-pct)');
    expect(v('.cx-r__thumb', 'left')).toBe('var(--cx-r-pct)');
    expect(v('.cx-r.is-focused .cx-r__chip', 'background')).toBe('var(--s2u-lx-accent)');
    expect(v('.cx-r.is-focused .cx-r__chip', 'color')).toBe('var(--s2u-lx-on-accent)');
  });
  it('the ring is a conic fill of the share, good when ok and gold while waiting; the meter\'s bars blue, gold and bad', () => {
    expect(v('.cx-r__ring', 'background')).toBe('conic-gradient(var(--cx-r-ring) var(--cx-r-pct), color-mix(in srgb, var(--s2u-lx-ink) 10%, transparent) 0)');
    expect(v('.cx-r--check', '--cx-r-ring')).toBe('var(--s2u-lx-accent)');
    expect(v('.cx-r--check.is-ok', '--cx-r-ring')).toBe('var(--s2u-lx-good)');
    expect(v('.cx-r__bar.is-lit.is-low', 'background')).toBe('var(--s2u-lx-meter)');
    expect(v('.cx-r__bar.is-lit.is-mid', 'background')).toBe('var(--s2u-lx-accent)');
    expect(v('.cx-r__bar.is-lit.is-high', 'background')).toBe('var(--s2u-lx-bad)');
  });
  it('the rows enter as the artifact\'s: from 22 design px right, staggered, and stand still under reduced motion', () => {
    // LR-28 (fact 2): the row fades in place and its contents slide the 22 px inside it (the row clipped sideways), so no
    // frame of the slide widens the list's scrollable overflow. Was: the row's own keyframes, opacity and the transform.
    expect(PAGE).toMatch(/@keyframes cx-lx-row-in \{ from \{ opacity: 0; \} \}/);
    expect(PAGE).toMatch(/@keyframes cx-lx-row-slide \{ from \{ transform: translateX\(1\.375rem\); \} \}/);
    expect(PAGE).toMatch(/\.cx-rlist > \.cx-r \{ animation: cx-lx-row-in [^}]*overflow-x: clip; \}/);
    expect(PAGE).toMatch(/\.cx-rlist > \.cx-r > \* \{ animation: cx-lx-row-slide [^}]*animation-delay: inherit; \}/);
    expect(PAGE).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[^}]*\.cx-rlist > \.cx-r[^}]*animation: none;/);
  });
});
