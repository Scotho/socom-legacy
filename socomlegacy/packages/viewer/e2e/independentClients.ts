import {test as base,type BrowserContext,type BrowserContextOptions} from '@playwright/test';
import {ClientBrowsers} from './clientBrowsers';

/** Same project launch options (including SwiftShader), one process per client.
 * MP1 diagnostics found shared-browser warm-up exceeding120s on this host.
 * Independent processes keep normal live rendering on every client throughout play.
 */
export const test=base.extend<{clientContext:(options:BrowserContextOptions)=>Promise<BrowserContext>}>({
  clientContext:async({playwright,browserName,launchOptions,headless,channel},use)=>{
    const clients=new ClientBrowsers(()=>playwright[browserName].launch({...launchOptions,headless,channel}));
    try{await use(options=>clients.newContext(options));}
    finally{await clients.close();}
  },
});
