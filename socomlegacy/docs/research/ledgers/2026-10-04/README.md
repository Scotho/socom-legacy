# The research waves of 2026-10-04: the machine-readable ledgers

Copied from the evidence archive (`research-wave-2026-10-04/` on the owner's host; research
[178](../../178-the-research-wave-of-2026-10-04.md) gives its root) with the home-directory paths replaced (`$PORT` =
the `agent/online` snapshot of 2026-10-04, `$PORT/..` its root). Otherwise as the waves wrote them. Everything here is
**reading, pending review -- not adopted**, like the notes it indexes (179-207).

## Wave 1 (notes 179-193; round 2 and the close, 199-207)

| file | what it is | schema |
|---|---|---|
| `ledger_names.tsv` | Every `*_PLACEHOLDER` / `*_READING` name in PORT's sources when the wave began (427), with the first file that holds it. The wave's starting inventory. | Tab-separated, no header: `name`, `file` (relative to `$PORT`, e.g. `packages/viewer/src/armory.ts`). |
| `ledger_by_cluster.tsv` | The same 427 names, each assigned to the research cluster that owned it (C1-C9; H and M clusters took none by name). | Tab-separated, no header: `cluster` (the report's file stem, e.g. `C1-match-server`), `name`, `file`. |
| `clusters.json` | Which PORT source files each cluster owned. | A JSON object: cluster file stem -> array of paths relative to `$PORT/packages/` (e.g. `archive/rdr.ts`). |
| `LEDGER-ALL.tsv` | The whole ledger after round 2 (notes 199-205): **697 rows**, the per-cluster ledgers C1-C9 merged, with round 2's new rows under `R2-AV`, `R2-C3`, `R2-MN`, `R2-UI` (M1's and M2's gap matrices are not in it; 388 resolved, 73 partial, 41 unresolved, 195 not a gap -- research [206](../../206-verification-overrides-and-the-waves-close.md) §5). A row round 2 re-researched carries round 2's status. **Research 206 §1 wins over any row of it.** | Tab-separated with a header: `cluster`, `name`, `file` (relative to `$PORT`), `kind` (as each cluster wrote it: `PLACEHOLDER`/`placeholder`, `READING`/`reading`, `note-only`, `comment`, `unnamed`, `ledger`, ...), `status` (`RESOLVED`, `PARTIAL`, `UNRESOLVED`, `NOT-A-GAP`), `grade` (the wave's words: PROVEN = a reading), `answer_short`, `source_short`, `updated_by` (the round-2 report that last changed the row, empty for round 1). |

The per-cluster ledgers each report names (`ledger-C1.tsv` ... `ledger-M2.tsv`, `ledger-R2-*.tsv`, one row per item
with its status, grade and answer) stay in the archive; `LEDGER-ALL.tsv` merges them, and each report's own summary
table carries the same rows.

## Wave 2 (notes 194-198)

| file | what it is | schema |
|---|---|---|
| `findings.jsonl` | The 40 normalised wave-2 findings, all four lanes merged (W2-A 22, W2-B 8, W2-C 5, W2-R 5). | One JSON object per line (below). |
| `findings.tsv` | A compact table of the same 40 rows. | Tab-separated with a header: `id`, `novelty`, `priority`, `title`, `confidence`. |
| `ledger-W2-A.jsonl`, `ledger-W2-B.jsonl`, `ledger-W2-C.jsonl`, `ledger-W2-R.jsonl` | Each lane's own rows, before the merge. | As `findings.jsonl`. |

A finding's fields:
- `id` -- `W2-<lane>-<nn>`; the lane's note (194 A, 195 B, 196 C, 197 R) names it in its heading or its tables.
- `title` -- one line.
- `novelty` -- `new` (an integration gap nobody had named), `extends` (more evidence or a scope correction for known
  work), `covered` (already in an earlier report or note), `superseded` (a newer implementation or reading replaced it),
  `deferred` (the owner's or another stream's).
- `priority` -- `P1` / `P2`, a sequencing proposal, not a launch blocker.
- `confidence` -- the wave's normalised words ("source reading", "inference", "unresolved"); a source reading is a
  **reading, pending review** under AGENTS.md's levels; nothing in wave 2 was measured running.
- `port_status` -- what PORT does today.
- `prior_coverage` -- array: the earlier reports and notes that cover it.
- `source` -- array: the citations (r0001 addresses, `D<line>` decomp lines, disc fields, scratch outputs under
  `research-wave-2026-10-04/wave-2/scratch/`).
- `port_files` -- array: PORT files (relative to `$PORT`), with lines where given.
- `implementation` -- the proposed change.
- `validation` -- array: the tests or checks that would hold it.
- `owed` -- array: the evidence still owed (captures, reads).
