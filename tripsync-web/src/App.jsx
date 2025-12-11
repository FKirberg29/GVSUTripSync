/**
 * TripSync Web App - Main Application Component
 * 
 * Root component that sets up routing, authentication, analytics, and notification
 * initialization. Provides protected route wrapper and manages global app state
 * including user authentication context and screen view tracking.
 */

import React, { useEffect, useState } from "react";
import { Routes, Route, Navigate, Link, useNavigate, useLocation } from "react-router-dom";
import { auth, signInWithGoogle, signOutUser, functions } from "./firebaseConfig";
import { onAuthStateChanged } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { initAnalytics, setUserContext, trackScreenView } from "./utils/errorTracking.js";

import { SettingsProvider } from "./contexts/SettingsContext";
import Trips from "./screens/Trips.jsx";
import TripDetail from "./screens/TripDetail.jsx";
import Login from "./screens/Login.jsx";
import EmailAuth from "./screens/EmailAuth";
import AcceptInvite from "./screens/AcceptInvite.jsx";
import Friends from "./screens/Friends.jsx";
import Settings from "./screens/Settings.jsx";
import Theme from "./screens/Theme.jsx";
import OfflineIndicator from "./components/OfflineIndicator.jsx";
import { initMediaCache } from "./utils/mediaCache.js";

import "./screens/theme.css";

/**
 * Protected route wrapper component
 * 
 * Wraps routes that require authentication, redirecting unauthenticated users
 * to the login page. Shows loading state while checking authentication status.
 * 
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components to render when authenticated
 * @returns {JSX.Element} Protected route wrapper or redirect to login
 */
function Protected({ children }) {
  const [user, setUser] = useState(undefined);
  const navigate = useNavigate();

  // Effect hook to monitor authentication state for protected routes
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => setUser(u ?? null));
  }, []);

  if (user === undefined) return <div>Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

/**
 * Main application component
 * 
 * Sets up routing, authentication monitoring, analytics initialization, and
 * push notification setup. Manages global user state and handles initialization
 * of analytics, media cache, and notification services.
 * 
 * @returns {JSX.Element} Main application with routing and global providers
 */
export default function App() {
  const [user, setUser] = useState(null);
  const location = useLocation();

  // Effect hook to initialize analytics and media cache on app startup
  useEffect(() => {
    initAnalytics();
    initMediaCache();
  }, []);

  // Effect hook to track screen views for analytics
  // Records page navigation for analytics tracking
  useEffect(() => {
    const screenName = location.pathname.replace('/', '') || 'home';
    trackScreenView(screenName);
  }, [location.pathname]);

  // Effect hook to monitor authentication state and initialize user services
  // Handles user profile creation, token refresh, and notification setup
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setUserContext(u);
      
      if (u) {
        // Refreshes ID token to ensure it's current
        try {
          await u.getIdToken(true);
        } catch (e) {
          console.warn("Could not refresh ID token:", e);
        }
        
        // Ensures user profile exists in Firestore
        try {
          await httpsCallable(functions, "ensureUserProfile")();
        } catch (err) {
          console.error("ensureUserProfile failed:", err);
        }
        
        // Sets up push notifications and service worker
        try {
          const { requestNotificationPermission, saveFCMToken, registerServiceWorker, initializeNotifications } = await import("./utils/notifications.js");
          
          // Registers service worker for background notifications
          await registerServiceWorker();
          
          // Requests notification permission and saves FCM token
          const token = await requestNotificationPermission();
          if (token) {
            await saveFCMToken(u.uid, token);
          }
          
          // Initializes notification handler for foreground messages
          initializeNotifications((payload) => {
            console.log("Notification received:", payload);
          });
        } catch (err) {
          console.error("Failed to initialize notifications:", err);
        }
      }
    });
    return () => unsub();
  }, []);

  return (
    <SettingsProvider>
      <div>
        <OfflineIndicator />
        <header className="app-header">
        <div className="left">
          <Link
            to="/trips"
            className={location.pathname.startsWith("/trips") ? "active" : ""}
          >
            Trips
          </Link>
          <Link
            to="/friends"
            className={location.pathname.startsWith("/friends") ? "active" : ""}
            style={{ marginLeft: 12 }}
          >
            Friends
          </Link>
          <Link
            to="/settings"
            className={location.pathname.startsWith("/settings") ? "active" : ""}
            style={{ marginLeft: 12 }}
          >
            Settings
          </Link>
        </div>

        <div className="center">
          <Link to="/trips" className="logo-link">
            <img src="/logo.svg" alt="TripSync" className="app-logo" />
            <span className="app-title">TripSync</span>
          </Link>
        </div>

        <div className="right">
          {user ? (
            <>
              <span>{user.displayName || user.email}</span>
              <button onClick={signOutUser}>Sign out</button>
            </>
          ) : (
            <button onClick={signInWithGoogle}>Sign in with Google</button>
          )}
        </div>
      </header>

      <main className="app-body">
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            path="/trips"
            element={
              <Protected>
                <Trips />
              </Protected>
            }
          />
          <Route
            path="/trips/:tripId"
            element={
              <Protected>
                <TripDetail />
              </Protected>
            }
          />

          <Route
            path="/friends"
            element={
              <Protected>
                <Friends />
              </Protected>
            }
          />

          <Route path="/accept" element={<AcceptInvite />} />

          <Route path="/email-auth" element={<EmailAuth />} />

          <Route
            path="/settings"
            element={
              <Protected>
                <Settings />
              </Protected>
            }
          />
          <Route
            path="/settings/theme"
            element={
              <Protected>
                <Theme />
              </Protected>
            }
          />

          <Route path="*" element={<Navigate to="/trips" replace />} />
        </Routes>
      </main>
      </div>
    </SettingsProvider>
  );
}
