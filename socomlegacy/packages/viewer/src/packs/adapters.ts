/** Product adaptation: earlier native pack formats project onto the published framework identity. */
import { checkReport, diagnostic, validatePack, type LegacyPackInput, type PackContext, type PackFile, type PackValidation } from '@s2u/creator-contracts';
import { MODEL_PACK_LIMITS, parseModelManifest } from '../modelPack';
import { MOD_LIMITS, parseModManifestBytes } from '../mods/manifest';
import { PACK_LIMITS, validateManifest } from '../texturePack';
export async function validateLegacyPack(kind: 'mod' | 'model' | 'texture', files: readonly PackFile[], context: PackContext,
  options: { slot?: 'primary' | 'second' } = {}): Promise<PackValidation> {
  const path = { mod: 'mod.json', model: 'models.json', texture: 'manifest.json' }[kind];
  const limit = { mod: MOD_LIMITS.manifestBytes, model: MODEL_PACK_LIMITS.manifestBytes, texture: PACK_LIMITS.manifestBytes }[kind];
  const invalid = (error: unknown): PackValidation => ({ ok: false, report: checkReport([diagnostic({
    source: 'pack', severity: 'error', code: 'pack.LEGACY_INVALID', file: path,
    text: error instanceof Error ? error.message : 'The native manifest could not be read.',
  })]) });
  const member = files.find(file => file.path === path);
  if (!member) return invalid(Error(`${path} is missing`));
  const size = 'bytes' in member ? member.bytes.byteLength : member.size;
  if (!Number.isSafeInteger(size) || size < 0 || size > limit) return invalid(Error(`${path} exceeds its native manifest bound`));
  let bytes: Uint8Array;
  if ('bytes' in member) bytes = member.bytes;
  else {
    bytes = new Uint8Array(size);
    let offset = 0;
    // Reader failures remain storage failures. Only malformed/overlong manifest content is a pack diagnostic.
    for await (const chunk of member.read()) {
      if (!(chunk instanceof Uint8Array) || chunk.length > size - offset) return invalid(Error(`${path} exceeds its declared size`));
      bytes.set(chunk, offset); offset += chunk.length;
    }
    if (offset !== size) return invalid(Error(`${path} is shorter than its declared size`));
  }
  let legacy: LegacyPackInput;
  try {
    if (kind === 'mod') legacy = { kind, manifestPath: path, manifest: parseModManifestBytes(bytes) };
    else if (kind === 'model') legacy = { kind, manifestPath: path, manifest: parseModelManifest(bytes),
      id: options.slot === 'second' ? 'model.second' : 'model.current' };
    else legacy = { kind, manifestPath: path, manifest: validateManifest(JSON.parse(new TextDecoder().decode(bytes))) };
  } catch (error) { return invalid(error); }
  // The bounded manifest was already read once. Payload readers flow directly through the framework's one hash path.
  return validatePack(files.map(file => file === member ? { path, bytes } : file), { ...context, legacy });
}
