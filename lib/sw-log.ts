// Read and clear the same IndexedDB store the service worker writes to.

export interface SwLogEntry {
  ts: number;
  type: string;
  detail: Record<string, unknown>;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("pushlab", 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("events")) {
        db.createObjectStore("events", { autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function readSwLog(): Promise<SwLogEntry[]> {
  try {
    const db = await openDB();
    const tx = db.transaction("events", "readonly");
    const store = tx.objectStore("events");
    const entries: SwLogEntry[] = [];

    return new Promise((resolve) => {
      const cursor = store.openCursor();
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (c) {
          entries.push(c.value as SwLogEntry);
          c.continue();
        } else {
          db.close();
          resolve(entries.reverse()); // newest first
        }
      };
      cursor.onerror = () => {
        db.close();
        resolve([]);
      };
    });
  } catch {
    return [];
  }
}

export async function clearSwLog(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction("events", "readwrite");
    tx.objectStore("events").clear();
    await new Promise<void>((res) => {
      tx.oncomplete = () => res();
    });
    db.close();
  } catch {
    // ignore
  }
}
