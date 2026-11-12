import { describe, expect, it } from 'vitest';
import { CardSlots, Libmc, PersonaCard } from '@s2u/card';
import { OptionGlobals, UiVarManager, ValveStore, VALVE_TYPE, initSystemTuners } from '@s2u/ui';
import { applyCommittedTuner, optionCommitted } from '../src/nativeOptionsContext';
import { lookStickOf } from '../src/look';
import { localStartMenuOptions, type StartMenuOptions } from '../src/startMenu';
import type { NativeOptionsState } from '../src/nativeOptionsHost';
import { playOptionsOf, VALVE_MODULE } from '../src/originalOptions';
import { adoptPageOptions, cardValves, liveStartMenuOptions, pageCardReads, pageEarlyCommits, screenOriginOf, teammateNamesValue, withPageHooks } from '../src/playerSettings';

/**
 * RB-3 (PS-1; the replay batch, product track -- a browser adaptation's seam, no behaviour change): the test room's
 * player-settings wiring, moved out of `../src/main.ts` into `../src/playerSettings.ts` as it was -- the early Home
 * commits before native Options exists, the START menu's live options, native Options' adoption of the local writes,
 * TEAMMATE NAMES' read. Each case holds the behaviour `main.ts` had inline (`main.ts:627-653, 2029` at `5855d575c`).
 */

const memory = (): CardSlots => {
  const m = new Map<string, string>();
  const storage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); } };
  return new CardSlots(() => storage as unknown as Storage, () => undefined, { now: () => 5_000 });
};

describe('pageEarlyCommits: a Home write heard before native Options exists (MLS.R7)', () => {
  it('a valve commit reaches the local START store; nothing once the live state is up', () => {
    const slots = memory();
    const local = localStartMenuOptions();
    let live = false;
    const stop = pageEarlyCommits(slots, { live: () => live, local, tuners: () => null, reread: () => { throw new Error('no tuner commit'); }, adopt: () => { throw new Error('no tuner commit'); } });
    optionCommitted(slots, 'valve', 'INVERT_PITCH_CONTROLLER', 1);
    expect(local.value('INVERT_PITCH_CONTROLLER')).toBe(1);
    live = true;
    optionCommitted(slots, 'valve', 'INVERT_PITCH_CONTROLLER', 0);
    expect(local.value('INVERT_PITCH_CONTROLLER')).toBe(1);   // the live state's from here on
    stop();
  });

  it("a tuner commit on the card's manager sets the variable; with no manager the card is read again", () => {
    const slots = memory();
    const vars = new UiVarManager();
    initSystemTuners(vars);
    let tuners: UiVarManager | null = vars;
    let rereads = 0;
    const reread = vars;
    const stop = pageEarlyCommits(slots, { live: () => false, local: localStartMenuOptions(), tuners: () => tuners,
      reread: () => { rereads++; tuners = reread; }, adopt: () => { throw new Error('the card held a manager'); } });
    optionCommitted(slots, 'tuner', 'MUSIC_VOLUME', 0.25);
    expect(vars.find('MUSIC_VOLUME')?.value).toEqual({ type: 'real', value: 0.25 });
    expect(rereads).toBe(0);
    tuners = null;                                              // the first save can create a card manager the page lacked
    optionCommitted(slots, 'tuner', 'MUSIC_VOLUME', 0.5);
    expect(rereads).toBe(1);
    expect(vars.find('MUSIC_VOLUME')?.value).toEqual({ type: 'real', value: 0.5 });   // and the commit lands on the one read
    stop();
    optionCommitted(slots, 'tuner', 'MUSIC_VOLUME', 0.75);      // stopped: heard no more
    expect(rereads).toBe(1);
  });

  // PR #765 (Chris's unified controller settings; a browser adaptation's wiring): a staged slider step is committed live
  // before its card write (`TUNER_SAVE_SETTLE_MS_ADAPTATION`), so on a fresh card the card read again still holds no
  // manager -- the step lands on a new one, laid as the boot's `InitSystemTuners` (FUN_0038a7a0) lays it, handed back.
  it('a tuner commit with no manager on the page nor on the card lands on a new boot manager, handed to adopt', () => {
    const slots = memory();
    let held: UiVarManager | null = null, rereads = 0;
    const stop = pageEarlyCommits(slots, { live: () => false, local: localStartMenuOptions(), tuners: () => held,
      reread: () => { rereads++; }, adopt: (t) => { held = t; } });
    optionCommitted(slots, 'tuner', 'STICK_SENSITIVITY', Math.fround(0.51));
    expect(rereads).toBe(1);
    expect(held).toBeInstanceOf(UiVarManager);
    expect(held!.find('STICK_SENSITIVITY')?.value).toEqual({ type: 'real', value: Math.fround(0.51) });
    const boot = new UiVarManager(); initSystemTuners(boot);
    expect(held!.find('MUSIC_VOLUME')?.value).toEqual(boot.find('MUSIC_VOLUME')?.value);   // the boot's tuners under it
    const first = held;
    optionCommitted(slots, 'tuner', 'STICK_INERTIA', Math.fround(0.4));
    expect(held).toBe(first);                                   // the next commit lands on the same manager
    expect(rereads).toBe(1);
    stop();
  });
});

describe('liveStartMenuOptions: the START menu over whichever store is live, asked at each call', () => {
  it('reads, sets and writes through the store the source answers now', () => {
    const a = localStartMenuOptions(), b = localStartMenuOptions();
    let current: StartMenuOptions = a;
    const options = liveStartMenuOptions(() => current);
    options.setGlobal('AutoAim', 0);
    expect(a.value('AutoAim')).toBe(0);
    current = b;
    expect(options.value('AutoAim')).toBeUndefined();
    const written: [string, number, string][] = [];
    current = { value: () => 7, setGlobal: () => {}, writeValve: (n, v, how) => { written.push([n, v, how]); } };
    options.writeValve('VIBRATION_CONTROLLER', 0, 'perm');
    expect(written).toEqual([['VIBRATION_CONTROLLER', 0, 'perm']]);
    expect(options.value('anything')).toBe(7);
  });
});

describe('adoptPageOptions: native Options takes the local START writes, then the early observer stops', () => {
  it('applies the writes to the state, hands it on, then stops -- in that order', () => {
    const local = localStartMenuOptions();
    local.setGlobal('INVERT_PITCH_CONTROLLER', 1);
    const valves = new ValveStore();
    const stored: number[] = [];
    const state = { valves, globals: { store: () => { stored.push(valves.find('INVERT_PITCH_CONTROLLER')?.value ?? -1); } } } as unknown as NativeOptionsState;
    const order: string[] = [];
    const got = adoptPageOptions(state, local, (s) => { order.push(s === state ? 'set' : 'other'); }, () => { order.push('stop'); });
    expect(got).toBe(state);
    expect(valves.find('INVERT_PITCH_CONTROLLER')).toMatchObject({ value: 1, type: VALVE_TYPE.TEMP });
    expect(stored).toEqual([1]);
    expect(order).toEqual(['set', 'stop']);
  });
});

describe("teammateNamesValue: TEAMMATE NAMES as the test room reads it (SS-2's 0 / 1)", () => {
  it("the valve of the store given (the test room hands the live one, else the card's: RB-16), else 1", () => {
    const valves = new ValveStore();
    expect(teammateNamesValue(null)).toBe(1);
    expect(teammateNamesValue(undefined)).toBe(1);
    expect(teammateNamesValue(valves)).toBe(1);
    valves.set('DISPLAY_MP_TEAM_NAMES', 0, VALVE_TYPE.PERSIST);
    expect(teammateNamesValue(valves)).toBe(0);
  });
});

/** A save file in `port`'s slot whose `CValveSaveManager` module is `module` (as `matchOptions.test.ts` seeds one). */
const seedValves = (slots: CardSlots, port: 0 | 1, module: unknown): void => {
  const card = new PersonaCard(new Libmc(slots, { log: () => {}, now: () => 9_000 }), port);
  card.load();
  card.setLogins([{ host: 'lobby.test', port: 10075, name: 'One', town: '', gender: 0, savePassword: false, password: null }]);
  card.setPart(VALVE_MODULE, module);
  expect(card.save()).toBeGreaterThanOrEqual(0);
};

describe("RB-16 (PS-4): the card's own valves, read where native Options is not up", () => {
  it("cardValves: none with no save file; the stored values with one (slot 1's, else slot 2's)", () => {
    const slots = memory();
    expect(cardValves(slots)).toBeNull();
    seedValves(slots, 1, { DISPLAY_MP_TEAM_NAMES: 0, ScreenOriginX: 131 });
    const v = cardValves(slots);
    expect(v?.find('DISPLAY_MP_TEAM_NAMES')?.value).toBe(0);
    expect(teammateNamesValue(v)).toBe(0);                      // the card's stored 0: names off on the test room too
    expect(v?.find('ScreenOriginX')?.value).toBe(131);
  });

  it('screenOriginOf: SCREEN POSITION as `SetScreenOrigin` lays it -- each valve less 128, an absent one 128', () => {
    expect(screenOriginOf(null)).toEqual({ x: 0, y: 0 });
    const valves = new ValveStore();
    valves.set('ScreenOriginX', 131, VALVE_TYPE.PERSIST);
    expect(screenOriginOf(valves)).toEqual({ x: 3, y: 0 });
    valves.set('ScreenOriginY', 120, VALVE_TYPE.PERSIST);
    expect(screenOriginOf(valves)).toEqual({ x: 3, y: -8 });
  });

  it("withPageHooks: native Options' SCREEN POSITION and VIDEO MODE hooks laid on the page's state, the same state answered", () => {
    const state = { valves: new ValveStore() } as unknown as NativeOptionsState;
    const laid: [number, number][] = [];
    const picture = { get: () => 'modern' as const, set: () => {} };
    const got = withPageHooks(state, { screenOrigin: (x, y) => { laid.push([x, y]); }, picture });
    expect(got).toBe(state);
    got.screenOrigin?.(2, 4);
    expect(laid).toEqual([[2, 4]]);
    expect(got.picture).toBe(picture);
  });
});

describe("RB-16 (RB-3's inline reads, PS-1): pageCardReads, the test room's card reads", () => {
  const reads = () => {
    let n = 0;
    const tuners = new UiVarManager(); initSystemTuners(tuners);
    const valves = new ValveStore(); valves.set('DISPLAY_MP_TEAM_NAMES', 0, VALVE_TYPE.PERSIST);
    return { counts: () => n, tuners, valves, read: {
      options: () => { n++; return playOptionsOf(null); }, tuners: () => tuners, valves: () => valves,
    } };
  };

  it("reads the card's OPTIONS, tuners and valves once, and a map change reads them again", () => {
    const r = reads();
    const card = pageCardReads(r.read, memory());
    expect([r.counts(), card.tuners(), card.valves()]).toEqual([1, r.tuners, r.valves]);
    expect(card.options()).toEqual(playOptionsOf(null));
    card.reread(null);
    expect(r.counts()).toBe(2);
    card.stop();
  });

  it("a map change under native Options takes its live globals and tuners (MLS.R2), not the card's", () => {
    const r = reads();
    const card = pageCardReads(r.read, memory());
    const globals = new OptionGlobals(), uiVars = new UiVarManager(); initSystemTuners(uiVars);
    card.reread({ globals, uiVars });
    expect(r.counts()).toBe(1);                                 // the card's OPTIONS not read again
    expect(card.tuners()).toBe(uiVars);
    expect(card.options()).toEqual(playOptionsOf(globals, uiVars as Parameters<typeof playOptionsOf>[1]));
    card.stop();
  });

  // PR #765 (Chris's unified controller settings): the test room's look stick before native Options exists follows the
  // launcher's writes as they are heard -- a preset's valve (the card's valves read again) and CUSTOM's slider commits on
  // the page's manager -- not the stick read at the page's start (OT.R72: `lookStickOf` over `stick_preset` and the sliders).
  it("the look stick follows a preset's valve write and CUSTOM's slider commits, not the start's read", () => {
    const slots = memory();
    const valves = new ValveStore(); valves.set('stick_preset', 0, VALVE_TYPE.PERSIST);
    const tuners = new UiVarManager(); initSystemTuners(tuners);
    const card = pageCardReads({ options: () => playOptionsOf(null), tuners: () => tuners, valves: () => valves }, slots);
    expect(card.options().stick).toEqual(lookStickOf(0, tuners));
    valves.set('stick_preset', 2, VALVE_TYPE.PERSIST);
    optionCommitted(slots, 'valve', 'stick_preset', 2);
    expect(card.options().stick).toEqual(lookStickOf(2, tuners));
    expect(card.options().stick).not.toEqual(lookStickOf(0, tuners));
    valves.set('stick_preset', 3, VALVE_TYPE.PERSIST);
    optionCommitted(slots, 'valve', 'stick_preset', 3);
    for (const [name, value] of [['STICK_SENSITIVITY', 0.9], ['STICK_INERTIA', 0.2], ['STICK_DEADZONE', 0.1]] as const) {
      optionCommitted(slots, 'tuner', name, Math.fround(value));
      applyCommittedTuner(tuners, name, Math.fround(value));   // `pageEarlyCommits`, the next observer, lays it
    }
    const custom = lookStickOf(3, tuners);
    expect(card.options().stick).toEqual(custom);
    expect(custom).not.toEqual(lookStickOf(2, tuners));
    card.stop();
  });

  it("adoptTuners: a manager made for a fresh card's first staged step is the page's, and the stick reads it", () => {
    const slots = memory();
    const valves = new ValveStore(); valves.set('stick_preset', 3, VALVE_TYPE.PERSIST);
    const card = pageCardReads({ options: () => playOptionsOf(null), tuners: () => null, valves: () => valves }, slots);
    const made = new UiVarManager(); initSystemTuners(made);
    for (const [name, value] of [['STICK_SENSITIVITY', 0.9], ['STICK_INERTIA', 0.2], ['STICK_DEADZONE', 0.1]] as const) applyCommittedTuner(made, name, Math.fround(value));
    card.adoptTuners(made);
    expect(card.tuners()).toBe(made);
    expect(card.options().stick).toEqual(lookStickOf(3, made));
    card.stop();
  });

  it("rereadTuners: the card's tuners alone again (a first tuner save can make a manager the card lacked)", () => {
    let tuners: UiVarManager | null = null;
    const card = pageCardReads({ options: () => playOptionsOf(null), tuners: () => tuners, valves: () => null }, memory());
    expect(card.tuners()).toBeNull();
    tuners = new UiVarManager();
    card.rereadTuners();
    expect(card.tuners()).toBe(tuners);
    card.stop();
  });

  it("a valve's card write (the launcher's Settings over the test room) reads the valves again and says so; stopped, nothing", () => {
    const slots = memory();
    let valves: ValveStore | null = null, told = 0;
    const card = pageCardReads({ options: () => playOptionsOf(null), tuners: () => null, valves: () => valves }, slots, { valvesChanged: () => { told++; } });
    valves = new ValveStore();
    optionCommitted(slots, 'tuner', 'MUSIC_VOLUME', 0.5);
    expect([card.valves(), told]).toEqual([null, 0]);           // a tuner's write is no valve's
    optionCommitted(slots, 'valve', 'DISPLAY_MP_TEAM_NAMES', 0);
    expect([card.valves(), told]).toEqual([valves, 1]);
    card.stop();
    optionCommitted(slots, 'valve', 'DISPLAY_MP_TEAM_NAMES', 1);
    expect(told).toBe(1);
  });
});
