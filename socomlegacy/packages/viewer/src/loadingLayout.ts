import { locTable } from '@s2u/scene';
import { spinScale } from '@s2u/ui/loading';
import { armoryQuads, armoryTree, placeOf, type ArmoryQuad } from './armoryLayout';
import type { LoadingScreen } from './loadingAssets';
import type { UiNode } from './uiScript';

/**
 * The loading screen drawn (INT-LOADING, an interim ahead of ONL-18; socomlegacy/docs/research/125): `dlgLoad.rdr`'s
 * objects on the game's 640x448 frame, placed and coloured by the layout's own records through the dialogs' drawing
 * rules (`./armoryLayout` `armoryQuads`: the tree order, the CHILDOF chain, an IMAGE's `UIVAR` texture, a TEXT's face,
 * scale, colour, `HCENTERED` and the face's opacity), with the disc's scale from `SpinLoadingCD`'s own keys
 * (`@s2u/ui` `spinScale`). Pure: the screen, the bitmaps' sizes and the time since the screen started in; quads out.
 *
 * What it draws, from the records (research 125 §1, §4): the background `LittleBlack.tif` over the frame; the map's
 * picture (`LoadingPicture`, `UIVAR load_picture`) over 580x210 at (30, 120); the map's name (`title`, `UIVAR
 * mission_title`) in (14, 57, 65) at scale 1.2 with its pen at (30, 120); `ReturnToLobby` (`_2000_ToReturn_MSG`, `UILd`)
 * centred on (320, 420) -- `OnMenuStart` keeps it on a network game, as the browser's always is (the capture
 * `A_ready012.png` shows it); the disc (`load_CD_spinning`, 30x30 at (-15, -15) under `load_CD_Parent` at (590, 360)).
 * What it does not: `description` and `RateLevel` are blank (`" "` on 21 MP maps, empty on MP64: research 125
 * R125.6; `OnMenuStart` writes `" "` to `RateLevel` on a network game), and the progress bar's `load_back.tif` /
 * `load_line.tif` are on no bank of the disc.
 * The fader is the panel's (`./loadingPanel`, `LOADING_FADE_READING`); the page's own taps, the TRIANGLE binding, the
 * 0.5 s hold after the load and `ON_LOAD_COMPLETE` are ONL-18's (research 125 §5).
 */

/**
 * CHILD_SCALE_READING (research 125 §3): a node's scale -- the matrix diagonal `OBJECT_MOTION_FROM_TO` writes
 * (`FUN_00315710` D:L215015) -- carries its children: a child's offset and size scale with it, about the node's own
 * place. So `SpinLoadingCD`, which scales only `load_CD_Parent`, turns the 30x30 disc hung at (-15, -15) under it about
 * its centre (590, 360): 1.1 -> (0, 1) -> 1.1 in x, a coin turning on its upright axis. The 2D draw's matrix composition
 * was not traced; the layout's own centring of the disc on its parent, and the narrow disc of the capture
 * `logs/parity/s4_pcsx2/A_ready012.png` at x 590, agree with it.
 */
export const CHILD_SCALE_READING = 'about the parent\'s place' as const;

export interface LoadingFrameInput {
  screen: Pick<LoadingScreen, 'layout' | 'binding' | 'spin' | 'fonts' | 'strings'>;
  /** The bitmaps' sizes by lower-case name. */
  sizes: Readonly<Record<string, { width: number; height: number }>>;
  /** Seconds since the screen started (`ONSTART`: `SpinLoadingCD` begins). */
  t: number;
}

/** The loading screen's quads on the 640x448 frame, in draw order; none without a layout. */
export function loadingQuads(f: LoadingFrameInput): ArmoryQuad[] {
  const { layout, binding, spin, fonts, strings } = f.screen;
  if (!layout) return [];
  const tree = armoryTree(layout);
  const spun = spin ? tree.byName.get(spin.node.toLowerCase()) : undefined;
  const scale = spin ? spinScale(spin, f.t) : null;
  const nodes = new Map<string, UiNode>();
  if (spun && scale) {
    nodes.set(spun.name.toLowerCase(), {
      name: spun.name, x: spun.x, y: spun.y, visible: true, opacity: spun.opacity, caption: null, scale: [...scale], rotation: [0, 0, 0, 1],
    });
  }
  const quads = armoryQuads({
    layout, sizes: f.sizes, fonts, loc: locTable(strings),
    node: (name) => nodes.get(name.toLowerCase()),
    uivar: (name) => binding?.vars.get(name) ?? null,
  });
  if (!spun || !scale) return quads;
  // CHILD_SCALE_READING: every quad of a node under the spun one, scaled about the spun node's frame place.
  const origin = placeOf(spun, tree, (name) => nodes.get(name.toLowerCase()));
  const under = (object: string): boolean => {
    let at = tree.parent.get(object.toLowerCase());
    for (let guard = 0; at && guard < 16; guard++, at = tree.parent.get(at.name.toLowerCase())) if (at === spun) return true;
    return false;
  };
  const out: ArmoryQuad[] = [];
  for (const q of quads) {
    if (!under(q.object)) { out.push(q); continue; }
    const w = q.w * scale[0], h = q.h * scale[1];
    if (w <= 0 || h <= 0) continue;                         // edge-on: nothing to draw
    out.push({ ...q, x: origin.x + (q.x - origin.x) * scale[0], y: origin.y + (q.y - origin.y) * scale[1], w, h });
  }
  return out;
}
