/**
 * Offline Support Utilities
 * 
 * Provides hooks and functions for handling offline functionality:
 * - Network status detection
 * - Pending write operations queue
 * - Media file caching
 * - Synchronization of queued operations when connection is restored
 */

import { useState, useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../FirebaseConfig';
import { collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';

const MEDIA_CACHE_DIR = `${FileSystem.cacheDirectory}tripsync-media/`;
const SYNC_QUEUE_KEY = '@tripsync:syncQueue';

/**
 * Hook to detect online/offline network status
 * @returns {Object} Object with isOnline and wasOffline flags
 */
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(true);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = state.isConnected && state.isInternetReachable;
      setIsOnline(online);
      
      if (online && !state.isConnected) {
        setWasOffline(true);
        setTimeout(() => setWasOffline(false), 3000);
      }
    });

    return () => unsubscribe();
  }, []);

  return { isOnline, wasOffline };
}

/**
 * Hook to get count of pending write operations
 * @returns {number} Number of pending operations in sync queue
 */
export function usePendingWrites() {
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const loadPendingCount = async () => {
      try {
        const queueJson = await AsyncStorage.getItem(SYNC_QUEUE_KEY);
        const queue = queueJson ? JSON.parse(queueJson) : [];
        setPendingCount(queue.filter((op) => op.status === 'pending').length);
      } catch (error) {
        console.error('Error loading pending count:', error);
        setPendingCount(0);
      }
    };

    loadPendingCount();
    const interval = setInterval(loadPendingCount, 2000);
    return () => clearInterval(interval);
  }, []);

  return pendingCount;
}

/**
 * Queues an operation for offline sync when connection is restored
 * @param {Object} operation - Operation object with type, path, data, etc.
 */
export async function queueOperation(operation) {
  try {
    const queueJson = await AsyncStorage.getItem(SYNC_QUEUE_KEY);
    const queue = queueJson ? JSON.parse(queueJson) : [];
    
    queue.push({
      ...operation,
      id: Date.now().toString(),
      status: 'pending',
      createdAt: new Date().toISOString(),
      retryCount: 0,
    });
    
    await AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
  } catch (error) {
    console.error('Error queueing operation:', error);
    throw error;
  }
}

/**
 * Processes all pending operations when connection is restored
 * Attempts to execute each operation and marks as completed or failed
 */
export async function processPendingOperations() {
  try {
    const queueJson = await AsyncStorage.getItem(SYNC_QUEUE_KEY);
    if (!queueJson) return;

    const queue = JSON.parse(queueJson);
    const pendingOps = queue.filter((op) => op.status === 'pending');

    for (const op of pendingOps) {
      try {
        await executeOperation(op);
        
        // Mark as completed
        op.status = 'completed';
        op.completedAt = new Date().toISOString();
      } catch (error) {
        console.error('Error processing operation:', error);
        
        op.retryCount = (op.retryCount || 0) + 1;
        
        if (op.retryCount >= 3) {
          op.status = 'failed';
          op.error = error.message;
          op.failedAt = new Date().toISOString();
        }
      }
    }

    // Save updated queue
    await AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
  } catch (error) {
    console.error('Error processing pending operations:', error);
  }
}

/**
 * Executes a queued operation against Firestore
 * @param {Object} operation - Operation to execute with type, path, data
 */
async function executeOperation(operation) {
  const { setDoc, updateDoc, deleteDoc, doc } = await import('firebase/firestore');
  
  switch (operation.type) {
    case 'set':
      await setDoc(doc(db, operation.path), operation.data, operation.options);
      break;
    case 'update':
      await updateDoc(doc(db, operation.path), operation.data);
      break;
    case 'delete':
      await deleteDoc(doc(db, operation.path));
      break;
    default:
      throw new Error(`Unknown operation type: ${operation.type}`);
  }
}

/**
 * Caches media file locally for offline access
 * @param {string} url - URL of the media file to cache
 * @param {string} filename - Local filename to use for cached file
 * @returns {Promise<string>} Local file path or original URL if caching fails
 */
export async function cacheMedia(url, filename) {
  try {
    // Ensure cache directory exists
    const dirInfo = await FileSystem.getInfoAsync(MEDIA_CACHE_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(MEDIA_CACHE_DIR, { intermediates: true });
    }

    const localPath = `${MEDIA_CACHE_DIR}${filename}`;
    
    // Check if already cached
    const fileInfo = await FileSystem.getInfoAsync(localPath);
    if (fileInfo.exists) {
      return localPath;
    }

    // Download and cache
    const downloadResult = await FileSystem.downloadAsync(url, localPath);
    return downloadResult.uri;
  } catch (error) {
    console.error('Error caching media:', error);
    return url; // Return original URL on error
  }
}

/**
 * Gets cached media file path or returns original URL if not cached
 * @param {string} url - URL of the media file
 * @returns {Promise<string>} Local cached path or original URL
 */
export async function getCachedMedia(url) {
  try {
    const filename = url.split('/').pop().split('?')[0];
    const localPath = `${MEDIA_CACHE_DIR}${filename}`;
    
    const fileInfo = await FileSystem.getInfoAsync(localPath);
    if (fileInfo.exists) {
      return localPath;
    }
    
    return url;
  } catch (error) {
    console.error('Error getting cached media:', error);
    return url;
  }
}

/**
 * Clears all cached media files
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
export async function clearMediaCache() {
  try {
    const dirInfo = await FileSystem.getInfoAsync(MEDIA_CACHE_DIR);
    if (dirInfo.exists) {
      await FileSystem.deleteAsync(MEDIA_CACHE_DIR, { idempotent: true });
    }
    return true;
  } catch (error) {
    console.error('Error clearing media cache:', error);
    return false;
  }
}
