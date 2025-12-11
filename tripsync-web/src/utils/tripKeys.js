/**
 * Trip Key Management
 * Handles fetching, storing, and sharing trip encryption keys
 */

import { db } from '../firebaseConfig';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { 
  generateKey, 
  encryptKey, 
  decryptKey,
  getUserMasterKey,
  getTripKey as getLocalTripKey,
  storeTripKey as storeLocalTripKey,
} from './encryption';

/**
 * Get trip encryption key from Firestore or local storage
 * @param {string} tripId - Trip ID
 * @param {string} userId - Current user ID
 * @returns {Promise<string>} Base64 encoded trip key
 */
export async function getTripEncryptionKey(tripId, userId) {
  // First check local storage
  const localKey = await getLocalTripKey(tripId, userId);
  if (localKey) {
    return localKey;
  }

  // If not in local storage, fetch from Firestore
  try {
    const userKeyRef = doc(db, 'trips', tripId, 'encryptionKeys', userId);
    const keyDoc = await getDoc(userKeyRef);

    if (keyDoc.exists()) {
      const keyData = keyDoc.data();
      
      // Check if key is marked as pending (not yet shared)
      if (keyData.pending === true) {
        console.log('Trip key is pending, not yet shared with user');
        return null;
      }
      
      // Validate that encryptedKey exists
      if (!keyData || !keyData.encryptedKey || typeof keyData.encryptedKey !== 'string') {
        console.warn('Invalid key data structure, key might be pending:', keyData);
        return null;
      }
      
      const masterKey = await getUserMasterKey(userId);
      const tripKey = decryptKey(keyData.encryptedKey, masterKey);
      
      // Store locally for future use
      await storeLocalTripKey(tripId, userId, tripKey);
      
      return tripKey;
    }
  } catch (error) {
    console.error('Error fetching trip key:', error);
  }

  // No key found, return null (will need to generate or request)
  return null;
}

/**
 * Generate a new trip encryption key and share it with all members
 * @param {string} tripId - Trip ID
 * @param {string} userId - User ID of the key generator (usually trip owner)
 * @returns {Promise<string>} Base64 encoded trip key
 */
export async function generateAndShareTripKey(tripId, userId) {
  // Generate new key
  const tripKey = generateKey();

  // Get trip members
  const tripRef = doc(db, 'trips', tripId);
  const tripDoc = await getDoc(tripRef);
  
  if (!tripDoc.exists()) {
    throw new Error('Trip not found');
  }

  const tripData = tripDoc.data();
  const members = tripData.members || {};
  const memberIds = Object.keys(members).filter(uid => members[uid] === true);

  // Encrypt key for each member and store
  const masterKey = await getUserMasterKey(userId);
  const batch = [];

  for (const memberId of memberIds) {
    let encryptedKey;
    
    if (memberId === userId) {
      // For the current user, use their master key
      encryptedKey = encryptKey(tripKey, masterKey);
    } else {
      // For other members, try to get their master key from Firestore
      try {
        const memberMasterKey = await getUserMasterKey(memberId);
        encryptedKey = encryptKey(tripKey, memberMasterKey);
      } catch {
        // If member's master key not available, use generator's key temporarily
        // Member will need to request key re-sharing
        encryptedKey = encryptKey(tripKey, masterKey);
      }
    }

    const memberKeyRef = doc(db, 'trips', tripId, 'encryptionKeys', memberId);
    batch.push({
      ref: memberKeyRef,
      data: {
        encryptedKey,
        sharedBy: userId,
        sharedAt: serverTimestamp(),
        version: 1,
      },
    });
  }

  // Store all encrypted keys
  for (const item of batch) {
    await setDoc(item.ref, item.data);
  }

  // Store locally
  await storeLocalTripKey(tripId, userId, tripKey);

  return tripKey;
}

/**
 * Share trip key with a new member
 * @param {string} tripId - Trip ID
 * @param {string} newMemberId - New member's user ID
 * @param {string} sharerId - User ID sharing the key
 * @returns {Promise<void>}
 */
export async function shareTripKeyWithMember(tripId, newMemberId, sharerId) {
  // Get the trip key
  const tripKey = await getTripEncryptionKey(tripId, sharerId);
  if (!tripKey) {
    throw new Error('Trip key not found. Cannot share with new member.');
  }

  // Encrypt key for new member
  const newMemberMasterKey = await getUserMasterKey(newMemberId).catch(() => null);
  if (!newMemberMasterKey) {
    throw new Error('New member master key not available');
  }

  const encryptedKey = encryptKey(tripKey, newMemberMasterKey);

  // Store in Firestore
  const memberKeyRef = doc(db, 'trips', tripId, 'encryptionKeys', newMemberId);
  await setDoc(memberKeyRef, {
    encryptedKey,
    sharedBy: sharerId,
    sharedAt: serverTimestamp(),
    version: 1,
  });

  // Store locally for new member
  await storeLocalTripKey(tripId, newMemberId, tripKey);
}

/**
 * Check if trip has encryption enabled
 * @param {string} tripId - Trip ID
 * @returns {Promise<boolean>}
 */
export async function isTripEncrypted(tripId) {
  try {
    const keysRef = doc(db, 'trips', tripId, 'encryptionKeys', 'metadata');
    const keysDoc = await getDoc(keysRef);
    return keysDoc.exists() && keysDoc.data().enabled === true;
  } catch (error) {
    return false;
  }
}

/**
 * Enable encryption for a trip
 * @param {string} tripId - Trip ID
 * @param {string} userId - User ID enabling encryption (usually trip owner)
 * @returns {Promise<void>}
 */
export async function enableTripEncryption(tripId, userId) {
  // Generate and share key
  await generateAndShareTripKey(tripId, userId);

  // Mark trip as encrypted
  const metadataRef = doc(db, 'trips', tripId, 'encryptionKeys', 'metadata');
  await setDoc(metadataRef, {
    enabled: true,
    enabledBy: userId,
    enabledAt: serverTimestamp(),
  });
}
