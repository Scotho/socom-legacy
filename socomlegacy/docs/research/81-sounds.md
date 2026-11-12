# 81 — The walk's sounds: the 989snd banks on the disc, how the game names them, and when it plays a step, a round, a jump and a landing (2026-09-28)

The audio workstream of the walk mode (the owner: "would be lovely if we could play walking sounds / gun fire sounds /
jumping and landing sounds"). Read-only on the disc (`game/disc/RUN/`, the owner's extraction, and the owner's ISO) and
on the decomp (`game/analysis/socom2_game.elf.decomp.c`, cited as `decomp:<line>`; the functions by `FUN_` address).
The 989snd arithmetic is the repository's own model of the IRX -- `third_party/ps2recomp/ps2xRuntime/src/lib/
snd989_mixer.cpp`, `socom2_bank.cpp`, `ps2_audio_vag.cpp`, and research/06, 32, 36 -- cross-read with the 989snd
reference in `research/989snd-ziemas` (`iop/types.h`, `iop/playsnd.c`, `iop/loader.c`). Nothing of the disc is in the
tree; the numbers below are counts, offsets and names.

## 0. The answers

- **The containers** (§1). `RUN/SOUNDS/BNKSTORE.ZAR` (67,433,088 B) is a v2 ZAR of 115 `.bnk` members: `HUDUI.bnk`
  and, for every map and mission, `<map>_am.bnk` (ambience and the body: steps, landings, the jump, impacts),
  `<map>_fx.bnk` (the weapons and explosives) and `<map>_vc.bnk` (the voices). `RUN/SOUNDS/VAGSTORE.ZAR`
  (576,593,920 B, 10,942 `.vag`) is the voice-over and radio streams -- nothing the walk plays. `RUN/SOUNDRDR.ZAR`
  holds `sounds.rdr`, the sound script. Both stores write 0 in the ZAR head's data size (+84), which the engine never
  reads: a zero is "the rest of the file" (`@s2u/archive`'s `Zar.parse` now takes it so).
- **Since the first cut** (§5, §6, §7, §9, §10): material byte 0 is the map's `DefaultMaterial`; the zAnim
  callbacks follow their starts; the reload sound starts with the reload; `.BUL_PASSING` is others' rounds within 20;
  no landing grunt, the hurt voice `.SEAL_DAMAGE`; the SPU2 reverb (libsd mode 3) at the mission's indoor/outdoor
  depths; the beds and the emitters; the sounds a map's banks lack, borrowed.
- **The bank format** (§2) is 989snd's `SBlk` version 3 behind a two-chunk `FileAttributes` head, with **names**:
  every sound of every bank carries a 16-byte name (`.STEP_STONE`, `.M4A1_SIL`, `~AK47_1`, `!SMK_CANISTER`) in the
  block's hashed name table. The samples are headerless SPU ADPCM; a tone's centre note encodes the sample's rate.
- **The lookup** (§3). The game names a sound by that string and turns it into a CRC-32 (`FUN_003a2370`, zlib's);
  `sounds.rdr` files each sound's parameters under the same number -- `RANGE (min max)`, `ONESHOT`, `MED`/`FAR` --
  per bank block. `RANGE` is the distance fall-off (`FUN_00342670`): full inside `min`, linear to 0 at `max`.
- **Footsteps are per surface material** (§4). `READERC.ZAR/materials.rdr`'s `SOILS` list gives each material a
  `STEPSOUND`, `STEALTH_STEPSOUND`, `CRAWLSOUND`, `LANDSOUND` and `FALLSOUND`; the table's index **is** the collision
  polygon's `material` byte, counting from 2 (the engine appends `UNKNOWN` and `PARTICLE_SYSTEM` first). A step fires
  on the locomotion clip's phase -- the left foot entering (0, 0.5), the right entering (0.5, 1) -- not on a clip
  callback (`FUN_005a3570`); the sound is the crawl prone, else the step when the stick is past half, else the stealth
  step (`FUN_005a39b0`).
- **The M4A1 SD** (§5): `zweapon.rdr`'s record names `FireSoundClose .M4A1_SIL` and `ReloadSound .M4A1_SIL_RLD`, and
  no medium or far report (the unsuppressed M4A1 has `.M4A1`, `.M4A1_M`, `.M4A1_F`, `.M4A1_RLD`). A remote round's
  report is picked by its distance from the camera against `WEAPON_GLOBAL`'s 9 and 50 metres (§5).
- **The jump** (§6) is the `seal_jump` clip's `zanim_callback (name (jump_whoosh) time (0.4))`; the map's `CZANIM.ZAR`
  zAnim `jump_whoosh` plays `.JUMP_WHOOSH`. **The landing** (`FUN_005ac1f0`) plays the material's `LANDSOUND`
  (`.STONE_JUMP` ...) below the heavy fall-damage speed and `.BONE_BRK_1` above it (both at the deadly one).
- **In the viewer** (§8): `@s2u/sound` decodes and renders; the page reads the map's three banks and `HUDUI.bnk` by
  range (about 1.9 MB of the 67 for Frostfire, §1; `FUN_00344450` loads HUDUI with every map), plus the one or two
  banks lent for names the map's lack (§7), renders each sound at the game's volume and pan when it starts and plays
  it through Web Audio.
  Verified by the hook on Frostfire and Desert Glory, and by rendering the sounds to WAV (§11).

## 1. The containers

| Archive | Bytes | Keys | What |
|---|---|---|---|
| `RUN/SOUNDS/BNKSTORE.ZAR` | 67,433,088 | 116 (115 banks) | `HUDUI.bnk`; `M51..M83`, `M99`, `MP1..MP83`, `MP99`, `T2` x `_am`, `_fx`, `_vc` |
| `RUN/SOUNDS/VAGSTORE.ZAR` | 576,593,920 | 10,943 | `C0_0341A.vag`, `CH_0001.vag` ...: voice-overs, streamed (`snd_PlayVAGStreamByLoc`, research/32 §6) |
| `RUN/SOUNDRDR.ZAR` | 1,897,008 | 2 | `sounds.rdr`, 1,896,864 B compiled |

The head is the viewer's ZAR v2 (socomlegacy/docs/research/72, research/36 §1): flags 0, key count at +4, string-table size
+8, its packed address +12, padding +16 (0x800 here), data size +84 (**0** in both stores), version 0x20002 at +96.
A map's banks sit together: Frostfire's `MP2_am.bnk` at 29,667,072 (986,408 B), `MP2_fx.bnk` 30,653,568 (687,344),
`MP2_vc.bnk` 31,340,928 (176,088). The game loads them by disc location (`snd_BankLoadByLoc`, research/40 §9) from
`RUN\SOUNDS\BNKSTORE.ZAR;1` (ELF string 0x3f76a0).

**Which banks a map loads** (`FUN_00344450`, decomp 242785, from the map's load at 152105): `HUDUI`, `SMUS` and
`TCM_ECHO` (strings 0x3f7860-0x3f7870), then `<map>_vc`, `_fx`, `_am`, `_svo`, `_smu` (`%s_vc` ... at 0x3f7880-0x3f78a0),
then `MULTI` and `HOSTAGE` on a multiplayer map or a mission's cast (`BRAVO_SEAL`, `RUSSIAN` ...). The disc holds only
`HUDUI` and the maps' three: the rest fail to load and nothing asks for them in the walk. **`HUDUI.bnk`** (24 sounds:
`.NV_GOGGLES_ON`/`_OFF`, the countdowns, the menus' and keyboard's) is loaded with every map, and it is where the night
vision's sounds are (`DAT_0044ce30/38 = FUN_00344f30(0x65f568/0x65f580)`, decomp 461033; played without a place,
`vtable+0xc`, at decomp 410944/410948 as the view state enters or leaves 3). None of its names is in any map's bank.

## 2. A bank

`FileAttributes` (989snd): `u32 type` 3, `u32 chunks` 2, then `(offset, size)` per chunk -- `MP2_fx.bnk`:
`(0x18, 0x7df8)` the block, `(0x7e10, 0x9fee0)` the VAG data. The block (`SFXBlock2`, `iop/types.h:428-449`;
research/32 §1 with the `NumSounds` offset corrected there):

| Offset | Field | `MP2_FX` | `MP2_AM` |
|---|---|---|---|
| 0x00 | `DataID` `SBlk` | | |
| 0x04 | `Version` | 3 | 3 |
| 0x08 | `Flags` | 0x104 (bit 8 `BLOCK_HAS_NAMES`) | 0x104 |
| 0x0c | `BlockID` | `20EM` | `20AM` |
| 0x16 | `NumSounds` s16 | 187 | 90 |
| 0x18 | `NumGrains` s16 | 1,215 | |
| 0x1a | `NumVAGs` s16 | 58 | |
| 0x1c / 0x20 | `FirstSound` / `FirstGrain` | 0x40 / 0x904 | |
| 0x34 | `GrainData` (the tone pool) | | |
| 0x38 | `BlockNames` | 0x6c44 | |

A sound is 12 bytes (`s8 Vol, s8 VolGroup, s16 Pan, s8 NumGrains, s8 InstanceLimit, u16 Flags, s32 FirstGrain`), a
grain 8 (`u32 type<<24 | arg24`, `s32 Delay` in 240 Hz ticks), a tone 24 at a TONE grain's `arg24` in the pool
(`s8 Priority, Vol, CenterNote, CenterFine, s16 Pan, s8 MapLow, MapHigh, PBLow, PBHigh, u16 ADSR1, ADSR2, Flags,
u32 sample offset`). **The names** (`SFXBlockNames`, `types.h:324-332`): `BlockName[8]` (`MP2_FX`), then
`SFXNameTableOffset` (0x98, from `BlockName`), three tables SOCOM leaves 0, and 32 `s16` hash-bucket starts; an entry
(`SFXName`) is `char Name[16]`, `s16 Index`. `snd_FindSoundByName` (`playsnd.c:595-650`) hashes `abs(n[0] + n[4] +
n[8] + n[12]) % 32` over signed chars and walks the bucket to the first empty name. All 187 of `MP2_FX`'s, 90 of
`MP2_AM`'s, 8 of `MP2_VC`'s and 24 of `HUDUI`'s sounds are named. The first character is a sigil: `.` a one-shot,
`~` a looping bed or a distant variant (`~AK47_1`, `~OCEAN_SWELL_1`), `!` the smoke canister.

**The samples.** Headerless SPU ADPCM (16-byte blocks: `shift | filter << 4`, flags -- bit 2 loop start, bit 0 end,
bit 1 with it repeat -- 28 nibbles), decoded by the repository's proven recurrence (KNOWN §1, research/32 §3). **The
rate** is not stored: the tone's centre note says it. The SPU plays pitch 0x1000 at 48 kHz, the handler plays note
60, and `sceSdNote2Pitch` (research/32 §3; the centre fine is added) gives `.STEP_STONE`'s tone (centre -80, fine
124: a negative centre is "not a PS1 note") exactly 16,000 Hz; `.BONE_BRK_1` (-74, 66) 22,050; `.M4A1_SIL_RLD`
(-62, 66) 44,100. **Loops**: the step, shot and landing samples end (bit 0 without bit 1); the beds (`~OUTDOOR_AMB`)
loop.

**What a sound is.** `.STEP_STONE` (Vol 107, group 3): `RAND_PB` (a random pitch bend of +-0x46/100 of the tone's
PB range), `RAND_PLAY 10,1` (one of the next ten grains, never the previous pick), ten TONE grains -- ten takes of a
footfall, one voice each. `.M4A1_SIL` (Vol 80): two tones at once, a crack (vol 120) and a body (vol 80).
`.STONE_JUMP`: `RAND_PB` and one tone. `.JUMP_WHOOSH` (Vol 28): one tone.

## 3. How a sound is named and looked up

- **By name.** The game's strings name sounds exactly as the banks do: `.RIFLE_BUTT` (0x65f538), `.BONE_BRK_1`
  (0x65f548), `~LADDER_SLIDE`, `.NV_GOGGLES_ON`, `.GUNTOHOLSTER`, `.FALL_GROUND` (0x65e710); the data files likewise
  (`materials.rdr`, `zweapon.rdr`, the zAnim name tables). `FUN_00344f30` (decomp 243197) hashes the name with
  `FUN_003a2370` (decomp: a table CRC over the bytes, the table built from poly 0x04C11DB7 reflected, init and final
  `~0` -- zlib's CRC-32) and asks `FUN_00344bf0` for the sound object of that hash in one sorted table, 0 when none
  has it. The table's objects are the loaded blocks' script entries: `FUN_00344090` (D:L242656-242758) makes one per
  `SETS` entry of each block the map loads and `FUN_00348130` one per entry of the `GROUPS` it loads (a multiplayer
  map's `MP_COMMON` and `HOSTAGE`: `FUN_00344910`, D:L152106), each inserted by hash
  (`FUN_00343f90`, D:L242621-242651) [reading, 2026-10-05: a name `sounds.rdr` does not file finds nothing, even if a
  bank held it].
- **`sounds.rdr`** (`FUN_003435c0`, decomp 242323-242560): `SETS` holds a list per bank block (`SMUS`, `HUDUI`,
  `MP2_VC`, `MP2_AM`, `MP2_FX`, ... 128 sets, 20,812 entries) and `GROUPS` the voice-line groups. An entry is the
  name's CRC-32 (signed: `.STEP_STONE` is 1440126871, `.M4A1_SIL` -1181866505) and keys: `RANGE` (15,162 entries),
  `ONESHOT` (8,633), `MED`/`FAR` (1,150 each: marks on a weapon's distance variants -- **not read by the game**:
  `FUN_003435c0`'s key table, ELF 0x3f7708.., has no such key; §5 has the chooser), `SUBTITLE*`, `AMBIENT` (279),
  `DOPPLER` (27), `STREAMING_EFX`, `LINK`, `LOOP`. `RANGE`'s two numbers land as `u16` at +0xc and +0xe; `VOLUME` would be a float at
  +4 (no set uses it). The walk's: `.STEP_STONE` 30-200, `.STEALTH_STONE` 30-130, `.STONE_JUMP` 50-200,
  `.JUMP_WHOOSH` 30-130, `.M4A1_SIL` and `.M4A1_SIL_RLD` 20-200, `.M4A1` 85-1700, `.M4A1_M` 85-1700 `MED`,
  `.M4A1_F` 85-1700 `FAR`.
- **The 3D play** (`FUN_00342670`, decomp 241912-241955): the source into the listener's frame (the matrix at
  0x48dd40, the camera), `d` its length; `gain = 1` for `d <= min`, `1 - (d - min) / (max - min)` to `max`, 0 beyond;
  the play volume `= volume x gain x 1024 x DAT_003e0070` (1.0 in the ELF's data); the pan `= atan2(x, -z)` in whole
  degrees, 0..359 -- 989snd's pan, which its `MakeVolume` turns into the stereo pair through the quarter-wave table
  and the group stage squares (research/36 Q6).

## 4. Footsteps

**The materials.** `FUN_002dde40` (decomp 181253-181468) reads `materials.rdr`'s `SOILS` into the vector at
0x44f350 after `FUN_002de4b0` (decomp 181496-181567) has appended the engine's `UNKNOWN` (0, string 0x3f3800) and
`PARTICLE_SYSTEM` (1, 0x3f3810), neither with a sound. An entry without `NAME` is dropped. Each record: `NAME` +0x00,
`STEPSOUND` +0x08, `STEALTH_STEPSOUND` +0x0c, `CRAWLSOUND` +0x10, `LANDSOUND` +0x14, `FALLSOUND` +0x18 (each a sound
object, `FUN_00344f30` of the name), `STEALTH_FACTOR` +0x34, `FOOT_STEP_OFFSET` +0x38. The table: 2 `ACTION`, 3
`INVISIBLE_DI`, 4 `GRASS`, 5 `SAND`, 6 `MUD`, **7 `STONE`**, 8 `DIRT`, 9 `GLASS`, ... 11 `WATER`, 15 `LEAVES`, 16
`ICE`, 17 `SNOW`, 18 `GRAVEL`, 19-20 `WOOD_THICK/THIN`, 22 `ASPHALT` (the stone's sounds), 25-29 the metals and
grates, 30 `FABRIC_HEAVY` (the carpet's), 39 `PLASTER`, 40 `CARPET` -- 46 in all. **The polygon's byte is that
index**: `DAT_0044f358[m]` is what the ground probe, the step and the landing read, and the hulls agree -- Frostfire's
floors are `METAL_THICK` (374 floor polygons), `UNKNOWN` (197), `STONE` (163), `METAL_GRATE` (74), and its `MP2_am`
bank holds `.STEP_METAL`, `.STEP_STONE`, `.STEP_GRATING`, `.STEP_CARPET`; Desert Glory's are `SAND` (1,056),
`ASPHALT` (578), `STONE` (298), `WOOD_THIN` (158), and `MP6_am` holds `.STEP_SAND`, `.STEP_STONE`, `.STEP_WOOD`.
A material whose sound the map's banks lack (Frostfire's `METAL_THIN` asks for `.STEP_TIN`) is silent, as the
lookup finds no object on the console.

Per material, then, and per map (the `_am` bank's set): `STEP_<M>` and `STEALTH_<M>` walking, `CRAWL_<M>` prone,
`<M>_JUMP` the landing, `FALL_<M>` a body falling (`FUN_0059a8e0`, `BODY_FALL_ON_MATERIAL_SOUND`, a fallback
`.FALL_GROUND`) -- not the SEAL landing.

**When** (`FUN_005a3570`, decomp 460266-460378). While the SEAL moves -- speed squared over 0.25 (the stance 0 test is
`FUN_0058a820`'s class 2 or 3, the same threshold; crouched and prone the same squared speed) or the stick's forward
axis at 0.1 or more -- and while the playing clip carries flag 0x40 (`FUN_005551a0`: the locomotion cycles), the
clip's play position `+0x1c` is taken modulo 1: entering (0, 0.5) the left foot falls (flag `+0x211`, the bone at
`+0x2f0` for the position), entering (0.5, 1) the right (`+0x210`, `+0x2f4`), once until the position leaves the
half. At each fall a footprint zAnim (`seal_footfall_<MATERIAL>`, 0x65f520) and `FUN_005a39b0`; prone, the left
foot's call is skipped, so a crawl sounds once a cycle. There are no footfall `zanim_callback`s in `motion.rdr`.

**Which** (`FUN_005a39b0`, decomp 460385-460434): the material at `+0x20c`; prone (`FUN_0058a720` == 2) its
`CRAWLSOUND`; otherwise `STEPSOUND` when any of the controller's three stick floats is past +-0.5, else
`STEALTH_STEPSOUND` (so a walk at a light stick is the stealth step, standing or crouched); played at the foot with
volume 1.0 (`vtable+0x14`), or without a place (`vtable+0xc`) for the local player when `+0x200` is set.

## 5. The rifle

`zweapon.rdr`'s `ZWEAPON` records (keys `ReloadSound` 0x3fcb50, `FireSoundClose/Med/Far` 0x3fcc50-70): **M4A1 SD**
`FireSoundClose .M4A1_SIL`, `ReloadSound .M4A1_SIL_RLD`, no `Med`/`Far`, `FireWait 0.14`, `Sound_Radius 10`; **M4A1**
`.M4A1` / `.M4A1_M` / `.M4A1_F`, `.M4A1_RLD`, `Sound_Radius 100`. Both banks' sounds are in every map's `_fx.bnk`
(`MP2_FX` 97-102). **The reload sound starts with the reload**: `FUN_005c2a90` (decomp 477484-477537) takes the next
magazine, starts the reload (`FUN_005a82e0`) and in the same step plays the weapon's `+0x98` sound -- the `ReloadSound`
handle `FUN_003c4700` resolved from the name at `+0x9c` -- at the actor (`+0x1c`), volume 1.0. Another player's reload
(2026-10-02): the actor update calls the kit's frame with no locality test (`FUN_005506a0` L417907), so a console hears a reload
where its copy of the actor runs one; how a peer's copy comes to is not traced -- the page plays it from the room's
`reloadSound` (`REMOTE_RELOAD_SOUND_READING`, web research 91 §22.2, listed there).

**Close, medium or far** (traced 2026-09-29): the ZWEAPON reader stores `FireSoundClose/Med/Far` (keys 0x3fcc50/60/70)
as slots 0/1/2 (`FUN_003d0140`, decomp 322595-322609) and the bank load resolves them to handles at the weapon's
`+0xe0/+0xe4/+0xe8` (`FUN_003d01c0`, 316290-316300). `FUN_003cd810` (322042-322071) reads `zweapon.rdr`'s
`WEAPON_GLOBAL` keys `SoundDistanceClose/Med/Far` (strings 0x3fc5d0/0x3fc5f0/0x3fc610), scales each by `DAT_003dfe10` =
1 / `MetersPerUnit` (217166: 10 units a metre) and stores its square (`FUN_003d0100`, 323282-323288) in
`DAT_004b52f0/f4/f8`. The retail record: `SoundDistanceClose 0`, `SoundDistanceMed 9`, `SoundDistanceFar 50` -- 90 and
500 units. `FUN_003d2c50` (325494-325540, from the fire path at 479450) takes the round's position against the camera
(`DAT_0048db48 + 0x30`), its squared length: over the far square the `+0xe8` (far) handle, else over the medium one
`+0xe4`, else `+0xe0` (close); a null handle plays nothing; otherwise `vtable+0x14` at volume 1.0 at the round -- the
3D play, so the variant's own `RANGE` still gates it. So the game plays `.M4A1` within 90 units, `.M4A1_M` to 500,
`.M4A1_F` beyond (silent past 1,700 by `RANGE`). The M4A1 SD has no Med/Far name, so its slots are empty and past 90
units its round is silent [reading: the missing-name lookup was re-read on 2026-11-02; section 5.1 below].
`sounds.rdr`'s `MED`/`FAR` marks are data only (§3). The viewer: `weaponGlobals`, `fireVariant`,
`GameAudio.onFire` (pinned by sound.test.ts and audio.test.ts "picks a remote round by WEAPON_GLOBAL distance").

**A round passing** (`FUN_00598000`, decomp 454613-454655): each tick a projectile's segment is taken against an actor's
position (`FUN_00308b00`, the closest approach); within 70 units the actor flinches (`FUN_00572fa0`), within 20 a bullet
plays `.BUL_PASSING` (0x3fc508, `FUN_003c4700` hands it to the projectiles) at the nearest point, volume 1.0; a rocket
within 100 plays `.ROCKET_BY` once. A projectile flagged at `+4` bit 3 is skipped; the player's own rounds leave from
the player, so the rule is for other shooters' rounds (`GameAudio.onRoundPast`), never one's own. Whatever excludes a
round's first segment (the flag, or the shooter test at the head) is the projectile's, so its later segments -- a
penetration's exit, a ricochet -- are excluded with it: the viewer's own rounds play no `.BUL_PASSING` however they go on.

*Re-read and wired, LATER 644 (2026-11-02, `agent/bullet-passing`; reading, pending review; source inspection):*
- **Who hears it.** `FUN_00598000` (D:L454613-454651) is slot +0x44 of the player's controller `CSealCtrl` (vtable
  0x6694b0, research 181), of `CRemoteCtrl` (0x669590: another player's body on this console, research 191) and of
  `CSealCtrlSquirm` (0x6699f0); `CSealCtrlAi`'s slot +0x44 (0x6693f0 + 0x44) is `FUN_005729f0` (D:L434460), the AI's own
  test of a round passing, which plays no sound. The slot words were read off the ELF (the desktop's generated
  recompilation listing, which is not in git). The actor's point is `*(ctrl + 4) + 0x1c`, the body's place -- the feet
  (D:L454629) -- against the projectile's segment `+0x48` -> `+0x54` (`FUN_00308b00`, D:L454631). For a bullet that
  segment is the whole ray, set in one cast: `+0x54` = `+0x48` + the direction x `Maximum_Range` x 1.1 (`FUN_003ca5a0`
  D:L320383-320398; research 94 C1.12, R94.9: a bullet is a ray, no flight), so "each tick" above is a rocket's or a
  launched round's, not a bullet's.
- **The test.** A bullet class (`FUN_003d1e20` D:L324476-324483 refuses the classes 0xab, 0xb9, 0x79, 0x97, 0xbe, 0xe6)
  or the rocket's 0xb9 (D:L454625-454627); under 70 the flinch (D:L454632-454633); a bullet strictly under 20 plays
  `.BUL_PASSING` (`FUN_003d37c0`'s handle) at the nearest point, volume 1.0 (D:L454636-454637); a rocket under 100,
  once (`+6` bit 4, D:L454640-454646). Each **only when the nearest point is inside the segment, not at either end**:
  `FUN_00308b00` answers 0 when d.(p - A) <= 0 (D:L207298-207301) or (A - B).(p - B) <= 0 (D:L207313-207316) -- a
  segment of no length among them -- and every play wants its non-zero answer (D:L454636, D:L454640).
  So feet behind a shooter's muzzle, or past where the round ends, hear nothing however close (the review's F1:
  `passingSound` tests it, `closestOnSegment`'s clamp is left as it is).
- **Whose rounds.** There is no shooter or team test in the function (the "shooter test at the head" above was a
  misreading: its head tests the weapon, the class and the flag). The skip is the projectile's `+4` bit 3 (D:L454627),
  set at the fire to "the shooter is this console's player" (`FUN_002b3580`, `DAT_00440c38`): `FUN_005c5340`
  D:L479363-479364, `FUN_005bc730` D:L474037, carried to a child projectile at `FUN_003d2d70` D:L325637. So the
  player's own rounds pass no one on his console, and every other round -- an enemy's, a teammate's, a bot's, a
  tracerless one (no tracer test) -- passes him. A round that strikes him has no exception either.
- **Built.** `matchFirearm` `roundEffects` (another's round only: `netPage` never hands it the page's own `shot` or
  `impact`, and the page's own and turret rounds go elsewhere) calls `FirearmSound.roundPast` with the round's whole
  path, `from` -> `tracerTo ?? to`, against `walk.feet()`; `matchSound` sends it to `GameAudio.onRoundPast` (none under a
  round screen, OBF-31). `netPage` now keeps the room's `end` as `tracerTo` on every round, not only the tracer's
  (`effects` reads it only for a tracer), so the path past the first body is the round's (P12b, research 219 s3.2).
  Tests: `matchFirearm.test.ts`, `matchSound.test.ts`, `confirmedBlood.test.ts` "LATER 644"; the ends, `sound.test.ts`
  "plays nothing when the nearest point is an end of the segment".
- **Built, LATER 645** (2026-11-10, `agent/later-645`; reading, pending review; source inspection and unit tests): a
  rocket's segment is each tick's -- `FUN_003ca5a0` copies `+0x54` into `+0x48` (D:L320297-320299) and writes the
  stepped point to `+0x54` (the rocket's thrust branch, D:L320305-320342) -- so the 0xb9 branch (D:L454640-454646) tests
  the rocket's last position to its new one, every tick, until `+6` bit 4 is set: strictly under 100, inside the
  segment, `.ROCKET_BY` (`FUN_003d37b0`'s handle) at the nearest point, and the bit set whether or not the handle
  played (D:L454646, past the play). The class is the ID's category (`FUN_003d1e10` D:L454625, 0xb9: LAW HEAT 185,
  RPG 186; `weaponCategory`); a launched round (0xab) is neither a bullet class nor 0xb9 (D:L454627) and passes
  silently. The page: `GrenadeThrower.stepLive` tests another's (`remote`) copy each flying game frame against
  `GrenadeSource.listenerFeet` (`walk.feet()`, as the bullets'), marks it (`Live.rocketBy`) and tells `rocketPast`;
  `./matchThrow` asks `GameAudio.onRoundPast(.., true)`, none under a round screen (OBF-31). The page's own rocket is
  never tested (the `+4` bit 3 skip, D:L454627). Tests: `grenade.test.ts`, `matchThrow.test.ts` "LATER 645".
- **Not built** (§13): the other bodies' passing sounds (`PASSING_REMOTE_BODIES_READING`, the rockets' too); where the
  bullet's segment ends (`PASSING_SEGMENT_END_READING`).

### 5.1 Suppressed rifles: missing reports and the 9 m boundary (2026-11-02)

The reported M4A1 SD / 552SD audibility issue was investigated against `main` at `c15928e75`.
The distance-slot cutoff agrees with the **retail r0001** code. This closes the earlier **PLAUSIBLE** missing-name
statement above; it does not establish that a player's report of silence inside that distance is resolved.

**Revision scope:** MISSION OT.R97 makes r0004 authoritative where it differs. The r0004 plan's open **R4B-10a**
records a 552SD `Sound_Radius` override from 400 to 50 world units (squared 160000 to 2500), at native r4
initializer 0x3e6850, with audible and AI effects unverified. This investigation has not read the r0004 firing
and lookup paths in its native image and served decrypt; neither was available in the local handoff inspected.
The tests establish current-port behavior on retail data, not r0004 audio parity or that override's effect.

| Weapon | Close report | Medium / far | Sound script RANGE, world units |
|---|---|---|---|
| M4A1 SD | `.M4A1_SIL` | neither present | 20–200 |
| 552SD | `.SIG_552_SIL` | neither present | 85–1700 |

Read through the repository's readers from `RUN/ZWEAPON.ZAR/zweapon.rdr`,
`RUN/SOUNDRDR.ZAR/sounds.rdr` and every multiplayer map's `_fx.bnk` in `RUN/SOUNDS/BNKSTORE.ZAR`.
The ranges above agree on all 22 maps. The range is the sound's attenuation, applied **after** choosing a slot;
it does not make an absent medium or far report playable. `Sound_Radius` feeds the distinct AI hearing stimulus
(research 94 section C1.10); it does not choose the report in the **direct PCM paths traced here**. The broader
multiplayer stimulus-listener census remains untraced (`SOUND_RADIUS_MP_USE_READING`), and R4B-10a's audible
effect remains open.

The original missing-field chain, re-read from `socom2_game.elf.decomp.c`:

- `FUN_003cda30`, D:L322155–322157 and D:L322595–322609, supplies `NOT_FOUND` for each missing fire-sound field.
  `FUN_003d0140`, D:L323303–323322, copies the names independently. The weapon constructor
  `FUN_003d3c20`, D:L326252–326257, initializes the three handles and names to zero.
- `FUN_003c4700`, D:L316291–316301, resolves each name independently;
  `FUN_003d01c0`, D:L323329–323332, stores only that slot's handle. `FUN_00344f30` and
  `thunk_FUN_00344ee0`, D:L243180–243209, lead to `FUN_00344bf0`, whose unmatched-key paths return zero
  (D:L243038–243042, D:L243054–243060, D:L243088–243094). No `sounds.rdr` set contains the
  `NOT_FOUND` hash, 1264485671. The test also checks the loaded `MP_COMMON` and `HOSTAGE` group-name hashes,
  since groups enter the same original lookup table. No fallback copies the close handle into the other slots.
- The main weapon path `FUN_003d2d70`, D:L325671–325696, and the additional projectile path
  `FUN_003d2c50`, D:L325524–325535, both choose close at distance squared **at most 90² units**, medium
  above 90² through 500², and far above 500²; a null selected handle plays nothing.
  The thresholds are the table's 9 / 50 metres at ten world units per metre, as traced above.

**Evidence and limits.** An independent source reviewer re-read that chain. A local disc audit of all 22 maps
rendered both reports at 0, 2, 5, 8.9 and 9 m, and neither at 9.01, 15, 20 or 51 m, with no unknown sound names.
The M4A1 SD's rendered level falls between 2 and 5 m; the 552SD's is equal at 0, 2 and 5 m (the renders go no
further between 5 and 8.9 m), consistent with their distinct script ranges -- the 552SD's range minimum, 85 units
(8.5 m), is the script's value, not a render. These are decoded/rendered PCM observations, not listening tests,
browser activation checks, two-client network tests or a PS2 capture comparison. The source conclusion is a **reading**, not runtime parity
proven against the console, and the code inspected is r0001. `viewer/test/suppressedWeaponAudioDisc.test.ts` holds the disc names, lookup absence,
distinct attenuation and boundary for all maps; it skips without the local disc. The earlier `audio.test.ts`
comment calling the lookup plausible is superseded by this source chain.

No firing radius or volume was changed. A report of silence inside 9 m still needs the shooter's/listener's
perspective, map and approximate distance to reproduce through the full multiplayer/browser path.

## 6. The jump and the landing

- **The jump.** `motion.rdr`: `seal_jump` `BlendTime 0.32 NoInterrupt 0.7 playback 1.1 zanim_callback (name
  (jump_whoosh) time (0.4))`; `seal_runningjump_launch` and the climbs carry `jump_whoosh` at 0.1-0.5. A callback runs
  the zAnim of its name from the map's `CZANIM.ZAR` (`common` set): `jump_whoosh`'s name table is `NA, jump_whoosh,
  dummy_node, .JUMP_WHOOSH, spinehi` and its one command is set 0 command 30 (32 bytes, the play-sound command) whose
  `u16` at +6 is 3 -- `.JUMP_WHOOSH` -- and +16 names the node (`spinehi`) it sounds at. The command's layout
  (`FUN_002659c0`, decomp 112319-112470): flags `u16` +4, the sound's name index `u16` +6, **the volume f32 at +8 under
  flag 0x10** (else 1.0), the pan `u16` +0xc under 0x20, the pitch bend `s16` +0xe under 0x40, the node byte +16, the
  offset f32 triple at +0x14 under flag 4; flag 0x80 is a new play -- else the command only retunes the voice already
  playing (volume, pan, pitch, place; 112365-112390) and starts none; 0x400 / 0x800 hand the sound to `FUN_00348dc0`
  at priority 1 / 3 (112460, 112480-112486), the game's one-voice priority slot: it plays the sound unplaced through
  the bank's +0x1c play when the slot is free (decomp 245406, 245416), a higher priority first fades the voice there
  (245386-245398), and a taken slot keeps the sound pending, the highest priority kept (245424-245444); 0x100 fades or
  stops the voice (112489). The decoder carries a placed new play as `newPlay` (`scene/src/effects.ts`
  `SOUND_NEW_PLAY`) and the effects and doors start only those (review 2, n-6): the retune's drop is the game's, the
  slot's is the viewer's (`SOUND_PRIORITY_SLOT_READING`, §13; review 3, D1) -- the slot itself is modelled for the
  round's streamed cues only (`GameAudio.playMusic`, research 124 §7). The volume goes to the play (112460-112461) and
  `FUN_00342670` makes the app volume `volume x RANGE gain x 1024` (241912-241955), which 989snd takes into the voice as
  `(app x orig) >> 10` clamped at 127 (`iop/blocksnd.c` 129-133, 448-450): Desert Glory's mission `inside_noise` loops
  at 0.6, its `flame_in_rubble1` fire (`~FIRE_SM`, flags 0x292) at 3.0, `flashcrash_grenade`'s `.MARK_141_FLASH` at
  2.0, `shotgun_hit_dirt` at 5.0, Frostfire's `wind_inside` gusts at 0.6. The viewer honours it on the callbacks, the
  beds, the emitters and the gusts (`commandVolume`, `GameAudio.play`'s volume); pan and pitch bend are not applied
  (§12). All 73 such commands of MP6's
  archive index a sound name; of its 67 animations with one, 65 play one sound (`ladder_rung .STEP_LADDER`, `shotgun_pump .SHOTGUN_COCK`,
  `dive_prone .JUMP_TO_PRONE`, `land_sound .FALL_STONE`, the grenades' material hits ...), `law_impact` and
  `RPG_impact` two (`.EXP_1`, `.GREN_FAR`).
- **The landing** (`FUN_005ac1f0`, decomp 464866-464960), called with the contact speed (from `+0x1364` and its
  callers at decomp 466656-466937): the material under the actor (`FUN_002dc1d0(+0x400)`), its `LANDSOUND`; the
  class against `DAT_0044c280/284/288` -- the seal table's `+0x30..+0x38`, reCOM's `m_landSpeed[i] = g sqrt(2
  fallDist[i] / g)` = `sqrt(2 g d)` over `FALLING_DAMAGE_LIGHT/HEAVY/DEATH` (62, 91, 120 units at g 235: 170.7,
  206.8, 237.5 units a second). At or under the light speed: the `LANDSOUND`; to the heavy: the `LANDSOUND`; to the
  deadly: `.BONE_BRK_1` alone; at or over it: both. So a soft landing on stone is `.STONE_JUMP`, a hard one
  `.BONE_BRK_1`. **No landing grunt in the landing code**: `FUN_00578150(0.33 / 0.66)` adds to a float at `+0xeb0`
  capped at 1 (a meter, not a sound). Above the light speed the landing deals damage -- `(speed - light) / (deadly -
  light)` off each of the six body parts' health (`+0xffc`) -- and runs the damage reaction (`FUN_005a54d0`); the hurt
  SEAL's voice is his character's `CHRSND_DAMAGE` (`character.rdr`, `mp_seal1 : mp_seal (sounds (CHRSND_DAMAGE
  (.SEAL_DAMAGE) ...))`). The viewer plays `.SEAL_DAMAGE` with a landing that hurts [reading: the voice's call inside the
  reaction was not traced].

## 7. The surface a polygon is, and the map's `DefaultMaterial`

`FUN_002dc1d0` (decomp 181xxx, the accessor every material read goes through) returns the polygon's material byte
(surface word bits 10-17) -- or, for 0, `DAT_0044f310`: the map's `DefaultMaterial`, the SOILS name on its world root
(`<map>.ZED`; `mp8.rdr` repeats it: `DefaultMaterial (DIRT)`). Byte 0 is common: Crossroads' streets (810 of its floor
polygons), Frostfire's rig (197). Two maps name a default no SOILS entry is spelt as: MP11 `none`, MP64
`stone` (read as `STONE`). The map's load (decomp 152109) sets the default to `FUN_002de9e0` of the name, a lookup in
the SOILS names' table that answers **0** -- `UNKNOWN`, no sounds -- for a name it lacks, so Death Trap's default is
`UNKNOWN`; no floor of Death Trap has byte 0 (0 of 2,252), so nothing is silenced by it. The viewer does the same
(`defaultMaterialIndex`) and no longer lists it as missing (research 90 item 26).

**What each map's banks lack.** A map's `_am` bank holds the material sounds its designers expected; the floors ask for
more. Across the 22 maps the gaps are Rat's Nest's `DIRT` (its `DefaultMaterial`, 85% of its floors; `MP8_am` has no
`.STEP_DIRT`), Crossroads' `SAND`/`THATCH`/`DIRT`, the tin (`METAL_THIN`: `.STEP_TIN`) on seven maps, the metal and
carpet steps on others, and many grenade bounces (`grenade_hit_metal_thick` plays `.GREN_METAL`, which `MP2_am` lacks;
no `grenade_hit_asphalt` zAnim exists at all). The console resolves a name only among the loaded banks
(`FUN_00344f30`), so there the sound is presumably silent -- not established by a capture. The viewer lends the
missing names from another map's bank that holds them (the same recording: §8, `borrowMissing`, a PLACEHOLDER).

**Names the disc holds nowhere**: the casings' `shell_eject` zAnims (CZANIM) name the metal casing `.BUL_CASE_METAL`
where every bank spells it `.BUL_CAS_METAL` (and `.SG_SHELL_TIN`, `.SG_SHELL_SAND` exist in no bank): a spelling slip
in the game's data, so a casing on metal is silent on the console too. `grenade_hit_asphalt` has no play-sound command:
its CALL_ANIMATION (45, the name at +7, `FUN_0025d550`) names `.GREN_ASPHALT` -- no animation and no bank of the disc is
called that, so it is silent too. The viewer mends both (`SOUND_NAME_FIXES`, one table the effects share):
`.BUL_CASE_METAL` plays `.BUL_CAS_METAL`, `.GREN_ASPHALT` the stone's `.GREN_STONE` (asphalt steps like stone in
SOILS) -- departures from the retail game, named. With the lending, every `grenade_hit_<surface>` of a surface a map has
sounds: 200 of 200 over the 22 maps.

**A death voice the disc holds nowhere** (2026-10-05; a reading, not captured). On the six Algerian-cast maps -- MP6,
MP7, MP8, MP71, MP72 (Crossroads), MP73 -- `chartype.rdr`'s third terrorist (`mp6_terror3` ...) is `mp_terror3_alg`,
whose `sounds` give `CHRSND_DEATH .DEATH`; every other team character of the 22 maps names `.SEAL_DEATH`,
`.ENEMY_DEATH` or `.FEMALE_DEATH`, which each map's own `_vc` bank holds (MP2 Frostfire's third terrorist is
`mp_terror3_rus`: `.ENEMY_DEATH`). No bank of the 115 holds `.DEATH`, and `sounds.rdr` files its CRC-32 (1515529574)
in none of its 128 `SETS` blocks and no stream entry, nor names it in `GROUPS`. After the map's banks and blocks load
(`FUN_00344450`, D:L152105; `FUN_00344910`, D:L152106), `FUN_0053c200` (D:L152173, and D:L151863 on the other
load path, `FUN_002abd40`; D:L405734-405784) makes each character slot's handle `FUN_00344f30(name)` -- 0 for a name
nothing files -- then gives a null `CHRSND_DAMAGE` (slot 0x3b, `+0x254`) `MALE_DAMAGE` and a null `CHRSND_DEATH`
(0x3c, `+0x258`) `DEATH_SOUNDS` (ELF 0x65b378, 0x65b388): a fallback chain, but neither name is filed anywhere on the
disc either. So the console plays nothing for that terrorist's death (`FUN_0053b710`'s null handle,
D:L405264-405266); his hurt voice is `.ENEMY_DAMAGE` like the others'. The viewer resolves the voices the same way,
against the map's own blocks and groups only (`soundData.ts` `characterVoicesOf`, `CHARACTER_SLOT_FALLBACKS`,
`scriptFiles`, `MP_SOUND_GROUPS`): his `death` is null, nothing is borrowed for it and nothing is reported missing
(the port had asked the banks for `.DEATH` and listed `<map>: no bank holds .DEATH` on those six maps). Not mended: a
`SOUND_NAME_FIXES` row `.DEATH` -> `.ENEMY_DEATH` would be a departure, the owner's call (HUMAN_TASKS H106). Pinned by
`viewer/test/deathVoice.test.ts` (MP6 and MP72 from the fixtures; the 22 maps' slot counts from the disc, `.DEATH` 6).

## 8. The viewer

- **`@s2u/sound`**: `decodeVag`, `parseBankFile` (the head, block, sounds, grains, tones, names, VAG), `renderSound`
  (the grain sequencer at 240 Hz -- TONE, RAND_PLAY, PLAY_CYCLE, RAND_PB/PB/ADD_PB, RAND_DELAY, the loops, markers,
  registers, children, KEY_OFF/KILL -- voices at `note2Pitch`'s pitch under the psx-spx ADSR, linear interpolation,
  `MakeVolume` with the play pan, the square law, the SPU's half scale, 48 kHz), `parseSoundScript`/`soundHash`,
  `parseSoils`, `weaponSounds`, `callbackSounds`, and the rules above as functions (`FootfallClock`,
  `footstepSound`, `landingClass`/`landingSounds`, `rangeGain`, `panDegrees`). A transliteration of the repository's
  mixer: LFO, XREF and plugin grains are not modelled (none of the walk's sounds carries one) and the global
  registers read 0.
- **The page**: the worker reads the map's three banks and `HUDUI.bnk` (§1, `SOUND_GLOBAL_BANKS`) from `BNKSTORE.ZAR` by range (the head, 3,268 B of key tree,
  the three members: Frostfire's 1.85 MB, beside the 1.9 MB script) -- the served tree over HTTP `Range`, or the player's ISO
  (MP6: 21 reads, 4.1 MB, 66 ms) -- and `GameAudio` renders a sound when it starts, with the play volume and pan
  `FUN_00342670` would give it from the camera, into a stereo buffer for one `AudioBufferSourceNode`. No
  `PannerNode`: its equal-power law and roll-off are not 989snd's. The `AudioContext` is made suspended at page start
  and the first click or key the browser counts as a user activation resumes it; `unlocked` means the context runs
  (a touch `pointerdown` or an Escape leaves the resume pending until the lift or the next key), plays before that are
  counted as locked, and a refused resume is warned once and kept in `stats().resumeError`.
- **The events** (`GameAudio`): `onFootstep(material, position, {stance, stick})`, `onFire(weapon, position)`,
  `onReload(weapon, position)`, `onJump(position)` (the `jump_whoosh` callback now), `onLand(speed | class,
  material, position)`, `onAnimCallback(name, position)`, `play(name, position)`; `setVolume`, `setMuted`; `stats()`
  as `window.__viewer.audio()`. `walkSounds.ts` drives them from the walk today: the cycle clip's `frame / frames`
  as the phase, the mover's speed and the stick's forward axis for the moving test, the stick's larger axis for the
  step/stealth choice, the drawn feet for the position (not the foot bones), the probe's floor under the feet for the
  material, the jump count, the landing speed, the fire count, the reload flag.
- **Placeholders**: `LISTENING_GAIN_PLACEHOLDER` (x4, +12 dB on the whole mix: the console's effects peak at -30 to
  -20 dBFS, a television's knob did the rest); `DEFAULT_RANGE_PLACEHOLDER` (30-200, for a sound `sounds.rdr` does not
  list; retired 2026-10-04 for the object's own 160-430, research 186 §3.2); `MAX_RENDER_SECONDS_PLACEHOLDER` (4 s, a looping voice nothing keys off); `LOOP_SECONDS_PLACEHOLDER` /
  `LOOP_FADE_SECONDS_PLACEHOLDER` (12 s + 1 s, the ambience loops); `BED_FADE_SECONDS_PLACEHOLDER` (0.5 s; retired 2026-10-04: no fade, the tone's release);
  **`borrowMissing`**: a step, stealth, crawl or landing sound of a material the map's floors use, a grenade bounce or
  round impact on a surface the map has, an explosion or a casing, that the map's banks lack, lent by the same name from
  the bank of another map that has it (found through `sounds.rdr`: a set is a bank's block) -- 1 or 2 borrowed banks a
  map, every floor of the 22 now sounding. The footprint decals are not traced; the remote fire variants' chooser is (§5).
  A bank that will not parse is named in `missing` and the rest of the map's sound still comes (`soundFromDisc` and
  `renderAmbienceLoops` read bank by bank; soundData.test.ts).
- **The unlock costs nothing** (measured on the dev server, headless Chromium): the first key press used to spend 949 ms
  (Desert Glory), 451 ms (Sandstorm), 133 ms (Frostfire) in the audio unlock -- about 300 ms of it the page's first
  `AudioContext` (the browser's audio service), the rest the reverb's response and the loops' buffers. Now the context
  is made suspended when the map's sound data arrives, the response is computed in the worker, and the convolver
  (~11 ms, the browser's partitioning) and the loops' buffers (a channel a job, shared by a sound's emitters) are built
  from a queue run 4 ms a frame (`PUMP_BUDGET_MS`) before any gesture; the key press only resumes the context: 0.4-0.7 ms
  for the whole event, 0.1 ms in the handler (`stats().timing`). The release sweep (research 90 item 27) then saw
  9-69 ms (887 ms once) on a click that landed before the map's sound data, which made the context itself: the context
  is now made on the task after the page wires `unlockOn` (a `setTimeout 0`, whether or not a map comes), so every
  click only resumes it. Re-measuring is `tools/audio-unlock.ts` (owed: the host's lock).
- **A sample is decoded once, and the map's blasts and reports at the load** (LATER 730, 2026-11-07; product track, a
  browser adaptation: the same sounds at the same times). A bank's samples were already decoded once each (`SampleCache`,
  at a sample's first use); the cost found was the decode's array, sized to the rest of the bank and kept with the sample
  (the flash's three samples held 4.0 MB for 0.21 MB of PCM; MP2's whole set decoded in 218-362 ms): `decodeVag` now
  sizes it to the sample's end block (72-74 ms, the same values). The decoded PCM sits on one budget a map
  (`SampleBudget`, `SOUND_DECODE_CACHE_BYTES_ADAPTATION` 32 MiB, above every map measured, the least recently used let
  go past it), and the map's grenade callbacks, every weapon's three reports and `.RINGING_EARS` are decoded at the load
  (`soundWarmSet`, `SOUND_DECODE_WARM_ADAPTATION`, a sound a step of the 4 ms `pump`) and held. A play that still has to
  decode sounds in its own call, as before, and is counted (`stats().decode.cold`, the performance line's `sound` part).
  What a play still costs is its render (the grain sequencer and the voices' mix at the play's volume and pan, measured
  in node at about 4 ms for the flash, 6 ms for `.GREN_MED`, 2.3 ms for `.M16A2`) and the buffer's copy; both stay in the
  play's frame, since a render elsewhere would sound a frame later.
- **The stats** (`window.__viewer.audio()`): the banks (the borrowed marked), the map's `defaultMaterial`, the reverb
  (loaded, inside, zone, depth), the ambience (the beds, which is up, the emitters and their gains), the dropped plays
  by reason (locked, range, unknown, muted, silent -- a surface or zAnim that names no sound) and `unknownNames`;
  `missing` names what could not be read -- a tree without the sound archives says `RUN/SOUNDS/BNKSTORE.ZAR: ...`, and
  the page logs one warning.
- **The events** added this round: `onRoundPast(from, to, actor, rocket?)` (another shooter's round), `setEnvironment
  (inside, zone)` and `setAmbience(on)` (fed by `walkSounds.frame(camera)`), `setLoops` (the worker's loops).

## 9. The reverb

- **The mode.** `snd_SetReverbType(2, 3)` (`FUN_0033f2a0`, 989snd call 0x0e; decomp 55186, 243346, 243386): core 1,
  libsd mode 3, `SD_REV_MODE_STUDIO_B`. libsd's presets are in `LIBSD.IRX`'s data: nine 0x44-byte blocks of the 32 SPU
  reverb registers (Room first, `dAPF1 0x7D, dAPF2 0x5B`; mode 3 `0xB1, 0x7F`, the PS1 "Studio Medium"), the work
  areas' sizes before them (Studio B 0x908 x 8 bytes). `findReverbPresets` finds them by their shape.
- **Which voices.** SOCOM's `989SND.IRX` sets a voice's effect sends (`SD_S_VMIXEL`/`VMIXER`, 0x1900/0x1b00) from its
  tone's flags **bit 0** (decomp 14339-14345: `DAT_0001cf1c`) and clears its dry mix (`VMIXL`/`VMIXR`) for bit 4
  (14189-14203) -- not the v3.01 reference's bit 1. 200 of `MP2_am`'s 281 tones send (the steps among them).
- **The depth** (`FUN_00341a60`, decomp 241509-241560, each frame): the camera probes the floor under it (`FUN_00295b00`,
  decomp 140035-140058; the pick `FUN_002d4c20`, the highest hit at or below the camera, none written with no hit --
  the viewer's `floorPick.ts` `cameraFloor`, the one probe `CAMERA_INDOORS` (66) answers too, research 89 §21) and keeps
  the hit polygon's `m_inside` (bit 23, `FUN_002dc180`) and a zone bit (27, `FUN_002dc150`); on a change, `snd_AutoReverb(2, depth x 32767, seconds x 240, 3)` (989snd call 0x10) to the
  `IndoorReverb` or `OutdoorReverb` entry of that zone (`FUN_003416b0`/`FUN_00341500` read them from `mission.rdr`:
  `Depth`, `Seconds`), or to 0 over 0xf0 ticks (1 s) when the list has none. Frostfire: indoors 0.45 (the first of two
  `IndoorReverb` keys; the later says 0.3) and 0.2, outdoors 0.07 and 0.2, each over 1 s; the outdoor depths run 0 (Sujo)
  to 0.2 (Chain Reaction). The zone bit is 0 on every floor of the maps looked at, so entry 0 is the one heard.
- **In the viewer**: the preset's reverb (psx-spx's formula, as PCSX2's SPU2 runs it: at 24 kHz, both sides a tick)
  run once on an impulse into each input -- Studio B rings about a second, -20 dB each 0.2 s, 37 ms before the first
  reflection -- a four-channel `ConvolverNode` on a bus the flagged voices' send pair feeds, its output gain (the SPU's
  `EVOL`) ramped linearly to the depth.

## 10. The ambience

The scripts play it (`CZANIM.ZAR`'s `common` set and the map's `MZANIM.ZAR` `mission` set).

**Which set a name is.** A start names its animation bare, and the game resolves a bare name (`FUN_0026a250`, decomp
115001-115072, reached from `CALL_ANIMATION` through `FUN_0026e650`, 117599) in the registry's **current** set first --
`DAT_00414be4`, written only by the set start `FUN_0026c600` (116314-116330); both start sites (75858-75866,
149735-149741) start `common` then `mission`, so the current set is the mission's -- then in every other set in load
order; within a set the first animation of the name (`FUN_0026c8f0`). So where both sets carry a name, the mission's
wins (`resolveZAnims`). That matters: the mission's first `inside_noise` plays `~OUTDOOR_AMB` (flags 0x290) at 0.6 on
MP6 (Desert Glory), MP7, MP8, MP9 and MP12 and at 0.5 on MP5, and on MP10 (Blood Lake) `SND_OUTDOOR_AMBIENCE_LOOP`, a
name no bank holds -- silent; the common set's plays `~INDOOR_AMB` (0x280)
on all 22. The viewer played the common one everywhere until 2026-09-29 (pinned now: audio.test.ts "resolves Desert
Glory's indoor bed in the mission set").

**The command numbers the scripts use** (set 0): the list opens with `Reserved` (`FUN_0026ac20`, string 0x3ed270), then
`FUN_0025bc20`'s base commands in order (decomp 106862-106925: IF 2, ELSEIF 3, ELSE 4, ENDIF 5, LOOP 14, WAIT 15,
SOUND 30, WHILE 39, END_WHILE 40, EXPRESSION 43, CALL_ANIMATION 45, STOP_ANIMATION 46 ...), then the game's own in
`FUN_002ad290`'s callees' order (152552-152556: `FUN_0059ac60` 59-60, `FUN_00354470` 61-63, `FUN_00293890`
64-69, `FUN_0029bc20` 70-71, `FUN_002b3930` 72; after `FUN_0026b1a0` (152550) runs `FUN_0025bc20` at 115649): `VALVE` 61 ... **`CAMERA_INDOORS` 66**, **`PLAYER_INDOORS` 72**. `CAMERA_INDOORS`'s
tick (0x2936b0, read off the ELF) answers the byte the camera's floor probe writes from the polygon's `m_inside`
(`FUN_002dc180`, 140054) -- the reverb's own test (241521); `PLAYER_INDOORS`'s (0x2b3880) bit 2 of the player's byte
`+0x1060`. An `IF`'s expression follows its 8-byte head (`02 00 32 00 01 00 00 00 | 48 00 12 00`); the `ELSEIF` carries
`EXPRESSION` 43 with operand 1, `!` (reCOM's `IsOperator` order; the objectives' `VALVE` tests join with operand 2, `&&`).

- **The beds.** The common `check_camera_inside_state1` (activation 1: it starts with the mission) loops on
  `PLAYER_INDOORS`: stop `outside_noise`, start `inside_noise` (command 46, the stop, names its animation at +4; 45, the
  start, at +7), and the reverse. `outside_noise` plays `~OUTDOOR_AMB`, `inside_noise` `~INDOOR_AMB` (or the mission's,
  above), without a place (flags 0x280, or 0x290 with a volume). `~OUTDOOR_AMB` (MP2) is two tones panned 270/90 and two
  child sounds under an LFO.
- **The camera-state layers** (`ambienceLayers`, walked out of the scripts rather than two literal names, 2026-09-29):
  every activation-1 script is read in command order; its starts inside an `IF`/`ELSEIF` on `CAMERA_INDOORS` or
  `PLAYER_INDOORS` (or its `!`) belong to that side, a start outside any branch to both, and the `WAIT`s ahead of its
  first test are its delay. Each started animation's placeless play-sound commands (no node, no offset) are the side's
  layers, each at its command volume: a `~` sound its sequence starts once is a bed (`loop`); a sound its sequence
  replays -- `SOUND`, `WAIT`, `LOOP` -1 (`FUN_0025ede0`: -1 never ends) -- is a `repeat` every `base + range x U[0,1)`
  seconds (the `WAIT`'s random form, `FUN_0025ed50`: flag 0x20 takes the pair at +12/+16, +16/+20 with 0x10). Three
  maps have a second script: **Frostfire** (MP2) `check_camera_inside_state` starts `snd_wind_outside` (no animation of
  that name on MP2 -- a name copied from MP1's script, silent as on the console), waits 8 s, then on `CAMERA_INDOORS` starts
  `wind_inside` and stops `wind_outside`, or the reverse; each plays `SND_OUTDOOR_WIND_GUST_LOOP` (in no bank: silent)
  and replays `.OUTDR_WND_GST2` every 5-20 s and `.OUTDR_WND_GST3` every 2-16 s, at 1.0 outdoors and 0.6 indoors
  (`MP2_am` holds both). **MP1**'s script starts `snd_wind_outside` / `snd_wind_inside`: `~OUTDOOR_AMB` at 1.0 out and
  0.6 in, beside the common beds. Pinned: sound.test.ts "walks the camera-state scripts" (a synthetic copy of MP2's
  bytes) and audio.test.ts "walks Frostfire's camera-state scripts" (the fixture, and the gusts played on a clock).
- **The emitters.** Every self-starting animation (activation 1) whose play-sound command loops a `~` sound at a node
  (flags 0x82/0x282, the node byte at +16, `0xf9` the animation's root node): Frostfire's `~FAN_ROTATE` at `fan1`,
  Desert Glory's insects at its lights and fires in a barrel and the rubble, the waterfalls and rivers of Abandoned,
  Foxhunt and Shadow Falls, dogs, chimes, lapping water, radios, humming equipment, the helicopters (their SoftImage
  path not followed: heard at the node's rest), crickets (whose conductors wait on a global register the game sets, so
  no voice starts in the first seconds). 0 to 18 a map.
- **An emitter's place** (the SOUND command's tick, `FUN_002659c0`, decomp 112317): the place starts at 0, flag 4 adds
  the command's f32 triple at +0x14 (`FUN_00309240`), and flag 2 carries it through the node's matrices to the world
  (`FUN_00310980`) only when the node resolves (`FUN_0026f4e0`, by exact name over the world and the objects,
  `FUN_00269230`); with no node and no offset the sound plays without a place. Three emitters carry an offset: Foxhunt's
  `waterfall1_sprays` (0, at `spray4`), Crossroads' `water_drain` ((0, -60, 30) below `waterpipe`) and Vigilance's
  `water_drain`, a copy of Crossroads' naming a node `pipe` that no model of Vigilance has (no ZED or rdr of MP51 names
  it). The game therefore sounds Vigilance's `~WATER_LEAK` at the bare world point (0, -60, 30), 586 units from the
  nearest floor, past its `RANGE`: inaudible there, and the viewer places it the same (`emitterPosition`).
- **The crickets** set no game register: their conductor counts its burst of chirps in a local register (`SET_REGISTER
  _RAND 0..40`, `INC_REGISTER`, `TEST_REGISTER < 90`) and waits `RAND_DELAY` up to 4000 ticks (16.7 s) between bursts --
  longer than the 12 s loop, so it rendered silent. A loop with no voice in 12 s is rendered over 40 s at 24 kHz
  (`renderLoopAtLeastOneVoice`, `LONG_LOOP_SECONDS_PLACEHOLDER`).
- **Global register 2** is the one the game sets for the ambience: each frame `snd_SetSFXGlobalReg(2, x)` (989snd call
  0x67; `FUN_00341a60`, decomp 241580-241600) with `x = f x 255 - 128`, `f` the camera's height through the mission's
  `elevation (max min)` (`FUN_002aca30`: 0 below, 1 above, linear between). The outdoor beds of Foxhunt, Enowapi, Fish
  Hook, The Mixer (indoor) and Requiem test it (`TEST_REGISTER -2`) to pick their layers; Requiem's ice sounds read
  global 3, which nothing here sets. The viewer renders the beds once, with register 2 at spawn A's camera height
  (`BED_CAMERA_ABOVE_FEET_PLACEHOLDER`, 25 over the floor), not per frame.
- **In the viewer**: each loop (a bed layer, an emitter) rendered once in the worker at its command's volume
  (`loopKey`: one render per sound and volume) as a 12 s loop with a 1 s crossfade folded in
  (`LOOP_SECONDS_PLACEHOLDER`), played round; the beds cross as the camera's floor goes in and out -- the stopped side keyed off
  at its tone's release, the other up at once (2026-10-04, research 186 §3.2 / 205 §2.1; was a 0.5 s fade,
  `BED_FADE_SECONDS_PLACEHOLDER`, retired) -- and the side's `repeat`/`once` layers are armed afresh (their animation restarts: a gust at
  once, then after each wait), not before the script's delay; an emitter's two channel gains follow the camera each
  frame -- its `RANGE` fall-off, squared by 989snd's law, and the pan pair of its azimuth [reading: the console clamps
  `volume x gain x orig` at 127 inside the voice; a loop rendered at a volume over 1 and then scaled is a little louder
  at a distance than that].
- **In every view of a match** (AMB-1, 2026-11-07; the owner's report of v0.4.12, a player's: the ambience heard in one
  dead spectator view and not the other). `check_camera_inside_state1` and the emitters' animations are activation-1,
  started with the mission and looping through it (above), and no source read stops them on the local player's death
  or a change of view: so the beds, emitters and one-shot layers play alive, dead on the own body (the death camera),
  watching a teammate (DEAD-CYCLE), back on the own body, as a ghost, between a respawn room's death and respawn, and as
  a spectator, the side picked by that view's camera (`CAMERA_INDOORS`, §9's probe). The port had gated them on the
  walk's mode (`WalkSounds.frame`: `setAmbience(walking)`, from the map viewer's free-fly camera, 1fda855b17), so the
  teammate view -- the walk in fly mode -- stopped every loop and the return restarted them; removed (`viewer/src/
  walkSounds.ts`), the camera's pick taking the map's grid in any mode (`WalkMode.gridOfGround`). The test room's
  free-fly viewer outside a match keeps them off (`TESTROOM_FLY_AMBIENCE_ADAPTATION`, a browser adaptation). Reading,
  pending review; unit tests `viewer/test/walkSoundsAmbience.test.ts` and `ambienceViews.test.ts`. No capture of the
  original's audio while dead or spectating exists: the behaviour is the scripts' reading, unmeasured. What a
  `PLAYER_INDOORS` branch tests while the player is dead (bit 2 of `+0x1060` on a corpse) is not read -- the port's
  beds follow the camera alone (§9), as before this change: `DEAD_VIEW_BED_SIDE_READING` (§13).

## 11. Verification

`npm run dump-sounds -- MP2 <dir> .STEP_STONE ...` renders to WAV and prints each sound's length, peak and RMS. On
Frostfire, with a seeded random: `.STEP_STONE` 0.641 s, 1 voice, peak 0.027; `.STEALTH_STONE` 0.652 s, 0.012;
`.STONE_JUMP` 0.499 s, 0.076; `.JUMP_WHOOSH` 0.499 s, 0.008; `.BONE_BRK_1` 0.350 s, 0.113; `.M4A1_SIL` 0.168 s, 2
voices, 0.101; `.M4A1_SIL_RLD` 0.336 s, 0.065; `.M4A1` 1.111 s, 4 voices, 0.243. Not noise: the lag-1
autocorrelation is 0.97-0.998 on the steps (white noise is 0), the steps' and shots' envelopes peak in the first 20
ms and decay, the whoosh builds to 140 ms. Half the play volume gives a quarter of the level (the square law), a pan
of 90 nothing on the left. In the browser (Playwright, `e2e/audio.spec.ts`): on Frostfire a 2.5 s run played ten
`.STEP_METAL`, the jump `.JUMP_WHOOSH` then `.METAL_JUMP`, five rounds `.M4A1_SIL`, `R` `.M4A1_SIL_RLD`; on Desert
Glory `.STEP_SAND` and `.SAND_JUMP`; nothing dropped.

## 12. Open

- The clip position at `+0x1c` of the track (what the steps read) against the viewer's `frame / frames`: a cycle
  clip whose last key repeats its first would put the right foot a key early; the foot bones' positions (the viewer
  uses the drawn feet).
- `FALLSOUND` for the body, `.GUN_EMPTY` on a dry trigger, the music (`SMUS`, VPK streams), the LFO grain (the
  outdoor bed's shimmer), the global registers (the crickets' conductors; `snd_SetSFXGlobalReg(2, x)` every frame,
  `FUN_00341a60`, from the camera's height) -- all readable with what is here.
- The Gaussian interpolation (research/69 §4) and the SPU2's reverb down/up-sampling filters: the render interpolates
  linearly and the reverb response holds each 24 kHz tick for two output samples.
- Whether the console is silent where the viewer borrows (a capture on Rat's Nest would say).
- The beds' script tests `PLAYER_INDOORS` (the player's `+0x1060` bit 2), the wind's `CAMERA_INDOORS` (the camera's
  floor); the viewer drives both from the camera's floor (`setEnvironment`) [reading: they differ only while the
  camera and the SEAL stand on different sides of a door]. What sets the player's bit is not traced. The effect
  runner answers the two apart since INV-RAIN F3 (2026-11-07): 66 from the camera's floor, 72 from the floor under
  the player's feet (`PLAYER_INDOORS_FEET_READING`, research 89 §21). The camera's floor is one pick for the sound and
  the effects since 2026-11-07 (`floorPick.ts` `cameraFloor`, `FUN_002d4c20`; research 89 §21): the sound had the
  actor's (`probeFloor`, up to 6 over), so under a low roof it heard outdoors while 66 answered indoors.
- A camera script's delay is applied to its one-shots only; its loops (MP1's `~OUTDOOR_AMB` at 1.0) start with
  the ambience. Two scripts starting the same bed at the same volume are one loop here (the console has two voices).
- Activation-1 scripts that start animations on other tests (the objectives' `VALVE`s, `RANDOM_WEIGHT` in Desert
  Glory's `mp6_battlesounds`, the lightning of MP52 and MP61) are not walked; nor are the zAnim sound commands' pan (flag 0x20) and
  pitch bend (0x40). The effects' own zAnim `SOUND` op (`@s2u/scene`'s `effects.ts`) reads the command volume (flag
  0x10's f32 at +8, else 1.0) and the viewer's effect runs play at it (`viewer/test/effects.test.ts`); the doors'
  runs play at the command volume too (`viewer/src/doors.ts` passes `op.volume` to `DoorHooks.sound`, 1eecd050; pinned
  by `viewer/test/doors.test.ts`, "a door's SOUND plays at the command's own volume").

## 13. Placeholders, by name

The values no source gives, and the one reading, named in the code (each is described where it is used: §6, §8, §10).

| name | value | stands for |
|---|---|---|
| `LISTENING_GAIN_PLACEHOLDER` (`viewer/src/audio.ts`) | x4 (+12 dB) on the whole mix | the television's volume knob: the console's effects peak at -30 to -20 dBFS (§8) |
| `DEFAULT_RANGE_PLACEHOLDER` (`audio.ts`) (retired) | was 30-200; now 160-430 | the range of a sound `sounds.rdr` does not list (§8). Retired 2026-10-04 (PF-08): the sound object's constructor default, `FUN_00345620` D:L243411-243425 (0xa0 / 0x1ae; research 186 §3.2, V4 #25); `audio.ts` takes `@s2u/sound`'s `SOUND_DEFAULT_RANGE` -- retired |
| `BED_FADE_SECONDS_PLACEHOLDER` (`audio.ts`) (retired) | was 0.5 s; now no fade | the fade between the indoor and outdoor beds (§10). Retired 2026-10-04 (PF-08): every MP bed command carries fade offset 0 (research 186 §3.2, 339 commands) and a new slot record's +4 is -0.1 (`FUN_0026e7c0`, 0x26e86c-0x26e878; research 205 §2.1, a reading pending review -- C7's "+4 = 0" was a belief, R2-AV read the value), so the stop is StopSound: a key-off heard as the tone's ADSR release (`soundRelease`); the side coming up starts at once -- retired |
| `RELEASE_LIMIT_SECONDS_PLACEHOLDER` (`sound/src/render.ts`) | 1 s | the longest release `toneRelease` follows before it cuts to 0: a guard for an envelope that would run on (an exponential step rounding to 0), as the render lets a one-shot's release run 1 s past its guard |
| `RELEASE_MIX_READING` (`sound/src/render.ts`) | the mean of the tones' curves | a stopped sound of several tones heard as one gain on its rendered mix: the mean of its tones' release curves, as long as the slowest; the console releases each voice at its own rate and level, which a mixed buffer no longer holds. Settles it: rendering the release per voice (a capture of a bed's stop to compare) |
| `MAX_RENDER_SECONDS_PLACEHOLDER` (`sound/src/render.ts`) | 4 s | the render's cap for a looping voice nothing keys off (§8) |
| `LOOP_SECONDS_PLACEHOLDER` / `LOOP_FADE_SECONDS_PLACEHOLDER` (`viewer/src/loopLength.ts`) | 12 s + 1 s | the length and crossfade of a rendered ambience loop (§8, §10) |
| `LONG_LOOP_SECONDS_PLACEHOLDER` (`loopLength.ts`) | 40 s | a loop with no voice in 12 s (the crickets' conductor waits up to 16.7 s, §10) |
| `BED_CAMERA_ABOVE_FEET_PLACEHOLDER` (`viewer/src/soundData.ts`) | 25 | the camera's height over spawn A's floor that sets global register 2 for the beds' loops, rendered once in the worker, not per frame (§10). Narrowed 2026-10-04 (PF-09): the game sends register 2 every frame from the listener's live world y (`FUN_00341a60`, floored; research 186 §3.2), and every sound `GameAudio.play` renders now takes it from the listener's height; only the loops, rendered once, still stand at spawn A + 25 -- re-rendering them as the register changes is owed |
| `SOUND_PRIORITY_SLOT_READING` (`scene/src/effects.ts`) | flags 0x400 / 0x800 dropped | the game's one-voice priority slot (`FUN_00348dc0`, decomp 245376-245446), read in research 124 §7 and modelled for the round's streamed cues only (`GameAudio.playMusic`: the objectives scripts' 0x880 plays): the effects and doors still start no voice for those commands; the mask is the source's (112480-112486), the drop the reading -- the slot's MP cues (MUS_*) are streamed music the banks do not hold, played from VAGSTORE by research 124's path (§6; research 91's data table) |
| `ROUND_SCREENS_SILENCE_WALK_READING` (`viewer/src/matchSound.ts`) | `'screens'`: none of the page's own footfalls, clip callbacks, landings or ladder slide (its loop let go, its landing), nor the others' footfalls, while a round screen is up (`NetPage.screenUp`) | OBF-7, 2026-10-30; reading, pending review. Online, on the host's +0x113 at 4 or 6 -- after its 3.0 s wait, the page's `ENGINE_READ_S` -- a client's mission tick `FUN_002aa490` calls the mission's end `FUN_002aa910` (D:L151127-151131), whose `FUN_00346b30` (D:L151220) sends `SL_STOPALLSOUNDS` (`FUN_00340270`, D:L244182; research 122), and pushes `MPExitState` over CoreState (`FUN_002cf380` D:L151134; research 115 §8.2); `FUN_002ce9e0` ticks only the stack's top (D:L171877-171888), so the round -- the local SEAL's walk, the others' bodies and their footfalls (§4) -- is not ticked under ROUND COMPLETE, FINAL ROUND and GAME COMPLETE -- `MPExitState`'s Tick is `FUN_00223680` (D:L75899-75958; its vtable 0x405780, stored by `FUN_00224110` D:L76192, holds 0x223680 at +0x14, read off the ELF), which ticks its menu, not the world -- until the next round's restart pops it (D:L75935-75936). A live (re)join's welcome clears the page's screens unless its join envelope carries a standing result (OBF-7's review). During the engine's 3 s every footfall is heard. Open beside it, LATER 580: the original stops the walk itself, which the page does not, and stops what sounds at the screens' start. Settled by a capture of a round's end with the local SEAL and another moving; `viewer/test/roundScreenFootsteps.test.ts` |
| `PASSING_REMOTE_BODIES_READING` (*note only*) | the page tests another's round against its own player's feet only, and only while it walks (`walk.feet()`) | LATER 644, 2026-11-02; reading, pending review. `FUN_00598000` is also `CRemoteCtrl`'s slot +0x44 (§5, "Re-read and wired"), so the original plays `.BUL_PASSING` at a round's nearest point to every other human player's body on the console too, heard from the camera by the sound's `RANGE`; and whether the shooter's own body on another console hears its round (its muzzle within 20 of its feet) turns on the caller that hands each controller the projectile, not found (no direct slot +0x44 call with a projectile in the decompilation). A dead player's controller (the page asks nothing out of the walk) is unread too. Settled by the caller's read, then a two-console capture of a round past a third player |
| `PASSING_SEGMENT_END_READING` (*note only*) | the page tests another's bullet on `from` -> `tracerTo ?? to`: to the end of its walk past the first body (the room's `shot.end`, P12b), else `to` | LATER 644's review F3, 2026-11-02; reading, pending review. A bullet's `+0x54` is set once, at the full ray, `+0x48` + the direction x `Maximum_Range` x 1.1 (`FUN_003ca5a0` D:L320383-320398); whether it is cut back to the first surface or body the round stops at before `FUN_00598000` runs is unread. Cut: today's path (a round stopped by a wall passes no one behind it). Not cut: the whole ray of `Maximum_Range` x 1.1, so a round stopped by a wall still passes a player behind the wall. Settled by reading where the walk (`FUN_003c9b70`, `FUN_003c8920`) writes `+0x54`, or a capture of a round into a wall with a player close behind it. (Was `PASSING_TICK_SEGMENTS_READING`, "the original tests each tick's segment": a bullet has one segment, and the rocket plays once.) |
| `DEAD_VIEW_BED_SIDE_READING` (`viewer/src/walkSounds.ts`) | `'camera'`: off the own living body (dead watching a teammate, a ghost, a spectator) the bed's side is the active camera's (`CAMERA_INDOORS`'s pick, §9) | AMB-1, 2026-11-07 (the review's F1); reading, pending review. The common `check_camera_inside_state1` swaps on `PLAYER_INDOORS` (bit 2 of the local player's `+0x1060`, §10); what it answers for a dead player, a ghost or a spectator is unread. Candidates: `'camera'` (the view's camera; the port's choice, alive too) and `'body'` (the dead body's side kept while a teammate's camera is the view). Settled by a capture of the original (die with the body outdoors, watch a teammate indoors, listen for the bed's swap) or by reading `PLAYER_INDOORS`' tick (0x2b3880) and the writer of `+0x1060` bit 2 for a dead actor |

## 14. Body sounds heard from another player's body

Added 2026-11-03 (UTC) for the owner's report of 2026-11-02 ("the 'hurt' sound can be heard amongst allies, which
isn't a thing on emu"). Every row is **reading, pending review** -- source inspection of the decompilation, cited
`FUN_<addr>` and `D:L<line>`, and of the ELF's vtables at their file offsets -- unless it names a proven row. A
vtable's class names are research 181's (`vt_classes.py`, its +0x34 lines): `CSealCtrl` 0x6694b0 (the local SEAL),
`CRemoteCtrl` 0x669590 (another console's player), `CSealCtrlAi` 0x6693f0, `CSealCtrlSquirm` 0x6699f0.

**The hurt grunt from another player's body is the original's; friendly fire is its only team gate.** The shooter's
console decides a round's hit and the victim's console applies it (research 193, the authority table's row 9; research
91 §15). The victim's console replicates the six part-health ratios to every console (research 193 row 12, marked
PROVEN there for its writer and reader read -- a reading under PROCESS's levels), and every console applies them
(`FUN_002be150` D:L162325-162346 -> `FUN_005a5790` D:L461439-461464 -> `FUN_005a54d0`, its live branch
D:L461394-461396) through the health setter `FUN_005477a0`. It calls the body controller's `+0x54` on a changed
health for a live body (`+0xe1` bit 4 set) with health over 0, or, for a body whose alive bit is clear, on a change to 0 or under (D:L412828-412833);
a live body at 0 or under takes the other branch, the cause stored at `+0xfb0` and the body's own `+0x58`
(D:L412835-412838). No branch tests an owner, a team or a locality. `CSealCtrl`'s and `CRemoteCtrl`'s `+0x54` are both `FUN_00597b00`, which
plays 0x3b CHRSND_DAMAGE every time (D:L454508: `+0x24`, `FUN_005978a0`, whose chance argument 1.0 skips the draw,
D:L454448-454455, into `FUN_0053b710` with the actor's place, D:L454454); `CSealCtrlAi`'s is `FUN_00571ab0`, which
plays 0x3b too (D:L433994). Only `FUN_00597b00`'s rumble is the own body's: it runs where `+0x34` answers 0
(D:L454509-454511), `CSealCtrl`'s `FUN_00544200`, never `CRemoteCtrl`'s `FUN_005e6260`, which answers 1 (both read
off the ELF: `jr ra; move v0,zero` and `jr ra; li v0,1`). `FUN_0053b710` plays it at that place through the per-actor
voice gate: 0x3b, 0x3c and 0x3d wait while the actor's `+0x424` runs and set it to 3.0 when they play
(D:L405267-405296). The one team test on the way is the friendly-fire gate (`FUN_005ac670`, research 219 §1): with
friendly fire off a teammate's round never hurts, so it never makes a teammate grunt; with it on, every console hears
the teammate's grunt, as it hears an enemy's. The grunt from an ally hit by the other side, a blast or a fall is heard
on every console either way. The port: the room's `hurtVoice` (`packages/match/src/room.ts` `Room.hurtVoice`), behind
the room's friendly-fire gate (`Room.refuses` -> `ffRefuses`), told to every page, the victim's own too, and played at
the body (`packages/viewer/src/netPage.ts` `case 'hurtVoice'` -> `matchSound.ts` `hurtVoice` -> `audio.ts`
`GameAudio.onHurt`); pinned by `packages/match/test/roomDamage.test.ts` ("the hurt voice: ...": off, no page; on, the
victim's page and a third player's one each; a second round inside `VOICE_GATE_S`, none).

**The death voice was a divergence that may bear on the same report; fixed 2026-11-03.** The original sounds the death voice only on the dying body's own console (the table's row; LATER 657, closed by its read), while the port played it on every page; so some of the "hurt" sounds heard among allies may have been another player's death voice, which the original's observers do not hear. The port now plays it for the page's own body, and for its bots only on the offline match's page that runs the room.

| sound | the original, for another player's body | cite | the port (file: symbol) | verdict |
|---|---|---|---|---|
| hurt grunt (0x3b) | every console, at the body, through the actor's 3 s voice gate; the only team test is friendly fire | above | `match/src/room.ts`: `Room.hurtVoice`; `viewer/src/netPage.ts`: `case 'hurtVoice'`; `viewer/src/audio.ts`: `GameAudio.onHurt` | faithful (reading, pending review) |
| death voice (0x3c, 0x3d) | **no** (closed by LATER 657's read). At a death the actor's `+0x58` `FUN_00547af0` (D:L413015-413158; the call at D:L413024) reaches `FUN_0029e8b0`, which clears the alive bit and calls the body controller's `+0x18` (D:L144772-144778). Only `CSealCtrl`'s `+0x18` is `FUN_005979a0`, the voice by the cause at `+0xfb0` (D:L454473-454480); another console's copy is `CRemoteCtrl`, whose `+0x18` is `FUN_005e6290`, which only clears the player's `%s_valve_alive` valve (0x662750) and plays nothing (D:L497312-497328; research 317 R317.1). `CSealCtrlAi`'s `+0x18`, `FUN_005714b0` (D:L433901-433907), plays on the console that runs the AI only: the port's offline match, whose page runs the room (`solo`), voices its bots as that console; online bots (an adaptation) run on the server and are voiced on no page. The kill message and its feed post a line and play nothing (D:L412845-412914; `KILL_AUTOCOMM_READING`, research 101). Every 0x3c / 0x3d play passes a literal: by the paths read, no voice for another's body. Still unread: the head-shot death clips' `headshot_kill` callback (`.HEADSHOT_KILL` at phase 0.05, on every console that runs the clip), a cry or an impact (LATER 658) | `FUN_00547af0` D:L413015-413158; `FUN_0029e8b0` D:L144772-144778; `FUN_005e6290` D:L497312-497328; `FUN_005979a0` D:L454473-454480; `FUN_005714b0` D:L433901-433907; D:L412845-412914; research 317 R317.1 | `match/src/room.ts`: the `kill` event's `cause` and `voiced`; `viewer/src/netPage.ts`: the `kill` case's `deathVoice`, the page's own body and, on the offline match's page (`solo`), its bots (2026-11-03; `test/deathVoice.test.ts`); `viewer/src/audio.ts`: `GameAudio.onDeath` | faithful (reading, pending review); was a divergence, fixed 2026-11-03 (LATER 657); `.HEADSHOT_KILL` owed (LATER 658) |
| footsteps | its own body and at most three others within 500 units sound (`+0xe0` bit 2: tested `FUN_005a3570` D:L460295, set by `FUN_00552850` D:L418841 and D:L418860, the range 250000 squared D:L418769; research 179 §11.20); which sound, `FUN_005a39b0` (§4) | `FUN_005a3570` D:L460266-460380; `FUN_005a39b0` D:L460383-460434; `FUN_00552850` D:L418746-418862 | `viewer/src/remotePlayers.ts`: `footfallsHeard` (`FOOTFALL_CAP_READING`, `FOOTFALL_NEAREST_READING`), `REMOTE_STEP_STICK_READING` | faithful at those readings |
| reload | `FUN_005c2a90` plays the weapon's `ReloadSound` at the actor in the kit's frame, no locality test; how a remote kit reaches it is not traced (research 91 §22.2) | `REMOTE_RELOAD_SOUND_READING`'s own cites | `viewer/src/netPage.ts`: `REMOTE_RELOAD_SOUND_READING` (the room's `reloadSound` at the take) | at the named reading |
| 870 pump, bolt after-shot cock (`.SHOTGUN_COCK`, `FUN_005c3000`) | not read for another body | -- | not sent (`REMOTE_RELOAD_SOUND_READING`'s comment; `tools/test/presentationAudit.test.ts`, the "after-shot cock" row, known as P10) | recorded only: the online-parity sweep's P10, not this note's |
| melee (knife, restraint, CQB, body carry) | none online: `FUN_005937c0` gates them inside `DAT_0045a0c1 == 0` (research 194 A05) | `FUN_005937c0` D:L452342-452375 | none online | faithful (nothing to hear) |
| throw | the release (`.THROW_OBJECT`) and the standing throw's `throw_whoosh` grunt, on the copy's own clip (research 325 R325.6) | research 325 §1.4 | `viewer/src/remotePlayers.ts`: `REMOTE_THROW_GRUNT_READING`, `RemotePlayers.takeThrowCallbacks` -> `viewer/src/matchSound.ts` | faithful at the reading |
| jump whoosh, landings | **UNREAD**: whether another console sounds a copy's `jump_whoosh` and its landings (LATER 650) | -- | none (`tools/test/presentationAudit.test.ts`, the P31 rows) | UNREAD (LATER 650) |
| bullet whiz (`.BUL_PASSING`, `.ROCKET_BY`) | another shooter's round within 20 units of the actor; the console's own rounds skipped (§5). `FUN_00598000` is `+0x44` of `CSealCtrl`, `CRemoteCtrl` and `CSealCtrlSquirm` (`CSealCtrlAi`'s `+0x44` is `FUN_005729f0`) | `FUN_00598000` D:L454611-454651 | at this note's base (`adb4e58fb`) `viewer/src/audio.ts` `GameAudio.onRoundPast` has no caller (LATER 644); `9f9d9d8927` on `agent/land-b200` (B200) calls it from `viewer/src/matchFirearm.ts` (`roundPast`) | owed at this base; LATER 644's fix in B200 |
| a hit on `CSealCtrlSquirm` | its `+0x54` is `FUN_005fef30` (`+0x58` `FUN_005fef10`), neither with a block in the decompilation | -- | -- | **UNREAD** (LATER 649) |
