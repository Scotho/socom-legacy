# Capture the flag -- an example rules pack (FCW-34)

A browser adaptation with no original (product track, OT.R53): a creator game mode built only on the published
creator rules contract (`docs/specs/2026-10-27-creator-rules-contract.md`, vocabulary 0, engine contract `^0.1.1`). It
is issue #532's acceptance test: written by an implementer who built none of FCW-30..33, from the specs, the exported
types and doc comments of `@s2u/creator-contracts` and the Forge's MCP operations, with no change to the engine, the
contract or the Forge. With the pack off, the game is unchanged.

## The files

| file | what it is |
|---|---|
| `s2u-pack.json` | the v2 manifest: kind `rules`, sides `server`, contract `^0.1.1`, one member, intent `new-behaviour`, no handler claim |
| `rules/ctf.json` | the `RulesSpec` (`s2u-rules`, vocabulary 0): mode `ctf`, "Capture the flag" |
| `README.md` | this note; at the pack's root it is one of Thunderstore's store files, outside the pack's identity (FCW-33) |
| `../capture-the-flag.run.json` | not a member: the acceptance run -- the layout entities, a scripted run and the rule trace it must give |

No Thunderstore `manifest.json`, `icon.png` or `CHANGELOG.md` here (H342/H343's later sprint).

## The layout it needs

Four entities, placed in the Forge (the Rules panel's Place rows, or the agent's `forge.edit` `zone.place` /
`spawner.place`) before the pack is imported -- an import onto a layout without them is refused, naming the missing one:

| id | kind | what |
|---|---|---|
| `base-seal`, `base-terrorist` | zone | each team's base: a carrier entering his own base with the enemy flag scores |
| `stand-seal`, `stand-terrorist` | spawner, source `item` | where each team's flag lies; put each stand outside its base's zone |

Plus the layout's own team spawns (A the SEALs, B the terrorists). **No map door or switch is named** (O4): a pack that
names one is refused on a map without it (the room's host checks the map's doors and switches at enable), and CTF needs
none, so this pack plays on the blank floor and on any map base alike.

## The configuration

| parameter | default | bounds | what |
|---|---:|---|---|
| `capturesToWin` | 3 | 1..10 | captures that end the round with that team the winner |
| `capturePoints` | 1 | 0..100 | points the capturing player scores |

## The rules (in order: state is immediate, so a count comes before the rule that reads it)

| rule | when | if | then |
|---|---|---|---|
| `flags-out` | `round.start` | | lay both flags on their stands; a message |
| `seal-takes-flag` | `item.pickup` `flag-terrorist` | the taker is a SEAL | a message |
| `terrorist-flag-home` | `item.pickup` `flag-terrorist` | the taker is a terrorist | take it back, lay it on its stand again |
| `terrorist-takes-flag`, `seal-flag-home` | `item.pickup` `flag-seal` | the same, sides swapped | |
| `seal-captures` | `zone.enter` `base-seal` | a SEAL, holding `flag-terrorist` | take the flag, the SEALs' `captures` +1, `score.award` `capturePoints` to him, the flag back on its stand, a message |
| `seal-wins` | `zone.enter` `base-seal` | a SEAL, and the SEALs' `captures` >= `capturesToWin` | `round.end`, the SEALs |
| `terrorist-captures`, `terrorist-wins` | `zone.enter` `base-terrorist` | the same, sides swapped | |
| `seal-carrier-down`, `terrorist-carrier-down` | `player.death` | the victim holds the enemy flag | take it, lay it on its stand, a message |

`captures` is a team-scoped int, reset each round.

## What is pack data and what is the engine's (spec section 11)

**Pack data** (this pack, editable by any creator): the two flags as `token` items, the entity ids, the configuration and
its bounds, the team counter, the eleven rules, the messages' words.

**Engine-owned** (the room and its rule host, FCW-31; claimed by nothing, configured by nothing here): every event --
the round's start, a player taking an item lying in reach of his feet (`item.pickup`), a player entering a zone
(`zone.enter`), a death; every outcome -- the inventory (`item.take`), laying an item (`spawner.release`), the score
(`score.award`), the round's end and its winner (`round.end`); the seeded random, the budgets, the event order and the
chain bound; and presenting the messages as text. The pack claims no built-in capability (no `behaviour.*` handler).

## FCW-34's record: (a)-(d)

The evidence kinds kept apart. In the authoring seat nothing ran: no unit test, typecheck, browser or gate (the host
sat under its memory floor; seat 91 runs the list at the pushed head). What did run: an esbuild transpile of the three
test files (syntax only, not a typecheck), a JSON parse of the three JSON files, and `sha256sum` / `wc -c` for the
member row. Every check below is **by reading, pending 91's run**, until 91 reports it.

**(a) What was possible unmodified.** The whole of a one-life CTF: two flags as `token` items laid on item-spawner
stands at `round.start` (`spawner.release` with `item`); a flag taken by walking over it (`item.pickup`, the engine's
reach); a capture as `zone.enter` on the carrier's own base with `team` and `hasItem` (spec section 11's "`zone.enter`
with player has item"), `item.take`, a team-scoped counter (`variable.add`), `score.award` with a configured value;
the round's end at a configured count (`compare` against a `param`, then `round.end`, the count rule first because
state is immediate); a carrier's death sending the flag home (`player.death`, `hasItem` on the victim); a
take-and-re-lay at his own stand (no dropped flag) when a defender walks over his own flag; messages. No change to `creator-contracts/src`, `match/src` or viewer `src`, no handler
claim, no built-in capability, nothing beyond the published vocabulary. It validates as data (`validatePack`,
`validateRules`, `rulesModeCatalogue`: the tests, pending) and runs through the Forge's `forge.rules.test` (pending).

**(b) The missing generic primitives** (each general -- any mode with team-owned items, loot or lives needs it -- and
none worked around with a CTF path in the engine; filed under the plan's FCW-31 row):
1. *A pickup a rule can refuse.* An item lying in the world is taken by any living player in reach; no rule can
   refuse a pickup or make an item takeable by one side only. The pack takes a defender's own flag back and lays it
   again; a defender standing on his stand re-takes it every step, one pickup per tick (the re-lay lands after the
   tick's pickup scan) and far under `RULE_EVENTS_PER_TICK_ADAPTATION` (by reading). The scan runs in seat order, so a
   defender on his stand takes the re-laid flag each tick ahead of a later-seat attacker: guarding the stand blocks
   captures (FCW-34's review, F4). Wanted: a `pickup.refuse` answer on `item.pickup` (as `purchase.refuse` answers a
   request), or an item's side restriction.
2. *An item laid where a player is.* `spawner.release` lays an item only at a spawner, so a dead carrier's flag can
   only go home, not drop where he fell (classic CTF's dropped flag). Wanted: a release `at` the event's player (or
   an `item.drop {who, item}`).
3. *A player respawned by name.* `spawner.release` names no player. Spec section 5 says a release "(re)spawns
   players"; the gap is WHICH players: the host re-spawns every not-out player of the spawner's team, the living
   included, up to `count`, in seat order (FCW-34's review, F3) -- so a release cannot bring back one dead carrier
   without moving his living team-mates, and this pack is one-life CTF (the round's own respawn rules stand).
   Wanted: a `who` on the release (or a `player.respawn {who, spawner}`).

Undiscoverable from the published surfaces (contract ambiguities, filed under FCW-35's row; each assumed as said here,
so a red at 91's run on one of them is the ambiguity's, not a CTF path's):
4. The scope parameters several actions take (`...scopedTo` in `RULE_ACTION_SPECS` is not exported): `who` and `team`
   inferred from `RuleParamKind` and the rig of `rulesFacade.test.ts` (`who: 'player'`); `team: "seal"` assumed.
5. The `winner` values of `round.end` (a non-exported list): `seal` / `terrorist` assumed (`RULE_SIDES`).
6. Whether `hud.value` can show a team-scoped variable (it takes no scope): the pack shows captures only as messages.
7. A cylinder zone's `at` (its centre or its foot), `spawner.release`'s default `count`, and an item spawner's
   allowed `radius`: the run's geometry is chosen to hold either way (a base's zone straddles the floor; radius 10).
8. No rule host in `@s2u/creator-contracts`: a pack's offline check stops at `validateRules`, the run needs the Forge
   (`forge.rules.test`, whose answer's shape -- `fired`, `applied`, `variables` -- is read off the rig of
   `rulesFacade.test.ts`, not a published description; so is `forge.rules.import`'s `{files: [{path, text}]}`).
9. Whether the scripted run's recording room lays a released item (so a move onto a stand gives `item.pickup`) and
   emits `round.start`: the operation's description says "a recording room, nothing applied"; assumed yes for rules
   items and the round's start.

FCW-34's review (2026-10-27) re-filed this list: 4, 5 and 7's item-spawner radius are published, not ambiguities (the
exported spec values and `forge.rules`' vocabulary section; `round.end`'s `winner` is `seal | terrorist | none`; the
item reach is `RULE_ITEM_REACH_ADAPTATION`, spec section 5, and `layout.ts`' spawner doc) -- documentation the
implementer did not find, kept here as written; 8 is real and caused a real red (`forge.rules.check` answers
`{ report, record }`, read as the report until the review's F1). It adds three the list missed: which seat wins a
contested pickup (seat order), a player spawner's release moving living players (3 above), and whether a rules
inventory survives the room's own respawn. **The only behavioural evidence** for the pack is `ctfExample.test.ts`'s
`rules.test` on the real rule host; `examplesCtf.test.ts`'s `inZone` re-derives the host's cylinder test (a second
source of the geometry, harmless here) and its trace test checks a hand-written list's consistency only (F6).

**(c) Time, steps and tests.** 2026-10-27T21:05:35Z to 21:27:40Z for the claim, the RED and the GREEN (the notes after):
read the two specs, the plan's S4 rows and Log, the barrel's public surface (types and doc comments, bodies stripped
by a parse), the MCP operations and two tests' harness (the list is the plan's Log entry); claim and O1-O5 (`b4bd5a79c`);
RED, tests only (`742648943`): `creator-contracts/test/examplesCtf.test.ts` (11 cases), `viewer/test/forge/ctfExample.test.ts`
(7), `viewer/e2e/forgeCtf.spec.ts` (1) -- each red on ENOENT for the pack's files, by reading; GREEN (`0fe949266`): this
pack and its run. Pending 91: the three new files, `rulesFacade`, `rulesAuthoring`, `packs.test`, `rules.test`, `tsc`
for creator-contracts and the viewer, the e2e (served maps and the gateway's dependencies, else skipped and said).

**(d) Local authoritative play and clean disable.** Authority by construction: every rule is server-side (the
default), the only presentation action is `message.show`, and every outcome -- the pickup, the zone entry, the death,
the inventory, the score, the round's end -- is the room's and its rule host's (spec section 5). Play in the page's
loopback room is the e2e (`forgeCtf.spec.ts`: Play reads "PLAY · Capture the flag", back to the editor, the export
byte-equal): **NOT RUN** here, owed to 91's box; no physical playtest. Clean disable: `rules.clear` in the facade test
leaves no mode, no rules and no requirement, and `rules.test` has nothing to run (pending); that a round with the pack
off is the retail round is FCW-31's proof (`rulesRetailParity`, `rulesHost`), not re-proved here.
