/**
 * Trip Key Management for Mobile App
 * 
 * Handles fetching, storing, and sharing trip encryption keys between Firestore and local storage.
 * Manages trip encryption key distribution to all trip members and handles key re-sharing
 * when decryption fails or keys are in incompatible formats.
 */

import { db } from '../FirebaseConfig';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { 
  generateKey, 
  encryptKey, 
  decryptKey,
  getUserMasterKey,
  getTripKey as getLocalTripKey,
  storeTripKey as storeLocalTripKey,
} from './encryption';

/**
 * Gets trip encryption key from Firestore or local storage
 * Attempts to decrypt and handles key regeneration if decryption fails
 * @param {string} tripId - Trip ID
 * @param {string} userId - User ID
 * @returns {Promise<string|null>} Trip encryption key or null if not available
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
        console.warn('Encryption key not available. Key data:', {
          hasEncryptedKey: !!keyData?.encryptedKey,
          pending: keyData?.pending
        });
        return null;
      }
      
      const masterKey = await getUserMasterKey(userId);
      
      if (!masterKey) {
        console.error('Failed to get master key for user:', userId);
        return null;
      }
      
      // Log key info for debugging
      console.log('Master key length:', masterKey.length);
      console.log('Encrypted key length:', keyData.encryptedKey?.length);
      console.log('Encrypted key preview:', keyData.encryptedKey?.substring(0, 20) + '...');
      
      // Checking if encrypted key looks suspiciously short (buggy format indicator)
      // A properly encrypted key should be at least 44 chars (16 byte IV + some ciphertext, base64 encoded)
      const encryptedKeyLength = keyData.encryptedKey?.length || 0;
      if (encryptedKeyLength < 44) {
        console.warn('Encrypted key is suspiciously short - likely encrypted with buggy format');
        console.warn('Attempting to regenerate key...');
        // Attempting to regenerate immediately if user is owner
        try {
          const reSharedKey = await requestTripKeyReShare(tripId, userId);
          if (reSharedKey) {
            console.log('Successfully regenerated trip key');
            return reSharedKey;
          }
        } catch (reShareError) {
          console.warn('Failed to regenerate key:', reShareError.message || reShareError);
        }
        return null;
      }
      
      try {
        // Decrypt trip key
        console.log('Attempting to decrypt trip encryption key for trip:', tripId);
        const tripKey = decryptKey(keyData.encryptedKey, masterKey);
        console.log('Successfully decrypted trip key');
        
        if (!tripKey) {
          throw new Error('Decryption returned empty result');
        }
        
        // Validate decrypted key
        if (!tripKey || tripKey.trim().length === 0) {
          console.error('Decrypted trip key is empty - key might be corrupted or wrong master key');
          // Try to regenerate if user is owner
          try {
            const reSharedKey = await requestTripKeyReShare(tripId, userId);
            if (reSharedKey) {
              return reSharedKey;
            }
          } catch (reShareError) {
            console.warn('Failed to regenerate key:', reShareError.message || reShareError);
          }
          return null;
        }
        
        // Store locally for future use
        await storeLocalTripKey(tripId, userId, tripKey);
        
        return tripKey;
      } catch (decryptError) {
        const errorMsg = decryptError.message || decryptError.toString();
        console.error('Error decrypting trip key from Firestore:', errorMsg);
        
        // Check if this is a "Malformed UTF-8 data" error - likely buggy format
        if (errorMsg.includes('Malformed UTF-8 data') || errorMsg.includes('empty result')) {
          console.warn('Key appears to be in corrupted/buggy format - attempting to regenerate...');
        } else {
          console.warn('This usually means:');
          console.warn('1. The key was encrypted with a different master key');
          console.warn('2. The master key on this device doesn\'t match the one used to encrypt');
          console.warn('3. The encrypted key data is corrupted');
        }
        
        console.log('Attempting to request key re-share...');
        
        // Try to request key re-share (will work if user is owner)
        try {
          const reSharedKey = await requestTripKeyReShare(tripId, userId);
          if (reSharedKey) {
            console.log('Successfully re-shared trip key');
            return reSharedKey;
          }
        } catch (reShareError) {
          console.warn('Failed to re-share key:', reShareError.message || reShareError);
        }
        
        // If re-sharing fails, return null
        return null;
      }
    } else {
      // Key document doesn't exist - encryption might not be enabled or key not shared yet
      console.log('Trip encryption key not found in Firestore for user');
    }
  } catch (error) {
    console.error('Error fetching trip key from Firestore:', error);
  }

  return null;
}

/**
 * Generates and shares trip encryption key with all trip members
 * Encrypts the key with each member's master key and stores in Firestore
 * @param {string} tripId - Trip ID
 * @param {string} userId - User ID of the key generator
 * @returns {Promise<string>} Generated trip encryption key
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
  
  for (const memberId of memberIds) {
    let encryptedKey;
    
    if (memberId === userId) {
      // For the current user, use their master key
      encryptedKey = encryptKey(tripKey, masterKey);
    } else {
      // For other members, try to get their master key or use current user's temporarily
      try {
        const memberMasterKey = await getUserMasterKey(memberId);
        encryptedKey = encryptKey(tripKey, memberMasterKey);
      } catch {
        // If member's master key not available, use generator's key temporarily
        encryptedKey = encryptKey(tripKey, masterKey);
      }
    }

    const memberKeyRef = doc(db, 'trips', tripId, 'encryptionKeys', memberId);
    await setDoc(memberKeyRef, {
      encryptedKey,
      sharedBy: userId,
      sharedAt: serverTimestamp(),
      version: 1,
    });
  }

  // Store locally
  await storeLocalTripKey(tripId, userId, tripKey);

  return tripKey;
}

/**
 * Re-shares existing trip key with current user when decryption fails
 * Attempts to regenerate key if user is owner, which may require re-encrypting existing data
 * @param {string} tripId - Trip ID
 * @param {string} userId - User ID
 * @returns {Promise<string|null>} Re-shared trip key or null if re-sharing fails
 */
export async function requestTripKeyReShare(tripId, userId) {
  try {
    // Get trip data to find members and check encryption status
    const tripRef = doc(db, 'trips', tripId);
    const tripDoc = await getDoc(tripRef);
    
    if (!tripDoc.exists()) {
      throw new Error('Trip not found');
    }
    
    const tripData = tripDoc.data();
    const roles = tripData.roles || {};
    const isOwner = roles[userId] === 'owner';
    
    // Check if encryption is already enabled
    const metadataRef = doc(db, 'trips', tripId, 'encryptionKeys', 'metadata');
    const metadataDoc = await getDoc(metadataRef);
    const encryptionEnabled = metadataDoc.exists() && metadataDoc.data().enabled === true;
    
    if (!encryptionEnabled) {
      // Encryption not enabled, safe to enable it
      console.log('Encryption not enabled, enabling it now');
      await enableTripEncryption(tripId, userId);
      return await getTripEncryptionKey(tripId, userId);
    }
    
    // Encryption is enabled, attempt to get key from another member
    // Other members' encrypted keys cannot be decrypted directly
    if (isOwner) {
      // Regenerating key, this may require re-encrypting existing data if:
      // 1. The key was encrypted with buggy format (before the fix)
      // 2. Master key on this device doesn't match the one used to encrypt
      // 3. The encrypted key data is corrupted
      console.warn('WARNING: Regenerating trip key will break existing encrypted data!');
      console.warn('This usually happens when:');
      console.warn('1. The key was encrypted with a buggy format (before encryption fix)');
      console.warn('2. Master key on this device doesn\'t match the one used to encrypt');
      console.warn('3. The encrypted key data is corrupted');
      console.warn('4. The key was encrypted on a different device with a different master key');
      console.log('User is owner, regenerating and re-sharing trip key in new format (AES-CBC)');
      console.log('Existing encrypted data (trip name, stops) will need to be re-encrypted from web app');
      
      try {
        // generateAndShareTripKey stores the key locally, returning it directly
        const newTripKey = await generateAndShareTripKey(tripId, userId);
        console.log('Successfully regenerated trip key');
        return newTripKey;
      } catch (error) {
        console.error('Failed to regenerate trip key:', error);
        throw error;
      }
    } else {
      // User is not owner, can't regenerate
      // Key needs to be re-shared by owner from web app
      console.warn('Cannot re-share key: user is not owner.');
      console.warn('Please ask the trip owner to re-share the key from the web app.');
      console.warn('This usually happens when master keys don\'t match between devices.');
      return null;
    }
  } catch (error) {
    console.error('Error requesting trip key re-share:', error);
    return null;
  }
}

/**
 * Enables encryption for a trip by generating and sharing keys with all members
 * @param {string} tripId - Trip ID
 * @param {string} userId - User ID enabling encryption
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

