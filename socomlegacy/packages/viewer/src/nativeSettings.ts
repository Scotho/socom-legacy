import type { AssetSource } from '@s2u/archive';
import type { Rgba } from '@s2u/gs';
import { findNode, SliderWidget, type PadSlotName, type UiDrawItem, type UiSoundCues, type UiNode } from '@s2u/ui';
import type { GamepadLike, PadButton } from './gamepad';
import { attachMenuPointer, padSnapshot } from './menuInput';
import { claimSettingsEditor } from './settingsEditorOwnership';
import { readFrontEndDisc, type FrontEndDisc } from './frontEnd';
import { pageUiTextures, type PageUiTextures } from './frontEndAssets';
import { NATIVE_OPTIONS_DIALOGS, NativeOptionsHost, nativeOptionsMissing, type NativeOptionsAssets, type NativeOptionsState } from './nativeOptionsHost';
import type { RasterOptions } from './uiCompositorView';
import { CpuUiPresenter, type UiPresenter } from './uiPresenter';
import { frameCanvas } from './brightness';
import { uiGpuFrontFrameOptions } from './uiGpuFront';
import { UiGpuCanvasMount, type UiGpuLoader, type UiGpuMountSurface, type UiGpuResolveAt } from './uiGpuSurfaceMount';

/** Load from the current game source; a served tree with these files is sufficient. No ISO-selection flow. */
export async function readNativeOptionsAssets(source: AssetSource, kept?: { disc: FrontEndDisc; banks: PageUiTextures }): Promise<NativeOptionsAssets> {
  const disc = kept?.disc ?? await readFrontEndDisc(source);
  const banks = kept?.banks ?? pageUiTextures(source, ['UIMP', 'UIOP']);
  await banks.ready;
  const lazy = await Promise.all(NATIVE_OPTIONS_DIALOGS.map(n => disc.dialog(n)).filter(d => d !== null).map(d => banks.need(d)));
  const assets = { disc, textures: banks.textures };
  const missing = [...lazy.flat(), ...nativeOptionsMissing(assets)];
  if (missing.length) throw new Error([...new Set(missing)].join('; '));
  return assets;
}

export interface NativeSettingsLoaded { assets: NativeOptionsAssets; state: NativeOptionsState | (() => NativeOptionsState); sounds?: UiSoundCues | null }
export interface NativeSettingsOptions {
  load(): Promise<NativeSettingsLoaded>;
  /** The match's document; absent in unit tests. */
  doc?: Document;
  /**
   * HD-4 (OT.R92, HD.R8; a browser adaptation, only under HD (GoE SouL)): the frame's scale and the HD pack's lookup,
   * asked each frame -- the front end's menus' own (`./hdMenuTextures` `HdMenus.options`), so one pack, one budget and
   * one set of kept images serve the menus and this overlay. Absent, or scale 1: the original 640 x 448 frame.
   * `version` (`HdMenuTextures.version`) changes whenever the lookup's answer for a bitmap changes (a replacement landed).
   */
  hd?: () => Pick<RasterOptions, 'scale' | 'hd' | 'quadCache'> & { version?: number };
  /**
   * GM-19a (a browser adaptation; the GPU menus plan, row GM-19a): the overlay's GPU surface. Given, the HD options reach
   * only a presenting GPU surface and every software frame is the original 1x frame (GM-28, GM.R19); absent (the unit
   * tests' HD-4 pins), the software draws at `hd`'s scale as HD-4 did.
   */
  gpu?: NativeSettingsGpu;
}

/**
 * GM-19a: what the overlay needs to put its frame on the GPU -- the switch's answer at a scale and the surface's loader.
 * A browser adaptation with no original: it decides which drawer makes the frame, never a byte of it.
 */
export interface NativeSettingsGpu {
  /** `UiGpuSwitch.resolve('overlay', scale)` in a match; the test room's `resolveTestRoomOverlay()` (overlay.sd, GM.R8). */
  resolveAt: UiGpuResolveAt;
  /**
   * The surface on the overlay's GPU canvas (`./uiGpuSurfaceMount` `uiGpuSurfaceLoader`: the page's `import()`, GM.R15).
   * GM-30: the page's loader carries the switch's ladder for `overlay` (`UiGpuLoader`), so the overlay's software frames are counted.
   */
  load: UiGpuLoader<UiGpuMountSurface>;
  /** A failure's line (the console). */
  log?: (line: string) => void;
  /** Review fold 1: a page the Vite dev server serves (`uiGpuDevBuild`): its `shadow` keeps the shown scale; elsewhere 1x. */
  dev?: boolean;
}

/**
 * GM-19a: the overlay's GPU canvas's data attribute (its CSS box, `./styles.css`; the software canvas keeps
 * `data-native-settings`, so a query for it still finds one canvas).
 */
export const NATIVE_SETTINGS_GPU_ATTRIBUTE = 'nativeSettingsGpu';

/**
 * The owner, 2026-11-01 ("Cap overlay at 2x"; a browser adaptation under HD (GoE SouL), not a game value): the in-match
 * Settings overlay draws at the menus' scale capped at 2 -- 1280 x 896 under the pack's 4x, still sampled from the HD
 * images through the menus' lookup -- since its software frame is drawn over a running match. The menus and the
 * loading screen keep the pack's scale.
 */
export const HD_OVERLAY_SCALE_LIMIT = 2;

/** A draw list's frozen copy and the HD state it was drawn under (HD-4 review F1). */
interface ShownFrame { items: unknown; scale: number; hd: unknown; version: number | undefined }

/** Structural equality of two draw lists' values (plain objects, arrays, typed arrays, primitives). */
export function sameDrawValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return Number.isNaN(a) && Number.isNaN(b);
  if (ArrayBuffer.isView(a) || ArrayBuffer.isView(b)) {
    if (!ArrayBuffer.isView(a) || !ArrayBuffer.isView(b) || a.constructor !== b.constructor) return false;
    const x = a as unknown as ArrayLike<number>, y = b as unknown as ArrayLike<number>;
    if (x.length !== y.length) return false;
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
    return true;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!sameDrawValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  return true;
}

/** MLS.R1/R2/R7 browser adaptation. One editor with generation-safe lazy reads and no ownership of match resources. */
export class NativeSettings {
  private phase: 'closed' | 'loading' | 'unavailable' | 'open' = 'closed';
  private generation = 0;
  private canvas: HTMLCanvasElement | null = null;
  private editor: NativeOptionsHost | null = null;
  private last = new Set<PadButton>();
  private releasing = true;
  private error = '';
  private releaseCapture: (() => void) | null = null;
  private releasePointer: (() => void) | null = null;
  private releaseEditor: (() => void) | null = null;
  private prepared: NativeSettingsLoaded | null = null;
  private preparing: Promise<NativeSettingsLoaded | null> | null = null;
  private sourceGeneration = 0;
  private disposed = false;
  /** HD-4 review F1: what the canvas shows under an HD scale (null at scale 1, where every frame is drawn). */
  private shown: ShownFrame | null = null;
  /** GM-09: today's software path onto the canvas (one per canvas; null while closed). */
  private presenter: CpuUiPresenter | null = null;
  /**
   * GM-19a: the software canvas, kept across opens once made (a GPU surface's fallback is its presenter); on the page only
   * while open. `canvas` above is it while open, null while closed.
   */
  private kept: HTMLCanvasElement | null = null;
  /** GM-19a: the overlay's GPU canvas and surface (made at the first open when the switch asks it; null otherwise). */
  private gpuMount: UiGpuCanvasMount | null = null;
  private gpuAsked = false;
  /** GM-19a: what drew the frame on show (the GPU surface or the software presenter), for `readFrame`. */
  private drawer: UiPresenter | null = null;
  constructor(private readonly o: NativeSettingsOptions) {}

  /**
   * GM-09 (a test seam, a browser adaptation): the frame the overlay's canvas shows -- transparent, straight RGBA, top
   * row first, at its scale -- or null while closed or before its first frame. Read-only: the presenter's own.
   */
  readFrame(): Rgba | null { return this.phase === 'open' ? (this.drawer ?? this.presenter)?.readFrame() ?? null : null; }
  /** GM-09: what the frame shown left undrawn (empty while closed). */
  undrawn(): readonly string[] { return this.phase === 'open' ? (this.drawer ?? this.presenter)?.undrawn() ?? [] : []; }

  isOpen(): boolean { return this.phase !== 'closed'; }
  loading(): boolean { return this.phase === 'loading'; }
  notice(): string | null { return this.phase === 'unavailable' ? 'Settings unavailable' : null; }
  retryable(): boolean { return this.phase === 'unavailable'; }
  state() {
    return { phase: this.phase, dialog: this.editor?.shell.currentName ?? null, focus: this.editor?.input.ring()?.focused?.name ?? null,
      ready: !!this.editor && this.editor.shell.switchState < 0 && this.editor.shell.inputTimer <= 0,
      sliders: this.sliderState(),
      popup: this.editor ? this.editor.popupDrawn() : false, saveOnReturn: this.editor?.options.saveOnReturn ?? null,
      popupText: this.editor?.parts.current?.popup()?.popup.text.lines.map(l => String.fromCharCode(...l.bytes)).join(' ') ?? '', error: this.error };
  }

  /** Read-only diagnostics for the same sliders drawn on the overlay (native frame coordinates). */
  private sliderState() {
    const editor = this.editor, parts = editor?.parts.current;
    if (!editor || !parts) return [];
    return parts.dialog.design.controls.flatMap(record => {
      const widget = parts.widgets.get(record.name), node = findNode(editor.shell.screen.root, record.name);
      if (!(widget instanceof SliderWidget) || !node) return [];
      const chain: UiNode[] = [];
      for (let n: UiNode | null = node; n; n = n.parent) chain.unshift(n);
      let x = 0, y = 0, sx = 1, sy = 1;
      for (const n of chain) { x += sx * n.x; y += sy * n.y; sx *= n.scale[0]; sy *= n.scale[1]; }
      const variable = widget.slider.uivar?.name;
      return [{ name: record.name, variable, position: widget.position, enabled: widget.enabled,
        value: variable ? editor.state.uiVars.find(variable)?.value : undefined,
        x, y, width: widget.size[0] * sx, height: Math.max(widget.size[1], widget.slider.knobSize[1]) * sy }];
    });
  }

  /** Browser adaptation: warm immutable assets/sounds only; state and the editor lease stay lazy until open(). */
  preload(): Promise<void> { return this.disposed ? Promise.resolve() : this.prepare().then(() => {}, () => {}); }

  private prepare(): Promise<NativeSettingsLoaded | null> {
    if (this.prepared) return Promise.resolve(this.prepared);
    if (this.preparing) return this.preparing;
    const sourceGeneration = this.sourceGeneration;
    let reading: Promise<NativeSettingsLoaded>;
    try { reading = this.o.load(); } catch (e) { reading = Promise.reject(e); }
    return this.preparing = reading.then(loaded => {
      if (sourceGeneration !== this.sourceGeneration) return null;
      this.preparing = null;
      const missing = nativeOptionsMissing(loaded.assets);
      if (missing.length) throw new Error(missing.join('; '));
      this.prepared = loaded;
      return loaded;
    }, error => {
      if (sourceGeneration === this.sourceGeneration) this.preparing = null;
      throw error;
    });
  }

  open(): void {
    if (this.isOpen() || this.disposed) return;
    if (this.o.doc) {
      this.releaseEditor = claimSettingsEditor(this.o.doc, this);
      if (!this.releaseEditor) return;
    }
    this.phase = 'loading';
    this.releasing = true;
    this.error = '';
    const win = this.o.doc?.defaultView;
    if (win && !this.releaseCapture) {
      const take = (event: Event) => {
        if (!this.isOpen() || event.target === this.canvas || (this.gpuMount && event.target === this.gpuMount.canvas)) return;
        // Other page widgets include the touch pad: their own buttons must still produce pad snapshots.
        if (!event.type.startsWith('key') && !(event.target instanceof win.HTMLCanvasElement)) return;
        event.preventDefault(); event.stopImmediatePropagation();
      };
      // Native Options is pad driven, like the home pages in a match. Browser clicks/typing cannot reach a firearm,
      // camera or another editor behind it; the pad/touch snapshots are read explicitly by frame().
      const events = ['keydown', 'keyup', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'wheel'];
      for (const name of events) win.addEventListener(name, take, { capture: true, passive: false });
      this.releaseCapture = () => { for (const name of events) win.removeEventListener(name, take, true); };
    }
    const generation = ++this.generation;
    const open = (loaded: NativeSettingsLoaded | null) => {
      if (!loaded || generation !== this.generation || this.phase !== 'loading') return;
      try { this.mount(loaded); } catch (e) { this.unavailable(e, generation); }
    };
    if (this.prepared) open(this.prepared);
    else void this.prepare().then(open, error => this.unavailable(error, generation));
  }

  private mount(loaded: NativeSettingsLoaded): void {
    const state = typeof loaded.state === 'function' ? loaded.state() : loaded.state;
    // SAVE_ON_RETURN_ADAPTATION: over a match, RETURN saves to the card without its questions (the owner, 2026-10-29)
    this.editor = new NativeOptionsHost(loaded.assets, state, loaded.sounds, { saveOnReturn: true });
    const doc = this.o.doc;
    if (doc) {
      // GM-19a: the canvas is made once and kept across opens (the GPU surface's fallback presenter is bound to it).
      // #718's pointer (attachMenuPointer) is attached at each open, below, once the GPU canvas exists, and released at close.
      let canvas = this.kept;
      if (!canvas) {
        canvas = this.kept = doc.createElement('canvas'); canvas.width = 640; canvas.height = 448;
        canvas.dataset.nativeSettings = 'true';
      }
      doc.body.append(canvas); this.canvas = canvas; this.shown = null;
      frameCanvas(canvas);   // Reuse the landed shared picture effect; no independent brightness implementation.
      this.mountGpu(doc, canvas);
      // #718 (Chris's native slider input) on both canvases (GM-19a merge): the same pointer on whichever is shown, each
      // released at close -- one per open, as the editor (its input) is made per open.
      if (this.editor) {
        const input = this.editor.input, gpuCanvas = this.gpuMount?.canvas;
        const soft = attachMenuPointer(input, canvas), gpuRelease = gpuCanvas ? attachMenuPointer(input, gpuCanvas) : null;
        this.releasePointer = () => { soft(); gpuRelease?.(); };
      }
    }
    this.phase = 'open';
  }

  /**
   * GM-19a: the overlay's GPU canvas beside the software one -- made at the first open, when the switch asks `overlay` of
   * the GPU (`UiGpuCanvasMount.make`; `on` on the landed table since the flip, GM.R18), its surface imported after the
   * first software frame (GM.R15), its context and links prepared from the surface's first frame (`readyOn`); put back
   * beside the software canvas at a later open. The match's end (`interrupt`) disposes it; an open after that makes a new one.
   */
  private mountGpu(doc: Document, canvas: HTMLCanvasElement): void {
    const gpu = this.o.gpu;
    if (!gpu) return;
    if (!this.gpuAsked) {
      this.gpuAsked = true;
      this.gpuMount = UiGpuCanvasMount.make({
        doc, twin: canvas, resolveAt: gpu.resolveAt, label: 'overlay', dataset: { [NATIVE_SETTINGS_GPU_ATTRIBUTE]: 'true' }, hideTwin: true, dev: gpu.dev === true,
        load: (c) => gpu.load({ canvas: c, software: this.software(canvas), shown: (w) => { this.gpuMount?.want(w); } }),
        ...(gpu.log ? { log: gpu.log } : {}),
        ...(gpu.load.ladder ? { ladder: gpu.load.ladder } : {}),   // GM-30: its software frames counted per surface
      });
    } else this.gpuMount?.reattach();
  }

  /** The software presenter on the overlay's canvas (GM-09), made once per canvas: the canvas follows the frame's size (HD-4). */
  private software(canvas: HTMLCanvasElement): CpuUiPresenter {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('NativeSettings: no 2D context on the overlay\'s canvas');
    if (this.presenter?.target !== ctx) {
      this.presenter = new CpuUiPresenter(ctx, { fit: (w, h) => { if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; } } });
    }
    return this.presenter;
  }

  private unavailable(error: unknown, generation: number): void {
    if (generation !== this.generation) return;
    this.editor?.close(); this.editor = null;
    this.releasePointer?.(); this.releasePointer = null;
    this.canvas?.remove(); this.canvas = null;
    this.gpuMount?.detach();
    this.error = error instanceof Error ? error.message : String(error);
    this.phase = 'unavailable';
  }

  /** Called before START's input each frame, including while loading or showing the retry notice. */
  frame(now: number, held: ReadonlySet<PadButton>, physical?: GamepadLike | null, touch?: GamepadLike | null): void {
    const previous = this.last;
    this.last = new Set(held);
    if (!this.isOpen()) return;
    // The opening/closing button belongs to its original menu until fully released; no action transfers between hosts.
    if (this.releasing) { if (held.size === 0) this.releasing = false; }
    const released = (name: PadButton) => !this.releasing && previous.has(name) && !held.has(name);
    if (this.phase !== 'open') {
      if (released('Triangle') || released('Start')) { this.close(); return; }
      if (this.phase === 'unavailable' && released('Cross')) { this.close(); this.open(); }
      return;
    }
    const down = new Set<PadSlotName>();
    if (!this.releasing) for (const n of held) if (n !== 'L3' && n !== 'R3') down.add((/^[LR][12]$/.test(n) ? `TRIGGER_${n}` : n.toUpperCase()) as PadSlotName);
    const editor = this.editor;
    // The same adapter as the home pages: GamePad has already applied the selected device/profile calibration;
    // padSnapshot supplies the original menu signs, with the touch pad's live axis taking precedence as there.
    const padStick = padSnapshot(physical), touchStick = padSnapshot(touch);
    const stickX = this.releasing ? 0 : touchStick.stickX || padStick.stickX;
    const stickY = this.releasing ? 0 : touchStick.stickY || padStick.stickY;
    if (!editor?.frame(now, { down, stickX, stickY })) { this.close(); return; }
    const ctx = this.canvas?.getContext('2d');
    if (ctx) {
      const got = this.o.hd?.();
      const { version, ...hd } = got ?? {};
      const scale = Math.min(hd.scale ?? 1, HD_OVERLAY_SCALE_LIMIT);
      if (this.o.gpu) { this.gpuFrame(editor, { transparent: true, ...hd, scale }); return; }
      if (scale > 1) {
        // HD-4 review F1 (redrawn only on change; the owner, 2026-11-01: kept with the 2x cap): a
        // 1280 x 896 software frame is rastered and presented only when the draw list, the scale, the lookup or its
        // answers (`version`: a replacement landed) changed since the frame the canvas shows. At scale 1 every frame is
        // drawn, as before (the bitmaps the list names are not watched, so a skip there is not proven identical).
        const s = this.shown;
        if (s && s.scale === scale && s.hd === hd.hd && s.version === version && sameDrawValue(s.items, editor.last)) return;
        let items: unknown = null;
        try { items = structuredClone(editor.last as UiDrawItem[]); } catch { items = null; }   // a list it cannot copy is drawn every frame
        this.shown = items === null ? null : { items, scale, hd: hd.hd, version };
      } else this.shown = null;
      // GM-09: through the presenter (today's software path, byte for byte). HD-4: the canvas follows the frame's size
      // (its CSS box, and so the taps' 640 x 448 mapping, are unchanged), set before the put.
      const canvas = this.canvas!;
      if (this.presenter?.target !== ctx) {
        this.presenter = new CpuUiPresenter(ctx, { fit: (w, h) => { if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; } } });
      }
      this.presenter.present(editor.last, editor.assets.textures, got ? { transparent: true, ...hd, scale } : { transparent: true });
      this.drawer = this.presenter;
    }
  }

  /**
   * GM-19a (GM-28's rule, GM.R19): a frame with the GPU option given. Through the GPU surface when it draws this scale --
   * the HD options capped at `HD_OVERLAY_SCALE_LIMIT`, which the surface keeps only while it presents (its own software,
   * any level, the 1x frame), every frame handed to it (its dirty check by plan hash, GM-12a, keeps an unchanged one off the
   * GPU) -- else the page's own software at the original 1x frame (`uiGpuFrontFrameOptions`: before the surface's
   * `import()` lands, a failed load, a kill that is not the surface's own, `off`), drawn every frame as at scale 1 before.
   * The swap between the canvases at the frame's end (`commit`).
   */
  private gpuFrame(editor: NativeOptionsHost, hd: RasterOptions & { scale: number }): void {
    // Review folds 3-4: to the surface only once it is prepared (every program linked, no stall); review fold 1: the HD
    // options only where the surface's own mode presents (`hdOn`), else 1x even on the surface (a built page's shadow).
    const g = this.gpuMount;
    const gpu = g?.readyOn(hd.scale) ?? false;
    const surface = gpu ? g!.surface : null;
    const options = uiGpuFrontFrameOptions(hd, gpu && g!.hdOn(hd.scale));
    this.shown = null;
    if (gpu && surface) {
      surface.present(editor.last, editor.assets.textures, options);
      this.drawer = surface;
    } else {
      const software = this.software(this.canvas!);
      software.present(editor.last, editor.assets.textures, options);
      this.drawer = software;
    }
    g?.drawn(gpu);
    g?.commit();
  }

  /**
   * Disconnect, map replacement or teardown: native current-page discard; already applied state stays shared. GM-19a
   * review fold 2: the match's end (its unmount interrupts the overlay, and the page makes a new overlay per match), so the
   * GPU surface is disposed here -- a released context stays live and counted where the browser has no
   * `WEBGL_lose_context` -- and an open after it (the test room's next map) makes a new one.
   */
  interrupt(): void {
    try { this.editor?.discard(); } finally {
      this.close();
      this.gpuMount?.remove(); this.gpuMount = null; this.gpuAsked = false;
    }
  }
  /** A different asset source cannot reuse prepared data or inspect an earlier source's late completion. */
  invalidate(): void {
    this.sourceGeneration++;
    this.prepared = null;
    this.preparing = null;
    this.interrupt();
  }
  dispose(): void {
    this.disposed = true;
    try { this.invalidate(); } finally {
      this.gpuMount?.remove(); this.gpuMount = null; this.gpuAsked = true;   // GM-19a: the surface let go for good
    }
  }
  close(): void {
    this.generation++;
    this.phase = 'closed';
    try { this.editor?.close(); } finally {
      this.editor = null;
      this.releasePointer?.(); this.releasePointer = null;                                          // #718
      if (this.canvas) {                                                                            // GM-19a: kept, emptied
        this.canvas.remove();
        (this.canvas.getContext('2d') as { clearRect?(x: number, y: number, w: number, h: number): void } | null)?.clearRect?.(0, 0, this.canvas.width, this.canvas.height);
      }
      this.canvas = null;
      this.gpuMount?.detach();                                                                      // GM-19a: the surface kept
      this.shown = null;
      this.drawer = null;
      this.releasing = true;
      try { this.releaseCapture?.(); } finally {
        this.releaseCapture = null;
        this.releaseEditor?.(); this.releaseEditor = null;
      }
    }
  }
}
