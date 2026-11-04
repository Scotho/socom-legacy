# The Forge creator rules contract (FCW-S4, issue #532)

**Status: §4's vocabulary v0 frozen as data by FCW-30 (2026-10-27, landed with B152); the room runs it since FCW-31
(2026-10-27, branch `agent/fcw-31-rule-host`, pending its simulation-track review) -- §5 and §6 say what runs.**
FCW-30 froze, in `packages/creator-contracts/src/rules.ts`: the event,
condition and action names (`RULE_EVENTS`, `RULE_CONDITIONS`, `RULE_ACTIONS`) with each event's payload and each
action's parameters, ownership, the events it causes and the events it answers (`RULE_EVENT_SPECS`,
`RULE_ACTION_SPECS`); the graph's semantics (the module's header); `RulesSpec` and `validateRules(spec, catalogue)`,
refusing by name at validation; the budgets as `*_ADAPTATION` constants; `RULES_VOCABULARY_VERSION` 0 and
`ENGINE_CONTRACT_VERSION` 0.1.1 (additive: the patch under caret SemVer; was 0.2.0). In `layout.ts`: the record v3's `zones`, `markers` and `spawners` (additive,
absent when empty, no record version step) and the mode catalogue from installed rules packs (`rulesModeCatalogue`,
`forgeModeChoices`; no caller wired, FCW-32). In `handlers.ts`: the `behaviour` slot family (`BEHAVIOUR_SLOTS`,
`BEHAVIOUR_CAPABILITIES`; the zombies' chase and melee reserved). §11's five experiences validate as data
(`test/rules.test.ts`). **Authoring (FCW-32 steps 1-3, 2026-10-27, branch `agent/fcw-32-rules-authoring`, pending
review):** the Forge places, moves, locks and deletes zones, markers and spawners by authored id as its other rows, and
edits a layout's rules pack -- its spec, its configuration values as the layout's `mode.params`, the pack it requires
-- refused whole before any edit by `validateRules` against the layout's own entities, by FCW-30's F2 (a `brain` that
is no NPC brain, a release whose kind does not match its spawner's source) and by the mode's pack among the layout's
dependencies (viewer `forge/rulesAuthoring.ts`, `forge/agent/commands.ts`); the record's check takes the layout's modes
(`rulesModeCatalogue`) and the mode list is `forgeModeChoices`. The same over MCP: `forge.rules` (discover and read),
`forge.rules.check`, `forge.rules.export` (the rules as a v2 rules pack; past the control channel's inline bound,
refused `RULES_TOO_LARGE` with the chunked route), `forge.rules.import` (adopted with the pack's own reference, its files
kept and checked against that reference, re-sealed at the first edit of its rules; the whole request bounded the same,
`RULES_TOO_LARGE`), `forge.rules.test` (the layout's rules mode on the room's rule host over a scripted run, a recording
room, nothing applied) and the writes through `forge.edit`. Play runs the layout's rules mode on the page room's rule
host with the map's doors and switches (FCW-32 round 2, `forge/matchRules.ts`), and the rules' messages and hud values
show as text on the match's status chips (`forge/rulesPresent.ts`), and its cues are heard (FUI-23, FUI.R24, pending 91's
run and review; `forge/rulesCues.ts`): a `cue.play` name the match's own audio has (the map's banks, the menus'
HUDUI) plays without a place on its bank's volume group, a name it lacks plays nothing and is said once, at most 8 wait
and one a name a tick, and a locked output holds them under "Press ✕ to hear the cues" until a click, a key or the
pad's Cross (one older than 5 s then dropped -- FUI.R24 C3 amended 2026-10-27 by the dispatcher after FUI-23's e2e: the 5 s
run from the moment the cue could first have been heard, the later of its telling and the map's sound coming in; a play that
did not sound keeps it held for the next frame, on the same clock); a pack's own audio members are FUI-24. The record has no field for a
rules spec, so the spec rides beside it (the undo steps, an authoring envelope in the autosave, a named save's `rules`)
until the contract gives it one. The rules panel (FCW-32 step 4, FUI-18's rules half, FUI.R23; pending 91's run and
review): the right dock's Rules panel edits the configuration, variables and rules (a rule as JSON text, the refusal
under it naming its field) through the same planner edits, "Check rules" lists `checkForgeRules`' refusals, the Game
type select's Custom group lists the rules modes, zones, markers and spawners are placed from the panel and drawn as
editor-only gizmos and Outliner rows, and Play reads "PLAY · <mode name>" (`forge/panels/rulesPanel.ts`,
`forge/rulesGizmos.ts`); the node editor is later. The owner's direction is GitHub issue #532
(Craig, 2026-10-26, relayed into the UI seat that day: "adjust phase 4 as needed"). The plan that schedules it is
`docs/plans/2026-10-24-forge-creator-wishlist.md`, FCW.R18 and tasks FCW-30..34 with FCW-13..16 re-cast as examples.
**Track:** the contract, its validator, the authoring surfaces, the pack format and the example packs are the
product track (browser adaptations with no original). Whatever changes what a round does in a match -- the room's
event order, a rule that awards, damages, spawns or ends a round -- is held to the simulation track's process when it
is built (MISSION, the parity rule; OT.R53), and with every rules pack off the game is unchanged: retail rounds run
the existing per-type code, untouched.

## 1. The intent

Forge should let players make experiences the project never planned (Arma-style role play, battle royale, RPG,
survival, their own modes). The core team does not build each one; it builds **one public, versioned contract** and
proves it general by building several different modes **only** through it. A mode that needs something the contract
lacks gets a new *general* primitive, documented and open to every creator -- never a mode-specific engine branch.

## 2. What exists (the inventory of 2026-10-27, main `80b5658bb`)

- **Packs** (`creator-contracts`): `s2u-pack.json` v2 at the zip root, kinds `content | rules | system`, roles
  including `rules` (JSON), intents `cosmetic | gameplay-value | new-behaviour`, handler claims `{slot, handler,
  actions?, options?}` with bounded options, `ENGINE_CONTRACT_VERSION 0.1.0` (`packs.ts:14-182`). The `rules` role and
  the `new-behaviour` intent are validated but **read by nothing** in `src/`.
- **The extension host** (viewer `packs/systems/host.ts`): engine-owned lifecycles, leases, rollback, page-only; one
  slot, `visual.post` (`handlers.ts:39-41`); the `behaviour` kind is reserved for FCW-07c with **no slot**.
- **The match server** (`match/src/room.ts`): rules are hard-coded tables per game type 1..5 (`MODE_RULES`,
  `viewer/src/net/rules.ts:201-228`), kill and objective scores fixed (`room.ts:7280-7325`, `objectiveScore.ts`);
  engine hooks in `RoomOptions` (`beforeStep`, `onRoundStart`, `onRoundOver`, ...) used only by engine code (bots, the
  Forge NPC brain); **no internal event bus** (wire broadcasts and the recorder only); `random` defaults to
  `Math.random` (**unseeded**).
- **Zombies** is client-side only (viewer `zombies/`; its own health and damage on the page, MP72 only, refused in a
  networked match), so it is not yet an authoritative capability.
- **Authoring** (viewer `forge/`): a layout with pieces, spawns, NPCs, settings and objectives `{gameType, bomb}`; a
  `mode: {id, version, params}` field checked against a catalogue **no caller passes** (every mode is refused); no
  zone, trigger, volume or variable entity; MCP edit verbs per entity, snapshot undo (100), `checkMap` diagnostics.
- **Import**: users and agents import only the legacy kinds; a v2 pack has no import path (`PackRegistry.install` is
  called only by tests) and the shipped page resolves no pack content (`NO_CONTENT_SOURCE`).
- **Authority**: hits, damage, kills, score, round outcome, bomb, hostages, kits and pickups are the room's; online,
  `onlineCreatorLayoutRefusal` refuses a layout with packs, a mode or a content base (H273/H274 defaults).

## 3. One contract, three creator levels

The same typed **events, conditions, actions and state** serve every level; a level only changes how a creator writes
them, never what they mean.

1. **Configuration (no code).** A mode's published parameters -- equipment, scoring values, round count and time,
   spawn and respawn settings, team sizes, hit and damage settings (a damage scale per weapon class, one-hit
   elimination, friendly fire) -- as a schema with defaults and bounds. The Forge shows them as fields; a
   pack ships them as a `rules` member. Validation names the bad field.
2. **Visual rules.** Rules as data: `when <event> [if <conditions>] then <actions>`, composed into small graphs
   (example: *enter zone `vault` -> require item `key` -> open door `vault-door`, else show message*). The graph's
   semantics are frozen with the vocabulary (FCW-30) so a node editor can come later without changing any pack; the
   first editor may be a structured list.
3. **Programmatic scripting (future, not enabled).** Constrained creator logic over **exactly** the same versioned
   events, actions and permissions, for experiences the rules cannot express. Its boundary is designed now (a
   script sees what a rule sees and can do only what an action does); running uploaded code -- JavaScript,
   WebAssembly or anything else -- waits for its own reviewed design and the owner's word (H343; H272's default:
   declarative, engine-run, no pack code).

## 4. The vocabulary, version 0 (names frozen by FCW-30; bodies the builder's)

- **Entities with stable authored ids** (`[A-Za-z0-9_.-]{1,64}`, as the layout's): `zone` (a volume or region),
  `marker` (a named point), `spawner` (a source of players, NPCs or items), `item` (a pickup or a purchasable, with a declared price, stock and what it grants),
  `door`/`switch` (the disc's interactables, addressed by id), `team`, `player` (runtime), `variable`, `timer`, `phase`.
- **State.** Variables in three scopes -- `match`, `team`, `player` -- each typed (`int`, `bool`, `enum`), bounded,
  declared in the pack; timers; the current phase. **All rule state is server-owned** (§5). Reset: every variable,
  timer and phase returns to its declared start at round start (or match start, as declared).
- **Events** (emitted by the engine, never by a pack): `match.start|end`, `round.start|end`, `player.spawn`,
  `player.hit` (attacker, victim, weapon, amount), `player.death`/`player.kill`, `player.eliminated`,
  `npc.death` (the NPC, its spawner, the killer if a player), `zone.enter|exit`, `interact` (player, target id),
  `item.pickup`, `purchase.request` (player, item), `purchase.accepted` / `purchase.refused` (with the reason:
  funds, price, stock, phase), `objective.change`, `timer.fire`, `phase.change`, `spawner.empty` (a wave cleared;
  its count a variable). Each carries a **room-unique sequence id**; a rule fires at most once
  per event (duplicate-event protection).
- **Conditions**: compare a variable or an event field (`= != < <= > >=`), side/team of, player in zone, player has
  item, count of living players (per team / in zone), current phase, a **seeded** chance.
- **Actions** (allowlisted, typed, validated, budgeted): `variable.set|add`, `score.award`, `item.give|take`,
  `player.damage` (amount, cause -- the room applies it through its own damage path), `player.eliminate` (out of the
  round; paintball's one-hit rule is `player.hit` -> `player.eliminate`), `hit.scale` (a hit's damage multiplied
  before the room applies it, by weapon class -- a hit rule, server-owned; simulation track when built),
  `purchase.accept|refuse` (the room's answer to a request, after its own checks),
  `loadout.restrict`, `zone.enable|disable`, `zone.hazard` (damage per second inside or outside a zone -- the BR
  ring's primitive), `zone.reshape` (radius and centre over time), `spawner.release` (players, NPCs with the engine's
  existing brains, items), `door.open|close`, `phase.set`, `timer.start|stop`, `round.end` (winner),
  `match.end`, and the presentation actions `message.show`, `cue.play` (audio or animation), `hud.value` (a declared
  variable shown on the HUD).
- **Built-in capabilities** are engine handlers a pack claims by name (the extension contract's model): the existing
  NPC brains (patrol, sentry), the zombies chase/melee once it is server-owned, the bomb and extraction authorities.
  A pack configures them; it never re-implements them.

## 5. Ownership: server and client

Part of the first contract, not an S5 afterthought:
- **Server-owned** (the authoritative room -- the loopback room offline, a match server online): every event, every
  condition and action except presentation, all variables and timers, damage, inventories, currency, spawns,
  progression, scores, victory. A client never reports an outcome; a client's `purchase.request` is a request the
  room validates (funds, price at the request's sequence, stock) and answers once: `purchase.accepted` (the item
  given, the price taken) or `purchase.refused` with its reason.
- **Client-owned**: presentation only -- `message.show`, `cue.play`, `hud.value`, camera, audio and UI -- driven by the
  room's broadcast state, never deciding anything.
- **S4 proves it locally**: the Forge's Play runs the real `Room` in the page (`LoopbackMatch`, `solo: true`), so the
  same rule host runs there as it will on a server. **S5** (FCW-17..19) moves it to hosted rooms under H273/H274's
  approval; until then a layout with a rules pack stays refused online (`onlineCreatorLayoutRefusal`, unchanged).

**What runs (FCW-31, `packages/match/src/creator/rules/`).** The room (`room.ts`) builds typed events from its own
outcomes only when a rule host is attached (`RoomOptions.ruleHost`): `match.start`/`round.start`, `round.end`/`match.end`,
`player.spawn`, `player.hit` (bullet, shell, launched round, blast), `player.death`/`player.kill`, `player.eliminated`
(a classic death, or a rule's elimination), `objective.change` (the scored objectives), `interact` (a door by its scene
node, a switch by its valve). The host adds its own: `zone.enter|exit`, `item.pickup`, `timer.fire`, `phase.change`,
`purchase.*`, `npc.death`, `spawner.empty`. Server-side actions go through the room's own paths: `hit.scale` multiplies
the hit's damage before the room lays it (a blast's fragments laid again at the factor); `player.damage` and
`zone.hazard` on the body with the armour out of it (`RULE_DAMAGE_ADAPTATION`), a death the room's kill scored to no
one; `player.eliminate` kills and holds the seat out of the round's respawns; `score.award` on a seat's score rows or a
side's team carry; `round.end`/`match.end` through the room's round end; `door.open|close` through the door set;
`spawner.release` (re)spawns players, lays items, and asks the embedder to seat NPCs (`RuleNpcSeats`; the Forge's
brains are the page's). A client's `rulePurchase` (`{seq, item, price}`) is checked by the room (shape, a repeat or older
`seq` dropped `stale`, an unknown item dropped, then `phase`, `price`, `stock`, `funds` refused by name) before any rule
answers it; no rule answering, `phase` (`PURCHASE_UNANSWERED_ADAPTATION`). Presentation reaches the page as
`rulesPresent` (each seat's own, or every seat's), the pack's text never in the engine's result rows. A layout's player
spawner's team `A` is the rules' `seal` and `B` `terrorist` (`RULE_SPAWNER_TEAMS`: the Forge's slots put `A` on side 0,
the room's side 0 is the SEALs'). A weapon class is the room's own (`itemClass`, the kit tables' id ranges). The
named adaptations the room and host add, each a browser adaptation with no original: `RULE_DAMAGE_ADAPTATION` (above);
`RULE_BLAST_KNOCK_ADAPTATION` -- a blast hit the rules scale is laid again from the fragments the blast already drew, so
no random is drawn twice, and its knock is none at a factor of 0 (paintball's "no damage" must not throw a body) and the
unscaled blast's otherwise (the knock's strength is not re-derived from a scaled damage, which nothing in the original
defines); `RULE_ITEM_REACH_ADAPTATION` 40 world units -- how near (on the ground plane and in height) a living player's
feet take a rules item lying in the world, the order of a body's width so a player walking over an item takes it and one
passing a few steps away does not (the retail pickups have their own rule, `pickups.ts`, which a rules item does not
reuse). `hit.scale` factors multiply across the rules that match one hit, the product held to the contract's 0..10
(`RULE_ACTION_SPECS['hit.scale'].params.factor`, the same bounds as one factor), so several rules cannot compound a hit
past what one rule may. A `match.end` a rule answers on `round.end` ends the match with that round: the room hands the
host the round's end before it tells it (`RoomRuleHost.roundEnd`), so that round's `roundOver` and report are final and
`match.end` follows; a `match.end` from any later event finds the round already told and only marks the interval's
match as over. A `match.end` answering `round.end` takes no winner of its own: its `winner` is dropped and the
room's own wins name the match's winner, as for any final round (`host.ts`, the `round.end` / `match.end` action). And
`round.end` is handed to the host while the room's phase is still `play` (or `expired`), before the round is told: a
condition read then sees the round as it ended -- a classic player killed in it reads `out` true. Not yet:
`loadout.restrict` is held as rule state, not enforced on the room's kits; `item.give` of a weapon or equipment is a
rules inventory item, not a kit change; the zombies' chase and melee stay reserved (the room owns none, FCW-15).

## 6. Determinism, budgets and lifecycle

- **Seed**: a rules round takes the room's seed (a seeded `random` for rule chance, spawner order and loot; retail
  rounds keep theirs unchanged); two runs of one seed and one input record give one outcome.
- **Order**: events are handled in sequence-id order within a tick; an action's own events queue for the next step of
  the same tick, to a fixed depth (a chain bound), then the next tick.
- **Budgets** (named `*_ADAPTATION` constants, product track): rules per pack, actions per event, events per tick,
  chain depth, variables and timers per scope; exceeding one disables the pack's rules for the round with a
  diagnostic naming the rule -- never a partial or silent run.
- **Lifecycle**: enable at round start, disable and restore on pack-off, map switch or failure (the extension host's
  rollback model, server side); after disable the round is exactly the retail round.

**What runs (FCW-31).** The rules' random is the host's own (mulberry32 from the enabled seed and the round's count),
never the room's `RoomOptions.random`, whose retail default stays `Math.random`. Each event takes a room-unique rising id
(`RuleEventStream`); an id already taken is dropped. A tick's events are handled in id order -- at the step's end, or at
once when the room asks a hit's scale, after the tick's earlier ones -- with the rule state changed at once (FCW-30's
header); room actions are applied after the step's events, their events the next step, to
`RULE_CHAIN_DEPTH_ADAPTATION`, deeper ones the next tick. Past `RULE_EVENTS_PER_TICK_ADAPTATION` events in a tick the
pack is off for the round (`tripped`, a `rules.BUDGET` diagnostic naming the rules), the round's rule state back to its
start and nothing of that tick applied; the next round start turns it on again. A pack enabled waits for the next match
or round start; disabled, nothing of it remains. The proof: `test/creator/rulesRetailParity.test.ts` (the room with the
host present and no pack equals main's, recorder and round reports), `rulesHost.test.ts` (pack-off restores the retail
recording), `rulesExperiences.test.ts` (§11's five in a loopback room, one seed twice). Evidence: unit and room-level
tests only -- no rendered run, no physical playtest.

## 7. Packaging and versioning

- A rules pack is a v2 pack of kind `rules`, its rules in `rules`-role JSON members with intent `new-behaviour` (or
  `gameplay-value` for configuration only), claiming built-in capabilities through handler claims (a `behaviour`
  slot family, FCW-30). Its sides are `server` (rules) plus `client` (presentation members).
- The vocabulary has its own version; `ENGINE_CONTRACT_VERSION` moves to `0.1.1` when it lands (additive, so the patch under the repository's caret SemVer:
  `^0.1.0` packs keep loading; a rules pack states `^0.1.1`); a pack's
  `contract` range states what it needs; an unknown event, condition or action is refused by name at validation, not
  at play. Old packs keep loading.
- The Forge's mode list (`RecordMode`) becomes the catalogue of installed rules packs plus the retail types.

## 8. Ready for Thunderstore (format only)

The owner, 2026-10-26: Thunderstore indicated the project looks ready; nothing is final; packs
should fit their format now; loading from Thunderstore's API is a later sprint; no store page work. Their package
(wiki.thunderstore.io, "Creating a package", read 2026-10-26): a zip with `manifest.json` (`name` `[A-Za-z0-9_]` to 128,
`version_number` strictly `Major.Minor.Patch`, `website_url`, `description` to 250, `dependencies`
`"Team-Name-1.2.3"`), a 256x256 `icon.png` and `README.md` at its root (`CHANGELOG.md` optional), up to ~5 GB.
Our deltas, each a task item of FCW-33: a root `manifest.json` is today read as a legacy texture pack
(`registry.ts:439-440`); `.md` (and `.ogg`, `.wav`, `.gltf`, `.ktx2`) refused at import (`localFiles.ts:35-38`);
id grammars disjoint (ours lower-case with `.`/`-`, theirs `[A-Za-z0-9_]` with a team); pre-release versions allowed;
range dependencies vs exact pins; any `https://` string refused (`EXTERNAL_URI`), so their `website_url` cannot sit in
ours; the store's files must be members (or a defined exception) to pass `MEMBER_UNLISTED`; the digest covers name and
description. The team name is H342's.

**Status (FCW-33, 2026-10-27, branch `agent/fcw-33-pack-import`, pending review):** each delta closed in the format,
none by a fetch -- the pack-framework spec's "Thunderstore's package format" and "Rules packs" sections. A kind `pack`
import reaches `install`, and `s2u-pack.json` decides before a root `manifest.json` (a legacy texture pack with only its
root `manifest.json` installs as before); `.md`, `.ogg`, `.wav`, `.gltf`, `.ktx2` are read at import; the store files
are a defined exception outside the pack's digest; the export maps our id to `Team-Name` (the team
`THUNDERSTORE_TEAM_PLACEHOLDER`, H342), refusing collisions; store versions are strictly Major.Minor.Patch; ranges
export as exact pins; `website_url` is the export's, never ours; a checker tests a zip against the wiki's rules as data.
From FCW-30's review F4: a rules pack admits no engine before 0.1.1 (`CONTRACT_FLOOR`), and its handler claims and
`RulesSpec.capabilities` agree (`CAPABILITY_MISMATCH`). The Forge editor's surface admits a v2 pack for storage
(`forgePacks.ts`, as the solo room's does). Open: a spec naming two capabilities on one shared slot cannot be packed
(one claim per slot; LATER 518).

A re-import that changes only a store file (the README, the icon, the changelog, the store manifest) matches the
installed pack's identity (`previous`/`equalRef`) and returns the existing summary, by design: the store files are
outside the identity, so they are not refreshed in the record.

Known differences from the store (prose; none is a fix owed here): `.rgba` texture payloads are still refused at
import; our pack limit (512 MiB) is below Thunderstore's (about 5 GB), so a package the store would take can be
refused here; `website_url` is written empty or as an http(s) address, which is our rule, not the wiki's.

## 9. Missions use the same vocabulary

FCW-20's `MissionSpec` composes these events, conditions and actions (goals are phases and variables; triggers are
rules); no second trigger engine. FCW-20..23 keep their ids, order and owners.

## 10. Threat model (what a hostile pack or client can try)

- *Code execution*: no pack code runs (H272); rules are data the engine interprets; level 3 is closed (H343).
- *Denial of service*: rule storms, event chains, huge variable sets -> the budgets (§6), the pack's bounds
  (`packs.ts:39-53`), and disable-on-exceed.
- *Forged outcomes*: a client claiming a hit, a kill, a purchase or a pickup -> every outcome is the room's; requests
  are validated against server state at their sequence; duplicates are dropped by sequence id.
- *Stale or replayed requests*: a purchase priced at an old sequence, a request after the round ended -> refused with
  a named reason.
- *Escaping the sandbox of data*: unknown keys, external URIs, path escapes -> the existing validator's refusals.
- *Persistence abuse*: no rule state outlives the match in S4 (persistent player stats are a gap, §12).
- *Griefing through rules*: a pack that turns hazards, loadout limits or doors on the players who join it. S4 is
  local only (the creator's own loopback room); hosted rooms wait for S5, where the operator's approval (H274) and
  the join's declared requirements (FCW-18) name what a pack does before anyone joins it. The budgets still bound it.
- *Presentation faking an outcome*: a pack's `message.show` or `hud.value` claiming a win, a score or a reward the
  room did not decide. The engine draws the authoritative score, round result and winner itself; a pack's text is
  shown as the pack's (labelled, never in the engine's result rows) and `hud.value` shows only a declared variable's
  server value.
- *Online exposure*: no rules pack in a hosted room before H273/H274 (S5).

## 11. The proof experiences

| Experience | Events / conditions / actions it uses | New general primitive it justifies |
|---|---|---|
| Paintball (FCW-13) | `player.hit` -> `player.eliminate` (one hit); `loadout.restrict`; `score.award`; `round.end` by count alive | `player.eliminate`, `hit.scale` (general: any mode may scale or end on a hit) |
| Party (FCW-14) | `round.start`, `timer.fire`, `zone.enter` -> `cue.play`, `message.show` | timed cue lists (presentation only) |
| Zombies + shop (FCW-15) | `spawner.release` / `spawner.empty` (waves, a wave-count variable), `npc.death` -> `variable.add` (currency), `purchase.request` -> `purchase.accept` / `purchase.refuse` | a server-owned chase/melee capability (the client prototype ported once, claimed by name) |
| Battle royale (FCW-16) | seeded `spawner.release` (spawns, loot), `phase.set` + `timer`, `zone.reshape` + `zone.hazard`, `round.end` on last alive | `zone.reshape` / `zone.hazard` |
| Capture the flag (FCW-34) | `interact`/`item.pickup` (flag), `zone.enter` (base) with `player has item`, `score.award`, `item.take` | none allowed beyond the published API (the acceptance test) |

Each ships as a creator-editable, versioned pack; its README states which parts are pack data and which are
engine-owned handler capabilities.

Where issue #532's other checks live: save and reload of a layout with its rules -- FCW-32; repeatability,
duplicate-event protection, disable and rollback, malicious and stale requests, retail parity -- FCW-31; two clients
agreeing when hosting is authorised -- FCW-19 (S5); pack dependencies while authoring -- FCW-32; the simulated tests
kept apart from rendered and physical playtests -- every task's evidence, as the root AGENTS.md says.

## 12. RPG / role-play gaps (future extensions, not claimed)

| Need | Today | After FCW-30..34 | Beyond |
|---|---|---|---|
| Inventory and items | retail kits, pickups, world drops | `item`, `item.give/take`, has-item conditions | containers, stacking, weight |
| Currency and shops | none | match-scoped variables, validated purchases | cross-match economy |
| HUD and UI | engine HUD only | `hud.value`, `message.show` | pack-supplied widgets, menus |
| Dialogue | none | `message.show` on `interact` | dialogue trees, choices |
| Persistent player stats | retail career record only | none (match-scoped) | an owner decision on storage |
| Interactions | disc doors, switches, turrets | `interact`, `door.open/close` by id | authored interactables |
| NPC spawning | layout NPCs offline | `spawner.release` with engine brains | authored behaviours, factions |
| Roles and permissions | none | team/side conditions | per-player roles, admin tools |

## 13. Owner questions

- **H342** -- the Thunderstore team/namespace for our packs, and whether (later) the page may fetch packs from
  Thunderstore's API (an outside service). *Default meanwhile:* the format work only, the team name a named
  placeholder; no fetch.
- **H343** -- the scripting boundary: H272's default (declarative, engine-run) for S4, programmatic scripting its own
  reviewed design later. *Default meanwhile:* level 3 closed.
- Unchanged: H272 (no pack code), H273 (no gameplay packs in retail lobbies), H274 (no community gameplay content on
  match servers), H286 (no server-backed agent testing).

## 14. Out of scope here

Hosted rooms and joins (S5), the Thunderstore API and any store page, a node editor's UI (its semantics are in), any
code execution, persistent cross-match state, and every change to retail rounds.
