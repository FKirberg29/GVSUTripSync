/**
 * TripSync Mobile App - Main Application Component
 * 
 * This is the root component of the mobile app that handles:
 * - User authentication state management
 * - Navigation setup and routing
 * - Push notification initialization
 * - Analytics tracking
 * - Screen view tracking for navigation changes
 */

import React, { useEffect, useState, useRef } from 'react';
import { Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Analytics from 'expo-firebase-analytics';

import HomeScreen from './screens/HomeScreen';
import TripStopsScreen from './screens/TripStopsScreen';
import StopDetailScreen from './screens/StopDetailScreen';
import MediaViewerScreen from './screens/MediaViewerScreen';
import SettingsScreen from './screens/SettingsScreen';
import LoginScreen from './screens/LoginScreen';
import OfflineIndicator from './components/OfflineIndicator';

import { SettingsProvider } from './contexts/SettingsContext';
import { auth } from './FirebaseConfig';
import { onAuthStateChanged } from 'firebase/auth';
import { setUserContext, trackScreenView } from './utils/errorTracking';

const Stack = createNativeStackNavigator();

export default function App() {
  const [user, setUser] = useState(null);
  const [authInitialized, setAuthInitialized] = useState(false);
  const navigationRef = useRef();
  const routeNameRef = useRef();

  // Setting up authentication listener to handle user login/logout and initialize notifications
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      setAuthInitialized(true);
      
      setUserContext(user);
      
      if (user) {
        try {
          const { requestNotificationPermission, savePushToken, setupNotificationListeners } = await import('./utils/notifications');
          
          const token = await requestNotificationPermission();
          if (token) {
            await savePushToken(user.uid, token);
          }
          
          setupNotificationListeners(
            (notification) => {
              console.log('Notification received:', notification);
            },
            (response) => {
              console.log('Notification tapped:', response);
              const data = response.notification.request.content.data;
              if (data?.tripId && navigationRef.current) {
                navigationRef.current.navigate('Trip Stops', { tripId: data.tripId });
              }
            }
          );
        } catch (err) {
          console.error('Failed to initialize notifications:', err);
        }
      }
    });
    return unsubscribe;
  }, []);

  // Log app open event to analytics after a short delay to ensure native modules are ready
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        Analytics.logEvent('app_open', {
          screen: 'Home',
          purpose: 'initial_launch',
        }).catch((err) => {
          console.warn('Analytics not ready:', err);
        });
      } catch (err) {
        console.warn('Analytics initialization failed:', err);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  // Debug analytics event to verify analytics is working
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        Analytics.logEvent('debug_event_test', {
          debug: true
        }).then(() => console.log('Analytics event logged')).catch((err) => {
          console.warn('Debug analytics event failed:', err);
        });
      } catch (err) {
        console.warn('Debug analytics initialization failed:', err);
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  if (!authInitialized) {
    return <Text>Loading...</Text>;
  }

  return (
    <SettingsProvider>
      <OfflineIndicator />
      <NavigationContainer
        ref={navigationRef}
        onReady={() => {
          routeNameRef.current = navigationRef.current.getCurrentRoute().name;
        }}
        onStateChange={async () => {
          const previousRouteName = routeNameRef.current;
          const currentRouteName = navigationRef.current.getCurrentRoute().name;

          if (previousRouteName !== currentRouteName) {
            await trackScreenView(currentRouteName);
          }

          routeNameRef.current = currentRouteName;
        }}
      >
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: '#264653' },
            headerTintColor: '#fff',
            headerTitleAlign: 'center',
          }}
        >
          {user ? (
            <>
              <Stack.Screen name="Home" component={HomeScreen} />
              <Stack.Screen name="Trip Stops" component={TripStopsScreen} />
              <Stack.Screen name="Stop Detail" component={StopDetailScreen} />
              <Stack.Screen name="Media Viewer" component={MediaViewerScreen} />
              <Stack.Screen name="Settings" component={SettingsScreen} />
            </>
          ) : (
            <>
              <Stack.Screen name="Login" component={LoginScreen} />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </SettingsProvider>
  );
}