/**
 * OfflineIndicator Component
 * 
 * Displays a banner at the top of the app showing network connectivity status.
 * Shows when the app is offline or when there are pending writes being synced.
 * Automatically processes pending operations when the connection is restored.
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNetworkStatus, usePendingWrites, processPendingOperations } from '../utils/offline';

export default function OfflineIndicator() {
  const { isOnline, wasOffline } = useNetworkStatus();
  const pendingCount = usePendingWrites();

  // Process pending operations when connection is restored
  useEffect(() => {
    if (isOnline && wasOffline) {
      processPendingOperations();
    }
  }, [isOnline, wasOffline]);

  // Hide indicator when online with no pending operations
  if (isOnline && pendingCount === 0) {
    return null;
  }

  return (
    <View style={[styles.container, !isOnline ? styles.offline : styles.syncing]}>
      <Text style={styles.icon}>
        {!isOnline ? '📡' : '🔄'}
      </Text>
      <Text style={styles.text}>
        {!isOnline
          ? "You're offline"
          : `Syncing...${pendingCount > 0 ? ` (${pendingCount} pending)` : ''}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingVertical: 12,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    elevation: 5,
  },
  offline: {
    backgroundColor: '#ff6b6b',
  },
  syncing: {
    backgroundColor: '#4ecdc4',
  },
  icon: {
    fontSize: 16,
    marginRight: 8,
  },
  text: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
  },
});
