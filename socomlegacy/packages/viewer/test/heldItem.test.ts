import { describe, expect, it } from 'vitest';
import { parseRdr, Zar } from '@s2u/archive';
import { gearMatrix, parseCharacterTable, transformPoint } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import * as heldItem from '../src/heldItem';

/**
 * NU-6 P2 (research 324 §1.6, §6 P2): the carried rocket launcher's mount, read through the repository's own reader.
 * The body's set-up makes the `launcher` node under `spinehi` (`+0x310`) with no matrix of its own (`FUN_00316e30`'s new
 * node, `FUN_0028ec30`, D:L419668-419676, kept at `+0x3a8`); the kit's fill looks up the `character.rdr` gear named
 * `launcher` (`FUN_0058b0f0` D:L447285-447286, the name at 0x65d198; `FUN_0059a730`, the gear list by name) and pairs it
 * with that node (D:L447287-447295, the body's `+0x37c` list); `FUN_0058b040` (D:L447235-447266) writes the gear's
 * translation and turn into the node -- at the launcher's lower (`FUN_005a60d0(.., 4)` D:L461769-461784, the node back
 * under `spinehi`), at the kit's switch (`FUN_005c50b0` D:L479053) and at a launcher claim (`FUN_0059f0c0`
 * D:L458241-458249) -- and `FUN_0058acc0` (D:L447128-447229) writes it on every clip that has no track for the node
 * (the idle, walk and run clips carry no `launcher` track: research 270, `HOLSTER_TRACK_READING`). So the carried
 * launcher hangs at the `launcher` gear's offset on `spinehi`, as the slung rifle hangs at the `rifle` gear's on
 * `spinelo` (`./body` `carries`).
 */
const READERC = fixture('RUN/READERC.ZAR');

describe("NU-6 P2: the carried launcher's mount, character.rdr's `launcher` gear on spinehi (REMOTE_LAUNCHER_MOUNT_READING)", () => {
  const read = (heldItem as unknown as Record<string, unknown>).REMOTE_LAUNCHER_MOUNT_READING as
    { gear: string; part: string; translation: readonly number[]; rotation: readonly number[]; angleUnits: 'DEG' | 'RAD' } | undefined;
  const matrixOf = (heldItem as unknown as Record<string, unknown>).launcherCarryMatrix as (() => Float32Array) | undefined;

  it("transcribes the gear's record: `spinehi`, (0, -1.61, -1.5), turned (463.68, 190.57, 181.51) degrees; its matrix is the gear's (gearMatrix)", () => {
    expect(read).toEqual({ gear: 'launcher', part: 'spinehi', translation: [0, -1.61, -1.5], rotation: [463.68, 190.57, 181.51], angleUnits: 'DEG' });
    const m = matrixOf!();
    const want = gearMatrix({ name: 'launcher', model: 'NONAME', part: 'spinehi', translation: [0, -1.61, -1.5], rotation: [463.68, 190.57, 181.51] }, 'DEG');
    for (let i = 0; i < 16; i++) expect(m[i]).toBeCloseTo(want[i]!, 6);
    expect(transformPoint(m, 0, 0, 0).map((v) => Math.round(v * 1e4) / 1e4 + 0)).toEqual([0, -1.61, -1.5]);   // the grip's place on spinehi
  });

  it.skipIf(!READERC)(`re-reads it from READERC.ZAR's character.rdr through parseCharacterTable${READERC ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
    const z = Zar.parse(READERC!);
    const table = parseCharacterTable(parseRdr(z.data(z.root.children.find((k) => k.name === 'character.rdr')!)));
    const gear = table.gear.get('launcher')!;
    expect(gear).toEqual({ name: 'launcher', model: 'NONAME', part: read!.part, translation: [...read!.translation], rotation: [...read!.rotation] });
    expect(table.angleUnits).toBe(read!.angleUnits);
    // The gear list is one for every character (`FUN_0059a730` walks the global list by name): no side, no type.
    expect([...table.gear.keys()].filter((n) => n === 'launcher')).toHaveLength(1);
    const m = matrixOf!(), disc = gearMatrix(gear, table.angleUnits);
    for (let i = 0; i < 16; i++) expect(m[i]).toBeCloseTo(disc[i]!, 6);
  });
});
