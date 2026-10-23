// What the scanner keeps on the device, in IndexedDB: the shift session, the cached venue bundle
// and visits approved offline. Survives reloads and lost signal; cleared on sign-out.
import type { PendingVisit, Session, VenueBundle } from "./types";

const DB_NAME = "intu-scanner";
const VERSION = 1;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("kv");
      req.result.createObjectStore("visits", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let db: Promise<IDBDatabase> | null = null;
const conn = () => (db ??= open());

async function run<T>(store: "kv" | "visits", mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const tx = (await conn()).transaction(store, mode);
  const req = fn(tx.objectStore(store));
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

interface Kv {
  session: Session;
  bundle: VenueBundle;
  offerId: string;
  /** The car this driver picked, for one Lagos day. */
  car: { staffId: string; day: string; vehicleId: string };
}

export const getKv = <K extends keyof Kv>(key: K) => run<Kv[K] | undefined>("kv", "readonly", (s) => s.get(key));
export const setKv = <K extends keyof Kv>(key: K, value: Kv[K]) => run("kv", "readwrite", (s) => s.put(value, key));

export const allVisits = () => run<PendingVisit[]>("visits", "readonly", (s) => s.getAll());
export const putVisit = (v: PendingVisit) => run("visits", "readwrite", (s) => s.put(v));

/** Signing out keeps unsynced visits: they still need to reach the server. */
export async function clearShift() {
  await run("kv", "readwrite", (s) => s.delete("session"));
  await run("kv", "readwrite", (s) => s.delete("bundle"));
  for (const v of await allVisits()) if (v.status !== "pending") await run("visits", "readwrite", (s) => s.delete(v.id));
}
