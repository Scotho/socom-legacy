import type { AssetSource } from '@s2u/archive';
import type { PadSlotName, UiDrawItem, UiSoundCues } from '@s2u/ui';
import type { GamepadLike, PadButton } from './gamepad';
import { padSnapshot } from './menuInput';
import { claimSettingsEditor } from './settingsEditorOwnership';
import { readFrontEndDisc, type FrontEndDisc } from './frontEnd';
import { pageUiTextures, type PageUiTextures } from './frontEndAssets';
import { NATIVE_OPTIONS_DIALOGS, NativeOptionsHost, nativeOptionsMissing, type NativeOptionsAssets, type NativeOptionsState } from './nativeOptionsHost';
import { presentUiFrame, rasterizeUiDrawList, type RasterOptions } from './uiCompositorView';
import { frameCanvas } from './brightness';

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
   * HD-4 (OT.R92, HD.R8; a browser adaptation, only under HD (GoE Soul)): the frame's scale and the HD pack's lookup,
   * asked each frame -- the front end's menus' own (`./hdMenuTextures` `HdMenus.options`), so one pack, one budget and
   * one set of kept images serve the menus and this overlay. Absent, or scale 1: the original 640 x 448 frame.
   * `version` (`HdMenuTextures.version`) changes whenever the lookup's answer for a bitmap changes (a replacement landed).
   */
  hd?: () => Pick<RasterOptions, 'scale' | 'hd' | 'quadCache'> & { version?: number };
}

/**
 * The owner, 2026-11-01 ("Cap overlay at 2x"; a browser adaptation under HD (GoE Soul), not a game value): the in-match
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
  private releaseEditor: (() => void) | null = null;
  private prepared: NativeSettingsLoaded | null = null;
  private preparing: Promise<NativeSettingsLoaded | null> | null = null;
  private sourceGeneration = 0;
  private disposed = false;
  /** HD-4 review F1: what the canvas shows under an HD scale (null at scale 1, where every frame is drawn). */
  private shown: ShownFrame | null = null;
  constructor(private readonly o: NativeSettingsOptions) {}

  isOpen(): boolean { return this.phase !== 'closed'; }
  loading(): boolean { return this.phase === 'loading'; }
  notice(): string | null { return this.phase === 'unavailable' ? 'Settings unavailable' : null; }
  retryable(): boolean { return this.phase === 'unavailable'; }
  state() {
    return { phase: this.phase, dialog: this.editor?.shell.currentName ?? null, focus: this.editor?.input.ring()?.focused?.name ?? null,
      ready: !!this.editor && this.editor.shell.switchState < 0 && this.editor.shell.inputTimer <= 0,
      popup: this.editor ? this.editor.popupDrawn() : false, saveOnReturn: this.editor?.options.saveOnReturn ?? null,
      popupText: this.editor?.parts.current?.popup()?.popup.text.lines.map(l => String.fromCharCode(...l.bytes)).join(' ') ?? '', error: this.error };
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
        if (!this.isOpen() || event.target === this.canvas) return;
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
      const canvas = doc.createElement('canvas'); canvas.width = 640; canvas.height = 448;
      canvas.dataset.nativeSettings = 'true';
      canvas.addEventListener('pointerdown', event => {
        const rect = canvas.getBoundingClientRect();
        this.editor?.input.tap((event.clientX - rect.left) * 640 / rect.width, (event.clientY - rect.top) * 448 / rect.height);
        event.preventDefault(); event.stopImmediatePropagation();
      });
      doc.body.append(canvas); this.canvas = canvas; this.shown = null;
      frameCanvas(canvas);   // Reuse the landed shared picture effect; no independent brightness implementation.
    }
    this.phase = 'open';
  }

  private unavailable(error: unknown, generation: number): void {
    if (generation !== this.generation) return;
    this.editor?.close(); this.editor = null;
    this.canvas?.remove(); this.canvas = null;
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
      const { frame } = rasterizeUiDrawList(editor.last, editor.assets.textures, got ? { transparent: true, ...hd, scale } : { transparent: true });
      // HD-4: the canvas follows the frame's size (its CSS box, and so the taps' 640 x 448 mapping, are unchanged).
      const canvas = this.canvas!;
      if (canvas.width !== frame.width || canvas.height !== frame.height) { canvas.width = frame.width; canvas.height = frame.height; }
      presentUiFrame(ctx, frame);
    }
  }

  /** Disconnect, map replacement or teardown: native current-page discard; already applied state stays shared. */
  interrupt(): void { try { this.editor?.discard(); } finally { this.close(); } }
  /** A different asset source cannot reuse prepared data or inspect an earlier source's late completion. */
  invalidate(): void {
    this.sourceGeneration++;
    this.prepared = null;
    this.preparing = null;
    this.interrupt();
  }
  dispose(): void { this.disposed = true; this.invalidate(); }
  close(): void {
    this.generation++;
    this.phase = 'closed';
    try { this.editor?.close(); } finally {
      this.editor = null;
      this.canvas?.remove(); this.canvas = null;
      this.shown = null;
      this.releasing = true;
      try { this.releaseCapture?.(); } finally {
        this.releaseCapture = null;
        this.releaseEditor?.(); this.releaseEditor = null;
      }
    }
  }
}
