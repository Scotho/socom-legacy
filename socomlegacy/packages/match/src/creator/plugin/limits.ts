/**
 * Community-server plugin bounds (product-track adaptation; the design of 2026-11-12, sections 2, 4 and 5).
 * Nothing here is a game value. The reply window and the miss count are the design's proposed constants, named
 * `*_ADAPTATION` the way the rules budgets are. Off unless the community match child was handed the opt-in.
 *
 * TODO(CM-16): central's modded tier is the other gate, once that tier exists. Until then the design's answer 1
 * allows the image flag alone on a community host. A trusted host never loads a plugin.
 * TODO(CM-15): the operator's install directory is still a proposal (outside the customer workdir, the secrets
 * mount and the outbox). This slice checks bytes the caller already holds. It does not choose a directory.
 */

/** Ticks, counting from the post, in which a reply is applied. 4 ticks at 60 Hz is about 67 ms. */
export const PLUGIN_REPLY_TICKS_ADAPTATION = 4;
/**
 * The worker's old-generation heap, in megabytes. An adaptation, not a game value: one plugin cannot hold the
 * match child's heap (`HOST_CHILD_HEAP_MB_ADAPTATION`, 512).
 */
export const PLUGIN_WORKER_HEAP_MB_ADAPTATION = 64;
/** Late replies in one round before the plugin trips for that round. One late reply is a miss, not a trip. */
export const PLUGIN_MISSES_PER_ROUND_ADAPTATION = 3;

/**
 * The image flag (answer 1). Unset is off. Only the exact text `1` is on. `childEnv` copies it into a community
 * match child and strips it for every other tier. It is not a `HOST_` name: those never reach the child.
 */
export const PLUGIN_OPT_IN = 'S2U_COMMUNITY_PLUGINS';
/**
 * How the match child tells a community host from a trusted one. `HOST_TIER` is stripped with the other `HOST_`
 * names, so the supervisor sets this only when the tier is community.
 */
export const PLUGIN_TIER = 'S2U_MATCH_TIER';

/** Stage 1 refuses these imports. A careless plugin, not a hostile one (section 5). Stage 2 is not built. */
export const PLUGIN_BLOCKED_SPECIFIERS = ['node:fs', 'node:net', 'node:child_process', 'node:worker_threads'] as const;

/** True only in a community match child whose operator turned the flag on. */
export function pluginRuns(env: Readonly<Record<string, string | undefined>>): boolean {
  return env[PLUGIN_TIER] === 'community' && env[PLUGIN_OPT_IN] === '1';
}

/** The hook's input. Plain JSON: a copy of the event, of `RuleRoomView`, and of the rule variables, phase and timers. */
export interface PluginHookInput {
  readonly event: string;
  readonly fields: Readonly<Record<string, number | string>>;
  readonly room: {
    readonly tick: number;
    readonly players: readonly {
      readonly id: number;
      readonly team: string;
      readonly alive: boolean;
      readonly out: boolean;
      readonly feet: readonly [number, number, number];
    }[];
  };
  readonly variables: Readonly<Record<string, number | boolean | string>>;
  readonly phase: string | null;
  readonly timers: readonly { readonly timer: string; readonly owner: string; readonly at: number }[];
}

/** Default export of `plugin/main.js`. The worker passes a JSON clone and the host JSON-parses the reply. */
export type PluginHook = (input: PluginHookInput) => unknown | Promise<unknown>;

/**
 * The match child's side of the worker (design section 5). `RuleHost` posts JSON and reads JSON. It does not
 * import the module. `terminate` drops the worker; the next round opens a fresh one.
 */
export interface PluginPort {
  ask(input: PluginHookInput): Promise<unknown>;
  terminate(): void;
}

/** Opens one worker for a round. The host never sees the module. */
export interface PluginRound {
  openRound(): PluginPort;
  /**
   * A worker already loaded from the checked bytes, taken once. The host uses it before the first tick, so the
   * round's first events are not waiting on the import.
   */
  takeReady?(): PluginPort | null;
}
