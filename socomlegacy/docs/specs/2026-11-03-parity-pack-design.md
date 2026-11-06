# The parity pack -- the emulator parity harness, packaged for a tester -- design

> Written 2026-11-03T04:45Z in the owner's seat against `agent/parity-pack` at `adb4e58fb` (`origin/main`). The owner's
> words (2026-11-03, this seat): "build a skill that creates a parity harness that contains: the entire psx2 setup we
> use for testing with the patch; a prebuilt socom legacy with developer mode type; our parity controller work; and a
> new GUI that gives options for: play or pause / record / save. Save will create a handoff of everything we need to
> then run that on our side for our own purposes. It should be as easy for them as unzipping the pkg, dropping the
> iso into the folder, and opening the GUI for the playtest." And: "they have to send me the file(s) after. but thats
> it"; "handle this to completion autonomously. I trust your judgement." Every choice below not quoted from him is
> the seat's call, marked **(call)**. Product track (OT.R53): a validation instrument and its packaging, an adaptation;
> nothing here changes what the game does. The harness it packages is EPH
> (`2026-10-30-emulator-parity-harness-design.md`; `tools/eph/`; the `eph-parity` skill).

## 1. Intent

A person who is not a developer -- a tester with their own SOCOM II disc image and their own PS2 BIOS dump -- unzips
one folder, drops the two files in, double-clicks one thing, and plays the original (in PCSX2, with the r0004 patch,
as we test it) and SOCOM Legacy (a development build, `?devmode` instruments in) side by side with one controller
driving both: EPH's live mode. A GUI on top offers **Play / Pause**, **Record** and **Save**. Save ends the session and
writes one zip -- the two sides' per-frame records, the clips, the session's inputs as a replayable script, the system
facts -- which the tester sends back. On our side that zip is read by EPH's own analyzer (`tools/eph/analyze.ts`) and
replayed by `run.ts --script`, exactly as our own runs are: a tester's session is a capture comparison in the hunt's
own format, no new reader needed.

The skill, `parity-pack`, is the procedure and the one command that **builds** the package on the owner's host from
what the host already has: the desktop checkout's PCSX2 (as the EPH run directory holds it: the harness's `[Pad1]`,
the r0004 memory cards, the saved states), the page built as a development build, the harness's code bundled, a Node
runtime and ffmpeg. It is also the reader's side: what comes back and how to read it.

## 2. Goals, non-goals, anti-goals

**Goals**
- One zip for a tester on Windows 10/11 with an Xbox-class pad. Three steps: unzip, drop in the `.iso` (and the BIOS
  dump), open the GUI. No install, no npm, no PATH, no account.
- The original as we test it: PCSX2 2.8.2 portable, the harness's settings, **r0004** by default (OT.R97: the
  gameplay spec), r0001 selectable; the conditional DNAS-bypass pnach; the saved starting state per build.
- SOCOM Legacy as a development build (`NODE_ENV=development`, minified, `?devmode` instruments in: OT.R47's nightly
  recipe), served locally from the folder, its maps extracted from the tester's own image on first run.
- EPH live mode as it is: one physical pad, both clients, the same translation, the per-frame records on both sides,
  the side-by-side video, `live.script`.
- A GUI with four actions and nothing a tester must understand about ports, states or PINE.
- Save = one zip the tester sends; our side reads it with the tools we already have.

**Non-goals**
- Linux or macOS packs (EPH's orchestrator is Win32: PostMessage, gdigrab, taskkill).
- A tester-side analysis or score. The pack records; we read.
- Changing the harness's measurement, its translation or its scripts. The pack calls `liveRun`; it does not fork it.
- Online play, the match server, central: the test room in `mode=play` on the loopback is the whole page side.
- Automated (`--script`) runs from the GUI. A tester plays; replay is ours.

**Anti-goals (a failure even if it works)**
- The BIOS or the disc image in the pack, or in git. The pack ships neither; the tester's own files stay in their
  folder; the Save zip never includes them (the extractor's refusals stand).
- A pack that silently plays the wrong build (the `--build` default trap of the `eph-parity` skill): the GUI names the
  build and the state on screen and in `record.json`, and refuses a state of the other build as `liveRun` does.
- A tester's session lost to a crash: the record is written on every end (EPH's `finish`), and Save only zips what
  is on disk.
- Anything in the pack that reaches the network. The site server and the GUI bind 127.0.0.1; the page's account
  requests stay on its own origin (`VITE_S2U_ACCOUNT_ORIGIN_ONLY=1`); PCSX2's DEV9 is off in the pack's ini.

## 3. Constraints (from the repository's rules and the host)

- **Never in git**: the pack's output (under `socomlegacy/dist/`, ignored), PCSX2, the BIOS, cards, states, the disc,
  maps (RS.R8; EPH.R2). The builder refuses an output path inside a clone or worktree that git would see.
- **The pack carries third-party files**: PCSX2 (GPL v3; its notice and source link go in the README), Harry62's
  pnach, and the memory cards holding PSRewired's r0004 package. The pack is handed to named testers by a private
  channel, never posted. Whether and to whom it may go is the owner's (HUMAN_TASKS row, section 9).
- **A PCSX2 run on the owner's host is at his word only** (EPH.R3): building the pack is not a run; the first live
  smoke run of a built pack is a HUMAN_TASKS row with the exact command, not something this work does unasked.
- **Heavy runs serial** (AGENTS.md "Layout" 5): the page build and the pack's own extraction are heavy; the builder
  runs them one at a time and under the host lock's `check` where the desktop tree is present.
- The harness reads the physical pad through the page's real `navigator.getGamepads` in a Playwright-driven
  Chromium (EPH.R4). So the pack needs a Chromium Playwright can drive: **the tester's installed Edge or Chrome**
  (Playwright's `channel: 'msedge'` / `'chrome'`; Edge is on every Windows 10/11) **(call)**, with a bundled Chromium
  (433 MB) only when the builder is told `--with-chromium`.
- Playwright's package (`@playwright/test` 1.63 and `playwright-core`) is shipped as files; it is not bundled by
  esbuild (its browser launcher reads its own tree).

## 4. The package, as the tester sees it

```
SOCOM-Parity-Harness-<yyyymmdd>/
  START HERE.cmd            starts the GUI and opens it in the default browser (127.0.0.1:5390)
  README.txt                the three steps, what is recorded, what is never read, the licences
  drop-here/
    PUT-YOUR-ISO-HERE.txt   any *.iso in this folder is the disc; two is refused
    bios/
      PUT-YOUR-BIOS-HERE.txt   the PS2 BIOS dump (.bin, with its .nvm/.mec if you have them)
  handoff/                  the Save zips: parity-<stamp>.zip -- send this
  (internal, the tester never opens)
  pack/VERSION.json         page tag + sha, PCSX2 version, builder's commit, pack stamp, what was included
  pack/run/pcsx2/           PCSX2 2.8.2 portable (the run directory's own copy, EPH_RUN_DIR = pack/run): inis/PCSX2.ini (the harness [Pad1], DEV9 off), patches/ and
                            cheats/ (the conditional pnach), gamesettings/, memcards/ (Mcd001/2 = r0004; EPH-r0001-1/2),
                            sstates/ (slot 5 r0004, slot 8 r0001), bios/ EMPTY (filled from drop-here/bios at start) -- or the
                            BIOS itself with `--with-bios` (PK.R6, the owner's word for a trusted hand)
  pack/site/                the page, a development build
  pack/maps/                written on first run from the tester's image: the image's files laid out once, the served
                            /maps tree with its index, campaign and streams included (one tree: design 10)
  pack/harness/             harness.mjs (EPH + GUI server, one esbuild bundle), gui/index.html, node_modules/
                            (@playwright/test, playwright, playwright-core), desktop-stub/scripts/parity/
                            launch_to_mission.txt
  pack/runtime/             node.exe, ffmpeg.exe (and ms-playwright/chromium-NNNN with --with-chromium)
  pack/run/                 EPH_RUN_DIR (the copy above sits in it directly; no separate pack/pcsx2),
                            run/runs/<stamp>/ per session
  pack/logs/                the GUI's own log
```

**`START HERE.cmd`** sets the pack's environment and starts the GUI server with the shipped node:
`SOCOM_PC_ROOT=<pack>/harness/desktop-stub`, `EPH_RUN_DIR=<pack>/run`, `EPH_PACK=<pack>`, `PATH=<pack>/runtime;%PATH%`,
`PLAYWRIGHT_BROWSERS_PATH=<pack>/runtime/ms-playwright` (harmless when absent), then
`runtime\node.exe harness\harness.mjs gui`, and opens `http://127.0.0.1:5390/`. Closing the console window ends
everything the GUI started (EPH's SIGHUP path kills PCSX2 first).

## 5. The GUI

One page, served by the pack's own server (Node `http`, 127.0.0.1:5390 **(call)**; the site on 127.0.0.1:5391),
plain HTML and JavaScript, no framework, status by server-sent events, commands by POST. The design system is
`shared/ds/` as the launcher uses it; the tester reads sentences, not fields.

**The checklist (always shown first).** Each line green or red with one sentence: the image found (its name and size,
checked as the launcher checks a disc: the SCUS file present); the BIOS found (copied into `pcsx2/bios/` when
present, the ini's `Filenames/BIOS` set to it); the maps prepared (or "preparing: n of m" with a progress line, or
"press Prepare"); ffmpeg found (video), a browser found (Edge, Chrome, or the bundled one); a pad seen (the GUI
page reads `navigator.getGamepads` itself for the checklist only; the harness's Chromium reads it for play). Play is
enabled only when the first four are green; a pad missing is a warning, not a refusal (it may be plugged in late).

**Settings (a strip, defaults that work).** Build: **r0004** (state 5) or r0001 (state 8) -- the GUI shows "the
original: r0004, starting at the first mission's insertion point". Pad: a preset (PK-8, below) that sets the layout
(EPH's `PAD_LAYOUTS`) and the light Triangle's chord. Notes: a text box the tester fills in at any time; saved with
the session.

**Play / Pause.**
- *Play* (nothing running): starts one EPH live session: `liveRun` with the pack's plan -- PCSX2 at the state, the
  page at `/testroom?mode=play&devmode&noarmory&view=ps2&map=M51` with the hunt's stand, the pad live, both samplers
  on, both windows placed and topmost as EPH does. The GUI shows EPH's own log lines (build detected, start stances,
  skew) in plain words, and the two windows appear on the desktop. The GUI's tab stays behind them: the tester
  plays with the pad and comes back to the GUI to Pause, Record or Save.
- *Pause* (running): both clients held. PCSX2 by its own `TogglePause` hotkey (Space in the harness ini; a key no
  `[Pad1]` binding uses -- a unit test pins it) through the harness's key injector; the page by a devmode-only hook
  `__viewer.ephPause(on)` that freezes the walk's tick (an adaptation; absent without `?devmode`, pinned by a test as
  `ephFrame` is). Both samplers keep sampling (a paused side shows a flat clock; the record shows the pause as a
  `pauses` list with both clocks at each edge). Any key the injector holds at the pause is released first, so a stick
  held into a pause does not run on after it.
- *Play* (paused): resumes both, in the same way.
- Pause is **for a tester's convenience**, not a measurement: the two sides do not stop on the same frame, and the
  record says so (the skew at each edge). A finding never spans a pause.

**Record.**
- A session always writes the per-frame records and `live.script` from Play to Save (EPH's). *Record* adds the
  **video**: pressed on, ffmpeg's gdigrab over both windows starts (`clip-<n>.mp4`); pressed off, that clip is closed
  (`q` on stdin, as EPH stops it). Each clip is listed in `record.json` `clips[]` with its wall start and end, the
  guest clock and the page tick at both, and its file. `events.srt` is written for the whole session on the wall
  clock, as today; a clip's offset in it is the clip's wall start.
- The tester may record many clips in one session, or none. The GUI shows "recording clip 3 -- 00:41" while it runs.
- Why not always record: a tester's session may be long, and the video is the one large file; the records and the
  script are small and are what replays. **(call)**

**Save.**
- Ends the session cleanly (EPH's `finish`: PCSX2 killed first, the rest stopped, the record written with outcome
  `complete (live session ended by Save)`), then zips `run/runs/<stamp>/` whole, plus `notes.txt` (the box),
  `system.json` (Windows version, CPU, memory, GPU name from `wmic`/PowerShell, PCSX2's version, the page's build,
  the pack's VERSION.json, the browser used), `pcsx2-emulog.txt` (the copy's `logs/emulog.txt`), into
  `handoff/parity-<stamp>.zip`, and shows "Saved. Send this file: <path>" with an Open folder button.
- The zip is store-only (`packages/playtest/src/zip.ts`, no new dependency): the clips are compressed already.
  Over 4 GB it is refused with the reason and the run directory named (ZIP64 is a LATER row); the GUI warns at 3 GB
  of clips while recording.
- After Save, Play starts a new session (a new stamp). The old one stays under `run/runs/` and in `handoff/`.

**Stop (PK-8).** Ends the session as Save does (EPH's `end`: PCSX2 closed, the record written) but writes no zip: the
run directory is kept as the unsaved one, and the GUI says "Stopped. Save keeps this session as a file, or Play starts
a new one." Save then zips that run directory; Play starts a new session. Refused in one sentence when nothing plays.

**Reset (PK-8).** Stop, then Play with the same settings: the session's `end` is waited for, then a new session (a new
run directory) starts on the same command line, and the GUI says "Resetting..." until it reports live. The ended run
stays unsaved -- the status line names it by its time -- until the next Save (which, while the new session plays,
ends and saves the new one) or the next Reset; it stays on disk under `run/runs/` either way. Refused when nothing
plays.

**The pad (PK-8).** Any pad the browser reads in its **standard mapping** works: the harness reads one pad through the
page's Gamepad API by the W3C standard indices and sends each change to PCSX2 (the keyboard keys of its own `[Pad1]`)
and to the page; **PCSX2's own controller settings are never used**, so a tester's PCSX2 profile is reproduced here,
not read. The checklist's pad line names the first pad and its mapping ("pad seen: <id> (standard mapping)"), amber
when the mapping is not the standard one (the buttons may not line up). Two presets: **Standard** (layout
`standard`, hold L2 with Triangle for the light press) and **Machete's** -- a player's DualSense profile, from the
owner's screenshots of 2026-11-03: Select on Create, Start on PS, Circle on Options, R3 on the Circle button (layout
`machete`), and the light press on the touchpad, alone or held with Triangle (`--chord touchpad --chord-solo`; the
touchpad is the standard index 17 Chrome gives a Sony pad, never sent to either client). His Macro 1 is Triangle at
30% on the touchpad; the harness's light press stays the prepared 0.2 -- both under the original's 0.3 split (FUN_00594cf0 D:L453336-453351). His
Macro 2 (R1) shows no trigger in the screenshots and is not reproduced.

**What the tester never sees**: ports, PINE, the state slot number as a slot, paths. What they do see: the build's
name, the clip count, the elapsed time, EPH's refusals in plain words (the start stances differ; the page did not
reach play; no player actor: "the saved starting point did not load -- press Make starting point").

**Make starting point (a repair, hidden behind the checklist).** If Play fails with no player actor or a build
mismatch -- a shipped state that does not load on the tester's BIOS -- the GUI offers "Make starting point": EPH's
`--boot-to-mission --build <b> --state <slot>` through `launch_to_mission.txt` (shipped in `desktop-stub`), about
five minutes, with the instruction to leave the windows alone, and then to **look** at the PCSX2 window before
playing (the `eph-parity` skill's own rule for a new state). Whether PCSX2 2.8.2's savestates load across BIOS
dumps is **unverified** here; this path is why the pack works either way.

## 6. The harness's changes (small, inside `tools/eph/`)

EPH is called, not forked. What the pack needs that the harness lacks today:

1. **A context without git** (`hostContext` runs `git rev-parse`). `EPH_PACK=<root>` makes a `PlanContext` from the
   pack's `VERSION.json`: `repo` = `<root>/harness`, `clones` = [], `worktreeParent` = the pack's parent,
   `desktop` = `SOCOM_PC_ROOT` (the stub). `pageBuild()` returns `VERSION.json`'s `pageSha`. `runDir`'s refusals
   stand unchanged (the run dir is `<root>/run`, a sibling of `harness`, not inside it).
2. **The browser channel**: `chromiumLaunchOptions()` takes `EPH_BROWSER_CHANNEL` (`msedge` | `chrome` | unset =
   the bundled Chromium); the GUI picks the first that exists.
3. **Session controls** on `liveRun`: an optional `controls` in the plan's deps -- `{ pause(on), record(on), end() }`
   as methods the run binds at start, and `onStatus(cb)` the run calls with `{ phase, clips, paused, elapsed, lines }`.
   Without controls the run behaves exactly as today (video from start, Ctrl+C ends it): the existing tests stand.
   With controls, the video starts only on `record(true)`. `end()` is the abort the Ctrl+C path takes, with its own
   outcome word.
4. **Record.json**: `clips[]` and `pauses[]` (above); `video` keeps its old form when controls are absent.
5. **The page's `ephPause`** (`packages/viewer/src/`): devmode-only, freezes the walk's game tick and the page's tick
   counter so `ephFrame()` answers the same frame while paused; a vitest pins its absence without `?devmode`.

Every change test-first in `tools/test/eph*.test.ts` with fakes (the skill's own rule); no run on the host for them.

## 7. The builder and the skill

**`tools/parity-pack/build.ts`** (`node --import tsx tools/parity-pack/build.ts --out <dir> [options]`, from
`socomlegacy/`):

- Reads the host: `SOCOM_PC_ROOT` (for `scripts/parity/launch_to_mission.txt`), `EPH_RUN_DIR` (the PCSX2 copy to ship:
  the harness's ini, cards, states; `--pcsx2 <dir>` overrides), ffmpeg on PATH (`--ffmpeg <exe>` overrides), the
  Node running it (`process.execPath` is the shipped runtime), `node_modules/@playwright/test` and its two packages,
  the page's `git describe` and sha. Each missing piece is one refusal line naming what and where.
- **Plans before it copies** (`packPlan.ts`, pure, unit-tested): the file list with what each is and its size; what is
  excluded from the PCSX2 copy -- every file under `bios/` (`*.bin`, `*.rom*`, `*.nvm`, `*.mec`, `*.erom`), `cache/`,
  `logs/`, `snaps/`, `videos/`, `inputrecordings/`, `textures/`, `*.backup`, `*.bak-*`, `sstates/` except the two
  shipped slots -- and refuses an output path inside a clone or worktree. `--dry-run` prints the plan with sizes and
  writes nothing. The plan's refusals are the BIOS (never, by name) and the disc (never).
- **Builds the page** as nightly.sh's step does: `NODE_ENV=development VITE_S2U_ACCOUNT_ORIGIN_ONLY=1 npx vite build
  --config packages/viewer/vite.config.ts --outDir <pack>/site --emptyOutDir` from a clean tree (dirty refused), with
  the agent variables unset; then the nightly checks that apply to a site folder (`nightlyBuild.test.ts`'s markers:
  the dev hook read is in, the JavaScript is minified) run over it by the builder, and a site without them is refused.
- **Bundles the harness**: esbuild of `tools/parity-pack/harness.ts` (the entry: `gui` and `run` sub-commands; it
  imports `tools/eph/run.ts`'s plan and run functions, the GUI server, the extractor) to `harness/harness.mjs`,
  `--platform=node --format=esm --target=node22`, `@playwright/test` external (shipped as files); the GUI's
  `index.html` and the design system's CSS copied beside it.
- **Writes** `START HERE.cmd`, `README.txt`, `VERSION.json`, the drop-here placeholders, the empty `bios/`, the
  `desktop-stub`, and with `--zip` the one archive (`SOCOM-Parity-Harness-<yyyymmdd>.zip`, by the same store-only
  writer; a pack over 4 GB is refused -- without Chromium it is about 0.6 GB: PCSX2 150 MB, ffmpeg 220 MB, node 90 MB,
  the site, Playwright's packages).
- **Checks the pack** (`--check`): starts the pack's GUI from the pack's own `node.exe` with a throwaway drop-here
  (no image), reads its checklist over HTTP (the image, the BIOS and the maps missing -- the tester's own files --, the
  pad a warning, the rest green), and stops it. No PCSX2 starts.

**The skill `parity-pack`** (`.agents/skills/parity-pack/SKILL.md`, mirrored by `sync_agents`): when to build one
(a tester asked for, a new page tag, a harness change), the prerequisites on the host and where each comes from, the
command and its options, what the builder refuses and why, how the pack is handed over (a private channel; the
owner's row), what comes back and how it is read -- `analyze.ts` over `runs/<stamp>` from the zip, `run.ts --script
live.script` to replay on our host, the clips watched -- and what a tester's zip may claim (capture comparison, the
`eph-parity` skill's section 0: never proven by itself).

## 8. What is reused, unchanged

- `tools/eph/*`: the plan, the run, the injector, PINE, the samplers, the translation, the record and the analyzer.
- `packages/playtest/src/zip.ts`: the store-only writer.
- `tools/materialize-iso.ts` and `tools/extract-maps.ts`: refactored into one callable
  `extractMaps({ iso, disc, maps, onProgress })` (`tools/extractMaps.ts`) that both scripts call; the campaign stays
  in (M51 is the hunt's map). Its refusals (a disc dir inside a clone outside `.disc`; an image lacking a common
  archive) stand.
- `shared/ds/`: the GUI's look.
- `deploy/host/web/nginx.conf`'s routes: the pack's site server answers `/testroom`, `/forge`, `/playtest` with
  `setup/index.html`, `/setup/` with it, other HTML with `index.html`, `/maps/*` from `pack/maps`, GET and HEAD only,
  `no-store`, 127.0.0.1 only -- `tools/lan-playtest.ts`'s guards, in a module both can use.

## 9. For the owner (HUMAN_TASKS rows, with the defaults the work follows)

- **H407 -- the pack's distribution.** It carries PCSX2 (GPL, with notice), Harry62's pnach and the memory cards
  holding PSRewired's r0004 package; neither the BIOS nor the disc. Default until his word: built on his host only,
  handed to a named tester by a private channel, never posted anywhere.
- **H408 -- the first live smoke run of a built pack on his host** (EPH.R3): the builder's `--check` starts no PCSX2;
  the first Play with a real image and BIOS is his to start, with the command the skill names. Until then the pack's
  end-to-end path is verified by unit tests and the dry checks only, and the report says so.
- **H409 -- the saved states across BIOS dumps**: whether the shipped slots load on a tester's own BIOS is unverified;
  the "Make starting point" path is the default. His word, or the first tester's result, settles it.

## 10. The builder check's questions, answered (2026-11-03, the seat's calls)

1. **Which dumps.** The matching one only: SCUS-97275, ELF CRC `0F6FC6CF` (the US retail r0001 image, the one every
   shipped state, per-game ini, pnach and sampler address is keyed to). The checklist fingerprints the image's
   `SCUS_972.75` through the repository's ISO reader and PCSX2's own CRC rule (the XOR of every little-endian
   32-bit word of the ELF file, not a CRC32), records it in
   `VERSION.json` at build and in `system.json` at Save, and refuses a mismatch in one sentence ("this is not the
   US retail SOCOM II image the harness is built for"). No per-CRC writing of anything.
2. **The repair path is "Mark starting point", not an unattended boot.** Slot 5 (r0004) was finished by hand (Help
   off) after the boot; `launch_to_mission.txt` is r0001's and cannot be trusted to land r0004 clean. So: when the
   shipped state does not load (no player actor, or the build mismatch), the GUI offers **Boot the original**: PCSX2
   started with the image and no state, its window up, the harness's `[Pad1]` keyboard keys listed on screen (the ini
   binds every button to a key, so a tester plays PCSX2 with the keyboard, no harness in between), the target frame
   shown (the evidence's `slot5-saved-frame.png`, shipped in the GUI: standing at the insertion point, Help off, in
   control), and a **Mark** button that saves the current state to the build's slot over PINE (`save_state`) and
   closes PCSX2. Play then loads it. `liveBoot` and `launch_to_mission.txt` stay available for r0001 only
   (`--boot-to-mission`), not offered in the GUI.
3. **A pause and the script clock.** `live.script`'s clock is the session's **active** time: paused wall time is
   subtracted, so a session's events replay on the guest clock (which also stops while PCSX2 is paused) as a
   continuous script, and `analyze.ts` and `run.ts --script` need no change. `pauses[]` in `record.json` carries each
   edge's wall time, guest clock and page tick, so the skew at the edges is readable. The rule stands: a finding never
   spans a pause.
4. **DEV9 and the pnach.** The pack's ini keeps the harness's `[DEV9/Eth]` section with `EthEnable = false`,
   `EthDevice` cleared and `DNS1`/`DNS2` cleared (the adapter GUID is the owner's host's; the DNS values reach a
   server: anti-goal). The pnach is kept (it is the setup "with the patch"; it acts only at the DNAS check, which an
   offline session never reaches). Whether a state saved under `EthEnable = true` loads under `false` is
   **unverified** until H408's smoke run; if it does not, the first fix is to keep `EthEnable = true` with the device
   cleared, and the record here says which was shipped.
5. **The zip writer streams.** A store-only writer that streams each entry from its file to the archive
   (`tools/parity-pack/zipStream.ts`, the same headers as `packages/playtest/src/zip.ts`, tested by reading back what
   it writes), so a Save with gigabytes of clips never holds them in memory. The in-memory writer stays for the
   playtest export.

**Also settled with the check's own decisions:** `liveRun` runs in a child process of the GUI server (its signal and
exit paths otherwise end the server): the harness's CLI gains `--control stdio` -- commands as JSON lines on stdin
(`pause`, `resume`, `record on|off`, `end`), status as JSON lines on stdout -- and the GUI speaks that; the maps are
served straight from the one materialized tree (`extractMaps` with `disc` = `maps`: the copy phase is skipped, the
index written in place), so the tester's drive holds the image's files once; the streams are included (sound
belongs to a playtest; it is the tester's own disk); the shipped node is the one that runs the builder.

## 11. Left to the builder

- The exact GUI copy (the sentences), within the rules above; the colours from the design system.
- The SSE/POST shapes between the GUI page and its server.
- How `system.json` reads the GPU name (PowerShell `Get-CimInstance Win32_VideoController` is fine; a failure is
  recorded as `unknown`, never fatal).
- Whether `harness.mjs` is one bundle or two (`gui` and the extractor as workers); one is the default.
- The port numbers (5390/5391 are the defaults; a port in use is reported, and the GUI tries the next two).
