import { itemClass } from '@s2u/scene';
import { ACTION_CLIPS, ACTION_FAMILY, ACTION_SECONDS, type PlaySnapshot } from './mover';
import { stepRootTilt, tiltTopOfSnapshot, tiltWindowOf, type RootTiltState } from './rootTilt';
import { flinchRefused, pushPopped, type FlinchGateBody } from './net/deaths';
import { FLINCH_CUT_COMMANDS, noInterruptCommands } from './net/flinchReload';
import { TICK_HZ } from './net/protocol';
import { reloadCut, type PlayClips } from './play';
import type { TraversalPose } from './animator';
import { flinchPose } from './motionPose';

/** No item (EMPTY_ITEM), the same wire sentinel as RemotePlayers. */
const NO_ITEM = 255;

/**
 * PAR-84 (research 230 section 5.2.10, build step 7), NU-6 R1 (research 324 §4, §6 R1; the gameplay controller's ruling
 * of 2026-10-14 after the review): the action another page draws a body by -- every action the room's body carries, the
 * launcher's raise and still lower (`rifleToLauncher`, `pistolToLauncher`) among them. The original sends no Push
 * Blend for the two (`LAUNCHER_RAISE_NETWORK_LOG_READING` false: no `network_log` on their rows, `FUN_002bbaf0`
 * D:L160789-160790), but each copy plays them itself from the character message's item: the field selects the
 * launcher's slot (D:L162369-162373 -> `FUN_005c8a20` D:L481436 -> `FUN_005c50b0` class 4, D:L478996-478998), the copy's
 * own raise tick runs the selector (`FUN_005c1660` D:L476734 -> `FUN_005a64c0` -> `FUN_005a6d30` D:L461886), which
 * installs the set and pushes the raise (D:L462105, D:L462113, D:L462116) without sending it on (`FUN_00588bc0` sends
 * only for an actor whose `IsRemote` answers 0, D:L446408-446414); the lower the same way back (`FUN_005a6b70`
 * D:L461875). So the room's mover action stands in for the copy's own clip, as the swap's already does (research 324
 * §1.3). Was (PAR-84, until NU-6 R1): "another console draws its copy's own ground, so another page drops the two and
 * plays the body's ground as the room sends it (idle under the clip). Every other action is kept."
 *
 * NU-5 X1 (research 323 §1.5; research 324 §1.4, §6 P2): but the exchange's `Swap rifle` (`swapRifleExchange`) is
 * dropped -- the taker's own console alone pushes it (`FUN_00588bc0` D:L458209-458211; a copy with a model on the node
 * takes the other branch, D:L458217-458235) and it is sent to no other: SOLDIER's `Swap rifle` row carries no
 * `network_log` (`FUN_002bbaf0` D:L160789-160790; read over the tracked `READERC.ZAR`, `roomPickups.test.ts`;
 * `PICKUP_CLIP_NETWORK_LOG_READING`, research 324 §7). The
 * launcher claim's (`swapRifleClaim`) is kept: every console pushes it itself (D:L458199-458206).
 */
export function remoteBodyAction(action: PlaySnapshot['action']): PlaySnapshot['action'] {
  return action?.name === 'swapRifleExchange' ? null : action;
}

/**
 * REMOTE_LAUNCHER_HAND_READING (NU-6 P3 with R1; research 324 §1.6, §4, §6 P3): a rocket launcher is drawn in another
 * body's hand while the body's item is a launcher's (the room's `p.held`, the slot left 0 or 1) and on through the still
 * lower's clip to its end: the raise re-parents the launcher node to the hand at its push (`FUN_005a6d30`
 * D:L462120-462126), the lower re-parents nothing (`FUN_005a6b70` D:L462045-462092), and the driver's end test puts it
 * back under `spinehi` at the gear's offset at the reversed clip's end (`FUN_00582540` D:L443057-443071 ->
 * `FUN_005a60d0(.., firearm, 4)` D:L461769-461820; `REMOTE_LAUNCHER_MOUNT_READING`). In the hand it hangs on the hand's
 * held node at its origin, as the page's own raised launcher does (`./rocket` `draw`; the launcher clips' own `launcher`
 * track is not played: `HOLSTER_TRACK_READING`), and the firearm is stowed meanwhile, as the page's own is
 * (`Play.setRifleStowed`, `./matchThrow` `stowRifle`). Its model is the item's own. [reading: the decompilation's path,
 * not measured running. The stick's moving lower (PAR-83, `room.ts` `launcherStick`) rides no body action, so another
 * page puts the launcher back at the item's change; that clip's own end mount is not read. The original's item field carries
 * a raised launcher's loaded round, else the launcher (`REMOTE_LAUNCHER_ITEM_READING`, research 324 §1.6, note only):
 * either way the copy raises it. Capture NU6-4 settles both]
 */
export const REMOTE_LAUNCHER_HAND_READING = 'the item, and through the still lower' as const;

/**
 * NU-6 P3 (`REMOTE_LAUNCHER_HAND_READING`): the rocket launcher in a body's hand -- the item's id when the item is of the
 * rocket launcher class (`@s2u/scene` `itemClass`), the one already in the hand (`inHand`) while the still lower's clip
 * (a launcher action reversed) plays, else null.
 */
export function remoteLauncherInHand(item: number, action: PlaySnapshot['action'], inHand: number | null): number | null {
  if (item !== NO_ITEM && itemClass(item) === 'rocketLauncher') return item;
  const lowering = action !== null && action.reversed && (action.name === 'rifleToLauncher' || action.name === 'pistolToLauncher');
  return lowering ? inHand : null;
}

/**
 * NU-6 P2 (research 324 §1.1, §1.6): the kit's first rocket launcher, the one the body's `launcher` node carries --
 * `FUN_005c6a40` / `FUN_005c6da0` take the first slot whose item is of the rocket launcher class (`FUN_003d1cb0`, class
 * 0x91, D:L479823; `@s2u/scene` `itemClass`, `FUN_003d1a60`'s ranges) and set the node's model to that slot's instance
 * (D:L479872-479876) -- or null for a kit with none (no side read).
 */
export function firstLauncher(kit: readonly number[] | null): number | null {
  for (const id of kit ?? []) if (itemClass(id) === 'rocketLauncher') return id;
  return null;
}

/**
 * REMOTE_RESPAWN_REBUILD_READING (NU-12 B2; research 328 §1.1, §6): another console rebuilds a copy at its owner's
 * respawn mid-match, as at the round's reload (`FUN_00223680` D:L75920-75931 over every actor, a copy's kit taken at
 * D:L455072-455081): the player record's state field (`FUN_002be150` D:L162349-162350) reaches `FUN_00544210`
 * (D:L410551-410563), which sets `+0xfcf` on a dead (2 or 3) to alive (1) change when the controller's `+0x34` answers
 * true; the actor's update (`FUN_00547350` D:L412722-412726) then runs `FUN_00598b90(copy, 1)` -- the rebuild
 * (`FUN_00599b60` D:L455158), whose first play is `Stand` with no blend (research 328 §1.3). So the page rebuilds the
 * copy's animation (`Play.respawn`) at its seat's `spawn` and, where no spawn is counted, at a dead-to-alive change.
 * [reading: one inference -- `+0x34` as the copy's controller's, and `FUN_00547350` as the actor's per-frame update
 * reached through the vtable; settled by `+0x34` read, or capture NU12-2] Was (research 328 before its review's F2): "the
 * respawn's network path is not read; built as the round's until read".
 */
export const REMOTE_RESPAWN_REBUILD_READING = 'rebuilt' as const;

/**
 * PRONE-TILT-2 (5) (research 217 s7.10; reading, pending review): whether a hostage's root runs the tilt on the page. Its
 * body is the SEAL's actor (`CSealEx`, the one vtable holding `FUN_005506a0`), so `FUN_00548090` runs for it; every clip of
 * its No_weapon set (`civ_*`) has no `Normalize`, so it writes only while a knock's `GLOBAL` clip owns the body (a
 * reaction or a get-up: `Land forward` / `Land backwards` (0.5, 0.9), `Prone cover` bare), as the room's `HostageFollow`
 * walker does while `thrown`. Otherwise the hostage lies level.
 */
export function escorteeTilts(snap: { action: { name: string } | null }): boolean {
  const f = snap.action ? ACTION_FAMILY[snap.action.name as keyof typeof ACTION_FAMILY] : undefined;
  return f === 'reaction' || f === 'getUp';
}

/** `HOSTAGE_PRONE_TILT_READING`'s alternatives. */
export type HostageProneTilt = 'unprone' | 'ai-stance';

/**
 * PRONE-TILT-2 review F1 (research 217 s7.10; reading, pending review): whether a knocked hostage's tilt takes the prone
 * ease (0.2 a game frame, `FUN_00548090` D:L413265-413272, posture word 2). `'unprone'`: no -- page and room alike (the room's
 * `HostageFollow` walker is never prone). The knock pops the body's stack to its base (`FUN_0058a4d0`, D:L442089) and
 * `FUN_005807d0` pushes the fall, for a living body, at posture word 0 when its controller is not remote (vtable +0x34,
 * `CRemoteCtrl::IsRemote`, research 193 s9, false), else at the caller's word (D:L442094-442102); the hostage's
 * No_weapon set has no prone motion (research 189 #13), so its get-down is no prone play. [reading: that the hostage's AI
 * controller answers `IsRemote` false where the room runs it (the 0 branch), and that `+0x174` follows the stack's top
 * word (research 92's inference), are not read.] `'ai-stance'`: the AI's stance (`extraction.ts`'s
 * `ai.stance`) as the posture, the ease when it is prone -- not built for the room. Settled by a PCSX2 read of a
 * get-down hostage's `+0x174` and root quaternion through a blast on a slope.
 */
export const HOSTAGE_PRONE_TILT_READING = 'unprone' as HostageProneTilt;

/**
 * PRONE-TILT (research 217 s7): one call of the rule for a body the page draws off the wire -- its top play from the
 * snapshot (`tiltTopOfSnapshot`, the action's length from `ACTION_SECONDS`: PRONE-TILT-2 (4)), the floor normal asked
 * only on a writing tick (`normal`). `hostage`: an escortee's body (`escorteeTilts`).
 */
export function remoteTiltStep(state: RootTiltState, snap: Pick<PlaySnapshot, 'stance' | 'action' | 'hold' | 'traversal' | 'yaw' | 'airborne'>,
  normal: () => readonly number[], hostage = false): RootTiltState {
  const top = tiltTopOfSnapshot(snap, (a) => (ACTION_CLIPS as Readonly<Record<string, { frames: number }>>)[a]?.frames ?? 1,
    (a) => (ACTION_SECONDS as Readonly<Record<string, number>>)[a] ?? 0);
  return stepRootTilt(state, {
    normal, yaw: snap.yaw, span: tiltWindowOf(top.clip), phase: top.phase,
    prone: snap.stance === 'prone' && !top.diving && !(hostage && HOSTAGE_PRONE_TILT_READING === 'unprone'),
    proneTransition: top.proneTransition, diving: top.diving, airborne: snap.airborne,
  });
}

/**
 * LATER 512's re-look: the landings that play a clip (`Walker`'s landing `clip`: `FUN_005af590`), each an action on the
 * snapshot with its serial -- a new one pops the stack to its base (`FUN_0058a5e0` D:L466897). The knock's landings
 * (`landDeath`, `landBackwards`) are `pushPopped`'s already.
 */
export const LANDING_CLIP_ACTIONS: ReadonlySet<string> = new Set(['land', 'landHard', 'hit', 'hitStomach']);

/**
 * One frame of a body's flinch (`RemotePlayers.frame`): a dead body's is dropped (its death clip is its play); else the
 * flinch runs `dt` on and, unless `FUN_005a2690` would refuse it now (`./net/deaths` `flinchRefused`,
 * FLINCH_GATE_READING: a ladder or a hang, a knock fall, a swap, the long hits; PF-21), its key is the body's traversal
 * pose (FLINCH_LAYER_PLACEHOLDER) -- over the ground play, a jump, a landing, a climb's step-up or a stance transition
 * alike -- dropped once played through or once refused. The room gates the start (`Room.flinch`), the launcher's raise
 * included, which a remote snapshot does not carry. LATER 404 (research 230 section 5.2.12): and dropped as the
 * victim's own is cut -- the ground driver pops a one-shot top from its second tick after the push
 * (`FLINCH_CUT_COMMANDS`) and past the clip's NoInterrupt (`noInterruptCommands`) when the move axes or the turn stand
 * past 0.1 (`reloadCut`, D:L418182-418185) -- on the victim's replicated stick (the snapshot's ground axes, `cutStick`,
 * and `turnRate`): another console copies the replicated axes into the same fields (D:L418613-418615), unscaled. The
 * clock is the event's arrival (the event carries no tick, FLINCH_LAYER_PLACEHOLDER's note), the stick the last
 * snapshot's.
 */
export function stepFlinch(
  r: { flinch: { clip: string; t: number; pushed?: true } | null; under?: { clip: string; t: number } | null; coverLand?: number | null },
  snap: { alive: boolean; traversal?: TraversalPose | null; action: PlaySnapshot['action'] } & Pick<FlinchGateBody, 'overlay' | 'launcher'>
    & Partial<Pick<PlaySnapshot, 'cutStick' | 'turnRate' | 'airborne' | 'landedBare' | 'landing'>>,
  dt: number, clips: PlayClips | null,
): void {
  if (!snap.alive) { r.flinch = null; r.under = null; return; }
  if (!r.flinch) return;
  r.flinch.t += dt;
  // A program's push (`pushMotion`: a door's `Open door`) has no `FUN_005a2690` before it -- `ai::ANIMATE` pushes through
  // `FUN_00588bc0` directly (D:L487256-487260) -- so the flinch's gate is not asked of it; what pops the stack takes it
  // off (`./net/deaths` `pushPopped`: a knock, a ladder's mount, a climb's start; #485's review F3).
  // The review's F2: a landing that plays a clip pops the stack to its base too (`FUN_0058a5e0` D:L466897; research 92
  // section 4), as the room's `flinchLanding` and the page's `flinchDown` drop the door clip and the flinch together. The
  // folds' re-look: a NEW landing -- the snapshot's `landing` is the last landing since the feet left the floor, a lasting
  // state -- so a landing clip's action (`LANDING_CLIP_ACTIONS`) whose serial is not the one playing at the push.
  // (The room's `flinchLanding` acts only on a flinch covered in the air; this pops on any new landing clip -- the same,
  // since a landing needs the air first: the fix's re-look, (3).)
  const landNow = snap.action && LANDING_CLIP_ACTIONS.has(snap.action.name) ? snap.action.serial : null;
  const clipLanding = landNow !== null && landNow !== (r.coverLand ?? null);
  const popped = r.flinch.pushed ? pushPopped(snap) || clipLanding : flinchRefused(snap);
  const gone = popped || remoteCut(r.flinch, snap, clips);
  const pose = gone ? null : flinchPose(r.flinch.clip, r.flinch.t, clips);
  if (pose) { snap.traversal = pose; return; }
  // LATER 512 (research 92 section 4): a push's clip run or cut hands back the flinch it covered, on from its frozen time
  // (`FUN_0028da00` D:L135098-135110); a pop to the base (`pushPopped`: a knock, a ladder, a climb) takes both.
  const under = r.flinch.pushed && !popped ? r.under ?? null : null;
  r.under = null;
  r.coverLand = null;
  r.flinch = under;
  const back = under ? flinchPose(under.clip, under.t, clips) : null;
  if (back) snap.traversal = back; else r.flinch = null;
}

/**
 * LATER 512: a map program's push (`pushMotion`, a door's `Open door`) on another's body -- over a flinch, which it
 * covers without popping (only the top advances): the flinch kept under it (`under`, its time frozen); over another push,
 * the flinch below both kept; over nothing, none.
 */
export function pushOver(
  r: { flinch: { clip: string; t: number; pushed?: true } | null; under?: { clip: string; t: number } | null; coverLand?: number | null },
  clip: string, coverLand: number | null = null,
): void {
  r.under = r.flinch && !r.flinch.pushed ? { clip: r.flinch.clip, t: r.flinch.t } : r.flinch?.pushed ? r.under ?? null : null;
  r.coverLand = coverLand;                                        // the landing clip playing now is no new landing
  r.flinch = { clip, t: 0, pushed: true };
}

/**
 * LATER 404 (research 230 section 5.2.12): whether the victim's replicated stick has cut another body's one-shot top
 * now -- from `FLINCH_CUT_COMMANDS` after its push and past its clip's NoInterrupt, the move axes or the turn past 0.1
 * (`reloadCut`, the victim's own test). No stick on the snapshot (a stand-in): no cut.
 */
function remoteCut(f: { clip: string; t: number }, snap: Partial<Pick<PlaySnapshot, 'cutStick' | 'turnRate' | 'airborne' | 'landedBare'>>, clips: PlayClips | null): boolean {
  if (snap.cutStick === undefined || snap.turnRate === undefined) return false;
  const c = clips?.clips.find((k) => k.name === f.clip);
  const entry = clips?.table?.find(([name]) => name === f.clip)?.[1];
  const after = Math.max(FLINCH_CUT_COMMANDS, c && entry?.playback ? noInterruptCommands(entry.playback, c.frameCount, entry.noInterrupt ?? null) : 0) / TICK_HZ;
  return f.t >= after - 1e-9 && reloadCut({ cutStick: snap.cutStick, turnRate: snap.turnRate, airborne: snap.airborne === true, landedBare: snap.landedBare });
}
