/**
 * Public status page settings (product track, PST-1; `docs/plans/2026-10-22-public-status.md`). A browser adaptation:
 * nothing the game does changes. No research note and no ledger entry (OT.R53).
 *
 * H295 is open: this slice checks the origin that served the page. It does not name a public hostname, and it does not
 * deploy a Worker, a Pages project or a DNS record. `status.socom2legacy.com` stays the owner's leaning (PST.R8).
 *
 * H296 answered 2026-10-24 (the owner, "approved", on research pass 2's recommendation; OT.R84): a measured median
 * carries a word from `STATUS_LATENCY_BANDS_ADAPTATION`. The door's existing `GET /ping` (PST-3, `packages/host/src/door.ts` `DOOR_PING_PATH`) is timed only
 * when a same-origin `/status-config.json` names an origin for a region. With no file, latency is not measured.
 * Probe origins are never written into the page.
 */

/** How often a visible tab checks again (the plan's poll). */
export const STATUS_POLL_MS_ADAPTATION = 60_000;

/**
 * How long one `/status`, `/health` or `/status-config.json` check may take before it gives up and counts as a network
 * error (the batch review's F3). A product choice, well under one poll, so a hung check cannot hold the next one.
 */
export const STATUS_FETCH_TIMEOUT_MS_ADAPTATION = 10_000;

/** A report older than about two polls is Unknown (the plan's freshness rule). */
export const STATUS_STALE_MS_ADAPTATION = STATUS_POLL_MS_ADAPTATION * 2;

/**
 * PST-4's sample count, the research recommendation: five round trips, the first dropped, the median of the rest.
 * Not a latency-word threshold (those are `STATUS_LATENCY_BANDS_ADAPTATION`).
 */
export const STATUS_LATENCY_SAMPLES_ADAPTATION = 5;

/** Gap between samples, the research recommendation. Tests pass 0. */
export const STATUS_LATENCY_GAP_MS_ADAPTATION = 1_000;

/**
 * Words beside a measured millisecond: Good under 80 ms, OK 80 to 150 ms, High above 150 ms -- the plan's research
 * pass 2 recommendation (`docs/plans/2026-10-22-public-status.md`, H296), approved by the owner 2026-10-24 (HUMAN_TASKS
 * H296). A product choice for browser-HTTP latency, not a game-packet figure; no word for an unmeasured value (PST.R7).
 */
export interface StatusLatencyBands { readonly goodBelowMs: number; readonly okToMs: number }
export const STATUS_LATENCY_BANDS_ADAPTATION: StatusLatencyBands | null = { goodBelowMs: 80, okToMs: 150 };

/**
 * The one region listed today (`packages/central/src/rooms.ts` `BRIEFING_ROOMS_LISTED_ADAPTATION`, US CENTRAL).
 * The card's words. Not a hostname.
 */
export const STATUS_REGION_LABELS_ADAPTATION = ['US Central match server'] as const;
