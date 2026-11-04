# 243 -- The playtest skill and the durability gate

Written 2026-10-07 for PT-10 of web sprint 34 (the plan `docs/plans/2026-10-07-web-sprint-34-the-session-and-the-briefing.md`;
the design `docs/specs/2026-10-06-playtest-and-replay-design.md` §4.4-4.7 and §4.10). The procedure: `.agents/skills/playtest/SKILL.md`
at the repository root, its generated copy `.claude/skills/playtest/SKILL.md` (`python -m workflow.tools.sync_agents`;
`workflow/tests/test_sync_agents.py` refuses a difference). **A playtest instrument with no original**
(PLAYTEST_INSTRUMENT_ADAPTATION): nothing here reads or changes a game value or behaviour (PT.R3), so nothing here is
a parity finding. No game, emulator, browser or dev server was run for this note. §4 (the handoff record and the
gate, PT-14) and §5 (the dispositions and the decision queue, PT-15) are written by those tasks; §6 (fix now) by PT-21
of web sprint 35 (the plan `docs/plans/2026-10-08-web-sprint-35-the-replay-viewer-and-the-loop.md`, W35.R6; spec §4.8);
§7 (the focused retest) by PT-22 of the same sprint (W35.R7; spec §4.8); §8 (the player's writes and the online
rule) by PT-29 of web sprint 36; §9 (the session tooling) by PTT-1..5 and PTT-9 of web sprint 37, each its own
part, and by RE-9 of web sprint 38 (the tooling's leftovers).

## 1. The skill's shape, and why it is state-free

The skill has the house form of `web-sprint` and `web-gate`: frontmatter `name: playtest` and a one-line `description`
that says when to use it ("start a playtest", or a report of what felt wrong in the test room), then numbered sections
of numbered steps. It has eight sections, in the order the plan's brief gives: 1 before anything, 2 start, 3 play,
4 observe and investigate, 5 close, 6 formalise and decide, 7 durability, 8 tone.

**State-free.** The skill holds no session id, observation, port, map or count. A session's state is its record,
which the service keeps (`session.json`, research 242 §2) and `status` shows; once handed off, it is the text record
under `docs/playtests/` and the owners it names (issues, `HUMAN_TASKS.md` rows, research notes, roadmap and LATER
rows). The reasons:

- **Two harnesses, one source.** Claude Code reads the generated copy, Codex the source; a fact copied into the skill
  would be a third copy of it, and the sync test only proves the two copies agree with each other, not with the fact.
- **The record is history** (spec §3, 5). A skill that remembered a session would be a second record that nothing
  freezes at closeout and nothing hands off.
- **The verbs own their behaviour.** Each step names the CLI verb (`npx tsx packages/playtest/src/cli.ts <verb>`
  from `socomlegacy/`) or the convention that owns the fact: the ready sheet's withholding rule and the target's dirty
  rule are research 242 §1; the merge window and the inactivity clock are 242 §3; the six dispositions and the
  decision queue are spec §4.7; the docs-only branch is W34.R4; the host lock is AGENTS.md and the `web-gate` skill.
  When one of those moves, the skill does not.

**What exists, said once.** The skill was written before most of its verbs: sprint 33 delivered `start`, `status` and
`set`. Its preamble names the task of sprint 34 that delivers each other part -- `observe`, `note`, `state`,
`decide`, `pin` (PT-11), the report at `/report` (PT-12), `close` (PT-13), `handoff` (PT-14), the dispositions and the
decision queue (PT-15), the `playtest-investigator` contract (PT-16), `export` (PT-17) -- and makes the CLI's own
usage line the truth until each is merged. `dispose`, in the spec's §4.4 table, has no task in sprint 34; the skill
says so rather than inventing one.

**Section 6's decision queue** is one sentence pointing at PT-15, which writes it (the plan's task table gives PT-15
that section of the skill and its mirror).

**Section 8, the tone,** is quoted as written from the owner's design brief (`docs/specs/2026-10-04-playtest-intake-design.md`
on `craig/playtest-intake`, tip `1526c429`, "Controller language and tone"), as spec §4.10's last paragraph requires: "The
tone section of the brief is quoted in the skill as written: a playtester, not an engineer." The quotation is the
section whole: the opening sentence, the six "should" lines (with what to avoid), the paragraph on translating the
technical work, and the paragraph on the investigator's structured request. Where the brief and the design differ,
the brief's words win until the owner says otherwise (the spec's header).

## 2. The session loop, as the skill practises it

Spec §4.10 numbers six steps; the skill adds a section before them (the canary, the tree, the lock line, the owner's
rows) and one after them (the tone). The map, step by step:

| spec §4.10 | the skill | what the controller does, and the verb or rule that owns it |
|---|---|---|
| (none: the session's preconditions) | 1. Before anything | the canary; `git status --short` in the target's tree (dirty is recorded, 242 §1); the host lock's printed line (AGENTS.md "Layout and local directories", 5; `web-gate` step 0); the owner's rows touching playtests (H125 when written) |
| 1. Start | 2. Start | `start` with the target in the human's words (default `current`); nothing said before the ready sheet; the sheet relayed verbatim; no port, path, worktree, lock or agent name to the player |
| 2. Play | 3. Play | silence unprompted; preserve first (`status` shows the mark kept), then one line; one question only when its answer changes what can be tested or recorded; `set` for a condition |
| 3. Choose the next action | 4. Observe and investigate | `observe` (merging with a mark: the window of 242 §3); keep for later, reproduce, `set`, read existing evidence, or play on; a `playtest-investigator` returns one structured finding; the controller writes it with `note`/`state` and pins with `pin`; a live probe only when simple, understandable, achievable now and worth the interruption |
| 4. Close | 5. Close | `close --reason player` on the human's word; the clock closes on inactivity by itself; the static summary, then the briefing with the report |
| 5. Formalise and decide | 6. Formalise and decide | `decide` per card, one of the six dispositions with its durable owner (spec §4.7); the decision queue: PT-15 |
| 6. End | 7. Durability | `handoff` (refuses with an undecided observation, names it); the docs-only branch by `workflow/agent_worktree.sh`; the PR to the merge controller; `export` on request; `dispose` (no task yet); ends when `handoff` passes and every stream is dispatched or declined |
| (the last paragraph) | 8. Tone | the brief's section, quoted |

The order inside step 3 of the skill -- preserve, then acknowledge -- is spec §3's first principle ("a mark is durable
before anyone speaks"). The investigator never speaks to the player (W34.R5, PT-16's contract); the controller is
the only voice, so the tone section binds every word the player hears.

## 3. Placeholders

Chosen values with no original, listed as research 242 §3 lists the service's.

| name | value | where | status |
|---|---|---|---|
| `SHORT_WORDS_MAX` | 200 characters: over it, the handoff record gives the player's words as their own start cut at a word, marked "(short)" (§4) | `packages/playtest/src/handoff.ts` | a chosen value, the plan's number (PT-14); an owner may change it |
| `RETEST_PLACE_PLACEHOLDER` | `{ reach: 5, verifyFrames: 2, tries: 3 }`: the retest's placement holds when the feet are within 5 world units (half a metre at `MetersPerUnit` 0.1) of the target horizontally, checked 2 frames after a teleport, with at most 3 teleports (§7) | `packages/viewer/src/playtestSession.ts` | a chosen value (PT-22's review, F1: "a frame or two", "a few tries"); also in research 101's exclusions. ~~settled by PT-23's rendered run or an owner's word~~ PT-23's rendered run (research 244 §5, 2026-10-08) saw the placement on MP2 offline: placed and held, the feet within about 1e-4 units of the mark's and still there two seconds later; the name stays a placeholder, since its reach, frames and tries are chosen values with no original. Settled by an owner's ruling on the three, or by a run in which a respawn undoes a placement |
| `CLOSE_DIR_PROBE_MS_PLACEHOLDER` | 10 s: how long `close --dir` -- and, since RE-9, the fix verbs (`sendFixVerb`) -- wait for an answer on the session's recorded port (§9, PTT-5, RE-9) | `packages/playtest/src/closeout.ts` | a chosen limit with no original, the CLI's own `callVerb` limit (`verbs.ts` `CALL_TIMEOUT_MS_PLACEHOLDER`, 10 s): a connection to a closed loopback port on Windows can take about 2 s to be refused; named at the sprint 37 close review; the CLI's, so outside research 101's round ledger |
| `CALL_TIMEOUT_MS_PLACEHOLDER` | 10 s: how long the CLI's `callVerb` waits for the session service's answer to a verb, unless the caller gives its own (`close` gives 60 s, `cli.ts` `CLOSE_CALL_MS`) (§9, RE-9) | `packages/playtest/src/verbs.ts` | a chosen limit with no original: a connect to a closed loopback port can hang on Windows instead of refusing, and a verb's write is one `store.update`. Written `CALL_TIMEOUT_MS` from PT-11 (web sprint 34) until RE-9 named it with the suffix (LATER 29). The CLI's (`packages/playtest`), so outside research 101's round ledger: no row there. Settled by an owner's word on the number, or a session whose verb is cut by it |
| `SERVICE_PROBE_MS_PLACEHOLDER` | 1.5 s: how long /playtest's launch sheet waits for the lane's session service (`GET /status`) before it reads as none (§9, PTT-9) | `packages/viewer/src/launchSettings/address.ts` | a chosen value of the launch settings' adaptation with no original (W37.R6, LAUNCH_SETTINGS_ADAPTATION), short so the sheet's line settles at once; the sheet is never held by it; named at the sprint 37 close review; also in research 101's exclusions |

The skill itself chooses none: it points at the values others own (the merge window and the inactivity clock are
242 §3's). PT-15 adds none: its one number, the title's 90 characters (`TITLE_MAX`), is COLLABORATION "Issues"'s
convention, not a chosen value (§5). PT-21 adds none (§6): the card's six fields and the five result states are spec
§4.8's lists, the topic's form is PT-15's `--topic` rule (now the exported `TOPIC`), and the `gh` call's time limit is
the issues tool's own `GH_TIMEOUT`, read from `workflow/tools/issues.py` as `AREAS` is. PT-22 adds one,
`RETEST_PLACE_PLACEHOLDER` (the table; its review's F1); the "one or two things to try" (`RETEST_TRIES`, 2) is spec §4.8's own wording, the three verdicts and the two evidence kinds
(`human confirmation`, `not run`) are spec §4.8's and PT.R9's, and the placement is the mark's recorded feet, not a value
chosen here.

## 4. The handoff record and the gate (PT-14)

**What it is.** `npx tsx packages/playtest/src/cli.ts handoff [--dir <session dir>] [--out <repo path>]` from
`socomlegacy/` (`packages/playtest/src/handoff.ts`; test `packages/playtest/test/handoff.test.ts`) writes the session as
`socomlegacy/docs/playtests/<session id>.md` (PT.R6): the durability gate of spec §4.7, step 2. Like `export` it reads the
session's directory, not the service, so it runs after `close` and whether or not anything is still live; the
directory defaults to the newest session under `socomlegacy/.playtest/`.

**Its fields.** The title `# Playtest <session id>`, then a header block, one line each: `Target` (as asked, the
resolved commit, `+dirty` with the touched files' sha256 or `(clean)`, the branch), `Launch` (map, mode, offline or
online, the options), `Started`, `Ended` (and why: the player, inactivity, a failed start; or still open at the
handoff), `Segments` (a table: index, map, ticks, why it ended), `Evidence kept` (a table of the files of the
session's directory -- every file under `marks/`, the closed `segments/<n>.s2r`, the `export/*.zip` -- by name relative
to that directory, with their sizes) and `Export sha256` (the newest export's, by modification time, or "none").
Then `## Observations`, one row per observation: `id | the player's words | at (segment:tick) | evidence | state at
handoff | rulings | disposition | owner or reason`, and the footer "This record is history: later work cites an
observation by its id and never edits this file." The words are verbatim, several reports joined by " / ", unless
they pass `SHORT_WORDS_MAX` (§3): then their own start, cut at a word, with "..." and "(short)" -- a prefix of the
player's words is the one short form a program can make that is faithful by construction, and the whole words stay
in `session.json` and the export. `rulings` gathers each `redecide`'s reason ("redecided from <old disposition>:
<reason>") and each history line or harness note the controller opened with "ruling:", else `--`. `disposition` is
the spec's word for the record's enum (`fixNow` fix now, `later` save for later, `research` needs research, `ruling`
needs a ruling, `known` already known, `none` no action); `owner or reason` is the decision's `ref`.

**Why text only.** The record is the part of a session that lasts in the repository; the report, the frames, the
clips and the replays are evidence, not documents, and media never enters git (RS.R8). So the record names the
evidence -- by name and size, and the export's sha256, so a copy handed on later can be checked against it -- and
holds none of it. It holds no host path (the evidence is named relative to the session's directory) and not the
launch's URL (a port); the leak check holds the rest at commit. A table of one row per observation is what the
convention test can read and what a plan or an issue can cite by id.

**The refusal (review focus 4).** `checkHandoff` lists the observations with no decision; `handoff` refuses when any
is listed, prints each with the `decide` command that settles it (`handoffRefusal`), exits 1 and writes nothing.
`writeHandoff` checks first and renders the whole text before it creates the directory, so a refused record leaves
not even an empty `docs/playtests/` behind (the test reads the temporary root back empty). A session with no
observation passes: its record says no observation was made. A second `handoff` for the same session is refused
(the file is created exclusively, `wx`; `handoffExistsMessage`, exit 1, no `--force`) and the existing record keeps its
bytes: a `redecide` after the handoff is cited from the new work by the observation's id, never written back.

**Where it is written, and the docs-only branch.** By default under the repository that holds the session's
directory (the nearest folder above it with `.git`) -- the tree `start` ran in, which is where the controller works;
`--out <repo path>` names another repository's root (a docs-only worktree already made, say). Then `handoff`
prints, and does not run, the three commands of W34.R4, from the repository's root: `bash workflow/agent_worktree.sh
create pt-session-<id> origin/main`; the copy of the record into that worktree's `socomlegacy/docs/playtests/` (its
directory made first, for a `main` that has none yet); and `git add -- <path>` with the commit by that path, a
subject under 120 characters and a second `-m` for the controller's own session trailer. **Why printed, not run:**
the controller is a human-directed session whose git is held by the guards (bulk staging, a commit without paths,
`--no-verify`, a push from a worktree) and by its own trailer, which the CLI cannot know; a CLI that ran git would be
a second path around those guards, and one more process making branches and worktrees on a host that allows one
writer per tree. Printed, the commands pass through the same tool-call policy as any other the controller types, and
the merge controller lands the branch as any pull request (W34.R4). The record goes on a branch of its own, cut from
`main`, so a session's record never drags experimental code toward `main` (spec §4.7 step 3).

**The convention test** (`socomlegacy/tools/test/playtests.test.ts`, spec §4.7 step 4). `checkPlaytests(dir, citing)`
takes the directory and the citing files, so the test proves it on fixtures in a temporary tree (a rendered record
passes; a row with no disposition, a word not one of the six, an empty owner, a missing header line, title or
footer, an id not of its session, and a plan citing an id no record holds each fail) and then runs it on the
repository's `socomlegacy/docs/playtests/`. Its rules: `README.md` exists; every other `*.md` is named `YYYYMMDD-xxxx.md`
and opens on `# Playtest <that id>`; it carries the header lines and the footer; its `## Observations` table has the
rendered columns; every row has eight cells, an id `PT-<that session>-<n>` used once, one of the six words and an owner
or reason that is neither empty nor `--`. Every observation id (`PT-<8 digits>-<4 hex>-<n>`) cited in
`HUMAN_TASKS.md`, `LATER.md`, `docs/roadmap/*.md` and `docs/plans/*.md` must be held by some record. A fenced code
block is example code, not a citation, and is not read: the sprint 33 plan's replay-format test carries a made-up
`PT-` id in one, and without the rule the gate would fail on the day it is added with no record cited anywhere. The
six words and the columns are imported from `handoff.ts`, so the renderer and the gate cannot drift apart; the
package's own test pins the six words to the spec's.

## 5. The dispositions and the queue (PT-15)

**What it is.** `packages/playtest/src/dispositions.ts` (test `packages/playtest/test/dispositions.test.ts`): for each of
the six dispositions of spec §4.7 a pure function that prepares the durable owner's text and names the command that
would create it, returning `{ text, command, ref }`; `prepare(d, o, record, ctx)` dispatches by the disposition and
refuses one outside the six. The CLI's `decide <obs> <disposition> --prepare` (with `--area`, `--row`, `--bar`,
`--default`, `--note`, `--topic`, `--base`, `--reason`, `--ref`, `--title`) reads the observation from the running
service, writes the text to `<session dir>/dispositions/<obs>.md` (git-ignored, beside the evidence), records the
decision with the prepared `ref`, and prints the text, the command and what the controller does next. Without
`--prepare`, `decide` is PT-11's, unchanged. A context value missing or malformed is refused before anything is
written (exit 2); a decision already made is refused before the file is written (the record is history, PT-11).

**Each destination, and why it is that one** (spec §4.7's table; never a second backlog -- the plan's global constraints):

| disposition | the prepared text | the command | the `ref` recorded |
|---|---|---|---|
| save for later (`later`) | an issue body in the issues tool's skeleton: What happens (the player's words, the finding, the map and the commit), Evidence (the observation id, the frame, clip and telemetry names relative to the session's directory, the pins, segment:tick, the session id), Where it is written (`--row`, the roadmap or LATER row), Closing bar (`--bar`), and a note that the CLI prepared it | `python -m workflow.tools.issues open --title "<one clause under 90 characters, no tags>" --body-file <the prepared file> --area <area> --label from-playtest` (`--label needs-repro` unless the state is `reproduced` or `understood`) | `issue #<n> (pending)` |
| needs a ruling (`ruling`) | a `HUMAN_TASKS.md` row in its four columns: `H<pending>`, the bold line with the player's words, the finding and the *default* the work follows meanwhile (`--default`), the session and the observation as source, what waits (`--row`, else the observation's work) | none: the controller adds the row with the next number | `HUMAN_TASKS H<pending>` |
| needs research (`research`) | a section stub, `## §<pending>`, naming the note or the `*_READING`/`*_PLACEHOLDER` to extend (`--note`), the words, the finding, the evidence, what would settle it | none: the note's author writes it | `research <note> §<pending>` |
| fix now (`fixNow`) | the implementer brief's skeleton: the worktree `pt-<topic>`, the observation and its finding, the failing test first (`--bar`), the files (named from the finding before dispatch), the evidence bundle's paths (the mark's files and the segment's replay) | `bash workflow/agent_worktree.sh create pt-<topic> <base>` | `agent/pt-<topic>` |
| already known (`known`) | none | none | `--ref` as given, its form checked: `issue #N`, `H<n>`, a roadmap id (`PT-15`, `MAP-3`, `MENU-OC-3`), `LATER <n>`, an earlier observation's id, `research <n> [§<s>]` |
| no action (`none`) | the reason (`--reason`) | none | `closed: <reason>` |

A pending reference is made final by `redecide <obs> <same disposition> --ref <the number> --reason "..."` once the
issue, the row or the section exists: the record keeps both, as history (PT-11). As PT-15 left it, `known` checked
the reference's form, not that it exists; PT-21 looks an issue up as well (§6), and the convention test
(`tools/test/playtests.test.ts`, for an observation id) holds the rest.

**One source each.** The issue body is the issues tool's own skeleton, read at run time (`python -m
workflow.tools.issues skeleton`, a child process) and filled section by section, so a change to the skeleton reaches
the CLI with no edit here; a section the CLI does not know keeps its placeholder, and the tool's `check-body` (which
`open` runs again) refuses it rather than letting it pass half-filled. Where Python cannot run, a bundled copy of the
four headings is used and the body's notes say so. The area labels are read from the tool's `AREAS` tuple in
`workflow/tools/issues.py` (which the tool's own test holds to `workflow/github_labels.sh`); `landing` is refused as
retired (COLLABORATION "Issues", OT.R30). The test runs `check-body` on a prepared body from both skeletons, and on the
skeleton unfilled to show the check bites; it skips, saying why, where Python is absent.

**Why the CLI prepares and does not perform.** AGENTS.md "Boundaries": nothing that is the owner's is performed --
a `HUMAN_TASKS.md` row is the owner's, added by a session and never acted on for him; the CLI's text is pasted by
the controller. An issue goes through the tool's `open`, which calls `gh` -- a login the CLI cannot assume and a
write to GitHub that outlives the private repository, which the controller should see before it happens (the leak
rules are checked by the tool, not by this module). A worktree is made only by `workflow/agent_worktree.sh`, under
the tool-call policy; a CLI that ran it, or git, or `gh`, would be a second path around those guards, as §4 says of
the handoff's git. Printed, every command passes through the same policy as one the controller types.

**The decision queue** (the skill's section 6, spec §4.7). Ordinary investigation -- the corpus, the notes, the
decompilation and the source, deduplication, a targeted vitest file -- proceeds without asking. The player is asked
only where the next step needs a repository or host lock or a heavy run, and what counts as heavy is read from
AGENTS.md "Layout and local directories", 5, each time, never carried in the skill. The question has four parts --
what the investigator thinks, what is uncertain, the one check that would settle it, why it needs the lock -- then
"approve?"; one at a time; a declined check is never asked again and leaves a repro plan in the record instead.
**PT-16's investigator contract (`workflow/agents/playtest-investigator.md`) feeds the queue's four parts**: its
structured finding is what the controller turns into the question -- `finding` is what it thinks, `state` and what it
says it could not settle are what is uncertain, `needs: 'a heavy check: <what and why it needs the lock>'` is the one
check and its reason, and `repro` is the plan the record keeps when the player declines.

## 6. Fix now (PT-21)

A playtest instrument with no original (PLAYTEST_INSTRUMENT_ADAPTATION): spec §4.8 and the plan's W35.R6 put into code,
no parity claim. The evidence is unit tests only (vitest, with fakes for `gh`); no session, browser or dev server was run.

**What it is.** `packages/playtest/src/fixNow.ts` (test `packages/playtest/test/fixNow.test.ts`), the three verbs over
`POST /verb` in `src/verbs.ts` (test `test/verbs.test.ts`, "fix now over POST /verb"), and the CLI's `formalise`,
`fixnow` and `fix` in `src/cli.ts`. The record gains two optional fields on an observation (`src/session.ts`):
`card` -- `{ repro, evidenceState, diagnosis, destination, rulings, next }`, spec §4.8's list after the observation
itself (the repro so far, the evidence's state in plain words, the diagnosis or the uncertainty, the recommended
destination, the rulings, the next action) -- and `fix` -- `{ branch, createdAt, tested, state, history[] }`.

| verb | what it does | what it refuses |
|---|---|---|
| `formalise <obs> --field <name>=<text> [--field ...]` | writes the named fields of the card; a first write is the history line `card: <name> written`, a rewrite `card: <name> rewritten (was: "<old>")` | a field outside the six, an empty value, no field (400) |
| `fixnow <obs> --topic <t>` | answers, and the CLI prints, the worktree command `bash workflow/agent_worktree.sh create pt-<t> <record.target.commit>` and the implementer brief -- `dispositions.ts`'s `fixNow`, now with a "The card." block from the card -- plus notes: a dirty tested tree, other observations already on the branch, a decision that is not yet `fixNow`. Writes nothing | a card with a field not written, naming each (409); a malformed topic (400) |
| `fixnow <obs> --created pt-<t>` (or `agent/pt-<t>`) | records `{ "agent/pt-<t>": "<ISO>" }` in the playtest root's `branches.json`, merged with what is there, and opens `fix` at `implemented` with the branch, that time and `tested` (`<commit>` or `<commit>+dirty`, spec §4.4's form) | an incomplete card, a fix already open that has not `failed` (409; a failed one moves whole into `fix.previous[]` and the new branch opens); a name not `pt-<topic>` (400); a `branches.json` that is not a JSON object of strings (500, the file left as it is) |
| `fix <obs> <state> [--note "..."]` | moves the fix to `implemented`, `validated`, `confirmRecommended` or `failed`; each state entered is a line in `fix.history` (`{ at, state, by, note? }`) and in the observation's history (`fix: <old> -> <new> (<note>)`) | `confirmed` (409: a human's word, PT-22's `confirm`), a fix a human confirmed, the state it is already in, no fix open (409); an unknown state, an unknown writer (400) |

`by` is a `HistoryBy` (W34.R6), `controller` by default. The five states are spec §4.8's: implemented, not validated
(`implemented`); automated validation passed (`validated`); human confirmation recommended (`confirmRecommended`);
human confirmed (`confirmed`); failed or needs more investigation (`failed`). `enterFixState` is the same move without
the refusal of `confirmed`, for PT-22's `confirm` (PT.R9: a human's confirmation is its own kind of evidence).

**Why the tested commit, never HEAD.** The session tested `record.target.commit` (research 242 §1); the controller's
HEAD may have moved on by the time fix now is chosen, and a worktree cut from it would test a fix against a tree the player
never played. A dirty tested tree is said in the notes: the worktree has the commit, not the uncommitted changes, and
`tested` keeps `+dirty`. The spec's other base -- "the branch that owns its prerequisite" -- is not offered by `fixnow`
(the plan's brief names the tested commit only); `decide <obs> fixNow --prepare --base <ref>` (PT-15) still takes one.

**`branches.json`.** The file `start` already reads for the ready sheet's "Created" (`src/target.ts`, `src/cli.ts`):
the branch's short name (`agent/pt-<t>`, what `git rev-parse --abbrev-ref HEAD` gives in the worktree) to the ISO time
the CLI recorded it. The verb writes it in the directory above the session's (`dirname(store.dir)`, the playtest root
`socomlegacy/.playtest/`), after the record's change has been checked against the same record (so a refusal touches
nothing), as `session.json` is written: whole, to `branches.json.<pid>.tmp`, flushed, then renamed over the old file;
a failed write removes the temp file and leaves the old file whole. A branch already recorded keeps its first time
(`existed: true`): it was made once.

**A shared root cause.** The branch is the topic's, so two observations share one only when `--topic` names the same
one (spec §4.8: "findings that investigation proves share a root cause may share one stream; otherwise they stay
apart"); `fixnow --topic` then says which observation already holds the branch, and the second `--created` keeps the
first time.

**After the closeout.** Fix now happens after the close (spec §4.7-4.8), so the card and the fix are the harness's side
of the frozen record: `checkFrozen` (`src/session.ts`) refuses changes to an observation's capture facts, `player` and
`evidence`, and leaves `card` and `fix` writable as it leaves `harness`, `decision` and `history`. Its comment says so;
its code needed no change.

**What is still prepared, not performed.** No verb and no CLI path runs git or the worktree script (W34.R4, kept by
W35.R6): the command is printed, run by the controller under the tool-call policy, and reported back with `--created`.

**`known` looks an issue up (34's carry).** `decide <obs> known --prepare --ref "issue #N"` now asks
`gh issue view <N> --repo <repo> --json number` (`checkIssue` in `src/dispositions.ts`; the repository is the issues
tool's own -- `GITHUB_ISSUES_REPO`, else its `DEFAULT_REPO`, read from `workflow/tools/issues.py` as `repo_from` does;
the time limit its `GH_TIMEOUT`). The answer's number equal to N: it exists. gh's "Could not resolve to an issue": it
does not, and the decision is refused. Anything else -- `gh` not installed, not logged in (exit 4 or gh's login
prompt), the network, an answer that is not the number -- is recorded as "not checked", with why: the CLI passes the
line to `decide` as `check`, and the verb writes it as the history line `reference check: <line>`. The `gh` call is
injected (`DispositionContext.gh`), so the tests give a fake that answers, one that says not found, one not logged in,
one offline, and one absent; no test calls the real `gh`. A reference in another form is checked for its form only, and
the line says so. The tool has no `view` command of its own, so the CLI calls `gh` directly with the tool's repository
and limit; a read, it writes nothing to GitHub. The check (`referenceCheck`) runs for `decide <obs> known` with or
without `--prepare`, and for `redecide <obs> known` (the re-review's R2); `decide` and `redecide` take a `check` only
with `known` and only in a form `referenceCheck` writes for
that reference (`validCheck`; 400 otherwise), and a `known` decision that reaches it with no check is recorded as
"<ref> not checked: the decision came with no check" -- the record always says which.

**The review round (F1-F5).** The first review (PASS WITH FINDINGS) asked for five changes, made in the same task:
- *A failed fix gives way* (F1): `fixnow --created` on an observation whose fix is `failed` moves that fix, whole --
  branch, time, tested commit, state and history -- to the end of `fix.previous[]` and opens the new branch at
  `implemented`; a fix in any other state still refuses (409). Nothing is dropped. How PT-22's "still wrong" meets a fix
  already `failed` is PT-22's (`enterFixState` still refuses the same state).
- *Results after `dispose`* (F2): a fix's result returns after the session's service has stopped, so `formalise`,
  `fixnow` and `fix` are `applyFixVerb` (`src/verbs.ts`), one function for the service and for the CLI. The CLI sends
  the verb to the session's own service while its `start` process lives (`sessionServicePort`, the session's
  `service.json` and its pid), and only when none is alive writes on the session's directory through `SessionStore`,
  with the same functions, refusals, history lines and freeze (`sendFixVerb`). (Superseded at RE-9, §9: the fix verbs
  ask the session's recorded port with `close --dir`'s probe, `GET /status` answering the session's id; the pid is not
  read, and `sessionServicePort` is gone.) The session's directory is the one the
  observation's id names (`PT-<session>-<n>` under `socomlegacy/.playtest/`) unless `--dir` names it; `--dir` only names
  it (the re-review's R1). Two writers on one record would each read, change and rename `session.json` (through the same
  `session.json.tmp`) with no lock between them, so the service's next write -- the page's human input, at most once
  every `INPUT_HEARTBEAT_S` (`packages/viewer/src/playtestSession.ts`) -- could rename its older record over the fix
  and lose it silently; with a live service, the service is the one writer.
  ~~A send that got no answer at all (nothing listens on the port) falls back to the directory; one that timed out does
  not,~~ and a fallback refused as already done says the service may already have written it (`status` tells).
  Corrected by the sprint 35 close (2026-10-08): the directory is written only when the session has no live service
  and the send, if one was made (`--port`), was refused (ECONNREFUSED, the error's `cause.code`: the request never
  left). A `--port` that does not answer while the session's own service is alive, a reset, a socket closed after the
  request was sent, or a timeout writes nothing and says why -- a second writer, or a duplicate `confirm` verdict,
  otherwise (`sendFixVerb`, `callVerb`'s `refused`; `packages/playtest/test/verbs.test.ts`, "the close").
- *A plain `decide known` checks too* (F3) and *a check is only a check* (F4): above.
- *`start` reads `branches.json` safely* (F5): `readBranches` (`src/fixNow.ts`) shares the writer's validation
  (`parseBranches`); a file that is not a JSON object of strings is one warning, and every branch's creation time is
  then unknown -- the session starts, the file is left as it is. A leading byte-order mark (a file saved by a Windows
  editor) is read through by both the reader and the writer.

**The skill** (section 6, steps 2 and 5): the controller formalises the card (unknowns said as unknown, never guessed),
then, on the player's choice, prepares the branch, records the decision, runs the printed command, records the branch
with `--created`, dispatches the implementer, and reports each result with `fix`; `confirmed` is never the
controller's.

## 7. The focused retest (PT-22)

Written 2026-10-08T14:51Z. A playtest instrument with no original (PLAYTEST_INSTRUMENT_ADAPTATION): spec §4.8 and the
plan's W35.R7 put into code, no parity claim. The evidence is unit tests only (vitest: `packages/playtest/test/retest.test.ts`,
`packages/playtest/test/launchUrl.test.ts`, and the page's half in `packages/viewer/test/playtestSession.test.ts`, "the
focused retest on the page (PT-22)", in jsdom with a fake hook); no session, browser, dev server or game was run, ~~and
the placement has not been seen in a rendered page (PT-23's e2e is where a browser first runs it)~~. The placement was
seen rendered by PT-23's second test (research 244 §5, 2026-10-08; a rendered browser run): on MP2 offline the page
reached `placed`, the feet within about 1e-4 units of the mark's, and held there two seconds later.

**What it is.** `packages/playtest/src/retest.ts`; the CLI's `start --retest` and `confirm` in `src/cli.ts`; the verb
`confirm` in `src/verbs.ts`; the retest block of the ready sheet in `src/readySheet.ts`; the `retest-at` key in
`src/launchUrl.ts`; and, on the page, `packages/viewer/src/playtestSession.ts`. The record gains, additively
(`src/session.ts`): on an observation, `retests[]` -- `{ session, at, verdict, words, marks[], evidence }`, appended by
`confirm`, never rewritten; on a session, `retestOf` -- `{ observation, session, place, unknown }`, the link a retest
session keeps to the observation it retests (frozen with the launch by `checkFrozen`). `retests` is the harness's side
of the original's frozen record, writable after its closeout as `card` and `fix` are (§6).

**The review round (F1-F3, N4-N5)**, 2026-10-08, PASS WITH FINDINGS, all taken in the same task; each is said in its
place below: the placement waits for the room's first round and is checked (F1); no placement on another map (F2); a
verdict links only a retest of the current fix (F3); the sheet's unknowns and the asked kit (N4); the shared logic
refuses a verdict with no retest (N5).

**A mark's telemetry gains two fields** (the page, `playtestSession.ts`): `kit` -- the loadout on the body,
`__viewer.loadout().loadout` (five item ids 0-255, the form the page's own `&kit=` takes, `packages/viewer/src/loadout.ts`
`kitParam`), or null -- and `feet` -- `{ at: __viewer.feet(), yaw: __viewer.pose().yaw }` (the walk's feet; the look's yaw
in degrees, the one the devmode teleport uses when it is given none), or null in fly mode. Each is read in its own `try`,
as the other members are; a hook without them gives null, never a guess.

**The preselection** (`retestOptions(obs, telemetry)`), from what the mark recorded:

| what | from | when it was not recorded |
|---|---|---|
| the map, the mode | the address the mark was taken under (`search`: `map`, `mode`) | `unknown` names `map` / `mode`; the CLI asks for `--map` (exit 2), and the session is a play session anyway |
| online or offline | the same address, by the page's own rule: `server`, `mp`, or `online` but `off` | -- (an address with none is offline) |
| the other options | the same address: the test room's keys (`src/urlState.ts`), never the session's own (`map`, `mode`, `server`, `online`, `mp`) | -- |
| the side | `net.team` (`seal` / `terrorist`) | `unknown` names `side`. The test room has no address key for a side, so the sheet tells the player which side to play |
| the kit | the telemetry's `kit`, written as the `kit` option (`kitFrom: 'mark'`) | `unknown` names `kit`; an address's own `kit=` (the kit asked at launch) is carried as asked (`kitFrom: 'address'`), and `kit` stays named, because the kit on the body at the mark was not recorded -- the sheet says the kit is the one asked for last time, not "set as you like" (N4) |
| the place | offline only, the telemetry's `feet` (`at`, `yaw`) | `unknown` names `feet` (the spawn), or `facing` (placed with the look's own yaw) |

Online there is no placement (W35.R7) and `feet` is not called unknown: it is not used. The CLI's own `--map`, `--opt`
and `--online` win over the preselection. A spoken observation with no telemetry preselects nothing and names
`map`, `mode`, `side`, `kit` and `feet`.

**`start --retest <obs> --target <fix branch> [--from <session dir>]`.** The original session is the one the
observation's id names (`PT-<session>-<n>`, PT.R7) under `socomlegacy/.playtest/`, or `--from`; its record and the mark's
`telemetry.json` (`evidence.telemetry`, relative to its directory) are read before anything starts. A NEW session opens
(its own id, its own segments and marks) with `retestOf`. Whether the page places the player is decided once the map is
resolved (`retestPlace`, the review's F2): only offline, with the feet recorded, and on the map the mark was taken on --
a `--map` that resolves to another stem, or a mark that recorded feet but no map, starts at the spawn, and the sheet says
"the map differs from last time"; `retest-at` is then never sent. Placed, the page's address carries
`retest-at=<x,y,z[,yaw]>` (`pageUrl` refuses one with `online`; `retest-at` is one of `RESERVED_KEYS`, so no `--opt` can
set it) and `retestOf.place` records it. A `set` reloads the page without it; a reload of the page by the player (F5)
keeps the address, so the page places him again after that load's first round -- left as it is (the review's N5 note).

**On the page** (W35.R7). With `retest-at=` in the address, `?devmode` on a development build, and the address offline,
the instruments' frame loop (`poll`) hands the place to the existing devmode teleport (`__viewer.teleport`, `main.ts`
`teleport`, present with `?devmode` alone; it stands the walk's mover and, in the page's own match, the room's mover, as
a spawn does) only after the room's first round has started (the review's F1). The offline solo room never sets
`net().waiting` (`packages/match/src/room.ts` `waitingWith` answers false for a solo room) and starts its first round on
the tick after the join (`clock` -> `firstRound`), which respawns every player at a round-start slot (`startRound` ->
`spawn(p, 'start')`): a teleport in the frames between the join and that tick would be undone. The page's signal is the
room's own `roundStart` event (`startRound`'s `broadcast`, which hands every event to the room's recorder first), seen
through the recorder seam the instruments already put on the page's `LoopbackMatch` (PT-03's `setLoopbackDefaults`).
From the first `roundStart` on, once the walk has feet, `net().waiting` is not true and the teleport accepts (it refuses
until the room has the body; a refusal is tried again on the next frame and is not a try), the player is placed;
`RETEST_PLACE_PLACEHOLDER.verifyFrames` (2) frames later the feet are checked against the target, horizontally within
`reach` (5 units; the teleport picks the floor's height itself, so the height is not compared): held, `'placed'`; off it,
placed again, up to `tries` (3) teleports, then `'failed'` with one warning. The hook's `playtest()` says `retest:
'waiting'` (before the round, or placed and being checked), `'placed'` or `'failed'`. A page whose socket has no binary
channel records nothing, so it sees no round: `'failed'` at once, the spawn. A room built before the session's message
reached the page (PT-03's own limit) gives no recorder and so no signal: the hook stays `'waiting'` and the player is at
the spawn. `retest-at` carries no map, so the place belongs to the context the page launched in (the re-review's nit): a
change of the recording's context -- the map, the mode or online, which opens a new segment -- before the placement held
makes it `'failed'` (one warning), and no later room's first round places anyone; a placement already held is left as
it is. Without `retest-at=`, without `?devmode`, online, or with a malformed value (one warning), nothing is placed
and `playtest()` carries no `retest`. A later round's respawn is the game's own and is not undone. No `main.ts` edit
(PT.R5): the teleport is the hook's. The tests drive a real `LoopbackMatch` on a flat map for the round and a fake hook
for the walk (the respawn that undoes a teleport is the fake's), in jsdom.

**The ready sheet's retest block** (`retestSheet`, after the options): the issue in one line -- the player's own words,
else the card's `repro`; one or two things to try -- the card's `next`, split at a line or a semicolon, its first two
(spec §4.8: "the one or two things to try"), or, with no `next`, "do what you did when you marked it"; where the player
starts (offline: where the mark was, facing the same way when the facing was recorded; online: the spawn, and why; no
feet: the spawn); the side, when recorded; what was not recorded, in plain words; and the three answers asked for. Every
text goes through `src/scrub.ts` (the player's words with `agents: false`, the card's with the agents' names said as "the
team"), so no port, path, worktree, other agent branch or agent name reaches the player; the observation's id is not
shown. Where and which way the player stood are called unrecorded only where they would have been used (N4): `feet`
only when the retest starts at the spawn for want of them, `facing` only when he is placed; online, or on another map,
neither. The build's own branch keeps its friendly name (`agent/pt-<topic>`), the sheet's PT-13 rule.

**`confirm <obs> matches|still-wrong|declined [--words "..."] [--dir <session dir>]`** (`confirmRetest`), on the
ORIGINAL observation, through the one writer of §6 (`sendFixVerb`: the original session's live service, else its
directory; the verb `confirm` of `POST /verb`, `{ obs, verdict, words? }`, 400 / 404 / 409 as the fix verbs). The verb
itself finds the retest, inside the write (`findRetestSession`): the newest session in the playtest root -- the
directory above the original session's, where `branches.json` is -- whose `retestOf.observation` is `<obs>` and, with a
fix open, that tests the CURRENT fix (the review's F3: its `target.branch` is `fix.branch` and it started after the fix
opened, the fix history's first line); with no fix open, any retest of the observation. It links that session's id and
its observations' ids (the retest's marks and words: fresh evidence linked to the original). `matches` and `still-wrong`
with none are refused in the shared logic (`confirmRetest`, 409 "no retest of the current fix yet", or "no retest session
of <obs> yet" with no fix: N5), so `POST /verb` refuses what the CLI does; `declined` takes one when found, else none
(`session: null`). The repro the review gave is a test: `still-wrong` on fix A, fix B opened, then `matches` is refused
until a retest of B exists. An original session outside `.playtest/` (`start --retest --from`) is confirmed only when its
retest sits in the same directory as it. The retest line (`retest: <verdict> (<evidence>)`) is written first, then:

| verdict | the fix | the observation | evidence |
|---|---|---|---|
| `matches` | to `confirmed` -- the only path to it (`fix` refuses it, §6); refused with no fix open or a fix already confirmed (409) | its state unchanged | `human confirmation` |
| `still-wrong` | to `failed`; a fix already `failed` takes a second `failed` line in its history, "a second human verdict", never a refusal (`enterFixState` refuses the same state, so `confirmRetest` writes that line itself); no fix open: untouched | back to `investigating` (a `state:` line, none when it already is) | `human confirmation` |
| `declined` | unchanged | unchanged | `not run` |

`human confirmation` is the evidence kind of PT.R9, kept apart from the six of PROCESS ("Confidence") and from the
fix's automated `validated`: it is written in `retests[]` and in the note of the fix's history line, never merged into a
pass. Review focus 6 -- "still wrong" after `validated` -- is held by a test: the fix `failed`, the observation
`investigating`, and the earlier states (`implemented`, `validated`) and history lines kept. The verdict's writer is
`player` by default (the controller relays the player's word), and it does not reset the original session's inactivity
clock. `matches` and `still-wrong` are refused (400) unless the writer is the player (the sprint 35 close: a verdict
by the investigator or the controller is no human confirmation); `declined` may be recorded by the controller.

**What is not done here.** ~~The placement is unit-tested against a fake hook only: whether the teleport lands the player
on the floor the mark stood on, on each map, is PT-23's rendered run (and the teleport's own, `e2e/turretMount.spec.ts`).~~
The placement was seen rendered on MP2 by PT-23's second test (research 244 §5: placed and held, within about 1e-4
units of the mark's feet); the other maps' floors are not seen rendered.
The retest opens at the mark's place, not at its replay tick: the spec's "opens at the mark's segment and tick" is read,
with W35.R7, as the place; a retest is a fresh session on another build, so no recorded tick of the original exists in
it. The live report (`src/report/page.ts`) does not yet show `retests[]` or `retestOf`; they are in the record and in
`status`'s source, `session.json`.

## 8. The player's writes, and the online rule (PT-29)

Written 2026-10-08T20:44Z for PT-29 of web sprint 36 (the plan `docs/plans/2026-10-08-web-sprint-36-every-match-recorded.md`;
the carries of sprints 33 and 34). The code: `packages/playtest/src/local.ts` (`serviceRequest`),
`packages/playtest/src/verbs.ts` (`handle`). The tests: `packages/playtest/test/verbs.test.ts`, the two `PT-29` cases
of "the verbs over POST /verb". Source inspection and unit tests only; no browser was run.

**`by: 'player'` -- loopback trust, named; the browser held to the service's own page.** A verb's writer is the
caller's word (`verbs.ts` `by()`), checked only against the three writers (`observations.ts` `HISTORY_BY`). Two paths
write the player's words, and neither is the test room's socket:
- the live report's Send, in the browser (`report/page.ts`, its script: `observe` with `by: 'player'`);
- the CLI, as the controller relays what the player said in the chat (`observe`'s writer is the player by default;
  `confirm`'s verdict too, §7).

The page's socket carries no words and no writer (`service.ts`: `mark`, `input`, `set`, `segment`, `clip`). Binding the
player's writes to the page socket's session would therefore cut the relay, the only path for words said in the chat
and for a retest's verdict, which is said to the controller and never typed in a page (§7). That change is rejected.
The change made is the smaller one, in two parts:
1. **A process of this host is the session's own (loopback trust).** A caller with no Origin may still write as
   `player`. Exactly: **any process on this host, of any OS user**, that reaches the service's loopback port can
   `POST /verb` with no Origin -- the service checks the peer's address, not its user. The reason given covers only the
   same user: a process of the user who runs the session can write `session.json` itself -- the CLI's own `applyFixVerb`
   does, when no service runs (`sendFixVerb`) -- so for it a stronger check on `/verb` would buy nothing. A process of
   another user on a shared host can write through `/verb` what the directory's permissions may refuse it; that is
   accepted, not closed (the instrument runs on a developer's own machine). `by` is a record of who the caller says
   spoke, not an authentication. The refusals that read it (`matches` and `still-wrong` only from
   the player, §7) guard against a mistaken writer, not a hostile one.
2. **A browser writes only from the service's own page.** Before PT-29, `/verb` took any page on this host
   (`localRequest`: `http://localhost:*` or `http://127.0.0.1:*`, any port), so a page another local server served --
   the test room's dev server, or any localhost site open in the same browser -- could post `observe` with
   `by: 'player'`. `/verb` now takes `serviceRequest`: no Origin, or the service's own origin on its own port
   (`http://localhost:<port>`, `http://127.0.0.1:<port>`), which is the live report it serves. The read routes (the
   report, its events, the evidence, the design system), the segments' route and the socket keep the wider rule: the
   test room on the dev server opens the socket, and the report's replay `<iframe>` on the dev server reads the
   segments. Held by "PT-29: the player's words from a browser come only from the service's own page" (another local
   page 403 and nothing written; the report's own origin, on either loopback name, and the CLI 200) and "PT-29:
   serviceRequest".

What stays trusted is any loopback process on this host, of any OS user, with no Origin; the "it could write
`session.json` itself" reason holds only for the session's own user. The instrument is local by design (spec 4.5: the
player's view is local), so that is the boundary it holds, and it is named here rather than closed (the PT-29 review).

**The address's online rule: three copies, named, not replaced here.** The carry of sprint 33's pass 4 ("derive it
from `readShare`/`netSettings`") is not in `service.ts`. The service takes a segment's `online` from the page's own
header (`service.ts` `segmentOpen`, `online: h.kind !== 'solo'`), which is the page's word, not a rule on an address.
The copies are:

| where | the rule |
|---|---|
| `packages/viewer/src/playtestSession.ts` `addressOnline` (the retest's placement, offline only) | `server`, or `mp`, or `online` but `off` |
| the same file, the recording's `online()` (whether the page records the segment) | `server`, or `mp`, or `online=shared` / `online=local` |
| `packages/playtest/src/retest.ts` `onlineOf` (the retest preselects online from a mark's address) | as `addressOnline` |

The shared readers they copy are `netSettings` (`packages/viewer/src/netPage.ts`: `mp` or `server`) and `readShare`
(`packages/viewer/src/shareUrl.ts`: `online=off|shared|local`), joined by `resolveOnline` (`packages/viewer/src/online.ts`)
with the remembered choice and the page's location. Why they are not replaced in this task:
- none of the copies is in this task's files: `retest.ts` and the viewer's `playtestSession.ts` are other tasks' ground;
- `netSettings` lives in `netPage.ts`, whose imports pull the page (`three`, `@s2u/scene`, the net client) into the
  Node CLI that `retest.ts` runs in, and `online.ts` reads Vite's `import.meta.env` and the page's storage (`pageStore`);
- `resolveOnline` needs the remembered choice and the location, which a mark's telemetry does not carry, so whether
  the page was online cannot be decided from its address alone in any case.

**A difference found.** The copies disagree on a bare `online` and on `online=<another value>`: `addressOnline` and
`onlineOf` read them as online, while the recording's `online()` reads them as offline, as the page's own readers do
(`readShare` takes only `off`, `shared`, `local`; `resolveOnline` then falls back to the remembered choice). The CLI
always writes `server=` beside its bare `online` (`launchUrl.ts`), so a session's own address never reaches the
difference; an address typed by hand could. The fix is one pure `addressOnline(search)` beside `netSettings` with no
import of the page -- a small module the viewer and the CLI both import -- carried to the lane as an open point for the
files' owners, not done here.

> Superseded in part (2026-10-09, relayed by the merge controller from the online seat): the three copies are replaced
> by one module, `packages/viewer/src/addressOnline.ts`, on the online lane -- sprint 15's ADDR-ONLINE (4ce3ee786, merged
> 6c4739d0f). A bare `online`, `online=OFF` and `online=<other>` are offline in all three readings; `Shared` and `LOCAL` are
> online; the module and its table (`test/addressOnlineTable.ts`) are the one rule, and `retest.ts` imports it relatively.
> The difference named above is closed there; the paragraph above stays as the record of what this sprint found.

## 9. The session tooling (sprint 37)

Web sprint 37's tasks PTT-1..5 and PTT-9 (the plan `docs/plans/2026-10-09-web-sprint-37-the-playtest-tooling.md`,
W37.R1-R6),
each its own part. **A playtest instrument with no original** (PLAYTEST_INSTRUMENT_ADAPTATION): nothing here reads or
changes a game value or behaviour (PT.R3).

### PTT-1 -- one command, one link (W37.R1, R2; issue #100)

Written 2026-10-09T13:58Z; amended 2026-10-09 at PTT-1's review (the loopback reading, `TRUST_PROXY=0`, the early-exit
abort). The code: `packages/playtest/src/launchUrl.ts` (`LOOPBACK_HOST`, `devOrigins`, `devServerOptions`,
`startDevServer`, `sessionDataDir`, `matchServerEnv`, `startMatchServer`, `watchMatchStart`, `stopMatchServer`),
`packages/playtest/src/readySheet.ts` (`readyPrintout`, `SECOND_WINDOW`), `packages/playtest/src/cli.ts` (`start`
calls them). The tests: `packages/playtest/test/launch.test.ts`, the spawn, the child and Vite's `createServer`
injected. Unit tests and source inspection only: no server, dev server or browser was started for this part.

**The root finding.** `start --online` spawned the session's match server with `PORT`, `REPLAYS_DIR` and `MAPS` but no
`DATA_DIR`, so the server mounted no account service and no login could succeed against it; the 2026-10-08 sessions
joined a hand-built link to the owner's 8787 server, which records nothing (PB-5 (i) and #100 share this root).

**What `start` does now** (`startMatchServer`, `startDevServer`):
- **The match server, online only.** Its environment is the shell's with the session's own values over it
  (`matchServerEnv`): `PORT` 5305; `HOST=127.0.0.1`; `TRUST_PROXY=0`; `DATA_DIR=<session dir>/data`, made before the
  spawn; `ALLOWED_ORIGINS=http://localhost:5304,http://127.0.0.1:5304`; `REPLAYS_DIR=<session dir>/segments`;
  `MAPS=<stem>`. A value the shell set for one of these is replaced. Offline nothing is made or spawned, as before.
- **How the server reads them** (`packages/central/src/main.ts`, read, not edited): `DATA_DIR` (:95), set, opens the
  service store there and mounts the texts, the clan invitations and SVC-03's login with the lobby (:99-124);
  `ALLOWED_ORIGINS` (:96) is split on commas and trimmed, and goes to the services' CORS (:118-122), to the replays'
  routes (:139) and to the `/ws` upgrade's Origin check (:153; `server.ts` :374-380, a page from another origin now gets
  403 where before any origin passed); `HOST` (:145, `env['HOST'] ?? '0.0.0.0'`) is passed as is to
  `http.listen(port, host)` (`server.ts` :414). So the server takes all three by environment: `main.ts` is unchanged.
- **The loopback, not `::`** (W37.R1 as amended at PTT-1's review). #100 is "a local two-window playtest": one host.
  The first reading bound both servers to `::` (dual-stack), which also opened the dev server -- `socomlegacy/public`, the
  disc tree, and `/@fs` -- to the LAN, and a node bind off the loopback can raise the Windows Firewall prompt. So both
  servers bind `127.0.0.1` and the link names `127.0.0.1`. The evidence the first reading stood on still holds, and the
  loopback answers it: #100's `netstat` shows the hand-run dev server on `[::1]:5321` alone while the match server's
  default (`0.0.0.0`, `main.ts` :145) is IPv4 alone, so a page at `localhost` resolved to `::1` reached the one and was
  refused by the other. A link on `127.0.0.1` never depends on how `localhost` resolves.
- **The dev server** is created with `server: { port: 5304, strictPort: true, host: '127.0.0.1' }`. Vite's default host
  is `localhost` (Vite 7.3.6 `resolveHostname`: an unset host is `localhost`), which binds the one address the resolver
  gives first -- `::1` alone on the owner's host (#100's piece 1). With `host: '127.0.0.1'`, `resolveHostname` keeps the
  name (it is not one of `wildcardHosts`), and `resolveServerUrls` puts `http://127.0.0.1:5304/` in `resolvedUrls.local`
  (`127.0.0.1` is one of `loopbackHosts`); the CLI reads `resolvedUrls.local[0]` for the map index, its fallback is the
  same address. An inline `server` overrides the viewer's `vite.config.ts` (`server: { port: 5173, strictPort: true }`,
  which names no host).
- **Out of scope: a two-machine LAN playtest.** It would need the binds on `::` (or `0.0.0.0`) again and a SETUP.md
  line for it, with the `/ws` origin refusal (`ALLOWED_ORIGINS`) beside it, since the dev server would then serve the
  disc tree to the LAN. Not this task's, and not done.
- **`TRUST_PROXY=0`** (the review's F2). The page reaches the match server's port directly, so `0` is the true value
  (`limits.ts` `proxyStartCheck`: "an explicit `TRUST_PROXY=0` (clients reach the port directly)"). Set over the
  shell's value, it also removes the one refusal a shell could carry in: an inherited `MP_DOMAIN` with `TRUST_PROXY`
  unset, or a `TRUST_PROXY` other than `0`/`1`, is refused with `DATA_DIR` set (`proxyStartCheck` :123-125, :134-137),
  which `main.ts` :86-89 turns into exit 2.
- **A match server that dies at start** (the review's F2). `start` watches the spawned child from the spawn to the ready
  sheet (`watchMatchStart`): an `exit` (such as `main.ts`'s exit 2) or an `error` (the spawn failed) before the sheet
  prints one plain line -- "the match server stopped before the session was ready (exit code <n>)" or "the match server
  did not start: <message>" -- and aborts the start (`abort(1)`: everything stopped, the record closed with no reason);
  no ready sheet and no link are printed. After the sheet an exit is the closeout's business. Before, only `error` was
  watched, so a server that exited at once went unnoticed and the link pointed at nothing. An exit the session asked
  for is never a failed start (the re-review's finding 1): a start that failed for another reason, Ctrl-C and the
  `close` verb stop the server through `stopMatchServer`, which disarms the watch before its kill, so no false line, no
  second `abort` and no sheet follow; a child Node reports `killed` is the session's too. An `error` after the sheet or
  the disarm is logged, not aborted on.
- **The page's origins.** `devOrigins` names `localhost` and `127.0.0.1` on the dev port, the two names `./local`
  `LOCAL_ORIGIN` takes for the session's socket: a page the session records is a page the match server answers. Both
  stay although the link names `127.0.0.1`: a page typed as `localhost` that falls back to IPv4 still sends Origin
  `localhost`. The `/ws` origin refusal is unchanged. `http://[::1]:5304` is left out: nothing listens there, and the
  session's socket would refuse that page too.
- **The link and the binds agree** (review focus 1). The link (`pageUrl`) is `http://127.0.0.1:5304/...`, the dev
  server's own bind, and its origin is an allowed one. Its `server=ws://127.0.0.1:5305/ws` is the match server's own
  bind. Under `devmode` on a development build the
  account requests follow `server=` (`connectHost.ts` `accountServiceBase` :149-151 -> `universeHost.ts`
  `universeServiceBase` :23-34): `http://127.0.0.1:5305/account/*`, cross-origin from the page, answered with the CORS of
  `ALLOWED_ORIGINS`. The link already carried `devmode` and `server=`; `pageUrl` changes only its host, `localhost` to
  `127.0.0.1`.
- **The accounts** are the player's, made at the page (the login screen's create), one per window: one account logs in
  once (a second login of it is answered AccountLoggedIn, -997, which the login screen shows as MP_PLAYER_LOGGED_IN:
  `packages/ui/src/screens/lobbyClient.ts` :477), so two windows need two. The tool seeds no
  account and no password (W37.R1). They live in `<session dir>/data/services.sqlite` with the session, so each
  session starts with none. `.gitignore`'s `/socomlegacy/.playtest/` ignores the directory whole (pinned by `git
  check-ignore` in the test).
- **The printed link** (W37.R2): online, `start` prints the ready sheet, then a blank line, then `For a second window,
  open: <the link>` (`readyPrintout`). The sheet keeps its plain-words rule (no port, path or internal; its
  forbidden-strings test is green and is re-run on the sheet part in the new test); the line is the operator's and is
  not relayed to the player. Offline the printout is the sheet alone.
- **The log line.** "recording online waits for PT-04" was stale (PT-04 landed: `main.ts` :126-140 records every room
  under `REPLAYS_DIR`). It now reads that the session's own match server records every room into the session and keeps
  its own accounts, one per window, made at the page. Research 242 §1's `start` row still names the old line and the
  old environment; this section supersedes it there (242 is not this task's file).
- **The skill** (`.agents/skills/playtest/SKILL.md` §2, step 4, and its generated copy): online, the session's server
  and its link line; one account per window, made at the page; the tool seeds none.

**Placeholders.** PTT-1 adds none: the ports are W33.R4's, `127.0.0.1` and the two origins follow from W37.R1 (as
amended) and `./local`, `TRUST_PROXY=0` from `proxyStartCheck`'s own reading of a directly reached port.

**Not verified here, the owner's run** (#100's closing bar; an owner row at the sprint's PR): a two-window session from
the printed link with no other step, two accounts made at the page. Also left to a run: that the server opens its
store under the session (`node:sqlite`, Node 22.5 or later; this host has 24.13.1) and that Windows' firewall asks
nothing (a loopback bind is expected not to be asked about; not seen run). The shell's `MP_DOMAIN` is still passed on,
but with `TRUST_PROXY=0` set over the shell's value it no longer refuses the start (above).

### PTT-2 -- a page on another server, warned and recorded (W37.R3; PB-5 (i))

Written 2026-10-09T15:44Z; amended 2026-10-09T15:55Z at PTT-2's review (F1 the two windows, F2 the offline session,
F3 the handoff's words). The code: `packages/viewer/src/playtestSession.ts` (`ANOTHER_SERVER_WORDS`, the heartbeat's
`server`, `segment` and `map`, the badge's line), `packages/playtest/src/service.ts` (`anotherServer`, `sessionServer`,
`sameServer`), `packages/playtest/src/session.ts` (`SegmentRecording`, `ANOTHER_SERVER`, the segment's `recording`, the
freeze), `packages/playtest/src/report/page.ts` (`ANOTHER_SERVER_WORDS`, the header's line, `replayFrameSrc`). The tests:
`packages/playtest/test/anotherServer.test.ts` (a real `SessionService` on port 0, the store on a temporary directory)
and `packages/viewer/test/playtestAnotherServer.test.ts` (jsdom, the socket and the hook faked). Unit tests and source
inspection only: no session, server or browser was run for this part.

**The finding** (the 2026-10-08 sessions, PB-5 (i)). A page whose link named the owner's server (8787) played there;
that server records into its own directory, and an online page records nothing itself (PT-03), so the session's replay
was empty and nothing said so. PTT-1 removed the reason to hand-build such a link; this part makes the case visible
when it happens anyway -- a deliberate test against another server is legitimate (W37.R3), so it is warned, never
refused.

**What the page sends.** The input heartbeat (`{ type: 'input' }`, at most once every `INPUT_HEARTBEAT_S`) now carries
`server` -- the page's effective server, `./online` `resolveOnline`'s URL as `main.ts` holds it (`NET.url`, read
through the hook's `online()`; `null` offline) -- with the page's `segment` and `map`. A hook with no `online()` sends
the heartbeat as before. Nothing the page joins changes.

**What the service does** (`anotherServer`, after the input is counted as before):
- **The session's own server** (`sessionServer`) is the `server=` of its launch link (PTT-1's `pageUrl`), online only.
  An offline session has none, so any server its page names is another (below). A heartbeat with no `server` field (an
  old page) or `server: null` (an offline page) marks nothing.
- **The comparison** (`sameServer`): scheme, host, port and path, through `URL`. `localhost` and `127.0.0.1` are one host
  (PTT-1's two page origins); `[::1]` is not, since nothing of the session's listens there. A scheme's default port is
  its number, a trailing `/` is no part of the path, and the query and the fragment are ignored. A URL that does not
  parse is never the same server.
- **On a mismatch** the page's segment is marked `recording: 'none (another server)'`. Online, the record holds no entry
  for a page's segment (the page opens none; the match server records into `segments/` under its own names), so the
  service adds one: a record index of the page's own (below) and its `map`, `online: true`, `file: ''` (no file),
  `ticks: 0`, `endedAt: null`, `startedAt` the service's clock. The page is answered `{ type: 'recording', segment,
  index, recording, server }` at every such heartbeat -- `segment` the page's own number (its badge matches on it),
  `index` the record's. A session closing or closed marks nothing (the freeze refuses a new segment).
- **Two windows, one segment number** (the review's F1). The greeting hands each new socket the index after the last
  entry, and an online page adds none, so both of #100's windows are segment 0: a mark keyed on the page's number alone
  would label the other window's recorded play "not recorded" (window A on 8787, B on the session's server), or, with A
  recording its own offline segment 0, leave B on another server unmarked and unwarned -- the silent empty replay W37.R3
  forbids. So the mark is per socket: the service keeps each socket's segment as it last said it (its greeting, then its
  heartbeats) and each socket's marked segments (its own number -> the record's index). A page's segment is marked
  once, under its own number when that is free -- not held in the record and not another live page's segment -- else
  one past every index held and every live page's segment. So a window's own recorded segment is never marked, the
  other window always is, and a reloaded window (a new socket) is judged afresh; both maps are dropped when the socket
  closes. A page segment a window has not reported yet (an online rotation between two heartbeats) is not known to the
  service, so a fresh index can still meet a number a page reaches later; an offline page's `segment` naming a held index
  is then refused and renumbered as before (`segmentRefused`).
- **The size of the change.** The row said "one line" in `service.ts`; it took one call in the heartbeat's case, the
  method, two helpers and the two per-socket maps (about 90 lines with their comments), because online there is no open
  segment entry to mark and two windows share a segment number.

**The switch-back rule.** The mark is per segment, and a segment once marked stays marked: nothing in the service
unmarks it, and after the close the freeze holds `recording` as a capture fact (`checkFrozen`: neither set, changed nor
removed). A change of server does not open a new segment (the page's context is the map, the mode and online or
offline, PT-03), so a page that comes back to the session's server inside a marked segment leaves it marked: part of it
played elsewhere. The page's next segment -- a new `session` greeting at a reconnect or a reload, or its own rotation at a
change of map, mode or online -- starts unmarked and is judged by its own heartbeats.

**Where it is shown.**
- **The badge** adds " · not recorded: this page plays on another server" (`ANOTHER_SERVER_WORDS`) while the page is in
  the segment warned of and still on the server warned of; it is checked each frame, so the line goes when the page's
  effective server changes.
- **The report** (live and static) says, in its header, "Segment <n>: not recorded: this page plays on another server."
  -- never the server's address. The live page's header is swapped at each record event, so the line appears live.
  The embedded replay (`replayFrameSrc`) skips a segment marked so: it has no file.
- **Not changed here:** the handoff record's segment table lists such an entry as `0` ticks, "open at handoff", without
  the words; its wording goes to PTT-5, which owns `handoff.ts` (the review's F3). `segmentsHttp` already skips an entry
  with no file, and `dispositions` already drops an empty `file` from a fix-now bundle.

**The offline session** (the review's F2). With multiplayer on (the default, `packages/viewer/src/multiplayer.ts`), an
offline session's page reaches a server through its own Online menu (`main.ts`'s `ui.onOnline` -> `resolveOnline`), with
no hand-edited address; its online segment then records nothing. W37.R3 marks a page that is "not the session's match
server", and an offline session has none, so a page of an offline session that names a server (not `null`) is another
server: it is marked and warned as online (the lane controller's reading of W37.R3, 2026-10-09). The first reading,
which marked nothing in an offline session, is withdrawn. An offline page (`server: null`) is still never marked.

**An old record** (written before PTT-2) has no `recording` on any segment: everything reads it as recorded, and no
migration runs.

**Placeholders.** PTT-2 adds none: it adds no chosen value (the words are the ruling's, the comparison follows from
PTT-1's two origins). A playtest instrument with no original (PLAYTEST_INSTRUMENT_ADAPTATION).

### PTT-3 -- "no account service at this origin" on a 404, labelled (issue #100)

Written 2026-10-09T15:12Z; amended 2026-10-09T15:27Z at PTT-3's review (F1 the line's life and place, F2 the
cross-origin case, F3 the bar's wording). The code: `packages/viewer/src/connectHost.ts` (`ACCOUNT_SERVICE_ABSENT_ADAPTATION`,
`ACCOUNT_SERVICE_ABSENT_LABEL`, `accountServiceAbsentLine`; `statusOf`, `fetchAccountService` and `pageAccountService`
told of it). The test: `packages/viewer/test/connectHostAbsent.test.ts` (jsdom, the fetch faked); `connectHost.test.ts`
unchanged and green. Unit tests and source inspection only (the two layouts and the popup records read off the disc
with the repository's readers for F1's place): no server, dev server or browser was run for this part. The
whole reading is research 157 §5 (2026-10-09) and its §11 row: that note owns the login, this part only records the
tooling's side.

**The finding** (#100's piece 2). A link without `?devmode` sends the logins to the page's own origin
(`ACCOUNT_SERVICE_OWN_ORIGIN_ADAPTATION`), where the dev server has no account route, and the 404 read as the original's
"Login Failure", the same words as the other three pieces and a real refusal. PTT-1's link carries `devmode` and
`server=`, so the session's own pages do not meet it; a hand-built link without `devmode` or a static host still can.
A match server with no `DATA_DIR` shows the line only when it is reached at the page's own origin: under
`?devmode&server=` (cross-origin, PTT-1's link) its bare 404 answers the preflight `OPTIONS` with no CORS headers, the
browser rejects the fetch, no line shows, and the connecting screen waits on its 90 s watchdog (the review's F2; 157 §5).
The owner's closing run should not expect the line in that case.

**What the page does now.**
- **The rule.** `/account/login` or `/account/create` answered 404 with no integer `status` in the body is an origin
  with no account service; a 404 that carries one is the service's own answer and reads as that status. SVC-03's
  handler never answers 404, and the match server's and Vite's 404s have no body (157 §5).
- **The line.** The page's own `<p>` at the window's top right, over the front end's canvas: "This page, not the game
  (a browser adaptation): no account service at this origin (<the account base>)". It shows beside the original's Login
  Failure, not instead of it (#100's bar reworded 2026-10-09, the merge controller's word). It is shown once, and
  removed at the next login-screen answer that carries a status and at the lobby's disconnect (backing out, or the front
  end's stop); while no lobby connection stands a 404 shows nothing. It is never put on the game's dialog and is not one
  of its strings.
- **The review's F1 (2026-10-09).** First built at the window's bottom left and cleared only by an answer with a
  status, the line could outlive the front end over the game's screens, and on a wide window it covered the connecting
  screen's player name (25, 428). It now sits in the frame's empty top band, clear of the Login Failure popup (mid-frame)
  and the playtest badge (top left), and the lobby's `disconnect` takes it down (157 §5).
- **What is unchanged.** The lobby's reply is still MediusFail, so the original's Login Failure still shows beside
  the line; a wrong password (-978), already logged in (-997) and every status the service answers keep their own
  events and no line; the keep-alive's 404 is still the session lost (`KEEPALIVE_REFUSAL_IS_LOSS_ADAPTATION`); every
  request sent is the same.

**Placeholders.** PTT-3 adds none. It adds one adaptation, `ACCOUNT_SERVICE_ABSENT_ADAPTATION`, with its row in
research 157 §11.

**Not verified here:** the line seen in a browser over the front end (no browser run for this task).

### PTT-4 -- words after the close, and a `none`'s reason (W37.R5; PB-5 (ii))

Written 2026-10-09T14:27Z. The code: `packages/playtest/src/observations.ts` (`addAfterClose`, `SessionOpenError`, the
`none` rule in `checkDecision`), `packages/playtest/src/session.ts` (`Observation.afterClose`, `AfterClose`, the freeze in
`checkFrozen`), `packages/playtest/src/verbs.ts` (the `words` verb), `packages/playtest/src/cli.ts` (`words <obs>`, `--by`),
`packages/playtest/src/handoff.ts` (`AFTER_CLOSE_HEADING`, `AFTER_CLOSE_COLUMNS`), `packages/playtest/src/report/page.ts`
(the card's after-close section). The test: `packages/playtest/test/afterClose.test.ts` (a real `SessionService` on port 0,
the store on a temporary directory). Unit tests and source inspection only: no session, server or browser was run.

**The finding** (the 2026-10-08 records, the playtest batch's PB-5 (ii)). The close freezes the player's words
(`checkFrozen`: an observation's `player` cannot change after `closedAt`), so what the player said about an observation
after the close had no path into the record; and a `none` decision carried only its `ref`, which in both of
`20261008-aecd`'s rows was the decider's name, `controller`, not a reason.

**Words after the close** (`words <obs> --text "..." [--by player|controller|investigator] [--dir <session dir>]`):
- **One path.** `addAfterClose` appends `{ text, at, by }` to the observation's own `afterClose[]` and a history line
  "words after the close". `by` is the player unless named, and only the three writers (`HISTORY_BY`, 400 otherwise);
  `at` is the verb's clock (`svc.now()` on the service, the CLI's `now` on the directory), as every other verb's.
  Empty or blank words are 400, an unknown observation 404.
- **After the close only.** On a session not closed it is refused (`SessionOpenError`, 409, naming `observe`): before
  the close the player's words go into `player` through `observe`, and words in `afterClose` would be mislabelled.
- **The freeze.** The player's `words` are never touched (the test compares their JSON before and after, byte for
  byte). `checkFrozen` lets `afterClose` grow and nothing else: an entry rewritten, removed or reordered, or the field
  dropped, is refused (`FrozenError`, 409), and so is a write that appends to it while it changes the player's words.
  Every other field keeps its rule: `observe` after the close is still 409, with or without `--at`.
- **The one writer.** Words after the close come when the session is closed and often after `dispose` (the 2026-10-08
  case), so `words` is one of `applyFixVerb`'s verbs, beside `formalise`, `fixnow`, `fix` and `confirm`: the CLI sends it
  through `sendFixVerb` to the session's own service while that is alive (`--dir` only names the session), and writes
  the session's directory through the same function only when none is -- the same validation, history line and freeze
  either way. Over HTTP it is `POST /verb` with the existing peer and Origin rule (`serviceRequest`, §8); no route was
  added. Like `confirm`, it does not touch the inactivity clock (the session is closed).
- **An old record** (written before PTT-4) has no `afterClose`: everything reads it as empty (`?? []`), the first
  `words` makes it, and no migration runs.

**Where they are shown.**
- **The handoff record** gains, only when some observation has words after the close, a section `## Words after the
  close` under the observations table: a table `id | the player's words (after the close) | said at | by`, one row per
  entry, the words verbatim or, over `SHORT_WORDS_MAX`, their own start marked "(short)" as the words column's. So they
  are in a column of their own, marked "(after the close)", and never joined to the frozen words in the observations
  table's `the player's words` cell. **Why a table of its own and not a ninth column of the observations table:** the
  convention test (`socomlegacy/tools/test/playtests.test.ts` `checkPlaytests`) holds every committed record's observations
  table to exactly `OBSERVATION_COLUMNS`, eight cells a row, and the three records of 2026-10-08 are history in that form
  and are never rewritten (§4). A ninth column would fail them, or need the gate to accept two forms -- a change to a
  file outside this task's. The observations table keeps its eight columns; a record with no words after the close is
  byte-identical to before. If the owner prefers the ninth column, the gate's test is the one place that changes.
- **The report** (live and static): the card gains "Your words after the close", with the player's own entries only
  (`by: 'player'`), each quoted verbatim (escaped, never scrubbed, as the player's words are) with "(after the close,
  <time>)", after "Your words" and apart from them. An entry by the controller or an investigator is not shown on the
  page (PTT-4's review, F1): it is not the player's words, and unscrubbed harness text on the player's page could name
  an internal, such as an agent branch (spec 4.10). The handoff record keeps every entry, its `by` column naming the
  writer. No section when the player has none. The live page's swap of a changed card (PT-12) brings it in with no
  change to the script; the report has no form for it (the verb is the CLI's).

**A `none` decision's reason.** A `none` decision's `ref` is its reason (spec 4.7: "the reason, in the record only";
`decide --prepare`'s `none` already writes `closed: <reason>`). `checkDecision` refuses, for `decide` and `redecide`
alike, a `none` whose `ref` is empty or blank, or a writer's name alone -- `controller`, `player`, `investigator`, in any
case, spaces trimmed (`InvalidArgumentError`, 400): it says who decided, never why. A reason that names a writer among
other words passes ("first was a test, the player says"); another disposition's `ref` is an owner and keeps its rule.
Decisions already in a record are not re-checked: the committed `20261008-aecd` record keeps its `controller` cells
(history), and the convention test does not hold committed `none` rows to the new rule (not this task's file).

**The skill** (`.agents/skills/playtest/SKILL.md` §5 step 3 and §6 step 4, and its generated copy): words after the
close go in with `words`; a `none` decision without `--prepare` takes its reason as `--ref`.

**Placeholders.** PTT-4 adds none: it adds no chosen value (the writers are `HISTORY_BY`, the short form is
`SHORT_WORDS_MAX`, the freeze is §6's of research 242). A playtest instrument with no original
(PLAYTEST_INSTRUMENT_ADAPTATION).

### PTT-5 -- a dead session's close: `close --dir`, `closeReason: 'abandoned'` (PB-5 (iii))

Written 2026-10-09T16:45Z; amended 2026-10-09T18:52Z at PTT-5's review (F1 the port asked, not only the pid; F2 the
service's own history lines; F3 the EPERM case; F4 the CLI's branch and the report's phrase tested; F5 the records'
README). The code: `packages/playtest/src/closeout.ts` (`closeAbandoned`, `probeService`, `CLOSE_DIR_PROBE_MS_PLACEHOLDER`,
`lastSignOfLife`, `closeDirCommand`, `CloseAbandonedResult`), `packages/playtest/src/session.ts` (`CloseReason`,
`closeReason`'s type), `packages/playtest/src/cli.ts` (`close --dir`, which calls `closeDirCommand`),
`packages/playtest/src/handoff.ts` (`ended`, `segmentEnded`, `ANOTHER_SERVER_CELL`), `packages/playtest/src/summary.ts`
(the abandoned line) and `packages/playtest/src/report/page.ts` (`CLOSE_PHRASES`, which the type change makes need the
new key). The tests: `packages/playtest/test/closeDir.test.ts` (real `SessionService`s on port 0, a mute TCP server, a
released port, the store on a temporary directory), `handoff.test.ts`, `summary.test.ts` and `reportPage.test.ts`. Unit
tests and source inspection only: no session, server or browser was run for this part.

**The finding** (the 2026-10-08 sessions, the playtest batch's PB-5 (iii)). The closeout runs in the `start` process,
which holds the page, the browser and the servers (`close` is a verb to its service). A session whose `start` process
died -- `20261008-8c2c`, whose record reads "Ended: not closed at handoff" -- had no way to be closed at all: `close`
found no service, and the record stayed open, the player's words unfrozen. The handoff coped by saying so.

**What `close --dir <session dir>` does** (`closeAbandoned`):
- **Only when this session's own service does not answer** (review focus 5; the review's F1). The first cut used the
  fix verbs' test, `./verbs` `sessionServicePort`: `service.json`'s pid alive. The review showed the pid alone is no
  test of THIS session's writer: Windows reuses pids, so a long-dead session whose old pid now belongs to any process
  was refused, with a message ("use `close` through the running session") that pointed at a port nothing listened on.
  So `close --dir` now asks the port `service.json` records (`probeService`: `GET http://127.0.0.1:<port>/status`, the
  service's own read route, which answers the session's record, so its `id` names the session), whatever the pid
  says, within `CLOSE_DIR_PROBE_MS_PLACEHOLDER` (10 s, the CLI's own `callVerb` limit: a connection to a closed loopback port on
  Windows can take about 2 s to be refused). What answers decides:
  - **This session's id: refused** (`alive`), "its own service answers on port <p>: it is the record's one writer, so
    close it through the running session -- `close --port <p>` -- not --dir; nothing written". A second writer renaming
    `session.json` beside it would race the page's next write (W35's rule). The test runs a real service and holds the
    record byte for byte.
  - **The connection refused (nothing listens): the close goes on** -- the reused-pid case; the test writes the test
    process's own pid (alive) beside a released port.
  - **Another session's service: the close goes on**, and the history line names it ("port <p> answers another
    session (<id>)"). Chosen over a refusal: the one-writer rule is per record, and a service writes only the record of
    its own store's directory, so another session's service is never this record's writer -- refusing would leave a dead
    session unclosable for as long as an unrelated session happens to hold the port (the service's port is fixed,
    5303, `cli.ts` `SERVICE_PORT`, so the next session's service takes the dead one's port as a rule). The test runs a second session's service on
    the port and holds that session's record byte for byte. Something that answers but is not a session service (no
    `id`, a 4xx, not JSON) is treated the same way, named "something that is not a session service".
  - **No answer in time, a 5xx or a broken connection: refused** (`unsure`), nothing written, naming both ways out:
    `close --port <p>` if it is this session's, else stop what holds the port and run `close --dir` again. A hung
    service cannot be told from a stranger, and writing beside a live writer is the one thing the rule forbids (as
    `sendFixVerb` writes nothing after a timeout, the sprint 35 close). The test uses a TCP server that accepts and
    never answers, with a 300 ms limit.
  - **No `service.json`, or one that does not read: the close goes on** (nothing to ask).
  The probe is applied to `close --dir` alone. The fix verbs (`sendFixVerb`) and `findServicePort` keep the pid test:
  `./verbs` is not this task's file, and there a pid misread costs a refusal or a skipped port, never a second writer.
  (Superseded at RE-9, below: the fix verbs ask the same probe; `findServicePort` alone keeps the pid test.)
- **The EPERM case** (the review's F3, inherited from `./verbs` `alive`): `kill(pid, 0)` answers EPERM for a process the
  caller may not signal -- an elevated `start` checked from a non-elevated shell -- and `alive` reads every error as
  dead, so the fix verbs would write on the directory beside that live service. The port probe closes this case for
  `close --dir`: the pid is not consulted, and an answer naming this session refuses the close (the test writes a dead
  pid beside a live service of the session). It does not close it for the fix verbs, whose code is unchanged.
  (Superseded at RE-9, below: the fix verbs no longer read the pid, so the EPERM case is closed for them too.)
- **A session already closed** (by its closeout, a failed start's abort, or an earlier `close --dir`) is refused with
  "already closed", nothing written. It is checked on the first read and again inside the write (`store.update`), so a
  close that lands between the two is refused the same way and the freeze is never touched.
- **`closeReason: 'abandoned'`.** The type gains the value additively (`CloseReason`); every record written before reads
  as before, and no migration runs. A start that failed still closes with `null` (`cli.ts`'s abort, unchanged).
- **The CLI.** `close --dir` takes neither `--reason` (an abandoned close has one reason) nor `--port` (it asks the
  recorded port itself); either, or `--dir` with no value, is a usage error, exit 2. It prints the summary (exit 0), or
  `not done: <why>` with exit 1. The branch is `closeDirCommand`, which `cli.ts` calls and prints: `cli.ts` itself runs
  `main()` at import and starts processes, so no test imports it, and the function is tested instead (the review's F4).

**`closedAt`: the last sign of the session's life, not now** (`lastSignOfLife`). The close may run hours or days after
the death; with `closedAt` now, that gap would read as session time
in the record, the report and the handoff. So `closedAt` is the latest of the times the live session itself wrote:
`createdAt`, `lastHumanInputAt` (the page's input heartbeat writes it at most every `INPUT_HEARTBEAT_S`, 5 s, so it is
the finest trace of a player at the page), each segment's `startedAt` and `endedAt`, each observation's `createdAt` and
each of the player's words' `saidAt`, and every history line the live service wrote -- never later than now (a clock
ahead is clamped to now). **The service's own history lines** (the review's F2): an observation's or the record's line
with no `by` -- "marked on the page", the mark's local id, "clip kept" (`service.ts`'s `keepClip`, stamped when the
clip arrives, which can be after the last input), and a closeout's own steps had one begun. Every harness writer stamps
a `by` (`./observations`, `./fixNow`, `./retest`, the `decide` verb's reference check), so the absent `by` is the
service's mark. Without them, `closedAt` could land before a capture write the record holds (the test keeps a clip at
+30 after input at +25: `closedAt` is +30). Two candidates the brief's lean named or allowed are left out, on purpose:
- **The record file's modification time.** It is not the record's word: copying the session's directory (another
  worktree's sessions are copied, never junctioned) resets it to the copy's time -- the very gap to exclude -- and a
  directory write after the death (`formalise`, `fix` on the open record) moves it too.
- **The harness's side** (notes, history lines with a `by`, decisions, pins, a card, a fix): a controller or an
  investigator writes it, through the directory after the death too, so it says nothing of the session's life (the test
  puts a note, a controller's history line and an investigator's and a controller's observation lines after the death
  and holds `closedAt` before them).
What this does not see: a page that played on with no input after its last heartbeat, or the bytes of an open segment's
`.part` -- a session idle that long would have closed itself on the inactivity clock, had its process lived. The time
the close was made is in the history instead (below), so both instants are in the record.

**The closeout's steps for a dead session** (`closeout`'s five):
1. **The page told and its flush waited for -- skipped.** No process holds the page's socket.
2. **The browser closed -- skipped.** The browser was the dead process's; nothing here holds or looks for it.
3. **The servers stopped -- skipped.** No server is held; a match server or dev server the dead `start` left running is
   not found or stopped here (its port stays taken until the operator stops it).
4. **The open segment closed -- not run.** Its entry keeps `endedAt: null` and its `.part` is left as the death left it
   (a readable prefix, `./segments`): when it ended is not known, and writing an end would invent one. The handoff says
   "still open when its process died" for it.
5. **The record frozen -- run**, as the closeout's: one `store.update` writes `closedAt`, `closeReason` and two history
   lines at the time the close was made -- that the process had stopped with no live service (and what the probe found
   on the recorded port) and that nothing was held to stop, then "the record was frozen (abandoned); closed at the last sign of the session's life, <closedAt>". From
   then on the freeze (`checkFrozen`) holds as after any close: a new observation, the player's words, `closedAt` or
   `closeReason` are refused, and words after the close (`words`, PTT-4) and the harness's side still write.
- **The static summary -- run**, rendered as the closeout's (`renderSummary`) and printed.
- **A stale `service.json`** (its process gone) is left as it is: `findServicePort` already skips it.

**The wording.**
- **The handoff record:** "- Ended: <closedAt> -- abandoned (its process died)".
- **The summary** (the player's, spec 4.10's plain words): "The playtest session has ended: it stopped unexpectedly, and
  was closed afterwards."; the report's header: "ended <time> -- it stopped unexpectedly and was closed afterwards". No
  process, service or flag is named to the player (`summary.test.ts` and `reportPage.test.ts` hold both).
- **The records' README** (`docs/playtests/README.md`, the review's F5) names the fourth end, "abandoned (`close --dir`;
  its process died)", and that a segment played on another server says it was not recorded.

**PTT-2's F3, folded in here.** The handoff's segment table showed a segment marked `recording: 'none (another
server)'` as `0` ticks, "open at handoff" (its `endedAt` is null: the session opened no file for it). Its "why it
ended" cell now reads `ANOTHER_SERVER_CELL`, "not recorded: the page played on another server" -- the report's words
(`ANOTHER_SERVER_WORDS`) in the past tense, as the record is history -- whatever its `endedAt`. Its ticks stay `0`: no
tick was recorded. A segment the session recorded and that is still open reads "open at handoff" as before. The records
already committed are history and are not rewritten.

**Not done here.** Research 242 §1's verb table does not name `close --dir`; this section is its record. The fix verbs'
pid test (`./verbs` `alive`, `sessionServicePort`) keeps both the reused-pid and the EPERM misreads (above). (Done at
RE-9, below: the fix verbs ask the same probe, and `sessionServicePort` is gone.)

**Placeholders.** PTT-5 adds one, `CLOSE_DIR_PROBE_MS_PLACEHOLDER` (10 s, the CLI's existing call limit, above), listed
in §3: a chosen value with no original, named with the suffix at the sprint's close review (it was written
`CLOSE_DIR_PROBE_MS` and called a tool's limit here; the plan's global constraint names every chosen value). It is the
CLI's (`packages/playtest`), outside research 101's round ledger, which walks the viewer, the server, the scene and the
sound. The times are the record's own. A playtest instrument with no original (PLAYTEST_INSTRUMENT_ADAPTATION).

### PTT-9 -- launch settings before the launch, on /testroom and /playtest (W37.R6)

Written 2026-10-09T19:32Z; amended 2026-10-09T19:53Z at PTT-9's review (F1 the session's own address, whole; F2 the
scan's blind spots; F3 a hand-split reader; F4 the probe reads a session's id; F5 the keys in the page's inventory; F6
Enter in "Save as"; F7 the e2e guard widened); amended 2026-10-09T19:58Z on the merge controller's ruling (a running
online session is joined at its record's own `launch.url`; F1's assembled address withdrawn). The owner's request, relayed by the merge controller (W37.R6; a relayed word, so the owner
confirms it in the seat at the pull request): "include a host of launch settings on /playtest and /testroom please
pre-launch for things that the params control as launch settings that save locally for reusability". The code:
`packages/viewer/src/launchSettings/params.ts` (`LAUNCH_PARAMS`, `PARAM_GROUPS`, `sessionKeys`,
`LAUNCH_SETTINGS_ADAPTATION`), `launchSettings/address.ts` (`testRoomAddress`, `valuesOfSearch`, `cliCommand`,
`playtestAddress`, `probeService`, `SERVICE_PROBE_MS_PLACEHOLDER`), `launchSettings/presets.ts` (`LaunchPresets`, `presetKey`),
`launchSettings/sheet.ts` and `sheet.css` (`mountLaunchSettings`), `packages/viewer/src/pageStore.ts` (the two keys
in `PAGE_SETTING_KEYS`), `packages/playtest/src/service.ts` (`GET /status`'s CORS header), `packages/viewer/src/pageEntry.ts`
(`wantsLaunchSheet`, `LAUNCH_PARAM`, the `/playtest` branch, `PAGE_LOADERS.launchSettings`),
`packages/ui/src/routes/menuRoutes.ts` (`PLAYTEST_SEGMENT`, reserved), `packages/playtest/src/launchUrl.ts`
(`RESERVED_KEYS` off the table) and `packages/viewer/e2e/urls.ts` (`TEST_ROOM_PAST_SHEET`, used by the four specs that
opened a bare `/testroom`). The tests: `packages/viewer/test/launchSettingsTable.test.ts` (the agreement scan),
`launchSettings.test.ts` (jsdom: the addresses, the presets, the sheet, /playtest) and `launchSettingsEntry.test.ts`
(jsdom: the routing, the condition, the release), and `packages/playtest/test/statusCors.test.ts`. Unit tests and source inspection only: no build, browser, dev
server or session was run for this part, and the typechecks are owed.

**One table** (`LAUNCH_PARAMS`). One row per key a module under `packages/viewer/src` reads from the page's address:
its group, its kind (flag, enum with its values, number, string), its meaning in plain words, what the page does
without it, the files that read it, its pages, and the playtest CLI's part (`session`: the session sets it and an
`--opt` naming it is refused; `option`: an `--opt` may set it). 27 rows today, read in 18 files, in five groups:
- **where:** `devmode`, `map`, `mode`, `view`, `fly`, `nomatch`, `noarmory`, `kit`, `rules` (retired while classic is
  the only ruleset: read only when respawn is offered);
- **net:** `online` (`off`/`shared`/`local`), `server`, `mp`, `lag`, `loss`;
- **playtest:** `playtest` (the session socket), `retest-at`, `replay`, `tick`, `embedder`;
- **instruments:** `launch` (the sheet's own key), `expMenu`, `expMenuSharp`, `expMenuSnap` (the front end's, research
  260);
- **other pages:** `menuflow` (the front end), `q`, `category`, `available` (the project site's archive page).
The sheet shows the test room's 19 rows; the table holds the rest so that every read has a row.

**The scan** (`launchSettingsTable.test.ts`). The readers are not refactored -- they are other seats' files -- so a
source scan holds them to the table. A key is read wherever a module asks the address for it: chained
(`new URLSearchParams(s).get(k)`, `<expr>.searchParams.get(k)` -- `new URL(s).searchParams`, `url.searchParams`);
through a name that holds one (`= new URLSearchParams(...)`, `= <expr>.searchParams`, or a parameter or variable typed
`URLSearchParams`); through a `(key: string) => ... q.get(key)` helper (`shareUrl.ts` `get`,
`experimentalUiSampling.ts` `numeric`); by a `/[?&]key=/` test of the raw search (`playtestReport.ts`); or by a hand
split of the search (`.split('&')`) whose part's key, a call on one name, is compared with a literal
(`key(p) === 'map'`: `replay/mount.ts` `replayMapAddress`, which reads `map` so -- missing from the first cut, the
review's F3). The key is a literal or an upper-case constant resolved across `packages/viewer/src` and
`packages/ui/src` (`FLY_PARAM`, `NO_MATCH_PARAM`, `DEV_PARAM`, `FRONT_END_PARAM` -> `FRONT_END_ENTRY_READING`,
`LAUNCH_PARAM`). It holds: every key read is a row; every row is read, in exactly the files its `readIn` names; every
file that names `URLSearchParams` or `.searchParams` reads a key the scan resolves or is a named dynamic reader; the
dynamic reads (a key the scan cannot name) are the two helpers' own bodies and the sheet's prefill (`address.ts`
`valuesOfSearch`), and nothing else; and a hand split compared with a name is `replay/embed.ts` `seekAddress` alone (a
writer). Teeth tests feed the scan each form as text -- `new URL(s).searchParams.get`, `url.searchParams.has`, a held
`.searchParams`, a typed parameter (optional too), a hand split, a chained `URLSearchParams`, a constant -- and each
must yield its key, which the first check then refuses as no row (the review's F2: the first cut missed the first
four). **What the scan cannot see:** a hand split whose key is compared some other way (`KEYS.includes(key)`, as
`shareUrl.ts` `writeShare` does -- a writer, which keeps the developer's parameters), or a reader that takes the search
apart with neither `URLSearchParams`, `.searchParams` nor `split('&')`. A file that names `URLSearchParams` or
`.searchParams` and reads nothing the scan resolves fails the "silent file" check rather than passing unseen.

**The brief's "keys" group is not a parameter group.** The brief listed `keyq`/`keye`/`keya`/`keyd`/`keyw`, the arrows,
`triangle`, `cross`, `l1`, `l2`, `r2`, `up`, `down`, `shift`, `space` and `instructiontext` among the parameters (its
count, 57 reads in 21 files, came from a grep of `.has('` and `.get('`). They are keyboard codes and pad buttons read
from the page's held-key sets (`camera.ts`, `inventoryMenu.ts`, `tacMap.ts`, `tauntMenu.ts`, `traversalPage.ts`) and an
ARMORY layout element (`armory.ts` `byName.get('instructiontext')`), never the address. The scan asserts none of them
is read as a parameter, and the sheet has no such group.

**The CLI reads the table.** `launchUrl.ts` `RESERVED_KEYS` is `sessionKeys()`, the rows marked `session`: `devmode`,
`map`, `mode`, `online`, `server`, `playtest`, `retest-at` -- the same seven as before, in the table's order, which only
reorders the list in the refusal's message. `urlState.ts` (`URL_KEYS`, `FLAG_KEYS`) is not edited (its own test pins
its order); the scan holds it to the table instead: its keys are test-room rows, its keys less the session's are the
rows marked `option`, and its flags are those rows' flags. The table imports nothing, so the Node CLI reads it by a
relative path, as it already reads `addressOnline.ts` and `net/protocol.ts`: no package boundary moves, and the table
stays in the viewer beside its readers.

**The routing** (`pageEntry.ts` only; no `main.ts` line, the merge controller's word). On a development build:
- `<base>/testroom` with no parameter at all (`''`, `?`, `?&`), or with `launch` present and not `off`
  (`wantsLaunchSheet`), shows the sheet, and `./main` is not imported. Launch goes to the built address; nothing set is
  `?launch=off`, the test room with no parameter of its own.
- `<base>/playtest` (any query) shows the sheet in playtest mode. The segment is reserved beside `testroom` in
  `@s2u/ui`'s `RESERVED_ROUTE_SEGMENTS` (`PLAYTEST_SEGMENT`, three lines in `menuRoutes.ts`), so no menu route takes
  it. It cost no more than the sheet: one branch beside the test room's, the same module in a second mode.
- **The condition.** A test-room link WITH parameters (`launch=off` among them) is the page it was: `./main` imported
  and nothing else, the markup and the body's classes as before (`launchSettingsEntry.test.ts`, "THE CONDITION", seven
  addresses). The one change for an address that carries parameters is an address that names `launch` (bare, or with
  a value other than `off`).

**Development build only, as the keyboard** (OT.R29). `PAGE_LOADERS.launchSettings` is made by
`if (import.meta.env.DEV) PAGE_LOADERS.launchSettings = () => import('./launchSettings/sheet');`, and `bootPage`'s
branch is `if (import.meta.env.DEV && loaders.launchSettings && ...)`; every `vite build` folds the literal to false.
Nothing outside `launchSettings/` imports it but by type (the test scans), and the sheet's stylesheet is imported by
the sheet's module alone. So in a release and the demo `/testroom` with no parameter is the test room and `/playtest`
the front end, as today. The built-bundle check (no `LAUNCH_SETTINGS_ADAPTATION`, no `launch-settings`, no CLI command
and no row's meaning in `dist/viewer/assets/*.js`) is written as `build_keyboard.test.ts`'s is and **skipped without a
build**: no build was run for this part, so the fold is a source reading, not yet a built-bundle measurement.

**The sheet.** Grouped panels in the design system's classes (`s2u-section`, `s2u-head`, `s2u-panel`, `s2u-field`,
`s2u-check`, `s2u-tab`, `s2u-cards--2`: one column under 860 px), no inline style; each field shows its key, its meaning
and its default. The address is shown and copied whole (the clipboard, or the text selected when there is none);
Launch is the form's submit, so Enter in a field launches; the preset's name and Save belong to the presets' own form
(`form=`), so Enter in "Save as" saves and never launches (the review's F6). The pad walks the controls in the setup page's way
(`startupNavigation.ts` `StartupNavigation`). The sheet opens on the fields the address names (`?launch&map=MP2`), else
the last used, else nothing set. **Presets** are named, saved, loaded and deleted, and the last used is written at
Launch: one record per sheet, `s2u.launch.v1.testroom` and `s2u.launch.v1.playtest`, through `pageStore.ts`
`pageSettings` (the browser's storage is named only there). Every access is wrapped and the record is kept in memory
too, so with storage that throws, refuses or is absent the presets last the visit and a save says it was not kept. The
two keys are in the page's inventory (`PAGE_SETTING_KEYS`, research 99 §4; the review's F5), marked a development
build's.

**/playtest.** The fields are the CLI's: target (`current` by default), map (`MP2`), online, and the `--opt` options
(the rows marked `option`). The sheet shows the exact command, `npx tsx packages/playtest/src/cli.ts start --target <t>
--map <m> [--online] [--opt k=v ...]` (the skill's §2 form, run from `socomlegacy/`; the options in the table's order, a
flag as `k=`, a word quoted for a POSIX shell when it needs it). It asks the lane's service (`GET
http://127.0.0.1:5303/status` with CORS, within `SERVICE_PROBE_MS_PLACEHOLDER`, 1.5 s, a chosen value of this adaptation) without
holding the sheet, and counts the answer only when it is 2xx JSON whose `id` has a session's form (`SESSION_ID`,
`YYYYMMDD-<4 hex>`, `session.ts` `newSessionId`): any other server on 5303 -- a dev server, another tool, other JSON --
reads as none (the review's F4; the first cut sent `no-cors` and took any answer as a session). For that, the service's
`GET /status` names a page of this host (`./local` `LOCAL_ORIGIN`: `http://localhost:<port>`, `http://127.0.0.1:<port>`)
in `Access-Control-Allow-Origin`, with `Vary: Origin`, and no other origin (`statusCors.test.ts`); the route was already
readable by the CLI and by the report, which is served from the service's own port; a page on another loopback port could
not read it before. Now any `http://localhost|127.0.0.1:<port>` page can read the whole record (branch, commit, the
player's words, history, evidence paths). That is a small widening inside the loopback trust the session already
extends: such a page could already open the `/session` socket and write to the session, and a DNS-rebinding page could
already read `/status` same-origin. Nothing leaves the host. (Corrected 2026-10-09 at PTT-9's re-review, L2.) An older
service without the header reads as none.

**Joining a running session** (the merge controller's ruling, 2026-10-09, on the gap the review round raised; it
supersedes F1's "build `127.0.0.1:5304` + the address"). The probe also reads the record's `launch.online` and
`launch.url` (`SessionStatus`). When an **online** session answers, the button reads "Join the running session (<id>)"
and goes to the record's own `launch.url`, untouched -- the address the CLI printed (`launchUrl.ts` `pageUrl`), so it
carries that session's map, options and server and is on the session's dev server (5304), the origin its match
server's `ALLOWED_ORIGINS` names. The sheet never assembles a running session's address, so a sheet set to another
map can no longer send a page to a match server whose `MAPS` allows the session's map alone, and no dev port is
assembled (`PLAYTEST_DEV_PORT` and `PLAYTEST_MATCH_PORT` are gone). The `launch.url` is taken only as this host's test
room (`http:` on `127.0.0.1` or `localhost`, path `/testroom`); any other value offers no join. The fields still build
the CLI command, for a **new** session, shown as before. When an **offline** session answers there is no join: the
command is shown, and the line says "the running session is offline: its page is the one `start` opened"; Launch then
opens the test room on the sheet's own page with no session in it. The ruling named the offline case "no
`launch.url`"; the record has one in both cases (`cli.ts` writes it for every session), so the sheet tells the two
apart by `launch.online` -- which is also when the CLI prints a second window's link (`readySheet.ts`). When none
answers, the sheet says to run the command, and Launch opens the same test room on the sheet's own page, offline with
no session in it (`playtestAddress`).

**The e2e specs.** Four specs (`iso.spec.ts` twice, `movieDecode.spec.ts`, `movieRealtime.spec.ts`, `startup.spec.ts`)
opened a bare `/testroom` on the dev server, where the sheet now stands; they open `TEST_ROOM_PAST_SHEET`
(`/testroom?launch=off`). A unit test refuses a bare one in any spec: `TEST_ROOM`, `'/testroom'`, `"/testroom"`,
`` `/testroom` ``, `'/testroom/'`, `` `${TEST_ROOM}` ``, an origin before `/testroom`, or a name a spec set to one of
those (the review's F7; its teeth test holds each form and that a query passes). Not run in a browser for this part.

**Not verified here:** the sheet seen in a browser (at a phone's width, with a pad), a launch through a running
session's service, the release build's fold, and the typechecks -- all owed to the merge controller's host window. The
playtest skill (`.agents/skills/playtest/SKILL.md`) does not explain building a link by hand (§2 forbids it), so it
gains no line.

**Placeholders.** PTT-9 adds one, `SERVICE_PROBE_MS_PLACEHOLDER` (1.5 s), listed in §3 and in research 101 §5's
excluded names: a chosen value of this adaptation with no original, named with the suffix at the sprint's close review
(it was written `SERVICE_PROBE_MS` and called "a tool's limit" here; the plan's global constraint names every chosen
value, as `MARKED_SHOWN_MS_PLACEHOLDER` is). Its ports are the lane's (W33.R4; `cli.ts` `SERVICE_PORT`); `SESSION_ID` is the service's own id form. A browser adaptation with no original
(LAUNCH_SETTINGS_ADAPTATION).

### RE-9 -- the tooling's leftovers: an early Ctrl-C, the fix verbs' liveness, the test's globals, a silent worker

Written 2026-10-10T01:52Z for RE-9 of web sprint 38 (the plan
`docs/plans/2026-10-10-web-sprint-38-the-replay-engine.md`; LATER 28 and 29, and the merge controller's addition at the
sprint's adoption). The code:
`packages/playtest/src/launchUrl.ts` (`startMatchServer`'s `closing`, `launchBrowser`), `packages/playtest/src/cli.ts`
(`start`'s `closing` flag, the `fixVerb` line), `packages/playtest/src/verbs.ts` (`sendFixVerb`, `FixVerbAnswer`'s
`held`, `CALL_TIMEOUT_MS_PLACEHOLDER`; `sessionServicePort` removed) and `packages/playtest/src/closeout.ts`
(`recordedPort` exported). The tests: `launch.test.ts`, `verbs.test.ts`, `closeDir.test.ts` and `reportPage.test.ts`.
Unit tests and source inspection only: the tests start real `SessionService`s on port 0 and a mute TCP server, as
PTT-5's; no session, dev server, match server or browser was run. A playtest instrument with no original
(PLAYTEST_INSTRUMENT_ADAPTATION): nothing here reads or changes a game value or behaviour.

**1. An early Ctrl-C stops the start (LATER 28).** A close asked for while the service or Vite was still starting found
no match server to stop, and `start` then spawned one: an orphan on 5305. `start` now keeps one flag, `closing`, set at
the first sign of a close -- Ctrl-C (the `SIGINT` handler sets it before the closeout), `closeSession` (the inactivity
clock's close), the closeout's own steps 2 and 3 when the `close` verb runs it (its page's close and its servers' stop),
`disposeOthers` and `abort` -- and read before each spawn and after each wait of the start:
- **the match server**: `startMatchServer` takes `closing` and, when it reads true, makes no data directory, spawns
  nothing, logs "the session is closing: its match server was not started" and answers null; `start` then returns
  with no sheet;
- **the browser**: `launchBrowser` launches none when the session is closing, and reads the flag again once
  `chromium.launch` resolves: a close that landed while the browser opened found none to close, so it is closed there
  and none is handed back;
- **the waits**: after Vite listens and after the map is resolved, a set flag returns at once. Vite is in the `start`
  process, so the dispose that follows a Ctrl-C ends it with the process; after the `close` verb, `dispose` stops it as
  the closeout's kept dev server.
Held by `launch.test.ts` ("RE-9 (LATER 28)": a close before the spawn means the fake spawn is never called; a close
before the browser's launch launches none; a close during it closes the launched one). The `cli.ts` wiring is source
inspection: `cli.ts` runs `main()` at import and starts processes, so no test imports it (PTT-5's F4).

**2. The fix verbs' liveness is the port's answer (LATER 29).** `sendFixVerb` (`formalise`, `fixnow`, `fix`,
`confirm`, `words`: every verb `applyFixVerb` writes) took a session for alive when `service.json`'s pid was:
a reused Windows pid read a dead session alive (its verb went to whatever held the port; another session's service
answered 404 or 409, with no way out named), and an EPERM read an elevated `start` dead (its verb was written on the
directory beside its live writer). It now asks the ports -- `--port` when given, and the one `service.json` records --
with `close --dir`'s own probe (`closeout.ts` `probeService`, `GET /status`, within `CLOSE_DIR_PROBE_MS_PLACEHOLDER`),
reused, not copied; the pid is not read. A service is the session's only when it answers with the session's id:
- **this session's service answers**: the verb goes to it, `--dir` or not; its answer or refusal is relayed, and a
  send without an answer writes nothing (the sprint 35 close). A `--port` naming another port while it answers is
  refused, nothing written.
- **a port is held but does not answer in time, or the connection breaks**: whose it is is not known, so nothing is
  written, and both ways out are named (`--port <p>` once it answers, if it is this session's; else stop what holds the
  port and run the verb again) -- `close --dir`'s `unsure`.
- **`--port` names another session's service, or something that is not one**: refused, nothing sent or written, the
  way out named (the verb without `--port`).
- **otherwise** -- nothing listens (the reused pid), the recorded port answers another session or something that is
  not a session service, or there is no `service.json`: no service of this session runs, so the directory is written,
  and the answer's `held` (printed by the CLI) names what the recorded port held, in `close --dir`'s words.
Held by `verbs.test.ts` ("RE-9": a reused pid with nothing listening, `words --dir` writes the directory; a live service
of this session with its pid read dead takes the verb; another session's service on the recorded port gets nothing and
the directory is written, the other record byte-identical; `--port` naming another session's service is refused;
a mute port is refused with both ways out) and `closeDir.test.ts` (one port, one answer: `close --dir` refused and the
fix verb sent to the service). The earlier tests that stood a fake `call` on port 1 now give a fake `probe` too
(`ours`, `nobody`): port 1 answers the real probe as nothing listening, so the fake alone no longer reaches the send.
- **Differs from the brief, on purpose.** The brief asked that another session's service on the port be refused "as
  `close --dir` does"; `close --dir` goes on in that case (PTT-5, the review's F1: another session's service writes only
  its own directory's record, so it is never this record's writer). The fix verbs follow `close --dir`: the service's
  port is fixed (5303), so the next session's service holds a dead session's port as a rule, and a refusal there would
  leave `words` after the close unwritable whenever any session runs -- PTT-4's own case, words after `dispose` -- where
  before RE-9 a dead pid wrote the directory. The refusal with the way out named is kept for the case the operator
  names: `--port` pointing at another session's service.
- **A body cut off is not known** (RE-9's review, finding 2). `probeService` classed every failed body read but the
  limit as `other`, so the session's own service sending 200 and its headers and then dropping mid-body read as a
  stranger -- `close --dir` went on, and through RE-9 the fix verbs would have written the directory beside their live
  writer. It now reads the body whole before it parses it: a read that fails (on this host's Node 24.13.1 and undici
  7.18.2 a dropped body rejects with `TypeError: terminated`, its cause `UND_ERR_SOCKET`; a whole body that is not
  JSON is a `SyntaxError`, checked the same way) is `unsure`, "its answer broke off", and only a complete answer that
  is not a session's record is `other`. Held by `closeDir.test.ts` ("RE-9's review, finding 2": a server that sends 200,
  part of a record and then destroys the socket reads `unsure`, and `close --dir` and `words` both refuse, writing
  nothing; a whole HTML page reads `other`).
- **No import cycle.** `verbs.ts` already imported `closeout.ts` (`closeout`); `closeout.ts` imports neither
  `verbs.ts` nor `cli.ts`. The probe and `recordedPort` stay in `closeout.ts`, exported; nothing moved.
- **Left as it is:** `findServicePort` (the port `status`, `close`, `dispose` and the live verbs take without
  `--port`) keeps the pid test; a misread there picks a port or skips one, and the verb's own answer then says what
  holds it. The duplicate refused-connection test (`verbs.ts` `refusedConnection`, `closeout.ts` `refused`) predates
  this task and is left.
- **The name.** `CALL_TIMEOUT_MS` becomes `CALL_TIMEOUT_MS_PLACEHOLDER` (exported), with its row in §3. The package
  is not in research 101's round ledger, so it has no row there.

**3. `reportPage.test.ts` restores its globals.** The live page's tests put a fake `fetch` and `EventSource` on
`globalThis` (`Object.assign`) and never took them off. The package runs `isolate: false` (`vitest.config.ts`), so a
worker runs several files in one module graph; vitest 3.2.7 still recycles the workers between groups of one project
and one environment (`dist/chunks/coverage.DfSpMS-b.js` :2823-2832), and this is the package's one jsdom file, so
today the fakes could reach only its own later tests -- a latent leak, which a second jsdom file of the package would
have met (a real `fetch`, a probe or `callVerb`, answered by a fake that asserts its URL is `/report`). Both now go on
through `vi.stubGlobal` and come off in the file's `afterEach`
(`vi.unstubAllGlobals`, which deletes a global that was absent and redefines one that was there: vitest 3.2.7
`dist/chunks/vi.bdSIJ99Y.js` :3946-3970), as the viewer's `playtestReport.test.ts` does. The file's last test holds
it: `fetch` is the one the file found, and `EventSource` is as absent as before (jsdom has none). The rest of
`packages/playtest/test/` was read for the pattern: no other file replaces a global, and `closeout.test.ts`'s fake
timers are restored by its `afterEach` (:42).

**4. A worker that dies must not hang the gate (the merge controller's addition).** On 2026-10-10 the graphics
re-gate hung twice at `reportPage.test.ts` (the plan's word), its vitest main process alive and silent for 30 minutes.
**The guard belongs in the gate's call, not in a vitest config, so it is proposed to the merge controller and not made
here** (`workflow/tools/gate.py` is a rules-and-layout file). Read in this repository's vitest 3.2.7 and its tinypool
1.1.1 (`node_modules`, not guessed):
- `teardownTimeout` (default 10 s, vitest `dist/chunks/defaults.B7q_naMc.js` :91) is passed to tinypool as
  `terminateTimeout` (`dist/chunks/coverage.DfSpMS-b.js` :2759, `createThreadsPool`) and arms the close's timer in
  `Vitest.exit` (`dist/chunks/cli-api.DVe0nWUx.js` :9938-9954), which runs only once the run has finished. In tinypool's
  `WorkerInfo.destroy` (`dist/index.js` :414-436) the terminate timer starts only after the worker has answered its
  `teardown` task, which is awaited with no limit. So it bounds neither a run that never finishes nor a worker that
  never answers its teardown.
- `testTimeout` and `hookTimeout` are timers inside the worker (`@vitest/runner` 3.2.7 `withTimeout`,
  `dist/chunk-hooks.js` :1852): a dead or blocked worker cannot fire them. `--bail` counts failed tests, and a silent
  worker fails none.
- The pool decides what a vanished worker becomes. tinypool's `ProcessWorker` (`pool: 'forks'`) turns a child's `exit`
  into "Worker exited unexpectedly" (:114-119), so the file fails; its `ThreadWorker` (`pool: 'threads'`, every
  package's config here) listens to no `exit` (:54-90), so a thread that ends without an `error` leaves its file's task
  pending for ever. A worker whose event loop is blocked is caught by neither. And with `isolate: false` vitest
  recycles the workers at the end of each group of one project and one environment (`coverage.DfSpMS-b.js`
  :2823-2832), awaiting each idle worker's `exit` with no limit (tinypool `recycleWorkers`, :721-734) after its
  unbounded teardown -- `reportPage.test.ts` is the playtest package's one jsdom file, so its group ends with it. That
  fits "hung at this file" but is not shown to be the cause: no capture of the hung run was read.
- A threads pool's workers are threads of the main process, so "the workers gone" in a process list is what every
  threads run looks like.
So no vitest option bounds a silent worker. `pool: 'forks'` would fail one case and leave the others. `isolate: true`
would skip the recycling, but it would cost each file its own module graph on a host short on memory, rests on a guess
at the cause, and would still not bound a stuck file. A hard limit on each suite's step bounds every case, whichever
package hangs: its process tree killed and the step recorded red. **The proposed change** (for the merge controller;
not made at RE-9): in `workflow/tools/gate.py`, `_run` (:139-140 at RE-9's base `d5675330d`) waits with a limit for
the two suites and kills the tree when it expires. (Done on main at #117 (`5a76d5151`/`4949e9505`, merged into this
lane at `efa6205a3`): `STEP_LIMIT_S` `gate.py:48-55`, with `DEFAULT_STEP_LIMIT_S` `:56` for the steps not in it;
`_run` `gate.py:289-301`, its tree kill `_kill_tree` `:258-286`; its record `gate.py:366-376`. The limits at head
are those lines' numbers, not the sketch's below.) The proposal as written at RE-9 --

```python
STEP_LIMIT_S = {"redotcom tests": 45 * 60, "shared tests": 15 * 60}   # the controller's numbers, from the records

def _run(name, argv, cwd, env):
    p = subprocess.Popen(argv, cwd=cwd, env=env, start_new_session=(os.name != "nt"))
    try:
        return p.wait(timeout=STEP_LIMIT_S.get(name))
    except subprocess.TimeoutExpired:
        if os.name == "nt":
            subprocess.call(["taskkill", "/PID", str(p.pid), "/T", "/F"])
        else:
            os.killpg(p.pid, 9)
        p.wait()
        return "TIMEOUT after %d s" % STEP_LIMIT_S[name]
```

-- a string return is already red and printed in the step's exit column (`run_gate` :200-209 at `d5675330d`;
`gate.py:374-376` at head), and the record keeps
"(no report)" for the suite, so the hang is a line in the record, never a silent half hour. The numbers are the
merge controller's, from the gate records' usual suite times; `workflow/tests/` would gain a test with a runner that
never ends. The leaked fakes of item 3 are not the hang's proven cause (a leaked fake fails a later test, it does not
silence one); this item's cause is not settled here.

**The review's correction to the proposal** (RE-9's review, finding 1; the proposal is the merge controller's now, its
task #117, and the sketch above is kept as written). With `start_new_session` the child tree is in its own session, so
a Ctrl-C at the gate's terminal reaches only Python: `p.wait` raises `KeyboardInterrupt`, not `TimeoutExpired`, and the
sketch would leave the suite running. The wait wants a second handler, `except BaseException:` that kills the tree as
the timeout's branch does and re-raises. And the limits are not 45 and 15 minutes: they are about three times the
slowest suite time the gate records hold, the merge controller's to set from them.

**Placeholders.** RE-9 adds one name, `CALL_TIMEOUT_MS_PLACEHOLDER` (10 s, the existing value renamed; §3); the fix
verbs' probe reads PTT-5's `CLOSE_DIR_PROBE_MS_PLACEHOLDER`. LATER 28 and 29 are struck with a pointer here.
