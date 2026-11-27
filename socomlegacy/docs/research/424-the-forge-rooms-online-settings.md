# 424 -- The Forge room's online settings: the equipment limit, respawn and the arsenal (FN-1a)

- Date: 2026-11-15. The Forge lane (`agent/wm-forge`), task FN-1a of the plan `docs/plans/2026-11-14-forge-next.md`
  (row FN-1, rulings FN.R3 and FN.R5; the FC2 plan's FC2.R2 and FC2.R8; HUMAN_TASKS H453 and H459); branch
  `agent/wm-forge-fn1a`, base `agent/wm-forge` 413eeb10df.
- Track: simulation. Status: **reading, pending review**. Every value the room applies is a reading that already exists
  (research 362, 348, 94, 95), re-used through the code that already transcribes it; what this task adds is the wiring --
  which code the Forge lobby's room calls -- and one central check over an existing table. **Nothing here is measured on
  the original running.**
- Evidence kinds, kept apart: **(D)** source inspection of the r0001 decompilation (`socom2_game.elf.decomp.c`, cited
  `FUN_<addr>` and `D:L<line>`), re-read for this note at the lines below; **(R)** the readings of research 362, 348 and 94,
  at their own levels; **(U)** unit tests over hand-built tables (`match/test/forgeRoomSettings.test.ts`,
  `central/test/forgeLobby.test.ts`); **(P)** a dev-disc test over every MP map's own tables
  (`match/test/forgeRoomArsenal.devdisc.test.ts`; run on the boxes, skipped without the disc); **(O)** the original
  running -- none.
- New names: none. No `*_READING` or `*_PLACEHOLDER` is added or changed (section 5 lists the existing ones the applied
  code reads).
- The owner's words this rests on: "i'm willing to start applying the vanilla map settings"; class 1 is "the disc map's
  environment ... with only match settings modified" ("first is good"); H459 answered 2026-11-15 ("what are our options?
  preferably they would be used"): a layout's lighting, fog and night play online as they do today.

## 0. The answer

1. **Three Map Settings leave the online hold** (`@s2u/creator-contracts` `ONLINE_HELD_SETTINGS_ADAPTATION`, FC2.R8):
   `arsenal`, `eqLimit` and `respawn`. A Forge lobby's create sends them, central admits them, the room applies them.
   `characters` (FN-1b: the room must lend kits and hit skeletons from other maps' archives) and the four world settings
   (`defaultMaterial`, `reverb`, `fov`, `loading`) stay held, refused online in the hold's own words as before.
2. **The room applies each by the page's own code**, so page and room agree by construction, and a test holds each
   agreement (section 4):
   - EQlimit and RESPAWN are the room's own options (`RoomOptions.eqLimit`, `RoomOptions.rules`), mapped by the page's
     `roomOptionsOf` (`viewer/src/forge/settings.ts`), which `ForgeGame.roomOptions` (`match/src/forgeGame.ts`) now calls.
   - The arsenal is laid over the base's kits by the page's `arsenalWith` (`viewer/src/forge/arsenalSetting.ts`), which
     the room's kits step (`match/src/forgeSimMap.ts` `forgeRoomKits`, called by `MatchServer.makeForgeRoom`) now calls
     on the kits `simKitsFromBytes` reads from the base's archive -- the same function the page's map loader reads them with.
3. **Central refuses, in words, an arsenal naming a valve or an item the engine's table does not know** (section 3): the
   main controller's safety rule. The room never throws on what passes: a pick the menu's rules refuse leaves that type its
   own kit and a `forge: arsenal: ` note.
4. **Nothing persists on a room between matches that did not before** (section 6): the options and kits are fixed at the
   room's construction, from the lobby's settings, for the lobby's life, as the players, rounds, round time and friendly
   fire already were.

## 1. EQlimit and RESPAWN

- **EQlimit** is GameStats byte 5 (D: `FUN_002f7c40` D:L196732-196733, re-read: its setting's value read at D:L196732
  and the fifth byte written at D:L196733; FN-1a's fresh review corrected this note's earlier D:L196733-196734, whose
  second line is byte 6's read), CREATE GAME's equipment restriction, 0 none, 1 pistols, 2 shotguns, 3 snipers, 4 no bombs (R:
  research 362 section 2, **reading**, reviewed). The room already plays it (`RoomOptions.eqLimit`; `Room.typeKit` through
  `equipmentLimitKit`, the valves through `equipmentLimitValves`; research 362 section 3). The layout's `eqLimit` (0..4,
  `parseSettings`' bound) is passed when not 0, exactly as the page's own Play room passes it (`roomOptionsOf`).
- **RESPAWN** is CREATE GAME's respawn row, `mp_allow_respawn` (R: research 348 section 1, **reading**, reviewed): the
  room's `rules: 'respawn'`. The rounds and round time are the layout's own `rounds` and `roundSeconds`, sent as they are:
  the page's `respawnSetting` already moved them to the respawn screen's defaults (`refresh_cg_screen`'s
  `mp_max_round_time` 1200 and `mp_max_rounds` 1, research 348 section 1) when the author left the classic ones, and kept
  an author's own; the room does not default them again. Classic when RESPAWN is off.
- The room's own rule still decides the rules played: respawn is SUPPRESSION's alone (LATER 153; `playedRules`,
  `FUN_002a7560` D:L149405-149431, research 192 section 2.2), so a respawn layout on a base of another read type plays
  classic, in the page's Play and the online room alike (one `Room` constructor). Type 0 keeps the choice
  (`RESPAWN_TYPE0_KEEPS_CHOICE_ADAPTATION`, an adaptation, research 192).

## 2. The arsenal

The layout's `settings.arsenal` (`ArsenalSetting`) is written in the two things a disc map already carries (R: research
94 part 1 and section A2-A5, **reading**):

- `valves`: `Enable_<item>` values over the base's `READERM.ZAR/mission.rdr` `Valves` (`@s2u/scene` `missionValves`), the
  masks 1 SEAL, 8 Terrorist (D: `FUN_0023c390` D:L87468-87478, re-read: the item's valve fetched by `FUN_003cf1f0`, the
  side's bit 1 or 8, no valve read as 0), 16 / 32 the C4 lock (`FUN_0023e910` D:L88527-88545). Each side's selectable
  items are recomputed by `selectableItems` over the merged valves.
- `kits`: per side, menu picks replayed on every one of that side's types' kits (`character.rdr` `default_weapons`, R:
  research 95) by `applyPicks` (`FUN_0023fef0` D:L89138-89323 with `FUN_0023eca0` D:L88610-89136; `slotLocked`,
  `selectable`), so a cost-2 item's round, a launcher's slots and the single items follow the menu's rules
  (`NO_DUPLICATE_ITEMS_READING`, research 378). The same for a cost-2 pick's partner: the last empty (255) slot among
  2-4 other than the pick's, the next slot (4 wrapping to 2) only when none is empty (D:L89166-89183; the port the same
  since ARSENAL-PARTNER, `arsenal.ts` `pick`). All but one: what comes back when a launcher leaves. The menu saves the
  item it displaces at +0x1530 (and +0x1531 for the M203 pair; D:L89196-89201, D:L89222-89316) and gives it back when
  the launcher leaves (`FUN_0023eca0` D:L88639-89126, 0x8f's branch D:L88657-88698); the port's `pick` forgets it and
  refills by `autoFill` (LATER 616) *(corrected 2026-11-24, NC-3 r13, r15)*.

The room's kits step, `forgeRoomKits(kits, layout)`, is `arsenalWith(kits, settingsOf(layout).arsenal)` with each refusal
prefixed `forge: arsenal: ` and joined to the composition's own `forge:` notes (`makeForgeRoom`'s `notes`, logged and
kept on the lobby as FP-1a's are). What it refuses, each the page's behaviour exactly:
- a valve no item is enabled by (not a value of `VALVE_OF_ITEM`, D: `FUN_003cf1f0` D:L322760-322968, 68 cases): not
  written, noted;
- a pick the menu's rules refuse on a type's kit (`applyPicks`' `slot`, `unknown`, `locked`, `refused`): that type keeps
  its own kit, noted with the side, the type, the pick and the reason;
- an arsenal over a base with no arsenal of its own (no kit source on the server, or a map whose `READERM.ZAR` has no
  kits): the kits as they were, noted "this map has no arsenal: its kits are the baked pair".

No arsenal, or an empty one, leaves the kits the very object read. The step reads no game type, so it is the same for
every game type a base supports.

## 3. Central's check: the safety rule

The main controller's rule (2026-11-15): a layout naming a valve or an arsenal item the room does not know is refused by
central with words -- never silently dropped, never crashing the room. Central holds no disc, so it checks on the static
table the engine itself reads, `@s2u/scene` `VALVE_OF_ITEM` (the transcription of `FUN_003cf1f0` D:L322760-322968, R:
research 94 section A2): `central/src/forgeLobby.ts` `arsenalNameRefusal`.

- Every valve **name** in `settings.arsenal.valves` must be one of the table's values (67 names).
- Every pick's item **id** must be one of the table's keys. The reading that settles this (D, re-read for this task): the
  menu offers an item for a slot only through `selectable`, whose last test is `valveAllows` -- the item's valve by
  `FUN_003cf1f0`, then the side's bit (`FUN_0023c390` D:L87468-87478); an id the table maps to no valve reads 0 there and
  is never selectable, so no pick of it is one the menu could make. The items with no valve (the M203 141, the LAW HEAT
  185, `FULL_SLOT` 254, the Detonator 193, and the other internal ids) reach a kit as a launcher's or a cost-2 item's
  fill (`pick`'s `launcherFill` and partner slot) or as a type's own `default_weapons` -- and the Detonator otherwise:
  `FUN_005c74e0` adds it beside a Claymore (153) when the kit holds none (D:L480166-480198) *(corrected 2026-11-24,
  NC-3 r20)* -- never as a pick. No item the menu
  can pick lacks a valve.
- A layout failing either is refused at the create (`refused: 'layout'`) and at the restart's reload (dropped, `why:
  'layout'`), before anything is placed or composed, with words naming the valve or the item id (the answer's `words`,
  and the log's `code: 'forge.ARSENAL_UNKNOWN'`, `words`). The words carry only a valve name (held by `parseLayout` to
  `Enable[A-Za-z0-9_-]{1,40}`) or an item id (0..253). Since FN-1a's fix round 1 (product track) the words reach the page:
  the create's 400 answers `{ refused: 'layout', words }` (`central/src/forgeLobbyHttp.ts`), and the page says "the
  server refused the layout: <words>" when they are 1 to 200 printable ASCII characters, else its 400 line
  (`viewer/src/forge/lobbyClient.ts` `FORGE_LAYOUT_REFUSED_WORDS`, `FORGE_LAYOUT_WORDS_MAX_ADAPTATION`).
- Central composes nothing: it refuses or passes. Past it, an item the disc's own table lacks (the table is the disc's;
  `VALVE_OF_ITEM` is the code's) is the room's `applyPicks` `unknown`: that type keeps its kit, noted, never thrown.
- Not changed: a pack reference and a switch script are refused as before (`onlineCreatorLayoutRefusal`); a layout
  carrying lighting, fog or night is admitted and applied as before (H459).

## 4. What holds each agreement

- (U) `match/test/forgeRoomSettings.test.ts`: `ForgeGame.roomOptions()` equals `roomOptionsOf` in `eqLimit`, `rules`,
  `maxRounds`, `roundSeconds`, `allowFriendlyFire` and `maxPlayers` for eqLimit 1 and 4 and for respawn at 1 / 1200 and at
  3 / 600; a Forge room made with eqLimit 1 reports `equipmentLimit()` 1, says it in every welcome and refuses a forged
  M4A1 pick `locked` (the room's own words, as `roomLoadout.test.ts`'s case); one made with respawn plays and tells
  `respawn`; the kits step equals `arsenalWith` (valves, selectable, every type's loadout), notes its refusals with the
  `forge:` prefix, never throws on an unknown item id, and leaves the kits the same object with no arsenal.
- (P) `match/test/forgeRoomArsenal.devdisc.test.ts`: each of the three presets (`ARSENAL_PRESETS`) over each MP base the
  disc holds -- every item id in every kit and every selectable id is one the disc's `ZWEAPON.ZAR` table holds (or 254 /
  255), every valve one the map's `mission.rdr` or `VALVE_OF_ITEM` names, and the room's kits step returns what the
  page's step (`mapWithArsenal`) returns for one input. That last check is the two functions' wiring only (FN-1a's fresh
  review, finding 3: both sides are handed one `SimKits` object); that the room's INPUT is the page's is a reading, not
  this test -- the room reads its base's kits by `simKitsFromBytes` over the base archive's bytes (`makeForgeRoom`), and
  the page's map loader builds `LoadedMap.arsenal` by the same function over the same archive's bytes (`loadMap.ts`). Its
  second case is section 7's (b) over every MP map.
- (U) `central/test/forgeLobby.test.ts`: the three lifted settings taken, `characters` and `reverb` refused in today's
  words, the unknown valve and the valveless item refused with words, the reload's three outcomes, a light rig, fog and
  night taken (H459), a pack still refused.

## 5. Constants the applied code reads (none new)

- `NO_DUPLICATE_ITEMS_READING` (`@s2u/scene` arsenal.ts; research 378) and `INGAME_AUTOFILL_SIDE_READING` (research 94
  section A5.4), through `applyPicks` and `pick`.
- `RESPAWN_TYPE0_KEEPS_CHOICE_ADAPTATION` (an adaptation, research 192), through `playedRules`.
- `RESPAWN_ROUND_SECONDS` 1200 and `RESPAWN_MAX_ROUNDS` 1 (research 348 section 1), through the page's `respawnSetting`.

## 6. Limits and what is not done

- **Nothing new persists on a room between matches** (source inspection of `match/src/forgeGame.ts` and
  `forgeProcess.ts`, `central/src/forgeLobby.ts`): `roomOptions()` is read once, at the lobby's create (central's
  `create`, a host's forge process), from the lobby's settings (`settingsOf(layout)`, kept on the lobby), and the kits at
  `makeForgeRoom`; the room is the lobby's one room for its life, its options and kits fixed at its construction as the
  players, rounds, round time and friendly fire already were. A match's abandon reopens the pre-match on the same room;
  nothing is rebuilt or carried. `Room.setEquipmentLimit` (a central world report's refresh of a game's room) has no
  Forge caller.
- **The refusal's words reach the page** since FN-1a's fix round 1 (section 3); before it the 400 had no body.
- `characters` stays held (FN-1b).
- **Not measured on the original.** What would settle the arsenal's online parity is a capture of the original's lobby
  with a map whose valves differ -- not available: the original has no layout arsenal; every value is the disc's own
  mechanism, written over by the layout (OT.R112's class 1, the owner's words above).

## 7. The lobby's window ARMORY agrees with the room (FN-1a fix round 2; reading, pending review)

FN-1a's fresh review (FAIL, finding 1; finding 2 folded by the Forge lane seat's call) found the lobby's window ARMORY --
the page, for a seat in an online Forge lobby -- offering what the room no longer plays: unrestricted under an EQlimit, and
the disc roster's kits rather than the laid-over map's. Both are corrected by wiring alone; no value or rule is added, and
the screen's own code (`viewer/src/armory.ts`, `armoryState.ts`, `equipmentLimit.ts`, untouched) does the rest.

- **The EQlimit.** The window's ARMORY world carries the lobby's EQlimit (`ArmoryWorld.eqLimit`), as the game lobby's
  ARMORY passes its `EQlimit` valve (`viewer/src/lobbyArmory.ts`) and the match's ARMORY the welcome's
  (`matchArmory.ts`). The value is the room's, by the room's own mapping: `roomOptionsOf(settingsOf(layout)).eqLimit`
  (page.ts `enterLobby`; `ForgeGame.roomOptions` calls the same function), handed to the popup
  (`ForgeLobbyOptions.eqLimit`) and by it to the window's ARMORY (`ForgeLobbyArmoryOptions.eqLimit`). Under a restriction
  the screen then runs research 362 section 2's rules as it does in the game lobby: no stored profile is loaded, the
  mode's rewrite runs on every entry (`openArmory`), the valves are `equipmentLimitValves`' and each type's kit
  `equipmentLimitKit`'s (R: research 362, **reading**, reviewed).
- **The type kits.** The window's data (`viewer/src/forge/match.ts` `lobbyArmoryOver`, called by `lobbyArmoryData`)
  takes each roster character's kit from the laid-over map's kits of its side and type index (`kits[side][index]`), the
  kits the room's `typeKit` reads (`typeLoadout` over the kits `arsenalWith` laid over). The screen then lays the EQlimit
  over these kits (`refreshContext`), as the room lays it over its own (`typeKit`): the same order on both sides.
- **(a) the index is the kits' index** (source inspection): `armoryRoster` (`@s2u/scene` armoryCharacters.ts) takes each
  character's kit as `mapKits(...)[side][index]` -- `index` the position its `UiVehicles` name finds in the side's
  `chartype.rdr` list, else its column's position -- so a roster character's `index` and `side` are the type index and
  side `MapArsenal.kits[side]` is ordered by: the map's kits are `mapKits` too (`mapArsenal`, read by `readMapArsenal`
  through `simKitsFromBytes`), over the same `chartype.rdr` (the map's `READERM.ZAR`), the same `character.rdr`
  (`RUN/READERC.ZAR`) and the same arsenal (`RUN/ZWEAPON.ZAR`). A map kit of another type or character than the roster
  names at the index is not taken (the roster's own kit stands): no mapping is guessed.
- **(b) with no override it is the identity**: by reading, both loadouts are `loadoutOf` over the same names, so equal;
  `lobbyArmoryOver` then returns the data's roster object itself. Held by (U) `viewer/test/forge/lobbyArmory.test.ts` on
  the fixture tree's maps (MP2, MP6, MP71, MP72: each roster character the map's kit of its side and index, and the
  identity) and by (P) the dev-disc file's second case over every MP map (run with the disc on a box at bc17576b77: both of the file's
  cases passed, none skipped).
- **What holds the agreement** (U, `viewer/test/forge/lobbyArmory.test.ts`): for one layout (a valve override, a pick,
  EQlimit 0, 1 and 4), the kit the window's real screen offers each type (`ForgeLobbyArmory` -> `Armory.context().kits`,
  over `mapWithArsenal` and `lobbyArmoryOver`) equals a real `Room`'s answer for that type (built with `forgeRoomKits`'
  kits and the EQlimit; its `loadout` answer is `typeKit`). The two sides share `arsenalWith` and `equipmentLimitKit`
  only; the roster's remap by index, the EQlimit's way to the screen and the screen's own restriction are each side's
  own code. The page's half (the popup given the EQlimit) is held on page.ts's source
  (`viewer/test/forge/lobbyHeldSettings.test.ts`).
- Not changed: the in-match ARMORY (it already reads the welcome's `equipmentLimit`); the room; the wire.
