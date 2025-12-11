import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

// Plugin to inject Firebase config into service worker
function injectSwConfig() {
  return {
    name: 'inject-sw-config',
    buildStart() {
      // Read the service worker template
      const swPath = join(__dirname, 'public', 'firebase-messaging-sw.js')
      let swContent = readFileSync(swPath, 'utf-8')
      
      // Replace placeholders with environment variables
      const firebaseConfig = {
        apiKey: process.env.VITE_FIREBASE_API_KEY || '',
        authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || 'tripsync-da9d5.firebaseapp.com',
        projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'tripsync-da9d5',
        storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || 'tripsync-da9d5.firebasestorage.app',
        messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '139682846078',
        appId: process.env.VITE_FIREBASE_APP_ID || '1:139682846078:web:85e8b85b94c0444997cf2f',
        measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-33P4NC0LER',
      }
      
      // Replace placeholders in the service worker
      swContent = swContent.replace(/VITE_FIREBASE_API_KEY_PLACEHOLDER/g, firebaseConfig.apiKey)
      swContent = swContent.replace(/VITE_FIREBASE_AUTH_DOMAIN_PLACEHOLDER/g, firebaseConfig.authDomain)
      swContent = swContent.replace(/VITE_FIREBASE_PROJECT_ID_PLACEHOLDER/g, firebaseConfig.projectId)
      swContent = swContent.replace(/VITE_FIREBASE_STORAGE_BUCKET_PLACEHOLDER/g, firebaseConfig.storageBucket)
      swContent = swContent.replace(/VITE_FIREBASE_MESSAGING_SENDER_ID_PLACEHOLDER/g, firebaseConfig.messagingSenderId)
      swContent = swContent.replace(/VITE_FIREBASE_APP_ID_PLACEHOLDER/g, firebaseConfig.appId)
      swContent = swContent.replace(/VITE_FIREBASE_MEASUREMENT_ID_PLACEHOLDER/g, firebaseConfig.measurementId)
      
      // Write the processed service worker
      writeFileSync(swPath, swContent, 'utf-8')
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), injectSwConfig()],
})
