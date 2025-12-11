/**
 * MapPane Component
 * 
 * Google Maps component that displays itinerary items as markers with route polylines.
 * Includes place autocomplete search, click-to-select functionality, and support for both
 * standard markers and advanced markers depending on browser capabilities.
 */

import { useRef, useState } from "react";
import { GoogleMap, Marker } from "@react-google-maps/api";
import NumberedMarkersAdvanced from "./NumberedMarkersAdvanced.jsx";
import RoutePolyline from "./RoutePolyline.jsx";

/**
 * Renders Google Maps pane with itinerary markers and route
 * @param {boolean} isLoaded - Whether Google Maps is loaded
 * @param {Object} mapCenter - Map center coordinates { lat, lng }
 * @param {number} mapZoom - Initial zoom level
 * @param {Object} mapOptions - Google Maps options object
 * @param {Array} items - Array of itinerary items to display as markers
 * @param {string} activePlaceId - Currently active place ID
 * @param {Function} onActivePlaceChange - Callback when active place changes, receives place ID
 * @param {Object} detailsReqElRef - Ref to place details request element
 * @param {Function} setMapCenter - Function to update map center state
 * @param {Function} setMapZoom - Function to update map zoom state
 * @param {Function} fetchPlaceFields - Function to fetch place details, receives place ID
 * @param {Function} setSelectedPlace - Function to update selected place state
 */
export default function MapPane({
  isLoaded,
  mapCenter,
  mapZoom,
  mapOptions,
  items,
  activePlaceId,
  onActivePlaceChange,
  detailsReqElRef,
  setMapCenter,
  setMapZoom,
  fetchPlaceFields,
  setSelectedPlace,
}) {
  const mapRef = useRef(null);
  const [mapObj, setMapObj] = useState(null);
  const [supportsAdvMarkers, setSupportsAdvMarkers] = useState(false);

  /**
   * Callback function called when Google Map finishes loading
   * Sets up place autocomplete, checks for advanced markers support, and configures map click handlers
   * @param {Object} map - Google Maps map instance
   */
  const onMapLoad = (map) => {
    mapRef.current = map;
    setMapObj(map);

    // Checks if browser supports advanced markers API
    const advAvailable =
      !!window.google?.maps?.marker &&
      typeof map.getMapCapabilities === "function" &&
      !!map.getMapCapabilities()?.isAdvancedMarkersAvailable;
    setSupportsAdvMarkers(advAvailable);

    // Sets up Google Places Autocomplete search element
    (async () => {
      await google.maps.importLibrary("places");
      const Elem = google.maps.places.PlaceAutocompleteElement;
      if (!Elem) return;

      // Creates autocomplete element with location bias to current map center
      const placeAutocomplete = new Elem({ locationBias: mapCenter });

      // Creates container card and adds autocomplete to map controls
      const card = document.createElement("div");
      card.className = "td-gm-places-card";
      card.appendChild(placeAutocomplete);
      map.controls[google.maps.ControlPosition.TOP_RIGHT].push(card);

      /**
       * Handles place selection from autocomplete
       * Fetches place details, updates map view, and sets selected place
       */
      const handlePredictionSelect = async (placePrediction) => {
        try {
          const place = placePrediction.toPlace();
          // Fetches required place fields for details panel
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

          // Updates map view to center on selected place
          if (pos) {
            setMapCenter(pos);
            setMapZoom(15);
            map.panTo(pos);
            map.setZoom(15);
          }

          // Updates place details panel with selected place
          if (detailsReqElRef.current) {
            try {
              detailsReqElRef.current.place = place;
            } catch {
              // Falls back to place ID if place object assignment fails
              detailsReqElRef.current.place = place.id;
            }
          }

          // Extracts place details for state management
          const details = {
            displayName: String(place.displayName?.text || place.displayName || "").trim(),
            formattedAddress: place.formattedAddress ?? "",
            location: pos,
            rating: place.rating ?? null,
            userRatingCount: place.userRatingCount ?? null,
            types: place.types ?? [],
          };

          setSelectedPlace({ id: place.id, position: pos, details });
          onActivePlaceChange?.(place.id);
        } catch (err) {
          console.error("Autocomplete selection error:", err);
        }
      };

      // Sets up event listeners for autocomplete place selection
      placeAutocomplete.addEventListener("gmp-placeselect", (e) => {
        if (e.placePrediction) handlePredictionSelect(e.placePrediction);
      });
      placeAutocomplete.addEventListener("gmp-select", (e) => {
        if (e.placePrediction) handlePredictionSelect(e.placePrediction);
      });
    })();

    // Sets up map click handler to select places on the map
    map.addListener("click", async (event) => {
      if (!event.placeId) return;
      if (event.stop) event.stop();

      const pos = { lat: event.latLng.lat(), lng: event.latLng.lng() };

      // Updates place details panel with clicked place
      if (detailsReqElRef.current) {
        detailsReqElRef.current.place = event.placeId;
      }

      // Updates map view to center on clicked location
      setMapCenter(pos);
      setMapZoom(15);
      map.panTo(pos);
      map.setZoom(15);

      // Fetches place details for clicked place
      const d = await fetchPlaceFields(event.placeId);
      if (d) {
        setSelectedPlace({ id: d.id, details: d, position: pos });
        onActivePlaceChange?.(d.id);
      }
    });
  };

  return (
    <div className="td-card td-map-card">
      {isLoaded && (
        <GoogleMap
          onLoad={onMapLoad}
          mapContainerStyle={{ width: "100%", height: "100%" }}
          center={mapCenter}
          zoom={mapZoom}
          options={mapOptions}
        >
          {!supportsAdvMarkers &&
            items.map((i, idx) => (
              <Marker
                key={i.id}
                position={{ lat: i.location.lat, lng: i.location.lng }}
                title={i.title || ""}
                label={{ text: String(idx + 1), className: "td-trip-marker-label" }}
                onClick={() => {
                  const pos = { lat: i.location.lat, lng: i.location.lng };
                  if (mapRef.current) {
                    setMapCenter(pos);
                    setMapZoom(15);
                    mapRef.current.panTo(pos);
                    mapRef.current.setZoom(15);
                  }
                  if (detailsReqElRef.current) detailsReqElRef.current.place = i.placeId;
                  onActivePlaceChange?.(i.placeId);
                }}
              />
            ))}
        </GoogleMap>
      )}

      {mapObj && (
        <>
          {supportsAdvMarkers && (
            <NumberedMarkersAdvanced
              map={mapObj}
              items={items}
              activePlaceId={activePlaceId}
              onMarkerClick={(it) => {
                const pos = it.location ? { lat: it.location.lat, lng: it.location.lng } : null;
                if (pos && mapRef.current) {
                  setMapCenter(pos);
                  setMapZoom(15);
                  mapRef.current.panTo(pos);
                  mapRef.current.setZoom(15);
                }
                if (detailsReqElRef.current) detailsReqElRef.current.place = it.placeId;
                onActivePlaceChange?.(it.placeId);
              }}
            />
          )}
          <RoutePolyline map={mapObj} items={items} />
        </>
      )}
    </div>
  );
}


