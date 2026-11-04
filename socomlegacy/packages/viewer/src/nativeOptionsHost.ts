import type { Libmc } from '@s2u/card';
import {
  buildDialogScreen, CardCommands, DialogPartsHost, INPUT_STRING, MenuCommands, MenuInput, MenuQueue, MenuShell,
  NO_PAD, OPTIONS_DIALOGS, OPTIONS_MENU, OPTIONS_PRESETS, OptionsCommands, PopupSlot, PREVIOUS_SCREEN,
  ScreenCommands, screenScripts, UiClock, VALVE_TYPE, isVideoPictureDesign, selectVideoPicture, type VideoPicture,
  type CardConfigFile, type OptionGlobals, type PadSnapshot, type ScreenScripts, type UiDrawItem, type UiSoundCues,
  type UiVarManager, type ValveStore,
} from '@s2u/ui';
import { UiCommandHost } from '@s2u/ui';
import type { ControllerConfigs } from './controllerConfigs';
import type { FrontEndDisc } from './frontEnd';
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
    }, this.popups);
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
    if (!this.options.saveOnReturn || this.saving === 'player') return snapshot;
    const p = this.popup();
    if (!p) {
      this.pressedLast = false;
      if (this.saving !== 'answering') return snapshot;
      // between the chain's questions the script works on; a chain that ends without leaving gives the pad back (3 s)
      if (++this.quietTicks > 90) { this.saving = 'idle'; this.quietTicks = 0; this.returnPressed = false; return snapshot; }
      return NO_PAD;
    }
    if (this.saving === 'idle' && p.textId !== 831) return snapshot;
    this.saving = 'answering';
    this.quietTicks = 0;
    if (!p.valve) {                                                // a notice: the chain's own hidden, any other the player's
      if (SAVE_ON_RETURN_NOTICES.includes(p.textId)) return NO_PAD;
      this.saving = 'player'; this.returnPressed = false; return snapshot;
    }
    const answer = SAVE_ON_RETURN_ADAPTATION[p.textId];
    if (answer === undefined) { this.saving = 'player'; this.returnPressed = false; return snapshot; }
    p.answer = answer;
    this.pressedLast = !this.pressedLast;
    return this.pressedLast ? { down: new Set(['CROSS']), stickX: 0, stickY: 0 } : NO_PAD;
  }

  frame(now: number, snapshot: PadSnapshot = NO_PAD): boolean {
    if (this.exited) return false;
    if (this.options.saveOnReturn && snapshot.down.has('CROSS') && this.shell.currentName.toLowerCase() === OPTIONS_MENU.toLowerCase() &&
      this.input.ring()?.focused?.name === 'SaveAndLeaveBtn') this.returnPressed = true;
    this.input.source = { read: () => this.padFor(snapshot) };
    this.clock.advance(now, (_tick, dt) => {
      if (this.exited) return;
      this.input.read(); this.shell.tick(dt);
      // Browser adaptation: START already shades the live match. Keep MENUFADER's native animation/switch state,
      // but present its dim only for native popups; opening and page navigation must not cover the match in black.
      const unseen = this.chainUnseen();
      const popup = this.popups.shown(this.shell.screen) && !unseen;
      this.last = this.shell.draw().filter(it => it.kind !== 'clear' && it.kind !== 'movie' &&
        (popup || !('node' in it) || it.node !== 'MENUFADER') && !(unseen && 'node' in it && it.node === 'POPUP'));
    });
    return !this.exited;
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
    this.shell.unload();
    this.queue.flush(true);
    this.parts.current = null;
    for (const [name, value] of this.navigation) {
      if (value !== undefined) this.state.valves.set(name, value, VALVE_TYPE.TEMP);
    }
  }
}
