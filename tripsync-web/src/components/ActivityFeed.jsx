/**
 * ActivityFeed Component
 * 
 * Displays a feed of trip activities including itinerary changes, comments, and mentions.
 * Supports filtering by user and activity type, and displays encrypted activity messages after decryption.
 */

import React, { useState, useEffect } from "react";
import { db, auth } from "../firebaseConfig";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  limit as fsLimit,
} from "firebase/firestore";
import { getUserProfiles, getUserDisplayName } from "../utils/users.js";
import { decrypt } from "../utils/encryption.js";
import { getTripEncryptionKey } from "../utils/tripKeys.js";
import "./ActivityFeed.css";

const ACTIVITY_TYPES = [
  { value: "", label: "All Activities" },
  { value: "itinerary.add", label: "Added Items" },
  { value: "itinerary.remove", label: "Removed Items" },
  { value: "itinerary.move", label: "Moved Items" },
  { value: "itinerary.reorder", label: "Reordered Items" },
  { value: "comment.mention", label: "Mentions in Comments" },
  { value: "chat.mention", label: "Mentions in Chat" },
];

/**
 * Renders activity feed panel with filters
 * @param {string} tripId - Trip ID to load activities for
 * @param {Function} onClose - Callback function to close the activity feed
 */
export default function ActivityFeed({ tripId, onClose }) {
  const [activities, setActivities] = useState([]);
  const [activityProfiles, setActivityProfiles] = useState({});
  const [filterUser, setFilterUser] = useState("");
  const [filterType, setFilterType] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tripKey, setTripKey] = useState(null);
  const currentUserId = auth.currentUser?.uid;

  // Effect hook to load trip encryption key for decrypting activity messages
  useEffect(() => {
    if (!tripId || !currentUserId) return;

    const loadKey = async () => {
      try {
        const key = await getTripEncryptionKey(tripId, currentUserId);
        setTripKey(key);
      } catch (error) {
        console.error('Error loading encryption key:', error);
      }
    };

    loadKey();
  }, [tripId, currentUserId]);

  // Effect hook to load activities with real-time updates
  // Loads activity feed with optional history limit and decrypts encrypted activity messages
  useEffect(() => {
    if (!tripId) return;

    const actRef = collection(db, "trips", tripId, "activities");
    // Shows last 20 activities by default, or 100 if full history is requested
    const limit = showHistory ? 100 : 20;
    const q = query(actRef, orderBy("createdAt", "desc"), fsLimit(limit));
    
    // Sets up real-time listener for activity changes
    const unsub = onSnapshot(q, async (snap) => {
      // Processes each activity: decrypts message if encrypted
      const activitiesData = await Promise.all(
        snap.docs.map(async (d) => {
          const data = d.data();
          let message = data.message;

          // Decrypts activity message if encryption is enabled and key is available
          if (tripKey && data.encrypted && message) {
            try {
              message = await decrypt(message, tripKey);
            } catch (error) {
              console.error('Error decrypting activity message:', error);
              message = '[Encrypted message - decryption failed]';
            }
          }

          return {
            id: d.id,
            ...data,
            message,
          };
        })
      );
      setActivities(activitiesData);
      setLoading(false);

      // Loads user profiles for all activity actors to display names and avatars
      const userIds = [...new Set(activitiesData.map((a) => a.actorId).filter(Boolean))];
      if (userIds.length > 0) {
        const profiles = await getUserProfiles(userIds);
        const profilesMap = {};
        profiles.forEach((p) => {
          profilesMap[p.uid] = p;
        });
        setActivityProfiles(profilesMap);
      }
    });

    return () => unsub();
  }, [tripId, showHistory, tripKey]);

  // Computes unique users from activities for filter dropdown
  // Only includes users whose profiles have been loaded
  const availableUsers = React.useMemo(() => {
    const userIds = [...new Set(activities.map((a) => a.actorId).filter(Boolean))];
    return userIds.map((uid) => ({
      uid,
      profile: activityProfiles[uid],
    })).filter((u) => u.profile);
  }, [activities, activityProfiles]);

  // Filters activities by selected user and/or activity type
  const filteredActivities = React.useMemo(() => {
    let filtered = activities;

    // Filters by actor user ID if a user filter is selected
    if (filterUser) {
      filtered = filtered.filter((a) => a.actorId === filterUser);
    }

    // Filters by activity type if a type filter is selected
    if (filterType) {
      filtered = filtered.filter((a) => a.type === filterType);
    }

    return filtered;
  }, [activities, filterUser, filterType]);

  /**
   * Gets activity icon text based on activity type
   * @param {string} type - Activity type string
   * @returns {string} Icon text
   */
  function getActivityIcon(type) {
    if (type?.includes("add")) return "ADD";
    if (type?.includes("remove")) return "REMOVE";
    if (type?.includes("move") || type?.includes("reorder")) return "MOVE";
    if (type?.includes("mention")) return "MENTION";
    return "UPDATE";
  }
  
  /**
   * Gets CSS class for activity icon based on activity type
   * @param {string} type - Activity type string
   * @returns {string} CSS class name
   */
  function getActivityIconClass(type) {
    if (type?.includes("add")) return "activity-icon-add";
    if (type?.includes("remove")) return "activity-icon-remove";
    if (type?.includes("move") || type?.includes("reorder")) return "activity-icon-move";
    if (type?.includes("mention")) return "activity-icon-mention";
    return "activity-icon-update";
  }

  /**
   * Formats activity timestamp into human-readable relative time
   * @param {Object} createdAt - Firestore timestamp object
   * @returns {string} Formatted time string
   */
  function formatActivityTime(createdAt) {
    if (!createdAt?.toDate) return "Just now";
    const date = createdAt.toDate();
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  return (
    <div className="activity-feed-overlay">
      <div className="activity-feed-panel">
        <div className="activity-feed-header">
          <h3>Activity Feed</h3>
          <button className="activity-feed-close-btn" onClick={onClose} title="Close">
            ×
          </button>
        </div>

        <div className="activity-feed-filters">
          <div className="activity-feed-filter-group">
            <label>Filter by User:</label>
            <select
              value={filterUser}
              onChange={(e) => setFilterUser(e.target.value)}
              className="activity-feed-select"
            >
              <option value="">All Users</option>
              {availableUsers.map((user) => (
                <option key={user.uid} value={user.uid}>
                  {getUserDisplayName(user.profile)}
                </option>
              ))}
            </select>
          </div>

          <div className="activity-feed-filter-group">
            <label>Filter by Type:</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="activity-feed-select"
            >
              {ACTIVITY_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div className="activity-feed-filter-group">
            <label>
              <input
                type="checkbox"
                checked={showHistory}
                onChange={(e) => setShowHistory(e.target.checked)}
              />
              Show Full History
            </label>
          </div>

          {(filterUser || filterType) && (
            <button
              className="activity-feed-clear-btn"
              onClick={() => {
                setFilterUser("");
                setFilterType("");
              }}
            >
              Clear Filters
            </button>
          )}
        </div>

        <div className="activity-feed-list">
          {loading ? (
            <div className="activity-feed-empty">Loading activities...</div>
          ) : filteredActivities.length === 0 ? (
            <div className="activity-feed-empty">
              {activities.length === 0
                ? "No activities yet."
                : "No activities match the current filters."}
            </div>
          ) : (
            filteredActivities.map((activity) => {
              const profile = activityProfiles[activity.actorId];
              const isOwn = activity.actorId === currentUserId;

              return (
                <div
                  key={activity.id}
                  className={`activity-feed-item ${isOwn ? "activity-feed-item-own" : ""}`}
                >
                  <div className={`activity-feed-item-icon ${getActivityIconClass(activity.type)}`}>
                    {getActivityIcon(activity.type)}
                  </div>
                  <div className="activity-feed-item-content">
                    <div className="activity-feed-item-header">
                      {profile?.photoURL && (
                        <img
                          src={profile.photoURL}
                          alt=""
                          className="activity-feed-avatar"
                        />
                      )}
                      <div className="activity-feed-item-info">
                        <div className="activity-feed-author">
                          {getUserDisplayName(profile || { uid: activity.actorId })}
                        </div>
                        <div className="activity-feed-time">
                          {formatActivityTime(activity.createdAt)}
                        </div>
                      </div>
                    </div>
                    <div className="activity-feed-message">{activity.message}</div>
                    {activity.itemId && (
                      <div className="activity-feed-item-id">Item ID: {activity.itemId}</div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

