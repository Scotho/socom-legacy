import type { Libmc } from '@s2u/card';
import {
  buildDialogScreen, CardCommands, DialogPartsHost, INPUT_STRING, MENU_SWITCH_COUNTDOWN, MenuCommands, MenuInput, MenuQueue,
  MenuShell, NO_PAD, OPTIONS_DIALOGS, OPTIONS_MENU, OPTIONS_PRESETS, OptionsCommands, PopupSlot, PREVIOUS_SCREEN,
  ScreenCommands, screenScripts, UiClock, VALVE_TYPE, isVideoPictureDesign, selectVideoPicture, type VideoPicture,
  type CardConfigFile, type OptionGlobals, type PadSlotName, type PadSnapshot, type ScreenScripts, type UiDrawItem, type UiSoundCues,
  type UiVarManager, type ValveStore,
} from '@s2u/ui';
import { UiCommandHost } from '@s2u/ui';
import type { ControllerConfigs } from './controllerConfigs';
import type { FrontEndDisc } from './frontEnd';
import { SETTINGS_ADVANCED_GATE, settingsAdvancedGate, type SettingsAdvancedTab } from './settingsAdvanced';
import type { UiTextures } from './uiCompositorView';

/** MLS.R1/R7 browser adaptation: Options has its own shell, queue, popups and input over the live match.
 * Only the original's state and card serializer are shared. No menu state, movie, network or mission is constructed.
 */
export interface NativeOptionsState {
  valves: ValveStore;
  uiVars: UiVarManager;
  globals: OptionGlobals;
  configs?: ControllerConfigs;
  libmc: Libmc | null;
  config: CardConfigFile;
  /**
   * #481 menu plumbing: the page's SCREEN POSITION hook (`OptionsCommands`' `screenOrigin`), as the front end's: every
   * StoreOptions lays the origin, which moves the match's drawn frame too (`./screenOrigin` SCREEN_ORIGIN_CANVASES).
   */
  screenOrigin?: (x: number, y: number) => void;
  /** #481 menu plumbing: the page's VIDEO MODE picture (OT.R79), as the front end's; the match follows it (`./matchMount`). */
  picture?: { get(): VideoPicture; set(picture: VideoPicture): void };
  /** The running page/session ends; modal close intentionally keeps its live settings. */
  dispose?(): void;
}

export interface NativeOptionsAssets {
  disc: FrontEndDisc;
  textures: UiTextures;
}

/**
 * The dialogs the in-match Options open. VIDEO's SCREEN POSITION page (`dlgScreenAdjust.rdr`, OPT-12) is one: off this
 * list a SwitchMenu closes Settings, so the main menu's page was unreachable over a match (#481's rendered slot).
 */
export const NATIVE_OPTIONS_DIALOGS = [...OPTIONS_DIALOGS, OPTIONS_PRESETS, 'dlgScreenAdjust.rdr'];

/** Validate the whole reachable chain before showing any page: never strand a player on an empty dialog. */
export function nativeOptionsMissing({ disc, textures }: NativeOptionsAssets): string[] {
  const missing: string[] = [];
  const sets = new Set(disc.sets.map(s => s.name.toLowerCase()));
  for (const name of NATIVE_OPTIONS_DIALOGS) {
    const design = disc.dialog(name);
    if (!design) { missing.push(name); continue; }
    for (const script of design.scripts) if (!sets.has(script.toLowerCase())) missing.push(script);
    if (design.font && !disc.faces.some(f => f.name.toLowerCase() === design.font!.toLowerCase())) missing.push(design.font);
  }
  for (const name of ['font_text_01.tif', 'font_special_01.tif', 'font_titlebar_01.tif', 'op_background.tif', 'op_slider.tif', 'op_knob.tif']) {
    if (!textures(name)) missing.push(name);
  }
  if (!disc.captions) missing.push('Options captions');
  return [...new Set(missing)];
}

/**
 * SAVE_ON_RETURN_ADAPTATION (the owner, 2026-10-29: "please automatically save settings from the in-match settings
 * screen by default with exiting the normal way"): RETURN's own save chain, `MC_save_and_leave` (research 302 §4), answered
 * by the host -- #831 "save?" YES (button 1), #830 the slot, SLOT 1 (button 1), #857 "overwrite?" YES (button 2; its
 * default is NO) -- so the card is written by the disc's save and serialiser, the questions neither drawn nor heard.
 * Any other question in the chain (a card that cannot be written) is the player's, drawn and answered as the original's.
 * Not the original's: it asks.
 */
export const SAVE_ON_RETURN_ADAPTATION: Readonly<Record<number, 1 | 2>> = { 831: 1, 830: 1, 857: 2 };
/** The chain's own notices without buttons, hidden with it: #829 (the slot), #832 (checking), #834/#835 (saving, saved). */
export const SAVE_ON_RETURN_NOTICES: readonly number[] = [829, 832, 834, 835];

/**
 * OPTIONS_RETURN_WAIT_ADAPTATION (WM-OPTIONS-EXIT, product track; the controller's ruling 8f for the owner, who asked
 * "Exiting out of the video options in settings is very slow ... does it really need to be that slow?"): the original's
 * RETURN, `dlgOptions_Menu.rdr`'s `check_then_save_and_leave` (UIZANIM.ZAR, read through `parseAnimSets`), runs
 * `SuspendMenuInput(2.0)` and `FadeAllSounds`, then WAIT 1.5 s (its command at byte 92, flags 0x9) before it leaves or
 * calls `save_and_leave`. In a round (`saveOnReturn`) the port hides that fade (MENUFADER is not drawn over the match)
 * and the chain answered for the player, so the wait is run out at once, on RETURN's press frame: the script and every
 * command it runs are the disc's, only not waited in real time. The front end waits it, as the original.
 */
export const OPTIONS_RETURN_WAIT_ADAPTATION = 1.5;
/**
 * SAVE_CHAIN_WAITS_ADAPTATION (WM-OPTIONS-EXIT, as above): `UIMemCardAnim.rdr`'s `save_and_leave` waits WAIT 1 s, 0.1 s,
 * 0.2 s and 0.2 s (its commands at bytes 1128, 2084, 2728 and 2840, flags 0x9) around the notices SAVE_ON_RETURN_NOTICES
 * hides. In a round they are run out on the same frame: the disc's save and serialiser run whole, in their order, and
 * Settings closes on the chain's own `SwitchMenu` once the save has completed. Skipped only where the port hides what
 * the original showed: a question the chain does not answer (a card that cannot be written) stops it, at the original's pace.
 */
export const SAVE_CHAIN_WAITS_ADAPTATION: readonly number[] = [1, 0.1, 0.2, 0.2];
/**
 * SAVE_CHAIN_HIDDEN_TIMES_ADAPTATION (WM-OPTIONS-EXIT, as above; the review's N1): the other times a hurried RETURN runs
 * out, each hidden in a round, and the reason one wait is not in these lists (N3).
 * - `inputSuspend` 2.0 s: `check_then_save_and_leave`'s `SuspendMenuInput(2.0)` (`FUN_00277220` D:L122805-122822, the
 *   shell's +0x900); what is left of it after the WAIT 1.5 s is the time #831 stood before its answer (about 16 ticks).
 *   A press held through the hurried chain is still never a fresh press at a question handed to the player (`heldAtHandBack`).
 * - `dimIn` 0.05 s: `save_and_leave`'s OBJECT_OPACITY_FROM_TO at byte 60 (0 to 0.7 at 14 a second), the questions' dim,
 *   which the port does not draw for the hidden chain. `dimOut` 0.05 s is byte 532's (0.7 to 0 at -14 a second), named for
 *   completeness only: it sits in the TRIANGLE-cancel branch (the IF at 508) that the answered chain never enters, so the
 *   hurry skips nothing there (the re-review's N4).
 * - The hidden notices' screen time (SAVE_ON_RETURN_NOTICES) is the WAITs of SAVE_CHAIN_WAITS_ADAPTATION and the ticks
 *   between their records; no other wait.
 * - Not listed: `save_and_leave`'s WAIT 15 s at byte 580 (after a STOP_ANIMATION at 572, inside the IF at 508 .. ENDIF at
 *   592) is not waited on the answered path -- in the port's trace #831's YES leads to #830 in the same tick -- so the hurry
 *   skips nothing there; a branch that reaches it shows the player a question and is run at the original's pace.
 */
export const SAVE_CHAIN_HIDDEN_TIMES_ADAPTATION = { inputSuspend: 2.0, dimIn: 0.05, dimOut: 0.05 } as const;
/**
 * IN_ROUND_SWITCH_ADAPTATION (WM-OPTIONS-EXIT, as above): a page switch fades MENUFADER to black at 2 x the step a frame
 * (`FUN_003654c0` A4, D:L262277-262286) and then counts `MENU_SWITCH_COUNTDOWN` frames (`FUN_00365a00`, D:L262395,
 * D:L262450-262456). In a round the fade is never drawn over the match, so the shell switches at once
 * (`MenuShellHost.switchAtOnce`); the front end's shell keeps both.
 */
export const IN_ROUND_SWITCH_ADAPTATION = { fadePerSecond: 2, countdownFrames: MENU_SWITCH_COUNTDOWN } as const;
/** The animation OPTIONS' RETURN starts (`dlgOptions_Menu.rdr`'s SaveAndLeaveBtn CROSS binding; research 302 §4). */
const OPTIONS_RETURN_ANIMATION = 'check_then_save_and_leave';
/** RETURN on OPTIONS, VIDEO and AUDIO (the disc's control name). */
const RETURN_BUTTON = 'SaveAndLeaveBtn';
/**
 * WM-6A: the sub-pages' way back to OPTIONS -- VIDEO's and AUDIO's RETURN (their SaveAndLeaveBtn CROSS binding); on
 * CONTROLLER PRESETS, which has no RETURN row, the animation of the name in its own set (`dlgControllerPresets.rdr`:
 * `ReturnToOptions`, SWITCHMENU(dlgOptions_Menu.rdr); `tools/dump-dialogs.ts --dialog`). No button binds it there: a
 * player leaves that page by SCREEN TRIANGLE, the set's own `check_then_save_and_leave` (POPUPDIALOG, SWITCHMENU to
 * OPTIONS, `save_and_leave`), so on PRESETS this is not a press a player makes. Every value on that page saves and leaves
 * at once (a preset's CROSS), so it never holds a draft: the final card is the same, saved once at OPTIONS' RETURN
 * (the TRIANGLE twin in `test/nativeOptionsHost.test.ts`).
 */
const SUB_PAGE_RETURN_ANIMATION = 'ReturnToOptions';
/**
 * A browser bound, not the original's: the most UI ticks one frame runs out (10 s of the chain; RETURN's whole hidden
 * chain is about 4.4 s). Past it the chain goes on at the original's pace, never cut.
 */
const IN_ROUND_RETURN_TICK_LIMIT = 300;

export interface NativeOptionsHostOptions {
  /** SAVE_ON_RETURN_ADAPTATION: the in-match Settings (`./nativeSettings`) pass true; the class's default is the original's prompts. */
  saveOnReturn?: boolean;
}

/** A popup as the save chain reads it (`@s2u/ui` `Popup`). */
interface ChainPopup { valve: unknown; textId: number; answer: number }

export class NativeOptionsHost {
  readonly queue = new MenuQueue();
  readonly popups = new PopupSlot();
  readonly host: UiCommandHost;
  readonly parts: DialogPartsHost;
  readonly input: MenuInput;
  readonly shell: MenuShell;
  readonly clock = new UiClock();
  last: UiDrawItem[] = [];
  private scripts: ScreenScripts | null = null;
  private exited = false;
  private interrupting = false;
  private discardDone = false;
  private readonly navigation = new Map<string, number | undefined>();
  /** SAVE_ON_RETURN_ADAPTATION: idle; answering RETURN's save chain, unseen; or handed to the player (a question it does not answer). */
  private saving: 'idle' | 'answering' | 'player' = 'idle';
  /** The CROSS the host gave the last tick (a press is a down after an up). */
  private pressedLast = false;
  /** Ticks with no popup while answering. */
  private quietTicks = 0;
  /** RETURN pressed on the main page: the chain's first question plays its .METAL before its record says which it is. */
  private returnPressed = false;
  /** OPTIONS_RETURN_WAIT_ADAPTATION: RETURN's script started in a round; its hidden waits are run out this frame. */
  private hurrying = false;
  /**
   * The review's F1: the buttons held when a question is handed to the player. The chain's answered ticks feed the pad
   * no button, which reads as a release; a button still held at the hand-back stays out of the player's pad until it
   * is really released, so it is never a fresh press (the original's real pad, under its 2 s suspend, never released it).
   */
  private heldAtHandBack = new Set<PadSlotName>();
  /**
   * WM-6A (a browser adaptation, `./settingsAdvanced`): the launcher tab ADVANCED asked for in a round, or null. Set at the
   * press; `./nativeSettings` opens the launcher at it once Settings closed.
   */
  advancedTab: SettingsAdvancedTab | null = null;
  /** WM-6A: ADVANCED pressed on a sub-page -- RETURN on OPTIONS is owed once OPTIONS is built and takes input. */
  private advancedReturnOwed = false;
  /** WM-6A: buttons pressed by the page's pointer (the prompt's SQUARE), read down on the next frame. */
  private pointerPressed = new Set<PadSlotName>();

  constructor(readonly assets: NativeOptionsAssets, readonly state: NativeOptionsState, readonly sounds: UiSoundCues | null = null,
    readonly options: NativeOptionsHostOptions = {}) {
    const face = (name: string) => assets.disc.faces.find(f => f.name.toLowerCase() === name.toLowerCase()) ?? null;
    this.parts = new DialogPartsHost({ popupObject: () => this.queue.popupObject, face, captions: assets.disc.captions, uiVars: state.uiVars,
      sound: n => { if (this.interrupting || this.chainMuted()) return; if (n === '.METAL') sounds?.popup(); else if (n === 'TELETYPE') sounds?.teletype(); else sounds?.selection(); },
    });
    this.host = new UiCommandHost({ node: this.parts.nodeCommand,
      sound: cmd => { if (!this.interrupting && !this.chainUnseen() && !/^MUS_/i.test(cmd.sound)) sounds?.sound({ ...cmd, anim: `in-match-options/${cmd.anim}` }); },
      instanceStop: anim => sounds?.stopInstance(`in-match-options/${anim}`),
    });
    this.popups.connect(this.parts.makePopup);
    this.input = new MenuInput({ machine: () => ({ shell: () => this.shell, menu: { shell: this.shell }, queue: this.queue }), parts: this.parts, selection: () => sounds?.selection() });
    this.input.register(this.host);
    const close = () => { this.exited = true; };
    this.shell = new MenuShell(this.queue, {
      open: name => assets.disc.dialog(name),
      build: (design, name) => {
        // The native panels, fonts and controls; the home-menu background is replaced by the running match.
        const screen = buildDialogScreen({ ...design, background: null }, { face, captions: assets.disc.captions });
        const scripts = this.scripts = screenScripts({ design, screen, sets: assets.disc.sets, valves: state.valves, host: this.host, dialog: name });
        this.parts.built({ design, screen, scripts, valves: state.valves });
        // OT.R79: VIDEO's strip at the page's picture before its first tick checks the box, as the front end's build does.
        if (state.picture && this.parts.current && isVideoPictureDesign(design)) selectVideoPicture(this.parts.current.widgets, state.picture.get());
        return { screen, scripts };
      },
      states: { loadScreen: close, menuScreen: close, popToMenu: close, shutdown: close }, reboot: close,
      input: () => { if (!this.interrupting) this.input.dispatch(); }, setEnabled: this.parts.setEnabled, activate: this.input.activate,
      widgetsTick: this.parts.widgetsTick, draw: this.parts.draw, onBuilt: this.input.built,
      playMetal: () => { if (!this.interrupting && !this.chainMuted()) sounds?.popup(); },
      switchAtOnce: !!options.saveOnReturn,                          // IN_ROUND_SWITCH_ADAPTATION
    }, this.popups);
    // OPTIONS_RETURN_WAIT_ADAPTATION: observe (never take) RETURN's start in a round.
    if (options.saveOnReturn) this.host.setBindingGate('in-match-options-return', b => {
      if (b.animation === OPTIONS_RETURN_ANIMATION && b.dialog.toLowerCase() === OPTIONS_MENU.toLowerCase()) this.hurrying = true;
      return false;
    });
    // WM-6A: ADVANCED in a round runs RETURN's own chain whole (`advanced`), the tab recorded for the launcher.
    if (options.saveOnReturn) this.host.setBindingGate(SETTINGS_ADVANCED_GATE, settingsAdvancedGate(tab => { this.advanced(tab); }));
    const commands = new ScreenCommands({ queue: this.queue, shell: () => this.shell, menu: { startDialog: OPTIONS_MENU }, load: { abort: false },
      states: { pop: close, switchToMenu: close }, inputString: cmd => this.shell.inputString(cmd.anim), playBack: () => sounds?.back(),
    });
    commands.register(this.host);
    this.host.setHandler('SwitchMenu', cmd => {
      if (this.interrupting) { this.discardDone = true; return true; }
      const target = cmd.arg === INPUT_STRING ? this.shell.inputString(cmd.anim) : cmd.arg;
      if (!target) return true;
      const back = target === PREVIOUS_SCREEN ? this.queue.historyTop() : target;
      if (!back || !NATIVE_OPTIONS_DIALOGS.some(n => n.toLowerCase() === back.toLowerCase())) {
        if (target === PREVIOUS_SCREEN) sounds?.back();
        close();
      } else this.queue.switchMenu(target, () => sounds?.back());
      return true;
    });
    // These scripts normally affect the main-menu IOP/music or leave to another game state. In-match routing owns
    // that boundary; native control, apply, discard and card commands below remain the same implementations.
    for (const name of ['CleanupMissionMemory', 'RebootIOP', 'SysPostInit', 'SysLoadIRX', 'VagStreaming', 'StopAllSounds', 'FadeAllSounds', 'BackgroundMPEG', 'PlayMPEG', 'PlayMPEGNoFade', 'SetDefaultMenuScreen']) this.host.setHandler(name, () => true);
    const menu = new MenuCommands({ valves: () => state.valves, uiVars: state.uiVars, card: state.libmc ?? undefined,
      inputString: cmd => this.shell.inputString(cmd.anim), event: kind => { this.shell.event(kind); },
    });
    menu.register(this.host);
    new CardCommands({ valves: () => state.valves, uiVars: state.uiVars, card: state.libmc ?? undefined, config: state.config,
      io: () => menu.cardIo(), event: kind => { this.shell.event(kind); },
    }).register(this.host);
    new OptionsCommands({ valves: () => state.valves, uiVars: state.uiVars, globals: state.globals,
      dialog: () => this.shell.currentName, name: (cmd, i) => this.parts.current?.name(cmd, i) ?? null,
      controllerConfig: name => state.configs?.select(name), inputString: cmd => this.shell.inputString(cmd.anim),
      ...(state.screenOrigin ? { screenOrigin: state.screenOrigin } : {}), ...(state.picture ? { picture: state.picture } : {}),
    }).register(this.host);
    // MLS.R7: this new entry reads the applied session through native InitOptions (research 302 §4,
    // FUN_0027b420), including START shortcuts that wrote a global directly. Only the current page becomes a draft.
    state.globals.init(state.valves);
    for (const [name, value] of Object.entries({ BeenPastOptions: 1, CameFromNewGameButton: 0, MultiplayerDisconnectFromOptions: 0, OptionsMenuChanged: 0 })) {
      this.navigation.set(name, state.valves.find(name)?.value);
      state.valves.set(name, value, VALVE_TYPE.TEMP);
    }
    this.queue.pushHistory('in-match-settings-return');
    this.shell.start(OPTIONS_MENU);
  }

  /**
   * WM-6A (a browser adaptation, `./settingsAdvanced`): ADVANCED in a round -- exactly the RETURN presses that leave
   * Settings, never the discard: on OPTIONS, its RETURN's own CROSS binding (`check_then_save_and_leave`, then
   * `save_and_leave`: StoreOptions and the card save), hurried and answered as RETURN's (OPTIONS_RETURN_WAIT_ADAPTATION,
   * SAVE_ON_RETURN_ADAPTATION); on a sub-page, first its way back to OPTIONS (`SUB_PAGE_RETURN_ANIMATION`: VIDEO's and
   * AUDIO's RETURN; on CONTROLLER PRESETS an unbound animation of its set, where a player's exit is TRIANGLE -- no draft
   * there, the same final card, saved once), then that.
   * The chain's own SWITCHMENU closes Settings; `./nativeSettings` then opens the launcher at `advancedTab`.
   */
  private advanced(tab: SettingsAdvancedTab): void {
    if (this.advancedTab !== null || this.saving !== 'idle' || this.hurrying) return;
    this.advancedTab = tab;
    if (this.shell.currentName.toLowerCase() === OPTIONS_MENU.toLowerCase()) { this.returnOnOptions(); return; }
    const ret = this.shell.design?.controls.find(c => c.name === RETURN_BUTTON);
    const cross = ret?.widget.type === 'BUTTON' ? ret.widget.button.bindings.find(b => b.kind === 'button' && b.name === 'CROSS') : undefined;
    this.advancedReturnOwed = true;
    // VIDEO / AUDIO: their RETURN's binding; CONTROLLER PRESETS (no RETURN row): `ReturnToOptions`, bound to no button.
    this.scripts?.startBinding(cross?.animation ?? SUB_PAGE_RETURN_ANIMATION, cross?.argument ?? null);
  }

  /** WM-6A: OPTIONS' RETURN, as its press starts it: its CROSS binding (the gate above sees the start and hurries it). */
  private returnOnOptions(): void {
    const ret = this.shell.design?.controls.find(c => c.name === RETURN_BUTTON);
    const cross = ret?.widget.type === 'BUTTON' ? ret.widget.button.bindings.find(b => b.kind === 'button' && b.name === 'CROSS') : undefined;
    if (!cross?.animation || !this.scripts) return;
    this.returnPressed = true;
    this.scripts.startBinding(cross.animation, cross.argument);
  }

  /** WM-6A: a button pressed by the page's pointer (the ADVANCED prompt's SQUARE, `./menuInput`), down on the next frame. */
  press(button: PadSlotName): void { this.pointerPressed.add(button); }

  /** The popup shown now (this dialog's `POPUP` node), or null. */
  private popup(): ChainPopup | null {
    const p = this.parts.current?.popup()?.popup as unknown as ChainPopup | undefined;
    return p && this.popups.shown(this.shell.screen) ? p : null;
  }

  /** SAVE_ON_RETURN_ADAPTATION: the save chain is being answered, unseen (its popups and their sounds left out). */
  private chainUnseen(): boolean {
    if (!this.options.saveOnReturn || this.saving === 'player') return false;
    if (this.saving === 'answering') return true;
    // #831's record is applied before PopUpDialog shows it and plays its .METAL: the component, shown or not yet
    const p = this.parts.current?.popup()?.popup as unknown as ChainPopup | undefined;
    return !!p && p.textId === 831;
  }

  /** The chain's sounds left out: while it is answered, and from RETURN's press to its first question. */
  private chainMuted(): boolean {
    return this.chainUnseen() || (!!this.options.saveOnReturn && this.returnPressed && this.saving === 'idle');
  }

  /** A popup the player sees: shown, and not the save chain answered unseen (SAVE_ON_RETURN_ADAPTATION). */
  popupDrawn(): boolean {
    return this.popups.shown(this.shell.screen) && !this.chainUnseen();
  }

  /** The pad a tick reads: the player's, or, while the chain is answered, the host's CROSS on the question's answer. */
  private padFor(snapshot: PadSnapshot): PadSnapshot {
    if (!this.options.saveOnReturn) return snapshot;
    if (this.saving === 'player') return this.unheld(snapshot);
    const p = this.popup();
    if (!p) {
      this.pressedLast = false;
      if (this.saving !== 'answering') return snapshot;
      // between the chain's questions the script works on; a chain that ends without leaving gives the pad back (3 s)
      if (++this.quietTicks > 90) { this.saving = 'idle'; this.quietTicks = 0; this.returnPressed = false; this.hurrying = false; return this.handBack(snapshot); }
      return NO_PAD;
    }
    if (this.saving === 'idle' && p.textId !== 831) return snapshot;
    this.saving = 'answering';
    this.quietTicks = 0;
    if (!p.valve) {                                                // a notice: the chain's own hidden, any other the player's
      if (SAVE_ON_RETURN_NOTICES.includes(p.textId)) return NO_PAD;
      this.saving = 'player'; this.returnPressed = false; this.hurrying = false; return this.handBack(snapshot);
    }
    const answer = SAVE_ON_RETURN_ADAPTATION[p.textId];
    if (answer === undefined) { this.saving = 'player'; this.returnPressed = false; this.hurrying = false; return this.handBack(snapshot); }
    p.answer = answer;
    this.pressedLast = !this.pressedLast;
    return this.pressedLast ? { down: new Set(['CROSS']), stickX: 0, stickY: 0 } : NO_PAD;
  }

  /** F1: a question handed to the player -- the buttons held now are kept out until released (`heldAtHandBack`). */
  private handBack(snapshot: PadSnapshot): PadSnapshot {
    this.heldAtHandBack = new Set(snapshot.down);
    return this.unheld(snapshot);
  }

  /** The player's pad without the buttons held since the hand-back; each leaves the set once it is seen released. */
  private unheld(snapshot: PadSnapshot): PadSnapshot {
    if (this.heldAtHandBack.size === 0) return snapshot;
    for (const b of [...this.heldAtHandBack]) if (!snapshot.down.has(b)) this.heldAtHandBack.delete(b);
    if (this.heldAtHandBack.size === 0) return snapshot;
    return { ...snapshot, down: new Set([...snapshot.down].filter(b => !this.heldAtHandBack.has(b))) };
  }

  frame(now: number, snapshot: PadSnapshot = NO_PAD): boolean {
    if (this.exited) return false;
    if (this.pointerPressed.size) {                                  // WM-6A: the pointer's press, one frame
      snapshot = { ...snapshot, down: new Set([...snapshot.down, ...this.pointerPressed]) };
      this.pointerPressed.clear();
    }
    if (this.options.saveOnReturn && snapshot.down.has('CROSS') && this.shell.currentName.toLowerCase() === OPTIONS_MENU.toLowerCase() &&
      this.input.ring()?.focused?.name === 'SaveAndLeaveBtn') this.returnPressed = true;
    this.input.source = { read: () => this.padFor(snapshot) };
    this.clock.advance(now, (_tick, dt) => {
      if (this.exited) return;
      // WM-6A: back on OPTIONS from ADVANCED's sub-page, built and taking input: its RETURN, as a press there would.
      if (this.advancedReturnOwed && this.shell.currentName.toLowerCase() === OPTIONS_MENU.toLowerCase() && this.shell.switchState < 0 &&
        this.shell.inputTimer <= 0) { this.advancedReturnOwed = false; this.returnOnOptions(); }
      this.input.read(); this.shell.tick(dt);
      if (this.hurrying) this.hurry(dt, snapshot);
      // Browser adaptation: START already shades the live match. Keep MENUFADER's native animation/switch state,
      // but present its dim only for native popups; opening and page navigation must not cover the match in black.
      const unseen = this.chainUnseen();
      const popup = this.popups.shown(this.shell.screen) && !unseen;
      this.last = this.shell.draw().filter(it => it.kind !== 'clear' && it.kind !== 'movie' &&
        (popup || !('node' in it) || it.node !== 'MENUFADER') && !(unseen && 'node' in it && it.node === 'POPUP'));
    });
    return !this.exited;
  }

  /**
   * OPTIONS_RETURN_WAIT_ADAPTATION / SAVE_CHAIN_WAITS_ADAPTATION: RETURN's hidden chain run out tick by tick on this frame,
   * on this frame's live pad (a held button stays held, never a new press; the chain's questions are answered over it
   * by `padFor`), until Settings closes, a question the chain does not answer is the player's, or the browser bound.
   * The review's N2: RETURN's script suspends input with its first command; no suspend means it did not start (a later
   * binding gate took it), and nothing is hurried.
   */
  private hurry(dt: number, snapshot: PadSnapshot): void {
    if (this.shell.inputTimer <= 0 && this.saving === 'idle') { this.hurrying = false; return; }
    this.input.source = { read: () => this.padFor(snapshot) };
    for (let i = 0; i < IN_ROUND_RETURN_TICK_LIMIT && this.hurrying && !this.exited && !this.popupDrawn(); i++) {
      this.input.read(); this.shell.tick(dt);
    }
    this.hurrying = false;
  }

  /** MLS.R2: finish only this page's own native discard branch, without building another page or touching applied globals.
   * The native back animations are read from the disc's TRIANGLE bindings. Their popup's second answer is the
   * native YES/discard value 2 (research 302 §4; the same answer the popup dispatch writes).
   */
  discard(): void {
    if (this.shell.currentName.toLowerCase() === OPTIONS_MENU.toLowerCase()) return;
    const back = this.shell.design?.bindings.find(b => b.kind === 'button' && b.name === 'TRIANGLE');
    if (!back?.animation || !this.scripts) return;
    this.interrupting = true;
    this.discardDone = false;
    this.scripts.startBinding(back.animation, back.argument);
    for (let i = 0; i < 180 && !this.discardDone; i++) {
      this.shell.tick(1 / 30);
      this.state.valves.set('AreYouSure', 2, VALVE_TYPE.TEMP);
    }
    this.interrupting = false;
  }

  close(): void {
    this.exited = true;
    this.hurrying = false;
    this.shell.unload();
    this.queue.flush(true);
    this.parts.current = null;
    for (const [name, value] of this.navigation) {
      if (value !== undefined) this.state.valves.set(name, value, VALVE_TYPE.TEMP);
    }
  }
}
