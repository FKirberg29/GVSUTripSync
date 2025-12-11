/**
 * Expo App Configuration
 * 
 * This file uses environment variables for sensitive data like API keys.
 */

export default {
  expo: {
    name: "TripSync",
    slug: "tripsync",
    version: "1.0.0",
    entryPoint: "./index.js",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    scheme: "tripsync",
    newArchEnabled: true,
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff"
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.fkirberg29.TravelDiaryApp",
      buildNumber: "1.0.0",
      googleServicesFile: "./GoogleService-Info.plist",
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        GMSApiKey: process.env.GOOGLE_MAPS_API_KEY || "",
      },
      config: {
        googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || "",
      }
    },
    android: {
      package: "com.fkirberg29.TravelDiaryApp",
      versionCode: 1,
      googleServicesFile: "./google-services.json",
      edgeToEdgeEnabled: true,
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#ffffff"
      },
      config: {
        googleMaps: {
          apiKey: process.env.GOOGLE_MAPS_API_KEY || "",
        }
      }
    },
    web: {
      favicon: "./assets/favicon.png",
      config: {
        firebase: {
          apiKey: process.env.FIREBASE_WEB_API_KEY || process.env.FIREBASE_API_KEY || "",
          authDomain: process.env.FIREBASE_AUTH_DOMAIN || "tripsync-da9d5.firebaseapp.com",
          projectId: process.env.FIREBASE_PROJECT_ID || "tripsync-da9d5",
          storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "tripsync-da9d5.firebasestorage.app",
          messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "139682846078",
          appId: process.env.FIREBASE_WEB_APP_ID || "1:139682846078:web:85e8b85b94c0444997cf2f",
          measurementId: process.env.FIREBASE_MEASUREMENT_ID || "G-33P4NC0LER"
        }
      }
    },
    extra: {
      eas: {
        projectId: "c6764117-3e52-484c-a73c-d58d7fa9506c"
      }
    },
    owner: "fkirberg29",
    runtimeVersion: "1.0.0",
    updates: {
      url: "https://u.expo.dev/c6764117-3e52-484c-a73c-d58d7fa9506c"
    },
    plugins: [
      "expo-audio",
      "expo-video",
      [
        "@react-native-google-signin/google-signin",
        {
          iosUrlScheme: "com.googleusercontent.apps.139682846078-vnp7m0pfcrjvh9qfjsseos5fatni9i0s"
        }
      ]
    ]
  }
};

