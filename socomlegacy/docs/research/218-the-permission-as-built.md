# 218 -- The permission as built (web sprint 28, PF-17, PF-18, PF-19)

- Date: 2026-10-05 (web sprint 28). PF-17: `motion.rdr`'s `NoFire` read into the motion table and judged at the
  command the round names, on the page and in the room (ruling PF.R36); PF-18: the flinch as room state and the
  reload's lock as the clip's life (ruling PF.R37, s2); PF-19 adds its section (s3) and its rows of s4 and s5.
- Status: **reading, pending review.** Every value below is a read of the decompilation (`D:L<n>` of
  `socom2_game.elf.decomp.c` r0001) or of the disc's `motion.rdr`, as research 194 A02 gives it and as reread here;
  nothing here is a capture. Research 194 grades its comparator from an executed retail instruction (`scalar.txt`); under
  AGENTS.md a source read is a reading until reviewed (research 206).
- Sources: research [194](194-w2-a-combat-actor-gaps.md) s3 (A02: the loader, the consumer, the comparator, the disc's
  fields) and s4 (A03, PF-18's); [179](179-c1-match-server.md) s11.15 (the launcher raise's `NoFire`) and s11.9 (prone
  cover's, PF-19's); [86](86-traversal.md) (the hang is actor state 4, the ladder 5); [206](206-verification-overrides-and-the-waves-close.md)
  s1 (no override touches these).
- Code: `packages/viewer/src/net/fireCapability.ts` (new: `motionOf`, `fireAllowed`, `fireCapability`),
  `packages/viewer/src/motionTable.ts` (`MotionEntry.noFire`), `packages/viewer/src/traversal.ts` (`Traversal.clip`,
  `NOFIRE_STATE_READING`), `packages/viewer/src/mover.ts` (`TraversalHooks.clip`), `packages/viewer/src/net/shotCone.ts`
  (`AimMover.motion`/`fire`, `AimFrame.motion`/`fire`), `packages/match/src/room.ts` (`aim()` records, `fire()` refuses
  `'nofire'`), `packages/viewer/src/walk.ts` (`WalkMode.fireAllowed`, `setMotionTable`), `packages/viewer/src/play.ts`
  (hands the table over). Tests: `motionTable.test.ts`, `fireCapability.test.ts`, `walk.test.ts`, `play.test.ts`,
  `match/test/roomCapability.test.ts`; the gate rows in the shared `viewer/test/helpers/gateTable.ts` (`bodyGates`/`roomGates`).

## 1. `NoFire` and the capability at the command (PF-17)

### 1.1 The field

`FUN_00287620`, the `motion.rdr` loader, reads the key `NoFire` (string at ELF 0x3ef9f8) into the motion's `+0x2c`
(D:L131397-131429): absent 0, bare `NoFire ()` 1.0, a number the float. The port's `readMotionTable` keeps the
distinction as `NoInterrupt`'s: `noFire` null when absent, 1 when bare, else the number. The tracked fixture's
`motion.rdr` (`test-fixtures/RUN/READERC.ZAR`) pins research 194 A02's table (`motionTable.test.ts`):

| clip | `NoFire` |
|---|---|
| `seal_stand2prone`, `seal_p_stand2prone` | bare (1) |
| `seal_crouch2prone` | 0.8 |
| `seal_land_hard`, `seal_p_land_hard` | 0.3 |
| `seal_hang`, `seal_hang2climbup`, `seal_ladder2slide`, `seal_ladderslide`, `seal_ladderslide_land` | bare |
| `seal_place_claymore` | bare |
| `seal_rifle2launcher`, `seal_pistol2launcher` | bare (179 s11.15) |
| `seal_getupforward01`, `seal_getupbackwards01` | 0.8 |
| `seal_runningjump_launch`, `seal_p_runningjump_launch` | 0.2 |
| `seal_jump`, `seal_land_soft`, `seal_stand2crouch`, the six short multiplayer flinches | absent |

The whole file holds 175 records with the key (a probe of the fixture, 2026-10-05); beside these, every reload, pump, swap, binocular, climb,
ladder and hang clip is bare, and the running jump's launch reads 0.2 (above).

### 1.2 The consumer and the comparator

`FUN_005c0ae0` asks `FUN_005a7de0(actor, 1, phaseTest)` before a round (D:L476375-476378, 476442-476444); `phaseTest` is
1 unless the item's class is 0x79 or 0x97 (`FUN_003d1e10`, D:L476375-476377). `FUN_005a7de0`:

1. takes only actor states 0, 1, 2, 3 and 6 (`actor+0x174`, D:L462612);
2. refuses the named throw/toss, reload/swap and paired/CQB families (D:L462620-462678: the port's own gates -- the
   swap's clip `'swapping'`, the reload lock, `./grenade`'s hold);
3. further gates (D:L462679-462694), among them the jump and the landings (`FUN_00587f50`, `FUN_00587f10`) for an item
   of class 0x97 only (D:L462687-462692);
4. with `phaseTest`, reads the top stack entry's phase (`+0x1c`) and reverse bit (`+0x28` & 0x20) against each of its
   leaves' `+0x2c` through `FUN_0058a8c0` (D:L462695-462705).

`FUN_0058a8c0` (D:L446897-446915): forward, a round only at **phase > NoFire**; reversed, only at **phase < 1 -
NoFire**. Both strict: `seal_crouch2prone` at 0.8 refuses and at 0.8001 fires; a bare `NoFire` refuses through phase
1 in either direction. The port's `fireAllowed` is that comparator (`fireCapability.test.ts`; mutation `>` to `>=` and
`<` to `<=` each go red).

### 1.3 The phase

`FUN_00587c20` (D:L445553-445570) compares the same `+0x1c` and the same reverse bit with `NoInterrupt` (`+0x30`) in the
same shape. The port already runs that phase for `NoInterrupt` -- `t / (playback x (n - 1) / n)`
(`Walker.actionInterruptible`, `holdCut`) -- so the fire's gate reads the same clock (`NOFIRE_PHASE_READING`), not the
brief's `t / seconds` (the one-shot's run, `oneShotSeconds`, is `n / (n - 1)` shorter: on `seal_crouch2prone` 33 keys,
the boundary moves about a tick). One convention for the whole mover, the one `Walker.clipVelocity` already uses for
the clips' root travel: the run `t / (playback x (n - 1) / n)`, the phase that run forward and `(n - 1) / n - run`
played backwards, held in [0, (n - 1) / n] -- key k at phase k / n either way. A move's clip (`Traversal.clip`) is on
the same convention: its key over the key count n (`Traversal`'s key already runs from the end backwards), a loop's
within its cycle. (The fix round of 2026-10-05 aligned two earlier conventions: the reverse phase had been `1 - run`,
running 1 down to 1/n, which put prone -> crouch's cut-off 1/n of the run later -- (1/33) x 0.873 s = 26 ms, 1.59
ticks: its first open command was the clip's 42nd, now its 41st; and the moves' had been key / (n - 1). No move's clip carries a
numeric `NoFire` today, so the moves' change moves no boundary.)

### 1.4 What the port reads (`motionOf`)

The top of the body's stack, one clip (`NOFIRE_LEAF_AGGREGATE_READING = 'top'`): a move holding the mover (its clip and
its actor state, `TraversalHooks.clip`), else the kit's hold (a throw, the claymore, a still reload), else the mover's
action (a jump, a landing, a stance change, a get-up, a swap; the sidearm's version of its clip with the pistol in hand,
`PISTOL_ANIMS`), else the peek's lean (state 3: it fires). The moves whose actor state is 4 (the hang) or 5 (the ladder)
refuse whatever their clip (`NOFIRE_STATE_READING`): only `seal_180` among their clips carries no `NoFire`, so the state
is what refuses the "180" and a mover without the table. The upper-body overlay (the moving swap, the moving reloads) is
not read: the swap's own gate and the reload lock already refuse there.

No blanket airborne or any-action lock: the standing jump, the fall, the soft landing and the flinches carry no
`NoFire` and fire throughout (the flinch is not a mover action in the port; PF-18 makes it room state for the reload
only). The running jump's launch carries its own: `seal_runningjump_launch` and `seal_p_runningjump_launch` read 0.2, so
a running jump refuses rounds for its first 0.2 x 2.4 x 24/25 = 0.461 s (the launch's tick 27), in the air or not --
the clip's `NoFire`, not the air (`fireCapability.test.ts`). A motion without `NoFire` is open, phase 0 included
(`NOFIRE_ABSENT_READING`).

**For PF-18 (the reload's lock overlaps this gate).** The kit's still crouched and prone reload holds
(`seal_crouch_reload`, `seal_p_crouch_reload`, `seal_prone_reload`, `seal_p_prone_reload`) carry a bare `NoFire`: once
the reload's own lock ends, the rest of a still reload hold that has not been cut is refused `'nofire'` here, on the
page and in the room alike. That is the original's (`FUN_005a7de0` reads the top clip's `NoFire` whatever the reload
lock says); PF-18's lock that follows the clip's life makes the two agree.

### 1.5 At the command (PF.R36)

The room's `aim()` runs `fireCapability` on its own mover after each command and records `motion` and `fire` in the
command's `AimFrame` (`ShotCone.tick`); `fire()` refuses a round `'nofire'` against the frame of the command it names,
right after `'swapping'`, before any round is spent -- never against the body's present (`roomCapability.test.ts`: a
round named before stand -> prone and arriving inside it is taken; one named under crouch -> prone's 0.8 and arriving
past it is refused). The page's `WalkMode.fireAllowed()` asks the same function of its own mover after its last tick
(the command its round is tagged with), with the table `Play` hands over beside the action roots. Its one-line hook into
`Fire.source.ready` is in `main.ts` (held; the controller's wiring at the merge): until then the page sends a round the
room drops `'nofire'`. *Wired (sprint 28 wave 4, 2026-10-06): on the round-only hook, `fireRefused: (): boolean => fireRefused(zoom.state()) ||
!walk.fireAllowed()` -- not `Fire.source.ready`, which the reload reads too: NoFire gates the round (`FUN_005a7de0`), never
the reload (`FUN_005a7ab0`; the room's `reload()` has none), so R then prone keeps its reload (`fire.test.ts`).*

Not built: the class 0x79/0x97 selector (`NOFIRE_EQUIPMENT_CLASS_READING`: the throwables' and charges' own gates exist
in `./grenade` and `./equipment`; no firearm is of those classes) and the class 0x97 jump/landing refusal of s1.2 item 3.

## 2. The flinch state and the reload lock (PF-18)

Ruling PF.R37. Code: `packages/viewer/src/reloadLock.ts` (new: `CARRIES_ON`, `carriesOn`, `reloadCutOf`,
`reloadLifeSpec`, `reloadPhase`, `reloadCutAt`, `carriedLockSeconds`, `RELOAD_CUT_MARGIN_TICKS`),
`packages/viewer/src/reloadClip.ts` (`overlayLifeSeconds`), `packages/viewer/src/weaponPose.ts` (`takeReloadCut`),
`packages/viewer/src/play.ts` (`Play.takeReloadCut`; `reloadCut` now `reloadCutOf`), `packages/viewer/src/fire.ts`
(`FireSource.flinching`, `FireSource.reloadCut`), `packages/viewer/src/walk.ts` (`WalkMode.flinching`),
`packages/match/src/room.ts` (`Player.flinchFrom`/`flinchUntil`, `flinchState`, `reload()`'s `'flinch'` drop;
`Player.reloadLife`/`cutLog`, `lockLife`, `watchCut`, `cutAt`). Tests: `reloadRun.test.ts` (the `it.fails` of research
150 §5 is now an `it`), `fire.test.ts`, `central/test/roomReloadLock.test.ts`, the gate rows of §4.

### 2.1 The flinch is room state

`FUN_005a2690` sets the flinch's motion flags 0x4 and 0x2 (D:L460018-460025); `FUN_005b4340(actor, 3)` refuses when the
top motion carries 0x4 (D:L469494-469504); the reload's start `FUN_005c2a90` (D:L477394-477407) and its clip's choice
`FUN_005a82e0` (D:L462814-462819) both ask it (research 194 A03; 179 §11.5). So the room keeps the flinch it tells every
page (`Room.flinch`): `flinchState` holds it from the victim's next command for the clip's `motion.rdr` playback (the
page's `flinchPose` length: the standing flinches 0.8 s, 48 commands; the crouched and prone 0.4 s), on the victim's
commands' seqs (the `reload` event names one), whole commands up; a reload named at a command inside it is dropped
`dropped('reload', 'flinch')` before any magazine moves. The `flinch` event carries the window, `from` (the first seq
inside) and `until` (the first past) -- optional JSON fields, additive under protocol 10 (PF.R33), absent when no window
is held. A death (`kill`), a respawn and a new round (`spawn`) clear it;
the dead are never flinched. Without `motion.rdr` the room holds no flinch -- no length is guessed.

A round is not refused: the six short flinches carry no `NoFire` (§1.1; 194 A02), and mask 0x4 is not "all input
blocked" (`FUN_00577ea0` D:L437462-437467 reads it for the pose's composition). The page mirrors the gate:
`WalkMode.flinching()` is true while the clock `netPage.ts` hands `setFlinchPose` is inside the clip's playback, whether
or not the walk still draws the pose (a mover action over it drops the drawing, FLINCH_GATE_READING, not the state);
`Fire.beginReload` refuses while `source.flinching()` answers (the ask spent, as the binoculars' refusal).

**The round trip (the review of 21ebcf61).** The room's window starts at the hit, on the room's view of the victim's
commands; the victim's page learns of the flinch only when its `flinch` event arrives, about a round trip later. A reload
the page began in between (fresh magazine in, lock running) was dropped by the room, which kept the old magazine, and
nothing else on the wire reconciles the two: once the room's magazine ran out, every round the page fired would be
dropped `'reload or empty'` until the page's next reload. So the page undoes it: when its own `flinch` event arrives,
`reloadInFlinch(seq, ev)` (`viewer/src/net/flinchReload.ts`) asks whether the page's last reload was sent with a seq
inside the event's window, and if so `Fire.undoReload()` puts the ring back as it was before that reload began
(`MagazineRing.restore`) and drops its lock (`reloadEnd`, not completed: the pose stops its clip) -- the page's magazine
and lock are then the room's (`fire.test.ts`, `roomReloadLock.test.ts`: both magazines equal after the drop and the
undo). The undo applies only while that reload's lock still runs (a round fired after it would have come from the undone
magazine); a round trip longer than the lock (1.15 s after a cut, 1.6 s uncut) leaves the two apart as before. The
existing `refused` event was not used: it means a refused connection to the page (`netPage.ts` stops reconnecting on
it).

**Wiring owed** (held files, the controller's): in `main.ts`'s `Fire` source, `flinching: (): boolean =>
walk.flinching()` and `reloadCut: () => play.takeReloadCut()` (s2.2); in `netPage.ts`, the seq a reload is sent with
kept (`fireEvent`'s `reloadStart` branch: `const seq = this.client.lastSeq(); this.client.send({ type: 'reload', seq });
this.reloadSeq = seq;`, with a `private reloadSeq: number | null = null`) and the own-flinch branch's undo (`if
(reloadInFlinch(this.reloadSeq, ev)) this.deps.undoReload?.();`), a `NetPageDeps` member `undoReload?(): void`, and
`main.ts`'s deps `undoReload: () => { fire.undoReload(); }`. Until they are wired, the page neither refuses a reload in a
flinch nor undoes one: the divergence above stands for a reload pressed during a flinch. *Wired (sprint 28 wave 4,
2026-10-06): all of the above, as written; `netPageGame.test.ts` pins the undo (a window covering the reload's seq).*

Not built (`FLINCH_INTERRUPT_READING`, note only; *2026-10-12, PAR-58: mask 0x2 since read -- it refuses stab, CQB
and restraint, research 179 §11.5 -- and the uncut flinch's end built at its last key, research 230 §5.2; the stick's
cut read, not built: research 101's row; 2026-10-12, PAR-60: the stick's cut built, room and page, research 230
§5.2.1; 2026-10-12, PAR-65: a flinch pushed in the air read and built -- it replaces the fall's action, the fall covers
it, a clipless landing hands it back whole, research 230 §5.2.4*): mask 0x2's role and the flinch's interruption and stacking (a move,
a stance change, a scope, a ladder over it; a second hit) -- owed a capture (194 A03). The room's flinch starts when the
shooter's round is decided, on the victim's clock as it stands then; the victim's own page starts it when the `flinch`
event arrives, about a round trip later, so a reload the victim pressed in between is refused by the room only.

### 2.2 The reload's lock is the clip's life

`FUN_005a7ab0` (D:L462512-462560) answers while the stack's top (D:L462526-462531) or any entry (`FUN_0058a470`,
D:L462532-462544) is one of the fourteen reload and pump types, or while the overlay record's node is `Moving rifle
reload` / `Moving pistol reload` (D:L462548-462555; research 150 §3.7). With the cut of research 150 §3.3 (`FUN_00550ef0`
D:L418182-418225: the ground state's stick or the turn past 0.1, once past the clip's `NoInterrupt`) and the overlay's
clock (§3.4: its clock set to the still clip's phase x its life, D:L418213; freed at its last key, `FUN_0028d170`
D:L134737), the fire's lock after a cut is (`reloadCutAt`, `RELOAD_LOCK_CARRY_READING`):

| the cut clip | the lock after the cut | the values |
|---|---|---|
| the rifle's, the pistol's, the m203's, standing or crouched (`CARRIES_ON`) | the overlay's life x (1 - the still clip's phase) | `seal_mv_reload` 33 keys, playback 1.2: life 1.2 x 32/33 = 1.164 s (`overlayLifeSeconds`); `seal_p_mv_reload` 21 keys, 1.2: 1.143 s |
| prone (any family), the shotgun reload, the pump | none: the lock ends at the cut | the magazine was refilled at the start (research 84 §18) |

So a standing reload (`seal_reload`, 45 keys, 1.6, no `NoInterrupt`) cut on its first tick holds the fire 1.151 s more
(1.164 x (1 - (1/60) / (1.6 x 44/45))), not to 1.6; a crouched one (`seal_crouch_reload`, 28 keys, 1.9, `NoInterrupt`
0.35) is first cut 0.65 s in (phase 0.355 on the stack's clock t / (1.9 x 27/28); research 150 §3.7's "0.665 + 0.65 x
1.164" is the same on the playback's clock) and holds 0.751 s more: the lock ends 1.40 s in, not 1.9. Uncut, and for a
reload started moving (the overlay from its first key, never cut), the lock is the start's length as before
(`reloadSeconds`; not the clip's last key -- the still clip's 1.6 x (44/45)^2 = 1.530 s, the overlay's 1.164 -- a
difference this task leaves, below).

**The room runs its own cut.** After each command (`run`, after `aim`), `watchCut` reads `reloadCutOf` on the room's
mover (its ground state's stick and the command's turn: the body the page's pose reads, `Play.reloadCut`) and logs it
(`cutLog`); a lock just set (`reload()`, a bolt's or a pump's after-shot in `fire()`, a launcher round's in the round
mode) gets its life (`lockLife`: the still clip's keys, `NoInterrupt`, its seconds, the overlay's life), its clip's first
command the lock's timer end (`lockTimer`), and asks the logged commands since (a reload is decided once the command
after it has run) and every later one (`cutAt`). On a cut the lock (`reloadUntil`, on the command clock) ends at the
cut's command + the life left in whole commands up, `lockClock` (the room's clock) shifted by the same; never later
than it was. A standing reload cut by the stick on the command after the reload's (the ramped stick, `throttleStep`,
passes 0.1 there) ends 70 commands after the cut (`roomReloadLock.test.ts`).

**The page never fires into the room's refusal** (research 127). `Fire` takes the cut from the pose
(`WeaponPose.takeReloadCut`, which computes the same life left with the same `carriedLockSeconds`; `Play.takeReloadCut`;
`FireSource.reloadCut`), applied after this frame's decrement, plus `RELOAD_CUT_MARGIN_TICKS` (one game tick): the
pose's layer follows the mover one tick behind at most (research 150 §4) and the room rounds up, so the page's lock ends
no earlier than the room's for the same cut. The hook is in `main.ts` (held): until it is wired the page keeps the
start's length -- later than the room, never earlier.

**PF-17's gate and this lock overlap** (§1.4). `fire()` refuses the lock first (`'reload or empty'`), the playing
motion's `NoFire` after (`'nofire'`). The still crouched and prone holds carry a bare `NoFire`; while the hold's clip and
the lock's clip are the same (the rifle's and the pistol's) the hold ends before the lock (the hold runs
`oneShotSeconds`, period x ((n-1)/n)^2; the lock the period) and a cut ends both, so only `'reload or empty'` is ever
seen. Under the stand-in hold (`RELOAD_STANDIN_HOLD_READING`: a crouched or prone shotgun reload, pump or `Rifle m203
reload` holds the mover on the rifle's clip, research 150 §5 owed (1), held for the owner, HUMAN_TASKS H77) the lock is
the family's own clip, which can end first: the 870's crouched reload locks 1.6 s (`seal_crouch_reload_shotgun`) while
its stand-in hold runs 1.767 s, and the rounds between are refused `'nofire'`, on the page (`WalkMode.fireAllowed`) and
in the room alike (`roomReloadLock.test.ts`).

**What the owner will see change** (HUMAN_TASKS H77; his "notable differences" are undescribed, so this is what changes,
not what he saw): a reload cut by the stick or the turn lets the rifle fire again sooner -- standing cut at once about
1.17 s after the reload starts instead of 1.6 s; crouched, about 1.40 s instead of 1.9 s; the pistol's likewise on
`seal_p_mv_reload` (1.143 s); a prone reload, the shotgun reload (the 870 and the bolt rifles) and the pump free the
fire the moment the crawl or the stick cuts them. The rifle comes back up as the overlay's arms finish, where before it
stayed down for the rest of the still clip's length. A flinching SEAL can no longer start a reload until the flinch's
clip has played (0.8 s standing, 0.4 s crouched or prone); its rounds are unchanged. A reload pressed in the first
moment after the hit, before the page has heard of the flinch (about a round trip), starts on screen -- the sound, the
clip, the fresh magazine in the ammo box -- and is then taken back when the flinch arrives: the clip stops and the ammo
box shows the old magazine again. That take-back is the port's (the original's victim console knows of its own flinch at
once), the price of the room deciding the hit. Nothing else moves: the stand-in
holds stay (H77), the clips, their blends and the cut's rule are research 150's.

Not built: the uncut lock as the clip's last key (*since PARITY-2 PAR-67 / PAR-69, research 251 §12.5, the uncut end
is the clip's pop, a frame and a half-step past the push's clock -- the 93rd command for `seal_reload`, not its last key;
this row's end is that pop*) (above: 1.530 s for an uncut standing reload, 1.164 s for one started
moving, against `reloadSeconds`' 1.6 and 1.2 -- the lock still ends 0.07 s and 0.04 s late; a later task's, with
`reloadSeconds`' callers); the respawn replay's null `holdPeriod` (research 150 §5 owed (3)) unchanged.

## 3. The knock and Prone cover (PF-19)

Ruling PF.R38. Code: `packages/viewer/src/net/blast.ts` (`blastKnock`'s prone branch, `KnockFall` + `'proneCover'`,
`releaseMove`, `applyKnock`'s order, `KNOCK_LADDER_STATE_READING`, `KNOCK_SWAP_COMPLETE_READING`,
`KNOCK_LETHAL_IN_MOVE_READING`, `KNOCK_COVER_RELOAD_READING`), `packages/viewer/src/mover.ts` (`ACTION_CLIPS.proneCover`,
`MoverActionName`, `Walker.knock` takes `'proneCover'`, `Walker.completeSwap`, the root-motion list of the tick),
`packages/viewer/src/locomotion.ts` (`SEAL_ANIMS.proneCover`), `packages/viewer/src/net/protocol.ts` (`ACTION_CODES`
+ `'proneCover'` appended, the `blast` event's `knock.fall`), `packages/viewer/src/net/fireCapability.ts` (the action's
clip), `packages/viewer/src/walk.ts` (`WalkMode.knockCovered`), `packages/match/src/room.ts` (`Room.layKnock`, `blast()`
through it, `kill()` through `releaseMove`, `reload()`'s `'proneCover'` drop). Tests: `netBlast.test.ts` (PF-19's
describe and the fixture's), `knock.test.ts`, `netCodec.test.ts`, `locomotion.test.ts` (`ACTION_CLIPS` on the fixture),
`central/test/roomKnock.test.ts` (new), the gate rows of §4.

### 3.1 The order

`FUN_0057e770` (D:L440981-441027; research 194 A04, 179 §11.7) has **no state gate**: it knocks any SEAL inside the
radius or dead, prone aside. Before the reaction it releases the paired state of a Stab / restraint in progress
(`FUN_0057ee00` D:L441131-441189: none online, A05), completes a pending weapon or launcher switch (`FUN_005a5da0`
D:L461653-461756), leaves a turret (`FUN_00545ee0(actor, 1)` D:L411941-412032, ".RELEASE_TURRET"), pops the motion stack
to its base (`FUN_0058a4d0(actor, 0)`) and releases `+0x1062` (`FUN_0059d750`); then the alive / dead / prone reaction,
the fall played in the actor's state (or 8 dead, `FUN_005807d0` D:L442059-442135). The port builds it as one ordered
operation on both ends:

1. **The turret** (the room only: the page holds no occupant of its own): `Room.layKnock` releases a mounted body's
   turret first -- the `turret` event, the occupant freed, every page told -- as `kill()` does (MAP-10b's precedent).
   PF.R31 refuses a mounted body's own events, not the room's knock.
2. **The move** (`releaseMove`, `applyKnock`): a ladder, a hang, a climb, a dive or the 180 let go -- `Room.kill`'s lines,
   now one function both call -- into the air from where the SEAL is (`KNOCK_LADDER_STATE_READING = 'released'`); for
   `Prone cover` on the floor where it is (`Traversal.reset(walker)`). No move, nothing touched: the held lean stays the
   page's and the room's alike (each command re-reads it in the room; the page's walk keeps its own).
3. **The swap** (`Walker.completeSwap`): the swap's clip off the mover; the page's kit ends its swap at the target on its
   next frame (`Kit.frame`: the clip over, the swap with it), the room's weapon was the target from the swap's start
   (`MoverSim`) -- `KNOCK_SWAP_COMPLETE_READING = 'completed'`, the hand-off forced. The fall would have replaced the
   swap's clip anyway (`Walker.knock` drops the overlay and starts its own action); `completeSwap` names the step.
4. **The reaction** (`Walker.knock`): standing or crouched, the fall at the push (unchanged); alive and prone, `Prone cover`.

One reaction event a knock: the room's `blast` event (`roomKnock.test.ts` counts it). The kit's hold (a throw, the
claymore's placing, a still reload) ends with the reaction, as before (`Walker.knock`). The priority among overlapping
actions beyond this order (a throw or a reload under the blast) is not read: a capture gate (194 A04, the dispatch's §14).

### 3.2 Prone cover

Alive and prone (D:L441018-441020), the game pushes `Prone cover` (`DAT_003dece0`) in the actor's state with motion bit 0x2
and sends it to the others as kind 0x22 code 0x10 (D:L441027). `GLOBAL` maps it to `guard_prone_cover` (179 §11.9; the
Seal anim set includes `GLOBAL`): `MOTION_P.ZAR` 16 keys, `motion.rdr` playback 4.3, `NoPitchtwist`, `NoInterrupt ()`,
`NoFire ()`, `Normalize` -- pinned on the tracked fixture (`netBlast.test.ts`, "guard_prone_cover in the fixture: ...";
`locomotion.test.ts`'s `ACTION_CLIPS` test). The port:

- `blastKnock` answers `{ velocity: [0, 0, 0], fall: 'proneCover' }` for a living prone SEAL inside the radius (dead: null,
  the BODY list's prone death clip, unchanged; outside the radius: null);
- `Walker.knock(.., 'proneCover')` starts the mover action `proneCover` (`ACTION_CLIPS.proneCover`: 4.3, 16 keys, NoInterrupt
  1, root travel from the pack) for `ACTION_SECONDS.proneCover` = 4.3 x (15/16)^2 = 3.779 s on the floor in its stance: the
  stick never cuts it (bare `NoInterrupt`), the clip's own root moves the body (`FUN_0028c250`, as the other actions), the
  ground state does not run; at its end the prone ground state again;
- on the wire it is an action code like the falls: `'proneCover'` **appended** to `ACTION_CODES` (code 20, PF.R38; an older
  page indexes past its table and draws nothing), the `blast` event's `knock.fall` carries it (JSON, additive); the others'
  bodies play `SEAL_ANIMS[name]` = `guard_prone_cover` (`./animator`), which the page asks the pack for with the plays'
  clips (`MOTION_CLIPS` from `SEAL_ANIMS`): no change to `main.ts`'s clip list;
- **the round** is refused by the clip's own `NoFire ()` (PF-17: `fireCapability` reads the action's clip, `'nofire'` in
  the room, `WalkMode.fireAllowed()` on the page);
- **the reload** is refused in the room (`'proneCover'`, before any magazine moves) and by `WalkMode.knockCovered()` on the
  page -- `KNOCK_COVER_RELOAD_READING = 'refused'`: the reload's gates as read (`FUN_005c2a90`: `FUN_005a7ab0` and
  `FUN_005b4340(actor, 3)` on motion bit 0x4, §2.1) do not name it -- `Prone cover` carries bit 0x2 -- so this is the port's
  reading of a `NoInterrupt ()` clip on top of the stack; owed a capture.

Which gate refuses when, with PF-17 and PF-18: inside a flinch the reload is refused `'flinch'` and the round taken (§2);
inside `Prone cover` the round is refused `'nofire'` and the reload `'proneCover'`; a blast never flinches (cause 4,
D:L461402), so the two windows meet only when a round's flinch came first -- each drop names its own gate, flinch first.

`PRONE_COVER_CAMERA_READING` (note only): what the camera does through the 3.78 s is not read; the port's camera follows
the mover as for any action.

### 3.3 The lethal case, unchanged

A blast that kills lays its knock as before (the corpse thrown, D:L441001), but **not on a SEAL in a move**: `Room.kill`
releases the move and the corpse falls from where it was (`KNOCK_LETHAL_IN_MOVE_READING = 'kill-releases'`, the task's
scope "nothing changes for the lethal case"; the original throws the dead after the same release -- owed with the ladder's
trace). The dead prone: no cover, the BODY list's prone death clip (`deathClip('blast', ..)`).

**Wiring owed** (held files, the controller's): in `main.ts`'s `Fire` source, the reload gate beside PF-18's
`flinching: (): boolean => walk.flinching()` becomes `flinching: (): boolean => walk.flinching() || walk.knockCovered()`.
Until then the page begins a reload inside `Prone cover` that the room drops (`'proneCover'`), and the two magazines part
as PF-18's §2.1 describes for the flinch. Nothing else: the clip is asked for by `SEAL_ANIMS` (no `main.ts:1515` token), and
`netPage.ts` hands the blast's knock to `WalkMode.knock` as before. *Wired (sprint 28 wave 4, 2026-10-06), as written;
the front end's match (`matchFirearm.ts`, `matchMount.ts`) the same, wave 4's fix round 2.*

**The knock's round trip (wave 4's fix round 2, 2026-10-06).** The room lays the knock after command `after` (the
`blast` event's) and the victim's page lays it when the event arrives, about a round trip later -- PF-18's window, for
the knock. The reload: a page's reload named past `after` is dropped `'proneCover'` by the room, and the page undoes it
when the `blast` event (knock `fall` 'proneCover') arrives (`netPage.ts`, the `reloadSeq` PF-18 keeps;
`netPageGame.test.ts`). The round is **not** undone (owed): a round the page fires in that round trip under the knock
clip's `NoFire` (`Prone cover`'s, §3.2; the falls' clips the same if theirs refuse) is dropped `'nofire'` by the room
before its magazine moves (room.ts `fire`), while the page drew it and spent it -- one round apart until the next
refill or reload. No page undo of a round exists to reuse.

## 4. The shared gate table (PF.R35)

PF-17's rows, folded into PF-15's `viewer/test/helpers/gateTable.ts` (a `GateInput` member `{ kind: 'fire', press, at: { clip, phase } }`,
`weapon?` on the body; `expect: 'refused', why: 'nofire'` -- the runners' title shows the expect, the room runner checks the why):

| row | expect |
|---|---|
| `fire in stand -> prone` | refused (why `nofire`) |
| `fire at crouch -> prone 0.81` | taken |

PF-18's rows (a `GateInput` member `{ kind: 'flinch', then: 'reload' | 'fire', ticks }`: the body flinched by a round that
cost health, `ticks` commands before the press; the page reads `WalkMode.flinching()` for the reload and
`fireAllowed()` for the round, the room drops the reload `'flinch'` with no magazine taken):

| row | expect |
|---|---|
| `reload in a flinch` | refused (why `flinch`) |
| `fire in a flinch` | taken |

PF-19's rows (a `GateInput` member `{ kind: 'knock', from }`: an M67's knock, `gateKnock` -- `blastKnock` at 140 a fragment
from the feet + `from` -- laid after the row's motion by the page's `WalkMode.knock` and the room's `Room.layKnock`, the one
knock path of `blast()`; `knockOutcome` reads the body the tick it lands, and the round's permission over it -- the page's
`fireAllowed()` with `knockCovered()`, the room's next command's `AimFrame.fire`):

| row | expect |
|---|---|
| `knock on a ladder` | released, airborne (the ladder held the body before; after, no move, in the air, in a fall clip) |
| `knock prone alive` | proneCover (on the floor, no speed, no round) |

## 5. Readings and placeholders

| name | where | status |
|---|---|---|
| `NOFIRE_LEAF_AGGREGATE_READING` | viewer `net/fireCapability.ts` | `'top'`: the port plays one clip at a time on the stack and reads it; the original's loop over the top entry's leaves (D:L462695-462705) overwrites its result each leaf (the last leaf's answer stands, not an AND). Owed: the leaf order of a blended top (the crate/medium climb's two nodes) and a capture at a clip boundary |
| `NOFIRE_ABSENT_READING` | viewer `net/fireCapability.ts` | `'open'`: a clip with no `NoFire` (the loader's 0) never refuses; the comparator's strict `phase > 0` refuses only the push's own instant, which the port's landing (pushed after its tick's clock ran) would hold for a whole tick. Owed: a capture of a round at a soft landing's first frame |
| `NOFIRE_STATE_READING` | viewer `traversal.ts` | the ladder moves (state 5) and the hang moves (state 4, research 86) refuse whatever the clip; the climbs onto obstacles and the dive are left to their clips (bare); the peek (state 3) fires. Owed: a read of the state each move writes (`actor+0x174`) or a capture |
| `NOFIRE_PHASE_READING` | viewer `net/fireCapability.ts` | `'stack'`: the phase is the stack's, the run `t / (playback x (n - 1) / n)` forward and `(n - 1) / n - run` backwards (`Walker.clipVelocity`'s convention), as `NoInterrupt`'s (`FUN_00587c20` D:L445553-445570 reads the same `+0x1c`); not `t / seconds`. Owed: a read of `+0x1c`'s writer (`FUN_0028c4f0`) against the one-shot's end |
| `NOFIRE_EQUIPMENT_CLASS_READING` | -- | *note only*: classes 0x79 and 0x97 skip the phase test (`FUN_005c0ae0` D:L476375-476377 passes 0) and 0x97 alone is refused in the jump and the landings (D:L462687-462692); not applied: no firearm is of those classes, the throwables' and charges' gates are their own. Owed: the classes' members |
| `RELOAD_LOCK_CARRY_READING` | viewer `reloadLock.ts` | `'overlay-last-key'` (PF.R37): a cut still clip of the rifle, the pistol or the m203, not prone (`CARRIES_ON`), holds the fire to the carried overlay's last key, its life x (1 - the phase) (`FUN_005a7ab0` D:L462548-462555, `FUN_00550ef0` D:L418205-418225, `FUN_0028d170` D:L134737); the rest end the lock at the cut. Owed: a capture of the original's running reload (H77) |
| `FLINCH_INTERRUPT_READING` | -- | *note only*: mask 0x2's role (`FUN_005a2690` D:L460018-460025) since read -- it refuses stab, CQB and restraint (179 §11.5); the uncut flinch's end built at its last key on the one-shot clock (PAR-58, research 230 §5.2); its interruption (the stick's cut built by PAR-60, research 230 §5.2.1, `FLINCH_CUT_DELAY_READING`; an airborne actor's hold, D:L443049-443052, unread whether reachable -- *read by PAR-65, research 230 §5.2.4: a flinch pushed in the air is covered by the fall, which the hold meets; a clipless landing hands it back whole*) and stacking unread; the port holds the flinch to that end whatever plays over it, and a flinch over an open one keeps the window's start and runs it to the new clip's end (flag 0x4 never cleared between; the second event carries the merged window). Owed: a read and a capture (194 A03) |
| `KNOCK_LADDER_STATE_READING` | viewer `net/blast.ts` | `'released'` (PF.R38): a knock on a SEAL on a ladder, a hang or mid-climb ends the move where it is and lays the knock from there (`releaseMove`, `Room.kill`'s lines; `FUN_0057e770` D:L440981-441027 has no state gate). Owed: a recomp trace of a blast beside a ladder -- whether the fall keeps `actor+0x174` 5 (179 s11.7, 194 A04) |
| `KNOCK_SWAP_COMPLETE_READING` | viewer `net/blast.ts` | `'completed'`: a pending swap is completed at once (`FUN_005a5da0` D:L461653-461756), the swap's clip off the mover (`Walker.completeSwap`), the page's kit ending at its target, the hand-off forced. Owed: a capture of a blast mid-swap |
| `KNOCK_LETHAL_IN_MOVE_READING` | viewer `net/blast.ts` (server) | `'kill-releases'`: a blast that kills a SEAL in a move lays no knock there; `Room.kill` releases the move and the corpse falls from where it was, as before PF-19 (the original throws the dead too, D:L441001, after the same release). Owed: the ladder's recomp trace |
| `KNOCK_COVER_RELOAD_READING` | viewer `net/blast.ts` (server) | `'refused'`: a reload inside `Prone cover` is dropped `'proneCover'` by the room and refused by `WalkMode.knockCovered()` on the page; the reload's gates as read (`FUN_005c2a90`, bit 0x4) do not name bit 0x2 (D:L441018-441020). Owed: a capture of a reload pressed under a blast, prone |
| `PRONE_COVER_CAMERA_READING` | -- | *note only*: what the camera does through `Prone cover`'s 3.78 s is not read; the port's camera follows the mover as for any action. Owed: a capture |
| `RELOAD_STANDIN_HOLD_READING` | -- | *note only*: the crouched and prone shotgun reload, pump and `Rifle m203 reload` hold the mover on the rifle's still clips' `NoInterrupt` and `playback` (research 150 §5 owed (1)), kept at the owner's hold (HUMAN_TASKS H77); under it the lock (the family's clip) can end before the hold, and the rest is refused `'nofire'` (s2.2). Owed: the family's own clip as the hold once H77 is reopened |
