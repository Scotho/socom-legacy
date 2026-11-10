import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';

/**
 * Placed gates and C4 barriers in Play's room (the owner, 2026-11-06: checked against the developers' v0.4.9 room and
 * world): the layout's copies composed onto the base (`../../src/forge/placedAccess` `withPlacedAccess`), the room built
 * from that map as the page builds it (`../../src/net/loopback` `simMapOfLoaded`), then a player in reach pulls the copy's
 * lever through the room's own action path -- aimed at the gate, its reach checked -- and the gate slides; and a C4
 * blast at the copied barrier, through the room's own world, wrecks it while the base's own objects stand.
 */
const ISO = process.env['SOCOM_ISO'];
describe.skipIf(!ISO || !existsSync(ISO))("placed gates and barriers in Play's room (SOCOM_ISO)", () => {
  it("a copied gate slides on a player's pull; a copied barrier is wrecked by a blast; the base's own untouched", async () => {
    const { IsoAssetSource } = await import('@s2u/archive');
    const { fsBlob } = await import('../../../../tools/fmv-spike');
    const { loadMap } = await import('../../src/loadMap');
    const { accessTemplates, withPlacedAccess } = await import('../../src/forge/placedAccess');
    const { simMapOfLoaded } = await import('../../src/net/loopback');
    const { Room } = await import('../../../match/src/room');
    const { PROTOCOL_VERSION, TICK_HZ, encodeCommands, faceToward, groundPolygons } = await import('../../src/sim');
    const source = new IsoAssetSource(fsBlob(ISO!));
    const [mp2, mp11, mp51] = [await loadMap(source, 'RUN/MP2.ZDB'), await loadMap(source, 'RUN/MP11.ZDB'), await loadMap(source, 'RUN/MP51.ZDB')];
    const gateT = accessTemplates(mp11, 'MP11').find((t) => t.kind === 'gate')!;
    const barrierT = accessTemplates(mp51, 'MP51')[0]!;
    // On open floor: two of Frostfire's own spawn slots, each far from the other.
    const slots = mp2.slots.filter((x) => x.onFloor);
    const gateAt = slots[0]!.position, barrierAt = slots.reduce((far, x) => (Math.hypot(x.position[0] - gateAt[0], x.position[2] - gateAt[2]) > Math.hypot(far.position[0] - gateAt[0], far.position[2] - gateAt[2]) ? x : far)).position;
    const { map, unplaced } = withPlacedAccess(mp2, [
      { kind: 'gate', source: 'MP11', name: gateT.name, at: gateAt, yaw: 0 },
      { kind: 'barrier', source: 'MP51', name: barrierT.name, at: barrierAt, yaw: 0 },
    ], (m) => (m.kind === 'gate' ? gateT : barrierT));
    expect(unplaced).toBe(0);

    let now = 0;
    const room = new Room(simMapOfLoaded(map), null, { now: () => now, random: () => 0.5, launchCountdownS: 0, roundSeconds: 600 });
    const frames: Uint8Array[] = [];
    room.hello(1, { send: (f: Uint8Array | string) => { if (typeof f !== 'string') frames.push(f); }, close: () => undefined },
      { type: 'hello', version: PROTOCOL_VERSION, name: '', map: 'MP2' }, '192.0.2.1');
    const step = (n = 1): void => { for (let i = 0; i < n; i++) { now += 1000 / TICK_HZ; room.step(); } };
    step(2);

    // The copied gate: its lever's action (the copy's, at the gate), a player standing in its reach, aimed at its leaf.
    const gate = room.map.gates![room.map.gates!.length - 1]!;
    const lever = gate.levers[0]!;
    const action = room.map.meta!.actions[lever.action]!;
    expect(action.path).toBe('worldmodel/forge_gate_1');
    // The gate as it stands: an owner of its leaf the room's world has on (not its wreck, which starts off).
    const leafOwner = gate.owners.map((i) => room.map.ground.owners[i]!).find((o) => room.world.isActive(o.path) && !/whats_left|bad_parts/.test(o.path))!;
    const leafPoly = groundPolygons(room.map.ground)[leafOwner.first]!;
    // Its face's middle, where the aim lands.
    const n = leafPoly.points.length / 3;
    const target: [number, number, number] = [0, 0, 0];
    for (let k = 0; k < leafPoly.points.length; k += 3) { target[0] += leafPoly.points[k]! / n; target[1] += leafPoly.points[k + 1]! / n; target[2] += leafPoly.points[k + 2]! / n; }
    const p = room.player(1)!;
    const feet = (side: number): [number, number, number] => [action.at[0] + side * 8, action.at[1] - 10, action.at[2] + side * 8];
    let pulled = false;
    const before = Array.from(leafPoly.points);
    for (const side of [1, -1]) {
      p.sim.walker.place(...feet(side));
      step(5);
      const at: [number, number, number] = [p.sim.walker.state.x, p.sim.walker.state.y, p.sim.walker.state.z];
      const look = faceToward({ feet: at, posture: p.sim.walker.posture }, target);
      p.sim.allowSnap();
      room.binary(1, encodeCommands({ viewTick: room.tick, commands: [{ seq: p.sim.seq + 1, forward: 0, right: 0, yaw: look.yaw, pitch: look.pitch, turn: 0, buttons: 0, stance: 0, weapon: 0 }] }));
      step(1);
      room.takeDrops();
      room.text(1, { type: 'action', seq: p.sim.seq, action: lever.action, surface: { path: leafOwner.path, point: target } });
      const drops = room.takeDrops();
      if (!drops || Object.keys(drops).length === 0) { pulled = true; break; }   // nothing dropped: the room took it
    }
    expect(pulled, 'the room took the pull on the copied gate').toBe(true);
    step(TICK_HZ * 4);
    const moved = Array.from(groundPolygons(room.map.ground)[leafOwner.first]!.points).map((v, i) => Math.abs(v - before[i]!));
    expect(Math.max(...moved), 'the copied gate slid in the room').toBeGreaterThan(15);

    // The copied barrier takes C4 as the page asks it (`../../src/grenade` `c4Now`): the view's ray from a player at it
    // strikes its face (`aimPick`), and that face is a live destructible's a charge is accepted on (`c4TargetOf`).
    const root = 'worldmodel/forge_barrier_1';
    {
      const { aimPick, c4TargetOf } = await import('../../src/equipment');
      const { groundGrid } = await import('../../src/mover');
      const good = room.map.ground.owners.find((o) => o.path.startsWith(root) && /good/.test(o.path) && room.world.isActive(o.path))!;
      expect(good, 'the copied barrier has live collision').toBeDefined();
      const face = groundPolygons(room.map.ground)[good.first]!;
      const c: [number, number, number] = [0, 0, 0];
      const k = face.points.length / 3;
      for (let i = 0; i < face.points.length; i += 3) { c[0] += face.points[i]! / k; c[1] += face.points[i + 1]! / k; c[2] += face.points[i + 2]! / k; }
      let planted = false;
      for (const [dx, dz] of [[20, 0], [-20, 0], [0, 20], [0, -20]] as const) {
        const eye = [c[0]! + dx, c[1]!, c[2]! + dz];
        const far = [c[0]! - dx * 10, c[1]!, c[2]! - dz * 10];
        const pick = aimPick(groundGrid(room.map.ground), eye, far, 'default');
        if (!pick || !pick.path.startsWith(root)) continue;
        const target = c4TargetOf(room.world.health, pick, [eye[0]!, c[1]! - 10, eye[2]!], 1000);
        if (target !== null) { planted = true; break; }
      }
      expect(planted, 'C4 takes on the copied barrier').toBe(true);
    }
    // A C4-sized blast at it through the room's own world; its wreck shows, the base's own stand.
    const wrecks = room.map.meta!.initial.filter((e) => e.deactivate && e.path.startsWith(root)).map((e) => e.path);
    expect(wrecks.length).toBeGreaterThan(0);
    for (const w of wrecks) expect(room.world.isActive(w), w).toBe(false);
    const centre: [number, number, number] = [barrierAt[0], barrierAt[1] + 8, barrierAt[2]];
    const killed = room.world.health.blastAt(centre, 100000, 40, () => true);
    expect(killed.length, 'the blast reached the copied barrier').toBeGreaterThan(0);
    step(TICK_HZ * 6);
    expect(wrecks.some((w) => room.world.isActive(w)), 'its wreck shows in the room').toBe(true);
    const own = room.map.meta!.scene!.destructibles.filter((d) => !d.root.startsWith('worldmodel/forge_'));
    expect(own.every((d) => !room.world.health.isSpent(d.id)), "the base's own destructibles stand").toBe(true);
  }, 300_000);
});
