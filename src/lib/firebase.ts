import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  doc,
  collection,
  setDoc,
  addDoc,
  deleteDoc,
  getDoc,
  getDocs,
  onSnapshot,
  writeBatch
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, (firebaseConfig as any).firestoreDatabaseId);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Realistic Database Emulator/Adapter using Cloud Firestore
export const database = { type: 'firestore_adapter' };

// We define Snapshot subclass
class DataSnapshot {
  constructor(
    public key: string | null,
    private data: any
  ) {}

  exists() {
    return this.data !== null && this.data !== undefined;
  }

  val() {
    return this.data;
  }
}

// Helper to normalize path
function parsePath(pathString: string) {
  const cleanPath = (pathString || '').replace(/^\/+|\/+$/g, '');
  if (!cleanPath || cleanPath === '') {
    return { type: 'root' as const, path: '' };
  }

  const parts = cleanPath.split('/');
  
  if (parts[0] === 'library_status') {
    if (parts.length === 1) {
      return { type: 'doc' as const, col: 'library_status', docId: 'current', path: 'library_status/current' };
    }
  }

  if (parts.length % 2 === 1) {
    return { type: 'col' as const, colPath: cleanPath, path: cleanPath };
  } else {
    const docId = parts.pop()!;
    const colPath = parts.join('/');
    return { type: 'doc' as const, col: colPath, docId, path: `${colPath}/${docId}` };
  }
}

export function ref(dbVar: any, path: string) {
  return {
    _isRef: true,
    path: path || ''
  };
}

export async function fetchSubcollectionsForDoc(docId: string, docData: any) {
  const updatedData = { ...docData };
  try {
    const logsCol = collection(db, 'staff_presence', docId, 'logs');
    const logsSnap = await getDocs(logsCol);
    if (!logsSnap.empty) {
      const logsObj: Record<string, any> = {};
      logsSnap.forEach(subDoc => {
        logsObj[subDoc.id] = subDoc.data();
      });
      updatedData.logs = logsObj;
    } else {
      updatedData.logs = {};
    }
  } catch (err) {
    console.error(`Error fetching logs subcollection for ${docId}:`, err);
    updatedData.logs = {};
  }

  try {
    const portalCol = collection(db, 'staff_presence', docId, 'portal_logins');
    const portalSnap = await getDocs(portalCol);
    if (!portalSnap.empty) {
      const portalObj: Record<string, any> = {};
      portalSnap.forEach(subDoc => {
        portalObj[subDoc.id] = subDoc.data();
      });
      updatedData.portal_logins = portalObj;
    } else {
      updatedData.portal_logins = {};
    }
  } catch (err) {
    console.error(`Error fetching portal_logins subcollection for ${docId}:`, err);
    updatedData.portal_logins = {};
  }

  return updatedData;
}

export async function get(dbRef: any) {
  const parsed = parsePath(dbRef.path);
  try {
    if (parsed.type === 'doc') {
      const docRef = doc(db, parsed.col, parsed.docId);
      const snap = await getDoc(docRef);
      let val = snap.exists() ? snap.data() : null;
      if (val && parsed.col === 'staff_presence') {
        val = await fetchSubcollectionsForDoc(parsed.docId, val);
      }
      return new DataSnapshot(parsed.docId, val);
    } else if (parsed.type === 'col') {
      const colRef = collection(db, parsed.colPath);
      const querySnapshot = await getDocs(colRef);
      const data: Record<string, any> = {};
      const promises: Promise<any>[] = [];

      querySnapshot.forEach(docSnap => {
        const docId = docSnap.id;
        const docData = { id: docId, ...docSnap.data() };
        data[docId] = docData;
        if (parsed.colPath === 'staff_presence') {
          promises.push(
            fetchSubcollectionsForDoc(docId, docData).then(updated => {
              data[docId] = updated;
            })
          );
        }
      });

      if (promises.length > 0) {
        await Promise.all(promises);
      }

      return new DataSnapshot(parsed.colPath.split('/').pop() || null, Object.keys(data).length > 0 ? data : null);
    }
    return new DataSnapshot(null, null);
  } catch (error: any) {
    handleFirestoreError(error, parsed.type === 'col' ? OperationType.LIST : OperationType.GET, dbRef.path);
  }
}

export function onValue(
  dbRef: any,
  callback: (snapshot: DataSnapshot) => void,
  cancelCallback?: (error: any) => void
) {
  const parsed = parsePath(dbRef.path);
  if (parsed.type === 'doc') {
    const docRef = doc(db, parsed.col, parsed.docId);
    return onSnapshot(
      docRef,
      async (snap) => {
        let val = snap.exists() ? snap.data() : null;
        if (val && parsed.col === 'staff_presence') {
          val = await fetchSubcollectionsForDoc(parsed.docId, val);
        }
        callback(new DataSnapshot(parsed.docId, val));
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.GET, dbRef.path);
        } catch (wrappedError) {
          if (cancelCallback) {
            cancelCallback(wrappedError);
          } else {
            console.error(wrappedError);
          }
        }
      }
    );
  } else if (parsed.type === 'col') {
    const colRef = collection(db, parsed.colPath);
    return onSnapshot(
      colRef,
      async (querySnapshot) => {
        const data: Record<string, any> = {};
        const promises: Promise<any>[] = [];

        querySnapshot.forEach(docSnap => {
          const docId = docSnap.id;
          const docData = { id: docId, ...docSnap.data() };
          data[docId] = docData;

          if (parsed.colPath === 'staff_presence') {
            promises.push(
              fetchSubcollectionsForDoc(docId, docData).then(updated => {
                data[docId] = updated;
              })
            );
          }
        });

        if (promises.length > 0) {
          await Promise.all(promises);
        }

        callback(new DataSnapshot(parsed.colPath.split('/').pop() || null, Object.keys(data).length > 0 ? data : null));
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, dbRef.path);
        } catch (wrappedError) {
          if (cancelCallback) {
            cancelCallback(wrappedError);
          } else {
            console.error(wrappedError);
          }
        }
      }
    );
  }
  return () => {};
}

export async function set(dbRef: any, data: any) {
  const parsed = parsePath(dbRef.path);
  try {
    if (parsed.type === 'doc') {
      const docRef = doc(db, parsed.col, parsed.docId);
      await setDoc(docRef, data || {});
    } else if (parsed.type === 'col') {
      const colRef = collection(db, parsed.colPath);
      if (data && typeof data === 'object') {
        for (const [key, val] of Object.entries(data)) {
          await setDoc(doc(colRef, key), val as any);
        }
      }
    }
  } catch (error: any) {
    handleFirestoreError(error, OperationType.WRITE, dbRef.path);
  }
}

export async function update(dbRef: any, data: any) {
  const parsed = parsePath(dbRef.path);
  try {
    if (parsed.type === 'doc') {
      const docRef = doc(db, parsed.col, parsed.docId);
      await setDoc(docRef, data || {}, { merge: true });
    } else if (parsed.type === 'col') {
      if (data && typeof data === 'object') {
        for (const [key, val] of Object.entries(data)) {
          if (val && typeof val === 'object') {
            await setDoc(doc(db, parsed.colPath, key), val, { merge: true });
          }
        }
      }
    }
  } catch (error: any) {
    handleFirestoreError(error, OperationType.UPDATE, dbRef.path);
  }
}

export async function push(dbRef: any, data: any) {
  const parsed = parsePath(dbRef.path);
  try {
    if (parsed.type === 'col') {
      const colRef = collection(db, parsed.colPath);
      const newDocRef = await addDoc(colRef, data || {});
      return {
        _isRef: true,
        key: newDocRef.id,
        path: `${parsed.colPath}/${newDocRef.id}`
      };
    }
    return { _isRef: true, key: '', path: '' };
  } catch (error: any) {
    handleFirestoreError(error, OperationType.CREATE, dbRef.path);
  }
}

export async function remove(dbRef: any) {
  const parsed = parsePath(dbRef.path);
  try {
    if (parsed.type === 'doc') {
      const docRef = doc(db, parsed.col, parsed.docId);
      await deleteDoc(docRef);
    } else if (parsed.type === 'col') {
      const colRef = collection(db, parsed.colPath);
      const querySnapshot = await getDocs(colRef);
      const batch = writeBatch(db);
      querySnapshot.forEach((docSnap) => {
        batch.delete(docSnap.ref);
      });
      await batch.commit();
    } else if (parsed.type === 'root') {
      const collectionsToWipe = [
        'library_status',
        'staff_presence',
        'active_reservations',
        'scheduled_reservations',
        'announcements',
        'occupancy_history'
      ];
      for (const colName of collectionsToWipe) {
        const colRef = collection(db, colName);
        const querySnapshot = await getDocs(colRef);
        const batch = writeBatch(db);
        querySnapshot.forEach((docSnap) => {
          batch.delete(docSnap.ref);
        });
        await batch.commit();
      }
    }
  } catch (error: any) {
    handleFirestoreError(error, OperationType.DELETE, dbRef.path);
  }
}
