import { pageDeviceClass, type DeviceClass } from './deviceClass';
import { readGraphicsBackend } from './graphicsBackend';
import { readPreference } from './startupSettings';

/**
 * LIGHTWEIGHT-MATCH's choice (a browser adaptation for the Xbox class, no original; `./xboxPrototype/matchLoader`): which
 * match engine a page on the Xbox class (or the saved Xbox pick) mounts. LW-DEFAULT made it three-state under this key:
 * '1' the lightweight match, '0' the standard engine (the player's own pick), and anything else -- absent, '' (a reset), an
 * unknown value -- the device class's default (`LIGHTWEIGHT_MATCH_DEFAULT_ADAPTATION`). Home's Options > Display "Match
 * engine" row writes it (`./console/adapters/options` `LIGHTWEIGHT_MATCH_ROW`), on the Xbox class only; the default is
 * never written into it. `?lightweightmatch=1` / `=0` (an instrument: the two engines compared on one device) wins over
 * the key. Read through the page's one storage door (`./pageStore`, by `./startupSettings` `readPreference`).
 * XBOX-INTEGRATE: one reader for the front end, the audio and the loader (#835 read the storage directly in each).
 * LW-DEFAULT (LATER 1277): one decision, `pageLightweightMatch`, for the front end's mount and the lean audio both.
 */
export const LIGHTWEIGHT_MATCH_KEY = 's2u.viewer.lightweightMatch';
/** The address flag (`./launchSettings/params`): 1 the lightweight match, 0 the standard engine; any other value is no flag. */
export const LIGHTWEIGHT_MATCH_FLAG = 'lightweightmatch';

/**
 * LW-DEFAULT (a browser adaptation, no original): the engine a class mounts with no saved choice and no flag -- the
 * lightweight match (true) or the standard engine (false). Off for every class: the owner has not decided the default.
 * Only the Xbox class (or the pick) can enter the lightweight match at all (`lightweightMatchEligible`), so only the xbox
 * entry can ever matter; turning the default on for the Xbox class is `xbox: true` here.
 */
export const LIGHTWEIGHT_MATCH_DEFAULT_ADAPTATION: Readonly<Record<DeviceClass, boolean>> = {
  xbox: false, software: false, touch: false, lowMemory: false, standard: false, high: false,
};

type Read = (key: string) => string | null;
type Defaults = Readonly<Record<DeviceClass, boolean>>;

/** A stored or flagged value: '1' the lightweight match, '0' the standard engine, anything else none (null). */
export function lightweightMatchValue(raw: string | null | undefined): boolean | null {
  return raw === '1' ? true : raw === '0' ? false : null;
}

/** The page's address flag: true, false, or null when absent. */
export function lightweightMatchFlag(search: string | undefined): boolean | null {
  try { return lightweightMatchValue(new URLSearchParams(search ?? '').get(LIGHTWEIGHT_MATCH_FLAG)); } catch { return null; }
}

/** Whether a page may mount the lightweight match: the Xbox class, or the saved Xbox pick (the mount's, the audio's and the row's one test). */
export function lightweightMatchEligible(deviceClass: DeviceClass, pick: boolean): boolean {
  return deviceClass === 'xbox' || pick;
}

/** What a decision reads. `deviceClass` may be a thunk: the page's class (its renderer probe) is read only when needed. */
export interface LightweightMatchInputs {
  /** The page's address query; absent, no flag. */
  search?: string;
  /** The page's storage door; absent, `readPreference`. */
  read?: Read;
  deviceClass: DeviceClass | (() => DeviceClass);
  /** The saved Xbox pick (`./graphicsBackend` 'xbox'). */
  pick: boolean;
  /** Tests only: a default table in place of `LIGHTWEIGHT_MATCH_DEFAULT_ADAPTATION`. */
  defaults?: Defaults;
}

function decide(i: LightweightMatchInputs, flag: boolean | null): boolean {
  try {
    const want = flag ?? lightweightMatchValue((i.read ?? readPreference)(LIGHTWEIGHT_MATCH_KEY));
    if (want === false) return false;
    const defaults = i.defaults ?? LIGHTWEIGHT_MATCH_DEFAULT_ADAPTATION;
    // The pick makes the page the Xbox class (`./deviceClass` `detectDeviceClass`); without it the class is read only now.
    if (want === null && !i.pick && !defaults.xbox) return false;
    const cls = i.pick ? 'xbox' : typeof i.deviceClass === 'function' ? i.deviceClass() : i.deviceClass;
    if (!lightweightMatchEligible(cls, i.pick)) return false;
    return want ?? defaults[cls];
  } catch { return false; }
}

/** The engine chosen: on the Xbox class or pick, the flag, else the saved choice, else the class's default; elsewhere never. */
export function lightweightMatchChosen(i: LightweightMatchInputs): boolean {
  return decide(i, lightweightMatchFlag(i.search));
}

/** The saved choice alone (the Options row's value): the key, else the class's default; the address flag is not read. */
export function lightweightMatchSavedChoice(i: Omit<LightweightMatchInputs, 'search'>): boolean {
  return decide(i, null);
}

/** The page's one decision -- the front end's mount and the lean audio (LATER 1277): its class, its pick, its storage door. */
export function pageLightweightMatch(search: string | undefined): boolean {
  let pick = false;
  try { pick = readGraphicsBackend() === 'xbox'; } catch { /* no pick */ }
  return lightweightMatchChosen({ search, deviceClass: pageDeviceClass, pick });
}
