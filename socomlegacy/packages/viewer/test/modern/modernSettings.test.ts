// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { CardSlots, FIO, Libmc, PERSONA_FILE_PATH, PERSONA_SAVE_DIR, PersonaCard } from '@s2u/card';
import { OPTION_VALVES, SLIDER_STEP_UNIT, SYSTEM_TUNERS } from '@s2u/ui';
import { CONTROLS, GROUPS, NOT_OFFERED, SLIDER_STEP_PERCENT, SCREEN_ORIGIN_X, SCREEN_ORIGIN_Y } from '../../src/modern/settings/model';
import { cardOptionStore } from '../../src/modern/settings/store';

/**
 * MU-5's settings (`src/modern/settings/`): a browser adaptation (MU.R1) over the card's option valves and system tuners,
 * through the original's own functions (`restoreValveModule`, `valveModule`, `PersonaCard.setPart`; MU.R2) -- never a
 * second store. The ISO's part (the defaults of `global_valves.rdr`) waits for the disc (MU.R3). CX-25 retired the
 * section's page (`settings/index.ts`, mounted by the retired shell alone); its model and its card store stay, the
 * console's Options' (`src/console/adapters/options.ts`, CX.R5), and are held here.
 */

describe('the settings model (the console\'s Options read it)', () => {
  describe('what it offers', () => {
    it('every option valve of the original is either a control or named as not offered, with its reason', () => {
      const offered = CONTROLS.filter((c) => c.kind !== 'slider').map((c) => (c as { valve: string }).valve);
      const left = NOT_OFFERED.map((n) => n.valve);
      expect([...offered, ...left].sort()).toEqual([...OPTION_VALVES].sort());
      expect(new Set([...offered, ...left]).size).toBe(OPTION_VALVES.length);
      for (const n of NOT_OFFERED) expect(n.why.length).toBeGreaterThan(10);
    });
    it('every system tuner of InitSystemTuners is a slider (the eight, the stick ones once)', () => {
      const names = CONTROLS.filter((c) => c.kind === 'slider').map((c) => (c as { tuner: string }).tuner).sort();
      expect(names).toEqual([...new Set(SYSTEM_TUNERS.map((t) => t.name))].sort());
      expect(names).toHaveLength(8);
    });
    it('the step is the original\'s: a two-percent track step', () => {
      expect(SLIDER_STEP_PERCENT).toBe(2);
      expect(SLIDER_STEP_PERCENT * SLIDER_STEP_UNIT).toBeCloseTo(0.02, 6);
    });
    it('the screen position keeps the original\'s bounds (X 0..250, Y 80..250, one step)', () => {
      expect(SCREEN_ORIGIN_X).toEqual({ min: 0, max: 250, step: 1 });
      expect(SCREEN_ORIGIN_Y).toEqual({ min: 80, max: 250, step: 1 });
    });
  });

  describe('safety', () => {
    it('every string is text: labels carry no markup characters', () => {
      for (const c of CONTROLS) expect(c.label).not.toMatch(/[<>&]/);
      for (const g of GROUPS) expect(g.label).not.toMatch(/[<>&]/);
    });
  });
});

describe('the card store: the original\'s functions over the page\'s card', () => {
  const memory = () => {
    const m = new Map<string, string>();
    const storage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); } };
    const slots = new CardSlots(() => storage as unknown as Storage, () => undefined, { now: () => 5_000 });
    return { slots, m };
  };
  const reread = (slots: CardSlots) => {
    const card = new PersonaCard(new Libmc(slots, { log: () => {}, now: () => 9_000 }), 0);
    const r = card.load();
    return { card, r };
  };

  it('a blank card: a valve write makes the save file with the CValveSaveManager module holding that valve', () => {
    const { slots } = memory();
    const s = cardOptionStore(slots);
    expect(s.usable()).toBe(true);
    expect(s.valve('BOBBING_1ST_PERSON')).toBeUndefined();
    expect(s.setValve('BOBBING_1ST_PERSON', 0)).toBe(true);
    expect(s.valve('BOBBING_1ST_PERSON')).toBe(0);
    expect(reread(slots).card.part('CValveSaveManager')).toEqual({ BOBBING_1ST_PERSON: 0 });
  });
  it('a valve write keeps the module\'s other names (as read) and a value keeps its low 16 bits', () => {
    const { slots } = memory();
    const mc = new Libmc(slots, { log: () => {}, now: () => 9_000 });
    const c = new PersonaCard(mc, 0);
    c.load(); c.setPart('CValveSaveManager', { SetSabre: 1, AutoAim: 1, GameSpeedFilter: 65000 }); c.save();
    const s = cardOptionStore(slots);
    expect(s.setValve('AutoAim', 0)).toBe(true);
    expect(reread(slots).card.part('CValveSaveManager')).toEqual({ SetSabre: 1, AutoAim: 0, GameSpeedFilter: 65000 });
  });
  it('a tuner is written as a real into the CUIVarManager module beside the other variables, and reads back clamped', () => {
    const { slots } = memory();
    const c = new PersonaCard(new Libmc(slots, { log: () => {}, now: () => 9_000 }), 0);
    c.load(); c.setPart('CUIVarManager', { MPTAUNTMSG1: { type: 'string', value: 'hi' }, MUSIC_VOLUME: { type: 'real', value: 7 } }); c.save();
    const s = cardOptionStore(slots);
    expect(s.tuner('MUSIC_VOLUME')).toBe(1);                // clamped into [0, 1] as `restoreUiVarModule` reads it
    expect(s.tuner('SOUND_VOLUME')).toBeUndefined();
    expect(s.setTuner('SOUND_VOLUME', 0.5)).toBe(true);
    const part = reread(slots).card.part('CUIVarManager') as Record<string, unknown>;
    expect(part['SOUND_VOLUME']).toEqual({ type: 'real', value: 0.5 });
    expect(part['MPTAUNTMSG1']).toEqual({ type: 'string', value: 'hi' });
  });
  it('a malformed save file is refused, never overwritten', () => {
    const { slots } = memory();
    const mc = new Libmc(slots, { log: () => {}, now: () => 9_000 });
    mc.mkdir(0, 0, PERSONA_SAVE_DIR);
    const fd = mc.open(0, 0, PERSONA_FILE_PATH, FIO.O_WRONLY | FIO.O_CREAT);
    mc.write(fd, 4_784, { CAcctDB: 'not the persona module' });
    mc.close(fd);
    const s = cardOptionStore(slots);
    expect(s.usable()).toBe(false);
    expect(s.setValve('AutoAim', 0)).toBe(false);
    expect(s.setTuner('SOUND_VOLUME', 0.5)).toBe(false);
    const again = new PersonaCard(new Libmc(slots, { log: () => {}, now: () => 9_000 }), 0);
    expect(again.load().malformed).toBeDefined();
  });
});
