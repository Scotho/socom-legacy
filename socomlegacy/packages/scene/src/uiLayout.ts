import { rdrGet, type RdrNode } from '@s2u/archive';

/**
 * A menu screen's layout (web sprint 5, S1; socomlegacy/docs/research/95 §2): a compiled dialog `.rdr` of
 * `RUN/UI/READERC.ZAR` -- the ARMORY's is `dlg_equipment_mp.rdr` (58,664 bytes: 226 objects, 12 screen animations, 22
 * controls, 67 model entries) -- as `parseRdr` reads it, turned into typed records. One `SCREENS` record holds
 * `LIBRARIES` (where a `FILENAME` is looked up), `BACKGROUND`, `FONT`, `SCRIPT_LIBRARY` (the `UIZANIM.ZAR` sets),
 * `OBJECTS`, `ANIMATIONS` (the screen's event and button bindings), `CONTROLS` and `MODELS`.
 *
 * The loader's rules (research 95 §2.1): a key lookup is a depth-first, first-match search of the whole subtree
 * (`FUN_0032f0e0` L230255-230299), so **`CHILDOF` resolves inside `SPEC` and at object level alike** (`FUN_00383360`
 * L278258, CHILDOF at L278331; the `SealNSecText`/`EqNText` rows put it outside `SPEC`); `XPOS`/`YPOS` are ints
 * (`FUN_0032e970`); `OPACITY` a float, default 1. A child's position is relative to its parent's. `MODELS`
 * (`FUN_003812b0` L277104-277195): `NAME`, `MODEL`, `AZIMUTH` (default 0), `ELEV` (default 0), `DISTANCE` (default
 * 20.0) -- their use by the preview's camera is `MODEL_CAMERA_READING` (research 95 §8).
 */

/** Where the ARMORY's layout lives (research 95 §5.2). */
export const ARMORY_LAYOUT = { archive: 'RUN/UI/READERC.ZAR', member: 'dlg_equipment_mp.rdr', sounds: 'uisounds.rdr' } as const;

/** An event or a button bound to a script animation. */
export interface UiBinding { event: string | null; button: string | null; animation: string }

export interface UiObject {
  name: string;
  type: string;
  x: number;
  y: number;
  opacity: number;
  /** `CHILDOF`, looked up in `SPEC` and at object level (the first found). */
  parent: string | null;
  filename: string | null;
  /** `SIZE`, or `XSIZE`/`YSIZE`. */
  size: [number, number] | null;
  font: string | null;
  color: [number, number, number] | null;
  scale: number | null;
  /** `CAPTION` as the file spells it: a `_<n>_..._MSG` name, a literal, or blank. */
  caption: string | null;
  /** `UIVAR`'s `NAME`: the variable whose value the object shows (a portrait's texture, a weapon's name). */
  uivar: string | null;
  hcentered: boolean;
  /** A control's bindings (`ANIMATIONS`). */
  bindings: UiBinding[];
  /** The object's whole record, for what the typed fields do not carry (a `TELETYPE`'s `INTERVAL`, `PULSERATE` ...). */
  record: RdrNode;
}

/** A `MODELS` entry: a 3D preview, its model and its camera (`FUN_003812b0`). */
export interface UiModelEntry { name: string; model: string; azimuth: number; elev: number; distance: number }

export interface UiLayout {
  libraries: string[];
  background: string | null;
  font: string | null;
  scripts: string[];
  objects: UiObject[];
  animations: UiBinding[];
  controls: UiObject[];
  models: UiModelEntry[];
}

/** The first match of `key` anywhere under `node`, depth-first (`FUN_0032f0e0`): its value list, unwrapped when single. */
export function findKey(node: RdrNode, key: string, depth = 0): RdrNode | undefined {
  if (!Array.isArray(node) || depth > 16) return undefined;
  for (let i = 0; i < node.length; i++) {
    if (node[i] === key && i + 1 < node.length) {
      const v = node[i + 1]!;
      return Array.isArray(v) && v.length === 1 ? v[0]! : v;
    }
    const inner = findKey(node[i]!, key, depth + 1);
    if (inner !== undefined) return inner;
  }
  return undefined;
}

const str = (n: RdrNode | undefined): string | null => (typeof n === 'string' ? n : null);
const nums = (n: RdrNode | undefined): number[] => (Array.isArray(n) ? n : n === undefined ? [] : [n]).map((x) => (typeof x === 'string' ? Number(x) : NaN));
const numOr = (n: RdrNode | undefined, fallback: number): number => {
  const v = nums(n)[0];
  return v === undefined || !Number.isFinite(v) ? fallback : v;
};
const records = (n: RdrNode | undefined): RdrNode[] => (Array.isArray(n) && typeof n[0] === 'string' ? [n] : Array.isArray(n) ? n : []);
const strings = (n: RdrNode | undefined): string[] => (Array.isArray(n) ? n : n === undefined ? [] : [n]).filter((x): x is string => typeof x === 'string');

function bindings(n: RdrNode | undefined): UiBinding[] {
  return records(n).flatMap((b) => {
    const animation = str(rdrGet([b], 'ANIMATION'));
    return animation === null ? [] : [{ event: str(rdrGet([b], 'EVENT')), button: str(rdrGet([b], 'BUTTON')), animation }];
  });
}

/** Only the object's own keys and its `SPEC`'s: never a nested `ANIMATIONS` binding's. */
function own(record: RdrNode, key: string): RdrNode | undefined {
  const direct = rdrGet([record], key);
  if (direct !== undefined) return direct;
  const spec = rdrGet([record], 'SPEC');
  return spec === undefined ? undefined : rdrGet([spec], key);
}

function object(record: RdrNode): UiObject | null {
  const name = str(rdrGet([record], 'NAME'));
  if (name === null) return null;
  const size = own(record, 'SIZE');
  const xs = own(record, 'XSIZE'), ys = own(record, 'YSIZE');
  const color = own(record, 'COLOR'), scale = own(record, 'SCALE'), uivar = own(record, 'UIVAR');
  const caption = own(record, 'CAPTION');
  return {
    name, type: str(rdrGet([record], 'TYPE')) ?? '',
    x: Math.trunc(numOr(rdrGet([record], 'XPOS'), 0)), y: Math.trunc(numOr(rdrGet([record], 'YPOS'), 0)),
    opacity: numOr(rdrGet([record], 'OPACITY'), 1),
    // CHILDOF at object level or in SPEC: the depth-first search of the whole record finds either.
    parent: str(findKey(record, 'CHILDOF')),
    filename: (() => { const f = str(own(record, 'FILENAME')); return f === null || f.trim() === '' ? null : f; })(),
    size: size !== undefined ? [nums(size)[0] ?? 0, nums(size)[1] ?? 0] : xs !== undefined && ys !== undefined ? [numOr(xs, 0), numOr(ys, 0)] : null,
    font: str(own(record, 'FONT')),
    color: color === undefined ? null : [nums(color)[0] ?? 0, nums(color)[1] ?? 0, nums(color)[2] ?? 0],
    scale: scale === undefined ? null : numOr(scale, 1),
    caption: caption === undefined ? null : Array.isArray(caption) ? strings(caption).join(' ') : caption,
    uivar: uivar === undefined ? null : str(rdrGet([uivar], 'NAME')),
    hcentered: own(record, 'HCENTERED') !== undefined,
    bindings: bindings(own(record, 'ANIMATIONS')),
    record,
  };
}

/** A dialog `.rdr` parsed -> its layout. */
export function parseUiLayout(root: RdrNode): UiLayout {
  const screen = rdrGet(root, 'SCREENS');
  if (!Array.isArray(screen)) throw new Error('dialog has no SCREENS');
  const at = (key: string): RdrNode | undefined => rdrGet([screen], key);
  const bg = at('BACKGROUND');
  return {
    libraries: strings(at('LIBRARIES')),
    background: bg === undefined ? null : str(rdrGet([bg], 'FILENAME')),
    font: str(at('FONT')),
    scripts: strings(at('SCRIPT_LIBRARY')),
    objects: records(at('OBJECTS')).map(object).filter((o): o is UiObject => o !== null),
    animations: bindings(at('ANIMATIONS')),
    controls: records(at('CONTROLS')).map(object).filter((o): o is UiObject => o !== null),
    models: records(at('MODELS')).flatMap((m) => {
      const name = str(rdrGet([m], 'NAME')), model = str(rdrGet([m], 'MODEL'));
      if (name === null || model === null) return [];
      return [{ name, model, azimuth: numOr(rdrGet([m], 'AZIMUTH'), 0), elev: numOr(rdrGet([m], 'ELEV'), 0), distance: numOr(rdrGet([m], 'DISTANCE'), 20) }];
    }),
  };
}
