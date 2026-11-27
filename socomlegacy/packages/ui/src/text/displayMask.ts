/**
 * A page's display mask over UI variables (STREAMER-P1, OT.R152; product track, **a browser adaptation** with no original):
 * the page names variables whose printed text is drawn as SECURETEXT draws its own -- one `*` a character (`secureCodes`,
 * `FUN_0036aff0`) -- in a TEXT widget that prints it, in a dialog's build, and in the soft keyboard's typed lines while
 * it edits one. The variable's value, what is typed and what is sent are unchanged: only the drawing. Unset, nothing is
 * masked and every widget draws as the original's. The viewer sets it (`viewer/src/streamerMode.ts`: the game passwords
 * while Streamer mode's Room and account details are Hidden), so `ui/` reads no viewer setting.
 */
let masked: (name: string) => boolean = () => false;

/** The page's predicate (null: none). */
export function setUiVarDisplayMask(pred: ((name: string) => boolean) | null): void {
  masked = pred ?? (() => false);
}

/** True when the variable `name` is drawn masked now. */
export function uiVarMasked(name: string | null | undefined): boolean {
  if (!name) return false;
  try { return masked(name); } catch { return false; }
}
