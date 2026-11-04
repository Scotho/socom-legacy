# 199 -- H4 -- Hostage closures: the nine open questions an implementation would trip on

- Research date: 2026-10-04 (research wave 1, round 2 and the close; the index is [178](178-the-research-wave-of-2026-10-04.md)).
- Origin: `research-wave-2026-10-04/H4-hostage-closures.md` on the owner's host, in the evidence archive ([178](178-the-research-wave-of-2026-10-04.md) gives its root). A relative `scratch/...` path below is under `research-wave-2026-10-04/`; the per-cluster `ledger-*` files it names are merged in [`ledgers/2026-10-04/LEDGER-ALL.tsv`](ledgers/2026-10-04/README.md).
- Trees compared: **PORT** = `agent/online` at 2026-10-04 (written `$PORT`; `$PORT/..` is that branch's root, `$WEBISSUES` the `agent/web-issues` checkout); **WT** = the old-layout checkout (`$WT`, the clone's pre-restructure web project). WT-96..102 are notes 171-177 here; PORT's own notes 96-102 are other notes.
- **Status: reading, pending review -- not adopted.** Nothing in it is adopted until a sprint task takes it and a reviewer re-reads it at the source.
- Grades, translated to AGENTS.md's levels: the wave's PROVEN = an exact source read = **reading**; STRONG = reading with one interpretive step; BELIEVED = inference; UNRESOLVED = unresolved. The text keeps the wave's words.
- Verification: V5 (`research-wave-2026-10-04/V5-verify-hostage-closures-round2.md`) has landed and is folded in as §12; two of H4's claims are wrong and one corrected (research 206 §1, named below).
- Edits on import: the headings are numbered for the corpus; home-directory paths are replaced by `$PORT`/`$PORT/..`/`$WT`; the archive's absolute root is dropped; references to the other reports are links to their notes; the claims research 206 §1 overrides are named under this header. The substance is verbatim.

**Overridden in part (research 206 §1):** a hostage released by its leader's death or departure stays stranded in the dead leader's unit, never to be ordered again (§5) -- the UnitTick (`FUN_005e8060`) sends HOLD, returning it to unit 0x11 with the YES cue; FOLLOW is offered again (V5, §12.6).

**Overridden in part (research 206 §1):** `Hostage_start` "Cower" never runs online (§7) -- it is reached on the host at each level start and round restart (`FUN_002a7d40` slot +0x4c); whether it shows is owed (V5, §12.8).

**Overridden in part (research 206 §1):** the jail bars do not change walkability (§6) -- true of the material swap, but the bars' AI-map cells are type 9 (not walkable) regardless (H5, research 200).

**Overridden in part (research 206 §1):** mask 0x190c48c6 has bit 17 (§1) -- it has bits 18 and 19; the conclusion stands (V5, §12.2).

Research agent H4, wave 2026-10-04. Read-only, static only (decomp, disassembly, `.data`, disc data). Scripts and
outputs: `scratch/H4/` (its `README.md` lists what each prints). Decomp citations are r0001
(`socom2_game.elf.decomp.c`, `D:L<line>`). ELF reads are of `game/disc/socom2_game.elf` through `scratch/H4/elf.py`
(V2's independent reader). Disc data comes through V2's raw `.rdr` decoder and the old checkout's scene/AIMAPS parsers.
Inputs read first: `HOSTAGE-MODE-DESERT-GLORY.md`, H1 ([189](189-h1-hostage-ai-animation.md)), H2 ([190](190-h2-hostage-mode-rules-map.md)), H3 ([191](191-h3-hostage-net-sync.md)), V2.

Five findings change the synthesis materially:
- **(Q2) A rescued hostage fades out and is switched off.** Over at most 1.33 s it becomes invisible and can no
  longer be hit.
- **(Q1) The double rescue credit is real but bounded.** It needs a HOLD during that fade window.
- **(Q5) A hostage whose leader dies or leaves stays in that leader's unit.** By the offer code, nobody can FOLLOW it
  again.
- **(Q8) The hostage's WAIT_UP, RESTRAINED, HELPME, PANIC and NO cues are silent.** Only YES, DAMAGE and DEATH play.
- **(Q7) The `Hostage_start` "Cower" script never runs online.**

## 0. Summary table

| # | question | status | grade | answer |
|---|---|---|---|---|
| 1 | Double rescue credit (V2 #26) | RESOLVED | PROVEN (stack code) / STRONG (window, remote credit) | **Yes, but only while the rescued hostage is still fading.** HOLD on a just-rescued hostage takes CAiSRescued off the stack. The next rescue post-tick re-enters 0x11 and calls `FUN_00545480` again: another +3 for the leader and another team recount. The mechanism differs from V2's: `FUN_005f5f20(ctrl,0)` pops nothing; `FUN_00555900` unwinds to 0x17. The window is the fade (≤ 1.33 s, Q2). After that the hostage cannot be picked by the crosshair, so no prompt is offered. FOLLOW+HOLD can repeat the credit inside the window. |
| 2 | Rescued hostage still hittable? (H1 U1) and double kill count (H3 §2.7) | RESOLVED | STRONG | **Hittable only for ≤ 1.33 s.** `CAiSRescued::Tick` sub-state 2 (online) fades the body node's opacity (`node+0x9c`, reCOM `m_Opacity`) at 0.75/s, then calls the node's `SetActive(false)`. The grid traversal skips inactive nodes (`FUN_002d6260` D:L176893, used by the ray query `FUN_002d4780`), so the body leaves the aim pick and the hit tests. The AI word nibble carries the fade to every console (opacity nibble 15 = hidden). The hit chain has no rescued test of its own. A kill inside the window double-counts (freecount + killcount, `mp_hostages_by_*`). Also: with friendly fire off, an escortee is the one teammate-hit target that is **not** exempt (`0x5ac720-0x5ac74c`). |
| 3 | AI speed: throttle → units/s (H1 U5) | RESOLVED | PROVEN (table) / STRONG (throttle = fraction of top speed) | The anim set holds a per-stance speed table: transition_speed_B × 10, max over the Walk/Jog/Run types (`FUN_005e0030`, `FUN_005e0450`). Hostage (`No_weapon anim set`): **forward top 65 u/s (6.5 m/s)**, backward 11, strafe 8, crouch 0. Bands: civ_walk 0-29, civ_jog 12-56, civ_run 34-65 u/s. Throttle t means t × 65 (`FUN_00592880`/`FUN_00592910`). Follow rule: t = clamp(1.2 × leaderSpeed / **leader's** top speed, min(leader+0x1c4, 0.25), 1). A human leader's +0x1c4 is 1.0, so the floor is 0.25. |
| 4 | Follow thresholds and sub-states (H1 U4) | RESOLVED | PROVEN (constants, transitions) / STRONG (roles) | All roles assigned (§4 table). 10/15 decide whether the route is stale; 7 is the replan gate; 3 is the shortcut margin; 8/5 are the arrived look-probe range and threshold; the second 3 is the restart distance after a turn. Sub 4 arrived, 5 turning, 7 idle (restart when the leader moves > 1 or 3 cells), 8 path-failure wait 2.5 s. Corrections: 100 is the follower-to-**goal** distance; 600 is the follower-to-**leader** distance. WAIT_UP, the 600 hold and the rear-look apply only when the leader is the **host's own player** (CSealCtrl slot +0x2c = 1). |
| 5 | Leader disconnect (H3 §8.3) | RESOLVED | PROVEN (release) / STRONG (stranding) | **Released on the host.** The deletion callback calls `FUN_005998b0`, which calls `FUN_005477a0(0, body)`. That kills the body, and its OnDeath `FUN_00547af0` calls `ControlHostageAction(ai,0)` for every hostage it leads. The follow state then ends; the driver pops it. **But the hostage stays in the departed (or dead) leader's unit.** FOLLOW is offered only for a hostage in unit 0x11, and HOLD only to that unit's members, so nobody can order it again (no path back to unit 0x11 found). |
| 6 | Doors and the jail (H2 U2) | RESOLVED | PROVEN (data) / STRONG (effect) | `nohostagerescue` and `okhostagerescue` are the **same 9 wall polygons** (the bars around the cell door, AI column 102, z cells 5-11, doorway rows 9-10). They differ only in **material: 28 METAL_GRATE vs 3 INVISIBLE_DI**. Walkability is unchanged. The swap makes the bars opaque or transparent to the **crosshair pick**: penetration ≥ 0.98 is ignored, and METAL_GRATE has 0.4. With the door shut, you cannot target (order) a hostage through the bars, and bullets meet METAL_GRATE. The AI map is static: no `ai::PAINT` in the door animations. Bars cells are type 9; the doorway cell is type 1. Followers never open doors. |
| 7 | Who starts `Hostage_start` / "Cower" (H1 U3) | RESOLVED | STRONG | `<entity>_start` / `<entity>_ambient` are looked up only by `FUN_00562ad0` (`"%s_%s"` + "start"/"ambient"). It is called only from CSealCtrlAi slot +0x5c, which is reached two ways: (a) AI init when ctrl+0x171 bit 6 is set, which only the AI **respawn** sets (`FUN_005994a0`, offline-only through `FUN_00547350`); (b) the deferred spawner for records with the **`recycle`** key. The hostages have neither. **Online it never runs**; the crouch comes from CAiSHostage sub 3 → 2. |
| 8 | Missing CHRSND entries (V2 owed #2) | RESOLVED | PROVEN | **Silent; no fallback.** Tables start zeroed and are copied from the parent; `mp_hostage_extract` has no parent and no sounds; a null handle plays nothing (`FUN_0053b710`). `mp_fem1-3` have only DEATH, DAMAGE and YES. **WAIT_UP (0x31), NO, RESTRAINED, HELPME and PANIC are silent.** |
| 9 | What a remote console shows (H3 §8.5) | RESOLVED | STRONG | AI word bits 28/29 drive no animation. Bit 29 creates or removes the type-4 "FRIENDLY" compass mark (`FUN_005434b0`/`FUN_00543480`); bit 28 mirrors body+0x105d bit 0. Bits 24-27 are the **node opacity**, not an animation blend. The clip comes from the replicated requested stance (byte 0x7f → body+0x374) and the sticks/speed, through the `No_weapon` set. Spawn: civ_stand. After 2 s: civ_stand2crouch → civ_crouch. Following: stand + civ_walk/jog/run by speed. Rescued: stands, stops, fades out over ≤ 1.33 s, then hidden. |

---

## 1. Double rescue credit (V2 #26)

**Functions read.**
- `FUN_005f5f20` (D:L505663-505679; disassembly 0x5f5f20-0x5f5fb4).
- The stack primitives:
  - `FUN_005f5c00` → `FUN_005f7ee0` = **Push** (suspends the top with signal 2), D:L506832-506867;
  - `FUN_005f5ba0` → `FUN_005f7d80` = **Replace** (ends and deletes the top with signal 1, then adds the new state), D:L506781-506827;
  - `FUN_005f5c80` → `FUN_005f7b10` = **UnwindTo(id)** (pops until the top is `id`, only if `id` is in the stack), D:L506689-506728;
  - `FUN_005f7c40` = **Pop** (signal 1 to the top, delete, signal 3 = resume to the next), D:L506733-506776;
  - the can-push gate `FUN_005f5cd0` (D:L505594-505658);
  - the stack mask builder `FUN_005f7470` (D:L506410-506591).
- `FUN_00555900` (D:L420208-420284); OnCommand cases 4 and 5 (D:L450351-450410, D:L450465-450540).
- The rescue post-tick `FUN_0056f970` (D:L432965-432986); `FUN_00545480` (D:L411554-411572); `FUN_00544d60` (D:L411240-411300).
- `CAiSRescued` OnSignal/Tick `FUN_005594b0`/`FUN_00559070` (D:L422295-422324 / D:L422161-422277).
- The CanPushAiState slots (vtable +0x1c):
  - CAiSHostage 0x601ec0 (disassembly: refuses 0x10; 0x13 only in sub-states 5/6; anything else allowed);
  - CAiSFollow, CAiSRescued and CAiSHold (vt 0x669d30, RTTI "CAiSHold") all point to 0x555390 = `return 1`.
- The offer chain:
  - `FUN_00593d00` (D:L452482-452498, only unit 0x11 is asked);
  - `FUN_005ee7f0` (D:L501797-501940);
  - `FUN_00590bc0` (D:L450705-450891);
  - `FUN_00591770` (D:L451119-451245);
  - `FUN_00591ab0` (D:L451250-451363);
  - `FUN_00591dc0` (D:L451368-451453);
  - CRemoteCtrl slot +0x28 = `FUN_005e69a0` (D:L497512-497525).
- The state driver `FUN_005f8030` (D:L506872-506930): it pops a state whose Tick returns non-zero or whose +0x4a bit 1 is clear.

**Corrections to V2 #26.**
1. `FUN_005f5f20(ctrl, force)` clears the **whole** stack only if `force`, the body is dead, ctrl+0x264 bit 1 is set,
   or the body has 0x40000. Otherwise it only recomputes the masks. With `force` = 0 on a living hostage it pops
   **nothing** (disassembly 0x5f5f34-0x5f5f8c). It is "ClearStack(force)", not a pop.
2. The pop happens inside `FUN_00555900(ctrl,2,0)`:
   - ctrl+0x42c is the OR of `1<<id` over the stack (D:L506573), so `0x42c & 0x800000` means "0x17 is somewhere in the stack";
   - when it is, the function unwinds to 0x17 (`FUN_005f5c80(ctrl,0x17,0)` D:L420253), popping CAiSRescued;
   - it then sets sub-state 2.
3. ctrl+0x428 is the AND of the per-state "allowed next" masks (switch D:L506481-506571). Read by `q1_stack.py`:
   - CAiSRescued's mask 0x190c48c6 has **no bit 9** (FOLLOW) and **no bit 23** (0x17);
   - it does have bit 2 (CAiSHold) and bit 17 (0x11 itself).

**Replay** (`scratch/H4/q1_stack.py`, `out_q1_stack.txt`, the game's own masks and gates):

| step | stack after | unit | +3 |
|---|---|---|---|
| spawn (sub 3) | [0x17] | 17 | |
| FOLLOW (case 4: join leader unit, Push 9) | [9, 0x17] | leader's | |
| enters Safety: post-tick Replace 9 → 0x11 (Follow's signal 1 releases the leader count; +0x5d8 kept) | [0x11, 0x17] | leader's (CAiSRescued online jumps to sub 2, skipping case 0's rejoin of unit 17) | **1st** |
| HOLD offered (`FUN_00591770`: not in unit 17, same unit as the issuer) → case 5 → `FUN_00555900` unwinds to 0x17; YES; rejoin unit 17 | [0x17] | 17 | |
| next post-tick: 0x17 allows 0x11, CanPush(0x11) = 1 → Replace | [0x11] | 17 | **2nd** |
| FOLLOW on rescued (offered: in unit 17) → joins the leader unit, YES, radio 0x2b; Push 9 refused (mask) | [0x11] | leader's | |
| HOLD → `FUN_00555900` fails (0x17 neither present nor allowed); `FUN_005f5ba0(ctrl,2)` Replace 0x11 → CAiSHold; rejoin unit 17 | [2] | 17 | |
| next post-tick: Replace 2 → 0x11 | [0x11] | 17 | **3rd** |

**What bounds it.**
- The crosshair pick must still find the hostage (`FUN_00591dc0`, D:L451421-451426). That stops once the rescued
  fade sets the node inactive (§2).
- A popped CAiSRescued leaves the opacity where it was, and a re-entered one continues the fade. So the total window is
  the cumulative CAiSRescued time until the opacity reaches 0: **≤ 1/0.75 = 1.33 s** (D:L422202, clamp [0,1] by
  `FUN_00539b70` D:L422203).

**Who is credited.**
- Host: `FUN_0056f970` calls `FUN_00545480` directly. +3 and +1 brought-out go only to a leader that is the host's
  player. `FUN_00544d60(leader,1)` (team +1 per living SEAL sharing a bit) runs on every credit.
- Client leader: credited by `FUN_0056f4c0` when the replicated AI-word state byte **changes** to 0x11 (D:L432842-432849).
  - The struct is written once per Tick (`FUN_0056fd00` → `FUN_002bd640`, D:L433518), before the post-tick.
  - So the transient 0x17 (or 2) sits in the struct for one frame.
  - It is sent if a field pump runs in that frame. The AI word field has not changed for a while, so its 100 ms
    interval is open.

  STRONG; one interpretive step (pump order).

**Answer.**
- Yes, one hostage can be credited more than once online.
- It takes a HOLD (or a FOLLOW then a HOLD) within ≤ 1.33 s of the rescue, while the hostage is still visible.
- After the fade, HOLD and FOLLOW are no longer offered (no pick).
- Grades: PROVEN for the stack mechanics (code); STRONG for the window and the client-side credit.

**Owed evidence.** MP6 hosted: lead a hostage into Safety, then press HOLD immediately (< 1 s). Read:
- the leader's score (stats +0x3c, `body+0x58c+0x3c`);
- the hostage ctrl's top state (`*(*(ctrl+0x424)+8)+0x30`).
Repeat the HOLD after 2 s and check that no prompt is offered.

**Change to the synthesis.**
- §8 decision 1: replace "the next tick may re-rescue and award +3 again" with: "HOLD (and FOLLOW+HOLD) on a hostage
  within ≤ 1.33 s of its rescue re-credits +3 each time (host-led: certain; client-led: when the transient AI state is
  sent). After the fade-out the hostage cannot be targeted."
- The decision stays the owner's: copy it, or gate the HOLD/FOLLOW offer on state 0x11 as a recorded adaptation.
- §4.1 diagram: "--HOLD--> CAiSHostage sub 2" also applies from CAiSRescued (only while visible).

## 2. Is a rescued hostage still hittable? (H1 U1, H3 §2.7)

**The fade (new).** `CAiSRescued::Tick` online sits in sub-state 2 forever: `FUN_005594b0` sets sub 2 on signal 0
online (D:L422309-422313). Case 2 (D:L422191-422212):
- it takes `FUN_0029ed20(body)` = body+0x28, the body's scene node;
- it moves `node+0x9c` toward 0 by `dt × 0.75` (dt = `DAT_0044d620`, set by the AI driver `FUN_005f8030` D:L506884);
- it calls node vtable(+0x60)+0x38 with `opacity != 0`.

The pieces:
- **node vtable +0x38 = SetActive.** 0x1ec450 / 0x312a70 (disassembly): it writes bit 0 of node+0x5c and returns the
  old value. The aim ray itself uses it to switch the shooter's own node off around its cast (`FUN_005aa6e0`).
- **node+0x9c = opacity.** reCOM `zNode/znode.h:78` has `m_active` as bit 0 of the params bitfield at +0x5c. Its
  member order puts `m_Opacity` at +0x9c: the decomp confirms +0x64 = `m_parent` (`FUN_005aa600`) and
  +0x94 = `m_nodeEx` (`FUN_005aa610`, `FUN_0059acd0`). STRONG.
- **The AI word carries it.** Writer `FUN_0056f6c0` D:L432905-432913: nibble 15 when the node is inactive or its
  opacity ≤ 0, else round((1−opacity)×15). Receiver `FUN_0056f4c0` D:L432833-432834: opacity = 1 − n/15 and
  SetActive(n ≠ 15). Every console therefore fades and hides it.
- **Inactive nodes leave the hit tests.**
  - The grid atom traversals `FUN_002d61b0` (D:L176837) and `FUN_002d6260` (D:L176893) skip nodes whose +0x5c bit 0 is clear.
  - The ray query `FUN_002d4780` uses `FUN_002d6260` (D:L175789). The aim pick goes `FUN_005aa6e0` → `FUN_0031e160`
    (D:L220105-220119) → `FUN_002d4780`.
  - So once inactive, the body is neither picked (no orders) nor hit.
  - Bullet hit detection through the same grid is STRONG (one step: the projectile's segment test is the same grid service).

**The hit chain itself has no rescued gate.**
1. The body's projectile-contact handler is `0x5ac670`. Ghidra lists it (`socom2_ghidra.csv`, 892 bytes) but the
   decomp has no body; read from the disassembly, `scratch/H4/out_dis_5ac660.txt`. It is reached through the `CSealEx`
   listener vtable 0x669570 slot +8 → trampoline 0x5b8260.
2. Then `FUN_005ab850` (D:L464570-464669) → `FUN_005abbc0` (D:L464674-) → `FUN_005a5a80` (D:L461552-461648) → `Hit`
   message / `FUN_005a5830`.
3. A scan for `0x105c` and state 0x11 in all of these finds none. That agrees with V2/H3.

**New detail.** With `mp_friendly_fire` off (`DAT_0044cdb8`, set from the valve "mp_friendly_fire" 0x3f2860,
D:L150754-150761), the contact handler ignores a projectile whose shooter shares a team bit with the victim
(0x5ac720-0x5ac74c). The exceptions are a victim with 0x20000 (an escortee) and the shooter itself. Hostages share a
bit with everyone, so this exception is what keeps them shootable with friendly fire off. PROVEN (disassembly).

**Kill counters inside the window.** `FUN_0059ee20` (D:L458113-458145) counts every hostage death by the killer's side,
regardless of state. A rescued hostage killed in its ≤ 1.33 s fade therefore counts twice:
- in `freecount` (Rescue sequence) **and** `killcount`;
- and in `mp_hostages_by_seals` / `_turds`, with a SEAL killer's 60 s penalty, or the Terrorists' "credited with
  rescuing" (`rescuecount` +1 again).

This can make SEALcheck's `rescuecheck` (H2 §C) fire early. STRONG (counting code PROVEN; window STRONG).

**Change to the synthesis.**
- §4.1: CAiSRescued online = "stops; fades out at 0.75 opacity/s (≤ 1.33 s); then the body is inactive (invisible,
  not targetable, not hittable); replicated through AI word bits 24-27".
- §5: "AI word bits 24-27 = node opacity (15 = hidden)".
- §8 decision 2: resolved. Not shootable after ≤ 1.33 s, so no server-side guard is needed. The port's server should
  fade the hostage, then remove it from hit tests and picks.
- §9 owed list: replace "shoot a rescued hostage" with "measure the fade time after rescue".

## 3. AI speed (H1 U5)

**Read.** Four functions are involved:
- `FUN_0058bc00` / `FUN_0058bb50` (D:L447655-447684 / 447621-447650): per-stance lookups in the anim set at
  body+0x528. `FUN_0058c350` (D:L447986) is SetAnimSet.
  - stance 0: fwd = [0], back = [1], strafe = [3], [2];
  - stance 1: [4], [5], [7], [6];
  - stance 2: [8], [9], ...;
  - stance 5: [12].
- `FUN_005e0450` (D:L494498-494627): `animset[k]` = the max of the second float over group k.
- `FUN_005e0030` (D:L494315-494470): fed by `FUN_005e30f0` (D:L495576-495583) from the transition-speed records of
  `FUN_00287620` (D:L131587-131597). It stores **A×10, B×10** by anim type into groups:
  - +0x60 = {2 Walk, 3 Jog, 4 Run};
  - +0x90 = {5, 6} backward;
  - +0xc0 = {0xd, 0xf, 0x43} left strafe;
  - +0xf0 = {0xc, 0xe, 0x42} right strafe;
  - +0x120 = {0x14} crouch walk;
  - +0x150 = {0x18};
  - +0x1b0 = {0x16, 0x17}.

  Type names come from the SOCOM II table at 0x661060 (`scratch/H4/animtypes.py`, `out_animtypes.txt`; PROVEN).
- `FUN_0058bcb0` (D:L447689-447740) adds the prone entries.
- `FUN_00592880` (D:L451736-451752) = throttle × top; `FUN_00592910` (D:L451757-451773) = speed / top. The body
  locomotion uses the same table, stick × [k] (`FUN_0057a330` D:L438958-438980).

**Values** (`scratch/H4/q3_speeds.py`, `out_q3_speeds.txt`; `motion.rdr` and `animset.rdr` by V2's raw decoder):

| hostage `No_weapon anim set` | units/s |
|---|---|
| forward top [0] = 10 × civ_run B 6.5 | **65** |
| backward [1] = 10 × civ_walk_bw B 1.1 | 11 |
| strafe L/R [2]/[3] = 10 × 0.8 | 8 |
| crouch / prone movement | 0 (no clips in the set) |
| clip bands A×10..B×10 | civ_walk 0-29, civ_jog 12-56, civ_run 34-65 |

**Follow throttle** (D:L508938-508948):
- t = |1.2 × leaderSpeed / leaderTop|, where leaderTop comes from **the leader's** anim set in the leader's stance
  (`FUN_00592910(..., leaderCtrl, 0)`);
- clamped to [min(leader ctrl+0x1c4, 0.25), 1] — `FUN_00575c80` is min (D:L436194-436201);
- the follower's speed is t × 65.
- Beyond 4.5 × 15 = 67.5 units from its goal, t = 1 (65 u/s, civ_run).
- A human leader's ctrl+0x1c4 = 1.0. The CSealCtrl base constructor `FUN_00598280` writes `puVar2[0x71]` = 1.0
  (D:L454755); the only other writers are the AI's. So the floor is 0.25 (H1's "0.25 × leader throttle" was a misread).
- `FUN_00570f90` (D:L433628-433645) also caps the throttle at 0.12 when `FUN_005609f0(ctrl,1)`, an animation-state
  test. That cap's meaning is not resolved.

**Grade.** PROVEN for the table and the conversion functions; STRONG that AI locomotion speed = throttle × top. The
inverse pair is used for exactly that, but the generic AI move loop was not traced end to end.

**Owed.** The SEAL leader's top speed (its anim set's Run B × 10) is needed for the 1.2 rule. Same script, other set.

**Change to the synthesis.**
- §4.3: "matches 1.2× the leader's speed" becomes "throttle = 1.2 × leaderSpeed / leaderTopSpeed (leader's set and
  stance), floor min(leader cap, 0.25) = 0.25 for players, max 1; hostage speed = throttle × 65 u/s".
- §4.5: add the speed table and the clip bands.

## 4. CAiSFollow::Tick roles (H1 U4)

Read the whole of `FUN_005fb1c0` (D:L508492-509122) and its helpers:
- `FUN_005fc7d0` (D:L509216-509264, the idle restart);
- `FUN_005fdad0` (D:L509902-509973, the look);
- `FUN_005fdd40` (D:L509978-510037, the leader check);
- `FUN_00527e70` (D:L393821-393860, the polyline length in cells);
- `FUN_0052bdf0` (D:L395986-, the route patch);
- `FUN_00559580` (D:L422344-422447, the 5-direction probe).

The constants are in `scratch/H4/q4_follow_consts.py` → `out_q4_follow_consts.txt`. Notation: F = follower cell
(body+0xe8), G = goal cell (state+0x104), L = leader cell (state+0xc0), R = current route's end cell (route node list
`*(ctrl+0x50c)`). Distances in cells are Manhattan. "Units" are world units (10 per cell).

| constant | role (where) |
|---|---|
| int **10** (`DAT_00650ce0`) and int **15** (`DAT_00650ce8`) | Route **stale** when the goal moved (G ≠ R) **and** either the follower is within 10 cells of the route end or the goal is ≥ 15 cells from it (D:L508924-508926). |
| int **7** (`DAT_00650cf0`) | When not arrived, the route is stale, and `FUN_0052bdf0` cannot patch G onto the route: **replan (sub 0)** only once the follower is within 7 cells of the route end (D:L508929-508933). |
| int **3** (`DAT_00650cd8`) | Shortcut, same sub-map: if a straight walkable line F→G exists (`FUN_0052cc80`) and Manhattan(F,G) + 3 < the remaining route length → replan (D:L508898-508921). |
| float **0.1** (`DAT_00650cd0`) | If Manhattan(F,G) ≤ 0.1 × (slot distance + radius 15), with the slot distance in units (= cells·10, D:L510069), the route's active bit (ctrl+0x48c bit 0) is cleared, else set (D:L508896, 508927-508928). That is ≈ 4 cells for slot (2,2). |
| float **10.0** (literal) | Arrived + (F = R or leader speed < 10 u/s) → **sub 4** (D:L508934-508937). |
| int **8** (`DAT_00650d18`), int **5** (`DAT_00650d20`) | Sub 4, only for a host-local human leader on the ground in the same sub-map: probe 5 directions around the leader's reverse heading, range 8 cells (`FUN_00559580` flags 0xd0003); take the lowest-value direction; face its cell (turn `FUN_0056dba0(5.0, …)`, then sub 5) if the value < 5 and the cell is not nearer the leader than the follower is. Else no turn (D:L508969-509044). On MP6, `FUN_005fc550`'s cell types {2,4,5,12} do not occur (cell census in `out_q6_cells.txt`: 0,1,6,7,9,10,11), so its branches are dead there. Role of the value: BELIEVED. |
| int **3** (`DAT_00650d28`) | State+0xc4: the leader must move **> 1 cell** (from its cell at arrival, state+0xc8) to restart from idle, or **> 3 cells** after a facing turn (`FUN_005fc7d0` D:L509239-509258; set D:L508961, D:L509043). |
| float **3.0** (`DAT_00650d30`) | Sub 7/8: every 3 s, clear the "looked" flag so `FUN_005fdad0` re-aims the head at the leader (escortee: `FUN_00600f70(ctrl,0,leaderVec,1)`) (D:L509069-509075, D:L509963-509970). |
| 2.5 s (0x40200000) | Sub 2: the path request failed → sub 8 with +0x80 = 2.5; sub 8 counts it down → sub 0 (D:L508825-508830, D:L509076-509081). |
| 100 / 600 | WAIT_UP when |G − F| (**goal**, state+0x114) > 100 units. Inside that block, return early (no move) when |L − F| (**leader**, state+0xf4) > 600 (D:L508755-508775). Both need leader ctrl slot +0x2c = 1: CSealCtrl 0x5431f0 `return 1`, CRemoteCtrl/CSealCtrlAi 0. So only the **host's own** player triggers WAIT_UP and the 600 hold. A client leader never does. |

**Sub-states, for a transcription.**
- **0** plan: route reset (to the leader's trail when walkable), A* request `FUN_005623b0(G)`, → 2; or, if arrived, → 4.
- **2** wait for the path → 3, or → 8 (2.5 s).
- **3** move: the replan tests above, then throttle.
- **4** arrived: store L and restart distance 1; rear-look (local human leader only); → 5 if turning, else → 7.
- **5** turning, until the turn ends → 7 (restart distance 3).
- **7/8** idle: look at the leader every 3 s; 8 returns to 0 after 2.5 s; 7 returns to 0 only through `FUN_005fc7d0`
  (the leader moved, and the follower is no longer arrived).

Before all of this, every tick:
- the leader check (`FUN_005fdd40`), the unit checks, and the stance-mirror phase (until the leader's trail ≥ 8 cells);
- the goal (`FUN_005fd790` on the trail, else leader − 0.65 × velocity + slot);
- the arrived test 1.25 × 15;
- WAIT_UP; the stance (escortee: stand).

Grades: PROVEN (constants, comparisons, transitions); STRONG (roles); BELIEVED (the probe value's meaning).

**Change to the synthesis.**
- §4.3: replace "Open: the roles of six integer cell thresholds…" with the table above.
- Correct "WAIT_UP cue beyond 100 units; beyond 600 it holds" to "WAIT_UP when > 100 from its goal; holds when > 600
  from the leader; both only for the host's own player as leader".
- The WAIT_UP cue is silent anyway (Q8).

## 5. Leader disconnect (H3 §8.3)

Path on the host:
1. `FUN_002bef60` (D:L162512-162542) → `FUN_005998b0` (D:L455500-455536). For a remote body:
   - `FUN_005477a0(0.0, body, 0)` (D:L455521);
   - the team mask is set to 0, the id to −1;
   - body vtable +0x90 = `FUN_0058a6b0(body, 8)` sets stance 8 (D:L446814-446825);
   - aiteam recount; and, on the host, `FUN_005ed7b0(unit, body, 1, 0)` (D:L501132-501150: an event dispatcher that
     flags the unit) and `FUN_005edf90(body)` (removal from its unit, D:L501481-501546).
2. `FUN_005477a0` (D:L412821-412842): the body was alive and the new health is 0, so it calls body vtable +0x58 =
   0x6691f8 = **`FUN_00547af0`** (OnDeath). That runs before the id is cleared.
3. `FUN_00547af0` (D:L413031-413046): if the body leads hostages (+0x520 ≠ 0), every AI whose stack holds state 9
   (ctrl+0x42c bit 9 = 0x200) and whose leader is this body gets `FUN_005fcf10(ai,0)`. This resolves H3's "meaning of
   0x200": it is "CAiSFollow is in the stack".
4. `FUN_005fcf10` (D:L509476-509517): the leader count goes −1, +0x5d4 is set to 0, and the follow state's +0x4a bit 1
   is cleared. The driver `FUN_005f8030` then pops CAiSFollow (D:L506892-506926). CAiSHostage resumes its old
   sub-state; OnSignal(3) changes nothing (0x601f20 makes no calls).

**Answer: yes, released on the host.** PROVEN. Further:
- +0x5d8 keeps the departed leader's id. That body's id becomes −1, so `FUN_0056f970`'s lookup fails and +0x5d8 is
  reset (D:L432967-432973): no rescue until someone leads it again.
- **Stranded (STRONG, new).** No path returns the hostage to unit 0x11 on release.
  - Only HOLD (case 5), the init, Rescued's offline case 0 and the net applier `FUN_002bdea0` do that.
  - The FOLLOW offer requires unit 0x11 online (`FUN_00591ab0` D:L451280-451286).
  - HOLD requires the issuer in the hostage's unit (`FUN_00591770` → `FUN_005ef340`).
  - The departed leader's unit (type id+0x20 on the host, `FUN_002bdea0`) then holds only the hostage. **The same
    holds for leader death**: the dead body stays in its unit.
  - So, by the code, a hostage whose leader died or left **cannot be ordered by anyone for the rest of the round**.
    It stays where it stopped, standing.
  - Clients agree: the hostage's unit replicates in SealObject field 0x74 (writer D:L161944-161959, applied by
    `FUN_002be020` → `FUN_002bdea0`, D:L162175-162210). H3's "0x74 counter only, not applied" is a misread.

**Owed evidence.** MP6, a SEAL leads a hostage and is then killed (or quits). Then:
- a second SEAL aims at it within 20 m: is "FOLLOW!" offered?
- read the hostage ctrl+0x10c unit (`+0x58` type).

This is the one result here that most needs a capture before it is copied.

**Change to the synthesis.**
- §4.1: "leader dies → released (CAiSHostage), last-leader id kept" gets the addition "…and stays in the dead
  leader's unit, so by the code no one can FOLLOW it again (capture owed)".
- §5 "Leader dies: the host releases" holds. Add "Leader leaves: the deletion kills the body (`FUN_005477a0`), so the
  same release".
- §8 decision 3: resolved as source-read; no adaptation is needed. The owner must decide whether to copy the
  stranding once the capture confirms it.
- Bonus correction for H3 §3.1: field 0x74 = the unit id (0x11, a player's id+0x20, or the host player's) and it **is
  applied**.

## 6. Doors and the jail (H2 U2)

**Data** (`q6_door_polys.ts`, `q6_door_world.ts`; outputs in `scratch/H4/`).
- `nohostagerescue` and `okhostagerescue` (both node flags 0x80001051, origin (1789, 50, 1380)) are **identical**
  sets of 9 `ditype 2` (wall) quads.
- In the world they form the bars along x 1731.2-1734 (AI column 102), z 1178.5-1239.5 (cells z 5-11), height
  50-85, with a doorway gap at z 1218.5-1231.5 (cells 9-10).
- They differ **only in material**: no = **28**, ok = **3**. Table indices per `q6_materials.py` (two built-ins, then
  SOILS; 11 = WATER as the port documents):
  - 28 = METAL_GRATE: opacity 0.6, penetration 0.4, ricochet 0.75;
  - 3 = INVISIBLE_DI: opacity 0, penetration 1.
- The cell door leaf `cdoor1/mp6_celldoor` (13 wide, at the doorway) carries the same two faces in **both** materials.

**What the swap changes.**
- Not walkability: same geometry, still DI walls with the doorway open.
- The **crosshair pick** `FUN_005aa6e0` (D:L464132-464190) treats a hit as a blocking surface unless:
  - its material is liquid-flagged (bits 0/1 of +0x3c), or
  - its PENETRATION (+0x24) ≥ 0.98 without flag bit 4.

  So METAL_GRATE bars block the pick and INVISIBLE_DI bars do not. With the door shut (`not_okforhostages`), a player
  outside the cell cannot get a hostage under the crosshair through the bars. The 20-cell order range has no line of
  sight of its own, so **no FOLLOW/HOLD prompt** appears until the door is opened (`okforhostages` makes the bars
  pick-transparent).
- Bullets meet METAL_GRATE (penetration 0.4) instead of INVISIBLE_DI (1.0). How the bullet's penetration value
  applies was not traced (lead).

**The AI map is static.**
- Bars cells are type 9 (stored, i.e. walkable in the A* sense); the doorway row 10 is type 1 (`out_q6_cells.txt`).
- The door animations' set-2 commands are `ai::MOVE` (16), `ai::ANIMATE` (20), `ai::EVENT` (5) and `ai::SIGNAL`
  (26). These are ids from `FUN_005de320`'s registration order (H1 `zanim_regs.txt`). There is no `ai::PAINT` (17), so
  opening or closing does not repaint the AI map.
- Online the `ai::EVENT` noise is ignored (event masks 0).

**Followers and doors.**
- CAiSFollow has no door logic. The only door-opening AI orders are the SP squad commands "OPEN DOOR" (strings
  0x65d620/0x65d788), and those are not offered for hostages (only 0xe/0xf, `FUN_00593d00`).
- A follower paths through the doorway cell whether the door is open or not. If the door is shut, the leaf's DI
  polygons stop the body physically. BELIEVED; owed: the capture in H2 U2.

**Grade.** PROVEN (data); STRONG (pick effect, from code + data).

**Change to the synthesis.** §2 "Cell door … what the swap blocks is open" becomes: "the swap changes only the
material of the bars around the door (METAL_GRATE ↔ INVISIBLE_DI): with the door shut the bars block the
crosshair (no orders through the bars) and partly bullets; walkability and the AI map are unchanged; followers never
open doors".

## 7. Who starts `Hostage_start` / "Cower" (H1 U3)

1. The names are composed at run time: `"%s_%s"` (0x65c938) with "start" (0x65c940) or "ambient" (0x65c948). That is
   why H1 found no "Hostage_start" string.
2. The only composer is **`FUN_00562ad0`** (D:L427085-427098). It stores the animations at ctrl+0x450 and +0x458.
3. Its only caller is `FUN_00573bd0` (jal at 0x573be0). That is CSealCtrlAi vtable slot +0x5c (0x66944c). It starts
   slot 1 (start, as a pushed "script" state 1) and slot 3 (ambient) via `FUN_00561f00` (D:L426605-426648).
4. Slot +0x5c is reached two ways:
   - **AI init** `FUN_00573130` D:L434922-434930, when ctrl+0x171 bit 6 is set. The only writer of that bit (byte-store
     scan `scan_sb.py 171 sb`) is `FUN_005994a0` at 0x5995b4 = the **AI respawn** at its setup point, which also
     signals "on_respawn". Its caller `FUN_00547350` (body slot +0x8c) runs it only when `DAT_0045a0c1 == 0`
     (offline, D:L412708-412713).
   - **Body slot +0x4c** = `FUN_00553e60` (D:L419393-419397). Its only caller is `FUN_002b21d0`
     (D:L155519-155535), the deferred spawner for records queued by `FUN_002b2e50` when record +0x15c bit 4 is set.
     That bit is the `recycle` key (parser `FUN_00533370` D:L400405-400449: keys debug/disabled/nofade/noshoot/
     recycle/nosnooze = bits 0-5).
5. MP6's hostage records have only name/display/character/setup/team (V2 `out_mp6_vehicles.txt`).
6. On clients the hostage's CRemoteCtrl slot +0x5c is 0x5e6270 = `jr ra` (a no-op).

**Answer: online, `Hostage_start` never runs.** The hostage's crouch is CAiSHostage sub 3 → 2 (H1).

**Grade.** STRONG. The search for indirect callers of body slot +0x4c / ctrl slot +0x5c was a grep of
`(*x + 0x4c))(` / `+ 0x5c))(` call shapes plus a `jal` scan. A computed call through another shape cannot be fully
excluded.

**Change to the synthesis.** §4.5 "Captive pose" and H1 #14: "The mission's `Hostage_start` 'Cower' (SETANIMSET,
STANCE crouch) is looked up only on an offline AI respawn or for `recycle` records; it does not run online. Do not
port it for MP."

## 8. Missing CHRSND entries (V2 owed #2)

**The tables.** A character's tables (+0x14 names, +0x168 handles, 85 entries each):
- are zeroed (`FUN_0053d7c0` D:L406662-406663);
- are copied whole from the parent named after ':' (D:L406771-406772);
- then get the record's own `sounds` overwriting its ids (`FUN_0053bef0` D:L405602-405698).

Handles are made only for non-null names (`FUN_0053c200` D:L405752-405755).

**The play path.** The voice call is ctrl vtable +0x24 = `FUN_0055ff60` (D:L425495-425565) →
`FUN_0053b710(body+0x540 table, id, …)`. That plays nothing and returns 0 when the handle is null
(D:L405260-405266). There is no default bank and no global fallback.

**The data** (`q8_chrsnd.py` → `out_q8_chrsnd.txt`):
- `mp_hostage_extract` has no parent and no `sounds`;
- `mp_fem1/2/3` (parent `mp_hostage_extract`) have DEATH `.FEMALE_DEATH`, DAMAGE `.FEMALE_DAMAGE` and YES `^CO_0343`.

**Answer.** Silent for RESTRAINED (0x4b), HELPME (0x49), PANIC_CRY (0x48), **WAIT_UP (0x31)** and NO (0x38). YES,
DAMAGE and DEATH are audible. PROVEN.

**Change to the synthesis.**
- §4.4: "the disc defines no RESTRAINED/HELPME/PANIC sounds … (whether a fallback bank plays them is open)" becomes
  "…and there is no fallback: they are silent; so is WAIT_UP".
- §4.3: drop the audible WAIT_UP. The timer logic can stay for fidelity, but it is inaudible.

## 9. What a remote console plays for a hostage (H3 §8.5)

**AI word.** Writer `FUN_0056f6c0` D:L432863-432923; reader `FUN_0056f4c0` D:L432812-432856.
- **Bit 29** = alive and 0x20000. With it, `FUN_005434b0(body,4,0)` (D:L410127-410172) creates the compass mark: type
  4, label "FRIENDLY" (0x65c2a8), only if the local player shares a team bit. Without it, `FUN_00543480` frees the mark
  (D:L410116-410121). No animation.
- **Bit 28** → body+0x105d bit 0. That flag gates the **offline** order offer (`FUN_00591dc0` D:L451414). No animation.
- **Bits 24-27** = node opacity / active (§2), not an "animation blend".

**What drives the clip on a remote.**
- The SealObject fields: requested stance byte 0x7f → body+0x374 (D:L162314-162316). The body then moves its stance
  +0x174 toward it (`FUN_00552d60`/`FUN_00552ec0` D:L418865-419011). SetStance writes +0x374 (`FUN_00562b70`
  D:L427139-427141).
- Byte 0x80 → +0x375.
- The three stick axes → `SetThrottle` (D:L162295-162309).
- The anim set comes from the character (`mp_fem*` → `No_weapon anim set`), so the selection is the generic
  stance/speed rule (research 80 §3 / 86 §1.1, in the port).

| hostage state on the host | what a remote shows |
|---|---|
| 0x17 sub 3 (first 2 s) | stance 0: `civ_stand` |
| 0x17 sub 2 / 5 (held, watching) | stance 1: `civ_stand2crouch` once, then `civ_crouch` (`FUN_00563100` crouch, default delay 0.25 + U(0, 0.95) s) |
| 9 following | stance 0 (escortee forced stand, `FUN_005fc590`); clip by speed: civ_walk ≤ 29, civ_jog 12-56, civ_run 34-65 u/s bands (§3); backward/strafe civ_walk_bw/rstep/lstep |
| 0x11 rescued | stays standing (Follow's end crouches only from prone, `FUN_00562fc0(ctrl,2,0)` D:L510090-510093); route cleared, stops (`civ_stand`); fades out over ≤ 1.33 s, then hidden (nibble 15 → `SetActive(false)`) |

**Grade.** STRONG. The mapping rests on the generic stance/speed selector the port already implements. The stance and
opacity bytes are PROVEN.

**Change to the synthesis.**
- §5: add a line "Remote clip = stance byte + speed via the hostage's anim set; bits 28/29 = order flag / compass mark;
  bits 24-27 = opacity (fade-out after rescue)".
- §7 P11: "clip selection from state and speed" becomes "from the replicated stance and speed; rescued = fade then hide".

---

## 10. Sourced but not implemented (multiplayer-relevant)

- **Rescued fade-out** (0.75 opacity/s, then node inactive) and its replication through AI word bits 24-27. The port
  has no opacity on bodies.
- **Friendly-fire exemption excludes escortees** (`mp_friendly_fire` valve, contact handler 0x5ac720-0x5ac74c). The
  port's server-side hit cones must still hit hostages when friendly fire is off.
- **Unit membership replicates** in SealObject field 0x74 (hostage: 0x11 or the leader's unit). The port needs a
  "hostage's unit" (unit 17 vs the leader) to reproduce the offer rules exactly.
- **Inactive nodes are skipped by all grid ray queries** (`FUN_002d6260`, `FUN_002d61b0`). That is generic and also
  matters for any hidden or switched-off object.
- **The hostage speed table and conversion** (§3) apply to every AI body.

## 11. Leads for other workstreams

- **H2 / C3 ([181](181-c3-combat-hud-effects.md)):**
  - How bullet penetration uses a material's PENETRATION (METAL_GRATE 0.4 on the bars). The contact path
    `0x5ac670` is absent from the decomp; read it from `out_dis_5ac660.txt`.
  - The aim pick's ignore rule (penetration ≥ 0.98, liquid flags), `FUN_005aa6e0` D:L464132-464190, also decides
    which surfaces block door prompts (research 92).
- **H3:**
  - Field 0x74 is applied (unit join), D:L162205 → `FUN_002bdea0`.
  - The "AI word blend" is node opacity.
  - The `aiteam`/"SealsAliveCount" question is unchanged.
- **Names for the csv (r0001):**
  - `FUN_005f5f20` ClearAiStack(force); `FUN_005f5c00` PushAiState; `FUN_005f5ba0` ChangeAiState (replace);
    `FUN_005f5c80` UnwindToAiState; `FUN_005f7c40` PopAiState; `FUN_005f8030` TickAiStack.
  - `FUN_00562ad0` LoadStartAmbientAnims; `FUN_005994a0` CZSealBody AI respawn; `FUN_005e0450` AnimSet ComputeTopSpeeds.
  - Node vtable +0x38 = `zdb::CNode::SetActive`.
  - `0x5ac670` the body's OnProjectileContact (missing from the decomp).
- **Research 75:**
  - Cell word bits 0-4 are a cell type. MP6 Base Map census: 0:2124, 1:8278, 6:67, 7:96, 9:39, 10:833, 11:8. 0
    outdoors, 1 indoors, 10 walls, and 9 on the jail bars, by placement.
  - Consumers: `FUN_005fc550` ({2,4,5,12}), `FUN_0058fa70` ({0,8,9,10}).

## 12. Verification (V5, 2026-10-04)

The verifier's file: `research-wave-2026-10-04/V5-verify-hostage-closures-round2.md` (its scripts and outputs under `research-wave-2026-10-04/scratch/V5/`). V5 verified H4, round 2's R2-C2 ([201](201-r2-c2-movement.md)) and R2-MN ([203](203-r2-mn-match-modes-net.md)), two R2-C3 ([202](202-r2-c3-combat.md)) items and the grenade-spin dispute between C3/V1 and R2-C3. What follows is the verifier's own text for this report's claims, verbatim; its claims about the other reports are in their notes ([178](178-the-research-wave-of-2026-10-04.md) has the table).

Verifier V5, wave 2026-10-04. Read-only; no builds, runs, git writes or network. `D:L<n>` is a line of
`C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c` (r0001). I used my own tools, not the authors' helpers.
- `scratch/V5/v5.py` reads `game/disc/socom2_game.elf` through pyelftools, disassembles with capstone and prints the
  decomp.
- The jal, word, lui and store scanners are mine.
- Second-route values come from the PCSX2 RDRAM dump `logs/parity/spawn_pcsx2.rdram` and from raw disc bytes.

Every script and output is in `scratch/V5/`; its `README.md` lists them.

### 12.1 Verdicts

| # | claim | verdict | one-line reason |
|---|---|---|---|
| H4-1 | HOLD on a rescued hostage re-credits +3; `FUN_005f5f20(ctrl,0)` pops nothing | **CONFIRMED-WITH-CORRECTION** | The mechanism, the unwind and the re-credit hold. One side detail is wrong: mask 0x190c48c6 does **not** contain bit 17 (it has bits 18 and 19). |
| H4-2 | Rescued fade at 0.75/s → SetActive(false); ray queries skip inactive nodes; ≤ 1.33 s; bits 24-27; double count; FF-off exemption | **CONFIRMED** | Each step was re-read. The aim ray's own use of node vt+0x38 confirms SetActive. The FF exemption is exact in disassembly. |
| H4-3 | Hostage speeds 65 / 11 / 8; clip bands; follow throttle | **CONFIRMED** | Matches the **live RDRAM** anim set: No_weapon [65, 11, 8, 8, 0…], bands 0-29 / 12-56 / 34-65. All five follow constants were read from `.data`. Bonus: the SEAL set's top speed is also 65. |
| H4-4 | Follow thresholds; 100 = goal distance, 600 = leader distance; only for the host's own player | **CONFIRMED** | +0x114 = \|goal − follower\|, +0xf4 = \|leader − follower\|. Slot +0x2c returns 1 only for CSealCtrl (and CSealCtrlSquirm); CSealCtrlAi and CRemoteCtrl return 0. |
| H4-5a | Disconnect → `FUN_005998b0` → `FUN_005477a0(0)` → OnDeath `FUN_00547af0` releases; field 0x74 is applied | **CONFIRMED** | Exact; slot +0x58 of CZSealBody's vtable (0x6691a0) is 0x547af0. |
| H4-5b | **Stranding**: the released hostage can never be ordered again | **WRONG** | The **UnitTick** task (`FUN_005e8060`) runs when a leader dies or leaves. If no member of the unit is still alive, it **issues HOLD (cmd 5) to every escortee**. OnCommand case 5 puts the hostage back in **unit 0x11** (D:L450536-450539). Host player, client player and disconnect are all covered. |
| H4-6 | Jail bars differ only in material, 28 METAL_GRATE vs 3 INVISIBLE_DI | **CONFIRMED** | A raw MP6.ZDB diff of the two 9-polygon runs shows one differing word per polygon, `(w>>10)&0x3f` = 28 vs 3. The RAM material table has [28] METAL_GRATE (penetration 0.4) and [3] INVISIBLE_DI (penetration 1). |
| H4-7 | `Hostage_start` never runs online | **WRONG** | At every level or round start, `FUN_002a7d40` calls slot +0x4c on **every** object. For a body that is `FUN_00553e60` → ctrl +0x5c → `FUN_00562ad0` ("Hostage_start"), online included, on the host. Whether the Cower sequence then *shows* is owed. |
| H4-8 | Missing CHRSND entries are silent; only YES/DAMAGE/DEATH play | **CONFIRMED** | Null handle → no play (D:L405260-405266); tables are zeroed and copied from the parent. On the disc, `.FEMALE_DAMAGE` and `.FEMALE_DEATH` are the only female sounds. The per-record contents rest on V2's decoder. |
| H4-9 | Remote clip from stance byte + speed; bits 24-27 opacity, 29 compass, 28 order flag | **CONFIRMED** | Writer `FUN_0056f6c0` and reader `FUN_0056f4c0` re-read; byte 0x7f → body+0x374 (D:L162314-162316). |

### 12.2 H4-1: Double rescue credit

What I re-derived, by reading rather than by H4's replay script:
- **`FUN_005f5f20(ctrl, force)`** (D:L505663-505679). It clears the stack only if `force` is set, body+0xe1 bit 4 is
  clear, ctrl+0x264 bit 1 is set, or body has 0x40000; otherwise it only recomputes the masks.
  - Bit 4 of +0xe1 is "alive": `FUN_0029e8b0` clears it on death (D:L144775).
  - So with force = 0 on a living hostage it pops nothing. Confirmed.
- **The masks.** ctrl+0x41c is the stack: +0x428 is the AND of the allowed-next masks, +0x42c the OR of `1<<id`
  (D:L506572-506573).
- **The unwind.** `FUN_00555900(ctrl,2,0)` (D:L420208-420284) unwinds to 0x17 when +0x42c bit 23 is set (D:L420253).
  `FUN_005f5c80` → `FUN_005f7b10` = UnwindTo.
- **The re-credit.** The post-tick (D:L432965-432986) calls `FUN_005f5ba0(ctrl,0x11)` = CanPush + Replace (D:L505520-505532).
  - It passes because the AND for [0x17] contains bit 0x11 (`masks.py`), and CAiSHostage's CanPush (0x601ec0,
    disassembly) refuses only 0x10, and 0x13 outside sub-states 5/6.
  - `FUN_00545480` then adds +3 (D:L411554-411572).
  - +0x5d8 (the leader id) is written only at D:L432972 (reset when the lookup fails), D:L509501 (follow start) and
    D:L432785 (client receive), so it survives the HOLD. Confirmed.
- **The FOLLOW + HOLD row.** The [0x11] mask allows 2 and not 9 or 0x17, and slot +0x1c of vt 0x669d30 is 0x555390,
  `return 1`. Confirmed.
- **Correction.** H4 says CAiSRescued's mask 0x190c48c6 "does have bit 17". It does not: its bits are 1, 2, 6, 7, 11,
  14, 18, 19, 24, 27, 28 (`out_masks.txt`). Nothing in H4's replay depends on that bit, because the re-entry is checked
  against 0x17's mask, which does contain 0x11.

### 12.3 H4-2: The rescued fade and hittability

- **The fade.** Case 2 (D:L422191-422212) moves node+0x9c toward 0 by dt × 0.75, clamped to [0, 1]: 0x64fd88 = 0.0 and
  0x64fd90 = 1.0 (ELF). It then calls node vt(+0x60)+0x38 with `opacity != 0`.
- **vt+0x38 is SetActive.** 0x1ec450 and 0x312a70 both write bit 0 of node+0x5c and return the old bit. They fill
  slot +0x38 of the vtable family 0x406120 and 0x4067b0-0x406990.
- **Second line of evidence for SetActive.** The aim pick itself switches the shooter's node off and back on through
  the same slot (D:L464121-464124).
- **The grid skip.** `FUN_002d6260` (D:L176892-176893) and `FUN_002d61b0` (D:L176836-176837) skip nodes with
  +0x5c bit 0 clear.
- **The AI word.** Writer: nibble 15 when inactive or opacity ≤ 0 (D:L432905-432913). Reader: opacity = 1 − n/15 and
  SetActive(n ≠ 15) (D:L432833-432834). Confirmed.
- **Friendly fire off.** Disassembly 0x5ac708-0x5ac750 (`v5.py dis 5ac670 80`):
  - `DAT_0044cdb8` is the FF flag, set from `mp_friendly_fire` (0x3f2860, D:L150754-150761);
  - with it off, a projectile whose shooter shares a 0xc8 team bit with the victim is dropped;
  - except when the victim has 0x20000, or the shooter is the victim. Exact.
- **Kill counter.** `FUN_0059ee20`'s hostage branch (D:L458116-458144) has no state test. I did not re-derive the
  script-side `freecount`/`killcount` double count; H4 grades that STRONG and I leave it there.

### 12.4 H4-3: Speeds (second route: live RAM)

- **Code.** `FUN_005e0030` (D:L494315-494470) stores A × 10 and B × 10 per anim type. A and B come from the keys
  `transition_speed_A` / `_B` (0x3ef930 / 0x3ef950, D:L131286-131289), passed at D:L495581. `FUN_005e0450` takes the max
  B per group. Confirmed.
- **Data.** `animset_rdram.py` reads the anim sets the game built in `spawn_pcsx2.rdram` (`out_animset.txt`):
  - No_weapon anim set: [65, 11, 8, 8, 0, 0, 0, 0]; forward group (2, 0–29), (3, 12–56), (4, 34–65). Exact.
  - Seal anim set: [65, 37, 65, 65, 20, 20, 20, 20]. This answers H4's owed SEAL leader top speed: **65**.
- **Follow constants** (`v5.py f`, `.data`): 4.5 (0x650cf8), 1.2 (0x650d00), 0.25 (0x650d08), 1.0 (0x650d10).
  - The min is `FUN_00575c80` (D:L436194-436201).
  - The human ctrl+0x1c4 = 1.0 (D:L454755).
  - The throttle conversions are `FUN_00592880` / `FUN_00592910` (D:L451736-451773).
- So the hostage at t = 1 runs at the SEAL's own top speed, 65 u/s.

### 12.5 H4-4: Follow thresholds

- **Constants** (`.data`): 10, 15, 7, 3, 8, 5, 3 (ints) and 0.1, 3.0, 1.25, 100, 600.
- **What the distances measure:**
  - state+0xa4 is the leader's position (D:L508606-508610) and state+0xd8 the follower's (D:L508621-508623);
  - +0xf4 = \|0xa4 − 0xd8\| (D:L508629-508640);
  - +0x114 = \|0xf8 (goal) − 0xd8\| (D:L508721-508732).
- **The 100/600 gate** (D:L508752-508775) uses the leader ctrl's slot +0x2c:
  - 0x5431f0 (`return 1`) sits in the vtables of CSealCtrl (0x6694b0) and CSealCtrlSquirm (0x6699f0);
  - CSealCtrlAi (0x575c30) and CRemoteCtrl (0x5e6250) return 0.
- The stale/replan comparisons (D:L508896-508933) match H4's roles. Confirmed. One note: CSealCtrlSquirm also
  returns 1. It is a variant of the local player's controller; this does not change H4's conclusion.

### 12.6 H4-5: Leader disconnect / death: release confirmed, stranding wrong

**Release (CONFIRMED).**
- `FUN_002bef60` → `FUN_005998b0` (D:L455500-455536) → `FUN_005477a0(0, body)` (D:L412821-412842) → body
  vt+0x58 = `FUN_00547af0`. 0x6691f8 holds 0x547af0, and the vtable's RTTI is "CZSealBody".
- OnDeath loops over the AIs whose stack holds 9 and calls `FUN_005fcf10(ai,0)`. That clears the follow state's
  +0x4a bit 1 (D:L509476-509517).
- Field 0x74 is applied on receive: `FUN_002be020` → `FUN_002bdea0` (D:L162119-162171; writer D:L161944-161959).

**Stranding (WRONG).** H4 traced `FUN_005ed7b0` only as "an event dispatcher that flags the unit". Here is what the
flag does.
1. **Death fires event 1 on the leader's unit.**
   - Body OnDeath calls `FUN_0029e8b0` first (D:L413024). That clears the alive bit and calls ctrl vt+0x18.
   - For the local player (CSealCtrl, slot at 0x6694c8) that is `FUN_005979a0`, whose first line is
     `FUN_005ed7b0(ctrl+0x10c unit, body, 1, 0)` (D:L454472).
   - For an AI (CSealCtrlAi) it is `FUN_005714b0`, which fires the same event (D:L433948).
   - For a leader that disconnects, `FUN_005998b0` fires it itself on the host (D:L455529). It then removes the body
     from the unit (`FUN_005edf90`, D:L501481-501546).
2. **Event 1 sets unit+0xa3** (`FUN_005ed140` D:L500965-500966).
3. **UnitTick runs every frame online.**
   - `FUN_005e7fd0` is registered as the task **"UnitTick"** (0x3e1ee0; D:L50920, `luiscan.py 5e7fd0` → 0x1ec550).
   - It ticks every top-level unit when `DAT_0044d5c0` is set.
   - The online unit init `FUN_005eccd0` sets that flag (D:L500772). That init is the branch taken when online
     (D:L152183-152188); it creates units 0 and 0x11 among others.
4. **The tick hands escortees a HOLD.** `FUN_005e8060` (D:L498341-498463), when +0xa3 is set:
   - it counts the living members and moves dead ones to the dead list +0x88;
   - **when no living member is left**, for every escortee (+0x74 list) it calls the escortee ctrl's vt+0x84 with
     command **5 (HOLD)**;
   - the issuer is the last dead member, or the local player when the dead list is empty, which is the disconnect case.
5. **Where the HOLD lands.**
   - On the host (hostage ctrl = CSealCtrlAi, slot +0x84 = `FUN_0058fbe0`), case 5 runs `FUN_00555900` (back to
     CAiSHostage, sub 2), the YES cue, and `FUN_005ee250(unit 0x11, hostage)` (D:L450536-450539).
   - On a client (hostage ctrl = CRemoteCtrl, slot +0x84 = `FUN_005e6a00`), cmd 4/5 are forwarded to the host by
     `FUN_002bb970`.
   - The host's handler `FUN_002bb8e0` (D:L160706-160721) calls `FUN_00590ac0` → OnCommand directly, with no offer
     check, while the game state is 3.
   - On a client the hostage sits in the escort list of the client's own unit 0: the applier's field-0x74 = "local
     player id + 0x20" branch, `FUN_005ee160` (D:L162150-162156). So the client's own death triggers this path.

**Result.** For each case below, the hostage is released, says YES, crouches, and **rejoins unit 0x11**, so FOLLOW is
offered again:
- the host's player dies;
- a client leader dies (the client's UnitTick forwards the HOLD);
- a leader disconnects (the host's UnitTick, issuer = host player).

Grade: STRONG. Every link is a read call or slot. The one interpretive step is that a player's unit has no other living
member online.

**Other rejoin paths checked and ruled out.**
- `CAiSSurrender` (state 6) tick case 4 also rejoins 0x11 (D:L514720-514727). It is reachable only through
  `FUN_00561550`'s surrender choice, whose trigger bit (ctrl+0x264 bit 7) is set only offline (D:L433174) or by
  surrender itself (jal 0x6081ac).
- The AI init (D:L434915) and Rescued's offline case 0 are as H4 says.

**Owed (replaces H4's).** MP6, a SEAL leads a hostage and is killed. Expect, within one frame:
- the hostage's YES cue;
- the hostage's ctrl+0x10c → the unit with +0x58 == 0x11;
- "FOLLOW!" offered to a second SEAL.

### 12.7 H4-6: Jail bars

- **Raw bytes, no parser** (`q6_rawpoly.py`, `out_q6_rawpoly.txt`). MP6.ZDB holds two 9 × 0x50-byte polygon runs
  at 0x56f970 and 0x56fca0.
  - Both follow the same node flags (0x80001051) and origin (1789, 50, 1380).
  - They differ in exactly 9 words: one per polygon at +8, 0x44007012 vs 0x44000c12, i.e. `(w>>10)&0x3f` = 28 vs 3.
  - Name-table order (no at 0x4a1866 before ok at 0x4a1876) and the run order agree with no = 28.
- **Material table from RAM** (`materials_rdram.py`, `out_materials.txt`; vector at 0x44f350, count 0x44f354,
  array 0x44f358 — the same globals the aim pick reads, D:L464140-464143):
  - [3] INVISIBLE_DI: opacity 0, penetration 1;
  - [28] METAL_GRATE: opacity 0.6, penetration 0.4;
  - [11] WATER.
- **Aim-pick ignore rule:** penetration ≥ 0.98 without flag bit 4, or liquid (D:L464148-464153). Confirmed. I did not
  re-check the AI-map paint claims.

### 12.8 H4-7: `Hostage_start`: a path H4 missed (WRONG)

H4's search was for `(*x + 0x4c))(` call shapes. It missed D:L149744-149746:
- `FUN_002a7d40` walks the global object list `DAT_004362e8` (the list OnDeath walks to find bodies) and calls each
  object's slot **+0x4c**, with no type filter;
- for a body that is `FUN_00553e60` (0x6691ec), which calls ctrl slot +0x5c (D:L419393-419397);
- for the host's hostage (CSealCtrlAi) that is 0x573bd0: `jal 0x562ad0` composes "<node name>_start"/"_ambient", then
  starts slot 1 (unless ctrl+0x264 bit 1) and slot 3 through `FUN_00561f00`.

`FUN_002a7d40` runs at every level start (`FUN_001ec480` D:L50946) and at the online round restart. The latter is
`FUN_00223680` D:L75920-75935 (game state 3 or 5), referenced from the handler table at 0x405794. The record name is
"Hostage" (V2 `out_mp6_vehicles.txt`), so the lookup is "Hostage_start", which H1 found in MP6's MZANIM.

Caveats; the effect is owed:
- `FUN_00561f00` starts the anim instance (`FUN_00272c30`, D:L426633) **before** it tries to push script state 1.
- That push is refused if CAiSHostage is already on the stack: the 0x17 mask lacks bit 1 (`out_masks.txt`).
- `DAT_003df188` (the gate) is 1 in the ELF and in RAM.

Owed: MP6 host, round start. Read hostage ctrl+0x450, +0x45c and +0x460 (the start/ambient handles and instances),
and the hostage's stance and anim set during the first 2 s. Clients do nothing: CRemoteCtrl slot +0x5c (0x5e6270) is
`jr ra`, which is confirmed.

### 12.9 H4-8: CHRSND

- **Code:**
  - `FUN_0053b710` gives no handle for id > 0x54 or a null slot (D:L405260-405266);
  - the tables are zeroed (D:L406662-406663) and then copied whole from the parent (D:L406771-406772);
  - handles are made only for names (D:L405752-405755).
- **Data:**
  - `chrsnd_raw.py` cannot place strings in records: `.rdr` pools its strings.
  - It does show that READERC.ZAR's only female sound names are `.FEMALE_DAMAGE` and `.FEMALE_DEATH`.
  - The per-record table (mp_fem1-3 = DEATH, DAMAGE, YES `^CO_0343`) is V2's decoder output. I accept it; I did not
    re-derive it.
- The cue ids H4 names match their callers: WAIT_UP 0x31 (D:L508758), YES 0x37 (D:L450379, 450537).

### 12.10 H4-9: Remote view

- Bits 28/29 and the nibble are confirmed (above).
- The stance byte 0x7f → piVar[0xdd] = body+0x374 (D:L162314-162316), byte 0x80 → +0x375 (D:L162318-162319).
- One addition H4 did not list: byte **0x7e** drives `FUN_005dfe30(body, b)` (D:L162310-162311), the rifle raise state
  (+0xf74). For a hostage this is the hands state. Whether it changes a hostage's clip was not traced.

### 12.11 Things to carry forward (items 1, 3 of its "Sourced but not implemented" and item 3 of its "Leads")

**Sourced but not implemented (found while verifying)**

- **UnitTick's escortee HOLD** on a leader's death or departure: the hostage returns to unit 0x11 with a YES cue
  (§H4-5). This replaces "stranded".
- **Online round start re-runs every body's start/ambient lookup** (`FUN_002a7d40` → slot +0x4c).

**Leads for other workstreams**

- **H-synthesis:** §8 decision 3 is no longer "copy the stranding"; it is "copy the UnitTick HOLD". Also, field 0x7e
  replicates the hands/raise state.
