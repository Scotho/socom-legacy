# 377 -- r0004's hostage glitch closed: the credit once, no hit on a rescued hostage, no order in 0x11 (R4B-04, G12)

- Date: 2026-11-01. Task R4B-04 of the [r0004 plan](../plans/r0004-option-b.md), under the owner's ruling OT.R97
  (MISSION: r0004 is the specification for gameplay and front-end behaviour). Branch `agent/r4b-04`.
- Track: simulation. It changes what the game does: the score a hostage's rescue pays, whether a rescued hostage can be
  hurt, and whether it can be ordered.
- **Supersedes HX.R5 for these three behaviours.** HX.R5 (the [hostage plan](../plans/2026-10-06-hostage-and-modes.md),
  2026-10-06) copied r0001's two quirks on purpose -- the re-credit inside the fade (owner call 1, H126) and the kill
  counted beside the rescue (owner call 2, H127) -- and kept the order offered inside the fade. OT.R97 makes r0004 the
  specification, and r0004 closes all three; HX.R5's text and its r0001 readings stay where they are, re-filed below
  (R4B.R6) as "r0001, superseded by r0004 (OT.R97)".
- Status: **reading, pending review** (R4B.R3). Nothing here is measured running. This note's author read every r4 site
  cited in §1-§4 with capstone (the scratchpad's `r4dis.py`) in `game/overlays_r0004/socom2_game_r0004.elf` (the PINE
  dump) **and** the served decrypt `game/r0004/served/socom2_game_served.elf`: no word differs over 0x574810-0x574a3c,
  0x574cf0-0x5750bc, 0x55e7d0-0x55e8a0, 0x5a7660-0x5a7800, 0x5b2360-0x5b2720, 0x597630-0x5977e8, the vtable words
  0x668d70+0x30/+0x38/+0xa4 and 0x668f10+0x30/+0x38/+0xa4, and their targets 0x57afd0, 0x57b020, 0x547c30, 0x579bc0,
  0x5ee220. A reviewer who did not write this re-reads them before they count as readings (R4B.R4). dot left G12
  unresolved ("credit/damage gates not independently traced"); the gameplay review agreed on the receiver's refusal
  (`r0004-gameplay-review/WORKFLOW-G-REVIEW.md`, G12).
- Sources: `C:/Projects/agent-mail/evidence/r0004-investigation/cluster-misc-player-reports.md` §1 (the credit),
  `cluster-hud-armory-stat-hooks.md` §9 (the receiver), `cluster-ff-projectile-exception.md` §1 difference 2
  (OnWeaponHit); REPORT.md row G12 and the corrections at its foot (none touches G12; dot's F1-F2 bind the confidence).
  §4 is this task's own read: the cluster called the order test's change "unread". r0001 is cited `FUN_<addr>` /
  `D:L<line>` of `game/analysis/socom2_game.elf.decomp.c`, or by address where the function is absent from it. No
  decompiled or disassembled text is pasted.
- The link to the players' "hostage glitch" (Neoseeker, March 2004) is inference, strong: it is the only hostage-scoring
  exploit the notes found, and r0004 closes it at every layer below.

## 1. The rescued bit

`CAiSRescued::OnSignal(0)` sets the hostage body's `+0x105c` bit 3 online (r0001 `FUN_005594b0` D:L422314; r4
0x55e870-0x55e884, unchanged). Nothing clears it (research 179's census of `+0x105c` writers; 180's
`KNOCK_LANDING_GATE_READING` row); the round's reload builds a new body. The port has it as `HostageAi.rescued` (set at
the 0x11 signal 0, a new AI each round), unchanged by this task. In r0001 only the host set it (a client's hostage runs
`CRemoteCtrl`, never `CAiSRescued`); r0004's client credit sets it too (§2).

## 2. The credit once (ported)

**Host** -- r0004's twin of the escortee post-tick `FUN_0056f970` (r4 0x574cf0-0x5750bc; r0001 D:L432964-432985):
- r4 0x574e40-0x574e4c: after the zone test, `ctrl+0x42c & 0x20000` (0x11 anywhere on the stack: the OR of `1 << id`,
  D:L506573) skips the rest -- the leader's lookup, its reset of a departed one (`+0x5d8` = -1) and the Replace.
  r0001 looked the leader up every frame and only the Replace's gate refused 0x11 on top.
  `RESCUE_STACK_GATE_READING`.
- r4 0x574e8c-0x574eb0: body `+0x105c` bit 3 sampled before the Replace by 0x11 (`FUN_005f5ba0`'s twin, r4 0x5fd380);
  the Replace, the zone and the rescuer recorded as in r0001 (0x574ebc-0x574f04); then r4 0x574f00: the credit
  (`FUN_00545480`'s twin, r4 0x549ea0, called 0x574f0c) only when the bit was clear. The team carry (`FUN_00544d60`)
  runs inside the credit, so it is paid once too. `RESCUE_CREDIT_ONCE_READING`.

**Client** -- r0004's twin of `FUN_0056f4c0` (r4 0x574810-0x574a3c; r0001 D:L432820-432849): on the replicated AI
word's state changing to 0x11 (0x574948-0x57495c, as r0001), a new test skips the credit when the bit is set
(0x574970-0x574980); the credit (0x5749c8); then the bit set whether or not a leader resolved (0x5749d0-0x5749e4).
Each console credits a hostage once.

**In the port:** the room is the one authority and credits every seat itself (`Room`'s `on('rescued')` listener; the
page pays nothing on a 0x11). So the client twin is this one credit, not a second path. `ExtractionAuthority.rescueTest`
returns while 0x11 is on the stack (`stack.has(0x11)`), samples `ai.rescued` before `ai.rescue`, still enters 0x11 and
releases the lead, and emits `rescued` (the credit) only when the bit was clear.

**r0001, superseded:** a HOLD inside the fade unwound 0x11 to 0x17 and the next post-tick rescued and credited again,
+3 and brought out +1 a time, the script's Rescue one-shot once (research 199 §1's replay; 239 §4.4; owner call 1,
HX.R5; H126). The test keeps the r0001 figures as a labelled reference beside r0004's (`[6, 2]` against `[3, 1]`).

## 3. No hit on a rescued hostage (ported)

r0004 adds the bit to both gates a hit on a hostage passes.

- **The online hit receiver** (`FUN_005a1b80`'s twin, r4 0x5a7660; r0001 D:L459490-459618, no `+0x105c` read): a new
  early return at r4 0x5a76d8-0x5a7718, when the victim's controller answers `IsAi` (vt+0x30; r4 `CSealCtrlAi` 0x57b020
  returns 1, `CRemoteCtrl` 0x54e6e0 returns 0) and the bit is set -- before the statistics, the damage, the knock and
  the killer's record, for every category (it precedes the 'Q' / 'y' / 0xab dispatch). This is the path of a client
  shooter's bullets and launched rounds: his console sends `Hit`, the host's receiver applies it (research 191 §2).
- **`CZSealBody::OnWeaponHit`** (`FUN_005ac670`'s twin, r4 0x5b2360; r0001 0x5ac670, absent from the decomp, research
  179 §8.2, 219 §1.2): the gate in front of the damage dispatch and the blast queue (r0001 `FUN_005ab850`, r4 0x5b14e0).
  Past the alive and type tests it asks the victim's controller vt+0x38: `CSealCtrlAi`'s returns the controller itself
  (r4 0x57afd0; r0001 0x575bf0), `CRemoteCtrl`'s and `CSealCtrl`'s 0 (r4 0x547c30; r0001 0x5431e0) -- so this arm is a
  host-side AI victim's, a hostage's. On it, r0001's item tests are kept (0x79 / 0x7e with state 10 on the stack;
  item 0x9f, the Backblast, from a found owner who is the victim or shares a team bit: r4 0x5b25b0-0x5b25fc, as r0001
  0x5ac8b0-0x5ac8fc), and where r0001's "not 0x9f" branch went straight to the damage (0x5ac8b8 -> 0x5ac900), r0004 goes
  to a new test (r4 0x5b2600-0x5b261c): the bit set, return 0 -- no damage, no knock (0x5b2620's calls), no blast queue.
  This is the path of the host's own rounds and of every blast on the host's hostage.
- What lands, then: a Backblast whose owner is not found live (left the room). A found owner's Backblast is dropped by
  the 0x9f arm on any hostage, its 0xC0020000 sharing a bit with either side's mask (§6 records what the port does with
  that arm on an unrescued hostage). `RESCUED_HIT_READING`.

**In the port:** `Room.hostageRefuses(attacker, itemId, h)` -- the friendly-fire gate's escortee pass as before, then
`rescuedRefuses(h, attacker !== null, itemId)` (`./extraction`): the bit set and not (a Backblast with no live owner).
All three hostage hits ask it: `hostageBulletHit` (bullets and volleys), `hostageDirectHit` (a launched round's body
strike), the blast's hostage loop (before its knock). `targetable` is unchanged (alive, not hidden): the body stays a
PERSON surface the rounds strike and the picks meet, as OnWeaponHit returns 0 on either path.

**r0001, superseded:** no damage path or counter tests the rescued state (research 199 §2; 189 U1; 191 H3-h): a hostage
shot inside its fade died and counted killed beside its rescue (`freecount` and `killcount`, the killer's side's valve,
a SEAL's minute; owner call 2, HX.R5; H127; `DOUBLE_COUNT_READING = 'copied'`, retired by this task, §5).

## 4. No order on a hostage in 0x11 (ported; found on the way)

The cluster read r0004's order test as untouched "for this" (its +7/-24 words unread). Read here, it is the first layer
of the fix. r0004's twin of `FUN_00591dc0` (r4 0x597630-0x5977e8; r0001 D:L451366-, the 0x11 test at
D:L451396-451412):
- r0001 tested "rescued" only through the AI controller (vt+0x38, 0x591e40-0x591e98: the stack's top id 0x11), which
  only the host has, and used it only behind `+0x105d` bit 0 (offline) (0x591eb0-0x591ecc); online the escortee arm went
  to `FUN_005750a0` with no rescued test (0x591ed8-0x591eec).
- r0004 asks the controller's state through vt+0xa4 (r4 0x5976b0-0x5976d4): `CSealCtrlAi`'s returns the top state id
  (r4 0x579bc0, as r0001 0x574800), `CRemoteCtrl`'s the replicated AI word's state byte (r4 0x5ee220, as r0001
  `FUN_005e6a50`, research 191 §2). The escortee arm refuses a target in 0x11 first (r4 0x5976e8-0x5976fc), online or
  not, then keeps r0001's `+0x105d` / `FUN_005750a0` (r4 0x57a470) test.

So in r0004 no console offers HOLD or FOLLOW on a hostage in 0x11, and the re-entry r0001's glitch rode on does not
happen through an order; §2's gate is the belt behind it (a state that leaves 0x11 by any way re-enters with no credit).

**In the port:** the shared order test's one predicate, `rescuedRefusal` (viewer `net/hostageOrder.ts`), returns
`'rescued'` for a target whose state is 0x11 -- the room's (`HostageAi.state`, through `OrderRequest.hostage.rescued`)
and the page's (the replicated `HostageStateWire.ai`). `RESCUED_REORDER_READING` re-valued.

**r0001, superseded:** `'offered within the fade'` -- HOLD offered and accepted inside the fade (189 §14.14, 199 §1;
owner call 1, HX.R5).

## 5. Re-filed and retired (R4B.R6)

| r0001 reading | r0001 value | under r0004 (OT.R97) |
|---|---|---|
| `RESCUED_REORDER_READING` (viewer `net/hostageOrder.ts`) | `'offered within the fade'` | re-valued `'refused while its state is 0x11'` (§4) |
| `DOUBLE_COUNT_READING` (match `extraction.ts`) | `'copied'` | retired: the constant and `targetable`'s dead branch removed; its behaviour is `RESCUED_HIT_READING`'s (§3) |
| the rescue test's "no gate on a hostage already rescued" (JSDoc of `rescueTest`, 239 §4.4) | re-credit each re-entry | `RESCUE_CREDIT_ONCE_READING`, `RESCUE_STACK_GATE_READING` (§2) |

HX.R5 is recorded as superseded for these three where it is written: the hostage plan's HX.R5, research 239 §4.4 and its
§8 rows, research 101's HX-4a and HX-5 rows, HUMAN_TASKS H126 and H127 (answered by OT.R97, kept as asked), the parity
registry's `hostage.order.rescued-reorder`, `objective.extraction.double-credit` and `.double-count`.

## 6. Found on the way: the Backblast arm is an AI victim's (note only, not ported)

§3's vtable read reaches past G12. In r0001 and r0004 alike, OnWeaponHit's item arms -- the Backblast's own-side drop
(0x9f) and the M67 / HE drop (0x79 / 0x7e with state 10) -- sit behind the victim controller's vt+0x38 answering
non-null (r0001 0x5ac80c-0x5ac820, r4 0x5b250c-0x5b2520), which only `CSealCtrlAi` does (r0001 0x6693f0+0x38 = 0x575bf0
returns `this`; `CSealCtrl` 0x6694b0+0x38 and `CRemoteCtrl` 0x669590+0x38 = 0x5431e0 return 0). Read so, a player is
never spared his own side's Backblast by that arm, and a hostage is spared every found owner's. The port does the
reverse on both counts: `ffRefuses` spares a player's side from the Backblast (PF-22, research 219 §1.2 item 4) and
returns no refusal at once for an escortee (`HOSTAGE_FF_READING`, so a hostage takes any Backblast). Neither is G12's,
and neither is changed here: `BACKBLAST_ARM_AI_VICTIM_READING` (*note only*), owed its own row -- the PF-22 gate re-read
with the vtables, and a capture (a LAW fired with a teammate and a hostage behind the firer).

## 7. Tests

central `test/roomExtraction.test.ts` (no data; the flat floor with Desert Glory's Safety zone):
- the HX-5 kill case: a hostage rescued by SEAL 4 and shot by Terrorist 1 inside its fade stays alive with its health
  unchanged; `killcount` 1, `byTurds` 0, Terrorist 1 at 0 (r0001's case read 2, 1, -2). A HOLD inside the fade driven on
  the AI (`hold`) re-enters 0x11 and pays nothing: the leader `[3, 1]`, the team carry once (r0001's `[6, 2]`,
  labelled).
- the HX-4a order case through the room: HOLD inside the fade refused `'rescued'`, 0x11 kept, `[3, 1]` throughout.
- new, R4B-04: the stack gate (a rescued hostage's departed last leader is not forgotten); an M67 at the feet of a
  hostage with the bit -- alive, health and position unchanged -- and without it killed; `rescuedRefuses` over items and
  a live or departed owner.
central `test/roomHostageOrders.test.ts`: HOLD inside the fade refused `'rescued'` (r0001: unwound to 0x17). viewer
`test/hostagePage.test.ts`: no offer on a hostage whose wire state is 0x11; one in 0x17 at a partial opacity still
offered.

The launched round's direct hit (`hostageDirectHit`) asks the same `hostageRefuses` as the bullet and the blast; no room
case fires a grenade launcher at a hostage (none existed before), so that call site is held by the shared predicate's
test, not a case of its own.

## 8. Readings

| Name | Status and evidence needed |
|---|---|
| `RESCUE_CREDIT_ONCE_READING` | match `extraction.ts`: `'once: body +0x105c bit 3 clear before the push'` (§2: r4 0x574e8c-0x574eb0, 0x574f00-0x574f0c; client r4 0x574970-0x5749e4). Reading, pending review. To proven: a PCSX2 `--build r0004` MP6 host, a hostage led into Safety, its stack forced out of 0x11 over PINE, the leader's score (`+0x3c` of `body+0x58c`) read across the re-entry. |
| `RESCUE_STACK_GATE_READING` | match `extraction.ts`: `'no rescue test while 0x11 is on the stack'` (§2: r4 0x574e40-0x574e4c). Reading, pending review. To proven: the same run, the last leader leaving inside the fade, `ctrl+0x5d8` read. |
| `RESCUED_HIT_READING` | match `extraction.ts` (`rescuedRefuses`): `"every hit refused but a departed owner's Backblast"` (§3: r4 0x5a76d8-0x5a7718, 0x5b2600-0x5b261c, 0x5b25b0-0x5b25fc; vt+0x38 r4 0x57afd0). Reading, pending review. To proven: capture C2 on r0004 (research 206's owed run 12) -- a hostage shot inside its fade from the host and from a client, body `+0x1044`, `+0xe1` bit 4, `+0x105c` read; and an M67 at its feet. |
| `RESCUED_REORDER_READING` | viewer `net/hostageOrder.ts`: re-valued `'refused while its state is 0x11'` (§4: r4 0x5976b0-0x5976fc; vt+0xa4 r4 0x579bc0, 0x5ee220). Reading, pending review. r0001's `'offered within the fade'` superseded (§5). To proven: on r0004, HOLD pressed at once on a hostage brought into Safety, from the host and a client -- the prompt and the AI's top state. |
| `DOUBLE_COUNT_READING` | retired by R4B-04 (§5): r0001's `'copied'`, superseded by r0004 (OT.R97); the behaviour is `RESCUED_HIT_READING`'s. |
| `BACKBLAST_ARM_AI_VICTIM_READING` (*note only*) | §6: OnWeaponHit's 0x9f and 0x79/0x7e arms are reached only for a victim whose controller's vt+0x38 is non-null (`CSealCtrlAi`), in r0001 and r0004; the port's `ffRefuses` spares players' sides from the Backblast and lets any Backblast through on a hostage. Owed: its own row (PF-22 re-read with the vtables), then a capture. |
