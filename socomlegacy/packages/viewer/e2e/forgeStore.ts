import type { Page } from '@playwright/test';

/**
 * R3-B (FCW-07a part 2; a browser adaptation, no original): a forge list as the page's saves store holds it now --
 * IndexedDB `s2u-forge`, one `{generation, text}` record per list under `current` (`../src/forge/savesStore`); '' when
 * never written. The page keeps its lists there, never in localStorage, whose lists move there once, at the first load.
 */
export async function forgeStoredList(page: Page, name: 'saves' | 'savesAside' | 'autosave' | 'autosaveAside'): Promise<string> {
  return page.evaluate((list) => new Promise<string>((done) => {
    const req = indexedDB.open('s2u-forge');
    req.onerror = () => done('');
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(list)) { db.close(); done(''); return; }
      const get = db.transaction(list, 'readonly').objectStore(list).get('current');
      get.onsuccess = () => { db.close(); done((get.result as { text?: string } | undefined)?.text ?? ''); };
      get.onerror = () => { db.close(); done(''); };
    };
  }), name);
}
