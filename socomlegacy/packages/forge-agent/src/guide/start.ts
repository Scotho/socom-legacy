// AX-2 (a browser adaptation, product track; contract C5): the guide's `start` topic. Every fact names the file it is
// read from; the permission lists are built from `OPERATIONS` itself, so they cannot drift from it.
import { LIMITS, OPERATIONS, PERMISSIONS, SURFACES } from "@s2u/forge-agent-protocol";
import { PAIR_WAIT_SECONDS } from "../sessions.js";

/**
 * REVIEW-1 14: what a permission does beyond its operations' names -- the capture presets move the camera under
 * capture alone (viewer agent/capturePreset.ts captureFramed; forgeTarget.ts and testroomTarget.ts end a running shot).
 */
const PERMISSION_NOTES: Partial<Record<(typeof PERMISSIONS)[number], string>> = {
  capture: " -- its presets move the camera for the picture and put it back, and end a running camera shot (stopped), with no edit or test needed",
};
/** One line per permission: the wire operations that need it (forge-agent-protocol `OPERATIONS`' `permission`). */
export function permissionLines(): string[] {
  return PERMISSIONS.map((permission) => {
    const names = Object.entries(OPERATIONS).filter(([, o]) => o.permission === permission).map(([name]) => "`" + name + "`");
    return "- " + permission + ": " + names.join(", ") + (PERMISSION_NOTES[permission] ?? "");
  });
}

const minutes = (ms: number) => String(ms / 60000);

export const START_SHORT = [
  "You talk to one player's own browser page -- the Forge map editor or the solo test room -- through this gateway. " +
    "Nothing runs until the player approves you in that page.", // forge-agent/src/sessions.ts pair -> page "pending" -> approve
  "1. The player gives you a join link (or a bare invitation).", // viewer/src/agent/setup.ts pairingText; gateway.ts GET /join/:invitation
  "2. Call agent_pair with it; the player clicks Allow in the page.", // sessions.ts pairAndWait: the call waits for the answer
  "3. Call agent_capabilities, then agent_request with `target.status`.", // mcp.ts agent_capabilities; protocol OPERATIONS["target.status"]
  "Typed tools per area take {operation, args} with each operation's fields in their schema: forge_read, forge_edit " +
    "{operation, arguments, expectedRevision}, forge_play, testroom, capture, camera; agent_request takes any operation.", // forge-agent/src/tools/area.ts
  "Every edit goes through `forge.edit` {operation, arguments} and carries expectedRevision.", // viewer/src/agent/forgeTarget.ts "forge.edit"
  "Read `notes` on every result: the player's own notes from the page. Follow them.", // AX-14: sessions.ts withNotes
].join("\n");

export function startTopic(): string {
  return [
    "# start -- connecting to a SOCOM 2 Legacy page",
    "",
    "## What you are connected to",
    // forge-agent/src/mcp.ts (the tools); forge-agent/src/rtc.ts (the gateway's side of the page's data channel)
    "This gateway relays typed operations to ONE player's browser page over a WebRTC data channel. The page holds the map; " +
      "the gateway holds none. No arbitrary code, shell or HTTP reaches the player's machine: only the operations " +
      "agent_capabilities lists.",
    // forge-agent-protocol SURFACES; viewer/src/agent/forgeTarget.ts read() (surface = the editor's mode)
    "A page is on one surface at a time: " + SURFACES.map((s) => '"' + s + '"').join(", ") +
      " (the Forge's Build screen, the Forge's private Play, the solo test room). An operation sent to a surface it does " +
      "not list is refused SURFACE_DENIED; `target.status` says the surface.",
    "",
    "## The order",
    // viewer/src/agent/setup.ts pairingText (AGENT_CONNECT_LINE_PREFIX + agentJoinLink): "Connect to my SOCOM 2 Legacy page: <gateway>/join/<invitation>"
    "1. The player copies one line from the page's agent dock: `Connect to my SOCOM 2 Legacy page: <gateway>/join/<invitation>`. " +
      "The invitation is single-use and lives " + minutes(LIMITS.invitationMs) + " minutes (`invitationMs` = " + LIMITS.invitationMs + ").", // protocol LIMITS.invitationMs; sessions.ts pair
    // mcp.ts agent_pair / agent_wait; sessions.ts pair (permissions default PERMISSIONS, clientName "MCP client"),
    // parseInvitation, PAIR_WAIT_SECONDS, nextPending ("do not call agent_pair again, the invitation is spent")
    "2. Call agent_pair {invitation, permissions?, clientName?, waitSeconds?}. invitation takes the raw invitation or the " +
      "whole join link; permissions defaults to all six; waitSeconds (default " + PAIR_WAIT_SECONDS.default + ", max " +
      PAIR_WAIT_SECONDS.max + ") holds the call until the player approves (state paired, with sessionId, targetId, epoch " +
      "and the grants), declines (declined) or the wait ends (pending: call agent_wait {sessionId, waitSeconds?} to keep " +
      "waiting, or agent_status; do not repeat agent_pair -- the invitation is spent). If your client times out the " +
      "call first, the pairing is still pending: call agent_wait {sessionId} (agent_status lists it).",
    // forge-agent/src/sessions.ts pair: the comparison code sent to the page and returned to the agent
    "3. The page shows the player your clientName, each permission and a short comparison code; the code in your " +
      "agent_pair answer is the same one. The player may untick permissions before Allow: read the grants you got.",
    // sessions.ts pair sends `gatewayClientId` (oauth.ts clientIdOf) on "pending"; viewer/src/agent/remembered.ts
    "   The player may tick \"Remember <your clientName> on this browser\". Your next pairing from the same OAuth " +
      "registration (else the same clientName) then shows a compact card with the last grants -- still one click on " +
      "Allow by the player, never an automatic approval: agent_pair waits for it as before.",
    // mcp.ts agent_capabilities / manualDetail; protocol MANUAL_AREAS
    "4. agent_capabilities: with no argument the operation summary; {area} (forge, forge-edit, play, testroom, camera, " +
      "packs, session) or {operation} gives the full argument schemas.",
    // protocol OPERATIONS["target.status"]; forgeTarget.ts "target.status" (ready, viewRevision, canUndo, canRedo, selection, play)
    "5. agent_request {operation: \"target.status\", args: {}}: the surface, the map, ready, and the layout revision.",
    "",
    "## agent_request",
    // protocol parseRequest: version 1, the identifiers, args required (MISSING_ARGS), unknown fields refused (UNKNOWN_FIELD)
    "Fields: version (1), operation, args (always present: {} when there are none), expectedRevision, and the binding " +
      "sessionId, targetId, epoch, requestId. Any other field is refused UNKNOWN_FIELD.",
    // sessions.ts implicit: absent fields filled from the caller's one paired session matching those given
    "With one paired session, sessionId, targetId, epoch and requestId may be left out: the gateway fills them and returns " +
      "the requestId it made. With several, pass targetId or sessionId (the refusal SESSION_AMBIGUOUS lists them in data.sessions).",
    // protocol parseRequest: a mutation without expectedRevision is REVISION_REQUIRED, "current" accepted; admitRevision
    "An operation that changes the page (mutation) needs expectedRevision: the revision you last read, or \"current\" to " +
      "let the page take its own revision at admission.",
    // protocol AgentResult {hint?, retry?}; teach() and sessions.ts refused fill them
    "The answer: {requestId, revision, outcome: ok | refused | unknown, code?, data?}; a refusal also carries hint (a " +
      "sentence) and retry {operation?, permissions?, revision?, surface?}. outcome unknown means it may have run: read " +
      "`request.receipt` {requestId} before retrying (topic refusals).",
    "",
    "",
    "## The player's notes",
    // AX-14: forge-agent/src/sessions.ts withNotes / deliverNotes / notes; protocol AgentResult.notes, LIMITS.noteChars
    "The player can type a note for you in the page's agent section (\"stop, try the other side\"). Read `notes` on every " +
      "result: an agent_request answer carries the notes not yet delivered as notes: [{text, at}], each delivered once. " +
      "Follow the player's notes: they are the player's own words, sent while you work, and they come before your plan. A " +
      "note is plain text of at most " + LIMITS.noteChars + " characters: never an operation, and never run as one.",
    "",
    "## The other tools",
    "- agent_status: your own pending and paired sessions (sessionId, targetId, epoch, surface, permissions, and the undelivered notes), each with next: the next step.", // sessions.ts status
    // AX-9: sessions.ts leave/resume -- a reload holds the grant RESUME_LIMITS.resumeMs for the player's one-click Reconnect
    "  After the player reloads the page, your session reads reloading until they press Reconnect there (requests meanwhile: " +
      "PAGE_RELOADING); then it reads paired again with the same sessionId and grants but a new targetId and epoch, so omit both.",
    // AX-12: the page's diagnosis of a failed connection (protocol DIAGNOSIS_CLASSES, DIAGNOSIS_HINTS)
    "  When the page's connection failed, agent_status also carries `diagnosis` {class, local?, remote?} and a `next` " +
      "naming the cause: service-unreachable, origin-refused, service-busy, route-failed (WebRTC/ICE; candidate counts " +
      "only), version, expired, revoked or unknown. It stays for 10 minutes after the session ends, until you pair again.",
    "- agent_wait {sessionId, waitSeconds?}: keep waiting on a pending pairing.", // mcp.ts agent_wait
    "- agent_notes {sessionId?}: the player's undelivered notes, returned and marked delivered (read-only).", // mcp.ts agent_notes
    "- agent_disconnect {sessionId}: end your pairing and close its channel.", // mcp.ts agent_disconnect
    "- agent_guide {topic?}: this guide; also the resources socom2legacy://guide/<topic>.",
    // AX-6: forge-agent/src/tools/area.ts -- each schema generated from the manual (C1), each call sent as agent_request
    "- forge_read, forge_edit, forge_play, testroom, capture, camera: one area's operations each, {operation, args} " +
      "(forge_edit: {operation, arguments, expectedRevision}, sent as forge.edit), the same session fields and answers " +
      "as agent_request; a wrapper's nested operations (input.set, session.play...) are named directly.",
    "",
    "## What each permission allows",
    ...permissionLines(),
    // viewer/src/forge/agent/api.ts FORGE_AGENT_OPERATIONS: the edit operations forge.edit admits (forgeTarget.ts)
    "`forge.edit` admits only the page's operations whose own permission is edit (see forge-build).",
  ].join("\n");
}
