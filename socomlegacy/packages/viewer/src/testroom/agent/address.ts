/** Browser adaptation: security attestation of the current address, not launch-setting interpretation.
 * The finite denylist includes room credentials even when this page would otherwise ignore them. */
const NETWORK_KEYS = ['server', 'mp', 'room', 'roomId', 'roomToken'] as const;
const ATTESTED_KEYS = [...NETWORK_KEYS, 'online', 'replay', 'replayview'] as const;
export function attestSoloAddress(search: string): { network: boolean; replay: boolean } {
  try {
    const query = new URLSearchParams(search);
    const values = new Map(ATTESTED_KEYS.map((key) => [key, query.getAll(key)]));
    return {
      network: NETWORK_KEYS.some((key) => (values.get(key)?.length ?? 0) > 0)
        || (values.get('online') ?? []).some((value) => value !== 'off'),
      replay: (values.get('replay')?.length ?? 0) > 0 || (values.get('replayview')?.length ?? 0) > 0,
    };
  } catch { return { network: true, replay: true }; }
}

/** The agent may request the existing preview capability; the caller still validates this actual current route. */
export function modelPreviewAddress(address: string, enabled: boolean): string {
  const url = new URL(address);
  if (enabled) url.searchParams.set('modmodels', '');
  return `${url.pathname}${url.search}`;
}
