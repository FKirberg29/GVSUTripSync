/**
 * Push Notification Utilities
 * 
 * Handles push notification setup, permissions, token management, and listeners
 * for the mobile app. Manages Expo push tokens and stores them in Firestore
 * for server-side notification delivery.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getFirestore, doc, setDoc, deleteDoc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../FirebaseConfig';

// Configuring notification behavior for foreground notifications
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
} catch (error) {
  console.warn('Failed to set notification handler:', error);
}

/**
 * Requests notification permissions and returns the Expo push token
 * @returns {Promise<string|false|null>} Push token if granted, false if denied, null on error
 */
export async function requestNotificationPermission() {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Notification permission denied');
      return false;
    }

    // Get push token
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: 'c6764117-3e52-484c-a73c-d58d7fa9506c',
    });

    return tokenData.data;
  } catch (error) {
    console.error('Error requesting notification permission:', error);
    return null;
  }
}

/**
 * Saves push token to Firestore for server-side notification delivery
 * @param {string} uid - User ID
 * @param {string} token - Expo push token
 */
export async function savePushToken(uid, token) {
  if (!uid || !token) return;

  try {
    // Hash the token to create a valid document ID (tokens may contain special characters)
    let hash = 0;
    for (let i = 0; i < token.length; i++) {
      const char = token.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    const tokenId = Math.abs(hash).toString(36);
    
    const tokenRef = doc(db, 'users', uid, 'tokens', tokenId);
    const tokenDoc = await getDoc(tokenRef);
    
    // Firestore rules allow create and delete, but not update
    // If document exists, delete it first, then create new one
    if (tokenDoc.exists()) {
      await deleteDoc(tokenRef);
    }
    
    // Create new document
    await setDoc(tokenRef, {
      token,
      platform: Platform.OS,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log('Push token saved');
  } catch (error) {
    console.error('Error saving push token:', error);
  }
}

/**
 * Removes push token from Firestore
 * @param {string} uid - User ID
 * @param {string} token - Token ID to remove
 */
export async function removePushToken(uid, token) {
  if (!uid || !token) return;

  try {
    const tokenRef = doc(db, 'users', uid, 'tokens', token);
    await deleteDoc(tokenRef);
    console.log('Push token removed');
  } catch (error) {
    console.error('Error removing push token:', error);
  }
}

/**
 * Gets all push tokens for a user
 * @param {string} uid - User ID
 * @returns {Promise<Array>} Array of token documents
 */
export async function getUserPushTokens(uid) {
  if (!uid) return [];

  try {
    const tokensRef = collection(db, 'users', uid, 'tokens');
    const snapshot = await getDocs(tokensRef);
    return snapshot.docs.map((doc) => doc.data());
  } catch (error) {
    console.error('Error getting push tokens:', error);
    return [];
  }
}

/**
 * Sets up notification listeners for foreground notifications and notification taps
 * @param {Function} onNotificationReceived - Callback when notification received in foreground
 * @param {Function} onNotificationTapped - Callback when notification is tapped
 * @returns {Function} Cleanup function to remove listeners
 */
export function setupNotificationListeners(onNotificationReceived, onNotificationTapped) {
  // Handle notifications received while app is in foreground
  const receivedListener = Notifications.addNotificationReceivedListener((notification) => {
    console.log('Notification received:', notification);
    if (onNotificationReceived) {
      onNotificationReceived(notification);
    }
  });

  // Handle notification taps
  const responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
    console.log('Notification tapped:', response);
    if (onNotificationTapped) {
      onNotificationTapped(response);
    }
  });

  return () => {
    Notifications.removeNotificationSubscription(receivedListener);
    Notifications.removeNotificationSubscription(responseListener);
  };
}
