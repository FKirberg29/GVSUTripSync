/**
 * TripSync Mobile App - Entry Point
 * 
 * This is the application entry point that registers the root component with Expo.
 * Expo's registerRootComponent handles the app registration for both Expo Go and native builds.
 */

import { registerRootComponent } from 'expo';

import App from './App';

registerRootComponent(App);
