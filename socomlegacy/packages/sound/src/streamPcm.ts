import type { RenderedSound } from './render';

/** Browser storage adaptation: the VAG decoder's signed samples, before its exact /32768 conversion.
 * Only decoded disc streams use this form; mixed/rendered float samples are never quantized. */
export interface Pcm16Stream extends Omit<RenderedSound, 'left' | 'right' | 'sendLeft' | 'sendRight'> {
  storage: 'pcm16';
  left: Int16Array;
  right: Int16Array;
  sendLeft: null;
  sendRight: null;
}
export type StoredStream = RenderedSound | Pcm16Stream;

export function isPcm16Stream(sound: StoredStream): sound is Pcm16Stream {
  return 'storage' in sound && sound.storage === 'pcm16';
}

/** Compatibility for float-only outputs. Web Audio expands directly into its own AudioBuffer instead. */
export function floatStream(sound: StoredStream): RenderedSound {
  if (!isPcm16Stream(sound)) return sound;
  const { storage: _storage, ...fields } = sound;
  const left = Float32Array.from(sound.left, sample => sample / 32768);
  const right = sound.right === sound.left ? left : Float32Array.from(sound.right, sample => sample / 32768);
  return { ...fields, left, right };
}
