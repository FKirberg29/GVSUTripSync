/**
 * SettingsContext - Mobile App
 * 
 * Provides global app settings context including:
 * - Temperature unit preference (celsius/fahrenheit) stored in AsyncStorage
 * - Notification preferences stored in Firestore and synced across devices
 * 
 * Settings are loaded on mount and persisted when changed.
 */

import React, { createContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../FirebaseConfig';
import { auth } from '../FirebaseConfig';

export const SettingsContext = createContext();

export const SettingsProvider = ({ children }) => {
  const [temperatureUnit, setTemperatureUnit] = useState('celsius');
  
  const [notificationPrefs, setNotificationPrefs] = useState({
    chatMessages: true,
    mentions: true,
    friendRequests: true,
    tripInvites: true,
    comments: true,
  });

  // Load temperature unit preference from AsyncStorage on mount
  useEffect(() => {
    const loadUnit = async () => {
      const savedUnit = await AsyncStorage.getItem('temperatureUnit');
      if (savedUnit) setTemperatureUnit(savedUnit);
    };
    loadUnit();
  }, []);

  // Load notification preferences from Firestore on mount
  useEffect(() => {
    const loadNotificationPrefs = async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      try {
        const prefsRef = doc(db, 'users', uid);
        const prefsSnap = await getDoc(prefsRef);
        if (prefsSnap.exists()) {
          const data = prefsSnap.data();
          if (data.notificationPrefs) {
            setNotificationPrefs(data.notificationPrefs);
          }
        }
      } catch (error) {
        console.error('Error loading notification preferences:', error);
      }
    };

    loadNotificationPrefs();
  }, []);

  // Update temperature unit in state and persist to AsyncStorage
  const updateTemperatureUnit = (unit) => {
    setTemperatureUnit(unit);
    AsyncStorage.setItem('temperatureUnit', unit);
  };

  // Update notification preferences in state and persist to Firestore
  const updateNotificationPrefs = async (newPrefs) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    try {
      const prefsRef = doc(db, 'users', uid);
      await setDoc(prefsRef, { notificationPrefs: newPrefs }, { merge: true });
      setNotificationPrefs(newPrefs);
    } catch (error) {
      console.error('Error saving notification preferences:', error);
    }
  };

  return (
    <SettingsContext.Provider
      value={{ 
        temperatureUnit, 
        setTemperatureUnit: updateTemperatureUnit,
        notificationPrefs,
        updateNotificationPrefs,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};
