/** Counts requested buffer/texture payload only. NOT total VRAM, process memory or an Xbox safe allowance. */
export class PayloadBudget {
  current = 0;
  peak = 0;
  constructor(readonly limit: number) {
    if (!Number.isSafeInteger(limit) || limit < 0) throw new Error('Invalid payload budget');
  }
  reserve(bytes: number): () => void {
    if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error('Invalid payload size');
    if (bytes > this.limit - this.current) throw new Error('Prototype GPU payload budget exceeded');
    this.current += bytes; this.peak = Math.max(this.peak, this.current);
    let held = true;
    return () => { if (held) { held = false; this.current -= bytes; } };
  }
}
