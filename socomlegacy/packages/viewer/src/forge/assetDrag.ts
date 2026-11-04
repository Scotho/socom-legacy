/** Browser adaptation: a private, revision-bound palette intent, never an asset id supplied by another page. */
export const ASSET_DRAG_MIME = 'application/x-s2u-forge-asset';
export interface AssetDropPoint { at: [number, number, number]; yaw?: number }
export interface AssetDragSnapshot { revision: number; source: object | null; blocked: string | null }
export interface AssetDragPrepared {
  /** True only after the editor's placement promise resolves successfully. */
  commit(): Promise<boolean>;
  /** Release unconsumed work only; successful placement has transferred ownership to the page. */
  dispose(): void;
}
export interface AssetDragOptions {
  snapshot(asset: string): AssetDragSnapshot;
  create(asset: string, point: AssetDropPoint): Promise<AssetDragPrepared | null>;
}
export function createAssetDrag(options: AssetDragOptions) {
  let current: { token: string; asset: string; revision: number; source: object; pending: boolean } | null = null;
  const reason = (intent = current): string | null => {
    if (!intent || intent !== current) return 'Drag an asset from this palette';
    const now = options.snapshot(intent.asset);
    return now.blocked ?? (now.source !== intent.source ? 'This asset is no longer loaded'
      : now.revision !== intent.revision ? 'The layout changed — drag the asset again' : null);
  };
  return {
    begin(asset: string): string | null {
      if (current?.pending) return null;
      current = null;
      const now = options.snapshot(asset);
      if (now.blocked || !now.source) return null;
      current = { token: crypto.randomUUID(), asset, source: now.source, revision: now.revision, pending: false };
      return current.token;
    },
    active: (): boolean => current !== null,
    asset: (): string | null => current?.asset ?? null,
    accepts(token: string): boolean { return !!current && !current.pending && token === current.token && !reason(); },
    reason: (): string | null => reason(),
    cancel(token?: string): void { if (token === undefined || token === current?.token) current = null; },
    end(): void { if (!current?.pending) current = null; },
    async drop(token: string, point: AssetDropPoint | null): Promise<boolean> {
      const intent = current;
      if (!intent || intent.pending || intent.token !== token || reason(intent) || !point
        || point.at.length !== 3 || point.at.some(value => !Number.isFinite(value))
        || (point.yaw !== undefined && !Number.isFinite(point.yaw))) return false;
      // Mark before the first await: the same token cannot construct or commit concurrently.
      intent.pending = true;
      try {
        const prepared = await options.create(intent.asset, { at: [...point.at], ...(point.yaw === undefined ? {} : { yaw: point.yaw }) });
        if (!prepared) return false;
        try {
          if (reason(intent)) return false;
          // The editor owns the actual transaction. Its success consumes the staged piece; the supplied cleanup
          // releases only unconsumed work. Do not check the old revision after our own successful edit advances it.
          return await prepared.commit();
        } finally { prepared.dispose(); }
      } finally { if (current === intent) current = null; }
    },
  };
}
