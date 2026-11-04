# Test-room mod loader — foundation

2026-10-18. A **browser adaptation** with no original (`TEST_ROOM_MODS_ADAPTATION`, product track, OT.R53). Dustin asked for a mod loader. This note is the foundation that landed with it: data overrides on the Test Room page, and nothing else. It is not a research note and it claims no parity level. The original has no mod loader; the disc remains the game's data.

The code is `packages/viewer/src/mods/` (`manifest.ts`, `readPackage.ts`, `load.ts`, `override.ts`, `choices.ts`, `store.ts`, `panel.ts`). The file hook is `applyOverrideSource`, called from `sourceCache` in `packages/viewer/src/discSource.ts`. A member of an archive is `packages/archive/src/memberOverride.ts`, asked from the member read. The map worker (`packages/viewer/src/worker.ts`) is the thread that reads the disc for the test room, so the panel posts both tables there (`{ kind: 'mods' }`).

## What a mod is

A zip, or a folder, the visitor picks in the browser. Nothing is bundled, fetched, or committed. `mod.json` sits at the package root, or inside the single folder a zipped directory adds. Any other file is used only when `files` names it. The bytes are substituted for a disc path. They are never executed.

```json
{
  "format": "s2u-mod",
  "formatVersion": 1,
  "id": "hello-notes",
  "name": "Hello notes",
  "version": "0.1.0",
  "author": "Dustin",
  "description": "Replaces one text file.",
  "target": "socom2-us-r0001",
  "files": [{ "path": "NOTES/HELLO.TXT", "file": "HELLO.TXT" }]
}
```

| field | rule |
|---|---|
| `format`, `formatVersion` | `"s2u-mod"`, `1` |
| `id` | 1–64 of `a-z`, `0-9`, hyphen; not at either end |
| `name`, `author`, `description`, `version` | printable ASCII, bounded (`manifest.ts`) |
| `target` | `socom2-us-r0001` only. Anything else is invalid |
| `files[].path` | a disc path. Looked up the way `IsoAssetSource` looks one up: upper case, forward slashes, no `..`. Not together with `archive` |
| `files[].archive`, `files[].member` | one member of that archive. `member` is a ZDB name or suffix, a ZAR find path, or `HUD_PAL.ZED!models/name` for a key inside a ZDB member |
| `files[].file` | a file in the package, not `mod.json` |

A field this format does not name, including an older `priority`, is ignored. A bad manifest is one row: `invalid:` and the reason (`mod.json: …`). The other mods still load. Caps: 32 files, and 64 KiB for `mod.json`. A file's size is not capped. A map archive is about 16 MiB (`M51`, `M61`, `M71`, `M72` are 16.0–16.5) and `SOUNDS/BNKSTORE.ZAR` is 64 MiB; a 16 MiB file cap and a 32 MiB package cap refused those. The browser's storage quota is the limit. A full store refuses the new package, leaves what was already kept, and the row says so.

## Decisions, 2026-10-18, decided by Dustin

1. **Target.** A mismatch is a hard refusal. The row is `invalid:` and the reason names the target. Only `socom2-us-r0001` is accepted for now.
2. **Order.** The panel order is the only order. `priority` is not part of the manifest. Mods apply top to bottom, so the lower mod wins a conflict. The panel still flags every conflict and names which mod wins.
3. **Added files.** A mod may add a path the disc does not have. `list`, `extents`, `extent`, `size`, `read`, `readRange`, `stream` and `fileBlob` all see that path. The panel marks `added` apart from `replaces`. An added file has no disc sector: `extents` lists it at LBN `0x7fffffff` (`MOD_ADDED_FILE_LBN`), past any PS2 image. A replacement keeps the disc's sector and takes the mod's length when that length differs.
4. **Reload.** Turning a mod on or off, or reordering, does not reload the map. The panel shows "Reload map to apply" and a button. The button reloads the map that is already open. In solo play that reload also opens the ARMORY again once the screen's new data has landed and the loading screen is down. Opening on the data alone did not stay: the load seats the offline match on the previous screen, and the fresh data closes that screen, which starts the room. Restoring what this browser kept does not show the prompt.
5. **Keeping mods.** This browser keeps the file bytes, the order and the switches in IndexedDB (`s2u.testRoomMods`, `store.ts`). Remove deletes that mod's stored bytes. A full store refuses the new package, leaves what was already kept, and the row says: "This browser has no room left to keep this mod. Remove a mod or free some space, then try again."
6. **Archive members.** A mod may replace or add one file inside an archive the reader already parses. That includes a member of a map `ZDB`. A map loads those members out of the archive, and the archive carries its own copies of files that also exist loose (`MP61.ZDB` holds `RUN\COMMON\HUD_PAL.ZED` and `RUN\UI\…`). Overriding the loose file does not change what the map loads. The member override names the archive and the member (`archive`, `member`, `file` on a `files` entry). A key inside that member is `HUD_PAL.ZED!models/name`. See "Archive members" below.

## Scope: the owner's ruling, 2026-10-19 (`MODS_SCOPE_ADAPTATION`)

The owner, in the merge controller's seat, asked whether mods should be available outside development builds: **"Release too, offline or forge lobbies only for now."** Then, the same evening: **"actually, test room online is fine if you can differentiate that from a lobby match through the standard ui paths sanely".** The "Decisions" above are the contributor's; this one is the owner's.

- **In every build.** The panel ships in a release, as the test room does.
- **Allowed:** the test room offline (solo) and online (`/testroom` joining a server room directly), and forge lobbies. **Forge lobbies are allowed, not built:** the forge page never loads the panel, and its match workers are never sent the tables, so a forge lobby reads the disc as before.
- **Refused: a lobby match reached through the standard UI paths** -- the front end's ONLINE flow, the console launcher's lobbies and rooms, an invite, a game placed through the lobby. The distinction is the page and its worker, not a guess from the URL: those paths hand over inside the front end's page (`lobbyMatch.ts`), which never loads `./main` or the panel, and their workers (`matchMount.ts` `matchLoader`) are new instances whose tables stay null. The override module itself is loaded there (`discSource.ts`, `worker.ts`), as a no-op: only the panel and the test room's map worker ever install or send a table (pinned by `test/modsScope.test.ts` (a), (a2) and (b)).
- **Refused: the console's replay viewer** framing `/testroom?replayview` (MU.R15): `main.ts` mounts no panel there (`REPLAY_WORLD`), because a replay was recorded without mods and drawing it with them would misreport what was played (pin (c)).
- **A boot with no mods** opens no store: the IndexedDB library is opened only once the page's flag `s2u.testroom.mods.v1` says a mod is kept (`lazyModLibrary`), and `ready` waits at most `MODS_READY_WAIT_ADAPTATION` (2 s) before the boot goes on with mods off and the panel says so. The disc listing is asked only while a mod is held (`wantsDisc`).
- **A pick is bounded before it is read:** a folder at most 64 files and 2 GiB, a zip at most 2 GiB (`MOD_PICK_LIMITS`).

## Load order

The visitor's order is the list in the panel. Top is first. **The lower row wins.** Both mods stay loaded. The panel names the path, the winner, and the losers. A disabled mod does not override and does not conflict. **Enable mods** is the master switch. Off, the override table is empty and the conflicts stay on the panel.

## The hook

`sourceCache` (`discSource.ts`) is the factory the map worker, the movie worker and the forge worker use. It returns `applyOverrideSource(source)`.

- No table installed: that function returns `source`. `read` is the disc reader's own method. A read is the bytes that reader already returned, the same array.
- A table: a wrapper answers a path it holds and does not call the disc for that path. A full read is a view of the stored bytes, not a copy: copying a 16 MiB archive on every member slice was copying it again. `readRange` and `stream` copy only the span they were asked for. Every other path is delegated. `list` and `extents` gain a path the disc does not have, and return the disc's own array when nothing was added or resized. `extent` answers an added path and, for a replacement, the disc's sector. `size` and `fileBlob` follow the same rule when the reader has them.

The table is per JavaScript realm. The panel installs it on the page and posts it to the test room's map worker. The worker answers `{ kind: 'mod-disc' }` with the open source's own listing, so the panel can mark `added` and `replaces`. The panel asks only while a mod is held (`wantsDisc`): after a mod is added, and again when a disc or the served tree opens. The movie worker and the forge are not posted to. `openDisc` (the page's probe of `SYSTEM.CNF`) does not go through `sourceCache`. The front end never mounts the panel (`main.ts` is the test room's module); see "Scope" above for where mods reach.

The panel's read line names an active override and a short look at its bytes. It used to read a stand-in disc, which reported a loose file as `disc:` while the only live override was a map archive. With no override active it says so. It is not a second hook.

## What is stored

Database `s2u.testRoomMods` (`store.ts`): one record per package (the files, including `mod.json`) and one record for `{ version, enabled, order, disabled }`. The factory is `pageIndexedDb` in `pageStore.ts`. Nothing is written to `localStorage`. Texture packs stay in `s2u.texturePacks`. A visit with no store can still hold mods in memory; a write then says the store is unavailable. Remove deletes that package's bytes. The choices record is the order and the switches, and it is rewritten when they change.

## Archive members

`memberOverride.ts` holds the table. `zdbSlice` / `zdbMember`, `Zar.data`, `readZdbMember`, `readZarMembers`, the loading screen's ranged open, and `mapIndex`'s ranged `READERM.ZAR` all ask it. `turrets.ts` reads a GEO library through `zdbSlice` rather than slicing the TOC offset itself. Nothing is written back to the archive.

With no table, those functions return the same subarray they returned before. A whole-archive read is tagged only while the table is installed, and only then does `parseZdb` append a member the file does not have, or `Zar.parse` graft a key onto the in-memory tree. `keyCount` stays the file's own count.

A ZDB member matches the way `zdbEntry` does: case-insensitive, the whole TOC name or a suffix at a slash (`HUD_PAL.ZED` matches `RUN\COMMON\HUD_PAL.ZED`, and does not match `ZM51_TXR.ZED` when the member is `M51_TXR.ZED`). A ZAR key matches `Zar.find`, exact path, case included.

Name-based reads can add a member: `zdbMember` and `readZdbMember` (including a ranged source), `Zar.find` / `data` after a whole-archive parse, and `readZarMembers`. The bytes are the mod's array. There is no new offset in the file.

These stay on the disc's offset table, so an added member with no name-based read is not visible:

- `SOUNDS/VAGSTORE.ZAR` as the menu music reads it (`menuMusic.ts`). It streams sub-ranges at `dataOffset + key.offset` and never asks for the member as one array. The test room does not post the table to that page anyway.
- A walk that slices `entry.offset` itself and does not call `zdbSlice`. The turret libraries do call it. A test that slices a synthetic archive by hand does not.

`readSoundStreams` does take the whole member once it has found the key, so a replacement (and a file the index does not list, asked for by that name) is the mod bytes. The menu-music stream is the one that is not.

## Out of scope

- Scripting, code mods, `eval`, or loading a module from a package.
- Syncing mods to other players, the match server, or a replay.
- The console, the front end, the forge, and the launch sheet.
- Rebuilding an archive on disk. Member bytes are substituted when the reader asks for that member (decision 6).
- Shipping any Sony, PS2, BIOS, or extracted game file. A fixture is a synthetic text file.

## Checked on the disc, 2026-10-18

At `6c85e539e`, on MP61, with a disc: a zip override of `RUN/LOCALE/STATES/UIMNLOC.ZAR` changed the ARMORY text on screen; a folder override of `RUN/MP61.ZDB` recoloured the map; turning the mods off restored the disc; the conflict row and the invalid row showed; the console had no errors; with no mods the map was identical. The same pass is what found the size caps, the full-file copy, the stand-in read line, and the ARMORY staying shut after a reload.

## Next

1. Post the file table and the member table to the movie worker, and decide whether `openDisc`'s probe should use the hook.
