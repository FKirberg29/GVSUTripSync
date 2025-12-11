/**
 * LoginScreen Component
 * 
 * Handles user authentication with email/password and Google Sign-In.
 * Supports both authentication methods and provides error handling for various
 * authentication scenarios.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Keyboard,
  TouchableWithoutFeedback,
  ActivityIndicator
} from 'react-native';
import {
  signInWithEmailAndPassword,
  signInWithCredential,
  GoogleAuthProvider
} from 'firebase/auth';
import { auth } from '../FirebaseConfig';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { styles } from '../styles/LoginScreen.styles';

// Google Sign-In configuration with OAuth client IDs from Firebase Console
GoogleSignin.configure({
  webClientId: '139682846078-ka7du16v9111hrg7nlcfpcesuko4cbpt.apps.googleusercontent.com',
  iosClientId: '139682846078-vnp7m0pfcrjvh9qfjsseos5fatni9i0s.apps.googleusercontent.com',
  offlineAccess: true,
  forceCodeForRefreshToken: true,
});

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      
      // Check if device supports Google Play services
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      
      // Sign out any previously signed-in Google account to force account picker
      // This ensures users can select a different account each time
      try {
        await GoogleSignin.signOut();
      } catch (signOutError) {
        // Ignore sign-out errors (user might not be signed in)
        console.log('Sign-out (for account picker):', signOutError.message);
      }
      
      // Sign in with Google (this will show the account picker)
      const signInResult = await GoogleSignin.signIn();
      console.log('Google Sign-In Result:', signInResult);
      
      // Get the user's ID token after sign in
      // signIn() returns user data, but getTokens() is needed for the ID token
      const tokens = await GoogleSignin.getTokens();
      console.log('Google Sign-In Tokens:', tokens);
      
      const idToken = tokens?.idToken;
      if (!idToken || typeof idToken !== 'string') {
        console.error('Invalid ID token:', idToken);
        throw new Error('Failed to get valid ID token from Google Sign-In');
      }
      
      console.log('ID Token received, length:', idToken.length);
      console.log('ID Token preview:', idToken.substring(0, 50) + '...');
      
      // Create a Google credential with the token
      // GoogleAuthProvider.credential expects the ID token as a string
      const googleCredential = GoogleAuthProvider.credential(idToken, null);
      console.log('Google Credential created successfully');
      
      // Sign-in the user with the credential
      await signInWithCredential(auth, googleCredential);
    } catch (error) {
      console.error('Google Sign-In Error:', error);
      
      let message = 'Google Sign-In failed. Please try again.';
      
      // Check if user cancelled
      if (error.code === '10' || error.code === 'SIGN_IN_CANCELLED') {
        message = 'Sign-in was cancelled.';
      } else if (error.code === '12500') {
        message = 'Sign-in was cancelled.';
      } else if (error.code === 'auth/account-exists-with-different-credential') {
        message = 'An account already exists with a different sign-in method.';
      } else if (error.code === 'auth/invalid-credential') {
        message = 'Invalid credential. Please try again.';
      } else if (error.code === 'auth/argument-error') {
        message = 'Authentication configuration error.';
      } else {
        message = error.message || 'Google Sign-In failed. Please try again.';
      }
      
      Alert.alert('Google Sign-In Error', message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = () => {
    if (!email || !password) {
      Alert.alert('Missing Fields', 'Please enter both email and password.');
      return;
    }

    setLoading(true);
    signInWithEmailAndPassword(auth, email, password)
      .catch((error) => {
        console.error(error);

        let message = 'Login failed. Please try again.';
        switch (error.code) {
          case 'auth/user-not-found':
            message = 'No user found with this email.';
            break;
          case 'auth/wrong-password':
            message = 'Incorrect password.';
            break;
          case 'auth/invalid-email':
            message = 'Invalid email address.';
            break;
          default:
            message = error.message;
        }

        Alert.alert('Login Error', message);
      })
      .finally(() => setLoading(false));
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={styles.container}>
        <Text style={styles.title}>TripSync Stops</Text>

        {loading && (
          <ActivityIndicator size="large" color="#2A9D8F" style={{ marginBottom: 20 }} />
        )}

        <TextInput
          placeholder="Email"
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput
          placeholder="Password"
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
          <Text style={styles.buttonText}>Log In</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, { marginTop: 15, backgroundColor: '#4285F4' }]}
          onPress={handleGoogleSignIn}
          disabled={loading}
        >
          <Text style={styles.buttonText}>Sign in with Google</Text>
        </TouchableOpacity>

        <Text style={styles.infoText}>
          This app works with TripSync web app.{'\n'}
          Create your account on the TripSync web app.
        </Text>
      </View>
    </TouchableWithoutFeedback>
  );
}

