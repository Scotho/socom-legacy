import { Matrix4 } from 'three';
import type { EffectOp, EffectProgram } from '@s2u/scene';
import type { AudioStep, ForgeObject as LayoutObject } from '@s2u/creator-contracts';
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
 *   audio script (`audioProgram`: the game's own commands) in place of its program's.
 */
/** A Forge object's placed path: its place in `Layout.objects`, one-based. */
export const forgeObjectPath = (i: number): string => `forge/object_${i + 1}`;

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
    // An audio script's own (`forgeAudioEmitters`) in place of its program's.
    if (o.audio) { out.push(...forgeAudioEmitters(forgeObjectPath(i), o.at, o.audio)); return; }
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
    if (o.kind === 'ambient') forgeAmbients.push({ path, source: o.source, name: o.name, at: [o.at[0], o.at[1], o.at[2]], yaw: o.yaw, ...(o.audio ? { audio: o.audio } : {}) });
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
    // An ambient's program (silent where its audio script stands in for its sounds), then its audio script's.
    const h = effects.playAt(a.name, a.path, m, a.audio ? { silent: true } : {});
    if (h) out.push(h);
    if (a.audio?.length) out.push(effects.playProgram(audioProgram(a.path, a.audio), a.path, m));
  }
  return out;
}

/**
 * An ambient's audio script (`@s2u/creator-contracts` `AudioStep`) as the game's own program commands, one to one, rooted
 * at the object (`path`, node 1) -- `../effectRunner` runs it as it runs a disc map's: `play` a `SOUND` at the object at its
 * volume; `wait` a `WAIT` with its random range; `loop` a `LOOP` (its count, its seconds, or -1: for ever); `while` /
 * `endWhile` a `WHILE` (for ever) / `END_WHILE`; `if` / `elseif` an `IF` / `ELSEIF` on `RANDOM_WEIGHT`, `else`, `endif`.
 * Its `~` plays are its emitters (`forgeAudioEmitters`), as every ambient program's: an ambient run plays none itself.
 */
export function audioProgram(path: string, steps: readonly AudioStep[]): EffectProgram {
  const ops = steps.map((st): EffectOp => {
    switch (st.do) {
      case 'play': return { op: 'sound', sound: st.sound, node: 1, volume: st.volume ?? 1, newPlay: true };
      case 'wait': return { op: 'wait', seconds: st.seconds, range: st.random ?? 0, frames: null };
      case 'loop': return { op: 'loop', count: st.times ?? (st.seconds === undefined ? -1 : null), seconds: st.seconds ?? null };
      case 'while': return { op: 'while', forever: true };
      case 'endWhile': return { op: 'endWhile' };
      case 'if': case 'elseif': return { op: st.do, conditions: [{ kind: 'random', p: st.chance }] };
      case 'else': return { op: 'else' };
      default: return { op: 'endif' };
    }
  });
  return { name: `${path.replace(/\W/g, '_')}_audio`, root: 1, flags: 1, nodes: ['NA', path], sequences: [{ name: 'audio', activation: 1, ops }] };
}

/**
 * An ambient's audio script's emitters (`SoundEmitter`): each `~` sound it plays, once, at the object's place, at its
 * command's volume -- the game's own rule for every ambient program's `~` sounds (`@s2u/sound` `zanimEmitters`: a loop at
 * its node from the map's start, wherever in the program it stands).
 */
export function forgeAudioEmitters(path: string, at: readonly [number, number, number], steps: readonly AudioStep[]): SoundEmitter[] {
  const out: SoundEmitter[] = [];
  for (const s of steps) {
    if (s.do !== 'play' || !s.sound.startsWith('~') || out.some((e) => e.sound === s.sound)) continue;
    out.push({ anim: `${path}_audio`, sound: s.sound, node: path, position: [at[0], at[1], at[2]], ...(s.volume !== undefined && s.volume !== 1 ? { volume: s.volume } : {}) });
  }
  return out;
}

/**
 * An ambient program's own sounds as an audio script (`AudioStep`), `from` its map -- where they are the script's commands
 * alone: the sequence that sounds (or the several that only sound, the `~` loops' each), its `SOUND`, `WAIT`, `LOOP`,
 * `WHILE` / `END_WHILE` and `IF` / `ELSEIF` on one `RANDOM_WEIGHT`, `ELSE`, `ENDIF` one to one (a trailing
 * `PAUSE_ANIMATION`, the run kept alive, left out). What only draws among them (a call, a light) is left out and `whole`
 * false: the script's random picks are then its own, no longer its drawing's (Sujo's lightning and its thunder). Where it
 * sounds by more than these (a test of another kind, a sequence of its own that does more), only its `~` loops, played.
 */
export function audioOfProgram(program: EffectProgram, from: string): { steps: AudioStep[]; whole: boolean } {
  const sounding = program.sequences.filter((s) => s.ops.some((o) => o.op === 'sound'));
  const one = (o: EffectOp): AudioStep | null => {
    switch (o.op) {
      case 'sound': return { do: 'play', sound: o.sound, from, ...(o.volume !== 1 ? { volume: o.volume } : {}) };
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
      case 'endif': return { do: 'endif' };
      default: return null;
    }
  };
  // What only draws (the program keeps running them, silent): left out of its sounds' script, the script then partial --
  // its random picks its own, no longer its drawing's.
  const DRAWS = new Set<EffectOp['op']>(['call', 'light', 'active', 'opacity', 'particles', 'motion', 'rotate', 'translate', 'fromTo', 'pauseAnimation']);
  let dropped = false;
  const translate = (ops: readonly EffectOp[]): AudioStep[] | null => {
    const body = ops[ops.length - 1]?.op === 'pauseAnimation' ? ops.slice(0, -1) : ops;
    const out: AudioStep[] = [];
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
  const loops: AudioStep[] = [];
  for (const s of program.sequences) for (const o of s.ops) {
    if (o.op === 'sound' && o.sound.startsWith('~') && !loops.some((l) => l.do === 'play' && l.sound === o.sound)) loops.push({ do: 'play', sound: o.sound, from, ...(o.volume !== 1 ? { volume: o.volume } : {}) });
  }
  return { steps: loops, whole: false };
}

/** The sounds an audio script plays, by the map each is from (`from`; absent, `home`'s): what the match lends. */
export function audioScriptSounds(steps: readonly AudioStep[] | undefined, home: string): { from: string; names: string[] }[] {
  const by = new Map<string, Set<string>>();
  for (const s of steps ?? []) {
    if (s.do !== 'play') continue;
    const from = s.from ?? home;
    if (!by.has(from)) by.set(from, new Set());
    by.get(from)!.add(s.sound);
  }
  return [...by].map(([from, names]) => ({ from, names: [...names] }));
}
