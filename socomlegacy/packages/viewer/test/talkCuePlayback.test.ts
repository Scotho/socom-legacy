// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { headsetGain, VoicePlayback, type VoiceAudioContext } from '../src/voice/voicePlayback';

/**
 * TALK-CUE-PCM's output (MISSION OT.R146; the read pilot/sound/read-talk-cue-pcm.md s3): the original writes the cue to
 * the HEADSET -- the same device as the room's voice (r0001 `FUN_0030f6e0` D:L211357-211390) -- at the headset's volume
 * only (`headset_controller` x 100, `FUN_0030fef0` D:L211697-211704): no other gain touches its samples. So the cue
 * plays through the voice playback's context on a gain node of its own at headsetGain, never through the voice's
 * gain node, which carries the owner's VOICE_PLAYBACK_GAIN_OWNER for the voice (OT.R44). Synthetic samples; no byte
 * of the game's table. A fake WebAudio context; no browser.
 */

type Node = { gain?: { value: number }; to: unknown[] };
class FakeContext {
  currentTime = 1.5; state = 'running'; readonly destination = { kind: 'destination' };
  readonly gains: (Node & { gain: { value: number } })[] = [];
  readonly buffers: { channels: Float32Array[]; length: number; rate: number }[] = [];
  readonly sources: (Node & { buffer: unknown; started: number | null })[] = [];
  createGain() { const g = { gain: { value: 1 }, to: [] as unknown[], connect(t: unknown) { this.to.push(t); }, disconnect() {} }; this.gains.push(g); return g; }
  createBuffer(c: number, length: number, rate: number) {
    const channels = Array.from({ length: c }, () => new Float32Array(length));
    const b = { channels, length, rate, getChannelData: (i: number) => channels[i]! };
    this.buffers.push(b);
    return b;
  }
  createBufferSource() {
    const s = { buffer: null as unknown, to: [] as unknown[], started: null as number | null, connect(t: unknown) { this.to.push(t); }, disconnect() {}, start(w: number) { this.started = w; } };
    this.sources.push(s);
    return s;
  }
  async resume(): Promise<void> {}
  async close(): Promise<void> {}
}

/** Synthetic interleaved stereo frames: 4 frames, L = R. */
const frames = (): Int16Array => Int16Array.from([0, 0, 16384, 16384, -32768, -32768, 256, 256]);

describe('the talk cue on the headset output', () => {
  it('a 2-channel buffer at the cue\'s rate, each channel the sample / 32768, started now', () => {
    const ctx = new FakeContext();
    const pb = new VoicePlayback(() => ctx as unknown as VoiceAudioContext, () => 0.75);
    expect(pb.playCue(frames(), 8000)).toBe(true);
    const b = ctx.buffers.at(-1)!;
    expect([b.channels.length, b.length, b.rate]).toEqual([2, 4, 8000]);
    expect(Array.from(b.channels[0]!)).toEqual([0, 0.5, -1, 256 / 32768]);
    expect(Array.from(b.channels[1]!)).toEqual(Array.from(b.channels[0]!));
    expect(ctx.sources.at(-1)!.started).toBe(1.5);
  });

  it('its own gain node at headsetGain only, to the destination -- not the voice\'s gain node (no owner boost)', () => {
    const ctx = new FakeContext();
    const pb = new VoicePlayback(() => ctx as unknown as VoiceAudioContext, () => 0.75);
    pb.playCue(frames(), 8000);
    const voiceGain = ctx.gains[0]!;                         // the playback's own, made at open
    const src = ctx.sources.at(-1)!;
    expect(src.to).not.toContain(voiceGain);
    const cueGain = src.to[0] as Node & { gain: { value: number } };
    expect(cueGain.gain.value).toBe(headsetGain(0.75));
    expect(cueGain.to).toEqual([ctx.destination]);
  });

  it('HEADSET VOLUME 0: nothing is played', () => {
    const ctx = new FakeContext();
    const pb = new VoicePlayback(() => ctx as unknown as VoiceAudioContext, () => 0);
    expect(pb.playCue(frames(), 8000)).toBe(false);
    expect(ctx.sources).toHaveLength(0);
  });

  it('a suspended context or a closed playback plays nothing', () => {
    const ctx = new FakeContext();
    ctx.state = 'suspended';
    const pb = new VoicePlayback(() => ctx as unknown as VoiceAudioContext, () => 0.75);
    expect(pb.playCue(frames(), 8000)).toBe(false);
    const ctx2 = new FakeContext();
    const pb2 = new VoicePlayback(() => ctx2 as unknown as VoiceAudioContext, () => 0.75);
    pb2.close();
    expect(pb2.playCue(frames(), 8000)).toBe(false);
  });
});
