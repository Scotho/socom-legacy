import type { UiSoundCues } from '@s2u/ui';

/**
 * FORGE (a browser adaptation, no original): the body class the forge's page holds while a match runs over it -- Play's
 * offline match or a lobby's match on the server. A contract between the lanes: the modern UI lane's overlay over the
 * forge (MU2-17, MU2.R9) reads it as "a round is running" and locks Replays' Watch and the loadout editor's disc read,
 * as on the game's pages. Renaming or dropping it breaks that gate silently: change it only with the modern UI lane.
 */
export const FORGE_MATCHING_CLASS = 'is-matching';

/**
 * F7 (a) of OVERLAY-CONSOLE (MISSION OT.R60 (e); a browser adaptation, OT.R28): the menus' cues of the forge match now
 * running -- `./match` `forgeMatchCues`, the disc's `uisounds.rdr` and HUDUI bank on an audio of their own over the
 * match's output -- for the overlay over the forge to play its open and close by (`../modern/overlay/page`
 * `overlayPageReads.sounds`). Set by the match once the files are read, cleared at its end; null outside a match, or in
 * one whose source has no menu sound files. A contract between the lanes, as the class above: this module keeps no
 * import but types, so the overlay's chunk takes nothing of the forge's with it.
 */
let matchSounds: UiSoundCues | null = null;

export function setForgeMatchSounds(cues: UiSoundCues | null): void {
  matchSounds = cues;
}

export function forgeMatchSounds(): UiSoundCues | null {
  return matchSounds;
}
