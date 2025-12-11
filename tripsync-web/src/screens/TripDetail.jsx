/**
 * Trip Detail Screen Component
 * 
 * Main trip viewing and editing screen with comprehensive itinerary management.
 * Provides real-time collaborative editing with Google Maps integration, weather
 * forecasting, comments, chat, activity feed, and scrapbook views.
 * 
 * Features:
 * - Real-time itinerary synchronization with Firestore
 * - Google Maps integration with place autocomplete and route visualization
 * - End-to-end encryption for all trip data (names, addresses, notes)
 * - Drag-and-drop itinerary reordering
 * - Per-item weather forecasting with caching
 * - Real-time change tracking and highlighting
 * - Optimistic updates for immediate UI feedback
 * - Comments system with @mentions
 * - Trip chat with encrypted messages
 * - Activity feed with real-time updates
 * - Scrapbook view of all trip media organized by day
 * - Export functionality (Excel, PDF, JSON)
 * - Day management (add, rename, delete)
 * 
 * This is the most complex screen in the application, orchestrating multiple
 * real-time data streams, encryption/decryption, and collaborative features.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { db, auth } from "../firebaseConfig";
import {
  doc,
  getDoc,
  addDoc,
  collection,
  onSnapshot,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  writeBatch,
  query,
  orderBy,
  limit as fsLimit,
  setDoc,
} from "firebase/firestore";
import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";
import ItineraryList from "../components/itinerary/ItineraryList.jsx";
import TripMembersPanel from "../components/TripMembersPanel.jsx";
import MapPane from "../components/map/MapPane.jsx";
import { ToastContainer } from "../components/ToastContainer.jsx";
import WeatherOverlay from "../components/WeatherOverlay.jsx";
import DayToolbar from "../components/DayToolbar.jsx";
import MembersOverlay from "../components/MembersOverlay.jsx";
import PlaceDetailsPane from "../components/PlaceDetailsPane.jsx";
import Comments from "../components/Comments.jsx";
import TripChat from "../components/TripChat.jsx";
import ActivityFeed from "../components/ActivityFeed.jsx";
import Scrapbook from "../components/Scrapbook.jsx";
import { extractDisplayName, resolvePlaceTitle, getCanonicalPlaceInfo, fetchWithNew } from "../utils/places.js";
import { toDate, ymd, googleDailySummary, parseDailyDetails, enrichWithCurrent, enrichWithHourly, toOutputPrecip } from "../utils/weather.js";
import { useSettings } from "../contexts/SettingsContext";
import { useNotifications, useItemChangeTracking } from "../hooks/useNotifications.js";
import { encrypt, decrypt } from "../utils/encryption.js";
import { getTripEncryptionKey, enableTripEncryption } from "../utils/tripKeys.js";
import { validateNotes, MAX_LENGTHS } from "../utils/validation.js";
import { exportTripAsJSON } from "../utils/export.js";
import { exportTripAsPDF } from "../utils/pdfExport.js";
import { exportTripAsExcel } from "../utils/excelExport.js";
import ExportOptionsModal from "../components/ExportOptionsModal.jsx";
import "./TripDetail.css";

/* ---------------- Constants ---------------- */

const MAP_LIBRARIES = ["places", "marker"];

// Pin colors
const PIN_BG_DEFAULT = "#2A9D8F";
const PIN_BORDER_DEFAULT = "#1f7f74";
const PIN_BG_ACTIVE = "#e76f51";
const PIN_BORDER_ACTIVE = "#c95e43";

// Weather / cache constants (served via Cloud Function proxy to Google Weather)
const FORECAST_STALE_HOURS = 12;
const FUNCTIONS_BASE = import.meta.env.VITE_FUNCTIONS_BASE_URL || "";


/* ---------------- Main Component ---------------- */

export default function TripDetail() {
  const { tripId } = useParams();
  const { temperatureUnit } = useSettings();
  const [trip, setTrip] = useState(null);
  const [dayLabels, setDayLabels] = useState({});
  const [items, setItems] = useState([]);
  const currentUserId = auth.currentUser?.uid;

  // Always enable encryption and load key
  useEffect(() => {
    if (!tripId || !currentUserId) return;

    const setupEncryption = async () => {
      try {
        // Try to get existing key
        let key = await getTripEncryptionKey(tripId, currentUserId);
        
        // If no key exists, enable encryption for this trip
        if (!key) {
          await enableTripEncryption(tripId, currentUserId);
          key = await getTripEncryptionKey(tripId, currentUserId);
        }
        
        setTripKey(key);
      } catch (error) {
        console.error('Error setting up encryption:', error);
      }
    };

    setupEncryption();
  }, [tripId, currentUserId]);

  // Map & Places
  const mapRef = useRef(null);
  const [mapObj, setMapObj] = useState(null);
  const [supportsAdvMarkers, setSupportsAdvMarkers] = useState(false);
  const placeCacheRef = useRef(new Map());

  // Places UI Kit (details column)
  const detailsElRef = useRef(null);
  const detailsReqElRef = useRef(null);

  // Map view state
  const [mapCenter, setMapCenter] = useState({ lat: 40, lng: -100 });
  const [mapZoom, setMapZoom] = useState(3);

  // Selection
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [activePlaceId, setActivePlaceId] = useState(null);
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const mapId = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || null;

  // Days
  const [selectedDay, setSelectedDay] = useState(1);
  const [maxPlannedDay, setMaxPlannedDay] = useState(1);

  // Guards
  const isDraggingRef = useRef(false);
  const pendingOrderRef = useRef(null);
  const initialCenteredRef = useRef(false);

  // Enhanced notifications
  const { toasts, addToast, removeToast } = useNotifications();
  const { changedItems, markItemChanged } = useItemChangeTracking();

  // Members overlay
  const [showMembers, setShowMembers] = useState(false);
  
  // Trip chat
  const [showChat, setShowChat] = useState(false);
  
  // Activity feed
  const [showActivityFeed, setShowActivityFeed] = useState(false);
  
  // Tabs
  const [activeTab, setActiveTab] = useState('itinerary'); // 'itinerary' or 'scrapbook'
  
  // Encryption key
  const [tripKey, setTripKey] = useState(null);
  
  // Track previous items to detect changes
  const prevItemsRef = useRef([]);
  const processedActivitiesRef = useRef(new Set());
  const optimisticItemsRef = useRef(new Map()); // Track optimistic items by temp ID

  // Weather per item + details overlay
  const [weatherByItem, setWeatherByItem] = useState({});
  const [weatherOpenItemId, setWeatherOpenItemId] = useState(null);

  // Comments overlay
  const [commentsOpenItemId, setCommentsOpenItemId] = useState(null);

  // Export modal
  const [showExportModal, setShowExportModal] = useState(false);
  const [exporting, setExporting] = useState(false);

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: apiKey,
    libraries: MAP_LIBRARIES,
    version: "beta",
  });

  /* ---------------- Firestore: trip + itinerary ---------------- */

  useEffect(() => {
    if (!tripId || !tripKey) return;

    (async () => {
      const snap = await getDoc(doc(db, "trips", tripId));
      if (snap.exists()) {
        const t = { id: snap.id, ...snap.data() };
        
        // Decrypt trip metadata
        if (t.encrypted) {
          try {
            if (t.encryptedName && t.name) {
              t.name = decrypt(t.name, tripKey);
            }
            if (t.encryptedCategory && t.category) {
              t.category = decrypt(t.category, tripKey);
            }
            // Dates are not encrypted (needed for queries)
          } catch (error) {
            console.error('Error decrypting trip metadata:', error);
          }
        }
        
        setTrip(t);
        setDayLabels(t.dayLabels || {});
      }
    })();
  }, [tripId, tripKey]);

  useEffect(() => {
    if (!tripId || !tripKey) return;

    const colRef = collection(db, "trips", tripId, "itinerary");
    const unsub = onSnapshot(colRef, async (snap) => {
      const listRaw = await Promise.all(
        snap.docs.map(async (d) => {
          const data = d.data() || {};
          const dayVal =
            typeof data.day === "number" ? data.day : Number(data.day ?? 1);
          const oi =
            typeof data.orderIndex === "number"
              ? data.orderIndex
              : Number(data.orderIndex ?? 0);
          
          // Decrypt title, address, and notes if encrypted
          let title = data.title;
          let address = data.address;
          let notes = data.notes;
          
          if (data.encrypted) {
            try {
              if (data.encryptedTitle && data.title) {
                title = decrypt(data.title, tripKey);
              }
              if (data.encryptedAddress && data.address) {
                address = decrypt(data.address, tripKey);
              }
              if (data.encryptedNotes && data.notes) {
                notes = decrypt(data.notes, tripKey);
              }
            } catch (error) {
              console.error('Error decrypting itinerary item:', error);
            }
          }
          
          return {
            id: d.id,
            ...data,
            title,
            address,
            notes,
            day: Number.isFinite(dayVal) ? dayVal : 1,
            orderIndex: Number.isFinite(oi) ? oi : 0,
          };
        })
      );

      const pending = pendingOrderRef.current;
      if (pending) {
        const sameDay = listRaw.filter((x) => (x.day ?? 1) === pending.day);
        let matches = true;
        for (const x of sameDay) {
          const exp = pending.orderMap.get(x.id);
          if (typeof exp === "number" && exp !== (x.orderIndex ?? 0)) {
            matches = false;
            break;
          }
        }
        if (!matches) return;
        pendingOrderRef.current = null;
      }

      // Get current optimistic items from ref (snapshot at listener start)
      const optimisticMap = new Map(optimisticItemsRef.current);
      
      // Track which optimistic items have been matched to Firestore items
      const matchedOptimisticIds = new Set();
      // Track which Firestore items have been matched to optimistic items
      const matchedFirestoreIds = new Set();
      
      // First pass: Match Firestore items with optimistic items
      // Match items that are recent OR that match an optimistic item (even if not recent)
      const finalList = listRaw.map((item) => {
        const itemCreatedAt = item.createdAt?.toDate?.();
        const isFromCurrentUser = item.createdBy === currentUserId;
        
        // Try to match if it's from current user (regardless of how recent)
        if (isFromCurrentUser) {
          // Find matching optimistic item that hasn't been matched yet
          for (const [optId, opt] of optimisticMap.entries()) {
            if (matchedOptimisticIds.has(optId)) continue;
            
            const optCreatedAt = opt.createdAt?.getTime?.() || 0;
            const itemCreatedAtTime = itemCreatedAt?.getTime() || 0;
            const timeDiff = Math.abs(optCreatedAt - itemCreatedAtTime);
            
            // Match: same place, same day, same user
            // If recent (within 10 seconds), use time proximity as additional check
            // If not recent, still match if place/day/user match (it's the confirmed version)
            const isRecent = itemCreatedAt && (Date.now() - itemCreatedAt.getTime() < 10000);
            const timeMatches = isRecent ? timeDiff < 10000 : true;
            
            if (opt.placeId === item.placeId && 
                opt.day === item.day && 
                opt.createdBy === item.createdBy &&
                timeMatches) {
              // Item is confirmed, mark both as matched and use Firestore version
              matchedOptimisticIds.add(optId);
              matchedFirestoreIds.add(item.id);
              optimisticItemsRef.current.delete(optId); // Remove from ref immediately
              return { ...item, _optimistic: false };
            }
          }
        }
        
        // Not matched to optimistic item, use Firestore item as-is
        return item;
      });
      
      // Second pass: Clean up any optimistic items that have matching Firestore items
      // (even if they weren't matched in the first pass due to timing)
      // Track which Firestore items we use in this pass to prevent multiple optimistic items matching the same Firestore item
      const secondPassMatchedFirestoreIds = new Set();
      
      for (const [optId, opt] of optimisticMap.entries()) {
        if (matchedOptimisticIds.has(optId)) continue;
        
        // Check if there's already a Firestore item in finalList that matches this optimistic item
        // This catches cases where the Firestore item arrived but wasn't recent enough to auto-match
        const matchingFirestoreItem = finalList.find(
          (item) => !item._optimistic && // Make sure it's a Firestore item, not another optimistic one
                    item.placeId === opt.placeId &&
                    item.day === opt.day &&
                    item.createdBy === opt.createdBy &&
                    !matchedFirestoreIds.has(item.id) && // Not matched in first pass
                    !secondPassMatchedFirestoreIds.has(item.id) // Not matched in second pass
        );
        
        if (matchingFirestoreItem) {
          // There's a matching Firestore item already in the list, remove from ref (it's confirmed)
          optimisticItemsRef.current.delete(optId);
          matchedOptimisticIds.add(optId); // Mark as matched so we don't add it
          secondPassMatchedFirestoreIds.add(matchingFirestoreItem.id); // Track that we used this Firestore item
        }
      }
      
      // Third pass: Add any remaining optimistic items that haven't been confirmed yet
      for (const [optId, opt] of optimisticMap.entries()) {
        if (!matchedOptimisticIds.has(optId)) {
          // No matching Firestore item found, add optimistic item to list
          finalList.push(opt);
        }
      }

      // Final deduplication: Remove duplicates by ID and by placeId/day/createdBy combination
      // (since optimistic items have different IDs than Firestore items)
      const seenIds = new Set();
      const seenPlaceDayUser = new Set(); // Track placeId/day/createdBy combinations
      const deduplicatedList = [];
      
      for (const item of finalList) {
        // Create a unique key for placeId/day/createdBy combination
        const placeDayUserKey = `${item.placeId || ''}_${item.day || ''}_${item.createdBy || ''}`;
        
        // Check for duplicate ID
        if (seenIds.has(item.id)) {
          // If current item is optimistic and we already have a Firestore version, skip it
          if (item._optimistic) {
            continue;
          }
          // If current item is Firestore and previous was optimistic, replace it
          const existingIndex = deduplicatedList.findIndex(i => i.id === item.id);
          if (existingIndex >= 0 && deduplicatedList[existingIndex]._optimistic) {
            deduplicatedList[existingIndex] = item;
            continue;
          }
          // Both are Firestore items with same ID - skip duplicate
          continue;
        }
        
        // Check for duplicate placeId/day/createdBy combination
        if (seenPlaceDayUser.has(placeDayUserKey)) {
          // If current item is optimistic, skip it (we already have a Firestore version)
          if (item._optimistic) {
            continue;
          }
          // If current item is Firestore and previous was optimistic, replace it
          const existingIndex = deduplicatedList.findIndex(i => {
            const key = `${i.placeId || ''}_${i.day || ''}_${i.createdBy || ''}`;
            return key === placeDayUserKey;
          });
          if (existingIndex >= 0 && deduplicatedList[existingIndex]._optimistic) {
            deduplicatedList[existingIndex] = item;
            continue;
          }
          // Both are Firestore items with same place/day/user - skip duplicate
          continue;
        }
        
        seenIds.add(item.id);
        seenPlaceDayUser.add(placeDayUserKey);
        deduplicatedList.push(item);
      }

      const list = deduplicatedList.sort(
        (a, b) => (a.day - b.day) || (a.orderIndex - b.orderIndex)
      );

      // Final safety check: Ensure no duplicate IDs in the final list
      const finalIds = new Set();
      const finalListSafe = [];
      const duplicateDetails = [];
      
      for (const item of list) {
        if (finalIds.has(item.id)) {
          const existingItem = finalListSafe.find(i => i.id === item.id);
          duplicateDetails.push({
            duplicateId: item.id,
            duplicateItem: { id: item.id, placeId: item.placeId, day: item.day, optimistic: item._optimistic },
            existingItem: existingItem ? { id: existingItem.id, placeId: existingItem.placeId, day: existingItem.day, optimistic: existingItem._optimistic } : null
          });
          console.error('[Itinerary Listener] CRITICAL: Duplicate ID found in final list after deduplication!', {
            id: item.id,
            placeId: item.placeId,
            day: item.day,
            optimistic: item._optimistic,
            existingItem: existingItem ? { id: existingItem.id, placeId: existingItem.placeId, day: existingItem.day, optimistic: existingItem._optimistic } : null,
            fullList: list.map(i => ({ id: i.id, placeId: i.placeId, day: i.day, optimistic: i._optimistic }))
          });
          continue; // Skip duplicate
        }
        finalIds.add(item.id);
        finalListSafe.push(item);
      }

      if (finalListSafe.length !== list.length) {
        console.error('[Itinerary Listener] CRITICAL: Removed duplicates from final list!', {
          before: list.length,
          after: finalListSafe.length,
          duplicates: list.length - finalListSafe.length,
          duplicateDetails,
          fullListBefore: list.map(i => ({ id: i.id, placeId: i.placeId, day: i.day, optimistic: i._optimistic }))
        });
      }

      // Final list ready - duplicates removed if any

      // Detect changes from other users
      const prevItems = prevItemsRef.current;
      if (prevItems.length > 0) {
        // Find newly added items (not from current user)
        const newItems = finalListSafe.filter(
          (item) => !prevItems.find((p) => p.id === item.id)
        );
        
        // Find removed items
        const removedItems = prevItems.filter(
          (p) => !finalListSafe.find((item) => item.id === p.id)
        );

        // Check for moved/reordered items
        const movedItems = finalListSafe.filter((item) => {
          const prev = prevItems.find((p) => p.id === item.id);
          if (!prev) return false;
          return prev.day !== item.day || prev.orderIndex !== item.orderIndex;
        });

        // Mark changes (only if not from current user)
        newItems.forEach((item) => {
          // Check if this was recently created
          const isRecent = item.createdAt?.toDate?.() 
            ? Date.now() - item.createdAt.toDate().getTime() < 2000
            : false;
          if (!isRecent) {
            markItemChanged(item.id, "add", item.createdBy || null);
          }
        });

        removedItems.forEach((item) => {
          markItemChanged(item.id, "remove", null);
        });

        movedItems.forEach((item) => {
          const prev = prevItems.find((p) => p.id === item.id);
          if (prev && (prev.day !== item.day || prev.orderIndex !== item.orderIndex)) {
            markItemChanged(item.id, item.day !== prev.day ? "move" : "reorder", null);
          }
        });
      }

      prevItemsRef.current = finalListSafe;
      setItems(finalListSafe);

      if (!initialCenteredRef.current && finalListSafe.length) {
        const firstWithLoc = finalListSafe.find(
          (x) => x.location?.lat != null && x.location?.lng != null
        );
        if (firstWithLoc) {
          setMapCenter({
            lat: firstWithLoc.location.lat,
            lng: firstWithLoc.location.lng,
          });
          setMapZoom(8);
        }
        initialCenteredRef.current = true;
      }
    });

    return () => unsub();
  }, [tripId, tripKey, markItemChanged, currentUserId]);

  /* ---------------- Activities - Enhanced real-time tracking ---------------- */

  useEffect(() => {
    if (!tripId || !currentUserId || !tripKey) return;
    
    const actRef = collection(db, "trips", tripId, "activities");
    const qActs = query(actRef, orderBy("createdAt", "desc"), fsLimit(20));
    
    // Track the last seen timestamp to only process new activities
    let lastSeenTimestamp = Date.now();
    
    const unsub = onSnapshot(qActs, async (snap) => {
      const now = Date.now();
      await Promise.all(
        snap.docs.map(async (docSnap) => {
          const a = docSnap.data();
          if (!a?.type || !a?.message) return;
          
          // Create unique ID for this activity
          const activityId = docSnap.id;
          
          // Skip if we've already processed this activity
          if (processedActivitiesRef.current.has(activityId)) return;
          
          // Only show activities from other users
          if (a.actorId === currentUserId) {
            processedActivitiesRef.current.add(activityId);
            return;
          }
          
          // Only process activities created after we started listening (or very recent ones)
          const createdAt = a.createdAt?.toDate?.() || new Date();
          const age = now - createdAt.getTime();
          
          // Process if it's new (created after last seen) or very recent (within 5 seconds)
          if (age > 5000 && createdAt.getTime() < lastSeenTimestamp) {
            processedActivitiesRef.current.add(activityId);
            return;
          }
          
          processedActivitiesRef.current.add(activityId);
          lastSeenTimestamp = Math.max(lastSeenTimestamp, createdAt.getTime());
          
          // Decrypt activity message if encrypted
          let message = a.message;
          if (tripKey && a.encrypted && message) {
            try {
              message = decrypt(message, tripKey);
            } catch (error) {
              console.error('Error decrypting activity message:', error);
              message = '[Encrypted message - decryption failed]';
            }
          }
          
          if (String(a.type).startsWith("itinerary.")) {
            const activityType = a.type.replace("itinerary.", "");
            
            // Add toast notification
            addToast({
              message: message,
              type: activityType === "add" ? "add" : activityType === "remove" ? "remove" : activityType === "reorder" || activityType === "move" ? "reorder" : "info",
              actorId: a.actorId,
              timeout: 5000,
            });

            // Highlight the item if itemId is provided
            if (a.itemId) {
              markItemChanged(a.itemId, activityType, a.actorId);
            }
          }
        })
      );
    });
    
    return () => {
      unsub();
      // Clear processed activities when component unmounts or tripId changes
      processedActivitiesRef.current.clear();
    };
  }, [tripId, currentUserId, tripKey, addToast, markItemChanged]);

  /* ---------------- Day derivations ---------------- */

  const existingDays = useMemo(() => {
    const s = new Set(items.map((i) => i.day ?? 1));
    return Array.from(s).sort((a, b) => a - b);
  }, [items]);

  useEffect(() => {
    const maxExisting = existingDays.length
      ? existingDays[existingDays.length - 1]
      : 1;
    setMaxPlannedDay((prev) => Math.max(prev, maxExisting, selectedDay));
  }, [existingDays, selectedDay]);

  const allDays = useMemo(
    () => Array.from({ length: Math.max(1, maxPlannedDay) }, (_, i) => i + 1),
    [maxPlannedDay]
  );

  const itemsForDay = useMemo(() => {
    let filtered = items.filter((i) => (i.day ?? 1) === selectedDay);
    
    return filtered.sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
  }, [items, selectedDay]);
  
  // Get unique place types from all items for filter dropdown
  const availablePlaceTypes = useMemo(() => {
    const typesSet = new Set();
    items.forEach((item) => {
      item.types?.forEach((t) => typesSet.add(t));
    });
    return Array.from(typesSet).sort();
  }, [items]);

  /* ---------------- Activity writer - Enhanced with itemId ---------------- */

  async function writeActivity(type, message, itemId = null) {
    if (!tripKey) {
      console.warn("Encryption key not ready, skipping activity");
      return;
    }

    try {
      // Encrypt activity message
      let encryptedMessage = message;
      let isEncrypted = false;

      if (tripKey && message) {
        try {
          encryptedMessage = encrypt(message, tripKey);
          isEncrypted = true;
        } catch (error) {
          console.error('Error encrypting activity message:', error);
          // Continue without encryption if it fails
        }
      }

      const activityData = {
        type,
        message: encryptedMessage,
        encrypted: isEncrypted,
        createdAt: serverTimestamp(),
        actorId: auth.currentUser?.uid || "unknown",
      };
      
      if (itemId) {
        activityData.itemId = itemId;
      }

      await addDoc(collection(db, "trips", tripId, "activities"), activityData);
    } catch (e) {
      console.warn("Activity write failed:", e);
    }
  }

  /* ---------------- Drag & Drop ---------------- */

  async function handleDragEnd(result) {
    isDraggingRef.current = false;
    if (!result.destination) return;

    const dayItems = items
      .filter((i) => (i.day ?? 1) === selectedDay)
      .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));

    const otherItems = items.filter((i) => (i.day ?? 1) !== selectedDay);

    const reordered = Array.from(dayItems);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);

    const orderMap = new Map();
    reordered.forEach((item, idx) => orderMap.set(item.id, idx));
    pendingOrderRef.current = { day: selectedDay, orderMap };

    const optimistic = reordered.map((r, idx) => ({ ...r, orderIndex: idx }));
    setItems([...otherItems, ...optimistic]);

    const batch = writeBatch(db);
    reordered.forEach((item, idx) => {
      batch.update(doc(db, "trips", tripId, "itinerary", item.id), { orderIndex: idx });
    });

    try {
      await batch.commit();
      
      // Highlight reordered items
      reordered.forEach((item) => {
        markItemChanged(item.id, "reorder", currentUserId);
      });
      
      await writeActivity("itinerary.reorder", `Reordered Day ${selectedDay} itinerary`);
      
      // Show toast for our own action
      addToast({
        message: `Reordered Day ${selectedDay} itinerary`,
        type: "reorder",
        actorId: currentUserId,
        timeout: 3000,
      });
    } catch (e) {
      console.error("Reorder failed:", e);
      pendingOrderRef.current = null;
      alert("Could not save new order. Check Firestore rules.");
    }
  }

  async function handleDeleteItem(itemId) {
    const deleted = items.find((x) => x.id === itemId);
    if (activePlaceId && deleted?.placeId === activePlaceId) {
      setActivePlaceId(null);
    }
    
    // Highlight before deletion
    markItemChanged(itemId, "remove", currentUserId);
    
    await deleteDoc(doc(db, "trips", tripId, "itinerary", itemId));
    await writeActivity("itinerary.remove", `Removed "${deleted?.title || "a stop"}"`, itemId);
    
    // Show toast for our own action
    addToast({
      message: `Removed "${deleted?.title || "a stop"}"`,
      type: "remove",
      actorId: currentUserId,
      timeout: 4000,
    });
  }

  /* ---------------- Map ---------------- */

  const mapOptions = useMemo(
    () => ({
      streetViewControl: false,
      mapTypeControl: false,
      clickableIcons: true,
      gestureHandling: "greedy",
      zoomControl: true,
      keyboardShortcuts: false,
      ...(mapId ? { mapId } : {}),
    }),
    [mapId]
  );

  const onMapLoad = (map) => {
    mapRef.current = map;
    setMapObj(map);
  };

  // uses fetchWithNew imported from utils/places

  async function fetchPlaceFields(placeId) {
    if (placeCacheRef.current.has(placeId))
      return placeCacheRef.current.get(placeId);
    const details = await fetchWithNew(placeId);
    if (details) placeCacheRef.current.set(placeId, details);
    return details;
  }

  /* ---------------- Itinerary actions ---------------- */

  const addPlaceToItinerary = async () => {
    if (!selectedPlace?.details && activePlaceId) {
      const d = await fetchPlaceFields(activePlaceId);
      if (d) {
        setSelectedPlace({ id: activePlaceId, details: d, position: d.location || null });
      }
    }

    const d = selectedPlace?.details;
    if (!d) return;

    let details = d;
    if (!extractDisplayName(d.displayName)) {
      const canonical = await getCanonicalPlaceInfo(selectedPlace.id);
      if (canonical) {
        details = {
          ...d,
          displayName: canonical.displayName,
          formattedAddress: d.formattedAddress || canonical.formattedAddress,
          location: d.location || canonical.location,
        };
      }
    }

    const { lat, lng } = details.location || {};
    if (typeof lat !== "number" || typeof lng !== "number") return;

    const title = resolvePlaceTitle(details);

    // Calculate next order index better
    // Filter out optimistic items that might not have been saved yet
    const dayItems = items.filter((i) => (i.day ?? 1) === selectedDay && !i._optimistic);
    const existingOrders = dayItems.map((i) => i.orderIndex ?? 0).filter((o) => typeof o === 'number');
    const nextOrder = existingOrders.length
      ? Math.max(...existingOrders) + 1
      : 0;

    // Encrypt title and address
    let encryptedTitle = title;
    let encryptedAddress = details.formattedAddress ?? null;
    let isEncrypted = false;

    if (tripKey) {
      try {
        encryptedTitle = encrypt(title, tripKey);
        if (encryptedAddress) {
          encryptedAddress = encrypt(encryptedAddress, tripKey);
        }
        isEncrypted = true;
      } catch (error) {
        console.error('Error encrypting itinerary item:', error);
        alert('Failed to encrypt item. Please try again.');
        return;
      }
    } else {
      alert('Encryption key not ready. Please try again in a moment.');
      return;
    }

    // Generate a temporary ID for optimistic update
    const tempDocRef = doc(collection(db, "trips", tripId, "itinerary"));
    const tempId = tempDocRef.id;

    // Optimistic update, add item immediately with plaintext
    const optimisticItem = {
      id: tempId,
      title: title, // Plaintext for immediate display
      address: encryptedAddress ? details.formattedAddress : null, // Plaintext address
      placeId: selectedPlace.id,
      location: { lat, lng },
      rating: details.rating ?? null,
      types: details.types ?? [],
      day: selectedDay,
      orderIndex: nextOrder,
      createdBy: currentUserId,
      encrypted: isEncrypted,
      encryptedTitle: isEncrypted,
      encryptedAddress: isEncrypted && encryptedAddress ? true : null,
      createdAt: new Date(), // Temporary timestamp
      _optimistic: true, // Mark as optimistic
    };

    // Add to optimistic items ref
    optimisticItemsRef.current.set(tempId, optimisticItem);
    
    // Add to local state immediately - but ensure no duplicates
    setItems((prev) => {
      // Remove any existing item with the same tempId (shouldn't happen, but safety check)
      const filtered = prev.filter((i) => i.id !== tempId);
      
      // Also check for duplicates by placeId/day/createdBy
      const placeDayUserKey = `${selectedPlace.id}_${selectedDay}_${currentUserId}`;
      const hasDuplicate = filtered.some((i) => {
        const key = `${i.placeId || ''}_${i.day || ''}_${i.createdBy || ''}`;
        return key === placeDayUserKey;
      });
      
      if (hasDuplicate) {
        return prev; // Don't add if duplicate exists
      }
      
      const otherItems = filtered.filter((i) => (i.day ?? 1) !== selectedDay);
      const dayItems = filtered.filter((i) => (i.day ?? 1) === selectedDay);
      const newDayItems = [...dayItems, optimisticItem].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
      return [...otherItems, ...newDayItems];
    });

    try {
      const docRef = await addDoc(collection(db, "trips", tripId, "itinerary"), {
        title: encryptedTitle,
        encryptedTitle: isEncrypted,
        placeId: selectedPlace.id,
        location: { lat, lng },
        address: encryptedAddress,
        encryptedAddress: isEncrypted && encryptedAddress ? true : null,
        rating: details.rating ?? null,
        types: details.types ?? [],
        day: selectedDay,
        url: null,
        website: null,
        createdAt: serverTimestamp(),
        orderIndex: nextOrder,
        createdBy: currentUserId,
        encrypted: isEncrypted,
      });

      const msg = `Added "${title}" to Day ${selectedDay}`;
      
      // Highlight the newly added item
      markItemChanged(docRef.id, "add", currentUserId);
      
      await writeActivity("itinerary.add", msg, docRef.id);
      
      // Track analytics
      const { trackUserAction } = await import("../utils/errorTracking.js");
      trackUserAction('itinerary_item_added', {
        trip_id: tripId,
        day: selectedDay,
        has_address: !!encryptedAddress,
        has_rating: !!details.rating,
      });
      
      // Show toast for our own action
      addToast({
        message: msg,
        type: "add",
        actorId: currentUserId,
        timeout: 4000,
      });
    } catch (error) {
      console.error("Error adding itinerary item:", error);
      
      // Remove optimistic update on error
      optimisticItemsRef.current.delete(tempId);
      setItems((prev) => prev.filter((i) => i.id !== tempId));
      
      alert(`Failed to add stop: ${error.message || "Unknown error"}`);
    }
  };

  const moveItemToDay = async (item, newDay) => {
    if ((item.day ?? 1) === newDay) return;

    if (newDay > maxPlannedDay) setMaxPlannedDay(newDay);

    const targetDayItems = items.filter((i) => (i.day ?? 1) === newDay);
    const nextOrder = targetDayItems.length
      ? Math.max(...targetDayItems.map((i) => i.orderIndex ?? 0)) + 1
      : 0;

    // Highlight the moved item
    markItemChanged(item.id, "move", currentUserId);

    await updateDoc(doc(db, "trips", tripId, "itinerary", item.id), {
      day: newDay,
      orderIndex: nextOrder,
    });

    await writeActivity("itinerary.move", `Moved "${item.title || "a stop"}" to Day ${newDay}`, item.id);
    
    // Show toast for our own action
    addToast({
      message: `Moved "${item.title || "a stop"}" to Day ${newDay}`,
      type: "move",
      actorId: currentUserId,
      timeout: 4000,
    });
  };

  const updateItemNotes = async (itemId, notes) => {
    try {
      // Validate notes
      const validation = validateNotes(notes);
      if (!validation.valid) {
        alert(validation.error);
        return;
      }

      const encryptedNotes = tripKey ? encrypt(validation.sanitized, tripKey) : validation.sanitized;
      await updateDoc(doc(db, "trips", tripId, "itinerary", itemId), {
        notes: encryptedNotes || null,
        encrypted: !!tripKey,
        encryptedNotes: !!tripKey && encryptedNotes ? true : null,
      });
    } catch (e) {
      console.error("Failed to update notes:", e);
      alert("Could not save notes. Please try again.");
    }
  };

  /* ---------------- Day management ---------------- */

  function addNewDayAndSwitch() {
    setMaxPlannedDay((prev) => prev + 1);
    setSelectedDay((prev) => prev + 1);
  }

  async function renameCurrentDay() {
    const current = dayLabels?.[selectedDay] || "";
    const proposed = window.prompt(
      `Rename Day ${selectedDay} (leave blank to clear label):`,
      current
    );
    if (proposed === null) return;
    const trimmed = proposed.trim();

    const updated = { ...(dayLabels || {}) };
    if (trimmed) updated[selectedDay] = trimmed;
    else delete updated[selectedDay];

    try {
      await updateDoc(doc(db, "trips", tripId), { dayLabels: updated });
      setDayLabels(updated);
    } catch (e) {
      console.error("Rename day failed:", e);
    }
  }

  async function deleteCurrentDay() {
    if (!selectedDay) return;

    const msg =
      `Delete Day ${selectedDay}? This will permanently delete all stops in Day ${selectedDay} ` +
      `and shift later days down by 1 (Day ${selectedDay + 1} → Day ${selectedDay}, etc.).`;
    if (!window.confirm(msg)) return;

    const batch = writeBatch(db);

    const toDelete = items.filter((i) => (i.day ?? 1) === selectedDay);
    toDelete.forEach((i) =>
      batch.delete(doc(db, "trips", tripId, "itinerary", i.id))
    );

    const toShift = items.filter((i) => (i.day ?? 1) > selectedDay);
    toShift.forEach((i) =>
      batch.update(doc(db, "trips", tripId, "itinerary", i.id), {
        day: (i.day ?? 1) - 1,
      })
    );

    const newLabels = {};
    Object.entries(dayLabels || {}).forEach(([k, v]) => {
      const d = Number(k);
      if (d < selectedDay) newLabels[d] = v;
      else if (d > selectedDay) newLabels[d - 1] = v;
    });

    try {
      await batch.commit();
      await updateDoc(doc(db, "trips", tripId), { dayLabels: newLabels });
      setDayLabels(newLabels);
      setMaxPlannedDay((prev) => Math.max(1, prev - 1));
      setSelectedDay((prev) =>
        Math.max(1, Math.min(prev, existingDays[existingDays.length - 1] ?? 1))
      );
    } catch (e) {
      console.error("Delete day failed:", e);
    }
  }

  /* ---------------- Weather: per-item fetch + cache (+ enrichment) ---------------- */

  const tripStartDate = useMemo(() => toDate(trip?.startDate), [trip?.startDate]);

  useEffect(() => {
    if (!FUNCTIONS_BASE || !tripStartDate || !items.length) return;

    const fetchItemWeather = async (item) => {
      const { id, location, day } = item || {};
      if (!id || !location?.lat || !location?.lng || !Number.isFinite(day)) return;

      // Date for this item from trip start + (day-1)
      const targetDate = new Date(tripStartDate.getTime());
      targetDate.setDate(tripStartDate.getDate() + (day - 1));
      const dateKey = ymd(targetDate);

      const prev = weatherByItem[id];
      if (prev?.dateKey === dateKey && prev?.status === "ready") return;

      setWeatherByItem((s) => ({ ...s, [id]: { status: "loading", dateKey } }));

      // Try cache
      let cachedUsed = false;
      try {
        const cacheRef = doc(db, "trips", tripId, "forecasts", "items", id);
        const cacheSnap = await getDoc(cacheRef);
        if (cacheSnap.exists()) {
          const c = cacheSnap.data();
          const fetchedAt = c.fetchedAt?.toDate?.() ?? null;
          const fresh =
            c.dateKey === dateKey &&
            fetchedAt &&
            (Date.now() - fetchedAt.getTime()) / 36e5 < FORECAST_STALE_HOURS;
          if (fresh && c.summary) {
            setWeatherByItem((s) => ({
              ...s,
              [id]: { status: "ready", source: "cache", ...c.summary, dateKey },
            }));
            cachedUsed = true;
          }
        }
      } catch {/* ignore */}
      if (cachedUsed) return;

      try {
        // 1) DAILY (main)
        const urlDaily = new URL(`${FUNCTIONS_BASE}/weatherDaily`);
        urlDaily.searchParams.set("lat", String(location.lat));
        urlDaily.searchParams.set("lng", String(location.lng));
        urlDaily.searchParams.set("units", temperatureUnit);
        urlDaily.searchParams.set("date", dateKey);
        const resDaily = await fetch(urlDaily.toString());
        if (!resDaily.ok) throw new Error(`Weather daily ${resDaily.status}`);
        const dataDaily = await resDaily.json();
        const daysArray =
          dataDaily?.days || dataDaily?.daily?.days || dataDaily?.dailyForecasts?.days || dataDaily?.forecastDays || [];
        const summary = googleDailySummary(daysArray, dateKey);
        if (!summary) {
          setWeatherByItem((s) => ({
            ...s,
            [id]: { status: "error", dateKey, error: "No forecast" },
          }));
          return;
        }

        // Pull daily details (sparse)
        let details = parseDailyDetails(summary.raw);

        // 2) If “today” at that location, augment with CURRENT
        const localToday = new Date().toISOString().slice(0, 10) === dateKey;
        if (localToday) {
          try {
            const urlCurr = new URL(`${FUNCTIONS_BASE}/weatherCurrent`);
            urlCurr.searchParams.set("lat", String(location.lat));
            urlCurr.searchParams.set("lng", String(location.lng));
            urlCurr.searchParams.set("units", temperatureUnit);
            const resCurr = await fetch(urlCurr.toString());
            if (resCurr.ok) {
              const cc = await resCurr.json();
              details = enrichWithCurrent(details, cc);
            }
          } catch (e) {
            // Ignore current weather errors
          }
        }

        // 3) Always try to augment with HOURLY for that calendar day (sum QPF, avg humidity, etc.)
        try {
          const urlHr = new URL(`${FUNCTIONS_BASE}/weatherHourly`);
          urlHr.searchParams.set("lat", String(location.lat));
          urlHr.searchParams.set("lng", String(location.lng));
          urlHr.searchParams.set("units", temperatureUnit);
          urlHr.searchParams.set("date", dateKey);
          const resHr = await fetch(urlHr.toString());
          if (resHr.ok) {
            const hourly = await resHr.json();
            details = enrichWithHourly(details, hourly, temperatureUnit);
          }
        } catch (e) {
          // Ignore hourly weather errors
        }

        // Convert precip to output units
        const { value: precipOut, unit: precipUnit } = toOutputPrecip(temperatureUnit, details.precipMm, details.precipIn);

        const mergedSummary = {
          min: summary.min,
          max: summary.max,
          iconUri: summary.iconUri,
          raw: {
            ...summary.raw,
            _enriched: {
              ...details,
              precipOut,
              precipUnit,
            },
          },
        };

        // Cache
        try {
          await setDoc(
            doc(db, "trips", tripId, "forecasts", "items", id),
            {
              dateKey,
              lat: location.lat,
              lng: location.lng,
              summary: mergedSummary,
              fetchedAt: serverTimestamp(),
            },
            { merge: true }
          );
        } catch {/* ignore */}

        setWeatherByItem((s) => ({
          ...s,
          [id]: { status: "ready", source: "live", ...mergedSummary, dateKey },
        }));
      } catch (e) {
        console.error("Weather fetch error (item):", e);
        setWeatherByItem((s) => ({
          ...s,
          [id]: { status: "error", dateKey, error: "Forecast unavailable" },
        }));
      }
    };

    const todays = items.filter((i) => (i.day ?? 1) === selectedDay);
    const others = items.filter((i) => (i.day ?? 1) !== selectedDay);

    todays.forEach(fetchItemWeather);
    setTimeout(() => others.forEach(fetchItemWeather), 150);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [FUNCTIONS_BASE, tripStartDate, items, selectedDay]);

  /* ---------------- Render ---------------- */

  const currentDayLabel = dayLabels?.[selectedDay];
  const tempUnit = temperatureUnit === "METRIC" ? "°C" : "°F";

  // Calculate and format the date for the selected day
  const selectedDayDate = useMemo(() => {
    if (!tripStartDate) return null;
    const dayDate = new Date(tripStartDate.getTime());
    dayDate.setDate(tripStartDate.getDate() + (selectedDay - 1));
    return dayDate.toLocaleDateString("en-US", { 
      month: "short", 
      day: "numeric", 
      year: "numeric" 
    });
  }, [tripStartDate, selectedDay]);

  // Export handlers
  const handleExportExcel = async () => {
    if (!tripId || !trip) return;
    try {
      setExporting(true);
      const tripName = trip.name || "Trip";
      await exportTripAsExcel(tripId, tripName);
      alert("Trip exported successfully!");
      setShowExportModal(false);
    } catch (error) {
      console.error("Export error:", error);
      alert("Error exporting trip: " + error.message);
    } finally {
      setExporting(false);
    }
  };

  const handleExportPDF = async () => {
    if (!tripId || !trip) return;
    try {
      setExporting(true);
      const tripName = trip.name || "Trip";
      await exportTripAsPDF(tripId, tripName);
      alert("PDF exported successfully!");
      setShowExportModal(false);
    } catch (error) {
      console.error("PDF export error:", error);
      alert("Error exporting PDF: " + error.message);
    } finally {
      setExporting(false);
    }
  };


  return (
    <div
      className="td trip-detail"
      style={{
        ["--pin-bg"]: PIN_BG_DEFAULT,
        ["--pin-bg-active"]: PIN_BG_ACTIVE,
        ["--pin-border"]: PIN_BORDER_DEFAULT,
        ["--pin-border-active"]: PIN_BORDER_ACTIVE,
      }}
    >
      <div className="td-header-row">
        <h2 className="td-title">{trip?.name || "Trip"}</h2>
        <button
          className="td-export-button"
          onClick={() => setShowExportModal(true)}
          title="Export trip data"
        >
          Export
        </button>
      </div>

      {/* Tabs */}
      <div className="td-tabs">
        <button
          className={`td-tab ${activeTab === 'itinerary' ? 'active' : ''}`}
          onClick={() => setActiveTab('itinerary')}
        >
          Itinerary
        </button>
        <button
          className={`td-tab ${activeTab === 'scrapbook' ? 'active' : ''}`}
          onClick={() => setActiveTab('scrapbook')}
        >
          Scrapbook
        </button>
      </div>

      {activeTab === 'itinerary' ? (
        <div className="td-grid">
        {/* Column 1: Itinerary */}
        <div className="td-card">
          <div className="td-card-header">
            <h3 className="td-card-title">
              Itinerary{currentDayLabel ? ` — ${currentDayLabel}` : ""}
            </h3>
            <DayToolbar
              selectedDay={selectedDay}
              allDays={allDays}
              dayLabels={dayLabels}
              onChangeDay={(d) => setSelectedDay(d)}
              onAddDay={addNewDayAndSwitch}
              onRenameDay={renameCurrentDay}
              onDeleteDay={deleteCurrentDay}
              onShowActivityFeed={() => setShowActivityFeed(true)}
              onShowChat={() => setShowChat(true)}
              onShowMembers={() => setShowMembers(true)}
            />
          </div>

          <div className="td-subheader">
            <div className="td-subheader-meta">
              {itemsForDay.length} stop{itemsForDay.length === 1 ? "" : "s"} • Day {selectedDay}
              {selectedDayDate ? ` • ${selectedDayDate}` : ""}
              {currentDayLabel ? ` — ${currentDayLabel}` : ""}
            </div>
          </div>

          <ItineraryList
            items={itemsForDay}
            activePlaceId={activePlaceId}
            weatherByItem={weatherByItem}
            tempUnit={tempUnit}
            allDays={allDays}
            dayLabels={dayLabels}
            selectedDay={selectedDay}
            tripId={tripId}
            onDragEnd={handleDragEnd}
            onWeatherClick={(item) => setWeatherOpenItemId(item.id)}
            onMoveItemToDay={moveItemToDay}
            onDeleteItem={handleDeleteItem}
            onUpdateNotes={updateItemNotes}
            onCommentsClick={(itemId) => setCommentsOpenItemId(itemId)}
            changedItems={changedItems}
            onItemClick={(item) => {
              if (!item?.placeId) return;
              (async () => {
                const pos = item.location ? { lat: item.location.lat, lng: item.location.lng } : null;
                if (pos && mapRef.current) {
                  setMapCenter(pos);
                  setMapZoom(15);
                  mapRef.current.panTo(pos);
                  mapRef.current.setZoom(15);
                }
                if (detailsReqElRef.current) {
                  detailsReqElRef.current.place = item.placeId;
                }
                const d = await fetchPlaceFields(item.placeId);
                setSelectedPlace({
                  id: item.placeId,
                  details:
                    d || {
                      displayName: item.title || "",
                      formattedAddress: item.address || "",
                      location: pos,
                      rating: item.rating ?? null,
                      userRatingCount: null,
                      types: item.types ?? [],
                    },
                  position: pos,
                });
                setActivePlaceId(item.placeId);
              })();
            }}
          />
        </div>

        {/* Column 2: Map */}
        <MapPane
          isLoaded={isLoaded}
          mapCenter={mapCenter}
          mapZoom={mapZoom}
          mapOptions={mapOptions}
          items={itemsForDay}
          activePlaceId={activePlaceId}
          onActivePlaceChange={(pid) => setActivePlaceId(pid)}
          detailsReqElRef={detailsReqElRef}
          setMapCenter={setMapCenter}
          setMapZoom={setMapZoom}
          fetchPlaceFields={fetchPlaceFields}
          setSelectedPlace={setSelectedPlace}
        />

        {/* Column 3: Place Details */}
        <PlaceDetailsPane
          activePlaceId={activePlaceId}
          selectedDay={selectedDay}
          addPlaceToItinerary={addPlaceToItinerary}
          detailsElRef={detailsElRef}
          detailsReqElRef={detailsReqElRef}
        />
      </div>
      ) : (
        /* Scrapbook Tab Content */
        <Scrapbook 
          tripId={tripId} 
          trip={trip} 
          onClose={() => {}} 
          embedded={true}
        />
      )}

      {/* Weather Details Overlay (per item) */}
      {weatherOpenItemId && (() => {
        const item = items.find((i) => i.id === weatherOpenItemId);
        const wd = weatherByItem[weatherOpenItemId];
        const raw = wd?.raw || {};
        const enriched = raw?._enriched || {};
        const tempUnit = temperatureUnit === "METRIC" ? "°C" : "°F";
        // Title is already decrypted in items array
        return (
          <WeatherOverlay
            itemTitle={item?.title || "Stop"}
            wd={wd}
            enriched={enriched}
            tempUnit={tempUnit}
            dateKey={wd?.dateKey}
            source={wd?.source === "cache" ? "Cached" : "Live"}
            onClose={() => setWeatherOpenItemId(null)}
          />
        );
      })()}

      {/* Members & Invite overlay */}
      {showMembers && (
        <MembersOverlay tripId={tripId} onClose={() => setShowMembers(false)} />
      )}

      {/* Comments overlay */}
      {commentsOpenItemId && (
        <Comments
          tripId={tripId}
          itemId={commentsOpenItemId}
          onClose={() => setCommentsOpenItemId(null)}
        />
      )}

      {/* Trip Chat overlay */}
      {showChat && (
        <TripChat tripId={tripId} onClose={() => setShowChat(false)} />
      )}

      {/* Activity Feed overlay */}
      {showActivityFeed && (
        <ActivityFeed tripId={tripId} onClose={() => setShowActivityFeed(false)} />
      )}


      <ToastContainer toasts={toasts} onDismiss={removeToast} />

      {/* Export Options Modal */}
      <ExportOptionsModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        onExportExcel={handleExportExcel}
        onExportPDF={handleExportPDF}
        exporting={exporting}
      />
    </div>
  );
}
