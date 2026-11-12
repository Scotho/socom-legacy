// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { headsetGain, VOICE_JITTER_MS_PLACEHOLDER, VOICE_STALE_FRAME_MS_ADAPTATION, VOICE_PLAYBACK_GAIN_OWNER, VoicePlayback, type VoiceAudioContext } from '../src/voice/voicePlayback';

/**
 * VOICE-2 (sprint 15; OT.R44, research 226 §3, §6): the room's voice is played through one gain node at HEADSET VOLUME
 * -- the original's `headset_controller` x 100 clamped to 0..100 (`FUN_0030fef0` D:L211697-211704; W20.R10) -- times the
 * owner's playback gain, `VOICE_PLAYBACK_GAIN_OWNER` (his solo playtest of 2026-10-08: "in game it sounded far too low
 * compared to other audio levels. Can it be bumped up just a bit"). A fake WebAudio context; no browser.
 */

class FakeContext {
  currentTime = 0; state = 'running'; readonly destination = { kind: 'destination' };
  readonly gains: { gain: { value: number }; connect(): void; disconnect(): void }[] = [];
  readonly starts: number[] = [];
  createGain() { const g = { gain: { value: 1 }, connect: () => undefined, disconnect: () => undefined }; this.gains.push(g); return g; }
  createBuffer(_c: number, length: number) { const d = new Float32Array(length); return { getChannelData: () => d }; }
  createBufferSource() {
    return { buffer: null as unknown, connect: () => undefined, disconnect: () => undefined, start: (w: number) => { this.starts.push(w); } };
  }
  async resume(): Promise<void> {}
  async close(): Promise<void> {}
}

const frame = (): Float32Array => new Float32Array(640).fill(0.25);

describe('VOICE-2 (b): the playback gain is HEADSET VOLUME times the owner\'s gain (OT.R44)', () => {
  it('VOICE_PLAYBACK_GAIN_OWNER is 2.7 (OT.R44; x3 since 2026-10-29, down 10% on 2026-10-30, OBF-6: a playtest preference)', () => {
    expect(VOICE_PLAYBACK_GAIN_OWNER).toBeCloseTo(2.7, 12);
  });

  for (const h of [0, 0.75, 1]) {
    it(`the gain node opens at headsetGain(${h}) x VOICE_PLAYBACK_GAIN_OWNER`, () => {
      const ctx = new FakeContext();
      const pb = new VoicePlayback(() => ctx as unknown as VoiceAudioContext, () => h);
      expect(pb.play(7, 0, frame())).toBe(true);
      expect(ctx.gains).toHaveLength(1);
      expect(ctx.gains[0]!.gain.value).toBeCloseTo(headsetGain(h) * VOICE_PLAYBACK_GAIN_OWNER, 12);
    });
  }

  it('the gain follows a tuner change each frame, the headset value clamped to 0..1 before the owner\'s gain', () => {
    const ctx = new FakeContext();
    let h = 0.75;
    const pb = new VoicePlayback(() => ctx as unknown as VoiceAudioContext, () => h);
    pb.play(7, 0, frame());
    expect(ctx.gains[0]!.gain.value).toBeCloseTo(2.025, 12);               // 0.75 (HEADSET_VOLUME_DEFAULT) x 2.7
    h = 0.4; pb.frame();
    expect(ctx.gains[0]!.gain.value).toBeCloseTo(1.08, 12);
    h = 1.7; pb.frame();
    expect(ctx.gains[0]!.gain.value).toBeCloseTo(2.7, 12);                 // x 100 clamped to 0..100 first (D:L211697-211704)
    h = 0; pb.frame();
    expect(ctx.gains[0]!.gain.value).toBe(0);
    for (const value of [.25,.5,1,0,1]) {
      h=value; pb.frame();
      expect(ctx.gains[0]!.gain.value).toBeCloseTo(headsetGain(value)*VOICE_PLAYBACK_GAIN_OWNER,12);
      expect(ctx.starts).toHaveLength(1);
    }
    h = Number.NaN; pb.frame();
    expect(ctx.gains[0]!.gain.value).toBe(0);
  });
});

describe('VOICE-2 (the reviews of 22cd9c3ba and 7e2c5902f): the oldest frame the talker sends', () => {
  it('VOICE_STALE_FRAME_MS_ADAPTATION is the jitter window and two 80 ms frames: 160 + 160 = 320 ms', () => {
    expect(VOICE_STALE_FRAME_MS_ADAPTATION).toBe(320);
    expect(VOICE_STALE_FRAME_MS_ADAPTATION).toBe(VOICE_JITTER_MS_PLACEHOLDER + 2 * 80);
  });
});
