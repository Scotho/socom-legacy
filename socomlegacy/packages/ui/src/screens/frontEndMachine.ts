import type { DialogDesign } from '../dialog';
import { buildDialogScreen, type BuildOptions } from '../compositor/dialogScreen';
import { FRAME_CLEAR_READING, type UiDrawItem } from '../compositor/drawList';
import type { UiNode, UiScreen } from '../compositor/scene';
import type { MovieService } from '../movie/movieCommands';
import { UiCommandHost } from '../uiCommands';
import { VALVE_TYPE, ValveStore } from '../valves';
import type { ZAnimRtSet, ZAnimTraceEvent } from '../zanimRuntime';
import { GameStateMachine, type GameState } from './gameStates';
import { menuStateOf, NETWORK_GUI_ELF, REBOOT_LAUNCH, type Launch } from './launch';
import { MenuQueue } from './menuQueue';
import { MenuShell, type MenuShellHost } from './menuShell';
import { DEFAULT_MENU_SCREEN, LoadState, MenuState, ShutdownState, type MapLoader } from './menuState';
import type { PopupSlot } from './popupSlot';
import type { BuiltDialog } from './dialogParts';
import { playListSets } from './createGameCommands';
import { ScreenCommands, type ScreenCommandsNet } from './screenCommands';
import { screenScripts } from './screenScripts';

/**
 * The front end assembled (PLAT-10; web research 115 §7-§9): the game object's state machine CG with the menu state,
 * the load state, the round's state and the shutdown state; M; the dialog host each menu-like state builds; the
 * screens' rows registered in PLAT-08's `UiCommandHost`; the reboot. What the page connects (`packages/viewer/src/
 * frontEnd.ts`): the dialogs and the zAnim sets off the disc, the build options (faces, captions, PLAT-21's movie
 * layer), PLAT-21's movie host, PLAT-12's clock (`frame(dt)` per tick, `frameSync`), and later PLAT-11's input,
 * PLAT-15's widgets, PLAT-16's popup (through `popups`), PLAT-23's sounds.
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/** The load state's dialog (`FUN_001f6660` builds its G on it through `CLoadMenu`'s start-dialog getter). */
export const LOAD_DIALOG = 'dlgLoad.rdr';

/**
 * MAP_LOAD_PLACEHOLDER: the load the load state starts (`FUN_001ebba0(CoreState, 1)`: a thread that loads the mission
 * named by `DAT_004364fc`). The front end entry loads no map yet -- the page's map load is the map viewer's and Play's
 * (the owner's default 3) -- so the load is done at once: `busy` is never true. [placeholder]
 */
export const MAP_LOAD_PLACEHOLDER = 'loaded at once' as const;
/**
 * CORE_STATE_PLACEHOLDER: the round (`CCoreState`, 0x4085d0, Tick 0x1ebed0) is not reached from the front end entry: a
 * state whose Init succeeds and whose Tick does nothing stands in, so a `LOAD_SCREEN` ends on a black frame. The round
 * and its end-of-round states (ExitState, MPExitState, pushed over it) are sprint 11+'s and the online lane's.
 * [placeholder]
 */
export const CORE_STATE_PLACEHOLDER = 'idle' as const;
/**
 * LOAD_STATE_SCRIPTS_PLACEHOLDER: the load state's G opens the map's `run/ldzanim.zar` (`FUN_001f6660` D:L55819,
 * `FUN_00267e70(0x414bb0, 0x3e2f90)`); with no map loaded the front end has none, and `dlgLoad.rdr` runs no script.
 * INT-LOADING's interim screen (`packages/viewer/src/loadingAssets.ts`) reads it for the map viewer's own loads.
 * [placeholder]
 */
export const LOAD_STATE_SCRIPTS_PLACEHOLDER = 'none' as const;

/**
 * FRONT_END_ENTRY_READING: the page's address parameter that names the front end's start dialog -- `menuflow` (absent or
 * bare: the menu state on its default dialog, `dlgIntroScreen.rdr`; `menuflow=<dialog>.rdr`: that dialog, as the boot
 * option `--menu_state` names one, `FUN_001eabd0`). It no longer opens the menus: since OT.R19 (the owner, 2026-10-04)
 * the page's base path is the front end with no parameter, and the map viewer and the match are the page at `/testroom`.
 * A browser adaptation with no original; named by the owner's words of 2026-10-02 ("put the menus being &menuflow
 * param", OT.R9 of the online path's plan; renamed from PLAT-10's `frontend`, the old name is not kept). The address's
 * path mirrors the menu flow (OT.R10, `../routes`). Declared here, with the front end, so the page's
 * entry (`packages/viewer/src/frontEnd.ts`) holds no stand-in of its own. [reading]
 */
export const FRONT_END_ENTRY_READING = 'menuflow' as const;
/** The parameter's name as the page reads it. */
export const FRONT_END_PARAM: string = FRONT_END_ENTRY_READING;

const placeholderCore = (): GameState => ({ name: 'CoreState', init: () => true, tick: () => {}, unInit: () => {} });
const placeholderLoader = (): MapLoader => ({ start: () => {}, busy: () => false });

/** PLAT-21's movie host as the front end calls it (`packages/viewer/src/moviePlayerHost.ts` meets it). */
export interface FrontEndMovie {
  /** The movie commands' interface (OnCover / OnPop's background off / on). */
  service: MovieService;
  /** `CMenuState_Tick` (1): one movie frame; `'movie'` while the pushed movie runs. */
  frame(dt: number): 'menu' | 'movie';
  /** The dialog unload's movie part. */
  unload(): void;
  /** Build step 9: the dialog's background (`BACKGROUND TYPE MPEG`: opened, else ONMPEGEND at once). */
  load(background: DialogDesign['background']): void;
}

export interface FrontEndMachineOptions {
  /** A dialog by name (`data/common/zrdr/dialog/<name>`: READERC's, then READERX's), null when not on the disc. */
  dialog(name: string): DialogDesign | null;
  /** `run/uizanim.zar`'s sets (the menu state's zAnim archive). */
  sets?: readonly ZAnimRtSet[];
  /** The valves each launch starts with (the persistent ones are the card's, research 104). */
  valves?: () => ValveStore;
  /** PLAT-08's host, other modules' rows already set; the screens' rows are registered into it at each boot. */
  host?: UiCommandHost;
  /** PLAT-14's build options (faces, captions, textures, the movie layer). */
  build?: BuildOptions;
  popups?: PopupSlot;
  /**
   * Each dialog built (steps 2-7, before its scripts start): what the front end keeps beside the node tree -- the
   * popup's context, the widgets (`DialogPartsHost.built`).
   */
  built?: (b: BuiltDialog) => void;
  /** The dialog host's draw list completed (`MenuShellHost.draw`; `DialogPartsHost.draw`). */
  draw?: (screen: UiScreen, items: UiDrawItem[]) => UiDrawItem[];
  movie?: FrontEndMovie;
  /** The dialog host's optional calls (`MenuShellHost`): PLAT-11's input, PLAT-15's widgets, PLAT-23's sounds. */
  input?: () => void;
  pad?: () => void;
  setEnabled?: (node: UiNode, enabled: boolean) => void;
  activate?: (name: string) => void;
  widgetsTick?: (step: number) => void;
  focusTick?: (step: number, popupHidden: boolean) => void;
  playBack?: () => void;
  playMetal?: () => void;
  /** CloseAndSwitch's loading picture (`RUN\RAW\LOADING.RAW`). */
  showLoadingPicture?: () => void;
  /** PLAT-12's `UiClock.frameSync` (`STATE_CHANGE_FRAME_SYNC_READING`). */
  frameSync?: () => void;
  core?: GameState;
  loader?: MapLoader;
  /**
   * SA-43c: the menu state's tick step (6), the system messages drained (`MenuStateOptions.systemMessages`; the page's
   * `BriefingRoomChat.systemMessages`). Absent, none.
   */
  systemMessages?: () => void;
  random?: () => number;
  /** PLAT-07's runtime trace of every dialog's scripts (`ZAnimTraceEvent`), for the sequence tests and the page's log. */
  trace?: (e: ZAnimTraceEvent) => void;
  /** `--menu_state` (`FUN_001eabd0`): the first launch's start dialog; absent, `DEFAULT_MENU_SCREEN`. */
  startDialog?: string;
  /** Every `LoadExecPS2` the game makes (the reboot, the shutdown), before the browser relaunches. */
  onLaunch?: (l: Launch) => void;
  online?: () => ScreenCommandsNet;
}

/**
 * RELAUNCH_VALVES_READING: what of the valve registry a relaunch keeps. On the console `LoadExecPS2` replaces the
 * process: the registry (0x49e800) is made anew -- `CValve_Open` reads `global_valves.rdr` at PERM (`FUN_00351d40`
 * D:L250922-250959), the card's `PersistentValves` come back through `load_initial_config` (`memcard_have_loaded_config`
 * is 0 PERM in that table), and a valve no table names exists only once a script's parse makes it TEMP (research 104
 * §6). The page keeps one store across launches (the opener's, a session's settings in it) and loads neither the table
 * nor the card at a relaunch (OPT-02's, BOOT-05's): so it drops what no new process could hold -- every TEMP valve
 * (`FUN_00352500`'s teardown by type, D:L251228-251308), `StartMusic`, `AreYouSure` and the scripts' others among them
 * -- and keeps the PERM and PERSIST ones as they stand; the twelve of `global_valves.rdr` the online menu reads are
 * seeded again by its mount (`seedWorldOfSocomValves`). The console's relaunch also re-reads the card on
 * `dlgAfterErrorReboot` (its loading popup, #842); the page, with `memcard_have_loaded_config` kept at 1, does not.
 * [reading]
 */
export const RELAUNCH_VALVES_READING = 'TEMP valves dropped; PERM and PERSIST kept; no global_valves.rdr, no card re-read' as const;

export class FrontEndMachine {
  queue!: MenuQueue;
  states!: GameStateMachine;
  menu!: MenuState;
  load!: LoadState;
  core!: GameState;
  shutdown!: ShutdownState;
  commands!: ScreenCommands;
  valves!: ValveStore;
  readonly host: UiCommandHost;
  private pending: Launch | null = null;

  constructor(private readonly o: FrontEndMachineOptions) {
    this.host = o.host ?? new UiCommandHost();
  }

  /** The dialog host built now (`DAT_00414e40`): the top state's. */
  shell(): MenuShell | null {
    if (!this.states) return null;                                                // before the first boot (the opener's loader phase)
    const top = this.states.top();
    if (top === this.menu) return this.menu.shell;
    if (top === this.load) return this.load.shell;
    return null;
  }

  /** Whether the disc has the dialog (the lookup the host opens by): the routes ask before a deep link replays one. */
  hasDialog(name: string): boolean {
    return this.o.dialog(name) !== null;
  }

  private shellHost(sets: readonly ZAnimRtSet[]): MenuShellHost {
    const o = this.o;
    return {
      open: (name) => o.dialog(name),
      build: (design, name) => {
        const screen = buildDialogScreen(design, o.build);
        const scripts = screenScripts({ design, screen, sets, valves: this.valves, host: this.host, dialog: name, random: o.random, trace: o.trace });
        o.built?.({ design, screen, scripts, valves: this.valves });
        return { screen, scripts };
      },
      states: {
        loadScreen: () => this.states.switchTo(this.load),
        popToMenu: () => { this.states.pop(0); this.states.switchTo(this.menu); },
        menuScreen: () => this.states.switchTo(this.menu),
        shutdown: () => this.states.switchTo(this.shutdown),
      },
      reboot: () => this.launch({ elf: REBOOT_LAUNCH.elf, argv: [...REBOOT_LAUNCH.argv] }),
      input: o.input, setEnabled: o.setEnabled, activate: o.activate, widgetsTick: o.widgetsTick, focusTick: o.focusTick,
      playMetal: o.playMetal, draw: o.draw,
      onUnload: o.movie ? () => o.movie!.unload() : undefined,
      onBuilt: o.movie ? (d) => o.movie!.load(d.background) : undefined,
    };
  }

  /**
   * A launch (boot, or the relaunch after a reboot): M, CG and the states made new, the screens' rows registered, MS
   * on `startDialog`, and CG's first request -- the switch to MS (`FUN_002d04d0` D:L172888-172896) -- queued.
   */
  boot(startDialog: string = this.o.startDialog ?? DEFAULT_MENU_SCREEN): void {
    const o = this.o;
    this.valves = o.valves?.() ?? new ValveStore();
    this.queue = new MenuQueue();
    this.states = new GameStateMachine({ frameSync: o.frameSync });
    this.core = o.core ?? placeholderCore();
    const menuHost = this.shellHost(playListSets(o.sets ?? []));            // PLAY_LIST_NO_MEDLEY_ROW_READING (CREATE GAME's PLAY LIST)
    this.menu = new MenuState({
      queue: this.queue, shellHost: menuHost, popups: o.popups, toLoad: () => this.states.switchTo(this.load),
      movie: o.movie?.service, movieFrame: o.movie ? (dt) => o.movie!.frame(dt) : undefined, pad: o.pad,
      ...(o.systemMessages ? { systemMessages: o.systemMessages } : {}),   // SA-43c
    });
    this.menu.startDialog = startDialog;
    const loadHost = this.shellHost([]);                                      // LOAD_STATE_SCRIPTS_PLACEHOLDER
    this.load = new LoadState({
      shell: () => { const g = new MenuShell(this.queue, loadHost, o.popups); g.start(LOAD_DIALOG); return g; },
      loader: o.loader ?? placeholderLoader(),
      toCore: () => this.states.switchTo(this.core), toMenu: () => this.states.switchTo(this.menu), pad: o.pad,
    });
    this.shutdown = new ShutdownState({ launch: (l) => this.launch(l) });
    this.commands = new ScreenCommands({
      queue: this.queue, shell: () => this.shell(), menu: this.menu, load: this.load,
      states: { pop: (arg) => this.states.pop(arg), switchToMenu: () => this.states.switchTo(this.menu) },
      inputString: (cmd) => this.shell()?.inputString(cmd.anim) ?? null,
      playBack: o.playBack, showLoadingPicture: o.showLoadingPicture, online: o.online,
    });
    this.commands.register(this.host);
    this.states.switchTo(this.menu);
  }

  /** `LoadExecPS2`: reported, then applied at the end of the frame (the console never returns from it). */
  private launch(l: Launch): void {
    this.o.onLaunch?.(l);
    this.pending = l;
  }

  /**
   * One frame of CG (`FUN_002ce9e0`) with the frame's `dt` (PLAT-12's tick); a launch made during it relaunches after
   * it. Answers the frame's draw list: the menu or load state's, else a cleared frame.
   */
  frame(dt: number): UiDrawItem[] {
    this.states.tick(dt);
    const l = this.pending;
    if (l) {
      this.pending = null;
      this.relaunch(l);
    }
    const top = this.states.top();
    if (top === this.menu) return this.menu.frame;
    if (top === this.load) return this.load.frame;
    return [{ kind: 'clear', rgb: [...FRAME_CLEAR_READING] }];
  }

  /**
   * The browser's relaunch (research 115 §9: "reset every state to the boot state and open MS on the dialog named by
   * `--menu_state`"): the open dialog's movie and scripts released, then a new boot on the launch's `--menu_state`.
   * The network GUI is not run (NETWORK_GUI_PLACEHOLDER): its own launch of the game, with the arguments after its ELF's,
   * is taken at once.
   */
  private relaunch(l: Launch): void {
    const argv = l.elf === NETWORK_GUI_ELF ? l.argv.slice(2) : l.argv;
    this.shell()?.unload();
    this.valves?.remove(VALVE_TYPE.TEMP);                                         // RELAUNCH_VALVES_READING
    this.boot(menuStateOf(argv) ?? DEFAULT_MENU_SCREEN);
  }
}

