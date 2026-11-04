// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { RuleEventName } from '@s2u/creator-contracts';
import { RuleHost, type RulePlayer, type RuleRoom, type RulesWire, type RuleV3 } from '../../../match/src/creator/rules';
import { createStatusChips } from '../../src/forge/shell/statusBar';
import { createRulesPresenter } from '../../src/forge/rulesPresent';
import * as cuesModule from '../../src/forge/rulesCues';

/**
 * FUI-23 (FUI.R24; product track, a browser adaptation with no original -- FORGE_RULES_CUES_ADAPTATION): the page plays
 * a rules pack's `cue.play` -- what the room tells in `rulesPresent`'s `shows` of kind `cue`
 * (`match/src/creator/rules/seam.ts` `RulesWire`) -- through the Forge match's own `GameAudio`, as a bounded,
 * client-only, presentation-only cue list. C1: a name the match's audio has (`has`), else nothing and one status line.
 * C2: at most 8 waiting (the oldest dropped, counted), one start a name a room tick (one wire, and the wires delivered in
 * the same task), placed nowhere on the bank's own group (`GameAudio.play`). C3: a locked or suspended output holds them
 * under one chip "Press ✕ to hear the cues"; the gesture (a click, a key, the pad's Cross) unlocks and plays them, oldest
 * first, the chip gone; one past 5 s at the gesture dropped, counted. And nothing of it changes what the room tells.
 *
 * The audio is a fake of the presenter's seam (`RulesCueAudio`: the match's `GameAudio` and its output, as
 * `../../src/forge/match` `forgeRulesCueAudio` builds it), as the audio tests use a recorder for the output.
 */

const m = cuesModule as typeof cuesModule & Record<string, unknown>;
const CHIP = 'rules-cue';

interface Fake {
  plays: string[];
  unlocks: string[];
  on: boolean;
  ready: boolean;
  names: Set<string>;
  loaded(): boolean;
  has(name: string): boolean;
  play(name: string): boolean;
  unlocked(): boolean;
  unlock(fromPad?: boolean): void;
}
const fake = (o: { names?: string[]; on?: boolean; loaded?: boolean; unlocks?: boolean } = {}): Fake => {
  const f: Fake = {
    plays: [], unlocks: [], on: o.on ?? true, ready: o.loaded ?? true, names: new Set(o.names ?? ['.BEEP', '.HORN', '.BELL']),
    loaded: () => f.ready,
    has: (n) => f.names.has(n),
    play: (n) => { if (!f.on) return false; f.plays.push(n); return true; },
    unlocked: () => f.on,
    unlock: (fromPad) => { f.unlocks.push(fromPad ? 'pad' : 'gesture'); if (o.unlocks ?? true) f.on = true; },
  };
  return f;
};

const cueWire = (...names: string[]): unknown => ({ type: 'rulesPresent', mode: 'party', shows: names.map((cue) => ({ kind: 'cue', cue })) });
const nextTick = (): Promise<void> => new Promise((r) => queueMicrotask(r));

type Presenter = ReturnType<typeof createRulesPresenter> & {
  audio(a: unknown): void;
  gesture(): void;
  frame(pad?: { cross: boolean }): void;
  cueStats(): { played: number; held: number; dropped: { overflow: number; stale: number; missing: number; duplicate: number } };
};
function setup(o: { now?: () => number; gestures?: EventTarget } = {}) {
  const chips = createStatusChips(document);
  const said: string[] = [];
  const make = createRulesPresenter as unknown as (c: typeof chips, o: Record<string, unknown>) => Presenter;
  const rules = make(chips, { say: (w: string) => said.push(w), ...o });
  return { chips, rules, said, chip: () => chips.matchElement.querySelector<HTMLElement>(`[data-forge-chip="${CHIP}"]`) };
}

describe('FUI-23: the constants (FUI.R24)', () => {
  it('the bounds are one named adaptation: 8 waiting, one a name a tick, 5 s stale; the words', () => {
    expect(m['RULES_CUE_LIMITS_ADAPTATION']).toEqual({ waiting: 8, perNamePerTick: 1, staleMs: 5000 });
    expect(m['RULES_CUE_CHIP']).toBe(CHIP);
    expect(m['RULES_CUE_HOLD_WORDS']).toBe('Press ✕ to hear the cues');
    expect(typeof m['FORGE_RULES_CUES_ADAPTATION']).toBe('string');
  });
});

describe('FUI-23 C1/C2: a cue the room tells is heard on the match\'s audio', () => {
  it('a cue told by the room is played once, by its name; the next tick\'s is played again', async () => {
    const { rules } = setup();
    const a = fake();
    rules.audio(a);
    rules.take(cueWire('.BEEP'));
    expect(a.plays).toEqual(['.BEEP']);
    await nextTick();
    rules.take(cueWire('.BEEP'));
    expect(a.plays).toEqual(['.BEEP', '.BEEP']);
    expect(rules.cueStats().played).toBe(2);
  });

  it('a cue the match does not have plays nothing and says so once ("cue <name>: not on this map"), never a chip', async () => {
    const { rules, said, chips } = setup();
    const a = fake();
    rules.audio(a);
    rules.take(cueWire('.NOPE'));
    await nextTick();
    rules.take(cueWire('.NOPE'));
    expect(a.plays).toEqual([]);
    expect(said).toEqual(['cue .NOPE: not on this map']);
    expect(chips.ids()).toEqual([]);
    expect(rules.cueStats().dropped.missing).toBe(2);
  });

  it('two of the same name in one tick play once (one wire, and two wires in the same task); another name plays too', () => {
    const { rules } = setup();
    const a = fake();
    rules.audio(a);
    rules.take(cueWire('.BEEP', '.BEEP', '.HORN'));
    rules.take(cueWire('.BEEP'));                                   // the seat's own wire of the same tick
    expect(a.plays).toEqual(['.BEEP', '.HORN']);
    expect(rules.cueStats().dropped.duplicate).toBe(2);
  });

  it('nine cues waiting keep the newest eight, one counted dropped', async () => {
    const { rules } = setup();
    const a = fake({ on: false });
    rules.audio(a);
    const names = ['.C1', '.C2', '.C3', '.C4', '.C5', '.C6', '.C7', '.C8', '.C9'];
    for (const n of names) a.names.add(n);
    for (const n of names) { rules.take(cueWire(n)); await nextTick(); }
    expect(rules.cueStats().held).toBe(8);
    expect(rules.cueStats().dropped.overflow).toBe(1);
    rules.gesture();
    expect(a.plays).toEqual(names.slice(1));
  });

  it('cues told before the match\'s audio is handed over, or before its map\'s sound is in, wait, then play', () => {
    const { rules, said } = setup();
    rules.take(cueWire('.BEEP'));
    const a = fake({ loaded: false });
    rules.audio(a);
    expect(a.plays).toEqual([]);
    a.ready = true;
    rules.frame();
    expect(a.plays).toEqual(['.BEEP']);
    expect(said).toEqual([]);
  });
});

describe('FUI-23 C3 (review F3): no chip while the map\'s sound is not in', () => {
  it('a not-yet-loaded, locked output shows no chip; loaded and locked, the chip', async () => {
    const { rules, chip } = setup();
    const a = fake({ on: false, loaded: false });
    rules.audio(a);
    rules.take(cueWire('.BEEP'));
    await nextTick();
    expect(chip()).toBeNull();                       // the context is not made yet: no gesture is asked for
    a.ready = true;
    rules.frame();
    expect(chip()?.textContent).toBe('Press ✕ to hear the cues');
    expect(a.plays).toEqual([]);
  });
});

describe('FUI-23 C3: the autoplay-denied path', () => {
  it('locked output: held, the chip shown, nothing played; the gesture plays them oldest first and the chip goes', async () => {
    const { rules, chip } = setup();
    const a = fake({ on: false });
    rules.audio(a);
    rules.take(cueWire('.HORN'));
    await nextTick();
    rules.take(cueWire('.BEEP', '.BELL'));
    expect(a.plays).toEqual([]);
    expect(chip()?.textContent).toBe('Press ✕ to hear the cues');
    expect(rules.cueStats().held).toBe(3);
    rules.gesture();
    expect(a.unlocks).toEqual(['gesture']);
    expect(a.plays).toEqual(['.HORN', '.BEEP', '.BELL']);
    expect(chip()).toBeNull();
    expect(rules.cueStats().held).toBe(0);
  });

  it('a click or a key on the page is the gesture; the pad\'s Cross (its press, once) too, asked as a pad\'s resume', async () => {
    for (const how of ['pointerdown', 'keydown', 'pad'] as const) {
      const { rules, chip } = setup({ gestures: document });
      const a = fake({ on: false });
      rules.audio(a);
      rules.take(cueWire('.BEEP'));
      expect(chip()).not.toBeNull();
      if (how === 'pad') { rules.frame({ cross: true }); rules.frame({ cross: true }); }
      else document.dispatchEvent(new Event(how, { bubbles: true }));
      expect(a.unlocks, how).toEqual([how === 'pad' ? 'pad' : 'gesture']);
      expect(a.plays, how).toEqual(['.BEEP']);
      expect(chip(), how).toBeNull();
      rules.clear();
      await nextTick();
    }
  });

  it('a gesture whose resume is still pending keeps the chip; the frame the output runs plays them', () => {
    const { rules, chip } = setup();
    const a = fake({ on: false, unlocks: false });
    rules.audio(a);
    rules.take(cueWire('.BEEP'));
    rules.gesture();
    expect(a.plays).toEqual([]);
    expect(chip()).not.toBeNull();
    a.on = true;                                                    // the resume's answer
    rules.frame();
    expect(a.plays).toEqual(['.BEEP']);
    expect(chip()).toBeNull();
  });

  it('a held cue past 5 s at the gesture is dropped, counted; a younger one plays', async () => {
    let t = 1000;
    const { rules } = setup({ now: () => t });
    const a = fake({ on: false });
    rules.audio(a);
    rules.take(cueWire('.HORN'));
    await nextTick();
    t += 3000;
    rules.take(cueWire('.BEEP'));
    t += 2500;                                                      // .HORN 5.5 s old, .BEEP 2.5 s
    rules.gesture();
    expect(a.plays).toEqual(['.BEEP']);
    expect(rules.cueStats().dropped.stale).toBe(1);
  });

  // FUI.R24 C3 amended 2026-10-27 (the dispatcher, after FUI-23's e2e): stale is 5 s after the moment the cue could first
  // have been heard -- the later of when it was told and when the map's sound came in.
  it('(a) a cue told before the map\'s sound is in, the sound in 6 s later, a gesture 1 s after: played, not stale [RED before the fold]', async () => {
    let t = 1000;
    const { rules } = setup({ now: () => t });
    const a = fake({ on: false, loaded: false });
    rules.audio(a);
    rules.take(cueWire('.BEEP'));                                   // told during the map load
    await nextTick();
    t += 6000;
    a.ready = true;                                                 // the map's sound comes in
    rules.frame();                                                  // the first frame that sees it
    t += 1000;
    rules.gesture();
    expect(a.plays).toEqual(['.BEEP']);
    expect(rules.cueStats()).toMatchObject({ played: 1, held: 0, dropped: { stale: 0 } });
  });

  it('(b) a gesture whose first play returns false keeps the cue held; the next frame\'s true plays it once [RED before the fold]', () => {
    let t = 1000;
    const { rules } = setup({ now: () => t });
    const a = fake({ on: false });
    rules.audio(a);
    rules.take(cueWire('.BEEP'));
    let calls = 0;
    a.play = (n): boolean => { calls++; if (calls === 1) return false; a.plays.push(n); return true; };   // the resume still pending
    t += 1000;
    rules.gesture();
    expect(rules.cueStats()).toMatchObject({ played: 0, held: 1, dropped: { stale: 0 } });
    t += 16;
    rules.frame();
    expect(a.plays).toEqual(['.BEEP']);
    expect(rules.cueStats()).toMatchObject({ played: 1, held: 0 });
    rules.frame();
    expect(a.plays).toEqual(['.BEEP']);                             // no double count
  });

  it('(c) a cue told with the sound in, the gesture 6 s later: stale, counted (the bound still holds; green by design)', async () => {
    let t = 1000;
    const { rules } = setup({ now: () => t });
    const a = fake({ on: false });
    rules.audio(a);
    rules.take(cueWire('.BEEP'));
    await nextTick();
    t += 6000;
    rules.gesture();
    expect(a.plays).toEqual([]);
    expect(rules.cueStats()).toMatchObject({ played: 0, held: 0, dropped: { stale: 1 } });
  });

  it('the match\'s end: the held cues, the chip and the gesture\'s listeners go', () => {
    const { rules, chip, chips } = setup({ gestures: document });
    const a = fake({ on: false });
    rules.audio(a);
    rules.take(cueWire('.BEEP'));
    rules.clear();
    expect(chip()).toBeNull();
    expect(chips.ids()).toEqual([]);
    document.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(a.unlocks).toEqual([]);
    expect(rules.cueStats()).toMatchObject({ played: 0, held: 0 });
  });
});

/** A recording room for the host, as `../../src/forge/matchRules` `RulesTestRoom` records: every wire kept as told. */
class Room implements RuleRoom {
  tick = 1;
  readonly told: { tick: number; to: number | null; ev: RulesWire }[] = [];
  constructor(private readonly onTell: (ev: RulesWire) => void = () => {}) {}
  players(): readonly RulePlayer[] { return [{ id: 1, team: 'seal', alive: true, out: false, feet: [0, 0, 0] as RuleV3 }]; }
  inRound(): boolean { return true; }
  damage(): void {}
  eliminate(): void {}
  award(): void {}
  endRound(): void {}
  endMatch(): void {}
  door(): boolean { return true; }
  respawn(): void {}
  tell(ev: RulesWire, to?: number): void { this.told.push({ tick: this.tick, to: to ?? null, ev }); this.onTell(ev); }
  drop(): void {}
}
const PARTY = {
  schema: 's2u-rules', vocabulary: 0, id: 'party', name: 'Party',
  rules: [
    { id: 'start', when: 'round.start', then: [{ do: 'cue.play', cue: '.BEEP' }, { do: 'cue.play', cue: '.BEEP' }, { do: 'message.show', text: 'Party on' }] },
    { id: 'kill', when: 'player.kill', then: [{ do: 'cue.play', cue: '.NOPE' }, { do: 'cue.play', cue: '.HORN', who: 'attacker' }] },
  ],
};
function run(present: ((ev: unknown) => void) | null): Room['told'] {
  const deep = (v: unknown): unknown => { if (v && typeof v === 'object') { Object.freeze(v); for (const x of Object.values(v)) deep(x); } return v; };
  const room = new Room((ev) => { if (present) present(deep(ev)); });
  const host = new RuleHost({ layout: {}, doors: [], switches: [] });
  expect(host.enable(JSON.parse(JSON.stringify(PARTY)), 7, {}).status).toBe('pass');
  host.attach(room);
  host.event({ name: 'match.start' as RuleEventName });
  host.event({ name: 'round.start' as RuleEventName });
  host.endStep();
  room.tick++;
  host.event({ name: 'player.kill' as RuleEventName, attacker: 1, victim: 1 } as never);
  host.endStep();
  return room.told;
}

describe('FUI-23: nothing changes what the room tells (client-only, presentation-only)', () => {
  it('the same scripted run\'s wire, with and without the presenter, is the same; the presenter heard it', () => {
    const without = JSON.stringify(run(null));
    const { rules } = setup();
    const a = fake();
    rules.audio(a);
    const withIt = run((ev) => { rules.take(ev); });
    expect(JSON.stringify(withIt)).toBe(without);
    expect(withIt.length).toBeGreaterThan(0);
    expect(a.plays).toContain('.BEEP');                              // it was presented, not skipped
  });
});
