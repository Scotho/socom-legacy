import { esc, ico, shoulder } from '../icons';
import { isToggleRow, optCategories, optRowsNow, optTabs, type Adapters, type ConsoleState, type OptRow } from '../state';
import { screenHead } from './head';
import { rowHtml, type Row } from './rows';

/**
 * The Settings screen (CX-27, CX.R14: the category reads Settings; the id stays `options`. The prototype's `renderOptions`;
 * its OptionRows README): the
 * categories down the left, the category's rows, and what the focused setting does. The rows and their values are
 * the options adapter's. The rows' list is its own scroll container (`data-scroll`, CX-11: a category taller than the
 * stage scrolls inside it; `./frame` keeps the focused row in view). CX-18: the tabs sit in their own scroller
 * (`.cx-tabs__strip`, `../console.css`) between the L1 and R1 hints, which stay outside it, as the crossbar's strip keeps
 * its hints outside. A browser adaptation with no original (OT.R28).
 *
 * LR-5 (the launcher redesign plan, the row "Settings"; LR.R1, LR.R8): the rows are drawn in LR-1's row kinds (`./rows`)
 * -- what each says and does is still the adapter's and the grammar's. A switch (Off / On) is the artifact's toggle, a
 * tuner or a numeric range (more than five numbers) its slider, any other choice its select, an action row its action
 * (its word the hint; the adapter's tone, muted when locked), a read-only row its info row, one of a group its pick. A
 * locked row says its lock where the value was (the rollers' rule), with no step marks. Every row keeps the grammar's
 * hooks: `optrow` and its index (a click focuses it, an action's click is Cross: `is-action`), its focus key, and the
 * pointer's step marks (`optstep` and the direction, as the rollers' buttons were). The list keeps `.cx-rows` (the
 * screen's grid and width) beside LR-1's `.cx-rlist`.
 *
 * LR-21 (the LR.R11 side-by-side's P10): a tab's word sits in its own label (`.cx-tab__label`), the anchor of the gold bar
 * under the current one (`../console.css`: the tabs drawn as the artifact's list rows, not part G's filled slabs).
 */
const NUMBER = /^(-?\d+)(%?)$/;

/**
 * LR-20 (the LR.R11 side-by-side's P12): an action row's line -- the adapter's own `hint` where it gives one (what the act
 * does, or when); else the verb, unless the label already says it ("Sign out" / "Sign out", "Remove downloaded content" /
 * "Remove": the artifact's action rows carry no line then, `A('Sign out', 'signout', null)`). The verb is still the
 * legend's Cross (`./legend`).
 */
export function actionHint(row: Pick<OptRow, 'label' | 'action' | 'hint'>): string | undefined {
  if (row.hint) return row.hint;
  const verb = (row.action ?? '').toLowerCase();
  const words = row.label.toLowerCase().split(/\s+/);
  const said = verb === row.label.toLowerCase() || verb.split(/\s+/).every((w) => words.includes(w));
  return verb && !said ? row.action : undefined;
}

/** An option row as LR-1's row kind (`lock`: the word drawn where the value was, or null). */
export function optRowKind(row: OptRow, v: number, lock: string | null): Row {
  const base = { id: row.id, label: row.label };
  if (row.pick) {
    const p = row.pick;
    return { kind: 'pick', ...base, group: p.group, picked: p.picked, ...(p.hint ? { hint: p.hint } : {}), ...(p.swatch ? { swatch: p.swatch } : {}), ...(p.thumb ? { thumb: p.thumb } : {}) };
  }
  if (row.info) return { kind: 'info', label: row.label, value: row.info.value, ...(row.info.tone ? { tone: row.info.tone } : {}) };
  if (row.link && row.action) return { kind: 'link', ...base, hint: row.action };     // LR-13: Appearance's "Theme & background"
  if (row.action) {
    const hint = lock ?? actionHint(row);
    return { kind: 'action', ...base, ...(hint ? { hint } : {}), ...(lock ? { tone: 'muted' as const } : row.tone ? { tone: row.tone } : {}) };
  }
  const values = row.values ?? [];
  if (lock) return { kind: 'select', ...base, value: lock };
  const word = values[v] ?? '';
  if (isToggleRow(row)) return { kind: 'toggle', ...base, on: word === 'On', ...(row.hint ? { hint: row.hint } : {}) };   // SKIP-MENU: a toggle's own line where it gives one
  const nums = values.map((x) => NUMBER.exec(x));
  if (values.length > 5 && nums.every((m) => m !== null)) {
    const n = (i: number): number => Number(nums[i]![1]);
    return { kind: 'slider', ...base, value: n(Math.max(0, Math.min(values.length - 1, v))), min: n(0), max: n(values.length - 1), step: n(1) - n(0), unit: nums[0]![2] ?? '' };
  }
  return { kind: 'select', ...base, value: word };
}

/** One option row's markup: LR-1's row, with the grammar's hooks and the pointer's step marks added. */
function optRowHtml(row: OptRow, i: number, catId: string, focused: boolean, v: number, lock: string | null, flip?: string): string {
  const kind = optRowKind(row, v, lock);
  let html = rowHtml(kind, { focused, index: i, act: 'optrow', flipped: flip === row.id });
  const mark = (d: -1 | 1): string => `<span class="cx-r__step" data-act="optstep" data-i="${i}" data-d="${d}" aria-hidden="true">`;
  const step = (d: -1 | 1, glyph: string): string => `${mark(d)}${glyph}</span>`;
  if (kind.kind === 'toggle') html = html.replace('<span class="cx-r__pill" aria-hidden="true">', `<span class="cx-r__pill" aria-hidden="true" data-act="optstep" data-i="${i}" data-d="${kind.on ? -1 : 1}">`);
  if (kind.kind === 'select' && !lock) {
    html = html.replace('<span class="cx-r__step" data-d="-1" aria-hidden="true">', mark(-1)).replace('<span class="cx-r__step" data-d="1" aria-hidden="true">', mark(1));
  }
  if (kind.kind === 'slider') html = html.replace('<span class="cx-r__ctl">', `<span class="cx-r__ctl">${step(-1, '‹')}`).replace(/<\/span><\/div>$/, `${step(1, '›')}</span></div>`);
  const changed = !lock && row.def !== undefined && v !== row.def && (kind.kind === 'toggle' || kind.kind === 'slider' || kind.kind === 'select');   // review-lr-5 F2: remap's marker
  // LR-13 (LR.R16 (6)): a toggle's click flips it, as Cross does -- an action for the pointer.
  const extra = [lock ? 'is-locked' : '', changed ? 'is-changed' : '', kind.kind === 'action' || kind.kind === 'pick' || kind.kind === 'toggle' || kind.kind === 'link' ? 'is-action' : ''].filter(Boolean).join(' ');
  if (extra) html = html.replace(/^(<\w+ [^>]*?class=")cx-r /, `$1cx-r ${extra} `);
  // SEP-ROWS (a browser adaptation): a row's warning -- the console's alert mark in the warning tone before its control,
  // its words the mark's title (the pointer's tooltip) and part of the row's name for a reader.
  if (row.warn) {
    const w = esc(row.warn);
    html = html.replace(/ aria-label="([^"]*)"/, ` aria-label="$1. ${w}"`)
      .replace('<span class="cx-r__ctl">', `<span class="cx-r__warn" title="${w}" aria-hidden="true">${ico('alert')}</span><span class="cx-r__ctl">`);
  }
  // The info kind carries no act of its own (LR-10): the grammar's, a tab stop for the frame's focus, and the focus key.
  const hooks = kind.kind === 'info' ? ` tabindex="-1" data-act="optrow" data-i="${i}"` : '';
  return html.replace(`data-row="${i}"`, `data-row="${i}"${hooks} data-fk="opt-${esc(catId)}-${i}"`);
}

/** The focused row's aside: what it does and where it saves. */
function asideHtml(r: OptRow | undefined, a: Adapters, signedIn: boolean): string {
  return r ? `<aside class="cx-aside" aria-label="About this option">
        <div class="cx-readout__head">${esc(r.label)}</div>
        <p>${esc(r.about)}</p>
        ${r.tip ? `<p class="cx-aside__tip${r.warn ? ' is-warn' : ''}">${r.warn ? ico('alert') : ''}${esc(r.tip)}</p>` : ''}
        <p class="cx-aside__note">${r.needsSignIn && !signedIn ? 'Sign in to change this.' : esc(r.locked ?? r.note)}${r.values && r.def !== undefined && a.options.value(r.id) !== r.def ? ' Default: ' + esc(r.values[r.def]) + '.' : ''}</p>
      </aside>` : '';
}

/**
 * LR-13 (LR.R16 (2)): a panel pushed from a tab's link row -- Appearance's "Theme & background" (the artifact's
 * `app-theme`): its head the panel's (the crumb back to Appearance, LP.R14's one return), no tabs (L1 / R1 stay on it), its
 * rows the panel's picks in the same row drawing and hooks, the aside beside them.
 */
function panelHtml(s: ConsoleState, a: Adapters, rows: readonly OptRow[], catId: string, parent: string, title: string, flip?: string): string {
  const r = rows[s.opt.row] ?? rows[0];
  const signedIn = a.session.signedIn();
  const head = (row: OptRow): string => (row.section !== undefined ? rowHtml({ kind: 'header', label: row.section }, { focused: false, index: -1, act: 'optrow' }) : '');
  return `<section class="cx-screen cx-screen--panel" aria-label="Settings" data-key="options">
    ${screenHead('', title, parent)}
    <div class="cx-screen__body">
      <div class="cx-rows cx-rlist" data-scroll data-key="rows-${esc(catId)}" role="group" aria-label="${esc(title)}">
        ${rows.map((row, i) => head(row) + optRowHtml(row, i, catId, i === s.opt.row, a.options.value(row.id), row.locked ?? null, flip)).join('')}
      </div>
      ${asideHtml(r, a, signedIn)}
    </div>
  </section>`;
}

export function optionsHtml(s: ConsoleState, a: Adapters): string {
  const flip = s.opt.flip;                                           // LR-13 (review F4): the mark lasts this one draw
  s.opt.flip = undefined;
  const all = optCategories(s, a);                                  // OVERLAY-CONSOLE: the overlay's locks on its rows
  const tabs = optTabs(s, a);                                       // the current tab's family; the sample adapters keep one strip
  const c = all[s.opt.cat] ?? all[0];
  if (!c) return '<section class="cx-screen" aria-label="Settings" data-key="options"></section>';
  if (s.opt.panel) {
    const p = a.options.panel?.(s.opt.panel);
    if (p) return panelHtml(s, a, optRowsNow(s, a), p.id, c.label, p.label, flip);
  }
  const r = c.rows[s.opt.row] ?? c.rows[0];
  const signedIn = a.session.signedIn();
  const lockWord = (row: OptRow): string | null => (row.needsSignIn && !signedIn ? 'Sign in to change' : row.locked ?? null);
  const head = (row: OptRow): string => (row.section !== undefined ? rowHtml({ kind: 'header', label: row.section }, { focused: false, index: -1, act: 'optrow' }) : '');
  return `<section class="cx-screen" aria-label="Settings" data-key="options">
    ${screenHead(`${ico('settings')}Settings`, c.label, 'Settings')}
    <div class="cx-screen__body" style="--cx-tabs: ${tabs.length}">
      <nav class="cx-tabs" aria-label="Option categories">
        <span class="cx-tabs__hint" aria-hidden="true">${shoulder('L1')}Previous</span>
        <div class="cx-tabs__strip" data-key="optcats">${tabs.map((o, n) => { const i = all.findIndex((c) => c.id === o.id); return `<button type="button" class="cx-tab ${i === s.opt.cat ? 'is-current' : ''} ${i === s.opt.cat && s.opt.zone === 'cats' ? 'is-focused' : ''}" data-act="optcat" data-cat="${esc(o.id)}" data-i="${n}" data-fk="optcat-${n}" ${i === s.opt.cat ? 'aria-current="true"' : ''}>${ico(o.icon)}<span class="cx-tab__label">${esc(o.label)}</span></button>`; }).join('')}</div>
        <span class="cx-tabs__hint" aria-hidden="true">${shoulder('R1')}Next</span>
      </nav>
      <div class="cx-rows cx-rlist" data-scroll data-key="rows-${esc(c.id)}" role="group" aria-label="${esc(c.label)}">
        ${c.rows.map((row, i) => head(row) + optRowHtml(row, i, c.id, s.opt.zone === 'rows' && i === s.opt.row, a.options.value(row.id), lockWord(row), flip)).join('')}
      </div>
      ${asideHtml(r, a, signedIn)}
    </div>
  </section>`;
}

/**
 * LR-18 (the LR.R11 side-by-side's P2 and P14's strip): the tabs' scroller -- the column's strip above the phone rule, the
 * nav itself at it (`../console.css`: part G's sideways row, the strip `display: contents`) -- keeps the current tab in
 * view when the tab changes (a shoulder, a click, a deep link; a redraw with the same tab keeps the scroll the finger or
 * the wheel gave it), clear of the fade at the edge (`TAB_FADE` of the box, the crossbar strip's 8 %), and marks the edges
 * it can still scroll toward (`data-more`: `start`, `end` or `start end`; absent when it fits), which the sheet fades; at
 * each draw and at each scroll. The pad's focused tab keeps the frame's own nearest-edge scroll (`./frame`). Moves only
 * that box's scroll, never the stage's or the page's. A browser adaptation: the launcher's layout, nothing of the game.
 * LR-18's fold (the box's run at f2246b03d): the axis is the tabs' own -- stacked, the column scrolls down; side by side,
 * the strip scrolls sideways -- never the box's overflow: the column is wider inside than its box too (a label longer
 * than the column, the ring's room), and taking the axis from that overflow scrolled the column sideways and marked its
 * sideways end, so at 844x390 and at Interface 130 % the current tab was never brought into view.
 */
export const TAB_FADE = 0.08;
const tabSeen = new WeakMap<Document, string>();
const tabWatched = new WeakSet<HTMLElement>();
/**
 * Whether `box`'s tabs run side by side (the phone's strip) rather than stacked (the column): two of its tabs' boxes
 * compared; with fewer than two, the box's overflow decides as before.
 */
function sideways(box: HTMLElement): boolean {
  const tabs = box.querySelectorAll<HTMLElement>('.cx-tab');
  if (tabs.length < 2) return box.scrollWidth > box.clientWidth + 1;
  const a = tabs[0]!.getBoundingClientRect();
  const b = tabs[1]!.getBoundingClientRect();
  return Math.abs(b.left - a.left) > Math.abs(b.top - a.top);
}
function tabEdges(box: HTMLElement): void {
  const side = sideways(box);
  const pos = side ? box.scrollLeft : box.scrollTop;
  const room = side ? box.scrollWidth - box.clientWidth : box.scrollHeight - box.clientHeight;
  setMore(box, moreOf(pos, room));
}
/** The edges a box scrolled to `pos` of `room` px can still scroll toward: `start`, `end`, both, or '' where it fits (<= 1px). */
export const moreOf = (pos: number, room: number): string => (room > 1 ? [pos > 1 ? 'start' : '', pos < room - 1 ? 'end' : ''].filter(Boolean).join(' ') : '');
function setMore(box: HTMLElement, more: string): void {
  if (more) { if (box.dataset['more'] !== more) box.dataset['more'] = more; } else if (box.hasAttribute('data-more')) box.removeAttribute('data-more');
}
/** Marks `box`'s scrollable vertical edges (`data-more`), for a list the sheet fades (the Theme list, LR-22 R6; the aside). */
export function markEdges(box: HTMLElement): void { setMore(box, moreOf(box.scrollTop, box.scrollHeight - box.clientHeight)); }
const asideWatched = new WeakSet<HTMLElement>();
/**
 * LR-22 (the side-by-side's pass 3, R2): under the CX-ASIDE grid the description panel is a short box scrolling its own text
 * (`../console.css`); it marks the edge the text can still scroll toward (`data-more`, as the tabs' strip does), which the
 * sheet fades, at each draw and at each scroll. A browser adaptation: the launcher's layout, nothing of the game.
 */
export function keepAsideEdges(doc: Document): void {
  const box = doc.querySelector<HTMLElement>('#stage [data-key="options"] .cx-aside');
  if (!box) return;
  if (!asideWatched.has(box)) { asideWatched.add(box); box.addEventListener('scroll', () => keepAsideEdges(doc), { passive: true }); }
  setMore(box, moreOf(box.scrollTop, box.scrollHeight - box.clientHeight));
}
export function keepTabInView(doc: Document): void {
  const nav = doc.querySelector<HTMLElement>('#stage [data-key="options"] .cx-tabs');
  const tab = nav?.querySelector<HTMLElement>('.cx-tab.is-current') ?? null;
  if (!nav || !tab) { tabSeen.delete(doc); return; }
  const view = doc.defaultView;
  const key = `${tab.dataset['i'] ?? ''}|${doc.documentElement.style.fontSize}|${view?.innerWidth ?? 0}x${view?.innerHeight ?? 0}`;
  const moved = tabSeen.get(doc) !== key;
  tabSeen.set(doc, key);
  for (const box of [tab.parentElement, nav]) {
    if (!box || view?.getComputedStyle(box).display === 'contents') continue;
    if (!tabWatched.has(box)) { tabWatched.add(box); box.addEventListener('scroll', () => tabEdges(box), { passive: true }); }
    if (moved) {
      const b = box.getBoundingClientRect();
      const r = tab.getBoundingClientRect();
      const side = sideways(box);
      if (side && box.scrollWidth > box.clientWidth + 1) {
        const fade = TAB_FADE * box.clientWidth;
        if (r.left - fade < b.left) box.scrollLeft = Math.max(0, box.scrollLeft - (b.left - (r.left - fade)));
        else if (r.right + fade > b.right) box.scrollLeft = Math.min(box.scrollWidth - box.clientWidth, box.scrollLeft + r.right + fade - b.right);
      } else if (!side && box.scrollHeight > box.clientHeight + 1) {
        const fade = TAB_FADE * box.clientHeight;
        if (r.top - fade < b.top) box.scrollTop = Math.max(0, box.scrollTop - (b.top - (r.top - fade)));
        else if (r.bottom + fade > b.bottom) box.scrollTop = Math.min(box.scrollHeight - box.clientHeight, box.scrollTop + r.bottom + fade - b.bottom);
      }
    }
    tabEdges(box);
  }
}
