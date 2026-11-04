# 353 -- r0004 respawn spawn selection

- Date: 2026-10-21.
- Plan: [original respawn fixes](../plans/2026-10-21-respawn-fixes.md), RSP-5, simulation track.
- Base: `agent/respawn-fixes` at `2a78f9e2bfb4abeb9a4a6605a0bcf398cfaad6c3`.
- Confidence: **reading**, fresh independent source/data/implementation review **PASS (medium)**, 2026-10-21.
  The source is static instructions in the original r0004 EE snapshot. No capture scoring, measured spawn-position
  comparison or proven claim.
- Scope: `Room.pick` and its tests. Classic picking, connection-index allocation, queue capacity, protocol and the
  respawn release flag are unchanged.

## 1. Source and method

The controller supplied the working setup's original EE snapshot, locally retained under ignored
`logs/respawn-fixes/reference-r0004-ee.bin` in the integration worktree. It is 33,554,432 bytes, SHA256
`40f1aab9259b77c11ea9b74e5bdc2f1a1295b201f5572825abeb88fbfa65ed36`, CRC32 `2fd8ec24`. The controller matched the
CRC32 to its saved-state member and identified the setup by the companion original title capture,
`logs/respawn-fixes/reference-r0004-title.png`, which labels r0004, November 3, 2004. The bytes and image remain
outside git. This author independently checked the snapshot's size/hash and inspected bounded instruction ranges
at the addresses below; it did not run the game or acquire another state.

The r0004 source is named by function and instruction address, rather than invented decompilation line numbers.
Capstone does not decode every PS2 instruction correctly; the bounded inspection follows the ordinary control,
integer and floating-point instructions, with the controller's PS2 instruction reading for the remaining words.
The prior r0001 reading is [research 179 section 9.3](179-c1-match-server.md#93-respawn_block_placeholder-portpackagesmatchsrcroomts1203),
`FUN_002b7ee0`, D:L158657-158716; dispatcher `FUN_002b8100`, D:L158760-158787; reader `FUN_0052b5c0`,
D:L395740-395765. Those older locations are context for the mapping, not a claim that the unpatched disc and r0004
are interchangeable.

## 2. The r0004 rules read

| rule | original source |
|---|---|
| Integer block width is `trunc(keyCount / 24)`; its first requested index is `width * actorClientIndex`, and the loop ends at first plus width. | `FUN_002b9a70`, `0x2b9a74-0x2b9aec` and `0x2b9acc-0x2b9b1c`; the division uses reciprocal `0x2aaaaaab`. |
| Only this block is scanned, preserving the key list's original order. | `FUN_002b9a70`, `0x2b9b18-0x2b9b50` and `0x2b9c40-0x2b9c48`. |
| Opponents are actors of type 2 with a disjoint team mask at `+0xc8`; the loop has no alive/dead test. | `FUN_002b9a70`, `0x2b9b70-0x2b9bb4`, full actor scan through `0x2b9c24`. |
| For each candidate, take the minimum squared 3D distance to those bodies, using actor position `+0x1c`, then maximise that minimum. | `FUN_002b9a70`, `0x2b9bb8-0x2b9be0` and `0x2b9be4-0x2b9c38`. |
| Only a strict improvement replaces the selected record, so ties keep the earlier record. | `FUN_002b9a70`, `0x2b9c28-0x2b9c38`. |
| The scores initialise to -1. With no enemy, the chosen index stays at the block's first; there is no random draw. | `FUN_002b9a70`, `0x2b9ac4-0x2b9ad0`, `0x2b9b30-0x2b9b3c` and the strict-improvement branch above. |
| A nonempty respawn list with width zero performs no candidate loop and returns record zero. | `FUN_002b9a70`, `0x2b9b00-0x2b9b1c` and return path `0x2b9c50`. |
| Respawn round-start keys 0/2 use this same client block. Width 1 skips RNG; other widths call `rand`, take the remainder by width, then add the block's first index. Other keys call the max-min picker. | `FUN_002b9c90`, `0x2b9ce0-0x2b9da0`; width-one branch `0x2b9d34-0x2b9d44`, RNG/remainder `0x2b9d48-0x2b9d60`, block addition `0x2b9d68-0x2b9d70`, other keys `0x2b9d78-0x2b9d84`. |
| Each requested unsigned record index wraps modulo the actual positive key count. An empty list returns failure. | `FUN_0052e6e0`, `0x52e734-0x52e760`; count is supplied by `FUN_0052e900`. |

`SpawnSlot.side` separates keys 0/2 and 1/3 into the port's start/respawn lists; filtering retains their input order.
The picker does not sort their decoded `index` labels. It does not round a key count up or append its remainder to
any normal client block. For Frostfire's 277/247 records, widths are 11/10, not a guessed multiple of 24; the earlier
read is [research 356 F5](356-original-multiplayer-respawn-audit.md#f5-the-spawn-picker-still-searches-the-whole-sides-pool).

The controller re-read all six eligible maps' `RUN/MP*.ZDB:AIMAPS.MPS` trailer lists through `parseZdb`, `zdbMember`,
`parseAiMaps` and `spawnSlots`, recording the following decoded counts. The script/output remain ignored under
`logs/respawn-fixes/original-spawn-counts.ts`. These are **data readings**; the implementer did not repeat the scan,
but the fresh reviewer independently re-read every list through the repository readers. Keys 0/2 are starts and
1/3 are respawns; counts are given as SEAL/Terrorist.

| map | start counts | start widths | respawn counts | respawn widths |
|---|---|---|---|---|
| MP2 Frostfire | 24/24 | 1/1 | 277/247 | 11/10 |
| MP5 Abandoned | 24/24 | 1/1 | 168/217 | 7/9 |
| MP8 Rat's Nest | 24/24 | 1/1 | 334/340 | 13/14 |
| MP51 Vigilance | 25/24 | 1/1 | 167/177 | 6/7 |
| MP64 Shadow Falls | 24/24 | 1/1 | 200/228 | 8/9 |
| MP81 Chain Reaction | 24/24 | 1/1 | 218/193 | 9/8 |

Thus every eligible original-map start list has width one and consumes no random draw.

### Client-index boundary

The original local actor stores the client-ID result at `+0xfc8` (`FUN_002bf9e0`, call to `FUN_0032aad0` and store
at `0x2bfa70-0x2bfa80`). A remote actor takes the network member index (`FUN_0059f190`, called at `0x2c0e58`,
stores `+0xfc8` at instruction `0x59f2a0`);
LocalLobby records the same ID at `+0x44` (`0x2c7368-0x2c7374`). The original spectator lookup explicitly scans
0..23 (`0x2c4c78-0x2c4c9c`). These associations do not establish the original DME's allocation/reuse policy.

The port's existing connection-wide `Room.clientIndex` is retained, including a queued spectator's index on
promotion. No `clientIndex % 24` is introduced. If a port queue supplies index 24 or higher, the picker multiplies
that index by the block width and wraps each requested record against the actual list length, as the source reader
does. This specifies the known reader operation on that input, not proof that original DME produces such an input.

## 3. Implementation and verification

The respawn picker now builds candidates from the client block, considers other-team players alive or dead, keeps
the first on equal scores and returns the first without RNG if no opposing body exists. Round-start blocks use one
injected draw only when their width exceeds one; width one selects the client's record directly. Classic's sorted
round-start slot selection, waiting-room random selection and existing living-enemy picker remain unchanged.

`match/test/respawnSpawn.test.ts` observes public spawn events after hello, launch, promotion and the existing Action
command. Its floor, positions and staged life/death states are test instruments. It covers both sides and key lists,
multiple connections, uneven counts and unused tails, no enemy under three RNG values, a dead opponent changing the
answer, same-team exclusion, minimum across several bodies, Y distance, strict ties/input order, zero-width respawn
lists, queue indices 24/25 and actual-count wrapping, one- and three-record start blocks, classic selection, and the
retained absent/custom-data boundaries below.

The central `round.parity.test.ts` max-min fixture formerly had only three respawn records per side, which is a
zero-width original block. It now has 72 records per side, three candidates per client block, repeating the same
three test positions. Its assertions are retained. Its custom eight-record start list is unchanged and remains
under the small-start placeholder.

Focused RED, after correcting test-import and event-filter setup errors, before production changed:

```text
Test Files  1 failed | 1 passed (2)
     Tests  13 failed | 22 passed (35)
```

Focused GREEN, including two added boundary-preservation checks:

```text
Test Files  2 passed (2)
     Tests  37 passed (37)
```

No tests are filtered or skipped in these commands. These are transcription/room unit tests, not dev-disc tests or
original-runtime comparisons. Reviewer command, from `socomlegacy/`:

```sh
../node_modules/.bin/vitest run packages/match/test/respawnSpawn.test.ts packages/central/test/round.parity.test.ts --maxWorkers=2
```

Compatibility checks also ran `roomRespawnRules`, `roomRespawnLifecycle`, `roomLaunch`, `roomJoin` and `roomLoadout`:
all seven match/central files passed, **142 tests, zero failed/filtered/skipped**. The same invocation included
`tools/test/placeholderLedger.test.ts`, giving **154 passed and 1 failed** overall: the controller-owned
`PROCESS.md` note range still ends at 350 rather than 353. All placeholder presence, retirement and suffix checks
passed. The implementer did not edit that shared index or rebuild the corpus; integration must update them.

No game, browser, build, workspace typecheck, full suite, all-map disc scan or physical playtest was run by this
implementer. The fresh reviewer independently checked the native ranges, all six original maps' counts and the
implementation, reran the 37-test focused set and 142-test compatibility set, and returned **PASS (medium)** after
correcting the remote-actor locator to `FUN_0059f190`. The source/data checks are readings; no original-runtime
comparison was performed. The release restriction is untouched.

## 4. Placeholders

| name | retained scope | evidence that would close it |
|---|---|---|
| RESPAWN_BLOCK_PLACEHOLDER | Narrowed: (1) a missing respawn list still falls back to the entire start list, using the prior living-enemy/random selection; native dispatch has no such fallback. (2) a custom start list below 24 records still draws randomly from that whole list; native width zero calls RNG and divides by zero, whose hardware result is not established here. (3) larger synthetic/custom start blocks retain the port's injected `[0,1)` RNG mapped to an offset; no native `rand` state/sequence equivalence is claimed. Original-map nonempty respawn blocks and width-one starts use the rules in section 2. | Review the original empty/invalid-data callers and EE zero-divisor result before replacing fallbacks; establish a native RNG adapter/trace before claiming its stream. A controlled original-runtime comparison remains owed for the reviewed readings. |

There is no new placeholder name. The existing missing-data and custom-map fallbacks are retained expressly rather
than claimed to be original behaviour. The eligible original maps' start counts re-read above are 24/25, so their
width is one and the native RNG-stream gap does not choose their starting record.
