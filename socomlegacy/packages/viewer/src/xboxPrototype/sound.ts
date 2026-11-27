import { Matrix4, Vector3 } from 'three';
import { SEAL_TUNING } from '@s2u/scene';
import { soundFor } from '@s2u/sound';
import type { GameAudio } from '../audio';
import type { FlyCamera } from '../camera';
import type { MatchSound } from '../matchSound';
import type { WalkMode } from '../walk';
import { WalkSounds } from '../walkSounds';
import type { FireEvent } from '../fireCore';
import { RoundAudioHost } from '../roundAudioHost';
import { workerRenderer, type OffThreadRenderer, type RenderWorker } from '../offThreadRender';

export type WalkingSound = Pick<MatchSound, 'audio' | 'frame' | 'playEvent' | 'remoteStep' | 'setData' | 'setLoops' | 'dispose' | 'sceneSound' | 'ladderSlide' | 'ladderLand'> & {
  readonly roundAudio: RoundAudioHost;
  fireEvent(event: FireEvent): void;
  roundFired(event: { weapon: { name: string }; from: [number, number, number] }): void;
  roundPast(from: [number, number, number], to: [number, number, number], actor: [number, number, number]): void;
  reloadSound(weapon: { name: string }, at: [number, number, number]): void;
  screen(on: boolean): void;
  animCallback(name: string, at: readonly [number, number, number] | null): void;
  /** An effect animation's sound (`../matchSound` `effect`: the one name table, a stand-in for a casing sound a map lacks). */
  effect(name: string, at: [number, number, number], volume: number): void;
};
/** The existing movement sound/listener adapter, without importing the production HUD/render graph.
 * Same WalkSounds, GameAudio and RoundAudioHost as matchSound. The screen edge uses
 * matchSound's existing OBF-7/OBF-31 gates; it changes no sound timing or gain.
 */
/**
 * OFF_THREAD_RENDER_ADAPTATION (`../offThreadRender`): the lightweight match's one-shots are rendered in a worker -- on
 * the console's page thread they took 2 to 8 ms of every frame in a firefight. Null where there is no `Worker` (the
 * tests) or it cannot start: the plays then render at their call, as on every other page.
 */
function renderWorker(): OffThreadRenderer | null {
  if (typeof Worker !== 'function') return null;
  try { return workerRenderer(new Worker(new URL('../soundRenderWorker.ts', import.meta.url), { type: 'module' }) as unknown as RenderWorker); } catch { return null; }
}

export function walkingSound(audio: GameAudio, walk: WalkMode, fly: FlyCamera, renderer: OffThreadRenderer | null = renderWorker()): WalkingSound {
  const sounds = new WalkSounds(audio, { walking: () => walk.mode() === 'walk', feet: () => walk.drawnFeet(),
    stance: () => walk.posture(), wish: () => fly.groundWish(), grid: () => walk.grid(), sceneGrid: () => walk.grid() ?? walk.gridOfGround() });
  audio.setFallTable(SEAL_TUNING.gravity, SEAL_TUNING.fallingDamage);
  const roundAudio = new RoundAudioHost(audio);
  if (renderer) audio.setOffThreadRenderer?.(renderer);
  let screen = false;
  const ear = new Matrix4(), eye = new Vector3(), at = new Vector3(), up = new Vector3(0, 1, 0);
  return {
    audio, roundAudio,
    screen(on) { if (on && !screen) roundAudio.reset(); screen = on; },
    sceneSound: (name, at, volume) => { if (!screen) audio.play(name, at, 'play', volume); }, // matchSound OBF-31
    animCallback: (name, at) => { if (!screen) audio.onAnimCallback(name, at); }, // MatchThrow's OBF-31 wrapper
    effect: (name, at, volume) => { if (!screen) audio.play(soundFor(name, n => audio.has(n)), at, 'play', volume); },
    ladderSlide: at => { audio.setLadderSlide(screen ? null : at); }, // matchSound OBF-7
    ladderLand: (speed, at) => { if (!screen) audio.onLand(speed, sounds.material(at), at); },
    fireEvent: event => { if (!screen) sounds.fireEvent(event); },
    roundFired: event => { if (!screen) audio.onFire(event.weapon.name, event.from); },
    roundPast: (from, to, actor) => { if (!screen) audio.onRoundPast(from, to, actor); },
    reloadSound: (weapon, at) => { if (!screen) audio.onReload(weapon.name, at); },
    playEvent: event => { if (!screen) sounds.playEvent(event); },
    remoteStep: (_id, step, feet) => { if (!screen) audio.onFootstep(sounds.material(feet), step.at, { stance: step.stance, stick: step.stick }); },
    frame(camera, game) {
      if (game) ear.lookAt(eye.fromArray(game.eye), at.fromArray(game.target), up).setPosition(eye);
      audio.setListener(game ? ear.elements : camera.matrixWorld.elements);
      sounds.frame(game ? [...game.eye] : [camera.position.x, camera.position.y, camera.position.z]);
      roundAudio.frame();
    },
    setData: data => { audio.setData(data); roundAudio.dataChanged(); }, setLoops: loops => audio.setLoops(loops),
    dispose() { if (renderer) { audio.setOffThreadRenderer?.(null); renderer.dispose(); } audio.setLadderSlide(null); roundAudio.reset(); audio.setData(null); },
  };
}
