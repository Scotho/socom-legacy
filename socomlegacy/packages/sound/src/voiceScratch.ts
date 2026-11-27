/** Browser storage adaptation: temporary voice PCM, valid only inside one synchronous use.
 * The caller overwrites every consumed sample. Final mixes must never retain this backing.
 * The cap bounds retained storage; overflowing or reentrant renders use ordinary allocations. */
export class VoiceScratch {
  private buffer: Float32Array | null = null;
  private busy = false;
  private discard = false;
  private readonly frames: number;

  constructor(maxBytes: number) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new RangeError('Invalid voice scratch budget');
    this.frames = Math.floor(maxBytes / Float32Array.BYTES_PER_ELEMENT);
  }

  get retainedBytes(): number { return this.buffer?.byteLength ?? 0; }
  /** Includes a busy lease even after clear(), until its synchronous caller returns. */
  owns(buffer: ArrayBufferLike): boolean { return this.buffer?.buffer === buffer; }

  clear(): void {
    if (this.busy) this.discard = true;
    else this.buffer = null;
  }

  use<T>(run: (allocate: (frames: number) => Float32Array) => T): T {
    const fresh = (frames: number): Float32Array => new Float32Array(frames);
    if (this.busy) return run(fresh);
    this.busy = true;
    let cursor = 0;
    try {
      return run(frames => {
        if (frames <= 0 || !Number.isSafeInteger(frames) || frames > this.frames - cursor) return fresh(frames);
        const buffer = this.buffer ??= new Float32Array(this.frames);
        const view = buffer.subarray(cursor, cursor + frames);
        cursor += frames;
        return view;
      });
    } finally {
      this.busy = false;
      if (this.discard) { this.buffer = null; this.discard = false; }
    }
  }
}
