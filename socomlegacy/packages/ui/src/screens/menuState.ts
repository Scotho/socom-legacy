import { DIALOG_EVENTS } from '../dialog';
import type { UiDrawItem } from '../compositor/drawList';
import type { MovieService } from '../movie/movieCommands';
import { f32, fadd, fdiv, fmul, fsub } from '../text/f32';
import type { GameState } from './gameStates';
import { shutdownLaunch, NTGUI_RETURN_LAN_PLACEHOLDER, type Launch } from './launch';
import type { MenuQueue } from './menuQueue';
import { MenuShell, type MenuShellHost } from './menuShell';
import type { PopupSlot } from './popupSlot';

/**
 * The front end's game states (PLAT-10; web research 115 §7, §8.2): the menu state MS (`CMenuState`, 0x408538), the
 * load state (0x4085ac) between the front end and the round, and the shutdown state (0x408758). Each is a `GameState`
 * of CG (`./gameStates`). `D:L<line>` = a line of `socom2_game.elf.decomp.c`.
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries). The clock is the caller's (W9.R10).
 */

/** MS+0x30 as the game object's constructor writes it (`FUN_001e7530` D:L47915-47968 through `FUN_001e7b50` D:L48146-48153). */
export const DEFAULT_MENU_SCREEN = 'dlgIntroScreen.rdr';
/** OnPop's event (`FUN_001f45e0` D:L54773 fires `ON_STATE_POP`, 0xd). */
export const ON_STATE_POP = DIALOG_EVENTS.ON_STATE_POP!;
/** OnPop's MS+0x10 = 2 (D:L54774): two frames swapped with `zVid_Swap(0, 1)` (`ZVID_SWAP_ARG_READING`). */
export const MENU_STATE_POP_HOLD = 2;

// ---------------------------------------------------------------------------------------------------------------------
// The menu state.

export interface MenuStateOptions {
  /** M. */
  queue: MenuQueue;
  /** What the dialog host calls (`MenuShellHost`). */
  shellHost: MenuShellHost;
  popups?: PopupSlot;
  /** CG switch to the load state (`FUN_002cf410(.., 0x4085ac)`), for an Init with MS+0xc set. */
  toLoad: () => void;
  /** PLAT-21's movie interface: OnCover's `FUN_00366b10` (off) and OnPop's `FUN_00366a00(G, 0)` (on). */
  movie?: MovieService;
  /**
   * Tick step (1), `FUN_00366940`: the background movie's frame, with the movie state PLAT-21's host runs in place of a
   * pushed state (`MoviePlayerHost.frame`): `'movie'` -- the pushed movie ran and the menu does not this frame.
   */
  movieFrame?: (dt: number) => 'menu' | 'movie';
  /** Tick step (2): the pad (`FUN_002d9e40` -> `FUN_002da930`; PLAT-11). */
  pad?: () => void;
  /**
   * Tick step (6): in the original, the lobby's line queue (0x437690) drained to the screen's line call `FUN_001f4d20`
   * (the frame 0x1f4640, its dequeue 0x1f46b8-0x1f46ec: chat lines, the flag 1; the page hands those lines on at the
   * poll's reply instead, `BriefingRoomChat.received`). SA-43c: the page's `BriefingRoomChat.systemMessages` runs here --
   * each server system message of the flag 2 raised as MP_SYSTEM_MESSAGE. That placement is the page's: the original
   * raises it from the network callback (`FUN_0030dce0` calling the state's +0x2c directly, D:L210394), not from this
   * step; the page's raise is at most a frame later (`SYSTEM_MESSAGE_STATE_READING`). The behaviour is the same either way.
   */
  systemMessages?: () => void;
}

/** `CMenuState` (vtable 0x405010). */
export class MenuState implements GameState {
  readonly name = 'MenuState';
  /** MS+0x30: the dialog Init builds (`SetDefaultMenuScreen`, `--menu_state` and the boundary rows write it). */
  startDialog = DEFAULT_MENU_SCREEN;
  /** MS+0xc (0x408544): Init goes straight to the load state. */
  loadPending = false;
  /** MS+8: G, null outside Init..UnInit. */
  shell: MenuShell | null = null;
  /** MS+0x10. */
  swapHold = 0;
  /** The last frame's `zVid_Swap` first argument (`ZVID_SWAP_ARG_READING`). */
  swap: 0 | 1 = 1;
  /** The last frame's draw list (steps 7-9). */
  frame: UiDrawItem[] = [];

  constructor(private readonly o: MenuStateOptions) {}

  /** `FUN_001f4860` (D:L54778-54914): G built on MS+0x30 (`FUN_00368570`), MS+0x10 = 0; with MS+0xc, the load state instead. Answers 1. */
  init(): boolean {
    if (this.loadPending) { this.o.toLoad(); return true; }
    this.shell = new MenuShell(this.o.queue, this.o.shellHost, this.o.popups);
    this.shell.start(this.startDialog);
    this.swapHold = 0;
    return true;
  }

  /** 0x1f4640: (1) the movie, (2) the pad, (5) G's tick, (6) the system messages, (7)-(9) the draw, (11) the swap. */
  tick(dt: number): void {
    if (this.o.movieFrame?.(dt) === 'movie') return;
    this.o.pad?.();
    this.shell?.tick(dt);
    this.o.systemMessages?.();
    this.frame = this.shell?.draw() ?? [];
    if (this.swapHold > 0) { this.swapHold -= 1; this.swap = 0; } else this.swap = 1;
  }

  /** `FUN_001f4440` (D:L54706-54747): G destroyed, M flushed with its popup (`FUN_0027edf0(M, 1)`). */
  unInit(): void {
    this.shell?.unload();
    this.shell = null;
    this.o.queue.flush(true);
  }

  /** 0x1f4630: `FUN_00366b10(G)`, the background movie stopped. */
  onCover(): void { this.o.movie?.background.off(); }

  /** `FUN_001f45e0` (D:L54766-54775): the background movie restarted, then the pop's event and hold. */
  onPop(_arg = 0): void {
    this.o.movie?.background.on();
    this.statePop();
  }

  /** OnPop's second half: `ON_STATE_POP` fired into G and MS+0x10 = 2 (what PLAT-21's host calls after its movie). */
  statePop(): void {
    this.shell?.event(ON_STATE_POP);
    this.swapHold = MENU_STATE_POP_HOLD;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// The load state.

/** Each ramp's length: 0.5 s (D:L55669-55672, D:L55752-55756). */
export const LOAD_FADE_SECONDS = f32(0.5);

/** The map load the load state starts (`FUN_001ebba0(CoreState, 1)` D:L50633-50662) and waits on (CoreState+0xb4). */
export interface MapLoader {
  /** Starts the load; `busy` answers true from here (the flag is set before the thread starts, D:L50642). */
  start(): void;
  /** CoreState+0xb4 (`DAT_00408684`): cleared by the load thread's end (`FUN_001ebda0` D:L50735). */
  busy(): boolean;
}

export interface LoadStateOptions {
  /** Init's G: a `CLoadMenu` built on `dlgLoad.rdr` (`FUN_001f6660` D:L55813-55825). */
  shell: () => MenuShell;
  loader: MapLoader;
  /** CG switch to the round's state (`FUN_002cf410(.., 0x4085d0)`, D:L55753). */
  toCore: () => void;
  /** CG switch to MS (D:L55782), on an abort. */
  toMenu: () => void;
  /** The pad (`FUN_002d9e40`, D:L55597). */
  pad?: () => void;
}

/**
 * The load state, offline (`FUN_001f6660` Init, `FUN_001f5e70` Tick): a 0.5 s fade in, the map load, a 0.5 s fade out,
 * the switch to the round. The online branches (`DAT_0045a0c1` set: the lobby's game state, the host's report, the
 * network error paths that set the abort flag) are the online lane's and not modelled.
 */
export class LoadState implements GameState {
  readonly name = 'LoadState';
  /** +0x1a: AbortLoad or a network error; the next tick switches back to MS. */
  abort = false;
  /** +0xc, +0xd: fading in, fading out; +0x10 the ramp's time; +0x18 the load started; +0x19 not yet started. */
  fadingIn = false;
  fadingOut = false;
  t = 0;
  private started = false;
  private first = true;
  shell: MenuShell | null = null;
  frame: UiDrawItem[] = [];

  constructor(private readonly o: LoadStateOptions) {}

  /** `FUN_001f6660` (D:L55787-55877), offline: the abort cleared, G built, the flags set. Answers 1. */
  init(): boolean {
    this.abort = false;
    this.shell = this.o.shell();
    this.fadingIn = true;
    this.fadingOut = false;
    this.t = 0;
    this.started = false;
    this.first = true;
    return true;
  }

  private setAlpha(f: number): void {
    const clamped = f > 1 ? 1 : f < 0 ? 0 : f;                                  // D:L55673-55676
    if (this.shell) this.shell.faderAlpha = fmul(fsub(1, clamped), 128);
  }

  /** `FUN_001f5e70` (D:L55583-55784), offline. */
  tick(dt: number): void {
    this.o.pad?.();
    // D:L55599: an abort waits while the map load it started still runs (CoreState+0xb5 and +0xb4, both set by the start).
    if (this.abort && !(this.started && this.o.loader.busy())) { this.o.toMenu(); return; }
    if (!this.fadingOut && !this.o.loader.busy() && !this.first) {              // D:L55601-55604
      this.fadingOut = true;
      this.t = 0;
    } else if (!this.fadingIn && !this.started && !this.fadingOut) {            // D:L55606-55612
      this.started = true;
      this.first = false;
      this.o.loader.start();
    }
    if (this.fadingIn) {                                                       // D:L55666-55679
      this.t = fadd(this.t, f32(dt));
      if (this.t > LOAD_FADE_SECONDS) { this.t = LOAD_FADE_SECONDS; this.fadingIn = false; }
      this.setAlpha(fdiv(this.t, LOAD_FADE_SECONDS));
    }
    if (this.fadingOut) {                                                      // D:L55748-55762
      this.t = fadd(this.t, f32(dt));
      if (this.t > LOAD_FADE_SECONDS) { this.o.toCore(); return; }
      this.setAlpha(fsub(1, fdiv(this.t, LOAD_FADE_SECONDS)));
    }
    this.shell?.tick(dt);                                                      // D:L55767-55768
    this.frame = this.shell?.draw() ?? [];
  }

  /** `FUN_001f5d40` (D:L55538-55564): G destroyed. */
  unInit(): void {
    this.shell?.unload();
    this.shell = null;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// The shutdown state.

/** `ShutdownState` (0x408758): Init `FUN_0022ea70` launches the network setup GUI and answers 1. */
export class ShutdownState implements GameState {
  readonly name = 'ShutdownState';
  constructor(private readonly o: { launch: (l: Launch) => void; lan?: () => boolean }) {}
  init(): boolean {
    this.o.launch(shutdownLaunch(this.o.lan?.() ?? NTGUI_RETURN_LAN_PLACEHOLDER));
    return true;
  }
  tick(): void {}
  unInit(): void {}
}
