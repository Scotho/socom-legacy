/**
 * The capture's AudioWorklet processor (SVC-21; research 226 §2), thin: it feeds each 128-sample quantum of its first
 * input's first channel to `collectBlocks` at the context's rate and posts every 640-sample 8 kHz block to the page
 * (the block's buffer transferred). The capture context is opened at 8 000 Hz, the original's rate, so the collector
 * only gathers; where the browser gives another rate it resamples (`VOICE_RESAMPLE_ADAPTATION`). The node is made
 * with one channel, explicit, so the browser downmixes. A browser adaptation: the console's headset needed none.
 *
 * Loaded by the voice client (SVC-20b-page) through `audioWorklet.addModule`, never imported by the page: it
 * registers itself on load, which only an AudioWorkletGlobalScope can do.
 */
import { collectBlocks, VOICE_CAPTURE_PROCESSOR } from './voiceCodec';

/** AudioWorkletGlobalScope's own (TypeScript's DOM library does not carry the worklet scope). */
declare const sampleRate: number;
declare class AudioWorkletProcessor { readonly port: MessagePort }
declare function registerProcessor(name: string, processor: new () => AudioWorkletProcessor): void;

class VoiceCaptureProcessor extends AudioWorkletProcessor {
  private readonly collector = collectBlocks(sampleRate);

  process(inputs: Float32Array[][]): boolean {
    const mono = inputs[0]?.[0];
    if (mono) for (const block of this.collector.push(mono)) this.port.postMessage(block, [block.buffer]);
    return true;
  }
}

registerProcessor(VOICE_CAPTURE_PROCESSOR, VoiceCaptureProcessor);
