import type { Settings } from '@s2u/card';
import { pageSettings } from './pageStore';

/**
 * HUD-ALIVE C (OT.R117; product track, **a browser adaptation** with no original): the port's range readout -- the range
 * finder's metres (`./hud` `RangeFinder`) as `"<n>m"` in the info box's spot at (587, 433) -- kept as a setting in this
 * browser, off by default. The original draws the connected consoles' count there (`./hud` `infoNumberText`, research 87
 * §1.12), so off is the original's look. On, the range takes that spot in the count's place: only one number fits there
 * (the scope's suggested default; a second spot for both would be the owner's call). The scope's and binoculars'
 * `RANGE(m)` line is the original's and is drawn either way. The owner, Craig, 2026-11-09, in the main controller's seat
 * 99, verbatim: "1. is the icon above the health bar at bottom right, make the [meters] a setting soption and turn it OFF by default by the name."
 * Read once at a match's mount, as Name tags is (`./nameTags`).
 */
export const RANGE_READOUT_ADAPTATION = "the range finder in the info box's spot, in the count's place, when on" as const;

export const RANGE_READOUT_KEY = 's2u.viewer.rangeReadout';
export type RangeReadout = 'off' | 'on';
/** The values in the launcher row's order (Display > This browser > Range readout). */
export const RANGE_READOUT_VALUES: readonly RangeReadout[] = ['off', 'on'];
export const RANGE_READOUT_WORDS: Readonly<Record<RangeReadout, string>> = { off: 'Off', on: 'On' };
/** Unset: Off -- the owner's word ("turn it OFF by default"), and the original's look. A browser adaptation. */
export const RANGE_READOUT_DEFAULT_ADAPTATION: RangeReadout = 'off';

/** The value this browser keeps; unset or unknown, the default. */
export function readRangeReadout(settings: Settings = pageSettings): RangeReadout {
  const v = settings.get(RANGE_READOUT_KEY);
  return v === 'off' || v === 'on' ? v : RANGE_READOUT_DEFAULT_ADAPTATION;
}

export function saveRangeReadout(value: RangeReadout, settings: Settings = pageSettings): void {
  settings.set(RANGE_READOUT_KEY, value);
}
