/**
 * The forge menu's drawn card (FG-18's, moved here from `./page` for LATER 230; a browser adaptation, no original): its
 * rows from `./padMenu`'s entries, the cursor's row lit. LATER 230 (the merge controller's product-track call,
 * 2026-10-21): a pointer reaches the whole menu -- a row's hover moves the cursor and its click runs it, as before, and a
 * value turned left / right draws its ‹ and › as two steps a click or a tap turns (`fx-menu-step`, the row's own glyphs;
 * a coarse pointer's 44 px hit area is invisible padding). Opened by the toolbar's menu button, the header's hint names the
 * pointer's ways instead of the pad's.
 *
 * FUI-3 (the review's PAD-6, UX-6, VP-11's menu half; FUI.R6): the header carries the breadcrumb of a sub-screen (and its
 * Back, a pointer's Circle), the section strip L1 / R1 page (a click jumps), and on a pad the one legend's glyphs
 * (`./shell/legend`) in place of the text characters; each section's heading is a row of its own; a row that opens a
 * sub-screen carries its mark; a row's Square and Triangle are buttons a pointer presses; a grid sub-screen is drawn as
 * one. Stable hooks: `data-forge-menu-row`, `data-forge-menu-section`, `data-forge-menu-back`.
 */
import { PAD_MENU_INPUT, type MenuInput, type PadMenu } from './padMenu';
import { drawLegend, legendFor } from './shell/legend';

/** The header's hint, opened by the toolbar's menu button: a pointer's ways. */
export const MENU_HINT_POINTER = 'tap a row · ‹ › change · outside closes';
/** The header's hint, opened by M (OT.R68): the keys `./keys` reads in the menu (M closes it at any depth, `./page`). */
export const MENU_HINT_KEYS = '↑ ↓ choose · ← → change · Enter select · PgUp PgDn section · Esc back · M close';

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = doc.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

/** FUI-3: the header -- the breadcrumb, a sub-screen's Back, the hint (the pad's glyphs), the section strip. */
function menuHead(doc: Document, menu: PadMenu, byPointer: boolean | 'keys'): HTMLElement {
  const head = el(doc, 'header');
  const title = el(doc, 'div', 'fx-menu-title');
  if (menu.depth() > 0) {
    const back = el(doc, 'button', 'fx-menu-back', '‹');
    back.type = 'button';
    back.dataset['forgeMenuBack'] = '';
    back.setAttribute('aria-label', `Back to ${menu.crumbs().slice(-2, -1)[0] ?? 'Forge'}`);
    back.addEventListener('click', () => menu.input('back'));
    title.append(back);
  }
  title.append(el(doc, 'h2', '', menu.crumbs().join(' › ')));
  const hint = el(doc, 'span', 'fx-dim');
  if (byPointer === 'keys') hint.textContent = MENU_HINT_KEYS;
  else if (byPointer) hint.textContent = MENU_HINT_POINTER;
  else {
    const prompts = el(doc, 'ul');
    drawLegend(doc, prompts, legendFor({ kind: 'menu', item: menu.current(), depth: menu.depth(), sections: menu.sections().length }), {
      pad: true, placement: 'inline', onPress: (a) => { const m = PAD_MENU_INPUT[a]; if (m) menu.input(m); },
    });                                                                   // R7-A R2: in the header, never the viewport's strip
    hint.append(prompts);
  }
  head.append(title, hint);
  const sections = menu.sections();
  if (sections.length > 1) {
    const strip = el(doc, 'nav', 'fx-menu-sections');
    strip.setAttribute('aria-label', 'Sections · L1 / R1');
    const on = menu.section()?.id;
    for (const s of sections) {
      const b = el(doc, 'button', 'fx-menu-section', s.label);
      b.type = 'button';
      b.dataset['forgeMenuSection'] = s.id;
      if (s.id === on) b.setAttribute('aria-current', 'true');
      b.addEventListener('click', () => menu.jumpSection(s.id));
      strip.append(b);
    }
    head.append(strip);
  }
  return head;
}

/** The card for the menu as it stands; `byPointer`: opened by the toolbar's button (true), the pad (false) or M ('keys'). */
export function menuCard(doc: Document, menu: PadMenu, byPointer: boolean | 'keys'): HTMLDivElement {
  const card = el(doc, 'div', 'fx-card fx-menu');
  const head = menuHead(doc, menu, byPointer);
  const ul = el(doc, 'ul', 'fx-menu-list');
  const grid = menu.grid();
  if (grid > 0) { ul.classList.add('is-grid'); ul.style.setProperty('--fx-menu-cols', String(grid)); }
  menu.entries().forEach((it, i) => {
    const li = el(doc, 'li');
    if (it.heading) {                                                     // FG-24: a group's heading; FUI-3: a section's
      li.className = it.section !== undefined && it.id === `section-${it.section}` ? 'is-head is-section' : 'is-head';
      if (li.classList.contains('is-section')) li.dataset['forgeMenuHead'] = it.section;
      li.textContent = it.label;
      ul.append(li);
      return;
    }
    li.dataset['forgeMenuRow'] = it.id;
    li.classList.toggle('is-on', i === menu.index());
    li.classList.toggle('is-off', it.disabled === true);
    if (grid > 0 && !it.left && !it.right) li.classList.add('is-cell');
    const text = el(doc, 'div');
    text.append(el(doc, 'span', 'fx-menu-label', it.label));
    if (it.note && i === menu.index()) text.append(el(doc, 'span', 'fx-menu-note', it.note));
    li.append(text);
    if (it.value !== undefined) {
      const value = el(doc, 'span', 'fx-menu-value');
      if (it.left || it.right) {
        const step = (glyph: string, way: 'left' | 'right', name: string): HTMLButtonElement => {
          const b = el(doc, 'button', 'fx-menu-step', glyph);
          b.type = 'button';
          b.setAttribute('aria-label', `${it.label}: ${name}`);
          b.disabled = it.disabled === true;
          b.addEventListener('click', (e) => { e.stopPropagation(); menu.point(i); menu.input(way); });
          return b;
        };
        // The review's F1 and F3: the value with steps clips nothing (the steps' hit areas reach past it); its text is
        // its own clipped span, so a long one keeps its › on the screen.
        value.classList.add('has-steps');
        value.append(step('‹', 'left', 'previous'), el(doc, 'span', 'fx-menu-text', it.value), step('›', 'right', 'next'));
      } else value.textContent = it.value;
      li.append(value);
    }
    // FUI-3: the row's Square and Triangle, for a pointer (a pad presses them on the lit row); never the row's own click.
    const presses: [MenuInput, string][] = [];
    if (it.secondary) presses.push(['secondary', it.secondary.label]);
    if (it.remove) presses.push(['remove', it.remove.label]);
    if (presses.length && it.disabled !== true) {
      const acts = el(doc, 'span', 'fx-menu-acts');
      for (const [input, label] of presses) {
        const b = el(doc, 'button', 'fx-menu-act', label);
        b.type = 'button';
        b.dataset['padPress'] = input;
        b.setAttribute('aria-label', `${it.label}: ${label}`);
        b.addEventListener('click', (e) => { e.stopPropagation(); menu.point(i); menu.input(input); });
        acts.append(b);
      }
      li.append(acts);
    }
    if (it.page) li.append(el(doc, 'span', 'fx-menu-more', '›'));       // FUI-3: Cross opens a sub-screen
    // A mouse's hover moves the cursor; a touch or a pen does not: its own enter, before the press, would move the cursor's
    // note and the rows under the finger (the fold's rendered run). A tap's row is chosen by its click. R7-A R1 (the Forge
    // batch's first rendered pass): the hover is the mouse's movement, never its enter -- each redraw replaces the card,
    // and a mouse resting over it meets the new row under it with an enter and no movement, which snapped the pad's
    // cursor back to that row after every d-pad press. A move within the cursor's own row changes nothing (no redraw).
    li.addEventListener('pointermove', (e) => { if ((e as PointerEvent).pointerType === 'mouse' && menu.index() !== i) menu.point(i); });
    // LATER 234 (found by LATER 230's review, F2): a greyed row's click runs nothing -- `point` skips it, so a select
    // would run the row under the cursor instead (on touch, with no hover, whichever that was).
    li.addEventListener('click', () => { if (it.disabled === true) return; menu.point(i); menu.input('select'); });
    ul.append(li);
  });
  card.append(head, ul);
  return card;
}

/**
 * The card put in its host for a redraw: the list kept where it was scrolled (a new list starts at its top, so a lower
 * row stepped on a phone left the screen at every tap), and the lit row brought into view for a pad's cursor. FUI-3: a
 * sub-screen pushed or popped is a new list: it starts at its top.
 */
export function placeMenuCard(host: HTMLElement, card: HTMLElement): void {
  const was = host.querySelector<HTMLElement>('ul.fx-menu-list');
  const same = was?.parentElement?.querySelector('header h2')?.textContent === card.querySelector('header h2')?.textContent;
  const top = same ? was?.scrollTop ?? 0 : 0;
  host.replaceChildren(card);
  const ul = card.querySelector<HTMLElement>('ul.fx-menu-list');
  if (ul) ul.scrollTop = top;
  card.querySelector<HTMLElement>('ul.fx-menu-list > li.is-on')?.scrollIntoView?.({ block: 'nearest' });
}

/**
 * The match's way back to the forge, as its button says it (LATER 230, the merge controller's word): a pad connected, the
 * pad's chord; else a development build on a fine pointer, its keys; else the words alone (a tap or a click is the way).
 */
export function matchBackWords(o: { dev: boolean; pad: boolean; coarse: boolean }): string {
  if (o.pad) return 'Back to the forge · hold SELECT + START';
  if (o.dev && !o.coarse) return 'Back to the forge · P or Esc';
  return 'Back to the forge';
}
