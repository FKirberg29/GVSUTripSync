// Service worker for Firebase Cloud Messaging
importScripts("https://www.gstatic.com/firebasejs/11.9.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.9.1/firebase-messaging-compat.js");

// Initialize Firebase
// Configuration is injected at build time via Vite plugin from environment variables
// Set VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, etc. in .env file
// This placeholder will be replaced during build
firebase.initializeApp({
  apiKey: "VITE_FIREBASE_API_KEY_PLACEHOLDER",
  authDomain: "VITE_FIREBASE_AUTH_DOMAIN_PLACEHOLDER",
  projectId: "VITE_FIREBASE_PROJECT_ID_PLACEHOLDER",
  storageBucket: "VITE_FIREBASE_STORAGE_BUCKET_PLACEHOLDER",
  messagingSenderId: "VITE_FIREBASE_MESSAGING_SENDER_ID_PLACEHOLDER",
  appId: "VITE_FIREBASE_APP_ID_PLACEHOLDER",
  measurementId: "VITE_FIREBASE_MEASUREMENT_ID_PLACEHOLDER",
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log("Background message received:", payload);

  const notificationTitle = payload.notification?.title || "TripSync";
  const notificationOptions = {
    body: payload.notification?.body || "",
    icon: "/icon-192x192.png", // You may need to add this icon
    badge: "/icon-192x192.png",
    tag: payload.data?.tripId || "default",
    data: payload.data,
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification clicks
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification.data;
  let url = "/";

  if (data?.tripId) {
    url = `/trips/${data.tripId}`;
  } else if (data?.type === "friend_request") {
    url = "/friends";
  }

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Try to focus an existing window
      for (const client of clientList) {
        if (client.url === url && "focus" in client) {
          return client.focus();
        }
      }
      // Otherwise, open a new window
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

