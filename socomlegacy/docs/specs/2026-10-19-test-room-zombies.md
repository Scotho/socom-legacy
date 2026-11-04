# Test-room zombies

2026-10-19. A **browser adaptation** with no original (`TEST_ROOM_ZOMBIES_ADAPTATION`, product track, OT.R53). Dustin's Project Phoenix zombies mode, cut down to the playable core and mounted in the test room. **Credit:** Dustin's Project Phoenix, used with permission (OT.R70: the owner cleared the code's licence, 2026-10-22; the licence's name is to be added here once its author states it). It is a mod mode in every build's test room, the online test room among them, and never in a match (OT.R70). This note is not a research note and it claims no parity level. It is a "Phoenix chase/melee/wave simulation, not reconstructed rules of any other game".

The code is `packages/viewer/src/zombies/`. The test room (`packages/viewer/src/main.ts`) is the only page that mounts it, and not in a replay frame
(`REPLAY_WORLD`), as the mod panel and the model pack do not. The front end does not import it.

## What it is

A match on Crossroads (`MP72`), in walk mode, with the body's clips loaded. Zombies spawn out of sight, path around the collision hull, space themselves, climb or jump a short obstacle the player's own mover can cross, and melee when the lane is clear. Waves grow, rest ten seconds, and end the run when the player's health reaches zero. F7, or a map change, clears them. A
reset hands back the walker's lock, the HUD's health and timer and the death overlay only when a run took them; with no
run, F7 and a map load leave the page as it was.

The model and every sound come from a mod the visitor loads with the test-room mod loader (`2026-10-18-test-room-mod-loader.md`). The mode reads one added file, `MODS/ZOMBIES/PACK.ZIP`, through `modOverrideBytes`. It does not fetch, and the pack runs no code.

## The pack

The outer zip is an ordinary mod. `mod.json` adds one file:

```json
{
  "format": "s2u-mod",
  "formatVersion": 1,
  "id": "phoenix-zombies",
  "name": "Phoenix zombies pack",
  "version": "0.1.0",
  "author": "Dustin",
  "description": "The zombies model and sounds.",
  "target": "socom2-us-r0001",
  "files": [{ "path": "MODS/ZOMBIES/PACK.ZIP", "file": "PACK.ZIP" }]
}
```

`PACK.ZIP` is the inner zip (stored or deflated, no zip64):

```text
pack.json
zombie.glb
sounds/*.wav
```

```json
{
  "format": "s2u-zombies-pack",
  "version": 1,
  "model": "zombie.glb",
  "bones": { "head": "Head", "spine": "Spine" },
  "groups": {
    "Groans": ["sounds/a.wav"],
    "Attacks": ["sounds/b.wav"],
    "Deaths": ["sounds/c.wav"]
  },
  "cues": { "round-start": "sounds/round-start.wav", "round-end": "sounds/round-end.wav" }
}
```

| field | rule |
|---|---|
| `format`, `version` | `"s2u-zombies-pack"`, `1` |
| `model` | a path inside the inner zip. glTF 2.0 binary, textures embedded. Clips `idle`, `walk`, `run`, `attack`, `death` |
| `bones.head`, `bones.spine` | optional bone names in that model. Without `head`, a hit uses the root plus 18 units up. Names are never hard-coded |
| `groups` | `Groans`, `Attacks`, `Deaths`, each a non-empty list of paths in the zip |
| `cues` | optional. A cue that is absent, or whose file is absent when it is listed, is silent |

Bounds (`ZOMBIE_PACK_LIMITS`): the inner zip 48 MiB, `pack.json` 64 KiB, the model 32 MiB, one sound 2 MiB, 64 sounds, 128 members, and 64 MiB
inflated over the model and every sound `pack.json` lists, each counted once. Only `pack.json` and the files it lists are
inflated, and each is checked against its cap, and the listed files against the total, by its declared size before it is
inflated; a member the manifest does not name is never read. The model's buffers and images are its own `data:` bytes:
any other `uri` refuses the pack (`model names an address outside the file`), and the loader refuses any address but
`data:` and the `blob:` URLs three makes of embedded images, so nothing is fetched. A bad pack throws `ZombiePackRefusal` and the status line is `Zombies pack refused: <reason>`. No pack at all (the mod table is off, or it has no `MODS/ZOMBIES/PACK.ZIP`) does not start a match: `Zombies needs its mod pack. Open Mods, add the zombies pack, enable it, press Reload map, then press F6.` Off Crossroads: `Zombies runs on Crossroads (MP72) for now.` In a match: `Zombies runs outside a match. Leave the
match, then press F6.` -- a networked match: online or a replay (OT.R70). Before walk mode is ready, F6 does not start and does not start later on its own. The status line is `Zombies starts in walk mode. Press Play, then press F6.` A run under way when one begins stands down:
it lets go of any fire it held and resets, leaving the match its own walker lock, health and timer. The test room's own
offline match (Play mode's loopback) is not a networked one: a start stands it down first, so the two never share the
page, and F7 makes it again (a map load makes its own room).

## How to start

Open `/testroom`, load Crossroads, and enter walk mode (Play). In the panel, Mods: add the outer zip, enable it, Enable mods, Reload map. Then press **Start Zombies (F6)** or the F6 key: the offline match stands down while the run is on. F7 resets and brings the offline match back. With `?devtools` (or `?devmode`) the page also exposes `window.__zombies` with `start`, `reset`, `summary()`, `stats()`, `skipToWave(n)` and `clearWave()`.

F9 is not the start key. On a development build the overlay toggle takes F9 and stops the event. F8 is the playtest mark when a playtest is mounted. F7 was free, so reset stays F7 and start is F6.

## Scope

In this pass: spawns, chase (navigation, traffic, pursuit, obstacle traversal), melee (windup, reach, facing, clear lanes, damage grace), waves (crowd size, live limit, pace, health, the restock break), zombie death, player death (overlay and a movement lock — not the game's death camera), the HUD (round, countdown, health, kills, round cues), and reset on F7 and on map unload.

Bullet penetration is a constant: four bodies, each keeping 0.75 of the damage (`ZOMBIE_BULLET_TARGETS`, `ZOMBIE_BULLET_RETENTION`). The AK-47 hits for 60 and every other firearm for 34. A headshot doubles that. Armored and brute plate geometry is code, not an asset.

## Follow-ups

Not in this pass, and not stubbed: perks; shop and wallet/points economy; barricades; power-ups and drops; weapon upgrade; developer panel and presets; ray gun; Kuda; multiplayer/net sync.
