import type { DialogDesign } from '../dialog';
import type { UiDrawItem } from '../compositor/drawList';
import { FrontEndMachine, type FrontEndMachineOptions, type FrontEndMovie } from '../screens/frontEndMachine';
import { DEFAULT_MENU_SCREEN } from '../screens/menuState';
import { UiCommandHost } from '../uiCommands';
import { ValveStore } from '../valves';
import type { WidgetPad } from '../widgets/pad';
import { BootStubs, type BootStubName } from './bootBindings';
import { LoaderScreens, composeLoaderFrame, type LoaderFrame } from './loaderScreens';
import { fireScreenButtons } from './screenButtons';

/**
 * The opener (BOOT-04; web research 139): the game's boot from the loader's raw screens to the main menu's first frame,
 * in the original's order --
 *
 * 1. the loader (`SCUS_972.75`): PULOADGP, then LOADING (BOOT-02's `LoaderScreens`, research 130);
 * 2. the game ELF's menu state on its default dialog `dlgIntroScreen.rdr` (`FUN_001e7530`, 02-boot B7; PLAT-10's
 *    `FrontEndMachine`, research 115 §7): its ONSTART `do_onstart` -- the controller check, `intro_onstart`'s card
 *    checks and `load_initial_config`, the HDD branch -- then `SWITCHMENU dlgIntroCinematic.rdr` (research 96 §3.2;
 *    the ops in research 139 §2; the bindings they call answered by `BootStubs`);
 * 3. `dlgIntroCinematic`: `sony448.pss` as its `BACKGROUND TYPE MPEG` (PLAT-21's player, research 121 §10); at its end
 *    event 3 -> `switch_menu dlgSecondCinematic.rdr`;
 * 4. `dlgSecondCinematic`: `Intro_2.pss`; its end -> `goto_menu_silent dlgMenu.rdr`, or any of its thirteen keys ->
 *    `goto_menu dlgMenu.rdr` (`fireScreenButtons`);
 * 5. `dlgMenu` over `menuloop.pss`: the main menu, MENU-02a's from here.
 *
 * Every transition is the scripts' own through PLAT-07's runtime and PLAT-10's manager (the switch's fade to black,
 * `menu_fade_up`, the popups' dims); nothing here times a step. The clock is the caller's (`frame(dt)`, PLAT-12's
 * tick); the input is the caller's (`input` and `pad`: PLAT-11's dispatcher and reader; a test's `tap` fires the screen's
 * BUTTON bindings alone); the movie is PLAT-21's host.
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/** What the opener reports as it goes (the sequence test pins the order; the page logs it). */
export type OpenerEvent =
  /** The loader's phase changed (`LoaderFrame.phase`). */
  | { kind: 'loader'; phase: string; t: number }
  /** The game's boot: the loader is done, the menu state is switched to. */
  | { kind: 'game'; t: number }
  /** The shell built a dialog (its name as `G+0x8e0` holds it after the build). */
  | { kind: 'dialog'; name: string; t: number }
  /** A switch began (`FUN_00365a00` state 3: the target stored, the fade to black starts). */
  | { kind: 'switch'; target: string; t: number }
  /** A dialog's movie background loaded (build step 9). */
  | { kind: 'movie'; file: string | null; t: number }
  /** A stubbed binding answered. */
  | { kind: 'stub'; name: BootStubName; arg: string; answer: boolean; t: number }
  /** A BUTTON binding of the screen fired (the key the script names). */
  | { kind: 'button'; t: number };

export interface OpenerOptions extends Omit<FrontEndMachineOptions, 'valves' | 'host' | 'startDialog'> {
  /** The loader's screens (BOOT-02's); `null` for none (a deep link lands past the boot; the routes' replay). */
  loaderScreens?: LoaderScreens | null;
  /**
   * A test's pad record this frame (`WidgetPad`: the bytes per button code), or null for none: the step-4 call
   * (`SCREEN_BUTTONS_STEP_READING`) fires on it alone. The page's input is the machine's `input` and `pad` (PLAT-11's
   * dispatcher and reader), run first on every frame; absent, the step-4 call is the only input.
   */
  tap?: () => WidgetPad | null;
  /** The valves every launch starts with. */
  valves?: ValveStore;
  /** PLAT-08's host; the stubs and the screens' rows are registered into it. */
  host?: UiCommandHost;
  onEvent?: (e: OpenerEvent) => void;
}

/** The boot's phases. */
export type OpenerPhase = 'loader' | 'game';

export class Opener {
  readonly machine: FrontEndMachine;
  readonly host: UiCommandHost;
  readonly valves: ValveStore;
  readonly stubs: BootStubs;
  readonly loader: LoaderScreens | null;
  phase: OpenerPhase;
  /** Seconds since the opener started (the sum of the frames' dt). */
  t = 0;
  /** Frames run. */
  ticks = 0;
  private lastLoaderPhase = '';
  private lastDesign: DialogDesign | null = null;
  /** Without a movie host the build is seen from the shell's design after the frame; with one, from its step 9. */
  private readonly reportBuilds: boolean;
  private lastSwitchTarget = '';
  private readonly onEvent?: (e: OpenerEvent) => void;

  constructor(o: OpenerOptions) {
    this.onEvent = o.onEvent;
    this.valves = o.valves ?? new ValveStore();
    this.host = o.host ?? new UiCommandHost();
    this.loader = o.loaderScreens === undefined ? new LoaderScreens() : o.loaderScreens;
    this.phase = this.loader ? 'loader' : 'game';
    this.stubs = new BootStubs({ valves: this.valves, log: (name, arg, answer) => this.emit({ kind: 'stub', name, arg, answer, t: this.t }) });
    this.stubs.register(this.host);
    // Build step 9 (after ONSTART, D:L263745-263764): the dialog is built -- the event, then its movie's.
    const movie: FrontEndMovie | undefined = o.movie && {
      ...o.movie,
      load: (bg: DialogDesign['background']) => {
        // At MS's Init the state is not yet CG's top (`stack[index] = S` follows a successful Init): the menu's shell is read directly.
        this.emit({ kind: 'dialog', name: this.machine.menu.shell?.currentName ?? this.machine.load.shell?.currentName ?? '', t: this.t });
        o.movie!.load(bg);
        this.emit({ kind: 'movie', file: bg && bg.type !== 0 ? bg.filename : null, t: this.t });
      },
    };
    this.reportBuilds = !o.movie;
    const { loaderScreens: _l, tap: _p, onEvent: _e, input, ...rest } = o;
    this.machine = new FrontEndMachine({
      ...rest, valves: () => this.valves, host: this.host, movie,
      input: () => { input?.(); this.input(o.tap?.() ?? null); },
    });
    if (!this.loader) this.machine.boot(DEFAULT_MENU_SCREEN);
  }

  private emit(e: OpenerEvent): void { this.onEvent?.(e); }

  /** A1's input (`FUN_00368650`), step 4 alone (`SCREEN_BUTTONS_STEP_READING`): the shell's BUTTON bindings against the pad. */
  private input(pad: WidgetPad | null): void {
    const g = this.machine.shell();
    if (!pad || !g || !g.design) return;
    if (fireScreenButtons(g.design.bindings, pad, (animation, argument) => g.startBinding(animation, argument))) this.emit({ kind: 'button', t: this.t });
  }

  /** The loader's frame now (null once the game runs). */
  loaderFrame(): LoaderFrame | null { return this.phase === 'loader' && this.loader ? this.loader.frame(this.t) : null; }

  /**
   * The boot entered past the loader (the routes' deep-link replay booted the machine itself): the loader's screens are
   * skipped and the game's frames run from the next call.
   */
  skipLoader(): void {
    if (this.phase === 'game') return;
    this.phase = 'game';
    this.emit({ kind: 'game', t: this.t });
  }

  /** One frame of `dt` seconds: the loader's draw list while it runs, then the game's (`FrontEndMachine.frame`). */
  frame(dt: number): UiDrawItem[] {
    if (this.phase === 'loader' && this.loader) {
      if (!this.loader.done(this.t)) {
        const f = this.loader.frame(this.t);
        if (f.phase !== this.lastLoaderPhase) { this.lastLoaderPhase = f.phase; this.emit({ kind: 'loader', phase: f.phase, t: this.t }); }
        this.t += dt;
        this.ticks++;
        return composeLoaderFrame(f);
      }
      this.phase = 'game';
      this.emit({ kind: 'game', t: this.t });
      this.machine.boot(DEFAULT_MENU_SCREEN);
    }
    const out = this.machine.frame(dt);
    this.t += dt;
    this.ticks++;
    const g = this.machine.shell();
    if (g) {
      if (g.switchState < 0) this.lastSwitchTarget = '';
      else if (g.currentName !== this.lastSwitchTarget) { this.lastSwitchTarget = g.currentName; this.emit({ kind: 'switch', target: g.currentName, t: this.t }); }
      if (this.reportBuilds && g.design !== this.lastDesign) { this.lastDesign = g.design; if (g.design) this.emit({ kind: 'dialog', name: g.currentName, t: this.t }); }
    }
    return out;
  }
}
