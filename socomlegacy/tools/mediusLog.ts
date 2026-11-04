/**
 * A reader of a Horizon server's Medius log (the `dbug: Server.Medius.MLS` lines our Horizon writes, as in the archived
 * PCSX2 session `$SOCOM_PC_ROOT/logs/parity/s4_pcsx2/slice-Medius.log`, research 155 §1.3): the messages a client sent
 * that carry the 256-byte career record (`Stats:` as dash-separated hex: `MediusPlayerReport`,
 * `MediusAccountUpdateStatsRequest`), and the raw Lobby messages the server did not decode (`RawMediusMessage ...
 * MsgType:<n> Contents:`). A dev tool for the dev-host tests: the log stays on the host, never in this tree. Only a
 * line's `Message:RT.Models.<name>` counts -- the "Unhandled Medius Message: ..." warning that repeats a raw message is
 * not a second message. PROVE-1 (research 267) adds each line's connection and the ladder position answers (0xf1).
 */

/** A record a client message carried, with the log's line number (1-based). */
export interface StatsRecordLine {
  line: number;
  /** The message's model name, `MediusPlayerReport` or `MediusAccountUpdateStatsRequest`. */
  message: string;
  sessionKey: number;
  stats: Uint8Array;
}

/** A raw Lobby message the log shows undecoded, with its line number (1-based). */
export interface RawLobbyLine {
  line: number;
  contents: Uint8Array;
}

const HEX = '[0-9A-Fa-f]{2}(?:-[0-9A-Fa-f]{2})*';
const STATS = new RegExp(`Message:RT\\.Models\\.(\\w+)\\b.*?\\bSessionKey:(\\d+)\\b.*?\\bStats:(${HEX})`);
const RAW = new RegExp(`Message:RT\\.Models\\.RawMediusMessage MsgClass:MessageClassLobby MsgType:(\\d+) Contents:(${HEX})`);

const bytes = (hex: string): Uint8Array => new Uint8Array(hex.split('-').map((h) => parseInt(h, 16)));

/** Every line of `text` whose message carries a `Stats:` record, in the log's order. */
export function readStatsRecords(text: string): StatsRecordLine[] {
  const out: StatsRecordLine[] = [];
  text.split(/\r?\n/).forEach((l, i) => {
    const m = STATS.exec(l);
    if (m) out.push({ line: i + 1, message: m[1]!, sessionKey: Number(m[2]), stats: bytes(m[3]!) });
  });
  return out;
}

/** Every raw Lobby message of type `msgType` (decimal, as the log writes it) in `text`, in the log's order. */
export function readRawLobbyMessages(text: string, msgType: number): RawLobbyLine[] {
  const out: RawLobbyLine[] = [];
  text.split(/\r?\n/).forEach((l, i) => {
    const m = RAW.exec(l);
    if (m && Number(m[1]) === msgType) out.push({ line: i + 1, contents: bytes(m[2]!) });
  });
  return out;
}

const CONNECTION = /\[id: (0x[0-9A-Fa-f]+)/;

/**
 * The connection each line of `text` belongs to (1-based line -> the pipeline's `[id: 0x...]`, which a RECV and a SEND
 * line both carry): PROVE-1 pairs a raw Lobby message (no session key) with the record post of the same client by it.
 */
export function readConnections(text: string): Map<number, string> {
  const out = new Map<number, string>();
  text.split(/\r?\n/).forEach((l, i) => {
    const m = CONNECTION.exec(l);
    if (m) out.set(i + 1, m[1]!.toLowerCase());
  });
  return out;
}

/** A ladder position answer (Lobby 0xf1's response) the log shows, with its line number (1-based). */
export interface LadderPositionLine {
  line: number;
  /** `MediusCallbackStatus` by name (`MediusSuccess`, ...). */
  status: string;
  position: number;
  total: number;
}

/**
 * Our Horizon logs the answer as the model prints itself: `StatusCode:`, `LadderPosition:`, `TotalRankings:` in that
 * order (`desktop@be557831 server/horizon-server/RT.Models/Lobby/MediusLadderPosition_ExtraInfoResponse.cs:54-60`).
 */
const LADDER_POSITION = /Message:RT\.Models\.MediusLadderPosition_ExtraInfoResponse\b.*?\bStatusCode:(\w+)\s+LadderPosition:(\d+)\s+TotalRankings:(\d+)/;

/** Every `LadderPosition_ExtraInfo` answer (Lobby 0xf1's response) in `text`, in the log's order. */
export function readLadderPositionAnswers(text: string): LadderPositionLine[] {
  const out: LadderPositionLine[] = [];
  text.split(/\r?\n/).forEach((l, i) => {
    const m = LADDER_POSITION.exec(l);
    if (m) out.push({ line: i + 1, status: m[1]!, position: Number(m[2]), total: Number(m[3]) });
  });
  return out;
}
