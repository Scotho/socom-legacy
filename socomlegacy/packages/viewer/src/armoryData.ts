import { parseRdr, parseRdrTyped, rdrGet, readZarMembers, readZdbMember, Zar, type AssetSource } from '@s2u/archive';
import { PaletteTable, type Rgba } from '@s2u/gs';
import {
  ARMORY_LAYOUT, ARMORY_SETS, armoryItemScripts, armoryRoster, arsenalOf, assetLibStem, decodeUiSet, FONTS_RDR, missionNameOf, missionValves, parseAnimSets,
  missionUiVarEntries, parseCharacterTable,
  parseFontFaces, parseLocTable, parseUiLayout, parseWorldRoot, UI_MODEL_FILES, UI_MODEL_FORM_READING, UIMNLOC, uiSet, weaponLibrary,
  type ArmoryItemScript, type ArmoryRoster, type Arsenal, type DecodedWeapon, type FontFace, type LocEntry, type UiLayout, type UiProgram,
  type GlobalLighting, type MissionUiVar,
} from '@s2u/scene';
import { decodeNamedTextures } from './hudBitmaps';
import { flipRows } from './hudAssets';
import { ROUND_SCREEN_BITMAPS } from './roundScreens';

/**
 * The pre-round ARMORY's data, read off the disc in the worker for one map (web sprint 5, S1; W5.R3;
 * socomlegacy/docs/research/95 §5), as the sound and the effects are (`./soundData`, `./effectData`): from the player's
 * ISO (`IsoAssetSource`, by range where it can) or from the development tree `extract-maps` serves (`ARMORY_ARCHIVES`
 * beside the maps). Nothing is written into the source.
 *
 * - **the layout**: `RUN/UI/READERC.ZAR/dlg_equipment_mp.rdr` (`parseUiLayout`) and `uisounds.rdr`'s names;
 * - **the scripts**: `RUN/UIZANIM.ZAR` -- the sets the layout's `SCRIPT_LIBRARY` names that the archive holds
 *   (`dlg_equipment_mp.rdr`, `ShowAndSpin.rdr`, `uianim.rdr`, ...), every animation decoded (`decodeUiSet`), and the
 *   item table read off `ShowAndSpin`/`CallWeaponTips` (`armoryItemScripts`, R95.8);
 * - **the strings**: `RUN/LOCALE/STATES/UIMNLOC.ZAR/UIMnLOC.rdr` (`parseLocTable`, UTF-8 decoded);
 * - **the fonts**: `RUN/READERC.ZAR/fonts.rdr`'s two faces (`parseFontFaces`);
 * - **the models**: every `MODELS` entry's model out of `RUN/UI/UI_GEO.ZED` + `UI_MDL.ZED` in the `'bias'` form
 *   (`UI_MODEL_FORM_READING`), and their textures out of `UI_TXR`/`UI_PAL` (not flipped: model textures, as the weapons');
 * - **the light**: `RUN/UI/UI.ZED`'s world root (one directional light, the ambient; research 95 §5.1);
 * - **the bitmaps**: every `FILENAME` the layout names and the background, looked up in its `LIBRARIES` order --
 *   `ui/assetlib/uimp` (`RUN/UI/UIMP_TXR`), `wsmp` and `wslc` (the map archive's `WSMP_TXR`, `WSLC_TXR`; no loose copy),
 *   then the portraits of `UIVAR`/`EQUIPMENT_LIBRARY` (the map's `EMnn_TXR`, named by `mission.rdr` `UiVars`) -- and
 *   the fonts' atlases (`font_titlebar_01.tif` from UIMP; `font_text_01.tif` and `font_special_01.tif` from the map's
 *   `FONT_TXR`), each against its own library's palettes and **flipped** top row first (every 2D bitmap is stored
 *   bottom row first, `./hudAssets`);
 * - **the roster**: the eight columns' types, bodies, kits and portraits (`armoryRoster`).
 *
 * Each part is optional: what will not read is left out and said in `missing`.
 */

/** A decoded preview model and the `MODELS` entries that show it. */
export interface ArmoryModel { model: string; decoded: DecodedWeapon }

export interface ArmoryData {
  archive: string;
  layout: UiLayout | null;
  /** `uisounds.rdr`: TELETYPE -> `.TYPE`, BACK -> `.BACK`, SELECTION -> `.METAL` (research 95 §3.9). */
  uiSounds: [string, string][];
  /** Every animation of the layout's script sets the archive holds, by set, in `SCRIPT_LIBRARY` order. */
  scripts: { set: string; programs: UiProgram[] }[];
  items: ArmoryItemScript[];
  strings: LocEntry[];
  fonts: FontFace[];
  models: ArmoryModel[];
  /** The models' textures, by lower-case name, as stored (not flipped). */
  modelTextures: [string, Rgba][];
  /** The 2D bitmaps, by lower-case name, top row first. */
  bitmaps: [string, Rgba][];
  light: GlobalLighting | null;
  roster: ArmoryRoster | null;
  /**
   * LOBBY-MAPNAME (research 165 §9): `mission.rdr`'s `UiVars` entries, each node's type kept (`missionUiVarEntries` over
   * `parseRdrTyped`) -- what the GAME LOBBY's `AdvanceMPMission` adds to the UI variables. Absent or null when not read.
   */
  missionUiVars?: MissionUiVar[] | null;
  /**
   * The match's world the screen needs, read when asked (`world: true`): `zweapon.rdr`'s arsenal and the map's
   * `mission.rdr` valves (`ENABLE_VALVE_DEFAULTS_READING`, research 182 §2.25) -- the game lobby's page, which has no map
   * loaded (`./lobbyArmory`); the test room's match holds its own (`LoadedMap.arsenal`). Absent when not asked.
   */
  world?: { arsenal: Arsenal; valves: Map<string, number> } | null;
  missing: string[];
}

/** The member names as the archives spell them (research 95 §5.2). */
export const ARMORY_MEMBERS = {
  zanim: 'RUN/UIZANIM.ZAR', world: 'RUN/UI/UI.ZED', txr: 'RUN/UI/UI_TXR.ZED', pal: 'RUN/UI/UI_PAL.ZED',
  uimpTxr: 'RUN/UI/UIMP_TXR.ZED', uimpPal: 'RUN/UI/UIMP_PAL.ZED', zweapon: 'RUN/ZWEAPON.ZAR',
} as const;

/**
 * The popups' panel (web sprint 5 S3; research 95 §4.1 names `popupOp.tif` for popup 47; research 118 §12.4: every
 * record's): read when a library holds it, else named in `missing` (`./armoryLayout` `POPUP_PANEL`).
 */
export const ARMORY_POPUP_BITMAP = 'popupOp.tif';
/** The popups' buttons' focused and normal bitmaps (research 118 §2, §12.4: on all 199 present buttons; ARMORY-UI). */
export const ARMORY_POPUP_BUTTON_BITMAPS = ['active_back.tif', 'pop_butt.tif'] as const;

/** The font atlases the ARMORY draws with, and the library each is in. */
export const ARMORY_FONT_ATLASES = { uimp: ['font_titlebar_01.tif'], FONT: ['font_text_01.tif', 'font_special_01.tif'] } as const;

const why = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** A texture library: its `texdat` by lower-case name, and its own palettes (a library cites its own `_PAL`'s ids). */
interface TextureLibrary { name: string; has(name: string): boolean; decode(names: string[]): { textures: Record<string, Rgba>; diagnostics: string[] } }

function library(name: string, txr: Uint8Array, pal: Uint8Array | null): TextureLibrary {
  const t = Zar.parse(txr), palettes = PaletteTable.fromZars(pal ? [Zar.parse(pal)] : []);
  const keys = new Map((t.find('textures')?.children ?? []).map((k) => [k.name.toLowerCase(), k]));
  const texdat = (n: string): Uint8Array | null => {
    const key = keys.get(n.toLowerCase());
    const child = key ? t.child(key, 'texdat') : undefined;
    return child ? t.data(child) : null;
  };
  return { name, has: (n) => keys.has(n.toLowerCase()), decode: (names) => decodeNamedTextures(texdat, palettes, names) };
}

/**
 * Reads the ARMORY's data for one map off `source`. Never throws: a part that will not read is named in `missing`.
 * `models` false leaves the UI models and their textures out (every map's: the page keeps the first decode); `world`
 * true reads the match's world too (`ArmoryData.world`).
 */
export async function armoryFromDisc(source: AssetSource, mapPath: string, archive: string, opts: { models?: boolean; world?: boolean } = {}): Promise<ArmoryData> {
  const missing: string[] = [];
  const data: ArmoryData = {
    archive, layout: null, uiSounds: [], scripts: [], items: [], strings: [], fonts: [], models: [], modelTextures: [], bitmaps: [],
    light: null, roster: null, missing,
  };
  const whole = async (path: string): Promise<Uint8Array | null> => {
    try { return await source.read(path); } catch (e) { missing.push(`${path}: ${why(e)}`); return null; }
  };
  const members = async (path: string, names: string[]): Promise<Map<string, Uint8Array>> => {
    try {
      const got = await readZarMembers(source, path, names);
      for (const n of names) if (!got.has(n)) missing.push(`${path}: no ${n}`);
      return got;
    } catch (e) { missing.push(`${path}: ${why(e)}`); return new Map(); }
  };
  const mapMember = async (suffix: string): Promise<Uint8Array | null> => {
    try { return await readZdbMember(source, mapPath, suffix); } catch (e) { missing.push(`${mapPath} ${suffix}: ${why(e)}`); return null; }
  };
  const attempt = <T>(what: string, f: () => T): T | null => {
    try { return f(); } catch (e) { missing.push(`${what}: ${why(e)}`); return null; }
  };

  // The layout and the UI sound names.
  const ui = await members(ARMORY_LAYOUT.archive, [ARMORY_LAYOUT.member, ARMORY_LAYOUT.sounds]);
  const layoutBytes = ui.get(ARMORY_LAYOUT.member), soundBytes = ui.get(ARMORY_LAYOUT.sounds);
  if (layoutBytes) data.layout = attempt(ARMORY_LAYOUT.member, () => parseUiLayout(parseRdr(layoutBytes)));
  if (soundBytes) {
    attempt(ARMORY_LAYOUT.sounds, () => {
      // `SOUNDS (TELETYPE (".TYPE") BACK (".BACK") SELECTION (".METAL"))`: a name, then its sound.
      const list = rdrGet(parseRdr(soundBytes), 'SOUNDS');
      if (!Array.isArray(list)) throw new Error('no SOUNDS');
      for (let i = 0; i + 1 < list.length; i += 2) {
        const name = list[i], value = list[i + 1];
        const sound = typeof value === 'string' ? value : Array.isArray(value) && typeof value[0] === 'string' ? value[0] : null;
        if (typeof name === 'string' && sound !== null) data.uiSounds.push([name, sound]);
      }
    });
  }

  // The scripts: the sets the layout names, and the item table.
  const zanim = await whole(ARMORY_MEMBERS.zanim);
  if (zanim) {
    attempt(ARMORY_MEMBERS.zanim, () => {
      const sets = parseAnimSets(Zar.parse(zanim));
      const wanted = data.layout?.scripts ?? [ARMORY_SETS.screen, ARMORY_SETS.spin];
      for (const name of wanted) {
        const set = sets.sets.find((s) => s.name.toLowerCase() === name.toLowerCase());
        if (!set) { missing.push(`${ARMORY_MEMBERS.zanim}: no set ${name}`); continue; }
        data.scripts.push({ set: set.name, programs: [...decodeUiSet(set).values()] });
      }
      data.items = armoryItemScripts(uiSet(sets, ARMORY_SETS.spin), uiSet(sets, ARMORY_SETS.screen));
    });
  }

  // The strings and the fonts.
  const loc = (await members(UIMNLOC.archive, [UIMNLOC.member])).get(UIMNLOC.member);
  if (loc) data.strings = attempt(UIMNLOC.member, () => parseLocTable(parseRdr(loc))) ?? [];
  const readerc = await members(FONTS_RDR.archive, [FONTS_RDR.member, 'character.rdr']);
  const fonts = readerc.get(FONTS_RDR.member);
  if (fonts) data.fonts = attempt(FONTS_RDR.member, () => parseFontFaces(parseRdr(fonts))) ?? [];

  // The preview models and their textures.
  const wantModels = opts.models !== false;
  const geo = wantModels ? await whole(UI_MODEL_FILES.geo) : null, mdl = wantModels ? await whole(UI_MODEL_FILES.mdl) : null;
  const modelTextureNames = new Set<string>();
  if (geo && mdl && data.layout) {
    attempt('UI_GEO/UI_MDL', () => {
      const lib = weaponLibrary(Zar.parse(geo), Zar.parse(mdl), UI_MODEL_FORM_READING);
      const held = new Set(lib.names());
      for (const model of new Set(data.layout!.models.map((m) => m.model))) {
        if (!held.has(model)) { missing.push(`UI_GEO: no model ${model}`); continue; }
        const decoded = lib.decode(model, 'high');
        for (const d of decoded.diagnostics) missing.push(`UI model ${model}: ${d}`);
        for (const t of decoded.textures) modelTextureNames.add(t.toLowerCase());
        data.models.push({ model, decoded });
      }
    });
  }
  // UI.ZED's original library order includes //ui/junkyard before //ui/assetlib/ui.
  // JUNK_TXR holds the SR-25s' direct-colour null_xmas.bmp; it has no PAL archive.
  // Research 95's 2026-10-08 correction: use the UI copy, never a map's substitute.
  const world = await whole(ARMORY_MEMBERS.world);
  if(wantModels && modelTextureNames.size){
    const stems=world ? attempt('UI.ZED assetlibs',()=>[...new Set((Zar.parse(world).find('assetlibs')?.children??[]).map(k=>assetLibStem(k.name)))])??[] : [];
    const modelLibraries:TextureLibrary[]=[];
    for(const stem of stems){
      const txr=await whole(`RUN/UI/${stem}_TXR.ZED`);
      let pal:Uint8Array|null=null;
      try{pal=await source.read(`RUN/UI/${stem}_PAL.ZED`);}catch{/* Direct-colour libraries have no palette; indexed decode reports any required missing palette. */}
      if(txr){const lib=attempt(`${stem}_TXR/${stem}_PAL`,()=>library(stem,txr,pal));if(lib)modelLibraries.push(lib);}
    }
    for(const name of [...modelTextureNames].sort()){
      const lib=modelLibraries.find(l=>l.has(name));
      if(!lib){missing.push(`UI model libraries: no ${name}`);continue;}
      const got=lib.decode([name]);
      for(const d of got.diagnostics)missing.push(`${lib.name}_TXR: ${d}`);
      const rgba=got.textures[name];if(rgba)data.modelTextures.push([name,rgba]);
    }
  }

  // The light.
  if (world) data.light = attempt(ARMORY_MEMBERS.world, () => parseWorldRoot(Zar.parse(world)).lighting);

  // The roster (the map's types, kits and portraits).
  const readerm = await mapMember('READERM.ZAR');
  const zweapon = (await members(ARMORY_MEMBERS.zweapon, ['zweapon.rdr'])).get('zweapon.rdr');
  const characterRdr = readerc.get('character.rdr');
  if (readerm && zweapon && characterRdr) {
    data.roster = attempt(`${archive} roster`, () => {
      const rm = Zar.parse(readerm);
      const script = (n: string) => {
        const k = rm.root.children.find((c) => c.name.toLowerCase() === n);
        if (!k) throw new Error(`READERM.ZAR has no ${n}`);
        return parseRdr(rm.data(k));
      };
      const character = parseRdr(characterRdr), arsenal = arsenalOf(parseRdr(zweapon)), mission = script('mission.rdr');
      const missionKey = rm.root.children.find((c) => c.name.toLowerCase() === 'mission.rdr')!;
      data.missionUiVars = missionUiVarEntries(parseRdrTyped(rm.data(missionKey)));   // LOBBY-MAPNAME: the lobby's UiVars, typed
      // R4B-05: with the mission's name, r0004's valve after the loop (M63's Thermal Scope, `R0004_MISSION_VALVES`).
      if (opts.world) data.world = { arsenal, valves: missionValves(mission, missionNameOf(archive)) };
      return armoryRoster(arsenal, mission, script('chartype.rdr'), character, parseCharacterTable(character));
    });
  }
  if (opts.world && !data.world) data.world = null;

  // The 2D bitmaps, each from the first library in the layout's order that holds it.
  const libraries: TextureLibrary[] = [];
  const add = async (name: string, txr: () => Promise<Uint8Array | null>, pal: () => Promise<Uint8Array | null>): Promise<void> => {
    const t = await txr(), p = await pal();
    if (!t || !p) return;
    const lib = attempt(`${name}_TXR/${name}_PAL`, () => library(name, t, p));
    if (lib) libraries.push(lib);
  };
  await add('UIMP', () => whole(ARMORY_MEMBERS.uimpTxr), () => whole(ARMORY_MEMBERS.uimpPal));
  await add('WSMP', () => mapMember('WSMP_TXR.ZED'), () => mapMember('WSMP_PAL.ZED'));
  await add('WSLC', () => mapMember('WSLC_TXR.ZED'), () => mapMember('WSLC_PAL.ZED'));
  const stem = data.roster?.equipmentStem ?? null;
  if (stem) await add(stem, () => mapMember(`${stem}_TXR.ZED`), () => mapMember(`${stem}_PAL.ZED`));
  await add('FONT', () => mapMember('FONT_TXR.ZED'), () => mapMember('FONT_PAL.ZED'));
  const wanted = new Set<string>();
  const layout = data.layout;
  if (layout?.background) wanted.add(layout.background);
  for (const o of [...(layout?.objects ?? []), ...(layout?.controls ?? [])]) if (o.filename) wanted.add(o.filename);
  for (const c of data.roster?.characters ?? []) if (c.portrait) wanted.add(c.portrait);
  for (const n of [...ARMORY_FONT_ATLASES.uimp, ...ARMORY_FONT_ATLASES.FONT]) wanted.add(n);
  wanted.add(ARMORY_POPUP_BITMAP);
  for (const n of ARMORY_POPUP_BUTTON_BITMAPS) wanted.add(n);
  // The round screens' backdrop and panel (PF.R22, `./roundScreens`): UIMP's copies, handed to the HUD by the page.
  for (const n of Object.values(ROUND_SCREEN_BITMAPS)) wanted.add(n);
  const bitmaps = new Map<string, Rgba>();
  for (const name of wanted) {
    const key = name.toLowerCase();
    if (bitmaps.has(key)) continue;
    const lib = libraries.find((l) => l.has(name));
    if (!lib) { missing.push(`bitmap ${name}: in none of ${libraries.map((l) => l.name).join(', ') || 'no library'}`); continue; }
    const got = lib.decode([name]);
    for (const d of got.diagnostics) missing.push(`${lib.name}: ${d}`);
    const rgba = got.textures[name];
    if (rgba) bitmaps.set(key, flipRows(rgba));
  }
  data.bitmaps = [...bitmaps];
  return data;
}

/** The buffers an `ArmoryData` hands over (the meshes', the bitmaps'), each once. */
export function armoryTransferables(data: ArmoryData): Transferable[] {
  const out = new Set<ArrayBufferLike>();
  for (const [, rgba] of [...data.bitmaps, ...data.modelTextures]) out.add(rgba.data.buffer);
  for (const m of data.models) {
    for (const part of m.decoded.parts) {
      for (const mesh of part.meshes) {
        out.add(mesh.positions.buffer); out.add(mesh.uvs.buffer); out.add(mesh.colors.buffer); out.add(mesh.indices.buffer);
        if (mesh.normals) out.add(mesh.normals.buffer);
        if (mesh.faceNormals) out.add(mesh.faceNormals.buffer);
      }
    }
  }
  return [...out].filter((b): b is ArrayBuffer => b instanceof ArrayBuffer);
}
