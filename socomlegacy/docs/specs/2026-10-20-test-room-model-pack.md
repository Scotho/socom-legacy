# Test-room model pack

2026-10-20. A **browser adaptation** with no original (`TEST_ROOM_MODEL_PACK_ADAPTATION`, product track). Dustin is remaking props and weapons as GLB files and keeps those files private. The test room can draw one of them in place of a game mesh. This note is not a research note and it claims no parity level.

The code is `packages/viewer/src/modelPack.ts` (the manifest and the test-room gate), `modelPackHook.ts` (the seam `buildWorld` asks) and `modelPackRuntime.ts` (the folder, the zip, the GLB parse, the panel). `main.ts` loads the runtime only when `modelPackActive` is true and the page is not a replay frame (`REPLAY_WORLD`). The front end, the forge and the launcher do not import it.

## How to open it

The pack is off unless the page is the test room **and** the address contains `modmodels`. One address that does both, on Desert Glory, in play, with the dev switches:

`/testroom?devtools&flyok&map=MP6&mode=play&devmode&modmodels`

Open Settings. At the bottom, **Model pack**. Choose a folder, or import a zip. Nothing is uploaded and nothing is committed. The same browser remembers the folder (where the file-system picker exists) or the zip's files. The files are stored in 32 MiB pieces, written in one transaction, and read again on the next visit. A failed write says the store's own reason.

If the map is already on screen, press **Reload map** after the status says the pack is on. That line is shown only once this browser has finished storing the pack, so a reload then brings it back. **Clear model pack** drops both packs; reload the map to see the game's meshes again.

**Choose second folder** and **Import second pack (.zip)** load a second pack beside the first. A terrain pack of up to 128 ids (about 60-90 MiB is the size that pack is for) uses this. Each pack keeps the caps below: 128 ids, one GLB 500 MiB, the pack 500 MiB. The two packs' ids must not overlap. An id named by both logs one warning, `Model pack: "<id>" is in both packs; the first pack's entry is kept.`, and the first pack's entry is the one that draws, including when that entry's GLB was skipped and the original stays. The second pack is stored under its own keys in the same browser store, in its own 32 MiB pieces. Boot reads it after the first pack, with the same wait for its own size. Collision stays the disc's either way: a pack changes the draw only.

Without `modmodels`, that block is not on the page and no GLB is drawn. The launcher (`/`), the setup page and the forge never mount it. A replay frame (`replayview`) skips it as well: the recording was made without the pack. The flag is a row of the launch-parameter table (`modmodels`, test room only). It is not a checkbox on the launch settings sheet; it belongs in the address.

Boot reads the pack's stored size from a small record, then waits 2 seconds plus about 1 second per 10 MiB (never more than 52 seconds, the wait the 500 MiB size cap gives, counted after the size record is read -- that read has its own 2-second window, so 54 seconds in all at the most; the rate is a named adaptation citing the 4K pack's measured 1.7-2.2 s read) while the status says `Loading model pack… N MB`. `N` is the stored size in decimal megabytes (1,000,000 bytes). If that read is not finished, the pack stays off for the visit and a late answer does not turn it on.

## Where the files go

A folder, or a zip of that folder. `models.json` sits at the root, or inside the single folder a zipped directory adds. Each GLB is named by the manifest. Anything the manifest does not name is ignored.

```text
my-models/
  models.json
  m4a1.glb
  mp6/crate.glb
```

## The manifest

`format` is `s2u-model-pack` and `version` is `1`. `models` is a list. `id` is the model name the engine already uses: a weapon's name from `WEAP_GEO` / `WEAP_MDL` (the M4A1 is `m4Acarbine`), a prop's model name on the map, or a level piece (`world:<name>#<n>`, below). The compare ignores case. `file` is a `.glb` inside the pack, not an absolute path and not `..`.

`scale`, `rotation` and `position` are optional.

- `scale` is one number, greater than 0. Omitted, it is `1`. This build draws props and weapons in game units, so a GLB extracted in the original game units needs `"scale": 1`. `"scale": 0.1` draws those models 10 times too small.
- `rotation` is three numbers, degrees, Euler XYZ, applied in that order. Omitted, it is `[0, 0, 0]`.
- `position` is three numbers, an offset in the port's units, in the model's own space. Omitted, it is `[0, 0, 0]`.

A prop uses the same shape. Its `id` is that prop's model name, the string the map already uses for the mesh.

A level piece uses the same shape. The piece is one direct child of the `worldmodel` root, in the order the disc stores those children. The whole subtree is one piece: child names that repeat inside it are not keys of their own. The GLB replaces that piece's draw and nothing else. `scale`, `rotation` and `position` are applied in the model's own space, then the piece's node matrix places it, the same way a prop's are.

The key, compared without case:

- `world:<name>` — that direct child, only when no sibling shares the name. Desert Glory has eight siblings all named `building_wc2`, so `world:building_wc2` matches none of them.
- `world:<name>#<n>` — the nth direct child with that name, `n` starting at 0, in the disc's child order. Those eight buildings are `world:building_wc2#0` through `world:building_wc2#7`.

`<n>` is that sibling order on the disc, so it does not move for a given map. When the name occurs once, `world:<name>` and `world:<name>#0` are the same piece. The id to copy always includes the ordinal: `world:<name>#<n>`.

A bare name such as `g47` is a prop or weapon name. It does not swap a world piece. When the loaded map has a world node of that name, the console warns once per id, `Model pack: "g47" matches a world piece by name only, so the original stays. Use "world:g47#0".` Several siblings are listed with `or`. A prop name that is not a world node stays quiet.

The list of ids for the map that is on screen: open the test room with `devtools` (or `devmode`, which includes it) or with `modmodels`, and load the map. In the model pack block, **World piece ids**. The same list is `__viewer.worldPieces()` in the console: each entry's `id` is the key, and `index` is its place among every direct child. A load that asked for neither leaves the list empty (`null` from the hook). A replay frame does not ask.

```json
{
  "format": "s2u-model-pack",
  "version": 1,
  "models": [
    {
      "id": "m4Acarbine",
      "file": "m4a1.glb",
      "scale": 1,
      "rotation": [0, 180, 0],
      "position": [0, 0, 0]
    }
  ]
}
```

A field this format does not name is ignored. A bad `models.json` is refused in one line, `Model pack refused: models.json: …`, and nothing is swapped. Caps: 128 models, `models.json` 64 KiB, one GLB 500 MiB, the pack 500 MiB. The 500 MiB cap is checked against the zip's `File.size` and each zip member's declared size before those bytes are read or unpacked. Only `models.json` and the GLBs it names are read.

## What is drawn

When a mapped prop, held weapon, dropped weapon, grenade or level piece would be drawn, the GLB is drawn there instead, at that placement, with the pack's scale, rotation and offset under it. A level piece is drawn once, at its top-level node's matrix. An id the pack does not name is drawn as before. A level-piece id is sent with the map load only while the pack is on, and only for a GLB that parsed: a missing file leaves that piece's original draw. A missing GLB, a GLB over the cap, a GLB that will not parse, a texture over 4096 px on a side, or a GLB over 200,000 triangles logs one console warning:

`Model pack: "<id>" (<file>) was not used (<reason>). The original mesh stays.`

and that id keeps the game's mesh. The page does not crash.

2K textures are recommended for small props.

A GLB that names a buffer or an image outside the file (any `uri` other than `data:` or `blob:`) is refused the same way. The browser makes no request for that address. Clearing the pack, or importing another, drops the previous GLB's geometry, materials and textures.

The swap is the picture only. Collision, the grid, door swings, switch paths on every piece that was not swapped, weapon points, hit tests and the round are unchanged. A swapped piece's own triangles, including a switchable chunk of that piece, are the draw the GLB replaces. The GLB rides on the placement, so a door that moves still carries it. The map is lit by vertex colour and has no scene lights, so the GLB is drawn unlit from its base-colour texture; a PBR preview would otherwise be black. The map samples a texel as the stored byte and writes that sample out unconverted, so a pack texture is sampled the same way: GLTFLoader's sRGB tag on a base-colour or emissive map is cleared, including when the material is already unlit (`KHR_materials_unlit`, which a native export uses). COLOR_0 is multiplied once, as the file stored it. A native export's unity vertex colour is 1, and a mid grey of 128 then matches the map's 128/255 instead of the sRGB decode (about 0.216, roughly half as bright). A source material's emissive colour, map and intensity are added on top of that base colour, so a self-lit part still glows. A material with no emissive stays black and the base colour is unchanged. Scope and suppressor nodes on a replaced weapon are not the game's nodes. LOD bands are not applied to a replaced model: it is drawn at the placement. A facade entry that shares the model's name (a lamp flare, `facade` non-zero) is still the original billboard. The replaced mesh itself is not turned.

An animation in the GLB is not played.

A node's `extras.pivot` is removed before the file is parsed. three.js 0.186's `GLTFLoader` copies node extras onto `userData`, and when that node has a child it treats `pivot` as its own pivot: it subtracts the array from the node's position, sets `Object3D.pivot`, and sets the first child's position to zero. That undoes a container three's exporter wrote. A pack GLB's `pivot` is not that container. On the disc check a building whose extras carried one drew about 1,700 units off. Other extras on the node are kept.

## Known limits

- Each pack is capped at 500 MiB, and one manifest names at most 128 ids. A prop pack already uses most of that 500 MiB; a second pack (its own 128 ids and 500 MiB) is what a terrain pack loads beside it. The caps are not a sum, and this note does not raise either one.
- A mapped prop is one GLB per instance. The instance is the scene path through the last `=<model name>` (`worldmodel/door=crate`). The GLB is placed at that node's own world matrix, the node `flattenScene` records at that path, including a node that draws nothing. A piece's transform is not the anchor. A longer path is a sub-part of that same prop, including the hidden alternate (broken) pieces, and is not drawn again.
- The armory SEAL figure, world or dropped weapon copies, and grenades were not tested.
- Folder import was not tested, only zip import.
- A level piece that moves or breaks -- one with an alternate state (a destructible's broken pieces) or a switch path (a part a switch or a door moves) -- is never swapped: its GLB would stand still and whole while the original moves or breaks. It keeps the disc's draw, and the pack's line under the status names it (`N pieces kept: they move or break`). Drawing such a piece's GLB through the alternate-state and switch-path machinery is a larger feature, not built (#432, taken over; the merge controller's call).
- A level piece that draws only props -- a door, the breakable beer, the lights, crates -- is never swapped: it has no world draw to leave out, so a GLB there would stand on top of the prop, which still draws, swings or breaks. Map the prop's model name instead; the pack's line names such pieces (`N pieces kept: they have no world draw of their own`), as it does a piece that draws only billboards or nothing at all. A piece with its own world draw and props under it swaps only its world draw: its props keep drawing, swinging and breaking, so a GLB that bakes those props in would show them twice.
- Clear waits for an import already under way, so that import cannot bring the pack back; an import asked after a Clear installs and writes only once that Clear has run, so the Clear never wipes it (LATER 309, `packWorkQueue`'s `importing`). Two imports with no Clear between them still land in the order they finish: the one that finishes last is on.
- A mapped model drawn only through facade nodes -- a flare, a star, the moon -- is never swapped (those draws stay on the billboard path), though the status line lists the model as on (#410's re-check F5).
