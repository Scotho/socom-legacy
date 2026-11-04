# AGENTS.md -- the rules for an agent working in SOCOM Legacy

This repository is the browser client of a 1:1 port of SOCOM U.S. Navy SEALs II (PS2, US) to TypeScript and three.js.
The rules below bind any coding agent (Claude Code, Codex, others) working here; [`CONTRIBUTING.md`](CONTRIBUTING.md)
is the same for people.

## The parity rule (above all others)

`socomlegacy/docs/MISSION.md#the-parity-rule`. In short:
- **The original is the specification.** Nothing is invented, tuned by feel or "improved".
- **Every behaviour and value names its source in the original**: the disc's data read through the repository's
  readers; the game's code cited as `FUN_<addr>` and `D:L<line>` of the decompilation (**never pasted**); or a capture
  or trace of the original running.
- **An unknown is named**, never guessed: a `*_READING` or `*_PLACEHOLDER` constant, listed in its research note
  (`socomlegacy/docs/research/`). The placeholder ledger refuses an unlisted one; it reads sources that stay in the
  project's working repository, so it runs there, on every contribution as it is applied -- not yet in this one.
- **A browser adaptation** with no original is labelled as one and never changes the game's own behaviour.
- **A preference the original does not support is reported, not applied.**
- **When two implementations disagree, the original decides**, not the author.

Each claim is at one confidence level -- **proven** (measured against the original running), **reading**
(transcribed from the code or the disc, unit-tested, re-read by a reviewer who did not write it), **placeholder** (a
named constant in the ledger) -- and a report keeps the kinds of evidence apart (unit test, disc-backed test, a
rendered browser run, a capture comparison, source inspection), never merged into one "pass".

## How to work

1. **Test first**: a failing vitest test, then the change; report the red and the green. Disc-backed tests read
   `SOCOM_DISC` and `SOCOM_ISO` and skip without them: a skip is said, never counted as a pass.
2. **Fix at the root, for every map it touches.** A per-map workaround, or a switch that forces a code path, is not
   a fix.
3. **Commit by path** (`git add -- <paths>`), never `git add -A`; a subject of at most 120 characters; name the agent
   and model in a `Co-Authored-By` trailer.
4. **Never commit**: a file of the disc, an extracted map (`socomlegacy/public/maps` is git-ignored), a capture,
   decompiled text, credentials, tokens, keys, environment files, personal data (home paths, e-mail addresses).
5. **Before you finish**: `npm run typecheck`, `npm test`, and `npm run build` for a change the page draws -- quote
   the counts, the skipped tests included.

## The layout

- `socomlegacy/packages/` -- the client: `viewer` (the page), `ui`, `scene`, `sound`, `mesh`, `gs`, `archive`, `fmv`,
  `card`, `creator-contracts`, `forge-agent-protocol`, and `match`'s browser half (the room, bots, hostages, replay
  format; the server's process is not in this repository).
- `socomlegacy/tools/` -- the disc tools and their tests. `socomlegacy/docs/` -- MISSION, PROCESS, DATA_SOURCES, the
  research notes, the specs, the roadmap. `shared/` -- the design system and fonts.
- References in notes and comments to plans, numbered rulings, `ref/desktop`, `SOCOM_PC_ROOT` or `agent-mail` point
  at the project's working repository or the desktop recompilation; they are evidence trails, not files you need.
