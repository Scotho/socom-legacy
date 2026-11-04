# 104 -- The valve store and the UI variables: the VALVE ops, the watchers, longevity, the serialize rule, the defaults (web sprint 6, PLAT-09)

Written 2026-10-01 for web sprint 6 (plan `../plans/2026-10-01-web-sprint-6-foundations.md`, task PLAT-09; the task's
block is `../roadmap/01-platform.md` "PLAT-09"). Read-only research. Sources: the retail decompilation
`C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c` (`D:L<n>` = its line; every address **retail**; r0001), the
retail ELF on the disc (`game/disc/socom2_game.elf`: the short strings the strings list leaves out, and one instruction,
read by address through its program headers), the binding names in `recomp/socom2_names.csv`, reCOM
`research/recom/src/gamez/zValve/zvalve.h` and `zUI/zui.h:27-52` (SOCOM 1; used only where the decompilation agrees),
and the disc's `RUN/READERC.ZAR` and `RUN/UI/READERC.ZAR` read with the repository's `@s2u/archive` (`Zar`, `parseRdr`)
by a probe outside the repository (names and counts only; no game bytes in git). The code is
`packages/ui/src/valves.ts` and `packages/ui/src/uiVars.ts`; their tests (`packages/ui/test/valves.test.ts`,
`uiVars.test.ts`) are transcribed from the lines cited here, each naming its function and lines.

## 0. Answers

| # | finding | where | section |
|---|---|---|---|
| R104.1 | **The VALVE ops 0-18** are `FUN_00353fd0` (D:L252128-252345), the VALVE command's tick (its slot 0x353d00, registered at D:L252352, is `j 0x353fd0` with the command +4 as the argument -- read off the ELF). Tests 0-10 return their truth and write nothing; assignments 11-18 write and return true; an op past 18 returns false; a valve the registry does not hold returns false and nothing is made | `valves.ts` `ValveStore.apply` | §1 |
| R104.2 | **The ops read the operand's low 16 bits** (D:L252180), but **an assignment compares the u16 held with its full 32-bit result** and stores the low 16 bits. So `+=` wraps (0xFFFF + 1 stores 0), `-=` floors at 0, `*=` stores the product's low 16 bits and can fire with the value unchanged (2 x 0x8001), `|=~` fires every time, and op 9 `|~` is true at every edge | §1's table | §1 |
| R104.3 | **The watcher rule** (`FUN_003519f0` D:L250781-250803): a write whose result differs from the u16 held calls every watcher of that valve, in the order added, whose mask holds the event -- **1 when the result is non-zero, 2 when it is zero** (the result as computed, not the u16 stored). A write of the same value calls none. The watcher is called `fn(valve, ctx)`: it is not told the event | `ValveStore.watch`, `fire` | §2 |
| R104.4 | **The registry** is one global list (0x49e800) in creation order; names are matched with `strcmp` (case-sensitive). A valve's **type** is 1 PERM, 2 TEMP, 3 PERSIST; find-or-make promotes (PERM over TEMP, never over PERSIST; PERSIST always; TEMP never); the level's teardown drops the TEMP ones | `ValveStore.acquire/set/remove` | §3 |
| R104.5 | **The persistent valves** are the PERSIST ones, written as `{NAME, VAL}` in registry order under `PersistentValves` (`FUN_00352a90` D:L251463-251483) and read back at PERSIST (`CValveSaveManager_UnSerialize` `FUN_00352960`). **`global_valves.rdr` declares 65 of them** -- the roadmap's "count of 65 (a reading, O15)" is this file's count | `persistentValves`, `restorePersistent` | §3, §6 |
| R104.6 | **Valve defaults come from data and code, not from `UiParams.rdr`**: `RUN/READERC.ZAR` -> `global_valves.rdr` (185 entries, 65 PERSIST, the rest PERM by the loader's default; 23 non-zero), read by `CValve_Open` at boot (D:L152619); each map's `mission.rdr` `Valves`; a few code writes (`R_NAME_SIZE` 31, `MAX_CHAT_TEXT_LENGTH` 99); every other valve is made at 0 by the first find-or-make (a VALVE command's parse makes its valve at TEMP, 0). `UiParams.rdr` holds only the soft keyboards | `loadValves`, `loadMissionValves`; no default is carried in code | §6 |
| R104.7 | **The UI variables' longevity**: 0 dormant (a free slot), 1 temporary, 2 permanent, 3 persistent (`zui.h` UIVAR_LONGEVITY; the code's own words `TEMPORARY`/`PERMANENT`/`PERSISTENT`, `CUIVariableSpec` D:L280328-280346, default 1). Temporaries are made dormant at the state changes that call `FUN_00385c30`; `CUIVarManager_Add` only raises a longevity, and sets a held var's value only while it is temporary | `uiVars.ts` | §4 |
| R104.8 | **The manager** holds **256 slots** (D:L328198) of reader nodes -- integer, real (an f32), string or array, or the type-0 empty node a never-used slot starts with (fix round, §4); lookup by name is `strcasecmp`; a new name takes the first dormant slot, so the order is slot order, not creation order | `UiVarManager` | §4 |
| R104.9 | **The serialize rule** (`CUIVarManager_Serialize` `FUN_00385670` D:L279374-279407): every live var of longevity 3 with a name, in slot order, as a record keyed by its name -- except `PLAYERPASSWORD` and `STORE_PASSWORD` while the valve `SecurePassword` is 0 (`global_valves.rdr` makes it PERSIST at 1, so by default they are written) | `uiVarsToSerialize`, `serializeUiVars` | §5 |
| R104.10 | *Revised 2026-10-07 (web research 302 §4; the rework's review confirmed it on the disc and the decomp): the end state below holds only until an OPTIONS page's slider is built. Each slider's `UIVAR` spec is `LONGEVITY PERSISTENT` (`dlgOptions_Audio.rdr`'s four, `dlgOptions_Video.rdr`'s BRIGHTNESS, `dlgControllerSelection.rdr`'s three); the slider's set-up `FUN_003724f0` adds its var at D:L269307 through `CUIVarManager_Add` `FUN_003857c0`, which raises a longevity (D:L279438-279440), so the tuner is persistent from then and R104.9's serialize writes it; the load reads it back (`UI_VAR_MODULE_TUNERS_READING`). Decided by the code; OPT-03's save-and-relaunch run is the proven level.* **`InitSystemTuners`** (`FUN_0038a7a0` D:L282238-282472) adds its eight vars at longevity **1** and then **stores 2** over it (a direct write, so a persistent var is lowered); it writes five real defaults (SOUND_VOLUME 1.0, MUSIC_VOLUME 0.74, BRIGHTNESS 0.5, DIALOG_VOLUME 1.0, HEADSET_CONTROLLER 0.75); the three STICK vars are bound twice and get none. At 2 they are never in the UI vars' serialize | `SYSTEM_TUNERS`, `initSystemTuners` | §4 |
| R104.11 | **Where this differs from research 95 §1.3 and from `viewer/src/uiScript.ts`**: op 0 is "true", not "the value is non-zero"; op 9 is always true; the operand is masked to 16 bits before every op; "a change fires the watchers" is "a 32-bit result unequal to the u16 held", with a 1/2 event and masks; reCOM's `OP_TYPE` numbering is SOCOM 1's and does not hold | §7 | §7 |

**The proven level** is PLAT-32's: a script-trace golden showing the same valve values after the main menu's ONSTART.
Everything here is the reading level (the decompilation and the disc, tests transcribed from the lines).

## 1. The VALVE ops (`FUN_00353fd0`, D:L252128-252345)

The command (0x10 bytes, made by the parse `FUN_003535d0` D:L251733-251972): +4 the valve reference, +8 the operand
(a 32-bit word: an integer, a float truncated to one, or a valve), +12 the op byte, +13 the flags -- research 95 §1.3's
layout, confirmed: flag 1 the reference is the context's input valve (`FUN_002721c0`), flag 2 a name (`FUN_0026eb30`),
neither the valve itself; flag 0x10 the operand is a valve, with 0x04 the context's, 0x08 by name, neither the pointer
(D:L252142-252179). An operand valve that is not found reads 0 (D:L252175-252178). **`cur`** below is the u16 held
(+4), **`op`** the operand's low 16 bits (D:L252180), every comparison unsigned.

| op | word (`FUN_00353d10` D:L251999-252126) | lines | what it does |
|---|---|---|---|
| 0 | (none matched) | D:L252182-252184 | true |
| 1 | `!=` | D:L252185-252187 | cur != op |
| 2 | `==` | D:L252188-252190 | cur == op |
| 3 | `>` | D:L252191-252193 | op < cur |
| 4 | `<` | D:L252194-252196 | cur < op |
| 5 | `>=` | D:L252197-252199 | op <= cur |
| 6 | `<=` | D:L252200-252202 | cur <= op |
| 7 | `\|` | D:L252203-252205 | cur != 0 or op != 0 |
| 8 | `&` | D:L252206-252208 | (cur & op) != 0 |
| 9 | `\|~` | D:L252209-252211 | (cur \| ~op) != 0 in 32 bits: `~op` keeps its upper 16 bits set, so **always true** (the decompiler's `uVar4 != 0xffffffff` with `uVar4` at most 0xFFFF) |
| 10 | `&~` | D:L252212-252214 | (cur & ~op) != 0 |
| 11 | `=` | D:L252215-252228 | result op |
| 12 | `+=` | D:L252229-252243 | result cur + op (up to 0x1FFFE) |
| 13 | `-=` | D:L252244-252263 | result 0 if cur < op, else cur - op (**floored at 0**) |
| 14 | `*=` | D:L252264-252278 | result cur x op (32-bit) |
| 15 | `\|=` | D:L252279-252293 | result cur \| op |
| 16 | `&=` | D:L252294-252308 | result cur & op |
| 17 | `\|=~` | D:L252309-252323 | result cur \| ~op (32-bit, upper bits set) |
| 18 | `&=~` | D:L252324-252338 | result cur & ~op |
| 19+ | -- | D:L252339-252340 | false, nothing written (the op byte is read unsigned -- `lbu` at 0x3540e8, then `sltiu 0x13` -- so 0x13-0xFF land here; corrected in the fix round: the first version said "as a signed char", which the decompiler's `(char)` suggested; the outcome is the same) |

**The write (ops 11-18).** Each computes its result as above, compares the u16 held with the **whole result**
(`*(ushort *)(valve + 4) != result`), stores the result's low 16 bits, and on a difference calls the watchers with
event 2 if the result is 0, else 1 (e.g. D:L252216-252226). The edges that follow, each a row of
`valves.test.ts`:

- `=` compares and stores the operand's low 16 bits: 0x10007 onto 7 is no change; -1 stores 0xFFFF.
- `+=` wraps: 0xFFFF + 1 stores 0 and fires event **1** (the sum 0x10000 is non-zero).
- `-=` floors: 3 - 5 stores 0 (event 2); 0 - 1 is no change; an operand of -1 is 0xFFFF and floors any value to 0.
- `*=` stores the low 16 bits of the 32-bit product: 0x100 x 0x100 stores 0 with event 1; **2 x 0x8001 stores 2 and
  still fires** (0x10002 differs from 2); 0xFFFF x 0xFFFF stores 1.
- `|=~` always fires (its 32-bit result is at least 0xFFFF0000), with event 1, even when the u16 is unchanged.
- `|=`, `&=`, `&=~` and `-=` cannot exceed 16 bits: they fire exactly on a change.

**The return.** A test's truth, true for every assignment, false past 18; false (and nothing done) when the reference
resolves to no valve (D:L252156-252157). The script's parse makes its valve first (`FUN_00351ff0(name, TEMP)`,
D:L251782), so a named reference is found unless something dropped it since.

**The parse's word list** (`FUN_00353d10`) compares `MOD`, `NCH`, `SET` and `CLR` after `&=` but returns 0 for them as
for any unknown word: they parse to op 0 (always true, nothing written). **Proven in the disassembly** (the fix round):
the result register `s0` is zeroed at 0x353d28, and the `MOD` / `NCH` / `SET` / `CLR` compares (0x353f68-0x353fb4)
branch to the common return at 0x353fb8 (`move v0, s0`) without setting it. A one-word VALVE
(`VALVE name`) parses to op 1 with operand 0 -- "the value is non-zero" (D:L251766, D:L251792).

## 2. The watchers (`FUN_003519f0` D:L250781-250803; `FUN_00351960` D:L250758-250779)

- A watcher is a 12-byte record `{mask, fn, ctx}`, appended to the valve's list (+8) by `FUN_00351960`.
- `FUN_003519f0(valve, event)` walks the list from its first record to its end and calls `fn(valve, ctx)` for each
  record with `event & 0xff & mask` non-zero (D:L250795-250796). So: **in the order added; only on a change; the
  mask selects the events** (1 non-zero, 2 zero, 3 both). The callback is not told the event.
- The masks the game uses: 3 (D:L157317) and 1 (D:L412787). A mask with neither bit never fires.
- `FUN_003518c0` (D:L250733-250756) frees every record of a valve; there is no removal of one watcher.
- Every write path goes through it: the VALVE ops (§1), `FUN_003520d0`'s set (§3), a pooled valve's reset to 0
  (`FUN_00352230` D:L251172-251173).
- reCOM's `CValve::MakeCallbacks` is an empty stub and its `Parse` compares the other way round; it does not hold.

## 3. The registry (D:L250805-251483)

- **One list**, 0x49e800, in creation order: a new valve is appended at the list's end (`FUN_001feae0` with the end
  iterator, D:L251055, D:L251102). Lookup `FUN_00351ef0` (D:L250995-251017) is `strcmp` (0x198f18, case-sensitive)
  over it.
- **A valve** (0x14 bytes, `FUN_00352ea0` D:L251603-251640): the name, the u16 value (+4), the type (+6), flags (+7:
  bit 0 the name is in the pool, bit 1 the valve is pooled, bit 2 set by `VWATCH`), the watcher list (+8).
- **Find or make** `FUN_00351ff0(name, type)` (D:L251034-251067): absent, a valve is made at 0 with that type
  (`FUN_00352230` D:L251127-251177) and appended; present, it is promoted -- type 1 sets PERM unless it is PERSIST
  (D:L251058), type 3 sets PERSIST (D:L251061), type 2 changes nothing.
- **Set** `FUN_003520d0(name, value, type)` (D:L251069-251125): find or make, write the value through the watchers
  (the whole argument compared, its low 16 bits stored), promote as above (D:L251116-251121).
- **Drop by type** `FUN_00352500`/`FUN_00352610`/`FUN_00352710` (D:L251228-251372): every valve whose type matches, or
  every valve with type 0; no watcher runs. `FUN_00351c20` and `FUN_00351cb0` drop the TEMP ones (from
  D:L50758, D:L151630, D:L151842, D:L151993 -- the level's teardown and the mission's), `FUN_00351e60` all
  (D:L172845).
- **The pool.** `CValve_Open` (`FUN_00351d40` D:L250922-250959) also fills a pool of 256 valves; a dropped pooled
  valve goes back to the pool with its name freed but its watcher list kept, and its next use resets it to 0 through
  `FUN_003519f0` -- so a watcher of a dropped TEMP valve can run when the pool hands the record out again
  (`VALVE_POOL_READING`, not modelled).
- **The card.** `FUN_00352a90` (D:L251463-251483; the save manager's write, `FUN_00352a40` under the record name
  `PersistentValves`) writes every PERSIST valve as `NAME` (0x3f8170) and `VAL` (0x3f8178), the u16, in registry
  order; `CValveSaveManager_UnSerialize` (`FUN_00352960` D:L251410-251446) reads each back through `FUN_003520d0` at
  PERSIST. When the game does each (the card's load and save) is OPT-02's.

## 4. The UI variables (`CUIVariable`, `CUIVarManager`)

- **The manager** is the global at 0x437e80 (`CUIVarManager`, vtable 0x407cf0; its save manager at +0xc). Its vector of
  0x30-byte vars is sized to **0x100 = 256** at static init (`FUN_002b1390(0x437e80, 0x100)`, D:L328198). Every walk
  covers all 256 slots and skips the dormant ones.
- **A var** (0x30 bytes): a reader node at +0 (type byte +0: 1 integer, 2 real, 3 string, 4 array, or 0 the empty
  node of a slot never used -- below; the value word +4),
  the name +0x14, the attached items +0x18 (a vector: count +0x1c, data +0x20), the longevity +0x24. `FUN_003860f0`
  (D:L279730-279791) prints the four types as `%d`, `%f`, `%s` and element by element.
- **Longevity** 0 DORMANT, 1 TEMPORARY, 2 PERMANENT, 3 PERSISTENT -- reCOM's `UIVAR_LONGEVITY` (zui.h), which the code
  agrees with: `CUIVariableSpec` (`FUN_00386ff0` D:L280284-280350) maps a `LONGEVITY` word `PERSISTENT` 3, `PERMANENT`
  2, `TEMPORARY` 1 by `strcasecmp`, default 1 (D:L280328-280346). Note that the **valve** types number the other way
  (PERM 1, TEMP 2): two enums, not one.
- **Lookup** `FUN_00385900` (D:L279445-279465): the first live slot whose name matches by `strcasecmp`.
- **Add** `CUIVarManager_Add` (`FUN_003857c0` D:L279409-279443): a held name -- its value is set only if a value is
  given and its longevity is neither 3 nor 2 (D:L279434-279436); then its longevity is raised to the one asked if
  that is higher (D:L279438-279440). A new name takes the **first dormant slot** (`FUN_003859d0` D:L279467-279487,
  `FUN_00386b80` D:L280188-280203: name, longevity, value if given); with none, `FUN_003859d0` returns 0 and `Add`
  writes through it (the store throws).
- **The empty node** (the fix round, from the review): every slot starts as a copy of the vector's template
  (`FUN_002b1390` D:L155042-155053), which `FUN_002b17e0` (D:L155185-155198) makes by clearing the node's type byte to
  **0** and its length, never writing the value word. So a var added without a value in a slot never used holds a
  type-0 node, and `CUIVarManager_Serialize` writes it as one: its node copy `FUN_0032f390` (D:L230360-230440) carries
  a type-0 node's type and length only. `FUN_00335e20` has no branch for type 0 (D:L234599-234628), so two type-0 nodes
  are **never** the same and a set over one always tells the items. A slot freed by the temporaries' clear is different:
  `FUN_00386b00` makes it an integer node and keeps the old value word (`UIVAR_REUSED_VALUE_READING`, §9). The first
  version of this note held every empty slot as integer 0 ("not read through"): corrected.
- **Reals are f32**: `FUN_00335e20` compares two reals as floats (D:L234624-234626); the store keeps a real as its f32
  (`Math.fround`), so after `InitSystemTuners` a set of `MUSIC_VOLUME` to 0.74 is the held f32 0x3f3d70a4 and tells no
  item (the first version compared JavaScript doubles: corrected).
- **Set** `FUN_00386460` (D:L279844-279889): if the value equals the new one (`FUN_00335e20`, called at D:L279855: same type and
  equal -- strings by `strcmp`, reals as f32, arrays element by element and only when non-empty) nothing happens;
  otherwise the node is replaced and every attached item is told (vtable +0xc, `UpdateUIVar`), in attach order.
  `CUIVariable::operator=(const char *)` (`FUN_003862a0` D:L279793-279822) does the same for a string.
- **Attach** `FUN_00385df0` (D:L279605-279624, through `FUN_003869f0`): an item is appended to the var's list once;
  `FUN_00385d90` (D:L279582-279603) detaches it.
- **Clear the temporaries** `FUN_00385c30` (D:L279534-279555): every longevity-1 var through `FUN_00386b00`
  (D:L280167-280186: items detached, name dropped, type integer, longevity 0). Called at D:L53410, D:L55558
  (`CLoadState_UnInit`), D:L75873 and D:L75937.
- **Restore** `FUN_00385610` (D:L279351-279372): `Add(name, value, 3)` then set the value -- a var read back from the
  card is persistent whatever it was.
- **Mission vars** (`FUN_002acc10` D:L152356-152382): each `mission.rdr` `UiVars` entry through `CUIVariableSpec` and
  `Add` at its `LONGEVITY`.
- **`InitSystemTuners`** (`FUN_0038a7a0` D:L282238-282472, called from `COurGame::StartEngine` D:L47894): eleven tuner
  objects bound to eight vars (strings 0x3fa918-0x3fa9a0): SOUND_VOLUME, MUSIC_VOLUME, BRIGHTNESS, STICK_SENSITIVITY,
  STICK_INERTIA, STICK_DEADZONE (each of the three twice, the tuner's third word 0 then 1), DIALOG_VOLUME,
  HEADSET_CONTROLLER. Each is `Add(name, none, 1)` followed by a direct store of **2** at +0x24 (D:L282254-282255,
  282279-282280, 282304-282305, 282329-282330, 282345-282346, 282361-282362, 282377-282378, 282393-282394,
  282425-282426, 282450-282451). Five then write a real default when the var does not hold it (D:L282262, 282287,
  282312, 282433, 282458): 1.0, 0.74 (f32 0x3f3d70a4), 0.5, 1.0, 0.75. The block's "registers tuner vars at
  longevity 2" holds as the end state; the store is direct, so a var already persistent is lowered to 2.
  *Revised 2026-10-07 (R104.10):* that end state lasts until an OPTIONS slider is built -- `FUN_003724f0` adds its
  var at D:L269307 through `FUN_003857c0`, whose raise (D:L279438-279440) takes it to the spec's `PERSISTENT` 3, and
  §5's serialize then writes it.

## 5. The serialize rule (`CUIVarManager_Serialize`, `FUN_00385670` D:L279374-279407)

1. Read the valve `SecurePassword` through `FUN_00351ff0` at PERM (D:L279384-279385): made at 0 if absent (but
   `global_valves.rdr` declares it PERSIST at 1, §6).
2. Walk the 256 slots in order (D:L279386-279387); for each var of longevity **3** (D:L279389) with a name, whose name
   is neither `PLAYERPASSWORD` nor `STORE_PASSWORD` (`strcasecmp`, strings 0x3fa490 / 0x3fa4a0, D:L279391-279392) --
   or any such name when `SecurePassword` is non-zero (D:L279394) --
3. write a record keyed by the var's name holding its node (`FUN_00333540`, `FUN_0033d250`, D:L279396-279398).

`uiVarsToSerialize(vars, securePassword)` returns that list -- `{name, value}` with the typed node -- in that order;
`serializeUiVars(manager, valves)` reads `SecurePassword` as the original does. "With a name" is the name pointer
(D:L279390): a live var named "" is written (the sprint 6 close review). What reaches the card is OPT-02's: the JSON
record in PLAT-25's slot (R7; PLAT-27 and its codec dropped): **the block's "round-trips the persistent valves" is
owed to OPT-02**, which consumes `persistentValves()` and `uiVarsToSerialize()`; no codec is written here.
*(Corrected 2026-10-02: it read "OPT-02's and PLAT-27's ... through OPT-02's codec".)*

## 6. Where the initial values come from

The block's unknown ("`UiParams.rdr`? code?"), settled at the reading level:

1. **`RUN/READERC.ZAR` -> `global_valves.rdr`**, read by `CValve_Open("global_valves.rdr", PERM)` (`FUN_00351d40`;
   the call D:L152619 in `CMission::Init` `FUN_002ad290`, run from `COurGame::StartEngine` `FUN_001e7430` D:L47893).
   `CValve_Parse` (`FUN_00351a90` D:L250805-250870) takes its `valves` list: each entry `name`, `value`, an optional
   `type` (`PERM`/`TEMP`/`PERSIST`, `strcasecmp`), else the caller's PERM, through `FUN_003520d0`. On the US disc:
   **185 entries, 65 typed PERSIST, 120 untyped (PERM)**, 23 non-zero values (among them `SecurePassword` 1,
   `GameSpeedFilter` 65000, `ScreenOriginX`/`Y` 128), one name twice (`room_rank_bits`, both 0). The 65 PERSIST
   valves are the controller and option flags, the campaign's unlocks (`SetSabre` ... `SetValeska`), the `incr_miss_*`
   and `Miss*Stats` records, the game-list filters and `video_mode` -- the persistent valves of R104.5.
2. **`mission.rdr` `Valves`** (each map's `READERM.ZAR`; `FUN_002acc10` D:L152384-152420): `NAME`, `VALUE`, a `PERM`
   tag (1, else TEMP) and a `PERSIST` tag (3), through `FUN_003520d0`. Research 95 §2.8 reads `InWhichAOP` there.
3. **Code**: `COurGame::StartEngine` sets `R_NAME_SIZE` 31 and `MAX_CHAT_TEXT_LENGTH` 99 at PERM (D:L47895-47896);
   `CMission::Init` makes `UiCharLocked`, `mission_complete`, `mission_failure`, `mission_abort`, `mission_timeout`,
   `nofade` at PERM (D:L152620-152630); 311 call sites of `FUN_00351ff0`/`FUN_003520d0` in all.
4. **Every other valve starts at 0**: made by its first find-or-make (`FUN_00352230` zeroes it), a script's included
   (its parse, D:L251782, at TEMP).
5. **The card**: the PERSIST valves come back over these through `FUN_00352960` (§3); when, OPT-02's.

`UiParams.rdr` (`RUN/UI/READERC.ZAR`) holds two keys, `CommonSoftKeyboardProps` and `SoftKeyboards`: no valve. The UI
vars' defaults are the mission's `UiVars` (§4), `InitSystemTuners`' five reals, and the card's (`FUN_00385610`).

**So the store carries no default**: `loadValves(entries, PERM)` and `loadMissionValves(entries)` take them from the
files their caller reads (PLAT-05's loader), and a valve never declared reads 0 as in the original. No
`*_PLACEHOLDER` is needed.

## 7. Where this differs from research 95 §1.3, from `uiScript.ts` and from reCOM

Research 95 is not edited here (the controller decides how it is corrected); `viewer/src/uiScript.ts` is sprint 5's
ARMORY code, folded by PLAT-34.

| where | what it says | what `FUN_00353fd0` / the registry does |
|---|---|---|
| R95 §1.3 "0 true" | ambiguous; read by `uiScript.ts` as "the value is non-zero" | op 0 is **true** whatever the value (D:L252182-252184); "non-zero" is op 1 with operand 0, what a one-word VALVE parses to (§1) |
| R95 §1.3 "9 \|~" | listed as a test | always true (§1, D:L252209-252211) |
| R95 §1.3 "A change fires the valve's watchers" | a change | a 32-bit result unequal to the u16 held: `*=` can fire with the value unchanged, `|=~` always fires; the event is 1 (non-zero result) or 2 (zero result) and each watcher's mask selects (§1, §2) |
| R95 §1.3 the value and operand | "The value is a u16 at valve+4" | also: the operand is masked to its low 16 bits before every op (D:L252180) |
| `uiScript.ts` L155 `case 'true'` | `value !== 0` | true |
| `uiScript.ts` L164 `case '\|~'` | `((value \| ~operand) & U16) !== 0`: false at value 0, operand 0xFFFF | true |
| `uiScript.ts` L156-161 (`!=` ... `<=`), L163, L165 | compare the operand unmasked (`scene/src/uiZanim.ts` decodes it as an i32) | the low 16 bits: -1 is 0xFFFF, 0x10000 is 0. Equal for every operand in 0..0xFFFF |
| `uiScript.ts` L175 `case '-='` | `Math.max(0, value - operand)`, unmasked: a negative operand adds and can exceed 16 bits | -1 is 0xFFFF: floors to 0 |
| `uiScript.ts` L187, L213, L443-444 | a per-context `Map`, written without watchers | one global registry; every write through `FUN_003519f0` |
| reCOM `zvalve.h` `OP_TYPE` | NONE, ==, !=, >, <, >=, <=, =, +=, -= | SOCOM 1's set: SOCOM II's numbering is `FUN_00353d10`'s (§1); reCOM's `Parse` also ignores the entry's `type` word, which `FUN_00351a90` reads |

The `=`, `+=`, `*=`, `|=`, `&=`, `|=~`, `&=~` values `uiScript.ts` stores agree with the original's at every edge (the
same low 16 bits); only `-=` with an operand outside 0..0xFFFF differs. Whether a shipped ARMORY script has such an
operand, or an op 0, was not checked in the first version. **Checked in the fix round:** the five sets the ARMORY
layout's `SCRIPT_LIBRARY` names hold 2,615 VALVE commands -- no op 0, no op 9, no operand outside 0..0xFFFF, two `-=`
both by 1 -- so every difference is latent, none live (`packages/scene/test/armoryValveOps.test.ts`, a dev-disc test;
research 95 §1.3 is corrected in place).

## 8. What is settled, what is not, what would settle it

- **Settled at the reading level** (the lines above, the tests transcribed from them): the op table, the write and
  its event, the watcher walk, the registry's lookup, order, promotion and drop, the persistent valves' set and
  order, the UI vars' slots, lookup, longevity, add, set, clear and restore, the serialize rule, the tuners'
  longevity and defaults, the files the defaults come from and their counts.
- **Settled in the disassembly** (the fix round; the review's and this writer's read of the retail ELF): the event
  argument the decompiler drops at every call of `FUN_003519f0` -- `a1` is 0, then 2, then 1 when the result is
  non-zero (`movn`), before `jal 0x3519f0` (op 11: 0x354204-0x354224); ops 9 and 17 (`andi 0xffff; not; or` at
  0x3541c8 and 0x3543b0 -- `not` is a 64-bit `nor`, so the result is never zero: op 9 always true, op 17 always
  fires); the parse's `MOD`/`NCH`/`SET`/`CLR` as op 0 (§1, `VALVE_OP_WORDS_READING` proven); the op byte read
  unsigned (`lbu` at 0x3540e8). The never-used slot's empty node and the f32 compare (§4) are settled by source.
- **Not settled**: `FUN_003352f0`'s element compare, read only through its array branch
  (`UIVAR_ELEMENT_EQUAL_READING`); a reused slot's stale value word (`UIVAR_REUSED_VALUE_READING`); the pool's kept
  watchers (`VALVE_POOL_READING`). When the card's restore and the temporaries' clear run relative to a screen's
  ONSTART (OPT-02, PLAT-10).
- **What settles it**: PLAT-32's script-trace golden (the valve values after the main menu's ONSTART, and a trace of
  `FUN_003519f0`'s calls); a read of `FUN_003352f0`'s scalar branches.

## 9. Placeholders and readings

One reading is named in the source (`packages/ui/src/uiVars.ts`); one name is replaced; three are *note only* (no
constant stands in for them), one of them now proven. No `*_PLACEHOLDER`: the store carries no default. The fix round
(2026-10-01) narrows the empty-value reading to a reused slot and proves the parse words' reading (the rows below).

| name | stands for | searched / reading | status |
|---|---|---|---|
| `UIVAR_EMPTY_VALUE_READING` (was `packages/ui/src/uiVars.ts`) | the value of a var added without one | its never-used half was wrong: the template `FUN_002b17e0` (D:L155185-155198), copied into every slot (D:L155042-155053), holds a type-0 node (`UIVAR_NONE`, §4); its reused-slot half is `UIVAR_REUSED_VALUE_READING` | replaced (fix round) |
| `UIVAR_REUSED_VALUE_READING` (`packages/ui/src/uiVars.ts`) | the value of a var added without one in a slot the temporaries' clear freed | `FUN_00386b00` (D:L280167-280186) sets the node's type to integer and keeps the old var's value word (an integer, an f32's bits, a string's pointer). Reading: integer 0 -- the stale word is not carried | open |
| `VALVE_POOL_READING` | a dropped pooled valve's watchers | `FUN_00352610` returns a pooled valve to the pool freeing only its name; `FUN_00352230` resets the next user's value to 0 through `FUN_003519f0` (D:L251172-251173), which would run the old watchers. Not modelled: a dropped valve is gone with its watchers | *note only* |
| `VALVE_OP_WORDS_READING` | the parse's `MOD`, `NCH`, `SET`, `CLR` | `FUN_00353d10` (D:L252099-252103) compares them and returns 0 as for an unknown word; the disassembly proves it: `s0` zeroed at 0x353d28, the four compares return through 0x353fb8 without setting it (§1) | *note only*; resolved (proven, fix round) |
| `UIVAR_ELEMENT_EQUAL_READING` | the array elements' equality in a var's set | `FUN_00335e20` compares arrays element by element through `FUN_003352f0` (D:L234114-234247), read through its array branch only: taken as the same rule | *note only* |
