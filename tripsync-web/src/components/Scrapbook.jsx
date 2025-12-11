/**
 * Scrapbook Component
 * 
 * Displays a scrapbook view of all itinerary items organized by day with media galleries.
 * Shows photos and videos associated with each stop, decrypts encrypted titles and addresses,
 * and provides a day-based organization view. Can be displayed as a standalone overlay or embedded.
 */

import React, { useState, useEffect, useMemo } from "react";
import { db, auth } from "../firebaseConfig";
import {
  collection,
  onSnapshot,
  getDocs,
  query,
  orderBy,
} from "firebase/firestore";
import { getUserProfiles, getUserDisplayName } from "../utils/users.js";
import { decrypt } from "../utils/encryption.js";
import { getTripEncryptionKey, enableTripEncryption } from "../utils/tripKeys.js";
import "./Scrapbook.css";

/**
 * Renders scrapbook view of trip itinerary items
 * @param {string} tripId - Trip ID to load scrapbook for
 * @param {Object} trip - Trip data object
 * @param {Function} onClose - Callback function to close scrapbook (when not embedded)
 * @param {boolean} embedded - Whether scrapbook is embedded or displayed as overlay (default: false)
 */
export default function Scrapbook({ tripId, trip, onClose, embedded = false }) {
  const [items, setItems] = useState([]);
  const [userProfiles, setUserProfiles] = useState({});
  const [selectedDay, setSelectedDay] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tripKey, setTripKey] = useState(null);
  const currentUserId = auth.currentUser?.uid;
  
  /**
   * Checks if a string appears to be base64-encoded (encrypted data)
   * Used to determine if decryption is needed before attempting to decrypt
   * @param {string} str - String to check
   * @returns {boolean} True if string looks like base64
   */
  const looksLikeBase64 = (str) => {
    if (!str || typeof str !== 'string') return false;
    return str.length >= 20 && /^[A-Za-z0-9+/=]+$/.test(str) && str.length % 4 === 0;
  };
  
  // Effect hook to set up encryption and load the trip encryption key
  // Ensures encryption is enabled for the trip and the key is available for decryption
  useEffect(() => {
    if (!tripId || !currentUserId) return;
    
    const setupEncryption = async () => {
      try {
        // Attempt to get existing trip encryption key
        let key = await getTripEncryptionKey(tripId, currentUserId);
        
        // If no key exists, enable encryption for this trip and generate keys
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

  // Effect hook to load itinerary items and travel diary entries
  // Sets up real-time listener for itinerary changes and processes all scrapbook data
  useEffect(() => {
    if (!tripId) return;

    const itineraryRef = collection(db, "trips", tripId, "itinerary");
    // Query itinerary items ordered by day and position within each day
    const itineraryQuery = query(itineraryRef, orderBy("day", "asc"), orderBy("orderIndex", "asc"));
    
    // Set up real-time listener for itinerary changes
    const unsubscribe = onSnapshot(itineraryQuery, async (itinerarySnap) => {
      const itineraryItemsMap = new Map();
      const userIds = new Set();
      
      // Process each itinerary item: decrypt titles/addresses if encrypted
      await Promise.all(itinerarySnap.docs.map(async (d) => {
        const data = d.data() || {};
        const dayVal = typeof data.day === "number" ? data.day : Number(data.day ?? 1);
        const position = data.position || data.orderIndex || 0;
        
        let title = data.title;
        let address = data.address;
        
        // Decrypt item metadata if encryption is enabled and key is available
        if (data.encrypted && tripKey) {
          try {
            // Decrypt title if it appears to be encrypted (base64 format)
            if (data.encryptedTitle && data.title && looksLikeBase64(data.title)) {
              try {
                const decrypted = decrypt(data.title, tripKey);
                if (decrypted && decrypted.trim().length > 0) {
                  title = decrypted.trim();
                } else {
                  title = 'Unnamed Stop';
                }
              } catch (decryptError) {
                console.error('Failed to decrypt stop title:', decryptError);
                title = 'Unnamed Stop';
              }
            } else if (!data.title) {
              title = 'Unnamed Stop';
            }
            
            // Decrypt address if it appears to be encrypted (base64 format)
            if (data.encryptedAddress && data.address && looksLikeBase64(data.address)) {
              try {
                const decrypted = decrypt(data.address, tripKey);
                if (decrypted && decrypted.trim().length > 0) {
                  address = decrypted.trim();
                } else {
                  address = 'Address unavailable';
                }
              } catch (decryptError) {
                console.error('Failed to decrypt stop address:', decryptError);
                address = 'Address unavailable';
              }
            }
          } catch (error) {
            console.error('Error decrypting item metadata:', error);
            // Fallback to default values if decryption fails
            if (!title || (title && looksLikeBase64(title))) {
              title = 'Unnamed Stop';
            }
            if (!address || (address && looksLikeBase64(address))) {
              address = 'Address unavailable';
            }
          }
        } else if (data.encrypted && !tripKey) {
          // Encrypted but no key available - show fallback values
          if (!title || (title && looksLikeBase64(title))) {
            title = 'Unnamed Stop';
          }
          if (!address || (address && looksLikeBase64(address))) {
            address = 'Address unavailable';
          }
        }
        
        // Store processed item metadata in map
        itineraryItemsMap.set(d.id, {
          id: d.id,
          title,
          address,
          day: Number.isFinite(dayVal) ? dayVal : 1,
          position,
        });
      }));

      const stopsWithContent = new Map();

      // Load travel diary entries for each itinerary item
      // Merges notes and media from all entries into a single scrapbook view
      await Promise.all(Array.from(itineraryItemsMap.values()).map(async (itineraryItem) => {
        // Fetch all travel diary entries for this itinerary item
        const entriesRef = collection(db, "trips", tripId, "itinerary", itineraryItem.id, "travelDiaryEntries");
        const entriesSnap = await getDocs(entriesRef);
        
        const allNotes = [];
        const allMedia = [];
        let hasAnyContent = false;
        
        // Process each travel diary entry
        entriesSnap.docs.forEach((entryDoc) => {
          const entryData = entryDoc.data();
          // Check if entry has any content (notes or media)
          const hasContent = !!(entryData.notes || (entryData.mediaUrls && entryData.mediaUrls.length > 0));
          
          if (hasContent) {
            hasAnyContent = true;
            // Track user IDs to load profiles later
            if (entryData.createdBy) userIds.add(entryData.createdBy);
            
            let notes = entryData.notes;
            // Decrypt notes if encryption is enabled
            if (entryData.encrypted && tripKey && notes) {
              try {
                if (looksLikeBase64(notes)) {
                  try {
                    const decrypted = decrypt(notes, tripKey);
                    if (decrypted && decrypted.trim().length > 0) {
                      notes = decrypted.trim();
                    } else {
                      notes = null; // Skip empty decrypted notes
                    }
                  } catch (decryptError) {
                    console.error('Failed to decrypt notes:', decryptError);
                    notes = null; // Skip failed decryption
                  }
                }
              } catch (error) {
                console.error('Error decrypting notes:', error);
                notes = null; // Skip failed decryption
              }
            } else if (entryData.encrypted && !tripKey && notes && looksLikeBase64(notes)) {
              // Skip encrypted notes if key is not available
              notes = null;
            }
            
            // Add decrypted notes with author and timestamp info
            if (notes) {
              allNotes.push({
                text: notes,
                author: entryData.createdBy,
                createdAt: entryData.createdAt,
                updatedAt: entryData.updatedAt,
              });
            }
            
            // Collect all media URLs from this entry
            if (entryData.mediaUrls && entryData.mediaUrls.length > 0) {
              allMedia.push(...entryData.mediaUrls);
            }
          }
        });
        
        // Only include stops that have content (notes or media)
        if (hasAnyContent && (allNotes.length > 0 || allMedia.length > 0)) {
          stopsWithContent.set(itineraryItem.id, {
            ...itineraryItem,
            notes: allNotes,
            mediaUrls: allMedia,
          });
        }
      }));

      // Sort stops by day first, then by position within each day
      const sortedStops = Array.from(stopsWithContent.values()).sort((a, b) => {
        if (a.day !== b.day) {
          return a.day - b.day;
        }
        return (a.position || 0) - (b.position || 0);
      });

      setItems(sortedStops);

      // Load user profiles for all users who created notes or media
      if (userIds.size > 0) {
        const profiles = await getUserProfiles(Array.from(userIds));
        const profilesMap = {};
        profiles.forEach((p) => {
          profilesMap[p.uid] = p;
        });
        setUserProfiles(profilesMap);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, [tripId, tripKey]);

  // Group items by day number for day-based filtering
  const itemsByDay = useMemo(() => {
    const grouped = {};
    items.forEach((item) => {
      if (!grouped[item.day]) {
        grouped[item.day] = [];
      }
      grouped[item.day].push(item);
    });
    return grouped;
  }, [items]);

  // Get sorted list of days that have scrapbook content
  const daysWithContent = useMemo(() => {
    return Object.keys(itemsByDay)
      .map(Number)
      .sort((a, b) => a - b);
  }, [itemsByDay]);

  // Auto-select first day with content when days are loaded
  useEffect(() => {
    if (daysWithContent.length > 0 && !selectedDay) {
      setSelectedDay(daysWithContent[0]);
    }
  }, [daysWithContent, selectedDay]);

  /**
   * Calculates and formats the date for a given day number based on trip start date
   * @param {number} dayNum - Day number (1-indexed)
   * @returns {string|null} Formatted date string or null if trip has no start date
   */
  const getDayDate = (dayNum) => {
    if (!trip?.startDate) return null;
    const startDate = trip.startDate?.toDate ? trip.startDate.toDate() : new Date(trip.startDate);
    const dayDate = new Date(startDate);
    // Calculate date by adding (dayNum - 1) days to start date
    dayDate.setDate(startDate.getDate() + (dayNum - 1));
    return dayDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  /**
   * Gets display name for a user by their UID
   * @param {string} uid - User ID
   * @returns {string} User display name or "Unknown" if not found
   */
  const getUserName = (uid) => {
    if (!uid) return "Unknown";
    const profile = userProfiles[uid];
    return getUserDisplayName(profile || { uid });
  };

  /**
   * Checks if a URL points to a video file based on file extension
   * @param {string} url - Media URL to check
   * @returns {boolean} True if URL appears to be a video
   */
  const isVideo = (url) => {
    if (!url) return false;
    const videoExtensions = [".mp4", ".mov", ".webm", ".avi"];
    return videoExtensions.some((ext) => url.toLowerCase().includes(ext));
  };

  /**
   * Renders a grid of media items (images and videos) from an array of URLs
   * @param {Array} mediaUrls - Array of media URLs to display
   * @returns {JSX.Element|null} Grid of media items or null if no URLs provided
   */
  const renderMedia = (mediaUrls) => {
    if (!mediaUrls || mediaUrls.length === 0) return null;

    return (
      <div className="scrapbook-media-grid">
        {mediaUrls.map((url, index) => (
          <div key={index} className="scrapbook-media-item">
            {isVideo(url) ? (
              <video
                src={url}
                controls
                className="scrapbook-media"
                preload="metadata"
              >
                Your browser does not support the video tag.
              </video>
            ) : (
              <img
                src={url}
                alt={`Media ${index + 1}`}
                className="scrapbook-media"
                loading="lazy"
              />
            )}
          </div>
        ))}
      </div>
    );
  };

  const selectedItems = selectedDay ? itemsByDay[selectedDay] || [] : [];

  if (embedded) {
    return (
      <div className="scrapbook-embedded">
        <div className="scrapbook-header">
          <h3>Trip Scrapbook</h3>
        </div>

        {loading ? (
          <div className="scrapbook-loading">Loading scrapbook...</div>
        ) : daysWithContent.length === 0 ? (
          <div className="scrapbook-empty">
            <p>No notes or media yet.</p>
            <p className="scrapbook-empty-subtitle">
              Add notes and photos using the TripSync mobile app!
            </p>
          </div>
        ) : (
          <>
            {/* Day selector */}
            <div className="scrapbook-day-selector">
              {daysWithContent.map((day) => (
                <button
                  key={day}
                  className={`scrapbook-day-btn ${selectedDay === day ? "active" : ""}`}
                  onClick={() => setSelectedDay(day)}
                >
                  Day {day}
                  {trip?.dayLabels?.[day] && (
                    <span className="scrapbook-day-label"> — {trip.dayLabels[day]}</span>
                  )}
                  {trip?.startDate && (
                    <span className="scrapbook-day-date"> ({getDayDate(day)})</span>
                  )}
                </button>
              ))}
            </div>

            {/* Content for selected day */}
            <div className="scrapbook-content">
              {selectedItems.length === 0 ? (
                <div className="scrapbook-empty-day">
                  No notes or media for Day {selectedDay}.
                </div>
              ) : (
                <div className="scrapbook-items">
                  {selectedItems.map((item) => {
                    return (
                      <div key={item.id} className="scrapbook-item">
                        <div className="scrapbook-item-header">
                          <h4 className="scrapbook-item-title">{item.title || "Untitled Stop"}</h4>
                          {item.address && (
                            <p className="scrapbook-item-address">{item.address}</p>
                          )}
                        </div>

                        {/* Merged notes from all users */}
                        {item.notes && item.notes.length > 0 && (
                          <div className="scrapbook-item-notes">
                            {item.notes.map((noteEntry, idx) => {
                              const authorName = getUserName(noteEntry.author);
                              
                              return (
                                <div key={idx} className="scrapbook-note-entry">
                                  <p className="scrapbook-note-text">{noteEntry.text}</p>
                                  {authorName && (
                                    <div className="scrapbook-note-meta">
                                      <span className="scrapbook-note-author">
                                        — {authorName}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Merged media from all users */}
                        {item.mediaUrls && item.mediaUrls.length > 0 && (
                          <div className="scrapbook-item-media">
                            {renderMedia(item.mediaUrls)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="scrapbook-overlay" onClick={onClose}>
      <div className="scrapbook-panel" onClick={(e) => e.stopPropagation()}>
        <div className="scrapbook-header">
          <h3>Trip Scrapbook</h3>
          <button className="scrapbook-close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        {loading ? (
          <div className="scrapbook-loading">Loading scrapbook...</div>
        ) : daysWithContent.length === 0 ? (
          <div className="scrapbook-empty">
            <p>No notes or media yet.</p>
            <p className="scrapbook-empty-subtitle">
              Add notes and photos using the TripSync mobile app!
            </p>
          </div>
        ) : (
          <>
            {/* Day selector */}
            <div className="scrapbook-day-selector">
              {daysWithContent.map((day) => (
                <button
                  key={day}
                  className={`scrapbook-day-btn ${selectedDay === day ? "active" : ""}`}
                  onClick={() => setSelectedDay(day)}
                >
                  Day {day}
                  {trip?.dayLabels?.[day] && (
                    <span className="scrapbook-day-label"> — {trip.dayLabels[day]}</span>
                  )}
                  {trip?.startDate && (
                    <span className="scrapbook-day-date"> ({getDayDate(day)})</span>
                  )}
                </button>
              ))}
            </div>

            {/* Content for selected day */}
            <div className="scrapbook-content">
              {selectedItems.length === 0 ? (
                <div className="scrapbook-empty-day">
                  No notes or media for Day {selectedDay}.
                </div>
              ) : (
                <div className="scrapbook-items">
                  {selectedItems.map((item) => {
                    return (
                      <div key={item.id} className="scrapbook-item">
                        <div className="scrapbook-item-header">
                          <h4 className="scrapbook-item-title">{item.title || "Untitled Stop"}</h4>
                          {item.address && (
                            <p className="scrapbook-item-address">{item.address}</p>
                          )}
                        </div>

                        {/* Merged notes from all users */}
                        {item.notes && item.notes.length > 0 && (
                          <div className="scrapbook-item-notes">
                            {item.notes.map((noteEntry, idx) => {
                              const authorName = getUserName(noteEntry.author);
                              
                              return (
                                <div key={idx} className="scrapbook-note-entry">
                                  <p className="scrapbook-note-text">{noteEntry.text}</p>
                                  {authorName && (
                                    <div className="scrapbook-note-meta">
                                      <span className="scrapbook-note-author">
                                        — {authorName}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Merged media from all users */}
                        {item.mediaUrls && item.mediaUrls.length > 0 && (
                          <div className="scrapbook-item-media">
                            {renderMedia(item.mediaUrls)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

