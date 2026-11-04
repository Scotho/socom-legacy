# Shared conventions for Claude and Codex sessions -- design

> Written 2026-10-03 on the owner's word of that day, against `main` at `cd24d9ec`, on `agent/codex-parity`
> (`C:/Projects/wt-codex-parity`). It designs; it changes nothing. The implementation plan follows the owner's review.
>
> **The owner's words (this seat, 2026-10-03).** "Rework the repository such that Chris (using Codex) is able to
> follow our general agentic conventions of researching, building tasks and handling version control. All while
> retaining our strict automated validation requirements that have got us this far." "Establish/implement shared
> conventions for a harness-agnostic repository where possible, retaining vendor specific features only where required
> and ported to ensure coverage in Claude/Codex." "It should also include setup instructions to bring his environment
> to parity with ours ... State plainly what is needed from the maintainer and what features/functions are lost
> without setup." "Ensure all the parity testing harness, validation/reverse engineering infrastructure of the main
> project, research and testing corpus, and anything else that drove successful work on the project be retained after
> this restructuring. Additive additions should be limited to careful improvements or additions and only with high
> confidence." And, approving the design: "Include a handoff including the entire decomp in a zip and any other files
> he would need as a handoff package. Only exclude credentials and anything that would be a security risk for me
> personally. This is private so liability concerns are no issue."
>
> **His choices in this seat.** Chris's sessions run the full controller flow (plan, task table, Log, a worktree per
> task, fresh review, gate, close), not one task per session. The approach is layered guards (section 3). The
> desktop's document-maintenance procedure and rulings registry stay in `ref/desktop`. A live check of the Codex
> wiring on this host is allowed ("a few short runs"). And, approving this page: "a push to main is granted only
> with clear authority and ... scotho/claude session handles major merges into main" (section 4.3, **who lands on
> `main`**).

## 1. The principles

1. **One source, read by both harnesses.** A rule, a procedure or an agent contract is written once in a place
   neither vendor owns. A vendor's file exists only where the vendor's tool will read nothing else, and then it is
   generated from the source or imports it, and a test refuses a difference.
2. **A guard that refuses for one harness refuses for the other.** Where a rule can live in git itself it lives
   there, because git binds every tool and every human.
3. **Nothing that was retained is moved out of reach.** Section 2.3 shows nothing tracked was lost; this work adds no
   move of that kind.
4. **Few additions, each labelled.** Every change below is a **Move** (existing text relocated), a **Port** (an
   existing, tested guard carried to a second place), a **Fix** (something false or broken on `main` today) or
   **New**. A New item is small, has a planted test, and is listed in section 8 so the owner can strike it.

## 2. What was established

### 2.1 What Codex reads from a repository

Read from OpenAI's documentation (the pages `developers.openai.com/codex/*` now serve from
`learn.chatgpt.com/docs/*`) and, where the pages are silent, the `openai/codex` source at `rust-v0.160.0`
(2026-10-01). Source-only facts are marked **[source]** and may change.

| Function | Codex's mechanism | Status | What matters here |
|---|---|---|---|
| Rule file | `AGENTS.md`, root down to the working directory, concatenated | stable | one combined budget of 32 KiB (`project_doc_max_bytes`); the file crossing it is truncated **[source]** |
| Procedures | `.agents/skills/<name>/SKILL.md`, the same format Claude Code reads from `.claude/skills/` | available | `.claude/skills/` is not scanned |
| Agent contracts | `.codex/agents/<name>.toml` (`name`, `description`, `developer_instructions`) | stable; "the format may evolve" | a parent's sandbox and live choices override the file |
| Tool-call guard | `PreToolUse` in `.codex/hooks.json`; stdin JSON with `tool_name`, `tool_input.command`, `cwd`; exit 2 with a sentence on stderr refuses | stable since 2026-05 | see the three limits below |
| Command rules | `.codex/rules/*.rules` (`prefix_rule`) | experimental | prefix only; a redirection or a variable hides the command; not used here |
| Cloud runs | `AGENTS.md`, repository skills and an install script | -- | no documented hook or rule enforcement |

The three limits no file in the repository removes: **(1)** Codex ignores a clone's `.codex/` until that clone's
path is trusted, and skips a hook until it is approved once in `/hooks` (again whenever its definition changes), with
only a start-up warning; **(2)** the hook fails open -- a missing interpreter, a crash or a timeout lets the command
run; **(3)** the developer can switch hooks off. The payload has the same shape as Claude Code's for a shell command,
so `workflow/hooks/pretool.py` can judge it. How Codex spells a command on native Windows is not documented.

### 2.2 How Chris's sessions work

From his eight commits, pull request #10 (`chris/map-loading-screen`, base `56c19e54`) and his
`INTEGRATION-HANDOFF.md` (`d578f347`); his sessions themselves are not on this host.

- **Kept, from `AGENTS.md` and `COLLABORATION.md` alone:** the recorded base commit; hot files claimed in a first
  commit, pushed, a draft pull request the same day, the claims released at the end; the handoff template with the
  evidence kinds apart and the early failures told; a playtest preference recorded as an owner row, not applied; a
  leak-gate finding recorded as an owner row with no exception added; `workflow/setup.sh` run.
- **Different from ours:** one session, one branch and one large feature commit -- no plan, no task table, no Log,
  no worktree per task; no review (the pull request sat as a draft with none; no step of ours looks at open pull
  requests); focused test files only, where the whole suite found four failures (a colour literal the design-token
  test refuses, `shared/ds/css.test.ts`; stale corpus indexes, `socomlegacy/tools/test/corpus.test.ts`) -- CI caught
  them then, and CI is gone (OT.R15); the corpus rebuilt by him, though HANDOFF rule 15 calls it "the controller's";
  a trailer without an address (`Co-Authored-By: Codex (GPT-6)`); commits under one GitHub identity and the pull
  request under another.
- **His host:** his own disc and ISO; no captures, no decompilation export, `libmpeg2.wasm` not built.

### 2.3 What the restructure kept

Every file the pre-restructure tree (`7457eb73`) tracked is reachable from a fresh clone of `main`: the web tree in
place, and everything else in the `ref/desktop` submodule at its pin `be557831` (a superset of the old tree's
non-web files). `Scotho/socom-unzipped` is public, so the submodule clones for anyone.

| What drove the work | Where a fresh clone finds it |
|---|---|
| The parity harness: `tools_py/parity` (79 files), `scripts/parity` (130, with 68 reference frames), the three-stage gate | `ref/desktop/` |
| The web's capture scoring, golden manifest and parity registry (638 entries) | `socomlegacy/tools/`, `socomlegacy/docs/parity/` |
| The Ghidra scripts, the name and symbol tables, the research and trace tools | `ref/desktop/` |
| The desktop's research (94 notes), KNOWN, RULINGS, HAZARDS, the audits | `ref/desktop/docs/` |
| The web's research (77 notes), the corpus, the specs and plans | `socomlegacy/docs/` |
| The desktop's tests (203 files) and fixtures | `ref/desktop/` |
| The web's tests and the 19 committed disc fixtures | `socomlegacy/` |
| The guards: the tool-call policy, the three git hooks, the leak check, the worktree script, their tests | `workflow/` |

**Never in git, so on the owner's host only:** the decompilation export (`game/analysis/`, 18 files, 23 MiB), the
disc tree, the captures (`logs/parity/`), the parity archive (`D:/socom_archive/parity`), the Ghidra project, the
toolchains (PCSX2, Ghidra), the external research clones. Section 6 says what each costs; section 4.6 hands Chris
the ones that can be handed.

**Left with the desktop, by the owner's choice:** the document-maintenance procedure (`DOC_MAINTENANCE.md`,
`docmaint.py`) and the rulings registry (`RULINGS.md`, `rulings.py`). The web keeps its rulings in MISSION and the
plans. `AGENTS.md` says where the desktop's are.

**The pin lags.** `socom-unzipped`'s `main` is 74 commits past the pin; the owner's live checkout is further on, on
a local sprint branch the reference cannot see until it is pushed and merged.

### 2.4 What a clone lacks, and what was only in memory

The full table of local-only prerequisites is section 6. Two facts about the tests: **nothing reports or caps
skips** -- a run with no disc is as green as a full one; and the last measured skip counts (TESTING.md) predate the
committed fixtures.

Of 94 local memory files across this project and the desktop's, 22 hold rules already on `main`, 21 are
desktop-only, 14 are host-local, 29 are stale. **Eight hold a rule that applies here and is not on `main`**; section
4.7 places each.

### 2.5 Defects on `main` found on the way

- `.claude/settings.json` matches the `Bash` tool only: a git command run through Claude Code's PowerShell tool is
  never judged. The desktop closed this in its sprint 17 (`Bash|PowerShell`, a normaliser, planted tests).
- The refusal sentences cite homes that do not exist here: `docs/GIT_STRATEGY.md` (nine files under `workflow/`),
  `docs/HANDOFF.md section 4 rule 1` (the file is `socomlegacy/docs/HANDOFF.md`, the rules are its section 5),
  `docs/HAZARDS.md git`.
- `.claude/skills/web-close` and `CLAUDE.md` "Boundaries" still ask the owner's word for every merge (OT.R13 lets
  the controller land a confidently completed sprint). `TESTING.md`, `CLAUDE.md` "Guards", `README.md` and
  `AGENTS.md` still describe the removed CI. `web-sprint` still names `agent/web-s6`.
- `SECURITY.md` is the desktop's text (`tools_py/`, `scripts/install_hooks.sh`, `docs/KNOWN.md`).
  `socomlegacy/CONTRIBUTING.md` points at sections the root file does not have.
- `web-gate` omits four things CI ran: the build, the guards' own tests, `leakcheck all`, gitleaks.
- No document says `npx playwright install`; `setup.sh` calls Python optional though the hooks refuse every commit
  without it.

## 3. The shape: which harness reads what

| Function | Claude Code reads | Codex reads | The one source | Kind |
|---|---|---|---|---|
| The rules | `CLAUDE.md` = `@AGENTS.md` + Claude-only notes | `AGENTS.md` | `AGENTS.md` | Move |
| The procedures | `.claude/skills/` (generated) | `.agents/skills/` | `.agents/skills/` | Move |
| The agent contracts | `.claude/agents/*.md` (generated) | `.codex/agents/*.toml` (generated) | `workflow/agents/*.md` | Move |
| The tool-call guard | `.claude/settings.json`, `Bash\|PowerShell` and the edit tools | `.codex/hooks.json`, `PreToolUse` | `workflow/hooks/pretool.py` | Port |
| The git hooks | `core.hooksPath workflow/bin` | the same | `workflow/bin/` | -- |
| The gate | `bash workflow/gate.sh` | the same | `workflow/gate.sh` | Port |
| The setup and its check | `workflow/setup.sh`, `workflow/doctor.sh` | the same | `workflow/` | Fix, New |

**Vendor features kept as the vendor's, and why they are not ported:**

- **The reaper** (`workflow/hooks/reap.py`, Claude's Stop and SessionEnd): it kills the orphaned `tail`/`grep`/`sleep`
  watchers Claude Code's background monitors leave. Codex leaves none; nothing to port.
- **Private memory** (both vendors have one, each local to a machine): no rule may live only there (section 4.7).
- **Orchestration** (Claude's Agent and Workflow tools, cross-session messages, scheduled wake-ups; Codex's
  subagents): the procedures say what a controller does -- dispatch, review, merge, record -- and each harness uses
  its own mechanism. Coordination between the two seats goes through what both can read: HANDOFF "In flight", the
  open pull requests, the plans' Logs.
- **The plan and spec method** (on the owner's host it comes from a plugin, outside the repository): a plan template
  under `socomlegacy/docs/plans/` records what a plan holds, so neither seat depends on the plugin.

## 4. The design

### 4.1 One rule file (Move)

`AGENTS.md` becomes the single rule file: the parity rule; the truth rule and the confidence levels (the
`<!-- confidence-levels -->` block, unchanged); what never goes in git; **Layout and local directories** (the text
agreed with the web lane's controller: the tree, one canonical clone per developer on `main`, a branch per lane and
a worktree per task, pushes from the canonical clone only, data copied never junctioned, heavy runs serial per host,
`main` only by pull request); how to work; the guards by layer (section 4.3) with the canary as a session's first
command; the gate by name; the procedures by name; where the state lives; the boundaries; where the desktop's own
conventions are (`ref/desktop`).

`CLAUDE.md` becomes the line `@AGENTS.md` and the notes only Claude needs: the owner's host lock and ports, the
reaper, the handling of a dispatched agent's notices, and the memory rule. HANDOFF rule 20 ("a rule added to
`CLAUDE.md` goes into `AGENTS.md` in the same commit") is replaced by the import.

**Held by** `socomlegacy/tools/test/conventions.test.ts`: `AGENTS.md` is at most 24 KiB (Codex truncates at 32);
`CLAUDE.md` imports it and does not restate the confidence block; the block still matches MISSION, PROCESS and
DATA_SOURCES word for word.

### 4.2 Procedures and agent contracts (Move, with corrections)

The four skills move to `.agents/skills/{web-sprint,web-gate,web-close,derive-from-desktop}/SKILL.md`. The two
contracts move to `workflow/agents/{implementer,reviewer}.md`. `python -m workflow.tools.sync_agents` writes
`.claude/skills/`, `.claude/agents/*.md` and `.codex/agents/*.toml` from them (the per-harness header -- Claude's
`model` and `tools`, Codex's `name` and `description` -- comes from a small table in the tool);
`sync_agents --check` runs in `workflow/tests/` and refuses a difference.

The text is rewritten to name no harness where it need not ("dispatch the `implementer` agent"), and corrected:

- **web-sprint**: step 1 also lists the open pull requests (`gh pr list`); one from the other seat that waits for
  review gets a fresh reviewer before the next task. The corpus is rebuilt by the controller of the branch that
  touched a note (Chris's controller on his branches). The stale `agent/web-s6` text goes. The memory-only rules of
  section 4.7 that are a controller's go in. The gate is `bash workflow/gate.sh`.
- **web-gate**: its steps 1-4 become "run `bash workflow/gate.sh`, read its record"; the host-lock table and the
  console comparison stay.
- **web-close**: OT.R13 as HANDOFF rule 7 has it; an incoming pull request is merged only after the gate on its head
  and `python -m workflow.release.leakcheck history <base>..<head>`, both existing commands.
- **derive-from-desktop**: the pin and how it moves (section 4.5); where the handed-over evidence sits on a host
  that received the package (section 4.6).

`socomlegacy/docs/plans/TEMPLATE.md` (New, a document): the header, the rulings, the task table's columns, the waves,
the gate, the `## Log` newest first.

### 4.3 The guards, by layer

| Layer | Refuses | Binds | Kind |
|---|---|---|---|
| **git hooks** `workflow/bin` | a leak at commit and at push; a subject over 120 characters | any tool, any human, after `setup.sh` | as today |
| | a force push, a `+refspec` or a delete aimed at `main` or `sprint-*`; a push from a linked worktree | the same | **New** (`pre-push`; the rules `pretool.py` already has, moved to where git enforces them) |
| | a plain push to `main` (HANDOFF rule 7: `main` only by pull request). It is granted only with clear authority -- the owner's word for that push, said in the seat that pushes -- and then by `S2U_OWNER_PUSH_MAIN=1`, which the refusal names | the same | **New**, on the owner's word (2026-10-03) |
| **tool-call policy** `workflow/hooks/pretool.py` | bulk staging, `commit -a`, a commit without paths, `--no-verify`, a hand-made worktree, a `git config` write in a worktree, `gh pr merge --delete-branch`, the host lock's heavy runs | Claude through Bash | as today |
| | the same rules through Claude's PowerShell tool | Claude | **Port** of the desktop's sprint 17 G1 (`desktop@<pin>:tools_py/hooks/pretool.py`, `powershell_command`, its tests) |
| | the same rules for Codex | Codex, once the clone is trusted and the hook approved | **Port**: `.codex/hooks.json` -> `workflow/bin/codex_pretool.sh` (and its Windows command) -> the same `decide()` |
| **the canary** | `bash workflow/bin/guard_canary.sh`: the policy refuses it by name ("the guard is live"). If no hook runs, the script runs, prints GUARD OFF with the two steps that turn it on, and exits 1 | both | **New** |

- **Who lands on `main`** (the owner, 2026-10-03). A push to `main` is granted only with clear authority: the
  owner's own word for that push, in the seat that makes it; a relayed word, an older go-ahead or another session's
  say-so is not one (HANDOFF rule 17). **Major merges into `main` -- a sprint, a lane's integration branch, anything
  that changes the rules or the layout -- are handled by the owner's (Scotho's) Claude controller session**, under
  OT.R13's bar. Every other session, Chris's Codex controller included, takes its work as far as a reviewed pull
  request with the gate's record and stops there; it does not merge to `main` and does not push to it. This goes
  into `AGENTS.md` ("How to work", "Boundaries"), `COLLABORATION.md` and `web-close`, and HANDOFF rule 7 is reworded
  to it.
- **The Codex adapter is written to evidence.** The live check (section 7) captures what Codex on Windows puts in
  `tool_input.command`; the captured payloads become planted tests, and the adapter normalises exactly what they
  show. `apply_patch` is allowed, as Claude's edit tools are today.
- **The homes are repointed** (Fix) to `AGENTS.md` sections and `socomlegacy/docs/HAZARDS.md`; a test in
  `workflow/tests/` checks that every home a rule cites names a file that exists.
- **The fast path** in the two launchers passes a call naming the canary on to Python.
- **The host-lock rule** reads as the lane asked: where `SOCOM_PC_ROOT` names a desktop tree with the lock script,
  heavy runs wait on it; a host without one has no lock (the rule already allows there).

### 4.4 The gate (Port)

`bash workflow/gate.sh` runs what the removed workflows ran (read from `eea27ed3^`): `npm run typecheck`; the three
suites (`@s2u/socomlegacy`, `shared`, `landing`) with the worker cap; `npm run build`; `python -m unittest discover -s
workflow/tests -t .`; `python -m workflow.release.leakcheck all`; gitleaks when its binary is present. `--e2e` adds
the browser specs; `--no-data` unsets `SOCOM_DISC`, `SOCOM_ISO` and `SOCOM_PC_ROOT` to reproduce the data-free
runner CI was; `--ci` starts with `npm ci`. On a host with the desktop's lock it reads the lock first and applies
the host rule itself (a heavy run inside a script is invisible to the tool-call hook).

**Its record** (New, small): the tree's hash and whether it was clean; each step's exit; per suite the tests passed,
failed and **skipped**; which prerequisites were present; each step not run, by name (`gitleaks: NOT RUN, no
binary`). Printed, and written under the git-ignored `logs/gate/`. The record is what a pull request's "Tests run"
and a plan's Log quote. A skipped tier is thereby said, not silent.

### 4.5 Setup, the check, and the desktop reference

- **`workflow/setup.sh`** (Fix): says Python is required (the hooks refuse without it); offers `npx playwright
  install chromium`; prints Codex's two one-time steps (trust this clone's path; approve the hook in `/hooks`) and
  the canary; ends by running the doctor.
- **`workflow/doctor.sh`** (New, read-only, `python -m workflow.tools.doctor`): one line per prerequisite of section
  6 -- present or missing, and what a missing one costs -- in the tiers *guards*, *build and test*, *data*,
  *evidence*, *optional*; the trust entry for this clone when a Codex configuration exists; how many commits the
  pin is behind `socom-unzipped`'s `main` (when the network answers; otherwise it says it did not look). Exit 1 only
  when the *guards* tier is not whole.
- **`socomlegacy/docs/SETUP.md`** (New, a document): sections 5 and 6 of this page as the newcomer's page -- each item,
  why, how to get it, who provides it; the package's unpacking (section 4.6). README, CONTRIBUTING and TESTING link
  to it instead of each telling part of it.
- **The desktop reference stays a submodule** (RS.R1). Its pin moves by `git submodule update --remote ref/desktop`
  and a commit of `ref/desktop`, by a controller at a sprint's open and close and whenever a task needs a desktop
  fact newer than the pin (written into `web-sprint` and `derive-from-desktop`). A citation `desktop@<sha>:path:line`
  stays valid after a bump: the old commit remains in the submodule's history. Vendoring the tree instead was
  weighed and refused: 84 MiB of tracked files re-added at each refresh, all of it under the leak check at every
  push, and editable by accident.

### 4.6 The handoff package (New, the owner's request)

`python -m workflow.tools.handoff_package --out <dir outside any clone>` builds, on the owner's host, one zip and
two lists. It is run by the owner's sessions, never by a gate, and it sends nothing.

**What goes in, by an explicit list (`workflow/handoff/include.json`), nothing by default:**

| Group | From | Lands on Chris's host as |
|---|---|---|
| The whole decompilation export (`game/analysis/`: the ELF's, SCUS's, DNAS's and 989SND's `.decomp.c`, functions and strings) | `SOCOM_PC_ROOT` | the same path under his `SOCOM_PC_ROOT` |
| Every capture the golden manifest names (`socomlegacy/docs/parity/golden-manifest.json`: the git-ignored ones under `logs/parity/`) and every `logs/parity` path a test reads | `SOCOM_PC_ROOT` | the same |
| The parity archive's captures the manifest names | `SOCOM_PARITY_ARCHIVE` | a folder his `SOCOM_PARITY_ARCHIVE` names |
| The landing site's owner-only goldens and images; the built `libmpeg2.wasm` when the host has one | the owner's web clone | the same path in his clone |
| A `README` | written by the tool | how to unpack: clone the public `socom-unzipped`, unpack the desktop part over it, set the two variables, run the doctor |

Not in the package, and said in its README: the disc and the ISO (he has his own; `extract-maps` makes the maps and
the remaining fixtures from it), the toolchains and the external clones (public downloads; the README gives each
one's source and commit).

**What never goes in:** anything not on the list. For the record that means credentials, tokens, keys and
environment files, the server's database and operations folder, the private notes, any session or agent
configuration, and every log outside the named captures.

**The screen for what could harm the owner personally.** The leak rules (`workflow/release/leakrules.py`: identities,
home paths, addresses, key material) run over every text file going in. A hit is redacted **in the copy, on its own
line** -- line counts never change, because the decompilation is cited by line -- and listed. Binary files that can
hold personal data (memory dumps, memory-card saves, saved network configurations) cannot be scanned that way: each
is listed by name with what it may hold, for the owner's eye.

**The output:** `redotcom-handoff-<date>.zip`; `MANIFEST.txt` (path, bytes, sha256, group); `REVIEW.txt` (the
redactions; the binaries to look at; anything the list named that was absent). **Sending it is the owner's**
(a `HUMAN_TASKS` row): the owner reads `REVIEW.txt` first.

### 4.7 Out of local memory (Move)

| The rule | Goes to |
|---|---|
| Every parity record names which image the emulator actually ran (one PCSX2 instance boots the patched image from its card) | `socomlegacy/docs/HAZARDS.md` sources; `DATA_SOURCES.md` |
| Commits taken from licence-compatible projects carry credit (`cherry-pick -x`, or a co-author line and the source hash; notices kept); unlicensed sources are facts only | root `CONTRIBUTING.md`; `COLLABORATION.md` |
| Fix at the root, for every map it touches; a per-map workaround is not a fix | `AGENTS.md`, "How to work" |
| Concluding a `--no-commit` merge: each later edit is staged by path first, `git status` read, then the bare commit | `web-sprint`, the merge step |
| An agent that reports done while its background work still runs is not dead: read its tree, then ask it; never a second agent in the same tree | `web-sprint`; the Claude specifics in `CLAUDE.md` |
| An agent silent beyond the brief's time with no write and no child process is stopped and re-dispatched with the cause in the new brief | the same |
| When another session ran out of usage, read its worktree's log and status before assuming loss; never commit in a tree whose agent may live | `web-sprint`; `socomlegacy/docs/HAZARDS.md` git |
| Git goes through the guarded shell tool | closed by the Port in section 4.3, not by a sentence |

And one rule for both seats, in `AGENTS.md`: **nothing durable lives only in an agent's private memory** -- a ruling,
a correction or a convention learned in a session is written into the repository in that session.

### 4.8 The stale text (Fix)

The items of section 2.5 not already covered: `SECURITY.md` rewritten for this repository's paths;
`socomlegacy/CONTRIBUTING.md`'s pointer; the CI paragraphs of `TESTING.md` and `README.md` replaced by the gate;
`AGENTS.md`'s "the git hooks and CI".

## 5. What is needed, and from whom

**From the owner:**

1. **Send the handoff package** after reading its `REVIEW.txt` (section 4.6). Without it Chris has no decompilation
   to cite or re-read and no capture to score against.
2. **The merge.** This pull request changes the rules themselves; it is merged on the owner's word, by his Claude
   controller session, as every major merge into `main` is (section 4.3).
3. **Know what `main` has no wall for.** The repository has no branch protection and no CI. The new `pre-push` rule
   is local to each clone and each developer can disable his own hooks. The checks that cannot be skipped by the
   author are the ones the merging controller runs (the gate on the head, the leak check over the range).
4. **The reference follows only what is pushed.** The pin can move to `socom-unzipped`'s `main`; desktop work on a
   local sprint branch reaches Chris when that branch is merged and pushed.

**From Chris, once per clone:** `bash workflow/setup.sh`; trust the clone in Codex and approve the hook; run the
canary; `npx playwright install chromium`; `SOCOM_DISC` and `SOCOM_ISO` set and `npm run extract-maps
--with-streams`; unpack the package and set `SOCOM_PC_ROOT` and `SOCOM_PARITY_ARCHIVE`; optionally gitleaks, ffmpeg
and Emscripten.

## 6. What is lost without each piece of setup

Counts are static (files that name the prerequisite); the gate's record gives the real ones per run.

| Missing | What is lost | Loud or silent |
|---|---|---|
| nothing -- a clone, `setup.sh`, Node 22+, Python 3.10+ | nothing of this tier: the typecheck, the unit and fixture tiers, the document tests, the build, the guards' tests and the leak check run; they hold 606 of the parity registry's 638 entries | -- |
| Python | every commit and push is refused; the guards' tests cannot run | loud |
| `setup.sh` not run | no git hook at all: no leak check, no subject cap, no push rule | **silent** -- the doctor and the canary's message say so |
| Codex trust and hook approval | every tool-call refusal, for Codex | **silent** but for a start-up warning -- the canary catches it |
| the `ref/desktop` submodule | the desktop's reference frames, research and tools; the landing story's tests | silent |
| the disc tree (`SOCOM_DISC`) | 96 test files skip; no extracted maps, so no browser spec and no page on real maps | silent, except the browser run |
| the ISO (`SOCOM_ISO`) | 10 test files, the movie specs among them | silent |
| the Playwright browser | every browser spec | loud |
| the captures (the package) | every score against the original running -- 15 test files, 127 golden-manifest captures: the whole *proven* tier | silent |
| the decompilation export (the package) | deriving behaviour from the game's code; a reviewer re-reading a `FUN_<addr>` citation at its source -- without it his code readings stay "reading, pending review" until a session that has it re-reads them | no test; a process gap |
| `libmpeg2.wasm` (Emscripten, or the package's copy) | movies in the page; 8 test files | silent |
| ffmpeg | the landing site's sounds; one disc-backed movie test | silent |
| the gitleaks binary | the second scanner at push | silent -- the gate's record says NOT RUN |
| the desktop's lock script | nothing: it is the owner's host's rule only | -- |

## 7. How it is verified

- **Each guard has a planted test first** (`unittest` under `workflow/tests/`, as the existing ones): the `pre-push`
  rules in a throwaway repository with a linked worktree; the PowerShell cases ported with the desktop's tests; the
  Codex payloads; the canary refused by `decide()` and, unguarded, exiting 1; every cited home existing;
  `sync_agents --check`; the doctor and the package builder against a planted tree (the builder's test plants a
  credential, a home path and an unlisted file and requires none of them in the zip, and the redacted file's line
  count unchanged).
- **The document rules** in `socomlegacy/tools/test/conventions.test.ts` (section 4.1), with the existing link and
  corpus tests.
- **The live Codex check** (allowed by the owner, "a few short runs"): in a scratch clone outside every working
  tree, with the Codex binary this host's editor extension carries -- the project trusted, the hook approved, then a
  short run asked to issue `git add -A` and the canary. The payloads it shows are saved as the planted tests'
  inputs; the result goes in the plan's Log. If the extension's binary cannot run headless, that is recorded and the
  first live proof is the canary on Chris's host.
- **The gate itself** on the finished branch, its record in the plan's Log.
- **Not verifiable here:** Codex cloud (documented to honour only `AGENTS.md`, skills and an install script);
  Chris's own machine, until he runs the doctor and the canary.

## 8. Limits, and what the owner may strike

- The Codex hook is a guard against slips, not a wall (section 2.1's three limits). The canary makes "off" visible
  to a session that runs it; a session that does not run it is caught only at the merge.
- The New items, each removable without touching the rest: the `pre-push` rules for shared branches and linked
  worktrees; the plain-push-to-`main` refusal (kept on the owner's word, with its override); the canary; the gate's record of skips; the doctor; the handoff
  package tool; the plan template.
- Left out on purpose: a merge-time checker and a `gh pr merge` refusal (the merging controller runs two existing
  commands instead); a trailer-form check (the form is documented); a pin-bump script (one git command); the
  desktop's document-maintenance and rulings tools (the owner's choice); Codex command rules (experimental, evaded
  by a redirection).

## 9. Delivery

One branch, `agent/codex-parity`, from `main` at `cd24d9ec`; one pull request; merged on the owner's word by his
Claude controller session. By
agreement with the web lane's controller (2026-10-03) that lane holds the files this work owns -- `AGENTS.md`,
`CLAUDE.md`, both `CONTRIBUTING.md`, `COLLABORATION.md`, `.claude/skills/`, `.claude/agents/`, `.agents/`,
`.codex/`, `workflow/`, `conventions.test.ts`, `SETUP.md`, HANDOFF section 5's rules 15 and 20 -- and merges `main`
into `agent/online` after this lands; it keeps HANDOFF sections 2, 3 and 7 and the host's migration onto `main`,
and reviews pull request #10. The owner rows this work adds take the next free numbers at the merge (H80-H84).
