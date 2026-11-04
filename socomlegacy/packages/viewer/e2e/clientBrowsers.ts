import type {Browser,BrowserContext,BrowserContextOptions} from '@playwright/test';

/** Test-host adaptation: independent browser/GPU processes represent separate computers.
 * No page is frozen, and no game state, input, timeout or assertion is changed.
 * Track pending launches too, so a test timeout cannot leave an orphan browser.
 */
export class ClientBrowsers {
  private readonly launches:Promise<Browser>[]=[];
  private closing:Promise<void>|null=null;
  constructor(private readonly launch:()=>Promise<Browser>){}

  async newContext(options:BrowserContextOptions):Promise<BrowserContext>{
    if(this.closing)throw Error('Test client browsers are closed');
    const pending=this.launch();this.launches.push(pending);
    const browser=await pending;
    if(this.closing)throw Error('Test client browsers are closed');
    return browser.newContext(options);
  }

  close():Promise<void>{
    this.closing??=this.closeAll();
    return this.closing;
  }
  private async closeAll():Promise<void>{
    const browsers=await Promise.allSettled(this.launches);
    const closed=await Promise.allSettled(browsers.flatMap(result=>result.status==='fulfilled'?[result.value.close()]:[]));
    const failures=closed.flatMap(result=>result.status==='rejected'?[result.reason]:[]);
    if(failures.length)throw new AggregateError(failures,'Independent test browser cleanup failed');
  }
}
