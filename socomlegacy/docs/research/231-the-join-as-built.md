# 231 -- The join as built (web sprint 29, PF-28 / PF-27)

- Date: 2026-10-06 (web sprint 29). PF-28: a page joining (or rejoining) a room mid-round is told what the event stream
  cannot rebuild for it -- the projectiles and charges with stable ids, the standing result with the room tick it was
  sent at, the corpses with their clip and age, the ghosts -- in one versioned member of the welcome, laid once and
  silently. Section 5 is PF-27's (the abandon), written with its hunk by the controller's wave 4.
- Status: **reading, pending review.** The original's side is read from the decompilation (`D:L<n>` of
  `socom2_game.elf.decomp.c` r0001) as research 195 s4-s6 gives it; the envelope, its clock and its ages are a browser
  design (the original replicates no fuse age and no death time). Nothing here is a capture: the original's late-join
  look -- which result panel, the corpse's pose and fade, the smoke's phase -- is capture B's (owner list 5).
- Sources: research [195](195-w2-b-multiplayer-integration.md) s4 (W2-B-03, projectile identity), s5 (W2-B-04, the
  round's state), s6 (W2-B-05, the corpse); [198](198-wave-2-review-and-implementation-plan.md) s4.2 item 2 and s4.4
  (the acceptance rows); [221](221-the-load-barrier.md) s6 (`welcome.phase`); [209](209-the-mutable-world.md) s11 (the
  welcome's world laid silently, `JOIN_SILENT_READING`); [91](91-the-round.md) s12 (the ghost); [219](219-the-bullet-as-built.md)
  s1.2 (`DEPARTED_OWNER_FF_READING`). Ruling PF.R47 (the controller, 2026-10-06).
- Code: `packages/viewer/src/net/protocol.ts` (`JoinWire`, `JOIN_STATE_VERSION`, `JOIN_CLOCK_UNIT`, `welcome.join?`,
  `grenade.pid?`); `packages/match/src/joinState.ts` (new: `joinWire`); `packages/match/src/room.ts` (`Flying.pid`,
  `pidSerial`, `flyer`, `clearAir`, the four `grenade` broadcasts, `Player.deathClip` / `deathCause`, `kill`, `spawn`,
  `lastResult` in `endRound` / `startRound` / `abandon`, `Room.joinWire`); `packages/viewer/src/joinState.ts` (new:
  `applyJoinState`); `packages/viewer/src/grenade.ts` (`launchRemote`'s `hydrate`, `Live.pid`, `hydrateLive`);
  `packages/viewer/src/remotePlayers.ts` (`hydrateCorpse`, `markGhost`). The tests: `packages/match/test/
  joinState.test.ts`, `roomJoin.test.ts` (new); `packages/viewer/test/joinState.test.ts` (new), `grenade.test.ts`,
  `remoteDeath.test.ts`, `matchMount.test.ts`. No game or emulator was run; no server but the tests' own was contacted.

## 0. The answers

| question | answer | source |
|---|---|---|
| What a joiner is told | one optional member of the welcome, `join: JoinWire` (`v` 1): projectiles, the result while the round screens run, corpses, ghosts | PF.R47; 195 s4-s6, 198 s4.2 |
| How the original does it | every owned object sent whole to a new client; no fuse age, no death time replicated | `FUN_0061ba10` D:L527450-527468; 195 s4, s6 |
| The clock | the room's tick: ages, fuses and removals in ticks, `at` a room tick, `welcome.tick` the joiner's now | `JOIN_CLOCK_UNIT` |
| A projectile's identity | `pid`, a per-round serial, on the `grenade` event and in the envelope | `PROJECTILE_ID_READING` |
| The smoke | the AN-M8 stays in the room's flying list detonated until its removal: its entry is the smoke's phase | `SMOKE_PHASE_ON_WIRE_READING` |
| The result panel | its clock started `(tick - at) / 60` s before the welcome | `RESULT_CLOCK_READING` |
| A corpse | its clip at its age; past the fade hidden at once, no clip | `CORPSE_HYDRATE_READING` |
| A ghost | a dead seat with no death: drawn as nothing until alive | `GHOST_BODY_READING`; 91 s12 |
| What is replayed | nothing: no kill line, hurt, blast, score or round audio | 198 s4.4 |
| The wire | additive JSON under protocol 10 (PF.R33): no bump, no codec change | PF.R47 |

## 1. The envelope and its version

The welcome gains one optional member, `join`, of type `JoinWire` (`net/protocol.ts`):

```
join?: {
  v: 1,                                                          // JOIN_STATE_VERSION
  result?: { round, winner, wins, matchOver, screens, stats?, at },  // the roundOver as sent, and the room tick it went
  projectiles: { pid, owner, kind, pos, vel, state: 'flight' | 'rest' | 'detonated', age, fuse, removal, bounces, dud, facing? }[],
  corpses: { id, clip: string | null, cause?, age }[],
  ghosts: number[],
}
grenade: { ..., pid?: number }                                    // the same id the envelope names
```

`v` is `JOIN_STATE_VERSION` (1, a constant, not a reading): a page reads an envelope of its own version only
(`applyJoinState` returns at once on another), so a later shape takes a new number and no protocol bump. The members the
welcome already had stay as they were: `phase` and `startTick` (ONL-18b, research 221 s6), `env` (MAP-03, 209 s11),
`objective` (XR-05), `turrets` (MAP-10b). `ghosts` is an addition to the dispatch's sketch: the page cannot tell a
ghost from a corpse otherwise (the snapshot's dead body carries neither a death nor its absence; s4.2).

The room builds it from its own state alone (`match/src/joinState.ts` `joinWire`, pure; `Room.joinWire` hands it the
flying list, the standing result and the seats). The page lays it through injected sinks (`viewer/src/joinState.ts`
`applyJoinState`: the round screens, the grenade page, the others' bodies), each thing once, silently -- as the
welcome's world is laid (`JOIN_SILENT_READING`, `net/client.ts`). The original's mechanism is the whole object sent to
a new client (`FUN_0061ba10` D:L527450-527468); this is the port's equivalent of it for the objects the event stream
alone would leave out (195 s4: "Neither serializes `flying`").

The clock (`JOIN_CLOCK_UNIT` = `'tick'`): every age, fuse and removal is in room ticks (`TICK_HZ` 60 a second; a
projectile's are fractional, its own clock running in game frames, PF.R8), `at` is a room tick, and the welcome's `tick`
is the joiner's "now". The page converts by `TICK_HZ`.

## 2. Projectiles and charges

**The id.** `Flying.pid` is given by `flyer` from `Room.pidSerial`: from 0 at the cleared air of each round's start and
of the abandon (`clearAir`), never given twice in between (`PROJECTILE_ID_READING`). Every projectile the room flies
takes one -- a throw, a charge set down, a launcher's round, a rocket and its backblast -- and the four `grenade`
broadcasts carry it (`throwGrenade`, `placeCharge`, `launchRound`, `launchRocket`); the Detonator's fire is a verb, not
an object, and carries none. The backblast's pid is not told (it is never broadcast: the pages fly none), so the pids an
observer sees may skip one. The original keys its replicated objects by their network object and their owner by the
recyclable player id (195 s4); a stable per-round id is the browser's design. A takeover's rekey of a retained
`Flying.owner` to the replacement (`seat`, 195 s4's table) keeps the pid; the envelope then names the replacement's id.

**The owner.** The envelope's `owner` is the owner's player id as the room holds it now. A departed owner's charge stays
down under its pid and his id (the `Player` object is kept); the friendly-fire gate still looks the owner up live and does
not find him (`DEPARTED_OWNER_FF_READING` `'lands'`, 219 s1.2, unchanged).

**The ages.** `age`, `fuse` and `removal` are the room's `Grenade`'s own (`stepGrenade`: seconds since the launch, to
the detonation, to the removal), in ticks (`PROJECTILE_AGE_WIRE_READING`): the original's GrenadeState carries
position, velocity, owner and a monotonic state but no fuse age (`FUN_002c1850` D:L163774+, `FUN_002c1420`
D:L163598+; 195 s4: "do not claim one"). A `removed` one is not sent (the room drops it the same tick). With them go
the `Grenade`'s `bounces` and `dud` (the fix round, inside v1): a joiner's copy sets `firstBounce` from `bounces === 0`,
so an M67 joined after its first bounce does not take the 0.75 first-bounce damping (`FIRST_BOUNCE_DAMPING`) again --
it rests and goes off where the room's does -- and a launched round that dudded in the room (its fuse 9999999) stays a
dud on the joiner's page instead of coming back armed and going off there alone.

**The smoke (`SMOKE_PHASE_ON_WIRE_READING`, pinned first).** An AN-M8 goes `detonated` at `Timer1` (3 s) and is removed
at `Timer2` (40 s; `stepGrenade`, `projectile.ts` L926-934), and `flyGrenades` drops it only then: so the room's flying
list holds it for the whole smoke, and its envelope entry -- detonated, `-fuse` the seconds since the detonation,
`removal` those left -- is the smoke's phase. No separate effect record is sent (195 s4 asked for one only if the effect
outlived its projectile; it does not). The page's smoke runs `Timer2 - Timer1` from the detonation (`grenade.ts`
`smokes`); a joiner's is laid `-fuse` into it with `removal` left. Pinned by `roomJoin.test.ts` (the AN-M8 still
detonated 0.5 s before its 40 s, gone after it).

**The page.** `GrenadeThrower.launchRemote(item, from, velocity, owner?, hydrate?)`, additive: `hydrate.pid` alone (the
`grenade` event's) tags the projectile; with a phase (`state`, `age`, `fuse`, `removal`, in seconds) it is a joiner's
(`hydrateLive`): the `Grenade` laid where the room has it -- the velocity as it is, not scaled by `Muzzle_Velocity`
again, the state, the age and the two timers -- a placed charge facing its `velocity` (the envelope's `facing`), an
AN-M8 detonated as its canister and its smoke. A detonated blast or flash lays nothing (it went off before the join).
No `explode` listener runs for any of it: no blast, no sound, no scorch is replayed. A pid already live is replaced,
never doubled (a rejoin's second welcome), and so is its smoke: the puffs are keyed by pid (`smokes[].pid`, set by the
explode path too) and the old ones dropped on the replace. Only a joiner's hydrate (a pid with a phase) replaces: an
ordinary `grenade` event's pid is new within its round, and `clearAir` (the round's start, the abandon) strips the
pids from the smokes still pouring -- the puffs outlast the gap between rounds (37 s), and round N+1's pid 2 must not cut
round N's smoke off. The page's own throws carry no pid and are untouched. (Since 2026-11-09 the round's start also
stops every smoke and puff, as the original's round end does: research 283 §9, `ROUND_END_EFFECTS_READING`; an abandon
likewise. The pid strip stays for what `clearAir` alone clears.)

**A rejoin and the page's own throws** (the integration review of sprint 29, item 1). On a takeover, an in-page
reconnect or a page shown again from its cache, `Room.seat` re-owns the old seat's flying list to the new id before the
welcome goes, so `join.projectiles` names the page's own grenades and charges too (owner = its id) -- which the page
still flies itself, with no pid for `launchRemote` to replace them by: a second, remote copy would blast twice (its
sound and scorch too), pour a second smoke, or leave a claymore its own Detonator never fires (the Detonator skips
remote lives). The page therefore skips its own id's entries while it flies any projectile of its own
(`NetPageDeps.ownProjectiles`, `main.ts` -> `GrenadeThrower.ownLive`; `launchRemote` marks every copy it lays `remote`);
a page holding none -- a fresh page, a duplicated tab that takes the seat over -- hydrates them, the room's word being all
it has (they are then remote copies -- and its Detonator is not offered at all, since `claymoresDown` -- the Detonator's gate, the SEAL's own claymores since PAR-96 (research 256 §8; was `placedCount`, every charge of the SEAL's, at `grenade.ts:777` then) -- ignores remote copies: the player on that tab cannot set off claymores the room still holds under his seat; they stay drawn until the next round clears the air; counting self-owned hydrated claymores in `claymoresDown` would close it). The skip is the page's whole own list or none: an own
projectile the page lost while it still flies another is not restored. Echoing the pid to the thrower (its own lives
replaced by pid) was the alternative; the skip is smaller and needs no wire change. The front end's match flies no
throwables and leaves the hook out. Test: `netPageJoin.test.ts`, "a rejoin carrying the page's own frag leaves one live
of it and one blast; ...".

**The smoke's look (`JOIN_SMOKE_LOOK_READING`).** The AN-M8's `ExplosionAnim`, `smoke_grenade`, is its detonation:
sparks, a flash, `!SMK_CANISTER` and a call to `smoke_stream` (research 85 s9.6; on MP2's data its sequences are
`!SMK_CANISTER`, `call smoke_stream`, then particle bursts and a second `!SMK_CANISTER`). The effects player runs a
program's sound ops through its `sound` hook (`effects.ts` `playSound`, to the page's audio: `main.ts:1164`), so a joiner
that ran it would hear and see a detonation up to 37 s old -- the first fix round did, and review 3 caught it. A joiner
runs `smoke_stream` alone (`JOIN_SMOKE_STREAM`): its three particle sources (`small_smoke2`, `large_smoke1`, `large_smoke2`) and nothing else (research 89
s12). Pinned on the real `Effects` with MP2's data (`grenade.test.ts`, "a joiner's AN-M8 smoke runs smoke_stream
alone on the real Effects ..."): nothing reaches the sound hook, `smoke_grenade` is not run; an observer's explode of
the same record runs it and is heard. Without the player or the stream, the placeholder puffs pour from the
detonation's age. No held line is needed: the grenade page's own effect door (`setEffectPlayer`, wired by
`main.ts:1170`) is used. That door answers yes or no and takes no start offset, so the joiner's stream runs its 20 s of
emission from the join, not from the smoke's age, and without the canister's burst the observer saw -- the reading.
`Effects.run` hands back a handle with `stop()`; the door keeps none, so on a rejoin a stream already running for that
pid is not started again (`Live.effectSmoke`) rather than stopped and restarted. A start offset in `Effects.run` and a
handle through the door would close both.

Not reproduced: the joiner's copy measures a launched round's arming distance from where it is now (the launch point is
not on the wire), and lays no rest material (a hydrated charge's blast draws no scorch on the joiner's page, as an
event-told charge's does not today). The tumble's angles are not on the wire (the drawing only).

## 3. The result panel's clock

`endRound` keeps the `roundOver` as it sent it with the tick it went (`Room.lastResult`, `at`); `startRound` and
`abandon` clear it, and `Room.joinWire` sends it only in the `over` phase. The page's panel clock is the `roundOver`'s
arrival (`netPage.ts` `screens.start`, the engine's 3 s read then each screen's seconds: `roundScreen`); a joiner's is
started `(tick - at) / TICK_HZ` seconds before its welcome arrived (`RESULT_CLOCK_READING`), so its panel and seconds
left are an existing observer's at the same moment (the welcome's transit is not counted, as the `roundOver`'s is not).
Which panel the original shows a late joiner is a capture gate: `FUN_002c0850` D:L163312-163353 applies the game
state's clock length, start and packed state whole (195 s5), which supports restoring the clock, not a particular panel.

## 4. Corpses, ghosts, and the wiring owed

### 4.1 Corpses

`kill` keeps the death's clip and cause on the victim (`Player.deathClip`, `deathCause`, beside `diedAt`); every spawn
clears them (the respawn's, the round's, the abandon's). A dead seat with a death (`diedAt` >= 0) is a corpse in the
envelope: its clip, its cause and its age in ticks since the death (`CORPSE_AGE_WIRE_READING`: the original has no
replicated death time, `FUN_002be150` D:L162596-162602 lays the full state and D:L162386-162395 sets health 0 and actor
state 8 from a flag; 195 s6). The page lays it at its age (`CORPSE_HYDRATE_READING` `'pose at age'`:
`RemotePlayers.hydrateCorpse` sets the death clip and `deadFor` = the age, so the pose is the clip's at that age, held
on its last key once played, and the body fades at `BODY_FADE_S` from the death, not from the joiner's first sight); one
past `BODY_FADE_S` is handed no clip and hidden at once. Before PF-28 a joiner drew every dead body fresh for 10 s, in
no death clip.

### 4.2 Ghosts

A dead seat with no death -- a player seated in a classic round in play, a ghost until the next ("You are a ghost.",
research 91 s12), or a seat its ARMORY holds in the waiting room -- is sent as a ghost, and `RemotePlayers.markGhost`
draws it as nothing until a snapshot has it alive (`GHOST_BODY_READING` `'nothing'`); a later kill draws it as any
corpse. Before PF-28 the snapshot's dead body was drawn for `BODY_FADE_S`. A ghost takes no footfall slot (it is dead,
PF-25's choice unchanged).

### 4.3 The wiring owed (held files: the controller's wave 4, PF.R53)

**Landed in wave 4 (2026-10-06, `agent/wave4c`)** as written below; `netPageJoin.test.ts` and `roomJoin.test.ts`'s
`welcome.join` line hold them. Before them the room built the envelope (`Room.joinWire`) and sent none, and every page
ignored it. Each is additive; the exact text:

- **`packages/match/src/room.ts`, `hello`'s welcome literal**, after `phase: this.wirePhase(),` (L962 on `agent/pf28`):
  `join: this.joinWire(),` -- the dispatch's sketch named `joinState(this)`; the room's private state makes it a method.
- **`packages/viewer/src/netPage.ts` L49** (`NetPageDeps.remoteGrenade`):
  `remoteGrenade(kind: string, from: [number, number, number], velocity: [number, number, number], owner?: number, pid?: number, phase?: ProjectilePhase): void;`
  with `import { applyJoinState, type JoinSinks, type ProjectilePhase } from './joinState';`.
- **`netPage.ts` L1003-1038** (the `welcome` case), after the `armorySeat` line, before its `break`:
  `if (ev.join) applyJoinState(ev.join, performance.now(), ev.tick, this.joinSinks());` and the private method:

  ```ts
  /** PF-28 (research 231 s4.3): where the welcome's join envelope goes on this page (`./joinState` `applyJoinState`). */
  private joinSinks(): JoinSinks {
    return {
      screens: (start, list, winner, wins, stats) => { this.endsAt = null; this.screens = { start, list, winner, wins, stats }; },
      projectile: (kind, from, velocity, owner, pid, phase) => this.deps.remoteGrenade(kind, from, velocity, owner, pid, phase),
      corpse: (id, clip, ageS) => this.deps.remote.hydrateCorpse(id, clip, ageS),
      ghost: (id) => this.deps.remote.markGhost(id),
    };
  }
  ```
- **`netPage.ts` L1129** (the `grenade` case): `case 'grenade': this.deps.remoteGrenade(ev.kind, ev.from, ev.velocity, ev.id, ev.pid); break;`
  -- with it, `netPageRound.test.ts`'s "passes the thrower's id with the charge and the Detonator" records a fifth
  argument, and the test changes on **two lines**: L201, the Claymore's event gains `pid: 7`
  (`server({ type: 'grenade', id: 2, kind: 'Claymore', from: [1, 2, 3], velocity: [1, 0, 0], pid: 7 } as ServerEvent);`),
  and L203, the expectation becomes
  `expect(seen).toEqual([['Claymore', [1, 2, 3], [1, 0, 0], 2, 7], ['Detonator', [4, 5, 6], [0, 0, 0], 3, undefined]]);`
  (checked on `agent/pf28` with the lines applied and reverted: the rest of `netPageRound`, `netPageGame`, `roomJoin` and
  `roomLoadBarrier` green, both packages typecheck).
- **`packages/viewer/src/main.ts:2482`**:
  `remoteGrenade: (kind, from, velocity, owner, pid, phase) => grenade.launchRemote(kind as GrenadeItem, from, velocity, owner, pid === undefined ? undefined : { pid, ...phase }),`
  -- the dispatch's `state && { ...state, pid }` would drop the event's pid; this keeps it.
- **`packages/viewer/src/matchMount.ts:313` stays `remoteGrenade: () => {},`**: the match mounts no throwables
  (`MATCH_MOUNT_PARTS_PLACEHOLDER`); its corpses and round screens come through `NetPage` and reach it with the rest.
  The pair is asymmetric by design; `matchMount.test.ts` pins it ("PF-28: the match mounts no throwables, ...").
- **The test owed with them** (wave 4): `packages/viewer/test/netPageJoin.test.ts` (`netPageRound.test.ts`'s fake
  socket), "a welcome carrying join hydrates the screens, the projectiles and the corpses through the deps once, posts no
  kill line and plays no round audio; a welcome without join changes nothing (an older room)"; and in
  `roomJoin.test.ts` one line, `expect(welcome.join).toEqual(room.joinWire())` at a joiner's hello, once `hello` sends it.
  *Landed 2026-10-10: `packages/viewer/test/netPageJoin.test.ts` "a welcome carrying join hydrates the screens, ..."
  (describe "PF-28: the welcome's join envelope on the page"), and `packages/match/test/roomJoin.test.ts`'s
  `expect(watcher.of('welcome')[0]!.join).toEqual(s.room.joinWire())` at a spectator's hello.*

## 5. The abandon (PF-27)

Written by the controller's wave 4 with its hunk (ruling PF.R48, 2026-10-06). Before it, `netPage.ts`'s `abandoned` case
posted "ABANDONED" and the room's waiting line, kept the socket and waited for both sides -- in a game too, where the
original's match is over. No "ABANDONED" caption exists in the original: the abandon is a dialog.

**The original.** Two paths open `dlgNetAbandoned.rdr` (0x3f2780; research 193 s6, s12.7):

| path | where | what |
|---|---|---|
| a leave | `FUN_002bc530` D:L161109-161146 | in a game, `zNetGetValidGameClientCount() - pending < 3` (the count `FUN_00615160`: DME entries with +0x28 = 1, self and spectators counted, BELIEVED) |
| the host's empty teams | `FUN_002c4500` D:L165673-165676 | both team counts 0, state 2..5, spectators remaining |

The dialog's ONSTART (disc, settled; `tools/test/onlineDialogs.pinned.json` L12408-12450): `DisconnectFromGameServer`;
`POPUPDIALOG` #528 `_528_AllPlayersLeft_MSG` ("All players left the game before you were able to join. Please try
again."); `exit_lobby` -> `ReturnToWorldOfSOCOM` (online `dlgWorldOfSOCOM.rdr`, LAN `dlgLANBriefingRoom.rdr`).

**As built.**

- `packages/viewer/src/netPage.ts`, the `abandoned` case: the round's end on the page as before (the decals, the round
  audio, the timer, the screens, the bench, `roomWaits`), then -- in a game (`NetPageDeps.game`) -- the match ends on
  `endGame(GAME_ENDED_DIALOG_READING, 'abandoned')`: `ended(528)` once, the session released, no retry, no line (the
  waiting room's line is not posted: the match is over). The front end's match (`matchMount.ts`'s `ended`) hands 528 to
  `LobbyMatch`, whose return is `dlgNetAbandoned.rdr` with why `'abandoned'` (`returnDialog`, `lobbyMatch.ts`), the one
  a 4007 close takes; that return closes the socket the room kept open. On `/testroom` (no game, no dialog runtime)
  the page posts UIMnLOC 528's text (`ABANDON_LINE_READING`) and, for a player, the waiting line as before.
- `packages/central/src/bridge.ts`: `ABANDON_TRIGGER_READING` (`'side-empty | below-3'`) names the port's two triggers
  against the original's two; `ABANDON_BELOW_PLAYERS_READING`'s JSDoc says the count is the original's consoles, self
  and spectators counted (BELIEVED). Neither trigger moves: the room's side-left-empty (`Room.abandonIfSideEmpty`, a
  team at 0 -- which covers `FUN_002c4500`'s both-at-0 with spectators watching) and the bridge's below three.
- `packages/viewer/src/lobbyMatch.ts`: `MATCH_ABANDONED_DIALOG`'s JSDoc names the room's `abandoned` as the second path
  to 528 beside the 4007 close.

**The threshold** stays a reading: "fewer than 3 consoles" against "fewer than 2 besides the leaver" cannot be settled
statically (`FUN_0030d510`'s count is filled by an undecoded network-library routine; research 159 s8, 193 s12.7).
Owed: capture B's 2v1 (owner list 5) -- a leave with two left, and a game whose players all leave while spectators
watch.

**Tests.** `packages/viewer/test/netPageRound.test.ts`: "abandoned in a game ends the match on dialog #528
(dlgNetAbandoned.rdr: ...) and posts no ABANDONED line; on /testroom the page posts UIMnLOC 528's text
(ABANDON_LINE_READING)"; `packages/viewer/test/lobbyMatch.test.ts`: "the match's return on 528 is dlgNetAbandoned.rdr
with why 'abandoned' whether the room said abandoned or the socket closed 4007 (FUN_001f5e70 D:L55735-55745)";
`packages/viewer/test/matchHandOff.test.ts`: "PF-27: the room's `abandoned` in the match ends the seat on #528 as a
4007 close does, ..."; `packages/central/test/room.test.ts`: "a classic round whose players all left while spectators
watch is abandoned (FUN_002c4500 D:L165673-165676: ...)". Registry `round.abandon.dialog`, `round.abandon.threshold`.

## 6. The acceptance table (research 198 s4.4's late-join rows)

| 198 s4.4 row | as built | test |
|---|---|---|
| Late observer joins while grenade flies, charge waits or smoke persists: sees current objects/effect phase; no historical blast, ammo expenditure or score replay | the envelope's projectiles (s2); the page lays each at its phase, no explode | `roomJoin.test.ts`: "a spectator joining while an M67 flies ...", "a claymore set down and a C4 placed ...", "an AN-M8 past its fuse ...", "the envelope replays nothing ..."; `grenade.test.ts`: "launchRemote with a hydrate state ..." |
| Join halfway through each result panel: current panel/result and remaining time agree with existing observer | `join.result` with `at`; the panel clock in the past (s3) | `roomJoin.test.ts`: "a joiner in the over phase gets join.result ..."; `viewer/test/joinState.test.ts`: "applyJoinState starts the result panel's clock ..." |
| Join after an old corpse has faded: does not restart a fresh corpse or invent a death clip; ghost stays distinct | corpses at their age, the faded hidden with no clip; ghosts drawn as nothing (s4) | `roomJoin.test.ts`: "a joiner 5 s after a kill gets join.corpses ..."; `viewer/test/joinState.test.ts`: "applyJoinState: a corpse older than BODY_FADE_S ..."; `remoteDeath.test.ts`: "hydrateCorpse plays the death pose ..." |
| Charge owner changes or wire ID is reused: server decision and all observers refer to the same entity/ownership policy | one `pid` per projectile, per round, on the event and the envelope; a departed owner's charge keeps it (s2) | `roomJoin.test.ts`: "pids are per round generation ..."; `viewer/test/joinState.test.ts`: "applyJoinState hydrates each projectile once by pid ..." |

The pages' half needs the wiring of s4.3 (wave 4); the browser run (a late observer on `twoPagesMatch.spec.ts`'s harness
at the grenade, charge, smoke and result phases) is the controller's at the gate. The remaining W2-B-03 rows -- the
two-console capture of the original's late join, the takeover witness on an observer's Detonator (195 s4's table) --
are not closed here: the observer's numeric owner still compares the `grenade` event's id.

## 7. Readings and placeholders

| name | where | status |
|---|---|---|
| `PROJECTILE_ID_READING` | server `joinState.ts` (`room.ts` `pidSerial`) | `'per round, never reused'`: a serial from 0 at each cleared air (round start, abandon), on the `grenade` event and the envelope; the original keys objects by their network object (195 s4). Owed: review; capture B's late join at a flying grenade |
| `PROJECTILE_AGE_WIRE_READING` | server `joinState.ts` | `'room clock'`: age, fuse and removal are the room's `Grenade`'s, in ticks; no fuse age is replicated in the original (`FUN_002c1420` D:L163598+; 195 s4). Owed: capture B (the original joiner's grenade against an existing observer's) |
| `CORPSE_AGE_WIRE_READING` | server `joinState.ts` | `'room clock'`: ticks since `kill`; the original has no death time on the wire (`FUN_002be150` D:L162596-162602; 195 s6). Owed: capture B (a join at death + 0.5 s, + 5 s and past the fade) |
| `SMOKE_PHASE_ON_WIRE_READING` | server `joinState.ts` | `'flying until removal'`: the AN-M8 stays detonated in the flying list until `Timer2`, so its entry is the smoke's phase (`stepGrenade` L926-934, `flyGrenades`); pinned in `roomJoin.test.ts`. Owed: capture B (a join into a smoke) |
| `RESULT_CLOCK_READING` | viewer `joinState.ts` | `'room tick'`: the joiner's panel clock = now - (tick - at) / 60 s; which panel the original shows a joiner is a capture gate (`FUN_002c0850` D:L163312-163353; 195 s5). Owed: capture B (a join halfway through each result panel) |
| `CORPSE_HYDRATE_READING` | viewer `joinState.ts` (`remotePlayers.ts` `hydrateCorpse`) | `'pose at age'`: the clip at `deadFor` = the age, hidden at once past `BODY_FADE_S`, no clip replay. Owed: capture B (the original joiner's corpse pose and fade) |
| `JOIN_SMOKE_LOOK_READING` | viewer `grenade.ts` (`hydrateLive`) | `'stream from its start'`: a joiner's AN-M8 smoke is `smoke_stream` alone (no `smoke_grenade` burst, no `!SMK_CANISTER`: research 85 s9.6, 89 s12), started from its beginning at the join (the grenade page's effect door takes no offset and keeps no handle), else the puffs from the detonation's age (s2). Owed: a start offset in `Effects.run` and a handle through the door; capture B (a join into a smoke) |
| `ABANDON_LINE_READING` | viewer `netPage.ts` | PF-27: UIMnLOC 528's text ("All players left the game before you were able to join. Please try again.") posted on `/testroom`'s `abandoned`, which has no dialog runtime; a game ends on the dialog #528 itself (s5; research 193 s12.7). Owed: the text from the UIMnLOC table when the page holds one |
| `ABANDON_TRIGGER_READING` | server `bridge.ts` | PF-27: `'side-empty \| below-3'`, the port's two triggers (the room's side left empty, the bridge's `ABANDON_BELOW_PLAYERS_READING`) against the original's two (`FUN_002bc530` D:L161109-161146, `FUN_002c4500` D:L165673-165676; s5). Note-only until capture B's 2v1 (owner list 5) |
| `GHOST_BODY_READING` | viewer `joinState.ts` (`remotePlayers.ts` `markGhost`) | `'nothing'`: a dead seat with no death drawn as nothing until alive (91 s12). Owed: capture B (a ghost seen by a late joiner) |

## 8. Owed

- The gate's browser run (the wiring of s4.3 and `netPageJoin.test.ts` landed in wave 4).
- Capture B's 2v1 (s5): the abandon's threshold, and a game whose players all leave while spectators watch.
- Capture B (owner list 5, an addition, not a new row): late joins at a flying grenade, a placed charge, a smoke, a
  corpse (death + 0.5 s, + 5 s, past the fade) and each result panel -- the envelope's look (s6's table) against the
  original's.
- An observer's charge-owner policy across a takeover (195 s4's table): the page's Detonator still matches the
  `grenade` event's numeric owner; keying it by `pid` (an authoritative detonation by id) is the next step.
- The launch point of a launched round on the wire (s2: the joiner's arming distance), if a capture shows a joiner's
  copy duds where the room's does not.
