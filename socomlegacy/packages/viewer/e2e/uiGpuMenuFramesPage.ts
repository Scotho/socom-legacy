import type { Rgba } from '@s2u/gs';
import { buildDialogScreen, composeScreen, findNode, type BuildOptions, type DialogDesign, type UiDrawItem } from '@s2u/ui';
import type { FrontEndWindowHook } from '../src/frontEnd';
import { rasterizeUiDrawList, type UiTextures } from '../src/uiCompositorView';
import type { UiPresenter } from '../src/uiPresenter';
import type { MenuFrameLevels } from './uiGpuMenuFramesRecord';

/**
 * GM-31 leg 1 (the GPU menus plan, row GM-31; research 380 §1): the page half of `./uiGpuMenuFrames.spec.ts`, imported
 * into the front end's own page by the spec (a module script importing `/e2e/uiGpuMenuFramesPage.ts` from the run's Vite
 * server, as the harness page imports `./uiGpuHarness.ts`) once the deep-linked dialog is up. Product track, a test instrument: it draws, through the
 * page's own presenter, a frame the page itself would not show, reads it back, and changes nothing the game does --
 * the page's next tick draws its own frame again.
 *
 * **The frame is the Node scorer's** (`tools/test/menuCaptureFrames.ts` `drawDialog`, which the C rows' pins were taken
 * on): the dialog as built -- `buildDialogScreen` on the disc's design, MENUFADER at 0 (`menu_fade_up`'s end), no
 * script run, no tick, no movie picture (a fresh black layer: `BuildOptions.movie` absent, as in Node), no `MODELS`
 * (`BuildOptions.model` absent, as in Node), the hidden node's `visible` set false for `<dialog> hide <node>` -- composed
 * once. So it is the same frame whatever tick the page is at: no tick matching is needed, and none is done.
 * What is the page's: the design (`machine`'s own dialog lookup, the disc's READERC.ZAR design; the browser
 * adaptations that wrap the lookup touch only the game lobby and World of SOCOM), the caption faces and the caption
 * service (the machine's build options), the bitmaps (the session's own `UiTextures`; a name the session cannot
 * decode is "not in the libraries", as `drawDialog`'s `hasTexture` says of a name no library holds), and the presenter.
 *
 * `drawMenuCFrame` presents that list through the session's presenter at scale 1 (`FrontEndSession.render` with the
 * session's textures, the page's own call) -- on the GPU leg the front end's GPU surface (`UiGpuSurfacePresenter`),
 * on the software leg the 2D canvas's `CpuUiPresenter` -- and reads the frame back with `readFrame()` (GM-09's seam).
 * It also draws the same list with `rasterizeUiDrawList(items, textures)`, `drawDialog`'s own call, in the same task:
 * the reference the spec holds the software leg's frame to (0 bytes) and the GPU leg's in-page software frame to.
 */

export const UI_GPU_MENU_FRAMES_HOOK = '__uiGpuMenuFrames';

/** What one draw gives back to the spec. Frames are base64 of straight RGBA, top row first. */
export interface UiGpuMenuFrameDrawn {
  frame: string;
  /** The dialog the page's shell shows (the deep link's). */
  current: string | null;
  /** The presenter's `kind`: `gpu-surface` (the GPU leg), `cpu` (the software leg). */
  presenter: string;
  /** The path of the last present: `gpu` only for an L0 frame (the GPU surface's backend drew it), else `software`. */
  path: 'gpu' | 'software';
  why: string[];
  /** Presents until the frame's textures were up (GM-13's per-frame budget), at most 16. */
  presents: number;
  /** `window.__uiGpu.levels` just before and just after the last present (null: no read-out). */
  before: MenuFrameLevels | null;
  after: MenuFrameLevels | null;
  /** The front surface's blend at scale 1 as the switch resolves it (`window.__uiGpu.blend.front.sd`). */
  blend: string | null;
  /** The GPU surface's renderer string (`UiGpuCaps.renderer`, unmasked where given); null on the software leg. */
  renderer: string | null;
  width: number;
  height: number;
  /** What the presenter's frame and the reference's left undrawn (missing bitmaps). */
  undrawn: string[];
  referenceUndrawn: string[];
  /** Bytes of the shown frame differing from the reference (the length differing counts all). */
  differ: number;
  shown: string;
  reference: string;
}

export interface UiGpuMenuFrames {
  ready: true;
  draw(o: { frame: string; dialog: string; hide: string | null }): UiGpuMenuFrameDrawn;
}

const base64 = (d: Uint8Array | Uint8ClampedArray): string => {
  let s = '';
  for (let i = 0; i < d.length; i += 0x8000) s += String.fromCharCode(...d.subarray(i, i + 0x8000));
  return btoa(s);
};

interface SurfaceLike extends UiPresenter {
  lastPath?: 'gpu' | 'software' | null;
  stats?: { caps: { renderer: string | null } | null };
  /** `UiGpuSurfacePresenter`'s inner `GpuUiPresenter` (a private field, read by this instrument only). */
  gpu?: { last: { path: 'gpu' | 'software'; why: string[] } | null } | null;
}
interface UiGpuReadoutLike { levels?: MenuFrameLevels; blend?: { front?: { sd?: string } } }

/** The front end's dialog as `drawDialog` draws it, composed once (see the module's comment). */
/** The private fields this instrument reads, each checked by name (GM-31 review F2): a renamed field fails loudly. */
export interface MenuFramesPrivates {
  lookup: (name: string) => DialogDesign | null;
  face: NonNullable<BuildOptions['face']>;
  captions: BuildOptions['captions'];
  textures: UiTextures;
}

/**
 * The session's private fields the scorer's frame is built from -- `machine.o.dialog` and `machine.o.build`
 * (`FrontEndMachineOptions`; its `face` a function and its `captions` key present, null allowed: a disc without the
 * caption service), and `session.textures` -- each refused by its name when missing or of the wrong kind.
 */
export function menuFramesPrivates(session: unknown): MenuFramesPrivates {
  const s = session as { machine?: { o?: { dialog?: unknown; build?: unknown } }; textures?: unknown } | null;
  const o = s?.machine?.o;
  if (!o) throw Error('uiGpuMenuFrames: no session.machine.o (the FrontEndMachine options, a private field)');
  if (typeof o.dialog !== 'function') throw Error('uiGpuMenuFrames: no session.machine.o.dialog (FrontEndMachine options `dialog`, the dialog lookup)');
  const build = o.build as BuildOptions | undefined;
  if (!build || typeof build !== 'object') throw Error('uiGpuMenuFrames: no session.machine.o.build (FrontEndMachine options `build`)');
  if (typeof build.face !== 'function') throw Error('uiGpuMenuFrames: no session.machine.o.build.face (the caption faces)');
  if (!('captions' in build)) throw Error('uiGpuMenuFrames: no session.machine.o.build.captions (the caption service)');
  if (typeof s?.textures !== 'function') throw Error("uiGpuMenuFrames: no session.textures (the session's UiTextures, a private field)");
  return { lookup: o.dialog as MenuFramesPrivates['lookup'], face: build.face, captions: build.captions, textures: s.textures as UiTextures };
}

/** The front end's dialog as `drawDialog` draws it, composed once (see the module's comment). */
function scorerList(pv: MenuFramesPrivates, dialog: string, hide: string | null): UiDrawItem[] {
  const design = pv.lookup(dialog);
  if (!design) throw Error(`uiGpuMenuFrames: the disc has no dialog ${dialog}`);
  const textures = pv.textures;
  const screen = buildDialogScreen(design, { face: pv.face, captions: pv.captions, hasTexture: (n) => textures(n) !== null });
  screen.fader.opacity = 0;
  if (hide) {
    const node = findNode(screen.root, hide);
    if (!node) throw Error(`uiGpuMenuFrames: ${dialog} has no node ${hide}`);
    node.visible = false;
  }
  return composeScreen(screen);
}

function differing(a: Rgba, b: Rgba): number {
  if (a.data.length !== b.data.length) return Math.max(a.data.length, b.data.length);
  let n = 0;
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) n++;
  return n;
}

/** One frame drawn through the page's presenter and by the reference, both read back (see the module's comment). */
export function drawMenuCFrame(o: { frame: string; dialog: string; hide: string | null }): UiGpuMenuFrameDrawn {
  const w = window as unknown as Record<string, unknown>;
  const hook = w['__frontEnd'] as FrontEndWindowHook | undefined;
  if (!hook) throw Error('uiGpuMenuFrames: no window.__frontEnd (the front end is not up)');
  const s = hook.session;
  const presenter = s.presenter as SurfaceLike | null;
  if (!presenter) throw Error('uiGpuMenuFrames: the session has presented no frame yet');
  const pv = menuFramesPrivates(s);
  const textures = pv.textures;
  const items = scorerList(pv, o.dialog, o.hide);
  const readout = (): UiGpuReadoutLike | null => (w['__uiGpu'] as UiGpuReadoutLike | undefined) ?? null;
  const levels = (): MenuFrameLevels | null => { const l = readout()?.levels; return l ? { L0: l.L0, L1: l.L1, L2: l.L2, L3: l.L3, L4: l.L4 } : null; };
  const pathOf = (): { path: 'gpu' | 'software'; why: string[] } => {
    if (presenter.kind !== 'gpu-surface') return { path: 'software', why: [] };
    if (presenter.lastPath !== 'gpu') return { path: 'software', why: ['the surface drew its software (not ready, lost, released or unavailable)'] };
    if (!presenter.gpu) throw Error("uiGpuMenuFrames: no presenter.gpu (UiGpuSurfacePresenter's inner GpuUiPresenter, a private field)");
    const rec = presenter.gpu.last;
    return rec ? { path: rec.path, why: rec.why.slice() } : { path: 'software', why: ['no GPU present record'] };
  };
  const kept = s.last;
  let presents = 0, before: MenuFrameLevels | null = null, after: MenuFrameLevels | null = null, p = pathOf();
  let shown: Rgba | null = null, undrawn: string[] = [];
  try {
    s.last = items;   // the session's own render call presents `last` with its textures, at scale 1
    do {
      before = levels();
      undrawn = s.render(presenter, undefined, { scale: 1 }).undrawn.slice();
      after = levels();
      presents++;
      p = pathOf();
    } while (presents < 16 && p.path === 'software' && p.why.some((x) => x.startsWith('textures uploading')));
    shown = presenter.readFrame();
  } finally {
    s.last = kept;    // the page's own frame list back for its next tick
  }
  if (!shown) throw Error('uiGpuMenuFrames: the presenter gave no frame back (readFrame null)');
  const ref = rasterizeUiDrawList(items, textures);
  return {
    frame: o.frame, current: s.machine.shell()?.currentName ?? null, presenter: presenter.kind, path: p.path, why: p.why, presents, before, after,
    blend: readout()?.blend?.front?.sd ?? null, renderer: presenter.stats?.caps?.renderer ?? null,
    width: shown.width, height: shown.height, undrawn, referenceUndrawn: ref.undrawn.slice(),
    differ: differing(shown, ref.frame), shown: base64(shown.data), reference: base64(ref.frame.data),
  };
}

/** Installs `window.__uiGpuMenuFrames` on the front end's page. */
export function installUiGpuMenuFrames(): UiGpuMenuFrames {
  const hook: UiGpuMenuFrames = { ready: true, draw: drawMenuCFrame };
  (window as unknown as Record<string, unknown>)[UI_GPU_MENU_FRAMES_HOOK] = hook;
  return hook;
}
