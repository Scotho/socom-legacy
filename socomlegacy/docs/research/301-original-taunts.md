# 301 — Original taunts and Setup Taunts

Branch `chris/original-taunts`, based on tested Weapon Exchange commit
`4281114fd7b3fef839d3d5530c365241f089d5b3`. This note separates original-data readings, manual evidence,
browser adaptations and unresolved work. No original-running comparison was performed. Native addresses below
refer to the local US disc's game overlay ELF, SHA256
`06b83684719a78ad0580f236bd0eddd40453f87d9c30c0d39021331915798872`.
They are original executable instruction addresses, not decompilation line references. No executable, disassembly,
game artwork, font, sound, screenshot or manual image is included in this change or test package.

**Onto main (2026-10-07, `agent/taunts` from main `6f5081a3`).** The merge controller's rework changes three facts
of this note, each marked where it stands: the five are saved **on the emulated memory card** in the save file's
`CUIVarManager` module (§6), not under a browser key; the match's taunts are **one shared part** that both
`/testroom` and the menu-launched ONLINE match mount (§3, §7); and `/testroom`'s **Setup Taunts** button is a
**development build's only** (§6). The player's way in is the original's: ONLINE > OPTIONS > SETUP TAUNTS.

## 1. Sources and confidence

- **Manual reference:** original US manual, printed 29–30 / PDF 31–32,
  [Chat Menu and Setup Taunts](https://www.videogamemanual.com/PS2/SOCOM-%20U.S.%20Navy%20SEALs%20II%20%28USA%29.pdf).
  Tap Circle opens Chat Menu; directions navigate, Cross selects/transmits. Hold Circle is headset talk.
  Taunts address opponents; Setup Messaging addresses teammates. Online Options → Setup Taunts edits saved text.
  Text entry supports the original virtual keyboard and USB keyboard. The keyboard picture does not establish
  the taunt screen's appearance. No other external source was consulted or permitted.
- **ISO readings:** repository ISO/ZAR/ZDB/RDR readers plus direct inspection of the original ELF. A separate
  reviewer reread the native controller, recipient, audio, layout and editor findings. Tests hold transcriptions;
  this is **reading**, not proven console behavior.
- **User reference:** supplied Chat Menu screenshot was viewed, never used as artwork. It shows an OPTIONS row
  not yet tied to the inspected online builder. The current five-root-row implementation does not claim that
  screenshot's complete tree or exact pixel parity.
- **Full-disc search:** 349 files, including all 47 outside RUN; 2,311 archive indexes parsed without errors.
  Search terms included taunt, MPTAUNTMSG, TCM, keyboard, menu and sound names. No taunt-specific artwork was
  identified outside RUN. This is an inventory/search result, not proof that every disc instruction is decoded.
  Raw findings, extraction and screenshots remain in ignored local task records.

## 2. Disc and archive paths

| Disc path | Archive member / fields | Use |
|---|---|---|
| `RUN/READERC.ZAR` | `orders.rdr`, `HudCLOC.rdr`, `character.rdr`, `controller.rdr` | Menu defaults/captions, five defaults, character vocals and input bindings |
| `RUN/UI/READERC.ZAR` | `dlgOnlineOptions.rdr`, `dlgSetTaunts.rdr`, `dlgNetLogin.rdr`, `UiParams.rdr` | Original Setup Taunts controls, variables and keyboard configuration |
| `RUN/UIZANIM.ZAR` | `Anim_Sets/dlgSetTaunts.rdr/*` | Original setup scripts and animations |
| `RUN/UI/UIMP_TXR.ZED`, `RUN/UI/UIMP_PAL.ZED` | Original dialog texture/palette members referenced by its layouts | Setup Taunts artwork |
| `RUN/UI/UISK_TXR.ZED`, `RUN/UI/UISK_PAL.ZED` | Original keyboard texture/palette members | Virtual keyboard artwork |
| `RUN/MP*.ZDB` | `RUN\COMMON\HUD2_TXR.ZED` / `textures/TCM.tif`, `textures/TCMarrow.tif`; matching `HUD2_PAL.ZED` | Chat panels and arrows |
| `RUN/MP*.ZDB` | `HUD_TXR.ZED` / `action_TCM.tif`; `FONT_TXR.ZED` and `FONT_PAL.ZED` / `font_text_01.tif`, `font_special_01.tif` | HUD/action and original text/button glyphs |
| `RUN/MP*.ZDB` | `READERM.ZAR::chartype.rdr` | Map's SEAL/Terrorist character types |
| `RUN/READERC.ZAR` | `character.rdr::sounds/multiplayer`, `CMD_MP_TAUNT1` … `CMD_MP_TAUNT7` | Character recording IDs and subtitle text |
| `RUN/SOUNDRDR.ZAR` | `sounds.rdr::SETS/ST`, `MULTI` sound parameters | Recording lookup and native range |
| `RUN/SOUNDS/VAGSTORE.ZAR` | `PS_*.VAG`, `PT_*.VAG`, `PO_*.VAG` selected by those records | Original recorded speech only |
| `RUN/SOUNDS/BNKSTORE.ZAR` | `HUDUI.bnk`, resolved `.TCM_SLIDE` / `.TCM_SELECT` | Original browse/select sounds |

Assets load from the selected local ISO at runtime through existing readers. No generated substitute is used.
The editor reuses the original front-end compositor and dialog scripts rather than a screenshot reconstruction.
`dlgSetTaunts.rdr::SCREENS[0]` names the static background `multplay_back.tif` in UIMP; it is not an MPEG screen.
Its shared texture references include `backsolid.tif`, `brown_back.tif` and `brown_back_real.tif`.
`UiParams.rdr` names UISK's `SKB_English_Set.tif`, `SKB_English_Set2.tif`, `SKB_USB_Icon.tif`, `SkbDepress.tif`,
`SkbHighlight.tif`, `SkbLegend.tif`, `Skbbg.tif`, `Skbbg_LC.tif` (and the alternate Euro keyboard textures, which
are not used as a substitute for the US layout). The exact widget/layout references determine which image draws.

## 3. Native menu and controls

`FUN_002344e0` builds TACTICAL ORDERS, TAUNTS, RADIO, TEAMMATES and MESSAGES. Only TAUNTS is implemented in this
feature; selecting another branch does nothing (a development build says so on the message line). *2026-10-07:*
TACTICAL ORDERS and MESSAGES are unparked by Chris's settings, their rows the shared part `matchChat.ts` gives this
menu (research 302 §3); RADIO and TEAMMATES stay parked. Since the rework
the menu, the send, the receive, the HUD line and the vocals are one part, `packages/viewer/src/matchTaunts.ts`,
mounted by both pages' matches (ONE-WIRE, research 222): `FRONT_END_CAPABILITIES.taunts` and the `taunt` hook under
`PART_DEPS.taunts` (`matchCore.ts`, `matchNet.ts`); the vocals play through the match's sound part's `GameAudio`
(`matchSound.ts`). The original help
captions remain intact. CHARACTER TAUNT precedes five editable text rows. Custom IDs are `0x36..0x3a`;
character selection uses `0x3b + random % 7` (`0x0022f9ec..0x0022fa48`).

`0x00235bdc`, `0x003dcaf8`: Circle held strictly over 0.3 seconds takes the voice path; release before that opens
Chat (`0x00235c78 → FUN_00235440`). This build reserves a hold without implementing headset voice.
In the open menu, Cross or the TeamCommand/Circle press selects. Triangle release returns one level, then closes
at the root (`0x00235d40`, `FUN_002302d0`, `FUN_00235300`). Up/Down repeat at 0.2 seconds; the same native delay
blocks all actions until it expires (`0x00236088`, `0x00236a50`, `0x003dcaf0`, `0x00235d6c`).
Closing imposes a 0.3-second reopen delay (`0x0023536c..0x0023537c`). The back helper has no sound dispatch;
browse/select sounds are not reused for cancel. Opening resets selection to the first root row
(`FUN_00235440`, `0x002354d4..0x002354dc`).

Each of the six taunt nodes has its own five-second cooldown (`FUN_00232240`, node `+0x73c/+0x740`), retained when
the menu closes. Sending another distinct slot is allowed during that time. Client and server enforce the same
per-node limit. This is not a newly invented global cooldown.

## 4. Eligibility and recipients

The root taunt enable callback `FUN_0022f810` tests actor alive (`+0xe1 bit 4`) or online spectator, but the actual
spectator tree (`FUN_00232bc0`'s branch 2, D:L83641-83645, chosen by `FUN_001fa360` D:L57441-57448) contains only
RADIO *(2026-10-17, AD-11, research 227 §2.10: was `FUN_00232c80`, a function this decompilation does not hold)*. Therefore this feature exposes taunts only for a living match
player; dead players and spectators cannot send. It does not reuse Weapon Exchange's dead-player gate.
No separate round-state prohibition was found in that callback; server launch/arming still prevents a player
from sending before their match actor is available. Survivors can send while the ordinary alive gate is true.

Both custom and vocal sender paths select the opposing team, then execute a local echo
(`0x0022fc34..0x0022fc7c`, `FUN_005e7f20`). Receiver `FUN_002bac40` checks team selectors `-3/-2` using
`FUN_002c31a0` / `FUN_002c3080`; those compare team words, with no alive filter. The sender sees/hears its own
taunt once; enemy players, including dead enemies, receive it. Teammates and non-team spectators do not.
The server derives sender name, team, character and position; client-supplied recipients are refused.

Local controller `FUN_005431f0` versus remote `FUN_002b3bd0` is selected
at `FUN_005e7de8`. Local audio dispatch is unplaced `FUN_00343550`; remote dispatch `FUN_00342b20` uses actor
position. The stream path `00342b20 → 00342f94 → 00342fe8 → 00342240` carries pan and range gain. The general
sound constructor `FUN_00345620` defaults to 160/430, but all 184 distinct character taunt sounds have `MULTI`
records; their inspected `RANGE` is **120,300**, which overrides that default. The implementation loads each
taunt's original sound parameters and applies existing stream volume/pan arithmetic. Custom text has no audio.
Continuous tracking after stream start and real speaker/headphone measurement remain unverified.

## 5. Geometry

Native coordinates are on 640×448. `FUN_00230964` / initializer `0x003ff490`: columns x=20+184×column,
row y=55+20×index, width164, height22; text x+10,y+17, scale0.9. Child arrow x+168,y+4,8×14.
Rows use original `TCM.tif`, split 60%/40%. Left UV `(1,0)→(0,1)`, right `(.7,0)→(.3,1)`.
Right panel edge has zero vertex alpha (`0x002327f8..0x0023283c`, `FUN_00358f70` vertex order).
Normal tint128/128/128; alpha100/128; text128/128/128 alpha80/128. Selection tint is
`(80,120,120)+(85,130,130)*pulse`, with native triangle pulse speed8/second (`0x00236478..0x00236508`).
Help panel20,20,600×27, tint160/250/250; both halves use `(.7,0)→(.3,1)`; text30,41,scale1
(`0x00234340..0x002343d4`). Source transcribed values are retained rather than tuned against a still image.
Opening/closing slide/fade interpolation is unresolved; current drawing uses verified fully open geometry.

Custom row construction `FUN_00232170` truncates strings of length≥32 to first30 plus `-`, while preserving
the full transmitted string. Help is the original “Send a custom taunt to your enemies”.

## 6. Editor and persistence

`dlgSetTaunts.rdr/do_chat` calls GetTextInput with `PlayerChatSkb`, 45 characters, 46 bytes including NUL,
allowEmpty=false. Five `MPTAUNTMSG1..5` variables are separate from `MPLOCALSOP*` teammate messages.
HudCLOC defaults60762..60766:

1. THIS IS THE END FOR YOU
2. COME GET SOME!
3. CAN YOU FEEL THE LOVE? IT FEELS LIKE BULLETS
4. DON'T LET THE DOOR HIT YOU.
5. YOU NEED TO READ THE PIZANTS, MY HOME SKILLET

Original keyboard script handles controller text entry, Square backspace, R1 case, Enter/Circle acceptance and
Triangle cancel. Physical keyboard events feed the existing USB translation only while text entry is active;
this does not add keyboard gameplay (release builds included: `connectSoftKeyboard(..., true)` queues a key only
while the soft keyboard is open, and a release build hands the match's `padFrame` no key: `keyboardGate.test.ts`,
`matchMount.test.ts`). The player's way in is ONLINE > OPTIONS (`dlgOnlineOptions`) > SETUP TAUNTS (`dlgSetTaunts`).
`/testroom`'s **Setup Taunts** button (`tauntDevEditor.ts`) is a development build's only, with `?devmode`: it is
mounted under `import.meta.env.DEV`, so no release build creates it; it opens the same disc dialog over the page's
card and writes the card itself when its RETURN closes it (it has no ONLINE OPTIONS around it).

The edit starts with a fresh buffer, not the saved string: `0x0038d838..0x0038d848` passes the empty original
buffer `0x0049ec70` through `FUN_0038b440 → FUN_00398ea0 → FUN_0039a5b0`. The request's UiVar names the save
target; it does not prefill the input. A cancelled fresh draft leaves the saved value unchanged. This was
independently reread after an initial test incorrectly assumed prefill. The corrected disc test supplies a
draft, verifies controller Square/accept/cancel and edits all five slots. Physical letter case uses the original
USB Shift XOR CapsLock path; simulated browser typing must send those modifier states explicitly.

**Where they are saved (rework, 2026-10-07).** On the emulated memory card, as the original saves them: the save
file `BASCUS-97275SOCOMII`'s `CUIVarManager` module, beside `CValveSaveManager` and `CAcctDB` (research 102 R102.9,
135 §4), written by the page's `SaveConfig` (`personaHost.ts`: `serializeUiVars` -- the persistent vars,
`MPLOCALSOP1-5` and `MPTAUNTMSG1-5` -- as R7's JSON, one key a variable, `uiVarModule`) and read back at the
session's start and at each `LoadConfig` at longevity 3 (`restoreUiVarModule`), before `dlgNetLogin`'s ONSTART adds
the HudCLOC defaults at 3 -- an `add` that leaves a held persistent var as it is. They are the card's, not a
persona's: every persona on that card shares them. No browser key holds them (`s2u.taunts.v1` is gone).

*When the original saves them* (the disc's scripts, `tools/test/onlineDialogs.pinned.json`): `dlgSetTaunts`'
`do_chat` runs `GetTextInput`, then sets the valves `OptionsMenuChanged = 1` and `TAUNTSChanged = 1` and runs
`NetCensorText`; no SaveConfig in the dialog. Its TRIANGLE (`ResetDefaults`) with a change asks and, on NO, restores
the five from the copies its ONSTART made (`SetTauntVarOnStart`'s five `CopyUiVar`) before leaving; RETURN leaves with
the edit. Back on `dlgOnlineOptions`, its ONSTART (`OnStartAct`) keeps `OptionsMenuChanged`; its RETURN runs
`check_then_save_and_leave`, which with `OptionsMenuChanged == 1` calls `UIMemCardAnim.rdr`'s `save_and_leave`
(#831 "save?", the slot, `Ensure_MC_Dirs`, `SaveConfig(BASCUS-97275SOCOMII)`); its SAVE button (`ForceSave`) runs
the same. The page follows that chain. ONLINE's OPTIONS row was parked on main (`PARKED_ROWS`, OT.R8, owed to OPT-15); this
taunts slice of OPT-15 unparks it, so its CROSS runs `Goto_Options` whole (research 158 §3's row). On `dlgOnlineOptions`, SETUP TAUNTS and the save unparked with the taunts (2026-10-07); the other rows stay OT.R8-parked, owed to OPT-15 in sprint 22:
PLAYER DESCRIPTION, SETUP MESSAGING (`dlgSetSOP`; unparked with Chris's settings, 2026-10-07: research 302 §3), INPUT
FILTERS and the TEAMMATE NAMES and EXTERNAL WHISPERS strips are parked (`ONLINE_OPTIONS_PARKED_ROWS`; a strip by its control, `UiControlGate`), SETUP TAUNTS, SAVE and RETURN / TRIANGLE run
(`ui/test/screens/onlineOptionsScreen.test.ts`). *(2026-10-10, OPT-15: the four rows above are unparked and
`ONLINE_OPTIONS_PARKED_ROWS` is empty -- web research 265 §1.)* The card rows answer from the page's card on `dlgOnlineOptions` too
(`PERSONA_FORM_CARD_ROWS_ADAPTATION`, its ONSTART's `has_memcard_changed` poll left the boot stub's).

*What the game-written cards hold* (`tools/test/cardUiVarsDev.test.ts`, dev host): `one.bin` and `two.bin` carry the
ten keys, `MPLOCALSOP1-5` then `MPTAUNTMSG1-5`, each a one-string record holding its HudCLOC **key**, not its text
(`_60762_ThisBulletMightSting_MSG` ... `_60766_YouNeedToRead_MSG`): none was edited on those cards. `virgin.bin`
and `created.bin` hold the module empty. The nominal size counts the keys: `personaFileSize(1, 10)` is `one.bin`'s
6,208 B, `personaFileSize(2, 10)` `two.bin`'s 6,400, `personaFileSize(1)` `created.bin`'s 5,248 (the ten keys are
960 B on both cards; another count is `UI_VAR_KEY_BYTES_PLACEHOLDER`'s mean a key). The match shows and sends a key's
caption (`tauntText`: the HudCLOC id's text), resolved on the sender. The original resolves it at the menu and at
each receiver's playback, and sends the id: the menu row by `FUN_0022fa90` D:L81669-81682 (the custom slots
0x36..0x3a through `FUN_002c3b60`, resolved by `FUN_00361b60`); the send `FUN_0022fc00` D:L81722-81724 ->
`FUN_002bad40` D:L160238-160248, six bytes (sender, selector, message id), not the caption; the receiver
`FUN_002bac40` D:L160207-160228 -> playback `FUN_005e7960` D:L498151-498163, which takes the sender actor's slot and
resolves it by `FUN_00361b60` D:L260211-260220. A key with no entry comes back as itself there (and from the getter
`FUN_002c3b60` D:L165252-165278), where the port's `tauntText` returns a default. Reading (the research
reconciliation's chunk 06, re-read independently in its chunk 16, C60); the port's text wire is unchanged until the
row that adopts it, and the original's slot replication, locales and timing are not measured
(`TAUNT_KEY_TEXT_READING`, note only). *[2026-10-15, sprint 40 AD-0: was "where the original resolves the key was not traced"]* `MPLOCALSOP1-5` ride in the same module; SETUP MESSAGING's dialog is not wired.

The development-only `/testroom` editor does not reproduce music inherited from a preceding online front-end screen.
Its own dialog scripts request no music or movie; the full front-end retains its existing MenuMusic path.

## 7. Browser safeguards (not original behavior claims)

Plain text only; no HTML injection or TTS. Server rejects unknown fields/IDs, forged recipients, empty/oversized
text, control characters and stale/duplicate request numbers. UTF-8 byte bounds are conservative for the
original single-byte editor. Native per-node cooldown bounds accepted broadcasts; monotonic IDs prevent
duplicate processing. The client deduplicates delivered sender/request pairs. Invalid requests are dropped;
only authoritative server echoes count as accepted sends.

Menu input is consumed until release (`matchTaunts.ts`, both pages). Entering a menu explicitly releases the rifle/turret latch and cancels
an uncommitted held grenade without throwing or changing ammunition. Already committed throws are retained.
Death/respawn closes Chat to keep input ownership safe. The exact original round-boundary close hook is not
yet read, so this closure is a browser safeguard, not an established original transition rule.

## 8. Specific remaining gaps

- Screenshot OPTIONS root row is not established by the inspected online TCM builder. Other root branches are
  visible but unsupported, outside this taunts feature.
- `mp_seal6` lacks `CMD_MP_TAUNT1` in the resolved sounds: MP71/MP72/MP73, SEAL character index3, vocal index0.
  Full inheritance behavior is unresolved; these selections report missing original mapping, with no substitute.
- HUD taunt-message color5 was independently read at `FUN_002b7530`, stores `0x002b75d8..0x002b7604`:
  (128,64,64,100), selected by `0x005e7e98..0x005e7ebc` and table lookup `FUN_002b6530`. Both text and vocals
  now use this color with the existing HUD message fade. A focused rendering test holds the transcription.
- Native animated opening/closing, original round-boundary closure, continuously moving sound-source behavior,
  original-console capture comparison and physical Windows/Mac controller/audio tests remain unverified.
- The seven-way server choice follows the original range; the original PRNG's sequence/state is not reproduced.
- The supplied screenshot is not a controlled original-running trace. No claim here is upgraded to **proven**.

- Custom text beyond the soft keyboard's character set (Unicode typed or sent by a modified client): the server's
  bounds hold its length and control characters only; whether to censor or refuse it is the owner's moderation
  question with the original's `NetCensorText` (the rework review, 2026-10-07). Left as it is.

## 9. Verification

Focused tests cover native tap/hold/repeat, bounds/dedup/cooldown, server recipient routing, real disc defaults and
all character mappings, original editor script/USB entry, positional streams, panel UV/alpha and grenade input
cancellation. The task plan and packaged test record contain actual run results, skips and browser outcomes;
an unfinished or skipped run is not a pass.

The rework's runs (2026-10-07: unit, dev-disc and the document checks; the browser specs owed to the merge
controller's gate tree) are in [the plan's Log](../plans/2026-10-06-original-taunts.md#log).

## 10. Placeholders

| Name | Evidence required to settle it | Status |
|---|---|---|
| TAUNT_OPTIONS_TREE_READING | ISO builder/caller establishing screenshot OPTIONS row | note only; no invented branch |
| TAUNT_INHERITANCE_READING | Original inheritance resolution for mp_seal6 CMD_MP_TAUNT1 | note only; missing mapping reported |
| TAUNT_MESSAGE_COLOR_READING | Original color5 table and HUD dispatch | resolved; transcribed, implemented and tested |
| TAUNT_MENU_TRANSITION_READING | Original slide/fade interpolation and call timing | note only; verified fully open geometry only |
| TAUNT_ROUND_CLOSE_READING | Original round-boundary menu cleanup caller | note only; browser input safeguard identified above |
| TAUNT_STREAM_TRACKING_READING | Original stream source position updates during playback | note only; initial spatial placement implemented |
| TAUNT_RANDOM_SEQUENCE_READING | Original PRNG state/seed and call sequence | note only; authoritative seven-way choice uses the existing server RNG |
| TAUNT_KEY_TEXT_READING | Where the original turns a slot's HudCLOC key (`_60762_..._MSG`, what `dlgNetLogin` sets and the cards hold) into text for the room: the sender's menu row, the send or each receiver | note only; the sender resolves it by the HudCLOC id (`tauntSettings.ts` `tauntText`), so the room carries text |
| UI_VAR_KEY_BYTES_PLACEHOLDER | A card the game writes with another set of persistent UI variables than the ten (the bytes a key adds to `BASCUS-97275SOCOMII`) | in code (`packages/card/src/persona.ts`); the ten's measured 960 B stand for the ten |
| UI_VAR_MODULE_KEYS_READING | Which persistent UI variables the original's `CUIVarManager` load takes back off a card (the ten a card gains online are what `one.bin` and `two.bin` hold) | in code (`packages/ui/src/uiVars.ts`); the restore takes those ten, drops a module's other keys and never throws (the rework review, 2026-10-07) |
