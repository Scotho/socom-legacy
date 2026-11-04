/**
 * LR-5: the Settings screen's rows as a test reads them, in LR-1's row kinds (`src/console/render/options.ts`): each row
 * the grammar acts on (`[data-act="optrow"]`), its label, and the word it shows where the roller's value was -- a
 * select's (or a locked row's) choice, a slider's or an info row's value, a toggle's state as "On" / "Off", an action's
 * word (its hint). The same [label, value] facts the rollers' `.cx-roller__label` / `.cx-roller__value` gave.
 */
export const optRowEls = (doc: Document = document, root = '#stage'): HTMLElement[] =>
  [...doc.querySelectorAll<HTMLElement>(`${root} [data-key="options"] [data-act="optrow"]`)];

export function optRowValue(r: Element): string {
  if (r.classList.contains('cx-r--toggle')) return r.getAttribute('aria-checked') === 'true' ? 'On' : 'Off';
  const el = r.querySelector('.cx-r__choice') ?? r.querySelector('.cx-r__value') ?? r.querySelector('.cx-r__hint');
  return el?.textContent ?? '';
}

export const optRowLabel = (r: Element): string => r.querySelector('.cx-r__label')?.textContent ?? '';

export const optRows = (doc: Document = document, root = '#stage'): [string, string][] => optRowEls(doc, root).map((r) => [optRowLabel(r), optRowValue(r)]);
