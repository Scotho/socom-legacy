import { describe, expect, it } from 'vitest';
import { HEADSET_QUEUE_READING, HeadsetQueue } from '../src/headsetQueue';
import { HEADSET_ROUTE_READING } from '../src/uiSounds';

/**
 * PF-32 (b), research 233 §2: the `SND_HST_*` lines on the TV. Offline, `FUN_00343140` hands an `HS` entry to the
 * Headset object's queue (`FUN_0034b6c0` D:L246909-246944: 20 records, byte +0xb set at construction D:L247015); its
 * tick from the sound frame (`FUN_00341a60` D:L241600-241603) with no USB headset (state 2) pops the oldest and plays it
 * as an ordinary VAGSTORE stream (`FUN_0034afd0`: `FUN_00347960` + `FUN_00342240`), the next only when that one has
 * ended. Online (`DAT_0045a0c1`) the line is not queued. Synthetic lines only.
 */
describe('the headset queue (FUN_0034b6c0; FUN_0034afd0)', () => {
  it("an HS line offline is queued, 20 slots, and streamed on the TV one at a time in order (FUN_0034b6c0 D:L246909-246944; FUN_0034afd0); online it streams at once (DAT_0045a0c1); HEADSET_ROUTE_READING 'streamed'", () => {
    expect(HEADSET_ROUTE_READING).toBe('streamed');
    expect(HEADSET_QUEUE_READING).toEqual({ slots: 20, oneAtATime: true, online: 'direct' });
    const started: string[] = [], ends: (() => void)[] = [];
    let online = false;
    const q = new HeadsetQueue<string>((line, ended) => { started.push(line); ends.push(ended); return true; }, { online: () => online });
    // The first line streams; every later one waits its turn, up to the 20 records; the 21st is refused.
    expect(q.push('SND_HST_01')).toBe('played');
    for (let i = 2; i <= 21; i++) expect(q.push(`SND_HST_${String(i).padStart(2, '0')}`), `line ${i}`).toBe('queued');
    expect(q.push('SND_HST_22')).toBe('full');
    expect(started).toEqual(['SND_HST_01']);
    expect(q.playing).toBe('SND_HST_01');
    expect(q.pending).toHaveLength(20);
    // One at a time, in order: each starts only when the one before it has ended.
    ends[0]!();
    expect(started).toEqual(['SND_HST_01', 'SND_HST_02']);
    ends[0]!();                                                 // a stale end changes nothing
    expect(started).toHaveLength(2);
    ends[1]!();
    expect(started.at(-1)).toBe('SND_HST_03');
    expect(q.pending).toHaveLength(18);
    // A line the TV refuses (no stream played, FUN_00342240 answering 0) is dropped and the next one starts.
    let refuse = true;
    const r = new HeadsetQueue<string>((line, ended) => { if (refuse) { refuse = false; return false; } started.push(line); ends.push(ended); return true; });
    expect(r.push('A')).toBe('refused');
    expect(r.playing).toBeNull();
    expect(r.push('B')).toBe('played');
    expect(started.at(-1)).toBe('B');
    // Online the queue is bypassed: the line streams at once, whatever plays.
    online = true;
    expect(q.push('SND_HST_99')).toBe('played');
    expect(started.at(-1)).toBe('SND_HST_99');
    expect(q.playing).toBe('SND_HST_03');
    expect(q.pending).toHaveLength(18);
  });
});
