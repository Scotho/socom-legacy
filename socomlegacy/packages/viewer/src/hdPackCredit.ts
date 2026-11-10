/**
 * The HD pack's author, credited wherever the project names the pack: the MODS screen's install area and an installed HD
 * pack's row (`./console/adapters/mods`, `./console/render/mods`), and the Thunderstore upload's description and README
 * (`tools/hdPackThunderstore.ts`). A browser adaptation, words only -- nothing the game does (the owner, seat 99,
 * 2026-11-09: "make sure our HD Pack wherever referenced always credit GoE Soul"). The HD manifest
 * (`./hdTexturePack` `HdManifest`) carries no author field, so the HD kind names this one. Its own module, with no
 * imports, so the launcher's boot (which loads the MODS adapter) loads no pack code with it.
 */
export const HD_PACK_AUTHOR = 'GoE Soul';
export const HD_PACK_CREDIT = `HD textures by ${HD_PACK_AUTHOR}`;
