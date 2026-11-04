# 253 -- WEAPON EXCHANGE as one part (PAR-1)

Written 2026-10-08 for PAR-1 of web sprint PARITY-1 ([the plan](../plans/2026-10-08-web-sprint-parity.md), its row PAR-1,
ruling PAR.R3; seat C, wave 1, headless) on `agent/par1`, cut from `agent/parity` at f76051f4 (main 96c9fcae with ACT,
research 230 and the adopted plan). The audit's row A.1 ([research 230](230-gameplay-feel-parity-audit.md); the
controller's row, its anchors pinned to an older base and re-located here on f76051f4) found WEAPON EXCHANGE and the
dead's prompt wired in `/testroom`'s `main.ts` alone: the menu-launched match had neither. This note is the part that
moves them out of `main.ts` -- `packages/viewer/src/matchExchange.ts`, `mountExchange` -- the shape research
[222](222-the-match-on-one-wiring.md) §7-§9 gives a moved part (`./matchSound`, `./matchThrow`, `./matchActions`), and
the exact wiring hunks wave 4's integrator applies to the HOT files (PAR.R3: `main.ts`, `matchMount.ts`, `matchCore.ts`,
`matchNet.ts` are not this row's to write). No game, emulator, browser or server was run.

**Confidence.** Every behaviour the part carries is `main.ts`'s own on f76051f4, at the confidence its notes give it:
the gate, the screens, the confirm and the reset are research [94](94-the-arsenal.md) part 2's transcription of the
decompilation (**reading**); the input ownership past a close is research [300](300-original-weapon-exchange.md) §3's
browser safeguard (an **adaptation**, labelled so there; its disc findings are "reading, pending review"). The part
itself -- that it is `main.ts`'s lines, line for line -- is **reading, pending review** (a reviewer re-reads §2 against
`main.ts` at f76051f4). Nothing here is proven: no capture of the original's WEAPON EXCHANGE has been scored.

## 0. Answers

| # | finding | where |
|---|---|---|
| R253.1 | **One part**: `mountExchange(deps)` holds the menu (`WeaponExchange`), its input ownership (`ExchangeInput`), the confirm through the page's match, the context, the gate, the prompt, the pad's edges and step, the overlay, the room's answer, the round's reset, the hook's read and the blur, as `main.ts` runs them | §1, §2 |
| R253.2 | **The pages call it by name**, in `main.ts`'s order: the edges, then the step (ORed with the page's other screens), then the ownership (`input.frame`), all before the trigger lane, the R2 inventory and `playerLanes`; the frame's `frame()` after `acts.followNet()` | §1, §3 |
| R253.3 | **`answered` is no `NetPage` dep**: it is a page addition (`MatchNetHooks`) that `./matchNet`'s shared `loadoutAnswer` runs, so the brief's `PART_DEPS.exchange` cannot list it (`PART_DEPS` is typed by `NetPageDeps`' keys). The nearest correct form is a sibling table, `PART_HOOKS.exchange: ['answered']`, with `PART_DEPS`' rule -- owed from a page with the part on, refused from one with it off, at run time and by the typecheck (`PageHooks<C>`) | §3.4 |
| R253.4 | **The flag stays off** in this row (`FRONT_END_CAPABILITIES.exchange: false`, `matchCore.ts` is HOT); the pins that hold today's state are marked "flips at wave 4" in `test/matchExchange.test.ts` and listed in §3.5 | §3.5 |
| R253.5 | **The touch half is PAR-5's**: the touch button `#tw-weapons`, the canvas's taps and `showWeaponsButton` stay `main.ts`'s, through the destructured names; the key `I` stays a development build's (OT.R29) | §4 |
| R253.6 | **The blur forgets the held keys; it does not close the menu** -- `main.ts:288` as it is; the brief's "the blur closing it" is recorded, not applied (no original: a browser adaptation) | §5 |

## 1. The contract

`mountExchange(deps: MatchExchangeDeps): MatchExchange` (`packages/viewer/src/matchExchange.ts`). Nothing in it imports
`./main` or reads page markup (OT.R12); every dependency is read at a call, so a page may make its match and map after the
part.

| dep | `/testroom` (§3.1) | the front end (§3.2) |
|---|---|---|
| `net()`: the gate, the prompt, `requestLoadout` | `net` | `net` (the lobby's adopted client) |
| `map()`: the arsenal and the valves | `loaded` | `map` |
| `side()` | `matchSide` | `side` |
| `loadouts`: `confirm`, `base`, `pending`, `loadout`, `picks` | the page's `PlayerLoadout` | the match's `PlayerLoadout` |
| `walking()`: the prompt's only place | `playOn && walk.mode() === 'walk'` | `walk.mode() === 'walk'` |
| `device()`: the prompt's `%c` | `promptDevice()` (pad, touch or key) | `'pad'` (a controller only, OT.R29; touch is PAR-5's) |
| `win`: the blur | `globalThis` | the match's window |
| `clock` (optional) | `performance.now() / 1000` | the same |

| returns | what | `main.ts` on f76051f4 |
|---|---|---|
| `menu`, `input` | the `WeaponExchange` and the `ExchangeInput`: `/testroom` destructures them as `exchange` and `exchangeInput`, so its keys, touch button, taps, ARMORY ownership and hook read them unchanged | 287, 289 |
| `refresh()`, `frame()` | the context kept current on the map, the match and the side; `frame()` is the frame's line | 305-312; 1573 |
| `gate()`, `prompt()` | `exchangeGate`, `promptInfo` | 439-441; 447-450 |
| `edges(down)`, `hold(down)` | the buttons pressed since the last frame (the context refreshed after); the loading hold's baseline | 1158, 1196-1200; 1173 |
| `pad(edges)` | the menu's step: closed, R2 through the gate; open, the edges -- whether it holds the pad | 1207 |
| `overlay(frame, sizes)` | the menu and the prompt on the HUD's layer 1 | 256-257 |
| `answer(kit)`, `reset()` | the room's or the ARMORY's kit on the rows; the round's reset over the spawn's kit (S8) | 406; 1726, 1779, 1794 |
| `netHooks()` | `{ answered }`, the part's `MatchNetHooks` addition | 1723 |
| `state()` | the hook's `weaponSelect()` less `/testroom`'s touch button | 2149-2158 |
| `dispose()` | the blur's listener off, the held keys forgotten, the menu closed for good (no context set again) | -- (the front end's teardown) |

## 2. The lines `main.ts` hands it

Each row: the line on f76051f4, the part's line, the original's source as its note gives it. `test/matchExchange.test.ts`
("main.ts holds WEAPON EXCHANGE's lines today ...") pins each pair by text; it flips at wave 4 (§3.5).

| `main.ts` (f76051f4) | the part | source |
|---|---|---|
| 287-288 `new ExchangeInput()`, the window's `blur` | `input`, `d.win`'s `blur` | research 300 §3 (browser safeguard) |
| 289-291 `new WeaponExchange({ clock, opensOn })` | the same, `d.loadouts.pending(d.side()) ?? d.loadouts.base(d.side())` | `FUN_0023e370` D:L88306 (the lists open on the type's kit; research 94 §B6) |
| 292-298 the confirm: `loadouts.confirm` with `compactPicks`, the refusal's kit shown again, `net?.requestLoadout` | the same through `d` | `FUN_0023e5e0` D:L88379 (the confirm writes the type's kit); protocol 7 (`PICK_WIRE_READING`, research 94 §B placeholders) |
| 300-304 `exchangeContext` | `context` | research 94 §A5.2 (`FUN_0023c390`: the side's valves) |
| 305-312 `refreshExchange` (the key `[loaded, net, matchSide()]`) | `refresh` (`[d.map(), d.net(), d.side()]`) | -- (page bookkeeping) |
| 438-441 `exchangeGate` | `gate` (`NO_MATCH`) | `FUN_001f7ff0` D:L56648-56661 (research 94 §B2) |
| 446-450 `promptInfo` | `prompt` | `FUN_001f97b0` D:L56980 (S1 / S1g; the lines D:L57000-57007, research 91) |
| 256-257 `exchange.draw(frame, sizes, promptInfo())` | `overlay` | research 94 §B5 (layer 1) |
| 1157-1158, 1173, 1196-1200 `padButtonsLast`, the hold's baseline, the edges, the refresh | `edges`, `hold` | `FUN_002d9ff0` D:L179130 (the just-pressed edge, no repeat; research 94 §B3) |
| 1207 `edges.size ? exchange.pad(edges, exchangeGate()) : exchange.isOpen()` | `pad` | `FUN_00597740(ctrl, 1, 0)` D:L88370 (HUD mode 1 while open) |
| 1723 `answered: (l) => { exchange.answer(l); }` | `netHooks().answered` | protocol 7's answer (research 94 §B6) |
| 1726, 1779, 1794 `exchange.reset(loadouts.loadout())` | `reset` | `FUN_002a7d40` D:L149757 -> `FUN_001fb790` D:L57684 -> `FUN_00240d50` (S8) |
| 2149-2158 the hook's `weaponSelect` | `state` (less `touchButton`) | -- (a development build's instrument) |

**Stays `main.ts`'s** (each reads the part through the destructured names, unchanged): 406 the ARMORY's `exchange.answer`;
489-490, 508, 519 the firearm's, TAUNTS' and SETUP TAUNTS' `exchange.isOpen()`; 559-589 the keys (`I` and the menu's
keys, a development build's only, OT.R29); 1180-1183 the hold's ownership; 1209 `input = exchangeInput.frame(input, menu)`;
1223-1225 the trigger let go under a screen; 1256-1289 the touch button, the taps and `showWeaponsButton` (PAR-5, §4);
1721 `menuOpen`; 1780 and 1795 `refreshExchange()` after each reset (the §3 hunk keeps both); 2162 `weaponSelectKey`.

## 3. The front end's mount: the hunks for wave 4's integrator

Applied together, in the order below, from the repository's root (`git apply <file>`): each was checked with
`git apply --check` on `agent/par1` at this row's commit, and the whole set was tried in the worktree before this note
was written -- applied, then `tsc --noEmit -p packages/viewer` (no error but the base's two in `test/parity/`, research
230's probes: `inputTiming.test.ts:23`, `rootMotion.test.ts:30`, the same without the hunks), then one vitest file a run
with `--maxWorkers=1` (the trial ran before the cancel and own-close cases of da25aae1: the file holds 31 tests now, 32 after the flip): `matchExchange.test.ts` 28 passed, `matchNet.test.ts` 21, `matchCore.test.ts` 9,
`matchLanes.test.ts` 8, `armoryGlue.test.ts` 12, `matchMount.test.ts` 86 -- and reverted (nothing of it committed by this
row). The integrator re-runs them on the merged tree; line numbers are f76051f4's plus this row's files.

### 3.1-3.4 The sources: `main.ts`, `matchCore.ts` (the flag), `matchMount.ts` (the mount), `matchNet.ts` (`PART_HOOKS`)

- **`main.ts`**: the construction, the context, the refresh, the gate and the prompt become `mountExchange`'s call and one
  destructuring line; the overlay, the edges, the step, the frame's refresh, `answered`, the three resets and the hook
  call the part. `promptDevice` stays (it reads `/testroom`'s pads and touch layer).
- **`matchCore.ts`**: `FRONT_END_CAPABILITIES.exchange: true`.
- **`matchMount.ts`**: the part mounted after TAUNTS; the firearm's `blocked`, TAUNTS' `otherMenu` and `menuOpen` with
  `exchange.isOpen()` (`main.ts`'s three); its overlay first on the HUD's layer with its triangles (`main.ts`'s); its
  `answered` and its reset in the respawn; the pad's frame as `main.ts`'s -- the hold's baseline and ownership, the edges,
  `menu = chat.owns || exchange.pad(edges)`, the ownership before `firearm.triggerLane`, the R2 inventory skipped and the
  XR-06 cancel, `fly.setInputSuspended`, `walk.holdForMenu` and `playerLanes` on that `menu`; `exchange.frame()` after
  `acts.followNet()`; the hook's `weaponSelect`; `exchange.dispose()` at the teardown; `MATCH_MOUNT_PARTS_PLACEHOLDER`
  with WEAPON EXCHANGE in its mounted half.
- **`matchNet.ts`**: `PART_HOOKS` (R253.3) and `PageHooks<C>` on `matchNetDeps`' second argument, with the run-time check
  beside `PART_DEPS`'.

```diff
diff --git a/socomlegacy/packages/viewer/src/main.ts b/socomlegacy/packages/viewer/src/main.ts
--- a/socomlegacy/packages/viewer/src/main.ts
+++ b/socomlegacy/packages/viewer/src/main.ts
@@ -55,6 +55,6 @@ import { onlineChoiceAddress, readShare, updateAddress } from './shareUrl';
 import { devMode, startSource } from './source';
 import { kitParam, PlayerLoadout } from './loadout';
-import { compactPicks, frameOfPoint, padButtonsDown, WeaponExchange, type MatchGate } from './weaponExchange';
-import { ExchangeInput } from './exchangeInput';
+import { frameOfPoint, padButtonsDown } from './weaponExchange';
+import { mountExchange } from './matchExchange';
 import { Armory, armoryNames, profileKey, parseProfile, type ArmoryWorld } from './armory';
 import { ARMORY_SEND_NOW_S, armorySend as makeArmorySend } from './armorySend';
@@ -64,7 +64,5 @@ import { PULL_OUT_SECONDS, type ArmoryExit } from './armoryState';
 import type { ArmoryData } from './armoryData';
 import { roundScreenBitmaps } from './roundScreens';
-import type { InputDevice, PromptInfo } from './weaponSelect';
-import type { MenuContext } from './weaponSelectState';
-import type { PadButton } from './gamepad';
+import type { InputDevice } from './weaponSelect';
 import { onlineLine, onlineToast, pageIsLocal, readOnline, resolveOnline, writeOnline, type OnlineChoice, type OnlineTarget } from './online';
 import { readRules, resolveRules } from './rules';
@@ -255,5 +253,5 @@ hud.setOverlay((frame, sizes) => {
   const tac = tacMap.layout(frame, loaded?.tac ?? null, feetXZ() ?? [0, 0], fly.pose().yaw, sizes);
   // WEAPON EXCHANGE and the dead's prompt (web sprint 4, M8; `./weaponExchange`), over the in-round HUD on layer 1.
-  const ws = exchange.draw(frame, sizes, promptInfo());
+  const ws = exchangePart.overlay(frame, sizes);
   // The R2 inventory alive (`./inventoryMenu`), on the same layer.
   const inv = inventory.draw(frame, sizes);
@@ -280,35 +278,16 @@ const sound = mountSound({ audio: gameAudio, walk, fly, loadouts, side: matchSid
 const { walkSounds, roundAudio, ears } = sound;
 /**
- * WEAPON EXCHANGE in the match (web sprint 4, M8/M9; research 94 part 2, `./weaponExchange`): opened dead in the match
- * by the pad's R2, the key `I` or the touch button; each confirm adds the pick to the side's list (`PlayerLoadout.
- * confirm`) and sends the list as the `loadout` request -- through the page's own room offline, the server's socket
- * online (protocol 7) -- whose answer is the kit shown and spawned with at the next round (R94.3).
+ * WEAPON EXCHANGE in the match (web sprint 4, M8/M9; research 94 part 2): the one part both pages mount (`./matchExchange`,
+ * PAR-1: research 253) -- opened dead in the match by the pad's R2, the key `I` or the touch button; each confirm adds
+ * the pick to the side's list (`PlayerLoadout.confirm`) and sends the list as the `loadout` request -- through the
+ * page's own room offline, the server's socket online (protocol 7) -- whose answer is the kit shown and spawned with at
+ * the next round (R94.3). Its names are destructured from the part, so the keys, the touch button and its taps (PAR-5's),
+ * the ARMORY's ownership and the hook read them unchanged.
  */
-const exchangeInput = new ExchangeInput();
-globalThis.addEventListener('blur', () => exchangeInput.blur());
-const exchange = new WeaponExchange({
-  clock: () => performance.now() / 1000,
-  opensOn: () => loadouts.pending(matchSide()) ?? loadouts.base(matchSide()),
-  confirm: (pick) => {
-    const side = matchSide(), ctx = exchange.context();
-    const list = loadouts.confirm(side, pick, (l) => (ctx ? compactPicks(ctx, loadouts.base(side), l) : [...l]));
-    // A list past MAX_LOADOUT_PICKS is not taken: the menu shows the kit held again.
-    if (!list) { exchange.answer(loadouts.pending(side) ?? loadouts.base(side)); return; }
-    net?.requestLoadout(list);
-  },
+const exchangePart = mountExchange({
+  net: () => net, map: () => loaded, side: matchSide, loadouts, win: globalThis,
+  walking: () => playOn && walk.mode() === 'walk', device: () => promptDevice(),
 });
-/** The menu's world: the map's arsenal and valves, the page's side; none without the kit tables or a match. */
-function exchangeContext(): MenuContext | null {
-  const a = loaded?.arsenal;
-  return a && net ? { arsenal: a.table.arsenal, valves: a.map?.valves ?? new Map(), side: matchSide() } : null;
-}
-let exchangeKey: unknown[] = [];
-/** The context kept current (a new map, a match joined or left, a side changed). */
-function refreshExchange(): void {
-  const key = [loaded, net, matchSide()];
-  if (key.every((k, i) => k === exchangeKey[i])) return;
-  exchangeKey = key;
-  exchange.setContext(exchangeContext());
-}
+const { menu: exchange, input: exchangeInput, refresh: refreshExchange, gate: exchangeGate, prompt: promptInfo } = exchangePart;
 /**
  * The pre-round ARMORY (web sprint 5 S3, W5.R1-R4; `./armory`): opened on a seat the room opens it on (the welcome's or
@@ -436,17 +415,8 @@ function armoryOpenOrDone(): void {
   const go = soloAfterArmory; soloAfterArmory = null; go?.();
 }
-/** WEAPON EXCHANGE's gate (`NetPage.gate`): no match, no menu. */
-function exchangeGate(): MatchGate {
-  return net ? net.gate() : { inMatch: false, alive: true, cameraOnSelf: true, spectator: false };
-}
 /** The device the prompt's `%c` is drawn for: a pad's R2 when one is connected, the touch label on a touch screen, else the key. */
 function promptDevice(): InputDevice {
   return pads.count() > 0 ? 'pad' : wantsTouchControls() ? 'touch' : 'keyboard';
 }
-/** The dead's prompt (S1 / S1g) for the overlay, or null. */
-function promptInfo(): PromptInfo | null {
-  const p = playOn && walk.mode() === 'walk' ? net?.prompt() ?? null : null;
-  return p ? { ghost: p.ghost, device: promptDevice(), sinceDeath: p.sinceDeath } : null;
-}
 // ---- W2.2b: the play mode -- the walk with the body, the game's clips on the mover (`./play`, `./animator`) ---------
 /**
@@ -1155,6 +1125,4 @@ let padMerged: Input = noInput();
 /** What the game's lanes read last frame: the merged input less the lanes the R2 inventory holds (`InventoryMenu.frame`). */
 let padGame: Input = noInput();
-/** The pad's buttons down last frame, by name (WEAPON EXCHANGE's edges: `menuInputOfPad`). */
-let padButtonsLast = new Set<PadButton>();
 /** XR-06: the screen over the game last frame (the ARMORY, a menu), for the cancel on its opening. */
 let menuOver: CancelCause | null = null;
@@ -1171,5 +1139,5 @@ function padFrame(dt: number): void {
     pads.poll(navigator);
     const held = gamePad.poll(navigator);
-    padButtonsLast = padButtonsDown(held);
+    exchangePart.hold(padButtonsDown(held));          // WEAPON EXCHANGE's edges taken against the pad as it is
     // The original's flush at the state's start (research 116 R116.13; `./padFlush`): the edges are taken against the
     // pad as it is, so a button held through the release is held, not pressed, and a stick is live at once.
@@ -1196,7 +1164,5 @@ function padFrame(dt: number): void {
   // Start and R2 step it, and the game's own lanes below take nothing (HUD mode 1).
   const down = padButtonsDown(polled);
-  const edges = new Set([...down].filter((b) => !padButtonsLast.has(b)));
-  padButtonsLast = down;
-  refreshExchange();
+  const edges = exchangePart.edges(down);              // the buttons pressed this frame; the menu's context kept current
   // TAUNTS (`./matchTaunts`): `?devmode`'s SETUP TAUNTS, then the Chat menu -- open, the pad is its (research 301 §7).
   const editorOwns = tauntDev?.frame(performance.now(), down) ?? false;
@@ -1205,5 +1171,5 @@ function padFrame(dt: number): void {
   document.body.classList.toggle('is-taunts-open', chat.owns || editorOwns);   // the page's chrome off the menu (`./styles.css`)
   // The ARMORY (web sprint 5 S3): open, the pad is its; no button opens it (the owner's ruling, 2026-10-02).
-  const menu = editorOwns || chat.owns || playOn && (armory.isOpen() ? armory.pad(edges) : edges.size ? exchange.pad(edges, exchangeGate()) : exchange.isOpen());
+  const menu = editorOwns || chat.owns || playOn && (armory.isOpen() ? armory.pad(edges) : exchangePart.pad(edges));
   // Browser safeguard: no consumed button becomes a game press/release after close or round reset.
   input = exchangeInput.frame(input, menu);
@@ -1571,5 +1537,5 @@ async function boot(): Promise<void> {
     // back unlocked (`NetClient.release`), so the reset's turret release unlocks nothing (the new client's lock stands).
     acts.followNet();
-    refreshExchange();
+    exchangePart.frame();           // WEAPON EXCHANGE's context kept current (`./matchExchange`)
     showWeaponsButton();            // WEAPON EXCHANGE's touch button, with the dead's prompt
     doors.frame(dt);                // DOORS: the swings (the server's, in a match)
@@ -1721,8 +1687,8 @@ function connectNet(map: LoadedMap): void {
     menuOpen: () => loadingJoin.blocked || exchange.isOpen() || armory.isOpen() || taunts.isOpen(),
   }, {
-    answered: (l) => { exchange.answer(l); },       // the menu shows the kit the room will spawn the player with
+    ...exchangePart.netHooks(),                     // answered: the menu shows the kit the room will spawn the player with
     // The pouch too at a spawn -- the page's spent rings do not outlive a death or a round; the round's reset closes
     // WEAPON EXCHANGE over the kit the spawn took (S8).
-    respawned: () => { grenade.refill(); exchange.reset(loadouts.loadout()); },
+    respawned: () => { grenade.refill(); exchangePart.reset(); },
     // XR-06 (research 214 s4): a death cancels the action button's hold -- nothing fires, the release after it neither.
     died: () => { cancelAction('death'); },
@@ -1777,5 +1743,5 @@ function connectNet(map: LoadedMap): void {
       net = new NetPage({ ...deps, socket: solo.socket, solo: true, joined: () => {}, armory: false }, 'loopback:', stem, playerName(), undefined, false, RULES);
       acts.follow(net.client);                     // wave 4: the pages follow the offline room as an online one
-      exchange.reset(loadouts.loadout());
+      exchangePart.reset();
       refreshExchange();
       showOnline();
@@ -1792,5 +1758,5 @@ function connectNet(map: LoadedMap): void {
     }
   }
-  exchange.reset(loadouts.loadout());                 // a new match: the menu closed
+  exchangePart.reset();                               // a new match: the menu closed
   refreshExchange();
   showOnline();
@@ -2147,14 +2113,5 @@ window.__viewer = {
   openArmory: () => openArmory(),
   armoryKey: (code) => armory.key(code),
-  weaponSelect: () => {
-    const st = exchange.state();
-    const prompt = promptInfo();
-    return {
-      screen: st.screen, slot: st.slot, category: st.category, item: st.item, loadout: [...st.loadout], picks: st.picks.map((p) => ({ ...p })),
-      sent: loadouts.picks(matchSide()).map((p) => ({ ...p })), gate: exchangeGate(),
-      prompt: prompt ? exchange.layout(prompt).items.filter((i) => i.part === 'prompt').map((i) => (i.kind === 'text' ? i.text : '')) : null,
-      touchButton: weaponsButton ? !weaponsButton.hidden : null,
-    };
-  },
+  weaponSelect: () => ({ ...exchangePart.state(), touchButton: weaponsButton ? !weaponsButton.hidden : null }),
   taunts: () => ({ ...taunts.state(), ...tauntDevState() }),   // TAUNTS (`./matchTaunts`), `?devmode`'s SETUP TAUNTS
   chat: () => chat.state(),                                    // TACTICAL ORDERS and MESSAGES (`./matchChat`)
diff --git a/socomlegacy/packages/viewer/src/matchCore.ts b/socomlegacy/packages/viewer/src/matchCore.ts
--- a/socomlegacy/packages/viewer/src/matchCore.ts
+++ b/socomlegacy/packages/viewer/src/matchCore.ts
@@ -90,8 +90,9 @@ export const TESTROOM_CAPABILITIES = Object.freeze({
  * since ACT-5 (ruling ACT.R5, research 250 §6; HX.R8's row) the hostages' orders and marks -- unreachable from the lobby
  * until Desert Glory is listed (ruling ACT.R6), since TAUNTS (research 301) the Chat menu's taunts (`./matchTaunts`), and
- * since Chris's settings (research 302) its TACTICAL ORDERS and MESSAGES (`./matchChat`) -- of the switchable parts.
+ * since Chris's settings (research 302) its TACTICAL ORDERS and MESSAGES (`./matchChat`), and since PAR-1 (research 253)
+ * WEAPON EXCHANGE and the dead's prompt (`./matchExchange`) -- of the switchable parts.
  */
 export const FRONT_END_CAPABILITIES = Object.freeze({
-  firearm: true, throwables: true, launcher: true, worldDrops: false, armory: false, exchange: false, inventory: true,
+  firearm: true, throwables: true, launcher: true, worldDrops: false, armory: false, exchange: true, inventory: true,
   doors: true, actions: true, traversal: true, sound: true, touch: false, tacMap: false, shadow: false, hostages: true, taunts: true,
   chat: true,
diff --git a/socomlegacy/packages/viewer/src/matchMount.ts b/socomlegacy/packages/viewer/src/matchMount.ts
--- a/socomlegacy/packages/viewer/src/matchMount.ts
+++ b/socomlegacy/packages/viewer/src/matchMount.ts
@@ -31,4 +31,5 @@ import { mountFirearm, type MatchFirearm } from './matchFirearm';
 import { FRONT_END_CAPABILITIES, feedCamera, liftFog, mapFog, matchSide, setRemoteMap, standOf } from './matchCore';
 import { matchNetDeps } from './matchNet';
+import { mountExchange, type ExchangeState } from './matchExchange';
 import { playerLanes, type LaneParts } from './matchLanes';
 import { mountSound, silentOut, type MatchAudio } from './matchSound';
@@ -90,11 +91,12 @@ import { mouseSite } from './mouseTesting';
  * switches, the bomb, the turrets) and the traversal (ladders, climbs, the peek, the water), and since ACT-5 the hostages'
  * orders and marks (HX-4a/HX-5, research 239 s7, 250 s6; ruling ACT.R5: unreachable from the lobby until Desert Glory is
- * listed, ruling ACT.R6), and since TAUNTS the Chat menu's taunts (`./matchTaunts`, research 301). Not mounted yet (`FRONT_END_CAPABILITIES`' parts that are off): the world drops (their pickup is
- * the action part's; H120), WEAPON EXCHANGE (`./weaponExchange`), the ARMORY (the game socket's hello asks for none, so no
+ * listed, ruling ACT.R6), and since TAUNTS the Chat menu's taunts (`./matchTaunts`, research 301), and since PAR-1 WEAPON
+ * EXCHANGE and the dead's prompt (`./matchExchange`, research 253). Not mounted yet (`FRONT_END_CAPABILITIES`' parts that are off): the world drops (their pickup is
+ * the action part's; H120), the ARMORY (the game socket's hello asks for none, so no
  * seat waits for it), the touch layer, the tactical map, the character shadow. The original's match has every one
  * (research 166 §8); the evidence that settles it is each part mounted here and a two-page browser run.
  * [placeholder]
  */
-export const MATCH_MOUNT_PARTS_PLACEHOLDER = 'world, walk, bodies, HUD, the match, the firearm and its effects, the sound, the throwables, the launcher and the R2 inventory, the doors, the actions (the switches, the bomb, the turrets), the traversal, the hostages (unreachable from the lobby until Desert Glory is listed: ACT.R6) and the Chat menu taunts, its tactical orders and messages; world drops, exchange, armory, touch, tactical map and shadow not yet' as const;
+export const MATCH_MOUNT_PARTS_PLACEHOLDER = 'world, walk, bodies, HUD, the match, the firearm and its effects, the sound, the throwables, the launcher and the R2 inventory, the doors, the actions (the switches, the bomb, the turrets), the traversal, the hostages (unreachable from the lobby until Desert Glory is listed: ACT.R6) and the Chat menu taunts, its tactical orders and messages, and WEAPON EXCHANGE (exchange); world drops, armory, touch, tactical map and shadow not yet' as const;
 
 /** The window the match runs its frames and listens on (the page's; the tests' fake). */
@@ -214,4 +216,6 @@ export interface MatchWindowHook {
   worldStates: ViewerHook['worldStates'];
   worldActive: ViewerHook['worldActive'];
+  /** PAR-1: `/testroom`'s `weaponSelect()` less its touch button (`./matchExchange` `state`). */
+  weaponSelect(): ExchangeState;
   /** `/testroom`'s `weaponSelect().gate.alive` (`NetPage.gate`): a player, alive, not a ghost; no match, true. */
   alive(): boolean;
@@ -345,5 +349,5 @@ export function mountMatch(target: HTMLElement, o: MatchMountOptions): MountedMa
   const firearm: MatchFirearm = mountFirearm({
     scene, fly, walk, play, remote, hud, loadouts, view: () => view, map: () => map, body: () => ownBody.view(), net: () => net,
-    blocked: () => (o.blocked?.() ?? false) || taunts.isOpen(), refreshFog: (lens) => { fogLens = lens; refreshFog(); }, sound: sound.firearm,
+    blocked: () => (o.blocked?.() ?? false) || exchange.isOpen() || taunts.isOpen(), refreshFog: (lens) => { fogLens = lens; refreshFog(); }, sound: sound.firearm,
     hands: throws.hands({ trigger: (down) => acts.trigger(down), magazine: () => acts.hudAmmo(), mounted: () => acts.mounted() }),
     mountedMuzzle: (id) => acts.turrets.muzzleOf(id),   // ACT-2: `./main`'s MAP-10b -- a mounted body's rounds leave the turret's firepoint
@@ -377,10 +381,16 @@ export function mountMatch(target: HTMLElement, o: MatchMountOptions): MountedMa
   const taunts = mountTaunts({
     net: () => net, hud, audio: sound.audio, custom: () => o.taunts?.() ?? [], release: () => { throws.grenade.cancelMenuHold(); firearm.held(); },
-    otherMenu: () => (o.blocked?.() ?? false) || throws.inventory.isOpen(), entries: chat.entries,
+    otherMenu: () => (o.blocked?.() ?? false) || exchange.isOpen() || throws.inventory.isOpen(), entries: chat.entries,
   });
-  // `./main`'s overlay: the R2 inventory and TAUNTS on the HUD's layer (no tactical map, no WEAPON EXCHANGE here).
+  // PAR-1 (research 253): WEAPON EXCHANGE and the dead's prompt -- `/testroom`'s (`./matchExchange`), on the lobby's
+  // client and the map; the prompt's `%c` the pad's R2 (the match is played on a controller, OT.R29; the touch half is
+  // PAR-5's).
+  const exchange = mountExchange({
+    net: () => net, map: () => map, side, loadouts, win, walking: () => walk.mode() === 'walk', device: () => 'pad',
+  });
+  // `./main`'s overlay: WEAPON EXCHANGE, the R2 inventory and TAUNTS on the HUD's layer (no tactical map here).
   hud.setOverlay((frame, sizes) => {
-    const inv = throws.inventory.draw(frame, sizes), chat = taunts.draw(frame, sizes);
-    return inv.quads.length || chat.quads.length ? { quads: [...inv.quads, ...chat.quads], tris: [] } : null;
+    const ws = exchange.overlay(frame, sizes), inv = throws.inventory.draw(frame, sizes), chat = taunts.draw(frame, sizes);
+    return ws.quads.length || inv.quads.length || chat.quads.length ? { quads: [...ws.quads, ...inv.quads, ...chat.quads], tris: [...ws.tris] } : null;
   });
   // `./main`'s `setPlayMode`: `fire.bindKey()` (R, a development build's) -- through a target that drops every event
@@ -498,5 +508,5 @@ export function mountMatch(target: HTMLElement, o: MatchMountOptions): MountedMa
       caps: FRONT_END_CAPABILITIES, walk, remote, hud, fly, loadouts, firearm,
       clips: () => clips, map: () => map, side, followTeam,
-      menuOpen: () => (o.blocked?.() ?? false) || taunts.isOpen(),   // the hold, TAUNTS (WEAPON EXCHANGE and the ARMORY not mounted)
+      menuOpen: () => (o.blocked?.() ?? false) || exchange.isOpen() || taunts.isOpen(),   // the hold, WEAPON EXCHANGE, TAUNTS (the ARMORY not mounted)
       // A round's start (and an abandon) empties both decal pools and the air (CMPExitState L76084) and the wash: on
       // /testroom the ARMORY's glue does it; here, with no ARMORY, the parts' own (the MATCH-THROW review's finding 1).
@@ -504,5 +514,7 @@ export function mountMatch(target: HTMLElement, o: MatchMountOptions): MountedMa
       roundClear: () => { firearm.fire.clearMarks(); firearm.effects.clearFootprints(); throws.roundStart(); hostages.reset(); },
     }, {
-      respawned: () => { throws.grenade.refill(); },   // `./main`'s: the pouch too at a spawn (the page's spent rings do not outlive it)
+      ...exchange.netHooks(),                          // PAR-1: `./main`'s `answered` -- the menu shows the kit the room will spawn
+      // `./main`'s: the pouch too at a spawn (the page's spent rings do not outlive it); WEAPON EXCHANGE closed over the kit (S8).
+      respawned: () => { throws.grenade.refill(); exchange.reset(); },
       died: () => { acts.cancel('death'); },           // ACT-3: `./main`'s XR-06 (main.ts:1721) -- a death cancels the action button's hold
     }, {
@@ -580,5 +592,5 @@ export function mountMatch(target: HTMLElement, o: MatchMountOptions): MountedMa
     // frame -- the edges taken against the pad as it is (research 116 R116.13, `./padFlush`), so a button held through
     // the hold is held, not pressed, at its release, and a stick is live at once.
-    fly.setInputSuspended(held || taunts.isOpen());     // and while the Chat menu holds the pad (`./main`'s `menu`)
+    fly.setInputSuspended(held || taunts.isOpen() || exchange.isOpen());   // and while a menu holds the pad (`./main`'s `menu`)
     if (held) { throws.inventory.close(); firearm.held(); }   // `./main`'s `padFrame` under the hold: the menu closed, `fire.release()`
     if (held && acts.wiring.lifecycle.down()) acts.cancel('loading');   // ACT-3: `./main`'s (main.ts:1181) -- a Cross held into the hold let go once
@@ -589,8 +601,21 @@ export function mountMatch(target: HTMLElement, o: MatchMountOptions): MountedMa
     if (gamePad.crouch) pad.crouch = true;
     applyOptions(pad);                                 // OPTIONS (research 302 §4): the stored pitch, bob and fire-rate swap
-    if (held || !flushed) { ({ merged: padMerged, game: padGame } = flushedPad(noInput(), pad)); flushed = !held; if (held) return; }
+    if (held || !flushed) {
+      exchange.hold(padButtonsDown(polled));          // `./main`'s: WEAPON EXCHANGE's edges against the pad as it is
+      ({ merged: padMerged, game: padGame } = flushedPad(noInput(), pad));
+      // `./main`'s: a button a screen took before the hold is still owned -- the baseline holds it as released.
+      padMerged = exchange.input.frame(padMerged, false);
+      padGame = exchange.input.frame(padGame, false);
+      flushed = !held;
+      if (held) return;
+    }
+    const down = padButtonsDown(polled);
+    const edges = exchange.edges(down);                // `./main`'s: the buttons pressed this frame; the menu's context kept current
     // TAUNTS (`./matchTaunts`, research 301 §7): open, the Chat menu holds the pad -- the game's lanes take nothing.
-    const chat = taunts.pad(padButtonsDown(polled), mergeInput(pad));
-    const input = chat.input;
+    const chat = taunts.pad(down, mergeInput(pad));
+    // PAR-1: `./main`'s `menu` -- the Chat menu, else WEAPON EXCHANGE (closed, R2 opens it dead; open, the pad is its,
+    // HUD mode 1); its ownership before R1, the R2 inventory and the lanes (research 300 §3).
+    const menu = chat.owns || exchange.pad(edges);
+    const input = exchange.input.frame(chat.input, menu);
     feedCamera(fly, input, () => !!net?.spectatorCamera());   // PF-31: Triangle the spectator's while the pad is (`./matchCore`)
     const walking = walk.mode() === 'walk';
@@ -600,13 +625,13 @@ export function mountMatch(target: HTMLElement, o: MatchMountOptions): MountedMa
     firearm.triggerLane(padMerged, input);
     if (!walking && throws.inventory.isOpen()) throws.inventory.close();
-    const game = !walking ? input : throws.inventory.frame(padMerged, input, dt);
-    // ACT-3: `./main`'s XR-06 edge (main.ts:1229-1231) -- a menu's opening (the R2 inventory, the Chat menu) cancels the
-    // action button's hold before the lanes, so the Cross it takes over is no release; no ARMORY here, so no 'armory'.
-    const over: CancelCause | null = chat.owns || throws.inventory.isOpen() ? 'menu' : null;
+    const game = menu || !walking ? input : throws.inventory.frame(padMerged, input, dt);
+    // ACT-3: `./main`'s XR-06 edge (main.ts:1229-1231) -- a menu's opening (WEAPON EXCHANGE, the R2 inventory, the Chat
+    // menu) cancels the action button's hold before the lanes, so the Cross it takes over is no release; no ARMORY here.
+    const over: CancelCause | null = menu || throws.inventory.isOpen() ? 'menu' : null;
     if (over && !menuOver) { acts.cancel(over); stanceButton.reset(); }   // as the R2 inventory's `onOpened`: no tap or hold carried over
     menuOver = over;
-    fly.setInputSuspended(chat.owns);                  // this frame's menu, as `./main` suspends on its `menu`
-    walk.holdForMenu(throws.inventory.isOpen() || chat.owns);
-    playerLanes(lanes, padGame, game, dt, { walking, menu: chat.owns });
+    fly.setInputSuspended(menu);                       // this frame's menu, as `./main` suspends on its `menu`
+    walk.holdForMenu(menu || throws.inventory.isOpen());
+    playerLanes(lanes, padGame, game, dt, { walking, menu });
     padMerged = input;
     padGame = game;
@@ -634,4 +659,5 @@ export function mountMatch(target: HTMLElement, o: MatchMountOptions): MountedMa
     net?.frame(dt, fly.camera, firearm.fire.triggerHeld() || acts.triggerHeld());   // ACT-1: `./main`'s -- the turret's trigger too
     acts.followNet();                                  // ACT-1: `./main`'s fix round -- a reconnect's new client followed at once
+    exchange.frame();                                  // PAR-1: `./main`'s -- WEAPON EXCHANGE's context kept current
     doors.frame(dt);                                   // ACT-1: `./main`'s DOORS -- the room's swings
     acts.turrets.frame();                              // ACT-1: `./main`'s MAP-10b -- the held turret's look clamped, every occupied gun turned
@@ -693,4 +719,5 @@ export function mountMatch(target: HTMLElement, o: MatchMountOptions): MountedMa
       hud: () => hud.state(),                          // ACT-1: the HUD's model (the bomb's marks); ACT-4's reads after `aimAt`
       taunts: () => taunts.state(),
+      weaponSelect: () => exchange.state(),            // PAR-1: `./main`'s `weaponSelect()` less the touch button (PAR-5's)
       chat: () => chat.state(),
       options: () => ({ ...(o.options?.() ?? playOptionsOf(null)), pitchInverted: fly.lookOptions().invertPitch, bob: fly.originalHeadBob }),
@@ -749,4 +776,5 @@ export function mountMatch(target: HTMLElement, o: MatchMountOptions): MountedMa
     taunts.dispose();                                  // TAUNTS: the menu closed, its held buttons and the heard list gone
     chat.dispose();                                    // TACTICAL ORDERS and MESSAGES: the map's records and the heard list gone
+    exchange.dispose();                                // PAR-1: the window's blur listener let go, the menu closed for good
     firearm.dispose();
     sound.dispose();                                   // MATCH-SOUND: the ears, the cues, the map's banks and beds
diff --git a/socomlegacy/packages/viewer/src/matchNet.ts b/socomlegacy/packages/viewer/src/matchNet.ts
--- a/socomlegacy/packages/viewer/src/matchNet.ts
+++ b/socomlegacy/packages/viewer/src/matchNet.ts
@@ -48,5 +48,5 @@ export interface MatchNetParts {
 /** A page's own additions to the shared hooks, each run after the shared line. */
 export interface MatchNetHooks {
-  /** The room's answer to a loadout request, as a loadout (`/testroom`: WEAPON EXCHANGE shows the kit the room will spawn). */
+  /** The room's answer to a loadout request, as a loadout: WEAPON EXCHANGE shows the kit the room will spawn (`PART_HOOKS.exchange`). */
   answered?(kit: Loadout): void;
   /** After a respawn's kit and body (`/testroom`: the pouch refilled, WEAPON EXCHANGE closed over the kit). */
@@ -80,4 +80,13 @@ export const PART_DEPS = {
 } as const satisfies Partial<Record<keyof MatchCapabilities, readonly (keyof NetPageDeps)[]>>;
 
+/**
+ * PAR-1 (research 253): the page's own additions (`MatchNetHooks`) a switchable part owns, listed as `PART_DEPS` lists
+ * the deps -- owed by a page whose switch has the part on, refused from one that has it off, at run time and by the
+ * typecheck (`PageHooks`). WEAPON EXCHANGE's `answered` (`./matchExchange` `netHooks`): the room's answer on the menu.
+ */
+export const PART_HOOKS = {
+  exchange: ['answered'],
+} as const satisfies Partial<Record<keyof MatchCapabilities, readonly (keyof MatchNetHooks)[]>>;
+
 type PartDeps = typeof PART_DEPS;
 /** The deps of the parts a switch has on (`true` as a literal): owed. */
@@ -91,8 +100,14 @@ type OffDeps<C extends MatchCapabilities> = { [K in keyof PartDeps]: C[K] extend
 export type PageDeps<C extends MatchCapabilities> =
   Partial<NetPageDeps> & Required<Pick<NetPageDeps, OnDeps<C>>> & { [K in OffDeps<C>]?: never };
+type PartHooks = typeof PART_HOOKS;
+type OnHooks<C extends MatchCapabilities> = { [K in keyof PartHooks]: C[K] extends true ? PartHooks[K][number] : never }[keyof PartHooks];
+type OffHooks<C extends MatchCapabilities> = { [K in keyof PartHooks]: C[K] extends false ? PartHooks[K][number] : never }[keyof PartHooks];
+/** A page's own hooks on its switch: the parts' it mounts owed, the parts' it does not refused (`PageDeps`' rule). */
+export type PageHooks<C extends MatchCapabilities> =
+  MatchNetHooks & Required<Pick<MatchNetHooks, OnHooks<C>>> & { [K in OffHooks<C>]?: never };
 /** The part-owned deps `NetPage` requires: an empty one stands in where the part is off. */
 const PART_DEFAULTS: Partial<NetPageDeps> = { remoteGrenade: () => {} };
 
-export function matchNetDeps<C extends MatchCapabilities>(p: MatchNetParts & { caps: C }, h: MatchNetHooks, rest: NoInfer<PageDeps<C>>): NetPageDeps {
+export function matchNetDeps<C extends MatchCapabilities>(p: MatchNetParts & { caps: C }, h: NoInfer<PageHooks<C>>, rest: NoInfer<PageDeps<C>>): NetPageDeps {
   const { caps, loadouts, firearm } = p;
   const defaults: Partial<NetPageDeps> = {};
@@ -104,4 +119,10 @@ export function matchNetDeps<C extends MatchCapabilities>(p: MatchNetParts & { c
     }
   }
+  for (const [part, keys] of Object.entries(PART_HOOKS) as [keyof MatchCapabilities, readonly (keyof MatchNetHooks)[]][]) {
+    for (const key of keys) {
+      if (!caps[part] && key in h) throw new Error(`matchNetDeps: ${key} is the ${part}'s, which this page does not mount`);
+      if (caps[part] && !(key in h)) throw new Error(`matchNetDeps: ${key} is owed: the ${part} is mounted`);
+    }
+  }
   // The round's decal and air clear (NetPage's `roundStart` and `abandoned`: CMPExitState L76084; the level left) is the
   // ARMORY's glue on `/testroom`; with the ARMORY off it is the parts' own (the MATCH-THROW review's finding 1).
```

### 3.5 The tests the flag flips

*The integrator's two notes (the review of 2026-10-08):* (1) the hunk pins the REFUSED half of `PART_HOOKS` only at run time -- add one `// @ts-expect-error` line on `Object.freeze({ ...TESTROOM_CAPABILITIES, exchange: false as const })` handing `answered`, as `PART_DEPS`' refused cases are pinned; (2) the three hunks land TOGETHER with the flag flip: `matchExchange.test.ts`'s front-end deps hand `answered` with exchange off, legal today, a throw if `PART_HOOKS` landed without the flip.

- **`test/matchExchange.test.ts`** (this row's): "main.ts holds WEAPON EXCHANGE's lines today ..." becomes "main.ts calls
  mountExchange and holds none of the lines it moved ..."; a new case pins both pages' calls of the part's steps; "the
  switch ..." and "answered is no NetPage dep ..." turn to the flag on and `PART_HOOKS.exchange`.
- **`test/matchNet.test.ts`**: `everyHook` (`{ answered }`) handed wherever a page's switch has the part on -- every
  `matchNetDeps(.., {}, ..)` call -- a run-time case (owed from both pages, refused from a switch with it off) and two
  `@ts-expect-error` lines (owed from `/testroom`'s and the front end's literal switches).
- **`test/matchCore.test.ts`**: the pinned switch's `exchange: true` (the case's title, which the registry names, kept).
- **`test/matchLanes.test.ts`**: "... the front end has no WEAPON EXCHANGE" becomes "... the front end the same since
  PAR-1", pinning the front end's ownership before its trigger lane, R2 inventory and `playerLanes`.
- **`test/matchMount.test.ts`**: the lane order's two front-end regexes on `menu`; a new case -- dead on the lobby's
  client, the dead's prompt on the hook's `weaponSelect`, the gate `NetPage`'s, the spawn taking it away, the blur's
  listener gone at the teardown.

```diff
diff --git a/socomlegacy/packages/viewer/test/matchCore.test.ts b/socomlegacy/packages/viewer/test/matchCore.test.ts
--- a/socomlegacy/packages/viewer/test/matchCore.test.ts
+++ b/socomlegacy/packages/viewer/test/matchCore.test.ts
@@ -27,5 +27,6 @@ describe('the match capabilities: one switch for what each page mounts', () => {
   it('the front end mounts the firearm, the sound (MATCH-SOUND), the throwables, the launcher and the R2 inventory (MATCH-THROW), the doors, the action part and the traversal (ACT-1): no world drops, no ARMORY ... (pinned: a change here is deliberate)', () => {
     const pinned: MatchCapabilities = {
-      firearm: true, throwables: true, launcher: true, worldDrops: false, armory: false, exchange: false, inventory: true,
+      firearm: true, throwables: true, launcher: true, worldDrops: false, armory: false, inventory: true,
+      exchange: true,                                     // PAR-1 (research 253): WEAPON EXCHANGE and the dead's prompt (`./matchExchange`)
       doors: true, actions: true, traversal: true,       // ACT-1 (ruling ACT.R1): three flags, one mount -- the part picks among the pages
       sound: true, touch: false, tacMap: false, shadow: false,
diff --git a/socomlegacy/packages/viewer/test/matchLanes.test.ts b/socomlegacy/packages/viewer/test/matchLanes.test.ts
--- a/socomlegacy/packages/viewer/test/matchLanes.test.ts
+++ b/socomlegacy/packages/viewer/test/matchLanes.test.ts
@@ -124,5 +124,5 @@ describe('WEAPON EXCHANGE\'s held buttons ahead of the lanes (research 300 §3,
     expect(life.pickupHeld()).toBe(true);              // the prompt's hold after a claim
   });
-  it('/testroom applies the ownership before the trigger lane, the R2 inventory and playerLanes; the front end has no WEAPON EXCHANGE', () => {
+  it('/testroom applies the ownership before the trigger lane, the R2 inventory and playerLanes; the front end the same since PAR-1', () => {
     const main = src('main.ts');
     const at = (needle: string): number => { const i = main.indexOf(needle, main.indexOf('function padFrame(')); expect(i, needle).toBeGreaterThan(0); return i; };
@@ -140,6 +140,14 @@ describe('WEAPON EXCHANGE\'s held buttons ahead of the lanes (research 300 §3,
     expect(main).toMatch(/if \(!e\.repeat\) armory\.key\(e\.code\);\n\s*exchangeInput\.key\(e\.code, true, true, e\.repeat\);/);
     expect(main).toMatch(/if \(over && !menuOver\) \{ cancelAction\(over\); stanceButton\.reset\(\); \}/);
-    expect(FRONT_END_CAPABILITIES.exchange).toBe(false);
-    expect(src('matchMount.ts')).not.toMatch(/ExchangeInput|WeaponExchange/);
+    // PAR-1 (research 253): the front end mounts the one part (`./matchExchange`) and owns the pad in the same place.
+    expect(FRONT_END_CAPABILITIES.exchange).toBe(true);
+    const mount = src('matchMount.ts');
+    expect(mount).not.toMatch(/new ExchangeInput|new WeaponExchange/);
+    const m = (needle: string): number => { const i = mount.indexOf(needle, mount.indexOf('const padFrame = ')); expect(i, needle).toBeGreaterThan(0); return i; };
+    const mounted = m('const input = exchange.input.frame(chat.input, menu);');
+    expect(m('const menu = chat.owns || exchange.pad(edges);')).toBeLessThan(mounted);
+    expect(mounted).toBeLessThan(m('firearm.triggerLane(padMerged, input);'));
+    expect(mounted).toBeLessThan(m('throws.inventory.frame(padMerged, input, dt)'));
+    expect(mounted).toBeLessThan(m('playerLanes(lanes, padGame, game, dt, { walking, menu });'));
   });
 });
diff --git a/socomlegacy/packages/viewer/test/matchMount.test.ts b/socomlegacy/packages/viewer/test/matchMount.test.ts
--- a/socomlegacy/packages/viewer/test/matchMount.test.ts
+++ b/socomlegacy/packages/viewer/test/matchMount.test.ts
@@ -817,4 +817,22 @@ describe('ONL-18d: the firearm in the front end match (main.ts gunplay, copied)'
 
 
+describe('PAR-1: WEAPON EXCHANGE and the dead\'s prompt in the front end match (./matchExchange, research 253)', () => {
+  it("dead on the lobby's client: the dead's prompt on the hook's weaponSelect, the gate NetPage's; the spawn takes it away; the blur listener let go at the teardown", async () => {
+    const a = await armed();
+    a.t.w.step(2);
+    const hook = (a.t.o.win as unknown as Record<string, MatchWindowHook>)[MATCH_WINDOW_HOOK]!;
+    expect(hook.weaponSelect()).toMatchObject({ screen: 'closed', prompt: null, gate: { inMatch: true, alive: true } });
+    a.x.say({ type: 'kill', killer: 3, victim: 2, weapon: 'M4A1 SD', how: 'weapon', clip: null } as unknown as ServerEvent);
+    a.t.w.step(1);
+    expect(hook.weaponSelect().gate).toEqual({ inMatch: true, alive: false, cameraOnSelf: true, spectator: false });
+    expect(hook.weaponSelect().prompt?.length).toBeGreaterThan(0);
+    a.x.say({ type: 'spawn', id: 2, at: [0, 0, 0], yaw: 0, after: 0 } as unknown as ServerEvent);
+    a.t.w.step(1);
+    expect(hook.weaponSelect()).toMatchObject({ screen: 'closed', prompt: null });
+    a.m.close();
+    expect(a.t.w.live.has('blur')).toBe(false);
+  });
+});
+
 describe('MATCH-THROW: the throwables, the launcher and the R2 inventory in the front end match (./matchThrow, research 222 §8)', () => {
   /** R2 opens the inventory; two d-pad Ups step to slot 2 (the M67 of the baked kit); Cross takes it up. */
@@ -1803,7 +1821,7 @@ describe("ACT-3: the hold on Cross (XR-06's lifecycle on the menu-launched match
     order(mountPad, [
       /if \(held && acts\.wiring\.lifecycle\.down\(\)\) acts\.cancel\('loading'\);/, /pads\.poll\(nav\);/, /gamePad\.poll\(nav\);/, /firearm\.triggerLane\(padMerged, input\);/,
-      /throws\.inventory\.frame\(padMerged, input, dt\)/, /const over: CancelCause \| null = chat\.owns \|\| throws\.inventory\.isOpen\(\) \? 'menu' : null;/,
+      /throws\.inventory\.frame\(padMerged, input, dt\)/, /const over: CancelCause \| null = menu \|\| throws\.inventory\.isOpen\(\) \? 'menu' : null;/,
       /if \(over && !menuOver\) \{ acts\.cancel\(over\); stanceButton\.reset\(\); \}/,
-      /playerLanes\(lanes, padGame, game, dt, \{ walking, menu: chat\.owns \}\);/, /acts\.wiring\.endFrame\(\);/,
+      /playerLanes\(lanes, padGame, game, dt, \{ walking, menu \}\);/, /acts\.wiring\.endFrame\(\);/,
     ]);
     expect(mount).toMatch(/new PadWatch\(\{[^\n]*cancel: \(\) => \{ acts\.cancel\('padLost'\); \} \}\);/);
diff --git a/socomlegacy/packages/viewer/test/matchNet.test.ts b/socomlegacy/packages/viewer/test/matchNet.test.ts
--- a/socomlegacy/packages/viewer/test/matchNet.test.ts
+++ b/socomlegacy/packages/viewer/test/matchNet.test.ts
@@ -4,5 +4,5 @@ import { fileURLToPath } from 'node:url';
 import { describe, expect, it, vi } from 'vitest';
 import { FRONT_END_CAPABILITIES, TESTROOM_CAPABILITIES, type MatchCapabilities } from '../src/matchCore';
-import { matchNetDeps, PART_DEPS, type MatchNetParts } from '../src/matchNet';
+import { matchNetDeps, PART_DEPS, PART_HOOKS, type MatchNetHooks, type MatchNetParts } from '../src/matchNet';
 import type { NetPageDeps } from '../src/netPage';
 
@@ -50,4 +50,6 @@ const hostagesPart = { hostageState: () => {} } satisfies Partial<NetPageDeps>;
 /** The Chat menu's two parts: TAUNTS (`./matchTaunts`) and TACTICAL ORDERS and MESSAGES (`./matchChat`). */
 const tauntsPart = { taunt: () => {}, communication: () => {} } satisfies Partial<NetPageDeps>;
+/** PAR-1 (research 253): WEAPON EXCHANGE's own addition (`PART_HOOKS.exchange`), owed from both pages since wave 4. */
+const everyHook = { answered: () => {} } satisfies MatchNetHooks;
 const everyPart = {
   ...throwables,
@@ -62,5 +64,5 @@ describe('matchNetDeps: the deps both pages hand NetPage', () => {
   it('the shared hooks: the live kit, the spectator\'s views, the menus, the firearm\'s, the respawn and the side\'s body', () => {
     const { p, calls, records } = parts();
-    const d = matchNetDeps(p, {}, { ...everyPart });
+    const d = matchNetDeps(p, { ...everyHook }, { ...everyPart });
     expect(d.weapons()).toBe(records);
     expect(d.scenicViews?.()).toEqual([{ x: 1 }]);
@@ -85,10 +87,10 @@ describe('matchNetDeps: the deps both pages hand NetPage', () => {
     const kit = { id: 1, name: 'M4A1' }, pkm = { id: 205, name: 'PKM TURRET' };
     p.map = () => ({ scenicViews: [], arsenal: { table: { records: new Map([[1, kit]]), turretRecords: new Map([[205, pkm]]) } } } as never);
-    const d = matchNetDeps(p, {}, { ...everyPart });
+    const d = matchNetDeps(p, { ...everyHook }, { ...everyPart });
     expect([d.recordOf?.(1), d.recordOf?.(205), d.recordOf?.(207)]).toEqual([kit, pkm, null]);
   });
   it('LOW-2 rounds 2-3 (research 223 s6): a stale round given back by its shot, a stale reload restored by its id -- one place for both pages', () => {
     const { p, calls } = parts();
-    const d = matchNetDeps(p, {}, { ...everyPart });
+    const d = matchNetDeps(p, { ...everyHook }, { ...everyPart });
     d.staleRound?.(11);
     d.staleRound?.(12);
@@ -114,6 +116,6 @@ describe('matchNetDeps: the deps both pages hand NetPage', () => {
     const { p } = parts();
     const reload = vi.fn();
-    expect(matchNetDeps(p, {}, { ...everyPart, reloadSound: reload }).reloadSound).toBe(reload);
-    expect(() => matchNetDeps(p, {}, { ...everyPart, died: () => {} })).toThrow(/died/);
+    expect(matchNetDeps(p, { ...everyHook }, { ...everyPart, reloadSound: reload }).reloadSound).toBe(reload);
+    expect(() => matchNetDeps(p, { ...everyHook }, { ...everyPart, died: () => {} })).toThrow(/died/);
   });
 });
@@ -128,8 +130,8 @@ describe('the capabilities decide the parts\' hooks (the front end\'s asymmetrie
   it('/testroom: the throwables\' hooks are owed and handed on', () => {
     const { p } = parts();
-    const d = matchNetDeps(p, {}, { ...everyPart });
+    const d = matchNetDeps(p, { ...everyHook }, { ...everyPart });
     expect(d.remoteGrenade).toBe(throwables.remoteGrenade);
     expect(d.ownProjectiles).toBe(throwables.ownProjectiles);
-    expect(() => matchNetDeps(p, {}, {})).toThrow(/remoteGrenade/);
+    expect(() => matchNetDeps(p, { ...everyHook }, {})).toThrow(/remoteGrenade/);
   });
   it('a part on owes every one of its deps: each left out is refused (the review: not only the required remoteGrenade)', () => {
@@ -139,5 +141,5 @@ describe('the capabilities decide the parts\' hooks (the front end\'s asymmetrie
         const rest: Partial<NetPageDeps> = { ...everyPart };
         delete rest[k];
-        expect(() => matchNetDeps(p, {}, rest), k).toThrow(new RegExp(`${k} is owed`));
+        expect(() => matchNetDeps(p, { ...everyHook }, rest), k).toThrow(new RegExp(`${k} is owed`));
       }
     }
@@ -152,7 +154,7 @@ describe('the capabilities decide the parts\' hooks (the front end\'s asymmetrie
       const rest: Partial<NetPageDeps> = { ...soundPart, ...throwables, ...tauntsPart, ...hostagesPart };
       delete rest[k];
-      expect(() => matchNetDeps(p, {}, rest), k).toThrow(new RegExp(`${k} is owed: the throwables`));
+      expect(() => matchNetDeps(p, { ...everyHook }, rest), k).toThrow(new RegExp(`${k} is owed: the throwables`));
     }
-    const d = matchNetDeps(p, {}, { ...soundPart, ...throwables, ...tauntsPart, ...hostagesPart });
+    const d = matchNetDeps(p, { ...everyHook }, { ...soundPart, ...throwables, ...tauntsPart, ...hostagesPart });
     expect(d.remoteGrenade).toBe(throwables.remoteGrenade);
     expect(d.ownProjectiles).toBe(throwables.ownProjectiles);
@@ -163,5 +165,5 @@ describe('the capabilities decide the parts\' hooks (the front end\'s asymmetrie
     expect(PART_DEPS.worldDrops).toEqual(['drops', 'kitChanged']);
     for (const caps of [TESTROOM_CAPABILITIES, FRONT_END_CAPABILITIES]) {
-      const d = matchNetDeps(parts(caps).p, {}, caps === TESTROOM_CAPABILITIES ? { ...everyPart } : { ...soundPart, ...throwables, ...tauntsPart, ...hostagesPart });
+      const d = matchNetDeps(parts(caps).p, { ...everyHook }, caps === TESTROOM_CAPABILITIES ? { ...everyPart } : { ...soundPart, ...throwables, ...tauntsPart, ...hostagesPart });
       expect(d.tagOwnProjectile).toBe(throwables.tagOwnProjectile);
       expect(d.detonateProjectile).toBe(throwables.detonateProjectile);
@@ -169,5 +171,5 @@ describe('the capabilities decide the parts\' hooks (the front end\'s asymmetrie
     const front = parts(FRONT_END_CAPABILITIES).p;
     for (const k of PART_DEPS.worldDrops) {
-      expect(() => matchNetDeps(front, {}, { ...soundPart, ...throwables, ...tauntsPart, ...hostagesPart, [k]: everyPart[k] } as Partial<NetPageDeps>), k).toThrow(new RegExp(`${k} is the`));
+      expect(() => matchNetDeps(front, { ...everyHook }, { ...soundPart, ...throwables, ...tauntsPart, ...hostagesPart, [k]: everyPart[k] } as Partial<NetPageDeps>), k).toThrow(new RegExp(`${k} is the`));
     }
   });
@@ -179,32 +181,43 @@ describe('the capabilities decide the parts\' hooks (the front end\'s asymmetrie
     const testroom = parts().p, front = parts(FRONT_END_CAPABILITIES).p;
     for (const [p, rest] of [[testroom, everyPart], [front, { ...soundPart, ...throwables, ...tauntsPart, ...hostagesPart }]] as const) {
-      expect(matchNetDeps(p, {}, { ...rest }).hostageState).toBe(hostagesPart.hostageState);
+      expect(matchNetDeps(p, { ...everyHook }, { ...rest }).hostageState).toBe(hostagesPart.hostageState);
       const noState: Partial<NetPageDeps> = { ...rest };
       delete noState.hostageState;
-      expect(() => matchNetDeps(p, {}, noState)).toThrow(/hostageState is owed: the hostages is mounted/);
+      expect(() => matchNetDeps(p, { ...everyHook }, noState)).toThrow(/hostageState is owed: the hostages is mounted/);
     }
     for (const [p, rest] of [[testroom, everyPart], [front, { ...soundPart, ...throwables, ...tauntsPart, ...hostagesPart }]] as const) {
-      expect(matchNetDeps(p, {}, { ...rest }).escorteeVoice).toBe(soundPart.escorteeVoice);   // the YES: both pages, from the sound part
+      expect(matchNetDeps(p, { ...everyHook }, { ...rest }).escorteeVoice).toBe(soundPart.escorteeVoice);   // the YES: both pages, from the sound part
       const noYes: Partial<NetPageDeps> = { ...rest };
       delete noYes.escorteeVoice;
-      expect(() => matchNetDeps(p, {}, noYes)).toThrow(/escorteeVoice is owed: the sound is mounted/);
+      expect(() => matchNetDeps(p, { ...everyHook }, noYes)).toThrow(/escorteeVoice is owed: the sound is mounted/);
     }
   });
+  it("PAR-1 (research 253): WEAPON EXCHANGE's answered under PART_HOOKS.exchange -- owed from both pages (the front end's switch on since wave 4), refused from a page with the part off", () => {
+    expect(PART_HOOKS.exchange).toEqual(['answered']);
+    for (const [p, rest] of [[parts().p, everyPart], [parts(FRONT_END_CAPABILITIES).p, { ...soundPart, ...throwables, ...tauntsPart, ...hostagesPart }]] as const) {
+      expect(() => matchNetDeps(p, {}, { ...rest })).toThrow(/answered is owed: the exchange is mounted/);
+      const shown: unknown[] = [];
+      matchNetDeps(p, { answered: (l) => { shown.push(l); } }, { ...rest }).loadoutAnswer?.([1, 2, 3, 4, 5], null, null);
+      expect(shown).toHaveLength(1);
+    }
+    const off = { ...parts().p, caps: { ...TESTROOM_CAPABILITIES, exchange: false } };
+    expect(() => matchNetDeps(off, { ...everyHook }, { ...everyPart })).toThrow(/answered is the exchange's, which this page does not mount/);
+  });
   it('the front end: no ARMORY -- its deps are refused', () => {
     const { p } = parts(FRONT_END_CAPABILITIES);
     for (const k of [...PART_DEPS.armory, 'newRound', 'abandoned'] as const) {
-      expect(() => matchNetDeps(p, {}, { ...soundPart, ...throwables, ...tauntsPart, ...hostagesPart, [k]: () => {} } as Partial<NetPageDeps>), k).toThrow(new RegExp(`${k} is the`));
+      expect(() => matchNetDeps(p, { ...everyHook }, { ...soundPart, ...throwables, ...tauntsPart, ...hostagesPart, [k]: () => {} } as Partial<NetPageDeps>), k).toThrow(new RegExp(`${k} is the`));
     }
-    expect(matchNetDeps(p, {}, { ...soundPart, ...throwables, ...tauntsPart, ...hostagesPart, game: { id: 1 } as never }).game).toEqual({ id: 1 });
+    expect(matchNetDeps(p, { ...everyHook }, { ...soundPart, ...throwables, ...tauntsPart, ...hostagesPart, game: { id: 1 } as never }).game).toEqual({ id: 1 });
   });
   it('the review of MATCH-THROW: a page with the ARMORY off gets the parts\' round clear as newRound and abandoned; one with it on keeps its glue', () => {
     const { p } = parts(FRONT_END_CAPABILITIES);
     const cleared: string[] = [];
-    const front = matchNetDeps({ ...p, roundClear: () => { cleared.push('clear'); } }, {}, { ...soundPart, ...throwables, ...tauntsPart, ...hostagesPart });
+    const front = matchNetDeps({ ...p, roundClear: () => { cleared.push('clear'); } }, { ...everyHook }, { ...soundPart, ...throwables, ...tauntsPart, ...hostagesPart });
     front.newRound?.();
     front.abandoned?.();
     expect(cleared).toEqual(['clear', 'clear']);
     const glue = { newRound: vi.fn(), abandoned: vi.fn() };
-    const testroom = matchNetDeps({ ...parts().p, roundClear: () => { cleared.push('no'); } }, {}, { ...everyPart, ...glue });
+    const testroom = matchNetDeps({ ...parts().p, roundClear: () => { cleared.push('no'); } }, { ...everyHook }, { ...everyPart, ...glue });
     testroom.newRound?.();
     expect(glue.newRound).toHaveBeenCalledTimes(1);
@@ -216,7 +229,7 @@ describe('the capabilities decide the parts\' hooks (the front end\'s asymmetrie
       const rest: Partial<NetPageDeps> = { ...soundPart, ...throwables, ...tauntsPart, ...hostagesPart };
       delete rest[k];
-      expect(() => matchNetDeps(p, {}, rest), k).toThrow(new RegExp(`${k} is owed`));
+      expect(() => matchNetDeps(p, { ...everyHook }, rest), k).toThrow(new RegExp(`${k} is owed`));
     }
-    expect(matchNetDeps(p, {}, { ...soundPart, ...throwables, ...tauntsPart, ...hostagesPart }).objective).toBe(soundPart.objective);
+    expect(matchNetDeps(p, { ...everyHook }, { ...soundPart, ...throwables, ...tauntsPart, ...hostagesPart }).objective).toBe(soundPart.objective);
   });
 });
@@ -228,32 +241,36 @@ describe('the typecheck: a page\'s switch decides its owed and refused deps', ()
     if (Math.random() > 2) {
       // @ts-expect-error -- /testroom's switch: ownProjectiles (and the rest) owed
-      matchNetDeps(typed(TESTROOM_CAPABILITIES), {}, { remoteGrenade: () => {} });
+      matchNetDeps(typed(TESTROOM_CAPABILITIES), { ...everyHook }, { remoteGrenade: () => {} });
       // @ts-expect-error -- the front end's switch (MATCH-THROW): the throwables owed -- one alone is not enough
-      matchNetDeps(typed(FRONT_END_CAPABILITIES), {}, { ...soundPart, ...hostagesPart, remoteGrenade: () => {} });
+      matchNetDeps(typed(FRONT_END_CAPABILITIES), { ...everyHook }, { ...soundPart, ...hostagesPart, remoteGrenade: () => {} });
       // @ts-expect-error -- the front end's switch (MATCH-THROW): PF-28's ownProjectiles and LOW-2's staleThrow owed with the rest
-      matchNetDeps(typed(FRONT_END_CAPABILITIES), {}, { ...soundPart, ...hostagesPart, remoteGrenade: () => {}, tagOwnProjectile: () => {}, detonateProjectile: () => {} });
+      matchNetDeps(typed(FRONT_END_CAPABILITIES), { ...everyHook }, { ...soundPart, ...hostagesPart, remoteGrenade: () => {}, tagOwnProjectile: () => {}, detonateProjectile: () => {} });
       // @ts-expect-error -- the front end's switch (MATCH-THROW): PF-36's charge hooks owed with the throwables
-      matchNetDeps(typed(FRONT_END_CAPABILITIES), {}, { ...soundPart, ...hostagesPart, remoteGrenade: () => {}, ownProjectiles: () => false, staleThrow: () => {} });
+      matchNetDeps(typed(FRONT_END_CAPABILITIES), { ...everyHook }, { ...soundPart, ...hostagesPart, remoteGrenade: () => {}, ownProjectiles: () => false, staleThrow: () => {} });
       // @ts-expect-error -- the front end's switch: PF-34's world drops refused (sprint 30 wave 4)
-      matchNetDeps(typed(FRONT_END_CAPABILITIES), {}, { ...soundPart, ...throwables, ...tauntsPart, ...hostagesPart, kitChanged: () => {} });
+      matchNetDeps(typed(FRONT_END_CAPABILITIES), { ...everyHook }, { ...soundPart, ...throwables, ...tauntsPart, ...hostagesPart, kitChanged: () => {} });
       // @ts-expect-error -- the front end's switch: PF-34's drops refused, even null
-      matchNetDeps(typed(FRONT_END_CAPABILITIES), {}, { ...soundPart, ...throwables, ...tauntsPart, ...hostagesPart, drops: null });
+      matchNetDeps(typed(FRONT_END_CAPABILITIES), { ...everyHook }, { ...soundPart, ...throwables, ...tauntsPart, ...hostagesPart, drops: null });
       // @ts-expect-error -- /testroom's switch: PF-34's drops and kitChanged owed
-      matchNetDeps(typed(TESTROOM_CAPABILITIES), {}, { ...throwables, reloadSound: everyPart.reloadSound, deathVoice: everyPart.deathVoice, hurtVoice: everyPart.hurtVoice, ring: everyPart.ring, roundAudio: everyPart.roundAudio, objective: everyPart.objective, armory: true, armoryOpen: everyPart.armoryOpen, joined: everyPart.joined, newRound: everyPart.newRound, abandoned: everyPart.abandoned });
+      matchNetDeps(typed(TESTROOM_CAPABILITIES), { ...everyHook }, { ...throwables, reloadSound: everyPart.reloadSound, deathVoice: everyPart.deathVoice, hurtVoice: everyPart.hurtVoice, ring: everyPart.ring, roundAudio: everyPart.roundAudio, objective: everyPart.objective, armory: true, armoryOpen: everyPart.armoryOpen, joined: everyPart.joined, newRound: everyPart.newRound, abandoned: everyPart.abandoned });
       // @ts-expect-error -- the front end's switch: HX-4a's hostageState owed since ACT-5 (the hostages part on, ACT.R5)
-      matchNetDeps(typed(FRONT_END_CAPABILITIES), {}, { ...soundPart, ...throwables });
+      matchNetDeps(typed(FRONT_END_CAPABILITIES), { ...everyHook }, { ...soundPart, ...throwables });
       // @ts-expect-error -- /testroom's switch: HX-4a's hostageState owed (the hostages part)
-      matchNetDeps(typed(TESTROOM_CAPABILITIES), {}, { ...throwables, ...soundPart, ...worldDrops, armory: true, armoryOpen: everyPart.armoryOpen, joined: everyPart.joined, newRound: everyPart.newRound, abandoned: everyPart.abandoned });
+      matchNetDeps(typed(TESTROOM_CAPABILITIES), { ...everyHook }, { ...throwables, ...soundPart, ...worldDrops, armory: true, armoryOpen: everyPart.armoryOpen, joined: everyPart.joined, newRound: everyPart.newRound, abandoned: everyPart.abandoned });
       // @ts-expect-error -- the front end's switch: HX-4a's escorteeVoice owed (the sound part's)
-      matchNetDeps(typed(FRONT_END_CAPABILITIES), {}, { ...throwables, ...hostagesPart, reloadSound: everyPart.reloadSound, deathVoice: everyPart.deathVoice, hurtVoice: everyPart.hurtVoice, ring: everyPart.ring, roundAudio: everyPart.roundAudio, objective: everyPart.objective });
+      matchNetDeps(typed(FRONT_END_CAPABILITIES), { ...everyHook }, { ...throwables, ...hostagesPart, reloadSound: everyPart.reloadSound, deathVoice: everyPart.deathVoice, hurtVoice: everyPart.hurtVoice, ring: everyPart.ring, roundAudio: everyPart.roundAudio, objective: everyPart.objective });
+      // @ts-expect-error -- /testroom's switch (PAR-1): WEAPON EXCHANGE's answered owed
       matchNetDeps(typed(TESTROOM_CAPABILITIES), {}, { ...everyPart });
+      matchNetDeps(typed(TESTROOM_CAPABILITIES), { ...everyHook }, { ...everyPart });
+      // @ts-expect-error -- the front end's switch (PAR-1, wave 4): WEAPON EXCHANGE's answered owed
+      matchNetDeps(typed(FRONT_END_CAPABILITIES), {}, { ...soundPart, ...throwables, ...tauntsPart, ...hostagesPart });
       // @ts-expect-error -- the front end's switch: TAUNTS' hook owed (research 301)
-      matchNetDeps(typed(FRONT_END_CAPABILITIES), {}, { ...soundPart, ...throwables });
+      matchNetDeps(typed(FRONT_END_CAPABILITIES), { ...everyHook }, { ...soundPart, ...throwables });
       // @ts-expect-error -- the front end's switch: the sound's hooks owed (MATCH-SOUND)
-      matchNetDeps(typed(FRONT_END_CAPABILITIES), {}, { ...throwables, ...hostagesPart });
+      matchNetDeps(typed(FRONT_END_CAPABILITIES), { ...everyHook }, { ...throwables, ...hostagesPart });
       // @ts-expect-error -- the front end's switch: the throwables' hooks owed (MATCH-THROW)
-      matchNetDeps(typed(FRONT_END_CAPABILITIES), {}, { ...soundPart, ...hostagesPart });
-      matchNetDeps(typed(TESTROOM_CAPABILITIES), {}, { ...everyPart });
-      matchNetDeps(typed(FRONT_END_CAPABILITIES), {}, { ...soundPart, ...throwables, ...tauntsPart, ...hostagesPart });
+      matchNetDeps(typed(FRONT_END_CAPABILITIES), { ...everyHook }, { ...soundPart, ...hostagesPart });
+      matchNetDeps(typed(TESTROOM_CAPABILITIES), { ...everyHook }, { ...everyPart });
+      matchNetDeps(typed(FRONT_END_CAPABILITIES), { ...everyHook }, { ...soundPart, ...throwables, ...tauntsPart, ...hostagesPart });
     }
     expect(true).toBe(true);
```

```diff
diff --git a/socomlegacy/packages/viewer/test/matchExchange.test.ts b/socomlegacy/packages/viewer/test/matchExchange.test.ts
--- a/socomlegacy/packages/viewer/test/matchExchange.test.ts
+++ b/socomlegacy/packages/viewer/test/matchExchange.test.ts
@@ -403,13 +403,23 @@ describe('the one wiring: main.ts\'s lines in the part, the front end\'s mount o
     ["prompt: prompt ? exchange.layout(prompt).items.filter((i) => i.part === 'prompt').map((i) => (i.kind === 'text' ? i.text : '')) : null,", "prompt: p ? menu.layout(p).items.filter((i) => i.part === 'prompt').map((i) => (i.kind === 'text' ? i.text : '')) : null,"],
   ];
-  it('main.ts holds WEAPON EXCHANGE\'s lines today and the part each one transcribed (flips at wave 4: main.ts then calls mountExchange and holds none)', () => {
+  it('main.ts calls mountExchange and holds none of the lines it moved; the part holds each (flipped at wave 4)', () => {
     const main = src('main.ts'), part = src('matchExchange.ts');
     for (const [today, moved] of LINES) {
-      expect(main, today).toContain(today);
+      expect(main, today).not.toContain(today);
       expect(part, moved).toContain(moved);
     }
-    expect(main).toMatch(/new WeaponExchange\(\{/);                        // flips at wave 4
-    expect(main).toMatch(/const exchangeInput = new ExchangeInput\(\);/);  // flips at wave 4
-    expect(main).not.toMatch(/mountExchange\(/);                           // flips at wave 4
+    expect(main).not.toMatch(/new WeaponExchange\(|new ExchangeInput\(/);
+    expect(main).toMatch(/const exchangePart = mountExchange\(\{/);
+    expect(main).toMatch(/const \{ menu: exchange, input: exchangeInput, refresh: refreshExchange, gate: exchangeGate, prompt: promptInfo \} = exchangePart;/);
+  });
+  it('both pages call the part\'s steps: the overlay, the edges and the step before the ownership, the frame after followNet, the hooks, the reset at the respawn', () => {
+    for (const [f, name] of [['main.ts', 'exchangePart'], ['matchMount.ts', 'exchange']] as const) {
+      const text = src(f);
+      for (const call of ['.overlay(frame, sizes)', '.edges(down)', '.pad(edges)', '.hold(padButtonsDown(', '.netHooks(),', '.reset();', '.frame();']) {
+        expect(text, `${f}: ${call}`).toContain(`${name}${call}`);
+      }
+      expect(text.indexOf(`${name}.frame();`), f).toBeGreaterThan(text.indexOf('acts.followNet();'));
+    }
+    expect(src('matchMount.ts')).toMatch(/exchange\.dispose\(\);/);
   });
   it('the part makes the menu and the ownership itself, and reads no markup and no ./main (OT.R12)', () => {
@@ -429,13 +439,14 @@ describe('the one wiring: main.ts\'s lines in the part, the front end\'s mount o
   it('the switch: /testroom mounts WEAPON EXCHANGE, the front end not yet (flips at wave 4: FRONT_END_CAPABILITIES.exchange true, matchMount.ts mounts the part)', () => {
     expect(TESTROOM_CAPABILITIES.exchange).toBe(true);
-    expect(FRONT_END_CAPABILITIES.exchange).toBe(false);                   // flips at wave 4
+    expect(FRONT_END_CAPABILITIES.exchange).toBe(true);                    // flipped at wave 4
     const mount = src('matchMount.ts');
-    expect(mount).not.toMatch(/mountExchange\(|answered: /);              // flips at wave 4
-    expect(mount).toMatch(/menuOpen: \(\) => \(o\.blocked\?\.\(\) \?\? false\) \|\| taunts\.isOpen\(\),/);   // flips at wave 4: `|| exchange.isOpen()`
+    expect(mount).toMatch(/const exchange = mountExchange\(\{/);
+    expect(mount).toMatch(/menuOpen: \(\) => \(o\.blocked\?\.\(\) \?\? false\) \|\| exchange\.isOpen\(\) \|\| taunts\.isOpen\(\),/);
+    expect(mount).toMatch(/blocked: \(\) => \(o\.blocked\?\.\(\) \?\? false\) \|\| exchange\.isOpen\(\) \|\| taunts\.isOpen\(\), refreshFog:/);
   });
-  it('answered is no NetPage dep: PART_DEPS has no exchange entry; its owed/refused pin is PART_HOOKS.exchange, wave 4\'s matchNet.ts hunk (flips at wave 4)', () => {
+  it('answered is no NetPage dep: PART_DEPS has no exchange entry; its owed/refused pin is PART_HOOKS.exchange (flipped at wave 4)', () => {
     expect(Object.keys(PART_DEPS)).not.toContain('exchange');
     expect(Object.values(PART_DEPS).flat()).not.toContain('answered');
-    expect(src('matchNet.ts')).not.toMatch(/PART_HOOKS/);                  // flips at wave 4
+    expect(src('matchNet.ts')).toMatch(/exchange: \['answered'\],/);
     expect(Object.keys(mountExchange({ net: () => null, map: () => null, side: () => 'seal', loadouts: new PlayerLoadout(), walking: () => true, device: () => 'pad' }).netHooks())).toEqual(['answered']);
   });
```

**Landed (PARITY-1 wave 4, `agent/parw4`, 2026-10-08).** The three blocks together with the flag flip, as written but
for two hunks ported by hand where PAR-24's and PAR-22's wave-4 hunks had landed first on the same lines: `matchMount.ts`'s
pad frame (the hold's block keeps PAR-22's `fireModeInputFor(lanes).flush(padGame.fireMode)` after the exchange's
ownership of the baseline, `main.ts`'s order; `playerLanes(..., frameTime.real(), { walking, menu })`) and
`matchMount.test.ts`'s lane-order regexes on the same lines; `matchLanes.test.ts`'s front-end needle moved to
`frameTime.real()`. The review's note (1) is in `matchNet.test.ts`: `@ts-expect-error` on
`Object.freeze({ ...TESTROOM_CAPABILITIES, exchange: false as const })` handing `answered` (the error checked to be
`answered`'s). The touch half stays PAR-5's.

## 4. The touch half, owed to PAR-5

PAR.R1 moves WEAPON EXCHANGE's touch half to PAR-5 (PARITY-2, the touch layer). Left in `main.ts`, unchanged by §3:
the touch button `#tw-weapons` (`main.ts:1256-1266`, `exchange.touchButton(exchangeGate())`;
`WEAPON_SELECT_TOUCH_READING`), the canvas's taps on the open menu (1278-1283, `frameOfPoint`, `exchange.tap`),
`showWeaponsButton` (1284-1289) and its frame line (1574), and the hook's `touchButton`. On the front end the prompt's
`%c` is the pad's R2 (`device: () => 'pad'`) until PAR-5 mounts the touch layer there and hands the part
`/testroom`'s device rule. `test/armoryGlue.test.ts`'s pin on the touch listener ("I, R2 and the touch INV reach WEAPON
EXCHANGE ...") holds before and after §3.

## 5. Owed

- **The browser run** on the menu path (PAR-27's gate, ACT.R7): dead in a menu-launched match on MP2, MP51 and MP72, R2
  opening the menu, a confirm answered by the room and spawned with at the next round.
- **A mounted-match test with a map arsenal**: `test/matchMount.test.ts`'s map has no `arsenal`, so the §3.5 case reads
  the prompt and the gate but opens no menu there; the menu's open, confirm and answer on the front end are held by
  `test/matchExchange.test.ts`'s real `NetPage` case on `matchNetDeps` with the front end's switch. *Done 2026-10-10 (`ccr-ef8214e9-7mkm9s`, pending review):
  `matchMount.test.ts`'s "dead with a map arsenal" case.*
- **The blur** (R253.6): `main.ts` lets the held keys go and leaves the menu as it was; the brief's "the blur closing it"
  would be a change of `/testroom`'s behaviour with no original to follow (the console has no focus) -- recorded for the
  controller, not applied.
- **From research 300** (unchanged here): the survivor's lifecycle at a round's end, the headings' colour against the
  reference image, the remote kit's timing (`REMOTE_KIT_APPLY_PLACEHOLDER`).

## 6. Placeholders and readings

None added and none retired. The readings the moved lines carry stay their notes' (research 94 part 2, 300).
`MATCH_MOUNT_PARTS_PLACEHOLDER`'s text changes at wave 4 (§3.2: WEAPON EXCHANGE into its mounted half); its row stays
research 222 §6's.
