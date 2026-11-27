import { INVITE_ROUTE, inviteOf, lobbyInviteOf, withoutInvite } from '@s2u/ui';
import { routeSegmentsOfPath } from './menuRoutes';
import { detailsHidden } from './streamerMode';

/**
 * STREAMER-P1 slice 1b (OT.R152; product track, **a browser adaptation** with no original; the scope's s3.4 "The address
 * bar"): while Streamer mode's Room and account details are Hidden, an invite in the address -- `main/online?invite=..`
 * or a lobby link `/online/lobby/<id>` -- is held in this page's memory and the address shows the bare place at once
 * (`replaceState`: the invite's three keys dropped, a lobby link written as the invite route `main/online`, which the
 * menu router plans as LOGIN as it plans the lobby link; the other keys, the router's state and the fragment kept).
 * Every reader that took the invite from the address reads it here instead (`addressOf`): the launcher's invite
 * (`./console/adapters/invite`), its hand-over (`./console/adapters/launch` `gamePage`), the front end's
 * (`./inviteHost` `pageInvite`) and the lobby link's DEPLOYING panel (`./loadIn` `loadInLobbyLinkAt`) -- so the join is
 * the one it was. Nothing is stored: a reload while held has no invite (the address no longer carries it). Off, nothing
 * is held and every reader reads the address, as before.
 *
 * The hold is one per page and is let go only when the join starts (`pageInvite`'s `consumed`); a START cancelled or a
 * hand-off answered busy keeps it, as the address kept the invite in those cases. A new reader of the invite's address
 * reads it through `addressOf` / `heldInviteAddress`, or it sees the bare address.
 */
export const INVITE_ADDRESS_HOLD_ADAPTATION =
  'Streamer mode (details Hidden): an invite in the address held in memory and the address bared at once; the readers read the held one' as const;

export interface InviteAddress { readonly pathname: string; readonly search: string }

/** The address held, or null (none held: the readers read the address). */
let held: InviteAddress | null = null;

export const heldInviteAddress = (): InviteAddress | null => held;

/** What a reader takes the invite from: the held address, else `loc` as it is. */
export function addressOf(loc: InviteAddress): InviteAddress {
  return held ?? { pathname: loc.pathname, search: loc.search };
}

/** The held address let go (the join started: `pageInvite`'s `consumed`; a test). */
export function releaseInviteAddress(): void { held = null; }

const rootOf = (base: string): string => (base.endsWith('/') ? base : `${base}/`);

/** Whether `a` carries an invite: the query's three keys, or a lobby link's path. */
export function carriesInvite(a: InviteAddress, base: string): boolean {
  return inviteOf(a.search) !== null || lobbyInviteOf(routeSegmentsOfPath(a.pathname, rootOf(base))) !== null;
}

/** `a` without its invite: the query's keys dropped; a lobby link's path the invite route (`main/online`). No fragment. */
export function strippedAddress(a: InviteAddress, base: string): string {
  const lobby = lobbyInviteOf(routeSegmentsOfPath(a.pathname, rootOf(base))) !== null;
  const path = lobby ? `${rootOf(base)}${INVITE_ROUTE.join('/')}` : a.pathname;
  return `${path}${withoutInvite(a.search)}`;
}

interface HoldWindow {
  location: { pathname: string; search: string; hash: string };
  history: { state: unknown; replaceState(state: unknown, unused: string, url: string): void };
}

/**
 * Holds `a` (by default the window's address) when details are Hidden and it carries an invite, and writes the bare
 * address at once. True when it holds; false, nothing done. An address already held is held again only by a new one.
 */
export function holdInviteAddress(win: HoldWindow, base: string, a: InviteAddress = { pathname: win.location.pathname, search: win.location.search }): boolean {
  if (!detailsHidden() || !carriesInvite(a, base)) return false;
  held = { pathname: a.pathname, search: a.search };
  try { win.history.replaceState(win.history.state, '', `${strippedAddress(a, base)}${win.location.hash}`); } catch { /* the address stays; the invite is held either way */ }
  return true;
}
