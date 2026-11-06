import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CHORD, LivePadReader, LivePadSource, PAD_LAYOUTS, SCRIPT_CLOCK_STALL_MS, ScriptSource, STICK_ON_AT, checkChord, liveScriptText,
  type Chord, type PadSnapshot,
} from '../eph/live';
import { PageTranslator } from '../eph/pageMap';
import { parseScript, type ScriptEvent } from '../eph/script';
import { RunAborted } from '../eph/abort';

/**
 * The live pad (EPH-2 step 3, the owner's addendum 2026-10-30: the harness is a test harness AND a place players can
 * play in): one physical pad, read once by the harness through the headed page's Gamepad API, each change made a script
 * event and sent through the same translation to both clients. A browser adaptation (product track), no game rule.
 */
const pad = (pressed: number[] = [], axes: number[] = [0, 0, 0, 0]): PadSnapshot => ({
  buttons: Array.from({ length: 18 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })),
  axes,
});
const strip = (e: readonly ScriptEvent[]) => e.map(({ t, input, pressure }) => ({ t, input, pressure }));

describe('the chord', () => {
  it('defaults to L2 held with Triangle for a light Triangle at 0.2', () => {
    expect(DEFAULT_CHORD).toEqual({ modifier: 'l2', input: 'triangle', pressure: 0.2 });
    expect(() => checkChord(DEFAULT_CHORD)).not.toThrow();
  });

  it('refuses a modifier that is Triangle, the page Crouch bind (L3) or a stick half, and an unprepared pressure', () => {
    expect(() => checkChord({ ...DEFAULT_CHORD, modifier: 'triangle' })).toThrow(/modifier/);
    expect(() => checkChord({ ...DEFAULT_CHORD, modifier: 'l3' })).toThrow(/l3/);
    expect(() => checkChord({ ...DEFAULT_CHORD, modifier: 'lup' as never })).toThrow(/button/);
    expect(() => checkChord({ ...DEFAULT_CHORD, pressure: 0.25 })).toThrow(/not prepared/);
  });

  it('refuses a script that uses the modifier for itself', () => {
    expect(() => checkChord(DEFAULT_CHORD, parseScript('0 l2 1\n100 l2 0\n'))).toThrow(/script line 1.*l2/);
    expect(() => checkChord(DEFAULT_CHORD, parseScript('0 triangle 1\n'))).not.toThrow();
  });
});

describe("the touchpad chord and solo (PK-8: Machete's PCSX2 settings, the owner 2026-11-03)", () => {
  const TOUCH: Chord = { modifier: 'touchpad', input: 'triangle', pressure: 0.2 };
  const SOLO: Chord = { ...TOUCH, solo: true };

  it('the touchpad is the standard index 17 in both layouts; checkChord takes it', () => {
    expect([PAD_LAYOUTS.standard.touchpad, PAD_LAYOUTS.machete.touchpad]).toEqual([17, 17]);
    expect(() => checkChord(TOUCH)).not.toThrow();
    expect(() => checkChord(SOLO)).not.toThrow();
  });

  it('the touchpad held with Triangle: a light Triangle; the touchpad itself never sent', () => {
    const r = new LivePadReader(TOUCH, PAD_LAYOUTS.machete);
    expect(r.read(pad([17]), 0)).toEqual([]);
    expect(strip(r.read(pad([17, 3]), 10))).toEqual([{ t: 10, input: 'triangle', pressure: 0.2 }]);
    expect(strip(r.read(pad([]), 20))).toEqual([{ t: 20, input: 'triangle', pressure: 0 }]);
    expect(strip(r.read(pad([3]), 30))).toEqual([{ t: 30, input: 'triangle', pressure: 1 }]);
    // L2 is a plain button with the touchpad chord.
    expect(strip(r.read(pad([3, 6]), 40))).toEqual([{ t: 40, input: 'l2', pressure: 1 }]);
  });

  it('solo: the touchpad alone is a light Triangle, released with it; Triangle pressed while it is held is the same press', () => {
    const r = new LivePadReader(SOLO, PAD_LAYOUTS.machete);
    expect(strip(r.read(pad([17]), 0))).toEqual([{ t: 0, input: 'triangle', pressure: 0.2 }]);
    expect(r.read(pad([17, 3]), 10)).toEqual([]);
    expect(r.read(pad([3]), 20)).toEqual([]);   // still held by the Triangle: no event
    expect(strip(r.read(pad([]), 30))).toEqual([{ t: 30, input: 'triangle', pressure: 0 }]);
    expect(strip(r.read(pad([17]), 40))).toEqual([{ t: 40, input: 'triangle', pressure: 0.2 }]);
    expect(strip(r.read(pad([]), 50))).toEqual([{ t: 50, input: 'triangle', pressure: 0 }]);
  });

  it('a held full Triangle is not re-pressed by the touchpad, solo or not', () => {
    for (const chord of [TOUCH, SOLO]) {
      const r = new LivePadReader(chord, PAD_LAYOUTS.standard);
      expect(strip(r.read(pad([3]), 0))).toEqual([{ t: 0, input: 'triangle', pressure: 1 }]);
      expect(r.read(pad([3, 17]), 10)).toEqual([]);
      expect(r.read(pad([3]), 20)).toEqual([]);
      expect(strip(r.read(pad([]), 30))).toEqual([{ t: 30, input: 'triangle', pressure: 0 }]);
    }
  });

  it('the standard L2 chord is unchanged: the touchpad does nothing with it', () => {
    const r = new LivePadReader();
    expect(r.read(pad([17]), 0)).toEqual([]);
    expect(strip(r.read(pad([17, 3]), 10))).toEqual([{ t: 10, input: 'triangle', pressure: 1 }]);
  });

  it('live.script names the chord: the touchpad, and solo when set', () => {
    expect(liveScriptText([], TOUCH).split('\n')[1]).toBe('# light Triangle chord: touchpad held with triangle = triangle at 0.2');
    expect(liveScriptText([], SOLO).split('\n')[1]).toBe('# light Triangle chord: touchpad held with triangle = triangle at 0.2; touchpad alone (solo) = triangle at 0.2');
    expect(liveScriptText([], DEFAULT_CHORD).split('\n')[1]).toBe('# light Triangle chord: l2 held with triangle = triangle at 0.2');
  });
});

describe('LivePadReader: Gamepad snapshots to script events', () => {
  it('reads the machete layout (a player\'s PCSX2 binds, 2026-10-31): Options -> Circle, the Circle button -> R3, PS -> Start', () => {
    const r = new LivePadReader(DEFAULT_CHORD, PAD_LAYOUTS.machete);
    expect(strip(r.read(pad([9]), 0))).toEqual([{ t: 0, input: 'circle', pressure: 1 }]);
    expect(strip(r.read(pad([9, 1]), 10))).toEqual([{ t: 10, input: 'r3', pressure: 1 }]);
    expect(strip(r.read(pad([16]), 20)).map((e) => [e.input, e.pressure])).toEqual([['circle', 0], ['start', 1], ['r3', 0]]);
    expect(strip(r.read(pad([16, 11]), 30))).toEqual([]);   // the physical R3 is unbound in that layout
    expect(strip(r.read(pad([8]), 40)).map((e) => [e.input, e.pressure])).toEqual([['select', 1], ['start', 0]]);
    // The standard layout is unchanged: the Options button is Start.
    expect(strip(new LivePadReader().read(pad([9]), 0))).toEqual([{ t: 0, input: 'start', pressure: 1 }]);
  });

  it('emits a press at 1 and a release at 0 on each change, nothing when nothing changed', () => {
    const r = new LivePadReader();
    expect(r.read(pad(), 0)).toEqual([]);
    expect(strip(r.read(pad([0]), 16.7))).toEqual([{ t: 16.7, input: 'cross', pressure: 1 }]);
    expect(r.read(pad([0]), 33.3)).toEqual([]);
    expect(strip(r.read(pad([]), 50)).map((e) => [e.input, e.pressure])).toEqual([['cross', 0]]);
  });

  it('makes Triangle light while the modifier is held, and never emits the modifier itself', () => {
    const r = new LivePadReader();
    expect(r.read(pad([6]), 0)).toEqual([]);
    expect(strip(r.read(pad([6, 3]), 10))).toEqual([{ t: 10, input: 'triangle', pressure: 0.2 }]);
    // The pressure is fixed at the press: letting the modifier go first does not turn it full.
    expect(r.read(pad([3]), 20)).toEqual([]);
    expect(strip(r.read(pad([]), 30))).toEqual([{ t: 30, input: 'triangle', pressure: 0 }]);
    expect(strip(r.read(pad([3]), 40))).toEqual([{ t: 40, input: 'triangle', pressure: 1 }]);
  });

  it('drops L3 (the page Crouch bind) and makes the sticks half-axes, on at STICK_ON_AT', () => {
    const r = new LivePadReader();
    expect(r.read(pad([10]), 0)).toEqual([]);
    expect(STICK_ON_AT).toBe(0.5);
    expect(strip(r.read(pad([], [0, -0.9, 0, 0]), 5))).toEqual([{ t: 5, input: 'lup', pressure: 1 }]);
    expect(r.read(pad([], [0, -0.6, 0, 0]), 6)).toEqual([]);
    expect(strip(r.read(pad([], [0.7, 0.2, 0, 0]), 7))).toEqual([{ t: 7, input: 'lright', pressure: 1 }, { t: 7, input: 'lup', pressure: 0 }]);
  });

  it('rounds times to the microsecond and numbers the events by their line in live.script', () => {
    const r = new LivePadReader();
    const e = r.read(pad([0]), 12.34567891);
    expect(e[0]!.t).toBe(12.346);
    expect(e[0]!.line).toBe(LivePadReader.HEADER_LINES + 1);
  });
});

describe('the live session recorded as a script', () => {
  it('round trips: emit, write, parse, the same events', () => {
    const r = new LivePadReader();
    const emitted: ScriptEvent[] = [];
    const frames: [number[], number[], number][] = [
      [[], [0, 0, 0, 0], 0], [[6], [0, 0, 0, 0], 100.0004], [[6, 3], [0, 0, 0, 0], 116.7], [[], [0, 0, 0, 0], 133.33333],
      [[3], [0, -1, 0, 0], 400], [[], [0, 0, 0, 0], 466.6666], [[2, 0], [0, 0, 0, 0], 500],
    ];
    for (const [b, a, t] of frames) emitted.push(...r.read(pad(b, a), t));
    const text = liveScriptText(emitted, DEFAULT_CHORD);
    expect(text.split('\n').slice(0, LivePadReader.HEADER_LINES).every((l) => l.startsWith('#'))).toBe(true);
    const back = parseScript(text);
    expect(back).toEqual(emitted);
  });
});

describe('the input sources', () => {
  it('ScriptSource plays the parsed script on a clock, in order', async () => {
    const events = parseScript('0 cross 1\n100 cross 0\n');
    let now = 0;
    const got: [number, string][] = [];
    await new ScriptSource(events, () => (now += 60)).run(async (e) => { got.push([e.t, e.input]); }, { wait: async () => undefined });
    expect(got).toEqual([[0, 'cross'], [100, 'cross']]);
  });

  it('ScriptSource stops on a stalled clock (SCRIPT_CLOCK_STALL_MS of wall time by default), an adaptation', async () => {
    expect(SCRIPT_CLOCK_STALL_MS).toBe(10_000);
    let wall = 0;
    const events = parseScript('0 cross 1\n100 cross 0\n');
    const src = new ScriptSource(events, () => 50);
    await expect(src.run(async () => undefined, { wait: async () => { wall += 500; }, wallNow: () => wall }))
      .rejects.toThrow(/the clock stood at 50 for 10000 ms of wall time/);
  });

  it('ScriptSource ends on an abort', async () => {
    const ctl = new AbortController();
    const events = parseScript('0 cross 1\n100000 cross 0\n');
    const run = new ScriptSource(events, () => 0).run(async () => undefined, { signal: ctl.signal });
    setTimeout(() => ctl.abort(), 10);
    await expect(run).rejects.toBeInstanceOf(RunAborted);
  });

  it('LivePadSource polls the pad, emits each change at once, records it, and stops when told', async () => {
    const snaps = [pad(), pad([0]), pad([0]), null, pad()];
    let i = 0;
    let t = 0;
    const src = new LivePadSource({ read: async () => snaps[Math.min(i++, snaps.length - 1)] ?? null, now: () => (t += 10), wait: async () => undefined });
    const got: string[] = [];
    await src.run(async (e) => { got.push(`${e.t} ${e.input} ${e.pressure}`); if (got.length === 2) src.stop(); });
    expect(got).toEqual(['20 cross 1', '50 cross 0']);
    expect(strip(src.recorded)).toEqual([{ t: 20, input: 'cross', pressure: 1 }, { t: 50, input: 'cross', pressure: 0 }]);
  });
});

describe('PageTranslator: one event at a time', () => {
  it('in script mode gives what pageEvents gives', () => {
    const tr = new PageTranslator({}, 'script');
    const out = parseScript('0 triangle 1\n150 triangle 0\n450 triangle 0.2\n500 triangle 0\n').flatMap((e) => tr.push(e));
    expect(out.map((e) => [Math.round(e.t), e.index, 'pressed' in e ? e.pressed : null])).toEqual([[0, 3, true], [150, 3, false], [450, 10, true], [500, 10, false]]);
  });

  it('in live mode presses Crouch at the light release and lets it go lead frames later (it cannot reach back)', () => {
    const tr = new PageTranslator({ leadFrames: 3 }, 'live');
    const out = parseScript('450 triangle 0.2\n500 triangle 0\n').flatMap((e) => tr.push(e));
    expect(out.map((e) => [Math.round(e.t), e.index, 'pressed' in e ? e.pressed : null])).toEqual([[500, 10, true], [550, 10, false]]);
  });
});
