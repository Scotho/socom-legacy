import { describe, expect, it } from "vitest";
import {
  authorizeRequest,
  CAMERA_OPERATIONS,
  CAMERA_SHOT_ENDED,
  CAMERA_SHOT_HOLD_ADAPTATION,
  CAMERA_SHOT_POINTS_ADAPTATION,
  CAMERA_SHOT_SECONDS_ADAPTATION,
  OPERATIONS,
  parseCameraEmpty,
  parseCameraShot,
  parseRequest,
  ProtocolError,
} from "../src/index.js";

/** R5-A (a browser adaptation, no original): the agent's cinematic camera shot -- its operations and its bounds. */
const point = (i: number) => ({ at: [i, 1, 2] as [number, number, number], look: [i, 1, 10] as [number, number, number] });
const shot = (n = 2, seconds = 4, hold?: number) => ({ points: Array.from({ length: n }, (_, i) => point(i)), seconds, ...(hold === undefined ? {} : { hold }) });
const code = (fn: () => unknown): string => {
  try { fn(); } catch (error) { return error instanceof ProtocolError ? error.code : "NOT_A_PROTOCOL_ERROR"; }
  return "NO_THROW";
};
const cap = { sessionId: "s", targetId: "t", epoch: "e", surface: "forge-editor" as const };
const req = { version: 1, requestId: "r", sessionId: "s", targetId: "t", epoch: "e" };

describe("camera shot operations (browser adaptation)", () => {
  it("names the bounds as adaptation constants", () => {
    expect(CAMERA_SHOT_POINTS_ADAPTATION).toEqual({ min: 2, max: 64 });
    expect(CAMERA_SHOT_SECONDS_ADAPTATION).toEqual({ min: 1, max: 120 });
    expect(CAMERA_SHOT_HOLD_ADAPTATION).toEqual({ min: 0, max: 10 });
    expect(CAMERA_SHOT_ENDED).toEqual(["manual", "mode", "map", "stopped", "revoked", "disconnected", "done"]);
    expect(CAMERA_OPERATIONS).toEqual(["camera.shot", "camera.stop", "camera.status"]);
  });
  it("lists the three operations in the catalogue the gateway reads: edit for shot and stop (as the other camera controls), inspect for status", () => {
    expect(OPERATIONS["camera.shot"]).toMatchObject({ permission: "edit", mutation: true, surfaces: ["forge-editor", "testroom-solo"] });
    expect(OPERATIONS["camera.stop"]).toMatchObject({ permission: "edit", mutation: false });
    expect(OPERATIONS["camera.status"]).toMatchObject({ permission: "inspect", mutation: false });
    // The same grant as the camera controls already there: Forge's (through forge.edit) and the room's (testroom.settings).
    expect(OPERATIONS["camera.shot"]!.permission).toBe(OPERATIONS["forge.edit"]!.permission);
    expect(OPERATIONS["camera.shot"]!.permission).toBe(OPERATIONS["testroom.settings"]!.permission);
    expect(OPERATIONS["camera.stop"]!.surfaces).toEqual(["forge-editor", "forge-play", "testroom-solo"]);
    expect(OPERATIONS["camera.status"]!.surfaces).toEqual(["forge-editor", "forge-play", "testroom-solo"]);
  });
  it("admits a shot with edit, in Build and the solo room, at the revision; never in Play; a test-only grant is refused", () => {
    const request = parseRequest({ ...req, operation: "camera.shot", args: shot(), expectedRevision: 3 });
    expect(authorizeRequest(request, { ...cap, permissions: ["edit"], revision: 3 })).toBeUndefined();
    expect(authorizeRequest(request, { ...cap, permissions: ["test", "inspect"], revision: 3 })).toBe("PERMISSION_DENIED");
    expect(authorizeRequest(request, { ...cap, surface: "testroom-solo", permissions: ["test"] })).toBe("PERMISSION_DENIED");
    expect(authorizeRequest(request, { ...cap, permissions: ["edit"], revision: 4 })).toBe("REVISION_CONFLICT");
    expect(authorizeRequest(request, { ...cap, surface: "forge-play", permissions: ["edit"] })).toBe("SURFACE_DENIED");
    expect(authorizeRequest(request, { ...cap, surface: "testroom-solo", permissions: ["edit"] })).toBeUndefined();
    expect(code(() => parseRequest({ ...req, operation: "camera.shot", args: shot() }))).toBe("REVISION_REQUIRED");
    // A stop needs no revision but the same grant; a status only inspect.
    const stop = parseRequest({ ...req, operation: "camera.stop", args: {} });
    expect(authorizeRequest(stop, { ...cap, surface: "forge-play", permissions: ["edit"] })).toBeUndefined();
    expect(authorizeRequest(stop, { ...cap, surface: "forge-play", permissions: ["test", "inspect"] })).toBe("PERMISSION_DENIED");
    const status = parseRequest({ ...req, operation: "camera.status", args: {} });
    expect(authorizeRequest(status, { ...cap, permissions: ["inspect"] })).toBeUndefined();
  });
  it("parses a shot at its bounds and copies it", () => {
    const input = shot(64, 120, 10);
    const parsed = parseCameraShot(input);
    expect(parsed).toEqual(input);
    input.points[0]!.at[0] = 99;
    expect(parsed.points[0]!.at[0]).toBe(0);
    expect(parseCameraShot(shot(2, 1))).toEqual(shot(2, 1));
    expect(parseCameraShot(shot(2, 1, 0))).toEqual(shot(2, 1, 0));
  });
  it("refuses a shot outside its bounds or its shape with INVALID_ARGUMENT", () => {
    const bad: unknown[] = [
      shot(1), shot(65), shot(2, 0.5), shot(2, 121), shot(2, 4, -1), shot(2, 4, 10.5),
      { ...shot(), seconds: Number.NaN }, { ...shot(), seconds: "4" }, { ...shot(), hold: Infinity },
      { ...shot(), extra: 1 }, { points: shot().points }, { seconds: 4 }, null, [], "shot",
      { ...shot(), points: [point(0), { at: [0, 1], look: [0, 0, 0] }] },
      { ...shot(), points: [point(0), { at: [0, 1, Number.NaN], look: [0, 0, 0] }] },
      { ...shot(), points: [point(0), { at: [0, 1, 2], look: [0, 0, Infinity] }] },
      { ...shot(), points: [point(0), { at: [0, 1, 2] }] },
      { ...shot(), points: [point(0), { at: [0, 1, 2], look: [0, 0, 0], roll: 1 }] },
      { ...shot(), points: [point(0), { at: ["0", 1, 2], look: [0, 0, 0] }] },
      { ...shot(), points: "two" },
    ];
    for (const value of bad) expect(code(() => parseCameraShot(value)), JSON.stringify(value)).toBe("INVALID_ARGUMENT");
  });
  it("takes only an empty object for stop and status", () => {
    expect(parseCameraEmpty({})).toEqual({});
    for (const value of [null, [], { shot: "x" }, "x"]) expect(code(() => parseCameraEmpty(value))).toBe("INVALID_ARGUMENT");
  });
});
