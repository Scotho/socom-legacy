# The parity registry

Where parity with the original is established, a test holds it ([`../../PROCESS.md`](../../PROCESS.md), "Confidence").
This directory says which test holds which claim: one JSON file per area, each entry one claim about what the original
does, at its level, with its source, its research note and the tests that hold it. It is the test-architecture plan's
ruling TA.R4 ([`../../plans/2026-10-02-test-architecture.md`](../../plans/2026-10-02-test-architecture.md)); how a parity
regression test is written is [`../../TESTING.md`](../../TESTING.md), "The recipe".

## The schema (TA.R4, word for word)

`socomlegacy/docs/parity/registry/<area>.json`, one file per area, paths relative to `socomlegacy/`:

```
{ "area": "<area>", "notes": ["docs/research/NN-name.md", ...], "entries": [ { "id": "<area>.<topic>.<name>" (unique, lower-case, dots), "claim": "what the original does, one sentence, with the value", "level": "proven" | "reading" | "drift", "source": "FUN_<addr> D:L<line> | disc <file> <field> | capture <name>", "note": "docs/research/NN-name.md", "tests": [ { "file": "packages/<pkg>/test/x.test.ts", "name": "the it() title, exact", "data": "none" | "fixture" | "disc" | "capture" } ], "owed": "only when tests is empty or every test needs data: which test is owed and why it is not written" } ] }
```

The schema's `owed` gloss ("only when ...") is TA.R4 as written; the rule was amended on 2026-10-02 (`owed` required
there, allowed elsewhere): see "The rules" below and the plan's TA.R4.

`level` follows MISSION's definition (a value read off the disc's bytes or transcribed from the decompilation is a
READING; PROVEN needs the original measured running); `"drift"` marks a place where the port's code differs from what
its note says the original does.

## The rules

The validator is `tools/parityRegistry.ts` (`validateFiles`, `validate`); `tools/test/parityRegistry.test.ts` holds it
on planted bad entries and runs it over every file here, so a registry that breaks a rule turns the document checks
(`npx vitest run tools/test`) red.

- **The file is its area.** `<area>.json` has `"area": "<area>"`; every note in `notes` exists.
- **Ids are unique across all the files**, lower-case words joined by dots, and **prefixed by the file's area**
  (`harness.score.compare-py` lives in `harness.json`).
- **`claim` and `source` are not empty; `level` is `proven`, `reading` or `drift`; `note` exists.**
- **A test is named by its file and its exact it() title**: the file exists, and the title appears in it as the first
  argument of `it(`, `test(`, `it.skipIf(...)(`, `it.fails(` (any modifiers; single, double or back quotes; escapes
  read, so `'PLAT-06\'s inventory'` in the file is `"PLAT-06's inventory"` here). A title written as a template with
  `${...}` holes (a test in a loop: `` `${stem}: every model ...` ``) is named by one title it produces: the name
  matches when the template's static segments match it in order, each hole standing for one or more characters,
  anchored at both ends (`"MP6: every model ..."`). An `it.each(...)(` / `test.for(...)(` title's formats (`%s`, `%d`,
  `%i`, `%f`, `%j`, `%o`, `%O`, `%c`, `%#`, `%$`, `$name`; `%%` is a `%`) are holes the same way (`"steps onto a
  6.25-unit kerb ..."` for `'steps onto a %s-unit kerb ...'`). The validator checks the shape only: that the loop or
  the table produces that value is the author's to get right, and a title that is all holes (`'%s'`) matches any name.
  Only code counts: a call in a comment, a string or a regex is not a test, nor `it.skip(` / `it.todo(` /
  `test.skip(`, nor anything inside a `describe.skip(`.
- **`data` is what the test needs to run**: `none` (it runs on CI and every clone), `fixture` (the extracted files
  under `test-fixtures/` or `public/maps/`), `disc` (`SOCOM_DISC`, `SOCOM_ISO`, or the PC project under
  `SOCOM_PC_ROOT`), `capture` (a capture of the original or the recomp). These are TA.R1's tiers. A test behind
  `skipIf` / `runIf` (its own, or an enclosing `describe`'s) cannot be `none`. The validator cannot see a test that
  returns early when its data is absent: that one is the author's to tag right.
- **A test listed for a claim fails when the claim's value changes.** Change the value in the code (the mutation check
  of [`../../TESTING.md`](../../TESTING.md)'s recipe) and the test must go red; a test that stays green holds
  something else, and the entry narrows its claim to what the test holds or registers the value as `owed`
  (`harness.refs.is-screen-thresholds` is such an entry).
- **`owed` is required when no test with data `none` holds the entry**: when `tests` is empty, or when every test
  needs data; it says which test is owed and why it is not written. **On an entry a no-data test holds it is allowed**
  and means "a further test is owed" (a disc-tier re-derivation, a wider unit pin). When present it is not empty.
  (Amended 2026-10-02: the rule first refused an `owed` on an entry held in CI; the areas used it for the further
  test, and the controller ruled that use legitimate -- the plan's TA.R4.)
- **A drift entry** carries the test that shows the difference (`it.fails`, with a comment naming the note's line;
  TA.R6): the code is not changed and the wrong value is not pinned as right.
- An empty registry, or an area file with no entries, is valid.

## The report

```sh
npx tsx tools/parity-report.ts          # from socomlegacy/
```

prints, as markdown: the coverage by area and by level -- **entries**; **held in CI** (at least one test with data
`none`: the claim cannot drift unnoticed on any clone); **held only with data** (tests exist, but each needs a fixture,
the disc or a capture, so CI skips them); **owed (no test)**; **drift** -- then every entry with an `owed` (each marked
held in CI, held only with data, or no test: an entry held in CI stays in that column even when it owes a further
test) and every drift entry, then any problem the validator finds (exit 1 when there is one). The same table, as plain text, is printed
by `tools/test/parityRegistry.test.ts` on every run. The report is a tool's output, not committed.

## The files

| file | area | notes |
|---|---|---|
| [`harness.json`](harness.json) | the capture comparison harness and the golden capture manifest | research 108, 113 |
| [`world.json`](world.json) | the map's typed metadata and mutable world state: action records, the action pick, zAnim init words, initial state; the scene's health (MAP-06): damage blocks, C4's accept, hits, blasts, the death chain, the reset; Vigilance's access barriers and C4's target (SUP-03) | research 209, 171, 92, 210, 176 |
| [`emplacements.json`](emplacements.json) | the manual turrets (MAP-10): `ai_turrets.rdr`'s definitions, the first-prefix match, the three parts beneath a placement, the ammunition, the placements carried on the room's map | research 177, 173, 193, 215 |
| [`objective.json`](objective.json) | DEMOLITION's bomb (XR-05): the six states, StartBomb, the pickup, the drops, the plant site, the holds and the placement, the defuse, the planted resolver and its result holds, the same-tick order, the wire | research 171, 173, 192, 214 |
| [`hostage.json`](hostage.json) | the hostage as an actor (web sprint 31): the AI on the room (HX-3: the states, the sub-states and timers, the watch, the online silence, the AI stack and its masks, the standing follow, the rescued fade); HX-4a appends the orders | research 189, 199, 207, 238 |
