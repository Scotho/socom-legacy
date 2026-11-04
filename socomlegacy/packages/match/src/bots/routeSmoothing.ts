import type { Point, WalkingNavigation } from './navigation';

/** OT.R81 (BTL.R3): the port's invention, no original value -- a bot decision, not an unknown of the game's. Route smoothing's lookahead along the route (world units). */
const SMOOTHING_ADAPTATION = { lookahead: 80 };

/** Authored CPU path-work budget. A blocked shortcut leaves the existing route intact; the controller
 * rotates the candidate on later decisions while the native mover continues along its checked route. */
export function smoothRoute(nav: Pick<WalkingNavigation, 'canWalk'>, from: Point, route: Point[], candidate: number): void {
  if (route.length < 3) return;
  let k = Math.min(Math.max(1, candidate), route.length - 1);
  while (k > 0) {
    const to = route[k]!;
    if (Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]) <= SMOOTHING_ADAPTATION.lookahead) break;
    k--;
  }
  if (k > 0 && nav.canWalk(from, route[k]!)) route.splice(0, k);
}
