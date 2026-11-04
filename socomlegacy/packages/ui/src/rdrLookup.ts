import type { RdrNode } from '@s2u/archive';

/**
 * The engine's reader-node lookups, as the dialog loader calls them (web research 105 §1). Every one is a search of
 * the node it is given, never a walk of a fixed record shape (`D:L<line>` = a line of `socom2_game.elf.decomp.c`):
 *
 * - `FUN_0032f0e0` (D:L230255-230299; `FUN_0032f0d0` D:L230210-230254 is the same from index 0): walk the list in
 *   order; a child list is searched first, depth-first, and its hit returned; a string child equal to the key
 *   (`strcmp`, `FUN_00198f18`: case-sensitive) returns the node AFTER it. So a key is found wherever it stands --
 *   inside a nested state block, a subordinate's record, a sibling's binding -- and the first one in document order
 *   wins; a doubled key's second copy is never read.
 * - `FUN_0032ee10` (D:L230100-230139) a string: the found node if it is a string, else the first element of a found
 *   list when that is a string, else none.
 * - `FUN_0032e970` (D:L229877-229926) `n` ints / `FUN_0032ea80` (D:L229927-229976) `n` floats: only when the found
 *   node is a list of at least `n` elements; an int element as it is, a float truncated (ints) or kept (floats),
 *   anything else 0. `FUN_0032dc80` (D:L229275-229313) two ints and `FUN_0032dd80` two floats need more than one
 *   element; `FUN_0032de80` (D:L229371-229409) three floats more than two. A read that fails leaves the field's
 *   default.
 *
 * `parseRdr` keeps no node types: a number reads back as its spelling. TOKEN_TYPE_READING: a number read takes a token
 * that spells a finite number as an int/float node and any other token as a string (0); a string read takes any token
 * as a string. On the disc's 110 + 4 dialogs no number-typed node stands under a key the loader reads as a string, and
 * no number-spelled string under a key it reads as a number (a typed probe of the files, research 105 §1; the strings
 * that spell numbers are `CAPTION`s and `ARGUMENT`s, read as strings), so on them the rule reads what the engine reads.
 *
 * Each key the lookups match is recorded (`consumed`), so a caller can list the keys no reader touched.
 */

/** Research 105 §1: a token spelling a finite number is read as a number node; see the module doc. */
export const TOKEN_TYPE_READING = 'a number read takes a number-spelled token as a number node, any other as 0; a string read takes any token';

/** What a found key at the very end of its list returns: present, but no value (the engine's pointer runs past it). */
const PAST_END: readonly RdrNode[] = Object.freeze([]);

const numberOf = (n: RdrNode | undefined): number | null => {
  if (typeof n !== 'string' || n.trim() === '') return null;
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
};

export class RdrLookup {
  /** The key positions a lookup matched: the list, and the key's index in it. */
  private readonly hits = new Map<readonly RdrNode[], Set<number>>();

  /** `FUN_0032f0e0`: the node after the first string equal to `key`, depth-first; undefined when there is none. */
  find(node: RdrNode | undefined, key: string): RdrNode | undefined {
    return this.search(node, key, 0);
  }

  private search(node: RdrNode | undefined, key: string, depth: number): RdrNode | undefined {
    if (!Array.isArray(node) || depth > 64) return undefined;
    for (let i = 0; i < node.length; i++) {
      const c = node[i]!;
      if (Array.isArray(c)) {
        const hit = this.search(c, key, depth + 1);
        if (hit !== undefined) return hit;
      } else if (c === key) {
        let set = this.hits.get(node);
        if (!set) this.hits.set(node, (set = new Set()));
        set.add(i);
        return i + 1 < node.length ? node[i + 1]! : (PAST_END as RdrNode[]);
      }
    }
    return undefined;
  }

  /** `FUN_0032f0d0` used as a flag: whether the key stands anywhere under `node`. */
  has(node: RdrNode | undefined, key: string): boolean {
    return this.find(node, key) !== undefined;
  }

  /** `FUN_0032ee10`. */
  str(node: RdrNode | undefined, key: string): string | null {
    const v = this.find(node, key);
    if (typeof v === 'string') return v;
    if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'string') return v[0];
    return null;
  }

  /** The list a key opens (`FUN_0032f0d0` then a walk of its elements), or null when it is absent or not a list. */
  list(node: RdrNode | undefined, key: string): RdrNode[] | null {
    const v = this.find(node, key);
    return Array.isArray(v) && v !== PAST_END ? v : null;
  }

  /** `FUN_0032e970` (`int`) and `FUN_0032ea80` (`float`) with count `n`; `min` is the element count the reader needs. */
  private numbers(node: RdrNode | undefined, key: string, n: number, min: number, int: boolean): number[] | null {
    const v = this.find(node, key);
    if (!Array.isArray(v) || v.length < min) return null;
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      const x = numberOf(v[i]);
      out.push(x === null ? 0 : int ? Math.trunc(x) : Math.fround(x));
    }
    return out;
  }

  ints(node: RdrNode | undefined, key: string, n = 1): number[] | null { return this.numbers(node, key, n, n, true); }
  floats(node: RdrNode | undefined, key: string, n = 1): number[] | null { return this.numbers(node, key, n, n, false); }
  int(node: RdrNode | undefined, key: string): number | null { return this.ints(node, key)?.[0] ?? null; }
  float(node: RdrNode | undefined, key: string): number | null { return this.floats(node, key)?.[0] ?? null; }
  /** `FUN_0032dc80`: two ints, from a list of more than one element. */
  int2(node: RdrNode | undefined, key: string): [number, number] | null { return this.numbers(node, key, 2, 2, true) as [number, number] | null; }
  /** `FUN_0032dd80`: two floats. */
  float2(node: RdrNode | undefined, key: string): [number, number] | null { return this.numbers(node, key, 2, 2, false) as [number, number] | null; }
  /** `FUN_0032de80`: three floats, from a list of more than two elements (a colour). */
  float3(node: RdrNode | undefined, key: string): [number, number, number] | null {
    return this.numbers(node, key, 3, 3, false) as [number, number, number] | null;
  }

  /** Whether the key at `list[index]` was matched by any lookup. */
  wasRead(list: readonly RdrNode[], index: number): boolean {
    return this.hits.get(list)?.has(index) ?? false;
  }
}

/**
 * The keys of a subtree: each string that is followed by a list in its own list (`"KEY" (values)`), with where it
 * stands -- its list and index, its value list, the value lists of the keys it stands under, and a readable path. A
 * value list's strings (`("0.3" "1")`, `("brown_back.tif")`) are not keys.
 */
export interface RdrKey {
  list: readonly RdrNode[];
  index: number;
  key: string;
  value: readonly RdrNode[];
  within: readonly (readonly RdrNode[])[];
  path: string;
}

export function keysOf(node: RdrNode, path = ''): RdrKey[] {
  const out: RdrKey[] = [];
  const walk = (n: RdrNode, at: string, within: readonly (readonly RdrNode[])[], depth: number): void => {
    if (!Array.isArray(n) || depth > 64) return;
    for (let i = 0; i < n.length; i++) {
      const c = n[i]!, v = n[i + 1];
      if (typeof c === 'string' && Array.isArray(v)) {
        const here = at ? `${at}/${c}` : c;
        out.push({ list: n, index: i, key: c, value: v, within, path: here });
        walk(v, here, [...within, v], depth + 1);
        i++;
      } else if (Array.isArray(c)) walk(c, at, within, depth + 1);
    }
  };
  walk(node, path, [], 0);
  return out;
}
