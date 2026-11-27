/**
 * A page's display rule over a UI variable's printed text (STREAMER-P1, OT.R152; product track, **a browser adaptation**
 * with no original): for a TEXT or WRAPPEDTEXT that prints a variable, the page may give words drawn in its place -- the
 * own name drawn "YOU", the clan name "Hidden (streamer mode)" -- asked per widget and told the dialog
 * (`dlgCreateClan.rdr`; null when the builder names none), so a name-entry field or one dialog's field is left as typed.
 * The variable's value, what is typed and what is sent are unchanged: only the drawing. Unset, or where the rule
 * answers null, every widget prints its variable as the original does. The viewer sets it (`viewer/src/streamerMode.ts`,
 * while Streamer mode's Room and account details are Hidden), so `ui/` reads no viewer setting. The asterisk mask is its
 * sibling (`./displayMask`).
 */
export type UiVarDisplayRule = (varName: string, widgetName: string, dialog: string | null) => string | null;

let rule: UiVarDisplayRule | null = null;

/** The page's rule (null: none). */
export function setUiVarDisplayText(r: UiVarDisplayRule | null): void {
  rule = r;
}

/** What a widget named `widget` of the dialog `dialog` that prints the variable `name` draws for its printed `text`. */
export function uiVarShownText(name: string | null | undefined, widget: string, text: string, dialog: string | null = null): string {
  if (!name || rule === null) return text;
  try { return rule(name, widget, dialog) ?? text; } catch { return text; }
}

const watchers = new Set<() => void>();

/**
 * Told when the page's rule or mask changes (`uiVarDisplayChanged`): the widget sets redraw their TEXT and WRAPPEDTEXT
 * from the variable's value as it is, so an open dialog follows a live toggle (the controller's ruling (d), 2026-11-24).
 * Returns the removal.
 */
export function onUiVarDisplayChange(f: () => void): () => void {
  watchers.add(f);
  return () => { watchers.delete(f); };
}

/** The page's rule or mask changed: every watcher redraws (one that throws is passed over). */
export function uiVarDisplayChanged(): void {
  for (const f of [...watchers]) { try { f(); } catch { /* the next */ } }
}
