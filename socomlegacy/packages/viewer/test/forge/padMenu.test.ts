import { describe, expect, it, vi } from 'vitest';
import { ForgePad, PAD_REPEAT_DELAY_MS, type PadSnapshot } from '../../src/forge/pad';
import {
  createMenuSections, FORGE_MENU_SECTIONS, PAD_MENU_INPUT, PadMenu, pagedSections, sectioned, splitAtHeadings, type MenuItem,
} from '../../src/forge/padMenu';

/**
 * FORGE (FG-18; the owner, 2026-10-13: "full and polished controller support"): the forge's menu on START -- every
 * control of the docks a pad can reach: up / down to an entry, left / right through its values, Cross to run it,
 * Circle (or START again) to close.
 */
function menu() {
  const ran: string[] = [];
  let snap = false;
  let base = 0;
  const items = (): MenuItem[] => [
    { id: 'play', label: 'Play', act: () => ran.push('play') },
    { id: 'off', label: 'Nothing here', disabled: true },
    { id: 'base', label: 'Base', value: ['MP2', 'MP5', 'Blank'][base], left: () => { base = (base + 2) % 3; }, right: () => { base = (base + 1) % 3; } },
    { id: 'snap', label: 'Snap', value: snap ? 'on' : 'off', keepOpen: true, act: () => { snap = !snap; } },
  ];
  return { m: new PadMenu(items), ran, state: () => ({ snap, base }) };
}

describe('FORGE: the pad menu', () => {
  it('opens on its first entry and moves up and down, wrapping, past a disabled one', () => {
    const { m } = menu();
    expect(m.isOpen()).toBe(false);
    m.toggle();
    expect([m.isOpen(), m.current()?.id]).toEqual([true, 'play']);
    m.input('down');
    expect(m.current()?.id).toBe('base');                             // 'off' skipped
    m.input('down');
    m.input('down');
    expect(m.current()?.id).toBe('play');                             // wrapped
    m.input('up');
    expect(m.current()?.id).toBe('snap');
  });

  it('turns a value with left / right, runs an entry with Cross and closes, unless the entry keeps it open', () => {
    const { m, ran, state } = menu();
    m.toggle();
    m.input('down');
    m.input('right');
    m.input('right');
    expect(state().base).toBe(2);
    m.input('left');
    expect(state().base).toBe(1);
    m.input('down');
    m.input('select');
    expect([state().snap, m.isOpen()]).toEqual([true, true]);        // a toggle stays
    m.input('down');
    m.input('select');
    expect([ran, m.isOpen()]).toEqual([['play'], false]);
  });

  it('closes on back or a second toggle, and reopens where it was', () => {
    const { m } = menu();
    m.toggle();
    m.input('down');
    m.input('back');
    expect(m.isOpen()).toBe(false);
    m.toggle();
    expect(m.current()?.id).toBe('base');
    m.toggle();
    expect(m.isOpen()).toBe(false);
  });

  it('FG-24: steps over a heading row as over a disabled one, and the pointer cannot rest on it', () => {
    const items = (): MenuItem[] => [
      { id: 'play', label: 'Play' },
      { id: 'settings', label: 'Map settings', heading: true },
      { id: 'light', label: 'Day / night', value: '100%' },
    ];
    const m = new PadMenu(items);
    m.toggle();
    m.input('down');
    expect(m.current()?.id).toBe('light');
    m.input('up');
    expect(m.current()?.id).toBe('play');
    m.point(1);
    expect(m.current()?.id).toBe('play');
  });

  it('tells its listener each change, for the page to draw it', () => {
    const { m } = menu();
    const drawn = vi.fn();
    m.onChange = drawn;
    m.toggle();
    m.input('down');
    expect(drawn).toHaveBeenCalledTimes(2);
  });
});

/**
 * AM-1 (FI.R2; the owner, 2026-10-16: "make menu movement work with analog sticks across the board"; a browser
 * adaptation): the left stick reaches the menu through the d-pad's own actions (`ForgePad.menuOpen`), mapped by the
 * same table the page reads (`PAD_MENU_INPUT`), so it walks the rows and turns a value as the d-pad does.
 */
describe('AM-1: the stick walks the pad menu', () => {
  const stick = (x: number, y: number): PadSnapshot => ({ buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [x, y, 0, 0] });

  it('maps the d-pad\'s actions as the page did: up, down, left, right, Cross, Circle; FUI-3: START closes, L1 / R1, Square, Triangle', () => {
    expect(PAD_MENU_INPUT).toEqual({
      prevAsset: 'up', nextAsset: 'down', turnLeft: 'left', turnRight: 'right', act: 'select', deselect: 'back', menu: 'close',
      prevTool: 'prevSection', nextTool: 'nextSection', duplicate: 'secondary', delete: 'remove',
    });
  });

  it('down steps a row, held it repeats at the d-pad\'s delay, and right turns the value', () => {
    const { m, state } = menu();
    const p = new ForgePad();
    p.menuOpen = true;
    const feed = (x: number, y: number, t: number): void => {
      for (const a of p.frame(stick(x, y), t).actions) { const i = PAD_MENU_INPUT[a]; if (i) m.input(i); }
    };
    m.toggle();
    feed(0, 0, 0);
    feed(0, 0, 8);                                                       // armed, then the menu seen at rest
    feed(0, 0.9, 16);
    expect(m.current()?.id).toBe('base');                                // 'off' skipped, as the d-pad skips it
    feed(0, 0.9, 32);
    expect(m.current()?.id).toBe('base');                                // held: one step until the repeat
    feed(0, 0.9, 16 + PAD_REPEAT_DELAY_MS);
    expect(m.current()?.id).toBe('snap');
    feed(0, 0, 500);
    feed(0, -0.9, 516);
    expect(m.current()?.id).toBe('base');
    feed(0, 0, 532);
    feed(0.9, 0.1, 548);
    expect(state().base).toBe(1);
  });
});

/**
 * FUI-3 (the review's PAD-6, PAD-7, PAD-11, UX-6; FUI.R6; OT.R87; a browser adaptation, FG.R2): the menu in sections paged
 * with L1 / R1, sub-screens pushed by Cross and popped by Circle (a breadcrumb in the header), a row's Square and
 * Triangle, a grid sub-screen, and the sections a feature registers beside the shell's Panels section.
 */
describe('FUI-3: sections, sub-screens and the row\'s own presses', () => {
  const sections = (log: string[] = []): MenuItem[] => [
    ...sectioned('play', 'Play', [{ id: 'play', label: 'Play the layout', act: () => log.push('play') }, { id: 'walk', label: 'Walk the layout' }]),
    ...sectioned('build', 'Build', [{ id: 'base', label: 'Base' }, { id: 'off', label: 'Greyed', disabled: true }, { id: 'snap', label: 'Snap' }]),
    ...sectioned('forge', 'Forge', [{ id: 'save', label: 'Saves' }]),
  ];

  it('a section is a heading row and its rows, each stamped with the section; a section with no row of its own goes', () => {
    const rows = sectioned('build', 'Build', [{ id: 'base', label: 'Base' }]);
    expect(rows).toEqual([{ id: 'section-build', label: 'Build', heading: true, section: 'build' }, { id: 'base', label: 'Base', section: 'build' }]);
    expect(sectioned('empty', 'Empty', [{ id: 'h', label: 'Only a heading', heading: true }])).toEqual([]);
  });

  it('L1 / R1 page the sections: the first row of the next, wrapping both ways; the current section follows the cursor', () => {
    const m = new PadMenu(() => sections());
    m.toggle();
    expect(m.sections().map((s) => [s.id, s.label])).toEqual([['play', 'Play'], ['build', 'Build'], ['forge', 'Forge']]);
    expect([m.current()?.id, m.section()?.id]).toEqual(['play', 'play']);
    m.input('nextSection');
    expect([m.current()?.id, m.section()?.id]).toEqual(['base', 'build']);
    m.input('nextSection');
    expect(m.current()?.id).toBe('save');
    m.input('nextSection');
    expect(m.current()?.id).toBe('play');                                // wrapped
    m.input('prevSection');
    expect(m.current()?.id).toBe('save');
    m.input('down');                                                     // the d-pad still walks every row, section to section
    expect([m.current()?.id, m.section()?.id]).toEqual(['play', 'play']);
    m.jumpSection('build');                                              // the strip's click
    expect(m.current()?.id).toBe('base');
  });

  it('FUI.R20: a cursor on a lead row before the first section -- R1 goes to section 1, L1 wraps to the last', () => {
    // The Props sub-screen's shape: Palette and Show lead, ahead of its paged sections, and the screen opens on Palette.
    const lead = (): MenuItem[] => [{ id: 'palette', label: 'Palette' }, { id: 'show', label: 'Show' }, ...sections()];
    const m = new PadMenu(lead);
    m.toggle();
    expect([m.current()?.id, m.section()]).toEqual(['palette', undefined]);
    m.input('nextSection');
    expect([m.current()?.id, m.section()?.id]).toEqual(['play', 'play']);   // section 1, not section 2
    const back = new PadMenu(lead);
    back.toggle();
    back.input('down');
    expect([back.current()?.id, back.section()]).toEqual(['show', undefined]);
    back.input('prevSection');
    expect([back.current()?.id, back.section()?.id]).toEqual(['save', 'forge']);   // the last section, not the second
  });

  it('Cross on a row with a page pushes it; Circle pops it before it closes the menu; START closes it all', () => {
    const log: string[] = [];
    const items = (): MenuItem[] => [
      { id: 'outliner', label: 'Outliner', act: () => log.push('opened'), page: () => [
        { id: 'empty', label: 'Nothing placed', disabled: true },
        { id: 'crate', label: 'crate_01', act: () => log.push('crate') },
      ] },
      { id: 'snap', label: 'Snap' },
    ];
    const m = new PadMenu(items);
    m.toggle();
    expect(m.crumbs()).toEqual(['Forge']);
    m.input('select');
    expect([m.isOpen(), m.depth(), m.current()?.id, log]).toEqual([true, 1, 'crate', ['opened']]);
    expect(m.crumbs()).toEqual(['Forge', 'Outliner']);
    m.input('back');
    expect([m.isOpen(), m.depth(), m.current()?.id]).toEqual([true, 0, 'outliner']);   // popped, the cursor where it was
    m.input('back');
    expect(m.isOpen()).toBe(false);
    m.toggle();
    m.input('select');
    m.input('close');                                                    // START: the whole menu, at any depth
    expect([m.isOpen(), m.depth()]).toEqual([false, 0]);
    m.toggle();
    expect([m.depth(), m.current()?.id]).toEqual([0, 'outliner']);      // reopened on the root
  });

  it('a row\'s act in a sub-screen that does not keep the menu closes it all', () => {
    const ran: string[] = [];
    const m = new PadMenu(() => [{ id: 'props', label: 'Props', page: () => [{ id: 'crate', label: 'crate', act: () => ran.push('crate') }] }]);
    m.toggle();
    m.input('select');
    m.input('select');
    expect([ran, m.isOpen(), m.depth()]).toEqual([['crate'], false, 0]);
  });

  it('Square runs the row\'s secondary, Triangle its remove; each closes unless it keeps the menu; a greyed row runs neither', () => {
    const ran: string[] = [];
    const m = new PadMenu(() => [
      { id: 'a', label: 'crate', secondary: { label: 'Lock', act: () => ran.push('lock'), keepOpen: true }, remove: { label: 'Delete', act: () => ran.push('delete') } },
      { id: 'b', label: 'greyed', disabled: true, secondary: { label: 'Lock', act: () => ran.push('greyed') } },
      { id: 'c', label: 'plain' },
    ]);
    m.toggle();
    m.input('secondary');
    expect([ran, m.isOpen()]).toEqual([['lock'], true]);
    m.input('remove');
    expect([ran, m.isOpen()]).toEqual([['lock', 'delete'], false]);
    m.toggle();
    m.input('down');
    m.input('secondary');                                               // 'plain' has none: nothing, the menu stays
    expect([ran, m.isOpen(), m.current()?.id]).toEqual([['lock', 'delete'], true, 'c']);
  });

  it('a sub-screen that shrinks under the cursor keeps it on a row (a deleted placement)', () => {
    let rows = ['a', 'b', 'c'];
    const m = new PadMenu(() => [{ id: 'o', label: 'Outliner', page: () => rows.map((id) => ({ id, label: id, keepOpen: true,
      remove: { label: 'Delete', keepOpen: true, act: () => { rows = rows.filter((r) => r !== id); } } })) }]);
    m.toggle();
    m.input('select');
    m.input('up');
    expect(m.current()?.id).toBe('c');
    m.input('remove');
    expect([m.isOpen(), m.current()?.id]).toEqual([true, 'b']);
  });

  it('a grid sub-screen: left / right a cell, up / down a row of cells; a full row (a value, a heading) is stepped as a list', () => {
    let filter = 0;
    const cells = (n: number, s: string): MenuItem[] => Array.from({ length: n }, (_, i) => ({ id: `${s}${i + 1}`, label: `${s}${i + 1}` }));
    const page = (): MenuItem[] => [
      { id: 'show', label: 'Show', value: ['All', 'Favourites'][filter], left: () => { filter = 0; }, right: () => { filter = 1; } },
      ...sectioned('p1', '1-6', cells(6, 'a')),
      ...sectioned('p2', '7-8', cells(2, 'b')),
    ];
    const m = new PadMenu(() => [{ id: 'props', label: 'Props', grid: 3, page }]);
    m.toggle();
    m.input('select');
    expect([m.grid(), m.current()?.id]).toEqual([3, 'show']);
    m.input('right');
    expect(filter).toBe(1);                                              // a value's row turns, never walks
    m.input('down');
    expect(m.current()?.id).toBe('a1');
    m.input('right');
    m.input('right');
    expect(m.current()?.id).toBe('a3');
    m.input('down');
    expect(m.current()?.id).toBe('a6');                                  // a row down, the same column
    m.input('down');
    expect(m.current()?.id).toBe('b1');                                  // past the section's last row: the next section
    m.input('up');
    expect(m.current()?.id).toBe('a6');                                  // the previous section's last cell
    m.input('nextSection');
    expect(m.current()?.id).toBe('b1');                                  // L1 / R1: a page of cells at a time
    m.input('left');
    expect(m.current()?.id).toBe('a6');
  });

  it('the page asks for a redraw (an async check came back) and the cursor stays in range', () => {
    let rows: MenuItem[] = [{ id: 'checking', label: 'Checking…', disabled: true }];
    const m = new PadMenu(() => [{ id: 'check', label: 'Check the map', page: () => rows }]);
    const drawn = vi.fn();
    m.onChange = drawn;
    m.toggle();
    m.input('select');
    rows = [{ id: 'issue-0', label: 'No spawn for team A' }];
    m.refresh();
    expect(drawn).toHaveBeenCalledTimes(3);
    expect(m.current()?.id).toBe('issue-0');
  });
});

describe('FUI-3: registerMenuSection, composed by the shell beside its Panels section', () => {
  it('registers a section by id, refuses a second of that id, asks its rows of the context each time, and lets it go', () => {
    const reg = createMenuSections<{ n: number }>();
    const off = reg.register({ id: 'packs', label: 'Packs', items: (ctx) => [{ id: 'pack-count', label: 'Packs', value: String(ctx.n) }] });
    expect(() => reg.register({ id: 'packs', label: 'Again', items: () => [] })).toThrow(/packs/);
    reg.register({ id: 'jobs', label: 'Jobs', items: () => [{ id: 'jobs-h', label: 'Nothing yet', heading: true }] });
    expect(reg.items({ n: 2 })).toEqual([
      { id: 'section-packs', label: 'Packs', heading: true, section: 'packs' },
      { id: 'pack-count', label: 'Packs', value: '2', section: 'packs' },
    ]);                                                                  // a section with no row of its own is not drawn
    off();
    expect(reg.items({ n: 2 })).toEqual([]);
    expect(reg.ids()).toEqual(['jobs']);
  });

  it('R3-A (10): refuses a built-in section\'s id (play, build, view, settings, panels, forge) as it refuses a repeated one', () => {
    const reg = createMenuSections<{ n: number }>();
    for (const id of ['play', 'build', 'view', 'settings', 'panels', 'forge']) {
      expect(() => reg.register({ id, label: 'Mine', items: () => [{ id: `${id}-mine`, label: 'Mine' }] }), id).toThrow(new RegExp(`^${id}: .*built-in`));
    }
    expect(reg.ids()).toEqual([]);
    expect(FORGE_MENU_SECTIONS).toEqual(['play', 'build', 'view', 'settings', 'panels', 'forge']);
    reg.register({ id: 'packs', label: 'Packs', items: () => [] });
    expect(reg.ids()).toEqual(['packs']);
  });

  it('the shell\'s rows split at their headings: the rows before the first under the lead section, each heading its own', () => {
    const rows: MenuItem[] = [
      { id: 'view-fog', label: 'Fog' },
      { id: 'settings', label: 'Map settings', heading: true }, { id: 'rounds', label: 'Rounds' },
      { id: 'panels', label: 'Panels', heading: true }, { id: 'panel-view', label: 'View' },
    ];
    expect(splitAtHeadings(rows, { id: 'view', label: 'View' }).map((s) => [s.id, s.label, s.rows.map((r) => r.id)])).toEqual([
      ['view', 'View', ['view-fog']], ['settings', 'Map settings', ['rounds']], ['panels', 'Panels', ['panel-view']],
    ]);
  });

  it('pagedSections: a long list in sections of a page each, named by their range (the Props grid\'s page jumps)', () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, label: `p${i}` }));
    const paged = pagedSections(rows, 2, 'props');
    expect(paged.filter((r) => r.heading).map((r) => [r.id, r.label])).toEqual([['section-props-1', '1–2'], ['section-props-2', '3–4'], ['section-props-3', '5']]);
    expect(paged.filter((r) => !r.heading).map((r) => r.section)).toEqual(['props-1', 'props-1', 'props-2', 'props-2', 'props-3']);
  });
});
