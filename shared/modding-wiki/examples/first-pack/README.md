# The first-pack example

The worked example of the guide "Making your first pack" (`content/docs/guides/first-pack.mdx`): a small v2 rules
pack, **Half damage (example)**, made up for the wiki. It holds no game data and no third-party art: the rules are
written by hand and the icon is drawn by `draw-icon.mjs`.

| path | what |
|---|---|
| `pack/` | the pack: what goes into the zip |
| `pack/s2u-pack.json` | the v2 manifest: kind `rules`, one member, its sha256 and size |
| `pack/rules/half-damage.json` | the rules: a message at each round's start, every hit at half damage |
| `pack/manifest.json`, `pack/README.md`, `pack/CHANGELOG.md` | Thunderstore's root files, outside the pack's identity |
| `draw-icon.mjs` | draws `pack/icon.png` (256x256): `node draw-icon.mjs`. The PNG and any zip are git-ignored, never committed |

`socomlegacy/tools/test/moddingWikiExample.test.ts` holds these files to the pack contract
(`socomlegacy/packages/creator-contracts/src/packs.ts`): `validatePack` and `checkThunderstorePackage` pass them, the store
manifest is what `thunderstoreManifest` writes, and the guide's quoted files, hash, size and zip commands are these
files'. Change a file here and the guide together, measure the rules file again, and run that test.
