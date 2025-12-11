/**
 * NumberedMarkersAdvanced Component
 * 
 * Renders numbered advanced markers on Google Maps for itinerary items.
 * Uses Google Maps AdvancedMarkerElement API when available, with numbered pins
 * and different colors for active/inactive markers. Automatically updates markers
 * when items change or are reordered.
 */

import { useEffect, useRef } from "react";

const PIN_BG_DEFAULT = "#2A9D8F";
const PIN_BORDER_DEFAULT = "#1f7f74";
const PIN_BG_ACTIVE = "#e76f51";
const PIN_BORDER_ACTIVE = "#c95e43";

/**
 * Renders numbered advanced markers on the map
 * @param {Object} map - Google Maps map instance
 * @param {Array} items - Array of itinerary items to display as markers
 * @param {string} activePlaceId - Currently active place ID for highlighting
 * @param {Function} onMarkerClick - Callback when marker is clicked, receives item object
 */
export default function NumberedMarkersAdvanced({ map, items, activePlaceId, onMarkerClick }) {
  // Stores marker instances in a Map keyed by item ID for efficient updates
  const markersRef = useRef(new Map());

  // Effect hook to create, update, and remove numbered markers based on itinerary items
  // Manages marker lifecycle: creates new markers, updates existing ones, and removes deleted items
  useEffect(() => {
    if (!map || !window.google?.maps?.marker) return;
    const { AdvancedMarkerElement, PinElement } = google.maps.marker;

    // Filters items with valid locations and sorts by day and orderIndex for consistent numbering
    const validItems = (items || [])
      .filter((i) => i?.location?.lat != null && i?.location?.lng != null)
      .sort((a, b) => {
        // Sorts by day first, then by orderIndex within each day
        const dayA = a.day ?? 1;
        const dayB = b.day ?? 1;
        if (dayA !== dayB) return dayA - dayB;
        return (a.orderIndex ?? 0) - (b.orderIndex ?? 0);
      });

    // Updates existing markers or creates new ones for each valid item
    validItems.forEach((item, idx) => {
      const itemId = item.id;
      const existingMarker = markersRef.current.get(itemId);
      const pos = { lat: item.location.lat, lng: item.location.lng };
      const isActive = item.placeId === activePlaceId;

      if (existingMarker) {
        let needsUpdate = false;
        
        // Updates existing marker position if location has changed
        if (existingMarker.position?.lat !== pos.lat || existingMarker.position?.lng !== pos.lng) {
          existingMarker.position = pos;
          existingMarker.marker.position = pos;
          needsUpdate = true;
        }
        
        // Updates pin style if active state or marker number has changed
        const currentIsActive = existingMarker.isActive;
        const currentNumber = existingMarker.number;
        if (currentIsActive !== isActive || currentNumber !== idx + 1) {
          existingMarker.isActive = isActive;
          existingMarker.number = idx + 1;
          // Creates new pin element with updated style and number
          const newPin = new PinElement({
            glyphText: String(idx + 1),
            glyphColor: "#fff",
            background: isActive ? PIN_BG_ACTIVE : PIN_BG_DEFAULT,
            borderColor: isActive ? PIN_BORDER_ACTIVE : PIN_BORDER_DEFAULT,
            scale: 1.1,
          });
          existingMarker.marker.content = newPin.element;
          needsUpdate = true;
        }
      } else {
        // Creates new marker for item that doesn't have one yet
        const pin = new PinElement({
          glyphText: String(idx + 1),
          glyphColor: "#fff",
          background: isActive ? PIN_BG_ACTIVE : PIN_BG_DEFAULT,
          borderColor: isActive ? PIN_BORDER_ACTIVE : PIN_BORDER_DEFAULT,
          scale: 1.1,
        });

        const marker = new AdvancedMarkerElement({
          map,
          position: pos,
          content: pin.element,
          title: item.title || "",
        });

        // Sets up click handler to notify parent component
        marker.addListener("click", () => onMarkerClick?.(item));
        
        // Stores marker reference for future updates
        markersRef.current.set(itemId, {
          marker,
          position: pos,
          isActive,
          number: idx + 1,
        });
      }
    });

    // Removes markers for items that no longer exist in the itinerary
    const currentItemIds = new Set(validItems.map((i) => i.id));
    markersRef.current.forEach((markerData, itemId) => {
      if (!currentItemIds.has(itemId)) {
        // Removes marker from map by setting map to null
        markerData.marker.map = null;
        markersRef.current.delete(itemId);
      }
    });
  }, [map, items, activePlaceId, onMarkerClick]);

  // Effect hook to clean up all markers when component unmounts
  // Removes markers from map to prevent memory leaks
  useEffect(() => {
    return () => {
      markersRef.current.forEach((markerData) => {
        markerData.marker.map = null;
      });
      markersRef.current.clear();
    };
  }, []);

  return null;
}


