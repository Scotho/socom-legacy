// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StartupNavigation } from '../src/startupNavigation';

beforeEach(() => {
  document.body.innerHTML = `<main><button id="first">First</button><select><option>A</option><option>B</option></select>
    <input type="range" min="0" max="1" step="0.1" value="0.5"><button hidden>Hidden</button><button disabled>Disabled</button>
    <button id="last">Last</button></main>`;
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
function setup() {
  const pad = { index: 0, id: 'Pad', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  const back = vi.fn(() => true), nav = new StartupNavigation(document.querySelector('main')!, back);
  let now = 0;
  const frame = (buttons: number[] = [], capturing = false) => {
    pad.buttons.forEach((b, i) => { b.pressed = buttons.includes(i); b.value = b.pressed ? 1 : 0; });
    nav.frame(pad, now += 16, capturing);
  };
  const press = (button: number) => { frame(); frame([button]); frame(); };
  return { pad, nav, frame, press, back };
}
it('navigates only usable controls, edits selects/ranges, activates once per press and backs out', () => {
  const { press, frame, back } = setup();
  press(13); expect(document.activeElement?.id).toBe('first');
  expect(document.activeElement?.classList.contains('is-pad-focused')).toBe(true);
  press(13); expect(document.activeElement?.tagName).toBe('SELECT');
  press(15); expect(document.querySelector('select')!.selectedIndex).toBe(1);
  press(13); press(14); expect(document.querySelector('input')!.value).toBe('0.4');
  press(5); expect(document.activeElement?.id).toBe('last');
  const click = vi.fn(); document.querySelector('#last')!.addEventListener('click', click);
  frame([0]); frame([0]); expect(click).toHaveBeenCalledOnce();
  press(1); expect(back).toHaveBeenCalledOnce();
  press(13); expect(document.activeElement?.id).toBe('first');
});
it('requires neutral after connect, capture, focus loss and device changes', () => {
  const { press, frame, pad } = setup();
  frame([0]); expect(document.activeElement).toBe(document.body);
  press(13); expect(document.activeElement?.id).toBe('first');
  const click = vi.fn(); document.querySelector('#first')!.addEventListener('click', click);
  frame([0], true); frame([0]); expect(click).not.toHaveBeenCalled();
  press(0); expect(click).toHaveBeenCalledOnce();
  vi.mocked(document.hasFocus).mockReturnValue(false); frame([0]);
  vi.mocked(document.hasFocus).mockReturnValue(true); frame([0]); expect(click).toHaveBeenCalledOnce();
  frame(); pad.id = 'Other'; frame([0]); expect(click).toHaveBeenCalledOnce();
});
it('left-stick navigation repeats after a delay without activating a button', () => {
  const { frame, pad, nav } = setup();
  frame(); pad.axes[1] = 1; frame(); expect(document.activeElement?.id).toBe('first');
  frame(); expect(document.activeElement?.id).toBe('first');
  nav.frame(pad, 450, false); expect(document.activeElement?.tagName).toBe('SELECT');
});

// LU-4b item 3 (MU.R18; the scope brief 3.3's six cards "3 x 2"; the layout brief 2.9): in a grid (`[data-grid]`, Home's
// summary cards) the D-pad moves by the cards' rendered geometry -- three a row on a desktop, one column on a phone --
// not by the order of the markup; the walk leaves the grid at its edges in the page's order.
describe('grid moves by geometry', () => {
  /** Six cards in a grid between two buttons; `at(i)` is card i's box. */
  function grid(at: (i: number) => { x: number; y: number }) {
    document.body.innerHTML = `<main><button id="before">Before</button><div data-grid>${[0, 1, 2, 3, 4, 5].map((i) => `<section><button id="c${i}">Card ${i}</button></section>`).join('')}</div><button id="after">After</button></main>`;
    for (let i = 0; i < 6; i++) {
      const { x, y } = at(i);
      vi.spyOn(document.getElementById(`c${i}`)!, 'getBoundingClientRect').mockReturnValue({ x, y, left: x, top: y, right: x + 90, bottom: y + 90, width: 90, height: 90, toJSON: () => ({}) } as DOMRect);
    }
    return setup();
  }
  const id = (): string | undefined => document.activeElement?.id;
  it('three a row: Left / Right along the row (staying at its ends), Down / Up between the rows, out at the edges', () => {
    const { press } = grid((i) => ({ x: (i % 3) * 100, y: Math.floor(i / 3) * 100 }));
    (document.getElementById('c0') as HTMLElement).focus();
    press(15); expect(id()).toBe('c1');
    press(15); expect(id()).toBe('c2');
    press(15); expect(id()).toBe('c2');                 // the row's end: no wrap into the next row
    press(13); expect(id()).toBe('c5');                 // straight down, not the next card in the markup
    press(14); expect(id()).toBe('c4');
    press(12); expect(id()).toBe('c1');
    press(12); expect(id()).toBe('before');             // out of the top row: the page's order
    press(13); expect(id()).toBe('c0');
    press(13); expect(id()).toBe('c3');
    press(13); expect(id()).toBe('after');              // out of the bottom row: past the grid
  });
  it('one column (a phone): Down walks the cards, Left / Right stay', () => {
    const { press } = grid((i) => ({ x: 0, y: i * 100 }));
    (document.getElementById('c2') as HTMLElement).focus();
    press(15); expect(id()).toBe('c2');
    press(14); expect(id()).toBe('c2');
    press(13); expect(id()).toBe('c3');
    press(12); press(12); expect(id()).toBe('c1');
  });
  it('the geometry, not the markup: cards laid out by columns are walked by rows', () => {
    // Markup order 0..5, drawn column by column: 0 3 / 1 4 / 2 5 read across as 0 1 2 on the first row.
    const { press } = grid((i) => ({ x: Math.floor(i / 2) * 100, y: (i % 2) * 100 }));
    (document.getElementById('c0') as HTMLElement).focus();
    press(15); expect(id()).toBe('c2');
    press(13); expect(id()).toBe('c3');
    press(14); expect(id()).toBe('c1');
  });
  it('with no layout (no boxes) the grid is walked in the page\'s order', () => {
    const { press } = grid(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < 6; i++) vi.mocked(document.getElementById(`c${i}`)!.getBoundingClientRect).mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) } as DOMRect);
    (document.getElementById('c0') as HTMLElement).focus();
    press(13); expect(id()).toBe('c1');
    press(15); expect(id()).toBe('c2');
  });
});

// LU-4b item 5 (MU-16b's pad, MU.R18): Left / Right adjust a focused slider by its pad step (`data-pad-step`, in the
// slider's units: Settings' tuners step by the original's 2 percent). (Its ARIA radio-group case went with the walker's
// branch in MU2-8: Settings' choices are rollers since MU2-6, and no page the walker reads draws a radio group.)
describe('Left / Right on a slider pad step', () => {
  it('a slider steps by its data-pad-step, clamped to its range, with input and change', () => {
    document.body.innerHTML = '<main><input id="s" type="range" min="0" max="100" step="1" value="97" data-pad-step="2"></main>';
    const { press } = setup();
    const s = document.getElementById('s') as HTMLInputElement;
    const change = vi.fn(); s.addEventListener('change', change);
    s.focus();
    press(14); expect(s.value).toBe('95');
    press(15); press(15); expect(s.value).toBe('99');
    press(15); expect(s.value).toBe('100');
    expect(change).toHaveBeenCalledTimes(4);
  });
});

// LU-4b item 8's finding (the reachability walk, `test/modern/padReach.test.ts`): Play online's rooms and games are
// roving listboxes (`role="option"` rows, one `tabindex="0"`), not buttons; the walker visits a listbox's current option,
// its Up / Down are the list's own arrows, and at the list's end the walk goes on; Cross clicks the row (selects it).
describe('a roving listbox', () => {
  it('the current option is walked to; Up / Down move within the list, then out at its ends; Cross clicks it', () => {
    document.body.innerHTML = `<main><button id="before">Before</button><div role="listbox">${[0, 1, 2].map((i) => `<div role="option" id="o${i}" tabindex="${i === 0 ? 0 : -1}">Row ${i}</div>`).join('')}</div><button id="after">After</button></main>`;
    const rows = [0, 1, 2].map((i) => document.getElementById(`o${i}`)!);
    document.querySelector('[role="listbox"]')!.addEventListener('keydown', (e) => {
      const k = (e as KeyboardEvent).key, at = rows.indexOf(e.target as HTMLElement);
      const to = k === 'ArrowDown' ? Math.min(2, at + 1) : k === 'ArrowUp' ? Math.max(0, at - 1) : -1;
      if (to < 0) return;
      rows.forEach((r, i) => { r.tabIndex = i === to ? 0 : -1; });
      rows[to]!.focus();
    });
    const clicked = vi.fn(); rows[1]!.addEventListener('click', clicked);
    const { press } = setup();
    document.getElementById('before')!.focus();
    const id = (): string | undefined => document.activeElement?.id;
    press(13); expect(id()).toBe('o0');
    press(13); expect(id()).toBe('o1');
    press(0); expect(clicked).toHaveBeenCalledOnce();
    press(13); expect(id()).toBe('o2');
    press(13); expect(id()).toBe('after');
    press(12); expect(id()).toBe('o2');
  });
});

// LU-4b review G1 (dot): Home's focus targets are title buttons inside the cards (the ds stretches the card's hit area
// over it; the memory card has a label row above its title), so the grid's geometry is the cards', not the buttons'.
describe('grid moves measure the cells, not the focused buttons', () => {
  it('unequal, offset title buttons inside aligned cards: Right / Down go by the cards; the button is focused', () => {
    document.body.innerHTML = `<main><div data-grid>${[0, 1, 2, 3, 4, 5].map((i) => `<section id="card${i}"><button id="c${i}">Card ${i}</button></section>`).join('')}</div></main>`;
    const rect = (x: number, y: number, w: number, h: number): DOMRect => ({ x, y, left: x, top: y, right: x + w, bottom: y + h, width: w, height: h, toJSON: () => ({}) } as DOMRect);
    for (let i = 0; i < 6; i++) {
      const cx = (i % 3) * 300, cy = Math.floor(i / 3) * 200;
      vi.spyOn(document.getElementById(`card${i}`)!, 'getBoundingClientRect').mockReturnValue(rect(cx, cy, 280, 180));
      // Card 0's title sits under a label row (low in its card); the others' titles are high and narrow: no overlap
      // between the buttons' own rows.
      vi.spyOn(document.getElementById(`c${i}`)!, 'getBoundingClientRect').mockReturnValue(i === 0 ? rect(cx + 90, cy + 120, 80, 24) : rect(cx + 20, cy + 16, 60 + i * 10, 24));
    }
    const { press } = setup();
    document.getElementById('c0')!.focus();
    press(15); expect(document.activeElement!.id).toBe('c1');
    press(14); expect(document.activeElement!.id).toBe('c0');
    press(13); expect(document.activeElement!.id).toBe('c3');
  });
});

// LU-4b review G2 (dot): the overlay's controls are another realm's (its iframe): the walker recognises a range, a select
// and a radio by what they are, not by this window's constructors.
describe('controls of another document\'s realm (the overlay\'s iframe)', () => {
  it('Right steps a range of an iframe\'s document, Right changes its select; the focus stays', () => {
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const inner = frame.contentDocument!;
    const win = inner.defaultView as Window & typeof globalThis;
    inner.body.innerHTML = '<main><input id="s" type="range" min="0" max="100" step="1" value="50" data-pad-step="2"><select id="sel"><option value="a">A</option><option value="b">B</option></select></main>';
    vi.spyOn(inner, 'hasFocus').mockReturnValue(true);
    vi.spyOn(win.HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
    win.HTMLElement.prototype.scrollIntoView = vi.fn();
    const nav = new StartupNavigation(inner.querySelector('main')!, () => false);
    const pad = { index: 0, id: 'Pad', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    let now = 0;
    const f = (b: number[] = []): void => { pad.buttons.forEach((x, i) => { x.pressed = b.includes(i); x.value = x.pressed ? 1 : 0; }); nav.frame(pad, now += 500, false); };
    const press = (b: number): void => { f(); f([b]); f(); };
    const s = inner.getElementById('s') as HTMLInputElement;
    s.focus(); f();
    press(15);
    expect(s.value).toBe('52');
    expect(inner.activeElement).toBe(s);
    const sel = inner.getElementById('sel') as HTMLSelectElement;
    sel.focus();
    press(15);
    expect(sel.value).toBe('b');
    expect(inner.activeElement).toBe(sel);
    frame.remove();
  });
});

// MU2-8 (MU2-6's review F3): a value the card holds outside a roller's values is shown as itself in a disabled option
// (`./modern/settings` `rollerControl`); Left / Right from it go to the nearest value that way, clamped to the values'
// ends as the console's `optStep` clamps (`src/console/grammar.ts`), never to the list's first.
describe('Left / Right from an off-grid value (a disabled option the select holds)', () => {
  const roller = (values: number[], stray: number): HTMLSelectElement => {
    document.body.innerHTML = `<main><select id="r">${values.map((v) => `<option value="${v}">${v}</option>`).join('')}<option value="${stray}" disabled>${stray}</option></select></main>`;
    const s = document.getElementById('r') as HTMLSelectElement;
    s.value = String(stray);
    return s;
  };
  const steps = [0, 50, 100, 150, 200, 250];
  it('above the values: Left goes to the nearest below (250, not the first); Right is clamped to the same end', () => {
    const s = roller(steps, 300);
    const { press } = setup();
    s.focus();
    press(14); expect(s.value).toBe('250');
    roller(steps, 300).focus();
    press(15); expect((document.getElementById('r') as HTMLSelectElement).value).toBe('250');
  });
  it('between two values: Left the one below, Right the one above', () => {
    let s = roller(steps, 123);
    const { press } = setup();
    s.focus(); press(14); expect(s.value).toBe('100');
    s = roller(steps, 123);
    s.focus(); press(15); expect(s.value).toBe('150');
  });
  it('below the values: Right the first, Left clamped to it; each step one input and one change', () => {
    let s = roller([80, 90, 100], 20);
    const { press } = setup();
    const change = vi.fn(); s.addEventListener('change', change);
    s.focus(); press(15); expect(s.value).toBe('80');
    expect(change).toHaveBeenCalledOnce();
    s = roller([80, 90, 100], 20);
    s.focus(); press(14); expect(s.value).toBe('80');
  });
  it('a value that is no number (a word): the nearest enabled option that way in the list\'s order, else the end', () => {
    document.body.innerHTML = '<main><select id="r"><option value="a">A</option><option value="x" disabled>X</option><option value="b">B</option></select></main>';
    const s = document.getElementById('r') as HTMLSelectElement;
    s.value = 'x';
    const { press } = setup();
    s.focus(); press(15); expect(s.value).toBe('b');
    s.value = 'x'; press(14); expect(s.value).toBe('a');
  });
});
