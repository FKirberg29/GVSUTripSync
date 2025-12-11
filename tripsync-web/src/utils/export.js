/**
 * Trip Export Utilities
 * 
 * Provides functionality to export trip data as JSON format. Handles
 * decryption of encrypted trip data (names, addresses, notes) before
 * export, ensuring exported data is readable. Includes all trip metadata,
 * itinerary items, comments, and travel diary entries.
 */

import { db, auth } from "../firebaseConfig";
import {
  collection,
  getDocs,
  query,
  orderBy,
  where,
  doc,
  getDoc,
} from "firebase/firestore";
import { decrypt } from "./encryption.js";
import { getTripEncryptionKey } from "./tripKeys.js";

/**
 * Exports a single trip as JSON with all decrypted data
 * Fetches trip, itinerary items, comments, and travel diary entries
 * @param {string} tripId - Trip ID to export
 * @returns {Promise<string>} JSON string representation of trip data
 */
export async function exportTripAsJSON(tripId) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("User not authenticated");

  try {
    // Get trip document
    const tripDoc = await getDoc(doc(db, "trips", tripId));
    if (!tripDoc.exists()) {
      throw new Error("Trip not found");
    }

    let tripData = tripDoc.data();
    const tripKey = await getTripEncryptionKey(tripId, uid);

    // Decrypt trip metadata if encrypted
    if (tripKey && tripData.encrypted) {
      if (tripData.encryptedName && tripData.name) {
        tripData.name = await decrypt(tripData.name, tripKey);
      }
      if (tripData.encryptedCategory && tripData.category) {
        tripData.category = await decrypt(tripData.category, tripKey);
      }
    }

    // Get itinerary items
    const itineraryRef = collection(db, "trips", tripId, "itinerary");
    const itineraryQuery = query(itineraryRef, orderBy("orderIndex", "asc"));
    const itinerarySnap = await getDocs(itineraryQuery);
    const itineraryItems = [];

    for (const itemDoc of itinerarySnap.docs) {
      let itemData = itemDoc.data();

      // Decrypt itinerary item data if encrypted
      if (tripKey) {
        // Always try to decrypt title if it exists and looks encrypted
        if (itemData.encryptedTitle && itemData.title) {
          try {
            itemData.title = await decrypt(itemData.title, tripKey);
          } catch (error) {
            console.warn('Failed to decrypt title:', error);
          }
        }
        // Always try to decrypt address if it exists and looks encrypted
        if (itemData.encryptedAddress && itemData.address) {
          try {
            itemData.address = await decrypt(itemData.address, tripKey);
          } catch (error) {
            console.warn('Failed to decrypt address:', error);
            // If decryption fails, set address to empty to avoid showing encrypted data
            itemData.address = '';
          }
        }
        // Always try to decrypt notes if it exists and looks encrypted
        if (itemData.encryptedNotes && itemData.notes) {
          try {
            itemData.notes = await decrypt(itemData.notes, tripKey);
          } catch (error) {
            console.warn('Failed to decrypt notes:', error);
          }
        }
      }

      // Get comments for this item
      const commentsRef = collection(
        db,
        "trips",
        tripId,
        "itinerary",
        itemDoc.id,
        "comments"
      );
      const commentsQuery = query(commentsRef, orderBy("createdAt", "asc"));
      const commentsSnap = await getDocs(commentsQuery);
      const comments = [];

      for (const commentDoc of commentsSnap.docs) {
        let commentData = commentDoc.data();
        if (tripKey && commentData.encrypted && commentData.text) {
          commentData.text = await decrypt(commentData.text, tripKey);
        }
        comments.push({
          id: commentDoc.id,
          ...commentData,
        });
      }

      // Get travel diary entries for this item
      const diaryEntriesRef = collection(
        db,
        "trips",
        tripId,
        "itinerary",
        itemDoc.id,
        "travelDiaryEntries"
      );
      const diarySnap = await getDocs(diaryEntriesRef);
      const diaryEntries = [];

      for (const entryDoc of diarySnap.docs) {
        let entryData = entryDoc.data();
        if (tripKey && entryData.encrypted && entryData.notes) {
          entryData.notes = await decrypt(entryData.notes, tripKey);
        }
        diaryEntries.push({
          id: entryDoc.id,
          ...entryData,
        });
      }

      itineraryItems.push({
        id: itemDoc.id,
        ...itemData,
        comments,
        diaryEntries,
      });
    }

    // Get chat messages
    const chatRef = collection(db, "trips", tripId, "chat");
    const chatQuery = query(chatRef, orderBy("createdAt", "asc"));
    const chatSnap = await getDocs(chatQuery);
    const chatMessages = [];

    for (const msgDoc of chatSnap.docs) {
      let msgData = msgDoc.data();
      if (tripKey && msgData.encrypted && msgData.text) {
        msgData.text = await decrypt(msgData.text, tripKey);
      }
      chatMessages.push({
        id: msgDoc.id,
        ...msgData,
      });
    }

    // Get activities
    const activitiesRef = collection(db, "trips", tripId, "activities");
    const activitiesQuery = query(activitiesRef, orderBy("createdAt", "asc"));
    const activitiesSnap = await getDocs(activitiesQuery);
    const activities = activitiesSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Convert Firestore timestamps to ISO strings
    const convertTimestamps = (obj) => {
      if (!obj || typeof obj !== "object") return obj;
      if (obj.toDate && typeof obj.toDate === "function") {
        return obj.toDate().toISOString();
      }
      if (obj.seconds && typeof obj.seconds === "number") {
        return new Date(obj.seconds * 1000).toISOString();
      }
      if (Array.isArray(obj)) {
        return obj.map(convertTimestamps);
      }
      const converted = {};
      for (const key in obj) {
        converted[key] = convertTimestamps(obj[key]);
      }
      return converted;
    };

    // Compile export data
    const exportData = {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      trip: convertTimestamps({
        id: tripId,
        ...tripData,
        itinerary: itineraryItems,
        chat: chatMessages,
        activities,
      }),
    };

    return exportData;
  } catch (error) {
    console.error("Error exporting trip:", error);
    throw error;
  }
}

/**
 * Export all user data as JSON (GDPR compliance)
 */
export async function exportAllUserData() {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("User not authenticated");

  try {
    // Get user profile
    const userDoc = await getDoc(doc(db, "users", uid));
    const userProfile = userDoc.exists() ? userDoc.data() : null;

    // Get all trips where user is a member (use proper query to avoid permission errors)
    const tripsRef = collection(db, "trips");
    const tripsQuery = query(tripsRef, where(`members.${uid}`, "==", true));
    const tripsSnap = await getDocs(tripsQuery);
    const allTrips = [];

    for (const tripDoc of tripsSnap.docs) {
      try {
        const tripExport = await exportTripAsJSON(tripDoc.id);
        allTrips.push(tripExport.trip);
      } catch (error) {
        console.error(`Error exporting trip ${tripDoc.id}:`, error);
        // Continue with other trips
      }
    }

    // Get friend requests (query both incoming and outgoing separately to avoid permission errors)
    const friendRequestsRef = collection(db, "friendRequests");
    
    // Query incoming requests
    const incomingQuery = query(friendRequestsRef, where("toUid", "==", uid));
    const incomingSnap = await getDocs(incomingQuery);
    const incomingRequests = incomingSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    
    // Query outgoing requests
    const outgoingQuery = query(friendRequestsRef, where("fromUid", "==", uid));
    const outgoingSnap = await getDocs(outgoingQuery);
    const outgoingRequests = outgoingSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    
    // Combine both
    const friendRequests = [...incomingRequests, ...outgoingRequests];

    // Get friends
    const friendsRef = collection(db, "users", uid, "friends");
    const friendsSnap = await getDocs(friendsRef);
    const friends = friendsSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Convert timestamps helper
    const convertTimestamps = (obj) => {
      if (!obj || typeof obj !== "object") return obj;
      if (obj.toDate && typeof obj.toDate === "function") {
        return obj.toDate().toISOString();
      }
      if (obj.seconds && typeof obj.seconds === "number") {
        return new Date(obj.seconds * 1000).toISOString();
      }
      if (Array.isArray(obj)) {
        return obj.map(convertTimestamps);
      }
      const converted = {};
      for (const key in obj) {
        converted[key] = convertTimestamps(obj[key]);
      }
      return converted;
    };

    // Compile all user data
    const exportData = {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      user: convertTimestamps({
        uid,
        profile: userProfile,
        trips: allTrips,
        friendRequests,
        friends: friends.map((f) => f.id),
      }),
    };

    return exportData;
  } catch (error) {
    console.error("Error exporting user data:", error);
    throw error;
  }
}

/**
 * Download JSON data as file
 */
export function downloadJSON(data, filename) {
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

