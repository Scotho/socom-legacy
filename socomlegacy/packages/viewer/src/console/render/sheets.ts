import type { Theme } from './theme';
import { onDiscChange, readDisc } from '../../modern/discStore';

/**
 * LR-1 (the launcher redesign plan, LR.R8): the sheet backdrop, the owner's Claude Design artifact's canvas
 * (`docs/specs/launcher-redesign/S2-Launcher-v2.dc.html`, its `draw(t)` and `frame(ts)`): the theme's sky, a radial glow,
 * four translucent sheets each lit along its upper edge (a gold trim along the first where the theme has it), a faint dot
 * grid and a vignette, and -- with the Appearance picture on -- the Crossroads art darkened under them. The sheets drift
 * while Backdrop motion is on and the system does not ask for reduced motion, and lean toward the category in view (the
 * artifact's `phase`, eased at 0.04 a frame toward 1.1 per category). Its values are the artifact's, transcribed. A
 * browser adaptation: the launcher's look, nothing of the game; never drawn under the overlay (OT.R60 (d)).
 */

/** One sheet: its opacity, the two waves' frequencies and speeds, its swing (of the height), its thickness, its offset. */
export interface Sheet { a: number; f1: number; f2: number; s1: number; s2: number; amp: number; thick: number; o: number }

export const SHEETS: readonly Sheet[] = [
  { a: 0.9, f1: 0.0011, f2: 0.0029, s1: 0.16, s2: -0.22, amp: 0.065, thick: 0.05, o: 0 },
  { a: 0.7, f1: 0.0009, f2: 0.0034, s1: -0.12, s2: 0.19, amp: 0.055, thick: 0.035, o: 1.7 },
  { a: 0.55, f1: 0.0013, f2: 0.0022, s1: 0.1, s2: 0.27, amp: 0.075, thick: 0.065, o: 3.1 },
  { a: 0.4, f1: 0.0007, f2: 0.0041, s1: -0.08, s2: -0.15, amp: 0.045, thick: 0.025, o: 4.6 },
];

/** The sheets' rest line, as a share of the height. */
export const SHEET_BASE = 0.73;
/** The time the sheets stand at while still (the artifact's motion-off `t`). */
export const STILL_T = 4;
/** The phase per category, and the share of the way it eases each frame. */
export const PHASE_PER_CAT = 1.1;
export const PHASE_EASE = 0.04;
/** The dot grid's pitch and margin (px). */
export const DOT_PITCH = 48;
/** The darkening laid over the picture, so the sheets read over it. */
export const PICTURE_VEIL = 0.74;
/** The x step the curves are drawn at (px). */
const STEP = 8;

/** The upper edge of sheet `S` at `x`, for height `h`, time `t` and phase `ph`. */
export function sheetTop(x: number, S: Sheet, h: number, t: number, ph: number): number {
  return h * SHEET_BASE + Math.sin(x * S.f1 + t * S.s1 + ph + S.o) * h * S.amp + Math.sin(x * S.f2 + t * S.s2 + S.o * 2) * h * 0.012;
}

/** The lower edge: the upper plus the sheet's breathing thickness. */
export function sheetBottom(x: number, S: Sheet, h: number, t: number, ph: number): number {
  return sheetTop(x, S, h, t, ph) + h * S.thick * (0.55 + 0.45 * Math.sin(x * 0.0017 + t * 0.13 + S.o));
}

/** The 2D context calls the backdrop makes (a canvas's context, or a test's recorder). */
export type Ctx2D = Pick<CanvasRenderingContext2D,
  'setTransform' | 'createLinearGradient' | 'createRadialGradient' | 'fillRect' | 'drawImage' | 'beginPath' | 'moveTo'
  | 'lineTo' | 'closePath' | 'fill' | 'stroke' | 'save' | 'restore'>
  & { fillStyle: unknown; strokeStyle: unknown; lineWidth: number; globalAlpha: number; globalCompositeOperation: string };

export interface Scene {
  w: number;
  h: number;
  t: number;
  phase: number;
  theme: Theme;
  /** The picture behind (the Crossroads art), drawn covering, when the Appearance picture is on and it has loaded. */
  picture: { img: CanvasImageSource; w: number; h: number } | null;
}

const rgba = (c: readonly number[], a: number): string => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
/** The artifact's gold (`#f2b43a`, `--s2u-lx-accent`). */
const GOLD = [242, 180, 58] as const;

/** One frame of the backdrop, in CSS pixels (the caller sets the device-pixel transform). */
export function drawScene(ctx: Ctx2D, sc: Scene): void {
  const { w, h, t, phase: ph, theme: th } = sc;
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, th.top);
  sky.addColorStop(1, th.bottom);
  if (sc.picture) {
    const p = sc.picture;
    const k = Math.max(w / p.w, h / p.h);
    ctx.drawImage(p.img, (w - p.w * k) / 2, (h - p.h * k) / 2, p.w * k, p.h * k);
    ctx.globalAlpha = PICTURE_VEIL;
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  } else { ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h); }
  const glow = ctx.createRadialGradient(w * 0.5, h * 0.72, 0, w * 0.5, h * 0.72, Math.max(w * 0.7, h));
  glow.addColorStop(0, rgba(th.glow, 0.32));
  glow.addColorStop(0.45, rgba(th.glow, 0.12));
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
  const base = h * SHEET_BASE;
  const xs: number[] = [];
  for (let x = 0; x <= w + STEP; x += STEP) xs.push(x);
  const [r, g, b] = th.sheet;
  const lit = [Math.min(255, r + 70), Math.min(255, g + 50), Math.min(255, b + 30)];
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const S of SHEETS) {
    const fill = ctx.createLinearGradient(0, base - h * 0.1, 0, base + h * 0.12);
    fill.addColorStop(0, rgba(th.sheet, 0.09 * S.a));
    fill.addColorStop(1, rgba(th.sheet, 0));
    ctx.fillStyle = fill;
    ctx.beginPath();
    xs.forEach((x, n) => { const y = sheetTop(x, S, h, t, ph); if (n) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    for (let n = xs.length - 1; n >= 0; n--) ctx.lineTo(xs[n]!, sheetBottom(xs[n]!, S, h, t, ph));
    ctx.closePath(); ctx.fill();
    const edge = ctx.createLinearGradient(0, 0, w, 0);
    edge.addColorStop(0, rgba(th.sheet, 0));
    edge.addColorStop(0.5, rgba(lit, 0.45 * S.a));
    edge.addColorStop(1, rgba(th.sheet, 0));
    ctx.strokeStyle = edge; ctx.lineWidth = 1;
    ctx.beginPath();
    xs.forEach((x, n) => { const y = sheetTop(x, S, h, t, ph); if (n) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.stroke();
  }
  if (th.gold) {
    const S = SHEETS[0]!;
    const trim = ctx.createLinearGradient(0, 0, w, 0);
    trim.addColorStop(0, rgba(GOLD, 0)); trim.addColorStop(0.5, rgba(GOLD, 0.28)); trim.addColorStop(1, rgba(GOLD, 0));
    ctx.strokeStyle = trim; ctx.lineWidth = 1;
    ctx.beginPath();
    xs.forEach((x, n) => { const y = sheetBottom(x, S, h, t, ph); if (n) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = rgba(th.sheet, 0.06);
  for (let x = 40; x < w; x += DOT_PITCH) for (let y = 40; y < h; y += DOT_PITCH) ctx.fillRect(x, y, 1, 1);
  const vig = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, w * 0.8);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.7)');
  ctx.fillStyle = vig; ctx.fillRect(0, 0, w, h);
}

/** What the page tells the backdrop at each draw. */
export interface SheetInput {
  cat: number;
  theme: Theme;
  /** Backdrop motion on (Options' row). */
  motion: boolean;
  /** The Appearance picture on. */
  picture: boolean;
}

export interface SheetDeps {
  /** The canvas's 2D context; absent, the canvas's own. */
  context?: (canvas: HTMLCanvasElement) => Ctx2D | null;
  /** The frame scheduler and its cancel; absent, the window's. */
  frame?: (cb: (ts: number) => void) => number;
  cancel?: (id: number) => void;
  /** Whether the system asks for reduced motion; absent, the window's media query, read at each frame. */
  reduced?: () => boolean;
  /**
   * LR-37 (10): whether the backdrop stands still now -- the game has the window (the disc store's `in-game`) or the tab
   * is hidden; absent, those two read from the document. A browser adaptation.
   */
  idle?: () => boolean;
}

/**
 * The backdrop's canvas inside `host` (the page's `#backdrop`) and its frame loop. While the sheets drift it draws every
 * frame; still (motion off, or reduced motion), it draws until the phase has settled and then waits for the next `set`.
 * Under reduced motion the phase moves at once.
 */
export class SheetBackdrop {
  readonly canvas: HTMLCanvasElement;
  private ctx: Ctx2D | null = null;
  private input: SheetInput | null = null;
  private phase: number | null = null;
  private t0: number | null = null;
  private pending: number | null = null;
  private disposed = false;
  private readonly win: Window;
  /** Takes down the resize watch (dispose). */
  private unwatch: () => void = () => {};
  /** LR-37 (10): takes down the game and visibility watches (dispose). */
  private unwake: () => void = () => {};

  constructor(private readonly host: HTMLElement, private readonly deps: SheetDeps = {}) {
    const doc = host.ownerDocument;
    this.win = doc.defaultView!;
    this.canvas = doc.createElement('canvas');
    this.canvas.className = 'cx-sheets';
    this.canvas.setAttribute('aria-hidden', 'true');
    host.prepend(this.canvas);
    host.classList.add('has-sheets');
    // A still backdrop draws only on a change: a resized canvas would stretch its bitmap, so a resize asks for a frame.
    const RO = (this.win as unknown as { ResizeObserver?: new (cb: () => void) => { observe(t: Element): void; disconnect(): void } }).ResizeObserver;
    if (RO) {
      const ro = new RO(() => this.schedule());
      ro.observe(this.canvas);
      this.unwatch = () => ro.disconnect();
    } else {
      const on = () => this.schedule();
      this.win.addEventListener('resize', on);
      this.unwatch = () => this.win.removeEventListener('resize', on);
    }
    // LR-37 (10, the owner, 2026-10-29: "Stop the home animation while the game ... is playing"): the loop asks no frame
    // while the game has the window or the tab is hidden, and asks one again when the launcher is back in view.
    const wake = (): void => { if (!this.idle()) this.schedule(); };
    const offDisc = onDiscChange(doc, wake);
    doc.addEventListener('visibilitychange', wake);
    this.unwake = () => { offDisc(); doc.removeEventListener('visibilitychange', wake); };
  }

  /** LR-37 (10): the game has the window, or the tab is hidden. */
  private idle(): boolean {
    if (this.deps.idle) return this.deps.idle();
    const doc = this.host.ownerDocument;
    return doc.hidden || readDisc(doc).state === 'in-game';
  }

  private reduced(): boolean {
    if (this.deps.reduced) return this.deps.reduced();
    return this.win.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  }

  /** The page's state at a draw: the next frame follows it. */
  set(input: SheetInput): void {
    if (this.disposed) return;
    this.input = input;
    this.schedule();
  }

  private schedule(): void {
    if (this.pending !== null || this.disposed || this.idle()) return;   // LR-37 (10): no frame while idle
    const frame = this.deps.frame ?? ((cb: (ts: number) => void) => this.win.requestAnimationFrame(cb));
    this.pending = frame((ts) => { this.pending = null; this.step(ts); });
  }

  /** One frame: ease the phase, draw, and ask for the next while anything moves. */
  step(ts: number): void {
    const inp = this.input;
    if (this.disposed) return;
    // Taken down with the page (the hand-over's take-down): the loop ends, its watches with it (LR-37 (10): no frame for a
    // later resize).
    if (!this.canvas.isConnected) { this.unwatch(); this.unwake(); this.unwatch = this.unwake = () => {}; this.disposed = true; return; }
    if (!inp || this.idle()) return;                                   // LR-37 (10): idle, no draw and no next frame
    const still = !inp.motion || this.reduced();
    const target = inp.cat * PHASE_PER_CAT;
    if (this.phase === null || this.reduced()) this.phase = target;
    else this.phase += (target - this.phase) * PHASE_EASE;
    if (Math.abs(target - this.phase) < 0.001) this.phase = target;
    this.t0 ??= ts;
    const t = still ? STILL_T : (ts - this.t0) / 1000;
    this.draw(t);
    if (!still || this.phase !== target) this.schedule();
  }

  /** The current phase (for the test). */
  get leaning(): number | null { return this.phase; }

  private draw(t: number): void {
    const cv = this.canvas;
    this.ctx ??= this.deps.context ? this.deps.context(cv) : (cv.getContext('2d') as Ctx2D | null);
    const ctx = this.ctx;
    const inp = this.input;
    if (!ctx || !inp) return;
    const dpr = Math.min(this.win.devicePixelRatio || 1, 2);
    const w = cv.clientWidth || this.win.innerWidth;
    const h = cv.clientHeight || this.win.innerHeight;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const img = inp.picture ? this.host.querySelector('img') : null;
    const picture = img && img.complete && img.naturalWidth ? { img, w: img.naturalWidth, h: img.naturalHeight } : null;
    drawScene(ctx, { w, h, t, phase: this.phase ?? 0, theme: inp.theme, picture });
  }

  dispose(): void {
    this.disposed = true;
    this.unwatch();
    this.unwake();
    if (this.pending !== null) (this.deps.cancel ?? ((id: number) => this.win.cancelAnimationFrame(id)))(this.pending);
    this.pending = null;
    this.canvas.remove();
    this.host.classList.remove('has-sheets');
  }
}

/** Whether this window can draw a 2D canvas (a test's DOM has no canvas: no backdrop is mounted there). */
export const canDrawSheets = (win: Window): boolean => typeof (win as unknown as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D === 'function'
  && typeof win.requestAnimationFrame === 'function';
