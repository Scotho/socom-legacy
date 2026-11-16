/**
 * The community plugin loader (design sections 2, 3 and 5). Product-track adaptation. It runs in the match child,
 * and only when `pluginRuns` is true. `plugin/main.js` is imported in a host-owned worker after a text scan.
 * The match thread posts JSON and reads JSON. It does not import the module.
 * A declared pack that fails `validatePack` or `packDigest` refuses that match: the caller exits 0 after
 * `bootFailed`, not 2, not 75, and this module does not write `last-exit.json`.
 *
 * Stage 1 is a text scan, not a sandbox. It refuses import specifiers and the identifiers `process`,
 * `getBuiltinModule`, `binding`, `dlopen`, `globalThis`, `require`, `module.createRequire`, `eval` and
 * `Function(`. It does not refuse `global` (Node's alias of `globalThis`) or `(function(){}).constructor(...)`.
 * Those are the same bypass class. The known bypass class is `process.getBuiltinModule` (Node 22+): no specifier
 * at all, and the same forms `process.binding`, `process.dlopen` and `globalThis.process`. The plugin runs as the
 * match child's uid, so a form the scan misses can read `/var/lib/s2u`. `S2U_COMMUNITY_PLUGINS=1` must not be
 * turned on for any host that runs third-party plugins until stage 2 lands: a separate process under Node's
 * permission model, or an equivalent. It does not use `vm`.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import {
  ENGINE_CONTRACT_VERSION, PACK_RULES_MEMBER_BYTES_ADAPTATION, PACK_TARGET_US, PLUGIN_MAIN_PATH, packDigest, validatePack,
  type PackContext, type PackFile,
} from '@s2u/creator-contracts';
import { RuleHost } from '../rules/host';
import { PLUGIN_BLOCKED_SPECIFIERS, PLUGIN_WORKER_HEAP_MB_ADAPTATION, pluginRuns, type PluginPort, type PluginRound } from './limits';
import { pluginReplyJson } from './reply';

export interface DeclaredPlugin {
  readonly id: string;
  readonly version: string;
  /** `packDigest` of the manifest, the pin the server declared. */
  readonly hash: string;
  /** File URL of `plugin/main.js` on the operator's disk. The bytes must be the member's. */
  readonly moduleUrl: string;
  readonly files: readonly PackFile[];
}

export type PluginRefusal = 'validatePack' | 'packDigest' | 'import';

export type PluginOpen =
  | { readonly ok: true; readonly host: RuleHost | null }
  | { readonly ok: false; readonly refused: PluginRefusal; readonly specifiers?: readonly string[] };

/** The contract a plugin is checked against: the engine version this build publishes. */
export function pluginPackContext(): PackContext {
  return { target: PACK_TARGET_US, contract: ENGINE_CONTRACT_VERSION };
}

const SPECIFIER = /(?:\bimport\s+(?:[^'";]*?\s+from\s+)?|\bimport\s*\(\s*|\bexport\s+[^'";]*?\s+from\s+|\brequire\s*\(\s*)['"]([^'"]+)['"]/g;
/** Identifiers that reach a built-in with no import specifier. `Function(` is the constructor, not the keyword `function`. */
const BLOCKED_IDENTIFIERS = ['process', 'getBuiltinModule', 'binding', 'dlopen', 'globalThis', 'require', 'eval'] as const;

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/[^\n]*/g, '$1');
}

/** Blank string and template-literal text. `${...}` stays, so an identifier in an expression is still seen. */
function withoutStringLiterals(source: string): string {
  let out = '';
  for (let i = 0; i < source.length; i++) {
    const c = source[i]!;
    if (c === "'" || c === '"') {
      const q = c;
      i++;
      while (i < source.length && source[i] !== q) {
        if (source[i] === '\\') i++;
        i++;
      }
      out += q + q;
      continue;
    }
    if (c === '`') {
      i++;
      while (i < source.length && source[i] !== '`') {
        if (source[i] === '\\') { i += 2; continue; }
        if (source[i] === '$' && source[i + 1] === '{') {
          out += '${';
          i += 2;
          let depth = 1;
          while (i < source.length && depth > 0) {
            if (source[i] === '{') depth++;
            else if (source[i] === '}') depth--;
            if (depth > 0) out += source[i];
            i++;
          }
          out += '}';
          continue;
        }
        i++;
      }
      out += '``';
      continue;
    }
    out += c;
  }
  return out;
}

/** Import specifiers and built-in identifiers the text names. Any of them refuses the module. */
export function pluginImportRefusals(source: string): string[] {
  const text = withoutComments(source);
  const found = new Set<string>();
  for (const match of text.matchAll(SPECIFIER)) found.add(match[1]!);
  for (const call of text.match(/\bimport\s*\(\s*([^)]*)\)/g) ?? []) {
    if (!/['"]/.test(call)) found.add('import()');
  }
  const code = withoutStringLiterals(text);
  for (const name of BLOCKED_IDENTIFIERS) {
    if (new RegExp(`\\b${name}\\b`).test(code)) found.add(name);
  }
  if (/\bmodule\s*\.\s*createRequire\b/.test(code)) found.add('module.createRequire');
  if (/\bFunction\s*\(/.test(code)) found.add('Function(');
  const blocked = (spec: string): boolean => PLUGIN_BLOCKED_SPECIFIERS.some((name) => spec === name || spec.startsWith(`${name}/`) || spec === name.slice('node:'.length));
  return [...found].sort((a, b) => Number(blocked(b)) - Number(blocked(a)) || (a < b ? -1 : 1));
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** How long a worker may take to import the module before the match is refused. An adaptation, not a game value. */
export const PLUGIN_LOAD_MS_ADAPTATION = 2_000;

const WORKER_URL = new URL('./pluginWorker.mjs', import.meta.url);

interface WorkerMessage { t: string; id?: number; ok?: boolean; json?: string }

/** One worker. `ready` resolves once the module has loaded, or failed. */
function openWorker(moduleUrl: string): { port: PluginPort; ready: Promise<boolean> } {
  const worker = new Worker(WORKER_URL, {
    workerData: { moduleUrl },
    resourceLimits: { maxOldGenerationSizeMb: PLUGIN_WORKER_HEAP_MB_ADAPTATION },
  });
  let seq = 0;
  const pending = new Map<number, { ok: (value: unknown) => void; fail: () => void }>();
  let settleReady: (ok: boolean) => void = () => undefined;
  const ready = new Promise<boolean>((resolve) => { settleReady = resolve; });
  const failAll = (): void => {
    for (const slot of pending.values()) slot.fail();
    pending.clear();
  };
  worker.on('message', (msg: WorkerMessage) => {
    if (typeof msg !== 'object' || msg === null) return;
    if (msg.t === 'ready') { settleReady(msg.ok === true); return; }
    if (msg.t !== 'reply' || msg.id === undefined) return;
    const slot = pending.get(msg.id);
    pending.delete(msg.id);
    if (!slot) return;
    if (!msg.ok || typeof msg.json !== 'string') { slot.fail(); return; }
    const value = pluginReplyJson(msg.json);
    if (value === null) { slot.fail(); return; }
    slot.ok(value);
  });
  worker.on('error', () => { settleReady(false); failAll(); });
  worker.on('exit', () => { failAll(); });
  const port: PluginPort = {
    ask(input) {
      const id = ++seq;
      return new Promise((ok, fail) => {
        pending.set(id, { ok, fail: () => fail(new Error('plugin')) });
        worker.postMessage({ t: 'ask', id, input });
      });
    },
    terminate() { void worker.terminate(); },
  };
  return { port, ready };
}

/**
 * Workers import `sourceUrl`, a `data:` URL of the bytes that passed the scan. They never import a path, so a
 * file replaced on disk after the check is not the file that runs.
 */
export function pluginWorkers(sourceUrl: string): PluginRound & { prove(ms: number): Promise<boolean> } {
  let ready: PluginPort | null = null;
  return {
    openRound() { return openWorker(sourceUrl).port; },
    takeReady() { const port = ready; ready = null; return port; },
    async prove(ms) {
      const opened = openWorker(sourceUrl);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timed = new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), ms); });
      const ok = await Promise.race([opened.ready, timed]);
      if (timer) clearTimeout(timer);
      if (!ok) { opened.port.terminate(); return false; }
      ready = opened.port;
      return true;
    },
  };
}

/**
 * The checked source, as a module URL, or null when the text is over the rules member's bound or cannot be
 * encoded. The worker imports this, not the operator's path.
 */
export function pluginSourceUrl(source: string): string | null {
  if (Buffer.byteLength(source) > PACK_RULES_MEMBER_BYTES_ADAPTATION) return null;
  try {
    return `data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`;
  } catch {
    return null;
  }
}

/**
 * Validate and load one declared plugin. Gates off: `{ ok: true, host: null }` and the match stays the retail
 * room. Gates on and the pack or the module fails: `{ ok: false }` and the match does not start. The module is
 * imported in a worker, never on the match thread.
 */
export async function openDeclaredPlugin(o: {
  env: Readonly<Record<string, string | undefined>>;
  declared: DeclaredPlugin;
}): Promise<PluginOpen> {
  if (!pluginRuns(o.env)) return { ok: true, host: null };
  const validated = await validatePack(o.declared.files, pluginPackContext());
  if (!validated.ok) return { ok: false, refused: 'validatePack' };
  const digest = await packDigest(validated.manifest);
  if (digest !== o.declared.hash || validated.ref.id !== o.declared.id || validated.ref.version !== o.declared.version || validated.ref.hash !== o.declared.hash) {
    return { ok: false, refused: 'packDigest' };
  }
  const kinds = validated.manifest.kinds;
  if (kinds.length !== 1 || kinds[0] !== 'plugin') return { ok: false, refused: 'validatePack' };
  const listed = validated.manifest.files.find((file) => file.path === PLUGIN_MAIN_PATH);
  if (!listed || listed.role !== 'plugin') return { ok: false, refused: 'import' };
  const member = o.declared.files.find((file) => file.path === PLUGIN_MAIN_PATH && !('read' in file));
  if (!member || !('bytes' in member)) return { ok: false, refused: 'import' };
  if (member.bytes.byteLength > PACK_RULES_MEMBER_BYTES_ADAPTATION) return { ok: false, refused: 'import' };
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(member.bytes);
  } catch {
    return { ok: false, refused: 'import' };
  }
  const specifiers = pluginImportRefusals(text);
  if (specifiers.length > 0) return { ok: false, refused: 'import', specifiers };
  let disk: Uint8Array;
  try {
    disk = new Uint8Array(readFileSync(fileURLToPath(o.declared.moduleUrl)));
  } catch {
    return { ok: false, refused: 'import' };
  }
  if (!sameBytes(disk, member.bytes)) return { ok: false, refused: 'import' };
  const sourceUrl = pluginSourceUrl(text);
  if (sourceUrl === null) return { ok: false, refused: 'import' };
  const workers = pluginWorkers(sourceUrl);
  if (!(await workers.prove(PLUGIN_LOAD_MS_ADAPTATION))) return { ok: false, refused: 'import' };
  return { ok: true, host: new RuleHost({ plugin: workers }) };
}
