import { describe, expect, it } from 'vitest';
import { VALVE_EVENT, VALVE_TYPE, ValveStore, valveTypeOf, type Valve, type ValveEvent } from '../src/valves';

// Research 104 §1-§3. Every row is transcribed from the retail decompilation (`D:L<line>` = a line of
// game/analysis/socom2_game.elf.decomp.c); no expected value here was produced by running the store.

/** A store holding one valve `v` at `value` (made PERM through `FUN_003520d0`, so no watcher sees the seeding). */
function one(value: number): { store: ValveStore; v: Valve; events: ValveEvent[] } {
  const store = new ValveStore();
  const v = store.set('v', value, VALVE_TYPE.PERM);
  const events: ValveEvent[] = [];
  // The callback is told the valve and its context, not the event (D:L250796): one watcher per event bit records it.
  store.watch(v, VALVE_EVENT.NONZERO, () => events.push(VALVE_EVENT.NONZERO));
  store.watch(v, VALVE_EVENT.ZERO, () => events.push(VALVE_EVENT.ZERO));
  return { store, v, events };
}

describe('the VALVE ops 0-18 (FUN_00353fd0, D:L252128-252345)', () => {
  // [op, value before, operand, result, value after, events fired]. The operand is the command's 32-bit word;
  // the ops read its low 16 bits (D:L252180). A test leaves the value alone and fires nothing.
  type Row = [op: number, before: number, operand: number, result: boolean, after: number, events: ValveEvent[]];
  const N = VALVE_EVENT.NONZERO, Z = VALVE_EVENT.ZERO;
  const rows: Array<[string, Row]> = [
    // op 0 (D:L252182-252184): true, whatever the values.
    ['0 true: zero', [0, 0, 0, true, 0, []]],
    ['0 true: any', [0, 5, 7, true, 5, []]],
    ['0 true: 0xFFFF', [0, 0xffff, 0xffff, true, 0xffff, []]],
    // op 1 != (D:L252185-252187)
    ['1 !=: equal', [1, 3, 3, false, 3, []]],
    ['1 !=: differ', [1, 3, 4, true, 3, []]],
    ['1 !=: -1 is 0xFFFF', [1, 0xffff, -1, false, 0xffff, []]],
    ['1 !=: 0x10000 is 0', [1, 0, 0x10000, false, 0, []]],
    // op 2 == (D:L252188-252190)
    ['2 ==: equal', [2, 3, 3, true, 3, []]],
    ['2 ==: differ', [2, 1, 2, false, 1, []]],
    ['2 ==: -1 is 0xFFFF', [2, 0xffff, -1, true, 0xffff, []]],
    ['2 ==: zero', [2, 0, 0, true, 0, []]],
    // op 3 > (D:L252191-252193): operand < value
    ['3 >: greater', [3, 5, 3, true, 5, []]],
    ['3 >: equal', [3, 3, 3, false, 3, []]],
    ['3 >: less', [3, 3, 5, false, 3, []]],
    ['3 >: 0x1FFFE is 0xFFFE', [3, 0xffff, 0x1fffe, true, 0xffff, []]],
    // op 4 < (D:L252194-252196)
    ['4 <: less', [4, 3, 5, true, 3, []]],
    ['4 <: equal', [4, 3, 3, false, 3, []]],
    ['4 <: greater', [4, 5, 3, false, 5, []]],
    // op 5 >= (D:L252197-252199)
    ['5 >=: equal', [5, 3, 3, true, 3, []]],
    ['5 >=: less', [5, 2, 3, false, 2, []]],
    // op 6 <= (D:L252200-252202)
    ['6 <=: equal', [6, 3, 3, true, 3, []]],
    ['6 <=: greater', [6, 4, 3, false, 4, []]],
    // op 7 | (D:L252203-252205): value or operand non-zero
    ['7 |: both zero', [7, 0, 0, false, 0, []]],
    ['7 |: operand', [7, 0, 1, true, 0, []]],
    ['7 |: value', [7, 1, 0, true, 1, []]],
    // op 8 & (D:L252206-252208)
    ['8 &: common bit', [8, 6, 3, true, 6, []]],
    ['8 &: none', [8, 4, 3, false, 4, []]],
    ['8 &: zero', [8, 0, 0, false, 0, []]],
    // op 9 |~ (D:L252209-252211): value | ~operand in 32 bits, never zero -- true at every edge
    ['9 |~: zero, 0xFFFF', [9, 0, 0xffff, true, 0, []]],
    ['9 |~: zero, zero', [9, 0, 0, true, 0, []]],
    // op 10 &~ (D:L252212-252214)
    ['10 &~: bit left', [10, 6, 4, true, 6, []]],
    ['10 &~: cleared', [10, 4, 4, false, 4, []]],
    ['10 &~: 0xFFFF, 0xFFFF', [10, 0xffff, 0xffff, false, 0xffff, []]],
    ['10 &~: 0xFFFF, zero', [10, 0xffff, 0, true, 0xffff, []]],
    // op 11 = (D:L252215-252228): the low 16 bits stored; fires when they differ from the value
    ['11 =: set', [11, 0, 5, true, 5, [N]]],
    ['11 =: same value', [11, 5, 5, true, 5, []]],
    ['11 =: to zero', [11, 5, 0, true, 0, [Z]]],
    ['11 =: 0x12345 stores 0x2345', [11, 0, 0x12345, true, 0x2345, [N]]],
    ['11 =: 0x10007 onto 7', [11, 7, 0x10007, true, 7, []]],
    ['11 =: -1 stores 0xFFFF', [11, 0, -1, true, 0xffff, [N]]],
    // op 12 += (D:L252229-252243): the 32-bit sum compared, its low 16 bits stored (wraps)
    ['12 +=: add', [12, 1, 2, true, 3, [N]]],
    ['12 +=: 0xFFFF + 1 wraps to 0, event non-zero', [12, 0xffff, 1, true, 0, [N]]],
    ['12 +=: 0xFFFF + 0xFFFF', [12, 0xffff, 0xffff, true, 0xfffe, [N]]],
    ['12 +=: zero', [12, 5, 0, true, 5, []]],
    ['12 +=: zero onto zero', [12, 0, 0, true, 0, []]],
    // op 13 -= (D:L252244-252263): floored at 0 when the operand exceeds the value
    ['13 -=: subtract', [13, 5, 3, true, 2, [N]]],
    ['13 -=: floor at 0', [13, 3, 5, true, 0, [Z]]],
    ['13 -=: to exactly 0', [13, 3, 3, true, 0, [Z]]],
    ['13 -=: from 0', [13, 0, 1, true, 0, []]],
    ['13 -=: zero', [13, 5, 0, true, 5, []]],
    ['13 -=: -1 is 0xFFFF, floored', [13, 5, -1, true, 0, [Z]]],
    ['13 -=: 0xFFFF - 0xFFFF', [13, 0xffff, 0xffff, true, 0, [Z]]],
    // op 14 *= (D:L252264-252278): the 32-bit product compared, its low 16 bits stored
    ['14 *=: multiply', [14, 3, 4, true, 12, [N]]],
    ['14 *=: 0x100 * 0x100 stores 0, event non-zero', [14, 0x100, 0x100, true, 0, [N]]],
    ['14 *=: 2 * 0x8001 stores 2 and still fires', [14, 2, 0x8001, true, 2, [N]]],
    ['14 *=: by one', [14, 5, 1, true, 5, []]],
    ['14 *=: by zero', [14, 5, 0, true, 0, [Z]]],
    ['14 *=: zero', [14, 0, 7, true, 0, []]],
    ['14 *=: 0xFFFF * 0xFFFF', [14, 0xffff, 0xffff, true, 1, [N]]],
    // op 15 |= (D:L252279-252293)
    ['15 |=: set bits', [15, 1, 2, true, 3, [N]]],
    ['15 |=: already set', [15, 3, 1, true, 3, []]],
    ['15 |=: zero', [15, 0, 0, true, 0, []]],
    // op 16 &= (D:L252294-252308)
    ['16 &=: mask', [16, 3, 1, true, 1, [N]]],
    ['16 &=: unchanged', [16, 3, 3, true, 3, []]],
    ['16 &=: to zero', [16, 3, 4, true, 0, [Z]]],
    // op 17 |=~ (D:L252309-252323): value | ~operand in 32 bits always differs from the u16 -- it always fires
    ['17 |=~: 0, 0xFFFF stores 0 and fires', [17, 0, 0xffff, true, 0, [N]]],
    ['17 |=~: 0, 0 stores 0xFFFF', [17, 0, 0, true, 0xffff, [N]]],
    ['17 |=~: 0xFFFF, 0 unchanged, fires', [17, 0xffff, 0, true, 0xffff, [N]]],
    ['17 |=~: 1, 0xFFFE', [17, 1, 0xfffe, true, 1, [N]]],
    // op 18 &=~ (D:L252324-252338)
    ['18 &=~: clear a bit', [18, 3, 1, true, 2, [N]]],
    ['18 &=~: to zero', [18, 3, 3, true, 0, [Z]]],
    ['18 &=~: unchanged', [18, 3, 4, true, 3, []]],
    // default (D:L252339-252340): false, nothing written
    ['19: no op', [19, 3, 1, false, 3, []]],
    ['255: no op', [255, 3, 1, false, 3, []]],
    ['-1: no op', [-1, 3, 1, false, 3, []]],
  ];
  it.each(rows)('op %s', (_label, [op, before, operand, result, after, events]) => {
    const t = one(before);
    expect(t.store.apply({ valve: 'v', op, operand })).toBe(result);
    expect(t.v.value).toBe(after);
    expect(t.events).toEqual(events);
  });

  it('a valve no store holds: false and nothing made, even for op 0 (D:L252156-252157)', () => {
    const store = new ValveStore();
    expect(store.apply({ valve: 'absent', op: 0, operand: 0 })).toBe(false);
    expect(store.apply({ valve: 'absent', op: 11, operand: 3 })).toBe(false);
    expect(store.find('absent')).toBeUndefined();
  });

  it('an operand that is a valve reads its u16; one the store lacks reads 0 (flag 0x10, D:L252162-252179)', () => {
    const { store, v } = one(5);
    store.set('w', 7, VALVE_TYPE.PERM);
    expect(store.apply({ valve: 'v', op: 12, operand: { valve: 'w' } })).toBe(true);
    expect(v.value).toBe(12);
    expect(store.apply({ valve: 'v', op: 11, operand: { valve: 'nowhere' } })).toBe(true);
    expect(v.value).toBe(0);
    expect(store.find('nowhere')).toBeUndefined();
  });

  it('takes the valve itself as its reference (flags 0: the reference is the pointer, D:L252141-252146)', () => {
    const { store, v } = one(1);
    expect(store.apply({ valve: v, op: 12, operand: 1 })).toBe(true);
    expect(v.value).toBe(2);
  });
});

describe('the watchers (FUN_003519f0 D:L250781-250803; added by FUN_00351960 D:L250758-250779)', () => {
  it('runs the valve\'s watchers in the order added, each whose mask holds the event', () => {
    const store = new ValveStore();
    const v = store.set('x', 0, VALVE_TYPE.PERM);
    const calls: string[] = [];
    store.watch(v, VALVE_EVENT.NONZERO, () => calls.push('a1'));
    store.watch(v, VALVE_EVENT.ZERO, () => calls.push('b2'));
    store.watch(v, VALVE_EVENT.NONZERO | VALVE_EVENT.ZERO, () => calls.push('c3'));
    store.apply({ valve: 'x', op: 11, operand: 4 });
    expect(calls).toEqual(['a1', 'c3']);
    calls.length = 0;
    store.apply({ valve: 'x', op: 11, operand: 0 });
    expect(calls).toEqual(['b2', 'c3']);
  });

  it('passes the valve and the context it was added with (`fn(valve, ctx)`, D:L250796)', () => {
    const store = new ValveStore();
    const v = store.set('x', 0, VALVE_TYPE.PERM);
    const seen: Array<[string, number, unknown]> = [];
    store.watch(v, 3, (valve, ctx) => seen.push([valve.name, valve.value, ctx]), 'ctx-1');
    store.apply({ valve: 'x', op: 11, operand: 9 });
    expect(seen).toEqual([['x', 9, 'ctx-1']]);
  });

  it('a write of the same value fires nothing; the event is the 32-bit result\'s, not the stored u16\'s', () => {
    const { store, events } = one(0xffff);
    store.apply({ valve: 'v', op: 11, operand: 0xffff });
    expect(events).toEqual([]);
    store.apply({ valve: 'v', op: 12, operand: 1 });        // 0x10000: stored 0, "non-zero" (D:L252229-252243)
    expect(events).toEqual([VALVE_EVENT.NONZERO]);
  });

  it('a mask with neither bit never fires (`param_2 & 0xff & mask`, D:L250795)', () => {
    const store = new ValveStore();
    const v = store.set('x', 0, VALVE_TYPE.PERM);
    let n = 0;
    store.watch(v, 0x100, () => n++);
    store.apply({ valve: 'x', op: 11, operand: 1 });
    store.apply({ valve: 'x', op: 11, operand: 0 });
    expect(n).toBe(0);
  });

  it('clearWatchers drops them all (FUN_003518c0 D:L250733-250756)', () => {
    const { store, v, events } = one(0);
    store.clearWatchers(v);
    store.apply({ valve: 'v', op: 11, operand: 2 });
    expect(events).toEqual([]);
  });
});

describe('the registry (D:L250805-251483)', () => {
  it('names are case-sensitive (FUN_00351ef0 D:L250995-251017 compares with strcmp 0x198f18)', () => {
    const store = new ValveStore();
    store.set('UiWeapon', 3, VALVE_TYPE.PERM);
    expect(store.find('UiWeapon')?.value).toBe(3);
    expect(store.find('uiweapon')).toBeUndefined();
  });

  it('acquire makes an absent valve at 0 with the type asked, appended last (FUN_00351ff0 D:L251034-251067)', () => {
    const store = new ValveStore();
    store.set('a', 1, VALVE_TYPE.PERM);
    const b = store.acquire('b', VALVE_TYPE.TEMP);
    expect(b.value).toBe(0);
    expect(b.type).toBe(VALVE_TYPE.TEMP);
    expect(store.all().map((v) => v.name)).toEqual(['a', 'b']);
  });

  it('acquire and set promote a held valve: PERM over TEMP but never over PERSIST, PERSIST always, TEMP never', () => {
    // FUN_00351ff0 D:L251058-251063 and FUN_003520d0 D:L251116-251121.
    const store = new ValveStore();
    const t = store.acquire('t', VALVE_TYPE.TEMP);
    store.acquire('t', VALVE_TYPE.PERM);
    expect(t.type).toBe(VALVE_TYPE.PERM);
    store.acquire('t', VALVE_TYPE.TEMP);
    expect(t.type).toBe(VALVE_TYPE.PERM);
    store.set('t', 0, VALVE_TYPE.PERSIST);
    expect(t.type).toBe(VALVE_TYPE.PERSIST);
    store.acquire('t', VALVE_TYPE.PERM);
    expect(t.type).toBe(VALVE_TYPE.PERSIST);
  });

  it('set writes through the watchers: a change fires, the same value does not (FUN_003520d0 D:L251069-251125)', () => {
    const { store, events } = one(4);
    store.set('v', 4, VALVE_TYPE.PERM);
    expect(events).toEqual([]);
    store.set('v', 0, VALVE_TYPE.PERM);
    expect(events).toEqual([VALVE_EVENT.ZERO]);
    store.set('v', -1, VALVE_TYPE.PERM);                       // the whole word compared, its low 16 bits kept
    expect(store.find('v')?.value).toBe(0xffff);
  });

  it('remove(TEMP) drops the TEMP valves only, remove(NONE) all (FUN_00352500/00352610 D:L251228-251308)', () => {
    const store = new ValveStore();
    store.set('p', 1, VALVE_TYPE.PERM);
    store.set('t', 2, VALVE_TYPE.TEMP);
    store.set('s', 3, VALVE_TYPE.PERSIST);
    store.remove(VALVE_TYPE.TEMP);
    expect(store.all().map((v) => v.name)).toEqual(['p', 's']);
    store.remove(VALVE_TYPE.NONE);
    expect(store.all()).toEqual([]);
    expect(store.acquire('p', VALVE_TYPE.PERM).value).toBe(0);
  });

  it('the persistent valves are the PERSIST ones, NAME and VAL, in registry order (FUN_00352a90 D:L251463-251483)', () => {
    const store = new ValveStore();
    store.set('a', 1, VALVE_TYPE.PERSIST);
    store.set('b', 2, VALVE_TYPE.PERM);
    store.set('c', 3, VALVE_TYPE.TEMP);
    store.set('d', 0xffff, VALVE_TYPE.PERSIST);
    expect(store.persistentValves()).toEqual([{ name: 'a', value: 1 }, { name: 'd', value: 0xffff }]);
  });

  it('restoring them sets each at PERSIST (CValveSaveManager_UnSerialize FUN_00352960 D:L251410-251446)', () => {
    const store = new ValveStore();
    store.set('a', 7, VALVE_TYPE.TEMP);
    store.restorePersistent([{ name: 'a', value: 9 }, { name: 'z', value: 2 }]);
    expect(store.find('a')).toMatchObject({ value: 9, type: VALVE_TYPE.PERSIST });
    expect(store.find('z')).toMatchObject({ value: 2, type: VALVE_TYPE.PERSIST });
  });

  it('a valves table: type words PERM/TEMP/PERSIST in any case, else the default (CValve_Parse FUN_00351a90 D:L250805-250870)', () => {
    expect(valveTypeOf('PERM', VALVE_TYPE.PERM)).toBe(1);
    expect(valveTypeOf('temp', VALVE_TYPE.PERM)).toBe(2);
    expect(valveTypeOf('Persist', VALVE_TYPE.PERM)).toBe(3);
    expect(valveTypeOf(undefined, VALVE_TYPE.PERM)).toBe(1);
    expect(valveTypeOf('other', VALVE_TYPE.TEMP)).toBe(2);
    const store = new ValveStore();
    store.loadValves([{ name: 'g1', value: 4 }, { name: 'g2', value: 0, type: 'PERSIST' }], VALVE_TYPE.PERM);
    expect(store.all().map((v) => [v.name, v.value, v.type])).toEqual([['g1', 4, 1], ['g2', 0, 3]]);
  });

  it('a mission\'s Valves: PERM tag 1 else TEMP, PERSIST tag 3 (FUN_002acc10 D:L152384-152420)', () => {
    const store = new ValveStore();
    store.loadMissionValves([
      { name: 'm1', value: 5 },
      { name: 'm2', value: 6, perm: true },
      { name: 'm3', value: 7, persist: true },
    ]);
    expect(store.all().map((v) => [v.name, v.value, v.type])).toEqual([['m1', 5, 2], ['m2', 6, 1], ['m3', 7, 3]]);
  });
});

// OPT-03 (roadmap 04 OPT-03 under R7; research 229 §4): which valves persist. `CValveSaveManager_Serialize`
// (`FUN_00352a90`) walks the registry (D:L251471-251472) and writes a valve only when its type byte (+6) is 3
// (D:L251473): the type, not the name or the value, decides. Unit tests of the transcription: the reading level; the
// recomp's toggle-and-card diff (OPT-19, H25) is the proven level.
describe('the persistence rule for valves: PERSIST and nothing else reaches the card (FUN_00352a90 D:L251473; OPT-03)', () => {
  it('a TEMP and a PERM valve set in the store do not reach the module; a PERSIST one does', () => {
    const store = new ValveStore();
    store.set('Temp', 1, VALVE_TYPE.TEMP);
    store.set('Perm', 2, VALVE_TYPE.PERM);
    store.set('Persist', 3, VALVE_TYPE.PERSIST);
    store.acquire('Made', VALVE_TYPE.TEMP);                    // a script's parse makes its flags TEMP (D:L251782)
    expect(store.persistentValves()).toEqual([{ name: 'Persist', value: 3 }]);
  });

  it('the type at the save decides: a valve promoted to PERSIST reaches it; PERM and TEMP never lower a PERSIST one', () => {
    // FUN_003520d0's promotion (D:L251116-251121): PERSIST always, PERM over TEMP only, TEMP never.
    const store = new ValveStore();
    store.set('a', 1, VALVE_TYPE.TEMP);
    store.set('b', 2, VALVE_TYPE.PERSIST);
    expect(store.persistentValves().map((v) => v.name)).toEqual(['b']);
    store.set('a', 1, VALVE_TYPE.PERSIST);
    store.set('b', 4, VALVE_TYPE.PERM);
    store.acquire('b', VALVE_TYPE.TEMP);
    expect(store.persistentValves()).toEqual([{ name: 'a', value: 1 }, { name: 'b', value: 4 }]);
  });

  it('a valves table: an untyped row (CValve_Open\'s PERM, D:L152619) and a TEMP row stay off the card; a PERSIST row is on it', () => {
    const store = new ValveStore();
    store.loadValves([{ name: 'Untyped', value: 5 }, { name: 'Typed', value: 6, type: 'TEMP' }, { name: 'Kept', value: 7, type: 'PERSIST' }], VALVE_TYPE.PERM);
    expect(store.persistentValves()).toEqual([{ name: 'Kept', value: 7 }]);
  });

  it('a mission\'s Valves: only the PERSIST tag persists (FUN_002acc10 D:L152384-152420)', () => {
    const store = new ValveStore();
    store.loadMissionValves([{ name: 'm1', value: 1 }, { name: 'm2', value: 2, perm: true }, { name: 'm3', value: 3, persist: true }]);
    expect(store.persistentValves()).toEqual([{ name: 'm3', value: 3 }]);
  });

  it('a TEMP valve is gone after the level\'s teardown, a PERSIST one is still written (FUN_00352500 D:L251228-251308)', () => {
    const store = new ValveStore();
    store.set('t', 1, VALVE_TYPE.TEMP);
    store.set('s', 2, VALVE_TYPE.PERSIST);
    store.remove(VALVE_TYPE.TEMP);
    expect(store.persistentValves()).toEqual([{ name: 's', value: 2 }]);
  });
});
