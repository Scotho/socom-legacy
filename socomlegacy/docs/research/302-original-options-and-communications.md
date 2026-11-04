# 302 - Original Options and remaining Chat Menu branches

Chris's branch `chris/original-settings` (144702d6; runtime commit 19e9ff52), based on his taunts commit
`b75f644b6246d95612ec42389d96a5b90677e14b`. This is a supported subset restoration, not a claim that every original
system is complete.

**Onto main (2026-10-07, `agent/settings` from `agent/taunts` 4cf4d75b).** The merge controller's rework to main's
conventions changes these facts of the note, each marked where it stands (§7 lists them): TACTICAL ORDERS and
MESSAGES are **one shared part**, `packages/viewer/src/matchChat.ts`, that `/testroom` and the menu-launched ONLINE
match both mount (§3); the five messages and the option valves are **saved on the emulated memory card**, in the save
file's `CUIVarManager` and `CValveSaveManager` modules, never under a browser key (§3, §4); the rows that are not built
are **parked** (OT.R8: drawn and inert) through the existing gates, not greyed out (§4); the main menu's OPTIONS opens
the original's dialog (§4); RADIO and TEAMMATES stay parked (§3). The test room's convenience buttons are gone: the
player's ways in are the original's, the main menu's OPTIONS and ONLINE > OPTIONS > SETUP MESSAGING.

## 1. Sources and confidence

Only the locally supplied US SOCOM II ISO and the
[original US manual](https://www.videogamemanual.com/PS2/SOCOM-%20U.S.%20Navy%20SEALs%20II%20%28USA%29.pdf)
were used as original evidence. Manual printed page 13 / PDF 15 describes main
Options; printed 29-30 / PDF 31-32 describe Chat, Radio, teammates and the separate
Online Options editors. User screenshots identify the screens and supply visual
reference; they are not imported. No external screenshots, captures or assets.

The whole-disc search read all 349 files, including 47 outside RUN, and parsed
2,311 archive indexes without an error. It found 834 occurrences of the settings
search terms. This is a search inventory, not proof that every instruction is
decoded. Private raw logs, parsed data and native instruction listings stay out
of git. No new settings-specific asset outside RUN was identified.

Native addresses below refer to the original game overlay ELF, SHA256
`06b83684719a78ad0580f236bd0eddd40453f87d9c30c0d39021331915798872`, extracted from
the disc as recorded in research 300/301. Addresses are executable addresses, not
decompilation line citations. No native code text is reproduced here. Findings
are **reading, pending review**, except those explicitly independently reread below.
There is no original-running capture comparison and no new **proven** claim.

## 2. Asset and data paths

| Disc/archive path | Use |
|---|---|
| `RUN/UI/READERC.ZAR :: dlgOptions_Menu.rdr` | Main Options layout, Audio/Video/Controller/Presets/HDD/Return hierarchy |
| Same archive: `dlgOptions_Audio.rdr`, `dlgOptions_Video.rdr`, `dlgControllerSelection.rdr` | Original widgets, prompts, coordinates, radio strips and sliders |
| Same archive: `dlgControllerPresets*.rdr`, `dlgScreenAdjust.rdr` | Inventory of currently unsupported presets and PS2 screen adjustment |
| Same archive: `dlgOnlineOptions.rdr`, `dlgLAN_Options.rdr` | Separate online/LAN Options hierarchy |
| Same archive: `dlgNetLogin.rdr`, `dlgSetSOP.rdr`, `dlgSetTaunts.rdr`, `UiParams.rdr` | Original message initialization, editors, virtual keyboard and controls |
| `RUN/UIZANIM.ZAR :: Anim_Sets/<corresponding dialog>` and `UIMemCardAnim.rdr` | Original init, return, discard, defaults, save and keyboard scripts |
| `RUN/UI/UIOP_TXR.ZED`, `UIOP_PAL.ZED` | Options slider, knob, check box and controller-page artwork |
| `RUN/UI/UI2D_TXR.ZED`, `UI2D_PAL.ZED` | Shared panels/background; `multplay_back.tif`, `brown_back.tif`, `brown_back_real.tif` |
| `RUN/UI/UIMP_TXR.ZED`, `UIMP_PAL.ZED`; `UISK_TXR.ZED`, `UISK_PAL.ZED` | Online editor and virtual keyboard artwork |
| `RUN/READERC.ZAR :: fonts.rdr`; `RUN/MP2.ZDB :: FONT_TXR.ZED/FONT_PAL.ZED` | Original font definitions and atlases, through existing readers |
| `RUN/LOCALE/STATES/UIMNLOC.ZAR`, `HUDCLOC.ZAR`; `RUN/READERC.ZAR :: HudCLOC.rdr` | Captions and multiplayer defaults |
| `RUN/READERC.ZAR :: global_valves.rdr`, `controller.rdr`, `orders.rdr`, `character.rdr` | Settings defaults, controller actions, Chat geometry/sounds and character speech mappings |
| `RUN/MP*.ZDB :: READERM.ZAR/chartype.rdr` | Character choice for each team/map |
| `RUN/SOUNDRDR.ZAR`, `RUN/SOUNDS/BNKSTORE.ZAR :: HUDUI.bnk`, `RUN/SOUNDS/VAGSTORE.ZAR` | Original menu cues, tactical speech and menu music; named streams resolved at runtime |

No artwork, fonts or audio are bundled. Browser code requests these from the
player's selected ISO. The static Options background is the one named by that
dialog. The main carousel movie is a separate decoder dependency; a static user
screenshot is not a substitute for it.

## 3. Chat Menu inventory and behavior

| Branch | Status and supported behavior | Remaining dependency |
|---|---|---|
| Tactical Orders | Seven original rows; matching character recordings/subtitles sent to the team, including local echo | Source read of every dynamic actor-state edge is incomplete |
| Taunts | Existing recorded taunt and five saved custom opposition messages retained | Research 301's missing character rows and interpolation gaps remain |
| Radio | Parked (OT.R8): the root is drawn and does nothing (on main, 2026-10-07) | Headset network transport, channel membership, dead/spectator channel transitions |
| Teammates | Parked (OT.R8): the root is drawn and does nothing (on main, 2026-10-07) | SOCOM II vote timing/threshold and headset muting; native actor order versus browser roster order |
| Messages | Five saved team messages; the original Setup Messaging editor (ONLINE OPTIONS) and keyboard | None for the send; the five are the card's `MPLOCALSOP1..5` |

`FUN_002344e0` builds the roots. Tactical command IDs are 6, 3, 23, 45, 46, 47, 48:
Hold Fire, Fire At Will, Clear Area, Cover Me, Defuse Bomb, Protect, Point. Row
labels come from each character's multiplayer command record, not a replacement
voice. Help literals are at `0x3e5f40..0x3e6070`. `FUN_0022fa90` and jump table
`0x3e5d30` allow Defuse (46) only in game types 1/2 and Protect (47) only in 3/4.
Both menu and server enforce this. **Independently reread.** The rework read the help literals again in the ELF's
strings (file offsets 0x1fef40..0x1ff070, virtual 0x3e5f40..0x3e6070) and MESSAGES' "Custom Team Message 1..5"
(0x1ff490..0x1ff550, virtual 0x3e6490..0x3e6550): `matchChat.ts` `TACTICAL_HELP`, `MESSAGE_HELP`. On main a row the
game type refuses, a row whose recording the disc lacks and an empty message do nothing (no send, no sound).

`FUN_0022fc00`, especially `0022fc80..0022fca8`, chooses same-team delivery for
tactical and message commands; taunts take the opposing-team branch. Local echo
is a separate original call. Custom messages are IDs 49-53. Sender identity,
team, character and location come from the server; clients cannot select a target
or impersonate another sender. Sender eligibility preserves the living-player
Chat gate. No instant equipment changes or round-rule changes are introduced.
Recipients have no new alive filter. Recorded lines use the existing original
stream/range mapping and spatial playback; custom text is never spoken.

Native team-message HUD colour 3 is `[64,128,64,100]` at `FUN_002b7530`, table
`0x440ca0`; taunts retain colour 5. Circle tap/hold separation, Triangle-release
back, 0.2-second directional repeat, 0.3-second reopen delay and per-node five
second send cooldown use research 301's original readings. Repeated request IDs,
extra fields, invalid command IDs, invalid slots and oversized text are rejected
as modern transport safeguards. These are distinct from the original cooldown.

`dlgNetLogin.rdr` initializes `MPLOCALSOP1..5` from HudCLOC 60757-60761, longevity
PERSISTENT. This precedes `dlgSetSOP.rdr`, whose old 549/550/552/553 UIMn references
are unresolved in the table. We use the earlier verified initialization, never
invent replacements. `dlgSetSop.rdr/do_chat` uses `PlayerChatSkb`, 46 bytes / 45
characters. Both findings were **independently reread**. *On main (2026-10-07):* the edits are the persistent UI
variables themselves, saved on the emulated card in the save file's `CUIVarManager` module beside the taunts'
(`./personaHost` `contents`, `CUIVarManager_Serialize`; research 102 R102.9), when ONLINE OPTIONS' RETURN or SAVE runs
`save_and_leave`, and restored at the session's start before `dlgNetLogin`'s defaults; `s2u.messages.v1` is gone.
`dlgSetSop.rdr`'s ONSTART (`SetSopVarOnStart`) copies the five to temporaries with `CopyUiVar` and its TRIANGLE
(`ResetDefaults`) copies them back on the discard: `CopyUIVar` is answered on this dialog too (§4). ONLINE OPTIONS'
SETUP MESSAGING row is unparked (`ONLINE_OPTIONS_PARKED_ROWS`, 2026-10-07).

## 4. Main Options inventory

Main Options remains separate from Chat and Online Options. The original scripts
and widget layout run directly. *On main (2026-10-07):* the main menu's OPTIONS runs its own chain (`CallOptions`,
`SWITCHMENU dlgOptions_Menu.rdr`) -- MENU-03's desktop-recompilation hook on `options_button` is unregistered at the
session's start (OPT-09's day, OT.R5; `frontEnd.ts`) -- and every row below marked *Parked* is drawn and inert
(OT.R8), as ONLINE OPTIONS' are: a parked button's CROSS animation is not started (`@s2u/ui` `optionsRowGate`) and a
parked strip or slider takes no pad (`optionsControlGate`, `UiControlGate`), so it neither moves nor sounds; its
ONACTIVATE help line runs (`OPTIONS_PARKED_ROWS`, `packages/ui/src/screens/optionsCommands.ts`). Chris's branch greyed
these out and skipped them by focus; main keeps them in the ring, as the original draws them. Defaults run the
original page script; a parked row's value it moves has no effect.

| Page/control | Original choices/default or range | Implemented effect / status |
|---|---|---|
| Audio / Music | 0-1, initial float32 0.74, Default 74% | The music group's master: the menus' music playing follows it (`MenuMusic.refreshVolume`), every later play reads it |
| Audio / Sound | 0-1, initial/default 1 | The effects groups' master, read at each play (PF-32) |
| Audio / Dialog | 0-1, initial/default 1 | The recorded dialog groups' master, read at each play (PF-32) |
| Audio / Headset | 0-1, initial/default 0.75 | Parked: headset transport missing |
| Audio / Sound mode | Mono, Stereo, Dolby Pro Logic II; initial valve 1 | Parked: original mixer/channel processing not verified |
| Audio / Defaults, Return | Original buttons and scripts | Restore supported defaults / retain draft and return |
| Video / Brightness | System tuner 0.5; widget's fallback 1 is not the system default | Applied (2026-10-23): the full-screen pass, research 358 (reading) |
| Video / Teammate Names | On/Off; default On | *2026-10-23, the parked rows (b):* built -- `DISPLAY_MP_TEAM_NAMES`, which the match's HUD reads at its set-up |
| Video / Video Mode | Interlaced/Progressive; initial 0 | Parked: a boot prompt whose YES switches the PS2's output to progressive scan; a browser has no such switch |
| Video / Help Windows | On/Off; default On | *2026-10-23, the parked rows (b):* built, store-only -- `HelpWindowsEnabled` is a card valve; its one reader, the campaign's help pop-up, is not in the port |
| Video / Head Bob | On/Off; default On | Applied to first-person camera bob |
| Video / Screen Adjust | Original X/Y origin, initial 128/128 | *2026-10-23, the parked rows (b):* built -- dlgScreenAdjust's d-pad scripts (X 0..250, Y 80..250, one a press); `SetScreenOrigin` lays value - 128 on the GS DISPLAY register; the page moves the drawn frame (`SCREEN_ORIGIN_ADAPTATION`, Y `SCREEN_ORIGIN_Y_LINES_PLACEHOLDER`) |
| Video / Defaults, Return | Original buttons and scripts | Restore supported defaults / retain draft and return |
| Controller / Vibration | On/Off; default On | *2026-10-23, CTL-2:* built -- a shot, a death and the scope's pulse (section 10) |
| Controller / Auto Aim | On/Off; default On; `NoAutoAim` can prohibit | *2026-10-23, the parked rows (b):* built, store-only -- its one consumer acts off the network only, and every match in the port is a room's (section 10, AIM ASSIST) |
| Controller / Pitch | Normal/Inverted; default Normal | Applies the existing look law's pitch inversion |
| Controller / Fire Rate | L3/SELECT; default L3 | Swaps FireMode and TACMAP/scoreboard logical actions |
| Controller / Stick Presets | Recruit, Sailor, SEAL, Custom; initial Recruit | Parked: preset-to-tuner behavior not completed |
| Controller / Look Speed, Acceleration, Dead Zone | Original 0-1 sliders; literal fallback 0.5 | Parked: initialization/curve linkage not verified for every profile |
| Controller / Defaults, Return | Original buttons and scripts | Restore supported defaults / retain draft and return |
| Controller Presets | Precision Shooter, Lefty, Scout, Sure Shot (`Default`, `Reverse`, `Config4`, `Goldeneye`) | *2026-10-18, OPT-14:* built -- the original's page and its scripts, the chosen `controller.rdr` config the pad's map (research [344](344-controller-presets.md)) |
| HDD | Enabled/Disabled; initial Disabled | Parked: PS2 HDD/download system dependency |
| Main Return / save prompt | Original apply/save chain | `StoreOptions` applies the valves to the globals the match reads; the original virtual-card save path |

All these options are local presentation/controller settings; none grants the
client authority over server rules. `global_valves.rdr` supplies persistent
defaults, `FUN_0038a7a0` initializes live system tuners. Sliders use the original
widget's two-percent track step and held repeat. `FUN_0027b420` initializes
option drafts; `FUN_0027b960` stores confirmed valves. Subpage Triangle invokes
the original discard question and restores temporary values only when the player
confirms discarding. Main Return's `UIMemCardAnim.rdr/save_and_leave` invokes
StoreOptions **before** asking to save: independently reread. Unsaved applied
valves survive maps/rounds within the page, while an accepted card save is needed
for reload/session persistence. *On main (2026-10-07):* `CValveSaveManager_Serialize` writes every PERSIST valve
into the save file's `CValveSaveManager` module (our JSON, by name; OPT-02 under R7), the module's other names kept as
read; the boot's `LoadConfig` reads the option valves back over `global_valves.rdr`'s defaults
(`CValveSaveManager_UnSerialize` `FUN_00352960`) and `load_initial_config`'s `StoreOptions` applies them
(`frontEnd.ts`, `./originalOptions`). The volumes are UI variables, not valves. Chris's branch kept them out of every
save (longevity 2, `InitSystemTuners`). The browser run of the rework found them in the saved `CUIVarManager` module,
and the transcription agrees: each slider binds its variable with a `UIVAR` spec of `LONGEVITY PERSISTENT`
(`dlgOptions_Audio.rdr`'s four, `dlgOptions_Video.rdr`'s BRIGHTNESS, `dlgControllerSelection.rdr`'s three; read on
the disc), `CUIVarManager_Add` only raises a longevity (R104.7), and `CUIVarManager_Serialize` writes every
longevity-3 variable (R104.9). So once a page's slider is built its tuner is persistent, saved and read back at the
next session's start (`UI_VAR_MODULE_TUNERS_READING`, §9), each clamped into the slider's range [0, 1] and a tuner of
another type skipped alone (`TUNER_RANGE`); R104.10's "never in the serialize" holds until then (R104.10 revised).
Decided by the code -- the rework's review confirmed it on the disc and the decomp: `FUN_003724f0` adds the slider's
var at D:L269307 through `FUN_003857c0`, whose raise is D:L279438-279440 -- and OPT-03's save-and-relaunch run of the
original is the proven level. No browser key holds any of
it.

*2026-10-09 (OPT-02, research 229 §1):* `FUN_00352960` restores every entry of the module at PERSIST, not the option
valves only; the page's `restoreValveModule` now does so.

`dlgOptions_Menu.rdr/check_then_save_and_leave` uses the shared save chain,
not the persona-specific password/account wrapper. Save question 831 defaults
YES, then slot question 830 always asks for a slot (default SLOT 1). An empty
formatted virtual card proceeds through checking/saving notices automatically.
Existing SOCOM data triggers overwrite question 857, default NO; Right then
Cross confirms YES. These records were independently reread in UIMemCardAnim.

Audio Defaults runs slider `SetValue #74`, whereas startup loads a compiled
0.74 literal. Independently reread `FUN_00372640` at 00372698..00372728 converts
the integer, divides by float32 100 and stores the result. The existing
toward-zero arithmetic yields 0.7399999499320984 for Defaults, distinct from
the startup literal 0.7400000095367432. The regression checks each exactly;
no rounding tolerance or runtime slider change was introduced.

The original `CopyUIVar` (`FUN_00281090`) takes source and destination name indices
from command +0x10/+0x14. It finds the source, adds the destination at temporary
longevity, then copies through the UI variable setter. The Options-scoped handler
is required for the original audio discard scripts; leaving this as a stub kept
changed volume after confirming discard. The red browser check and focused
script-driven regression preserve that failure and its correction.

Independent rereading also confirmed `dlgOptions_Video.rdr/OnVideoBack` is the
only `CompareValues` call in these Options animation sets. It compares
`BRIGHTNESS` with `TEMP_BRIGHTNESS`, both as variables. Native `FUN_00274db0`
substitutes only string-valued variables: these real values compare by their
different names. The existing command preserves the resulting discard prompt,
even with numerically equal brightness. This is a source reading, not an
original-running measurement. The CopyUIVar handler is deliberately scoped to
Options/Controller dialogs; unrelated command use is not claimed implemented.

*On main (2026-10-07):* the front-end match applies the stored pitch sign, head bob and fire-rate swap each
frame (`matchMount.ts` `applyOptions`, from the session's globals: `./originalOptions` `playOptionsOf`). `/testroom`
runs no front end and reads no options: its look options are its own panel's (OPT-18's owner call); the original's
defaults hold there (normal pitch, the bob on, L3).

`FUN_00592050` swaps controller action indices 3 and 12. The original pointer
table at `0x3f2be0` identifies FireMode and TACMAP; `controller.rdr` maps these to
LeftStickTap and Select in Default. **Independently reread.** Other controller
profiles remain unsupported. *2026-10-18 (OPT-14):* the four profiles are built, and the swap is the active
config's own table (research [344](344-controller-presets.md) R344.8, §6). The browser PCM stage applies the original group
square law after cached mixing; exact per-tone integer rounding is unresolved.
No sample-exact audio parity is claimed for changed bank-sound volume.

## 5. Unresolved appearance and scope

The five online Chat roots are supported by this native builder; the extra
OPTIONS root seen in an earlier supplied screenshot is not tied to this builder.
It is not invented here. Dead/spectator Radio-only trees, spectators' vote-all
entry and radio channel transitions remain dependent on voice/vote work. The
native actor-list order has no measured browser-roster correspondence.

No original-running screenshot/audio comparison has been performed. Chat opening
interpolation remains unmeasured. Main carousel movie decoding is separate from
the static Options layout. Keyboard input is text entry only: the soft
keyboard's, in a release build too (research 301 §6); the Chat menu and OPTIONS add no key.

Validation counts belong to the plan's Log, with automated controller simulation kept apart from physical testing.

## 6. Tactical recording groups and specific disc gaps

Group arithmetic uses the existing EE toward-zero add/multiply/divide helpers.
Independent review caught nearest rounding selecting the wrong variant at the
float32 sample 0.0476190485060215 after choosing A from equal A/B weights with
dynamic factor 0.05. The exact regression failed before correction and passed
afterward. Parsed stored constants remain float32 literals; no random-sequence
parity with the original global RNG is claimed.

`RUN/SOUNDRDR.ZAR :: sounds.rdr/GROUPS/MP_COMMON` maps tactical aliases to
recording groups. For example `^PS_0007` has members `^*PS_0007A/B`, each resolved
through the loaded SETS to its VAGSTORE filename. It is not a filename suffix
fallback. `FUN_00344910` loads MP_COMMON and HOSTAGE for multiplayer maps.

Independent native rereading: constructor `FUN_00347f00` discards children whose
case-sensitive lookup fails, starts omitted WEIGHT at zero and omitted
DYNAMIC_WEIGHTS at zero. `FUN_00347d40` normalizes float32 weights in file order;
a zero sum assigns float32 1/count. Local play `FUN_00348710` and positional play
`FUN_00348450` choose the first cumulative float32 weight strictly greater than
the sample, multiply that member by DYNAMIC_WEIGHTS, then renormalize before
playing it. All requested tactical groups specify 0.05. Each client retains its
own group state across menu closes; the network sends a command, not a variant.
The browser reuses GameAudio's random source; no original global RNG sequence
parity or original-running audio comparison is claimed.

All 22 map character tables were independently read: 1,232 tactical rows,
224 distinct aliases. The 377 distinct resolved stream filenames were checked
against the whole VAGSTORE index. Specific original gaps are preserved:

- `^PT_0242` is unresolved for Protect, terrorist character 4, MP61/62/64.
- Lowercase `^*PT_0110b`, `0108b`, `0105b`, `0107b`, `0109b` fail native
  case-sensitive lookup for MP51/52/53 terrorist character 1; `^*PT_00371B` fails
  for Protect, MP6/7/71/72/73/8 terrorist character 3. The native constructor
  excludes those unresolved children; their names are not corrected.
- `^*PT_0263B` resolves in the script, but `PT_0263B.VAG` is absent from VAGSTORE.
  This is Defuse for MP1 terrorist characters 2/4, and MP2/MP81/MP82/MP83
  terrorist character 2. It stays in the original weighted group; the affected
  command is explicitly unavailable in the browser, rather than renormalizing
  around missing artwork/audio. Mode restrictions still apply independently.

The first browser tactical-playback assertion failed because the old loader
looked for a direct stream. Its correction resolves the original groups and
preloads the actual members. Tests explicitly retain the absent-file diagnostic;
no replacement recording or spelling repair was introduced.

## 7. On main: what the rework changed (2026-10-07)

- **ONE-WIRE.** `/testroom`'s +90 lines of `main.ts` (the tactical orders, the messages, the radio hierarchy and the
  teammates) became `packages/viewer/src/matchChat.ts`: the rows of TACTICAL ORDERS and MESSAGES for the Chat menu
  (`./matchTaunts`' `TauntMenu`, `entries`), the send, the room's communications heard (the `communication` hook under
  `PART_DEPS.chat`), the capability `chat` on both switches (pinned in `test/matchCore.test.ts`); the recordings go
  through the match's `GameAudio` (`./matchSound`), whose `playStream` takes a tactical group's weighted member (§6).
- **The card.** `s2u.messages.v1` is gone (§3); the option valves are the save file's `CValveSaveManager` module and
  the sliders' tuners its `CUIVarManager` module's (§4). Nothing goes to the slot's `ext`: the original saves all of it.
- **OPTIONS.** `InitOptions`, `StoreOptions` and `CopyUIVar` are `@s2u/ui`'s `OptionsCommands`, over the session's
  option globals (`OptionGlobals`); `CopyUIVar` answers on OPTIONS' pages, SETUP MESSAGING, SETUP TAUNTS and ONLINE
  OPTIONS, elsewhere the table's unimplemented answer as before. The parked rows use the gates (§4). The main menu's
  OPTIONS runs `CallOptions`. The card rows answer from the page's card on `dlgOptions_Menu` as on ONLINE OPTIONS
  (`PERSONA_FORM_CARD_ROWS_ADAPTATION`).
- **Audio.** Main's per-play option masters (PF-32) stay; the branch's live per-voice option gain stage was not
  taken. The menus' music follows MUSIC VOLUME live (a mix matrix on its voice, `MenuMusic.refreshVolume`), as the
  slider's music must while the page is open.
- **Server.** `room.ts`'s `communication` routing is additive (protocol 10): server-authoritative, the sender's team
  only (its echo among it), dead or alive; the game type's DEFUSE and PROTECT; the per-node delay, rising request ids
  and the shape checks (`packages/central/test/communications.test.ts`).
- **Not taken onto main.** The test room's ORIGINAL OPTIONS and SETUP MESSAGING buttons; the tester tooling (held
  off main, HUMAN_TASKS H124); RADIO and TEAMMATES' inspectable submenus (parked). The branch's manager handoff and
  playtest pages are folded into this note (§7, §8).

### 7.1 Teammate vote menu connected (2026-10-16)

On `chris/vote-kick`, the previously parked TEAMMATES vote row calls the existing server vote path. The earlier
RADIO/TEAMMATES parked statements above describe the original 2026-10-07 checkpoint; voice and mute subsequently
landed through MATCH-05 (research 227). This branch completes the teammate vote action.

SOCOM II's manual, printed page 30, describes Chat > Teammates > selected player > vote to remove
([manual scan](https://www.videogamemanual.com/PS2/SOCOM-%20U.S.%20Navy%20SEALs%20II%20%28USA%29.pdf)).
The labels are VOTE REMOVE / VOTE RETAIN (`FUN_0022f440` D:L81375-81396; research 179 section 6), the standing flag
toggles (`FUN_0022f3c0` D:L81363-81370), and a player may vote living or dead -- no life test on its path: the row under TEAMMATES > PLAYER n (`FUN_00232bc0` D:L83607-83631; TEAMMATES carries no enable, D:L83793), its enable `FUN_0022f440` D:L81384-81396 (a teammate selected), the toggle `FUN_0022f3c0` D:L81363-81370, the target's count `FUN_002ba040` D:L159762-159767; the send `FUN_0030cef0` between them untraced; `FUN_0022f810` (D:L81519-81527) enables for a living actor, else, online, for a spectator, and gates only the NODEACTION ROOT, TAUNTS and RADIO roots (D:L83757, D:L83774, D:L83787) *(2026-10-17, AD-10, research 227 §2.9)*. (Was: "only a living player may vote (`FUN_0022f810` D:L81511-81526)", the misread.)
The roster retains its existing same-team filter, including dead teammates. The node's existing five-second
menu delay remains; the server adds no separate vote expiry or cooldown (research 263 section 5.2).

`NetPage.toggleVote` is shared with the developer K list, checks the current connection/life/roster at activation,
and keeps the flag used by the menu caption. Fresh welcomes clear flags; resumed welcomes retain only current
teammates' flags. A menu captured on an old connection cannot send through its replacement. Voice permission is
not required to vote. These connection checks and touch input are browser adaptations; the server's majority,
result-screen kick, and ban rules are unchanged. **Reading, pending fresh review**; no original-console capture.

The rendered phone test also exposed Chat hiding the entire touch layer. The branch retains its D-pad and face
buttons while Chat is open, including Triangle to back out, and hides sticks, shoulder buttons and inventory. This CSS browser
adaptation applies to both page roots; a connected physical controller still hides touch, and ARMORY retains its
own hiding rule. The existing menu input ownership prevents shooting or throwing while navigating.

## 8. Playtest checklist (on main)

Each machine reads its own disc; the game is played with a controller. How to run the page and a match server is
[`SETUP.md`](../SETUP.md); the walk the browser spec makes is `packages/viewer/e2e/originalSettings.spec.ts`.

1. Main menu > OPTIONS: the HDD row does nothing; CONTROLLER PRESETS opens its four pages (OPT-14, research
   [344](344-controller-presets.md)): LEFT / RIGHT walk them, CROSS chooses one, the pad's layout follows it. AUDIO: move MUSIC, SOUND and DIALOG and listen
   (the menu music follows MUSIC at once); HEADSET sets the voice chat's volume; SOUND's MONO folds the page's sound to one channel. TRIANGLE, YES discards the page's change;
   DEFAULT SETTINGS restores the defaults.
2. VIDEO: HEAD BOB off; BRIGHTNESS to either end darkens or brightens the picture (research 358); TEAMMATE NAMES,
   SCREEN POSITION: the d-pad moves the picture, one frame pixel a press across, down and up by the placeholder's lines;
   TEAMMATE NAMES off hides the team's names in the next round; HELP WINDOWS moves and is saved; VIDEO MODE does nothing.
   CONTROLLER: PITCH to INVERTED, FIRE RATE to SELECT; PRESETS: RECRUIT / SAILOR / SEAL set the three stick sliders
   (shown greyed: they are editable under CUSTOM only, as the original's), CUSTOM keeps them (section 10, OT.R72);
   VIBRATION rumbles on a shot, a death and the scope's pulse (CTL-2, LATER 319); AIM ASSIST moves and is saved (store-only).
3. OPTIONS' RETURN: YES to save, slot 1 (YES to overwrite). Reload the page: the options and the volumes are the
   card's.
4. ONLINE, log in, OPTIONS, SETUP MESSAGING: edit a message on the soft keyboard (or a USB keyboard while it is open);
   RETURN, then ONLINE OPTIONS' RETURN and YES to save. Reload and log in: the edit is back.
5. In a match on a team with another player: Circle tap, TACTICAL ORDERS, an order -- the teammate hears the
   character's recorded line and sees its text; the enemy gets nothing. MESSAGES, a message -- text only, the team
   alone. Each row waits five seconds after its send. For the vote branch, TEAMMATES > player > VOTE REMOVE sends
   a vote; reopening offers VOTE RETAIN to retract it. More than half the target's team must vote; the existing
   server removes the player when ROUND COMPLETE (or GAME COMPLETE) begins. RADIO and MUTE follow research 227.
6. With the options saved: the look's pitch is inverted, first person does not bob, L3 and SELECT are swapped (SELECT
   switches the fire mode, L3 held shows the scoreboard).

Report what differs from the original; a difference is recorded for the owner, not assumed to be parity.

## 9. Readings and placeholders

| Name | What it stands for | Status |
|---|---|---|
| UI_VAR_MODULE_TUNERS_READING | The system tuners a card's `CUIVarManager` module is read back for: persistent once their slider's `LONGEVITY PERSISTENT` spec adds them (R104.7, R104.9) | in code (`packages/ui/src/uiVars.ts`); confirmed in the code (`FUN_003724f0` D:L269307, `FUN_003857c0` D:L279438-279440); read back as reals clamped to [0, 1], any other record of a tuner skipped alone; OPT-03's run is the proven level |
| OPTION_GLOBALS_BEYOND_THREE | Which globals `UIStoreOptions` changes beyond the three the match applies (the stereo mode's lost arguments, `FUN_00389c60`) | note only; the others are stored by name and applied nowhere (their rows are parked) |
| LOOK_RATE_MAX_ADAPTATION | The room's bound on the normal view's turn (CTL.R2): the look law at the fastest settable gain (1.0), 3.44 rad/s yaw (3.285 degrees a tick) and 1.462 pitch, +54% a tick over RECRUIT's; the law and the gain's range are the original's (§10), one bound for every player is the room's | an adaptation, in code (`viewer/src/net/lookGate.ts`); research 223's room tolerances |
| RUMBLE_OUTPUT_ADAPTATION | The pad's two motor bytes (`FUN_005929a0`) to the Gamepad's `vibrationActuator` 'dual-rumble': the large motor's strength / 255 as the strong magnitude, the small motor's on as the weak one; played on a change, renewed every few frames while it holds, reset at 0; never while VIBRATION is OFF (the setters write nothing then). *2026-10-23, B137 (the owner's report):* either browser form -- Firefox's `hapticActuators[0].pulse(value, duration)`, one motor, takes the stronger magnitude for the same hold and a pulse of 0 for the stop; a connected pad offering neither is said once on the console (`padActuator`) | an adaptation, in code (`viewer/src/rumble.ts`, CTL-2, B137) |
| SCOPE_PULSE_TIMER_READING | The scope's pulse's timer and phase (the kit's `+0x4c` / `+0x48`): no reset of them read, so kept across scopes, deaths and respawns | open -- in code (`viewer/src/rumble.ts`); settles with the kit's constructor and the respawn's path |
| RUMBLE_MENU_STOP_READING | Which screens stop the motors and the pulse: the START menu's open (`FUN_00204a40`), the tactical map, `FUN_00228ee0` (its screen not read); the port, the START menu alone | open -- in code (`viewer/src/rumble.ts`, `matchFirearm.ts`) |
| SCREEN_ORIGIN_Y_LINES_PLACEHOLDER | The frame lines one step of `ScreenOriginY` moves the picture: DY counts raster lines (D:L304791), whether a line of the 448 frame or of one field (interlaced) is not read; 1 meanwhile. Settles: the GS manual's DY definition for interlaced frame mode, or a capture of the original with the origin moved | open -- in code (`viewer/src/screenOrigin.ts`); ledger, research 101 §4 |
| SCREEN_ORIGIN_ADAPTATION | SCREEN POSITION's origin (`ScreenOriginX` / `ScreenOriginY` less 128, `SetScreenOrigin` `FUN_0027bf10` D:L125261-125278 and every `StoreOptions` D:L125255-125256) as a move of the drawn 640 x 448 frame inside the front end's and the match's canvases: X one frame pixel a step (a reading: DX in VCK, `DAT_004a4500` 4 in mode 0, the 448-line NTSC mode, `FUN_003b14a0` D:L305384; four VCK a pixel at 640; D:L304788-304790), Y `SCREEN_ORIGIN_Y_LINES_PLACEHOLDER` lines a step, at the drawn scale; the canvas has no GS DISPLAY | an adaptation, in code (`viewer/src/screenOrigin.ts`, `styles.css`, `frontEnd.ts`); the merge controller's call, 2026-10-23 |
| SOUND_MODE_ADAPTATION | AUDIO's SOUND strip (Mono / Stereo / Dolby: `STEREO_CONTROLLER` 0 / 1 / 2) as the page's output: the original's `UIStoreOptions` hands it to the IOP's sound driver as mode 1 / 2 / 0 (`FUN_00340480` -> `FUN_0033f8b0` command 0xb, D:L125157-125165; Stereo's argument read at 0x27bae8), its mixing the IOP's own; the page mixes its whole output to one channel under Mono, two under Stereo and Dolby (no Pro Logic matrix in a browser) | an adaptation, in code (`viewer/src/audio.ts` `setSoundMode`, `frontEnd.ts`); the merge controller's call, 2026-10-23 |
| CHAT_RADIO_TEAMMATES | RADIO's and TEAMMATES' submenus (the headset transport, the vote, the mute) | voice/mute delivered by MATCH-05; vote row connected on `chris/vote-kick`, section 7.1; fresh review pending |

## 10. CONTROLLER OPTIONS' stick presets, sliders and vibration (OT.R72, 2026-10-23)

*The console / front-end seat (02), the plan `../plans/2026-10-23-controller-options.md` (CTL); source inspection at
reading level, pending review; the owner's ruling OT.R72 (MISSION) and the order CTL.R3.* Before OT.R72 the PRESETS strip,
the three sliders and VIBRATION were parked (OT.R8): their behaviour was not read. What is read now:

**The presets** `FUN_002da6c0` (D:L179394-179419), for a stick index (`param_2 * 0x28` on: stick 1, the look stick, at
`+0x2b0` dead zone / `+0x2b8` gain / `+0x2bc` power / `+0x2cc` ramp):

| preset | gain | power | dead zone | ramp | the sliders it leaves (sensitivity / inertia / dead zone) |
|---|---|---|---|---|---|
| 0 RECRUIT | 0x3f266666 (0.65) | 3 | 0x3e99999a (0.3) | 0x3f400000 (0.75) | 0.5 / 0.25 / 0.58 |
| 1 SAILOR | 0x3f51eb85 (0.82) | 3 | 0x3e23d70a (0.16) | 0x3f000000 (0.5) | ~0.743 / 0.5 / 0.3 |
| 2 SEAL | 0x3f800000 (1.0) | 3 | 0x3e23d70a (0.16) | 0x3e800000 (0.25) | 1.0 / 0.75 / 0.3 |

**The apply** `SetStickPreset` (UI command 120, `FUN_0027b790` D:L125063-125108): when the valve `stick_preset` is under
3 (CUSTOM), the preset goes to stick 1 and the three UI vars are written as reals from it -- `STICK_SENSITIVITY` the
gain's getter `FUN_002da800` (D:L179443-179457), `STICK_INERTIA` 1 - `+0x2cc`, `STICK_DEADZONE` `FUN_002da7a0`
(D:L179424-179428) less 0.02 -- each only where it differs, which runs its watchers. **The watchers** (research 204) bind
each var to both sticks (`InitSystemTuners`, research 104 §4): the dead zone `FUN_00389e70` -> `FUN_002da7d0`
(D:L179433-179438), min(v + 0.02, 1) / 2 -- the watcher clamps the sum at 1.0 first (D:L281947-281951), so the top of
the slider gives 0.5; the sensitivity `FUN_00389f90` -> `FUN_002da8a0` (D:L179462-179474), v < 0.5 ?
0.6 v : (v - 0.5) x 1.4 + 0.3, the gain 0.5 + that x 0.5 (so 0.5..1.0, the slider's middle 0.65); the inertia 0x389f10,
the ramp 1 - v. Constants `DAT_003df208` 0.5, `DAT_003df210` 1.0, `DAT_003df218` 2.0. **A quirk, kept:** the getter splits
at 0.5 where the setter splits at 0.3, so a slider set in [0.5, ~0.643) reads back higher (0.6 reads 0.733). The power is
no watcher's: the look stick keeps the preset's 3. The move stick (0) takes the dead zone alone that matters (its curve
and smoothing gates are off, research 184 §C5b). **The sliders are editable under CUSTOM only:** each preset box's script
writes `stick_preset` and its `if` on it then enables only the three sliders (research 229 §3) -- the greying under
RECRUIT is the original's (said to the owner, 2026-10-22). Every `UIStoreOptions` (`FUN_0027b960`) runs the same apply
inline (D:L125202-125230) -- the boot's at `stick_preset`'s default 0 among them, so RECRUIT's sliders are what CUSTOM
shows with none stored, and a store after a discard sets the vars back to the stored preset's. The port's
`OptionsCommands.store` is that store (`StoreOptions`, and the boot's in `viewer/src/frontEnd.ts`; CTL-1's review F2).

**What the look does with them:** the full-push turn is `turn_maxrate` x the gain x 1.72 (`FUN_005966a0`; research 83),
2.236 rad/s at RECRUIT's 0.65, at most 3.44 at the gain's 1.0 (SEAL, or the slider's top), x 1.538; the pitch 0.950 to
1.462. **The room's bound** (`LOOK_RATE_MAX_ADAPTATION`, the merge controller's CTL.R2): the fastest of those, never a
player's own setting; its cost is +54% a tick for every player (CTL.R2's row).

**Built** (CTL-1, `agent/ctl-options-build`): `@s2u/ui` `stickTuners.ts` and `OptionsCommands.SetStickPreset`; the
PRESETS strip and the three sliders out of `OPTIONS_PARKED_ROWS` (`OPTIONS_BUILT_ROWS`); `viewer/src/look.ts`
`lookStickOf` on `LookLaw`, the walk and the move stick; the console page's preset row writing the three sliders.

**Vibration** (CTL-2, read, not built): the toggle `DAT_00650698` (`FUN_00592be0` sets it, `FUN_00592bd0` reads it;
`UIStoreOptions` applies it, D:L125188-125193) gates the setters only -- `FUN_00592b40(time, strength, ctl)` raises the
large motor's strength `+0x144` and time `+0x140`, `FUN_00592ba0(time, ctl)` the small motor's time `+0x13c` -- on the
actor's controller (`actor+0xc0`). The frame's write `FUN_005929a0` (D:L451779-451812), for the local controller only
(`+0x114` 0, the pad `DAT_0044f108`): while `+0x140` > 0 the pad's `+0xb5` is the strength (0..255) and the time counts
down; while `+0x13c` > 0 the pad's `+0xb4` is 1; `FUN_00592ac0` zeroes both. The events (the callers, read 2026-10-23):
- **the death** -- `FUN_00547af0` (from D:L413011), the local player's death handler (it opens with `FUN_005b8920`, the
  drop at a death, THROW-INTERRUPT's reading): the motors reset (`FUN_00592ac0`), then the large one 0.18 s at 175 and the
  small one 0.04 s (D:L413097-413100);
- **the shot** -- `FUN_005c3360` (D:L477743, D:L477750), the firearm's fire: the small motor for the weapon record's time
  (`FUN_003c5f20`) when it has one (`FUN_003c5f30`), the large one for its time and strength (`FUN_003c5ec0`,
  `FUN_003c5eb0`) when it has them (`FUN_003c5ed0`) -- the record's `Rumble_Modifiers` block, read by the weapon
  parser at D:L322181-322195: `RumbleHighTime` (the small motor's time, `+0x258`, its flag `+0x254`; `FUN_003c5f40`),
  `RumbleLowTime` and `RumbleLowPower` (the large motor's time `+0x260`, its flag `+0x25c`, and its power `+0x264`;
  `FUN_003c5f00`, `FUN_003c5ee0`; the low power's setter writes the flag after the low time's, so with both keys it is
  the power's; the constructor `FUN_003c6320` zeroes all five, D:L317869 on, so no block is no shot rumble). Read by
  `@s2u/scene` `weapons.ts` (`WeaponRecord.rumble`, CTL-2): every one of the disc's 44 records carries the block --
  the M4A1 0.04 / 0.22 / 220, the M4A1 SD 0.04 / 0.2 / 125, the Mark 23 0.04 / 0.18 / 175 (the baked records and
  `weapon-records.json` hold them);
- **the scope's pulse** -- `FUN_005b9280` (D:L472060-472093), the scoped sway's tick (it runs only in the 9x view or a
  scope, `accuracy.ts`): while the body's exertion v (`FUN_005781b0` D:L437543 is `body+0xeb0`, its `cur`; 1.0 when there
  is none) is over 0.2 and the view is not state 4, two beats -- the large motor 0.1 s, then 0.16 s, the gaps
  (1 - v) x 0.24 + 0.3 and (1 - v) x 0.64 + 0.8 seconds -- at the strength 100 v + 20 (read at the instructions the
  decompiler lost: 0x5b9350-0x5b9364 `$f13` = 20.0 + 100.0 x v, 0x42c8 and 0x41a0; again at 0x5b93ec), so 120 at full
  exertion, 40 at the floor;
- **the death camera's pulse** -- `FUN_002980d0` (D:L141585) is the death camera's tick (research 180, line 201; LATER 69),
  not a camera shake (*corrected 2026-11-02, j5t3o2iU; the earlier line here called it one*): its start (D:L141343-141350)
  sets `+0x178` 0.2 s, `+0x180` 180, `+0x184` 0.9, the phase `+0x170` 0 and the delay `+0x174` -1; a beat, once a
  delay above 0 runs out, is the large motor for `+0x178` at `+0x180` (`FUN_00592b40`, D:L141585), and the beats
  alternate by the phase (D:L141586-141593): in phase 0 the next delay is 2 x `+0x178` (0.4 s) and the phase 1; in phase
  1 the phase is 0 and the strength x `+0x184` (0.9), the delay left run out. What first arms the delay above 0 (the
  start leaves it -1) was not read -- reading, pending review; not built;
- **the hurt** -- `FUN_00597b00` (D:L454498-454524; j5t3o2iU, 2026-11-02, reading, pending review), the controller's
  `+0x54`: a health change the actor lives through runs `FUN_005477a0` (D:L412828-412838: on a living actor -- `+0xe1`
  bit 4, reCOM's `m_isAlive`, research 114 line 87 -- a health that differs from `+0x1044` and is above 0; at 0 or under
  it is the death's `+0x58`), from the damage's step
  `FUN_005a54d0` (D:L461395-461396) for a bullet, a blast and a fall alike. It plays `CHRSND_DAMAGE` (`+0x24`, 0x3b at 1.0,
  through the voice gate), then, when its `+0x34` answers 0 and VIBRATION is on, raises the large motor to 175 where under
  it or stopped and to 0.18 s where shorter (D:L454513-454518), and the small motor to 0.04 s where shorter
  (D:L454520-454522; the small motor is on or off, no strength). The motors are not behind the voice gate. `+0x34`
  answers 0 in the SEAL controller's vtable (ELF entry 0x544200) and in a controller vtable at 0x4062d0 (class unnamed;
  its entry 0x221d30), and 1 in the remote controller's
  (0x5e6260): only the console's own body rumbles. Built (j5t3o2iU): `rumble.ts` `hurtRumble`, run by `NetPage` on a
  `hurt` below the health the page last held that leaves the body alive (`isDead` false; `NetPageDeps.ownHurt` ->
  `MatchFirearm.hurt`), every one -- the room's `hurtVoice` is the voice's gate, not the pad's. A rise in health would
  run `FUN_005477a0` too; the room sends no `hurt` that raises it. The page learns its own drop from `hurt` alone, online
  and in `/testroom`'s solo match (its loopback room) alike.
- **A blast's rumble, by kind** (j5t3o2iU, the owner's report and rule of 2026-11-02 -- "the original only blasted when
  hurt, but the planted bomb may be an exception"; reading, pending review). Every motor write in the ELF was
  enumerated: `FUN_00592b40` (the large) has four callers -- the death camera's tick `FUN_002980d0` (D:L141585), the
  death `FUN_00547af0` (D:L413099), the scope's pulse `FUN_005b9280` (D:L472081, D:L472089) and the fire step
  `FUN_005c3360` (D:L477750); `FUN_00592ba0` (the small) two -- `FUN_00547af0` (D:L413100) and `FUN_005c3360`
  (D:L477743); `FUN_00597b00` has no direct caller, only the controller's `+0x54` from `FUN_005477a0` (D:L412833) and
  from `FUN_00543d50` / `FUN_00543f70` (D:L410434, D:L410487: a health zeroed on an actor not alive, a cleanup); no other
  write of the motor fields `+0x13c..+0x144` and no non-zero write of the pad's `+0xb4` / `+0xb5` (`DAT_0044f108`,
  D:L51070, a zero) was found. The death camera's `+0x174` (its pulse's delay) is written only inside `FUN_002980d0`
  (D:L141344-141626), the dead player's own camera. `FUN_005c3360`'s one caller is the body's fire `FUN_005c5340`
  (D:L479542). So no explosion reaches a motor but through the struck body's own health:

  | blast | what reaches the pad | cite |
  |---|---|---|
  | the planted bomb (DEMOLITION, MPBOMB) | the hurt body only: its `base_explosion1` fires one MPBOMB pool round (`FUN_002c1c30` D:L163919-163927, research 332 §1); each body in its hit list runs `FUN_005a0e70`, which ends in `FUN_005a54d0` (D:L459285) -> `FUN_005477a0` -> `+0x54` `FUN_00597b00` on a health change (the hurt, above) or the death (`FUN_00547af0`) | D:L459285, D:L461395-461396, D:L412828-412838 |
  | C4 / satchel / claymore | the same round's path and body handler: the hurt body only | `FUN_003c8330` / `FUN_003c7dd0` (research 332 §1.3), D:L459285 |
  | a grenade (frag, HE) | the same: the hurt body only | D:L459285 |
  | a smoke (AN-M8 122, red 127) or a flash (Mark141 123) | nothing at the pop: no damage (AN-M8's radius and damage 0, `@s2u/scene` `projectile.ts`; red smoke's not re-read here), and `HandleDetonateExplosion` sets no camera blast point for them (`FUN_003c8330` D:L319186-319191: 0x7a, 0x7f, 0x7b among its twelve) | D:L319186-319195 |

  No blast rumbles an unhurt console, the bomb included: within its radius an unhurt body's health does not change, so
  `FUN_005477a0`'s test (`param_1 != +0x1044`) fails and nothing runs. What every console within 100 / 200 / 600 u of a
  non-exempt blast gets is the camera's shake (`FUN_00550ef0` D:L418098-418110, research 83: the screen, not the pad),
  the bomb's included (MPBOMB 154 is not on the list). The port keeps the hurt-only rule.
- **A smoke's throw** (j5t3o2iU, the owner's report: "when you throw a smoke there's a vibration effect as if you're
  getting hit by a grenade"; reading, pending review). Two things answered it in the port: (1) the release's rumble
  (`matchThrow.ts` `grenade.on('throw')`, `firearm().shotRumble(...)`), the original's -- `FUN_005c5340` ends every
  throw in `FUN_005c3360` with the fired record (D:L479540-479543), whose motor block tests the record's own flags and no
  item (D:L477739-477751), and every throwable on the disc, the smokes AN-M8 122 and red 127 among them, carries the
  M67's 0.04 s small / 0.18 s at 175 large (`weaponTable.parity.test.ts`, over `RUN/ZWEAPON.ZAR`) -- the same pulse as
  the hurt's, so a smoke's release feels like a hit in the original too; kept. (2) The pop's camera shake (`matchThrow.ts`
  `grenade.on('explode')`, `explosionShake` for every item), not the original's: `FUN_003c8330` sets no blast point for
  a smoke or a flash (above) -- now skipped for `CAMERA_BLAST_EXEMPT_ITEMS` (`./effects`), as a script round's already was.
**Built (CTL-2, LATER 319):** the two motors (`viewer/src/rumble.ts`: `Rumble`, the setters asking the toggle as
they run; `ScopePulse`; `deathRumble`; `shotRumble`) wired in `matchFirearm.ts` -- the rifle's round, a round mode's
launched round by the round's own record (`FUN_005c6600` moves the slot to it: the M203 HE's 0.18 s at 175, not the
rifle's), the turret's round, the page's death, the pulse while scoped, the frame's bytes to the Gamepad
(`RUMBLE_OUTPUT_ADAPTATION`); the hands' fire steps through `MatchFirearm.shotRumble` from `matchThrow.ts` (`FUN_005c5340`
ends in `FUN_005c3360` but for the Designator's: a throw's release, a charge's placing, a LAW / RPG launch); the
records' rumble on the launched rounds, rockets and throwables too (`throwableRecord`: every one on the disc
0.04 / 0.18 / 175); the START menu's open resets the motors and stops the pulse (`FUN_00204a40`; `menuOpen`;
`RUMBLE_MENU_STOP_READING`); the toggle from the START menu's values (`main.ts`, `matchMount.ts`: `vibration`), the
card's on `/testroom` too (`PlayOptions.vibration`). CONTROLLER OPTIONS' VIBRATION strip is built
(`OPTIONS_BUILT_ROWS`; its scripts write `VIBRATION_CONTROLLER`), and the START menu's row is (D:L61794-61822:
`FUN_00592be0(!DAT_00650698)`, the valve only where `FUN_00351ef0` finds it). **Not yet:** the death camera's pulse
(`FUN_002980d0`: 0.2 s at 180, x 0.9 a beat; waits on the port's death camera states lining up with the original's); the Detonator's fire step (its
record is read by `rdrGet`, not `throwableRecord`: its rumble not read); the tactical map's and `FUN_00228ee0`'s stops
(`RUMBLE_MENU_STOP_READING`).
**Owed:** the death camera's pulse; the pad's `+0xb4` / `+0xb5`
to libpad's actuators (the transport). The browser's
`vibrationActuator` 'dual-rumble' is the adaptation the build will use (the strength / 255 the strong motor, the small one
the weak), never while the toggle is off.

**AIM ASSIST** (CTL-3, last by the owner's order): `DAT_003df1a0`'s only gameplay reader is in the aim pick
`FUN_005aa6e0` (D:L464203, skipped in view state 4); written by the in-game toggle (D:L61771), at D:L124453-124458, and by
`UIStoreOptions` (D:L125186). *2026-10-23, the parked rows (b) -- reading, pending review:* the pick's aim-assist branch
(D:L464202-464215) runs only while `DAT_0045a0c1` is 0 -- `theNetwork.m_bNetwork` (reCOM's reading, research 114) -- the
toggle is on and the body's state (`FUN_005be560`) is not 4: the original's aim assist acts off the network only. Every
match in the port is a room's -- the online rooms and `/testroom`'s solo play too (its `LoopbackMatch`, `solo.room`) -- so
the pull acts in none of them, and CTL-3 has nothing to transcribe for the port's matches. The row is built store-only (the
merge controller's call): the strip moves the card's `AutoAim` (a persistent valve, f0 value 1), nothing reads it.
The campaign, if it is ever ported, owes the pull (its body, `+0x5d4` / `+0x5d8` / `+0x5dc` and the two random draws).
