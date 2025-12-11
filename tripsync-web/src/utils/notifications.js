/**
 * Push Notification Utilities for Web
 * 
 * Handles Firebase Cloud Messaging (FCM) setup, token management, and
 * message handling for web push notifications. Manages FCM token registration
 * in Firestore and listens for incoming push messages while the app is active.
 */

import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { getFirestore, collection, doc, setDoc, deleteDoc, query, where, getDocs } from "firebase/firestore";
import { db } from "../firebaseConfig";

// Firebase Messaging instance (initialized only in browser with service worker support)
let messaging = null;

// Initializes messaging only in browser environment with service worker support
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  try {
    messaging = getMessaging();
  } catch (error) {
    console.warn("Firebase Messaging initialization failed:", error);
  }
}

/**
 * Request notification permission and get FCM token
 */
export async function requestNotificationPermission() {
  if (!messaging) {
    console.warn("Messaging not available");
    return null;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.log("Notification permission denied");
      return null;
    }

    // Get FCM token
    const token = await getToken(messaging, {
      vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
    });

    if (!token) {
      console.log("No FCM token available");
      return null;
    }

    return token;
  } catch (error) {
    console.error("Error getting FCM token:", error);
    return null;
  }
}

/**
 * Save FCM token to Firestore
 */
export async function saveFCMToken(uid, token) {
  if (!uid || !token) return;

  try {
    const tokenRef = doc(db, "users", uid, "tokens", token);
    await setDoc(tokenRef, {
      token,
      platform: "web",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log("FCM token saved");
  } catch (error) {
    console.error("Error saving FCM token:", error);
  }
}

/**
 * Remove FCM token from Firestore
 */
export async function removeFCMToken(uid, token) {
  if (!uid || !token) return;

  try {
    const tokenRef = doc(db, "users", uid, "tokens", token);
    await deleteDoc(tokenRef);
    console.log("FCM token removed");
  } catch (error) {
    console.error("Error removing FCM token:", error);
  }
}

/**
 * Get all FCM tokens for a user
 */
export async function getUserFCMTokens(uid) {
  if (!uid) return [];

  try {
    const tokensRef = collection(db, "users", uid, "tokens");
    const snapshot = await getDocs(tokensRef);
    return snapshot.docs.map((doc) => doc.data());
  } catch (error) {
    console.error("Error getting FCM tokens:", error);
    return [];
  }
}

/**
 * Initialize notifications and set up message handler
 */
export function initializeNotifications(onMessageReceived) {
  if (!messaging) {
    console.warn("Messaging not available");
    return () => {};
  }

  // Handle foreground messages
  const unsubscribe = onMessage(messaging, (payload) => {
    console.log("Foreground message received:", payload);
    if (onMessageReceived) {
      onMessageReceived(payload);
    }
  });

  return unsubscribe;
}

/**
 * Register service worker for background notifications
 */
export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    console.warn("Service workers not supported");
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
      scope: "/",
    });
    console.log("Service worker registered:", registration);
    return registration;
  } catch (error) {
    console.error("Service worker registration failed:", error);
    return null;
  }
}

