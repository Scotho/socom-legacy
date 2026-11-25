/**
 * The Forge's look (the owner, 2026-11-24: "a dark mode setting in the preferences, have two styles (socom style (current
 * style)) and a dark mode ... look really nice and cohesive ... feel modern"; 2026-11-25: "add a light mode, and also add
 * a custom mode where we can edit our own custom styles for colors, etc. Like the shortcuts allow the user to
 * import/export their stylesheet via json"; a browser adaptation, the game has no editor). Four themes:
 * - `socom`, the design system's own (`./tokens.css`);
 * - `dark` and `light`, neutral modern palettes (`./themes.css`, re-pointing the `--fx-*` aliases under
 *   `body[data-forge-theme]`);
 * - `custom`: one of those three as its base, with the person's own values over any of `CUSTOM_TOKENS` (set on the
 *   body's style, so every rule of `./forge.css` follows). Exported and imported as JSON (`exportCustomTheme`).
 * The choice is this browser's, kept through the page's store (`../pageStore`), never in a layout; Edit > Preferences >
 * Appearance sets it.
 */
import { pageSettings } from '../pageStore';

export type ForgeTheme = 'socom' | 'dark' | 'light' | 'custom';
/** A theme a custom one starts from. */
export type BaseTheme = Exclude<ForgeTheme, 'custom'>;

export const FORGE_THEMES: readonly { id: ForgeTheme; label: string; note: string }[] = [
  { id: 'socom', label: 'SOCOM', note: 'The game’s own look: deep teal, gold, condensed type' },
  { id: 'dark', label: 'Dark', note: 'A neutral modern dark: graphite surfaces, a blue accent, the system’s UI type' },
  { id: 'light', label: 'Light', note: 'A classic light editor: neutral grey panels, near-black text, a steel-blue accent' },
  { id: 'custom', label: 'Custom', note: 'Your own colours over SOCOM, Dark or Light: edit them below, import or export them as JSON' },
];

/** A token a custom theme may set: its CSS custom property, its words, its group, and whether it is a colour or a length. */
export interface CustomToken { name: string; label: string; group: string; kind: 'colour' | 'length' }

export const CUSTOM_TOKENS: readonly CustomToken[] = [
  { name: '--fx-deep', label: 'Viewport and deepest', group: 'Surfaces', kind: 'colour' },
  { name: '--fx-bg', label: 'Background', group: 'Surfaces', kind: 'colour' },
  { name: '--fx-bar', label: 'Bars', group: 'Surfaces', kind: 'colour' },
  { name: '--fx-panel', label: 'Panels', group: 'Surfaces', kind: 'colour' },
  { name: '--fx-panel-2', label: 'Raised (cards, fields)', group: 'Surfaces', kind: 'colour' },
  { name: '--fx-hover', label: 'Hover', group: 'Surfaces', kind: 'colour' },
  { name: '--fx-selected', label: 'Selected', group: 'Surfaces', kind: 'colour' },
  { name: '--fx-stripe', label: 'Alternate rows', group: 'Surfaces', kind: 'colour' },
  { name: '--fx-header', label: 'Section headers', group: 'Surfaces', kind: 'colour' },
  { name: '--fx-text', label: 'Text', group: 'Text', kind: 'colour' },
  { name: '--fx-text-strong', label: 'Strong text', group: 'Text', kind: 'colour' },
  { name: '--fx-dim', label: 'Dim text', group: 'Text', kind: 'colour' },
  { name: '--fx-gold', label: 'Accent', group: 'Accent', kind: 'colour' },
  { name: '--fx-gold-hi', label: 'Accent, bright', group: 'Accent', kind: 'colour' },
  { name: '--fx-on-accent', label: 'Text on the accent', group: 'Accent', kind: 'colour' },
  { name: '--fx-focus', label: 'Focus ring', group: 'Accent', kind: 'colour' },
  { name: '--fx-divider', label: 'Dividers', group: 'Edges', kind: 'colour' },
  { name: '--fx-control-edge', label: 'Control edges', group: 'Edges', kind: 'colour' },
  { name: '--fx-edge-hi', label: 'Edge under the pointer', group: 'Edges', kind: 'colour' },
  { name: '--fx-scroll-thumb', label: 'Scroll bars', group: 'Edges', kind: 'colour' },
  { name: '--fx-danger', label: 'Danger', group: 'States', kind: 'colour' },
  { name: '--fx-radius', label: 'Corner radius', group: 'Shape', kind: 'length' },
];
const TOKEN_NAMES = new Set(CUSTOM_TOKENS.map((t) => t.name));

/** A custom theme: its base and the values it sets (by token name; a token left out is the base's). */
export interface CustomTheme { base: BaseTheme; vars: Record<string, string> }

const KEY = 'forge.theme';
const CUSTOM_KEY = 'forge.theme.custom';
const listeners = new Set<(t: ForgeTheme) => void>();

const isTheme = (v: unknown): v is ForgeTheme => v === 'socom' || v === 'dark' || v === 'light' || v === 'custom';
const isBase = (v: unknown): v is BaseTheme => v === 'socom' || v === 'dark' || v === 'light';

/** The theme a browser that has chosen none wears (the owner, 2026-11-25: "make the dark theme the default theme"). */
export const DEFAULT_FORGE_THEME: ForgeTheme = 'dark';

/** The theme in force: the stored one, else the default (Dark). */
export function forgeTheme(): ForgeTheme {
  const v = pageSettings.get(KEY);
  return isTheme(v) ? v : DEFAULT_FORGE_THEME;
}

/** A value a token may take: a colour or a length's words, short, with nothing that would close the declaration. */
export const tokenValueOk = (t: CustomToken, v: string): boolean =>
  v.length > 0 && v.length <= 64 && !/[;{}<>\\]/.test(v)
  && (t.kind === 'length' ? /^\d{1,3}(\.\d+)?px$/.test(v) : /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla|oklch|color-mix)\(.*\)|[a-z]+)$/i.test(v));

/** A custom theme read from what is stored or given, every unknown token or bad value dropped; null for none at all. */
function customOf(raw: unknown): CustomTheme | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { base?: unknown; vars?: unknown };
  const vars: Record<string, string> = {};
  if (r.vars && typeof r.vars === 'object') {
    for (const [k, v] of Object.entries(r.vars as Record<string, unknown>)) {
      const t = CUSTOM_TOKENS.find((x) => x.name === k);
      if (t && typeof v === 'string' && tokenValueOk(t, v.trim())) vars[k] = v.trim();
    }
  }
  return { base: isBase(r.base) ? r.base : 'dark', vars };
}

/** The custom theme as kept (Dark with nothing of its own at first). */
export function customTheme(): CustomTheme {
  const raw = pageSettings.get(CUSTOM_KEY);
  let parsed: unknown = null;
  if (typeof raw === 'string') { try { parsed = JSON.parse(raw); } catch { parsed = null; } }
  return customOf(parsed) ?? { base: 'dark', vars: {} };
}

/** The custom theme kept, and drawn where it is the theme in force. */
export function setCustomTheme(doc: Document, c: CustomTheme): void {
  pageSettings.set(CUSTOM_KEY, JSON.stringify({ base: c.base, vars: c.vars }));
  if (forgeTheme() === 'custom') applyForgeTheme(doc, 'custom');
  for (const f of listeners) f(forgeTheme());
}

/** The base a theme draws with: its own, or a custom one's. */
export const baseOf = (theme: ForgeTheme): BaseTheme => (theme === 'custom' ? customTheme().base : theme);

/** `el`'s style set to the custom theme's values (and every other token cleared): the page's body, a preview. */
export function paintCustom(el: HTMLElement, c: CustomTheme | null): void {
  for (const n of TOKEN_NAMES) el.style.removeProperty(n);
  if (c) for (const [k, v] of Object.entries(c.vars)) el.style.setProperty(k, v);
}

/** The theme drawn on `doc`'s body (its `data-forge-theme`; SOCOM is the attribute's absence; a custom one's values over its base). */
export function applyForgeTheme(doc: Document, theme: ForgeTheme = forgeTheme()): void {
  const base = baseOf(theme);
  if (base === 'socom') delete doc.body.dataset['forgeTheme'];
  else doc.body.dataset['forgeTheme'] = base;
  paintCustom(doc.body, theme === 'custom' ? customTheme() : null);
  doc.documentElement.style.colorScheme = base === 'light' ? 'light' : 'dark';   // native scroll bars and fields follow
}

/** The theme chosen: kept in this browser, drawn on `doc`, told to every listener. */
export function setForgeTheme(doc: Document, theme: ForgeTheme): void {
  pageSettings.set(KEY, theme);
  applyForgeTheme(doc, theme);
  for (const f of listeners) f(theme);
}

/** Called whenever the theme (or the custom theme's values) changes. Returns the unsubscribe. */
export function onForgeThemeChange(f: (t: ForgeTheme) => void): () => void { listeners.add(f); return () => listeners.delete(f); }

/** The file's mark and version: what an import checks first. */
const FILE_KIND = 'forge-theme';

/** The custom theme as a file's JSON: its base and its own values only. */
export function exportCustomTheme(c: CustomTheme = customTheme()): string {
  return JSON.stringify({ kind: FILE_KIND, version: 1, base: c.base, vars: c.vars }, null, 2);
}

/** A theme file read: the custom theme it holds, or why it is refused (nothing kept either way: the caller keeps it). */
export function importCustomTheme(text: string): { ok: true; theme: CustomTheme; dropped: number } | { ok: false; error: string } {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, error: 'Not a theme file: it is not JSON' }; }
  if (!raw || typeof raw !== 'object' || (raw as { kind?: unknown }).kind !== FILE_KIND) return { ok: false, error: 'Not a Forge theme file (exported from Preferences > Appearance)' };
  const theme = customOf(raw)!;
  const given = Object.keys(((raw as { vars?: unknown }).vars ?? {}) as object).length;
  return { ok: true, theme, dropped: given - Object.keys(theme.vars).length };
}
