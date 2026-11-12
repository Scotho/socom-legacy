/**
 * What the read-only census tools share for finding the disc and reading their flags (FX-7's `forgePlacementCensus`,
 * `forgeCampaignCensus`, `mapSizeCensus`): the disc as a source, the common flags, and an error with the disc's path
 * taken out. A module that STARTS NOTHING: the tools that import it each start themselves, and a tool that starts itself
 * is imported by no other source (`packages/match/test/entryModules.test.ts`, SA-12c P0). Product track, tools only.
 *
 * The disc: the directory `SOCOM_DISC` (or `<SOCOM_PC_ROOT>/game/disc`), as the disc-backed tests find it
 * (`FsAssetSource`); else the image `SOCOM_ISO`, read by range as `tools/map-validation.ts` reads it (`IsoAssetSource`).
 */
import { closeSync, existsSync, fstatSync, openSync, readSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { AssetSource } from '@s2u/archive';

/** The disc as a source: `SOCOM_DISC` (or `<SOCOM_PC_ROOT>/game/disc`) by directory, else `SOCOM_ISO` by range; null without. */
export async function openDisc(env: NodeJS.ProcessEnv = process.env): Promise<{ source: AssetSource; root: string } | null> {
  const dir = env.SOCOM_DISC ? resolve(env.SOCOM_DISC) : env.SOCOM_PC_ROOT ? join(resolve(env.SOCOM_PC_ROOT), 'game', 'disc') : '';
  if (dir && existsSync(join(dir, 'RUN'))) {
    const { FsAssetSource } = await import('@s2u/archive/node');
    return { source: new FsAssetSource(dir), root: dir };
  }
  const iso = env.SOCOM_ISO;
  if (iso && existsSync(iso)) {
    const { IsoAssetSource } = await import('@s2u/archive');
    // `tools/map-validation.ts`'s range adapter: Node's openAsBlob truncates a size over 4 GiB on this host's Node.
    const fd = openSync(iso, 'r'), size = fstatSync(fd).size;
    process.once('exit', () => closeSync(fd));
    const blob = {
      size,
      slice: (a = 0, b = size) => ({
        arrayBuffer: async () => {
          const bytes = new Uint8Array(b - a);
          let offset = 0;
          while (offset < bytes.length) {
            const n = readSync(fd, bytes, offset, bytes.length - offset, a + offset);
            if (!n) throw new Error('Short ISO read');
            offset += n;
          }
          return bytes.buffer;
        },
      }),
    } as unknown as Blob;
    return { source: new IsoAssetSource(blob), root: iso };
  }
  return null;
}

/** `--json <path>`, `--maps A,B`, and the flags a caller allows; throws on anything else. */
export function parseCensusArgs(argv: readonly string[], flags: readonly string[] = []): { json: string | null; maps: string[] | null; flags: Set<string> } {
  let json: string | null = null, maps: string[] | null = null;
  const on = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--json' || a === '--maps') {
      const v = argv[++i];
      if (!v || v.startsWith('--')) throw new Error(`${a} needs a value`);
      if (a === '--json') json = v; else maps = v.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    } else if (flags.includes(a)) on.add(a);
    else throw new Error(`unknown option ${a}`);
  }
  return { json, maps, flags: on };
}

/** An error's text with the disc's path taken out. */
export function cleanError(e: unknown, root: string): string {
  const text = e instanceof Error ? e.message : String(e);
  return root ? text.split(root).join('<disc>') : text;
}
