import { describe, expect, it } from "vitest";
import { checkCreatorRecord, layoutOfRecord, onlineLayoutRefusal, onlineRecordRefusal, parseLayout, recordOfLayout, type Layout } from "../src/layout";

/**
 * The layout's placed gates and C4 barriers (a browser adaptation, FG.R2): a disc map's access object copied (its
 * archive and its root node) at a place, turned a yaw -- as the doors.
 */
const layout = {
  forge: 1, base: { kind: "blank", library: "MP2" }, pieces: [], spawns: [],
  gates: [{ source: "MP11", name: "access1", at: [10, 0, 20], yaw: Math.PI }],
  barriers: [{ source: "MP51", name: "access2", at: [0, 0, 0], yaw: 0, locked: true }],
} as Layout;

describe("placed gates and barriers", () => {
  it("the file reads them; a bad one is refused", () => {
    const read = parseLayout(JSON.stringify(layout));
    expect([read.gates, read.barriers]).toEqual([layout.gates, layout.barriers]);
    expect(() => parseLayout(JSON.stringify({ ...layout, gates: [{ source: "mp11", name: "access1", at: [0, 0, 0], yaw: 0 }] }))).toThrow(/gate 0/);
    expect(() => parseLayout(JSON.stringify({ ...layout, barriers: [{ source: "MP51", name: "", at: [0, 0, 0], yaw: 0 }] }))).toThrow(/barrier 0/);
  });

  it("the v3 record keeps them through a round trip, checked", () => {
    const record = recordOfLayout(layout, "access");
    expect([record.gates, record.barriers]).toEqual([[["MP11", "access1", 10, 0, 20, 180]], [["MP51", "access2", 0, 0, 0, 0, true]]]);
    expect(checkCreatorRecord(record)).toBeNull();
    const back = layoutOfRecord(record);
    expect([back.gates![0]!.name, back.barriers![0]!.locked]).toEqual(["access1", true]);
    expect(checkCreatorRecord({ ...record, gates: [["MP11", "access1", 0, 0]] })).toMatch(/gate 0/);
  });

  it("an online lobby refuses them", () => {
    expect(onlineLayoutRefusal(layout).map((d) => d.code)).toEqual(["record.ONLINE_GATES", "record.ONLINE_BARRIERS"]);
  });
});

/**
 * A gate's switch (the owner, 2026-11-08; a browser adaptation, FG.R2): the disc's gates are opened only by a separate
 * lever panel (`epanel_diN` + `lever_N`, research 174 s5), so a placed gate has none of its own and a switch is placed
 * apart, naming its gate by its place in `gates`; none named, it drives nothing.
 */
describe("placed switches", () => {
  const withSwitches = { ...layout, switches: [{ gate: 0, at: [5, 10, 5], yaw: 0 }, { at: [1, 2, 3], yaw: Math.PI / 2, locked: true }, { action: "seal_strike1", at: [7, 0, 7], yaw: 0 },
    { action: "airstrike_v1", look: "radio", prompt: "action_helo.tif", range: 25, elevation: 10, points: 3, at: [8, 0, 8], yaw: 0 }] } as Layout;

  it("the file reads them; one naming no gate of the layout, or not a place, is refused", () => {
    expect(parseLayout(JSON.stringify(withSwitches)).switches).toEqual(withSwitches.switches);
    expect(() => parseLayout(JSON.stringify({ ...withSwitches, switches: [{ gate: 1, at: [0, 0, 0], yaw: 0 }] }))).toThrow(/switch 0/);
    expect(() => parseLayout(JSON.stringify({ ...withSwitches, switches: [{ gate: 0, at: [0, 0], yaw: 0 }] }))).toThrow(/switch 0/);
    // A switch runs a gate or a map action (a base map's action by its valve), never both.
    expect(() => parseLayout(JSON.stringify({ ...withSwitches, switches: [{ gate: 0, action: "seal_strike1", at: [0, 0, 0], yaw: 0 }] }))).toThrow(/switch 0/);
    expect(() => parseLayout(JSON.stringify({ ...withSwitches, switches: [{ action: "", at: [0, 0, 0], yaw: 0 }] }))).toThrow(/switch 0/);
    // Its look, prompt, reach, height reach and points: each optional (absent, the action's own), each checked.
    for (const bad of [{ look: "tank" }, { prompt: "helo.png" }, { range: 0 }, { elevation: -5 }, { points: 1.5 }]) {
      expect(() => parseLayout(JSON.stringify({ ...withSwitches, switches: [{ action: "a", at: [0, 0, 0], yaw: 0, ...bad }] })), JSON.stringify(bad)).toThrow(/switch 0/);
    }
  });

  it("a layout without switches reads and writes as before (no key)", () => {
    expect(parseLayout(JSON.stringify(layout)).switches).toBeUndefined();
    expect("switches" in recordOfLayout(layout, "access")).toBe(false);
  });

  it("the v3 record keeps them through a round trip, checked: [gate or -1, x, y, z, yaw, map action or '']", () => {
    const record = recordOfLayout(withSwitches, "access");
    expect(record.switches).toEqual([[0, 5, 10, 5, 0, "", "", null, null, null, null, null], [-1, 1, 2, 3, 90, "", "", null, null, null, null, null, true],
      [-1, 7, 0, 7, 0, "seal_strike1", "", null, null, null, null, null], [-1, 8, 0, 8, 0, "airstrike_v1", "radio", "action_helo.tif", 25, 10, 3, null]]);
    expect(checkCreatorRecord(record)).toBeNull();
    expect(layoutOfRecord(record).switches).toEqual(withSwitches.switches);
    const row = (...r: unknown[]) => ({ ...record, switches: [r] }) as typeof record;
    expect(checkCreatorRecord(row(3, 0, 0, 0, 0, "", "", null, null, null, null, null))).toMatch(/switch 0/);
    expect(checkCreatorRecord(row(0, 0, 0))).toMatch(/switch 0/);
    expect(checkCreatorRecord(row(0, 0, 0, 0, 0, "seal_strike1", "", null, null, null, null, null))).toMatch(/switch 0/);   // both
    expect(checkCreatorRecord(row(-1, 0, 0, 0, 0, "a", "tank", null, null, null, null, null))).toMatch(/switch 0/);
    expect(checkCreatorRecord(row(-1, 0, 0, 0, 0, "a", "", null, -3, null, null, null))).toMatch(/switch 0/);
  });

  it("an online lobby refuses them", () => {
    expect(onlineLayoutRefusal(withSwitches).map((d) => d.code)).toContain("record.ONLINE_SWITCHES");
  });
});

/**
 * A switch's script (the owner, 2026-11-08; a browser adaptation, FG.R2): steps a pull runs, each one of the original's
 * own program commands (show/hide a node, run an action, wait, a message, a sound, an effect, a flag set or tested, the
 * bomb's blast), run once a round as the disc's switches are (the owner, 2026-11-10: "no custom stuff").
 */
describe("a switch's script", () => {
  const base = {
    forge: 1, base: { kind: "map", archive: "MP72" }, spawns: [],
    pieces: [{ asset: "MP72:crate", m: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }],
    barriers: [{ source: "MP51", name: "access1", at: [0, 0, 0], yaw: 0 }],
  };
  const script = {
    steps: [
      { do: "message", text: "AIRSTRIKE INBOUND" }, { do: "wait", seconds: 2.5 },
      { do: "if", flag: "power", equals: 1 }, { do: "run", action: "seal_strike1" }, { do: "else" }, { do: "message", text: "No power" }, { do: "end" },
      { do: "run", barrier: 0 }, { do: "hide", target: { piece: 0 } }, { do: "show", target: { map: "worldmodel/seal_demo_1" } },
      { do: "sound", name: ".EXP_1", at: { barrier: 0 } }, { do: "effect", name: "fire_explode_med", at: { map: "worldmodel/seal_demo_1" } },
      { do: "set", flag: "power", value: 0 }, { do: "blast", at: { map: "worldmodel/seal_demo_1" } },
    ],
  };
  const l = { ...base, switches: [{ script, at: [1, 2, 3], yaw: 0 }] };

  it("the file reads it whole; a bad step, an object the layout lacks or an unclosed if is refused", () => {
    expect(parseLayout(JSON.stringify(l)).switches![0]!.script).toEqual(script);
    const bad = (steps: unknown[]) => JSON.stringify({ ...base, switches: [{ script: { steps }, at: [0, 0, 0], yaw: 0 }] });
    expect(() => parseLayout(bad([{ do: "fly" }]))).toThrow(/switch 0/);
    expect(() => parseLayout(bad([{ do: "hide", target: { piece: 1 } }]))).toThrow(/switch 0/);         // one piece
    expect(() => parseLayout(bad([{ do: "run", barrier: 3 }]))).toThrow(/switch 0/);
    expect(() => parseLayout(bad([{ do: "if", flag: "a", equals: 1 }]))).toThrow(/switch 0/);          // no end
    expect(() => parseLayout(bad([{ do: "else" }]))).toThrow(/switch 0/);
    expect(() => parseLayout(bad([{ do: "wait", seconds: -1 }]))).toThrow(/switch 0/);
    expect(() => parseLayout(bad([{ do: "hide", target: { map: "../x" } }]))).toThrow(/switch 0/);
    // The Forge's own are gone (the owner, 2026-11-10: "no custom stuff"): a toggle, a repeat, a message's colour.
    expect(() => parseLayout(JSON.stringify({ ...base, switches: [{ script: { ...script, second: [] }, at: [0, 0, 0], yaw: 0 }] }))).toThrow(/switch 0/);
    expect(() => parseLayout(JSON.stringify({ ...base, switches: [{ script: { ...script, repeat: true }, at: [0, 0, 0], yaw: 0 }] }))).toThrow(/switch 0/);
    expect(() => parseLayout(bad([{ do: "message", text: "HI", colour: 5 }]))).toThrow(/switch 0/);
    // A script and a gate or a map action are one or the other.
    expect(() => parseLayout(JSON.stringify({ ...base, switches: [{ script, action: "x", at: [0, 0, 0], yaw: 0 }] }))).toThrow(/switch 0/);
  });

  it("a sound or effect step keeps the map it is from (the owner, 2026-11-10); one that is no map's stem is refused", () => {
    const from = (f: unknown) => JSON.stringify({ ...base, switches: [{ script: { steps: [{ do: "sound", name: ".ALARM", from: f }, { do: "effect", name: "boom", from: "M51" }] }, at: [0, 0, 0], yaw: 0 }] });
    expect(parseLayout(from("MP6")).switches![0]!.script!.steps).toEqual([{ do: "sound", name: ".ALARM", from: "MP6" }, { do: "effect", name: "boom", from: "M51" }]);
    expect(() => parseLayout(from("../MP6"))).toThrow(/switch 0/);
    expect(() => parseLayout(from(6))).toThrow(/switch 0/);
  });

  it("Forge objects (the owner, 2026-11-10): an ambient effect and a crane kept, through the record too; a script aims at one; a bad one refused; online an ambient admitted, a crane refused", () => {
    const objects = [
      { kind: "ambient", source: "MP6", name: "flame_in_barrel", at: [10, 0, 5], yaw: 1.5 },
      { kind: "crane", source: "MP81", name: "crane1", at: [1, 2, 3], yaw: 0 },
    ];
    const text = JSON.stringify({ ...base, objects, switches: [{ script: { steps: [{ do: "blast", at: { object: 0 } }] }, at: [0, 0, 0], yaw: 0 }] });
    const l = parseLayout(text);
    expect(l.objects).toEqual(objects);
    expect(l.switches![0]!.script!.steps).toEqual([{ do: "blast", at: { object: 0 } }]);
    const record = recordOfLayout(l, "objects");
    expect(checkCreatorRecord(record)).toBeNull();
    expect(layoutOfRecord(record).objects).toEqual([{ ...objects[0], yaw: expect.closeTo(1.5, 1) }, objects[1]]);
    // Online (the owner, 2026-11-10: "make it ... such that they will load in online games"): an ambient alone admitted.
    const ambientOnly = parseLayout(JSON.stringify({ ...base, objects: [objects[0]] }));
    expect(onlineLayoutRefusal(ambientOnly).filter((d) => d.field === "objects")).toEqual([]);
    expect(onlineRecordRefusal(recordOfLayout(ambientOnly, "a")).filter((d) => d.field === "objects")).toEqual([]);
    expect(onlineLayoutRefusal(parseLayout(JSON.stringify({ ...base, objects: [objects[1]] }))).map((d) => d.field)).toContain("objects");
    // The empty and the sound are gone (the owner, 2026-11-10: "remove sound, and empty objects").
    for (const bad of [{ kind: "crane2", source: "MP6", name: "x", at: [0, 0, 0], yaw: 0 }, { kind: "empty", name: "x", at: [0, 0, 0], yaw: 0 },
      { kind: "sound", name: "x", at: [0, 0, 0], yaw: 0 }, { kind: "ambient", name: "x", at: [0, 0, 0], yaw: 0 }]) {
      expect(() => parseLayout(JSON.stringify({ ...base, objects: [bad] })), JSON.stringify(bad)).toThrow(/object 0/);
    }
    expect(() => parseLayout(JSON.stringify({ ...base, switches: [{ script: { steps: [{ do: "blast", at: { object: 0 } }] }, at: [0, 0, 0], yaw: 0 }] }))).toThrow(/switch 0/);
  });

  it("an ambient's audio script (the owner, 2026-11-10: the game's own commands only) kept, through the record too; a bad one refused", () => {
    // Sujo's lightning_flashes, as the disc has it: IF/ELSEIF on RANDOM_WEIGHT, SOUND at a volume, WAIT, LOOP -1.
    const audio = [
      { do: "play", sound: "~FIRE_SM", from: "MP6", volume: 3 },
      { do: "if", chance: 0.25 }, { do: "play", sound: ".LIGHTNING", from: "MP61" }, { do: "wait", seconds: 10 },
      { do: "elseif", chance: 0.5 }, { do: "play", sound: ".DIST_THUNDER", from: "MP61", volume: 0.35 }, { do: "wait", seconds: 7.5 },
      { do: "else" }, { do: "wait", seconds: 6, random: 2 }, { do: "endif" },
      { do: "while" }, { do: "wait", seconds: 1 }, { do: "endWhile" },
      { do: "loop" },
    ];
    const objects = [
      { kind: "ambient", source: "MP6", name: "flame_in_barrel", at: [10, 0, 5], yaw: 0, audio },
      { kind: "ambient", source: "MP61", name: "lightning_flashes", at: [0, 0, 0], yaw: 0, audio: [{ do: "loop", times: 3 }] },
      { kind: "ambient", source: "MP61", name: "lightning_flashes", at: [0, 0, 0], yaw: 0, audio: [{ do: "loop", seconds: 30 }] },
    ];
    const l = parseLayout(JSON.stringify({ ...base, objects }));
    expect(l.objects).toEqual(objects);
    const record = recordOfLayout(l, "audio");
    expect(checkCreatorRecord(record)).toBeNull();
    expect(layoutOfRecord(record).objects).toEqual(objects);
    const bad = (a: unknown, kind = "ambient") => () => parseLayout(JSON.stringify({ ...base, objects: [{ kind, source: "MP6", name: "S", at: [0, 0, 0], yaw: 0, audio: a }] }));
    for (const a of [
      [{ do: "while" }], [{ do: "endWhile" }], [{ do: "if", chance: 0.5 }], [{ do: "else" }], [{ do: "endif" }],
      [{ do: "if", chance: 1.5 }, { do: "endif" }], [{ do: "while" }, { do: "if", chance: 0.5 }, { do: "endWhile" }, { do: "endif" }],
      [{ do: "if", chance: 0.5 }, { do: "else" }, { do: "elseif", chance: 0.5 }, { do: "endif" }],
      [{ do: "play", sound: "x", volume: 5 }], [{ do: "play", sound: "x", range: [1, 2] }], [{ do: "wait", seconds: -1 }],
      [{ do: "loop", times: 0 }], [{ do: "loop", times: 2, seconds: 5 }], [{ do: "repeat" }, { do: "end" }], [{ do: "stop" }],
      [{ do: "play", sound: "x", from: "../MP2" }],
    ]) expect(bad(a), JSON.stringify(a)).toThrow(/object 0/);
    expect(bad([{ do: "play", sound: "x" }], "crane")).toThrow(/object 0/);
  });

  it("an explosion step is the bomb's blast at a place, nothing more (Crossroads' bridges'): damage, radius, health or cover refused", () => {
    const blast = (st: Record<string, unknown>) => JSON.stringify({ ...base, pieces: [], switches: [{ script: { steps: [{ do: "blast", ...st }] }, at: [0, 0, 0], yaw: 0 }] });
    expect(parseLayout(blast({})).switches![0]!.script!.steps).toEqual([{ do: "blast" }]);
    expect(parseLayout(blast({ at: { map: "worldmodel/deck_3" } })).switches![0]!.script!.steps).toEqual([{ do: "blast", at: { map: "worldmodel/deck_3" } }]);
    for (const bad of [{ damage: 2 }, { radius: 300 }, { health: 25 }, { through: true }, { at: { piece: 0 } }, { name: "x" }]) {
      expect(() => parseLayout(blast(bad)), JSON.stringify(bad)).toThrow(/switch 0/);
    }
  });

  it("a custom damage trigger (the owner, 2026-11-10): its own place, linked to a prop or a map object (or nothing yet), through the record too; a bad one refused", () => {
    const triggers = [
      { piece: 0, health: 1, armor: 0, shield: 17, script: { steps: [{ do: "message", text: "BOOM" }] }, at: [10, 0, 5] as [number, number, number] },
      { node: "worldmodel/deck_3", health: 0, armor: 0, shield: 0, at: [1, 2, 3] as [number, number, number] },
      { health: 1, armor: 0, shield: 17 },
    ];
    const l2 = { ...base, triggers };
    expect(parseLayout(JSON.stringify(l2)).triggers).toEqual(triggers);
    const record = recordOfLayout(l2 as unknown as Layout, "triggers");
    expect(record.triggers).toEqual([[0, 1, 0, 17, triggers[0]!.script, "", 10, 0, 5], [-1, 0, 0, 0, null, "worldmodel/deck_3", 1, 2, 3], [-1, 1, 0, 17, null, "", null, null, null]]);
    expect(checkCreatorRecord(record)).toBeNull();
    expect(layoutOfRecord(record).triggers).toEqual(triggers);
    const bad = (t: unknown) => JSON.stringify({ ...base, triggers: [t] });
    expect(() => parseLayout(bad({ piece: 1, health: 1, armor: 0, shield: 0 }))).toThrow(/trigger 0/);             // one piece
    expect(() => parseLayout(bad({ piece: 0, health: -1, armor: 0, shield: 0 }))).toThrow(/trigger 0/);
    expect(() => parseLayout(bad({ piece: 0, health: 1, armor: 0, shield: 0, script: { steps: [], repeat: true } }))).toThrow(/trigger 0/);
    expect(() => parseLayout(JSON.stringify({ ...base, triggers: [triggers[0], triggers[0]] }))).toThrow(/trigger 1/);   // a prop once
    expect(() => parseLayout(bad({ piece: 0, node: "worldmodel/x", health: 1, armor: 0, shield: 0 }))).toThrow(/trigger 0/);   // one link at most
    expect(() => parseLayout(bad({ node: "../x", health: 1, armor: 0, shield: 0 }))).toThrow(/trigger 0/);
    expect(onlineLayoutRefusal(l2 as unknown as Layout).map((d) => d.code)).toContain("record.ONLINE_TRIGGERS");
  });

  it("a switch has no team (the owner, 2026-11-10: \"no custom stuff\"): a file's is dropped, a record's team column refused", () => {
    const sw = { ...base, switches: [{ script: { steps: [] }, team: "seal", at: [1, 2, 3], yaw: 0 }] };
    expect(parseLayout(JSON.stringify(sw)).switches![0]).not.toHaveProperty("team");
    const record = recordOfLayout(parseLayout(JSON.stringify(sw)), "team");
    expect(record.switches![0]!.length).toBe(12);
    expect(checkCreatorRecord({ ...record, switches: [[...record.switches![0]!, null, "seal"]] } as never)).toMatch(/switch 0/);
  });

  it("a switch on a prop (the owner, 2026-11-10): one of the layout's or a map node, kept through the record; both or a bad one refused", () => {
    const sw = (link: object) => ({ ...base, switches: [{ script: { steps: [] }, ...link, at: [1, 2, 3], yaw: 0 }] });
    for (const link of [{ piece: 0 }, { node: "worldmodel/deck_3" }]) {
      expect(parseLayout(JSON.stringify(sw(link))).switches![0]).toMatchObject(link);
      const record = recordOfLayout(sw(link) as unknown as Layout, "prop");
      expect(checkCreatorRecord(record)).toBeNull();
      expect(layoutOfRecord(record).switches![0]).toMatchObject(link);
    }
    expect(() => parseLayout(JSON.stringify(sw({ piece: 1 })))).toThrow(/switch 0/);
    expect(() => parseLayout(JSON.stringify(sw({ piece: 0, node: "worldmodel/x" })))).toThrow(/switch 0/);
    expect(() => parseLayout(JSON.stringify(sw({ node: "../x" })))).toThrow(/switch 0/);
  });

  it("the v3 record keeps it through a round trip, checked", () => {
    const record = recordOfLayout(l as unknown as Layout, "script");
    expect(record.switches![0]![11]).toEqual(script);
    expect(checkCreatorRecord(record)).toBeNull();
    expect(layoutOfRecord(record).switches![0]!.script).toEqual(script);
    const row = [...record.switches![0]!];
    row[11] = { steps: [{ do: "run", barrier: 9 }] };
    expect(checkCreatorRecord({ ...record, switches: [row] } as typeof record)).toMatch(/switch 0/);
  });
});

/**
 * The placements' tree (the owner, 2026-11-10: "implement the tree layout"): each `[child, parent]` pair by the
 * placements' places in the layout -- the editor's own, every placement at its own world place, so an online lobby is
 * sent the layout without it (`withoutTree`) and plays the same.
 */
describe("the placements' tree", () => {
  const base = {
    forge: 1, base: { kind: "map", archive: "MP72" }, spawns: [],
    pieces: [{ asset: "MP72:crate", m: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }, { asset: "MP72:crate", m: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 0, 0, 1] }],
  };
  it("kept through the file and the record; left out for a lobby; a bad one refused", async () => {
    const { withoutTree } = await import("../src/layout");
    const tree: [string, string][] = [["piece:1", "piece:0"], ["door:0", "piece:1"], ["bomb:seal:0", "piece:0"]];
    const l = parseLayout(JSON.stringify({ ...base, tree }));
    expect(l.tree).toEqual(tree);
    const record = recordOfLayout(l, "tree");
    expect(checkCreatorRecord(record)).toBeNull();
    expect(layoutOfRecord(record).tree).toEqual(tree);
    expect(withoutTree(l)).not.toHaveProperty("tree");
    expect(withoutTree(l).pieces).toEqual(l.pieces);
    expect(onlineLayoutRefusal(l).filter((d) => d.field === "tree")).toEqual([]);
    for (const bad of [[["piece:0", "piece:0"]], [["piece:0", "piece:1"], ["piece:1", "piece:0"]], [["piece:1", "piece:0"], ["piece:1", "door:0"]],
      [["wall:0", "piece:0"]], [["piece:0"]], []]) {
      expect(() => parseLayout(JSON.stringify({ ...base, tree: bad })), JSON.stringify(bad)).toThrow(/tree/);
    }
  });
  it("the Outliner's folders and its order (the owner, 2026-11-11): kept through the file and the record, left out for a lobby; a bad one refused", async () => {
    const { withoutTree } = await import("../src/layout");
    const extra = { folders: [{ name: "Lights" }], tree: [["piece:0", "folder:0"], ["folder:0", "piece:1"]] as [string, string][], order: ["piece:1", "folder:0", "piece:0"] };
    const l = parseLayout(JSON.stringify({ ...base, ...extra }));
    expect([l.folders, l.tree, l.order]).toEqual([extra.folders, extra.tree, extra.order]);
    const record = recordOfLayout(l, "outline");
    expect(checkCreatorRecord(record)).toBeNull();
    const back = layoutOfRecord(record);
    expect([back.folders, back.tree, back.order]).toEqual([extra.folders, extra.tree, extra.order]);
    const sent = withoutTree(l);
    for (const k of ["tree", "folders", "order"]) expect(sent).not.toHaveProperty(k);
    for (const bad of [{ folders: [{ name: "" }] }, { folders: [{ name: "x", open: true }] }, { order: ["piece:0", "piece:0"] }, { order: ["wall:1"] }]) {
      expect(() => parseLayout(JSON.stringify({ ...base, ...bad })), JSON.stringify(bad)).toThrow(/folder|order/);
    }
  });
});
