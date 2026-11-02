import { useCallback, useEffect, useState } from "react";
import { isAllowed, KNOWN_SYSTEMS, knownModel } from "./knownModels";
import { registerModel, sha256, unregisterModel, type StoredModel } from "./model";

/**
 * Uploaded label models, kept in the browser's IndexedDB so they survive a
 * reload. They never leave the user's computer.
 */

const DB_NAME = "gridfinity-labels";
const STORE = "models";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "hash" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

/** What the sidebar shows about an uploaded model. */
export interface ModelInfo {
  hash: string;
  name: string;
  /** Text on the other side from the one we'd pick. */
  turned: boolean;
  width: number;
  height: number;
  depth: number;
  face: { width: number; height: number };
}

export interface Models {
  list: ModelInfo[];
  /** Read, check and keep a file. Resolves to its hash. */
  add(file: File): Promise<string>;
  remove(hash: string): void;
  setTurned(hash: string, turned: boolean): void;
}

function defaultFlip(hash: string): boolean {
  return knownModel(hash)?.flip ?? false;
}

function info(stored: StoredModel): ModelInfo {
  const m = registerModel(stored);
  const turned = stored.flip !== undefined && stored.flip !== defaultFlip(stored.hash);
  return { hash: stored.hash, name: stored.name, turned, width: m.width, height: m.height, depth: m.depth, face: m.face };
}

export function useModels(): Models {
  const [stored, setStored] = useState<StoredModel[]>([]);
  const [list, setList] = useState<ModelInfo[]>([]);

  useEffect(() => {
    run<StoredModel[]>("readonly", (s) => s.getAll())
      .then((all) => {
        const ok: StoredModel[] = [];
        const infos: ModelInfo[] = [];
        for (const m of all) {
          if (!isAllowed(m.hash)) continue;
          try {
            infos.push(info(m));
            ok.push(m);
          } catch {
            // A file we can no longer read; leave it out.
          }
        }
        setStored(ok);
        setList(infos);
      })
      .catch(() => {
        // No IndexedDB (private window): uploads just won't be remembered.
      });
  }, []);

  const keep = useCallback((model: StoredModel) => {
    run("readwrite", (s) => s.put(model)).catch(() => {});
    setStored((all) => [...all.filter((m) => m.hash !== model.hash), model]);
    setList((all) => [...all.filter((m) => m.hash !== model.hash), info(model)]);
  }, []);

  const add = useCallback(
    async (file: File) => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const hash = await sha256(bytes);
      if (!isAllowed(hash)) {
        throw new Error(
          `This isn't a label file we support (supported: ${KNOWN_SYSTEMS.join(", ")}). Use the original STL or 3MF as it came from the designer, not a re-exported copy.`,
        );
      }
      const known = knownModel(hash);
      const name = known ? `${known.system}: ${known.name}` : file.name.replace(/\.(stl|3mf)$/i, "");
      const model: StoredModel = { hash, name, bytes };
      info(model); // throws with a readable message if the file can't be used
      keep(model);
      return hash;
    },
    [keep],
  );

  const remove = useCallback((hash: string) => {
    run("readwrite", (s) => s.delete(hash)).catch(() => {});
    unregisterModel(hash);
    setStored((all) => all.filter((m) => m.hash !== hash));
    setList((all) => all.filter((m) => m.hash !== hash));
  }, []);

  const setTurned = useCallback(
    (hash: string, turned: boolean) => {
      const model = stored.find((m) => m.hash === hash);
      if (model) keep({ ...model, flip: defaultFlip(hash) !== turned });
    },
    [stored, keep],
  );

  return { list, add, remove, setTurned };
}
