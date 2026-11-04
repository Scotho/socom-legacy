import { describe, expect, it } from 'vitest';
import { ActionSelection, ActionLifecycle } from '../src/actionContext';

describe('original contextual action rotation (research 303)', () => {
  it('rotation from a bomb hold releases the newly selected one-shot, and rotation back holds without firing it', () => {
    const s = new ActionSelection(), inputs = { bombPlant: true, victory: true };
    const life = new ActionLifecycle(() => s.pick(inputs));
    life.press(); life.hold(1);
    s.rotate('left'); life.reselect();
    expect(life.heldContext()).toBe('victory');
    expect(life.release().fire).toBe('victory');
    life.press(); s.rotate('right'); life.reselect();
    expect(life.heldContext()).toBe('bombPlant');
    expect(life.release().fire).toBeNull();
  });
  it('does not repeat a held direction or leak it into peeking after Cross release', () => {
    const s = new ActionSelection(), inputs = { door: true, c4: true };
    s.pick(inputs);
    expect(s.pad(true, true, false)).toEqual({ left: false, right: false });
    expect(s.pick(inputs)).toBe('c4');
    for (let n = 0; n < 90; n++) s.pad(true, true, false);
    expect(s.pick(inputs)).toBe('c4');
    expect(s.pad(false, true, false).left).toBe(false);
    s.pad(false, false, false);
    expect(s.pad(false, true, false).left).toBe(true);
  });
  it('holds the selected head until availability changes; left moves head to tail, right tail to head', () => {
    const s = new ActionSelection();
    const inputs = { door: true, c4: true, bombDrop: true };
    expect(s.pick(inputs)).toBe('door');
    s.rotate('left');
    expect(s.pick(inputs)).toBe('c4');
    expect(s.pick(inputs)).toBe('c4');
    s.rotate('right');
    expect(s.pick(inputs)).toBe('door');
    s.rotate('right');
    expect(s.pick(inputs)).toBe('bombDrop');
    expect(s.pick({ ...inputs, c4: false })).toBe('door');
    expect(s.pick({})).toBeNull();
  });
  // AD-6 (FUN_0021f850 D:L74050-74293, each entry at the tail: FUN_002209c0 D:L74589-74590): offered together -- the order
  // of what is offered together, not a claim the original offers these at once -- the list is the bits' order.
  it("AD-6: the list offered together is FUN_0021f850's order -- the turret ahead of C4, the victory point ahead of a pickup -- and the rotation cycles it in that order", () => {
    const s = new ActionSelection();
    const inputs = { bombDrop: true, escortee: true, pickup: true, victory: true, c4: true, turret: true };
    expect(s.pick(inputs)).toBe('turret');
    const cycled: string[] = [];
    for (let n = 0; n < 6; n++) { cycled.push(s.pick(inputs)!); s.rotate('left'); }
    expect(cycled).toEqual(['turret', 'c4', 'victory', 'pickup', 'escortee', 'bombDrop']);
    expect(s.pick(inputs)).toBe('turret');                        // the whole list turned once: the head again
    s.rotate('right');
    expect(s.pick(inputs)).toBe('bombDrop');                      // tail to head
    const t = new ActionSelection(), two = { pickup: true, victory: true };
    expect(t.pick(two)).toBe('victory');
    t.rotate('left');
    expect(t.pick(two)).toBe('pickup');
    const u = new ActionSelection(), mount = { c4: true, turret: true };
    const life = new ActionLifecycle(() => u.pick(mount));
    life.press();
    expect(life.heldContext()).toBe('turret');
    u.rotate('left'); life.reselect();
    expect(life.release().fire).toBe('c4');
  });
  it('only rotates on held Action + a directional press, and releases the selected action once', () => {
    const s = new ActionSelection();
    const life = new ActionLifecycle(() => s.pick({ door: true, c4: true }));
    s.pick({ door: true, c4: true });
    expect(s.input(false, true, false)).toBe(false);
    life.press();
    expect(s.input(true, true, false)).toBe(true);
    expect(s.input(true, false, false)).toBe(true);
    expect(life.release().fire).toBe('c4');
    expect(life.release().fire).toBeNull();
    life.press(); life.cancel('menu');
    expect(life.release().fire).toBeNull();
  });
});
