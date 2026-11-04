# 82 — Map fidelity audit: the viewer against the console's own frames (2026-09-28)

Goal: the map viewer's picture 1:1 with what the PS2 drew. This note is the ranked list of every divergence found by
putting the viewer beside console frames at the console's own camera, with the cause (decompilation, reCOM, the disc,
the console's memory) and the fix or the reason there is none yet. Items close as they are fixed; the commit hashes are
on the `claude/web-maps` branch.

## 1. The instrument

`tools/console-compare.ts` draws a map in the PS2 presentation (640x448, the map's own half-angles) from an eye and a
look-at target, hides the chrome and the site bar, and writes the viewer's frame, the console's, the absolute and the
signed luma difference side by side, and the mean colour and error per eighth of the frame (`diff.json`). It can route a
campaign archive in from the disc for the page alone (the served tree holds only the 22 MP archives) and set panel
switches and sliders. Throwaway probes behind the numbers below (the ray picker that names the draw under a pixel, the
per-context colour dump, the raw-alpha survey, the TEX1 survey) were run from the session scratch and are described
where they are used.

### 1.1 The reference frames and their cameras

| frame | what it is | camera | how the pose is known |
|---|---|---|---|
| `scripts/parity/refs/console_spawn_slot8.png` | **PCSX2**, the campaign's first mission (Seeding Chaos, `RUN/M51.ZDB`) at spawn, crouched | eye `939.439, -126.264, 832.160`, target `939.439, -130.489, 858.341` | read off the console's own memory, `logs/parity/spawn_pcsx2.rdram` (research 17 §1) -- exact |
| `logs/parity/s4_pcsx2/A_ready027.png` | **PCSX2**, Vigilance (MP51) round 1, spawn A, standing | eye `540.8, 185.6, 1480.2`, target `539.96, 181.48, 1454.73` | fitted: the measured spawn A (`scene/spawns.ts`), the game's standing camera (README, "The player"), the yaw scanned in 5-degree steps for the least structural error |
| `logs/parity/s11_r0004_round1/B_hold00.png` | the **recompiled game** (the real ELF, GS emulated), Frostfire (MP2) spawn B, crouched | eye `510.2, 162.6, 1258.9`, target `537.25, 158.4, 1253.78` | fitted as above, the crouched camera |
| `logs/parity/s11_r0004_round1/A_hold01.png` | the **recompiled game**, Frostfire spawn A, crouched | eye `796, 119.5, 589.8`, target `796, 115.38, 615.27` | fitted as above |

The task that opened this audit called the slot-8 frame "Frostfire"; it is not a multiplayer map. It is still the best
instrument there is: its camera is exact, and M51 is built from the same formats (after D4 the viewer draws it with every
texture). The HUD, the SEAL and the round banners are in the console frames and not in the viewer's; the bands and the
regional samples below avoid them.

## 2. Ranked divergences

Rank is visible impact on a multiplayer map, largest first. Status: **fixed** (commit), **open** (cause known, not yet
done), **not a divergence** (checked, the viewer matches), **unknown** (seen, cause not established).

### D1 — Every multiplayer frame was 1.73x too bright — **fixed** (`dd01316f`)

The viewer multiplied the whole frame by `1 + FIX/128`, FIX 93, the game's post-process brighten (research 31 §12-13).
That FIX was read off the campaign. The post-process state block at `0x488e48` (`FUN_0033cd50` fills it; `+0x31` is the
enable byte, `0x488e90` the pass count, `0x488e98` the ALPHA register it writes):

| dump | enable | pass count | ALPHA | exposure params |
|---|---|---|---|---|
| `spawn_pcsx2.rdram` (PCSX2, Seeding Chaos) | 1 | **2** | `0x5900000069` (FIX 89) | scale 200, band 0.4 / -0.1, current 0.444 |
| `frostA_probe600.rdram`, `frostB_probe600.rdram` (a live Frostfire round) | **0** | **0** | 0 | scale 200, band 0.01 / -0.5, current 0 |

So a multiplayer round never runs the pass, and the campaign runs it **twice** (`1.695^2 = 2.87`). Measured:

| frame | band ratio console / viewer at FIX 93 | at FIX 0 | MAE rgb 93 -> 0 |
|---|---|---|---|
| Vigilance, PCSX2 | 0.46-0.67 | 0.94-1.15 | 39.0/32.5/31.5 -> 19.1/16.2/15.7 |
| Frostfire, recompiled | 0.46-0.67 | 0.80-1.16 | 23.5 -> 10.7 |
| Frostfire spawn A, recompiled (after D1-D3) | -- | 0.95-1.07 in every band | 10.8/11.3/11.2 (edges and the HUD) |

And the campaign frame at the two passes' equivalent (FIX 239, `2.87 = 1 + 239/128`) matches band for band (0.96-1.05
in the unobstructed bands, MAE 45 -> 22). Regional samples on Vigilance after the fix: ground 1.00/1.00/1.00, house wall
1.03/1.00/0.96, roof 0.98/0.94/0.93, stone wall 1.00/1.00/0.96. The default FIX is now 0 (`lighting.ts`, the slider's
markup); the slider stays for the campaign's look.

### D2 — Instanced props drew one placement's baked light at every placement; Frostfire's tank rails neon — **fixed** (`176e188d`)

Owner-reported: on Frostfire some yellow catwalks near-saturated, others mustard, same `crane1.tif`. A model instanced in
several places carries a chunk per instance context (`N000_I###_V##`) that differs only in its prelit vertex colours;
the viewer numbered the contexts from the world's traversal at 0 and drew a group's first member's chunk everywhere.
`hookupVisuals` numbers them by the model's `m_list`, the instances in load order (`vis_main.cpp:77-111`); the models are
read in file order with `worldmodel` last, so the copies inside the prototypes (never placed, never prelit) take the low
numbers. `tankrailbarshi`'s `I000` is the bare material colour, (128, 109, 35) on every vertex; `I001`-`I017`, the
seventeen world rails, are prelit at 35-50 red -- drawn at 128 they came out at (253, 193, 10) against the bridges'
(89, 68, 4). The engine draws record2 untouched on these nodes (no `m_dynamic_*` bit: `FUN_003b6d10`, `FUN_003b5f20`
emit no light command; `m_prelight` is read by nothing at run time), so the fix is purely which chunk. Over the 22 maps,
19 of MP2's 20 pre-world contexts are the unity material colour and none of its 88 world contexts is (MP7: 19/20, 0/27).
Clutter and the held weapon realise their own model as the root and number after the models read before it, as the
engine does.

### D3 — Mipmapped textures blurred by the GPU's derivative LOD — **fixed** (`52f36219`)

The GS picks a level from the depth: `LOD = (log2(1/|Q|) << L) + K` (`TEX1`, `LCM = 0`), `Q = 1/clip.w` (VU1 `0x08`).
The corpus's K runs -12 to about -6.5 with L 0, so Vigilance's `rockwall.tif` (K -12) is the base level to 4,096 units,
where three's derivative LOD had it two levels down at 150. Far wall's mean |Laplacian|: 5.77 -> 10.69, PCSX2's 15.44.
The `w` units are confirmed (round 2): the VU1 dumps hold the register file, and entry 0's clip matrix at the Seeding
Chaos spawn (`logs/vu1dump3/vu1_prog_1.bin`, `vf1`-`vf4`) has a w column (-0.0001, -0.1602, 0.9871) of length 1.000 --
the camera's look at -9.2 degrees -- so `clip.w` is the view depth in world units.

### D3b — The mip levels are the disc's own records, and a detail texture's fade out — **fixed** (`d8816a33`)

Every mipmapped texture's bind packet writes `MIPTBP1_1` (0x34), whose TBP1-3 are the gsaddrs of records the exporter
wrote beside the base: Vigilance's `rockwall.tif` (gsaddr 6) names `rockwall_mip1.tif` (7) and `rockwall_mip2.tif` (8).
Most are a plain downsample, but every **detail** texture's level 1 is authored with alpha 0 (Crossroads'
`detail_brick1` 104 -> 0, `rooftile_d1` 104 -> 0, `cobblestone_rock_d1` 255 -> 0; Vigilance's `cobble_road_det` 136 -> 0),
so on the console the detail pass fades out as the GS LOD crosses 0..1 -- 90-181 units at Crossroads' K -6.5. The viewer
now uploads the disc's levels (`LoadedMap.textureMips`, `mipChain`); Crossroads' three street views change in 7,361 /
9,881 / 36,061 pixels, the far cobbles and walls losing their detail layer. Two maps carry a mip record that is not half
the level above (Foxhunt's `stone01_mip1`, The Mixer's `mp52_concrete_detail1_mip`): those keep a generated chain, with a
diagnostic.

### D4 — The campaign archive drew untextured — **fixed** (`0e561d0d`)

`zdbEntry` threw on `M51_TXR.ZED`, whose name ends `ZM51_TXR.ZED` as well; the exact file name now wins. Not a
multiplayer bug (no MP archive has such a pair), but it is what lets the one exactly-posed console frame be used at all.

### D5 — The environment-map pass: water, glass and ice reflect their sky — **fixed** (`7e12a6f0`)

At two passes the Seeding Chaos frame differed mostly in the stream: the console draws a dark grey translucent sheet over
the bed, the viewer drew the brown bed alone. That is the `0x34`/`0x36` pass (research 15 §6, research 26 §3.2,
`FUN_003b5b90`): a visual whose `vparams` byte 7 names a `Material_Palette` entry gets a second pass whose ST is the sphere
map of the eye ray's reflection off the vertex normal and whose alpha is `(1 + a) * vertex alpha * rim`. The block's
numbers are the palette entry's: M51's `palEntry_5` is base (33, 33, 33, 65), uv scale 1.5, rim 100 / 0.01, `sky01.tif` --
the live dump's block word for word. On the multiplayer maps the textured entries are bound to the water (Blood Lake,
Foxhunt, Fish Hook, Enowapi, Shadow Falls, Bitter Jungle, Abandoned, Night Stalker, Requiem, Sandstorm, The Ruins, The
Mixer, Chain Reaction), Sujo's glass and car panels, and Guidance's icy terrain. Measured on the campaign frame (the
stream's mean): console (50,44,37), without the pass (48,35,22), with it (60,53,48) -- the hue now the console's, 20 %
bright. Open within it: the untextured entries (kind word 2: truck bodies, chrome, lockers) are not drawn -- what the
engine gives them is not established; Vigilance's `cloud_scroll.tif` entry names a texture no library holds (a
diagnostic, no pass); and no multiplayer console frame of water exists to check the MP maps against. *(Corrected
2026-10-02: the untextured entries and Vigilance's unresolved `cloud_scroll.tif` were settled in round 4 below -- the
engine itself draws them with `DAT_004b4d90`, `specular_map.tif` (`FUN_003bb2c0` for an unresolved name, `FUN_003b5f20`
for an empty one), and so does the viewer; the `texture cloud_scroll.tif: in none of the map's ... asset libs` line
that stays in the diagnostics records a disc fact, not a defect. Pinned by `viewer/test/heldMapAssets.test.ts`
(SOCOM_DISC), ported from Chris's browser-beta-v5, whose "cosmetic fallback" label for it this replaces.)*

### D6 — Multisampling in the PS2 presentation — **fixed** (`8394f141`)

The renderer is created with `antialias: true` for the Modern picture, and under WebGL2 the canvas's multisampling is
fixed at context creation; the GS had none. The PS2 presentation now renders the world into a 640x448 target with no
samples and copies it texel for texel onto the canvas, the HUD drawing onto the copy. Checked under WebGPU in the
Browser pane; headless SwiftShader never multisampled, so its pixels are unchanged (0 of 286,720 at the spawn-A compare).
The copy to the 4:3 box is still the page's CSS stretch (bilinear), as a television's analogue scale was not nearest.

### D7 — Vigilance's grass beside spawn A — **unknown**

The console shows a tall dense clump along the wall to the SEAL's right; the viewer's `grass_bush` there (553, 163, 1454)
is shorter in the frame. It is 13 units from the camera, so the fitted pose's error of a few units could account for it;
MP51 has no `CLUTTER.ZAR` instances. Needs an exactly-posed MP frame to settle.

### Checked and not a divergence

- **Texture colour and CLUT alpha.** Regional colour ratios on Vigilance after D1 are within 0.93-1.03 on every lit
  surface. No texture on any of the 22 maps has a raw CLUT or texel alpha above 0x80 (the GS would blend with As > 1
  there, and the viewer clamps), so the clamp in `gs/palette.ts` loses nothing.
- **The skies.** An apparent 2.4x on Vigilance's sky was the site bar in the sample; with the frame alone the sky band
  is 1.1 of the console's.
- **The Frostfire ramp rails and crane** (prelit `crane1.tif`) match the recompiled frame's mustard.
- **Fog colour.** `FOGCOL = 0x484a4a` in the console's Seeding Chaos GS dump (research 31 §8) is the disc's (74, 74, 72),
  what the viewer uses.

- **The texture scroll rate.** The engine steps a band by `du * param` once a frame (`FUN_003c0120`, called from
  `FUN_00313c60` with the frame's time), so `du` is per second -- what `SCROLL_TICKS_PER_SECOND = 1` in `world.ts`
  assumed.

### The 22-map survey

Every map from each measured spawn at eye height looking toward the other, after D1-D3 (and `tools/map-health.ts`): all
22 load with no diagnostics and no untextured draw, and nothing reads as broken -- no missing sky, black texture, hole or
z-fight in the 44 views. The night maps are as dark as the console draws them now that the brighten is gone.

## 3. What would settle the open items

- An exactly-posed multiplayer PCSX2 frame: a savestate at a spawn with its RDRAM (the camera at `0x415ff0` -> `cam+0x2c`
  / `+0x38`, research 17), as slot 8 is for the campaign. The owner runs PCSX2; the viewer side is
  `tools/console-compare.ts --map MP<n> --ref <frame> --eye .. --target ..`.
- A multiplayer water frame from the console (Blood Lake, Fish Hook), for D5's pass on the MP maps.
- ~~The runtime layout of a `Material_Palette` record~~ -- read in round 4 (`FUN_003bb2c0`, §6).
- A console frame with the night vision on, and one of the SEAL's shadow on flat ground, for §6's two new passes.

## 4. Round 2 (after the merge of the integration branch)

The 22-map sweep after D3b, D5 and D6: all 22 load with no untextured draw; three maps carry one diagnostic each (the two
odd mip records above, Vigilance's missing `cloud_scroll.tif`); no console warning beyond "WebGPU is not available" on 17
maps with a reflection pass. Unit tests 1,073 pass. Of the e2e, 19 pass and 5 fail -- `audio`, `grenade`, `hud`,
`weapon` and `walk`'s "camera at spawn A in the PS2 presentation" -- all at `setMode('walk')` returning false, and the four
tried (`hud`, `walk:186`, `grenade`, `weapon`) fail identically on the integration merge `8e1af4c5` without this round's
commits; walk mode is not this workstream's.

## 5. Round 3

- **The SEAL is lit as the VU lights it** (`4ed5d9e2`). Per vertex, every frame, on the GPU, from the posed (skinned)
  normal (`rigShading.ts`); the colour lane is the material alone. Data quadword 338 -- the character's colour the EE
  uploads -- is (128,128,128,128) in all 26 skinning dumps of `logs/vu1dump3`: research 78's unity placeholder, now
  read. Against the recompiled game at Frostfire spawn A (crouched, the console camera), five body regions: the back
  (19,18,20) -> (26,25,28) against the console's (27,26,29), the lower back (10,10,11) -> (19,18,20) against (19,17,20),
  the head, both arms within 1-2 of the console. The fog and the brighten take the world's path (they did already).
  Whether the SEAL takes the light command at all (`FUN_003b6d10` on the actor's node) is the one reading left; the
  numbers say it does.
- **The characters' shadow is a render-to-texture pass, not a blob.** The world init makes 256x256 targets named
  `ShadowX_%d` (the string at 0x3f6e78, `FUN_003553a0`), reCOM's `CPipe::RenderWorld` renders `m_shadows` render maps
  before the world, and the whole of `logs/vu1dump3`'s fourth family (`70 06 08 40 42`, `52 66 08 40 42`: the skinned
  and scaled models drawn as `0x40`'s untextured black triangles, research 15 §3) is that pass. The viewer draws none;
  the projection of the targets onto the ground (`ShadowVector`, `ShadowWeight` on the world root) is still to read.
  **Open.**
- **The 142 deck's east corner is the engine's own hole** (`501b73d1`, research 90 #2). The deck and a box top under
  its corner are one node's `di`; SOCOM II's AddDI appends (`FUN_00313d60`), so the file's order is the surface order
  and the probe's first hit is the box top at 112 -- where reCOM's SOCOM I transcription prepends and would find the
  deck. The viewer matches the engine; a PCSX2 walk into the corner is the one check left (H269, filed
  2026-10-21 with LATER 251: the owner's playtest fell there three times, `agent-mail/evidence/later-251-frostfire-20261021/2026-10-21T21-43-11.766Z.s2r`,
  ticks 3174, 4288 and 5002, each from (674.75, 142, 725.25); still a reading).
- **First-sight hitches** (`ab14e47a`, research 90 #3). Every program and upload is made after the reveal
  (`ViewerRenderer.warm`); the turn and walk spikes are gone on Desert Glory, Crossroads, Blood Lake and Frostfire. Left:
  117-267 ms at entering walk (the HUD and reticle scenes' first draw) and a 0.9-3.3 s frame at the first key on Desert
  Glory (`audio.ts`'s unlock).
- **The water pass's 20 % on the Seeding Chaos stream** -- **open**. Removing the pass leaves the stream's R at the
  console's and G/B low; with it, all three are 10-20 % high, as if the pass were about twice as strong as the console's.
  Its alpha is `(1 + a) * vertex alpha * rim`, 66 x 100/128 = 51 at the most, the dump's own range (research 15 §6.4's
  upper-wins reading; lower-wins would give 65, 1.5 % less), so the excess is more likely the base water pass or the bed
  under it than this one.
- **The untextured palette entries** (kind word 2: truck bodies, chrome, lockers) -- **open**. The env gate is the
  runtime record's `+0x14 == 2` (`FUN_003b6a00`), and a record with no texture falls back to `DAT_004b4d90`
  (`FUN_003b5b90`); the disc's `dat[5]` is 2 on exactly these entries and 0 on the textured ones that the one live
  block shows drawing -- so either both kinds get the pass (the untextured with the default texture) or `+0x14` is not
  `dat[5]`. The palette-to-record copy is the function to read next.
- **Vigilance's grass** -- no multiplayer savestate with a camera exists, so it stays a pose question; the play mode
  at the measured spawn A reproduces the SEAL and the house but not the console's framing within a few units.

## 6. Round 4

- **The player's shadow, as the engine draws it** (`e048bc6f`). Only the local player casts one: `FUN_00599f00` (the
  character spawn) sets the node's `+0xa1` bit 5 when the shadows are on and the world has no render map yet, and
  `CWorld::AddChild` (`FUN_0031f240`) gives that child a `CRenderMap` (`FUN_0031a9a0`) -- grenades, claymores and other
  SEALs never get one. Each frame `FUN_0031a180` puts the map's camera at the actor's bounds centre looking down the
  root's `ShadowVector`, far 1.5x the largest side, and fits an orthographic frustum to the eight corners with a
  texel's margin; the actor goes into the 256x256 `ShadowX_%d` target as `0x40`'s black triangles. The projection is
  VU1 `0x3c`/`0x3e` (disassembled at `0x2b80`): ST through the map's matrix, colour the map's (black), alpha
  `W * clamp(-D.N) * clamp((P - v).N) * clamp((far - (P - v).N) / (far - near))` with `W = ShadowWeight * 255` in
  0..128 terms -- 0.25 (the `CWorld` default at `+0x680`; no map names a `ShadowWeight`) -- blended source-alpha over
  the receiver. The viewer renders the SEAL (body, gear, rifle) on a layer of its own into a same-size target and
  darkens in the world's graph, `Cd * (1 - a * coverage)`; the rifle and grenades do not receive. On MP9, whose vector
  is 0.82 down, the ground under the silhouette is at 0.78 of its colour; on Frostfire's low vector about 0.9.
- **The first seconds after a load** (`030f022e`, research 90 #17 and round-4 item 2). The stutter was the renderer's:
  a draw meeting a new program links it synchronously (`WebGLBackend._completeCompile`, about 20 ms a program on ANGLE's
  D3D11), and the props' reveal handed the draw 181 of them on Guidance. Every draw is now compiled with `compileAsync`
  before it is revealed -- the world before the first paint, the props after it, the SEAL, its rifle, its shadow's
  silhouette, the HUD and the reticle as the map is shown -- one draw a call, three in flight (a synchronous link waits
  behind every link queued in the driver: 150 at once held one for 1.5 s), the first of each kind first
  (`compileQueue.ts`); the post-reveal warm-up compiles hidden objects in place rather than through stand-ins (which
  linked different programs for the SEAL's gear). Walking from the first paint, 4 s, audio on: Guidance 26 frames over
  50 ms (worst 750) -> 1 (117-167); Blood Lake 9 (483) -> 1 (167); Desert Glory 12 (400) -> 3 (167); Crossroads 1
  (217); Frostfire 1 (183). Entering the walk at the instant the map starts to load (the playtest's `hold W at once`)
  leaves 3-4 frames, the SEAL's first programs still linking. What is left at the first key is `audio.ts`'s unlock
  (36-466 ms on these runs), the audio workstream's. The first paint moves 0-0.5 s later.
- **The untextured palette entries** (`451ab170`). `FUN_003bb2c0` is the palette-to-record copy: `dat` over the 0x3c
  record, `tex_name` to `+0x38`; an entry flagged textured (`dat[7]` bit 0) becomes kind 2 with its texture resolved
  or `DAT_004b4d90`; an unflagged one keeps its saved kind and an empty `+0x38`, which the env pass
  (`FUN_003b5f20`) replaces by the same `DAT_004b4d90` -- the loaded texture whose name holds `specular_map` (the scan at
  decomp 49244), `specular_map.tif`, in every map. Every entry on the disc is kind 2, so the untextured ones draw the pass
  too: Frostfire's two pipe textures, Desert Glory's trucks (a glint on the cab, +23 levels over 496 pixels), Vigilance
  (MP51, five entries) and Sandstorm (MP73, two). An entry whose texture will not resolve (Vigilance's
  `cloud_scroll.tif`) now takes the default as the engine does.
- **The night vision's colour** (`2fb0491a`, research 84 §14's request). `FUN_003b78d0(0, LensFX_NVG)` sets rows
  `(0.33 r, 0.33 g, 0.33 b, 3.03 a)` of the lens and the flag `0x4b4a68`; while it is up every world and character
  packet (`FUN_003b41d0`, `FUN_003b5f20`) runs VU1 `0x5c` (`0x5e`/`0x60` for the other colour buffers) after the
  lighting (`0x18`, or `0x54`'s flat colour) and before the output (`0x28`), the row in the header's qword 13
  (`FUN_003b6870`, VU `328`). The routine at `0x4d8` is `ACC = row*c.x + row*c.y + row*c.z; c.xyz = ACC + row*row.w`:
  `c' = row.rgb * (R + G + B + row.a)`, alpha kept, in the lane's 0..255 units -- a lens-green monochrome of the lit
  colour at about its brightness, not a lift; the fog's colour becomes the lens's times its own (`cam+0xd0`).
  `FUN_003b7170` drops the flag once the rows are back at the neutral `(0.33, 0.33, 0.33, 0)`. The world's and the
  SEAL's graphs apply it (`nightVision.ts`); the canvas filter is gone. The EE also runs the rows over a light list's
  colours (`FUN_003b54e0`, `c' = row * (R + G + B + row.z)`); which lights those are is not read, and the viewer leaves
  its light passes (the effects workstream's) as they are.
- **The sweep and the tests.** All 22 maps load with no untextured draw; the diagnostics are round 3's (Vigilance's
  `cloud_scroll.tif`, the two odd mip records) and Guidance's unplaced `access_action3` (the actions workstream's).
  Unit tests 1,369 pass; typecheck clean. The e2e with `?redotcom`: 38 of 39 on each of two full runs, a different
  timing test each time -- `effects` (the M4A1 flash's three-frame life, 2/2 alone) and `hud`'s fade-in (the HUD steps
  at most 0.1 s a frame, so slow SwiftShader frames under the host's load leave it short of 1 at 1.7 s); `hud` fails 3
  of 3 with this round's compile queue reverted and 2 of 3 with the shadow's update off, so neither causes it.

## 7. Round 5 -- RENDER-VIG: the Vigilance courtyard, the vertex alpha and the alpha pass (2026-10-03)

The owner played Vigilance (MP51) in Play mode on 2026-10-02 and reported a rendering defect in the courtyard north of
spawn A, worse with the engine order off, better close up and worse at range with it on. Two readings came out of it;
both are **reading** (transcribed from the decompilation and the disc's data, unit-tested, not yet reviewed at the
source by a second reader), with one capture comparison each. Evidence kinds are kept apart below.

### D8 -- A packet whose vertices carry an alpha ramp was drawn opaque -- **fixed** (this round)

- **Seen** (rendered browser run, WebGPU on the owner's GPU and WebGL2 on SwiftShader alike): in the courtyard at
  (490, 170, 1430) the grass patches had hard polygon edges against the cobbles and the dirt, and which of the two
  coplanar layers showed changed with the engine-order switch and with the camera (`logs/vig-render/` in the
  worktree: `MP51-probe-d1-eooff.png` / `-eoon.png` before, `MP51-fix3-d1-*.png` after). Looking up, every sky dome
  carried a hard-edged grey cap (`MP51-AU`, `MP6-AU` before/after in the same folder). Frostfire's ocean from spawn B
  was a bright teal sheet where the recompiled game's frame (`logs/parity/s11_r0004_round1/B_hold00.png`, the pose of
  §1.1) shows dark grey water.
- **The cause** (source inspection, the disc's data through `@s2u/mesh`): `ground_wc23`'s chain (`WORL_MDL.ZED`
  `N069_000`) draws `ground_grassy.tif` (packets 0-1), `cobble_road.tif` (2-3) and then `ground_grassy.tif` again
  (packet 4) with **vertex alpha 0..1** -- a grass overlay laid on the cobbles and faded by the vertices. Every world
  packet of every map sets `PRIM.ABE`, and the GS blends by `As = At x Af` (MODULATE), `Af` the vertex's alpha, which
  VU1 hands over unlit (`lighting.ts`). The viewer decided a draw's blend from the texture's pixels alone
  (`isOpaque`), so the overlay was an opaque draw merged into the texture's run, coplanar with the cobbles: a z-fight
  settled by the draw order -- hence the switch's effect -- and by the depth interpolation at range. Across the 22
  maps 1,711 packets carry a vertex alpha below unity (a scratch survey of this task, not kept): the terrain blends
  (MP51's `ground_grassy`, `ground_dirt_rough`, `cobble_road`; MP73's `sand` over `rock_broken`; MP82's `snow` over
  `road`; MP53's `ground_grass02`; MP71's `sand_beach`), the sky domes' rims and caps (`gen_cloud_n_sun_256x256.tif`
  on MP51 and MP6, `sky01.tif`, `mp82_skycap.tif`), the water's edges (MP2's `a_water.tif`, MP53's `water.tif`), none
  without `ABE`. MP72 has none.
- **The rule**: a packet blends by its `ALPHA` register whenever its modulated alpha can fall below unity -- by the
  texture's alpha or by the vertices' -- and keeps its own place in the walk, after the layer it fades onto.
- **The fix**: `LoadedMesh.vertexAlpha` (`hasVertexAlpha`, `loadMap.ts`), a material of its own per (texture, fog,
  cull, vertex alpha) in `world.ts`, `materialSpec`'s sixth argument, and the merge cut at every such part as at a
  graded texture. A cutout (`TEST.ATE`) stays a cutout: the test is on the modulated alpha. The escape hatch
  (`graded alpha` off) punches a vertex ramp out at half like every ramp.
- **Measured** (capture comparison, PCSX2 `logs/parity/s4_pcsx2/A_ready027.png` at §1.1's spawn-A pose): the
  console's grass fades into the dirt over several metres at the left of the frame; the viewer's had a hard edge
  before and fades after (`MP51-pcsx2A-eooff.png` / `MP51-fix3-pcsx2A-eooff.png`). The recompiled game's Frostfire
  spawn-B frame: dark grey water, as the viewer's is now (`MP2-recompB-before-eooff.png` / `MP2-recompB-eooff.png`).
  No console frame of a sky cap exists; the cap's alpha 0 at the zenith is the data's.

### D9 -- The engine's alpha pass is a visual flag, not a texture name -- **fixed** (this round)

- **Read** (`FUN_003374c0`, `CPipe::RenderVisual`, D:L235422-235438): a visual whose `vparams` word has bit 0 set
  and bit 8 clear -- or whose node's opacity is under 1 -- is not drawn as the walk reaches it; `FUN_003371b0`
  (D:L235314-235322) puts it on the pipe's alpha list (pipe+0x638) keyed by the squared range from the camera to its
  centroid (bit 18 would force 1e8, the far end; no shipped map sets it), `FUN_00336f60` (D:L235220-235255) keeps the
  list sorted, and `FUN_00336cb0` draws it at the very end of `RenderWorld` (`FUN_00339de0` D:L237235), far to near,
  after the grid walk (D:L236851-236945), the landmarks (D:L236953-236977), the deferred-layer nodes (node flag bit
  11: Vigilance's sky dome and its four turrets, D:L236174-236181 and D:L237100-237112) and the node-level alpha list
  (`FUN_00337f40`, node flag bit 7). reCOM's `tag_VIS_PARAMS` names bit 0 `m_parent_has_visuals`; the decompilation
  does not bear that out. The flagged visuals (a scratch survey, not kept): Frostfire 70 (the drop shadows, the lamp
  flares and glows, the windows, the door panes), Vigilance 22 (the shadows, the chainlink doors, the puddles, the
  whispy cloud layer, an air-conditioner's logo), Desert Glory 178, Crossroads 18.
- **What the viewer did**: the drop shadows alone were a pass after the last ring, by their texture's name (reCOM's
  decal reading); the flares, glows and windows were drawn in the walk -- with depth written under the engine order,
  so a glow drawn before the wall behind it kept the wall out, which the console never does; and with the sky dome's
  rim now a blended draw (D8), three's back-to-front sort by object centre under the switch's off state put the dome's
  two fade packets, drawn in walk order on the console, the other way about: a hard edge in the zenith.
- **The fix**: `VISUAL_FLAG_ALPHA` / `visualInAlphaPass` (`@s2u/scene`), `PlacedModel.alphaPass` and
  `LoadedMesh.alphaPass`, `engineOrder`'s pass after the walk sorted far to near every frame (`alphaPassOrder`), and
  with the switch off every draw at its walk order (`world.ts` `restOrder`, `REST_WALK_SCALE`) with the alpha pass
  held after them all, where three's own back-to-front sort within the pass is the console's. The engine sorts
  nothing but that pass.
- **Not changed**: a shadow texture without the flag keeps the decal path (no depth write, a polygon offset); ~~the
  alpha-pass draws still write depth under the engine order, as `ZMSK = 0` throughout says~~ *(corrected 2026-10-03
  at the review: the pass writes no depth -- `FUN_00336cb0` opens with `FUN_003b7150(1)` D:L235137 and closes with
  `FUN_003b7150(0)` D:L235185; `FUN_003b7150` D:L308483-308488 calls `FUN_003afe70(param_1 == 0)` -- an inversion, D:L308487
  -- which kicks `DAT_003e11c0` (-> 0x3e1140) for the pass's 1 and `DAT_003e1200` (-> 0x3e1180) for 0, D:L304682-304710,
  the `ZBUF_1` write with `ZMSK` 1 then 0 *(the pairing read the other way round until the review of 2026-10-03)*;
  `RenderWorld` itself opens with
  `FUN_003b7150(0)` D:L236792, so research 26 §2's `zmsk=0` is the walk's. `materialSpec.ts` `alphaPassState`: the
  depth write off in either order, and under three's order the pass in the transparent list, a cutout of it too, so
  `restOrder` holds it after the walk; the material cache keys on the pass. Pinned by `worldOrder.test.ts` and
  `materialSpec.test.ts`)*; the node-level alpha list
  (bit 7: Vigilance's `metalgrate_door`, `water_wc11`, `whispy_scroller`, `ac_unit`, `wc08`, `wc18`, `wc19b`) and the
  deferred layers (bit 11) are read but not given passes of their own -- their visuals are either alpha-pass visuals
  already or opaque, and nothing seen depends on them yet. The README's line "the engine draw order stays a switch
  until the pass that keeps a flare from cutting the wall behind it is found" (its open-items list) names this pass;
  the README is a hot file and is owed that edit.

### The owner's doorway

The second screenshot's doorway (the `wc23` building, door at about (577, 1348)) shows the sky and a roof through
it because the room's north wall holds an open window (`window_frame`, a wooden frame of 32 triangles and no pane,
at (538-551, 177-198, 1250-1260)); the ray through the door and the window meets nothing until the sky dome
(`MP51-probe-d1-*.json` in `logs/vig-render/`: `gen_cloud_n_sun_256x256.tif` at 2,094 units and nothing nearer).
The data draws that, and the console would too; the defect in the frame is D8's ground around it. The far-plane
question it raises -- the camera's `m_far_plane` is 2,000 on MP51 and the dome's far wall is 2,250 from spawn A --
is open: the dome is drawn on the console (the PCSX2 frame shows it), so either the VU1 clip or the deferred-layer
pass does not clip it at the camera's far plane; the viewer's far plane is the map's extent and draws it either way.
