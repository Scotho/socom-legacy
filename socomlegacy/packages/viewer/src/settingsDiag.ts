import { OPTION_VALVES } from '@s2u/ui';
import { pageClientErrorBeacon } from './clientErrorBeacon';
import { inputSources, type InputSource } from './inputSources';

/**
 * B-22 S2 (the lobby lane's batch, 2026-11-21; product track, **an instrument with no original**): "my settings change by
 * themselves" (name tags off, invert flipped, the video mode swapped) had no evidence to read -- the 11-15 audit looked at
 * storage only. When a stored option changes, the page sends one compact `settingdiag` row on the client error beacon
 * (`./clientErrorBeacon`, a diagnostic kind, its JSON in `message`): the surface that wrote it (`launcher`: the console's
 * commit, `./nativeOptionsContext` `optionCommitted`; `native`: the disc's OPTIONS pages' card save, the session's
 * `connectNativeOptions` save over the card as it stood), the option's name, its old and new value, and the input that
 * last drove the page (`./inputSources`: pad, keys, pointer -- a touch is a pointer). At most
 * `SETTINGS_DIAG_PER_LOAD_ADAPTATION` a page load, inside the beacon's own diagnostic budget. Nothing of the player: no
 * account, name or address. It changes nothing a setting does. Not covered (named): the boot's migrations and a card read
 * that differs from the page's last write; the native save's tuners (the UI variable module is not a flat number map); and
 * a native save that fails after its contents are taken (card full, MEMCARD_ERROR) still reports the change it meant to
 * write (the batch review's F3). Its rows do not count against the beacon's shared diagnostics (its own cap).
 */

/** The rows' version. An adaptation. */
export const SETTINGS_DIAG_VERSION = 1;
/** Rows a page load: enough for a session's real changes, few enough to leave the beacon's diagnostics room. An adaptation. */
export const SETTINGS_DIAG_PER_LOAD_ADAPTATION = 8;

export type SettingSurface = 'launcher' | 'native';

/** The row's message: `{ v, s, n, o, w, in }`. */
export function settingChangeMessage(surface: SettingSurface, name: string, before: number | null, after: number, input: InputSource | null): string {
  return JSON.stringify({ v: SETTINGS_DIAG_VERSION, s: surface, n: name.slice(0, 40), o: before, w: after, in: input });
}

/** The page's rows, on their own budget. */
export class SettingsChangeDiag {
  private sent = 0;
  constructor(private readonly send: (message: string) => void, private readonly input: () => InputSource | null = () => inputSources().last) {}

  /** A stored value moved from `before` to `after`: one row, unless it did not move or the budget is spent. True when sent. */
  change(surface: SettingSurface, name: string, before: number | null, after: number): boolean {
    if (before === after || this.sent >= SETTINGS_DIAG_PER_LOAD_ADAPTATION) return false;
    let input: InputSource | null = null;
    try { input = this.input(); } catch { input = null; }
    this.sent++;
    try { this.send(settingChangeMessage(surface, name, before, after, input)); } catch { /* an instrument never throws into a save */ }
    return true;
  }
}

type Reporter = (surface: SettingSurface, name: string, before: number | null, after: number) => void;
let page: SettingsChangeDiag | null = null;
let override: Reporter | null = null;

/** A test's seam: the reporter the write points call (null: the page's beacon). */
export function setSettingsDiagReporter(r: Reporter | null): void { override = r; }

/** The write points' call: never throws. */
export function reportSettingChange(surface: SettingSurface, name: string, before: number | null, after: number): void {
  if (before === after) return;
  try {
    if (override) { override(surface, name, before, after); return; }
    page ??= new SettingsChangeDiag((m) => { pageClientErrorBeacon().reportDiag('settingdiag', m); });
    page.change(surface, name, before, after);
  } catch { /* an instrument never throws into a save */ }
}

const same = (a: string, b: string): boolean => a.toUpperCase() === b.toUpperCase();
const flat = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : null);

/**
 * The option valves (`OPTION_VALVES`) a save changes: `[name, old, new]` for each held in both the card's valve module as
 * it stood and the one written, with another number. A name the card did not hold is no change (a first save writes all).
 */
export function optionValveChanges(before: unknown, after: unknown): [string, number, number][] {
  const was = flat(before), now = flat(after);
  if (!was || !now) return [];
  const out: [string, number, number][] = [];
  for (const [name, value] of Object.entries(now)) {
    if (typeof value !== 'number' || !OPTION_VALVES.some((n) => same(n, name))) continue;
    const old = Object.entries(was).find(([k]) => same(k, name))?.[1];
    if (typeof old === 'number' && old !== value) out.push([name, old, value]);
  }
  return out;
}
