import type { EffectOp, EffectProgram, WorldPoly } from '@s2u/scene';
import { under } from '../mapMeta';

/**
 * What a map's context action, or a destructible's death, does -- for the Outliner and the Inspector (a browser
 * adaptation, FG.R2: the game has no editor). Read off the decoded zAnim programs (`@s2u/scene` `effects.ts`;
 * research 209 s2-s4), never run: an action's record names its programs (`anim`), and each program turns nodes on and
 * off (`OBJECT_ACTIVE_STATE`, the healthy/destroyed swap of research 171 s4 and 174 s3), moves them, fires weapons
 * (`FIRE_WEAPON`, research 213 s2.2), calls other programs (`CALL_ANIMATION`) and executes other actions
 * (`EXECUTE_ACTION`, a barrier's death -> `set_accessN` -> `destroy_accessN`, research 174 s3). Nothing here changes
 * what the match does.
 */

/** What the programs do, each name once, in the order first met. */
export interface ActionEffects {
  /** The programs of the map's set that run (the record's own, then those they call or execute), each once. */
  runs: string[];
  /** Nodes turned on / off (`active`). */
  shows: string[];
  hides: string[];
  /** Nodes moved (`translate`, `rotate`, `fromTo`). */
  moves: string[];
  /** Weapons fired (`fireWeapon`: their damage definitions, research 171 s4). */
  weapons: string[];
  /** Actions executed, by valve (`executeAction`). */
  actions: string[];
  /** Animations called that the map's set does not hold (the common set's effects: `fire_explode_med`). */
  effects: string[];
  /** Messages shown (`message`, its text where the program gives one). */
  messages: string[];
  /** The placed paths of the nodes turned on, off or moved (with `EffectWalk.place`; else none): the guide lines' ends. */
  paths: string[];
}

/** How `programEffects` follows a program out of its own record. */
export interface EffectWalk {
  /** The programs of the action of a valve (an `EXECUTE_ACTION`'s): `MapAction.anims`. */
  actionAnims?: (valve: string) => readonly string[];
  /**
   * A program's node references placed under `scope` -- the world's own placing (`../sceneHealth` `placeRefs`, as
   * `WorldState.executeAction` and its `call` place them). Absent, no paths.
   */
  place?: (program: EffectProgram, scope: string | null) => (string | null)[];
  /** Where the action of a valve stands (`MapAction.path`): an executed action's programs run at its node. */
  actionPath?: (valve: string) => string | null;
  /** The first programs' scope: the action's own node (`MapAction.path`). */
  scope?: string | null;
  /** The first program's references already placed (a destructible's, `SceneDestructible.nodes`). */
  nodes?: readonly (string | null)[];
}

/** The node a program's reference index names; none for index 0 (`NA`) or a context reference (negative). */
const nodeName = (p: EffectProgram, i: number): string | null => {
  const n = i > 0 ? p.nodes[i] : undefined;
  return n && n !== 'NA' ? n : null;
};

/**
 * What `anims` do: each program of `programs` (the map's set, by name) walked whole -- every sequence -- following a
 * call into the set (scoped at the calling program's root, as the world's `call`) and an `EXECUTE_ACTION` into the
 * programs of the action of that valve (at that action's node), each program once. A name the set does not hold is an
 * effect of the common set.
 */
export function programEffects(anims: readonly string[], programs: ReadonlyMap<string, EffectProgram>, walk: EffectWalk = {}): ActionEffects {
  const out: ActionEffects = { runs: [], shows: [], hides: [], moves: [], weapons: [], actions: [], effects: [], messages: [], paths: [] };
  const add = (list: string[], v: string | null | undefined): void => { if (v && !list.includes(v)) list.push(v); };
  let first = true;
  const visit = (name: string, scope: string | null): void => {
    if (out.runs.includes(name)) return;
    const p = programs.get(name);
    if (!p) { add(out.effects, name); return; }
    out.runs.push(name);
    const nodes = first && walk.nodes ? walk.nodes : walk.place ? walk.place(p, scope) : [];
    first = false;
    const root = (p.root > 0 ? nodes[p.root] : null) ?? scope;
    const node = (list: string[], i: number): void => { add(list, nodeName(p, i)); if (i > 0) add(out.paths, nodes[i]); };
    const op = (o: EffectOp): void => {
      switch (o.op) {
        case 'active': node(o.on ? out.shows : out.hides, o.node); break;
        case 'translate': case 'rotate': case 'fromTo': node(out.moves, o.node); break;
        case 'fireWeapon': add(out.weapons, o.weapon); break;
        case 'message': add(out.messages, o.text); break;
        case 'call': visit(o.anim, root); break;
        case 'executeAction': {
          add(out.actions, o.anim);
          const at = walk.actionPath?.(o.anim) ?? null;
          for (const a of walk.actionAnims?.(o.anim) ?? []) visit(a, at);
          break;
        }
        default: break;
      }
    };
    for (const s of p.sequences) for (const o of s.ops) op(o);
  };
  for (const a of anims) visit(a, walk.scope ?? null);
  return out;
}

/**
 * The places a guide line from `from` reaches (an editor guide, FG.R2): `targets` less those within `near` of `from`
 * along the ground (the object's own parts) and those within `near` of one already kept (a bridge's healthy and
 * destroyed halves stand together), in order.
 */
export function linkTargets(from: readonly number[], targets: readonly (readonly [number, number, number])[], near: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  const close = (a: readonly number[], b: readonly number[]): boolean => Math.hypot(a[0]! - b[0]!, a[2]! - b[2]!) <= near;
  for (const t of targets) if (!close(t, from) && !out.some((o) => close(o, t))) out.push([t[0], t[1], t[2]]);
  return out;
}

/**
 * A guide line from `from` to each of `to`: the line, and a small cross at its end (line pairs, world space) -- the
 * editor's picture of what an action or a destructible's death reaches.
 */
export function linkSegments(from: readonly number[], to: readonly (readonly number[])[], cross = 4): number[] {
  const out: number[] = [];
  for (const t of to) {
    out.push(from[0]!, from[1]!, from[2]!, t[0]!, t[1]!, t[2]!);
    out.push(t[0]! - cross, t[1]!, t[2]!, t[0]! + cross, t[1]!, t[2]!, t[0]!, t[1]!, t[2]! - cross, t[0]!, t[1]!, t[2]! + cross);
  }
  return out;
}

/** How a record is used: a typed one by the Action button; a type-less one (8) never prompts (research 209 s3, 176 s7.1). */
export function actionTriggerText(r: { type: string; typeCode: number }): string {
  return r.typeCode === 8 ? 'no prompt (run by damage or a script)' : `Action button (${r.type.toUpperCase()})`;
}

/**
 * Who may use it, the record's raw first `team` value: absent, anyone (`FUN_002b49f0` D:L157059); 0 on Sujo's and
 * Enowapi's SEAL radios, 8 on Sandstorm's Terrorist ones (research 174). Any other value is shown as it is.
 */
export function actionTeamText(team: number | null): string {
  if (team === null) return 'anyone';
  return team === 0 ? 'SEALs (team 0)' : team === 8 ? 'Terrorists (team 8)' : `team ${team}`;
}

/** The prompt icon's file name in words: `action_pull_lever.tif` -> `pull lever`. */
export function bitmapWords(bitmap: string): string {
  return bitmap.replace(/\.tif$/i, '').replace(/^action_/i, '').replace(/_/g, ' ').trim();
}

/**
 * What sets a destructible off: with health above 0, C4 or enough damage (`SceneHealth.accepts`, research 174 s3);
 * at 0, any delivered hit and never C4 (Fish Hook's and Sandstorm's planks, research 174, 175 s5.4).
 */
export function damageTriggerText(health: number, shield: number): string {
  return health > 0 ? `C4 or damage (health ${health}, shield ${shield})` : 'any hit sets it off (health 0, no C4)';
}

/**
 * The middle of the collision at or under `path` -- where the game's pick meets the action (`FUN_005aa240` takes the
 * aimed polygon's node, research 209 s3), which can sit far from the node's origin (Crossroads' Terrorist switch, about
 * 25 units, research 171 s3). Null with no collision under it.
 */
export function aimPointOf(polys: readonly WorldPoly[], path: string): [number, number, number] | null {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  let any = false;
  for (const q of polys) {
    if (!under(q.path, path)) continue;
    for (let i = 0; i + 2 < q.points.length; i += 3) {
      for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k]!, q.points[i + k]!); hi[k] = Math.max(hi[k]!, q.points[i + k]!); }
      any = true;
    }
  }
  return any ? [(lo[0]! + hi[0]!) / 2, (lo[1]! + hi[1]!) / 2, (lo[2]! + hi[2]!) / 2] : null;
}
