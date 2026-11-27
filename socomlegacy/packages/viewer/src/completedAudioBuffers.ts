/**
 * Optional browser storage experiment; disabled unless its caller supplies a byte budget.
 * Only exclusively owned, naturally ended one-shots may enter this pool. In-use buffers,
 * loop buffers and explicitly stopped voices must never be returned here.
 * Exact shapes retain sample count/rate and every channel. The 64-entry ceiling bounds
 * bookkeeping as well as PCM bytes; it does not limit playing voices.
 */
export class CompletedAudioBuffers {
  private readonly idle: AudioBuffer[] = [];
  private bytes = 0;
  constructor(private readonly budget: number) {
    if (!Number.isSafeInteger(budget) || budget < 0) throw new RangeError('Invalid completed audio buffer budget');
  }

  take(channels: number, length: number, rate: number): AudioBuffer | undefined {
    const i = this.idle.findIndex(b => b.numberOfChannels === channels && b.length === length && b.sampleRate === rate);
    if (i < 0) return undefined;
    const buffer = this.idle.splice(i, 1)[0]!;
    this.bytes -= this.size(buffer);
    return buffer;
  }

  put(buffer: AudioBuffer): void {
    const bytes = this.size(buffer);
    if (!bytes || bytes > this.budget || this.idle.includes(buffer)) return;
    while (this.bytes + bytes > this.budget || this.idle.length >= 64) this.bytes -= this.size(this.idle.shift()!);
    this.idle.push(buffer); this.bytes += bytes;
  }

  clear(): void { this.idle.length = 0; this.bytes = 0; }
  private size(buffer: AudioBuffer): number { return buffer.numberOfChannels * buffer.length * Float32Array.BYTES_PER_ELEMENT; }
}
