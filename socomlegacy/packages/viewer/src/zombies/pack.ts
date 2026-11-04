/**
 * The zombies pack inside a test-room mod (`TEST_ROOM_ZOMBIES_ADAPTATION`, product track, OT.R53).
 * The mod adds one file, `MODS/ZOMBIES/PACK.ZIP`. This reader opens that zip and checks the layout.
 * It never fetches, and it never runs anything in the pack. A bad pack throws `ZombiePackRefusal`.
 *
 * Bounds (`ZOMBIE_PACK_LIMITS`): the inner zip 48 MiB, `pack.json` 64 KiB, the model 32 MiB, one sound
 * 2 MiB, 64 sounds, 128 members, and 64 MiB inflated over every file `pack.json` lists. Stored or deflated members only
 * (the zip reader refuses zip64). Only `pack.json` and the files it lists are inflated, each checked against its cap and
 * the total by its declared size first (the review's ask 4: a small zip cannot make it allocate before a check). The
 * model's buffers and images must be its own `data:` bytes (ask 3), so nothing it names is fetched.
 */
import { ZIP_LIMITS, ZipError, bytesSource, openZip, type ZipLimits, type ZipMember } from '../zipReader';

export const ZOMBIE_PACK_PATH = 'MODS/ZOMBIES/PACK.ZIP';
export const ZOMBIE_PACK_FORMAT = 's2u-zombies-pack';
export const ZOMBIE_PACK_VERSION = 1;
export const ZOMBIE_CLIPS = ['idle', 'walk', 'run', 'attack', 'death'] as const;
export const ZOMBIE_GROUPS = ['Groans', 'Attacks', 'Deaths'] as const;

export const ZOMBIE_PACK_LIMITS = {
  archiveBytes: 48 * 1024 * 1024,
  manifestBytes: 64 * 1024,
  modelBytes: 32 * 1024 * 1024,
  soundBytes: 2 * 1024 * 1024,
  sounds: 64,
  members: 128,
  /** Inflated, over the model and every sound `pack.json` lists, each counted once. */
  totalBytes: 64 * 1024 * 1024,
} as const;
export type ZombiePackLimits = {[K in keyof typeof ZOMBIE_PACK_LIMITS]: number};
/** A model buffer or image that is not its own `data:` bytes: three would fetch it. */
export const ZOMBIE_OUTSIDE_MODEL = 'model names an address outside the file';

const ZIP_LIMITS_FOR_PACK: ZipLimits = {
  archiveBytes: ZOMBIE_PACK_LIMITS.archiveBytes,
  members: ZOMBIE_PACK_LIMITS.members,
  centralDirectoryBytes: ZIP_LIMITS.centralDirectoryBytes,
  // A member may be as large as the archive. The model and sound caps are checked after the member is read,
  // so a model over its own cap is refused as a model rather than as a bad zip.
  memberBytes: ZOMBIE_PACK_LIMITS.archiveBytes,
};

export class ZombiePackRefusal extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'ZombiePackRefusal';
  }
}

export interface ZombieBones {
  head?: string;
  spine?: string;
}

export interface ZombiePack {
  glb: ArrayBuffer;
  bones: ZombieBones;
  groups: Record<string, string[]>;
  cues: Record<string, string>;
  sound(path: string): Uint8Array;
}

function refuse(reason: string): never {
  throw new ZombiePackRefusal(reason);
}

function record(value: unknown, reason: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) refuse(reason);
  return value as Record<string, unknown>;
}

/** glTF 2.0 binary: magic, version 2, and the JSON chunk's animation names. Null when it is not that file. */
export function glbClipNames(bytes: Uint8Array): string[] | null {
  if (bytes.byteLength < 20) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2) return null;
  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    offset += 8;
    if (chunkLength < 0 || offset + chunkLength > bytes.byteLength) return null;
    if (chunkType === 0x4e4f534a) {
      let parsed: unknown;
      try { parsed = JSON.parse(new TextDecoder().decode(bytes.subarray(offset, offset + chunkLength))); }
      catch { return null; }
      const body = record(parsed, 'model is not glTF 2.0 binary');
      for (const list of [body['buffers'], body['images']]) {
        if (!Array.isArray(list)) continue;
        for (const item of list) {
          const uri = typeof item === 'object' && item !== null ? (item as { uri?: unknown }).uri : undefined;
          if (uri !== undefined && (typeof uri !== 'string' || !uri.startsWith('data:'))) refuse(ZOMBIE_OUTSIDE_MODEL);
        }
      }
      const animations = body['animations'];
      if (!Array.isArray(animations)) return [];
      const names: string[] = [];
      for (const clip of animations) {
        if (typeof clip === 'object' && clip !== null && typeof (clip as { name?: unknown }).name === 'string') {
          names.push((clip as { name: string }).name);
        }
      }
      return names;
    }
    offset += chunkLength;
  }
  return null;
}

function relativePath(path: unknown): string {
  if (typeof path !== 'string' || path.length === 0 || path.length > 240) refuse('invalid pack.json');
  if (path.startsWith('/') || path.includes('\\') || path.split('/').includes('..')) refuse('invalid pack.json');
  return path;
}

function copyBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

/** Opens the inner pack. Throws `ZombiePackRefusal` for every reason the mode shows the player. `limits` is for tests. */
export async function readZombiePack(bytes: Uint8Array | null | undefined, limits: ZombiePackLimits = ZOMBIE_PACK_LIMITS): Promise<ZombiePack> {
  if (!bytes || bytes.byteLength === 0) refuse('no PACK.ZIP');
  if (bytes.byteLength > limits.archiveBytes) refuse(`pack is over ${limits.archiveBytes} bytes`);
  let zip;
  try { zip = await openZip(bytesSource(bytes), ZIP_LIMITS_FOR_PACK); }
  catch (error) {
    if (error instanceof ZipError) {
      if (error.message === `more than ${ZOMBIE_PACK_LIMITS.members} members`) refuse(error.message);
      refuse('not a zip');
    }
    throw error;
  }
  const members = new Map<string, ZipMember>();
  for (const member of zip.members) if (!member.name.endsWith('/')) members.set(member.name, member);
  // Read on demand: a member is inflated only once `pack.json` names it and its declared size is within its cap.
  const read = async (member: ZipMember): Promise<Uint8Array> => {
    try { return await zip.read(member); }
    catch (error) { if (error instanceof ZipError) refuse('not a zip'); throw error; }
  };
  const manifestMember = members.get('pack.json');
  if (!manifestMember) refuse('no pack.json');
  if (manifestMember.size > limits.manifestBytes) refuse(`pack.json is over ${limits.manifestBytes} bytes`);
  const manifest = await read(manifestMember);
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder().decode(manifest)); }
  catch { refuse('invalid pack.json'); }
  const body = record(parsed, 'invalid pack.json');
  if (body['format'] !== ZOMBIE_PACK_FORMAT) refuse('wrong format');
  if (body['version'] !== ZOMBIE_PACK_VERSION) refuse('wrong version');
  const modelPath = relativePath(body['model']);
  const modelMember = members.get(modelPath);
  if (!modelMember) refuse('model missing');
  if (modelMember.size > limits.modelBytes) refuse(`model is over ${limits.modelBytes} bytes`);

  const bones: ZombieBones = {};
  if (body['bones'] !== undefined) {
    const listed = record(body['bones'], 'invalid pack.json');
    for (const key of ['head', 'spine'] as const) {
      const bone = listed[key];
      if (bone === undefined) continue;
      if (typeof bone !== 'string' || bone.length === 0 || bone.length > 80) refuse('invalid pack.json');
      bones[key] = bone;
    }
  }

  const groupsBody = record(body['groups'], 'invalid pack.json');
  const groups: Record<string, string[]> = {};
  const sounds: string[] = [];
  for (const name of ZOMBIE_GROUPS) {
    const listed = groupsBody[name];
    if (!Array.isArray(listed) || listed.length === 0) refuse(`group empty: ${name}`);
    const paths = listed.map((path: unknown) => relativePath(path));
    groups[name] = paths;
    sounds.push(...paths);
  }
  const cues: Record<string, string> = {};
  if (body['cues'] !== undefined) {
    const listed = record(body['cues'], 'invalid pack.json');
    for (const [name, path] of Object.entries(listed)) {
      if (name.length === 0 || name.length > 64) refuse('invalid pack.json');
      cues[name] = relativePath(path);
      sounds.push(cues[name]);
    }
  }
  if (sounds.length > limits.sounds) refuse(`more than ${limits.sounds} sounds`);
  const soundMembers = new Map<string, ZipMember>();
  for (const path of sounds) {
    const member = members.get(path);
    if (!member) refuse(`sound missing: ${path}`);
    if (member.size > limits.soundBytes) refuse(`sound is over ${limits.soundBytes} bytes`);
    soundMembers.set(path, member);
  }
  // Every listed file counted once by its declared (inflated) size, before any of them is inflated.
  let total = modelMember.size;
  for (const [path, member] of soundMembers) if (path !== modelPath) total += member.size;
  if (total > limits.totalBytes) refuse(`the files pack.json lists are over ${limits.totalBytes} bytes`);

  const model = await read(modelMember);
  const clips = glbClipNames(model);
  if (clips === null) refuse('model is not glTF 2.0 binary');
  for (const name of ZOMBIE_CLIPS) if (!clips.includes(name)) refuse(`missing animation: ${name}`);
  const files = new Map<string, Uint8Array>();
  for (const [path, member] of soundMembers) files.set(path, await read(member));
  return {
    glb: copyBuffer(model),
    bones,
    groups,
    cues,
    sound(path: string): Uint8Array {
      const sound = files.get(path);
      if (!sound) refuse(`sound missing: ${path}`);
      return sound;
    },
  };
}
