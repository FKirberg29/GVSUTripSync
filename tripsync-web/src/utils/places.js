/**
 * Google Places API Helper Utilities
 * 
 * Provides utilities for working with Google Places API data, including
 * display name extraction, place title resolution, and place information
 * fetching. Used across trip detail and map components.
 */

/**
 * Extracts display name from various Google Places API response formats
 * Handles string values, object with text property, or plain objects
 * @param {string|Object} x - Display name value (can be string or object)
 * @returns {string} Extracted display name or empty string
 */
export function extractDisplayName(x) {
  if (!x) return "";
  if (typeof x === "string") return x.trim();
  if (typeof x === "object") {
    if (typeof x.text === "string") return x.text.trim();
    const s = String(x);
    return s === "[object Object]" ? "" : s.trim();
  }
  return String(x).trim();
}

/**
 * Resolves place title from place details object
 * Falls back through displayName, name, formattedAddress, or "Untitled"
 * @param {Object} details - Place details object with displayName, name, or formattedAddress
 * @returns {string} Resolved place title
 */
export function resolvePlaceTitle(details) {
  const dn = extractDisplayName(details?.displayName);
  if (dn) return dn;
  const alt = extractDisplayName(details?.name);
  if (alt) return alt;
  const addr = String(details?.formattedAddress ?? "").trim();
  return addr || "Untitled";
}

/**
 * Fetches canonical place information using Google Places API
 * Retrieves basic place details including display name, address, and location
 * @param {string} placeId - Google Place ID
 * @returns {Promise<Object|null>} Place info object or null if API unavailable
 */
export async function getCanonicalPlaceInfo(placeId) {
  const Place = window.google?.maps?.places?.Place;
  if (!Place) return null;

  const place = new Place({ id: placeId, requestedLanguage: "en" });
  await place.fetchFields({
    fields: ["id", "displayName", "formattedAddress", "location"],
  });

  const pos = place.location
    ? { lat: place.location.lat(), lng: place.location.lng() }
    : null;

  return {
    id: place.id,
    displayName: extractDisplayName(place.displayName),
    formattedAddress: place.formattedAddress ?? "",
    location: pos,
  };
}

/**
 * Fetches complete place information using new Google Places API
 * Retrieves comprehensive place details including rating, reviews, and types
 * @param {string} placeId - Google Place ID
 * @returns {Promise<Object|null>} Complete place details object or null if API unavailable
 */
export async function fetchWithNew(placeId) {
  const Place = window.google?.maps?.places?.Place;
  if (!Place) return null;
  const place = new Place({ id: placeId, requestedLanguage: "en" });
  await place.fetchFields({
    fields: [
      "id",
      "displayName",
      "formattedAddress",
      "location",
      "rating",
      "userRatingCount",
      "types",
    ],
  });
  const pos = place.location
    ? { lat: place.location.lat(), lng: place.location.lng() }
    : null;
  return {
    id: place.id,
    displayName: extractDisplayName(place.displayName),
    formattedAddress: place.formattedAddress ?? "",
    location: pos,
    rating: place.rating ?? null,
    userRatingCount: place.userRatingCount ?? null,
    types: place.types ?? [],
  };
}


