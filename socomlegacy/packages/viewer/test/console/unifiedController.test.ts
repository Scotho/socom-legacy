// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CardSlots } from '@s2u/card';
import { stickTunersOfPreset, type ValveEntry } from '@s2u/ui';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { liveOptions } from '../../src/console/adapters/options';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { cardOptionStore } from '../../src/modern/settings/store';
import type { LauncherState } from '../../src/modern/launcherState';
import { mountShell } from './shell';

let page: ConsolePage | null = null;
beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; vi.restoreAllMocks(); vi.useRealTimers(); localStorage.clear(); });

function boot() {
  const slots = new CardSlots(() => localStorage, () => undefined, { now: () => 5000 });
  const store = cardOptionStore(slots);
  const table: ValveEntry[] = [
    { name: 'SelectedControllerConfig', value: 1, type: 'PERSIST' },
    { name: 'ChosePresetOnce', value: 0, type: 'PERSIST' },
    { name: 'stick_preset', value: 3, type: 'PERSIST' },
    ...['VIBRATION_CONTROLLER', 'AutoAim', 'INVERT_PITCH_CONTROLLER', 'FIREMODESWAP_CONTROLLER'].map(name => ({ name, value: 0, type: 'PERSIST' as const })),
  ];
  store.seed!(table);
  store.setValve('stick_preset', 3);
  const launcher = { isoInserted: () => true, assets: () => ({ readValveDefaults: async () => table }), onChange: () => () => {} } as unknown as LauncherState;
  const options = liveOptions(() => page?.render(), { store, launcher, signedIn: () => false });
  page = bootConsole(document, window, { ...sampleAdapters(), options }, { keymap: true });
  page.ctl.doAct('opt:controller');
  page.render();
  return { slots, store, options, rows: () => options.categories().find(c => c.id === 'controller')!.rows };
}

describe('one shared Controller page', () => {
  it('offers all four original layouts and saves both original selection fields together', () => {
    const { slots, options, rows } = boot();
    expect(rows().find(r => r.id === 'SelectedControllerConfig')?.values).toEqual(['Precision Shooter', 'Lefty', 'Scout', 'Sure Shot']);
    for (const index of [3, 2, 1, 0, 2]) {
      options.set('SelectedControllerConfig', index);
      const saved = cardOptionStore(slots);
      expect(saved.valve('SelectedControllerConfig')).toBe(index + 1);
      expect(saved.valve('ChosePresetOnce')).toBe(1);
      expect(options.value('SelectedControllerConfig')).toBe(index);
    }
  });

  for (const id of ['STICK_SENSITIVITY', 'STICK_INERTIA', 'STICK_DEADZONE']) {
    it(id + ': pointer positions sweep every percent down and back up, pad steps stay 2%, and close saves', () => {
      const { slots, options, rows } = boot();
      const index = rows().findIndex(r => r.id === id);
      for (const percent of [...Array.from({ length: 101 }, (_, i) => 100 - i), ...Array.from({ length: 101 }, (_, i) => i)]) {
        page!.ctl.optSlide(index, percent / 100);
        expect(options.value(id), 'pointer at ' + percent).toBe(percent);
      }
      page!.ctl.optSlide(index, .5);
      page!.ctl.optStep(-1);
      expect(options.value(id)).toBe(48);
      page!.ctl.optStep(1);
      expect(options.value(id)).toBe(50);
      options.set(id, 73);
      options.dispose();
      expect(cardOptionStore(slots).tuner(id)).toBeCloseTo(.73);
    }, 30000);
  }

  it('all aiming presets supply their original values and only Custom unlocks the sliders', () => {
    const { store, options, rows } = boot();
    for (const preset of [0, 1, 2, 3, 2, 0, 3]) {
      options.set('stick_preset', preset);
      if (preset < 3) {
        const t = stickTunersOfPreset(preset);
        expect([store.tuner('STICK_SENSITIVITY'), store.tuner('STICK_INERTIA'), store.tuner('STICK_DEADZONE')]).toEqual([t.sensitivity, t.inertia, t.deadZone]);
      }
      for (const id of ['STICK_SENSITIVITY', 'STICK_INERTIA', 'STICK_DEADZONE']) {
        expect(!!rows().find(r => r.id === id)?.locked).toBe(preset !== 3);
        const before = options.value(id);
        options.set(id, 63);
        expect(options.value(id)).toBe(preset === 3 ? 63 : before);
      }
    }
  });

  it('Custom on a fresh card initializes all three aiming values before the first adjustment', () => {
    const { store, options } = boot();
    expect(store.tuner('STICK_SENSITIVITY')).toBeUndefined();
    options.set('stick_preset', 3);
    const t = stickTunersOfPreset(0);
    expect([store.tuner('STICK_SENSITIVITY'), store.tuner('STICK_INERTIA'), store.tuner('STICK_DEADZONE')]).toEqual([t.sensitivity, t.inertia, t.deadZone]);
    options.set('STICK_SENSITIVITY', 51);
    expect(store.tuner('STICK_SENSITIVITY')).toBe(Math.fround(.51));
    expect(store.tuner('STICK_INERTIA')).toBe(t.inertia);
    expect(store.tuner('STICK_DEADZONE')).toBe(t.deadZone);
  });

  // Review F1 (simulation track): the boot's UIStoreOptions lays the STORED preset's three into the sliders
  // (FUN_0027b960 D:L125202-125230) and SetStickPreset under CUSTOM writes nothing (FUN_0027b790 D:L125077-125078), so
  // Custom over a stored SAILOR or SEAL with no slider values keeps that preset's three; RECRUIT's only from 0 (or 3).
  for (const stored of [1, 2] as const) {
    it(`Custom over a stored preset ${stored} with no slider values keeps that preset's three (the store's transaction)`, () => {
      const { store } = boot();
      expect(store.setValve('stick_preset', stored)).toBe(true);
      expect(store.tuner('STICK_SENSITIVITY')).toBeUndefined();
      expect(store.setStickPreset!(3)).toBe(true);
      const t = stickTunersOfPreset(stored);
      expect([store.tuner('STICK_SENSITIVITY'), store.tuner('STICK_INERTIA'), store.tuner('STICK_DEADZONE')]).toEqual([t.sensitivity, t.inertia, t.deadZone]);
    });
    it(`Custom over a stored preset ${stored} with no slider values keeps that preset's three (a store without the transaction)`, () => {
      const slots = new CardSlots(() => localStorage, () => undefined, { now: () => 5000 });
      const full = cardOptionStore(slots);
      full.seed!([{ name: 'stick_preset', value: 0, type: 'PERSIST' }]);
      expect(full.setValve('stick_preset', stored)).toBe(true);
      const { setStickPreset: _omit, ...bare } = full;
      const launcher = { isoInserted: () => true, assets: () => ({ readValveDefaults: async () => [] }), onChange: () => () => {} } as unknown as LauncherState;
      const options = liveOptions(() => {}, { store: bare, launcher, signedIn: () => false });
      options.set('stick_preset', 3);
      const t = stickTunersOfPreset(stored);
      expect([full.tuner('STICK_SENSITIVITY'), full.tuner('STICK_INERTIA'), full.tuner('STICK_DEADZONE')]).toEqual([t.sensitivity, t.inertia, t.deadZone]);
      options.dispose();
    });
  }

  it('a refused layout save changes neither saved field and reports the refusal', async () => {
    const { slots, store, options, rows } = boot();
    expect(store.setControllerLayout!(1)).toBe(true);
    const fail = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage refused'); });
    options.set('SelectedControllerConfig', 2);
    expect(cardOptionStore(slots).valve('SelectedControllerConfig')).toBe(1);
    expect(cardOptionStore(slots).valve('ChosePresetOnce')).toBe(1);
    expect(rows().find(r => r.id === 'SelectedControllerConfig')?.note).toContain('Not saved:');
    fail.mockRestore();
    options.set('SelectedControllerConfig', 2);
    expect(cardOptionStore(slots).valve('SelectedControllerConfig')).toBe(3);
    expect(rows().find(r => r.id === 'SelectedControllerConfig')?.note).toContain('Saved to');
  });

  it('a deferred tuner save reports pending, then refusal, and can recover with the next adjustment', async () => {
    const { slots, store, options, rows } = boot();
    store.setTuner('STICK_SENSITIVITY', .2);
    options.set('STICK_SENSITIVITY', 73);
    expect(rows().find(r => r.id === 'STICK_SENSITIVITY')?.note).toContain('Saving');
    const fail = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage refused'); });
    await vi.advanceTimersByTimeAsync(450);
    expect(cardOptionStore(slots).tuner('STICK_SENSITIVITY')).toBe(.2);
    expect(rows().find(r => r.id === 'STICK_SENSITIVITY')?.note).toContain('Not saved:');
    fail.mockRestore();
    options.set('STICK_SENSITIVITY', 74);
    await vi.advanceTimersByTimeAsync(450);
    expect(cardOptionStore(slots).tuner('STICK_SENSITIVITY')).toBe(Math.fround(.74));
    expect(rows().find(r => r.id === 'STICK_SENSITIVITY')?.note).toContain('Saved to');
  });

  it('preset selection is one persisted transaction and refuses the whole change on storage failure', () => {
    const { slots, store } = boot();
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    expect(store.setStickPreset!(3)).toBe(true);
    expect(writes).toHaveBeenCalledTimes(1);
    const before = ['STICK_SENSITIVITY', 'STICK_INERTIA', 'STICK_DEADZONE'].map(n => store.tuner(n));
    writes.mockImplementation(() => { throw new Error('storage refused'); });
    expect(store.setStickPreset!(2)).toBe(false);
    const fresh = cardOptionStore(slots);
    expect(fresh.valve('stick_preset')).toBe(3);
    expect(['STICK_SENSITIVITY', 'STICK_INERTIA', 'STICK_DEADZONE'].map(n => fresh.tuner(n))).toEqual(before);
  });

  it('pagehide flushes a pending adjustment before the settle timer has run', () => {
    const { slots, store, options } = boot();
    store.setTuner('STICK_SENSITIVITY', .2);
    options.set('STICK_SENSITIVITY', 74);
    expect(store.pending!()).toBe(true);
    expect(cardOptionStore(slots).tuner('STICK_SENSITIVITY')).toBe(.2);
    window.dispatchEvent(new Event('pagehide'));
    expect(store.pending!()).toBe(false);
    expect(cardOptionStore(slots).tuner('STICK_SENSITIVITY')).toBe(Math.fround(.74));
  });

  it('every original toggle and fire-rate/pitch choice saves both ways', () => {
    const { slots, options } = boot();
    for (const id of ['VIBRATION_CONTROLLER', 'AutoAim', 'INVERT_PITCH_CONTROLLER', 'FIREMODESWAP_CONTROLLER']) {
      for (const value of [1, 0, 1]) {
        options.set(id, value);
        expect(cardOptionStore(slots).valve(id)).toBe(value);
        expect(options.value(id)).toBe(value);
      }
    }
  });
});
