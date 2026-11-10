import { LIMITS } from '@s2u/forge-agent-protocol';
/**
 * FUI-4 (the review's AI-3's words half and AI-15's table; a browser adaptation, FG.R2): the one table from the agent
 * protocol's UPPER_SNAKE refusal and diagnostic codes to the words the Forge's agent dock and its status line show a
 * person. The codes are the wire's own (`forge-agent-protocol`, `./connection`, `./forgeTarget`, `../forge/agent/api`,
 * `../creator`) and stay as they are on the wire; only the person's words come from here. STALE_REVISION and
 * REVISION_CONFLICT name the same condition (the review's AI-15) and read the same sentence here; merging them on the
 * wire is the facade's and the target's (FUI-4's spec names `forge/agent/api.ts` and `agent/forgeTarget.ts` for it).
 * Nothing here changes what the game does.
 */
import type { Diagnosis, DiagnosisClass, RouteCandidates } from '@s2u/forge-agent-protocol';

const CHANGED = 'The editor changed before the agent’s request arrived. It reads the map again and retries.';

/** Every code a person can meet, with its words. A code not listed reads `agentCodeWords`' fallback, never the code alone. */
export const AGENT_CODE_WORDS: Readonly<Record<string, string>> = Object.freeze({
  // the pairing and the session
  NOT_PAIRED: 'The agent is not paired with this page yet.',
  SURFACE_DENIED: 'This screen does not take agent requests (a lobby or a server match holds it).',
  // AX.R8: an older page closes a hidden tab's pairing with PAGE_PAUSED; the code stays known on the wire.
  PAGE_PAUSED: 'Paused when you left this tab. Copy a fresh connect link to continue.',
  // AX-8 (AX.R4): a hidden tab keeps its pairing and refuses only new test work and camera shots.
  PAGE_HIDDEN: 'Paused while this tab is hidden. Come back to the tab to continue tests.',
  PAGE_CLOSED: 'The page closed the connection.',
  // AX-9: a reload keeps the pairing resumable for a short while (RESUME_LIMITS.resumeMs).
  PAGE_RELOADING: 'The page reloaded: press Reconnect to continue with your agent.',
  RESUME_EXPIRED: 'Too long passed since the reload to reconnect. Connect again with a fresh link.',
  RESUME_REFUSED: 'That reconnect is no longer valid. Connect again with a fresh link.',
  SESSION_EXPIRED: 'The agent’s session expired. Copy a fresh connect link to continue.',
  USER_DISCONNECTED: 'You disconnected the agent.',
  CONNECTION_CLOSED: 'The connection closed before the request finished.',
  CONNECTION_BUSY: 'The connection was busy. The agent can try again.',
  STALE_EPOCH: 'The page reloaded since the agent last read it. It reads the page again.',
  UNSUPPORTED_VERSION: 'The agent speaks a version of the connection this page does not.',
  // AX-12: the connection service's refusals the doctor sorts (`./connection` `diagnoseRefusal`, `diagnoseEnd`)
  ORIGIN_DENIED: 'The connection service does not accept this page’s address.',
  CAPACITY: 'The connection service is full right now. Try again shortly.',
  ADDRESS_CAPACITY: 'Too many connections from this network are open. Disconnect one, then try again.',
  INVITATION_EXPIRED: 'The link ran out of time. Copy a fresh one.',
  INVALID_DIAGNOSIS: 'The page’s report of a failed connection was not readable.',
  // the queue and its limits (the connection's own, before a request reaches the editor)
  QUEUE_FULL: 'Too many requests at once: this one was turned away.',
  QUEUE_TIMEOUT: 'The request waited too long behind others and was dropped.',
  RATE_LIMITED: 'The agent sent requests too quickly: this one was turned away.',
  STOP_IN_FLIGHT: 'A stop is already on its way.',
  BUSY: 'The page is still finishing another request. The agent can try again.',
  REQUEST_TIMEOUT: 'The request took too long and was stopped.',
  REQUEST_ID_REUSED: 'The agent repeated a request it had already sent.',
  UNKNOWN_REQUEST: 'The page has no record of that request.',
  // the grants
  PERMISSION_REQUIRED: 'The agent asked for something you have not allowed.',
  PERMISSION_DENIED: 'You did not allow that.',
  REVOKED: 'The pairing ended before the request ran.',
  REPLACED: 'A new pairing replaced this one.',
  DECLINED: 'You declined the agent’s pairing.',
  // the layout's revision
  STALE_REVISION: CHANGED,
  REVISION_CONFLICT: CHANGED,
  REVISION_REQUIRED: 'The agent must read the map before it changes it.',
  INVALID_REVISION: 'The agent named a map version that does not exist.',
  // the request itself
  UNKNOWN_OPERATION: 'The agent asked for something this page cannot do.',
  UNSUPPORTED_OPERATION: 'That is not available on this page.',
  UNSUPPORTED_SURFACE: 'That is not available on this screen.',
  UNSUPPORTED: 'That is not something this page can do here.',
  REFUSED: 'The page refused the request (the status line says why).',
  LOCKED: 'That placement is locked. Unlock it first.',
  GAME_TYPE: 'That plays in another game type: set the game type first (World tab, Settings).',
  INVALID_ARGUMENT: 'The agent’s request was malformed.',
  MISSING_ARGS: 'The agent’s request was missing a value.',
  UNKNOWN_FIELD: 'The agent’s request carried a field this page does not know.',
  INVALID_OBJECT: 'The agent’s request was malformed.',
  INVALID_REFERENCE: 'The agent named a piece or asset that is not here.',
  INVALID_LAYOUT: 'The agent’s layout is not a valid Forge layout.',
  INVALID_CURSOR: 'The agent’s page of results is out of date. It reads again.',
  INVALID_SECTION: 'The agent asked for a part of the session that does not exist.',
  INVALID_RESULT: 'The page could not answer in a form the agent reads.',
  LIMIT_EXCEEDED: 'The request was over the page’s limits.',
  OUTPUT_TOO_LARGE: 'The answer was too large to send.',
  NOT_FOUND: 'The agent named something that is not here.',
  NOT_READY: 'The editor is still loading.',
  PLAY_NOT_READY: 'Play cannot start yet.',
  PLAY_REFUSED: 'Play could not start (the status line says why).',
  BUILD_LOCKED: 'The layout is locked while a lobby holds it.',
  BLOCKED: 'A live server lobby or match holds the editor.',
  OUT_OF_BOUNDS: 'A camera point lies outside the map. Keep the shot inside its bounds.',
  OUT_OF_RANGE: 'A camera direction is too steep for this view. Keep the look below the vertical.',
  // AX-17: the agent's read-only spatial probe (forge.probe).
  PROBE_TOO_LARGE: 'The agent asked to probe too wide an area at once. It probes a smaller one.',
  NO_GROUND: 'This base has no ground to check yet. Open a map or a blank base.',
  PLAYING: 'Stop Play before editing.',
  CANCELLED: 'The request was cancelled.',
  ABORTED: 'The request was stopped.',
  DISPOSED: 'The editor closed.',
  ACTION_FAILED: 'The page could not finish the request.',
  APPLY_FAILED: 'The change could not be applied.',
  ADMISSION_LOST: 'The editor stopped taking placements before the piece was placed.',
  NOT_STAGED: 'That piece was not prepared on this page.',
  DUPLICATE: 'Something of that name is already here.',
  // the canvas
  CAPTURE_UNAVAILABLE: 'The view could not be pictured now (the tab hidden, or nothing drawn yet).',
  CAPTURE_TIMEOUT: 'Picturing the view took too long.',
  CAPTURE_FAILED: 'The view could not be pictured.',
  CAPTURE_TOO_LARGE: 'The picture of the view was too large to send.',
  // local files and packs
  INVALID_PACKAGE: 'The pack is not one this page can read.',
  INVALID_PATH: 'A file in the pack has a path this page does not accept.',
  DUPLICATE_PATH: 'The pack names the same file twice.',
  UNSUPPORTED_FORMAT: 'A file is in a format this page does not read.',
  LOCAL_FILES_UNAVAILABLE: 'Choose a local folder or add files first.',
  STORAGE_FAILED: 'This browser could not store it.',
  DIGEST_MISMATCH: 'A file changed while it was being read.',
  ITEM_TOO_LARGE: 'A file is too large.',
  TRANSFER_TOO_LARGE: 'The transfer is too large.',
  TRANSFER_EXPIRED: 'The transfer took too long and was dropped.',
  TRANSFER_BUSY: 'Another transfer is under way.',
  NO_TRANSFER: 'No transfer is under way.',
  MAP_IMPORT_FAILED: 'The map could not be imported.',
  RECEIPT_LIMIT: 'Too many receipts are kept: an older one was dropped.',
  RECEIPT_CAPACITY: 'Too many receipts are kept: an older one was dropped.',
  INVALID_BASE64: 'The transfer’s data was damaged.',
  CHUNK_ORDER: 'The transfer arrived out of order.',
  INCOMPLETE: 'The transfer ended before all of it arrived.',
  CHUNK_TOO_LARGE: 'Part of the transfer was too large.',
  FRAME_TOO_LARGE: 'A message was too large.',
  CONTROL_TOO_LARGE: 'A message was too large.',
  // FCW-32: the layout's rules (the planner's and the page target's refusals, in the person's words)
  RULES_TOO_LARGE: 'The rules pack is too large for one message: the layout’s chunked import or export carries it.',
  INVALID_RULES: 'The layout’s rules did not check: the change was not made.',
  NO_RULES: 'The layout has no rules yet: make them first.',
  RULES_EXIST: 'The layout has rules already: clear them first.',
  INVALID_FRAME: 'A message was damaged.',
  MESSAGE_SIZE_TOO_SMALL: 'The connection cannot carry messages this large.',
  // diagnostics: kept, but the person is told
  MODELS_SKIPPED: 'Some models were skipped.',
  MAPS_SKIPPED: 'Some maps were skipped.',
  TEXTURES_KEPT_ORIGINAL: 'Some textures were kept as they were.',
  CATALOGUE_TRUNCATED: 'The asset list was cut short.',
  ARCHIVE_NOT_LOADED: 'That map’s assets are not loaded yet.',
  DIAGNOSTICS_LIMIT: 'The placement’s checks were cut short, so the preview is blocked.',
  // REVIEW-1 9: the Forge facade's and the solo room's own refusals (forge/agent/editorFacade, testroom/agent/target)
  MAP_ISSUES: 'Play waits until the map’s issues are fixed.',
  ABSENT_ASSET: 'The agent named an asset that is not on this page.',
  NO_HISTORY: 'There is nothing to undo or redo.',
  NO_MAP: 'Open a map base first.',
  REQUIREMENTS_UNMET: 'The map needs something this page does not have yet (the status line says what).',
  SAVE_REFUSED: 'The save did not go through (the status line says why).',
  EMPTY_CLIPBOARD: 'Nothing is copied yet.',
  AMBIGUOUS_OBJECTIVE: 'More than one objective has that name.',
  UNAVAILABLE: 'That is not available on this page.',
  UNKNOWN_MAP: 'The agent named a map that is not in the list.',
  AMBIGUOUS_MAP: 'More than one map has that name.',
  LOAD_FAILED: 'The map could not be loaded.',
  LOAD_TIMEOUT: 'The map took too long to load.',
  EMPTY_SELECTION: 'Nothing is selected.',
  AMBIGUOUS_DESTINATION: 'More than one place has that name.',
  UNKNOWN_DESTINATION: 'The agent named a place that is not on this map.',
  // AX-14: the note box (the gateway's and the connection's own bounds on a note)
  NOTE_TOO_LONG: `That note is too long: keep it to ${LIMITS.noteChars} characters.`,
  NOTE_RATE_LIMITED: 'Wait a moment before sending another note.',
  NOTE_QUEUE_FULL: 'Your agent has not read your earlier notes yet. Wait for it to catch up.',
  INVALID_NOTE: 'Write a note first.',
});

/** Whether the table has words for `code`. */
export function agentCodeKnown(code: string | null | undefined): boolean {
  return typeof code === 'string' && Object.prototype.hasOwnProperty.call(AGENT_CODE_WORDS, code);
}

/** The person's words for `code`; an unlisted code reads a plain sentence naming it, never the bare code. */
export function agentCodeWords(code: string | null | undefined): string {
  if (agentCodeKnown(code)) return AGENT_CODE_WORDS[code!]!;
  return code ? `The page refused the request (${code}).` : 'The page refused the request.';
}

/**
 * AX-12 (the connection doctor; a browser adaptation): what the agent section says when a connection fails -- one class
 * (`@s2u/forge-agent-protocol` `DIAGNOSIS_CLASSES`, sorted by `./connection`), its words for the person, and its one
 * action. The agent's own next step for each class is the protocol's `DIAGNOSIS_HINTS`. No address, token or SDP is in
 * any of these words.
 */
export type AgentDoctorAction = 'retry' | 'fresh-link' | 'check-service';
/** AX-12: each action's button label; Check the address opens the Connection service disclosure. */
export const AGENT_DOCTOR_ACTIONS: Readonly<Record<AgentDoctorAction, string>> = Object.freeze({
  retry: 'Try again',
  'fresh-link': 'Copy a fresh link',
  'check-service': 'Check the connection service address',
});
export const AGENT_DIAGNOSIS: Readonly<Record<DiagnosisClass, { words: string; action: AgentDoctorAction }>> = Object.freeze({
  'service-unreachable': {
    words: 'The connection service did not answer. It may be down, or this page may name the wrong service.',
    action: 'retry',
  },
  'origin-refused': {
    words: 'The connection service does not accept this page’s address. Check that this page uses the right service.',
    action: 'check-service',
  },
  'service-busy': { words: 'The connection service is busy or limiting requests. Wait a moment, then try again.', action: 'retry' },
  'route-failed': {
    words: 'The direct route between this page and the connection service did not open. A firewall or this network may block it.',
    action: 'retry',
  },
  version: {
    words: 'This page and the connection service speak different versions. Reload the page, or check which service it uses.',
    action: 'check-service',
  },
  expired: { words: 'The link or the session ran out of time.', action: 'fresh-link' },
  revoked: { words: 'The connection was ended by your agent or by the connection service.', action: 'fresh-link' },
  unknown: { words: 'The connection failed for a reason this page could not name.', action: 'retry' },
});
/** AX-12: the Connect moment's small print from one `GET /health`. */
export const AGENT_HEALTH_WORDS = Object.freeze({
  checking: 'Connection service: checking…',
  ready: 'Connection service: ready',
  unreachable: 'Connection service: unreachable',
});
const count = (c: RouteCandidates): string => `${c.host} host, ${c.srflx} srflx, ${c.relay} relay`;
/**
 * AX-12: a failed route's details -- what was tried, as counts of the ICE candidates of each kind this page found and
 * the service offered (host: this device's own; srflx: as the internet sees it; relay: through a TURN server). Never an
 * address.
 */
export function agentRouteDetails(d: Diagnosis): string {
  if (!d.local && !d.remote) return 'Tried: no candidate counts were recorded before the route failed.';
  const parts = [
    d.local ? `this page found ${count(d.local)}` : '',
    d.remote ? `the service offered ${count(d.remote)}` : '',
  ].filter(Boolean);
  const relays = (d.local?.relay ?? 0) + (d.remote?.relay ?? 0);
  return `Tried: ${parts.join('; ')} candidates.${relays ? '' : ' No relay route (TURN) was available.'}`;
}
