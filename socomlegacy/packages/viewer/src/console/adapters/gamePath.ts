import { isLobbyLinkPath, routePlan } from '@s2u/ui';
import { routeSegmentsOfPath } from '../../menuRoutes';

/**
 * The path the console's hand-over leaves in the address for the front end's menu router (`../../menuRoutes`, OT.R10)
 * -- CX-9a: since the console launcher is the base path's page (CX.R8, the owner, 2026-10-12), the server answers a
 * menu flow's deep route (`<base>main/online`, ...) with it (`vite.config.ts`, Vite's HTML fallback), so a page loaded
 * at one keeps that path for the router to replay once the disc is chosen; any other path -- the console's own alias
 * `<base>console`, which the router would read as an unknown place and land on the main menu past the boot and the
 * intro (the whole-branch review's BLOCK 1), an unknown path, a path outside the base -- is replaced by the base, as the
 * hand-over always did. "Names a menu place" is the router's own reading at its start: the path's segments
 * (`routeSegmentsOfPath`) planned by `@s2u/ui`'s `routePlan` with its default guards land anywhere but `unknown` (a
 * guarded place lands on its ancestor, the router's to do). The disc's own dialog check is the router's too (it asks the
 * machine); this asks none. A browser adaptation with no original (OT.R28).
 */
export function gamePath(pathname: string, base: string): string {
  const root = base.endsWith('/') ? base : `${base}/`;
  const segments = routeSegmentsOfPath(pathname, root);
  // LINK-2: `/online/lobby/<id>` is the share link. The menu router plans it as LOGIN and keeps this path.
  if (isLobbyLinkPath(segments)) return pathname;
  return segments.length > 0 && routePlan(segments).landed !== 'unknown' ? pathname : root;
}
