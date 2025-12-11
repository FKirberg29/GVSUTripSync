/**
 * PlaceDetailsPane Component
 * 
 * Displays Google Maps Place Details for a selected place using the Google Maps Place Details web component.
 * Shows place information and provides a button to add the place to the itinerary for the selected day.
 */

export default function PlaceDetailsPane({
  activePlaceId,
  selectedDay,
  addPlaceToItinerary,
  detailsElRef,
  detailsReqElRef,
}) {
  return (
    <div className="td-card td-details-card">
      <div className="td-card-header">
        <h3 className="td-card-title">Place Details</h3>
      </div>

      <div className="td-details-scroll">
        <gmp-place-details ref={detailsElRef} className="td-details-host">
          <gmp-place-details-place-request ref={detailsReqElRef}></gmp-place-details-place-request>
          <gmp-place-all-content></gmp-place-all-content>
        </gmp-place-details>
      </div>

      <div className="td-details-footer">
        <div className="td-hint">
          {activePlaceId
            ? "Selected place is highlighted on the map and list."
            : "Select a place via search, map, or list to view details."}
        </div>

        <button
          onClick={addPlaceToItinerary}
          className="td-btn td-btn-primary"
          title={`Add this place to the itinerary (Day ${selectedDay})`}
        >
          Add to Itinerary (Day {selectedDay})
        </button>
      </div>
    </div>
  );
}


