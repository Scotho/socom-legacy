import { mapArchiveId } from '@s2u/archive';
import { LOADING_UIVARS } from '@s2u/ui/loading';
import type { LoadingScreen } from '../loadingAssets';
import { variantGameName } from './gameName';

/**
 * DAY-TITLE (product track: a browser adaptation, display only; DAY.R1): the loading screen of a game told a variant names
 * the variant (`./gameName` `variantGameName`, `ABANDONED (DAY)`) in its title -- the binding's `title` and the
 * `mission_title` UIVAR the layout draws (`../loadingLayout`). Every other UIVAR stays the parent map's; the picture's
 * name too -- its bitmap is the Day map's own under that name (DAY-PIC-OVERRIDE, `./dayPictures`). No variant, a pair off the table or no binding: the screen as read, the same object.
 * The screen given is never changed (a copy of its binding and vars).
 */
export function withVariantTitle(screen: LoadingScreen, variant: string | null | undefined): LoadingScreen {
  const b = screen.binding;
  if (!b || (variant !== 'day' && variant !== 'night')) return screen;
  const stem = mapArchiveId(screen.map);
  const parent = b.vars.get(LOADING_UIVARS.title) ?? b.title;
  if (!stem || parent === null) return screen;
  const title = variantGameName(parent, stem, variant);
  if (title === parent) return screen;
  const vars = new Map(b.vars);
  vars.set(LOADING_UIVARS.title, title);
  return { ...screen, binding: { ...b, title, vars } };
}
