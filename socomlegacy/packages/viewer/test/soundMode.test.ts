// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { CardSlots } from '@s2u/card';
import { OptionGlobals, UiVarManager, ValveStore, VALVE_TYPE } from '@s2u/ui';
import { GameAudio, SOUND_MODE_ADAPTATION, soundModeChannels, WebAudioOut } from '../src/audio';
import { optionCommitted } from '../src/nativeOptionsContext';
import type { NativeOptionsState } from '../src/nativeOptionsHost';
import { playOptionsOf } from '../src/originalOptions';
import { adoptPageOptions, pageCardReads, soundModeOf } from '../src/playerSettings';

/**
 * SOUND MODE (the parked OPTIONS rows, b; the merge controller's call, 2026-10-23): the original's `UIStoreOptions` hands
 * `STEREO_CONTROLLER` (Mono 0, Stereo 1, Dolby 2: the AUDIO page's three boxes) to the IOP's sound driver as its mode 1,
 * 2, 0 (`FUN_00340480`, `FUN_0033f8b0` command 0xb; D:L125157-125165, Stereo's argument read at 0x27bae8), whose mixing is
 * the IOP's own. The page's adaptation (`SOUND_MODE_ADAPTATION`): Mono mixes the page's whole output down to one
 * channel, Stereo and Dolby leave it two (a browser has no Pro Logic matrix).
 */

class Destination { channelCount = 2; maxChannelCount = 2; channelCountMode = 'explicit'; channelInterpretation = 'speakers'; }
class Context {
  state = 'running'; sampleRate = 48000; currentTime = 0; destination = new Destination();
  createGain() { return { gain: { value: 1, setValueAtTime() {}, setTargetAtTime() {} }, connect() {}, disconnect() {} }; }
  createConvolver() { return { buffer: null, connect() {}, disconnect() {} }; }
  addEventListener() {}
  removeEventListener() {}
  resume() { return Promise.resolve(); }
}
const old = globalThis.AudioContext;
afterEach(() => { Object.assign(globalThis, { AudioContext: old }); });
const output = (): { out: WebAudioOut; dest: () => Destination } => {
  Object.assign(globalThis, { AudioContext: Context });
  const out = new WebAudioOut();
  return { out, dest: () => (out.context() as unknown as Context).destination };
};

describe('SOUND MODE: STEREO_CONTROLLER to the page\'s output (SOUND_MODE_ADAPTATION)', () => {
  it('Mono (0) is one channel; Stereo (1) and Dolby (2) two; a value no box writes, two', () => {
    expect(SOUND_MODE_ADAPTATION).toContain('Dolby');
    expect([0, 1, 2, 7].map(soundModeChannels)).toEqual([1, 2, 2, 2]);
  });

  it('the context\'s destination is mixed down to one channel under Mono and back to two, whenever it is set', () => {
    const { out, dest } = output();
    out.setSoundMode(0);                                            // set before the context exists: taken when it is made
    expect(dest().channelCount).toBe(1);
    expect(dest().channelCountMode).toBe('explicit');
    expect(dest().channelInterpretation).toBe('speakers');
    out.setSoundMode(2);
    expect(dest().channelCount).toBe(2);
    out.setSoundMode(0);
    out.setSoundMode(1);
    expect(dest().channelCount).toBe(2);
  });

  it('an output shared on another\'s context leaves the destination to its owner', () => {
    const { out, dest } = output();
    out.prepare();
    const shared = new WebAudioOut(out);
    shared.setSoundMode(0);
    shared.prepare();
    expect(dest().channelCount).toBe(2);
  });
});

/**
 * RB-48 (RB-16's finding 1; the replay batch, product track -- the test room honours the stored SOUND MODE, the same
 * adaptation as above, nothing of the game changed): the test room's audio is `gameAudio`, whose `WebAudioOut` is private
 * to `GameAudio`, so `GameAudio` forwards SOUND MODE to its output; `../src/playerSettings.ts` lays the card's at the
 * page's start, at a valve's card write and at a map change (`pageCardReads`), and native Options' at each StoreOptions
 * over the page (`adoptPageOptions`), as the front end's match does (`../src/frontEnd.ts`, `s.options.observe`).
 */
describe("RB-48: SOUND MODE reaches the test room's output", () => {
  const memory = (): CardSlots => {
    const m = new Map<string, string>();
    const storage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); } };
    return new CardSlots(() => storage as unknown as Storage, () => undefined, { now: () => 5_000 });
  };
  const stored = (mode: number): ValveStore => { const v = new ValveStore(); v.set('STEREO_CONTROLLER', mode, VALVE_TYPE.PERSIST); return v; };
  const game = (): { audio: GameAudio; dest: () => Destination } => {
    const { out, dest } = output();
    return { audio: new GameAudio(out), dest };
  };

  it('GameAudio forwards SOUND MODE to its output: Mono one channel, Stereo two', () => {
    const { audio, dest } = game();
    audio.setSoundMode(0);
    expect(dest().channelCount).toBe(1);
    audio.setSoundMode(1);
    expect(dest().channelCount).toBe(2);
  });

  it("soundModeOf: the valves' STEREO_CONTROLLER, Stereo (1) with no store or no value", () => {
    expect([soundModeOf(stored(0)), soundModeOf(stored(2)), soundModeOf(new ValveStore()), soundModeOf(null)]).toEqual([0, 2, 1, 1]);
  });

  it("pageCardReads lays the card's SOUND MODE at the start, at a valve's card write and at a map change; stopped, nothing", () => {
    const slots = memory();
    const { audio, dest } = game();
    let valves: ValveStore | null = stored(0);
    const card = pageCardReads({ options: () => playOptionsOf(null), tuners: () => null, valves: () => valves }, slots, { sound: audio });
    expect(dest().channelCount).toBe(1);                       // the card's Mono at the page's start
    valves = stored(1);
    optionCommitted(slots, 'valve', 'STEREO_CONTROLLER', 1);   // the launcher's Settings over the test room
    expect(dest().channelCount).toBe(2);
    const live = new OptionGlobals(); live.store(stored(0));
    card.reread({ globals: live, uiVars: new UiVarManager() }); // a map change under native Options: its globals
    expect(dest().channelCount).toBe(1);
    valves = null;
    card.reread(null);                                          // no card: Stereo
    expect(dest().channelCount).toBe(2);
    card.stop();
    valves = stored(0);
    optionCommitted(slots, 'valve', 'STEREO_CONTROLLER', 0);
    expect(dest().channelCount).toBe(2);
  });

  it("adoptPageOptions lays native Options' SOUND MODE at adoption and at each StoreOptions of its globals", () => {
    const { audio, dest } = game();
    const state = { globals: new OptionGlobals(), valves: stored(0) } as unknown as NativeOptionsState;
    state.globals.store(state.valves);
    adoptPageOptions(state, { applyTo: () => {} }, () => {}, () => {}, audio);
    expect(dest().channelCount).toBe(1);
    state.globals.store(stored(2));                             // native Options' StoreOptions: Dolby
    expect(dest().channelCount).toBe(2);
    state.globals.store(stored(0));
    expect(dest().channelCount).toBe(1);
  });
});
