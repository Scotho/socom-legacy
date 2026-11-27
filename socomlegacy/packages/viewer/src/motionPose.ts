import type { TraversalPose } from './animator';
import { oneShotSeconds } from './locomotion';
import type { PlayClips } from './play';

/**
 * A clip's key at `seconds` into it, reaching its last key at `run(playback, keys)` seconds and held there: its
 * `motion.rdr` playback (the clip's own seconds; keys / 30 without the entry). Null with the clip not loaded.
 */
function keyAt(clip: string, seconds: number, clips: PlayClips | null, run: (playback: number, keys: number) => number): TraversalPose | null {
  const c = clips?.clips.find((k) => k.name === clip);
  if (!c) return null;
  const entry = clips?.table?.find(([name]) => name === clip)?.[1];
  const playback = entry?.playback ?? c.frameCount / 30;
  const frame = Math.min(c.frameCount - 1, (seconds / run(playback, c.frameCount)) * (c.frameCount - 1));
  return { clip, frame, loop: false, rootY: null };
}

/**
 * A death clip at `seconds` into it, as the animator's one-node play (the traversal seam, `./animator`), held on the
 * last key once played. D20 (PAR-23, research 230 section 5.2 item 3): the original pushes the death as an ordinary
 * one-shot (`FUN_005a2490` D:L459804, `FUN_00588bc0(.., 8, 0, 0xd)`), whose play stops at phase (n - 1) / n
 * (`FUN_0028cc10` D:L134482-134495), runs at `dt / (T x (n - 1) / n)` (`FUN_0028c4f0` D:L134236-134275, `FUN_0028ada0`
 * D:L133349-133366) and samples key `phase x n` (`FUN_0028d670` D:L134881-134901): the last key n - 1 at
 * `T x ((n - 1) / n)^2` (`oneShotSeconds`).
 */
export function deathPose(clip: string, seconds: number, clips: PlayClips | null): TraversalPose | null {
  return keyAt(clip, seconds, clips, oneShotSeconds);
}

/**
 * A flinch at `seconds` into it (`flinch`): its key on the death's one-shot clock, or null once at its last key,
 * `T x ((n - 1) / n)^2` (`oneShotSeconds`) -- the body back to its own play -- or with the clip not loaded. PAR-58
 * (research 230 section 5.2 item 3): the flinch is pushed as the death is (`FUN_005a2690` D:L460019 / D:L460042,
 * `FUN_00588bc0(.., 0, 0xd)`), its play's flags 0x4 and 0x2 set after (D:L460021-460024) being none `FUN_0028c4f0`
 * reads (0x8, 0x40); and it pops there: the ground driver's end test (`FUN_00550ef0` D:L418193 -> `FUN_00582540`
 * D:L442925 -> `FUN_0028c6e0` D:L134283-134302, past the stop `(n - 1) / n` by half a tick's step) answers 1 for it
 * (D:L443131-443132: no flinch action is one of its cases, and no callback is set on it) and `FUN_005870e0` pops it
 * (D:L418203), the reload's refusal (0x4) going with it (`Room.flinch`'s window, PTW.R3). The stick's cut before it
 * (D:L418180-418185 with `FUN_00587c20`; PAR-60, research 230 section 5.2.1) ends the victim's own (`room.ts`
 * `flinchCut`, `./walk` `setFlinchPose`); another's body here is cut the same way by the victim's replicated stick
 * (`stepFlinch`; LATER 404, research 230 section 5.2.12: FLINCH_CUT_REMOTE_READING read), else plays to this end. The
 * legs' blend is FLINCH_LAYER_PLACEHOLDER's, a capture's.
 */
export function flinchPose(clip: string, seconds: number, clips: PlayClips | null): TraversalPose | null {
  const c = clips?.clips.find((k) => k.name === clip);
  if (!c) return null;
  const playback = clips?.table?.find(([name]) => name === clip)?.[1]?.playback ?? c.frameCount / 30;
  return seconds < oneShotSeconds(playback, c.frameCount) ? keyAt(clip, seconds, clips, oneShotSeconds) : null;
}

