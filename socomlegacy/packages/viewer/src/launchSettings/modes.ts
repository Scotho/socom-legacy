import type { LaunchValues } from './address';

/**
 * The test room's mode cards (LAUNCH_SETTINGS_ADAPTATION). Each card writes fields the parameter table already has
 * (`./params`); it adds no key. The address is still `./address` `testRoomAddress` of the fields that result, so a
 * card and the old sheet agree for the same choices. A card clears the fields that would contradict it (a replay url
 * left set is the replay, `server=` beats Online) and leaves every other field (map, picture, kit, lag) as it was.
 */

export type LaunchModeId = 'play' | 'online-local' | 'sandbox' | 'replay';

export interface LaunchMode {
  readonly id: LaunchModeId;
  readonly title: string;
  /** One line on the card. The switches themselves keep their own full descriptions. */
  readonly hint: string;
}

export const LAUNCH_MODES: readonly LaunchMode[] = [
  { id: 'play', title: 'Play', hint: 'On foot, the offline match.' },
  { id: 'online-local', title: 'Online (local)', hint: 'Play against this machine\'s server.' },
  { id: 'sandbox', title: 'Sandbox', hint: 'Dev mode and the fly camera.' },
  { id: 'replay', title: 'Replay', hint: 'Dev mode and the replay view.' },
];

const MODE_IDS = new Set<string>(LAUNCH_MODES.map((m) => m.id));

export function isLaunchMode(id: string): id is LaunchModeId {
  return MODE_IDS.has(id);
}

function without(values: LaunchValues, ...keys: string[]): Record<string, string> {
  const out: Record<string, string> = { ...values };
  for (const key of keys) delete out[key];
  return out;
}

/**
 * `values` after choosing `id`. Play and Online (local) are on foot (`mode=play`, no fly, no nomatch) with Online
 * `off` or `local`, and no `server=` / `mp` / replay. Sandbox is `devmode` and `fly` with `mode=play`. Replay is
 * `devmode` and `replayview`, keeping a replay url already typed.
 */
export function applyMode(id: LaunchModeId, values: LaunchValues): Record<string, string> {
  if (id === 'play') {
    return { ...without(values, 'fly', 'nomatch', 'mp', 'server', 'replay', 'replayview'), mode: 'play', online: 'off' };
  }
  if (id === 'online-local') {
    return { ...without(values, 'fly', 'nomatch', 'mp', 'server', 'replay', 'replayview'), mode: 'play', online: 'local' };
  }
  if (id === 'sandbox') {
    return { ...without(values, 'nomatch', 'replay', 'replayview'), devmode: '', mode: 'play', fly: '' };
  }
  return { ...without(values, 'fly'), devmode: '', replayview: '' };
}

const set = (values: LaunchValues, key: string): boolean => values[key] !== undefined;
const blank = (values: LaunchValues, key: string): boolean => values[key] === undefined || values[key] === '';

/**
 * The card that matches `values`, or null when none does. Replay wins when `replayview` is set or a replay url is
 * typed; else Sandbox when dev mode and fly are on for Play; else Online (local) or Play when the on-foot fields agree.
 */
export function activeMode(values: LaunchValues): LaunchModeId | null {
  if (set(values, 'replayview') || !blank(values, 'replay')) return 'replay';
  if (set(values, 'devmode') && set(values, 'fly') && values['mode'] === 'play') return 'sandbox';
  const onFoot = values['mode'] === 'play' && !set(values, 'fly') && !set(values, 'nomatch') && !set(values, 'mp') && blank(values, 'server');
  if (onFoot && values['online'] === 'local') return 'online-local';
  if (onFoot && (values['online'] === 'off' || values['online'] === undefined)) return 'play';
  return null;
}
