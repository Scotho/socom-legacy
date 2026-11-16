import type { Command, CommandBatch } from '../../../viewer/src/net/protocol';

/**
 * PV-trace (the player's-view lane; `docs/plans/2026-11-11-players-view.md`, the Log 2026-11-12T15:07Z; a product-track
 * instrument's definition with no original -- the game had no bots and no such wire): what a command ASKS THE ROOM TO DO,
 * for the fixed-seed bot traces' hashes (`tools/bot-trace.ts`, BOP-2; `test/botNavBudget.test.ts`, BOP-S).
 *
 * Since protocol 16 (WIRE-16, research 402 section 3) a decoded command carries three fields for a watcher's picture of
 * the sender -- `view`, `swayX`, `swayY`. The room stores them on the seat and copies them into the body's tail, and runs
 * NOTHING from them (PV.R4): no mover, cone, rule or draw reads them. So they are not play, and a trace that hashed them
 * would move with the wire and not with the bots. They are set aside here BY NAME (`TRACE_ASIDE`), and what is left is,
 * key for key and in the same order, the command as protocol 15 decoded it: a trace's hash is comparable across the bump.
 *
 * What holds the reason: `test/roomViewWire.test.ts`'s hostile-view test forges exactly the fields named here, on every
 * command of a seeded match, and compares the two rooms -- seats, bots, draws, recording. If a later change makes the room
 * read one of them, that test goes red, the field is play, and it comes off this list (the traces take it back in).
 *
 * The two hash pins that use this (`botNavBudget` S3 (a), `botTrace`'s 600-tick pin) are red on `main` for LATER 944's
 * own reason (bot navigation); nothing is re-pinned here. By this definition their hashes are the same before and after
 * the protocol bump, so whoever settles 944 pins a hash that does not move with the wire.
 */
export const TRACE_ASIDE = ['view', 'swayX', 'swayY'] as const satisfies readonly (keyof Command)[];

/** One command as the traces hash it: every field but `TRACE_ASIDE`'s, the keys in the decoder's order. Not mutated. */
export function commandPlay(command: Command): Omit<Command, (typeof TRACE_ASIDE)[number]> {
  const play: Partial<Command> = { ...command };
  for (const name of TRACE_ASIDE) delete play[name];
  return play as Omit<Command, (typeof TRACE_ASIDE)[number]>;
}

/** A decoded batch as the traces hash it: the batch with each command through `commandPlay`. */
export function tracePlay(batch: CommandBatch): Omit<CommandBatch, 'commands'> & { commands: ReturnType<typeof commandPlay>[] } {
  return { ...batch, commands: batch.commands.map(commandPlay) };
}
