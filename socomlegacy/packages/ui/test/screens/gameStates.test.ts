import { describe, expect, it } from 'vitest';
import { GAME_STATE_SLOTS, GameStateMachine, type GameState } from '../../src/screens/gameStates';

/**
 * The game object's state machine CG (0x4084c0; web research 115 §8.1): a 16-slot stack fed by a FIFO of requests,
 * one applied per tick on a tick whose top is then not ticked -- transcribed from `FUN_002ce9e0` (D:L171862-171952)
 * and the requests `FUN_002cf2f0` pop (D:L172222-172240), `FUN_002cf380` push (D:L172245-172263) and `FUN_002cf410`
 * switch (D:L172271-172292).
 */

/** A state that logs every call; `ok` is its Init's answer. */
function state(name: string, log: string[], ok = true): GameState {
  return {
    name,
    onRequest: () => log.push(`${name}.request`),
    init: () => { log.push(`${name}.init`); return ok; },
    tick: (dt) => log.push(`${name}.tick ${dt}`),
    onLeaveRequest: () => log.push(`${name}.leave`),
    unInit: () => log.push(`${name}.uninit`),
    onCover: (arg) => log.push(`${name}.cover ${arg}`),
    onPop: (arg) => log.push(`${name}.pop ${arg}`),
  };
}

const boot = (log: string[], first: GameState) => {
  const cg = new GameStateMachine({ frameSync: () => log.push('sync') });
  cg.switchTo(first);
  cg.tick(0.1);
  log.length = 0;
  return cg;
};

describe('CG (FUN_002ce9e0)', () => {
  it('has 16 slots', () => expect(GAME_STATE_SLOTS).toBe(16));

  it('a request is told at request time; applied on the next tick, whose top is not ticked; then the new top ticks', () => {
    const log: string[] = [];
    const a = state('A', log), b = state('B', log);
    const cg = boot(log, a);
    cg.switchTo(b);
    expect(log).toEqual(['A.leave', 'B.request']);              // FUN_002cf410: the top's +0x18, the new state's +0xc
    log.length = 0;
    cg.tick(0.5);
    expect(log).toEqual(['A.uninit', 'sync', 'B.init']);        // no tick this frame
    cg.tick(0.5);
    expect(log.at(-1)).toBe('B.tick 0.5');
    expect(cg.top()).toBe(b);
  });

  it('one request per tick, oldest first (FIFO)', () => {
    const log: string[] = [];
    const a = state('A', log), b = state('B', log), c = state('C', log);
    const cg = boot(log, a);
    cg.push(b);
    cg.push(c);
    log.length = 0;
    cg.tick(1);
    expect(log).toEqual(['sync', 'A.cover 0', 'B.init']);
    log.length = 0;
    cg.tick(1);
    expect(log).toEqual(['sync', 'B.cover 0', 'C.init']);
    expect(cg.index).toBe(2);
  });

  it('POP_TO_MENU_STATE takes two ticks: the pop (the covered state OnPop(0)), then the switch', () => {
    const log: string[] = [];
    const menu = state('MS', log), core = state('Core', log), exit = state('Exit', log);
    const cg = boot(log, core);
    cg.push(exit);
    cg.tick(1);
    log.length = 0;
    cg.pop(0);
    cg.switchTo(menu);
    expect(log).toEqual(['Exit.leave', 'Exit.leave', 'MS.request']);   // the switch's +0x18 goes to the top at request time
    log.length = 0;
    cg.tick(1);
    expect(log).toEqual(['Exit.uninit', 'Core.pop 0']);
    log.length = 0;
    cg.tick(1);
    expect(log).toEqual(['Core.uninit', 'sync', 'MS.init']);
    expect([cg.index, cg.top()]).toEqual([0, menu]);
  });

  it('a pop with 1 (ReplayMission): the round\'s state gets OnPop(1)', () => {
    const log: string[] = [];
    const core = state('Core', log), exit = state('Exit', log);
    const cg = boot(log, core);
    cg.push(exit);
    cg.tick(1);
    log.length = 0;
    cg.pop(1);
    cg.tick(1);
    expect(log).toEqual(['Exit.leave', 'Exit.uninit', 'Core.pop 1']);
  });

  it('a switch whose Init fails re-inits the old top (D:L171906-171909)', () => {
    const log: string[] = [];
    const a = state('A', log), bad = state('Bad', log, false);
    const cg = boot(log, a);
    cg.switchTo(bad);
    cg.tick(1);
    expect(log).toEqual(['A.leave', 'Bad.request', 'A.uninit', 'sync', 'Bad.init', 'A.init']);
    expect(cg.top()).toBe(a);
  });

  it('a push whose Init fails leaves the index and the stack, and the old top covered (D:L171928-171938)', () => {
    const log: string[] = [];
    const a = state('A', log), bad = state('Bad', log, false);
    const cg = boot(log, a);
    cg.push(bad);
    cg.tick(1);
    expect(log).toEqual(['Bad.request', 'sync', 'A.cover 0', 'Bad.init']);
    expect([cg.index, cg.top()]).toEqual([0, a]);
  });

  it('a null state is refused at request time; a stopped machine does nothing', () => {
    const log: string[] = [];
    const a = state('A', log);
    const cg = boot(log, a);
    expect(cg.switchTo(null)).toBeNull();
    expect(cg.push(null)).toBeNull();
    expect(cg.pending).toBe(0);
    cg.running = false;
    cg.tick(1);
    expect(log).toEqual([]);
  });

  it('the index is clamped to 15 by a push past the 16th slot', () => {
    const log: string[] = [];
    const cg = boot(log, state('S0', log));
    for (let i = 1; i < 20; i++) { cg.push(state(`S${i}`, log)); cg.tick(1); }
    expect(cg.index).toBe(15);
    expect(cg.top()!.name).toBe('S19');
  });

  it('a switch after a pop from slot 0 lands in slot 15: the index is a u32, so -1 reads 0xFFFFFFFF and the clamp takes it', () => {
    // D:L171904-171906 clamps an index of 16 or more to 15; a pop at slot 0 wraps the u32 index (the drift audit, 2026-10-10)
    const log: string[] = [];
    const cg = boot(log, state('S0', log));
    cg.pop(); cg.tick(1);
    expect(cg.top()).toBeNull();                                         // no top: the wrapped index reads none
    cg.switchTo(state('S1', log)); cg.tick(1);
    expect(cg.index).toBe(15);
    expect(cg.top()!.name).toBe('S1');                                   // the new state is the top and ticks
  });

  it('a push after two pops from slot 0 lands in slot 15 too (the u32 index; D:L171933-171935)', () => {
    const log: string[] = [];
    const cg = boot(log, state('S0', log));
    cg.pop(); cg.tick(1);
    cg.pop(); cg.tick(1);
    cg.push(state('S1', log)); cg.tick(1);
    expect(cg.index).toBe(15);
    expect(cg.top()!.name).toBe('S1');
  });
});

