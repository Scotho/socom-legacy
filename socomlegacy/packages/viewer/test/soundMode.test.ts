// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { SOUND_MODE_ADAPTATION, soundModeChannels, WebAudioOut } from '../src/audio';

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
