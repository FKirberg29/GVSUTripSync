/**
 * HomeScreen Component
 * 
 * Main screen that displays all TripSync trips the user is a member of.
 * Allows users to select a trip and navigate to view trip stops.
 * Handles decryption of encrypted trip metadata and displays trip names,
 * dates, and categories.
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Alert,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import DropDownPicker from 'react-native-dropdown-picker';
import {
  collection,
  getDocs,
  getDoc,
  doc,
  query,
  where,
} from 'firebase/firestore';
import { auth, db } from '../FirebaseConfig';
import dayjs from 'dayjs';
import { theme } from '../theme';
import { signOut } from 'firebase/auth';
import { styles } from '../styles/HomeScreen.styles';
import { decrypt } from '../utils/encryption';
import { getTripEncryptionKey, enableTripEncryption } from '../utils/tripKeys';

export default function HomeScreen({ navigation }) {
  const [tripSyncTrips, setTripSyncTrips] = useState([]);
  const [selectedTripSyncId, setSelectedTripSyncId] = useState(null);
  const [open, setOpen] = useState(false);
  const [tripItems, setTripItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTripSyncTrips = async () => {
      try {
        const uid = auth.currentUser?.uid;
        if (!uid) {
          setLoading(false);
          return;
        }

        // Fetch TripSync trips where user is a member
        const tripsRef = collection(db, 'trips');
        const q = query(tripsRef, where(`members.${uid}`, '==', true));
        const snapshot = await getDocs(q);

        // Decrypt trip metadata
        const tripSyncData = await Promise.all(
          snapshot.docs.map(async (doc) => {
            const data = doc.data();
            
            // Helper to check if string looks like base64 (encrypted)
            const looksLikeBase64 = (str) => {
              if (!str || typeof str !== 'string') return false;
              // Base64 strings are typically longer and match the pattern
              return str.length >= 20 && /^[A-Za-z0-9+/=]+$/.test(str) && str.length % 4 === 0;
            };
            
            // Try to get encryption key and decrypt
            try {
              let tripKey = await getTripEncryptionKey(doc.id, uid);
              
              // If no key exists, log that it may need to be re-shared by trip owner
              if (!tripKey) {
                // getTripEncryptionKey automatically tries to re-share if decryption fails and user is owner
                console.log('Could not get trip encryption key - may need to be re-shared by trip owner');
              }
              
              // Handle encrypted trip data
              if (data.encrypted) {
                if (tripKey) {
                  // Decrypt trip data using the key
                  try {
                    // Decrypt trip name
                    if (data.name && typeof data.name === 'string' && data.name.trim().length > 0) {
                      // Only try to decrypt if it looks like base64 (encrypted)
                      if (looksLikeBase64(data.name)) {
                        try {
                          const decrypted = decrypt(data.name, tripKey);
                          // Only use decrypted value if it's valid
                          if (decrypted && decrypted.trim().length > 0) {
                            data.name = decrypted.trim();
                          } else {
                            // If decryption returns empty, use fallback
                            data.name = 'Unnamed Trip';
                          }
                        } catch (decryptError) {
                          console.error('Failed to decrypt trip name:', decryptError.message || decryptError);
                          // If decryption fails, show a fallback instead of encrypted string
                          data.name = 'Unnamed Trip';
                        }
                      }
                      // If it doesn't look encrypted, keep the original name
                    } else {
                      // No name at all, use fallback
                      data.name = 'Unnamed Trip';
                    }
                    
                    // Decrypt trip category
                    if (data.category && typeof data.category === 'string' && data.category.trim().length > 0) {
                      if (looksLikeBase64(data.category)) {
                        try {
                          const decrypted = decrypt(data.category, tripKey);
                          if (decrypted && decrypted.trim().length > 0) {
                            data.category = decrypted.trim();
                          }
                        } catch (decryptError) {
                          console.error('Failed to decrypt trip category:', decryptError.message || decryptError);
                          data.category = '';
                        }
                      }
                    }
                  } catch (error) {
                    console.error('Error decrypting trip metadata:', error);
                    // If name looks encrypted but decryption fails, show fallback
                    if (data.name && looksLikeBase64(data.name)) {
                      data.name = 'Unnamed Trip';
                    }
                  }
                } else {
                  // Trip is encrypted but key is not available - show fallback for encrypted-looking names
                  if (data.name && looksLikeBase64(data.name)) {
                    data.name = 'Unnamed Trip';
                  } else if (!data.name) {
                    data.name = 'Unnamed Trip';
                  }
                }
              } else if (!data.name) {
                // Trip is not encrypted but has no name
                data.name = 'Unnamed Trip';
              }
            } catch (error) {
              console.error('Error getting trip encryption key:', error);
              // On error, if name looks encrypted, show fallback
              if (data.name && looksLikeBase64(data.name)) {
                data.name = 'Unnamed Trip';
              } else if (!data.name) {
                data.name = 'Unnamed Trip';
              }
            }
            
            return { id: doc.id, ...data };
          })
        );

        setTripSyncTrips(tripSyncData);
        setTripItems(
          tripSyncData.map(trip => ({
            label: `${trip.name || 'Unnamed Trip'}${trip.startDate ? ` (${dayjs(trip.startDate?.toDate?.() || trip.startDate).format('MMM D, YYYY')})` : ''}`,
            value: trip.id,
          }))
        );
      } catch (err) {
        console.error('Error fetching TripSync trips:', err);
        Alert.alert('Error', 'Could not fetch trips from TripSync.');
      } finally {
        setLoading(false);
      }
    };

    fetchTripSyncTrips();
  }, []);

  const startTrip = async () => {
    if (!selectedTripSyncId) {
      Alert.alert('No Trip Selected', 'Please select a TripSync trip first.');
      return;
    }

    try {
      const selectedTripSync = tripSyncTrips.find(trip => trip.id === selectedTripSyncId);
      if (!selectedTripSync) {
        Alert.alert('Error', 'Selected trip not found.');
        return;
      }

      // Navigate directly to Trip Stops - no need to create TripSync trips anymore
      navigation.navigate('Trip Stops', {
        tripSyncTripId: selectedTripSyncId,
        tripTitle: selectedTripSync.name || 'Trip',
      });
    } catch (err) {
      console.error('Error starting trip:', err);
      Alert.alert('Error', 'Could not start trip. Please try again.');
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color={theme.accent} />
        <Text style={styles.loadingText}>Loading trips...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <Text style={styles.heading}>Select a TripSync Trip</Text>
        <Text style={styles.subtitle}>
          Choose a trip from TripSync to log your travel memories and experiences.
        </Text>

        {tripSyncTrips.length === 0 ? (
          <View style={styles.noTripsContainer}>
            <Text style={styles.noTripsIcon}>✈️</Text>
            <Text style={styles.noTripsHeading}>No Trips Available</Text>
            <Text style={styles.noTripsText}>
              You don't have any trips yet. Create a trip in TripSync web app to get started!
            </Text>
          </View>
        ) : (
          <>
            <DropDownPicker
              open={open}
              value={selectedTripSyncId}
              items={tripItems}
              setOpen={setOpen}
              setValue={setSelectedTripSyncId}
              setItems={setTripItems}
              placeholder="Choose a trip from TripSync..."
              style={styles.dropdown}
              dropDownContainerStyle={styles.dropdownContainer}
              zIndex={2000}
              zIndexInverse={1000}
              dropDownDirection="AUTO"
            />

            <TouchableOpacity 
              style={[styles.primaryButton, !selectedTripSyncId && styles.buttonDisabled]} 
              onPress={startTrip}
              disabled={!selectedTripSyncId}
            >
              <Text style={styles.buttonText}>View Trip Stops</Text>
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity 
          style={styles.logoutButton}
          onPress={() => signOut(auth)}
        >
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
