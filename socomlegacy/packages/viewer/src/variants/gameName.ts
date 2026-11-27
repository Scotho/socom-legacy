import { variantName } from '@s2u/archive';

/**
 * DAY-NAME (product track: a browser adaptation, display only; DAY.R1): the name a game's line shows -- the variant's
 * (`variantName`, `ABANDONED (DAY)`) when the game was told one, else the map's own `name`. A pair off the table, or no
 * variant, is the map's name. Read by `../matchMount` `gameLines` (the welcome's variant) and `../main` `show` (the test
 * room's switch mark); the mode lookup (`../mapOrder` `rankOf`) is never given this name, it keeps the parent's.
 */
export function variantGameName(name: string, stem: string, variant: string | null | undefined): string {
  if (variant !== 'day' && variant !== 'night') return name;
  return variantName(stem, variant) ?? name;
}
