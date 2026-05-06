/* js/firebase.js — Firebase Realtime Database sync bridge */

// PASTE YOUR FIREBASE CONFIG HERE (from Firebase console → Project Settings → Your apps)
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDkTAhPw4W5dANldGXZCR0FVHycxGSimaw",
  authDomain: "bbc2026-37654.firebaseapp.com",
  databaseURL: "https://bbc2026-37654-default-rtdb.firebaseio.com",
  projectId: "bbc2026-37654",
  storageBucket: "bbc2026-37654.firebasestorage.app",
  messagingSenderId: "157132320437",
  appId: "1:157132320437:web:bfb34ce9554a6ec3f098fc"
};

const DB_ROOT = 'bbc2026';

// Map localStorage keys → Firebase paths
const _keyToPath = {
  [KEYS.PLAYERS]: 'players',
  [KEYS.COURSES]: 'courses',
  [KEYS.ROUND1]:  'round1',
  [KEYS.ROUND2]:  'round2',
  [KEYS.ROUND3]:  'round3',
};

firebase.initializeApp(FIREBASE_CONFIG);
const _db = firebase.database();

// Queue writes when offline and flush on reconnect
try { _db.setPersistenceEnabled(true); } catch (e) {}

// ── Write hook (called by _save in storage.js) ────────────────────────────────
window._fbSave = function(lsKey, data) {
  const path = _keyToPath[lsKey];
  if (!path) return;
  _db.ref(DB_ROOT + '/' + path).set(data).catch(function(e) {
    console.warn('[Firebase] save failed:', e.message);
  });
};

// ── Clear hook (called by clearAll in storage.js) ─────────────────────────────
window._fbClear = function() {
  _db.ref(DB_ROOT).set(null).catch(function() {});
};

// ── Startup: one-time read to hydrate cache, then re-render current view ──────
_db.ref(DB_ROOT).once('value').then(function(snap) {
  if (snap.exists()) {
    hydrateFromFirebase(snap.val());
    if (typeof route === 'function') route();
  }
}).catch(function() {
  // Offline on startup — localStorage data already in use, nothing to do
});

// ── Connectivity badge ─────────────────────────────────────────────────────────
_db.ref('.info/connected').on('value', function(snap) {
  document.body.classList.toggle('fb-offline', snap.val() !== true);
});
