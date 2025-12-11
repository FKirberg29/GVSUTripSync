/**
 * OfflineIndicator Component
 * 
 * Displays a banner indicating network connectivity status and the number of pending write operations.
 * Automatically processes pending operations when the connection is restored.
 */

import { useNetworkStatus, usePendingWrites, processPendingOperations } from "../utils/offline";
import { useEffect } from "react";
import "./OfflineIndicator.css";

export default function OfflineIndicator() {
  const { isOnline, wasOffline } = useNetworkStatus();
  const pendingCount = usePendingWrites();

  useEffect(() => {
    if (isOnline && wasOffline) {
      // Process pending operations when coming back online
      processPendingOperations();
    }
  }, [isOnline, wasOffline]);

  if (isOnline && pendingCount === 0) {
    return null;
  }

  return (
    <div className={`offline-indicator ${!isOnline ? "offline" : "syncing"}`}>
      <div className="offline-indicator-content">
        {!isOnline ? (
          <>
            <span className="offline-icon">📡</span>
            <span className="offline-text">You're offline</span>
          </>
        ) : (
          <>
            <span className="offline-icon">🔄</span>
            <span className="offline-text">
              Syncing... {pendingCount > 0 && `(${pendingCount} pending)`}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

