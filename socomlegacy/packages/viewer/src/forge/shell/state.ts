/**
 * FUI-1 (the review's UX-13; a browser adaptation, FG.R2): the one place the Forge derives which surface is up and
 * whether the layout takes an edit. The flags are the page's own (`./page`). FUI-1b (the plan's task, decided on dot's
 * integration questions): `canEdit` is Build's only -- false in Walk, in Play, under a lobby's hold or its server match,
 * while a dialog is over the page and while the map check runs -- and `canPlace` adds that no card (the START menu, the
 * controls card) is open and the editor is not loading. The page's own refusal of a human edit is unchanged
 * (`forgeEditRefusal`: only the lobby's hold; Walk and Play refuse their edits by their own checks, and a dialog or a
 * check takes the input before an edit is asked). Nothing here changes what the game does.
 */
export type ForgeSurface = 'build' | 'walk' | 'play' | 'blocked';

/** What the page knows now: its own flags, read at each call. */
export interface ForgeSurfaceFlags {
  /** A forge lobby holds the layout: open and not ended (the page's `editsLocked`). */
  lobbyHolds: boolean;
  /** The match on screen is the lobby's server match (`matchOfLobby`). */
  serverMatch: boolean;
  /** A match is mounted (`match`). */
  match: boolean;
  /** The layout is walked on foot (`playing`). */
  walking: boolean;
  /** FUI-1b: a dialog is over the page (the page's `modal`: a question, the Saves card, the disc's chooser). */
  modal: boolean;
  /** FUI-1b: the map check is running (`checking`). */
  checking: boolean;
  /** FUI-1b: a card the pad answers is open over the editor (the START menu, the controls card). */
  card: boolean;
  /** FUI-1b: the editor is loading (`busy`: a base or a layout being staged). */
  busy: boolean;
}

export interface ForgeSurfaceState {
  surface: ForgeSurface;
  /** FUI-1b: the layout takes an edit now -- Build only, no dialog, no check running. */
  canEdit: boolean;
  /** FUI-1b: a placement is admitted now -- `canEdit`, no card open, not loading. */
  canPlace: boolean;
  /** Why the first of the two refuses (`canEdit`'s rule, then `canPlace`'s); null when a placement is admitted. */
  reason: string | null;
}

/** `ForgePanelContext.state()`: the surface and the edit rule with the layout's revision as of now. */
export interface ForgeShellState extends ForgeSurfaceState { revision: number }

/** The refusal the page pops when a lobby holds the layout (its `refuseEdit`). */
export const LOBBY_HOLDS_REASON = 'The lobby holds this layout: leave it to edit';

/** FUI-1b: the words of each refusal, in the order they are read (a browser adaptation's own, no original). */
export const FORGE_REFUSALS = {
  lobbyHolds: LOBBY_HOLDS_REASON,
  serverMatch: 'The lobby’s match is on: edit once it ends',
  match: 'Stop Play to edit',
  walking: 'Stop walking to edit',
  modal: 'Close the dialog to edit',
  checking: 'The map check is running',
  card: 'Close the menu to place',
  busy: 'The Forge is loading',
  // LATER 819: the page's other causes of `busy` (`forgeBusyRefusal`), each in its own words -- "loading" is an open's.
  restoring: 'An undo or redo is still placing the layout',
  walkStarting: 'Walk is starting',
  playStarting: 'Play is starting',
  lobbyMatchStarting: 'The lobby’s match is starting',
  lobbyMaking: 'The lobby is being made',
  // R4 (the UI seat's seam note to dot, 2026-10-25 11:23Z): a drop's own refusals (`ForgeEditor.projectDrop`), read by no
  // surface rule -- a drop that falls outside the view, and one before a base is open.
  outsideView: 'Drop it over the view',
  noBase: 'Open a base first',
} as const;

/**
 * LATER 819: what holds the page `busy` -- a layout opening (the boot's first open included), an undo or a redo being put
 * back, a Walk, a Play or a lobby's match starting, a lobby being made -- and the words a press refused then says.
 */
export type ForgeBusyCause = 'open' | 'undo' | 'walk' | 'play' | 'lobbyMatch' | 'lobby';
const BUSY_REFUSALS: Readonly<Record<ForgeBusyCause, keyof typeof FORGE_REFUSALS>> = {
  open: 'busy', undo: 'restoring', walk: 'walkStarting', play: 'playStarting', lobbyMatch: 'lobbyMatchStarting', lobby: 'lobbyMaking',
};
export function forgeBusyRefusal(cause: ForgeBusyCause): string {
  return FORGE_REFUSALS[BUSY_REFUSALS[cause]];
}

const EDIT_RULES = ['lobbyHolds', 'serverMatch', 'match', 'walking', 'modal', 'checking'] as const;
const PLACE_RULES = ['card', 'busy'] as const;

export function forgeSurfaceState(flags: ForgeSurfaceFlags): ForgeSurfaceState {
  const surface: ForgeSurface = flags.lobbyHolds || flags.serverMatch ? 'blocked' : flags.match ? 'play' : flags.walking ? 'walk' : 'build';
  const editRule = EDIT_RULES.find((k) => flags[k]);
  const placeRule = editRule ?? PLACE_RULES.find((k) => flags[k]);
  return { surface, canEdit: editRule === undefined, canPlace: placeRule === undefined, reason: placeRule === undefined ? null : FORGE_REFUSALS[placeRule] };
}

/** The page's own refusal of a human edit (FG-26's `refuseEdit`), unchanged by FUI-1b: only the lobby's hold. */
export function forgeEditRefusal(flags: Pick<ForgeSurfaceFlags, 'lobbyHolds'>): string | null {
  return flags.lobbyHolds ? LOBBY_HOLDS_REASON : null;
}

/** The agent's mode of a surface (`ForgeAgentSnapshot['mode']`): Walk and Play are both its `forge-play`. */
export function agentModeOf(surface: ForgeSurface): 'forge-editor' | 'forge-play' | 'blocked' {
  return surface === 'blocked' ? 'blocked' : surface === 'build' ? 'forge-editor' : 'forge-play';
}
