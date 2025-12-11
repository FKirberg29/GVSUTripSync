/**
 * Settings Screen Component
 * 
 * Allows users to manage application settings including temperature units,
 * theme selection, and notification preferences. Notification preferences
 * are synchronized across devices via Firestore.
 */

import { Link } from "react-router-dom";
import { useSettings } from "../contexts/SettingsContext";
import "./Settings.css";

/**
 * Settings screen component
 * 
 * @returns {JSX.Element} Settings page with temperature, theme, and notification options
 */
export default function Settings() {
  const { temperatureUnit, setTemperatureUnit, notificationPrefs, updateNotificationPrefs } = useSettings();

  /**
   * Handles toggling individual notification preferences
   * Updates notification preferences in Firestore via context
   * @param {string} key - Notification preference key to toggle
   */
  const handleNotificationToggle = (key) => {
    updateNotificationPrefs({
      ...notificationPrefs,
      [key]: !notificationPrefs[key],
    });
  };

  return (
    <div className="settings-page">
      <h1>Settings</h1>

      <div className="settings-section">
        <h2>Temperature Units</h2>
        <div className="settings-option">
          <label>
            <input
              type="radio"
              name="temperature"
              value="IMPERIAL"
              checked={temperatureUnit === "IMPERIAL"}
              onChange={(e) => setTemperatureUnit(e.target.value)}
            />
            <span>Fahrenheit (°F)</span>
          </label>
        </div>
        <div className="settings-option">
          <label>
            <input
              type="radio"
              name="temperature"
              value="METRIC"
              checked={temperatureUnit === "METRIC"}
              onChange={(e) => setTemperatureUnit(e.target.value)}
            />
            <span>Celsius (°C)</span>
          </label>
        </div>
      </div>

      <div className="settings-section">
        <h2>Appearance</h2>
        <Link to="/settings/theme" className="settings-link">
          <div className="settings-link-content">
            <span>Theme</span>
            <span className="settings-link-arrow">→</span>
          </div>
        </Link>
      </div>

      <div className="settings-section">
        <h2>Notifications</h2>
        <p className="settings-section-description">
          Choose which notifications you want to receive
        </p>
        <div className="notification-options">
          <div className="notification-option">
            <div className="notification-option-content">
              <div className="notification-option-label">
                <span className="main-label">Chat messages</span>
                <span className="sub-label">Get notified when someone sends a message in trip chats</span>
              </div>
            </div>
            <input
              type="checkbox"
              checked={notificationPrefs.chatMessages}
              onChange={() => handleNotificationToggle("chatMessages")}
              aria-label="Toggle chat messages notifications"
            />
          </div>
          <div className="notification-option">
            <div className="notification-option-content">
              <div className="notification-option-label">
                <span className="main-label">Mentions</span>
                <span className="sub-label">Get notified when someone mentions you (@username)</span>
              </div>
            </div>
            <input
              type="checkbox"
              checked={notificationPrefs.mentions}
              onChange={() => handleNotificationToggle("mentions")}
              aria-label="Toggle mentions notifications"
            />
          </div>
          <div className="notification-option">
            <div className="notification-option-content">
              <div className="notification-option-label">
                <span className="main-label">Friend requests</span>
                <span className="sub-label">Get notified when someone sends you a friend request</span>
              </div>
            </div>
            <input
              type="checkbox"
              checked={notificationPrefs.friendRequests}
              onChange={() => handleNotificationToggle("friendRequests")}
              aria-label="Toggle friend requests notifications"
            />
          </div>
          <div className="notification-option">
            <div className="notification-option-content">
              <div className="notification-option-label">
                <span className="main-label">Trip invites</span>
                <span className="sub-label">Get notified when someone invites you to a trip</span>
              </div>
            </div>
            <input
              type="checkbox"
              checked={notificationPrefs.tripInvites}
              onChange={() => handleNotificationToggle("tripInvites")}
              aria-label="Toggle trip invites notifications"
            />
          </div>
          <div className="notification-option">
            <div className="notification-option-content">
              <div className="notification-option-label">
                <span className="main-label">Comments</span>
                <span className="sub-label">Get notified when someone comments on itinerary items</span>
              </div>
            </div>
            <input
              type="checkbox"
              checked={notificationPrefs.comments}
              onChange={() => handleNotificationToggle("comments")}
              aria-label="Toggle comments notifications"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

