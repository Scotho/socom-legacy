import { describe, expect, it } from 'vitest';
import { VoiceScratch } from '../src/voiceScratch';

describe('bounded temporary voice storage (browser adaptation)', () => {
  it('allocates disjoint exact views, reuses backing between calls and falls back past its cap', () => {
    const scratch = new VoiceScratch(64);
    expect(scratch.retainedBytes).toBe(0);
    let backing: ArrayBufferLike | undefined;
    scratch.use(allocate => {
      const a = allocate(10), b = allocate(6), c = allocate(1);
      expect([a.length, b.length, c.length]).toEqual([10, 6, 1]);
      expect(a.buffer).toBe(b.buffer); expect(b.byteOffset).toBe(40);
      expect(c.buffer).not.toBe(a.buffer);
      a.fill(7); b.fill(8); expect(a[9]).toBe(7); backing = a.buffer;
    });
    expect(scratch.retainedBytes).toBe(64);
    scratch.use(allocate => expect(allocate(1).buffer).toBe(backing));
    scratch.clear(); expect(scratch.retainedBytes).toBe(0);
    scratch.use(allocate => expect(allocate(1).buffer).not.toBe(backing));
  });
  it('nested uses and exceptions cannot overwrite or strand the outer lease', () => {
    const scratch = new VoiceScratch(64);
    let backing: ArrayBufferLike | undefined;
    expect(() => scratch.use(allocate => {
      const a = allocate(10).fill(7); backing = a.buffer;
      scratch.use(nested => { const b = nested(10).fill(9); expect(b.buffer).not.toBe(a.buffer); });
      expect([...a]).toEqual(Array(10).fill(7)); throw Error('render failed');
    })).toThrow('render failed');
    scratch.use(allocate => expect(allocate(10).buffer).toBe(backing));
  });
  it('a clear during a lease releases its backing when the call ends, without restoring it', () => {
    const scratch = new VoiceScratch(64);
    let backing: ArrayBufferLike | undefined;
    scratch.use(allocate => {
      const a = allocate(10).fill(7); backing = a.buffer;
      scratch.clear();
      expect(allocate(6).buffer).toBe(backing);
      expect(a[0]).toBe(7);
    });
    expect(scratch.retainedBytes).toBe(0);
    scratch.use(allocate => expect(allocate(1).buffer).not.toBe(backing));
  });
  it('oversized requests preserve ordinary storage without reserving the arena', () => {
    const scratch = new VoiceScratch(64);
    scratch.use(allocate => expect(allocate(17).length).toBe(17));
    expect(scratch.retainedBytes).toBe(0);
    expect(() => new VoiceScratch(-1)).toThrow();
    expect(() => new VoiceScratch(Infinity)).toThrow();
  });
});
