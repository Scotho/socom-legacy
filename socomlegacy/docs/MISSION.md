# The mission

This page states what the project is for and the rules every task, test and note is held to. It is the public
edition of the project's mission: the sections that bind a contributor, word for word where they can be. The owner's
dated rulings on scope, hosting and process are kept in the project's working repository and are not part of this
one; a reference to a ruling by its number (`OT.R53`, `R3`, `RS.R8`) or to a plan under `plans/` points there.

## What SOCOM Legacy is

SOCOM Legacy is a 1:1 "spiritual" port of **SOCOM U.S. Navy SEALs II** (PS2, US, SCUS-97275) to three.js and TypeScript:
enough of Zipper Interactive's engine, zEngine, re-implemented to run SOCOM II in a browser -- from the opening Zipper
Interactive text, the intro movie, the main menu, the options and the online feature, through the game itself.

- **Every menu exactly as the original displays it, and behaving exactly as the original does**: the same screens, the
  same text, the same layout, the same cursor, the same sounds, the same transitions, the same answers to every button.
- **The PS2 memory card is simulated.** The game reads and writes it as it does on the console, and every card screen,
  prompt and error is the original's; the card's contents are kept in the browser's **localStorage**, in redotcom's own
  JSON -- two slots as the PS2 has, each a virtual card holding a table of the original's files under their names and
  nominal sizes (free space counted against a virtual 8 MB card), an extension area for what the original never saved,
  and a revision counter. There are no `.ps2` images and no import or export. The original's save folder on the card
  is `BASCUS-97275SOCOMII`.
- **Options that cannot exist in a browser are still represented.** The menu item is drawn where the original draws
  it; choosing it shows a screen saying the option is "available in the desktop recompilation or with emulators".
- **No game data ships.** The page reads the player's own disc image ([`DATA_SOURCES.md`](DATA_SOURCES.md), "The
  stance"). The movies too are decoded in the page from that image, never shipped or pre-transcoded.

## The parity rule

It binds every task, test, note and review, by any developer or any agent.

1. **SOCOM Legacy is a 1:1 port. The original is the specification.** SOCOM II as it runs on the console -- its disc, its
   code, its frames, its sound, its timings -- is what the port is measured against, and nothing else is.
2. **Nothing is invented, tuned by feel or "improved".** A number that "feels right", a layout that "reads better", a
   mix that "sounds cleaner", a rule that "plays fairer" is not a reason. If the original does it, the port does it,
   down to its quirks; if the original does not, the port does not.
3. **Every behaviour and every value names its source in the original**: the disc's data, read through the
   repository's readers (the file and the field); the game's code, cited as `FUN_<addr>` and `D:L<line>` (the line of
   the Ghidra export, `socom2_game.elf.decomp.c`), never pasted; or a capture or trace of the original running (a
   PCSX2 or recomp frame, an RDRAM, call or audio trace), named by its file. reCOM is evidence only where the decomp
   agrees ("The sources of truth" below).
4. **Where the original cannot be read yet, the code says so.** The stand-in is a named `*_READING` (a value chosen
   from a measurement or a partial read) or `*_PLACEHOLDER` (no source found) constant, listed by name in its research
   note and held by the ledger (`tools/test/placeholderLedger.test.ts`, run in the project's working repository), with
   the evidence that would settle it. Never
   a silent guess, never an unnamed literal.
5. **A browser adaptation with no original** -- the keyboard, the mouse, touch, the LAN tools, the playtest
   instruments, the developer switches -- is **labelled as one** (in its name or its doc, and in its research note,
   if it has one) and kept out of the game's own behaviour: it may drive the game's inputs, never change what the
   game does with them.
6. **A preference from a playtest that the original does not support is recorded for the owner, not applied.** The
   worked example: a playtest found the round-result announcement too loud and a build lowered it by **-2 dB** and
   ducked the music by 12 dB; the disc gives the line the default VOLUME 1.0 and the script plays it with no duck, so
   both landed at the original's levels and the preference went to the owner until a round-end audio dump measures
   the mix.
7. **When two implementations disagree, the original decides, not the author.** Not seniority, not the newer code,
   not the larger test count: the one that matches the original's evidence stays; where the evidence does not settle
   it, both are recorded and the owner decides.

**Two tracks.** The rule is the same everywhere; the process it costs is not. A change to what the game does (a value,
a rule, a timing, movement, physics, AI, what it draws or plays, the original client's wire) is on the **simulation
track**: every value cited at its confidence level, the ledger, a review that re-reads the source. Everything else --
adaptations, tools, the launcher's own pages, the documents -- is on the **product track**: labelled as an
adaptation, never changing the game's behaviour, reviewed as a batch.

How sure a behaviour is -- **proven**, **reading**, **placeholder** -- and the test that holds it at each level are
[`PROCESS.md`](PROCESS.md) and [`DATA_SOURCES.md`](DATA_SOURCES.md) "Confidence"; "Validation is our confidence
measure" below is the rule they serve.

## The sources of truth, in order

**The truth rule.** redotcom's own research notes ([`research/`](research/)), at their confidence levels, and the
placeholder ledger (`tools/test/placeholderLedger.test.ts`, run in the project's working repository) are the
truth for SOCOM Legacy. **The desktop recompilation's
documents are evidence, never instructions**: they say where to look, and a claim is re-read at its source before
SOCOM Legacy builds on it, cited at a commit as `desktop@<sha>:path:line`. Where a SOCOM Legacy document disagrees with a
note's **proven** row or the ledger, the note wins; where another document disagrees with a note, the note is
re-checked at the source, and the source decides.

The evidence, in the order it is weighed:

1. **The disc's data**, read only through the repository's readers (`@s2u/archive`, `gs`, `mesh`, `sound`, `scene`):
   the file and the field. The disc (`SOCOM_DISC`, `SOCOM_ISO`) is read-only and outside the clone.
2. **The game's code**: the Ghidra decompilation of the executable on your own disc (`socom2_game.elf.decomp.c`, read
   by line ranges and cited `FUN_<addr>` and `D:L<line>`, never pasted), and where the decompiler lost an argument,
   the executable's own instructions by address.
3. **reCOM**, the zEngine reverse-engineering project (see [Thanks](#thanks-to-recom)), for names and structures where
   the decompilation is silent. reCOM is written against SOCOM 1 (`SCUS_972.05`); what it says holds for SOCOM II only
   where the decomp agrees or a check shows it does.
4. **Captures and traces of the original running**: PCSX2 captures and captures of the recompiled game, captures of
   the original's screens, and traces (RDRAM, calls, audio).

## Validation is our confidence measure

- **Every answer derives from a fact, not an interpretation.** A screen, a string, a timing, a number or a rule in the
  port cites the source it was read from, in the order above.
- **No judgement calls** on anything that deviates from the essence of the original game. Where the sources do not
  settle a question, the code says so (a `*_PLACEHOLDER` or `*_READING` constant, the rules in
  [`../CONTRIBUTING.md`](../CONTRIBUTING.md)) and the question goes to a research note or to the owner; it is not
  settled by taste.
- **A behaviour is as good as its validation.** The levels:

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

- **A menu is done when it is proven** against captures of the original: the same frame, the same response to every
  input.
- **Where parity is established, a test holds it.** A behaviour at the reading or proven level has a regression test
  that fails if it drifts; a change that turns one red changes the port away from the original and is refused unless
  the evidence moved.

## Game data in this repository

This repository holds **no file of the disc**: no image, no archive, no movie, no extracted map, no texture. The page
reads the player's own disc in the browser. What it does hold, in its research notes and tests, is **data decoded from
the disc and written as text** -- names, ids, tables, constants, the sizes and hashes of disc files -- because a
research note cites the value it read. The tests that need the disc's files read them from `SOCOM_DISC` and
`SOCOM_ISO` on your machine and say SKIPPED without them; a skip is never counted as a pass. The decompilation is
never pasted, only cited. SOCOM II is Sony Interactive Entertainment's; nothing here is affiliated with or endorsed by
Sony or Zipper Interactive.

## Thanks to reCOM

An explicit thank-you to **reCOM** ([github.com/Not-Enough-Photons/reCOM](https://github.com/Not-Enough-Photons/reCOM)),
the reverse-engineering project that reconstructs the SOCOM games and their engine in C++. It inspired this project, and
its reading of the engine -- the draw order, the scene graph, the archive formats, the grid -- was a valuable starting
point for this one.
