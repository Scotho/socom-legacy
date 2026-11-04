import { Libmc, PersonaCard, UI_VAR_MODULE, type CardSlots } from '@s2u/card';
import { initSystemTuners, OptionGlobals, restoreUiVarModule, serializeUiVars, UiVarManager, uiVarModule } from '@s2u/ui';
import { controllerConfigs, type ControllerConfigs } from './controllerConfigs';
import type { FrontEndDisc } from './frontEnd';
import type { NativeOptionsState } from './nativeOptionsHost';
import { bootValves, restoreValveModule, valveModule, VALVE_MODULE } from './originalOptions';
import { pageCard } from './pageStore';
import { connectNativeOptions } from './nativeOptionsContext';

/** MLS.R7 browser adaptation: /testroom's Options state without a front-end, boot, network registration or defaults
 * reinitialization on reopen. The same three modules as the front-end serializer are kept: personas, UI vars, valves.
 */
export function pageNativeOptionsState(disc: FrontEndDisc, slots: CardSlots = pageCard, configs: ControllerConfigs = controllerConfigs): NativeOptionsState {
  const libmc = new Libmc(slots, { log: () => {} });
  let card = new PersonaCard(libmc, 0);
  const first = card.load();
  if (first.result < 0) {
    const second = new PersonaCard(libmc, 1);
    if (second.load().result >= 0) card = second;
  } else if (first.malformed) card.discardMalformed();
  const valves = bootValves(disc.globalValves ?? []), uiVars = new UiVarManager(), globals = new OptionGlobals();
  initSystemTuners(uiVars);
  restoreUiVarModule(uiVars, card.part(UI_VAR_MODULE));
  restoreValveModule(valves, card.part(VALVE_MODULE));
  const offGlobals = globals.observe(() => configs.store(name => globals.value(name)));
  globals.store(valves);
  return connectNativeOptions(slots, {
    valves, uiVars, globals, configs, libmc,
    dispose: offGlobals,
    config: {
      contents: () => {
        card.setPart(UI_VAR_MODULE, uiVarModule(serializeUiVars(uiVars, valves)));
        card.setPart(VALVE_MODULE, valveModule(valves, card.part(VALVE_MODULE)));
        return card.contents();
      },
      restore: data => {
        const ok = card.restore(data);
        if (!ok) card.discardMalformed();
        restoreUiVarModule(uiVars, card.part(UI_VAR_MODULE));
        restoreValveModule(valves, card.part(VALVE_MODULE));
        return ok;
      },
    },
  });
}
