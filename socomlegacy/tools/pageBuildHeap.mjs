// The page build's heap rule (LATER 1158; product track, deploy tooling), apart from its launcher (tools/page-build.mjs)
// so the launcher carries no "run directly?" guard (the review of b3beed75d1, finding 1: through a junction or symlink
// such a guard was false and `npm run build` exited 0 without building). Plain JavaScript: the build needs only Node.
//
// The rule: an operator's NODE_OPTIONS that sets the heap wins, as it is; otherwise the heap is PAGE_BUILD_HEAP_SHARE of
// the memory the build may use (the machine's, or a container's limit when lower: finding 2), at most
// PAGE_BUILD_HEAP_CAP_MB (the runner's gate builds at 4096), and only when that is more than Node's own default -- this
// never lowers a heap. EUWEST1 (2 vCPU, 3.8 GB) ran out at Node's default (about 1.9 GB) on v0.4.25's cron build, twice,
// and built with NODE_OPTIONS=--max-old-space-size=3072 (INTAKE 168).
//
// LATER 1210 (HIGH): on a host with no swap the share is too high. FIREHUGE2 (3.9 GB, no swap, the supervisor and web
// beside the build) failed v0.4.26's cron build every run at a 3132 MB heap: the kernel killed vite at "rendering chunks"
// and the launcher said only `build failed`. It built by hand at NODE_OPTIONS 2048 (v0.4.25 at the 2006 MB default). So,
// where /proc/meminfo shows no swap to speak of (under PAGE_BUILD_SWAP_MIN_MB free), the heap is also at most the memory
// available at the start less PAGE_BUILD_NATIVE_RESERVE_MB, kept for what sits outside V8's heap (rollup's and esbuild's
// native memory, the build's other processes; HAZARDS, "--max-old-space-size bounds only V8's heap"). The rule still
// never lowers Node's default. Where meminfo cannot be read (not Linux), the share alone, as before.
//
// What no rule settles (the review of 854159ae78, finding 2): with no swap and under ~3 GB available on a 3.8-3.9 GB box,
// the rule gives Node's default (1945-2006 MB) -- between EUWEST1's known failure at 1945 (LATER 1158) and FIREHUGE2's known
// pass at 2048. Such a host builds with NODE_OPTIONS=--max-old-space-size=2048 or with swap; the kill message says so.

/** The share of the usable memory the build's heap may take (3.8 GB -> 3112 MB, beside the hand-fixed run's 3072). */
export const PAGE_BUILD_HEAP_SHARE = 0.8;
/** The most this rule sets (the runner's gate builds at 4096). */
export const PAGE_BUILD_HEAP_CAP_MB = 4096;
/**
 * LATER 1210: with no swap, the memory available at the start the heap leaves free, MB -- room for the build's native
 * memory (FIREHUGE2 at ~3100 MB free: 2076, beside the 2048 its hand build passed at). A judgment, product track.
 */
export const PAGE_BUILD_NATIVE_RESERVE_MB = 1024;
/** LATER 1210: swap free under this, MB, counts as none. */
export const PAGE_BUILD_SWAP_MIN_MB = 512;

/**
 * `/proc/meminfo`'s MemAvailable and SwapFree, MB; null when either is missing (a kernel before 3.14, not Linux).
 * @param {string | undefined} text
 * @returns {{ availableMb: number, swapFreeMb: number } | null}
 */
export function memInfoMb(text) {
  /** @param {string} name */
  const kb = (name) => {
    const m = new RegExp(`^${name}:\\s+(\\d+) kB$`, 'm').exec(text ?? '');
    return m ? Number(m[1]) : null;
  };
  const available = kb('MemAvailable'), swapFree = kb('SwapFree');
  if (available === null || swapFree === null) return null;
  return { availableMb: Math.floor(available / 1024), swapFreeMb: Math.floor(swapFree / 1024) };
}

/**
 * The heap to give the build, MB, or null to leave Node's: null when `nodeOptions` sets the heap already
 * (`--max-old-space-size` / `--max_old_space_size`, `=` or a space) or when the rule's heap is not over the default.
 * With `mem` showing no swap (LATER 1210), the heap is also at most the memory available less the native reserve.
 * @param {string | undefined} nodeOptions
 * @param {number} usableMb
 * @param {number} defaultMb
 * @param {{ availableMb: number, swapFreeMb: number } | null} [mem]
 * @returns {number | null}
 */
export function pageBuildHeapMb(nodeOptions, usableMb, defaultMb, mem = null) {
  if (/--max[-_]old[-_]space[-_]size[=\s]/.test(nodeOptions ?? '')) return null;
  let heap = Math.min(PAGE_BUILD_HEAP_CAP_MB, Math.floor(usableMb * PAGE_BUILD_HEAP_SHARE));
  if (mem && mem.swapFreeMb < PAGE_BUILD_SWAP_MIN_MB) heap = Math.min(heap, mem.availableMb - PAGE_BUILD_NATIVE_RESERVE_MB);
  return heap > defaultMb ? heap : null;
}

/**
 * LATER 1210: what the launcher prints when vite dies on a signal (the kernel's OOM kill is SIGKILL), in place of a bare
 * `build failed`: the signal, the heap it ran at, the memory free at the start, and the ways round it.
 * @param {string} signal
 * @param {number | null} heapMb the heap the rule set, or null for Node's default (or NODE_OPTIONS's)
 * @param {{ availableMb: number, swapFreeMb: number } | null} mem
 * @returns {string}
 */
export function buildKilledMessage(signal, heapMb, mem) {
  const heap = heapMb === null ? "Node's default heap or NODE_OPTIONS's" : `heap ${heapMb} MB`;
  const free = mem ? `; ${mem.availableMb} MB available and ${mem.swapFreeMb} MB swap free at the start` : '';
  return `page build: vite was killed by ${signal} (${heap}${free}) -- on Linux most likely out of memory (the kernel's OOM ` +
    'killer). Build with a smaller heap (NODE_OPTIONS=--max-old-space-size=2048), add swap, or stop what runs beside it (LATER 1210).';
}

/**
 * The memory the build may use, MB: the machine's, or a container's limit (`process.constrainedMemory`) when that is
 * set and lower. A limit of 0 or one at or over the machine's means none.
 * @param {number} totalBytes
 * @param {number | undefined} constrainedBytes
 * @returns {number}
 */
export function usableMemoryMb(totalBytes, constrainedBytes) {
  const bytes = constrainedBytes && constrainedBytes > 0 && constrainedBytes < totalBytes ? constrainedBytes : totalBytes;
  return Math.floor(bytes / 1048576);
}
