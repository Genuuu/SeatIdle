import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
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
export const db = getFirestore(app);

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

export async function get(dbRef: any) {
  const parsed = parsePath(dbRef.path);
  try {
    if (parsed.type === 'doc') {
      const docRef = doc(db, parsed.col, parsed.docId);
      const snap = await getDoc(docRef);
      const val = snap.exists() ? snap.data() : null;
      return new DataSnapshot(parsed.docId, val);
    } else if (parsed.type === 'col') {
      const colRef = collection(db, parsed.colPath);
      const querySnapshot = await getDocs(colRef);
      const data: Record<string, any> = {};
      querySnapshot.forEach(docSnap => {
        data[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
      });
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
      (snap) => {
        const val = snap.exists() ? snap.data() : null;
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
      (querySnapshot) => {
        const data: Record<string, any> = {};
        querySnapshot.forEach(docSnap => {
          data[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
        });
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
