/**
 * WeatherOverlay Component
 * 
 * Displays detailed weather information for an itinerary item in a modal overlay.
 * Shows temperature, precipitation, humidity, UV index, sunrise/sunset times, and other weather details.
 */

import styles from "./WeatherOverlay.module.css";

/**
 * Renders weather details overlay for a trip stop
 * @param {string} itemTitle - Title of the itinerary item
 * @param {Object} wd - Weather data object with min, max, iconUri
 * @param {Object} enriched - Enriched weather data with conditionText, humidity, sunrise, sunset, uvIndex, precipType, precipChance
 * @param {string} tempUnit - Temperature unit to display (°C or °F)
 * @param {string} dateKey - Date key for the weather forecast
 * @param {string} source - Source of the weather data
 * @param {Function} onClose - Callback function to close the overlay
 */
export default function WeatherOverlay({ itemTitle, wd, enriched, tempUnit, dateKey, source, onClose }) {
  const display = {
    conditionText: enriched?.conditionText || "Weather details",
    humidity: enriched?.humidity,
    sunrise: enriched?.sunrise ? new Date(enriched.sunrise) : null,
    sunset: enriched?.sunset ? new Date(enriched.sunset) : null,
    uvIndex: enriched?.uvIndex,
    precipType: enriched?.precipType,
    precipChance: enriched?.precipChance,
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.card} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          {wd?.iconUri ? (
            <img alt="" src={wd.iconUri} className={styles.icon} />
          ) : null}
          <h3 style={{ margin: 0 }}>
            {itemTitle || "Stop"} • Low {wd?.min}{tempUnit} / High {wd?.max}{tempUnit}
          </h3>
          <button className="td-btn" onClick={onClose} style={{ marginLeft: "auto" }}>
            Close
          </button>
        </div>

        <div className={styles.content}>
          <div><strong>Overall:</strong> {display.conditionText}</div>

          <div className={styles.gridTwo}>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Temperature</div>
              <div>Min: {wd?.min}{tempUnit}</div>
              <div>Max: {wd?.max}{tempUnit}</div>
            </div>

            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Precipitation</div>
              <div>Type: {display.precipType ?? "—"}</div>
              <div>Chance: {display.precipChance != null ? `${Math.round(display.precipChance)}%` : "—"}</div>
            </div>
          </div>

          <div className={styles.metaRow}>
            <div><strong>Humidity:</strong> {display.humidity != null ? `${Math.round(display.humidity)}%` : "—"}</div>
            <div><strong>UV Index:</strong> {display.uvIndex != null ? display.uvIndex : "—"}</div>
            <div>
              <strong>Sunrise:</strong>{" "}
              {display.sunrise ? display.sunrise.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "—"}
            </div>
            <div>
              <strong>Sunset:</strong>{" "}
              {display.sunset ? display.sunset.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "—"}
            </div>
            <div className={styles.metaFooter}>
              <strong>Date:</strong> {dateKey || "—"} • Source: {source}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


