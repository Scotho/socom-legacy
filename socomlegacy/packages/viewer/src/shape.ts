import { readPreference, savePreference } from './startupSettings';
import type { VideoPicture } from './picture';
import { CEILING_DEVICE, renderCapForV2 } from './videoSettings';

/**
 * VIDEO-SHAPE phase A (player report Q-01; the owner's accepted model, 2026-11-21, "let's do 4:3 and 4:3 stretched";
 * product track, a BROWSER ADAPTATION with no original -- the console drew one 640 x 448 frame on a 4:3 television): the
 * shape of the front end's match canvas, independent of the picture (`./picture`, Modern / PS2, worded Sharpness):
 *
 * - `fill` (the default, what the match drew before): the world at the window's own size and shape;
 * - `4:3`: the PS2 picture's framing (the console's 4:3 box; its vertical extent is that picture's open question, `./matchMount` `fit`) -- the biggest 4:3 box that fits, black bars at the sides (above and below on a window
 *   narrower than 4:3), drawn with the original's projection (`./matchMount` `fit`);
 * - `4:3-stretched`: the same 4:3 picture -- the same projection and drawing buffer -- stretched by the browser over the
 *   whole window, as a 4:3 console on a widescreen television. It shows no more of the world, only a wider picture.
 *
 * Under PS2 the shape is 4:3 whatever is saved (`effectiveShape`): the PS2 frame's own box. Nothing the game simulates
 * changes; the HUD keeps its 640 x 448 frame in the drawing buffer's pixels.
 */
export const SHAPE_ADAPTATION = 'VIDEO-SHAPE: the match canvas\'s shape -- fill, 4:3, 4:3 stretched; a browser adaptation, no original' as const;
/** The page key of the shape (a browser adaptation). Absent (or unknown) reads `fill`; a read never writes it (WM.R20). */
export const SHAPE_KEY = 's2u.viewer.shape';
export const VIDEO_SHAPES = ['fill', '4:3', '4:3-stretched'] as const;
export type VideoShape = typeof VIDEO_SHAPES[number];
export const VIDEO_SHAPE_DEFAULT: VideoShape = 'fill';
/** The match canvas's 4:3 box under the Modern picture (`styles.css`, the PS2 box's own rule): real width and height. */
export const SHAPE_43_CLASS = 's2u-shape-43';
/** The aspect of the original's television frame. */
const FOUR_THREE = 4 / 3;

const isShape = (v: unknown): v is VideoShape => typeof v === 'string' && (VIDEO_SHAPES as readonly string[]).includes(v);

/** A stored shape; anything else, or nothing, reads `fill`. */
export function parseShape(raw: string | null): VideoShape { return isShape(raw) ? raw : VIDEO_SHAPE_DEFAULT; }

/** The shape drawn: PS2 pixels draws the 4:3 frame (the PS2 box), else the saved shape. */
export function effectiveShape(shape: VideoShape, picture: VideoPicture): VideoShape { return picture === 'ps2' ? '4:3' : shape; }

export interface Size { width: number; height: number }

/** The biggest 4:3 that fits an area (a window narrower than 4:3 is limited by its width). */
const fourThreeFit = (a: Size): Size => ({ width: Math.min(a.width, a.height * FOUR_THREE), height: Math.min(a.height, a.width / FOUR_THREE) });

/**
 * The canvas's box on the page and its drawing buffer, CSS px, for a shape over an area: fill, both the area; 4:3, both
 * the 4:3 fit; 4:3 stretched, the box the area and the buffer the 4:3 fit (the browser stretches it).
 */
export function shapeBox(shape: VideoShape, area: Size): { box: Size; buffer: Size } {
  if (shape === 'fill') return { box: { ...area }, buffer: { ...area } };
  const fit = fourThreeFit(area);
  return shape === '4:3' ? { box: fit, buffer: { ...fit } } : { box: { ...area }, buffer: fit };
}

/**
 * The ceiling row's words with the size drawn (VIDEO-SETTINGS.md, "How 4:3 fits the resolution rows"): the shape's buffer
 * at the ratio the match gives it at 100 % (`./videoSettings` `renderCapForV2`, as `./matchMount` `fit` hands it: under a
 * height ceiling at most ratio 1 and at most the ceiling tall; Native the device's ratio, at most 2 on a desktop and 1.5 on
 * a touch device), rounded -- e.g. "1440p (1920 x 1440)". The batch review's F1: it was the full device ratio, which the
 * match never draws. Resolution scale is its own row and is not applied here.
 */
export function ceilingWords(ceiling: number, shape: VideoShape, area: Size, devicePixelRatio: number | undefined, touch = false): string {
  const { buffer } = shapeBox(shape, area);
  const ratio = renderCapForV2(100, ceiling as Parameters<typeof renderCapForV2>[1], devicePixelRatio, touch, buffer.width, buffer.height).ratioCap;
  const word = ceiling > 0 ? `${ceiling}p` : ceiling === CEILING_DEVICE ? 'Device' : 'Native';   // BUG-I5: Device, the full ratio
  return `${word} (${Math.round(buffer.width * ratio)} x ${Math.round(buffer.height * ratio)})`;
}

/**
 * The shape, kept by this browser: read once; `set` a change (stored, told); `choose` a press (stored even when it is the
 * shape shown, told on a change); `clear` a reset (the key emptied, `fill` read again, never written); `adopt` a stored
 * value taken without writing. As `./picture` `pictureKeeper`, with no class default.
 */
export function shapeKeeper(read: (key: string) => string | null = readPreference, write: (key: string, value: string) => void = savePreference) {
  let shape = parseShape(read(SHAPE_KEY));
  const heard = new Set<(s: VideoShape) => void>();
  const tell = (s: VideoShape): void => { if (s === shape) return; shape = s; for (const f of [...heard]) f(s); };
  return {
    get: (): VideoShape => shape,
    set(s: VideoShape): void { if (!isShape(s) || s === shape) return; write(SHAPE_KEY, s); tell(s); },
    choose(s: VideoShape): void { if (!isShape(s)) return; write(SHAPE_KEY, s); tell(s); },
    clear(): void { write(SHAPE_KEY, ''); tell(VIDEO_SHAPE_DEFAULT); },
    adopt(stored: string | null): void { tell(parseShape(stored)); },
    observe(f: (s: VideoShape) => void): () => void { heard.add(f); return () => { heard.delete(f); }; },
  };
}
export type ShapeKeeper = Omit<ReturnType<typeof shapeKeeper>, 'adopt'>;

let shared: ShapeKeeper | null = null;
let sharedRaw: string | null = null;
/**
 * The page's one shape keeper -- Home's Options > Display "Shape" row (`./console/adapters/options`) and the front end's
 * match (`./matchMount`, through `./frontEnd`) -- so a choice is heard by a running match. A change by another writer of
 * the key (a second tab) is taken at the next `get`, without writing it back, as `./picture` `pagePicture` does.
 */
export function pageShape(): ShapeKeeper {
  if (shared) return shared;
  const k = shapeKeeper();
  sharedRaw = readPreference(SHAPE_KEY);
  const sync = (): void => { sharedRaw = readPreference(SHAPE_KEY); };
  shared = {
    get(): VideoShape {
      const raw = readPreference(SHAPE_KEY);
      if (raw !== sharedRaw) { sharedRaw = raw; k.adopt(raw); }
      return k.get();
    },
    set(s: VideoShape): void { shared!.get(); k.set(s); sync(); },
    choose(s: VideoShape): void { shared!.get(); k.choose(s); sync(); },
    clear(): void { shared!.get(); k.clear(); sync(); },
    observe: k.observe,
  };
  return shared;
}
