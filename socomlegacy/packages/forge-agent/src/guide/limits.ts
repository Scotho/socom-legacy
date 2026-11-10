// AX-2 (a browser adaptation, product track; contract C5): the guide's `limits` topic. The values are LIMITS' own
// (forge-agent-protocol), rendered at load, so the text cannot drift from them; the meanings name where each is held.
import {
  CAMERA_SHOT_HOLD_ADAPTATION,
  CAMERA_SHOT_POINTS_ADAPTATION,
  CAMERA_SHOT_SECONDS_ADAPTATION,
  LIMITS,
  RESUME_LIMITS,
} from "@s2u/forge-agent-protocol";
import { PAIR_WAIT_SECONDS } from "../sessions.js";

type LimitKey = keyof typeof LIMITS;

/** What each LIMITS value bounds, and the file that holds it. */
export const LIMIT_MEANINGS: Readonly<Record<LimitKey, string>> = Object.freeze({
  controlBytes: "bytes in one request or answer (JSON); past it CONTROL_TOO_LARGE (protocol parseRequest; the targets' OUTPUT_TOO_LARGE)",
  chunkBytes: "bytes in one transfer chunk: forge.export.chunk's slices, forge.import.chunk's decoded data (protocol ChunkAssembler; forgeTarget.ts)",
  transferBytes: "bytes in one whole transfer: an import, an export, a captured picture (protocol ChunkAssembler; connection.ts capture)",
  transferIdleMs: "ms a staged import may sit between chunks before it is dropped (protocol ChunkAssembler)",
  transferAbsoluteMs: "ms a whole import or export may take (protocol ChunkAssembler; forgeTarget.ts forge.export.chunk)",
  invitationMs: "ms an invitation lives, and the player's approval window from your agent_pair (sessions.ts pair)",
  sessionIdleMs: "ms a pairing may sit unused before it expires, SESSION_EXPIRED (connection.ts permitted)",
  sessionAbsoluteMs: "ms a pairing lives at most, however busy (connection.ts permitted)",
  queuedCommands: "requests one session may have in flight; past it QUEUE_FULL (sessions.ts command; connection.ts)",
  commandsPerSecond: "requests a second, refilled steadily; past it RATE_LIMITED (sessions.ts; connection.ts)",
  commandBurst: "requests that may go at once before the per-second rate applies (sessions.ts; connection.ts)",
  requestMs: "ms one request may take, queue included: QUEUE_TIMEOUT before it reached the page, REQUEST_TIMEOUT after (sessions.ts; connection.ts)",
  receipts: "mutation receipts each page target keeps for request.receipt (viewer/src/agent/forgeTarget.ts, testroomTarget.ts)",
  scenarioMs: "the protocol's scenario bound in ms (the page also stops a scenario at 60 simulation seconds and 30 wall seconds, play.ts)",
  // AX-14: the player's notes from the page (forge-agent/src/sessions.ts noteRefusal; viewer/src/agent/connection.ts sendNote)
  noteChars: "characters in one note the player sends from the page (sessions.ts noteRefusal; connection.ts sendNote)",
  noteIntervalMs: "ms between two notes from the page: at most one a second (sessions.ts noteRefusal)",
  notesQueued: "notes the gateway holds for you undelivered; read them (agent_notes) or they ride your next result (sessions.ts)",
});

export function limitsTopic(): string {
  return [
    "# limits -- rate, queue, sizes, timeouts, lifetimes",
    "",
    "From LIMITS (forge-agent-protocol), exactly:",
    ...(Object.keys(LIMITS) as LimitKey[]).map((key) => "- `" + key + "` = " + LIMITS[key] + ": " + LIMIT_MEANINGS[key]),
    "",
    "In other words:",
    // derived from the values above
    "- An invitation lasts " + LIMITS.invitationMs / 60000 + " minutes; a pairing " + LIMITS.sessionIdleMs / 60000 +
      " minutes idle and " + LIMITS.sessionAbsoluteMs / 3600000 + " hours at most.",
    "- Send at most " + LIMITS.commandsPerSecond + " requests a second (a burst of " + LIMITS.commandBurst + "), with at most " +
      LIMITS.queuedCommands + " waiting; each has " + LIMITS.requestMs / 1000 + " seconds.",
    "",
    "Other bounds, from the code that holds them:",
    "- A page of results: at most 100 items, within the control bound less 4096 bytes (viewer/src/agent/paging.ts).",
    "- `layout.batch`: 1..100 edits (viewer/src/forge/agent/api.ts).",
    "- A scenario: 1..32 steps, each 0..60 seconds, 60 simulation seconds and 30 wall seconds in all (viewer/src/forge/agent/play.ts).",
    "- Held Play inputs: released after 30 seconds wall time (play.ts).",
    "- A camera shot: " + CAMERA_SHOT_POINTS_ADAPTATION.min + ".." + CAMERA_SHOT_POINTS_ADAPTATION.max + " points, " +
      CAMERA_SHOT_SECONDS_ADAPTATION.min + ".." + CAMERA_SHOT_SECONDS_ADAPTATION.max + " seconds, hold " +
      CAMERA_SHOT_HOLD_ADAPTATION.min + ".." + CAMERA_SHOT_HOLD_ADAPTATION.max + " (forge-agent-protocol).",
    "- A Forge operation's arguments: at most 2 MiB of JSON, nested at most 24 deep (api.ts).",
    "- Coordinates: -100000..100000; a text value 160 characters unless its schema says less (api.ts).",
    // REVIEW-1 6: a grant held for a reload's Reconnect counts too (sessions.ts pair, resume)
    "- The gateway: 64 paired, pending or reload-held sessions and 8 per client address by default, an operator setting " +
      "(forge-agent/src/sessions.ts maxSessions, maxSessionsPerAddress).",
    // forge-agent/src/sessions.ts PAIR_WAIT_SECONDS
    "- agent_pair's and agent_wait's waitSeconds: default " + PAIR_WAIT_SECONDS.default + ", at most " + PAIR_WAIT_SECONDS.max +
      "; if your client times out the call first, the pairing is still pending: call agent_wait.",
    // AX-9: RESUME_LIMITS.resumeMs (forge-agent-protocol), held by forge-agent/src/sessions.ts leave/resume
    "- A reload: the pairing is held " + RESUME_LIMITS.resumeMs / 1000 + " seconds for the player's Reconnect " +
      "(RESUME_LIMITS.resumeMs; sessions.ts); meanwhile agent_status reads reloading and requests are refused PAGE_RELOADING.",
  ].join("\n");
}
