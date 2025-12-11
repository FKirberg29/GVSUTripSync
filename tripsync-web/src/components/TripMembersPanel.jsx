/**
 * TripMembersPanel Component
 * 
 * Panel for managing trip members, inviting friends, searching for users, and inviting by email.
 * Displays current trip members with their roles and provides functionality to invite new members
 * through friend lists, user search, or email invitations. Includes rate limiting for API calls.
 */

import React, { useEffect, useState } from "react";
import { auth, db } from "../firebaseConfig";
import { doc, onSnapshot, collection } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { debounce, rateLimitedCall, rateLimiters } from "../utils/rateLimiting.js";
import { getUserProfiles, getUserDisplayName } from "../utils/users.js";
import "./TripMembersPanel.css";

/**
 * Renders trip members management panel
 * @param {string} tripId - Trip ID to manage members for
 */
export default function TripMembersPanel({ tripId }) {
  const [trip, setTrip] = useState(null);
  const [memberProfiles, setMemberProfiles] = useState([]);
  const [friends, setFriends] = useState([]);
  const [friendProfiles, setFriendProfiles] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const searchTimeoutRef = React.useRef(null);
  const [email, setEmail] = useState("");
  const [inviteResult, setInviteResult] = useState(null);
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const fun = getFunctions();

  // Effect hook to load trip data and member profiles with real-time updates
  // Listens for trip changes and updates member list when roles change
  useEffect(() => {
    if (!auth.currentUser) return;
    
    const unsub = onSnapshot(doc(db, "trips", tripId), async (snap) => {
      const tripData = snap.data();
      setTrip(tripData);
      
      // Fetches profiles for all trip members based on roles
      if (tripData?.roles) {
        const memberUids = Object.keys(tripData.roles);
        const profiles = await getUserProfiles(memberUids);
        setMemberProfiles(profiles);
      } else {
        setMemberProfiles([]);
      }
    });
    return () => unsub();
  }, [tripId]);

  // Effect hook to load current user's friends list with real-time updates
  // Friends list is used to display users who can be invited to the trip
  useEffect(() => {
    if (!auth.currentUser) {
      setFriends([]);
      setFriendProfiles([]);
      return;
    }

    const frRef = collection(db, "users", auth.currentUser.uid, "friends");
    const unsub = onSnapshot(frRef, async (snap) => {
      const friendUids = snap.docs.map((d) => d.id);
      setFriends(friendUids);
      // Loads profiles for all friends to display names and avatars
      const profiles = await getUserProfiles(friendUids);
      setFriendProfiles(profiles);
    });
    return () => unsub();
  }, []);

  // Effect hook for debounced user search
  // Triggers search after 500ms of no typing to prevent excessive API calls
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    // Requires at least 2 characters before searching
    if (searchTerm.trim().length >= 2) {
      searchTimeoutRef.current = setTimeout(() => {
        searchUsers();
      }, 500);
    } else {
      setSearchResults([]);
    }
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchTerm]);

  /**
   * Invites a friend to the trip by their user ID
   * Calls Cloud Function with rate limiting to send the invitation
   * @param {string} friendUid - Friend user ID to invite
   */
  async function inviteFriend(friendUid) {
    if (!friendUid) return;
    setError("");
    setOk("");
    setInviting(true);
    try {
      // Refreshes ID token to ensure authentication is valid
      await auth.currentUser.getIdToken(true);
      const call = httpsCallable(fun, "inviteFriendToTrip");
      // Uses rate limiter to prevent excessive invitation requests
      await rateLimitedCall(call, { tripId, friendUid, role: "editor" }, rateLimiters.tripInvite);
      setOk("Friend invited to trip!");
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to invite friend.");
    } finally {
      setInviting(false);
    }
  }

  // Debounced search function to prevent excessive API calls
  // Waits 500ms after user stops typing before executing search
  const debouncedSearch = debounce(async (term) => {
    if (!term.trim() || term.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    setError("");
    try {
      // Refreshes ID token to ensure authentication is valid
      await auth.currentUser.getIdToken(true);
      const call = httpsCallable(fun, "searchUsers");
      // Uses rate limiter to prevent excessive search requests
      const res = await rateLimitedCall(call, { searchTerm: term.trim() }, rateLimiters.search);
      setSearchResults(res.data?.users || []);
    } catch (err) {
      console.error(err);
      setError(err.message || "Search failed.");
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, 500);

  /**
   * Triggers debounced user search with current search term
   */
  async function searchUsers() {
    debouncedSearch(searchTerm);
  }

  /**
   * Sends trip invitation by email address
   * Creates an invite token that can be shared via link
   */
  async function inviteByEmail() {
    if (!email) return;
    setError("");
    setOk("");
    setInviting(true);
    try {
      // Refreshes ID token to ensure authentication is valid
      await auth.currentUser.getIdToken(true);
      const call = httpsCallable(fun, "inviteByEmailToTrip");
      // Uses rate limiter to prevent excessive invitation requests
      const resp = await rateLimitedCall(call, { tripId, email, role: "editor" }, rateLimiters.tripInvite);
      
      // Extracts invite token and creates shareable link
      const { token } = resp.data || {};
      setInviteResult({ token, link: `${window.location.origin}/accept?tripId=${tripId}&token=${token}` });
      setEmail("");
      setOk("Invite sent! Share the link below.");
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to send invite.");
    } finally {
      setInviting(false);
    }
  }

  const memberUids = trip?.roles ? Object.keys(trip.roles) : [];
  const isMember = (uid) => memberUids.includes(uid);

  return (
    <div className="trip-members-panel">
      {/* Members List */}
      <section className="trip-members-section">
        <h3>Trip Members</h3>
        {memberProfiles.length === 0 ? (
          <div className="trip-members-empty">No members yet.</div>
        ) : (
          <ul className="trip-members-list">
            {memberProfiles.map((profile) => {
              const role = trip?.roles?.[profile.uid] || "viewer";
              return (
                <li key={profile.uid} className="trip-members-item">
                  {profile.photoURL && (
                    <img
                      src={profile.photoURL}
                      alt=""
                      className="trip-members-avatar"
                    />
                  )}
                  <div className="trip-members-info">
                    <div className="trip-members-name">{getUserDisplayName(profile)}</div>
                    {profile.displayName && profile.email && (
                      <div className="trip-members-email">{profile.email}</div>
                    )}
                  </div>
                  <div className={`trip-members-role trip-members-role-${role}`}>
                    {role}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {error && (
        <div className="trip-members-message trip-members-message-error">
          {error}
        </div>
      )}
      {ok && (
        <div className="trip-members-message trip-members-message-success">
          {ok}
        </div>
      )}

      {/* Search for friends to invite */}
      <section className="trip-members-search">
        <h3>Search for Friends to Invite</h3>
        <div className="trip-members-search-group">
          <input
            placeholder="Search by name or email..."
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <button onClick={searchUsers} disabled={searching || searchTerm.length < 2}>
            {searching ? "Searching…" : "Search"}
          </button>
        </div>

        {searchResults.length > 0 && (
          <div className="trip-members-search-results">
            <div className="trip-members-search-results-label">Search Results:</div>
            <ul className="trip-members-search-results-list">
              {searchResults.map((result) => {
                const alreadyMember = isMember(result.uid);
                return (
                  <li key={result.uid} className="trip-members-search-result-item">
                    <div className="trip-members-search-result-info">
                      <div>
                        <span className="trip-members-search-result-name">
                          {getUserDisplayName(result)}
                        </span>
                        {result.displayName && result.email && (
                          <span className="trip-members-search-result-email">
                            ({result.email})
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      {alreadyMember ? (
                        <span className="trip-members-search-result-status">Already a member</span>
                      ) : (
                        <button
                          onClick={() => inviteFriend(result.uid)}
                          disabled={inviting}
                          className="trip-members-invite-btn"
                        >
                          {inviting ? "Inviting…" : "Invite"}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      {/* Your Friends List */}
      {friendProfiles.length > 0 && (
        <section className="trip-members-friends-section">
          <h3>Your Friends</h3>
          <ul className="trip-members-friends-list">
            {friendProfiles
              .filter((f) => !isMember(f.uid))
              .map((profile) => (
                <li key={profile.uid} className="trip-members-friend-item">
                  <div className="trip-members-friend-info">
                    {profile.photoURL && (
                      <img
                        src={profile.photoURL}
                        alt=""
                        className="trip-members-friend-avatar"
                      />
                    )}
                    <div className="trip-members-friend-details">
                      <div className="trip-members-friend-name">{getUserDisplayName(profile)}</div>
                      {profile.email && (
                        <div className="trip-members-friend-email">{profile.email}</div>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => inviteFriend(profile.uid)}
                    disabled={inviting}
                    className="trip-members-invite-btn"
                  >
                    {inviting ? "Inviting…" : "Invite"}
                  </button>
                </li>
              ))}
          </ul>
        </section>
      )}

      {/* Invite by Email */}
      <section className="trip-members-email-section">
        <h3>Or Invite by Email</h3>
        <div className="trip-members-email-group">
          <input
            placeholder="Email address"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button onClick={inviteByEmail} disabled={inviting || !email}>
            {inviting ? "Sending…" : "Send Invite"}
          </button>
        </div>

        {inviteResult && (
          <div className="trip-members-invite-result">
            <div className="trip-members-invite-result-label">Invite Link (for testing):</div>
            <a
              href={inviteResult.link}
              target="_blank"
              rel="noopener noreferrer"
              className="trip-members-invite-result-link"
            >
              {inviteResult.link}
            </a>
            <div className="trip-members-invite-result-token">
              Token: {inviteResult.token}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
