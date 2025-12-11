/**
 * End-to-End Encryption Utilities for Web App
 * Uses tweetnacl secretbox (XSalsa20-Poly1305) for encryption
 * This is simpler and more reliable than AES-CBC
 */

import nacl from 'tweetnacl';
import { db } from '../firebaseConfig';
import { doc, getDoc, setDoc } from 'firebase/firestore';

// Key size for secretbox (32 bytes = 256 bits)
const KEY_SIZE = 32;
// Nonce size for secretbox (24 bytes)
const NONCE_SIZE = 24;

/**
 * Convert Uint8Array to base64 string
 */
function uint8ArrayToBase64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Convert base64 string to Uint8Array
 */
function base64ToUint8Array(base64) {
  const binary = atob(base64);
  return Uint8Array.from(binary.split('').map(c => c.charCodeAt(0)));
}

/**
 * Generate a new encryption key
 * @returns {string} Base64 encoded key
 */
export function generateKey() {
  const key = nacl.randomBytes(KEY_SIZE);
  return uint8ArrayToBase64(key);
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
    const keyBytes = base64ToUint8Array(keyBase64);
    
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
    return uint8ArrayToBase64(combined);
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
    const keyBytes = base64ToUint8Array(keyBase64);
    
    if (keyBytes.length !== KEY_SIZE) {
      throw new Error('Invalid key size');
    }
    
    // Decode encrypted data from base64
    const combinedBytes = base64ToUint8Array(encryptedData);
    
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
export function encryptKey(keyToEncrypt, masterKeyBase64) {
  return encrypt(keyToEncrypt, masterKeyBase64);
}

/**
 * Decrypt a key that was encrypted with a user's master key
 */
export function decryptKey(encryptedKeyData, masterKeyBase64) {
  return decrypt(encryptedKeyData, masterKeyBase64);
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
 * Get or generate user's master key from localStorage or Firestore
 * Syncs across devices by storing in Firestore so web and mobile can share the same key
 */
export async function getUserMasterKey(userId) {
  const storageKey = `masterKey_${userId}`;
  
  // PRIORITY: Check Firestore FIRST to ensure we use the same key as mobile app
  try {
    const masterKeyRef = doc(db, 'users', userId, 'settings', 'masterKey');
    const masterKeyDoc = await getDoc(masterKeyRef);
    
    if (masterKeyDoc.exists()) {
      const keyData = masterKeyDoc.data();
      if (keyData.key) {
        console.log('Using master key from Firestore (synced with mobile app)');
        localStorage.setItem(storageKey, keyData.key);
        return keyData.key;
      }
    }
  } catch (error) {
    console.warn('Failed to get master key from Firestore:', error);
  }
  
  // Fallback: Check localStorage if Firestore doesn't have it
  let stored = localStorage.getItem(storageKey);
  
  if (stored) {
    try {
      const masterKeyRef = doc(db, 'users', userId, 'settings', 'masterKey');
      await setDoc(masterKeyRef, {
        key: stored,
        syncedAt: new Date(),
      });
      console.log('Synced local master key to Firestore');
    } catch (error) {
      console.warn('Failed to sync master key to Firestore:', error);
    }
    return stored;
  }
  
  // Not found anywhere - generate new master key
  console.log('Generating new master key');
  const masterKey = generateKey();
  localStorage.setItem(storageKey, masterKey);
  
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
 * Get trip key from local storage
 */
export async function getTripKey(tripId, userId) {
  const storageKey = `tripKey_${tripId}_${userId}`;
  const stored = localStorage.getItem(storageKey);
  
  if (stored) {
    const masterKey = await getUserMasterKey(userId);
    return decryptKey(stored, masterKey);
  }
  return null;
}

/**
 * Store trip key in local storage (encrypted with master key)
 */
export async function storeTripKey(tripId, userId, tripKey) {
  const masterKey = await getUserMasterKey(userId);
  const encrypted = encryptKey(tripKey, masterKey);
  const storageKey = `tripKey_${tripId}_${userId}`;
  localStorage.setItem(storageKey, encrypted);
}
