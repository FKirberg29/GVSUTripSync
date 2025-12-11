/**
 * TripSync Web App - Firebase Configuration
 * 
 * Initializes and exports Firebase services for the web app:
 * - Authentication with Google provider
 * - Firestore database with IndexedDB persistence
 * - Storage for media files
 * - Cloud Functions client
 * - Analytics (if supported)
 * - Messaging for push notifications
 * 
 * Configuration values are loaded from environment variables.
 */

import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getMessaging, isSupported as isMessagingSupported } from "firebase/messaging";
import { getStorage } from "firebase/storage";

/**
 * Firebase configuration object loaded from environment variables
 * All values must be set in .env file for the app to function correctly
 */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Initializes Firebase app and services
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);
export const provider = new GoogleAuthProvider();

// Enables offline persistence for Firestore using IndexedDB
// Allows app to work offline and cache Firestore data locally
if (typeof window !== "undefined") {
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === "failed-precondition") {
      // Multiple tabs open - persistence can only be enabled in one tab at a time
      console.warn("Firestore persistence already enabled in another tab");
    } else if (err.code === "unimplemented") {
      // Browser doesn't support IndexedDB persistence
      console.warn("Browser doesn't support IndexedDB persistence");
    } else {
      console.error("Error enabling Firestore persistence:", err);
    }
  });
}

// Initializes Firebase Analytics if supported and in browser environment
// Only runs in browser, not during server-side rendering
let analytics = null;
if (typeof window !== 'undefined') {
  isSupported().then((supported) => {
    if (supported) {
      analytics = getAnalytics(app);
    }
  });
}
export { analytics };

/**
 * Signs in user with Google OAuth provider
 * Uses Firebase Auth popup flow for Google authentication
 */
export const signInWithGoogle = () => signInWithPopup(auth, provider);

/**
 * Signs out the current user
 * Clears authentication state and redirects to login
 */
export const signOutUser = () => signOut(auth);
