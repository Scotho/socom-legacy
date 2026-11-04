# Paintball -- an example rules pack (FCW-13)

A browser adaptation with no original (product track, OT.R53): a creator game mode built only on the published
creator rules contract (`docs/specs/2026-10-27-creator-rules-contract.md`, vocabulary 0, engine contract `^0.1.1`),
re-cast by FCW.R18 -- no `modes/paintball.ts` engine module, no mode-specific engine path. Spec section 11's paintball:
`player.hit` -> `player.eliminate` (one hit), `loadout.restrict`, `score.award`, `round.end` by count alive. It is a
`RulesSpec` mode distinct from the retail game types 1-5, chosen explicitly in the Forge's Game type (Custom) or over
MCP. With the pack off, the game is unchanged. A texture swap cannot certify paintball: what makes it paintball is
these rules running on the room's rule host.

## The files

| file | what it is |
|---|---|
| `s2u-pack.json` | the v2 manifest: kind `rules`, sides `server`, contract `^0.1.1`, one member, intent `new-behaviour`, no handler claim |
| `rules/paintball.json` | the `RulesSpec` (`s2u-rules`, vocabulary 0): mode `paintball`, "Paintball" |
| `README.md` | this note; at the pack's root it is one of Thunderstore's store files, outside the pack's identity (FCW-33) |
| `../paintball.run.json` | not a member: the acceptance runs -- three scripted runs and the rule trace each must give |

No Thunderstore `manifest.json`, `icon.png` or `CHANGELOG.md` here (H342/H343's later sprint).

## The layout it needs

Nothing but the layout's own team spawns (A the SEALs, B the terrorists). The pack names no zone, marker, spawner,
door or switch, so it plays on the Forge's blank floor and on any retail map base alike ("a saved arena": any layout).

## The configuration (authored values, never retail ones)

| parameter | default | bounds | what |
|---|---:|---|---|
| `hits` | 1 | 1..10 | marks that eliminate a player (P2: one hit eliminates by default) |
| `points` | 1 | 0..100 | points to the shooter's side for each elimination |
| `loadout` | `sidearms` | `sidearms`, `any` | `sidearms`: the markers are the sidearms only (P1); `any`: any weapon marks (P1's recorded alternative) |

**P1, the default loadout** (the dispatcher's ruling, 2026-10-27; product-track taste, Craig may overturn): the
sidearms only, a "marker" feel, everyone equal. The list's one entry is `pistol`, the room's own weapon-class name
(`@s2u/scene`'s exported `ItemClass`, the `weaponClass` a `player.hit` carries and `hit.scale` filters by -- spec
section 5): an authored choice, not a retail value. The ruling asked for the list as a config value; vocabulary 0 has no
list-typed parameter and `loadout.restrict`'s `allow` takes no `{param}` (see (b) 2), so the configuration is the enum
above, and a creator who wants another list edits the `sidearms-only` rule's `allow` and the `mark` rule's class test in
the Rules panel (each rule is editable as JSON text there). Today only the `mark` rule's class test takes effect:
`allow` is held as rule state and read by nothing ((b) 1), so editing `mark` alone changes play and editing `allow`
alone changes nothing. FCW-31's kit gate, once it lands, would make a mismatch between them refuse at the kit.

## The rules (in order: state is immediate, so a mark is counted before the rule that reads it)

| rule | when | if | then |
|---|---|---|---|
| `start` | `round.start` | | a message |
| `sidearms-only` | `round.start` | `loadout` is `sidearms` | `loadout.restrict` to `pistol` (held as rule state; see (b) 1) |
| `no-damage` | `player.hit` | | `hit.scale` 0: no hit does damage in paintball |
| `mark` | `player.hit` | not a team-mate's; the shooter not out; the victim not out; `loadout` `any`, or the hit's `weaponClass` `pistol` | the victim's `marks` +1 |
| `out` | `player.hit` | the victim not out, and his `marks` >= `hits` | the victim `eliminated`, `player.eliminate`, `score.award` `points` to the shooter's side, a message to him |
| `seal-wins` | `player.eliminated` | no terrorist alive | `round.end`, the SEALs |
| `terrorist-wins` | `player.eliminated` | no SEAL alive | `round.end`, the terrorists |

`marks` (int) and `eliminated` (bool) are player-scoped, reset each round. `eliminated` is what makes a hit count
once: a second hit on an out player, a hit from an out player, a team-mate's hit, a non-marker's hit and a kill the
room tells all count nothing (the `duplicate` and `disallowed` runs). Rounds, their count and their clock are the
layout's (the room's own settings).

## What is pack data and what is the engine's (spec section 11)

**Pack data** (this pack, editable by any creator): the configuration and its bounds, the two player variables, the
seven rules, the class list, the messages' words.

**Engine-owned** (the room and its rule host, FCW-31; claimed by nothing, configured by nothing here): every event --
the round's start, a hit (the room's own aim, shot and hit test: normal aim and shots), the elimination; every outcome
-- the hit's damage after the scale, the elimination (`player.eliminate`: out of the round, no respawn), the score, the
round's end and its winner; the budgets, the event order and the chain bound; presenting the messages as text. The pack
claims no built-in capability (no `behaviour.*` handler).

## FCW-13's record

The evidence kinds kept apart. In the authoring seat nothing ran: no unit test, typecheck, browser or gate (seat 91
runs the list at the pushed head). What did run: an esbuild transpile of the three test files (syntax only, not a
typecheck), a JSON parse of the three JSON files, and `sha256sum` / `wc -c` for the member row. Every check below is
**by reading, pending 91's run**, until 91 reports it.

**(a) What was possible unmodified.** Paintball's whole round: no damage from any hit (`hit.scale` 0), a hit that
counts only from a living opponent with a marker and only on a living victim, the configured marks eliminating
(`player.eliminate`), a point to the shooter's side (`score.award` with `team: {of: "attacker"}`), the round's end when
a side has none alive (`alive` with `count` 0 on `player.eliminated`), the loadout restricted as rule state. No change
to `creator-contracts/src`, `match/src` or viewer `src`, no handler claim, nothing beyond the published vocabulary.

**(b) What is missing** (filed under the plan's FCW-31 and FCW-35 rows; in this batch a missing primitive stops and is
filed, never built -- FCW-35 waits on H354):
1. *`loadout.restrict` enforced on the room's kits* (the missing primitive). Spec section 5: "`loadout.restrict` is
   held as rule state, not enforced on the room's kits". So a player may still carry a rifle into a paintball round;
   the pack makes the rifle harmless and markless itself (`no-damage` scales every hit to nothing, `mark` counts only
   a marker's) -- pack data, no engine path -- but the kit is not refused at the armory or the spawn. Wanted (general:
   any mode with an equipment rule): the room's kit gate reading the host's restriction.
2. *A list-typed configuration parameter* (or `{param}` for a `names` parameter): P1's "the list a config value" is
   not expressible in vocabulary 0; the nearest is the enum above (filed under FCW-35).
3. *What `loadout.restrict`'s `allow` names* (a weapon class, an item ref, an item id) is unpublished; `pistol`, the
   weapon class, is assumed (FCW-35).

Read off the published surfaces with care (each assumed as said here, so a red at 91's run on one is the
ambiguity's, not a paintball path's):
4. `forge.rules.test`'s recording room records an elimination but tells no `player.eliminated` (the room does,
   spec section 5), so the runs tell it themselves on the next tick; and the script's `player.hit` reaches the rules
   as an event, so `hit.scale` is not observable there -- the scale is proved through the page's room (P3 below).
5. `forge.rules.check` answers `{ report, record }` (FCW-34's review F1): read as such here.

**(c) The files this implementer read** (P4, hygiene; no fence for FCW-13): the rules contract spec; the plan's rows;
FCW-34's pack, run, README and tests (the frame); `creator-contracts/src/rules.ts` (the action specs, the types),
`layout.ts` (the catalogue functions); the contract's own paintball proof in `creator-contracts/test/rules.test.ts`
(its names were not taken: `hitsToOut`, `pointsPerOut`, `friendlyFire`, `paintball.marker` there; this pack's are its
own); viewer `forge/agent/api.ts`, `forge/matchRules.ts` (`rules.test`'s recording room), `forge/match.ts`'s host
wiring, `test/forge/matchRules.test.ts`; `match/test/creator/rulesHarness.ts` (the room rig P3 copies),
`rulesRetailParity.test.ts`, part of `rulesHost.test.ts` and `rulesExperiences.test.ts`; `@s2u/scene`'s `itemClass`.
And, to learn whether a primitive exists and what the recording room tells -- not to tune any value --
`match/src/creator/rules/host.ts` (`hit.scale`, `loadout.restrict`, `player.eliminate`, `disable`, `endStep`, the
snapshot) and `match/src/room.ts`'s rule seam (`ruleHitEvent`, `ruleView`). Every value in the pack is authored. The
pack's bounds match the contract's paintball proof (`hits` 1 in 1..10, `points` 1 in 0..100, the marks counter
0..10); this implementer had read that proof, so the match is not independent evidence -- copied or chosen alike, it
cannot be told.

**(d) Authoritative play and the clean disable (P3, written once; FCW-34's row points here).** Authority by
construction: every rule but the messages is server-side, and every outcome is the room's. Through the page's own
room (`LoopbackMatch`, solo, built as Play builds it: `forgePlayRules` -> `forgeRuleHost`; the rig of
`rulesHarness.ts`), one rifle round down the cone's centre: with the pack on and the default loadout, the hit is heard
and does nothing; with `any`, it eliminates and the side out ends the round; after `rules.clear` the layout plays no
rules -- the evidence is `forgePlayRules(layout)` returning null (no host is built) and the same round laying its
damage, the rifle in hand. The host's own disable (`RuleHost.disable()`, spec section 6; no page code calls it -- a
page's pack-off takes effect at the next Play) lets the damage through mid-match too
(`viewer/test/forge/paintballExample.test.ts`; 91's box, e1f217063: 12/12). The loadout half of P3 is owed with FCW-31's
kit primitive: seat 1 holds the rifle with the pack on as well, so "the loadout is open after the disable" asserts
nothing yet. Play in a rendered page is the e2e
(`forgePaintball.spec.ts`: "PLAY · Paintball", back, the export byte-equal): **NOT RUN** here, owed to 91's box; no
physical playtest.
