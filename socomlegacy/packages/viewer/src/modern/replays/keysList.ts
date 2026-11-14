import { VIEWER_KEY_ROWS, VIEWER_KEY_SECTIONS, VIEWER_KEYS_NOTE } from './viewerKeys';

/**
 * The replay viewer's keys list (RVK-B, LATER 966, V21.R7; the owner, 2026-11-12: "The replay mode should be fully
 * navigable with keyboard and mouse. Every view."; a browser adaptation with no original). A small list one can find:
 * the "Keys" button at the viewer's head, or `?` on the viewer (`./view`); Escape -- and on the launcher the pad's
 * Circle, through `ReplayViewer.back` -- closes it before Back does, as its own Close button does. Drawn in the house
 * style of the test room's Controls popover (`../../controlsList.ts`: groups of rows, a key and what it does), on the
 * console's tokens (`../../console/replay.css`), with a Keyboard & mouse column and a Controller column. Its rows are the
 * viewer's one table's (`./viewerKeys` `VIEWER_KEY_ROWS`), so the list, the listeners and the tooltips cannot disagree.
 *
 * The opener is a real button (`aria-expanded`, `aria-controls`), so the console's pad walk reaches it as any control
 * (the controller's ruling: the one place that lists the controller's reach is reachable by the controller); the list a
 * labelled region, `hidden` while closed, so the walk passes its Close until it is open.
 *
 * RVK polish (v0.4.21): the opener is drawn only where its caller says a keyboard or a pad may reach it (`showButton`;
 * the viewer's coarse-pointer signal and a connected pad, `./view` `syncKeysButton`) -- `hidden` elsewhere, so neither Tab nor the pad's walk lands on it --
 * while the list itself opens as before on `?` wherever a key arrives. With the opener hidden, the list's Close (its
 * button, Escape, the console's Circle) hands the focus to the viewer's box (the nearest `[tabindex]` holding the list),
 * where the viewer's keys are read, never to the hidden button. A browser adaptation.
 */
export interface KeysList {
  /** The opener and its region, put in the viewer's head. */
  readonly el: HTMLElement;
  isOpen(): boolean;
  open(): void;
  close(): void;
  toggle(): void;
  /** RVK polish: the opener drawn (true) or `hidden` (false); the list's own state unchanged. */
  showButton(on: boolean): void;
}

export function mountKeysList(doc: Document, id: string): KeysList {
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] => {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const noMouseFocus = (b: HTMLElement): void => { b.addEventListener('mousedown', (e) => { e.preventDefault(); }); };
  const box = el('div', 'cx-replay__keys');
  box.dataset['keysList'] = '';
  const opener = el('button', 'cx-replay__keys-open', 'Keys');
  opener.type = 'button';
  opener.dataset['keysOpen'] = '';
  opener.setAttribute('aria-controls', id);
  opener.setAttribute('aria-keyshortcuts', '?');
  opener.title = 'Keys (?)';
  noMouseFocus(opener);                                     // a mouse press leaves the focus where it was
  const panel = el('div', 'cx-replay__keys-panel');
  panel.id = id;
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', 'Keys');
  const table = el('table', 'cx-replay__keys-table');
  const head = el('thead', '');
  const hr = el('tr', '');
  const th = (text: string): HTMLTableCellElement => { const c = el('th', '', text); c.scope = 'col'; return c; };
  hr.append(th('Does'), th('Keyboard & mouse'), th('Controller'));
  head.append(hr);
  table.append(head);
  for (const [section, name] of VIEWER_KEY_SECTIONS) {
    const body = el('tbody', '');
    body.dataset['section'] = section;
    const groupRow = el('tr', 'cx-replay__keys-group');
    const g = el('th', '', name);
    g.scope = 'rowgroup';
    g.colSpan = 3;
    groupRow.append(g);
    body.append(groupRow);
    for (const r of VIEWER_KEY_ROWS) {
      if (r.section !== section) continue;
      const tr = el('tr', '');
      tr.dataset['row'] = r.does;
      const keys = el('td', 'cx-replay__keys-caps');
      r.caps.forEach((cap, i) => {
        if (i > 0) keys.append(' / ');
        keys.append(el('kbd', '', cap));
      });
      tr.append(el('td', 'cx-replay__keys-does', r.does), keys, el('td', 'cx-replay__keys-pad', r.pad));
      body.append(tr);
    }
    table.append(body);
  }
  const close = el('button', 'cx-replay__keys-close', 'Close');
  close.type = 'button';
  close.dataset['keysClose'] = '';
  close.setAttribute('aria-label', 'Close the keys list');
  noMouseFocus(close);
  panel.append(table, el('p', 'cx-replay__keys-note', VIEWER_KEYS_NOTE), close);
  box.append(opener, panel);
  let open = false;
  /** Open or closed: the region `hidden` while closed (the pad's walk passes its Close), the opener's `aria-expanded`. */
  const set = (on: boolean): void => {
    open = on;
    panel.hidden = !on;
    box.toggleAttribute('data-open', on);
    opener.setAttribute('aria-expanded', String(on));
  };
  set(false);
  /** The focus kept when what holds it is hidden: the opener if drawn, else the viewer's box (RVK polish). */
  const home = (): void => {
    const to = opener.hidden ? (box.parentElement?.closest<HTMLElement>('[tabindex]') ?? null) : opener;
    to?.focus({ preventScroll: true });
  };
  opener.addEventListener('click', () => { set(!open); });
  close.addEventListener('click', () => {
    const had = doc.activeElement === close;
    set(false);
    if (had) home();                                         // the focus not lost with the hidden region
  });
  return {
    el: box,
    isOpen: () => open,
    open: () => { set(true); },
    close: () => {
      const had = panel.contains(doc.activeElement);
      set(false);
      if (had) home();
    },
    toggle: () => { set(!open); },
    showButton: (on: boolean) => {
      if (opener.hidden !== on) return;                      // unchanged: nothing touched (it is read each frame)
      const had = doc.activeElement === opener;
      opener.hidden = !on;
      if (had && !on) home();
    },
  };
}
