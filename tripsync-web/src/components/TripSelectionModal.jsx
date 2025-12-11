/**
 * TripSelectionModal Component
 * 
 * Modal dialog for selecting a trip from the user's trips.
 * Displays a searchable list of trips the user is a member of, with support for decrypting trip names.
 */

import React, { useState, useEffect } from "react";
import { db, auth } from "../firebaseConfig";
import { collection, query, where, getDocs } from "firebase/firestore";
import { getTripEncryptionKey } from "../utils/tripKeys.js";
import { decrypt } from "../utils/encryption.js";
import "./TripSelectionModal.css";

/**
 * Renders trip selection modal
 * @param {boolean} isOpen - Whether the modal is open
 * @param {Function} onClose - Callback function to close the modal
 * @param {Function} onSelect - Callback function called when a trip is selected, receives trip ID
 * @param {string} title - Modal title (default: "Select a Trip")
 */
export default function TripSelectionModal({ isOpen, onClose, onSelect, title = "Select a Trip" }) {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (!isOpen) return;

    async function loadTrips() {
      const uid = auth.currentUser?.uid;
      if (!uid) {
        setLoading(false);
        return;
      }

      try {
        const tripsRef = collection(db, "trips");
        const tripsQuery = query(tripsRef, where(`members.${uid}`, "==", true));
        const tripsSnap = await getDocs(tripsQuery);
        
        const tripsData = await Promise.all(
          tripsSnap.docs.map(async (doc) => {
            const data = doc.data();
            let tripName = data.name || "Untitled Trip";
            
            // Try to decrypt trip name if encrypted
            try {
              const tripKey = await getTripEncryptionKey(doc.id, uid);
              if (tripKey && data.encrypted && data.encryptedName && data.name) {
                tripName = await decrypt(data.name, tripKey);
              }
            } catch (error) {
              console.error("Error decrypting trip name:", error);
            }

            return {
              id: doc.id,
              name: tripName,
              category: data.category || null,
              startDate: data.startDate || null,
              endDate: data.endDate || null,
            };
          })
        );

        setTrips(tripsData);
      } catch (error) {
        console.error("Error loading trips:", error);
      } finally {
        setLoading(false);
      }
    }

    loadTrips();
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredTrips = trips.filter((trip) =>
    trip.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  /**
   * Handles trip selection and closes the modal
   * @param {string} tripId - Selected trip ID
   */
  const handleSelect = (tripId) => {
    onSelect(tripId);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content trip-selection-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-body">
          {loading ? (
            <div className="modal-loading">Loading trips...</div>
          ) : trips.length === 0 ? (
            <div className="modal-empty">No trips found</div>
          ) : (
            <>
              <div className="trip-search">
                <input
                  type="text"
                  placeholder="Search trips..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="trip-search-input"
                />
              </div>
              
              <div className="trip-list">
                {filteredTrips.length === 0 ? (
                  <div className="modal-empty">No trips match your search</div>
                ) : (
                  filteredTrips.map((trip) => (
                    <div
                      key={trip.id}
                      className="trip-item"
                      onClick={() => handleSelect(trip.id)}
                    >
                      <div className="trip-item-name">{trip.name}</div>
                      <div className="trip-item-meta">
                        {trip.category && (
                          <span className="trip-item-category">{trip.category}</span>
                        )}
                        {trip.startDate && (
                          <span className="trip-item-date">
                            {new Date(trip.startDate.seconds * 1000).toLocaleDateString()}
                            {trip.endDate && ` - ${new Date(trip.endDate.seconds * 1000).toLocaleDateString()}`}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

