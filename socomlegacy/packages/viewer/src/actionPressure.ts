import { GAME_FRAME_DT, GameFrameAccumulator } from '@s2u/scene';
import { chaseActionPress } from './doors';

/** LATER 362 (research 92 section 6): unchanged TraversalPage pressure chase.
 * FUN_00594cf0 D:L453194-453203 chases before Action (D:L453218-453243).
 * LATER 362b review F2: count game frames from the press; the release frame
 * takes one falling step before its context fires, irrespective of page rate.
 */
export class ActionPressure {
  private press = 0;
  private down = false;
  private frames = new GameFrameAccumulator();
  step(down: boolean, dt: number): void {
    if (down !== this.down) {
      this.down = down;
      this.frames = new GameFrameAccumulator();
      if (!down) { this.press = chaseActionPress(this.press, false, GAME_FRAME_DT); return; }
    }
    const n = this.frames.advance(dt);
    for (let k = 0; k < n; k++) this.press = chaseActionPress(this.press, down, GAME_FRAME_DT);
  }
  value(): number { return this.press; }
}
