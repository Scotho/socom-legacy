// AX-2 (a browser adaptation, product track; contracts C5 and C3): the guide's `refusals` topic, written from one table
// (code -> where it comes from -> the way on). `where` names the file that gives the code. The agent's own table is
// forge-agent-protocol `REFUSAL_HINTS` (the `hint` every refusal carries): every code here has a row there and the way
// here agrees with it, a little richer where the guide has room (test/guide.test.ts holds both).
import { LIMITS } from "@s2u/forge-agent-protocol";

export interface RefusalWay {
  /** The file (or files) that give the code. */
  where: string;
  /** What to do next, for the agent. */
  way: string;
}

const gw = "forge-agent/src/sessions.ts";
const proto = "forge-agent-protocol parseRequest/authorizeRequest";
const conn = "viewer/src/agent/connection.ts";
const forge = "viewer/src/forge/agent/api.ts";
const ft = "viewer/src/agent/forgeTarget.ts";
const tr = "viewer/src/agent/testroomTarget.ts, viewer/src/testroom/agent/target.ts";
const play = "viewer/src/forge/agent/play.ts";
const cam = "viewer/src/forge/camera/driver.ts";
const page = "viewer/src/agent/paging.ts";

export const REFUSAL_WAYS: Readonly<Record<string, RefusalWay>> = Object.freeze({
  // pairing (agent_pair)
  INVALID_PAIR: { where: gw, way: "permissions, when given, must be 1..6 distinct of inspect, edit, import, test, diagnose, capture; clientName a string." },
  INVALID_INVITATION: { where: gw, way: "Pass the whole join link http(s)://<host>/join/<invitation> (no query or fragment) or the invitation alone (1..128 characters, no slash)." },
  INVITATION_EXPIRED: { where: gw, way: "The invitation is unknown, used or past its lifetime: ask the player to copy a fresh join link." },
  TARGET_BUSY: { where: gw, way: "The page already has an agent pending or paired: use that session (agent_status) or ask the player to disconnect it." },
  PAGE_OFFLINE: { where: gw, way: "The page is not connected to the gateway: ask the player to open the agent dock again and copy a new link." },
  CAPACITY: { where: gw, way: "The gateway holds its most sessions: agent_disconnect sessions you no longer use, then retry." },
  ADDRESS_CAPACITY: { where: gw, way: "Your address holds its most sessions: agent_disconnect old ones, then retry." },
  // the binding
  NOT_PAIRED: { where: `${gw}; ${proto}; ${conn}`, way: "No paired session matches: agent_status; if none is paired, pair again." },
  SESSION_AMBIGUOUS: { where: gw, way: "Several sessions are paired: pass the targetId or sessionId of one listed in data.sessions (agent_status lists them too)." },
  STALE_EPOCH: { where: proto, way: "The page reloaded: read agent_status for its new epoch; pair again if the session is gone." },
  REVOKED: { where: `${gw}; ${conn}`, way: "The pairing ended before the request ran: pair again." },
  SESSION_EXPIRED: { where: `${gw}; ${conn}`, way: "Idle or absolute session lifetime reached (topic limits): pair again." },
  PAGE_HIDDEN: { where: conn, way: "The player's tab is hidden: the pairing is kept; running Play inputs, scenarios and camera shots pause and new test work is refused; reads and edits still work, a capture needs the tab in view. Ask the player to bring the tab into view, then send it again." },
  // AX-9: a reload holds the grant for RESUME_LIMITS.resumeMs
  PAGE_RELOADING: { where: gw, way: "The player's page is reloading: wait a few seconds, agent_status until it reads paired, then retry without targetId and epoch." },
  RESUME_EXPIRED: { where: gw, way: "The player's Reconnect came after the reload window: ask for a fresh join link and pair again." },
  RESUME_REFUSED: { where: gw, way: "The page's reconnect ticket was unknown or used: ask for a fresh join link and pair again." },
  // REVIEW-1 11: receipts are per pairing and go with it.
  CONNECTION_CLOSED: { where: conn, way: "The channel closed mid-request (outcome unknown): agent_status. While the same session is still paired, check request.receipt {requestId} before repeating a mutation; if it is gone, pair again and read the page's state again (target.status, forge.read, testroom.read) before redoing a mutation -- its receipt went with the old pairing." },
  // the request
  UNSUPPORTED_VERSION: { where: proto, way: "Send version: 1." },
  UNKNOWN_OPERATION: { where: `${proto}; ${forge}`, way: "Not an operation here: read agent_capabilities (or forge.catalogue operations) for the names." },
  UNKNOWN_AREA: { where: "forge-agent/src/mcp.ts manualDetail", way: "agent_capabilities {area} takes forge, forge-edit, play, testroom, camera, packs or session (data.valid)." },
  UNKNOWN_FIELD: { where: proto, way: "agent_request takes only version, requestId, sessionId, targetId, epoch, expectedRevision, operation, args." },
  MISSING_ARGS: { where: proto, way: "Always send args; {} when the operation takes none." },
  INVALID_OBJECT: { where: proto, way: "The request (or its args) must be a JSON object." },
  INVALID_ARGUMENT: { where: `${forge}; ${ft}`, way: "The arguments failed the operation's schema; the message names the path: agent_capabilities {operation}." },
  SURFACE_DENIED: { where: `${proto}; ${ft}; ${tr}`, way: "Wrong screen for this operation (or a lobby holds the page): target.status, then use an operation of that surface." },
  PERMISSION_DENIED: { where: `${proto}; ${conn}`, way: "The pairing lacks that permission (retry.permissions): check your grants; ask the player to pair again with it." },
  // the revision
  REVISION_REQUIRED: { where: proto, way: "This operation changes the page: add expectedRevision (the revision you read, or \"current\")." },
  INVALID_REVISION: { where: proto, way: "expectedRevision must be a non-negative integer (or \"current\")." },
  REVISION_CONFLICT: { where: `${proto}; ${ft}; ${tr}; ${page}`, way: "The page changed since you read it: read target.status and your refs again, recompute, retry." },
  STALE_REVISION: { where: `${forge}; ${ft}`, way: "The same as REVISION_CONFLICT: read again, recompute, retry." },
  // queue, rate and time
  RATE_LIMITED: { where: `${gw}; ${conn}`, way: "Too fast: send at most " + LIMITS.commandsPerSecond + " a second, wait " + 1000 / LIMITS.commandsPerSecond + " ms and retry (topic limits)." },
  QUEUE_FULL: { where: `${gw}; ${conn}`, way: "Too many requests in flight: wait for answers before sending more." },
  QUEUE_TIMEOUT: { where: `${gw}; ${conn}`, way: "It waited too long and never ran: retry." },
  REQUEST_TIMEOUT: { where: `${gw}; ${conn}`, way: "Outcome unknown: request.receipt {requestId}, then retry with the SAME requestId (never a new one for a mutation)." },
  STOP_IN_FLIGHT: { where: `${gw}; ${conn}`, way: "A stop is already running: wait for its answer." },
  BUSY: { where: play, way: "A scenario is running: scenario.status, or scenario.cancel first." },
  CANCELLED: { where: `${forge}; ${ft}`, way: "The request or its connection was cancelled: read target.status and retry if still wanted." },
  // receipts
  REQUEST_ID_REUSED: { where: forge, way: "That requestId was used with different arguments: use a fresh requestId." },
  UNKNOWN_REQUEST: { where: forge, way: "No receipt for that requestId: it never reached the page, or its receipt is gone: read target.status before you send a mutation again." },
  RECEIPT_CAPACITY: { where: forge, way: "The page's receipt store for this session is full: agent_disconnect and pair again for a fresh session." },
  // sizes
  CONTROL_TOO_LARGE: { where: "forge-agent-protocol oversizeRefusal; forge-agent/src/rtc.ts", way: "The request is over the control bound: split it (smaller layout.batch) or use forge.import's chunks." },
  RULES_TOO_LARGE: { where: ft, way: "The rules pack is too large inline: use forge.export.begin / forge.import.begin (chunked); its envelope carries the rules." },
  OUTPUT_TOO_LARGE: { where: `${ft}; ${tr}`, way: "The answer was too large: ask for less (a section, a smaller limit, the cursor)." },
  ITEM_TOO_LARGE: { where: page, way: "One item alone is larger than a page: read a narrower section." },
  INVALID_CURSOR: { where: page, way: "The cursor is not this section's: start from the first page." },
  INVALID_SECTION: { where: ft, way: "No such section: see forge-build for the section names." },
  // the editor
  NOT_READY: { where: `${forge}; ${ft}`, way: "The editor is loading or has no base: poll target.status until ready." },
  BLOCKED: { where: forge, way: "A live server lobby or match holds the editor: ask the player to leave it." },
  PLAYING: { where: forge, way: "Play is running: play.stop before editing." },
  LOCKED: { where: "viewer/src/forge/agent/editorFacade.ts", way: "The placement is locked: ask the player, then piece.unlock it." },
  INVALID_REFERENCE: { where: "viewer/src/forge/agent/editorFacade.ts", way: "Unknown ref for this revision: read forge.read {section: \"refs\"} again." },
  // REVIEW-1 9: the facade's own refusals; data.message carries its words
  MAP_ISSUES: { where: "viewer/src/forge/agent/editorFacade.ts", way: "forge.play refuses a layout with issues (data.message lists them): forge.issues, fix them through forge.edit, then forge.play again." },
  ABSENT_ASSET: { where: "viewer/src/forge/agent/editorFacade.ts", way: "Not in this page's palette: pass a forge.assets row's asset field (not its ref)." },
  NO_HISTORY: { where: "viewer/src/forge/agent/editorFacade.ts", way: "Nothing to undo or redo: target.status canUndo / canRedo say when there is." },
  EMPTY_SELECTION: { where: "viewer/src/forge/agent/editorFacade.ts", way: "Nothing is selected: selection.set {refs} first." },
  UNSUPPORTED: { where: forge, way: "Not available on this page (no shot driver, no map bounds): use camera.look and target.capture instead." },
  // REVIEW-1 9: an inner operation forge.edit, forge.input, testroom.input or testroom.settings does not admit
  UNSUPPORTED_OPERATION: { where: `${ft}; ${tr}`, way: "This target does not route that operation; for an inner operation its wrapper does not admit, data.admitted lists those it does: choose one, or read agent_capabilities for this surface." },
  REFUSED: { where: `${forge}; ${play}`, way: "The page's own rule refused it; data.message says why." },
  // Play and the room
  PLAY_NOT_READY: { where: play, way: "Play is not visible, ready and private, or a menu holds input: poll target.status; ask the player to close the menu." },
  BUILD_LOCKED: { where: tr, way: "The room is in Play: ask the player to stop Play, or testroom.settings session.play {on: false} with their word." },
  AMBIGUOUS_DESTINATION: { where: tr, way: "Several destinations match: pick one of the answer's choices by its path." },
  UNKNOWN_DESTINATION: { where: tr, way: "No such destination: pick one of the answer's choices." },
  LOAD_TIMEOUT: { where: tr, way: "The map was not ready in 30 seconds: poll testroom.read until ready and map.path match; load again only if it never arrives." },
  // the camera
  PROBE_TOO_LARGE: { where: "viewer/src/forge/agent/probe.ts", way: "forge.probe past its bound: a smaller radius or a shorter ray, or several probes." },
  NO_GROUND: { where: "viewer/src/forge/agent/editorFacade.ts, probe.ts", way: "The base has no collision hull: open a map or blank base, then retry." },
  OUT_OF_BOUNDS: { where: cam, way: "A shot point or its path leaves the map: pull the points inside the layout's extent." },
  OUT_OF_RANGE: { where: cam, way: "A look is steeper than 89 degrees: lower it." },
  // the canvas
  CAPTURE_UNAVAILABLE: { where: conn, way: "The tab is hidden or nothing is drawn: ask the player to show the tab; retry." },
  CAPTURE_TIMEOUT: { where: conn, way: "Retry once." },
  CAPTURE_FAILED: { where: conn, way: "Retry once; if it fails again, tell the player." },
  CAPTURE_TOO_LARGE: { where: conn, way: "The picture is over the transfer bound: retry with size: \"small\" first; if still too large, ask the player to make the window smaller." },
  // transfers
  TRANSFER_TOO_LARGE: { where: `forge-agent-protocol ChunkAssembler; ${ft}`, way: "Over the transfer bound (topic limits): the layout cannot travel whole." },
  TRANSFER_EXPIRED: { where: `forge-agent-protocol ChunkAssembler; ${ft}`, way: "Too slow: begin the transfer again." },
  TRANSFER_BUSY: { where: "forge-agent-protocol ChunkAssembler", way: "Another import is staged: forge.import.cancel, then begin." },
  NO_TRANSFER: { where: `forge-agent-protocol ChunkAssembler; ${ft}`, way: "No transfer of that id: begin again." },
  CHUNK_ORDER: { where: "forge-agent-protocol ChunkAssembler", way: "Send chunks in order from index 0." },
  CHUNK_TOO_LARGE: { where: "forge-agent-protocol ChunkAssembler", way: "Each chunk at most chunkBytes, and never past the declared size." },
  INCOMPLETE: { where: "forge-agent-protocol ChunkAssembler", way: "finish came before every byte: send the missing chunks." },
  DIGEST_MISMATCH: { where: ft, way: "The SHA-256 you declared does not match the bytes: recompute it and begin again." },
  LOCAL_FILES_UNAVAILABLE: { where: ft, way: "No local folder or files on this page (or the browser lacks support): ask the player to choose some, or go on without packs." },
});

export function refusalsTopic(): string {
  return [
    "# refusals -- every code, and the way on",
    "",
    // protocol AgentResult {hint?, retry?} and teach(); sessions.ts refused/refusal; the page targets' teach wrapper
    "A refusal is {outcome: \"refused\", code, hint?, retry?}: hint is a sentence for you; retry {operation?, permissions?, " +
      "revision?, surface?} names what to change. outcome \"unknown\" means the request may have run: check " +
      "`request.receipt` {requestId} before you send a mutation again. The agent_pair, agent_wait and agent_capabilities errors come back as {code, hint} (or {code, valid}) with isError.",
    // protocol parseRequest: "INVALID_" + the field (requestId, sessionId, targetId, epoch)
    "INVALID_requestId, INVALID_sessionId, INVALID_targetId, INVALID_epoch: that field must be 1..128 of A-Z a-z 0-9 _ . : -.",
    "",
    ...Object.entries(REFUSAL_WAYS).map(([code, row]) => "- " + code + ": " + row.way),
    "",
    "A code not listed here: read data.message, then target.status, and tell the player what you saw.",
  ].join("\n");
}
