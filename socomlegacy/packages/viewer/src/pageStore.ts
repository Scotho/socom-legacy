/**
 * Where the page's storage is composed (PLAT-24, PLAT-25; research 99 §2-§4, §7): the browser's objects -- `localStorage`,
 * `sessionStorage`, `indexedDB`, `navigator.storage` -- are named here, and only here, and handed to `@s2u/card`, which
 * never names them (W6.R2). Every page module reads and writes its keys through `pageSettings` (or `tabSettings`).
 *
 * The page's keys **migrate in place** (W6.R5, the owner 2026-10-01: migrate): they are per-viewer conveniences, which
 * stay on localStorage (MISSION R7; the PLAT-24 block; research 99 §2), so the settings path reads each under the name it always had. A
 * visitor's stored choices are read as before, the old keys are never moved or removed, and there is nothing to import
 * twice. Two keys are not the page's: `s2u.mp.name`, which OPT-04 migrated into the card's persona NAME (read once,
 * left in place) -- from then on the front end reads the persona alone, and the key is `/testroom`'s development name
 * (its W3.R12 field, the name its matches send, the e2e specs' seeding; LATER 26, struck: kept by the merge controller's
 * call) -- and `s2u.armory.v1.*`, left for the task
 * that moves it onto the card (OPT-20, `WeapProfile_%d.dat`; `armory.ts`). The tab's session token
 * (`./net/session`, sessionStorage) has its own guarded injection and stays there.
 */
import { CardSlots, IdbStore, Settings, StoreError, storeError, type FailureReport, type WriteResult } from '@s2u/card';
import type { TipStore } from './mobileTip';

/** The map remembered from the last visit (`main.ts` `wantedArchive`). */
export const LAST_MAP_KEY = 's2u.viewer.lastMap';
/** FORGE (`./forge/page`): the layout autosaved, and the view's switches -- the names as first written (migrate in place). */
export const FORGE_LAYOUT_KEY = 's2u-forge-layout';
export const FORGE_VIEW_KEY = 's2u-forge-view';
/** FORGE (FUI-1, `./forge/shell/panel`): which of the Forge's registered panels are open, one record (a browser adaptation). */
export const FORGE_PANELS_KEY = 's2u-forge-panels';

/**
 * Every key the page keeps (research 99 §4, the inventory). `pageStore.test.ts` holds the viewer's sources to it: a new
 * `s2u.viewer.*` key is added here, or the test fails.
 */
export const PAGE_SETTING_KEYS: readonly string[] = [
  's2u.viewer.mobileLayout.v1',      // mobileLayout.ts: touch positions, separately for portrait and landscape
  's2u.viewer.recom',                // features.ts PLAY_KEY: the Mode (Play / Explore)
  's2u.viewer.online',               // online.ts ONLINE_KEY: Online's choice
  's2u.viewer.rules',                // rules.ts RULES_KEY: the test room's Rules setting (OT.R71)
  's2u.viewer.controlsTab',          // controlsList.ts CONTROLS_TAB_KEY: the Controls popover's tab
  's2u.viewer.panelOpen',            // ui.ts: the settings panel open or folded
  's2u.viewer.graphicsBackend',      // graphicsBackend.ts: automatic, WebGL2 compatibility or Xbox preset, read at renderer creation
  's2u.viewer.look',                 // ui.ts: the picture (ps2 / modern)
  's2u.viewer.picture',              // picture.ts PICTURE_KEY: the front end's picture, VIDEO MODE's (OT.R79: modern / ps2 / experimental)
  's2u.viewer.detailDistance',       // detailDistance.ts DETAIL_DISTANCE_KEY: the detail distance factor, launcher Options and the Forge (PF.R60)
  's2u.viewer.volume',               // ui.ts: the page's volume slider
  's2u.viewer.muted',                // ui.ts: the page's mute
  's2u.viewer.mouseLook',            // ui.ts: the mouse look's options (JSON)
  's2u.viewer.mobileTipDismissed',   // mobileTip.ts: the phone's tip, dismissed for good
  's2u.viewer.mobileTipSeen',        // mobileTip.ts: the tip shown this visit (sessionStorage)
  's2u.viewer.showFps',              // matchFps.ts FPS_SHOWN_KEY: the match's SHOW FPS readout on or off (cq41E0VR, a browser adaptation)
  's2u.viewer.video',                // videoSettings.ts VIDEO_SETTINGS_KEY: render scale and shadows, one JSON value (CPS.R7, a browser adaptation)
  's2u.startup.v1',                  // startupSettings.ts SETUP_KEY: the setup page's prefix
  's2u.startup.v1.pad.selection',    // setupPad.ts PAD_SELECTION_KEY (a pad's own profile is `s2u.startup.v1.pad.<id JSON>`, controllerInput.ts)
  's2u.startup.v1.stanceMode',       // startupSettings.ts STANCE_MODE_KEY: the Stance mode, the prone-pop or Separate (PP-5)
  's2u.startup.v1.pad.overlay',      // modern/overlay/binding.ts OVERLAY_BUTTON_KEY: the overlay's opening button (MU2-16, a browser adaptation)
  's2u.startup.v1.pad.extras',       // padExtras.ts PAD_EXTRAS_PREFIX: a pad profile's extra binds, `.pad.extras.<id JSON>` (h59U9CLb, a browser adaptation)
  's2u.startup.v1.mic',              // gameMicrophone.ts MIC_DEVICE_KEY: the chosen input device
  's2u.startup.v1.mic.enabled',      // gameMicrophone.ts MIC_ENABLED_KEY: use in game
  's2u.launch.v1.testroom',          // launchSettings/presets.ts presetKey: /testroom's launch presets (PTT-9, a development build's)
  's2u.launch.v1.playtest',          // launchSettings/presets.ts presetKey: /playtest's launch presets (PTT-9, a development build's)
  LAST_MAP_KEY,
  FORGE_LAYOUT_KEY,                  // forge/page.ts: the layout autosaved (a recipe); since R3-B read once, moved to forge/savesStore.ts
  FORGE_VIEW_KEY,                    // forge/page.ts: the view panel's switches
  FORGE_PANELS_KEY,                  // forge/shell/panel.ts: the docks' panels open or folded (FUI-1)
  's2u-forge-favourites',            // forge/favourites.ts FAVOURITES_KEY: the starred props
  'forge.agent.permissions.shortForm', // agent/panel.ts SHORT_FORM_KEY: the grant panel's "only what the agent asked for" (FUI-25)
  's2u.testroom.mods.v1',            // mods/store.ts MODS_PRESENT_KEY: this browser keeps a test-room mod (the store opens only then)
  's2u-forge-saves',                 // forge/saves.ts FORGE_SAVES_KEY: named layouts; since R3-B read once, moved to forge/savesStore.ts
  's2u-forge-saves-aside',           // forge/saves.ts FORGE_SAVES_ASIDE_KEY: a saved list this build cannot read, set aside
  's2u-forge-layout-aside',          // forge/saves.ts FORGE_AUTOSAVE_ASIDE_KEY: an autosave this build cannot read, set aside (LATER 193)
  // forge/savesStore.ts RECOVERED_SUFFIX (FCW-07a part 2, R3-B): each list above as it was when it moved into the forge's
  // IndexedDB store (`s2u-forge`), kept once and never deleted; the four keys above are cleared once moved
  's2u-forge-saves-recovered-v3',
  's2u-forge-saves-aside-recovered-v3',
  's2u-forge-layout-recovered-v3',
  's2u-forge-layout-aside-recovered-v3',
  's2u.console.v1.sounds',           // console/adapters/options.ts CONSOLE_KEYS.sounds: the launcher's UI sounds on or off (CX-52)
  's2u.console.v1.soundVolume',      // console/adapters/options.ts CONSOLE_KEYS.soundVolume: their volume (CX-52)
  's2u-forge-lobby-window',          // forge/lobby/window.ts FORGE_LOBBY_WINDOW_KEY: the lobby popup's place and size
  's2u.console.agreement.v1',        // console/adapters/session.ts AGREEMENT_ACCEPTED_KEY: the accounts' agreement accepted (AGREEMENT-ONCE)
  's2u.replay.camera.v1',            // modern/replays/cameraChoice.ts REPLAY_CAMERA_KEY: the replay viewer's camera choice (RV2-06, RV2.R1)
];

/** A report that warns at a page's first storage failure (one line, not one per write) and counts them all. */
export function reportOnce(warn: (message: string) => void = (m) => console.warn(m)): FailureReport & { failures(): number } {
  let failures = 0;
  const report = (error: StoreError): void => {
    if (failures++ === 0) warn(`[storage] ${error.message}; this page's settings are kept for this visit only (${String(error.cause ?? '')})`);
  };
  return Object.assign(report, { failures: () => failures });
}

/** The page's report: every settings and card failure of this page goes here. */
export const pageReport = reportOnce();

/** The page's own settings, on localStorage (asked for at each call: in some browsers reaching it throws). */
export const pageSettings = new Settings(() => globalThis.localStorage, pageReport);

/** The tab's settings, on sessionStorage (the phone tip's "shown this visit"). */
export const tabSettings = new Settings(() => globalThis.sessionStorage, pageReport);

/** A `TipStore` (`./mobileTip`) over a settings path: guarded both ways, a failed write already reported. */
export function tipStoreOf(settings: Settings): TipStore {
  return {
    get: (key) => settings.get(key),
    set: (key, value) => { settings.set(key, value); },
  };
}

/** The map remembered from last time, or null. */
export function readLastMap(settings: Settings = pageSettings): string | null {
  return settings.get(LAST_MAP_KEY);
}
export function writeLastMap(archive: string, settings: Settings = pageSettings): WriteResult {
  return settings.set(LAST_MAP_KEY, archive);
}

/**
 * **The memory card** (the owner's ruling R7, 2026-10-01; PLAT-25; research 99 §7): two virtual slots, one JSON record
 * each, on the page's localStorage (`s2u.card.v1.slot1`, `s2u.card.v1.slot2`). The storage is asked for at each
 * operation (reaching it throws in some browsers; none reads as no card in both slots). A save the browser refuses
 * goes to the page's report as well as to its caller. Its users are PLAT-26's libmc and OPT-07's card control.
 */
export const pageCard = new CardSlots(() => globalThis.localStorage, pageReport, { now: () => Date.now() });

/**
 * **Parked: not the card's store.** PLAT-24's IndexedDB `ByteStore`, with the browser's `StorageManager` for the quota.
 * R7 put the card on localStorage (`pageCard` above); the owner parked this backend (R7 spec §7, amendment 4) for
 * expansion data that outgrows localStorage. Nothing calls it today. A browser without IndexedDB (or one that refuses
 * it) gets a store that reads empty and refuses writes as `unavailable`.
 */
export function openParkedIdbStore(): IdbStore {
  let factory: IDBFactory | undefined;
  let quota: StorageManager | undefined;
  try { factory = globalThis.indexedDB; } catch { /* reaching it threw: no store */ }
  try { quota = globalThis.navigator?.storage; } catch { /* no estimate */ }
  return new IdbStore(factory, { quota, report: pageReport });
}

/**
 * **The page's records** (disc-access plan DA-7, DA-8; research 306 §3): what the page keeps in IndexedDB that is not
 * bytes and not a setting -- the remembered disc's `FileSystemHandle` (`./discMemory`; the browser stores a handle by
 * structured clone, which localStorage cannot hold), for DA-8 the stored copy's record, and for DX-1 the extraction's.
 * A **browser adaptation** (DA.R2, DA.R3): the original reads its own disc; nothing here is the game's or leaves the
 * player's machine. Its own
 * database, `PAGE_RECORDS_DB`, beside the parked card store's (`s2u.card`, `openParkedIdbStore`), with one object store
 * keyed by slot name; a slot not in `PAGE_RECORD_SLOTS` is refused, so every record the page keeps is listed here.
 * Each call opens the database and closes it after: a disc is remembered or read a few times a visit, so no connection
 * is held across a tab's life (and none blocks another tab's).
 */
export const PAGE_RECORDS_DB = 's2u.page';
/** Its schema version: 1, one object store. */
export const PAGE_RECORDS_VERSION = 1;
/** The object store holding every record, keyed by slot. */
export const PAGE_RECORDS_STORE = 'records';
/** DA-7: the remembered disc (`./discMemory` `rememberDisc`): its handle, name, kind and identity. */
export const DISC_HANDLE_SLOT = 'disc.handle';
/** DA-8: the stored copy's record (`./discCopy` `copyDisc` writes it; `storedCopy` and `./discMemory` `hasStoredCopy` read it). */
export const DISC_COPY_SLOT = 'disc.copy';
/**
 * DX-1: the extraction's record (`./discExtract` `extractDisc` writes it after each file; `storedExtraction` and
 * `extractionState` read it): the disc's identity, the read set's version, the backend, and each file's size, SHA-256
 * and whether it is done. A browser adaptation (FI.R2, FI.R6).
 */
export const DISC_EXTRACT_SLOT = 'disc.extract';
/** Every slot the page's records hold. */
export const PAGE_RECORD_SLOTS: readonly string[] = [DISC_HANDLE_SLOT, DISC_COPY_SLOT, DISC_EXTRACT_SLOT];

/**
 * The page's records: structured values under named slots. `get` reads a slot (undefined when it is empty, or when the
 * store cannot be opened or read -- that failure handed to the report); `put` and `delete` reject with a `StoreError`
 * (`unavailable` with no IndexedDB). A slot outside `PAGE_RECORD_SLOTS` is a programming error: thrown as a `TypeError`.
 */
export interface RecordStore {
  get(slot: string): Promise<unknown>;
  put(slot: string, value: unknown): Promise<void>;
  delete(slot: string): Promise<void>;
}

/**
 * The page's records over the `IDBFactory` that `factory` answers, asked for at each call (reaching the browser's throws
 * in some browsers; none, and the store is `unavailable`). The page's own is `pageRecords()`; a test passes a fake.
 */
export function openPageRecords(factory: () => IDBFactory | null | undefined, report: FailureReport = pageReport): RecordStore {
  const named = (slot: string): string => {
    if (!PAGE_RECORD_SLOTS.includes(slot)) throw new TypeError(`no page record slot "${slot}" (pageStore.ts PAGE_RECORD_SLOTS)`);
    return slot;
  };
  const open = (): Promise<IDBDatabase> => new Promise<IDBDatabase>((resolve, reject) => {
    let idb: IDBFactory | null | undefined;
    let req: IDBOpenDBRequest;
    try {
      idb = factory();
      if (!idb) throw new DOMException('this browser offers no IndexedDB', 'InvalidStateError');
      req = idb.open(PAGE_RECORDS_DB, PAGE_RECORDS_VERSION);
    } catch (e) {
      reject(new StoreError('unavailable', 'open', undefined, e));
      return;
    }
    let settled = false;
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(PAGE_RECORDS_STORE)) req.result.createObjectStore(PAGE_RECORDS_STORE);
    };
    req.onsuccess = () => {
      if (settled) { req.result.close(); return; }            // given up as blocked: not kept
      settled = true;
      resolve(req.result);
    };
    req.onerror = () => { settled = true; reject(storeError('open', undefined, req.error)); };
    req.onblocked = () => {
      settled = true;
      reject(new StoreError('unavailable', 'open', undefined, new Error('another tab holds an older version of the page\'s records')));
    };
  });
  const write = async (slot: string, apply: (objects: IDBObjectStore) => void, operation: 'write' | 'delete'): Promise<void> => {
    const db = await open();
    try {
      await new Promise<void>((resolve, reject) => {
        let tx: IDBTransaction;
        try { tx = db.transaction(PAGE_RECORDS_STORE, 'readwrite'); } catch (e) { reject(storeError(operation, slot, e)); return; }
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(storeError(operation, slot, tx.error ?? new Error('the transaction was aborted')));
        try {
          apply(tx.objectStore(PAGE_RECORDS_STORE));
        } catch (e) {                                           // a value the browser cannot clone: DataCloneError
          reject(storeError(operation, slot, e));
          try { tx.abort(); } catch { /* already finished */ }
        }
      });
    } finally {
      db.close();
    }
  };
  return {
    async get(slot) {
      named(slot);
      try {
        const db = await open();
        try {
          return await new Promise<unknown>((resolve, reject) => {
            const r = db.transaction(PAGE_RECORDS_STORE, 'readonly').objectStore(PAGE_RECORDS_STORE).get(slot);
            r.onsuccess = () => resolve(r.result);
            r.onerror = () => reject(r.error);
          });
        } finally {
          db.close();
        }
      } catch (e) {
        report(e instanceof StoreError ? e : storeError('get', slot, e));
        return undefined;
      }
    },
    async put(slot, value) {
      named(slot);
      await write(slot, (objects) => { objects.put(value, slot); }, 'write');
    },
    async delete(slot) {
      named(slot);
      await write(slot, (objects) => { objects.delete(slot); }, 'delete');
    },
  };
}

/**
 * **The test room's uploaded texture packs** (GX-27; `./texturePackStore`, its own database `s2u.texturePacks`): the
 * browser's `IDBFactory`, or null where reaching it throws or there is none -- the uploads then say they are
 * unavailable and the served packs work as before. A **browser adaptation** (H135): an artist's packs, never the game's.
 * Also the extraction's fallback store (DX-1, `./discExtractStore`, its own database `s2u.disc.extract`), where the
 * origin private file system cannot be written. And the test room's imported HD texture pack (OT.R92; `./hdTexturePackStore`,
 * its own database `s2u.hdTexturePack`): one pack kept in this browser, a browser adaptation like the uploads.
 */
export function pageIndexedDb(): IDBFactory | null {
  try {
    return globalThis.indexedDB ?? null;
  } catch {
    return null;
  }
}

/** The page's records on the browser's IndexedDB (asked for at each call). */
export function pageRecords(): RecordStore {
  return openPageRecords(() => globalThis.indexedDB);
}

/**
 * **The page's origin storage** (disc-access plan DA-8; research 306 §3, §10): the browser's `StorageManager`
 * (`navigator.storage`) -- its origin private file system (`getDirectory()`), where `./discCopy` keeps the disc's copy,
 * its `estimate()` and its `persist()`. Named here, as the page's other storages are; asked for at each call (reaching
 * it throws in some browsers). Null where the browser has none, or none with an origin private file system (an older
 * browser; some private windows): the copy is then refused as unavailable. A **browser adaptation** (DA.R2, DA.R3).
 */
export function pageOriginStorage(): StorageManager | null {
  try {
    const storage = globalThis.navigator?.storage;
    return storage && typeof storage.getDirectory === 'function' ? storage : null;
  } catch {
    return null;
  }
}
