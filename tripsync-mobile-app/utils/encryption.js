/**
 * End-to-End Encryption Utilities for Mobile App
 * 
 * Provides encryption and decryption functions using tweetnacl secretbox (XSalsa20-Poly1305).
 * Handles user master key management with cross-device synchronization via Firestore,
 * and trip key storage in local AsyncStorage.
 */

import nacl from 'tweetnacl';
import * as Crypto from 'expo-crypto';
import { encode as base64Encode, decode as base64Decode } from 'base-64';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../FirebaseConfig';
import { doc, getDoc, setDoc } from 'firebase/firestore';

// Setting up polyfill for tweetnacl's random number generator
// tweetnacl requires crypto.getRandomValues which isn't available in React Native
nacl.setPRNG((x, n) => {
  const randomBytes = Crypto.getRandomBytes(n);
  for (let i = 0; i < n; i++) {
    x[i] = randomBytes[i];
  }
});

// Key size for secretbox (32 bytes = 256 bits)
const KEY_SIZE = 32;
// Nonce size for secretbox (24 bytes)
const NONCE_SIZE = 24;

/**
 * Generate a new encryption key
 * @returns {string} Base64 encoded key
 */
export function generateKey() {
  const key = nacl.randomBytes(KEY_SIZE);
  return base64Encode(String.fromCharCode(...key));
}

/**
 * Encrypt text data
 * @param {string} plaintext - Text to encrypt
 * @param {string} keyBase64 - Base64 encoded encryption key
 * @returns {string} Base64 encoded encrypted data with nonce
 */
export function encrypt(plaintext, keyBase64) {
  try {
    // Decode key from base64
    const keyBytes = Uint8Array.from(
      base64Decode(keyBase64).split('').map(c => c.charCodeAt(0))
    );
    
    if (keyBytes.length !== KEY_SIZE) {
      throw new Error('Invalid key size');
    }
    
    // Generate random nonce
    const nonce = nacl.randomBytes(NONCE_SIZE);
    
    // Convert plaintext to Uint8Array
    const messageBytes = new TextEncoder().encode(plaintext);
    
    // Encrypt using secretbox
    const encrypted = nacl.secretbox(messageBytes, nonce, keyBytes);
    
    if (!encrypted) {
      throw new Error('Encryption failed');
    }
    
    // Combine nonce + encrypted message
    const combined = new Uint8Array(NONCE_SIZE + encrypted.length);
    combined.set(nonce, 0);
    combined.set(encrypted, NONCE_SIZE);
    
    // Return as base64
    return base64Encode(String.fromCharCode(...combined));
  } catch (error) {
    console.error('Encryption error:', error);
    throw error;
  }
}

/**
 * Decrypt encrypted data
 * @param {string} encryptedData - Base64 encoded encrypted data with nonce
 * @param {string} keyBase64 - Base64 encoded decryption key
 * @returns {string} Decrypted plaintext
 */
export function decrypt(encryptedData, keyBase64) {
  try {
    // Validate inputs
    if (!encryptedData || typeof encryptedData !== 'string' || encryptedData.trim().length === 0) {
      throw new Error('Invalid encrypted data: empty or not a string');
    }
    
    if (!keyBase64 || typeof keyBase64 !== 'string' || keyBase64.trim().length === 0) {
      throw new Error('Invalid key: empty or not a string');
    }
    
    // Decode key from base64
    const keyBytes = Uint8Array.from(
      base64Decode(keyBase64).split('').map(c => c.charCodeAt(0))
    );
    
    if (keyBytes.length !== KEY_SIZE) {
      throw new Error('Invalid key size');
    }
    
    // Decode encrypted data from base64
    const combinedBytes = Uint8Array.from(
      base64Decode(encryptedData).split('').map(c => c.charCodeAt(0))
    );
    
    // Validate minimum length (nonce + at least some encrypted data)
    if (combinedBytes.length < NONCE_SIZE + 16) {
      throw new Error('Invalid encrypted data: too short');
    }
    
    // Extract nonce and encrypted message
    const nonce = combinedBytes.slice(0, NONCE_SIZE);
    const encrypted = combinedBytes.slice(NONCE_SIZE);
    
    // Decrypt using secretbox
    const decrypted = nacl.secretbox.open(encrypted, nonce, keyBytes);
    
    if (!decrypted) {
      throw new Error('Decryption failed: wrong key or corrupted data');
    }
    
    // Convert to string
    const decryptedText = new TextDecoder().decode(decrypted);
    
    if (!decryptedText || decryptedText.length === 0) {
      throw new Error('Decryption failed: empty result');
    }
    
    return decryptedText;
  } catch (error) {
    console.error('Decryption error:', error.message, {
      encryptedDataLength: encryptedData?.length,
      keyLength: keyBase64?.length,
      error: error.message
    });
    throw error;
  }
}

/**
 * Encrypt a key with a user's master key
 */
export function encryptKey(keyToEncrypt, masterKey) {
  return encrypt(keyToEncrypt, masterKey);
}

/**
 * Decrypt a key that was encrypted with a user's master key
 */
export function decryptKey(encryptedKeyData, masterKey) {
  return decrypt(encryptedKeyData, masterKey);
}

/**
 * Export a key (for compatibility - keys are already base64 strings)
 */
export function exportKey(keyBase64) {
  return keyBase64;
}

/**
 * Import a key (for compatibility - keys are already base64 strings)
 */
export function importKey(keyData) {
  return keyData;
}

/**
 * Gets or generates user's master key, syncing across devices via Firestore
 * Checks Firestore first to ensure same key is used as web app, then falls back to local storage
 * @param {string} userId - User ID
 * @returns {Promise<string>} Master key in base64 format
 */
export async function getUserMasterKey(userId) {
  const storageKey = `masterKey_${userId}`;
  
  // Checking Firestore first to ensure same key is used as web app
  try {
    const masterKeyRef = doc(db, 'users', userId, 'settings', 'masterKey');
    const masterKeyDoc = await getDoc(masterKeyRef);
    
    if (masterKeyDoc.exists()) {
      const keyData = masterKeyDoc.data();
      if (keyData.key) {
        // Found in Firestore - use it and store locally (this is the source of truth)
        console.log('Using master key from Firestore (synced with web app)');
        await AsyncStorage.setItem(storageKey, keyData.key);
        return keyData.key;
      }
    }
  } catch (error) {
    console.warn('Failed to get master key from Firestore:', error);
    // Continue to check local storage as fallback
  }
  
  // Fallback: Check local storage if Firestore doesn't have it
  let stored = await AsyncStorage.getItem(storageKey);
  
  if (stored) {
    // Local key exists but Firestore doesn't - sync it to Firestore
    try {
      const masterKeyRef = doc(db, 'users', userId, 'settings', 'masterKey');
      await setDoc(masterKeyRef, {
        key: stored,
        syncedAt: new Date(),
      });
      console.log('Synced local master key to Firestore');
    } catch (error) {
      console.warn('Failed to sync master key to Firestore:', error);
      // Still return the local key even if sync fails
    }
    return stored;
  }
  
  // Not found anywhere - generate new master key
  console.log('Generating new master key');
  const masterKey = generateKey();
  await AsyncStorage.setItem(storageKey, masterKey);
  
  // Store in Firestore for cross-device sync
  try {
    const masterKeyRef = doc(db, 'users', userId, 'settings', 'masterKey');
    await setDoc(masterKeyRef, {
      key: masterKey,
      syncedAt: new Date(),
    });
    console.log('Stored new master key in Firestore');
  } catch (error) {
    console.warn('Failed to store master key in Firestore:', error);
  }
  
  return masterKey;
}

/**
 * Gets trip key from local storage (decrypted with master key)
 * @param {string} tripId - Trip ID
 * @param {string} userId - User ID
 * @returns {Promise<string|null>} Decrypted trip key or null if not found
 */
export async function getTripKey(tripId, userId) {
  const storageKey = `tripKey_${tripId}_${userId}`;
  const stored = await AsyncStorage.getItem(storageKey);
  
  if (stored) {
    const masterKey = await getUserMasterKey(userId);
    return decryptKey(stored, masterKey);
  }
  return null;
}

/**
 * Stores trip key in local storage encrypted with user's master key
 * @param {string} tripId - Trip ID
 * @param {string} userId - User ID
 * @param {string} tripKey - Trip encryption key to store
 */
export async function storeTripKey(tripId, userId, tripKey) {
  const masterKey = await getUserMasterKey(userId);
  const encrypted = encryptKey(tripKey, masterKey);
  const storageKey = `tripKey_${tripId}_${userId}`;
  await AsyncStorage.setItem(storageKey, encrypted);
}
