/**
 * User Profile Utilities
 * 
 * Provides utilities for fetching and displaying user profile information
 * from Firestore. Handles single and batch user profile fetching, and
 * provides display name resolution with fallbacks.
 */

import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";

/**
 * Fetches user profile data from Firestore by user ID
 * Returns profile with uid, email, displayName, and photoURL
 * @param {string} uid - User ID
 * @returns {Promise<{uid: string, email: string | null, displayName: string | null, photoURL: string | null}>}
 */
export async function getUserProfile(uid) {
  if (!uid) return null;
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) {
      return { uid, email: null, displayName: null, photoURL: null };
    }
    const data = snap.data();
    return {
      uid,
      email: data.email || null,
      displayName: data.displayName || null,
      photoURL: data.photoURL || null,
    };
  } catch (error) {
    console.error("Error fetching user profile:", error);
    return { uid, email: null, displayName: null, photoURL: null };
  }
}

/**
 * Fetch multiple user profiles by UIDs
 * @param {string[]} uids - Array of user IDs
 * @returns {Promise<Array>}
 */
export async function getUserProfiles(uids) {
  if (!uids || uids.length === 0) return [];
  const promises = uids.map((uid) => getUserProfile(uid));
  return Promise.all(promises);
}

/**
 * Get display name for a user (fallback to email or UID)
 * @param {Object} user - User object with displayName, email, uid
 * @returns {string}
 */
export function getUserDisplayName(user) {
  if (!user) return "Unknown";
  return user.displayName || user.email || user.uid || "Unknown";
}

