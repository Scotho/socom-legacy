/**
 * The disc objects a Forge placement copies unless it names one (a browser adaptation, FG.R2): each a disc map's own,
 * by its archive's stem and its node, used by the planner (`./agent/commands`) and the page alike.
 */

/** The turret a placement copies unless it names one: Crossroads' RMG (MP72 `mp72_turret01`, PKM TURRET), the port's best known. */
export const DEFAULT_TURRET = { source: 'MP72', name: 'mp72_turret01' } as const;
/** The door a placement copies unless it names one: Frostfire's bdoor_4 (MP2; `singleDoor_right`, reach 30). */
export const DEFAULT_DOOR = { source: 'MP2', name: 'bdoor_4' } as const;
/** The gate a placement copies unless it names one: Death Trap's access1 (MP11; its lever slides it 20, C4 wrecks it). */
export const DEFAULT_GATE = { source: 'MP11', name: 'access1' } as const;
/** The C4 barrier a placement copies unless it names one: Vigilance's access1 (MP51). */
export const DEFAULT_BARRIER = { source: 'MP51', name: 'access1' } as const;
