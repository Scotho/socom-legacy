# How the web project is built

The technology, and the way the work was actually done. What the work is for -- a 1:1 port of SOCOM II to the browser,
from boot to online, the campaign out of scope for now -- is [`MISSION.md`](MISSION.md) (the owner, 2026-10-01); the
project began as a map viewer and then a walk and multiplayer recreation, and the history below keeps that record.
For the PC recompilation's side of the same story, see `desktop@be557831:docs/HOW_IT_WAS_BUILT.md` (the `ref/desktop` submodule).

## Built with AI agents, under one person's direction

This project is written by AI agents -- Anthropic's Claude models, run as Claude Code sessions -- working under the
direction of the project's owner. The owner sets the goals and the priorities, plays the builds, and makes the rulings
where a question is not settled by evidence. Since 2026-10-02 a second developer, Chris, works in the same repository
through OpenAI Codex sessions (the online lane); the two kinds of session share one set of rules -- the root
`AGENTS.md` (imported by `CLAUDE.md`) -- and one way of handing work over and reviewing it
([`COLLABORATION.md`](COLLABORATION.md)). The agents do the research, write the code and the tests, review each
other's work, and keep the notes. Agent-written commits carry a `Co-Authored-By` trailer naming the model. Nothing here
was merged because an agent said it was right: the rule is [the parity rule](MISSION.md#the-parity-rule), and a test,
a measurement or a console frame.

## The stack

| part | what | why |
|---|---|---|
| Language | TypeScript (strict), one npm workspace (`package.json`: SOCOM Legacy and the shared design system; the landing workspace retired by OT.R30) | one language for the page, the tools and the server, so the rules run the same in both |
| Rendering | three.js with `WebGPURenderer`, falling back to its WebGL2 backend; node materials (TSL) | the GS's arithmetic expressed once as a node graph runs on both backends |
| App | Vite (dev server and static build), a Web Worker for decoding, Web Audio for sound, the Gamepad API | a static site: the page needs no server of its own |
| Unit tests | Vitest (with jsdom where a DOM is needed) | fast, per package (`packages/*/vitest.config.ts`, `tools/vitest.config.ts`) |
| Browser tests | Playwright (`packages/viewer/e2e/`), against real maps from your own disc | the picture, the HUD, the walk and multiplayer checked in a real browser |
| Server | Node, `ws` (WebSocket), bundled with esbuild | one authoritative process, one room per map |
| Deploy | a Docker image (non-root, health-checked), Compose with Caddy for HTTPS/WSS, a systemd unit for hosts without Docker, `deploy.sh` | [`../deploy/README.md`](../deploy/README.md) |
| The gate | `bash workflow/gate.sh`, run locally: the typecheck, the three suites, the build, the guards' tests, the leak check and gitleaks, with a record a pull request quotes; there is no CI (OT.R15) | `--no-data` reproduces a host without game data, where the fixture-backed tests that need the whole disc skip. `--e2e-per-file` runs the browser specs one file to a Playwright run and browser (about 4-4.5 GB a run, issue #117) in place of `--e2e`'s one run. Every step has a hard limit (`STEP_LIMIT_S`, overridden per host by `S2U_GATE_STEP_LIMIT_S=<name>=<seconds>,...`), past which its process tree is stopped and the step is recorded as a red `TIMEOUT` |

## Ground truth

A value in the port is only as good as its source, and validation is the confidence measure. The original is the
specification ([`MISSION.md`](MISSION.md), "The parity rule"), and the truth rule is RS.R7 (MISSION, "The sources of
truth"): redotcom's notes at their confidence and the placeholder ledger are the truth; the desktop recompilation's
documents are evidence, cited at a commit, never instructions. In the practice of the work so far, the evidence has
been:

1. **The disc's data**, read byte for byte by the packages' parsers (the maps, textures, clips, weapon table, sound
   banks, scripts). A parser is written against more than one archive before code depends on it.
2. **The game's code**, through a Ghidra decompilation of the executable on your own disc. Research notes cite it as
   `FUN_<address>` and line numbers; where the decompiler lost an argument, the executable's own instructions were
   disassembled and cited by address.
3. **reCOM**, the open-source reconstruction of the SOCOM games' engine (written against SOCOM 1), for names and
   structures where the decompilation is silent. It inspired this project and was its starting point: thank you to
   reCOM ([`MISSION.md`](MISSION.md), "Thanks to reCOM").
4. **Console frames and memory**: PCSX2 captures of live rounds and the recompiled PC game, with cameras read from the
   console's own memory, for the picture and for measured positions.

When none of them gives a value, the code says so: a constant named `*_PLACEHOLDER` with a comment saying what was
searched. A reading that has not been measured on a console is called a reading, not a fact.

## Confidence, and the test that holds each level

Every behaviour, value and screen sits at one of three levels; its research note says which, and the
[corpus](corpus/llms.txt) carries it. ([`DATA_SOURCES.md`](DATA_SOURCES.md) "Confidence" is the same definition from
the data's side.) The definition, word for word the same there, in MISSION and in the root `AGENTS.md`
(`tools/test/conventions.test.ts` compares the four):

<!-- confidence-levels -->
- **proven** -- measured against the original running: a capture of the original scored by the harness, or a call,
  memory or audio trace of the original compared value for value, within a stated tolerance.
- **reading** -- transcribed from the original, not yet measured running: its code from the decompilation (cited
  `FUN_<addr>`, `D:L<line>`) or the disc's data through the repository's readers (cited by file and field, checked
  over every file that holds it); unit-tested against the transcription and re-read at the source by a reviewer who
  did not write it.
- **placeholder** -- not read yet: a named `*_PLACEHOLDER` or `*_READING` constant, listed in its research note with
  the evidence that would settle it.
- A value transcribed and cited whose review is still to come is **reading, pending review**: the author's report and
  pull request say so, and it counts as a reading only once the review has re-read it at the source.
- A note written before 2026-10-02 may call a value read off the disc's bytes "proven" (the earlier definition:
  "measured on the disc's bytes or a console frame"); under this definition that value is a reading, the older word
  is not a finding against the note, and the note is re-filed when it is next edited.
<!-- /confidence-levels -->

What each level takes and the test that pins it:

| level | what it means | what it takes | the test that pins it |
|---|---|---|---|
| **proven** | measured against the original running | a PCSX2 or recomp capture scored by the harness (`tools/console-compare.ts`, PLAT-30's), or a call / RDRAM / audio trace of the original compared value for value, within a stated tolerance | a **capture-scored** spec (a frame or a response scored against the capture) or a **golden trace** replay (the trace kept as a golden; the port's run diffed against it) |
| **reading** | transcribed from the original, not yet measured running | the decomp (`FUN_<addr>`, `D:L<line>`) or the disc's data through the repository's readers, cited at the line; unit-tested against the transcription; independently re-read at the source by a reviewer who did not write it | a **transcription unit test** (the cited value pinned, the citation beside it), and where the disc is needed a **dev-disc test** (`SOCOM_DISC`, `SOCOM_ISO`, `SOCOM_PC_ROOT`; skips cleanly when absent) |
| **placeholder** | not read yet | a named `*_PLACEHOLDER` or `*_READING` constant, listed in its note with the evidence that would settle it and the task that owes it | the ledger (`tools/test/placeholderLedger.test.ts`): an unlisted name is refused |

- **A claim moves up** one level at a time, and only on evidence. Placeholder to reading: the source found,
  transcribed, cited, its transcription test written red first, the ledger row marked resolved, the cited lines re-read
  by a reviewer. Reading to proven: the original measured running agrees; the capture-scored spec or golden trace that
  measured it is committed beside the code (its golden under RS.R8 once the size policy exists; until then it runs on
  the host that holds the captures and skips elsewhere). A later measurement that contradicts a claim moves it down,
  in place, struck and dated.
- **Where parity is established, a test holds it.** A reading or proven behaviour without a regression test that
  fails on drift is owed one; a change that turns such a test red is a change away from the original and is refused
  unless the evidence moved (MISSION, "Validation is our confidence measure"). How such a test is written, in which
  tier, and how the parity registry names it: [`TESTING.md`](TESTING.md).
- **The evidence ledger.** A report says what kind of evidence it has, and keeps the kinds apart: a **physical
  playtest** (a person, a device, a build named), a **rendered browser run** (Playwright, which backend, automated
  input), a **unit test** run (the command and the counts), a **capture comparison**, a **source inspection** (read,
  not run). They are never merged into one "pass"; evidence from another build is not evidence for this one; a
  skipped, filtered or incomplete run is recorded as such with its counts ("79 skipped" is not "79 passed"). The habit
  is Chris's (`chris/browser-beta-integration` d578f347, `integrations/browser-beta-v5/INTEGRATION-HANDOFF.md`,
  "Evidence ledger"); every handoff carries it ([`COLLABORATION.md`](COLLABORATION.md), "The handoff").

## Research notes as evidence

Every non-obvious behaviour has a numbered note in [`research/`](research/) (71-382 for the web project, 160-167, 220 and 221 on `agent/online` until it lands; 300 records the Weapon Exchange audit, 301 the original taunts audit, 302 the original Options and the Chat menu's other branches, 303 the original victory dances and 304 the original gameplay audio, in Chris's range (300+); the PC project's
notes are in `desktop@be557831:docs/research/`, the `ref/desktop` submodule). A note opens with its answers, then shows the work: the
file offsets, the counts over all 22 maps, the functions and lines read, what is settled, what is not and what would
settle it, and the placeholders by name. Code comments cite the note and section (`research 84 §3`) and the function
(`FUN_005c2670`), so a reader can go from a line of code to the evidence and back. The
[corpus](corpus/llms.txt) indexes every section of every note and the files that cite it.

## Specs, plans and rulings

Web sprints 1 to 4 each had a design spec and a plan (under [`specs/`](specs/) and [`plans/`](plans/)), sprint 5 a plan
alone: sprint 1, the engine's world (the maps as the engine drew them); sprint 2, the SEAL in the world (the player:
camera, speeds, clips, weapons, HUD, sound, effects); sprint 3, the round (respawn multiplayer on a central server);
sprint 4, the arsenal; sprint 5, the ARMORY. Since the mission (web sprint 6) the spec is the [roadmap](roadmap/README.md) -- each task's block in its
segment file, the order in [`roadmap/SPRINTS.md`](roadmap/SPRINTS.md) -- and a plan orders, assigns and records;
[`plans/README.md`](plans/README.md) indexes them. A plan's `## Log` is its live record. Decisions are numbered rulings
(`W3.R1` ...), dated and reasoned, and the owner can overturn any by number. What only the owner can do or decide is a
row in [`HUMAN_TASKS.md`](HUMAN_TASKS.md), with its source and what waits on it.

## Play-tests become rulings and research

The owner plays builds and says what feels wrong ("the jump height and duration is way off", "bullet marks too
light"). Each report either becomes a research round that reads the behaviour in the game's code (research 80's jump,
research 89 §13's marks, which turned out to be shaded by the wall's baked light), or a ruling where the owner chooses
the PC's way over the console's (tap and hold `C` for the stance). Those rulings predate the mission; whether each
stands under it is the owner's to say ([`MISSION.md`](MISSION.md), "Validation is our confidence measure"), and a
ruling can be overturned -- the 2026-09-29 "no first person" gave way to the owner's 2026-10-01 ruling bringing it
back. Research 90 records the play-tests and the release sweeps, issue by issue.

## Parallel workstreams, one integration branch

The work is split into workstreams with clear boundaries -- maps, motion, look and aim, accuracy, grenades, traversal,
HUD, audio, effects, feel parity, multiplayer -- each run by an agent in its own git worktree and branch, cut from an
integration branch. A controller session briefs them, reviews what they report, and merges each branch back into the
integration branch with an explicit merge commit, running the typecheck, the unit tests and the browser tests after
each merge. Where two workstreams implement the same thing, one path is kept. Heavy runs (browser tests, load tests,
builds) take turns with the PC project's game runs on the same host.

## Tests first, and instruments

A change to behaviour starts with a failing test. Beyond the unit and browser tests, the project keeps instruments that
compare the port with the game:

- `tools/console-compare.ts`: the page beside a console frame at the same camera, measured region by region
  (research 82).
- `tools/feel-parity.ts`: the whole walk driven by script, one row per quantity against the console's number
  (research 88).
- `tools/release-sweep.ts` and `tools/playtest.ts`: every map, both presentations, both GPU backends: load times,
  a walk, stance, zoom, weapons, fire, a grenade, errors and screenshot statistics (research 90 §9).
- `tools/mp-bots.ts`: a server under 16 bots and 8 spectators, measuring tick time and prediction corrections.
- The `dump-*` tools: each format printed or rendered (textures to PNG, sounds to WAV, motion, effects, characters).

## Before anything is public

The repository is private (the owner, 2026-10-02). The leak check (`python -m workflow.release.leakcheck`) runs in
the commit and push hooks and in the gate and refuses key material, tokens, private addresses, home directories and
files the `.gitignore` refuses; it is never skipped.
What of the disc the private repository may hold is RS.R8 ([`MISSION.md`](MISSION.md), "Game data in git"): decoded
data in notes and tests, and -- once a later task sets the size policy -- fixtures and goldens under named
directories. This repository is not deployed (OT.R31), and a build hosts no game data but the owner's named exceptions (OT.R34). Before the repository could ever be made public, those
fixtures, goldens and their history are purged ([`HUMAN_TASKS.md`](HUMAN_TASKS.md) H60).
