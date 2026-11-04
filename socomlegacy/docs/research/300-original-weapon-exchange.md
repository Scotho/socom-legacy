# Original Weapon Exchange: local restoration evidence

2026-10-05. Branch `chris/original-weapon-exchange`, base
`1b0beb2c36f41cc1692e596cfddcaf1666fe95ca`. Local playtest only; no publication or merge.

## 1. Confidence and scope

The renderer and state machine already existed on the development baseline. This change repairs browser input
ownership around that menu, retains the separate pregame ARMORY, and adds disc-backed selection/round regression
coverage. It does not replace the original rendering with the supplied screenshot or new artwork.

**Disc findings: reading, pending review.** The supplied USA SCUS-97275 image is 4,380,753,920 bytes. The repository's
`IsoAssetSource`, `parseZdb`, `Zar`, scene readers and sound readers were used. A sequential raw scan covered every
one of the 349 ISO files, including 47 outside RUN. It searched WEAPON EXCHANGE, CInGameWeaponSel, CWeaponSel,
newweapnbkrnd.tif, hud_arrow_off2.tif, weapon_selection.tif, font_text_01, m14_gun, m14_icon, TCM_SELECT,
TCM_SLIDE, dlg_equipment_mp and zweapon.rdr. There were 411 raw hits, 2,311 archive indexes and no archive parse
errors. No raw plaintext WEAPON EXCHANGE title was found. This is not proof the encrypted executable lacks it.
Private, ignored audit artifacts: `.local-history/exchange-iso-audit.json` (all file/member paths),
`exchange-choice-audit.json` (all 22 maps, team/type/slot choices, records and model results), and their TypeScript
drivers `exchange-audit.ts` and `exchange-choice-audit.ts`. They contain no replacement game artwork.

**Existing code evidence:** [research 94, B2-B6](94-the-arsenal.md) owns the earlier decompilation transcription;
[research 95](95-the-armory.md) owns ARMORY. These are source readings, not a new console measurement.
The decompilation was not available for an independent reread in the initial pass. The follow-up decoded the ISO
executable and read selected native functions directly (section 6). Desktop reference is read-only at
`desktop@be5578311ff2dd33a814d39e7d6d4f2255da4da3`; no new behavior depends on an unpushed desktop change.

**Other reference evidence:** the user's 742x553 screenshot shows WEAPON EXCHANGE with five kit rows, a SMGS
three-card picker, cyan translucent panels, a starting-round banner and a respawn prompt. It does not establish
the opening button, mode/version, input-repeat policy, sounds or equipment timing. It was neither imported nor
shipped. No original-running capture comparison or physical-controller playtest has occurred.

## 2. Disc and archive paths

Paths below are disc-relative. `MP*.ZDB` means every one of the 22 multiplayer ZDBs was inspected.

| Purpose | Disc / archive member |
|---|---|
| Background and arrows | `RUN/MP*.ZDB :: RUN\COMMON\HUD2_TXR.ZED :: textures/newweapnbkrnd.tif/texdat`, `textures/hud_arrow_off2.tif/texdat`; corresponding `HUD2_PAL.ZED` |
| Weapon previews | `RUN/MP*.ZDB :: RUN\COMMON\HUDW_TXR.ZED :: textures/<IconTextureName>/texdat`; corresponding `HUDW_PAL.ZED` |
| Text and pad glyphs | `RUN/MP*.ZDB :: RUN\COMMON\FONT_TXR.ZED :: textures/font_text_01.tif/texdat`, `textures/font_special_01.tif/texdat`; `FONT_PAL.ZED`; metrics `RUN/READERC.ZAR :: fonts.rdr` |
| Items, labels, models, icons, firing records and sound declarations | `RUN/ZWEAPON.ZAR :: zweapon.rdr` |
| Team valves and character types | `RUN/MP*.ZDB :: READERM.ZAR :: mission.rdr`, `chartype.rdr`; `RUN/READERC.ZAR :: character.rdr`, `missionlist.rdr` |
| Held weapon geometry/model | `RUN/MP*.ZDB :: WEAP_GEO.ZED`, `WEAP_MDL.ZED`; M14 model key `m14_gun` |
| Weapon audio samples | `RUN/SOUNDS/BNKSTORE.ZAR :: <map>_fx.bnk`; declarations in `RUN/SOUNDRDR.ZAR :: sounds.rdr`; `HUDUI.bnk` is a separate interface bank, not evidence that Weapon Exchange plays a cue |
| Front-end ARMORY (separate) | `RUN/UI*.ZAR`, `RUN/UIZANIM.ZAR`, including `dlg_equipment_mp.rdr` and equipment animation scripts |
| Encrypted game code / visible title gap | `RUN/RAW/APACHE00.ZDB` members `ftscore`, `zsealetc`; loader `SCUS_972.75` and `OVERLAY/REL/DNAS.BIN` outside RUN |

The full-index artifact records exact prefixes where a member differs. The initial executable-decoder dependency
gap was resolved in the follow-up (section 6); all decrypted files remain private and excluded from the package.
The visible title/category labels are code strings, not a missing texture needing replacement artwork.

## 3. Availability, controls and timing

| Behavior | Original evidence and browser treatment |
|---|---|
| Open | In a match, dead or a late-join ghost, viewing self, not spectator; Inventory/R2 in Default configuration. `FUN_001f7ff0`, D:L56648-56661; `FUN_00240600`, D:L89371. Alive R2 belongs to the separate inventory. |
| Browse | D-pad Up/Down rows/items; Left/Right categories; visible highlight and card previews. `FUN_0023ebc0`, D:L88581; `FUN_0023d1b0`, D:L87851. |
| Held direction | Just-pressed state `== 1`, no automatic repeat, research 94 B3. Held-input tests preserve this. Automatic repeat requested in the brief would be a browser adaptation and has not been invented as original behavior. |
| Confirm/cancel | Cross confirms; Triangle/Start back to rows or close; R2 closes rows but is ignored by the picker. Circle is not cancel. `FUN_0023e5e0`, D:L88379. |
| Equip | Confirm writes the character type's next kit; classic mode equips at the next spawn/round rebuild. `FUN_00223680`, D:L75931; `FUN_00598b90` / `FUN_00599b60`, D:L455604; `FUN_00599f00`, D:L455719. |
| Reset | Round reset closes the menu and drops unconfirmed preview. `FUN_002a7d40`, D:L149757 -> `FUN_00240d50`. |
| Sounds | Active HUD menu is silent, research 94 R94.3. The unused CInGameWeaponSel loads .TCM_SELECT/.TCM_SLIDE but does not establish sounds for this menu. Weapon firing/reload sounds still come from each record. |

Layout, opacity, fade, pulse and typography remain the 640x448 transcription in `weaponSelect.ts`, research 94 B5
(`FUN_003ff7f0` initializer and cited floats). Screenshot scaling is not used to retune these values. Browser
keyboard/touch bindings and consume-until-release are explicitly browser adaptations; they do not change kit
acceptance, availability or equipment timing.
Visual discrepancy still to resolve: the supplied reference has white headings; the current source transcription
draws yellow headings. The rendered 960x700 browser capture also clips the far-left heading under the existing
height-based HUD scaling. These are recorded differences, not a claimed screenshot match. A matching original
capture with known mode, version, framebuffer and camera is needed to settle the heading color; narrow-window
HUD fitting remains a browser presentation limitation. No color or placement was tuned by guesswork.

## 4. Restrictions, supported items and gaps

All 22 map valve tables have `Enable_m14_gun = 9`, allowing both team bits. M14 is item **60**, record **M14**,
model **m14_gun**, icon **m14_icon.tif**, capacity **20**, with `.M14`, `.M14_M`, `.M14_F`, `.M14_RLD` sound names.
Every primary/secondary reached by the audited legal ARMORY rings has a firearm record. Every inspected firearm
model decodes to nonzero triangles on every multiplayer map; no substitute M4 model or record is used for M14.

The menu uses each map's own valves, including locked slots, single-copy equipment, sniper/thermal dependency,
launcher ammunition dependencies and pick autofill (research 94). It does not broaden team masks. Tests explicitly
refuse SEAL AK-47 (58), Terrorist M4A1 (54), and ID 999 while retaining the last accepted M14.
`exchange-choice-audit.json` records each map/team/type/slot ring; its list is not a claim that every equipment
effect has received a physical playtest. Native objective mode comes from `missionlist.rdr`; the local package
offers Frostfire (MP2, SUPPRESSION), Vigilance (MP51, SUPPRESSION), and Crossroads (MP72, DEMOLITION), with classic rounds, without forcing a common
mode. Respawn-mode behavior suggested by the screenshot's prompt is outside this classic-rules package;
the still image does not establish respawn timing.

Unsupported/unverified: the Designator (11), standalone M203 (141), and empty firearm slots retain the pre-existing
`NO_FIREARM_RECORD_PLACEHOLDER` outside legal default/picker firearm choices. They must not be selected through
developer kit overrides for this playtest. This task does not claim those fallback paths are restored weapons.
F2000 and other disabled records are not enabled to make a test pass. Missing disc data is not a supported test
configuration; both browsers require their own ISO and the host requires its extracted RUN tree.
Original remote rebuild timing remains the existing `REMOTE_KIT_APPLY_PLACEHOLDER` (research 94); browser/server
synchronization is tested as a browser protocol adaptation, not proof of original network timing.
The baseline's `sound/catalog.ts` also names casing-impact fallback sounds (research 90), a pre-existing parity
departure. This change neither adds a replacement weapon sound nor claims that every casing impact is exact.
All-weapon tests cover sound-declaration lookup; only M14 has explicit cue-name assertions and browser playback
checks. Sample-by-sample original-console audio comparison remains untested.

## 5. Verification record

See the dated Log in [the local plan](../plans/2026-10-05-original-weapon-exchange.md) for command results, failures,
skips, review scope and package checks. Unit tests, dev-disc tests, rendered browser tests, physical playtests and
original-console comparisons are reported separately. No new gameplay constants or placeholder behavior are added.

## 6. Full-loadout follow-up and native ISO check (2026-10-06)

The user's clarification asks for all five slots and supplies the original US manual (printed 22, PDF 24).
The manual was visually read from that exact PDF. It documents the post-death opportunity before the next round
and R2 / Up-Down / X / Left-Right / X. It does not settle survivor access or every submenu input. See the
[category audit](../weapon-exchange-categories.md) for its link, complete choice lists, quantities, support status,
map differences and direct screenshot comparison. No outside game assets or behavior references were introduced.

**Direct executable reading:** a fresh reviewer independently checked the following hashes and instruction
readings and ran the four executable-backed tests. Extracted only `SCUS_972.75`, `OVERLAY/REL/DNAS.BIN` and
`RUN/RAW/APACHE00.ZDB` from the supplied ISO. Existing decoder tooling executed the disc's own loader using local
Unicorn 2.1.4/Capstone 5.0.9 dependencies. DNAS's 131 blocks, both overlays and merged ELF validated against the
decoder's expected values, with `--no-record`; reference files were not modified. It took 585 seconds.
Build identifier: `SOCOM 2 r0001 17:22:21 Oct 11 2003`.

| Private decoded output | SHA256 |
|---|---|
| ftscore.bin | `cf09a7fabaf59a1d68f01411bd1db9e859af054df1f2fbc4775d8c221785f836` |
| zsealetc.bin | `cdb3fa8e707090ac879874e3987c6b7784808a4767e85d0e19fc6909d36549b1` |
| socom2_game.elf | `06b83684719a78ad0580f236bd0eddd40453f87d9c30c0d39021331915798872` |

The private disassembly is an inspection aid, not copied into git or the package. Capstone is not a complete
R5900 decoder; conclusions below use ordinary MIPS loads, branches, calls, immediate values and stores, not its
mislabelled quadword instructions. `weaponExchangeExecutableDisc.test.ts` reads the ELF's load segments and checks
the relevant instruction fields with `SOCOM_EXCHANGE_ELF`; absent private ELF means skipped, not passed.

- `FUN_0023d1b0`, native `0x23d1cc..0x23d240`: picker byte offsets 5/6 dispatch -2/+2; 4/3 dispatch +1/-1. The
  five-row handler `FUN_0023ebc0`, `0x23ebd8..0x23ec08`, uses the same 5/6 inputs for vertical movement.
  `FUN_0023d060`, `0x23d084..0x23d0fc`, sends -2/+2 to item iteration `FUN_0023c6f0`, +/-1 to category iteration
  `FUN_0023c840`. Both handlers compare input state with 1: press edge, not held repeat. Thus the current
  Up/Down-items and Left/Right-categories mapping is retained; the manual is abbreviated, not a basis to flatten it.
- `FUN_0023e5e0`, `0x23e64c` and `0x23e6a8`: confirmation loops over **five** slots, writing character-kit entries
  through `FUN_0053eee0`. The implementation is not merely primary selection or reopening pregame ARMORY.
- `FUN_005c75f0`, `0x5c7620`, `0x5c7694..0x5c7718`: item 194 enables doubling for pistol/SMG/rifle/shotgun/MG/sniper
  classes. The magazine count is shifted by one and its storage capped at ten. Grenades are outside those classes.
- `FUN_003ff7f0`, `0x3ff804`, `0x3ff814`, `0x3ff860..0x3ff870`, `0x3ff8b4..0x3ff8c4`: header/title tint is
  initialized to **128,128,64**, matching the port. The white screenshot headings remain a conflicting visual
  reference; no speculative recoloring was applied.
- `FUN_001f7ff0`, `0x1f8620..0x1f86a8`: the online/non-spectator/self-view gates split the live inventory call
  `FUN_00219c80` from the dead Exchange tick `FUN_00240600`, using character flag byte `+0xe1`, bit 4. The inspected
  block has no special survivor-countdown branch. This does **not** prove when the original clears that flag for
  survivors at round end; that lifecycle remains unresolved. Active-round living-player kit replacement stays refused.

The new ISO category audit covers every map and every default character kit, plus legal primary and rocket-launcher
contexts, so launcher ammunition and thermal choices are included. All reachable preview icons decoded. The tests
separate all-slot and dependent-category server/spawn checks from original-code word checks. Every distinct
dependent kit tested crosses actual room acceptance, deferred installation and peer spawn. Record/pouch checks
there establish consistency with existing helpers; the default-kit equipment tests independently calculate
quantities from the disc projectile capacity and magazine fields. C4 has implemented target-specific placement, but original reach and all-map physical behavior are not claimed
complete. Full original rendering/capture parity, remote timing and survivor lifecycle still require evidence.
