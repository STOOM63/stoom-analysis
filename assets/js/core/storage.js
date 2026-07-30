const DB_NAME = 'analysis-retail-db';
const DB_VERSION = 1;
const STORE = 'projects';
const KEY = 'active-project';

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function emptyProject() {
  return {
    version: 1,
    name: 'ANALYSIS',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    imports: [],
    snapshots: { catalogue: [], stock: [], valuation: [], clients: [] },
    events: { sales: [], movements: [], receipts: [] },
    settings: { storeName: 'Mon magasin', targetCoverageDays: 28, dormantDays: 45, criticalDormantDays: 90 }
  };
}

export async function loadProject() {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result || emptyProject());
      req.onerror = () => reject(req.error);
    });
  } catch (error) {
    console.warn('IndexedDB indisponible, projet vierge.', error);
    return emptyProject();
  }
}

export async function saveProject(project) {
  project.updatedAt = new Date().toISOString();
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(project, KEY);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function resetProject() {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(KEY);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
