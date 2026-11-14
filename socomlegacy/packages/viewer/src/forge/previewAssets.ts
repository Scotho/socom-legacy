import { BoxGeometry, Group, Matrix4, Mesh, MeshBasicMaterial, PerspectiveCamera, type Camera } from 'three';
import type { SourceRequest } from '../discSource';
import type { EffectData } from '../effectData';
import { Effects } from '../effects';
import { GameAudio, WebAudioOut } from '../audio';
import type { SoundData } from '../soundData';
import type { RenderedSound } from '@s2u/sound';
import type { ViewerRequest, ViewerResponse } from '../worker';

/**
 * The asset browser's previews of an ambient effect (the owner, 2026-11-10: "For audio allow me to play them in the
 * asset browser, I would like preview them. and do the same for particle effects"; a browser adaptation, FG.R2):
 *
 * - its **particles**, run by an `Effects` of its own over its map's effect data (`ambientPreview`): the program at the
 *   preview's origin (`Effects.playAt`), stepped as the preview draws it, and stepped ahead before a thumbnail is taken;
 * - its **sounds**, played by a `GameAudio` of its own over its map's sound data (`playAmbientSounds`): each sound the
 *   program plays, once, on the listener -- stopped by the returned handle (a loop plays until then).
 *
 * Each map's data is read once by a viewer worker kept for the page's life (`../worker`: the match's own requests), and
 * kept; the editor's own drawing and audio are not touched.
 */
let worker: Worker | null = null;
let ids = 0;
const waiting = new Map<number, (r: ViewerResponse | null) => void>();
const soundsOf = new Map<number, SoundData>();
const effectData = new Map<string, Promise<EffectData | null>>();
const soundData = new Map<string, Promise<{ data: SoundData; loops: { name: string; sound: unknown }[] } | null>>();

const ask = (make: (id: number) => ViewerRequest): Promise<ViewerResponse | null> => new Promise((resolve) => {
  if (!worker) {
    worker = new Worker(new URL('../worker.ts', import.meta.url), { type: 'module' });
    worker.addEventListener('message', (e: MessageEvent<ViewerResponse>) => {
      const m = e.data;
      if (m.kind === 'progress' || m.kind === 'loading') return;
      if (m.kind === 'sound') { soundsOf.set(m.id, m.data); return; }
      const done = waiting.get(m.id);
      if (done) { waiting.delete(m.id); done(m.kind === 'error' ? null : m); }
    });
  }
  const id = ++ids;
  waiting.set(id, resolve);
  worker.postMessage(make(id));
});

/** Map `stem`'s effect data (its own sets and the common one), read once. */
export function previewEffects(source: SourceRequest, stem: string): Promise<EffectData | null> {
  let p = effectData.get(stem);
  if (!p) {
    p = ask((id) => ({ kind: 'effects', id, source, path: `RUN/${stem}.ZDB`, archive: stem })).then((r) => (r?.kind === 'effects' ? r.data : null), () => null);
    effectData.set(stem, p);
  }
  return p;
}

/** Map `stem`'s sound data and its rendered loops, read once. */
export function previewSounds(source: SourceRequest, stem: string): Promise<{ data: SoundData; loops: { name: string; sound: unknown }[] } | null> {
  let p = soundData.get(stem);
  if (!p) {
    p = ask((id) => ({ kind: 'sound', id, source, path: `RUN/${stem}.ZDB`, archive: stem })).then((r) => {
      if (r?.kind !== 'soundLoops') return null;
      const data = soundsOf.get(r.id);
      soundsOf.delete(r.id);
      return data ? { data, loops: r.loops } : null;
    }, () => null);
    soundData.set(stem, p);
  }
  return p;
}

/** The preview's own frame: 60 units across, so the preview frames the effect's place whatever its particles do. */
const PREVIEW_EXTENT = 60;
/** The seconds a thumbnail's effect is stepped ahead before it is taken (`ambientPreview`'s `settle`): its particles out. */
const PREVIEW_SETTLE_SECONDS = 2;
/** An effect still running after this long in its dry run (`ambientPreview`) runs for ever: no length, no replay. */
const PREVIEW_ENDLESS_SECONDS = 20;
/** The dry run's step (seconds). */
const PREVIEW_DRY_STEP = 0.1;

/**
 * An ambient effect's particles as a preview object: its map's effect data on an `Effects` of its own (the map's own
 * ambient effects left out), the program at the origin, stepped each time the preview draws it (a hook on an unseen
 * part), the preview framed on a box of `PREVIEW_EXTENT`. `settle` steps it ahead first (a thumbnail's still). Null
 * where the map's effects will not read or hold no such program.
 */
export async function ambientPreview(source: SourceRequest, stem: string, program: string, settle = false,
  loop: () => boolean = () => false): Promise<{ object: Group; dispose(): void; progress(): number | null } | null> {
  const data = await previewEffects(source, stem);
  if (!data) return null;
  const effects = new Effects(Math.random, () => {});
  effects.setData({ ...data, ambient: [] });
  // Its length (the owner, 2026-11-14: "a progress bar for effects and make them loop"; a browser adaptation, FG.R2):
  // a dry run stepped to its end -- its run done and its last particle gone -- before the shown one starts; one still
  // going at `PREVIEW_ENDLESS_SECONDS` runs for ever (a fire, a steam: no bar, no replay).
  const done = (): boolean => { const st = effects.stats(); return st.runs === 0 && st.particles === 0 && st.shells === 0; };
  const dryCam = new PerspectiveCamera(50, 4 / 3, 1, 4000);
  dryCam.position.set(0, PREVIEW_EXTENT * 0.6, PREVIEW_EXTENT * 1.6);
  dryCam.lookAt(0, PREVIEW_EXTENT / 3, 0);
  dryCam.updateMatrixWorld();
  if (!effects.playAt(program, 'forge_preview', new Matrix4())) { effects.setData(null); return null; }
  let length: number | null = null;
  for (let t = 0; t < PREVIEW_ENDLESS_SECONDS; t += PREVIEW_DRY_STEP) {
    effects.update(PREVIEW_DRY_STEP, dryCam);
    if (done()) { length = Math.max(PREVIEW_DRY_STEP, t + PREVIEW_DRY_STEP); break; }
  }
  effects.reset();
  if (!effects.playAt(program, 'forge_preview', new Matrix4())) { effects.setData(null); return null; }
  let elapsed = 0, ended = false;
  const group = new Group();
  group.name = `ambient preview ${program}`;
  group.add(effects.object);
  // The frame: an unseen box the preview's bounds read; the step: a part drawn (fully transparent) whose draw steps it.
  const frameGeom = new BoxGeometry(PREVIEW_EXTENT, PREVIEW_EXTENT, PREVIEW_EXTENT);
  const frameMat = new MeshBasicMaterial({ visible: false });
  const frame = new Mesh(frameGeom, frameMat);
  frame.position.y = PREVIEW_EXTENT / 2;
  frame.userData['forgePreviewFrame'] = true;                  // the preview frames on it (`../assetPreview` `drawnBounds`)
  // Drawn as itself, never a copy (`../assetPreview` `privateView`): a copy's particles would stand still -- its own
  // buffers, and no `onBeforeRender` to step them (the owner, 2026-11-11: "animate the particle effects in the browser").
  group.userData['forgeLivePreview'] = true;
  const tickGeom = new BoxGeometry(0.01, 0.01, 0.01);
  const tickMat = new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const tick = new Mesh(tickGeom, tickMat);
  let last = performance.now();
  tick.onBeforeRender = (_r, _s, camera: Camera) => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    effects.update(dt, camera);
    last = now;
    if (ended || length === null) return;
    elapsed += dt;
    // Its end: played again while looping is on (`loop`), else left done.
    if (elapsed >= length && done()) {
      if (loop()) { elapsed = 0; effects.playAt(program, 'forge_preview', new Matrix4()); } else ended = true;
    }
  };
  group.add(frame, tick);
  if (settle) {
    const cam = new PerspectiveCamera(50, 4 / 3, 1, 4000);
    cam.position.set(0, PREVIEW_EXTENT * 0.6, PREVIEW_EXTENT * 1.6);
    cam.lookAt(0, PREVIEW_EXTENT / 3, 0);
    cam.updateMatrixWorld();
    for (let t = 0; t < PREVIEW_SETTLE_SECONDS; t += 0.05) effects.update(0.05, cam);
    elapsed = PREVIEW_SETTLE_SECONDS;
    last = performance.now();
  }
  return {
    object: group,
    dispose: () => { effects.setData(null); group.removeFromParent(); frameGeom.dispose(); frameMat.dispose(); tickGeom.dispose(); tickMat.dispose(); },
    /** Where it stands in its length, 0 to 1 (1 once done and not looping); null for one that runs for ever. */
    progress: () => (length === null ? null : ended ? 1 : Math.min(1, elapsed / length)),
  };
}

/**
 * An ambient effect's sounds played (`names`, each the program's `SOUND`), once each on the listener, over map `stem`'s
 * sound data on an audio of its own; the handle stops them and lets that audio go. False-y `played`: none would play.
 */
/**
 * Where a preview's sounds stand (the owner, 2026-11-11: "a little slider ... of the sound timeline"): through its longest
 * sound, 0 to 1; a looping one's runs round again. Null when nothing plays.
 */
export interface SoundTimeline { fraction: number; loops: boolean }

/** The preview's audio out, its sounds' lengths noted as they start (each one's samples over its rate, seconds). */
class TimedAudioOut extends WebAudioOut {
  longest = 0;
  loops = false;
  startedAt = 0;
  private note(sound: RenderedSound, loop: boolean): void {
    const seconds = sound.sampleRate > 0 ? sound.left.length / sound.sampleRate : 0;
    if (seconds > this.longest) this.longest = seconds;
    if (loop) this.loops = true;
    if (!this.startedAt) this.startedAt = performance.now();
  }
  override play(sound: RenderedSound, group?: number): { stop(): void } | void {
    this.note(sound, false);
    return super.play(sound, group);
  }
  override loop(sound: RenderedSound, group?: number): ReturnType<WebAudioOut['loop']> {
    this.note(sound, true);
    return super.loop(sound, group);
  }
}

/**
 * How a preview's sounds play (the owner, 2026-11-11: "add a setting for looping sounds"; a browser adaptation, FG.R2):
 * `loop`, round again and again -- a one-shot played anew at its end, a looping one left to loop -- until stopped; off,
 * once -- a looping one stopped after one pass. `onEnd`: told when a single play has run out (not on `stop`).
 */
export interface AmbientPlayOptions {
  loop?: boolean;
  onEnd?(): void;
  /**
   * The preview's volume, 0 to 1 (the owner, 2026-11-14: "a slider to control the sound preview volume"; a browser
   * adaptation, FG.R2): a share of the viewer's own listening gain (`LISTENING_GAIN_PLACEHOLDER`); the game's mix untouched.
   */
  volume?: number;
}

/**
 * A preview's mix volume at the slider's `volume` (0 to 1): squared, so the slider's travel sounds even (a linear gain's
 * top half is barely heard). Given to `GameAudio.setVolume` -- its own gain, set at its making, would undo a gain laid
 * on the output before it.
 */
const previewVolume = (volume: number): number => { const v = Math.max(0, Math.min(1, volume)); return v * v; };

export async function playAmbientSounds(source: SourceRequest, stem: string, names: readonly string[], options: AmbientPlayOptions = {}): Promise<{ played: number; stop(): void; timeline(): SoundTimeline | null; setVolume(volume: number): void }> {
  const got = await previewSounds(source, stem);
  if (!got) return { played: 0, stop: () => {}, timeline: () => null, setVolume: () => {} };
  const out = new TimedAudioOut();
  const game = new GameAudio(out, undefined, { inline: false });
  game.setVolume(previewVolume(options.volume ?? 1));
  game.setData(got.data);
  game.setLoops(got.loops as never);
  out.unlock();                                              // a click is the gesture the browser asks for
  let played = 0;
  for (const n of names) if (game.play(n, null)) played++;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    if (timer !== null) { clearTimeout(timer); timer = null; }
    try { game.setData(null); } finally { out.dispose(); }
  };
  // At the end of each pass (its longest sound's length): again, or done.
  const pass = (): void => {
    if (stopped || out.longest <= 0) return;
    timer = setTimeout(() => {
      timer = null;
      if (stopped) return;
      if (options.loop) {
        if (!out.loops) { out.startedAt = performance.now(); for (const n of names) game.play(n, null); }
        pass();
      } else { stop(); options.onEnd?.(); }
    }, out.longest * 1000);
  };
  if (played) pass();
  const timeline = (): SoundTimeline | null => {
    if (stopped || !played || out.longest <= 0 || !out.startedAt) return null;
    const t = (performance.now() - out.startedAt) / 1000 / out.longest;
    // A loop's runs round; a one-shot's holds at its end.
    return { fraction: out.loops ? t % 1 : Math.min(1, t), loops: out.loops };
  };
  // Its volume moved while it sounds (the slider dragged).
  const setVolume = (volume: number): void => { if (!stopped) game.setVolume(previewVolume(volume)); };
  return { played, timeline, stop, setVolume };
}