# 286 -- `remoteCombat.spec.ts`'s reload pan: the sound is panned mid-turn, the spec's expectation after it (PAR-38, issue #118)

- Date: 2026-10-12. PARITY-2's row PAR-38 ([brief](../plans/briefs/2026-10-12-par38-reload-pan-diagnosis.md)), issue
  #118. Base `5f0a7c0ab` on `agent/par38` (made from `agent/parity-2`).
- A **diagnosis from source**, with one jsdom unit run of the page's own walk and audio code (§5, a scratch file, not
  committed: the brief commits a test only when it is a RED). Nothing was run in a browser; no dev server or match
  server was started; no game ran.
- The original's side: `FUN_00342670` (D:L241912-241955), re-read at the decompilation for this note. The brief names
  "research 85" for the positional sound; research 85 is the grenades note. The positional sound's note is research 81
  (§3, "The 3D play"; §0: a sound takes its pan once, when it starts), with research 196's listener row (`196-w2-c-world-presentation.md`, "Listener basis").
- Status: the mechanism is **reading** (re-read at the source by a fresh reviewer 2026-10-12, PASS WITH FINDINGS, high;
  §5's scratch run reproduced line for line; its four lows folded in) (the page's code, the spec and `FUN_00342670`, cited below at the
  base's lines). That it is what fails in the reproduced runs is **not measured**: §6 names the browser run that settles
  it. When the reload reached CHARLIE's page in those runs (§3.3) is inferred, not measured.
- No `*_PLACEHOLDER` or `*_READING` constant is added; no source or test file changes with this note.

## 1. What fails

`packages/viewer/e2e/remoteCombat.spec.ts` test 1 (:315, "another player's reload: heard by the others at the reloader,
once by the reloader (no echo)") fails at :339, "panned at the reloader": `panGap(heard, want) <= 3`. The runs on
record (issue #118; the PARITY-2 plan's Log, 2026-10-11):

| Run | Heard (CHARLIE's page) | `want` (the spec's `panFor`) | Gap | BRAVO from CHARLIE |
| --- | --- | --- | --- | --- |
| main e3ba4a522, alone | 46 | 52 | 6 | 26.8 |
| the lane head, alone, 2026-10-11 23:58Z | 45 | 51 | 6 | 25.6 |
| `agent/pbatch` 57ccf606a, alone | 49 | 54 | 5 | not logged |
| `agent/pbatch`, in a run of twelve files | -- | -- | 4 | not logged |

In the three runs that logged both pans the heard pan is the **smaller** one (the batch's twelve-file run logged none). Its last green on record is web sprint 36's gate (main 46294a0bb).

## 2. The two sides, and the original

**The page (what CHARLIE heard).**
1. The room's `reloadSound` reaches `NetPage.event` (`netPage.ts:1403-1410`): another player's id, the item's record,
   played at `remote.feet(ev.id)` -- `RemotePlayers.feet` (`remotePlayers.ts:665-668`), the last frame's
   `snapshotOf(client.bodies())` (`netPage.ts:1132`, `remotePlayers.ts:550`) -- else the room's `ev.at`.
2. `matchSound.ts:130` -> `GameAudio.onReload` (`audio.ts:1187-1191`) -> `GameAudio.play` (`audio.ts:1318-1340`): the
   pan is fixed once, when the sound starts (`audio.ts:1326-1331`), and logged in `recent` (`audio.ts:1337`) -- the
   value the spec reads as "heard".
3. The pan: `GameAudio.local` (`audio.ts:1455-1461`) takes the source into the listener's frame -- right `= d . x`,
   forward `= -(d . z)` of the listener matrix's axes -- and `panDegrees` (`packages/sound/src/rules.ts:25-28`) gives
   `Math.trunc(atan2(right, forward) x 180 / pi)`, plus 360 under 0.
4. The listener: `audio.setListener(camera.matrixWorld.elements)` once a frame (`matchSound.ts:149`), after
   `fly.camera.updateMatrixWorld()` (`main.ts:1469-1470`; `matchMount.ts:788-789`). The camera is placed by
   `WalkMode.follow` (`walk.ts:1392-1400`): in third person `placeView(eye, target)`, a position and a `lookAt`
   (`camera.ts:458-462`) -- no roll, its x axis `normalize(-f.z, 0, f.x)`, as `FUN_0029bc90` places the game's
   (`playerCamera.ts` header). An event between two frames is panned from the last frame's camera.

**The spec (what it expects).** `look(c)` (:155-158) reads the hook's `camera()`, `WalkMode.cameraState`
(`walk.ts:1225-1233`): `placed`, the very view `follow` puts the camera on when the body is not in the air
(`walk.ts:1399`). `bodyOn(c, id.b)` (:335) is `net().bodies`' feet, `client.bodies()` (`main.ts:2017`). `panFor`
(:164-168) is the same arithmetic as steps 3-4: `r = unit(-f.z, 0, f.x)`, forward `d . f`, `Math.trunc`, plus 360.

**The original.** `FUN_00342670` (D:L241912-241955) takes the source through the camera's matrix at 0x48dd40
(`FUN_003085c0`), and in the same call that gives the play its volume sets its pan to the whole degrees of
`atan2(x, -z)` (truncated by the cast; plus 360 under 0): the pan of the camera **at the moment the sound starts**.
The reload plays at the actor (`FUN_005c2a90`, decomp 477484-477537, as `audio.ts:1183-1186` cites it; not re-read
here).

## 3. Which input differs

### 3.1 Not the rounding, the listener or the place

- **The rounding:** `panDegrees`, `panFor` and `FUN_00342670` all truncate toward zero and add 360 under 0. In the
  scratch run (§5) the page's pan, through `GameAudio.local` and `panDegrees` on the camera's `matrixWorld`, equals
  `panFor` on the hook's `camera()` at every one of 180 frames through two quarter turns: worst gap **0**.
- **The listener:** both sides use the camera (the eye and its look), not CHARLIE's body; so does the original (0x48dd40).
- **The place:** both read the same interpolated `client.bodies()` feet; for a BRAVO standing still -- as in test 1:
  BRAVO only turned (`clearShot` -> `aimAt`) and pressed R -- the two are the same point. The lateral reading of the
  gap would need a still body's place 3.5-4.0 units off (6 degrees at the eye's 33-38 units from BRAVO, not 2.7 at
  CHARLIE's 25.6: the listener stands 21-29 units behind CHARLIE, §3.3); no code path offsets it. Excluded.

### 3.2 The cause: the spec reads the camera after a quarter turn the sound was panned in the middle of

- **The turn.** Test 1 turns CHARLIE with the hook -- `setCamera({ yaw: fromC + 90, pitch: 0 })` (:319) -- and waits
  a flat **500 ms** (:320) before BRAVO reloads (:323-324).
- **The page turns at the stick's law since 2026-10-07.** NET-LOOK (OT.R38; 43c76c2f3, 5fc264e56, f89c7a237, all
  ancestors of sprint 36's green 46294a0bb) runs the page's own mover through `LookGate`: each frame `WalkMode.look`
  (`walk.ts:1351-1359`) hands the mover the asked yaw, then each tick's command is gated to `MAX_YAW_RATE` = 2.236
  rad/s, 128.1 degrees a second (`look.ts:50`; `lookGate.ts:91`, `:185`), with at most
  `LOOK_SLACK_TICKS_PLACEHOLDER` = 4 ticks banked (`lookGate.ts:32`), and the mover takes the gated yaw
  (`walk.ts:1159`). The third-person camera ticks on that yaw (`walk.ts:1366`) and `follow` places it. So the view
  turns at the law; the scratch run measures the quarter turn at **40 frames, 667 ms** (90 / 128.1 = 0.703 s, less the
  bank).
- **The sound is panned at its start.** CHARLIE's page pans BRAVO's reload when the room's `reloadSound` reaches it
  (§2): 500 ms, three hook reads, `bringToFront`, the key press, BRAVO's next frame and command, the room's take of the
  magazine and its broadcast after the turn began.
- **The spec reads the camera later.** It reads CHARLIE's camera only after polling BRAVO's and CHARLIE's reload
  counts (:326, :331; `expect.poll`'s intervals), at :334 -- by then the turn has ended. `heard` is the pan of a view
  still short of the quarter turn; `want` is the finished view's.
- **The direction fits.** `meet()` ended with CHARLIE walking at BRAVO until under 30 units (:254; the runs' 25.6 and
  26.8) after `face(false)` turned it to BRAVO (:249-252), so the quarter turn raises BRAVO's pan from about 0 toward
  about 51: an earlier view pans BRAVO less. All four runs have the heard pan below `want` (§1).
- **Why it was green, and why "no package file changed".** It is a race between the turn's 667 ms and the reload's
  arrival on CHARLIE's page: a reload that arrives after the turn's end pans as `want`. The spread on record (gaps 6, 6,
  5 and 4 at different loads; the green at sprint 36's gate) is that race's. Nothing in the window 46294a0bb..e3ba4a522
  is needed to explain it; the flaw dates from 2026-10-07, when the page's view began turning at the law.

### 3.3 The gap quantified, both readings

The pan of BRAVO, D from CHARLIE at an angle a off CHARLIE's facing, heard from an eye E behind CHARLIE (pitch 0: the
look level, the eye straight behind): `pan = atan2(D sin a, D cos a + E)`; at a = 90 degrees its slope in a is
`D^2 / (D^2 + E^2)`.

- **Open ground** (the scratch run's flat floor): E = 28.75 (`FUN_0029a950`'s 28 at pitch 0 plus the pass's 0.75,
  `playerCamera.ts` header). The slope is 0.44: a gap of 6 is **13.6 degrees** of yaw, about **106 ms** of the turn.
- **Frostfire's runs:** the settled `want` 51 at D 25.6 and 52 at D 26.8 give E = D / tan(want) = **20.7 and 20.9** --
  a surface behind CHARLIE holding the eye in (the pass: in at once on a hit, `playerCamera.ts` header). The slope is
  0.60: a gap of 6 is **about 10 degrees** of yaw, about **78 ms** of the turn.
- So the reload reached CHARLIE's page about 0.55-0.6 s after `setCamera`, 80-110 ms before the turn's end -- inferred
  from the gap and the law, not measured.

## 4. Who is wrong against the original

- **The page is right.** It pans a sound once, at its start, from the camera of that moment, as `FUN_00342670` does
  (D:L241912-241955), at the place of the drawn body (`FUN_005c2a90`: at the actor); and its view turns at the
  stick's law, the game's (`FUN_005966a0`, `FUN_00550ef0`, `FUN_00594600` as `lookGate.ts:13-15` cites them, web research 83; OT.R38).
- **The spec's bound (3) is not shown wrong.** For the same camera the page's pan and `panFor` agree exactly (§3.1);
  the 3 leaves room for the camera's pass, which can still move the eye slowly after a turn (out at 3 % a game frame
  once its 1.5 s hold ends: `playerCamera.ts`, `CAM_REGROW`, `CAM_HOLD`).
- **The spec's expectation is sampled at the wrong time.** It compares the pan the sound was given mid-turn with the
  pan of the view after the turn. A test's timing flaw, introduced with NET-LOOK (2026-10-07), not by sprint 36's range.

## 5. The RED

**None written.** No unit test can fail on the page for this: the page's pan is the original's rule on the camera of
the moment, and the fault is the spec's 500 ms in a browser. The fix is therefore not built (the brief: three lines or
fewer **and** a RED).

The confirming unit run (jsdom; a scratch file `packages/viewer/test/par38Scratch.test.ts`, run then removed, not
committed). Its rig is `lookParity.test.ts`'s (:20-59: the real `WalkMode` with its `LookGate`, a `NetClient` on the
`LoopbackMatch`, a flat floor). Each frame it sets `GameAudio`'s listener from `fly.camera.matrixWorld` and pans BRAVO's
feet through `GameAudio.local` and `panDegrees` (the page), and through `remoteCombat.spec.ts`'s own `panFor` on
`walk.cameraState()` (the spec). BRAVO is D ahead of CHARLIE's facing; then `walk.setCamera({ yaw: fromC + 90, pitch:
0 }, true)`, the hook's call; 90 frames of 1/60 s. Free memory before the run: 9.68 GB.

```
D 25.6: page vs panFor worst 0; turn settled at frame 40 (667 ms)
  400ms short 32.3deg pan 27 (settled 41, gap 14)
  500ms short 19.5deg pan 33 (settled 41, gap 8)
  550ms short 13.1deg pan 36 (settled 41, gap 5)
  600ms short 6.7deg pan 39 (settled 41, gap 2)
  650ms short 0.3deg pan 42 (settled 41, gap 1)
  700ms short 0.0deg pan 42 (settled 41, gap 1)
  750ms short 0.0deg pan 42 (settled 41, gap 1)
  1500ms short 0.0deg pan 41 (settled 41, gap 0)
D 26.8: page vs panFor worst 0; turn settled at frame 40 (667 ms)
  400ms short 32.3deg pan 27 (settled 43, gap 16)
  500ms short 19.5deg pan 33 (settled 43, gap 10)
  550ms short 13.1deg pan 36 (settled 43, gap 7)
  600ms short 6.7deg pan 39 (settled 43, gap 4)
  650ms short 0.3deg pan 42 (settled 43, gap 1)
  700ms short 0.0deg pan 43 (settled 43, gap 0)
  750ms short 0.0deg pan 43 (settled 43, gap 0)
  1500ms short 0.0deg pan 43 (settled 43, gap 0)
 Test Files  1 passed (1)
      Tests  1 passed (1)
```

"short" is the angle between the hook's look and the asked yaw; "pan" the page's at that frame; "settled" the pan of
the finished view at 1.5 s. A reload panned at 550-600 ms and compared with the settled view gives the runs' 4-7.

## 6. The browser run that would confirm it (not run)

From `socomlegacy/`, under the host's lock rules (a browser run), on an agent port (`E2E_PORT` from 5303 up; the spec's
own server on `REMOTE_COMBAT_MP_PORT`, 8813 by default):

`E2E_PORT=<port> npx playwright test packages/viewer/e2e/remoteCombat.spec.ts --workers=1`

1. **The probe (the lane head, a throwaway edit, not committed):** right before `b.bringToFront()` (:323) read
   `const early = await look(c)`, and log `panGap(yawTo([0, 0, 0], early.dir), fromC + 90)` beside the :337 line.
   Confirmed if a red run shows the view still 5 degrees or more short of the asked yaw there; between 0.5 and 5
   suggestive only (the camera's hold, next, may make up the rest); refuted if it is under 0.5 -- then the turn had ended before the reload and the cause is elsewhere (the next read: the eye's distance
   between :323 and :334, `camera().pass`).
2. **The fix's RED/GREEN:** with PAR-38a's wait (§7), test 1 green alone **three times** (`--repeat-each=3`: the spec
   flips with timing, so one green could be luck); with it reverted, red at :339 as on 2026-10-11 23:58Z, also repeated (`--repeat-each=3`: a race, so one red is not
   proof either).

## 7. The proposed fix row

| Row | What | Size | Files | Evidence owed |
| --- | --- | --- | --- | --- |
| PAR-38a | `remoteCombat.spec.ts` test 1 waits for CHARLIE's view to finish the quarter turn before BRAVO reloads: replace the flat `await c.waitForTimeout(500);` (:320) with a poll of `look(c)` until its yaw is within 0.5 degrees of `fromC + 90` and its eye moved under 0.05 units over 400 ms (as `walkUntil` waits on the feet, :208-209) **and the camera's hold is
over** (`camera().pass.hold <= 0`: a turn past a surface pulls the eye in and holds it `CAM_HOLD` 1.5 s,
`playerCamera.ts` :123, :170-175, then lets it out -- the review's finding 2), timeout 15 s, with a comment citing the stick's law (OT.R38, 2.236 rad/s: 0.67 s for this turn). Two or three lines, the spec only; the bound of 3 kept. Optionally, §5's scratch test committed as a unit pin (`packages/viewer/test/remoteReloadPan.test.ts`: the page's pan equals `panFor` for the same camera at every frame of the turn). | S 1 | `packages/viewer/e2e/remoteCombat.spec.ts` (and the optional unit test) | §6's probe and RED/GREEN in a browser slot; then #118 closed with the run quoted, its closing bar's cause corrected (the spec's sampling time, not the bound and not the page) |

Alternatives, not proposed: widening the bound (it would hide a real mis-place of up to the widened angle); reading
`want` before BRAVO's reload (still racy: the camera can move between that read and the sound); a hook field logging
the listener's matrix with each `recent` play (exact, but a change to the page's hook for one spec).

## 8. Not settled

- When the reload reached CHARLIE's page in the red runs (§3.3's 0.55-0.6 s is inferred from the gap and the law).
- The eye's distance on Frostfire in those runs (§3.3's 20.7-20.9 is inferred from `want`).
- Whether the original re-pans a playing one-shot as its camera moves: `FUN_00342670` sets the pan in the call that
  starts it; whether a later call retunes the voice is not read here. The port pans once at the start (research 81
  §0); the spec compares that value, so the diagnosis does not depend on it.
- `FUN_005c2a90` (the reload at the actor) is cited as `audio.ts` cites it, not re-read for this note.
