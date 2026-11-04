// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../../src/console/app';
import { livePad } from '../../../src/console/adapters/pad';
import { padFrame, type Held } from '../../../src/console/input';
import { sampleAdapters } from '../../../src/console/sampleAdapters';
import { deployChecks } from '../../../src/console/state';
import type { PadLike } from '../../../src/gamepad';
import { mountShell } from '../shell';

/**
 * The console launcher's pad adapter (slice 2, part b): "connected" is a standard-layout pad read (the deviceStore rule,
 * `../../src/startup.ts` `publishDevices`: `input.raw.mapping === 'standard'`); the pad is read through the setup page's
 * saved choices (`../../src/setupPad.ts` `GamePad`: the chosen device, its bindings and its dead zone, 0.15 by default),
 * and the launcher's own menu reading stays the design's (a circular 0.24 dead zone, 400 / 100 ms repeat). The header's
 * lamp and Home's Controller item read it. Storage is the page's (`pageSettings` over jsdom's localStorage). A browser
 * adaptation with no original (OT.R28).
 */
let page: ConsolePage | null = null;
beforeEach(() => { localStorage.clear(); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; localStorage.clear(); });

function pad(o: { mapping?: string; axes?: number[]; down?: number[]; id?: string } = {}): PadLike {
  return {
    id: o.id ?? 'Wireless Controller (STANDARD GAMEPAD)', index: 0, connected: true, mapping: o.mapping ?? 'standard',
    axes: o.axes ?? [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: (o.down ?? []).includes(i), value: (o.down ?? []).includes(i) ? 1 : 0, touched: false })),
  } as PadLike;
}
/** The pad's own profile key, as `../../src/controllerInput.ts` names it (`s2u.startup.v1.pad.<[id, mapping, buttons, axes]>`). */
const profileKey = (p: PadLike): string => `s2u.startup.v1.pad.${JSON.stringify([p.id, p.mapping, p.buttons.length, p.axes.length])}`;
const saveProfile = (p: PadLike, o: { deadZone?: number; bindings?: number[] }): void => {
  localStorage.setItem(profileKey(p), JSON.stringify({ version: 1, bindings: o.bindings ?? Array.from({ length: 16 }, (_, i) => i), deadZone: o.deadZone ?? 0.15, crouch: -1 }));
};

function live(pads: () => PadLike[]) {
  const notify = vi.fn();
  const adapter = livePad(notify, { source: { getGamepads: () => pads() } });
  return { adapter, notify };
}

describe('the pad adapter', () => {
  it('no pad: not connected -- the lamp says Press a button and the Controller item waits', () => {
    const { adapter } = live(() => []);
    expect(adapter.read()).toEqual([]);
    expect(adapter.connected()).toBe(false);
    page = bootConsole(document, window, { ...sampleAdapters(), data: 'live', states: undefined, pad: adapter }, { keymap: true });
    // LP.R8 / LP.R11: the pad's status left the header for the legend's device cue and the Controller item.
    const cue = document.querySelector('#legend .cx-mark[data-mark="pad"]')!;   // LR-24 (was: [data-device=pad])
    expect(cue.getAttribute('aria-label')).toBe('No controller connected');
    expect(cue.classList.contains('cx-status--danger')).toBe(true);
    // LR-23 (LR.R22): the Controller step's line and word (was LR-13's controller check of Play's panel, its drawn hint).
    expect(deployChecks(page.ctl.S, page.ctl.A)[1]!.sub).toBe('Press any button on your controller');
    expect(deployChecks(page.ctl.S, page.ctl.A)[1]!.state?.[0]).toBe('WAITING');
  });

  it('a standard pad read is connected, said once; the lamp reads Pad 1', () => {
    let pads: PadLike[] = [];
    const { adapter, notify } = live(() => pads);
    page = bootConsole(document, window, { ...sampleAdapters(), data: 'live', states: undefined, pad: adapter }, { keymap: true });
    pads = [pad()];
    adapter.read();
    adapter.read();
    expect(adapter.connected()).toBe(true);
    expect(notify).toHaveBeenCalledTimes(1);
    page.render();
    const cue = document.querySelector('#legend .cx-mark[data-mark="pad"]')!;   // LP.R8 / LP.R11, as above; LR-24 (was: [data-device=pad])
    expect(cue.getAttribute('aria-label')).toBe('Controller connected');
    expect(cue.classList.contains('cx-status--ready')).toBe(true);
    expect(deployChecks(page.ctl.S, page.ctl.A)[1]!.sub).toBe('Pad 1 connected');   // LR-23 (was LR-13's drawn hint)
    expect(deployChecks(page.ctl.S, page.ctl.A)[1]!.state?.[0]).toBe('READY');
  });

  it('a pad without the standard mapping is not connected', () => {
    const { adapter } = live(() => [pad({ mapping: '' })]);
    adapter.read();
    expect(adapter.connected()).toBe(false);
  });

  it('the dead zone is the saved profile\'s, 0.15 by default', () => {
    const p = pad();
    const a = live(() => [p]).adapter;
    a.read();
    expect(a.deadZone()).toBe(0.15);
    saveProfile(p, { deadZone: 0.3 });
    const b = live(() => [p]).adapter;
    b.read();
    expect(b.deadZone()).toBe(0.3);
  });

  it('the saved bindings apply: a pad whose Circle is bound to Cross presses Cross', () => {
    const p0 = pad();
    const bindings = Array.from({ length: 16 }, (_, i) => i);
    bindings[0] = 1; bindings[1] = 0;
    saveProfile(p0, { bindings });
    let current = p0;
    const { adapter } = live(() => [current]);
    const held: Held = {};
    expect(padFrame(adapter.read(), held, 0)).toEqual([]);          // at rest first (the setup page's START held is no press)
    current = pad({ down: [1] });
    expect(padFrame(adapter.read(), held, 16)).toEqual(['cross']);
  });

  it('the user\'s dead zone calibrates the stick first; the menu\'s 0.24 then reads it', () => {
    const p0 = pad();
    saveProfile(p0, { deadZone: 0.3 });
    let current = p0;
    const { adapter } = live(() => [current]);
    const held: Held = {};
    padFrame(adapter.read(), held, 0);
    current = pad({ axes: [0.28, 0, 0, 0] });                        // inside the user's 0.3: nothing
    expect(padFrame(adapter.read(), held, 16)).toEqual([]);
    current = pad({ axes: [0.5, 0, 0, 0] });                         // calibrated to about 0.39: over the menu's 0.24
    expect(padFrame(adapter.read(), held, 32)).toEqual(['right']);
  });
});
