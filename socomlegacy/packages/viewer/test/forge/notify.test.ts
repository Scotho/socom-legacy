// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { acceptPulse, createNotifier, FORGE_ACCEPT_PULSE, FORGE_NOTIFY_HISTORY, FORGE_PULSE_KINDS, FORGE_TOAST_MS, forgePulse } from '../../src/forge/shell/notify';
import { panelContext, type ForgePageContext } from '../../src/forge/shell/context';
import type { StatusChipHandle, StatusChipSpec } from '../../src/forge/shell/statusBar';
import type { ForgeAgentApi } from '../../src/forge/agent/api';

/**
 * FUI-4 (the review's IA-7, IA-12, VP-13, UX-5; a browser adaptation, FG.R2): the Forge's one notice model. A lasting
 * word sits in the status line (an error or a refusal persists there until another notice replaces it), a passing event
 * is a toast, and every notice reaches a short history (the message log) and an aria-live region. `accepted()` is the
 * one pulse owner (FUI-1b's second prerequisite): the haptics listen there, and nothing else pulses.
 */

function rig() {
  const status = document.createElement('span');
  status.className = 'fx-status-msg';
  const toast = document.createElement('div');
  toast.className = 'fx-toast';
  document.body.append(status, toast);
  const n = createNotifier({ doc: document, status, toast });
  document.body.append(n.live, n.log);
  const polite = (): string[] => [...n.live.querySelectorAll('[aria-live="polite"] > *')].map((p) => p.textContent ?? '');
  const assertive = (): string[] => [...n.live.querySelectorAll('[aria-live="assertive"] > *')].map((p) => p.textContent ?? '');
  return { status, toast, n, polite, assertive };
}

describe('the Forge notice model (FUI-4)', () => {
  beforeEach(() => { vi.useFakeTimers(); document.body.replaceChildren(); });
  afterEach(() => { vi.useRealTimers(); });

  it('two notices in 200 ms both reach the log and the live region', () => {
    const r = rig();
    r.n.notify('Layout open');
    vi.advanceTimersByTime(100);
    r.n.notify('Saved Yard.json', { kind: 'toast' });
    expect(r.n.history().map((e) => e.text)).toEqual(['Layout open', 'Saved Yard.json']);
    expect(r.polite()).toEqual(['Layout open', 'Saved Yard.json']);
    r.n.openLog(true);
    expect(r.n.log.hidden).toBe(false);
    expect(r.n.log.getAttribute('role')).toBe('log');
    expect([...r.n.log.querySelectorAll('li')].map((li) => li.textContent), 'newest first').toEqual(['Saved Yard.json', 'Layout open']);
  });

  it('an error outlives the toast\'s 1.8 s in the status line until another notice replaces it, and is said assertively', () => {
    const r = rig();
    r.n.notify('This layout is not saved: too many pieces', { kind: 'error' });
    vi.advanceTimersByTime(FORGE_TOAST_MS * 5);
    expect(r.status.textContent).toBe('This layout is not saved: too many pieces');
    expect(r.status.classList.contains('is-bad')).toBe(true);
    expect(r.assertive()).toEqual(['This layout is not saved: too many pieces']);
    r.n.notify('Layout open');
    expect(r.status.textContent).toBe('Layout open');
    expect(r.status.classList.contains('is-bad')).toBe(false);
  });

  it('a refusal persists in the status line; a toast passes and leaves the line alone', () => {
    const r = rig();
    r.n.refused('Stop walking to edit');
    vi.advanceTimersByTime(FORGE_TOAST_MS * 5);
    expect(r.status.textContent).toBe('Stop walking to edit');
    expect(r.status.classList.contains('is-bad')).toBe(true);
    expect(r.status.dataset['kind']).toBe('refusal');
    r.n.toast('Saved Yard.json');
    expect(r.toast.textContent).toBe('Saved Yard.json');
    expect(r.toast.classList.contains('is-on')).toBe(true);
    expect(r.toast.getAttribute('role')).toBe('status');
    expect(r.status.textContent, 'the toast is not the line').toBe('Stop walking to edit');
    vi.advanceTimersByTime(FORGE_TOAST_MS + 1);
    expect(r.toast.classList.contains('is-on')).toBe(false);
    expect(r.status.textContent).toBe('Stop walking to edit');
  });

  it('say() keeps the line\'s old contract (the 22 e2e reads of .fx-status-msg); an empty line clears it unlogged; progress is not logged', () => {
    const r = rig();
    r.n.say('blank floor');
    expect(r.status.textContent).toBe('blank floor');
    r.n.say('1 piece not found on this disc', true);
    expect(r.status.textContent).toBe('1 piece not found on this disc');
    expect(r.status.classList.contains('is-bad')).toBe(true);
    r.n.notify('MP2: models 40%', { progress: true });
    expect(r.status.textContent).toBe('MP2: models 40%');
    r.n.say('');
    expect(r.status.textContent).toBe('');
    expect(r.n.history().map((e) => e.text)).toEqual(['blank floor', '1 piece not found on this disc']);
  });

  it('the history is short: the newest are kept', () => {
    const r = rig();
    for (let i = 0; i < FORGE_NOTIFY_HISTORY + 10; i++) r.n.notify(`notice ${i}`);
    const h = r.n.history();
    expect(h).toHaveLength(FORGE_NOTIFY_HISTORY);
    expect(h[h.length - 1]!.text).toBe(`notice ${FORGE_NOTIFY_HISTORY + 9}`);
    expect(r.n.live.querySelectorAll('[aria-live="polite"] > *').length, 'the live region is bounded too').toBeLessThanOrEqual(8);
  });

  it('an error\'s cause is read into its words; dismiss clears its own line, never a later one', () => {
    const r = rig();
    const h = r.n.notify('Could not keep the save', { kind: 'error', error: new Error('quota exceeded') });
    expect(r.status.textContent).toBe('Could not keep the save: quota exceeded');
    h.dismiss();
    expect(r.status.textContent).toBe('');
    expect(r.status.classList.contains('is-bad')).toBe(false);
    const old = r.n.notify('first', { kind: 'error' });
    r.n.notify('second');
    old.dismiss();
    expect(r.status.textContent).toBe('second');
  });

  it('a toast with Undo carries one button that runs it once', () => {
    const r = rig();
    const undo = vi.fn();
    r.n.notify('Deleted Yard', { kind: 'toast', undo });
    const button = r.toast.querySelector<HTMLButtonElement>('button')!;
    expect(button.textContent).toBe('Undo');
    vi.advanceTimersByTime(FORGE_TOAST_MS + 1);
    expect(r.toast.classList.contains('is-on'), 'an action stays past a plain toast').toBe(true);
    button.click();
    button.click();
    expect(undo).toHaveBeenCalledOnce();
    expect(r.toast.classList.contains('is-on')).toBe(false);
  });

  it('accepted() pulses once per call; a refusal or any other notice never pulses', () => {
    const r = rig();
    const heard = vi.fn();
    const off = r.n.onAccepted(heard);
    r.n.accepted();
    r.n.accepted();
    expect(heard).toHaveBeenCalledTimes(2);
    r.n.refused('Close the open card first');
    r.n.notify('Layout open');
    r.n.toast('Saved');
    expect(heard).toHaveBeenCalledTimes(2);
    off();
    r.n.accepted();
    expect(heard).toHaveBeenCalledTimes(2);
  });

  it('the haptics helper listens on accepted(): one dual-rumble a call, nothing with no pad', () => {
    const r = rig();
    const playEffect = vi.fn(async (_type: 'dual-rumble', _params: typeof FORGE_ACCEPT_PULSE) => undefined);
    let pad: { playEffect: typeof playEffect } | null = { playEffect };
    r.n.onAccepted(acceptPulse(() => pad));
    r.n.accepted();
    expect(playEffect).toHaveBeenCalledOnce();
    expect(playEffect).toHaveBeenCalledWith('dual-rumble', FORGE_ACCEPT_PULSE);
    pad = null;
    expect(() => r.n.accepted()).not.toThrow();
    expect(playEffect).toHaveBeenCalledOnce();
  });
});

describe('a panel\'s ui: notify, toast, accepted, refused and its status chips (FUI-4)', () => {
  const page = (ui: Partial<ForgePageContext['ui']>): ForgePageContext => ({
    get forge(): ForgeAgentApi { throw new Error('no facade'); },
    ui: { notify: vi.fn(), toast: vi.fn(), reveal: vi.fn(), collapse: vi.fn(), ...ui },
    state: () => ({ surface: 'build', canEdit: true, canPlace: true, reason: null, revision: 0 }),
    store: { get: () => null, set: () => undefined }, doc: document,
  });

  it('accepted and refused reach the page\'s one owner; a rig without one still refuses through its status line', () => {
    const accepted = vi.fn(), refused = vi.fn(), notify = vi.fn();
    const ctx = panelContext(page({ accepted, refused }), new AbortController().signal);
    ctx.ui.accepted();
    ctx.ui.refused('The layout takes no edit now');
    expect(accepted).toHaveBeenCalledOnce();
    expect(refused).toHaveBeenCalledWith('The layout takes no edit now');
    const bare = panelContext(page({ notify }), new AbortController().signal);
    bare.ui.refused('No');
    expect(notify).toHaveBeenCalledWith('No', true);
    expect(() => bare.ui.accepted()).not.toThrow();
    expect(typeof bare.ui.notify('x').dismiss).toBe('function');
  });

  it('R4 (1): the pulse seam -- a panel\'s pulse(\'navigate\') pulses the one actuator once and shows no toast; accepted(words) pulses and toasts; a refusal never pulses; two panels share the actuator', () => {
    vi.useFakeTimers();
    try {
      document.body.replaceChildren();
      const status = document.createElement('span');
      const toastEl = document.createElement('div');
      document.body.append(status, toastEl);
      const n = createNotifier({ doc: document, status, toast: toastEl });
      const playEffect = vi.fn(async (_type: 'dual-rumble', _params: typeof FORGE_ACCEPT_PULSE) => undefined);
      const actuator = { playEffect };
      const actuatorOf = vi.fn(() => actuator);
      n.onPulse(forgePulse(actuatorOf));                         // the page's one haptic path
      // the page's ui as the page wires it (`shellUi`): pulse, accepted and refused are the notifier's
      const ui = { notify: (m: string) => n.notify(m), toast: (m: string) => n.toast(m), pulse: (k: 'navigate' | 'accept' | 'refuse') => n.pulse(k),
        accepted: (m?: string) => n.accepted(m), refused: (m: string) => n.refused(m) };
      const a = panelContext(page(ui), new AbortController().signal);
      const b = panelContext(page(ui), new AbortController().signal);
      a.ui.pulse('navigate');
      expect(playEffect).toHaveBeenCalledOnce();
      expect(playEffect).toHaveBeenCalledWith('dual-rumble', FORGE_ACCEPT_PULSE);
      expect(toastEl.classList.contains('is-on')).toBe(false);   // a cursor move is no passing event
      expect(n.history()).toEqual([]);
      a.ui.accepted('Placed');
      expect(playEffect).toHaveBeenCalledTimes(2);
      expect(toastEl.classList.contains('is-on')).toBe(true);
      expect(toastEl.textContent).toBe('Placed');
      a.ui.accepted();                                           // no words: the pulse alone
      expect(playEffect).toHaveBeenCalledTimes(3);
      expect(n.history().map((e) => e.text)).toEqual(['Placed']);
      // FCW-S1-HAPTICS names accepted navigate / select / back / adjust only: a refusal never pulses, by either path
      a.ui.refused('Return to Build to place assets');
      a.ui.pulse('refuse');
      expect(playEffect).toHaveBeenCalledTimes(3);
      expect(FORGE_PULSE_KINDS.has('refuse')).toBe(false);
      // a second panel's pulse reaches the same actuator through the same listener
      b.ui.pulse('navigate');
      b.ui.accepted();
      expect(playEffect).toHaveBeenCalledTimes(5);
      expect(actuatorOf.mock.results.every((r) => r.value === actuator)).toBe(true);
      // the older listener still hears accepted() alone (the page's haptics moved to onPulse)
      const heard = vi.fn();
      n.onAccepted(heard);
      a.ui.pulse('navigate');
      a.ui.accepted();
      expect(heard).toHaveBeenCalledOnce();
      // a rig with no page pulse: a panel's pulse is nothing, never a throw
      const bare = panelContext(page({}), new AbortController().signal);
      expect(() => bare.ui.pulse('navigate')).not.toThrow();
      n.dispose();
    } finally { vi.useRealTimers(); }
  });

  it('a panel\'s chip comes off when its signal aborts (unregistered, or the page torn down)', () => {
    const remove = vi.fn();
    const registerStatusChip = vi.fn((_spec: StatusChipSpec): StatusChipHandle => ({ update: () => undefined, remove }));
    const abort = new AbortController();
    const ctx = panelContext(page({ registerStatusChip }), abort.signal);
    ctx.ui.registerStatusChip({ id: 'probe', order: 90, text: () => 'Probe', tone: () => 'ready' });
    expect(registerStatusChip).toHaveBeenCalledOnce();
    abort.abort();
    expect(remove).toHaveBeenCalledOnce();
    const bare = panelContext(page({}), new AbortController().signal);
    expect(() => bare.ui.registerStatusChip({ id: 'x', order: 1, text: () => 'x', tone: () => 'ready' }).update()).not.toThrow();
  });
});
