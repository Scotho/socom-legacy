/**
 * Whether a test-room mod reload may open the solo ARMORY.
 *
 * The reload's map load seats the offline match on the ARMORY data still in memory, under the loading
 * screen. The fresh `armory` reply then closes that screen (`Armory.setData`), and the close starts the
 * offline room (`soloAfterArmory`). A screen opened from that reply does not stay. Open only once this
 * load's ARMORY data is in and the loading screen is down (`main.ts` `tryReopenArmory`), and do not seat
 * while the reload is waiting.
 */
export function shouldReopenArmory(state: {
  /** `load` was asked to open the ARMORY after this map (`reopenArmory`). */
  asked: boolean;
  /** This load's `armory` reply has been applied. */
  dataLanded: boolean;
  /** The loading overlay is down (`ui.setLoading(false)` at first paint). */
  loadFinished: boolean;
  /** Solo play with the ARMORY allowed (`playOn && SOLO_MATCH && !NO_ARMORY`). */
  solo: boolean;
}): boolean {
  return state.asked && state.dataLanded && state.loadFinished && state.solo;
}
