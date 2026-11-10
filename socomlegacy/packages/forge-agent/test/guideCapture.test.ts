import { describe, expect, it } from "vitest";
import { captureTopic } from "../src/guide/capture";

/** AX-16 (plan item 16; a browser adaptation): the guide's capture topic teaches the presets. */
describe("the capture topic", () => {
  it("names each view, the size option and that the camera is put back", () => {
    const text = captureTopic();
    for (const view of ["current", "top", "refs", "named"]) expect(text, view).toContain(`"${view}"`);
    expect(text).toMatch(/size/);
    expect(text).toMatch(/restor/i);
    expect(text).toMatch(/STALE_REVISION/);
    expect(text).toMatch(/UNSUPPORTED/);
  });
});
