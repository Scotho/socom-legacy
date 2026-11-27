import { appendFileSync, writeFileSync } from 'node:fs';
import type { HitboxTraceSink } from './hitboxTrace';

/**
 * HITBOX-TRACE (a development instrument with no original; product track): the match server's file sink for the room's
 * trace (`./hitboxTrace`), kept apart so the room -- which the page's loopback runs too -- imports nothing of node's.
 */

/** The environment variable naming the room trace's file (JSON lines; made empty when the server starts). */
export const HITBOX_TRACE_ENV = 'S2U_HITBOX_TRACE';

/** Lines held before a write to the file (the file sink's batch). */
const FILE_BATCH = 256;

/** A sink appending JSON lines to `path` (made empty first), written in batches of `FILE_BATCH` lines, on `flush` and at the process's exit. */
export function fileTraceSink(path: string): HitboxTraceSink & { flush(): void } {
  writeFileSync(path, '');
  let held: string[] = [];
  const flush = (): void => { if (held.length) { appendFileSync(path, `${held.join('\n')}\n`); held = []; } };
  process.once('exit', flush);
  const sink = ((line: Record<string, unknown>) => {
    held.push(JSON.stringify(line));
    if (held.length >= FILE_BATCH) flush();
  }) as HitboxTraceSink & { flush(): void };
  sink.flush = flush;
  return sink;
}

/** `S2U_HITBOX_TRACE=<path>` as a room option (the file sink, shared by the server's rooms); unset or empty, nothing. */
export function hitboxTraceRoomOptions(env: Readonly<Record<string, string | undefined>>): { hitboxTrace?: HitboxTraceSink } {
  const path = env[HITBOX_TRACE_ENV];
  return path ? { hitboxTrace: fileTraceSink(path) } : {};
}
