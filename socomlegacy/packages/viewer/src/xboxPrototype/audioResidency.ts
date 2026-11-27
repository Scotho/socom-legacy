import type { RenderedSound } from '@s2u/sound';
import type { WebAudioOut } from '../audio';

/** Browser memory adaptation: the raw experiment always uses the existing lossless
 * loop handoff, even on a fresh profile with no saved Xbox graphics preference.
 * The comparison backend keeps WebAudioOut's usual device/preference policy.
 */
export function prototypeAudioOptions(backend: 'raw' | 'current'): ConstructorParameters<typeof WebAudioOut>[1] {
  return backend === 'raw' ? { releaseLoopSamples: true } : {};
}

/** A bounded payload sample, not process memory or native AudioBuffer residency.
 * Count entire unique backing buffers, since a small view keeps its whole buffer.
 * Keep only the sound objects the audio engine already owns, never the initial
 * channel views: WebAudioOut replaces those fields after copying their samples.
 */
export function trackLoopPayload(loops: readonly { name: string; sound: RenderedSound }[]) {
  const sourceBytes = () => {
    const buffers = new Set<ArrayBufferLike>();
    for (const { sound } of loops) for (const channel of [sound.left, sound.right, sound.sendLeft, sound.sendRight]) {
      if (channel?.byteLength) buffers.add(channel.buffer);
    }
    let bytes = 0;
    for (const buffer of buffers) bytes += buffer.byteLength;
    return bytes;
  };
  const loadedSourceBytes = sourceBytes();
  return { snapshot() {
    const currentSourceBytes = sourceBytes();
    return { loadedSourceBytes, currentSourceBytes, releasedSourceBytes: Math.max(0, loadedSourceBytes - currentSourceBytes) };
  } };
}
