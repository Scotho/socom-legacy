# Contributing to SOCOM Legacy

SOCOM Legacy ports SOCOM U.S. Navy SEALs II to the browser one to one. Parity with the original is the bar, and
validation is how sure we are of it. This page is what a contributor needs; the first rule decides most reviews.

## Where to send a change

A pull request to this repository, from a branch here or from your fork; one feature or fix per pull request. **Base
it on the latest release tag**: the newest `v*` tag (`git tag --sort=-v:refname | head -1`), not `main`, which can sit
ahead of the tag after a merged pull request. If a release lands while yours is open, rebase onto the new tag
before the review, so the review reads your change against the code it will land on. Questions before you start, or
an area you want to work on: ask on [Discord](https://discord.gg/RrtTEdvECV).

## The parity rule

The whole rule is [`socomlegacy/docs/MISSION.md#the-parity-rule`](socomlegacy/docs/MISSION.md#the-parity-rule). In short:

- **The original is the specification.** Nothing is invented, tuned by feel or "improved"; if the original does it,
  the port does it, quirks included.
- **Every value and behaviour in the game's own path names its source**: the disc's data through the repository's
  readers (the file and the field); the game's code cited as `FUN_<addr>` and `D:L<line>` of your own decompilation
  of your own disc -- **cited, never pasted**; or a capture or trace of the original running. "Copied from a disc
  map" is a fine source, but show it: read it through the repository's readers in a test, don't paste the numbers.
- **An unknown is named, never guessed**: a `*_READING` or `*_PLACEHOLDER` constant, listed in its research note
  (`socomlegacy/docs/research/`). The placeholder ledger that refuses an unlisted name runs in the working repository
  when your pull request is imported, so list every name you add.
- **Say how sure you are**: **proven** (measured against the original running), **reading** (transcribed from the
  code or the disc, re-read by a reviewer) or **placeholder** (not read yet), for each value you add.
- **A browser adaptation** with no original (keyboard, mouse, touch, an editor, a developer switch) is labelled as one
  and never changes what the game does. A preference the original does not support goes in the pull request for the
  maintainers, not into the code.

## The Forge

The Forge's interface belongs to its contributor-owner (the maintainers' ruling of 2026-11-07): editor keys, docks,
tabs, gizmos and looks are theirs to shape, and a change there is reviewed as an adaptation. What a placed object
does in Play -- a door, a spawn, an objective, a rule -- is game behaviour under the parity rule, with its source.

## What review checks

- `npm run typecheck` clean, and `npm test`, `npm run build` and the browser specs (`npm run e2e -w @s2u/socomlegacy`)
  green **on the final commit** of the pull request, not an earlier one -- paste the runs; a skipped test is said,
  never a pass.
- A failing test first: the red run and the green run in the description.
- No `any`. Forge tests that mount the real page take a 90 s timeout (their cold import is slow).
- A test that pins source text sits beside the code it pins, and moves with it.
- Every new value with its citation and level.
- The tests a feature needs: a round trip (save, load, equal) for every new layout field; the online path's refusals
  for anything a client sends; and "a disc map plays exactly as before" for anything that touches a map's load or Play.

## How a pull request lands

This repository is published from the project's private working repository, one release at a time. Your pull request
is reviewed here and merged once accepted. It is then imported onto a private branch with your commits and authorship
intact (each commit gains an `Imported-From: <repo> <sha>` trailer), run against the parts the export does not carry
(the central and match servers), and landed after our full verification run: typecheck, tests, build and the browser
specs. Fixes the maintainers make land on top, under their own names, and the next release's export brings the final
form back here.

## Never in a pull request

A file of the disc, an extracted map, game data of any kind, a capture, decompiled text, pack art (HD textures,
models, sounds from a pack), a credential, a token, a key, an environment file, or personal data (a home path, an
e-mail address). Code from elsewhere only from licence-compatible projects (GPL-3.0, LGPL, permissive), with its
credit and notice kept.

## Your first contribution

Follow the README's Quickstart, load your disc and play a round offline; open `/testroom` to see any map under its
diagnostic views. Then pick an issue labelled `good first issue`, or a `_PLACEHOLDER` in an area you like: its
research note says what is known and what would settle it. Read the value from the original, write the test that
fails with today's value, make the change with its citation, and open the pull request; the template asks for the
source, the level and the runs. Stuck? Ask on [Discord](https://discord.gg/RrtTEdvECV).

## Licence

Contributions are accepted under GPL-3.0 ([`LICENSE`](LICENSE)). Everyone here follows the
[code of conduct](CODE_OF_CONDUCT.md).
