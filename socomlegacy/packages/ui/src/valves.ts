/**
 * The valve store: the game's one global namespace of named u16 values with watchers (PLAT-09; research 104 §1-§3).
 *
 * Read from the retail decompilation (`D:L<line>` = a line of `socom2_game.elf.decomp.c`; names from
 * `recomp/socom2_names.csv`):
 * - **The registry** is one list at 0x49e800, in the order the valves were made (each new one appended,
 *   `FUN_001feae0` at the list's end: D:L251055, D:L251102). A name is matched with `strcmp` (0x198f18, case-sensitive;
 *   `FUN_00351ef0` D:L250995-251017). A valve is 0x14 bytes: the name, the u16 value at +4, the type at +6, the
 *   watcher list at +8 (`FUN_00352ea0` D:L251603-251640).
 * - **The type** (reCOM `zvalve.h` VALVE_TYPE, the words `CValve_Parse` matches): 1 PERM, 2 TEMP, 3 PERSIST.
 * - **The VALVE ops 0-18** are `FUN_00353fd0` (D:L252128-252345), the zAnim VALVE command's tick (its slot 0x353d00,
 *   registered at D:L252352, is `j 0x353fd0` with the command +4 as the argument).
 * - **The watchers** are `FUN_003519f0` (D:L250781-250803): a write that changes the value calls every watcher, in the
 *   order added, whose mask holds the event -- 1 when the new value is non-zero, 2 when it is zero.
 *
 * What this module does not hold: the zAnim context's input valves (`INPUT_VALVE<n>`, the command's flags 1 and 4,
 * `FUN_002721c0`) are the script runner's (PLAT-07); the card's bytes are OPT-02's (the persistent valves leave here as
 * an ordered `{name, value}` list).
 */

/** The valve's type (`+6`): the words of `CValve_Parse` (D:L250843-250860) and of a mission's `Valves`. */
export const VALVE_TYPE = { NONE: 0, PERM: 1, TEMP: 2, PERSIST: 3 } as const;
export type ValveType = (typeof VALVE_TYPE)[keyof typeof VALVE_TYPE];

/** The event a write hands the watchers (`lVar7`, e.g. D:L252216-252221): 1 a non-zero result, 2 a zero one. */
export const VALVE_EVENT = { NONZERO: 1, ZERO: 2 } as const;
export type ValveEvent = (typeof VALVE_EVENT)[keyof typeof VALVE_EVENT];

/** A watcher's call: `fn(valve, ctx)` (D:L250796) -- it is told the valve and its context, not the event. */
export type ValveWatcher = (valve: Valve, ctx: unknown) => void;

/** A valve. `value` is the u16 at +4; write it through the store (`set`, `apply`) so the watchers run. */
export interface Valve {
  readonly name: string;
  value: number;
  type: ValveType;
}

/** A watcher record (`FUN_00351960` D:L250758-250779: 12 bytes, mask, function, context). */
interface Watcher { mask: number; fn: ValveWatcher; ctx: unknown }

/** A valve with its watchers (+8). */
interface Held extends Valve { watchers: Watcher[] }

/**
 * A VALVE command as its tick reads it (research 95 §1.3, the parse `FUN_003535d0` D:L251733-251972): the valve
 * (a name the registry resolves, or the valve itself -- flags 0, "the reference is the pointer"), the op byte (+12) and
 * the operand -- the command's 32-bit word, or another valve (flag 0x10; by name with 0x08).
 */
export interface ValveCommand {
  valve: string | Valve;
  op: number;
  operand: number | { valve: string | Valve };
}

/** An entry of a `valves` table (`global_valves.rdr`): `name`, `value`, an optional `type` word. */
export interface ValveEntry { name: string; value: number; type?: string }

/** An entry of a mission's `Valves` (`mission.rdr`): `NAME`, `VALUE`, the `PERM` and `PERSIST` tags present or not. */
export interface MissionValveEntry { name: string; value: number; perm?: boolean; persist?: boolean }

const U16 = 0xffff;

/**
 * A `valves` table's type word (`CValve_Parse` FUN_00351a90 D:L250843-250860): `PERM` 1, `TEMP` 2, `PERSIST` 3,
 * matched with `strcasecmp` (0x198b80); none, or another word, is the caller's default.
 */
export function valveTypeOf(word: string | undefined, fallback: ValveType): ValveType {
  if (word === undefined) return fallback;
  const w = word.toUpperCase();
  if (w === 'PERM') return VALVE_TYPE.PERM;
  if (w === 'TEMP') return VALVE_TYPE.TEMP;
  return w === 'PERSIST' ? VALVE_TYPE.PERSIST : fallback;
}

/** The store. One per game, as the original has one registry. */
export class ValveStore {
  private readonly list: Held[] = [];

  /** The valve of `name`, or undefined (`FUN_00351ef0`: strcmp, the first in registry order). */
  find(name: string): Valve | undefined {
    return this.list.find((v) => v.name === name);
  }

  /** Every valve, in registry order. */
  all(): readonly Valve[] {
    return this.list;
  }

  /**
   * Find or make (`FUN_00351ff0` D:L251034-251067): an absent valve is made at 0 with `type` (`FUN_00352230`
   * D:L251127-251177 zeroes it) and appended; a held one is promoted -- PERM unless it is PERSIST, PERSIST always,
   * TEMP never (D:L251058-251063).
   */
  acquire(name: string, type: ValveType): Valve {
    const held = this.held(name);
    if (held) { promote(held, type); return held; }
    return this.make(name, type);
  }

  /**
   * Set (`FUN_003520d0` D:L251069-251125): find or make it, write `value` through the watchers -- the whole value
   * compared with the u16 held, its low 16 bits stored -- and promote it as `acquire` does.
   */
  set(name: string, value: number, type: ValveType): Valve {
    const held = this.held(name);
    if (!held) { const v = this.make(name, type); this.write(v, value); return v; }
    this.write(held, value);
    promote(held, type);
    return held;
  }

  /** Add a watcher (`FUN_00351960`): appended to the valve's list, run on the events `mask` holds. */
  watch(valve: Valve | string, mask: number, fn: ValveWatcher, ctx?: unknown): void {
    const v = this.resolve(valve);
    if (!v) throw new Error(`no valve ${String(valve)}`);
    v.watchers.push({ mask, fn, ctx });
  }

  /** Drop every watcher of a valve (`FUN_003518c0` D:L250733-250756). */
  clearWatchers(valve: Valve | string): void {
    const v = this.resolve(valve);
    if (v) v.watchers.length = 0;
  }

  /**
   * Run a VALVE command (`FUN_00353fd0` D:L252128-252345). Its return is the command's truth: a test's result, true
   * for every assignment, false for an op past 18 and for a valve the registry does not hold (nothing is made here:
   * the script parse made it, `FUN_00351ff0(name, TEMP)` at D:L251782). The ops read the operand's low 16 bits
   * (D:L252180); an operand valve the registry lacks reads 0 (D:L252175-252178).
   */
  apply(cmd: ValveCommand): boolean {
    const v = this.resolve(cmd.valve);
    if (!v) return false;                                          // D:L252156-252157
    const cur = v.value;
    let operand: number;
    if (typeof cmd.operand === 'number') operand = cmd.operand & U16;
    else operand = this.resolve(cmd.operand.valve)?.value ?? 0;
    switch (cmd.op) {
      case 0: return true;                                         // D:L252182-252184
      case 1: return cur !== operand;                              // D:L252185-252187
      case 2: return cur === operand;                              // D:L252188-252190
      case 3: return operand < cur;                                // D:L252191-252193
      case 4: return cur < operand;                                // D:L252194-252196
      case 5: return operand <= cur;                               // D:L252197-252199
      case 6: return cur <= operand;                               // D:L252200-252202
      case 7: return cur !== 0 || operand !== 0;                   // D:L252203-252205
      case 8: return (cur & operand) !== 0;                        // D:L252206-252208
      case 9: return ((cur | ~operand) >>> 0) !== 0;               // D:L252209-252211: never zero in 32 bits
      case 10: return (cur & ~operand) !== 0;                      // D:L252212-252214
      case 11: this.write(v, operand); return true;                // D:L252215-252228
      case 12: this.write(v, cur + operand); return true;          // D:L252229-252243
      case 13: this.write(v, cur < operand ? 0 : cur - operand); return true;   // D:L252244-252263
      case 14: this.write(v, (cur * operand) >>> 0); return true;  // D:L252264-252278
      case 15: this.write(v, cur | operand); return true;          // D:L252279-252293
      case 16: this.write(v, cur & operand); return true;          // D:L252294-252308
      case 17: this.write(v, (cur | ~operand) >>> 0); return true; // D:L252309-252323
      case 18: this.write(v, cur & ~operand); return true;         // D:L252324-252338
      default: return false;                                       // D:L252339-252340
    }
  }

  /**
   * Drop the valves of one type, or all of them with `NONE` (`FUN_00352500`/`FUN_00352610` D:L251228-251308): the
   * level's teardown drops the TEMP ones (`FUN_00351c20`, `FUN_00351cb0`), `FUN_00351e60` all. No watcher runs.
   */
  remove(type: ValveType): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      if (type === VALVE_TYPE.NONE || this.list[i]!.type === type) this.list.splice(i, 1);
    }
  }

  /**
   * The valves the card keeps (`CValveSaveManager`, `FUN_00352a90` D:L251463-251483, under `PersistentValves`): every
   * PERSIST valve, `NAME` and `VAL`, in registry order. OPT-02 keeps them as JSON in the file's data (R7; no codec).
   */
  persistentValves(): Array<{ name: string; value: number }> {
    return this.list.filter((v) => v.type === VALVE_TYPE.PERSIST).map((v) => ({ name: v.name, value: v.value }));
  }

  /** Read them back (`CValveSaveManager_UnSerialize` FUN_00352960 D:L251410-251446): each `set` at PERSIST. */
  restorePersistent(entries: Iterable<{ name: string; value: number }>): void {
    for (const e of entries) this.set(e.name, e.value, VALVE_TYPE.PERSIST);
  }

  /**
   * A `valves` table (`CValve_Parse` FUN_00351a90 D:L250805-250870): each entry `set` with its type word, else
   * `fallback`. `CValve_Open` (FUN_00351d40 D:L250922-250959) reads `global_valves.rdr` so at PERM (D:L152619).
   */
  loadValves(entries: Iterable<ValveEntry>, fallback: ValveType): void {
    for (const e of entries) this.set(e.name, e.value, valveTypeOf(e.type, fallback));
  }

  /** A mission's `Valves` (`FUN_002acc10` D:L152384-152420): `PERM` present 1 else 2, `PERSIST` present 3. */
  loadMissionValves(entries: Iterable<MissionValveEntry>): void {
    for (const e of entries) {
      const type = e.persist ? VALVE_TYPE.PERSIST : e.perm ? VALVE_TYPE.PERM : VALVE_TYPE.TEMP;
      this.set(e.name, e.value, type);
    }
  }

  private held(name: string): Held | undefined {
    return this.list.find((v) => v.name === name);
  }

  private resolve(ref: Valve | string): Held | undefined {
    if (typeof ref === 'string') return this.held(ref);
    return this.list.find((v) => v === ref);
  }

  private make(name: string, type: ValveType): Held {
    const v: Held = { name, value: 0, type, watchers: [] };
    this.list.push(v);
    return v;
  }

  /**
   * The write every assignment shares (e.g. D:L252216-252226): the result as computed (up to 32 bits) is compared
   * with the u16 held; its low 16 bits are stored; a difference runs the watchers with the result's event.
   */
  private write(v: Held, result: number): void {
    const changed = v.value !== result;
    v.value = result & U16;
    if (changed) fire(v, result !== 0 ? VALVE_EVENT.NONZERO : VALVE_EVENT.ZERO);
  }
}

/** The promotion `FUN_00351ff0` and `FUN_003520d0` share. */
function promote(v: Valve, type: ValveType): void {
  if (type === VALVE_TYPE.PERM && v.type !== VALVE_TYPE.PERSIST) v.type = VALVE_TYPE.PERM;
  if (type === VALVE_TYPE.PERSIST) v.type = VALVE_TYPE.PERSIST;
}

/** `FUN_003519f0`: every watcher, in the order added, whose mask holds the event (`event & 0xff & mask`). */
function fire(v: Held, event: ValveEvent): void {
  for (const w of [...v.watchers]) if ((event & 0xff & w.mask) !== 0) w.fn(v, w.ctx);
}
