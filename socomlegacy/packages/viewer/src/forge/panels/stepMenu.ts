import { forgeEl } from '../shell/panel';

/**
 * The script steps' one menu (the Forge's owner (crispy, OT.R112), 2026-11-13: "make this dropdown the same one as the one when we press the +
 * button in the node editor. Everywhere where we see that popup should show the new one"; a browser adaptation, FG.R2):
 * the node editor's + menu, the Step row's list (Inspector and node) and the Inspector's Add a step. Each step its
 * engine word in its family's colour and its words, a family at a time, a line between; then the row's own actions
 * (Move up, Move down, Remove). Fixed on the page, so a zoomed or clipped node graph never cuts it.
 */

/** The engine's own word for each command (`../placedAccess` `scriptPrograms`). */
export const STEP_COMMAND: Readonly<Record<string, string>> = {
  sound: 'SOUND', effect: 'EFFECT', wait: 'WAIT', loop: 'LOOP', while: 'WHILE', endWhile: 'END WHILE', if: 'IF', elseif: 'ELSE IF',
  else: 'ELSE', end: 'END IF', set: 'SET', show: 'SHOW', hide: 'HIDE', run: 'RUN', message: 'MESSAGE', blast: 'BLAST', fade: 'FADE',
  callSequence: 'CALL SEQUENCE', stopSequence: 'STOP SEQUENCE',
};

/** Its family, for its colour: what it sounds or draws, how the flow goes, what it changes, what it sets off. */
export const STEP_FAMILY: Readonly<Record<string, string>> = {
  sound: 'media', effect: 'media', message: 'media', wait: 'flow', loop: 'flow', while: 'flow', endWhile: 'flow', if: 'flow', elseif: 'flow',
  else: 'flow', end: 'flow', set: 'state', show: 'state', hide: 'state', fade: 'state', run: 'action', blast: 'action',
  callSequence: 'flow', stopSequence: 'flow',
};

/**
 * The menu's order, a family at a time: the flow (its blocks' openers after the waits, each closer beside its opener),
 * then what sounds or draws, what it changes, what it sets off.
 */
export const STEP_MENU_ORDER: readonly string[] = [
  'wait', 'loop', 'while', 'endWhile', 'if', 'elseif', 'else', 'end', 'callSequence', 'stopSequence',
  'sound', 'effect', 'message',
  'set', 'show', 'hide', 'fade',
  'run', 'blast',
];

/** A step's words without the engine word in brackets (the menu shows that word already, in its colour). */
export const stepWords = (words: string): string => words.replace(/\s*\([A-Z_ ]+\)$/, '');

let openNow: { close(): void } | null = null;

/** Whether a step menu is open (a second press on its anchor closes it). */
export function stepMenuOpen(): boolean { return openNow !== null; }

/** The open step menu closed, if any. */
export function closeStepMenu(): void { openNow?.close(); }

/**
 * The menu under `anchor`: `steps` (each `[kind, words]`), by family; `actions` after a line (`[value, words]`, a
 * `remove` in red); `current` the step's own, marked. A press picks (`pick(value)`); a press away, a scroll or Escape
 * closes it.
 */
export function openStepMenu(doc: Document, anchor: HTMLElement, steps: readonly (readonly [string, string])[], pick: (value: string) => void,
  opts: { current?: string; actions?: readonly (readonly [string, string])[] } = {}): void {
  closeStepMenu();
  const m = forgeEl(doc, 'div', 'fx-sg-menu fx-step-menu');
  m.setAttribute('role', 'menu');
  const rank = (k: string): number => { const i = STEP_MENU_ORDER.indexOf(k); return i < 0 ? STEP_MENU_ORDER.length : i; };
  const item = (value: string, cmd: string, words: string, fam: string): HTMLButtonElement => {
    const b = forgeEl(doc, 'button', `fx-sg-menu-item fx-sg-fam-${fam}${value === opts.current ? ' is-on' : ''}`) as HTMLButtonElement;
    b.type = 'button';
    b.setAttribute('role', 'menuitem');
    b.append(forgeEl(doc, 'span', 'fx-sg-cmd', cmd), forgeEl(doc, 'span', '', words));
    b.addEventListener('click', (e) => { e.stopPropagation(); close(); pick(value); });
    return b;
  };
  let family: string | null = null;
  for (const [kind, words] of [...steps].sort((a, b) => rank(a[0]) - rank(b[0]))) {
    const fam = STEP_FAMILY[kind] ?? 'flow';
    if (family !== null && fam !== family) m.append(forgeEl(doc, 'div', 'fx-sg-menu-sep'));
    family = fam;
    m.append(item(kind, STEP_COMMAND[kind] ?? kind.toUpperCase(), stepWords(words), fam));
  }
  if (opts.actions?.length) {
    m.append(forgeEl(doc, 'div', 'fx-sg-menu-sep'));
    for (const [value, words] of opts.actions) {
      const [mark, ...rest] = words.split(' ');
      m.append(item(value, mark ?? '', rest.join(' '), value === 'remove' ? 'remove' : 'tool'));
    }
  }
  doc.body.append(m);
  // Under its anchor, kept on the screen: above it when there is no room below, inside the window's sides.
  const a = anchor.getBoundingClientRect();
  const view = doc.defaultView;
  const vw = view?.innerWidth ?? 0, vh = view?.innerHeight ?? 0;
  const w = m.offsetWidth, h = m.offsetHeight;
  let left = a.left - 8, top = a.bottom + 6;
  if (vw) left = Math.max(4, Math.min(left, vw - w - 4));
  if (vh && top + h > vh - 4) top = Math.max(4, a.top - 6 - h);
  if (vh && top + h > vh - 4) { top = 4; m.style.maxHeight = `${vh - 8}px`; }
  m.style.left = `${left}px`;
  m.style.top = `${top}px`;
  const away = (e: Event): void => { if (!m.contains(e.target as Node) && !anchor.contains(e.target as Node)) close(); };
  const key = (e: KeyboardEvent): void => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
  const close = (): void => {
    m.remove();
    doc.removeEventListener('pointerdown', away, true);
    doc.removeEventListener('wheel', away, true);
    doc.removeEventListener('scroll', away, true);
    doc.removeEventListener('keydown', key, true);
    if (openNow === handle) openNow = null;
  };
  const handle = { close };
  openNow = handle;
  doc.addEventListener('pointerdown', away, true);
  doc.addEventListener('wheel', away, true);
  doc.addEventListener('scroll', away, true);
  doc.addEventListener('keydown', key, true);
  (m.querySelector('.is-on') as HTMLElement | null)?.scrollIntoView?.({ block: 'nearest' });
}
