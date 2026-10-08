# 304 -- Original gameplay audio, starting with grenades

Chris's branch `chris/original-gameplay-audio` (a83aab84; the runtime commit 8c03d3cb, documented in ff7c010f and
a83aab84), on his victory dances (research 303).

**Onto main (2026-10-07, `agent/gameplay-audio` from main 50a98582).** The merge controller's rework to main's
conventions changes these facts of the note, each marked where it stands (§9 lists them): the release cue and
the warning are on the **shared parts** both matches mount -- `packages/viewer/src/matchThrow.ts` hears another's
accepted release, `packages/viewer/src/matchSound.ts` speaks a teammate's warning -- so `/testroom` and the
menu-launched ONLINE match both have them now; the asphalt stand-in (`.GREN_ASPHALT` -> `.GREN_STONE`) is **kept**,
being the owner's ruled departure (`packages/sound/src/catalog.ts`, the playtest of 2026-09-29) -- the branch's removal
of it is the owner's question (HUMAN_TASKS H143, the asphalt row; numbered at the merge); the cross-map borrowing of grenade sounds is removed (no ruling
covers it: the original's lookup is the map's own banks). The tester package and its pages are not on main
(H124); the listening checklist is §10.

## 1. Scope and confidence

Source: the supplied US SOCOM II ISO (SCUS-97275), its decoded executable and archive
readers. The supplied US manual is reference only. No external sound library,
replacement recording or generated voice is used. This is an audit and bounded
restoration, not a complete audio-parity claim. The automatic-warning native branch/polarity is an independently reread **reading**;
new asset transcriptions are **reading, pending review** unless specifically recorded otherwise.
Older research is a pointer, not proof: original assets were reread for this audit.

Tested precursor: `464c4ba6`, including Victory Dances, Settings, taunts and Weapon
Exchange. Browser timing assertions concern the
port's events; no original-running audio capture was supplied or compared.

## 2. Sources searched

- Entire ISO: 349 files, 47 outside RUN; 2,311 archive indexes. Raw term scan for
  grenade/throw/pin/voice/claymore/flash terms: 6,310 hits, zero scan errors, no hits
  outside RUN. An absence of these strings is not proof of absent indirect logic.
- All 115 banks in `RUN/SOUNDS/BNKSTORE.ZAR`; bank indices and names inspected.
- `RUN/SOUNDRDR.ZAR :: sounds.rdr`: SETS, GROUPS, streaming entries, ranges, volumes.
- `RUN/READERC.ZAR :: character.rdr`, `orders.rdr`, `motion.rdr`, `materials.rdr`.
- `RUN/ZWEAPON.ZAR :: zweapon.rdr`: FireAnimName, HitAnimName, explosion animations,
  weapon sound fields and equipment identifiers.
- `RUN/MP2.ZDB` (Frostfire), `RUN/MP51.ZDB` (Vigilance), `RUN/MP72.ZDB` (Crossroads):
  common/mission zAnims, chartype, mission scripts, world material and sound emitters.
- Executable decoded from the local disc's loader/overlay chain (research 300/303):
  ELF SHA256 `06b83684719a78ad0580f236bd0eddd40453f87d9c30c0d39021331915798872`, the executable the decompilation
  (`D:L`) was made from. No decompiled listing is committed.
- Manual printed page 23 / PDF page 25: grenade and claymore controls. It establishes
  neither a pin-pull sound nor a spoken-warning rule. Printed 29-30 describe the
  distinct Chat/taunt systems. Images remain reference material, not shipped artwork.

## 3. Grenade inventory and trigger evidence

All bank paths in this table are under `RUN/SOUNDS/BNKSTORE.ZAR`. `MPn` means the
current map, not permission to borrow another map's recording. zAnim paths are
`RUN/MPn.ZDB :: RUN\CZANIM.ZAR :: Anim_Sets/common/Animation_List/<event>`;
the resolver checks MZANIM mission overrides first. Exact discovered member paths,
bank/event indices, callback dependencies and stream files are also emitted by
`tools/gameplay-audio-inventory.ts` (its JSON on stdout).

| Sound/event | Original asset and identifier | Trigger evidence and state |
|---|---|---|
| Release/handling | `MPn_am.bnk`, `.THROW_OBJECT`, index 1; MP2 name has trailing space | Weapon FireAnimName -> `frag_start`, `HE_start`, `flashbang_start` (and the record's smoke start). Existing local release callback; remote accepted release callback was missing and is restored. Positional at release origin. No generic sound is inserted when callback data is absent. |
| Pin pull | `MPn_fx.bnk`, `.GREN_PIN_PULL1`, index 0 | Sample exists on all three maps and elsewhere; no verified multiplayer grenade trigger found in inspected zAnims/motion/executable paths. Not wired merely because the name exists. |
| Throw effort | `MPn_vc.bnk`, `.MALE_GRUNT`, index 2 | `motion.rdr` throw clip `zanim_callback` -> `throw_whoosh`; local ThrowPose dispatches at clip phase, not button press. Existing local trigger. Remote throw-pose callback timing is not carried by the current projectile-only event; remains a gap. No invented team-specific grunt mapping. |
| Frag/HE blast | `MPn_fx.bnk`, `.GREN_MED`, index 2 | Weapon explosion/material zAnim -> `frag_grenade` chain. Existing effect runner at fuse/detonation event; no extra parallel explosion call is added. Native projectile rules documented in research 85, reread through weapon/effect data. |
| Smoke | `MPn_am.bnk`, `!SMK_CANISTER`; indices MP2=32, MP51=33, MP72=20 | `smoke_grenade` SOUND; existing timed effect starts at smoke detonation. RANGE 50-160 units. It need not be audible from a distant throw. No invented airborne whistle. |
| Flashbang | `MPn_fx.bnk`, `.MARK_141_FLASH`, index 13 | `flashcrash_grenade` SOUND with command volume 2.0, range 100-2000. Existing effect timing and volume retained. The affected listener's separate `.RINGING_EARS` remains private. |
| Bounce | `grenade_hit_<material>` -> `.GREN_STONE`, `.GREN_METAL`, `.GREN_TIN`, etc. in current `MPn_am.bnk` | Existing physics bounce sound gate and material callback, at contact position. Per-map gaps remain silent/diagnosed. No new sound on every contact, resting frame or liquid pass-through. |
| Asphalt bounce | zAnim references `.GREN_ASPHALT`; no bank of the 115 contains it | The branch removed the stone substitution. **On main it stays** (the owner's ruled departure, catalog.ts; parity registry `sound.lookup.name-fixes`, `combatfx.effects.sound.unfound-names`: drift); the removal is the owner's call (HUMAN_TASKS H143, the asphalt row). |
| Cross-map borrowed bounces | e.g. MP2 lacks `.GREN_METAL` in its own banks | Removed grenade-only registrations borrowed from other maps. Original lookup uses loaded banks (`FUN_00344f30` -> `FUN_00344bf0`). The older bank-selection order is retained for unrelated footsteps/casings so this correction does not alter their current playback. |
| Claymore placement | `MPn_fx.bnk`, `.PLACE_CHARGE`, index 18; `c4_start` | Existing local placement callback; accepted remote placement now uses its own FireAnimName at the placed point. Applies only to supported equipment event, not an invented generic equip click. |
| Claymore detonation | `MPn_fx.bnk`, `.M18_CLAYMORE`, index 8; `claymore` | Existing owner-scoped detonator/placed-projectile effect. No added detonation beep. |
| Debris/aftermath | Explosion's nested effect scripts and bank grains | Existing effect runner/grain renderer handles data-defined components. No independent debris recording or universal aftermath cue is inferred from a sample name. |

## 4. Spoken grenade warning

The executable's multiplayer weapon-release path is `FUN_005c5340`, D:L479219-479247.
After the weapon/ammunition checks it considers IDs 0x79, 0x7a, 0x7b, 0x7e, 0x7f,
0x80 (D:L479236-479237; `GRENADE_WARNING_ITEMS`) and dispatches command 0x26 (D:L479246) only for the qualifying
controller (D:L479239-479244) and matching listener affiliation (D:L479245). The controller reread it at the source (2026-10-07). The
same branch speaks command 0x45 (`CMD_MP_BOMB_PLANTED`, `FUN_0058ed60`) for item 0x9a, the bomb (D:L479233-479234):
not this note's, not built. `FUN_0058ed60`, D:L449779-449792 maps 0x26 to
`CMD_MP_GRENADE_THROWN`. `FUN_005e7f20` calls `FUN_005e7960`; D:L498084-498125 resolves
the actor's character's multiplayer sound table, and D:L498202-498214 selects
placed/private playback. Independent ELF reread (2026-10-07): CSealCtrl vtable
0x6694b0, RTTI 0x65c680, +0x2c -> 0x5431f0 returns 1; CRemoteCtrl vtable 0x669590,
RTTI 0x662720, +0x2c -> 0x5e6250 returns 0. At 0x5c5814 the true/local result
skips the warning; 0x5c5824-0x5c5830 intersects affiliation masks and
0x5c5838-0x5c5844 calls the command. 0x5e7e30-0x5e7e54 uses positional virtual
+0x14 with actor+0x1c and volume 1.0; local uses private +0x0c. These are original
bytes, not a console capture. This is not a selectable taunt and not a generic warning
whenever any nearby grenade exists. Single-player AI `CHRSND_GRENADE_ALERT`,
`CHRSND_GRENADE_I_GOT_IT` and `CHRSND_GRENADE_OH_HECK` are separate slots; their names
do not establish multiplayer triggers.

Character mappings come from `READERC.ZAR/character.rdr` inherited `sounds/multiplayer`,
selected by each map's `READERM.ZAR/chartype.rdr`. The warning text key is
`_60592_sFireInTheHole_MSG`. Stream resolution is through sounds.rdr MP_COMMON/MULTI
and `RUN/SOUNDS/VAGSTORE.ZAR` (members `PS_0016A.VAG`, etc.). Groups retain native
dynamic weights using the existing tactical group implementation; no alternate
recording is selected when a member is missing.

| Map | SEAL slots 1-4 | Terrorist slots 1-4 |
|---|---|---|
| MP2 | `^PS_0016`, `^PS_0094`, `^PS_0042`, `^PS_0068` | `^PT_0450`, `^*PT_0278A`, `^PT_0477`, `^PT_0477` |
| MP51 | `^PS_0016`, `^PS_0094`, `^PS_0042`, `^PS_0120` | `^PT_0115`, `^PT_0148`, `^PT_0196`, `^PT_0175` |
| MP72 | `^PS_0016`, `^PS_0094`, `^PS_0042`, `^PS_0146` | `^PT_0331`, `^PT_0358`, `^PT_0385`, `^PT_0413` |

The client responds to the server's existing validated grenade release, which is
sent to peers and not echoed to its author. It never sends a second throw or a new
client-supplied voice request. Original team/character tables determine the recording;
the listener filter prevents enemy and unaffiliated-spectator warnings. No replay
queue is added for reconnection. Exact original death/spectator-camera transitions
and concurrent voice arbitration require further tracing; no guessed cooldown added.

## 5. Other gameplay audio inventory

The generated inventory lists each loaded bank sound and its numeric index separately
from the trigger tables. This table records implementation coverage; a bank entry
alone is deliberately marked asset-only, not working gameplay.

| Category | Original source | Current implementation / remaining gap |
|---|---|---|
| Weapon fire/suppressed fire | ZWEAPON `FireSoundClose/Med/Far`, WEAPON_GLOBAL distance fields; `MPn_fx.bnk` | GameAudio.onFire local/remote; blank suppressed distance entries stay blank. Existing, not retuned. |
| Launcher report | ZWEAPON `FireSoundClose/Med/Far` of the record the launch shows: the M203 (141) for the M203, F2000 and MGL turret rounds, else the kit's carrier (M79, LAW, RPG LAUNCHER); `.M203_GREN`, `.M79_GREN`, `.RPG_7` in `MPn_fx.bnk` | `FUN_005c5340` D:L479422-479450 (research 94 §C4.5). Built by M203-FIRE-SOUND (2026-10-17): GameAudio.onFire before the round's zAnim, the shooter's page and the others' on a live launch (none on a joiner's catch-up); a kit-led report without the owner's kit stays silent (`LAUNCH_REPORT_KIT_READING`). |
| Reload/after-shot | ZWEAPON `ReloadSound` and after-shot fields; motion callbacks | Existing local and relayed reload; remote reload timing has an existing named reading. All weapon names/fields listed in inventory. |
| Empty fire | `.GUN_EMPTY` in banks; ELF string 0x65f8f8 | Asset identified; audit of trigger/acceptance still required. Do not claim implemented merely from lookup. |
| Switching/handling | Weapon/motion records; no universal equip sound established | Existing motion callback coverage only. No added generic switch click. |
| Bullet impacts/casings | CZANIM `bullet_hit_*`, shell_eject data; material table and AM banks | Existing Effects/GameAudio. Earlier non-grenade spelling substitutions and cross-map borrowing remain explicitly distinguishable (`borrowed:true` in inventory); not original parity. |
| Footsteps | READERC `materials.rdr/SOILS` STEP/STEALTH/CRAWL/LAND; actor locomotion phases | Existing local/remote phase callbacks, surface-dependent selection. Existing cross-map borrowing is a deviation retained outside this grenade correction. No claim all motion/surface cases were heard physically. |
| Injury/death | Character inherited CHRSND_DAMAGE/DEATH/DEATH_QUIET; `MPn_vc.bnk` | Existing validated hit/death events and voice gating; null original slots do not imply a substitute. |
| Blast ringing | `.RINGING_EARS`; `FUN_005a0e70`, D:L459194-459235, path documented by ringingEars.ts | Existing affected local player event; not broadcast as a nearby world sound. |
| Doors | Map MZANIM/CZANIM action SOUND opcodes and named nodes | Existing world/door program playback; synchronization catch-up is quiet. Each map's actual references appear in callback inventory. |
| Ladders/climbing | motion callbacks -> `ladder_rung`, `climb_up`, `pull_up`; `.STEP_LADDER`, `.CLIMB_UP`, `.PULL_UP`, `~LADDER_SLIDE` | Local traversal callbacks work; slide uses existing one-pass handling, full original loop lifetime and all remote traversal cues remain gaps. |
| Pickups/context actions | Native contextual programs/weapon states | No generic pickup sound established in this pass; don't add one from another game's convention. C4/mission-dependent actions are not made complete by finding their sounds. |
| Round/objectives | Each map's MZANIM objectives scripts, SOUNDRDR stream groups, VAGSTORE | Existing RoundAudioHost and objective cues. Inventory lists per-map names, waits and streams. Music levels and handover retained. |
| Menus | READERC/orders and dialog sound fields, `HUDUI.bnk` | Existing original scroll/select/confirm/refuse mapping; separate Options/taunt/Armory/WX systems retained. |
| Ambience | Map mission/camera scripts and GEO node emitters; AM banks and LIBSD reverb | Existing interior/exterior beds, replay layers and positional emitters. Node-resolution gaps are distinct from missing samples. |
| Taunts | Character multiplayer tables and VAGSTORE | Existing separate system. MP2 requested `PT_0263B.VAG` is absent (a tactical Defuse group member); recorded as missing, never replaced. |
| Victory dances | Motion table's seven victory clips | No dance-specific callback/sound established in research 303; no invented music, grunt or taunt added. |

## 6. Lifecycle, settings and unresolved work

Browser cleanup now stops old bank/voice sources when the level/connection/round
is reset; the separate music slot retains its existing control. This is browser
resource management, not a new original gameplay rule. Sounds already started by
a death are not blindly muted. Existing Sound/Dialog/Music tuners remain unchanged.

Pending original evidence includes pin-pull usage, complete remote throw-grunt
timing, voice concurrency/follow details, all surface bounces in original play,
all contextual overlap and equipment phases, and original-running mix comparison.
This inventory separates missing recordings, unresolved triggers and unsupported
systems. No conclusion that every grenade should produce every listed stage.

## 7. Readiness procedure for additional maps

Run `SOCOM_DISC=<disc parent> node --import tsx tools/gameplay-audio-inventory.ts MPn`.
Inspect missing references and every `borrowed` entry; neither is an automatic pass.
Require original weapon FireAnim/explosion chains, current-map bank identities,
all four character warning mappings per team and every weighted VAG member. Exercise
the actual local/remote release, contact and detonation paths, inspect unintended
listeners, settings and reset behavior, then physically listen on both computers.
Retain failed/skipped cases. Do not fill a new map's gaps with another map's sounds.

## 8. Breach-success round group restoration

**Reading, independently reviewed (2026-10-08).** A reviewer who did not write the
change reread the actual ISO group members, omitted weights and dynamic factor;
all three mission branches, listener codes, sound flags/node/volume and WAIT 2;
and the three VAG recordings' decoded rates, frame counts, nonzero peaks and
dialog group 2. The reviewer separately reran `soundData.test.ts`: 7 passed,
zero skipped. This is source rereading plus a dev-disc test, not a proven claim.
The source is the same local US ISO, read through `parseAnimSets`,
`roundCuesFromArchive`, `parseStreamEntries`, `readTacticalSoundGroups` and
`readSoundStreams`. No original-running comparison or physical listening was
performed for this correction.

`RUN/MP61.ZDB`, `RUN/MP62.ZDB` and `RUN/MP73.ZDB` contain `MZANIM.ZAR` with
`Anim_Sets/mission/Animation_List/objectives`. The successful SEAL breach branch
(`bomb.detonated.seal` in the reader) posts the primary-target-destroyed message,
plays `^*PT_0024`, waits 2 seconds and plays `MUS_MP_SEAL_WIN_BRA` on MP61/62 or
`MUS_MP_SEAL_WIN_ALG` on MP73. The same sequence applies to original listener
team codes 0, 8 and 16. `RUN/READERC.ZAR/missionlist.rdr` gives all three maps
BREACH (type 1); this is an objective-result cue, not a selectable character taunt.

`RUN/SOUNDRDR.ZAR :: sounds.rdr/GROUPS/MP_COMMON/^*PT_0024` names the three
members `^PH_0024`, `^PH_0025`, `^PH_0026`, in that order, with `DYNAMIC_WEIGHTS`
0.05 and omitted initial `WEIGHT` fields. The existing group implementation uses
the native initialization, cumulative selection and renormalization already
independently reread in research 302 section 7. No new selection rule, random
sequence claim, volume, recipient rule or timing value is introduced here.

The `MULTI` stream entries resolve those members to
`RUN/SOUNDS/VAGSTORE.ZAR/PH_0024.vag`, `PH_0025.vag`, `PH_0026.vag`. All decode
at 22,050 Hz with 100,940, 88,256 and 67,788 frames respectively and nonzero peaks.
The recordings exist and the current decoder supports them. The missing-alias
warning was a loader omission: it registered groups requested by character
commands but treated round cues only as direct stream names.

The loader now registers requested round groups through the same MP_COMMON /
HOSTAGE resolver and preloads their actual stream members. `GameAudio.playStream`
and `RoundAudioHost` retain their existing selection, timing and output paths.
The focused real-disc regression covers all three maps, the exact group/member
records, all three listener codes, a selected decoded voice before the two-second
music wait, and suppression of a duplicate result. It retains unrelated unresolved
`^PT_0242` diagnostics on MP61/62. Missing disc prerequisites are skips, not passes.
Browser objective completion, physical listening and console comparison remain
separate checks; this correction does not resolve the character gaps in 301/302.

## 9. On main: what the rework changed (2026-10-07)

- **ONE-WIRE.** The branch's `main.ts` lines became the parts both pages mount: `matchThrow.ts` subscribes the
  thrower's `remoteRelease` (`grenade.ts`, after the joiner's hydrate path, so a catch-up hears nothing), plays the
  weapon's FireAnimName at the release and asks its `warning` hook; `matchSound.ts`'s `grenadeWarning` resolves the
  thrower's side, character and feet (`seat`, `others`: the page's client, `RemotePlayers`) and plays the
  `CMD_MP_GRENADE_THROWN` stream placed at the thrower. `main.ts` and `matchMount.ts` each lend the two hooks.
- **The local throw** plays its FireAnimName alone: the branch's removal of the `.THROW_OBJECT` stand-in kept.
  **PAR-77 (2026-10-13; research 251 §12.7, reading, pending review):** in third person only. `FUN_005c5340` picks
  `<FireAnimName>_zoom` past it (D:L479429-479430), which no throwable or charge has on the disc, so a throw or a
  placing in first person or night vision plays no release sound; the thrower's page now asks the same name. Another
  page plays the FireAnimName (the remote body's view is not on the wire). The grunt (`throw_whoosh`) is on
  `seal_throwgrenade` and `seal_p_throwgrenade` alone.
- **The asphalt stand-in kept**, the cross-map borrowing of grenade sounds removed (the header; `soundData.ts`).
- **Audio teardown** (`audio.ts` `stopTransient`, `roundAudioHost.ts`) as the branch had it, on main's stream
  signature (no per-voice option tuner).
- **Chris's all-map validation onto main (2026-10-08, `agent/chris-integration`).** His later runtime fixes are taken
  as he made them: the breach-success group `^*PT_0024` registered as a round group and its members preloaded
  (`soundData.ts`, §8), and the page's queued round audio reset once per dropped client (`netPage.ts`
  `audioResetClient`, §6). His per-map test selection, the independent browser per client and the disc-read voice
  members in `gameplayAudio.spec.ts` are on the served-tree spec; its kit comes from `e2e/gameplayAudioKit.ts` (the
  type's kit with the grenade picked into a slot 2-4 the room's validator accepts; the primary, the sidearm and any
  locked slot unchanged).
- **Not taken onto main.** The tester package (H124); the branch's playtest and test-result pages (the checklist
  below, the results the plan's Log). `tools/gameplay-audio-inventory.ts` is kept: metadata only, from the visitor's
  disc, never a sound byte written.

## 10. Playtest checklist (on main)

Each machine reads its own disc; the game is played with a controller. How to run the page and a match server is
[`SETUP.md`](../SETUP.md); the browser specs are `packages/viewer/e2e/gameplayAudio.spec.ts`, `grenade.spec.ts` and
`grenadeSelfMp.spec.ts`. On `/testroom` and on the menu-launched ONLINE match. Repeat on Frostfire, Vigilance and
Crossroads.

1. Two opposing players: throw an M67 or HE, a smoke and a flashbang (R2 the inventory, R1 the throw). Both hear the
   release and the blast; a low smoke toss nearby is heard, a distant one may be out of its range. No doubled release.
2. Turn the listener: left and right follow. Bounce on stone and metal; Frostfire's missing metal bounce stays silent.
3. Teammates on extra pages: a teammate's throw speaks the thrower's character's warning; the thrower hears none of
   his own, the enemy none. Both factions, several character slots.
4. Pin-pull: nothing new -- the sample exists, no trigger is read.
5. Death, the next round, a reconnect, a map change: no old throw, effect or voice lingers. A cancelled grenade hold
   throws nothing.
6. Claymore: a nearby peer hears it placed; only its owner sets it off.

Report what differs from the original; a difference is recorded for the owner, not assumed to be parity.

## 11. Readings and placeholders

| Name | What it stands for | Status |
|---|---|---|
| GRENADE_PIN_PULL_TRIGGER | `.GREN_PIN_PULL1`'s trigger in a multiplayer throw | note only; no trigger read, nothing wired |
| GRENADE_REMOTE_GRUNT_TIMING | Another's throw grunt (`throw_whoosh`) at its clip's phase: the throw event carries no pose timing | built 2026-10-14 as research 325's `REMOTE_THROW_GRUNT_READING` (NU-7 G1: the body's own clip, from the hold on the wire); was: "note only" |
| GRENADE_WARNING_CONCURRENCY | Voice arbitration and the death/spectator camera's listener for the warning | note only; no cooldown, no queue |
| BOMB_PLANTED_COMMAND | Command 0x45 at item 0x9a's release (`FUN_005c5340` D:L479233-479234) | note only; not built |

## 12. Map/character output-routing verification (2026-10-16)

Branch `chris/map-grenade-callouts`, based on main `523d634c5`, rechecks the user's map-specific grenade-yell
request. `grenadeCalloutRoutingDisc.test.ts` extends the existing asset-readiness checks through `mountSound` and
the real `GameAudio.playStream`: all 22 maps, both teams, four character slots and M67/AN-M8/Mark141/HE (704
combinations). The output must receive the current map's actual decoded buffer, have nonzero sample peak and
nonzero stream gain. The three map tables in section 4 anchor exact expected mappings; other maps use their own
decoded tables. This also exercises map clear/replacement on one sound part, plus own/enemy/spectator/charge
exclusions. A fake output records mixer calls: it is a dev-disc test, not a browser or human listening test.

No production audio change is justified by the initial green checks. The audience rule in section 4 remains:
the thrower's own page does not play the spoken warning, teammates do. The user asked about that behavior;
it was explained as the existing original-code reading, with no PS2 capture comparison claimed. Source-reading
confidence is unchanged. Detailed run records and rendered multiplayer results belong to the
[verification plan](../plans/2026-10-16-map-grenade-callouts.md).

The initial rendered failure was missing local served data: the browser lacked `RUN/SOUNDS/VAGSTORE.ZAR`,
although the dev-disc test source contained it. The teammate selected the correct `^*PT_0450B` member on MP2,
but `GameAudio` reported it unknown. Re-extracting with `--with-streams` supplies the recordings; the browser
spec now checks that prerequisite before launching clients. This does not alter production gameplay.
