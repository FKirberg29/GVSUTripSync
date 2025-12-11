/**
 * MediaViewerScreen Component
 * 
 * Displays images and media in a full-screen viewer with zoom and swipe capabilities.
 * Shows media from a trip's itinerary items, allowing users to browse through images
 * with swipe gestures and zoom functionality.
 */

import React from 'react';
import { Modal, View } from 'react-native';
import ImageViewer from 'react-native-image-zoom-viewer';
import { styles } from '../styles/MediaViewerScreen.styles';

export default function MediaViewerScreen({ route }) {
  const { mediaUrls, initialIndex = 0 } = route.params;

  const images = mediaUrls.map((url) => ({ url }));

  return (
    <View style={styles.container}>
      <ImageViewer
        imageUrls={images}
        index={initialIndex}
        enableSwipeDown
        onSwipeDown={() => {
        }}
        backgroundColor="#000"
        saveToLocalByLongPress={false}
      />
    </View>
  );
}
