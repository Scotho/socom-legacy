import { describe, expect, it } from 'vitest';
import { CompileQueue, firstOfEachKind, type CompileJob } from '../src/compileQueue';

/** A job that finishes when told to, recording when it started. */
function gate(log: string[], name: string, extra: Partial<CompileJob> = {}): CompileJob & { finish(): void } {
  let finish = (): void => {};
  const done = new Promise<void>((resolve) => { finish = resolve; });
  return { ...extra, run: () => { log.push(name); return done; }, finish: () => finish() };
}
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('compileQueue: the page\'s compile queue (research 90 item 17)', () => {
  it('keeps no more than its lanes in flight, in the order asked', async () => {
    const log: string[] = [];
    const q = new CompileQueue(2);
    const jobs = ['a', 'b', 'c', 'd'].map((n) => gate(log, n));
    const all = q.add(jobs);
    expect(log).toEqual(['a', 'b']);
    expect(q.active).toBe(2);
    jobs[1]!.finish(); await tick();
    expect(log).toEqual(['a', 'b', 'c']);
    jobs[0]!.finish(); jobs[2]!.finish(); await tick();
    expect(log).toEqual(['a', 'b', 'c', 'd']);
    jobs[3]!.finish();
    await all;
    expect(q.active).toBe(0);
  });

  it('runs a later call behind an earlier one, and a leading call\'s lanes widen the queue for it', async () => {
    const log: string[] = [];
    const q = new CompileQueue(1);
    const first = [gate(log, 'w1', { lanes: 3 }), gate(log, 'w2', { lanes: 3 }), gate(log, 'w3', { lanes: 3 })];
    const second = [gate(log, 'p1')];
    void q.add(first); void q.add(second);
    expect(log).toEqual(['w1', 'w2', 'w3']);
    for (const j of first) j.finish();
    await tick();
    expect(log).toEqual(['w1', 'w2', 'w3', 'p1']);
    second[0]!.finish();
  });

  it('FLASH-GLOW-BODIES: a tail job runs only when no ordinary job waits, whenever the ordinary one was asked', async () => {
    const log: string[] = [];
    const q = new CompileQueue(1);
    const tail = [gate(log, 't1'), gate(log, 't2')];
    const head = [gate(log, 'h1'), gate(log, 'h2')];
    const tailDone = q.add(tail, { tail: true });
    expect(log).toEqual(['t1']);                                       // an idle queue runs the tail
    void q.add(head);
    tail[0]!.finish(); await tick();
    expect(log).toEqual(['t1', 'h1']);                                 // asked later, run first
    head[0]!.finish(); await tick();
    expect(log).toEqual(['t1', 'h1', 'h2']);
    head[1]!.finish(); await tick();
    expect(log).toEqual(['t1', 'h1', 'h2', 't2']);
    tail[1]!.finish();
    await tailDone;
    expect([q.active, q.waiting]).toEqual([0, 0]);
  });

  it('drops a stale job without running it, and a job that throws still settles', async () => {
    const log: string[] = [];
    const q = new CompileQueue(1);
    await q.add([
      { stale: () => true, run: () => { log.push('stale'); return Promise.resolve(); } },
      { run: () => { throw new Error('no'); } },
      { run: () => Promise.reject(new Error('no')) },
      { run: () => { log.push('ok'); return Promise.resolve(); } },
    ]);
    expect(log).toEqual(['ok']);
  });

  it('puts the first of each kind first, the rest behind in their order', () => {
    const items = ['body a', 'body b', 'gear a', 'body c', 'env a', 'gear b'];
    expect(firstOfEachKind(items, (s) => s.split(' ')[0]!)).toEqual(['body a', 'gear a', 'env a', 'body b', 'body c', 'gear b']);
  });
});

describe('WM-17 (LATER 772): `promote` -- a flashbang in the air brings the glow jobs of drawn bodies forward', () => {
  it('moves the matching tail jobs, in their order, to the head of the ordinary queue; the rest keep their places', async () => {
    const log: string[] = [];
    const q = new CompileQueue(1);
    const canvas = [gate(log, 'c1'), gate(log, 'c2'), gate(log, 'c3')];
    const glow = [gate(log, 'gB', { wanted: () => false }), gate(log, 'gA', { wanted: () => true }), gate(log, 'gC', { wanted: () => true })];
    void q.add(canvas);
    void q.add(glow, { tail: true });
    expect(log).toEqual(['c1']);
    expect(q.promote((j) => j.wanted?.() === true)).toBe(2);
    canvas[0]!.finish(); await tick();
    expect(log).toEqual(['c1', 'gA']);                    // ahead of c2: promoted to the head of the ordinary queue
    glow[1]!.finish(); await tick();
    expect(log).toEqual(['c1', 'gA', 'gC']);
    glow[2]!.finish(); await tick();
    expect(log).toEqual(['c1', 'gA', 'gC', 'c2']);        // the canvas jobs, then the unpromoted glow one last
    canvas[1]!.finish(); await tick(); canvas[2]!.finish(); await tick();
    expect(log).toEqual(['c1', 'gA', 'gC', 'c2', 'c3', 'gB']);
    glow[0]!.finish();
  });

  it('promotes nothing twice and nothing that is not waiting; with nothing matching the order is untouched', async () => {
    const log: string[] = [];
    const q = new CompileQueue(1);
    const c = gate(log, 'c'), g = gate(log, 'g', { wanted: () => true });
    void q.add([c]);
    void q.add([g], { tail: true });
    expect(q.promote((j) => j.wanted?.() === true)).toBe(1);
    expect(q.promote((j) => j.wanted?.() === true)).toBe(0);   // already in the ordinary queue
    c.finish(); await tick();
    expect(log).toEqual(['c', 'g']);
    expect(q.promote(() => true)).toBe(0);               // running, not waiting
    g.finish();
  });

  it('XBOX-WARM: counts the ordinary jobs waiting or running as busy, the tail never (the first frame waits on busy)', async () => {
    const log: string[] = [];
    const q = new CompileQueue(1);
    expect(q.busy).toBe(0);
    const tail = [gate(log, 't1')];
    void q.add(tail, { tail: true });
    expect(q.busy).toBe(0);                              // a glow job running: no draw of the canvas meets it
    const jobs = [gate(log, 'a'), gate(log, 'b')];
    const all = q.add(jobs);
    expect(q.busy).toBe(2);                              // both waiting behind the running tail job
    tail[0]!.finish(); await tick();
    expect(log).toEqual(['t1', 'a']);
    expect(q.busy).toBe(2);                              // one running, one waiting
    jobs[0]!.finish(); await tick();
    expect(q.busy).toBe(1);
    jobs[1]!.finish(); await all;
    expect(q.busy).toBe(0);
  });

  it('XBOX-WARM: a promoted tail job counts as busy once it is ordinary', async () => {
    const log: string[] = [];
    const q = new CompileQueue(1);
    const first = gate(log, 'a');
    void q.add([first]);
    const g = gate(log, 'g');
    void q.add([g], { tail: true });
    expect(q.busy).toBe(1);
    expect(q.promote(() => true)).toBe(1);
    expect(q.busy).toBe(2);
    first.finish(); await tick();
    expect(log).toEqual(['a', 'g']);
    expect(q.busy).toBe(1);
    g.finish(); await tick();
    expect(q.busy).toBe(0);
  });
});
