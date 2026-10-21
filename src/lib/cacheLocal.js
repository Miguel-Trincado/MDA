// Caché en el navegador (IndexedDB) para datos grandes (Aval completo y
// listado Tipo Unidad): al refrescar se muestran al instante y luego se
// actualizan desde Supabase. Si IndexedDB no está disponible, no hace nada.
const DB = "pilpilen_cache";
const STORE = "kv";

function abrir() {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (e) {
      reject(e);
    }
  });
}

export async function cacheLeer(clave) {
  try {
    const d = await abrir();
    return await new Promise((resolve) => {
      const r = d.transaction(STORE, "readonly").objectStore(STORE).get(clave);
      r.onsuccess = () => resolve(r.result ?? null);
      r.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function cacheGuardar(clave, valor) {
  try {
    const d = await abrir();
    await new Promise((resolve) => {
      const tx = d.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(valor, clave);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    /* sin caché: no pasa nada */
  }
}

export async function cacheBorrar(clave) {
  try {
    const d = await abrir();
    d.transaction(STORE, "readwrite").objectStore(STORE).delete(clave);
  } catch {
    /* nada */
  }
}
