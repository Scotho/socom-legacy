# 285 -- `armoryMp.spec.ts`'s first Enter lands under the loading hold (PAR-39, issue #104)

- Date: 2026-10-12. PARITY-2's row PAR-39 ([brief](../plans/briefs/2026-10-12-par39-armorymp-diagnosis.md)), issue
  #104. Base `b307b4c4d` on `agent/par39` (made from `agent/parity-2`).
- A **diagnosis from source**: the repository's own code and its git history were read; nothing was run in a browser,
  no dev server or match server was started, and no game ran. No decompilation, disc data or capture is involved: the
  code at fault is a browser adaptation (the loading screen's input hold, `packages/viewer/src/loadingJoin.ts:4-7`) and
  an end-to-end spec, neither of which has an original.
- Status: the mechanism is **reading, pending review** (the page's code and the spec, cited below at the base's lines).
  That it is what fails in the reproduced run is **not measured**: §5 names the browser run that settles it. Which
  change of the window moved the race is **not established** (§3).
- No `*_PLACEHOLDER` or `*_READING` constant is added; no source or test file changes with this note.

## 1. What fails

`packages/viewer/e2e/armoryMp.spec.ts`, "a first seat: the ARMORY opens, the room holds the spawn until it is left, each
choice lands as it is made" (:69), reproduced on the lane head 9cb6c51f4 on 2026-10-12T00:04Z alone and headless (the
PARITY-2 plan's Log): after `key(a, 'Enter')` (:81) the poll of `armory().screen` (:82) reads `'select'` for the whole
of the config's 60 s `expect` timeout (`playwright.config.ts:33`), where `'row'` is expected. The run took 1.3 m: about
18 s to :82 (the sprint 35 green ran the whole test in 18.5 s), then the 60 s poll.

Issue #104 words it as "the loadout's `pending[0]` stays `select`"; the assertion that fails is the screen's (:82, `:77`
at 558cf074f), not the loadout's (:85). The issue's closing bar -- "held by a unit test on the loadout's pending
transitions" -- therefore aims at a state that is never reached; nothing here reads the loadout as wrong.

## 2. Enter's path on the lane head

1. **The spec.** `open(browser, 'ALPHA', 'player')` (:53-60) loads `/testroom?mode=play&mp&server=...&map=MP2&devmode`
   and waits only for `net().state === 'open'` (:58); the test then waits for `armory().open` (:72). `key()` (:62-65)
   waits for `armory().taking`, then `page.keyboard.press`. Nothing in this spec waits for the loading screen's hold.
2. **`taking`.** The hook's `armory()` is `armoryPart.state()` (`main.ts:2050`), whose `taking` is `armory.taking()`
   (`matchArmory.ts:219`) = `takesInput(st, clock)` (`armory.ts:525`): open, not on `store`/`defaults`, and past the
   screen's own `suspendedUntil` (`armoryState.ts:420-423`). It knows nothing of the page's hold.
3. **When the ARMORY opens.** The room seats the player at its hello and the page's `NetPage.armorySeat` calls `joined`
   (`netPage.ts:724-728`) -> `armoryPart.seat()` (`matchArmory.ts:175`, `:209`): it opens as soon as its data and the
   map's world are in. The hold's verdict (`loadingJoin.ts:50-61`) waits, beside the ARMORY's data and the room's
   welcome, on the world's warm-up (`scene`), the clips and the walk's warm-up (`player`), the effects and the sound,
   and then the completion's fade (`LOAD_STATE_FADE_SECONDS`, 0.5 s, `packages/ui/src/loading.ts:138`;
   `loadingJoin.ts:106`). So the ARMORY can be open, and `taking`, while `loadingJoin.blocked` (`loadingJoin.ts:89`) is
   still true -- by design: the hold releases on the welcome, not on the first round, so that the ARMORY is usable
   before the seat readies up (`main.ts:1520-1521`).
4. **The key.** The window's capture listener (`main.ts:496-522`, registered after only the audio unlock,
   `main.ts:491`, and the headset's non-stopping DEV-key watcher, `voice/headset.ts:140-148`) swallows every key while
   the hold is on -- `if (loadingJoin.blocked) { e.preventDefault(); e.stopImmediatePropagation(); return; }`
   (`main.ts:504`) -- **before** the ARMORY's branch (`main.ts:506-511`, `armory.key` -> `ARMORY_MENU_KEYS_READING`
   `Enter` -> `'cross'` -> `stepArmory`'s commit to `'row'`, `armory.ts:376-379`, `armoryState.ts:455-458`). The pad
   path is held the same way (`main.ts:1076`). A press under the hold is lost, not queued: the screen stays at
   `'select'`, and no later poll can see `'row'`.
5. **The hold's release** runs at the end of each frame (`main.ts:1519-1529`).

This is the trap commit 4b452c0f5 (2026-10-05, "wait for the loading hold before input") named -- "the specs acted right
after the status line's triangles and lost their one press" -- and fixed in the specs then failing with
`packages/viewer/e2e/loadHold.ts` `holdReleased` (:13-16). `armoryMp.spec.ts` was not among them (it passed then).
Its sister spec has the same online first-seat flow and does wait: `grenadeSelfMp.spec.ts` `joinArmory` (:140-148) polls
`net().state`, then `armory().open`, then `holdReleased(page)` (:147), before the identical `armoryKey(p, 'Enter')` and
`'row'` poll (:150-157). The swallow itself is `main.ts:504`; `loadingJoin.spec.ts:54-58` holds it in a browser for the
walk's keys (the pose and the shot under the hold) -- not for the ARMORY, which never opens there (no welcome: its
`:53`), so its `armory().committed` null proves nothing about Enter (the review's finding 1).

**The cause, as read:** a race in the spec. Its first ARMORY key waits on `armory().taking`, which can be true while the
page's loading hold still swallows every key (`main.ts:504`). When A's hold outlasts B's page load and the spec's 2 s
wait (:78), the Enter is lost and the screen stays at `'select'`. Nothing in the ARMORY's state machine, the room's
ARMORY seat or the loadout is implicated.

## 3. The window 3eea4e22e (green alone) .. 558cf074f (red alone)

- 3eea4e22e is on the playtest branch (sprint 35's close), not on `main`'s first-parent line: it is an ancestor of
  `e50e086a0^2` (PR #75's second parent), and `fee14414c^1` is its ancestor. `git log --first-parent
  3eea4e22e..558cf074f` lists 17 merges; of them only PR #74 (`fee14414c`: `e2e/ui.spec.ts`, 4 lines) and PR #76
  (`bd8cea7e3`) touch `packages/`, and PR #75's package changes are already in 3eea4e22e.
- `git diff --stat 3eea4e22e 558cf074f` over `packages/{viewer,server,ui,scene}/src` is exactly PR #76's (sprint 20's
  voice: 33 files, +3275/-47). `armoryMp.spec.ts` is unchanged in the window (its one later change, e606af527, closes
  the browser contexts).
- No line of PR #76 touches the key path of §2 (`main.ts:496-522` moved 8 lines down at 558cf074f, unchanged:
  `main.ts:569`/`:577` the swallow at the two commits), the hold's lanes (`loadingJoin.ts`, `pageLanes`' inputs) or the
  ARMORY (`armory*.ts`). Its additions on the page are per-frame and per-load work: the voice client mounted per match
  (`main.ts`, `mountPageVoice`), the talk input and the headset in the taunts part (`matchTaunts.ts`), the voice HUD
  element computed every frame (`main.ts`, the `voiceHudFrame` block; `hud.ts`), eight HUD icons and one compass mark
  added to the HUD libraries (`hudAssets.ts`); on the server, the voice floor's ask and tell at every hello, ready and
  round start (`room.ts`).
- So the window shifted the race rather than the logic. That it was a race before the window is the brief's own
  record: the spec was red in sprint 35's full runs under memory pressure while green alone on 3eea4e22e. **Which of
  PR #76's additions moved it is not established** -- a per-change timing needs the browser and is not owed by this
  row; the fix below does not depend on it.

## 4. The RED

**None written.** No unit test can reproduce the failure: it is a cross-page timing race between the page's frame loop
(the hold's release) and a Playwright key press, inside `main.ts`'s module-level listener, which no unit test mounts.
The two facts that make it up are already held at their own level -- the swallow under the hold by
`loadingJoin.spec.ts:54-58` (browser, the walk's keys), and the verdict's lanes by the `loadingJoin` unit tests -- and a jsdom test of
`Armory.key` would pass (the screen commits on Enter whenever the key reaches it). The fix is therefore not built
(the brief: three lines or fewer **and** a RED).

## 5. The test that would confirm it (not run)

From `socomlegacy/`, under the host's lock rules (a browser run), on an agent port (`E2E_PORT` from 5303 up; the spec's
own server on `ARMORY_MP_PORT`, 8802 by default):

`E2E_PORT=<port> npx playwright test packages/viewer/e2e/armoryMp.spec.ts --workers=1`

1. **The probe (the lane head, a throwaway edit, not committed):** immediately before `:81`, record
   `await a.evaluate(() => window.__viewer.loading())`, and again inside `key()` right after `page.keyboard.press`
   (`key()` can poll `taking` for up to 10 s first; the hold may release in between -- the review's finding 2).
   Confirmed if, in a red run, the read after the press says `blocked: true`.
   Refuted if it reads `blocked: false` -- then the key reached the page and the cause is elsewhere (the next reads: the
   `tauntDev?.isOpen()` and `exchangeInput` early returns at `main.ts:499-500`, then `armory.key`'s `this.ctx`).
2. **The fix's RED/GREEN:** with `await holdReleased(page)` added to `open()` for the player (below; PAR-39a, built
   written-not-run on `agent/par39`), the spec green alone **three times** (`--repeat-each=3`: the spec already flips
   with timing, so one green could be luck -- the review's finding 3); with it reverted, red at `:82` as on 2026-10-12T00:04Z. If `holdReleased` itself times out (120 s), the hold
   never releases in the two-page run and the cause is a stuck lane, not the race -- a different row.

## 6. The proposed fix row

| Row | What | Size | Files | Evidence owed |
| --- | --- | --- | --- | --- |
| PAR-39a | `armoryMp.spec.ts` waits for the loading hold before its first ARMORY key, as `grenadeSelfMp.spec.ts:147` does (4b452c0f5's convention): `import { holdReleased } from './loadHold';` and, in `open()` after the `net().state` poll, `if (as === 'player') await holdReleased(page);` -- two lines, the spec only; no product code, no widened poll. | S 1 | `packages/viewer/e2e/armoryMp.spec.ts` | §5's probe and RED/GREEN in a browser slot; then #104 closed with the run quoted and its closing bar corrected (the screen's state, not the loadout's) |

An alternative, not proposed: make the `/testroom` hook's `armory().taking` false while `loadingJoin.blocked`
(`main.ts:2050`), which would cover every spec that waits on `taking` (`grenadeSelfMp`, `loadingJoin`,
`mapTransitionRecovery`, `armoryPopupScore`). It changes a hook's meaning and `main.ts`, a shared file, to save one
call the project's convention already makes; the row above follows the convention.
