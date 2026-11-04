import { universeServiceBase } from '../../universeHost';

/**
 * LR-33 (LR.R27, the owner, 2026-10-27: "the proper central version number label at the top"): central's version, read
 * from the `/health` of the server the page talks to (`universeServiceBase`: the page's own origin, or `?server=`'s host).
 * LATER 534's `version` field is what central should answer (a tag at stage, else the date-sha release name); main's
 * `/health` answers `release` (that same date-sha name, `healthBuild`) and `commit` only until 534 lands, so the read
 * takes `version`, and when it is absent the `release` name as its own kind (it is a date-sha, not comparable with the
 * page's semver, so the header shows it alone) -- never a guess beyond what central says. Unreachable (a
 * refusal, a network error, an answer that is not JSON or names neither) is null: the header then greys the page's own
 * version. A launcher adaptation with no original (OT.R28); nothing of the game.
 */
type Fetch = (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

export interface CentralVersion {
  /** `version`: LATER 534's field (semver or a tag). `release`: only the release name (a date-sha, not comparable with the page's). */
  kind: 'version' | 'release';
  version: string;
}

/** One read: central's version (or release name), or null. Never throws. */
export async function readCentralVersion(base: string, fetchFn: Fetch = (url) => fetch(url, { cache: 'no-store' })): Promise<CentralVersion | null> {
  try {
    const r = await fetchFn(`${base}/health`);
    if (!r.ok) return null;
    const h = await r.json();
    if (typeof h !== 'object' || h === null) return null;
    const o = h as { version?: unknown; release?: unknown };
    const v = text(o.version);
    if (v !== null) return { kind: 'version', version: v };
    const rel = text(o.release);
    return rel !== null ? { kind: 'release', version: rel } : null;
  } catch {
    return null;
  }
}

export interface LiveCentralVersion {
  /** The last answer, or null before one and after a failed one (unreachable). */
  version(): CentralVersion | null;
  /** Asks again; resolves once answered. */
  refresh(): Promise<void>;
  dispose(): void;
}

export interface CentralVersionDeps {
  /** Central's base; absent, the page's (`universeServiceBase`). */
  base?: string;
  fetch?: Fetch;
}

export function liveCentralVersion(notify: () => void, deps: CentralVersionDeps = {}): LiveCentralVersion {
  const win = globalThis.window;
  const base = deps.base ?? universeServiceBase(win?.location.search ?? '', win?.location ?? { protocol: 'http:', host: 'localhost' });
  let current: CentralVersion | null = null;
  let alive = true;
  const ask = (): Promise<void> => readCentralVersion(base, deps.fetch).then((v) => {
    if (!alive) return;
    if (v?.kind !== current?.kind || v?.version !== current?.version) { current = v; notify(); }
  });
  void ask();
  return { version: () => current, refresh: ask, dispose(): void { alive = false; } };
}
