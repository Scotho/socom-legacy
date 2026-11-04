// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConsoleController } from '../../src/console/grammar';
import { attachInput, type PadLike } from '../../src/console/input';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { CATS, HOME_CATEGORY, createState, type Adapters, type ConsolePageReads } from '../../src/console/state';

// Browser launcher adaptation: the hardware boundary is simulated; the input and menu controller are real.
const originalPads = Object.getOwnPropertyDescriptor(window.navigator, 'getGamepads');
let detach: (() => void) | undefined;
let dispose: (() => void) | undefined;
afterEach(() => {
  detach?.(); dispose?.(); detach = dispose = undefined;
  if (originalPads) Object.defineProperty(window.navigator, 'getGamepads', originalPads);
  else Reflect.deleteProperty(window.navigator, 'getGamepads');
  vi.restoreAllMocks();
});

function pad(index: number, button?: number, axes = [0, 0]) {
  return {
    index, connected: true, axes,
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: i === button, value: i === button ? 1 : 0 })),
    vibrationActuator: { playEffect: vi.fn().mockResolvedValue('complete'), reset: vi.fn().mockResolvedValue('complete') },
  };
}
function rig(pads: ReturnType<typeof pad>[], adjust?: (a: Adapters) => void, settle = false, focused = true, page?: ConsolePageReads) {
  vi.spyOn(document, 'hasFocus').mockReturnValue(focused);
  Object.defineProperty(window.navigator, 'getGamepads', { configurable: true, value: () => pads });
  const A = sampleAdapters();
  adjust?.(A);
  const c = new ConsoleController(page ? createState(A, 'overlay', page) : createState(A), A, { render() {}, announce() {}, fit() {} });
  dispose = () => c.dispose();
  let next: ((now: number) => void) | undefined;
  detach = attachInput(document, window, c, { keymap: true, settle, frame: {
    request(cb) { next = cb; return 1; }, cancel() { next = undefined; },
  } });
  return { c, A, step: (now: number) => next?.(now) };
}

describe('launcher controller menu feedback', () => {
  it.each([
    [0, 'confirm'], [1, 'back'], [2, 'secondary action'], [3, 'profile'], [4, 'previous tab'],
    [5, 'next tab'], [6, 'previous page'], [7, 'next page'], [9, 'start/refusal'],
    [12, 'up'], [13, 'down'], [14, 'left/value decrease'], [15, 'right/value increase'],
  ])('button %i (%s) gives one short pulse on its dispatch, never one per held frame', (button) => {
    const p = pad(3, button as number);
    const { step } = rig([p], (a) => { a.disc.state = () => 'empty'; a.pad.setConnected(false); });
    step(0); step(100);
    expect(p.vibrationActuator.playEffect).toHaveBeenCalledTimes(1);
    const [kind, effect] = p.vibrationActuator.playEffect.mock.calls[0]!;
    expect(kind).toBe('dual-rumble');
    expect(effect.duration).toBeGreaterThan(0);
    expect(effect.duration).toBeLessThanOrEqual(60);
    expect(effect.strongMagnitude).toBeGreaterThan(0);
    expect(effect.strongMagnitude).toBeLessThan(0.25);
    expect(effect.weakMagnitude).toBeGreaterThan(0);
    expect(effect.weakMagnitude).toBeLessThan(0.25);
  });

  it('analog and D-pad overlap gives one move and pulse, with another pulse for each navigation repeat', () => {
    const p = pad(2, 13, [0, 1]);
    const { c, step } = rig([p]);
    step(0);
    expect(c.S.item[HOME_CATEGORY]).toBe(1);
    step(300); step(401); step(450); step(502);
    expect(p.vibrationActuator.playEffect).toHaveBeenCalledTimes(3);
  });

  it('uses the physical index preserved by the remapped selected pad, never another connected pad', () => {
    const other = pad(0), selected = pad(7);
    const logical: PadLike = { index: 7, axes: [0, 0], buttons: pad(7, 5).buttons };
    const { c, step } = rig([other, selected], (a) => { a.pad.read = () => [logical]; });
    step(0);
    expect(CATS[c.S.cat]?.id).toBe('online');
    expect(selected.vibrationActuator.playEffect).toHaveBeenCalledTimes(1);
    expect(other.vibrationActuator.playEffect).not.toHaveBeenCalled();
  });

  it('analog navigation alone pulses the controller that moved the stick', () => {
    const untouched = pad(0), p = pad(4, undefined, [0, 1]);
    const { c, step } = rig([untouched, p]);
    step(0); step(401);
    expect(c.S.item[HOME_CATEGORY]).toBe(2);
    expect(p.vibrationActuator.playEffect).toHaveBeenCalledTimes(2);
    expect(untouched.vibrationActuator.playEffect).not.toHaveBeenCalled();
  });

  it('keyboard, pointer, wheel and direct controller calls never pulse physical pads', () => {
    const p = pad(0);
    const { c, step } = rig([p]);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    document.dispatchEvent(new Event('pointerdown'));
    document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    document.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, cancelable: true, bubbles: true }));
    c.padPress('down');
    step(0);
    expect(p.vibrationActuator.playEffect).not.toHaveBeenCalled();
  });

  it('respects live vibration changes and stops an outstanding pulse as soon as the preference is off', () => {
    const p = pad(1, 5);
    const { A, step } = rig([p]);
    step(0);
    A.options.set('vib', 0);
    step(16); step(401);
    expect(p.vibrationActuator.playEffect).toHaveBeenCalledTimes(1);
    expect(p.vibrationActuator.reset).toHaveBeenCalledTimes(1);
    A.options.set('vib', 1);
    step(502);
    expect(p.vibrationActuator.playEffect).toHaveBeenCalledTimes(2);
  });

  it('off in the real card-backed VIBRATION_CONTROLLER row silences controller actions', () => {
    const p = pad(1, 5);
    const { step } = rig([p], (a) => {
      a.options.categories = () => [{ id: 'controller', label: 'Controller', icon: 'pad', rows: [
        { id: 'VIBRATION_CONTROLLER', label: 'Vibration', values: ['Off', 'On'], def: 1, about: 'Controller feedback', note: 'Generated test preference' },
      ] }];
      a.options.value = () => 0;
    });
    step(0); step(401);
    expect(p.vibrationActuator.playEffect).not.toHaveBeenCalled();
  });

  it('turning vibration off through the controller stops that very action\'s pulse', () => {
    const p = pad(1, 14);
    const { c, A, step } = rig([p]);
    c.S.screen = 'options'; c.S.opt.cat = 2; c.S.opt.row = 1; c.S.opt.zone = 'rows';
    expect(A.options.value('vib')).toBe(1);
    step(0);
    expect(A.options.value('vib')).toBe(0);
    expect(p.vibrationActuator.playEffect).toHaveBeenCalledTimes(1);
    expect(p.vibrationActuator.reset).toHaveBeenCalledTimes(1);
  });

  it.each(['missing', 'locked'])('defaults feedback on when the vibration row is %s (launcher adaptation)', (kind) => {
    const p = pad(1, 5);
    const { step } = rig([p], (a) => {
      a.options.categories = () => kind === 'missing' ? [] : [{ id: 'controller', label: 'Controller', icon: 'pad', rows: [
        { id: 'VIBRATION_CONTROLLER', label: 'Vibration', values: ['Off', 'On'], locked: 'Needs disc', about: 'Controller feedback', note: 'Generated test preference' },
      ] }];
      a.options.value = () => 0;
    });
    step(0);
    expect(p.vibrationActuator.playEffect).toHaveBeenCalledTimes(1);
  });

  it('settling, report and binding capture stand down without feedback', () => {
    const p = pad(1, 5);
    const { c, step } = rig([p], undefined, true);
    step(0); step(401);
    expect(p.vibrationActuator.playEffect).not.toHaveBeenCalled();
    p.buttons = pad(1).buttons; step(420);
    p.buttons = pad(1, 5).buttons;
    vi.spyOn(c, 'capturing').mockReturnValue(true);
    step(440);
    expect(p.vibrationActuator.playEffect).not.toHaveBeenCalled();
    vi.spyOn(c, 'capturing').mockReturnValue(false);
    c.A.report = { isOpen: () => true } as NonNullable<Adapters['report']>;
    p.buttons = pad(1).buttons; step(460);
    p.buttons = pad(1, 5).buttons; step(480);
    expect(p.vibrationActuator.playEffect).not.toHaveBeenCalled();
  });

  it('detach stops only pads pulsed by this launcher input lifecycle', () => {
    const untouched = pad(0), p = pad(4, 5);
    const { step } = rig([untouched, p]);
    step(0);
    detach?.(); detach = undefined;
    expect(p.vibrationActuator.reset).toHaveBeenCalledTimes(1);
    expect(untouched.vibrationActuator.reset).not.toHaveBeenCalled();
  });

  it('blur and disconnect stop outstanding pulses; feedback resumes only after focus', () => {
    const p = pad(1, 5);
    const { step } = rig([p]);
    step(0);
    window.dispatchEvent(new Event('blur'));
    expect(p.vibrationActuator.reset).toHaveBeenCalledTimes(1);
    p.buttons = pad(1).buttons; step(16);
    p.buttons = pad(1, 5).buttons; step(32);
    expect(p.vibrationActuator.playEffect).toHaveBeenCalledTimes(1);
    p.buttons = pad(1).buttons; step(48);
    window.dispatchEvent(new Event('focus'));
    p.buttons = pad(1, 5).buttons; step(64);
    expect(p.vibrationActuator.playEffect).toHaveBeenCalledTimes(2);
    p.connected = false;
    window.dispatchEvent(new Event('gamepaddisconnected'));
    expect(p.vibrationActuator.reset).toHaveBeenCalledTimes(2);
  });

  it('a held shoulder cannot restart rumble while the visible launcher is blurred', () => {
    const p = pad(1, 5);
    const { c, step } = rig([p]);
    c.S.cat = CATS.findIndex((category) => category.id === 'profile'); // The first (LR.R2): room for four steps before the clamped end.
    expect(document.hidden).toBe(false);
    step(0);
    window.dispatchEvent(new Event('blur'));
    step(401); step(502);
    expect(c.S.cat).toBe(3); // Keep the input walk and repeat timing; gate only the adaptation's feedback.
    expect(p.vibrationActuator.playEffect).toHaveBeenCalledTimes(1);
    expect(p.vibrationActuator.reset).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('focus'));
    step(603);
    expect(c.S.cat).toBe(4);
    expect(p.vibrationActuator.playEffect).toHaveBeenCalledTimes(2);
  });

  // F2 of the #509 review (LR-0; LR.R11: "silent ... under a running round"): the overlay boots this console with
  // mode 'overlay', and its host reports the round; while one runs the game owns the pad's motors.
  it('F2: under the overlay, no menu pulse while a round runs; the pulse comes back when the round ends', () => {
    let round = true;
    const p = pad(1, 13);
    const { c, step } = rig([p], undefined, false, true, { gameHolds: () => false, roundRunning: () => round, gamePage: () => true });
    step(0);
    expect(c.S.item[HOME_CATEGORY]).toBe(1);                          // the menu still moves
    expect(p.vibrationActuator.playEffect).not.toHaveBeenCalled();
    round = false;
    p.buttons = pad(1).buttons; step(16);
    p.buttons = pad(1, 13).buttons; step(32);
    expect(p.vibrationActuator.playEffect).toHaveBeenCalledTimes(1);
  });

  it('F2: a round that starts under the overlay during a pulse stops it', () => {
    let round = false;
    const p = pad(1, 13);
    const { step } = rig([p], undefined, false, true, { gameHolds: () => false, roundRunning: () => round, gamePage: () => true });
    step(0);
    expect(p.vibrationActuator.playEffect).toHaveBeenCalledTimes(1);
    round = true;
    p.buttons = pad(1).buttons; step(16);
    expect(p.vibrationActuator.reset).toHaveBeenCalledTimes(1);
  });

  it('input attached to an already unfocused visible document stays quiet until focus', () => {
    const p = pad(1, 5);
    const { step } = rig([p], undefined, false, false);
    step(0); step(401);
    expect(p.vibrationActuator.playEffect).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('focus'));
    step(502);
    expect(p.vibrationActuator.playEffect).toHaveBeenCalledTimes(1);
  });

  it('a controller action that detaches input cannot start another pulse or schedule another poll', () => {
    const p = pad(1, 0);
    p.buttons[1] = { pressed: true, value: 1 };
    const { c, step } = rig([p]);
    const press = c.padPress.bind(c);
    vi.spyOn(c, 'padPress').mockImplementation((b) => { press(b); detach?.(); });
    step(0); step(16);
    expect(p.vibrationActuator.playEffect).toHaveBeenCalledTimes(1);
    expect(p.vibrationActuator.reset).toHaveBeenCalledTimes(1);
  });

  it('changing a setting, backing out, and a refused START each pulse through the real menu grammar', () => {
    const p = pad(1, 15);
    const { A, c, step } = rig([p], (a) => { a.disc.state = () => 'empty'; a.pad.setConnected(false); });
    c.S.screen = 'options'; c.S.opt.cat = 0; c.S.opt.row = 0; c.S.opt.zone = 'rows';
    const before = A.options.value('res');
    step(0);
    expect(A.options.value('res')).toBe(before + 1);
    p.buttons = pad(1).buttons; step(16);
    p.buttons = pad(1, 1).buttons; step(32);
    expect(c.S.opt.zone).toBe('cats');
    p.buttons = pad(1).buttons; step(48);
    p.buttons = pad(1, 1).buttons; step(64);
    expect(c.S.screen).toBe('home');
    p.buttons = pad(1).buttons; step(80);
    p.buttons = pad(1, 9).buttons; step(96);
    expect(c.S.screen).toBe('home');
    expect(c.S.legendError).toContain('Choose your disc');
    expect(p.vibrationActuator.playEffect).toHaveBeenCalledTimes(4);
  });

  it.each([4, 5])('held shoulder %i gives another pulse on each tab repeat', (button) => {
    const p = pad(1, button);
    const { step } = rig([p]);
    step(0); step(300); step(401); step(450); step(502);
    expect(p.vibrationActuator.playEffect).toHaveBeenCalledTimes(3);
  });
});
