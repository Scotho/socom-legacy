import { Zar } from '@s2u/archive';
import { PaletteTable, type Rgba } from '@s2u/gs';
import { flipRows } from './hudAssets';
import { decodeNamedTextures } from './hudBitmaps';
import { fnv1a64 } from './uiGpuTextures';

/**
 * GM-29 (plan `docs/plans/2026-11-01-gpu-menus.md`, row GM-29): the front end's texture banks decoded off the page's main
 * thread, ahead of the dialog that draws them. This module is side-effect free (review fold 3): the page's lookup
 * (`./frontEndAssets`) and the worker's entry (`./frontEndTextureWorker`, the only module that wires `onmessage`) both
 * import it, so importing the library never takes over a worker's messages. PRODUCT TRACK, a browser adaptation: one bank's decode
 * (`uiTextureBank`, moved here from `frontEndAssets.ts` unchanged) serves the page's lookup and this worker alike -- the
 * same functions, so the same bytes -- and the worker decides nothing about what is decoded or drawn. A module worker
 * the page starts with `new Worker(new URL('./frontEndTextureWorker.ts', import.meta.url), { type: 'module' })`
 * (`./frontEndAssets` `pageUiTextureDecoder`), so a build bundles it.
 *
 * One request: a bank's TXR and PAL bytes (copied in: the page keeps its own), the names to decode, and whether to key
 * them. The answer is each name's top-row-first RGBA (`uiTextureBank`'s `decode`; null where it decodes nothing, as the
 * page's lookup caches it) with, when asked, `fnv1a64` of its bytes -- the GPU texture cache's content hash
 * (`uiGpuTextures.ts`), which the page seeds (`seedUiGpuTextureKey`) so a cold dialog's first GPU frame hashes nothing.
 * Every answer's pixels are transferred back, never copied.
 */

/** One bank: its textures by lower-cased name against its own palettes, each bitmap flipped top row first. */
export interface UiTextureBank {
  has(name: string): boolean;
  decode(name: string): Rgba | null;
  /** GM-32: `decode` with what the decode said (`decodeNamedTextures`' diagnostic lines for the name, as asked). */
  diagnose(name: string): { rgba: Rgba | null; diagnostics: string[] };
  /** Its texture names, lower-cased, in the bank's order. */
  readonly names: readonly string[];
  /** A texture's decoded size in bytes (`width x height x 4`, off its record's header), 0 when the bank has no such texture. */
  bytesOf(name: string): number;
  /** The bank's own files, for the prefetch's worker (never written). */
  readonly txr: Uint8Array;
  readonly pal: Uint8Array;
}

/** A bank's lookup (`frontEndAssets.ts`'s `bank`, moved here unchanged so the worker decodes with it). */
export function uiTextureBank(txr: Uint8Array, pal: Uint8Array): UiTextureBank {
  const t = Zar.parse(txr), palettes = PaletteTable.fromZars([Zar.parse(pal)]);
  const keys = new Map((t.find('textures')?.children ?? []).map((k) => [k.name.toLowerCase(), k]));
  const texdat = (n: string): Uint8Array | null => {
    const key = keys.get(n.toLowerCase());
    const child = key ? t.child(key, 'texdat') : undefined;
    return child ? t.data(child) : null;
  };
  const diagnose = (n: string): { rgba: Rgba | null; diagnostics: string[] } => {
    const got = decodeNamedTextures(texdat, palettes, [n]), rgba = got.textures[n] ?? null;
    return { rgba: rgba ? flipRows(rgba) : null, diagnostics: got.diagnostics };
  };
  return {
    has: (n) => keys.has(n.toLowerCase()),
    decode: (n) => diagnose(n).rgba,
    diagnose,
    names: [...keys.keys()],
    bytesOf: (n) => {
      const d = texdat(n);
      return d && d.length >= 4 ? (d[0]! | (d[1]! << 8)) * (d[2]! | (d[3]! << 8)) * 4 : 0;     // research 36 §5: u16 width, u16 height
    },
    txr, pal,
  };
}

/**
 * GM-32: `diagnostics` asks each answer's diagnostic lines (`UiTextureDecoded.diagnostics`, absent unless asked) -- the
 * menus' art (`./menuArt`) takes a prefetched answer only where its decode said nothing, so its `missing` stays the lookup's.
 */
export interface UiTextureDecodeRequest { id: number; txr: Uint8Array; pal: Uint8Array; names: string[]; hash: boolean; diagnostics?: boolean }
export interface UiTextureDecoded { name: string; rgba: Rgba | null; fnv1a64?: string; diagnostics?: string[] }
export type UiTextureDecodeReply = { id: number; ok: true; decoded: UiTextureDecoded[] } | { id: number; ok: false; error: string };

/** One request's answer, and what to transfer with it (each answer's pixel buffer). */
export function answerUiTextureDecode(req: UiTextureDecodeRequest): { reply: UiTextureDecodeReply; transfer: ArrayBuffer[] } {
  try {
    const b = uiTextureBank(req.txr, req.pal);
    const decoded: UiTextureDecoded[] = [], transfer: ArrayBuffer[] = [];
    for (const name of req.names) {
      const got = req.diagnostics ? b.diagnose(name) : null, rgba = got ? got.rgba : b.decode(name);
      const one: UiTextureDecoded = rgba && req.hash ? { name, rgba, fnv1a64: fnv1a64(rgba.data) } : { name, rgba };
      decoded.push(got ? { ...one, diagnostics: got.diagnostics } : one);
      if (rgba) transfer.push(rgba.data.buffer as ArrayBuffer);
    }
    return { reply: { id: req.id, ok: true, decoded }, transfer };
  } catch (e) {
    return { reply: { id: req.id, ok: false, error: e instanceof Error ? e.message : String(e) }, transfer: [] };
  }
}
