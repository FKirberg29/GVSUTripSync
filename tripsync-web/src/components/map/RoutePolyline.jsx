/**
 * RoutePolyline Component
 * 
 * Draws a polyline route connecting all itinerary item locations on the Google Map.
 * Creates a geodesic path that follows the order of items in the array.
 */

import { useEffect } from "react";

/**
 * Renders route polyline connecting itinerary item locations
 * @param {Object} map - Google Maps map instance
 * @param {Array} items - Array of itinerary items with location coordinates
 */
export default function RoutePolyline({ map, items }) {
  useEffect(() => {
    if (!map || !window.google?.maps) return;

    const path = (items || [])
      .filter((i) => i?.location?.lat != null && i?.location?.lng != null)
      .map((i) => ({ lat: i.location.lat, lng: i.location.lng }));

    const poly = new google.maps.Polyline({
      path,
      geodesic: true,
      strokeOpacity: 0.9,
      strokeWeight: 3,
    });

    poly.setMap(map);
    return () => poly.setMap(null);
  }, [map, items]);

  return null;
}


