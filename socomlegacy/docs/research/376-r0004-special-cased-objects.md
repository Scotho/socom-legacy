# 376 -- r0004's special-cased objects: the antenna shields, M63's Thermal Scope (dormant), and three edits with no port path (R4B-05, G13)

- Date: 2026-11-01. Task R4B-05 of the [r0004 plan](../plans/r0004-option-b.md), under the owner's ruling OT.R97
  (MISSION: r0004 is the specification for gameplay and front-end behaviour). Branch `agent/r4b-05`.
- Track: simulation. It changes what the game does: the shields of MP7's and MP12's antenna bases (which weapons can
  destroy them) and the Thermal Scope's availability on M63.
- Status: **reading, pending review** (R4B.R3). Nothing here is measured running. The r0004 addresses come from the r0004
  investigation's cluster note. This note's author re-read every site cited in §2, §3 and §5 with capstone in
  `game/overlays_r0004/socom2_game_r0004.elf` (the PINE dump) **and** the served decrypt
  `game/r0004/served/socom2_game_served.elf`. The words are identical in both over 0x26d230-0x26d460, 0x26e1d8-0x26e340
  and 0x2ae900-0x2ae950, and so are the strings at 0x4182d8, 0x418558-0x418590, 0x4186a8-0x4186d0 and
  0x41cde0-0x41cdf0. A reviewer who did not write this re-reads them before it counts as a reading (R4B.R4). dot
  corroborated only the raw constants: 0x42480000 at 0x26d3e8/0x26d3f8 and 0x41b00000 at 0x26d440/0x26d450. dot left the
  guards, the fields, the disc values and the other items unresolved
  (`agent-mail/evidence/r0004-dot/r0004-g11-g15-review.md`, "G13").
- Sources:
  - `C:/Projects/agent-mail/evidence/r0004-investigation/cluster-special-cased-objects-and-missions.md` (sections 1-6);
  - REPORT.md row G13 and the corrections at its foot (none touches G13; dot's F1-F4 bind the confidence).
  r0001 is cited `FUN_<addr>` / `D:L<line>` of `game/analysis/socom2_game.elf.decomp.c`. No decompiled or disassembled
  text is pasted.
- The data: `MP1.ZDB`, `MP7.ZDB`, `MP12.ZDB` and `M63.ZDB` have the same md5 in the r0001 and r0004 trees (the cluster's
  [bin]; F4 bounds "identical" to the inspected package). Every change is r0004's code applied to r0001's data at load.

## 1. The mission name the patch compares

Two routines key their edits on the mission's name:
- the set activation (§2) reads it through the pointer at r4 0x442f0c;
- the mission load (§5) reads it as its own argument.

r0001 holds the same name at the mission's `+0x1c` (`DAT_004364fc`). The mission load `FUN_002acc10` (D:L152294-152345)
points `+0x1c` at its own copy of the name it is given, and `FUN_001f6660` reads it at D:L55802 (r4 0x1f668c reads
0x442f0c at the same place). Every literal the patch compares against it is a lower-case archive stem:
- `mp1`, `mp7`, `mp12` at 0x418558-0x418568;
- `mp72` at 0x4182d8 (G15's guard, 0x25d88c);
- `m63` at 0x41cde0.

The port takes the name as the stem in lower case (`MISSION_NAME_READING`, scene `arsenal.ts` `missionNameOf`). Not
traced: the string the lobby and the campaign pass to `FUN_002acc10` (D:L47903, D:L123881, D:L126674, D:L148810).

## 2. The antenna shields (ported)

r4 0x26d1d0 is the set activation, r0001 `FUN_0026c600` (D:L116314-116388). Before the start loop, it compares the
mission name three times with `strcmp` (0x198f18): 0x26d240-0x26d2b4, giving `$s6` mp1, `$s5` mp7 and `$s4` mp12. Then,
for each animation of the set, it reads the animation's own name (r4 0x26fcc0, r0001 `FUN_0026edb0` D:L117899-117910):

| map | sites | name test | write |
|---|---|---|---|
| mp7 | 0x26d380-0x26d3fc | `strncmp(name, "ant_base1", 9)` (0x26d3ac), else `strncmp(name, "ant_base2", 9)` (0x26d3d0): a name **beginning** with either | `lui 0x4248` = 50.0 to `*(anim+0x30)+0x14` (0x26d3e8/0x26d3ec) and `*(anim+0x2c)+0x10` (0x26d3f8/0x26d3fc), each when the pointer is not 0 |
| mp12 | 0x26d400-0x26d454 | `strcmp(name, "ant_base1")` (0x26d428): exactly | `lui 0x41b0` = 22.0 to the same two fields (0x26d440/0x26d444, 0x26d450/0x26d454) |

- `anim+0x30` is the `Anim_Health` record. Its shield is `+0x14`.
- `anim+0x2c` is the built destructible. `FUN_002740e0` (D:L121148-121210) copies the record's shield to the object's
  `+0x10`.
- No kind test guards the write. MP7 holds two records per name:
  - kind 1, flags 0x21, with no `Anim_Health`: the null checks make the write a no-op;
  - kind 3, flags 0x23, at 1 / 0 / 9 (the destructible).
  The dev-disc case reads both. Research 203 s18 saw only the kind-1 entry; the kind-3 one is built. That note is not
  edited here.
- The edit runs at every activation, including the round reset (`FUN_002232a0`'s calls at r4 0x223568 and 0x223578), so
  the shield is never the disc's.

**The port.** The port's one table of scene objects is `MapMeta.scene` (viewer `sceneHealth.ts` `sceneOf` /
`destructiblesOf`). The page reads it through `loadMap.ts`; the room reads it through `simMap.ts`
(`WorldState(map.meta)`, match `room.ts` :2200). The room is authoritative.
- `readMapMeta` (viewer `mapMeta.ts`) passes the mission name.
- `destructiblesOf` takes each record's shield from `r0004ShieldOf` (`R0004_SHIELD_EDITS`) when the record's mission and
  name match, and from the disc otherwise.
- The match rule is r0004's: a prefix of nine characters on mp7, the exact name on mp12.
- Match `room.ts` is not changed: it reads `SceneHealth.shield`, `accepts` and `hitAt` as before.

**r0001, superseded by r0004 (OT.R97)** (R4B.R6): MP7's `ant_base1/2` shield 9 and MP12's `ant_base1` shield 12. These
are the disc's values, read through `parseAnimSets` and asserted as the reference in the dev-disc case. MP12's
`tower_hitme` (0.2 / 12) is not in r0004's list and keeps 12.

**What qualifies** (`FUN_003c7490` D:L318606-318621 for a hit, `shield <= rating + modifier`; `FUN_002739b0`, research
174, for a C4 plant, `shield <= Explosion_Damage`). The ZWEAPON ratings, read off the disc by `readKitTable` in the test:
- C4 is 18 and the satchel 20 (the RPG and LAW HEAT rounds are 20 as well, per the cluster);
- MPBOMB is 50.
So on MP7 only MPBOMB qualifies. On MP12 MPBOMB qualifies, and so does the scripted `air_to_ground_missile` (30, the
cluster's census; not a player's weapon). Every player's weapon but the bomb is refused. The plan's "only MPBOMB" holds
for the player's kit.

## 3. MP1's outhouses (moot: the room decides)

r4 0x26d300-0x26d37c sets bit 4 and then bit 3 of byte+4 on each kind-3 animation whose name begins with `outhouse`
(`strncmp` 8, 0x26d340), on mp1 only. On the disc, `outhouse1/2` are flags 0x23; r0004 makes them 0x3b.
- **Bit 4** broadcasts the destruction. With bit 4 set, `FUN_002734b0` (D:L120782-120797) sends a type-8 record through
  `DAT_00414bfc` = `FUN_002bb880` (set at D:L159041), which online sends message 0x40 to every console.
- **Bit 3** applies the authority guard. With bit 3 set and the round's `+4` bit 2 clear, `FUN_00273a50`
  (D:L120980-120988) holds the health at 0.01.

**Moot.** The port already does what the two bits do:
- The room is the one authority for every scene object's death (`SCENE_DEATH_AUTHORITY_READING`).
- The wire carries the death to every page, as the target's state turned off (`SCENE_DEATH_ON_WIRE_READING`
  `'targetOff'`).

The dev-disc case pins this on MP1: a qualifying hit in the room's `WorldState` kills each outhouse and turns its target
off. No console decides an outhouse on its own, so r0001's possible disagreement (the cluster's motive, an inference)
cannot arise. §2's trace is r0001's own network path for a flagged scene death: bit 4, `FUN_002734b0`, `FUN_002bb880`,
message 0x40. It names the path the `SCENE_DEATH_ON_WIRE_READING` doc says is "not traced", for the bit-4 animations;
that row is not changed here.

## 4. MP12's tower debris and `zoom_flash_fire` (moot: no consumer)

The animation load is r4 0x26e120, r0001 `FUN_0026d370`. After the name table is read (0x26e1dc), r0004 makes two edits:
- **MP12 `tower_part_fly`** (0x26e1e4-0x26e2e4): on mp12, at the first name-table entry equal to `m17` (0x4186c0), r0004
  calls the new 0x2695d0 with `mp12` (0x4186a8). That points the entry at the set's interned `mp12`, so
  `OBJECT_ADD_CHILD(ref2, caller)` re-parents each tower part to the map's root.
  **Moot.** The port's scene programs run through `WorldState.runProgram` (viewer `worldState.ts`), which has no
  `OBJECT_DELETE_CHILD`, `OBJECT_ADD_CHILD` or `OBJECT_MOTION`; `@s2u/scene` `effects.ts` decodes the two child commands
  by name only. The port shows neither r0001's detached part nor r0004's flight, and nothing reads the reference the
  rename changes. The reference's only reader is `readMapMeta`'s placement diagnostic (`m17` is not placed on MP12).
  When scene programs get the child and motion commands, this rename comes with them: a name-table rewrite at load, mp12
  only.
- **`zoom_flash_fire`, every map** (0x26e2e8-0x26e33c): r0004 clears byte+5 bit 4 (flags bit 12) of the common set's
  `zoom_flash_fire` (`CZANIM.ZAR`, flags 0x10a2, the cluster's [data]). With the bit set and the root reference empty,
  `FUN_0026f210` (D:L118066-118097) allocates a 0xC0 node named `%s::created_root` at each start.
  **Moot.** No port code reads flags bit 12. The port's light plays at the weapon's node (viewer `effects.ts`, the
  `light` case) and allocates no scene node per start. Whether r0001's node leaked (the cluster's inference) does not
  arise.

## 5. M63's Thermal Scope (ported)

r4 0x2ae920-0x2ae944 is the mission load, r4 0x2ae5e0 (r0001 `FUN_002acc10`, D:L152294-). The mission name is `$fp`, the
function's second argument (0x2ae5f0). After `mission.rdr`'s `Valves` loop, when `strcmp(name, "m63") == 0` (0x2ae928,
`m63` at 0x41cde0), it calls r4 0x36f700 with:
- the valve `Enable_ThermScope` (0x41cdf0);
- the value 1 (0x2ae938): the SEALs' bit, research 94;
- the type 2 (0x2ae944).
r4 0x36f700 is r0001 `FUN_003520d0`, the same call the loop makes at its end. The loop's own types are 1 PERM, 2 TEMP and
3 PERSIST (research 104 §4.2).

On the disc, `Enable_ThermScope` is absent from M63's, M71's and M83's `mission.rdr` and present on the other nine
campaign missions. The dev-disc case checks M63, M71 and M83 against M61. r0004 adds it to M63 only.

**The port.** `@s2u/scene` `missionValves(mission, name)` (scene `arsenal.ts`) is the transcription of the loop. With the
mission name, it applies `R0004_MISSION_VALVES` after the loop. The ARMORY's world valves (viewer `armoryData.ts`
`armoryFromDisc`) pass `missionNameOf(archive)`.
- **Dormant: no live consumer** (corrected at the review fold, 2026-11-01; was "the forge's lobby offers it").
  - No `armoryFromDisc(..., { world: true })` caller reaches M63. Each goes through `missionMapPath` (viewer
    `lobbyMatch.ts`), which maps `mp<n>` only. The worker's armory request passes no `world` (`worker.ts`).
  - The forge's ARMORY takes its world valves from `LoadedMap.arsenal` (`forge/match.ts`), that is
    `simKitsFromBytes` -> `readMapArsenal`.
  - The room checks picks against the same kits (match `room.ts`, `loadout`: `applyPicks` over `kits.map.valves`).
  - `readMapArsenal` needs `READERM.ZAR/chartype.rdr`, and M63's archive has none: it throws, `simKitsFromBytes` holds
    `map: null`, and the room's and the forge's valves on M63 are empty -- no item at all is allowed there, the Thermal
    Scope with the rest. Carrying the mission name into `readMapArsenal` alone would reach nothing.
  - So `R0004_MISSION_VALVES` holds the transcription, and `armoryFromDisc`'s world valves on M63 carry it, but nothing
    the page or the room plays reads them. A latent split stays: were a campaign ARMORY ever opened through
    `armoryFromDisc`, its valves (with the scope) and the room's (`readMapArsenal`, without the mission name) would
    disagree. The root fix -- campaign kits read, and the mission name carried into `readMapArsenal` /
    `simKitsFromBytes` from the room's and the page's loads -- is **LATER 618**.
- A TEMP valve is dropped at the mission's teardown. The port builds its valve map per load, which comes to the same.

**r0001, superseded by r0004 (OT.R97)**: M63's ARMORY without `Enable_ThermScope` (the disc's `mission.rdr`).

## 6. M61's crate logo (noted, not ported)

r4 0x336b20, r0001 `FUN_00319580`, paints a printed logo out of two M61 bitmaps:
- `ld_m61_prog.tif`: three rectangles, 452 pixels;
- `m61_2.tif`: six rectangles, 378 pixels.
The painting runs at the UI library's load, through the new 0x2dd8c0 and 0x2dda00 (the cluster's §4 has the
rectangles). The port shows neither bitmap: no campaign loading or briefing screen. The plan defers this "until textures
need it". The in-game crate textures that share the scrub belong to G1 (the collision cluster), not this row.

## 7. Tests

`viewer/test/sceneObjectsR0004.test.ts`:
- the rule table, by mission and name: the prefix on mp7, exact on mp12, mp71 and an unnamed mission refused;
- `MISSION_NAME_READING`;
- `missionValves` on the `parseRdr` shape the arsenal test uses.
Its dev-disc cases (`SOCOM_DISC`; they skip without it, and a skip is said):
- MP7: the disc's two records per base (r0001's 9); the room's table at 50; C4's 18 and the satchel's 20 refused,
  MPBOMB's 50 accepted (ZWEAPON's ratings through `readKitTable`).
- MP12: r0001's 0.2 / 12 on `ant_base1` and `tower_hitme`; `ant_base1` at 22 (20 refused, 50 accepted); `tower_hitme`
  still 12.
- MP1: the outhouses' 0x23 on the disc; the room's kill turns the target off (§3's pin).
- M63: the three missions without the valve and M61 with it; M63 with it under r0004; M71 and M83 without;
  `armoryFromDisc`'s world valves on M63.

`central/test/thermalScopeR0004.test.ts` (the review fold; dev-disc) pins §5's dormancy: M63's `readMapArsenal` throws
on the missing `chartype.rdr`, `simKitsFromBytes` holds no map arsenal, the room's valves on M63 are empty, and MP2's
read as the disc's.

## 8. Readings

| Name | Status and evidence needed |
|---|---|
| `MISSION_NAME_READING` | scene `arsenal.ts`: `'stem-lower-case'`. The mission name r0004's per-map rules compare (r4 0x442f0c; r0001 the mission's `+0x1c`, `DAT_004364fc`, set by `FUN_002acc10` D:L152294-152345) is the archive stem in lower case, as every literal the patch compares it with is (mp1, mp7, mp12, mp72, m63). Reading, pending review. Open: the string the lobby and the campaign hand `FUN_002acc10` traced (D:L47903, D:L123881, D:L126674, D:L148810), or 0x442f0c read over PINE in a PCSX2 `--build r0004` round on MP7. |
| `OUTHOUSE_NETWORK_FLAGS_R0004_READING` (*note only*) | moot: r0004 sets MP1's outhouses' flag bits 4 (broadcast) and 3 (authority guard), r4 0x26d300-0x26d37c. The room is the one authority and the wire carries the target's state (§3). Open only if the port ever lets a page decide a scene death. |
| `TOWER_PART_REPARENT_R0004_READING` (*note only*) | moot: r0004 renames MP12 `tower_part_fly`'s `m17` reference to `mp12`, r4 0x26e1e4-0x26e2e4 and 0x2695d0. The port's scene programs run no `OBJECT_DELETE_CHILD`, `OBJECT_ADD_CHILD` or `OBJECT_MOTION` (§4). Owed with those commands: the rename at load, mp12 only. What r0001 shows (the parts vanish) and what r0004 shows (they fly) is settled by a capture of MP12's tower on each revision. |
| `ZOOM_FLASH_CREATE_ROOT_R0004_READING` (*note only*) | moot: r0004 clears `zoom_flash_fire`'s flags bit 12, r4 0x26e2e8-0x26e33c. No port code reads bit 12, and the port allocates no node per light start (§4). Whether r0001's `created_root` nodes are freed (`FUN_00271650`, the end path) is not read. |

`R0004_SHIELD_EDITS` (50, 50, 22) and `R0004_MISSION_VALVES` (M63's `Enable_ThermScope` 1) are not stand-ins. They are
the transcription, at the same "reading, pending review". The cluster's §8 runs would take them to proven: a PCSX2
`--build r0004` MP7 and MP12 load with each base's `+0x30`/`+0x14` and `+0x2c`/`+0x10` read live over PINE (the plan's
"to proven"), and M63's ARMORY on r0004 showing the Thermal Scope.
