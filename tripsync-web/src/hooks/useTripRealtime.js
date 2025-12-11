/**
 * useTripRealtime Hook
 * 
 * Custom hook for managing real-time trip data synchronization with Firestore.
 * Provides real-time updates for trip document and itinerary items, along with
 * helper functions for reordering items and logging activities.
 * 
 * Sets up Firestore listeners for trip document and itinerary collection,
 * automatically cleaning up listeners on unmount or tripId change.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  doc, collection, query, orderBy, onSnapshot, writeBatch, serverTimestamp, addDoc
} from "firebase/firestore";
import { db } from "../firebaseConfig";

/**
 * Hook for real-time trip data synchronization
 * 
 * Manages real-time Firestore listeners for trip document and itinerary items.
 * Automatically updates local state when data changes in Firestore, enabling
 * collaborative editing across multiple users.
 * 
 * @param {string} tripId - Trip document ID to load and sync
 * @param {Object} currentUser - Current authenticated user object
 * @param {string} currentUser.uid - User ID
 * @param {string} currentUser.displayName - User display name
 * @returns {Object} Object containing trip data, items, loading state, and helper functions
 * @returns {Object|null} returns.trip - Trip document data or null if not found
 * @returns {Array} returns.items - Array of itinerary items ordered by position
 * @returns {boolean} returns.loading - Loading state for initial data fetch
 * @returns {Function} returns.reorderItinerary - Function to reorder itinerary items
 * @returns {Function} returns.addLocationActivity - Function to log location addition activity
 */
export function useTripRealtime(tripId, currentUser) {
  const [trip, setTrip] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  // Stores unsubscribe functions for Firestore listeners
  const unsubRef = useRef([]);

  // Effect hook to set up real-time Firestore listeners for trip and itinerary
  useEffect(() => {
    if (!tripId) return;
    setLoading(true);
    
    // Sets up listener for trip document changes
    const tripRef = doc(db, "trips", tripId);
    const unsubTrip = onSnapshot(tripRef, (snap) => {
      setTrip(snap.exists() ? ({ id: snap.id, ...snap.data() }) : null);
    });

    // Sets up listener for itinerary items, ordered by position then creation time
    const itemsRef = collection(db, "trips", tripId, "itinerary");
    const q = query(itemsRef, orderBy("position", "asc"), orderBy("createdAt", "asc"));
    const unsubItems = onSnapshot(q, (snap) => {
      const next = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setItems(next);
      setLoading(false);
    });

    // Stores unsubscribe functions for cleanup
    unsubRef.current = [unsubTrip, unsubItems];
    return () => {
      // Unsubscribes from all listeners on unmount or tripId change
      unsubRef.current.forEach(u => u && u());
      unsubRef.current = [];
    };
  }, [tripId]);

  /**
   * Reorders itinerary items using a batch write to avoid conflicts
   * Updates position values for all items in a single transaction for consistency
   * @param {Array} nextOrder - Array of item objects in desired final sequence
   */
  async function reorderItinerary(nextOrder) {
    const batch = writeBatch(db);
    // Base value of 1000 provides spacing between positions for future inserts
    const base = 1000;
    for (let i = 0; i < nextOrder.length; i++) {
      const item = nextOrder[i];
      const ref = doc(db, "trips", tripId, "itinerary", item.id);
      batch.update(ref, { position: (i + 1) * base, updatedAt: serverTimestamp() });
    }
    await batch.commit();
  }

  /**
   * Creates an activity log entry when a location is added to the itinerary
   * Records who added the location and when for the activity feed
   * @param {string} placeName - Name of the place that was added
   */
  async function addLocationActivity(placeName) {
    const activitiesRef = collection(db, "trips", tripId, "activities");
    await addDoc(activitiesRef, {
      type: "itinerary.add",
      message: `${currentUser?.displayName || "Someone"} added "${placeName}"`,
      actorId: currentUser?.uid || "unknown",
      createdAt: serverTimestamp(),
    });
  }

  return { trip, items, loading, reorderItinerary, addLocationActivity };
}
