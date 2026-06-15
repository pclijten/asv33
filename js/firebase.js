/* ====================================================================
   FIREBASE CONFIG — vervang door je eigen project-config
   (Firebase Console → Project settings → Your apps → Web app)
==================================================================== */
const firebaseConfig = {
  apiKey: "AIzaSyDl3MJqSFX8YfRQkZYizNoFpXKWAMg_68Y",
  authDomain: "asv33-21865.firebaseapp.com",
  projectId: "asv33-21865",
  storageBucket: "asv33-21865.firebasestorage.app",
  messagingSenderId: "1094227590441",
  appId: "1:1094227590441:web:ac11b2cb22665f46c8cb38",
  measurementId: "G-VNL88C72KX"
};

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, OAuthProvider, signInWithPopup, signInAnonymously, updateProfile, signOut, onAuthStateChanged,         signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, fetchSignInMethodsForEmail }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
         collection, doc, addDoc, setDoc, updateDoc, deleteDoc, deleteField,
         getDoc, getDocs, query, where, onSnapshot, serverTimestamp, documentId }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage, ref as sRef, uploadBytes, getDownloadURL, deleteObject }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);

/* Offline-persistence aan: langs de lijn met slecht of geen bereik blijft de
   app gewoon werken; wijzigingen synchroniseren automatisch zodra er weer
   verbinding is. Valt terug op de gewone modus als persistence niet kan. */
let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
  });
} catch (e) {
  console.warn('Offline-persistence niet beschikbaar, terugval op standaard:', e);
  db = getFirestore(app);
}

const storage = getStorage(app);

export {
  app, auth, db, storage,
  /* auth */
  GoogleAuthProvider, OAuthProvider, signInWithPopup, signInAnonymously, updateProfile, signOut, onAuthStateChanged,  signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, fetchSignInMethodsForEmail,
  /* firestore */
  collection, doc, addDoc, setDoc, updateDoc, deleteDoc, deleteField,
  getDoc, getDocs, query, where, onSnapshot, serverTimestamp, documentId,
  /* storage */
  sRef, uploadBytes, getDownloadURL, deleteObject,
};
