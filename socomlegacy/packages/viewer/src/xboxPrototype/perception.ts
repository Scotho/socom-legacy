import { Vector3 } from 'three';
import type { FlyCamera } from '../camera';
import { crosshairPick, pickSurfaces } from '../net/hostageOrder';
import type { Team } from '../net/protocol';
import type { Play } from '../play';
import { enemyCount, Perception, perceptionLook, perceptionMagnification, seatWord, type PerceptionLook } from '../reticle';
import type { WalkMode } from '../walk';
import type { WalkingMap } from './runtimeAssets';
import type { prototypeTargets } from './targets';

/** The production MatchFirearm.perceive order for the experiment's player rigs:
 * reject/inactivate, count existing marks, then complete sight queries. Shared
 * Perception owns thresholds and timers; no visibility or raise tuning lives here.
 * Hostage rigs/game-type faction words are still owed by the match feature lane.
 */
export function prototypePerception(d: {
  map: WalkingMap; play: Play; walk: WalkMode; fly: FlyCamera; targets: ReturnType<typeof prototypeTargets>;
  ownId(): number; ownTeam(): Team | null; teams: ReadonlyMap<number, Team>; online(): boolean;
  zoom(): { state: number; target: number };
}) {
  const perception = new Perception(), lastFeet = new Map<number, [number, number, number]>();
  const eye = new Vector3(), forward = new Vector3();
  let enemies = 0;
  return {
    count: () => enemies,
    clear() { perception.clear(); lastFeet.clear(); enemies = 0; },
    identified: (id: number) => perception.identified(id),
    frame(dt: number) {
      const own = d.walk.feet(), head = d.online() && own && d.walk.fireAim() ? d.play.nodeWorld('head') : null;
      if (!own || !head) { enemies = 0; return; }
      if (!(dt > 0)) return;
      const known = new Set([...d.teams.keys()].filter(id => id !== d.ownId()));
      perception.keepOnly(known); for (const id of lastFeet.keys()) if (!known.has(id)) lastFeet.delete(id);
      const game = d.walk.gameCamera();
      if (game) { eye.fromArray(game.eye); forward.set(game.target[0] - game.eye[0], game.target[1] - game.eye[1], game.target[2] - game.eye[2]).normalize(); }
      else { eye.setFromMatrixPosition(d.fly.camera.matrixWorld); d.fly.camera.getWorldDirection(forward); }
      const grid = d.walk.grid(), zoom = d.zoom(), queries: [number, PerceptionLook][] = [];
      for (const id of known) {
        const alive = d.targets.alive(id), feet = d.targets.feet(id), target = alive && feet ? d.targets.node(id, 'neck') : null;
        if (!feet || !alive || !target) { perception.step(id, 'inactive', dt); lastFeet.delete(id); continue; }
        const previous = lastFeet.get(id); lastFeet.set(id, feet);
        let look = perceptionLook({ alive, distance: Math.hypot(feet[0] - own[0], feet[1] - own[1], feet[2] - own[2]),
          apex: [eye.x, eye.y, eye.z], forward: [forward.x, forward.y, forward.z], target,
          magnification: perceptionMagnification(zoom.state, zoom.target), mid: d.map.camera?.mid ?? null,
          speedSquared: previous ? ((feet[0] - previous[0]) ** 2 + (feet[2] - previous[2]) ** 2) / (dt * dt) : 0, seen: true });
        if (look === 'seen' && grid) {
          const distance = Math.hypot(target[0] - head[0], target[1] - head[1], target[2] - head[2]);
          if (crosshairPick([{ id, distance }], pickSurfaces(grid, head, target, d.map.defaultMaterial ?? '')).picked !== id) look = 'unseen';
        }
        if (look === 'seen' || look === 'unseen') queries.push([id, look]); else perception.step(id, look, dt);
      }
      const team = d.ownTeam();
      enemies = team === null ? 0 : enemyCount(perception, seatWord(team), id => {
        const other = d.teams.get(id); return other ? seatWord(other) : null;
      }, id => d.targets.alive(id));
      for (const [id, look] of queries) perception.step(id, look, dt);
    },
  };
}
