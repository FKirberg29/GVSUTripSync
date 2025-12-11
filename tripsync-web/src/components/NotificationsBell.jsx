/**
 * NotificationsBell Component
 * 
 * Notification bell icon that displays a count of recent trip activities.
 * Listens for new activities and calls the onNewActivity callback when new activities are detected.
 */

import { useEffect, useState } from "react";
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { db } from "../firebaseConfig";

/**
 * Renders a notification bell with activity count badge
 * @param {string} tripId - Trip ID to listen for activities
 * @param {Function} onNewActivity - Callback function called when new activity is detected, receives activity data
 */
export default function NotificationsBell({ tripId, onNewActivity }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!tripId) return;
    const ref = collection(db, "trips", tripId, "activities");
    const q = query(ref, orderBy("createdAt", "desc"), limit(10));
    const unsub = onSnapshot(q, (snap) => {
      setCount(snap.size);
      // Notify on the newest activity doc
      const newest = snap.docs[0]?.data();
      if (newest && onNewActivity) onNewActivity(newest);
    });
    return () => unsub();
  }, [tripId, onNewActivity]);

  return (
    <button className="relative rounded-full p-2 hover:bg-gray-100">
      <span className="material-icons">notifications</span>
      {count > 0 && (
        <span className="absolute -top-1 -right-1 bg-red-600 text-white text-xs rounded-full px-1">
          {count}
        </span>
      )}
    </button>
  );
}
