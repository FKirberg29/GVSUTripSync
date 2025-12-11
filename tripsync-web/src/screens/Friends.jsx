/**
 * Friends Screen Component
 * 
 * Manages friend relationships including sending/receiving friend requests,
 * searching for users, and viewing friend lists. Uses real-time Firestore
 * listeners to keep friend lists and request statuses synchronized.
 */

import React, { useEffect, useState } from "react";
import { auth, db, functions } from "../firebaseConfig";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  onSnapshot,
  query,
  where,
  doc,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { debounce, rateLimitedCall, rateLimiters } from "../utils/rateLimiting.js";
import { getUserProfiles, getUserDisplayName } from "../utils/users.js";
import "./Friends.css";

/**
 * Friends management screen component
 * 
 * @returns {JSX.Element} Friends page with search, friend lists, and request management
 */
export default function Friends() {
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const searchTimeoutRef = React.useRef(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  // Lists
  const [friends, setFriends] = useState([]);
  const [friendProfiles, setFriendProfiles] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [incomingProfiles, setIncomingProfiles] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [outgoingProfiles, setOutgoingProfiles] = useState([]);

  // Effect hook to monitor authentication state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, setUser);
    return () => unsub();
  }, []);

  // Effect hook for debounced user search
  // Triggers search after 500ms of no typing to prevent excessive API calls
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
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

  // Effect hook to set up real-time Firestore listeners for friends and requests
  // Loads friend list, incoming requests, and outgoing requests with real-time updates
  useEffect(() => {
    if (!user) {
      setFriends([]);
      setFriendProfiles([]);
      setIncoming([]);
      setIncomingProfiles([]);
      setOutgoing([]);
      setOutgoingProfiles([]);
      return;
    }

    // Sets up listener for user's friends collection
    const frRef = collection(db, "users", user.uid, "friends");
    const unFriends = onSnapshot(frRef, async (snap) => {
      const friendUids = snap.docs.map((d) => d.id);
      setFriends(friendUids);
      // Loads user profiles for all friends to display names and avatars
      const profiles = await getUserProfiles(friendUids);
      setFriendProfiles(profiles);
    });

    // Sets up listener for incoming pending friend requests
    const qIn = query(
      collection(db, "friendRequests"),
      where("toUid", "==", user.uid),
      where("status", "==", "pending")
    );
    const unIncoming = onSnapshot(qIn, async (snap) => {
      const requests = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setIncoming(requests);
      const fromUids = requests.map((r) => r.fromUid).filter(Boolean);
      // Loads profiles for users who sent requests
      const profiles = await getUserProfiles(fromUids);
      setIncomingProfiles(profiles);
    });

    // Sets up listener for outgoing pending friend requests
    const qOut = query(
      collection(db, "friendRequests"),
      where("fromUid", "==", user.uid),
      where("status", "==", "pending")
    );
    const unOutgoing = onSnapshot(qOut, async (snap) => {
      const requests = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setOutgoing(requests);
      const toUids = requests.map((r) => r.toUid).filter(Boolean);
      // Loads profiles for users who received requests
      const profiles = await getUserProfiles(toUids);
      setOutgoingProfiles(profiles);
    });

    return () => {
      unFriends();
      unIncoming();
      unOutgoing();
    };
  }, [user]);

  /**
   * Sends friend request by email address
   * Uses rate limiting to prevent excessive requests
   * @param {Event} e - Form submit event
   */
  async function sendRequest(e) {
    e.preventDefault();
    setError("");
    setOk("");
    if (!auth.currentUser) {
      setError("Please sign in first.");
      return;
    }
    try {
      setSending(true);
      // Refreshes ID token to ensure authentication is valid
      await auth.currentUser.getIdToken(true);
      const call = httpsCallable(functions, "sendFriendRequest");
      // Uses rate limiter to prevent excessive friend request calls
      const res = await rateLimitedCall(call, { toEmail: email.trim() }, rateLimiters.friendRequest);
      if (res?.data?.already) {
        setOk("Request already pending.");
      } else {
        setOk("Friend request sent.");
      }
      setEmail("");
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to send request.");
    } finally {
      setSending(false);
    }
  }

  /**
   * Responds to a friend request (accept or reject)
   * @param {string} requestId - Friend request document ID
   * @param {string} action - Response action: 'accept' or 'reject'
   */
  async function respond(requestId, action) {
    setError("");
    setOk("");
    if (!auth.currentUser) {
      setError("Please sign in first.");
      return;
    }
    try {
      // Refreshes ID token to ensure authentication is valid
      await auth.currentUser.getIdToken(true);
      const call = httpsCallable(functions, "respondToFriendRequest");
      await call({ requestId, action }); // 'accept' | 'reject'
      setOk(action === "accept" ? "Friend request accepted." : "Friend request rejected.");
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to respond to request.");
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
      const call = httpsCallable(functions, "searchUsers");
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
   * Sends friend request to a user from search results
   * @param {Object} userToAdd - User object from search results
   */
  async function sendRequestFromSearch(userToAdd) {
    if (!userToAdd?.email) return;
    setError("");
    setOk("");
    if (!auth.currentUser) {
      setError("Please sign in first.");
      return;
    }
    try {
      setSending(true);
      await auth.currentUser.getIdToken(true);
      const call = httpsCallable(functions, "sendFriendRequest");
      const res = await call({ toEmail: userToAdd.email });
      if (res?.data?.already) {
        setOk("Request already pending.");
      } else {
        setOk(`Friend request sent to ${getUserDisplayName(userToAdd)}.`);
      }
      setSearchTerm("");
      setSearchResults([]);
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to send request.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="friends-page">
      <h2>Friends</h2>

      {/* Search for friends */}
      <section className="friends-search">
        <h3>Search for Friends</h3>
        <div className="friends-search-input-group">
          <input
            placeholder="Search by name or email..."
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <button onClick={searchUsers} disabled={!user || searching || searchTerm.length < 2}>
            {searching ? "Searching…" : "Search"}
          </button>
        </div>

        {searchResults.length > 0 && (
          <div className="friends-search-results">
            <div className="friends-search-results-label">Search Results:</div>
            <ul className="friends-search-results-list">
              {searchResults.map((result) => {
                const isFriend = friends.includes(result.uid);
                const hasOutgoing = outgoing.some((r) => r.toUid === result.uid);
                const hasIncoming = incoming.some((r) => r.fromUid === result.uid);
                return (
                  <li key={result.uid} className="friends-search-result-item">
                    <div className="friends-search-result-info">
                      <div>
                        <span className="friends-search-result-name">
                          {getUserDisplayName(result)}
                        </span>
                        {result.displayName && result.email && (
                          <span className="friends-search-result-email">
                            ({result.email})
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      {isFriend ? (
                        <span className="friends-search-result-status">Already friends</span>
                      ) : hasOutgoing ? (
                        <span className="friends-search-result-status" style={{ color: "#666" }}>Request sent</span>
                      ) : hasIncoming ? (
                        <span className="friends-search-result-status" style={{ color: "#666" }}>Has pending request</span>
                      ) : (
                        <button
                          onClick={() => sendRequestFromSearch(result)}
                          disabled={sending}
                          className="friends-request-btn friends-request-btn-accept"
                          style={{ fontSize: 13, padding: "4px 12px" }}
                        >
                          {sending ? "Sending…" : "Send Request"}
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

      {/* Send request by email (legacy) */}
      <section className="friends-email-form">
        <h3>Or Send Request by Email</h3>
        <form onSubmit={sendRequest} className="friends-email-form-group">
          <input
            placeholder="Friend's email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button type="submit" disabled={!user || sending}>
            {sending ? "Sending…" : "Send Request"}
          </button>
        </form>
      </section>

      {error && (
        <div className="friends-message friends-message-error">
          {error}
        </div>
      )}
      {ok && (
        <div className="friends-message friends-message-success">
          {ok}
        </div>
      )}

      <section className="friends-section">
        <h3>Your Friends</h3>
        {friendProfiles.length === 0 ? (
          <div className="friends-empty">
            No friends yet. Search for friends above to send requests!
          </div>
        ) : (
          <ul className="friends-list">
            {friendProfiles.map((profile) => (
              <li key={profile.uid} className="friends-list-item">
                {profile.photoURL && (
                  <img
                    src={profile.photoURL}
                    alt=""
                    className="friends-list-item-avatar"
                  />
                )}
                <div className="friends-list-item-info">
                  <div className="friends-list-item-name">{getUserDisplayName(profile)}</div>
                  {profile.displayName && profile.email && (
                    <div className="friends-list-item-email">{profile.email}</div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="friends-section">
        <h3>Incoming Requests</h3>
        {incoming.length === 0 ? (
          <div className="friends-empty">
            No incoming requests.
          </div>
        ) : (
          <ul className="friends-list">
            {incoming.map((r) => {
              const profile = incomingProfiles.find((p) => p.uid === r.fromUid);
              return (
                <li key={r.id} className="friends-request-item incoming">
                  <div className="friends-request-info">
                    {profile?.photoURL && (
                      <img
                        src={profile.photoURL}
                        alt=""
                        className="friends-list-item-avatar"
                      />
                    )}
                    <div>
                      <div className="friends-list-item-name">
                        From: {profile ? getUserDisplayName(profile) : r.fromUid}
                      </div>
                      {profile?.email && (
                        <div className="friends-list-item-email">{profile.email}</div>
                      )}
                    </div>
                  </div>
                  <div className="friends-request-actions">
                    <button
                      onClick={() => respond(r.id, "accept")}
                      className="friends-request-btn friends-request-btn-accept"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => respond(r.id, "reject")}
                      className="friends-request-btn friends-request-btn-reject"
                    >
                      Reject
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="friends-section">
        <h3>Outgoing (Pending)</h3>
        {outgoing.length === 0 ? (
          <div className="friends-empty">
            No pending outgoing requests.
          </div>
        ) : (
          <ul className="friends-list">
            {outgoing.map((r) => {
              const profile = outgoingProfiles.find((p) => p.uid === r.toUid);
              return (
                <li key={r.id} className="friends-request-item outgoing">
                  {profile?.photoURL && (
                    <img
                      src={profile.photoURL}
                      alt=""
                      className="friends-list-item-avatar"
                    />
                  )}
                  <div className="friends-list-item-info">
                    <div className="friends-list-item-name">
                      To: {profile ? getUserDisplayName(profile) : r.toUid}
                    </div>
                    {profile?.email && (
                      <div className="friends-list-item-email">{profile.email}</div>
                    )}
                    <div className="friends-request-status">Pending</div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
