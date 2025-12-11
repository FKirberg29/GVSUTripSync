/**
 * Offline Support Utilities
 * 
 * Provides React hooks for detecting network connectivity status and
 * tracking pending Firestore writes. Uses browser online/offline events
 * to monitor connection state and provides utilities for managing
 * offline data synchronization.
 */

import { useState, useEffect } from "react";
import { db } from "../firebaseConfig";
import { collection, query, where, getDocs, onSnapshot } from "firebase/firestore";

/**
 * React hook to detect online/offline network status
 * Monitors browser online/offline events and provides current status
 * @returns {Object} Object with isOnline boolean and wasOffline boolean (temporary flag after reconnection)
 */
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setWasOffline(true);
      // Reset after a short delay
      setTimeout(() => setWasOffline(false), 3000);
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return { isOnline, wasOffline };
}

/**
 * Get pending write count from Firestore
 */
export function usePendingWrites() {
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    // Firestore doesn't expose pending writes directly, so track them manually
    // Simplified version, in production try to switch to tracking writes in a queue
    const checkPendingWrites = async () => {
      try {
        // Check if there are any pending writes in the sync queue
        const syncQueueRef = collection(db, "_syncQueue");
        const q = query(syncQueueRef, where("status", "==", "pending"));
        const snapshot = await getDocs(q);
        setPendingCount(snapshot.size);
      } catch (error) {
        // Sync queue might not exist yet
        console.debug("No sync queue found:", error);
        setPendingCount(0);
      }
    };

    // Check initially
    checkPendingWrites();

    // Set up listener for sync queue changes
    const syncQueueRef = collection(db, "_syncQueue");
    const q = query(syncQueueRef, where("status", "==", "pending"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPendingCount(snapshot.size);
    });

    return () => unsubscribe();
  }, []);

  return pendingCount;
}

/**
 * Queue an operation for offline sync
 */
export async function queueOperation(operation) {
  try {
    const { collection, addDoc, serverTimestamp } = await import("firebase/firestore");
    const syncQueueRef = collection(db, "_syncQueue");
    
    await addDoc(syncQueueRef, {
      ...operation,
      status: "pending",
      createdAt: serverTimestamp(),
      retryCount: 0,
    });
  } catch (error) {
    console.error("Error queueing operation:", error);
    throw error;
  }
}

/**
 * Process pending operations when coming back online
 */
export async function processPendingOperations() {
  try {
    const { collection, query, where, getDocs, updateDoc, doc, deleteDoc } = await import("firebase/firestore");
    const syncQueueRef = collection(db, "_syncQueue");
    const q = query(syncQueueRef, where("status", "==", "pending"));
    const snapshot = await getDocs(q);

    const operations = [];
    snapshot.forEach((docSnap) => {
      operations.push({ id: docSnap.id, ...docSnap.data() });
    });

    for (const op of operations) {
      try {
        // Execute the operation based on its type
        await executeOperation(op);
        
        // Mark as completed
        await updateDoc(doc(db, "_syncQueue", op.id), {
          status: "completed",
          completedAt: new Date(),
        });
      } catch (error) {
        console.error("Error processing operation:", error);
        
        // Increment retry count
        const retryCount = (op.retryCount || 0) + 1;
        
        if (retryCount >= 3) {
          // Mark as failed after 3 retries
          await updateDoc(doc(db, "_syncQueue", op.id), {
            status: "failed",
            error: error.message,
            failedAt: new Date(),
          });
        } else {
          // Update retry count
          await updateDoc(doc(db, "_syncQueue", op.id), {
            retryCount,
            lastRetryAt: new Date(),
          });
        }
      }
    }
  } catch (error) {
    console.error("Error processing pending operations:", error);
  }
}

/**
 * Execute a queued operation
 */
async function executeOperation(operation) {
  const { setDoc, updateDoc, deleteDoc: deleteDocFn, doc: docFn } = await import("firebase/firestore");
  
  switch (operation.type) {
    case "set":
      await setDoc(docFn(db, operation.path), operation.data, operation.options);
      break;
    case "update":
      await updateDoc(docFn(db, operation.path), operation.data);
      break;
    case "delete":
      await deleteDocFn(docFn(db, operation.path));
      break;
    default:
      throw new Error(`Unknown operation type: ${operation.type}`);
  }
}

