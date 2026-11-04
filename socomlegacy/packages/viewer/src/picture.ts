import { VIDEO_PICTURE_DEFAULT, VIDEO_PICTURE_HD_OFFERED, VIDEO_PICTURES, type VideoPicture } from '@s2u/ui';
import { EXPERIMENTAL_DEFAULTS, type ExperimentalSettings } from './experimentalGraphics';
import { readPreference, savePreference } from './startupSettings';

/**
 * OT.R79 (LATER 378, a browser adaptation): the front end's picture -- VIDEO MODE's MODERN / PS2 / EXPERIMENTAL
 * (`@s2u/ui` `./screens/videoPicture`) -- kept by this browser beside the test room's look (`s2u.viewer.look`, its own:
 * the two become one truth with LATER 379), and drawn by the front end's match (`./matchMount` `MatchPicture`):
 *
 * - MODERN (the default -- the owner: "video mode default is modern"): the world at the canvas's own size over the whole
 *   window, the test room's Modern -- what the front end's match drew before OT.R79;
 * - PS2: the test room's PS2 -- the 640 x 448 frame (`Renderer.setPresentation('ps2')`, the HUD's), its projection from the
 *   map's own half-angles, letterboxed on a 4:3 box (the match's canvas's `s2u-picture-ps2` class, `styles.css`);
 * - EXPERIMENTAL, captioned "HD (GoE Soul)" since HD.R8 (the owner, 2026-10-31; OT.R92): Modern with the test room's
 *   experimental renderer at the owner's defaults (`EXPERIMENTAL_DEFAULTS`, enabled) with Colour adjustment (`grade`),
 *   Adjust existing map detail (`detailAdjust`), FXAA and Map texture mip bias (`textureBias`) off and the HD texture pack on (`./hdTexturePackServed`) -- in every
 *   match, not only the test room (`pictureExperimentalSettings`); the test room's panel stays the test room's.
 *
 * The detail pass is on under all three (PF-30: the original's own; `./startupSettings` `resolveVisuals`). The menus'
 * 640 x 448 frame is the same under all three (the merge controller's call): the choice is the world's.
 */
export const PICTURE_KEY = 's2u.viewer.picture';
/** The front end's match canvas's class (it has no id): SCREEN POSITION's offset and the PS2 picture's box find it by this. */
export const MATCH_CANVAS_CLASS = 's2u-match';
/** The PS2 picture's 4:3 letterbox on the match's canvas alone (`styles.css`): never the body's class, so no exit leaves it. */
export const PICTURE_PS2_CLASS = 's2u-picture-ps2';
/** The picture's type and default, for the front end's match (`./matchMount`), which imports nothing of `@s2u/ui` (PAR-17). */
export { VIDEO_PICTURE_DEFAULT, type VideoPicture };

/**
 * HD.R8: what the front end's match hands the renderer for `picture` -- the experimental renderer off under MODERN and
 * PS2 (exactly as before), and under HD (GoE Soul) the owner's defaults (2026-10-08/11, his choice for this picture,
 * 2026-10-31) with his "please turn off colour adjustment and existing map detail while this is on" and the pack on;
 * FXAA and Map texture mip bias off too (the owner, 2026-11-01: "turn fxaa off in experimental and ground bias").
 */
export function pictureExperimentalSettings(picture: VideoPicture): ExperimentalSettings {
  return picture === 'experimental'
    ? { ...EXPERIMENTAL_DEFAULTS, enabled: true, grade: false, detailAdjust: false, fxaa: false, textureBias: false, hdPack: true }
    : { ...EXPERIMENTAL_DEFAULTS, enabled: false };
}

export function parsePicture(raw: string | null): VideoPicture {
  if (raw === 'experimental' && !VIDEO_PICTURE_HD_OFFERED) return VIDEO_PICTURE_DEFAULT;   // HD-HOLD: a stored HD reads as MODERN
  return (VIDEO_PICTURES as readonly string[]).includes(raw ?? '') ? raw as VideoPicture : VIDEO_PICTURE_DEFAULT;
}

/** The page's picture: read once, set by VIDEO's strip (stored), heard by the match while it runs. */
export function pictureKeeper(read: (key: string) => string | null = readPreference, write: (key: string, value: string) => void = savePreference) {
  let picture = parsePicture(read(PICTURE_KEY));
  const heard = new Set<(p: VideoPicture) => void>();
  return {
    get: (): VideoPicture => picture,
    set(p: VideoPicture): void {
      if (p === 'experimental' && !VIDEO_PICTURE_HD_OFFERED) return;                       // HD-HOLD: never turned on
      if (p === picture) return;
      picture = p;
      write(PICTURE_KEY, p);
      for (const f of [...heard]) f(p);
    },
    /** Called at each change; the returned function stops it. */
    observe(f: (p: VideoPicture) => void): () => void { heard.add(f); return () => { heard.delete(f); }; },
  };
}
export type PictureKeeper = ReturnType<typeof pictureKeeper>;

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
      if (raw !== sharedRaw) { sharedRaw = raw; k.set(parsePicture(raw)); }
      return k.get();
    },
    set(p: VideoPicture): void { shared!.get(); k.set(p); sharedRaw = readPreference(PICTURE_KEY); },
    observe: k.observe,
  };
  return shared;
}
