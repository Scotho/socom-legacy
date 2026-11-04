import { readCreatorRecord } from '@s2u/creator-contracts';
import { checkRecord, layoutOfRecord, recordOfLayout, type CreatorLayoutRecord, type LayoutRecord } from './record';

/**
 * FORGE: a layout shared with no server (a browser adaptation, no original). The record (v3 since FCW-07a; a v2 code
 * still decodes, migrated) is gzipped and written as base64url, either as a copyable code or as the page URL's fragment
 * (`#forge=`). A link longer than `SHARE_URL_MAX` is not offered: the caller downloads the file instead, never a cut
 * link. Nothing is stored anywhere but the link itself; a pack's content travels as its reference only (H276).
 */

export const SHARE_PREFIX = 'forge=';
/** The whole URL, characters. Past this, chat apps and some browsers truncate, so the file is the share. */
export const SHARE_URL_MAX = 12_000;
/** A code longer than the link budget is refused before it is decoded. */
export const SHARE_CODE_MAX = SHARE_URL_MAX;
/** Gunzipped JSON, bytes. A real record is far smaller; past this the decode stops. */
export const SHARE_GUNZIP_MAX = 1_048_576;

export type ShareOffer = { kind: 'link'; url: string; code: string } | { kind: 'too-big'; length: number };

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Response(bytes as BodyInit).body!.pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Response(bytes as BodyInit).body!.pipeThrough(new DecompressionStream('gzip'));
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const step = await reader.read();
    if (step.done) break;
    total += step.value.byteLength;
    if (total > SHARE_GUNZIP_MAX) {
      await reader.cancel().catch(() => undefined);
      throw new Error('not a forge layout: the share is too large');
    }
    parts.push(step.value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) { out.set(part, at); at += part.byteLength; }
  return out;
}

function b64url(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x1000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(text: string): Uint8Array {
  const pad = text.length % 4 === 0 ? '' : '='.repeat(4 - (text.length % 4));
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** The record a code carries: v3, a v2 record migrated first. */
function v3Of(record: LayoutRecord): CreatorLayoutRecord {
  return 'v' in record ? recordOfLayout(layoutOfRecord(record), record.name) : record;
}

/** The code for `record` (v3; a v2 record migrated first). Throws when `record` is not a record. */
export async function encodeShare(record: LayoutRecord): Promise<string> {
  const why = checkRecord(record);
  if (why) throw new Error(`not a forge layout: ${why}`);
  const json = new TextEncoder().encode(JSON.stringify(v3Of(record)));
  return b64url(await gzip(json));
}

/** The record in `code`, as v3 (a v2 code migrated). Throws when it is not a gzipped v2 or v3 record. */
export async function decodeShare(code: string): Promise<CreatorLayoutRecord> {
  if (code.length > SHARE_CODE_MAX) throw new Error('not a forge layout: the share code is too long');
  let bytes: Uint8Array;
  try { bytes = b64urlDecode(code); } catch { throw new Error('not a forge layout: the share code is not a code'); }
  let text: string;
  try { text = new TextDecoder().decode(await gunzip(bytes)); }
  catch (e) {
    if (e instanceof Error && e.message.includes('too large')) throw e;
    throw new Error('not a forge layout: the share code is not a layout');
  }
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error('not a forge layout: the file is not JSON'); }
  // A record only: a v1 layout file is not a share code's content (`readCreatorRecord` would read one).
  const why = checkRecord(raw);
  if (why) throw new Error(`not a forge layout: ${why}`);
  return readCreatorRecord(text).record;
}

/**
 * Drop a lobby -- the link's path (`.../forge/lobby/<id>`) and an old `lobby` query -- so the link opens the layout, not a
 * lobby. Kept off `URLSearchParams` (the launch-settings scan).
 */
function withoutLobby(pageUrl: string): string {
  const url = new URL(pageUrl);
  const inPath = /^(.*\/forge)\/lobby\/[^/]*\/?$/.exec(url.pathname);
  if (inPath) url.pathname = inPath[1]!;
  const query = url.search.startsWith('?') ? url.search.slice(1) : '';
  const kept = query === '' ? [] : query.split(/[&]/).filter((part) => {
    const eq = part.indexOf('=');
    const raw = eq < 0 ? part : part.slice(0, eq);
    let name = raw;
    try { name = decodeURIComponent(raw); } catch { /* a name that is not encoded stays as written */ }
    return name !== 'lobby';
  });
  url.search = kept.length === 0 ? '' : `?${kept.join('&')}`;
  return url.href;
}

/** `pageUrl` with the code in the fragment, and without a lobby id (the link opens the layout, not a lobby). */
export function shareLink(pageUrl: string, code: string): string {
  const url = new URL(withoutLobby(pageUrl));
  url.hash = SHARE_PREFIX + code;
  return url.href;
}

/** The code in `href`'s fragment, or null when the page was not opened from a share link. */
export function codeFromLocation(href: string): string | null {
  let url: URL;
  try { url = new URL(href); } catch { return null; }
  const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
  if (!hash.startsWith(SHARE_PREFIX)) return null;
  const code = hash.slice(SHARE_PREFIX.length);
  if (!code) return null;
  try { return decodeURIComponent(code); } catch { return code; }
}

/**
 * A link when it fits in `max` characters, otherwise `too-big` (the caller downloads the file and says so).
 */
export async function shareOffer(pageUrl: string, record: LayoutRecord, max = SHARE_URL_MAX): Promise<ShareOffer> {
  const code = await encodeShare(record);
  const url = shareLink(pageUrl, code);
  if (url.length > max) return { kind: 'too-big', length: url.length };
  return { kind: 'link', url, code };
}
