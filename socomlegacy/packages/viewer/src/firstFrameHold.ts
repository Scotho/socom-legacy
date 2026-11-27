/**
 * XBOX-WARM (product track, a renderer warm-up; a browser adaptation with no original -- the PS2 has no shader compile):
 * behind the loading screen, the match's world is drawn only once nothing waits in the renderer's compile queue
 * (`./compileQueue` `busy`: every ordinary `prepare` job -- the bodies, and the shadow's, the throwables' and any
 * promoted glow jobs with them (review F2): the hold may outlast what the bodies alone need). Only after the match's
 * attach: stage 1, and the scene's own warm (`ViewerRenderer.warm`) before it, are drawn as before.
 *
 * Why: a late joiner's bodies are handed to `ViewerRenderer.prepare` at their spawn (FLASH-GLOW-BODIES), but the queue
 * links a few at a time, and the mount draws the next frame at once: every body the queue has not reached is linked by
 * that draw, synchronously, behind every link already in flight. On Shadow PC 3 (RTX A4500, ANGLE D3D11, the Xbox
 * preset; 2026-11-18, `xboxFirstPlay.spec.ts`) the first frame after the warm ran 3754 ms, 3487 ms of it in 12
 * LINK_STATUS waits for 14 programs, 15 of the 20 linked after the warm the bodies' skinned + fog draws. Held, the same
 * programs are linked by the queue off the draw. On PC 3 with the hold (9b6aba0129): the sync waits after the warm
 * 3661 -> 427 ms, mounted -> first-frame 3874 -> 2260 ms -- but a 2386 ms frame with no draw stays before the first
 * frame: the compile time MOVED behind the loading screen, not removed (the screen most likely frozen with it: an
 * inference). It does not fix a GPU stall long enough to lose a context.
 *
 * What changes: only whether a frame before the first world frame calls the world's render. The scene, its materials and
 * the programs drawn are untouched (the A/B's `programSet`). The loading screen is up until the first world frame
 * (BLACK-GAP, `./loadingHold`), so a held frame shows nothing different; the first frame comes when the compiles are in
 * rather than after a frame that waited for them. Never after the first frame: a mid-match joiner draws as before.
 *
 * A strong-GPU stall at match start consistent with the console's early losses (research 396 s8, group A of the
 * 0.4.23-0.4.25 rows), not proven as their cause; that proof is the field beacons after release.
 */
import { FIRST_FRAME_FALLBACK_MS } from './loadingHold';

export const FIRST_FRAME_COMPILE_HOLD_ADAPTATION = 'the first world frame held until the compiles already asked for are in' as const;

/**
 * The longest one hold lasts, ms from its own first held frame (an idle queue between holds starts the next afresh):
 * half the loading screen's own fallback. The fallback counts from `mounted`, so a hold that starts late can outlast it
 * (review F4); held at mount, as the late join is, it lets go first. Not a measured number: a bound for a compile
 * that never settles (a context lost during it leaves three's completion poll unended, `./lobbyMatch`).
 */
export const FIRST_FRAME_COMPILE_HOLD_MAX_MS = FIRST_FRAME_FALLBACK_MS / 2;

/** What the frame loop tells the hold each frame. */
export interface FirstFrameHoldState {
  /** The match's first world frame is drawn (the loading screen let go). */
  firstDrawn: boolean;
  /** The renderer's ordinary compile jobs waiting or in flight (`CompileQueue.busy`; 0 when it has none). */
  compilesBusy: number;
}

export interface FirstFrameHold {
  /** Whether this frame draws the world: false only before the first frame, while held, within the bound. */
  drawWorld(now: number, state: FirstFrameHoldState): boolean;
}

export function firstFrameHold(maxMs = FIRST_FRAME_COMPILE_HOLD_MAX_MS): FirstFrameHold {
  let since: number | null = null;
  let expired = false;
  return {
    drawWorld(now, state) {
      if (state.firstDrawn || expired) return true;
      if (state.compilesBusy <= 0) { since = null; return true; }   // review F3: each hold counts from its own start
      since ??= now;
      if (now - since >= maxMs) { expired = true; return true; }
      return false;
    },
  };
}
