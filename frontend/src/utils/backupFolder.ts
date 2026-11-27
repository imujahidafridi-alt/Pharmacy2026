// Remembers the folder the user chose for copies.
// The browser stores the folder handle, so permission survives restarts.

const DB_NAME = 'pharmacy-backup-folder';
const STORE = 'handles';
const KEY = 'copyFolder';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveFolderHandle(handle: any): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).put(handle, KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

export async function getFolderHandle(): Promise<any | null> {
  const db = await openDatabase();
  const handle = await new Promise<any>((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return handle;
}

export async function folderCanWrite(handle: any): Promise<boolean> {
  if (!handle || typeof handle.queryPermission !== 'function') return false;
  try {
    return (await handle.queryPermission({ mode: 'readwrite' })) === 'granted';
  } catch {
    return false;
  }
}

export async function pickFolder(): Promise<any | null> {
  const picker = (window as any).showDirectoryPicker;
  if (typeof picker !== 'function') return null;
  try {
    const handle = await picker({ mode: 'readwrite' });
    if (handle && typeof handle.requestPermission === 'function') {
      const permission = await handle.requestPermission({ mode: 'readwrite' });
      if (permission !== 'granted') return null;
    }
    await saveFolderHandle(handle);
    return handle;
  } catch {
    return null;
  }
}

export async function writeCopyToFolder(handle: any, filename: string, bytes: ArrayBuffer): Promise<void> {
  const fileHandle = await handle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(bytes);
  await writable.close();
}
