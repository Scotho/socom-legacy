import { describe, expect, it } from 'vitest';
import { decodeCommands, encodeCommands } from '../../viewer/src/net/codec';
import { PROTOCOL_VERSION, type Command, type CommandBatch } from '../../viewer/src/net/protocol';
import { commandPlay, TRACE_ASIDE, tracePlay } from '../src/bots/tracePlay';

/**
 * PV-trace (the player's-view lane; a product-track instrument's definition): the bot traces hash a decoded command with
 * the view's three fields set aside by name (`../src/bots/tracePlay`), so their hashes do not move with protocol 16's
 * wire. This file holds the helper's shape. The REASON the three are no play -- the room runs nothing from them (PV.R4)
 * -- is held by `roomViewWire.test.ts`'s hostile-view test, which forges exactly `TRACE_ASIDE`'s fields.
 */
const command = (seq: number, over: Partial<Command> = {}): Command => ({
  seq, forward: 1, right: -0.5, yaw: 90, pitch: -10, turn: 0.25, buttons: 3, stance: 1, weapon: 2, separate: false, ...over,
});
const through = (batch: CommandBatch): CommandBatch => decodeCommands(encodeCommands(batch));

describe('PV-trace: what a command asks the room to do, for the bot traces\' hashes', () => {
  it('the fields set aside are the view\'s three, by name', () => {
    expect([...TRACE_ASIDE]).toEqual(['view', 'swayX', 'swayY']);
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(16);
  });

  it('a decoded command keeps every other field, in the decoder\'s order: the command as protocol 15 decoded it', () => {
    const decoded = through({ viewTick: 12.5, commands: [command(7, { view: 6, swayX: 3.5, swayY: -2 }), command(8, { raised: true })] });
    // The wire's own: decoded at 16 the tail is there (so the next assertions cut something real).
    expect(Object.keys(decoded.commands[0]!)).toEqual(['seq', 'forward', 'right', 'yaw', 'pitch', 'turn', 'buttons', 'stance', 'weapon', 'separate', 'view', 'swayX', 'swayY']);
    expect([decoded.commands[0]!.view, decoded.commands[0]!.swayX, decoded.commands[0]!.swayY]).toEqual([6, 3.5, -2]);
    const play = tracePlay(decoded);
    expect(Object.keys(play)).toEqual(['viewTick', 'commands']);
    // Protocol 15's decoded command, key for key (`viewer/src/net/codecV15.ts` `decodeCommandsV15`): `raised` only when set.
    expect(Object.keys(play.commands[0]!)).toEqual(['seq', 'forward', 'right', 'yaw', 'pitch', 'turn', 'buttons', 'stance', 'weapon', 'separate']);
    expect(Object.keys(play.commands[1]!)).toEqual(['seq', 'forward', 'right', 'yaw', 'pitch', 'turn', 'buttons', 'stance', 'weapon', 'separate', 'raised']);
    for (const [i, c] of play.commands.entries()) {
      for (const [k, v] of Object.entries(c)) expect(v, `command ${i} ${k}`).toBe((decoded.commands[i] as unknown as Record<string, unknown>)[k]);
    }
  });

  it('two batches that differ only in the view\'s tail hash alike; a difference in anything else shows', () => {
    const text = (b: CommandBatch): string => JSON.stringify([100, 3, tracePlay(through(b))]);
    const plain = { viewTick: 4, commands: [command(1), command(2)] };
    const scoped = { viewTick: 4, commands: [command(1, { view: 12, swayX: 60, swayY: -60 }), command(2, { view: 3 })] };
    expect(JSON.stringify(through(scoped))).not.toBe(JSON.stringify(through(plain)));   // the wire does carry it
    expect(text(scoped)).toBe(text(plain));
    for (const other of [{ forward: 0 }, { yaw: 91 }, { buttons: 1 }, { stance: 0 }, { weapon: 1 }, { separate: true }, { raised: true }] as Partial<Command>[]) {
      expect(text({ viewTick: 4, commands: [command(1, other), command(2)] }), JSON.stringify(other)).not.toBe(text(plain));
    }
    expect(text({ viewTick: 5, commands: plain.commands })).not.toBe(text(plain));
  });

  it('nothing handed in is changed', () => {
    const c = command(1, { view: 5, swayX: 1, swayY: 2 }), batch = { viewTick: 1, commands: [c] };
    const before = JSON.stringify(batch);
    expect(commandPlay(c)).not.toBe(c);
    tracePlay(batch);
    expect(JSON.stringify(batch)).toBe(before);
  });
});
