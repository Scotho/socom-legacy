import type { Adapters } from '../state';

/**
 * LR-1 (the launcher redesign plan, LR.R8): the launcher's seven themes, the owner's Claude Design artifact's
 * (`docs/specs/launcher-redesign/S2-Launcher-v2.dc.html`, its `THEMES` and `THEME_NOTES`): the sky's top and bottom,
 * the sheets' colour, the glow under them and whether the gold trim runs along the first sheet. The same values are the
 * design system's `--s2u-lx-theme-*` token sets (`shared/ds/base.css`; part M points the live tokens at one by the
 * root's `data-s2u-theme`), held equal by `test/console/themes.test.ts`; the sheet backdrop (`./sheets`) draws from this
 * table, a canvas reading no stylesheet. A browser adaptation: the launcher's look, nothing of the game.
 */
export interface Theme {
  id: string;
  label: string;
  /** The artifact's line under the name in its theme list. */
  note: string;
  top: string;
  bottom: string;
  /** The sheets' colour, r g b. */
  sheet: readonly [number, number, number];
  /** The radial glow's colour, r g b. */
  glow: readonly [number, number, number];
  /** The gold trim along the first sheet's lower edge. */
  gold: boolean;
}

export const THEMES: readonly Theme[] = [
  { id: 'navy-gold', label: 'Navy & Gold', note: 'Default · SOCOM II', top: '#03080e', bottom: '#000000', sheet: [38, 146, 212], glow: [16, 96, 160], gold: true },
  { id: 'deep-water', label: 'Deep Water', note: 'Brighter navy', top: '#04172a', bottom: '#01050a', sheet: [70, 175, 235], glow: [20, 110, 180], gold: false },
  { id: 'blackout', label: 'Blackout', note: 'Near-black, low light', top: '#030405', bottom: '#000000', sheet: [110, 130, 150], glow: [30, 40, 50], gold: true },
  { id: 'night-ops', label: 'Night Ops', note: 'Steel blue', top: '#0b1622', bottom: '#02050a', sheet: [130, 195, 235], glow: [30, 80, 120], gold: false },
  { id: 'jungle', label: 'Jungle', note: 'Olive and moss', top: '#131c0f', bottom: '#030503', sheet: [175, 205, 125], glow: [50, 80, 30], gold: true },
  { id: 'desert', label: 'Desert', note: 'Sand and amber', top: '#21170c', bottom: '#060402', sheet: [235, 185, 115], glow: [110, 70, 20], gold: false },
  { id: 'frost', label: 'Frost', note: 'Pale ice', top: '#17222c', bottom: '#05080c', sheet: [205, 228, 248], glow: [60, 90, 120], gold: false },
];

/**
 * The Appearance rows' option ids (LR-5 draws the rows; the reads are here so the look follows them now). Each is an
 * index, as every option is (`../state` `options.value`): `theme` into `THEMES`; `backdrop` 0 the artifact's "None ·
 * Wave only" (its default), 1 Crossroads darkened behind the sheets; `clock` 0 the 24-hour clock (the artifact's
 * default), 1 the 12-hour. An option the adapter does not hold reads 0: the artifact's defaults.
 */
export const APPEARANCE = { theme: 'theme', picture: 'backdrop', clock: 'clock' } as const;

type Reads = { options: Pick<Adapters['options'], 'value'> };

export const themeOf = (a: Reads): Theme => THEMES[a.options.value(APPEARANCE.theme)] ?? THEMES[0]!;
export const pictureOn = (a: Reads): boolean => a.options.value(APPEARANCE.picture) === 1;
export const clock24 = (a: Reads): boolean => a.options.value(APPEARANCE.clock) !== 1;

/** The root's mark part M reads (`shared/ds/components.css`). */
export function applyTheme(doc: Document, t: Theme): void {
  const root = doc.documentElement;
  if (root.dataset['s2uTheme'] !== t.id) root.dataset['s2uTheme'] = t.id;
}

/** `[r, g, b]` as the tokens write it, `#rrggbb`. */
export const hex = (c: readonly [number, number, number]): string => `#${c.map((n) => n.toString(16).padStart(2, '0')).join('')}`;
