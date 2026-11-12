import { NETCNF_ATTACH_CONTENTS_READING, NETCNF_MALFORMED_RESULT_PLACEHOLDER, ensureNetCnf, netCnfCombinationList, type Libmc, type NetCnfEnsure } from '@s2u/card';
import { NetLoginCommands, type FrontEndMachine, type NetCnfIop, type UiCommandHost, type UiVarManager, type ZAnimUiCommand } from '@s2u/ui';
import { sharedServer } from './online';

/**
 * ONL-01's rows connected on the page (web research 144 §4): `@s2u/ui`'s `NetLoginCommands` -- the NetCnf layer
 * LOGIN TO SOCOM II ONLINE dispatches -- registered in PLAT-08's host over an eznetcnf stand-in that answers from the
 * page's virtual card: RPC 1 (`ezNetCnfGetCombinationList`) is ONL-01a's `netCnfCombinationList` over PLAT-26a's libmc
 * (the one MENU-01a's `connectMenuCommands` made, handed in), RPC 2 (`ezNetCnfGetNetcnfifData`) keeps the chosen
 * combination's server for the screens after LOGIN (the DNAS screen and the connect, ONL-03 / ONL-07), and the
 * interface list is the one adaptor the configuration names (OC-1 ruled the console's way, OT.R3).
 *
 * **The write at first use** (OT.R3: "a card with none gets it written at first use"; the original never writes the
 * configuration from the game -- Sony's set-up program does, behind EDIT NETWORK CONFIGURATIONS, which is not built,
 * ONL-02): LOGIN's first `NetCnfOpen(mc0:)` on a slot 1 without the `BWNETCNF` index writes the folder naming
 * `server` (`ensureNetCnf`, research 136 §4) before the list is read, so the console's saved-configuration screen is
 * what the page shows ("1 Setting 1", the MEMORY CARD slot, the HARDWARE line). Slot 2 is left as a second card is
 * on the console -- without one, so SELECT MEMORY CARD slot 2 shows #581 as the original does
 * (`NETCNF_FIRST_USE_WRITE_ADAPTATION`). A browser adaptation: nothing is drawn for the write (research 136 §4).
 */

/**
 * NETCNF_FIRST_USE_WRITE_ADAPTATION: where OT.R3's write happens -- slot 1 (`mc0:`), inside LOGIN's first
 * `NetCnfOpen` of it, never slot 2. No original: the console's card holds what Sony's program wrote.
 */
export const NETCNF_FIRST_USE_WRITE_ADAPTATION = 'slot 1, at LOGIN\'s first NetCnfOpen(mc0:)' as const;

/** The adaptor `NetGetInterfaceList` lists: the device the card's index names (`vendor/product`, research 136 R136.2). */
export const NET_ADAPTOR_NAME = `${NETCNF_ATTACH_CONTENTS_READING.dev.vendor}/${NETCNF_ATTACH_CONTENTS_READING.dev.product}`;

export interface NetLoginHostOptions {
  machine: () => FrontEndMachine;
  uiVars: UiVarManager;
  /** PLAT-26a's libmc over the page's slot store (`connectMenuCommands`' answer); null: no card (every list empty). */
  libmc: Libmc | null;
  /**
   * Our central server, written into the configuration at first use; by default the page's Shared service (TRS-1:
   * `./online` `sharedServer` of the page's location -- this site's own service, never the retired `SHARED_SERVER`; nothing
   * reads it back but the selection).
   */
  server?: string;
  /** Where the first-use write's result goes (the console by default). */
  log?: (line: string) => void;
  /** LOGIN's connect hold (OT.R20), seconds; absent, `LOGIN_CONNECT_HOLD_SECONDS_PLACEHOLDER` (OT.R121's cover: 0). */
  connectHoldSeconds?: number;
}

/** The eznetcnf stand-in's state the page keeps: the server of the combination LOGIN selected (RPC 2), or null. */
export interface NetLoginSelection {
  server: string | null;
  key: string | null;
}

/** What `connectNetLogin` answers: the commands, the IOP stand-in, the selection the screens after LOGIN read (ONL-03 / ONL-07: `FrontEndSession.netLogin`), the first-use write's result. */
export interface NetLoginConnection { commands: NetLoginCommands; iop: NetCnfIop; selection: NetLoginSelection; ensured: () => NetCnfEnsure | null }

/** The commands made and registered in `host`, the IOP stand-in, and the selection the screens after LOGIN read. */
export function connectNetLogin(host: UiCommandHost, o: NetLoginHostOptions): NetLoginConnection {
  const server = o.server ?? sharedServer(globalThis.location ?? { protocol: 'http:', host: 'localhost' });
  const log = o.log ?? ((line: string) => console.warn(line));
  const selection: NetLoginSelection = { server: null, key: null };
  let ensured: NetCnfEnsure | null = null;
  const iop: NetCnfIop = {
    combinationList: (device) => {
      if (!o.libmc) return { result: 0, entries: [] };
      if (!/^mc[01]:$/i.test(device)) return { result: NETCNF_MALFORMED_RESULT_PLACEHOLDER, entries: [] };   // a path no card is on: a read failure (#586), as a bad path would be
      if (/^mc0:$/i.test(device)) {                                          // NETCNF_FIRST_USE_WRITE_ADAPTATION
        ensured = ensureNetCnf(o.libmc, 0, server);
        if (ensured.result < 0) log(`[netcnf] the configuration could not be written on slot 1: ${ensured.result}`);
      }
      return netCnfCombinationList(o.libmc, device);
    },
    selectCombination: (device, key) => {
      if (!o.libmc || !/^mc[01]:$/i.test(device)) return -1;
      const hit = netCnfCombinationList(o.libmc, device).entries.find((e) => e.key === key);
      if (!hit) return -1;
      selection.key = key;
      selection.server = hit.server ?? null;
      return 0;
    },
    interfaces: () => [NET_ADAPTOR_NAME],
  };
  const commands = new NetLoginCommands({
    valves: () => o.machine().valves,
    uiVars: o.uiVars,
    iop,
    inputString: (cmd: ZAnimUiCommand) => o.machine().shell()?.inputString(cmd.anim) ?? null,
    event: (kind) => { o.machine().shell()?.event(kind); },
    ...(o.connectHoldSeconds !== undefined ? { connectHoldSeconds: o.connectHoldSeconds } : {}),
  });
  commands.register(host);
  return { commands, iop, selection, ensured: () => ensured };
}
