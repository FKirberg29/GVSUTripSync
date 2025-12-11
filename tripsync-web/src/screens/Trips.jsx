/**
 * Trips Screen Component
 * 
 * Main screen for viewing and managing trips. Displays a list of all trips the user
 * is a member of, with filtering by category. Supports creating new trips with
 * encryption enabled by default, and deleting trips with complete data cleanup.
 * 
 * Features:
 * - Real-time trip list updates via Firestore listeners
 * - Trip metadata encryption/decryption
 * - Optimistic updates for new trip creation
 * - Category-based filtering
 * - Complete trip deletion with subcollection cleanup
 */

import React, { useEffect, useRef, useState } from "react";
import { db, auth } from "../firebaseConfig";
import {
  addDoc,
  collection,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  deleteDoc,
  doc,
  getDocs,
  updateDoc,
  setDoc,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { Link } from "react-router-dom";
import { enableTripEncryption, getTripEncryptionKey } from "../utils/tripKeys.js";
import { encrypt, decrypt, generateKey, getUserMasterKey, encryptKey, storeTripKey } from "../utils/encryption.js";
import { validateTripName, MAX_LENGTHS } from "../utils/validation.js";
import { trackUserAction, trackError, trackFeatureUsage } from "../utils/errorTracking.js";
import Calendar from "../components/Calendar.jsx";
import "./Trips.css";

/**
 * Available trip categories for filtering and categorization
 */
const TRIP_CATEGORIES = [
  { value: "", label: "All Categories" },
  { value: "business", label: "Business" },
  { value: "vacation", label: "Vacation" },
  { value: "solo", label: "Solo" },
  { value: "other", label: "Other" },
];

/**
 * Trips list and management screen component
 * 
 * @returns {JSX.Element} Trips page with trip creation form and filterable trip list
 */
export default function Trips() {
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [category, setCategory] = useState("business");
  const [trips, setTrips] = useState([]);
  const [filteredTrips, setFilteredTrips] = useState([]);
  const [filterCategory, setFilterCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);

  // Keep a ref to unsubscribe the trips listener when auth changes
  const tripsUnsubRef = useRef(null);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setAuthReady(true);
      setLoading(true);

      // Tear down previous trips listener (if any)
      if (tripsUnsubRef.current) {
        tripsUnsubRef.current();
        tripsUnsubRef.current = null;
      }

      if (!user) {
        setTrips([]);
        setLoading(false);
        return;
      }

      // Query trips where this uid is a member
      const qTrips = query(
        collection(db, "trips"),
        where(`members.${user.uid}`, "==", true)
      );

      // Attach snapshot listener
      tripsUnsubRef.current = onSnapshot(
        qTrips,
        async (snap) => {
          // Decrypt trip metadata
          const tripsData = await Promise.all(
            snap.docs.map(async (d) => {
              const data = d.data();
              
              // Try to get encryption key and decrypt
              try {
                const tripKey = await getTripEncryptionKey(d.id, user.uid);
                if (tripKey && data.encrypted) {
                  // tripKey is a base64 string, decrypt function accepts base64 string
                  if (data.encryptedName && data.name) {
                    data.name = decrypt(data.name, tripKey);
                  }
                  if (data.encryptedCategory && data.category) {
                    data.category = decrypt(data.category, tripKey);
                  }
                }
              } catch (error) {
                console.error('Error decrypting trip metadata:', error);
              }
              
              return { id: d.id, ...data };
            })
          );
          
          // Merge with optimistic updates - keep optimistic trips that haven't been confirmed yet
          setTrips(prev => {
            const optimisticTrips = prev.filter(t => t._optimistic && !tripsData.find(d => d.id === t.id));
            return [...tripsData, ...optimisticTrips];
          });
          setLoading(false);
        },
        (err) => {
          console.error("Trips onSnapshot error:", err);
          setTrips([]);
          setLoading(false);
        }
      );
    });

    return () => {
      unsubAuth();
      if (tripsUnsubRef.current) {
        tripsUnsubRef.current();
        tripsUnsubRef.current = null;
      }
    };
  }, []);

  // Filter trips by category (client-side, after decryption)
  useEffect(() => {
    if (!filterCategory) {
      setFilteredTrips(trips);
    } else {
      // Filter client-side after decryption
      setFilteredTrips(trips.filter((t) => t.category === filterCategory));
    }
  }, [trips, filterCategory]);

  async function createTrip(e) {
    e.preventDefault();
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    // Validate trip name
    const nameValidation = validateTripName(name);
    if (!nameValidation.valid) {
      alert(nameValidation.error);
      return;
    }

    try {
      // Generate encryption key first (before creating trip)
      const tripKey = generateKey();
      
      // Encrypt metadata before creating trip
      let encryptedName = nameValidation.sanitized;
      let encryptedCategory = category || null;
      let isEncrypted = false;
      
      if (tripKey) {
        // encrypt function accepts base64 string key
        encryptedName = encrypt(name, tripKey);
        if (encryptedCategory) {
          encryptedCategory = encrypt(encryptedCategory, tripKey);
        }
        isEncrypted = true;
      }
      
      // Prepare encryption key storage
      const masterKey = await getUserMasterKey(uid);
      const encryptedTripKey = encryptKey(tripKey, masterKey);
      
      // Generate a temporary trip ID for key storage and optimistic update
      // Use a doc ref to get an ID before creating the document
      const tempTripRef = doc(collection(db, "trips"));
      const tempTripId = tempTripRef.id;
      
      // Store the encryption key locally FIRST (before creating trip)
      // This ensures decryption works immediately when snapshot fires
      await storeTripKey(tempTripId, uid, tripKey);
      
      // Optimistically add trip to local state with plaintext name
      // This prevents the flash of encrypted text
      const optimisticTrip = {
        id: tempTripId,
        name: name, // Plaintext name for immediate display
        category: category || null,
        startDate: start ? new Date(start) : null,
        endDate: end ? new Date(end) : null,
        createdAt: new Date(),
        createdBy: uid,
        members: { [uid]: true },
        roles: { [uid]: "owner" },
        encrypted: isEncrypted,
        encryptedName: isEncrypted,
        encryptedCategory: isEncrypted && encryptedCategory ? true : null,
        _optimistic: true, // Flag to identify optimistic updates
      };
      setTrips(prev => [...prev, optimisticTrip]);
      
      // Create the trip document with encrypted data from the start
      await setDoc(tempTripRef, {
        name: encryptedName,
        encryptedName: isEncrypted,
        startDate: start ? new Date(start) : null,
        endDate: end ? new Date(end) : null,
        category: encryptedCategory,
        encryptedCategory: isEncrypted && encryptedCategory ? true : null,
        encrypted: isEncrypted,
        createdAt: serverTimestamp(),
        createdBy: uid,
        members: { [uid]: true },
        roles: { [uid]: "owner" },
      });

      // Store the encryption key for this trip in Firestore
      try {
        // Store the key in Firestore (async, but doesn't block decryption since its stored locally above)
        Promise.all([
          setDoc(doc(db, 'trips', tempTripId, 'encryptionKeys', uid), {
            encryptedKey: encryptedTripKey,
            createdAt: serverTimestamp(),
          }),
          setDoc(doc(db, 'trips', tempTripId, 'encryptionKeys', 'metadata'), {
            enabled: true,
            enabledBy: uid,
            enabledAt: serverTimestamp(),
          })
        ]).catch(err => console.warn('Failed to store encryption key in Firestore:', err));
        
        console.log("Encryption enabled for new trip");
      } catch (encryptErr) {
        // Don't fail trip creation if encryption setup fails
        console.warn("Failed to store encryption key for new trip:", encryptErr);
      }

      setName("");
      setStart("");
      setEnd("");
      setCategory("business");
      
      // Track successful trip creation
      trackUserAction('trip_created', {
        trip_id: tempTripId,
        category: category || 'none',
        has_start_date: !!start,
        has_end_date: !!end,
      });
      trackFeatureUsage('create_trip', { category });
    } catch (err) {
      console.error("Create trip failed:", err);
      trackError(err, { action: 'create_trip' });
      alert("Could not create trip. Check console for details.");
    }
  }

  async function deleteTrip(tripId) {
    if (!window.confirm("Delete this trip and all its data (itinerary, chat, activities, comments, etc.)?")) return;

    try {
      // Delete all itinerary items and their nested collections
      const itineraryRef = collection(db, "trips", tripId, "itinerary");
      const itinerarySnap = await getDocs(itineraryRef);
      
      // For each itinerary item, delete nested collections (comments, travelDiaryEntries)
      await Promise.all(
        itinerarySnap.docs.map(async (itemDoc) => {
          const itemId = itemDoc.id;
          
          // Delete comments subcollection
          const commentsRef = collection(db, "trips", tripId, "itinerary", itemId, "comments");
          const commentsSnap = await getDocs(commentsRef);
          await Promise.all(
            commentsSnap.docs.map((d) =>
              deleteDoc(doc(db, "trips", tripId, "itinerary", itemId, "comments", d.id))
            )
          );
          
          // Delete travelDiaryEntries subcollection
          const entriesRef = collection(db, "trips", tripId, "itinerary", itemId, "travelDiaryEntries");
          const entriesSnap = await getDocs(entriesRef);
          await Promise.all(
            entriesSnap.docs.map((d) =>
              deleteDoc(doc(db, "trips", tripId, "itinerary", itemId, "travelDiaryEntries", d.id))
            )
          );
          
          // Delete the itinerary item itself
          await deleteDoc(doc(db, "trips", tripId, "itinerary", itemId));
        })
      );
      
      // Delete chat subcollection
      const chatRef = collection(db, "trips", tripId, "chat");
      const chatSnap = await getDocs(chatRef);
      await Promise.all(
        chatSnap.docs.map((d) =>
          deleteDoc(doc(db, "trips", tripId, "chat", d.id))
        )
      );

      // encryptionKeys subcollection will be automatically cleaned up
      // by the Cloud Function onTripDeleted when the trip document is deleted.

      // Finally, delete the trip document itself
      // This will trigger the Cloud Function to clean up encryptionKeys
      await deleteDoc(doc(db, "trips", tripId));
      
      // Track trip deletion
      trackUserAction('trip_deleted', { trip_id: tripId });
    } catch (err) {
      console.error("Delete trip failed:", err);
      trackError(err, { action: 'delete_trip', trip_id: tripId });
      alert("Could not delete trip. Check console for details.");
    }
  }

  return (
    <div className="trips-page">
      <form onSubmit={createTrip} className="card trip-form">
        <h2>Create a Trip</h2>
        <input
          placeholder="Trip name"
          value={name}
          onChange={(e) => {
            const value = e.target.value;
            if (value.length <= MAX_LENGTHS.TRIP_NAME) {
              setName(value);
            } else {
              alert(`Trip name cannot exceed ${MAX_LENGTHS.TRIP_NAME} characters`);
            }
          }}
          maxLength={MAX_LENGTHS.TRIP_NAME}
          required
        />
        <div className="date-calendars-container">
          <Calendar
            label="Start Date"
            value={start}
            onChange={setStart}
            maxDate={end ? new Date(end) : null}
          />
          <Calendar
            label="End Date"
            value={end}
            onChange={setEnd}
            minDate={start ? new Date(start) : null}
          />
        </div>
        <label>
          Category:
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={{ width: "100%", padding: "8px", marginTop: "4px", borderRadius: "4px", border: "1px solid #ddd" }}
          >
            {TRIP_CATEGORIES.filter((c) => c.value !== "").map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="primary" disabled={!authReady}>
          Create
        </button>
      </form>

      <div className="card trip-list">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h3>Your Trips</h3>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid #ddd" }}
          >
            {TRIP_CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="empty-hint">Loading…</div>
        ) : filteredTrips.length === 0 ? (
          <div className="empty-hint">
            {trips.length === 0
              ? "No trips yet. Create one above."
              : `No trips found in "${TRIP_CATEGORIES.find((c) => c.value === filterCategory)?.label || "this category"}" category.`}
          </div>
        ) : (
          <ul>
            {filteredTrips.map((t) => (
              <li key={t.id}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1 }}>
                  <Link to={`/trips/${t.id}`}>{t.name || "(unnamed trip)"}</Link>
                  {t.category && (
                    <span
                      style={{
                        fontSize: "11px",
                        padding: "2px 8px",
                        borderRadius: "12px",
                        background: "#e3f2fd",
                        color: "#1976d2",
                        fontWeight: 500,
                      }}
                    >
                      {TRIP_CATEGORIES.find((c) => c.value === t.category)?.label || t.category}
                    </span>
                  )}
                </div>
                <button className="danger" onClick={() => deleteTrip(t.id)}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
