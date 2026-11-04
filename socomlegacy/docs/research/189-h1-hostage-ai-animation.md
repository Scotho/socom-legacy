# 189 -- H1 -- The hostage as an actor: AI, orders, following, death, body (Desert Glory / EXTRACTION)

- Research date: 2026-10-04 (research wave 1; the index is [178](178-the-research-wave-of-2026-10-04.md)).
- Origin: `research-wave-2026-10-04/H1-hostage-ai-animation.md` on the owner's host, in the evidence archive ([178](178-the-research-wave-of-2026-10-04.md) gives its root). A relative `scratch/...` path below is under `research-wave-2026-10-04/`; the per-cluster `ledger-*` files it names are merged in [`ledgers/2026-10-04/`](ledgers/2026-10-04/README.md).
- Trees compared: **PORT** = `agent/online` at 2026-10-04 (written `$PORT`; `$PORT/..` is that branch's root, `$WEBISSUES` the `agent/web-issues` checkout); **WT** = the old-layout checkout (`$WT`, the clone's pre-restructure web project). WT-96..102 are notes 171-177 here; PORT's own notes 96-102 are other notes.
- **Status: reading, pending review -- not adopted.** Nothing in it is adopted until a sprint task takes it and a reviewer re-reads it at the source.
- Grades, translated to AGENTS.md's levels: the wave's PROVEN = an exact source read = **reading**; STRONG = reading with one interpretive step; BELIEVED = inference; UNRESOLVED = unresolved. The text keeps the wave's words.
- Verification: V2 (`research-wave-2026-10-04/V2-verify-hostage.md`) has landed and is folded in as §14.
- Edits on import: the headings are numbered for the corpus; home-directory paths are replaced by `$PORT`/`$PORT/..`/`$WEBISSUES`/`$NPX_TSX`; the archive's absolute root is dropped; references to the other reports are links to their notes. The substance is verbatim.

**Overridden in part (research 206 §1):** the A* is `FUN_00526540`, and `FUN_00524760` / `FUN_0052a090` test the lateral steps (§0 item 8) -- the A* is `FUN_00510ff0` ("ai_route_planner"); `FUN_00526540` splits and re-smooths the route; `FUN_00524760` tests the leader's trail corridor, `FUN_0052a090` cell walkability (H5, research 200, validated on console routes).

**Overridden in part (research 206 §1):** root travel is 0 on every `civ_*` clip (§7) -- `civ_walk` / `civ_jog` / `civ_run` move 11.72 / 25.00 / 40.62 u a cycle (V6, research 206 §2).

**Overridden in part (research 206 §1):** PANIC / HELPME and "get down" online (§0 item 2, §1) -- unreachable online; only the YES, DAMAGE and DEATH sounds exist for the hostage (V2 #16-17 in §14, H4 #8 in research 199).

**Overridden in part (research 206 §1):** the order range measured from body +0xe4 (§14.6) -- +0xe8, ignoring the sub-map; "HOLD only to the leader" = "issuer in the hostage's unit" (V2 #18).

**Overridden in part (research 206 §1):** HOLD on a rescued hostage pops via `FUN_005f5f20` (§14.14) -- it is `FUN_00555900`'s unwind (D:L420253); the double credit stands, only within the <= 1.33 s fade (H4 and V5, research 199 §1 and §12).

Research agent H1, wave 2026-10-04. Read-only. Scripts and dumps: `scratch/H1/` (its `README.md` says what each prints;
`scratch/H1/out/consts.txt` is the dump of every `.rodata` constant cited below). Decomp citations are r0001
(`socom2_game.elf.decomp.c`, `D:L<line>`); ELF reads are of `game/disc/socom2_game.elf` through `scratch/H1/elfmem.py`.
Disc data was read with the old checkout's parsers (`$WT/packages/*/src`), imported by
absolute path from scratch scripts. Siblings: H2 (mode rules, map, HUD: [190](190-h2-hostage-mode-rules-map.md)), H3 (net sync),
M2 (replication: the host runs every NPC's AI). Their facts are used, not redone.

**A lever new to this wave:** the SOCOM 1 demo `SCUS_972.05` has a full `.symtab` *and* DWARF1 enums. That gives:
- names for the SOCOM 1 hostage classes (`CAiSHostage::Tick/OnSignal`, `CAiSFollow`, `CAiSRescued`, `CSealCtrlAi::ClearRoute/AllStop/SetStance`);
- the enum values `SEAL_STANCE`, `AI_MODE`, `FIRETEAM`, `FT_COMMAND` and `AnimType` (`scratch/H1/demo_enums.py`, `demo_enums_all.txt`).

Where the SOCOM II code uses the same numbers in the same way, the name is graded STRONG. Every decision below rests on SOCOM II's own code; SOCOM 1 only supplies names.

## 0. Summary table

| # | item | status | grade | one-line answer |
|---|---|---|---|---|
| 1 | Hostage class / AI states | RESOLVED | PROVEN (ids) / STRONG (names) | In MP a hostage is an AI `CSealCtrlAi` whose state stack starts in **state 0x17 `CAiSHostage`**. Following is **state 9 `CAiSFollow`**; extraction is **state 0x11 `CAiSRescued`**. The ids come from the factory `FUN_005f6550` (D:L505850-506230) and the RTTI vtables. |
| 2 | CAiSHostage sub-states | RESOLVED | PROVEN (code) / STRONG (meaning) | 0 init -> 2; **1 get down** (prone, then 10 s -> 5); **2 hold** (crouch, then 5 s -> 5); **3 restrained/spawned** (says RESTRAINED, stands, then 2 s -> 2); 4 rest; **5 watch** (every 5 s, or 3 s, looks at the nearest living person within 250 units and cries PANIC or HELPME); 6 crouch, then 10 s -> 5. |
| 3 | How the player orders a hostage | RESOLVED | PROVEN / STRONG | Context actions **0xe "FOLLOW!"** and **0xf "HOLD POSITION"** (`action_escortee.tif`). They are offered when the hostage is the entity **under the player's crosshairs**, shares a team bit with the player, and lies within **Manhattan < 20 AI cells (cells are 10 units, so 20 m)** (`FUN_00591dc0`, `sltiu ..,0x14` at 0x591f94). FOLLOW is offered only while the hostage is unled; HOLD only to the hostage's current leader. |
| 4 | Can Terrorists take a hostage | RESOLVED (code) | BELIEVED | **Yes, by the code.** The hostage team bits (17,30,31) overlap both sides' masks (SEAL 0x40000001 / Terr 0x80000100, swapped by `DAT_004412d8`), and no side test was found in the offer, accept or execute path. Rescue credit goes to SEALs only (H2/`FUN_0056f970`). Owed: a capture. |
| 5 | Leader dies | RESOLVED | PROVEN | `FUN_00547af0` (the body's death, D:L413030-413046) releases every AI whose leader it was (`FUN_005fcf10(ctrl,0)`). `CAiSFollow` also releases on its next tick if the leader is not alive (`FUN_005fdd40`). |
| 6 | Following | PARTIAL | PROVEN constants / BELIEVED roles | The leader records a **cell trail** (`FUN_00546c40`, up to 75 points). The follower targets the trail point `depth` entries back, shifted `lateral` cells sideways (formation table `FUN_005eb910`). It plans with A* when the trail does not reach. It arrives within 1.25 x 15 = 18.75 units. Near the goal (≤ 67.5) it matches 1.2 x the leader's speed, clamped [0.25 x, 1]. An escortee **always stands** (no stance mirroring, `FUN_005fc590`). Every constant is in the table. |
| 7 | Stopping / re-ordering | RESOLVED | PROVEN | HOLD (cmd 5) clears the route, stops, pops the stack (the follow ends and the leader count drops by 1) and pushes CAiSHostage sub-state 2. The hostage rejoins the escortee unit (17) and says YES. A new FOLLOW re-runs the join. |
| 8 | Doors / obstacles | PARTIAL | BELIEVED | Pathing is the AI map's A* (`FUN_00526540`) plus a walkability test on each lateral step (`FUN_00524760`/`FUN_0052a090`). Door handling for followers was not traced. MP6's cell door swaps the `nohostagerescue`/`okhostagerescue` nodes (H2 #20). |
| 9 | Health / damage | RESOLVED (data) | PROVEN | `mp_hostage_extract`: health head 8, body 40, arms 10/10, legs 15/15; **armor 0** everywhere; strength 4, recovery 2. The SEAL/terrorist damage pipeline applies (research 91). |
| 10 | Who can kill it, penalty | RESOLVED | PROVEN | Anyone. The killer gets -2 (a Terrorist +3 in ESCORT only), "escortees killed" +1, and the side's valve +1 (`FUN_00545390`, `FUN_0059ee20`). Mode consequences are H2's. |
| 11 | Death animation | RESOLVED | STRONG | The hostage shares a team bit with every local player, so it dies with the **TEAMMATE lists**: "Death buddy stand01-03 / crouch01 / prone01" (`FUN_005a0950` D:L458898-458960; damanim.rdr). |
| 12 | Model / skeleton | RESOLVED | PROVEN | `mp_fem1` = `thai_biologist01.xsi`, `mp_fem2` = `thai_biologist02.xsi`, `mp_fem3` = `thai_wife.xsi`. Texture `thcivpow`; LODs at 160/260 (wife 150/250). The skeleton has 26 parts, identical in names and topology to `seal_A_des`. |
| 13 | Animation set / clips | RESOLVED | PROVEN | "No_weapon anim set": `civ_stand/stand2crouch/crouch/walk/jog/run/walk_bw/rstep/lstep/step`, plus GLOBAL (deaths, flinches). All are in `RUN/MOTION_P.ZAR`; durations and `motion.rdr` rules are in the clip table. |
| 14 | Idle / captive pose | RESOLVED | STRONG | No tied-hands pose online. Spawn: CAiSHostage sub-state 3 says RESTRAINED and **stands**, then **crouches** (`civ_crouch`) after 2 s. The mission's `Hostage_start` "Cower" sequence sets the "No_weapon anim set" and **crouch** too. The "Restrained anim set" is used only by RESTRAIN (single-player). |
| 15 | Rescued hostage killable? | UNRESOLVED | -- | MP rescue sets body `+0x105c` bit 3 (`FUN_005594b0`). That bit gates the body tick `FUN_00580360` (D:L441923) and three other readers. The damage path's test was not found. Owed evidence is listed below. |
| 16 | `HOSTAGE_ORDER_RANGE_SQUARED$2655`, `hostage_ignore$2777` | RESOLVED | PROVEN | These are **SOCOM 1 demo statics** (demo 0x475fb0 = 10000.0 in `CSealCtrlAi::OnCommand`; 0x475d90 = an event mask in `UpdateEventMask`). They are not r0004 data. The SOCOM II equivalents are the 20-cell test (#3) and `DAT_0066b170` in `FUN_00572d70`, which **is zeroed online** (all AI event masks are 0 in MP). |
| 17 | reCOM | RESOLVED | -- | Enums only (`zai.h` AI_STATE/FT_COMMAND/FIRETEAM). `CAiSHostage` is an empty class and there is no follow or hostage logic. reCOM's SEAL_STANCE is off by one against the demo DWARF. |
| 18 | Captures / beta | RESOLVED (negative) | -- | There is no RDRAM dump on any hostage map (25 dumps: Frostfire, menus, spawn). The beta extract has no `RUN/` maps; its ELF has `CAiSHostage`/`CAiSFollow` RTTI (vt 0x672f50 / 0x672e40). |

---

## 1. State machine (every edge sourced)

```mermaid
stateDiagram-v2
    [*] --> H3 : spawn, MP, team&0x20000\nFUN_00573130 D:L434913 -> FUN_00555900(ctrl,3)\n+ join escortee unit 17 (FUN_005ee250)
    state "CAiSHostage (0x17)" as HOST {
      H3 : 3 RESTRAINED\nsay CHRSND_RESTRAINED(0x4b)\nin unit17: stand now, 2 s -> 2\nelse: prone(0.15 s delay), 0.5 s -> 4
      H2 : 2 HOLD\nAI mode IDLE(1), crouch\n5 s -> 5
      H1 : 1 GET DOWN\nclear route, all-stop, prone\n10 s -> 5
      H5 : 5 WATCH\nevery 5 s (3 s if +0x2c bit1):\nnearest living body <=250u -> look (CURIOUS)\nnot allied: PANIC_CRY(0x48) + FUN_005f0b30\nallied & bit1: HELPME(0x49)
      H6 : 6 crouch, 10 s -> 5
      H4 : 4 rest (no case)
      H0 : 0 -> 2 immediately
      H3 --> H2 : 2 s timer (FUN_005f62c0)
      H3 --> H4 : 0.5 s (not in unit 17)
      H2 --> H5 : 5 s
      H1 --> H5 : 10 s
      H6 --> H5 : 10 s
      H0 --> H2
    }
    HOST --> FOLLOW : CMD_FOLLOW(4) from crosshair leader\nFUN_0058fbe0 case 4 D:L450358-450410
    state "CAiSFollow (9)" as FOLLOW
    FOLLOW --> H2 : CMD_HOLDPOS(5) from leader\nFUN_0058fbe0 D:L450470-450525 (pop, push 0x17 sub 2)
    FOLLOW --> HOST : leader dead/absent -> release, state ends\nFUN_00547af0 / FUN_005fdd40
    FOLLOW --> RESC : led (ctrl+0x5d8 valid) & cell in EXTRACT_ZONE\nFUN_0056f970 D:L432964-432985
    HOST --> RESC : same test (+0x5d8 survives a release)
    state "CAiSRescued (0x11)" as RESC
    RESC : MP: OnSignal(0) frees compass anchor, body+0x105c|=8, sub-state 2 (terminal)
    HOST --> DEAD : health 0 (any state)
    FOLLOW --> DEAD
    DEAD : TEAMMATE death list; killer -2; FUN_00545390
```

The edges in detail:

- **Spawn into sub-state 3.** The AI init `FUN_00573130` (D:L434903-434915) handles an escortee body in MP as follows:
  - it sets `ctrl+0x26c = 4`;
  - it calls `FUN_00555900(ctrl,3,0)`, which pushes state 0x17 with sub-state 3;
  - it clears `ctrl+0x264` bit 0;
  - it adds the body to unit 17 through `FUN_005ef2f0(0x11)` and `FUN_005ee250`;
  - it calls `FUN_005434b0(body,4,0)`. Read as the "hostage" compass anchor, type 4 (H2 #17).

  In single player the code instead sets the body's `+0x105c` bit 7 (restrainable) when the team has bit 31, or bit 28 (`FT_HOSTAGE`).
- **`FUN_00555900(ctrl, sub, flags)`** (D:L420206-420275), "enter hostage sub-state":
  - Eligibility (also `FUN_00555b80`):
    - for sub-state 3: body `+0x105c` bit 7, or (online and team & 0x20000);
    - for other sub-states: team & 0x20000;
    - in both cases `FUN_005f5cd0(ctrl,0x17)`, the can-push test.
  - It then pushes 0x17, or reuses the top state, and sets `+0x34 = sub`, `+0x38 = 0`.
- **The timers** are `FUN_005f62c0(delay, state, next)` (D:L505823-505840) and `FUN_005f61e0` (D:L505794-505818). The countdown is `+0x40`, the next sub-state `+0x3c`, and the flag `0x40000000`. While a timer runs, Tick does nothing else.
- **The sub-state bodies:** `FUN_00601910` = **CAiSHostage::Tick** (vtable slot 2), D:L511764-511910. The instruction listing is `scratch/H1/out/dis_601910_hostage_tick.txt`. The calls it makes:
  - `FUN_005628f0` = ClearRoute, `FUN_00567840(ctrl,1)` = AllStop(true), `FUN_00563100(delay,ctrl,stance)` = SetStance. These are the same three calls, in the same order, as the demo's `Tick__11CAiSHostage` (0x2da2d0 -> `ClearRoute`, `AllStop`, `SetStance`). STRONG.
  - `FUN_005631a0(ctrl,s)` = set stance now (delay 0).
  - `FUN_0056cbf0(ctrl,mode)` = set AI mode. Its values match the demo's `AI_MODE`: IDLE 1, FOLLOW 6.
- **The orders** go through `FUN_0058fbe0` = `CSealCtrlAi::OnCommand`, slot 31, vtable offset `+0x84`:
  - case 4 (FOLLOW): see section 3;
  - cases 5 / 0x11 / 0xe (HOLDPOS / GETDOWN / COVERTARGET): `FUN_00555900(ctrl, cmd==0x11 ? 1 : 2)`, then `FUN_00601e50(state, issuer, 0)`, which records the issuer id (`+0x5c`) and the team mask (`+0x58`).
  - The command numbers are SOCOM II's own, from the name switch `FUN_0058ef80` (D:L449890-449975): 4 FOLLOW, 5 HOLDPOS, 0xe COVERTARGET, 0x11 GETDOWN, 0x19 RESTRAIN.
- **RESTRAIN** (single player only): `FUN_005784a0` = `CZSealBody::RestrainBuddy` (named, `socom2_names.csv`), D:L437654-437760:
  - it sets the victim's anim set to "Restrained anim set" (string 0x65d0e0) through `FUN_0058c4a0`;
  - it calls `FUN_00555900(...,3)`, then `FUN_00601e50(hostage, restrainer, 1)`.

  On the next tick, flag bit 0 sets the body's team to `(team & ~((0xfff0|0xc0000000) & ~restrainerMask)) | 0x4000000`. That keeps the restrainer's bits and adds bit 26 = `FT_NEUTRAL` (D:L511784-511803; FIRETEAM enum from the demo DWARF).
- **The signals.** `CAiState::Signal` = `FUN_005f6fa0` (D:L506292-506388):
  - on activation (signal 0) it first calls `OnSignal(4)`, a reset;
  - the other signals are 1 end, 2 suspend, 3 resume.
  - `CAiSHostage::OnSignal` (0x601f20, disassembly): on 4 it resets the owner id to `DAT_003effb0` (-1) and the team mask to -1. STRONG.
- **The CAiSHostage overrides** (vtable 0x669ab0; `scratch/H1/out/vtables_r0001.txt`):
  - slot 5, CanPushAiState (0x601ec0): refuses PathRecover (0x10); allows ShotAt (0x13) only in sub-states 5 and 6;
  - slot 7, CanAttack = 0;
  - slot 8, CanScan = 1;
  - slot 17 = dtor (0x601880).

## 2. Constants

| value | meaning | source | grade |
|---|---|---|---|
| state ids 0x17 / 9 / 0x11 | Hostage / Follow / Rescued | factory `FUN_005f6550` cases (D:L506120 vt 0x669ab0; D:L505987 0x6699a0; D:L506080 0x669260); RTTI names 0x663268/0x662da8/0x65c718 | PROVEN |
| team (17 30 31) = 0x20000\|0x40000000\|0x80000000 | hostage fireteam bits | MP6 `vehicles.rdr`; FIRETEAM enum (demo DWARF: ESCORTEE 17, ENEMIES 30, ALLIES 31, NEUTRAL 26, HOSTAGE 28) | PROVEN |
| SEAL 0x40000001 / Terr 0x80000100 (swapped when `DAT_004412d8`) | player team masks | `FUN_002c32c0`/`FUN_002c32e0` D:L164779-164800 | PROVEN |
| 20 (Manhattan, AI cells; 1 cell = 10 units = 1 m) | order range | `FUN_00591dc0` 0x591f94 `sltiu 0x14`; cell size research 75 §3 | PROVEN |
| crosshair target == hostage | order needs aim | `FUN_00591dc0` D:L451421-451426 via `FUN_005aa690` (body `+0x218`/`+0x3dc`; doors use the same pick, research 92) | STRONG |
| 2 s / 5 s / 10 s / 10 s / 0.5 s | sub-state timers 3->2, 2->5, 1->5, 6->5, 3->4 | `0x40000000`/`0x40a00000`/`0x41200000`/`0x3f000000` operands in `FUN_00601910` | PROVEN |
| 250.0 | watch range | `lui 0x437a` at 0x601cb4 | PROVEN |
| 5 s / 3 s | watch period (bit 1 of `+0x2c`) | 0x601c84/0x601c88; `FUN_005f6270` = `(int)(ctrl+0x434 x 10) % (int)(T x 10) == 0` | PROVEN |
| 100 (dist²) | min look distance | `DAT_00650da0` in `FUN_00601200` | PROVEN |
| 0.15 | HELPME cry argument | 0x3e19999a at 0x601d40 | PROVEN (meaning BELIEVED: volume) |
| CHRSND 0x37 YES, 0x38 NO, 0x31 WAIT_UP, 0x48 PANIC_CRY, 0x49 HELPME, 0x4b RESTRAINED | voice ids | switch `FUN_0053c3a0` D:L405787 (`out/chrsnd_table.txt`); played through ctrl vtable `+0x24` | PROVEN |
| `mp_fem*` sounds: YES `^CO_0343`, DEATH `.FEMALE_DEATH`, DAMAGE `.FEMALE_DAMAGE` | hostage voice | `character.rdr` | PROVEN |
| 15.0 | follow base radius `+0x68` | `DAT_00650c28`, set in `CAiSFollow::OnSignal(0)` `FUN_005fdf80` | PROVEN |
| 1.25 x radius (18.75) | arrived | `DAT_00650ca0` (D:L508718) | PROVEN |
| 150.0 | alternative arrive distance (ctrl `+0x264` bit 1, body `+0xdc`==0) | `DAT_00650ca8` | PROVEN (condition meaning BELIEVED) |
| 4.5 x radius (67.5) | speed-match radius | `DAT_00650cf8` | PROVEN |
| 1.2 x leader speed, clamp [0.25 x leader throttle, 1.0] | follower throttle near | `DAT_00650d00/08/10`, `FUN_00592910`, `FUN_00570f90` | PROVEN (roles STRONG) |
| 100 / 600 | WAIT_UP distance; beyond 600 the follower holds | `DAT_00650cb0`, `DAT_00650cc8` (D:L508735-508757); only when the leader's ctrl slot `+0x2c` is true (CSealCtrl=1, AI/remote=0) | PROVEN (gate BELIEVED: "local human") |
| 10 + U(0,5) s | WAIT_UP repeat; shared static timer starts at -1 | `DAT_00650cc0`, `DAT_00650cb8` | PROVEN |
| 8.0 | trail length ending the initial stance-mirror phase (`+0x76`) | `DAT_00650c88` | PROVEN (meaning BELIEVED) |
| formation 1 (depth, lateral): (2,2) (3,-2) (4,-3) (5,-2) (6,3) (7,5) (8,-4) (9,-5); formation 2: (1+i, 0) | follow slot | `FUN_005eb910` statics; `DAT_00650b00`=1; type 2 when leader body `+0x1060` bit 2 (`FUN_005eb8a0`) | PROVEN (table) / BELIEVED (bit meaning) |
| depth clamp [1,100] | trail index | `DAT_00650c90/98`, `FUN_00519290` | PROVEN |
| 75 / 50 | leader trail capacity on / off | `FUN_00546c40(body,1,0x4b)` in `FUN_005fc970`; `(...,0,0x32)` in `FUN_005fcc40` | PROVEN (role STRONG) |
| 800 (speed²), 0.82 (cos), 2000 ms | leader heading = velocity direction after a sustained run | `DAT_00650c70/78/80`, `FUN_005fc970` | PROVEN (role BELIEVED) |
| 0.1, 3, 10, 15, 7, 8, 5, 3, 3.0 s, 2.5 s | replan and idle constants of CAiSFollow sub-states 3/4/7/8 | `DAT_00650cd0..d30`; 2.5 = 0x40200000 in sub-state 2 | PROVEN (roles BELIEVED) |
| health 8/40/10/10/15/15, armor 0 | `mp_hostage_extract` | `READERC.ZAR/character.rdr` | PROVEN |
| ai_params accuracy 0, courage 0, stealth 0, visual_range -1, visual_sens 0, fov 45, aware_decay -0.5 | sensors | same | PROVEN |
| SEAL_STANCE STAND 0 / CROUCH 1 / PRONE 2 | stance values | demo DWARF (`demo_enums.py STANCE_PRONE`); consistent with `FUN_005fc910` (body `+0x174` 0/1/2) | STRONG |
| -1 delay → 0.25 + U(0,0.95) s | SetStance default delay | `FUN_00563100` D:L427285 | PROVEN |
| online AI event mask = 0 | hostages react to no AI events online | `FUN_00572d70` (= `UpdateEventMask`, named) | PROVEN |
| demo `HOSTAGE_ORDER_RANGE_SQUARED$2655` = 10000.0; `hostage_ignore$2777` = mask(0,1,2,3,4,6,12,13) | SOCOM 1 only | `demo_gprefs.py` (`out/demo_hostage_statics.txt`) | PROVEN (as SOCOM 1) |

## 3. The order path (question 1)

1. **The offer.** Each frame, `FUN_00593d00` (CSealCtrl vtable, player controller) asks the escortee unit (`FUN_005ef2f0(0x11)`)
   `CanIssue(player, 4)` and `CanIssue(player, 5)` (`FUN_005ee7f0`, unit vtable 0x669650 slot 1). On yes it sets action
   0xe or 0xf in the body's offer mask `+0xed0` (`FUN_00544ca0`, D:L452482-452498).
   - `CanIssue` asks each unit member's `CanAcceptCommand` (CSealCtrlAi slot 8 = `FUN_00590bc0`, D:L450703-450890).
   - For a hostage that is following someone, it asks the hostage under the crosshairs.
   - `FUN_00590bc0` requires that the hostage is alive (`+0xe1` bit 4) and that the issuer and hostage share a `+200` bit.
   - Cmd 4 then goes to `FUN_00591ab0`: true if `FUN_00591dc0` (crosshair + 20 cells) and the hostage is in unit 17.
   - Cmd 5 goes to `FUN_00591770`: `FUN_00591dc0` and the hostage is not in unit 17 and (online) in the issuer's unit
     (`FUN_005ef340`).
2. **The prompt.** The context-action table (`FUN_0021ded0`, `out/action_labels.txt`) holds 0xe "FOLLOW!" and
   0xf "HOLD POSITION", both drawn with `action_escortee.tif` (falling back to `action_x.tif`). This agrees with H2 #18.
3. **The press.** The action dispatcher `FUN_00592d50` reads the picked action bit in `+0xed4`:
   - mask 0x4000 calls `unit17.IssueCommand(localPlayer, 4)`;
   - mask 0x8000 calls `unit17.IssueCommand(localPlayer, 5)` (D:L452112-452130).
   - `IssueCommand` = `FUN_005e8e10`. For unit 0x11 it re-checks `CanAcceptCommand` on the crosshair target and calls
     `FUN_00590ac0` = the body's ReceiveCommand, which leads to the ctrl's OnCommand (D:L499010-499030).
   - On a non-host console the hostage's ctrl is `CRemoteCtrl`. Its OnCommand (`FUN_005e6a00`) forwards only cmds 4/5
     to the host (`FUN_002bb970`, 8-byte message; handled by `FUN_002bb8e0`). This agrees with M2.
4. **The execute, FOLLOW** (`FUN_0058fbe0` case 4, D:L450358-450410), for an escortee:
   - `FUN_005ee160(issuerUnit, hostage)` joins the hostage to the leader's unit;
   - it says YES (0x37); online it also calls `FUN_005e7f20(issuer,0x2b,0)` (purpose unresolved; lead for H3);
   - it pops the stack (`FUN_005f5f20`) and pushes state 9;
   - **`FUN_005fd010` = Harry's `TryControlHostage`** (r0004 0x604810), which calls **`FUN_005fcf10` = `ControlHostageAction`** (r0004 0x604710):
     - it releases any previous leader (that leader's `+0x520` = NumberOfHostagesControlled, -1);
     - it stores the new leader in `ctrl+0x5d4` ("save hostage control ptr"), increments the leader's `+0x520`, and copies the leader id into `ctrl+0x5d8`.
   - It accepts only a null leader or an alive one other than self.
   - `FUN_005fd050(state, unitFormation, 0)` picks the formation slot.
5. **Unit types** in `FUN_0058fbe0` case 4: the FOLLOW branch tests `unit+0x58 - 0x11 < 2` (FIRETEAM 17 escortee, 18 = a second escort unit; 18's name is unresolved).

## 4. Following (question 2)

Sources:
- `CAiSFollow::Tick` = `FUN_005fb1c0` (4,968 bytes, D:L508490-509120);
- the helpers `FUN_005fd790` (goal on the trail), `FUN_005fc590` (stance), `FUN_005fc7d0`, `FUN_005fc970` (leader heading), `FUN_005fdad0`, `FUN_005fdd40` (leader validity);
- `OnSignal` = `FUN_005fdf80`.

The SOCOM 1 demo's `Tick__10CAiSFollow` is 232 bytes, so SOCOM II's follower is new code.

- **Goal.** The leader's body `+0x434` is a recorded cell trail. Index `depth` (from the formation slot) is projected `lateral` cells along the leader's heading normal. Each step is kept only while the cell is walkable (`FUN_005fd790`). With no valid trail point, the goal is the leader's position minus 0.65 x its velocity, plus the rotated offset (`DAT_00650c30`, D:L508700-508715).
- **Sub-states** (`+0x34`):
  - 0: plan. Set AI mode PATH, go to 2; or go to 4 if already arrived.
  - 2: wait for the A* result. On failure go to 8 with a 2.5 s wait; else go to 3.
  - 3: follow the route; re-plan by the cell tests; set the throttle (section 2).
  - 4: arrived. Pick a facing cell and turn (`FUN_0056dba0(5.0,…)`), then go to 5.
  - 5: turning.
  - 7/8: idle; re-check every 3 s.

  BELIEVED for the roles; PROVEN for the transitions as read.
- **Stance.** An escortee follower is forced to STAND (`FUN_005fc590`: team & 0x20000 gives stance 0, delay -1); teammates mirror the leader. For the first phase after activation (`+0x76`, until the leader's trail ≥ 8), Tick only mirrors the leader's stance (`leader+0x174`) through `FUN_005632a0`, and the follower stays put.
- **Locomotion.** The body plays the anim set's Walk/Jog/Run by speed. Their `transition_speed_A/B` are given in section 7. The motion player's rules are research 86 §1.1 and research 80 §3, which the port already has.

## 5. Death and damage (question 3)

- **Health.** Health and armor are in section 2. Hits go through the generic part-damage pipeline (research 91 vocabulary: part health `+0xffc..`, overall `+0x1044`). Nothing hostage-specific was found in it.
- **Kill scoring.** A kill runs `FUN_0059ee20` (D:L458117-458145):
  - the killer's round stats get `FUN_00545390`: -2, or +3 for a Terrorist in game type 3;
  - the killer's `+0x18` counter goes up by 1;
  - the game's valve `+0x38` (killed by a SEAL) or `+0x3c` (killed by a Terrorist) goes up by 1.

  The mission consequences (the 60-second clock deduction, crediting the SEALs) are H2's.
- **Death animation.** `FUN_005a0950` uses the TEAMMATE tables (`0x44d050`, loaded by `FUN_005a44f0` from `TEAMMATE_*_DEATH_ANIMATIONS`) when the victim is not a local human and shares a `+200` bit with the local player. The hostage shares one with everyone. The clips are `death_buddy_stand01/02/03` (head and body hits, standing), `death_buddy_crouch01`, and `death_buddy_prone01`. A limb hit falls back to the stance's default.
- **Flinches.** Flinches come from the `*_FLINCH_ANIMATIONS` lists: `seal_flinch_*`, `guard_hit_*`, `seal_crouch_rflinch`.

## 6. The body (question 4)

- **Models.** CLIB of MP6 holds `thai_biologist01/02`, `thai_wife` and their `_1`/`_2` LODs. They decode with `readMeshLibrary` and `readSkeleton` (`scratch/H1/chars.ts MP6 'thai'`):
  - 3,292 / 3,358 / 3,459 vertices at LOD 0;
  - 26 parts, `skel_root, hips, rthigh…lhand, body`, the same as the SEAL.
  - The port's existing skeleton and skinning work unchanged.
- **Animation sets.** The hostage uses "No_weapon anim set" (`character.rdr`), which includes GLOBAL (`animset.rdr`, `scratch/H1/animset_hostage.txt`).
  - Stand has modes `default civ_stand` and `conversation conv_stand01/02` at 0.5 each. Those two are `SINGLEPLAYER` in motion.rdr.
  - There is no Prone entry in this set.
- **The mission script** `Hostage_start` (MP6 `MZANIM.ZAR`, `scratch/H1/zanim_cmds.ts`) has one sequence, "Cower":
  - `ai::SETANIMSET` (0x219: name index 3, "No_weapon anim set"; tick `FUN_005d1e00`);
  - `ai::STANCE` (0x21c, begin `FUN_005d09f0`): stance byte `+0xc` = 1 (CROUCH, immediate), `FUN_005631b0(..,+8 = 2,..)`, which sets body `+0x375` = 2 (meaning unresolved).
  - The ids follow the registration order in `FUN_005de320`: "ai" namespace, index + 1 (`zanim_regs.txt`). STRONG.
  - Who calls `Hostage_start` was not found.

## 7. Clip table (hostage-relevant; `RUN/MOTION_P.ZAR`, 30 keys/s; `motion.rdr` from `READERC.ZAR`)

| type (anim set) | clip | dur s / frames | motion.rdr |
|---|---|---|---|
| Stand | civ_stand | 0.2333 / 7 | loop, playback 4.6, max_vel -0.1, trans 0/0.1 |
| Stand->Crouch | civ_stand2crouch | 0.4000 / 12 | one-shot, playback 0.65, NoFire |
| Crouch | civ_crouch | 1.4000 / 42 | loop, playback 5.06, BlendTime 0.5, max_vel -0.1 |
| Walk | civ_walk | 0.7000 / 21 | loop, max_vel 6.5, trans 0/2.9 |
| Jog | civ_jog | 0.7333 / 22 | loop, max_vel 6.5, trans 1.2/5.6 |
| Run | civ_run | 0.7333 / 22 | loop, max_vel 6.5, trans 3.4/6.5 |
| Walk backwards | civ_walk_bw | 0.5333 / 16 | loop, max_vel 1.1, trans 0/1.1 |
| Strafe R / L | civ_rstep / civ_lstep | 1.0000 / 30, 0.7667 / 23 | loop, playback 1.2, max_vel 0.8, trans 0/0.8 |
| Step | civ_step | 0.2667 / 8 | loop, playback 0.65, BlendTime 0.6 |
| Death buddy stand01/02/03 | death_buddy_stand01/02/03 | 1.5000/45, 0.6333/19, 1.3000/39 | one-shot, playback 4.9 / 3 / 4.8, Normalize (0 0.4), seal_thud 0.18/0.3/0.143 |
| Death buddy crouch01 / prone01 | death_buddy_crouch01 / prone01 | 1.1333/34, 0.9000/27 | playback 4.2 / 4.05 |
| flinches | seal_flinch_rarm/larm/rleg/lleg, guard_hit01/_shoulder/_stomach01, seal_crouch_rflinch, seal_prone_rflinch | 0.47/0.83/0.43/0.83, 0.73/1.17/1.07, 0.67, 0.70 | playback 0.8 (flinch), 3.7/4.3/2.9 (hits), 0.4 |
| (SP only) Restrained set | guard_get_restrained, guard_restrained_* , guard_restrained_death | 1.8667, …, 0.9333 | playback 3.5 / … / 3.7 |

The full lists are in `scratch/H1/out/motion_p_clips.txt` and `scratch/H1/motion_rdr_hostage.txt`. Root travel is 0 on every civ clip, so locomotion is driven in place by speed; the rules are research 80 §3.

## 8. reCOM (question 5) and the demo

- **reCOM.** `zAI/zai.h` gives these enums:
  - `AI_STATE` (23 = HOSTAGE, 9 FOLLOW, 17 RESCUED). These match the SOCOM II factory, except that 7 is `CAiSUseVehicle` in SOCOM II.
  - `FT_COMMAND` (SOCOM 1 numbering; SOCOM II renumbered it, see section 1).
  - `FIRETEAM`, and the `SIGNAL` names.
  - `CAiState::Create` is in `ai_main.cpp:12-133`.

  `CAiSHostage` is an empty class (`zai.h:502`). There is no follow, hostage or command logic, and `ai_map*.cpp` are empty (research 75 §1). reCOM's `SEAL_STANCE` (`zseal.h:83`) starts NONE = 0; the demo DWARF says NONE = -1 and STAND = 0.
- **The demo** (`out/demo_hostage_syms.txt`):
  - `CAiSHostage::Tick` (380 B) has 4 sub-states: wait U(0,1.5) s; stop and prone; then 8 + 7U s; then stand.
  - `OnSignal(4)` clears `+0x28`.
  - SOCOM II keeps the call shapes and adds the watch and cries, the order gating and the cell range.

## 9. Captures and beta (question 6)

- **Captures.** `logs/parity` has 25 `.rdram` dumps (Frostfire `frostA/B_probe600`, menu, spawn, title, rank); none is on a hostage map. `drive_ours_control_desert_glory.txt` is a recomp control round with no actor data. There is no hostage evidence in any capture.
- **Beta.** `game/beta_scus_973_66/extract/` has only ELFs (no `RUN/`). The beta ELF has `CAiSHostage` (RTTI 0x670c38, vt 0x672f50) and `CAiSFollow` (vt 0x672e40). There is no symbol table to exploit.

## 10. Unresolved, with owed evidence

| # | point | searched | owed evidence |
|---|---|---|---|
| U1 | Can a rescued hostage still be killed? | MP rescue sets `+0x105c` bit 3. Its readers: `FUN_00580360` D:L441923 (body tick skipped), `FUN_003acc10` D:L302841, `FUN_005cba20` D:L483087, `FUN_005d2f30` D:L487241. No damage-path test found. | PCSX2 on MP6 host: lead a hostage into Safety, then shoot it. Read body `+0x1044`, `+0xe1` bit 4 and `+0x105c` before and after. |
| U2 | Terrorist leading in practice | No side gate in `FUN_00593d00`/`FUN_005ee7f0`/`FUN_00590bc0`/`FUN_00591ab0`/`FUN_00591dc0`/`FUN_00592d50`. | MP6, Terrorist player aims at a hostage within 20 m: record whether body `+0xed0` gets bit 14 and whether the hostage's ctrl `+0x5d4` becomes the Terrorist. |
| U3 | Who starts `Hostage_start` / `Hostage_special` | Strings `_start` / "Hostage_start" not found in the ELF; the mission start sequence has no CALL_ANIMATION of it. | zAnim call trace (`FUN_0025d550`) on MP6 round start. |
| U4 | The roles of CAiSFollow's integer cell thresholds (10/15/7/3/8/5) and of sub-states 5/7/8 | Read; the roles are inferred. | A capture of follower ctrl `+0x34`, its goal `+0x104` and its position each frame while a leader walks, runs and stops. |
| U5 | Speed: throttle → m/s for AI | `FUN_00570f90` sets `ctrl+0x1c4`; `FUN_00592910` divides by `FUN_0058bb50`/`FUN_0058bc00`'s value (not read). | Read `FUN_0058bc00`; or a capture of hostage speed at throttle 1. |
| U6 | Body `+0x375` (= 2 after Cower/restrain), `+0x1060` bit 2 (formation 2), unit 18 | Not traced. | Name hunt in r0004 / Harry objects. |
| U7 | `FUN_005e7f20(issuer,0x2b,0)` on FOLLOW online | Not read. | Lead for H3. Probably the "A HOSTAGE IS BEING ESCORTED" / `CMD_MP_ESCORTEE_FOLLOWING` cue (H2 line 339). |
| U8 | `FUN_00569c60`'s list (body `+0xd4/+0xd8`): perception or proximity | Read the loop only. | Name the list's filler. |
| U9 | The PANIC branch's `FUN_005f0b30(ctrl, pos, 4,5,6)` | Not read. | Read it (likely a flee/avoid or a look/turn request). |

## 11. Implementation suggestions (for the port; first test named)

1. **`HostageAi` module.** It holds state 0x17 with the sub-state table above, the 30 Hz timers, and the CHRSND cues.
   - First test: spawn → RESTRAINED cue, stand; after 2 s crouch (civ_stand2crouch → civ_crouch); after 7 s watch.
   - A body within 250 units on another team gives PANIC_CRY every 5 s.
2. **Orders.** Add the actions FOLLOW! (0xe) and HOLD POSITION (0xf) to the context action list:
   - offered when the crosshair entity is the hostage, it shares a team bit, and the Manhattan cell distance is < 20;
   - FOLLOW only while it is in the escortee unit; HOLD only from its leader.
   - First test: a SEAL at 19 cells is offered, one at 20 is not; the leader's NumberOfHostagesControlled goes +1 and then -1 on HOLD.
3. **Follow.**
   - The leader trail ring holds 75 cells. The goal is trail[depth] plus the lateral offset (formation 1, slot 0 = (2,2)). Use A* on the AI map, arrive radius 18.75, throttle rule as in section 2, always STAND.
   - The leader's death releases the hostage.
   - First test: a leader walking straight 30 m is followed with an arrival within 18.75 units of the slot.
4. **Rescue.** A led hostage (`+0x5d8` valid) whose cell is in a kind-1 zone enters state 0x11. H2 owns the scoring. It stays credited to its last leader even after a HOLD.
5. **Death.** Use the TEAMMATE death lists, the `.FEMALE_DEATH` / `.FEMALE_DAMAGE` sounds, and health from `mp_hostage_extract`.

## 12. Sourced but not implemented (multiplayer-relevant)

- Online, every AI's event mask is 0 (`FUN_00572d70`), so hostages do not react to gunfire or explosions as AI events.
- Host migration rebuilds a remote hostage's AI from `(stateId | leaderId<<8)`: 0x11 re-pushes Rescued; 9 re-issues FOLLOW to the leader (`FUN_0056f210`, D:L432722-432790). Lead for H3/M2.
- `ai::STATE` / `ai::SIGNAL` / `ai::STANCE` / `ai::SETANIMSET` are the zAnim commands with ids 0x21d / 0x21a / 0x21c / 0x219 (`zanim_regs.txt`). The mission scripts drive NPCs through them.

## 13. Leads for other workstreams

- Research 84 / all agents: 1,213 of Harry62's 3,004 identifier labels are SOCOM 1 demo symbols at demo addresses (`scratch/H1/harry_demo_overlap.py`; C1 confirmed the data range). His function labels `ControlHostageAction`/`TryControlHostage` are good: their r0001 twins are 0x5fcf10 and 0x5fd010.
- `FUN_005cf930` is the `ai::STATE` tick, not a network handler.
- `FUN_00592d50` is the action-button dispatcher: action bits 14/15 are escortee orders; 16 is ladder slide (research 86).
- Research 75 §5.4: zone kind 1 is consumed by `FUN_0052a200`, used for escortee extraction (`FUN_0056f970`) and for `IssueCommand` `CMD_EXTRACT`.

## 14. Verification (V2, 2026-10-04)

The verifier's file: `research-wave-2026-10-04/V2-verify-hostage.md` (its scripts and outputs under `research-wave-2026-10-04/scratch/V2/`). V2 verified H1, H2 and H3's implementation-critical claims. What follows is the verifier's own text for this report's claims, verbatim; its claims about the other reports are in their notes ([178](178-the-research-wave-of-2026-10-04.md) has the table).

Verifier V2, wave 2026-10-04. Read-only. My scripts and outputs are in `scratch/V2/` (see its `README.md`).

**Independence.** None of my scripts import the port's TypeScript parsers or H1/H2/H3's helpers. I wrote my own:
- a PT_LOAD ELF reader with capstone (`elf.py`);
- a binary `.rdr` decoder (`rdrbin.py`);
- a raw AIMAPS byte decoder (`aimaps_points.py`);
- a raw zAnim command-stream decoder for MP6's `objectives` (`zanim_raw.py`);
- a reader for the 2026-09-17 capture logs (`capture_0917.py`).

Decomp citations are r0001 `D:L<line>`.

**Which ELF the decomp matches.** `game/disc/socom2_game.elf` and `game/overlays/socom2_game.elf` are byte-identical (4,835,072 bytes, sha256 `06b83684719a78ad...`; the overlay's `repair.json` lists no repairs). The decomp's addresses match it:
- FUN_005f6550 and FUN_00601910 lie in the 0x4c5380 segment;
- the instruction at 0x591f94 is `sltiu v0,v0,0x14`, which is D:L451447's `< 0x14`;
- the vtable slots below point at the decomp's function addresses.

### 14.1 Verdicts

| # | claim (owner) | verdict | one-line reason |
|---|---|---|---|
| 9 | A hostage kill costs the killer -2 and posts no kill line (H2/H1) | CONFIRMED-WITH-CORRECTION | Code agrees. Correction: only the -2 is local-gated. The +1 "escortees killed" (+0x18) and `FUN_00544d60` run on every console (D:L411546-411547). Nothing is counted unless the killer resolves to a type-2 entity (D:L458078). |
| 15 | AI states 0x17 CAiSHostage, 9 CAiSFollow, 0x11 CAiSRescued via `FUN_005f6550` (H1) | CONFIRMED | Factory cases D:L506120/505988/506074 give vtables 0x669ab0/0x6699a0/0x669260. My RTTI chase names them CAiSHostage/CAiSFollow/CAiSRescued. A second line, the name table `FUN_00575490` (D:L435911/435935/435953), gives follow/rescued/hostage. |
| 16 | `FUN_00601910` timers: 2 s, 5 s, 10 s, 0.5 s; watch 250 units every 5 s (3 s); PANIC/HELPME (H1) | CONFIRMED-WITH-CORRECTION | Every constant is right. Online, though: the 3 s period and HELPME need state flag bit 1, which nothing sets. PANIC needs a body that shares no team bit with 0xC0020000, and no MP actor qualifies. And no disc record defines the RESTRAINED/HELPME/PANIC sounds for `mp_fem*`. See §16. |
| 17 | "Get down" = prone, then 10 s -> watch (H1) | CONFIRMED (code) / not needed online | Case 1 at D:L511814-511818. GET DOWN (cmd 0x11) is not one of the MP context actions (only 0xe/0xf), and the No_weapon set has no Prone entry. |
| 18 | Order rules: < 20 AI cells, crosshair, shared team bit, FOLLOW only unled, HOLD only to the leader (H1) | CONFIRMED-WITH-CORRECTION | The test reads body **+0xe8**, not the +0xe4 used by the zone test, and ignores the sub-map. H1 also omits gates (alive; offline +0x105d bit 0 and not-rescued; online none). "HOLD only to the leader" is really "issuer in the hostage's unit" (ctrl+0x10c). See §18. |
| 19 | `FUN_005fcf10`/`FUN_005fd010` = Harry's ControlHostageAction/TryControlHostage (H1) | CONFIRMED | `match_r0001_r0004.csv`: 0x5fcf10->0x604710 exact, 0x5fd010->0x604810 exact. `user_labels.csv`: 0x604710 ControlHostageAction, 0x604810 TryControlHostage. |
| 20 | Leader death releases the hostage (`FUN_00547af0`) (H1) | CONFIRMED | D:L413031-413046 calls `FUN_005fcf10(ai,0)` for every AI led by the dying body. The release keeps +0x5d8 (the last leader id). |
| 21 | Following: 75-cell trail, formation table, path request, arrive 18.75, 1.2x leader speed, always stands (H1) | CONFIRMED-WITH-CORRECTION | Constants and table re-read. Correction: the "50" of `FUN_00546c40(...,0,0x32)` is ignored; the off path passes 0 to `FUN_00525210`. "A*" is a role name (BELIEVED); the call `FUN_00526540(...,0x66a1b0,1)` at D:L508832 is real. |
| 22 | Rescue: kind-1 zone test, the "ever led" condition, credit to the last leader (H1/H2) | CONFIRMED (+2 details) | `FUN_0056f970` D:L432964-432985. If the last leader no longer resolves as an entity, +0x5d8 is reset to -1 and there is no rescue. Re-pushing 0x11 is refused while 0x11 is on top (`FUN_005f5cd0` D:L505626), so the credit is not repeated each tick. |
| 23 | Models `thai_biologist01/02`, `thai_wife`; 26-bone SEAL skeleton; civ_* clips; health 8/40/10/10/15/15, armor 0; buddy death lists; no restrained set online (H1) | CONFIRMED | `character.rdr` by my decoder; `animset.rdr` No_weapon set; clip names in `MOTION_P.ZAR`; damanim TEAMMATE lists (head and body only). The 26 bone names are in MP6's model-library name table ahead of the thai_* models; I did not re-parse each mesh's skeleton. |
| 24 | Terrorists can lead a hostage (H1, BELIEVED) | CONFIRMED (code path, STRONG); gameplay capture still owed | I looked for a side check H1 might have missed and found none. I added the vtable caller, the network forward and the host handler to H1's list (§24). New consequence: a Terrorist-led hostage in the zone fires the script's Rescue (SEAL `rescuecount` +1). |
| 25 | U1: can a rescued hostage still be killed? (H1/H3) | UNRESOLVED (narrowed) | The damage functions have no rescued test (agrees with H3). The 4 readers of body +0x105c bit 3 are a landing/fall handler, a sweep-contact damage and two zAnim/AI paths, not the bullet path. The bit is set only on the host. Hit-trace eligibility is unread. |
| 26 | NEW lead: online, a rescued hostage stays orderable and may be credited twice | UNVERIFIED LEAD (BELIEVED) | No rescued gate online in `FUN_00591dc0`/`FUN_00590bc0`. HOLD (case 5) pops whatever state is on top. The rescue post-tick would then push 0x11 again and call `FUN_00545480` again (§26). |

### 14.2 Claim 9: Killing a hostage: points and kill line

- **`FUN_0059ee20` escortee branch** (D:L458113-458141). Online, with a game object present:
  - a Terrorist killer (`FUN_002c30b0`) adds 1 to game +0x3c;
  - a SEAL killer (`FUN_002c31d0`) adds 1 to game +0x38;
  - then `FUN_00545390(killer stats)` runs.
- **Valve bindings** (`FUN_002a6c50` D:L149084-149091): +0x38 = `mp_hostages_by_seals` (0x3f0fa0) and +0x3c = `_turds` (0x3f0fc0).
- **`FUN_00545390`** (D:L411524-411547):
  - -2 to score +0x3c, only offline or on the killer's console. In ESCORT (type 3) a Terrorist gets +3 instead.
  - Then **unconditionally** `FUN_00544d60(killer,0)` and +1 to +0x18.
  - H2's text says the whole of this is "credited only on the killer's own console". That is right for the score only.
- **Kill line.** `FUN_00547860` (D:L412863-412909): a body with +200 & 0x20000 takes the `else` branch, which is `FUN_005e7f20(victim,0x44,0)`. No message is posted. CONFIRMED.
- **Precondition H2 omits.** The killer must resolve to a type-2 entity (D:L458078). Otherwise nothing is counted, for example on a world kill.
- **Verdict.** CONFIRMED-WITH-CORRECTION.

### 14.3 Claim 15: AI state ids

- **RTTI.** `vt.py`: vtable[0] -> typeinfo -> name.
  - 0x669ab0 "CAiSHostage": OnSignal 0x601f20 at +8, Tick 0x601910 at +0x10, CanPushAiState 0x601ec0 at +0x1c.
  - 0x6699a0 "CAiSFollow": OnSignal 0x5fdf80, Tick 0x5fb1c0.
  - 0x669260 "CAiSRescued": OnSignal 0x5594b0, Tick 0x559070.
- **Name table.** `FUN_00575490` case 9 "follow", 0x11 "rescued", 0x17 "hostage". That is a second line of evidence.
- **Verdict.** CONFIRMED.

### 14.4 Claim 16: CAiSHostage::Tick (`FUN_00601910`, D:L511764-511910; `out_dis_601910.txt`)

**Confirmed as written.**
- Case 0 goes straight to 2.
- Case 1 calls ClearRoute, AllStop(1), stance 2 (prone), then 10 s -> 5.
- Case 2 sets AI mode 1, stance 1 (crouch) with the default delay, then 5 s -> 5.
- Case 3 plays cue 0x4b at 1.0. Then:
  - in unit 0x11 (`FUN_005eddc0(body,0x11,1)`): stand now, then 2 s -> 2;
  - otherwise: prone after 0.15 s, then 0.5 s -> 4.
- Case 5 runs every 5 s (3 s if state flag bit 1). The 250.0 is passed to `FUN_00569c60`.
  - If the nearest body shares no team bit: PANIC 0x48 at 1.0, then `FUN_005f0b30`.
  - Else, if bit 1: HELPME 0x49 at 0.15, and bit 1 is cleared.
- Case 6: crouch, then 10 s -> 5.
- The timers subtract the frame dt (`FUN_005f61e0`). `FUN_005f6270` is `(int)(t*10) % (int)(T*10) == 0`.

**Corrections an implementation needs**

1. **Online, bit 1 is never set (BELIEVED, strong).**
   - The state is entered only through `FUN_00555900(ctrl, sub, flags)`. Its three callers (D:L434913, 437711, 450478) all pass flags = 0.
   - `FUN_00601e50` sets bit 0 only, and only for RESTRAIN.
   - So the watch period is 5 s, and **HELPME never plays** unless some path I did not find sets the bit.
2. **PANIC never fires against MP actors.**
   - Its condition is `(nearest+200) & (hostage+200) == 0`.
   - The hostage's 0xC0020000 overlaps the SEAL mask (bit 30), the Terrorist mask (bit 31) and the other hostages. So online, the "watch" sub-state only looks (`FUN_00601200`).
   - H1's suggested test "a body within 250 units on another team gives PANIC_CRY every 5 s" cannot happen in MP. Drop it.
3. **The cue sounds may be silent.**
   - `character.rdr` (my decode, `out_character_rdr.txt`): `mp_fem1-3` (parent `mp_hostage_extract`, which has no `sounds`) define only `CHRSND_DEATH .FEMALE_DEATH`, `CHRSND_DAMAGE .FEMALE_DAMAGE` and `CHRSND_YES ^CO_0343`.
   - No record on the disc defines `CHRSND_HELPME` or `CHRSND_RESTRAINED`. `PANIC_CRY` is defined only for SP characters.
   - Whether a missing entry falls back to a default bank was not traced.
   - Implement the cue calls, but expect only YES, DAMAGE and DEATH to be audible. UNVERIFIED; owed: the play path of ctrl vtable +0x24 for a missing entry.
4. **The 5 s check can fire on several frames.** `FUN_005f6270` is true for every frame while `floor(t*10) % 50 == 0`, a 0.1-s window (about 3 frames at 30 Hz). Each such frame re-runs the look. The port should mimic this with a 0.1-s window, not a one-shot.

**Verdict.** CONFIRMED-WITH-CORRECTION.

### 14.5 Claim 17: "Get down" = prone 10 s

- **Code.** Correct (case 1).
- **Not reachable online, as far as I can tell.**
  - The MP context actions offered for a hostage are only 0xe and 0xf (`FUN_00593d00` D:L452490-452498).
  - The "No_weapon anim set" has no Prone type (my `animset.rdr` decode: Stand, Stand->Crouch, Crouch, Walk, Jog, Run, Walk backwards, Strafe R/L, Step, plus include GLOBAL).
- **Verdict.** Low priority for the port.

### 14.6 Claim 18: The order rules (`FUN_00591dc0`, D:L451386-451452)

**Confirmed**
- Crosshair pick == hostage (`FUN_005aa690(issuer)`).
- Issuer and hostage share a +200 bit.
- Manhattan cell distance `< 0x14` (0x591f94 `sltiu 0x14`).
- FOLLOW (`FUN_00591ab0` D:L451275-451283): online, true only if the hostage is in unit 0x11.
- HOLD (`FUN_00591770` D:L451232-451240): the hostage must not be in unit 0x11, and online `FUN_005ef340(hostage, issuer)`, which compares the two ctrls' +0x10c unit pointers.

**Corrections**
1. The cell is read from body **+0xe8**: x = (u32 & 0x7ffff) >> 6, z = u16 at +0xea >> 3. The sub-map is ignored. The zone test uses +0xe4, so they are not the same field.
2. Gates H1 omitted:
   - the hostage must be alive (+0xe1 bit 4);
   - `DAT_0066b3b8`, a .bss flag never written in the decomp, bypasses everything when set (debug);
   - **offline** only: body +0x105d bit 0 must be set **and** the AI's top state must not be 0x11;
   - **online** (`FUN_005750a0` returns the net byte): eligibility is unconditional, so a **rescued hostage is not excluded** (see §26).
3. "HOLD only to the leader" is literally "issuer in the same unit as the hostage". FOLLOW puts the hostage into the issuer's unit (`FUN_005ee160(issuerUnit, hostage)`, D:L450376). This equals "leader only" if each online player has a unit of their own. I did not verify that. Owed: read the online player unit assignment (`FUN_005ef2f0`/`FUN_005ee250` callers at player spawn).

**Verdict.** CONFIRMED-WITH-CORRECTION.

### 14.7 Claim 19: Harry's labels

- **Route.** `match_r0001_r0004.csv` rows `0x005fcf10,0x00604710,exact` and `0x005fd010,0x00604810,exact`; `user_labels.csv` rows `0x00604710 ... ControlHostageAction` and `0x00604810 ... TryControlHostage`.
- **Code.** `FUN_005fd010` = `FUN_005fcf10(ai, leader)` then `state+0x58 = ai+0x5d4`.
- **`FUN_005fcf10`** (D:L509486-509515):
  - it releases the old leader (`+0x520` -1);
  - it accepts a null leader, or an alive one other than self;
  - on a non-null leader it sets `+0x5d4`, the leader's `+0x520` +1, and `+0x5d8` = the leader id;
  - with no leader it clears the follow state's +0x58.
- **Verdict.** CONFIRMED.

### 14.8 Claim 20: Leader death

- **Code.** `FUN_00547af0` D:L413031-413046. When the dying body's `+0x520` != 0, it iterates the actors. For each AI with ctrl+0x42c & 0x200 whose `FUN_005fcd30(ai,0)` is the dying body, it calls `FUN_005fcf10(ai,0)`.
- **Note.** The release does not clear +0x5d8. A released hostage that later stands in the zone with its old leader still resolvable would be rescued and credited to the dead leader (§22).
- **Verdict.** CONFIRMED.

### 14.9 Claim 21: Following

- **Constants re-read** (`out_follow_consts.txt`):

  | address | value | use |
  |---|---|---|
  | `DAT_00650c28` | 15.0 | set at D:L510065 in `FUN_005fdf80` |
  | `DAT_00650ca0` | 1.25 | arrive test at D:L508735 |
  | `DAT_00650cf8` | 4.5 | -- |
  | `DAT_00650d00` | 1.2 | `FUN_00592910(leaderSpeed*1.2)`, D:L508939-508946 |
  | `DAT_00650d08` | 0.25 | clamp |
  | `DAT_00650d10` | 1.0 | clamp |
  | `DAT_00650ca8` | 150 | -- |
  | `DAT_00650cb0` | 100 | -- |
  | `DAT_00650cc8` | 600 | -- |
  | `DAT_00650c88` | 8 | -- |
  | `DAT_00650c30` | 0.65 | -- |

- **Throttle.** Beyond 4.5 x radius the throttle is 1.0.
- **Formation statics** (`FUN_005eb910` D:L500124-500159): (2,2) (3,-2) (4,-3) (5,-2) (6,3) (7,5) (8,-4) (9,-5). Type 2 is (1+i, 0) with `DAT_00650b00` = 1. Matches H1.
- **Stance.** `FUN_005fc590` D:L509159/509203-509205: an escortee always gets stance 0 with delay -1.
- **Trail.** `FUN_005fc970` calls `FUN_00546c40(leader,1,0x4b)` (D:L509301), which calls `FUN_00525210(trail,75)`.
  - Correction: `FUN_005fcc40`'s `(...,0,0x32)` takes the `param_2 == 0` branch, which calls `FUN_00525210(trail,0)`. The 0x32 is dead.
- **Path request.** `FUN_00526540(...,0x66a1b0,1)` at D:L508832. "A*" is a label (research 75), not re-verified.
- **Verdict.** CONFIRMED-WITH-CORRECTION (trivial).

### 14.10 Claim 22: Rescue

- **Code.** `FUN_0056f970` (D:L432964-432985). The conditions:
  - ctrl+0x5d8 != -1 (`DAT_003effb0` = 0xffffffff by `elf.py words`; ctrl+0x5d8 is initialised to -1 at D:L434764 and D:L435187);
  - body +200 & 0x20000;
  - `FUN_0052a200(map, 1, body+0xe4)` finds a kind-1 zone.

  Then:
  - the leader id is looked up. If it is **not** a type-2 entity, +0x5d8 is reset to -1: no rescue, and the hostage loses its "ever led" status;
  - else it pushes 0x11, sets zone and leader in the state, and calls `FUN_00545480`.
- **No double credit while rescued.** `FUN_005f5ba0` -> `FUN_005f5cd0` refuses a push equal to the top state (D:L505625-505626) and requires the body alive (D:L505611).
- **Verdict.** CONFIRMED.

### 14.11 Claim 23: The body

- **`character.rdr`** (`out_character_rdr.txt`):
  - `mp_fem1` = `thai_biologist01.xsi`, LODs 160/260;
  - `mp_fem2` = `thai_biologist02.xsi`, 160/260;
  - `mp_fem3` = `thai_wife.xsi`, 150/250;
  - all with texture `thcivpow` and parent `mp_hostage_extract`.
- **`mp_hostage_extract`:**
  - anim set "No_weapon anim set", strength 4, recovery 2;
  - health head 8, body 40, larm/rarm 10, lleg/rleg 15; armor 0;
  - ai_params accuracy/courage/stealth 0, visual_range -1, sens 0, fov 45, aware_decay -0.5.
- **Clips.** All ten `civ_*` clips and the five `death_buddy_*` clips exist in `MOTION_P.ZAR`. There is no `civ_prone`.
- **Death lists.** The damanim TEAMMATE lists are HEAD and BODY only: Death buddy stand01-03 (and crouch/prone). `FUN_005a0950` D:L458911-458919 uses them for a non-local victim sharing a bit with the local player.
- **Skeleton.** MP6's model-library name table (file 0x27c0a1) lists `seal_A_des` with the 26 names skel_root ... body, followed by the model list including `thai_biologist01/_1/_2`. I did not re-parse each mesh's own skeleton.
- **"No restrained set online".** The "Restrained anim set" is only applied by `FUN_005784a0` (RestrainBuddy), as H1 says. I did not exhaustively prove it unreachable online.
- **Verdict.** CONFIRMED.

### 14.12 Claim 24: Can a Terrorist lead a hostage?

I searched for a side check H1 missed, adding the links H1 did not list. There is none on:
- the offer, CSealCtrl/CRemoteCtrl/CSealCtrlSquirm vtable slot +0x7c = `FUN_00593d00` (`vtowner.py`). It is called from `FUN_00593500` D:L452294 with no team test;
- the escortee unit's `CanIssue` = `FUN_005ee7f0` (D:L501836-501920). It asks the members, then, for unit 0x11, the crosshair escortee not in the unit;
- `CanAcceptCommand` `FUN_00590bc0` (alive and a shared bit only, D:L450733-450735);
- `FUN_00591ab0`/`FUN_00591770`/`FUN_00591dc0`;
- the client forward `FUN_005e6a00`/`FUN_002bb970`, which excludes only persona flag 0x10000 (`FUN_002c2fd0`);
- the host handler `FUN_002bb8e0` (game state +0x113 == 3 only);
- OnCommand case 4 (D:L450351-450410; online it only tests unit != issuer unit).

The Terrorist mask 0x80000100 shares bit 31 with 0xC0020000. **Code verdict: yes, a Terrorist can lead (STRONG).**

Consequences an implementation must copy:
- A Terrorist leading a hostage into Safety pushes 0x11 with no points (`FUN_00545480` is SEAL-only).
- The script's `RescueN` (INREGION, no leader test) still adds `rescuecount` +1 and `freecount` +1, which counts for the SEALs.

The owed gameplay capture (H1 U2) remains for the grade PROVEN.

### 14.13 Claim 25: U1: is a rescued hostage still killable?

- **Readers of body +0x105c bit 3.** A grep of every `0x105c` read finds exactly four bit-3 readers (`<<0x3c`):
  - `FUN_003acc10` D:L302841: a sweep-contact damage, `FUN_005ac620(1.0)` + `FUN_005a54d0(body,3,7)`; skipped if rescued;
  - `FUN_00580360` D:L441923: not "the body tick". It is called from two landing points (D:L418166 when velocity is zero, and D:L466914). It runs `FUN_005ac1f0(dt*1.2)` and, if the body is dead, selects the death animation `FUN_005a0950(...,3,2)`. Skipped if rescued;
  - `FUN_005cba20` D:L483087 (an AI perception branch);
  - `FUN_005d2f30` D:L487241 (a zAnim AI command: rescued -> `FUN_005a2690(body,x,0)`, else flags 8 + `FUN_005477a0` + `FUN_005a5430`).
- **The bullet path.** `FUN_005a5a80` and `FUN_005a5830` have none. I agree with H3.
- **Not replicated.** On clients the hostage runs `CRemoteCtrl` and never enters CAiSRescued, so the bit stays 0 there. (`FUN_0056f4c0` copies only byte-3 bit 4 into +0x105d bit 0.)
- **What remains.** Whether the shot trace selects a rescued body is unread. Owed, as H1/H3 wrote: on MP6, lead a hostage into Safety, shoot it from the host **and** from a client, and read body +0x1044, +0xe1 bit 4 and +0x105c.
- **Implementation.** Until then, keep the rescued hostage damageable. The code has no rescued guard in damage, and the kill counters (§9) would then count it.
- **Verdict.** UNRESOLVED (narrowed).

### 14.14 Claim 26: NEW lead: a rescued hostage can be re-ordered online, which risks a double rescue credit

1. Online, `FUN_00591dc0` does not exclude state 0x11 (§18).
2. CAiSRescued's online `OnSignal(0)` (`FUN_005594b0` D:L422309-422314) jumps to sub-state 2. It skips case 0, which would return the body to unit 0x11. So a hostage that was led stays in the leader's unit.
3. So `FUN_00591770` (not in unit 0x11 and in the issuer's unit) can offer **HOLD** on a rescued hostage.
4. OnCommand case 5 (D:L450470-450474) calls `FUN_005f5f20(ctrl,0)`, which pops the top state, here CAiSRescued, and pushes 0x17.
5. On the next post-tick, `FUN_0056f970` sees +0x5d8 still valid and the body still in the zone. It pushes 0x11 again and calls `FUN_00545480` again: +3 on the host. Clients would see the state byte change to 0x11 again in `FUN_0056f4c0` and credit too.

I did not read `FUN_005f5f20`'s pop semantics, nor whether the offer reaches a hostage in a non-0x11 unit for HOLD (`FUN_005ee7f0` asks the crosshair escortee when it is not in the unit, D:L501914-501919, so it should). Grade BELIEVED.

Owed:
- the read of `FUN_005f5f20`;
- a capture: lead a hostage into Safety, then press HOLD on it, and read the leader's score (+0x58c+0x3c) and the hostage AI's top state.

The port should decide this deliberately: either copy it, or gate HOLD on rescued and record the deviation.

### 14.15 Owed evidence added by V2

1. **§18:** online unit assignment per player (does HOLD = leader only?). Read the spawn-time unit join for player bodies.
2. **§16:** whether a missing CHRSND entry falls back to a default bank (ctrl vtable +0x24 path), so whether the hostage's RESTRAINED/PANIC/HELPME are audible.
3. **§26:** `FUN_005f5f20`'s pop, plus a capture of HOLD on a rescued hostage.
4. **§25:** H1's U1 capture, from the host and from a client shooter.
