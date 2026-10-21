/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Firebase Firestore connector for real-time secure cross-device synchronization.
 */

import { initializeApp } from 'firebase/app';
import { 
  initializeFirestore, 
  collection, 
  onSnapshot, 
  setDoc, 
  doc, 
  deleteDoc, 
  query, 
  orderBy, 
  writeBatch,
  getDocs,
  where
} from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';
import { Evaluation, HrmsRecord, PresensiRecord, Employee } from './types';

// Detect if real Firebase credentials exist
export const isFirebaseActive = !!(firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId);

export let app: any = null;
export let db: any = null;
export let auth: any = null;

if (isFirebaseActive) {
  try {
    app = initializeApp(firebaseConfig);
    // Explicitly pass the custom database id to avoid connecting to a non-existent (default) database in AI Studio's sandbox
    const dbId = (firebaseConfig as any).firestoreDatabaseId || "(default)";
    db = initializeFirestore(app, {
      experimentalForceLongPolling: true,
      useFetchStreams: false,
    } as any, dbId);
    
    // Setup Auth and authenticate anonymously in the background
    auth = getAuth(app);
    signInAnonymously(auth)
      .then((userCredential) => {
        console.log('Firebase Anonymous Auth Succeeded. UID:', userCredential.user.uid);
      })
      .catch((err) => {
        console.log('Firebase Anonymous Auth notice: Optional anonymous auth is disabled or restricted in the Firebase Console. App will operate with standard client-side data access.', err.message || err);
      });
  } catch (err) {
    console.error('Failed to initialize Firebase app:', err);
  }
}

// Flag to track if Firestore daily quota is exceeded to prevent infinite backoff loops
export let isFirestoreQuotaExceeded = false;

/**
 * Handle firestore error helper for debugging according to system skills
 */
function handleFirestoreError(error: unknown, operationType: string, path: string | null) {
  const errMsg = error instanceof Error ? error.message : String(error);
  const isQuota = errMsg.includes('resource-exhausted') || 
                  errMsg.toLowerCase().includes('quota') || 
                  errMsg.includes('Free daily read units');
  if (isQuota) {
    isFirestoreQuotaExceeded = true;
    console.warn('⚠️ Firestore Daily Write/Read Quota reached (Free Tier limit). The application will seamlessly continue operations using Local Storage & Google Sheets sync without data loss.');
  }

  const errInfo = {
    error: errMsg,
    operationType,
    path,
    authInfo: {
      userId: 'anonymous', // standard access
    }
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
}

/**
 * Listen to live database evaluations with real-time feedback
 */
export function listenToEvaluations(onUpdate: (evals: Evaluation[]) => void): () => void {
  if (!isFirebaseActive || !db || isFirestoreQuotaExceeded) {
    console.warn('Firebase is inactive or daily quota exceeded. Synchronization will fall back to local device storage.');
    return () => {};
  }

  try {
    const q = query(collection(db, 'evaluations'), orderBy('submittedAt', 'desc'));
    
    return onSnapshot(q, (snapshot) => {
      const list: Evaluation[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as Evaluation);
      });
      onUpdate(list);
    }, (error) => {
      handleFirestoreError(error, 'list', 'evaluations');
    });
  } catch (err) {
    console.error('Failed to register Firestore onSnapshot listener:', err);
    return () => {};
  }
}

/**
 * Save evaluation to cloud db
 */
export async function saveCloudEvaluation(item: Evaluation): Promise<boolean> {
  if (!isFirebaseActive || !db || isFirestoreQuotaExceeded) return false;
  try {
    const docRef = doc(db, 'evaluations', item.id);
    await setDoc(docRef, item);
    return true;
  } catch (err) {
    handleFirestoreError(err, 'write', `evaluations/${item.id}`);
    return false;
  }
}

/**
 * Delete evaluation from cloud db
 */
export async function deleteCloudEvaluation(id: string): Promise<boolean> {
  if (!isFirebaseActive || !db || isFirestoreQuotaExceeded) return false;
  try {
    await deleteDoc(doc(db, 'evaluations', id));
    return true;
  } catch (err) {
    handleFirestoreError(err, 'delete', `evaluations/${id}`);
    return false;
  }
}

/**
 * Helper to commit Firestore writes in safe chunks of 400 items (below 500 limit)
 */
async function commitInBatches<T>(
  items: T[],
  addToBatch: (batch: any, item: T) => void
): Promise<boolean> {
  const CHUNK_SIZE = 400;
  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const chunk = items.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    chunk.forEach((item) => addToBatch(batch, item));
    await batch.commit();
  }
  return true;
}

/**
 * Batch save evaluations to cloud db
 */
export async function saveCloudEvaluationsBatch(batchItems: Evaluation[]): Promise<boolean> {
  if (!isFirebaseActive || !db || isFirestoreQuotaExceeded || batchItems.length === 0) return false;
  try {
    return await commitInBatches(batchItems, (batch, item) => {
      const docRef = doc(db, 'evaluations', item.id);
      batch.set(docRef, item);
    });
  } catch (err) {
    handleFirestoreError(err, 'write_batch', 'evaluations');
    return false;
  }
}

/**
 * Wipe database evaluations
 * @param isDemoOnly if true, only wipes recordings created in Demo Mode
 */
export async function clearCloudEvaluations(isDemoOnly: boolean): Promise<boolean> {
  if (!isFirebaseActive || !db || isFirestoreQuotaExceeded) return false;
  try {
    const querySnapshot = await getDocs(collection(db, 'evaluations'));
    const batch = writeBatch(db);
    let count = 0;
    
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (!isDemoOnly || data.isDemo === true) {
        batch.delete(docSnap.ref);
        count++;
      }
    });

    if (count > 0) {
      await batch.commit();
    }
    return true;
  } catch (err) {
    handleFirestoreError(err, 'clear', 'evaluations');
    return false;
  }
}

/**
 * Listen to live database announcements with real-time feedback
 */
export function listenToAnnouncements(onUpdate: (items: { id: string; text: string; createdAt: string }[]) => void): () => void {
  if (!isFirebaseActive || !db || isFirestoreQuotaExceeded) {
    return () => {};
  }

  try {
    const q = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'));
    
    return onSnapshot(q, (snapshot) => {
      const list: { id: string; text: string; createdAt: string }[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as any);
      });
      onUpdate(list);
    }, (error) => {
      handleFirestoreError(error, 'list', 'announcements');
    });
  } catch (err) {
    console.error('Failed to register Firestore announcements listener:', err);
    return () => {};
  }
}

/**
 * Save announcement to cloud db
 */
export async function saveCloudAnnouncement(id: string, text: string): Promise<boolean> {
  if (!isFirebaseActive || !db || isFirestoreQuotaExceeded) return false;
  try {
    const docRef = doc(db, 'announcements', id);
    await setDoc(docRef, {
      id,
      text,
      createdAt: new Date().toISOString()
    });
    return true;
  } catch (err) {
    handleFirestoreError(err, 'write', `announcements/${id}`);
    return false;
  }
}

/**
 * Delete announcement from cloud db
 */
export async function deleteCloudAnnouncement(id: string): Promise<boolean> {
  if (!isFirebaseActive || !db || isFirestoreQuotaExceeded) return false;
  try {
    await deleteDoc(doc(db, 'announcements', id));
    return true;
  } catch (err) {
    handleFirestoreError(err, 'delete', `announcements/${id}`);
    return false;
  }
}

/**
 * Listen to live database HRMS records with real-time feedback
 */
export function listenToHrmsRecords(onUpdate: (records: HrmsRecord[]) => void): () => void {
  if (!isFirebaseActive || !db || isFirestoreQuotaExceeded) {
    console.warn('Firebase is inactive or quota exceeded. HRMS will fall back to local storage.');
    return () => {};
  }

  try {
    const q = query(collection(db, 'hrms_records'), orderBy('periode', 'desc'));
    
    return onSnapshot(q, (snapshot) => {
      const list: HrmsRecord[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ ...docSnap.data() } as HrmsRecord);
      });
      onUpdate(list);
    }, (error) => {
      handleFirestoreError(error, 'list', 'hrms_records');
    });
  } catch (err) {
    console.error('Failed to register Firestore hrms_records listener:', err);
    return () => {};
  }
}

/**
 * Batch save HRMS records to cloud db
 */
export async function saveCloudHrmsRecordsBatch(batchItems: HrmsRecord[]): Promise<boolean> {
  if (!isFirebaseActive || !db || isFirestoreQuotaExceeded || batchItems.length === 0) return false;
  try {
    return await commitInBatches(batchItems, (batch, item) => {
      // Use noReg + '_' + periode as document ID to uniquely identify and overwrite duplicates
      const docId = `${item.noReg}_${item.periode.replace(/\s+/g, '')}`;
      const docRef = doc(db, 'hrms_records', docId);
      batch.set(docRef, item);
    });
  } catch (err) {
    handleFirestoreError(err, 'write_batch', 'hrms_records');
    return false;
  }
}

/**
 * Listen to live database Presensi records with real-time feedback
 */
export function listenToPresensiRecords(onUpdate: (records: PresensiRecord[]) => void): () => void {
  if (!isFirebaseActive || !db || isFirestoreQuotaExceeded) {
    console.warn('Firebase is inactive or quota exceeded. Presensi will fall back to local storage.');
    return () => {};
  }

  try {
    const q = query(collection(db, 'presensi_records'), orderBy('tanggal', 'desc'));
    
    return onSnapshot(q, (snapshot) => {
      const list: PresensiRecord[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ ...docSnap.data() } as PresensiRecord);
      });
      onUpdate(list);
    }, (error) => {
      handleFirestoreError(error, 'list', 'presensi_records');
    });
  } catch (err) {
    console.error('Failed to register Firestore presensi_records listener:', err);
    return () => {};
  }
}

/**
 * Batch save Presensi records to cloud db
 */
export async function saveCloudPresensiRecordsBatch(batchItems: PresensiRecord[]): Promise<boolean> {
  if (!isFirebaseActive || !db || isFirestoreQuotaExceeded || batchItems.length === 0) return false;
  try {
    return await commitInBatches(batchItems, (batch, item) => {
      // Use noReg + '_' + tanggal as document ID to uniquely identify and overwrite duplicates
      const docId = `${item.noReg}_${item.tanggal.replace(/[^a-zA-Z0-9]/g, '')}`;
      const docRef = doc(db, 'presensi_records', docId);
      batch.set(docRef, item);
    });
  } catch (err) {
    handleFirestoreError(err, 'write_batch', 'presensi_records');
    return false;
  }
}

/**
 * Listen to live database configuration with real-time feedback
 */
export function listenToConfig(onUpdate: (config: { webhookUrl?: string; spreadsheetId?: string; sheetName?: string; isDemoMode?: boolean }) => void): () => void {
  if (!isFirebaseActive || !db || isFirestoreQuotaExceeded) {
    return () => {};
  }

  try {
    const docRef = doc(db, 'settings', 'config');
    return onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        onUpdate(docSnap.data() as any);
      }
    }, (error) => {
      handleFirestoreError(error, 'get', 'settings/config');
    });
  } catch (err) {
    console.error('Failed to register Firestore config listener:', err);
    return () => {};
  }
}

/**
 * Save configuration changes to cloud db settings
 */
export async function saveCloudConfig(configData: { webhookUrl?: string; spreadsheetId?: string; sheetName?: string; isDemoMode?: boolean }): Promise<boolean> {
  if (!isFirebaseActive || !db || isFirestoreQuotaExceeded) return false;
  try {
    const docRef = doc(db, 'settings', 'config');
    await setDoc(docRef, configData, { merge: true });
    return true;
  } catch (err) {
    handleFirestoreError(err, 'write', 'settings/config');
    return false;
  }
}

/**
 * Listen to live database Employees with real-time feedback
 */
export function listenToEmployees(onUpdate: (records: Employee[]) => void): () => void {
  if (!isFirebaseActive || !db || isFirestoreQuotaExceeded) {
    console.warn('Firebase is inactive or quota exceeded. Employees database will fall back to local storage.');
    return () => {};
  }

  try {
    const q = query(collection(db, 'employees'), orderBy('grup', 'asc'));
    
    return onSnapshot(q, (snapshot) => {
      const list: Employee[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ ...docSnap.data() } as Employee);
      });
      onUpdate(list);
    }, (error) => {
      handleFirestoreError(error, 'list', 'employees');
    });
  } catch (err) {
    console.error('Failed to register Firestore employees listener:', err);
    return () => {};
  }
}

/**
 * Save single Employee to cloud db
 */
export async function saveCloudEmployee(item: Employee): Promise<boolean> {
  if (!isFirebaseActive || !db || isFirestoreQuotaExceeded) return false;
  try {
    const docId = item.noReg;
    const docRef = doc(db, 'employees', docId);
    await setDoc(docRef, item);
    return true;
  } catch (err) {
    handleFirestoreError(err, 'write', `employees/${item.noReg}`);
    return false;
  }
}

/**
 * Delete Employee from cloud db
 */
export async function deleteCloudEmployee(noReg: string): Promise<boolean> {
  if (!isFirebaseActive || !db || isFirestoreQuotaExceeded) return false;
  try {
    await deleteDoc(doc(db, 'employees', noReg));
    return true;
  } catch (err) {
    handleFirestoreError(err, 'delete', `employees/${noReg}`);
    return false;
  }
}

/**
 * Batch save Employees to cloud db, and reconcile by deleting any cloud records not in this batch
 */
export async function saveCloudEmployeesBatch(batchItems: Employee[]): Promise<boolean> {
  if (!isFirebaseActive || !db || isFirestoreQuotaExceeded) return false;
  try {
    const batch = writeBatch(db);
    
    // 1. Write/overwrite all batchItems
    batchItems.forEach((item) => {
      const docId = item.noReg;
      const docRef = doc(db, 'employees', docId);
      batch.set(docRef, item);
    });

    // 2. Fetch all current employees in Firestore to find any that should be deleted
    try {
      const querySnapshot = await getDocs(collection(db, 'employees'));
      const newNoRegs = new Set(batchItems.map(item => item.noReg));
      
      querySnapshot.forEach((docSnap) => {
        if (!newNoRegs.has(docSnap.id)) {
          batch.delete(docSnap.ref);
        }
      });
    } catch (e) {
      console.warn('Could not fetch existing employees for deletion reconciliation:', e);
    }
    
    await batch.commit();
    return true;
  } catch (err) {
    handleFirestoreError(err, 'write_batch_reconcile', 'employees');
    return false;
  }
}

/**
 * Batch save employees to the safe spreadsheet master partition in Firestore
 */
export async function saveCloudMasterEmployeesBatch(batchItems: Employee[]): Promise<boolean> {
  if (!isFirebaseActive || !db || isFirestoreQuotaExceeded) return false;
  try {
    const batch = writeBatch(db);
    
    // 1. Write all master employees
    batchItems.forEach((item) => {
      const docId = item.noReg;
      const docRef = doc(db, 'spreadsheet_employees_master', docId);
      batch.set(docRef, item);
    });

    // 2. Fetch and delete any old master records not in this batch
    try {
      const querySnapshot = await getDocs(collection(db, 'spreadsheet_employees_master'));
      const newNoRegs = new Set(batchItems.map(item => item.noReg));
      
      querySnapshot.forEach((docSnap) => {
        if (!newNoRegs.has(docSnap.id)) {
          batch.delete(docSnap.ref);
        }
      });
    } catch (e) {
      console.warn('Could not fetch existing master employees for deletion:', e);
    }

    await batch.commit();
    return true;
  } catch (err) {
    handleFirestoreError(err, 'write_master_batch', 'spreadsheet_employees_master');
    return false;
  }
}

/**
 * Fetch the master spreadsheet employees partition from Firestore
 */
export async function fetchCloudMasterEmployees(): Promise<Employee[]> {
  if (!isFirebaseActive || !db || isFirestoreQuotaExceeded) return [];
  try {
    const querySnapshot = await getDocs(collection(db, 'spreadsheet_employees_master'));
    const list: Employee[] = [];
    querySnapshot.forEach((docSnap) => {
      list.push({ ...docSnap.data() } as Employee);
    });
    return list;
  } catch (err) {
    handleFirestoreError(err, 'fetch_master', 'spreadsheet_employees_master');
    return [];
  }
}

/**
 * Delete Employee from master spreadsheet partition
 */
export async function deleteCloudMasterEmployee(noReg: string): Promise<boolean> {
  if (!isFirebaseActive || !db || isFirestoreQuotaExceeded) return false;
  try {
    await deleteDoc(doc(db, 'spreadsheet_employees_master', noReg));
    return true;
  } catch (err) {
    handleFirestoreError(err, 'delete_master', `spreadsheet_employees_master/${noReg}`);
    return false;
  }
}


