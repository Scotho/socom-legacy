import { TEST_ROOM_SEGMENT } from '@s2u/ui';
import { routeSegmentsOfPath } from './menuRoutes';

/**
 * Test-room model pack (`TEST_ROOM_MODEL_PACK_ADAPTATION`): a visitor-chosen folder or zip of GLBs, read in the
 * browser and never committed. It swaps the mesh of a prop, a weapon, or one level piece the map already draws.
 * Collision, weapon points and the rest of the game stay on the original. The original has no mod loader. Nothing
 * here runs unless the page is `/testroom` and the address carries `modmodels` (`modelPackActive`).
 */
export const TEST_ROOM_MODEL_PACK_ADAPTATION =
  "a test-room instrument that draws a visitor's private GLB in place of a prop, a weapon, or one level piece: no original, and with the switch off the game draws what it drew before" as const;

/** The query flag. Its presence is enough, the same way `devmode` is read. */
export const MODEL_PACK_PARAM = 'modmodels';

export const MODEL_PACK_FORMAT = 's2u-model-pack';
export const MODEL_PACK_VERSION = 1;
export const MODEL_PACK_MANIFEST = 'models.json';

export const MODEL_PACK_LIMITS = {
  /** `models.json` itself. */
  manifestBytes: 64 * 1024,
  /** How many ids one pack may name. */
  models: 128,
  /** One GLB, actual bytes after the read. The same 500 MiB as the pack, so a remaster of about 40 MB is kept. */
  glbBytes: 500 * 1024 * 1024,
  /** The pack added together. Checked against `File.size` and each member's declared size before those bytes are read. */
  packBytes: 500 * 1024 * 1024,
  /** One texture's longer edge, in pixels. A larger image is not drawn. */
  textureEdge: 4096,
  /** Triangles in one GLB. */
  triangles: 200_000,
} as const;

/** One mapped model. `rotation` is degrees, Euler XYZ. `position` is in the port's units, on the model. */
export interface ModelMapping {
  id: string;
  file: string;
  scale: number;
  rotation: [number, number, number];
  position: [number, number, number];
}

export interface ModelManifest {
  format: typeof MODEL_PACK_FORMAT;
  version: typeof MODEL_PACK_VERSION;
  models: readonly ModelMapping[];
}

export class ModelPackError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'ModelPackError';
  }
}

function fail(reason: string): never {
  throw new ModelPackError(reason);
}

/** The pack cap, before a file or a zip member is read. `size` is `File.size` or the member's declared size. */
export function refusePackBytes(size: number): void {
  if (!Number.isFinite(size) || size < 0 || size > MODEL_PACK_LIMITS.packBytes) {
    fail(`the pack is over ${MODEL_PACK_LIMITS.packBytes} bytes`);
  }
}

/**
 * Whether this address may load a model pack. True only when the path's first segment under `base` is the test
 * room and the query carries `MODEL_PACK_PARAM`. A launcher path, the forge, and `/testroom` without the flag are
 * false. A leading `//` is a path, never a host (`//evil.com/testroom`).
 */
export function modelPackActive(address: string, base = '/'): boolean {
  const b = base.endsWith('/') ? base : `${base}/`;
  const raw = address.replace(/^[\\/]{2,}/, '/');
  let url: URL;
  try {
    url = raw.includes('://') ? new URL(raw) : new URL(raw, `http://page${b}`);
  } catch {
    return false;
  }
  if (routeSegmentsOfPath(url.pathname, b)[0] !== TEST_ROOM_SEGMENT) return false;
  return url.searchParams.has(MODEL_PACK_PARAM);
}

/** A pack-relative path: forward slashes, no `..`, not absolute. Null when it would leave the pack. */
export function canonicalPackPath(raw: string): string | null {
  const path = raw.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
  if (path === '' || path.endsWith('/') || path.split('/').includes('..')) return null;
  return path;
}

function finite(v: unknown, name: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`models.json: ${name} must be a finite number`);
  return v;
}

function vec3(v: unknown, name: string): [number, number, number] {
  if (!Array.isArray(v) || v.length !== 3) fail(`models.json: ${name} must be three numbers`);
  return [finite(v[0], `${name}[0]`), finite(v[1], `${name}[1]`), finite(v[2], `${name}[2]`)];
}

function modelId(v: unknown): string {
  if (typeof v !== 'string') fail('models.json: a model id must be a string');
  const id = v.trim();
  if (id.length < 1 || id.length > 128) fail('models.json: a model id must be 1 to 128 characters');
  if (/[\u0000-\u001f\\/]/.test(id)) fail(`models.json: "${id.slice(0, 40)}" is not a model id`);
  return id;
}

function modelFile(v: unknown): string {
  if (typeof v !== 'string') fail('models.json: a model file must be a string');
  const file = canonicalPackPath(v.trim());
  if (!file || !file.toLowerCase().endsWith('.glb')) fail('models.json: a model file must be a .glb inside the pack');
  return file;
}

/** The manifest, or a `ModelPackError` whose message starts `models.json:`. Unknown fields are ignored. */
export function parseModelManifest(bytes: Uint8Array | string): ModelManifest {
  if (typeof bytes !== 'string' && bytes.byteLength > MODEL_PACK_LIMITS.manifestBytes) fail('models.json: over 64 KiB');
  let json: unknown;
  const text = typeof bytes === 'string' ? bytes : decodeManifest(bytes);
  try {
    json = JSON.parse(text);
  } catch {
    fail('models.json: not JSON');
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) fail('models.json: expected an object');
  const raw = json as Record<string, unknown>;
  if (raw.format !== MODEL_PACK_FORMAT || raw.version !== MODEL_PACK_VERSION) {
    fail('models.json: expected format "s2u-model-pack" version 1');
  }
  if (!Array.isArray(raw.models)) fail('models.json: models must be a list');
  if (raw.models.length > MODEL_PACK_LIMITS.models) fail(`models.json: more than ${MODEL_PACK_LIMITS.models} models`);
  const seen = new Set<string>();
  const models: ModelMapping[] = [];
  for (const entry of raw.models) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) fail('models.json: a model must be an object');
    const row = entry as Record<string, unknown>;
    const id = modelId(row.id);
    const key = id.toLowerCase();
    if (seen.has(key)) fail(`models.json: "${id}" is listed twice`);
    seen.add(key);
    const scale = row.scale === undefined ? 1 : finite(row.scale, `models.${id}.scale`);
    if (scale <= 0) fail(`models.json: "${id}" scale must be greater than 0`);
    models.push({
      id,
      file: modelFile(row.file),
      scale,
      rotation: row.rotation === undefined ? [0, 0, 0] : vec3(row.rotation, `models.${id}.rotation`),
      position: row.position === undefined ? [0, 0, 0] : vec3(row.position, `models.${id}.position`),
    });
  }
  return { format: MODEL_PACK_FORMAT, version: MODEL_PACK_VERSION, models };
}

function decodeManifest(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    fail('models.json: not UTF-8');
  }
}

/** The mapping for `id`, compared without case, or null when this pack does not name it. */
export function mappingFor(manifest: ModelManifest, id: string): ModelMapping | null {
  const key = id.toLowerCase();
  return manifest.models.find((model) => model.id.toLowerCase() === key) ?? null;
}

export interface PackEntry { path: string; bytes: Uint8Array }

/**
 * The pack's files, keyed by their path inside the pack. `models.json` at the root, or inside the one folder a
 * zipped directory adds. `__MACOSX/` is ignored. A path that would leave the pack, a duplicate, a missing manifest
 * or a pack over `MODEL_PACK_LIMITS.packBytes` is a `ModelPackError`.
 */
export function modelPackFiles(entries: readonly PackEntry[]): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  let total = 0;
  for (const entry of entries) {
    const path = canonicalPackPath(entry.path);
    if (!path || path.endsWith('/')) continue;
    if (path === '__MACOSX' || path.startsWith('__MACOSX/')) continue;
    if (files.has(path)) fail(`${path} is listed twice`);
    total += entry.bytes.byteLength;
    if (total > MODEL_PACK_LIMITS.packBytes) fail(`the pack is over ${MODEL_PACK_LIMITS.packBytes} bytes`);
    files.set(path, entry.bytes);
  }
  if (files.has(MODEL_PACK_MANIFEST)) return files;
  const nests = [...files.keys()].filter((name) => name.endsWith(`/${MODEL_PACK_MANIFEST}`));
  if (nests.length === 0) fail('models.json is missing');
  if (nests.length > 1) fail('models.json appears in more than one folder');
  const root = nests[0]!.slice(0, -MODEL_PACK_MANIFEST.length);
  const stripped = new Map<string, Uint8Array>();
  for (const [name, bytes] of files) {
    if (!name.startsWith(root)) fail(`${name} is outside ${root}`);
    stripped.set(name.slice(root.length), bytes);
  }
  return stripped;
}

/** `name` in `files`, or the one entry that matches it without case. */
export function packFile(files: ReadonlyMap<string, Uint8Array>, name: string): Uint8Array | undefined {
  const direct = files.get(name);
  if (direct) return direct;
  const want = name.toLowerCase();
  const hits = [...files.keys()].filter((key) => key.toLowerCase() === want);
  return hits.length === 1 ? files.get(hits[0]!) : undefined;
}
