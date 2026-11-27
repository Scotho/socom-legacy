import { VIDEO_PICTURE_DEFAULT, VIDEO_PICTURES, type VideoPicture } from '@s2u/ui';
import { CLASS_PICTURE_ADAPTATION } from './autoQuality';
import { pageDeviceClass, type DeviceClass } from './deviceClass';
import { EXPERIMENTAL_DEFAULTS, type ExperimentalSettings } from './experimentalGraphics';
import { GRAPHICS_BACKEND_KEY } from './graphicsBackend';
import { readPreference, savePreference } from './startupSettings';
import { litePictureLaid, VIDEO_SETTINGS_KEY_V2, videoSettingsKeeperV2, type VideoSettingsV2 } from './videoSettings';

/**
 * OT.R79 (LATER 378, a browser adaptation): the front end's picture -- VIDEO MODE's MODERN / PS2
 * (`@s2u/ui` `./screens/videoPicture`) -- kept by this browser beside the test room's look (`s2u.viewer.look`, its own:
 * the two become one truth with LATER 379), and drawn by the front end's match (`./matchMount` `MatchPicture`):
 *
 * - MODERN (the default -- the owner: "video mode default is modern"): the world at the canvas's own size over the whole
 *   window, the test room's Modern -- what the front end's match drew before OT.R79;
 * - PS2: the test room's PS2 -- the 640 x 448 frame (`Renderer.setPresentation('ps2')`, the HUD's), its projection from the
 *   map's own half-angles, letterboxed on a 4:3 box (the match's canvas's `s2u-picture-ps2` class, `styles.css`) -- since
 *   WM-5a the default where none is saved on the Xbox class (`pictureDefault`, below), and since WM-R20-FOLDS item 2
 *   the default while the Lite preset (or a Custom made from it) is chosen -- laid, never written (`./videoSettings`);
 *
 * The third, EXPERIMENTAL -- captioned "HD (GoE SouL)" by HD.R8 (OT.R92) and held by HD-HOLD -- is removed by B206 ML-6
 * (plan 2026-11-06-mods-loader, ML.R11, R12; OT.R110): the HD pack is a texture pack chosen in Home > Experiments > Mods,
 * applied under either picture (`./packs/pagePacks`), and a stored `experimental` reads MODERN.
 *
 * The detail pass is on under both (PF-30: the original's own; `./startupSettings` `resolveVisuals`). The menus'
 * 640 x 448 frame is the same under both (the merge controller's call): the choice is the world's.
 */
export const PICTURE_KEY = 's2u.viewer.picture';
/**
 * Browser adaptation, no original: the user's 2026-11-14 PS2 graphics shortcut. One explicit choice keeps these
 * existing video rows together; the picture itself still selects the renderer's fixed 640 x 448 frame. Other rows
 * and the default picture are unchanged. Graphics and antialias retain their existing next-match application.
 */
export const PS2_GRAPHICS_PROFILE_ADAPTATION = { preset: 'custom', frameCap: 30, graphics: 'webgl2', shadows: 'off', antialias: false } as const;

/**
 * XBOX-INTEGRATE (the main controller's ruling, 2026-11-20, on #810's shortcut; a browser adaptation): the shortcut is the
 * Xbox class's only -- on any other device a PS2 press is the picture alone, and no frame cap, renderer, shadows or
 * anti-aliasing row is written. On the Xbox class the press first keeps the player's own rows under this key (once, until
 * they are given back), and leaving PS2 (Modern pressed, or the picture reset to a default that is not PS2) writes them
 * back and empties the key -- whatever the class is by then.
 */
export const PS2_PROFILE_PRIOR_KEY = 's2u.viewer.ps2ProfilePrior';
type Ps2ProfileRows = Pick<VideoSettingsV2, keyof typeof PS2_GRAPHICS_PROFILE_ADAPTATION>;
let profileClass: () => DeviceClass = pageDeviceClass;
/** Tests only: the class the PS2 shortcut reads (null: the page's). */
export function setPs2ProfileClassForTest(f: (() => DeviceClass) | null): void { profileClass = f ?? pageDeviceClass; }
/** Whether a PS2 press applies the shortcut here (the Xbox class): Home's Video row says so only then. */
export function ps2ProfileApplies(): boolean { return profileClass() === 'xbox'; }

/** The PS2 shortcut at an explicit picture press (`pagePicture`'s `set` / `choose` / `clear`). */
function applyPs2Profile(p: VideoPicture): void {
  const video = videoSettingsKeeperV2();
  const prior = readPreference(PS2_PROFILE_PRIOR_KEY);
  if (p === 'ps2') {
    if (!ps2ProfileApplies()) return;
    // XBOX-INTEGRATE's gate: the Xbox pick (the graphics backend saved as 'xbox') is already WebGL2 and is what makes the
    // page the Xbox class (and its lightweight opt-in); the shortcut neither writes nor keeps the graphics row over it.
    const pick = readPreference(GRAPHICS_BACKEND_KEY) === 'xbox';
    if (!prior) {
      const v = video.get();
      const keep: Partial<Ps2ProfileRows> = { preset: v.preset, frameCap: v.frameCap, shadows: v.shadows, antialias: v.antialias };
      if (!pick) keep.graphics = v.graphics;
      savePreference(PS2_PROFILE_PRIOR_KEY, JSON.stringify(keep));
    }
    // One v2 commit keeps all graphics observers on the complete profile.
    if (!pick) { video.set(PS2_GRAPHICS_PROFILE_ADAPTATION); return; }
    const { graphics: _kept, ...rows } = PS2_GRAPHICS_PROFILE_ADAPTATION;
    video.set(rows);
    // The gate-fix review's F1: from Automatic the rows read the pick's own WebGL2, and the Custom the press makes carries it
    // into the renderer's key over the pick; the pick is put back (it draws that same WebGL2, `./deviceClass` `classGraphics`).
    if (readPreference(GRAPHICS_BACKEND_KEY) !== 'xbox') savePreference(GRAPHICS_BACKEND_KEY, 'xbox');
    return;
  }
  if (!prior) return;
  savePreference(PS2_PROFILE_PRIOR_KEY, '');
  let keep: Partial<VideoSettingsV2>;
  try { keep = JSON.parse(prior) as Partial<VideoSettingsV2>; } catch { return; }   // an unreadable keep: the rows stay as they are
  // The review's F2: a pick saved since the press is not written over by a renderer kept before it.
  if (readPreference(GRAPHICS_BACKEND_KEY) === 'xbox') delete keep.graphics;
  video.set(keep);
}
/** The front end's match canvas's class (it has no id): SCREEN POSITION's offset and the PS2 picture's box find it by this. */
export const MATCH_CANVAS_CLASS = 's2u-match';
/** The PS2 picture's 4:3 letterbox on the match's canvas alone (`styles.css`): never the body's class, so no exit leaves it. */
export const PICTURE_PS2_CLASS = 's2u-picture-ps2';
/** The picture's type and default, for the front end's match (`./matchMount`), which imports nothing of `@s2u/ui` (PAR-17). */
export { VIDEO_PICTURE_DEFAULT, type VideoPicture };

/**
 * What the front end's match hands the renderer under either picture: the experimental renderer off, exactly as before
 * (the OFF pins). B206 ML-6 (ML.R11) removed HD.R8's `pictureExperimentalSettings`, whose HD (GoE SouL) branch was the
 * only one that turned it on; the HD pack rides with no renderer settings (`hdPack` here stays false: the match's pack
 * is the MODS choice's, `./packs/pagePacks`).
 */
export const MATCH_EXPERIMENTAL_OFF: ExperimentalSettings = { ...EXPERIMENTAL_DEFAULTS, enabled: false };

/** A stored picture; anything else -- a stored `experimental` (the HD picture ML-6 removed), `480p`, nothing -- reads MODERN. */
export function parsePicture(raw: string | null): VideoPicture {
  return (VIDEO_PICTURES as readonly string[]).includes(raw ?? '') ? raw as VideoPicture : VIDEO_PICTURE_DEFAULT;
}

/**
 * WM-5a (a browser adaptation, no original): the Lite preset's picture (`./videoSettings` `PRESET_VALUES.lite`) -- its
 * 640 x 448 frame is the cheapest the port draws. WM-R20-FOLDS item 2 (the controller's ruling, seat 8f, over ruling B:
 * passing through Lite is not a choice of picture): drawn where the player has saved none while Lite, or a Custom made
 * from it, is the preset (`pictureDefault`); never written, so another named preset brings the class's default back.
 */
export const LITE_PICTURE_ADAPTATION: VideoPicture = 'ps2';

/** Whether a picture is saved: any stored value is the player's (a removed one reads MODERN), only no value is none. */
export const pictureSaved = (raw: string | null): boolean => raw !== null && raw !== '';

/**
 * WM-5a (the weekend mega sprint; a browser adaptation, no original -- the evidence at `./autoQuality`
 * `CLASS_PICTURE_ADAPTATION`): the picture drawn where the player has saved none -- Lite's PS2 while the stored preset is
 * Lite or a Custom made from it (WM-R20-FOLDS item 2, `./videoSettings` `litePictureLaid`), else the device class's start
 * (the Xbox class's PS2, every other's MODERN, `VIDEO_PICTURE_DEFAULT`). It is never written: a saved picture (VIDEO
 * MODE's strip, Home's "Video" row, the test room's look) is the player's and always wins.
 */
export function pictureDefault(cls: () => DeviceClass = pageDeviceClass, read: (key: string) => string | null = readPreference): VideoPicture {
  if (litePictureLaid(read(VIDEO_SETTINGS_KEY_V2))) return LITE_PICTURE_ADAPTATION;
  return CLASS_PICTURE_ADAPTATION[cls()] ?? VIDEO_PICTURE_DEFAULT;
}

/**
 * The page's picture: read once, set by VIDEO's strip (stored), heard by the match while it runs. WM-5a: with none saved,
 * `pictureDefault` at the first read (not at the keeper's making: the class's renderer probe waits for a reader, VS-12),
 * never written; `adopt` takes a stored change or the default again without writing (the page's keeper's, below).
 * `set` is a change (the native VIDEO strip's echo of its own selection writes nothing); `choose` is a press, saved even
 * when it is the picture shown by default (the controller's ruling C); `clear` empties the key and reads the default
 * again (ruling D: a reset never writes the default into the key).
 */
export function pictureKeeper(read: (key: string) => string | null = readPreference, write: (key: string, value: string) => void = savePreference, cls: () => DeviceClass = pageDeviceClass) {
  const raw = read(PICTURE_KEY);
  let picture: VideoPicture | null = pictureSaved(raw) ? parsePicture(raw) : null;      // null: none saved, the default at the first read
  const heard = new Set<(p: VideoPicture) => void>();
  const now = (): VideoPicture => (picture ??= pictureDefault(cls, read));
  return {
    get: now,
    set(p: VideoPicture): void {
      if (!(VIDEO_PICTURES as readonly string[]).includes(p)) return;                     // ML-6: a removed picture is never taken
      if (p === now()) return;
      picture = p;
      write(PICTURE_KEY, p);
      for (const f of [...heard]) f(p);
    },
    /** A press (ruling C): the picture saved even when it is the one shown; told to the observers only on a change. */
    choose(p: VideoPicture): void {
      if (!(VIDEO_PICTURES as readonly string[]).includes(p)) return;
      if (p !== now()) { this.set(p); return; }
      write(PICTURE_KEY, p);
    },
    /** A reset (ruling D): the saved picture emptied and the default read again, told on a change; the default never written. */
    clear(): void {
      write(PICTURE_KEY, '');
      const p = pictureDefault(cls, read);
      if (p === now()) return;
      picture = p;
      for (const f of [...heard]) f(p);
    },
    /** A stored raw value taken (none saved: the default, afresh), told to the observers on a change; nothing written. */
    adopt(stored: string | null): void {
      const p = pictureSaved(stored) ? parsePicture(stored) : pictureDefault(cls, read);
      if (p === now()) return;
      picture = p;
      for (const f of [...heard]) f(p);
    },
    /** Called at each change; the returned function stops it. */
    observe(f: (p: VideoPicture) => void): () => void { heard.add(f); return () => { heard.delete(f); }; },
  };
}
export type PictureKeeper = Omit<ReturnType<typeof pictureKeeper>, 'adopt'>;

let shared: PictureKeeper | null = null;
let sharedRaw: string | null = null;
/**
 * HD-4 (the owner, 2026-11-01: "make sure home gets the video too"; OT.R79, HD.R8, a browser adaptation): the page's one
 * picture keeper -- the front end's (VIDEO MODE's strip, and the match it hands it to, `./matchMount`) and Home's
 * Options > Display "Video" row (`./console/adapters/options`) -- so a choice in either is heard by the other and by a
 * running match. A change by another writer of the stored key (a second tab, a test's storage) is not heard as it
 * happens: this tab takes it at its next `get` -- the next VIDEO build, Home's row drawn, a match mounted -- and only
 * then tells its observers, so a match already running here keeps its picture until something reads it. `set` is the
 * keeper's.
 */
export function pagePicture(): PictureKeeper {
  if (shared) return shared;
  const k = pictureKeeper();
  sharedRaw = readPreference(PICTURE_KEY);
  shared = {
    get(): VideoPicture {
      const raw = readPreference(PICTURE_KEY);
      // WM-5a: a stored change is taken without writing it back, and with none saved the default is read afresh (the Lite
      // preset chosen or left since, an Xbox pick saved or cleared), never written.
      if (raw !== sharedRaw || !pictureSaved(raw)) { sharedRaw = raw; k.adopt(raw); }
      return k.get();
    },
    // XBOX-INTEGRATE (#810's PS2 shortcut, gated by the main controller's ruling, 2026-11-20): an explicit press applies it
    // on the Xbox class only, and leaving PS2 gives back the player's own rows (`applyPs2Profile`).
    set(p: VideoPicture): void { shared!.get(); applyPs2Profile(p); k.set(p); sharedRaw = readPreference(PICTURE_KEY); },
    choose(p: VideoPicture): void { shared!.get(); applyPs2Profile(p); k.choose(p); sharedRaw = readPreference(PICTURE_KEY); },
    // XBOX-INTEGRATE's gate (options.test WM-5a D): a reset is never a PS2 press -- on the Xbox class its default is PS2,
    // and applying the shortcut there wrote over the pick -- so it only gives the rows back when the default is not PS2.
    clear(): void { shared!.get(); k.clear(); const p = k.get(); if (p !== 'ps2') applyPs2Profile(p); sharedRaw = readPreference(PICTURE_KEY); },
    observe: k.observe,
  };
  return shared;
}
