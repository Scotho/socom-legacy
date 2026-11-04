# Contributing to SOCOM Legacy

The client ports SOCOM U.S. Navy SEALs II to the browser one to one. Parity with the original is the bar, and
validation is how sure we are of it. The rules are short; the first one decides most reviews.

## The rules

- **The original is the specification** ([`socomlegacy/docs/MISSION.md`](socomlegacy/docs/MISSION.md), "The parity rule").
  Nothing is invented, tuned by feel or "improved". If the original does it, the port does it, quirks included.
- **Every value names its source**: the disc's data through the repository's readers (the file and the field); the
  game's code cited as `FUN_<addr>` and `D:L<line>` of the Ghidra export of the executable on *your own* disc --
  **cited, never pasted**; or a capture or trace of the original running. reCOM counts only where the decompilation
  agrees.
- **An unknown is named, never guessed**: a `*_READING` or `*_PLACEHOLDER` constant, listed in its research note
  (`socomlegacy/docs/research/`). The placeholder ledger refuses an unlisted one: it reads sources that stay in the
  project's working repository, so it runs there when your pull request is applied (not yet in this repository) --
  list every name you add in its note, and the review will say if one is missing.
- **Say how sure you are**: **proven** (measured against the original running), **reading** (transcribed from the
  code or the disc, re-read by a reviewer), or **placeholder** (not read yet). A pull request states the level of
  each value it adds.
- **A browser adaptation** with no original (the keyboard, the mouse, touch, developer switches) is labelled as one
  and never changes what the game does with its inputs.
- **A preference the original does not support** is written up in the pull request for the maintainers, not applied.
- **A failing test first.** vitest for the TypeScript. Put the red run and the green run in the pull request; a
  skipped test is reported as skipped, never as a pass.
- **No game data, no secrets.** Never commit a file of the disc, an extracted map, a capture, decompiled text, a
  credential, a token, a key, an environment file or personal data (a home path, an e-mail address).
- **Code from elsewhere** only from licence-compatible projects (GPL-3.0, LGPL, permissive), with its credit and its
  notice kept; an unlicensed source gives facts, never code.

## Your first contribution

A walk from a fresh clone to your first pull request:

1. **Get it running.** Follow the README's Quickstart, load your disc, and play a round offline. Open `/testroom`: any
   map, any mode, and its Settings panel's diagnostic views (collision, wireframes, lighting, fog).
2. **Pick something small.** Issues labelled `good first issue` are sized for a first change. Or pick a named unknown:
   search the code for `_PLACEHOLDER`, choose one in an area you like, and read the research note it names
   (`socomlegacy/docs/research/`). Each one says what's known and what evidence would settle it.
3. **Read the original.** Find the value on your disc (the repository's readers under `socomlegacy/packages/archive` and
   friends), in your own decompilation of the game (cite `FUN_<addr>` and the line, never paste the code), or in a
   capture of the original running.
4. **Write the test first.** A vitest test that fails with today's value and passes with the original's. Keep both
   runs for your pull request.
5. **Make the change.** Rename the constant from `*_PLACEHOLDER` to its real name (or `*_READING` if it's only partly
   read), cite the source beside it, and update its row in the research note.
6. **Open the pull request.** The template asks for the source, the confidence level and the test runs. A reviewer
   re-reads the source; expect "where does this come from?" first.

Stuck at any step? Ask on [Discord](https://discord.gg/RrtTEdvECV). Someone has been there before.

## A pull request

1. Branch from `main`; one feature or fix per branch.
2. `npm ci && npm run typecheck && npm test` green (say which tests skipped and why) and `npm run build` for a change
   the page draws.
3. In the description: what changed and why, the source of every new value with its level, the red and green runs,
   what you could not check.
4. Review is against the original: expect "where does this come from?" before anything else.

This repository is published from the project's working repository. A merged pull request is applied there with you
credited as its author, through the project's own checks, and comes back here with the next export, so your branch
may be closed rather than merged, with a link to the export that carries it.

## Licence

Contributions are accepted under GPL-3.0 ([`LICENSE`](LICENSE)).
