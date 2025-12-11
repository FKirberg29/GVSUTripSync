/**
 * TripStopsScreen Component
 * 
 * Displays itinerary items (stops) for a selected trip organized by day.
 * Shows trip stops in a scrollable card layout with day navigation,
 * handles encrypted trip data decryption, and allows navigation to stop details.
 */

import React, { useEffect, useState, useLayoutEffect, useRef } from 'react';
import {
  View,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  Text,
  FlatList,
  ScrollView,
  Modal,
} from 'react-native';
import { collection, getDocs, query, orderBy, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../FirebaseConfig';
import { Feather } from '@expo/vector-icons';
import { theme } from '../theme';
import dayjs from 'dayjs';
import { styles } from '../styles/TripStopsScreen.styles';
import { decrypt } from '../utils/encryption';
import { getTripEncryptionKey, enableTripEncryption } from '../utils/tripKeys';

export default function TripStopsScreen({ navigation, route }) {
  const { tripSyncTripId, tripTitle } = route.params || {};
  const [itineraryItems, setItineraryItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(1);
  const [allDays, setAllDays] = useState([1]);
  const [trip, setTrip] = useState(null);
  const [dayLabels, setDayLabels] = useState({});
  const [showDayPicker, setShowDayPicker] = useState(false);
  const [entryDataByItem, setEntryDataByItem] = useState({}); // Map of itemId -> { notes, mediaUrls, imageCount, videoCount }
  const [tripKey, setTripKey] = useState(null);
  const dayCardsScrollViewRef = useRef(null);

  // Always enable encryption and load key
  useEffect(() => {
    if (!tripSyncTripId || !auth.currentUser?.uid) return;

    const setupEncryption = async () => {
      try {
        // Try to get existing key
        let key = await getTripEncryptionKey(tripSyncTripId, auth.currentUser.uid);
        
        // If no key exists, enable encryption for this trip
        if (!key) {
          console.log('No trip key found, enabling encryption...');
          await enableTripEncryption(tripSyncTripId, auth.currentUser.uid);
          key = await getTripEncryptionKey(tripSyncTripId, auth.currentUser.uid);
        }
        
        if (key) {
          console.log('Trip key loaded successfully');
          setTripKey(key);
        } else {
          console.warn('Could not get trip key - screen will load without decryption');
          // Set a placeholder so the screen doesn't get stuck
          // The screen will show encrypted data as-is
          setTripKey(null);
        }
      } catch (error) {
        console.error('Error setting up encryption:', error);
        // Don't block the screen, allow it to load even without key
        setTripKey(null);
      }
    };

    setupEncryption();
  }, [tripSyncTripId]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: trip?.name || tripTitle || 'Trip Stops',
      headerTitleAlign: 'center',
      headerLeft: () => (
        <TouchableOpacity
          onPress={() => navigation.navigate('Home')}
          style={{ paddingHorizontal: 12 }}
        >
          <Feather name="arrow-left" size={24} color={theme.textLight} />
        </TouchableOpacity>
      ),
      headerRight: () => (
        <TouchableOpacity
          onPress={() => navigation.navigate('Settings')}
          style={{ paddingHorizontal: 12 }}
        >
          <Feather name="settings" size={24} color={theme.textLight} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, tripTitle, trip]);

  // Fetch trip data for day labels and start date
  useEffect(() => {
    if (!tripSyncTripId) {
      setLoading(false);
      return;
    }

    // Helper to check if string looks like base64 (encrypted) - defined outside to avoid scope issues
    const looksLikeBase64 = (str) => {
      if (!str || typeof str !== 'string') return false;
      return str.length >= 20 && /^[A-Za-z0-9+/=]+$/.test(str) && str.length % 4 === 0;
    };

    const fetchTrip = async () => {
      // Don't wait for tripKey, if it's null just show encrypted data as-is
      // This prevents the screen from getting stuck on "Loading stops..."
      
      try {
        const tripRef = doc(db, 'trips', tripSyncTripId);
        const tripSnap = await getDoc(tripRef);
        if (tripSnap.exists()) {
          const tripData = { id: tripSnap.id, ...tripSnap.data() };
          
          // Decrypt trip metadata
          if (tripData.encrypted && tripKey) {
            try {
              if (tripData.encryptedName && tripData.name && looksLikeBase64(tripData.name)) {
                try {
                  const decrypted = decrypt(tripData.name, tripKey);
                  if (decrypted && decrypted.trim().length > 0) {
                    tripData.name = decrypted.trim();
                  } else {
                    tripData.name = 'Unnamed Trip';
                  }
                } catch (decryptError) {
                  console.error('Failed to decrypt trip name:', decryptError.message || decryptError);
                  tripData.name = 'Unnamed Trip';
                }
              } else if (!tripData.name) {
                tripData.name = 'Unnamed Trip';
              }
              
              if (tripData.encryptedCategory && tripData.category && looksLikeBase64(tripData.category)) {
                try {
                  const decrypted = decrypt(tripData.category, tripKey);
                  if (decrypted && decrypted.trim().length > 0) {
                    tripData.category = decrypted.trim();
                  }
                } catch (decryptError) {
                  console.error('Failed to decrypt trip category:', decryptError.message || decryptError);
                }
              }
            } catch (error) {
              console.error('Error decrypting trip metadata:', error);
            }
          } else if (tripData.encrypted && !tripKey) {
            // Trip is encrypted but key is not available
            if (!tripData.name || (tripData.name && looksLikeBase64(tripData.name))) {
              tripData.name = 'Unnamed Trip';
            }
          }
          
          setTrip(tripData);
          setDayLabels(tripData.dayLabels || {});
        }
      } catch (err) {
        console.error('Error fetching trip:', err);
      }
    };

    fetchTrip();
  }, [tripSyncTripId, tripKey]);

  useEffect(() => {
    if (!tripSyncTripId) {
      setLoading(false);
      return;
    }

    // Don't wait for tripKey, if it's null just show encrypted data as-is
    // This prevents the screen from getting stuck on "Loading stops..."

    // Set up real-time listener for itinerary items
    const itemsRef = collection(db, 'trips', tripSyncTripId, 'itinerary');
    const unsubscribe = onSnapshot(
      itemsRef,
      async (snapshot) => {
        const items = await Promise.all(
          snapshot.docs.map(async (doc) => {
            const data = doc.data();
            
            // Decrypt title and address if encrypted
            let title = data.title;
            let address = data.address;
            
            // Helper to check if string looks like base64 (encrypted) - defined outside to avoid scope issues
            const looksLikeBase64 = (str) => {
              if (!str || typeof str !== 'string') return false;
              return str.length >= 20 && /^[A-Za-z0-9+/=]+$/.test(str) && str.length % 4 === 0;
            };
            
            if (data.encrypted && tripKey) {
              try {
                if (data.encryptedTitle && data.title && looksLikeBase64(data.title)) {
                  try {
                    const decrypted = decrypt(data.title, tripKey);
                    if (decrypted && decrypted.trim().length > 0) {
                      title = decrypted.trim();
                    } else {
                      title = 'Unnamed Stop';
                    }
                  } catch (decryptError) {
                    console.error('Failed to decrypt stop title:', decryptError.message || decryptError);
                    title = 'Unnamed Stop';
                  }
                } else if (!data.title) {
                  title = 'Unnamed Stop';
                }
                
                if (data.encryptedAddress && data.address && looksLikeBase64(data.address)) {
                  try {
                    const decrypted = decrypt(data.address, tripKey);
                    if (decrypted && decrypted.trim().length > 0) {
                      address = decrypted.trim();
                    } else {
                      // If decryption returns empty, show fallback
                      address = 'Address unavailable';
                    }
                  } catch (decryptError) {
                    console.error('Failed to decrypt stop address:', decryptError.message || decryptError);
                    // Show fallback instead of encrypted string
                    address = 'Address unavailable';
                  }
                } else if (data.encryptedAddress && data.address && !looksLikeBase64(data.address)) {
                  // Address is marked as encrypted but doesn't look encrypted - might be plaintext
                  // Keep it as-is
                }
              } catch (error) {
                console.error('Error decrypting itinerary item:', error);
                // Show fallbacks if decryption fails
                if (!title || (title && looksLikeBase64(title))) {
                  title = 'Unnamed Stop';
                }
                if (!address || (address && looksLikeBase64(address))) {
                  address = 'Address unavailable';
                }
              }
            } else if (data.encrypted && !tripKey) {
              // Encrypted but no key - show fallback
              if (!data.title || (data.title && looksLikeBase64(data.title))) {
                title = 'Unnamed Stop';
              }
              if (!data.address || (data.address && looksLikeBase64(data.address))) {
                address = 'Address unavailable';
              }
            }
            
            return {
              id: doc.id,
              ...data,
              title,
              address,
              day: typeof data.day === 'number' ? data.day : 1,
              orderIndex: typeof data.orderIndex === 'number' ? data.orderIndex : 0,
            };
          })
        );

        // Sort by day and orderIndex
        items.sort((a, b) => {
          if (a.day !== b.day) return a.day - b.day;
          return a.orderIndex - b.orderIndex;
        });

        setItineraryItems(items);

        // Update available days
        const days = [...new Set(items.map(item => item.day))].sort((a, b) => a - b);
        setAllDays(days.length > 0 ? days : [1]);

        // Set selected day to first available day if current day has no items
        if (days.length > 0 && !days.includes(selectedDay)) {
          setSelectedDay(days[0]);
        }

        setLoading(false);
      },
      (error) => {
        console.error('Error fetching itinerary items:', error);
        Alert.alert('Error', 'Could not load trip stops. Please try again.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [tripSyncTripId, selectedDay, tripKey]);

  // Helper function to check if URL is a video
  const isVideoUrl = (url) => {
    if (!url) return false;
    const videoExtensions = ['.mp4', '.mov', '.webm', '.avi', '.mkv', '.flv'];
    const lowerUrl = url.toLowerCase();
    return videoExtensions.some(ext => lowerUrl.includes(ext)) || lowerUrl.includes('/video') || lowerUrl.includes('video');
  };

  // Load TripSync entries for all items
  const loadEntriesForItems = React.useCallback(async (items) => {
    const uid = auth.currentUser?.uid;
    if (!uid || !tripSyncTripId) return;

    try {
      const entryData = {};
      
      // Load entries for all items in parallel
      const entryPromises = items.map(async (item) => {
        try {
          const entryRef = doc(db, 'trips', tripSyncTripId, 'itinerary', item.id, 'travelDiaryEntries', uid);
          const entrySnap = await getDoc(entryRef);
          
          if (entrySnap.exists()) {
            const entry = entrySnap.data();
            const mediaUrls = entry.mediaUrls || [];
            
            // Count images and videos separately
            const imageCount = mediaUrls.filter(url => !isVideoUrl(url)).length;
            const videoCount = mediaUrls.filter(url => isVideoUrl(url)).length;
            const hasNotes = !!(entry.notes && entry.notes.trim());
            
            entryData[item.id] = {
              hasNotes,
              imageCount,
              videoCount,
              mediaUrls,
            };
          } else {
            // No entry for this item
            entryData[item.id] = {
              hasNotes: false,
              imageCount: 0,
              videoCount: 0,
              mediaUrls: [],
            };
          }
        } catch (err) {
          console.error(`Error loading entry for item ${item.id}:`, err);
          entryData[item.id] = {
            hasNotes: false,
            imageCount: 0,
            videoCount: 0,
            mediaUrls: [],
          };
        }
      });
      
      await Promise.all(entryPromises);
      setEntryDataByItem(entryData);
    } catch (err) {
      console.error('Error loading entries:', err);
    }
  }, [tripSyncTripId]);

  // Load entries when items change
  useEffect(() => {
    if (itineraryItems.length > 0 && tripSyncTripId) {
      loadEntriesForItems(itineraryItems);
    }
  }, [itineraryItems, tripSyncTripId, loadEntriesForItems]);

  // Also reload entries when returning to this screen (after adding media/notes)
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (itineraryItems.length > 0 && tripSyncTripId) {
        loadEntriesForItems(itineraryItems);
      }
    });

    return unsubscribe;
  }, [navigation, itineraryItems, tripSyncTripId, loadEntriesForItems]);

  const itemsForDay = itineraryItems.filter(item => item.day === selectedDay);

  // Calculate date for a specific day
  const getDateForDay = (day) => {
    if (!trip?.startDate) return null;
    const startDate = trip.startDate?.toDate ? trip.startDate.toDate() : new Date(trip.startDate);
    const dayDate = new Date(startDate);
    dayDate.setDate(startDate.getDate() + (day - 1));
    return dayDate;
  };

  // Get stop count for a day
  const getStopCountForDay = (day) => {
    return itineraryItems.filter(item => item.day === day).length;
  };

  // Navigate to previous/next day
  const goToPreviousDay = () => {
    const currentIndex = allDays.indexOf(selectedDay);
    if (currentIndex > 0) {
      const newDay = allDays[currentIndex - 1];
      setSelectedDay(newDay);
      // Scroll to new day
      setTimeout(() => {
        if (dayCardsScrollViewRef.current) {
          dayCardsScrollViewRef.current.scrollTo({ x: (currentIndex - 1) * 108, animated: true });
        }
      }, 100);
    }
  };

  const goToNextDay = () => {
    const currentIndex = allDays.indexOf(selectedDay);
    if (currentIndex < allDays.length - 1) {
      const newDay = allDays[currentIndex + 1];
      setSelectedDay(newDay);
      // Scroll to new day
      setTimeout(() => {
        if (dayCardsScrollViewRef.current) {
          dayCardsScrollViewRef.current.scrollTo({ x: (currentIndex + 1) * 108, animated: true });
        }
      }, 100);
    }
  };

  // Auto-scroll to selected day when it changes
  useEffect(() => {
    if (dayCardsScrollViewRef.current && allDays.length > 1) {
      const currentIndex = allDays.indexOf(selectedDay);
      if (currentIndex >= 0) {
        setTimeout(() => {
          dayCardsScrollViewRef.current?.scrollTo({ x: currentIndex * 108, animated: true });
        }, 100);
      }
    }
  }, [selectedDay, allDays]);

  const canGoPrevious = allDays.indexOf(selectedDay) > 0;
  const canGoNext = allDays.indexOf(selectedDay) < allDays.length - 1;

  const renderStopItem = ({ item, index }) => {
    return (
      <TouchableOpacity
        style={styles.stopItem}
        onPress={() => {
          navigation.navigate('Stop Detail', {
            tripSyncTripId,
            itineraryItemId: item.id,
            itineraryItem: item,
            tripTitle,
          });
        }}
      >
        <View style={styles.stopNumberContainer}>
          <Text style={styles.stopNumber}>{index + 1}</Text>
        </View>
        <View style={styles.stopContent}>
          <Text style={styles.stopTitle}>{item.title || 'Untitled Stop'}</Text>
          {item.address && (
            <Text style={styles.stopAddress}>{item.address}</Text>
          )}
          
          {/* Content indicators (from TripSync entries, not itinerary planning notes) */}
          {(() => {
            const entryData = entryDataByItem[item.id] || {
              hasNotes: false,
              imageCount: 0,
              videoCount: 0,
            };
            const hasContent = entryData.hasNotes || entryData.imageCount > 0 || entryData.videoCount > 0;

            if (!hasContent) return null;

            return (
              <View style={styles.contentIndicators}>
                {/* Notes indicator */}
                {entryData.hasNotes && (
                  <View style={styles.contentIndicator}>
                    <Feather name="file-text" size={14} color={theme.accent} />
                  </View>
                )}
                
                {/* Image count */}
                {entryData.imageCount > 0 && (
                  <View style={styles.contentIndicator}>
                    <Feather name="image" size={14} color={theme.accent} />
                    <Text style={styles.contentIndicatorText}>{entryData.imageCount}</Text>
                  </View>
                )}
                
                {/* Video count */}
                {entryData.videoCount > 0 && (
                  <View style={styles.contentIndicator}>
                    <Feather name="video" size={14} color={theme.accent} />
                    <Text style={styles.contentIndicatorText}>{entryData.videoCount}</Text>
                  </View>
                )}
              </View>
            );
          })()}
        </View>
        <Feather name="chevron-right" size={20} color={theme.textDark} />
      </TouchableOpacity>
    );
  };

  const renderDayCard = (day) => {
    const isSelected = selectedDay === day;
    const stopCount = getStopCountForDay(day);
    const dayDate = getDateForDay(day);
    const dayLabel = dayLabels[day] || null;

    return (
      <TouchableOpacity
        key={day}
        style={[
          styles.dayCard,
          isSelected && styles.dayCardActive,
        ]}
        onPress={() => setSelectedDay(day)}
      >
        <View style={styles.dayCardHeader}>
          <Text style={[
            styles.dayCardNumber,
            isSelected && styles.dayCardNumberActive,
          ]}>
            Day {day}
          </Text>
          {stopCount > 0 && (
            <View style={styles.dayCardBadge}>
              <Text style={styles.dayCardBadgeText}>{stopCount}</Text>
            </View>
          )}
        </View>
        {dayLabel && (
          <Text style={[
            styles.dayCardLabel,
            isSelected && styles.dayCardLabelActive,
          ]} numberOfLines={1}>
            {dayLabel}
          </Text>
        )}
        {dayDate && (
          <Text style={[
            styles.dayCardDate,
            isSelected && styles.dayCardDateActive,
          ]}>
            {dayjs(dayDate).format('MMM D, YYYY')}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.accent} />
        <Text style={styles.loadingText}>Loading stops...</Text>
      </View>
    );
  }

  if (!tripSyncTripId) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No trip selected</Text>
      </View>
    );
  }

  const selectedDayDate = getDateForDay(selectedDay);
  const selectedDayLabel = dayLabels[selectedDay] || null;

  return (
    <View style={styles.container}>
      {/* Day Selector Header */}
      <View style={styles.daySelectorHeader}>
        {/* Navigation Arrows */}
        <TouchableOpacity
          style={[styles.navButton, !canGoPrevious && styles.navButtonDisabled]}
          onPress={goToPreviousDay}
          disabled={!canGoPrevious}
        >
          <Feather name="chevron-left" size={24} color={canGoPrevious ? theme.textDark : '#ccc'} />
        </TouchableOpacity>

        {/* Current Day Info */}
        <TouchableOpacity
          style={styles.currentDayInfo}
          onPress={() => allDays.length > 5 && setShowDayPicker(true)}
        >
          <Text style={styles.currentDayNumber}>Day {selectedDay}</Text>
          {selectedDayLabel && (
            <Text style={styles.currentDayLabel}>{selectedDayLabel}</Text>
          )}
          {selectedDayDate && (
            <Text style={styles.currentDayDate}>
              {dayjs(selectedDayDate).format('MMM D, YYYY')}
            </Text>
          )}
          <Text style={styles.currentDayCount}>
            {getStopCountForDay(selectedDay)} stop{getStopCountForDay(selectedDay) !== 1 ? 's' : ''}
          </Text>
        </TouchableOpacity>

        {/* Navigation Arrows */}
        <TouchableOpacity
          style={[styles.navButton, !canGoNext && styles.navButtonDisabled]}
          onPress={goToNextDay}
          disabled={!canGoNext}
        >
          <Feather name="chevron-right" size={24} color={canGoNext ? theme.textDark : '#ccc'} />
        </TouchableOpacity>
      </View>

      {/* Day Cards ScrollView (for quick selection) */}
      {allDays.length > 1 && (
        <ScrollView
          ref={dayCardsScrollViewRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.dayCardsContainer}
          contentContainerStyle={styles.dayCardsContent}
        >
          {allDays.map(day => renderDayCard(day))}
        </ScrollView>
      )}

      {/* Day Picker Modal (for many days) */}
      <Modal
        visible={showDayPicker}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowDayPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Day</Text>
              <TouchableOpacity onPress={() => setShowDayPicker(false)}>
                <Feather name="x" size={24} color={theme.textDark} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScrollView}>
              {allDays.map(day => {
                const dayDate = getDateForDay(day);
                const dayLabel = dayLabels[day] || null;
                const stopCount = getStopCountForDay(day);
                
                return (
                  <TouchableOpacity
                    key={day}
                    style={[
                      styles.modalDayItem,
                      selectedDay === day && styles.modalDayItemActive,
                    ]}
                    onPress={() => {
                      setSelectedDay(day);
                      setShowDayPicker(false);
                    }}
                  >
                    <View style={styles.modalDayItemLeft}>
                      <Text style={[
                        styles.modalDayItemNumber,
                        selectedDay === day && styles.modalDayItemNumberActive,
                      ]}>
                        Day {day}
                      </Text>
                      {dayLabel && (
                        <Text style={styles.modalDayItemLabel}>{dayLabel}</Text>
                      )}
                      {dayDate && (
                        <Text style={styles.modalDayItemDate}>
                          {dayjs(dayDate).format('MMM D, YYYY')}
                        </Text>
                      )}
                    </View>
                    <View style={styles.modalDayItemRight}>
                      <Text style={styles.modalDayItemCount}>{stopCount}</Text>
                      {selectedDay === day && (
                        <Feather name="check" size={20} color={theme.accent} style={{ marginLeft: 8 }} />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {itemsForDay.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Feather name="map-pin" size={48} color={theme.textDark} style={{ opacity: 0.3 }} />
          <Text style={styles.emptyTitle}>No stops yet</Text>
          <Text style={styles.emptyText}>
            Add stops to this trip in TripSync web app
          </Text>
        </View>
      ) : (
        <FlatList
          data={itemsForDay}
          renderItem={renderStopItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

