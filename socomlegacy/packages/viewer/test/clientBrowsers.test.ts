import {expect,it,vi} from 'vitest';
import type {Browser,BrowserContext} from '@playwright/test';
import {ClientBrowsers} from '../e2e/clientBrowsers';

function fakeBrowser(){
 return {newContext:vi.fn().mockResolvedValue({} as BrowserContext),close:vi.fn().mockResolvedValue(undefined)};
}
it('gives each client its own browser and closes each exactly once',async()=>{
 const a=fakeBrowser(),b=fakeBrowser();
 const launch=vi.fn().mockResolvedValueOnce(a).mockResolvedValueOnce(b);
 const clients=new ClientBrowsers(launch);
 await clients.newContext({viewport:{width:640,height:448}});await clients.newContext({});
 expect(launch).toHaveBeenCalledTimes(2);
 expect(a.newContext).toHaveBeenCalledWith({viewport:{width:640,height:448}});
 await clients.close();await clients.close();
 expect(a.close).toHaveBeenCalledTimes(1);expect(b.close).toHaveBeenCalledTimes(1);
 await expect(clients.newContext({})).rejects.toThrow('closed');
});
it('closes a browser even when its context failed to open',async()=>{
 const a=fakeBrowser();a.newContext.mockRejectedValueOnce(Error('context failed'));
 const clients=new ClientBrowsers(async()=>a as unknown as Browser);
 await expect(clients.newContext({})).rejects.toThrow('context failed');
 await clients.close();expect(a.close).toHaveBeenCalledTimes(1);
});
it('teardown waits for pending launches and prevents a late context escaping',async()=>{
 const a=fakeBrowser();let finish!:(value:Browser)=>void;
 const clients=new ClientBrowsers(()=>new Promise(resolve=>finish=resolve));
 const starting=clients.newContext({});const rejected=expect(starting).rejects.toThrow('closed');
 const closing=clients.close();finish(a as unknown as Browser);
 await closing;await rejected;expect(a.newContext).not.toHaveBeenCalled();expect(a.close).toHaveBeenCalledTimes(1);
});
it('attempts all browser closes and reports cleanup failures',async()=>{
 const a=fakeBrowser(),b=fakeBrowser();a.close.mockRejectedValueOnce(Error('close failed'));
 const clients=new ClientBrowsers(vi.fn().mockResolvedValueOnce(a).mockResolvedValueOnce(b));
 await clients.newContext({});await clients.newContext({});
 await expect(clients.close()).rejects.toThrow('browser cleanup');expect(b.close).toHaveBeenCalledTimes(1);
});
