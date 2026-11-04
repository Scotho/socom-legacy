import { WebAudioOut } from '../src/audio';
import type { RenderedSound, StreamVoiceGains } from '@s2u/sound';

/** Real browser mixer measurement; synthetic constant signal isolates routing from the disc's sample envelope. */
export async function measureFlashAudio() {
  const results = [];
  for (const kind of ['one-shot', 'loop', 'stream', 'music', 'send'] as const) {
    for (const group of [0, 1, 2, 3, 4, 5, 6, 7, 14]) {
      for (const late of [false, true]) {
      const ctx = new OfflineAudioContext(2, 28800, 48000);
      // Share the actual offline context through the normal shared-context door; no production test hook.
      const shared = { prepare() {}, ctx } as unknown as WebAudioOut;
      const out = new WebAudioOut(shared); out.setGain(1); if (!late) out.prepare();
      const signal = new Float32Array(28800).fill(0.1), zero = new Float32Array(28800);
      const sound: RenderedSound = { left: kind === 'send' ? zero : signal, right: kind === 'send' ? zero : signal,
        sendLeft: kind === 'send' ? signal : null, sendRight: kind === 'send' ? signal : null,
        sampleRate: 48000, voices: 1, samples: [], peak: 0.1 };
      if (kind === 'send') {
        out.setReverb({ ll: new Float32Array([1, 0]), rr: new Float32Array([1, 0]),
          lr: new Float32Array(2), rl: new Float32Array(2), sampleRate: 48000 });
        out.rampReverb(1, 0.01);
      }
      const pair: StreamVoiceGains = { left: [1, 0], right: [0, 1] };
      const play = () => {
        if (kind === 'loop') out.loop(sound, group)?.setGains(1, 1, 0);
        else if (kind === 'stream') out.playStream(sound, pair, group);
        else if (kind === 'music') out.playMusic(sound, 0, pair, group);
        else out.play(sound, group);
      };
      if (!late) play();
      const change = (gain: number) => { for (const g of [0, 1, 2, 3, 5, 6]) out.setGroupGain(g, gain); };
      const hold = ctx.suspend(0.1).then(async () => {
        change((358 / 1024) ** 2);
        if (late) {
          // prepare normally resumes suspended contexts. Keep this offline renderer paused until its new graph
          // is complete, or it can render the entire remaining buffer faster than JS builds the voice.
          const resume = ctx.resume.bind(ctx);
          ctx.resume = () => Promise.resolve();
          try { out.prepare(); play(); } finally { ctx.resume = resume; }
        }
        await ctx.resume();
      });
      const recovery = ctx.suspend(0.3).then(async () => { change((691 / 1024) ** 2); await ctx.resume(); });
      const clear = ctx.suspend(0.45).then(async () => { change(1); await ctx.resume(); });
      const rendered = await ctx.startRendering(); await Promise.all([hold, recovery, clear]);
      const pcm = rendered.getChannelData(0);
      const mean = (start: number) => {
        let sum = 0; for (let i = Math.round(start * 48000); i < Math.round((start + 0.02) * 48000); i++) sum += pcm[i]!;
        return sum / 960;
      };
      const base = mean(0.07);
      const reference = late ? 0.1 : base;
      results.push({ kind, group, late, base, hold: mean(0.2) / reference, recovery: mean(0.4) / reference, clear: mean(0.55) / reference });
      out.dispose();
      }
    }
  }
  return results;
}
