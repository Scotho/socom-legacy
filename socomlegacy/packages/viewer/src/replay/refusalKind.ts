/**
 * MU2-14 (part A): why a replay is not played, as data -- the kind a `./load` `ReplayLoadError` carries beside its
 * sentence for the player. REPLAY_ADAPTATION: a browser adaptation with no original (SOCOM II plays no recording back);
 * nothing of the game is read or changed here.
 *
 * - `version`: the file is of another network protocol or file format than this build plays (`./load` `refusal`).
 * - `corrupt`: the file does not parse -- empty, not a readable gzip, no header, a bad record, no whole record yet.
 * - `missing`: the match server's 404 for a hosted replay -- not found, or not yours to watch (W36.R2 tells them apart for
 *   nobody: `REPLAY_NOT_FOUND_OR_NOT_YOURS`).
 * - `unavailable`: anything else -- no answer, a redirect, another HTTP status, an address the page does not fetch.
 *
 * Its own module, with no import but the leaf name table (`@s2u/archive/mapNames`, itself import-free), so the modern
 * Replays view (`../modern/replays/view`) reads a kind without taking the loader and the format's decoders into the
 * list's chunk (they are loaded on the first Watch: `../modern/replays/stage`).
 */
import { mapRow } from '@s2u/archive/mapNames';

export type ReplayLoadKind = 'version' | 'corrupt' | 'missing' | 'unavailable';

export const REPLAY_LOAD_KINDS: readonly ReplayLoadKind[] = Object.freeze(['version', 'corrupt', 'missing', 'unavailable']);

/**
 * The kind of a refusal `e`, when it is a `./load` `ReplayLoadError` (known by its `name`, not `instanceof`: this module
 * does not import the loader) carrying one of the four; else null -- a reason that never came through the loader, which
 * a reader sorts by its words if at all (`../modern/replays/view` `replayRefusalKind`).
 */
export function loadKindOf(e: unknown): ReplayLoadKind | null {
  if (!(e instanceof Error) || e.name !== 'ReplayLoadError') return null;
  const kind = (e as Error & { kind?: unknown }).kind;
  return (REPLAY_LOAD_KINDS as readonly unknown[]).includes(kind) ? kind as ReplayLoadKind : null;
}

/**
 * The sentence a recording of another map than the page shows is refused with (`./mount` `replayMapAddress`,
 * `../modern/replays/worldStage`'s `check`). MN-1 (OT.R113): the map is named by the one name table, never by its stem;
 * a stem off the table is "an unknown map".
 */
export function replayMapRefusal(stem: string): string {
  const row = mapRow(stem);
  return `This recording is of ${row ? `map ${row.title}` : 'an unknown map'}, which the page could not open.`;
}

/**
 * The line the page says while it reopens on a recording's map (`./mount`'s check, before `replayMapAddress`'s
 * navigation): MN-1's review F2, the refusal's sibling -- the map named, never its stem.
 */
export function replayMapOpening(stem: string): string {
  const row = mapRow(stem);
  return row ? `Opening the recording's map, ${row.title}.` : 'Opening the recording\'s map.';
}
