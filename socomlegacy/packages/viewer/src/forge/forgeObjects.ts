import { Matrix4 } from 'three';
import type { EffectOp, EffectProgram } from '@s2u/scene';
import type { ForgeObject as LayoutObject, ScriptStep, ScriptSteps } from '@s2u/creator-contracts';
import type { SoundEmitter } from '../soundData';
import type { LoadedMap } from '../loadMap';
import type { ForgeAmbient } from '../mapMeta';
import type { Effects } from '../effects';

/**
 * The Forge's own objects in a match (the owner, 2026-11-10: "find every type of object we can place ... I want to be
 * able to place every type of object in game"; a browser adaptation, FG.R2; `@s2u/creator-contracts` `ForgeObject`):
 *
 * - **an ambient effect**, one of a disc map's ambient programs (`ambientProgramsOf`: its mission set's self-starting
 *   animations, `(flags & 3) === 1` as `../effectData` reads them, that draw or sound) -- played on every page from the
 *   map's start at its place (`playForgeAmbients`), its program and its sounds lent from its map (`../forge/scriptAssets`);
 *   its place kept by its path (`forgeObjectPath`, `MapMeta.forgePlaces`), a script's target. Its sounds may be its own
 *   script (`ScriptStep`s, the one script of switches and triggers too) in place of its program's: made a self-starting
 *   program at its place (`./placedAccess` `withPlacedAccess`) and run as the map's own are.
 */
/** A Forge object's placed path: its place in `Layout.objects`, one-based. */
export const forgeObjectPath = (i: number): string => `forge/object_${i + 1}`;

/**
 * A placed scripted effect (the owner, 2026-11-13: "a unified effect object that a user can drag out and customize"; a
 * browser adaptation, FG.R2): an ambient object (`ForgeObject`, kind `ambient`) named `FORGE_SCRIPT_OBJECT` -- no disc
 * program has the name, so none plays (`Effects.playAt` finds none) -- its script (`ForgeObject.script`) its whole: the
 * game's own commands, its sounds, its effects and whatever else a script does. `FORGE_SOUND_OBJECT`, the name such an
 * object first had, is read the same.
 */
export const FORGE_SCRIPT_OBJECT = '=script';
export const FORGE_SOUND_OBJECT = '=sound';
/** The Effect tab's tiles' object names: a single sound's (`=sound:<sound>`), a single effect's (`=effect:<effect>`). */
export const SOUND_ASSET_PREFIX = `${FORGE_SOUND_OBJECT}:`;
export const EFFECT_ASSET_PREFIX = '=effect:';
/**
 * How long a placed single effect or one-shot sound waits before it runs again (its starting script: play, wait, loop):
 * an editor's starting value, no game value -- the player's to change (the owner, 2026-11-13: "just make them loop").
 */
export const FORGE_SCRIPT_LOOP_WAIT_ADAPTATION = 5;
/** Whether an ambient object is a placed scripted effect (`FORGE_SCRIPT_OBJECT`), not a disc map's ambient effect. */
export const isScriptObject = (o: { name: string }): boolean => o.name === FORGE_SCRIPT_OBJECT || o.name === FORGE_SOUND_OBJECT;
/** The sound a sound tile's name names (`SOUND_ASSET_PREFIX`), or null. */
export const soundOfAssetName = (name: string): string | null => (name.startsWith(SOUND_ASSET_PREFIX) ? name.slice(SOUND_ASSET_PREFIX.length) : null);
/** The effect an effect tile's name names (`EFFECT_ASSET_PREFIX`), or null. */
export const effectOfAssetName = (name: string): string | null => (name.startsWith(EFFECT_ASSET_PREFIX) ? name.slice(EFFECT_ASSET_PREFIX.length) : null);
/**
 * An ambient object as placed: a single sound's or effect's tile (`=sound:` / `=effect:`) a scripted effect
 * (`FORGE_SCRIPT_OBJECT`) running it from `source` -- a `~` sound once (it loops, the game's rule), a one-shot sound or an
 * effect, then a wait (`FORGE_SCRIPT_LOOP_WAIT_ADAPTATION`), then from the top again (LOOP, for ever); any other as it is.
 */
export function scriptObjectData<T extends { kind: 'ambient'; source: string; name: string; script?: ScriptSteps }>(o: T): T {
  const sound = soundOfAssetName(o.name), effect = effectOfAssetName(o.name);
  if (sound === null && effect === null) return o;
  const run: ScriptStep = sound !== null ? { do: 'sound', name: sound, from: o.source } : { do: 'effect', name: effect!, from: o.source };
  const steps: ScriptStep[] = sound !== null && sound.startsWith('~') ? [run] : [run, { do: 'wait', seconds: FORGE_SCRIPT_LOOP_WAIT_ADAPTATION }, { do: 'loop' }];
  return { ...o, name: FORGE_SCRIPT_OBJECT, script: o.script ?? { steps } };
}

/** A map's ambient program as the asset browser offers it. */
export interface AmbientProgram {
  name: string;
  /** Its root node's name on its own map; null for one rooted nowhere (the weather: rain, snow, bugs -- about the camera). */
  root: string | null;
  particles: boolean;
  sound: boolean;
  light: boolean;
  /** Every sound its program and the programs it calls play (`SOUND`): what the match lends with it. */
  sounds: string[];
  /** Its looping sounds (a `~` name, `./soundData` `zanimEmitters`' rule) at their commands' volumes: its emitters. */
  loops: { sound: string; volume: number }[];
}

/** A map's ambient programs (`AmbientProgram`), each once, by name. */
export function ambientProgramsOf(map: Pick<LoadedMap, 'meta'>): AmbientProgram[] {
  const programs = (map.meta?.scene?.programs ?? []).map((p) => p.program);
  const byName = new Map(programs.map((p) => [p.name.toLowerCase(), p]));
  const closure = (p: EffectProgram, seen = new Set<string>()): EffectProgram[] => {
    if (seen.has(p.name.toLowerCase()) || seen.size > 16) return [];
    seen.add(p.name.toLowerCase());
    const called = p.sequences.flatMap((s) => s.ops.flatMap((o) => (o.op === 'call' ? [byName.get(o.anim.toLowerCase())] : []))).filter((x): x is EffectProgram => !!x);
    return [p, ...called.flatMap((c) => closure(c, seen))];
  };
  const out: AmbientProgram[] = [];
  for (const p of programs) {
    if ((p.flags & 3) !== 1) continue;
    const ops = closure(p).flatMap((q) => q.sequences.flatMap((s) => s.ops));
    const particles = ops.some((o) => o.op === 'particles'), light = ops.some((o) => o.op === 'light');
    const sounds = [...new Set(ops.flatMap((o) => (o.op === 'sound' ? [o.sound] : [])))];
    const loops: { sound: string; volume: number }[] = [];
    for (const o of ops) if (o.op === 'sound' && o.sound.startsWith('~') && !loops.some((l) => l.sound === o.sound)) loops.push({ sound: o.sound, volume: o.volume });
    if (!particles && !light && sounds.length === 0) continue;
    // The round's own control scripts are no placeable effect: the objectives' music and lines (`MUS_`, `^` voices) and
    // the indoor/outdoor ambience's switch (`check_camera_inside_state`, research 81 s10).
    if (/^check_camera_inside_state/i.test(p.name) || sounds.some((n) => n.startsWith('MUS_') || n.startsWith('^'))) continue;
    const rootName = p.nodes[p.root];
    out.push({ name: p.name, root: rootName && rootName !== 'NA' && rootName !== 'camera' ? rootName : null, particles, sound: sounds.length > 0, light, sounds, loops });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * A layout's ambient effects' looping sounds as the audio's emitters (`./soundData` `SoundData.emitters`: a loop at a world
 * place, its gain the listener's distance under its RANGE each frame) -- as the map's own ambient loops sound (the
 * owner, 2026-11-10: "when I place an ambient object with sound ... I don't hear it"): each placed ambient's `~` sounds
 * (`AmbientProgram.loops`, its program read by `programOf`) at its place, at its command's volume.
 */
export function forgeAmbientEmitters(objects: readonly LayoutObject[] | undefined, programOf: (source: string, name: string) => AmbientProgram | null): SoundEmitter[] {
  const out: SoundEmitter[] = [];
  (objects ?? []).forEach((o, i) => {
    // A script's own (`forgeScriptEmitters`) in place of its program's.
    if (o.script) { out.push(...forgeScriptEmitters(forgeObjectPath(i), o.at, o.script.steps)); return; }
    if (o.kind !== 'ambient') return;
    const p = programOf(o.source, o.name);
    for (const l of p?.loops ?? []) out.push({ anim: o.name, sound: l.sound, node: forgeObjectPath(i), position: [o.at[0], o.at[1], o.at[2]], ...(l.volume !== 1 ? { volume: l.volume } : {}) });
  });
  return out;
}

/**
 * `map` with the layout's Forge objects (`objects`): each one's place by its path (`MapMeta.forgePlaces`), and the
 * ambient effects to play (`MapMeta.forgeAmbients`). The map as it was without any.
 */
export function withForgeObjects(map: LoadedMap, objects: readonly LayoutObject[] | undefined): LoadedMap {
  if (!map.meta || !objects?.length) return map;
  const forgePlaces: Record<string, [number, number, number]> = { ...(map.meta.forgePlaces ?? {}) };
  const forgeAmbients: ForgeAmbient[] = [...(map.meta.forgeAmbients ?? [])];
  objects.forEach((o, i) => {
    const path = forgeObjectPath(i);
    forgePlaces[path] = [o.at[0], o.at[1], o.at[2]];
    if (o.kind === 'ambient') forgeAmbients.push({ path, source: o.source, name: o.name, at: [o.at[0], o.at[1], o.at[2]], yaw: o.yaw, ...(o.script ? { script: o.script.steps } : {}) });
  });
  return { ...map, meta: { ...map.meta, forgePlaces, forgeAmbients } };
}

/**
 * The layout's ambient effects started on a page's effects (`../effects` `Effects.playAt`): each program at its own
 * placed node -- its root renamed to the object's path, so two copies of one program are two places -- turned by its
 * yaw. A program the effects lack (its map not lent) is skipped. Their handles, to stop them with the match.
 */
export function playForgeAmbients(effects: Pick<Effects, 'playAt' | 'playProgram'>, ambients: readonly ForgeAmbient[] | undefined): { stop(): void }[] {
  const out: { stop(): void }[] = [];
  for (const a of ambients ?? []) {
    const m = new Matrix4().makeRotationY(a.yaw).setPosition(a.at[0], a.at[1], a.at[2]);
    // An ambient's program (silent where its script stands in for its sounds). Its script is a self-starting program of
    // the map's (`./placedAccess` `withPlacedAccess`), run by the world as the map's own are.
    const h = effects.playAt(a.name, a.path, m, a.script ? { silent: true } : {});
    if (h) out.push(h);
  }
  return out;
}


/**
 * A script's emitters (`SoundEmitter`): each `~` sound it plays at its object (a step with no `at`), once, at the object's
 * place, at its command's volume -- the game's own rule for every self-starting program's `~` sounds (`@s2u/sound`
 * `zanimEmitters`: a loop at its node from the map's start, wherever in the program it stands).
 */
export function forgeScriptEmitters(path: string, at: readonly [number, number, number], steps: readonly ScriptStep[]): SoundEmitter[] {
  const out: SoundEmitter[] = [];
  for (const s of steps) {
    if (s.do !== 'sound' || s.at || !s.name.startsWith('~') || out.some((e) => e.sound === s.name)) continue;
    out.push({ anim: `${path}_script`, sound: s.name, node: path, position: [at[0], at[1], at[2]], ...(s.volume !== undefined && s.volume !== 1 ? { volume: s.volume } : {}) });
  }
  return out;
}

/**
 * An ambient program's own sounds as script steps (`ScriptStep`), `from` its map -- where they are the script's commands
 * alone: the sequence that sounds (or the several that only sound, the `~` loops' each), its `SOUND`, `WAIT`, `LOOP`,
 * `WHILE` / `END_WHILE` and `IF` / `ELSEIF` on one `RANDOM_WEIGHT`, `ELSE`, `ENDIF` one to one (a trailing
 * `PAUSE_ANIMATION`, the run kept alive, left out). What only draws among them (a call, a light) is left out and `whole`
 * false: the script's random picks are then its own, no longer its drawing's (Sujo's lightning and its thunder). Where it
 * sounds by more than these (a test of another kind, a sequence of its own that does more), only its `~` loops, played.
 */
export function scriptOfProgram(program: EffectProgram, from: string): { steps: ScriptStep[]; whole: boolean } {
  const sounding = program.sequences.filter((s) => s.ops.some((o) => o.op === 'sound'));
  const one = (o: EffectOp): ScriptStep | null => {
    switch (o.op) {
      case 'sound': return { do: 'sound', name: o.sound, from, ...(o.volume !== 1 ? { volume: o.volume } : {}) };
      case 'wait': return o.frames === null ? { do: 'wait', seconds: o.seconds, ...(o.range ? { random: o.range } : {}) } : null;
      case 'loop':
        return o.count !== null && o.count !== -1 ? { do: 'loop', times: o.count } : o.seconds !== null ? { do: 'loop', seconds: o.seconds } : { do: 'loop' };
      case 'while': return o.forever && !o.conditions ? { do: 'while' } : null;
      case 'endWhile': return { do: 'endWhile' };
      case 'if': case 'elseif': {
        const c = o.conditions;
        return c.length === 1 && c[0]!.kind === 'random' ? { do: o.op, chance: c[0]!.p } : null;
      }
      case 'else': return { do: 'else' };
      case 'endif': return { do: 'end' };
      default: return null;
    }
  };
  // What only draws (the program keeps running them, silent): left out of its sounds' script, the script then partial --
  // its random picks its own, no longer its drawing's.
  const DRAWS = new Set<EffectOp['op']>(['call', 'light', 'active', 'opacity', 'particles', 'motion', 'rotate', 'translate', 'fromTo', 'pauseAnimation']);
  let dropped = false;
  const translate = (ops: readonly EffectOp[]): ScriptStep[] | null => {
    const body = ops[ops.length - 1]?.op === 'pauseAnimation' ? ops.slice(0, -1) : ops;
    const out: ScriptStep[] = [];
    for (const o of body) {
      const st = one(o);
      if (st) { out.push(st); continue; }
      if (!DRAWS.has(o.op)) return null;
      dropped = true;
    }
    return out;
  };
  if (sounding.length === 1) {
    const got = translate(sounding[0]!.ops);
    if (got) return { steps: got, whole: !dropped };
  } else if (sounding.length > 1 && sounding.every((s) => s.ops.every((o) => o.op === 'sound' || o.op === 'pauseAnimation'))) {
    // Several that only sound, together from the start: one after another here is the same.
    return { steps: sounding.flatMap((s) => translate(s.ops) ?? []), whole: true };
  }
  const loops: ScriptStep[] = [];
  for (const s of program.sequences) for (const o of s.ops) {
    if (o.op === 'sound' && o.sound.startsWith('~') && !loops.some((l) => l.do === 'sound' && l.name === o.sound)) loops.push({ do: 'sound', name: o.sound, from, ...(o.volume !== 1 ? { volume: o.volume } : {}) });
  }
  return { steps: loops, whole: false };
}


