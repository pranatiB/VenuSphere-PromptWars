/**
 * firebase-client.js
 * Firebase Auth + Firestore real-time subscription helpers.
 * Loads Firebase SDK via CDN ES modules.
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getAuth,
  signInAnonymously,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

/** @type {import('firebase/app').FirebaseApp} */
let _app = null;
/** @type {import('firebase/auth').Auth} */
let _auth = null;
/** @type {import('firebase/firestore').Firestore} */
let _db = null;

/**
 * Firebase project configuration.
 * Replace placeholder values with your actual Firebase project config.
 * @type {Object}
 */
const FIREBASE_CONFIG = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:00000000000000",
  measurementId: "G-XXXXXXXXXX"
};


/** @type {{ uid: string, isAnonymous: boolean } | null} */
export let currentUser = null;

/** Debounce timers keyed by path for Firestore listeners. */
const _debounceTimers = {};

/**
 * Initialize Firebase services once. Safe to call multiple times.
 * @returns {{ auth: import('firebase/auth').Auth, db: import('firebase/firestore').Firestore }}
 */
export function initFirebase() {
  if (_app) return { auth: _auth, db: _db };
  _app = initializeApp(FIREBASE_CONFIG);
  _auth = getAuth(_app);
  _db = getFirestore(_app);
  return { auth: _auth, db: _db };
}

/**
 * Sign the user in anonymously. Called on first app load.
 * @returns {Promise<import('firebase/auth').UserCredential>}
 */
export async function signInAnon() {
  const { auth } = initFirebase();
  return signInAnonymously(auth);
}

/**
 * Upgrade anonymous user to Google sign-in.
 * @returns {Promise<import('firebase/auth').UserCredential>}
 */
export async function signInWithGoogle() {
  const { auth } = initFirebase();
  const provider = new GoogleAuthProvider();
  return signInWithPopup(auth, provider);
}

/**
 * Sign the current user out.
 * @returns {Promise<void>}
 */
export async function signOutUser() {
  const { auth } = initFirebase();
  return signOut(auth);
}

/**
 * Watch auth state. Stores currentUser and calls back on change.
 * @param {(user: { uid: string, isAnonymous: boolean } | null) => void} callback
 * @returns {import('firebase/auth').Unsubscribe}
 */
export function watchAuthState(callback) {
  const { auth } = initFirebase();
  return onAuthStateChanged(auth, (user) => {
    currentUser = user ? { uid: user.uid, isAnonymous: user.isAnonymous } : null;
    callback(currentUser);
  });
}

/**
 * Get the current Firebase ID token for API auth.
 * @returns {Promise<string | null>}
 */
export async function getIdToken() {
  const { auth } = initFirebase();
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken();
}

/**
 * Debounced Firestore onSnapshot subscription (500ms debounce).
 * @param {string} collectionPath - Firestore collection path.
 * @param {(data: Array<Object>) => void} callback - Receives array of doc data.
 * @param {{ orderByField?: string, limitTo?: number }} [options]
 * @returns {() => void} Unsubscribe function.
 */
export function subscribeToCollection(collectionPath, callback, options = {}) {
  const { db } = initFirebase();
  let q = collection(db, collectionPath);

  if (options.orderByField) {
    q = query(q, orderBy(options.orderByField, 'desc'), limit(options.limitTo || 50));
  }

  return onSnapshot(q, (snapshot) => {
    clearTimeout(_debounceTimers[collectionPath]);
    _debounceTimers[collectionPath] = setTimeout(() => {
      const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      callback(data);
    }, 500);
  });
}

/**
 * Debounced Firestore document onSnapshot subscription.
 * @param {string} collectionPath
 * @param {string} docId
 * @param {(data: Object | null) => void} callback
 * @returns {() => void} Unsubscribe function.
 */
export function subscribeToDoc(collectionPath, docId, callback) {
  const { db } = initFirebase();
  const ref = doc(db, collectionPath, docId);
  const key = `${collectionPath}/${docId}`;

  return onSnapshot(ref, (snapshot) => {
    clearTimeout(_debounceTimers[key]);
    _debounceTimers[key] = setTimeout(() => {
      callback(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
    }, 500);
  });
}

/**
 * Fetch a single Firestore document.
 * @param {string} collectionPath
 * @param {string} docId
 * @returns {Promise<Object | null>}
 */
export async function fetchDoc(collectionPath, docId) {
  const { db } = initFirebase();
  const ref = doc(db, collectionPath, docId);
  const snap = await getDoc(ref);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Write or merge a Firestore document.
 * @param {string} collectionPath
 * @param {string} docId
 * @param {Object} data
 * @param {boolean} [merge=true]
 * @returns {Promise<void>}
 */
export async function writeDoc(collectionPath, docId, data, merge = true) {
  const { db } = initFirebase();
  const ref = doc(db, collectionPath, docId);
  return setDoc(ref, data, { merge });
}
