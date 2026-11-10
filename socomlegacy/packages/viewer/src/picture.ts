import { VIDEO_PICTURE_DEFAULT, VIDEO_PICTURES, type VideoPicture } from '@s2u/ui';
import { EXPERIMENTAL_DEFAULTS, type ExperimentalSettings } from './experimentalGraphics';
import { readPreference, savePreference } from './startupSettings';

/**
 * OT.R79 (LATER 378, a browser adaptation): the front end's picture -- VIDEO MODE's MODERN / PS2
 * (`@s2u/ui` `./screens/videoPicture`) -- kept by this browser beside the test room's look (`s2u.viewer.look`, its own:
 * the two become one truth with LATER 379), and drawn by the front end's match (`./matchMount` `MatchPicture`):
 *
 * - MODERN (the default -- the owner: "video mode default is modern"): the world at the canvas's own size over the whole
 *   window, the test room's Modern -- what the front end's match drew before OT.R79;
 * - PS2: the test room's PS2 -- the 640 x 448 frame (`Renderer.setPresentation('ps2')`, the HUD's), its projection from the
 *   map's own half-angles, letterboxed on a 4:3 box (the match's canvas's `s2u-picture-ps2` class, `styles.css`);
 *
 * The third, EXPERIMENTAL -- captioned "HD (GoE Soul)" by HD.R8 (OT.R92) and held by HD-HOLD -- is removed by B206 ML-6
 * (plan 2026-11-06-mods-loader, ML.R11, R12; OT.R110): the HD pack is a texture pack chosen in Home > Experiments > Mods,
 * applied under either picture (`./packs/pagePacks`), and a stored `experimental` reads MODERN.
 *
 * The detail pass is on under both (PF-30: the original's own; `./startupSettings` `resolveVisuals`). The menus'
 * 640 x 448 frame is the same under both (the merge controller's call): the choice is the world's.
 */
export const PICTURE_KEY = 's2u.viewer.picture';
/** The front end's match canvas's class (it has no id): SCREEN POSITION's offset and the PS2 picture's box find it by this. */
export const MATCH_CANVAS_CLASS = 's2u-match';
/** The PS2 picture's 4:3 letterbox on the match's canvas alone (`styles.css`): never the body's class, so no exit leaves it. */
export const PICTURE_PS2_CLASS = 's2u-picture-ps2';
/** The picture's type and default, for the front end's match (`./matchMount`), which imports nothing of `@s2u/ui` (PAR-17). */
export { VIDEO_PICTURE_DEFAULT, type VideoPicture };

/**
 * What the front end's match hands the renderer under either picture: the experimental renderer off, exactly as before
 * (the OFF pins). B206 ML-6 (ML.R11) removed HD.R8's `pictureExperimentalSettings`, whose HD (GoE Soul) branch was the
 * only one that turned it on; the HD pack rides with no renderer settings (`hdPack` here stays false: the match's pack
 * is the MODS choice's, `./packs/pagePacks`).
 */
export const MATCH_EXPERIMENTAL_OFF: ExperimentalSettings = { ...EXPERIMENTAL_DEFAULTS, enabled: false };

/** A stored picture; anything else -- a stored `experimental` (the HD picture ML-6 removed), `480p`, nothing -- reads MODERN. */
export function parsePicture(raw: string | null): VideoPicture {
  return (VIDEO_PICTURES as readonly string[]).includes(raw ?? '') ? raw as VideoPicture : VIDEO_PICTURE_DEFAULT;
}

/** The page's picture: read once, set by VIDEO's strip (stored), heard by the match while it runs. */
export function pictureKeeper(read: (key: string) => string | null = readPreference, write: (key: string, value: string) => void = savePreference) {
  let picture = parsePicture(read(PICTURE_KEY));
  const heard = new Set<(p: VideoPicture) => void>();
  return {
    get: (): VideoPicture => picture,
    set(p: VideoPicture): void {
      if (!(VIDEO_PICTURES as readonly string[]).includes(p)) return;                     // ML-6: a removed picture is never taken
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
