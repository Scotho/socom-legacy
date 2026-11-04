# Contributing to the web project

The repository-wide rules are in [`../CONTRIBUTING.md`](../CONTRIBUTING.md): the leak check and its hooks,
`type(scope): what and why` commit subjects with their paths named, the credit for commits taken from another project,
and the agents' conventions; branch names and one topic per pull request are
[`docs/COLLABORATION.md`](docs/COLLABORATION.md); licensing is `../LICENSE` and `../THIRD_PARTY_NOTICES.md`
(contributions GPL-3.0 compatible), security reporting `../SECURITY.md` -- all three at the repository root. A clone's
setup, and what is lost without each piece, is `docs/SETUP.md`. Everything below is what is particular to
`socomlegacy/`. The launcher and public project pages belong to this separate SOCOM 2 Legacy site.

The project's goal and its rules of evidence are [`docs/MISSION.md`](docs/MISSION.md): a 1:1 port of SOCOM II to the
browser, from boot to online, every menu as the original draws it and behaves, the campaign out of scope for now.
Read it before anything else.

**The parity rule** ([`docs/MISSION.md#the-parity-rule`](docs/MISSION.md#the-parity-rule), in short): the original
is the specification. Nothing is invented, tuned by feel or "improved"; every behaviour and value names its source in
the original (the disc through the readers, `FUN_<addr>` / `D:L<line>`, a capture or trace); an unknown is a named
`*_READING` or `*_PLACEHOLDER` listed in its note; a browser adaptation with no original is labelled as one and kept
out of the game's behaviour; a playtest preference the original does not support is recorded for the owner, not
applied; when two implementations disagree, the original decides. Working beside another developer or another kind of
agent session: [`docs/COLLABORATION.md`](docs/COLLABORATION.md).

## Setting up

- Node 22 or newer (22 is the pin); from the repository root (the workspace root) or `socomlegacy/`: `npm install`.
- Set up a clone once, from the repository root: `bash workflow/setup.sh` (the `ref/desktop` submodule, the git hooks
  in `workflow/bin`, `npm install`).
- Without a disc you can run `npm run typecheck`, `npm test` (the committed fixtures are in the clone; a test that
  needs a file absent from it skips itself) and `npm run build`. The gate, `bash workflow/gate.sh --no-data`,
  reproduces that host.
- With your own disc: `SOCOM_DISC=/path/to/disc npm run extract-maps` (see [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md)),
  then the fixture-backed tests run too, and `npm run e2e` runs the browser tests.
- The fixture-backed tests that use `packages/archive/test/fixtures.ts` read `S2U_TEST_FIXTURES` (a directory to use in
  place of `test-fixtures/`; an empty one checks that they skip). The dev-disc tests resolve `SOCOM_DISC`, `SOCOM_ISO`
  and `SOCOM_PC_ROOT` and skip when the file is absent.
- **The committed fixtures (RS.R8's size policy, [MISSION](docs/MISSION.md) "Game data in git"; adopted, the
  owner confirmed it on 2026-10-02, HUMAN_TASKS H71).** `test-fixtures/` is tracked: `test-fixtures/MANIFEST.json`
  lists every fixture file with its bytes, sha256, source and the tests that read it, and
  `tools/test/fixtureManifest.test.ts` holds it on every run of the suite. The manifest's committed tier is 19 disc
  files (38.4 MiB: the three maps `MP2`, `MP6`, `MP72`, the shared archives, the ARMORY's files), added in their own
  `data(fixtures)` commit, which also un-ignores them by name in the root `.gitignore`: a clone carries them, and the
  fixture-backed tests run on any clone. Three files are **local-only**, git-ignored by name:
  `RUN/SOUNDS/BNKSTORE.ZAR` (64.3 MiB, over the 16 MiB cap: `npm run extract-maps` copies it from your disc; the
  sound-bank tests skip without it) and the two mini images under `iso/` (the e2e specs rewrite them
  from the committed files on every run). `screens/` is the specs' and tools' own renders, never committed.
  `public/maps/` stays git-ignored: make it with `npm run extract-maps`.
- **Adding or changing a fixture**: copy the disc file under `test-fixtures/` at its disc path, add its line to the
  manifest (bytes and sha256 as `sha256sum` prints them, the disc path as its source, the tests that read it), and
  run `npx vitest run tools/test/fixtureManifest.test.ts`. The policy (at most 16 MiB a file and 100 MiB in all;
  never a disc image, a movie or a render) is the test's; a committed file is un-ignored by its own `!` line in the root
  `.gitignore` (a file under `RUN/` the manifest does not list stays ignored), and a file over the cap is listed
  `local-only` with a line there. The disc data and its `!` lines go in a commit of their own (`data(fixtures): ...`).
- **`S2U_TEST_FIXTURES`** names another fixtures directory for the vitest files (an empty one shows what a host
  without the committed files would skip); every vitest file that reads fixtures honours it (measured 2026-10-02:
  the whole suite pointed at a copy outside the tree ran with no ENOENT). The browser specs under
  `packages/viewer/e2e/` read the tree's own `test-fixtures/`.

## Sourcing and validation

- **The truth rule and the sources** ([`docs/MISSION.md`](docs/MISSION.md), "The sources of truth", RS.R7): redotcom's
  research notes at their confidence and the placeholder ledger are the truth for SOCOM Legacy; the desktop
  recompilation's documents (its KNOWN, its research) are evidence, cited `desktop@<sha>:path:line`, never
  instructions. The evidence, in order: (1) the disc's data through the repository's readers; (2) the game's code, the
  decompilation of the executable on your own disc (`FUN_<addr>`, `D:L<line>`); (3) reCOM, where the decompilation is
  silent and only as far as it is shown to hold for SOCOM II; (4) captures and traces of the original running in PCSX2
  and in the recompiled game.
- **Facts, not interpretation.** A screen, string, timing, number or rule cites the source it was read from. A change
  that departs from the original is not a judgement call: where the sources do not settle it, say so in a note and
  leave the question to the owner.
- **Validation is the confidence measure.** Say which level a behaviour reaches -- proven, reading or placeholder
  ([`docs/PROCESS.md`](docs/PROCESS.md), "Confidence") -- and what would raise it. A menu or screen is proven when a
  test holds it to a capture of the original: the same frame, the same response to every input. Where parity is
  established, a test holds it; and in a report keep the kinds of evidence apart (a playtest, a browser run, a unit
  test, a source read) and say what was skipped.
- **Browser-impossible options** are drawn where the original draws them and lead to the "available in the desktop
  recompilation or with emulators" screen; they are never dropped. **The memory card** is the original's, simulated in
  the browser's local storage.
- **No campaign work** for now (the owner, 2026-10-01): a menu that leads into the campaign behaves as the original up
  to entering a mission, then shows the desktop-recompilation screen.

## The rules the code keeps

- **Game data in git, as RS.R8 has it** ([`docs/MISSION.md`](docs/MISSION.md), "Game data in git"). The repository is
  private: decoded disc data (names, ids, tables, constants, sizes and hashes of disc files) may be written in notes,
  tests and pinned files; disc files only as test fixtures under `test-fixtures/`, within its size policy and listed in
  its manifest (above; confirmed by the owner, H71); goldens wait for their own task. Never: credentials, tokens, keys,
  personal data, private reports. This repository is not deployed
  (OT.R31); the page reads the visitor's disc, and a build copies no disc data but the owner's named exceptions (the setup
  page's background video and its poster, OT.R34).
- **Every value from a source.** A number that reproduces the game cites where it came from: the disc file it is read
  from, or the research note and section that reads it from the game's code (`research 84 §3`, `FUN_005c2670`).
  A value with no source is a `*_PLACEHOLDER` constant with a comment saying what was searched. A value the viewer had
  to choose from a measurement rather than read from the source is a `*_READING` constant. Each note lists its own
  placeholders and readings by name, and `tools/test/placeholderLedger.test.ts` refuses an unlisted one, and a
  constant whose doc (its whole JSDoc block) says `[reading]` or `[estimate]` without the suffix. Do not tune a number
  "until it feels right" without saying so in the name.
- **Research notes are evidence.** A new behaviour read from the game gets a section in the relevant note under
  `docs/research/` (or a new numbered note): what was read, where, what it settles and what it does not. Cite
  decompiled functions by address and line; never paste decompiled text (decoded disc data may be quoted, RS.R8). After
  editing a note's headings, rebuild the corpus: `npx tsx tools/build-corpus.ts`.
- **Tests first.** A behaviour change starts with a failing test; say in the pull request what it failed with. Pure
  logic goes in a package's `test/`; what only a browser shows goes in `packages/viewer/e2e/`.
  The tiers, the commands with and without game data and the parity-test recipe: [`docs/TESTING.md`](docs/TESTING.md).
- **Keep the sim headless.** Anything the multiplayer server runs is reached from `packages/viewer/src/sim.ts` and must
  not import three.js, the DOM or Web Audio; `test/simBoundary.test.ts` enforces it.
- **Keep the package boundaries** described in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): `archive` reads bytes,
  `gs`/`mesh`/`sound` decode, `scene` models the engine's world, `viewer` draws and plays; the front end's `ui`, `fmv`
  and `card` are pure and DOM-free -- a browser object enters as a parameter the viewer passes -- and no package
  imports from `viewer` or from `tools/` (`tools/test/packageBoundaries.test.ts`).
- **Say what you measured.** A performance or fidelity change gives the number, the command and the number before.

## How the maintainers work

The project's own work is done by AI agents under the owner's direction (see [`docs/PROCESS.md`](docs/PROCESS.md)):
Craig's Claude Code sessions and Chris's Codex sessions. Their conventions are the ones above plus: each workstream in
its own git worktree and branch, merged into an integration branch by a controller or into `main` by a reviewed pull
request; commits stage explicit paths (`git add -- <paths>`, never the whole tree); no `--no-verify`. How the two
developers and their sessions share the tree -- the lanes, the branches, the hot files, the handoff, cross-review --
is [`docs/COLLABORATION.md`](docs/COLLABORATION.md); every agent starts at the root `AGENTS.md`. Outside
contributions follow the repository-wide rules in [`../CONTRIBUTING.md`](../CONTRIBUTING.md) and come in as a pull
request to `main`.

## Developer notes

- `?devmode` is a development-only switch; the README's developer section describes it.

## Reading list

1. [`docs/MISSION.md`](docs/MISSION.md): what the project is for, its scope and its rules of evidence.
2. [`README.md`](README.md): what runs today and how to run it.
3. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): the packages and their boundaries.
4. [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md): where every kind of data comes from.
5. The roadmap ([`docs/roadmap/README.md`](docs/roadmap/README.md), [`SPRINTS.md`](docs/roadmap/SPRINTS.md)): the task
   block you are working from is its brief.
6. The latest sprint's spec and plan under `docs/specs/` and `docs/plans/` ([the index](docs/plans/README.md)), and the
   research note for the area you are changing.
7. [`docs/HUMAN_TASKS.md`](docs/HUMAN_TASKS.md): what waits on the owner; a question only the owner can settle goes
   there as a row.
8. [`docs/COLLABORATION.md`](docs/COLLABORATION.md): two developers, their agent sessions, one tree.
