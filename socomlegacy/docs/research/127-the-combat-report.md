# 127 -- The combat report: a playtest instrument with no original (INT-NET-3, INT.R5)

Written 2026-10-02 for INT-NET-3, the net stream's third task in integrating Chris's browser-beta-v5
(`chris/browser-beta-integration` d578f347: his room's `combat()`, `viewer/src/net/combatHealth.ts`, the `CombatEvent` in
his `protocol.ts`, his client's ring, and `docs/DAMAGE-REPORTING.md`), under the controller's ruling INT.R5 (the
integration plan `../plans/2026-10-02-contributor-integration-v5.md`; the owner's row H47 may overturn it). The code:
`packages/match/src/room.ts` (`RoomOptions.combatReport`, `Room.combat`, `Room.dropped`,
`COMBAT_REPORT_REJECTIONS_PER_TICK`), `packages/central/src/main.ts` (`COMBAT_REPORT=1`),
`packages/viewer/src/net/protocol.ts` (`CombatReport`), `packages/viewer/src/net/combatHealth.ts`,
`packages/viewer/src/net/client.ts` (`COMBAT_REPORT_RING`, `NetClient.combatReport()`).

## 1. What it is, and that it has no original

The combat report is the match server's account of what it did with each round, blast and request: whether a hit was
laid and what it took off each body part, why a round or a throw was refused, why a blast harmed no one. It answers a
playtester's question -- "did that register, and if not, why?" -- that the room's once-a-second refusal log
(`Room.takeDrops`, 2026-10-01) answers only on the server's console.

**The original has nothing like it.** SOCOM II shows a player its own health gauge and a hit's flinch or death; it never
shows anyone a part's health in numbers, an enemy's health at all, or why a request did not happen (in menus a refusal
is a sound, `.NEG`). So the report is a **browser adaptation of the developer kind** (MISSION, "The parity rule" 5):
labelled so in its name and its docs, off by default, and outside the game's behaviour -- nothing in the match reads
it, and the room does the same thing with the option on or off (`room.test.ts` "changes no damage" holds the hurt
events, the kills and the health equal across both).

## 2. Who receives what, and why

The option is the room's: `RoomOptions.combatReport`, set by the server's `COMBAT_REPORT=1` (`deploy/env.example`),
**off by default**; the LAN playtest tool turns it on (section 8). Off, no `combat` event is ever sent (`room.test.ts` "off by
default"). On:

| report | status | sent to |
|---|---|---|
| a round, a launched round's direct hit or a blast laid on a body | `applied` | the attacker and the target (once when they are one) |
| a round or blast friendly fire spared (W3.R11: off, the create-game default) | `rejected`, reason `friendly fire`, no health | the attacker only |
| a round that met no body, met a body past the weapon's reach, or met a body already dead; a blast that reached the thrower's own feet and harmed it not | `miss` | the attacker only |
| a blast that reached another's body in the radius and harmed it not (walled from its head, or no damage) | -- | no one (below) |
| a request the room refused | `rejected`, the room's `dropped()` reason | the requester only |

**Never to a third page.** Chris's build broadcast every report to every page, so any page could read an enemy's
exact part health and armour after each hit and the point of every round fired: information the original gives no
one, and a cheat in a match. The attacker and the target are the two players a hit already concerns; a miss or a
refusal concerns only its requester -- a friendly-fire refusal too (INT.R5 as written: the review of 2026-10-02 found
the first cut sent it, with the team-mate's health, to the team-mate as well, following the triage's port step 4; it
now goes to the shooter alone and carries no health, as no refusal does). Even so the attacker learns its target's
part health -- acceptable only because the report is a playtest room's (H47 is the owner's say on that audience). A
departed thrower's blast (no attacker) is reported to its target only, an applied one; its misses and refusals to no
one.

**A blast's miss on another's body is not sent.** Chris's `blast-occluded` and `no-blast-damage` named every body in
the radius the blast did not harm. Sent to the thrower, that names an enemy behind cover inside the radius, with its
distance -- and even unnamed, the count would tell that someone is there: a presence leak of the kind INT.R5 was written
to stop for health (the review of 2026-10-02). So only the thrower's own body's miss is reported (it knows where it
stands); a blast that harmed no one else says nothing of the others.

## 3. The fields (`CombatReport`), in our words

From Chris's `DAMAGE-REPORTING.md`, restated for this room:

- `eventId` (the room's count from 1), `tick`, `round`, `map` (the stem).
- `status` (`applied`, `miss`, `rejected`), `request` (`fire`, `throw`, `reload` for a request -- a reload's only
  refusals are the command queue's, below; `blast`, `impact` for the room's own resolution), `reason` (table in
  section 4; null on an applied report).
- `weapon`: the item's id, as the `shot` and `reloadSound` carry it -- not his record name. Null on a refusal: the
  room's `dropped()` does not carry the item.
- `attacker`, `target`: `{ id, team }` or null.
- `part`: the struck part (`damage.ts` `PART`: head, right arm, left arm, body, right leg, left leg); null with none,
  or with a blast's or a shotgun volley's many, which `hitLocations` lists (`{ part, rawDamage }` each, in order).
- `distance` (world units, from the muzzle to the struck point, from a blast to the feet, from a launched round's
  launch to the body) and `distanceMetres` (the same over `UNITS_PER_METRE`).
- `healthBefore`, `healthAfter`, `armourBefore`, `armourAfter`: the target's six parts (`Health`), on an applied report
  only; null otherwise (a friendly-fire refusal included).
- `rawDamage`: what the room passed to the damage model before the armour (`bulletDamage`, `pelletDamage` times the
  pellets laid, a blast's fragments summed).
- `damageApplied`: the six parts' health before less after, summed -- a body hit's limb caps included; 0 when nothing
  was taken (an armour's whole take, a flashbang, any miss or refusal).
- `killed`, `selfDamage` (the attacker is the target: a grenade at the thrower's feet), `friendlyFire`.
- `point` (the struck point; a miss's round end; the blast's point), `direction` (the round's unit direction; null for
  a blast).
- From `combatHealth.ts` `combatHealthSummary`: `hitLocation` (the struck part's name), `hitLocationNames` (every part
  struck, once each), `struckPartHealthChange` (the struck part's before less after: **null** with no single struck part
  -- a blast of many fragments by design -- or no health), `totalBodyPartHealthChange` (the six parts' sum; null with no
  health). **Null means not known, never zero.**

**Neither number is the HUD's gauge.** The gauge is `overall` (`FUN_005a56d0` L461416-461437: the head weighted 3);
how a report's sums relate to it, or to the console's own gauge, is not measured (Chris's caveat, kept). A capture of
the gauge across a hit of known part damage would settle it (MATCH-03, research 101).

## 4. The reasons: the room's own, through one emitter

Refusals are the room's existing `dropped(kind, why)` tally reasons, extended with the requester: one call counts the
refusal for the server's log (unchanged: `takeDrops`, the once-a-second line) and, with the option on, tells the
requester (`Room.combat`). Chris's own reason strings were not added beside them; his map onto ours:

| his | ours |
|---|---|
| `malformed-request` (fire) | `fire: shape` |
| `pending-queue-full`, `command-timeout` | `too many waiting`, `its command never ran` |
| `not-alive-or-round-over`, `missing-command-frame` | `not alive`, `no frame` |
| `fire-rate`, `reloading-or-empty` | `rate`, `reload or empty` |
| `muzzle-too-far`, `muzzle-occluded`, `invalid-direction`, `cone:<v>` | `muzzle far`, `muzzle walled`, `dir`, `cone: <v>` |
| (none in his) | `launcher`, `swapping`, `binoculars` (ours has more gates) |
| `hand-too-far`, `hand-occluded`, `throw-speed` | `hand far`, `hand walled`, `launch` |
| `not-alive-round-over-or-no-item` | `not alive`, `unknown kind`, `none left` |
| his claymore refusals (`speed-position-or-facing`, `placement-height`, `ground-or-line-of-sight`, `charge-limit`) | `facing`, `hand far`, `hand walled`, `moving`, `ground`, `charges down`; C4 `no c4 target` |
| his Detonator refusal `not-alive-or-round-over` | `not alive`, `no claymore` (*was* also `rate`, dropped 2026-11-02 by P38-room: the original sets no `FireWait` on the Detonator's fire, research 85 §9.7.1) |
| `beyond-maximum-range` (a refusal in his) | a **miss**, `beyond range`: the round was spent and the `shot` sent, so it was no refusal |
| `friendly-fire-disabled` | `friendly fire` (status `rejected`; the target untouched) |
| `blast-occluded`, `no-blast-damage` | a **miss**, `occluded` / `no damage`, on the thrower's own body only (the blast reached the radius; the line to the head was walled, or nothing at the feet: `resolveBlast`'s null, `FUN_005ac070`); another's is not sent (section 2) |

The placed charges' and the Detonator's refusals were silent in this room but for `ground` (the triage challenge's
finding): they are tallied now, so the server's log tells them apart too.

## 5. The bounds

- **`COMBAT_REPORT_REJECTIONS_PER_TICK` = 4**: a player is told at most four refused requests a server tick (Chris's
  cap). A server policy of a playtest instrument, not a game value: every refusal is still dropped and counted; only
  the reports past it go unsent (500 bad throws in a tick: four reports, a tally of 500). Friendly-fire refusals are
  outside the cap -- they follow rounds and blasts the room took, bounded by the fire rate and the blast's radius, and a
  blast over five team-mates must name all five. The incoming frames are capped too (`server.ts` `RATE`).
- **`COMBAT_REPORT_RING` = 1,024**: the page keeps the last 1,024 reports, oldest first, and counts those it let go
  (`NetClient.combatReport()` returns a copy, `{ events, dropped }`). A page policy, not a game value. The ring stays
  empty while no report arrives; it is the client's, so a rejoin (a new `NetClient`) starts a new one.
- The traffic: a miss is one report to one page per round fired, not one to every page (his roughly doubled the shot
  traffic of a room); in a match the option is off and the report costs nothing.

## 6. What is not reported

- A reload's own refusals (the room's `reload` returns without a `dropped()` reason; a reload waits in the command
  queue as a round does, so its `too many waiting` and `its command never ran` are reported, request `reload`), a
  launcher's raise refusals (`raiseLauncher`: silent in the room, as before), a door's, and the `loadout` request (which
  has its own answer). *Corrected 2026-11-02 (P4, LATER 637):* this line listed a launched round's and a rocket's
  refusals (`launchRound`, `launchRocket`) as silent in the room. A rocket's reachable refusals have been told and tallied
  since LATER 503/511 (`throw: nofire`, `hand`, `raise`, `wait`, `start …`), and since P4 every refusal of a carrier's
  round is (`throw: round …`), so each reaches the combat report as `rejected`, request `throw`.
- A refusal of a `throw` whose name no record has (it lowers a launcher, as before: no refusal).
- A Detonator fired with no claymore of its owner's in reach (his `no-owned-charges-in-range`): the room takes the
  fire all the same and tells the others (`Room.detonate`, after `CZKit_DetonateRemoteExplosives` 0x5c0130, which
  sets off what is in reach and has no refusal for nothing in reach in research 85 §9.7.1), so it is no refusal.
- A blast's miss on any body but the thrower's (section 2: a presence leak).
- ~~Fall damage (`applyFall`): no attacker, no request.~~ Reported since 2026-10-03 (FALL-DAMAGE, research 151 §3.3): an
  `applied` report to the faller alone, `request: 'fall'`, `part` 3, the player its own `attacker` and `target`
  (`selfDamage` true: the game sets a fall's killer to the player, `FUN_005ac1f0` L464953-464957), `rawDamage` the loop's
  take before the clamp (no armour step), `point` the feet, `distance` and `weapon` null; a knock's landing at x 1.2.
- A shotgun volley's rays after the first on the same body (the volley's once-a-body guard, `FUN_005abbc0`
  L464704-464737): one applied report for the volley, its pellets in `hitLocations`.
- A spectator's requests (no player to tell).

## 7. Open, for later

- The owner's say on the audience (HUMAN_TASKS H47): the default here is INT.R5.
- Whether any of the report is ever shown in the page (section 8 saves it, and shows none of it): if it is, the gauge
  caveat of section 3 goes with it.
- A refusal's `weapon` is null: `dropped()` could carry the item where the room knows it (a fire refusal past the frame).
- Chris's LAN build (protocol 8) cannot share a room with ours (protocol 9): his report and ours are not mixed.

## 8. The report's download, and the LAN tool (2026-10-02, INT-REPORT-HOOK)

Written 2026-10-02 for INT-REPORT-HOOK, the step the combat report's review left open: `NetClient.combatReport()` had
no caller. The code: `packages/viewer/src/playtestReport.ts` (`buildReport`, `CombatRing`, `CombatSection`), the
overlay's mount line in `packages/viewer/src/main.ts`, `tools/lan-playtest.ts` (`matchServerEnv`, `hostReadyText`).
A browser and LAN adaptation of the developer kind, like the report itself: nothing here has an original.

**The download.** The developer's playtest report (`?devmode`, **Save test report**) gains a `combat` section, read
from the match's net client when the file is made (`main.ts` hands the overlay `() => net?.client.combatReport()`; the
page's hook object is unchanged). Chris's field names (`site/playtest-diagnostics.mjs`, `chris/browser-beta-integration`
d578f347: `combat: { events, dropped, limit }`):

- `events`: the reports as the client kept them (section 5's ring), oldest first, each the room's `combat` event as
  sent -- its fields are section 3's, `type: 'combat'` included; a copy, so the saved file is not the ring.
- `dropped`: how many older reports the ring let go (`NetClient.combatReport().dropped`).
- `limit`: the ring's size, `COMBAT_REPORT_RING` (1,024): with `dropped` above 0 the file holds the last `limit`.

Two notes go with the section into the file's `notes`: what it holds (a room started with `COMBAT_REPORT=1`, this
player's own hits, misses and refusals only, a rejoin's new ring), and section 3's caveat (`damageApplied` and
`totalBodyPartHealthChange` sum the six parts, limb caps included; `struckPartHealthChange` is the struck part's;
null is not known; neither is the HUD's gauge).

**Absent when empty.** A room without the option sends no report (section 2), the ring stays empty, and the section and
its notes are absent: the file is byte for byte the one saved before the section existed, under the same `format`
(`redotcom-playtest-report-1`; a reader tells the two apart by the `combat` key). `test/playtestReport.test.ts` "a room
without the option" pins it. Outside a match (no net client) there is no section either: a report saved after leaving
the match, or after a rejoin, holds only what the client of that moment kept (section 5: a new `NetClient`, a new ring).
Nothing is sent anywhere: the report stays a download made in the page (the same file's network test still holds).
None of it is shown in the overlay's figures (section 7).

**The LAN playtest tool.** `npx tsx tools/lan-playtest.ts host ...` starts the match server with `COMBAT_REPORT=1`
(INT.R5: on for LAN / playtest rooms); `--no-combat-report` leaves it off, the variable then taken out of the server's
environment even if the shell sets it. The host's ready message ends with which (`Combat report: on (...)` or
`Combat report: off (--no-combat-report)`). The flag is the host's: `join` refuses it (the joiner runs no server).
`tools/test/lanPlaytest.test.ts` holds the environment both ways and the message.
