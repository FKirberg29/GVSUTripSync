/**
 * StopDetailScreen Component
 * 
 * Displays detailed information for a single itinerary item (stop) including:
 * - Notes editing with encryption support
 * - Media viewing and uploading (images and videos)
 * - Media deletion and management
 * 
 * Handles encryption/decryption of notes and media metadata, file uploads
 * to Firebase Storage, and real-time updates via Firestore.
 */

import React, { useState, useEffect, useLayoutEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Image,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { doc, getDoc, updateDoc, setDoc, arrayUnion, arrayRemove, serverTimestamp } from 'firebase/firestore';
import { ref, getDownloadURL, deleteObject, uploadBytes } from 'firebase/storage';
import { auth, db, storage } from '../FirebaseConfig';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Feather } from '@expo/vector-icons';
import { encrypt, decrypt } from '../utils/encryption';
import { getTripEncryptionKey, enableTripEncryption } from '../utils/tripKeys';
import { rateLimitedCall, rateLimiters } from '../utils/rateLimiting';
import { theme } from '../theme';
import { styles } from '../styles/StopDetailScreen.styles';

export default function StopDetailScreen({ navigation, route }) {
  const { tripSyncTripId, itineraryItemId, itineraryItem: initialItem, tripTitle } = route.params || {};
  const [item, setItem] = useState(initialItem || null);
  const [notes, setNotes] = useState('');
  const [media, setMedia] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const [tripKey, setTripKey] = useState(null);
  
  // Maximum file sizes (in bytes)
  const MAX_FILE_SIZE_IMAGE = 10 * 1024 * 1024; // 10MB for images
  const MAX_FILE_SIZE_VIDEO = 100 * 1024 * 1024; // 100MB for videos
  const MAX_FILE_SIZE_GENERAL = 100 * 1024 * 1024; // 100MB general limit
  
  // Allowed MIME types
  const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'];
  const ALLOWED_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES];

  // Always enable encryption and load key
  useEffect(() => {
    if (!tripSyncTripId || !auth.currentUser?.uid) return;

    const setupEncryption = async () => {
      try {
        // Try to get existing key
        let key = await getTripEncryptionKey(tripSyncTripId, auth.currentUser.uid);
        
        // If no key exists, enable encryption for this trip
        if (!key) {
          await enableTripEncryption(tripSyncTripId, auth.currentUser.uid);
          key = await getTripEncryptionKey(tripSyncTripId, auth.currentUser.uid);
        }
        
        setTripKey(key);
      } catch (error) {
        console.error('Error setting up encryption:', error);
      }
    };

    setupEncryption();
  }, [tripSyncTripId]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: item?.title || 'Stop Detail',
      headerTitleAlign: 'center',
      headerLeft: () => (
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={{ paddingHorizontal: 12 }}
        >
          <Feather name="arrow-left" size={24} color={theme.textLight} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, item]);

  useEffect(() => {
    const loadItem = async () => {
      if (!tripSyncTripId || !itineraryItemId) {
        setLoading(false);
        return;
      }

      const uid = auth.currentUser?.uid;
      if (!uid) {
        setLoading(false);
        return;
      }

      // Helper to check if string looks like base64 (encrypted)
      const looksLikeBase64 = (str) => {
        if (!str || typeof str !== 'string') return false;
        return str.length >= 20 && /^[A-Za-z0-9+/=]+$/.test(str) && str.length % 4 === 0;
      };

      try {
        // Load the itinerary item
        const itemRef = doc(db, 'trips', tripSyncTripId, 'itinerary', itineraryItemId);
        const itemSnap = await getDoc(itemRef);
        
        if (itemSnap.exists()) {
          const itemData = { id: itemSnap.id, ...itemSnap.data() };
          
          // Decrypt title and address if encrypted
          if (itemData.encrypted && tripKey) {
            try {
              if (itemData.encryptedTitle && itemData.title && looksLikeBase64(itemData.title)) {
                try {
                  const decrypted = decrypt(itemData.title, tripKey);
                  if (decrypted && decrypted.trim().length > 0) {
                    itemData.title = decrypted.trim();
                  } else {
                    itemData.title = 'Unnamed Stop';
                  }
                } catch (decryptError) {
                  console.error('Failed to decrypt stop title:', decryptError.message || decryptError);
                  itemData.title = 'Unnamed Stop';
                }
              } else if (!itemData.title) {
                itemData.title = 'Unnamed Stop';
              }
              
              if (itemData.encryptedAddress && itemData.address && looksLikeBase64(itemData.address)) {
                try {
                  const decrypted = decrypt(itemData.address, tripKey);
                  if (decrypted && decrypted.trim().length > 0) {
                    itemData.address = decrypted.trim();
                  } else {
                    itemData.address = 'Address unavailable';
                  }
                } catch (decryptError) {
                  console.error('Failed to decrypt stop address:', decryptError.message || decryptError);
                  itemData.address = 'Address unavailable';
                }
              } else if (itemData.encryptedAddress && itemData.address && !looksLikeBase64(itemData.address)) {
                // Address is marked as encrypted but doesn't look encrypted - might be plaintext
                // Keep it as-is
              }
            } catch (error) {
              console.error('Error decrypting item metadata:', error);
              // Show fallbacks if decryption fails
              if (!itemData.title || (itemData.title && looksLikeBase64(itemData.title))) {
                itemData.title = 'Unnamed Stop';
              }
              if (!itemData.address || (itemData.address && looksLikeBase64(itemData.address))) {
                itemData.address = 'Address unavailable';
              }
            }
          } else if (itemData.encrypted && !tripKey) {
            // Encrypted but no key - show fallback
            if (!itemData.title || (itemData.title && looksLikeBase64(itemData.title))) {
              itemData.title = 'Unnamed Stop';
            }
            if (!itemData.address || (itemData.address && looksLikeBase64(itemData.address))) {
              itemData.address = 'Address unavailable';
            }
          }
          
          setItem(itemData);
          
          // Load user's TripSync entry (separate from itinerary planning notes)
          const entryRef = doc(db, 'trips', tripSyncTripId, 'itinerary', itineraryItemId, 'travelDiaryEntries', uid);
          const entrySnap = await getDoc(entryRef);
          
          if (entrySnap.exists()) {
            const entryData = entrySnap.data();
            let notesText = entryData.notes || '';

            // Decrypt notes (encryption is always enabled)
            if (tripKey && entryData.encrypted) {
              try {
                notesText = decrypt(notesText, tripKey);
              } catch (error) {
                console.error('Error decrypting notes:', error);
                notesText = '[Encrypted notes - decryption failed]';
              }
            }

            setNotes(notesText);
            
            // Load existing media from user's entry
            if (entryData.mediaUrls && entryData.mediaUrls.length > 0) {
              const existingMedia = entryData.mediaUrls.map(url => ({
                uri: url,
                type: url.includes('video') || url.includes('.mp4') || url.includes('.mov') ? 'video' : 'image',
                existing: true,
              }));
              setMedia(existingMedia);
            } else {
              setMedia([]);
            }
          } else {
            // No entry yet for this user
            setNotes('');
            setMedia([]);
          }
        }
      } catch (err) {
        console.error('Error loading item:', err);
        Alert.alert('Error', 'Could not load stop details.');
      } finally {
        setLoading(false);
      }
    };

    loadItem();
  }, [tripSyncTripId, itineraryItemId, tripKey]);

  const handleMediaPick = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsMultipleSelection: true,
        quality: 0.8,
        // videoQuality and videoMaxDuration options may not be available in all versions
      });

      if (!result.canceled && result.assets) {
        // Check file sizes and types before adding
        const validMedia = [];
        for (const asset of result.assets) {
          try {
            // Get file info
            const fileInfo = await FileSystem.getInfoAsync(asset.uri);
            const fileSize = fileInfo.size || asset.fileSize || 0;
            const assetType = asset.type || (asset.uri.includes('.mp4') || asset.uri.includes('.mov') || asset.uri.includes('.webm') ? 'video' : 'image');
            const mimeType = asset.mimeType || (assetType === 'video' ? 'video/mp4' : 'image/jpeg');
            
            // Validate file size
            const maxSize = assetType === 'video' ? MAX_FILE_SIZE_VIDEO : MAX_FILE_SIZE_IMAGE;
            if (fileSize > maxSize) {
              Alert.alert(
                'File Too Large',
                `${asset.fileName || 'File'} is ${(fileSize / 1024 / 1024).toFixed(1)}MB. Maximum size is ${maxSize / 1024 / 1024}MB for ${assetType}s.`
              );
              continue;
            }
            
            // Validate MIME type (if available)
            if (mimeType && !ALLOWED_TYPES.includes(mimeType)) {
              Alert.alert(
                'Invalid File Type',
                `${asset.fileName || 'File'} has type "${mimeType}" which is not allowed. Allowed types: images (JPEG, PNG, GIF, WebP) and videos (MP4, QuickTime, WebM).`
              );
              continue;
            }

            validMedia.push({
              uri: asset.uri,
              type: assetType,
              fileName: asset.fileName || asset.uri.split('/').pop(),
              fileSize: fileSize,
              mimeType: mimeType,
              existing: false,
            });
          } catch (err) {
            console.error('Error checking file:', err);
            // Skip file if validation fails
            Alert.alert('Error', `Could not validate ${asset.fileName || 'file'}. Please try again.`);
          }
        }
        
        if (validMedia.length > 0) {
          setMedia(prev => [...prev, ...validMedia]);
        }
      }
    } catch (err) {
      console.error('Error picking media:', err);
      Alert.alert('Error', 'Could not pick media. Please try again.');
    }
  };

  const handleRemoveMedia = (index) => {
    const mediaToRemove = media[index];
    setMedia(prev => prev.filter((_, i) => i !== index));
    
    // If it's an existing media, remove it from Firestore
    if (mediaToRemove.existing) {
      // Handle this in save
    }
  };

  const handleSave = async () => {
    if (!tripSyncTripId || !itineraryItemId) {
      Alert.alert('Error', 'Missing trip or stop information.');
      return;
    }

    const uid = auth.currentUser?.uid;
    if (!uid) {
      Alert.alert('Error', 'User not authenticated.');
      return;
    }

    setSaving(true);

    try {
      const itemRef = doc(db, 'trips', tripSyncTripId, 'itinerary', itineraryItemId);
      const mediaUrls = [];

      // First, keep existing media URLs
      for (const item of media) {
        if (item.existing) {
          mediaUrls.push(item.uri);
        }
      }

      // Upload new media in parallel
      const newMediaItems = media.filter(item => !item.existing);
      console.log(`Uploading ${newMediaItems.length} new media item(s)`);
      
      if (newMediaItems.length === 0) {
        console.log('No new media to upload, proceeding with save');
      } else {
        // Check rate limit before starting uploads
        if (!rateLimiters.fileUpload.isAllowed()) {
          const waitTime = rateLimiters.fileUpload.getTimeUntilNextAllowed();
          Alert.alert(
            'Rate Limit Exceeded',
            `Too many uploads. Please wait ${Math.ceil(waitTime / 1000)} seconds before uploading more files.`
          );
          setSaving(false);
          return;
        }
        
        const uploadPromises = newMediaItems.map(async (item) => {
          try {
            console.log(`Starting upload for: ${item.fileName || item.uri}`);
            const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}-${item.fileName || item.uri.split('/').pop()}`;
            const fileRef = ref(storage, `trips/${tripSyncTripId}/itinerary/${itineraryItemId}/media/${filename}`);
            
            // Track upload progress
            const uploadKey = `${item.uri}-${filename}`;
            
            // Using react-native-blob-util to upload files in React Native
            // Firebase Storage's uploadBytes doesn't support Uint8Array/Blob in React Native
            console.log(`Starting Firebase upload for: ${filename}`);
            
            // Show initial progress
            setUploadProgress(prev => ({
              ...prev,
              [uploadKey]: 0,
            }));
            
            try {
              // Use react-native-blob-util to read file as binary array
              // This avoids Blob creation which isn't supported in React Native
              console.log(`Reading file with react-native-blob-util: ${item.uri}`);
              
              // Get file info
              const fileInfo = await ReactNativeBlobUtil.fs.stat(item.uri);
              const fileSize = fileInfo.size;
              console.log(`File size: ${fileSize} bytes`);
              
              // Read file as base64 and convert to binary array manually
              const base64String = await ReactNativeBlobUtil.fs.readFile(item.uri, 'base64');
              console.log(`File read as base64, length: ${base64String.length}`);
              
              // Convert base64 to binary string, then to array
              // This creates a plain array that Firebase might accept
              const binaryString = atob(base64String);
              
              // Create a plain array (not Uint8Array) - use regular Array
              const bytes = [];
              for (let i = 0; i < binaryString.length; i++) {
                bytes.push(binaryString.charCodeAt(i));
              }
              
              console.log(`Converted to array, length: ${bytes.length}`);
              
              // Try using uploadBytes with a plain array
              console.log(`Uploading to Firebase Storage...`);
              
              setUploadProgress(prev => ({
                ...prev,
                [uploadKey]: 25,
              }));
              
              // Get user token for authenticated upload
              const user = auth.currentUser;
              if (!user) {
                throw new Error('User not authenticated');
              }
              
              const token = await user.getIdToken();
              
              // Get the storage bucket URL
              const storageBucket = storage.app.options.storageBucket;
              const uid = auth.currentUser?.uid;
              if (!uid) {
                throw new Error('User not authenticated');
              }
              // Store media in user-specific path for TripSync entries
              const storagePath = `trips/${tripSyncTripId}/itinerary/${itineraryItemId}/travelDiaryEntries/${uid}/media/${filename}`;
              
              // Use REST API directly to avoid Blob issues
              const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${storageBucket}/o?name=${encodeURIComponent(storagePath)}`;
              
              console.log(`Uploading via REST API...`);
              
              setUploadProgress(prev => ({
                ...prev,
                [uploadKey]: 50,
              }));
              
              // Upload using react-native-blob-util's fetch
              const response = await ReactNativeBlobUtil.fetch(
                'POST',
                uploadUrl,
                {
                  'Authorization': `Firebase ${token}`,
                  'Content-Type': item.type === 'video' ? 'video/mp4' : 'image/jpeg',
                },
                ReactNativeBlobUtil.wrap(item.uri) // Use file directly instead of base64
              );
              
              if (response.info().status !== 200) {
                const errorText = await response.text();
                throw new Error(`Upload failed: ${errorText}`);
              }
              
              const responseData = await response.json();
              console.log(`Upload response:`, responseData);
              
              setUploadProgress(prev => ({
                ...prev,
                [uploadKey]: 75,
              }));
              
              // Get download URL from response (storagePath already includes user-specific path)
              const downloadURL = `https://firebasestorage.googleapis.com/v0/b/${storageBucket}/o/${encodeURIComponent(responseData.name)}?alt=media&token=${responseData.downloadTokens}`;
              
              console.log(`Upload completed, download URL: ${downloadURL.substring(0, 50)}...`);
              
              setUploadProgress(prev => {
                const newProgress = { ...prev };
                delete newProgress[uploadKey];
                return newProgress;
              });
              
              mediaUrls.push(downloadURL);
              console.log(`Successfully uploaded: ${item.fileName}`);
              return downloadURL;
            } catch (uploadError) {
              console.error('Upload error:', uploadError);
              setUploadProgress(prev => {
                const newProgress = { ...prev };
                delete newProgress[uploadKey];
                return newProgress;
              });
              throw uploadError;
            }
          } catch (err) {
            console.error('Error uploading media:', err);
            const errorMessage = err.message || 'Unknown error';
            Alert.alert(
              'Upload Failed', 
              `Failed to upload ${item.fileName || 'media'}: ${errorMessage}`
            );
            throw err; // Re-throw to handle in Promise.allSettled
          }
        });

        // Wait for all uploads to complete (use Promise.allSettled to handle individual failures)
        const uploadResults = await Promise.allSettled(uploadPromises);
        
        // Check if any uploads failed
        const failedUploads = uploadResults.filter(result => result.status === 'rejected');
        if (failedUploads.length > 0 && failedUploads.length === uploadPromises.length) {
          // All uploads failed
          console.error('All uploads failed:', failedUploads);
          throw new Error('All uploads failed. Please try again.');
        } else if (failedUploads.length > 0) {
          // Some uploads failed
          console.warn(`${failedUploads.length} upload(s) failed:`, failedUploads);
          Alert.alert(
            'Partial Upload Failure',
            `${failedUploads.length} file(s) failed to upload. The rest were saved successfully.`
          );
        }
      }


      // Store TripSync entry in user-specific subcollection (separate from itinerary planning notes)
      const entryRef = doc(db, 'trips', tripSyncTripId, 'itinerary', itineraryItemId, 'travelDiaryEntries', uid);
      
      // Get current entry to find removed media
      const currentEntrySnap = await getDoc(entryRef);
      const currentEntry = currentEntrySnap.exists() ? currentEntrySnap.data() : null;
      const currentMediaUrls = currentEntry?.mediaUrls || [];
      const removedMediaUrls = currentMediaUrls.filter(url => !mediaUrls.includes(url));

      // Always encrypt notes
      let notesToSave = notes || null;
      let isEncrypted = false;

      if (tripKey && notesToSave) {
        try {
          notesToSave = encrypt(notesToSave, tripKey);
          isEncrypted = true;
        } catch (error) {
          console.error('Error encrypting notes:', error);
          Alert.alert('Error', 'Failed to encrypt notes. Please try again.');
          setSaving(false);
          return;
        }
      } else if (notesToSave && !tripKey) {
        // If key not loaded yet, wait a bit and retry
        Alert.alert('Error', 'Encryption key not ready. Please try again in a moment.');
        setSaving(false);
        return;
      }

      // Create or update user's TripSync entry
      if (currentEntrySnap.exists()) {
        // Update existing entry
        await updateDoc(entryRef, {
          notes: notesToSave,
          encrypted: isEncrypted,
          mediaUrls: mediaUrls.length > 0 ? mediaUrls : null,
          updatedAt: serverTimestamp(),
        });
      } else {
        // Create new entry
        await setDoc(entryRef, {
          notes: notesToSave,
          encrypted: isEncrypted,
          mediaUrls: mediaUrls.length > 0 ? mediaUrls : null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: uid,
        });
      }

      // Delete removed media from storage (only if entry is being updated, not deleted)
      for (const url of removedMediaUrls) {
        try {
          // Extract path from URL
          const pathMatch = url.match(/\/o\/(.+)\?alt/);
          if (pathMatch) {
            const filePath = decodeURIComponent(pathMatch[1]);
            const fileRef = ref(storage, filePath);
            await deleteObject(fileRef);
          }
        } catch (err) {
          console.warn('Could not delete old media:', err);
        }
      }

      Alert.alert('Success', 'Stop updated successfully!', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (err) {
      console.error('Error saving stop:', err);
      Alert.alert('Error', 'Could not save stop. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const VideoPlayer = ({ uri }) => {
    const player = useVideoPlayer(uri, (player) => {
      player.loop = false;
      player.muted = false;
    });
    
    return (
      <VideoView
        player={player}
        style={styles.mediaPreview}
        nativeControls
        contentFit="contain"
        allowsFullscreen
      />
    );
  };

  const renderMedia = () => {
    return media.map((item, index) => {
      const uploadKey = item.existing ? null : `${item.uri}-${Date.now()}-${item.fileName}`;
      const progress = uploadKey ? uploadProgress[uploadKey] : null;
      const isUploading = progress !== null && progress < 100;

      return (
        <View key={index} style={styles.mediaItem}>
          {item.type === 'video' ? (
            <VideoPlayer uri={item.uri} />
          ) : (
            <Image source={{ uri: item.uri }} style={styles.mediaPreview} />
          )}
          {isUploading && (
            <View style={styles.uploadOverlay}>
              <ActivityIndicator size="small" color={theme.accent} />
              <Text style={styles.uploadProgressText}>
                {Math.round(progress)}%
              </Text>
            </View>
          )}
          <TouchableOpacity
            style={styles.removeMediaButton}
            onPress={() => handleRemoveMedia(index)}
            disabled={isUploading}
          >
            <Feather name="x" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      );
    });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.accent} />
        <Text style={styles.loadingText}>Loading stop...</Text>
      </View>
    );
  }

  if (!item) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>Stop not found</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.stopTitle}>{item.title}</Text>
        {item.address && (
          <Text style={styles.stopAddress}>
            <Feather name="map-pin" size={14} color={theme.accent} /> {item.address}
          </Text>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notes</Text>
        <TextInput
          style={styles.notesInput}
          placeholder="Add your notes, experiences, thoughts..."
          placeholderTextColor="#999"
          multiline
          numberOfLines={6}
          value={notes}
          onChangeText={setNotes}
          textAlignVertical="top"
        />
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Photos & Videos</Text>
          <TouchableOpacity
            style={styles.addMediaButton}
            onPress={handleMediaPick}
          >
            <Feather name="plus" size={20} color={theme.textLight} />
            <Text style={styles.addMediaText}>Add</Text>
          </TouchableOpacity>
        </View>
        {media.length > 0 ? (
          <View style={styles.mediaContainer}>
            {renderMedia()}
          </View>
        ) : (
          <View style={styles.emptyMediaContainer}>
            <Feather name="image" size={48} color="#ccc" />
            <Text style={styles.emptyMediaText}>No photos or videos yet</Text>
            <Text style={styles.emptyMediaSubtext}>Tap "Add" to add media</Text>
          </View>
        )}
      </View>

      <TouchableOpacity
        style={[styles.saveButton, saving && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator size="small" color={theme.textLight} />
        ) : (
          <Text style={styles.saveButtonText}>Save</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}


