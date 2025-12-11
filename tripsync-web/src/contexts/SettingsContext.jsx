/**
 * SettingsContext - Web App
 * 
 * Provides global app settings context including:
 * - Temperature unit preference (METRIC/IMPERIAL) stored in localStorage
 * - Theme preference (light/dark) stored in localStorage and applied to document
 * - Notification preferences stored in Firestore and synced across devices
 * 
 * Settings are loaded on mount and persisted when changed.
 */

import { createContext, useContext, useState, useEffect } from "react";
import { db, auth } from "../firebaseConfig";
import { doc, getDoc, setDoc } from "firebase/firestore";

const SettingsContext = createContext();

/**
 * SettingsProvider Component
 * 
 * Provides global settings context to all child components.
 * Manages temperature unit, theme, and notification preferences with persistence.
 * 
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components to wrap with settings context
 */
export function SettingsProvider({ children }) {
  // Initializes temperature unit state from localStorage
  // Defaults to IMPERIAL if no saved preference exists
  const [temperatureUnit, setTemperatureUnit] = useState(() => {
    const saved = localStorage.getItem("temperatureUnit");
    return saved === "METRIC" ? "METRIC" : "IMPERIAL";
  });

  // Initializes theme state from localStorage
  // Defaults to "light" if no saved preference exists
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem("theme");
    return saved || "light";
  });

  // Initializes notification preferences with default values
  // These will be overridden by Firestore values if they exist
  const [notificationPrefs, setNotificationPrefs] = useState({
    chatMessages: true,
    mentions: true,
    friendRequests: true,
    tripInvites: true,
    comments: true,
  });

  // Effect hook to load notification preferences from Firestore on mount
  // Syncs preferences across devices by loading from user's Firestore document
  useEffect(() => {
    const loadNotificationPrefs = async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      try {
        const prefsRef = doc(db, "users", uid);
        const prefsSnap = await getDoc(prefsRef);
        if (prefsSnap.exists()) {
          const data = prefsSnap.data();
          if (data.notificationPrefs) {
            setNotificationPrefs(data.notificationPrefs);
          }
        }
      } catch (error) {
        console.error("Error loading notification preferences:", error);
      }
    };

    loadNotificationPrefs();
  }, []);

  /**
   * Updates notification preferences in Firestore and local state
   * Persists changes to Firestore for cross-device synchronization
   * @param {Object} newPrefs - New notification preferences object
   */
  const updateNotificationPrefs = async (newPrefs) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    try {
      const prefsRef = doc(db, "users", uid);
      // Uses merge: true to preserve other user document fields
      await setDoc(prefsRef, { notificationPrefs: newPrefs }, { merge: true });
      setNotificationPrefs(newPrefs);
    } catch (error) {
      console.error("Error saving notification preferences:", error);
    }
  };

  // Effect hook to persist temperature unit to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("temperatureUnit", temperatureUnit);
  }, [temperatureUnit]);

  // Effect hook to persist theme to localStorage and apply to document
  // Updates document's data-theme attribute for CSS theme switching
  useEffect(() => {
    localStorage.setItem("theme", theme);
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Effect hook to apply theme to document on initial mount
  // Ensures theme is applied even if localStorage value was loaded synchronously
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, []);

  return (
    <SettingsContext.Provider
      value={{
        temperatureUnit,
        setTemperatureUnit,
        theme,
        setTheme,
        notificationPrefs,
        updateNotificationPrefs,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

/**
 * Custom hook to access settings context
 * 
 * Provides access to temperature unit, theme, and notification preferences.
 * Throws an error if used outside of SettingsProvider.
 * 
 * @returns {Object} Settings context with temperatureUnit, setTemperatureUnit, theme, setTheme, notificationPrefs, updateNotificationPrefs
 * @throws {Error} If used outside of SettingsProvider
 */
export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used within SettingsProvider");
  }
  return context;
}
