import type { Loadout } from '@s2u/scene';
import { Armory, ARMORY_PAD, type ArmoryCue, type ArmoryDeps } from '../../armory';
import type { ArmoryData } from '../../armoryData';
import { ARMORY_WHITE, WHITE_TEXEL, type ArmoryQuad, type ShownModel } from '../../armoryLayout';
import type { ArmorySound } from '../../armoryState';
import { ArmoryView, frameOfClient, type ArmoryRenderer } from '../../armoryView';
import { PAD_BUTTON, type PadButton } from '../../gamepad';
import type { PadSnapshot } from '../pad';
import { ArmoryStick } from '../../lobbyArmory';
import { menuStick } from '../../menuInput';
import { LEFT_DEAD_ZONE } from '../../moveStick';
import type { ForgeLobbyArmorySource } from './deps';

/**
 * FORGE (FG-27; FG.R22): the ARMORY inside the lobby window -- a browser adaptation with no original of its own (the
 * console's ARMORY was the whole screen): the extracted screen (`../../armory` `Armory`, used as is: its scripts, its
 * state, its values untouched) over the map's disc data, drawn to a canvas inside the window by a painter
 * (`armoryViewPaint`: `ArmoryView.render`, as `../../matchArmory` draws it), its taps mapped into the 640 x 448 frame
 * (`frameOfClient`), the pad's presses through `Armory.pad`.
 *
 * - **Its way out**: each change of the type or its kit (the screen's live `change`) goes to the room through the
 *   source's `send` -- the room's `loadout` in its waiting phase (FG.R20) -- and is held for the screen's next opening
 *   in this session, as the game lobby's shared screen holds it (`../../lobbyArmory`); the screen's close (DONE,
 *   Triangle on character select) returns the window to the lobby view.
 * - **Nothing stored** (FG.R21; the owner's word, 2026-10-14, FG.R22): the screen's own store (Square's save, Circle's
 *   defaults) is a map in this session's memory -- never the browser's storage, the memory card or `PUT /lobby/loadout`.
 * - **The render step is injected** (`ArmoryPaint`): the canvas needs a renderer of its own, which the page makes
 *   (FG-26); without one the screen still runs and takes its input, and nothing is drawn.
 * - **The pad**: the sixteen buttons of the standard mapping by `../../gamepad` `PAD_BUTTON` (0..15); the Home button
 *   (16) is never read (the owner's word, 2026-10-14, FG.R22: it is the modern UI overlay's).
 */

/** What the window's part asks of the screen (`Armory`'s own methods; a test's stand-in has the same). */
export type ArmoryLike = Pick<Armory, 'setData' | 'setWorld' | 'open' | 'isOpen' | 'frame' | 'pad' | 'input' | 'taking' | 'tap' | 'close' | 'quads' | 'models'>;

/** The render step: the data's bitmaps and models taken, each frame's quads and models drawn to the canvas. */
export interface ArmoryPaint {
  data(d: ArmoryData): void;
  draw(quads: readonly ArmoryQuad[], models: readonly ShownModel[], canvas: HTMLCanvasElement): void;
  /** The drawing buffer's size, for the taps' mapping; absent, the canvas's own `width` x `height`. */
  buffer?(): { width: number; height: number };
  dispose(): void;
}

/**
 * The painter over `ArmoryView` (`../../armoryView`), on the renderer the page makes for the window's canvas
 * (`renderer`, asked at the first draw, null while it has none): the bitmaps and the preview models set at the data,
 * each frame's quads drawn as `../../matchArmory`'s `frame` draws them.
 */
export function armoryViewPaint(renderer: (canvas: HTMLCanvasElement) => ArmoryRenderer | null): ArmoryPaint {
  const view = new ArmoryView();
  let r: ArmoryRenderer | null = null;
  return {
    data: (d) => {
      view.setBitmaps(d.bitmaps);
      view.setModels(d.models, d.modelTextures);
    },
    draw: (quads, models, canvas) => {
      r ??= renderer(canvas);
      if (r) view.render(r, quads, models);
    },
    buffer: () => view.bufferSize(),
    dispose: () => { view.dispose(); r = null; },
  };
}

export interface ForgeLobbyArmoryOptions {
  doc: Document;
  /** The page's ARMORY source (`ForgeLobbyDeps.armory`), or null when it cannot open. */
  source(): ForgeLobbyArmorySource | null;
  /** The map's name (its stem: the screen's world key, `ArmoryWorld.map`). */
  map(): string;
  /** The title bar's names (`GAMENAMEVAR`, `MEDIUS_LOBBY_NAME`). */
  names(): { game: string; room: string };
  /** The screen closed by its own way out: the window back to the lobby view. */
  closed(): void;
  /** The render step; absent or null, nothing is drawn. */
  paint?: ArmoryPaint | null;
  /** Seconds, the screen's clock; absent, `performance.now()`'s. */
  clock?(): number;
  /** The screen's sounds; absent, none played (the forge has no UI bank loaded). */
  sound?(name: ArmorySound, cue?: ArmoryCue): void;
  /** The screen's maker; absent, `new Armory`. */
  make?(deps: ArmoryDeps): ArmoryLike;
  /**
   * LATER 408: the pad's DEAD ZONE (`+0x288`), the stick's flick read through it (`../../menuInput` `MENU_STICK_READING`);
   * absent, the console's default (`LEFT_DEAD_ZONE`): the forge has no CONTROLLER OPTIONS.
   */
  deadZone?(): number;
}

/** The sixteen standard buttons by index (`PAD_BUTTON`): the Home button (16) is not among them. */
const PAD_ORDER: readonly (readonly [PadButton, number])[] = (Object.entries(PAD_BUTTON) as [PadButton, number][]).sort((a, b) => a[1] - b[1]);

/** The ARMORY's canvas class in the window (FG-30: no lobby button's class, `fx-lobby-<control>`, may equal it). */
export const ARMORY_VIEW_CLASS = 'fx-lobby-armory-view';

export class ForgeLobbyArmory {
  readonly canvas: HTMLCanvasElement;
  private readonly armory: ArmoryLike;
  /** The session's store (FG.R21): the screen's records, in memory only. */
  private readonly memory = new Map<string, string>();
  /** The type and kit chosen in this session, by side (what `Armory.open` takes). */
  private readonly held = new Map<string, { type: number; kit: Loadout }>();
  private sizes: Record<string, { width: number; height: number }> = {};
  private side: 'seal' | 'terrorist' | null = null;
  private prev: ReadonlySet<PadButton> | null = null;
  /** AM-2 (research 340 §2): the left stick's flick on the shared screen, as the original's dialog takes it. */
  private stick = new ArmoryStick();
  private reading = 0;
  private gone = false;
  private closing = false;

  constructor(private readonly o: ForgeLobbyArmoryOptions) {
    this.canvas = o.doc.createElement('canvas');
    this.canvas.className = ARMORY_VIEW_CLASS;
    this.canvas.width = 640;
    this.canvas.height = 448;
    const deps: ArmoryDeps = {
      clock: o.clock ?? ((): number => performance.now() / 1000),
      change: (exit, side) => {
        if (this.gone) return;
        this.held.set(side, { type: exit.type, kit: exit.kit });
        this.o.source()?.send(exit);
      },
      closed: () => { if (!this.gone && !this.closing) this.o.closed(); },
      store: { get: (k) => this.memory.get(k) ?? null, set: (k, v) => { this.memory.set(k, v); }, remove: (k) => { this.memory.delete(k); } },
      names: () => o.names(),
      device: () => 'pad',
      ...(o.sound ? { sound: o.sound } : {}),
    };
    this.armory = (o.make ?? ((d: ArmoryDeps) => new Armory(d)))(deps);
    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      this.tapAt(e.clientX, e.clientY);
    });
  }

  isOpen(): boolean { return this.armory.isOpen(); }

  /** Reads the source's data and opens the screen over it; false when it cannot (no source, no world, let go). */
  async open(): Promise<boolean> {
    if (this.gone || this.armory.isOpen()) return false;
    const src = this.o.source();
    if (!src) return false;
    const ticket = ++this.reading;
    const data = await src.data.catch((): null => null);
    if (this.gone || ticket !== this.reading || !data?.world) return false;
    this.sizes = { [ARMORY_WHITE]: { width: WHITE_TEXEL.width, height: WHITE_TEXEL.height } };
    for (const [n, rgba] of data.bitmaps) this.sizes[n.toLowerCase()] = { width: rgba.width, height: rgba.height };
    this.armory.setData(data);
    this.o.paint?.data(data);
    this.side = src.side;
    this.armory.setWorld({ arsenal: data.world.arsenal, valves: data.world.valves, side: src.side, map: this.o.map().toUpperCase(), archive: data.archive });
    this.prev = null;
    return this.armory.open(this.held.get(src.side) ?? null);
  }

  /** Once a frame while it is up: the screen stepped and drawn. */
  frame(dt: number): void {
    if (!this.armory.isOpen()) return;
    this.armory.frame(dt);
    if (!this.armory.isOpen()) return;
    const quads = this.armory.quads(this.sizes);
    this.o.paint?.draw(quads, this.armory.models(), this.canvas);
  }

  /**
   * The pad read this frame: a button of the sixteen down now and not at the read before is one press, through
   * `Armory.pad`; the first read after the opening only notes what is held (the press that chose ARMORY is no press).
   * AM-2 (research 340 §2): the left stick's flick is the d-pad press it stands for (`../../lobbyArmory` `ArmoryStick`):
   * armed from the first read on (a stick held as the screen opens is no flick, `ARMORY_STICK_ARMING_READING`), at each
   * read the screen takes input, and handed on in a frame with no press it reads (`ARMORY_STICK_SAME_FRAME_READING`).
   */
  pad(snap: PadSnapshot | null): void {
    const down = new Set<PadButton>();
    if (snap) for (const [name, i] of PAD_ORDER) if (snap.buttons[i]?.pressed) down.add(name);
    const was = this.prev;
    this.prev = down;
    // LATER 408: the stick as the pad leaves it -- the dead zone, the rescale and the circle, in the game's signs (x
    // positive left, y positive up: `../../menuInput` `menuStick`, `MENU_STICK_READING`), as the menus read it.
    const axis = (i: number): number => { const v = snap?.axes[i]; return typeof v === 'number' && Number.isFinite(v) ? v : 0; };
    const [sx, sy] = menuStick(axis(0), axis(1), this.o.deadZone?.() ?? LEFT_DEAD_ZONE);
    const flick = this.stick.read(sx, sy, was === null || !this.armory.isOpen() || this.armory.taking());
    if (!this.armory.isOpen() || was === null) return;
    const pressed = new Set([...down].filter((b) => !was.has(b)));
    if (pressed.size > 0) this.armory.pad(pressed);
    if (flick && ![...pressed].some((b) => ARMORY_PAD[b])) this.armory.input(flick);
  }

  /** A pointer at a client point: mapped into the 640 x 448 frame, the screen's tap. */
  tapAt(clientX: number, clientY: number): boolean {
    if (!this.armory.isOpen()) return false;
    const box = this.canvas.getBoundingClientRect();
    const buffer = this.o.paint?.buffer?.() ?? { width: this.canvas.width, height: this.canvas.height };
    const [fx, fy] = frameOfClient(clientX - box.left, clientY - box.top, box, buffer.width > 0 ? buffer : { width: this.canvas.width, height: this.canvas.height });
    if (!Number.isFinite(fx) || !Number.isFinite(fy)) return false;
    return this.armory.tap(fx, fy);
  }

  /** The side the screen was opened for, or null. */
  openedSide(): 'seal' | 'terrorist' | null { return this.armory.isOpen() ? this.side : null; }

  /** Closed by the page (the lobby launched, the window closing): no return to the lobby view is asked. */
  close(): void {
    this.closing = true;
    this.armory.close();
    this.closing = false;
  }

  /** Let go: an open still reading dropped, the screen closed without a return, the painter freed. */
  dispose(): void {
    this.gone = true;
    this.reading++;
    this.armory.close();
    this.o.paint?.dispose();
    this.canvas.remove();
  }
}
