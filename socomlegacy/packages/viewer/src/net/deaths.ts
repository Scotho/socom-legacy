import type { Stance } from '../mover';
import { climbHoldsBody } from '../traversal';
import { PART } from './damage';
import type { Rules } from './protocol';

/**
 * The death clip (web sprint 3, M6; research 91 section 3, `FUN_005a0700` L458831 / `FUN_005a0950` L458898): a head
 * hit plays a random clip of `damanim.rdr`'s HEAD list for the stance, a body hit one of the BODY list, a limb the
 * BODY list's first; a fall or a blast plays no death clip (their own landing and knock clips run, L461384). The
 * lists name `motion.rdr` entries by their display names; `MOTION_P.ZAR` holds them snake-cased
 * ("Death stand head01" -> `death_stand_head01`). Four names have no clip of their own name and resolve through
 * `animset.rdr`'s `GLOBAL` set (the Seal anim set includes it): "Die" -> `death_stand_chest01`, "Death02" ->
 * `death_stand_chest02`, "Crawl death01" -> `death_stand_groin02`, "Crawl death02" -> `death_stand_groin01` (research
 * 179 s11.2; PF-21, research 217 s4: the two crawls were swapped here, BODY STAND's 7th and 8th entries; the name the
 * port read them by is retired). The pistol variants ("Pistol death ...") are not in the SEAL's pack and are not used.
 */

const HEAD: Readonly<Record<Stance, readonly string[]>> = {
  stand: ['death_stand_head01', 'death_stand_head02', 'death_stand_head03', 'death_stand_head04'],
  crouch: ['death_crouch_head01', 'death_crouch_chest01'],
  prone: ['death_prone_chest01'],
};

const BODY: Readonly<Record<Stance, readonly string[]>> = {
  stand: [
    'death_stand_chest01', 'death_stand_chest02', 'death_stand_chest03', 'death_stand_rarm01', 'death_stand_larm01',
    'death_stand_larm02', 'death_stand_groin02', 'death_stand_groin01',   // "Crawl death01", "Crawl death02" (GLOBAL)
  ],
  crouch: ['death_crouch_back01', 'death_crouch_chest02'],
  prone: ['death_prone_chest01'],
};

/**
 * HX-2 (web sprint 31; research 238 §1): `damanim.rdr`'s `TEAMMATE_HEAD_DEATH_ANIMATIONS` and
 * `TEAMMATE_BODY_DEATH_ANIMATIONS`, the same two lists ("Death buddy stand01-03", "Death buddy crouch01", "Death buddy
 * prone01"; `animset.rdr`'s `GLOBAL` names them `death_buddy_*`), loaded into the table at 0x44d050 by `FUN_005a44f0`.
 * No limb's list is loaded (189 #11, §5; V2 #23).
 */
const TEAMMATE: Readonly<Record<Stance, readonly string[]>> = {
  stand: ['death_buddy_stand01', 'death_buddy_stand02', 'death_buddy_stand03'],
  crouch: ['death_buddy_crouch01'],
  prone: ['death_buddy_prone01'],
};

/**
 * HOSTAGE_DEATH_LIST_READING (HX-2; research 238 §1, §5): a hostage dies in the TEAMMATE lists. `FUN_005a0950`
 * (D:L458898-458960) takes the 0x44d050 table when the victim is no local human and shares a `+200` bit with the local
 * player (D:L458919) -- the hostage's 0xC0020000 shares one with every side, so on every console; head and body hits draw
 * `rand() % count` of the stance's row (D:L458919-458939). A limb's row is empty (count 0), so the branch falls through to
 * `LAB_005a0b20` and `*DAT_0044cee4` -- the players' BODY STAND list's first, `death_stand_chest01` ("Die") -- whatever the
 * stance (D:L458957-458959): the research's "the stance's default" read at the decomp as STAND's.
 */
export const HOSTAGE_DEATH_LIST_READING = 'TEAMMATE' as const;

/**
 * HOSTAGE_FLINCH_READING (HX-2; research 238 §1, §5): `damanim.rdr` has no TEAMMATE flinch rows, so a hostage flinches in
 * the players' lists (`seal_flinch_rarm/larm/rleg/lleg`, `seal_crouch_rflinch`, `seal_prone_rflinch`; the long
 * `guard_hit01`, `guard_hit_shoulder`, `guard_hit_stomach01` never online, `MP_LONG_FLINCHES`), resolved through the
 * No_weapon set's `GLOBAL` include (189 §5, §7). `flinchClip` serves both.
 */
export const HOSTAGE_FLINCH_READING = 'the players\' lists' as const;

/**
 * HOSTAGE_BLAST_DEATH_READING (research 238 §1.5, 91 §3, 237's correction of 2026-10-23): a hostage a blast kills plays
 * no death-list clip standing or crouched -- the death function picks none for an explosion, cause 4 (`FUN_005a54d0`
 * D:L461384-461390) -- and is thrown instead: the knock `FUN_0057e770` is the body's own code (the per-frame
 * `FUN_005506a0` D:L417906 -> the blast handler `FUN_005a0e70` -> D:L459307-459311, for a local controller: the host's
 * hostage), which throws a dead body that is not prone by side (`FUN_005807d0` kind 8, D:L440999-441001,
 * D:L441040-441051): Fall forward or backwards, then at the landing Land forward or backwards, no get-up. Prone, the
 * knock's dead branch plays the body row for prone (D:L441003-441015): `death_buddy_prone01` on the TEAMMATE table. So
 * the kill's clip is null standing or crouched, as a player's; the throw itself is the hostage's blast knock (LATER 354:
 * the room's `HostageFollow.knock`, drawn from the snapshot's action). Was (the #389 takeover's first cut): "none, the corpse stays in its idle" -- and
 * before it #389's "the stance's TEAMMATE row"; neither is a read path. [reading]
 */
export const HOSTAGE_BLAST_DEATH_READING = 'the knock\'s clips' as const;

/** Every death clip, for the page's clip request (HX-2: the TEAMMATE lists' five with the players'). */
export const DEATH_CLIPS: readonly string[] = [...new Set([...Object.values(HEAD), ...Object.values(BODY), ...Object.values(TEAMMATE)].flat())];

/** One of a list at random (`FUN_005a0950`: `rand() % count`). */
const pick = (list: readonly string[], random: () => number): string => list[Math.min(list.length - 1, Math.floor(random() * list.length))]!;

/**
 * FALL-DEATH-LAND: what ANOTHER console shows of a body that fell to its death. The fall's damage runs on the victim's
 * console alone (`FUN_005ac1f0` D:L464929-464933: a remote controller's `+0x34` answers true, and the function returns
 * class 0 having played the sound only), so on another console the landing's class is 0 unless the death has already
 * cleared the body's alive bit there (`FUN_005af590` D:L466658-466660), and class 0 over the hard rate pushes clip 0xb,
 * `Jump land hard` (D:L466674); the death heard after it plays no clip of its own (cause 7, `FUN_005a54d0` D:L461387).
 * How the death's state 8 then reaches that copy of the body -- whether it lies down, and in what -- is not read. The
 * port draws every viewer's copy from the room's mover, the victim's console's (`Walker.fallKills`): `Land forward`,
 * held (research 151 §5). [reading]
 */
export const REMOTE_FALL_DEATH_POSE_READING = "the victim's console's: Land forward, held" as const;

/**
 * The clip a SEAL dies in, or null for a death with no clip of its own. A fall: none (its `Land forward` holds, cause 7,
 * L461387). A blast: none from the death itself (cause 4, L461387) -- the corpse is thrown by the knock (`./blast`
 * `blastKnock`, dead) -- except prone, where the knock does not throw and the game plays a clip of the BODY list for
 * prone instead (`FUN_0057e770` L441013-441015: `FUN_005a0950(actor, 3, 2)`, part 3 the body, posture 2 prone).
 * `family` 'teammate' (HX-2, a hostage): the TEAMMATE lists (`HOSTAGE_DEATH_LIST_READING`), a limb BODY STAND's first.
 * A blast on that family is none standing or crouched -- the knock throws the body (`HOSTAGE_BLAST_DEATH_READING`;
 * the hostage's knock is LATER 354) -- and the TEAMMATE prone row prone; a player's blast is unchanged (none, except the
 * BODY list's prone row).
 */
export function deathClip(cause: 'bullet' | 'blast' | 'fall', part: number, stance: Stance, random: () => number,
  family: 'player' | 'teammate' = 'player'): string | null {
  if (family === 'teammate') {
    if (cause === 'blast') return stance === 'prone' ? pick(TEAMMATE.prone, random) : null;   // HOSTAGE_BLAST_DEATH_READING
    if (cause !== 'bullet') return null;
    return part === PART.HEAD || part === PART.BODY ? pick(TEAMMATE[stance], random) : BODY.stand[0]!;
  }
  if (cause === 'blast') return stance === 'prone' ? pick(BODY.prone, random) : null;
  if (cause !== 'bullet') return null;
  if (part === PART.HEAD) return pick(HEAD[stance], random);
  const list = BODY[stance];
  if (part !== PART.BODY) return list[0]!;
  return pick(list, random);
}

/**
 * The flinch (the owner, 2026-10-02: "Other players do not see a hit animation on somebody"; research 91 section 21):
 * `damanim.rdr`'s `<PART>_FLINCH_ANIMATIONS[STAND/CROUCH/PRONE]` lists, by part in `PART` order (the table at
 * 0x44d230, `part x 0x24 + stance x 0xc`, `FUN_005a0270` L458783-458785), their names through `animset.rdr`'s
 * `Seal anim set` (`Flinch right arm` -> `seal_flinch_rarm`, `Crouch flinch` -> `seal_crouch_rflinch`, `Hit01` ->
 * `guard_hit01`, ...). The `Pistol ...` names have no entry in the anim set and are not used (as the deaths').
 */
const FLINCH: readonly Readonly<Record<Stance, readonly string[]>>[] = (() => {
  const low = { crouch: ['seal_crouch_rflinch'], prone: ['seal_prone_rflinch'] };
  return [
    { stand: ['seal_flinch_rarm'], ...low },                                                                   // HEAD
    { stand: ['seal_flinch_rarm'], ...low },                                                                   // RARM
    { stand: ['seal_flinch_larm', 'guard_hit_shoulder'], ...low },                                             // LARM
    { stand: ['seal_flinch_rarm', 'seal_flinch_larm', 'guard_hit_stomach01', 'guard_hit01'], ...low },         // BODY
    { stand: ['seal_flinch_rleg'], ...low },                                                                   // RLEG
    { stand: ['seal_flinch_lleg'], ...low },                                                                   // LLEG
  ];
})();

/**
 * The three long hit clips (2.9-4.3 s, `motion.rdr`) a networked game never flinches in (`FUN_005a0270`
 * L458795-458825, `DAT_0045a0c1` set): `DAT_003dedf0/f8`, `DAT_003dee00` are the anim types of "Hit stomach01",
 * "Hit shoulder" and "Hit01" (L495301-495303, the strings at 0x661d60/70/80 of the ELF).
 */
export const MP_LONG_FLINCHES: readonly string[] = ['guard_hit_stomach01', 'guard_hit_shoulder', 'guard_hit01'];

/** Every flinch clip a networked game plays, for the page's clip request. */
export const FLINCH_CLIPS: readonly string[] = [...new Set(FLINCH.flatMap((r) => Object.values(r).flat()))]
  .filter((c) => !MP_LONG_FLINCHES.includes(c));

/**
 * FLINCH_STANCE_READING (research 179 s11.6; PF-21, research 217 s4): `FUN_005a0270` (D:L458733-458785) takes the
 * flinch's stance row from `FUN_0058a720(actor, 0)`'s stance (0-2 as they are; 7, 9 and 10 the standing row; 8 and the
 * rest `FUN_0057dbb0`'s) -- except while a stance change plays in the first half of its play (phase under 0.5, or over
 * 0.5 when its `+0x28` bit 0x20 reverses it), when the row is the change's origin: 0x11 stand / crouch, 0x13 crouch /
 * prone, 0x19 stand / prone (L458746-458775). The port: the body's posture, or a playing transition's origin while
 * under half (`flinchStance`, from the mover's action, `flinchBodyOf`). [reading: 0x11 / 0x13 / 0x19 are named from
 * the rows they give (research 179 s11.6's interpretive step); the `+0x1060` bit 4 that forces the prone row
 * (L458777) and states 7-10 have no port counterpart; the base is the posture, `stand` while a crouch runs]
 */
export const FLINCH_STANCE_READING = 'origin under half' as const;

/** A stance transition playing (`Walker.action` standToCrouch / crouchToProne / standToProne): its ends, its phase. */
export interface FlinchTransition { from: Stance; to: Stance; phase: number; reversed: boolean }
/** What the flinch's row is read from: the body's posture and the stance transition it is in, if any. */
export interface FlinchBody { posture: Stance; transition?: FlinchTransition | null }

/** The three transitions' ends played forwards (`Walker.changeStance`: getting up plays them reversed). */
const TRANSITION_ENDS: Readonly<Record<string, readonly [Stance, Stance]>> = {
  standToCrouch: ['stand', 'crouch'], crouchToProne: ['crouch', 'prone'], standToProne: ['stand', 'prone'],
};

/**
 * The flinch body of a mover (`Walker`, the room's `MoverSim`'s or the page's): its posture and, while a transition
 * plays, the change's origin and destination and the clip's phase (0 to 1 along the clip; a reversed one runs 1 to 0).
 */
export function flinchBodyOf(w: { posture: Stance; action: { name: string; t: number; seconds: number | null; reversed: boolean } | null }): FlinchBody {
  const a = w.action, ends = a ? TRANSITION_ENDS[a.name] : undefined;
  if (!a || !ends || !(a.seconds !== null && a.seconds > 0)) return { posture: w.posture };
  const run = Math.min(1, Math.max(0, a.t / a.seconds));
  const [from, to] = a.reversed ? [ends[1], ends[0]] : ends;
  return { posture: w.posture, transition: { from, to, phase: a.reversed ? 1 - run : run, reversed: a.reversed } };
}

/** The flinch's stance row (`FLINCH_STANCE_READING`): a transition's origin in its first half of play, else the posture. */
export function flinchStance(body: FlinchBody): Stance {
  const t = body.transition;
  if (t && (t.reversed ? t.phase > 0.5 : t.phase < 0.5)) return t.from;
  return body.posture;
}

/**
 * FLINCH_GATE_READING (research 179 s11.4; PF-21, research 217 s4): `FUN_005a2690` (D:L459887-460017) starts no flinch
 * while `Fall forward` / `Fall backwards` play (`FUN_00588030`, D:L445700), in states 5 (the ladder), 8, 9 and 10,
 * during the three long hits ("Hit stomach01", "Hit shoulder", "Hit01"), during a weapon switch (`FUN_005a7980(actor,
 * 1)` D:L462473-462507: the swaps 0x35-0x37, `Rifle -> Launcher`, `Pistol -> Launcher`, the turret mounts, a pending
 * `+0x1e4`), on a turret or in the restrained / turret anim sets, over a motion flagged 0x40, with the alive bit clear
 * (and over the stab, CQB and restraint motions, which the port has none of). It does not refuse a jump, a climb or a
 * landing: it pops the stack to its base kind and pushes itself. The port's predicate (`flinchRefused`): dead; a
 * ladder or a hang (the traversal's clips: the hang's loop -- NU-1b B7 and its review's F3: not `Stand -> Hang`, `Hang ->
 * Climb` or the jump down, which it pops); the knock's falls and their landings (`fallForward`, `fallBackwards`,
 * `landBackwards`, and `landDeath`, which a living body online plays only as the forward knock's landing); the heavy
 * landing's `hit` and `hitStomach` (the long hits `Hit01` and `Hit stomach01`); a swap, full-body or the moving overlay;
 * a launcher raise or lower. Allowed: the jump, the launch and the fall, the soft and hard landings, the get-ups, the
 * stance transitions (whole-body over them: the transition's clock runs on under the flinch, `FLINCH_LAYER_PLACEHOLDER`),
 * the climbs and the step-up, the peek. [reading: the hang taken as the ladder's state; the climbs other than the
 * ladder's taken as the original's "climb"; states 8, 9 and 10 by name unread (research 179 s11.4's owed read)]
 */
export const FLINCH_GATE_READING = 'the original refusals' as const;

/** What `flinchRefused` reads of a body: a snapshot's action, traversal clip and overlay, and the room's own facts. */
export interface FlinchGateBody {
  alive?: boolean;
  action?: { name: string } | null;
  traversal?: { clip: string } | null;
  overlay?: { clip: string } | null;
  /** A launcher raise or lower playing (`Rifle -> Launcher` / `Pistol -> Launcher`): the room's clock knows it. */
  launcher?: boolean;
}

/**
 * The mover actions a flinch is refused over (`FLINCH_GATE_READING`). PAR-84 (research 230 section 5.2.10): the
 * launcher's raise and still lower, mover actions since (`FUN_005a7980`'s types, D:L462484-462491; `FUN_005a2690`
 * D:L460005-460010); the `launcher` clause stays for the room's clocks and the moving lower.
 */
const FLINCH_REFUSING_ACTIONS: ReadonlySet<string> = new Set([
  'fallForward', 'fallBackwards', 'landBackwards', 'landDeath', 'hit', 'hitStomach', 'swapStand', 'swapCrouch', 'swapProne',
  'rifleToLauncher', 'pistolToLauncher',
]);

/** Whether `FUN_005a2690` refuses a flinch on this body now (`FLINCH_GATE_READING`). */
export function flinchRefused(body: FlinchGateBody): boolean {
  if (body.alive === false || body.launcher || body.overlay) return true;
  if (body.action && FLINCH_REFUSING_ACTIONS.has(body.action.name)) return true;
  const clip = body.traversal?.clip;
  // NU-1b B7 (research 313's review F5; `../traversal` `CLIMB_HIT_CANCELS_READING`): `seal_stand2hang`,
  // `seal_hang2climbup` and (NU-1b's review F3, motion.rdr looped 0) `seal_hang_jumpdown` are one-shots the flinch pops
  // (D:L460011-460019); the hang's loop stays refused (research 313 section 8.3). Was: `/ladder|hang/`, every clip naming
  // the hang; then the jump down refused with the loop.
  return clip !== undefined && (/ladder/.test(clip) || HANG_REFUSES_FLINCH.test(clip));
}

/**
 * DOORS (#485's review F3; research 92 section 4): whether a program's one-shot push (a door's `Open door`) is popped off
 * this body now. `FUN_005a2690`'s gate is the flinch's and is not asked of a push (`ai::ANIMATE` pushes through
 * `FUN_00588bc0` alone, D:L487256-487260); what removes it is what pops the stack: a knock (`FUN_0057e770` ->
 * `FUN_0058a4d0` D:L440997, before its fall's push -- the blast's falls, its landing and, prone, Prone cover's push
 * D:L441018; #485's re-read N3, N4), a ladder's mount (`FUN_0057f880` to the base, D:L441547-441558)
 * and a climb's start (`FUN_00580b70` D:L442186-442214, the climbs and the hang: `climbHoldsBody`). A swap pushes its own
 * top over it and leaves it (no pop).
 */
export function pushPopped(body: Pick<FlinchGateBody, 'action' | 'traversal'>): boolean {
  if (body.action && PUSH_POPPING_ACTIONS.has(body.action.name)) return true;
  const clip = body.traversal?.clip;
  return clip !== undefined && (/ladder/.test(clip) || climbHoldsBody(clip));
}

/** The knock's actions that pop the stack under a push (`pushPopped`): its falls, its landing and Prone cover (`./blast`). */
const PUSH_POPPING_ACTIONS: ReadonlySet<string> = new Set(['fallForward', 'fallBackwards', 'landBackwards', 'landDeath', 'proneCover']);

/** The hang's clip a flinch is still refused over (`flinchRefused`): its loop (looped 1), the pistol's too. */
const HANG_REFUSES_FLINCH = /^seal_(?:p_)?hang$/;

/**
 * The clip a non-lethal round flinches a SEAL in (`FUN_005a0270`, its network branch: the page's match is always one,
 * SOLO_IS_NETWORK_READING): one of the part's list for the stance at random; a long one drawn is drawn again among the
 * list's others that are not, taken in order from the one after it (wrapping, at most 8), the one if one, else at
 * random. The stance: a row as given, or a body's (`flinchStance`, FLINCH_STANCE_READING).
 */
export function flinchClip(part: number, body: Stance | FlinchBody, random: () => number): string {
  const stance = typeof body === 'string' ? body : flinchStance(body);
  const list = (FLINCH[part] ?? FLINCH[PART.BODY]!)[stance];
  const n = list.length;
  const i = Math.min(n - 1, Math.floor(random() * n));
  if (!MP_LONG_FLINCHES.includes(list[i]!)) return list[i]!;
  const rest: number[] = [];
  for (let j = (i + 1) % n; j !== i && rest.length < 8; j = (j + 1) % n) if (!MP_LONG_FLINCHES.includes(list[j]!)) rest.push(j);
  if (rest.length === 0) return list[i]!;
  return list[rest.length === 1 ? rest[0]! : rest[Math.min(rest.length - 1, Math.floor(random() * rest.length))]!]!;
}

/** "Press the %c button to respawn." shows from this long dead (`FUN_00592560` L451680-451701; research 91 section 4.1). */
export const RESPAWN_PROMPT_S = 5;
/**
 * The body's fade before an ordinary death's press counts (research 91 section 4.1: 1 -> 0 at 0.1/s), the room's
 * `RESPAWN_FADE_S` (`match/src/room.ts`, pinned equal by `respawnRoomClock.test.ts`): the page's ready on the room's
 * clock waits for max(`RESPAWN_PROMPT_S`, this) of the room's ticks, as the room's own `respawnReady` does.
 */
export const RESPAWN_FADE_S = 10;

/**
 * The body fades from 1 to 0 at 0.1 a second once dead (`FUN_005979a0` L454491): gone after this many seconds. NU-4
 * (research 317 R317.2): the fade of a respawn game's dying console on its own body (`FUN_00552780` D:L418720-418743
 * sets it, `FUN_00551ec0` D:L418492-418505 steps it on the actor update's dt: 10.0 s of real time) -- not the others'
 * bodies' (`corpseShownS`).
 */
export const BODY_FADE_S = 10;

/**
 * CLASSIC_BODY_STAYS_READING (NU-4; research 317 R317.1, §1.4, §6): a classic game's body never fades, on any console.
 * The local controller's death handler (`CSealCtrl`'s +0x18, `FUN_005979a0`) starts the fade only online with the
 * respawn option on (game +0xdc set, +0xd2 clear, D:L454484-454491); the replicated alpha's two writers test the same
 * option (D:L451699-451700, D:L453147); a remote's handler (`CRemoteCtrl`'s +0x18, `FUN_005e6290` D:L497312-497328)
 * clears its alive valve and starts no fade. So the body lies whole until the round's reload re-places its actor
 * (`FUN_00223680` D:L75925-75931). Owed: research 317's capture A. [reading]
 */
export const CLASSIC_BODY_STAYS_READING = 'the whole round' as const;

/**
 * REMOTE_BODY_FADE_READING (NU-4; research 317 R317.3, §1.3, §6): in a respawn game another console sees the body whole
 * until its player's respawn press. Its alpha travels only as 4 bits of the replicated state (`state+0x110`), written
 * on a frame the action button reads 1 more than 5 s after the death (`FUN_00592560` D:L451675-451676,
 * D:L451699-451723), sent every dead frame (D:L451729, D:L161942) and applied on receipt (`FUN_002be150` D:L162387 ->
 * `FUN_0056f4c0` D:L432808-432834); a press at 10 s or later sends it hidden and marks the respawn. The partial alpha
 * of a press from 5 s to 10 s is not drawn: the skinned material has no opacity (`BODY_FADE_PLACEHOLDER`) and the room
 * tells no press. Medium-high; owed: the button's edge or hold, research 317's capture B. [reading]
 */
export const REMOTE_BODY_FADE_READING = 'whole until the respawn' as const;

/**
 * OWN_BODY_FADE_READING (NU-4; research 317 R317.2, §1.2, §1.4, §6): the dying console's own body fades over
 * `BODY_FADE_S` in a respawn game (`FUN_005979a0` D:L454491) and not at all in classic (D:L454485-454488, the
 * spectate branch). The rule is `corpseShownS(rules, 'own')`, applied by PAR-91 (research 317 §1.8, B3): the page's
 * `Play.frame` hides its own dead body once its real seconds dead reach it (`ownCorpseS`, from `main.ts` and
 * `matchMount.ts` with the room's rules and its waiting room); drawn whole until then (`BODY_FADE_PLACEHOLDER`). Was: "the
 * page does not apply it yet (its own dead body is drawn whole by its play until the respawn)". Owed: research 317's
 * capture B. [reading]
 */
export const OWN_BODY_FADE_READING = '10 s respawn, none classic' as const;

/**
 * NU-4 (research 317 R317.4): how long a corpse is drawn, in seconds from its death, while its seat stays dead -- a body
 * is its player's actor, with no timer or count of its own; it goes with its player's respawn (`FUN_00598b90(actor, 1)`)
 * or the round's reload (`FUN_00598b90(actor, 0)`, D:L75931), when the seat is alive again. `Infinity`: until then.
 * - `'other'`, another seat's body on this page: until its seat is alive under both rules (`CLASSIC_BODY_STAYS_READING`,
 *   `REMOTE_BODY_FADE_READING`);
 * - `'own'`, the dying console's own body: `BODY_FADE_S` in a respawn game, the whole round in classic
 *   (`OWN_BODY_FADE_READING`).
 * `waiting`: a classic room waiting for both sides plays as a respawn room (`CLASSIC_WAITING_PLACEHOLDER`) and takes the
 * respawn rule. The room's victory offer (`Room.victoryStatus`'s `present`) and the page's bodies (`RemotePlayers`, the
 * join envelope's corpses) read it alike.
 */
export function corpseShownS(rules: Rules, whose: 'own' | 'other', waiting = false): number {
  if (rules === 'classic' && !waiting) return Infinity;              // CLASSIC_BODY_STAYS_READING, OWN_BODY_FADE_READING
  return whose === 'own' ? BODY_FADE_S : Infinity;                    // OWN_BODY_FADE_READING; REMOTE_BODY_FADE_READING
}

/**
 * The game's death causes, the actor's `+0xfb0` (`FUN_005477a0` stores it, D:L412837; research 91 section 3), that the
 * room's deaths are: a bullet 5 (`FUN_005abbc0` L464731), rewritten to 3 when it is the head's (part 0) and lethal
 * (`FUN_005a54d0` L461370-461376); a blast 4 (`FUN_005a0e70` L459285); a fall 7 (`FUN_005ac1f0` L464954). 6 is the
 * ghost's and the cleanup's, which no death of the room's is; 0-2 are the scripts', which a match has none of.
 */
export const DEATH_CAUSE = { HEADSHOT: 3, BLAST: 4, BULLET: 5, CLEANUP: 6, FALL: 7 } as const;

/**
 * A room death's cause (`DEATH_CAUSE`): a bullet's -- a firearm's round, and a launched round's direct hit under the
 * room's IMPACT_HIT_READING -- 5, or 3 on the head (only a bullet's 5 is rewritten, L461370-461376); a blast 4; a fall 7.
 */
export function deathCause(kind: 'bullet' | 'blast' | 'fall', part: number): number {
  if (kind === 'fall') return DEATH_CAUSE.FALL;
  if (kind === 'blast') return DEATH_CAUSE.BLAST;
  return part === PART.HEAD ? DEATH_CAUSE.HEADSHOT : DEATH_CAUSE.BULLET;
}

/**
 * The death voice's slot by the cause (`FUN_005979a0` D:L454473-454480, research 179 section 8.15, research 205 section
 * 2.2): causes 1, 2 and 3 play character sound 0x3d, `CHRSND_DEATH_QUIET`; cause 6 none; any other 0x3c, `CHRSND_DEATH`
 * (the names by `FUN_0053c3a0`, D:L405976-405979). The slot is the victim character's (`character.rdr`'s `sounds`); a
 * slot the character does not name plays nothing (`FUN_0053b710`'s null handle, D:L405264-405266), which on the disc is
 * every multiplayer character's `CHRSND_DEATH_QUIET`: a head shot is silent in a match.
 */
export function deathVoiceSlot(cause: number): 'CHRSND_DEATH' | 'CHRSND_DEATH_QUIET' | null {
  if (cause === DEATH_CAUSE.CLEANUP) return null;
  return cause === 1 || cause === 2 || cause === DEATH_CAUSE.HEADSHOT ? 'CHRSND_DEATH_QUIET' : 'CHRSND_DEATH';
}

/**
 * The character voice gate, seconds (`FUN_0053b710` D:L405268-405290): the hurt voice (0x3b), the death voice (0x3c) and
 * the quiet one (0x3d) play only while the actor's `+0x424` is 0, and a play sets it to 3.0 (0x40400000, D:L405280,
 * D:L405290); the actor's update runs it down by its frame time to 0 (`FUN_00551ec0` D:L418483-418487) -- a law in
 * seconds. Every hit that leaves its victim alive with less health plays the hurt voice (`FUN_005a54d0` L461394-461396 ->
 * `FUN_005477a0` L412828-412838 -> `FUN_00597b00`), so a death within 3 s of one is silent.
 */
export const VOICE_GATE_S = 3;
