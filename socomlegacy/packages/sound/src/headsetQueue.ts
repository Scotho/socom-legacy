/**
 * The headset lines on the TV (PF-32 (b); research 186 §3.1 HEADSET_ROUTE, research 233 §2). `D:L<line>` is a line of
 * `socom2_game.elf.decomp.c`; every `FUN_` is retail.
 *
 * - **The hand-off** (`FUN_00343140` D:L242200-242203): an `ST` entry carrying `HS` (the 12 `SND_HST_*` of `UIVOICE`)
 *   goes, while `DAT_0045a0c1` ("is online") is 0, to the Headset object's queue `FUN_0034b6c0` (D:L246909-246944)
 *   instead of being streamed. The queue takes it into one of its records while its byte +0xb is set -- set at
 *   construction (D:L247015), on reset (D:L246974) and on flush (D:L246450); cleared only by `FUN_0034aa70` (D:L246545)
 *   from `FUN_00547af0` (D:L413090), offline, the death path (BELIEVED, `HEADSET_CLEAR_READING`, research 233 §2.3:
 *   not built) -- and refuses it when no record is free.
 * - **The drain** (`FUN_0034b3b0`, run from the sound frame `FUN_00341a60` D:L241600-241603): with no USB headset
 *   (state 2, `FUN_0034bb80`) `FUN_0034afd0` pops the oldest line and plays it through `FUN_00347960` +
 *   `FUN_00342240`, an ordinary VAGSTORE stream on the TV (its group the class's, `vagStreamGroup`: 2, DIALOG's master);
 *   the next is popped only once that handle has ended (`FUN_00346d70`, D:L246712-246717). A play the stream refuses
 *   (`FUN_00342240` answering 0) frees the slot for the next at once (D:L246755-246761).
 * - **Online** (`DAT_0045a0c1` set) the line is not queued: it streams directly (`UiSoundTable.netFlag`'s `stream`).
 *
 * The page's queue starts a line in the same call that frees the TV (the console's next sound frame, 1/30 s later).
 * Pure: no DOM, no viewer.
 */

/**
 * HEADSET_QUEUE_READING: the queue as read -- 20 records (the Headset ctor `FUN_0034b910` allocates 0xf0 bytes, 20 of
 * `FUN_0034b6c0`'s 12-byte records, and fills the free list at +0x24 with 0x14 indices, D:L247006-247011), one line on
 * the TV at a time (the drain waits on the handle, D:L246712-246717), and online none (`'direct'`). Not measured. [reading]
 */
export const HEADSET_QUEUE_READING = { slots: 20, oneAtATime: true, online: 'direct' } as const;

/** What `push` did: started now, waiting its turn, refused (no record free), or dropped by the stream. */
export type HeadsetPush = 'played' | 'queued' | 'full' | 'refused';

/**
 * Starts a line on the TV: true when it streams, with `ended` to be called once when it has finished (or stopped);
 * false when the stream refuses it.
 */
export type HeadsetStart<T> = (line: T, ended: () => void) => boolean;

export interface HeadsetQueueOptions {
  /** `DAT_0045a0c1`: online, every line streams at once (`HEADSET_QUEUE_READING.online`). Absent: offline. */
  online?: () => boolean;
  /** The queue's records (`HEADSET_QUEUE_READING.slots`). */
  slots?: number;
}

/** `FUN_0034b6c0`'s queue and `FUN_0034afd0`'s drain, over the page's stream output. */
export class HeadsetQueue<T> {
  private readonly waiting: T[] = [];
  private current: { line: T; token: number } | null = null;
  private token = 0;

  constructor(private readonly start: HeadsetStart<T>, private readonly opts: HeadsetQueueOptions = {}) {}

  /** The line on the TV now, or null. */
  get playing(): T | null { return this.current?.line ?? null; }
  /** The lines waiting, oldest first. */
  get pending(): readonly T[] { return this.waiting; }

  /** An `HS` line handed on (`FUN_0034b6c0` offline; streamed at once online). */
  push(line: T): HeadsetPush {
    if (this.opts.online?.()) return this.start(line, () => {}) ? 'played' : 'refused';
    if (this.waiting.length >= (this.opts.slots ?? HEADSET_QUEUE_READING.slots)) return 'full';
    this.waiting.push(line);
    this.drain();
    if (this.current?.line === line && !this.waiting.includes(line)) return 'played';
    return this.waiting.includes(line) ? 'queued' : 'refused';
  }

  /** Every waiting line dropped (the line on the TV plays on). */
  clear(): void { this.waiting.length = 0; }

  /** `FUN_0034afd0`: while the TV is free, the oldest line started; a refused one dropped and the next tried. */
  private drain(): void {
    while (!this.current && this.waiting.length > 0) {
      const line = this.waiting.shift()!, token = ++this.token;
      this.current = { line, token };
      if (!this.start(line, () => this.ended(token))) { if (this.current?.token === token) this.current = null; }
    }
  }

  private ended(token: number): void {
    if (this.current?.token !== token) return;                        // a stale or second end
    this.current = null;
    this.drain();
  }
}
