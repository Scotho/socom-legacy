import { describe, expect, it } from 'vitest';
import type { DialogBinding, DialogDesign } from '../../src/dialog';
import { addChild, buildDialogScreen, findNode, newNode, type UiNode } from '../../src/compositor/index';
import { FULL_FADE } from '../../src/compositor/frame';
import { UI_TICK_SECONDS } from '../../src/clock/uiClock';
import { f32 } from '../../src/text/f32';
import { MenuQueue, MENU_RECORD } from '../../src/screens/menuQueue';
import {
  FADER_OPAQUE_ALPHA, MENU_KEYWORDS, MENU_STEP_CLAMP, MenuShell, type MenuShellHost, type ShellScripts,
} from '../../src/screens/menuShell';
import { POPUP_UNCONNECTED, PopupSlot } from '../../src/screens/popupSlot';

/**
 * The dialog host G (`CGameMenu`; web research 115 §3-§6): its tick `FUN_003654c0` (D:L262239-262372) with the queue's
 * consumer, the switch's state machine and dispatch `FUN_00365a00` (D:L262375-262458), the build's order
 * (`FUN_00367950` D:L263398-263775, through `FUN_00367430` D:L263179-263243 and `FUN_00368570` D:L263778-263801), the
 * unload (`FUN_00369210` D:L264277-264425) and the popup commands (`FUN_0027eff0` D:L126862-126904, `FUN_0027d190`
 * D:L125846-125859). Synthetic designs; the screen is PLAT-14's `buildDialogScreen`.
 */

const ONSTART: DialogBinding = { kind: 'event', name: 'ONSTART', code: 0, state: 1, animation: 'menu_fade_up', argument: null };
const design = (over: Partial<DialogDesign> = {}): DialogDesign => ({
  libraries: [], usesMemcard: false, font: null, fontLib: true, background: null, bindings: [ONSTART],
  controls: [], objects: [], scripts: ['UIanim.rdr'], models: [], dropped: [], ...over,
});

interface Fake {
  host: MenuShellHost;
  log: string[];
  dialogs: Map<string, DialogDesign>;
}

/** A host over `dialogs`, logging every call; each built dialog's scripts log their ticks and events. */
function fake(dialogs: Record<string, DialogDesign> = {}): Fake {
  const log: string[] = [];
  const map = new Map(Object.entries(dialogs));
  const scripts = (name: string): ShellScripts => ({
    start: () => log.push(`${name}: start`),
    tick: (step) => log.push(`${name}: scripts ${step.toFixed(4)}`),
    event: (kind) => { log.push(`${name}: event ${kind}`); return true; },
    stop: () => log.push(`${name}: stop`),
  });
  const host: MenuShellHost = {
    open: (name) => map.get(name) ?? null,
    build: (d, name) => ({ screen: buildDialogScreen(d), scripts: d.bindings.length ? scripts(name) : null }),
    states: {
      loadScreen: () => log.push('CG switch(load)'),
      popToMenu: () => log.push('CG pop(0), switch(MS)'),
      menuScreen: () => log.push('CG switch(MS)'),
      shutdown: () => log.push('CG switch(shutdown)'),
    },
    reboot: () => log.push('reboot'),
    input: () => log.push('input'),
    seekAhead: () => log.push('seek'),
    setEnabled: (node, on) => log.push(`${node.name} enabled ${on}`),
    activate: (name) => log.push(`activate ${name}`),
    widgetsTick: () => log.push('widgets'),
    focusTick: (_s, popupHidden) => log.push(`focus ${popupHidden}`),
    subclassTick: () => log.push('subclass'),
    playMetal: () => log.push('.METAL'),
    onUnload: () => log.push('unload'),
    onBuilt: (d) => log.push(`built ${d.background?.type ?? 'none'}`),
  };
  return { host, log, dialogs: map };
}

/** One menu frame as `CMenuState_Tick` runs it: the shell's tick, then its draw (the draw writes the fader's alpha). */
const frame = (g: MenuShell, dt: number): void => { g.tick(dt); g.draw(); };

describe('the build (FUN_00368570 -> FUN_00367430 -> FUN_00367950)', () => {
  it('opens the dialog, names the shell after it, starts its scripts and fires ONSTART, then the movie hook', () => {
    const { host, log } = fake({ 'dlgMenu.rdr': design() });
    const g = new MenuShell(new MenuQueue(), host);
    g.start('dlgMenu.rdr');
    expect(g.currentName).toBe('dlgMenu.rdr');
    expect(g.hasEvents).toBe(true);
    expect(log).toEqual(['unload', 'unload', 'dlgMenu.rdr: start', 'dlgMenu.rdr: event 0', 'built none']);
    expect(g.faderAlpha).toBe(FADER_OPAQUE_ALPHA);                // a new dialog with event records: black until a script fades
    expect(g.screen.foreplane.children.map((n) => n.name)).toEqual(['MENUFADER', 'POPUP']);
  });

  it('a dialog with no event records: the fader alpha 0 at once, no scripts started (step 8)', () => {
    const { host, log } = fake({ dlgPlain: design({ bindings: [], scripts: [] }) });
    const g = new MenuShell(new MenuQueue(), host);
    g.start('dlgPlain');
    expect([g.hasEvents, g.faderAlpha]).toEqual([false, 0]);
    expect(log).toEqual(['unload', 'unload', 'built none']);
  });

  it('a dialog not on the disc: unloaded, nothing built, the name not taken (MENU_MISSING_DIALOG_READING)', () => {
    const { host, log } = fake();
    const g = new MenuShell(new MenuQueue(), host);
    g.start('dlgNone.rdr');
    expect(g.currentName).toBe('');
    expect(log).toEqual(['unload']);
    expect(g.faderAlpha).toBe(FADER_OPAQUE_ALPHA);
    expect(g.design).toBeNull();
  });

  it('the popup object is made at the build and wrapped as the POPUP node, hidden, after MENUFADER', () => {
    const q = new MenuQueue();
    const g = new MenuShell(q, fake({ d: design() }).host);
    g.start('d');
    expect(q.popupObject).not.toBeNull();
    const popup = findNode(g.screen.root, 'POPUP')!;
    expect(popup.visible).toBe(false);
  });
});

describe('the tick (FUN_003654c0), branch A', () => {
  it('in order: input, scripts on the clamped step, the queue, the popup, widgets, focus, subclass', () => {
    const { host, log } = fake({ d: design() });
    const g = new MenuShell(new MenuQueue(), host);
    g.start('d');
    log.length = 0;
    g.tick(0.2);
    expect(MENU_STEP_CLAMP).toBe(f32(0.05));   // single precision toward zero (EE_FPU_ROUNDING_READING)
    expect(log).toEqual(['input', 'd: scripts 0.0500', 'widgets', 'focus true', 'subclass']);
  });

  it('SuspendMenuInput: the timer counts down by dt and input is not read while it is above 0', () => {
    const { host, log } = fake({ d: design({ bindings: [] }) });
    const g = new MenuShell(new MenuQueue(), host);
    g.start('d');
    g.suspendInput(0.1);
    log.length = 0;
    g.tick(0.06); g.tick(0.06); g.tick(0.06);
    expect(log.filter((l) => l === 'input')).toHaveLength(1);     // 0.1 -> 0.04 -> -0.02 -> input
  });

  it('the queue is read newest first; a switch record ends the frame (A6-A9 skipped) and the older records wait', () => {
    const { host, log } = fake({ d: design({ bindings: [] }), e: design({ bindings: [] }) });
    const q = new MenuQueue();
    const g = new MenuShell(q, host);
    g.start('d');
    addChild(g.screen.backplane, newNode('btn'));
    q.disableButton('btn');
    q.switchMenu('e');
    log.length = 0;
    g.tick(1 / 60);
    expect(log).toEqual(['input']);                                // the switch consumed first, then return
    expect(q.history).toEqual(['d']);                               // G's name pushed at consumption
    expect(g.switchState).toBe(3);
    expect(q.peek()).toEqual({ type: MENU_RECORD.DISABLE, name: 'btn' });
  });

  it('types 8, 7 and 6: the named control disabled, enabled, activated; 3 consumed with no effect', () => {
    const { host, log } = fake({ d: design({ bindings: [] }) });
    const q = new MenuQueue();
    const g = new MenuShell(q, host);
    g.start('d');
    addChild(g.screen.backplane, newNode('btn'));
    q.queuePopup('ignored'); q.activateButton('btn'); q.enableButton('btn'); q.disableButton('btn'); q.disableButton('none');
    log.length = 0;
    g.tick(1 / 60);
    expect(log.slice(1, 4)).toEqual(['btn enabled false', 'btn enabled true', 'activate btn']);
    expect([q.count, q.top]).toEqual([0, 0]);
  });
});

describe('the switch (FUN_00365a00) and its fade', () => {
  /** Frames from the switch's consumption to its dispatch, with the fader at `o0` and the frame's `dt`. */
  const timeline = (o0: number, dt: number) => {
    const { host, log } = fake({ a: design(), b: design() });
    const q = new MenuQueue();
    const g = new MenuShell(q, host);
    g.start('a');
    g.screen.fader.opacity = o0;                                   // where the last script left MENUFADER
    frame(g, dt);
    log.length = 0;
    q.switchMenu('b');
    frame(g, dt);                                                  // F: consumed
    expect(g.switchState).toBe(3);
    // Each frame after F until the new dialog is built: a fading frame (branch A, the fader not yet opaque) or a frozen
    // one (branch B, the countdown).
    let fading = 0, frozen = 0;
    for (let i = 0; i < 200 && !log.includes('b: start'); i++) {
      if (g.faderAlpha === FADER_OPAQUE_ALPHA) frozen++; else fading++;
      frame(g, dt);
    }
    return { fading, frozen, log, g };
  };

  it('n = 30 at 1/60 s and 15 at 1/30 s from a clear fader; then 4 frozen frames, the 4th dispatching', () => {
    expect(timeline(0, 1 / 60)).toMatchObject({ fading: 30, frozen: 4 });
    expect(timeline(0, 1 / 30)).toMatchObject({ fading: 15, frozen: 4 });
    expect(timeline(0, UI_TICK_SECONDS)).toMatchObject({ fading: 15, frozen: 4 });   // PLAT-12's 29.97 Hz tick
  });

  it('the step is clamped: 10 frames at dt 0.1; from 0.5, 15 / 8 / 5 frames', () => {
    expect(timeline(0, 0.1)).toMatchObject({ fading: 10, frozen: 4 });
    expect(timeline(0.5, 1 / 60)).toMatchObject({ fading: 15, frozen: 4 });
    expect(timeline(0.5, 1 / 30)).toMatchObject({ fading: 8, frozen: 4 });
    expect(timeline(0.5, 0.1)).toMatchObject({ fading: 5, frozen: 4 });
  });

  it('an opaque fader when the switch is consumed: n = 0, the countdown starts on F+1', () => {
    expect(timeline(1, 1 / 60)).toMatchObject({ fading: 0, frozen: 4 });
  });

  it('branch B: no input, no scripts, no queue while the countdown runs; the backplane hidden, then shown at dispatch', () => {
    const { host, log } = fake({ a: design(), b: design() });
    const q = new MenuQueue();
    const g = new MenuShell(q, host);
    g.start('a');
    g.screen.fader.opacity = FULL_FADE;
    frame(g, 1 / 60);
    q.switchMenu('b');
    frame(g, 1 / 60);                                              // F
    q.disableButton('x');
    log.length = 0;
    const planes: boolean[] = [];
    for (let i = 0; i < 3; i++) { frame(g, 1 / 60); planes.push(g.screen.backplane.visible); }
    expect(log).toEqual([]);                                       // three B frames: nothing else ran
    expect(planes).toEqual([false, false, false]);
    expect(g.switchState).toBe(0);
    frame(g, 1 / 60);                                              // the 4th: shown, -1, dispatched
    expect(g.switchState).toBe(-1);
    expect(g.currentName).toBe('b');
    expect(log).toEqual(['a: stop', 'unload', 'unload', 'b: start', 'b: event 0', 'built none']);
    expect(q.peek()).toEqual({ type: MENU_RECORD.DISABLE, name: 'x' });   // still waiting for a branch-A frame
  });

  it('MENUFADER rises by 2 x step and is drawn opaque at 0.99 (FUN_0036d8b0: 0.99 as 128)', () => {
    const { host } = fake({ a: design(), b: design() });
    const q = new MenuQueue();
    const g = new MenuShell(q, host);
    g.start('a');
    g.screen.fader.opacity = 0.9;
    frame(g, 1 / 60);
    q.switchMenu('b');
    frame(g, 1 / 60);
    frame(g, 1 / 60);
    expect(g.screen.fader.opacity).toBeCloseTo(0.9333, 4);
    expect(g.faderAlpha).toBeCloseTo(0.9333 * 128, 2);
    frame(g, 1 / 60); frame(g, 1 / 60);
    expect(g.screen.fader.opacity).toBe(FULL_FADE);
    expect(g.faderAlpha).toBe(128);
  });

  it('a second switch while one is in flight: the history pushed, the target kept (MENU_SWITCH_REENTRY_READING)', () => {
    const { host } = fake({ a: design(), b: design(), c: design() });
    const q = new MenuQueue();
    const g = new MenuShell(q, host);
    g.start('a');
    g.screen.fader.opacity = 0;
    frame(g, 1 / 60);
    q.switchMenu('b');
    frame(g, 1 / 60);
    q.switchMenu('c');
    frame(g, 1 / 60);
    expect(q.history).toEqual(['a', 'b']);
    expect(g.currentName).toBe('b');
    for (let i = 0; i < 60; i++) frame(g, 1 / 60);
    expect(g.currentName).toBe('b');
  });
});

describe('the dispatch (FUN_00365a00, state 0)', () => {
  const dispatched = (target: string) => {
    const { host, log } = fake({ a: design() });
    const g = new MenuShell(new MenuQueue(), host);
    g.start('a');
    log.length = 0;
    // As branch B calls it with the fader opaque (a built dialog's alpha is 128 until a draw lowers it): -1 -> 3, three
    // countdown calls, the fifth dispatches.
    for (let i = 0; i < 5; i++) g.switchTo(target);
    return { log, g };
  };

  it('LOAD_SCREEN, POP_TO_MENU_STATE, MENU_SCREEN and SHUTDOWN are game-state requests; the dialog stays', () => {
    expect(MENU_KEYWORDS).toEqual({
      LOAD_SCREEN: 'LOAD_SCREEN', POP_TO_MENU_STATE: 'POP_TO_MENU_STATE', MENU_SCREEN: 'MENU_SCREEN', SHUTDOWN: 'SHUTDOWN', REBOOT: 'REBOOT',
    });
    expect(dispatched('LOAD_SCREEN').log).toEqual(['CG switch(load)']);
    expect(dispatched('POP_TO_MENU_STATE').log).toEqual(['CG pop(0), switch(MS)']);
    expect(dispatched('MENU_SCREEN').log).toEqual(['CG switch(MS)']);
    expect(dispatched('SHUTDOWN').log).toEqual(['CG switch(shutdown)']);
  });

  it('REBOOT: the seek ahead when booted from the disc, the countdown without waiting on the fader, then the reboot', () => {
    const { host, log } = fake({ a: design() });
    host.bootedFromDisc = true;
    const g = new MenuShell(new MenuQueue(), host);
    g.start('a');
    g.screen.fader.opacity = 0;
    g.draw();
    log.length = 0;
    for (let i = 0; i < 5; i++) g.switchTo('REBOOT');
    expect(log).toEqual(['seek', 'reboot']);
    expect(g.faderAlpha).not.toBe(FADER_OPAQUE_ALPHA);
  });

  it('the keywords are case-sensitive: load_screen is a dialog name', () => {
    expect(dispatched('load_screen').log).toEqual(['a: stop', 'unload']);
  });
});

describe('PopUpDialog and KillPopUp (research 115 §6) through the popup slot', () => {
  it('PopUpDialog queues a type-3 record, shows the POPUP node and plays .METAL; KillPopUp hides it', () => {
    const { host, log } = fake({ a: design() });
    const q = new MenuQueue();
    const g = new MenuShell(q, host);
    g.start('a');
    log.length = 0;
    g.popUp('logoff');
    expect(q.peek()).toEqual({ type: MENU_RECORD.POPUP, name: 'logoff' });
    expect(findNode(g.screen.root, 'POPUP')!.visible).toBe(true);
    expect(log).toEqual(['.METAL']);
    g.tick(1 / 60);
    expect(log).toContain('focus false');                          // A8 told the popup shows
    g.killPopUp();
    expect(findNode(g.screen.root, 'POPUP')!.visible).toBe(false);
  });

  it('KillPopUp does nothing without M\'s popup object', () => {
    const q = new MenuQueue();
    const g = new MenuShell(q, fake({ a: design() }).host);
    g.start('a');
    g.popUp('x');
    q.popupObject = null;
    g.killPopUp();
    expect(findNode(g.screen.root, 'POPUP')!.visible).toBe(true);
  });

  it('the slot: PLAT-16 connects its component; it is made on demand, attached to the POPUP node and ticked on A6', () => {
    const slot = new PopupSlot();
    expect(slot.make()).toMatchObject({ kind: POPUP_UNCONNECTED });
    const ticks: number[] = [];
    let attached: UiNode | null = null;
    slot.connect(() => ({ tick: (s) => ticks.push(s), attach: (n) => { attached = n; } }));
    const q = new MenuQueue();
    const g = new MenuShell(q, fake({ a: design({ bindings: [] }) }).host, slot);
    g.start('a');
    expect(attached).toBe(findNode(g.screen.root, 'POPUP'));
    g.tick(1 / 60);
    expect(ticks).toEqual([f32(1 / 60)]);
  });

  it('the unload hides and drops the popup and destroys M\'s object; the next frame makes it again', () => {
    const q = new MenuQueue();
    const g = new MenuShell(q, fake({ a: design() }).host);
    g.start('a');
    g.popUp('x');
    g.unload();
    expect(q.popupObject).toBeNull();
    expect(findNode(g.screen.root, 'POPUP')).toBeNull();
    g.tick(1 / 60);
    expect(q.popupObject).not.toBeNull();
  });
});
