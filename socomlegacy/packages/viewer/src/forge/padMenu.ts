/**
 * FORGE (FG-18; the owner, 2026-10-13: "full and polished controller support"; a browser adaptation, no original): the
 * forge's menu on START. Pure: the entries are the page's (`items`, read afresh each draw), the cursor, the sub-screens
 * and the open state are here.
 *
 * FUI-3 (the review's PAD-6, PAD-7, PAD-11, UX-6; FUI.R6; OT.R87 / FUI.R18): the menu is in sections (`sectioned`: a
 * heading row and its rows, each stamped with `section`), paged with L1 / R1; a row with a `page` is a sub-screen Cross
 * pushes and Circle pops (the header's breadcrumb, `crumbs`), START closes it all; a row's `secondary` is Square's and
 * its `remove` Triangle's; a sub-screen may be a grid (`grid` columns: left / right a cell, up / down a row of cells).
 * A feature adds its own section through `createMenuSections` (`registerMenuSection`, composed by the page beside the
 * shell's Panels section). OT.R87: the basic paths (creation, placement, movement, Play, the match) are reached here in
 * full; a desktop-first panel's rows are its Panels row. Nothing here changes what the game does.
 */
import type { PadAction } from './pad';

/** FUI-3: a row's own press beside Cross -- Square's (`secondary`) or Triangle's (`remove`) -- named by its word. */
export interface MenuAction {
  label: string;
  act: () => void;
  /** The press keeps the menu open; else it closes after the act. */
  keepOpen?: boolean;
}

export interface MenuItem {
  id: string;
  label: string;
  /** What the entry shows at its right: a value left / right turn through, or a state. */
  value?: string;
  /** A short line under it. */
  note?: string;
  disabled?: boolean;
  /** FG-24: a group's heading (the forge's own, no original): drawn as one, never under the cursor. */
  heading?: boolean;
  /** Cross: run it. */
  act?: () => void;
  /** Cross keeps the menu open (a toggle); else it closes after the act. */
  keepOpen?: boolean;
  left?: () => void;
  right?: () => void;
  /** FUI-3: the section it sits under (`sectioned` stamps it); L1 / R1 page from section to section. */
  section?: string;
  /** FUI-3: a sub-screen -- Cross runs `act` (if any) and pushes these rows (asked afresh each draw); Circle pops it. */
  page?: () => MenuItem[];
  /** FUI-3: the sub-screen `page` pushes is drawn as a grid of this many columns. */
  grid?: number;
  /** FUI-3: Square on the row (a lock, a favourite). */
  secondary?: MenuAction;
  /** FUI-3: Triangle on the row (delete, hide or show). */
  remove?: MenuAction;
}

/** An entry the cursor passes over: a disabled one or a heading. */
const skipped = (it: MenuItem | undefined): boolean => it?.disabled === true || it?.heading === true;
/** FUI-3: a grid screen's cell: a row of its own neither a heading nor a value turned left / right. */
const isCell = (it: MenuItem | undefined): boolean => !!it && !it.heading && !it.left && !it.right;

export type MenuInput =
  | 'up' | 'down' | 'left' | 'right' | 'select' | 'back'
  /** FUI-3: START -- the whole menu closed, at any depth (Circle's `back` pops a sub-screen first). */
  | 'close'
  /** FUI-3: L1 / R1 -- the previous / next section. */
  | 'prevSection' | 'nextSection'
  /** FUI-3: Square and Triangle -- the row's `secondary` and `remove`. */
  | 'secondary' | 'remove';

/**
 * The pad's actions (`./pad` `ForgePad`) as the menu's inputs, while it is open: the d-pad's, and since AM-1 the left
 * stick's (it emits the d-pad's actions), Cross to run, Circle to go back (a sub-screen popped, else the menu closed),
 * START to close it all; FUI-3: L1 / R1 the sections, Square and Triangle the row's own. The page reads it
 * (`./page` `padAction`).
 */
export const PAD_MENU_INPUT: Readonly<Partial<Record<PadAction, MenuInput>>> = {
  prevAsset: 'up', nextAsset: 'down', turnLeft: 'left', turnRight: 'right', act: 'select', deselect: 'back', menu: 'close',
  prevTool: 'prevSection', nextTool: 'nextSection', duplicate: 'secondary', delete: 'remove',
};

/** FUI-3: a section as drawn: its id, its heading's words, and the index of its heading (or first row) in the entries. */
export interface MenuSectionInfo { id: string; label: string; first: number }

/** FUI-3: one section -- its heading row and its rows, each stamped with it; none at all when it has no row of its own. */
export function sectioned(id: string, label: string, rows: readonly MenuItem[]): MenuItem[] {
  if (!rows.some((r) => !r.heading)) return [];
  return [{ id: `section-${id}`, label, heading: true, section: id }, ...rows.map((r) => ({ ...r, section: id }))];
}

/** FUI-3: the sections of a list: each run of rows under one `section`, its label the run's heading (else its id). */
export function menuSections(items: readonly MenuItem[]): MenuSectionInfo[] {
  const out: MenuSectionInfo[] = [];
  items.forEach((it, i) => {
    if (it.section === undefined || it.section === items[i - 1]?.section) return;
    out.push({ id: it.section, label: it.heading ? it.label : it.section, first: i });
  });
  return out;
}

/**
 * FUI-3: rows split at their headings (the shell's: each panel's section, then its Panels section): the rows before the
 * first heading under `lead`, then each heading its own section of its id and words.
 */
export function splitAtHeadings(rows: readonly MenuItem[], lead: { id: string; label: string }): { id: string; label: string; rows: MenuItem[] }[] {
  const out: { id: string; label: string; rows: MenuItem[] }[] = [{ ...lead, rows: [] }];
  for (const r of rows) {
    if (r.heading) out.push({ id: r.id, label: r.label, rows: [] });
    else out[out.length - 1]!.rows.push(r);
  }
  return out.filter((s) => s.rows.length > 0);
}

/** FUI-3 (PAD-11): a long list as sections of `size` rows each, named by their range (L1 / R1 jump a page). */
export function pagedSections(rows: readonly MenuItem[], size: number, prefix: string): MenuItem[] {
  const out: MenuItem[] = [];
  for (let i = 0, n = 1; i < rows.length; i += size, n++) {
    const last = Math.min(rows.length, i + size);
    out.push(...sectioned(`${prefix}-${n}`, last - i === 1 ? `${i + 1}` : `${i + 1}–${last}`, rows.slice(i, last)));
  }
  return out;
}

/** FUI-3: a section a feature adds to the START menu; `items` is asked afresh each draw, of the page's context. */
export interface MenuSectionSpec<C> { id: string; label: string; items(ctx: C): MenuItem[] }

/**
 * R3-A (the FUI-3 review's finding 12): the Forge's own START sections (`./page` `menuItems`; `panels` the shell's).
 * A feature's section may not take one of these ids: two sections of one id, apart in the menu, would leave L1 / R1
 * (`sectionStep`) landing on the first and unable to pass it.
 */
export const FORGE_MENU_SECTIONS: readonly string[] = Object.freeze(['play', 'build', 'view', 'settings', 'panels', 'forge']);

/** FUI-3: the sections features register (`registerMenuSection`), drawn in their order of registration. */
export interface MenuSections<C> {
  /** Adds a section; refuses a second of one id, and a built-in section's id (`FORGE_MENU_SECTIONS`). Its return lets it go (as `unregister`). */
  register(spec: MenuSectionSpec<C>): () => void;
  unregister(id: string): void;
  ids(): string[];
  /** Every registered section's rows as sections (`sectioned`); a section with no row of its own is not drawn. */
  items(ctx: C): MenuItem[];
}

export function createMenuSections<C>(builtIn: readonly string[] = FORGE_MENU_SECTIONS): MenuSections<C> {
  const specs = new Map<string, MenuSectionSpec<C>>();
  const reg: MenuSections<C> = {
    register(spec) {
      if (builtIn.includes(spec.id)) throw new Error(`${spec.id}: a built-in menu section has that id`);
      if (specs.has(spec.id)) throw new Error(`${spec.id}: a menu section of that id is registered`);
      specs.set(spec.id, spec);
      return () => { if (specs.get(spec.id) === spec) specs.delete(spec.id); };
    },
    unregister: (id) => { specs.delete(id); },
    ids: () => [...specs.keys()],
    items: (ctx) => [...specs.values()].flatMap((s) => sectioned(s.id, s.label, s.items(ctx))),
  };
  return reg;
}

/** One screen of the menu: the root, or a sub-screen a row pushed. */
interface Screen { label: string; items: () => MenuItem[]; cursor: number; grid: number }

export class PadMenu {
  private open = false;
  private readonly root: Screen;
  /** FUI-3: the sub-screens pushed over the root, innermost last. */
  private stack: Screen[] = [];
  /** Called after each change: the page draws the menu. */
  onChange: (() => void) | null = null;

  constructor(items: () => MenuItem[]) {
    this.root = { label: 'Forge', items, cursor: 0, grid: 0 };
  }

  private screen(): Screen { return this.stack[this.stack.length - 1] ?? this.root; }

  isOpen(): boolean { return this.open; }
  entries(): MenuItem[] { return this.screen().items(); }
  current(): MenuItem | undefined { return this.entries()[this.screen().cursor]; }
  index(): number { return this.screen().cursor; }
  /** FUI-3: how many sub-screens are pushed (0: the root). */
  depth(): number { return this.stack.length; }
  /** FUI-3: the header's breadcrumb, the root's name first. */
  crumbs(): string[] { return [this.root.label, ...this.stack.map((s) => s.label)]; }
  /** FUI-3: the columns of the screen's grid; 0 for a list. */
  grid(): number { return this.screen().grid; }
  /** FUI-3: the screen's sections, in order. */
  sections(): MenuSectionInfo[] { return menuSections(this.entries()); }
  /** FUI-3: the section the cursor is in. */
  section(): MenuSectionInfo | undefined {
    const at = this.index();
    return this.sections().filter((s) => s.first <= at).pop();
  }

  toggle(): void {
    this.open = !this.open;
    if (!this.open) this.stack = [];
    else this.settle();
    this.onChange?.();
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.stack = [];
    this.onChange?.();
  }

  /** FUI-3: the rows changed under the menu (an async check came back, a row deleted): the cursor kept on a row, redrawn. */
  refresh(): void {
    if (this.open) this.settle();
    this.onChange?.();
  }

  /** The cursor on entry `i` (the pointer's hover on the drawn menu). */
  point(i: number): void {
    const it = this.entries()[i];
    if (!it || skipped(it)) return;
    this.screen().cursor = i;
    this.onChange?.();
  }

  /** FUI-3: the cursor on the first row of section `id` (the strip's click). */
  jumpSection(id: string): void {
    const s = this.sections().find((x) => x.id === id);
    if (!s) return;
    this.screen().cursor = s.first;
    if (skipped(this.current())) this.step(1);
    this.onChange?.();
  }

  input(a: MenuInput): void {
    if (!this.open) return;
    this.settle();
    const it = this.current();
    const live = !!it && !skipped(it);
    const cell = this.grid() > 0 && isCell(it);
    if (a === 'up' || a === 'down') { if (cell) this.gridStep(a === 'down' ? 1 : -1); else this.step(a === 'down' ? 1 : -1); }
    else if (a === 'left' || a === 'right') {
      if (cell) this.cellStep(a === 'right' ? 1 : -1);
      else if (a === 'left') it?.left?.();
      else it?.right?.();
    } else if (a === 'back') { if (this.stack.length) this.stack.pop(); else this.open = false; }
    else if (a === 'close') { this.open = false; this.stack = []; }
    else if (a === 'prevSection' || a === 'nextSection') this.sectionStep(a === 'nextSection' ? 1 : -1);
    else if ((a === 'secondary' || a === 'remove') && live) {
      const press = a === 'secondary' ? it.secondary : it.remove;
      if (press) { if (!press.keepOpen) this.shut(); press.act(); }
    } else if (a === 'select' && live) {
      if (it.page) {
        it.act?.();
        this.stack.push({ label: it.label, items: it.page, cursor: 0, grid: it.grid ?? 0 });
        this.settle();
      } else {
        if (!it.keepOpen) this.shut();
        it.act?.();
      }
    }
    if (this.open) this.settle();
    this.onChange?.();
  }

  /** Closed, every sub-screen let go. */
  private shut(): void { this.open = false; this.stack = []; }

  /** The cursor kept inside the screen's rows and on one it can rest on. */
  private settle(): void {
    const s = this.screen(), items = s.items();
    if (items.length === 0) { s.cursor = 0; return; }
    if (s.cursor >= items.length) s.cursor = items.length - 1;
    if (skipped(items[s.cursor])) {
      const at = s.cursor;
      this.step(1);
      if (skipped(items[s.cursor]) || s.cursor < at) { s.cursor = at; this.step(-1); }
    }
  }

  private step(by: 1 | -1): void {
    const s = this.screen(), items = s.items();
    if (items.length === 0) return;
    for (let n = 0; n < items.length; n++) {
      s.cursor = (s.cursor + by + items.length) % items.length;
      if (!skipped(items[s.cursor])) return;
    }
  }

  /** FUI-3: L1 / R1 -- the first row of the previous or next section that has one, wrapping. */
  private sectionStep(by: 1 | -1): void {
    const list = this.sections();
    if (list.length < 2) return;
    const s = this.screen(), items = s.items();
    const on = this.section()?.id;
    // FUI.R20: a cursor on a lead row before the first section (the Props sub-screen opens on Palette) is before index 0:
    // R1 goes to the first section, L1 wraps to the last.
    const found = list.findIndex((x) => x.id === on);
    const at = found >= 0 ? found : by > 0 ? -1 : list.length;
    for (let n = 1; n <= list.length; n++) {
      const next = list[(at + by * n + list.length * n) % list.length]!;
      const end = list[list.indexOf(next) + 1]?.first ?? items.length;
      for (let i = next.first; i < end; i++) if (!skipped(items[i])) { s.cursor = i; return; }
    }
  }

  /** FUI-3: a grid's left / right -- the previous or next cell of the screen, across its sections. */
  private cellStep(by: 1 | -1): void {
    const s = this.screen(), items = s.items();
    const cells = items.flatMap((it, i) => (isCell(it) && !skipped(it) ? [i] : []));
    const at = cells.indexOf(s.cursor);
    const next = cells[at + by];
    if (next !== undefined) s.cursor = next;
  }

  /** FUI-3: a grid's up / down -- a row of cells in the cursor's section; past its edge, the row beyond the section. */
  private gridStep(by: 1 | -1): void {
    const s = this.screen(), items = s.items(), cols = s.grid;
    const sec = this.section();
    const run = items.flatMap((it, i) => (isCell(it) && !skipped(it) && it.section === sec?.id ? [i] : []));
    const at = run.indexOf(s.cursor);
    const next = run[at + by * cols];
    if (next !== undefined) { s.cursor = next; return; }
    s.cursor = by > 0 ? run[run.length - 1]! : run[0]!;
    this.step(by);
  }
}
