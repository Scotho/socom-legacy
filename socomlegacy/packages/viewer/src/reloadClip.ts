import type { MotionClip } from '@s2u/scene';
import type { MotionTable } from './motionTable';

/**
 * The reload's clip and its length, one table for the page and the match server (MJ-1 of the launch review; the
 * shared sim boundary, `./sim`): the page's `WeaponPose` plays and times the reload from here, and the server's room
 * locks the weapon for the same seconds, so the two clocks cannot drift.
 *
 * - **The lock is the clip.** The game has no reload timer: `FUN_005c2a90` (decomp 477395-477399) refuses a reload
 *   while `FUN_005a7d10` / `FUN_005a7ab0` / `FUN_005a78d0` answer, and the fire gate `FUN_005a7de0` tests the reload's
 *   animation state through `FUN_005a7ab0` -- the reload lasts as long as its clip plays. The M4A1's record carries no
 *   `ReloadTime` (research 79 s1.2; research 84 s18). A swap does not cut it short: the swap gate `FUN_005a8cb0`
 *   (463150-463160) refuses through the same `FUN_005a7de0`, so the page's `canSwap` and the server's room refuse a
 *   swap while the reload plays (review 2, M-3). So the length is the clip's `motion.rdr` `playback` [data]:
 *   `seal_reload` 1.6, `seal_crouch_reload` 1.9, `seal_prone_reload` 1.7, `seal_mv_reload` 1.2 (the pistol's four
 *   from the same table).
 * - **The clip.** `FUN_005a82e0` (decomp 462786-462930) picks it: prone the prone reload; otherwise the moving
 *   overlay when the mover's speed squared is over 400.0 (`bVar3`, 462821-462823: `vx^2 + vy^2 + vz^2 <= 400.0` is
 *   still -- hard-coded; `dynamics.rdr`'s `min_running_reload_speed` is loaded but never read), else the stance's.
 *   The item (`m_item`) picks the rifle's set or the pistol's (animset.rdr's "Rifle reload" / "Pistol reload" family).
 * - `RELOAD_SECONDS_PLACEHOLDER` (named; research 84 s11): the length when the clip or the table is missing (a
 *   source without `MOTION_P.ZAR`, a server started without the clips) -- the viewer's old estimate, 2 s, with no
 *   source. It is a fallback only; every retail disc carries the clips.
 */

/** The stance the reload picks its clip by (`Walker.posture`: the body in use). */
export type ReloadStance = 'stand' | 'crouch' | 'prone';
/**
 * The clip family a reload plays (web sprint 4 M4: `FUN_005a82e0`'s choice, research 94 §C1.2): the firearm in use
 * (`m_item`: `rifle` or `pistol`), the shotgun reload, the pump (the shotgun class's after-shot), and the launcher's
 * round mode's `Rifle m203 reload`.
 */
export type ReloadItem = 'rifle' | 'pistol' | 'shotgun' | 'pump' | 'm203';

/** The rifle's reload clips by stance, and the moving one (animset.rdr's "Rifle reload" family). */
export const RELOAD_CLIPS = {
  stand: 'seal_reload', crouch: 'seal_crouch_reload', prone: 'seal_prone_reload', moving: 'seal_mv_reload',
} as const;

/** The pistol's (animset.rdr's "Pistol reload", "Pistol crouch reload", "Pistol prone reload", "Moving pistol reload"). */
export const PISTOL_RELOAD_CLIPS = {
  stand: 'seal_p_reload', crouch: 'seal_p_crouch_reload', prone: 'seal_p_prone_reload', moving: 'seal_p_mv_reload',
} as const;

/**
 * The shotgun reload (animset.rdr "Shotgun reload", "Shotgun crouch reload", "Shotgun prone reload", "Moving shotgun
 * reload": `DAT_003df098`/`0a0`/`0a8`/`0b0`, named at L495399-495402 from 0x6623b0-0x662400): the 870 (84) and the
 * M82A1A, M40A1, M87ELR (101-103; `FUN_005a82e0`'s `bVar5`, class 0x65 with `id - 0x68 > 2`).
 */
export const SHOTGUN_RELOAD_CLIPS = {
  stand: 'seal_reload_shotgun', crouch: 'seal_crouch_reload_shotgun', prone: 'seal_prone_reload_shotgun', moving: 'seal_mv_reload_shotgun',
} as const;

/**
 * The pump (animset.rdr "Shotgun pump", "Shotgun crouch pump", "Shotgun prone pump", "Moving shotgun pump":
 * `DAT_003df0b8`/`0c0`/`0c8`/`0d0`, L495403-495406): the after-shot clip (`param_2` 1) of the shotgun class (0x51).
 */
export const PUMP_CLIPS = {
  stand: 'seal_pump_shotgun', crouch: 'seal_crouch_pump_shotgun', prone: 'seal_prone_pump_shotgun', moving: 'seal_mv_pump_shotgun',
} as const;

/**
 * A launcher round mode's reload (`bVar4`: `FUN_005bda00` or `FUN_005bd6d0`, the kit firing a carrier's round): still,
 * in every stance, "Rifle m203 reload" (`DAT_003debf8`, named at L495238 from 0x661840); moving, "Moving rifle reload"
 * (`DAT_003deb70`, 0x6616a0) -- `FUN_005a82e0` L462836-462846.
 */
export const M203_RELOAD_CLIPS = {
  stand: 'seal_reload_m203', crouch: 'seal_reload_m203', prone: 'seal_reload_m203', moving: 'seal_mv_reload',
} as const;

const FAMILIES: Readonly<Record<ReloadItem, { stand: string; crouch: string; prone: string; moving: string }>> = {
  rifle: RELOAD_CLIPS, pistol: PISTOL_RELOAD_CLIPS, shotgun: SHOTGUN_RELOAD_CLIPS, pump: PUMP_CLIPS, m203: M203_RELOAD_CLIPS,
};

/** Every reload and after-shot clip: what the sim's clip set (`./simMap` `SIM_CLIPS`) carries so the server can time them. */
export const ALL_RELOAD_CLIPS: readonly string[] = Object.freeze([...new Set(Object.values(FAMILIES).flatMap((f) => Object.values(f)))]);

/**
 * `FUN_005a82e0`'s family (L462812-462900): a round mode `m203`; the pistol in hand (`+0xf79 != 1`) `pistol`; the
 * after-shot (`param_2` 1) of the shotgun class (81-90) `pump`; the 870 (84) and the bolt-class snipers 101-103
 * `shotgun`; everything else `rifle` (the Spas 12 and the JACKHAMMER among them).
 */
export function reloadFamily(how: { item: 'rifle' | 'pistol'; id: number; afterShot?: boolean; roundMode?: boolean }): ReloadItem {
  if (how.roundMode) return 'm203';
  if (how.item === 'pistol') return 'pistol';
  if (how.afterShot && how.id >= 81 && how.id <= 90) return 'pump';
  if (how.id === 84 || (how.id >= 101 && how.id <= 103)) return 'shotgun';
  return 'rifle';
}

/**
 * `FUN_005a82e0`'s still test for the reload (decomp 462821-462823): the mover's speed squared at most 400.0 (20 units
 * a second) is still. Faster, standing or crouched, the moving reload; prone always the prone one.
 */
export const RELOAD_STILL_SPEED = 20;

/**
 * B-18 (research 150 section 5, "B-18"; the one-frame pop proven by the KILL2 capture, r0004, 11 hands-off trials and the stick's case (c), per research 150; its other cases reading):
 * the commands from the command a still reload's or after-shot's clip life ends on (its end or its stick's cut) to the
 * one a waiting stance request is taken on -- one game frame (what the capture proves; the value 2 is the arithmetic below, and 1 or 3 commands also fall inside its resolution). In the capture the request stays pending for one row with
 * the looped stance on top, and the posture changes on the next row (`FUN_00552ec0`'s gate reads the top before the
 * driver's end test or cut of the same frame, `FUN_00550ef0` D:L418174-418203). A game frame on the 60 Hz commands is
 * `GAME_FRAME_DT * TICK_HZ` = 2.002 (525/15734 x 60), so 2 (held by `boltStance.test.ts`); not `HANDED_BACK_CUT_COMMANDS`, that ceiling
 * is 3. Read by `walk.ts` `stillClipOnTop` and `room.ts` `watchMoves`' `stillClip`.
 */
export const STANCE_POP_FRAME_COMMANDS = 2;

/** PLACEHOLDER (named; research 84 s11): the reload's seconds when its clip or the table is missing. No source. */
export const RELOAD_SECONDS_PLACEHOLDER = 2;

/** `FUN_005a82e0`'s `bVar3` negated: the mover's velocity (units a second) is over 20 -- the moving reload. */
export function reloadMoving(vx: number, vy: number, vz: number): boolean {
  return vx * vx + vy * vy + vz * vz > RELOAD_STILL_SPEED * RELOAD_STILL_SPEED;
}

/** `FUN_005a82e0`'s choice: prone the prone reload; else moving the overlay, still the stance's; the item's set. */
export function reloadClip(stance: ReloadStance, moving: boolean, item: ReloadItem = 'rifle'): string {
  const set = FAMILIES[item];
  return stance === 'prone' ? set.prone : moving ? set.moving : set[stance];
}

/** The reload's length: the clip's `playback` seconds, else its keys at its own rate; null without the clip. */
export function reloadLength(clip: MotionClip | undefined, table: MotionTable | null): number | null {
  if (!clip) return null;
  const playback = table?.get(clip.name)?.playback;
  return playback !== null && playback !== undefined && playback > 0 ? playback : clip.frameCount / clip.rate;
}

/** The clips by name, from a map (the page's) or the list the sim loads (`SimClips.clips`, the server's). */
export type ReloadClipSource = ReadonlyMap<string, MotionClip> | readonly MotionClip[];

const clipNamed = (clips: ReloadClipSource, name: string): MotionClip | undefined =>
  Array.isArray(clips) ? (clips as readonly MotionClip[]).find((c) => c.name === name) : (clips as ReadonlyMap<string, MotionClip>).get(name);

/**
 * The reload's length in a stance, moving or not, for a family: the record's `ReloadTime` when the body is still and it
 * has one -- `FUN_005a82e0` L462940-462945 sets the clip's rate to its length / `ReloadTime` when `bVar3` (the speed
 * squared at most 400, any stance), so the clip lasts `ReloadTime` (Spas 12 and JACKHAMMER 2, M60E3 3, M63A 2.5) --
 * else the chosen clip's (`reloadLength`); null without it, or without the clips (`null`: a server started without
 * `MOTION_P.ZAR`, whose still `ReloadTime` needs none).
 */
export function reloadSeconds(clips: ReloadClipSource | null, table: MotionTable | null, stance: ReloadStance, moving: boolean,
  item: ReloadItem = 'rifle', reloadTime = 0): number | null {
  if (!moving && reloadTime > 0) return reloadTime;
  return clips ? reloadLength(clipNamed(clips, reloadClip(stance, moving, item)), table) : null;
}

/**
 * The period a reload's mover hold runs over (`Walker.hold`'s `period`, research 150 F2 and review F-A), from the
 * reload's clip family and its seconds (`reloadSeconds`): the game's hold is the clip `FUN_005a82e0` pushed (D:L462928)
 * at the speed it set (D:L462935-462941), its phase read against that clip's own `NoInterrupt` (`FUN_00550ef0`
 * D:L418176-418203, `FUN_00587c20` D:L445549-445565). The mover's hold (`./mover` `reloadHold`) is the rifle's or the
 * pistol's crouched or prone clip, so the seconds are the hold's own only for those two families (or no family named:
 * the item's). The shotgun reload, the pump and `Rifle m203 reload` are other clips, with no `NoInterrupt` on the disc;
 * *since B-18* (research 150 §5, "B-18") the page lays no hold for them (`reloadHolds`), so this answers undefined for
 * them only for a caller that still lays one (the room's `holdPeriod` from a stale page's command, the Xbox prototype's
 * runtime -- `./xboxPrototype/combatRuntime` keeps the stand-in hold because that fork is FROZEN by the owner's ruling of
 * 2026-11-21: no new features; its techniques fold into the standard engine and the fork is retired). The game scales whichever clip it pushed by its record's `ReloadTime` (D:L462935-462941, no family test).
 * One derivation for the page (on `Fire`'s event) and the room (`room.ts`'s `holdPeriod`), which knows no after-shot or
 * round mode: on every disc record the two agree (`reloadRun.test.ts`) because no after-shot record and no carrier has
 * a `ReloadTime`.
 */
export function reloadHoldPeriod(family: ReloadItem | undefined, seconds: number | null | undefined): number | undefined {
  if (family !== undefined && family !== 'rifle' && family !== 'pistol') return undefined;
  return seconds !== null && seconds !== undefined && seconds > 0 ? seconds : undefined;
}

/**
 * B-18 (research 150 §5, "B-18"; reading, reviewed 2026-11-21 by a second reader; capture owed): whether a reload's or an
 * after-shot's clip of `family` holds the mover (`./walk` `WalkMode.holdReload`) -- the rifle's and the pistol's (and no
 * family named: the item's), whose crouched and prone clips the mover's hold IS (`./mover` `reloadHold`, its
 * `NoInterrupt` and `playback` the pushed clip's own). The shotgun reload (the 870, and the bolt snipers 101-103's
 * after-shot), the pump and `Rifle m203 reload` hold none: their still clips carry no `NoInterrupt` (`motion.rdr`; an
 * absent key loads as 0, D:L131431-131434), so the first move or turn axis past 0.1 cuts them from the driver's next
 * frame (`FUN_00550ef0` D:L418174-418203, `FUN_00587c20` D:L445550-445556), and while they run untouched the stance
 * request waits on their still clip's life instead (`StillReloadLife` / the room's `reloadLife`, asked as
 * `Walker.oneShotOnTop`; `FUN_00552ec0` D:L418927-418930). Was: the rifle's `seal_prone_reload` / `seal_crouch_reload`
 * laid as a stand-in (H77), which no stick could cut for its `NoInterrupt` 0.5 / 0.35 of another clip. No wire change:
 * the hold codes (`HOLD_CODES`) are untouched; the page simply sends none for these families.
 */
export function reloadHolds(family: ReloadItem | undefined): boolean {
  return family === undefined || family === 'rifle' || family === 'pistol';
}

/**
 * BOLT_POP_TRANSITION_READING (B-18; research 150 §6; reading, reviewed 2026-11-21 by a second reader, not built): the
 * original pops an in-flight stance transition when a still reload or after-shot clip is pushed -- `FUN_005a82e0`, still
 * and with the stance word equal to the stack's posture, calls `FUN_0058a4d0(actor, 0)` first (D:L462924-462927), which
 * pops every entry above the base Stand / Crouch / Prone (D:L446753-446781), so a drop (0x19, 0x13) under way is cut short
 * into the clip, and a crouch the drop refused (D:L418953) waits only for the clip. The port lets the drop run on under
 * the clip's life: building it needs the room's mover to end its drop on the same command (`room.ts` `lockLife` /
 * `watchCut`, the after-shot's clip life), so both movers stay one. Settled by building that pair, and measured by the
 * capture of research 150 §5's "B-18" run C (a prone press 0.1 s after the shot: the top at 0.5 s is the clip, one above
 * the base, not 0x19).
 */
export const BOLT_POP_TRANSITION_READING = 'not built: the drop runs on under the clip' as const;

/**
 * AFTER_SHOT_DIVE_FIRE_LOCK_READING (B-18, the review of 0b122c4034's F-doc 3; research 150 §6; reading, pending review):
 * the fire lock past the kit's timer is the pushed clip's. `FUN_005a7ab0` answers "held" while the kit's timer runs
 * (`FUN_005c2400`, `kit+0x820 > 0`: D:L462522, D:L477159), else only while the top of the stack or any entry on it is one
 * of the reload and after-shot types `FUN_005a82e0` pushes (D:L462524-462544 against D:L462838-462916), or the second
 * channel plays one of the two moving reload types (D:L462548-462555, set at D:L418209, D:L418220). Under a
 * `dive_to_prone` top no clip is pushed (D:L469334-469335), so the original's after-shot fire lock ends at the timer's
 * end. **Built for the firearm's own after-shot** (a bolt's, a pump's; B-18 F1): the room picks the clip at the timer's
 * end (`room.ts` `afterShotPick`, its dive test with it) and the page ends its lock there (`Fire.beginAfterShot`).
 * **Not built for a round mode** (the M203's `Rifle m203 reload` after-shot): the room's launch path still picks the clip
 * and sets its lock at the round (`room.ts`'s round-mode `setLock` / `lockLife`), and the page keeps the clip's length
 * there too, so the two agree with each other, not the original. Settled by the same pick on the round-mode path;
 * measured by research 150 §5's "B-18" run F (a round pressed between the timer's end and the clip's length).
 */
export const AFTER_SHOT_DIVE_FIRE_LOCK_READING = "not built for a round mode: the M203 after-shot's lock runs on under the dive" as const;

/**
 * AFTER_SHOT_REFUSED_STATES_READING (the review of the B-18 folds, 1a; research 150 §6; reading, pending review):
 * `FUN_005b4340` also refuses the after-shot push (no clip, the lock ending at the timer) in body states 8 (D:L469321),
 * 9 and 10 (D:L469409), state 5 or a type-5 top (D:L469329), state 4 or a type-4 top, the climb or hang
 * (D:L469460-469462), and the tops at D:L469420-469447. The port models only the dive (`AFTER_SHOT_DIVE_FIRE_LOCK_READING`).
 * Page and room agree with each other here, not with the original. Settled by modelling those states, or by a capture of a
 * bolt shot followed by a climb within 0.5 s.
 */
export const AFTER_SHOT_REFUSED_STATES_READING = 'body states 8-10, state 5, state 4 (climb/hang), tops L469420-469447: not modelled' as const;

/**
 * PF-18 (research 150 §3.4, §3.7; 218 §2): the family's moving overlay's life -- `Moving rifle reload` (`seal_mv_reload`,
 * the m203's too) or `Moving pistol reload` (`seal_p_mv_reload`) -- from its first key to its last: playback x (n-1)/n
 * (`FUN_0028d170` D:L134703-134737 frees the node at t / (length x (n-1)/n) >= 1). `seal_mv_reload`, 33 keys at 1.2:
 * 1.164 s. Null without the clip.
 */
export function overlayLifeSeconds(family: ReloadItem, clips: ReloadClipSource | null, table: MotionTable | null): number | null {
  const clip = clips ? clipNamed(clips, reloadClip('stand', true, family)) : undefined;
  const playback = reloadLength(clip, table);
  if (!clip || playback === null) return null;
  const n = clip.frameCount;
  return n < 2 ? playback : playback * ((n - 1) / n);
}

/**
 * The weapon's lock for a reload or an after-shot clip: `reloadSeconds` (the record's `ReloadTime`, still, needs no
 * clip), else `RELOAD_SECONDS_PLACEHOLDER` -- only a source without the clips (a server started without `MOTION_P.ZAR`).
 */
export function reloadLockSeconds(clips: ReloadClipSource | null, table: MotionTable | null, stance: ReloadStance, moving: boolean,
  item: ReloadItem = 'rifle', reloadTime = 0): number {
  return reloadSeconds(clips, table, stance, moving, item, reloadTime) ?? RELOAD_SECONDS_PLACEHOLDER;
}
